// Animates the Stajnia's mounts trotting, with PixelLab (pixellab.ai): each
// mount, drawn once from the side by Retro Diffusion (art/mounts.json: its
// start frame on a canvas with room for the legs), moves in the frames of
// a seamless trot (animate-with-text-v3). The riders are put on these frames
// afterwards (tools/ride-sheets.py). Run by the "Grafiki (szkice)" workflow
// (kind mounts-pixellab), which keeps the drafts on the art-drafts branch,
// each frame as a PNG of its own (-1, -2…):
//   node tools/animate-mounts.mjs --ids pony,horse --variants 2 --max-cost 1 [--dry-run]
// The run stops before its animations could cost more than --max-cost
// dollars (one is a few generations of PixelLab, at most JOB_USD).

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { parseArgs } from 'node:util';

const API = 'https://api.pixellab.ai/v2';
const POLL_MS = 5000;
const POLL_LIMIT = 120;
const JOB_USD = 0.1;

const { values } = parseArgs({
  options: {
    ids: { type: 'string', default: 'all' },
    variants: { type: 'string', default: '1' },
    'max-cost': { type: 'string', default: '1' },
    'dry-run': { type: 'boolean', default: false },
  },
});

function fail(message) {
  console.log(`::error::${message}`);
  process.exit(1);
}

function summary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

const token = process.env.PIXELLAB_API_KEY;
if (!token) fail('Brak sekretu PIXELLAB_API_KEY. Dodaj klucz PixelLab w ustawieniach repozytorium.');

const config = JSON.parse(readFileSync('art/mounts.json', 'utf8'));
const ids = values.ids === 'all' ? Object.keys(config.mounts) : values.ids.split(',').map((id) => id.trim()).filter(Boolean);
const unknown = ids.filter((id) => !config.mounts[id]);
if (unknown.length) fail(`Brak wierzchowca w art/mounts.json: ${unknown.join(', ')}.`);
const variants = Math.max(1, Math.min(4, Number(values.variants) || 1));
const maxCost = Number(values['max-cost']);
if (!(maxCost > 0)) fail('--max-cost musi być dodatnią kwotą w dolarach.');
const maxJobs = Math.floor(maxCost / JOB_USD);

const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

async function request(method, path, body) {
  const response = await fetch(`${API}${path}`, { method, headers, body: body && JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`PixelLab odpowiedział ${response.status}: ${JSON.stringify(data ?? {}).slice(0, 400)}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function animate(id, seed) {
  const mount = config.mounts[id];
  const body = {
    first_frame: { type: 'base64', base64: readFileSync(mount.start).toString('base64'), format: 'png' },
    action: mount.action ?? config.action,
    frame_count: mount.frames ?? config.frames,
    seed,
    no_background: true,
  };
  let job;
  for (let attempt = 0; ; attempt++) {
    try {
      job = await request('POST', '/animate-with-text-v3', body);
      break;
    } catch (error) {
      if (error.status !== 429 || attempt >= 20) throw error;
      await wait(30000);
    }
  }
  for (let attempt = 0; attempt < POLL_LIMIT; attempt++) {
    await wait(POLL_MS);
    const state = await request('GET', `/background-jobs/${job.background_job_id}`);
    if (state.status === 'failed') throw new Error(`animacja nie powiodła się: ${JSON.stringify(state.last_response ?? {}).slice(0, 300)}`);
    if (state.status === 'completed') return { state, body };
  }
  throw new Error(`animacja trwa zbyt długo (zadanie ${job.background_job_id})`);
}

const outDir = 'art/drafts/mounts-pixellab';
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
const lines = [];
const failed = [];
const jobs = ids.flatMap((id) => Array.from({ length: variants }, () => id)).slice(0, maxJobs);
const skipped = ids.length * variants - jobs.length;

if (values['dry-run']) {
  for (const id of jobs) lines.push(`| ${id} | do zrobienia (start: ${config.mounts[id].start}) |`);
} else {
  const queue = [...jobs];
  async function worker() {
    while (queue.length) {
      const id = queue.shift();
      const seed = randomInt(1, 2 ** 31);
      try {
        const { state, body } = await animate(id, seed);
        const images = state.last_response?.images ?? [];
        images.forEach((image, index) => writeFileSync(`${outDir}/${id}-${stamp}-${seed}-${index + 1}.png`, Buffer.from(image.base64, 'base64')));
        const sent = { ...body, first_frame: config.mounts[id].start };
        writeFileSync(`${outDir}/${id}-${stamp}-${seed}.json`, `${JSON.stringify({ id, payload: sent, usage: state.usage ?? null, frames: images.length }, null, 2)}\n`);
        const usage = state.usage ? `${state.usage.type === 'usd' ? `${Number(state.usage.usd).toFixed(3)} USD` : JSON.stringify(state.usage)}` : '';
        lines.push(`| ${id} | ${images.length} klatek ${usage} |`);
      } catch (error) {
        failed.push(id);
        lines.push(`| ${id} | błąd: ${error.message} |`);
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
}

summary(
  [
    `## Animacje wierzchowców (PixelLab)${values['dry-run'] ? ' (tylko sprawdzenie)' : ''}`,
    '',
    '| Wierzchowiec | Wynik |',
    '| --- | --- |',
    ...lines,
    ...(skipped ? ['', `Pominięte, bo przekroczyłyby limit ${maxCost} USD: ${skipped}.`] : []),
  ].join('\n'),
);
console.log(lines.join('\n'));
if (failed.length) {
  console.log(`::error::Nie udało się: ${failed.join(', ')}.`);
  process.exitCode = 1;
}

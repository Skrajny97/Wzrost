// Animates the mounts by posing them (PixelLab animate-with-skeleton-v3):
// the walk or trot is written as one skeleton per frame, the legs in the
// right order (tools/mount-gait.py), and PixelLab draws the mount from its
// start frame in each pose, so no leg skips a step. The text animations
// (tools/animate-mounts.mjs) had the legs drift out of step: the author saw
// the mounts limp.
//
// Two steps, both run by the "Grafiki (szkice)" workflow, which keeps the
// drafts on the art-drafts branch (art/drafts/mounts-skeleton):
//   --estimate: PixelLab reads the skeleton of each start frame
//     (estimate-skeleton): <id>-skeleton.json, 18 joints as fractions 0-1
//     of the picture (the four-legged templates put the front legs on the
//     arms' joints and the hind legs on the legs').
//   otherwise: art/mount-gaits.json (tools/mount-gait.py) gives, for each
//     mount, its first frame's skeleton and the skeletons of its frames;
//     the frames come back as <id>-<stamp>-<seed>-<n>.png.
//   node tools/animate-mounts-skeleton.mjs --ids pony,horse --variants 2 --max-cost 2 [--estimate] [--dry-run]
// The run stops before its animations could cost more than --max-cost
// dollars (one is a few generations of PixelLab, at most JOB_USD).

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { parseArgs } from 'node:util';

const API = 'https://api.pixellab.ai/v2';
const POLL_MS = 8000;
const POLL_LIMIT = 90;
const JOB_USD = 0.3;

const { values } = parseArgs({
  options: {
    ids: { type: 'string', default: 'all' },
    variants: { type: 'string', default: '1' },
    'max-cost': { type: 'string', default: '1' },
    estimate: { type: 'boolean', default: false },
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
if (!token && !values['dry-run']) fail('Brak sekretu PIXELLAB_API_KEY. Dodaj klucz PixelLab w ustawieniach repozytorium.');

const config = JSON.parse(readFileSync('art/mounts.json', 'utf8'));
const gaits = existsSync('art/mount-gaits.json') ? JSON.parse(readFileSync('art/mount-gaits.json', 'utf8')) : { mounts: {} };
const ids = values.ids === 'all' ? Object.keys(config.mounts) : values.ids.split(',').map((id) => id.trim()).filter(Boolean);
const unknown = ids.filter((id) => !config.mounts[id]);
if (unknown.length) fail(`Brak wierzchowca w art/mounts.json: ${unknown.join(', ')}.`);
if (!values.estimate) {
  const missing = ids.filter((id) => !gaits.mounts[id]);
  if (missing.length) fail(`Brak kroków w art/mount-gaits.json (tools/mount-gait.py): ${missing.join(', ')}.`);
}
const variants = Math.max(1, Math.min(4, Number(values.variants) || 1));
const maxCost = Number(values['max-cost']);
if (!(maxCost > 0)) fail('--max-cost musi być dodatnią kwotą w dolarach.');

const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

async function request(method, path, body) {
  const response = await fetch(`${API}${path}`, { method, headers, body: body && JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`PixelLab odpowiedział ${response.status}: ${JSON.stringify(data ?? {}).slice(0, 600)}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const image = (path) => ({ type: 'base64', base64: readFileSync(path).toString('base64'), format: 'png' });

const outDir = 'art/drafts/mounts-skeleton';
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
const lines = [];
const failed = [];

async function estimate(id) {
  const result = await request('POST', '/estimate-skeleton', { image: image(config.mounts[id].start) });
  writeFileSync(`${outDir}/${id}-skeleton.json`, `${JSON.stringify({ id, start: config.mounts[id].start, keypoints: result.keypoints, usage: result.usage ?? null }, null, 2)}\n`);
  lines.push(`| ${id} | szkielet: ${result.keypoints.length} punktów |`);
}

async function animate(id, seed) {
  const mount = config.mounts[id];
  const gait = gaits.mounts[id];
  const body = {
    description: mount.description,
    action: gait.action,
    direction: 'east',
    view: 'side',
    first_frame: image(mount.start),
    first_frame_keypoints: gait.first,
    keypoints: gait.frames,
    template_id: gait.template,
    seed,
    no_background: true,
  };
  let job;
  for (let attempt = 0; ; attempt++) {
    try {
      job = await request('POST', '/animate-with-skeleton-v3', body);
      break;
    } catch (error) {
      if (error.status !== 429 || attempt >= 20) throw error;
      await wait(30000);
    }
  }
  for (let attempt = 0; attempt < POLL_LIMIT; attempt++) {
    await wait(POLL_MS);
    const state = await request('GET', `/background-jobs/${job.background_job_id}`);
    if (state.status === 'failed') throw new Error(`animacja nie powiodła się: ${JSON.stringify(state.last_response ?? {}).slice(0, 400)}`);
    if (state.status === 'completed') {
      const images = state.last_response?.images ?? [];
      images.forEach((frame, index) => writeFileSync(`${outDir}/${id}-${stamp}-${seed}-${index + 1}.png`, Buffer.from(frame.base64, 'base64')));
      const sent = { ...body, first_frame: mount.start };
      writeFileSync(`${outDir}/${id}-${stamp}-${seed}.json`, `${JSON.stringify({ id, payload: sent, usage: state.usage ?? null, frames: images.length }, null, 2)}\n`);
      const usage = state.usage?.type === 'usd' ? `${Number(state.usage.usd).toFixed(3)} USD` : '';
      lines.push(`| ${id} | ${images.length} klatek ${usage} |`);
      return;
    }
  }
  throw new Error(`animacja trwa zbyt długo (zadanie ${job.background_job_id})`);
}

if (values['dry-run']) {
  for (const id of ids) lines.push(`| ${id} | do zrobienia (${values.estimate ? 'szkielet' : `${variants} wersje`}) |`);
} else if (values.estimate) {
  for (const id of ids) {
    try {
      await estimate(id);
    } catch (error) {
      failed.push(id);
      lines.push(`| ${id} | błąd: ${error.message} |`);
    }
  }
} else {
  const jobs = ids.flatMap((id) => Array.from({ length: variants }, () => id)).slice(0, Math.floor(maxCost / JOB_USD));
  const skipped = ids.length * variants - jobs.length;
  if (skipped) lines.push(`| | pominięte przez limit ${maxCost} USD: ${skipped} |`);
  const queue = [...jobs];
  async function worker() {
    while (queue.length) {
      const id = queue.shift();
      try {
        await animate(id, randomInt(1, 2 ** 31));
      } catch (error) {
        failed.push(id);
        lines.push(`| ${id} | błąd: ${error.message} |`);
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
}

summary(['## Wierzchowce według szkieletu (PixelLab)', '', '| Wierzchowiec | Wynik |', '| --- | --- |', ...lines].join('\n'));
console.log(lines.join('\n'));
if (failed.length) {
  console.log(`::error::Nie udało się: ${failed.join(', ')}.`);
  process.exitCode = 1;
}

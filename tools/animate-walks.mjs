// Animates the walks with PixelLab (pixellab.ai), a pixel-art generator that
// poses one drawing on a skeleton (DECISIONS.md, "Chody od zera"). Each
// character, drawn once from the side by Retro Diffusion (art/walks.json: its
// start frame and the key pose of tools/walk-skeleton.py it stands in), walks
// in the skeleton's frames (animate-with-skeleton-v3), so every frame keeps
// its look, its hands and what they hold, and the walk loops. Run by the
// "Grafiki (szkice)" workflow (kind walks-pixellab), which keeps the drafts
// on the art-drafts branch for review, each frame as a PNG of its own (-1, -2…):
//   node tools/animate-walks.mjs --ids warrior-female,inquisitor-male --variants 2 --max-cost 1 [--dry-run]
// The balance is read first, and the run stops before its animations could
// cost more than --max-cost dollars (one is 2-3 generations of PixelLab, at
// most JOB_USD).

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { parseArgs } from 'node:util';

const API = 'https://api.pixellab.ai/v2';
const POLL_MS = 8000;
// An animation takes 3-5 minutes; a queue for the GPU can add more.
const POLL_LIMIT = 150;
// The price list's dearest skeleton animation of up to 8 frames, with room.
const JOB_USD = 0.06;

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

const config = JSON.parse(readFileSync('art/walks.json', 'utf8'));
const skeleton = JSON.parse(readFileSync(config.skeleton, 'utf8'));
const ids = values.ids === 'all' ? Object.keys(config.characters) : values.ids.split(',').map((id) => id.trim()).filter(Boolean);
const unknown = ids.filter((id) => !config.characters[id]);
if (unknown.length) fail(`Brak postaci w art/walks.json: ${unknown.join(', ')}.`);
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
const describeBalance = (balance) =>
  [
    balance?.credits && `${Number(balance.credits.usd ?? 0).toFixed(2)} USD`,
    balance?.subscription && `${balance.subscription.generations}/${balance.subscription.total} generacji (${balance.subscription.plan ?? 'plan'})`,
  ]
    .filter(Boolean)
    .join(', ') || 'nieznane';

// The frames of the walk, in the order they play.
const strip = (pose) => pose.map(({ label, x, y, z_index }) => ({ label, x, y, z_index }));
const keypoints = skeleton.frames.map(strip);

// One animation: sent, then polled until PixelLab has drawn it. A full queue
// of jobs (429) waits and tries again.
async function animate(id, seed) {
  const character = config.characters[id];
  const body = {
    description: character.description,
    action: 'walk',
    direction: 'east',
    view: 'side',
    first_frame: { type: 'base64', base64: readFileSync(character.start).toString('base64'), format: 'png' },
    first_frame_keypoints: strip(skeleton.keys[character.pose - 1]),
    keypoints,
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
    if (state.status === 'failed') throw new Error(`animacja nie powiodła się: ${JSON.stringify(state.last_response ?? {}).slice(0, 300)}`);
    if (state.status === 'completed') return { state, body };
  }
  throw new Error(`animacja trwa zbyt długo (zadanie ${job.background_job_id})`);
}

const outDir = 'art/drafts/walks-pixellab';
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
const lines = [];
const failed = [];
const jobs = ids.flatMap((id) => Array.from({ length: variants }, () => id)).slice(0, maxJobs);
const skipped = ids.length * variants - jobs.length;

const before = await request('GET', '/balance');
if (values['dry-run']) {
  for (const id of jobs) lines.push(`| ${id} | do zrobienia (start: ${config.characters[id].start}, poza ${config.characters[id].pose}) |`);
} else {
  // Four at a time; when PixelLab's queue for the account is full (429), a
  // job waits and tries again.
  const queue = [...jobs];
  async function worker() {
    while (queue.length) {
      const id = queue.shift();
      const seed = randomInt(1, 2 ** 31);
      try {
        const { state, body } = await animate(id, seed);
        const images = state.last_response?.images ?? [];
        images.forEach((image, index) => writeFileSync(`${outDir}/${id}-${stamp}-${seed}-${index + 1}.png`, Buffer.from(image.base64, 'base64')));
        const sent = { ...body, first_frame: config.characters[id].start };
        writeFileSync(`${outDir}/${id}-${stamp}-${seed}.json`, `${JSON.stringify({ id, payload: sent, usage: state.usage ?? null, frames: images.length }, null, 2)}\n`);
        const usage = state.usage ? `${state.usage.type === 'usd' ? `${Number(state.usage.usd).toFixed(3)} USD` : JSON.stringify(state.usage)}` : '';
        lines.push(`| ${id} | ${images.length} klatki ${usage} |`);
      } catch (error) {
        failed.push(id);
        lines.push(`| ${id} | błąd: ${error.message} |`);
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
}
const after = values['dry-run'] ? before : await request('GET', '/balance').catch(() => null);

summary(
  [
    `## Animacje chodów (PixelLab)${values['dry-run'] ? ' (tylko sprawdzenie)' : ''}`,
    '',
    '| Postać | Wynik |',
    '| --- | --- |',
    ...lines,
    '',
    `Saldo przed: ${describeBalance(before)}. Po: ${describeBalance(after)}.`,
    ...(skipped ? [`Pominięte, bo przekroczyłyby limit ${maxCost} USD: ${skipped}.`] : []),
  ].join('\n'),
);
console.log(lines.join('\n'));
console.log(`Saldo przed: ${describeBalance(before)}. Po: ${describeBalance(after)}.`);
if (failed.length) {
  console.log(`::error::Nie udało się: ${failed.join(', ')}.`);
  process.exitCode = 1;
}

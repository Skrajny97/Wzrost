// Draws portrait drafts with PixelLab's Pro image generation
// (generate-image-v2; pixellab.ai), in place of Retro Diffusion where the
// author asked for it (DECISIONS.md, "Druga ewolucja: portrety z PixelLab").
// Each prompt of a kind in art/prompts.json is drawn at the kind's size on a
// transparent background, in the style of the kind's style image
// (pixellab.style: an approved portrait, for its pixel size, outline, shading
// and detail, not its colours), with up to four subject references of its
// own (pixellab.references[id]: for example the approved other half of a
// man-and-woman pair, so both wear the same). One call gives four versions at
// the portraits' 96 x 128. Run by the "Grafiki (szkice)" workflow (kind
// evolutions-pixellab), which keeps the drafts on the art-drafts branch:
//   node tools/generate-portraits-pixellab.mjs --kind evolutions --ids a,b [--calls 1] [--max-cost 1] [--dry-run]
// The balance is read first, and the run stops before its calls could cost
// more than --max-cost dollars (one call at most CALL_USD).

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { parseArgs } from 'node:util';

const API = 'https://api.pixellab.ai/v2';
const POLL_MS = 6000;
const POLL_LIMIT = 100;
// A Pro image call of four 96 x 128 versions, with room.
const CALL_USD = 0.1;

const { values } = parseArgs({
  options: {
    kind: { type: 'string', default: 'evolutions' },
    ids: { type: 'string', default: '' },
    calls: { type: 'string', default: '1' },
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

const kind = JSON.parse(readFileSync('art/prompts.json', 'utf8'))[values.kind];
if (!kind?.prompts) fail(`Nie ma rodzaju „${values.kind}” w art/prompts.json.`);
const settings = kind.pixellab ?? {};
const ids = values.ids.split(',').map((id) => id.trim()).filter(Boolean);
if (!ids.length) fail('Podaj --ids.');
const unknown = ids.filter((id) => !kind.prompts[id]);
if (unknown.length) fail(`Brak opisów w art/prompts.json (${values.kind}): ${unknown.join(', ')}.`);
const calls = Math.max(1, Math.min(3, Number(values.calls) || 1));
const maxCost = Number(values['max-cost']);
if (!(maxCost > 0)) fail('--max-cost musi być dodatnią kwotą w dolarach.');
const maxCalls = Math.floor(maxCost / CALL_USD);

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

const width = kind.width;
const height = kind.height;
const png = (path) => ({ type: 'base64', base64: readFileSync(path).toString('base64'), format: 'png' });
const reference = (path) => ({ image: png(path), size: { width, height } });
const promptOf = (id) => (typeof kind.prompts[id] === 'string' ? kind.prompts[id] : kind.prompts[id].prompt);

// One call: sent, then polled until PixelLab has drawn its four versions. A
// full queue of jobs (429) waits and tries again.
async function draw(id, seed) {
  const refs = settings.references?.[id] ?? [];
  const body = {
    description: promptOf(id),
    image_size: { width, height },
    seed,
    no_background: true,
    ...(settings.style && {
      style_image: reference(settings.style),
      style_options: { color_palette: false, outline: true, detail: true, shading: true },
    }),
    ...(refs.length && { reference_images: refs.slice(0, 4).map((path) => ({ ...reference(path), usage_description: 'the same character and outfit, the other gender' })) }),
  };
  let job;
  for (let attempt = 0; ; attempt++) {
    try {
      job = await request('POST', '/generate-image-v2', body);
      break;
    } catch (error) {
      if (error.status !== 429 || attempt >= 20) throw error;
      await wait(30000);
    }
  }
  for (let attempt = 0; attempt < POLL_LIMIT; attempt++) {
    await wait(POLL_MS);
    const state = await request('GET', `/background-jobs/${job.background_job_id}`);
    if (state.status === 'failed') throw new Error(`rysowanie nie powiodło się: ${JSON.stringify(state.last_response ?? {}).slice(0, 300)}`);
    if (state.status === 'completed') return { state, refs };
  }
  throw new Error(`rysowanie trwa zbyt długo (zadanie ${job.background_job_id})`);
}

const outDir = `art/drafts/${values.kind}`;
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
const lines = [];
const failed = [];
const jobs = ids.flatMap((id) => Array.from({ length: calls }, () => id)).slice(0, maxCalls);
const skipped = ids.length * calls - jobs.length;

const before = await request('GET', '/balance');
if (values['dry-run']) {
  for (const id of jobs) lines.push(`| ${id} | do zrobienia (wzór: ${settings.style ?? 'brak'}, odniesienia: ${(settings.references?.[id] ?? []).length}) |`);
} else {
  const queue = [...jobs];
  async function worker() {
    while (queue.length) {
      const id = queue.shift();
      const seed = randomInt(1, 2 ** 31);
      try {
        const { state, refs } = await draw(id, seed);
        const result = state.last_response ?? {};
        const images = result.images ?? (result.image ? [result.image] : []);
        images.forEach((image, index) => writeFileSync(`${outDir}/${id}-${stamp}-${seed}-${index}.png`, Buffer.from(image.base64, 'base64')));
        writeFileSync(
          `${outDir}/${id}-${stamp}-${seed}.json`,
          `${JSON.stringify({ id, tool: 'pixellab generate-image-v2', description: promptOf(id), style: settings.style ?? null, references: refs, usage: state.usage ?? null, images: images.length }, null, 2)}\n`,
        );
        const usage = state.usage ? (state.usage.type === 'usd' ? `${Number(state.usage.usd).toFixed(3)} USD` : JSON.stringify(state.usage)) : '';
        lines.push(`| ${id} | ${images.length} obrazki ${usage} |`);
      } catch (error) {
        failed.push(id);
        lines.push(`| ${id} | błąd: ${error.message} |`);
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
}
const after = values['dry-run'] ? before : await request('GET', '/balance').catch(() => null);

summary(
  [
    `## Portrety (PixelLab)${values['dry-run'] ? ' (tylko sprawdzenie)' : ''}`,
    '',
    '| Portret | Wynik |',
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

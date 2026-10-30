// Draws sprite drafts with Retro Diffusion, a pixel-art image generator.
// Run by the "Grafiki (szkice)" workflow, which keeps the drafts on the
// art-drafts branch for review:
//   node tools/generate-art.mjs --kind monsters --ids wolf,boar --variants 2 --max-cost 2
//     [--style rd_pro__fantasy] [--seed 7] [--dry-run]
// Prompts, styles and sizes are in art/prompts.json; a prompt given as
// { prompt, style } draws in its own style. The approved sprites listed
// there as references (art/references/<kind>/<id>.png) keep the style of the new
// ones consistent. A kind with `animation` draws looping animations, one at a
// time, each as a PNG sheet of its frames; a prompt with `startFrame` (a PNG
// in the repository) moves that picture in `frames` frames, and one with
// `width` and `height` has its own size (and with `removeBackground` its own
// background), and one with `seed` draws with that seed. A prompt with `tool`
// runs a Retro Diffusion edit tool (outpainting, inpainting, image_edit…) on
// the picture in `input` (with `mask`, `expand` and `prompt` as the tool
// takes them), and one with `request` downloads again what an earlier call
// returned, free, while Retro Diffusion keeps it (24 hours); `all` leaves
// these two out. Every request is
// priced first (free), and the run stops before it would spend more than
// --max-cost dollars.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';

const API = 'https://api.retrodiffusion.ai/v2/inferences';
const EDIT_API = 'https://api.retrodiffusion.ai/v2/edit';
const POLL_MS = 3000;
const POLL_LIMIT = 100;

const { values } = parseArgs({
  options: {
    kind: { type: 'string' },
    ids: { type: 'string', default: 'all' },
    variants: { type: 'string', default: '1' },
    style: { type: 'string', default: '' },
    seed: { type: 'string', default: '' },
    'max-cost': { type: 'string', default: '2' },
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

const token = process.env.RETRO_DIFFUSION_API_KEY;
if (!token) fail('Brak sekretu RETRO_DIFFUSION_API_KEY. Dodaj klucz Retro Diffusion w ustawieniach repozytorium.');

const config = JSON.parse(readFileSync('art/prompts.json', 'utf8'));
const kind = config[values.kind];
if (!kind) fail(`Nieznany rodzaj grafik: ${values.kind}. Dostępne: ${Object.keys(config).filter((key) => key !== '$comment').join(', ')}.`);
const ids =
  values.ids === 'all'
    ? Object.keys(kind.prompts).filter((id) => !kind.prompts[id].tool && !kind.prompts[id].request)
    : values.ids.split(',').map((id) => id.trim()).filter(Boolean);
const unknown = ids.filter((id) => !kind.prompts[id]);
if (unknown.length) fail(`Brak opisu w art/prompts.json dla: ${unknown.join(', ')}.`);
const variants = Math.max(1, Math.min(4, Number(values.variants) || 1));
const maxCost = Number(values['max-cost']);
if (!(maxCost > 0)) fail('--max-cost musi być dodatnią kwotą w dolarach.');
// --style overrides every prompt; otherwise a prompt's own style, then the kind's.
const styleOf = (id) => values.style || kind.prompts[id].style || kind.style;
const promptOf = (id) => (typeof kind.prompts[id] === 'string' ? kind.prompts[id] : kind.prompts[id].prompt);
// An animation's first frame and its number of frames, if the prompt gives them.
const startOf = (id) => kind.prompts[id].startFrame;
const framesOf = (id) => kind.prompts[id].frames ?? kind.animation?.frames;

const headers = { 'X-RD-Token': token, 'Content-Type': 'application/json' };

// A generation carries an idempotency key, so a retried request is not paid
// twice; the API refuses one on a price check, which answers at once.
async function request(method, url, body) {
  const queued = method === 'POST' && !body.check_cost;
  const response = await fetch(url, {
    method,
    headers: queued ? { ...headers, 'Idempotency-Key': randomUUID() } : headers,
    body: body && JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Retro Diffusion odpowiedział ${response.status}: ${JSON.stringify(data ?? {}).slice(0, 400)}`);
  return data;
}

// A queued request is polled until it ends; an immediate answer is returned as is.
async function settle(data) {
  if (!data?.task_id || data.base64_images || data.balance_cost !== undefined) return data;
  for (let attempt = 0; attempt < POLL_LIMIT; attempt++) {
    const task = await request('GET', `${API}/tasks/${data.task_id}`);
    if (task.status === 'failed') {
      const reason = typeof task.error === 'string' ? task.error : JSON.stringify(task.error ?? 'bez opisu');
      throw new Error(`generowanie nie powiodło się: ${reason.slice(0, 300)}`);
    }
    if (task.status !== 'pending' && task.status !== 'running') return task.result ?? task;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error('generowanie trwa zbyt długo');
}

// The approved sprites of this kind, as style references (not for themselves).
const references = (id) =>
  (kind.references ?? [])
    .filter((ref) => ref !== id && existsSync(`art/references/${values.kind}/${ref}.png`))
    .slice(0, 9)
    .map((ref) => readFileSync(`art/references/${values.kind}/${ref}.png`).toString('base64'));

const outDir = `art/drafts/${values.kind}`;
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
const lines = [];
const failed = [];
let spent = 0;
let balance = null;

// One drawing: priced, then drawn and saved with what came back. An
// animation comes one at a time, so its variants are drawings of their own.
async function draw(id, count = variants) {
  if (kind.prompts[id].request) return recover(id, kind.prompts[id].request);
  if (kind.prompts[id].tool) return edit(id, kind.prompts[id], count);
  const seed = values.seed ? Number(values.seed) : (kind.prompts[id].seed ?? Math.floor(Math.random() * 1e9));
  const style = styleOf(id);
  const payload = {
    prompt: promptOf(id),
    prompt_style: style,
    width: kind.prompts[id].width ?? kind.width,
    height: kind.prompts[id].height ?? kind.height,
    num_images: count,
    seed,
    // Sprites lose their background; scenes (removeBackground: false, of the
    // kind or of the prompt) keep it.
    ...((kind.prompts[id].removeBackground ?? kind.removeBackground) === false ? {} : { remove_bg: true, return_non_bg_removed: true }),
    ...(kind.animation && { return_spritesheet: true, ...(framesOf(id) && { frames_duration: framesOf(id) }) }),
    ...(startOf(id) && { input_image: readFileSync(startOf(id)).toString('base64') }),
  };
  const refs = references(id);
  if (refs.length) payload.reference_images = refs;

  const quote = await settle(await request('POST', API, { ...payload, check_cost: true }));
  const cost = Number(quote.balance_cost ?? quote.cost ?? 0);
  balance = quote.remaining_balance ?? balance;
  if (spent + cost > maxCost) {
    lines.push(`| ${id} | pominięte: przekroczyłoby limit ${maxCost} USD | | |`);
    return;
  }
  if (values['dry-run']) {
    spent += cost;
    lines.push(`| ${id} | wycena ${cost.toFixed(3)} USD | ${style} | ${refs.length} |`);
    return;
  }

  const result = await settle(await request('POST', API, payload));
  spent += Number(result.balance_cost ?? cost);
  balance = result.remaining_balance ?? balance;
  const images = result.base64_images ?? [];
  const files = images.map((image, index) => {
    const file = `${outDir}/${id}-${stamp}-${seed}-${index}.png`;
    writeFileSync(file, Buffer.from(image, 'base64'));
    return file;
  });
  // What came back besides the images, to see the shape of the answer.
  const extra = Object.fromEntries(Object.entries(result).filter(([key]) => key !== 'base64_images'));
  writeFileSync(`${outDir}/${id}-${stamp}-${seed}.json`, `${JSON.stringify({ id, payload: { ...payload, reference_images: refs.length }, result: extra }, null, 2)}\n`);
  lines.push(`| ${id} | ${files.length} obrazki, ${Number(result.balance_cost ?? cost).toFixed(3)} USD | ${style} | ${refs.length} |`);
}

// The picture of a finished call: inline, or (edit tools) at a signed address.
async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`pobranie obrazka nie powiodło się: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

// What an earlier call returned, from Retro Diffusion's activity list.
async function recover(id, requestId) {
  if (values['dry-run']) {
    lines.push(`| ${id} | wycena 0.000 USD (pobranie wyniku ${requestId}) | | |`);
    return;
  }
  const data = await request('GET', `${API}/requests/${requestId}`);
  const urls = [...(data.outputs ?? []).map((output) => output.url), ...(data.output_urls ?? [])].filter(Boolean);
  const files = [];
  for (const [index, url] of urls.entries()) {
    const file = `${outDir}/${id}-${stamp}-${index}.png`;
    writeFileSync(file, await download(url));
    files.push(file);
  }
  writeFileSync(`${outDir}/${id}-${stamp}.json`, `${JSON.stringify({ id, request: requestId, result: data }, null, 2)}\n`);
  lines.push(`| ${id} | ${files.length} obrazki z wyniku ${requestId}, 0 USD | | |`);
}

// A queued edit is polled until it ends.
async function settleEdit(taskId) {
  for (let attempt = 0; attempt < POLL_LIMIT; attempt++) {
    const task = await request('GET', `${EDIT_API}/tasks/${taskId}`);
    if (task.status === 'failed') {
      const reason = task.error?.message ?? JSON.stringify(task.error ?? 'bez opisu');
      throw new Error(`edycja nie powiodła się: ${reason.slice(0, 300)}`);
    }
    if (task.status !== 'pending' && task.status !== 'running') return task.result ?? task;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error('edycja trwa zbyt długo');
}

// An edit tool on a picture from the repository; each variant is a run of
// its own, with the next seed.
async function edit(id, entry, count) {
  const first = values.seed ? Number(values.seed) : (entry.seed ?? Math.floor(Math.random() * 1e9));
  for (let take = 0; take < count; take++) {
    const seed = first + take;
    const body = {
      input_image: readFileSync(entry.input).toString('base64'),
      ...(entry.mask && { mask_image: readFileSync(entry.mask).toString('base64') }),
      ...(entry.prompt && { prompt: entry.prompt }),
      ...Object.fromEntries(Object.entries(entry.expand ?? {}).map(([side, pixels]) => [`expand_${side}`, pixels])),
      seed,
    };
    const quote = await request('POST', `${EDIT_API}/tools/${entry.tool}/estimate`, body);
    const cost = Number(quote.balance_cost ?? 0);
    if (spent + cost > maxCost) {
      lines.push(`| ${id} | pominięte: przekroczyłoby limit ${maxCost} USD | ${entry.tool} | |`);
      return;
    }
    if (values['dry-run']) {
      spent += cost;
      lines.push(`| ${id} | wycena ${cost.toFixed(3)} USD | ${entry.tool} | |`);
      continue;
    }
    const task = await request('POST', `${EDIT_API}/tools/${entry.tool}/tasks`, { ...body, custom_id: randomUUID() });
    const result = await settleEdit(task.task_id);
    spent += Number(result.balance_cost ?? cost);
    balance = result.remaining_balance ?? balance;
    const image = result.base64_images?.[0] ? Buffer.from(result.base64_images[0], 'base64') : await download(result.output_urls[0]);
    writeFileSync(`${outDir}/${id}-${stamp}-${seed}-0.png`, image);
    const extra = Object.fromEntries(Object.entries(result).filter(([key]) => key !== 'base64_images'));
    const sent = { ...body, input_image: entry.input, ...(entry.mask && { mask_image: entry.mask }) };
    writeFileSync(`${outDir}/${id}-${stamp}-${seed}.json`, `${JSON.stringify({ id, tool: entry.tool, payload: sent, result: extra }, null, 2)}\n`);
    lines.push(`| ${id} | 1 obrazek, ${Number(result.balance_cost ?? cost).toFixed(3)} USD | ${entry.tool} | |`);
  }
}

// A failed drawing does not stop the others, so the paid ones are kept.
for (const id of ids) {
  for (let take = 0; take < (kind.animation ? variants : 1); take++) {
    try {
      await draw(id, kind.animation ? 1 : variants);
    } catch (error) {
      failed.push(id);
      lines.push(`| ${id} | błąd: ${error.message} | | |`);
    }
  }
}

const balanceNote = balance === null ? '' : `, saldo: ${Number(balance).toFixed(2)} USD`;
const total = values['dry-run'] ? `Wycena razem: ${spent.toFixed(3)} USD${balanceNote}.` : `Wydano: ${spent.toFixed(3)} USD${balanceNote}.`;
summary(
  [
    `## Szkice grafik: ${values.kind}${values['dry-run'] ? ' (tylko wycena)' : ''}`,
    '',
    '| Grafika | Wynik | Styl | Wzorce |',
    '| --- | --- | --- | --- |',
    ...lines,
    '',
    total,
  ].join('\n'),
);
console.log(lines.join('\n'));
console.log(total);
if (failed.length) {
  console.log(`::error::Nie udało się: ${failed.join(', ')}.`);
  process.exitCode = 1;
}

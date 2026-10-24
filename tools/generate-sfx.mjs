// Records sound drafts with ElevenLabs Sound Effects (text to sound). Run by
// the "Dźwięki (szkice)" workflow, which keeps the drafts on the art-drafts
// branch for review:
//   node tools/generate-sfx.mjs --kind voices --ids wolf-hurt,wolf-death --max-credits 200
//     [--variants 2] [--dry-run]
// Prompts and lengths are in audio/prompts.json. A sound of a set length costs
// 20 credits a second, so the run counts the credits before it starts and
// stops before it would spend more than --max-credits.

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const API = 'https://api.elevenlabs.io/v1';
const CREDITS_PER_SECOND = 20;

const { values } = parseArgs({
  options: {
    kind: { type: 'string' },
    ids: { type: 'string', default: 'all' },
    variants: { type: 'string', default: '1' },
    'max-credits': { type: 'string', default: '200' },
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

const token = process.env.ELEVENLABS_API_KEY;
if (!token) fail('Brak sekretu ELEVENLABS_API_KEY. Dodaj klucz ElevenLabs w ustawieniach repozytorium.');

const config = JSON.parse(readFileSync('audio/prompts.json', 'utf8'));
const kind = config[values.kind];
if (!kind || values.kind === '$comment') fail(`Nieznany rodzaj dźwięków: ${values.kind}. Dostępne: ${Object.keys(config).filter((key) => key !== '$comment').join(', ')}.`);
const ids = values.ids === 'all' ? Object.keys(kind.prompts) : values.ids.split(',').map((id) => id.trim()).filter(Boolean);
const unknown = ids.filter((id) => !kind.prompts[id]);
if (unknown.length) fail(`Brak opisu w audio/prompts.json dla: ${unknown.join(', ')}.`);
const variants = Math.max(1, Math.min(4, Number(values.variants) || 1));
const maxCredits = Number(values['max-credits']);
if (!(maxCredits > 0)) fail('--max-credits musi być dodatnią liczbą kredytów.');

const perSound = Math.ceil(kind.seconds * CREDITS_PER_SECOND);
const total = perSound * variants * ids.length;
const lines = [`| Dźwięk | Wynik |`, `| --- | --- |`];
if (total > maxCredits) {
  summary(`Wycena: ${total} kredytów, więcej niż limit ${maxCredits}. Nic nie nagrano.`);
  fail(`Te dźwięki kosztowałyby ${total} kredytów, a limit to ${maxCredits}.`);
}
if (values['dry-run']) {
  for (const id of ids) lines.push(`| ${id} | wycena ${perSound * variants} kredytów |`);
  summary([`Wycena razem: ${total} kredytów (${kind.seconds} s na dźwięk).`, '', ...lines].join('\n'));
  console.log(`Wycena razem: ${total} kredytów.`);
  process.exit(0);
}

const outDir = `audio/drafts/${values.kind}`;
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
let spent = 0;

// One sound, recorded `variants` times; each take is a separate request.
async function record(id) {
  const payload = { text: kind.prompts[id], duration_seconds: kind.seconds, prompt_influence: 0.5 };
  const files = [];
  for (let take = 0; take < variants; take++) {
    const response = await fetch(`${API}/sound-generation?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': token, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`ElevenLabs odpowiedział ${response.status}: ${detail.slice(0, 300)}`);
    }
    const file = `${outDir}/${id}-${stamp}-${take}.mp3`;
    writeFileSync(file, Buffer.from(await response.arrayBuffer()));
    files.push(file);
    spent += perSound;
  }
  writeFileSync(`${outDir}/${id}-${stamp}.json`, `${JSON.stringify({ id, payload, files, credits: perSound * files.length }, null, 2)}\n`);
  lines.push(`| ${id} | ${files.length} nagrania, ${perSound * files.length} kredytów |`);
}

// Each sound on its own: a failed one does not lose the ones already paid for.
for (const id of ids) {
  try {
    await record(id);
  } catch (error) {
    lines.push(`| ${id} | błąd: ${error.message.replaceAll('|', '/')} |`);
    console.log(`::error::${id}: ${error.message}`);
    process.exitCode = 1;
  }
}
summary([`Wydano: ${spent} kredytów.`, '', ...lines].join('\n'));
console.log(`Wydano: ${spent} kredytów.`);

// Records sound drafts with ElevenLabs Sound Effects (text to sound). Run by
// the "Dźwięki (szkice)" workflow, which keeps the drafts on the art-drafts
// branch for review:
//   node tools/generate-sfx.mjs --kind voices --ids wolf-hurt,wolf-death --max-credits 200
//     [--variants 2] [--dry-run]
// An id can ask for its own number of takes: --ids intro:3,purpose.
// Prompts and lengths are in audio/prompts.json; a prompt is its text, or
// {text, seconds, influence} when it needs a length or a closeness to the
// text (prompt influence, 0 to 1) of its own. A sound of a set length
// costs 20 credits a second, so the run counts the credits before it starts
// and stops before it would spend more than --max-credits.
// A kind with `tts` is speech instead (ElevenLabs text to speech): a prompt is
// {voice, text} or {voice, line}, a line of the narrator's introduction from
// data/tutorial.json, and it costs credits for each character read. A prompt
// may name its own `model` and `settings`, ask for a `remix` of its voice
// (ElevenLabs Voice Remixing, only for the account's own voices) or for a
// `design`: a new voice from a description, optionally after a `reference`
// recording (ElevenLabs Voice Design). A remix or a design comes back as a
// few previews reading the text. Speech can also take the text around it
// (`previousText`, `nextText`) and an `ending` read after it, then cut off.
// A kind with `language` "en" reads the narrator's lines in English
// (data/en/tutorial.json over data/tutorial.json): one recording for both
// looks, as English says them alike, and one for a computer's words
// (`<id>-desktop`) where they differ.

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
const tts = kind.tts ?? null;
const balance = tts && JSON.parse(readFileSync('data/balance.json', 'utf8'));
const english = kind.language === 'en';
const tutorial = tts && (english ? englishTutorial() : JSON.parse(readFileSync('data/tutorial.json', 'utf8')));

// The narrator's lines with their English words: each line, class and
// computer's version takes its text from data/en/tutorial.json; the female
// versions go, as English says them as the male ones.
function englishTutorial() {
  const polish = JSON.parse(readFileSync('data/tutorial.json', 'utf8'));
  const overlay = JSON.parse(readFileSync('data/en/tutorial.json', 'utf8')).lines ?? {};
  // A line told per class has its words only in its classes.
  const told = (base, en, id) => {
    const { female, desktop, ...rest } = base;
    if (!base.text) return rest;
    if (!en?.text) fail(`Brak angielskiego tekstu kwestii ${id} w data/en/tutorial.json.`);
    return {
      ...rest,
      text: en.text,
      ...(desktop && { desktop: { ...desktop, text: en.desktop?.text ?? en.text } }),
    };
  };
  return {
    ...polish,
    lines: polish.lines.map((line) => {
      const en = overlay[line.id];
      if (!en) fail(`Brak kwestii ${line.id} w data/en/tutorial.json.`);
      const { classes, ...rest } = line;
      return {
        ...told(rest, en, line.id),
        ...(classes && { classes: Object.fromEntries(Object.entries(classes).map(([classId, forClass]) => [classId, told(forClass, en.classes?.[classId], `${line.id}-${classId}`)])) }),
      };
    }),
  };
}

// `allLines` makes a prompt of every line of the narrator's introduction,
// named by the line's id, and of its female version, `<id>-female`; a line
// told per class makes one for each class, `<id>-<class>` and
// `<id>-<class>-female`. An entry of the same name in `prompts` adds to it,
// and so does any other entry that reads a line: say, words the voice reads
// differently from the parchment.
const own = (id) => kind.prompts?.[id] ?? {};
const prompts = {
  ...Object.fromEntries(
    Object.entries(kind.prompts ?? {}).map(([id, entry]) => [id, entry.line && kind.allLines ? { ...kind.allLines, ...entry } : entry]),
  ),
  ...(kind.allLines &&
    Object.fromEntries(
      tutorial.lines.flatMap((line) =>
        Object.entries(line.classes ?? { '': line }).flatMap(([classId, told]) => {
          const id = classId ? `${line.id}-${classId}` : line.id;
          const entry = { ...kind.allLines, line: line.id, ...(classId && { classId }) };
          return [
            [id, { ...entry, ...own(id) }],
            ...(told.female ? [[`${id}-female`, { ...entry, variant: 'female', ...own(`${id}-female`) }]] : []),
            // English records the computer's words with the lines; Polish has
            // them as prompts of their own.
            ...(english && told.desktop && told.desktop.text.join(' ') !== told.text.join(' ')
              ? [[`${id}-desktop`, { ...entry, variant: 'desktop', ...own(`${id}-desktop`) }]]
              : []),
          ];
        }),
      ),
    )),
};
const variants = Math.max(1, Math.min(4, Number(values.variants) || 1));
const asked = values.ids === 'all' ? Object.keys(prompts) : values.ids.split(',').map((id) => id.trim()).filter(Boolean);
const takesOf = Object.fromEntries(asked.map((item) => {
  const [id, count] = item.split(':');
  return [id, count ? Math.max(1, Math.min(4, Number(count) || 1)) : variants];
}));
const ids = Object.keys(takesOf);
const unknown = ids.filter((id) => !prompts[id]);
if (unknown.length) fail(`Brak opisu w audio/prompts.json dla: ${unknown.join(', ')}.`);
const maxCredits = Number(values['max-credits']);
if (!(maxCredits > 0)) fail('--max-credits musi być dodatnią liczbą kredytów.');

// What a speech prompt reads: its own text, or a narrator's line with the
// starting Time Points filled in, as the game shows it. An `ending` is read
// after it and cut off later (eleven_v3 tends to clip the last syllable of
// what it reads, so the clipped part is not the line's).
function spokenText(entry) {
  return mainText(entry) + (entry.ending ?? '');
}

function mainText(entry) {
  if (entry.text) return entry.text;
  const line = tutorial.lines.find((candidate) => candidate.id === entry.line);
  if (!line) fail(`Brak kwestii ${entry.line} w data/tutorial.json.`);
  const forClass = entry.classId ? line.classes[entry.classId] : line;
  const told = entry.variant === 'female' ? forClass.female : entry.variant === 'desktop' ? forClass.desktop : forClass;
  let text = told.text.join(' ').replaceAll('{points}', String(balance.timePoints.start));
  // `say`: [written, read] pairs, e.g. a comma that helps the voice end "broń".
  for (const [written, read] of entry.say ?? []) {
    if (!text.includes(written)) fail(`Kwestia ${entry.line} nie zawiera już „${written}” (say w audio/prompts.json).`);
    text = text.replace(written, read);
  }
  return text;
}

const prompt = (id) => {
  const entry = prompts[id];
  if (tts) return { ...entry, text: spokenText(entry) };
  return typeof entry === 'string' ? { text: entry, seconds: kind.seconds } : entry;
};
const credits = (id) => {
  if (!tts) return Math.ceil(prompt(id).seconds * CREDITS_PER_SECOND);
  const previews = prompt(id).remix || prompt(id).design;
  const perCharacter = previews ? (tts.previewCreditsPerCharacter ?? 3) : (tts.creditsPerCharacter ?? 1);
  return Math.ceil(prompt(id).text.length * perCharacter);
};
const size = (id) => (tts ? `${prompt(id).text.length} znaków` : `${prompt(id).seconds} s`);
const total = ids.reduce((sum, id) => sum + credits(id) * takesOf[id], 0);
const lines = [`| Dźwięk | Wynik |`, `| --- | --- |`];
if (total > maxCredits) {
  summary(`Wycena: ${total} kredytów, więcej niż limit ${maxCredits}. Nic nie nagrano.`);
  fail(`Te dźwięki kosztowałyby ${total} kredytów, a limit to ${maxCredits}.`);
}
if (values['dry-run']) {
  for (const id of ids) lines.push(`| ${id} | wycena ${credits(id) * takesOf[id]} kredytów (${size(id)}, ${takesOf[id]}×) |`);
  const left = await creditsLeft();
  const priced = `Wycena razem: ${total} kredytów.${left ? ` Na koncie jest ${left}.` : ''}`;
  summary([priced, '', ...lines].join('\n'));
  console.log(priced);
  process.exit(0);
}

const outDir = `audio/drafts/${values.kind}`;
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
let spent = 0;

// Voice ids by name: from the account's list when the key may read it,
// otherwise the ids written down in audio/prompts.json. A voice in `saved`
// is a chosen preview of a design: the first run keeps it as a voice of the
// account under its name, and later runs find it on the list.
async function voiceIds() {
  const ids = Object.fromEntries(Object.entries(tts.voices ?? {}).map(([name, id]) => [name.toLowerCase(), id]));
  try {
    const response = await fetch(`${API}/voices`, { headers: { 'xi-api-key': token } });
    if (response.ok) {
      for (const voice of (await response.json()).voices ?? []) ids[voice.name.split(/[\s-]/)[0].toLowerCase()] = voice.voice_id;
    }
  } catch {
    // The list is only a help; the written-down ids are enough.
  }
  const kept = {};
  for (const [name, saved] of Object.entries(tts.saved ?? {})) {
    if (ids[name.toLowerCase()]) continue;
    const response = await fetch(`${API}/text-to-voice`, {
      method: 'POST',
      headers: { 'xi-api-key': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ voice_name: name, voice_description: saved.description, generated_voice_id: saved.generatedVoiceId }),
    });
    if (!response.ok) fail(`Nie udało się zapisać głosu ${name}: ${response.status} ${(await response.text().catch(() => '')).slice(0, 300)}`);
    ids[name.toLowerCase()] = (await response.json()).voice_id;
    kept[name] = ids[name.toLowerCase()];
  }
  if (Object.keys(kept).length) {
    writeFileSync(`${outDir}/voices-${stamp}.json`, `${JSON.stringify(kept, null, 2)}\n`);
    summary(`Zapisane głosy: ${Object.entries(kept).map(([name, id]) => `${name} (${id})`).join(', ')}.`);
  }
  return ids;
}
const voices = tts && !values['dry-run'] ? await voiceIds() : {};

// The credits left on the account, when the key may read them.
async function creditsLeft() {
  try {
    const response = await fetch(`${API}/user/subscription`, { headers: { 'xi-api-key': token } });
    if (!response.ok) return null;
    const { character_count: used, character_limit: limit, next_character_count_reset_unix: reset } = await response.json();
    // When the plan gives its credits anew, Polish time.
    const renewed = reset ? `, odnowienie ${new Date(reset * 1000).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'short', timeStyle: 'short' })}` : '';
    return `${limit - used} z ${limit}${renewed}`;
  } catch {
    return null;
  }
}

// One request: a sound of a set length, speech in the prompt's voice, or a
// remix of that voice reading the text.
function requestFor(id) {
  const { text, seconds, influence, voice, model, settings, remix, design, reference, promptStrength } = prompt(id);
  if (!tts) {
    return { url: `${API}/sound-generation?output_format=mp3_44100_64`, payload: { text, duration_seconds: seconds, prompt_influence: influence ?? kind.influence ?? 0.5 } };
  }
  if (design) {
    const payload = { voice_description: design, text, model_id: tts.designModel ?? 'eleven_ttv_v3', guidance_scale: tts.designGuidance ?? 3 };
    // The recording to start from goes as base64; the drafts note only its file.
    const sent = reference ? { ...payload, reference_audio_base64: readFileSync(reference).toString('base64'), prompt_strength: promptStrength ?? 0.4 } : payload;
    return { url: `${API}/text-to-voice/design?output_format=mp3_44100_128`, payload: reference ? { ...payload, reference } : payload, sent, previews: true };
  }
  const voiceId = voices[voice.toLowerCase()];
  if (!voiceId) throw new Error(`nieznany głos ${voice}`);
  if (remix) {
    return {
      url: `${API}/text-to-voice/${voiceId}/remix?output_format=mp3_44100_128`,
      payload: { voice_description: remix, text, guidance_scale: tts.remixGuidance ?? 2 },
      previews: true,
    };
  }
  // With an ending, the answer also gives when each character is read, so
  // the ending can be cut off where the line ends.
  const { previousText, nextText, ending } = prompt(id);
  return {
    url: `${API}/text-to-speech/${voiceId}${ending ? '/with-timestamps' : ''}?output_format=mp3_44100_128`,
    payload: {
      text,
      model_id: model ?? tts.model,
      voice_settings: settings ?? tts.settings,
      ...(tts.languageCode && { language_code: tts.languageCode }),
      ...(previousText && { previous_text: previousText }),
      ...(nextText && { next_text: nextText }),
    },
    timed: Boolean(ending),
  };
}

// One sound, recorded as many times as asked; each take is a separate request.
async function record(id) {
  const { url, payload, sent = payload, previews, timed } = requestFor(id);
  const files = [];
  const generated = []; // a remix's voices, which can be kept as a voice of the account
  for (let take = 0; take < takesOf[id]; take++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': token, 'Content-Type': 'application/json' },
      body: JSON.stringify(sent),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`ElevenLabs odpowiedział ${response.status}: ${detail.slice(0, 300)}`);
    }
    spent += credits(id);
    if (previews) {
      // A remix answers with a few voices, each reading the text.
      const answer = await response.json();
      for (const [index, preview] of (answer.previews ?? []).entries()) {
        const file = `${outDir}/${id}-${stamp}-${take}-${index}.mp3`;
        writeFileSync(file, Buffer.from(preview.audio_base_64, 'base64'));
        files.push(file);
        generated.push({ file, generatedVoiceId: preview.generated_voice_id });
      }
      continue;
    }
    const file = `${outDir}/${id}-${stamp}-${take}.mp3`;
    if (timed) {
      const { audio_base64: audio, alignment } = await response.json();
      writeFileSync(file, Buffer.from(audio, 'base64'));
      writeFileSync(file.replace(/\.mp3$/, '.timing.json'), `${JSON.stringify(alignment)}\n`);
    } else {
      writeFileSync(file, Buffer.from(await response.arrayBuffer()));
    }
    files.push(file);
  }
  const takes = previews ? takesOf[id] : files.length;
  const { ending } = prompt(id);
  writeFileSync(
    `${outDir}/${id}-${stamp}.json`,
    `${JSON.stringify({ id, payload, ...(ending && { ending }), files, ...(previews && { generated }), credits: credits(id) * takes }, null, 2)}\n`,
  );
  lines.push(`| ${id} | ${files.length} nagrania, ${credits(id) * takes} kredytów |`);
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
const left = await creditsLeft();
const spentLine = `Wydano: ${spent} kredytów.${left ? ` Na koncie zostało ${left}.` : ''}`;
summary([spentLine, '', ...lines].join('\n'));
console.log(spentLine);

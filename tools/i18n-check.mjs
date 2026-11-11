// The English beta's translations checked against the Polish, the only
// source (src/server/i18n.js, src/client/i18n.js, src/engine/overlay.js):
//   - brakujące: a Polish text of a part already translated (data/en/scope.json)
//     without its English: a data text without its place in data/en/<file>.json,
//     a text of the code without its key in data/en/strings.json;
//   - zbędne: English with no Polish left under it (a text changed or gone);
//   - niezgodne zmienne: the {name} of a text not the same in both languages;
//   - nieaktualne: a data text whose Polish changed after its English was
//     written (data/en/sources.json keeps a hash of the Polish each English
//     was made from), or one with no hash yet;
//   - niepodpięte: an English data file the server does not lay over the data
//     (src/server/content.js);
//   - niezgodne ze słownikiem nazw: a text that is one of the key names of
//     data/en/glossary.json, whose English is not the glossary's (`en`).
// Everything but the superfluous fails `npm test` (test/i18n.test.js).
//
//   node tools/i18n-check.mjs              the report; exits 1 on a failure
//   node tools/i18n-check.mjs --all        also how much is missing outside the parts translated
//   node tools/i18n-check.mjs --stamp      keeps the hash of the Polish of each new English data text
//   node tools/i18n-check.mjs --stamp-all  the same for every one, once the outdated are translated anew
//
// The code is read by a small tokenizer, as the project has no JavaScript
// parser: a string or template literal is a text when it looks like Polish
// words and not like an id, a path, a selector or SQL. A text the code passes
// to t() is checked by its exact key; any other, as an error's message the
// server builds with numbers, by its shape, with {…} in place of what is
// filled in (src/server/i18n.js, translateMessage). data/en/scope.json names
// the parts translated, and the few Polish-looking literals that are no text.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { overlayKey } from '../src/engine/overlay.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// The files of data/en/ that are no translation of a data file.
const SPECIAL = new Set(['strings', 'scope', 'sources', 'glossary']);

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

// --- The code's literals -------------------------------------------------

const KEYWORDS_BEFORE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

function cook(raw) {
  return raw.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r\n|[\s\S])/g, (_, escape) => {
    if (escape.startsWith('u{')) return String.fromCodePoint(parseInt(escape.slice(2, -1), 16));
    if (escape[0] === 'u' && escape.length === 5) return String.fromCharCode(parseInt(escape.slice(1), 16));
    if (escape[0] === 'x' && escape.length === 3) return String.fromCharCode(parseInt(escape.slice(1), 16));
    return { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0', '\n': '', '\r\n': '' }[escape] ?? escape;
  });
}

function regexAllowed(tokens) {
  const last = tokens[tokens.length - 1];
  if (!last) return true;
  if (last.type === 'ident') return KEYWORDS_BEFORE_REGEX.has(last.value);
  if (last.type === 'punct') return ![')', ']'].includes(last.value);
  return false;
}

// Tokens of `code` from `start`: strings, templates (their fixed parts, the
// tokens of their expressions after them), identifiers and punctuation.
// With `inTemplate`, it stops after the "}" that closes a template's "${".
function scan(code, start, tokens, line, inTemplate = false) {
  let i = start;
  let depth = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === '\n') {
      line.number += 1;
      i += 1;
    } else if (/\s/.test(c)) i += 1;
    else if (c === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') i += 1;
    } else if (c === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      line.number += (code.slice(i, end).match(/\n/g) ?? []).length;
      i = end + 2;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < code.length && code[j] !== c) j += code[j] === '\\' ? 2 : 1;
      tokens.push({ type: 'string', value: cook(code.slice(i + 1, j)), line: line.number });
      i = j + 1;
    } else if (c === '`') {
      const token = { type: 'template', quasis: [], line: line.number };
      tokens.push(token);
      let j = i + 1;
      let from = j;
      while (j < code.length && code[j] !== '`') {
        if (code[j] === '\\') j += 2;
        else if (code[j] === '$' && code[j + 1] === '{') {
          token.quasis.push(cook(code.slice(from, j)));
          j = scan(code, j + 2, tokens, line, true);
          from = j;
        } else {
          if (code[j] === '\n') line.number += 1;
          j += 1;
        }
      }
      token.quasis.push(cook(code.slice(from, j)));
      i = j + 1;
    } else if (c === '/' && regexAllowed(tokens)) {
      let j = i + 1;
      let inClass = false;
      while (j < code.length && (inClass || code[j] !== '/')) {
        if (code[j] === '\\') j += 1;
        else if (code[j] === '[') inClass = true;
        else if (code[j] === ']') inClass = false;
        j += 1;
      }
      j += 1;
      while (/[a-z]/i.test(code[j] ?? '')) j += 1;
      tokens.push({ type: 'regex', line: line.number });
      i = j;
    } else if (/[\p{L}_$]/u.test(c)) {
      let j = i + 1;
      while (j < code.length && /[\p{L}\p{N}_$]/u.test(code[j])) j += 1;
      tokens.push({ type: 'ident', value: code.slice(i, j), line: line.number });
      i = j;
    } else if (/\d/.test(c)) {
      let j = i + 1;
      while (j < code.length && /[\w.]/.test(code[j])) j += 1;
      tokens.push({ type: 'number', line: line.number });
      i = j;
    } else {
      if (c === '{') depth += 1;
      if (c === '}') {
        if (inTemplate && depth === 0) return i + 1;
        depth -= 1;
      }
      tokens.push({ type: 'punct', value: c, line: line.number });
      i += 1;
    }
  }
  return i;
}

export function tokenize(code) {
  const tokens = [];
  scan(code, 0, tokens, { number: 1 });
  return tokens;
}

const literalText = (token) => (token.type === 'string' ? token.value : token.type === 'template' ? token.quasis.join('{}') : null);

// The texts of a module: `keys`, what it passes to t() (exact), `plurals`,
// the three forms of plural() and countOf() as one key, and `texts`, every
// other literal that looks like a text (by its shape, {} for what is filled).
// What goes to the console or into an Error is for the logs, not a player.
// `client`: a module of the page, where a lone capitalised word ("Walka") is
// a text too.
export function codeTexts(code, { client = false } = {}) {
  const tokens = tokenize(code);
  const used = new Set();
  const keys = [];
  const plurals = [];
  const called = (index, names) =>
    tokens[index]?.type === 'ident' && names.includes(tokens[index].value) && tokens[index - 1]?.value !== '.' && tokens[index + 1]?.value === '(';
  for (let index = 0; index < tokens.length; index += 1) {
    const logged =
      (tokens[index]?.value === 'console' && tokens[index + 1]?.value === '.' && tokens[index + 3]?.value === '(') ||
      (tokens[index]?.type === 'ident' && /^(Error|TypeError|RangeError)$/.test(tokens[index].value) && tokens[index + 1]?.value === '(');
    if (logged) {
      const first = tokens[index + (tokens[index].value === 'console' ? 4 : 2)];
      if (first?.type === 'string' || first?.type === 'template') used.add(first);
    }
    if (called(index, ['t'])) {
      const first = tokens[index + 2];
      const text = first && (first.type === 'string' || (first.type === 'template' && first.quasis.length === 1)) ? literalText(first) : null;
      if (text !== null) {
        keys.push({ text, line: first.line });
        used.add(first);
      }
    } else if (called(index, ['plural', 'countOf'])) {
      // Past the count, to the first comma at its own depth.
      let j = index + 2;
      let depth = 0;
      while (j < tokens.length && !(depth === 0 && tokens[j].value === ',')) {
        if (['(', '[', '{'].includes(tokens[j].value)) depth += 1;
        if ([')', ']', '}'].includes(tokens[j].value)) depth -= 1;
        if (depth < 0) break;
        j += 1;
      }
      const forms = [tokens[j + 1], tokens[j + 3], tokens[j + 5]];
      if (tokens[j]?.value === ',' && tokens[j + 2]?.value === ',' && tokens[j + 4]?.value === ',' && forms.every((form) => form?.type === 'string')) {
        plurals.push({ text: forms.map((form) => form.value).join('|'), line: forms[0].line });
        for (const form of forms) used.add(form);
      }
    }
  }
  // The value of a property that holds words on the page ("label: 'Walka'",
  // "doing: 'praca'") is a text whatever it looks like, unless it is an id;
  // so is the message of an ApiError, its third argument.
  const named = new Set();
  const errors = new Set();
  for (const [index, token] of tokens.entries()) {
    const key = tokens[index - 2];
    if ((token.type === 'string' || token.type === 'template') && tokens[index - 1]?.value === ':' && TEXT_KEYS.has(key?.value)) named.add(token);
    if (token.type === 'ident' && token.value === 'ApiError' && tokens[index + 1]?.value === '(') {
      let depth = 0;
      let commas = 0;
      for (let j = index + 2; j < tokens.length; j += 1) {
        const value = tokens[j].value;
        if (['(', '[', '{'].includes(value)) depth += 1;
        else if ([')', ']', '}'].includes(value)) {
          if (depth === 0) break;
          depth -= 1;
        } else if (value === ',' && depth === 0) commas += 1;
        else if (commas === 2 && depth === 0 && (tokens[j].type === 'string' || tokens[j].type === 'template')) {
          errors.add(tokens[j]);
          break;
        }
      }
    }
  }
  const literals = tokens.filter((token) => token.type === 'string' || token.type === 'template');
  const texts = literals
    .filter((token) => !used.has(token))
    .map((token) => ({ text: literalText(token), line: token.line, named: named.has(token), error: errors.has(token) }))
    .filter(({ text, named: held, error }) => looksLikeText(text, { client }) || (error && !technical(text)) || (client && held && /^\p{L}[\p{L} ]*$/u.test(text)));
  return { keys, plurals, texts, all: literals.map(literalText) };
}

// The properties whose values the page shows as words.
const TEXT_KEYS = new Set(['label', 'name', 'text', 'title', 'doing', 'readyText', 'lock', 'hint', 'placeholder', 'confirmLabel', 'cancelLabel', 'aria-label']);

const PL = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

// Not a text: an id, a path, a selector, SQL, a CSS class list, a header.
function technical(text) {
  const bare = text.replace(/\{\w*\}/g, '');
  if (!/\p{L}/u.test(bare)) return true;
  if (/^(#\/|\/api\/|\.{1,2}\/|https?:|data:|audio\/|art\/|mailto:|\/)/.test(text)) return true;
  if (/\b(SELECT|UPDATE|INSERT|DELETE|EXISTS|COALESCE|WHERE|FROM \w|ORDER BY|JOIN|VALUES|WHEN|THEN)\b/.test(text) && !PL.test(text.replace(/\b(AND|OR)\b/g, ''))) return true;
  if (/^[a-z0-9_\-:./@*=,\s{}]+$/.test(text) && !PL.test(text) && (!/\s/.test(text.trim()) || /[-_]/.test(text))) return true;
  if (/^[a-z][a-zA-Z0-9{}]*$/.test(text) && !PL.test(text)) return true;
  if (/^(Content-|Accept|Cache-|X-|Set-Cookie|Authorization|Europe\/|application\/|image\/|text\/)/.test(text)) return true;
  // A cookie, a query or a media query.
  if (/\w=\S|^\(|;\s*\w+=/.test(text) && !PL.test(text)) return true;
  if (/^[.#[:(][\w-]/.test(text) && !/\s[a-ząćęłńóśźż]{3,}\s/.test(text)) return true;
  // SVG path data ("M12 3l7 3v5…z", icons.js, class-art.js), whose "z" is
  // no Polish word.
  if (/^[Mm]\s*(-?[\d.]|\{)/.test(text) && /^[\d\s.,{}MmLlHhVvCcSsQqTtAaZz-]+$/.test(text)) return true;
  return false;
}

// Short Polish words that English never writes alone.
const POLISH_WORDS = new Set(
  `nie się jest są na do od po za już tylko albo lub oraz jak gdy czy jeszcze przez przy dla bez ten ta to tej tego twój twoja twoje ci cię go ją je ich
  mu jej co kto który która które w z ze że poziom poziomu złota zł brak teraz dziś jutro`.split(/\s+/),
);

// A text in Polish, by its look: Polish letters or words; in the page's
// modules also a lone capitalised word ("Walka") or one in capitals
// ("ALCHEMIA").
export function looksLikeText(text, { client = false } = {}) {
  if (typeof text !== 'string' || technical(text)) return false;
  if (PL.test(text)) return true;
  const words = text.replace(/\{\w*\}/g, ' ').match(/\p{L}+/gu) ?? [];
  if (words.some((word) => POLISH_WORDS.has(word.toLowerCase()))) return true;
  return client && (/^[A-Z][a-z]+$/.test(text.trim()) || /^[A-Z]{5,}$/.test(text.trim()) || /^[a-z]+( [a-z]+)+$/.test(text.trim()));
}

// The texts of index.html: data-i18n's own text, and the attributes named by
// data-i18n-attr, with the busy label of the sign-in buttons (app.js).
export function htmlTexts(html) {
  const texts = [];
  const lineOf = (index) => html.slice(0, index).split('\n').length;
  for (const match of html.matchAll(/<(\w+)([^>]*)>([^<]*)<\/\1>/g)) {
    if (/\sdata-i18n(\s|>|$)/.test(` ${match[2]} `)) texts.push({ text: match[3].trim(), line: lineOf(match.index) });
  }
  for (const match of html.matchAll(/<\w+([^>]*)>/g)) {
    const attributes = match[1];
    const names = /data-i18n-attr="([^"]*)"/.exec(attributes)?.[1].split(/\s+/).filter(Boolean) ?? [];
    for (const name of [...names, 'data-busy-label']) {
      const value = new RegExp(`\\s${name}="([^"]*)"`).exec(attributes)?.[1];
      if (value) texts.push({ text: value, line: lineOf(match.index) });
    }
  }
  return texts;
}

function sourceFiles(root) {
  const walk = (dir) =>
    readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return walk(path);
      return /\.(js|html)$/.test(entry.name) ? [path] : [];
    });
  return ['src/client', 'src/server', 'src/engine'].flatMap(walk);
}

// --- The data ------------------------------------------------------------

// Keys whose values are ids, names of files or other values for the program.
const ID_KEYS = new Set(
  `id monster monsters files file kind family category sound scaling rarity rarities voice position slot slots resource resources chapter element
  elements stat stats from classId area areas laterCreatures foes art color ramp swatch unit brotherhood resident place path scene part armor weapons
  offhands kinds elite champion profession catalyst outlaws rows topRarity bonus exceptAreas families requires summon edge strike dotEffect skills
  evolution effect gender until for code base bases item items next prev after before areaId regionId region sprite icon image music track tracks loop
  frames anchor mood pose look looks drawn tone tones skin skins target goods trigger when screen tab anchorTo points pointer highlight route hash key
  keys type types mode condition feature features flag start column default renameAt language`.split(/\s+/),
);
// Keys never read as texts, the swear filter's lists among them
// (data/chat.json `words` and `wordsEn`), and a currency's code
// (data/payments.json).
const SKIP_KEYS = new Set(['words', 'wordsEn', 'code', 'for', 'until', 'ramp', 'swatch', 'color', 'files', 'file', 'voice', 'currency', 'timeZone']);

// Whether a Polish string of the data is a text to translate.
export function dataText(value, key) {
  if (typeof value !== 'string' || !/\p{L}/u.test(value)) return false;
  if (SKIP_KEYS.has(key) || String(key).startsWith('$')) return false;
  if (/(^(audio|art)\/)|\.(png|mp3|ogg|webp|svg|jpg|json|js)$/.test(value) || /^#[0-9a-fA-F]{3,8}$/.test(value) || /^\d{4}-\d{2}-\d{2}/.test(value)) return false;
  if (ID_KEYS.has(key) && /^[a-z0-9][a-z0-9._:-]*$/.test(value)) return false;
  return true;
}

// Every string of the Polish data with the English at its place:
// { path, key, polish, english } (english undefined when there is none).
function* dataLeaves(polish, english, path, key = null) {
  const step = (name) => (path.endsWith(':') ? `${path}${name}` : `${path}.${name}`);
  if (typeof polish === 'string') yield { path, key, polish, english };
  else if (Array.isArray(polish)) {
    const by = overlayKey(polish);
    if (by) for (const item of polish) yield* dataLeaves(item, isObject(english) ? english[item[by]] : undefined, step(item[by]), key);
    else for (const [index, item] of polish.entries()) yield* dataLeaves(item, Array.isArray(english) ? english[index] : undefined, `${path}[${index}]`, key);
  } else if (isObject(polish)) {
    for (const [name, value] of Object.entries(polish)) {
      if (!name.startsWith('$')) yield* dataLeaves(value, isObject(english) ? english[name] : undefined, step(name), name);
    }
  }
}

// English with nothing Polish under it, or not a text there.
function* strayLeaves(polish, english, path) {
  const step = (name) => (path.endsWith(':') ? `${path}${name}` : `${path}.${name}`);
  if (english === undefined || english === null) return;
  if (typeof english === 'string') {
    if (typeof polish !== 'string') yield path;
    return;
  }
  if (Array.isArray(polish) && overlayKey(polish)) {
    const by = overlayKey(polish);
    if (!isObject(english)) yield path;
    else for (const [name, value] of Object.entries(english)) if (!name.startsWith('$')) yield* strayLeaves(polish.find((item) => item[by] === name), value, step(name));
  } else if (Array.isArray(polish)) {
    if (!Array.isArray(english)) yield path;
    else for (const [index, value] of english.entries()) yield* strayLeaves(polish[index], value, `${path}[${index}]`);
  } else if (isObject(polish) && isObject(english)) {
    for (const [name, value] of Object.entries(english)) if (!name.startsWith('$')) yield* strayLeaves(polish[name], value, step(name));
  } else yield path;
}

// "{hits|cios|ciosy|ciosów}" (counted, src/engine/text.js) counts as {hits}.
const placeholders = (text) => (text.match(/\{\w+(?:\|[^|{}]*){0,3}\}/g) ?? []).map((one) => one.replace(/\|.*\}$/, '}')).sort().join(' ');
const shape = (text) => text.replace(/\{\w*\}/g, '{}');
export const hashOf = (text) => createHash('sha1').update(text).digest('hex').slice(0, 12);

const covers = (entry, path) => path === entry || path.startsWith(`${entry}.`) || path.startsWith(`${entry}[`) || (entry.endsWith(':') && path.startsWith(entry)) || path.startsWith(`${entry}:`);
// A `!` entry: left Polish on purpose (an id, a personal name).
const leftOut = (path, scope) => scope.some((entry) => entry.startsWith('!') && covers(entry.slice(1), path));
const inScope = (path, scope) => scope.some((entry) => !entry.startsWith('!') && covers(entry, path)) && !leftOut(path, scope);

// --- The check -------------------------------------------------------------

export function checkTranslations({ root = ROOT, all = false } = {}) {
  const en = join(root, 'data/en');
  const scope = readJson(join(en, 'scope.json'));
  const strings = readJson(join(en, 'strings.json'));
  const sources = existsSync(join(en, 'sources.json')) ? readJson(join(en, 'sources.json')) : {};
  const ignored = new Set(scope.ignore ?? []);
  const result = { missing: [], superfluous: [], variables: [], outdated: [], unstamped: [], unwired: [], glossary: [], outside: {}, stamps: {} };
  // The key names: a text that is the name itself has the glossary's English
  // (an abbreviation, `short`, aside).
  const names = new Map(
    existsSync(join(en, 'glossary.json')) ? readJson(join(en, 'glossary.json')).groups.flatMap((group) => group.terms.map((term) => [term.pl, term.en])) : [],
  );
  const named = (where, polish, english) => {
    if (names.has(polish) && english !== names.get(polish)) result.glossary.push({ where, text: polish, english: `${english} (słownik: ${names.get(polish)})` });
  };

  // The data.
  const server = readFileSync(join(root, 'src/server/content.js'), 'utf8');
  const overlayNames = readdirSync(en).filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -5)).filter((name) => !SPECIAL.has(name));
  for (const name of overlayNames) {
    if (!existsSync(join(root, `data/${name}.json`))) result.superfluous.push({ where: `data/en/${name}.json`, text: 'nie ma takiego pliku danych' });
    else if (!server.includes(`data/en/${name}.json`) || !new RegExp(`['"]?${name}['"]?\\s*:\\s*en`).test(server)) result.unwired.push({ where: `data/en/${name}.json`, text: 'src/server/content.js nie nakłada go na dane (import i OVERLAYS)' });
  }
  const dataNames = readdirSync(join(root, 'data')).filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -5));
  for (const name of dataNames) {
    const polish = readJson(join(root, `data/${name}.json`));
    const english = overlayNames.includes(name) ? readJson(join(en, `${name}.json`)) : undefined;
    for (const leaf of dataLeaves(polish, english, `${name}:`)) {
      if (!dataText(leaf.polish, leaf.key)) continue;
      const translated = typeof leaf.english === 'string' && leaf.english !== '';
      const scoped = inScope(leaf.path, scope.data);
      if (!translated) {
        if (scoped) result.missing.push({ where: `data/${name}.json ${leaf.path.slice(name.length + 1)}`, text: leaf.polish });
        else if (!leftOut(leaf.path, scope.data)) result.outside[`data/${name}.json`] = (result.outside[`data/${name}.json`] ?? 0) + 1;
        continue;
      }
      if (placeholders(leaf.polish) !== placeholders(leaf.english)) result.variables.push({ where: `data/en/${name}.json ${leaf.path.slice(name.length + 1)}`, text: leaf.polish, english: leaf.english });
      if (leaf.key !== 'short') named(`data/en/${name}.json ${leaf.path.slice(name.length + 1)}`, leaf.polish, leaf.english);
      const hash = hashOf(leaf.polish);
      result.stamps[leaf.path] = hash;
      if (!(leaf.path in sources)) result.unstamped.push({ where: `data/en/${name}.json ${leaf.path.slice(name.length + 1)}`, text: leaf.polish });
      else if (sources[leaf.path] !== hash) result.outdated.push({ where: `data/en/${name}.json ${leaf.path.slice(name.length + 1)}`, text: leaf.polish, english: leaf.english });
    }
    for (const path of strayLeaves(polish, english, `${name}:`)) result.superfluous.push({ where: `data/en/${name}.json ${path.slice(name.length + 1)}`, text: 'brak polskiego tekstu w tym miejscu' });
  }

  // The code.
  const dictionary = Object.entries(strings).filter(([key]) => !key.startsWith('$'));
  const exact = new Map(dictionary);
  const byShape = new Map(dictionary.map(([key, value]) => [shape(key), value]));
  const seen = new Set();
  const translatedFiles = new Set(scope.code);
  for (const file of sourceFiles(root)) {
    const source = readFileSync(join(root, file), 'utf8');
    const found = file.endsWith('.html') ? { keys: [], plurals: [], texts: htmlTexts(source), all: [] } : codeTexts(source, { client: file.startsWith('src/client/') });
    // Every literal, for the English no code uses any more.
    for (const text of found.all) seen.add(shape(text));
    const scoped = translatedFiles.has(file);
    const need = (text, line, has) => {
      if (ignored.has(text)) return;
      if (has) return;
      if (scoped) result.missing.push({ where: `${file}:${line}`, text });
      else if (all) result.outside[file] = (result.outside[file] ?? 0) + 1;
    };
    for (const { text, line } of found.keys) {
      seen.add(text);
      need(text, line, exact.has(text));
    }
    for (const { text, line } of found.plurals) {
      seen.add(text);
      need(text, line, exact.has(text));
    }
    for (const { text, line } of found.texts) {
      seen.add(shape(text));
      need(text, line, exact.has(text) || byShape.has(shape(text)));
    }
  }
  for (const [key, value] of dictionary) {
    if (!seen.has(key) && !seen.has(shape(key))) result.superfluous.push({ where: 'data/en/strings.json', text: key });
    named('data/en/strings.json', key, value);
    if (key.includes('|') && !key.includes('{')) {
      if (typeof value !== 'string' || value.split('|').length > 2 || /\{\w+\}/.test(value)) result.variables.push({ where: 'data/en/strings.json', text: key, english: value });
    } else if (typeof value !== 'string' || placeholders(key) !== placeholders(value)) result.variables.push({ where: 'data/en/strings.json', text: key, english: value });
  }
  for (const list of ['missing', 'superfluous', 'variables', 'outdated', 'unstamped', 'glossary']) {
    result[list] = [...new Map(result[list].map((entry) => [`${entry.where}\u0000${entry.text}`, entry])).values()];
  }
  return result;
}

// The hashes of the Polish under the English data texts: only those without
// one (`every` false), or all of them.
export function stamp({ root = ROOT, every = false } = {}) {
  const path = join(root, 'data/en/sources.json');
  const before = existsSync(path) ? readJson(path) : {};
  const { stamps } = checkTranslations({ root });
  const after = Object.fromEntries(Object.entries(stamps).map(([key, hash]) => [key, every || !(key in before) ? hash : before[key]]).sort(([a], [b]) => (a < b ? -1 : 1)));
  writeFileSync(path, `${JSON.stringify(after, null, 2)}\n`);
  return Object.keys(after).filter((key) => before[key] !== after[key]).length;
}

// --- The command -----------------------------------------------------------

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = new Set(process.argv.slice(2));
  if (args.has('--stamp') || args.has('--stamp-all')) {
    const changed = stamp({ every: args.has('--stamp-all') });
    console.log(`data/en/sources.json: zapisano ${changed} skrótów polskiego tekstu.`);
  }
  const result = checkTranslations({ all: args.has('--all') });
  const show = (title, list, fails) => {
    if (list.length === 0) return;
    console.log(`\n${fails ? '✖' : '•'} ${title} (${list.length}):`);
    for (const entry of list) console.log(`  ${entry.where}: ${JSON.stringify(entry.text)}${entry.english !== undefined ? ` → ${JSON.stringify(entry.english)}` : ''}`);
  };
  show('Brakujące tłumaczenia w częściach już przetłumaczonych', result.missing, true);
  show('Niezgodne zmienne {…}', result.variables, true);
  show('Nieaktualne: polski zmienił się po angielskim', result.outdated, true);
  show('Bez skrótu polskiego (node tools/i18n-check.mjs --stamp)', result.unstamped, true);
  show('Niepodpięte pliki tłumaczeń', result.unwired, true);
  show('Niezgodne ze słownikiem nazw (data/en/glossary.json)', result.glossary, true);
  show('Zbędne wpisy', result.superfluous, false);
  const outside = Object.entries(result.outside).sort(([a], [b]) => (a < b ? -1 : 1));
  if (args.has('--all') && outside.length > 0) {
    console.log(`\n• Bez tłumaczenia poza częściami przetłumaczonymi (${outside.reduce((sum, [, count]) => sum + count, 0)}):`);
    for (const [where, count] of outside) console.log(`  ${where}: ${count}`);
  }
  const failed = ['missing', 'variables', 'outdated', 'unstamped', 'unwired', 'glossary'].some((list) => result[list].length > 0);
  console.log(failed ? '\nTłumaczenia wymagają poprawek.' : '\nTłumaczenia części przetłumaczonych są kompletne.');
  process.exit(failed ? 1 : 0);
}


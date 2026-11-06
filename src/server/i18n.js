// The English beta (490–497 A, 691–697 A): the language each request is
// answered in, and the English of the texts written in the code.
//
// Requests of different players interleave in one Worker, so the language
// is kept apart for each request (AsyncLocalStorage, from the `nodejs_als`
// compatibility flag in wrangler.jsonc): content() (content.js) gives the
// game's data in it, t() a text of the code, and errorResponse() (http.js)
// an error's message. Outside a request (the cron) it is Polish, unless
// runInLanguage names another, as an account's own (users.language) for
// what the server sends that account by itself.
//
// The English of a text of the code is in data/en/strings.json under the
// Polish text itself, so Polish stays the only source: a text without its
// English shows in Polish, and a Polish text changed has none until it is
// translated again (tools/i18n-check.mjs lists what is missing). {name}
// stands for what the code fills in, the same in both languages. A Polish
// noun after a number has its three forms as one key ("punkt|punkty|
// punktów") and English its two ("point|points").

import { AsyncLocalStorage } from 'node:async_hooks';
import english from '../../data/en/strings.json' with { type: 'json' };
import { englishOn } from './features.js';

export const LANGUAGES = ['pl', 'en'];
const DICTIONARIES = { en: english };
const storage = new AsyncLocalStorage();

export const language = () => storage.getStore() ?? 'pl';
export const runInLanguage = (lang, task) => storage.run(LANGUAGES.includes(lang) ? lang : 'pl', task);

// A request's language: Polish where English is off (the live game);
// otherwise the page's own choice (X-Lang, src/client/i18n.js), and without
// one the browser's first language, Polish for a Polish phone and English
// for any other (a link from a mail, the return from Google). No language
// at all, as a test's or a tool's request, is Polish.
export function requestLanguage(request) {
  if (!englishOn()) return 'pl';
  const chosen = request.headers.get('X-Lang');
  if (LANGUAGES.includes(chosen)) return chosen;
  const first = (request.headers.get('Accept-Language') ?? '').split(',')[0].split(';')[0].trim().toLowerCase();
  if (first === '' || first === '*') return 'pl';
  return first === 'pl' || first.startsWith('pl-') ? 'pl' : 'en';
}

// An account's language as stored (users.language), Polish where English
// is off.
export const accountLanguage = (stored) => (englishOn() && LANGUAGES.includes(stored) ? stored : 'pl');

// Whether the server speaks a language: Polish always, English where it is
// on (the English chat channel, content.js).
export const languageOffered = (lang) => accountLanguage(lang) === lang;

// The English of the code's texts, or null for Polish.
export const dictionary = (lang = language()) => DICTIONARIES[lang] ?? null;

// The same without the file's notes ($comment): for the page, and for the
// texts the engine writes itself (word(), which content.js gives it).
const pageWords = new Map();
export function pageDictionary(lang = language()) {
  const words = dictionary(lang);
  if (!words) return {};
  if (!pageWords.has(lang)) pageWords.set(lang, Object.fromEntries(Object.entries(words).filter(([key]) => !key.startsWith('$'))));
  return pageWords.get(lang);
}

// {name} filled in; one the code did not give stays as it is.
const fill = (template, vars) => template.replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole));

const englishOf = (words, text) => {
  const found = words && Object.hasOwn(words, text) ? words[text] : undefined;
  return typeof found === 'string' && found !== '' ? found : null;
};

// A text of the code in the request's language, with its {name} filled in.
export function t(text, vars = null) {
  const template = englishOf(dictionary(), text) ?? text;
  return vars ? fill(template, vars) : template;
}

// A message the code wrote in Polish, in the request's language: its own
// English, or the English of one of the texts with {name} it was made from,
// with the parts it was filled with in their places: a part with English of
// its own in it (a sentence the code added), a number as English writes it.
// A message without English stays Polish.
export function translateMessage(message) {
  const words = dictionary();
  if (!words || typeof message !== 'string') return message;
  const exact = englishOf(words, message);
  if (exact !== null) return exact;
  for (const pattern of patternsOf(words)) {
    const found = pattern.regex.exec(message);
    if (found) return fill(pattern.english, Object.fromEntries(pattern.names.map((name, index) => [name, englishOf(words, found[index + 1]) ?? englishNumber(found[index + 1])])));
  }
  return message;
}

// The texts with {name}, as patterns, the longest fixed text first, so a
// message takes the one that says the most of it.
const compiled = new WeakMap();
function patternsOf(words) {
  if (!compiled.has(words)) {
    const patterns = Object.entries(words)
      .filter(([polish, text]) => /\{\w+\}/.test(polish) && !polish.includes('|') && typeof text === 'string' && text !== '')
      .map(([polish, text]) => pattern(polish, text))
      .sort((a, b) => b.fixed - a.fixed);
    compiled.set(words, patterns);
  }
  return compiled.get(words);
}

function pattern(polish, english) {
  const names = [];
  let fixed = 0;
  const source = polish
    .split(/(\{\w+\})/)
    .map((part, index) => {
      if (index % 2 === 1) {
        names.push(part.slice(1, -1));
        return '([\\s\\S]+?)';
      }
      fixed += part.length;
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return { regex: new RegExp(`^${source}$`), names, english, fixed };
}

// "12 345" and "1,5" as Polish writes them become "12,345" and "1.5".
const POLISH_NUMBER = /^-?(?:\d{1,3}(?:[   ]\d{3})+(?:,\d+)?|\d+,\d+)$/;
const englishFormat = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 6 });
const englishNumber = (value) => (POLISH_NUMBER.test(value) ? englishFormat.format(Number(value.replace(/[   ]/g, '').replace(',', '.'))) : value);

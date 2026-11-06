// The machine translation of chat messages, "A→ Przetłumacz" (714 A,
// DECISIONS.md, „Tłumaczenie na czacie”): Cloudflare Workers AI with the
// m2m100 model, where English is on. The binding (AI) is only in the test
// version's settings (wrangler.jsonc): it has no local stand-in and always
// calls the Cloudflare account, so tests and local work use a stand-in
// that marks the text instead (FAKE_TRANSLATOR "on"), and without either
// the chat shows no button.

import { englishOn } from './features.js';

const MODEL = '@cf/meta/m2m100-1.2b';
// The model's schema names the languages by codes ("en"); its examples by
// names ("english"). The names are tried when the codes give nothing.
const NAMES = { pl: 'polish', en: 'english' };

// Whether the chat offers translations here.
export const translationOn = (env) => englishOn() && Boolean(env.AI || env.FAKE_TRANSLATOR === 'on');

// Words only one of the two languages writes, for telling which one a
// message is in. Words both write ("a", "i", "no", "to", "do", "on") are
// left out.
const POLISH_LETTERS = /[ąćęłńóśźż]/iu;
const POLISH_WORDS = new Set(
  'w z na nie się sie jest że ze co jak ktoś ktos gdzie mam masz ma czy ale tak już juz jestem dla po od ja ty mi mnie tu tam jaki jakie który ktory kto ile bo też tez teraz jeszcze może moze wszyscy wszystkim proszę prosze dzięki dzieki siema hej cześć czesc elo spoko fajnie fajny dobry dobra dobre poziom poziomie mój moj twój twoj ten ta tego tym kiedy coś cos nic był byl była byla będzie bedzie trzeba warto chyba bardzo'.split(' '),
);
const ENGLISH_WORDS = new Set(
  "the is are and you of in it what where how anyone has have for with this that my your can hi hello thanks thank yes please need know level who any be was will just im i'm get got but not its it's all at there here some good nice does doesn't don't can't is there we they them our about from when why which would could should really very".split(' '),
);

// The language of a message, "pl" or "en": by its Polish letters and the
// words only one language writes, else the one its writer plays in.
export function guessLanguage(text, fallback = 'pl') {
  const words = String(text).toLowerCase().match(/[\p{L}']+/gu) ?? [];
  let polish = POLISH_LETTERS.test(text) ? 3 : 0;
  let english = 0;
  for (const word of words) {
    if (POLISH_WORDS.has(word)) polish += 1;
    if (ENGLISH_WORDS.has(word)) english += 1;
  }
  if (polish > english) return 'pl';
  if (english > polish) return 'en';
  return fallback === 'en' ? 'en' : 'pl';
}

// The text in the `to` language, or null when the translator gives nothing.
export async function translateText(env, text, from, to) {
  if (env.AI) {
    for (const [source, target] of [
      [from, to],
      [NAMES[from], NAMES[to]],
    ]) {
      try {
        const answer = await env.AI.run(MODEL, { text, source_lang: source, target_lang: target });
        const translated = typeof answer?.translated_text === 'string' ? answer.translated_text.trim() : '';
        if (translated) return translated;
        console.error('translate: no text', JSON.stringify(answer).slice(0, 300));
      } catch (error) {
        console.error('translate:', error);
      }
    }
    return null;
  }
  if (env.FAKE_TRANSLATOR === 'on') return `[${from}→${to}] ${text}`;
  return null;
}

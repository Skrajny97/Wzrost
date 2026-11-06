// Report texts come in several variants per message. The variant is picked by
// an index, not by the random generator, so writing text never changes a fight.

export function say(texts, key, index, vars = {}) {
  const variants = texts[key];
  const template = variants[index % variants.length];
  return template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
}

// A noun after a number, in Polish: 1, then 2–4 (but not 12–14), then the rest.
export function countedForm(count, [one, few, many]) {
  if (count === 1) return one;
  const last = count % 10;
  const tens = count % 100;
  return last >= 2 && last <= 4 && (tens < 12 || tens > 14) ? few : many;
}

// A text the engine itself writes (not one of the data), in the content's
// language, with {name} filled in from `vars`; one it was not given stays as
// written. The engine stays pure: the English comes with the content it is
// given (`words`, which src/server/content.js lays on each language's
// content: data/en/strings.json for English, nothing for Polish), as t()
// gives the server's own texts. A text without its English stays Polish, as
// does every text without a content.
export function word(content, text, vars = null) {
  const english = content?.words && Object.hasOwn(content.words, text) ? content.words[text] : null;
  const template = typeof english === 'string' && english !== '' ? english : text;
  return vars ? template.replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole)) : template;
}

// Whether the content is in English (`language`, from src/server/content.js);
// the data the engine is built from, as in its tests, is Polish.
const inEnglish = (content) => content?.language === 'en';

// A name inside a sentence or a list: Polish writes it small ("skóra wilka
// ×2", "drewno +3"), English as the name itself is written ("Wolf Pelt ×2",
// "Wood +3"), its capitals being the name's.
export const nameInText = (name, content) => (inEnglish(content) ? name : name.toLowerCase());

// A number with up to one decimal, as the content's language writes it:
// "0,5" in Polish, "0.5" in English.
export function decimalText(value, content) {
  const text = String(Math.round(value * 10) / 10);
  return inEnglish(content) ? text : text.replace('.', ',');
}

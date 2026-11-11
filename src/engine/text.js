// @ts-check
// Report texts come in several variants per message. The variant is picked by
// an index, not by the random generator, so writing text never changes a fight.

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {Record<string, unknown>} Vars What a text's {name} gaps are filled with. */

/**
 * @param {Record<string, string[]>} texts
 * @param {string} key
 * @param {number} index
 * @param {Vars} [vars]
 */
export function say(texts, key, index, vars = {}) {
  const variants = texts[key];
  const template = variants[index % variants.length];
  return counted(template, vars).replace(/\{(\w+)\}/g, (_, /** @type {string} */ name) => String(vars[name] ?? ''));
}

// "{hits|cios|ciosy|ciosów}" in a text: the number and after it the words
// in their form for it (countedForm), "3 ciosy", "5 ciosów"; English needs
// none of it ("{hits} blows").
/**
 * @param {string} template
 * @param {Vars} vars
 */
export function counted(template, vars) {
  return template.replace(/\{(\w+)\|([^|{}]*)\|([^|{}]*)\|([^|{}]*)\}/g, (/** @type {string} */ whole, /** @type {string} */ name, /** @type {string} */ one, /** @type {string} */ few, /** @type {string} */ many) => {
    const value = vars[name];
    if (typeof value !== 'number') return whole;
    const count = Math.round(value);
    return `${count} ${countedForm(count, [one, few, many])}`;
  });
}

// A noun after a number, in Polish: 1, then 2–4 (but not 12–14), then the rest.
/**
 * @template T
 * @param {number} count
 * @param {T[]} forms one, few, many
 * @returns {T}
 */
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
/**
 * @param {Content | null | undefined} content
 * @param {string} text
 * @param {Vars | null} [vars]
 * @returns {string}
 */
export function word(content, text, vars = null) {
  const english = content?.words && Object.hasOwn(content.words, text) ? content.words[text] : null;
  const template = typeof english === 'string' && english !== '' ? english : text;
  return vars ? template.replace(/\{(\w+)\}/g, (/** @type {string} */ whole, /** @type {string} */ name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole)) : template;
}

// Whether the content is in English (`language`, from src/server/content.js);
// the data the engine is built from, as in its tests, is Polish.
/** @param {Content | null | undefined} content */
const inEnglish = (content) => content?.language === 'en';

// A name inside a sentence or a list: Polish writes it small ("skóra wilka
// ×2", "drewno +3"), English as the name itself is written ("Wolf Pelt ×2",
// "Wood +3"), its capitals being the name's.
/**
 * @param {string} name
 * @param {Content | null | undefined} content
 */
export const nameInText = (name, content) => (inEnglish(content) ? name : name.toLowerCase());

// A number with up to one decimal, as the content's language writes it:
// "0,5" in Polish, "0.5" in English.
/**
 * @param {number} value
 * @param {Content | null | undefined} content
 */
export function decimalText(value, content) {
  const text = String(Math.round(value * 10) / 10);
  return inEnglish(content) ? text : text.replace('.', ',');
}

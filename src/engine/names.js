// @ts-check
// Character names the game does not allow (the author: "Chcemy
// najłagodniejszego filtra jaki jest możliwy, ale [...] musi być"): a name
// that holds one of the chat's words (data/chat.json, only strong
// vulgarities and slurs), also when it is hidden behind digits or
// look-alike letters, doubled letters, or spaces, hyphens, apostrophes and
// underscores between its letters. Nothing else counts, so a name is never
// refused for a word that merely looks rude.
//
// And the alphabets a name may be written in, and how it looks (review of
// 12.11.2026): letters of other scripts, as the Hangul fillers, show as
// nothing, and a name with a Cyrillic or Greek letter looking like a Latin
// one passed as another player's.

// Letters that look like Latin ones, case by case (a capital Cyrillic Н
// is an H, its small н is no h): of the Cyrillic and the Greek alphabet,
// and Latin letters seldom typed that look like common ones (a dotless ı).
/** @type {Record<string, string>} */
const LOOK_ALIKE = {
  // Cyrillic
  А: 'A', В: 'B', Е: 'E', Ё: 'Ë', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', У: 'Y', Х: 'X', Ѕ: 'S', І: 'I', Ї: 'Ï', Ј: 'J', Ү: 'Y', Һ: 'H', Ԛ: 'Q', Ԝ: 'W', Ӏ: 'I',
  а: 'a', е: 'e', ё: 'ë', к: 'k', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', ѕ: 's', і: 'i', ї: 'ï', ј: 'j', ԁ: 'd', ԛ: 'q', ԝ: 'w', һ: 'h', ү: 'y', ӏ: 'l',
  // Greek
  Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N', Ο: 'O', Ρ: 'P', Τ: 'T', Υ: 'Y', Χ: 'X',
  α: 'a', β: 'b', γ: 'y', ε: 'e', η: 'n', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x', ω: 'w',
  // Latin
  ı: 'i', ɪ: 'i', ɩ: 'i', ʟ: 'l', ǀ: 'l', ɡ: 'g', ɑ: 'a',
};

// A name as it looks: each look-alike letter as the Latin letter it shows,
// in lower case. Two names that look alike look the same here.
/**
 * @param {string} name
 * @returns {string}
 */
export function nameLook(name) {
  return [...String(name)]
    .map((sign) => LOOK_ALIKE[sign] ?? sign)
    .join('')
    .toLowerCase();
}

// The alphabets a name's letters may come from, one in a name.
const ALPHABETS = /** @type {const} */ ([
  ['latin', /\p{Script=Latin}/u],
  ['greek', /\p{Script=Greek}/u],
  ['cyrillic', /\p{Script=Cyrillic}/u],
]);

// The alphabet of a letter, or null for a sign that is no letter of one.
/**
 * @param {string} sign
 * @returns {string | null}
 */
export function alphabetOf(sign) {
  if (!/^\p{L}$/u.test(sign)) return null;
  return ALPHABETS.find(([, pattern]) => pattern.test(sign))?.[0] ?? null;
}

// The alphabets of a text's letters.
/**
 * @param {string} text
 * @returns {Set<string>}
 */
export function alphabetsOf(text) {
  return new Set([...text].map(alphabetOf).filter((alphabet) => alphabet !== null));
}

// Signs standing in for Latin letters once the name is in lower case:
// digits, and the ł, which has no accent to drop.
/** @type {Record<string, string>} */
const LOOKALIKES = {
  0: 'o',
  3: 'e',
  4: 'a',
  5: 's',
  7: 't',
  8: 'b',
  ł: 'l',
};

// The name in plain Latin letters, without accents and what stands between
// them; "1" is read both as "i" and as "l". Wide, raised or mathematical
// letters (NFKD) read as the plain ones.
/**
 * @param {string} name
 * @returns {string[]}
 */
function readings(name) {
  const letters = [...nameLook(name.normalize('NFKD').replace(/\p{M}/gu, '')).normalize('NFKD').replace(/\p{M}/gu, '')]
    .map((sign) => LOOKALIKES[sign] ?? sign)
    .join('');
  return ['i', 'l'].map((one) => letters.replaceAll('1', one).replace(/[^a-z]/g, ''));
}

// A word with each of its letters allowed more than once ("kuurwa").
/** @type {Map<string, RegExp>} */
const patterns = new Map();
/** @param {string} word */
const pattern = (word) => {
  let found = patterns.get(word);
  if (!found) {
    found = new RegExp([...word].map((letter) => `${letter}+`).join(''));
    patterns.set(word, found);
  }
  return found;
};

/**
 * @param {unknown} name
 * @param {{ chat?: { words?: readonly string[] } }} content
 * @returns {boolean}
 */
export function blockedName(name, content) {
  const words = content.chat?.words ?? [];
  const plain = readings(String(name ?? ''));
  return words.some((word) => plain.some((reading) => pattern(word.normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l')).test(reading)));
}

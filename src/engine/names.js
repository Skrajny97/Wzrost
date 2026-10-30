// Character names the game does not allow (the author: "Chcemy
// najłagodniejszego filtra jaki jest możliwy, ale [...] musi być"): a name
// that holds one of the chat's words (data/chat.json, only strong
// vulgarities and slurs), also when it is hidden behind digits or
// look-alike letters, doubled letters, or spaces, hyphens, apostrophes and
// underscores between its letters. Nothing else counts, so a name is never
// refused for a word that merely looks rude.

// Signs standing in for Latin letters: digits and Cyrillic look-alikes.
const LOOKALIKES = {
  0: 'o',
  3: 'e',
  4: 'a',
  5: 's',
  7: 't',
  8: 'b',
  ł: 'l',
  а: 'a',
  е: 'e',
  о: 'o',
  р: 'p',
  с: 'c',
  у: 'y',
  х: 'x',
  к: 'k',
  і: 'i',
  ј: 'j',
  ѕ: 's',
};

// The name in plain Latin letters, without accents and what stands between
// them; "1" is read both as "i" and as "l".
function readings(name) {
  const letters = [...name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()].map((sign) => LOOKALIKES[sign] ?? sign).join('');
  return ['i', 'l'].map((one) => letters.replaceAll('1', one).replace(/[^a-z]/g, ''));
}

// A word with each of its letters allowed more than once ("kuurwa").
const patterns = new Map();
const pattern = (word) => {
  if (!patterns.has(word)) patterns.set(word, new RegExp([...word].map((letter) => `${letter}+`).join('')));
  return patterns.get(word);
};

export function blockedName(name, content) {
  const words = content.chat?.words ?? [];
  const plain = readings(String(name ?? ''));
  return words.some((word) => plain.some((reading) => pattern(word.normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l')).test(reading)));
}

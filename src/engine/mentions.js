// Mentions in the chat (DECISIONS.md, "Oznaczanie na czacie (634 A)"): "@"
// right before a character's whole name tags that character. A name has 2
// to 20 signs, letters, digits, spaces, hyphens, apostrophes and
// underscores, from a letter to a letter or a digit (validateName in
// src/server/characters.js), so after "@" it may end at any space, hyphen
// or apostrophe, and at the end of a word: each such end is a name it may
// be, and the longest one some character has wins ("@Anna Maria, hej"
// tags Anna Maria when she is there, else Anna). The letter case does not
// count, as no two characters share a name whatever its case (name_key in
// the database). An "@" inside a word ("ala@ola") and a name that runs on
// into more letters ("@Alana" for Ala) tag nobody.

const NAME_LENGTH = { min: 2, max: 20 };
const NAME_SIGN = /^[\p{L}\p{N}_' -]$/u;
const WORD_SIGN = /^[\p{L}\p{N}_]$/u;
const FIRST_SIGN = /^\p{L}$/u;
const LAST_SIGN = /^[\p{L}\p{N}]$/u;

// The key a name is kept under (name_key), whatever its letter case.
export const mentionKey = (name) => String(name).toLowerCase();

// The places in `text` where "@" may start a name, in their order, each
// with the names it may be there, the longest first: { at, names: [{
// written, key }] }, `written` as the text has it and `key` for the lookup.
export function mentionPlaces(text) {
  const signs = Array.from(String(text ?? ''));
  const places = [];
  signs.forEach((sign, at) => {
    if (sign !== '@' || (at > 0 && WORD_SIGN.test(signs[at - 1])) || !FIRST_SIGN.test(signs[at + 1] ?? '')) return;
    const names = [];
    for (let end = at + 1; end < signs.length && end - at <= NAME_LENGTH.max && NAME_SIGN.test(signs[end]); end += 1) {
      if (end - at >= NAME_LENGTH.min && LAST_SIGN.test(signs[end]) && !WORD_SIGN.test(signs[end + 1] ?? '')) {
        const written = signs.slice(at + 1, end + 1).join('');
        names.unshift({ written, key: mentionKey(written) });
      }
    }
    if (names.length > 0) places.push({ at, names });
  });
  return places;
}

// The characters the places tag, in the order they first stand, each once:
// at each place the longest of its names that `known` (Map key →
// character) has, as { character, written }. Which of them may be tagged
// is for the caller to say after this choice, so a longer name nobody may
// tag never hands its place to a shorter one ("@Anna Maria" is never Anna).
export function pickMentions(places, known) {
  const picked = [];
  const taken = new Set();
  for (const place of places) {
    const name = place.names.find((candidate) => known.has(candidate.key));
    if (!name || taken.has(name.key)) continue;
    taken.add(name.key);
    picked.push({ character: known.get(name.key), written: name.written });
  }
  return picked;
}

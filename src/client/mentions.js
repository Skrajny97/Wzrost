// Tagging in the chat (src/server/mentions.js; DECISIONS.md, "Oznaczanie na
// czacie (634 A)"): the name typed after "@" in the line to write in, the
// characters it may be, the line with a whole name put in, and the tags a
// message shows. Names are as the game allows them: 2 to 20 letters,
// digits, spaces, hyphens, apostrophes and underscores, from a letter
// (validateName in src/server/characters.js).

const NAME_SIGN = /[\p{L}\p{N}_' -]/u;
const WORD_SIGN = /[\p{L}\p{N}_]/u;
const NAME_MOST = 20;

// The name being typed after "@" up to the caret: { start, query }, where
// `start` is the place of "@"; null when the caret is not in one. An "@"
// inside a word ("ala@") starts none.
export function typedMention(value, caret = value.length) {
  const before = value.slice(0, caret);
  const start = before.lastIndexOf('@');
  if (start < 0 || (start > 0 && WORD_SIGN.test(before[start - 1]))) return null;
  const query = before.slice(start + 1);
  const signs = [...query];
  if (signs.length > NAME_MOST || query.includes('  ')) return null;
  if (signs.length > 0 && !/^\p{L}/u.test(query)) return null;
  return signs.every((sign) => NAME_SIGN.test(sign)) ? { start, query } : null;
}

// Letters as a typed name compares them: no case and no accents, so
// "lucja" finds Łucja.
const folded = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').replace(/[łŁ]/g, 'l').toLowerCase();

// Those of `people` ({ name, ... }, in the order to show them) whose names
// start with `query`, each name once, at most `most`.
export function matchingPeople(query, people, most) {
  const start = folded(query);
  const names = new Set();
  const found = [];
  for (const person of people) {
    const key = person.name.toLowerCase();
    if (names.has(key)) continue;
    names.add(key);
    if (folded(person.name).startsWith(start)) found.push(person);
    if (found.length >= most) break;
  }
  return found;
}

// The line with the name typed after "@" (from `start` up to the caret,
// with the rest of a word there) replaced by "@" and the whole `name` and
// a space: { value, caret }, the caret after that space.
export function withMention(value, start, caret, name) {
  let end = caret;
  while (end < value.length && WORD_SIGN.test(value[end])) end += 1;
  const tag = `@${name} `;
  return { value: value.slice(0, start) + tag + value.slice(end).replace(/^ /, ''), caret: start + tag.length };
}

// "Oznacz": "@" and the whole name at the end of the line, after what is
// there with a space between, and a space after it.
export function appendMention(value, name) {
  const before = value.replace(/\s+$/, '');
  return `${before}${before ? ' ' : ''}@${name} `;
}

// The message's text in parts: plain text, and { tag } where "@" and one
// of the names it tags (`written`, as the writer typed them) stand whole.
export function taggedParts(text, written = []) {
  if (written.length === 0) return [text];
  const names = [...written].sort((a, b) => b.length - a.length);
  const parts = [];
  let plain = '';
  let at = 0;
  while (at < text.length) {
    const name =
      text[at] === '@' && !(at > 0 && WORD_SIGN.test(text[at - 1]))
        ? names.find((one) => text.slice(at + 1, at + 1 + one.length).toLowerCase() === one.toLowerCase() && !WORD_SIGN.test(text[at + 1 + one.length] ?? ''))
        : undefined;
    if (name === undefined) {
      plain += text[at];
      at += 1;
      continue;
    }
    if (plain) parts.push(plain);
    plain = '';
    parts.push({ tag: text.slice(at, at + 1 + name.length) });
    at += 1 + name.length;
  }
  if (plain) parts.push(plain);
  return parts;
}

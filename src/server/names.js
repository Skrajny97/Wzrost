// The rules of the players' names: a character's (characters.js) and the
// account's name for the chat (832 A, accounts.js setAccountName), both by
// the same rules and the same filter of words (src/engine/names.js), and
// none of them shared by two players, whatever the letter case.

import { alphabetOf, alphabetsOf, blockedName, nameLook } from '../engine/index.js';
import { content } from './content.js';
import { ApiError } from './http.js';

const DAY = 24 * 3600000;

// 2 to 20 characters: letters and digits, spaces, hyphens, apostrophes and
// underscores ("Justi_725"), from a letter to a letter or a digit. What a
// phone's keyboard adds unseen goes: invisible marks, letters split from
// their accents (joined again), a curly apostrophe (made straight); wide,
// raised or mathematical letters and digits become plain ones (NFKC). The
// letters come from one alphabet, Latin, Greek or Cyrillic (the security
// review of 12.11.2026: Hangul fillers made a name of nothing, and one
// Cyrillic letter copied another player's name). The message names what is
// wrong.
const nameCharacter = (character) => /^[0-9_' -]$/.test(character) || alphabetOf(character) !== null;
const ALLOWED_TEXT = 'Mogą być litery alfabetu łacińskiego, greckiego albo cyrylicy, cyfry, spacje, myślniki, apostrofy i podkreślniki.';

// A name by these rules, or an error with `words` (length, sign with {sign}
// for the sign that may not be there, invisible, alphabet, start, end,
// refused for the filter).
export function checkedName(value, words) {
  const name =
    typeof value === 'string'
      ? value.normalize('NFKC').replace(/\p{Cf}/gu, '').trim().replace(/\s+/g, ' ').replace(/[\u2018\u2019\u02bc]/g, "'")
      : '';
  const characters = [...name];
  const wrong = characters.find((character) => !nameCharacter(character));
  const problem =
    characters.length < 2 || characters.length > 20
      ? words.length
      : wrong && /\p{Default_Ignorable_Code_Point}/u.test(wrong)
        ? words.invisible
        : wrong
          ? words.sign.replace('{sign}', () => wrong)
          : alphabetsOf(name).size > 1
            ? words.alphabet
            : !/^\p{L}/u.test(name)
              ? words.start
              : !/[\p{L}0-9]$/u.test(name)
                ? words.end
                : null;
  if (problem) throw new ApiError(400, 'invalid_name', problem);
  // The mildest filter of vulgar names there can be (names.js).
  if (blockedName(name, content())) throw new ApiError(400, 'invalid_name', words.refused);
  // Nor the words of the chat's role tags, or a look of them: "Kowal
  // (admin)" would read as the author's message (the security review of
  // 12.11.2026). An l there reads as the i it may stand for ("AdmIn").
  if (RESERVED.has(lookKey(name).replaceAll('l', 'i'))) throw new ApiError(400, 'invalid_name', words.reserved);
  return name;
}

// A character's name, its words in the code (data/en/strings.json has
// their English).
export function validateName(value) {
  return checkedName(value, {
    length: 'Imię postaci musi mieć od 2 do 20 znaków.',
    sign: `Imię postaci nie może zawierać znaku „{sign}”. ${ALLOWED_TEXT}`,
    invisible: 'Imię postaci nie może zawierać niewidocznych znaków.',
    alphabet: 'Imię postaci musi być zapisane jednym alfabetem.',
    start: 'Imię postaci musi zaczynać się od litery.',
    end: 'Imię postaci musi kończyć się literą albo cyfrą.',
    refused: content().chat.names.refused,
    reserved: 'To imię jest zastrzeżone. Wybierz inne.',
  });
}

// No two players share a name, whatever the letter case
// (migrations/0009_unique_names.sql, 0118_account_names.sql).
export const nameKey = (name) => name.toLowerCase();

// Signs that look like others beyond nameLook's letters of other
// alphabets (the security review of 12.11.2026): a digit 0 like an o
// (the chat's font draws its digits low), a 1 and a capital I of any of the
// three alphabets like an l, and Latin small capitals, Greek and Cyrillic
// letters nameLook leaves out.
const LOOKS_MORE = {
  0: 'o', 1: 'l', I: 'l', Ι: 'l', І: 'l', Ӏ: 'l',
  Ϳ: 'J', ϳ: 'j', Ѵ: 'V', ѵ: 'v', ѡ: 'w',
  ᴀ: 'a', ʙ: 'b', ᴄ: 'c', ᴅ: 'd', ᴇ: 'e', ꜰ: 'f', ɢ: 'g', ʜ: 'h', ᴊ: 'j', ᴋ: 'k', ᴍ: 'm', ɴ: 'n', ᴏ: 'o', ᴘ: 'p', ʀ: 'r', ꜱ: 's', ᴛ: 't', ᴜ: 'u', ᴠ: 'v', ᴡ: 'w', ʏ: 'y', ᴢ: 'z',
};

// A name as it looks, to compare with others: the look-alike signs folded,
// letters of other alphabets as the Latin ones they show (nameLook in the
// engine) and accents compared on the same letters ("Κόκα" and "Kóka"), in
// lower case, as the names' keys keep them.
export function lookKey(name) {
  const folded = [...String(name).normalize('NFD')].map((sign) => LOOKS_MORE[sign] ?? sign).join('');
  return nameLook(folded).normalize('NFC');
}

// Whether two names look alike, also in other letter case: a capital I
// reads as an l, its small i does not ("WEDROWIEC" and "wedrowiec").
export const looksLike = (one, other) =>
  lookKey(one) === lookKey(other) || lookKey(one.toLowerCase()) === lookKey(other.toLowerCase());

// The words of the chat's role tags and of the System, no player's name
// (each without an l: checkedName reads an l as an i).
const RESERVED = new Set(['admin', 'administrator', 'moderator', 'system']);

// Whether a name in a column of names looks like `name`: the same letters
// but for some signs that look alike (lookKey), as characters.js
// refuseLookAlike asks of the characters' names (the code review of
// 12.11.2026). The names that may look like it are those whose key reads
// as its look, and those as long with a sign outside plain Latin letters
// (another alphabet, an accent), a digit or a capital I, whose
// looks are compared here. `names`: the table, its column of names and of
// their keys, and `where`, the rows to look at, with `binds` for it.
export async function looksTaken(db, names, name, binds) {
  const look = lookKey(name);
  const { results } = await db
    .prepare(
      `SELECT ${names.column} AS name FROM ${names.table} WHERE ${names.where}
         AND (${names.key} = ? OR (length(${names.column}) = ? AND (${names.column} GLOB '*[^ -~]*' OR ${names.column} GLOB '*[0-9I]*')))`,
    )
    .bind(...binds, look, [...name].length)
    .all();
  return results.some((row) => lookKey(row.name) === look);
}

// The other accounts' names (832 A), `binds`: [the account's own id].
export const ACCOUNT_NAMES = { table: 'users', column: 'account_name', key: 'account_name_key', where: 'id != ? AND account_name IS NOT NULL' };

// Every character but one, `binds`: [the character's own id, or 0].
export const ALL_CHARACTERS = { table: 'characters', column: 'name', key: 'name_key', where: "role IN ('player', 'aside') AND id != ?" };

// The characters of the other players, `binds`: [the account's own id].
export const OTHER_CHARACTERS = { table: 'characters', column: 'name', key: 'name_key', where: "user_id != ? AND role IN ('player', 'aside')" };

// The account's name as the chat shows it before a character's (832 A):
// none when the account has none, when the filter blocks it now (a word
// added to the filter later), or when it is that character's name itself.
export function chatAccountName(account, characterName) {
  if (typeof account !== 'string' || account === '' || blockedName(account, content())) return null;
  return nameKey(account) === nameKey(String(characterName ?? '')) ? null : account;
}

// The account's name as the page sees it (sessions.js userView), from the
// users' row: `accountName` (null until the player chooses one),
// `accountNameFrom` (when it may change again: 0 for now, as the first
// choice and the change of a name the filter blocks now) and
// `accountNameHint` (whether the chat tells once where to set it).
export function accountNameView(row) {
  const name = row.account_name ?? null;
  const days = content().chat.accounts.days;
  return {
    accountName: name,
    accountNameFrom: name !== null && !blockedName(name, content()) && row.account_name_at ? row.account_name_at + days * DAY : 0,
    accountNameHint: name === null && (row.account_name_hint ?? 0) === 0,
  };
}

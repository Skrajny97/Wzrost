// Gift codes (data/gift-codes.json; gift-codes.js in the engine; DECISIONS.md,
// "Kod podarunkowy"): a code typed in the settings gives its rewards to the
// character, once per account. The account's row in gift_codes_used is
// written together with the rewards, only if the character is as read (its
// version), so two taps give one gift and a code taken already gives none.

import { giftCodeOf, giftMovePair, giftRewardsText, normalCode, withGiftResources } from '../engine/index.js';
import { isAuthor } from './author.js';
import { characterView, loadPlayer, requirePlayer } from './characters.js';
import { content } from './content.js';
import { raced, sameVersion } from './atomic.js';
import { ApiError, json, readJson } from './http.js';
import { nameKey } from './names.js';
import { OWN_CHARACTERS } from './roles.js';
import { requireSession } from './sessions.js';

const usedText = () => content().giftTexts.used;

// The key of a character's name for a code given to it alone: the SHA-256 of
// the name in small letters, in hex. The repository is public, so the data
// keeps this key instead of the name.
export async function characterKey(name) {
  const bytes = new TextEncoder().encode(String(name ?? '').normalize('NFC').trim().toLocaleLowerCase('pl'));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// The key of a name for a move by the author's word (content.giftMoves): the
// SHA-256 of the name in small letters with its letters and digits only, so
// a space or an underscore the author did not type does not matter. The
// repository is public, so the data keeps this key instead of the name.
export async function looseKey(name) {
  const text = String(name ?? '').normalize('NFC').toLocaleLowerCase('pl').replace(/[^\p{L}\p{N}]/gu, '');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// The scheduled run (index.js), every ten minutes while a move waits: each
// move of content.giftMoves not made yet takes its Punkty Systemu from the
// character that took the code (never below none) and gives them to the
// other character of the same account, and the code's record goes with them.
// The move is written to gift_moves_done in the same batch, so it is made
// once; a move whose characters are not found waits for a later run. Only
// the accounts that took the code are read. Returns the moves made. The
// tests pass moves of their own, as the data's name no test character.
export async function moveGiftRewards(env, now, moves = content().giftMoves ?? []) {
  if (moves.length === 0 || new Date(now).getUTCMinutes() % 10 !== 0) return 0;
  const db = env.DB;
  const { results: done } = await db.prepare('SELECT id FROM gift_moves_done').all();
  let moved = 0;
  for (const move of moves.filter((one) => !done.some((row) => row.id === one.id))) {
    const { results: usedRows } = await db.prepare('SELECT user_id, character_id, gift_id FROM gift_codes_used WHERE gift_id = ?').bind(move.gift).all();
    if (usedRows.length === 0) continue;
    const { results: rows } = await db
      .prepare('SELECT id, user_id, name FROM characters WHERE user_id IN (SELECT user_id FROM gift_codes_used WHERE gift_id = ?)')
      .bind(move.gift)
      .all();
    const characters = await Promise.all(rows.map(async (row) => ({ id: row.id, userId: row.user_id, key: await looseKey(row.name) })));
    const used = usedRows.map((row) => ({ userId: row.user_id, characterId: row.character_id, giftId: row.gift_id }));
    const pair = giftMovePair(move, characters, used);
    if (!pair.from) continue;
    await db.batch([
      db.prepare('INSERT INTO gift_moves_done (id, done_at, from_character, to_character) VALUES (?, ?, ?, ?)').bind(move.id, now, pair.from.id, pair.to.id),
      db
        .prepare('UPDATE characters SET system_points = MAX(system_points - ?, 0), system_points_paid = MIN(system_points_paid, MAX(system_points - ?, 0)), version = version + 1 WHERE id = ?')
        .bind(move.systemPoints, move.systemPoints, pair.from.id),
      db.prepare('UPDATE characters SET system_points = system_points + ?, version = version + 1 WHERE id = ?').bind(move.systemPoints, pair.to.id),
      db
        .prepare('UPDATE gift_codes_used SET character_id = ? WHERE user_id = ? AND gift_id = ? AND character_id = ?')
        .bind(pair.to.id, pair.from.userId, move.gift, pair.from.id),
    ]);
    moved += 1;
  }
  return moved;
}

// The scheduled run (index.js), every ten minutes while a return waits: each
// return of content.giftReturns not made yet puts its item back into the bag
// of the character whose name has the key (looseKey), by the author's word
// (19.11.2026: „Tę kapę identyczną zwróć graczowi”). The return is written
// to gift_returns_done right after, so it is made once; a return whose
// character is not found waits. Returns the returns made. The tests pass
// returns of their own.
export async function returnGiftItems(env, now, returns = content().giftReturns ?? []) {
  if (returns.length === 0 || new Date(now).getUTCMinutes() % 10 !== 0) return 0;
  const db = env.DB;
  const { results: done } = await db.prepare('SELECT id FROM gift_returns_done').all();
  const waiting = returns.filter((one) => !done.some((row) => row.id === one.id));
  if (waiting.length === 0) return 0;
  const { results: rows } = await db.prepare('SELECT id, name FROM characters').all();
  const keyed = await Promise.all(rows.map(async (row) => ({ id: row.id, key: await looseKey(row.name) })));
  let returned = 0;
  for (const one of waiting) {
    const found = keyed.filter((each) => each.key === one.character);
    if (found.length !== 1) continue;
    const [character] = found;
    const [inserted] = await db.batch([
      db.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, ?) RETURNING id').bind(character.id, JSON.stringify(one.item), now),
      db.prepare('UPDATE characters SET version = version + 1 WHERE id = ?').bind(character.id),
    ]);
    await db.prepare('INSERT INTO gift_returns_done (id, done_at, character_id, item_id) VALUES (?, ?, ?, ?)').bind(one.id, now, character.id, inserted.results[0]?.id ?? null).run();
    returned += 1;
  }
  return returned;
}

// The codes an account may take no more: those it took, and a code for one
// character (`for`, by the key of its name) once any account took it, as a
// name freed by a rename could else take it again on another account (the
// code review, 0.2.71).
export async function usedCodes(db, userId, gifts = content().giftCodes) {
  const personal = gifts.filter((gift) => gift.for).map((gift) => gift.id);
  const { results } = await db
    .prepare('SELECT gift_id FROM gift_codes_used WHERE user_id = ? UNION SELECT gift_id FROM gift_codes_used WHERE gift_id IN (SELECT value FROM json_each(?))')
    .bind(userId, JSON.stringify(personal))
    .all();
  return results.map((row) => row.gift_id);
}

// POST /api/gift-code { code }
export async function redeemGiftCode(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const db = context.env.DB;
  const texts = content().giftTexts;
  // The data's codes and those the author made in the panel with this text.
  const typed = normalCode(body.code);
  const gifts = [...content().giftCodes, ...(typed ? await panelCodes(db, typed) : [])];
  const found = giftCodeOf(body.code, context.now, await usedCodes(db, session.userId, gifts), { ...content(), giftCodes: gifts }, await characterKey(player.row.name));
  if (found.reason === 'unknown') throw new ApiError(404, 'unknown_code', texts.unknown);
  if (found.reason === 'expired') throw new ApiError(400, 'expired_code', texts.expired);
  if (found.reason === 'used') throw new ApiError(409, 'used_code', usedText());
  const { gift } = found;
  const { systemPoints = 0, timePoints = 0, gold = 0 } = gift.rewards;
  const row = player.row;
  const resources = withGiftResources(JSON.parse(row.resources ?? '{}'), gift.rewards);
  let updated;
  try {
    // The batch holds only while the character is as read (atomic.js), so the
    // code is marked used only with its rewards given (the code review).
    [, updated] = await db.batch([
      sameVersion(db, row),
      db
        .prepare(
          `UPDATE characters SET gold = gold + ?, time_points = time_points + ?, system_points = system_points + ?, resources = ?, version = version + 1
           WHERE id = ? AND version = ?`,
        )
        .bind(gold, timePoints, systemPoints, JSON.stringify(resources), row.id, row.version),
      db
        .prepare('INSERT INTO gift_codes_used (user_id, gift_id, character_id, used_at) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM characters WHERE id = ? AND version = ?)')
        .bind(session.userId, gift.id, row.id, context.now, row.id, row.version + 1),
    ]);
  } catch (error) {
    if (raced(error)) throw new ApiError(409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.');
    // The same code taken a moment ago, in another tab: the batch is undone.
    if (/UNIQUE|PRIMARY KEY|constraint/i.test(String(error?.message))) throw new ApiError(409, 'used_code', usedText());
    throw error;
  }
  if (updated.meta.changes !== 1) throw new ApiError(409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.');
  const fresh = await loadPlayer(db, session.userId);
  const text = texts.redeemed.replace('{rewards}', giftRewardsText(gift.rewards, content()));
  return json({ gift: { rewards: gift.rewards, text }, character: characterView(fresh, context.now) });
}

// The codes the author makes in the Panel autora (the author, 17.11.2026:
// „Musisz mi dodac opcję w Panel Autora generowania takich kodów z pozycji
// gry, które działają od razu”; author_gift_codes): they work the moment
// they are made, as a code of the data does, without a new version. Ended
// early by the author, a code ends then.
const panelGift = (row) => ({
  id: row.id,
  code: row.code,
  until: new Date(row.ended_at === null ? row.until_at : Math.min(row.until_at, row.ended_at)).toISOString(),
  ...(row.for_key && { for: row.for_key }),
  rewards: JSON.parse(row.rewards),
});

async function panelCodes(db, code) {
  const { results } = await db.prepare('SELECT * FROM author_gift_codes WHERE code = ?').bind(code).all();
  return results.map(panelGift);
}

const DAY = 24 * 3600000;
// The most a code may give, against a typo in the panel.
const MOST = { systemPoints: 10000, timePoints: 100000, gold: 10000000 };
const REWARDS = ['systemPoints', 'timePoints', 'gold'];

// The moment a day ("2026-12-17") ends in Warsaw: the midnight after it,
// an hour or two (summer time) before midnight in UTC.
export function warsawDayEnd(date) {
  const [year, month, day] = date.split('-').map(Number);
  const midnight = Date.UTC(year, month - 1, day + 1);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', hour: '2-digit', hourCycle: 'h23' }).format(new Date(midnight)));
  return midnight - hour * 3600000;
}

async function requireAuthor(context) {
  const session = await requireSession(context);
  if (!isAuthor(context.env, session.user)) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  return session;
}

// GET /api/author/gift-codes: the codes made in the panel, newest first,
// and the data's own, each with how many accounts took it.
export async function authorGiftCodes(context) {
  await requireAuthor(context);
  const db = context.env.DB;
  const [made, uses] = await db.batch([
    db.prepare('SELECT * FROM author_gift_codes ORDER BY created_at DESC LIMIT 200'),
    db.prepare('SELECT gift_id, COUNT(*) AS uses FROM gift_codes_used GROUP BY gift_id'),
  ]);
  const taken = new Map(uses.results.map((row) => [row.gift_id, row.uses]));
  const now = context.now;
  const view = (gift, extra) => ({
    id: gift.id,
    code: gift.code,
    rewards: giftRewardsText(gift.rewards, content()),
    until: Date.parse(gift.until),
    open: now < Date.parse(gift.until) && (!gift.from || now >= Date.parse(gift.from)),
    uses: taken.get(gift.id) ?? 0,
    ...extra,
  });
  return json({
    codes: made.results.map((row) => view(panelGift(row), { forName: row.for_name, createdAt: row.created_at, endedAt: row.ended_at })),
    files: content().giftCodes.map((gift) => view(gift, { personal: Boolean(gift.for) })),
  });
}

// POST /api/author/gift-codes { code, systemPoints, timePoints, gold, until,
// name }: a new code, at once in the game. `until`: its last day
// ("2026-12-17"), whole, in Warsaw; `name`: a character's, for that one
// alone. A code's text may serve again only for other characters, each
// their own.
export async function createGiftCode(context) {
  await requireAuthor(context);
  const body = await readJson(context.request);
  const db = context.env.DB;
  const now = context.now;
  const code = normalCode(body.code);
  if (code.length < 3 || code.length > 24) throw new ApiError(400, 'bad_code', 'Kod ma od 3 do 24 liter i cyfr, bez polskich znaków.');
  const rewards = {};
  for (const key of REWARDS) {
    const value = body[key] === '' || body[key] === undefined || body[key] === null ? 0 : Number(body[key]);
    if (!Number.isInteger(value) || value < 0 || value > MOST[key]) throw new ApiError(400, 'bad_rewards', 'Nagrody to liczby całkowite od 0: Punkty Systemu do 10 000, Punkty Czasu do 100 000, złoto do 10 000 000.');
    if (value > 0) rewards[key] = value;
  }
  if (Object.keys(rewards).length === 0) throw new ApiError(400, 'no_rewards', 'Kod musi coś dawać: wpisz Punkty Systemu, Punkty Czasu albo złoto.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.until ?? ''))) throw new ApiError(400, 'bad_until', 'Wybierz, do kiedy kod działa.');
  const until = warsawDayEnd(body.until);
  if (!(until > now) || until > now + 366 * DAY) throw new ApiError(400, 'bad_until', 'Kod może działać od dziś do roku naprzód.');
  // One character's code: the name as the game has it, found as a name is
  // in the game (any letter case).
  let forName = null;
  const typedName = String(body.name ?? '').trim();
  if (typedName) {
    const row = await db.prepare(`SELECT name FROM characters WHERE name_key = ? AND ${OWN_CHARACTERS}`).bind(nameKey(typedName)).first();
    if (!row) throw new ApiError(404, 'no_character', `Nie ma postaci o imieniu „${typedName}”.`);
    forName = row.name;
  }
  const forKey = forName ? await characterKey(forName) : null;
  // The same text may not work twice for the same players: a code for
  // everyone takes its text alone, a character's code shares it only with
  // other characters' codes.
  const open = [...content().giftCodes, ...(await panelCodes(db, code))].filter((gift) => gift.code === code && now < Date.parse(gift.until));
  if (open.some((gift) => !gift.for || !forKey || gift.for === forKey)) throw new ApiError(409, 'code_taken', `Kod ${code} już działa. Wybierz inny tekst albo zakończ tamten kod.`);
  const id = `panel-${now.toString(36)}`;
  await db
    .prepare('INSERT INTO author_gift_codes (id, code, rewards, for_key, for_name, until_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, code, JSON.stringify(rewards), forKey, forName, until, now)
    .run();
  return authorGiftCodes(context);
}

// POST /api/author/gift-codes/end { id }: a panel code stops working now;
// what it gave stays.
export async function endGiftCode(context) {
  await requireAuthor(context);
  const body = await readJson(context.request);
  const result = await context.env.DB.prepare('UPDATE author_gift_codes SET ended_at = ? WHERE id = ? AND ended_at IS NULL AND until_at > ?')
    .bind(context.now, String(body.id ?? ''), context.now)
    .run();
  if (result.meta.changes !== 1) throw new ApiError(404, 'no_code', 'Tego kodu nie ma albo już nie działa.');
  return authorGiftCodes(context);
}

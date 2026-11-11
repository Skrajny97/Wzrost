// Gift codes (data/gift-codes.json; gift-codes.js in the engine; DECISIONS.md,
// "Kod podarunkowy"): a code typed in the settings gives its rewards to the
// character, once per account. The account's row in gift_codes_used is
// written together with the rewards, only if the character is as read (its
// version), so two taps give one gift and a code taken already gives none.

import { giftCodeOf, giftMovePair, giftRewardsText, withGiftResources } from '../engine/index.js';
import { characterView, loadPlayer, requirePlayer } from './characters.js';
import { content } from './content.js';
import { raced, sameVersion } from './atomic.js';
import { ApiError, json, readJson } from './http.js';

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

// The codes an account may take no more: those it took, and a code for one
// character (`for`, by the key of its name) once any account took it, as a
// name freed by a rename could else take it again on another account (the
// code review, 0.2.71).
export async function usedCodes(db, userId) {
  const personal = content()
    .giftCodes.filter((gift) => gift.for)
    .map((gift) => gift.id);
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
  const found = giftCodeOf(body.code, context.now, await usedCodes(db, session.userId), content(), await characterKey(player.row.name));
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

// Gift codes (data/gift-codes.json; gift-codes.js in the engine; DECISIONS.md,
// "Kod podarunkowy"): a code typed in the settings gives its rewards to the
// character, once per account. The account's row in gift_codes_used is
// written together with the rewards, only if the character is as read (its
// version), so two taps give one gift and a code taken already gives none.

import { giftCodeOf, giftRewardsText, withGiftResources } from '../engine/index.js';
import { characterView, loadPlayer, requirePlayer } from './characters.js';
import { content } from './content.js';
import { raced, sameVersion } from './atomic.js';
import { ApiError, json, readJson } from './http.js';

const usedText = () => content.giftTexts.used;

// POST /api/gift-code { code }
export async function redeemGiftCode(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const db = context.env.DB;
  const texts = content.giftTexts;
  const { results } = await db.prepare('SELECT gift_id FROM gift_codes_used WHERE user_id = ?').bind(session.userId).all();
  const found = giftCodeOf(body.code, context.now, results.map((row) => row.gift_id), content);
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
  const text = texts.redeemed.replace('{rewards}', giftRewardsText(gift.rewards, content));
  return json({ gift: { rewards: gift.rewards, text }, character: characterView(fresh, context.now) });
}

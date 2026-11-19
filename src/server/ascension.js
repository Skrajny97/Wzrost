// Gwiazdki at the Zaklinaczka in the Osada (1180 B–1184 A; the engine's
// ascension.js): the items at the Kowadło's highest upgrade, worn or in the
// bag, with their stars and what the next one takes, and one try at it. The
// try is rolled with the server's fresh seed; a success sets the star, a
// failure takes the payment only. Each try grows the relation with her, as
// her zaklęcia do.

import { createRng, itemLines, itemName, maxStars, maxUpgrade, nextStar, rollStar, starBlock, starCost, starStanding } from '../engine/index.js';
import { characterView, loadPlayer, requirePlayer, requireUnworn, settlementBoard } from './characters.js';
import { content } from './content.js';
import { toHex } from './encoding.js';
import { ApiError, json, readJson } from './http.js';
import { takenOff } from './market.js';
import { requireOpen, settlementOf, settlementView } from './settlement.js';

const tuning = () => content().settlement.ascension;

// What the page shows in the Zaklinaczka's "Gwiazdki" (the words come with
// the game's content, publicContent): whether her relation lets her set
// stars, and if not the standing and the points still to it; and each item
// at +10, the worn ones first, with its stars and the next star's chance and
// price, the parts held beside it.
export function ascensionView(player, stored) {
  if (!tuning()) return null;
  const parts = JSON.parse(player.row.parts ?? '{}');
  const standing = starStanding(stored.relations?.[tuning().resident] ?? 0, content());
  const top = maxUpgrade(content());
  const items = player.items.filter((item) => (item.upgrade ?? 0) >= top).sort((a, b) => Number(Boolean(b.equippedSlot)) - Number(Boolean(a.equippedSlot)));
  return {
    open: standing.open,
    standing: standing.name,
    toGo: standing.toGo,
    items: items.map((item) => {
      const next = nextStar(item, content());
      return {
        id: item.id,
        name: itemName(item, content()),
        rarity: item.rarity,
        equipped: Boolean(item.equippedSlot),
        stars: item.stars ?? 0,
        next: next && { star: next.star, chance: next.chance, gold: next.gold, part: next.part, partName: content().partsById[next.part].name, count: next.count, have: parts[next.part] ?? 0 },
      };
    }),
  };
}

// POST /api/settlement/stars { itemId, stars }: one try at the next star of
// an item at +10, a worn one at home (as every change of the gear), one in
// the bag also while away. `stars`: those the page showed on it, so a tap on
// a page gone stale is refused rather than paying for a star the player did
// not see (the next one's price is half again as much). The item changes only
// if it is as read (its stars and its last roll), the character too and the
// payment still there, and the payment goes only once this roll is saved:
// two taps at once make and pay one try.
export async function ascendAtEnchantress(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const item = player.items.find((candidate) => String(candidate.id) === String(body.itemId));
  if (!item) throw new ApiError(404, 'item_not_found', 'Nie masz takiego przedmiotu.');
  requireUnworn(player, item, context.now);
  const changed = () => new ApiError(409, 'item_changed', tuning().texts.errors.changed);
  const stars = item.stars ?? 0;
  if (body.stars !== undefined && body.stars !== stars) throw changed();
  const stored = settlementOf(row);
  const { resident, relationGain } = tuning();
  const block = starBlock(item, { gold: row.gold, parts: JSON.parse(row.parts ?? '{}'), relation: stored.relations[resident] ?? 0 }, content());
  if (block) throw new ApiError(409, block.code, block.message);
  const cost = starCost(item, stars + 1, content());
  const roll = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const outcome = rollStar(item, createRng(roll), content());
  const next = { ...stored, relations: { ...stored.relations, [resident]: (stored.relations[resident] ?? 0) + relationGain } };
  const pay = takenOff('parts', { [cost.part]: cost.count });
  const db = context.env.DB;
  const [saved] = await db.batch([
    db
      .prepare(
        `UPDATE items SET data = json_set(data, '$.stars', ?, '$.lastRoll', ?)
         WHERE id = ? AND character_id = ?
           AND COALESCE(json_extract(data, '$.stars'), 0) = ? AND COALESCE(json_extract(data, '$.lastRoll'), '') = ?
           AND EXISTS (SELECT 1 FROM characters WHERE id = ? AND version = ? AND gold >= ? AND ${pay.enough})`,
      )
      .bind(outcome.stars, roll, item.id, row.id, stars, item.lastRoll ?? '', row.id, row.version, cost.gold, ...pay.enoughBinds),
    db
      .prepare(`UPDATE characters SET gold = gold - ?, parts = ${pay.sql}, settlement = ?, version = version + 1 WHERE id = ? AND EXISTS (SELECT 1 FROM items WHERE id = ? AND json_extract(data, '$.lastRoll') = ?)`)
      .bind(cost.gold, ...pay.binds, JSON.stringify(next), row.id, item.id, roll),
  ]);
  if (saved.meta.changes !== 1) throw changed();
  const after = await loadPlayer(db, session.userId);
  // Each of its numbers before the try and now, as the comparisons count
  // them (itemLines), for what a star raised.
  const was = new Map(itemLines(item, content()).map((line) => [line.id, line.text]));
  const gains = itemLines({ ...item, stars: outcome.stars }, content()).map(({ id, label, text }) => ({ label, before: was.get(id) ?? null, after: text }));
  return json({
    stars: {
      itemId: item.id,
      name: itemName(item, content()),
      result: outcome.result,
      from: stars,
      to: outcome.stars,
      max: maxStars(content()),
      gold: cost.gold,
      part: { id: cost.part, name: content().partsById[cost.part].name, count: cost.count },
      gains,
    },
    settlement: settlementView(after, next, settlementBoard(after.row, next, context.now), context.now),
    character: characterView(after, context.now),
  });
}

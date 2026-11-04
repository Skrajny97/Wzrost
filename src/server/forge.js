// The Kuźnia in the Osada (question 326 A; the engine's forge.js): Żelisław
// of the Bractwo Kowali sells the Zwój ochronny for the Kowadło, a few a
// day, and raises an item's rarity by one step, once per item, for gold
// and pieces of materials of the item's rarity, any of them added up
// (481 B). Each trade grows the relation with him and the Bractwo Kowali's
// reputation, up to his own day's limit (tradePoints), as the Garbarnia's
// trade has its own.

import {
  createRng,
  forgeDiscount,
  forgeTopRarity,
  heldOfRarity,
  itemName,
  piecesOfRarity,
  questPeriod,
  raiseOffer,
  raiseRarity,
  rarityNeedView,
  scrollPrice,
  tradePoints,
  tradeView,
} from '../engine/index.js';
import { characterView, loadPlayer, requirePlayer, requireUnworn, settlementBoard } from './characters.js';
import { content } from './content.js';
import { toHex } from './encoding.js';
import { ApiError, json, readJson } from './http.js';
import { takenOff } from './market.js';
import { requireOpen, settlementOf, settlementView } from './settlement.js';

const changed = () => new ApiError(409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.');
const forge = () => content.settlement.forge;

// The Zwoje bought today, as kept in the Osada's JSON: the Zwoje ochronne,
// or with `steady` the Zwoje utrwalenia.
const boughtToday = (stored, now, steady = false) => (stored.forge?.day === questPeriod('daily', now, content).key ? (stored.forge[steady ? 'steady' : 'scrolls'] ?? 0) : 0);

// The Osada after a trade at the Kuźnia, as the other places answer.
function osada(after, now) {
  const stored = settlementOf(after.row);
  return settlementView(after, stored, settlementBoard(after.row, stored, now), now);
}

// What the page needs: the scroll's price and the ones left today, the
// highest rarity the relation lets him reach, the Bractwo's discount, and
// for each item, worn or in the bag, what raising it takes or why it
// cannot be raised.
export function forgeView(player, stored, now) {
  const { row } = player;
  const relation = stored.relations?.[forge().resident] ?? 0;
  const reputation = stored.reputation?.[forge().brotherhood] ?? 0;
  const materials = JSON.parse(row.materials ?? '{}');
  const day = questPeriod('daily', now, content).key;
  return {
    scroll: { price: scrollPrice(reputation, content), daily: forge().scroll.daily, left: Math.max(0, forge().scroll.daily - boughtToday(stored, now)), have: row.scrolls ?? 0 },
    steadyScroll: {
      price: scrollPrice(reputation, content, 'steadyScroll'),
      daily: forge().steadyScroll.daily,
      left: Math.max(0, forge().steadyScroll.daily - boughtToday(stored, now, true)),
      have: row.steady_scrolls ?? 0,
    },
    topName: content.raritiesById[forgeTopRarity(relation, content)].name,
    // Whether a better relation lets him go no higher.
    best: forgeTopRarity(relation, content) === forge().topRarity.at(-1),
    discount: forgeDiscount(reputation, content),
    // The relation and the reputation the trade gave today, of the day's limit.
    trade: tradeView(stored.forgeTrade, row.level, now, content, forge().reputation),
    items: player.items.map((item) => {
      const offer = raiseOffer(item, relation, reputation, content);
      // The pieces of the item's rarity the character holds in all and
      // those the raise would take, as at the Zaklinaczka (rarityNeedView).
      const need = offer.material && rarityNeedView(materials, { rarity: offer.material, count: offer.materials }, content);
      return {
        id: item.id,
        name: itemName(item, content),
        rarity: item.rarity,
        rarityName: content.raritiesById[item.rarity].name,
        equipped: Boolean(item.equippedSlot),
        ...offer,
        ...(offer.next && { nextName: content.raritiesById[offer.next].name }),
        ...(offer.material && { materialName: content.raritiesById[offer.material].name }),
        ...(offer.top && { topName: content.raritiesById[offer.top].name }),
        ...(need && { have: need.have, takes: need.takes }),
      };
    }),
  };
}

// The relation and the reputation a trade of `gold` grows, as at Jagna's.
function grown(stored, gold, level, now) {
  const { points, trade } = tradePoints(gold, level, stored.forgeTrade, now, content, forge().reputation);
  const add = (counts, id) => ({ ...counts, [id]: (counts?.[id] ?? 0) + points });
  return { points, next: { ...stored, relations: add(stored.relations, forge().resident), reputation: add(stored.reputation, forge().brotherhood), forgeTrade: trade } };
}

// POST /api/settlement/forge/scrolls { count, kind }: Zwoje ochronne, or
// with `kind` "steady" Zwoje utrwalenia, a few of each a day.
export async function buyScrolls(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const stored = settlementOf(row);
  const steady = body.kind === 'steady';
  const kind = steady ? 'steadyScroll' : 'scroll';
  const left = forge()[kind].daily - boughtToday(stored, context.now, steady);
  if (!Number.isInteger(body.count) || body.count < 1) throw new ApiError(400, 'invalid_count', 'Podaj, ile zwojów kupić.');
  if (body.count > left) throw new ApiError(409, 'sold_out', left > 0 ? `Dziś kowal sprzeda jeszcze ${left}.` : 'Na dziś kowal nie ma już zwojów. Wróć jutro.');
  const reputation = stored.reputation?.[forge().brotherhood] ?? 0;
  const gold = scrollPrice(reputation, content, kind) * body.count;
  if (row.gold < gold) throw new ApiError(409, 'no_gold', 'Brakuje złota.');
  const { points, next } = grown(stored, gold, row.level, context.now);
  const day = questPeriod('daily', context.now, content).key;
  // Today's count of each kind, the other kept as it was.
  const counts = { scrolls: boughtToday(stored, context.now), steady: boughtToday(stored, context.now, true) };
  counts[steady ? 'steady' : 'scrolls'] += body.count;
  const saved = { ...next, forge: { day, ...counts } };
  const column = steady ? 'steady_scrolls' : 'scrolls';
  const result = await context.env.DB.prepare(`UPDATE characters SET gold = gold - ?, ${column} = ${column} + ?, settlement = ?, version = version + 1 WHERE id = ? AND version = ? AND gold >= ?`)
    .bind(gold, body.count, JSON.stringify(saved), row.id, row.version, gold)
    .run();
  if (result.meta.changes !== 1) throw changed();
  const after = await loadPlayer(context.env.DB, session.userId);
  return json({ bought: { count: body.count, gold, points, kind: steady ? 'steady' : 'ward' }, settlement: osada(after, context.now), character: characterView(after, context.now) });
}

// POST /api/settlement/forge/raise { itemId }: one rarity up, once per item,
// for gold and pieces of materials of the item's rarity, any of them added
// up, the most plentiful material first (piecesOfRarity in the engine). A
// worn item waits for the return from an exploration.
export async function raiseAtForge(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const item = player.items.find((candidate) => String(candidate.id) === String(body.itemId));
  if (!item) throw new ApiError(404, 'item_not_found', 'Nie masz takiego przedmiotu.');
  requireUnworn(player, item, context.now);
  const stored = settlementOf(row);
  const relation = stored.relations?.[forge().resident] ?? 0;
  const reputation = stored.reputation?.[forge().brotherhood] ?? 0;
  const offer = raiseOffer(item, relation, reputation, content);
  if (offer.reason === 'raised') throw new ApiError(409, 'raised', 'Ten przedmiot kowal już raz przekuł.');
  if (offer.reason === 'top') throw new ApiError(409, 'top', 'Wyżej tej rzadkości już nie ma.');
  if (offer.reason === 'relation') throw new ApiError(409, 'relation', `Na razie kowal przekuwa przedmioty najwyżej do rzadkości „${content.raritiesById[offer.top].name}”. Lepsza relacja z nim pozwoli iść wyżej.`);
  const materials = JSON.parse(row.materials ?? '{}');
  const taken = piecesOfRarity(materials, { rarity: offer.material, count: offer.materials }, content);
  if (!taken) {
    const short = offer.materials - heldOfRarity(materials, offer.material, content);
    throw new ApiError(409, 'no_material', `Brakuje ${short} szt. materiałów tej samej rzadkości co przedmiot (${content.raritiesById[offer.material].name}).`);
  }
  if (row.gold < offer.gold) throw new ApiError(409, 'no_gold', 'Brakuje złota.');
  const roll = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const raised = raiseRarity(item, createRng(roll), content);
  const { points, next } = grown(stored, offer.gold, row.level, context.now);
  const pay = takenOff('materials', taken);
  const db = context.env.DB;
  // As at the Zaklinaczka: the item changes only if it and the character are
  // as seen here, and the payment only if this raise was saved.
  await db.batch([
    db
      .prepare(
        `UPDATE items SET data = json_set(data, '$.rarity', ?, '$.affixes', json(?), '$.raised', json('true'), '$.lastRoll', ?)
         WHERE id = ? AND character_id = ? AND json_extract(data, '$.raised') IS NULL AND (SELECT version FROM characters WHERE id = ?) = ?`,
      )
      .bind(raised.rarity, JSON.stringify(raised.affixes), roll, item.id, row.id, row.id, row.version),
    db
      .prepare(
        `UPDATE characters SET gold = gold - ?, settlement = ?, materials = ${pay.sql}, version = version + 1
         WHERE id = ? AND version = ? AND gold >= ? AND ${pay.enough}
           AND EXISTS (SELECT 1 FROM items WHERE id = ? AND json_extract(data, '$.lastRoll') = ?)`,
      )
      .bind(offer.gold, JSON.stringify(next), ...pay.binds, row.id, row.version, offer.gold, ...pay.enoughBinds, item.id, roll),
  ]);
  const after = await loadPlayer(db, session.userId);
  const saved = after.items.find((candidate) => candidate.id === item.id);
  if (saved?.lastRoll !== roll || saved.rarity !== raised.rarity) throw changed();
  return json({
    raised: {
      itemId: saved.id,
      name: itemName(saved, content),
      before: item.rarity,
      beforeName: content.raritiesById[item.rarity].name,
      after: saved.rarity,
      afterName: content.raritiesById[saved.rarity].name,
      gold: offer.gold,
      points,
    },
    settlement: osada(after, context.now),
    character: characterView(after, context.now),
  });
}

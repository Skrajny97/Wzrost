// The Garbarnia in the Osada (the author's 325 A; the engine's tannery.js
// has the rules): Wszebor the tanner buys the character's materials of
// ordinary creatures (skins, scales, feathers, fangs...) for more than the
// scrapper and sells them, more of them and cheaper with a better relation,
// as Jagna does herbs in the Chata zielarki. Both raise the relation with
// him and the reputation with his brotherhood, up to the day's limit.
// Materials take no place in the bag, so the trade works also during an
// exploration, as the scrapper's does.

import {
  brotherhoodPerk,
  campBonus,
  campLevels,
  materialPrice,
  materialView,
  parseStack,
  relationDiscount,
  saleGold,
  tanneryPremium,
  tanneryStock,
  tannerTakes,
  tradePoints,
  tradeView,
} from '../engine/index.js';
import { characterView, loadPlayer, requirePlayer, settlementBoard } from './characters.js';
import { content } from './content.js';
import { ApiError, json, readJson } from './http.js';
import { counted, foreign } from './market.js';
import { requireOpen, settlementOf, settlementView } from './settlement.js';

// A JSON path for a key with a hyphen and a colon ("wolf-pelt:rare").
const jsonPath = (key) => `$."${key}"`;
const changed = () => new ApiError(409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.');
const tuning = () => content.settlement.tannery;
const rarityIndex = (id) => content.rarities.findIndex((rarity) => rarity.id === id);

// A stack of materials as the page shows it, as the Targowisko's goods: its
// name, with the rarity when above its species', the material for its
// picture, its description and what the scrapper pays for a piece
// (`scrap`), with the camp's Skup bonus when given.
function goodView(key, count, bonus = 0) {
  const material = materialView(key, count, content);
  return {
    kind: 'material',
    key,
    count,
    name: material.label.charAt(0).toUpperCase() + material.label.slice(1),
    rarity: material.rarity,
    material,
    description: content.materialsById[material.materialId].description,
    scrap: materialPrice(material.rarity, content) * (1 + bonus),
  };
}

// What Wszebor pays for a piece of a stack now: the scrapper's price with
// the camp's Skup bonus, and his premium on top.
function tanneryPrices(player, stored, now) {
  // The relation with Wszebor's premium, and the Bractwo Łowców's (591 C).
  const premium = tanneryPremium(stored.relations[tuning().resident] ?? 0, content) + brotherhoodPerk('tanneryPremium', stored.reputation, content);
  const bonus = campBonus(campLevels(player.buildings, now, content), 'sellPrice', content);
  return { premium, bonus, price: (key) => materialPrice(parseStack(key).rarityId, content) * (1 + bonus) * (1 + premium) };
}

// The Garbarnia for the page: each stack of materials he takes the
// character holds, with Wszebor's price of a piece and the scrapper's
// beside it, his premium, the trade's reputation today out of the day's
// limit, and `shop`: the materials he sells at the relation with him, each
// with its price, and the standing that brings more (how many).
export function tanneryView(player, stored, now) {
  const { resident, reputation } = tuning();
  const points = stored.relations[resident] ?? 0;
  const { premium, bonus, price } = tanneryPrices(player, stored, now);
  const materials = JSON.parse(player.row.materials ?? '{}');
  const { goods: offered, next } = tanneryStock(points, content);
  return {
    premium,
    // At his best price already: no "more with a better relation".
    best: premium >= Math.max(...tuning().premium),
    goods: Object.entries(materials)
      .filter(([key, count]) => count > 0 && tannerTakes(key, content))
      .map(([key, count]) => ({ ...goodView(key, count, bonus), price: price(key) }))
      .sort((a, b) => rarityIndex(a.rarity) - rarityIndex(b.rarity) || a.name.localeCompare(b.name, 'pl')),
    trade: tradeView(stored.tanneryTrade, player.row.level, now, content, reputation),
    shop: {
      goods: offered.map(({ key, price: cost }) => ({ ...goodView(key, 1), price: cost })),
      next: next && { standing: next.standing, count: next.goods.length },
      discount: relationDiscount(points, content),
    },
  };
}

// The trade's points (as Jagna's, 120 A): the relation with Wszebor and the
// reputation with his brotherhood grow alike, a point for so much gold a
// level, up to the day's limit, kept apart from Jagna's.
function traded(row, stored, gold, now) {
  const { resident, brotherhood, reputation } = tuning();
  const { points, trade } = tradePoints(gold, row.level, stored.tanneryTrade, now, content, reputation);
  const add = (counts, id) => ({ ...counts, [id]: (counts[id] ?? 0) + points });
  return { points, stored: { ...stored, relations: add(stored.relations, resident), reputation: add(stored.reputation, brotherhood), tanneryTrade: trade } };
}

// What every trade answers with: the Osada and the character after it.
async function answer(context, session, next, result) {
  const after = await loadPlayer(context.env.DB, session.userId);
  return json({
    ...result,
    settlement: settlementView(after, next, settlementBoard(after.row, next, context.now), context.now),
    character: characterView(after, context.now),
  });
}

// POST /api/settlement/tannery { key, count }: Wszebor buys pieces of a
// stack of an ordinary creature's material, the rarer for more.
export async function sellToTanner(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  if (!tannerTakes(body.key, content)) throw new ApiError(400, 'invalid_goods', 'Wszebor kupuje materiały ze stworów, ale nie trofea elit i czempionów.');
  const held = JSON.parse(row.materials ?? '{}')[body.key] ?? 0;
  if (!Number.isInteger(body.count) || body.count < 1 || body.count > held) throw new ApiError(409, 'not_enough', 'Nie masz tylu.');
  const stored = settlementOf(row);
  const gold = saleGold(tanneryPrices(player, stored, context.now).price(body.key), body.count);
  const next = traded(row, stored, gold, context.now);
  const key = jsonPath(body.key);
  const result = await context.env.DB.prepare(
    `UPDATE characters SET gold = gold + ?, settlement = ?,
       materials = CASE WHEN json_extract(materials, ?) > ? THEN json_set(materials, ?, json_extract(materials, ?) - ?) ELSE json_remove(materials, ?) END,
       version = version + 1
     WHERE id = ? AND version = ? AND COALESCE(json_extract(materials, ?), 0) >= ?`,
  )
    .bind(gold, JSON.stringify(next.stored), key, body.count, key, key, body.count, key, row.id, row.version, key, body.count)
    .run();
  if (result.meta.changes !== 1) throw changed();
  return answer(context, session, next.stored, { sold: { name: goodView(body.key, body.count).name, count: body.count, gold, points: next.points } });
}

// POST /api/settlement/tannery/buy { key, count }: Wszebor sells a material
// he has at the relation with him, as many pieces as the gold pays for, straight
// to the character's materials, as bought goods the Encyklopedia leaves out.
export async function buyFromTanner(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const stored = settlementOf(row);
  const good = tanneryStock(stored.relations[tuning().resident] ?? 0, content).goods.find((one) => one.key === body.key);
  if (!good) throw new ApiError(404, 'no_goods', 'Wszebor nie sprzedaje Ci jeszcze tego materiału.');
  if (!Number.isInteger(body.count) || body.count < 1) throw new ApiError(400, 'invalid_count', 'Podaj, ile sztuk kupić.');
  const gold = good.price * body.count;
  if (row.gold < gold) throw new ApiError(409, 'not_enough_gold', 'Brakuje złota.');
  const next = traded(row, stored, gold, context.now);
  const materials = counted('materials', { [good.key]: body.count });
  const others = foreign({ material: { [good.key]: body.count } });
  const result = await context.env.DB.prepare(
    `UPDATE characters SET gold = gold - ?, materials = ${materials.sql}, foreign_stacks = ${others.sql}, settlement = ?, version = version + 1
     WHERE id = ? AND version = ? AND gold >= ?`,
  )
    .bind(gold, ...materials.binds, ...others.binds, JSON.stringify(next.stored), row.id, row.version, gold)
    .run();
  if (result.meta.changes !== 1) throw changed();
  return answer(context, session, next.stored, { bought: { name: goodView(good.key, body.count).name, count: body.count, gold, points: next.points } });
}

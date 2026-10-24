// Wearing, taking off, throwing away, selling and upgrading items.

import {
  bagCapacity,
  campBonus,
  campLevels,
  canUse,
  combatValues,
  createRng,
  itemName,
  missingFor,
  rollUpgrade,
  sellPrice,
  upgradeView,
} from '../engine/index.js';
import { content } from './content.js';
import { characterView, engineCharacter, equippedItems, loadPlayer, requireIdlePlayer, requirePlayer, walletOf } from './characters.js';
import { toHex } from './encoding.js';
import { ApiError, json, readJson } from './http.js';

// The scrapper's price for the stored items `ids`, counted in SQL from the
// items still there, so an item sold twice at the same moment pays once.
// `bonus` is the camp's Stół złomiarza (sellPrice() in the engine).
export function soldGold(characterId, ids, bonus) {
  const list = ids.map(() => '?').join(', ');
  const multiplier = `CASE json_extract(data, '$.rarity') ${content.rarities.map((rarity) => `WHEN '${rarity.id}' THEN ${Number(rarity.sell)}`).join(' ')} END`;
  return {
    sql: `(SELECT COALESCE(SUM(MAX(1, ROUND(json_extract(data, '$.level') * ? * ${multiplier} * ?))), 0)
           FROM items WHERE character_id = ? AND id IN (${list}))`,
    binds: [content.balance.items.sellGoldPerLevel, 1 + bonus, characterId, ...ids],
  };
}

const sellBonusOf = (player, now) => campBonus(campLevels(player.buildings, now, content), 'sellPrice', content);

function findItem(player, id) {
  const item = player.items.find((candidate) => String(candidate.id) === id);
  if (!item) throw new ApiError(404, 'item_not_found', 'Nie masz takiego przedmiotu.');
  return item;
}

async function respond(context, session) {
  return json({ character: characterView(await loadPlayer(context.env.DB, session.userId), context.now) });
}

export async function equipItem(context) {
  const { session, player } = await requireIdlePlayer(context);
  const item = findItem(player, context.params.id);
  if (item.equippedSlot) throw new ApiError(409, 'already_equipped', 'Ten przedmiot jest już założony.');
  if (content.slotsById[item.slot].locked) throw new ApiError(403, 'slot_locked', 'Ten slot jest jeszcze zablokowany.');
  if (!canUse(item.base, player.row.class_id, content)) {
    throw new ApiError(403, 'wrong_class', 'Twoja klasa nie może używać tego przedmiotu.');
  }

  // Whatever was in the slot goes back to the bag first.
  const db = context.env.DB;
  await db.batch([
    db.prepare('UPDATE items SET slot = NULL WHERE character_id = ? AND slot = ?').bind(player.row.id, item.slot),
    db.prepare('UPDATE items SET slot = ? WHERE id = ? AND character_id = ?').bind(item.slot, item.id, player.row.id),
  ]);
  return respond(context, session);
}

export async function unequipItem(context) {
  const { session, player } = await requireIdlePlayer(context);
  const item = findItem(player, context.params.id);
  if (!item.equippedSlot) throw new ApiError(409, 'not_equipped', 'Ten przedmiot nie jest założony.');
  const capacity = bagCapacity(campLevels(player.buildings, context.now, content), content);
  if (player.items.filter((candidate) => !candidate.equippedSlot).length >= capacity) {
    throw new ApiError(409, 'bag_full', 'Plecak jest pełny.');
  }
  await context.env.DB.prepare('UPDATE items SET slot = NULL WHERE id = ? AND character_id = ?')
    .bind(item.id, player.row.id)
    .run();
  return respond(context, session);
}

export async function discardItem(context) {
  const { session, player } = await requireIdlePlayer(context);
  const item = findItem(player, context.params.id);
  if (item.equippedSlot) throw new ApiError(409, 'equipped', 'Najpierw zdejmij ten przedmiot.');
  await context.env.DB.prepare('DELETE FROM items WHERE id = ? AND character_id = ?').bind(item.id, player.row.id).run();
  return respond(context, session);
}

// The scrapper buys every item in the bag of a rarity up to the chosen one.
export async function sellItems(context) {
  const { session, player } = await requireIdlePlayer(context);
  const body = await readJson(context.request);
  const limit = content.rarities.findIndex((rarity) => rarity.id === body.maxRarity);
  if (limit === -1) throw new ApiError(400, 'invalid_rarity', 'Wybierz rzadkość.');
  const rank = (item) => content.rarities.findIndex((rarity) => rarity.id === item.rarity);
  // Upgraded items are not sold by the handful: too much went into them.
  const sold = player.items.filter((item) => !item.equippedSlot && !(item.upgrade > 0) && rank(item) <= limit);
  let count = 0;
  if (sold.length > 0) {
    // One transaction: the gold is counted from the items still there, then
    // they go, so a second tap at the same moment pays nothing twice.
    const db = context.env.DB;
    const ids = sold.map((item) => item.id);
    const price = soldGold(player.row.id, ids, sellBonusOf(player, context.now));
    const results = await db.batch([
      db
        .prepare(`UPDATE characters SET gold = gold + ${price.sql}, version = version + 1 WHERE id = ?`)
        .bind(...price.binds, player.row.id),
      db.prepare(`DELETE FROM items WHERE character_id = ? AND id IN (${ids.map(() => '?').join(', ')})`).bind(player.row.id, ...ids),
    ]);
    count = results[1].meta.changes;
  }
  const bonus = sellBonusOf(player, context.now);
  const gold = count === sold.length ? sold.reduce((sum, item) => sum + sellPrice(item, content, bonus), 0) : 0;
  return json({
    sold: { count, gold },
    character: characterView(await loadPlayer(context.env.DB, session.userId), context.now),
  });
}

// What wearing the item (or taking it off) would change: the combat values the
// stats screen shows, now and after.
export async function previewItem(context) {
  const { player } = await requirePlayer(context);
  const item = findItem(player, context.params.id);
  const character = engineCharacter(player.row);
  const worn = equippedItems(player);
  const after = item.equippedSlot
    ? worn.filter((candidate) => candidate.id !== item.id)
    : [...worn.filter((candidate) => candidate.equippedSlot !== item.slot), item];
  const view = (equipped) => {
    const values = combatValues(character, equipped, content);
    return {
      damage: `${values.damageMin}–${values.damageMax}`,
      damageAverage: Math.round(values.damage * 10) / 10,
      reduction: Math.round(values.reduction * 100),
      maxHp: values.maxHp,
      dodge: Math.round(values.dodge * 1000) / 10,
      crit: Math.round(values.crit * 1000) / 10,
    };
  };
  return json({ itemId: item.id, equipped: Boolean(item.equippedSlot), now: view(worn), after: view(after) });
}

// One try at upgrading an item on the camp's Kowadło, paid in gold and iron
// ore and rolled with a fresh seed (rollUpgrade in the engine). A failure takes
// the payment and a level, and from +7 on may break the item.
export async function upgradeItem(context) {
  const { session, player } = await requireIdlePlayer(context);
  const item = findItem(player, context.params.id);
  const cap = campBonus(campLevels(player.buildings, context.now, content), 'upgradeCap', content);
  const view = upgradeView(item, cap, content);
  if (view.level >= view.max) throw new ApiError(409, 'max_upgrade', 'Ten przedmiot ma już najwyższe ulepszenie.');
  if (!view.next) {
    throw new ApiError(
      409,
      'anvil_level',
      view.cap === 0 ? 'Najpierw zbuduj Kowadło w obozie.' : `Kowadło na poziomie ${view.cap} ulepsza tylko do +${view.cap}.`,
    );
  }
  const { cost } = view.next;
  if (missingFor(cost, walletOf(player.row)).length > 0) {
    throw new ApiError(409, 'not_enough', 'Brakuje złota albo rudy żelaza na to ulepszenie.');
  }

  const roll = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const outcome = rollUpgrade(item, createRng(roll), content);
  const row = player.row;
  const ore = '$."iron-ore"';
  const db = context.env.DB;
  // The item changes only if it is as seen here (its level and last roll) and
  // the price is still there; the payment only if this roll was saved, and a
  // broken item goes after that. So two taps at once make and pay one try.
  const statements = [
    db
      .prepare(
        `UPDATE items SET data = json_set(data, '$.upgrade', ?, '$.lastRoll', ?)
         WHERE id = ? AND character_id = ?
           AND COALESCE(json_extract(data, '$.upgrade'), 0) = ? AND COALESCE(json_extract(data, '$.lastRoll'), '') = ?
           AND (SELECT gold FROM characters WHERE id = ?) >= ?
           AND COALESCE(json_extract((SELECT resources FROM characters WHERE id = ?), ?), 0) >= ?`,
      )
      .bind(outcome.upgrade, roll, item.id, row.id, view.level, item.lastRoll ?? '', row.id, cost.gold, row.id, ore, cost['iron-ore']),
    db
      .prepare(
        `UPDATE characters SET gold = gold - ?, resources = json_set(resources, ?, COALESCE(json_extract(resources, ?), 0) - ?), version = version + 1
         WHERE id = ? AND EXISTS (SELECT 1 FROM items WHERE id = ? AND json_extract(data, '$.lastRoll') = ?)`,
      )
      .bind(cost.gold, ore, ore, cost['iron-ore'], row.id, item.id, roll),
  ];
  if (outcome.result === 'broken') {
    statements.push(db.prepare("DELETE FROM items WHERE id = ? AND json_extract(data, '$.lastRoll') = ?").bind(item.id, roll));
  }
  const results = await db.batch(statements);
  if (results[0].meta.changes !== 1) {
    throw new ApiError(409, 'item_changed', 'Przedmiot albo zapasy zmieniły się w międzyczasie. Spróbuj jeszcze raz.');
  }
  return json({
    upgrade: { itemId: item.id, name: itemName(item, content), result: outcome.result, from: view.level, to: outcome.upgrade, cost },
    character: characterView(await loadPlayer(db, session.userId), context.now),
  });
}

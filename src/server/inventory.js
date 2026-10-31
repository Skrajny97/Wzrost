// Wearing, taking off, throwing away, selling and upgrading items.

import {
  bagCapacity,
  baseClassLevel,
  campBonus,
  campLevels,
  canUse,
  combatValues,
  createRng,
  valueChanges,
  itemName,
  knownStack,
  missingFor,
  parseStack,
  rollUpgrade,
  sellPrice,
  upgradeView,
} from '../engine/index.js';
import { content } from './content.js';
import { bagPlaces, characterView, engineCharacter, equippedItems, loadPlayer, requireIdlePlayer, requirePlayer, requireUnworn, walletOf } from './characters.js';
import { toHex } from './encoding.js';
import { ApiError, json, readJson } from './http.js';

// The scrapper's price for the stored `items`, summed in SQL over the items
// still there, so an item sold twice at the same moment pays once. Each price
// is sellPrice() in the engine, written into the query as a whole number (it
// keeps the bound values under D1's limit); `bonus` is the camp's Skup złomu.
export function soldGold(characterId, items, bonus) {
  const whole = (value) => {
    if (!Number.isSafeInteger(value)) throw new Error(`Not a whole number: ${value}`);
    return value;
  };
  const prices = items.map((item) => `WHEN ${whole(item.id)} THEN ${whole(sellPrice(item, content, bonus))}`).join(' ');
  return {
    sql: `(SELECT COALESCE(SUM(CASE id ${prices} ELSE 0 END), 0)
           FROM items WHERE character_id = ? AND id IN (${items.map(() => '?').join(', ')}))`,
    binds: [characterId, ...items.map((item) => item.id)],
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
  // Every item, an own find or one from a Wymiana, the Targowisko or the
  // Skrzynia Konta, is worn from its Tier, the class level its base asks
  // for, whatever its own level (the author: "Niech przedmioty z Wymian i
  // Targowiska działają w oparciu o Tiery a nie poziomy samej broni").
  if (!canUse(item.base, player.row.class_id, content, player.row.class_level)) {
    throw new ApiError(403, 'class_level', `Ten przedmiot założysz od poziomu klasy ${baseClassLevel(item.base, content)}.`);
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
  if (bagPlaces(player) >= capacity) {
    throw new ApiError(409, 'bag_full', 'Plecak jest pełny.');
  }
  await context.env.DB.prepare('UPDATE items SET slot = NULL WHERE id = ? AND character_id = ?')
    .bind(item.id, player.row.id)
    .run();
  return respond(context, session);
}

export async function discardItem(context) {
  const { session, player } = await requirePlayer(context);
  const item = findItem(player, context.params.id);
  if (item.equippedSlot) throw new ApiError(409, 'equipped', 'Najpierw zdejmij ten przedmiot.');
  await context.env.DB.prepare('DELETE FROM items WHERE id = ? AND character_id = ?').bind(item.id, player.row.id).run();
  return respond(context, session);
}

// The scrapper buys every item in the bag of a rarity up to the chosen one.
export async function sellItems(context) {
  const { session, player } = await requirePlayer(context);
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
    const price = soldGold(player.row.id, sold, sellBonusOf(player, context.now));
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

// The scrapper buys one item from the bag, an upgraded one too: the "Sprzedaj"
// of its card (the author: "nie mogę sprzedać ulepszonych ... ani w skupie
// ani nigdzie"). The price is counted from the item still there, as above.
export async function sellItem(context) {
  const { session, player } = await requirePlayer(context);
  const item = findItem(player, context.params.id);
  if (item.equippedSlot) throw new ApiError(409, 'equipped', 'Najpierw zdejmij ten przedmiot.');
  const db = context.env.DB;
  const bonus = sellBonusOf(player, context.now);
  const price = soldGold(player.row.id, [item], bonus);
  const results = await db.batch([
    db.prepare(`UPDATE characters SET gold = gold + ${price.sql}, version = version + 1 WHERE id = ?`).bind(...price.binds, player.row.id),
    db.prepare('DELETE FROM items WHERE id = ? AND character_id = ?').bind(item.id, player.row.id),
  ]);
  const count = results[1].meta.changes;
  return json({
    sold: { count, gold: count === 1 ? sellPrice(item, content, bonus) : 0 },
    character: characterView(await loadPlayer(context.env.DB, session.userId), context.now),
  });
}

// What wearing the item (or taking it off) would change: the combat values the
// stats screen shows, now and after, each change as the game shows it and the
// verdict on them all (valueChanges in preview.js).
export async function previewItem(context) {
  const { player } = await requirePlayer(context);
  const item = findItem(player, context.params.id);
  const character = engineCharacter(player.row);
  const worn = equippedItems(player);
  const after = item.equippedSlot
    ? worn.filter((candidate) => candidate.id !== item.id)
    : [...worn.filter((candidate) => candidate.equippedSlot !== item.slot), item];
  const nowValues = combatValues(character, worn, content);
  const afterValues = combatValues(character, after, content);
  const view = (values) => ({
    damage: `${values.damageMin}–${values.damageMax}`,
    damageAverage: Math.round(values.damage * 10) / 10,
    reduction: Math.round(values.reduction * 100),
    maxHp: values.maxHp,
    dodge: Math.round(values.dodge * 1000) / 10,
    crit: Math.round(values.crit * 1000) / 10,
  });
  return json({
    itemId: item.id,
    equipped: Boolean(item.equippedSlot),
    now: view(nowValues),
    after: view(afterValues),
    ...valueChanges(nowValues, afterValues),
  });
}

// The stack of materials an upgrade from materialFrom on takes: the one the
// player chose ({ material }), of the item's rarity with enough pieces, or
// else the one with the most of them; null when none has enough.
function upgradeStack(row, need, chosen) {
  const fits = Object.entries(JSON.parse(row.materials ?? '{}')).filter(
    ([key, count]) => knownStack(key, content) && parseStack(key).rarityId === need.rarity && count >= need.count,
  );
  return (fits.find(([key]) => key === chosen) ?? fits.sort((a, b) => b[1] - a[1])[0])?.[0] ?? null;
}

// One try at upgrading an item on the camp's Kowadło, paid in gold and iron
// ore, from materialFrom on also in a material of the item's rarity, and
// rolled with a fresh seed (rollUpgrade in the engine). A failure takes the
// payment and a level, and from +7 on may break the item.
export async function upgradeItem(context) {
  const { session, player } = await requirePlayer(context);
  const item = findItem(player, context.params.id);
  // An item worn is upgraded at home; one in the bag also while away.
  requireUnworn(player, item, context.now);
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
  // `ward`: a Zwój ochronny on the Kowadło, only where the item may break.
  const body = context.request.headers.get('Content-Type') ? await readJson(context.request) : {};
  const warded = body.ward === true && view.next.breakChance > 0;
  const row = player.row;
  if (warded && row.scrolls < 1) throw new ApiError(409, 'no_scroll', 'Nie masz Zwoju ochronnego. Zrobisz go w Systemowym Warsztacie.');
  const need = view.next.materials;
  const stack = need ? upgradeStack(row, need, body.material) : null;
  if (need && !stack) {
    throw new ApiError(409, 'no_material', `To ulepszenie bierze też ${need.count} szt. materiału tej samej rzadkości co przedmiot (${content.raritiesById[need.rarity].name}).`);
  }
  // No material: a path that is never there, which asks for 0.
  const taken = stack ? need.count : 0;
  const material = `$."${stack ?? 'none'}"`;

  const roll = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const outcome = rollUpgrade(item, createRng(roll), content, { warded });
  const ore = '$."iron-ore"';
  const db = context.env.DB;
  // The item changes only if it is as seen here (its level and last roll) and
  // the price (and the scroll) is still there; the payment only if this roll
  // was saved, and a broken item goes after that. So two taps at once make
  // and pay one try.
  const statements = [
    db
      .prepare(
        `UPDATE items SET data = json_set(data, '$.upgrade', ?, '$.lastRoll', ?)
         WHERE id = ? AND character_id = ?
           AND COALESCE(json_extract(data, '$.upgrade'), 0) = ? AND COALESCE(json_extract(data, '$.lastRoll'), '') = ?
           AND (SELECT gold FROM characters WHERE id = ?) >= ?
           AND COALESCE(json_extract((SELECT resources FROM characters WHERE id = ?), ?), 0) >= ?
           AND COALESCE(json_extract((SELECT materials FROM characters WHERE id = ?), ?), 0) >= ?
           AND (SELECT scrolls FROM characters WHERE id = ?) >= ?`,
      )
      .bind(outcome.upgrade, roll, item.id, row.id, view.level, item.lastRoll ?? '', row.id, cost.gold, row.id, ore, cost['iron-ore'], row.id, material, taken, row.id, warded ? 1 : 0),
    db
      .prepare(
        `UPDATE characters SET gold = gold - ?, resources = json_set(resources, ?, COALESCE(json_extract(resources, ?), 0) - ?), scrolls = scrolls - ?,
           materials = CASE WHEN ? = 0 THEN materials WHEN json_extract(materials, ?) > ? THEN json_set(materials, ?, json_extract(materials, ?) - ?) ELSE json_remove(materials, ?) END,
           version = version + 1
         WHERE id = ? AND EXISTS (SELECT 1 FROM items WHERE id = ? AND json_extract(data, '$.lastRoll') = ?)`,
      )
      .bind(cost.gold, ore, ore, cost['iron-ore'], warded ? 1 : 0, taken, material, taken, material, material, taken, material, row.id, item.id, roll),
  ];
  if (outcome.result === 'broken') {
    statements.push(db.prepare("DELETE FROM items WHERE id = ? AND json_extract(data, '$.lastRoll') = ?").bind(item.id, roll));
  }
  const results = await db.batch(statements);
  if (results[0].meta.changes !== 1) {
    throw new ApiError(409, 'item_changed', 'Przedmiot albo zapasy zmieniły się w międzyczasie. Spróbuj jeszcze raz.');
  }
  return json({
    upgrade: {
      itemId: item.id,
      name: itemName(item, content),
      result: outcome.result,
      from: view.level,
      to: outcome.upgrade,
      cost,
      ...(stack && { material: { key: stack, count: taken } }),
      ...(warded && { warded: true }),
      ...(outcome.saved && { saved: true }),
    },
    character: characterView(await loadPlayer(db, session.userId), context.now),
  });
}

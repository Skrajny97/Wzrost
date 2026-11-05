// Wearing, taking off, throwing away, selling and upgrading items.

import {
  bagCapacity,
  baseClassLevel,
  campBonus,
  campLevels,
  canUse,
  combatValues,
  createRng,
  gearSetIds,
  valueChanges,
  heldOfRarity,
  itemName,
  missingFor,
  piecesOfRarity,
  rollUpgrade,
  sellPrice,
  upgradeView,
} from '../engine/index.js';
import { content } from './content.js';
import {
  bagItems,
  bagPlaces,
  characterView,
  engineCharacter,
  equippedItems,
  gearSetsOf,
  loadPlayer,
  rackedIds,
  requireOffRack,
  requireNotExploring,
  requirePlayer,
  requireUnworn,
  walletOf,
} from './characters.js';
import { toHex } from './encoding.js';
import { trialProgress } from './guild-trials.js';
import { ApiError, json, readJson } from './http.js';
import { takenOff } from './market.js';
import { anvilDiscountOf } from './perks.js';

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

// Worn and taken off at home or at a profession's work; an exploration
// keeps what it set out with (characters.js: requireNotExploring).
export async function equipItem(context) {
  const { session, player } = await requirePlayer(context);
  requireNotExploring(player, context.now);
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

  // Whatever was in the slot goes back to the bag first; an item taken from
  // a Zbrojownia's rack frees no place there, so one the sets do not keep
  // needs the room.
  const racked = rackedIds(player.row);
  const replaced = player.items.find((candidate) => candidate.equippedSlot === item.slot);
  if (racked.has(item.id) && replaced && !racked.has(replaced.id)) {
    if (bagPlaces(player) >= bagCapacity(campLevels(player.buildings, context.now, content), content)) throw new ApiError(409, 'bag_full', 'Plecak jest pełny.');
  }
  const db = context.env.DB;
  await db.batch([
    db.prepare('UPDATE items SET slot = NULL WHERE character_id = ? AND slot = ?').bind(player.row.id, item.slot),
    db.prepare('UPDATE items SET slot = ? WHERE id = ? AND character_id = ?').bind(item.slot, item.id, player.row.id),
  ]);
  return respond(context, session);
}

export async function unequipItem(context) {
  const { session, player } = await requirePlayer(context);
  requireNotExploring(player, context.now);
  const item = findItem(player, context.params.id);
  if (!item.equippedSlot) throw new ApiError(409, 'not_equipped', 'Ten przedmiot nie jest założony.');
  const capacity = bagCapacity(campLevels(player.buildings, context.now, content), content);
  // An item of a saved set goes back onto the Zbrojownia's rack.
  if (!gearSetIds(gearSetsOf(player.row)).has(item.id) && bagPlaces(player) >= capacity) {
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
  requireOffRack(player, item);
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
  // Upgraded items, and those with a gem set in them, are not sold by the
  // handful: too much went into them.
  const sold = bagItems(player).filter((item) => !(item.upgrade > 0) && !item.gem && rank(item) <= limit);
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
  requireOffRack(player, item);
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

// What one try at upgrading `item` on the camp's Kowadło takes, checked
// against what the character holds, or the error of what it lacks: the
// Kowadło's next level (`view`) with its price in gold and iron ore, from
// materialFrom on also pieces of materials of the item's rarity, any of
// them added up (481 B), the most plentiful material first (`taken`, by
// key: piecesOfRarity in the engine; nothing below materialFrom), and a
// Zwój ochronny where the item may break and the player asked for it
// (`body.ward`). The same for an item a companion wears, paid by the
// character (settlement.js).
export function upgradePlan(player, item, body, now) {
  const cap = campBonus(campLevels(player.buildings, now, content), 'upgradeCap', content);
  // Less gold with the Bractwo Kowali (590) and the guild's Kuźnia Gildii
  // (616 A), as the item card shows.
  const view = upgradeView(item, cap, content, null, anvilDiscountOf(player));
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
  const warded = body.ward === true && view.next.breakChance > 0;
  if (warded && player.row.scrolls < 1) throw new ApiError(409, 'no_scroll', 'Nie masz Zwoju ochronnego. Zrobisz go w Systemowym Warsztacie.');
  // `steady`: a Zwój utrwalenia, only where a failure would take a level.
  const steady = body.steady === true && view.level > 0;
  if (steady && (player.row.steady_scrolls ?? 0) < 1) throw new ApiError(409, 'no_steady_scroll', 'Nie masz Zwoju utrwalenia. Zrobisz go w Systemowym Warsztacie albo kupisz u kowala w Kuźni.');
  const need = view.next.materials;
  const materials = JSON.parse(player.row.materials ?? '{}');
  const taken = need ? piecesOfRarity(materials, need, content) : {};
  if (!taken) {
    const short = need.count - heldOfRarity(materials, need.rarity, content);
    throw new ApiError(409, 'no_material', `Brakuje ${short} szt. materiałów tej samej rzadkości co przedmiot (${content.raritiesById[need.rarity].name}).`);
  }
  return { view, cost, warded, steady, taken };
}

// A try's payment (upgradePlan) as the characters row's SQL: gold, iron ore,
// the scroll and the materials go (`set`, with its `binds`), and `enough`
// holds (with `enoughBinds`) while they are all there.
export function upgradePayment({ cost, warded, steady = false, taken }) {
  const ore = '$."iron-ore"';
  const materials = takenOff('materials', taken);
  return {
    set: `gold = gold - ?, resources = json_set(resources, ?, COALESCE(json_extract(resources, ?), 0) - ?), scrolls = scrolls - ?, steady_scrolls = steady_scrolls - ?, materials = ${materials.sql}`,
    binds: [cost.gold, ore, ore, cost['iron-ore'], warded ? 1 : 0, steady ? 1 : 0, ...materials.binds],
    enough: `gold >= ? AND COALESCE(json_extract(resources, ?), 0) >= ? AND scrolls >= ? AND steady_scrolls >= ? AND ${materials.enough}`,
    enoughBinds: [cost.gold, ore, cost['iron-ore'], warded ? 1 : 0, steady ? 1 : 0, ...materials.enoughBinds],
  };
}

// One try at upgrading an item on the camp's Kowadło, paid in gold and iron
// ore, from materialFrom on also in materials of the item's rarity, and
// rolled with a fresh seed (rollUpgrade in the engine). A failure takes the
// payment and a level, and from +7 on may break the item.
export async function upgradeItem(context) {
  const { session, player } = await requirePlayer(context);
  const item = findItem(player, context.params.id);
  // An item worn is upgraded at home; one in the bag also while away.
  requireUnworn(player, item, context.now);
  const body = context.request.headers.get('Content-Type') ? await readJson(context.request) : {};
  const plan = upgradePlan(player, item, body, context.now);
  const { view, cost, warded, steady, taken } = plan;
  const row = player.row;
  const pay = upgradePayment(plan);
  // A Zbrojownia's set forgets an item that breaks.
  const sets = gearSetsOf(row);
  const inSet = sets.some((set) => set?.items.includes(item.id));

  const roll = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const outcome = rollUpgrade(item, createRng(roll), content, { warded, steady });
  const forget =
    outcome.result === 'broken' && inSet
      ? JSON.stringify({ ...JSON.parse(row.fortress ?? '{}'), sets: sets.map((set) => set && { ...set, items: set.items.filter((id) => id !== item.id) }) })
      : null;
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
           AND EXISTS (SELECT 1 FROM characters WHERE id = ? AND ${pay.enough})`,
      )
      .bind(outcome.upgrade, roll, item.id, row.id, view.level, item.lastRoll ?? '', row.id, ...pay.enoughBinds),
    db
      .prepare(
        `UPDATE characters SET ${pay.set}${forget ? ', fortress = ?' : ''}, version = version + 1 WHERE id = ? AND EXISTS (SELECT 1 FROM items WHERE id = ? AND json_extract(data, '$.lastRoll') = ?)`,
      )
      .bind(...pay.binds, ...(forget ? [forget] : []), row.id, item.id, roll),
    // An upgrade that came off moves the Próby Gildii's trial on, only with
    // this roll saved (guild-trials.js).
    ...trialProgress(db, row.id, { upgrades: outcome.result === 'success' ? 1 : 0 }, context.now, {
      sql: "EXISTS (SELECT 1 FROM items WHERE id = ? AND json_extract(data, '$.lastRoll') = ?)",
      binds: [item.id, roll],
    }),
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
      // The pieces of materials it took, by key.
      ...(Object.keys(taken).length > 0 && { materials: taken }),
      ...(warded && { warded: true }),
      ...(outcome.saved && { saved: true }),
      ...(steady && { steadied: true }),
      ...(outcome.kept && { kept: true }),
    },
    character: characterView(await loadPlayer(db, session.userId), context.now),
  });
}

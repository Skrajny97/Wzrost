// The Osada, part I (settlement.js in the engine): the view of the board
// and the residents, delivering and rejecting an order, and reforging an
// affix at the Zaklinaczka's. It opens at the settlement unlock's level
// (unlocks.json) where the deployment has it on (SETTLEMENT, features.js).
// Each change saves only if the character is as read (its version), so two
// taps make one. On the test version "Testuj Osadę" opens it below its
// level, puts everyone at one standing and brings new orders at once.

import {
  COMPANION_SLOTS,
  addCounts,
  addQuestProgress,
  bagCapacity,
  bagStacks,
  campBonus,
  campLevels,
  classNameOf,
  craftedFor,
  createRng,
  deliverBlock,
  bondBonus,
  companionCombatant,
  companionStanding,
  companionGift,
  companionSkillLevel,
  companionStays,
  companionText,
  companionWearBlock,
  deliverOrder,
  drawCandidates,
  drawRumor,
  evolutionChangePrice,
  evolutionChanges,
  evolutionName,
  evolvedSkills,
  goodStock,
  herbalistPremium,
  herbalistStock,
  relationDiscount,
  hireCost,
  imbueBlock,
  imbueCost,
  imbueEffect,
  isAnyMaterial,
  itemName,
  itemView,
  materialView,
  materialsTaken,
  mugCost,
  orderGold,
  parseStack,
  pathResetCost,
  piecesOfRarity,
  potionPrice,
  propertyName,
  rarityNeedView,
  regenPerMinute,
  reforgeBlock,
  reforgeChoices,
  reforgeCost,
  reforgeOptions,
  rejectOrder,
  rollUpgrade,
  rumorText,
  rumorToday,
  spentPoints,
  standingOf,
  statResetCost,
  staying,
  talkWith,
  talkedToday,
  toldPieces,
  tradePoints,
  tradeView,
  upgradedItem,
  upgradedOnCompanion,
  wearOnCompanion,
  withAffix,
  xpToNext,
  saleGold,
} from '../engine/index.js';
import { content } from './content.js';
import {
  bagPlaces,
  characterView,
  currentHp,
  engineCharacter,
  loadPlayer,
  questsNow,
  requireBuildPlayer,
  requireIdle,
  requirePlayer,
  requireUnworn,
  settlementBoard,
  settlementGoods,
} from './characters.js';
import { toHex } from './encoding.js';
import { evolutionsOn, settlementOn } from './features.js';
import { ApiError, json, readJson } from './http.js';
import { forgeView } from './forge.js';
import { trialProgress } from './guild-trials.js';
import { upgradePayment, upgradePlan } from './inventory.js';
import { counted, foreign, takenOff, testMarket } from './market.js';
import { settlementTestsFor } from './test-mode.js';
import { stableView } from './stable.js';
import { tanneryView } from './tannery.js';

// A JSON path for a key with a hyphen or a colon ("iron-ore", "wolf-pelt:rare").
const jsonPath = (key) => `$."${key}"`;

const changed = () => new ApiError(409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.');

// The column a kind of goods is kept in; the Warsztat's items are rows.
const COLUMNS = { herb: 'herbs', potion: 'potions', material: 'materials', resource: 'resources', part: 'parts', craft: 'crafted' };

// The relations after a service: its resident's grows by its relationGain.
const grow = (relations, { resident, relationGain }) => ({ ...relations, [resident]: (relations[resident] ?? 0) + relationGain });

// The service each resident gives on the page, as the data names them: the
// board's orders, the reforging, the resets, the Karczma, the Chata
// zielarki, the Kuźnia or the Garbarnia; none for the others.
const serviceOf = (residentId) =>
  ['orders', 'reforge', 'hermit', 'tavern', 'herbalist', 'forge', 'tannery'].find((service) => content.settlement[service].resident === residentId) ?? null;

// What the row keeps of the Osada: reputation and relations by id, the
// board, a reforging's affixes waiting for the player's choice (`pending`),
// the changes of evolution made at the Pustelnik's and `test` once "Testuj
// Osadę" opened it below its level.
export function settlementOf(row) {
  const stored = JSON.parse(row.settlement ?? '{}');
  return {
    reputation: stored.reputation ?? {},
    relations: stored.relations ?? {},
    board: stored.board ?? null,
    ...(stored.pending && { pending: stored.pending }),
    ...(stored.evolutionChanges && { evolutionChanges: stored.evolutionChanges }),
    ...(stored.rumor && { rumor: stored.rumor }),
    ...(stored.companions && { companions: stored.companions }),
    ...(stored.dismissed && { dismissed: stored.dismissed }),
    ...(stored.trade && { trade: stored.trade }),
    // The reputation the Garbarnia's trade gave today (tannery.js).
    ...(stored.tanneryTrade && { tanneryTrade: stored.tanneryTrade }),
    // The Targowisko: the residents' goods bought today and this week, and
    // the reputation its trade gave today (market.js).
    ...(stored.market && { market: stored.market }),
    ...(stored.marketTrade && { marketTrade: stored.marketTrade }),
    // The Kuźnia: the Zwoje ochronne bought today and the relation and
    // reputation its trade gave today (forge.js).
    ...(stored.forge && { forge: stored.forge }),
    ...(stored.forgeTrade && { forgeTrade: stored.forgeTrade }),
    // The Stajnia's mount, by its stage (stable.js).
    ...(stored.mount && { mount: stored.mount }),
    ...(stored.test && { test: true }),
  };
}

// The change of evolution at the Pustelnik's, where the evolutions are on
// and the character has one: its price and the evolutions it can go to,
// by the names the character's look gives them. With a second form the
// change goes to another path's second form.
function evolutionChangeView(row, stored) {
  const character = engineCharacter(row);
  if (!evolutionsOn() || !character.evolution) return null;
  return {
    price: evolutionChangePrice(stored.evolutionChanges ?? 0, content),
    current: classNameOf(character, content),
    choices: evolutionChanges(character, content).map((evolution) => ({ id: evolution.id, name: evolutionName(evolution, character.appearance) })),
  };
}

// How many affixes the Zaklinaczka offers at the character's relation.
const choicesOf = (stored) => reforgeChoices(stored.relations[content.settlement.reforge.resident] ?? 0, content);

// A reforging's affixes waiting for a choice, of an item the character
// still has, not reforged since (the Kowadło's upgrades do not matter);
// null without one.
function pendingOf(stored, items) {
  const item = stored.pending && items.find((candidate) => candidate.id === stored.pending.itemId);
  return item && (item.reforged ?? 0) === stored.pending.reforged ? { item, ...stored.pending } : null;
}

// An affix as the item card shows it, with the Kowadło's upgrade.
const affixLabel = (item, index) => {
  const affix = upgradedItem(item, content).affixes[index];
  return `${propertyName(affix.stat, content)}: +${affix.value}`;
};

export function requireOpen(row) {
  const unlock = content.unlocksById.settlement;
  if (!settlementOn() || !content.settlement) throw new ApiError(404, 'not_found', 'Osady jeszcze nie ma.');
  if (row.level < unlock.level && !settlementOf(row).test) throw new ApiError(403, 'locked', `Osadę odblokujesz na poziomie postaci ${unlock.level}.`);
}

// A good's name on the board.
function goodLabel({ kind, key }) {
  if (kind === 'herb') return content.herbsById[key].name;
  if (kind === 'potion') return content.potionsById[key].name;
  if (isAnyMaterial({ kind, key })) {
    const [name] = content.settlement.orders.anyMaterial[parseStack(key).rarityId];
    return name[0].toUpperCase() + name.slice(1);
  }
  if (kind === 'material') {
    const { label } = materialView(key, 1, content);
    return label[0].toUpperCase() + label.slice(1);
  }
  if (kind === 'resource') return content.resourcesById[key].name;
  if (kind === 'craft') return `${content.basesById[key].name} z Warsztatu`;
  return content.partsById[key].name;
}

// The orders pay at least overScrap times the scrapper's price with the
// camp's Skup bonus (orderGold, question 236 A).
const sellBonusOf = (player, now) => campBonus(campLevels(player.buildings, now, content), 'sellPrice', content);

// An order for any materials of a rarity has the three forms of their
// name (`forms`: "materiał pospolity", "materiały pospolite", "materiałów
// pospolitych") and, once the character holds enough, the stacks
// delivering it would take (`takes`).
function orderView(order, stocks, sellBonus) {
  const have = goodStock(order, stocks, content);
  const any = isAnyMaterial(order);
  const takes =
    any && have >= order.count
      ? Object.entries(materialsTaken(order, stocks.materials, content)).map(([key, count]) => {
          const { label } = materialView(key, count, content);
          return { name: label[0].toUpperCase() + label.slice(1), count };
        })
      : null;
  return {
    ...order,
    gold: orderGold(order, sellBonus, content),
    label: goodLabel(order),
    ...(any && { forms: content.settlement.orders.anyMaterial[parseStack(order.key).rarityId] }),
    ...(takes && { takes }),
    brotherhoodName: content.settlement.brotherhoods.find((one) => one.id === order.brotherhood).name,
    have,
  };
}

// The Osada for the page: the board's places, the residents with the
// greeting of their relation's standing, the brotherhoods' standings and
// the orders on the board, each with what the character holds of it.
export function settlementView(player, stored, board, now) {
  const stocks = settlementGoods(player.row, player.items, now);
  const sellBonus = sellBonusOf(player, now);
  const { name, description, places, torches = [], residents, brotherhoods } = content.settlement;
  return {
    name,
    description,
    places,
    torches,
    residents: residents.map((resident) => {
      const standing = standingOf(stored.relations[resident.id] ?? 0, content);
      return { ...resident, service: serviceOf(resident.id), standing, greeting: resident.greetings[Math.min(standing.index, resident.greetings.length - 1)] };
    }),
    brotherhoods: brotherhoods.map((brotherhood) => ({ ...brotherhood, standing: standingOf(stored.reputation[brotherhood.id] ?? 0, content) })),
    board: {
      slots: board.slots.map((slot) => (slot.order ? { order: orderView(slot.order, stocks, sellBonus) } : { readyAt: slot.readyAt })),
      weekly: board.weekly?.order && !board.weekly.done ? orderView({ ...board.weekly.order, id: 'weekly' }, stocks, sellBonus) : null,
      weeklyDone: board.weekly?.done ?? false,
      // The wait for a new order in a slot emptied (data/settlement.json).
      refillMinutes: content.settlement.orders.refillMinutes,
    },
    reforge: {
      items: player.items.filter((item) => item.affixes?.length > 0).map((item) => reforgeView(item, stocks.materials, player.row.class_id)),
      choices: choicesOf(stored),
      pending: pendingView(pendingOf(stored, player.items)),
    },
    tavern: tavernView(player.row, stored, now),
    // The Stajnia's mounts and the character's (stable.js).
    stable: stableView(stored),
    // The parcels waiting at the Targowisko (market.js), for its dot.
    market: { waiting: player.marketWaiting ?? 0 },
    companions: companionsView(player, stored, now),
    herbalist: herbalistView(player, stored, now),
    forge: forgeView(player, stored, now),
    tannery: tanneryView(player, stored, now),
    imbue: imbueView(player),
    // After an evolution the paths change with it, so no path reset.
    hermit: {
      path: player.row.evolution ? null : pathResetCost(player.row.level, content),
      stats: statResetCost(player.row.level, content),
      evolution: evolutionChangeView(player.row, stored),
    },
    now,
  };
}

// The Zaklinaczka's zaklęcie żywiołu for the page (part III, 101 A): the
// elements with the material each takes and how many the character holds,
// and the weapons and body armours it can go on, worn or in the bag, each
// with its element now and the price in gold.
function imbueView(player) {
  const { imbue } = content.settlement;
  const materials = JSON.parse(player.row.materials ?? '{}');
  const items = player.items.filter((item) => imbue.slots.includes(item.slot));
  return {
    elements: imbue.elements.map(({ element, material }) => {
      const { stack, count } = imbueCost({ level: 1, rarity: 'common' }, element, content);
      // `key`: the material's stack, for "Poproś gildię" (guild-requests.js).
      return { element, name: content.elementsById[element].name, material: content.materialsById[material].name, key: stack, count, have: materials[stack] ?? 0 };
    }),
    items: items.map((item) => ({
      id: item.id,
      name: itemName(item, content),
      equipped: Boolean(item.equippedSlot),
      slot: item.slot,
      element: item.imbue?.element ?? null,
      gold: imbueCost(item, imbue.elements[0].element, content).gold,
      effects: Object.fromEntries(imbue.elements.map(({ element }) => [element, imbueEffect(item, element, content)])),
    })),
  };
}

// { itemId, element }: the Zaklinaczka puts an element on a weapon or a
// body armour, a worn one at home as every change of the gear, one in the
// bag also while away; one already there gives way. Gold and the element's
// material pay.
export async function imbueAtEnchantress(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const item = player.items.find((candidate) => String(candidate.id) === String(body.itemId));
  if (!item) throw new ApiError(404, 'item_not_found', 'Nie masz takiego przedmiotu.');
  // An item worn is changed at home; one in the bag also while away.
  requireUnworn(player, item, context.now);
  const materials = JSON.parse(row.materials ?? '{}');
  const block = imbueBlock(item, body.element, { gold: row.gold, materials }, content);
  if (block) throw new ApiError(block.code === 'wrong_slot' || block.code === 'invalid_element' ? 400 : 409, block.code, block.message);
  const cost = imbueCost(item, body.element, content);
  const effect = imbueEffect(item, body.element, content);
  const stored = settlementOf(row);
  const next = { ...stored, relations: grow(stored.relations, content.settlement.imbue) };
  const stack = jsonPath(cost.stack);
  const db = context.env.DB;
  // As the reforging: the item changes only if the character is as seen
  // here, and the payment only if the item now holds this element.
  await db.batch([
    db
      .prepare(`UPDATE items SET data = json_set(data, '$.imbue', json(?)) WHERE id = ? AND character_id = ? AND (SELECT version FROM characters WHERE id = ?) = ?`)
      .bind(JSON.stringify(effect), item.id, row.id, row.id, row.version),
    db
      .prepare(
        `UPDATE characters SET gold = gold - ?, settlement = ?,
           materials = CASE WHEN json_extract(materials, ?) > ? THEN json_set(materials, ?, json_extract(materials, ?) - ?) ELSE json_remove(materials, ?) END,
           version = version + 1
         WHERE id = ? AND version = ? AND gold >= ? AND COALESCE(json_extract(materials, ?), 0) >= ?
           AND EXISTS (SELECT 1 FROM items WHERE id = ? AND json_extract(data, '$.imbue.element') = ?)`,
      )
      .bind(cost.gold, JSON.stringify(next), stack, cost.count, stack, stack, cost.count, stack, row.id, row.version, cost.gold, stack, cost.count, item.id, body.element),
  ]);
  const after = await loadPlayer(db, session.userId);
  const saved = after.items.find((candidate) => candidate.id === item.id);
  if (saved?.imbue?.element !== body.element || after.row.gold !== row.gold - cost.gold) throw changed();
  return json({
    imbued: { item: itemName(item, content), element: content.elementsById[body.element].name },
    settlement: settlementView(after, next, settlementBoard(after.row, next, context.now), context.now),
    character: characterView(after, context.now),
  });
}

// What Jagna pays for one herb or potion now (part III, 121 A): the
// scrapper's price with the camp's Skup bonus, and her premium on top.
function herbalistPrices(player, stored, now) {
  const premium = herbalistPremium(stored.relations[content.settlement.herbalist.resident] ?? 0, content);
  const bonus = campBonus(campLevels(player.buildings, now, content), 'sellPrice', content);
  const scrap = (kind, id) => (kind === 'herb' ? content.herbsById[id].price : potionPrice(content.potionsById[id], content)) * (1 + bonus);
  return { premium, scrap, price: (kind, id) => scrap(kind, id) * (1 + premium) };
}

// The Chata zielarki for the page: each herb and potion in the bag with
// Jagna's price of one and the scrapper's beside it, her premium, and the
// trade's reputation today out of the day's limit (120 A). `shop` has the
// herbs she sells at the relation with her, each with its price and how
// many more of it the bag takes, and the standing that brings more.
function herbalistView(player, stored, now) {
  const { premium, scrap, price } = herbalistPrices(player, stored, now);
  const held = { herb: JSON.parse(player.row.herbs ?? '{}'), potion: JSON.parse(player.row.potions ?? '{}') };
  const goods = (kind, list) =>
    list.filter((good) => (held[kind][good.id] ?? 0) > 0).map((good) => ({ kind, id: good.id, name: good.name, count: held[kind][good.id], price: price(kind, good.id), scrap: scrap(kind, good.id) }));
  const points = stored.relations[content.settlement.herbalist.resident] ?? 0;
  const { herbs, next } = herbalistStock(points, content);
  const { stack } = content.professionRules;
  const free = Math.max(0, bagCapacity(campLevels(player.buildings, now, content), content) - bagPlaces(player));
  const room = (count) => (count % stack === 0 ? 0 : stack - (count % stack));
  return {
    premium,
    // At her best price already: no "more with a better relation".
    best: premium >= Math.max(...content.settlement.herbalist.premium),
    goods: [...goods('herb', content.herbs), ...goods('potion', content.potions)],
    trade: tradeView(stored.trade, player.row.level, now, content),
    shop: {
      goods: herbs.map(({ id, price: cost }) => {
        const herb = content.herbsById[id];
        return { kind: 'herb', key: id, name: herb.name, description: herb.description, scrap: herb.price, gatherLevel: herb.level, price: cost, fits: free * stack + room(held.herb[id] ?? 0) };
      }),
      next: next && { standing: next.standing, herbs: next.herbs.map((id) => content.herbsById[id].name) },
      discount: relationDiscount(points, content),
    },
  };
}

// { kind: herb or potion, id, count }: Jagna buys herbs or potions from the
// bag, also while the character is away, as the scrapper does (DECISIONS.md,
// "Plecak pod ręką"); the trade raises the relation with her and the
// reputation with the herbalists, up to the day's limit.
export async function sellToHerbalist(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const column = { herb: 'herbs', potion: 'potions' }[body.kind];
  const known = { herb: content.herbsById, potion: content.potionsById }[body.kind]?.[body.id];
  if (!column || !known) throw new ApiError(400, 'invalid_goods', 'Zielarka kupuje tylko zioła i mikstury.');
  const held = JSON.parse(row[column] ?? '{}')[body.id] ?? 0;
  if (!Number.isInteger(body.count) || body.count < 1 || body.count > held) throw new ApiError(409, 'not_enough', 'Nie masz tylu w torbie.');
  const stored = settlementOf(row);
  const gold = saleGold(herbalistPrices(player, stored, context.now).price(body.kind, body.id), body.count);
  const { herbalist } = content.settlement;
  const { points, trade } = tradePoints(gold, row.level, stored.trade, context.now, content);
  const add = (counts, id) => ({ ...counts, [id]: (counts[id] ?? 0) + points });
  const next = { ...stored, relations: add(stored.relations, herbalist.resident), reputation: add(stored.reputation, herbalist.brotherhood), trade };
  const key = jsonPath(body.id);
  const result = await context.env.DB.prepare(
    `UPDATE characters SET gold = gold + ?, settlement = ?,
       ${column} = CASE WHEN json_extract(${column}, ?) > ? THEN json_set(${column}, ?, json_extract(${column}, ?) - ?) ELSE json_remove(${column}, ?) END,
       version = version + 1
     WHERE id = ? AND version = ? AND COALESCE(json_extract(${column}, ?), 0) >= ?`,
  )
    .bind(gold, JSON.stringify(next), key, body.count, key, key, body.count, key, row.id, row.version, key, body.count)
    .run();
  if (result.meta.changes !== 1) throw changed();
  const after = await loadPlayer(context.env.DB, session.userId);
  return json({
    sold: { count: body.count, gold, points },
    settlement: settlementView(after, next, settlementBoard(after.row, next, context.now), context.now),
    character: characterView(after, context.now),
  });
}

// { id, count }: Jagna sells herbs (the author: "Zielarce trzeba dać też
// taką funkcję żeby to ona zioła sprzedawała"), those she has at the
// relation with her, into the bag while it has places, as bought goods
// the Encyklopedia leaves out. The trade raises the relation with her and
// the herbalists' reputation as selling does, in the same day's limit.
export async function buyFromHerbalist(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const stored = settlementOf(row);
  const { herbalist } = content.settlement;
  const good = herbalistStock(stored.relations[herbalist.resident] ?? 0, content).herbs.find((one) => one.id === body.id);
  if (!good) throw new ApiError(404, 'no_goods', 'Jagna nie sprzedaje Ci jeszcze tego zioła.');
  if (!Number.isInteger(body.count) || body.count < 1) throw new ApiError(400, 'invalid_count', 'Podaj, ile sztuk kupić.');
  const gold = good.price * body.count;
  if (row.gold < gold) throw new ApiError(409, 'not_enough_gold', 'Brakuje złota.');
  const held = JSON.parse(row.herbs ?? '{}');
  const free = bagCapacity(campLevels(player.buildings, context.now, content), content) - bagPlaces(player);
  if (bagStacks({ ...held, [good.id]: (held[good.id] ?? 0) + body.count }, content) - bagStacks(held, content) > free) {
    throw new ApiError(409, 'bag_full', 'Tyle nie zmieści się w plecaku.');
  }
  const { points, trade } = tradePoints(gold, row.level, stored.trade, context.now, content);
  const add = (counts, id) => ({ ...counts, [id]: (counts[id] ?? 0) + points });
  const next = { ...stored, relations: add(stored.relations, herbalist.resident), reputation: add(stored.reputation, herbalist.brotherhood), trade };
  const herbs = counted('herbs', { [good.id]: body.count });
  const others = foreign({ herb: { [good.id]: body.count } });
  const result = await context.env.DB.prepare(
    `UPDATE characters SET gold = gold - ?, herbs = ${herbs.sql}, foreign_stacks = ${others.sql}, settlement = ?, version = version + 1
     WHERE id = ? AND version = ? AND gold >= ?`,
  )
    .bind(gold, ...herbs.binds, ...others.binds, JSON.stringify(next), row.id, row.version, gold)
    .run();
  if (result.meta.changes !== 1) throw changed();
  const after = await loadPlayer(context.env.DB, session.userId);
  return json({
    bought: { name: content.herbsById[good.id].name, count: body.count, gold, points },
    settlement: settlementView(after, next, settlementBoard(after.row, next, context.now), context.now),
    character: characterView(after, context.now),
  });
}

// The Karczma: the mug's price and today's rumor once the innkeeper told
// it (not the beggar's song: the mug still tells it, for the relation).
function tavernView(row, stored, now) {
  const rumor = rumorToday(stored.rumor, now, content);
  return {
    mug: mugCost(row.level, content),
    // The innkeeper's words only: the place and what it means are the
    // player's to work out.
    rumor: rumor && !rumor.song ? { text: rumorText(rumor, content) } : null,
  };
}

// A companion or a candidate as the Karczma shows it (companions.js): its
// class and level, its numbers in a fight, its traits in its own form, its
// skills at its level, the gear it wears, its profession and story, and
// how long it is still wounded. With `upgradeCap` (the Kowadło's level,
// for a hired one) each item it wears has the Kowadło's part of its card,
// paid from the character's `materials` too, and `roll`, the seed of its
// last try on the Kowadło, which the next try names (upgradeCompanionItem).
function companionView(companion, { upgradeCap, materials } = {}) {
  const unit = companionCombatant(companion, {}, content);
  const female = companion.appearance === 'female';
  const { traits, professions, stories } = content.settlement.companions;
  return {
    id: companion.id,
    name: companion.name,
    appearance: companion.appearance,
    classId: companion.classId,
    className: content.classesById[companion.classId].name,
    level: companion.level,
    xp: companion.xp ?? 0,
    xpToNext: xpToNext(companion.level, content),
    maxHp: unit.maxHp,
    armor: unit.armor,
    traits: companion.traits.map((id) => {
      const trait = traits.find((one) => one.id === id);
      return { name: trait.names[female ? 0 : 1], text: trait.text };
    }),
    skills: companion.skills.map((id) => ({ name: content.skillsById[id].name, level: companionSkillLevel(id, companion.level, content) })),
    gear: companion.gear.map((item) => itemName(item, content)),
    // What it wears in each of its places (question 108 A), and whether
    // the item came from the character's bag.
    wear: COMPANION_SLOTS.map((slot) => {
      const worn = companion.gear.find((item) => item.slot === slot);
      const shown = worn && { ...itemView(worn, content, { upgradeCap, materials }), given: Boolean(worn.given), ...(upgradeCap !== undefined && { roll: worn.lastRoll ?? '' }) };
      return { slot, slotName: content.slotsById[slot].name, item: shown || null };
    }),
    profession: professions.find((one) => one.id === companion.profession)?.name ?? null,
    story: stories[companion.story % stories.length],
  };
}

// When the character will have rested to full HP, the moment its wounded
// companions heal (companions.js): now when it is full, null while it is
// away, as it rests only at home.
function restedAt(player, now) {
  if (player.activity) return null;
  const { hp, maxHp, vitality, rest } = currentHp(player, now);
  if (hp >= maxHp) return now;
  return Math.ceil(now + ((maxHp - hp) / regenPerMinute(maxHp, vitality, content, rest.change?.bonus ?? rest.bonus)) * 60000);
}

// The character as an order and a companion's gift see it: what it knows.
const knowing = (row) => ({ ...engineCharacter(row), met: JSON.parse(row.met ?? '[]'), patterns: JSON.parse(row.patterns ?? '[]') });

// A companion's gift of the week (question 112 A), with the goods' name.
function giftOf(companion, row, now) {
  const gift = companionGift(companion, { character: knowing(row), seed: `${row.id}:settlement` }, now, content);
  if (!gift) return null;
  const goods = { herb: content.herbsById, potion: content.potionsById, part: content.partsById }[gift.kind];
  return { ...gift, name: goods[gift.key].name };
}

// The places for companions: a bed in the camp's Kwatery for each (104 A:
// the companion lives in the camp), and how many beds the Kwatery have at
// their highest level. The relation with the innkeeper sets the price only.
function placesOf(player, now) {
  const beds = campBonus(campLevels(player.buildings, now, content), 'companionPlaces', content);
  const most = content.buildings.filter((building) => building.effect.kind === 'companionPlaces').reduce((sum, building) => sum + building.effect.perLevel * building.maxLevel, 0);
  return { places: beds, most };
}

// The innkeeper's relation points, which set the price of hiring.
const innkeeperPoints = (stored) => stored.relations[content.settlement.tavern.resident] ?? 0;

// The Karczma's werbunek (questions 104–106): the places the Kwatery give,
// the companions hired with this week's gift and this week's candidates not
// hired yet, each with its price at the standing with the innkeeper.
function companionsView(player, stored, now) {
  const { row } = player;
  const bag = player.items.filter((item) => !item.equippedSlot);
  const rested = (stored.companions ?? []).some((companion) => companion.wounded) ? restedAt(player, now) : now;
  const { places, most } = placesOf(player, now);
  const upgradeCap = campBonus(campLevels(player.buildings, now, content), 'upgradeCap', content);
  const materials = JSON.parse(row.materials ?? '{}');
  const hired = stored.companions ?? [];
  const points = innkeeperPoints(stored);
  const candidates = drawCandidates({ character: engineCharacter(row), seed: `${row.id}:settlement` }, now, content, [
    ...hired.map((companion) => companion.id),
    ...(stored.dismissed ?? []),
  ]);
  return {
    places,
    // Whether the Kwatery can give another bed, and whether a higher
    // standing with the innkeeper would make hiring cheaper.
    moreBeds: places < most,
    cheaper: hireCost({ level: 1 }, content, points) > hireCost({ level: 1 }, content, Infinity),
    // Each with this week's gift and the items in the bag it can wear.
    hired: hired.map((companion) => {
      const away = companionAway(player, companion);
      return {
        ...companionView(companion, { upgradeCap, materials }),
        // Wounded until the character rests to full HP, and when that is.
        ...(companion.wounded && rested !== now && { wounded: true, healsAt: rested }),
        gift: giftOf(companion, row, now),
        wearable: bag.filter((item) => !companionWearBlock(companion, item, content)).map((item) => item.id),
        bond: bondView(companion, now),
        // Out on the character's exploration: its gear waits for its return,
        // in its words; null at home.
        away: away ? companionText('away', companion, content) : null,
        // The line of its item's card: who wears it and who pays.
        wornBy: companionText('wornBy', companion, content),
        stay: stayView(companion, player.inParty, away),
      };
    }),
    candidates: candidates.map((candidate) => ({ ...companionView(candidate), price: hireCost(candidate, content, points) })),
  };
}

// Whether a hired companion is out on the character's exploration now: it
// set out with it (the exploration keeps it as it went, hunts.js) and comes
// back with its report. One who stayed in the Kwatery, or stayed behind
// wounded, is at home.
function companionAway(player, companion) {
  if (player.activity?.kind !== 'hunt') return false;
  return (JSON.parse(player.activity.options ?? '{}').companions ?? []).some((one) => one.id === companion.id);
}

// While a companion is away, the changes of its gear wait for its return,
// as the character's own equipment waits on an exploration (characters.js):
// putting on an item from the bag and upgrading one it wears.
function requireCompanionHome(player, companion, now) {
  if (companionAway(player, companion)) requireIdle(player, now);
}

// Whether a companion goes on the explorations or stays in the Kwatery (the
// author: "[Zostań w kwaterze]"), in its words, with the switch to the
// other (`action`: the label and the `stays` to send). In a Drużyna every
// companion stays, with no switch. One set to stay while out on an
// exploration stays from its return on.
function stayView(companion, inParty, away) {
  if (inParty) return { stays: true, text: companionText('inParty', companion, content), action: null };
  const stays = companionStays(companion);
  return {
    stays,
    text: companionText(stays ? (away ? 'stayingAfter' : 'staying') : 'going', companion, content),
    action: { stays: !stays, label: companionText(stays ? 'go' : 'stay', companion, content) },
  };
}

// The relation with a hired companion (296 A) and its talks (295 A): its
// standing and the next, its bonus in a fight, the pieces of its story it
// has told, and whether it was talked to today.
function bondView(companion, now) {
  const standing = companionStanding(companion, content);
  return {
    standing: standing.name,
    points: standing.points,
    next: standing.next && { name: standing.next.name, points: standing.next.points },
    bonus: bondBonus(companion, content),
    told: toldPieces(companion, content),
    talked: talkedToday(companion, now, content),
  };
}

// An item the Zaklinaczka can reforge: its affixes as the item card shows
// them (with the Kowadło's upgrade) and the price, with the pieces of the
// materials' rarity the character holds in all and those it would take
// (rarityNeedView), and which affixes matter to its class.
function reforgeView(item, materials, classId) {
  const shown = upgradedItem(item, content);
  const cost = reforgeCost(item, item.reforged ?? 0, content);
  const need = cost.materials;
  return {
    id: item.id,
    name: itemName(item, content),
    rarity: item.rarity,
    equipped: Boolean(item.equippedSlot),
    affixes: shown.affixes.map((affix) => `${propertyName(affix.stat, content)}: +${affix.value}`),
    hints: affixHints(shown.affixes, classId),
    gold: cost.gold,
    materials: need && { ...rarityNeedView(materials, need, content), rarityName: content.raritiesById[need.rarity].name },
  };
}

// Which of an item's affixes matter to a class and which is worth
// reforging (the author: 319 A), by the class's spread of points
// (autoPoints): a stat it puts much into is important; of the stats, the one
// it puts least into, the smallest of them on a tie, is worth reforging
// unless it is important too. Armor and resistances help every class and are
// neither.
function affixHints(affixes, classId) {
  const weights = content.classesById[classId]?.autoPoints ?? {};
  const top = Math.max(0, ...Object.values(weights));
  const weightOf = (affix) => (content.statIds.includes(affix.stat) ? (weights[affix.stat] ?? 0) : null);
  const stats = affixes.map((affix, index) => ({ index, weight: weightOf(affix), value: affix.value })).filter((one) => one.weight !== null);
  const worst = stats.sort((a, b) => a.weight - b.weight || a.value - b.value)[0];
  return affixes.map((affix, index) => {
    const weight = weightOf(affix);
    return {
      important: weight !== null && top > 0 && weight * 2 >= top,
      worth: Boolean(worst) && worst.index === index && worst.weight * 2 < top,
    };
  });
}

// The affixes to choose from after a reforging: the item, the affix they
// replace and each new one as the item would show it.
function pendingView(pending) {
  if (!pending) return null;
  const { item, affix, options } = pending;
  return {
    itemId: item.id,
    name: itemName(item, content),
    old: affixLabel(item, affix),
    options: options.map((option) => affixLabel(withAffix(item, affix, option), affix)),
  };
}

// Saves a board drawn anew (new orders came) if the row is still as read.
async function saveBoard(db, row, stored, board) {
  const next = JSON.stringify({ ...stored, board });
  if (next === (row.settlement ?? '{}')) return;
  await db.prepare('UPDATE characters SET settlement = ? WHERE id = ? AND settlement IS ?').bind(next, row.id, row.settlement ?? null).run();
}

export async function getSettlement(context) {
  const { player } = await requirePlayer(context);
  requireOpen(player.row);
  const stored = settlementOf(player.row);
  const board = settlementBoard(player.row, stored, context.now);
  await saveBoard(context.env.DB, player.row, stored, board);
  return json({ settlement: settlementView(player, stored, board, context.now), character: characterView(player, context.now) });
}

// { orderId }: hands over what an order asks for, for its gold, the
// brotherhood's reputation, the relation with the resident who posts the
// orders and maybe Punkty Systemu.
export async function deliverSettlementOrder(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const stored = settlementOf(row);
  const board = settlementBoard(row, stored, context.now);
  const goods = settlementGoods(row, player.items, context.now);
  const block = deliverBlock(board, body.orderId, goods, content);
  if (block) throw new ApiError(block.code === 'no_order' ? 404 : 409, block.code, block.message);
  const done = deliverOrder(board, body.orderId, context.now, content, sellBonusOf(player, context.now));
  const add = (counts, more) => ({ ...counts, ...Object.fromEntries(Object.entries(more).map(([id, gain]) => [id, (counts[id] ?? 0) + gain])) });
  const next = { ...stored, reputation: add(stored.reputation, done.reputation), relations: add(stored.relations, done.relation), board: done.board };
  // The narrator's quests "Wykonaj N zleceń w Osadzie" (question 95).
  const quests = JSON.stringify(addQuestProgress(questsNow(player, context.now), { orders: 1 }));
  const db = context.env.DB;
  // The Próby Gildii's trial too (guild-trials.js): set in the delivery's
  // batch just before its save, under that save's own condition (`where`,
  // about the character as read), so it moves only with the save, once for
  // two taps at once (the week's order makes the same Osada for both).
  const trial = (where) => trialProgress(db, row.id, { orders: 1 }, context.now, where);
  if (done.take.kind === 'craft') {
    await deliverCrafted(db, player, done, { settlement: JSON.stringify(next), quests, trial });
    const after = await loadPlayer(db, session.userId);
    if (after.row.settlement !== JSON.stringify(next)) throw changed();
    return json({
      delivered: { gold: done.gold, systemPoints: done.systemPoints, reputation: done.reputation },
      settlement: settlementView(after, next, done.board, context.now),
      character: characterView(after, context.now),
    });
  }
  if (done.take.kind === 'material') {
    // Materials, any of a rarity from several stacks (materialsTaken), are
    // saved whole, only if the character is as read.
    const taken = materialsTaken(done.take, goods.materials, content);
    const left = addCounts(goods.materials, Object.fromEntries(Object.entries(taken).map(([key, count]) => [key, -count])));
    const saved = await db.batch([
      ...trial({ sql: '(SELECT version FROM characters WHERE id = ?) = ? AND (SELECT materials FROM characters WHERE id = ?) IS ?', binds: [row.id, row.version, row.id, row.materials] }),
      db
        .prepare(
          `UPDATE characters SET gold = gold + ?, system_points = system_points + ?, settlement = ?, quests = ?, materials = ?, version = version + 1
           WHERE id = ? AND version = ? AND materials IS ?`,
        )
        .bind(done.gold, done.systemPoints, JSON.stringify(next), quests, JSON.stringify(left), row.id, row.version, row.materials),
    ]);
    if (saved.at(-1).meta.changes !== 1) throw changed();
    const after = await loadPlayer(db, session.userId);
    return json({
      delivered: { gold: done.gold, systemPoints: done.systemPoints, reputation: done.reputation },
      settlement: settlementView(after, next, done.board, context.now),
      character: characterView(after, context.now),
    });
  }
  const column = COLUMNS[done.take.kind];
  const key = jsonPath(done.take.key);
  const saved = await db.batch([
    ...trial({
      sql: `(SELECT version FROM characters WHERE id = ?) = ? AND COALESCE((SELECT json_extract(${column}, ?) FROM characters WHERE id = ?), 0) >= ?`,
      binds: [row.id, row.version, key, row.id, done.take.count],
    }),
    db
      .prepare(
        `UPDATE characters SET gold = gold + ?, system_points = system_points + ?, settlement = ?, quests = ?,
           ${column} = CASE WHEN json_extract(${column}, ?) > ? THEN json_set(${column}, ?, json_extract(${column}, ?) - ?) ELSE json_remove(${column}, ?) END,
           version = version + 1
         WHERE id = ? AND version = ? AND COALESCE(json_extract(${column}, ?), 0) >= ?`,
      )
      .bind(done.gold, done.systemPoints, JSON.stringify(next), quests, key, done.take.count, key, key, done.take.count, key, row.id, row.version, key, done.take.count),
  ]);
  if (saved.at(-1).meta.changes !== 1) throw changed();
  const after = await loadPlayer(db, session.userId);
  return json({
    delivered: { gold: done.gold, systemPoints: done.systemPoints, reputation: done.reputation },
    settlement: settlementView(after, next, done.board, context.now),
    character: characterView(after, context.now),
  });
}

// Delivering the Warsztat's items: they leave the bag, the weakest first,
// and the order pays, all of it or nothing. The payment goes only if the
// character is as read and every item is still in the bag, and the Próby
// Gildii's `trial` (a function of that condition) only with it; the items
// go only if that payment was saved (its new Osada is unique to it).
async function deliverCrafted(db, player, done, { settlement, quests, trial = () => [] }) {
  const { row } = player;
  const ids = craftedFor(player.items, done.take.key, done.take.count, content).map((item) => item.id);
  if (ids.length < done.take.count) throw new ApiError(409, 'not_enough', 'Brakuje Ci jeszcze tego, o co proszą.');
  const list = ids.map(() => '?').join(', ');
  const inBag = `(SELECT COUNT(*) FROM items WHERE character_id = ? AND slot IS NULL AND id IN (${list})) = ?`;
  await db.batch([
    ...trial({ sql: `(SELECT version FROM characters WHERE id = ?) = ? AND ${inBag}`, binds: [row.id, row.version, row.id, ...ids, ids.length] }),
    db
      .prepare(
        `UPDATE characters SET gold = gold + ?, system_points = system_points + ?, settlement = ?, quests = ?, version = version + 1
         WHERE id = ? AND version = ? AND ${inBag}`,
      )
      .bind(done.gold, done.systemPoints, settlement, quests, row.id, row.version, row.id, ...ids, ids.length),
    db
      .prepare(`DELETE FROM items WHERE character_id = ? AND slot IS NULL AND id IN (${list}) AND (SELECT settlement FROM characters WHERE id = ?) = ?`)
      .bind(row.id, ...ids, row.id, settlement),
  ]);
}

// A mug at the Karczma (question 116): for gold, the innkeeper tells
// today's rumor (settlement.js in the engine), and the relation with him
// grows. One a day: the day's rumor stays told until midnight.
export async function buyMug(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const stored = settlementOf(row);
  // The day's rumor the beggar's song told is the same the innkeeper tells,
  // still unused or used as it was.
  const today = rumorToday(stored.rumor, context.now, content);
  if (today && !today.song) throw new ApiError(409, 'told', 'Zbylut nie słyszał dziś nic nowego. Zajrzyj jutro.');
  const { song: _, ...rumor } = today ?? drawRumor({ character: engineCharacter(row), seed: `${row.id}:settlement` }, context.now, content) ?? {};
  if (!rumor.areaId) throw new ApiError(409, 'no_rumor', 'Zbylut nie słyszał o niczym groźnym w miejscach, do których chodzisz.');
  const gold = mugCost(row.level, content);
  if (row.gold < gold) throw new ApiError(409, 'not_enough_gold', 'Brakuje złota na kufel.');
  const next = { ...stored, rumor, relations: grow(stored.relations, content.settlement.tavern) };
  const result = await context.env.DB.prepare('UPDATE characters SET gold = gold - ?, settlement = ?, version = version + 1 WHERE id = ? AND version = ? AND gold >= ?')
    .bind(gold, JSON.stringify(next), row.id, row.version, gold)
    .run();
  if (result.meta.changes !== 1) throw changed();
  const after = await loadPlayer(context.env.DB, session.userId);
  const board = settlementBoard(after.row, next, context.now);
  return json({ settlement: settlementView(after, next, board, context.now), character: characterView(after, context.now) });
}

// { candidateId }: hires one of this week's candidates for gold, when the
// camp's Kwatery have a free bed. Any standing with the innkeeper may hire,
// a lower one for more gold. The companion goes on the next exploration.
export async function hireCompanion(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const stored = settlementOf(row);
  const hired = stored.companions ?? [];
  if (hired.length >= placesOf(player, context.now).places) throw new ApiError(409, 'no_bed', 'W Kwaterach w obozie nie ma wolnego posłania.');
  const taken = [...hired.map((companion) => companion.id), ...(stored.dismissed ?? [])];
  const candidate = drawCandidates({ character: engineCharacter(row), seed: `${row.id}:settlement` }, context.now, content, taken).find((one) => one.id === body.candidateId);
  if (!candidate) throw new ApiError(404, 'no_candidate', 'Tego kandydata już nie ma w Karczmie.');
  const gold = hireCost(candidate, content, innkeeperPoints(stored));
  if (row.gold < gold) throw new ApiError(409, 'not_enough_gold', 'Brakuje złota na werbunek.');
  const next = { ...stored, companions: [...hired, candidate] };
  const result = await context.env.DB.prepare('UPDATE characters SET gold = gold - ?, settlement = ?, version = version + 1 WHERE id = ? AND version = ? AND gold >= ?')
    .bind(gold, JSON.stringify(next), row.id, row.version, gold)
    .run();
  if (result.meta.changes !== 1) throw changed();
  const after = await loadPlayer(context.env.DB, session.userId);
  return json({ settlement: settlementView(after, next, settlementBoard(after.row, next, context.now), context.now), character: characterView(after, context.now) });
}

// { companionId }: the companion leaves for good and does not come back as
// a candidate this week. It gives back the items it got from the bag, so
// they need free places there, and takes its own gear along. Also while it
// is out on an exploration: it is not brought back from it (hunts.js).
export async function dismissCompanion(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const stored = settlementOf(row);
  const hired = stored.companions ?? [];
  const companion = hired.find((one) => one.id === body.companionId);
  if (!companion) throw new ApiError(404, 'no_companion', 'Nie masz takiego towarzysza.');
  const given = companion.gear.filter((item) => item.given);
  if (bagPlaces(player) + given.length > bagCapacity(campLevels(player.buildings, context.now, content), content)) {
    throw new ApiError(409, 'bag_full', `${companion.name} odda ${given.length === 1 ? 'przedmiot' : 'przedmioty'} z twojego plecaka, a brakuje w nim miejsca.`);
  }
  const next = { ...stored, companions: hired.filter((one) => one !== companion), dismissed: [...(stored.dismissed ?? []), body.companionId] };
  const saved = JSON.stringify(next);
  const db = context.env.DB;
  const [result] = await db.batch([
    db.prepare('UPDATE characters SET settlement = ?, version = version + 1 WHERE id = ? AND version = ?').bind(saved, row.id, row.version),
    ...given.map((item) => backToBag(db, row, item, saved, context.now)),
  ]);
  if (result.meta.changes !== 1) throw changed();
  const after = await loadPlayer(db, session.userId);
  return json({ settlement: settlementView(after, next, settlementBoard(after.row, next, context.now), context.now), character: characterView(after, context.now) });
}

// An item a companion wore goes back to the bag, only after the change of
// the Osada saved as `saved` (the batch's first statement) went through.
const backToBag = (db, row, item, saved, now) => {
  const { given, ...data } = item;
  return db
    .prepare('INSERT INTO items (character_id, slot, data, created_at) SELECT ?, NULL, ?, ? WHERE EXISTS (SELECT 1 FROM characters WHERE id = ? AND version = ? AND settlement = ?)')
    .bind(row.id, JSON.stringify(data), now, row.id, row.version + 1, saved);
};

// { companionId, itemId }: the companion puts on an item from the bag in
// its place (question 108 A), and what it wore there goes back to the bag.
// At home or at a profession's work, as the character's own equipment
// (inventory.js); an exploration keeps what it set out with, so one away
// on it waits for its return (one who stayed in the Kwatery does not).
export async function equipCompanion(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const stored = settlementOf(row);
  const hired = stored.companions ?? [];
  const companion = hired.find((one) => one.id === body.companionId);
  if (!companion) throw new ApiError(404, 'no_companion', 'Nie masz takiego towarzysza.');
  requireCompanionHome(player, companion, context.now);
  const item = player.items.find((one) => one.id === body.itemId && !one.equippedSlot);
  if (!item) throw new ApiError(404, 'item_not_found', 'Tego przedmiotu nie ma w plecaku.');
  const block = companionWearBlock(companion, item, content);
  if (block) throw new ApiError(403, block.code, block.message);
  const { id, equippedSlot, ...data } = item;
  const { companion: dressed, off } = wearOnCompanion(companion, data);
  const next = { ...stored, companions: hired.map((one) => (one === companion ? dressed : one)) };
  const saved = JSON.stringify(next);
  const db = context.env.DB;
  const [result] = await db.batch([
    db
      .prepare('UPDATE characters SET settlement = ?, version = version + 1 WHERE id = ? AND version = ? AND EXISTS (SELECT 1 FROM items WHERE id = ? AND character_id = ? AND slot IS NULL)')
      .bind(saved, row.id, row.version, item.id, row.id),
    db
      .prepare('DELETE FROM items WHERE id = ? AND character_id = ? AND slot IS NULL AND EXISTS (SELECT 1 FROM characters WHERE id = ? AND version = ? AND settlement = ?)')
      .bind(item.id, row.id, row.id, row.version + 1, saved),
    ...(off ? [backToBag(db, row, off, saved, context.now)] : []),
  ]);
  if (result.meta.changes !== 1) throw changed();
  const after = await loadPlayer(db, session.userId);
  return json({ settlement: settlementView(after, next, settlementBoard(after.row, next, context.now), context.now), character: characterView(after, context.now) });
}

// { companionId, slot, roll, ward }: one try at upgrading the item
// a hired companion wears in `slot` on the camp's Kowadło (the author:
// "niech tu będzie opcja kliknięcia w przedmiot i ulepszania go jak na
// Kowadle"), by the same rules as the character's own items (inventory.js):
// the Kowadło's levels, the chances, the price in the character's gold, iron
// ore and materials, and a Zwój ochronny where the item may break. Only the
// companion's item changes, kept in the Osada; a broken one is gone from
// its place. While the companion is away on an exploration it waits, as
// "Załóż z plecaka" does. The Osada and the payment are saved in one
// statement, only while the character is as read (its version), so two
// taps at once make and pay one try; and `roll`, the seed of the item's
// last try as the card showed it, makes a second tap of the same card no
// try even when it comes after the first is done.
export async function upgradeCompanionItem(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const stored = settlementOf(row);
  const hired = stored.companions ?? [];
  const companion = hired.find((one) => one.id === body.companionId);
  if (!companion) throw new ApiError(404, 'no_companion', 'Nie masz takiego towarzysza.');
  const item = COMPANION_SLOTS.includes(body.slot) ? companion.gear.find((one) => one.slot === body.slot) : null;
  if (!item) throw new ApiError(404, 'item_not_found', companionText('noItem', companion, content));
  const changedItem = () => new ApiError(409, 'item_changed', 'Przedmiot albo zapasy zmieniły się w międzyczasie. Spróbuj jeszcze raz.');
  if (typeof body.roll === 'string' && body.roll !== (item.lastRoll ?? '')) throw changedItem();
  requireCompanionHome(player, companion, context.now);
  const plan = upgradePlan(player, item, body, context.now);
  const pay = upgradePayment(plan);
  const roll = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const outcome = rollUpgrade(item, createRng(roll), content, { warded: plan.warded });
  const next = { ...stored, companions: hired.map((one) => (one === companion ? upgradedOnCompanion(one, body.slot, outcome, roll) : one)) };
  const saved = JSON.stringify(next);
  const db = context.env.DB;
  const [result] = await db.batch([
    db
      .prepare(`UPDATE characters SET settlement = ?, ${pay.set}, version = version + 1 WHERE id = ? AND version = ? AND ${pay.enough}`)
      .bind(saved, ...pay.binds, row.id, row.version, ...pay.enoughBinds),
    // An upgrade that came off moves the Próby Gildii's trial on, as one of
    // the character's own items does, only with this try saved (its seed
    // makes the Osada saved its own).
    ...trialProgress(db, row.id, { upgrades: outcome.result === 'success' ? 1 : 0 }, context.now, {
      sql: '(SELECT settlement FROM characters WHERE id = ?) = ?',
      binds: [row.id, saved],
    }),
  ]);
  if (result.meta.changes !== 1) throw changedItem();
  const after = await loadPlayer(db, session.userId);
  return json({
    upgrade: {
      companionId: companion.id,
      slot: body.slot,
      name: itemName(item, content),
      result: outcome.result,
      from: plan.view.level,
      to: outcome.upgrade,
      cost: plan.cost,
      // The pieces of materials it took, by key.
      ...(Object.keys(plan.taken).length > 0 && { materials: plan.taken }),
      ...(plan.warded && { warded: true }),
      ...(outcome.saved && { saved: true }),
    },
    settlement: settlementView(after, next, settlementBoard(after.row, next, context.now), context.now),
    character: characterView(after, context.now),
  });
}

// { companionId, stays }: the companion stays in the Kwatery (`stays`
// true, "Zostań w kwaterze") or goes on the explorations again ("Idź na
// wyprawy"), from the next one on. In a Drużyna every companion stays (the
// author: "nie może być w drużynie, dopóki nie kliknie na nim [Zostań w
// kwaterze]"), so none goes out again while the character is in one.
// Saved only while the character is as read.
export async function setCompanionStay(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const stored = settlementOf(row);
  const hired = stored.companions ?? [];
  const companion = hired.find((one) => one.id === body.companionId);
  if (!companion) throw new ApiError(404, 'no_companion', 'Nie masz takiego towarzysza.');
  if (typeof body.stays !== 'boolean') throw new ApiError(400, 'invalid_stay', companionText('invalidStay', companion, content));
  if (!body.stays && player.inParty) throw new ApiError(409, 'in_party', companionText('inParty', companion, content));
  const next = { ...stored, companions: hired.map((one) => (one === companion ? staying(one, body.stays) : one)) };
  const result = await context.env.DB.prepare('UPDATE characters SET settlement = ?, version = version + 1 WHERE id = ? AND version = ?')
    .bind(JSON.stringify(next), row.id, row.version)
    .run();
  if (result.meta.changes !== 1) throw changed();
  const after = await loadPlayer(context.env.DB, session.userId);
  return json({
    text: companionText(body.stays ? 'stayed' : 'goes', companion, content),
    settlement: settlementView(after, next, settlementBoard(after.row, next, context.now), context.now),
    character: characterView(after, context.now),
  });
}

// { companionId }: the companion's gift of the week from its profession
// (question 112 A) goes to the character's goods, also while the
// character is away, as the bag stays at hand (DECISIONS.md, "Plecak pod
// ręką").
export async function takeCompanionGift(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const stored = settlementOf(row);
  const hired = stored.companions ?? [];
  const companion = hired.find((one) => one.id === body.companionId);
  if (!companion) throw new ApiError(404, 'no_companion', 'Nie masz takiego towarzysza.');
  const gift = giftOf(companion, row, context.now);
  if (!gift) throw new ApiError(409, 'gift_taken', 'Prezent z tego tygodnia jest już odebrany. Następny w poniedziałek.');
  const next = { ...stored, companions: hired.map((one) => (one === companion ? { ...one, giftWeek: gift.week } : one)) };
  const column = COLUMNS[gift.kind];
  // Herbs and potions take places in the bag, as Jagna's do: a gift that
  // does not fit waits for room (the code review: it overfilled the bag and
  // the next exploration sold the weakest items).
  if (gift.kind === 'herb' || gift.kind === 'potion') {
    const held = JSON.parse(row[column] ?? '{}');
    const free = bagCapacity(campLevels(player.buildings, context.now, content), content) - bagPlaces(player);
    if (bagStacks({ ...held, [gift.key]: (held[gift.key] ?? 0) + gift.count }, content) - bagStacks(held, content) > free) {
      throw new ApiError(409, 'bag_full', `${companion.name} ma dla Ciebie prezent, ale nie zmieści się w plecaku. Zrób w nim miejsce.`);
    }
  }
  const key = jsonPath(gift.key);
  const result = await context.env.DB.prepare(
    `UPDATE characters SET settlement = ?, ${column} = json_set(${column}, ?, COALESCE(json_extract(${column}, ?), 0) + ?), version = version + 1 WHERE id = ? AND version = ?`,
  )
    .bind(JSON.stringify(next), key, key, gift.count, row.id, row.version)
    .run();
  if (result.meta.changes !== 1) throw changed();
  const after = await loadPlayer(context.env.DB, session.userId);
  return json({
    gift: { name: gift.name, count: gift.count },
    settlement: settlementView(after, next, settlementBoard(after.row, next, context.now), context.now),
    character: characterView(after, context.now),
  });
}

// { companionId }: a talk with a companion in the Kwatery, once a day (295
// A): it tells the next piece of its story once the relation has reached
// it, else a word of the day, and the relation grows (296 A).
export async function talkWithCompanion(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const stored = settlementOf(row);
  const hired = stored.companions ?? [];
  const companion = hired.find((one) => one.id === body.companionId);
  if (!companion) throw new ApiError(404, 'no_companion', 'Nie masz takiego towarzysza.');
  if (talkedToday(companion, context.now, content)) throw new ApiError(409, 'talked', 'Na dziś wystarczy. Porozmawiacie jutro.');
  const { talk, companion: after } = talkWith(companion, { seed: `${row.id}:settlement`, now: context.now }, content);
  const next = { ...stored, companions: hired.map((one) => (one === companion ? after : one)) };
  const result = await context.env.DB.prepare('UPDATE characters SET settlement = ?, version = version + 1 WHERE id = ? AND version = ?')
    .bind(JSON.stringify(next), row.id, row.version)
    .run();
  if (result.meta.changes !== 1) throw changed();
  const loaded = await loadPlayer(context.env.DB, session.userId);
  return json({
    talk,
    settlement: settlementView(loaded, next, settlementBoard(loaded.row, next, context.now), context.now),
    character: characterView(loaded, context.now),
  });
}

// { orderId }: takes an order off the board for free; a new one comes later.
export async function rejectSettlementOrder(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const stored = settlementOf(row);
  const board = rejectOrder(settlementBoard(row, stored, context.now), body.orderId, context.now, content);
  if (!board) throw new ApiError(404, 'no_order', 'Tego zlecenia nie da się odrzucić.');
  const next = { ...stored, board };
  const result = await context.env.DB.prepare('UPDATE characters SET settlement = ?, version = version + 1 WHERE id = ? AND version = ?')
    .bind(JSON.stringify(next), row.id, row.version)
    .run();
  if (result.meta.changes !== 1) throw changed();
  return json({ settlement: settlementView(player, next, board, context.now), character: characterView(await loadPlayer(context.env.DB, session.userId), context.now) });
}

// { itemId, affix }: the Zaklinaczka draws one affix of an item anew, for
// gold and creatures' materials of a rarity, any of them added up, the most
// plentiful material first (piecesOfRarity in the engine).
// From a closer relation she draws two or three and the player keeps one
// (chooseReforged); until then they wait in the Osada and no other affix
// can be reforged. A worn item waits for the character at home, as at the
// Kowadło; one in the bag is reforged also while it is away.
export async function reforgeAtEnchantress(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const stored = settlementOf(row);
  if (pendingOf(stored, player.items)) throw new ApiError(409, 'choose_first', 'Najpierw wybierz afiks z poprzedniego zaklęcia.');
  const item = player.items.find((candidate) => String(candidate.id) === String(body.itemId));
  if (!item) throw new ApiError(404, 'item_not_found', 'Nie masz takiego przedmiotu.');
  requireUnworn(player, item, context.now);
  const times = item.reforged ?? 0;
  const materials = JSON.parse(row.materials ?? '{}');
  const block = reforgeBlock(item, body.affix, { gold: row.gold, materials, times }, content);
  if (block) throw new ApiError(block.code.startsWith('invalid') || block.code === 'no_affixes' ? 400 : 409, block.code, block.message);
  const cost = reforgeCost(item, times, content);
  const roll = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const options = reforgeOptions(item, body.affix, choicesOf(stored), createRng(roll), content);
  // One affix goes on the item at once; more wait for the choice.
  const affixes = options.length === 1 ? withAffix(item, body.affix, options[0]).affixes : item.affixes;
  const { pending: _, ...rest } = stored;
  const next = {
    ...rest,
    relations: grow(stored.relations, content.settlement.reforge),
    ...(options.length > 1 && { pending: { itemId: item.id, affix: body.affix, options, roll, reforged: times + 1 } }),
  };
  const pay = takenOff('materials', cost.materials ? piecesOfRarity(materials, cost.materials, content) : {});
  const db = context.env.DB;
  // As at the Kowadło: the item changes only if it and the character are as
  // seen here, and the payment only if this roll was saved.
  await db.batch([
    db
      .prepare(
        `UPDATE items SET data = json_set(data, '$.affixes', json(?), '$.reforged', ?, '$.lastRoll', ?)
         WHERE id = ? AND character_id = ? AND COALESCE(json_extract(data, '$.reforged'), 0) = ?
           AND (SELECT version FROM characters WHERE id = ?) = ?`,
      )
      .bind(JSON.stringify(affixes), times + 1, roll, item.id, row.id, times, row.id, row.version),
    db
      .prepare(
        `UPDATE characters SET gold = gold - ?, settlement = ?, materials = ${pay.sql}, version = version + 1
         WHERE id = ? AND version = ? AND gold >= ? AND ${pay.enough} AND EXISTS (SELECT 1 FROM items WHERE id = ? AND json_extract(data, '$.lastRoll') = ?)`,
      )
      .bind(cost.gold, JSON.stringify(next), ...pay.binds, row.id, row.version, cost.gold, ...pay.enoughBinds, item.id, roll),
  ]);
  const after = await loadPlayer(db, session.userId);
  const saved = after.items.find((candidate) => candidate.id === item.id);
  if (saved?.lastRoll !== roll) throw changed();
  const pending = pendingView(pendingOf(settlementOf(after.row), after.items));
  return json({
    item: saved,
    gold: cost.gold,
    pending,
    // What the affix became, shown at once (the author: "zaklinaczka
    // przekuwa afiks a nie pokazuje na jaki").
    result: pending ? null : reforgeResult(item, saved, body.affix),
    character: characterView(after, context.now),
  });
}

// An affix before and after a reforging, as the item card shows them.
const reforgeResult = (before, after, affix) => ({ itemId: after.id, name: itemName(after, content), old: affixLabel(before, affix), new: affixLabel(after, affix) });

// { option }: the affix the player keeps of those a reforging drew.
export async function chooseReforged(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const stored = settlementOf(row);
  const pending = pendingOf(stored, player.items);
  if (!pending) throw new ApiError(404, 'no_choice', 'Nie ma afiksów do wyboru.');
  requireUnworn(player, pending.item, context.now);
  const option = pending.options[body.option];
  if (!Number.isInteger(body.option) || !option) throw new ApiError(400, 'invalid_option', 'Wybierz jeden z afiksów.');
  const { affixes } = withAffix(pending.item, pending.affix, option);
  const db = context.env.DB;
  // Both only while this choice still waits, so it is made once.
  await db.batch([
    db
      .prepare(
        `UPDATE items SET data = json_set(data, '$.affixes', json(?))
         WHERE id = ? AND character_id = ? AND COALESCE(json_extract(data, '$.reforged'), 0) = ?
           AND json_extract((SELECT settlement FROM characters WHERE id = ?), '$.pending.roll') = ?`,
      )
      .bind(JSON.stringify(affixes), pending.item.id, row.id, pending.reforged, row.id, pending.roll),
    db
      .prepare(`UPDATE characters SET settlement = json_remove(settlement, '$.pending'), version = version + 1 WHERE id = ? AND json_extract(settlement, '$.pending.roll') = ?`)
      .bind(row.id, pending.roll),
  ]);
  const after = await loadPlayer(db, session.userId);
  if (settlementOf(after.row).pending?.roll === pending.roll) throw changed();
  const saved = after.items.find((candidate) => candidate.id === pending.item.id);
  if (JSON.stringify(saved?.affixes) !== JSON.stringify(affixes)) throw changed();
  return json({ item: saved, result: reforgeResult(pending.item, saved, pending.affix), character: characterView(after, context.now) });
}

// { service: "path" | "stats" | "evolution", evolutionId }: the Pustelnik's
// services for gold. "path" gives back the Skill Points of the class's
// skills, so the paths can be chosen anew (question 122 A), not after an
// evolution, whose paths change with it; "stats" gives back the stat points
// above the free reset's level (question 124 A); "evolution" changes the
// evolution for another of the class (question 123 A), with its skills from
// the start and the free reset of the stat points as after the first one.
// At home only, like the stat points and the skills.
export async function hermitService(context) {
  const { session, player } = await requireBuildPlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const character = engineCharacter(row);
  if (body.service === 'evolution') return changeEvolution(context, session, player, body);
  let gold;
  let set;
  let value;
  if (body.service === 'path') {
    if (character.evolution) throw new ApiError(409, 'evolved', 'Po ewolucji ścieżki zmieniają się razem z nią.');
    const skills = Object.fromEntries(Object.entries(character.skills).filter(([id]) => content.skillsById[id]?.evolution));
    if (Object.keys(skills).length === Object.keys(character.skills).length) throw new ApiError(409, 'nothing_to_reset', 'Nie masz jeszcze żadnej ścieżki do wyzerowania.');
    gold = pathResetCost(row.level, content);
    set = 'skills';
    value = skills;
  } else if (body.service === 'stats') {
    gold = statResetCost(row.level, content);
    if (gold === null) throw new ApiError(409, 'free_reset', 'Do tego poziomu punkty wyzerujesz za darmo w Statystykach.');
    if (Object.keys(character.points).length === 0) throw new ApiError(409, 'nothing_to_reset', 'Nie masz rozdanych punktów do wyzerowania.');
    set = 'points';
    value = {};
  } else {
    throw new ApiError(400, 'invalid_service', 'Pustelnik tego nie robi.');
  }
  if (row.gold < gold) throw new ApiError(409, 'not_enough_gold', 'Brakuje złota.');
  const stored = settlementOf(row);
  const relations = grow(stored.relations, content.settlement.hermit);
  const db = context.env.DB;
  const result = await db
    .prepare(`UPDATE characters SET gold = gold - ?, ${set} = ?, settlement = ?, version = version + 1 WHERE id = ? AND version = ? AND gold >= ?`)
    .bind(gold, JSON.stringify(value), JSON.stringify({ ...stored, relations }), row.id, row.version, gold)
    .run();
  if (result.meta.changes !== 1) throw changed();
  return json({ gold, character: characterView(await loadPlayer(db, session.userId), context.now) });
}

// The Pustelnik's change of evolution (hermitService).
async function changeEvolution(context, session, player, body) {
  const { row } = player;
  const stored = settlementOf(row);
  const offer = evolutionChangeView(row, stored);
  if (!offer) throw new ApiError(409, 'not_evolved', 'Najpierw wybierz ewolucję w zakładce Ewolucja.');
  if (!offer.choices.some((choice) => choice.id === body.evolutionId)) throw new ApiError(400, 'unknown_evolution', 'Ta ewolucja nie jest dla tej postaci.');
  if (row.gold < offer.price) throw new ApiError(409, 'not_enough_gold', 'Brakuje złota.');
  const next = { ...stored, evolutionChanges: (stored.evolutionChanges ?? 0) + 1, relations: grow(stored.relations, content.settlement.hermit) };
  const db = context.env.DB;
  const result = await db
    .prepare(
      `UPDATE characters SET gold = gold - ?, evolution = ?, skills = ?, evolution_reset = ?, settlement = ?, version = version + 1
       WHERE id = ? AND version = ? AND gold >= ? AND evolution IS NOT NULL`,
    )
    .bind(offer.price, body.evolutionId, JSON.stringify(evolvedSkills(body.evolutionId, content)), spentPoints(engineCharacter(row)) > 0 ? 1 : 0, JSON.stringify(next), row.id, row.version, offer.price)
    .run();
  if (result.meta.changes !== 1) throw changed();
  return json({ gold: offer.price, character: characterView(await loadPlayer(db, session.userId), context.now) });
}

// "Testuj Osadę" on the test version, for the accounts with test mode
// (test-mode.js), where the deployment has the Osada.
async function requireTester(context) {
  const { session, player } = await requirePlayer(context);
  if (!settlementOn() || !content.settlement || !settlementTestsFor(context.env, session.user.login)) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  return { session, player };
}

// The standings to put everyone at.
export async function settlementTests(context) {
  await requireTester(context);
  return json({ standings: content.settlement.standings.map(({ id, name }) => ({ id, name })) });
}

// { action }: "open" opens the Osada below its level, "standing" (with
// `standing`) puts every brotherhood's reputation and every resident's
// relation at that standing's points, "orders" brings new orders to every
// slot of the board and this week's big one back, and "market" and
// "marketEnd" try the Targowisko (market.js).
export async function testSettlement(context) {
  const { session, player } = await requireTester(context);
  const { row } = player;
  const body = await readJson(context.request);
  const stored = settlementOf(row);
  let next;
  if (body.action === 'open') {
    next = { ...stored, test: true };
  } else if (body.action === 'standing') {
    const standing = content.settlement.standings.find((one) => one.id === body.standing);
    if (!standing) throw new ApiError(400, 'invalid_standing', 'Nie ma takiego stopnia.');
    const everyone = (list) => Object.fromEntries(list.map(({ id }) => [id, standing.points]));
    next = { ...stored, reputation: everyone(content.settlement.brotherhoods), relations: everyone(content.settlement.residents) };
  } else if (body.action === 'orders') {
    next = { ...stored, board: stored.board && { ...stored.board, slots: stored.board.slots.map(() => ({ readyAt: context.now })), weekly: null } };
  } else if (body.action === 'market' || body.action === 'marketEnd') {
    next = await testMarket(context.env.DB, player, stored, body.action, context.now);
  } else {
    throw new ApiError(400, 'invalid_action', 'Nie ma takiego testu.');
  }
  const db = context.env.DB;
  const result = await db
    .prepare('UPDATE characters SET settlement = ?, version = version + 1 WHERE id = ? AND version = ?')
    .bind(JSON.stringify(next), row.id, row.version)
    .run();
  if (result.meta.changes !== 1) throw changed();
  return json({ character: characterView(await loadPlayer(db, session.userId), context.now) });
}

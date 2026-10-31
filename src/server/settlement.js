// The Osada, part I (settlement.js in the engine): the view of the board
// and the residents, delivering and rejecting an order, and reforging an
// affix at the Zaklinaczka's. It opens at the settlement unlock's level
// (unlocks.json) where the deployment has it on (SETTLEMENT, features.js).
// Each change saves only if the character is as read (its version), so two
// taps make one. On the test version "Testuj Osadę" opens it below its
// level, puts everyone at one standing and brings new orders at once.

import {
  BAG_GOODS,
  COMPANION_SLOTS,
  addQuestProgress,
  bagCapacity,
  campBonus,
  campLevels,
  craftedFor,
  createRng,
  deliverBlock,
  companionCombatant,
  companionGift,
  companionPlaces,
  companionSkillLevel,
  companionWearBlock,
  deliverOrder,
  drawCandidates,
  drawRumor,
  evolutionChangePrice,
  evolutionChanges,
  evolvedSkills,
  herbalistPremium,
  hireCost,
  imbueBlock,
  imbueCost,
  imbueEffect,
  itemName,
  itemView,
  materialView,
  mugCost,
  orderGold,
  parseStack,
  pathResetCost,
  potionPrice,
  propertyName,
  questPeriod,
  regenPerMinute,
  reforgeBlock,
  reforgeChoices,
  reforgeCost,
  reforgeOptions,
  rejectOrder,
  rumorText,
  rumorToday,
  spentPoints,
  standingOf,
  statResetCost,
  tradePoints,
  upgradedItem,
  wearOnCompanion,
  withAffix,
  xpToNext,
} from '../engine/index.js';
import { content } from './content.js';
import {
  bagPlaces,
  characterView,
  currentHp,
  engineCharacter,
  loadPlayer,
  questsNow,
  requireIdle,
  requireIdlePlayer,
  requirePlayer,
  settlementBoard,
  settlementGoods,
} from './characters.js';
import { toHex } from './encoding.js';
import { evolutionsOn, settlementOn } from './features.js';
import { ApiError, json, readJson } from './http.js';
import { settlementTestsFor } from './test-mode.js';

// A JSON path for a key with a hyphen or a colon ("iron-ore", "wolf-pelt:rare").
const jsonPath = (key) => `$."${key}"`;

const changed = () => new ApiError(409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.');

// The column a kind of goods is kept in; the Warsztat's items are rows.
const COLUMNS = { herb: 'herbs', potion: 'potions', material: 'materials', resource: 'resources', part: 'parts', craft: 'crafted' };

// The relations after a service: its resident's grows by its relationGain.
const grow = (relations, { resident, relationGain }) => ({ ...relations, [resident]: (relations[resident] ?? 0) + relationGain });

// The service each resident gives on the page, as the data names them: the
// board's orders, the reforging, the resets, the Karczma or the Chata
// zielarki; none for the others.
const serviceOf = (residentId) =>
  ['orders', 'reforge', 'hermit', 'tavern', 'herbalist'].find((service) => content.settlement[service].resident === residentId) ?? null;

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
    ...(stored.test && { test: true }),
  };
}

// The change of evolution at the Pustelnik's, where the evolutions are on
// and the character has one: its price and the evolutions it can go to.
function evolutionChangeView(row, stored) {
  const character = engineCharacter(row);
  if (!evolutionsOn() || !character.evolution) return null;
  return {
    price: evolutionChangePrice(stored.evolutionChanges ?? 0, content),
    current: content.evolutionsById[character.evolution].name,
    choices: evolutionChanges(character, content).map(({ id, name }) => ({ id, name })),
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

function requireOpen(row) {
  const unlock = content.unlocksById.settlement;
  if (!settlementOn() || !content.settlement) throw new ApiError(404, 'not_found', 'Osady jeszcze nie ma.');
  if (row.level < unlock.level && !settlementOf(row).test) throw new ApiError(403, 'locked', `Osadę odblokujesz na poziomie postaci ${unlock.level}.`);
}

// A good's name on the board.
function goodLabel({ kind, key }) {
  if (kind === 'herb') return content.herbsById[key].name;
  if (kind === 'potion') return content.potionsById[key].name;
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

const orderView = (order, stocks, sellBonus) => ({
  ...order,
  gold: orderGold(order, sellBonus, content),
  label: goodLabel(order),
  brotherhoodName: content.settlement.brotherhoods.find((one) => one.id === order.brotherhood).name,
  have: stocks[COLUMNS[order.kind]]?.[order.key] ?? 0,
  // Delivered only at home (BAG_GOODS).
  home: BAG_GOODS.has(order.kind),
});

// The Osada for the page: the board's places, the residents with the
// greeting of their relation's standing, the brotherhoods' standings and
// the orders on the board, each with what the character holds of it.
export function settlementView(player, stored, board, now) {
  const stocks = settlementGoods(player.row, player.items);
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
    },
    reforge: {
      items: player.items.filter((item) => item.affixes?.length > 0).map((item) => reforgeView(item, stocks.materials)),
      choices: choicesOf(stored),
      pending: pendingView(pendingOf(stored, player.items)),
    },
    tavern: tavernView(player.row, stored, now),
    companions: companionsView(player, stored, now),
    herbalist: herbalistView(player, stored, now),
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
      return { element, name: content.elementsById[element].name, material: content.materialsById[material].name, count, have: materials[stack] ?? 0 };
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
// body armour, worn or in the bag, at home as every change of the gear;
// one already there gives way. Gold and the element's material pay.
export async function imbueAtEnchantress(context) {
  const { session, player } = await requireIdlePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const item = player.items.find((candidate) => String(candidate.id) === String(body.itemId));
  if (!item) throw new ApiError(404, 'item_not_found', 'Nie masz takiego przedmiotu.');
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
// trade's reputation today out of the day's limit (120 A).
function herbalistView(player, stored, now) {
  const { premium, scrap, price } = herbalistPrices(player, stored, now);
  const held = { herb: JSON.parse(player.row.herbs ?? '{}'), potion: JSON.parse(player.row.potions ?? '{}') };
  const goods = (kind, list) =>
    list.filter((good) => (held[kind][good.id] ?? 0) > 0).map((good) => ({ kind, id: good.id, name: good.name, count: held[kind][good.id], price: price(kind, good.id), scrap: scrap(kind, good.id) }));
  const day = questPeriod('daily', now, content).key;
  return {
    premium,
    goods: [...goods('herb', content.herbs), ...goods('potion', content.potions)],
    trade: { today: stored.trade?.day === day ? stored.trade.points : 0, daily: content.settlement.herbalist.reputation.daily },
  };
}

// { kind: herb or potion, id, count }: Jagna buys herbs or potions from the
// bag, at home, as the scrapper does; the trade raises the relation with
// her and the reputation with the herbalists, up to the day's limit.
export async function sellToHerbalist(context) {
  const { session, player } = await requireIdlePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const column = { herb: 'herbs', potion: 'potions' }[body.kind];
  const known = { herb: content.herbsById, potion: content.potionsById }[body.kind]?.[body.id];
  if (!column || !known) throw new ApiError(400, 'invalid_goods', 'Zielarka kupuje tylko zioła i mikstury.');
  const held = JSON.parse(row[column] ?? '{}')[body.id] ?? 0;
  if (!Number.isInteger(body.count) || body.count < 1 || body.count > held) throw new ApiError(409, 'not_enough', 'Nie masz tylu w torbie.');
  const stored = settlementOf(row);
  const gold = Math.max(1, Math.round(herbalistPrices(player, stored, context.now).price(body.kind, body.id) * body.count));
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

// The Karczma: the mug's price and today's rumor once told.
function tavernView(row, stored, now) {
  const rumor = rumorToday(stored.rumor, now, content);
  return {
    mug: mugCost(row.level, content),
    // The innkeeper's words only: the place and what it means are the
    // player's to work out.
    rumor: rumor && { text: rumorText(rumor, content) },
  };
}

// A companion or a candidate as the Karczma shows it (companions.js): its
// class and level, its numbers in a fight, its traits in its own form, its
// skills at its level, the gear it wears, its profession and story, and
// how long it is still wounded.
function companionView(companion) {
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
      return { slot, slotName: content.slotsById[slot].name, item: worn ? { ...itemView(worn, content), given: Boolean(worn.given) } : null };
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

// The Karczma's werbunek (questions 104–106): the places the relation with
// the innkeeper gives, the standing that opens the next one, the companions
// hired with this week's gift and this week's candidates not hired yet,
// each with its price.
function companionsView(player, stored, now) {
  const { row } = player;
  const { standings } = content.settlement;
  const bag = player.items.filter((item) => !item.equippedSlot);
  const rested = (stored.companions ?? []).some((companion) => companion.wounded) ? restedAt(player, now) : now;
  const places = companionPlaces(stored.relations[content.settlement.tavern.resident] ?? 0, content);
  const hired = stored.companions ?? [];
  const nextId = content.settlement.companions.from[places];
  const candidates = drawCandidates({ character: engineCharacter(row), seed: `${row.id}:settlement` }, now, content, [
    ...hired.map((companion) => companion.id),
    ...(stored.dismissed ?? []),
  ]);
  return {
    places,
    next: nextId ? standings.find((standing) => standing.id === nextId).name : null,
    // Each with this week's gift and the items in the bag it can wear.
    hired: hired.map((companion) => ({
      ...companionView(companion),
      // Wounded until the character rests to full HP, and when that is.
      ...(companion.wounded && rested !== now && { wounded: true, healsAt: rested }),
      gift: giftOf(companion, row, now),
      wearable: bag.filter((item) => !companionWearBlock(companion, item, content)).map((item) => item.id),
    })),
    candidates: candidates.map((candidate) => ({ ...companionView(candidate), price: hireCost(candidate, content) })),
  };
}

// An item the Zaklinaczka can reforge: its affixes as the item card shows
// them (with the Kowadło's upgrade) and the price, with the character's
// stacks of the materials it takes.
function reforgeView(item, materials) {
  const shown = upgradedItem(item, content);
  const cost = reforgeCost(item, item.reforged ?? 0, content);
  const need = cost.materials;
  return {
    id: item.id,
    name: itemName(item, content),
    rarity: item.rarity,
    equipped: Boolean(item.equippedSlot),
    affixes: shown.affixes.map((affix) => `${propertyName(affix.stat, content)}: +${affix.value}`),
    gold: cost.gold,
    materials: need && {
      ...need,
      rarityName: content.raritiesById[need.rarity].name,
      stacks: Object.entries(materials)
        .filter(([key, count]) => parseStack(key).rarityId === need.rarity && count >= need.count)
        .map(([key, count]) => ({ key, label: materialView(key, count, content).label, count })),
    },
  };
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
  const block = deliverBlock(board, body.orderId, settlementGoods(row, player.items));
  if (block) throw new ApiError(block.code === 'no_order' ? 404 : 409, block.code, block.message);
  const done = deliverOrder(board, body.orderId, context.now, content, sellBonusOf(player, context.now));
  // The potions taken along leave the bag only when the report is claimed,
  // so herbs and potions wait for the character at home, as at the Skup.
  if (BAG_GOODS.has(done.take.kind)) requireIdle(player, context.now);
  const add = (counts, more) => ({ ...counts, ...Object.fromEntries(Object.entries(more).map(([id, gain]) => [id, (counts[id] ?? 0) + gain])) });
  const next = { ...stored, reputation: add(stored.reputation, done.reputation), relations: add(stored.relations, done.relation), board: done.board };
  // The narrator's quests "Wykonaj N zleceń w Osadzie" (question 95).
  const quests = JSON.stringify(addQuestProgress(questsNow(player, context.now), { orders: 1 }));
  const db = context.env.DB;
  if (done.take.kind === 'craft') {
    await deliverCrafted(db, player, done, { settlement: JSON.stringify(next), quests });
    const after = await loadPlayer(db, session.userId);
    if (after.row.settlement !== JSON.stringify(next)) throw changed();
    return json({
      delivered: { gold: done.gold, systemPoints: done.systemPoints, reputation: done.reputation },
      settlement: settlementView(after, next, done.board, context.now),
      character: characterView(after, context.now),
    });
  }
  const column = COLUMNS[done.take.kind];
  const key = jsonPath(done.take.key);
  const result = await db
    .prepare(
      `UPDATE characters SET gold = gold + ?, system_points = system_points + ?, settlement = ?, quests = ?,
         ${column} = CASE WHEN json_extract(${column}, ?) > ? THEN json_set(${column}, ?, json_extract(${column}, ?) - ?) ELSE json_remove(${column}, ?) END,
         version = version + 1
       WHERE id = ? AND version = ? AND COALESCE(json_extract(${column}, ?), 0) >= ?`,
    )
    .bind(done.gold, done.systemPoints, JSON.stringify(next), quests, key, done.take.count, key, key, done.take.count, key, row.id, row.version, key, done.take.count)
    .run();
  if (result.meta.changes !== 1) throw changed();
  const after = await loadPlayer(db, session.userId);
  return json({
    delivered: { gold: done.gold, systemPoints: done.systemPoints, reputation: done.reputation },
    settlement: settlementView(after, next, done.board, context.now),
    character: characterView(after, context.now),
  });
}

// Delivering the Warsztat's items: they leave the bag, the weakest first,
// and the order pays, all of it or nothing. The payment goes only if the
// character is as read and every item is still in the bag; the items go
// only if that payment was saved (its new Osada is unique to it).
async function deliverCrafted(db, player, done, { settlement, quests }) {
  const { row } = player;
  const ids = craftedFor(player.items, done.take.key, done.take.count, content).map((item) => item.id);
  if (ids.length < done.take.count) throw new ApiError(409, 'not_enough', 'Brakuje Ci jeszcze tego, o co proszą.');
  const list = ids.map(() => '?').join(', ');
  await db.batch([
    db
      .prepare(
        `UPDATE characters SET gold = gold + ?, system_points = system_points + ?, settlement = ?, quests = ?, version = version + 1
         WHERE id = ? AND version = ? AND (SELECT COUNT(*) FROM items WHERE character_id = ? AND slot IS NULL AND id IN (${list})) = ?`,
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
  if (rumorToday(stored.rumor, context.now, content)) throw new ApiError(409, 'told', 'Zbylut nie słyszał dziś nic nowego. Zajrzyj jutro.');
  const rumor = drawRumor({ character: engineCharacter(row), seed: `${row.id}:settlement` }, context.now, content);
  if (!rumor) throw new ApiError(409, 'no_rumor', 'Zbylut nie słyszał o niczym groźnym w miejscach, do których chodzisz.');
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
// relation with the innkeeper gives a free place (question 105 A). The
// companion goes on the next exploration.
export async function hireCompanion(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const stored = settlementOf(row);
  const hired = stored.companions ?? [];
  if (hired.length >= companionPlaces(stored.relations[content.settlement.tavern.resident] ?? 0, content)) {
    throw new ApiError(409, 'no_place', 'Zbylut nie zna cię jeszcze na tyle, żeby polecić więcej ludzi.');
  }
  const taken = [...hired.map((companion) => companion.id), ...(stored.dismissed ?? [])];
  const candidate = drawCandidates({ character: engineCharacter(row), seed: `${row.id}:settlement` }, context.now, content, taken).find((one) => one.id === body.candidateId);
  if (!candidate) throw new ApiError(404, 'no_candidate', 'Tego kandydata już nie ma w Karczmie.');
  const gold = hireCost(candidate, content);
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
// they need free places there, and takes its own gear along. Not while it
// is out on an exploration.
export async function dismissCompanion(context) {
  const { session, player } = await requireIdlePlayer(context);
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
// At home, as every change of the bag.
export async function equipCompanion(context) {
  const { session, player } = await requireIdlePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const stored = settlementOf(row);
  const hired = stored.companions ?? [];
  const companion = hired.find((one) => one.id === body.companionId);
  if (!companion) throw new ApiError(404, 'no_companion', 'Nie masz takiego towarzysza.');
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

// { companionId }: the companion's gift of the week from its profession
// (question 112 A) goes to the character's goods. At home, as herbs and
// potions wait in the bag while the character is away.
export async function takeCompanionGift(context) {
  const { session, player } = await requireIdlePlayer(context);
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

// { itemId, affix, material }: the Zaklinaczka draws one affix of an item
// anew, for gold and creatures' materials (`material`: the stack paid with).
// From a closer relation she draws two or three and the player keeps one
// (chooseReforged); until then they wait in the Osada and no other affix
// can be reforged. The character must be at home, as at the Kowadło.
export async function reforgeAtEnchantress(context) {
  const { session, player } = await requireIdlePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const stored = settlementOf(row);
  if (pendingOf(stored, player.items)) throw new ApiError(409, 'choose_first', 'Najpierw wybierz afiks z poprzedniego zaklęcia.');
  const item = player.items.find((candidate) => String(candidate.id) === String(body.itemId));
  if (!item) throw new ApiError(404, 'item_not_found', 'Nie masz takiego przedmiotu.');
  const times = item.reforged ?? 0;
  const materials = JSON.parse(row.materials ?? '{}');
  const block = reforgeBlock(item, body.affix, { gold: row.gold, materials, stack: body.material, times }, content);
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
  const stack = jsonPath(cost.materials ? body.material : 'none');
  const taken = cost.materials ? cost.materials.count : 0;
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
        `UPDATE characters SET gold = gold - ?, settlement = ?,
           materials = CASE WHEN ? = 0 THEN materials WHEN json_extract(materials, ?) > ? THEN json_set(materials, ?, json_extract(materials, ?) - ?) ELSE json_remove(materials, ?) END,
           version = version + 1
         WHERE id = ? AND version = ? AND gold >= ? AND EXISTS (SELECT 1 FROM items WHERE id = ? AND json_extract(data, '$.lastRoll') = ?)`,
      )
      .bind(cost.gold, JSON.stringify(next), taken, stack, taken, stack, stack, taken, stack, row.id, row.version, cost.gold, item.id, roll),
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
  const { session, player } = await requireIdlePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const stored = settlementOf(row);
  const pending = pendingOf(stored, player.items);
  if (!pending) throw new ApiError(404, 'no_choice', 'Nie ma afiksów do wyboru.');
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
  const { session, player } = await requireIdlePlayer(context);
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
// relation at that standing's points, and "orders" brings new orders to
// every slot of the board and this week's big one back.
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

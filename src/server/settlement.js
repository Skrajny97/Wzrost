// The Osada, part I (settlement.js in the engine): the view of the board
// and the residents, delivering and rejecting an order, and reforging an
// affix at the Zaklinaczka's. It opens at the settlement unlock's level
// (unlocks.json) where the deployment has it on (SETTLEMENT, features.js).
// Each change saves only if the character is as read (its version), so two
// taps make one. On the test version "Testuj Osadę" opens it below its
// level, puts everyone at one standing and brings new orders at once.

import {
  BAG_GOODS,
  addQuestProgress,
  craftedFor,
  createRng,
  deliverBlock,
  companionCombatant,
  companionPlaces,
  companionSkillLevel,
  deliverOrder,
  drawCandidates,
  drawRumor,
  evolutionChangePrice,
  evolutionChanges,
  evolvedSkills,
  hireCost,
  itemName,
  materialView,
  mugCost,
  parseStack,
  pathResetCost,
  propertyName,
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
  upgradedItem,
  withAffix,
  xpToNext,
} from '../engine/index.js';
import { content } from './content.js';
import {
  characterView,
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
// board's orders, the reforging or the resets; none for the others.
const serviceOf = (residentId) => ['orders', 'reforge', 'hermit', 'tavern'].find((service) => content.settlement[service].resident === residentId) ?? null;

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

const orderView = (order, stocks) => ({
  ...order,
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
      slots: board.slots.map((slot) => (slot.order ? { order: orderView(slot.order, stocks) } : { readyAt: slot.readyAt })),
      weekly: board.weekly?.order && !board.weekly.done ? orderView({ ...board.weekly.order, id: 'weekly' }, stocks) : null,
      weeklyDone: board.weekly?.done ?? false,
    },
    reforge: {
      items: player.items.filter((item) => item.affixes?.length > 0).map((item) => reforgeView(item, stocks.materials)),
      choices: choicesOf(stored),
      pending: pendingView(pendingOf(stored, player.items)),
    },
    tavern: tavernView(player.row, stored, now),
    companions: companionsView(player.row, stored, now),
    // After an evolution the paths change with it, so no path reset.
    hermit: {
      path: player.row.evolution ? null : pathResetCost(player.row.level, content),
      stats: statResetCost(player.row.level, content),
      evolution: evolutionChangeView(player.row, stored),
    },
    now,
  };
}

// The Karczma: the mug's price and today's rumor once told (its words, the
// place and whether an exploration there has used it).
function tavernView(row, stored, now) {
  const rumor = rumorToday(stored.rumor, now, content);
  return {
    mug: mugCost(row.level, content),
    factor: content.settlement.tavern.rumor.factor,
    rumor: rumor && {
      text: rumorText(rumor, content),
      areaId: rumor.areaId,
      area: content.areasById[rumor.areaId].name,
      monster: content.monstersById[rumor.monsterId].name,
      used: rumor.used,
    },
  };
}

// A companion or a candidate as the Karczma shows it (companions.js): its
// class and level, its numbers in a fight, its traits in its own form, its
// skills at its level, the gear it wears, its profession and story, and
// how long it is still wounded.
function companionView(companion, now) {
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
    profession: professions.find((one) => one.id === companion.profession)?.name ?? null,
    story: stories[companion.story % stories.length],
    woundedUntil: companion.woundedUntil > now ? companion.woundedUntil : null,
  };
}

// The Karczma's werbunek (questions 104–106): the places the relation with
// the innkeeper gives, the standing that opens the next one, the companions
// hired and this week's candidates not hired yet, each with its price.
function companionsView(row, stored, now) {
  const { standings } = content.settlement;
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
    hired: hired.map((companion) => companionView(companion, now)),
    candidates: candidates.map((candidate) => ({ ...companionView(candidate, now), price: hireCost(candidate, content) })),
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
  const done = deliverOrder(board, body.orderId, context.now, content);
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
// a candidate this week. Not while it is out on an exploration.
export async function dismissCompanion(context) {
  const { session, player } = await requireIdlePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const stored = settlementOf(row);
  const hired = stored.companions ?? [];
  if (!hired.some((companion) => companion.id === body.companionId)) throw new ApiError(404, 'no_companion', 'Nie masz takiego towarzysza.');
  const next = { ...stored, companions: hired.filter((companion) => companion.id !== body.companionId), dismissed: [...(stored.dismissed ?? []), body.companionId] };
  const result = await context.env.DB.prepare('UPDATE characters SET settlement = ?, version = version + 1 WHERE id = ? AND version = ?')
    .bind(JSON.stringify(next), row.id, row.version)
    .run();
  if (result.meta.changes !== 1) throw changed();
  const after = await loadPlayer(context.env.DB, session.userId);
  return json({ settlement: settlementView(after, next, settlementBoard(after.row, next, context.now), context.now), character: characterView(after, context.now) });
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

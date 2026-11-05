// Materials and the Stół rozbiórki (data/materials.json). A creature
// beaten in a fight may leave its own material, at the rarity of its
// species or, sometimes, a rarity or more higher. The table
// turns each material into one part of the same rarity and takes items apart
// into several parts of theirs, for free, one order after another, each
// taking its time. Its first levels open the higher rarities, and the last
// ones may add extra parts to an order. Parts wait for the professions.
//
// Stored state: materials { "wolf-pelt:rare": 2 }, parts { scraps: 5 } and
// the queue, a list of orders with their start and end. An order is done once
// its end has passed, and its parts count from then on. Until then it can
// leave the queue with all it took given back (takeOffQueue). The server
// passes the time and the random seed.

import { campBonus } from './camp.js';
import { countEvents } from './rng.js';

// A material at one rarity, as the store keeps it: "wolf-pelt:rare".
export const stackKey = (materialId, rarityId) => `${materialId}:${rarityId}`;

export function parseStack(key) {
  const at = key.lastIndexOf(':');
  return { materialId: key.slice(0, at), rarityId: key.slice(at + 1) };
}

// A material key the data knows: an existing material at an existing rarity.
export function knownStack(key, content) {
  if (typeof key !== 'string' || !key.includes(':')) return false;
  const { materialId, rarityId } = parseStack(key);
  return Object.hasOwn(content.materialsById, materialId) && Object.hasOwn(content.raritiesById, rarityId);
}

// Whether a material is an ordinary creature's, not an elite's or a
// champion's trophy (the Garbarnia trades in these; settlement orders ask
// for them too).
export function ordinaryMaterial(materialId, content) {
  const monster = content.monstersById[content.materialsById[materialId]?.monster];
  return Boolean(monster && !monster.elite && !monster.champion);
}

// What the scrapper pays for one piece of a material, before the camp's Skup
// złomu: sellGold times the sell factor of its rarity (proposal 1: "cena
// rośnie z rzadkością").
export const materialPrice = (rarityId, content) => content.balance.crafting.sellGold * content.raritiesById[rarityId].sell;

// How many grades a stack stands above its species' own rarity.
export function gradeSteps(key, content) {
  const { materialId, rarityId } = parseStack(key);
  const index = (id) => content.rarities.findIndex((rarity) => rarity.id === id);
  return Math.max(0, index(rarityId) - index(content.materialsById[materialId].rarity));
}

// Adds counts from `more` to `counts`, without zeros.
export function addCounts(counts, more) {
  const sum = { ...counts };
  for (const [key, count] of Object.entries(more)) {
    const total = (sum[key] ?? 0) + count;
    if (total > 0) sum[key] = total;
    else delete sum[key];
  }
  return sum;
}

// A character's stacks of the materials of one rarity, in the order a need
// of that rarity takes them (piecesOfRarity): the material it holds the
// most pieces of first, on a tie the one first by its id.
export function stacksOfRarity(materials, rarityId, content) {
  const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return Object.entries(materials ?? {})
    .filter(([key, count]) => count > 0 && knownStack(key, content) && parseStack(key).rarityId === rarityId)
    .sort(([a, x], [b, y]) => y - x || byId(parseStack(a).materialId, parseStack(b).materialId));
}

// How many pieces of materials of one rarity the character holds in all.
export const heldOfRarity = (materials, rarityId, content) => stacksOfRarity(materials, rarityId, content).reduce((sum, [, count]) => sum + count, 0);

// The pieces a need of `count` materials of one rarity takes, by stack
// key: the Kowadło's from +5 on (upgradeMaterials in items.js), the
// Kuźnia's and the Zaklinaczka's zaklęcie afiksu. Any materials of that
// rarity add up (the author: 481 B), and the pieces go first from the
// material the character holds the most of (stacksOfRarity), so its single
// rarer pieces stay. Null when all of them together are fewer.
export function piecesOfRarity(materials, { rarity, count }, content) {
  const taken = {};
  let left = count;
  for (const [key, held] of stacksOfRarity(materials, rarity, content)) {
    if (left <= 0) break;
    taken[key] = Math.min(held, left);
    left -= taken[key];
  }
  return left > 0 ? null : taken;
}

// Such a need as the pages show it: the pieces of that rarity held in all
// (`have`) and those it would take (`takes`: each stack's key, material,
// name and pieces, as piecesOfRarity picks them), or null while too few.
export function rarityNeedView(materials, need, content) {
  const pieces = piecesOfRarity(materials, need, content);
  return {
    ...need,
    have: heldOfRarity(materials, need.rarity, content),
    takes:
      pieces &&
      Object.entries(pieces).map(([key, count]) => {
        const { materialId, label } = materialView(key, count, content);
        return { key, materialId, label, count };
      }),
  };
}

// The chances that a creature of `level` leaves its material one, two or
// more rarities above its species' (the author: the second grade sometimes,
// the third much more rarely at low levels, and higher grades later). The
// first grows with the level between its floor and its cap, each further
// one is `materialRarityStepRatio` of the one before, and one more grade
// opens every `materialRarityStepEvery` levels.
export function rarityUpChances(level, content) {
  const { materialRarityUpPerLevel, materialRarityUpMin, materialRarityUpMax, materialRarityStepRatio, materialRaritySteps, materialRarityStepEvery } =
    content.balance.rewards;
  const first = Math.min(materialRarityUpMax, Math.max(materialRarityUpMin, Math.max(0, level) * materialRarityUpPerLevel));
  const steps = materialRaritySteps + Math.floor(Math.max(0, level - 1) / materialRarityStepEvery);
  return Array.from({ length: steps }, (_, step) => first * materialRarityStepRatio ** step);
}

const rarityIndex = (rarityId, content) => content.rarities.findIndex((rarity) => rarity.id === rarityId);

// The rarity `steps` above `rarityId`, at most the last one.
function raisedRarity(rarityId, steps, content) {
  return content.rarities[Math.min(rarityIndex(rarityId, content) + steps, content.rarities.length - 1)].id;
}

// What a beaten creature of `level` leaves, as { stackKey: count }. `weight`
// is its part of the fight: the share of the exploration's time the fight
// stands for, the group factor and a demanding encounter. So the material
// comes at the same rate per hour whatever the length, and a fight that
// stands for many can leave more than one. A champion is a trophy: it
// leaves its own material almost always, one piece, whatever the length;
// `trophy` settles it instead of the chance, one piece for certain (true)
// or none (false), as in the Wieże (towers.js).
export function materialDrops(monsterId, level, weight, rng, content, trophy = null) {
  const material = content.materialsByMonster[monsterId];
  const found = {};
  if (!material) return found;
  const count = content.monstersById[monsterId]?.champion
    ? Number(trophy ?? rng.chance(content.balance.rewards.championMaterialChance))
    : countEvents(content.raritiesById[material.rarity].materialChance * weight, rng);
  const chances = rarityUpChances(level, content);
  for (let i = 0; i < count; i++) {
    // One draw for each piece: under the first chance it is a rarity
    // higher, under the second two, and so on.
    const roll = rng.next();
    const key = stackKey(material.id, raisedRarity(material.rarity, chances.filter((chance) => roll < chance).length, content));
    found[key] = (found[key] ?? 0) + 1;
  }
  return found;
}

// A stack as the report and the table show it. The name has the rarity only
// when it is above the species': "skóra wilka", "rzadka skóra wilka".
export function materialView(key, count, content) {
  const { materialId, rarityId } = parseStack(key);
  const material = content.materialsById[materialId];
  const rarity = content.raritiesById[rarityId];
  const raised = rarityId !== material.rarity;
  return {
    key,
    materialId,
    name: material.name,
    label: raised ? `${rarity.forms[material.gender]} ${material.name.toLowerCase()}` : material.name.toLowerCase(),
    rarity: rarity.id,
    rarityName: rarity.name,
    color: rarity.color,
    count,
    part: content.partsByRarity[rarity.id].name,
  };
}

// "skóra wilka, pióro kruka ×2" for a line of the report.
export function materialsText(found, content) {
  return Object.entries(found)
    .map(([key, count]) => {
      const { label } = materialView(key, count, content);
      return count > 1 ? `${label} ×${count}` : label;
    })
    .join(', ');
}

// Parts from taking an item apart: more for a higher item level and for each
// upgrade, of the item's rarity. An item made in the Warsztat (`crafted`)
// gives back half the parts it took, rounded down (the author: "Oddaje
// połowę zużytych części"), of the rarity ordered, also when luck made it
// rarer (the code review: a lucky item gave back rarer parts than it took),
// and one more for each upgrade of the Kowadło above those it came with.
// Items made before the ordered rarity was kept give their own.
export function salvageYield(item, content) {
  const { salvageBase, salvageLevelStep } = content.balance.crafting;
  const upgrade = item.upgrade ?? 0;
  const partId = content.partsByRarity[item.crafted && content.partsByRarity[item.crafted.rarity] ? item.crafted.rarity : item.rarity].id;
  const count = item.crafted
    ? Math.floor(item.crafted.parts / 2) + Math.max(0, upgrade - item.crafted.upgrade)
    : salvageBase + Math.floor(item.level / salvageLevelStep) + upgrade;
  const jewel = jewelSalvage(item, count, content);
  return jewel ? { partId, count: jewel.parts, minerals: jewel.minerals } : { partId, count };
}

// Jewellery, a base the Szlifiernia sets (a ring, an amulet, a talisman),
// gives more for Jubilerstwo than for Rzemieślnictwo (the author: „Niech
// wisiory amulety pierscienie itd. dają też z rozbiórki bardziej rzeczy do
// Jubilerstwa niż do Rzemieślnictwa”): `partsDivisor` times fewer parts, at
// least one, as many pieces of the ore of its rarity's setting as it would
// have given parts, and from the second rarity on a gem `gemRarityDown`
// rarities below its own (a gem of its own would let a jewel be made, taken
// apart and made again for nothing but time). The minerals come at once.
function jewelSalvage(item, count, content) {
  const tuning = content.jewelcrafting?.salvage;
  if (!tuning || !content.jewelcrafting.ores[item.slot]) return null;
  const minerals = {};
  const ore = content.minerals.find((mineral) => mineral.kind === 'ore' && mineral.for.includes(item.rarity));
  if (ore) minerals[ore.id] = count;
  const gemRarity = content.rarities[content.rarities.findIndex((rarity) => rarity.id === item.rarity) - tuning.gemRarityDown];
  const gem = gemRarity && content.minerals.find((mineral) => mineral.kind === 'gem' && mineral.rarity === gemRarity.id);
  if (gem) minerals[gem.id] = (minerals[gem.id] ?? 0) + 1;
  return { parts: Math.max(1, Math.floor(count / tuning.partsDivisor)), minerals };
}

// The Stół rozbiórki in the data: the building whose effect is craftSpeed.
export const tableBuilding = (content) => content.buildings.find((building) => building.effect.kind === 'craftSpeed');

// The table at the camp's levels: its level; its pace, 0 until it stands,
// then 1 plus its bonus; the highest rarity it takes, as an index into the
// rarities (effect.rarities names one for each level, the last one for every
// level from there on), and the chance of an extra part for each part an
// order makes (effect.bonusPerLevel for each level from bonusFromLevel).
export function craftTable(levels, content) {
  const building = tableBuilding(content);
  const level = building ? (levels[building.id] ?? 0) : 0;
  if (level === 0) return { level: 0, pace: 0, maxRarity: -1, bonusChance: 0 };
  const { rarities, bonusFromLevel, bonusPerLevel } = building.effect;
  return {
    level,
    pace: 1 + campBonus(levels, 'craftSpeed', content),
    maxRarity: rarityIndex(rarities[Math.min(level, rarities.length) - 1], content),
    bonusChance: Math.max(0, level - bonusFromLevel + 1) * bonusPerLevel,
  };
}

// How fast the table works at the camp's levels: 0 until it stands.
export const craftPace = (levels, content) => craftTable(levels, content).pace;

// The table's level that takes a rarity.
export function craftLevelFor(rarityId, content) {
  const index = rarityIndex(rarityId, content);
  return tableBuilding(content).effect.rarities.findIndex((cap) => rarityIndex(cap, content) >= index) + 1;
}

// Whether the table takes a rarity.
export const craftTakes = (table, rarityId, content) => rarityIndex(rarityId, content) <= table.maxRarity;

// Minutes the table needs for `count` parts of a rarity at its pace.
export function craftMinutes(rarityId, count, pace, content) {
  return Math.max(1, Math.round((count * content.raritiesById[rarityId].craftMinutes) / pace));
}

// The state at `now`: the parts of every finished order, with its extra
// ones, are in `parts` and the order is gone from the queue. `done` lists
// those orders.
export function settleCrafting({ materials, parts, queue }, now) {
  const done = queue.filter((order) => order.endsAt <= now);
  const made = {};
  for (const order of done) made[order.partId] = (made[order.partId] ?? 0) + order.parts + (order.bonus ?? 0);
  return { materials, parts: addCounts(parts, made), queue: queue.filter((order) => order.endsAt > now), done };
}

// An order at the end of the queue: it starts when the one before it ends.
// It keeps when it was ordered: the quests and the Próby Gildii count it
// then, and an order taken off the queue takes it back from those periods
// (takeOffQueue).
function append(queue, order, minutes, now) {
  const startsAt = Math.max(now, queue.at(-1)?.endsAt ?? now);
  return [...queue, { ...order, orderedAt: now, startsAt, endsAt: startsAt + minutes * 60000 }];
}

// An item as the bag keeps it, without its place there (id, equippedSlot):
// an order taking it apart keeps it, to give it back if it leaves the queue.
const storedItem = ({ id: _id, equippedSlot: _slot, ...item }) => item;

// The pieces of a stack an order takes that came from a trade: the
// Encyklopedia counts only the rest as the character's own (ownDiscoveries
// in encyclopedia.js, `foreign` by "material:<stack>"), and the character's
// own pieces go first. They are marked as traded again if the order leaves
// the queue.
function tradedPieces(foreign, key, held, count) {
  return Math.max(0, Math.min(foreign[`material:${key}`] ?? 0, held) - (held - count));
}

// The extra parts of an order of `parts`, known from its start, shown when it ends.
const bonusParts = (parts, table, rng) => (table.bonusChance > 0 ? countEvents(parts * table.bonusChance, rng) : 0);

// Orders for stacks of materials, one order each, while the queue has
// room: a whole stack, or as many of its pieces as `counts` gives for its
// key (the author: "Powinna być mozliwosc przerobienia pojedynczej sztuki
// danego materiału nie wszystkie danej jakości"). `state` is settled at
// `now`; `table` is craftTable(). A stack of a rarity the table does not
// take yet stays. `foreign` is the character's record of pieces from trades
// (tradedPieces). Returns the new state, the number of stacks ordered and of
// those too rare.
export function orderMaterials(state, keys, table, now, rng, content, counts = {}, foreign = {}) {
  const limit = content.balance.crafting.queueLimit;
  let { materials, queue } = state;
  let ordered = 0;
  let tooRare = 0;
  for (const key of keys) {
    const held = materials[key] ?? 0;
    const count = Math.min(held, counts[key] ?? held);
    if (count <= 0) continue;
    const { rarityId } = parseStack(key);
    if (!craftTakes(table, rarityId, content)) {
      tooRare += 1;
      continue;
    }
    if (queue.length >= limit) continue;
    const traded = tradedPieces(foreign, key, held, count);
    const order = {
      kind: 'material',
      key,
      count,
      partId: content.partsByRarity[rarityId].id,
      parts: count,
      bonus: bonusParts(count, table, rng),
      ...(traded > 0 && { traded }),
    };
    queue = append(queue, order, craftMinutes(rarityId, count, table.pace, content), now);
    materials = addCounts(materials, { [key]: -count });
    ordered += 1;
  }
  return { state: { ...state, materials, queue }, ordered, tooRare };
}

// An order to take an item apart. `state` is settled at `now`; the caller
// checks that the table takes the item's rarity and the queue has room, and
// removes the item. The order keeps the item, and the minerals jewellery
// gives at once (`minerals`), to give back and take back if it leaves the
// queue.
export function orderSalvage(state, item, name, table, now, rng, content) {
  const { partId, count, minerals } = salvageYield(item, content);
  const order = {
    kind: 'item',
    name,
    rarity: item.rarity,
    partId,
    parts: count,
    bonus: bonusParts(count, table, rng),
    items: [storedItem(item)],
    ...(minerals && { minerals }),
  };
  return { ...state, queue: append(state.queue, order, craftMinutes(item.rarity, count, table.pace, content), now) };
}

// Orders to take several items apart at once ("Rozbierz kilka", the author:
// "zaznaczać które chcemy (i możemy) przedmioty i dać do rozbiórki"): one
// order for each kind of part, so a handful of items takes a place or two in
// the queue and not one each. The parts and the minutes are those of taking
// the items apart one by one, added up. `entries` are { item, name }; an
// order of one item keeps its name, one of more has `count` items and no
// name. Each order keeps its items and their minerals, as orderSalvage's.
// The caller checks as for orderSalvage, and room for every order.
export function orderSalvageMany(state, entries, table, now, rng, content) {
  const groups = new Map();
  for (const { item, name } of entries) {
    const { partId, count, minerals } = salvageYield(item, content);
    const group = groups.get(partId) ?? { name, rarity: item.rarity, items: [], parts: 0, minutes: 0, minerals: null };
    groups.set(partId, {
      ...group,
      items: [...group.items, storedItem(item)],
      parts: group.parts + count,
      minutes: group.minutes + craftMinutes(item.rarity, count, table.pace, content),
      minerals: minerals ? addCounts(group.minerals ?? {}, minerals) : group.minerals,
    });
  }
  let { queue } = state;
  for (const [partId, group] of groups) {
    const order =
      group.items.length === 1
        ? { kind: 'item', name: group.name, rarity: group.rarity, partId, parts: group.parts }
        : { kind: 'item', count: group.items.length, rarity: content.partsById[partId].rarity, partId, parts: group.parts };
    const kept = { items: group.items, ...(group.minerals && { minerals: group.minerals }) };
    queue = append(queue, { ...order, bonus: bonusParts(group.parts, table, rng), ...kept }, group.minutes, now);
  }
  return { ...state, queue };
}

// Whether an order can leave the queue with all it took given back: one of
// materials always; one taking items apart only from 0.1.65 on, when
// orders began to keep their items (before, the item was gone at once).
export const orderCancellable = (order) => order.kind === 'material' || Array.isArray(order.items);

// What an order brought the narrator's quests and the Próby Gildii when it
// was ordered, by their kind: the pieces of materials processed or the items
// salvaged, and when. An order from before 0.1.65 does not know when it was
// ordered: its start stands for it.
export function orderWork(order) {
  const pieces = order.kind === 'material' ? order.count : (order.items?.length ?? order.count ?? 1);
  return { kind: order.kind === 'material' ? 'process' : 'salvage', pieces, orderedAt: order.orderedAt ?? order.startsAt };
}

// Orders taken off the queue ("Usuń z kolejki", "Usuń wszystkie"; the
// author: „nie wiem czy jest sens karania za takie pomyłki”), `ids` of
// orderCancellable ones in `state`, settled at `now`: their materials are
// back with the character's, and the orders after them move up, each keeping
// its length, so whichever comes first starts now when the one at work goes
// (its work so far is lost). Also returns what goes back to the bag
// (`items`), what they gave at once and now goes (`minerals` of jewellery,
// `patterns` taught), the traded pieces of each stack (`traded`, by stack)
// and the `work` the quests and the trials counted for every order of the
// queue (orderWork), `cancelled` for those leaving.
export function takeOffQueue(state, ids, now) {
  const leaving = state.queue.filter((order) => ids.has(order.id));
  const queue = [];
  for (const order of state.queue) {
    if (ids.has(order.id)) continue;
    const startsAt = queue.length === 0 ? Math.min(order.startsAt, now) : queue.at(-1).endsAt;
    queue.push({ ...order, startsAt, endsAt: startsAt + order.endsAt - order.startsAt });
  }
  const back = {};
  const traded = {};
  for (const order of leaving.filter((one) => one.kind === 'material')) {
    back[order.key] = (back[order.key] ?? 0) + order.count;
    if (order.traded) traded[order.key] = (traded[order.key] ?? 0) + order.traded;
  }
  return {
    state: { ...state, materials: addCounts(state.materials, back), queue },
    items: leaving.flatMap((order) => order.items ?? []),
    minerals: leaving.reduce((sum, order) => addCounts(sum, order.minerals ?? {}), {}),
    patterns: [...new Set(leaving.flatMap((order) => order.patterns ?? []))],
    traded,
    work: state.queue.map((order) => ({ ...orderWork(order), cancelled: ids.has(order.id) })),
  };
}

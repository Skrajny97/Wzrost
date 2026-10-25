// Materials and the Stół rzemieślniczy (data/materials.json). A creature
// beaten in a fight may leave its own material, at the rarity of its
// species and, the higher its level, more often one rarity higher. The table
// turns each material into one part of the same rarity and takes items apart
// into several parts of theirs, for free, one order after another, each
// taking its time. Parts wait for the professions.
//
// Stored state: materials { "wolf-pelt:rare": 2 }, parts { scraps: 5 } and
// the queue, a list of orders with their start and end. An order is done once
// its end has passed, and its parts count from then on. The server passes
// the time.

import { campBonus } from './camp.js';
import { countEvents } from './rng.js';

// A material at one rarity, as the store keeps it: "wolf-pelt:rare".
export const stackKey = (materialId, rarityId) => `${materialId}:${rarityId}`;

export function parseStack(key) {
  const at = key.lastIndexOf(':');
  return { materialId: key.slice(0, at), rarityId: key.slice(at + 1) };
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

// The chance that a creature of `level` leaves its material one rarity higher.
export function rarityUpChance(level, content) {
  const { materialRarityUpPerLevel, materialRarityUpMax } = content.balance.rewards;
  return Math.min(materialRarityUpMax, Math.max(0, level) * materialRarityUpPerLevel);
}

function nextRarity(rarityId, content) {
  const index = content.rarities.findIndex((rarity) => rarity.id === rarityId);
  return content.rarities[Math.min(index + 1, content.rarities.length - 1)].id;
}

// What a beaten creature of `level` leaves, as { stackKey: count }. `weight`
// is its part of the fight: the share of the exploration's time the fight
// stands for, the group factor and a demanding encounter. So the material
// comes at the same rate per hour whatever the length, and a fight that
// stands for many can leave more than one.
export function materialDrops(monsterId, level, weight, rng, content) {
  const material = content.materialsByMonster[monsterId];
  const found = {};
  if (!material) return found;
  const count = countEvents(content.raritiesById[material.rarity].materialChance * weight, rng);
  const up = rarityUpChance(level, content);
  for (let i = 0; i < count; i++) {
    const key = stackKey(material.id, rng.chance(up) ? nextRarity(material.rarity, content) : material.rarity);
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
// upgrade, of the item's rarity.
export function salvageYield(item, content) {
  const { salvageBase, salvageLevelStep } = content.balance.crafting;
  return {
    partId: content.partsByRarity[item.rarity].id,
    count: salvageBase + Math.floor(item.level / salvageLevelStep) + (item.upgrade ?? 0),
  };
}

// How fast the table works at the camp's levels: 0 until a building that
// crafts (craftSpeed) stands, then 1 plus its bonus.
export function craftPace(levels, content) {
  const built = content.buildings.some((building) => building.effect.kind === 'craftSpeed' && (levels[building.id] ?? 0) > 0);
  return built ? 1 + campBonus(levels, 'craftSpeed', content) : 0;
}

// Minutes the table needs for `count` parts of a rarity at its pace.
export function craftMinutes(rarityId, count, pace, content) {
  return Math.max(1, Math.round((count * content.raritiesById[rarityId].craftMinutes) / pace));
}

// The state at `now`: the parts of every finished order are in `parts` and
// the order is gone from the queue. `done` lists those orders.
export function settleCrafting({ materials, parts, queue }, now) {
  const done = queue.filter((order) => order.endsAt <= now);
  const made = {};
  for (const order of done) made[order.partId] = (made[order.partId] ?? 0) + order.parts;
  return { materials, parts: addCounts(parts, made), queue: queue.filter((order) => order.endsAt > now), done };
}

// An order at the end of the queue: it starts when the one before it ends.
function append(queue, order, minutes, now) {
  const startsAt = Math.max(now, queue.at(-1)?.endsAt ?? now);
  return [...queue, { ...order, startsAt, endsAt: startsAt + minutes * 60000 }];
}

// Orders for whole stacks of materials, one order each, while the queue has
// room. `state` is settled at `now`. Returns the new state and the number of
// stacks ordered.
export function orderMaterials(state, keys, pace, now, content) {
  const limit = content.balance.crafting.queueLimit;
  let { materials, queue } = state;
  let ordered = 0;
  for (const key of keys) {
    const count = materials[key] ?? 0;
    if (count <= 0 || queue.length >= limit) continue;
    const { rarityId } = parseStack(key);
    const order = { kind: 'material', key, count, partId: content.partsByRarity[rarityId].id, parts: count };
    queue = append(queue, order, craftMinutes(rarityId, count, pace, content), now);
    materials = addCounts(materials, { [key]: -count });
    ordered += 1;
  }
  return { state: { ...state, materials, queue }, ordered };
}

// An order to take an item apart. `state` is settled at `now`; the caller
// checks that the queue has room and removes the item.
export function orderSalvage(state, item, name, pace, now, content) {
  const { partId, count } = salvageYield(item, content);
  const order = { kind: 'item', name, rarity: item.rarity, partId, parts: count };
  return { ...state, queue: append(state.queue, order, craftMinutes(item.rarity, count, pace, content), now) };
}

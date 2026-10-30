// The Osada (data/settlement.json), part I: the reputation with the
// brotherhoods and the relation with the residents, the Tablica zleceń, the
// Zaklinaczka's reforging of an affix and the Pustelnik's resets. Reputation
// never falls with time (the design document).
//
// Stored state: reputation { herbalists: 120 } and relations
// { headman: 14 } by id; the board, three slots of an order each or of the
// moment the next one comes (`readyAt`), this week's big order, and the
// count of orders delivered (`delivered`) for the Punkty Systemu of every
// third one. Orders are drawn from a seed of the character and the slot's
// turn, so a slot always gets the same order; the server gives the time
// and the seed.

import { knownPotions, potionPrice } from './brewing.js';
import { materialPrice, parseStack, stackKey } from './crafting.js';
import { fireBuilding, fireTrade } from './fire.js';
import { affixShare, affixValue, sellPrice } from './items.js';
import { knownHerbs, professionOpen, professionState } from './professions.js';
import { questPeriod } from './quests.js';
import { createRng } from './rng.js';
import { partPrice, shopBuilding } from './shop.js';
import { craftCost, knownPatterns } from './workshop.js';

const rarityIndex = (rarityId, content) => content.rarities.findIndex((rarity) => rarity.id === rarityId);

// The standing at `points`: the last one reached, its place among the
// standings, the next one (null at the top) and the points still to it.
export function standingOf(points, content) {
  const { standings } = content.settlement;
  const index = standings.findLastIndex((standing) => standing.points <= points);
  const next = standings[index + 1] ?? null;
  return { ...standings[index], index, next, toNext: next ? next.points - points : 0 };
}

// Whether a brotherhood's standing has reached the one of `standingId`.
const reached = (points, standingId, content) =>
  standingOf(points, content).index >= content.settlement.standings.findIndex((standing) => standing.id === standingId);

// The goods kept in the bag, which waits for the character's return from an
// exploration or a profession's work: their orders are delivered at home,
// as the scrapper buys them only then. A Warsztat's item is in the bag too.
export const BAG_GOODS = new Set(['herb', 'potion', 'craft']);

// The brotherhood that orders a kind of goods.
const brotherhoodOf = (kind, content) => content.settlement.brotherhoods.find((brotherhood) => brotherhood.goods.includes(kind));

// What a Warsztat's item of a pattern costs to make at `level` at the
// cheapest: its common parts at the Lada złomiarza's top level and its
// resources at the fire spirit's.
export function craftBuyCost(baseId, level, content) {
  const { parts, resources } = craftCost(content.basesById[baseId], 'common', 1, level, content);
  const partGold = Object.entries(parts).reduce((sum, [partId, count]) => sum + count * partPrice(partId, shopBuilding(content).maxLevel, content), 0);
  const resourceGold = Object.values(resources).reduce((sum, count) => sum + count, 0) * fireTrade(fireBuilding(content).maxLevel, content).unitGold;
  return partGold + resourceGold;
}

// What one piece of a good fetches on the market: the scrapper's price of a
// herb, a potion and a material, and the board's own prices of the camp's
// resources and of the parts, which the fire spirit and the Lada złomiarza
// sell for more. A Warsztat's item (`craft`, by its pattern) is priced at
// what making it at `level` costs at the cheapest, so an order pays below
// that and never for buying what it takes.
export function goodPrice({ kind, key }, content, level = 1) {
  const { orders } = content.settlement;
  if (kind === 'herb') return content.herbsById[key].price;
  if (kind === 'potion') return potionPrice(content.potionsById[key], content);
  if (kind === 'material') return materialPrice(parseStack(key).rarityId, content);
  if (kind === 'resource') return orders.resourceGold;
  if (kind === 'craft') return craftBuyCost(key, level, content);
  return orders.partGold * content.raritiesById[content.partsById[key].rarity].sell;
}

// What the scrapper pays for a common Warsztat's item of a pattern at `level`.
export const craftSellPrice = (level, content) => sellPrice({ level, rarity: 'common' }, content);

// The goods an order may ask for: only what the character can already get
// (question 89 A): the herbs its Zielarstwo knows, the potions its Alchemia
// knows, the materials of the creatures it has met, at their species'
// rarity (no elite's or champion's trophy), the camp's resources and the
// parts up to the board's partRarity.
export function orderGoods(character, content) {
  const goods = [];
  const open = (profession) => profession && professionOpen(content.professionsById[profession.profession], character.level, content);
  if (open(content.gathering)) {
    const level = professionState(character.professions, content.gathering.profession).level;
    for (const herb of knownHerbs(level, content)) goods.push({ kind: 'herb', key: herb.id });
  }
  if (open(content.brewing)) {
    const level = professionState(character.professions, content.brewing.profession).level;
    for (const potion of knownPotions(level, content)) goods.push({ kind: 'potion', key: potion.id });
  }
  for (const monsterId of character.met ?? []) {
    const monster = content.monstersById[monsterId];
    const material = content.materialsByMonster[monsterId];
    if (material && monster && !monster.elite && !monster.champion) goods.push({ kind: 'material', key: stackKey(material.id, material.rarity) });
  }
  // The patterns of Rzemieślnictwo the character knows (question 79 A: the
  // smiths order the Warsztat's items too).
  if (open(content.workshop)) {
    const level = professionState(character.professions, content.workshop.profession).level;
    for (const base of knownPatterns(level, character.patterns ?? [], content)) goods.push({ kind: 'craft', key: base.id });
  }
  for (const resource of content.resources) goods.push({ kind: 'resource', key: resource.id });
  const top = rarityIndex(content.settlement.orders.partRarity, content);
  for (const part of content.parts) if (rarityIndex(part.rarity, content) <= top) goods.push({ kind: 'part', key: part.id });
  return goods.filter((good) => brotherhoodOf(good.kind, content));
}

// A material one rarity higher, for an order of quality.
function finer(key, content) {
  const { materialId, rarityId } = parseStack(key);
  const next = content.rarities[rarityIndex(rarityId, content) + 1];
  return next ? stackKey(materialId, next.id) : key;
}

// An order drawn from `seed`: a brotherhood, each as likely as another, so
// each one's reputation grows at the same pace; one of its kinds of goods;
// a good of that kind; the count for the character's level, the gold
// (`pay` times the market price) and the reputation, a quality one from
// the brotherhood's quality standing on (question 90 A), and one sentence
// of the one who orders (question 94 A). `weekly` makes the week's big
// order.
export function drawOrder({ character, reputation = {}, seed, weekly = false }, content) {
  const { orders } = content.settlement;
  const rng = createRng(seed);
  const goods = orderGoods(character, content);
  if (goods.length === 0) return null;
  const brotherhoods = content.settlement.brotherhoods.filter((one) => goods.some((good) => one.goods.includes(good.kind)));
  const brotherhood = rng.pick(brotherhoods);
  const kind = rng.pick([...new Set(goods.filter((good) => brotherhood.goods.includes(good.kind)).map((good) => good.kind))]);
  const good = rng.pick(goods.filter((one) => one.kind === kind));
  const tuning = orders.counts[kind];
  let count = rng.int(tuning.min, tuning.max) + tuning.perTenLevels * Math.floor(character.level / 10);
  let key = good.key;
  let factor = 1;
  if (kind === 'material' && reached(reputation[brotherhood.id] ?? 0, orders.quality.from, content) && rng.chance(orders.quality.chance)) {
    const better = finer(key, content);
    if (better !== key) {
      key = better;
      factor = orders.quality.reward;
    }
  }
  if (weekly) count *= orders.weekly.count;
  const gold = Math.max(1, Math.round(count * goodPrice({ kind, key }, content, character.level) * orders.pay[kind] * factor * (weekly ? orders.weekly.reward / orders.weekly.count : 1)));
  // From the special standing a brotherhood's order may be special
  // (question 82): more reputation and Punkty Systemu for the same goods
  // and gold, so it never pays for buying them.
  const special = !weekly && reached(reputation[brotherhood.id] ?? 0, orders.special.from, content) && rng.chance(orders.special.chance);
  return {
    kind,
    key,
    brotherhood: brotherhood.id,
    count,
    gold,
    reputation: weekly ? orders.weekly.reputation : orders.reputation * (special ? orders.special.reputation : 1),
    story: rng.pick(orders.stories[kind]),
    ...(weekly && { weekly: true }),
    ...(special && { special: true }),
  };
}

// An empty board: every slot waiting for its first order now.
export const emptyBoard = () => ({ slots: [], weekly: null, delivered: 0, turn: 0 });

// The board at `now`: each slot without an order gets one once its moment
// has come, and an order left for expireDays after it came goes, with a
// new one in its place at once (question 93: "B, ale terminy tygodniowe").
// The week's big order is this week's (drawn when the week comes, kept
// until delivered, then none until the next week). `seed` is the
// character's.
export function settleBoard(stored, { character, reputation, seed }, now, content) {
  const { orders } = content.settlement;
  const board = { ...emptyBoard(), ...stored };
  const term = orders.expireDays * 86400000;
  let turn = board.turn ?? 0;
  const slots = Array.from({ length: orders.open }, (_, index) => board.slots[index] ?? { readyAt: now });
  const settled = slots.map((first) => {
    let slot = first;
    for (;;) {
      if (slot.order && slot.order.expiresAt <= now) slot = { readyAt: slot.order.expiresAt };
      if (slot.order || slot.readyAt > now) return slot;
      turn += 1;
      const order = drawOrder({ character, reputation, seed: `${seed}:order:${turn}` }, content);
      if (!order) return slot;
      slot = { order: { id: turn, ...order, expiresAt: slot.readyAt + term } };
    }
  });
  const { key } = questPeriod('weekly', now, content);
  const weekly =
    board.weekly?.period === key
      ? board.weekly
      : { period: key, order: drawOrder({ character, reputation, seed: `${seed}:weekly:${key}`, weekly: true }, content), done: false };
  return { ...board, slots: settled, weekly, turn };
}

// How many pieces of a good the character holds: herbs, potions, materials,
// resources and parts by key, as the store keeps them, and the Warsztat's
// items in the bag by pattern (`crafted`).
export function goodStock({ kind, key }, stocks) {
  const store = { herb: stocks.herbs, potion: stocks.potions, material: stocks.materials, resource: stocks.resources, part: stocks.parts, craft: stocks.crafted }[kind];
  return store?.[key] ?? 0;
}

// The Warsztat's items of a pattern an order takes from the bag: the
// weakest first (rarity, upgrade, level), never one worn.
export function craftedFor(items, baseId, count, content) {
  const rank = (item) => content.rarities.findIndex((rarity) => rarity.id === item.rarity);
  return items
    .filter((item) => item.crafted && item.base === baseId && !item.equippedSlot)
    .sort((a, b) => rank(a) - rank(b) || (a.upgrade ?? 0) - (b.upgrade ?? 0) || a.level - b.level || a.id - b.id)
    .slice(0, count);
}

// The order of a slot, or the week's, by its id (`weekly` for the week's).
const findOrder = (board, orderId) =>
  orderId === 'weekly' ? (board.weekly && !board.weekly.done ? board.weekly.order : null) : board.slots.find((slot) => slot.order?.id === orderId)?.order ?? null;

// Why an order cannot be delivered now, or null.
export function deliverBlock(board, orderId, stocks) {
  const order = findOrder(board, orderId);
  if (!order) return { code: 'no_order', message: 'Tego zlecenia nie ma już na tablicy.' };
  if (goodStock(order, stocks) < order.count) return { code: 'not_enough', message: 'Brakuje Ci jeszcze tego, o co proszą.' };
  return null;
}

// Delivering an order (deliverBlock first): what it takes, what it gives (the
// gold, the brotherhood's reputation, the relation with the resident who
// posts the orders and, for every
// systemPoints.every delivered order and for the week's, Punkty Systemu,
// question 91 A) and the board after, whose slot waits refillMinutes for the
// next order (question 88 A).
export function deliverOrder(board, orderId, now, content) {
  const { orders } = content.settlement;
  const order = findOrder(board, orderId);
  const weekly = orderId === 'weekly';
  const delivered = board.delivered + (weekly ? 0 : 1);
  const systemPoints = weekly
    ? orders.systemPoints.weekly
    : (delivered % orders.systemPoints.every === 0 ? orders.systemPoints.points : 0) + (order.special ? orders.special.systemPoints : 0);
  return {
    board: {
      ...board,
      delivered,
      slots: weekly ? board.slots : board.slots.map((slot) => (slot.order?.id === orderId ? { readyAt: now + orders.refillMinutes * 60000 } : slot)),
      weekly: weekly ? { ...board.weekly, done: true } : board.weekly,
    },
    take: { kind: order.kind, key: order.key, count: order.count },
    gold: order.gold,
    reputation: { [order.brotherhood]: order.reputation },
    relation: { [orders.resident]: orders.relationGain },
    systemPoints,
  };
}

// Rejecting an order is free, and a new one comes after refillMinutes
// (question 92 A); the week's cannot be rejected.
export function rejectOrder(board, orderId, now, content) {
  if (orderId === 'weekly' || !findOrder(board, orderId)) return null;
  const readyAt = now + content.settlement.orders.refillMinutes * 60000;
  return { ...board, slots: board.slots.map((slot) => (slot.order?.id === orderId ? { readyAt } : slot)) };
}

// The Zaklinaczka's price of reforging an item's affix (question 99): gold
// for its level and rarity, growth times more for each reforging of the
// item before (`times`), and creatures' materials of a rarity for the
// item's: common ones for rare and unique items, rare ones for epic and
// legendary.
export function reforgeCost(item, times, content) {
  const { goldPerLevel, growth, materials } = content.settlement.reforge;
  const rarity = content.raritiesById[item.rarity];
  return {
    gold: Math.round(item.level * goldPerLevel * rarity.sell * growth ** times),
    materials: materials[item.rarity] ?? null,
  };
}

// Why an item's affix cannot be reforged now, or null. `stack` is the key
// of the materials the player pays with.
export function reforgeBlock(item, affixIndex, { gold, materials, stack, times }, content) {
  if (!item || !(item.affixes?.length > 0)) return { code: 'no_affixes', message: 'Ten przedmiot nie ma afiksów do przekucia.' };
  if (!Number.isInteger(affixIndex) || !item.affixes[affixIndex]) return { code: 'invalid_affix', message: 'Wybierz afiks do przekucia.' };
  const cost = reforgeCost(item, times, content);
  if (gold < cost.gold) return { code: 'not_enough_gold', message: 'Brakuje złota na przekucie.' };
  if (cost.materials) {
    if (typeof stack !== 'string' || !stack.includes(':') || parseStack(stack).rarityId !== cost.materials.rarity) {
      return { code: 'invalid_material', message: 'Zaklinaczka potrzebuje materiałów innej rzadkości.' };
    }
    if ((materials[stack] ?? 0) < cost.materials.count) return { code: 'not_enough_materials', message: 'Brakuje materiałów na przekucie.' };
  }
  return null;
}

// How many new affixes the Zaklinaczka offers to choose from at the
// character's relation with her: one, and more from the standings in
// reforge.choices on (question 97: "z czasem rozwoju Reputacji możliwość
// wybrania afiksu z 2-3 dostępnych").
export function reforgeChoices(points, content) {
  const { index } = standingOf(points, content);
  const at = (standingId) => content.settlement.standings.findIndex((standing) => standing.id === standingId);
  return content.settlement.reforge.choices.reduce((count, step) => (index >= at(step.from) ? step.count : count), 1);
}

// The new affixes a reforging draws for the chosen one (question 97 A):
// `count` different ones among the other affixes of its kind (a prefix
// stays a prefix), never one the item already has, with the value its item
// level and rarity give that stat. The creature that names it stays, so
// the new affix comes from the place the item was found (question 98 A).
export function reforgeOptions(item, affixIndex, count, rng, content) {
  const old = item.affixes[affixIndex];
  let pool = (old.kind === 'prefix' ? content.prefixes : content.suffixes).filter((affix) => !item.affixes.some((other) => other.id === affix.id));
  const share = affixShare(item.level, item.rarity, content);
  const options = [];
  while (options.length < count && pool.length > 0) {
    const affix = rng.weighted(pool);
    pool = pool.filter((other) => other.id !== affix.id);
    options.push({ ...old, id: affix.id, stat: affix.stat, value: affixValue(affix.stat, share, content.balance.items) });
  }
  return options;
}

// The item with one affix in place of the one at `affixIndex`.
export const withAffix = (item, affixIndex, affix) => ({ ...item, affixes: item.affixes.map((other, index) => (index === affixIndex ? affix : other)) });

// Reforging with nothing to choose: the chosen affix draws anew. The other
// affixes, the upgrade and the level stay. Always succeeds (question 100 A).
export function reforgeItem(item, affixIndex, rng, content) {
  const [affix] = reforgeOptions(item, affixIndex, 1, rng, content);
  return { ...withAffix(item, affixIndex, affix), reforged: (item.reforged ?? 0) + 1 };
}

// The Pustelnik's prices: a path reset (question 122 A), a change of
// evolution after the free first one (question 123 A: 100 000 gold, each
// next one twice as much; `paid` is the paid changes before) and a stat
// reset from statsFromLevel on (question 124 A), null before.
export const pathResetCost = (level, content) => level * content.settlement.hermit.pathGoldPerLevel;
export const evolutionChangeCost = (paid, content) => content.settlement.hermit.evolutionGold * content.settlement.hermit.evolutionGrowth ** paid;
// The next change of evolution after `changes` of them: the first free (the
// author at E4: "tylko raz darmowo, a później baaaardzo baaaardzo drogo").
export const evolutionChangePrice = (changes, content) => (changes > 0 ? evolutionChangeCost(changes - 1, content) : 0);
// The evolutions a change can go to: the class's others.
export const evolutionChanges = (character, content) =>
  character.evolution ? content.evolutions.filter((evolution) => evolution.classId === character.classId && evolution.id !== character.evolution) : [];
export const statResetCost = (level, content) =>
  level >= content.settlement.hermit.statsFromLevel ? level * content.settlement.hermit.statsGoldPerLevel : null;

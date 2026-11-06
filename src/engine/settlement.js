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

import { knownPotions, potionPrice, recipeTaught } from './brewing.js';
import { heldOfRarity, knownStack, materialPrice, parseStack, piecesOfRarity, stackKey } from './crafting.js';
import { fireBuilding, fireTrade } from './fire.js';
import { affixShare, affixValue, sellPrice } from './items.js';
import { easyPlace } from './hunt.js';
import { knownHerbs, professionOpen, professionState } from './professions.js';
import { questPeriod } from './quests.js';
import { createRng } from './rng.js';
import { partPrice, shopBuilding } from './shop.js';
import { areaUnlocked } from './unlocks.js';
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

// What a brotherhood's standing at `index` gives, in the words of the
// Osada's panel (brotherhoodsPanel.perks): the Kuźnia's discount for the
// Bractwo Kowali, the offers kept on the Targowisko for the Kompania
// Kupców, the perks of brotherhoodPerks, and for a brotherhood that posts
// orders, quality orders for materials and special orders from their
// standings.
export function brotherhoodPerks(brotherhood, index, content) {
  const { forge, market, orders, standings, brotherhoodsPanel } = content.settlement;
  const words = brotherhoodsPanel.perks;
  const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
  const from = (id) => standings.findIndex((standing) => standing.id === id);
  const perks = [];
  if (forge?.brotherhood === brotherhood.id) {
    const discount = forge.discount[Math.min(index, forge.discount.length - 1)];
    if (discount > 0) perks.push(fill(words.forge, { discount: Math.round(discount * 100) }));
  }
  if (market?.brotherhood === brotherhood.id) perks.push(fill(words.market, { offers: market.offers + index }));
  // The perks of the answers 589–593 (brotherhoodPerks in the data), each
  // only where its number differs from the one without the brotherhood,
  // before the orders'.
  for (const [id, perk] of perkEntries(content)) {
    if (perk.brotherhood !== brotherhood.id) continue;
    const value = perkAt(perk, index);
    if (value === perkAt(perk, 0)) continue;
    perks.push(fill(words[id], { value: shownPerk(id, value), fights: pluralPl(value, ['walkę', 'walki', 'walk']), items: pluralPl(value, ['przedmiot', 'przedmioty', 'przedmiotów']) }));
  }
  if (brotherhood.goods.includes('material') && index >= from(orders.quality.from)) perks.push(words.quality);
  if (brotherhood.goods.length > 0 && index >= from(orders.special.from)) perks.push(words.special);
  return perks;
}

// The perks of the brotherhoods' standings (data/settlement.json
// brotherhoodPerks, the author's 589–593), without the data's own note.
const perkEntries = (content) => Object.entries(content.settlement.brotherhoodPerks ?? {}).filter(([id]) => id !== '$comment');
const perkAt = (perk, index) => perk.byStanding[Math.min(index, perk.byStanding.length - 1)];

// A perk's number as the panel says it: shares in whole percents (the
// Targowisko's fee to a tenth), counts as they are.
function shownPerk(id, value) {
  if (id === 'marketFee') return String(Math.round(value * 1000) / 10).replace('.', ',');
  if (id === 'potionFights' || id === 'wandererItems' || id === 'auctionHours') return String(value);
  return String(Math.round(value * 100));
}

// The Polish form of a count: one, two to four (not 12 to 14), five and more.
function pluralPl(count, [one, few, many]) {
  if (count === 1) return one;
  const tens = count % 100;
  return count % 10 >= 2 && count % 10 <= 4 && (tens < 12 || tens > 14) ? few : many;
}

// A perk of a brotherhood's standing (brotherhoodPerks in the data, the
// author's 589–593): its number at the standing the character has with
// that brotherhood, by the Osada's reputation (settlement.reputation). An
// unknown perk is 0.
export function brotherhoodPerk(perkId, reputation, content) {
  const perk = content.settlement.brotherhoodPerks?.[perkId];
  if (!perk || perkId === '$comment') return 0;
  return perkAt(perk, standingOf(reputation?.[perk.brotherhood] ?? 0, content).index);
}

// Whether a brotherhood's standing has reached the one of `standingId`.
const reached = (points, standingId, content) =>
  standingOf(points, content).index >= content.settlement.standings.findIndex((standing) => standing.id === standingId);

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

// An order for any creatures' materials of a rarity, keyed "any:rare" (the
// author: "Powinno być prędzej oddaj 32 materiały pospolite/ileś
// rzadkich/unikalnych"): any material of that rarity counts but an elite's
// or a champion's trophy.
const ANY = 'any';
export const anyMaterialKey = (rarityId) => stackKey(ANY, rarityId);
export const isAnyMaterial = ({ kind, key }) => kind === 'material' && parseStack(key).materialId === ANY;

// The goods an order may ask for: only what the character can already get
// (question 89 A): the herbs its Zielarstwo knows, the potions its Alchemia
// knows (of the herbalist's rare recipes those she has taught it, by its
// `relations` with the residents), any materials of each rarity of the
// creatures it has met (no elite's or champion's trophy, and only the
// rarities anyMaterial names), the camp's resources and the parts up to the
// board's partRarity.
export function orderGoods(character, content) {
  const goods = [];
  const open = (profession) => profession && professionOpen(content.professionsById[profession.profession], character.level, content);
  if (open(content.gathering)) {
    const level = professionState(character.professions, content.gathering.profession).level;
    for (const herb of knownHerbs(level, content)) goods.push({ kind: 'herb', key: herb.id });
  }
  if (open(content.brewing)) {
    const level = professionState(character.professions, content.brewing.profession).level;
    for (const potion of knownPotions(level, content, character.relations)) goods.push({ kind: 'potion', key: potion.id });
  }
  // The author: "Te zlecenie powinny być losowane dla danej postaci na dany
  // poziom, powinno ich być albo dużo albo ogólne (raczej ogólne)".
  const met = new Set();
  for (const monsterId of character.met ?? []) {
    const monster = content.monstersById[monsterId];
    const material = content.materialsByMonster[monsterId];
    if (material && monster && !monster.elite && !monster.champion) met.add(material.rarity);
  }
  for (const rarity of content.rarities) {
    if (met.has(rarity.id) && content.settlement.orders.anyMaterial[rarity.id]) goods.push({ kind: 'material', key: anyMaterialKey(rarity.id) });
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

// Materials one rarity higher, for an order of quality, up to the last
// rarity anyMaterial names.
function finer(key, content) {
  const { materialId, rarityId } = parseStack(key);
  const next = content.rarities[rarityIndex(rarityId, content) + 1];
  return next && content.settlement.orders.anyMaterial[next.id] ? stackKey(materialId, next.id) : key;
}

// The sentences an order may carry: its kind's, and for a Warsztat's item
// also those of its slot (craftStories), so a sword is not wanted for
// guards in rags (the author: "Strażnicy palisady chodzą bez uzbrojenia"
// w przypadku Broni).
export function orderStories(kind, key, content) {
  const { orders } = content.settlement;
  if (kind !== 'craft') return orders.stories[kind];
  const slot = content.bases.find((base) => base.id === key)?.slot;
  return [...orders.stories.craft, ...orders.craftStories.filter((story) => story.slots.includes(slot)).map((story) => story.text)];
}

// The hours one potion takes to make at the first level of the professions:
// gathering its herbs at their perHour and brewing it.
const potionHours = (potion, content) =>
  Object.entries(potion.herbs).reduce((hours, [herbId, count]) => hours + count / content.herbsById[herbId].perHour, 0) + content.brewing.potionMinutes / 60;

// The share of an order's count a good asks for (the author: "przez noc
// popraw zlecenia i dopasuj je sensownie"): a herb as its perHour against
// the quickest herb's, so a slow herb is asked for in as many hours as a
// quick one, not in as many pieces; a potion as the hours of the quickest
// potion against its own; any materials and parts materialStep times fewer
// for each rarity above the first, for about the same gold.
export function goodShare({ kind, key }, content) {
  const { orders } = content.settlement;
  if (kind === 'herb') return content.herbsById[key].perHour / Math.max(...content.herbs.map((herb) => herb.perHour));
  if (kind === 'potion') return Math.min(...content.potions.map((potion) => potionHours(potion, content))) / potionHours(content.potionsById[key], content);
  if (kind === 'material') return orders.materialStep ** rarityIndex(parseStack(key).rarityId, content);
  if (kind === 'part') return orders.materialStep ** rarityIndex(content.partsById[key].rarity, content);
  return 1;
}

// The most of a good an order asks for at the character's level, the
// week's or another.
export function orderCeiling({ kind, key }, level, weekly, content) {
  const { orders } = content.settlement;
  const tuning = orders.counts[kind];
  const most = (tuning.max + tuning.perTenLevels * Math.floor(level / 10)) * (weekly ? orders.weekly.count : 1);
  return Math.max(1, Math.round(most * goodShare({ kind, key }, content)));
}

// The rules of material and resource orders: 2 since 0.1.33 (the author's
// 584 B and C: materials five times dearer everywhere, resources asked for
// three times as many for the same gold). An order of theirs drawn by older
// rules, or by none (the material orders of 0.1.32 carried `scarce`), is
// drawn anew.
const ORDER_RULES = 2;
const REDRAWN = ['material', 'resource'];

// An order drawn from `seed`: a brotherhood, each as likely as another, so
// each one's reputation grows at the same pace; one of its kinds of goods;
// a good of that kind; the count for the character's level and the good's
// share (goodShare), the gold (`pay` times the market price) and the
// reputation, a quality one from the brotherhood's quality standing on
// (question 90 A), and one sentence of the one who orders (question 94 A).
// `weekly` makes the week's big order.
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
  let quality = false;
  if (kind === 'material' && reached(reputation[brotherhood.id] ?? 0, orders.quality.from, content) && rng.chance(orders.quality.chance)) {
    const better = finer(key, content);
    if (better !== key) {
      key = better;
      quality = true;
    }
  }
  if (weekly) count *= orders.weekly.count;
  count = Math.max(1, Math.round(count * goodShare({ kind, key }, content)));
  // A material pays the same for a piece in every order, the week's and a
  // quality one too (the author, 4.11.2026: "Bez sensu ze zlecenia w osadzie
  // czasem chca tylko 30 kamienia, a jednoczesnie 8 czy 17 różnych
  // materialow z niskim wynagrodzeniem" and "a jednocześnie istnieje
  // Garbarnia więc trzeba z tym uważać"): the Garbarnia and Gościwit sell
  // above the most anyone pays (buyCeiling), so a piece paid more in one
  // order would raise their prices. A quality order gives more reputation.
  const rate = weekly && kind !== 'material' ? orders.weekly.reward / orders.weekly.count : 1;
  const gold = Math.max(1, Math.round(count * goodPrice({ kind, key }, content, character.level) * orders.pay[kind] * rate));
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
    reputation: (weekly ? orders.weekly.reputation : orders.reputation * (special ? orders.special.reputation : 1)) * (quality ? orders.quality.reputation : 1),
    story: rng.pick(orderStories(kind, good.key, content)),
    // The rules an order of materials or resources was drawn by, so one
    // drawn before is drawn anew (ORDER_RULES).
    ...(REDRAWN.includes(kind) && { rules: ORDER_RULES }),
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
    // The terms gone by since an order went, while nobody looked: each
    // would draw an order only for it to go, so the last term's is drawn at
    // once, at its turn, as one by one (the code review: the work grew with
    // the board's age). With nothing to order the slot waits from the first.
    let skipped = 0;
    let gone = null;
    for (;;) {
      if (slot.order && outdated(slot.order, character, content)) slot = { readyAt: now };
      if (slot.order && slot.order.expiresAt <= now) {
        gone = slot.order.expiresAt;
        skipped = Math.floor((now - gone) / term);
        turn += skipped;
        slot = { readyAt: gone + skipped * term };
      }
      if (slot.order || slot.readyAt > now) return slot;
      turn += 1;
      const order = drawOrder({ character, reputation, seed: `${seed}:order:${turn}` }, content);
      if (!order) {
        turn -= skipped;
        return skipped > 0 ? { readyAt: gone } : slot;
      }
      skipped = 0;
      slot = { order: { id: turn, ...order, expiresAt: slot.readyAt + term } };
    }
  });
  const { key } = questPeriod('weekly', now, content);
  const weekly =
    board.weekly?.period === key && (board.weekly.done || !board.weekly.order || !outdated(board.weekly.order, character, content))
      ? board.weekly
      : { period: key, order: drawOrder({ character, reputation, seed: `${seed}:weekly:${key}`, weekly: true }, content), done: false };
  return {
    ...board,
    slots: settled.map((slot) => (slot.order ? { ...slot, order: freshStory(slot.order, content) } : slot)),
    weekly: weekly.order ? { ...weekly, order: freshStory(weekly.order, content) } : weekly,
    turn,
  };
}

// An order hung before the rules of today, one for one creature's material
// or one asking for more than an order asks for now (orderCeiling), is
// drawn anew, the week's too (the author: "Zlecenia aktualne jeśli są z
// tych dziwacznych - przelosuj każdemu").
const outdated = (order, character, content) =>
  (order.kind === 'material' && !isAnyMaterial(order)) || (REDRAWN.includes(order.kind) && (order.rules ?? 0) < ORDER_RULES) || order.count > orderCeiling(order, character.level, order.weekly === true, content);

// An order hung before its sentence was rewritten takes the new sentence
// closest to the old one (the most words alike from the start), so the
// board reads the corrected text at once.
function freshStory(order, content) {
  const stories = orderStories(order.kind, order.key, content);
  if (!order.story || stories.includes(order.story)) return order;
  const words = order.story.split(' ');
  const alike = (story) => {
    const other = story.split(' ');
    let same = 0;
    while (same < words.length && words[same] === other[same]) same += 1;
    return same;
  };
  return { ...order, story: stories.reduce((best, story) => (alike(story) > alike(best) ? story : best), stories[0]) };
}

// How many pieces of a good the character holds: herbs, potions, materials,
// resources and parts by key, as the store keeps them, the Warsztat's items
// in the bag by pattern (`crafted`), and for any materials of a rarity all
// the stacks that count for them.
export function goodStock({ kind, key }, stocks, content) {
  if (isAnyMaterial({ kind, key })) return anyMaterialStacks(key, stocks.materials ?? {}, content).reduce((sum, [, count]) => sum + count, 0);
  const store = { herb: stocks.herbs, potion: stocks.potions, material: stocks.materials, resource: stocks.resources, part: stocks.parts, craft: stocks.crafted }[kind];
  return store?.[key] ?? 0;
}

// The stacks an order for any materials of a rarity takes from, in the
// order it takes them: the biggest first, so the character keeps a bit of
// each, and the materials of the Zaklinaczka's elements last, so they stay
// for her while anything else will do. No trophy counts.
export function anyMaterialStacks(key, materials, content) {
  const { rarityId } = parseStack(key);
  const kept = new Set(content.settlement.imbue?.elements.map((one) => one.material) ?? []);
  const counts = (stack) => {
    if (!knownStack(stack, content) || parseStack(stack).rarityId !== rarityId) return false;
    const monster = content.monstersById[content.materialsById[parseStack(stack).materialId].monster];
    return Boolean(monster) && !monster.elite && !monster.champion;
  };
  const last = (stack) => (kept.has(parseStack(stack).materialId) ? 1 : 0);
  return Object.entries(materials)
    .filter(([stack, count]) => count > 0 && counts(stack))
    .sort(([a, x], [b, y]) => last(a) - last(b) || y - x || (a < b ? -1 : 1));
}

// The stacks a delivered order of materials takes, by key: its own, or for
// any materials anyMaterialStacks in their order until the count is met.
export function materialsTaken({ key, count }, materials, content) {
  if (parseStack(key).materialId !== ANY) return { [key]: count };
  const taken = {};
  let left = count;
  for (const [stack, held] of anyMaterialStacks(key, materials, content)) {
    if (left === 0) break;
    taken[stack] = Math.min(held, left);
    left -= taken[stack];
  }
  return taken;
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
export function deliverBlock(board, orderId, stocks, content) {
  const order = findOrder(board, orderId);
  if (!order) return { code: 'no_order', message: 'Tego zlecenia nie ma już na tablicy.' };
  if (goodStock(order, stocks, content) < order.count) return { code: 'not_enough', message: 'Brakuje Ci jeszcze tego, o co proszą.' };
  return null;
}

// Delivering an order (deliverBlock first): what it takes, what it gives (the
// gold, the brotherhood's reputation, the relation with the resident who
// posts the orders and, for every
// systemPoints.every delivered order and for the week's, Punkty Systemu,
// question 91 A) and the board after, whose slot waits refillMinutes for the
// next order (question 88 A).
// What an order pays now: its own gold, and for herbs, potions and
// materials at least overScrap times what the scrapper pays the character
// for them, with the camp's Skup bonus (`sellBonus`, question 236 A).
export function orderGold(order, sellBonus, content) {
  if (!['herb', 'potion', 'material'].includes(order.kind)) return order.gold;
  const scrap = goodPrice(order, content) * (1 + sellBonus) * order.count;
  return Math.max(order.gold, Math.ceil(scrap * content.settlement.orders.overScrap));
}

export function deliverOrder(board, orderId, now, content, sellBonus = 0) {
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
    gold: orderGold(order, sellBonus, content),
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
// legendary; any materials of that rarity add up (481 B: piecesOfRarity
// in crafting.js).
export function reforgeCost(item, times, content) {
  const { goldPerLevel, growth, materials } = content.settlement.reforge;
  const rarity = content.raritiesById[item.rarity];
  return {
    gold: Math.round(item.level * goldPerLevel * rarity.sell * growth ** times),
    materials: materials[item.rarity] ?? null,
  };
}

// Why an item's affix cannot be reforged now, or null. `materials` are the
// character's, which pay for it.
export function reforgeBlock(item, affixIndex, { gold, materials, times }, content) {
  if (!item || !(item.affixes?.length > 0)) return { code: 'no_affixes', message: 'Ten przedmiot nie ma afiksów do przekucia.' };
  if (!Number.isInteger(affixIndex) || !item.affixes[affixIndex]) return { code: 'invalid_affix', message: 'Wybierz afiks do przekucia.' };
  const cost = reforgeCost(item, times, content);
  if (gold < cost.gold) return { code: 'not_enough_gold', message: 'Brakuje złota na przekucie.' };
  if (cost.materials && !piecesOfRarity(materials, cost.materials, content)) {
    const short = cost.materials.count - heldOfRarity(materials, cost.materials.rarity, content);
    return { code: 'not_enough_materials', message: `Brakuje ${short} szt. materiałów o rzadkości „${content.raritiesById[cost.materials.rarity].name}”.` };
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
// The evolutions a change can go to: the class's others of the same stage.
// A character with its second form changes its first evolution and gets
// that one's second form with it.
export function evolutionChanges(character, content) {
  const current = character.evolution ? content.evolutionsById[character.evolution] : null;
  if (!current) return [];
  return content.evolutions.filter((evolution) => evolution.classId === character.classId && evolution.id !== current.id && (evolution.stage ?? 1) === (current.stage ?? 1));
}
export const statResetCost = (level, content) =>
  level >= content.settlement.hermit.statsFromLevel ? level * content.settlement.hermit.statsGoldPerLevel : null;

// The Karczma (part II, question 116): a mug costs mugGoldPerLevel gold for
// each level of the character, and with it the innkeeper tells where an
// elite or a champion lurks today. The place is one of the `newest` inner
// regions open to the character's class with an elite or a champion, not
// too easy for the character; the rumor names the champion where there is
// one, half the time, else the elite. One a day (the narrator's day), drawn
// from the character's seed and the day, so a second mug tells the same.
export const mugCost = (level, content) => level * content.settlement.tavern.mugGoldPerLevel;

export function drawRumor({ character, seed }, now, content) {
  const { rumor } = content.settlement.tavern;
  const day = questPeriod('daily', now, content);
  const areas = content.areas
    .filter((area) => areaUnlocked(area, character.classLevel, content) && (area.elite || area.champion) && !easyPlace(character.level, area, content))
    .sort((a, b) => b.minLevel - a.minLevel)
    .slice(0, rumor.newest);
  if (areas.length === 0) return null;
  const rng = createRng(`${seed}:rumor:${day.key}`);
  const area = rng.pick(areas);
  const monsterId = area.champion && (!area.elite || rng.chance(0.5)) ? area.champion : area.elite;
  return { day: day.key, areaId: area.id, monsterId, line: rng.int(0, rumor.lines.length - 1), used: false };
}

// Today's rumor as kept in the Osada, or null after the day it was told.
export const rumorToday = (stored, now, content) => (stored?.day === questPeriod('daily', now, content).key ? stored : null);

// The rumor's odds for an exploration of an inner region: rumor.factor
// times more elites and champions when it is today's, about this place and
// not yet used by an exploration, else 1.
export function rumorFactor(stored, areaId, now, content) {
  const rumor = rumorToday(stored, now, content);
  return rumor && !rumor.used && rumor.areaId === areaId ? content.settlement.tavern.rumor.factor : 1;
}

// The innkeeper's words: the line with the place's name and the creature,
// as the rumor's lines write it ({area}, {creature}: the creature as it is
// counted once, "odyńca").
export function rumorText(rumor, content) {
  const area = content.areasById[rumor.areaId];
  const monster = content.monstersById[rumor.monsterId];
  const line = content.settlement.tavern.rumor.lines[rumor.line % content.settlement.tavern.rumor.lines.length];
  return line.replaceAll('{area}', area.name).replaceAll('{creature}', monster.counted[0]);
}

// A companion's gift of the week from its profession (part II, question
// 112 A: "raz w tygodniu prezent z jego profesji"): goods of the kind its
// profession makes (`goods` in companions.professions), of those the
// character already knows as an order does, and before the character's
// profession opens those of its first level; one of them, as many as
// `gifts` gives for the character's level. Drawn from the seed, the
// companion and the week, so it is the same all week; null once taken this
// week (`giftWeek`).
export function companionGift(companion, { character, seed }, now, content) {
  const { professions, gifts } = content.settlement.companions;
  const week = questPeriod('weekly', now, content).key;
  if (companion.giftWeek === week) return null;
  const kind = professions.find((one) => one.id === companion.profession)?.goods;
  let goods = orderGoods(character, content).filter((good) => good.kind === kind);
  if (goods.length === 0 && kind === 'herb') goods = knownHerbs(1, content).map((herb) => ({ kind, key: herb.id }));
  if (goods.length === 0 && kind === 'potion') goods = knownPotions(1, content).map((potion) => ({ kind, key: potion.id }));
  if (goods.length === 0) return null;
  const rng = createRng(`${seed}:gift:${companion.id}:${week}`);
  const { key } = rng.pick(goods);
  const tuning = gifts[kind];
  const count = rng.int(tuning.min, tuning.max) + Math.floor(tuning.perTenLevels * Math.floor(character.level / 10));
  return { week, kind, key, count };
}

// Jagna's Chata zielarki (part III, question 121 A): she buys herbs and
// potions for more than the scrapper (120 A: "wyspecjalizowani kupcy płacą
// więcej niż złomiarz"): his price with the camp's Skup bonus, and
// `premium` more by the standing of the relation with her.
export function herbalistPremium(points, content) {
  const { premium } = content.settlement.herbalist;
  return premium[Math.min(standingOf(points, content).index, premium.length - 1)];
}

// The rare recipes of Alchemia Jagna teaches (question 121 A: "zaufanym
// zdradza rzadkie receptury"; `taught` in professions.json) at `points` of
// the relation with her, free: those she has taught, and the next standing
// that teaches more, with its recipes (null once she has taught them all).
export function herbalistRecipes(points, content) {
  const relations = { [content.settlement.herbalist.resident]: points };
  const rare = content.potions.filter((potion) => potion.taught);
  const next = content.settlement.standings.find((standing) => standing.points > points && rare.some((potion) => potion.taught === standing.id));
  return {
    taught: rare.filter((potion) => recipeTaught(potion, relations, content)),
    next: next ? { standing: next, potions: rare.filter((potion) => potion.taught === next.id) } : null,
  };
}

// The recipes a trade that takes the relation with Jagna from `before` to
// `after` points makes her teach.
export function recipesTaughtBetween(before, after, content) {
  const had = new Set(herbalistRecipes(before, content).taught.map((potion) => potion.id));
  return herbalistRecipes(after, content).taught.filter((potion) => !had.has(potion.id));
}

// What a resident who sells takes off the price at `points` of the
// relation with them (287 A: "Znajomy płaci 2,5% mniej, Stały klient 5%,
// Zaufany 7,5%, a Przyjaciel 10%"): Gościwit on the Targowisko, Jagna and
// Wszebor in the Garbarnia (tannery.js).
export function relationDiscount(points, content) {
  const discounts = content.settlement.relationDiscount;
  return discounts[Math.min(standingOf(points, content).index, discounts.length - 1)];
}

// The reputation trade gives (120 A: the limit is on the reputation only):
// a point for every goldPerPointPerLevel gold times the character's level,
// at most `daily` a day. `stored` is the day's count so far ({ day, points,
// gold }); the answer has the points now and the day's count after them.
// The gold short of the next point waits for the day's next trade, so small
// trades add up (the author: "Kupiłem dwa materiały jednego typu i nie
// wzrosła relacja"); with the day's points all given, none is kept.
export function tradePoints(gold, level, stored, now, content, tuning = content.settlement.herbalist.reputation) {
  const { daily } = tuning;
  const per = goldPerPoint(level, tuning);
  const day = questPeriod('daily', now, content).key;
  const today = stored?.day === day;
  const before = today ? stored.points : 0;
  const total = (today ? (stored.gold ?? 0) : 0) + Math.max(0, gold);
  const points = Math.max(0, Math.min(daily - before, Math.floor(total / per)));
  const left = before + points >= daily ? 0 : total - points * per;
  return { points, trade: { day, points: before + points, gold: left } };
}

// The gold of trade a point takes at the character's level.
export const goldPerPoint = (level, tuning) => tuning.goldPerPointPerLevel * level;

// What the page says of the day's trade: the points so far out of the
// limit, the gold a point takes, and the gold still short of the next one
// (null with the day's points all given).
export function tradeView(stored, level, now, content, tuning = content.settlement.herbalist.reputation) {
  const day = questPeriod('daily', now, content).key;
  const today = stored?.day === day;
  const points = today ? stored.points : 0;
  const per = goldPerPoint(level, tuning);
  return { today: points, daily: tuning.daily, perPoint: per, toNext: points >= tuning.daily ? null : per - (today ? (stored.gold ?? 0) : 0) };
}

// The Zaklinaczka's zaklęcie żywiołu (part III, question 101 A): a weapon
// turns weaponShare of every blow's damage into the element (combat.js), a
// body armour gets the element's resistance of a resistRarity affix at its
// level (stats.js). Stored on the item as `imbue`.
export function imbueEffect(item, element, content) {
  const { weaponShare, resistRarity } = content.settlement.imbue;
  if (item.slot === 'weapon') return { element, share: weaponShare };
  const stat = `resist.${element}`;
  return { element, stat, value: affixValue(stat, affixShare(item.level, resistRarity, content), content.balance.items) };
}

// What the zaklęcie costs: goldPerLevel gold for each level of the item
// times its rarity's sale multiplier, and materialCount pieces of the
// element's material, in that material's own rarity (`stack`).
export function imbueCost(item, element, content) {
  const { goldPerLevel, materialCount, elements } = content.settlement.imbue;
  const material = content.materialsById[elements.find((one) => one.element === element)?.material];
  return {
    gold: Math.round(goldPerLevel * item.level * content.raritiesById[item.rarity].sell),
    stack: material ? stackKey(material.id, material.rarity) : null,
    count: materialCount,
  };
}

// Why the item cannot take the element now, or null.
export function imbueBlock(item, element, { gold, materials }, content) {
  const { slots, elements } = content.settlement.imbue;
  if (!slots.includes(item.slot)) return { code: 'wrong_slot', message: 'Żywioł da się zakląć tylko w broń i w pancerz.' };
  if (!elements.some((one) => one.element === element)) return { code: 'invalid_element', message: 'Wybierz żywioł.' };
  if (item.imbue?.element === element) return { code: 'same_element', message: 'Ten przedmiot ma już ten żywioł.' };
  const cost = imbueCost(item, element, content);
  if (gold < cost.gold) return { code: 'not_enough_gold', message: 'Brakuje złota na zaklęcie.' };
  if ((materials[cost.stack] ?? 0) < cost.count) return { code: 'not_enough_materials', message: 'Brakuje materiału żywiołu.' };
  return null;
}

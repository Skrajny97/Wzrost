// The Salon Gier in the Osada (data/settlement.json, `casino`; the author on
// 3.11.2026: "W Osadzie dodamy nowy budynek Salon Gier w średniowiecznym
// klimacie", answers 523–526): Szczęsny's two games, each for the day of
// the narrator's daily quests (Polish midnight).
//
// The Loteria (524 A): a ticket for `ticket` gold, one a character a day;
// the pot is `base` gold from the System and every ticket's price; at
// midnight the System draws one of the day's tickets and its character takes
// the whole pot. With no ticket there is no draw, and nothing carries over.
//
// The Koło Fortuny (525 A, 542 C; changed by the author on 4.11.2026: "Ma
// jedną pulę codziennie losowaną niezależnie od stawki, stawka zwiększa
// prawdopodobieństwo trafienia lepszych przedmiotów"): a stake of `step`
// gold or more, always in steps of it, from one step and one more every
// levelsPerStep levels, up to the last below what an item of topRarity
// fetches at the scrapper at the character's level. Each character has one
// pool a day, the same at every stake: the tiers' prizes,
// mostly weak (camp resources, common materials and items), a few fair, one
// good and one great (a legendary item, now and then a mythic one). At the
// lowest stake 70% of the spins give nothing, at the highest 60% (the
// author's 586: "nie 50/50 tylko 70/30 gdzie 70% to nic nietrafione na
// najniższej stawce i rośnie wraz ze stawką do 60/40 i szansą na lepsze
// przedmioty"), and the stake moves the rest from the weak prizes at the
// lowest stake towards the great one at the highest. A prize won leaves the
// pool for the day, and a tier with none left gives nothing. On average a
// spin gives back less than its stake ("nigdy nie zarobisz więcej, chyba że
// masz farta dużo").
//
// Stored state: the character's Wheel of the day in its Osada (`casino`:
// { day, basis, won }, see wheelDay), from which the day's pool is drawn
// again when asked; the tickets and the draws are the server's tables. The
// server gives the time and the seeds.

import { builderSpirit } from './builder-spirit.js';
import { materialPrice, parseStack, stackKey } from './crafting.js';
import { randomItem, sellPrice } from './items.js';
import { questPeriod } from './quests.js';
import { createRng } from './rng.js';
import { areaUnlocked } from './unlocks.js';

const tuning = (content) => content.settlement.casino;
const rarityIndex = (rarityId, content) => content.rarities.findIndex((rarity) => rarity.id === rarityId);

// The day of both games: the narrator's day, from Polish midnight to the
// next ({ key, startsAt, endsAt }).
export const casinoDay = (now, content) => questPeriod('daily', now, content);

// The Loteria's pot with `tickets` tickets of the day: the System's base and
// every ticket's price (the author: "baza 100 sztuk złota"). It is paid only
// when the day has a ticket.
export const lotteryPot = (tickets, content) => tuning(content).lottery.base + tuning(content).lottery.ticket * tickets;

// The ticket that wins a day's draw among `count` (as the server lists them,
// by character), from the draw's own seed; null with none.
export const lotteryWinner = (count, seed) => (count > 0 ? createRng(seed).int(0, count - 1) : null);

// Why the character cannot buy today's ticket, or null: one a day, for its
// price.
export function ticketBlock({ gold, has }, content) {
  if (has) return { code: 'has_ticket', message: 'Masz już los na dziś. Następny kupisz jutro.' };
  if (gold < tuning(content).lottery.ticket) return { code: 'not_enough_gold', message: 'Brakuje złota na los.' };
  return null;
}

// The ordinary creatures' materials of the lands the character knows: the
// lands (krainy) with an inner region open to its class, each with the
// creatures of all its inner regions, elites and champions left out, as the
// Garbarnia and the orders leave out their trophies. In the data's order.
export function knownLandMaterials(character, content) {
  const lands = new Set(content.areas.filter((area) => areaUnlocked(area, character.classLevel ?? 1, content)).map((area) => area.land));
  const known = new Set();
  for (const area of content.areas.filter((one) => lands.has(one.land))) {
    for (const encounter of [...(area.encounters ?? []), ...(area.tough ?? [])]) {
      for (const monsterId of encounter.monsters) {
        const monster = content.monstersById[monsterId];
        const material = content.materialsByMonster[monsterId];
        if (monster && material && !monster.elite && !monster.champion) known.add(material.id);
      }
    }
  }
  return content.materials.filter((material) => known.has(material.id));
}

// What a prize is worth to the character, the most an NPC pays it for it:
// for an item the scrapper's price with the camp's Skup złomu (as the item's
// card says), for materials the Garbarnia's at the character's relation with
// the tanner (the scrapper's price with the Skup and the tanner's premium),
// for the camp's resources the Duch budowniczego's.
export function prizeWorth(prize, { sellBonus = 0, tanneryPremium = 0 } = {}, content) {
  if (prize.kind === 'item') return sellPrice(prize.item, content, sellBonus);
  if (prize.kind === 'resource') {
    const spirit = builderSpirit(content);
    return spirit ? (prize.count * (spirit.gold[prize.key] ?? 0)) / spirit.lot : 0;
  }
  return prize.count * materialPrice(parseStack(prize.key).rarityId, content) * (1 + sellBonus) * (1 + tanneryPremium);
}

// The Wheel's tiers of prizes, from the weakest to the best.
const tiersOf = (content) => tuning(content).wheel.tiers;

// The stakes the Wheel takes from the character, in steps of `step` gold:
// from one step, and one more for every levelsPerStep levels (the prizes
// grow with the level, and a spin at the lowest stake must still give back
// less than it takes), to the last below what the scrapper pays it for an
// item of topRarity at its level, with the Skup złomu (so the great prize is
// worth more than any stake); at least the first, never past maxSteps.
export function wheelStakes(level, sellBonus, content) {
  const { step, maxSteps, topRarity, levelsPerStep } = tuning(content).wheel;
  const first = Math.max(1, Math.floor(level / levelsPerStep));
  const top = sellPrice({ level, rarity: topRarity }, content, sellBonus);
  const last = Math.max(first, Math.min(maxSteps, Math.ceil(top / step) - 1));
  return Array.from({ length: last - first + 1 }, (_, index) => (first + index) * step);
}

// The chances of a spin at `stake` among the day's `stakes`: nothing and
// each tier from their `low` at the lowest stake to their `high` at the
// highest, evenly between; a single stake is the highest.
export function wheelOdds(stake, stakes, content) {
  const { none } = tuning(content).wheel;
  const at = stakes.length > 1 ? Math.max(0, stakes.indexOf(stake)) / (stakes.length - 1) : 1;
  const along = ({ low, high }) => low + (high - low) * at;
  return { none: along(none), tiers: tiersOf(content).map((tier) => ({ id: tier.id, chance: along(tier) })) };
}

// An item prize of the character's class at its level, of `rarityId`, of a
// base not in the pool yet (`used`) in a few draws.
function itemPrize(tier, basis, rarityId, rng, used, content) {
  let item = null;
  for (let draw = 0; draw < 5; draw += 1) {
    item = randomItem(basis.level, rng, content, { classId: basis.classId, maxClassLevel: basis.classLevel ?? 1, rarityId });
    if (!used.has(`base:${item.base}`)) break;
  }
  used.add(`base:${item.base}`);
  return { kind: 'item', tier, item };
}

// A material prize: `count` pieces of one of the lands' materials at
// `rarityId`, of a species no rarer than that, one not in the pool yet
// (`used`) while there is one; null when the lands have none.
function materialPrize(tier, basis, rarityId, count, rng, used, content) {
  const at = rarityIndex(rarityId, content);
  const fitting = knownLandMaterials(basis, content).filter((material) => rarityIndex(material.rarity, content) <= at);
  if (fitting.length === 0) return null;
  const fresh = fitting.filter((material) => !used.has(`material:${material.id}`));
  const material = rng.pick(fresh.length > 0 ? fresh : fitting);
  used.add(`material:${material.id}`);
  return { kind: 'material', tier, key: stackKey(material.id, rarityId), count };
}

// A resource prize: resourcePerLevel pieces a level of the character of one
// of the camp's resources not in the pool yet; null when each of them is.
function resourcePrize(tier, basis, rng, used, content) {
  const fresh = content.resources.filter((resource) => !used.has(`resource:${resource.id}`));
  if (fresh.length === 0) return null;
  const resource = rng.pick(fresh);
  used.add(`resource:${resource.id}`);
  return { kind: 'resource', tier, key: resource.id, count: Math.max(1, Math.round(tuning(content).wheel.resourcePerLevel * basis.level)) };
}

// One prize of a tier, none of the same kind as one already in the pool while
// the pool can help it (`used`: the items' bases, the materials and the
// resources drawn). A weak one: camp resources, common materials of the
// lands the character knows or a common item, by weakKinds (with each
// resource in the pool, materials or an item instead); a fair one: a rare or
// unique item, or a piece or two of such materials; a good one: an epic
// item; a great one: a legendary item, at mythicChance a mythic one.
function drawPrize(tier, basis, rng, used, content) {
  const wheel = tuning(content).wheel;
  const between = ([least, most]) => rng.int(least, most);
  if (tier === 'great') return itemPrize(tier, basis, rng.chance(wheel.mythicChance) ? wheel.mythicRarity : wheel.greatRarity, rng, used, content);
  if (tier === 'good') return itemPrize(tier, basis, wheel.goodRarity, rng, used, content);
  if (tier === 'fair') {
    const rarityId = rng.pick(wheel.fairRarities);
    const material = rng.chance(0.5) ? materialPrize(tier, basis, rarityId, between(wheel.fairMaterials), rng, used, content) : null;
    return material ?? itemPrize(tier, basis, rarityId, rng, used, content);
  }
  const common = content.rarities[0].id;
  const draws = {
    item: () => itemPrize(tier, basis, common, rng, used, content),
    material: () => materialPrize(tier, basis, common, between(wheel.weakMaterials), rng, used, content),
    resource: () => resourcePrize(tier, basis, rng, used, content),
  };
  const kind = rng.weighted(Object.entries(wheel.weakKinds).map(([id, weight]) => ({ id, weight }))).id;
  return draws[kind]() ?? draws.material() ?? draws.item();
}

// The character's pool of the day (the author: "pula niezależna od stawki i
// dominuje gówno (powiedzmy 10 z 15 przedmiotów - nawet zasoby), ze 3 okey
// przedmioty, 1 spoko i 1 super"), the same at every stake, drawn from the
// character's seed and the day: each tier's `count` prizes, the best first.
// `basis` is the character as the day's Wheel keeps it (wheelDay).
export function wheelPrizes(basis, seed, day, content) {
  const rng = createRng(`${seed}:wheel:${day}`);
  const used = new Set();
  return [...tiersOf(content)].reverse().flatMap((tier) => Array.from({ length: tier.count }, () => drawPrize(tier.id, basis, rng, used, content)));
}

// The character's Wheel of the day: the day, the basis its pool is drawn
// from (the character at its first look that day: { level, classId,
// classLevel, sellBonus, tanneryPremium }) and the places won in the pool.
// Kept in the Osada for the day, so the stakes and the prizes stay what they
// were when the character levels up; a new day starts from `basis`, the
// character now. A day kept with a pool for each stake (up to 0.1.34) starts
// its one pool anew.
export function wheelDay(stored, basis, now, content) {
  const day = casinoDay(now, content).key;
  return stored?.day === day && stored.basis ? { day, basis: stored.basis, won: Array.isArray(stored.won) ? stored.won : [] } : { day, basis, won: [] };
}

// The stakes of the character's Wheel of the day.
export const dayStakes = (wheel, content) => wheelStakes(wheel.basis.level, wheel.basis.sellBonus, content);

// The character's pool of the day: its prizes and the places won
// ({ prizes, won }). `seed` is the character's own.
export const wheelPool = (wheel, seed, content) => ({ prizes: wheelPrizes(wheel.basis, seed, wheel.day, content), won: wheel.won });

// The Wheel of the day with a prize of the pool won.
export const wheelWon = (wheel, place) => ({ ...wheel, won: [...wheel.won, place] });

// The prizes still in the pool, by their place in it.
export const prizesLeft = (pool) => pool.prizes.map((_, index) => index).filter((index) => !pool.won.includes(index));

// Why the Wheel cannot spin at `stake` now, or null: one of the character's
// stakes (wheelStakes), a prize left, the gold for it, and a free place in
// the bag while an item waits in the pool.
export function spinBlock(stake, { gold, left, itemLeft, bagFree, stakes }, content) {
  const { step } = tuning(content).wheel;
  if (!Number.isInteger(stake) || !stakes.includes(stake)) return { code: 'invalid_stake', message: `Postaw od ${step} do ${stakes.at(-1)} zł, setkami.` };
  if (left === 0) return { code: 'empty', message: 'Koło rozdało już całą dzisiejszą pulę. Nowa przyjdzie po północy.' };
  if (gold < stake) return { code: 'not_enough_gold', message: 'Brakuje złota na taką stawkę.' };
  if (itemLeft && bagFree < 1) return { code: 'bag_full', message: 'Plecak jest pełny, a w puli czeka przedmiot. Zrób w plecaku miejsce.' };
  return null;
}

// A spin from its own `seed` (the server's, unknown before it) at the
// stake's chances (wheelOdds): nothing at `none`, or else a tier; a tier
// whose prizes are all won gives nothing either, otherwise one of its prizes
// left, each as likely.
export function spinWheel(pool, odds, seed) {
  const rng = createRng(seed);
  let roll = rng.next() - odds.none;
  if (roll < 0) return { win: false, tier: null, prize: null };
  const tier = odds.tiers.find((one) => (roll -= one.chance) < 0) ?? odds.tiers.at(-1);
  const left = prizesLeft(pool).filter((index) => pool.prizes[index].tier === tier.id);
  return left.length > 0 ? { win: true, tier: tier.id, prize: left[rng.int(0, left.length - 1)] } : { win: false, tier: tier.id, prize: null };
}

// What a spin at the stake's chances gives back on average, at the worth of
// the prizes left (`worthOf`), less the stake: below 0, so the Wheel gives
// back less than it takes.
export function spinExpectation(stake, pool, odds, worthOf) {
  const left = prizesLeft(pool);
  const back = odds.tiers.reduce((sum, tier) => {
    const worths = left.filter((index) => pool.prizes[index].tier === tier.id).map((index) => worthOf(pool.prizes[index]));
    return worths.length > 0 ? sum + (tier.chance * worths.reduce((total, worth) => total + worth, 0)) / worths.length : sum;
  }, 0);
  return back - stake;
}

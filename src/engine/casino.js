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
// The Koło Fortuny (525 A, 526 A, 542 C): a stake of `step` gold or more,
// always in steps of it (the author: "100 złotych to start, ale można grać
// więcej co 100 złotych i zmienia to dostępną pulę"), the chance of a win
// always `chance`, the stake gone on a loss. Every stake has its own pool of
// `prizes` prizes a day for each character, drawn from the character, the
// day and the stake: items of its class at its level, or very rare materials
// of the lands it knows, each worth more than the stake and no more than a
// win costs on average (the stake over the chance), so the Wheel never gives
// back more gold than it takes ("nigdy nie zarobisz więcej, chyba że masz
// farta dużo"). The stakes go up to the highest at which an item prize,
// itemRarity to topItemRarity, still fits ("skalowanie złota wraz z
// dostępnymi wygranymi"); the rarest items wait at that top stake alone,
// every lower one has items up to belowTopItemRarity (554 B: legendary items
// only at the day's top stake). A win takes one of the stake's prizes left;
// an empty pool waits for midnight.
//
// Stored state: the character's Wheel of the day in its Osada (`casino`:
// { day, basis, won }, see wheelDay), from which every stake's pool is drawn
// again when asked; the tickets and the draws are the server's tables. The
// server gives the time and the seeds.

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

// The chance of a win, the same at every stake (542 C).
export const wheelChance = (content) => tuning(content).wheel.chance;

// What a win at `stake` costs on average: the stake over its chance (at 10%,
// ten stakes).
export const winCost = (stake, content) => stake / wheelChance(content);

// The most a prize of `stake` is worth: `worthCap` stakes (two, as when the
// chance was 50%), and never more than a win costs, so a lower chance makes
// the Wheel give back less instead of bigger prizes (the author: "Koło
// fortuny proszę znerfić mocno i dać 10% szans").
export const prizeCap = (stake, content) => Math.min(winCost(stake, content), stake * tuning(content).wheel.worthCap);

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
// the tanner (the scrapper's price with the Skup and the tanner's premium).
export function prizeWorth(prize, { sellBonus = 0, tanneryPremium = 0 } = {}, content) {
  if (prize.kind === 'item') return sellPrice(prize.item, content, sellBonus);
  return prize.count * materialPrice(parseStack(prize.key).rarityId, content) * (1 + sellBonus) * (1 + tanneryPremium);
}

// The rarity of an item prize at a stake and the character's level: the
// rarest from itemRarity to `rarest` (topItemRarity unless given) worth more
// than the stake at the character's scrapper and no more than the prize cap;
// null when none is.
export function itemPrizeRarity(level, sellBonus, stake, content, rarest = tuning(content).wheel.topItemRarity) {
  const { itemRarity } = tuning(content).wheel;
  const most = prizeCap(stake, content);
  const fitting = content.rarities.slice(rarityIndex(itemRarity, content), rarityIndex(rarest, content) + 1).filter((rarity) => {
    const worth = sellPrice({ level, rarity: rarity.id }, content, sellBonus);
    return worth > stake && worth <= most;
  });
  return fitting.at(-1)?.id ?? null;
}

// The stakes the Wheel takes from the character: `step` gold and up in
// steps of it, to the highest at which an item prize still fits (and never
// past maxSteps steps); at least the first.
export function wheelStakes(level, sellBonus, content) {
  const { step, maxSteps } = tuning(content).wheel;
  let top = 1;
  for (let steps = 1; steps <= maxSteps; steps += 1) if (itemPrizeRarity(level, sellBonus, steps * step, content)) top = steps;
  return Array.from({ length: top }, (_, index) => (index + 1) * step);
}

// The rarity of the item prizes in a stake's pool: up to topItemRarity at
// the character's top stake, up to belowTopItemRarity at every lower one
// (the author: "554 B", legendary items only at the day's top stake); null
// when no item fits.
export function stakeItemRarity(level, sellBonus, stake, content) {
  const { topItemRarity, belowTopItemRarity } = tuning(content).wheel;
  const top = wheelStakes(level, sellBonus, content).at(-1);
  return itemPrizeRarity(level, sellBonus, stake, content, stake === top ? topItemRarity : belowTopItemRarity);
}

// A material prize: pieces of `material` at the grade drawn (never below
// its species' own rarity), the fewest worth more than the stake to the
// character; null when they would be worth more than the prize cap.
function materialPrize(material, gradeId, bonuses, stake, content) {
  const rarityId = rarityIndex(material.rarity, content) > rarityIndex(gradeId, content) ? material.rarity : gradeId;
  const key = stackKey(material.id, rarityId);
  const piece = prizeWorth({ kind: 'material', key, count: 1 }, bonuses, content);
  const count = Math.floor(stake / piece) + 1;
  return count * piece <= prizeCap(stake, content) ? { kind: 'material', key, count } : null;
}

// The pool of a stake (526 A: "każda postać ma własną pulę 5 nagród na
// dzień"; 542 C: every stake its own), drawn from the character's seed, the
// day and the stake: the first prize an item of its class at its level, of
// stakeItemRarity, whenever one fits, so that a pool with items has at
// least one, and every other an item at itemChance, or else very rare
// materials of the lands it knows (materialRarities, by weight). `basis` is
// the character as the day's Wheel keeps it (wheelDay).
export function wheelPrizes(basis, seed, stake, day, content) {
  const { wheel } = tuning(content);
  const rng = createRng(`${seed}:wheel:${day}:${stake}`);
  const bonuses = { sellBonus: basis.sellBonus, tanneryPremium: basis.tanneryPremium };
  const itemRarity = stakeItemRarity(basis.level, basis.sellBonus, stake, content);
  const materials = knownLandMaterials(basis, content);
  const grades = Object.entries(wheel.materialRarities).map(([id, weight]) => ({ id, weight }));
  const prizes = [];
  // A creature's material once a pool, while the lands have others.
  const used = new Set();
  for (let index = 0; index < wheel.prizes; index += 1) {
    if (itemRarity && (index === 0 || materials.length === 0 || rng.chance(wheel.itemChance))) {
      const item = randomItem(basis.level, rng, content, { classId: basis.classId, maxClassLevel: basis.classLevel ?? 1, rarityId: itemRarity });
      prizes.push({ kind: 'item', item });
    } else if (materials.length > 0) {
      const fresh = materials.filter((material) => !used.has(material.id));
      const material = rng.pick(fresh.length > 0 ? fresh : materials);
      used.add(material.id);
      const prize = materialPrize(material, rng.weighted(grades).id, bonuses, stake, content);
      if (prize) prizes.push(prize);
    }
  }
  return prizes;
}

// The character's Wheel of the day: the day, the basis its pools are drawn
// from (the character at its first look that day: { level, classId,
// classLevel, sellBonus, tanneryPremium }) and the places won in each
// stake's pool ({ [stake]: [places] }). Kept in the Osada for the day, so
// the stakes and the prizes stay what they were when the character levels
// up; a new day starts from `basis`, the character now.
export function wheelDay(stored, basis, now, content) {
  const day = casinoDay(now, content).key;
  return stored?.day === day && stored.basis ? { day, basis: stored.basis, won: stored.won ?? {} } : { day, basis, won: {} };
}

// The stakes of the character's Wheel of the day.
export const dayStakes = (wheel, content) => wheelStakes(wheel.basis.level, wheel.basis.sellBonus, content);

// A stake's pool of the character's Wheel of the day: its prizes and the
// places won ({ prizes, won }). `seed` is the character's own.
export const wheelPool = (wheel, seed, stake, content) => ({ prizes: wheelPrizes(wheel.basis, seed, stake, wheel.day, content), won: wheel.won[stake] ?? [] });

// The Wheel of the day with a prize of a stake's pool won.
export const wheelWon = (wheel, stake, place) => ({ ...wheel, won: { ...wheel.won, [stake]: [...(wheel.won[stake] ?? []), place] } });

// The prizes still in the pool, by their place in it.
export const prizesLeft = (pool) => pool.prizes.map((_, index) => index).filter((index) => !pool.won.includes(index));

// Why the Wheel cannot spin at `stake` now, or null: one of the character's
// stakes (wheelStakes), a prize left, the gold for it, and a free place in
// the bag while an item waits in the pool.
export function spinBlock(stake, { gold, left, itemLeft, bagFree, stakes }, content) {
  const { step } = tuning(content).wheel;
  if (!Number.isInteger(stake) || !stakes.includes(stake)) return { code: 'invalid_stake', message: `Postaw od ${step} do ${stakes.at(-1)} zł, setkami.` };
  if (left === 0) return { code: 'empty', message: 'Koło rozdało już dzisiejszą pulę przy tej stawce. Nowa przyjdzie po północy.' };
  if (gold < stake) return { code: 'not_enough_gold', message: 'Brakuje złota na taką stawkę.' };
  if (itemLeft && bagFree < 1) return { code: 'bag_full', message: 'Plecak jest pełny, a w puli czeka przedmiot. Zrób w plecaku miejsce.' };
  return null;
}

// A spin from the spin's own `seed` (the server's, unknown before it): a win
// under the chance takes one of the prizes left (`left`, their places in the
// pool), each as likely; a loss takes none.
export function spinWheel(left, seed, content) {
  const rng = createRng(seed);
  const win = left.length > 0 && rng.next() < wheelChance(content);
  return { win, prize: win ? left[rng.int(0, left.length - 1)] : null };
}

// What a spin at `stake` gives back on average in gold, at the worth of the
// prizes left (`worths`), less the stake: never more than 0, as no prize is
// worth more than a win costs.
export function spinExpectation(stake, worths, content) {
  if (worths.length === 0) return -stake;
  const average = worths.reduce((sum, worth) => sum + worth, 0) / worths.length;
  return wheelChance(content) * average - stake;
}

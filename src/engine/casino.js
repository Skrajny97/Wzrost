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
// The Koło Fortuny (525 A, 526 A): a stake of whole gold, the chance of a
// win growing with it (chancePerGold a coin: 100 zł 50%, 10 zł 5%), the
// stake gone on a loss. Every character has its own pool of `prizes` prizes
// a day, drawn from the character and the day: items of its class at its
// level, or very rare materials of the lands it knows. A win takes one of
// the prizes left; an empty pool waits for midnight. A win costs on average
// the stake over its chance, 1 / chancePerGold gold at any stake, and no
// prize is worth more to the character than that, so the Wheel never gives
// back more gold than it takes.
//
// Stored state: the day's pool in the character's Osada (`casino`: { day,
// prizes, won }); the tickets and the draws are the server's tables. The
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

// The chance of a win at a stake of `stake` gold (525 A: "100 zł → 50%,
// 50 zł → 25%, 10 zł → 5%").
export const wheelChance = (stake, content) => stake * tuning(content).wheel.chancePerGold;

// What a win costs on average, the same at any stake: the stake over its
// chance (200 zł). No prize is worth more.
export const winCost = (content) => Math.round(1 / tuning(content).wheel.chancePerGold);

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

// The rarity of an item prize at the character's level: the rarest, from
// itemRarity up, worth more than prizeOver gold at the character's scrapper
// and no more than a win costs; null when none is.
export function itemPrizeRarity(level, sellBonus, content) {
  const { itemRarity, prizeOver } = tuning(content).wheel;
  const most = winCost(content);
  const fitting = content.rarities.slice(rarityIndex(itemRarity, content)).filter((rarity) => {
    const worth = sellPrice({ level, rarity: rarity.id }, content, sellBonus);
    return worth > prizeOver && worth <= most;
  });
  return fitting.at(-1)?.id ?? null;
}

// A material prize: pieces of `material` at the grade drawn (never below
// its species' own rarity), the fewest worth more than prizeOver gold to
// the character; null when they would be worth more than a win costs.
function materialPrize(material, gradeId, bonuses, content) {
  const { prizeOver } = tuning(content).wheel;
  const rarityId = rarityIndex(material.rarity, content) > rarityIndex(gradeId, content) ? material.rarity : gradeId;
  const key = stackKey(material.id, rarityId);
  const piece = prizeWorth({ kind: 'material', key, count: 1 }, bonuses, content);
  const count = Math.floor(prizeOver / piece) + 1;
  return count * piece <= winCost(content) ? { kind: 'material', key, count } : null;
}

// The character's pool of the day (526 A: "każda postać ma własną pulę 5
// nagród na dzień"), drawn from its seed and the day: each prize an item
// (itemChance) of its class at its level, of itemPrizeRarity, or else very
// rare materials of the lands it knows (materialRarities, by weight).
// `character` is { level, classId, classLevel }, and `sellBonus` and
// `tanneryPremium` are the character's (prizeWorth). Kept for the day once
// drawn, so the prizes stay what they were when the character levels up.
export function wheelPrizes({ character, seed, sellBonus = 0, tanneryPremium = 0 }, now, content) {
  const { wheel } = tuning(content);
  const day = casinoDay(now, content);
  const rng = createRng(`${seed}:wheel:${day.key}`);
  const bonuses = { sellBonus, tanneryPremium };
  const itemRarity = itemPrizeRarity(character.level, sellBonus, content);
  const materials = knownLandMaterials(character, content);
  const grades = Object.entries(wheel.materialRarities).map(([id, weight]) => ({ id, weight }));
  const prizes = [];
  // A creature's material once a pool, while the lands have others.
  const used = new Set();
  for (let index = 0; index < wheel.prizes; index += 1) {
    if (itemRarity && (materials.length === 0 || rng.chance(wheel.itemChance))) {
      const item = randomItem(character.level, rng, content, { classId: character.classId, maxClassLevel: character.classLevel ?? 1, rarityId: itemRarity });
      prizes.push({ kind: 'item', item });
    } else if (materials.length > 0) {
      const fresh = materials.filter((material) => !used.has(material.id));
      const material = rng.pick(fresh.length > 0 ? fresh : materials);
      used.add(material.id);
      const prize = materialPrize(material, rng.weighted(grades).id, bonuses, content);
      if (prize) prizes.push(prize);
    }
  }
  return { day: day.key, prizes, won: [] };
}

// The pool stored in the character's Osada when it is today's, or null.
export const wheelToday = (stored, now, content) => (stored?.day === casinoDay(now, content).key && Array.isArray(stored.prizes) ? { won: [], ...stored } : null);

// The prizes still in the pool, by their place in it.
export const prizesLeft = (pool) => pool.prizes.map((_, index) => index).filter((index) => !pool.won.includes(index));

// Why the Wheel cannot spin at `stake` now, or null: a stake of whole gold
// from minStake to maxStake, a prize left, the gold for it, and a free place
// in the bag while an item waits in the pool.
export function spinBlock(stake, { gold, left, itemLeft, bagFree }, content) {
  const { minStake, maxStake } = tuning(content).wheel;
  if (!Number.isInteger(stake) || stake < minStake || stake > maxStake) return { code: 'invalid_stake', message: `Postaw od ${minStake} do ${maxStake} zł.` };
  if (left === 0) return { code: 'empty', message: 'Koło rozdało już dzisiejszą pulę. Nowa przyjdzie po północy.' };
  if (gold < stake) return { code: 'not_enough_gold', message: 'Brakuje złota na taką stawkę.' };
  if (itemLeft && bagFree < 1) return { code: 'bag_full', message: 'Plecak jest pełny, a w puli czeka przedmiot. Zrób w plecaku miejsce.' };
  return null;
}

// A spin at `stake` from the spin's own `seed` (the server's, unknown before
// it): a win under the chance takes one of the prizes left (`left`, their
// places in the pool), each as likely; a loss takes none.
export function spinWheel(stake, left, seed, content) {
  const rng = createRng(seed);
  const win = left.length > 0 && rng.next() < wheelChance(stake, content);
  return { win, prize: win ? left[rng.int(0, left.length - 1)] : null };
}

// What a spin at `stake` gives back on average in gold, at the worth of the
// prizes left (`worths`), less the stake: never more than 0, as no prize is
// worth more than a win costs.
export function spinExpectation(stake, worths, content) {
  if (worths.length === 0) return -stake;
  const average = worths.reduce((sum, worth) => sum + worth, 0) / worths.length;
  return wheelChance(stake, content) * average - stake;
}

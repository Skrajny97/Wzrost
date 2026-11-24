// @ts-check
// The World Bosses (1222–1226, all variant A, accepted by the author on the
// review page; data/world-bosses.json; src/server/world-boss.js;
// DECISIONS.md, "Postrach Krainy (1222–1226)" and "Postrach Krainy co 3 dni
// (24.11.2026)"): in each period, one boss for each band of levels, with one
// HP bar shared by all the band's players. A period is a week, Monday to
// Sunday, before `cycle.from`, and `cycle.days` Polish days in a row from
// it on (worldBossPeriod). The bands are the lands of data/regions.json in order
// (1–25, 26–50, … 326–350), each with its own boss; a character above the
// last one fights the last band's boss. A character's band goes by the
// higher of its two levels, the character's and the class's (as the item
// level lock), and its attacks fight the boss at that level, kept inside
// the band. An attack is one fight of the character with the companions
// who would go on an exploration with it, at full HP and without potions,
// against the boss with the HP it has left; what the boss loses comes off
// the shared bar. The boss's HP: attacksPerPlayer average attacks (the
// measured `damage`) for each active character of the band when it came,
// each at its level in the band. Whoever hit it gets a Skrzynia Bossa when
// it falls or its period ends: the more damage against the character's
// share of the HP, the bigger the chest (gold, the band's land's elite and
// champion materials, a chance at an item of the land), half as big when
// the boss lived through its period; the last blow puts an item and more
// gold in it, and the best `title.places` of a fallen boss wear its title
// to the end of the next period. No Punkty Systemu (1224). Pure: the time,
// the seeds and the database's state come from the server.

import { simulateFight } from './combat.js';
import { combatantView, monsterCombatant, playerCombatant } from './combatant.js';
import { companionCombatant } from './companions.js';
import { materialPiece, rarityUpChances } from './crafting.js';
import { championItemRarity } from './hunt.js';
import { randomItem } from './items.js';
import { explorationGold } from './mining.js';
import { questPeriod, zoneClock, zoneMidnight } from './quests.js';
import { createRng } from './rng.js';

const DAY = 86400000;

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {Record<string, any>} Boss A boss of data/world-bosses.json `bosses`. */
/** @typedef {{ region: string, minLevel: number, maxLevel: number, last: boolean, boss: Boss }} Band A band of levels: a land with its boss; `last` the band of every level above it too. */
/** @typedef {{ id: string, share: number, goldMinutes: number, elite: number, champion: number, itemChance: number }} BossChestTier A chest of data/world-bosses.json `chests`. */

/**
 * @param {Content} content
 * @returns {Record<string, any>}
 */
const rules = (content) => content.worldBosses;

/**
 * The bands, the lands with a boss in the order of data/regions.json.
 * @param {Content} content
 * @returns {Band[]}
 */
export function worldBossBands(content) {
  /** @type {Boss[]} */
  const bosses = rules(content)?.bosses ?? [];
  const byRegion = new Map(bosses.map((boss) => [boss.region, boss]));
  const regions = content.regions.filter((/** @type {{ id: string }} */ region) => byRegion.has(region.id));
  return regions.map((/** @type {{ id: string, minLevel: number, maxLevel: number }} */ region, /** @type {number} */ index) => ({
    region: region.id,
    minLevel: region.minLevel,
    maxLevel: region.maxLevel,
    last: index === regions.length - 1,
    boss: /** @type {Boss} */ (byRegion.get(region.id)),
  }));
}

/**
 * The level a character's band and attacks go by: the higher of its level
 * and its class level.
 * @param {number} level
 * @param {number} classLevel
 * @returns {number}
 */
export const worldBossLevelOf = (level, classLevel) => Math.max(level, classLevel ?? 0);

/**
 * The days since 1.1.1970 of the calendar day the zone's clock shows at
 * `ms`.
 * @param {number} ms
 * @param {string} timeZone
 * @returns {number}
 */
function zoneDayNumber(ms, timeZone) {
  const { year, month, day } = zoneClock(ms, timeZone);
  return Math.round(Date.UTC(year, month - 1, day) / DAY);
}

/**
 * The World Boss's period at `now`, the same for every band, on the Polish
 * clock (the quests' time zone): before `cycle.from` the week, Monday to
 * Sunday, as the weekly quests have it, the last one ending at that day's
 * midnight at the latest; from that day on `cycle.days` days in a row,
 * counted from it (the author, 24.11.2026: a boss every 3 days, from Friday
 * 27.11.2026, 0:00: „Jak w poniedziałek, jak 3 dni od dzisiaj to piątek”;
 * the week of 23.11 ends there, with its key). No period runs past that
 * day's midnight. `key`: the date of its
 * first day, as the weekly quests' keys, so the keys sort as the periods
 * do; `startsAt` and `endsAt`: its first and its last midnight.
 * @param {number} now
 * @param {Content} content
 * @returns {{ key: string, startsAt: number, endsAt: number }}
 */
export function worldBossPeriod(now, content) {
  const { timeZone } = content.quests;
  const { days, from } = rules(content).cycle;
  const [year, month, day] = String(from).split('-').map(Number);
  const first = Math.round(Date.UTC(year, month - 1, day) / DAY);
  const today = zoneDayNumber(now, timeZone);
  if (today < first) {
    const week = questPeriod('weekly', now, content);
    return { ...week, endsAt: Math.min(week.endsAt, zoneMidnight(now, timeZone, first - today)) };
  }
  const back = (today - first) % days;
  const startsAt = zoneMidnight(now, timeZone, -back);
  const start = zoneClock(startsAt, timeZone);
  const key = `${start.year}-${String(start.month).padStart(2, '0')}-${String(start.day).padStart(2, '0')}`;
  return { key, startsAt, endsAt: zoneMidnight(now, timeZone, days - back) };
}

/**
 * A character's band now (its levels), the last one above them all; null
 * without bosses.
 * @param {number} level
 * @param {number} classLevel
 * @param {Content} content
 * @returns {Band | null}
 */
export function worldBossBand(level, classLevel, content) {
  const bands = worldBossBands(content);
  const at = worldBossLevelOf(level, classLevel);
  return bands.find((band) => at <= band.maxLevel) ?? bands.at(-1) ?? null;
}

/**
 * A band by its land.
 * @param {string} region
 * @param {Content} content
 * @returns {Band | null}
 */
export const worldBossBandOf = (region, content) => worldBossBands(content).find((band) => band.region === region) ?? null;

/**
 * A level kept inside a band: at least its first, at most its last but in
 * the last band, which has no top.
 * @param {Band} band
 * @param {number} level
 * @returns {number}
 */
export const bandLevel = (band, level) => Math.max(band.minLevel, band.last ? level : Math.min(band.maxLevel, level));

/**
 * The average damage of one attack at `level`, from the measured levels:
 * between two of them on the line between, below the first as at the
 * first, above the last in proportion to the level.
 * @param {number} level
 * @param {Content} content
 * @returns {number}
 */
export function worldBossDamage(level, content) {
  /** @type {[number, number][]} */
  const points = rules(content).damage;
  const [firstLevel, firstDamage] = points[0];
  if (level <= firstLevel) return firstDamage;
  const [lastLevel, lastDamage] = points[points.length - 1];
  if (level >= lastLevel) return (lastDamage * level) / lastLevel;
  const next = points.findIndex(([at]) => at >= level);
  const [fromLevel, fromDamage] = points[next - 1];
  const [toLevel, toDamage] = points[next];
  return fromDamage + ((toDamage - fromDamage) * (level - fromLevel)) / (toLevel - fromLevel);
}

/**
 * A band's boss of the week, from the levels (worldBossLevelOf) of the
 * band's active characters when it comes: attacksPerPlayer average attacks
 * for each of them, at its level in the band; with nobody, for one at the
 * band's middle. `players` the characters counted, `level` their average
 * level in the band.
 * @param {Band} band
 * @param {number[]} levels
 * @param {Content} content
 * @returns {{ boss: string, players: number, level: number, maxHp: number }}
 */
export function worldBossHp(band, levels, content) {
  const counted = levels.map((level) => bandLevel(band, level));
  const used = counted.length > 0 ? counted : [Math.round((band.minLevel + band.maxLevel) / 2)];
  const total = used.reduce((sum, level) => sum + worldBossDamage(level, content), 0);
  return {
    boss: band.boss.id,
    players: counted.length,
    level: Math.round(used.reduce((sum, level) => sum + level, 0) / used.length),
    maxHp: Math.max(1, Math.round(rules(content).hp.attacksPerPlayer * total)),
  };
}

/**
 * The share of the boss's HP that falls to one active character, which its
 * chest goes by: its HP over the characters counted when it came, at least
 * two of them, so a player alone in its band, who fells the boss by itself,
 * reaches the biggest chest too.
 * @param {{ maxHp: number, players: number }} boss
 * @returns {number}
 */
export const worldBossPart = ({ maxHp, players }) => maxHp / Math.max(2, players);

/**
 * The boss as a creature of the fights (monsterCombatant): its own blow and
 * stats, a champion (no blow that kills below some HP takes it), its HP from
 * the bar.
 * @param {Boss} boss
 * @returns {Record<string, any>}
 */
export const worldBossCreature = (boss) => ({ ...boss, champion: true, hpFactor: 1, reward: { xp: 0, gold: 0 } });

/**
 * The place of a band's land whose creatures fight there and name its
 * items: the land's champion's, else its last.
 * @param {string} region
 * @param {Content} content
 * @returns {Record<string, any>}
 */
export function worldBossArea(region, content) {
  const land = content.regionsById[region];
  return land.areas.find((/** @type {{ champion?: string | null }} */ area) => area.champion) ?? land.areas.at(-1);
}

/**
 * One attack: the character (at full HP, no potions) and its companions
 * against the boss (`boss`: its id in the data, its band's land, the level
 * it fights at, its HP left and its most HP), the land's trait counting.
 * Alone, the boss has only soloGrowth of the late game's growth, as an
 * event's foe; it keeps its own measure otherwise (no class level curve,
 * as the Bestia Gildii). The fight ends when a side is down or after the
 * most actions a fight has. The damage is what the boss lost, never more
 * than it had. No XP, gold or loot. Returns the damage, the HP left,
 * whether it fell, the fight's lines and its playback.
 * @param {{ character: Record<string, any>, equipped: Record<string, any>[], name: string, companions?: Record<string, any>[], boss: { id: string, region: string, level: number, hp: number, maxHp: number }, seed: unknown }} attack
 * @param {Content} content
 */
export function worldBossFight({ character, equipped, name, companions = [], boss, seed }, content) {
  const definition = content.worldBossesById[boss.id];
  const area = worldBossArea(boss.region, content);
  const player = playerCombatant(/** @type {any} */ ({ character, equipped, name, area }), content);
  const mates = companions.map((companion, index) => companionCombatant(/** @type {any} */ (companion), { area, id: `a${index + 1}`, classLevel: character.classLevel ?? 0 }, content));
  const unit = monsterCombatant(
    {
      monsterId: definition.id,
      monster: worldBossCreature(definition),
      level: boss.level,
      id: 'e0',
      growth: mates.length > 0 ? 1 : content.balance.monsters.soloGrowth,
      strength: [rules(content).power, 1],
      classLevel: character.classLevel ?? 0,
    },
    content,
  );
  const foe = { ...unit, maxHp: boss.maxHp, hp: boss.hp };
  const allies = [player, ...mates];
  const fight = simulateFight({ allies, enemies: [foe], rng: createRng(`${seed}:world-boss`), content, record: true, trait: area.trait });
  const left = /** @type {{ hp: number }} */ (fight.units.find((/** @type {{ id: string }} */ one) => one.id === foe.id)).hp;
  const damage = Math.min(boss.hp, Math.max(0, boss.hp - left));
  return {
    damage,
    hp: boss.hp - damage,
    fallen: boss.hp - damage <= 0,
    won: fight.won,
    actions: fight.actions,
    log: fight.events.map((event) => event.text),
    replay: {
      won: fight.won,
      allies: allies.map((ally) => combatantView(ally, boss.level, content)),
      enemies: [combatantView(foe, character.level, content)],
      events: fight.events,
    },
  };
}

/**
 * The chest a character's `damage` reaches against its share of the boss's
 * HP (`part`, worldBossPart): the last of the chests whose share it reached.
 * @param {number} damage
 * @param {number} part
 * @param {Content} content
 * @returns {BossChestTier}
 */
export function worldBossChestTier(damage, part, content) {
  /** @type {BossChestTier[]} */
  const chests = rules(content).chests;
  const share = part > 0 ? damage / part : 0;
  return chests.filter((chest) => share >= chest.share).at(-1) ?? chests[0];
}

/**
 * The damage each chest asks for against `part`, the smallest first.
 * @param {number} part
 * @param {Content} content
 * @returns {{ id: string, damage: number }[]}
 */
export const worldBossThresholds = (part, content) =>
  rules(content).chests.map((/** @type {BossChestTier} */ chest) => ({ id: chest.id, damage: Math.ceil(chest.share * part) }));

/**
 * Gold of `minutes` of exploring at `level`, rounded to goldRound, at least
 * goldRound when there are any minutes.
 * @param {number} level
 * @param {number} minutes
 * @param {Content} content
 * @returns {number}
 */
function chestGold(level, minutes, content) {
  if (minutes <= 0) return 0;
  const round = rules(content).goldRound;
  return Math.max(round, Math.round((explorationGold(level, content) * minutes) / 60 / round) * round);
}

/**
 * What a character's chest holds but its draws: its chest (`tier`), its
 * gold (with the last blow's), the pieces of the land's elite and champion
 * materials, the chance of its item and whether the last blow adds one; half
 * of it but the last blow (which only a fallen boss has) when the boss lived
 * through the week: gold and the item's chance times `unbeaten`, the elite's
 * pieces rounded up, the champion's down. `level` the character's level in
 * the band (bandLevel).
 * @param {{ level: number, damage: number, part: number, fallen: boolean, lastBlow?: boolean }} chest
 * @param {Content} content
 */
export function worldBossChestPlan({ level, damage, part, fallen, lastBlow = false }, content) {
  const { unbeaten, lastBlow: blow } = rules(content);
  const tier = worldBossChestTier(damage, part, content);
  const factor = fallen ? 1 : unbeaten;
  const last = fallen && lastBlow;
  return {
    tier,
    fallen,
    gold: chestGold(level, tier.goldMinutes * factor, content) + (last ? chestGold(level, blow.goldMinutes, content) : 0),
    lastBlowGold: last ? chestGold(level, blow.goldMinutes, content) : 0,
    elite: fallen ? tier.elite : Math.ceil(tier.elite * factor),
    champion: fallen ? tier.champion : Math.floor(tier.champion * factor),
    itemChance: Math.min(1, tier.itemChance * factor),
    lastBlowItem: last && blow.item,
  };
}

/**
 * A character's Skrzynia Bossa (worldBossChestPlan, with its draws): the
 * pieces of the band's land's elite's and champion's materials, each as the
 * creature leaves it at `level` (a chance at a higher rarity), and the item
 * of the chest's chance and the last blow's: of the character's class
 * (`classId`, its gear key) and class level, of a champion's rarity, at
 * `level`, from the land (its creatures name the affixes), favouring the
 * slots it has empty. The same seed, the same chest.
 * @param {{ region: string, level: number, classId: string, classLevel: number, wornSlots?: string[], damage: number, part: number, fallen: boolean, lastBlow?: boolean, seed: unknown }} chest
 * @param {Content} content
 */
export function worldBossChest({ region, level, classId, classLevel, wornSlots = [], damage, part, fallen, lastBlow = false, seed }, content) {
  const plan = worldBossChestPlan({ level, damage, part, fallen, lastBlow }, content);
  const rng = createRng(`${seed}:world-boss-chest`);
  const land = content.regionsById[region];
  const area = worldBossArea(region, content);
  const chances = rarityUpChances(level, content);
  /** @type {Record<string, number>} */
  const materials = {};
  /** @param {string | null | undefined} monsterId @param {number} count */
  const pieces = (monsterId, count) => {
    const material = monsterId ? content.materialsByMonster[monsterId] : null;
    if (!material) return;
    for (let piece = 0; piece < count; piece++) {
      const key = materialPiece(material, chances, rng, content);
      materials[key] = (materials[key] ?? 0) + 1;
    }
  };
  pieces(land.elite, plan.elite);
  pieces(area.champion, plan.champion);
  const filled = new Set(wornSlots);
  const item = () => randomItem(level, rng, content, /** @type {any} */ ({ classId, maxClassLevel: classLevel, rarityId: championItemRarity(level, rng, content), filled, area }));
  /** @type {Record<string, any>[]} */
  const items = [];
  if (rng.chance(plan.itemChance)) items.push(item());
  if (plan.lastBlowItem) items.push(item());
  return { ...plan, materials, items };
}

/**
 * The title of a boss for a character of `appearance`.
 * @param {Boss} boss
 * @param {string} appearance
 * @returns {string}
 */
export const worldBossTitle = (boss, appearance) => boss.title[appearance === 'female' ? 1 : 0];

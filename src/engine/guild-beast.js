// @ts-check
// The Bestia Gildii (data/guilds.json, beast; src/server/guild-beast.js;
// DECISIONS.md, "Bestia Gildii"; the author: "344 A"): a weekly hunt of a
// whole guild on one huge beast, with nobody having to play at the same
// time. The beast is the champion of one of the regions, drawn from the
// guild's and the week's seed, at the average level of the members when it
// comes, and its HP grows with their number, so a small guild has a weaker
// beast: memberAttacks typical attacks for each member (damage, measured
// with the typical characters of tools/simulate.mjs). An attack is one
// fight, as an entry of the Wieże: the character alone, at full HP, with no
// potions, its Encyklopedia's trophy against the beast and the beast's
// region's trait counting. What the beast loses stays on its HP bar for
// the whole guild. Whoever hits it in a week gets a chest: with the beast
// fallen an item of the character's class and the beast's materials, and
// with the beast alive at the week's end only materials, more the more of
// the bar the guild knocked off (chests). Pure: the seeds are the server's.

import { simulateFight } from './combat.js';
import { combatantView, playerCombatant } from './combatant.js';
import { addCounts, materialDrops, stackKey } from './crafting.js';
import { championItemRarity, encounterCombatants } from './hunt.js';
import { randomItem } from './items.js';
import { createRng } from './rng.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ id: string, champion?: string }} Lair */
/** @typedef {{ monsterId: string, areaId: string, level: number, hp: number, maxHp: number }} Beast */
/** @typedef {{ share: number, item?: boolean, materials: number }} ChestTier A chest of data/guilds.json `beast.chests`. */

/**
 * @param {Content} content
 * @returns {{ damage: [number, number][], memberAttacks: number, chests: ChestTier[] }}
 */
const rules = (content) => content.guilds.beast;

// The inner regions with a champion: where the beast comes from.
/**
 * @param {Content} content
 * @returns {Lair[]}
 */
export const beastLairs = (content) => content.areas.filter((/** @type {Lair} */ area) => area.champion);

// The damage a typical character of `level` deals to the beast in one
// attack, from the measured levels: between two of them on the line
// between, below the first as at the first, above the last in proportion
// to the level.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {number}
 */
export function beastAttackDamage(level, content) {
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

// The beast of a guild for a week (`seed`, the server's "<guild>:<week>"):
// a champion of one of the regions, at the rounded average of the members'
// character levels (`levels`, at least 1), with memberAttacks typical
// attacks of HP for each member.
/**
 * @param {{ seed: unknown, levels: number[] }} guild
 * @param {Content} content
 */
export function guildBeast({ seed, levels }, content) {
  const area = createRng(seed).pick(beastLairs(content));
  const members = Math.max(1, levels.length);
  const average = levels.length > 0 ? levels.reduce((sum, level) => sum + level, 0) / levels.length : 1;
  const level = Math.max(1, Math.round(average));
  const maxHp = Math.max(1, Math.round(members * rules(content).memberAttacks * beastAttackDamage(level, content)));
  return { monsterId: /** @type {string} */ (area.champion), areaId: area.id, level, members, maxHp };
}

// The HP a member who joins the guild after its beast came adds to it: its
// share of the week left (`share`, joinShare in guild-trials.js) of a
// member's typical attacks at the beast's level, as the Próby's thresholds
// and the Wyprawa's stages grow for one (the code review, 0.2.72: a beast
// made for two stayed a two-member beast for all who joined after it).
/**
 * @param {number} level
 * @param {number} share
 * @param {Content} content
 * @returns {number}
 */
export const beastJoinHp = (level, share, content) => Math.max(0, Math.round(share * rules(content).memberAttacks * beastAttackDamage(level, content)));

// One attack on the beast (`beast`: its monster, region, level, HP left and
// most HP): the character alone at full HP with no potions, the
// Encyklopedia's trophies (`trophies`, by creature) and the region's trait
// counting, against the beast with the HP it has left. The fight ends when
// a side is down or after the most actions a fight has (combat.js). The
// damage is the HP the beast lost, never more than it had (a draining blow
// heals it during the fight). No XP, gold or loot. Returns the damage, the
// HP left, whether the beast fell, the fight's lines and its playback.
/**
 * @param {{ character: Record<string, any>, equipped: Record<string, any>[], name: string, beast: Beast, seed: unknown, trophies?: Record<string, any> }} attack
 * @param {Content} content
 */
export function guildBeastFight({ character, equipped, name, beast, seed, trophies = {} }, content) {
  const area = content.areasById[beast.areaId];
  const player = playerCombatant(/** @type {any} */ ({ character, equipped, name, area }), content);
  const ally = Object.keys(trophies).length > 0 ? { ...player, trophies } : player;
  // The character attacks alone: the beast hits with only a share of the
  // late and end game's growth, as in the Wieża Solo (438.3 A).
  const [unit] = encounterCombatants({ elite: false, champion: true, members: [{ monsterId: beast.monsterId, level: beast.level }] }, content, { growth: content.balance.monsters.soloGrowth });
  const foe = { ...unit, maxHp: beast.maxHp, hp: beast.hp };
  const fight = simulateFight({ allies: [ally], enemies: [foe], rng: createRng(`${seed}:beast`), content, record: true, trait: area.trait });
  const left = /** @type {{ hp: number }} */ (fight.units.find((/** @type {{ id: string }} */ one) => one.id === foe.id)).hp;
  const damage = Math.min(beast.hp, Math.max(0, beast.hp - left));
  return {
    damage,
    hp: beast.hp - damage,
    fallen: beast.hp - damage <= 0,
    // Whether the character stood to the end: true when the beast fell,
    // false when the character did, null when the fight dragged on.
    won: fight.won,
    actions: fight.actions,
    log: fight.events.map((/** @type {{ text: string }} */ event) => event.text),
    // The fight to play back in the arena, as a report's (the author: "Po
    // Atakuj w Bestii Gildii niech pokaże się ta walka symulacja").
    replay: {
      won: fight.won,
      allies: [combatantView(ally, beast.level, content)],
      enemies: [combatantView(foe, character.level, content)],
      events: fight.events,
    },
  };
}

// The chest of a week by how the beast ended it: the first of the chests
// whose share of the bar the guild knocked off (1 only for a fallen beast),
// or null under the smallest one.
/**
 * @param {{ hp: number, maxHp: number }} beast
 * @param {Content} content
 * @returns {ChestTier | null}
 */
export function beastChestTier({ hp, maxHp }, content) {
  const knocked = hp <= 0 ? 1 : (maxHp - hp) / maxHp;
  return rules(content).chests.find((chest) => knocked >= chest.share) ?? null;
}

// What a chest (`tier`, beastChestTier) holds for a character (its level,
// class and class level, and the slots it wears): with an item, one of its
// class it can wear, at its level, of a champion's rarity, favouring its
// empty slots, its affixes named by the creatures of the beast's region; and
// `tier.materials` draws of the beast's material, each as a beaten champion
// leaves it (crafting.js), at the beast's level, at least one piece. The
// same seed, the same chest.
/**
 * @param {{ level: number, classId: string, classLevel: number, wornSlots?: string[], beast: Beast, tier: ChestTier, seed: unknown }} chest
 * @param {Content} content
 * @returns {{ item: Record<string, any> | null, materials: Record<string, number> }}
 */
export function beastChest({ level, classId, classLevel, wornSlots = [], beast, tier, seed }, content) {
  const rng = createRng(`${seed}:chest`);
  const area = content.areasById[beast.areaId];
  const item = tier.item
    ? randomItem(level, rng, content, /** @type {any} */ ({ classId, maxClassLevel: classLevel, rarityId: championItemRarity(level, rng, content), filled: new Set(wornSlots), area }))
    : null;
  /** @type {Record<string, number>} */
  let materials = {};
  for (let draw = 0; draw < tier.materials; draw++) materials = addCounts(materials, materialDrops(beast.monsterId, beast.level, 1, rng, content));
  const material = content.materialsByMonster[beast.monsterId];
  if (material && tier.materials > 0 && Object.keys(materials).length === 0) materials = { [stackKey(material.id, material.rarity)]: 1 };
  return { item, materials };
}

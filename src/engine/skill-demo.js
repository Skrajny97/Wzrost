// @ts-check
// The author's preview of a skill's animation: a short recorded fight of a
// character of its class, at level 20 with the skill at level 10 (an
// evolution's skill: of the evolution, at level 60 with the skill at 20; a
// second form's: at level 110 with the skill at 40), against foes that show
// the skill off. It is never part of the game: the author's panel plays it
// to check how each skill looks.

import { simulateFight } from './combat.js';
import { combatantView, monsterCombatant, playerCombatant } from './combatant.js';
import { generateItem } from './items.js';
import { createRng } from './rng.js';
import { WOUND_KINDS } from './skills.js';
import { autoDistribute } from './stats.js';

const LEVEL = 20;
const SKILL_LEVEL = 10;
// The character and the skill of each evolution stage, the first's first.
const EVOLVED = [
  { level: 60, skill: 20 },
  { level: 110, skill: 40 },
];
// Kinds whose show needs a group of foes.
const GROUP_KINDS = new Set(['sweep', 'whirl']);

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ kind: string, skill?: string } & Record<string, any>} FightEvent */

// The foes of a preview show a skill, not the balance: they come without
// the growth of the late game and the end game (balance.monsters), which a
// character in common gear and without companions would not stand long
// enough to show its skill. Made once per content.
/** @type {WeakMap<Content, Content>} */
const plainContents = new WeakMap();
/**
 * @param {Content} content
 * @returns {Content}
 */
function plainMonsters(content) {
  if (!plainContents.has(content)) {
    const { lateGame, endGame } = content.balance.monsters;
    const monsters = { ...content.balance.monsters, lateGame: { ...lateGame, damage: 0, hp: 0 }, endGame: { ...endGame, damage: 0, hp: 0 } };
    plainContents.set(content, { ...content, balance: { ...content.balance, monsters } });
  }
  return /** @type {Content} */ (plainContents.get(content));
}

// Who the skill is shown against: a group for a sweep, a front and a back
// foe for a blow aimed at the back, a single strong foe otherwise.
/**
 * @param {Record<string, any>} skill
 * @param {Content} content
 * @param {number} level
 */
function foesFor(skill, content, level) {
  const groupFactors = content.balance.hunt.groupFactors;
  const plain = plainMonsters(content);
  /**
   * @param {string} monsterId
   * @param {number} index
   * @param {number} count
   */
  const foe = (monsterId, index, count, at = level - 2) =>
    monsterCombatant(/** @type {any} */ ({ monsterId, level: at, id: `e${index}`, groupFactor: groupFactors[count - 1] }), plain);
  if (GROUP_KINDS.has(skill.kind) || skill.params.cloud || skill.params.splash) return ['wolf', 'wolf', 'fox'].map((id, index) => foe(id, index, 3));
  if (skill.params.target === 'back' || skill.params.pierce) return [foe('wolf', 0, 2), foe('crow', 1, 2)];
  if (WOUND_KINDS.has(skill.kind) || skill.kind === 'heal') return [foe('boar', 0, 1, level + 2)];
  return [foe('boar', 0, 1)];
}

/**
 * @param {string} skillId
 * @param {Content} content
 */
export function skillDemo(skillId, content) {
  const skill = content.skillsById[skillId];
  const cls = content.classesById[skill.classId];
  const evolution = skill.evolution ? content.evolutionsById[skill.evolution] : null;
  const evolved = evolution ? EVOLVED[Math.min(EVOLVED.length, evolution.stage ?? 1) - 1] : null;
  const level = evolved ? evolved.level : LEVEL;
  const character = {
    classId: cls.id,
    level,
    classLevel: level,
    points: {},
    position: cls.position,
    appearance: 'male',
    skills: { [skillId]: evolved ? evolved.skill : SKILL_LEVEL },
    ...(evolution && { evolution: evolution.id }),
  };
  character.points = autoDistribute(character, content);
  const gear = createRng(`demo-gear:${cls.id}`);
  const bases = [cls.weapons[0], cls.offhands[0], ...cls.armor];
  const equipped = bases.map((/** @type {string} */ baseId) => generateItem(/** @type {any} */ ({ baseId, level: level - 4 }), gear, content));
  // A wound skill wakes below its mark, so the character starts just above
  // it; a heal starts below it (a song with no mark, Chór, wounded too), a
  // miracle near fainting.
  const below = WOUND_KINDS.has(skill.kind)
    ? skill.params.below + 0.1
    : skill.kind === 'heal' || skill.params.regen
      ? (skill.params.below ?? 0.8) - 0.1
      : skill.kind === 'miracle'
        ? 0.2
        : 1;
  const full = playerCombatant(/** @type {any} */ ({ character, equipped, name: evolution?.name ?? cls.name }), content);
  const player = { ...full, hp: Math.max(1, Math.round(full.maxHp * Math.min(1, below))) };
  // The first fight that shows the skill whole: what it may cause by chance
  // (a burn, a paralysis), a guard's end and a miracle's won fight too; else
  // the first that shows the skill at all.
  /** @param {FightEvent[]} events */
  const used = (events) => events.some((event) => event.skill === skillId);
  /** @param {{ events: FightEvent[], won?: boolean | null }} fight */
  const whole = ({ events, won }) =>
    used(events) &&
    (!skill.params.dotEffect || events.some((event) => event.kind === 'effect')) &&
    (!skill.params.stunChance || events.some((event) => event.kind === 'stun')) &&
    (skill.kind !== 'guard' || events.some((event) => event.kind === 'fade')) &&
    (skill.kind !== 'miracle' || won === true);
  /** @type {any} */
  let result = null;
  /** @type {any} */
  let enemies = null;
  /** @type {{ result: any, enemies: any } | null} */
  let fallback = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    enemies = foesFor(skill, content, level);
    result = simulateFight({ allies: [player], enemies, rng: createRng(`demo:${skillId}:${attempt}`), content, record: true });
    if (whole(result)) break;
    if (!fallback && used(result.events)) fallback = { result, enemies };
    if (attempt === 29 && fallback) ({ result, enemies } = fallback);
  }
  return {
    allies: [combatantView(player, enemies[0].level, content)],
    enemies: enemies.map((/** @type {any} */ enemy) => combatantView(enemy, player.level, content)),
    events: result.events,
    won: result.won,
  };
}

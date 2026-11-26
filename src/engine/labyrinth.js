// @ts-check
// The Labirynt Systemu (data/labyrinth.json; DECISIONS.md, "Labirynt
// Systemu i Rdzeń", 850–866). Every Polish day a new Labirynt, its map the
// same for every player (its seed is the day alone, 851 A): three levels,
// and after the third is cleared the same day the fourth, Piekielny, with
// creatures twice as strong as on the third (854 A). A level is map.rows
// rows of rooms, each with 2–3 roads into the next row, and its guardian at
// the end; the party picks the next room among those its room leads to (any
// of the first row). A room is a fight, an elite, a treasure, a spring, an
// altar or a merchant (rooms, by weight, with the map's rules: the first row
// only fights, no elites before map.eliteFromRow, at most map.merchantMost
// merchants and at least map.springLeast springs a level). The character
// fights with up to two companions from the Kwatery, chosen as for the
// Portale (850 A), against creatures halfway between the character's level
// and its class's of the day's start (labyrinthCharLevel; the author,
// 13.11.2026), of every land at or below it, made as strong as the newest
// place's creatures of that level (exploreStrength) times the Labirynt
// level's strength. HP goes from fight to fight (852 A): only springs, the
// merchant and some blessings heal, and a fight not won ends the day's
// Labirynt, the rewards taken staying. After an elite, a guardian and at an
// altar the party chooses one of three blessings (853 A), which last to the
// end of the day and add up. Rewards (857): a fight the XP and gold of one
// fight of an exploration of rewardMinutes, an elite and a treasure Odłamki
// Rdzenia and gold, a guardian an Artefakt (core.js), its rarity by the
// level's weights, and the level completed its completion reward
// (completionReward); and where Talia Systemu is on, the creatures beaten
// may leave their cards (903, cards.js). After a fight lost the Labirynt may
// start again for free, its rooms up to the place of the defeat giving no
// rewards, only the blessings (resetLabyrinth, spentRoom). Pure: the server
// keeps the state, the time and the seeds.

import { cardDrop, PACK } from './cards.js';
import { combatantView, exploreStrength, playerCombatant } from './combatant.js';
import { simulateFight } from './combat.js';
import { companionCombatant } from './companions.js';
import { makeArtifact } from './core.js';
import { encounterCombatants, encountersFor, expectedExploration, explorationPace } from './hunt.js';
import { portalArea } from './portals.js';
import { lateRewards, lowLevelMultiplier, monsterXp } from './progression.js';
import { questPeriod } from './quests.js';
import { createRng } from './rng.js';
import { say, word } from './text.js';
import { weekFactor, weekFighter } from './weeks.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {import('./rng.js').Rng} Rng */
/** @typedef {{ type: string, links: number[], strong?: boolean }} Room A room of a level's map, the rooms of the next row it leads to and whether it is a strong room (strongRooms). */
/** @typedef {{ level: number, rows: Room[][] }} LabyrinthMap A level's rows of rooms, the guardian's alone in the last. */
/** @typedef {{ kind: 'blessing', from: string, choices: string[] } | { kind: 'merchant', heal: boolean, blessing: boolean, choices: string[] | null }} Pending A choice the party has to make before it goes on. */
/**
 * A character's Labirynt of a day: the level it is on (1–4), the row and
 * room it stands in (row -1: at the level's entrance), the rooms taken in
 * each row of the level, the levels cleared, whether the day's Labirynt is
 * over (`fainted`, or `done` with Piekielny cleared), the companions who go
 * (their ids, as at the start), each fighter's HP as a share of its maximum
 * (the character's under `me`), the character's level the creatures have,
 * the blessings taken, a choice waiting, the day's rewards, the seed of
 * the day's draws, how many times it was started again (resetLabyrinth)
 * and then the place of the defeat (`lost`: the level and the row of the
 * fight lost, the furthest the party got that day).
 * @typedef {{
 *   day: string, level: number, row: number, room: number | null, path: number[], cleared: number,
 *   over: null | 'fainted' | 'done', team: string[], hp: Record<string, number>, charLevel: number,
 *   blessings: string[], pending: Pending | null,
 *   gains: { xp: number, gold: number, shards: number, artifacts: number }, seed: string,
 *   resets?: number, lost?: { level: number, row: number },
 * }} LabyrinthState
 */

/** @param {Content} content */
const rules = (content) => content.labyrinth;

// The levels of the Labirynt, the first three and Piekielny (hell).
/**
 * @param {Content} content
 * @returns {Record<string, any>[]}
 */
export const labyrinthLevels = (content) => rules(content).levels;

// The level of number `level` (1–4).
/**
 * @param {number} level
 * @param {Content} content
 * @returns {Record<string, any>}
 */
export const labyrinthLevel = (level, content) => labyrinthLevels(content)[Math.min(Math.max(1, level), labyrinthLevels(content).length) - 1];

// The day of a Labirynt: the Polish date, from midnight to midnight (854 A).
/**
 * @param {number} now
 * @param {Content} content
 * @returns {string}
 */
export const labyrinthDay = (now, content) => questPeriod('daily', now, content).key;

/**
 * @param {string} id
 * @param {Content} content
 * @returns {Record<string, any> | undefined}
 */
export const roomRules = (id, content) => rules(content).rooms.find((/** @type {{ id: string }} */ room) => room.id === id);

/**
 * @param {string} id
 * @param {Content} content
 * @returns {Record<string, any> | undefined}
 */
export const blessingRules = (id, content) => rules(content).blessings.find((/** @type {{ id: string }} */ blessing) => blessing.id === id);

// The map of level `level` on `day`, the same for every player (851 A): the
// rows of rooms by the map's rules and the rooms' weights, each room with its
// roads into the next row, the nearest rooms there first, every room of a
// row reached from the row before it, and the guardian alone in the last
// row, which every room of the row before leads to.
/**
 * @param {string} day
 * @param {number} level
 * @param {Content} content
 * @returns {LabyrinthMap}
 */
export function labyrinthMap(day, level, content) {
  const { map } = rules(content);
  const rng = createRng(`labyrinth:${day}:${level}`);
  /** @type {Record<string, any>[]} */
  const kinds = rules(content).rooms.filter((/** @type {{ weight?: number }} */ room) => (room.weight ?? 0) > 0);
  /** @type {Room[][]} */
  const rows = [];
  let merchants = 0;
  for (let row = 0; row < map.rows; row++) {
    const count = rng.int(map.rooms[0], map.rooms[1]);
    /** @type {Room[]} */
    const rooms = [];
    for (let index = 0; index < count; index++) {
      if (row === 0) {
        rooms.push({ type: map.firstRow, links: [] });
        continue;
      }
      const open = kinds.filter((kind) => !(kind.id === 'elite' && row + 1 < map.eliteFromRow) && !(kind.id === 'merchant' && merchants >= map.merchantMost));
      const type = rng.weighted(open, (kind) => kind.weight).id;
      if (type === 'merchant') merchants += 1;
      rooms.push({ type, links: [] });
    }
    rows.push(rooms);
  }
  // The springs a level has at least: ordinary fights after the first row
  // turned into springs.
  let springs = rows.flat().filter((room) => room.type === 'spring').length;
  while (springs < map.springLeast) {
    const fights = rows.slice(1).flat().filter((room) => room.type === 'fight');
    const candidates = fights.length > 0 ? fights : rows.slice(1).flat().filter((room) => room.type !== 'spring');
    if (candidates.length === 0) break;
    rng.pick(candidates).type = 'spring';
    springs += 1;
  }
  for (let row = 0; row + 1 < rows.length; row++) {
    const from = rows[row];
    const to = rows[row + 1];
    from.forEach((room, index) => {
      const most = Math.min(map.links[1], to.length);
      const count = rng.int(Math.min(map.links[0], most), most);
      const at = (index + 0.5) / from.length;
      const nearest = to.map((_, next) => ({ next, gap: Math.abs((next + 0.5) / to.length - at) + rng.next() * 0.01 })).sort((a, b) => a.gap - b.gap);
      room.links = nearest
        .slice(0, count)
        .map((one) => one.next)
        .sort((a, b) => a - b);
    });
    to.forEach((_, next) => {
      if (from.some((room) => room.links.includes(next))) return;
      const nearest = from.reduce((best, room, index) => (Math.abs((index + 0.5) / from.length - (next + 0.5) / to.length) < Math.abs((from.indexOf(best) + 0.5) / from.length - (next + 0.5) / to.length) ? room : best));
      nearest.links = [...nearest.links, next].sort((a, b) => a - b);
    });
  }
  for (const room of rows[rows.length - 1]) room.links = [0];
  // The strong rooms (strongRooms; 1253, a player of level 107: „Labirynt
  // jest nudny i nie ważne jaką drogę wybierasz i tak wszystko jest na
  // zielono”): in a row of the level after the first, with the chance
  // strongRooms.chance, one of its ordinary fights, whose creatures are
  // strongRooms.strength times stronger (labyrinthStrength). At most one a
  // row, and every room leads to two rooms of the next row or more, so
  // there is always a way around it; the first row, where every level
  // starts, has none, and neither has a level whose strongRooms is false
  // (Poziom 1 since 26.11.2026, the author: „I co zrobiłeś z Labiryntem, że
  // teraz ludzie padają jak muchy na pierwszym poziomie już”). Drawn from a
  // seed of their own, so the rooms and the roads are what they would be
  // without them.
  const strong = rules(content).strongRooms;
  if (strong && labyrinthLevel(level, content).strongRooms !== false) {
    const draw = createRng(`labyrinth:${day}:${level}:strong`);
    for (const rooms of rows.slice(1)) {
      const fights = rooms.filter((room) => room.type === 'fight');
      if (draw.chance(strong.chance) && fights.length > 0 && rooms.length > 1) draw.pick(fights).strong = true;
    }
  }
  rows.push([{ type: 'guardian', links: [] }]);
  return { level, rows };
}

// The rooms the party may enter next: any of the first row at the level's
// entrance, else those its room leads to; none past the guardian.
/**
 * @param {LabyrinthMap} map
 * @param {number} row
 * @param {number | null} room
 * @returns {number[]}
 */
export function reachableRooms(map, row, room) {
  if (row < 0) return map.rows[0].map((_, index) => index);
  if (row + 1 >= map.rows.length || room === null) return [];
  return map.rows[row][room]?.links ?? [];
}

// The inner regions whose creatures the Labirynt holds for a character of
// `level`: those of the lands at or below its level.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {Record<string, any>[]}
 */
export function labyrinthAreas(level, content) {
  /** @type {Record<string, any>[]} */
  const areas = content.areas;
  const open = areas.filter((area) => area.minLevel <= level);
  return open.length > 0 ? open : [areas[0]];
}

// Who waits in a room of the day's map for a character of `charLevel`:
// the creatures of one inner region of the lands at or below its level, at
// its level, a group of its usual ones in a fight, its elite in an elite's
// room, a champion (an elite where none is near) as the guardian. The same
// for every character of the level that day.
/**
 * @param {{ day: string, level: number, row: number, room: number, type: string, charLevel: number }} where
 * @param {Content} content
 * @returns {{ areaId: string, encounter: { elite: boolean, champion?: boolean, members: { monsterId: string, level: number }[] } }}
 */
export function labyrinthFoes({ day, level, row, room, type, charLevel }, content) {
  const rng = createRng(`labyrinth:${day}:${level}:${row}:${room}:foes`);
  const areas = labyrinthAreas(charLevel, content);
  if (type === 'guardian') {
    const champions = areas.filter((area) => area.champion);
    if (champions.length > 0) {
      const area = rng.pick(champions);
      return { areaId: area.id, encounter: { elite: false, champion: true, members: [{ monsterId: area.champion, level: charLevel }] } };
    }
  }
  if (type === 'elite' || type === 'guardian') {
    const elites = areas.filter((area) => area.elite);
    const area = rng.pick(elites.length > 0 ? elites : areas);
    if (area.elite) return { areaId: area.id, encounter: { elite: true, members: [{ monsterId: area.elite, level: charLevel }] } };
  }
  const area = rng.pick(areas);
  /** @type {Record<string, any>[]} */
  const open = encountersFor(area, charLevel);
  /** @type {Record<string, any>[]} */
  const all = area.encounters;
  const group = rng.weighted(open.length > 0 ? open : all, (encounter) => encounter.weight ?? 1);
  return { areaId: area.id, encounter: { elite: false, members: group.monsters.map((/** @type {string} */ monsterId) => ({ monsterId, level: charLevel })) } };
}

// How strong the creatures of a room are, [damage, HP]: as those of the
// newest place of exploration at the character's level, times the level's
// strength (Piekielny twice the third's, 854 A), an elite's and a
// guardian's on top, a strong room's (`strong`, strongRooms), and times
// `fit`, how much stronger they are against this party (labyrinthFit; 1
// for the Labirynt as it is for everyone).
/**
 * @param {number} level
 * @param {string} type
 * @param {number} charLevel
 * @param {Content} content
 * @param {number} [fit]
 * @param {boolean} [strong]
 * @returns {[number, number]}
 */
export function labyrinthStrength(level, type, charLevel, content, fit = 1, strong = false) {
  const [baseDamage, baseHp] = exploreStrength({ minLevel: charLevel, maxLevel: charLevel }, charLevel, content);
  const [damage, hp] = labyrinthLevel(level, content).strength;
  const [moreDamage, moreHp] = type === 'elite' ? rules(content).eliteStrength : type === 'guardian' ? rules(content).guardianStrength : [1, 1];
  const [strongDamage, strongHp] = strong && rules(content).strongRooms ? rules(content).strongRooms.strength : [1, 1];
  return [baseDamage * damage * moreDamage * strongDamage * fit, baseHp * hp * moreHp * strongHp * fit];
}

// The Labirynt against the party (fit in data/labyrinth.json; 1253, a
// player of level 107: „Labirynt jest nudny i nie ważne jaką drogę
// wybierasz i tak wszystko jest na zielono”): how many times stronger its
// creatures are, in their blows and their HP alike, so that a party
// stronger than the Labirynt needs meets them stronger too, and the board
// shows every party a mix of easy and harder fights. The party is measured
// as it is now, its gear, Rdzeń and the day's companions, at full HP and
// without blessings, trophies or the week's: in the day's reference fight
// (level 1, row 0, room 0, the same creatures for everyone that day) the
// strength at which it loses fit.cost of its HP on average (a fight not won
// all of it), by FIT_STEPS steps of a bisection in log space between 1 and
// FIT_MOST, FIT_SAMPLES fights each, seeded by the day's seed, so the same
// party gets the same answer all day; then fit.share of it, never less than
// fit.least. The blessings, the HP kept along the way and the trophies stay
// the party's own edge. Measured anew with each fight and each look at the
// board, so a change of gear changes it at once and the creatures always
// meet the party that fights them. 1 where the data has no fit.
const FIT_SAMPLES = 2;
const FIT_STEPS = 6;
const FIT_MOST = 32;

/**
 * @param {LabyrinthState} state
 * @param {{ character: Record<string, any>, equipped: Record<string, any>[], name: string, companions?: Record<string, any>[] }} party
 * @param {Content} content
 * @returns {number}
 */
export function labyrinthFit(state, party, content) {
  const fit = rules(content).fit;
  if (!fit) return 1;
  const plan = labyrinthFoes({ day: state.day, level: 1, row: 0, room: 0, type: 'fight', charLevel: state.charLevel }, content);
  const area = content.areasById[plan.areaId];
  const rested = { ...state, hp: Object.fromEntries(Object.keys(state.hp).map((key) => [key, 1])), blessings: [] };
  const allies = labyrinthFighters(rested, { character: party.character, equipped: party.equipped, name: party.name, companions: party.companions, area }, content).map((fighter) => fighter.unit);
  const before = allies.reduce((sum, unit) => sum + unit.hp, 0);
  const [damage, hp] = labyrinthStrength(1, 'fight', state.charLevel, content);
  const classLevel = party.character.classLevel ?? 0;
  /** @param {number} times */
  const cost = (times) => {
    let lost = 0;
    for (let i = 0; i < FIT_SAMPLES; i++) {
      const enemies = encounterCombatants(plan.encounter, content, { strength: [damage * times, hp * times], classLevel });
      const fight = simulateFight({ allies: allies.map((unit) => ({ ...unit })), enemies, rng: createRng(`${state.seed}:fit:${i}`), content, trait: area.trait });
      if (fight.won !== true) {
        lost += 1;
        continue;
      }
      const after = allies.reduce((sum, unit) => sum + Math.max(0, fight.units.find((/** @type {{ id: string }} */ one) => one.id === unit.id)?.hp ?? 0), 0);
      lost += (before - after) / before;
    }
    return lost / FIT_SAMPLES;
  };
  let low = 0;
  let high = Math.log(FIT_MOST);
  for (let step = 0; step < FIT_STEPS; step++) {
    const middle = (low + high) / 2;
    if (cost(Math.exp(middle)) < fit.cost) low = middle;
    else high = middle;
  }
  // A party that loses that much already at the Labirynt's own strength
  // stays at it; one that never does gets the most.
  const times = low === 0 ? 1 : high === Math.log(FIT_MOST) ? FIT_MOST : Math.exp((low + high) / 2);
  return Math.max(fit.least, times * fit.share);
}

// Whether a room of the day's map is a strong room (labyrinthMap).
/**
 * @param {{ day: string, level: number }} state
 * @param {number} row
 * @param {number} room
 * @param {Content} content
 * @returns {boolean}
 */
export const strongRoom = (state, row, room, content) => Boolean(labyrinthMap(state.day, state.level, content).rows[row]?.[room]?.strong);

// The gold of `minutes` of exploring at the character's level, in the place
// that holds its level: the elites', the treasures' and the merchant's
// measure; for a character of class level `classLevel` a part of it from
// the late class levels on (lateRewards in expectedExploration), 0 for all
// of it.
/**
 * @param {number} minutes
 * @param {number} charLevel
 * @param {Content} content
 * @param {number} [classLevel]
 * @returns {number}
 */
export const labyrinthGold = (minutes, charLevel, content, classLevel = 0) =>
  Math.max(1, Math.round(expectedExploration(portalArea(charLevel, content), charLevel, minutes, content, classLevel).gold));

// The merchant's prices at a character level: the healing and a choice of a
// blessing, each the gold of so many minutes of exploring (`classLevel` as
// in labyrinthGold).
/**
 * @param {number} charLevel
 * @param {Content} content
 * @param {number} [classLevel]
 * @returns {{ heal: number, blessing: number }}
 */
export function merchantPrices(charLevel, content, classLevel = 0) {
  const { healMinutes, blessingMinutes } = rules(content).merchant;
  return { heal: labyrinthGold(healMinutes, charLevel, content, classLevel), blessing: labyrinthGold(blessingMinutes, charLevel, content, classLevel) };
}

// Three blessings to choose from (853 A), each of the pool once, drawn from
// `seed`.
/**
 * @param {string} seed
 * @param {Content} content
 * @returns {string[]}
 */
export function blessingChoices(seed, content) {
  const rng = createRng(`${seed}:blessings`);
  /** @type {string[]} */
  const pool = rules(content).blessings.map((/** @type {{ id: string }} */ blessing) => blessing.id);
  /** @type {string[]} */
  const choices = [];
  while (choices.length < 3 && pool.length > 0) choices.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  return choices;
}

/** @typedef {{ damage: number, armor: number, hp: number, crit: number, speed: number, dodge: number, lifesteal: number, openingCrit: number, shield: number }} Boons */

/** @returns {Boons} */
const noBoons = () => ({ damage: 0, armor: 0, hp: 0, crit: 0, speed: 0, dodge: 0, lifesteal: 0, openingCrit: 0, shield: 0 });

// What the blessings taken give together: the character's, the companions'
// and the party's (each of the party's to everyone), and the share of the
// maximum HP every fighter standing gets back after a won fight (mend).
/**
 * @param {string[]} ids
 * @param {Content} content
 * @returns {{ character: Boons, companions: Boons, mend: number }}
 */
export function blessingEffects(ids, content) {
  const character = noBoons();
  const companions = noBoons();
  let mend = 0;
  for (const id of ids) {
    const blessing = blessingRules(id, content);
    if (!blessing) continue;
    for (const [key, value] of Object.entries(/** @type {Record<string, number>} */ (blessing.effect))) {
      if (key === 'mend') {
        mend += value;
        continue;
      }
      const boon = /** @type {keyof Boons} */ (key);
      if (!(boon in character)) continue;
      if (blessing.target !== 'companions') character[boon] += value;
      if (blessing.target !== 'character') companions[boon] += value;
    }
  }
  return { character, companions, mend };
}

// A fighter with its blessings: more damage, armour, maximum HP, speed, a
// critical blow's and a dodge's chance, a share of the damage back as HP,
// a first critical blow and a shield at the start (combat.js).
/**
 * @param {Record<string, any>} unit
 * @param {Boons} boons
 * @returns {Record<string, any>}
 */
function blessed(unit, boons) {
  const out = { ...unit };
  if (boons.damage) out.damageBonus = (out.damageBonus ?? 0) + boons.damage;
  if (boons.armor) out.armor = Math.round(out.armor * (1 + boons.armor));
  if (boons.hp) out.maxHp = Math.round(out.maxHp * (1 + boons.hp));
  if (boons.speed) out.speed = out.speed * (1 + boons.speed);
  if (boons.crit) out.critChance = (out.critChance ?? 0) + boons.crit;
  if (boons.dodge) out.dodgeChance = (out.dodgeChance ?? 0) + boons.dodge;
  if (boons.lifesteal) out.lifesteal = (out.lifesteal ?? 0) + boons.lifesteal;
  if (boons.openingCrit) out.openingCrit = true;
  if (boons.shield) out.openingShield = (out.openingShield ?? 0) + boons.shield;
  return out;
}

// The key of a companion's HP in the state.
/** @param {Record<string, any>} companion */
const companionKey = (companion) => String(companion.id);

// The level a character's Labirynt of the day is made for: halfway between
// the character's level and its class level, rounded down (the author,
// 13.11.2026: "Niech w Labiryncie daje przeciwników z poziomem równo miedzy
// klasą a postacią"; from 12.11 it was the higher of the two).
// The creatures stand at it, come from the lands at or below it (the lands
// open by the class level) and are as strong as on its newest place; the
// gold of the fights, elites, treasures and the merchant is measured by it.
/**
 * @param {{ level: number, classLevel?: number | null }} character
 * @returns {number}
 */
export const labyrinthCharLevel = (character) => Math.floor((character.level + (character.classLevel ?? character.level)) / 2);

// A fresh Labirynt of `day` for a character of `charLevel` (labyrinthCharLevel)
// with its companions of now: everyone at full HP, on the first level's
// entrance.
/**
 * @param {{ day: string, charLevel: number, companions: Record<string, any>[], seed: string }} start
 * @returns {LabyrinthState}
 */
export function newLabyrinth({ day, charLevel, companions, seed }) {
  const team = companions.map(companionKey);
  return {
    day,
    level: 1,
    row: -1,
    room: null,
    path: [],
    cleared: 0,
    over: null,
    team,
    hp: Object.fromEntries([['me', 1], ...team.map((id) => [id, 1])]),
    charLevel,
    blessings: [],
    pending: null,
    gains: { xp: 0, gold: 0, shards: 0, artifacts: 0 },
    seed,
  };
}

// A Labirynt lost may start again (the author, 13.11.2026: „Pozwól, w
// przypadku porażki zresetować Labirynt raz dziennie…”): after a fight lost,
// reset.perDay times a day. Free since 24.11.2026, its rooms up to the place
// of the defeat giving nothing (the author: „Niech restartowanie Labiryntu
// dodatkowo po porażce nie daje nagród (poza błogosławieństwami) aż do
// momentu w którym się przegrało, ale za to niech będzie darmowe”; until
// then it cost the gold of 150 minutes of exploring, and a player found that
// a day lost on purpose and played again paid more than one finished). It
// starts from the first level of the same day's map, with the fighters at
// full HP, no blessings and the companions going now; the day's rewards
// stay, and the place of the defeat is kept (`lost`, the furthest of the
// day's: the level and the row of the fight lost).
/**
 * @param {LabyrinthState} state
 * @param {Content} content
 * @returns {number} the tries left now, 0 unless a fight was lost
 */
export const resetsLeft = (state, content) => (state.over === 'fainted' ? Math.max(0, rules(content).reset.perDay - (state.resets ?? 0)) : 0);

/**
 * @param {LabyrinthState} state
 * @param {{ companions: Record<string, any>[], seed: string }} start
 * @param {Content} content
 * @returns {LabyrinthState | null} null when it may not start again
 */
export function resetLabyrinth(state, { companions, seed }, content) {
  if (resetsLeft(state, content) <= 0) return null;
  const here = { level: state.level, row: state.row };
  const lost = state.lost && spentRoom(state, here.level, here.row) ? state.lost : here;
  return { ...newLabyrinth({ day: state.day, charLevel: state.charLevel, companions, seed }), gains: state.gains, resets: (state.resets ?? 0) + 1, lost };
}

// Whether a room of the day, by its level and row, lies before the place of
// the defeat after the Labirynt started again: there a fight, an elite, a
// treasure and a guardian give no rewards (no XP, gold, Odłamki, Artefakt,
// cards nor completion reward), only the blessings, the springs and the
// merchant are as ever (the author, 24.11.2026). The room of the defeat and
// those after it pay again: its fight paid nothing the first time.
/**
 * @param {LabyrinthState} state
 * @param {number} level
 * @param {number} row
 * @returns {boolean}
 */
export function spentRoom(state, level, row) {
  const lost = state.lost;
  if (!lost) return false;
  return level < lost.level || (level === lost.level && row < lost.row);
}

// The reward for a level completed, its guardian beaten (a player, level
// 228: „Jeszcze można ogarnąć coś dodatkowego za labirynt, ukończenie
// całego”, „bo teraz bardziej się opłaca wywalić przed i zrobić jeszcze raz
// niż to kończyć”; the author: „Racja, też dobry pomysł”, „jakieś dodatkowe
// nagrody za pełne poziomy? żeby się nie opłacało przegrywać?”): the
// level's completion.shards Odłamki Rdzenia and the gold of its
// completion.goldMinutes minutes of exploring at the creatures' level
// (`classLevel` as in labyrinthGold). The first time that day only: a
// level completed before the Labirynt started again lies before the place
// of the defeat (spentRoom), so its guardian gives none again.
/**
 * @param {number} level
 * @param {number} charLevel
 * @param {Content} content
 * @param {number} [classLevel]
 * @returns {{ shards: number, gold: number }}
 */
export function completionReward(level, charLevel, content, classLevel = 0) {
  const { completion } = labyrinthLevel(level, content);
  return { shards: completion.shards, gold: labyrinthGold(completion.goldMinutes, charLevel, content, classLevel) };
}

// Its words: „Za ukończenie 2. poziomu: +4 Odłamki Rdzenia, +480 złota.”
/**
 * @param {number} level
 * @param {{ shards: number, gold: number }} reward
 * @param {Content} content
 * @returns {string}
 */
export const completionLine = (level, reward, content) => say(rules(content).texts, 'completion', 0, { level: labyrinthLevel(level, content).completion.name, shards: reward.shards, gold: reward.gold });

// The fighters of a Labirynt as they stand now: the character and its
// companions of the day who are still hired, each with its blessings, its
// maximum HP and its HP from the state's share; those at 0 HP stand aside.
/**
 * @param {LabyrinthState} state
 * @param {{ character: Record<string, any>, equipped: Record<string, any>[], name: string, companions?: Record<string, any>[], area?: Record<string, any> | null, week?: Record<string, any> | null }} party
 * @param {Content} content
 * @returns {{ key: string, unit: Record<string, any> }[]}
 */
export function labyrinthFighters(state, { character, equipped, name, companions = [], area = null, week = null }, content) {
  const boons = blessingEffects(state.blessings, content);
  const going = companions.filter((companion) => state.team.includes(companionKey(companion)));
  const player = blessed(playerCombatant(/** @type {any} */ ({ character: weekFighter(/** @type {any} */ (character), /** @type {any} */ (week)), equipped, name, area }), content), boons.character);
  const fighters = [
    { key: 'me', unit: player },
    ...going.map((companion, index) => ({
      key: companionKey(companion),
      unit: blessed(companionCombatant(companion, /** @type {any} */ ({ area, id: `a${index + 1}`, classLevel: character.classLevel ?? 0 }), content), boons.companions),
    })),
  ];
  return fighters.map(({ key, unit }) => {
    const share = state.hp[key] ?? 1;
    return { key, unit: { ...unit, hp: share > 0 ? Math.max(1, Math.round(unit.maxHp * share)) : 0 } };
  });
}

// A share of the maximum HP, kept to four places.
/** @param {number} value */
const shareOf = (value) => Math.round(Math.min(1, Math.max(0, value)) * 10000) / 10000;

// The danger of a fight room on the board (899 A, 13.11.2026): how the
// room's creatures stand against the party as it is now, with its HP,
// blessings, companions and trophies. Sample fights against the room's
// creatures at the room's strength, as labyrinthFight fights them, seeded by
// `seed` (the server's: the day and the character) and the room, so the
// board does not change until the party does; the room's own fight has a
// seed of its own, so the samples never tell how it goes. 'deadly' (red)
// when the party loses a quarter of them or more, 'even' (yellow) when it
// loses fewer or wins them only at the cost of 40% of its HP or more, and
// 'easy' (green) otherwise. A fight that drags on counts as lost, as in
// labyrinthFight. First DANGER_SAMPLES fights; a room in doubt (some lost,
// or a costly win) gets DANGER_MORE fights more. A healer can leave the
// party with more HP than it had: a negative cost. Only the board shows it:
// the creatures stay as strong as they are.
export const DANGER_LEVELS = ['easy', 'even', 'deadly'];
const DANGER_SAMPLES = 3;
const DANGER_MORE = 3;
// The share of the sample fights lost from which a room is deadly.
const DEADLY_LOSSES = 0.25;
// The share of the party's HP before the fight that a won fight may cost
// at most, on average, to count as easy.
const EASY_COST = 0.4;

/**
 * @param {{ state: LabyrinthState, type: string, row: number, room: number, party: { character: Record<string, any>, equipped: Record<string, any>[], name: string, companions?: Record<string, any>[], trophies?: Record<string, any>, week?: Record<string, any> | null, fit?: number }, seed: string }} options
 * @param {Content} content
 * @returns {string | null} One of DANGER_LEVELS, or null for a room without a fight.
 */
export function roomDanger({ state, type, row, room, party, seed }, content) {
  if (!['fight', 'elite', 'guardian'].includes(type)) return null;
  const { trophies = {} } = party;
  const plan = labyrinthFoes({ day: state.day, level: state.level, row, room, type, charLevel: state.charLevel }, content);
  const area = content.areasById[plan.areaId];
  const standing = labyrinthFighters(state, { ...party, area }, content).filter((fighter) => fighter.unit.hp > 0);
  if (!standing.some((fighter) => fighter.key === 'me')) return 'deadly';
  const allies = standing.map((fighter) => (fighter.key === 'me' && Object.keys(trophies).length > 0 ? { ...fighter.unit, trophies } : fighter.unit));
  const before = allies.reduce((sum, unit) => sum + unit.hp, 0);
  const strength = labyrinthStrength(state.level, type, state.charLevel, content, party.fit ?? labyrinthFit(state, party, content), strongRoom(state, row, room, content));
  let fought = 0;
  let lost = 0;
  let cost = 0;
  /** @param {number} times */
  const sample = (times) => {
    for (let i = 0; i < times; i++, fought++) {
      const rng = createRng(`${seed}:${state.level}:${row}:${room}:${fought}`);
      const enemies = encounterCombatants(plan.encounter, content, { strength, classLevel: party.character.classLevel ?? 0 });
      const fight = simulateFight({ allies: allies.map((unit) => ({ ...unit })), enemies, rng, content, trait: area.trait });
      if (fight.won !== true) {
        lost += 1;
        continue;
      }
      const after = allies.reduce((sum, unit) => sum + Math.max(0, fight.units.find((/** @type {{ id: string }} */ one) => one.id === unit.id)?.hp ?? 0), 0);
      cost += (before - after) / before;
    }
  };
  sample(DANGER_SAMPLES);
  const won = () => fought - lost;
  const costly = () => won() > 0 && cost / won() >= EASY_COST;
  if (lost < fought && (lost > 0 || costly())) sample(DANGER_MORE);
  if (lost > 0 && lost >= fought * DEADLY_LOSSES) return 'deadly';
  return lost > 0 || costly() ? 'even' : 'easy';
}

// The rooms of a level's map the party can still reach from where it stands
// (row -1: the entrance, any room of the first row), as "row:room" keys: the
// rooms whose danger the board shows.
/**
 * @param {LabyrinthMap} map
 * @param {number} row
 * @param {number | null} room
 * @returns {Set<string>}
 */
export function roomsAhead(map, row, room) {
  /** @type {Set<string>} */
  const ahead = new Set();
  let current = reachableRooms(map, row, room);
  for (let next = row + 1; next < map.rows.length && current.length > 0; next++) {
    for (const index of current) ahead.add(`${next}:${index}`);
    current = [...new Set(current.flatMap((index) => reachableRooms(map, next, index)))].sort((a, b) => a - b);
  }
  return ahead;
}

// Every fighter of the day's party healed by `share` of its maximum HP, the
// fallen companions too (a spring, the merchant).
/**
 * @param {Record<string, number>} hp
 * @param {number} share
 * @returns {Record<string, number>}
 */
export const healedAll = (hp, share) => Object.fromEntries(Object.entries(hp).map(([key, value]) => [key, shareOf(value + share)]));

// The room a target names, if the party may enter it now: the state's day
// not over, no choice waiting, a room of the next row its room leads to.
/**
 * @param {LabyrinthState} state
 * @param {LabyrinthMap} map
 * @param {{ row: number, room: number }} target
 * @returns {string | null} why not, or null
 */
export function roomRefusal(state, map, target) {
  if (state.over) return 'over';
  if (state.pending) return 'pending';
  if (target.row !== state.row + 1) return 'row';
  if (!reachableRooms(map, state.row, state.room).includes(target.room)) return 'room';
  return null;
}

// One room entered: the party moves into it and what is there happens. A
// fight (an ordinary one, an elite, the guardian) is fought at once with
// the HP the fighters have (labyrinthFighters), its report a hunt of one
// fight for applyHunt and huntReport, with `labyrinth`; a lost or undecided
// fight ends the day's Labirynt, and a character who fell in a won fight
// gets up with 1 HP. A won ordinary fight pays the XP and gold of a fight
// of an exploration of rewardMinutes, an elite the level's Odłamki and the
// gold of eliteGoldMinutes and a choice of blessings, the guardian an
// Artefakt (core.js) and a choice of blessings, and clears its level: the
// next one opens, Piekielny after the third, and the day is done after it.
// A treasure gives Odłamki and gold, a spring heals everyone, an altar
// offers blessings, a merchant waits with its wares. Blessing Oddech
// Labiryntu heals those standing after each won fight. A guardian beaten
// gives the level's completion reward too (completionReward). After the
// Labirynt started again, a room before the place of the defeat (spentRoom)
// gives none of its rewards, only its blessings, and says so (`spent`).
// `seed`: the server's, for the fight and its loot. `party.cards`: Talia
// Systemu's cards where the game has them on ({ maxed }, as an
// exploration's): the creatures beaten in a won fight may leave theirs
// (labyrinthFight). Returns the new state, what the room gave (the
// completion reward apart too) and, for a fight, the hunt.
/**
 * @param {LabyrinthState} state
 * @param {{ row: number, room: number }} target
 * @param {{ character: Record<string, any>, equipped: Record<string, any>[], name: string, companions?: Record<string, any>[], trophies?: Record<string, any>, week?: Record<string, any> | null, cards?: { maxed?: string[] } | null, fit?: number }} party
 * @param {string} seed
 * @param {Content} content
 */
export function enterRoom(state, target, party, seed, content) {
  const map = labyrinthMap(state.day, state.level, content);
  const refusal = roomRefusal(state, map, target);
  if (refusal) throw new Error(`labyrinth: ${refusal}`);
  const type = map.rows[target.row][target.room].type;
  const level = labyrinthLevel(state.level, content);
  const texts = rules(content).texts;
  /** @type {LabyrinthState} */
  let next = { ...state, row: target.row, room: target.room, path: [...state.path, target.room], hp: { ...state.hp }, gains: { ...state.gains } };
  const gains = { xp: 0, gold: 0, shards: 0 };
  /** @type {import('./core.js').Artifact | null} */
  let artifact = null;
  /** @type {{ shards: number, gold: number } | null} */
  let completion = null;
  /** @type {string[]} */
  const lines = [];
  /** @type {Record<string, any> | null} */
  let hunt = null;
  const index = target.row * 3 + target.room;
  const classLevel = party.character.classLevel ?? 0;
  const spent = spentRoom(state, state.level, target.row);

  if (type === 'spring') {
    const heal = rules(content).spring.heal;
    next.hp = healedAll(next.hp, heal);
    lines.push(say(texts, 'spring', index, { heal: Math.round(heal * 100) }));
  } else if (type === 'altar') {
    next.pending = { kind: 'blessing', from: 'altar', choices: blessingChoices(`${state.seed}:${state.level}:${target.row}:${target.room}`, content) };
  } else if (type === 'merchant') {
    next.pending = { kind: 'merchant', heal: false, blessing: false, choices: null };
  } else if (type === 'treasure') {
    if (spent) lines.push(say(texts, 'spent', index));
    else {
      gains.shards = level.shards.treasure;
      gains.gold = labyrinthGold(rules(content).rewards.treasureGoldMinutes, state.charLevel, content, classLevel);
      lines.push(say(texts, 'treasure', index, { gold: gains.gold, shards: gains.shards }));
    }
  } else {
    hunt = labyrinthFight({ state: next, type, row: target.row, room: target.room, party, seed }, content);
    const { won } = hunt.labyrinth;
    next.hp = hunt.labyrinth.hp;
    gains.xp = hunt.xp;
    gains.gold = hunt.gold;
    if (!won) {
      next.over = 'fainted';
    } else if (type === 'elite') {
      if (!spent) {
        gains.shards = level.shards.elite;
        gains.gold += labyrinthGold(rules(content).rewards.eliteGoldMinutes, state.charLevel, content, classLevel);
      }
      next.pending = { kind: 'blessing', from: 'elite', choices: blessingChoices(`${state.seed}:${state.level}:${target.row}:${target.room}`, content) };
    } else if (type === 'guardian') {
      if (!spent) {
        artifact = makeArtifact(level.artifact, createRng(`${seed}:artifact`), content);
        completion = completionReward(state.level, state.charLevel, content, classLevel);
        gains.shards += completion.shards;
        gains.gold += completion.gold;
      }
      next.cleared = Math.max(next.cleared, state.level);
      if (state.level >= labyrinthLevels(content).length) {
        next.over = 'done';
      } else {
        next.pending = { kind: 'blessing', from: 'guardian', choices: blessingChoices(`${state.seed}:${state.level}:${target.row}:${target.room}`, content) };
        next = { ...next, level: state.level + 1, row: -1, room: null, path: [] };
      }
    }
    if (won) {
      const { mend } = blessingEffects(state.blessings, content);
      if (mend > 0) next.hp = Object.fromEntries(Object.entries(next.hp).map(([key, value]) => [key, value > 0 ? shareOf(value + mend) : value]));
      if (spent) lines.push(say(texts, 'spent', index));
    }
  }
  next.gains = {
    xp: next.gains.xp + gains.xp,
    gold: next.gains.gold + gains.gold,
    shards: next.gains.shards + gains.shards,
    artifacts: next.gains.artifacts + (artifact ? 1 : 0),
  };
  return { state: next, type, gains, artifact, completion, spent, lines, hunt };
}

// A blessing chosen of those offered (after an elite, a guardian, at an
// altar or bought at the merchant): it joins the day's, and the party goes
// on (at the merchant, back to its wares). Null when it was not offered.
/**
 * @param {LabyrinthState} state
 * @param {string} id
 * @returns {LabyrinthState | null}
 */
export function chooseBlessing(state, id) {
  const pending = state.pending;
  if (!pending || !pending.choices?.includes(id)) return null;
  const blessings = [...state.blessings, id];
  if (pending.kind === 'merchant') return { ...state, blessings, pending: { ...pending, choices: null } };
  return { ...state, blessings, pending: null };
}

// A purchase at the merchant: the healing (everyone, the fallen companions
// too, by merchant.heal of the maximum HP) or the choice of three blessings,
// each once; its price is the caller's to take. Null when it is not for sale.
/**
 * @param {LabyrinthState} state
 * @param {'heal' | 'blessing'} what
 * @param {Content} content
 * @returns {LabyrinthState | null}
 */
export function buyAtMerchant(state, what, content) {
  const pending = state.pending;
  if (pending?.kind !== 'merchant' || pending.choices) return null;
  if (what === 'heal' && !pending.heal) return { ...state, hp: healedAll(state.hp, rules(content).merchant.heal), pending: { ...pending, heal: true } };
  if (what === 'blessing' && !pending.blessing) {
    return { ...state, pending: { ...pending, blessing: true, choices: blessingChoices(`${state.seed}:${state.level}:${state.row}:${state.room}:merchant`, content) } };
  }
  return null;
}

// The party leaves the merchant (a choice bought and not made yet stays).
/**
 * @param {LabyrinthState} state
 * @returns {LabyrinthState | null}
 */
export const leaveMerchant = (state) => (state.pending?.kind === 'merchant' && !state.pending.choices ? { ...state, pending: null } : null);

// A fight in a room (an ordinary one, an elite, the guardian): the fighters
// with their HP and blessings against the room's creatures, in their
// region (its trait counts), as strong as labyrinthStrength says. Returns
// a hunt of one fight for applyHunt and huntReport, with `labyrinth`: the
// level, row, room and type, whether it was won and every fighter's HP as a
// share after it. A won ordinary fight pays as a fight of an exploration of
// rewardMinutes (the XP as in the Wieże, less for each companion, and the
// gold of the creatures); an elite and a guardian pay nothing here. With
// `party.cards` (Talia Systemu, 903), each creature beaten in a won fight
// may leave its own card by its kind's chance, as on an exploration (the
// guardian's by the guardians'), at most one of a creature a fight and none
// at its top level (`maxed`); drawn from the day's seed and the room, so
// the fight and its loot go as without them, and the hunt has them
// (`cards`). Before the place of the defeat (spentRoom), no XP, gold nor
// cards.
/**
 * @param {{ state: LabyrinthState, type: string, row: number, room: number, party: { character: Record<string, any>, equipped: Record<string, any>[], name: string, companions?: Record<string, any>[], trophies?: Record<string, any>, week?: Record<string, any> | null, cards?: { maxed?: string[] } | null, fit?: number }, seed: string }} options
 * @param {Content} content
 * @returns {Record<string, any>}
 */
export function labyrinthFight({ state, type, row, room, party, seed }, content) {
  const { character, trophies = {}, week = null, cards = null } = party;
  const plan = labyrinthFoes({ day: state.day, level: state.level, row, room, type, charLevel: state.charLevel }, content);
  const area = content.areasById[plan.areaId];
  const rng = createRng(`${seed}:fight`);
  const lootRng = createRng(`${seed}:loot`);
  const texts = rules(content).texts;
  const fighters = labyrinthFighters(state, { ...party, area }, content);
  const me = fighters[0];
  const standing = fighters.filter((fighter) => fighter.unit.hp > 0);
  const allies = standing.map((fighter) => (fighter.key === 'me' && Object.keys(trophies).length > 0 ? { ...fighter.unit, trophies } : fighter.unit));
  const strength = labyrinthStrength(state.level, type, state.charLevel, content, party.fit ?? labyrinthFit(state, party, content), strongRoom(state, row, room, content));
  // From the character's class level 250 they are stronger still (the myth
  // game, monsterCombatant).
  const enemies = encounterCombatants(plan.encounter, content, { strength, classLevel: character.classLevel ?? 0 });
  const fight = simulateFight({ allies, enemies, rng, content, record: true, trait: area.trait });
  const won = fight.won === true;
  /** @type {Record<string, number>} */
  const hp = { ...state.hp };
  for (const fighter of standing) {
    const after = Math.max(0, fight.units.find((/** @type {{ id: string }} */ unit) => unit.id === fighter.unit.id)?.hp ?? 0);
    hp[fighter.key] = shareOf(after / fighter.unit.maxHp);
  }
  // A character who fell in a won fight gets up with 1 HP; one who lost
  // ends the day.
  if (won && hp.me <= 0) hp.me = shareOf(1 / me.unit.maxHp) || 0.0001;
  const hpAfter = Math.max(0, Math.round(hp.me * me.unit.maxHp));

  // Up to the place of the defeat after the Labirynt started again, nothing.
  const spent = spentRoom(state, state.level, row);
  let xp = 0;
  let gold = 0;
  if (won && type === 'fight' && !spent) {
    const tuning = content.balance.hunt;
    const pace = explorationPace(rules(content).rewardMinutes, content);
    const lengthed = pace.timeFactor * (1 + pace.lengthBonus);
    const companions = standing.length - 1;
    const partyXp = 1 - companions * content.settlement.companions.xpCost;
    let fightXp = 0;
    let fightGold = 0;
    for (const enemy of enemies) {
      const monster = content.monstersById[enemy.monsterId];
      fightXp += monsterXp({ ...monster, elite: false, champion: false }, enemy.level, content) * enemy.groupFactor * lowLevelMultiplier(character.level, enemy.level, content);
      fightGold += content.balance.rewards.goldPerLevel * enemy.level * monster.reward.gold * enemy.groupFactor * lootRng.float(0.5, 1.5);
    }
    xp = Math.round(fightXp * (1 + tuning.soloXpBonus) * lengthed * partyXp * weekFactor(/** @type {any} */ (week), 'xp'));
    gold = Math.round(fightGold * lengthed * weekFactor(/** @type {any} */ (week), 'gold') * lateRewards(character.classLevel ?? 0, content));
  }

  // The cards the creatures beaten leave (903), from a seed of their own,
  // and the packs of cards found instead of a card (drops.packShare).
  /** @type {string[]} */
  const found = [];
  let packs = 0;
  if (won && cards && content.cards && !spent) {
    const cardRng = createRng(`${state.seed}:${state.level}:${row}:${room}:cards`);
    for (const enemy of enemies) {
      const card = cardDrop(enemy.monsterId, cardRng, { maxed: [...(cards.maxed ?? []), ...found], guardian: type === 'guardian' }, content);
      if (card === PACK) packs += 1;
      else if (card) found.push(card);
    }
  }

  const enemyList = enemies.map((/** @type {{ name: string, level: number }} */ enemy) => word(content, '{name} (poz. {level})', { name: enemy.name, level: enemy.level })).join(', ');
  const start = type === 'guardian' ? 'guardianStart' : type === 'elite' ? 'eliteStart' : 'fightStart';
  const at = row * 3 + room;
  const lines = [say(texts, start, at, { enemies: enemyList })];
  if (won) {
    lines.push(say(content.texts, 'victory', at));
    if (xp > 0 || gold > 0) lines.push(word(content, '+{xp} XP, +{gold} złota.', { xp, gold }));
  } else {
    lines.push(say(texts, 'defeat', at, { target: me.unit.name }));
  }
  const summary = {
    index: 0,
    t: 0,
    elite: type === 'elite',
    champion: type === 'guardian',
    tough: false,
    enemies: enemies.map((/** @type {{ name: string, level: number, monsterId: string }} */ enemy) => ({ name: enemy.name, level: enemy.level, monsterId: enemy.monsterId })),
    won: fight.won,
    hpBefore: me.unit.hp,
    hpAfter,
    xp,
    gold,
    materials: {},
    chests: [],
    ...(cards && { cards: found }),
    ...(packs > 0 && { packs }),
    recovered: 0,
    allies: allies.map((unit) => combatantView(unit, enemies[0].level, content)),
    enemiesView: enemies.map((/** @type {any} */ enemy) => combatantView(enemy, me.unit.level, content)),
    events: fight.events,
  };
  return {
    areaId: area.id,
    minutes: 0,
    // A lost room costs no XP: the System only leads the party out.
    result: won ? 'success' : 'escaped',
    xp,
    gold,
    resources: {},
    materials: {},
    timePoints: 0,
    items: [],
    // Talia Systemu's cards the creatures left, with `party.cards` only, and
    // the packs of cards.
    ...(cards && { cards: found }),
    ...(packs > 0 && { packs }),
    hpStart: me.unit.hp,
    hpEnd: hpAfter,
    maxHp: me.unit.maxHp,
    fights: [summary],
    entries: [{ t: 0, type: 'fight', fight: 0, text: lines.join(' ') }],
    keyFight: { index: 0 },
    potionsUsed: {},
    buffFights: {},
    ...(week && { week }),
    labyrinth: {
      level: state.level,
      row,
      room,
      type,
      won,
      hp,
      companions: standing.slice(1).map((fighter) => fighter.unit.name),
      text: say(texts, won ? 'won' : 'lost', at),
    },
  };
}

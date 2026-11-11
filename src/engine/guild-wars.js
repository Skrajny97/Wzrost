// @ts-check
// The guild wars (data/guilds.json, war; src/server/guild-wars.js; DECISIONS.md,
// "Wojny gildii: odpowiedzi autora 792–800" and "Wojny gildii na wersji
// testowej"). The author: „chcemy też powoli budować wojny gildii”, teams of
// five on five, „jeśli jest pełna gildia to 6 takich drużyn, a jeśli mniej
// to mniej i częściej muszą walczyć”. A war lasts a week, Monday to Sunday,
// with battles every evening at battleHour on the Polish clock (794 A),
// against a guild of a similar number of members drawn at random (797 B).
// A guild has a team for each full five of its members, at most maxTeams,
// and one with fewer than five (12); the members in no team are its
// reserve, which takes the free places before a battle, and a team still
// short of people fights so (800 C). An evening has as many battles as the
// bigger guild has teams, the smaller one's teams fighting in turn, a few
// times each (795 B). A battle is five on five, the characters as they are
// saved, as at the Arena, without companions or mercenaries; the side with
// someone still standing wins (798 A). The guild that won more battles by
// Sunday wins the war, its Sława and a war chest; every character that
// fought gets gold and Punkty Systemu for each battle won (799 A). Pure:
// the seed and the time are the server's.

import { simulateFight } from './combat.js';
import { combatantView } from './combatant.js';
import { championItemRarity } from './hunt.js';
import { randomItem } from './items.js';
import { duelArmorShare, duelHpFactor, duelist } from './pvp-arena.js';
import { questPeriod, zoneTime } from './quests.js';
import { createRng } from './rng.js';
import { say } from './text.js';

const DAY = 24 * 3600000;

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ character: Record<string, any>, equipped: Record<string, any>[], name: string }} Fighter A character as it is saved, for a battle. */
/** @typedef {{ key: string, startsAt: number, endsAt: number }} Period A period of the quests' clock (quests.js). */

// The days of a war: Monday to Sunday.
export const WAR_DAYS = 7;

/**
 * @param {Content} content
 * @returns {Record<string, any>}
 */
export const warRules = (content) => content.guilds?.war ?? null;

// How many teams a guild of `members` has (12): one for each full five,
// at most maxTeams, and one for a guild of fewer than five.
/**
 * @param {number} members
 * @param {Content} content
 * @returns {number}
 */
export function warTeams(members, content) {
  const { teamSize, maxTeams } = warRules(content);
  return Math.max(1, Math.min(maxTeams, Math.floor(members / teamSize)));
}

// The members a guild needs for its next team, or null at maxTeams.
/**
 * @param {number} members
 * @param {Content} content
 * @returns {number | null}
 */
export function nextTeamAt(members, content) {
  const { teamSize, maxTeams } = warRules(content);
  const teams = warTeams(members, content);
  return teams >= maxTeams ? null : (teams + 1) * teamSize;
}

// The week of the wars around `now`: its key (its Monday, as the weekly
// quests'), start and end, the moments of its seven evenings' battles
// (battleHour on the quests' clock, also on a day the clocks change) and
// today's day of it (0 on Monday to 6 on Sunday).
/**
 * @param {number} now
 * @param {Content} content
 * @returns {{ key: string, startsAt: number, endsAt: number, battles: number[], today: number }}
 */
export function warWeek(now, content) {
  // quests.js is not checked yet: its periods are typed here.
  const week = /** @type {Period} */ (questPeriod('weekly', now, content));
  const day = /** @type {Period} */ (questPeriod('daily', now, content));
  const { battleHour } = warRules(content);
  /** @type {number[]} */
  const battles = Array.from({ length: WAR_DAYS }, (_, index) => zoneTime(week.startsAt, content.quests.timeZone, index, battleHour));
  const today = Math.min(WAR_DAYS - 1, Math.max(0, Math.round((day.startsAt - week.startsAt) / DAY)));
  return { key: week.key, startsAt: week.startsAt, endsAt: week.endsAt, battles, today };
}

// How many of a week's evenings (warWeek) have their battles due by `now`.
/**
 * @param {{ battles: number[] }} week
 * @param {number} now
 * @returns {number}
 */
export const warDaysDue = (week, now) => week.battles.filter((at) => at <= now).length;

// A guild's teams (12): `members`, the ids of its members in the order they
// joined, and `slots`, the places they took ({ characterId, team, slot }).
// `count` teams (warTeams); `assigned`, each team's members in its places,
// by place; `reserve`, the members in none, also those in a team the guild
// has no more, in their order; `lineups`, the teams as they fight now, the
// reserve taking their free places in its order, team by team; `bench`, the
// reserve left over.
/**
 * @param {{ members: number[], slots: { characterId: number, team: number, slot: number }[] }} guild
 * @param {Content} content
 * @returns {{ count: number, assigned: number[][], reserve: number[], lineups: number[][], bench: number[] }}
 */
export function warLineups({ members, slots }, content) {
  const { teamSize } = warRules(content);
  const count = warTeams(members.length, content);
  const inGuild = new Set(members);
  /** @type {number[][]} */
  const assigned = Array.from({ length: count }, () => []);
  /** @type {Set<number>} */
  const placed = new Set();
  const ordered = [...slots].sort((a, b) => a.team - b.team || a.slot - b.slot);
  for (const one of ordered) {
    if (one.team < 1 || one.team > count || !inGuild.has(one.characterId) || placed.has(one.characterId)) continue;
    if (assigned[one.team - 1].length >= teamSize) continue;
    assigned[one.team - 1].push(one.characterId);
    placed.add(one.characterId);
  }
  const reserve = members.filter((id) => !placed.has(id));
  const waiting = [...reserve];
  const lineups = assigned.map((team) => {
    const lineup = [...team];
    while (lineup.length < teamSize && waiting.length > 0) lineup.push(/** @type {number} */ (waiting.shift()));
    return lineup;
  });
  return { count, assigned, reserve, lineups, bench: waiting };
}

// An evening's battles (795 B): as many as the bigger of the two guilds has
// teams, team by team; the smaller one's teams fight in turn, a few times
// each (2 teams against 4: I–I, II–II, I–III, II–IV). `a` and `b` are the
// teams (from 1) of the two guilds in each.
/**
 * @param {number} teamsA
 * @param {number} teamsB
 * @returns {{ number: number, a: number, b: number }[]}
 */
export function warPairings(teamsA, teamsB) {
  if (teamsA < 1 || teamsB < 1) return [];
  return Array.from({ length: Math.max(teamsA, teamsB) }, (_, number) => ({ number, a: (number % teamsA) + 1, b: (number % teamsB) + 1 }));
}

// How many times each team of a guild of `own` teams fights in an evening
// against one of `other` teams (warPairings).
/**
 * @param {number} own
 * @param {number} other
 * @returns {number[]}
 */
export function teamFights(own, other) {
  const fights = Array.from({ length: own }, () => 0);
  for (const pairing of warPairings(own, other)) fights[pairing.a - 1] += 1;
  return fights;
}

// Whether two guilds ({ members, users }: their number of members and the
// accounts that play in them) may be drawn for a war (797 B): of a similar
// size, the smaller with at least match.minShare of the bigger's members,
// and with no account playing in both, so no player fights himself.
/** @typedef {{ id: number, members: number, users: number[] }} WarGuild A guild as the draw of the wars sees it. */
/**
 * @param {WarGuild} a
 * @param {WarGuild} b
 * @param {Content} content
 * @returns {boolean}
 */
export function warRivals(a, b, content) {
  const { minShare } = warRules(content).match;
  const small = Math.min(a.members, b.members);
  const big = Math.max(a.members, b.members);
  if (small < 1 || small < big * minShare) return false;
  const users = new Set(a.users);
  return !b.users.some((user) => users.has(user));
}

// The wars of a week (797 B): pairs of the `guilds` ({ id, members, users },
// warRivals), drawn with `seed`. The guilds come in an order the seed
// shuffles; each time, the guild with the fewest rivals left (the first such
// in that order) gets one of them at random, so as many guilds as can be
// get a war. A guild left without a rival has no war that week (12).
/**
 * @template {WarGuild} G
 * @param {G[]} guilds
 * @param {string | number} seed
 * @param {Content} content
 * @returns {[G, G][]}
 */
export function drawWars(guilds, seed, content) {
  const rng = createRng(`guild-wars:${seed}`);
  let left = [...guilds].sort((a, b) => a.id - b.id);
  for (let index = left.length - 1; index > 0; index--) {
    const other = rng.int(0, index);
    [left[index], left[other]] = [left[other], left[index]];
  }
  /** @type {[G, G][]} */
  const pairs = [];
  while (left.length > 1) {
    const options = left.map((guild) => left.filter((other) => other !== guild && warRivals(guild, other, content)));
    let pick = -1;
    for (let index = 0; index < left.length; index++) {
      if (options[index].length > 0 && (pick < 0 || options[index].length < options[pick].length)) pick = index;
    }
    if (pick < 0) break;
    const guild = left[pick];
    const rival = options[pick][rng.int(0, options[pick].length - 1)];
    pairs.push([guild, rival]);
    left = left.filter((one) => one !== guild && one !== rival);
  }
  return pairs;
}

// A battle (798 A): the fighters of two teams ({ character, equipped, name },
// the characters as they are saved), `sideA` at the bottom of its playback
// and `sideB` at the top, from the server's `seed`: the same fighters and
// seed, the same battle. Each fights as at the Arena (duelist): without
// companions, mercenaries or potions, at full HP times the duel's factor and
// with the duel's share of its armour, both at the average level of all of
// them. The side with someone still standing wins; one that goes on and on
// is ended by the judge after battle.movesPerFighter moves for each fighter,
// the side with the bigger share of its HP left winning, or a draw when the
// shares differ by battle.drawMargin at most, the judge's words closing the
// log. `result`: 'a', 'b' or 'draw'; `standing`, the indexes of the fighters
// of each side still on their feet; `fight`, for the playback
// (src/client/arena.js), from side A's place.
/**
 * @param {{ sideA: Fighter[], sideB: Fighter[], seed: string | number }} battleOf
 * @param {Content} content
 */
export function warBattle({ sideA, sideB, seed }, content) {
  const { battle, texts } = warRules(content);
  /** @param {Fighter[]} side */
  const average = (side) => side.reduce((sum, one) => sum + one.character.level, 0) / side.length;
  const level = (average(sideA) + average(sideB)) / 2;
  const shape = { factor: duelHpFactor(level, level, content), armor: duelArmorShare(level, level, content) };
  const allies = sideA.map((one, index) => duelist(one, `a${index}`, 'ally', shape, content));
  const enemies = sideB.map((one, index) => duelist(one, `e${index}`, 'enemy', shape, content));
  const moves = battle.movesPerFighter * (allies.length + enemies.length);
  // combat.js is not checked yet.
  const fight = simulateFight(/** @type {any} */ ({ allies, enemies, rng: createRng(`guild-war:${seed}`), content, record: true, maxActions: moves, even: true }));
  /** @type {Map<string, number>} */
  const hpOf = new Map(fight.units.map((/** @type {{ id: string, hp: number }} */ unit) => [unit.id, unit.hp]));
  /** @param {Record<string, any>[]} units */
  const left = (units) => units.reduce((sum, unit) => sum + Math.max(0, hpOf.get(unit.id) ?? 0), 0) / units.reduce((sum, unit) => sum + unit.maxHp, 0);
  const limit = fight.won === null;
  /** @type {'a' | 'b' | 'draw'} */
  let result;
  if (!limit) result = fight.won ? 'a' : 'b';
  else {
    const lead = left(allies) - left(enemies);
    result = Math.abs(lead) <= battle.drawMargin ? 'draw' : lead > 0 ? 'a' : 'b';
  }
  /** @type {Record<string, any>[]} */
  const events = [...fight.events];
  if (limit) events.push({ t: (events.at(-1)?.t ?? 0) + 1, kind: 'limit', text: say(texts, result === 'draw' ? 'limitDraw' : 'limitWin', 0, { moves }) });
  /** @param {Record<string, any>[]} units */
  const standing = (units) => units.flatMap((unit, index) => ((hpOf.get(unit.id) ?? 0) > 0 ? [index] : []));
  return {
    result,
    limit,
    standing: { a: standing(allies), b: standing(enemies) },
    fight: {
      allies: allies.map((unit) => combatantView(unit, Math.round(average(sideB)), content)),
      enemies: enemies.map((unit) => combatantView(unit, Math.round(average(sideA)), content)),
      events,
      won: result === 'a' ? true : result === 'b' ? false : null,
      ...(result === 'draw' && { draw: true }),
    },
  };
}

// A battle's playback (warBattle's `fight`, side A at the bottom) as side B
// watches it: its own team at the bottom, the result its own.
/**
 * @param {{ allies: Record<string, any>[], enemies: Record<string, any>[], won: boolean | null } & Record<string, any>} fight
 * @param {'a' | 'b'} side
 */
export function warFightFor(fight, side) {
  if (side === 'a') return fight;
  /** @param {Record<string, any>} unit */
  const turned = (unit) => ({ ...unit, side: unit.side === 'ally' ? 'enemy' : 'ally' });
  return { ...fight, allies: fight.enemies.map(turned), enemies: fight.allies.map(turned), won: fight.won === null ? null : !fight.won };
}

// What a battle won brings a character of `level` who fought in it (799 A):
// reward.gold.base + reward.gold.perLevel × its level, and
// reward.systemPoints Punkty Systemu.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {{ gold: number, systemPoints: number }}
 */
export function warReward(level, content) {
  const { gold, systemPoints } = warRules(content).reward;
  return { gold: Math.round(gold.base + gold.perLevel * level), systemPoints };
}

// A war's result by the battles each side won by Sunday: 'a', 'b' or
// 'draw', in which nobody wins it.
/**
 * @param {number} winsA
 * @param {number} winsB
 * @returns {'a' | 'b' | 'draw'}
 */
export const warResult = (winsA, winsB) => (winsA > winsB ? 'a' : winsB > winsA ? 'b' : 'draw');

// The war chest of the guild that won (799 A), for its Skrzynia: chest.perTeam
// items for each of its `teams`, each of the class, at the level and for the
// class level of one of the characters who fought for it in the war
// (`fighters`: { classId, level, classLevel }), drawn in turn without one
// twice while others are left, of a champion's rarity, as the Bestia's and
// the Wyprawa's chests give. The same seed, the same chest.
/** @typedef {{ classId: string, level: number, classLevel: number }} WarFighter A character who fought in a war, for its chest. */
/**
 * @param {{ fighters: WarFighter[], teams: number, seed: string | number }} war
 * @param {Content} content
 * @returns {Record<string, any>[]}
 */
export function warChest({ fighters, teams, seed }, content) {
  const count = teams * warRules(content).chest.perTeam;
  if (fighters.length === 0) return [];
  const rng = createRng(`guild-war-chest:${seed}`);
  /** @type {WarFighter[]} */
  const pool = [];
  /** @type {Record<string, any>[]} */
  const items = [];
  for (let index = 0; index < count; index++) {
    if (pool.length === 0) pool.push(...fighters);
    const [one] = pool.splice(rng.int(0, pool.length - 1), 1);
    // items.js is not checked yet: its options are typed by their defaults
    // alone (classId and rarityId have none).
    items.push(randomItem(one.level, rng, content, /** @type {any} */ ({ classId: one.classId, maxClassLevel: one.classLevel, rarityId: championItemRarity(one.level, rng, content) })));
  }
  return items;
}

// The test version's mirror guild (DECISIONS.md, "Wojny gildii na wersji
// testowej"): one of its teams fights as one team of the guild it is at war
// with, its characters as they are saved, each under another name, one of
// the Karczma's names of its look (settlement.companions.names) that no
// fighter of the battle has (`taken`), drawn with `seed`.
/**
 * @template {Fighter} F
 * @param {F[]} fighters
 * @param {string | number} seed
 * @param {string[]} taken
 * @param {Content} content
 * @returns {F[]}
 */
export function mirrorTeam(fighters, seed, taken, content) {
  const rng = createRng(`guild-war-mirror:${seed}`);
  const used = new Set(taken);
  return fighters.map((fighter) => {
    /** @type {string[]} */
    const pool = content.settlement.companions.names[fighter.character.appearance === 'female' ? 'female' : 'male'];
    const free = pool.filter((name) => !used.has(name));
    const name = free.length > 0 ? rng.pick(free) : `${fighter.name} II`;
    used.add(name);
    return { ...fighter, name };
  });
}

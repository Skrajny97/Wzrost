// @ts-check
// The guild wars (data/guilds.json, war; src/server/guild-wars.js; DECISIONS.md,
// "Wojny gildii: odpowiedzi autora 792–800", "Wojny gildii na wersji
// testowej" and "Liga wojen gildii"). Since 16.11.2026 a league (the
// author: „niech każda gildia walczy z każdą”, „drużyny niech losuje samo”,
// „w formułach 1v1 i 3v3, gdzie drużyny dobierane są automatycznie i walczy
// każdy z każdym”, „walkower jak brakuje członków do obsadzenia wszystkich
// drużyn liczony jako porażka”, „Liczony łączny bilans wygranych i porażek
// (w tym walkowerów)”): a week, Monday to Sunday, with an evening's matches
// at battleHour on the Polish clock (794 A); every guild meets every other
// one once, in rounds drawn at random, whatever its number of members, and
// with an odd number of guilds one has each round's evening free (the
// author, 16.11.2026: „żadnych lustrzanych gildii”, „każda z każdą gildią
// 1v1 i 3v3 i tyle”). In a match every member of one
// guild duels every member of the other (1v1), and every trio of one, drawn
// by the game, fights every trio of the other (3v3); a trio the guild has
// too few members to fill loses its fights by walkover. A fight is as at
// the Arena, the characters as they are saved, without companions or
// mercenaries; the side with someone still standing wins (798 A). The
// week's table counts the fights won and lost, walkovers too; its best
// places on Sunday bring Sława and war chests, and every fight won brings
// its fighters gold (799 A). Pure: the seed and the time are the server's.

import { simulateFight } from './combat.js';
import { combatantView } from './combatant.js';
import { championItemRarity } from './hunt.js';
import { randomItem } from './items.js';
import { duelArmorShare, duelHpFactor, duelist, thirdFormHp } from './pvp-arena.js';
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

// How many trios a guild of `members` has for the 3v3 (teamSize each): as
// many as it takes for every member, at most maxTeams; the last one short
// of members when they do not divide by teamSize.
/**
 * @param {number} members
 * @param {Content} content
 * @returns {number}
 */
export function warTeams(members, content) {
  const { teamSize, maxTeams } = warRules(content);
  return Math.max(1, Math.min(maxTeams, Math.ceil(members / teamSize)));
}

// The members a guild needs for its last trio to be full, or null when it is
// (or the guild is).
/**
 * @param {number} members
 * @param {Content} content
 * @returns {number | null}
 */
export function nextTeamAt(members, content) {
  const { teamSize, maxTeams } = warRules(content);
  if (members % teamSize === 0 || members >= teamSize * maxTeams) return null;
  return Math.ceil(members / teamSize) * teamSize;
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

// A guild's trios for an evening's 3v3, drawn by the game (the author,
// 16.11.2026: „drużyny niech losuje samo”): `members`, the ids of its
// members, in an order the seed shuffles, teamSize to a trio; `count`
// trios (warTeams), the last one short of members when they do not divide;
// `lineups`, the trios, each by place; `bench`, members beyond the last
// trio (none in a guild of at most teamSize × maxTeams). The same members
// and seed, the same trios.
/**
 * @param {number[]} members
 * @param {string | number} seed
 * @param {Content} content
 * @returns {{ count: number, lineups: number[][], bench: number[] }}
 */
export function warDrawnTeams(members, seed, content) {
  const { teamSize } = warRules(content);
  const count = members.length === 0 ? 0 : warTeams(members.length, content);
  const rng = createRng(`guild-war-teams:${seed}`);
  const order = [...members].sort((a, b) => a - b);
  for (let index = order.length - 1; index > 0; index--) {
    const other = rng.int(0, index);
    [order[index], order[other]] = [order[other], order[index]];
  }
  const lineups = Array.from({ length: count }, (_, team) => order.slice(team * teamSize, (team + 1) * teamSize));
  return { count, lineups, bench: order.slice(count * teamSize) };
}

// The rounds of a league of `count` guilds, each meeting every other once
// (the circle method): `count` - 1 rounds, or `count` when it is odd, each
// a list of pairs of the guilds' places (from 0); in a league of an odd
// count, the place `count` is nobody's, and the guild drawn with it has
// the round free.
/**
 * @param {number} count
 * @returns {[number, number][][]}
 */
export function leagueRounds(count) {
  if (count < 1) return [];
  const places = count % 2 === 0 ? count : count + 1;
  const order = Array.from({ length: places }, (_, index) => index);
  /** @type {[number, number][][]} */
  const rounds = [];
  for (let round = 0; round < places - 1; round++) {
    rounds.push(Array.from({ length: places / 2 }, (_, index) => /** @type {[number, number]} */ ([order[index], order[places - 1 - index]])));
    // Every place but the first moves one on.
    order.splice(1, 0, /** @type {number} */ (order.pop()));
  }
  return rounds;
}

// The matches of a week's league (the author, 16.11.2026: „niech każda
// gildia walczy z każdą”, „każda z każdą gildią 1v1 i 3v3 i tyle”): the
// guilds (`ids`) in an order the seed shuffles, every one meeting every
// other once, their rounds (leagueRounds) a round an evening from
// `firstDay`; with more rounds than evenings, the rounds left go to the
// evenings again from the first. A guild with no rival in a round has that
// evening free: no match. A match: its evening (`day`, 0 Monday … 6
// Sunday), its round of the week (from 0) and its guilds. `order`, the
// guilds in the drawn order, as the table breaks its last ties.
/**
 * @param {number[]} ids
 * @param {string | number} seed
 * @param {number} firstDay
 * @returns {{ order: number[], matches: { day: number, round: number, a: number, b: number }[] }}
 */
export function leagueSchedule(ids, seed, firstDay) {
  const rng = createRng(`guild-league:${seed}`);
  const order = [...ids].sort((a, b) => a - b);
  for (let index = order.length - 1; index > 0; index--) {
    const other = rng.int(0, index);
    [order[index], order[other]] = [order[other], order[index]];
  }
  const rounds = leagueRounds(order.length);
  const evenings = Math.max(0, WAR_DAYS - firstDay);
  /** @type {{ day: number, round: number, a: number, b: number }[]} */
  const matches = [];
  if (evenings === 0) return { order, matches };
  rounds.forEach((pairs, round) => {
    const day = firstDay + (round % evenings);
    for (const [a, b] of pairs) {
      // The place no guild has: its rival's evening is free.
      if (order[a] === undefined || order[b] === undefined) continue;
      matches.push({ day, round, a: order[a], b: order[b] });
    }
  });
  matches.sort((x, y) => x.day - y.day || x.round - y.round);
  return { order, matches };
}

// The week's table of a league (the author: „Liczony łączny bilans
// wygranych i porażek (w tym walkowerów)”): each guild of `order` (the drawn
// order) with its matches played (`matches`: { a, b, winsA, winsB,
// lossesA, lossesB, result }, those fought), won, drawn and lost, and its
// fights won and lost in them, walkovers too; the best first: by the
// balance of the fights, then by the fights won, then in the drawn order.
// A void match counts for nobody.
/** @typedef {{ id: number, place: number, played: number, won: number, drawn: number, lost: number, fightsWon: number, fightsLost: number, balance: number }} LeagueRow A guild's row in the table. */
/**
 * @param {number[]} order
 * @param {{ a: number, b: number, winsA: number, winsB: number, lossesA: number, lossesB: number, result: string | null }[]} matches
 * @returns {LeagueRow[]}
 */
export function leagueTable(order, matches) {
  /** @type {Map<number, LeagueRow>} */
  const rows = new Map(order.map((id) => [id, { id, place: 0, played: 0, won: 0, drawn: 0, lost: 0, fightsWon: 0, fightsLost: 0, balance: 0 }]));
  /**
   * @param {number} id
   * @param {number} won
   * @param {number} lost
   * @param {'win' | 'loss' | 'draw'} outcome
   */
  const count = (id, won, lost, outcome) => {
    const row = rows.get(id);
    if (!row) return;
    row.played += 1;
    row.fightsWon += won;
    row.fightsLost += lost;
    row.balance = row.fightsWon - row.fightsLost;
    if (outcome === 'win') row.won += 1;
    else if (outcome === 'loss') row.lost += 1;
    else row.drawn += 1;
  };
  for (const match of matches) {
    // A match not fought yet, or void (one side had nobody to fight for
    // it), counts for neither guild.
    if (match.result !== 'a' && match.result !== 'b' && match.result !== 'draw') continue;
    count(match.a, match.winsA, match.lossesA, match.result === 'a' ? 'win' : match.result === 'b' ? 'loss' : 'draw');
    count(match.b, match.winsB, match.lossesB, match.result === 'b' ? 'win' : match.result === 'a' ? 'loss' : 'draw');
  }
  const position = new Map(order.map((id, index) => [id, index]));
  const table = [...rows.values()].sort(
    (x, y) => y.balance - x.balance || y.fightsWon - x.fightsWon || /** @type {number} */ (position.get(x.id)) - /** @type {number} */ (position.get(y.id)),
  );
  table.forEach((row, index) => {
    row.place = index + 1;
  });
  return table;
}

// What the best places of a finished league bring (league.prizes, the
// Sława of fame.war.places): for each place with a prize, while the league
// had at least the prize's `least` guilds, its guild, Sława and the number
// of the items of its war chest.
/**
 * @param {LeagueRow[]} table
 * @param {Content} content
 * @returns {{ id: number, place: number, fame: number, items: number }[]}
 */
export function leaguePrizes(table, content) {
  const { league } = warRules(content);
  const fame = content.guilds.fame.war.places;
  return league.prizes.flatMap((/** @type {{ least: number, items: number }} */ prize, /** @type {number} */ index) => {
    const row = table[index];
    if (!row || table.length < prize.least) return [];
    return [{ id: row.id, place: row.place, fame: fame[index] ?? 0, items: prize.items }];
  });
}

// The fights of a match (the author, 16.11.2026: „walczy każdy z każdym”,
// and after its first evening: „ci co jest ich 18 dzielą się na 6 drużyn i
// walczą z 10 drużynami renegatów, więc 4 walki są oddane walkowerem ale ze
// strony Pierwotnych”, and then: „jeśli gildia ma 6 drużyn tylko to
// walkowerem oddaje 40 walk ze 100 a nie 4”, „taka gildia musi wygrać
// większość swoich walk żeby prowadzić … kara za mniejszą ilość członków i
// ich siłę”): in the 1v1 every one of `duelsA` against every one of
// `duelsB`, and in the 3v3 as many fights as if both guilds had the trios
// of the one with more: every trio of `triosA` against every trio of
// `triosB`, a trio short of members too (it fights with fewer; one left
// with nobody is no trio), and each trio the guild with fewer lacks loses
// by walkover its fight against every trio of the rival (6 trios against
// 10: 60 fights and 40 walkovers). Each fight: its format, the places of
// its sides in their lists (from 0; -1 for a walkover's trio that is not
// there) and, for a walkover, who loses it ('a' or 'b').
/** @typedef {{ format: '1v1' | '3v3', a: number, b: number, walkover: 'a' | 'b' | null }} MatchFight A fight of a match. */
/**
 * @param {{ duelsA: number, duelsB: number, triosA: unknown[][], triosB: unknown[][] }} sides
 * @param {Content} _content
 * @returns {MatchFight[]}
 */
export function matchFights({ duelsA, duelsB, triosA, triosB }, _content) {
  /** @type {MatchFight[]} */
  const fights = [];
  for (let a = 0; a < duelsA; a++) for (let b = 0; b < duelsB; b++) fights.push({ format: '1v1', a, b, walkover: null });
  /** @param {unknown[][]} trios */
  const places = (trios) => trios.flatMap((trio, index) => (trio.length > 0 ? [index] : []));
  const teamsA = places(triosA);
  const teamsB = places(triosB);
  for (const a of teamsA) for (const b of teamsB) fights.push({ format: '3v3', a, b, walkover: null });
  for (let left = teamsA.length; left < teamsB.length; left++) for (const b of teamsB) fights.push({ format: '3v3', a: -1, b, walkover: 'a' });
  for (let left = teamsB.length; left < teamsA.length; left++) for (const a of teamsA) fights.push({ format: '3v3', a, b: -1, walkover: 'b' });
  return fights;
}

// A battle (798 A): the fighters of two teams ({ character, equipped, name },
// the characters as they are saved), `sideA` at the bottom of its playback
// and `sideB` at the top, from the server's `seed`: the same fighters and
// seed, the same battle. Each fights as at the Arena (duelist): without
// companions, mercenaries or potions, at full HP times the duel's factor and
// with the duel's share of its armour, both at the average level of all of
// them, the factor grown as a duel's where a third form fights
// (thirdFormHp). The side with someone still standing wins; one that goes on and on
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
  const third = thirdFormHp([...sideA, ...sideB].map((one) => one.character), content);
  const shape = { factor: duelHpFactor(level, level, content) * third, armor: duelArmorShare(level, level, content) };
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

// A result by the battles each side won: 'a', 'b' or 'draw', in which neither wins.
/**
 * @param {number} winsA
 * @param {number} winsB
 * @returns {'a' | 'b' | 'draw'}
 */
export const warResult = (winsA, winsB) => (winsA > winsB ? 'a' : winsB > winsA ? 'b' : 'draw');

// A war chest for a guild's Skrzynia (799 A, a place in the league's
// table): chest.perTeam items for each of `teams`, each of the class, at the level and for the
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

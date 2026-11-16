// The guild wars as a league (src/engine/guild-wars.js,
// src/server/guild-wars.js; the author's 792–800 and, from 16.11.2026,
// „niech każda gildia walczy z każdą”, „drużyny niech losuje samo”): in the
// engine, the teams of full fives (12) drawn for an evening, the matches'
// battles of 795 B, the league's rounds and its schedule, every guild
// meeting every other once, a free evening for the one with no rival in a
// round (16.11.2026: „żadnych lustrzanych gildii”, „każda z każdą gildią 1v1
// i 3v3 i tyle”), the table and the prizes of its best places, a battle of five on
// five as at the Arena, the rewards and the war chest, and the evenings at
// 20:00 Polish time, also on the day the clocks change; through the API
// (on the tests' own clock, so the same any day), the tab, the league drawn
// once a week for every guild there is, each evening's matches fought once
// by the cron at 20:00 with their rewards given once, each battle to watch
// from either side, the league's end with its places, Sława and war chests,
// an account on both sides of a match (it fights on both), "Test ligi" of the test version,
// and nothing of the wars where GUILD_WARS is off.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  createRng,
  leaguePrizes,
  leagueRounds,
  leagueSchedule,
  leagueTable,
  matchFights,
  nextTeamAt,
  questPeriod,
  warBattle,
  warChest,
  warDaysDue,
  warDrawnTeams,
  warFightFor,
  warResult,
  warReward,
  warTeams,
  warWeek,
  zoneClock,
} from '../src/engine/index.js';
import { playerOf } from '../tools/difficulty-sim.mjs';
import { makeClimber } from './helpers/climb.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const war = content.guilds.war;
const DAY = 24 * 3600000;
const fighter = (classId, level, name, set = 0, appearance = 'male') => {
  const { character, equipped } = playerOf('realistic', classId, level, content, set);
  return { character: { ...character, appearance }, equipped, name };
};

describe("the guild wars' rules", () => {
  test('a guild holds 30 members: ten trios for the 3v3, as many as it takes for every member, the last one short of members when they do not divide', () => {
    assert.equal(content.guilds.size, 30);
    assert.equal(war.teamSize, 3);
    assert.equal(war.teamSize * war.maxTeams, content.guilds.size);
    assert.deepEqual(
      [1, 4, 5, 9, 10, 14, 15, 24, 29, 30].map((members) => warTeams(members, content)),
      [1, 2, 2, 3, 4, 5, 5, 8, 10, 10],
    );
    // The members the last trio needs to be full, none when it is.
    assert.deepEqual([1, 2, 9, 12, 29, 30].map((members) => nextTeamAt(members, content)), [3, 3, null, null, 30, null]);
    // The tab is the last of nine.
    assert.equal(content.guilds.tabs.length, 9);
    assert.equal(content.guilds.tabs.at(-1).id, 'war');
  });

  test('the game draws the trios of an evening from the members, three to a trio, the last one short when they do not divide', () => {
    const members = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const teams = warDrawnTeams(members, 'evening', content);
    assert.equal(teams.count, 4);
    assert.deepEqual(
      teams.lineups.map((lineup) => lineup.length),
      [3, 3, 3, 2],
    );
    assert.deepEqual(teams.bench, []);
    assert.deepEqual(teams.lineups.flat().sort((a, b) => a - b), members);
    // The same members and seed, the same teams, whatever their order.
    assert.deepEqual(warDrawnTeams([...members].reverse(), 'evening', content), teams);
    const others = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((seed) => JSON.stringify(warDrawnTeams(members, seed, content).lineups)));
    assert.ok(others.size > 1, 'the seed draws the teams');
    // Three members: one full trio; one member: a trio of one.
    const few = warDrawnTeams([7, 8, 9], 'x', content);
    assert.deepEqual([few.count, few.lineups[0].length, few.bench], [1, 3, []]);
    assert.deepEqual(warDrawnTeams([4], 'x', content).lineups, [[4]]);
  });

  // The author, 16.11.2026: „ci co jest ich 18 dzielą się na 6 drużyn i
  // walczą z 10 drużynami renegatów, więc 4 walki są oddane walkowerem ale ze
  // strony Pierwotnych”.
  test('a match: every member duels every member of the rival (1v1), every trio fights every trio (3v3), a short trio too; the guild with fewer trios gives a walkover for each it lacks', () => {
    const fights = matchFights({ duelsA: 4, duelsB: 3, triosA: [[1, 2, 3], [4]], triosB: [[5, 6, 7]] }, content);
    const duels = fights.filter((fight) => fight.format === '1v1');
    assert.equal(duels.length, 12);
    assert.deepEqual(new Set(duels.map((fight) => `${fight.a}-${fight.b}`)).size, 12);
    assert.ok(duels.every((fight) => fight.walkover === null));
    assert.deepEqual(
      fights.filter((fight) => fight.format === '3v3').map((fight) => [fight.a, fight.b, fight.walkover]),
      [
        [0, 0, null],
        [1, 0, null],
        [-1, -1, 'b'],
      ],
    );
    // Two short trios fight each other.
    assert.deepEqual(
      matchFights({ duelsA: 1, duelsB: 1, triosA: [[1]], triosB: [[2, 3]] }, content).map((fight) => fight.walkover),
      [null, null],
    );
    // 18 members against 29: six trios against ten, the last one of two;
    // 60 fights, and 4 walkovers given by the guild of six.
    const trios = (members) => Array.from({ length: Math.ceil(members / 3) }, (_, index) => Array.from({ length: Math.min(3, members - index * 3) }, (__, one) => index * 3 + one));
    const big = matchFights({ duelsA: 18, duelsB: 29, triosA: trios(18), triosB: trios(29) }, content).filter((fight) => fight.format === '3v3');
    assert.equal(big.filter((fight) => fight.walkover === null).length, 60);
    assert.deepEqual(
      big.filter((fight) => fight.walkover !== null).map((fight) => fight.walkover),
      ['a', 'a', 'a', 'a'],
    );
    // A trio with none able to fight is no trio.
    assert.deepEqual(
      matchFights({ duelsA: 1, duelsB: 1, triosA: [[1, 2, 3], []], triosB: [[4, 5, 6], [7, 8, 9]] }, content)
        .filter((fight) => fight.format === '3v3')
        .map((fight) => [fight.a, fight.b, fight.walkover]),
      [
        [0, 0, null],
        [0, 1, null],
        [-1, -1, 'a'],
      ],
    );
  });

  test('every guild meets every other in the rounds of a league; with an odd number, the one with no rival has the round free', () => {
    for (const count of [2, 3, 4, 5, 6, 7, 8]) {
      const rounds = leagueRounds(count);
      assert.equal(rounds.length, count % 2 === 0 ? count - 1 : count, `${count} guilds`);
      const met = new Map();
      for (const round of rounds) {
        const places = round.flat();
        assert.equal(new Set(places).size, places.length, 'a guild once a round');
        for (const [a, b] of round) {
          if (a >= count || b >= count) continue;
          const key = [a, b].sort().join('-');
          met.set(key, (met.get(key) ?? 0) + 1);
        }
      }
      assert.equal(met.size, (count * (count - 1)) / 2, `${count} guilds: every pair`);
      assert.ok([...met.values()].every((times) => times === 1));
    }
    assert.deepEqual(leagueRounds(0), []);
    assert.deepEqual(leagueRounds(1), [[[0, 1]]]);
  });

  test("the week's schedule: every guild meets every other once, a round an evening from the first to come; more rounds than evenings share them; an odd number leaves one free each evening", () => {
    // Four guilds: three rounds, Monday to Wednesday, every pair once.
    const four = leagueSchedule([10, 20, 30, 40], 'week', 0);
    assert.deepEqual([...four.order].sort(), [10, 20, 30, 40]);
    assert.equal(four.matches.length, 6);
    for (let day = 0; day < 3; day++) {
      const evening = four.matches.filter((match) => match.day === day);
      assert.equal(evening.length, 2);
      assert.deepEqual(evening.flatMap((match) => [match.a, match.b]).sort(), [10, 20, 30, 40], 'every guild fights every evening');
    }
    assert.equal(four.matches.filter((match) => match.day > 2).length, 0, 'no rematches');
    const pairs = new Set(four.matches.map((match) => [match.a, match.b].sort().join('-')));
    assert.equal(pairs.size, 6, 'every pair once');
    // The same guilds and seed, the same schedule; another seed, another.
    assert.deepEqual(leagueSchedule([40, 30, 20, 10], 'week', 0), four);
    assert.ok(new Set(['a', 'b', 'c', 'd'].map((seed) => JSON.stringify(leagueSchedule([10, 20, 30, 40], seed, 0).matches))).size > 1);
    // Three guilds: three evenings with a match each, the third guild free.
    const three = leagueSchedule([1, 2, 3], 'odd', 0);
    assert.equal(three.matches.length, 3);
    for (let day = 0; day < 3; day++) assert.equal(three.matches.filter((match) => match.day === day).length, 1);
    assert.equal(new Set(three.matches.map((match) => [match.a, match.b].sort().join('-'))).size, 3);
    assert.ok(three.matches.every((match) => match.a !== match.b && [1, 2, 3].includes(match.a) && [1, 2, 3].includes(match.b)));
    // A league drawn on Thursday: from Thursday.
    const late = leagueSchedule([1, 2, 3, 4], 'late', 3);
    assert.deepEqual([...new Set(late.matches.map((match) => match.day))], [3, 4, 5]);
    // Six guilds drawn on Saturday: five rounds on two evenings, every pair once.
    const weekend = leagueSchedule([1, 2, 3, 4, 5, 6], 'weekend', 5);
    assert.deepEqual([...new Set(weekend.matches.map((match) => match.day))], [5, 6]);
    assert.equal(new Set(weekend.matches.map((match) => [match.a, match.b].sort().join('-'))).size, 15);
    // Nine guilds: nine rounds on seven evenings, every pair once, the last two rounds on Monday and Tuesday.
    const nine = leagueSchedule([1, 2, 3, 4, 5, 6, 7, 8, 9], 'nine', 0);
    assert.equal(nine.matches.length, 36);
    assert.equal(new Set(nine.matches.map((match) => [match.a, match.b].sort().join('-'))).size, 36);
    assert.equal(Math.max(...nine.matches.map((match) => match.round)), 8);
    assert.deepEqual([...new Set(nine.matches.filter((match) => match.round >= 7).map((match) => match.day))], [0, 1]);
    // One guild has nobody to play; none, nothing.
    assert.deepEqual(leagueSchedule([5], 'one', 0).matches, []);
    assert.deepEqual(leagueSchedule([], 'none', 0).matches, []);
    assert.deepEqual(leagueSchedule([1, 2], 'over', 7).matches, []);
  });

  test("the table: the balance of the fights won and lost, walkovers too, then the fights won, then the drawn order; void matches count for nobody", () => {
    const matches = [
      { a: 1, b: 2, winsA: 30, winsB: 10, lossesA: 10, lossesB: 30, result: 'a' },
      { a: 2, b: 3, winsA: 12, winsB: 4, lossesA: 4, lossesB: 14, result: 'a' },
      { a: 3, b: 1, winsA: 5, winsB: 5, lossesA: 5, lossesB: 5, result: 'draw' },
      { a: 3, b: 1, winsA: 0, winsB: 0, lossesA: 0, lossesB: 0, result: 'void' },
      { a: 2, b: 1, winsA: 0, winsB: 0, lossesA: 0, lossesB: 0, result: null },
    ];
    const table = leagueTable([3, 1, 2], matches);
    assert.deepEqual(
      table.map((row) => [row.place, row.id, row.played, row.won, row.drawn, row.lost, row.fightsWon, row.fightsLost, row.balance]),
      [
        [1, 1, 2, 1, 1, 0, 35, 15, 20],
        [2, 3, 2, 0, 1, 1, 9, 19, -10],
        [3, 2, 2, 1, 0, 1, 22, 34, -12],
      ],
    );
    // As good a balance: more fights won, then the drawn order.
    const even = leagueTable(
      [7, 8, 9],
      [
        { a: 7, b: 9, winsA: 1, winsB: 0, lossesA: 0, lossesB: 1, result: 'a' },
        { a: 8, b: 9, winsA: 2, winsB: 1, lossesA: 1, lossesB: 2, result: 'a' },
      ],
    );
    assert.deepEqual(
      even.map((row) => row.id),
      [8, 7, 9],
    );
    assert.deepEqual(
      leagueTable([7, 8], []).map((row) => row.id),
      [7, 8],
    );
  });

  test('the best places bring Sława and war chests: the first three items from two guilds, the second one item from three, the third Sława from four', () => {
    const places = content.guilds.fame.war.places;
    assert.deepEqual(places, [100, 60, 30]);
    const row = (id, place) => ({ id, place, played: 0, won: 0, drawn: 0, lost: 0, fightsWon: 0, fightsLost: 0, balance: 0 });
    const four = [row(1, 1), row(2, 2), row(3, 3), row(4, 4)];
    assert.deepEqual(leaguePrizes(four, content), [
      { id: 1, place: 1, fame: 100, items: 3 },
      { id: 2, place: 2, fame: 60, items: 1 },
      { id: 3, place: 3, fame: 30, items: 0 },
    ]);
    assert.deepEqual(
      leaguePrizes(four.slice(0, 3), content).map((prize) => prize.place),
      [1, 2],
    );
    assert.deepEqual(
      leaguePrizes(four.slice(0, 2), content).map((prize) => prize.place),
      [1],
    );
    assert.deepEqual(leaguePrizes(four.slice(0, 1), content), []);
  });

  test('the evenings are at 20:00 Polish time, also the Sunday the clocks go back; the league is from Monday', () => {
    // The week of 19–25 October 2026: the clocks go back on Sunday.
    const at = Date.UTC(2026, 9, 21, 9);
    const week = warWeek(at, content);
    assert.equal(week.key, '2026-10-19');
    assert.equal(week.today, 2);
    for (const [index, moment] of week.battles.entries()) {
      const clock = zoneClock(moment, 'Europe/Warsaw');
      assert.deepEqual([clock.day, clock.hour, clock.minute], [19 + index, 20, 0]);
    }
    assert.equal(week.battles[0], Date.UTC(2026, 9, 19, 18));
    assert.equal(week.battles[6], Date.UTC(2026, 9, 25, 19));
    assert.equal(week.startsAt, questPeriod('weekly', at, content).startsAt);
    assert.equal(warDaysDue(week, week.battles[0] - 1), 0);
    assert.equal(warDaysDue(week, week.battles[0]), 1);
    assert.equal(warDaysDue(week, week.battles[6] + 1), 7);
  });

  test('a battle of five on five is the same for the same fighters and seed; the side with someone standing wins (798 A)', () => {
    const ours = ['warrior', 'cleric', 'shadow', 'archer', 'mage'].map((classId, index) => fighter(classId, 100, `Nasz${index}`, index));
    const theirs = ['warrior', 'cleric', 'shadow', 'archer', 'mage'].map((classId, index) => fighter(classId, 100, `Ich${index}`, index + 3));
    const battle = warBattle({ sideA: ours, sideB: theirs, seed: 'war-1' }, content);
    assert.deepEqual(warBattle({ sideA: ours, sideB: theirs, seed: 'war-1' }, content), battle);
    assert.equal(battle.fight.allies.length, 5);
    assert.equal(battle.fight.enemies.length, 5);
    assert.deepEqual(battle.fight.allies.map((unit) => unit.name), ours.map((one) => one.name));
    assert.ok(['a', 'b', 'draw'].includes(battle.result));
    if (!battle.limit) {
      const winner = battle.result === 'a' ? battle.standing.a : battle.standing.b;
      const loser = battle.result === 'a' ? battle.standing.b : battle.standing.a;
      assert.ok(winner.length > 0);
      assert.equal(loser.length, 0);
    }
    assert.equal(battle.fight.won, battle.result === 'a' ? true : battle.result === 'b' ? false : null);
    // Without companions, mercenaries or potions.
    assert.ok(battle.fight.events.every((event) => event.kind !== 'potion'));
    // A strong team against a weak one wins; three on five fight too.
    const strong = ['warrior', 'cleric', 'mage'].map((classId, index) => fighter(classId, 200, `Silny${index}`, index));
    const weak = ['warrior', 'cleric', 'shadow', 'archer', 'mage'].map((classId, index) => fighter(classId, 40, `Słaby${index}`, index));
    const uneven = warBattle({ sideA: strong, sideB: weak, seed: 'war-2' }, content);
    assert.equal(uneven.result, 'a');
    assert.equal(uneven.fight.allies.length, 3);
    // The judge ends a battle that goes on: more HP left wins, as much is a draw.
    const judged = warBattle({ sideA: ours, sideB: theirs, seed: 'war-1' }, { ...content, guilds: { ...content.guilds, war: { ...war, battle: { movesPerFighter: 0, drawMargin: 0.02 } } } });
    assert.equal(judged.limit, true);
    assert.equal(judged.result, 'draw');
    assert.equal(judged.fight.events.at(-1).kind, 'limit');
    // Watched from side B: its team at the bottom, its result its own.
    const turned = warFightFor(battle.fight, 'b');
    assert.deepEqual(turned.allies.map((unit) => unit.name), theirs.map((one) => one.name));
    assert.ok(turned.allies.every((unit) => unit.side === 'ally'));
    assert.equal(turned.won, battle.fight.won === null ? null : !battle.fight.won);
    assert.equal(warFightFor(battle.fight, 'a'), battle.fight);
  });

  test('two equal teams win about as often on either side: both pick their targets alike', () => {
    const team = ['warrior', 'cleric', 'shadow', 'archer', 'mage'].map((classId, index) => fighter(classId, 100, `Nasz${index}`, index));
    const mirror = team.map((one, index) => ({ ...one, name: `Ich${index}` }));
    let first = 0;
    for (let seed = 0; seed < 80; seed++) if (warBattle({ sideA: team, sideB: mirror, seed: `even-${seed}` }, content).result === 'a') first += 1;
    assert.ok(first >= 26 && first <= 54, `side A won ${first} of 80`);
  });

  test("a fight won brings gold by the character's level; the guild with the better balance wins the match (799 A)", () => {
    assert.deepEqual(warReward(100, content), { gold: Math.round(war.reward.gold.base + war.reward.gold.perLevel * 100), systemPoints: war.reward.systemPoints });
    assert.deepEqual([warResult(4, 3), warResult(2, 5), warResult(3, 3), warResult(0, 0)], ['a', 'b', 'draw', 'draw']);
  });

  test("the war chest holds an item of a champion's rarity for each team, each for one of the characters who fought", () => {
    const fighters = [
      { classId: 'warrior', level: 80, classLevel: 75 },
      { classId: 'mage', level: 90, classLevel: 88 },
    ];
    const items = warChest({ fighters, teams: 3, seed: 'chest' }, content);
    assert.equal(items.length, 3 * war.chest.perTeam);
    assert.deepEqual(warChest({ fighters, teams: 3, seed: 'chest' }, content), items);
    const champion = new Set(content.balance.rewards.championItems.flatMap((step) => Object.keys(step.rarities)));
    for (const item of items) {
      assert.ok([80, 90].includes(item.level));
      assert.ok(champion.has(item.rarity));
    }
    // Both fighters' classes before either again.
    const classes = items.slice(0, 2).map((item) => (item.level === 80 ? 'warrior' : 'mage')).sort();
    assert.deepEqual(classes, ['mage', 'warrior']);
    assert.deepEqual(warChest({ fighters: [], teams: 2, seed: 'chest' }, content), []);
  });
});

describe('the guild wars through the API', () => {
  // The tests' own clock (TEST_CLOCK): every request and the cron at the
  // moments a test sets, in the week after this one, so the same any day.
  const { server, call, db, signUp } = useServer({ GUILD_WARS: 'on', TEST_CLOCK: 'on' });
  const cookies = {};
  const ids = {};
  const league = warWeek(Date.now() + 7 * DAY, content);
  let clock = league.startsAt + 3600000;
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body, now: clock });
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  const all = async (sql, ...binds) => (await (await db()).prepare(sql).bind(...binds).all()).results;
  const cron = (at) => server.getWorker().scheduled({ cron: '* * * * *', scheduledTime: new Date(at) });

  async function player(login, name, { level = 40, classId = 'warrior' } = {}) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId, appearance: 'female' } });
    await run('UPDATE characters SET level = ?, gold = 5000 WHERE name = ?', level, name);
    ids[login] = (await first('SELECT id FROM characters WHERE name = ?', name)).id;
  }

  async function guild(leader, name, tag, members = []) {
    assert.equal((await as(leader, 'POST', '/api/guild/found', { name, tag })).status, 200);
    const guildId = (await as(leader, 'GET', '/api/guild')).data.guild.id;
    for (const login of members) {
      await as(leader, 'POST', '/api/guild/invite', { name: login });
      assert.equal((await as(login, 'POST', '/api/guild/accept', { guildId })).status, 200);
    }
    return guildId;
  }

  // A copy of a character of the same account (set aside, so it plays no
  // part but its guild's), in a guild by itself.
  async function clone(fromId, name, guildId) {
    const { id: _, ...row } = await first('SELECT * FROM characters WHERE id = ?', fromId);
    const data = { ...row, name, name_key: name.toLowerCase(), role: 'aside' };
    const columns = Object.keys(data);
    await run(`INSERT INTO characters (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, ...columns.map((column) => data[column]));
    const id = (await first('SELECT id FROM characters WHERE name_key = ?', name.toLowerCase())).id;
    await run("INSERT INTO guild_members (character_id, guild_id, role, joined_at) VALUES (?, ?, 'member', ?)", id, guildId, clock);
    return id;
  }

  // The guilds are made the evening before the league's week, after the
  // last battles of the week before (whose league a look at them draws
  // with no matches), so the cron draws the league on its Monday.
  beforeEach(() => {
    for (const key of Object.keys(cookies)) delete cookies[key];
    clock = league.startsAt - 3600000;
  });

  test('the tab: the teams the game draws, the members, the league and the words; a guild may take 30 members', async () => {
    await player('lider', 'Lider');
    await player('druh', 'Druh');
    await player('wrog', 'Wróg');
    const guildId = await guild('lider', 'Leśni Bracia', 'LB', ['druh']);
    await guild('wrog', 'Wrogowie', 'WR');
    const tabs = (await call('GET', '/api/content')).data.guildTabs.map((tab) => tab.id);
    assert.equal(tabs.at(-1), 'war');
    clock = league.startsAt + 3600000;
    const view = (await as('lider', 'GET', '/api/guild/war')).data;
    assert.equal(view.guild.id, guildId);
    assert.deepEqual([view.teams.count, view.teams.size, view.teams.max, view.teams.members, view.teams.next, view.teams.day], [1, 3, 10, 2, 3, 0]);
    assert.deepEqual([...view.teams.lineups[0]].sort(), [ids.lider, ids.druh].sort());
    assert.deepEqual(view.teams.bench, []);
    assert.equal(view.me.team, 1);
    assert.equal(view.members[ids.druh].name, 'Druh');
    assert.equal(view.members[ids.lider].role, 'leader');
    // Two guilds: one match, on Monday, and no rematch.
    assert.equal(view.league.guilds, 2);
    assert.deepEqual(
      view.league.table.map((row) => [row.tag, row.balance, row.ours]).sort(),
      [
        ['LB', 0, true],
        ['WR', 0, false],
      ],
    );
    assert.equal(view.league.next.day, 0);
    assert.equal(view.league.next.at, league.battles[0]);
    const [match] = view.league.next.matches;
    // Two members against one: 2 × 1 duels and one trio against one, both short of members and fighting with fewer.
    assert.deepEqual([match.rival.tag, match.rival.name, match.rival.trios, match.duels, match.trioFights, match.walkovers], ['WR', 'Wrogowie', 1, 2, 1, { ours: 0, theirs: 0 }]);
    assert.equal(view.league.days.length, 7);
    assert.deepEqual(
      view.league.days.map((day) => [day.matches.length, day.free]),
      [[1, false], ...Array.from({ length: 6 }, () => [0, false])],
    );
    assert.equal(view.none, null);
    assert.equal(view.texts.title, war.texts.title);
    assert.ok(view.texts.how.some((line) => line.includes('20:00')));
    assert.ok(view.texts.how.some((line) => line.includes(`${content.guilds.fame.war.places[0]} punktów Sławy`)));
    assert.equal(view.texts.errors, undefined);
    // Outside a guild, the words alone.
    await player('obcy', 'Obcy');
    const outside = (await as('obcy', 'GET', '/api/guild/war')).data;
    assert.equal(outside.guild, null);
    assert.equal(outside.texts.noGuild, war.texts.noGuild);
    // A guild made after the draw waits for the next league.
    await guild('obcy', 'Spóźnieni', 'SPÓ');
    const late = (await as('obcy', 'GET', '/api/guild/war')).data;
    assert.deepEqual([late.league, late.none], [null, 'late']);
    // 30 members: the 21st joins.
    const database = await db();
    await database.batch(Array.from({ length: 18 }, (_, index) => database.prepare("INSERT INTO guild_members (character_id, guild_id, role, joined_at) VALUES (?, ?, 'member', 0)").bind(100000 + index, guildId)));
    await player('nowy', 'Nowy');
    await as('lider', 'POST', '/api/guild/invite', { name: 'Nowy' });
    assert.equal((await as('nowy', 'POST', '/api/guild/accept', { guildId })).status, 200);
  });

  test("the league: drawn on Monday for every guild whatever its size; each evening's matches fought once at 20:00, their rewards given once; the table; each battle to watch from either side; the end brings Sława and war chests", async () => {
    await player('alfa', 'Alfa', { level: 60 });
    await player('beta', 'Beta', { level: 30, classId: 'mage' });
    await player('gamma', 'Gamma', { level: 30 });
    await makeClimber(await db(), ids.alfa);
    const strong = await guild('alfa', 'Mocarze', 'MOC');
    const weak = await guild('beta', 'Słabi', 'SŁ');
    // A guild of three, of another size than the others: in the league too.
    const third = await guild('gamma', 'Trzeci', 'TRZ');
    await clone(ids.gamma, 'Gammi', third);
    await clone(ids.gamma, 'Gammo', third);
    const days = league.battles;
    await cron(league.startsAt + 60000);
    await cron(league.startsAt + 120000);
    const drawn = await first('SELECT * FROM guild_war_weeks WHERE week = ?', league.key);
    assert.deepEqual(JSON.parse(drawn.guilds).map((one) => one.id).sort(), [strong, weak, third].sort());
    assert.equal(drawn.first_day, 0);
    const matches = await all('SELECT * FROM guild_wars WHERE week = ? ORDER BY day, round', league.key);
    // Three guilds: a match on each of three evenings, every pair once, the
    // third guild free; nothing from Thursday.
    assert.deepEqual(
      matches.map((match) => match.day),
      [0, 1, 2],
    );
    const versus = (one, other) => matches.filter((match) => [match.guild_a, match.guild_b].sort().join() === [one, other].sort().join());
    assert.deepEqual([versus(strong, weak).length, versus(strong, third).length, versus(weak, third).length], [1, 1, 1]);
    // Before 20:00 nothing; at 20:00 Monday's match, once.
    await cron(days[0] - 60000);
    assert.equal((await all('SELECT * FROM guild_war_battles')).length, 0);
    const gold = async (id) => first('SELECT gold, system_points FROM characters WHERE id = ?', id);
    const before = await gold(ids.alfa);
    await cron(days[0]);
    const monday = await all('SELECT * FROM guild_wars WHERE week = ? AND day = 0', league.key);
    assert.equal(monday.length, 1);
    assert.equal(monday[0].days_done, 1);
    const mondayFights = (await all('SELECT * FROM guild_war_battles')).length;
    await cron(days[0] + 60000);
    assert.equal((await all('SELECT * FROM guild_war_battles')).length, mondayFights);
    // Alfa's first match (Monday's or, when Alfa is free on Monday,
    // Tuesday's): one 1v1 against each member of the rival and its trio of
    // one, short, against the rival's trio; gold for each fight won and
    // Punkty Systemu for the match won.
    const alfaMatches = matches.filter((row) => row.guild_a === strong || row.guild_b === strong);
    assert.equal(alfaMatches.length, 2);
    const alfaDay = alfaMatches[0].day;
    await cron(days[alfaDay]);
    const alfaMonday = await first('SELECT * FROM guild_wars WHERE id = ?', alfaMatches[0].id);
    const fights = await all('SELECT b.* FROM guild_war_battles b JOIN guild_wars w ON w.id = b.war_id WHERE w.week = ? AND w.day = ?', league.key, alfaDay);
    const after = await gold(ids.alfa);
    await cron(days[alfaDay] + 60000);
    assert.deepEqual(await gold(ids.alfa), after);
    const alfaSide = alfaMonday.guild_a === strong ? 'a' : 'b';
    const rival = alfaMonday[alfaSide === 'a' ? 'guild_b' : 'guild_a'];
    const rivalMembers = rival === third ? 3 : 1;
    const alfaFights = fights.filter((row) => row.war_id === alfaMonday.id);
    assert.equal(alfaFights.filter((row) => row.format === '1v1').length, rivalMembers);
    const alfaTrios = alfaFights.filter((row) => row.format === '3v3');
    assert.equal(alfaTrios.length, 1, 'a trio of one fights too');
    assert.deepEqual(JSON.parse(alfaTrios[0].fighters)[alfaSide].map((fighter) => fighter.name), ['Alfa']);
    assert.deepEqual([alfaMonday.walkovers_a, alfaMonday.walkovers_b], [0, 0]);
    // Alfa fights at level 200 (makeClimber).
    const reward = warReward(200, content);
    const won = alfaFights.filter((row) => row.result === alfaSide).length;
    const matchWon = alfaMonday.result === alfaSide;
    assert.deepEqual([after.gold - before.gold, after.system_points - before.system_points], [won * reward.gold, matchWon ? reward.systemPoints : 0]);
    // The tab after that evening: the table, the evening, the fight to
    // watch, the free evening.
    clock = days[alfaDay] + 3600000;
    const view = (await as('alfa', 'GET', '/api/guild/war')).data;
    const ours = view.league.table.find((row) => row.ours);
    const [ownWon, ownLost] = alfaSide === 'a' ? [alfaMonday.wins_a, alfaMonday.losses_a] : [alfaMonday.wins_b, alfaMonday.losses_b];
    assert.deepEqual([ours.tag, ours.played, ours.fightsWon, ours.fightsLost, ours.balance], ['MOC', 1, ownWon, ownLost, ownWon - ownLost]);
    assert.deepEqual(
      view.league.table.map((row) => row.place),
      [1, 2, 3],
    );
    const evening = view.league.days[alfaDay].matches[0];
    assert.deepEqual(evening.score, [ownWon, ownLost]);
    assert.equal(evening.duels.won + evening.duels.lost + evening.duels.drawn, rivalMembers);
    assert.deepEqual([evening.trios.walkoversWon, evening.trios.walkoversLost], [0, 0]);
    assert.equal(view.league.next.day, alfaMatches[1].day);
    const free = [0, 1, 2].find((day) => !alfaMatches.some((match) => match.day === day));
    assert.deepEqual(
      view.league.days.map((day) => day.free),
      [0, 1, 2, 3, 4, 5, 6].map((day) => day === free),
    );
    assert.equal(view.league.battles.length, rivalMembers + 1);
    assert.deepEqual(view.league.battles.map((one) => one.format).sort(), [...Array.from({ length: rivalMembers }, () => '1v1'), '3v3']);
    const line = view.league.battles.find((one) => one.format === '1v1');
    assert.equal(line.fought, true);
    assert.deepEqual(line.reward, line.result === 'win' ? { gold: reward.gold } : null);
    const seen = (await as('alfa', 'GET', `/api/guild/war/battles/${line.id}`)).data.battle;
    assert.equal(seen.result, line.result);
    assert.equal(seen.fight.allies[0].name, 'Alfa');
    assert.equal(seen.ourTag, 'MOC');
    // From the rival's side, its own result.
    const login = rival === weak ? 'beta' : 'gamma';
    const theirs = (await as(login, 'GET', `/api/guild/war/battles/${line.id}`)).data.battle;
    assert.equal(theirs.result, { win: 'loss', loss: 'win', draw: 'draw' }[line.result]);
    assert.notEqual(theirs.fight.allies[0].name, 'Alfa');
    assert.equal(theirs.theirTag, 'MOC');
    // A fight of a match of two other guilds is not the third's to see.
    const other = (await all('SELECT b.id FROM guild_war_battles b JOIN guild_wars w ON w.id = b.war_id WHERE w.id != ?', alfaMonday.id))[0];
    if (other) assert.equal((await as('alfa', 'GET', `/api/guild/war/battles/${other.id}`)).data.error.code, 'no_battle');
    assert.equal((await as('alfa', 'GET', '/api/guild/war/battles/abc')).data.error.code, 'no_battle');
    // Wednesday: the last match; then nothing to play till the end on Sunday.
    await cron(days[2]);
    clock = days[3];
    const done = (await as('alfa', 'GET', '/api/guild/war')).data.league;
    assert.deepEqual([done.next, done.end], [null, null]);
    assert.equal(view.texts.doneAll, war.texts.doneAll);
    // Sunday at 20:00 the league ends with its places, the first with its
    // Sława and a war chest of three items, the second with one item (three
    // guilds), nobody third (four needed).
    await cron(days[6] - 60000);
    assert.equal((await first('SELECT ended_at FROM guild_war_weeks WHERE week = ?', league.key)).ended_at, null);
    await cron(days[6]);
    const ended = await first('SELECT ended_at FROM guild_war_weeks WHERE week = ?', league.key);
    assert.equal(ended.ended_at, days[6]);
    assert.equal((await first('SELECT COUNT(*) AS n FROM guild_wars WHERE week = ? AND days_done = 0', league.key)).n, 0);
    const places = await all('SELECT guild_id, place, fame, chest_items FROM guild_league_places WHERE week = ? ORDER BY place', league.key);
    assert.deepEqual(
      places.map((row) => [row.place, row.fame, row.chest_items]),
      [
        [1, 100, 3],
        [2, 60, 1],
        [3, 0, 0],
      ],
    );
    assert.deepEqual(places.map((row) => row.guild_id).sort(), [strong, weak, third].sort());
    const chest = await all('SELECT * FROM guild_chest WHERE guild_id = ?', places[0].guild_id);
    assert.equal(chest.length, 3);
    assert.equal(chest[0].source, 'war');
    assert.equal((await all('SELECT * FROM guild_chest WHERE guild_id = ?', places[1].guild_id)).length, 1);
    assert.equal((await all('SELECT * FROM guild_chest WHERE guild_id = ?', places[2].guild_id)).length, 0);
    await cron(days[6] + 60000);
    assert.equal((await all('SELECT * FROM guild_chest')).length, 4);
    // The Sława of the places in the guilds' ranking of the week.
    clock = days[6] + 3600000;
    const tags = new Map([
      [strong, 'MOC'],
      [weak, 'SŁ'],
      [third, 'TRZ'],
    ]);
    const ranking = (await as('alfa', 'GET', '/api/ranking/guilds?period=week')).data;
    assert.equal(ranking.rows.find((row) => row.tag === tags.get(places[0].guild_id)).fame, 100);
    assert.equal(ranking.rows.find((row) => row.tag === tags.get(places[1].guild_id)).fame, 60);
    assert.ok(ranking.texts.how.some((line) => line.includes('100 punktów')));
    // The tab after the league: the place and what it brought.
    const mine = places.find((row) => row.guild_id === strong);
    const end = (await as('alfa', 'GET', '/api/guild/war')).data.league;
    assert.deepEqual([end.next, end.end], [null, { place: mine.place, fame: mine.fame, items: mine.chest_items }]);
    assert.ok(end.days.every((day) => day.matches.every((match) => match.fought)));
  });

  // Characters of one account on both sides of a match fight each other too
  // (the author, 16.11.2026: „jeśli ktoś ma postać w gildii przeciwnej to
  // niech walczą ze sobą”; till then such an account fought on neither side
  // and its trios lost by walkover).
  test('an account with characters on both sides of a match fights on both, against itself too', async () => {
    await player('alfa', 'Alfa', { level: 60 });
    await player('beta', 'Beta', { level: 30, classId: 'mage' });
    await makeClimber(await db(), ids.alfa);
    await guild('alfa', 'Mocarze', 'MOC');
    const weak = await guild('beta', 'Słabi', 'SŁ');
    await cron(league.startsAt + 60000);
    assert.equal((await all('SELECT * FROM guild_wars WHERE week = ?', league.key)).length, 1);
    await clone(ids.alfa, 'Bliźniak', weak);
    await cron(league.battles[0]);
    const match = await first('SELECT days_done, result FROM guild_wars WHERE week = ? AND day = 0', league.key);
    assert.equal(match.days_done, 1);
    assert.notEqual(match.result, 'void');
    const duels = (await all("SELECT fighters FROM guild_war_battles WHERE format = '1v1'")).map((row) => {
      const fighters = JSON.parse(row.fighters);
      return [fighters.a[0].name, fighters.b[0].name].sort().join(' – ');
    });
    assert.deepEqual(duels.sort(), ['Alfa – Beta', 'Alfa – Bliźniak']);
  });

  // A match with its own moment (fight_at, the first evening of the league
  // fought again at 23:00 on 16.11.2026) waits for it, from the cron and
  // from a look at the tab; its battles bear it, and the tab counts down to it.
  test('a match with its own moment of fights waits for it, and its battles bear it', async () => {
    await player('alfa', 'Alfa', { level: 60 });
    await player('beta', 'Beta', { level: 30, classId: 'mage' });
    await guild('alfa', 'Mocarze', 'MOC');
    await guild('beta', 'Słabi', 'SŁ');
    await cron(league.startsAt + 60000);
    const later = league.battles[0] + 3 * 3600000;
    await run('UPDATE guild_wars SET fight_at = ? WHERE week = ? AND day = 0', later, league.key);
    await cron(league.battles[0]);
    clock = later - 60000;
    const view = (await as('alfa', 'GET', '/api/guild/war')).data;
    assert.equal((await all('SELECT * FROM guild_war_battles')).length, 0);
    assert.deepEqual([view.league.next.day, view.league.next.at, view.league.days[0].at], [0, later, later]);
    await cron(later);
    const match = await first('SELECT days_done FROM guild_wars WHERE week = ? AND day = 0', league.key);
    assert.equal(match.days_done, 1);
    const battles = await all('SELECT at FROM guild_war_battles');
    assert.ok(battles.length > 0);
    assert.ok(battles.every((battle) => battle.at === later));
  });

  // The trios of an evening fixed at the first run of its day, from
  // midnight (the author's 1037.1 A, 16.11.2026): one who joins later fights
  // only the 1v1, one who leaves leaves its trio short (it fights with fewer).
  test('the trios of an evening are fixed from midnight: one who joins fights only the 1v1, one who leaves leaves its trio short', async () => {
    await player('alfa', 'Alfa', { level: 60 });
    await player('beta', 'Beta', { level: 30, classId: 'mage' });
    await player('gamma', 'Gamma', { level: 30 });
    await player('delta', 'Delta', { level: 30 });
    await player('omega', 'Omega', { level: 30 });
    const strong = await guild('alfa', 'Mocarze', 'MOC', ['gamma', 'delta']);
    const weak = await guild('beta', 'Słabi', 'SŁ');
    await clone(ids.beta, 'Betka', weak);
    await clone(ids.beta, 'Betko', weak);
    // Monday after midnight: the league drawn and the trios of its evening kept.
    await cron(league.startsAt + 60000);
    const kept = await first('SELECT lineups FROM guild_war_lineups WHERE week = ? AND day = 0 AND guild_id = ?', league.key, strong);
    assert.deepEqual(JSON.parse(kept.lineups).flat().sort(), [ids.alfa, ids.gamma, ids.delta].sort());
    // During the day Omega joins and Delta leaves.
    clock = league.startsAt + 3600000;
    await as('alfa', 'POST', '/api/guild/invite', { name: 'omega' });
    assert.equal((await as('omega', 'POST', '/api/guild/accept', { guildId: strong })).status, 200);
    await run('DELETE FROM guild_members WHERE character_id = ?', ids.delta);
    await cron(clock + 60000);
    assert.equal((await first('SELECT lineups FROM guild_war_lineups WHERE week = ? AND day = 0 AND guild_id = ?', league.key, strong)).lineups, kept.lineups);
    const view = (await as('omega', 'GET', '/api/guild/war')).data;
    assert.equal(view.me.team, null);
    assert.deepEqual(view.teams.lineups, [[ids.alfa, ids.gamma].sort((a, b) => JSON.parse(kept.lineups)[0].indexOf(a) - JSON.parse(kept.lineups)[0].indexOf(b))]);
    await cron(league.battles[0]);
    const match = await first('SELECT * FROM guild_wars WHERE week = ? AND day = 0', league.key);
    const side = match.guild_a === strong ? 'a' : 'b';
    const fights = await all('SELECT format, fighters FROM guild_war_battles WHERE war_id = ?', match.id);
    const ours = (format) => [...new Set(fights.filter((one) => one.format === format).flatMap((one) => JSON.parse(one.fighters)[side].map((fighter) => fighter.name)))].sort();
    assert.deepEqual(ours('1v1'), ['Alfa', 'Gamma', 'Omega']);
    // The trio short of Delta fought with two.
    assert.deepEqual(ours('3v3'), ['Alfa', 'Gamma']);
    assert.deepEqual([match.walkovers_a, match.walkovers_b], [0, 0]);
  });

  // Every fight of a match to watch, not only the character's own (the
  // author, 16.11.2026): for the members of both guilds, from each side.
  test("every fight of a match, from either guild's side; for no one else", async () => {
    await player('alfa', 'Alfa', { level: 60 });
    await player('beta', 'Beta', { level: 30, classId: 'mage' });
    await player('gamma', 'Gamma', { level: 30 });
    await player('delta', 'Delta', { level: 30 });
    const strong = await guild('alfa', 'Mocarze', 'MOC', ['gamma']);
    const weak = await guild('beta', 'Słabi', 'SŁ');
    await clone(ids.beta, 'Betka', weak);
    await guild('delta', 'Obcy', 'OB');
    await cron(league.startsAt + 60000);
    const match = await first('SELECT id, guild_a, day FROM guild_wars WHERE week = ? AND ((guild_a = ? AND guild_b = ?) OR (guild_a = ? AND guild_b = ?))', league.key, strong, weak, weak, strong);
    await cron(league.battles[match.day]);
    clock = league.battles[match.day] + 60000;
    const stored = await all('SELECT id FROM guild_war_battles WHERE war_id = ? ORDER BY number', match.id);
    const ours = (await as('alfa', 'GET', `/api/guild/war/matches/${match.id}/battles`)).data.battles;
    const theirs = (await as('beta', 'GET', `/api/guild/war/matches/${match.id}/battles`)).data.battles;
    // Two on two: four duels and the trios' fight; Gamma's duels too, not
    // only Alfa's own.
    assert.deepEqual(
      ours.map((line) => line.id),
      stored.map((row) => row.id),
    );
    assert.equal(ours.filter((line) => line.format === '1v1').length, 4);
    assert.ok(ours.some((line) => line.format === '1v1' && line.ours[0] === 'Gamma' && !line.fought));
    assert.ok(ours.some((line) => line.format === '1v1' && line.ours[0] === 'Alfa' && line.fought));
    for (const [index, line] of ours.entries()) {
      assert.deepEqual([theirs[index].ours, theirs[index].theirs], [line.theirs, line.ours]);
      assert.equal(theirs[index].result, { win: 'loss', loss: 'win', draw: 'draw' }[line.result]);
    }
    assert.equal((await as('delta', 'GET', `/api/guild/war/matches/${match.id}/battles`)).status, 404);
    // Any of them to watch, for a member of either guild.
    const gammaDuel = ours.find((line) => line.ours[0] === 'Gamma');
    assert.equal((await as('alfa', 'GET', `/api/guild/war/battles/${gammaDuel.id}`)).status, 200);
    assert.equal((await as('beta', 'GET', `/api/guild/war/battles/${gammaDuel.id}`)).status, 200);
  });

  // The database gives the highest id of a removed character again: a
  // character made after a battle did not fight it, whatever its id.
  test("a battle is a character's own only when it was there to fight it", async () => {
    await player('alfa', 'Alfa', { level: 60 });
    await player('beta', 'Beta', { level: 30, classId: 'mage' });
    await makeClimber(await db(), ids.alfa);
    await guild('alfa', 'Mocarze', 'MOC');
    await guild('beta', 'Słabi', 'SŁ');
    await cron(league.startsAt + 60000);
    await cron(league.battles[0]);
    const [battle] = await all('SELECT id, at FROM guild_war_battles');
    clock = league.battles[0] + 3600000;
    const lines = async () => (await as('alfa', 'GET', '/api/guild/war')).data.league.battles;
    assert.equal((await lines())[0].fought, true);
    await run('UPDATE characters SET created_at = ? WHERE id = ?', battle.at + 1, ids.alfa);
    assert.deepEqual(await lines(), []);
    const replay = (await as('alfa', 'GET', `/api/guild/war/battles/${battle.id}`)).data.battle;
    assert.deepEqual([replay.fought, replay.reward], [false, null]);
  });

  // Last week's Sława is frozen once its league has ended: a match that
  // cannot be fought now (here a member's broken row) holds it, and once
  // fought, the place counts (11.11.2026).
  test("last week's Sława waits for its league to end, and the place in it counts", async () => {
    await player('alfa', 'Alfa', { level: 60 });
    await player('beta', 'Beta', { level: 30, classId: 'mage' });
    await makeClimber(await db(), ids.alfa);
    const strong = await guild('alfa', 'Mocarze', 'MOC');
    const weak = await guild('beta', 'Słabi', 'SŁ');
    const broken = await clone(ids.alfa, 'Zepsuty', strong);
    await cron(league.startsAt + 60000);
    await run("UPDATE characters SET points = 'x' WHERE id = ?", broken);
    // The week after the league's: the league's Sunday is long gone.
    clock = league.endsAt + 3600000;
    await run('DELETE FROM guild_fame');
    const champion = async () => (await as('beta', 'GET', '/api/character')).data.championTag;
    assert.equal(await champion(), null);
    assert.equal((await first('SELECT COUNT(*) AS n FROM guild_fame WHERE week = ?', league.key)).n, 0);
    assert.equal((await first('SELECT ended_at FROM guild_war_weeks WHERE week = ?', league.key)).ended_at, null);
    await run("UPDATE characters SET points = '{}' WHERE id = ?", broken);
    assert.equal(await champion(), 'MOC');
    assert.notEqual((await first('SELECT ended_at FROM guild_war_weeks WHERE week = ?', league.key)).ended_at, null);
    assert.equal((await first('SELECT points FROM guild_fame WHERE week = ? AND guild_id = ?', league.key, strong)).points, 100);
    assert.ok(weak);
  });

  test("a week's league is drawn once, at its first run, from the first evening to come; after Sunday's battles, none", async () => {
    await player('alfa', 'Alfa');
    await player('beta', 'Beta');
    await guild('alfa', 'Pierwsi', 'PIE');
    await guild('beta', 'Drudzy', 'DRU');
    // First run on Wednesday after its battles: the one match on Thursday.
    await cron(league.battles[2] + 60000);
    await cron(league.battles[2] + 120000);
    assert.equal((await all('SELECT * FROM guild_war_weeks WHERE week = ?', league.key)).length, 1);
    const late = await all('SELECT day FROM guild_wars WHERE week = ? ORDER BY day', league.key);
    assert.deepEqual(
      late.map((one) => one.day),
      [3],
    );
    assert.equal((await first('SELECT first_day FROM guild_war_weeks WHERE week = ?', league.key)).first_day, 3);
    // First run after Sunday's battles: no matches, the league over at once.
    await run('DELETE FROM guild_wars');
    await run('DELETE FROM guild_war_weeks WHERE week = ?', league.key);
    await cron(league.battles[6] + 60000);
    const over = await first('SELECT guilds, ended_at FROM guild_war_weeks WHERE week = ?', league.key);
    assert.deepEqual([JSON.parse(over.guilds), over.ended_at !== null], [[], true]);
    assert.equal((await all('SELECT * FROM guild_wars WHERE week = ?', league.key)).length, 0);
    // The tab: no league this week.
    clock = league.battles[6] + 120000;
    const view = (await as('alfa', 'GET', '/api/guild/war')).data;
    assert.deepEqual([view.league, view.none], [null, 'empty']);
    assert.equal(view.texts.none.empty, war.texts.none.empty);
  });

  test('"Test ligi" draws the league again from today and fights its evenings at a tap, to the end', async () => {
    await player('lider', 'Lider', { level: 50 });
    await player('druga', 'Druga', { level: 50, classId: 'mage' });
    await guild('lider', 'Leśni Bracia', 'LB');
    await guild('druga', 'Drugie', 'DRG');
    clock = league.battles[2] + 3600000;
    const redrawn = await as('lider', 'POST', '/api/test/guild-war', { action: 'redraw' });
    assert.equal(redrawn.status, 200, JSON.stringify(redrawn.data));
    assert.equal(redrawn.data.league.firstDay, 2);
    assert.equal(redrawn.data.test.fight, 2);
    const before = await first('SELECT gold FROM characters WHERE id = ?', ids.lider);
    // Two guilds: the one match (a duel and the fight of the two trios of
    // one), and with it the league's end.
    const view = (await as('lider', 'POST', '/api/test/guild-war', { action: 'fight' })).data;
    assert.equal(view.league.days[2].matches[0].fought, true);
    assert.equal(view.test.fight, null);
    const rows = await all('SELECT b.result, w.guild_a FROM guild_war_battles b JOIN guild_wars w ON w.id = b.war_id');
    assert.equal(rows.length, 2);
    const won = rows.filter((row) => (row.guild_a === view.guild.id ? row.result === 'a' : row.result === 'b')).length;
    const after = await first('SELECT gold FROM characters WHERE id = ?', ids.lider);
    assert.equal(after.gold - before.gold, won * warReward(50, content).gold);
    assert.ok([1, 2].includes(view.league.end.place));
    assert.equal((await as('lider', 'POST', '/api/test/guild-war', { action: 'fight' })).data.error.code, 'no_war');
    assert.equal((await as('lider', 'POST', '/api/test/guild-war', { action: 'nothing' })).data.error.code, 'invalid_action');
  });
});

describe('the guild wars where GUILD_WARS is off', () => {
  const { call, signUp } = useServer();

  test('no Wojna tab and no routes', async () => {
    const tabs = (await call('GET', '/api/content')).data.guildTabs.map((tab) => tab.id);
    assert.ok(!tabs.includes('war'));
    assert.equal(tabs.length, 8);
    const { cookie } = await signUp('Gracz');
    await call('POST', '/api/character', { cookie, body: { name: 'Gracz', classId: 'warrior', appearance: 'female' } });
    assert.equal((await call('GET', '/api/guild/war', { cookie })).status, 404);
    assert.equal((await call('POST', '/api/guild/war/place', { cookie, body: { team: 1 } })).status, 404);
  });
});

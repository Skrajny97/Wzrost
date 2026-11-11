// The guild wars (src/engine/guild-wars.js, src/server/guild-wars.js; the
// author's 792–800): in the engine, the teams of full fives (12), the
// reserve taking the free places, the evening's battles of 795 B, the draw
// of rivals of a similar size and never of one account, a battle of five on
// five as at the Arena, the war's result, the rewards and the war chest,
// and the evenings at 20:00 Polish time, also on the day the clocks
// change; through the API, a place taken by a member, moved by the leader
// and the deputies and never by a member for another, swapped, the
// guild's 30 members, the evening's battles fought once by the cron at
// 20:00 with their rewards given once, each to watch from either side, the
// war's end with its Sława and war chest, "Test wojny" of the test version,
// a place gone with its member, and nothing of the wars where GUILD_WARS is
// off.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  createRng,
  drawWars,
  mirrorTeam,
  nextTeamAt,
  questPeriod,
  teamFights,
  warBattle,
  warChest,
  warDaysDue,
  warFightFor,
  warLineups,
  warPairings,
  warResult,
  warReward,
  warRivals,
  warTeams,
  warWeek,
  zoneClock,
} from '../src/engine/index.js';
import { playerOf } from '../tools/difficulty-sim.mjs';
import { makeClimber } from './helpers/climb.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const war = content.guilds.war;
const fighter = (classId, level, name, set = 0, appearance = 'male') => {
  const { character, equipped } = playerOf('realistic', classId, level, content, set);
  return { character: { ...character, appearance }, equipped, name };
};

describe("the guild wars' rules", () => {
  test('a guild holds 30 members: six teams of five, a team for each full five, one below five (793 A, 12)', () => {
    assert.equal(content.guilds.size, 30);
    assert.equal(war.teamSize * war.maxTeams, content.guilds.size);
    assert.deepEqual(
      [1, 4, 5, 9, 10, 14, 15, 24, 29, 30].map((members) => warTeams(members, content)),
      [1, 1, 1, 1, 2, 2, 3, 4, 5, 6],
    );
    // The members the next team needs, none at six.
    assert.deepEqual([1, 9, 12, 29, 30].map((members) => nextTeamAt(members, content)), [10, 10, 15, 30, null]);
    // The tab is the last of nine.
    assert.equal(content.guilds.tabs.length, 9);
    assert.equal(content.guilds.tabs.at(-1).id, 'war');
  });

  test('the reserve takes the free places before a battle, in order; a team short of people fights so (800 C)', () => {
    const members = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    // Two teams; four placed in I, two in II, one in a team the guild has
    // no more (III) and a stranger's place left over.
    const slots = [
      { characterId: 1, team: 1, slot: 0 },
      { characterId: 2, team: 1, slot: 3 },
      { characterId: 3, team: 1, slot: 1 },
      { characterId: 4, team: 1, slot: 4 },
      { characterId: 5, team: 2, slot: 0 },
      { characterId: 6, team: 2, slot: 1 },
      { characterId: 7, team: 3, slot: 0 },
      { characterId: 99, team: 2, slot: 2 },
    ];
    const teams = warLineups({ members, slots }, content);
    assert.equal(teams.count, 2);
    assert.deepEqual(teams.assigned, [
      [1, 3, 2, 4],
      [5, 6],
    ]);
    assert.deepEqual(teams.reserve, [7, 8, 9, 10, 11, 12]);
    assert.deepEqual(teams.lineups, [
      [1, 3, 2, 4, 7],
      [5, 6, 8, 9, 10],
    ]);
    assert.deepEqual(teams.bench, [11, 12]);
    // Three members: one team of three.
    const few = warLineups({ members: [1, 2, 3], slots: [{ characterId: 2, team: 1, slot: 4 }] }, content);
    assert.deepEqual([few.count, few.assigned, few.lineups, few.bench], [1, [[2]], [[2, 1, 3]], []]);
  });

  test("an evening has as many battles as the bigger guild has teams, the smaller one's teams fighting in turn (795 B)", () => {
    const pairs = (a, b) => warPairings(a, b).map((one) => `${one.a}-${one.b}`);
    assert.deepEqual(pairs(2, 4), ['1-1', '2-2', '1-3', '2-4']);
    assert.deepEqual(pairs(4, 2), ['1-1', '2-2', '3-1', '4-2']);
    assert.deepEqual(pairs(6, 6), ['1-1', '2-2', '3-3', '4-4', '5-5', '6-6']);
    assert.deepEqual(pairs(1, 3), ['1-1', '1-2', '1-3']);
    assert.deepEqual(warPairings(3, 0), []);
    assert.deepEqual(teamFights(2, 4), [2, 2]);
    assert.deepEqual(teamFights(3, 4), [2, 1, 1]);
    assert.deepEqual(teamFights(4, 2), [1, 1, 1, 1]);
  });

  test('rivals are of a similar size and never of one account; the draw pairs as many as it can, the same for the same seed (797 B)', () => {
    const guild = (id, members, users = [id * 100]) => ({ id, members, users });
    assert.ok(warRivals(guild(1, 12), guild(2, 13), content));
    assert.ok(warRivals(guild(1, 20), guild(2, 30), content));
    assert.ok(!warRivals(guild(1, 15), guild(2, 30), content));
    assert.ok(!warRivals(guild(1, 1), guild(2, 2), content));
    assert.ok(warRivals(guild(1, 1), guild(2, 1), content));
    assert.ok(!warRivals(guild(1, 12, [7, 8]), guild(2, 12, [9, 8]), content), 'an account in both');
    // D fits only C: the draw gives D its rival first, and A gets B.
    const four = [guild(1, 10), guild(2, 13), guild(3, 15), guild(4, 20)];
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const pairs = drawWars(four, seed, content).map((pair) => pair.map((one) => one.id).sort().join('-')).sort();
      assert.deepEqual(pairs, ['1-2', '3-4'], `seed ${seed}`);
    }
    // A guild without a rival of its size has no war; the same seed, the same draw.
    const many = [guild(1, 30), guild(2, 28), guild(3, 25), guild(4, 22), guild(5, 3), guild(6, 12), guild(7, 11)];
    const drawn = drawWars(many, 'week', content);
    assert.deepEqual(drawWars(many, 'week', content), drawn);
    assert.ok(drawn.every(([a, b]) => warRivals(a, b, content)));
    assert.ok(!drawn.some((pair) => pair.some((one) => one.id === 5)));
    assert.equal(drawn.length, 3);
    const others = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((seed) => JSON.stringify(drawWars(many, seed, content).map((pair) => pair.map((one) => one.id)))));
    assert.ok(others.size > 1, 'the seed draws the rivals');
  });

  test('the evenings are at 20:00 Polish time, also the Sunday the clocks go back; the war is from Monday', () => {
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

  test("a battle won brings gold by the character's level and Punkty Systemu; the guild that won more battles wins the war (799 A)", () => {
    assert.deepEqual(warReward(100, content), { gold: war.reward.gold.base + war.reward.gold.perLevel * 100, systemPoints: war.reward.systemPoints });
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

  test("the mirror guild's team fights as the guild's own under the Karczma's names, none of the battle's", () => {
    const team = [fighter('warrior', 50, 'Bogumił', 0, 'male'), fighter('cleric', 50, 'Radomira', 1, 'female')];
    const mirror = mirrorTeam(team, 'seed', ['Bogumił', 'Radomira', 'Wszebor'], content);
    assert.equal(mirror.length, 2);
    assert.deepEqual(
      mirror.map((one) => one.character),
      team.map((one) => one.character),
    );
    assert.ok(content.settlement.companions.names.male.includes(mirror[0].name));
    assert.ok(content.settlement.companions.names.female.includes(mirror[1].name));
    assert.ok(!['Bogumił', 'Radomira', 'Wszebor'].includes(mirror[0].name));
    assert.deepEqual(mirrorTeam(team, 'seed', [], content), mirrorTeam(team, 'seed', [], content));
    assert.ok(createRng('x'));
  });
});

describe('the guild wars through the API', () => {
  const { server, call, db, signUp } = useServer({ GUILD_WARS: 'on' });
  const cookies = {};
  const ids = {};
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  const all = async (sql, ...binds) => (await (await db()).prepare(sql).bind(...binds).all()).results;
  const cron = (at) => server.getWorker().scheduled({ cron: '* * * * *', scheduledTime: new Date(at) });
  const week = () => warWeek(Date.now(), content);

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
    await run("INSERT INTO guild_members (character_id, guild_id, role, joined_at) VALUES (?, ?, 'member', ?)", id, guildId, Date.now());
    return id;
  }

  const place = (login, body) => as(login, 'POST', '/api/guild/war/place', body);
  const slotOf = async (characterId) => first('SELECT team, slot FROM guild_war_slots WHERE character_id = ?', characterId);

  beforeEach(() => {
    for (const key of Object.keys(cookies)) delete cookies[key];
  });

  test('the tab: the teams, the members and the words; a guild may take 30 members', async () => {
    await player('lider', 'Lider');
    await player('druh', 'Druh');
    const guildId = await guild('lider', 'Leśni Bracia', 'LB', ['druh']);
    const tabs = (await call('GET', '/api/content')).data.guildTabs.map((tab) => tab.id);
    assert.equal(tabs.at(-1), 'war');
    const view = (await as('lider', 'GET', '/api/guild/war')).data;
    assert.equal(view.guild.id, guildId);
    assert.deepEqual([view.teams.count, view.teams.size, view.teams.max, view.teams.members, view.teams.next], [1, 5, 6, 2, 10]);
    assert.deepEqual(view.teams.assigned, [[]]);
    assert.deepEqual(view.teams.reserve, [ids.lider, ids.druh]);
    assert.deepEqual(view.teams.lineups, [[ids.lider, ids.druh]]);
    assert.deepEqual([view.me.team, view.me.fights], [null, 1]);
    assert.equal(view.members[ids.druh].name, 'Druh');
    assert.equal(view.members[ids.lider].role, 'leader');
    assert.equal(view.war, null);
    assert.equal(view.texts.title, war.texts.title);
    assert.ok(view.texts.how.some((line) => line.includes('20:00')));
    assert.equal(view.texts.errors, undefined);
    // Outside a guild, the words alone.
    await player('obcy', 'Obcy');
    const outside = (await as('obcy', 'GET', '/api/guild/war')).data;
    assert.equal(outside.guild, null);
    assert.equal(outside.texts.noGuild, war.texts.noGuild);
    // 30 members: the 21st joins.
    const database = await db();
    await database.batch(Array.from({ length: 18 }, (_, index) => database.prepare("INSERT INTO guild_members (character_id, guild_id, role, joined_at) VALUES (?, ?, 'member', 0)").bind(100000 + index, guildId)));
    await player('nowy', 'Nowy');
    await as('lider', 'POST', '/api/guild/invite', { name: 'Nowy' });
    assert.equal((await as('nowy', 'POST', '/api/guild/accept', { guildId })).status, 200);
  });

  test('a member takes a free place itself; the leader and the deputies move anyone and swap two; a member never moves another (796 A)', async () => {
    await player('lider', 'Lider');
    await player('zast', 'Zast');
    await player('druh', 'Druh');
    const guildId = await guild('lider', 'Leśni Bracia', 'LB', ['zast', 'druh']);
    await as('lider', 'POST', '/api/guild/role', { characterId: ids.zast, role: 'deputy' });
    const taken = await place('druh', { team: 1 });
    assert.equal(taken.status, 200, JSON.stringify(taken.data));
    assert.equal(taken.data.text, 'Zajmujesz miejsce w Drużynie I.');
    assert.deepEqual(taken.data.teams.assigned, [[ids.druh]]);
    assert.deepEqual(await slotOf(ids.druh), { team: 1, slot: 0 });
    // Again in the same team: refused.
    assert.equal((await place('druh', { team: 1 })).data.error.code, 'same');
    // A member does not move another, nor into a team the guild does not have.
    assert.deepEqual([(await place('druh', { characterId: ids.zast, team: 1 })).status, (await place('druh', { characterId: ids.zast, team: 1 })).data.error.code], [403, 'not_allowed']);
    assert.equal((await place('druh', { team: 2 })).data.error.code, 'no_team');
    // The deputy moves the member to the reserve and the leader back.
    const reserve = await place('zast', { characterId: ids.druh, team: 0 });
    assert.equal(reserve.data.text, 'Druh: rezerwa.');
    assert.equal(await slotOf(ids.druh), null);
    assert.equal((await place('lider', { characterId: ids.druh, team: 1 })).data.text, 'Druh: Drużyna I.');
    // A full team takes nobody more: six more of an account fill it.
    const others = [];
    for (let index = 0; index < 4; index++) others.push(await clone(ids.druh, `Klon${index}`, guildId));
    for (const id of others) await place('lider', { characterId: id, team: 1 });
    assert.equal((await place('zast', { team: 1 })).data.error.code, 'full');
    // Ten members: two teams; the leader swaps two of them.
    for (let index = 4; index < 7; index++) others.push(await clone(ids.druh, `Klon${index}`, guildId));
    const two = (await as('lider', 'GET', '/api/guild/war')).data;
    assert.equal(two.teams.count, 2);
    await place('zast', { team: 2 });
    const before = [await slotOf(ids.druh), await slotOf(ids.zast)];
    assert.equal((await place('druh', { team: 2, swapWith: ids.zast })).data.error.code, 'not_allowed');
    const swapped = await place('lider', { characterId: ids.druh, team: 2, swapWith: ids.zast });
    assert.equal(swapped.status, 200, JSON.stringify(swapped.data));
    assert.equal(swapped.data.text, 'Druh i Zast zamieniają się miejscami.');
    assert.deepEqual([await slotOf(ids.druh), await slotOf(ids.zast)], [before[1], before[0]]);
    // A member who leaves takes its place along.
    assert.equal((await as('druh', 'POST', '/api/guild/leave')).status, 200);
    assert.equal(await slotOf(ids.druh), null);
  });

  test("the cron draws the rivals on Monday and fights each evening's battles once at 20:00, their rewards given once; each battle to watch from either side; the war won brings Sława and the war chest", async () => {
    await player('alfa', 'Alfa', { level: 60 });
    await player('beta', 'Beta', { level: 30, classId: 'mage' });
    await player('gamma', 'Gamma', { level: 30 });
    await makeClimber(await db(), ids.alfa);
    const strong = await guild('alfa', 'Mocarze', 'MOC');
    const weak = await guild('beta', 'Słabi', 'SŁ');
    // A guild of three: no rival of its size.
    const third = await guild('gamma', 'Trzeci', 'TRZ');
    await clone(ids.gamma, 'Gammi', third);
    await clone(ids.gamma, 'Gammo', third);
    const days = week().battles;
    await cron(week().startsAt + 60000);
    const wars = await all('SELECT * FROM guild_wars WHERE week = ?', week().key);
    assert.equal(wars.length, 1);
    assert.deepEqual([wars[0].guild_a, wars[0].guild_b].sort(), [strong, weak].sort());
    assert.ok(await first('SELECT 1 FROM guild_war_weeks WHERE week = ?', week().key));
    const side = wars[0].guild_a === strong ? 'a' : 'b';
    // Before 20:00 nothing; at 20:00 Monday's battle, once.
    await cron(days[0] - 60000);
    assert.equal((await all('SELECT * FROM guild_war_battles')).length, 0);
    const gold = async (id) => first('SELECT gold, system_points FROM characters WHERE id = ?', id);
    const before = await gold(ids.alfa);
    const weakBefore = await gold(ids.beta);
    await cron(days[0]);
    const monday = await all('SELECT * FROM guild_war_battles');
    assert.equal(monday.length, 1);
    assert.deepEqual([monday[0].day, monday[0].number, monday[0].team_a, monday[0].team_b, monday[0].result, monday[0].at], [0, 0, 1, 1, side, days[0]]);
    const reward = warReward(200, content);
    const after = await gold(ids.alfa);
    assert.deepEqual([after.gold - before.gold, after.system_points - before.system_points], [reward.gold, reward.systemPoints]);
    assert.deepEqual(await gold(ids.beta), weakBefore);
    await cron(days[0] + 60000);
    await cron(days[0] + 120000);
    assert.equal((await all('SELECT * FROM guild_war_battles')).length, 1);
    assert.deepEqual(await gold(ids.alfa), after);
    const state = await first('SELECT days_done, wins_a, wins_b FROM guild_wars WHERE id = ?', wars[0].id);
    assert.deepEqual([state.days_done, side === 'a' ? state.wins_a : state.wins_b], [1, 1]);
    // The battle to watch: from Alfa's side its team at the bottom and what
    // it got, from Beta's its own, and for nobody else.
    const seenByAlfa = (await as('alfa', 'GET', `/api/guild/war/battles/${monday[0].id}`)).data.battle;
    assert.equal(seenByAlfa.result, 'win');
    assert.deepEqual(seenByAlfa.reward, reward);
    assert.equal(seenByAlfa.fight.allies[0].name, 'Alfa');
    assert.equal(seenByAlfa.fight.enemies[0].name, 'Beta');
    assert.equal(seenByAlfa.fight.won, true);
    assert.deepEqual([seenByAlfa.ourTag, seenByAlfa.theirTag], ['MOC', 'SŁ']);
    assert.deepEqual(seenByAlfa.standing.ours, [0]);
    const seenByBeta = (await as('beta', 'GET', `/api/guild/war/battles/${monday[0].id}`)).data.battle;
    assert.deepEqual([seenByBeta.result, seenByBeta.reward, seenByBeta.fight.allies[0].name, seenByBeta.fight.won], ['loss', null, 'Beta', false]);
    assert.equal((await as('gamma', 'GET', `/api/guild/war/battles/${monday[0].id}`)).data.error.code, 'no_battle');
    assert.equal((await as('gamma', 'GET', '/api/guild/war/battles/abc')).data.error.code, 'no_battle');
    // Sunday at 20:00 the rest of the week, at once: the war ends, won by
    // the strong guild, with its war chest and its Sława.
    await cron(days[6]);
    const ended = await first('SELECT * FROM guild_wars WHERE id = ?', wars[0].id);
    assert.deepEqual([ended.days_done, ended.result, ended.chest_items], [7, side, 1]);
    assert.equal((await all('SELECT * FROM guild_war_battles')).length, 7);
    const chest = await all('SELECT * FROM guild_chest WHERE guild_id = ?', strong);
    assert.equal(chest.length, 1);
    assert.equal(chest[0].source, 'war');
    assert.equal(JSON.parse(chest[0].data).rarity !== undefined, true);
    const seenChest = (await as('alfa', 'GET', '/api/guild/chest')).data;
    assert.equal(seenChest.items[0].from, content.guilds.chest.texts.fromWar);
    assert.equal(seenChest.log[0].kind, 'war');
    assert.equal((await all('SELECT * FROM guild_chest WHERE guild_id = ?', weak)).length, 0);
    assert.equal((await all('SELECT * FROM guild_chest WHERE guild_id = ?', third)).length, 0);
    await cron(days[6] + 60000);
    assert.equal((await all('SELECT * FROM guild_chest')).length, 1);
    const ranking = (await as('alfa', 'GET', '/api/ranking/guilds?period=week')).data;
    assert.equal(ranking.rows.find((row) => row.tag === 'MOC').fame, content.guilds.fame.war.won);
    assert.ok(ranking.texts.how.some((line) => line.includes(String(content.guilds.fame.war.won))));
    // The tab after the war: the score, the days and the result.
    const view = (await as('beta', 'GET', '/api/guild/war')).data;
    assert.deepEqual([view.war.score, view.war.result, view.war.next, view.war.end], [[0, 7], 'loss', null, null]);
    assert.equal(view.war.battles.length, 7);
    assert.ok(view.war.days.every((day) => day.fought && day.wins[1] === 1));
    const won = (await as('alfa', 'GET', '/api/guild/war')).data.war;
    assert.deepEqual([won.result, won.end], ['win', { fame: content.guilds.fame.war.won, items: 1 }]);
    // No war for the third guild, which had no rival of its size (made
    // here after the draw, run for a moment gone by: it says so).
    const none = (await as('gamma', 'GET', '/api/guild/war')).data;
    const made = await first('SELECT created_at FROM guilds WHERE id = ?', third);
    const drawn = await first('SELECT drawn_at FROM guild_war_weeks WHERE week = ?', week().key);
    assert.deepEqual([none.war, none.none], [null, made.created_at > drawn.drawn_at ? 'late' : 'noRival']);
  });

  // A character of an account that has one in the rival guild too (made or
  // moved there after the draw) fights on neither side, so nobody fights
  // itself and takes the reward for free (11.11.2026).
  test('an account with characters on both sides of a war fights on neither', async () => {
    await player('alfa', 'Alfa', { level: 60 });
    await player('beta', 'Beta', { level: 30, classId: 'mage' });
    await makeClimber(await db(), ids.alfa);
    await guild('alfa', 'Mocarze', 'MOC');
    const weak = await guild('beta', 'Słabi', 'SŁ');
    await cron(week().startsAt + 60000);
    assert.equal((await all('SELECT * FROM guild_wars WHERE week = ?', week().key)).length, 1);
    await clone(ids.alfa, 'Bliźniak', weak);
    const before = await first('SELECT gold, system_points FROM characters WHERE id = ?', ids.alfa);
    await cron(week().battles[0]);
    const war = await first('SELECT days_done FROM guild_wars WHERE week = ?', week().key);
    assert.equal(war.days_done, 1);
    assert.equal((await all('SELECT * FROM guild_war_battles')).length, 0);
    assert.deepEqual(await first('SELECT gold, system_points FROM characters WHERE id = ?', ids.alfa), before);
  });

  // The database gives the highest id of a removed character again: a
  // character made after a battle did not fight it, whatever its id.
  test("a battle is a character's own only when it was there to fight it", async () => {
    await player('alfa', 'Alfa', { level: 60 });
    await player('beta', 'Beta', { level: 30, classId: 'mage' });
    await makeClimber(await db(), ids.alfa);
    await guild('alfa', 'Mocarze', 'MOC');
    await guild('beta', 'Słabi', 'SŁ');
    await cron(week().startsAt + 60000);
    await cron(week().battles[0]);
    const [battle] = await all('SELECT id, at FROM guild_war_battles');
    const line = async () => (await as('alfa', 'GET', '/api/guild/war')).data.war.battles[0];
    assert.equal((await line()).fought, true);
    await run('UPDATE characters SET created_at = ? WHERE id = ?', battle.at + 1, ids.alfa);
    assert.deepEqual([(await line()).fought, (await line()).reward], [false, null]);
    const replay = (await as('alfa', 'GET', `/api/guild/war/battles/${battle.id}`)).data.battle;
    assert.deepEqual([replay.fought, replay.reward], [false, null]);
  });

  // Last week's Sława is frozen once none of its wars is unfinished: a war
  // that cannot be fought now (here a member's broken row) holds it, and
  // once fought its win counts (11.11.2026).
  test("last week's Sława waits for its wars to end, and the war won counts in it", async () => {
    await player('alfa', 'Alfa', { level: 60 });
    await player('beta', 'Beta', { level: 30, classId: 'mage' });
    await makeClimber(await db(), ids.alfa);
    const strong = await guild('alfa', 'Mocarze', 'MOC');
    const weak = await guild('beta', 'Słabi', 'SŁ');
    const broken = await clone(ids.alfa, 'Zepsuty', strong);
    const previous = warWeek(week().startsAt - 1, content).key;
    await run(
      "INSERT INTO guild_wars (week, guild_a, guild_b, name_a, tag_a, members_a, name_b, tag_b, members_b, seed, created_at) VALUES (?, ?, ?, 'Mocarze', 'MOC', 2, 'Słabi', 'SŁ', 1, 'ziarno', 0)",
      previous,
      strong,
      weak,
    );
    await run("UPDATE characters SET points = 'x' WHERE id = ?", broken);
    // The week not frozen yet, as at its first request (the guilds' pages
    // above froze it, before the war was there).
    await run('DELETE FROM guild_fame');
    const champion = async () => (await as('beta', 'GET', '/api/character')).data.championTag;
    assert.equal(await champion(), null);
    assert.equal((await first('SELECT COUNT(*) AS n FROM guild_fame WHERE week = ?', previous)).n, 0);
    assert.equal((await first('SELECT days_done FROM guild_wars WHERE week = ?', previous)).days_done, 0);
    await run("UPDATE characters SET points = '{}' WHERE id = ?", broken);
    assert.equal(await champion(), 'MOC');
    const war = await first('SELECT days_done, result FROM guild_wars WHERE week = ?', previous);
    assert.deepEqual([war.days_done, war.result], [7, 'a']);
    assert.equal((await first('SELECT points FROM guild_fame WHERE week = ? AND guild_id = ?', previous, strong)).points, content.guilds.fame.war.won);
  });

  test("a week's rivals are drawn once, and not after its first battles; guilds of one account never meet", async () => {
    await player('alfa', 'Alfa');
    await player('beta', 'Beta');
    const one = await guild('alfa', 'Pierwsi', 'PIE');
    const other = await guild('beta', 'Drudzy', 'DRU');
    // Too late: past Monday's battles, no draw for the week.
    await cron(week().battles[0] + 60000);
    assert.equal((await all('SELECT * FROM guild_war_weeks')).length, 0);
    // In time, once: the two have their war, and a second run draws nothing more.
    await cron(week().startsAt + 60000);
    await cron(week().startsAt + 120000);
    assert.equal((await all('SELECT * FROM guild_war_weeks')).length, 1);
    assert.equal((await all('SELECT * FROM guild_wars')).length, 1);
    // A guild of an account's other character beside one of its own: they never meet.
    await run('DELETE FROM guild_war_weeks');
    await run('DELETE FROM guild_wars');
    await run('DELETE FROM guild_members WHERE guild_id = ?', other);
    await clone(ids.alfa, 'Bliźniak', other);
    await cron(week().startsAt + 60000);
    assert.equal((await all('SELECT * FROM guild_wars')).length, 0);
    await cron(week().startsAt + 120000);
    assert.equal((await all('SELECT * FROM guild_war_weeks')).length, 1);
    assert.ok(one);
  });

  test('"Test wojny" begins a war with the mirror guild at once and fights its evenings at a tap, to the end; only a test war is taken back', async () => {
    await player('lider', 'Lider', { level: 50 });
    await guild('lider', 'Leśni Bracia', 'LB');
    const start = await as('lider', 'POST', '/api/test/guild-war', { action: 'start', teams: 2 });
    assert.equal(start.status, 200, JSON.stringify(start.data));
    const { war: test } = start.data;
    assert.equal(test.test, true);
    assert.deepEqual([test.theirs.name, test.theirs.tag, test.theirs.teams], [war.mirror.name, war.mirror.tag, 2]);
    assert.deepEqual([test.next.day, test.next.battles, test.next.fights], [week().today, 2, [2]]);
    assert.equal((await as('lider', 'POST', '/api/test/guild-war', { action: 'start' })).data.error.code, 'at_war');
    const before = await first('SELECT gold FROM characters WHERE id = ?', ids.lider);
    const fought = (await as('lider', 'POST', '/api/test/guild-war', { action: 'fight' })).data;
    assert.equal(fought.war.battles.length, 2);
    const rows = await all('SELECT * FROM guild_war_battles ORDER BY number');
    for (const row of rows) {
      const fighters = JSON.parse(row.fighters);
      assert.deepEqual(
        fighters.a.map((one) => one.id),
        [ids.lider],
      );
      assert.ok(fighters.b.every((one) => one.id === null && one.name !== 'Lider'));
    }
    const wins = rows.filter((row) => row.result === 'a').length;
    const after = await first('SELECT gold FROM characters WHERE id = ?', ids.lider);
    assert.equal(after.gold - before.gold, wins * warReward(50, content).gold);
    // To the end of the week, then nothing more to fight.
    let view = fought;
    while (view.war.next) view = (await as('lider', 'POST', '/api/test/guild-war', { action: 'fight' })).data;
    assert.ok(['win', 'loss', 'draw'].includes(view.war.result));
    assert.equal((await as('lider', 'POST', '/api/test/guild-war', { action: 'fight' })).data.error.code, 'no_war');
    assert.equal((await as('lider', 'POST', '/api/test/guild-war', { action: 'end' })).status, 200);
    assert.equal((await all('SELECT * FROM guild_wars')).length, 0);
    assert.equal((await all('SELECT * FROM guild_war_battles')).length, 0);
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

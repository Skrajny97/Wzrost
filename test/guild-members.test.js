// The Ranking członków (src/server/guild-members.js; 897 A): each member's
// Sława by its parts, counted as the guild's own (the Bestia's percents and
// last blow, a fallen guardian's points by damage, the Próby, Prośby and
// Wymiana with their caps, a war won split among its fighters); the
// donations to the Siedziba by member, this week and from the start, with
// those of before the game wrote them in one line; a week gone written
// once for every guild, the first time the next week asks, also when a
// character loads (championOf); the rows going with the guild, and kept,
// no one's, when a character is removed.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { questPeriod } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const fame = content.guilds.fame;
const cap = content.guilds.trials.cap;
const stages = content.guilds.expedition.guardians.length;
const HOUR = 3600000;
// The characters were made long before the weeks of the tests (the
// sources count a character's rows from its making on).
const MADE = 1000;
const number = (value) => new Intl.NumberFormat('pl-PL').format(value);

describe('the Ranking członków through the API', () => {
  const { call, db, signUp } = useServer();
  const cookies = {};
  const ids = {};

  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  const all = async (sql, ...binds) => (await (await db()).prepare(sql).bind(...binds).all()).results;
  const ranking = async (login) => (await as(login, 'GET', '/api/guild/ranking')).data;
  const named = (rows) => Object.fromEntries(rows.map((row) => [row.name, row]));
  const partsOf = (row) => Object.fromEntries(row.parts.map((part) => [part.id, part.points]));

  async function player(login, name) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await run('UPDATE characters SET level = 30, gold = 5000, created_at = ? WHERE name = ?', MADE, name);
    ids[login] = (await first('SELECT id FROM characters WHERE name = ?', name)).id;
  }

  async function guild(leader, name, tag, members = []) {
    assert.equal((await as(leader, 'POST', '/api/guild/found', { name, tag })).status, 200);
    const guildId = (await as(leader, 'GET', '/api/guild')).data.guild.id;
    for (const [login, character] of members) {
      await as(leader, 'POST', '/api/guild/invite', { name: character });
      assert.equal((await as(login, 'POST', '/api/guild/accept', { guildId })).status, 200);
    }
    return guildId;
  }

  // The rows the sources keep, at `at` of the week `week` (its key).
  async function beast(guildId, week, hits, fallenBy, at) {
    const { meta } = await run(
      "INSERT INTO guild_beasts (guild_id, week, monster_id, area_id, level, members, max_hp, hp, created_at, fallen_at, fallen_by) VALUES (?, ?, 'tusker', 'boar-thicket', 40, 2, 1000, ?, ?, ?, ?)",
      guildId,
      week,
      1000 - hits.reduce((sum, [, damage]) => sum + damage, 0),
      at,
      fallenBy === null ? null : at,
      fallenBy,
    );
    for (const [characterId, damage] of hits) {
      await run("INSERT INTO guild_beast_hits (beast_id, character_id, day, damage, created_at) VALUES (?, ?, 'd', ?, ?)", meta.last_row_id, characterId, damage, at);
    }
  }
  async function guardian(guildId, week, stage, hits, at) {
    await run("INSERT OR IGNORE INTO guild_expeditions (guild_id, week, land_id, level, guardians, active, created_at) VALUES (?, ?, 'boar-thicket', 30, '[]', 2, 0)", guildId, week);
    const route = (await first('SELECT id FROM guild_expeditions WHERE guild_id = ? AND week = ?', guildId, week)).id;
    const { meta } = await run(
      "INSERT INTO guild_expedition_guardians (expedition_id, stage, monster_id, area_id, level, members, need, max_hp, hp, created_at, fallen_at, fallen_by) VALUES (?, ?, 'tusker', 'boar-thicket', 30, 2, 300, 1000, 0, 0, ?, ?)",
      route,
      stage,
      at,
      hits.at(-1)[0],
    );
    for (const [characterId, damage] of hits) {
      await run("INSERT INTO guild_expedition_hits (guardian_id, character_id, day, damage, created_at) VALUES (?, ?, 'd', ?, ?)", meta.last_row_id, characterId, damage, at);
    }
  }
  async function trials(guildId, week, characterId, count, at, from = 0) {
    for (let index = from; index < from + count; index += 1) {
      await run(
        "INSERT INTO guild_trials (guild_id, week, character_id, trial, kind, count, progress, state, taken_at, done_at) VALUES (?, ?, ?, ?, 'explore', 1, 1, 'done', ?, ?)",
        guildId,
        week,
        characterId,
        index,
        at,
        at,
      );
    }
  }
  async function gift(guildId, giverId, askerId, count, at) {
    const { meta } = await run(
      "INSERT INTO guild_requests (guild_id, character_id, kind, good, count, given, state, created_at, ends_at, closed_at) VALUES (?, ?, 'herb', 'comfrey', ?, ?, 'filled', ?, ?, ?)",
      guildId,
      askerId,
      count,
      count,
      at,
      at + HOUR,
      at,
    );
    await run('INSERT INTO guild_gifts (request_id, guild_id, giver_id, count, created_at) VALUES (?, ?, ?, ?, ?)', meta.last_row_id, guildId, giverId, count, at);
  }
  async function exchanges(guildId, posterId, takerId, count, at) {
    for (let index = 0; index < count; index += 1) {
      await run(
        "INSERT INTO guild_offers (guild_id, character_id, give, give_count, want, want_count, state, created_at, ends_at, closed_at, taker_id) VALUES (?, ?, 'stone', 1, 'wood', 1, 'taken', ?, ?, ?, ?)",
        guildId,
        posterId,
        at,
        at + HOUR,
        at,
        takerId,
      );
    }
  }
  // A war of `week` that guild_a won, with its battles' fighters of each
  // side (character ids; a fighter of no character as null).
  async function war(week, a, b, battles) {
    const { meta } = await run(
      "INSERT INTO guild_wars (week, guild_a, guild_b, name_a, tag_a, members_a, name_b, tag_b, members_b, seed, days_done, wins_a, wins_b, result, created_at) VALUES (?, ?, ?, 'A', 'A', 2, 'B', 'B', 2, 's', 7, ?, 0, 'a', 0)",
      week,
      a,
      b,
      battles.length,
    );
    const fighter = (id) => (id === null ? { id: null, name: 'Odbicie' } : { id, since: MADE, name: 'X' });
    for (const [index, [ours, theirs]] of battles.entries()) {
      await run(
        "INSERT INTO guild_war_battles (war_id, day, number, team_a, team_b, result, at, fighters) VALUES (?, 0, ?, 1, 1, 'a', 0, ?)",
        meta.last_row_id,
        index + 1,
        JSON.stringify({ a: ours.map(fighter), b: theirs.map(fighter), standing: { a: 1, b: 0 } }),
      );
    }
  }

  beforeEach(async () => {
    await player('ala', 'Ala');
    await player('ola', 'Ola');
    await player('ewa', 'Ewa');
    await player('iza', 'Iza');
  });

  test("each member's Sława this week by its parts, as the guild's own, the own row marked", async () => {
    const forest = await guild('ala', 'Leśni Bracia', 'LB', [['ola', 'Ola']]);
    const stone = await guild('ewa', 'Kamienny Krąg', 'KK', [['iza', 'Iza']]);
    const week = questPeriod('weekly', Date.now(), content);
    const at = Math.max(week.startsAt, Date.now() - HOUR);
    // The Bestia fell: 65.5% of its bar Ala's, 34.5% Ola's with the last blow.
    await beast(forest, week.key, [[ids.ala, 655], [ids.ola, 345]], ids.ola, at);
    // Two guardians fell: the first 60/40, the seventh all Ala's.
    await guardian(forest, week.key, 1, [[ids.ola, 400], [ids.ala, 600]], at);
    await guardian(forest, week.key, stages, [[ids.ala, 1000]], at);
    // The Próby, the Prośby and the Wymiana, each over its cap for one of them.
    await trials(forest, week.key, ids.ala, cap + 2, at);
    await trials(forest, week.key, ids.ola, 3, at);
    await gift(forest, ids.ola, ids.ala, 25, at);
    await gift(forest, ids.ola, ids.ala, 15, at);
    await gift(forest, ids.ala, ids.ola, 5, at);
    await exchanges(forest, ids.ala, ids.ola, fame.exchange.cap + 2, at);
    await exchanges(forest, ids.ola, ids.ala, 1, at);
    // The war won: two battles, Ala in both, Ola in one, a fighter of no
    // character in another.
    await war(week.key, forest, stone, [
      [[ids.ala, ids.ola], [ids.ewa, ids.iza]],
      [[ids.ala, null], [ids.ewa]],
    ]);
    const seen = await ranking('ola');
    const rows = named(seen.activity.week);
    const share = Math.floor(fame.war.won / 2);
    assert.deepEqual(partsOf(rows.Ala), {
      beast: 65 * fame.beast.perPercent,
      expedition: Math.floor((fame.expedition.perGuardian * 600) / 1000) + fame.expedition.last,
      trials: cap * fame.trials.perTrial,
      requests: 5 * fame.requests.perPiece,
      exchange: fame.exchange.perExchange,
      war: share,
    });
    assert.deepEqual(partsOf(rows.Ola), {
      beast: 34 * fame.beast.perPercent + fame.beast.fell,
      expedition: Math.floor((fame.expedition.perGuardian * 400) / 1000),
      trials: 3 * fame.trials.perTrial,
      requests: fame.requests.cap * fame.requests.perPiece,
      exchange: fame.exchange.cap * fame.exchange.perExchange,
      war: share,
    });
    for (const row of seen.activity.week) assert.equal(row.fame, Object.values(partsOf(row)).reduce((sum, points) => sum + points, 0));
    // The most first; the own row marked; the parts' names in words.
    assert.deepEqual(
      seen.activity.week.map((row) => [row.place, row.name, row.own, row.classId]),
      [
        [1, 'Ala', false, 'warrior'],
        [2, 'Ola', true, 'warrior'],
      ],
    );
    assert.equal(rows.Ala.parts.find((part) => part.id === 'beast').name, content.guilds.members.parts.beast);
    // From the start: the same, nothing written before.
    assert.deepEqual(seen.activity.all.map((row) => [row.name, row.fame]), seen.activity.week.map((row) => [row.name, row.fame]));
    // The other guild sees only its own members, of no Sława and no parts.
    const other = await ranking('iza');
    assert.deepEqual(other.activity.week.map((row) => [row.name, row.fame, row.parts.length, row.own]), [
      ['Ewa', 0, 0, false],
      ['Iza', 0, 0, true],
    ]);
    // The words: the rules' numbers filled in, the day "Od początku" counts
    // from left for the page.
    assert.ok(seen.texts.how.some((line) => line.includes(`${fame.beast.fell} punktów`)));
    assert.ok(seen.texts.how.every((line) => !line.replace('{since}', '').includes('{')));
    assert.ok(seen.texts.how.some((line) => line.includes('{since}')));
    assert.equal(seen.texts.$comment, undefined);
    assert.match(seen.since, /^\d{4}-\d{2}-\d{2}$/);
  });

  test('a character of an id given again counts nothing of the old one, nor do rows of another week', async () => {
    const forest = await guild('ala', 'Leśni Bracia', 'LB', [['ola', 'Ola']]);
    const week = questPeriod('weekly', Date.now(), content);
    const at = Math.max(week.startsAt, Date.now() - HOUR);
    // Ola "made" after the hits and the trials of this week.
    await trials(forest, week.key, ids.ola, 2, at);
    await beast(forest, week.key, [[ids.ola, 500]], null, at);
    await run('UPDATE characters SET created_at = ? WHERE id = ?', at + 1, ids.ola);
    // Ala's of the week before count not in this week's.
    const last = questPeriod('weekly', week.startsAt - 1, content);
    await trials(forest, last.key, ids.ala, 2, last.startsAt + HOUR);
    const seen = await ranking('ala');
    assert.deepEqual(seen.activity.week.map((row) => [row.name, row.fame]), [
      ['Ala', 0],
      ['Ola', 0],
    ]);
  });

  test("the donations by member, this week and from the start, and those of before in one line", async () => {
    const forest = await guild('ala', 'Leśni Bracia', 'LB', [['ola', 'Ola']]);
    const week = questPeriod('weekly', Date.now(), content);
    const last = questPeriod('weekly', week.startsAt - 1, content);
    const resourceOf = Object.fromEntries(content.guilds.seat.buildings.map((building) => [building.id, building.resource]));
    assert.equal(resourceOf['guild-banner'], 'wood');
    assert.equal(resourceOf['guild-treasury'], 'stone');
    // The buildings' sums: all ever given, also before the game wrote who.
    await run("INSERT INTO guild_seat (guild_id, building_id, gold, resource) VALUES (?, 'guild-banner', 10000, 900), (?, 'guild-treasury', 5000, 300)", forest, forest);
    const donation = (characterId, key, building, gold, resource) =>
      run('INSERT INTO guild_seat_donations (guild_id, character_id, week, building_id, gold, resource) VALUES (?, ?, ?, ?, ?, ?)', forest, characterId, key, building, gold, resource);
    await donation(ids.ala, week.key, 'guild-banner', 3000, 200);
    await donation(ids.ola, week.key, 'guild-treasury', 1000, 100);
    await donation(ids.ola, last.key, 'guild-banner', 4000, 0);
    // A member gone: no row of its own, its gold not "before" either.
    await donation(-77, last.key, 'guild-banner', 500, 0);
    const seen = await ranking('ala');
    const resources = (row) => Object.fromEntries(row.resources.filter((one) => one.count > 0).map((one) => [one.id, one.count]));
    assert.deepEqual(
      seen.donations.week.map((row) => [row.place, row.name, row.gold, resources(row), row.own]),
      [
        [1, 'Ala', 3000, { wood: 200 }, true],
        [2, 'Ola', 1000, { stone: 100 }, false],
      ],
    );
    assert.deepEqual(
      seen.donations.all.map((row) => [row.name, row.gold, resources(row)]),
      [
        ['Ola', 5000, { stone: 100 }],
        ['Ala', 3000, { wood: 200 }],
      ],
    );
    // Each resource of the Siedziba once, named.
    assert.deepEqual(
      seen.donations.all[0].resources.map((one) => [one.id, one.name]),
      ['wood', 'stone', 'iron-ore'].map((id) => [id, content.resourcesById[id].name]),
    );
    const { genitive: wood } = content.resourcesById.wood;
    const { genitive: stone } = content.resourcesById.stone;
    assert.equal(seen.earlier, `Wcześniejsze wpłaty, zanim gra zaczęła zapisywać, kto wpłacił: ${number(6500)} złota, ${number(700)} ${wood} i ${number(200)} ${stone}.`);
    // All of it written: no line.
    await run("UPDATE guild_seat SET gold = 7500, resource = 200 WHERE guild_id = ? AND building_id = 'guild-banner'", forest);
    await run("UPDATE guild_seat SET gold = 1000, resource = 100 WHERE guild_id = ? AND building_id = 'guild-treasury'", forest);
    assert.equal((await ranking('ala')).earlier, null);
  });

  test('a donation through the Siedziba lands in the ranking of the week', async () => {
    const forest = await guild('ala', 'Leśni Bracia', 'LB');
    await run(`UPDATE characters SET gold = 9000, resources = json_set(COALESCE(resources, '{}'), '$."wood"', 50) WHERE id = ?`, ids.ala);
    assert.equal((await as('ala', 'POST', '/api/guild/seat/donate', { buildingId: 'guild-banner', gold: 2500, resource: 40 })).status, 200);
    const seen = await ranking('ala');
    assert.equal(seen.donations.week[0].gold, 2500);
    assert.equal(seen.donations.week[0].resources.find((one) => one.id === 'wood').count, 40);
    assert.equal(seen.earlier, null);
    assert.ok(forest);
  });

  test('a week gone is written once for every guild when the next week asks; "Od początku" adds this week', async () => {
    const forest = await guild('ala', 'Leśni Bracia', 'LB', [['ola', 'Ola']]);
    const stone = await guild('ewa', 'Kamienny Krąg', 'KK', [['iza', 'Iza']]);
    const week = questPeriod('weekly', Date.now(), content);
    const last = questPeriod('weekly', week.startsAt - 1, content);
    const before = questPeriod('weekly', last.startsAt - 1, content);
    const at = Math.max(week.startsAt, Date.now() - HOUR);
    // Founding the guilds loaded the characters, which wrote last week
    // empty: as if they had not.
    await run('DELETE FROM guild_member_fame_weeks');
    await run('DELETE FROM guild_fame');
    await trials(forest, last.key, ids.ala, 2, last.startsAt + HOUR);
    await exchanges(stone, ids.ewa, ids.iza, 3, last.startsAt + HOUR);
    await trials(forest, week.key, ids.ola, 1, at);
    // Two weeks ago, written then.
    await run('INSERT INTO guild_member_fame (guild_id, character_id, week, beast) VALUES (?, ?, ?, 7)', forest, ids.ala, before.key);
    await run('INSERT INTO guild_member_fame_weeks (week, frozen_at) VALUES (?, 0)', before.key);
    // Loading a character writes the guilds' Sława of last week and the
    // members' with it.
    assert.equal((await as('iza', 'GET', '/api/character')).status, 200);
    const written = async () => all('SELECT guild_id, character_id, trials, exchange FROM guild_member_fame WHERE week = ? ORDER BY guild_id, character_id', last.key);
    assert.deepEqual(await written(), [
      { guild_id: forest, character_id: ids.ala, trials: 2 * fame.trials.perTrial, exchange: 0 },
      { guild_id: stone, character_id: ids.iza, trials: 0, exchange: 3 * fame.exchange.perExchange },
    ]);
    assert.ok(await first('SELECT 1 AS done FROM guild_member_fame_weeks WHERE week = ?', last.key));
    // Once: a change to last week's rows changes nothing written.
    await trials(forest, last.key, ids.ola, 4, last.startsAt + HOUR, 20);
    await ranking('ala');
    await as('ola', 'GET', '/api/character');
    assert.equal((await written()).length, 2);
    // "Od początku": the weeks written and this one; "Ten tydzień" this one.
    const seen = await ranking('ola');
    assert.deepEqual(seen.activity.all.map((row) => [row.name, row.fame]), [
      ['Ala', 7 + 2 * fame.trials.perTrial],
      ['Ola', fame.trials.perTrial],
    ]);
    assert.deepEqual(seen.activity.week.map((row) => [row.name, row.fame]), [
      ['Ola', fame.trials.perTrial],
      ['Ala', 0],
    ]);
    assert.equal(seen.since, before.key);
    // The ranking writes the week itself should no character have loaded.
    await run('DELETE FROM guild_member_fame');
    await run('DELETE FROM guild_member_fame_weeks');
    assert.deepEqual((await ranking('ala')).activity.all.map((row) => [row.name, row.fame]), [
      ['Ala', 2 * fame.trials.perTrial],
      ['Ola', 4 * fame.trials.perTrial + fame.trials.perTrial],
    ].sort((a, b) => b[1] - a[1]));
    assert.ok(await first('SELECT 1 AS done FROM guild_member_fame_weeks WHERE week = ?', last.key));
    // A guild that goes takes its weeks along.
    assert.equal((await as('iza', 'POST', '/api/guild/leave')).status, 200);
    assert.equal((await as('ewa', 'POST', '/api/guild/leave')).status, 200);
    assert.equal((await first('SELECT COUNT(*) AS count FROM guild_member_fame WHERE guild_id = ?', stone)).count, 0);
    assert.ok((await first('SELECT COUNT(*) AS count FROM guild_member_fame WHERE guild_id = ?', forest)).count > 0);
  });

  test("a character removed leaves its weeks with the guild, no one's", async () => {
    const forest = await guild('ala', 'Leśni Bracia', 'LB', [['ola', 'Ola']]);
    const week = questPeriod('weekly', Date.now(), content);
    const last = questPeriod('weekly', week.startsAt - 1, content);
    await run('INSERT INTO guild_member_fame (guild_id, character_id, week, trials, war) VALUES (?, ?, ?, 30, 50)', forest, ids.ola, last.key);
    // One removed before with the same id: the weeks summed.
    await run('INSERT INTO guild_member_fame (guild_id, character_id, week, trials) VALUES (?, ?, ?, 20)', forest, -ids.ola, last.key);
    assert.equal((await as('ola', 'DELETE', '/api/character')).status, 200);
    assert.equal((await first('SELECT COUNT(*) AS count FROM guild_member_fame WHERE character_id = ?', ids.ola)).count, 0);
    assert.deepEqual(
      { ...(await first('SELECT trials, war FROM guild_member_fame WHERE guild_id = ? AND character_id = ? AND week = ?', forest, -ids.ola, last.key)) },
      { trials: 50, war: 50 },
    );
    // The ranking shows the members of now only.
    assert.deepEqual((await ranking('ala')).activity.all.map((row) => row.name), ['Ala']);
  });

  test('outside a guild there is no ranking', async () => {
    const answer = await as('ala', 'GET', '/api/guild/ranking');
    assert.equal(answer.status, 409);
  });
});

// The Bohaterowie tygodnia through the API (src/server/guild-heroes.js;
// 1198 A): on Monday at midnight in Poland (the first look of the new week
// or the cron's minute) the best members of each guild of the week gone are
// named once its members' Sława is written: the Filar Gildii by that Sława,
// the Pogromca by the damage dealt to the Bestia and the Wyprawa's
// guardians, the Dobroczyńca by the pieces given in the Prośby; the members
// of now only, of two with as much the one in the guild longer. Each hero
// gets 30 Punktów Czasu and a pack of cards once, also of two looks at once
// and the cron after them, and wears its badge on the members' list and on
// its card for the week; the card of the Gildia tab shows last week's
// heroes and this week's leaders; the next week the badges go.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { countedForm, questPeriod } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const DAY = 24 * 3600000;
const HOUR = 3600000;
// The characters were made long before the weeks of the tests.
const MADE = 1000;
const cap = content.guilds.trials.cap;
const reward = content.guilds.heroes.reward;

describe('the Bohaterowie tygodnia through the API', () => {
  // The tests' own clock: the week after this one, so the same any day.
  const { server, call, db, signUp } = useServer({ TEST_CLOCK: 'on' });
  const week = questPeriod('weekly', Date.now() + 7 * DAY, content);
  const next = questPeriod('weekly', week.endsAt, content);
  const after = questPeriod('weekly', next.endsAt, content);
  let clock = week.startsAt + HOUR;
  const cookies = {};
  const ids = {};
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body, now: clock });
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  const all = async (sql, ...binds) => (await (await db()).prepare(sql).bind(...binds).all()).results;
  const cron = (at) => server.getWorker().scheduled({ cron: '* * * * *', scheduledTime: new Date(at) });
  const packs = async (login) => (await first('SELECT card_packs FROM characters WHERE id = ?', ids[login])).card_packs;
  const timePoints = async (login) => (await first('SELECT time_points FROM characters WHERE id = ?', ids[login])).time_points;

  async function player(login, name) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await run('UPDATE characters SET level = 30, gold = 5000, created_at = ? WHERE name = ?', MADE, name);
    ids[login] = (await first('SELECT id FROM characters WHERE name = ?', name)).id;
  }

  async function guild(leader, name, tag, members = []) {
    assert.equal((await as(leader, 'POST', '/api/guild/found', { name, tag })).status, 200);
    const guildId = (await as(leader, 'GET', '/api/guild')).data.guild.id;
    for (const login of members) {
      clock += 60000;
      await as(leader, 'POST', '/api/guild/invite', { name: login[0].toUpperCase() + login.slice(1) });
      assert.equal((await as(login, 'POST', '/api/guild/accept', { guildId })).status, 200);
    }
    return guildId;
  }

  // The week's rows of the sources, at `at`.
  async function beast(guildId, hits, fallenBy, at) {
    const { meta } = await run(
      "INSERT INTO guild_beasts (guild_id, week, monster_id, area_id, level, members, max_hp, hp, created_at, fallen_at, fallen_by) VALUES (?, ?, 'tusker', 'boar-thicket', 40, 2, 1000, ?, ?, ?, ?)",
      guildId,
      week.key,
      1000 - hits.reduce((sum, [, damage]) => sum + damage, 0),
      at,
      fallenBy === null ? null : at,
      fallenBy,
    );
    for (const [characterId, damage] of hits) await run("INSERT INTO guild_beast_hits (beast_id, character_id, day, damage, created_at) VALUES (?, ?, 'd', ?, ?)", meta.last_row_id, characterId, damage, at);
  }
  async function guardian(guildId, hits, at) {
    await run("INSERT OR IGNORE INTO guild_expeditions (guild_id, week, land_id, level, guardians, active, created_at) VALUES (?, ?, 'stone-glade', 30, '[]', 2, ?)", guildId, week.key, at);
    const route = (await first('SELECT id FROM guild_expeditions WHERE guild_id = ? AND week = ?', guildId, week.key)).id;
    const { meta } = await run(
      "INSERT INTO guild_expedition_guardians (expedition_id, stage, monster_id, area_id, level, members, need, max_hp, hp, created_at) VALUES (?, 1, 'tusker', 'boar-thicket', 30, 2, 300, 5000, 4000, ?)",
      route,
      at,
    );
    for (const [characterId, damage] of hits) await run("INSERT INTO guild_expedition_hits (guardian_id, character_id, day, damage, created_at) VALUES (?, ?, 'd', ?, ?)", meta.last_row_id, characterId, damage, at);
  }
  async function trials(guildId, characterId, count, at) {
    for (let index = 0; index < count; index += 1) {
      await run(
        "INSERT INTO guild_trials (guild_id, week, character_id, trial, kind, count, progress, state, taken_at, done_at) VALUES (?, ?, ?, ?, 'explore', 1, 1, 'done', ?, ?)",
        guildId,
        week.key,
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

  beforeEach(async () => {
    clock = week.startsAt + HOUR;
    await player('ala', 'Ala');
    await player('ola', 'Ola');
    await player('ewa', 'Ewa');
    await player('iza', 'Iza');
  });

  test("named on Monday at midnight, rewarded once, the badges on the members' list and the card for the week, gone the week after", async () => {
    const forest = await guild('ala', 'Leśni Bracia', 'LB', ['ola', 'ewa']);
    const stone = await guild('iza', 'Kamienny Krąg', 'KK');
    const at = week.startsAt + 2 * HOUR;
    // Sława: Ala 30 of the Bestia and the cap of the Próby; Ola 70 and the
    // last blow. Damage: Ola 700 to the Bestia, Ala 300 and 250 to a
    // guardian standing still. Pieces: Ewa 9, Ala 4; Iza 20 in her guild.
    await beast(forest, [
      [ids.ala, 300],
      [ids.ola, 700],
    ], ids.ola, at);
    await guardian(forest, [[ids.ala, 250]], at);
    await trials(forest, ids.ala, cap, at);
    await gift(forest, ids.ewa, ids.ala, 9, at);
    await gift(forest, ids.ala, ids.ola, 4, at);
    await gift(stone, ids.iza, ids.iza, 20, at);

    // Within the week: none named yet, this week's leaders live.
    clock = week.startsAt + 3 * DAY;
    const live = (await as('ola', 'GET', '/api/guild/heroes')).data;
    assert.deepEqual(live.last, []);
    assert.deepEqual(
      live.leaders.map((one) => [one.kind, one.character?.name ?? null, one.value ?? null]),
      [
        ['pillar', 'Ala', 30 + cap * content.guilds.fame.trials.perTrial + 4],
        ['slayer', 'Ola', 700],
        ['benefactor', 'Ewa', 9],
      ],
    );
    assert.equal(live.leaders[1].valueText, '700 obrażeń');
    assert.equal(live.leaders[1].name, 'Pogromczyni');
    assert.match(live.texts.reward, /30 Punktów Czasu/);
    assert.ok(live.texts.how.every((line) => !line.includes('{')));
    assert.equal((await first('SELECT COUNT(*) AS n FROM guild_heroes')).n, 0);

    const before = { ola: await timePoints('ola'), ewa: await timePoints('ewa'), iza: await timePoints('iza') };
    const packsBefore = { ala: await packs('ala'), ola: await packs('ola'), ewa: await packs('ewa'), iza: await packs('iza') };
    // Monday, a minute after midnight: two looks at once, then the cron.
    clock = next.startsAt + 60000;
    await Promise.all([as('ala', 'GET', '/api/character'), as('iza', 'GET', '/api/character')]);
    await cron(next.startsAt + 120000);
    const rows = await all('SELECT week, guild_id, kind, character_id, value FROM guild_heroes ORDER BY guild_id, kind');
    assert.deepEqual(
      rows.map((row) => [row.week, row.guild_id, row.kind, row.character_id, row.value]),
      [
        [week.key, forest, 'benefactor', ids.ewa, 9],
        [week.key, forest, 'pillar', ids.ala, 30 + cap * content.guilds.fame.trials.perTrial + 4],
        [week.key, forest, 'slayer', ids.ola, 700],
        // One character may win two: Iza's guild has only her.
        [week.key, stone, 'benefactor', ids.iza, 20],
        [week.key, stone, 'pillar', ids.iza, 20],
      ],
    );
    // The rewards, once each, twice for two honours.
    assert.equal(await packs('ala'), packsBefore.ala + reward.packs);
    assert.equal(await packs('ola'), packsBefore.ola + reward.packs);
    assert.equal(await packs('ewa'), packsBefore.ewa + reward.packs);
    assert.equal(await packs('iza'), packsBefore.iza + 2 * reward.packs);
    assert.equal(await timePoints('ola'), before.ola + reward.timePoints);
    assert.equal(await timePoints('ewa'), before.ewa + reward.timePoints);
    assert.ok((await timePoints('iza')) >= before.iza + 2 * reward.timePoints);
    // Another look changes nothing.
    await as('ola', 'GET', '/api/character');
    assert.equal(await packs('ola'), packsBefore.ola + reward.packs);

    // The badges by the names on the members' list…
    const members = (await as('ala', 'GET', '/api/guild')).data.guild.members;
    const badges = Object.fromEntries(members.map((member) => [member.name, member.heroes.map((hero) => [hero.kind, hero.name])]));
    assert.deepEqual(badges, { Ala: [['pillar', 'Filar Gildii']], Ola: [['slayer', 'Pogromczyni']], Ewa: [['benefactor', 'Dobroczyńczyni']] });
    assert.equal(members.find((member) => member.name === 'Ola').heroes[0].tip, 'Pogromczyni poprzedniego tygodnia');
    // …and on the card, for anyone who looks.
    const card = (await as('iza', 'GET', '/api/profile/Ola')).data.profile;
    assert.deepEqual(card.heroes, [{ kind: 'slayer', name: 'Pogromczyni', tip: 'Pogromczyni poprzedniego tygodnia' }]);
    const two = (await as('ala', 'GET', '/api/profile/Iza')).data.profile;
    assert.deepEqual(two.heroes.map((hero) => hero.kind), ['pillar', 'benefactor']);
    // The card of the Gildia tab: last week's heroes, nobody leading yet.
    const shown = (await as('ewa', 'GET', '/api/guild/heroes')).data;
    assert.deepEqual(
      shown.last.map((one) => [one.kind, one.character.name, one.valueText]),
      [
        ['pillar', 'Ala', `${30 + cap * content.guilds.fame.trials.perTrial + 4} ${countedForm(30 + cap * content.guilds.fame.trials.perTrial + 4, content.guilds.heroes.kinds[0].units)}`],
        ['slayer', 'Ola', '700 obrażeń'],
        ['benefactor', 'Ewa', '9 sztuk'],
      ],
    );
    assert.ok(shown.leaders.every((one) => !one.character));

    // The week after: no heroes named for an empty week, last week's badges
    // gone, their rows too.
    clock = after.startsAt + 60000;
    await as('ala', 'GET', '/api/character');
    assert.ok((await as('ala', 'GET', '/api/guild')).data.guild.members.every((member) => member.heroes.length === 0));
    assert.deepEqual((await as('iza', 'GET', '/api/profile/Ola')).data.profile.heroes, []);
    assert.equal((await first('SELECT COUNT(*) AS n FROM guild_heroes')).n, 0);
    assert.deepEqual(
      (await all('SELECT week FROM guild_hero_weeks ORDER BY week')).map((row) => row.week),
      [next.key],
    );
  });

  test('only the members of now count, of two with as much the one in the guild longer; a kind of nothing has no hero', async () => {
    const forest = await guild('ala', 'Leśni Bracia', 'LB', ['ola', 'ewa']);
    const at = week.startsAt + 2 * HOUR;
    await gift(forest, ids.ola, ids.ewa, 5, at);
    await gift(forest, ids.ala, ids.ewa, 5, at);
    // Ewa gave the most, but leaves the guild before Monday.
    await gift(forest, ids.ewa, ids.ala, 8, at);
    clock = week.startsAt + 5 * DAY;
    assert.equal((await as('ewa', 'POST', '/api/guild/leave')).status, 200);
    clock = next.startsAt + 60000;
    await as('ola', 'GET', '/api/character');
    const rows = await all('SELECT kind, character_id, value FROM guild_heroes WHERE guild_id = ? ORDER BY kind', forest);
    // Ala and Ola tie at 5 pieces and 5 Sława: Ala founded the guild first.
    assert.deepEqual(
      rows.map((row) => [row.kind, row.character_id, row.value]),
      [
        ['benefactor', ids.ala, 5],
        ['pillar', ids.ala, 5],
      ],
    );
  });

  test('outside a guild the heroes card answers that the guild is for members', async () => {
    const answer = await as('ala', 'GET', '/api/guild/heroes');
    assert.equal(answer.status, 409);
    assert.equal(answer.data.error.code, 'no_guild');
  });
});

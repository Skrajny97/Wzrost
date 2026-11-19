// The Krainy pod sztandarem through the API (src/server/guild-lands.js;
// 1200 A): an exploration's minutes count for its land and the guild the
// character is in as it claims the report (none outside a guild); the Wojna
// tab's card shows the week live (lead, alone, chase, the gap, a tie by
// age); on Monday each land goes to the guild with the most minutes, of as
// many the older one, none where nobody went, once (also of the cron after
// a look): its tag on every player's land cards, the land's Sława for the
// guild in the banner's week, split among its members by their minutes, and
// the bonus kept with an exploration of a member set out there; a guild
// gone takes its banner along.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { questPeriod } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const DAY = 24 * 3600000;
const HOUR = 3600000;
const MADE = 1000;
const { fame, bonus } = content.guilds.lands;

describe('the Krainy pod sztandarem through the API', () => {
  const { server, call, db, signUp } = useServer({ TEST_CLOCK: 'on' });
  const week = questPeriod('weekly', Date.now() + 7 * DAY, content);
  const next = questPeriod('weekly', week.endsAt, content);
  let clock = week.startsAt + HOUR;
  const cookies = {};
  const ids = {};
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body, now: clock });
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  const all = async (sql, ...binds) => (await (await db()).prepare(sql).bind(...binds).all()).results;
  const cron = (at) => server.getWorker().scheduled({ cron: '* * * * *', scheduledTime: new Date(at) });

  async function player(login, name) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await run('UPDATE characters SET level = 30, class_level = 30, gold = 5000, created_at = ? WHERE name = ?', MADE, name);
    ids[login] = (await first('SELECT id FROM characters WHERE name = ?', name)).id;
  }

  async function guild(leader, name, tag, members = []) {
    assert.equal((await as(leader, 'POST', '/api/guild/found', { name, tag })).status, 200);
    const guildId = (await as(leader, 'GET', '/api/guild')).data.guild.id;
    for (const login of members) {
      await as(leader, 'POST', '/api/guild/invite', { name: login[0].toUpperCase() + login.slice(1) });
      assert.equal((await as(login, 'POST', '/api/guild/accept', { guildId })).status, 200);
    }
    return guildId;
  }

  const minutes = (landId, guildId, login, count) =>
    run('INSERT INTO guild_land_minutes (week, land_id, guild_id, character_id, minutes, updated_at) VALUES (?, ?, ?, ?, ?, ?)', week.key, landId, guildId, ids[login], count, clock);

  beforeEach(async () => {
    clock = week.startsAt + HOUR;
    await player('ala', 'Ala');
    await player('ola', 'Ola');
    await player('iza', 'Iza');
    await player('ewa', 'Ewa');
  });

  test("a claimed exploration's minutes count for its land and the guild of the moment, none outside a guild", async () => {
    const forest = await guild('ala', 'Leśni Bracia', 'LB');
    for (const login of ['ala', 'ewa']) {
      assert.equal((await as(login, 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).status, 201);
      await as(login, 'POST', '/api/test/skip-time');
      const claimed = await as(login, 'POST', '/api/hunts/claim');
      assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
    }
    const rows = await all('SELECT week, land_id, guild_id, character_id, minutes FROM guild_land_minutes');
    assert.deepEqual(
      rows.map((row) => [row.week, row.land_id, row.guild_id, row.character_id, row.minutes]),
      [[week.key, 'windfalls', forest, ids.ala, 5]],
    );
    // The same minutes on the Wyprawa Gildii's route, as there.
    assert.equal((await first('SELECT minutes FROM guild_expedition_minutes WHERE character_id = ?', ids.ala)).minutes, 5);
    // The Wojna tab's card: the guild alone in the land.
    const seen = (await as('ala', 'GET', '/api/guild/lands')).data;
    assert.deepEqual(seen.lands, [{ id: 'windfalls', name: 'Wiatrołomy', own: 5, state: 'alone', gap: 5, rival: null }]);
  });

  test('the week live, then on Monday the banners: the most minutes, the older guild on a tie, none where nobody went; tags, Sława, shares and the bonus', async () => {
    const forest = await guild('ala', 'Leśni Bracia', 'LB', ['ola']);
    const stone = await guild('iza', 'Kamienny Krąg', 'KK');
    assert.ok(forest < stone);
    await minutes('windfalls', forest, 'ala', 100);
    await minutes('windfalls', forest, 'ola', 50);
    await minutes('windfalls', stone, 'iza', 120);
    await minutes('stone-glade', forest, 'ala', 60);
    await minutes('stone-glade', stone, 'iza', 60);
    await minutes('backwaters', stone, 'iza', 30);

    // Within the week, live, as the leading guild and as the chasing one.
    clock = week.startsAt + 4 * DAY;
    const ours = (await as('ola', 'GET', '/api/guild/lands')).data;
    assert.deepEqual(
      ours.lands.map((land) => [land.id, land.own, land.state, land.gap, land.rival?.tag ?? null]),
      [
        ['windfalls', 150, 'lead', 30, 'KK'],
        ['stone-glade', 60, 'lead', 0, 'KK'],
        ['backwaters', 0, 'chase', 30, 'KK'],
      ],
    );
    assert.deepEqual(ours.banners, []);
    assert.deepEqual(ours.rules, { fame, bonus });
    assert.ok(ours.texts.how.every((line) => !line.includes('{')));
    const theirs = (await as('iza', 'GET', '/api/guild/lands')).data;
    assert.deepEqual(
      theirs.lands.map((land) => [land.id, land.own, land.state, land.gap, land.rival?.tag ?? null]),
      [
        ['windfalls', 120, 'chase', 30, 'LB'],
        ['stone-glade', 60, 'chase', 0, 'LB'],
        ['backwaters', 30, 'alone', 30, null],
      ],
    );

    // Monday: a look, then the cron; raised once.
    clock = next.startsAt + 60000;
    const look = (await as('ewa', 'GET', '/api/character')).data;
    await cron(next.startsAt + 120000);
    assert.deepEqual(
      (await all('SELECT week, land_id, guild_id, minutes FROM guild_land_banners ORDER BY land_id')).map((row) => [row.week, row.land_id, row.guild_id, row.minutes]),
      [
        [next.key, 'backwaters', stone, 30],
        [next.key, 'stone-glade', forest, 60],
        [next.key, 'windfalls', forest, 150],
      ],
    );
    // The Kronika told each guild its banners in its chat (1195 A), once.
    const named = (ids) => content.regions.filter((region) => ids.includes(region.id)).map((region) => region.name).join(', ');
    const percent = Math.round(bonus * 100);
    const told = await all('SELECT channel, text FROM chat_messages WHERE chronicle_key = ? ORDER BY id', `lands:${next.key}`);
    assert.deepEqual(Object.fromEntries(told.map((line) => [line.channel, line.text])), {
      [`guild:${forest}`]: `Twoja gildia stawia sztandar w krainach: ${named(['windfalls', 'stone-glade'])}. Do niedzieli członkowie mają tam +${percent}% złota i materiałów ze stworów.`,
      [`guild:${stone}`]: `Twoja gildia stawia sztandar w krainie: ${named(['backwaters'])}. Do niedzieli członkowie mają tam +${percent}% złota i materiałów ze stworów.`,
    });
    // The tags on every player's land cards, also of one in no guild.
    assert.deepEqual(look.landBanners, {
      windfalls: { guildId: forest, tag: 'LB', name: 'Leśni Bracia' },
      'stone-glade': { guildId: forest, tag: 'LB', name: 'Leśni Bracia' },
      backwaters: { guildId: stone, tag: 'KK', name: 'Kamienny Krąg' },
    });
    // The Sława of the banners' week: the guild's, and its members' shares
    // by their minutes (Wiatrołomy 100 to 50, Gołe Skały Ala's alone).
    const guilds = (await as('ala', 'GET', '/api/ranking/guilds?period=week')).data.rows;
    assert.deepEqual(
      guilds.map((row) => [row.tag, row.fame]),
      [
        ['LB', 2 * fame],
        ['KK', fame],
      ],
    );
    const members = (await as('ala', 'GET', '/api/guild/ranking')).data.activity.week;
    const parts = Object.fromEntries(members.map((row) => [row.name, row.parts.find((part) => part.id === 'lands')?.points ?? 0]));
    assert.deepEqual(parts, { Ala: Math.floor((fame * 100) / 150) + fame, Ola: Math.floor((fame * 50) / 150) });
    assert.equal(members[0].parts.find((part) => part.id === 'lands').name, 'Krainy');
    // The card of the week: the banners standing, no minutes yet.
    const raised = (await as('ola', 'GET', '/api/guild/lands')).data;
    assert.deepEqual(raised.banners, [
      { id: 'windfalls', name: 'Wiatrołomy' },
      { id: 'stone-glade', name: content.regionsById['stone-glade'].name },
    ]);
    assert.deepEqual(raised.lands, []);

    // An exploration set out under the banner keeps its bonus; one of
    // another guild there, or of the guild elsewhere, none.
    assert.equal((await as('ala', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).status, 201);
    assert.equal((await as('iza', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).status, 201);
    const options = async (login) => JSON.parse((await first('SELECT options FROM activities WHERE character_id = ?', ids[login])).options);
    assert.equal((await options('ala')).banner, bonus);
    assert.equal((await options('iza')).banner, undefined);
    const claimed = await (async () => {
      await as('ala', 'POST', '/api/test/skip-time');
      return as('ala', 'POST', '/api/hunts/claim');
    })();
    assert.equal(claimed.status, 200);
  });

  test('a guild gone takes its banner and minutes along', async () => {
    const stone = await guild('iza', 'Kamienny Krąg', 'KK');
    await minutes('backwaters', stone, 'iza', 30);
    clock = next.startsAt + 60000;
    assert.deepEqual(Object.keys((await as('ewa', 'GET', '/api/character')).data.landBanners), ['backwaters']);
    assert.equal((await as('iza', 'POST', '/api/guild/leave')).status, 200);
    assert.deepEqual((await as('ewa', 'GET', '/api/character')).data.landBanners, {});
    assert.equal((await first('SELECT COUNT(*) AS n FROM guild_land_minutes')).n, 0);
    assert.equal((await first('SELECT COUNT(*) AS n FROM guild_land_fame')).n, 0);
  });

  test('outside a guild the card has only its words', async () => {
    const seen = (await as('ewa', 'GET', '/api/guild/lands')).data;
    assert.equal(seen.guild, null);
    assert.equal(seen.texts.title, 'Krainy pod sztandarem');
    assert.equal(seen.lands, undefined);
  });
});

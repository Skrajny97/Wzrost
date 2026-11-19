// Pomoc przy budowach i przy pracy (1196 A and B, accepted on the review
// page on 19.11.2026; src/engine/guild-help.js, src/server/guild-help.js):
// the build under way in a member's Obóz or Warownia and a member's work in
// a profession show on the Gildia tab; the other members, of other
// accounts, help each once: 1% of its time a help, at least a minute, never
// past the moment of the help, at most 10 helps; each help gives the helper
// 1 Sława of the guild, the first 20 of the week; the owner sees who
// helped; the build's and the work's ends, the queue, the claim and the
// phone's notice go on as for any other.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { cutText, helpCut, helpOpen, helpProfession, helpTarget, helpableWork, notificationsDue, questPeriod } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rules = content.guilds.help;
const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('the help in the engine', () => {
  test('1% of the whole time, at least a minute, never past the moment of the help', () => {
    assert.deepEqual([rules.share, rules.minMinutes, rules.maxHelps], [0.01, 1, 10]);
    // A build of a day: 14.4 minutes.
    assert.equal(helpCut(0, DAY, HOUR, content), 864000);
    // The same however much of it is left.
    assert.equal(helpCut(-20 * HOUR, 4 * HOUR, 0, content), 864000);
    // A work of an hour: 36 s, so a minute.
    assert.equal(helpCut(0, HOUR, 0, content), MINUTE);
    // Half a minute left: half a minute, so it ends at once.
    assert.equal(helpCut(0, HOUR, HOUR - 30000, content), 30000);
    assert.equal(helpCut(0, HOUR, HOUR, content), 0);
    assert.equal(helpCut(0, HOUR, HOUR + 5, content), 0);
  });

  test('ten helps a build or a work, each helper once; what is helped, by its key', () => {
    assert.equal(helpOpen(0, false, content), true);
    assert.equal(helpOpen(9, false, content), true);
    assert.equal(helpOpen(10, false, content), false);
    assert.equal(helpOpen(3, true, content), false);
    assert.equal(helpTarget({ buildingId: 'anvil', level: 7 }), 'build:anvil:7');
    assert.equal(helpTarget({ work: 'abc' }), 'work:abc');
    assert.equal(helpableWork('herbs'), true);
    assert.equal(helpableWork('dishes'), true);
    assert.equal(helpableWork('hunt'), false);
    assert.equal(helpableWork('mercenary'), false);
    assert.equal(helpProfession('herbs', content).name, 'Zielarstwo');
    assert.equal(helpProfession('jewels', content).name, 'Jubilerstwo');
    assert.equal(helpProfession('hunt', content), null);
    assert.deepEqual([cutText(MINUTE), cutText(864000), cutText(65 * MINUTE), cutText(2 * HOUR), cutText(10)], ['1 min', '14 min', '1 h 5 min', '2 h', '1 min']);
  });

  test('a build the help ends now still tells the phone of its end', () => {
    const now = Date.UTC(2026, 10, 18, 11);
    const endsAt = now + helpCut(now - HOUR, now + 30000, now, content) - 30000;
    assert.equal(endsAt, now);
    const player = { level: 30, activity: null, buildings: { anvil: { level: 7, endsAt } }, queue: [] };
    assert.deepEqual(notificationsDue(player, now - MINUTE, now, content).map((one) => one.tag), ['build']);
  });
});

describe('the help through the API', () => {
  const { call, db, signUp } = useServer({ TEST_CLOCK: 'on', PROFESSIONS: 'on' });
  const cookies = {};
  // Wednesday of the week of 16 November 2026, at noon in Poland.
  const WEDNESDAY = Date.UTC(2026, 10, 18, 11);
  let clock = WEDNESDAY;
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body, now: clock });
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  const idOf = async (name) => (await first('SELECT id FROM characters WHERE name = ?', name)).id;
  const view = async (login) => (await as(login, 'GET', '/api/guild/help')).data;
  const help = (login, ownerId, target) => as(login, 'POST', '/api/guild/help', { ownerId, target });
  const todo = async (login) => (await as(login, 'GET', '/api/guild/todo')).data.todo;
  const weekKey = (at) => questPeriod('weekly', at, content).key;

  async function player(login, name) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' }, now: clock });
    await run('UPDATE characters SET level = 30, class_level = 25, gold = 5000 WHERE name = ?', name);
  }

  async function join(login, name) {
    const id = (await as('mistrz', 'GET', '/api/guild')).data.guild.id;
    await as('mistrz', 'POST', '/api/guild/invite', { name });
    assert.equal((await as(login, 'POST', '/api/guild/accept', { guildId: id })).status, 200);
  }

  // A build under way in `name`'s camp: `level` of `buildingId`, begun
  // `since` ago, `length` long; the queue after it.
  async function building(name, buildingId, level, since, length, queue = []) {
    const id = await idOf(name);
    await run(
      'INSERT INTO buildings (character_id, building_id, level, started_at, ends_at, collected_at, cost) VALUES (?, ?, ?, ?, ?, NULL, ?)',
      id,
      buildingId,
      level,
      clock - since,
      clock - since + length,
      JSON.stringify({ gold: 100 }),
    );
    await run('UPDATE characters SET build_queue = ? WHERE id = ?', JSON.stringify(queue), id);
    return id;
  }

  beforeEach(async () => {
    clock = WEDNESDAY;
    await player('mistrz', 'Mistrz');
    await player('druh', 'Druh');
    await player('ziomek', 'Ziomek');
    await player('obcy', 'Obcy');
    assert.equal((await as('mistrz', 'POST', '/api/guild/found', { name: 'Pomocna Dłoń', tag: 'PD' })).status, 200);
    await join('druh', 'Druh');
    await join('ziomek', 'Ziomek');
    await run('UPDATE sessions SET expires_at = ?', WEDNESDAY + 60 * DAY);
  });

  test('a build under way shows for the others; a help cuts 1% of it, moves the queue too, and its owner sees who helped', async () => {
    const ends = clock - HOUR + DAY;
    const druh = await building('Druh', 'anvil', 7, HOUR, DAY, [{ buildingId: 'sawmill', level: 3, startsAt: ends, endsAt: ends + HOUR, cost: { gold: 10 } }]);
    assert.equal((await todo('ziomek')).guild, true);
    const seen = await view('ziomek');
    const entry = seen.others.find((one) => one.owner.id === druh);
    assert.deepEqual(
      [entry.kind, entry.title, entry.target, entry.helps, entry.max, entry.next, entry.open, entry.helped, entry.endsAt],
      ['build', 'Kowadło, 7. poziom', 'build:anvil:7', 0, 10, 864000, true, false, ends],
    );
    assert.equal(seen.open, 1);
    assert.deepEqual(seen.weekHelps, { count: 0, cap: 20 });
    assert.equal(seen.mine.length, 0);
    const version = (await first('SELECT version FROM characters WHERE id = ?', druh)).version;

    const given = await help('ziomek', druh, entry.target);
    assert.equal(given.status, 200, JSON.stringify(given.data));
    assert.equal(given.data.text, 'Pomogłeś postaci Druh: Kowadło, 7. poziom skończy się 14 min wcześniej. Zgarniasz 1 punkt Sławy.');
    const moved = await first("SELECT started_at, ends_at FROM buildings WHERE character_id = ? AND building_id = 'anvil'", druh);
    assert.deepEqual([moved.started_at, moved.ends_at], [clock - HOUR - 864000, ends - 864000]);
    const after = await first('SELECT build_queue, version FROM characters WHERE id = ?', druh);
    assert.deepEqual(JSON.parse(after.build_queue).map((one) => [one.startsAt, one.endsAt]), [[ends - 864000, ends + HOUR - 864000]]);
    assert.equal(after.version, version + 1);
    const helped = given.data.others.find((one) => one.owner.id === druh);
    assert.deepEqual([helped.helps, helped.helped, helped.open], [1, true, false]);
    assert.equal(given.data.weekHelps.count, 1);
    assert.equal((await todo('ziomek')).guild, false);

    // A double tap helps once.
    const again = await help('ziomek', druh, entry.target);
    assert.deepEqual([again.status, again.data.error.code], [409, 'helped']);
    assert.equal((await first('SELECT COUNT(*) AS n FROM guild_helps')).n, 1);

    // Another member helps too; the owner sees both and what they cut.
    assert.equal((await help('mistrz', druh, entry.target)).status, 200);
    const own = await view('druh');
    assert.deepEqual(own.mine.map((one) => [one.title, one.helps, one.cut, one.helpers]), [['Kowadło, 7. poziom', 2, 2 * 864000, ['Ziomek', 'Mistrz']]]);
    assert.equal(own.others.some((one) => one.owner.id === druh), false);
  });

  test('refused: its own, one of its account, outside the guild, gone, of one not in the guild', async () => {
    const druh = await building('Druh', 'anvil', 7, HOUR, DAY);
    // A second character of Druh's account, played now, in the guild too.
    cookies.alt = cookies.druh;
    assert.equal((await call('POST', '/api/character', { cookie: cookies.alt, body: { name: 'Drugi', classId: 'mage', appearance: 'male' }, now: clock })).status, 201);
    const alt = await idOf('Drugi');
    await run("INSERT INTO guild_members (character_id, guild_id, role, joined_at) SELECT ?, guild_id, 'member', ? FROM guild_members WHERE character_id = ?", alt, clock, druh);
    await run('UPDATE characters SET level = 30 WHERE id = ?', alt);
    const altView = await view('alt');
    assert.equal(altView.others.some((one) => one.owner.id === druh), false);
    assert.equal((await todo('alt')).guild, false);
    const same = await help('alt', druh, 'build:anvil:7');
    assert.deepEqual([same.status, same.data.error.code, same.data.error.message], [409, 'same_account', rules.texts.errors.sameAccount]);
    assert.equal((await help('alt', alt, 'build:anvil:7')).data.error.code, 'own');
    assert.equal((await help('obcy', druh, 'build:anvil:7')).data.error.code, 'no_guild');
    assert.equal((await help('ziomek', druh, 'build:anvil:6')).data.error.code, 'gone');
    assert.equal((await help('ziomek', await idOf('Obcy'), 'build:anvil:7')).data.error.code, 'not_member');
    assert.equal((await help('ziomek', 'Druh', 'build:anvil:7')).status, 400);
    // Over: nothing to help.
    clock += DAY;
    assert.equal((await help('ziomek', druh, 'build:anvil:7')).data.error.code, 'gone');
    assert.equal((await first('SELECT COUNT(*) AS n FROM guild_helps')).n, 0);
  });

  test('ten helps at most', async () => {
    const druh = await building('Druh', 'anvil', 7, HOUR, DAY);
    const guildId = (await first("SELECT id FROM guilds WHERE tag = 'PD'")).id;
    for (let helper = 1; helper <= 9; helper += 1) {
      await run('INSERT INTO guild_helps (guild_id, week, helper_id, owner_id, target, cut, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', guildId, weekKey(clock), 9000 + helper, druh, 'build:anvil:7', 864000, clock - 60);
    }
    assert.equal((await help('ziomek', druh, 'build:anvil:7')).status, 200);
    const full = await help('mistrz', druh, 'build:anvil:7');
    assert.deepEqual([full.status, full.data.error.code], [409, 'full']);
    const seen = (await view('mistrz')).others.find((one) => one.owner.id === druh);
    assert.deepEqual([seen.helps, seen.open, seen.helped], [10, false, false]);
    // Helps of a build of that level before this one began do not count.
    await run('UPDATE guild_helps SET created_at = ? WHERE helper_id > 9000', clock - 2 * HOUR);
    assert.equal((await help('mistrz', druh, 'build:anvil:7')).status, 200);
  });

  test("a work in a profession: a help moves it back; one at its end ends it now, and its report comes", async () => {
    await run("UPDATE characters SET level = 30 WHERE name = 'Druh'");
    assert.equal((await as('druh', 'POST', '/api/professions/gather', { herbs: ['comfrey'], minutes: 60 })).status, 201);
    const druh = await idOf('Druh');
    const work = (await view('ziomek')).others.find((one) => one.owner.id === druh);
    assert.deepEqual([work.kind, work.title, work.profession, work.next], ['work', 'Zielarstwo', 'herbalism', MINUTE]);
    assert.match(work.target, /^work:[0-9a-f]{20}$/);
    const before = await first('SELECT started_at, ends_at, seed FROM activities WHERE character_id = ?', druh);
    assert.ok(!work.target.includes(before.seed));
    assert.equal((await help('ziomek', druh, work.target)).status, 200);
    const moved = await first('SELECT started_at, ends_at FROM activities WHERE character_id = ?', druh);
    assert.deepEqual([moved.started_at, moved.ends_at], [before.started_at - MINUTE, before.ends_at - MINUTE]);
    // Half a minute before its end: the help ends it now, not before.
    clock = moved.ends_at - 30000;
    const last = await help('mistrz', druh, work.target);
    assert.equal(last.status, 200);
    assert.match(last.data.text, /Zielarstwo skończy się 1 min wcześniej/);
    assert.equal((await first('SELECT ends_at FROM activities WHERE character_id = ?', druh)).ends_at, clock);
    const claimed = await as('druh', 'POST', '/api/hunts/claim');
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
    assert.equal(claimed.data.report.kind, 'herbs');
    assert.equal(claimed.data.report.minutes, 60);
  });

  test("a build of the queue whose time came while its owner was away: a help moves it, and it starts as moved", async () => {
    const druh = await idOf('Druh');
    await run('INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) VALUES (?, ?, 6, ?, ?)', druh, 'anvil', clock - 5 * HOUR, clock - 2 * HOUR);
    const queue = [{ buildingId: 'anvil', level: 7, startsAt: clock - 2 * HOUR, endsAt: clock + 22 * HOUR, cost: { gold: 50 } }];
    await run('UPDATE characters SET build_queue = ? WHERE id = ?', JSON.stringify(queue), druh);
    const entry = (await view('ziomek')).others.find((one) => one.owner.id === druh);
    assert.deepEqual([entry.title, entry.next, entry.endsAt], ['Kowadło, 7. poziom', 864000, clock + 22 * HOUR]);
    assert.equal((await help('ziomek', druh, entry.target)).status, 200);
    const kept = JSON.parse((await first('SELECT build_queue FROM characters WHERE id = ?', druh)).build_queue);
    assert.deepEqual([kept[0].startsAt, kept[0].endsAt], [clock - 2 * HOUR - 864000, clock + 22 * HOUR - 864000]);
    // The owner's next request starts it from the queue, as moved.
    assert.equal((await as('druh', 'GET', '/api/character')).status, 200);
    const started = await first("SELECT level, started_at, ends_at FROM buildings WHERE character_id = ? AND building_id = 'anvil'", druh);
    assert.deepEqual([started.level, started.started_at, started.ends_at], [7, clock - 2 * HOUR - 864000, clock + 22 * HOUR - 864000]);
    // Its helps stay with it.
    assert.equal((await view('druh')).mine[0].helps, 1);
  });

  test('"Pomóż wszystkim" helps with every one at once; a second tap does nothing', async () => {
    const druh = await building('Druh', 'anvil', 7, HOUR, DAY);
    await run("UPDATE characters SET level = 30 WHERE name = 'Ziomek'");
    assert.equal((await as('ziomek', 'POST', '/api/professions/gather', { herbs: ['comfrey'], minutes: 60 })).status, 201);
    assert.equal((await view('mistrz')).open, 2);
    const all = await as('mistrz', 'POST', '/api/guild/help/all');
    assert.equal(all.status, 200, JSON.stringify(all.data));
    assert.equal(all.data.helped, 2);
    assert.equal(all.data.text, 'Pomogłeś 2 razy. Zgarniasz 2 punkty Sławy.');
    assert.equal(all.data.open, 0);
    assert.equal((await first('SELECT COUNT(*) AS n FROM guild_helps WHERE helper_id = ?', await idOf('Mistrz'))).n, 2);
    const twice = await as('mistrz', 'POST', '/api/guild/help/all');
    assert.deepEqual([twice.status, twice.data.helped, twice.data.text], [200, 0, rules.texts.allHelped]);
    assert.equal((await first('SELECT COUNT(*) AS n FROM guild_helps')).n, 2);
    assert.ok(druh);
  });

  test('1 Sława a help, the first 20 of the week, for the guild and the helper; a new week counts anew', async () => {
    const druh = await building('Druh', 'anvil', 7, HOUR, 30 * DAY);
    const ziomek = await idOf('Ziomek');
    const guildId = (await first("SELECT id FROM guilds WHERE tag = 'PD'")).id;
    for (let index = 0; index < 20; index += 1) {
      await run('INSERT INTO guild_helps (guild_id, week, helper_id, owner_id, target, cut, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', guildId, weekKey(clock), ziomek, 8000 + index, 'build:anvil:2', MINUTE, clock);
    }
    const over = await help('ziomek', druh, 'build:anvil:7');
    assert.equal(over.status, 200);
    assert.match(over.data.text, /Sławę za pomoc w tym tygodniu masz już całą\.$/);
    assert.deepEqual(over.data.weekHelps, { count: 21, cap: 20 });
    // The guild's Sława and the member's: 20.
    const ranking = await as('ziomek', 'GET', '/api/guild/ranking');
    const own = ranking.data.activity.week.find((row) => row.name === 'Ziomek');
    assert.deepEqual(own.parts.map((part) => [part.id, part.name, part.points]), [['help', 'Pomoc', 20]]);
    assert.ok(ranking.data.texts.how.some((line) => line.startsWith('Pomoc przy budowach i pracy: 1 punkt za każdą pomoc')));
    const guilds = await as('ziomek', 'GET', '/api/ranking/guilds');
    assert.equal(guilds.data.rows.find((row) => row.tag === 'PD').fame, 20);

    // The next week: the week gone is written with its Sława, and a help
    // counts again.
    clock += 7 * DAY;
    const next = await help('mistrz', druh, 'build:anvil:7');
    assert.equal(next.status, 200);
    assert.match(next.data.text, /Zgarniasz 1 punkt Sławy\.$/);
    const later = await as('ziomek', 'GET', '/api/guild/ranking');
    assert.deepEqual(later.data.activity.all.find((row) => row.name === 'Ziomek').parts.map((part) => [part.id, part.points]), [['help', 20]]);
    assert.equal((await first('SELECT help FROM guild_member_fame WHERE character_id = ? AND week = ?', ziomek, weekKey(WEDNESDAY))).help, 20);
    // The helps of the weeks before the last one go as a new help is saved.
    clock += 7 * DAY;
    await join('obcy', 'Obcy');
    assert.equal((await help('obcy', druh, 'build:anvil:7')).status, 200);
    assert.equal((await first('SELECT COUNT(*) AS n FROM guild_helps WHERE week = ?', weekKey(WEDNESDAY))).n, 0);
    assert.equal((await first('SELECT COUNT(*) AS n FROM guild_helps')).n, 2);
  });

  test('a guild that goes takes its helps along', async () => {
    const druh = await building('Druh', 'anvil', 7, HOUR, DAY);
    assert.equal((await help('ziomek', druh, 'build:anvil:7')).status, 200);
    for (const login of ['druh', 'ziomek', 'mistrz']) assert.equal((await as(login, 'POST', '/api/guild/leave')).status, 200);
    assert.equal((await first('SELECT COUNT(*) AS n FROM guild_helps')).n, 0);
  });
});

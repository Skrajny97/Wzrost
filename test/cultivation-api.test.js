// Kultywacja on the server (DECISIONS.md, „Kultywacja (1230 A)”): from
// character level 20, while the class is ahead, the character meditates for
// a length an exploration offers it (POST /api/cultivation), busy as at a
// profession's work meanwhile: no exploration, profession or Drużyna's
// trip. The claim ("Odbierz raport", /api/hunts/claim) gives the XP kept at
// the start, at most up to the class's level at the claim, with a report in
// the Dziennik; Punkty Czasu rewind it, "Przerwij" ends it with nothing.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { cultivationRate, cultivationXp, gainXp, huntDurations, newestArea, notificationsDue, xpToLevel, xpToNext } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const LEVEL = 104;
const CLASS_LEVEL = 124;
const MINUTE = 60000;
const toNext = (level) => xpToNext(level, content);
const maxLevel = content.balance.progression.maxLevel;

describe('Kultywacja', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on' });
  const cookies = {};
  const sql = async (query, ...binds) => (await db()).prepare(query).bind(...binds);
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const row = async (name) => (await sql('SELECT * FROM characters WHERE name = ?', name)).first();
  const activity = async (name) => (await sql('SELECT a.* FROM activities a JOIN characters c ON c.id = a.character_id WHERE c.name = ?', name)).first();
  // A character of `level`, its class at `classLevel`, with a report
  // before (so its explorations are not the first one) and Punkty Czasu.
  const player = async (login, name, { level = LEVEL, classLevel = CLASS_LEVEL } = {}) => {
    ({ cookie: cookies[login] } = await signUp(login));
    await as(login, 'POST', '/api/character', { name, classId: 'warrior', appearance: 'female' });
    await (
      await sql(`UPDATE characters SET level = ?, xp = 0, class_level = ?, points = '{"strength":300,"vitality":300}', time_points = 5000 WHERE name = ?`, level, classLevel, name)
    ).run();
    await (await sql("INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) SELECT id, 'earlier-' || id, 'hunt', 0, '{}', '{}' FROM characters WHERE name = ?", name)).run();
  };
  // The Kultywacja of `name` over: moved into the past by its length.
  const end = async (name) => {
    const { minutes } = await activity(name);
    await (
      await sql('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ? WHERE character_id = (SELECT id FROM characters WHERE name = ?)', minutes * MINUTE, minutes * MINUTE, name)
    ).run();
  };
  const meditate = (login, minutes = 60) => as(login, 'POST', '/api/cultivation', { minutes });

  beforeEach(async () => {
    await player('mnich', 'Mnich');
  });

  test('the card plans each length an exploration offers, up to the class level', async () => {
    const { data } = await as('mnich', 'GET', '/api/character');
    const plan = data.character.cultivation;
    assert.equal(plan.open, true);
    assert.equal(plan.factor, 4);
    assert.equal(plan.area.id, newestArea(CLASS_LEVEL, content).id);
    assert.equal(plan.cap, xpToLevel(LEVEL, 0, CLASS_LEVEL, content));
    assert.deepEqual(
      plan.lengths.map((length) => length.minutes),
      huntDurations(LEVEL, content),
    );
    const hour = plan.lengths.find((length) => length.minutes === 60);
    assert.equal(hour.xp, cultivationXp(cultivationRate(CLASS_LEVEL, content), 60));
    assert.ok(data.character.features.includes('cultivation'));
  });

  test('a Kultywacja begins for a length an exploration offers, keeping its XP and levels; the character rests', async () => {
    const before = await row('Mnich');
    const answer = await meditate('mnich', 60);
    assert.equal(answer.status, 201, JSON.stringify(answer.data));
    const started = await activity('Mnich');
    assert.equal(started.kind, 'cultivation');
    assert.equal(started.minutes, 60);
    assert.equal(started.ends_at - started.started_at, 60 * MINUTE);
    assert.equal(started.region_id, newestArea(CLASS_LEVEL, content).id);
    const options = JSON.parse(started.options);
    assert.equal(options.xp, cultivationXp(cultivationRate(CLASS_LEVEL, content), 60));
    assert.deepEqual(options.levels, { level: LEVEL, classLevel: CLASS_LEVEL });
    const { character } = answer.data;
    assert.equal(character.activity.kind, 'cultivation');
    assert.equal(character.activity.placeName, 'Kultywacja');
    assert.deepEqual(character.cultivation, { running: { xp: options.xp, level: gainXp(LEVEL, 0, options.xp, toNext, maxLevel).level, capped: false } });
    // Resting goes on, as at a profession's work.
    assert.ok(character.regen);
    assert.equal((await row('Mnich')).version, before.version + 1);
  });

  test('refused for a length not offered, before level 20 and once the character has caught its class up', async () => {
    let answer = await meditate('mnich', 7);
    assert.equal(answer.status, 400);
    assert.equal(answer.data.error.code, 'invalid_duration');
    await player('nowy', 'Nowy', { level: 15, classLevel: 19 });
    answer = await meditate('nowy', 30);
    assert.equal(answer.status, 403);
    assert.equal(answer.data.error.message, 'Kultywację odblokujesz na poziomie postaci 20.');
    assert.equal((await as('nowy', 'GET', '/api/character')).data.character.cultivation, null);
    await player('rowny', 'Rowny', { level: 120, classLevel: 120 });
    const { data } = await as('rowny', 'GET', '/api/character');
    assert.equal(data.character.cultivation.open, false);
    assert.equal(data.character.cultivation.cap, 0);
    answer = await meditate('rowny', 60);
    assert.equal(answer.status, 409);
    assert.equal(answer.data.error.code, 'caught_up');
    assert.equal(await activity('Rowny'), null);
  });

  test('busy meanwhile, as at a profession: no exploration, profession, mercenary offer or second Kultywacja', async () => {
    await meditate('mnich', 60);
    for (const [path, body] of [
      ['/api/hunts', { areaId: 'windfalls-edge', minutes: 30 }],
      ['/api/professions/gather', { herbs: ['comfrey'], minutes: 60 }],
      ['/api/cultivation', { minutes: 60 }],
    ]) {
      const answer = await as('mnich', 'POST', path, body);
      assert.equal(answer.status, 409, path);
      assert.equal(answer.data.error.message, 'Postać medytuje. Poczekaj na koniec Kultywacji.', path);
    }
    // Before its end the claim waits.
    const early = await as('mnich', 'POST', '/api/hunts/claim');
    assert.equal(early.status, 409);
    assert.equal(early.data.error.message, 'Kultywacja jeszcze trwa.');
    // Ended, its report waits first.
    await end('Mnich');
    const waiting = await as('mnich', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 30 });
    assert.equal(waiting.status, 409);
    assert.equal(waiting.data.error.message, 'Kultywacja się skończyła. Najpierw odbierz jej raport.');
  });

  test('the claim gives the XP with its levels and Time Points, a report in the Dziennik, once', async () => {
    await meditate('mnich', 240);
    const { xp } = JSON.parse((await activity('Mnich')).options);
    await end('Mnich');
    const before = await row('Mnich');
    const claimed = await as('mnich', 'POST', '/api/hunts/claim');
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
    const { report, character } = claimed.data;
    const expected = gainXp(LEVEL, 0, xp, toNext, maxLevel);
    assert.equal(report.kind, 'cultivation');
    assert.equal(report.xp, xp);
    assert.equal(report.capped, false);
    assert.equal(report.minutes, 240);
    assert.equal(report.classLevel, CLASS_LEVEL);
    assert.deepEqual(report.summary, { xp, levelBefore: LEVEL, levelAfter: expected.level, timePoints: 2 * (expected.level - LEVEL) });
    assert.ok(expected.level > LEVEL);
    assert.ok(report.system.length > 0);
    const after = await row('Mnich');
    assert.equal(after.level, expected.level);
    assert.equal(after.xp, expected.xp);
    // The class gains nothing, nor gold.
    assert.equal(after.class_level, CLASS_LEVEL);
    assert.equal(after.class_xp, before.class_xp);
    assert.equal(after.gold, before.gold);
    assert.equal(after.time_points, before.time_points + 2 * (expected.level - LEVEL));
    // A new level heals fully.
    assert.equal(character.hp, character.maxHp);
    assert.equal(await activity('Mnich'), null);
    // In the Dziennik, with its XP and levels.
    const listed = (await as('mnich', 'GET', '/api/reports')).data.reports.find((one) => one.kind === 'cultivation');
    assert.equal(listed.id, report.id);
    assert.equal(listed.xp, xp);
    assert.equal(listed.placeName, 'Kultywacja');
    assert.deepEqual([listed.levelBefore, listed.levelAfter], [LEVEL, expected.level]);
    assert.equal((await as('mnich', 'GET', `/api/reports/${report.id}`)).data.report.kind, 'cultivation');
    // Claimed once.
    const again = await as('mnich', 'POST', '/api/hunts/claim');
    assert.equal(again.status, 409);
    assert.equal((await row('Mnich')).level, expected.level);
  });

  test('the claim stops at the class level as it is then: never past the class', async () => {
    await meditate('mnich', 240);
    // XP from elsewhere meanwhile brought the character a level short of
    // its class.
    await (await sql('UPDATE characters SET level = ?, xp = 0, version = version + 1 WHERE name = ?', CLASS_LEVEL - 1, 'Mnich')).run();
    await end('Mnich');
    const claimed = await as('mnich', 'POST', '/api/hunts/claim');
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
    const cap = xpToLevel(CLASS_LEVEL - 1, 0, CLASS_LEVEL, content);
    assert.equal(claimed.data.report.xp, cap);
    assert.equal(claimed.data.report.capped, true);
    const after = await row('Mnich');
    assert.equal(after.level, CLASS_LEVEL);
    assert.equal(after.xp, 0);
    // Caught up: the card says so.
    assert.equal(claimed.data.character.cultivation.open, false);
  });

  test('Punkty Czasu rewind it as an exploration; "Przerwij" ends it with nothing gained', async () => {
    await meditate('mnich', 30);
    const before = await row('Mnich');
    const skipped = await as('mnich', 'POST', '/api/time/skip', { target: 'activity' });
    assert.equal(skipped.status, 200, JSON.stringify(skipped.data));
    assert.equal(skipped.data.spent, 30);
    assert.equal((await row('Mnich')).time_points, before.time_points - 30);
    const claimed = await as('mnich', 'POST', '/api/hunts/claim');
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
    assert.equal(claimed.data.report.kind, 'cultivation');

    const level = (await row('Mnich')).level;
    await meditate('mnich', 60);
    const cancelled = await as('mnich', 'POST', '/api/hunts/cancel');
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data));
    assert.equal(await activity('Mnich'), null);
    const after = await row('Mnich');
    assert.equal(after.level, level);
    assert.equal(cancelled.data.character.cultivation.open, true);
  });

  test("a member meditating stays home from the Drużyna's trip; one whose Kultywacja ended goes, its report claimed", async () => {
    await player('lider', 'Lider', { level: 30, classLevel: 30 });
    await (await sql('UPDATE characters SET level = 28, class_level = 30 WHERE name = ?', 'Mnich')).run();
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Mnich' });
    await as('mnich', 'POST', '/api/party/accept', { partyId: data.party.id });
    assert.equal((await meditate('mnich', 30)).status, 201);
    const view = await as('lider', 'GET', '/api/party');
    assert.equal(view.data.party.members.find((member) => member.name === 'Mnich').status, 'meditating');
    // Nobody else to take: nobody goes.
    const alone = await as('lider', 'POST', '/api/party/hunt', { areaId: 'windfalls-edge', minutes: 30 });
    assert.equal(alone.status, 409);
    assert.equal(alone.data.error.code, 'nobody_free');
    assert.equal((await activity('Mnich')).kind, 'cultivation');
    // Over: the party's setting out claims it, and the member goes.
    const gained = Math.min(JSON.parse((await activity('Mnich')).options).xp, xpToLevel(28, 0, 30, content));
    const expected = gainXp(28, 0, gained, toNext, maxLevel);
    await end('Mnich');
    const went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'windfalls-edge', minutes: 30 });
    assert.equal(went.status, 201, JSON.stringify(went.data).slice(0, 400));
    assert.deepEqual(went.data.went, ['Mnich']);
    assert.equal((await activity('Mnich')).kind, 'hunt');
    const kept = await (await sql("SELECT r.data FROM reports r JOIN characters c ON c.id = r.character_id WHERE c.name = 'Mnich' AND r.kind = 'cultivation'")).first();
    assert.deepEqual(JSON.parse(kept.data).summary, { xp: gained, levelBefore: 28, levelAfter: expected.level, timePoints: 2 * (expected.level - 28) });
    assert.ok(expected.level > 28);
    assert.equal((await row('Mnich')).level, expected.level);
  });

  test('its end is told on the phone, leading to the Walka', () => {
    const due = notificationsDue({ level: LEVEL, activity: { kind: 'cultivation', areaId: 'x', endsAt: 1500 }, buildings: {}, queue: [] }, 1000, 2000, content);
    assert.deepEqual(due, [{ tag: 'cultivation', url: '#/walka', at: 1500, title: 'Koniec Kultywacji', body: 'Kultywacja zakończona. Raport czeka na odbiór.' }]);
  });
});

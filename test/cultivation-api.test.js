// Kultywacja on the server (DECISIONS.md, „Kultywacja (1230 A)”): from
// character level 20 the character meditates for 10 minutes to 8 hours,
// the lengths of a profession's work (POST /api/cultivation), busy as at
// such work meanwhile: no exploration, profession or Drużyna's trip. The claim
// ("Odbierz raport", /api/hunts/claim) gives the character XP kept at the
// start while the class is ahead, at most up to the class's level at the
// claim, and the Kultywacja's own XP of its minutes, with a report in the
// Dziennik; Punkty Czasu rewind it, "Przerwij" ends it with nothing. The
// Kultywacja's level gives a share more character XP from explorations.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { cultivationMinutes, cultivationRate, cultivationXp, gainXp, huntDurations, newestArea, notificationsDue, xpToLevel, xpToNext } from '../src/engine/index.js';
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

  test("the card plans each length, 10 minutes to 8 hours as a profession's work, up to the class level, with the Kultywacja at level 0", async () => {
    const { data } = await as('mnich', 'GET', '/api/character');
    const { plan, ...own } = data.character.cultivation;
    assert.deepEqual(own, { level: 0, xp: 0, xpToNext: 240, maxLevel: 100, bonus: 0, perLevel: 0.01, firstMinutes: 240, lastMinutes: 1200 });
    assert.equal(plan.open, true);
    assert.equal(plan.possible, true);
    assert.equal(plan.factor, 4);
    assert.equal(plan.area.id, newestArea(CLASS_LEVEL, content).id);
    assert.equal(plan.cap, xpToLevel(LEVEL, 0, CLASS_LEVEL, content));
    assert.deepEqual(
      plan.lengths.map((length) => length.minutes),
      cultivationMinutes(content),
    );
    const hour = plan.lengths.find((length) => length.minutes === 60);
    assert.equal(hour.xp, cultivationXp(cultivationRate(CLASS_LEVEL, content), 60));
    assert.equal(hour.cultivationXp, 60);
    assert.equal(hour.cultivationLevel, 0);
    assert.ok(data.character.features.includes('cultivation'));
  });

  test("XP kept past a level's end (a shorter level of a changed curve) counts on into the next levels", async () => {
    // Level 3 with 800 XP: the 3rd level takes 270 and the 4th 280 now
    // (1248 B), so it is level 5 with 250 into it.
    await (await sql('UPDATE characters SET cultivation_level = 3, cultivation_xp = 800 WHERE name = ?', 'Mnich')).run();
    const { data } = await as('mnich', 'GET', '/api/character');
    const { level, xp, xpToNext: next, bonus } = data.character.cultivation;
    assert.deepEqual({ level, xp, next, bonus }, { level: 5, xp: 250, next: 290, bonus: 0.05 });
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
    assert.deepEqual(character.cultivation.running, { xp: options.xp, level: gainXp(LEVEL, 0, options.xp, toNext, maxLevel).level, capped: false, cultivationXp: 60, cultivationLevel: 0 });
    assert.equal(character.cultivation.plan, undefined);
    // Resting goes on, as at a profession's work.
    assert.ok(character.regen);
    assert.equal((await row('Mnich')).version, before.version + 1);
  });

  test('refused for a length not offered and before level 20; at equal levels only the Kultywacja grows, and with it at the top nothing begins', async () => {
    // Off its slider: an exploration's 1 or 5 minutes, past 8 hours, not on
    // a step of 10, not a number.
    for (const minutes of [7, 1, 5, 15, 490, 0, '60']) {
      const answer = await meditate('mnich', minutes);
      assert.equal(answer.status, 400, String(minutes));
      assert.equal(answer.data.error.code, 'invalid_duration');
    }
    let answer;
    await player('nowy', 'Nowy', { level: 15, classLevel: 19 });
    answer = await meditate('nowy', 30);
    assert.equal(answer.status, 403);
    assert.equal(answer.data.error.message, 'Kultywację odblokujesz na poziomie postaci 20.');
    assert.equal((await as('nowy', 'GET', '/api/character')).data.character.cultivation, null);
    await player('rowny', 'Rowny', { level: 120, classLevel: 120 });
    const { data } = await as('rowny', 'GET', '/api/character');
    assert.equal(data.character.cultivation.plan.open, false);
    assert.equal(data.character.cultivation.plan.possible, true);
    assert.equal(data.character.cultivation.plan.cap, 0);
    answer = await meditate('rowny', 60);
    assert.equal(answer.status, 201, JSON.stringify(answer.data));
    await end('Rowny');
    const before = await row('Rowny');
    const claimed = await as('rowny', 'POST', '/api/hunts/claim');
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
    assert.equal(claimed.data.report.xp, 0);
    assert.deepEqual(claimed.data.report.cultivation, { xp: 60, levelBefore: 0, levelAfter: 0, bonus: 0 });
    const after = await row('Rowny');
    assert.deepEqual([after.level, after.xp, after.cultivation_level, after.cultivation_xp], [before.level, before.xp, 0, 60]);
    // The Kultywacja at its top and the levels equal: nothing to gain.
    await (await sql('UPDATE characters SET cultivation_level = 100, cultivation_xp = 0 WHERE name = ?', 'Rowny')).run();
    assert.equal((await as('rowny', 'GET', '/api/character')).data.character.cultivation.plan.possible, false);
    answer = await meditate('rowny', 60);
    assert.equal(answer.status, 409);
    assert.equal(answer.data.error.code, 'nothing_to_gain');
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

  test('the claim gives the XP with its levels and Time Points, the Kultywacja its first level, a report in the Dziennik, once', async () => {
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
    // 4 hours: the Kultywacja's first level, +1% XP from explorations.
    assert.deepEqual(report.cultivation, { xp: 240, levelBefore: 0, levelAfter: 1, bonus: 0.01 });
    assert.ok(report.system.includes('Kultywacja osiągnęła poziom 1: +1% XP postaci z wypraw.'));
    assert.deepEqual([character.cultivation.level, character.cultivation.xp, character.cultivation.bonus], [1, 0, 0.01]);
    const after = await row('Mnich');
    assert.equal(after.level, expected.level);
    assert.equal(after.xp, expected.xp);
    // The class gains nothing, nor gold.
    assert.equal(after.class_level, CLASS_LEVEL);
    assert.equal(after.class_xp, before.class_xp);
    assert.equal(after.gold, before.gold);
    assert.equal(after.time_points, before.time_points + 2 * (expected.level - LEVEL));
    assert.deepEqual([after.cultivation_level, after.cultivation_xp], [1, 0]);
    // A new level heals fully.
    assert.equal(character.hp, character.maxHp);
    assert.equal(await activity('Mnich'), null);
    // In the Dziennik, with its XP and levels.
    const listed = (await as('mnich', 'GET', '/api/reports')).data.reports.find((one) => one.kind === 'cultivation');
    assert.equal(listed.id, report.id);
    assert.equal(listed.xp, xp);
    assert.equal(listed.placeName, 'Kultywacja');
    assert.deepEqual([listed.levelBefore, listed.levelAfter], [LEVEL, expected.level]);
    assert.deepEqual(listed.cultivation, report.cultivation);
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
    // Caught up: the card says so, and a meditation would still grow the
    // Kultywacja.
    assert.equal(claimed.data.character.cultivation.plan.open, false);
    assert.equal(claimed.data.character.cultivation.plan.possible, true);
  });

  test("the Kultywacja's level gives explorations its share more character XP, the class's XP as it is", async () => {
    await (await sql('UPDATE characters SET cultivation_level = 50 WHERE name = ?', 'Mnich')).run();
    const before = await row('Mnich');
    const started = await as('mnich', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 30 });
    assert.equal(started.status, 201, JSON.stringify(started.data).slice(0, 300));
    await end('Mnich');
    const claimed = await as('mnich', 'POST', '/api/hunts/claim');
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
    const { summary, system } = claimed.data.report;
    assert.ok(summary.classXp > 0);
    assert.equal(summary.xp, Math.round(summary.classXp * 1.5));
    assert.ok(system.includes(`Kultywacja (poziom 50): +50% XP postaci z wyprawy, +${summary.xp - summary.classXp} XP.`));
    const after = await row('Mnich');
    assert.deepEqual([after.level, after.xp], [before.level, before.xp + summary.xp]);
    assert.equal(after.class_xp, before.class_xp + summary.classXp);
    // The bonuses' list on the page shows it, also while the character is away.
    assert.deepEqual([claimed.data.character.cultivation.level, claimed.data.character.cultivation.bonus], [50, 0.5]);
  });

  test('from its unlock on, up to 8 hours, whatever lengths the explorations have; 8 hours rewound cost 480 Punkty Czasu', async () => {
    // Level 20: explorations of up to 30 minutes.
    await player('uczen', 'Uczen', { level: 20, classLevel: 30 });
    assert.ok(Math.max(...huntDurations(20, content)) < 480);
    const { data } = await as('uczen', 'GET', '/api/character');
    assert.deepEqual(
      data.character.cultivation.plan.lengths.map((length) => length.minutes),
      cultivationMinutes(content),
    );
    const answer = await meditate('uczen', 480);
    assert.equal(answer.status, 201, JSON.stringify(answer.data));
    const started = await activity('Uczen');
    assert.equal(started.minutes, 480);
    assert.equal(started.ends_at - started.started_at, 480 * MINUTE);
    assert.equal(JSON.parse(started.options).xp, cultivationXp(cultivationRate(30, content), 480));
    const before = await row('Uczen');
    const skipped = await as('uczen', 'POST', '/api/time/skip', { target: 'activity' });
    assert.equal(skipped.status, 200, JSON.stringify(skipped.data));
    assert.equal(skipped.data.spent, 480);
    assert.equal((await row('Uczen')).time_points, before.time_points - 480);
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
    assert.equal(cancelled.data.character.cultivation.plan.open, true);
    // The Kultywacja's XP: the rewound one's 30 minutes whole, as a
    // profession's work counts them, the one called back's none.
    assert.deepEqual([after.cultivation_level, after.cultivation_xp], [0, 30]);
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
    // Away on the trip: the page keeps the Kultywacja's level (for the
    // bonuses' list), with no plan.
    const away = (await as('mnich', 'GET', '/api/character')).data.character.cultivation;
    assert.equal(away.level, 0);
    assert.equal(away.plan, undefined);
    assert.equal(away.running, undefined);
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

// Kultywacja by an Awatar Systemu (DECISIONS.md, „Kultywacja Awatarem
// (26.11.2026)”; the author: „Do tego trzeba pozwolić robić Kultywację
// Awatarem. Ale tylko jednym na raz i żeby użycie go zajmowało też slot tego
// z Profesji. Żeby były powiązane ale niech tylko jeden na raz może
// robić”): POST /api/cultivation with `avatar` (true, or 2 for the second)
// puts the Kultywacja in the Awatar's slot of the Profesje
// (avatar_activities, avatar2_activities) while the character is free; it
// brings the Kultywacja's XP whole and a quarter of the character XP
// (avatar.share), under the cap at the claim. One meditates at a time,
// the character or an Awatar, and an Awatar meditating takes no work, nor
// one at work a Kultywacja. Its claim, "Przerwij" and Punkty Czasu are its
// work's (/api/avatar/claim, /api/avatar/cancel, target avatar or avatar2),
// and its report names it.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { cultivationKept, cultivationMinutes, cultivationProgress, cultivationRate, cultivationXp, gainXp, notificationsDue, xpToLevel, xpToNext } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const LEVEL = 104;
const CLASS_LEVEL = 124;
const MINUTE = 60000;
const SHARE = content.avatar.share;
const toNext = (level) => xpToNext(level, content);
const maxLevel = content.balance.progression.maxLevel;
const rate = cultivationRate(CLASS_LEVEL, content);
// The character XP an Awatar's Kultywacja of `minutes` keeps: a quarter.
const quarter = (minutes) => Math.round(cultivationXp(rate, minutes) * SHARE);

describe('Kultywacja by an Awatar Systemu', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on' });
  let cookie;
  const sql = async (query, ...binds) => (await db()).prepare(query).bind(...binds);
  const row = async () => (await sql('SELECT * FROM characters')).first();
  const work = async (table) => (await sql(`SELECT * FROM ${table}`)).first();
  const as = (method, path, body) => call(method, path, { cookie, body });
  const character = async () => (await as('GET', '/api/character')).data.character;
  // A Kultywacja of `minutes`: the character's, or with `avatar` an Awatar's.
  const meditate = (minutes, avatar) => as('POST', '/api/cultivation', { minutes, ...(avatar !== undefined && { avatar }) });
  // The work in `table` over: moved into the past by its length.
  const end = async (table) => {
    const { minutes } = await work(table);
    await (await sql(`UPDATE ${table} SET started_at = started_at - ?, ends_at = ends_at - ?`, minutes * MINUTE, minutes * MINUTE)).run();
  };
  const buy = async (second = false) => {
    await (await sql('UPDATE characters SET gold = gold + ?', second ? 200000 : 10000)).run();
    const bought = await as('POST', '/api/avatar/buy', second ? { avatar: 2 } : undefined);
    assert.equal(bought.status, 200, JSON.stringify(bought.data));
  };
  const refused = (answer, code, message) => {
    assert.equal(answer.status, 409, JSON.stringify(answer.data));
    assert.deepEqual([answer.data.error.code, answer.data.error.message], [code, message]);
  };
  const texts = content.avatar.texts;
  const second = content.avatar.second.texts;

  beforeEach(async () => {
    ({ cookie } = await signUp('awatarmnich'));
    await as('POST', '/api/character', { name: 'Awatarmnich', classId: 'warrior', appearance: 'female' });
    await (
      await sql(`UPDATE characters SET level = ?, xp = 0, class_level = ?, points = '{"strength":300,"vitality":300}', time_points = 5000, gold = 0`, LEVEL, CLASS_LEVEL)
    ).run();
    // A report before, so its explorations are not the first one.
    await (await sql("INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) SELECT id, 'earlier-' || id, 'hunt', 0, '{}', '{}' FROM characters")).run();
  });

  test('an Awatar meditates while the character explores: its slot, a quarter of the character XP kept, the Kultywacja whole', async () => {
    await buy();
    assert.equal((await as('POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 30 })).status, 201);
    // Away, the character has no plan; the Awatar free has its own.
    const planned = (await character()).cultivation;
    assert.equal(planned.plan, undefined);
    assert.equal(planned.avatarShare, SHARE);
    const { avatarPlan } = planned;
    assert.equal(avatarPlan.share, SHARE);
    assert.equal(avatarPlan.cap, xpToLevel(LEVEL, 0, CLASS_LEVEL, content));
    assert.deepEqual(
      avatarPlan.lengths.map((length) => length.minutes),
      cultivationMinutes(content),
    );
    for (const length of avatarPlan.lengths) {
      assert.equal(length.xp, Math.min(avatarPlan.cap, quarter(length.minutes)), `${length.minutes} min`);
      assert.equal(length.cultivationXp, length.minutes);
    }

    const answer = await meditate(60, true);
    assert.equal(answer.status, 201, JSON.stringify(answer.data));
    const started = await work('avatar_activities');
    assert.equal(started.kind, 'cultivation');
    assert.equal(started.minutes, 60);
    assert.equal(started.ends_at - started.started_at, 60 * MINUTE);
    const options = JSON.parse(started.options);
    assert.equal(options.xp, quarter(60));
    assert.equal(options.xp, cultivationKept(rate, 60, SHARE));
    assert.deepEqual(options.levels, { level: LEVEL, classLevel: CLASS_LEVEL });
    const { activity, professions, cultivation } = answer.data.character;
    // The character goes on exploring.
    assert.equal(activity.kind, 'hunt');
    assert.equal(professions.avatar.activity.kind, 'cultivation');
    assert.equal(professions.avatar.activity.placeName, 'Kultywacja');
    assert.deepEqual(cultivation.running, {
      xp: quarter(60),
      level: gainXp(LEVEL, 0, quarter(60), toNext, maxLevel).level,
      capped: false,
      cultivationXp: 60,
      cultivationLevel: 0,
      avatar: true,
    });
    assert.equal(cultivation.plan, undefined);
    assert.equal(cultivation.avatarPlan, undefined);
  });

  test("the claim gives the Kultywacja's XP whole and a quarter of the character XP, in a report naming the Awatar", async () => {
    await buy();
    assert.equal((await meditate(240, true)).status, 201);
    assert.equal((await as('POST', '/api/avatar/claim')).data.error.message, 'Kultywacja jeszcze trwa.');
    await end('avatar_activities');
    const before = await row();
    const claimed = await as('POST', '/api/avatar/claim');
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
    const { report, character: after } = claimed.data;
    const xp = quarter(240);
    const expected = gainXp(LEVEL, 0, xp, toNext, maxLevel);
    assert.equal(report.kind, 'cultivation');
    assert.equal(report.avatar, true);
    assert.equal(report.xp, xp);
    assert.equal(report.full, xp);
    assert.equal(report.capped, false);
    assert.equal(report.minutes, 240);
    assert.deepEqual(report.summary, { xp, levelBefore: LEVEL, levelAfter: expected.level, timePoints: 2 * (expected.level - LEVEL) });
    // Four hours: the Kultywacja's first level, as the character's own.
    assert.deepEqual(report.cultivation, { xp: 240, levelBefore: 0, levelAfter: 1, bonus: 0.01 });
    assert.ok(report.system.includes('Kultywacja osiągnęła poziom 1: +1% XP postaci z wypraw.'));
    const saved = await row();
    assert.deepEqual([saved.level, saved.xp, saved.cultivation_level, saved.cultivation_xp], [expected.level, expected.xp, 1, 0]);
    assert.equal(saved.class_xp, before.class_xp);
    assert.equal(saved.gold, before.gold);
    assert.equal(saved.time_points, before.time_points + 2 * (expected.level - LEVEL));
    assert.equal(await work('avatar_activities'), null);
    assert.equal(after.professions.avatar.activity, null);
    // In the Dziennik under the Awatar's mark and key.
    const listed = (await as('GET', '/api/reports')).data.reports.find((one) => one.kind === 'cultivation');
    assert.equal(listed.id, report.id);
    assert.equal(listed.avatar, true);
    assert.equal(listed.xp, xp);
    assert.deepEqual(listed.cultivation, report.cultivation);
    const stored = await (await sql("SELECT activity_key FROM reports WHERE kind = 'cultivation'")).first();
    assert.match(stored.activity_key, /:avatar:/);
    assert.equal((await as('GET', `/api/reports/${report.id}`)).data.report.avatar, true);
    // Claimed once.
    assert.equal((await as('POST', '/api/avatar/claim')).data.error.code, 'no_activity');
  });

  test('the quarter stays under the cap: never past the class, as it is at the claim', async () => {
    await buy();
    assert.equal((await meditate(480, true)).status, 201);
    // XP from elsewhere meanwhile brought the character near its class.
    const xp = toNext(CLASS_LEVEL - 1) - 10;
    await (await sql('UPDATE characters SET level = ?, xp = ?, version = version + 1', CLASS_LEVEL - 1, xp)).run();
    await end('avatar_activities');
    const claimed = await as('POST', '/api/avatar/claim');
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
    assert.equal(claimed.data.report.xp, xpToLevel(CLASS_LEVEL - 1, xp, CLASS_LEVEL, content));
    assert.equal(claimed.data.report.xp, 10);
    assert.equal(claimed.data.report.capped, true);
    const saved = await row();
    // The Kultywacja's 480 minutes whole: its first level and 240 into the
    // second.
    const grown = cultivationProgress({ level: 0, xp: 0 }, 480, content);
    assert.deepEqual([grown.level, grown.xp], [1, 240]);
    assert.deepEqual([saved.level, saved.xp, saved.cultivation_level, saved.cultivation_xp], [CLASS_LEVEL, 0, grown.level, grown.xp]);
  });

  test('one meditates at a time: the character shuts the Awatary out, an Awatar the character and the other Awatar', async () => {
    await buy();
    await buy(true);
    // The character meditates: neither Awatar may, but both may work.
    assert.equal((await meditate(60)).status, 201);
    refused(await meditate(60, true), 'busy', 'Kultywację robi już postać. Naraz medytuje tylko jeden.');
    refused(await meditate(60, 2), 'busy', 'Kultywację robi już postać. Naraz medytuje tylko jeden.');
    assert.equal((await as('POST', '/api/professions/gather', { herbs: ['comfrey'], minutes: 60, avatar: true })).status, 201);
    // Ended, its report waits first.
    await end('activities');
    refused(await meditate(60, 2), 'claim_first', 'Postać skończyła Kultywację. Najpierw odbierz jej raport.');
    assert.equal((await as('POST', '/api/hunts/claim')).status, 200);

    // The second Awatar meditates: the character may not, nor the first.
    assert.equal((await meditate(60, 2)).status, 201);
    refused(await meditate(60), 'busy', second.cultivationTaken[0]);
    assert.equal(second.cultivationTaken[0], 'Kultywację robi już Drugi Awatar Systemu. Naraz medytuje tylko jeden.');
    assert.equal((await as('POST', '/api/avatar/cancel')).status, 200);
    refused(await meditate(60, true), 'busy', second.cultivationTaken[0]);
    await end('avatar2_activities');
    refused(await meditate(60), 'claim_first', second.meditated[0]);
    assert.equal((await as('POST', '/api/avatar/claim', { avatar: 2 })).status, 200);

    // The first Awatar meditates: the character may not, nor the second.
    assert.equal((await meditate(60, true)).status, 201);
    refused(await meditate(60), 'busy', texts.cultivationTaken[0]);
    assert.equal(texts.cultivationTaken[0], 'Kultywację robi już Awatar Systemu. Naraz medytuje tylko jeden.');
    refused(await meditate(60, 2), 'busy', texts.cultivationTaken[0]);
    // The character is free for everything else meanwhile.
    assert.equal((await as('POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 30 })).status, 201);
    assert.equal((await character()).cultivation.running.avatar, true);
  });

  test('an Awatar meditating takes no work, and one at work no Kultywacja: one slot', async () => {
    await buy();
    assert.equal((await meditate(60, true)).status, 201);
    for (const [path, body] of [
      ['/api/professions/gather', { herbs: ['comfrey'], minutes: 60, avatar: true }],
      ['/api/professions/mine', { minutes: 60, avatar: true }],
      ['/api/cultivation', { minutes: 60, avatar: true }],
    ]) {
      refused(await as('POST', path, body), 'busy', texts.meditating[0]);
    }
    assert.equal(texts.meditating[0], 'Awatar Systemu medytuje. Poczekaj na koniec jego Kultywacji.');
    await end('avatar_activities');
    refused(await as('POST', '/api/professions/gather', { herbs: ['comfrey'], minutes: 60, avatar: true }), 'claim_first', texts.meditated[0]);
    assert.equal(texts.meditated[0], 'Awatar Systemu skończył Kultywację. Najpierw odbierz jego raport.');
    // Its report waits for the claim, not for "Przerwij".
    refused(await as('POST', '/api/avatar/cancel'), 'claim_first', texts.meditated[0]);
    assert.equal((await as('POST', '/api/avatar/claim')).status, 200);

    // At work, it does not meditate; the character may.
    assert.equal((await as('POST', '/api/professions/gather', { herbs: ['comfrey'], minutes: 60, avatar: true })).status, 201);
    refused(await meditate(60, true), 'busy', texts.busy[0]);
    const view = (await character()).cultivation;
    assert.ok(view.plan);
    assert.equal(view.avatarPlan, undefined);
    assert.equal((await meditate(60)).status, 201);
    // Without an Awatar bought, none meditates.
    await (await sql('UPDATE characters SET avatar_at = NULL, avatar2_at = NULL')).run();
    refused(await meditate(60, true), 'no_avatar', 'Nie masz jeszcze Awatara Systemu.');
  });

  test('the second Awatar meditates the same way, in its own slot, with its own report', async () => {
    await buy();
    await buy(true);
    const answer = await meditate(60, 2);
    assert.equal(answer.status, 201, JSON.stringify(answer.data));
    const started = await work('avatar2_activities');
    assert.equal(started.kind, 'cultivation');
    assert.equal(JSON.parse(started.options).xp, quarter(60));
    assert.equal(await work('avatar_activities'), null);
    const { professions, cultivation } = answer.data.character;
    assert.equal(professions.avatar.second.activity.kind, 'cultivation');
    assert.equal(professions.avatar.activity, null);
    assert.equal(cultivation.running.avatar, 2);
    // Its slot is taken; the first Awatar's is free for a work.
    refused(await as('POST', '/api/professions/mine', { minutes: 60, avatar: 2 }), 'busy', second.meditating[0]);
    assert.equal((await as('POST', '/api/professions/mine', { minutes: 60, avatar: true })).status, 201);
    assert.equal((await as('POST', '/api/avatar/claim', { avatar: 2 })).data.error.message, 'Kultywacja jeszcze trwa.');
    await end('avatar2_activities');
    const claimed = await as('POST', '/api/avatar/claim', { avatar: 2 });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
    assert.deepEqual([claimed.data.report.kind, claimed.data.report.avatar, claimed.data.report.xp], ['cultivation', 2, quarter(60)]);
    assert.deepEqual(claimed.data.report.cultivation, { xp: 60, levelBefore: 0, levelAfter: 0, bonus: 0 });
    const stored = await (await sql("SELECT activity_key, summary FROM reports WHERE kind = 'cultivation'")).first();
    assert.match(stored.activity_key, /:avatar2:/);
    assert.equal(JSON.parse(stored.summary).avatar, 2);
    assert.equal((await row()).cultivation_xp, 60);
  });

  test('Punkty Czasu rewind an Awatar\'s Kultywacja as its work, its minutes counted whole', async () => {
    await buy();
    await buy(true);
    assert.equal((await meditate(60, true)).status, 201);
    const before = await row();
    const skipped = await as('POST', '/api/time/skip', { target: 'avatar' });
    assert.equal(skipped.status, 200, JSON.stringify(skipped.data));
    assert.equal(skipped.data.spent, 60);
    assert.equal((await row()).time_points, before.time_points - 60);
    assert.ok(skipped.data.character.professions.avatar.activity.finished);
    const claimed = await as('POST', '/api/avatar/claim');
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
    assert.equal(claimed.data.report.cultivation.xp, 60);

    assert.equal((await meditate(30, 2)).status, 201);
    const rewound = await as('POST', '/api/time/skip', { target: 'avatar2' });
    assert.equal(rewound.status, 200, JSON.stringify(rewound.data));
    assert.equal(rewound.data.spent, 30);
    assert.equal((await as('POST', '/api/avatar/claim', { avatar: 2 })).data.report.cultivation.xp, 30);
    assert.equal((await row()).cultivation_xp, 90);
  });

  test('„Przerwij” ends an Awatar\'s Kultywacja with nothing, and the slot is free', async () => {
    await buy();
    assert.equal((await meditate(60, true)).status, 201);
    const before = await row();
    const cancelled = await as('POST', '/api/avatar/cancel');
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data));
    assert.equal(cancelled.data.report, null);
    assert.equal(await work('avatar_activities'), null);
    const after = await row();
    assert.deepEqual([after.level, after.xp, after.cultivation_level, after.cultivation_xp], [before.level, before.xp, 0, 0]);
    assert.equal((await as('GET', '/api/reports')).data.reports.filter((one) => one.kind === 'cultivation').length, 0);
    // The slot is free: the character may meditate, and the Awatar work.
    assert.ok(cancelled.data.character.cultivation.plan);
    assert.ok(cancelled.data.character.cultivation.avatarPlan);
    assert.equal((await as('POST', '/api/professions/gather', { herbs: ['comfrey'], minutes: 60, avatar: true })).status, 201);
    assert.equal((await meditate(60)).status, 201);
  });

  test("an Awatar's end is told on the phone under a title naming it, leading to the Kultywacja", () => {
    const ending = (endsAt) => ({ kind: 'cultivation', areaId: 'x', endsAt });
    const due = notificationsDue({ level: LEVEL, activity: null, avatarActivity: ending(1500), avatar2Activity: ending(1600), buildings: {}, queue: [] }, 1000, 2000, content);
    assert.deepEqual(due, [
      { tag: 'avatar-cultivation', url: '#/kultywacja', at: 1500, title: 'Koniec Kultywacji Awatara Systemu', body: 'Kultywacja zakończona. Raport czeka na odbiór.' },
      { tag: 'avatar2-cultivation', url: '#/kultywacja', at: 1600, title: 'Koniec Kultywacji Drugiego Awatara Systemu', body: 'Kultywacja zakończona. Raport czeka na odbiór.' },
    ]);
    // Not before its end, nor once told.
    assert.deepEqual(notificationsDue({ level: LEVEL, activity: null, avatarActivity: ending(2500), buildings: {}, queue: [] }, 1000, 2000, content), []);
  });
});

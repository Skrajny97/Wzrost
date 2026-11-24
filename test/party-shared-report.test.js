// Wspólny raport drużyny (src/server/hunts.js, claimTrip; the author,
// 24.11.2026: „niech lider odbiera raport za wszystkich, niech wszyscy mają
// wspólny”, „niech moga isc dalej na wyprawy nawet jak jednego gracza nie
// ma”). The first claim of a Drużyna's trip, by its leader or by any member,
// claims it for everyone who went at once: each gets its XP, gold, levels,
// finds and the potions it did not drink, and its own report in its
// Dziennik, every one with the same list of what each got and who claimed
// it; the others' Walka marks it until they open it, and a member's own
// "Odbierz raport" afterwards only opens it. Free stat points wait on the
// character, and the leader sends the party out again at once.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { xpToNext } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

describe("a Drużyna's trip claimed once for everyone", () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on' });
  const cookies = {};
  const sql = async (query, ...binds) => (await db()).prepare(query).bind(...binds);
  // Strong enough for the Wiatrołomy, not on its first exploration; Alchemia
  // at level 5 knows the lesser healing potion.
  const player = async (login, name) => {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await (
      await sql(
        `UPDATE characters SET level = 30, class_level = 30, points = '{"strength":150,"vitality":140}', professions = '{"alchemy":{"level":5,"xp":0}}', potions = '{"lesser-healing":3}' WHERE name = ?`,
        name,
      )
    ).run();
    await (await sql("INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) SELECT id, 'earlier-' || id, 'hunt', 0, '{}', '{}' FROM characters WHERE name = ?", name)).run();
  };
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const row = async (name) => (await sql('SELECT * FROM characters WHERE name = ?', name)).first();
  const activity = async (name) => (await sql('SELECT a.* FROM activities a JOIN characters c ON c.id = a.character_id WHERE c.name = ?', name)).first();
  const tripReports = async (name) =>
    (await (await sql("SELECT r.id, r.activity_key, r.data FROM reports r JOIN characters c ON c.id = r.character_id WHERE c.name = ? AND r.kind = 'hunt' AND r.data != '{}' ORDER BY r.id", name)).all()).results;
  // The party's trip of 30 minutes, over.
  const trip = async (names = ['Druh']) => {
    const went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'windfalls-edge', minutes: 30 });
    assert.equal(went.status, 201, JSON.stringify(went.data).slice(0, 400));
    assert.deepEqual(went.data.went, names);
    await (await sql('UPDATE activities SET started_at = started_at - 1800000, ends_at = ends_at - 1800000')).run();
  };

  beforeEach(async () => {
    await player('lider', 'Lider');
    await player('druh', 'Druh');
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
  });

  test("the leader's claim gives every member all its claim would, each a report with everyone's part, the others' marked until opened", async () => {
    // Druh takes two potions along (0.4.84): back with the shared claim.
    assert.equal((await as('druh', 'PUT', '/api/party/potions', { potions: { 'lesser-healing': 2 } })).status, 200);
    await trip();
    const started = await activity('Druh');
    assert.deepEqual(JSON.parse((await row('Druh')).potions), { 'lesser-healing': 1 });
    const before = { Lider: await row('Lider'), Druh: await row('Druh') };

    const claimed = await as('lider', 'POST', '/api/hunts/claim');
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 400));
    const { report } = claimed.data;
    // Both trips are over: nobody's report waits.
    assert.equal(await activity('Lider'), null);
    assert.equal(await activity('Druh'), null);
    assert.equal(report.partyClaim.by, 'Lider');
    assert.deepEqual(
      report.partyClaim.members.map((one) => [one.name, one.own ?? false]),
      [
        ['Lider', true],
        ['Druh', false],
      ],
    );
    // Druh's own report, in its Dziennik, of its own exploration.
    const [kept] = await tripReports('Druh');
    assert.equal(kept.activity_key, `${started.character_id}:${started.started_at}`);
    const druh = JSON.parse(kept.data);
    assert.equal(druh.partyClaim.by, 'Lider');
    assert.deepEqual(
      druh.partyClaim.members.map((one) => [one.name, one.own ?? false]),
      [
        ['Lider', false],
        ['Druh', true],
      ],
    );
    // Everyone's part is the same in both reports, and each one's own part
    // is what its own report and its character got.
    const strip = (members) => members.map(({ own, ...rest }) => rest);
    assert.deepEqual(strip(druh.partyClaim.members), strip(report.partyClaim.members));
    for (const [name, own] of [
      ['Lider', report],
      ['Druh', druh],
    ]) {
      const part = own.partyClaim.members.find((one) => one.own);
      assert.equal(part.name, name);
      assert.equal(part.xp, own.summary.xp);
      assert.equal(part.gold, own.summary.gold);
      assert.equal(part.items.length, own.items.length);
      const after = await row(name);
      assert.equal(after.gold, before[name].gold + own.summary.gold);
      if (after.level === before[name].level) assert.equal(after.xp, before[name].xp + own.summary.xp);
      assert.equal(own.result, report.result);
    }
    assert.ok(druh.summary.xp > 0);
    // The fights are the trip's, the same in both.
    assert.deepEqual(
      druh.fights.map((fight) => [fight.won, fight.enemies.map((enemy) => enemy.monsterId)]),
      report.fights.map((fight) => [fight.won, fight.enemies.map((enemy) => enemy.monsterId)]),
    );
    // The potions it did not drink are back in its bag.
    const drunk = druh.potionsUsed['lesser-healing'] ?? 0;
    assert.deepEqual(JSON.parse((await row('Druh')).potions), { 'lesser-healing': 3 - drunk });
    // Its Walka marks the report another claimed, and the Dziennik names who.
    const view = (await as('druh', 'GET', '/api/character')).data.character;
    assert.deepEqual(view.partyReport, { id: kept.id, by: 'Lider' });
    assert.equal((await as('lider', 'GET', '/api/character')).data.character.partyReport, null);
    const listed = (await as('druh', 'GET', '/api/reports')).data.reports.find((one) => one.id === kept.id);
    assert.deepEqual(listed.partyClaim, { by: 'Lider' });
    // Opened, it is marked no more.
    const opened = await as('druh', 'GET', `/api/reports/${kept.id}`);
    assert.equal(opened.data.report.partyClaim.by, 'Lider');
    assert.equal((await as('druh', 'GET', '/api/character')).data.character.partyReport, null);
  });

  test("a member's own \"Odbierz raport\" afterwards only opens the shared report, and the leader sends the party out again at once", async () => {
    await trip();
    assert.equal((await as('lider', 'POST', '/api/hunts/claim')).status, 200);
    const [kept] = await tripReports('Druh');
    const before = await row('Druh');
    // The member's Walka from before the claim still offers it.
    const opened = await as('druh', 'POST', '/api/hunts/claim');
    assert.equal(opened.status, 200, JSON.stringify(opened.data).slice(0, 400));
    assert.equal(opened.data.report.id, kept.id);
    assert.equal(opened.data.report.partyClaim.by, 'Lider');
    assert.equal(opened.data.character.partyReport, null);
    const after = await row('Druh');
    assert.equal(after.gold, before.gold);
    assert.equal(after.xp, before.xp);
    assert.equal((await tripReports('Druh')).length, 1);
    // Nothing more to open.
    assert.equal((await as('druh', 'POST', '/api/hunts/claim')).data.error.code, 'no_activity');
    // The leader sends the party out again at once: the member goes too.
    await trip();
  });

  test("a member's claim claims the trip for the leader too, and the leader's Walka marks it", async () => {
    await trip();
    const claimed = await as('druh', 'POST', '/api/hunts/claim');
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 400));
    assert.equal(claimed.data.report.partyClaim.by, 'Druh');
    assert.equal(await activity('Lider'), null);
    const [kept] = await tripReports('Lider');
    assert.equal(JSON.parse(kept.data).partyClaim.by, 'Druh');
    assert.deepEqual((await as('lider', 'GET', '/api/character')).data.character.partyReport, { id: kept.id, by: 'Druh' });
    // The leader goes on at once.
    await trip();
  });

  test('a new level of a member away: its free stat points wait on the character, and it goes on the next trip all the same', async () => {
    // One XP short of the next level.
    await (await sql("UPDATE characters SET xp = ? WHERE name = 'Druh'", xpToNext(30, content) - 1)).run();
    await trip();
    const before = (await as('druh', 'GET', '/api/character')).data.character.freePoints;
    assert.equal((await as('lider', 'POST', '/api/hunts/claim')).status, 200);
    const after = await row('Druh');
    assert.equal(after.level, 31);
    const [kept] = await tripReports('Druh');
    const druh = JSON.parse(kept.data);
    assert.deepEqual([druh.summary.levelBefore, druh.summary.levelAfter], [30, 31]);
    const part = druh.partyClaim.members.find((one) => one.own);
    assert.deepEqual([part.levelBefore, part.levelAfter], [30, 31]);
    const points = (await as('druh', 'GET', '/api/character')).data.character.freePoints;
    assert.ok(points > before, `${before} → ${points}`);
    // Nothing to spend holds it home.
    await trip();
  });

  test('a third member at a profession\'s work stays out of the trip and its claim', async () => {
    await player('trzeci', 'Trzeci');
    const { data } = await as('lider', 'GET', '/api/party');
    await as('lider', 'POST', '/api/party/invite', { name: 'Trzeci' });
    await as('trzeci', 'POST', '/api/party/accept', { partyId: data.party.id });
    assert.equal((await as('trzeci', 'POST', '/api/professions/gather', { herbs: ['comfrey'], minutes: 60 })).status, 201);
    await trip(['Druh']);
    const gathering = await activity('Trzeci');
    assert.equal(gathering.kind, 'herbs');
    assert.equal((await as('lider', 'POST', '/api/hunts/claim')).status, 200);
    // Its work goes on untouched, with no report of the trip.
    assert.deepEqual(await activity('Trzeci'), gathering);
    assert.deepEqual(await tripReports('Trzeci'), []);
    assert.equal((await as('trzeci', 'GET', '/api/character')).data.character.partyReport, null);
  });
});

describe("a Drużyna's shared report in each member's language", () => {
  const { call, db, signUp } = useServer({ ENGLISH: 'on' });
  const cookies = {};
  const sql = async (query, ...binds) => (await db()).prepare(query).bind(...binds);
  const player = async (login, name) => {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await (await sql(`UPDATE characters SET level = 30, class_level = 30, points = '{"strength":150,"vitality":140}' WHERE name = ?`, name)).run();
    await (await sql("INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) SELECT id, 'earlier-' || id, 'hunt', 0, '{}', '{}' FROM characters WHERE name = ?", name)).run();
  };
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });

  test("the leader's claim makes the English member's report in English, and the leader's in Polish", async () => {
    await player('lider', 'Lider');
    await player('druh', 'Druh');
    await (await sql("UPDATE users SET language = 'en' WHERE login = 'druh'")).run();
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
    assert.equal((await as('lider', 'POST', '/api/party/hunt', { areaId: 'windfalls-edge', minutes: 30 })).status, 201);
    await (await sql('UPDATE activities SET started_at = started_at - 1800000, ends_at = ends_at - 1800000')).run();
    const { report } = (await as('lider', 'POST', '/api/hunts/claim')).data;
    assert.equal(report.resultText, 'Wyprawa zakończona.');
    const kept = await (await sql("SELECT r.data FROM reports r JOIN characters c ON c.id = r.character_id WHERE c.name = 'Druh' AND r.kind = 'hunt' AND r.data != '{}'")).first();
    const druh = JSON.parse(kept.data);
    assert.equal(druh.resultText, 'Exploration complete.');
    assert.equal(druh.areaName, 'Edge of the Windfalls');
    assert.deepEqual(
      druh.partyClaim.members.map((one) => one.name),
      ['Lider', 'Druh'],
    );
  });
});

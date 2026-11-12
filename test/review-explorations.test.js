// Fixes from the code review of explorations of 12.11.2026 (DECISIONS.md,
// "Wersja 0.2.72"): a Drużyna's trip claimed while another member moves it
// pays once, and a member's own rumor from the Karczma waits for its own
// exploration. Each test failed on the code as it was reviewed.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { useServer } from './helpers/server.js';

describe('review: a Drużyna trip claimed while another member skips its end', () => {
  const { call, db, signUp } = useServer();
  const cookies = {};
  const player = async (login, name) => {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = 30, class_level = 30 WHERE name = ?').bind(name).run();
  };
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const row = async (name) => (await db()).prepare('SELECT * FROM characters WHERE name = ?').bind(name).first();

  beforeEach(async () => {
    await player('lider', 'Lider');
    await player('druh', 'Druh');
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
  });

  // The race: Druh taps "Przewiń" a moment before the trip ends (1 Time
  // Point, the trip moves ~2 s back, time.js: skipWork → shiftTrip), and
  // Lider taps "Odbierz raport" a moment after it ends. Lider's claim reads
  // its exploration (started_at X), then Druh's skip commits, then Lider's
  // claim batch runs. Druh's skip changes Lider's activity but not Lider's
  // version, so the claim's only guard (sameVersion) passes; its report goes
  // in under the key "id:X" and its "DELETE ... started_at = X" deletes
  // nothing. The skip's statements are run here by a trigger on the claim's
  // own settling of Time Points (characters.js: settleTimePoints), which
  // comes after the claim has read the character and before its batch:
  // exactly the moment the skip lands in the race.
  test('the trip pays once: of a claim raced by the skip and a claim after it, exactly one pays', async () => {
    const database = await db();
    // An earlier report, so neither claim is the very first exploration.
    const lider = await row('Lider');
    await database.prepare("INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) VALUES (?, 'earlier', 'hunt', 0, '{}', '{}')").bind(lider.id).run();
    const went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'windfalls-edge', minutes: 30 });
    assert.equal(went.status, 201, JSON.stringify(went.data).slice(0, 300));
    assert.deepEqual(went.data.went, ['Druh']);
    // The trip has just ended, for both (one shared timer).
    await database.prepare('UPDATE activities SET started_at = started_at - 1805000, ends_at = ends_at - 1805000').run();
    const trip = await database.prepare('SELECT started_at, options FROM activities WHERE character_id = ?').bind(lider.id).first();
    const { party } = JSON.parse(trip.options);
    const druh = await row('Druh');
    // Druh's "Przewiń" as time.js sends it with a few ms left: 1 point paid,
    // the whole trip 2 s and those ms back, Druh's skip recorded.
    const shift = 2005;
    const record = JSON.stringify({ id: druh.id, name: 'Druh', minutes: 1, female: true });
    await database.prepare('UPDATE characters SET time_points = 5 WHERE id = ?').bind(druh.id).run();
    await database.prepare('UPDATE characters SET time_points_at = time_points_at - 3600000 WHERE id = ?').bind(lider.id).run();
    await database
      .prepare(
        `CREATE TRIGGER skip_meanwhile AFTER UPDATE OF time_points_at ON characters WHEN NEW.id = ${lider.id}
         BEGIN
           UPDATE characters SET time_points = time_points - 1, version = version + 1 WHERE id = ${druh.id};
           UPDATE activities SET started_at = started_at - ${shift}, ends_at = ends_at - ${shift},
             options = json_set(options, '$.skips', json_insert(COALESCE(json_extract(options, '$.skips'), json_array()), '$[#]', json('${record}')))
           WHERE kind = 'hunt' AND started_at = ${trip.started_at} AND json_extract(options, '$.party.id') = ${party.id} AND json_extract(options, '$.party.trip') = ${party.trip};
         END`,
      )
      .run();
    let first;
    try {
      first = await as('lider', 'POST', '/api/hunts/claim');
    } finally {
      await database.prepare('DROP TRIGGER IF EXISTS skip_meanwhile').run();
    }
    // The raced claim either pays (and takes the exploration away) or is
    // refused as "changed meanwhile"; the player taps again either way.
    assert.ok([200, 409].includes(first.status), JSON.stringify(first.data).slice(0, 300));
    const goldAfterFirst = (await row('Lider')).gold;
    const left = await database.prepare('SELECT started_at FROM activities WHERE character_id = ?').bind(lider.id).first();
    const second = await as('lider', 'POST', '/api/hunts/claim');
    const reports = (await database.prepare("SELECT activity_key FROM reports WHERE character_id = ? AND activity_key <> 'earlier'").bind(lider.id).all()).results;
    const goldAfterSecond = (await row('Lider')).gold;
    const story =
      `first claim ${first.status}, exploration left after it: ${left ? `started_at ${left.started_at} (was ${trip.started_at})` : 'none'}, ` +
      `second claim ${second.status}, reports ${JSON.stringify(reports.map((one) => one.activity_key))}, gold ${lider.gold} → ${goldAfterFirst} → ${goldAfterSecond}`;
    assert.equal(reports.length, 1, story);
    assert.equal([first.status, second.status].filter((status) => status === 200).length, 1, story);
    assert.equal(await database.prepare('SELECT 1 AS found FROM activities WHERE character_id = ?').bind(lider.id).first(), null, story);
  });
});

describe('review: a Drużyna member\'s own rumor from the Karczma', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on' });
  const cookies = {};
  const player = async (login, name) => {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = 30, class_level = 30, gold = 100000 WHERE name = ?').bind(name).run();
  };
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const row = async (name) => (await db()).prepare('SELECT * FROM characters WHERE name = ?').bind(name).first();

  beforeEach(async () => {
    await player('lider', 'Lider');
    await player('druh', 'Druh');
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
  });

  // Druh buys a mug and hears of a place; the leader, who heard nothing,
  // takes the party there. The member's beginHunt (hunts.js) marks its rumor
  // used, but the trip's fights follow the leader's rumor only
  // (parties.js: encounter.rumor = lead.rumor; hunts.js finishHunt: rumor =
  // trip.encounter.rumor), so the member's mug of the day is lost for nothing.
  test('a member\'s rumor the trip uses up is one its fights use', async () => {
    const bought = await as('druh', 'POST', '/api/settlement/tavern');
    assert.equal(bought.status, 200, JSON.stringify(bought.data).slice(0, 300));
    const told = JSON.parse((await row('Druh')).settlement).rumor;
    assert.equal(told.used, false);
    const went = await as('lider', 'POST', '/api/party/hunt', { areaId: told.areaId, minutes: 30 });
    assert.equal(went.status, 201, JSON.stringify(went.data).slice(0, 300));
    assert.deepEqual(went.data.went, ['Druh']);
    const druh = await row('Druh');
    const after = JSON.parse(druh.settlement).rumor;
    const options = JSON.parse((await (await db()).prepare('SELECT options FROM activities WHERE character_id = ?').bind(druh.id).first()).options);
    assert.ok(
      !after.used || options.party.encounter.rumor > 1,
      `Druh's rumor of ${told.areaId} is used (${after.used}), its exploration kept rumor ${options.rumor}, but the trip's fights take rumor ${options.party.encounter.rumor}`,
    );
  });
});

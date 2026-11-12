// A Drużyna's member's waiting report claimed as the party sets out
// (src/server/parties.js, claimForTrip; 10.11.2026, the author: „Koniecznie
// musimy zrobić jakieś obejście odbierania raportu przez każdego członka
// drużyny zanim wyruszy się w kolejną wyprawę.”): a member whose exploration
// or work has ended goes along, its report claimed first as its own
// "Odbierz raport" would claim it, in its Dziennik, and its Walka tells it
// and opens it. One whose own exploration ends in an event stays home, and
// with nobody else to go the party does not set out, its leader neither
// (a player's bug report, 12.11.2026: „nie załącza się jazda w 2 tylko
// solo”); a trip itself ends in no event (the author, 12.11.2026: „Niech
// zdarzenia w drużynie nie występują”). One busy with something still
// running is left alone, and a leader's wrong choice claims nobody's report.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { useServer } from './helpers/server.js';

function drużyna(vars) {
  const { call, db, signUp } = useServer(vars);
  const cookies = {};
  const player = async (login, name) => {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = 30, class_level = 30 WHERE name = ?').bind(name).run();
  };
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const sql = async (text, ...binds) => (await db()).prepare(text).bind(...binds);
  const row = async (name) => (await sql('SELECT * FROM characters WHERE name = ?', name)).first();
  const activity = async (name) => (await sql('SELECT a.* FROM activities a JOIN characters c ON c.id = a.character_id WHERE c.name = ?', name)).first();
  const reports = async (name) => (await (await sql('SELECT r.id, r.kind, r.activity_key FROM reports r JOIN characters c ON c.id = r.character_id WHERE c.name = ? ORDER BY r.id', name)).all()).results;
  // Moves `name`'s activity `minutes` into the past.
  const age = async (name, minutes) =>
    (await sql('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ? WHERE character_id = (SELECT id FROM characters WHERE name = ?)', minutes * 60000, minutes * 60000, name)).run();
  const join = async () => {
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
  };
  return { call, db, signUp, player, as, sql, row, activity, reports, age, join };
}

describe('a member\'s waiting report claimed as the party sets out', () => {
  const { player, as, sql, row, activity, reports, age, join } = drużyna({ PROFESSIONS: 'on' });

  beforeEach(async () => {
    await player('lider', 'Lider');
    await player('druh', 'Druh');
    await join();
  });

  test('a member back from its exploration goes along, its report claimed as its own claim would', async () => {
    assert.equal((await as('druh', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).status, 201);
    await age('Druh', 5);
    const before = await activity('Druh');
    // The party's list shows it free: it goes the next time the party sets out.
    const view = (await as('lider', 'GET', '/api/party')).data.party;
    assert.equal(view.members.find((one) => one.name === 'Druh').status, 'free');
    const xpBefore = (await row('Druh')).xp;
    const went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'windfalls-edge', minutes: 30 });
    assert.equal(went.status, 201, JSON.stringify(went.data).slice(0, 400));
    assert.deepEqual(went.data.went, ['Druh']);
    assert.deepEqual(went.data.notes, []);
    // The report is in its Dziennik, made from the exploration that waited.
    const [report] = await reports('Druh');
    assert.equal(report.kind, 'hunt');
    assert.equal(report.activity_key, `${before.character_id}:${before.started_at}`);
    const druh = await row('Druh');
    const own = (await as('druh', 'GET', `/api/reports/${report.id}`)).data.report;
    assert.equal(own.kind, 'hunt');
    assert.ok(own.summary.xp > 0);
    if (druh.level === 30) assert.equal(druh.xp, xpBefore + own.summary.xp);
    // Now on the trip, and its Walka tells it and opens the report.
    const trip = await activity('Druh');
    assert.notEqual(trip.started_at, before.started_at);
    assert.deepEqual(JSON.parse(trip.options).party.names, ['Lider', 'Druh']);
    const { character } = (await as('druh', 'GET', '/api/character')).data;
    assert.deepEqual(character.activity.party.claimed, { id: report.id, kind: 'hunt' });
    // The leader's own trip tells nothing of it.
    assert.equal((await as('lider', 'GET', '/api/character')).data.character.activity.party.claimed, undefined);
    // Claimed once: the member's own claim of it finds the trip still on its way.
    assert.equal((await as('druh', 'POST', '/api/hunts/claim')).data.error.code, 'not_finished');
  });

  test('a member back from a profession\'s work goes along, its herbs and XP its own', async () => {
    assert.equal((await as('druh', 'POST', '/api/professions/gather', { herbs: ['comfrey'], minutes: 60 })).status, 201);
    await age('Druh', 60);
    const went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'windfalls-edge', minutes: 30 });
    assert.equal(went.status, 201, JSON.stringify(went.data).slice(0, 400));
    assert.deepEqual(went.data.went, ['Druh']);
    const [report] = await reports('Druh');
    assert.equal(report.kind, 'herbs');
    const druh = await row('Druh');
    assert.ok(Object.values(JSON.parse(druh.herbs)).reduce((sum, count) => sum + count, 0) > 0);
    assert.equal(JSON.parse(druh.professions).herbalism.xp + JSON.parse(druh.professions).herbalism.level > 1, true);
    assert.equal((await activity('Druh')).kind, 'hunt');
    const { character } = (await as('druh', 'GET', '/api/character')).data;
    assert.deepEqual(character.activity.party.claimed, { id: report.id, kind: 'herbs' });
  });

  test('a leader\'s wrong choice sends nobody and claims nobody\'s report', async () => {
    assert.equal((await as('druh', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).status, 201);
    await age('Druh', 5);
    const before = await activity('Druh');
    const wrong = await as('lider', 'POST', '/api/party/hunt', { areaId: 'windfalls-edge', minutes: 30, healBelow: 0.123 });
    assert.equal(wrong.data.error.code, 'invalid_heal_below');
    assert.deepEqual(await activity('Druh'), before);
    assert.deepEqual(await reports('Druh'), []);
    assert.equal(await activity('Lider'), null);
  });

  test('a member busy with something still running is left alone', async () => {
    assert.equal((await as('druh', 'POST', '/api/professions/gather', { herbs: ['comfrey'], minutes: 60 })).status, 201);
    const before = await activity('Druh');
    const nobody = await as('lider', 'POST', '/api/party/hunt', { areaId: 'windfalls-edge', minutes: 30 });
    assert.equal(nobody.data.error.code, 'nobody_free');
    assert.deepEqual(await activity('Druh'), before);
    assert.deepEqual(await reports('Druh'), []);
    assert.equal((await as('lider', 'GET', '/api/party')).data.party.members.find((one) => one.name === 'Druh').status, 'working');
  });

  test('a claim the member made at the same moment is fine: the member is read again and goes', async () => {
    assert.equal((await as('druh', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).status, 201);
    await age('Druh', 5);
    // The member's own claim lands just as the leader sets out, after the
    // party's request read it with its report waiting: at the first write
    // of the party's claim of it, its Encyklopedia's record (settleCharacter).
    await (await sql("UPDATE characters SET discovered = '{}' WHERE name = 'Druh'")).run();
    await (
      await sql(
        `CREATE TRIGGER claimed_meanwhile AFTER UPDATE OF discovered ON characters WHEN NEW.name = 'Druh'
         BEGIN
           INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data)
             SELECT character_id, character_id || ':' || started_at, 'hunt', NEW.started_at, '{}', '{}' FROM activities WHERE character_id = (SELECT id FROM characters WHERE name = 'Druh');
           DELETE FROM activities WHERE character_id = (SELECT id FROM characters WHERE name = 'Druh');
           UPDATE characters SET version = version + 1 WHERE name = 'Druh';
         END`,
      )
    ).run();
    let went;
    try {
      went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'windfalls-edge', minutes: 30 });
    } finally {
      await (await sql('DROP TRIGGER IF EXISTS claimed_meanwhile')).run();
    }
    assert.equal(went.status, 201, JSON.stringify(went.data).slice(0, 400));
    assert.deepEqual(went.data.went, ['Druh']);
    // Its own report only, once; its Walka may point at it (the party's
    // claim found it claimed and took it as made, hunts.js).
    const [only, ...more] = await reports('Druh');
    assert.deepEqual(more, []);
    assert.equal((await activity('Druh')).kind, 'hunt');
    const pointed = (await as('druh', 'GET', '/api/character')).data.character.activity.party.claimed;
    assert.ok(pointed === undefined || pointed.id === only.id, JSON.stringify(pointed));
  });
});

describe('a member whose exploration ends in an event', () => {
  const { player, as, sql, activity, reports, age, join } = drużyna({ EVENTS: 'on' });

  beforeEach(async () => {
    await player('lider', 'Lider');
    await player('druh', 'Druh');
    await join();
  });

  // Not its first exploration, strong enough to come back, and the event
  // "Testuj zdarzenia" brings.
  const withEvent = async (name) => {
    await (await sql("INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) SELECT id, 'earlier-' || id, 'hunt', 0, '{}', '{}' FROM characters WHERE name = ?", name)).run();
    await (await sql(`UPDATE characters SET points = '{"strength":150,"vitality":140}', hp_at = 0, event_test = 'wounded-woman' WHERE name = ?`, name)).run();
  };

  test('stays home, its event waiting for its own choice, and nobody sets out: the leader hears why', async () => {
    await withEvent('Druh');
    assert.equal((await as('druh', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).status, 201);
    await age('Druh', 5);
    const before = await activity('Druh');
    const refused = await as('lider', 'POST', '/api/party/hunt', { areaId: 'windfalls-edge', minutes: 30 });
    assert.equal(refused.status, 409);
    assert.equal(refused.data.error.code, 'party_choosing');
    assert.equal(
      refused.data.error.message,
      'Nikt z drużyny nie może teraz wyruszyć. Wybór w zdarzeniu z poprzedniej wyprawy czeka na: Druh. Poczekaj albo odznacz „Z drużyną” w Walce, by wyruszyć bez drużyny.',
    );
    // Nothing of it saved: the exploration and its event wait as they were,
    // and the leader stays home too.
    assert.deepEqual(await activity('Druh'), before);
    assert.equal((await reports('Druh')).length, 1);
    assert.equal(await activity('Lider'), null);
    assert.equal((await as('druh', 'POST', '/api/hunts/claim')).data.event.id, 'wounded-woman');
    // Without the party, the leader goes on its own.
    assert.equal((await as('lider', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 30 })).status, 201);
  });

  test('a trip ends in no event: each member\'s report comes at once, so the party sets out again', async () => {
    await withEvent('Lider');
    await withEvent('Druh');
    const went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'windfalls-edge', minutes: 5 });
    assert.equal(went.status, 201, JSON.stringify(went.data).slice(0, 400));
    assert.deepEqual(went.data.went, ['Druh']);
    await age('Lider', 5);
    await age('Druh', 5);
    // The leader's own claim brings its report, no event.
    const own = await as('lider', 'POST', '/api/hunts/claim');
    assert.equal(own.data.event, undefined);
    assert.equal(own.data.report.kind, 'hunt');
    // The member's report is claimed as the party sets out again, and it goes.
    const again = await as('lider', 'POST', '/api/party/hunt', { areaId: 'windfalls-edge', minutes: 5 });
    assert.equal(again.status, 201, JSON.stringify(again.data).slice(0, 400));
    assert.deepEqual(again.data.went, ['Druh']);
    assert.deepEqual(again.data.notes, []);
    assert.equal((await reports('Druh')).length, 2);
    assert.deepEqual(JSON.parse((await activity('Druh')).options).party.names, ['Lider', 'Druh']);
  });
});

// Zdarzenia drużynowe on the server (src/server/party-events.js; the
// author's 844 A, 845 A, 846 A, 847 B and 848, 12.11.2026): the claim of
// the trip leader's report brings the trip's party event, and its choice
// gives every member a report of its own, with its gold, XP and reputation;
// a member's trip report says who chooses, and then what was chosen; the
// event settles itself after 12 hours (the cron), or when the party sets
// out under another leader; an option that gives away a healing potion
// waits for one, and takes it; the party's boon goes on its next trip; and
// a result is never given twice. Each trip's seed is set to one that brings
// the event the test needs.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { partyEventFor, resolvePartyEvent } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const MINUTES = 30;
const texts = content.partyEvents.texts;

// The first trip seed that brings `eventId` (none: no event at all), with
// the outcome `outcomeId` of its option `optionId` when asked.
function seedFor(eventId, { optionId = null, outcomeId = null } = {}) {
  for (let i = 0; i < 20000; i++) {
    const seed = `test-trip-${i}`;
    const event = partyEventFor({ hunt: { result: 'success', minutes: MINUTES }, seed }, content);
    if ((event?.id ?? null) !== eventId) continue;
    if (optionId && resolvePartyEvent({ event, optionId, seed, areaId: 'windfalls-edge', level: 30, leaderId: 0, members: [] }, content).outcome !== outcomeId) continue;
    return seed;
  }
  throw new Error(`no seed for ${eventId}`);
}

function drużyna(vars) {
  const { call, db, signUp, server } = useServer(vars);
  const cookies = {};
  const sql = async (text, ...binds) => (await db()).prepare(text).bind(...binds);
  // A strong level 30 character, not on its first exploration, at full HP.
  const player = async (login, name) => {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await (await sql(`UPDATE characters SET level = 30, class_level = 30, points = '{"strength":150,"vitality":140}', hp_at = 0 WHERE name = ?`, name)).run();
    await (await sql("INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) SELECT id, 'earlier-' || id, 'hunt', 0, '{}', '{}' FROM characters WHERE name = ?", name)).run();
  };
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const row = async (name) => (await sql('SELECT * FROM characters WHERE name = ?', name)).first();
  const activity = async (name) => (await sql('SELECT a.* FROM activities a JOIN characters c ON c.id = a.character_id WHERE c.name = ?', name)).first();
  const reports = async (name) => (await (await sql('SELECT r.id, r.kind, r.activity_key FROM reports r JOIN characters c ON c.id = r.character_id WHERE c.name = ? ORDER BY r.id', name)).all()).results;
  const kept = async () => (await sql('SELECT * FROM party_events')).first();
  const boon = async () => (await (await sql('SELECT boon FROM parties')).first())?.boon ?? null;
  const age = async (name, minutes) =>
    (await sql('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ? WHERE character_id = (SELECT id FROM characters WHERE name = ?)', minutes * 60000, minutes * 60000, name)).run();
  const cron = (at) => server.getWorker().scheduled({ cron: '* * * * *', scheduledTime: new Date(at) });
  // The leader sets out with the party; its trip gets `seed`, and ends.
  const trip = async (seed) => {
    const went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'windfalls-edge', minutes: MINUTES });
    assert.equal(went.status, 201, JSON.stringify(went.data).slice(0, 400));
    assert.deepEqual(went.data.went, ['Druh']);
    await (await sql("UPDATE activities SET options = json_set(options, '$.party.seed', ?) WHERE json_type(options, '$.party.roster') = 'array'", seed)).run();
    await age('Lider', MINUTES);
    await age('Druh', MINUTES);
  };
  return { sql, player, as, row, activity, reports, kept, boon, age, cron, trip, cookies };
}

describe('a Drużyna\'s party event', () => {
  const { sql, player, as, row, activity, reports, kept, boon, cron, trip } = drużyna({ EVENTS: 'on' });

  beforeEach(async () => {
    await player('lider', 'Lider');
    await player('druh', 'Druh');
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
  });

  // The 'party-event' report of a member, as its Dziennik opens it.
  const eventReport = async (login, name) => {
    const own = (await reports(name)).find((one) => one.kind === 'party-event');
    assert.ok(own, `${name} has no party event report`);
    return (await as(login, 'GET', `/api/reports/${own.id}`)).data.report;
  };

  test('the leader\'s claim brings the event; its choice gives every member a report of its own, with gold and reputation', async () => {
    await trip(seedFor('wounded-hunter'));
    const before = { Lider: await row('Lider'), Druh: await row('Druh') };
    const shown = await as('lider', 'POST', '/api/hunts/claim');
    assert.equal(shown.status, 200, JSON.stringify(shown.data).slice(0, 400));
    const { event } = shown.data;
    assert.equal(event.id, 'wounded-hunter');
    assert.equal(event.title, 'Ranny łowca');
    assert.equal(event.note, 'Decydujesz za całą drużynę: Druh.');
    assert.equal(event.land, 'windfalls');
    assert.deepEqual(event.figure, { left: 50, bottom: 0, height: 60 });
    assert.deepEqual(
      event.options.map((option) => [option.id, option.locked ?? null]),
      [
        ['escort', null],
        ['potion', 'brak mikstury leczenia'],
        ['leave', null],
      ],
    );
    // Nothing saved but the event: the trip waits, with no report.
    assert.ok(await activity('Lider'));
    assert.equal((await reports('Lider')).length, 1);
    const waiting = await kept();
    assert.equal(waiting.event_id, 'wounded-hunter');
    assert.equal(waiting.choice, null);
    assert.equal(waiting.leader_name, 'Lider');
    assert.deepEqual(
      JSON.parse(waiting.members).map((one) => one.name),
      ['Lider', 'Druh'],
    );
    assert.equal(waiting.auto_at, waiting.ends_at + 12 * 3600000);
    // An option the event has not.
    assert.equal((await as('lider', 'POST', '/api/hunts/claim', { choice: 'fly' })).data.error.code, 'invalid_choice');

    const chosen = await as('lider', 'POST', '/api/hunts/claim', { choice: 'escort' });
    assert.equal(chosen.status, 200, JSON.stringify(chosen.data).slice(0, 400));
    assert.equal(chosen.data.report.kind, 'hunt');
    const line = 'Zdarzenie drużyny: Ranny łowca. Wybór lidera (Lider): Odprowadzamy go do osady. Wynik jest w osobnym raporcie w Dzienniku.';
    assert.ok(chosen.data.report.system.includes(line), JSON.stringify(chosen.data.report.system));
    const settled = await kept();
    assert.equal(settled.choice, 'escort');
    assert.equal(settled.chosen_by, 'leader');
    assert.equal(settled.applied, 1);
    const result = JSON.parse(settled.result);
    for (const [login, name] of [
      ['lider', 'Lider'],
      ['druh', 'Druh'],
    ]) {
      const report = await eventReport(login, name);
      const id = before[name].id;
      assert.equal(report.kind, 'party-event');
      assert.equal(report.partyEvent.title, 'Zdarzenie drużyny: Ranny łowca');
      assert.equal(report.resultText, 'Lider wybrał: Odprowadzamy go do osady.');
      assert.equal(report.event.option.label, 'Odprowadzamy go do osady');
      assert.ok(report.event.option.text.includes(`(+${result.members[id].gold} złota, +15 reputacji u Bractwa Łowców)`), report.event.option.text);
      assert.ok(result.members[id].gold > 0);
      assert.equal(report.summary.gold, result.members[id].gold);
      assert.deepEqual(report.party, ['Lider', 'Druh']);
      assert.deepEqual(JSON.parse((await row(name)).settlement).reputation, { hunters: 15 });
      // In the Dziennik under its title.
      const listed = (await as(login, 'GET', '/api/reports')).data.reports.find((one) => one.kind === 'party-event');
      assert.equal(listed.partyEvent.title, 'Zdarzenie drużyny: Ranny łowca');
      assert.equal(listed.gold, result.members[id].gold);
    }
    // The leader's gold: its trip's and the event's; the member's, the event's
    // so far (its trip waits for its claim).
    assert.equal((await row('Lider')).gold, before.Lider.gold + chosen.data.report.summary.gold + result.members[before.Lider.id].gold);
    assert.equal((await row('Druh')).gold, before.Druh.gold + result.members[before.Druh.id].gold);
    // The member's trip report says what the leader chose.
    const druh = await as('druh', 'POST', '/api/hunts/claim');
    assert.equal(druh.data.event, undefined);
    assert.ok(druh.data.report.system.includes(line), JSON.stringify(druh.data.report.system));
  });

  test('a member\'s trip report says the leader chooses; the event\'s boon waits for the party\'s next trip', async () => {
    await trip(seedFor('campfire-tales'));
    const druh = await as('druh', 'POST', '/api/hunts/claim');
    assert.equal(druh.data.event, undefined);
    assert.ok(
      druh.data.report.system.includes('Zdarzenie drużyny: Ognisko opowieści. Wybiera lider (Lider). Wynik przyjdzie w osobnym raporcie, najpóźniej 12 godzin po końcu wyprawy.'),
      JSON.stringify(druh.data.report.system),
    );
    assert.equal((await as('lider', 'POST', '/api/hunts/claim')).data.event.id, 'campfire-tales');
    assert.equal((await as('lider', 'POST', '/api/hunts/claim', { choice: 'listen' })).status, 200);
    assert.deepEqual(JSON.parse(await boon()), { xp: 0.1 });
    const report = await eventReport('druh', 'Druh');
    assert.ok(report.event.option.text.startsWith('Opowieści ciągną się do świtu.'));
  });

  test('nobody chose in 12 hours: the cron settles it with the careful option for everyone', async () => {
    await trip(seedFor('wounded-hunter'));
    assert.ok((await as('druh', 'POST', '/api/hunts/claim')).data.report);
    const waiting = await kept();
    await cron(waiting.auto_at - 3600000);
    assert.equal((await kept()).choice, null);
    await cron(waiting.auto_at + 1000);
    const settled = await kept();
    assert.equal(settled.choice, 'escort');
    assert.equal(settled.chosen_by, 'auto');
    assert.equal(settled.applied, 1);
    for (const [login, name] of [
      ['lider', 'Lider'],
      ['druh', 'Druh'],
    ]) {
      const report = await eventReport(login, name);
      assert.equal(report.resultText, 'Lider nie wybrał w ciągu 12 godzin, więc drużyna wybrała najostrożniej: Odprowadzamy go do osady.');
      assert.deepEqual(JSON.parse((await row(name)).settlement).reputation, { hunters: 15 });
    }
    // The leader's own claim brings no event now, only its report, which
    // says so.
    const claim = await as('lider', 'POST', '/api/hunts/claim');
    assert.equal(claim.data.event, undefined);
    assert.ok(
      claim.data.report.system.includes(
        'Zdarzenie drużyny: Ranny łowca. Lider nie wybrał w ciągu 12 godzin, więc drużyna wybrała najostrożniej: Odprowadzamy go do osady. Wynik jest w osobnym raporcie w Dzienniku.',
      ),
      JSON.stringify(claim.data.report.system),
    );
  });

  test('the party setting out under another leader settles the waiting event by itself', async () => {
    await trip(seedFor('wounded-hunter'));
    // The lead passed to the member meanwhile (as when the leader leaves and
    // comes back); the trip's leader is still the one who chose its place.
    await (await sql('UPDATE parties SET leader_id = (SELECT id FROM characters WHERE name = ?)', 'Druh')).run();
    assert.ok((await as('druh', 'POST', '/api/hunts/claim')).data.report);
    const went = await as('druh', 'POST', '/api/party/hunt', { areaId: 'windfalls-edge', minutes: MINUTES });
    assert.equal(went.status, 201, JSON.stringify(went.data).slice(0, 400));
    assert.deepEqual(went.data.went, ['Lider']);
    assert.deepEqual(went.data.notes, []);
    const settled = await kept();
    assert.equal(settled.chosen_by, 'auto');
    // Given by the cron a minute later: the party's start keeps its members
    // as it read them.
    assert.equal(settled.applied, 0);
    await cron(settled.resolved_at + 61000);
    assert.equal((await kept()).applied, 1);
    for (const [login, name] of [
      ['lider', 'Lider'],
      ['druh', 'Druh'],
    ]) {
      const report = await eventReport(login, name);
      assert.equal(report.resultText, 'Lider nie wybrał w ciągu 12 godzin, więc drużyna wybrała najostrożniej: Odprowadzamy go do osady.');
    }
    const list = await reports('Lider');
    assert.deepEqual(
      list.map((one) => one.kind),
      ['hunt', 'hunt', 'party-event'],
    );
    const tripReport = (await as('lider', 'GET', `/api/reports/${list[1].id}`)).data.report;
    assert.ok(tripReport.system.some((one) => one.startsWith('Zdarzenie drużyny: Ranny łowca. Lider nie wybrał w ciągu 12 godzin')), JSON.stringify(tripReport.system));
    assert.equal((await activity('Lider')).kind, 'hunt');
  });

  test('an option that gives away a healing potion waits for one, and takes the best', async () => {
    await trip(seedFor('wounded-hunter'));
    const refused = await as('lider', 'POST', '/api/hunts/claim', { choice: 'potion' });
    assert.equal(refused.status, 409);
    assert.equal(refused.data.error.code, 'no_potion');
    assert.equal(refused.data.error.message, 'Na tę opcję potrzebujesz mikstury leczenia w plecaku.');
    assert.ok(await activity('Lider'));
    await (await sql(`UPDATE characters SET potions = '{"healing":2,"lesser-healing":1}' WHERE name = 'Lider'`)).run();
    const shown = await as('lider', 'POST', '/api/hunts/claim');
    assert.equal(shown.data.event.options.find((option) => option.id === 'potion').locked, undefined);
    const chosen = await as('lider', 'POST', '/api/hunts/claim', { choice: 'potion' });
    assert.equal(chosen.status, 200, JSON.stringify(chosen.data).slice(0, 400));
    assert.deepEqual(JSON.parse((await row('Lider')).potions), { healing: 1, 'lesser-healing': 1 });
    for (const name of ['Lider', 'Druh']) assert.deepEqual(JSON.parse((await row(name)).settlement).reputation, { hunters: 30 });
  });

  test('the party\'s boon goes on its next trip: a shorter wait, and more XP and gold for each', async () => {
    await (await sql(`UPDATE parties SET boon = '{"haste":0.1,"xp":0.1,"gold":0.1}'`)).run();
    const went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'windfalls-edge', minutes: MINUTES });
    assert.equal(went.status, 201, JSON.stringify(went.data).slice(0, 400));
    assert.equal(await boon(), null);
    for (const name of ['Lider', 'Druh']) {
      const trip = await activity(name);
      assert.equal(trip.ends_at - trip.started_at, MINUTES * 60000 * 0.9);
      assert.equal(trip.minutes, MINUTES);
      assert.deepEqual(JSON.parse(trip.options).party.boon, { haste: 0.1, xp: 0.1, gold: 0.1 });
    }
    await (await sql("UPDATE activities SET options = json_set(options, '$.party.seed', ?)", seedFor(null))).run();
    await (await sql('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ?', MINUTES * 60000, MINUTES * 60000)).run();
    for (const login of ['lider', 'druh']) {
      const { report } = (await as(login, 'POST', '/api/hunts/claim')).data;
      assert.equal(report.result, 'success');
      const fights = report.fights.reduce((sum, fight) => sum + fight.xp, 0);
      assert.ok(fights > 0);
      assert.equal(report.summary.xp, Math.round(fights * 1.1));
      for (const line of ['Premia drużyny: ta wyprawa była o 10% krótsza.', 'Premia drużyny: +10% PD z tej wyprawy.', 'Premia drużyny: +10% złota z tej wyprawy.']) {
        assert.ok(report.system.includes(line), JSON.stringify(report.system));
      }
    }
    // Used once: the trip after it goes without.
    assert.equal((await as('lider', 'POST', '/api/party/hunt', { areaId: 'windfalls-edge', minutes: MINUTES })).status, 201);
    assert.equal(JSON.parse((await activity('Lider')).options).party.boon, undefined);
  });

  test('a result is given once: settled again, or given again, nobody gets it twice', async () => {
    await trip(seedFor('rope-bridge', { optionId: 'ford', outcomeId: 'cache' }));
    assert.equal((await as('lider', 'POST', '/api/hunts/claim', { choice: 'ford' })).status, 200);
    assert.ok((await as('druh', 'POST', '/api/hunts/claim')).data.report);
    const settled = await kept();
    const given = { Lider: await row('Lider'), Druh: await row('Druh') };
    const count = { Lider: (await reports('Lider')).length, Druh: (await reports('Druh')).length };
    // Given again by the cron.
    await (await sql('UPDATE party_events SET applied = 0')).run();
    await cron(settled.resolved_at + 120000);
    assert.equal((await kept()).applied, 1);
    // Settled again, as if the result had not been kept: the reports are there.
    await (await sql('UPDATE party_events SET choice = NULL, chosen_by = NULL, result = NULL, resolved_at = NULL, applied = 0')).run();
    await cron(settled.auto_at + 1000);
    for (const name of ['Lider', 'Druh']) {
      const now = await row(name);
      assert.equal(now.gold, given[name].gold);
      assert.equal(now.xp, given[name].xp);
      assert.equal(now.level, given[name].level);
      assert.equal((await reports(name)).length, count[name]);
    }
  });

  test('a loss of HP: the leader at home loses its share of the most HP, the member still on its trip hears its wounds heal on the way', async () => {
    await trip(seedFor('rope-bridge', { optionId: 'run', outcomeId: 'breaks' }));
    const before = await row('Druh');
    assert.equal((await as('lider', 'POST', '/api/hunts/claim', { choice: 'run' })).status, 200);
    const lider = await eventReport('lider', 'Lider');
    const { hpStart, hpEnd, maxHp } = lider.summary;
    const lost = Math.round(maxHp * 0.15);
    assert.equal(hpEnd, hpStart - lost);
    assert.ok(lider.event.option.text.endsWith(`Każdy traci 15% zdrowia. Tracisz ${lost} HP.`), lider.event.option.text);
    assert.equal((await row('Lider')).hp, hpEnd);
    const druh = await eventReport('druh', 'Druh');
    assert.ok(druh.event.option.text.endsWith(texts.busyHp), druh.event.option.text);
    assert.equal(druh.summary.hpEnd, null);
    const after = await row('Druh');
    assert.equal(after.hp, before.hp);
    assert.equal(after.hp_at, before.hp_at);
  });

  test('a fight of the whole party: in every member\'s report, with its own XP, gold and materials, or a faint', async () => {
    await trip(seedFor('smugglers-camp'));
    const before = { Lider: await row('Lider'), Druh: await row('Druh') };
    assert.equal((await as('lider', 'POST', '/api/hunts/claim', { choice: 'attack' })).status, 200);
    const result = JSON.parse((await kept()).result);
    assert.equal(result.kind, 'fight');
    for (const [login, name] of [
      ['lider', 'Lider'],
      ['druh', 'Druh'],
    ]) {
      const report = await eventReport(login, name);
      const share = result.members[before[name].id];
      assert.equal(report.fights.length, 1);
      assert.equal(report.fights[0].event, true);
      assert.equal(report.fights[0].won, result.won);
      assert.deepEqual(
        report.fights[0].allies.map((ally) => ally.name),
        ['Lider', 'Druh'],
      );
      assert.ok(report.fights[0].events.length > 0);
      assert.deepEqual(report.keyFight, { index: 0 });
      assert.equal(report.summary.xp, share.xp);
      const materials = JSON.parse((await row(name)).materials);
      if (result.won === true) {
        assert.equal(report.result, 'success');
        assert.ok(share.xp > 0 && share.gold > 0);
        assert.equal(Object.values(share.materials).reduce((sum, count) => sum + count, 0), 3);
        for (const [key, count] of Object.entries(share.materials)) assert.ok(materials[key] >= count, key);
      } else {
        assert.equal(report.result, result.won === false ? 'fainted' : 'escaped');
        assert.equal(share.xp, 0);
      }
    }
  });

  test('a trip that brings no event claims as ever: no event, no line', async () => {
    await trip(seedFor(null));
    const claim = await as('lider', 'POST', '/api/hunts/claim');
    assert.equal(claim.data.event, undefined);
    assert.ok(!claim.data.report.system.some((line) => line.startsWith(texts.reportTitle)));
    assert.equal(await kept(), null);
  });
});

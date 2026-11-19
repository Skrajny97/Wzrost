// A Drużyna's trip sets out whole or not at all (src/server/parties.js,
// partyHunt). Players, 18.11.2026: the leader's report of a trip won with
// the party, while a member's report of the same trip had it fight alone
// and lose („byłem sam bez drużyny”), and the third member was still away
// when both were back. The cause: each start was written on its own and
// the trip's crew (its seed and roster) after all of them, so a request
// that failed in between (a database error, a request cut off) left the
// explorations already begun with the party's names but no crew. Each was
// then fought from its own seed, with the others beside it only as they set
// out and out for good once fallen (hunts.js: finishHunt without a trip), so
// the reports of one trip went apart, and a member not begun yet stayed
// home. Now the starts and the crew are one batch; one whose character
// changed meanwhile has the party read anew and set out again.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { partyHunt } from '../src/server/parties.js';
import { meanwhile, posted } from './helpers/meanwhile.js';
import { useServer } from './helpers/server.js';

// The database as partyHunt sees it, failing as D1 now and then does (or
// as a request cut off would stop it) at the first batch `when` picks.
function failing(database, when) {
  let due = true;
  const wrap = (statement, sql, binds) => ({
    real: statement,
    sql,
    binds,
    bind: (...values) => wrap(statement.bind(...values), sql, values),
    run: () => statement.run(),
    first: (...column) => statement.first(...column),
    all: () => statement.all(),
    raw: (...options) => statement.raw(...options),
  });
  return {
    prepare: (sql) => wrap(database.prepare(sql), sql, []),
    async batch(statements) {
      if (due && when(statements)) {
        due = false;
        throw new Error('D1_ERROR: Network connection lost.');
      }
      return database.batch(statements.map((statement) => statement?.real ?? statement));
    },
    get failed() {
      return !due;
    },
  };
}

describe("a Drużyna's trip sets out whole or not at all", () => {
  const { call, db, signUp } = useServer();
  const cookies = {};
  const player = async (login, name) => {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare(`UPDATE characters SET level = 30, class_level = 30, points = '{"strength":150,"vitality":140}' WHERE name = ?`).bind(name).run();
  };
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const idOf = async (name) => (await (await db()).prepare('SELECT id FROM characters WHERE name = ?').bind(name).first()).id;
  const hunts = async () =>
    (await (await db()).prepare("SELECT c.name, a.seed, a.options FROM activities a JOIN characters c ON c.id = a.character_id WHERE a.kind = 'hunt' ORDER BY c.name").all()).results.map((row) => ({
      name: row.name,
      seed: row.seed,
      options: JSON.parse(row.options),
    }));
  // Each report's fights as its playback shows them: the foes, the end and
  // who fought beside the character.
  const fights = (report) => report.fights.map((fight) => `${fight.enemies.map((enemy) => `${enemy.monsterId}:${enemy.level}`).join(',')} ${fight.won} [${fight.allies.map((ally) => ally.name).join(',')}]`);
  // The reports of those away now, claimed once the trip of `minutes` is over.
  async function claimAll(minutes) {
    await (await db()).prepare('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ?').bind(minutes * 60000, minutes * 60000).run();
    const reports = {};
    for (const { name } of await hunts()) {
      const claimed = await as(name.toLowerCase(), 'POST', '/api/hunts/claim');
      assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
      reports[name] = claimed.data.report;
    }
    return reports;
  }

  beforeEach(async () => {
    await player('lider', 'Lider');
    await player('druh', 'Druh');
    await player('trzeci', 'Trzeci');
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('lider', 'POST', '/api/party/invite', { name: 'Trzeci' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
    await as('trzeci', 'POST', '/api/party/accept', { partyId: data.party.id });
  });

  test("a failure as the party sets out sends nobody; set out again, every member's report is the trip's", async () => {
    const database = await db();
    const trzeci = await idOf('Trzeci');
    // The database fails as Trzeci's start is written.
    const cut = failing(database, (statements) => statements.some((one) => /INSERT INTO activities/.test(one?.sql ?? '') && one.binds[0] === trzeci));
    await assert.rejects(partyHunt({ request: posted('/api/party/hunt', cookies.lider, { areaId: 'boar-thicket', minutes: 60 }), env: { DB: cut }, now: Date.now() }), /Network connection lost/);
    assert.ok(cut.failed);
    // Whatever set out is one trip, its fights the same in every report.
    // Before the fix the leader and Druh were away with the party's names
    // and no crew, and each report was fought apart: Druh's from its own
    // seed, the others beside it only until they fell.
    const started = await hunts();
    if (started.length > 0) {
      const crewless = started.filter(({ options }) => !(options.party.seed && options.party.roster?.length > 0)).map(({ name }) => name);
      const reports = await claimAll(60);
      for (const [name, report] of Object.entries(reports)) {
        assert.deepEqual(
          fights(report),
          fights(reports.Lider),
          `${name}'s report is not the trip's (${report.result}; set out without the trip's crew: ${crewless.join(', ')}): ${fights(report).join(' | ')}`,
        );
      }
    }
    // Nobody set out, the leader neither, and Trzeci is at home as all are.
    assert.deepEqual(started, []);
    // The leader taps "Wyrusz" again: all three go, one crew in each exploration.
    const went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'boar-thicket', minutes: 60 });
    assert.equal(went.status, 201, JSON.stringify(went.data).slice(0, 300));
    assert.deepEqual(went.data.went, ['Druh', 'Trzeci']);
    const trip = await hunts();
    assert.deepEqual(
      trip.map(({ name }) => name),
      ['Druh', 'Lider', 'Trzeci'],
    );
    for (const { options } of trip) {
      assert.equal(options.party.seed, trip[0].options.party.seed);
      assert.deepEqual(options.party.roster.map((one) => one.name), ['Lider', 'Druh', 'Trzeci']);
      assert.equal(options.partners, undefined);
    }
    // The same fights in every report, each naming the whole party.
    const reports = await claimAll(60);
    assert.ok(reports.Lider.fights.length > 0);
    for (const name of ['Druh', 'Trzeci']) assert.deepEqual(fights(reports[name]), fights(reports.Lider), `${name}'s report`);
    for (const report of Object.values(reports)) assert.deepEqual(report.party, ['Lider', 'Druh', 'Trzeci']);
  });

  test('a member whose character changed as the party set out goes all the same: the party is read anew', async () => {
    const database = await db();
    // Druh's character changes just before the trip is written (its own
    // request at that moment): the start read before no longer holds.
    const racing = meanwhile(database, /INSERT INTO activities/, () => database.prepare("UPDATE characters SET version = version + 1 WHERE name = 'Druh'").run());
    const answer = await partyHunt({ request: posted('/api/party/hunt', cookies.lider, { areaId: 'boar-thicket', minutes: 60 }), env: { DB: racing }, now: Date.now() });
    assert.ok(racing.done);
    assert.equal(answer.status, 201);
    assert.deepEqual((await answer.json()).went, ['Druh', 'Trzeci']);
    for (const { options } of await hunts()) assert.deepEqual(options.party.roster.map((one) => one.name), ['Lider', 'Druh', 'Trzeci']);
  });
});

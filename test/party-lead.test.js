// The hand-over of a Drużyna's lead (src/server/parties.js: handPartyLead;
// the author, 20.11.2026: „Dodaj też opcje przekazania pozycji lidera w
// drużynie”): the leader names a member, who leads from then on, and stays
// in the party as an ordinary member. A trip under way goes on as it set
// out, and the new leader leads from the next one.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { handPartyLead, partyHunt } from '../src/server/parties.js';
import { meanwhile, posted } from './helpers/meanwhile.js';
import { useServer } from './helpers/server.js';

describe('the hand-over of a Drużyna\'s lead', () => {
  const { call, db, signUp } = useServer();
  const cookies = {};

  async function player(login, name) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = 30, class_level = 30 WHERE name = ?').bind(name).run();
  }
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const idOf = async (name) => (await (await db()).prepare('SELECT id FROM characters WHERE name = ?').bind(name).first()).id;
  const leaderName = async () => (await (await db()).prepare('SELECT c.name FROM parties p JOIN characters c ON c.id = p.leader_id').first())?.name;
  const trip = { areaId: 'mossy-boulders', minutes: 30 };

  beforeEach(async () => {
    await player('lider', 'Lider');
    await player('druh', 'Druh');
    await player('trzeci', 'Trzeci');
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
  });

  test('the leader hands the lead to a member and stays in the party as an ordinary one', async () => {
    const handed = await as('lider', 'POST', '/api/party/lead', { characterId: await idOf('Druh') });
    assert.equal(handed.status, 200, JSON.stringify(handed.data));
    assert.equal(handed.data.text, 'Druh prowadzi teraz drużynę.');
    assert.deepEqual(handed.data.party.members.map((one) => [one.name, one.leader, one.own]), [['Lider', false, true], ['Druh', true, false]]);
    assert.equal(await leaderName(), 'Druh');
    const seen = (await as('druh', 'GET', '/api/party')).data.party;
    assert.deepEqual(seen.members.map((one) => [one.name, one.leader]), [['Lider', false], ['Druh', true]]);
  });

  test('refused to one who does not lead, for one not in the party and for the leader itself, with nothing changed', async () => {
    const druh = await idOf('Druh');
    const notLeader = await as('druh', 'POST', '/api/party/lead', { characterId: await idOf('Lider') });
    assert.equal(notLeader.status, 403);
    assert.equal(notLeader.data.error.code, 'not_leader');
    assert.equal(notLeader.data.error.message, 'Przywództwo przekazuje lider.');
    // Out of every party.
    const alone = await as('trzeci', 'POST', '/api/party/lead', { characterId: druh });
    assert.equal(alone.data.error.code, 'not_leader');
    for (const characterId of [await idOf('Trzeci'), 999999, 'Druh', null]) {
      const stranger = await as('lider', 'POST', '/api/party/lead', { characterId });
      assert.equal(stranger.status, 404, String(characterId));
      assert.equal(stranger.data.error.code, 'no_member');
      assert.equal(stranger.data.error.message, 'Tej postaci nie ma w drużynie.');
    }
    const self = await as('lider', 'POST', '/api/party/lead', { characterId: await idOf('Lider') });
    assert.equal(self.status, 400);
    assert.equal(self.data.error.code, 'self');
    assert.equal(self.data.error.message, 'Już prowadzisz tę drużynę.');
    assert.equal(await leaderName(), 'Lider');
  });

  test('a stale page: the old leader is refused once it has handed the lead over, and a member gone meanwhile is not in the party', async () => {
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Trzeci' });
    await as('trzeci', 'POST', '/api/party/accept', { partyId: data.party.id });
    const trzeci = await idOf('Trzeci');
    assert.equal((await as('trzeci', 'POST', '/api/party/leave')).status, 200);
    assert.equal((await as('lider', 'POST', '/api/party/lead', { characterId: trzeci })).data.error.code, 'no_member');
    // Handed over in one card, tapped again in another.
    assert.equal((await as('lider', 'POST', '/api/party/lead', { characterId: await idOf('Druh') })).status, 200);
    const again = await as('lider', 'POST', '/api/party/lead', { characterId: await idOf('Druh') });
    assert.equal(again.status, 403);
    assert.equal(again.data.error.code, 'not_leader');
    assert.equal(await leaderName(), 'Druh');
  });

  test('two hand-overs at once (a double tap): one saves, the other hears the party changed', async () => {
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Trzeci' });
    await as('trzeci', 'POST', '/api/party/accept', { partyId: data.party.id });
    const [druh, trzeci] = [await idOf('Druh'), await idOf('Trzeci')];
    // The first tap's write lands between the second's reading and its own.
    const database = await db();
    const racing = meanwhile(database, /UPDATE parties SET leader_id = \? WHERE id = \? AND leader_id = \?/, () =>
      database.prepare('UPDATE parties SET leader_id = ? WHERE id = ?').bind(druh, data.party.id).run(),
    );
    await assert.rejects(
      handPartyLead({ request: posted('/api/party/lead', cookies.lider, { characterId: trzeci }), env: { DB: racing }, now: Date.now() }),
      (error) => error.status === 409 && error.code === 'changed' && error.message === 'Drużyna zmieniła się w międzyczasie. Spróbuj jeszcze raz.',
    );
    assert.ok(racing.done);
    assert.equal(await leaderName(), 'Druh');
  });

  test('the new leader invites, takes back, removes and sends the party out; the old one no longer does, and is asked before setting out alone', async () => {
    // An invitation the old leader sent stays the party's.
    await as('lider', 'POST', '/api/party/invite', { name: 'Trzeci' });
    assert.equal((await as('lider', 'POST', '/api/party/lead', { characterId: await idOf('Druh') })).status, 200);
    const sent = (await as('druh', 'GET', '/api/party')).data.party.invited;
    assert.deepEqual(sent.map((one) => one.name), ['Trzeci']);
    assert.equal((await as('lider', 'POST', '/api/party/cancel', { characterId: await idOf('Trzeci') })).data.error.code, 'not_leader');
    assert.equal((await as('lider', 'POST', '/api/party/invite', { name: 'Trzeci' })).data.error.code, 'not_leader');
    assert.equal((await as('lider', 'POST', '/api/party/kick', { characterId: await idOf('Druh') })).data.error.code, 'not_leader');
    assert.equal((await as('lider', 'POST', '/api/party/hunt', trip)).data.error.code, 'not_leader');
    const cancelled = await as('druh', 'POST', '/api/party/cancel', { characterId: await idOf('Trzeci') });
    assert.deepEqual(cancelled.data.party.invited, []);
    const invited = await as('druh', 'POST', '/api/party/invite', { name: 'Trzeci' });
    assert.equal(invited.status, 200, JSON.stringify(invited.data));
    // The old leader setting out alone is asked first, as any member
    // (1178 B); the new one is not.
    assert.equal((await as('lider', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).data.error.code, 'in_party');
    const went = await as('druh', 'POST', '/api/party/hunt', trip);
    assert.equal(went.status, 201, JSON.stringify(went.data).slice(0, 300));
    assert.deepEqual(went.data.went, ['Lider']);
    const options = JSON.parse((await (await db()).prepare("SELECT a.options FROM activities a JOIN characters c ON c.id = a.character_id WHERE c.name = 'Lider'").first()).options);
    assert.equal(options.party.leader, 'Druh');
    assert.deepEqual(options.party.roster.map((one) => one.name), ['Druh', 'Lider']);
    // And it may send the old leader out of the party.
    await (await db()).prepare('DELETE FROM activities').run();
    const kicked = await as('druh', 'POST', '/api/party/kick', { characterId: await idOf('Lider') });
    assert.equal(kicked.status, 200, JSON.stringify(kicked.data));
    assert.deepEqual(kicked.data.party.members.map((one) => one.name), ['Druh']);
  });

  test('a trip under way keeps its leader, crew and options; the new leader leads from the next trip', async () => {
    assert.equal((await as('lider', 'POST', '/api/party/hunt', { ...trip, avoidRare: true })).status, 201);
    const read = async () => (await (await db()).prepare('SELECT c.name, a.options, a.seed, a.ends_at FROM activities a JOIN characters c ON c.id = a.character_id ORDER BY c.name').all()).results;
    const before = await read();
    const handed = await as('lider', 'POST', '/api/party/lead', { characterId: await idOf('Druh') });
    assert.equal(handed.status, 200, JSON.stringify(handed.data));
    // Not a word of either exploration changed: the trip's crew, its
    // leader first in its roster, its seed and options.
    assert.deepEqual(await read(), before);
    for (const row of before) {
      const { party } = JSON.parse(row.options);
      assert.equal(party.leader, 'Lider');
      assert.deepEqual(party.roster.map((one) => one.name), ['Lider', 'Druh']);
      assert.equal(party.encounter.avoidRare, true);
    }
    // On the way nobody sends the party out: the new leader is away.
    assert.equal((await as('druh', 'POST', '/api/party/hunt', trip)).data.error.code, 'busy');
    // Back home, the new leader claims its report and sends the party out,
    // the old leader's report claimed for the trip.
    await (await db()).prepare('UPDATE activities SET started_at = started_at - 1800000, ends_at = ends_at - 1800000').run();
    const claimed = await as('druh', 'POST', '/api/hunts/claim');
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
    assert.deepEqual(claimed.data.report.party.sort(), ['Druh', 'Lider']);
    const went = await as('druh', 'POST', '/api/party/hunt', trip);
    assert.equal(went.status, 201, JSON.stringify(went.data).slice(0, 300));
    assert.deepEqual(went.data.went, ['Lider']);
    const next = await read();
    assert.equal(next.length, 2);
    for (const row of next) {
      const { party } = JSON.parse(row.options);
      assert.equal(party.leader, 'Druh');
      assert.deepEqual(party.roster.map((one) => one.name), ['Druh', 'Lider']);
    }
    const reports = (await (await db()).prepare("SELECT COUNT(*) AS count FROM reports r JOIN characters c ON c.id = r.character_id WHERE c.name = 'Lider'").first()).count;
    assert.equal(reports, 1);
  });

  test('a trip the old leader sends out as the lead is handed over does not set out: the party is read anew and the old leader hears it no longer leads', async () => {
    const database = await db();
    const druh = await idOf('Druh');
    const { id } = await database.prepare('SELECT id FROM parties').first();
    const racing = meanwhile(database, /INSERT INTO activities/, () => database.prepare('UPDATE parties SET leader_id = ? WHERE id = ?').bind(druh, id).run());
    await assert.rejects(
      partyHunt({ request: posted('/api/party/hunt', cookies.lider, trip), env: { DB: racing }, now: Date.now() }),
      (error) => error.status === 403 && error.code === 'not_leader',
    );
    assert.ok(racing.done);
    assert.equal((await database.prepare('SELECT COUNT(*) AS count FROM activities').first()).count, 0);
  });
});

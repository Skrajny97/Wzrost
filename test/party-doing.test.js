// What each member of a Drużyna is doing and until when, and whether its
// player is in the game (the author, 25.11.2026, on the report of gracz (poz.
// 120), whose Drużyna said only „na wyprawie” by each member while the
// leader, back home, could take none of them: „powinno być widoczne co robi
// dany gracz z drużyny i dlaczego nie może iść na wyprawę”). The server
// names each busy member's activity (src/server/parties.js, memberDoing),
// and the page says it under the member's name in the Drużyna and in
// brackets in the Walka's line of those who stay home
// (src/client/party-doing.js). A leader who calls itself back from the
// party's trip is home at once, while the others go on with the trip to its
// end (0.0.75, trips.js): the members then say when they are back.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { clockAt, doingText, presenceText } from '../src/client/party-doing.js';
import { dateTimeFormat, timeFormat } from '../src/client/format.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const clock = (at) => timeFormat.format(new Date(at));

describe("a member's words on the page", () => {
  const now = Date.UTC(2026, 10, 25, 11, 59);

  test('what it is doing, with when it is free again', () => {
    const until = now + 32 * MINUTE;
    const at = clock(until);
    assert.equal(doingText({ status: 'free' }, now), 'może iść na wyprawę');
    const trip = { status: 'away', doing: { kind: 'trip', place: 'Smolne Doły', until } };
    assert.equal(doingText(trip, now), `na wyprawie drużyny: Smolne Doły, wróci o ${at}`);
    // The Walka's line leaves the place out.
    assert.equal(doingText(trip, now, { place: false }), `na wyprawie drużyny, wróci o ${at}`);
    assert.equal(doingText({ status: 'away', doing: { kind: 'hunt', place: 'Smolne Doły', until } }, now), `na własnej wyprawie: Smolne Doły, wróci o ${at}`);
    assert.equal(doingText({ status: 'working', doing: { kind: 'work', profession: 'Zielarstwo', until } }, now), `pracuje w profesji Zielarstwo do ${at}`);
    assert.equal(doingText({ status: 'working', doing: { kind: 'work', until } }, now), `pracuje w profesji do ${at}`);
    assert.equal(doingText({ status: 'meditating', doing: { kind: 'cultivation', until } }, now), `medytuje w Kultywacji do ${at}`);
    assert.equal(doingText({ status: 'serving', doing: { kind: 'mercenary', until } }, now), `czeka w Karczmie na werbunek do ${at}`);
    assert.equal(doingText({ status: 'serving', doing: { kind: 'mercenary', hired: true, until } }, now), `na usłudze najemnej do ${at}`);
    assert.equal(doingText({ status: 'serving', doing: { kind: 'mercenary', ended: true } }, now), 'usługa najemna skończona, do zamknięcia w Karczmie');
  });

  test('a time 12 hours away or more has its day too', () => {
    assert.equal(clockAt(now + 11 * HOUR, now), timeFormat.format(new Date(now + 11 * HOUR)));
    assert.equal(clockAt(now + 30 * HOUR, now), dateTimeFormat.format(new Date(now + 30 * HOUR)));
    assert.notEqual(clockAt(now + 30 * HOUR, now), clockAt(now + 6 * HOUR, now));
  });

  test('whether its player is in the game, or since when it is away', () => {
    assert.equal(presenceText({ online: true, seenAt: now }, now), 'w grze');
    assert.equal(presenceText({ online: false, playsOther: true, seenAt: now }, now), 'gra teraz inną postacią');
    assert.equal(presenceText({ online: false, seenAt: now - 25 * MINUTE }, now), 'poza grą od 25 min');
    assert.equal(presenceText({ online: false, seenAt: now - 3 * HOUR }, now), 'poza grą od 3 godz.');
    assert.equal(presenceText({ online: false, seenAt: now - 30 * HOUR }, now), 'poza grą od wczoraj');
    assert.equal(presenceText({ online: false, seenAt: now - 12 * 24 * HOUR }, now), 'poza grą od 12 dni');
    assert.equal(presenceText({ online: false, seenAt: null }, now), null);
  });
});

describe('the Drużyna says what each member is doing', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on' });
  const cookies = {};
  const sql = async (text, ...binds) => (await db()).prepare(text).bind(...binds);
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const activity = async (name) => (await sql('SELECT a.* FROM activities a JOIN characters c ON c.id = a.character_id WHERE c.name = ?', name)).first();
  const member = async (name) => (await as('lider', 'GET', '/api/party')).data.party.members.find((one) => one.name === name);
  // The account of `name` last seen `ago` ms before now.
  const seen = async (name, ago) => (await sql('UPDATE users SET seen_at = ? WHERE id = (SELECT user_id FROM characters WHERE name = ?)', Date.now() - ago, name)).run();
  async function player(login, name) {
    ({ cookie: cookies[login] } = await signUp(login));
    await as(login, 'POST', '/api/character', { name, classId: 'warrior', appearance: 'female' });
    await (await sql('UPDATE characters SET level = 30, class_level = 30 WHERE name = ?', name)).run();
  }
  const join = async (login, name) => {
    const { data } = await as('lider', 'POST', '/api/party/invite', { name });
    assert.equal((await as(login, 'POST', '/api/party/accept', { partyId: data.party.id })).status, 200);
  };

  beforeEach(async () => {
    await player('lider', 'Lider');
    await player('druh', 'Druh');
    await player('trzeci', 'Trzeci');
  });

  test("a profession's work names the profession, a Kultywacja its end; each says whether its player is in the game", async () => {
    await join('druh', 'Druh');
    await join('trzeci', 'Trzeci');
    assert.equal((await as('druh', 'POST', '/api/professions/gather', { herbs: ['comfrey'], minutes: 60 })).status, 201);
    assert.equal((await as('trzeci', 'POST', '/api/cultivation', { minutes: 30 })).status, 201);
    await seen('Druh', 25 * MINUTE);
    await seen('Trzeci', 10000);
    const { members } = (await as('lider', 'GET', '/api/party')).data.party;
    const [lider, druh, trzeci] = members;
    assert.deepEqual([lider.name, lider.status, lider.doing], ['Lider', 'free', undefined]);
    assert.equal(druh.status, 'working');
    assert.deepEqual(druh.doing, { kind: 'work', profession: content.professionsById.herbalism.name, until: (await activity('Druh')).ends_at });
    assert.equal(trzeci.status, 'meditating');
    assert.deepEqual(trzeci.doing, { kind: 'cultivation', until: (await activity('Trzeci')).ends_at });
    // Druh's player away for 25 minutes, Trzeci's in the game.
    assert.deepEqual([druh.online, druh.playsOther], [false, undefined]);
    assert.ok(Math.abs(Date.now() - 25 * MINUTE - druh.seenAt) < MINUTE);
    assert.deepEqual([trzeci.online, trzeci.playsOther], [true, undefined]);
    // A player playing another of its characters now: not in the game with
    // this one, but there (the character set aside goes on the trips all
    // the same, 0.4.59).
    await (await sql("UPDATE characters SET role = 'aside' WHERE name = 'Trzeci'")).run();
    const aside = await member('Trzeci');
    assert.deepEqual([aside.online, aside.playsOther], [false, true]);
    // The Walka's line of those who stay home, as the leader's page says it.
    const now = Date.now();
    assert.equal(doingText(druh, now, { place: false }), `pracuje w profesji Zielarstwo do ${clock(druh.doing.until)}`);
    assert.equal(doingText(trzeci, now, { place: false }), `medytuje w Kultywacji do ${clock(trzeci.doing.until)}`);
    assert.equal(presenceText(druh, now), 'poza grą od 25 min');
  });

  test('a mercenary is no longer „at a profession\'s work”: waiting to be hired, serving, and over with its close waiting in the Karczma', async () => {
    await join('druh', 'Druh');
    const perHour = content.settlement.mercenaries.price.minPerLevel * 30;
    assert.equal((await as('druh', 'POST', '/api/mercenary/offer', { hours: 1, perHour })).status, 200);
    const offered = await member('Druh');
    assert.equal(offered.status, 'serving');
    assert.deepEqual(offered.doing, { kind: 'mercenary', until: (await activity('Druh')).ends_at });
    // Hired by another player: it serves to the end of that exploration.
    await (await sql(`UPDATE activities SET options = json_set(options, '$.hired', json('{"by":1,"name":"Ktoś","area":"Omszałe Głazy","gold":60}')) WHERE kind = 'mercenary'`)).run();
    assert.deepEqual((await member('Druh')).doing, { kind: 'mercenary', hired: true, until: (await activity('Druh')).ends_at });
    // Over: its pay waits in the Karczma for its own player, and until then
    // it stays home.
    await (await sql("UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ? WHERE kind = 'mercenary'", 2 * HOUR, 2 * HOUR)).run();
    const over = await member('Druh');
    assert.equal(over.status, 'serving');
    assert.deepEqual(over.doing, { kind: 'mercenary', hired: true, ended: true });
    const went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'windfalls-edge', minutes: 30 });
    assert.equal(went.data.error.code, 'nobody_free');
    assert.equal((await activity('Druh')).kind, 'mercenary');
  });

  test("a leader called back from the party's trip is home at once; the others go on to its end and say so, one on its own exploration says that", async () => {
    await join('druh', 'Druh');
    // Trzeci out on its own exploration before it joins (since 1178 B a
    // member is asked to leave the party to set out alone).
    assert.equal((await as('trzeci', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 30 })).status, 201);
    await join('trzeci', 'Trzeci');
    const went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'mossy-boulders', minutes: 30 });
    assert.equal(went.status, 201, JSON.stringify(went.data).slice(0, 400));
    assert.deepEqual(went.data.went, ['Druh']);
    const trip = await activity('Druh');
    assert.equal((await activity('Lider')).ends_at, trip.ends_at);
    // The leader calls itself back („Przerwij eksplorację”).
    assert.equal((await as('lider', 'POST', '/api/hunts/cancel')).status, 200);
    assert.equal(await activity('Lider'), null);
    const { members } = (await as('lider', 'GET', '/api/party')).data.party;
    const [lider, druh, trzeci] = members;
    assert.deepEqual([lider.status, lider.doing], ['free', undefined]);
    // Druh goes on with the trip to its end, as it set out.
    assert.equal((await activity('Druh')).ends_at, trip.ends_at);
    assert.equal(druh.status, 'away');
    assert.deepEqual(druh.doing, { kind: 'trip', place: content.areasById['mossy-boulders'].name, until: trip.ends_at });
    assert.deepEqual(trzeci.doing, { kind: 'hunt', place: content.areasById['windfalls-edge'].name, until: (await activity('Trzeci')).ends_at });
    assert.equal(doingText(druh, Date.now()), `na wyprawie drużyny: Omszałe Głazy, wróci o ${clock(trip.ends_at)}`);
    assert.equal(doingText(trzeci, Date.now()), `na własnej wyprawie: Skraj Wiatrołomów, wróci o ${clock(trzeci.doing.until)}`);
    // Both stay home from the next trip, so nobody goes.
    const again = await as('lider', 'POST', '/api/party/hunt', { areaId: 'mossy-boulders', minutes: 30 });
    assert.equal(again.data.error.code, 'nobody_free');
  });
});

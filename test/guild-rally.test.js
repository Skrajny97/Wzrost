// The Róg zbiórki (1199 A; src/engine/guild-strike.js, src/server/guild-rally.js;
// data/guilds.json `rally`): when a rally may start (at once or at a full
// hour up to a day ahead, one a Polish day); through the API the leader or a
// deputy setting it and calling it off, every refusal, the day's one rally,
// the attacks of its hour hitting harder and the card showing who came, the
// day after; and at its start, from the minute's cron, a phone notification
// to every member and the Kronika's line in the guild's chat, while the
// Kronika's lines, which name members, bring no notification.

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, beforeEach, describe, test } from 'node:test';

import { questPeriod, rallyDay, rallySlots, rallyStartAllowed, rallyState } from '../src/engine/index.js';
import { toBase64Url } from '../src/server/encoding.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const HOUR = 3600000;
const DAY = 24 * HOUR;
const rules = content.guilds.rally;
// A Monday at 12:00 in Poland, a week ahead, so the same any day.
const monday = questPeriod('weekly', Date.now() + 7 * DAY, content).startsAt + 12 * HOUR;

describe('when a rally may start', () => {
  test('at once or at a full hour up to a day ahead, not on a day that has its rally', () => {
    const now = monday + 20 * 60000;
    const slots = rallySlots(now, [], content);
    assert.equal(slots[0].at, 'now');
    assert.equal(slots[1].at, monday + HOUR);
    assert.equal(slots.at(-1).at, monday + rules.aheadHours * HOUR);
    assert.equal(slots.length, 1 + rules.aheadHours);
    assert.ok(slots.slice(1).every((slot) => slot.at % HOUR === 0));
    const today = rallyDay(now, content);
    // Today taken: only tomorrow's hours.
    const tomorrowOnly = rallySlots(now, [today], content);
    assert.ok(tomorrowOnly.length > 0 && tomorrowOnly.every((slot) => slot.day !== today && slot.at !== 'now'));
    assert.equal(rallyStartAllowed('now', now, content), true);
    assert.equal(rallyStartAllowed(monday + HOUR, now, content), true);
    assert.equal(rallyStartAllowed(monday + rules.aheadHours * HOUR, now, content), true);
    assert.equal(rallyStartAllowed(monday + (rules.aheadHours + 1) * HOUR, now, content), false);
    assert.equal(rallyStartAllowed(monday, now, content), false);
    assert.equal(rallyStartAllowed(monday + HOUR + 60000, now, content), false);
    assert.equal(rallyStartAllowed('20:00', now, content), false);
    assert.equal(rallyStartAllowed(null, now, content), false);
    // The day is the Polish one of its start.
    const midnight = questPeriod('daily', monday + DAY, content).startsAt;
    assert.notEqual(rallyDay(midnight - 1, content), rallyDay(midnight, content));
    assert.equal(rallyState({ startsAt: 10, endsAt: 20 }, 5), 'planned');
    assert.equal(rallyState({ startsAt: 10, endsAt: 20 }, 10), 'on');
    assert.equal(rallyState({ startsAt: 10, endsAt: 20 }, 20), 'ended');
  });
});

describe('the Róg zbiórki through the API', () => {
  const { server, call, db, signUp } = useServer({ TEST_CLOCK: 'on', PUSH_TEST_HOSTS: '127.0.0.1' });
  const cookies = {};
  let clock = monday;
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const all = async (sql, ...binds) => (await (await db()).prepare(sql).bind(...binds).all()).results;
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body, now: clock });
  const rallyOf = async (login) => (await as(login, 'GET', '/api/guild/beast')).data.strike.rally;
  const set = (login, at) => as(login, 'POST', '/api/guild/rally', { at });
  const cron = (at) => server.getWorker().scheduled({ cron: '* * * * *', scheduledTime: new Date(at) });

  async function player(login, name, classId = 'mage') {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId, appearance: 'female' } });
    await run('UPDATE characters SET level = 40, class_level = 40, gold = 50000 WHERE name = ?', name);
  }

  beforeEach(async () => {
    for (const key of Object.keys(cookies)) delete cookies[key];
    clock = monday;
    await player('liderka', 'Liderka');
    await player('zastepca', 'Zastępca');
    await player('czlonek', 'Członek');
    await as('liderka', 'POST', '/api/guild/found', { name: 'Róg', tag: 'RG' });
    const guildId = (await as('liderka', 'GET', '/api/guild')).data.guild.id;
    for (const [login, name] of [['zastepca', 'Zastępca'], ['czlonek', 'Członek']]) {
      await as('liderka', 'POST', '/api/guild/invite', { name });
      assert.equal((await as(login, 'POST', '/api/guild/accept', { guildId })).status, 200);
    }
    const deputy = (await as('liderka', 'GET', '/api/guild')).data.guild.members.find((member) => member.name === 'Zastępca');
    assert.equal((await as('liderka', 'POST', '/api/guild/role', { characterId: deputy.id, role: 'deputy' })).status, 200);
  });

  test('the leader or a deputy sets the hour; a member may not; one rally a day', async () => {
    const none = await rallyOf('liderka');
    assert.equal(none.current, null);
    assert.equal(none.canSet, true);
    assert.equal(none.slots[0].at, 'now');
    assert.equal(none.percent, 30);
    const member = await rallyOf('czlonek');
    assert.equal(member.canSet, false);
    assert.deepEqual(member.slots, []);
    const refused = await set('czlonek', monday + 6 * HOUR);
    assert.equal(refused.status, 403);
    assert.equal(refused.data.error.code, 'not_allowed');
    for (const at of [monday, monday + 6 * HOUR + 1, monday + 30 * HOUR, 'teraz']) {
      const wrong = await set('liderka', at);
      assert.equal(wrong.status, 400, String(at));
      assert.equal(wrong.data.error.code, 'bad_hour');
    }
    const evening = monday + 8 * HOUR;
    const done = await set('zastepca', evening);
    assert.equal(done.status, 200, JSON.stringify(done.data).slice(0, 300));
    assert.match(done.data.text, /^Zbiórka wyznaczona: dziś o \d\d:00\.$/);
    assert.deepEqual(
      { state: done.data.rally.current.state, startsAt: done.data.rally.current.startsAt, endsAt: done.data.rally.current.endsAt, setBy: done.data.rally.current.setBy },
      { state: 'planned', startsAt: evening, endsAt: evening + rules.minutes * 60000, setBy: 'Zastępca' },
    );
    // The same day again, also as a double tap: refused, the first stays.
    const again = await set('liderka', monday + 9 * HOUR);
    assert.equal(again.status, 409);
    assert.equal(again.data.error.code, 'day_taken');
    assert.equal((await all('SELECT COUNT(*) AS count FROM guild_rallies'))[0].count, 1);
    // Tomorrow's hours are still free.
    const free = (await rallyOf('liderka')).slots;
    assert.ok(free.every((slot) => slot.day !== rallyDay(clock, content)));
    // A member sees it set, without the controls.
    const seen = await rallyOf('czlonek');
    assert.equal(seen.current.state, 'planned');
    assert.equal(seen.canSet, false);
  });

  test('calling off: only before the start, by the leader or a deputy', async () => {
    const at = monday + 3 * HOUR;
    const { rally } = (await set('liderka', at)).data;
    assert.equal((await as('czlonek', 'POST', '/api/guild/rally/cancel', { id: rally.current.id })).status, 403);
    assert.equal((await as('liderka', 'POST', '/api/guild/rally/cancel', { id: 999 })).data.error.code, 'gone');
    const called = await as('zastepca', 'POST', '/api/guild/rally/cancel', { id: rally.current.id });
    assert.equal(called.status, 200);
    assert.equal(called.data.text, 'Zbiórka odwołana.');
    assert.equal(called.data.rally.current, null);
    // A double tap finds it gone.
    assert.equal((await as('zastepca', 'POST', '/api/guild/rally/cancel', { id: rally.current.id })).data.error.code, 'gone');
    // The day is free again; a rally started cannot be called off.
    const { rally: next } = (await set('liderka', 'now')).data;
    assert.equal(next.current.state, 'on');
    const started = await as('liderka', 'POST', '/api/guild/rally/cancel', { id: next.current.id });
    assert.equal(started.status, 409);
    assert.equal(started.data.error.code, 'started');
  });

  test('during its hour the attacks hit harder and the card shows who came; after it, today\'s rally with who came', async () => {
    const at = monday + HOUR;
    await set('liderka', at);
    // Before it: no bonus.
    const before = await as('czlonek', 'POST', '/api/guild/beast/attack');
    assert.equal(before.data.attack.boosts.rally, false);
    clock = at + 10 * 60000;
    const during = await as('czlonek', 'POST', '/api/guild/beast/attack');
    assert.equal(during.status, 200, JSON.stringify(during.data).slice(0, 300));
    assert.equal(during.data.attack.boosts.rally, true);
    assert.match(during.data.attack.boostsText, /zbiórka \+30%/);
    clock = at + 20 * 60000;
    await as('zastepca', 'POST', '/api/guild/beast/attack', { kind: 'undercut' });
    const on = await rallyOf('liderka');
    assert.equal(on.current.state, 'on');
    assert.deepEqual(on.current.came, ['Członek', 'Zastępca']);
    // The Kronika told its start, once, at the first look after it.
    const told = await all("SELECT text FROM chat_messages WHERE chronicle_key LIKE 'rally:%'");
    assert.equal(told.length, 1);
    assert.match(told[0].text, /^Róg zbiórki! Do \d\d:00 ataki na Bestię i strażnika biją o 30% mocniej\.$/);
    // After its hour: no bonus, and the card shows today's rally ended.
    clock = at + rules.minutes * 60000 + 1;
    const late = await as('liderka', 'POST', '/api/guild/beast/attack');
    assert.equal(late.data.attack.boosts.rally, false);
    const ended = await rallyOf('liderka');
    assert.equal(ended.current, null);
    assert.deepEqual(ended.ended.came, ['Członek', 'Zastępca']);
    assert.ok(ended.slots.every((slot) => slot.at !== 'now'));
    // The next day: a new rally may be set, and yesterday's is gone from the card.
    clock = monday + DAY;
    const tomorrow = await rallyOf('liderka');
    assert.equal(tomorrow.ended, null);
    assert.equal(tomorrow.slots[0].at, 'now');
  });

  test('at its start every member\'s phone hears it and the chat gets the line; the Kronika\'s lines bring no notification', async () => {
    const received = [];
    const http = createServer(async (request, response) => {
      for await (const _ of request);
      received.push(request.url);
      response.writeHead(201);
      response.end();
    });
    await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));
    after(() => http.close());
    const base = `http://127.0.0.1:${http.address().port}`;
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const key = toBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
    for (const login of ['liderka', 'zastepca', 'czlonek']) {
      const subscription = { endpoint: `${base}/push/${login}`, expirationTime: null, keys: { p256dh: key, auth: toBase64Url(crypto.getRandomValues(new Uint8Array(16))) } };
      assert.equal((await as(login, 'POST', '/api/push/subscribe', subscription)).status, 200);
    }
    const at = monday + 2 * HOUR;
    await set('liderka', at);
    await cron(at - 30000);
    assert.deepEqual(received, []);
    await cron(at + 30000);
    assert.deepEqual(received.sort(), ['/push/czlonek', '/push/liderka', '/push/zastepca']);
    // The cron wrote the Kronika's line, once.
    assert.equal((await all("SELECT COUNT(*) AS count FROM chat_messages WHERE chronicle_key LIKE 'rally:%'"))[0].count, 1);
    await cron(at + 90000);
    assert.equal((await all("SELECT COUNT(*) AS count FROM chat_messages WHERE chronicle_key LIKE 'rally:%'"))[0].count, 1);
    assert.equal(received.length, 3);
    // A Kronika line naming a member (the beast's fall) wakes no phone.
    received.length = 0;
    clock = at + 5 * 60000;
    await rallyOf('czlonek');
    await run('UPDATE guild_beasts SET hp = 2');
    const felled = await as('czlonek', 'POST', '/api/guild/beast/attack');
    assert.equal(felled.data.attack.fell, true);
    assert.equal((await all("SELECT COUNT(*) AS count FROM chat_messages WHERE chronicle_key LIKE 'beast:%'"))[0].count, 1);
    assert.equal((await all('SELECT COUNT(*) AS count FROM chat_mentions'))[0].count, 0);
    await cron(clock + 30000);
    assert.deepEqual(received, []);
  });
});

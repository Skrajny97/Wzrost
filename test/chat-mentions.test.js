// Tagging in the chat (634 A: "Potrzebujemy tez funkcji oznaczania na
// czacie"): "@" and a character's whole name tags it, when it reads the
// channel, never the writer and never one who hides the writer; the tag is
// kept, gilds the message for the one tagged, lights the channel until it
// is read there, goes to the phone at most once a while from the same
// writer, and goes with its message and its characters. Moderation, the
// rules and the wait between messages stay as they were: a refused message
// tags nobody.

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, beforeEach, describe, test } from 'node:test';

import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';
import { toBase64Url } from '../src/server/encoding.js';

const pushService = await fakePushService();
after(() => pushService.close());

const AGREEMENT = { name: 'ECDH', namedCurve: 'P-256' };
const text = (value) => new TextEncoder().encode(value);

// A push service on this machine: it keeps what it gets.
async function fakePushService() {
  const received = [];
  const http = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received.push({ path: request.url, headers: request.headers, body: new Uint8Array(Buffer.concat(chunks)) });
    response.writeHead(201);
    response.end();
  });
  await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));
  return { received, url: `http://127.0.0.1:${http.address().port}`, close: () => http.close() };
}

function concat(...parts) {
  const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    joined.set(part, at);
    at += part.length;
  }
  return joined;
}

async function hkdf(salt, input, info, bytes) {
  const key = await crypto.subtle.importKey('raw', input, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

// A phone with its subscription keys, which reads what is sent to it
// (RFC 8291, as in push.test.js).
async function fakePhone(path) {
  const pair = await crypto.subtle.generateKey(AGREEMENT, true, ['deriveBits']);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const phoneKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return {
    subscription: { endpoint: `${pushService.url}${path}`, expirationTime: null, keys: { p256dh: toBase64Url(phoneKey), auth: toBase64Url(auth) } },
    async read(body) {
      const salt = body.slice(0, 16);
      const serverKey = body.slice(21, 21 + body[20]);
      const server = await crypto.subtle.importKey('raw', serverKey, AGREEMENT, false, []);
      const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: server }, pair.privateKey, 256));
      const secret = await hkdf(auth, shared, concat(text('WebPush: info\0'), phoneKey, serverKey), 32);
      const key = await crypto.subtle.importKey('raw', await hkdf(salt, secret, text('Content-Encoding: aes128gcm\0'), 16), 'AES-GCM', false, ['decrypt']);
      const nonce = await hkdf(salt, secret, text('Content-Encoding: nonce\0'), 12);
      const record = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, body.slice(21 + body[20])));
      return JSON.parse(new TextDecoder().decode(record.slice(0, -1)));
    },
  };
}

describe('Oznaczanie na czacie', () => {
  const { server, call, db, signUp } = useServer({ AUTHOR_LOGINS: 'szef', PUSH_TEST_HOSTS: '127.0.0.1' });

  // An account with a character at `level`, the chat's rules accepted
  // unless `rules` is false.
  async function player(login, { name = login, level = 5, rules = true, appearance = 'female', gold = null } = {}) {
    const { cookie } = await signUp(login);
    const made = await call('POST', '/api/character', { cookie, body: { name, classId: 'mage', appearance } });
    assert.equal(made.status, 201, JSON.stringify(made.data));
    await (await db()).prepare('UPDATE characters SET level = ?, gold = COALESCE(?, gold) WHERE name = ?').bind(level, gold, name).run();
    if (rules) await call('POST', '/api/chat/rules', { cookie });
    return cookie;
  }
  // The author's account, bound to Google as the author's must be.
  async function admin() {
    const cookie = await player('szef');
    await (await db()).prepare("UPDATE users SET google_sub = 'szef' WHERE login = 'szef'").run();
    return cookie;
  }
  const send = (cookie, words, channel = 'global') => call('POST', '/api/chat', { cookie, body: { channel, text: words } });
  const whisper = (cookie, to, words) => call('POST', '/api/chat', { cookie, body: { with: to, text: words } });
  const read = async (cookie, channel = 'global') => (await call('GET', `/api/chat?channel=${channel}`, { cookie })).data;
  const latest = async (cookie) => (await call('GET', '/api/chat/latest', { cookie })).data;
  const idOf = async (name) => (await (await db()).prepare('SELECT id FROM characters WHERE name = ?').bind(name).first()).id;
  // Moves every message `seconds` into the past, past the wait between messages.
  const age = async (seconds = 10) => (await db()).prepare('UPDATE chat_messages SET created_at = created_at - ?').bind(seconds * 1000).run();
  const tags = async () =>
    (await (await db()).prepare('SELECT x.written, x.push, c.name FROM chat_mentions x JOIN characters c ON c.id = x.character_id ORDER BY x.message_id, x.character_id').all()).results;

  const players = {};
  beforeEach(async () => {
    pushService.received.length = 0;
    players.ala = await player('ala', { name: 'Ala' });
    players.ola = await player('ola', { name: 'Ola' });
    players.ewa = await player('ewa', { name: 'Ewa' });
  });

  test('a tag is kept, and the message shows gilded to the one it tags only', async () => {
    const iza = await player('iza', { name: 'Iza' });
    const sent = await send(players.ala, 'Cześć @Ola i @ewa, gdzie jest @Nikt?');
    assert.equal(sent.status, 201);
    // The writer sees the names its message tags, as written.
    assert.deepEqual([sent.data.message.mentions, sent.data.message.mentioned], [['Ola', 'ewa'], undefined]);
    // A tag in the Globalny goes to no phone (19.11.2026).
    assert.deepEqual(await tags(), [
      { written: 'Ola', push: 0, name: 'Ola' },
      { written: 'ewa', push: 0, name: 'Ewa' },
    ]);
    const seenBy = async (cookie) => (await read(cookie)).messages.map(({ mentions, mentioned }) => [mentions, mentioned]);
    assert.deepEqual(await seenBy(players.ola), [[['Ola', 'ewa'], true]]);
    assert.deepEqual(await seenBy(players.ewa), [[['Ola', 'ewa'], true]]);
    assert.deepEqual(await seenBy(iza), [[['Ola', 'ewa'], undefined]]);
    assert.deepEqual(await seenBy(players.ala), [[['Ola', 'ewa'], undefined]]);
    // A message without a whole name after "@" tags nobody.
    await age();
    const plain = await send(players.ala, 'Napisz na ala@ola albo @Olaf');
    assert.deepEqual([plain.data.message.mentions, plain.data.message.mentioned], [undefined, undefined]);
    assert.equal((await tags()).length, 2);
  });

  test('names with spaces, hyphens and Polish letters, whatever the case; the longest name there is wins', async () => {
    const anna = await player('anna', { name: 'Anna' });
    const annaMaria = await player('annam', { name: 'Anna Maria' });
    const lucja = await player('lucja', { name: 'Łucja-Żaneta' });
    const sent = await send(players.ala, '@anna maria i @ŁUCJA-ŻANETA, a @Anna Mar?');
    assert.deepEqual(sent.data.message.mentions, ['anna maria', 'ŁUCJA-ŻANETA', 'Anna']);
    for (const cookie of [anna, annaMaria, lucja]) assert.equal((await read(cookie)).messages[0].mentioned, true);
    // At most mentions.perMessage characters in one message, the first ones.
    await player('iza', { name: 'Iza' });
    await age();
    const many = await send(players.ala, '@Anna @Anna Maria @Łucja-Żaneta @Ola @Ewa i @Iza');
    assert.equal(content.chat.mentions.perMessage, 5);
    assert.deepEqual(many.data.message.mentions, ['Anna', 'Anna Maria', 'Łucja-Żaneta', 'Ola', 'Ewa']);
  });

  test('the channel lights until the tagged character has read it there, on any device, the Wymiana too', async () => {
    const { message } = (await send(players.ala, 'Hej @Ola')).data;
    let news = await latest(players.ola);
    assert.deepEqual([news.mentions.global, news.seen.global], [message.id, 0]);
    // The writer's own message lights nothing for it.
    assert.equal((await latest(players.ala)).mentions.global, 0);
    await call('POST', '/api/chat/seen', { cookie: players.ola, body: { global: message.id } });
    news = await latest(players.ola);
    assert.ok(news.seen.global >= news.mentions.global);
    // The Wymiana lights for a tag only, with a mark of its own.
    await age();
    const offer = (await send(players.ala, '@Ola mam dla Ciebie amulet', 'trade')).data.message;
    news = await latest(players.ola);
    assert.deepEqual([news.mentions.trade, news.seen.trade, news.latest], [offer.id, 0, message.id]);
    await call('POST', '/api/chat/seen', { cookie: players.ola, body: { trade: offer.id } });
    news = await latest(players.ola);
    assert.deepEqual([news.seen.trade, news.seen.global], [offer.id, message.id]);
    // Taken down by the moderation, or its writer hidden, a tag lights no more.
    await age();
    const again = (await send(players.ala, '@Ola halo?')).data.message;
    assert.equal((await latest(players.ola)).mentions.global, again.id);
    const author = await admin();
    await call('POST', '/api/chat/moderate', { cookie: author, body: { messageId: again.id, action: 'hide' } });
    assert.equal((await latest(players.ola)).mentions.global, message.id);
    assert.deepEqual((await read(players.ola)).messages.map(({ id }) => id), [message.id]);
    await call('POST', '/api/chat/block', { cookie: players.ola, body: { messageId: message.id } });
    news = await latest(players.ola);
    assert.deepEqual([news.mentions.global, news.mentions.trade], [0, 0]);
  });

  // The author, 15.11.2026: „Niech oznaczanie na czacie będzie możliwe też
  // po nazwie konta”.
  test('an account\'s name tags the character it plays now, whatever the case; with its character\'s name too, once', async () => {
    await (await db()).prepare("UPDATE users SET account_name = 'Wędrowiec', account_name_key = 'wędrowiec' WHERE login = 'ola'").run();
    const sent = await send(players.ala, 'Hej @wędrowiec, co słychać?');
    assert.equal(sent.status, 201);
    assert.deepEqual(sent.data.message.mentions, ['wędrowiec']);
    assert.deepEqual(await tags(), [{ written: 'wędrowiec', push: 0, name: 'Ola' }]);
    assert.equal((await read(players.ola)).messages[0].mentioned, true);
    assert.equal((await read(players.ewa)).messages[0].mentioned, undefined);
    // By the account's name and the character's name in one message: one tag.
    await age();
    const both = await send(players.ewa, '@Wędrowiec albo @Ola, zagramy?');
    assert.deepEqual(both.data.message.mentions, ['Wędrowiec']);
    assert.equal((await tags()).length, 2);
    // An account's name never tags its own writer.
    await age();
    const own = await send(players.ola, 'To ja, @Wędrowiec');
    assert.deepEqual([own.data.message.mentions, (await tags()).length], [undefined, 2]);
  });

  test('only those who read the channel: the guild\'s members, the two of a private conversation, characters with the Społeczność', async () => {
    const database = await db();
    await database.prepare("UPDATE characters SET level = 30, gold = 5000 WHERE name = 'Ala'").run();
    const founded = await call('POST', '/api/guild/found', { cookie: players.ala, body: { name: 'Leśni Bracia', tag: 'LB' } });
    assert.equal(founded.status, 200, JSON.stringify(founded.data));
    const anna = await player('anna', { name: 'Anna' });
    await player('annam', { name: 'Anna Maria' });
    for (const [cookie, name] of [
      [players.ola, 'Ola'],
      [anna, 'Anna'],
    ]) {
      await call('POST', '/api/guild/invite', { cookie: players.ala, body: { name } });
      assert.equal((await call('POST', '/api/guild/accept', { cookie, body: { guildId: founded.data.guild.id } })).status, 200);
    }
    // Anna Maria is not in the guild: her name tags nobody there, not Anna.
    const inGuild = await send(players.ala, '@Ola, @Ewa i @Anna Maria', 'guild');
    assert.equal(inGuild.status, 201, JSON.stringify(inGuild.data));
    assert.deepEqual(inGuild.data.message.mentions, ['Ola']);
    assert.equal((await latest(players.ola)).mentions.guild, inGuild.data.message.id);
    assert.equal((await latest(players.ewa)).mentions.guild, 0);
    assert.equal((await latest(anna)).mentions.guild, 0);
    // A private conversation tags only its other one.
    await age();
    const secret = await whisper(players.ala, await idOf('Ewa'), '@Ewa, a @Ola nie wie');
    assert.deepEqual(secret.data.message.mentions, ['Ewa']);
    assert.deepEqual((await latest(players.ewa)).mentions.private, { [await idOf('Ala')]: secret.data.message.id });
    assert.deepEqual((await latest(players.ola)).mentions.private, {});
    // A character without the Społeczność yet reads no chat.
    await player('mala', { name: 'Mała', level: content.unlocksById.community.level - 1 });
    await age();
    assert.equal((await send(players.ala, '@Mała hej')).data.message.mentions, undefined);
    // Out of the guild, its channel's tags light no more.
    assert.equal((await call('POST', '/api/guild/leave', { cookie: players.ola })).status, 200);
    assert.equal((await latest(players.ola)).mentions.guild, 0);
  });

  test('never the writer, its account\'s other characters, nor one who hides the writer', async () => {
    assert.equal((await send(players.ala, '@Ala, to ja')).data.message.mentions, undefined);
    // Ala's account plays Alicja now; Ala waits aside.
    await call('POST', '/api/character', { cookie: players.ala, body: { name: 'Alicja', classId: 'mage', appearance: 'female' } });
    await (await db()).prepare("UPDATE characters SET level = 5 WHERE name = 'Alicja'").run();
    await age();
    const own = await send(players.ala, '@Ala, wróć');
    assert.equal(own.data.message.mentions, undefined);
    // Ola hides the account: its characters tag her no more.
    await call('POST', '/api/chat/block', { cookie: players.ola, body: { messageId: own.data.message.id } });
    await age();
    assert.deepEqual((await send(players.ala, '@Ola i @Ewa')).data.message.mentions, ['Ewa']);
    assert.deepEqual((await tags()).map(({ name }) => name), ['Ewa']);
  });

  test('a refused message tags nobody: rules not accepted, a silenced account, too fast, a link', async () => {
    const newcomer = await player('nowa', { name: 'Nowa', rules: false });
    assert.equal((await send(newcomer, '@Ola hej')).data.error.code, 'rules');
    await (await db()).prepare("UPDATE users SET chat_muted_until = ? WHERE login = 'ala'").bind(Date.now() + 3600000).run();
    assert.equal((await send(players.ala, '@Ola hej')).data.error.code, 'muted');
    await (await db()).prepare("UPDATE users SET chat_muted_until = NULL WHERE login = 'ala'").run();
    assert.equal((await send(players.ala, '@Ola raz')).status, 201);
    assert.equal((await send(players.ala, '@Ola dwa')).data.error.code, 'too_fast');
    await age();
    assert.equal((await send(players.ala, '@Ola, wejdź na gra.pl')).data.error.code, 'link');
    assert.deepEqual((await tags()).map(({ written }) => written), ['Ola']);
  });

  test('the suggestions: the friends and the guild\'s members, without the player\'s own characters', async () => {
    await call('POST', '/api/friends/invite', { cookie: players.ala, body: { name: 'Ola' } });
    const invitation = (await call('GET', '/api/friends', { cookie: players.ola })).data.incoming[0];
    await call('POST', '/api/friends/accept', { cookie: players.ola, body: { id: invitation.id } });
    const people = (await call('GET', '/api/chat/people', { cookie: players.ala })).data;
    assert.deepEqual(people, { friends: [{ id: await idOf('Ola'), name: 'Ola', classId: 'mage' }], guild: [] });
    const young = await player('mlody', { name: 'Młody', level: 4 });
    assert.equal((await call('GET', '/api/chat/people', { cookie: young })).data.error.code, 'locked');
  });

  test('a tag goes with its message, trimmed or removed, and with its characters', async () => {
    const database = await db();
    await send(players.ala, '@Ola i @Ewa');
    assert.equal((await tags()).length, 2);
    assert.equal((await call('DELETE', '/api/character', { cookie: players.ola })).status, 200);
    assert.deepEqual((await tags()).map(({ name }) => name), ['Ewa']);
    // The channel keeps its last messages: an old one goes with its tags.
    const user = await database.prepare("SELECT u.id AS user_id, c.id AS character_id FROM users u JOIN characters c ON c.user_id = u.id WHERE u.login = 'ewa'").first();
    const { keep } = content.chat.rules;
    await database.batch(
      Array.from({ length: keep + 5 }, (_, i) =>
        database
          .prepare("INSERT INTO chat_messages (channel, user_id, character_id, name, level, class_id, text, created_at) VALUES ('global', ?, ?, 'Ewa', 5, 'mage', ?, 0)")
          .bind(user.user_id, user.character_id, `Wiadomość ${i}`),
      ),
    );
    await age();
    await send(players.ala, 'Ostatnia');
    assert.deepEqual(await tags(), []);
    // The writer's character removed, its messages and their tags go too.
    await age();
    await send(players.ala, '@Ewa jeszcze raz');
    assert.equal((await tags()).length, 1);
    assert.equal((await call('DELETE', '/api/character', { cookie: players.ala })).status, 200);
    assert.deepEqual(await tags(), []);
  });

  test('a tag reaches the phone only from a guild\'s channel: once a while from the same writer, not once read, taken down or out of the guild', async () => {
    const database = await db();
    const phone = await fakePhone('/push/ola');
    assert.equal((await call('POST', '/api/push/subscribe', { cookie: players.ola, body: phone.subscription })).status, 200);
    const run = (at) => server.getWorker().scheduled({ cron: '* * * * *', scheduledTime: new Date(at) });
    // Each tag in the next minute's window, as if made then.
    let clock = Date.now() + 30000;
    async function deliver(...messageIds) {
      const before = pushService.received.length;
      for (const messageId of messageIds) await database.prepare('UPDATE chat_mentions SET created_at = ? WHERE message_id = ?').bind(clock + 10000, messageId).run();
      clock += 30000;
      await run(clock);
      return Promise.all(pushService.received.slice(before).map((message) => phone.read(message.body)));
    }
    // A pause longer than the window between one writer's tags (deliver
    // moves a tag minutes ahead, so the pause goes back further still).
    const pause = () => database.prepare('UPDATE chat_mentions SET created_at = created_at - ?').bind((content.chat.mentions.pushEveryMinutes + 15) * 60000).run();
    const alaId = await idOf('Ala');

    // The Globalny and the Wymiana: no phone (the author, 19.11.2026:
    // „wyłącz powiadomienia przy oznaczaniu na ogólnym czacie”).
    const loud = (await send(players.ala, '@Ola, idziesz z nami do Wieży?')).data.message;
    await age();
    const offer = (await send(players.ala, '@Ola mam amulet', 'trade')).data.message;
    assert.deepEqual((await tags()).map(({ push }) => push), [0, 0]);
    assert.deepEqual(await deliver(loud.id, offer.id), []);

    // The guild's channel: the first tag, and no other from the same writer
    // within the window.
    await database.prepare("UPDATE characters SET level = 30, gold = 5000 WHERE name = 'Ala'").run();
    const founded = await call('POST', '/api/guild/found', { cookie: players.ala, body: { name: 'Leśni Bracia', tag: 'LB' } });
    await call('POST', '/api/guild/invite', { cookie: players.ala, body: { name: 'Ola' } });
    assert.equal((await call('POST', '/api/guild/accept', { cookie: players.ola, body: { guildId: founded.data.guild.id } })).status, 200);
    await age();
    const long = '@Ola, zbiórka przy Bestii, czekamy przy Ognisku od samego rana i nikt nie wie, kiedy wrócisz z wyprawy';
    const { pushLength } = content.chat.mentions;
    assert.ok(long.length > pushLength);
    const rally = (await send(players.ala, long, 'guild')).data.message;
    await age();
    const again = (await send(players.ala, '@Ola słyszysz?', 'guild')).data.message;
    assert.deepEqual((await tags()).slice(-2).map(({ push }) => push), [1, 0]);
    assert.deepEqual(
      (await deliver(rally.id, again.id)).map(({ title, body, url, tag }) => [title, body, url, tag]),
      [['Czat: Gildia', `Ala oznaczyła Cię na czacie: ${long.slice(0, pushLength - 1).trimEnd()}…`, '#/czat', `mention-${alaId}`]],
    );
    // Not twice.
    clock += 60000;
    await run(clock);
    assert.equal(pushService.received.length, 1);

    // Past the window it sends one again: unless the character has read it,
    // the moderation took it down, or the character left the guild.
    await pause();
    await age();
    const seen = (await send(players.ala, '@Ola, już jesteś?', 'guild')).data.message;
    await call('POST', '/api/chat/seen', { cookie: players.ola, body: { guild: seen.id } });
    assert.deepEqual(await deliver(seen.id), []);
    await pause();
    await age();
    const hidden = (await send(players.ala, '@Ola coś brzydkiego', 'guild')).data.message;
    await call('POST', '/api/chat/moderate', { cookie: await admin(), body: { messageId: hidden.id, action: 'hide' } });
    assert.deepEqual(await deliver(hidden.id), []);
    await pause();
    await age();
    const late = (await send(players.ala, '@Ola gdzie jesteś?', 'guild')).data.message;
    assert.equal((await tags()).at(-1).push, 1);
    assert.equal((await call('POST', '/api/guild/leave', { cookie: players.ola })).status, 200);
    assert.deepEqual(await deliver(late.id), []);
  });

  // The author, 19.11.2026: „włącz powiadomienia jak ktoś napisze prywatną
  // wiadomość na czacie”.
  test('a private message reaches the phone: the first of a talk, and not once read, taken down or from a hidden writer', async () => {
    const database = await db();
    const olek = await player('olek', { name: 'Olek', appearance: 'male' });
    const phone = await fakePhone('/push/ola');
    assert.equal((await call('POST', '/api/push/subscribe', { cookie: players.ola, body: phone.subscription })).status, 200);
    const run = (at) => server.getWorker().scheduled({ cron: '* * * * *', scheduledTime: new Date(at) });
    const [alaId, olaId, olekId] = [await idOf('Ala'), await idOf('Ola'), await idOf('Olek')];
    let clock = Date.now() + 30000;
    async function deliver(messageId) {
      const before = pushService.received.length;
      await database.prepare('UPDATE chat_messages SET created_at = ? WHERE id = ?').bind(clock + 10000, messageId).run();
      clock += 30000;
      await run(clock);
      return Promise.all(pushService.received.slice(before).map((message) => phone.read(message.body)));
    }
    // A pause longer than the window between one writer's messages.
    const pause = () => database.prepare('UPDATE chat_messages SET created_at = created_at - ?').bind((content.chat.mentions.pushEveryMinutes + 1) * 60000).run();

    // A talk wakes the phone once a writer: Ala's second line sends nothing.
    await whisper(players.ala, olaId, 'Hej, masz chwilę?');
    await age();
    await whisper(players.ala, olaId, 'Pomożesz mi w Wieży?');
    await whisper(olek, olaId, 'Cześć Ola');
    await run(clock);
    const shown = await Promise.all(pushService.received.map((message) => phone.read(message.body)));
    assert.deepEqual(
      shown.map(({ title, body, url, tag }) => [title, body, url, tag]).sort(),
      [
        ['Czat: prywatna rozmowa', 'Ala napisała do Ciebie: Hej, masz chwilę?', '#/czat', `private-${alaId}`],
        ['Czat: prywatna rozmowa', 'Olek napisał do Ciebie: Cześć Ola', '#/czat', `private-${olekId}`],
      ].sort(),
    );
    // Not twice.
    clock += 60000;
    await run(clock);
    assert.equal(pushService.received.length, 2);

    // After a pause, again; a tag in it sends no notification of its own.
    await pause();
    await age();
    const tagged = (await whisper(players.ala, olaId, '@Ola tylko dla Ciebie')).data.message;
    assert.equal((await tags()).at(-1).push, 0);
    assert.deepEqual((await deliver(tagged.id)).map(({ body }) => body), ['Ala napisała do Ciebie: @Ola tylko dla Ciebie']);
    // Not once read, taken down, or from a writer the character hides.
    await pause();
    await age();
    const seen = (await whisper(players.ala, olaId, 'Jesteś?')).data.message;
    await call('POST', '/api/chat/seen', { cookie: players.ola, body: { with: alaId, id: seen.id } });
    assert.deepEqual(await deliver(seen.id), []);
    await pause();
    await age();
    const hidden = (await whisper(players.ala, olaId, 'Coś brzydkiego')).data.message;
    await call('POST', '/api/chat/moderate', { cookie: await admin(), body: { messageId: hidden.id, action: 'hide' } });
    assert.deepEqual(await deliver(hidden.id), []);
    await pause();
    await age();
    const blocked = (await whisper(olek, olaId, 'Odpiszesz?')).data.message;
    await call('POST', '/api/chat/block', { cookie: players.ola, body: { messageId: blocked.id } });
    assert.deepEqual(await deliver(blocked.id), []);
  });
});

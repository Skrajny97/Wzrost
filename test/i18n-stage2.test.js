// The English beta, stage 2 (levels 1–10): the language each part of the
// first levels is made in. The engine writes its own texts (word() in
// src/engine/text.js) in the language of the content it is given, so an
// English account's exploration report and item cards come in English; and
// what the server sends by itself, outside any request, comes in each
// account's own language (users.language): the phone notifications of the
// cron (push.js, mentions.js) and the mail with the link (email.js), while
// the live game, with English off, stays Polish.
//
// The English of the data's texts is written apart (data/en/), so these
// tests lay a test overlay of their own over a few of them, in this
// process only, and check the language each part is made in rather than
// the wording. The server's functions that run outside a request run here,
// in this process, against the database of the local Worker.

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, describe, test } from 'node:test';

import { createRng, effectText, generateItem, itemLines, itemProperties, optionLock } from '../src/engine/index.js';
import { decimalText, nameInText, say, word } from '../src/engine/text.js';
import { register } from '../src/server/accounts.js';
import { OVERLAYS, contentIn } from '../src/server/content.js';
import { requestLink } from '../src/server/email.js';
import { toBase64Url } from '../src/server/encoding.js';
import { readFeatures } from '../src/server/features.js';
import { runInLanguage } from '../src/server/i18n.js';
import { mentionNotices } from '../src/server/mentions.js';
import { sendNotifications } from '../src/server/push.js';
import strings from '../data/en/strings.json' with { type: 'json' };
import { useServer } from './helpers/server.js';

// The test overlay, laid before this process builds its English content.
OVERLAYS.en = {
  ...OVERLAYS.en,
  texts: {
    pushHuntTitle: ['Exploration over'],
    pushHuntBody: ['Back from {area}. The report is waiting.'],
    emailConfirmSubject: ['Confirm your e-mail in Insight'],
  },
  chat: {
    ...OVERLAYS.en.chat,
    channels: { global: { name: 'Global' } },
    mentions: { texts: { pushTitle: 'Chat: {channel}', pushBody: '{name} tagged you in the chat: {text}' } },
  },
};

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
    received.push({ path: request.url, body: new Uint8Array(Buffer.concat(chunks)) });
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

describe("the engine's own texts", () => {
  const pl = contentIn('pl');
  const en = contentIn('en');

  test('word() gives a text of the engine in the language of its content, Polish without English', () => {
    const english = { language: 'en', words: { 'Pancerz: +{armor}': 'Armour: +{armor}', Pusty: '' } };
    assert.equal(word(english, 'Pancerz: +{armor}', { armor: 5 }), 'Armour: +5');
    assert.equal(word({ language: 'pl', words: {} }, 'Pancerz: +{armor}', { armor: 5 }), 'Pancerz: +5');
    // A name not given stays as written; an empty English, a text without
    // one and a call without a content stay Polish.
    assert.equal(word(english, 'Pancerz: +{armor}'), 'Armour: +{armor}');
    assert.equal(word(english, 'Pusty'), 'Pusty');
    assert.equal(word(english, 'Bez tłumaczenia: {x}', { y: 1 }), 'Bez tłumaczenia: {x}');
    assert.equal(word(undefined, 'Pancerz'), 'Pancerz');
    // Each language's content has its words: English from strings.json
    // without its notes, none for Polish.
    assert.deepEqual([pl.language, pl.words], ['pl', {}]);
    assert.equal(en.language, 'en');
    assert.equal(en.words['{name} (poz. {level})'], strings['{name} (poz. {level})']);
    assert.ok(!Object.keys(en.words).some((key) => key.startsWith('$')));
    // Names in a sentence and decimals as each language writes them.
    assert.deepEqual([nameInText('Skóra wilka', pl), nameInText('Wolf Pelt', en)], ['skóra wilka', 'Wolf Pelt']);
    assert.deepEqual([decimalText(2.5, pl), decimalText(2.5, en), decimalText(30, en)], ['2,5', '2.5', '30']);
  });

  test("an item's card, the camp's effects and a locked option come in the content's language", () => {
    const sword = generateItem({ baseId: 'sword', level: 5, rarityId: 'common' }, createRng('card'), pl);
    assert.match(itemProperties(sword, pl)[0], /^Obrażenia: \d+–\d+ \(fizyczne\)$/);
    assert.match(itemProperties(sword, en)[0], /^Damage: \d+–\d+ \(physical\)$/);
    assert.deepEqual([itemLines(sword, pl)[0].label, itemLines(sword, en)[0].label], ['Obrażenia', 'Damage']);
    const helmet = generateItem({ baseId: 'helmet', level: 5, rarityId: 'common' }, createRng('card'), pl);
    assert.match(itemProperties(helmet, pl)[0], /^Pancerz: \+\d+$/);
    assert.match(itemProperties(helmet, en)[0], /^Armour: \+\d+$/);
    const table = pl.buildingsById['craft-table'];
    assert.match(effectText(table, 10, pl), /^Wszystkie rzadkości, .*, szansa na dodatkową część: 25%/);
    assert.match(effectText(table, 10, en), /^All rarities, .*, chance of an extra part: 25%/);
    const exorcism = { id: 'exorcism', label: 'x', classes: ['cleric', 'shadow'] };
    const lock = (content) => optionLock(exorcism, { classId: 'warrior', level: 1, purse: 0 }, content).text;
    assert.equal(lock(pl), `tylko ${pl.classesById.cleric.name} i ${pl.classesById.shadow.name}`);
    assert.equal(lock(en), `${en.classesById.cleric.name} and ${en.classesById.shadow.name} only`);
  });
});

describe('English where ENGLISH is on (the test version)', () => {
  const { server, db } = useServer({ ENGLISH: 'on', PUSH_TEST_HOSTS: '127.0.0.1' });

  // A request in a language, the page's own (X-Lang).
  async function ask(method, path, { body, cookie, lang } = {}) {
    const headers = { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(cookie && { Cookie: cookie }), ...(lang && { 'X-Lang': lang }) };
    const response = await server.fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const setCookie = response.headers.get('Set-Cookie');
    return { status: response.status, data: await response.json(), cookie: setCookie ? setCookie.split(';')[0] : null };
  }

  // An account made from a page in `lang`, its e-mail confirmed, with a
  // character out on an exploration of the Skraj Wiatrołomów; its cookie
  // and the exploration's end.
  async function explorer(login, lang) {
    const { cookie } = await ask('POST', '/api/auth/register', { body: { login, email: `${login.toLowerCase()}@example.com`, password: 'tajnehaslo1', adult: true }, lang });
    const database = await db();
    await database.prepare('UPDATE users SET email_confirmed_at = created_at WHERE login = ?').bind(login).run();
    assert.equal((await ask('POST', '/api/character', { body: { name: login, classId: 'warrior', appearance: 'female' }, cookie, lang })).status, 201);
    assert.equal((await ask('POST', '/api/hunts', { body: { areaId: 'windfalls-edge', minutes: 5 }, cookie, lang })).status, 201);
    const endsAt = await database.prepare('SELECT a.ends_at FROM activities a JOIN characters c ON c.id = a.character_id WHERE c.name = ?').bind(login).first('ends_at');
    return { cookie, endsAt };
  }

  test("an English account's exploration report comes in English, a Polish one's in Polish", async () => {
    for (const [login, lang] of [
      ['Angielka', 'en'],
      ['Polka', 'pl'],
    ]) {
      const { cookie } = await explorer(login, lang);
      // Claimed too early: the server's error, in the page's language.
      const early = await ask('POST', '/api/hunts/claim', { cookie, lang });
      assert.equal(early.data.error.message, lang === 'en' ? 'The exploration is still under way.' : 'Wyprawa jeszcze trwa.');
      await (await db())
        .prepare("UPDATE activities SET started_at = started_at - 86400000, ends_at = ?, seed = 'test-seed' WHERE character_id = (SELECT id FROM characters WHERE name = ?)")
        .bind(Date.now() - 1, login)
        .run();
      const { report } = (await ask('POST', '/api/hunts/claim', { cookie, lang })).data;
      const fights = report.entries.filter((entry) => entry.type === 'fight').map((entry) => entry.text).join(' ');
      if (lang === 'en') {
        assert.match(fights, /\(lvl \d+\)/);
        assert.match(fights, /HP: \d+ → \d+\. \+\d+ XP, \+\d+ gold\./);
        assert.doesNotMatch(fights, /\(poz\. \d+\)|\+\d+ złota\./);
      } else {
        assert.match(fights, /\(poz\. \d+\)/);
        assert.match(fights, /HP: \d+ → \d+\. \+\d+ XP, \+\d+ złota\./);
      }
      const { character } = (await ask('GET', '/api/character', { cookie, lang })).data;
      assert.equal(character.combat.damageKind, lang === 'en' ? 'physical' : 'fizyczne');
    }
  });

  test("the cron's phone notifications come in each account's language", async () => {
    readFeatures({ ENGLISH: 'on' });
    pushService.received.length = 0;
    const phones = {};
    let endsAt = 0;
    for (const [login, lang] of [
      ['Angielka', 'en'],
      ['Polka', 'pl'],
    ]) {
      const explored = await explorer(login, lang);
      phones[login] = await fakePhone(`/push/${login}`);
      assert.equal((await ask('POST', '/api/push/subscribe', { body: phones[login].subscription, cookie: explored.cookie })).status, 200);
      endsAt = Math.max(endsAt, explored.endsAt);
    }
    // The minute's run, as the cron makes it, outside any request.
    await sendNotifications({ DB: await db() }, endsAt + 30000);
    const shown = Object.fromEntries(
      await Promise.all(pushService.received.map(async ({ path, body }) => [path.split('/').at(-1), await phones[path.split('/').at(-1)].read(body)])),
    );
    const told = (lang) => {
      const content = contentIn(lang);
      return [say(content.texts, 'pushHuntTitle', 0), say(content.texts, 'pushHuntBody', 0, { area: content.areasById['windfalls-edge'].name })];
    };
    assert.deepEqual([shown.Angielka.title, shown.Angielka.body], told('en'));
    assert.deepEqual([shown.Angielka.title, shown.Angielka.body], ['Exploration over', `Back from ${contentIn('en').areasById['windfalls-edge'].name}. The report is waiting.`]);
    assert.deepEqual([shown.Polka.title, shown.Polka.body], told('pl'));
  });

  test("a tag in the chat reaches the phone in the tagged account's language", async () => {
    readFeatures({ ENGLISH: 'on' });
    // The cron's query, read as the database gives it (mentions.js).
    const row = (userId, language) => ({ message_id: userId, created_at: 1, user_id: userId, channel: 'global', writer_id: 9, text: 'Hej', name: 'Ala', appearance: 'female', language, seen: null });
    const rows = [row(1, 'en'), row(2, 'pl'), row(3, null)];
    const database = { prepare: () => ({ bind: () => ({ all: async () => ({ results: rows }) }) }) };
    const notices = await mentionNotices(database, 0, 1);
    assert.deepEqual([notices.get(1)[0].title, notices.get(1)[0].body], ['Chat: Global', 'Ala tagged you in the chat: Hej']);
    assert.deepEqual([notices.get(2)[0].title, notices.get(2)[0].body], ['Czat: Globalny', 'Ala oznaczyła Cię na czacie: Hej']);
    // An account without a language kept is Polish, and so is every one
    // where English is off.
    assert.equal(notices.get(3)[0].title, 'Czat: Globalny');
    readFeatures({});
    assert.equal((await mentionNotices(database, 0, 1)).get(1)[0].title, 'Czat: Globalny');
    readFeatures({ ENGLISH: 'on' });
  });

  test('the mail with the link comes in the language of the account, at registration and sent again', async () => {
    readFeatures({ ENGLISH: 'on' });
    const mails = [];
    const env = { DB: await db(), EMAIL: { send: async (message) => void mails.push(message) } };
    const post = (path, body, cookie) =>
      new Request(`https://test.insightrpg.com${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) }, body: JSON.stringify(body) });
    const now = Date.now();
    // Made from a page in English: the account and its mail are English.
    const made = await runInLanguage('en', () => register({ request: post('/api/auth/register', { login: 'Angielka', email: 'angielka@example.com', password: 'tajnehaslo1', adult: true }), env, now }));
    assert.equal(made.status, 201);
    const cookie = made.headers.get('Set-Cookie').split(';')[0];
    assert.match(mails[0].html, /^<!doctype html><html lang="en">/);
    assert.equal(mails[0].subject, 'Confirm your e-mail in Insight');
    // Sent again from a page in Polish, it keeps to the account's English.
    await runInLanguage('pl', () => requestLink({ request: post('/api/auth/email', {}, cookie), env, now: now + 120000 }));
    assert.match(mails[1].html, /^<!doctype html><html lang="en">/);
    assert.equal(mails[1].subject, 'Confirm your e-mail in Insight');
    // The account switched to Polish: its next one is Polish, from a page
    // in English too.
    await env.DB.prepare("UPDATE users SET language = 'pl' WHERE login = 'Angielka'").run();
    await runInLanguage('en', () => requestLink({ request: post('/api/auth/email', {}, cookie), env, now: now + 240000 }));
    assert.match(mails[2].html, /^<!doctype html><html lang="pl">/);
    assert.equal(mails[2].subject, say(contentIn('pl').texts, 'emailConfirmSubject', 0));
    // Where English is off (the live game), an English account's mail is
    // Polish too.
    await env.DB.prepare("UPDATE users SET language = 'en' WHERE login = 'Angielka'").run();
    readFeatures({});
    await runInLanguage('en', () => requestLink({ request: post('/api/auth/email', {}, cookie), env, now: now + 360000 }));
    assert.match(mails[3].html, /^<!doctype html><html lang="pl">/);
    readFeatures({ ENGLISH: 'on' });
  });
});

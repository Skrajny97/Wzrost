// Gold in the Skrzynia Konta (src/server/chest.js; DECISIONS.md, "Złoto w
// Skrzyni Konta (19.11.2026)"; the author: „dorób złoto możliwe do
// przenoszenia miedzy postaciami w skrzyni konta”): one number for the
// whole account, which any of its characters at the chest's level puts its
// gold into and takes gold out of, any amount up to what there is. Each
// move is one batch, valid only while the character is as read and the
// chest holds the gold the page showed (`seen`), so a second tap or a stale
// page moves nothing and gets the chest's "changed meanwhile".

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { putGoldInChest } from '../src/server/chest.js';
import { readFeatures } from '../src/server/features.js';
import { content } from './helpers/content.js';
import { meanwhile, posted } from './helpers/meanwhile.js';
import { useServer } from './helpers/server.js';

const LEVEL = content.balance.account.chestLevel;
const WORDS = content.camp.chest.gold.texts;
const CHANGED = 'Coś zmieniło się w międzyczasie. Spróbuj jeszcze raz.';
// A number as the server writes it in Polish ("12 345").
const pl = (value) => new Intl.NumberFormat('pl-PL').format(value);

describe('gold in the Skrzynia Konta', () => {
  const { server, call, db, signUp } = useServer({ ENGLISH: 'on' });
  let cookie;

  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  // A character of the account, played from now on, at the chest's level
  // unless `level` says otherwise, with `gold`; its id.
  async function create(name, { gold = 0, level = LEVEL, who = cookie } = {}) {
    const made = await call('POST', '/api/character', { cookie: who, body: { name, classId: 'warrior', appearance: 'female' } });
    assert.equal(made.status, 201, JSON.stringify(made.data));
    await run('UPDATE characters SET level = ?, gold = ? WHERE name = ?', level, gold, name);
    return (await first('SELECT id FROM characters WHERE name = ?', name)).id;
  }
  const choose = async (id) => assert.equal((await call('POST', '/api/characters/choose', { cookie, body: { id } })).status, 200);
  const goldOf = async (id) => (await first('SELECT gold FROM characters WHERE id = ?', id)).gold;
  const versionOf = async (id) => (await first('SELECT version FROM characters WHERE id = ?', id)).version;
  const inChest = async (login = 'zloto') => (await first('SELECT chest_gold FROM users WHERE login = ?', login)).chest_gold;
  const chest = async (who = cookie) => (await call('GET', '/api/chest', { cookie: who })).data.chest;
  const put = (amount, seen, who = cookie) => call('POST', '/api/chest/gold/put', { cookie: who, body: { amount, seen } });
  const take = (amount, seen, who = cookie) => call('POST', '/api/chest/gold/take', { cookie: who, body: { amount, seen } });
  const refusal = (answer) => [answer.status, answer.data.error?.code, answer.data.error?.message];
  // A request in English, the page's own language (X-Lang).
  async function inEnglish(method, path, body) {
    const headers = { Cookie: cookie, 'X-Lang': 'en', ...(body !== undefined && { 'Content-Type': 'application/json' }) };
    const response = await server.fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  }
  // Requests that start together, as in chest-goods.test.js: each sent with
  // its body held back, the bodies let go at once, so both handlers read the
  // chest before either writes.
  async function together(requests) {
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const answers = requests.map(({ path, body }) => {
      const bytes = new TextEncoder().encode(JSON.stringify(body));
      const stream = new ReadableStream(
        {
          async pull(controller) {
            await gate;
            controller.enqueue(bytes);
            controller.close();
          },
        },
        { highWaterMark: 0 },
      );
      return server
        .getWorker()
        .fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: stream, duplex: 'half' })
        .then(async (response) => ({ status: response.status, data: await response.json() }));
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    return Promise.all(answers);
  }

  beforeEach(async () => {
    ({ cookie } = await signUp('zloto'));
  });

  test('gold goes in and comes out, any amount up to what there is, also while away; no fee', async () => {
    const mira = await create('Mira', { gold: 5000 });
    // The chest's gold with its quick amounts and words, in the request's
    // language.
    const view = await chest();
    assert.deepEqual(view.gold, { amount: 0, quick: content.camp.chest.gold.quick, texts: WORDS });
    assert.equal((await inEnglish('GET', '/api/chest')).data.chest.gold.texts.title, 'Gold in the chest');
    // The bag at hand while away, as the goods (DECISIONS.md, "Plecak poza obozem").
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } })).status, 201);
    const before = await versionOf(mira);
    let answer = await put(1200, 0);
    assert.equal(answer.status, 200, JSON.stringify(answer.data));
    assert.equal(answer.data.chest.gold.amount, 1200);
    assert.equal(answer.data.character.gold, 3800, 'the answer has the character, for the top bar');
    assert.deepEqual([await goldOf(mira), await inChest(), await versionOf(mira)], [3800, 1200, before + 1]);
    answer = await take(200, 1200);
    assert.equal(answer.status, 200, JSON.stringify(answer.data));
    assert.deepEqual([answer.data.chest.gold.amount, answer.data.character.gold], [1000, 4000]);
    // All of it, both ways: the whole sum, nothing taken on the way.
    assert.equal((await put(4000, 1000)).status, 200);
    assert.deepEqual([await goldOf(mira), await inChest()], [0, 5000]);
    assert.equal((await take(5000, 5000)).status, 200);
    assert.deepEqual([await goldOf(mira), await inChest()], [5000, 0]);
    // Billions fit.
    await run('UPDATE characters SET gold = ? WHERE id = ?', 9876543210, mira);
    assert.equal((await put(9876543210, 0)).status, 200);
    assert.deepEqual([await goldOf(mira), await inChest(), (await chest()).gold.amount], [0, 9876543210, 9876543210]);
  });

  test('every refusal: not a whole number from 1 up, more than there is, below the chest level, no character', async () => {
    const mira = await create('Mira', { gold: 12345 });
    for (const amount of [0, -5, 1.5, '100', null, undefined, 1e21, true]) {
      for (const move of [put, take]) {
        const refused = await move(amount, 0);
        assert.deepEqual(refusal(refused), [400, 'invalid_amount', WORDS.errors.invalid], JSON.stringify(amount));
      }
    }
    let refused = await put(12346, 0);
    assert.deepEqual(refusal(refused), [409, 'not_enough', `Masz tylko ${pl(12345)} złota.`]);
    assert.equal((await inEnglish('POST', '/api/chest/gold/put', { amount: 12346, seen: 0 })).data.error.message, 'You have only 12,345 gold.');
    refused = await take(1, 0);
    assert.deepEqual(refusal(refused), [409, 'not_in_chest', 'W Skrzyni Konta nie ma złota.']);
    assert.equal((await put(1000, 0)).status, 200);
    refused = await take(1001, 1000);
    assert.deepEqual(refusal(refused), [409, 'not_in_chest', 'W Skrzyni Konta jest tylko 1000 złota.']);
    assert.equal((await inEnglish('POST', '/api/chest/gold/take', { amount: 1001, seen: 1000 })).data.error.message, 'There is only 1,000 gold in the Account Chest.');
    await run('UPDATE characters SET gold = 0 WHERE id = ?', mira);
    refused = await put(1, 1000);
    assert.deepEqual(refusal(refused), [409, 'not_enough', 'Nie masz złota.']);
    assert.deepEqual([await goldOf(mira), await inChest()], [0, 1000], 'nothing moved');

    // Below the chest's level: the padlock, as for everything in the chest.
    await run('UPDATE characters SET level = ?, gold = 500 WHERE id = ?', LEVEL - 1, mira);
    assert.deepEqual(await chest(), { locked: { level: LEVEL } });
    for (const move of [put, take]) {
      refused = await move(100, 1000);
      assert.deepEqual(refusal(refused), [403, 'chest_locked', `Skrzynia Konta otworzy się na ${LEVEL}. poziomie postaci.`]);
    }
    assert.deepEqual([await goldOf(mira), await inChest()], [500, 1000]);

    // An account without a character, and no account at all.
    const { cookie: empty } = await signUp('bezpostaci');
    for (const move of [put, take]) {
      assert.deepEqual(refusal(await move(100, 0, empty)), [404, 'no_character', 'Nie masz jeszcze postaci.']);
      assert.equal((await call('POST', move === put ? '/api/chest/gold/put' : '/api/chest/gold/take', { body: { amount: 100, seen: 0 } })).status, 401);
    }
    assert.equal(await inChest('bezpostaci'), 0);
  });

  test('a second tap and a stale page move nothing and get „changed meanwhile”', async () => {
    const mira = await create('Mira', { gold: 3000 });
    // Two taps at once, the same amount and the chest as the page showed it:
    // the gold goes once.
    let answers = await together([
      { path: '/api/chest/gold/put', body: { amount: 1000, seen: 0 } },
      { path: '/api/chest/gold/put', body: { amount: 1000, seen: 0 } },
    ]);
    assert.deepEqual(answers.map((one) => one.status).sort(), [200, 409], JSON.stringify(answers.map((one) => one.data.error ?? one.status)));
    assert.equal(answers.find((one) => one.status === 409).data.error.message, CHANGED);
    assert.deepEqual([await goldOf(mira), await inChest()], [2000, 1000]);
    answers = await together([
      { path: '/api/chest/gold/take', body: { amount: 1000, seen: 1000 } },
      { path: '/api/chest/gold/take', body: { amount: 1000, seen: 1000 } },
    ]);
    assert.deepEqual(answers.map((one) => one.status).sort(), [200, 409]);
    assert.deepEqual([await goldOf(mira), await inChest()], [3000, 0]);

    // A tap after the first one was done, from the page that still showed
    // the chest before it: refused, both ways.
    assert.equal((await put(500, 0)).status, 200);
    assert.deepEqual(refusal(await put(500, 0)), [409, 'character_changed', CHANGED]);
    assert.equal((await take(200, 500)).status, 200);
    assert.deepEqual(refusal(await take(200, 500)), [409, 'character_changed', CHANGED]);
    // A page that missed what another tab did, and one that showed nothing.
    await run("UPDATE users SET chest_gold = 999 WHERE login = 'zloto'");
    assert.deepEqual(refusal(await take(300, 300)), [409, 'character_changed', CHANGED]);
    assert.deepEqual(refusal(await put(300, undefined)), [409, 'character_changed', CHANGED]);
    assert.deepEqual([await goldOf(mira), await inChest()], [2700, 999]);
    assert.equal((await inEnglish('POST', '/api/chest/gold/take', { amount: 1, seen: 0 })).data.error.message, 'Something changed in the meantime. Try once more.');
  });

  test('a move between the read and the write leaves the batch undone: the character and the chest together, or nothing', async () => {
    const mira = await create('Mira', { gold: 3000 });
    const database = await db();
    // Another tab takes the character's gold just before this move's write.
    const racing = meanwhile(database, /UPDATE users SET chest_gold/, () => run('UPDATE characters SET gold = 100, version = version + 1 WHERE id = ?', mira));
    readFeatures({ ENGLISH: 'on' });
    await assert.rejects(
      putGoldInChest({ request: posted('/api/chest/gold/put', cookie, { amount: 2000, seen: 0 }), env: { DB: racing }, now: Date.now() }),
      (error) => error.status === 409 && error.code === 'character_changed' && error.message === CHANGED,
    );
    assert.ok(racing.done);
    assert.deepEqual([await goldOf(mira), await inChest()], [100, 0]);
  });

  test('every character of the account sees the same gold, also after one is removed; another account sees none of it', async () => {
    const mira = await create('Mira', { gold: 5000 });
    assert.equal((await put(3000, 0)).status, 200);
    const druga = await create('Druga', { gold: 10 });
    assert.equal((await chest()).gold.amount, 3000, 'the second character sees the first one’s gold');
    assert.equal((await take(1000, 3000)).status, 200);
    assert.deepEqual([await goldOf(druga), await goldOf(mira)], [1010, 2000]);
    await choose(mira);
    assert.equal((await chest()).gold.amount, 2000);
    assert.equal((await take(2000, 2000)).status, 200);
    assert.deepEqual([await goldOf(mira), await inChest()], [4000, 0]);
    // Gold of a character removed stays for the others.
    await choose(druga);
    assert.equal((await put(1010, 0)).status, 200);
    assert.equal((await call('DELETE', '/api/character', { cookie })).status, 200);
    await choose(mira);
    assert.equal((await chest()).gold.amount, 1010);

    // Another account: its own chest, empty, and the first one's untouched.
    const { cookie: other } = await signUp('obcy');
    const obcy = await create('Obcy', { gold: 700, who: other });
    assert.equal((await chest(other)).gold.amount, 0);
    assert.deepEqual(refusal(await take(1010, 1010, other)), [409, 'character_changed', CHANGED]);
    assert.deepEqual(refusal(await take(100, 0, other)), [409, 'not_in_chest', 'W Skrzyni Konta nie ma złota.']);
    assert.equal((await put(700, 0, other)).status, 200);
    assert.deepEqual([await inChest('obcy'), await inChest(), await goldOf(obcy), (await chest()).gold.amount], [700, 1010, 0, 1010]);

    // It goes with the account: a new account given the removed one's id (the
    // database gives the highest id again) starts with an empty chest.
    const otherId = (await first("SELECT id FROM users WHERE login = 'obcy'")).id;
    assert.equal((await call('DELETE', '/api/me', { cookie: other, body: { login: 'obcy' } })).status, 200);
    const { cookie: fresh } = await signUp('nowe');
    assert.equal((await first("SELECT id FROM users WHERE login = 'nowe'")).id, otherId, 'the database gives the id again');
    await create('Nowa', { who: fresh });
    assert.equal((await chest(fresh)).gold.amount, 0);
    assert.equal(await inChest(), 1010);
  });
});

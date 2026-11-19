// Talia Systemu's cards in the Skrzynia Konta (src/server/chest-cards.js,
// card-goods.js, chest.js; account-chest.js in the engine; DECISIONS.md,
// "Karty Talii: Skrzynia Konta, Targowisko i Wymiana (makiety,
// 19.11.2026)"): a card of the character's collection goes into the chest
// with the copies asked, and another character of the account takes them
// into its collection, where they add up, so the card's level follows; the
// copies of another character count for the level but not in its
// Encyklopedia. Another account sees none of them, a character below the
// chest's level moves none, nor more copies than it has. A deck whose card
// left whole is incomplete till the card comes back; a card a match running
// now plays stays out. Two taps move the copies once, and a tap on a
// character changed meanwhile gets the chest's "changed meanwhile".

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { cardAfter, starterDeck } from '../src/engine/index.js';
import { putGoodsInChest } from '../src/server/chest.js';
import { readFeatures } from '../src/server/features.js';
import { content } from './helpers/content.js';
import { meanwhile, posted } from './helpers/meanwhile.js';
import { useServer } from './helpers/server.js';

const LEVEL = content.balance.account.chestLevel;
const TOP = content.cards.stats.maxLevel;
const WORDS = content.cards.texts.goods;
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole));
// The mythic elite of the first land, in no starter deck.
const FIND = 'likho';
const STARTER = starterDeck(content);
const IN_DECK = STARTER[0];
const CHANGED = 'Coś zmieniło się w międzyczasie. Spróbuj jeszcze raz.';

describe("a character's copies of a card after a move (the engine)", () => {
  test('copies from others leave first, so a character keeps its own find as long as it holds a copy of its own', () => {
    assert.deepEqual(cardAfter({ copies: 3, traded: 1 }, 2), { copies: 1, traded: 0 });
    assert.deepEqual(cardAfter({ copies: 3, traded: 1 }, 3), { copies: 0, traded: 0 });
    assert.deepEqual(cardAfter({ copies: 3, traded: 2 }, 1), { copies: 2, traded: 1 });
    assert.deepEqual(cardAfter({ copies: 3, traded: 3 }, 1), { copies: 2, traded: 2 });
    // Its own go only when none from others is left.
    assert.deepEqual(cardAfter({ copies: 4, traded: 1 }, 2), { copies: 2, traded: 0 });
  });

  test('copies that arrive add up, those from others marked so; given and got at once', () => {
    assert.deepEqual(cardAfter({ copies: 0, traded: 0 }, 0, 2), { copies: 2, traded: 2 });
    assert.deepEqual(cardAfter({ copies: 2, traded: 0 }, 0, 3, 1), { copies: 5, traded: 1 });
    assert.deepEqual(cardAfter({ copies: 2, traded: 0 }, 1, 1), { copies: 2, traded: 1 });
    // Past the top level the copies stay: the level stops, nothing is lost.
    assert.deepEqual(cardAfter({ copies: TOP, traded: 0 }, 0, 2, 0), { copies: TOP + 2, traded: 0 });
  });
});

describe('the cards of Talia Systemu in the Skrzynia Konta', () => {
  const { server, call, db, signUp } = useServer({ SETTLEMENT: 'on', CARDS: 'on', ENGLISH: 'on' });
  let cookie;

  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  // A character of the account, played from now on, at the chest's level
  // unless `level` says otherwise; its id.
  async function create(name, level = LEVEL, who = cookie) {
    const made = await call('POST', '/api/character', { cookie: who, body: { name, classId: 'warrior', appearance: 'female' } });
    assert.equal(made.status, 201, JSON.stringify(made.data));
    await run('UPDATE characters SET level = ? WHERE name = ?', level, name);
    return (await first('SELECT id FROM characters WHERE name = ?', name)).id;
  }
  const choose = async (id) => assert.equal((await call('POST', '/api/characters/choose', { cookie, body: { id } })).status, 200);
  const give = (characterId, monster, copies) =>
    run('INSERT INTO cards (character_id, monster_id, copies, created_at) VALUES (?, ?, ?, 1) ON CONFLICT (character_id, monster_id) DO UPDATE SET copies = excluded.copies', characterId, monster, copies);
  const giveEffect = (characterId, effect, copies) =>
    run('INSERT INTO card_effects (character_id, effect_id, copies, created_at) VALUES (?, ?, ?, 1) ON CONFLICT (character_id, effect_id) DO UPDATE SET copies = excluded.copies', characterId, effect, copies);
  const copiesOf = async (characterId, monster) => (await first('SELECT copies FROM cards WHERE character_id = ? AND monster_id = ?', characterId, monster))?.copies ?? 0;
  const effectCopies = async (characterId, effect) => (await first('SELECT copies FROM card_effects WHERE character_id = ? AND effect_id = ?', characterId, effect))?.copies ?? 0;
  const versionOf = async (characterId) => (await first('SELECT version FROM characters WHERE id = ?', characterId)).version;
  const put = (kind, id, count, who = cookie) => call('POST', '/api/chest/goods/put', { cookie: who, body: { kind, id, count } });
  const take = (kind, id, count, who = cookie) => call('POST', '/api/chest/goods/take', { cookie: who, body: { kind, id, count } });
  const chest = async (who = cookie) => (await call('GET', '/api/chest', { cookie: who })).data.chest;
  const cardsIn = (view) => view.goods.filter((good) => good.kind === 'card' || good.kind === 'effect-card').map(({ kind, id, count, own, have }) => ({ kind, id, count, own, have }));
  const refusal = (answer) => [answer.status, answer.data.error?.code, answer.data.error?.message];
  // Requests that start together, as in chest-goods.test.js: each sent with
  // its body held back, the bodies let go at once, so both handlers read the
  // character before either writes.
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
    ({ cookie } = await signUp('karty'));
  });

  test('a card goes in with the copies asked, and another character of the account takes them into its collection, where they add up', async () => {
    const mira = await create('Mira');
    await give(mira, FIND, 3);
    const before = await versionOf(mira);
    let answer = await put('card', FIND, 2);
    assert.equal(answer.status, 200, JSON.stringify(answer.data));
    assert.equal(await copiesOf(mira, FIND), 1, 'one copy stays, the card at level 1');
    assert.equal(await versionOf(mira), before + 1, 'the version moves with the collection');
    assert.deepEqual(cardsIn(answer.data.chest), [{ kind: 'card', id: FIND, count: 2, own: 2, have: 1 }]);
    const good = answer.data.chest.goods.find((one) => one.id === FIND);
    assert.equal(good.name, filled(WORDS.card, { name: content.monstersById[FIND].name }));
    assert.equal(good.cardName, content.monstersById[FIND].name);
    assert.deepEqual([good.face.id, good.face.rarity, good.face.levels.length], [FIND, 'mythic', TOP]);
    // The collection for "Włóż kartę": the card with its copy left.
    assert.deepEqual(
      answer.data.chest.cards.own.map(({ kind, id, copies, busy }) => ({ kind, id, copies, busy })),
      [{ kind: 'card', id: FIND, copies: 1, busy: false }],
    );
    // Its last copy too: the card leaves the collection.
    assert.equal((await put('card', FIND, 1)).status, 200);
    assert.equal(await first('SELECT 1 AS found FROM cards WHERE character_id = ? AND monster_id = ?', mira, FIND), null);
    assert.deepEqual(cardsIn(await chest()), [{ kind: 'card', id: FIND, count: 3, own: 3, have: 0 }]);

    // Another character of the account, with a copy of its own.
    const druga = await create('Druga');
    await give(druga, FIND, 1);
    assert.deepEqual(cardsIn(await chest()), [{ kind: 'card', id: FIND, count: 3, own: 0, have: 1 }]);
    answer = await take('card', FIND, 2);
    assert.equal(answer.status, 200, JSON.stringify(answer.data));
    assert.equal(await copiesOf(druga, FIND), 3, 'the copies add up: the card at level 3');
    assert.deepEqual(cardsIn(answer.data.chest), [{ kind: 'card', id: FIND, count: 1, own: 0, have: 3 }]);
    // A card it never had comes new, at the level of its copies.
    await choose(mira);
    await give(mira, 'wisp', 2);
    assert.equal((await put('card', 'wisp', 2)).status, 200);
    await choose(druga);
    assert.equal((await take('card', 'wisp', 2)).status, 200);
    assert.equal(await copiesOf(druga, 'wisp'), 2);
    const decks = (await call('GET', '/api/cards', { cookie })).data.cards.collection.map(({ id, level }) => [id, level]);
    assert.deepEqual(decks.filter(([id]) => id === 'wisp' || id === FIND).sort(), [[FIND, 3], ['wisp', 2]]);
  });

  test('effect cards go the same way', async () => {
    const mira = await create('Mira');
    await giveEffect(mira, 'mist', 2);
    let answer = await put('effect-card', 'mist', 2);
    assert.equal(answer.status, 200, JSON.stringify(answer.data));
    assert.equal(await effectCopies(mira, 'mist'), 0);
    const good = answer.data.chest.goods.find((one) => one.kind === 'effect-card');
    assert.equal(good.name, filled(WORDS.effect, { name: content.cards.effects.cards.find((one) => one.id === 'mist').name }));
    assert.equal(good.face.effect, true);
    const druga = await create('Druga');
    answer = await take('effect-card', 'mist', 2);
    assert.equal(answer.status, 200, JSON.stringify(answer.data));
    assert.equal(await effectCopies(druga, 'mist'), 2);
    assert.deepEqual(cardsIn(answer.data.chest), []);
    // A creature's id is no effect card, nor the other way round.
    assert.equal((await put('effect-card', FIND, 1)).data.error.code, 'invalid_goods');
    assert.equal((await put('card', 'mist', 1)).data.error.code, 'invalid_goods');
  });

  test("another account's character sees none of the cards and takes none", async () => {
    const mira = await create('Mira');
    await give(mira, FIND, 2);
    assert.equal((await put('card', FIND, 2)).status, 200);
    const { cookie: stranger } = await signUp('obcy');
    const obcy = await create('Obcy', LEVEL, stranger);
    assert.deepEqual(cardsIn(await chest(stranger)), []);
    assert.deepEqual(refusal(await take('card', FIND, 1, stranger)), [409, 'not_in_chest', WORDS.gone]);
    assert.equal(await copiesOf(obcy, FIND), 0);
    assert.deepEqual(cardsIn(await chest()), [{ kind: 'card', id: FIND, count: 2, own: 2, have: 0 }]);
  });

  test('below the chest level no card goes in or out', async () => {
    const mira = await create('Mira');
    await give(mira, FIND, 2);
    assert.equal((await put('card', FIND, 1)).status, 200);
    const mala = await create('Mala', LEVEL - 1);
    await give(mala, 'wisp', 1);
    const message = `Skrzynia Konta otworzy się na ${LEVEL}. poziomie postaci.`;
    assert.deepEqual(refusal(await put('card', 'wisp', 1)), [403, 'chest_locked', message]);
    assert.deepEqual(refusal(await take('card', FIND, 1)), [403, 'chest_locked', message]);
    assert.deepEqual([await copiesOf(mala, 'wisp'), await copiesOf(mala, FIND)], [1, 0]);
    assert.deepEqual(await chest(), { locked: { level: LEVEL } });
  });

  test('no more copies than the character has; copies past the top level stay with the character', async () => {
    const mira = await create('Mira');
    await give(mira, FIND, 3);
    assert.deepEqual(refusal(await put('card', FIND, 4)), [409, 'not_enough', filled(WORDS.fewer, { count: 3 })]);
    assert.deepEqual(refusal(await put('card', 'wisp', 1)), [409, 'not_enough', WORDS.missing]);
    assert.equal((await put('card', FIND, 0)).data.error.code, 'invalid_count');
    assert.equal((await put('card', 'no-such-creature', 1)).data.error.code, 'invalid_goods');
    assert.equal(await copiesOf(mira, FIND), 3);
    assert.equal((await put('card', FIND, 3)).status, 200);
    assert.deepEqual(refusal(await take('card', FIND, 4)), [409, 'not_in_chest', filled(WORDS.only, { count: 3 })]);

    // Another character with the card at level 4 takes two copies: the
    // card is at the top level, and the copy past it stays with it, to be
    // moved on (nothing is lost).
    const druga = await create('Druga');
    await give(druga, FIND, TOP - 1);
    assert.equal((await take('card', FIND, 2)).status, 200);
    assert.equal(await copiesOf(druga, FIND), TOP + 1);
    const card = (await call('GET', '/api/cards', { cookie })).data.cards.collection.find((one) => one.id === FIND);
    assert.deepEqual([card.level, card.copies], [TOP, TOP + 1]);
    assert.deepEqual(cardsIn(await chest()), [{ kind: 'card', id: FIND, count: 1, own: 0, have: TOP + 1 }]);
    // In English, the words of data/en.
    const english = await server.fetch('/api/chest/goods/take', {
      method: 'POST',
      headers: { Cookie: cookie, 'X-Lang': 'en', 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'card', id: FIND, count: 2 }),
    });
    assert.equal((await english.json()).error.message, 'The Account Chest holds only 1 of this card.');
  });

  // The author, 19.11.2026: „karty z wymiany/targowiska niech nie
  // uzupełniają encyklopedii jakby coś”: so with another character's.
  test("another character's copies raise the card's level but fill no Encyklopedia; a character's own come back as its own", async () => {
    const found = async () => {
      const book = (await call('GET', '/api/encyclopedia', { cookie })).data.encyclopedia.cards;
      return book.lands.flatMap((land) => land.cards).some((card) => card.id === FIND && card.found);
    };
    const traded = async (characterId) => (await first('SELECT traded FROM cards WHERE character_id = ? AND monster_id = ?', characterId, FIND))?.traded ?? null;
    const mira = await create('Mira');
    await give(mira, FIND, 3);
    assert.equal(await found(), true, 'its own find');
    assert.equal((await put('card', FIND, 2)).status, 200);
    assert.equal(await found(), true, 'a copy of its own left');

    const druga = await create('Druga');
    assert.equal((await take('card', FIND, 2)).status, 200);
    assert.deepEqual([await copiesOf(druga, FIND), await traded(druga)], [2, 2]);
    assert.equal(await found(), false, 'copies from another character only');
    const salon = (await call('GET', '/api/cards', { cookie })).data.cards.collection.find((one) => one.id === FIND);
    assert.equal(salon.level, 2, 'they count for the level');
    // A copy of its own (as an exploration's drop) makes it a find.
    await run('UPDATE cards SET copies = copies + 1 WHERE character_id = ? AND monster_id = ?', druga, FIND);
    assert.equal(await found(), true);
    // Two copies back in the chest: those from Mira first, so its own find
    // stays with it, and in the Encyklopedia.
    assert.equal((await put('card', FIND, 2)).status, 200);
    assert.deepEqual([await copiesOf(druga, FIND), await traded(druga)], [1, 0]);
    assert.equal(await found(), true);
    const rows = async () => (await (await db()).prepare('SELECT character_id, count, traded FROM chest_goods WHERE good = ? ORDER BY character_id').bind(FIND).all()).results;
    assert.deepEqual(await rows(), [{ character_id: druga, count: 2, traded: 2 }]);
    // Taken back, they come as they went: from others still.
    assert.equal((await take('card', FIND, 2)).status, 200);
    assert.deepEqual([await copiesOf(druga, FIND), await traded(druga)], [3, 2]);
    assert.equal(await found(), true);
    // All three in the chest and back: its own copy is its own again.
    assert.equal((await put('card', FIND, 3)).status, 200);
    assert.deepEqual([await copiesOf(druga, FIND), await found()], [0, false]);
    assert.deepEqual(await rows(), [{ character_id: druga, count: 3, traded: 2 }]);
    assert.equal((await take('card', FIND, 3)).status, 200);
    assert.deepEqual([await copiesOf(druga, FIND), await traded(druga), await found()], [3, 2, true]);
  });

  test('a deck whose card left whole is incomplete until it comes back; fewer copies only lower its level', async () => {
    const mira = await create('Mira');
    assert.equal((await call('POST', '/api/cards/starter', { cookie })).status, 200);
    await give(mira, IN_DECK, 3);
    const deck = async () => {
      const { cards } = (await call('GET', '/api/cards', { cookie })).data;
      const slot = cards.decks.slots[cards.decks.active - 1];
      return { whole: slot.whole, deck: cards.deck, level: cards.collection.find((card) => card.id === IN_DECK)?.level ?? null };
    };
    assert.deepEqual(await deck(), { whole: true, deck: STARTER, level: 3 });
    // The chest tells which decks the card is in.
    const own = (await chest()).cards.own.find((card) => card.id === IN_DECK);
    assert.deepEqual(own.decks, [{ slot: 1, name: null }]);
    assert.equal((await put('card', IN_DECK, 2)).status, 200);
    assert.deepEqual(await deck(), { whole: true, deck: STARTER, level: 1 });
    assert.equal((await put('card', IN_DECK, 1)).status, 200);
    assert.deepEqual(await deck(), { whole: false, deck: null, level: null });
    assert.equal((await call('POST', '/api/cards/match', { cookie, body: { tier: 1, staked: false } })).data.error.code, 'no_deck', 'no match without a whole deck');
    // The decks kept the card's place: back from the chest, the deck is whole again.
    assert.equal((await take('card', IN_DECK, 3)).status, 200);
    assert.deepEqual(await deck(), { whole: true, deck: STARTER, level: 3 });
  });

  test("a card a running match plays stays out of the chest till it ends; the character's other cards go", async () => {
    const mira = await create('Mira');
    assert.equal((await call('POST', '/api/cards/starter', { cookie })).status, 200);
    await give(mira, FIND, 1);
    await giveEffect(mira, 'mist', 1);
    await run(`UPDATE card_decks SET effects = '["mist"]' WHERE character_id = ?`, mira);
    assert.equal((await call('POST', '/api/cards/match', { cookie, body: { tier: 1, staked: false } })).status, 200);
    const view = await chest();
    assert.deepEqual(
      [IN_DECK, FIND].map((id) => view.cards.own.find((card) => card.id === id).busy),
      [true, false],
    );
    assert.deepEqual(refusal(await put('card', IN_DECK, 1)), [409, 'card_in_match', WORDS.inMatch]);
    assert.deepEqual(refusal(await put('effect-card', 'mist', 1)), [409, 'card_in_match', WORDS.inMatch]);
    assert.equal((await put('card', FIND, 1)).status, 200, 'a card the match does not play goes');
    assert.equal((await call('POST', '/api/cards/surrender', { cookie })).status, 200);
    assert.equal((await put('card', IN_DECK, 1)).status, 200, 'the match over, the card goes');
    assert.equal((await put('effect-card', 'mist', 1)).status, 200);

    // A match of the Arena's Karty, and a live one on either side.
    const druga = await create('Druga');
    for (const id of ['badger', 'fox', 'viper', 'squirrel']) await give(druga, id, 1);
    const side = (ids) => ({ cards: ids.map((id, key) => ({ key, id, level: 1 })), effects: [] });
    await run(
      'INSERT INTO card_arena_matches (character_id, rival_id, rival, stakes, state, created_at) VALUES (?, NULL, ?, ?, ?, 1)',
      druga,
      '{}',
      '{}',
      JSON.stringify({ me: side(['badger']), foe: side(['wolf']) }),
    );
    await run(
      "INSERT INTO card_duels (from_id, to_id, stake, state, game, created_at, updated_at) VALUES (?, ?, 0, 'playing', ?, 1, 1)",
      mira,
      druga,
      JSON.stringify({ me: side(['fox']), foe: side(['viper']) }),
    );
    for (const id of ['badger', 'viper']) assert.deepEqual(refusal(await put('card', id, 1)), [409, 'card_in_match', WORDS.inMatch], id);
    for (const id of ['fox', 'squirrel']) assert.equal((await put('card', id, 1)).status, 200, `${id}: the rival's side, or no match`);
    await run("UPDATE card_duels SET state = 'done'");
    await run('DELETE FROM card_arena_matches');
    for (const id of ['badger', 'viper']) assert.equal((await put('card', id, 1)).status, 200, id);
  });

  test("a write that finds the card changed meanwhile moves nothing and says so", async () => {
    const mira = await create('Mira');
    await give(mira, FIND, 2);
    const database = await db();
    // A copy more comes in just before the chest's write, as an
    // exploration's drop would.
    const racing = meanwhile(database, /INSERT INTO chest_goods/, () => give(mira, FIND, 3));
    readFeatures({ CARDS: 'on', SETTLEMENT: 'on' });
    await assert.rejects(
      putGoodsInChest({ request: posted('/api/chest/goods/put', cookie, { kind: 'card', id: FIND, count: 2 }), env: { DB: racing }, now: Date.now() }),
      (error) => error.status === 409 && error.code === 'character_changed' && error.message === CHANGED,
    );
    assert.ok(racing.done);
    assert.deepEqual([await copiesOf(mira, FIND), (await first('SELECT COUNT(*) AS rows FROM chest_goods')).rows], [3, 0]);
  });

  test("a tap on a character changed meanwhile gets the chest's „changed meanwhile”", async () => {
    const mira = await create('Mira');
    await give(mira, FIND, 2);
    await give(mira, 'wisp', 2);
    const database = await db();
    // Another tap of the character (another card into the chest) is done
    // just before this one's write: the character is not as it was read.
    const racing = meanwhile(database, /INSERT INTO chest_goods/, async () => assert.equal((await put('card', 'wisp', 1)).status, 200));
    readFeatures({ CARDS: 'on', SETTLEMENT: 'on' });
    await assert.rejects(
      putGoodsInChest({ request: posted('/api/chest/goods/put', cookie, { kind: 'card', id: FIND, count: 1 }), env: { DB: racing }, now: Date.now() }),
      (error) => error.status === 409 && error.code === 'character_changed' && error.message === CHANGED,
    );
    assert.ok(racing.done);
    assert.deepEqual(
      [await copiesOf(mira, FIND), await copiesOf(mira, 'wisp'), cardsIn(await chest()).map(({ id, count }) => [id, count])],
      [2, 1, [['wisp', 1]]],
    );
  });

  test('taps at once move the copies once: none doubled, none lost', async () => {
    const mira = await create('Mira');
    // The copies of a card with the character and in the chest together.
    const total = async (characterId, id) => (await copiesOf(characterId, id)) + ((await first('SELECT COALESCE(SUM(count), 0) AS count FROM chest_goods WHERE good = ?', id)).count ?? 0);
    const codes = (answers) => JSON.stringify(answers.map((one) => one.data.error?.code ?? one.status));
    // Two cards at once: both go, or the one that finds the character
    // changed meanwhile gets the chest's „changed meanwhile”, nothing lost.
    await give(mira, FIND, 2);
    await give(mira, 'wisp', 2);
    let answers = await together([
      { path: '/api/chest/goods/put', body: { kind: 'card', id: FIND, count: 1 } },
      { path: '/api/chest/goods/put', body: { kind: 'card', id: 'wisp', count: 1 } },
    ]);
    assert.ok(answers.some((one) => one.status === 200), codes(answers));
    for (const refused of answers.filter((one) => one.status !== 200)) assert.deepEqual([refused.status, refused.data.error], [409, { code: 'character_changed', message: CHANGED }]);
    assert.deepEqual([await total(mira, FIND), await total(mira, 'wisp')], [2, 2]);
    assert.equal((await copiesOf(mira, FIND)) + (await copiesOf(mira, 'wisp')), 4 - answers.filter((one) => one.status === 200).length, codes(answers));
    // The same card tapped twice: its copies go in once.
    for (const id of [FIND, 'wisp']) await give(mira, id, 2);
    await run('DELETE FROM chest_goods');
    answers = await together([
      { path: '/api/chest/goods/put', body: { kind: 'card', id: FIND, count: 2 } },
      { path: '/api/chest/goods/put', body: { kind: 'card', id: FIND, count: 2 } },
    ]);
    assert.equal(answers.filter((one) => one.status === 200).length, 1, codes(answers));
    assert.ok(['character_changed', 'not_enough'].includes(answers.find((one) => one.status !== 200).data.error.code), codes(answers));
    assert.deepEqual([await copiesOf(mira, FIND), (await first('SELECT SUM(count) AS count FROM chest_goods')).count], [0, 2]);
    // "Weź" tapped twice by another character: the copies come out once.
    const druga = await create('Druga');
    answers = await together([
      { path: '/api/chest/goods/take', body: { kind: 'card', id: FIND, count: 2 } },
      { path: '/api/chest/goods/take', body: { kind: 'card', id: FIND, count: 2 } },
    ]);
    assert.equal(answers.filter((one) => one.status === 200).length, 1, codes(answers));
    assert.ok(['character_changed', 'not_in_chest'].includes(answers.find((one) => one.status !== 200).data.error.code), codes(answers));
    assert.deepEqual([await copiesOf(druga, FIND), (await first('SELECT COUNT(*) AS rows FROM chest_goods')).rows], [2, 0]);
  });

  test("a removed character's cards stay in the chest for the account's others", async () => {
    const mira = await create('Mira');
    await give(mira, FIND, 2);
    assert.equal((await put('card', FIND, 2)).status, 200);
    assert.equal((await call('DELETE', '/api/character', { cookie })).status, 200);
    assert.equal(await copiesOf(mira, FIND), 0);
    const druga = await create('Druga');
    assert.deepEqual(cardsIn(await chest()), [{ kind: 'card', id: FIND, count: 2, own: 0, have: 0 }]);
    assert.equal((await take('card', FIND, 2)).status, 200);
    assert.equal(await copiesOf(druga, FIND), 2);
  });
});

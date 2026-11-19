// Talia Systemu's cards on the Targowisko and in the Wymiana
// (src/server/card-goods.js, market.js, trades.js; DECISIONS.md, "Karty
// Talii: Skrzynia Konta, Targowisko i Wymiana (makiety, 19.11.2026)"; the
// author, 19.11.2026: „powinno się móc nimi też handlować i wymieniać miedzy
// graczami” and „karty z wymiany/targowiska niech nie uzupełniają
// encyklopedii jakby coś”): copies of a card put up for gold leave the
// collection, those from others first, and come back as they were when
// nobody buys them; a buyer gets them as from others, which count for the
// card's level but fill no Encyklopedia; the same in the Wymiana, both ways
// at once. No more copies than held, no card a match running now plays, no
// offer of one's own account bought, and two taps move the copies once.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { sellerShare, starterDeck } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const WORDS = content.cards.texts.goods;
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole));
// The mythic elite of the first land, in no starter deck.
const FIND = 'likho';
const IN_DECK = starterDeck(content)[0];
const refusal = (answer) => [answer.status, answer.data.error?.code, answer.data.error?.message];

// What a character holds of a card ({ copies, traded }), and whether its
// Encyklopedia counts it.
function holdings({ db, call }) {
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  return {
    held: async (characterId, id = FIND) => {
      const row = await first('SELECT copies, traded FROM cards WHERE character_id = ? AND monster_id = ?', characterId, id);
      return row ? { copies: row.copies, traded: row.traded } : null;
    },
    effects: async (characterId, id) => (await first('SELECT copies FROM card_effects WHERE character_id = ? AND effect_id = ?', characterId, id))?.copies ?? 0,
    found: async (cookie, id = FIND) => {
      const book = (await call('GET', '/api/encyclopedia', { cookie })).data.encyclopedia.cards;
      return book.lands.flatMap((land) => land.cards).some((card) => card.id === id && card.found);
    },
    give: async (characterId, id, copies, traded = 0) =>
      (await db())
        .prepare(
          'INSERT INTO cards (character_id, monster_id, copies, traded, created_at) VALUES (?, ?, ?, ?, 1) ON CONFLICT (character_id, monster_id) DO UPDATE SET copies = excluded.copies, traded = excluded.traded',
        )
        .bind(characterId, id, copies, traded)
        .run(),
    giveEffect: async (characterId, id, copies) =>
      (await db()).prepare('INSERT INTO card_effects (character_id, effect_id, copies, created_at) VALUES (?, ?, ?, 1) ON CONFLICT (character_id, effect_id) DO UPDATE SET copies = excluded.copies').bind(characterId, id, copies).run(),
  };
}

describe('cards of Talia Systemu on the Targowisko', () => {
  const { server, call, db, signUp } = useServer({ SETTLEMENT: 'on', CARDS: 'on' });
  const { held, effects, found, give, giveEffect } = holdings({ db, call });
  const cookies = {};
  const ids = {};

  // An account with a character of level 30 in the Osada and 100 000 gold.
  async function player(name, login = name.toLowerCase()) {
    const { cookie } = cookies[login] ? { cookie: cookies[login] } : await signUp(login);
    const made = await call('POST', '/api/character', { cookie, body: { name, classId: 'warrior', appearance: 'female' } });
    assert.equal(made.status, 201, JSON.stringify(made.data));
    await (await db()).prepare('UPDATE characters SET level = 30, class_level = 30, gold = 100000 WHERE name = ?').bind(name).run();
    cookies[login] = cookie;
    cookies[name] = cookie;
    ids[name] = (await (await db()).prepare('SELECT id FROM characters WHERE name = ?').bind(name).first()).id;
  }
  const market = async (name, query = '') => (await call('GET', `/api/market${query}`, { cookie: cookies[name] })).data.market;
  const act = (name, path, body) => call('POST', `/api/market/${path}`, { cookie: cookies[name], body });
  const gold = async (name) => (await (await db()).prepare('SELECT gold FROM characters WHERE id = ?').bind(ids[name]).first()).gold;
  const offers = async () => (await (await db()).prepare('SELECT id, kind, good, count, state, foreign_count FROM market_offers ORDER BY id').all()).results;
  // Requests that start together (chest-goods.test.js).
  async function together(name, requests) {
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
        .fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookies[name] }, body: stream, duplex: 'half' })
        .then(async (response) => ({ status: response.status, data: await response.json() }));
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    return Promise.all(answers);
  }

  beforeEach(async () => {
    for (const key of Object.keys(cookies)) delete cookies[key];
    await player('Kramarka');
    await player('Kupiec');
  });

  test("a card's copies go up for gold, leave the collection, and a buyer of another account gets them as from others", async () => {
    await give(ids.Kramarka, FIND, 3);
    assert.equal(await found(cookies.Kramarka), true);
    const listed = await act('Kramarka', 'list', { kind: 'card', key: FIND, count: 2, startPrice: 100, buyNow: 300, hours: 24 });
    assert.equal(listed.status, 200, JSON.stringify(listed.data));
    assert.deepEqual(await held(ids.Kramarka), { copies: 1, traded: 0 });
    assert.deepEqual(
      (await offers()).map(({ kind, good, count, foreign_count }) => ({ kind, good, count, foreign_count })),
      [{ kind: 'card', good: FIND, count: 2, foreign_count: 0 }],
    );
    // The seller's own offer, under "Moje", with the card's face.
    const mine = listed.data.market.mine[0];
    assert.deepEqual([mine.goods.kind, mine.goods.name, mine.goods.face.level, mine.goods.rarity], ['card', content.monstersById[FIND].name, 2, 'mythic']);

    // The buyer finds it in the tab of the cards.
    const seen = await market('Kupiec', '?kind=card');
    assert.equal(seen.counts.kinds.card, 1);
    assert.deepEqual(seen.offers.map((offer) => [offer.goods.kind, offer.goods.key, offer.goods.count]), [['card', FIND, 2]]);
    assert.deepEqual(seen.cards.have, {});
    const bought = await act('Kupiec', 'buy', { offerId: seen.offers[0].id });
    assert.equal(bought.status, 200, JSON.stringify(bought.data));
    assert.equal(await gold('Kupiec'), 100000 - 300);
    assert.equal((await act('Kupiec', 'collect', {})).status, 200);
    assert.deepEqual(await held(ids.Kupiec), { copies: 2, traded: 2 });
    // They count for the level, not in the Encyklopedia.
    const salon = (await call('GET', '/api/cards', { cookie: cookies.Kupiec })).data.cards.collection.find((card) => card.id === FIND);
    assert.equal(salon.level, 2);
    assert.equal(await found(cookies.Kupiec), false);
    // The seller's gold, less the Targowisko's fee; its own copy still a find.
    assert.equal((await act('Kramarka', 'collect', {})).status, 200);
    assert.equal(await gold('Kramarka'), 100000 + sellerShare(300, content));
    assert.equal(await found(cookies.Kramarka), true);
    // The Rejestr names the card on both sides.
    const log = (await call('GET', '/api/market/log', { cookie: cookies.Kupiec })).data.log;
    assert.deepEqual(log.map((line) => [line.event, line.goods.kind, line.goods.name, line.goods.count]), [['bought', 'card', content.monstersById[FIND].name, 2]]);
  });

  test('refusals: more copies than held, a card not held, a card a running match plays, one’s own offer and one of the same account', async () => {
    await give(ids.Kramarka, FIND, 2);
    assert.deepEqual(refusal(await act('Kramarka', 'list', { kind: 'card', key: FIND, count: 3, startPrice: 10 })), [409, 'not_enough', filled(WORDS.fewer, { count: 2 })]);
    assert.deepEqual(refusal(await act('Kramarka', 'list', { kind: 'card', key: 'wisp', count: 1, startPrice: 10 })), [409, 'not_enough', WORDS.missing]);
    assert.equal((await act('Kramarka', 'list', { kind: 'card', key: 'no-such-creature', count: 1, startPrice: 10 })).data.error.code, 'not_enough');
    assert.equal((await act('Kramarka', 'list', { kind: 'card', key: FIND, count: 1, startPrice: 0 })).data.error.code, 'invalid_price');
    // A training match plays the starter deck: its cards stay.
    assert.equal((await call('POST', '/api/cards/starter', { cookie: cookies.Kramarka })).status, 200);
    assert.equal((await call('POST', '/api/cards/match', { cookie: cookies.Kramarka, body: { tier: 1, staked: false } })).status, 200);
    const sellable = (await market('Kramarka')).sellable.stacks.filter((stack) => stack.kind === 'card');
    assert.deepEqual(
      [IN_DECK, FIND].map((id) => Boolean(sellable.find((stack) => stack.key === id)?.busy)),
      [true, false],
    );
    assert.deepEqual(refusal(await act('Kramarka', 'list', { kind: 'card', key: IN_DECK, count: 1, startPrice: 10 })), [409, 'card_in_match', WORDS.inMatch]);
    assert.equal((await call('POST', '/api/cards/surrender', { cookie: cookies.Kramarka })).status, 200);
    assert.equal((await act('Kramarka', 'list', { kind: 'card', key: IN_DECK, count: 1, startPrice: 10, buyNow: 20 })).status, 200);
    // Its last copy gone, the deck in play is incomplete.
    const decks = (await call('GET', '/api/cards', { cookie: cookies.Kramarka })).data.cards;
    assert.equal(decks.decks.slots[decks.decks.active - 1].whole, false);

    const offer = (await offers()).find((one) => one.good === IN_DECK);
    assert.equal((await act('Kramarka', 'buy', { offerId: offer.id })).data.error.code, 'own_offer');
    // Another character of the same account does not buy it either.
    await player('Druga', 'kramarka');
    assert.equal((await act('Druga', 'buy', { offerId: offer.id })).data.error.code, 'same_account');
    assert.equal((await act('Kupiec', 'buy', { offerId: offer.id })).status, 200);
  });

  test('an offer taken back or ended without a buyer gives the copies back as they were', async () => {
    // Three copies, two of them from others (a trade before).
    await give(ids.Kupiec, FIND, 3, 2);
    // Two go up: those from others first, so its own copy stays, its find.
    assert.equal((await act('Kupiec', 'list', { kind: 'card', key: FIND, count: 2, startPrice: 50 })).status, 200);
    assert.deepEqual(await held(ids.Kupiec), { copies: 1, traded: 0 });
    assert.equal(await found(cookies.Kupiec), true);
    assert.equal((await offers())[0].foreign_count, 2);
    assert.equal((await act('Kupiec', 'cancel', { offerId: (await offers())[0].id })).status, 200);
    assert.equal((await act('Kupiec', 'collect', {})).status, 200);
    assert.deepEqual(await held(ids.Kupiec), { copies: 3, traded: 2 });
    // All three go up and end unsold: its own copy comes back as its own.
    assert.equal((await act('Kupiec', 'list', { kind: 'card', key: FIND, count: 3, startPrice: 50, hours: 1 })).status, 200);
    assert.deepEqual([await held(ids.Kupiec), await found(cookies.Kupiec)], [null, false]);
    await (await db()).prepare("UPDATE market_offers SET ends_at = ? WHERE state = 'open'").bind(Date.now() - 1).run();
    const parcels = (await market('Kupiec')).parcels;
    assert.deepEqual(parcels.map((parcel) => [parcel.reason, parcel.goods.kind, parcel.goods.count]), [['returned', 'card', 3]]);
    assert.equal((await act('Kupiec', 'collect', {})).status, 200);
    assert.deepEqual(await held(ids.Kupiec), { copies: 3, traded: 2 });
    assert.equal(await found(cookies.Kupiec), true);
  });

  test('effect cards go up and are bought the same way', async () => {
    await giveEffect(ids.Kramarka, 'mist', 2);
    assert.equal((await act('Kramarka', 'list', { kind: 'effect-card', key: 'mist', count: 2, startPrice: 40, buyNow: 80 })).status, 200);
    assert.equal(await effects(ids.Kramarka, 'mist'), 0);
    const seen = await market('Kupiec', '?kind=effect-card');
    assert.deepEqual(seen.offers.map((offer) => [offer.goods.kind, offer.goods.key, offer.goods.face.effect]), [['effect-card', 'mist', true]]);
    assert.equal((await act('Kupiec', 'buy', { offerId: seen.offers[0].id })).status, 200);
    assert.equal((await act('Kupiec', 'collect', {})).status, 200);
    assert.equal(await effects(ids.Kupiec, 'mist'), 2);
  });

  test('two taps at once put the copies up once', async () => {
    await give(ids.Kramarka, FIND, 2);
    const body = { kind: 'card', key: FIND, count: 2, startPrice: 30 };
    const answers = await together('Kramarka', [
      { path: '/api/market/list', body },
      { path: '/api/market/list', body },
    ]);
    assert.deepEqual(answers.map((one) => one.status).sort(), [200, 409]);
    assert.ok(['character_changed', 'not_enough'].includes(answers.find((one) => one.status === 409).data.error.code));
    assert.deepEqual([await held(ids.Kramarka), (await offers()).length], [null, 1]);
  });
});

describe('cards of Talia Systemu in the Wymiana', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on', CARDS: 'on' });
  const { held, effects, found, give, giveEffect } = holdings({ db, call });
  const players = {};
  const ids = {};

  // An account with a character at the Wymiana's level, 500 gold, online
  // (trades.test.js).
  async function player(login) {
    const { cookie } = await signUp(login);
    await call('POST', '/api/character', { cookie, body: { name: login, classId: 'mage', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = 30, gold = 500 WHERE name = ?').bind(login).run();
    await call('GET', '/api/chat/latest', { cookie });
    players[login] = cookie;
    ids[login] = (await (await db()).prepare('SELECT id FROM characters WHERE name = ?').bind(login).first()).id;
  }
  const trade = (login, action, body) => call('POST', `/api/trade/${action}`, { cookie: players[login], body });

  beforeEach(async () => {
    await player('Ala');
    await player('Ola');
  });

  // Ala proposes, Ola accepts.
  async function opened() {
    const proposed = await trade('Ala', 'propose', { id: ids.Ola });
    assert.equal(proposed.status, 200, JSON.stringify(proposed.data));
    const answered = await trade('Ola', 'answer', { id: proposed.data.trade.id, accept: true });
    assert.equal(answered.data.trade.state, 'open');
    return proposed.data.trade.id;
  }
  // Both confirm the offers as they are.
  async function confirmed(id) {
    const now = (await call('GET', `/api/trade?id=${id}`, { cookie: players.Ola })).data.trade;
    const locked = await trade('Ola', 'confirm', { id, version: now.version });
    assert.equal(locked.data.trade.state, 'locked', JSON.stringify(locked.data));
    return trade('Ala', 'confirm', { id, version: locked.data.trade.version });
  }

  test('cards go with the offers, both ways at once; the copies got come as from others', async () => {
    await give(ids.Ala, FIND, 2);
    await giveEffect(ids.Ala, 'mist', 1);
    await give(ids.Ola, 'wisp', 1);
    const id = await opened();
    // The cards to offer come with the trade while it is open.
    const open = (await call('GET', `/api/trade?id=${id}`, { cookie: players.Ala })).data.trade;
    assert.deepEqual(
      open.cards.own.map(({ kind, id: card, copies, busy }) => [kind, card, copies, busy]),
      [
        ['card', FIND, 2, false],
        ['effect-card', 'mist', 1, false],
      ],
    );
    assert.equal((await trade('Ala', 'offer', { id, offer: { cards: { [FIND]: 2 }, effectCards: { mist: 1 } } })).status, 200);
    const offered = await trade('Ola', 'offer', { id, offer: { cards: { wisp: 1 }, gold: 50 } });
    assert.deepEqual(
      offered.data.trade.theirs.cards.map(({ kind, id: card, count, cardName }) => [kind, card, count, cardName]),
      [
        ['card', FIND, 2, content.monstersById[FIND].name],
        ['effect-card', 'mist', 1, content.cards.effects.cards.find((one) => one.id === 'mist').name],
      ],
    );
    const done = await confirmed(id);
    assert.equal(done.status, 200, JSON.stringify(done.data));
    assert.equal(done.data.trade.state, 'done');
    assert.deepEqual([await held(ids.Ala), await held(ids.Ola)], [null, { copies: 2, traded: 2 }]);
    assert.deepEqual([await effects(ids.Ala, 'mist'), await effects(ids.Ola, 'mist')], [0, 1]);
    assert.deepEqual([await held(ids.Ala, 'wisp'), await held(ids.Ola, 'wisp')], [{ copies: 1, traded: 1 }, null]);
    // Got in a trade: the level, not the Encyklopedia.
    assert.equal(await found(players.Ola), false);
    assert.equal(await found(players.Ala, 'wisp'), false);
  });

  test('the same card both ways: the copies from others go first, and each gets the other’s as from others', async () => {
    // Ala: three copies, one of them from others (a trade before); Ola: one
    // of her own.
    await give(ids.Ala, FIND, 3, 1);
    await give(ids.Ola, FIND, 1);
    const id = await opened();
    await trade('Ala', 'offer', { id, offer: { cards: { [FIND]: 1 } } });
    await trade('Ola', 'offer', { id, offer: { cards: { [FIND]: 1 } } });
    assert.equal((await confirmed(id)).status, 200);
    assert.deepEqual([await held(ids.Ala), await held(ids.Ola)], [
      { copies: 3, traded: 1 },
      { copies: 1, traded: 1 },
    ]);
    assert.equal(await found(players.Ala), true, 'her own copies stayed');
    assert.equal(await found(players.Ola), false);
  });

  test('refusals: more copies than held, an unknown card, a card a running match plays; a card gone before the accept moves nothing', async () => {
    await give(ids.Ala, FIND, 2);
    const id = await opened();
    assert.deepEqual(refusal(await trade('Ala', 'offer', { id, offer: { cards: { [FIND]: 3 } } })), [409, 'not_enough', `Masz mniej sztuk: ${content.monstersById[FIND].name}.`]);
    assert.equal((await trade('Ala', 'offer', { id, offer: { cards: { 'no-such-creature': 1 } } })).data.error.code, 'invalid_offer');
    assert.equal((await trade('Ala', 'offer', { id, offer: { effectCards: { [FIND]: 1 } } })).data.error.code, 'invalid_offer');
    assert.equal((await trade('Ala', 'offer', { id, offer: { cards: { [FIND]: 1.5 } } })).data.error.code, 'invalid_offer');
    // A card the running match plays (the starter deck at Szczęsny's) stays.
    assert.equal((await call('POST', '/api/cards/starter', { cookie: players.Ala })).status, 200);
    assert.equal((await call('POST', '/api/cards/match', { cookie: players.Ala, body: { tier: 1, staked: false } })).status, 200);
    assert.deepEqual(refusal(await trade('Ala', 'offer', { id, offer: { cards: { [IN_DECK]: 1 } } })), [409, 'card_in_match', WORDS.inMatch]);
    assert.equal((await call('POST', '/api/cards/surrender', { cookie: players.Ala })).status, 200);

    // Offered, confirmed by Ola, then a copy leaves Ala before her accept.
    assert.equal((await trade('Ala', 'offer', { id, offer: { cards: { [FIND]: 2 } } })).status, 200);
    const now = (await call('GET', `/api/trade?id=${id}`, { cookie: players.Ola })).data.trade;
    const locked = await trade('Ola', 'confirm', { id, version: now.version });
    assert.equal(locked.data.trade.state, 'locked');
    await give(ids.Ala, FIND, 1);
    const late = await trade('Ala', 'confirm', { id, version: locked.data.trade.version });
    assert.deepEqual([late.status, late.data.error.code], [409, 'stale']);
    assert.deepEqual([await held(ids.Ala), await held(ids.Ola)], [{ copies: 1, traded: 0 }, null]);
  });
});

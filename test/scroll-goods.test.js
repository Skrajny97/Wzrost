// The scrolls as goods (1061; the author, 16.11.2026: „zrób tak żeby zwoje
// tez można było wystawiać na sprzedaż, wymieniać i wszystko na targowisku
// i wszędzie”): the Zwój ochronny, the Zwój utrwalenia and the Zwój
// Niepamięci on the Targowisko, in the Wymiana, in the Skrzynia Konta and in
// the Prośby Gildii, each kept in its own number column.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { useServer } from './helpers/server.js';

describe('the scrolls as goods', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on', SETTLEMENT: 'on' });
  const cookies = {};

  // An account with a character of level 25, 100 000 gold, online.
  async function player(name, login = name.toLowerCase()) {
    const { cookie } = await signUp(login);
    const made = await call('POST', '/api/character', { cookie, body: { name, classId: 'warrior', appearance: 'female' } });
    assert.equal(made.status, 201, JSON.stringify(made.data));
    await (await db()).prepare('UPDATE characters SET level = 25, class_level = 25, gold = 100000 WHERE name = ?').bind(name).run();
    await call('GET', '/api/chat/latest', { cookie });
    cookies[name] = cookie;
    return cookie;
  }
  const row = async (name) => (await db()).prepare('SELECT * FROM characters WHERE name = ?').bind(name).first();
  const scrolls = async (name) => {
    const one = await row(name);
    return [one.scrolls, one.steady_scrolls, one.oblivion_scrolls];
  };
  const setScrolls = async (name, ward, steady, oblivion) =>
    (await db()).prepare('UPDATE characters SET scrolls = ?, steady_scrolls = ?, oblivion_scrolls = ? WHERE name = ?').bind(ward, steady, oblivion, name).run();
  const market = (name, path, body) => call('POST', `/api/market/${path}`, { cookie: cookies[name], body });

  beforeEach(async () => {
    await player('Kramarka');
    await player('Kupiec');
  });

  test('the character view names every scroll it holds', async () => {
    await setScrolls('Kramarka', 2, 0, 1);
    const { character } = (await call('GET', '/api/character', { cookie: cookies.Kramarka })).data;
    assert.deepEqual(
      character.scrollGoods.map(({ id, name, count }) => [id, name, count]),
      [
        ['ward-scroll', 'Zwój ochronny', 2],
        ['oblivion-scroll', 'Zwój Niepamięci', 1],
      ],
    );
  });

  test('on the Targowisko: put up, bought at once, collected; one taken back comes back', async () => {
    await setScrolls('Kramarka', 3, 2, 1);
    const view = (await call('GET', '/api/market', { cookie: cookies.Kramarka })).data.market;
    assert.deepEqual(
      view.sellable.stacks.filter((stack) => stack.kind === 'scroll').map(({ key, count, name }) => [key, count, name]),
      [
        ['ward-scroll', 3, 'Zwój ochronny'],
        ['steady-scroll', 2, 'Zwój utrwalenia'],
        ['oblivion-scroll', 1, 'Zwój Niepamięci'],
      ],
    );
    assert.equal((await market('Kramarka', 'list', { kind: 'scroll', key: 'ward-scroll', count: 4, startPrice: 100 })).data.error.code, 'not_enough');
    assert.equal((await market('Kramarka', 'list', { kind: 'scroll', key: 'boot', count: 1, startPrice: 100 })).data.error.code, 'not_enough');
    const listed = await market('Kramarka', 'list', { kind: 'scroll', key: 'ward-scroll', count: 2, startPrice: 500, buyNow: 1500 });
    assert.equal(listed.status, 200, JSON.stringify(listed.data));
    assert.deepEqual(await scrolls('Kramarka'), [1, 2, 1]);
    const offer = await (await db()).prepare("SELECT id, kind, good, count FROM market_offers WHERE state = 'open'").first();
    assert.deepEqual([offer.kind, offer.good, offer.count], ['scroll', 'ward-scroll', 2]);
    // The buyer sees it among the scrolls.
    const browsed = (await call('GET', '/api/market?kind=scroll', { cookie: cookies.Kupiec })).data.market;
    assert.equal(browsed.counts.kinds.scroll, 1);
    assert.deepEqual(
      browsed.offers.map((one) => [one.goods.kind, one.goods.key, one.goods.name]),
      [['scroll', 'ward-scroll', 'Zwój ochronny']],
    );
    const bought = await market('Kupiec', 'buy', { offerId: offer.id });
    assert.equal(bought.status, 200, JSON.stringify(bought.data));
    const collected = await market('Kupiec', 'collect', {});
    assert.equal(collected.status, 200, JSON.stringify(collected.data));
    assert.deepEqual(await scrolls('Kupiec'), [2, 0, 0]);
    assert.deepEqual(
      collected.data.character.scrollGoods.map(({ id, count }) => [id, count]),
      [['ward-scroll', 2]],
    );
    // The Zwój Niepamięci, put up and taken back, comes back as it was.
    const again = await market('Kramarka', 'list', { kind: 'scroll', key: 'oblivion-scroll', count: 1, startPrice: 900 });
    assert.equal(again.status, 200, JSON.stringify(again.data));
    assert.deepEqual(await scrolls('Kramarka'), [1, 2, 0]);
    const second = await (await db()).prepare("SELECT id FROM market_offers WHERE state = 'open'").first();
    assert.equal((await market('Kramarka', 'cancel', { offerId: second.id })).status, 200);
    assert.equal((await market('Kramarka', 'collect', {})).status, 200);
    assert.equal((await row('Kramarka')).oblivion_scrolls, 1);
  });

  test('in the Wymiana: the scrolls go both ways at once', async () => {
    await setScrolls('Kramarka', 0, 3, 1);
    await setScrolls('Kupiec', 2, 0, 0);
    const trade = (name, action, body) => call('POST', `/api/trade/${action}`, { cookie: cookies[name], body });
    const proposed = await trade('Kramarka', 'propose', { id: (await row('Kupiec')).id });
    assert.equal(proposed.status, 200, JSON.stringify(proposed.data));
    const id = proposed.data.trade.id;
    assert.equal((await trade('Kupiec', 'answer', { id, accept: true })).data.trade.state, 'open');
    assert.equal((await trade('Kramarka', 'offer', { id, offer: { scrolls: { 'steady-scroll': 4 } } })).data.error.code, 'not_enough');
    await trade('Kramarka', 'offer', { id, offer: { scrolls: { 'steady-scroll': 2, 'oblivion-scroll': 1 } } });
    const offered = await trade('Kupiec', 'offer', { id, offer: { scrolls: { 'ward-scroll': 1 } } });
    assert.deepEqual(
      offered.data.trade.theirs.scrolls.map(({ id: scroll, name, count }) => [scroll, name, count]),
      [
        ['steady-scroll', 'Zwój utrwalenia', 2],
        ['oblivion-scroll', 'Zwój Niepamięci', 1],
      ],
    );
    const locked = await trade('Kupiec', 'confirm', { id, version: offered.data.trade.version });
    const done = await trade('Kramarka', 'confirm', { id, version: locked.data.trade.version });
    assert.equal(done.status, 200, JSON.stringify(done.data));
    assert.equal(done.data.trade.state, 'done');
    assert.deepEqual(await scrolls('Kramarka'), [1, 1, 0]);
    assert.deepEqual(await scrolls('Kupiec'), [1, 2, 1]);
  });

  test('in the Skrzynia Konta: in from one character, out to another of the account', async () => {
    await setScrolls('Kramarka', 0, 0, 2);
    const put = await call('POST', '/api/chest/goods/put', { cookie: cookies.Kramarka, body: { kind: 'scroll', id: 'oblivion-scroll', count: 2 } });
    assert.equal(put.status, 200, JSON.stringify(put.data));
    assert.deepEqual(
      put.data.chest.goods.map(({ kind, id, count, name }) => [kind, id, count, name]),
      [['scroll', 'oblivion-scroll', 2, 'Zwój Niepamięci']],
    );
    assert.equal((await row('Kramarka')).oblivion_scrolls, 0);
    // A second character of the same account, played from now, also of the
    // chest's level.
    const second = await call('POST', '/api/character', { cookie: cookies.Kramarka, body: { name: 'Druga', classId: 'mage', appearance: 'female' } });
    assert.equal(second.status, 201, JSON.stringify(second.data));
    await (await db()).prepare('UPDATE characters SET level = 25 WHERE name = ?').bind('Druga').run();
    const taken = await call('POST', '/api/chest/goods/take', { cookie: cookies.Kramarka, body: { kind: 'scroll', id: 'oblivion-scroll', count: 1 } });
    assert.equal(taken.status, 200, JSON.stringify(taken.data));
    assert.equal((await row('Druga')).oblivion_scrolls, 1);
  });
});

describe('the scrolls in the Prośby Gildii', () => {
  const { call, db, signUp } = useServer();
  const cookies = {};
  async function player(login, name) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = 30, class_level = 25, gold = 5000 WHERE name = ?').bind(name).run();
  }
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const held = async (name) => (await (await db()).prepare('SELECT steady_scrolls FROM characters WHERE name = ?').bind(name).first()).steady_scrolls;

  beforeEach(async () => {
    await player('mistrz', 'Mistrz');
    await player('druh', 'Druh');
    await as('mistrz', 'POST', '/api/guild/found', { name: 'Leśni Bracia', tag: 'LB' });
    const guildId = (await as('mistrz', 'GET', '/api/guild')).data.guild.id;
    await as('mistrz', 'POST', '/api/guild/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/guild/accept', { guildId });
  });

  test('a member asks for scrolls, held or not, and another gives them from its own', async () => {
    const seen = (await as('mistrz', 'GET', '/api/guild/requests')).data;
    assert.deepEqual(
      seen.known.filter((goods) => goods.kind === 'scroll').map((goods) => [goods.key, goods.name]),
      [
        ['oblivion-scroll', 'Zwój Niepamięci'],
        ['ward-scroll', 'Zwój ochronny'],
        ['steady-scroll', 'Zwój utrwalenia'],
      ],
    );
    assert.equal((await as('mistrz', 'POST', '/api/guild/requests', { kind: 'scroll', key: 'boot', count: 1 })).data.error.code, 'invalid_goods');
    const made = await as('mistrz', 'POST', '/api/guild/requests', { kind: 'scroll', key: 'steady-scroll', count: 3 });
    assert.equal(made.status, 200, JSON.stringify(made.data).slice(0, 300));
    await (await db()).prepare('UPDATE characters SET steady_scrolls = 2 WHERE name = ?').bind('Druh').run();
    const requestId = made.data.mine.id;
    assert.equal((await as('druh', 'POST', '/api/guild/requests/give', { requestId, count: 3 })).data.error.code, 'not_enough');
    const given = await as('druh', 'POST', '/api/guild/requests/give', { requestId, count: 2 });
    assert.equal(given.status, 200, JSON.stringify(given.data).slice(0, 300));
    assert.deepEqual([await held('Druh'), await held('Mistrz')], [0, 2]);
  });
});

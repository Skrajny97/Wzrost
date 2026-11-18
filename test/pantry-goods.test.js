// The Spiżarnia's goods as goods (the author, 18.11.2026: „dodanie opcji
// sprzedaży rzeczy gotowanych i składników”): fish, crops and dishes on the
// Targowisko and in the Wymiana, as herbs or minerals.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { useServer } from './helpers/server.js';

describe('the Spiżarnia on the Targowisko and in the Wymiana', () => {
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
  const pantry = async (name) => JSON.parse((await row(name)).pantry ?? '{}');
  const setPantry = async (name, goods) => (await db()).prepare('UPDATE characters SET pantry = ? WHERE name = ?').bind(JSON.stringify(goods), name).run();
  const market = (name, path, body) => call('POST', `/api/market/${path}`, { cookie: cookies[name], body });

  beforeEach(async () => {
    await player('Rybaczka');
    await player('Kucharz');
  });

  test('on the Targowisko: a dish and a fish put up, bought and collected', async () => {
    await setPantry('Rybaczka', { roach: 12, 'pea-soup': 3 });
    const view = (await call('GET', '/api/market', { cookie: cookies.Rybaczka })).data.market;
    assert.deepEqual(
      view.sellable.stacks
        .filter((stack) => stack.kind === 'pantry')
        .map(({ key, count, name, group }) => [key, count, name, group])
        .sort(),
      [
        ['pea-soup', 3, 'Grochówka', 'dish'],
        ['roach', 12, 'Płotka', 'fish'],
      ],
    );
    assert.equal((await market('Rybaczka', 'list', { kind: 'pantry', key: 'roach', count: 13, startPrice: 100 })).data.error.code, 'not_enough');
    assert.equal((await market('Rybaczka', 'list', { kind: 'pantry', key: 'boot', count: 1, startPrice: 100 })).data.error.code, 'not_enough');
    const listed = await market('Rybaczka', 'list', { kind: 'pantry', key: 'pea-soup', count: 2, startPrice: 200, buyNow: 600 });
    assert.equal(listed.status, 200, JSON.stringify(listed.data));
    assert.deepEqual(await pantry('Rybaczka'), { roach: 12, 'pea-soup': 1 });
    const offer = await (await db()).prepare("SELECT id, kind, good, count FROM market_offers WHERE state = 'open'").first();
    assert.deepEqual([offer.kind, offer.good, offer.count], ['pantry', 'pea-soup', 2]);
    // The buyer finds it under the Spiżarnia's tab.
    const browsed = (await call('GET', '/api/market?kind=pantry', { cookie: cookies.Kucharz })).data.market;
    assert.equal(browsed.counts.kinds.pantry, 1);
    assert.deepEqual(
      browsed.offers.map((one) => [one.goods.kind, one.goods.key, one.goods.name, one.goods.group]),
      [['pantry', 'pea-soup', 'Grochówka', 'dish']],
    );
    const bought = await market('Kucharz', 'buy', { offerId: offer.id });
    assert.equal(bought.status, 200, JSON.stringify(bought.data));
    const collected = await market('Kucharz', 'collect', {});
    assert.equal(collected.status, 200, JSON.stringify(collected.data));
    assert.deepEqual(await pantry('Kucharz'), { 'pea-soup': 2 });
    assert.deepEqual(
      collected.data.character.pantry.map(({ id, count }) => [id, count]),
      [['pea-soup', 2]],
    );
    // The fish, put up and taken back, comes back to the Spiżarnia.
    const again = await market('Rybaczka', 'list', { kind: 'pantry', key: 'roach', count: 12, startPrice: 50 });
    assert.equal(again.status, 200, JSON.stringify(again.data));
    assert.deepEqual(await pantry('Rybaczka'), { 'pea-soup': 1 });
    const second = await (await db()).prepare("SELECT id FROM market_offers WHERE state = 'open'").first();
    assert.equal((await market('Rybaczka', 'cancel', { offerId: second.id })).status, 200);
    assert.equal((await market('Rybaczka', 'collect', {})).status, 200);
    assert.deepEqual(await pantry('Rybaczka'), { 'pea-soup': 1, roach: 12 });
  });

  test('in the Wymiana: crops for fish, both ways at once', async () => {
    await setPantry('Rybaczka', { perch: 5 });
    await setPantry('Kucharz', { turnip: 8, 'baked-turnip': 1 });
    const trade = (name, action, body) => call('POST', `/api/trade/${action}`, { cookie: cookies[name], body });
    const proposed = await trade('Rybaczka', 'propose', { id: (await row('Kucharz')).id });
    assert.equal(proposed.status, 200, JSON.stringify(proposed.data));
    const id = proposed.data.trade.id;
    assert.equal((await trade('Kucharz', 'answer', { id, accept: true })).data.trade.state, 'open');
    assert.equal((await trade('Rybaczka', 'offer', { id, offer: { pantry: { perch: 6 } } })).data.error.code, 'not_enough');
    await trade('Rybaczka', 'offer', { id, offer: { pantry: { perch: 5 } } });
    const offered = await trade('Kucharz', 'offer', { id, offer: { pantry: { turnip: 3, 'baked-turnip': 1 } } });
    assert.deepEqual(
      offered.data.trade.theirs.pantry.map(({ id: good, name, count }) => [good, name, count]),
      [['perch', 'Okoń', 5]],
    );
    const locked = await trade('Kucharz', 'confirm', { id, version: offered.data.trade.version });
    const done = await trade('Rybaczka', 'confirm', { id, version: locked.data.trade.version });
    assert.equal(done.status, 200, JSON.stringify(done.data));
    assert.equal(done.data.trade.state, 'done');
    assert.deepEqual(await pantry('Rybaczka'), { turnip: 3, 'baked-turnip': 1 });
    assert.deepEqual(await pantry('Kucharz'), { turnip: 5, perch: 5 });
  });
});

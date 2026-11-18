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

describe('the Spiżarnia in the Prośby Gildii', () => {
  const { call, db, signUp } = useServer();
  const cookies = {};
  async function player(login, name) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = 30, class_level = 25, gold = 5000 WHERE name = ?').bind(name).run();
  }
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const pantry = async (name) => JSON.parse((await (await db()).prepare('SELECT pantry FROM characters WHERE name = ?').bind(name).first()).pantry ?? '{}');

  beforeEach(async () => {
    await player('kucharka', 'Kucharka');
    await player('rybak', 'Rybak');
    await as('kucharka', 'POST', '/api/guild/found', { name: 'Smakosze', tag: 'SMK' });
    const guildId = (await as('kucharka', 'GET', '/api/guild')).data.guild.id;
    await as('kucharka', 'POST', '/api/guild/invite', { name: 'Rybak' });
    await as('rybak', 'POST', '/api/guild/accept', { guildId });
  });

  test('a member asks for a fish it never had, and another gives it from its Spiżarnia', async () => {
    const seen = (await as('kucharka', 'GET', '/api/guild/requests')).data;
    assert.ok(seen.known.some((goods) => goods.kind === 'pantry' && goods.key === 'roach' && goods.name === 'Płotka'));
    assert.equal((await as('kucharka', 'POST', '/api/guild/requests', { kind: 'pantry', key: 'boot', count: 1 })).data.error.code, 'invalid_goods');
    const made = await as('kucharka', 'POST', '/api/guild/requests', { kind: 'pantry', key: 'roach', count: 10 });
    assert.equal(made.status, 200, JSON.stringify(made.data).slice(0, 300));
    await (await db()).prepare('UPDATE characters SET pantry = ? WHERE name = ?').bind(JSON.stringify({ roach: 6 }), 'Rybak').run();
    const requestId = made.data.mine.id;
    assert.equal((await as('rybak', 'POST', '/api/guild/requests/give', { requestId, count: 7 })).data.error.code, 'not_enough');
    const given = await as('rybak', 'POST', '/api/guild/requests/give', { requestId, count: 6 });
    assert.equal(given.status, 200, JSON.stringify(given.data).slice(0, 300));
    assert.deepEqual([await pantry('Rybak'), await pantry('Kucharka')], [{}, { roach: 6 }]);
  });
});

describe('the Spiżarnia in the Skrzynia Gildii', () => {
  const { call, db, signUp } = useServer();
  const cookies = {};
  async function player(login, name) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = 30, class_level = 25, gold = 5000 WHERE name = ?').bind(name).run();
  }
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const pantry = async (name) => JSON.parse((await (await db()).prepare('SELECT pantry FROM characters WHERE name = ?').bind(name).first()).pantry ?? '{}');
  const id = async (name) => (await (await db()).prepare('SELECT id FROM characters WHERE name = ?').bind(name).first()).id;

  beforeEach(async () => {
    await player('kucharka', 'Kucharka');
    await player('rybak', 'Rybak');
    await player('trzeci', 'Trzeci');
    await as('kucharka', 'POST', '/api/guild/found', { name: 'Smakosze', tag: 'SMK' });
    const guildId = (await as('kucharka', 'GET', '/api/guild')).data.guild.id;
    for (const [login, name] of [['rybak', 'Rybak'], ['trzeci', 'Trzeci']]) {
      await as('kucharka', 'POST', '/api/guild/invite', { name });
      await as(login, 'POST', '/api/guild/accept', { guildId });
    }
    // Out of the Nowicjusz's days, so items for all are theirs to take.
    await (await db()).prepare('UPDATE guild_members SET probation_until = 0').run();
  });

  test('a lot of fish for one member, a dish for all: put, taken whole, the log names them', async () => {
    await (await db()).prepare('UPDATE characters SET pantry = ? WHERE name = ?').bind(JSON.stringify({ roach: 9, 'pea-soup': 2 }), 'Kucharka').run();
    assert.equal((await as('kucharka', 'POST', '/api/guild/chest/put-goods', { kind: 'pantry', key: 'roach', count: 10 })).data.error.code, 'not_enough');
    assert.equal((await as('kucharka', 'POST', '/api/guild/chest/put-goods', { kind: 'herb', key: 'roach', count: 1 })).status, 404);
    const forRybak = await as('kucharka', 'POST', '/api/guild/chest/put-goods', { kind: 'pantry', key: 'roach', count: 6, forId: await id('Rybak') });
    assert.equal(forRybak.status, 200, JSON.stringify(forRybak.data).slice(0, 300));
    const forAll = await as('kucharka', 'POST', '/api/guild/chest/put-goods', { kind: 'pantry', key: 'pea-soup', count: 2 });
    assert.equal(forAll.status, 200, JSON.stringify(forAll.data).slice(0, 300));
    assert.deepEqual(await pantry('Kucharka'), { roach: 3 });
    // Rybak sees both lots, the one for it first; Trzeci may not take Rybak's.
    const seen = (await as('rybak', 'GET', '/api/guild/chest')).data;
    assert.deepEqual(
      seen.items.map((one) => [one.goods.key, one.goods.count, one.goods.name, one.forYou, one.canTake]),
      [
        ['roach', 6, 'Płotka', true, true],
        ['pea-soup', 2, 'Grochówka', false, true],
      ],
    );
    const fishLot = seen.items[0].id;
    assert.equal((await as('trzeci', 'POST', '/api/guild/chest/take', { id: fishLot })).data.error.code, 'not_yours');
    const taken = await as('rybak', 'POST', '/api/guild/chest/take', { id: fishLot });
    assert.equal(taken.status, 200, JSON.stringify(taken.data).slice(0, 300));
    assert.deepEqual(await pantry('Rybak'), { roach: 6 });
    // The dish, for all, goes to the first who takes it.
    assert.equal((await as('trzeci', 'POST', '/api/guild/chest/take', { id: seen.items[1].id })).status, 200);
    assert.deepEqual(await pantry('Trzeci'), { 'pea-soup': 2 });
    const log = (await as('kucharka', 'GET', '/api/guild/chest')).data.log;
    assert.deepEqual(
      log.map((move) => [move.kind, move.name, move.item.name]),
      [
        ['take', 'Trzeci', 'Grochówka ×2'],
        ['take', 'Rybak', 'Płotka ×6'],
        ['put', 'Kucharka', 'Grochówka ×2'],
        ['put', 'Kucharka', 'Płotka ×6'],
      ],
    );
  });
});

// The Wymiana in the Gildia (src/server/guild-exchange.js) with the
// Spiżarnia's goods as "pantry:<id>": set aside at once, swapped whole,
// given back on a withdrawal and when the time is up.
describe('the Spiżarnia in the Wymiana in the Gildia', () => {
  const { call, db, signUp } = useServer();
  const cookies = {};
  async function player(login, name) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare("UPDATE characters SET level = 30, class_level = 25, gold = 5000, resources = '{}' WHERE name = ?").bind(name).run();
  }
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const row = async (name) => (await db()).prepare('SELECT pantry, resources, gold FROM characters WHERE name = ?').bind(name).first();
  const pantry = async (name) => JSON.parse((await row(name)).pantry ?? '{}');
  const resources = async (name) => JSON.parse((await row(name)).resources ?? '{}');
  const post = (login, give, giveCount, want, wantCount) => as(login, 'POST', '/api/guild/exchange', { give: { resource: give, count: giveCount }, want: { resource: want, count: wantCount } });

  beforeEach(async () => {
    await player('kucharka', 'Kucharka');
    await player('rybak', 'Rybak');
    await player('trzeci', 'Trzeci');
    await as('kucharka', 'POST', '/api/guild/found', { name: 'Smakosze', tag: 'SMK' });
    const guildId = (await as('kucharka', 'GET', '/api/guild')).data.guild.id;
    for (const [login, name] of [['rybak', 'Rybak'], ['trzeci', 'Trzeci']]) {
      await as('kucharka', 'POST', '/api/guild/invite', { name });
      await as(login, 'POST', '/api/guild/accept', { guildId });
    }
  });

  test('fish for wood: set aside, taken whole, both sides swapped', async () => {
    await run('UPDATE characters SET pantry = ? WHERE name = ?', JSON.stringify({ roach: 9 }), 'Kucharka');
    // Not held, too many, or no such good.
    const none = await post('kucharka', 'pantry:pea-soup', 1, 'wood', 10);
    assert.equal(none.data.error.message, 'Nie masz w Spiżarni: Grochówka.');
    const short = await post('kucharka', 'pantry:roach', 10, 'wood', 10);
    assert.equal(short.data.error.message, 'Masz tylko 9 szt. „Płotka”.');
    assert.equal((await post('kucharka', 'pantry:nothing', 1, 'wood', 10)).data.error.code, 'invalid_resource');
    const posted = await post('kucharka', 'pantry:roach', 5, 'wood', 30);
    assert.equal(posted.status, 200, JSON.stringify(posted.data).slice(0, 300));
    assert.equal(posted.data.text, 'Oferta wystawiona: Płotka\u00a0×\u00a05 za Drewno\u00a0×\u00a030.');
    assert.deepEqual(await pantry('Kucharka'), { roach: 4 });
    assert.equal(posted.data.pantry.roach, 4);
    assert.ok(posted.data.rules.pantry.some((good) => good.id === 'pantry:roach' && good.name === 'Płotka' && good.group === 'fish'));
    // Rybak without wood sees what is missing; with it, takes the offer.
    const seen = (await as('rybak', 'GET', '/api/guild/exchange')).data.offers[0];
    assert.deepEqual([seen.give.name, seen.want.name, seen.canTake, seen.missing], ['Płotka', 'Drewno', false, 30]);
    assert.equal((await as('rybak', 'POST', '/api/guild/exchange/take', { offerId: seen.id })).data.error.message, 'Brakuje: 30 drewna.');
    await run('UPDATE characters SET resources = ? WHERE name = ?', JSON.stringify({ wood: 50 }), 'Rybak');
    const took = await as('rybak', 'POST', '/api/guild/exchange/take', { offerId: seen.id });
    assert.equal(took.status, 200, JSON.stringify(took.data).slice(0, 300));
    assert.deepEqual(await pantry('Rybak'), { roach: 5 });
    assert.equal((await resources('Rybak')).wood, 20);
    assert.equal((await resources('Kucharka')).wood, 30);
    assert.deepEqual(await pantry('Kucharka'), { roach: 4 });
  });

  test('a dish for gold and fish for a dish: back on a withdrawal and when the time is up', async () => {
    await run('UPDATE characters SET pantry = ? WHERE name = ?', JSON.stringify({ 'pea-soup': 2, roach: 1 }), 'Kucharka');
    await run('UPDATE characters SET pantry = ? WHERE name = ?', JSON.stringify({ roach: 7 }), 'Rybak');
    const goldBefore = (await row('Kucharka')).gold;
    assert.equal((await post('kucharka', 'pantry:pea-soup', 2, 'gold', 100)).status, 200);
    assert.deepEqual(await pantry('Kucharka'), { 'pea-soup': 0, roach: 1 });
    // Gold for the dish: Trzeci pays, gets the soup.
    const soup = (await as('trzeci', 'GET', '/api/guild/exchange')).data.offers[0];
    assert.equal((await as('trzeci', 'POST', '/api/guild/exchange/take', { offerId: soup.id })).status, 200);
    assert.deepEqual(await pantry('Trzeci'), { 'pea-soup': 2 });
    assert.equal((await row('Kucharka')).gold, goldBefore + 100);
    assert.equal((await row('Trzeci')).gold, 4900);
    // Fish for a dish: one wanting soup Kucharka no longer has.
    assert.equal((await post('rybak', 'pantry:roach', 3, 'pantry:pea-soup', 1)).status, 200);
    assert.equal((await post('rybak', 'pantry:roach', 2, 'stone', 5)).status, 200);
    assert.deepEqual(await pantry('Rybak'), { roach: 2 });
    const [forSoup, forStone] = (await as('kucharka', 'GET', '/api/guild/exchange')).data.offers;
    assert.equal(forSoup.want.name, 'Grochówka');
    assert.equal((await as('kucharka', 'POST', '/api/guild/exchange/take', { offerId: forSoup.id })).data.error.message, 'Brakuje: 1 szt. „Grochówka”.');
    // Withdrawn: the roach back; the other one's time up: back too.
    assert.equal((await as('rybak', 'POST', '/api/guild/exchange/withdraw', { offerId: forSoup.id })).status, 200);
    assert.deepEqual(await pantry('Rybak'), { roach: 5 });
    await run('UPDATE guild_offers SET ends_at = ? WHERE id = ?', Date.now() - 1000, forStone.id);
    await as('rybak', 'GET', '/api/guild/exchange');
    assert.deepEqual(await pantry('Rybak'), { roach: 7 });
    // Leaving the guild gives an open offer's goods back as well.
    assert.equal((await post('rybak', 'pantry:roach', 4, 'wood', 1)).status, 200);
    assert.deepEqual(await pantry('Rybak'), { roach: 3 });
    assert.equal((await as('rybak', 'POST', '/api/guild/leave', {})).status, 200);
    assert.deepEqual(await pantry('Rybak'), { roach: 7 });
  });
});

// Code review of the game's gates (12.11.2026): whether every gate the game
// has is held by the server on every path, not only hidden in the page. A
// player can send any request by hand. Each test shows a hole the code
// has, and fails on it. The names are synthetic.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { arenaDay, fireDay, fireTrade, merchantStock, questPeriod, shopDay } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const DAY = 86400000;
// A day's key, as the daily counters keep it (Polish midnight).
const dayKey = (at) => questPeriod('daily', at, content).key;
// Test mode for nobody here, as in the live game (TEST_LOGINS names one
// account, the author's): no test routes, no "Testuj Osadę".
const LIVE = { TEST_LOGINS: 'nobody-synthetic' };

// DECISIONS.md, "Kamień węgielny Warowni w Obozie", point 6: „Bez Osady
// kamienia nie ma (brakujący szczegół). Wolne miejsce jest tylko na wyższej
// planszy, a do Warowni liczą się wszystkie budynki, także Kwatery z
// Osady.”; "Warownia: mechanika", 2: the transformation „Rusza z okienka
// Kamienia węgielnego, gdy Obóz ma 10. poziom, a każdy jego budynek swój
// najwyższy”. The page shows the stone only with the Osada (screens/camp.js:
// tall()), but camp.js beginBuilding counts the buildings a character has
// open (buildingOpen): below the Osada's level the Kwatery are not open, so
// they drop out of fortressReady, and the transformation starts with no
// Osada, no stone and no Kwatery.
describe('the gates under review: the Warownia', () => {
  const { call, db, signUp } = useServer({ ...LIVE, SETTLEMENT: 'on', FORTRESS: 'on' });
  let cookie;
  let id;
  const build = (buildingId) => call('POST', '/api/camp/build', { cookie, body: { buildingId } });

  beforeEach(async () => {
    ({ cookie } = await signUp('gatesfortress'));
    await call('POST', '/api/character', { cookie, body: { name: 'Kasztelanka', classId: 'warrior', appearance: 'female' } });
    const database = await db();
    ({ id } = await database.prepare('SELECT id FROM characters').first());
    await database
      .prepare('UPDATE characters SET level = 19, class_level = 19, tutorial = NULL, gold = 200000, resources = ? WHERE id = ?')
      .bind(JSON.stringify({ wood: 20000, stone: 20000, 'iron-ore': 20000 }), id)
      .run();
    // Every camp building a character below the Osada can build, and the
    // Obóz, at their top; the Kwatery of the Osada (settlement: true) not.
    for (const one of [...content.buildings.filter((building) => !building.fortress && !building.settlement), content.camp]) {
      await database.prepare('INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) VALUES (?, ?, ?, 0, 1)').bind(id, one.id, one.maxLevel).run();
    }
  });

  test('a character below the Osada, with no Kamień węgielny and no Kwatery, does not turn its camp into a Warownia', async () => {
    const before = (await call('GET', '/api/character', { cookie })).data.character;
    assert.equal(before.settlementOpen, false, 'the Osada is not open at level 19');
    const begun = await build(content.camp.fortress.id);
    assert.notEqual(
      begun.status,
      201,
      `at level ${before.level}, with no Osada (so no Kamień węgielny on the board) and no Kwatery, the transformation into the Warownia started: ` +
        `${begun.status}, gold ${before.gold} → ${begun.data.character?.gold}, the stone's window says ready=${before.camp.cornerstone.fortress.ready} ` +
        `with ${before.camp.cornerstone.rows[0].of} buildings counted of the ${content.buildings.filter((building) => !building.fortress).length} the camp has`,
    );
  });

  test('the same camp at the Osada\'s level waits for the Kwatery, as the rule says', async () => {
    await (await db()).prepare('UPDATE characters SET level = 20 WHERE id = ?').bind(id).run();
    const begun = await build(content.camp.fortress.id);
    assert.equal(begun.status, 409);
    assert.equal(begun.data.error.code, 'fortress_not_ready');
  });
});

// Version 0.2.74, point 5 („Dzień, który się nie cofa”; laterPeriod and
// samePeriod in quests.js): a request begun before midnight and handled
// after a request of the new day read the new day's record as none, ran
// once more and wrote the old day back, so the new day's limit opened
// again. 0.2.71 and 0.2.74 fixed it for the quests, the Pustelnik, the Koło
// Fortuny, the Osada's residents, the Warownia, the Wieże and the Portale;
// four daily limits still compare the day for equality only and fall into
// the same hole: the Arena's fights (pvp-arena.js, leftToday), the Ognisko's
// fire spirit (fire.js, fireUnitsMade), the Skup złomu's counter (shop.js,
// shopBought) and the Targowisko's merchant (market.js, buyFromResident). As
// in test/review-osada.test.js, a record of the next day stands for the
// request of the new day that came first.
describe('the gates under review: daily limits of a later day', () => {
  const { call, db, signUp } = useServer({ ...LIVE, SETTLEMENT: 'on', ARENA: 'on' });
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();

  async function player(login, name, level) {
    const { cookie } = await signUp(login);
    await call('POST', '/api/character', { cookie, body: { name, classId: 'warrior', appearance: 'female' } });
    await run('UPDATE characters SET level = ?, class_level = ?, tutorial = NULL, gold = 100000 WHERE name = ?', level, level, name);
    const { id } = await first('SELECT id FROM characters WHERE name = ?', name);
    return { cookie, id };
  }
  const built = (who, buildingId) => run('INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) VALUES (?, ?, 1, 0, 1)', who.id, buildingId);

  test("the Arena's fights of the day, all fought in a record of the next day", async () => {
    const ala = await player('gatesarenaa', 'Arenoalfa', 30);
    const bolek = await player('gatesarenab', 'Arenobeta', 30);
    assert.equal((await call('GET', '/api/settlement/arena', { cookie: ala.cookie })).status, 200);
    const next = arenaDay(Date.now() + DAY, content).key;
    const { fightsPerDay } = content.settlement.arena;
    await run('UPDATE arena_ratings SET day = ?, fights = ? WHERE character_id = ?', next, fightsPerDay, ala.id);
    const fought = await call('POST', '/api/settlement/arena/fight', { cookie: ala.cookie, body: { rivalId: bolek.id } });
    const record = await first('SELECT day, fights FROM arena_ratings WHERE character_id = ?', ala.id);
    assert.equal(
      fought.status,
      409,
      `with all ${fightsPerDay} fights of ${next} fought, a request of ${dayKey(Date.now())} fought once more (${fought.status}) and wrote the record back to ${record.day} with ${record.fights} fight(s): ` +
        `the next day's ${fightsPerDay} fights open again`,
    );
    assert.equal(record.day, next);
  });

  test("the Ognisko's fire spirit, its pieces of the day all taken in a record of the next day", async () => {
    const who = await player('gatesfire', 'Ogniskowa', 10);
    await built(who, 'campfire');
    const { perDay } = fireTrade(1, content);
    const next = fireDay(Date.now() + DAY, content);
    await run('UPDATE characters SET fire_day = ?, fire_units = ? WHERE id = ?', next, perDay, who.id);
    const traded = await call('POST', '/api/camp/trade', { cookie: who.cookie, body: { resource: 'wood', amount: perDay } });
    const after = await first('SELECT fire_day, fire_units FROM characters WHERE id = ?', who.id);
    assert.equal(
      traded.status,
      409,
      `with ${perDay} of ${perDay} pieces taken on ${next}, a request of ${dayKey(Date.now())} took ${perDay} more (${traded.status}) and wrote ${after.fire_day} with ${after.fire_units} back`,
    );
    assert.equal(after.fire_day, next);
  });

  test("the Skup złomu's counter, its parts of the day all bought in a record of the next day", async () => {
    const who = await player('gatesshop', 'Zlomiarka', 10);
    await built(who, 'scrap-bench');
    const { daily } = content.buildings.find((building) => building.shop).shop;
    const next = shopDay(Date.now() + DAY, content);
    await run('UPDATE characters SET shop_day = ?, shop_parts = ? WHERE id = ?', next, JSON.stringify({ scraps: daily.common }), who.id);
    const bought = await call('POST', '/api/camp/buy', { cookie: who.cookie, body: { partId: 'scraps', count: 10 } });
    const after = await first('SELECT shop_day, shop_parts FROM characters WHERE id = ?', who.id);
    assert.equal(
      bought.status,
      409,
      `with ${daily.common} of ${daily.common} scraps bought on ${next}, a request of ${dayKey(Date.now())} bought 10 more (${bought.status}) and wrote ${after.shop_day} ${after.shop_parts} back`,
    );
    assert.equal(after.shop_day, next);
  });

  test("the Targowisko's merchant, his stock of the day all bought in a record of the next day", async () => {
    const who = await player('gatesmerchant', 'Kupczyni', 20);
    const later = merchantStock(Date.now() + DAY, content);
    const bought = Object.fromEntries(later.goods.map((good) => [good.id, good.stock]));
    await run('UPDATE characters SET settlement = ? WHERE id = ?', JSON.stringify({ market: { day: later.day, bought } }), who.id);
    const good = merchantStock(Date.now(), content).goods.find((one) => one.kind === 'material' || one.kind === 'part');
    const answer = await call('POST', '/api/market/resident', { cookie: who.cookie, body: { from: 'merchant', id: good.id, count: good.stock } });
    const market = JSON.parse((await first('SELECT settlement FROM characters WHERE id = ?', who.id)).settlement).market;
    assert.notEqual(
      answer.status,
      200,
      `with the merchant's whole stock of ${later.day} bought, a request of ${dayKey(Date.now())} bought ${good.stock} × ${good.key} (${answer.status}) and wrote the record back to ${market.day}`,
    );
    assert.equal(market.day, later.day);
  });
});

// DECISIONS.md, "Najemnicy w Karczmie", 2: „Wystawiona postać nic nie robi,
// dopóki nie zdejmie ogłoszenia: nie wyrusza na żadną wyprawę (…), nie
// walczy w Wieżach, Sali prób ani z Bestią Gildii, nie pracuje w profesji”
// (the author: „postać nie może nic wtedy robić, chyba że zdejmie
// wystawienie swojej usługi”). Every fight that came later refuses a
// mercenary too: the Arena („Walczyć można też w trakcie wyprawy i pracy w
// profesji, ale nie w służbie najemnika”, 0.2.36 point 44) and the Wyprawa
// Gildii's guardians. The Portale Systemu (0.2.6, later than the
// mercenaries) do not: portals.js asks nothing of the activity, so a
// character offered for hire, or serving its hirer, fights for stages and
// sweeps their loot as if free. (A missing detail rather than a rule the
// author wrote out: „Dlatego wejść można zawsze: w czasie wyprawy, przed
// odebraniem jej raportu i w czasie pracy w profesji” names no service.)
describe('the gates under review: a mercenary in the Portale', () => {
  const { call, db, signUp } = useServer({ ...LIVE, SETTLEMENT: 'on', ARENA: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('gatesmerc'));
    await call('POST', '/api/character', { cookie, body: { name: 'Najemniczka', classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare(`UPDATE characters SET level = 40, class_level = 40, tutorial = NULL, portals = '{"best":{"gold":1}}'`).run();
    const offered = await call('POST', '/api/mercenary/offer', { cookie, body: { hours: 4, perHour: 400 } });
    assert.equal(offered.status, 200, JSON.stringify(offered.data).slice(0, 200));
  });

  test('a character offered as a mercenary fights in no portal and sweeps none, as it fights no Arena duel', async () => {
    const arena = await call('POST', '/api/settlement/arena/fight', { cookie, body: { rivalId: 1 } });
    const entered = await call('POST', '/api/portals/enter', { cookie, body: { portal: 'gold' } });
    const swept = await call('POST', '/api/portals/sweep', { cookie, body: { portal: 'gold' } });
    assert.deepEqual(
      { entered: entered.status, swept: swept.status },
      { entered: 409, swept: 409 },
      `offered for hire (its Arena fight answers ${arena.status} ${arena.data.error?.code}), it entered a portal (${entered.status}${entered.data.report ? `, stage ${entered.data.report.portal.stage}, ${entered.data.report.portal.won ? 'won' : 'lost'}` : ''}) ` +
        `and swept one (${swept.status}${swept.data.sweep ? `, ${swept.data.sweep.text}` : ''})`,
    );
  });
});

// The Encyklopedia counts only what a character found or made itself
// (DECISIONS.md, "Skrzynia Konta, Encyklopedia z własnych zdobyczy": „Z
// Encyklopedii tylko wykluczyć zdobycze z wymian i Skrzyni Konta”);
// market.js: „The goods got from other players count as a trade's for the
// Encyklopedia (ownDiscoveries in the engine), as those of the Wymiana do.”
// Its milestones open chests of gold, Punkty Czasu and Punkty Systemu, so
// an account's other characters must not fill them. The Targowisko takes
// parts (settlement.json market.kinds), and the Encyklopedia has a tab of
// them with milestones (encyclopedia.json), but market.js foreign() marks
// only herbs, potions, materials and minerals, and ownDiscoveries in the
// engine counts every part held: a part bought from another player is a
// discovery.
describe('the gates under review: the Encyklopedia and goods from other players', () => {
  const { call, db, signUp } = useServer({ ...LIVE, SETTLEMENT: 'on' });
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  const cookies = {};
  const market = (who, action, body) => call('POST', `/api/market/${action}`, { cookie: cookies[who], body });

  beforeEach(async () => {
    for (const [login, name] of [
      ['gatesseller', 'Sprzedawczyni'],
      ['gatesbuyer', 'Nabywczyni'],
    ]) {
      ({ cookie: cookies[name] } = await signUp(login));
      await call('POST', '/api/character', { cookie: cookies[name], body: { name, classId: 'mage', appearance: 'female' } });
      await run('UPDATE characters SET level = 20, class_level = 20, tutorial = NULL, gold = 100000 WHERE name = ?', name);
    }
  });

  test('a part bought on the Targowisko from another player is no discovery, as a material bought there is none', async () => {
    const part = content.parts.at(-1).id;
    const material = content.materials.find((one) => one.rarity === 'rare');
    const key = `${material.id}:${material.rarity}`;
    await run('UPDATE characters SET parts = ?, materials = ? WHERE name = ?', JSON.stringify({ [part]: 1 }), JSON.stringify({ [key]: 1 }), 'Sprzedawczyni');
    for (const goods of [
      { kind: 'part', key: part },
      { kind: 'material', key },
    ]) {
      const listed = await market('Sprzedawczyni', 'list', { ...goods, count: 1, startPrice: 10, buyNow: 10 });
      assert.equal(listed.status, 200, JSON.stringify(listed.data).slice(0, 200));
    }
    const offers = (await call('GET', '/api/market', { cookie: cookies.Nabywczyni })).data.market.offers;
    assert.equal(offers.length, 2);
    for (const offer of offers) assert.equal((await market('Nabywczyni', 'buy', { offerId: offer.id })).status, 200);
    assert.equal((await market('Nabywczyni', 'collect', {})).status, 200);
    await call('GET', '/api/character', { cookie: cookies.Nabywczyni });
    const buyer = await first('SELECT parts, discovered FROM characters WHERE name = ?', 'Nabywczyni');
    const discovered = JSON.parse(buyer.discovered ?? '{}');
    assert.equal(discovered[`material:${key}`], undefined, 'the material bought from a player is no discovery');
    assert.equal(
      discovered[`part:${part}`],
      undefined,
      `the part ${content.partsById[part].name} (${content.partsById[part].rarity}) bought from another player's offer counts in the Encyklopedia's tab of parts: ${JSON.stringify(discovered)}`,
    );
  });
});

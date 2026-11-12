// The Siedziba Gildii (src/engine/guild-seat.js, src/server/guild-seat.js;
// the author: "616 A - akcept, ale muszą być zwijalne budynki i ludzie muszą
// móc wpłacać na co chcą, lider i zastępca może tylko oznaczyć co jest
// preferowane"): four buildings of a guild, each from level 0 to 10, a level
// costing max(8000, 5000 × n) gold and max(600, 400 × n) of the building's
// resource; a level comes once the donations to the building cover its
// whole cost, the surplus carried over; every member donates its own gold
// and resource to the building it picks, never more than it holds or than
// the building can take; only the leader and the deputies mark buildings
// as preferred; the bonuses go with every member's exploration from its
// start and with the Kowadło's price, and a character that leaves loses
// them; a guild that goes takes its seat along.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  itemUpgradeCost,
  seatBonuses,
  seatBuilding,
  seatCostTo,
  seatEffect,
  seatHuntBonus,
  seatLevelCost,
  seatLevels,
  seatProgress,
  simulateHunt,
  withSeatDiscount,
} from '../src/engine/index.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rules = content.guilds.seat;
const TOP = seatCostTo(rules.maxLevel, content);
// The newest place's stronger creatures (balance.monsters.huntCurve,
// hunt-strength.test.js) aside: these fights test something else.
const calm = { ...content, balance: { ...content.balance, monsters: { ...content.balance.monsters, huntCurve: [] } } };

describe('the Siedziba Gildii in the engine', () => {
  test('four buildings, each with its resource and its bonus (616 A, 623)', () => {
    assert.deepEqual(
      rules.buildings.map((one) => [one.id, one.name, one.resource, one.bonus, one.perLevel]),
      [
        ['guild-banner', 'Sztandar', 'wood', 'xp', 0.01],
        ['guild-treasury', 'Skarbiec', 'stone', 'gold', 0.01],
        ['guild-forge', 'Kuźnia Gildii', 'iron-ore', 'anvil', 0.02],
        ['scouts-house', 'Dom Zwiadowców', 'wood', 'rarity', 0.02],
      ],
    );
    assert.equal(rules.maxLevel, 10);
    assert.equal(seatBuilding('nowhere', content), null);
  });

  test('a level costs max(8000, 5000 × n) gold and max(600, 400 × n) of its resource', () => {
    assert.deepEqual(seatLevelCost(1, content), { gold: 8000, resource: 600 });
    assert.deepEqual(seatLevelCost(2, content), { gold: 10000, resource: 800 });
    assert.deepEqual(seatLevelCost(3, content), { gold: 15000, resource: 1200 });
    assert.deepEqual(seatLevelCost(10, content), { gold: 50000, resource: 4000 });
    assert.deepEqual(seatCostTo(2, content), { gold: 18000, resource: 1400 });
    assert.deepEqual(TOP, { gold: 278000, resource: 22200 });
  });

  test('a level comes once the donations cover its whole cost, gold and resource, and the surplus carries over', () => {
    // Nothing donated: the first level waits, all of it to collect.
    assert.deepEqual(seatProgress(undefined, content), {
      level: 0,
      maxLevel: 10,
      next: { level: 1, cost: { gold: 8000, resource: 600 }, collected: { gold: 0, resource: 0 }, surplus: { gold: 0, resource: 0 } },
      room: TOP,
    });
    // One piece short: no level yet.
    assert.equal(seatProgress({ gold: 8000, resource: 599 }, content).level, 0);
    assert.deepEqual(seatProgress({ gold: 8000, resource: 599 }, content).next.collected, { gold: 8000, resource: 599 });
    // Both covered: the level, and the next one from nothing.
    const first = seatProgress({ gold: 8000, resource: 600 }, content);
    assert.equal(first.level, 1);
    assert.deepEqual(first.next, { level: 2, cost: { gold: 10000, resource: 800 }, collected: { gold: 0, resource: 0 }, surplus: { gold: 0, resource: 0 } });
    // Gold for more than a level waits for the resource, the rest kept for later.
    const golden = seatProgress({ gold: 20000, resource: 700 }, content);
    assert.equal(golden.level, 1);
    assert.deepEqual(golden.next.collected, { gold: 10000, resource: 100 });
    assert.deepEqual(golden.next.surplus, { gold: 2000, resource: 0 });
    // The surplus goes on to the next level once it comes.
    const second = seatProgress({ gold: 20500, resource: 1500 }, content);
    assert.equal(second.level, 2);
    assert.deepEqual(second.next.collected, { gold: 2500, resource: 100 });
    // At the top nothing more is taken.
    assert.deepEqual(seatProgress(TOP, content), { level: 10, maxLevel: 10, next: null, room: { gold: 0, resource: 0 } });
    const short = seatProgress({ gold: TOP.gold, resource: TOP.resource - 1 }, content);
    assert.equal(short.level, 9);
    assert.deepEqual(short.next.collected, { gold: 50000, resource: 3999 });
    assert.deepEqual(short.room, { gold: 0, resource: 1 });
  });

  test("every level gives every member its building's bonus", () => {
    const levels = seatLevels({ 'guild-banner': seatCostTo(3, content), 'guild-forge': seatCostTo(5, content), 'scouts-house': TOP }, content);
    assert.deepEqual(levels, { 'guild-banner': 3, 'guild-treasury': 0, 'guild-forge': 5, 'scouts-house': 10 });
    assert.deepEqual(seatBonuses(levels, content), { xp: 0.03, gold: 0, anvil: 0.1, rarity: 0.2 });
    assert.deepEqual(seatBonuses(undefined, content), { xp: 0, gold: 0, anvil: 0, rarity: 0 });
    assert.deepEqual(seatLevels({}, content), { 'guild-banner': 0, 'guild-treasury': 0, 'guild-forge': 0, 'scouts-house': 0 });
    // An exploration takes the XP, the gold and the rarity, only those it has.
    assert.deepEqual(seatHuntBonus(levels, content), { xp: 0.03, rarity: 0.2 });
    assert.equal(seatHuntBonus({ 'guild-forge': 5 }, content), null);
    // In the card's words.
    assert.equal(seatEffect(seatBuilding('guild-banner', content), 3), '+3% XP z wypraw');
    assert.equal(seatEffect(seatBuilding('guild-treasury', content), 10), '+10% złota z wypraw');
    assert.equal(seatEffect(seatBuilding('guild-forge', content), 5), 'Kowadło 10% taniej');
    assert.equal(seatEffect(seatBuilding('scouts-house', content), 1), '+2% szans na rzadsze przedmioty z wypraw');
    assert.equal(seatEffect(seatBuilding('guild-banner', content), 0), null);
  });

  test('the Kuźnia Gildii takes its share off the price the Bractwo Kowali leaves', () => {
    assert.equal(withSeatDiscount(0, 0), 0);
    assert.equal(withSeatDiscount(0.2, 0), 0.2);
    assert.equal(withSeatDiscount(0, 0.04), 0.04);
    assert.equal(withSeatDiscount(0.2, 0.2), 0.36);
    // Both at their best, an upgrade still costs more than the half of its
    // price an upgraded item gives back when sold (balance.upgrades.sellRefund).
    assert.ok(1 - withSeatDiscount(0.2, 0.2) > content.balance.upgrades.sellRefund);
  });
});

describe('the Siedziba Gildii in an exploration', () => {
  const settled = typicalCharacter('warrior', 43, content);
  const explore = (seat, seed = 'siedziba') => simulateHunt({ ...settled, hp: 9999, name: 'Mira', areaId: 'wolf-circles', minutes: 240, seed, seat }, calm);

  test('without a seat, or with nothing in it, the exploration is as before', () => {
    assert.deepEqual(explore({}), explore(null));
  });

  test('the Sztandar and the Skarbiec give more XP and gold in every fight, the fights the same', () => {
    const plain = explore(null);
    const raised = explore({ xp: 0.1, gold: 0.1 });
    assert.ok(plain.fights.length > 4);
    assert.equal(raised.fights.length, plain.fights.length);
    raised.fights.forEach((fight, index) => {
      const before = plain.fights[index];
      assert.deepEqual([fight.won, fight.enemies], [before.won, before.enemies], `fight ${index}`);
      if (before.won === true) assert.ok(Math.abs(fight.xp - before.xp * 1.1) <= 1, `fight ${index}: ${fight.xp} for ${before.xp}`);
    });
    assert.ok(raised.xp > plain.xp);
    assert.ok(raised.gold > plain.gold);
    // Rounded fight by fight and find by find, about a tenth more gold.
    assert.ok(Math.abs(raised.gold - plain.gold * 1.1) <= plain.fights.length + plain.entries.length, `${raised.gold} for ${plain.gold}`);
    // XP alone leaves the gold, gold alone the XP.
    assert.equal(explore({ xp: 0.1 }).gold, plain.gold);
    assert.equal(explore({ gold: 0.1 }).xp, plain.xp);
  });

  test('the Dom Zwiadowców makes the rarer items more likely', () => {
    const rare = (seat) =>
      Array.from({ length: 40 }, (_, i) => explore(seat, `zwiadowcy:${i}`))
        .flatMap((result) => result.items)
        .filter((item) => item.rarity !== content.rarities[0].id).length;
    assert.ok(rare({ rarity: 1 }) > rare(null));
  });
});

describe('the Siedziba Gildii through the API', () => {
  const { call, db, signUp } = useServer();
  const cookies = {};
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  const view = async (login) => (await as(login, 'GET', '/api/guild/seat')).data;
  const donate = (login, buildingId, gold, resource) => as(login, 'POST', '/api/guild/seat/donate', { buildingId, gold, resource });
  const prefer = (login, buildingId, preferred) => as(login, 'POST', '/api/guild/seat/prefer', { buildingId, preferred });
  const building = (seen, id) => seen.buildings.find((one) => one.id === id);
  const wallet = async (name) => {
    const row = await first('SELECT gold, resources FROM characters WHERE name = ?', name);
    return { gold: row.gold, ...JSON.parse(row.resources) };
  };
  const setWallet = (name, gold, resources) => run('UPDATE characters SET gold = ?, resources = ? WHERE name = ?', gold, JSON.stringify(resources), name);
  const guildId = async () => (await first("SELECT id FROM guilds WHERE tag = 'LB'")).id;
  // A building of the guild with these donations, as if made already.
  const raise = async (buildingId, donated) =>
    run(
      'INSERT INTO guild_seat (guild_id, building_id, gold, resource) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, building_id) DO UPDATE SET gold = excluded.gold, resource = excluded.resource',
      await guildId(),
      buildingId,
      donated.gold,
      donated.resource,
    );

  async function player(login, name, { level = 30 } = {}) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await run('UPDATE characters SET level = ?, class_level = ? WHERE name = ?', level, Math.min(level, 25), name);
    await setWallet(name, 100000, { wood: 5000, stone: 5000, 'iron-ore': 5000 });
  }

  async function join(login, name) {
    const id = (await as('mistrz', 'GET', '/api/guild')).data.guild.id;
    await as('mistrz', 'POST', '/api/guild/invite', { name });
    assert.equal((await as(login, 'POST', '/api/guild/accept', { guildId: id })).status, 200);
  }

  beforeEach(async () => {
    await player('mistrz', 'Mistrz');
    await player('druh', 'Druh', { level: 22 });
    assert.equal((await as('mistrz', 'POST', '/api/guild/found', { name: 'Leśni Bracia', tag: 'LB' })).status, 200);
    await setWallet('Mistrz', 100000, { wood: 5000, stone: 5000, 'iron-ore': 5000 });
    await join('druh', 'Druh');
  });

  test('a member donates to the building it picks; a level comes once its whole cost is in, the surplus carries over', async () => {
    const seen = await view('druh');
    assert.equal(seen.guild.tag, 'LB');
    assert.equal(seen.canMark, false);
    assert.deepEqual(
      seen.buildings.map((one) => [one.id, one.level, one.resource.id, one.preferred]),
      [
        ['guild-banner', 0, 'wood', false],
        ['guild-treasury', 0, 'stone', false],
        ['guild-forge', 0, 'iron-ore', false],
        ['scouts-house', 0, 'wood', false],
      ],
    );
    assert.equal(seen.bonusesText, rules.texts.noBonuses);
    assert.deepEqual(building(seen, 'guild-banner').have, { gold: 100000, resource: 5000 });

    const given = await donate('druh', 'guild-banner', 5000, 300);
    assert.equal(given.status, 200, JSON.stringify(given.data));
    assert.equal(given.data.text, 'Wpłata na Sztandar: 5000 złota i 300 drewna.');
    assert.equal(given.data.character.gold, 95000);
    assert.equal(given.data.character.resources.wood, 4700);
    assert.deepEqual(await wallet('Druh'), { gold: 95000, wood: 4700, stone: 5000, 'iron-ore': 5000 });
    assert.deepEqual(building(given.data, 'guild-banner').next.collected, { gold: 5000, resource: 300 });
    assert.equal(building(given.data, 'guild-banner').level, 0);

    // More gold than the level needs: kept for the next one, the level still
    // waiting for its wood.
    const more = await donate('druh', 'guild-banner', 10000, 0);
    assert.equal(more.data.text, 'Wpłata na Sztandar: 10\u00a0000 złota.');
    assert.equal(building(more.data, 'guild-banner').level, 0);
    assert.deepEqual(building(more.data, 'guild-banner').next.collected, { gold: 8000, resource: 300 });
    assert.deepEqual(building(more.data, 'guild-banner').next.surplus, { gold: 7000, resource: 0 });

    // Another member's wood completes the level; the surplus gold goes on.
    const raised = await donate('mistrz', 'guild-banner', 0, 300);
    assert.equal(raised.data.text, 'Wpłata na Sztandar: 300 drewna. Sztandar wchodzi na 1. poziom!');
    const banner = building(raised.data, 'guild-banner');
    assert.equal(banner.level, 1);
    assert.equal(banner.effect, '+1% XP z wypraw');
    assert.equal(banner.nextEffect, '+2% XP z wypraw');
    assert.deepEqual(banner.next, { level: 2, cost: { gold: 10000, resource: 800 }, collected: { gold: 7000, resource: 0 }, surplus: { gold: 0, resource: 0 } });
    assert.deepEqual(banner.room, { gold: TOP.gold - 15000, resource: TOP.resource - 600 });
    assert.deepEqual(raised.data.bonuses, { xp: 0.01, gold: 0, anvil: 0, rarity: 0 });
    assert.equal(raised.data.bonusesText, 'Premie dla każdego członka: +1% XP z wypraw.');
    assert.equal(raised.data.canMark, true);
    assert.deepEqual(await first('SELECT gold, resource FROM guild_seat WHERE building_id = ?', 'guild-banner'), { gold: 15000, resource: 600 });

    // Each building collects its own, in its own resource.
    const forge = await donate('druh', 'guild-forge', 8000, 600);
    assert.equal(forge.data.text, 'Wpłata na Kuźnię Gildii: 8000 złota i 600 rudy żelaza. Kuźnia Gildii wchodzi na 1. poziom!');
    assert.deepEqual(await wallet('Druh'), { gold: 77000, wood: 4700, stone: 5000, 'iron-ore': 4400 });
    assert.deepEqual(
      forge.data.buildings.map((one) => [one.id, one.level]),
      [
        ['guild-banner', 1],
        ['guild-treasury', 0],
        ['guild-forge', 1],
        ['scouts-house', 0],
      ],
    );
    assert.equal(forge.data.bonusesText, 'Premie dla każdego członka: +1% XP z wypraw, Kowadło 2% taniej.');
    // A donation covering more than one level raises the building at once.
    const twice = await donate('mistrz', 'scouts-house', 18000, 1400);
    assert.equal(twice.data.text, 'Wpłata na Dom Zwiadowców: 18\u00a0000 złota i 1400 drewna. Dom Zwiadowców wchodzi na 2. poziom!');
    // The donor's own view shows its gold and resource left.
    assert.deepEqual(building(twice.data, 'scouts-house').have, { gold: 82000, resource: 3300 });
  });

  test('nobody donates more than it holds, nothing at all, or past the top level', async () => {
    await setWallet('Druh', 6000, { wood: 40, stone: 0 });
    const refused = async (body, status, code) => {
      const answer = await as('druh', 'POST', '/api/guild/seat/donate', body);
      assert.equal(answer.status, status, JSON.stringify(answer.data));
      assert.equal(answer.data.error.code, code);
      return answer.data.error.message;
    };
    await refused({ buildingId: 'tower', gold: 10 }, 400, 'invalid_building');
    await refused({ buildingId: 'guild-banner', gold: -5 }, 400, 'invalid_amount');
    await refused({ buildingId: 'guild-banner', gold: 1.5 }, 400, 'invalid_amount');
    await refused({ buildingId: 'guild-banner', gold: '100' }, 400, 'invalid_amount');
    await refused({ buildingId: 'guild-banner', gold: 0, resource: 0 }, 400, 'nothing');
    await refused({ buildingId: 'guild-banner' }, 400, 'nothing');
    assert.equal(await refused({ buildingId: 'guild-banner', gold: 6001 }, 409, 'not_enough'), 'Masz tylko 6000 złota.');
    assert.equal(await refused({ buildingId: 'guild-banner', gold: 10, resource: 41 }, 409, 'not_enough'), 'Masz tylko 40 drewna.');
    assert.equal(await refused({ buildingId: 'guild-treasury', resource: 1 }, 409, 'not_enough'), 'Masz tylko 0 kamienia.');
    assert.deepEqual(await wallet('Druh'), { gold: 6000, wood: 40, stone: 0 });
    assert.equal((await first('SELECT COUNT(*) AS count FROM guild_seat')).count, 0);

    // Near the top: no more than the top level needs.
    await raise('guild-banner', { gold: TOP.gold - 100, resource: TOP.resource - 10 });
    assert.equal(await refused({ buildingId: 'guild-banner', gold: 101 }, 409, 'too_much'), 'Ten budynek przyjmie jeszcze najwyżej 100 złota.');
    assert.equal(await refused({ buildingId: 'guild-banner', resource: 11 }, 409, 'too_much'), 'Ten budynek przyjmie jeszcze najwyżej 10 drewna.');
    const top = await donate('druh', 'guild-banner', 100, 10);
    assert.equal(top.data.text, 'Wpłata na Sztandar: 100 złota i 10 drewna. Sztandar wchodzi na 10. poziom!');
    assert.equal(building(top.data, 'guild-banner').next, null);
    assert.equal(await refused({ buildingId: 'guild-banner', gold: 1 }, 409, 'top'), rules.texts.errors.top);
    // All the gold in while the resource lags: no more gold.
    await raise('guild-treasury', { gold: TOP.gold, resource: 0 });
    assert.equal(await refused({ buildingId: 'guild-treasury', gold: 1 }, 409, 'too_much'), 'Złota na ten budynek starczy już do najwyższego poziomu.');
    assert.deepEqual(await wallet('Druh'), { gold: 5900, wood: 30, stone: 0 });

    // Two taps at once on more than is held: one donation lands, the gold
    // never below nothing.
    await setWallet('Druh', 6000, { wood: 0 });
    const taps = await Promise.all([donate('druh', 'guild-forge', 5000, 0), donate('druh', 'guild-forge', 5000, 0)]);
    assert.deepEqual(taps.map((tap) => tap.status).sort(), [200, 409]);
    assert.equal((await wallet('Druh')).gold, 1000);
    assert.deepEqual(await first("SELECT gold, resource FROM guild_seat WHERE building_id = 'guild-forge'"), { gold: 5000, resource: 0 });

    // Outside a guild: the words only, and no donation.
    await player('obcy', 'Obcy');
    const outside = await view('obcy');
    assert.equal(outside.guild, null);
    assert.equal(outside.texts.noGuild, rules.texts.noGuild);
    assert.equal((await donate('obcy', 'guild-banner', 10, 0)).data.error.code, 'no_guild');
  });

  test('only the leader and the deputies mark buildings as preferred, and every member sees the mark', async () => {
    const tried = await prefer('druh', 'guild-forge', true);
    assert.equal(tried.status, 403);
    assert.equal(tried.data.error.message, rules.texts.errors.notAllowed);
    assert.equal((await prefer('mistrz', 'guild-forge', 'tak')).data.error.code, 'invalid_mark');
    assert.equal((await prefer('mistrz', 'nowhere', true)).data.error.code, 'invalid_building');
    const marked = await prefer('mistrz', 'guild-forge', true);
    assert.equal(marked.status, 200, JSON.stringify(marked.data));
    assert.equal(marked.data.text, 'Oznaczenie dodane: Kuźnia Gildii.');
    assert.equal(marked.data.canMark, true);
    const seen = await view('druh');
    assert.equal(seen.canMark, false);
    assert.deepEqual(
      seen.buildings.map((one) => [one.id, one.preferred]),
      [
        ['guild-banner', false],
        ['guild-treasury', false],
        ['guild-forge', true],
        ['scouts-house', false],
      ],
    );
    // A mark is only a mark: nothing donated, the level as it was.
    assert.deepEqual(await first("SELECT gold, resource, preferred FROM guild_seat WHERE building_id = 'guild-forge'"), { gold: 0, resource: 0, preferred: 1 });
    assert.equal(building(seen, 'guild-forge').level, 0);
    // A deputy marks too, and takes a mark off.
    await as('mistrz', 'POST', '/api/guild/role', { characterId: (await first("SELECT id FROM characters WHERE name = 'Druh'")).id, role: 'deputy' });
    assert.equal((await prefer('druh', 'scouts-house', true)).status, 200);
    const off = await prefer('druh', 'guild-forge', false);
    assert.equal(off.data.text, 'Oznaczenie zdjęte: Kuźnia Gildii.');
    assert.deepEqual(
      (await view('mistrz')).buildings.filter((one) => one.preferred).map((one) => one.id),
      ['scouts-house'],
    );
    // Donations to a marked building keep the mark.
    await donate('mistrz', 'scouts-house', 1000, 100);
    assert.equal(building(await view('druh'), 'scouts-house').preferred, true);
  });

  test("the bonuses go with every member's exploration from its start; one who leaves sets out without them", async () => {
    // Two characters alike, one in the guild with its Sztandar at level 5
    // and its Skarbiec at 10, the other in none, on the same exploration.
    await player('samotnik', 'Samotnik');
    const typical = typicalCharacter('warrior', 30, content);
    for (const name of ['Mistrz', 'Samotnik']) {
      const { id } = await first('SELECT id FROM characters WHERE name = ?', name);
      await run('UPDATE characters SET level = 30, class_level = ?, xp = 0, class_xp = 0, points = ? WHERE id = ?', typical.character.classLevel, JSON.stringify(typical.character.points), id);
      for (const item of typical.equipped) await run('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, ?, ?, 0)', id, item.slot, JSON.stringify(item));
    }
    await raise('guild-banner', seatCostTo(5, content));
    await raise('guild-treasury', TOP);
    await raise('guild-forge', TOP);
    for (const login of ['mistrz', 'samotnik']) {
      const started = await as(login, 'POST', '/api/hunts', { areaId: 'boar-thicket', minutes: 60 });
      assert.equal(started.status, 201, JSON.stringify(started.data));
    }
    const options = async (name) => JSON.parse((await first('SELECT a.options FROM activities a JOIN characters c ON c.id = a.character_id WHERE c.name = ?', name)).options);
    // Kept at the start: the XP and the gold, not the Kowadło's.
    assert.deepEqual((await options('Mistrz')).seat, { xp: 0.05, gold: 0.1 });
    assert.equal((await options('Samotnik')).seat, undefined);
    // The same exploration for both: the same seed and HP, and it is over.
    await run("UPDATE activities SET seed = 'siedziba', hp_at_start = 99999, started_at = started_at - 3660000, ends_at = ends_at - 3660000");
    // What the guild does meanwhile changes nothing in the report.
    await raise('guild-banner', TOP);
    const report = async (login) => {
      const claimed = await as(login, 'POST', '/api/hunts/claim');
      assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
      return claimed.data.report;
    };
    const member = await report('mistrz');
    const alone = await report('samotnik');
    assert.ok(alone.fights.length > 0);
    assert.equal(member.fights.length, alone.fights.length);
    assert.ok(alone.fights.some((fight) => fight.won === true && fight.xp > 20), JSON.stringify(alone.fights.map((fight) => fight.xp)));
    member.fights.forEach((fight, index) => {
      const other = alone.fights[index];
      assert.equal(fight.won, other.won, `fight ${index}`);
      if (other.won === true) assert.ok(Math.abs(fight.xp - other.xp * 1.05) <= 1, `fight ${index}: ${fight.xp} for ${other.xp}`);
    });
    assert.ok(member.summary.xp > alone.summary.xp);
    assert.ok(member.summary.gold > alone.summary.gold, `${member.summary.gold} for ${alone.summary.gold}`);
    assert.ok(Math.abs(member.summary.gold - alone.summary.gold * 1.1) <= alone.fights.length + 10, `${member.summary.gold} for ${alone.summary.gold}`);

    // Out of the guild, the next exploration goes without them.
    assert.equal((await as('mistrz', 'POST', '/api/guild/leave')).status, 200);
    assert.equal((await as('mistrz', 'POST', '/api/hunts', { areaId: 'boar-thicket', minutes: 60 })).status, 201);
    assert.equal((await options('Mistrz')).seat, undefined);
  });

  test("the Kuźnia Gildii takes gold off the Kowadło's price, after the Bractwo Kowali, for members only", async () => {
    const { id } = await first("SELECT id FROM characters WHERE name = 'Druh'");
    const item = { base: 'chainmail', slot: 'chest', level: 120, rarity: 'common', affixes: [], armor: 15 };
    for (let i = 0; i < 2; i += 1) await run('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)', id, JSON.stringify(item));
    await run("INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) VALUES (?, 'anvil', 2, 0, 1)", id);
    const full = itemUpgradeCost(item, 1, content).gold;
    assert.ok(full >= 100, String(full));
    const price = async () => (await as('druh', 'GET', '/api/character')).data.character.bag.map((one) => one.anvil.next.cost.gold);
    assert.deepEqual(await price(), [full, full]);
    // The Kuźnia at level 5: 10% off.
    await raise('guild-forge', seatCostTo(5, content));
    assert.deepEqual(await price(), [Math.round(full * 0.9), Math.round(full * 0.9)]);
    // With the Bractwo Kowali's 20% (Przyjaciel), the Kuźnia's off what is left.
    await run('UPDATE characters SET settlement = ? WHERE id = ?', JSON.stringify({ reputation: { smiths: 1400 } }), id);
    const both = Math.round(full * 0.8 * 0.9);
    assert.deepEqual(await price(), [both, both]);
    const before = (await wallet('Druh')).gold;
    const { id: itemId } = await first('SELECT id FROM items WHERE character_id = ? ORDER BY id LIMIT 1', id);
    const tried = await as('druh', 'POST', `/api/items/${itemId}/upgrade`);
    assert.equal(tried.status, 200, JSON.stringify(tried.data));
    assert.equal(tried.data.upgrade.cost.gold, both);
    assert.equal((await wallet('Druh')).gold, before - both);
    // Out of the guild, the Bractwo's discount alone.
    assert.equal((await as('druh', 'POST', '/api/guild/leave')).status, 200);
    const bag = (await as('druh', 'GET', '/api/character')).data.character.bag;
    assert.equal(bag.find((one) => (one.upgrade ?? 0) === 0 && one.id !== itemId).anvil.next.cost.gold, Math.round(full * 0.8));
  });

  // The author's 835 A (12.11.2026): a new account's character gave its
  // gift codes' gold to the seat of the main character's guild.
  test('a member below the Wymiana\'s level sees the buildings and their bonuses, and donates from that level on', async () => {
    const { minLevel } = content.community.trade;
    await run('UPDATE characters SET level = ? WHERE name = ?', minLevel - 1, 'Druh');
    const seen = await view('druh');
    assert.equal(seen.locked, true);
    assert.equal(seen.buildings.length, 4);
    assert.equal(seen.texts.donateLevel, `Wpłaty na Siedzibę otworzą się dla Ciebie na ${minLevel}. poziomie postaci.`);
    const tried = await as('druh', 'POST', '/api/guild/seat/donate', { buildingId: 'guild-banner', gold: 5000, resource: 0 });
    assert.equal(tried.status, 403);
    assert.equal(tried.data.error.code, 'seat_level');
    assert.equal(tried.data.error.message, seen.texts.donateLevel);
    assert.deepEqual(await wallet('Druh'), { gold: 100000, wood: 5000, stone: 5000, 'iron-ore': 5000 });
    assert.equal((await first('SELECT COUNT(*) AS count FROM guild_seat')).count, 0);
    // At the level, as before.
    await run('UPDATE characters SET level = ? WHERE name = ?', minLevel, 'Druh');
    assert.equal((await view('druh')).locked, false);
    assert.equal(building((await donate('druh', 'guild-banner', 5000, 0)).data, 'guild-banner').next.collected.gold, 5000);
  });

  test('a guild that goes takes its Siedziba along', async () => {
    await donate('druh', 'guild-banner', 8000, 600);
    await prefer('mistrz', 'guild-forge', true);
    assert.equal((await first('SELECT COUNT(*) AS count FROM guild_seat')).count, 2);
    // A member who leaves leaves its donations with the guild.
    await as('druh', 'POST', '/api/guild/leave');
    assert.equal((await first('SELECT COUNT(*) AS count FROM guild_seat')).count, 2);
    assert.equal(building(await view('mistrz'), 'guild-banner').level, 1);
    // The last one out: the guild goes, and its seat with it.
    await as('mistrz', 'POST', '/api/guild/leave');
    assert.equal((await first('SELECT COUNT(*) AS count FROM guilds')).count, 0);
    assert.equal((await first('SELECT COUNT(*) AS count FROM guild_seat')).count, 0);
  });
});

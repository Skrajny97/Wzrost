// The Wymiana in the Gildia (src/server/guild-exchange.js): a member offers
// pieces of one camp resource for pieces of another, both counts its own,
// and the pieces given are set aside at once; another member takes the
// whole offer and both sides swap in one batch, never with pieces short,
// never one's own offer or one of one's account; up to 3 open offers;
// withdrawing, running out of time, leaving the guild and being removed
// give the pieces back; two takers at once make one exchange; the closed
// offers stay with their taker, and those closed before last week go. Gold
// may stand on one side of an offer, never both (the author: "Daj też
// mozliwość wymiany i wystawiania ofert w Gildii zasoby za złoto"): set
// aside, paid and given back as the pieces are.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rules = content.guilds.exchange;
const HOUR = 3600000;
const NONE = Object.fromEntries(content.resources.map(({ id }) => [id, 0]));

describe('the Wymiana in the Gildia through the API', () => {
  const { call, db, signUp } = useServer();
  const cookies = {};

  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  const all = async (sql, ...binds) => (await (await db()).prepare(sql).bind(...binds).all()).results;
  const post = (login, give, giveCount, want, wantCount) => as(login, 'POST', '/api/guild/exchange', { give: { resource: give, count: giveCount }, want: { resource: want, count: wantCount } });
  const take = (login, offerId) => as(login, 'POST', '/api/guild/exchange/take', { offerId });
  const withdraw = (login, offerId) => as(login, 'POST', '/api/guild/exchange/withdraw', { offerId });
  const setResources = (name, value) => run('UPDATE characters SET resources = ? WHERE name = ?', JSON.stringify(value), name);
  // What the character holds of each resource.
  const held = async (name) => ({ ...NONE, ...JSON.parse((await first('SELECT resources FROM characters WHERE name = ?', name)).resources) });
  const goldOf = async (name) => (await first('SELECT gold FROM characters WHERE name = ?', name)).gold;

  async function player(login, name, { level = 30 } = {}) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await run("UPDATE characters SET level = ?, class_level = ?, gold = 5000, resources = '{}' WHERE name = ?", level, Math.min(level, 25), name);
  }

  async function join(login, name) {
    const guildId = (await as('mistrz', 'GET', '/api/guild')).data.guild.id;
    await as('mistrz', 'POST', '/api/guild/invite', { name });
    assert.equal((await as(login, 'POST', '/api/guild/accept', { guildId })).status, 200);
  }

  beforeEach(async () => {
    await player('mistrz', 'Mistrz');
    await player('druh', 'Druh', { level: 12 });
    await as('mistrz', 'POST', '/api/guild/found', { name: 'Leśni Bracia', tag: 'LB' });
    await join('druh', 'Druh');
  });

  test('an offer sets the pieces given aside at once, and the guild sees it', async () => {
    await setResources('Mistrz', { stone: 120, wood: 5 });
    assert.equal((await post('mistrz', 'clay', 10, 'wood', 10)).data.error.code, 'invalid_resource');
    assert.equal((await post('mistrz', 'stone', 10, 'stone', 10)).data.error.code, 'same_resource');
    assert.equal((await post('mistrz', 'stone', 0, 'wood', 10)).data.error.code, 'invalid_count');
    assert.equal((await post('mistrz', 'stone', 2.5, 'wood', 10)).data.error.code, 'invalid_count');
    assert.equal((await post('mistrz', 'stone', 10, 'wood', rules.most + 1)).data.error.code, 'invalid_count');
    const short = await post('mistrz', 'stone', 121, 'wood', 10);
    assert.equal(short.data.error.code, 'not_enough');
    assert.equal(short.data.error.message, 'Masz tylko 120 kamienia.');
    assert.equal((await post('mistrz', 'iron-ore', 1, 'wood', 10)).data.error.message, 'Nie masz rudy żelaza.');
    assert.deepEqual(await held('Mistrz'), { ...NONE, stone: 120, wood: 5 });
    const made = await post('mistrz', 'stone', 50, 'wood', 80);
    assert.equal(made.status, 200, JSON.stringify(made.data).slice(0, 300));
    assert.equal(made.data.text, 'Oferta wystawiona: Kamień\u00a0×\u00a050 za Drewno\u00a0×\u00a080.');
    assert.deepEqual(await held('Mistrz'), { ...NONE, stone: 70, wood: 5 });
    assert.deepEqual(made.data.resources, { ...NONE, stone: 70, wood: 5 });
    assert.equal(made.data.character.resources.stone, 70);
    assert.deepEqual(
      made.data.mine.map((offer) => [offer.give.resource, offer.give.count, offer.want.resource, offer.want.count, offer.state]),
      [['stone', 50, 'wood', 80, 'open']],
    );
    assert.ok(made.data.mine[0].endsAt > Date.now() + (rules.openHours - 1) * HOUR);
    // The guild sees it, with what each one holds of the pieces wanted.
    await setResources('Druh', { wood: 100 });
    const seen = (await as('druh', 'GET', '/api/guild/exchange')).data;
    assert.deepEqual(
      seen.offers.map((offer) => [offer.poster.name, offer.give.name, offer.give.count, offer.want.name, offer.want.count, offer.own, offer.sameAccount, offer.have, offer.canTake]),
      [['Mistrz', 'Kamień', 50, 'Drewno', 80, false, false, 100, true]],
    );
    assert.deepEqual(seen.mine, []);
    assert.deepEqual(seen.rules, {
      most: rules.most,
      offers: rules.offers,
      openHours: rules.openHours,
      sameCount: rules.sameCount,
      resources: content.resources.map(({ id }) => id),
      gold: { id: 'gold', name: 'Złoto', most: rules.gold.most },
    });
    assert.equal(seen.gold, 5000);
    assert.ok(seen.texts.how.every((line) => !line.includes('{')));
    assert.equal(seen.texts.errors, undefined);
    // Only for the guild's members.
    await player('obcy', 'Obcy');
    assert.equal((await post('obcy', 'stone', 1, 'wood', 1)).data.error.code, 'no_guild');
    assert.equal((await as('obcy', 'GET', '/api/guild/exchange')).data.guild, null);
  });

  test('gold on one side: resources sold and bought for it, set aside, paid and given back like pieces', async () => {
    await setResources('Mistrz', { stone: 50 });
    await setResources('Druh', { wood: 100 });
    await run("UPDATE characters SET gold = 5000 WHERE name = 'Mistrz'");
    // Never gold for gold, and gold up to its own limit.
    assert.equal((await post('mistrz', 'gold', 10, 'gold', 20)).data.error.code, 'same_resource');
    assert.equal((await post('mistrz', 'stone', 10, 'gold', 0)).data.error.code, 'invalid_count');
    const over = await post('mistrz', 'stone', 10, 'gold', rules.gold.most + 1);
    assert.deepEqual([over.data.error.code, over.data.error.message], ['invalid_count', 'Wpisz od 1 do 100\u00a0000 złota.']);
    assert.equal((await post('mistrz', 'stone', 10, 'gold', rules.gold.most)).status, 200);
    await withdraw('mistrz', (await as('mistrz', 'GET', '/api/guild/exchange')).data.mine[0].id);
    // 50 stone for 300 gold: the stone set aside, the gold paid by the taker.
    const sold = await post('mistrz', 'stone', 50, 'gold', 300);
    assert.equal(sold.data.text, 'Oferta wystawiona: Kamień\u00a0×\u00a050 za Złoto\u00a0×\u00a0300.');
    const [offer] = sold.data.mine.filter((one) => one.state === 'open');
    assert.deepEqual([offer.want.resource, offer.want.name, offer.want.count], ['gold', 'Złoto', 300]);
    assert.deepEqual(await held('Mistrz'), NONE);
    await run("UPDATE characters SET gold = 299 WHERE name = 'Druh'");
    const seen = (await as('druh', 'GET', '/api/guild/exchange')).data.offers[0];
    assert.deepEqual([seen.have, seen.missing, seen.canTake], [299, 1, false]);
    const short = await take('druh', offer.id);
    assert.deepEqual([short.data.error.code, short.data.error.message], ['not_enough', 'Brakuje: 1 złota.']);
    await run("UPDATE characters SET gold = 1000 WHERE name = 'Druh'");
    const taken = await take('druh', offer.id);
    assert.equal(taken.status, 200, JSON.stringify(taken.data).slice(0, 300));
    assert.equal(taken.data.text, 'Wymiana z postacią Mistrz: dostajesz Kamień\u00a0×\u00a050 za Złoto\u00a0×\u00a0300.');
    assert.deepEqual([await goldOf('Druh'), await goldOf('Mistrz')], [700, 5300]);
    assert.deepEqual(await held('Druh'), { ...NONE, wood: 100, stone: 50 });
    assert.equal(taken.data.character.gold, 700);
    // 1000 gold for 100 wood: the gold leaves at once.
    const bought = await post('mistrz', 'gold', 1000, 'wood', 100);
    assert.equal(bought.status, 200);
    assert.equal(await goldOf('Mistrz'), 4300);
    assert.equal(bought.data.character.gold, 4300);
    assert.equal(bought.data.gold, 4300);
    const tooMuch = await post('mistrz', 'gold', 4301, 'wood', 1);
    assert.deepEqual([tooMuch.data.error.code, tooMuch.data.error.message], ['not_enough', 'Masz tylko 4300 złota.']);
    const [buy] = bought.data.mine.filter((one) => one.state === 'open');
    assert.equal((await take('druh', buy.id)).status, 200);
    assert.deepEqual([await goldOf('Druh'), await goldOf('Mistrz')], [1700, 4300]);
    assert.deepEqual(await held('Druh'), { ...NONE, stone: 50 });
    assert.deepEqual(await held('Mistrz'), { ...NONE, wood: 100 });
    // Withdrawn, run out of time or left behind: the gold comes back, once.
    const back = (await post('mistrz', 'gold', 500, 'stone', 5)).data.mine.find((one) => one.state === 'open');
    assert.equal(await goldOf('Mistrz'), 3800);
    assert.equal((await withdraw('mistrz', back.id)).data.text, 'Oferta wycofana. Wraca: Złoto\u00a0×\u00a0500.');
    assert.equal(await goldOf('Mistrz'), 4300);
    const expiring = (await post('mistrz', 'gold', 200, 'stone', 5)).data.mine.find((one) => one.state === 'open');
    await run('UPDATE guild_offers SET ends_at = ? WHERE id = ?', Date.now() - HOUR, expiring.id);
    assert.equal((await as('mistrz', 'GET', '/api/guild/exchange')).data.character.gold, 4300);
    assert.equal((await as('mistrz', 'GET', '/api/guild/exchange')).data.character, undefined);
    assert.equal(await goldOf('Mistrz'), 4300);
    await post('druh', 'gold', 700, 'wood', 7);
    assert.equal(await goldOf('Druh'), 1000);
    assert.equal((await as('druh', 'POST', '/api/guild/leave')).status, 200);
    assert.equal(await goldOf('Druh'), 1700);
  });

  test('taking an offer swaps both sides in one go, and it closes with its taker', async () => {
    await setResources('Mistrz', { stone: 50 });
    await setResources('Druh', { wood: 100, stone: 7 });
    const [offer] = (await post('mistrz', 'stone', 50, 'wood', 80)).data.mine;
    const taken = await take('druh', offer.id);
    assert.equal(taken.status, 200, JSON.stringify(taken.data).slice(0, 300));
    assert.equal(taken.data.text, 'Wymiana z postacią Mistrz: dostajesz Kamień\u00a0×\u00a050 za Drewno\u00a0×\u00a080.');
    assert.deepEqual(await held('Druh'), { ...NONE, wood: 20, stone: 57 });
    assert.deepEqual(await held('Mistrz'), { ...NONE, wood: 80 });
    assert.equal(taken.data.character.resources.stone, 57);
    assert.deepEqual(taken.data.offers, []);
    const druh = await first("SELECT id FROM characters WHERE name = 'Druh'");
    const row = await first('SELECT state, taker_id, closed_at FROM guild_offers WHERE id = ?', offer.id);
    assert.deepEqual([row.state, row.taker_id], ['taken', druh.id]);
    assert.ok(row.closed_at >= offer.endsAt - rules.openHours * HOUR);
    // The poster sees how it ended.
    const { mine } = (await as('mistrz', 'GET', '/api/guild/exchange')).data;
    assert.deepEqual(
      mine.map((one) => [one.state, one.taker?.name]),
      [['taken', 'Druh']],
    );
    // Once.
    assert.equal((await take('druh', offer.id)).data.error.code, 'closed');
    assert.equal((await take('druh', 99999)).data.error.code, 'no_offer');
    assert.deepEqual(await held('Druh'), { ...NONE, wood: 20, stone: 57 });
  });

  test('the taker must hold the pieces wanted', async () => {
    await setResources('Mistrz', { stone: 50 });
    await setResources('Druh', { wood: 79 });
    const [offer] = (await post('mistrz', 'stone', 50, 'wood', 80)).data.mine;
    const seen = (await as('druh', 'GET', '/api/guild/exchange')).data.offers[0];
    assert.deepEqual([seen.have, seen.missing, seen.canTake], [79, 1, false]);
    const short = await take('druh', offer.id);
    assert.equal(short.data.error.code, 'not_enough');
    assert.equal(short.data.error.message, 'Brakuje: 1 drewna.');
    assert.deepEqual(await held('Druh'), { ...NONE, wood: 79 });
    assert.deepEqual(await held('Mistrz'), NONE);
    assert.equal((await first('SELECT state FROM guild_offers WHERE id = ?', offer.id)).state, 'open');
  });

  test("an offer of one's own, or of another character of the account, is not taken", async () => {
    await setResources('Mistrz', { stone: 50, wood: 500 });
    const [offer] = (await post('mistrz', 'stone', 50, 'wood', 80)).data.mine;
    assert.equal((await take('mistrz', offer.id)).data.error.code, 'own');
    // A second character of Mistrz's account, played now, in the guild too.
    await call('POST', '/api/character', { cookie: cookies.mistrz, body: { name: 'Bliźniak', classId: 'mage', appearance: 'male' } });
    const twin = await first("SELECT id FROM characters WHERE name = 'Bliźniak'");
    const guild = await first("SELECT guild_id FROM guild_members m JOIN characters c ON c.id = m.character_id WHERE c.name = 'Mistrz'");
    await run("UPDATE characters SET level = 30, resources = '{\"wood\":500}' WHERE id = ?", twin.id);
    await run("INSERT INTO guild_members (character_id, guild_id, role, joined_at) VALUES (?, ?, 'member', 0)", twin.id, guild.guild_id);
    const seen = (await as('mistrz', 'GET', '/api/guild/exchange')).data.offers[0];
    assert.deepEqual([seen.own, seen.sameAccount, seen.canTake], [false, true, false]);
    assert.equal((await take('mistrz', offer.id)).data.error.code, 'same_account');
    assert.deepEqual(await held('Bliźniak'), { ...NONE, wood: 500 });
    assert.equal((await first('SELECT state FROM guild_offers WHERE id = ?', offer.id)).state, 'open');
  });

  test('withdrawing an offer, or its time running out, gives the pieces back once', async () => {
    await setResources('Mistrz', { stone: 50, wood: 30 });
    const [withdrawn] = (await post('mistrz', 'stone', 20, 'wood', 10)).data.mine;
    assert.equal((await withdraw('druh', withdrawn.id)).data.error.code, 'not_own');
    const back = await withdraw('mistrz', withdrawn.id);
    assert.equal(back.status, 200);
    assert.equal(back.data.text, 'Oferta wycofana. Wraca: Kamień\u00a0×\u00a020.');
    assert.equal(back.data.character.resources.stone, 50);
    assert.deepEqual(await held('Mistrz'), { ...NONE, stone: 50, wood: 30 });
    assert.equal((await withdraw('mistrz', withdrawn.id)).data.error.code, 'closed');
    assert.deepEqual(await held('Mistrz'), { ...NONE, stone: 50, wood: 30 });
    // Its time runs out: nobody takes it, and the pieces come back the next
    // time the poster opens the Wymiana.
    const expiring = (await post('mistrz', 'wood', 30, 'stone', 5)).data.mine.find((offer) => offer.state === 'open');
    await run('UPDATE guild_offers SET ends_at = ? WHERE id = ?', Date.now() - HOUR, expiring.id);
    await setResources('Druh', { stone: 10 });
    assert.deepEqual((await as('druh', 'GET', '/api/guild/exchange')).data.offers, []);
    assert.equal((await take('druh', expiring.id)).data.error.code, 'closed');
    assert.deepEqual(await held('Mistrz'), { ...NONE, stone: 50 });
    const seen = await as('mistrz', 'GET', '/api/guild/exchange');
    assert.equal(seen.data.character.resources.wood, 30);
    assert.deepEqual(await held('Mistrz'), { ...NONE, stone: 50, wood: 30 });
    const row = await first('SELECT state, closed_at, ends_at FROM guild_offers WHERE id = ?', expiring.id);
    assert.deepEqual([row.state, row.closed_at], ['expired', row.ends_at]);
    assert.equal((await withdraw('mistrz', expiring.id)).data.error.code, 'closed');
    // Or the Gildia page: once.
    const late = (await post('mistrz', 'stone', 50, 'wood', 1)).data.mine.find((offer) => offer.state === 'open');
    await run('UPDATE guild_offers SET ends_at = ? WHERE id = ?', Date.now() - HOUR, late.id);
    const page = await as('mistrz', 'GET', '/api/guild');
    assert.equal(page.data.character.resources.stone, 50);
    assert.equal((await as('mistrz', 'GET', '/api/guild')).data.character, undefined);
    await as('mistrz', 'GET', '/api/guild/exchange');
    assert.deepEqual(await held('Mistrz'), { ...NONE, stone: 50, wood: 30 });
    // The last closed first: an offer whose time ran out closed when it did.
    assert.deepEqual(
      (await as('mistrz', 'GET', '/api/guild/exchange')).data.mine.map((offer) => offer.state),
      ['withdrawn', 'expired', 'expired'],
    );
  });

  test('leaving the guild, being removed from it, or the guild ending gives the pieces back at once', async () => {
    await setResources('Mistrz', { stone: 50 });
    await setResources('Druh', { wood: 40, 'iron-ore': 9 });
    await post('mistrz', 'stone', 50, 'wood', 10);
    const [offer] = (await post('druh', 'wood', 40, 'stone', 1)).data.mine;
    await post('druh', 'iron-ore', 9, 'stone', 1);
    assert.deepEqual(await held('Druh'), NONE);
    const left = await as('druh', 'POST', '/api/guild/leave');
    assert.equal(left.status, 200);
    assert.equal(left.data.character.resources.wood, 40);
    assert.deepEqual(await held('Druh'), { ...NONE, wood: 40, 'iron-ore': 9 });
    assert.deepEqual(
      (await all("SELECT state FROM guild_offers WHERE character_id = (SELECT id FROM characters WHERE name = 'Druh')")).map((row) => row.state),
      ['withdrawn', 'withdrawn'],
    );
    assert.equal((await take('mistrz', offer.id)).data.error.code, 'closed');
    // Removed by the leader.
    await join('druh', 'Druh');
    await post('druh', 'wood', 15, 'stone', 1);
    assert.deepEqual(await held('Druh'), { ...NONE, wood: 25, 'iron-ore': 9 });
    const druh = await first("SELECT id FROM characters WHERE name = 'Druh'");
    assert.equal((await as('mistrz', 'POST', '/api/guild/kick', { characterId: druh.id })).status, 200);
    assert.deepEqual(await held('Druh'), { ...NONE, wood: 40, 'iron-ore': 9 });
    // The last member leaves and the guild ends.
    assert.deepEqual(await held('Mistrz'), NONE);
    assert.equal((await as('mistrz', 'POST', '/api/guild/leave')).status, 200);
    assert.deepEqual(await held('Mistrz'), { ...NONE, stone: 50 });
    assert.equal((await first('SELECT COUNT(*) AS count FROM guilds')).count, 0);
    assert.equal((await first("SELECT COUNT(*) AS count FROM guild_offers WHERE state = 'open'")).count, 0);
  });

  test('up to 3 open offers a member', async () => {
    await setResources('Mistrz', { stone: 100 });
    for (let index = 0; index < rules.offers; index += 1) assert.equal((await post('mistrz', 'stone', 10, 'wood', 10)).status, 200);
    const full = await post('mistrz', 'stone', 10, 'wood', 10);
    assert.equal(full.data.error.code, 'too_many');
    assert.equal(full.data.error.message, 'Naraz wystawisz najwyżej 3 oferty. Wycofaj jedną albo poczekaj na wymianę.');
    assert.deepEqual(await held('Mistrz'), { ...NONE, stone: 100 - 10 * rules.offers });
    const view = (await as('mistrz', 'GET', '/api/guild/exchange')).data;
    assert.equal(view.open, rules.offers);
    assert.equal((await withdraw('mistrz', view.mine[0].id)).status, 200);
    assert.equal((await post('mistrz', 'stone', 10, 'wood', 10)).status, 200);
    // The others' count apart.
    await setResources('Druh', { wood: 10 });
    assert.equal((await post('druh', 'wood', 10, 'stone', 10)).status, 200);
  });

  test('two takers at once make one exchange', async () => {
    await player('trzeci', 'Trzeci');
    await join('trzeci', 'Trzeci');
    await setResources('Mistrz', { stone: 50 });
    await setResources('Druh', { wood: 100 });
    await setResources('Trzeci', { wood: 100 });
    const [offer] = (await post('mistrz', 'stone', 50, 'wood', 80)).data.mine;
    const answers = await Promise.all([take('druh', offer.id), take('trzeci', offer.id), take('druh', offer.id)]);
    assert.deepEqual(
      answers.map((one) => one.status).sort(),
      [200, 409, 409],
    );
    assert.ok(answers.filter((one) => one.status === 409).every((one) => one.data.error.code === 'closed'));
    const [mistrz, druh, trzeci] = [await held('Mistrz'), await held('Druh'), await held('Trzeci')];
    assert.deepEqual(mistrz, { ...NONE, wood: 80 });
    assert.equal(druh.wood + trzeci.wood, 120);
    assert.equal(druh.stone + trzeci.stone, 50);
    assert.ok([druh, trzeci].some((one) => one.stone === 50 && one.wood === 20));
  });

  test('closed offers stay with their taker and time; those closed before last week go with the next offer', async () => {
    const mistrz = await first("SELECT id FROM characters WHERE name = 'Mistrz'");
    const druh = await first("SELECT id FROM characters WHERE name = 'Druh'");
    const guild = await first('SELECT guild_id FROM guild_members WHERE character_id = ?', mistrz.id);
    const insert = (closedAt, state) =>
      run(
        "INSERT INTO guild_offers (guild_id, character_id, give, give_count, want, want_count, state, created_at, ends_at, closed_at, taker_id) VALUES (?, ?, 'stone', 5, 'wood', 5, ?, ?, ?, ?, ?)",
        guild.guild_id,
        mistrz.id,
        state,
        closedAt - HOUR,
        closedAt + rules.openHours * HOUR,
        closedAt,
        state === 'taken' ? druh.id : null,
      );
    await insert(Date.now() - 15 * 24 * HOUR, 'taken');
    await insert(Date.now() - HOUR, 'taken');
    await insert(Date.now() - 15 * 24 * HOUR, 'withdrawn');
    await setResources('Druh', { wood: 5 });
    assert.equal((await post('druh', 'wood', 5, 'stone', 5)).status, 200);
    assert.deepEqual(
      (await all('SELECT state, taker_id FROM guild_offers ORDER BY id')).map((row) => [row.state, row.taker_id]),
      [
        ['taken', druh.id],
        ['open', null],
      ],
    );
    // A taker that goes leaves the exchange counted, without its name, and
    // the offers of a character that goes go with it.
    assert.equal((await as('druh', 'DELETE', '/api/character')).status, 200);
    assert.deepEqual(
      (await all('SELECT state, taker_id FROM guild_offers')).map((row) => [row.state, row.taker_id]),
      [['taken', null]],
    );
    assert.deepEqual(
      (await as('mistrz', 'GET', '/api/guild/exchange')).data.mine.map((offer) => [offer.state, offer.taker?.name ?? null]),
      [['taken', null]],
    );
  });
});

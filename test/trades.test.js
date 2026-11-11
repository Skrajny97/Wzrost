// The Wymiana between characters of players online: a proposal accepted,
// both offers, the first confirmation freezing them and the second making
// the trade at once; a player offline, proposals turned down too often, a
// player blocked and trades turned off; a potion from a trade waits for its
// recipe, an item for the character's level.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { createRng, generateItem } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

describe('Wymiana', () => {
  const { call, db, signUp } = useServer();
  const players = {};

  // An account with a character at `level` (the Wymiana's, 20, by
  // default), 500 gold, online.
  async function player(login, { level = 20 } = {}) {
    const { cookie } = await signUp(login);
    await call('POST', '/api/character', { cookie, body: { name: login, classId: 'mage', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = ?, gold = 500 WHERE name = ?').bind(level, login).run();
    await call('GET', '/api/chat/latest', { cookie });
    return cookie;
  }
  const row = async (name) => (await db()).prepare('SELECT id, gold, herbs, potions FROM characters WHERE name = ?').bind(name).first();
  // An item in a character's bag.
  async function inBag(name, item) {
    const made = await (await db()).prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)').bind((await row(name)).id, JSON.stringify(item)).run();
    return made.meta.last_row_id;
  }
  const amulet = (level) => ({ base: 'amulet', slot: 'amulet', level, rarity: 'common', affixes: [], implicit: { stat: 'will', value: 2 } });
  const trade = (cookie, action, body) => call('POST', `/api/trade/${action}`, { cookie, body });
  const current = async (cookie) => (await call('GET', '/api/trade', { cookie })).data.trade;

  beforeEach(async () => {
    players.ala = await player('Ala');
    players.ola = await player('Ola');
  });

  // Ala proposes, Ola accepts.
  async function opened() {
    const proposed = await trade(players.ala, 'propose', { id: (await row('Ola')).id });
    assert.equal(proposed.status, 200, JSON.stringify(proposed.data));
    const answered = await trade(players.ola, 'answer', { id: proposed.data.trade.id, accept: true });
    assert.equal(answered.data.trade.state, 'open');
    return proposed.data.trade.id;
  }

  test('offers freeze at the first confirmation, and the second moves all of them at once', async () => {
    const herbs = content.herbs[0].id;
    await (await db()).prepare('UPDATE characters SET herbs = ? WHERE name = ?').bind(JSON.stringify({ [herbs]: 7 }), 'Ola').run();
    const given = await inBag('Ala', amulet(10));
    const id = await opened();
    // Ola sees the proposal on the tab's light too.
    assert.equal((await call('GET', '/api/chat/latest', { cookie: players.ola })).data.trade.state, 'open');
    await trade(players.ala, 'offer', { id, offer: { gold: 120, items: [given] } });
    const offered = await trade(players.ola, 'offer', { id, offer: { herbs: { [herbs]: 5 } } });
    assert.deepEqual(offered.data.trade.theirs.items.map(({ id: item }) => item), [given]);
    assert.equal(offered.data.trade.theirs.gold, 120);
    // Ola confirms what she sees; Ala can no longer change her offer.
    const locked = await trade(players.ola, 'confirm', { id, version: offered.data.trade.version });
    assert.deepEqual([locked.data.trade.state, locked.data.trade.lockedBy], ['locked', 'me']);
    assert.equal((await trade(players.ala, 'offer', { id, offer: { gold: 1 } })).data.error.code, 'locked');
    assert.equal((await trade(players.ola, 'confirm', { id, version: locked.data.trade.version })).data.error.code, 'waiting');
    const done = await trade(players.ala, 'confirm', { id, version: locked.data.trade.version });
    assert.equal(done.status, 200, JSON.stringify(done.data));
    assert.equal(done.data.trade.state, 'done');
    const [ala, ola] = [await row('Ala'), await row('Ola')];
    assert.deepEqual([ala.gold, ola.gold], [380, 620]);
    assert.deepEqual([JSON.parse(ala.herbs), JSON.parse(ola.herbs)], [{ [herbs]: 5 }, { [herbs]: 2 }]);
    const moved = await (await db()).prepare('SELECT character_id, data FROM items WHERE id = ?').bind(given).first();
    assert.equal(moved.character_id, ola.id);
    assert.equal(JSON.parse(moved.data).traded, 1);
    assert.equal(await current(players.ala), null);
  });

  test('the exchange gives exactly the item offered, not one changed after the offer (the code review)', async () => {
    const given = await inBag('Ala', amulet(10));
    const id = await opened();
    const offered = await trade(players.ala, 'offer', { id, offer: { items: [given] } });
    const locked = await trade(players.ola, 'confirm', { id, version: offered.data.trade.version });
    assert.equal(locked.data.trade.state, 'locked');
    // After Ola's confirmation the item changes (as the Kowadło or the
    // Zaklinaczka, or another item taking its number, would change it).
    await (await db()).prepare("UPDATE items SET data = json_set(data, '$.level', 1) WHERE id = ?").bind(given).run();
    const done = await trade(players.ala, 'confirm', { id, version: locked.data.trade.version });
    assert.notEqual(done.status, 200);
    const kept = await (await db()).prepare('SELECT character_id FROM items WHERE id = ?').bind(given).first();
    assert.equal(kept.character_id, (await row('Ala')).id);
  });

  test('what a trade brings stays out of the Encyklopedia until the character finds or makes its own', async () => {
    const herb = content.herbs[0].id;
    await (await db()).prepare('UPDATE characters SET herbs = ? WHERE name = ?').bind(JSON.stringify({ [herb]: 7 }), 'Ola').run();
    const given = await inBag('Ala', amulet(10));
    const id = await opened();
    await trade(players.ala, 'offer', { id, offer: { items: [given] } });
    const offered = await trade(players.ola, 'offer', { id, offer: { herbs: { [herb]: 5 } } });
    const locked = await trade(players.ola, 'confirm', { id, version: offered.data.trade.version });
    assert.equal((await trade(players.ala, 'confirm', { id, version: locked.data.trade.version })).status, 200);
    for (const cookie of [players.ala, players.ola]) await call('GET', '/api/character', { cookie });
    const record = async (name) => {
      const found = await (await db()).prepare('SELECT discovered, foreign_stacks FROM characters WHERE name = ?').bind(name).first();
      return { discovered: JSON.parse(found.discovered), foreign: JSON.parse(found.foreign_stacks) };
    };
    const ala = await record('Ala');
    assert.equal(ala.discovered[`herb:${herb}`], undefined);
    assert.deepEqual(ala.foreign, { [`herb:${herb}`]: 5 });
    // Ola's own herbs count, the amulet from the trade does not.
    const ola = await record('Ola');
    assert.equal(ola.discovered[`herb:${herb}`], 1);
    assert.equal(ola.discovered['item:amulet'], undefined);
    // Ala gathers two of her own, then uses up all but one.
    await (await db()).prepare('UPDATE characters SET herbs = ? WHERE name = ?').bind(JSON.stringify({ [herb]: 7 }), 'Ala').run();
    await call('GET', '/api/character', { cookie: players.ala });
    assert.equal((await record('Ala')).discovered[`herb:${herb}`], 1);
    await (await db()).prepare('UPDATE characters SET herbs = ? WHERE name = ?').bind(JSON.stringify({ [herb]: 1 }), 'Ala').run();
    await call('GET', '/api/character', { cookie: players.ala });
    assert.deepEqual((await record('Ala')).foreign, { [`herb:${herb}`]: 1 });
  });

  test('materials go in a trade too, of any grade, and take no places in the bag', async () => {
    const stock = (name, materials) => db().then((database) => database.prepare('UPDATE characters SET materials = ? WHERE name = ?').bind(JSON.stringify(materials), name).run());
    const materials = async (name) => JSON.parse((await (await db()).prepare('SELECT materials FROM characters WHERE name = ?').bind(name).first()).materials);
    await stock('Ala', { 'wolf-pelt:rare': 4, 'fox-pelt:common': 2 });
    await stock('Ola', { 'wolf-pelt:rare': 1 });
    const id = await opened();
    assert.equal((await trade(players.ala, 'offer', { id, offer: { materials: { 'wolf-pelt:rare': 5 } } })).data.error.code, 'not_enough');
    assert.equal((await trade(players.ala, 'offer', { id, offer: { materials: { 'constructor:common': 1 } } })).data.error.code, 'invalid_offer');
    assert.equal((await trade(players.ala, 'offer', { id, offer: { materials: { 'wolf-pelt': 1 } } })).data.error.code, 'invalid_offer');
    await trade(players.ala, 'offer', { id, offer: { materials: { 'wolf-pelt:rare': 4 } } });
    const offered = await trade(players.ola, 'offer', { id, offer: { gold: 30 } });
    const [stack] = offered.data.trade.theirs.materials;
    assert.deepEqual([stack.id, stack.materialId, stack.rarity, stack.count], ['wolf-pelt:rare', 'wolf-pelt', 'rare', 4]);
    assert.match(stack.label, /^rzadk/);
    const locked = await trade(players.ola, 'confirm', { id, version: offered.data.trade.version });
    const done = await trade(players.ala, 'confirm', { id, version: locked.data.trade.version });
    assert.equal(done.data.trade.state, 'done', JSON.stringify(done.data));
    assert.deepEqual(await materials('Ala'), { 'fox-pelt:common': 2 });
    assert.deepEqual(await materials('Ola'), { 'wolf-pelt:rare': 5 });
    assert.deepEqual([(await row('Ala')).gold, (await row('Ola')).gold], [530, 470]);
  });

  // The author's 571 ("koniecznie"): the gems and ores of Górnictwo in the
  // Wymiana too.
  test('gems and ores go in a trade too, take no places in the bag and stay out of the Encyklopedia', async () => {
    const stock = (name, minerals) => db().then((database) => database.prepare('UPDATE characters SET minerals = ? WHERE name = ?').bind(JSON.stringify(minerals), name).run());
    const held = async (name) => {
      const found = await (await db()).prepare('SELECT minerals, foreign_stacks, discovered FROM characters WHERE name = ?').bind(name).first();
      return { minerals: JSON.parse(found.minerals), foreign: JSON.parse(found.foreign_stacks), discovered: JSON.parse(found.discovered) };
    };
    await stock('Ala', { sapphire: 2, 'silver-ore': 10 });
    await stock('Ola', { quartz: 3 });
    const id = await opened();
    assert.equal((await trade(players.ala, 'offer', { id, offer: { minerals: { sapphire: 3 } } })).data.error.code, 'not_enough');
    assert.equal((await trade(players.ala, 'offer', { id, offer: { minerals: { glass: 1 } } })).data.error.code, 'invalid_offer');
    await trade(players.ala, 'offer', { id, offer: { minerals: { sapphire: 2, 'silver-ore': 4 } } });
    const offered = await trade(players.ola, 'offer', { id, offer: { minerals: { quartz: 1 }, gold: 40 } });
    assert.deepEqual(
      offered.data.trade.theirs.minerals.map((stack) => [stack.id, stack.name, stack.rarity, stack.count]),
      [
        ['sapphire', 'Szafir', 'legendary', 2],
        ['silver-ore', 'Srebrny kruszec', 'common', 4],
      ],
    );
    const locked = await trade(players.ola, 'confirm', { id, version: offered.data.trade.version });
    const done = await trade(players.ala, 'confirm', { id, version: locked.data.trade.version });
    assert.equal(done.data.trade.state, 'done', JSON.stringify(done.data));
    for (const cookie of [players.ala, players.ola]) await call('GET', '/api/character', { cookie });
    const ala = await held('Ala');
    const ola = await held('Ola');
    assert.deepEqual(ala.minerals, { 'silver-ore': 6, quartz: 1 });
    assert.deepEqual(ola.minerals, { quartz: 2, sapphire: 2, 'silver-ore': 4 });
    assert.deepEqual(ola.foreign, { 'mineral:sapphire': 2, 'mineral:silver-ore': 4 });
    // Ola's own quartz counts in the Encyklopedia, the sapphires from the trade do not.
    assert.deepEqual([ola.discovered['mineral:quartz'], ola.discovered['mineral:sapphire']], [1, undefined]);
    assert.equal(ala.discovered['mineral:quartz'], undefined);
  });

  // The author's "Konieczne" (4.11.2026, after a player's question on the
  // chat): the camp's wood, stone and ore in the Wymiana too, as in the
  // Gildia's Wymiana.
  test('the camp resources go in a trade too, and stay out of the Encyklopedia record', async () => {
    const stock = (name, resources) => db().then((database) => database.prepare('UPDATE characters SET resources = ? WHERE name = ?').bind(JSON.stringify(resources), name).run());
    const held = async (name) => {
      const found = await (await db()).prepare('SELECT resources, foreign_stacks FROM characters WHERE name = ?').bind(name).first();
      return { resources: JSON.parse(found.resources), foreign: JSON.parse(found.foreign_stacks) };
    };
    await stock('Ala', { wood: 120, stone: 5, 'iron-ore': 0 });
    await stock('Ola', { wood: 0, stone: 40, 'iron-ore': 15 });
    const id = await opened();
    assert.equal((await trade(players.ala, 'offer', { id, offer: { resources: { stone: 6 } } })).data.error.code, 'not_enough');
    assert.equal((await trade(players.ala, 'offer', { id, offer: { resources: { gold: 1 } } })).data.error.code, 'invalid_offer');
    assert.equal((await trade(players.ala, 'offer', { id, offer: { resources: { wood: 1.5 } } })).data.error.code, 'invalid_offer');
    await trade(players.ala, 'offer', { id, offer: { resources: { wood: 100 } } });
    const offered = await trade(players.ola, 'offer', { id, offer: { resources: { stone: 30, 'iron-ore': 15 } } });
    assert.deepEqual(
      offered.data.trade.theirs.resources.map((stack) => [stack.id, stack.name, stack.count]),
      [['wood', 'Drewno', 100]],
    );
    assert.deepEqual(
      offered.data.trade.mine.resources.map((stack) => [stack.id, stack.count]),
      [
        ['stone', 30],
        ['iron-ore', 15],
      ],
    );
    const locked = await trade(players.ola, 'confirm', { id, version: offered.data.trade.version });
    const done = await trade(players.ala, 'confirm', { id, version: locked.data.trade.version });
    assert.equal(done.data.trade.state, 'done', JSON.stringify(done.data));
    const ala = await held('Ala');
    const ola = await held('Ola');
    assert.deepEqual(ala.resources, { wood: 20, stone: 35, 'iron-ore': 15 });
    assert.deepEqual(ola.resources, { wood: 100, stone: 10 });
    assert.equal(Object.keys(ala.foreign).filter((key) => key.startsWith('resource:')).length, 0);
    assert.equal(Object.keys(ola.foreign).filter((key) => key.startsWith('resource:')).length, 0);
  });

  test('a confirmation is for the offers as seen, and a trade that lost its items moves nothing', async () => {
    const given = await inBag('Ala', amulet(3));
    const id = await opened();
    const seen = (await trade(players.ala, 'offer', { id, offer: { items: [given] } })).data.trade;
    await trade(players.ola, 'offer', { id, offer: { gold: 50 } });
    assert.equal((await trade(players.ala, 'confirm', { id, version: seen.version })).data.error.code, 'changed');
    const now = await current(players.ala);
    await trade(players.ala, 'confirm', { id, version: now.version });
    // The amulet leaves Ala's bag before Ola confirms.
    await (await db()).prepare('DELETE FROM items WHERE id = ?').bind(given).run();
    const stale = await trade(players.ola, 'confirm', { id, version: now.version });
    assert.equal(stale.data.error.code, 'stale');
    assert.deepEqual([(await row('Ala')).gold, (await row('Ola')).gold], [500, 500]);
    assert.equal(await current(players.ola), null);
  });

  test('goes on while a character is away, on an exploration or at work', async () => {
    // The author: "Niech system pozwala na Wymianę i różne działania na
    // przedmiotach w czasie zbierania ziół itp."
    assert.equal((await call('POST', '/api/hunts', { cookie: players.ola, body: { areaId: 'windfalls-edge', minutes: 5 } })).status, 201);
    const id = await opened();
    await (await db()).prepare('UPDATE characters SET gold = 100').run();
    assert.equal((await trade(players.ola, 'offer', { id, offer: { gold: 5 } })).status, 200);
    const offered = await trade(players.ala, 'offer', { id, offer: { gold: 7 } });
    assert.equal(offered.status, 200);
    const locked = await trade(players.ala, 'confirm', { id, version: offered.data.trade.version });
    assert.equal(locked.status, 200, JSON.stringify(locked.data));
    const done = await trade(players.ola, 'confirm', { id, version: locked.data.trade.version });
    assert.equal(done.data.trade.state, 'done', JSON.stringify(done.data));
    assert.deepEqual([(await row('Ala')).gold, (await row('Ola')).gold], [98, 102]);
  });

  test('only with a player online, who takes trades, and not after too many turned down', async () => {
    const ola = (await row('Ola')).id;
    await (await db()).prepare("UPDATE users SET seen_at = 0 WHERE login = 'Ola'").run();
    const offline = await trade(players.ala, 'propose', { id: ola });
    assert.equal(offline.data.error.code, 'offline');
    assert.equal(offline.data.error.message, 'Gracz Ola nie jest online.');
    await call('GET', '/api/chat/latest', { cookie: players.ola });
    // Turned down rejectionsInRow times in a row: a pause.
    const { rejectionsInRow } = content.community.trade;
    for (let i = 0; i < rejectionsInRow; i += 1) {
      const proposed = await trade(players.ala, 'propose', { id: ola });
      assert.equal(proposed.status, 200, JSON.stringify(proposed.data));
      await trade(players.ola, 'answer', { id: proposed.data.trade.id, accept: false });
    }
    assert.equal((await trade(players.ala, 'propose', { id: ola })).data.error.code, 'paused');
    // Ola blocks Ala, or takes no trades at all.
    await (await db()).prepare('DELETE FROM trades').run();
    const ala = (await row('Ala')).id;
    await trade(players.ola, 'block', { id: ala });
    assert.equal((await trade(players.ala, 'propose', { id: ola })).data.error.code, 'refused');
    // Ala's sheet shows the block, and lifts it.
    assert.equal((await call('GET', '/api/profile/Ala', { cookie: players.ola })).data.profile.tradeBlocked, true);
    await trade(players.ola, 'block', { id: ala, blocked: false });
    assert.deepEqual((await call('GET', '/api/trade/settings', { cookie: players.ola })).data.blocked, []);
    // So does the list in the settings.
    await trade(players.ola, 'block', { id: ala });
    const settings = (await call('GET', '/api/trade/settings', { cookie: players.ola })).data;
    assert.deepEqual(settings.blocked.map(({ name }) => name), ['Ala']);
    await trade(players.ola, 'block', { user: settings.blocked[0].user, blocked: false });
    await trade(players.ola, 'settings', { off: true });
    assert.equal((await trade(players.ala, 'propose', { id: ola })).data.error.code, 'refused');
    // The sheet tells Ola she blocks no one now.
    assert.equal((await call('GET', '/api/profile/Ala', { cookie: players.ola })).data.profile.tradeBlocked, false);
  });

  test('opens at character level 20 for both sides, and a trade begun below it moves nothing', async () => {
    const { minLevel } = content.community.trade;
    const ola = (await row('Ola')).id;
    // Ala below the level: no proposal.
    await (await db()).prepare("UPDATE characters SET level = ? WHERE name = 'Ala'").bind(minLevel - 1).run();
    const early = await trade(players.ala, 'propose', { id: ola });
    assert.equal(early.data.error.code, 'trade_level');
    assert.equal(early.data.error.message, `Wymiana otworzy się na ${minLevel}. poziomie postaci.`);
    // Ola below it: no proposal to her either.
    await (await db()).prepare('UPDATE characters SET level = ?').bind(minLevel).run();
    await (await db()).prepare("UPDATE characters SET level = ? WHERE name = 'Ola'").bind(minLevel - 1).run();
    const other = await trade(players.ala, 'propose', { id: ola });
    assert.equal(other.data.error.code, 'trade_level_other');
    assert.equal(other.data.error.message, `Postać Ola wymieni się dopiero od ${minLevel}. poziomu.`);
    // A trade begun with both at the level, when one is below it (as one
    // begun before the rule): offers wait, a confirmation ends it unmoved.
    await (await db()).prepare('UPDATE characters SET level = ?').bind(minLevel).run();
    const id = await opened();
    const offered = await trade(players.ala, 'offer', { id, offer: { gold: 100 } });
    await (await db()).prepare("UPDATE characters SET level = ? WHERE name = 'Ala'").bind(minLevel - 1).run();
    assert.equal((await trade(players.ala, 'offer', { id, offer: { gold: 50 } })).data.error.code, 'trade_level');
    const confirmed = await trade(players.ola, 'confirm', { id, version: offered.data.trade.version });
    assert.equal(confirmed.data.error.code, 'trade_level_other');
    assert.equal((await (await db()).prepare('SELECT state FROM trades WHERE id = ?').bind(id).first()).state, 'cancelled');
    assert.deepEqual([(await row('Ala')).gold, (await row('Ola')).gold], [500, 500]);
  });

  test('a potion from a trade waits for its recipe, an item for its Tier, whatever its own level', async () => {
    const potion = content.potions.find((entry) => entry.effect.heal);
    // Below the Profesje's level the recipe is unknown.
    await (await db()).prepare("UPDATE characters SET level = 6, potions = ? WHERE name = 'Ala'").bind(JSON.stringify({ [potion.id]: 3 })).run();
    const drunk = await call('POST', '/api/potions/drink', { cookie: players.ala, body: { potionId: potion.id } });
    assert.equal(drunk.data.error.code, 'unknown_recipe');
    const hunt = await call('POST', '/api/hunts', { cookie: players.ala, body: { areaId: 'windfalls-edge', minutes: 5, potions: { [potion.id]: 1 }, healBelow: 0.4 } });
    assert.equal(hunt.data.error.code, 'unknown_recipe');
    const character = (await call('GET', '/api/character', { cookie: players.ala })).data.character;
    assert.equal(character.professions, null);
    // An item got in a trade is worn by its Tier, as an own find, whatever
    // its own level (the author: "Niech przedmioty z Wymian i Targowiska
    // działają w oparciu o Tiery a nie poziomy samej broni").
    await (await db()).prepare("UPDATE characters SET level = 30, class_level = 9 WHERE name = 'Ala'").run();
    const strong = await inBag('Ala', { ...amulet(40), traded: 1 });
    assert.equal((await call('POST', `/api/items/${strong}/equip`, { cookie: players.ala })).status, 200);
    // A Tier II talisman waits for class level 10, from a trade too.
    const stone = await inBag('Ala', { ...generateItem({ baseId: 'holed-stone', level: 5 }, createRng('stone'), content), traded: 1 });
    const early = await call('POST', `/api/items/${stone}/equip`, { cookie: players.ala });
    assert.equal(early.data.error.code, 'class_level');
    assert.equal(early.data.error.message, 'Ten przedmiot założysz od poziomu klasy 10.');
    await (await db()).prepare("UPDATE characters SET class_level = 10 WHERE name = 'Ala'").run();
    assert.equal((await call('POST', `/api/items/${stone}/equip`, { cookie: players.ala })).status, 200);
  });
});

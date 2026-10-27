// The Wymiana between characters of players online: a proposal accepted,
// both offers, the first confirmation freezing them and the second making
// the trade at once; a player offline, proposals turned down too often, a
// player blocked and trades turned off; a potion from a trade waits for its
// recipe, an item for the character's level.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

describe('Wymiana', () => {
  const { call, db, signUp } = useServer();
  const players = {};

  // An account with a character at `level`, 500 gold, online.
  async function player(login, { level = 12 } = {}) {
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

  test('waits for both characters at home, as every change of the bag does', async () => {
    const id = await opened();
    assert.equal((await call('POST', '/api/hunts', { cookie: players.ola, body: { areaId: 'windfalls-edge', minutes: 5 } })).status, 201);
    assert.equal((await trade(players.ola, 'offer', { id, offer: { gold: 5 } })).data.error.code, 'busy');
    const offered = await trade(players.ala, 'offer', { id, offer: { gold: 5 } });
    assert.equal(offered.status, 200);
    assert.equal((await trade(players.ala, 'confirm', { id, version: offered.data.trade.version })).data.error.code, 'away');
    await trade(players.ala, 'cancel', { id });
    assert.equal((await trade(players.ala, 'propose', { id: (await row('Ola')).id })).data.error.code, 'away');
    assert.equal((await trade(players.ola, 'propose', { id: (await row('Ala')).id })).data.error.code, 'busy');
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

  test('a potion from a trade waits for its recipe, an item for the character\'s level', async () => {
    const potion = content.potions.find((entry) => entry.effect.heal);
    // Below the Profesje's level the recipe is unknown.
    await (await db()).prepare("UPDATE characters SET level = 6, potions = ? WHERE name = 'Ala'").bind(JSON.stringify({ [potion.id]: 3 })).run();
    const drunk = await call('POST', '/api/potions/drink', { cookie: players.ala, body: { potionId: potion.id } });
    assert.equal(drunk.data.error.code, 'unknown_recipe');
    const hunt = await call('POST', '/api/hunts', { cookie: players.ala, body: { areaId: 'windfalls-edge', minutes: 5, potions: { [potion.id]: 1 }, healBelow: 0.4 } });
    assert.equal(hunt.data.error.code, 'unknown_recipe');
    const character = (await call('GET', '/api/character', { cookie: players.ala })).data.character;
    assert.equal(character.professions, null);
    // An amulet above the character's level, got in a trade.
    const strong = await inBag('Ala', { ...amulet(20), traded: 1 });
    const worn = await call('POST', `/api/items/${strong}/equip`, { cookie: players.ala });
    assert.equal(worn.data.error.code, 'trade_level');
    const own = await inBag('Ala', amulet(20));
    assert.equal((await call('POST', `/api/items/${own}/equip`, { cookie: players.ala })).status, 200);
  });
});

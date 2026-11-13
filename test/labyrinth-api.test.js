// The Labirynt Systemu and the Rdzeń through the API (src/server/labyrinth.js,
// src/server/core.js; DECISIONS.md, "Labirynt Systemu i Rdzeń", 850–866):
// from level 30 where LABYRINTH is on, nothing of them where it is off; a
// level walked room by room with the HP carried from fight to fight, a
// fight not won ending the day, the spring's healing, the blessings after
// a guardian and at an altar, the merchant's wares for gold, the guardian's
// Artefakt opening the Rdzeń and the next level, Piekielny after the third,
// a new Labirynt at midnight; the Rdzeń's Skrytka with its Wchłoń, Ulepsz,
// Rozpuść and Rozbij, a gem set in it in the Szlifiernia, and a champion of
// the Wieże leaving an Artefakt.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { artifactUpgradeCost, breakShards, coreEffects, labyrinthMap, makeArtifact, createRng, playerCombatant, resetPrice, xpToNext } from '../src/engine/index.js';
import { makeClimber } from './helpers/climb.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

// Today's Labirynt day, the Polish date (854 A).
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: content.quests.timeZone }).format(new Date());

// A state of today's Labirynt as the server keeps it.
const stateOf = (fields = {}) => ({
  day: today(),
  level: 1,
  row: -1,
  room: null,
  path: [],
  cleared: 0,
  over: null,
  team: [],
  hp: { me: 1 },
  charLevel: 60,
  blessings: [],
  pending: null,
  gains: { xp: 0, gold: 0, shards: 0, artifacts: 0 },
  seed: 'test-seed',
  ...fields,
});

// The first room of a kind on a level of today's map, with a room of the
// row before that leads to it ({ level, row, room, from }), or null.
function findRoom(type, levels = [1, 2, 3, 4]) {
  for (const level of levels) {
    const map = labyrinthMap(today(), level, content);
    for (let row = 1; row < map.rows.length; row++) {
      const room = map.rows[row].findIndex((one) => one.type === type);
      if (room < 0) continue;
      const from = map.rows[row - 1].findIndex((one) => one.links.includes(room));
      return { level, row, room, from };
    }
  }
  return null;
}

describe('the Labirynt Systemu through the API', () => {
  const { call, db, signUp } = useServer({ LABYRINTH: 'on' });
  let cookie;
  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const get = async () => (await call('GET', '/api/labyrinth', { cookie })).data.labyrinth;
  const enter = (body) => call('POST', '/api/labyrinth/room', { cookie, body });
  const kept = async () => JSON.parse((await (await db()).prepare('SELECT labyrinth FROM characters').first()).labyrinth);
  const coreRow = async () => JSON.parse((await (await db()).prepare('SELECT core FROM characters').first()).core);
  // The party standing in room `from` of the row before `row` on `level`.
  const standBefore = (spot, fields = {}) => set('labyrinth = ?', JSON.stringify(stateOf({ level: spot.level, row: spot.row - 1, room: spot.from, path: [spot.from], ...fields })));

  beforeEach(async () => {
    ({ cookie } = await signUp('labirynt'));
    await call('POST', '/api/character', { cookie, body: { name: 'Wedrowiec', classId: 'warrior', appearance: 'female' } });
    await set('level = 60, class_level = 50');
  });

  test('the Labirynt opens at level 30; its map has six rows of 2–3 rooms and the guardian, any room of the first row open', async () => {
    await set('level = 29');
    const locked = await call('GET', '/api/labyrinth', { cookie });
    assert.equal(locked.status, 403);
    assert.equal(locked.data.error.code, 'locked');
    await set('level = 30');
    const labyrinth = await get();
    assert.equal(labyrinth.day, today());
    assert.equal(labyrinth.level, 1);
    assert.equal(labyrinth.started, false);
    assert.equal(labyrinth.map.length, content.labyrinth.map.rows + 1);
    assert.deepEqual(labyrinth.map.at(-1).map((room) => room.type), ['guardian']);
    for (const row of labyrinth.map.slice(0, -1)) assert.ok(row.length >= 2 && row.length <= 3);
    assert.ok(labyrinth.map[0].every((room) => room.type === 'fight'));
    assert.deepEqual(labyrinth.reachable, labyrinth.map[0].map((_, index) => index));
    // The creatures of the rooms that can be entered are named, at the
    // higher of the character's level (30) and its class level (50): the
    // author, 12.11.2026.
    assert.equal(labyrinth.charLevel, 50);
    assert.ok(labyrinth.map[0].every((room) => room.foes.length > 0 && room.foes.every((foe) => foe.level === 50)));
    // At the entrance every fight of the level has its danger against the
    // party (899 A), the other rooms none; the elites and the treasures
    // show the level's Odłamki.
    for (const row of labyrinth.map) {
      for (const room of row) {
        if (['fight', 'elite', 'guardian'].includes(room.type)) assert.ok(['easy', 'even', 'deadly'].includes(room.danger), `${room.type}: ${room.danger}`);
        else assert.equal(room.danger, null);
        assert.equal(room.shards, content.labyrinth.levels[0].shards[room.type] ?? null);
      }
    }
    assert.equal(labyrinth.fighters[0].key, 'me');
    assert.equal(labyrinth.fighters[0].hp, labyrinth.fighters[0].maxHp);
    // The same map as the engine's for the day, for everyone.
    assert.deepEqual(labyrinth.map.map((row) => row.map((room) => room.type)), labyrinthMap(today(), 1, content).rows.map((row) => row.map((room) => room.type)));
    const unlock = content.unlocks.find((one) => one.id === 'labyrinth');
    assert.equal(unlock.level, 30);
    // With the class below the character, the character's level counts; a
    // Labirynt not yet entered follows the levels of now.
    await set('class_level = 20');
    const lower = await get();
    assert.equal(lower.charLevel, 30);
    assert.ok(lower.map[0].every((room) => room.foes.every((foe) => foe.level === 30)));
  });

  test('a fight in the first row: its report at once, the HP carried on, the XP and gold given; only rooms the room leads to', async () => {
    await makeClimber(await db(), (await (await db()).prepare('SELECT id FROM characters').first()).id);
    await set('level = 60');
    const before = (await call('GET', '/api/character', { cookie })).data.character;
    assert.equal((await enter({ level: 1, row: 1, room: 0 })).data.error.code, 'stale_room');
    assert.equal((await enter({ level: 1, row: 0, room: 9 })).data.error.code, 'unreachable_room');
    const entered = await enter({ level: 1, row: 0, room: 0 });
    assert.equal(entered.status, 200, JSON.stringify(entered.data).slice(0, 400));
    const { room, report, labyrinth, character } = entered.data;
    assert.equal(room.type, 'fight');
    assert.equal(report.kind, 'labyrinth');
    assert.equal(report.fights.length, 1);
    assert.equal(report.labyrinth.level, 1);
    assert.equal(labyrinth.row, 0);
    assert.equal(labyrinth.started, true);
    if (room.won) {
      assert.ok(room.gains.xp > 0 && room.gains.gold > 0);
      assert.equal(character.gold, before.gold + room.gains.gold);
      // The HP the fight left goes on (852 A).
      const me = labyrinth.fighters[0];
      assert.equal(me.hp, report.fights[0].hpAfter);
      const map = labyrinthMap(today(), 1, content);
      assert.deepEqual(labyrinth.reachable, map.rows[0][0].links);
      // The danger only on the rooms still ahead: none in the first row,
      // nor in the second on the rooms its road misses.
      assert.ok(labyrinth.map[0].every((one) => one.danger === null));
      labyrinth.map[1].forEach((one, index) => {
        if (!map.rows[0][0].links.includes(index)) assert.equal(one.danger, null);
        else if (['fight', 'elite'].includes(one.type)) assert.ok(one.danger);
      });
    }
    // The report is in the Dziennik, apart from the others.
    const journal = (await call('GET', '/api/reports', { cookie })).data.reports;
    assert.equal(journal[0].kind, 'labyrinth');
  });

  test('a fight not won ends the day: no further room until midnight, the rewards taken stay', async () => {
    // A character without gear against Piekielny's creatures.
    await set('labyrinth = ?, gold = 500', JSON.stringify(stateOf({ level: 4, cleared: 3, charLevel: 60, gains: { xp: 10, gold: 20, shards: 3, artifacts: 1 } })));
    const lost = await enter({ level: 4, row: 0, room: 0 });
    assert.equal(lost.status, 200);
    assert.equal(lost.data.room.won, false);
    assert.equal(lost.data.labyrinth.over, 'fainted');
    assert.deepEqual(lost.data.labyrinth.gains, { xp: 10, gold: 20, shards: 3, artifacts: 1 });
    assert.equal(lost.data.character.gold, 500);
    assert.equal((await enter({ level: 4, row: 1, room: 0 })).data.error.code, 'labyrinth_over');
    // A new day, a new Labirynt (854 A).
    await set('labyrinth = ?', JSON.stringify(stateOf({ day: '2020-01-01', over: 'fainted', level: 3 })));
    const fresh = await get();
    assert.equal(fresh.level, 1);
    assert.equal(fresh.over, null);
    assert.equal(fresh.started, false);
  });

  test('after a fight lost, once a day and for its gold, the Labirynt starts again from the first level; the day\'s rewards stay', async () => {
    const price = resetPrice(60, content);
    const reset = () => call('POST', '/api/labyrinth/reset', { cookie, body: {} });
    // Not before a fight is lost.
    await set('labyrinth = ?, gold = ?', JSON.stringify(stateOf({ row: 0, room: 0, path: [0] })), price * 3);
    assert.equal((await get()).reset, null);
    assert.equal((await reset()).data.error.code, 'no_reset');
    // Not without the gold.
    const lost = stateOf({ level: 3, row: 2, room: 1, path: [0, 1, 1], cleared: 2, over: 'fainted', hp: { me: 0 }, blessings: ['might'], gains: { xp: 10, gold: 20, shards: 3, artifacts: 1 } });
    await set('labyrinth = ?, gold = ?', JSON.stringify(lost), price - 1);
    assert.deepEqual((await get()).reset, { price, left: 1 });
    assert.equal((await reset()).data.error.code, 'no_gold');
    // Paid: the first level again, at full HP and without blessings.
    await set('gold = ?', price * 2);
    const again = (await reset()).data;
    assert.equal(again.character.gold, price);
    assert.equal(again.labyrinth.over, null);
    assert.equal(again.labyrinth.level, 1);
    assert.equal(again.labyrinth.row, -1);
    assert.equal(again.labyrinth.reset, null);
    assert.deepEqual(again.labyrinth.blessings, []);
    assert.deepEqual(again.labyrinth.gains, lost.gains);
    assert.equal(again.labyrinth.fighters[0].hp, again.labyrinth.fighters[0].maxHp);
    const saved = await kept();
    assert.equal(saved.resets, 1);
    assert.equal(saved.cleared, 0);
    assert.notEqual(saved.seed, lost.seed);
    // Lost again the same day: no second try.
    await set('labyrinth = ?', JSON.stringify({ ...saved, over: 'fainted' }));
    assert.deepEqual((await get()).reset, { price, left: 0 });
    assert.equal((await reset()).data.error.code, 'no_reset');
    assert.equal((await call('GET', '/api/character', { cookie })).data.character.gold, price);
  });

  test('a spring heals every fighter by its share of the max HP', async () => {
    const spot = findRoom('spring');
    await standBefore(spot, { hp: { me: 0.2 } });
    const healed = await enter({ level: spot.level, row: spot.row, room: spot.room });
    assert.equal(healed.status, 200, JSON.stringify(healed.data).slice(0, 300));
    assert.equal(healed.data.room.type, 'spring');
    assert.equal((await kept()).hp.me, Math.round((0.2 + content.labyrinth.spring.heal) * 10000) / 10000);
  });

  test('the guardian: an Artefakt into the Skrytka, the Rdzeń open, a choice of three blessings, then the next level', async () => {
    await makeClimber(await db(), (await (await db()).prepare('SELECT id FROM characters').first()).id);
    const last = content.labyrinth.map.rows;
    const map = labyrinthMap(today(), 1, content);
    await set('labyrinth = ?', JSON.stringify(stateOf({ row: last - 1, room: 0, path: Array(last).fill(0), charLevel: 30 })));
    let won = null;
    for (let i = 0; i < 4 && !won?.room.won; i++) {
      won = (await enter({ level: 1, row: last, room: 0 })).data;
      if (!won.room?.won) await set('labyrinth = ?', JSON.stringify(stateOf({ row: last - 1, room: 0, path: Array(last).fill(0), charLevel: 30 })));
    }
    assert.ok(map.rows[last][0].type === 'guardian');
    assert.equal(won.room.won, true, 'the guardian is beaten');
    assert.equal(won.room.type, 'guardian');
    assert.ok(won.room.artifact.name.includes('Artefakt'));
    assert.ok(won.report.system.some((line) => line.includes('Rdzeń się otwiera')));
    assert.equal(won.labyrinth.level, 2);
    assert.equal(won.labyrinth.row, -1);
    assert.equal(won.labyrinth.levels[0].cleared, true);
    assert.equal(won.labyrinth.pending.kind, 'blessing');
    assert.equal(won.labyrinth.pending.choices.length, 3);
    assert.equal((await coreRow()).open, true);
    assert.ok(won.character.features.includes('core'));
    const rows = await (await db()).prepare('SELECT data FROM core_artifacts').all();
    assert.equal(rows.results.length, 1);
    // No room before the choice; then the blessing is the day's.
    assert.equal((await enter({ level: 2, row: 0, room: 0 })).data.error.code, 'choice_waiting');
    assert.equal((await call('POST', '/api/labyrinth/blessing', { cookie, body: { id: 'none' } })).data.error.code, 'no_blessing');
    const choice = won.labyrinth.pending.choices[1].id;
    const chosen = (await call('POST', '/api/labyrinth/blessing', { cookie, body: { id: choice } })).data.labyrinth;
    assert.equal(chosen.pending, null);
    assert.deepEqual(chosen.blessings.map((one) => one.id), [choice]);
  });

  test('the third guardian opens Piekielny, its creatures twice as strong; its guardian ends the day', async () => {
    await makeClimber(await db(), (await (await db()).prepare('SELECT id FROM characters').first()).id);
    const last = content.labyrinth.map.rows;
    const place = (level) => set('labyrinth = ?', JSON.stringify(stateOf({ level, cleared: level - 1, row: last - 1, room: 0, path: Array(last).fill(0), charLevel: 30 })));
    let won = null;
    for (let i = 0; i < 6 && !won?.room.won; i++) {
      await place(3);
      won = (await enter({ level: 3, row: last, room: 0 })).data;
    }
    assert.equal(won.room.won, true);
    assert.equal(won.labyrinth.level, 4);
    assert.ok(won.labyrinth.levels[3].hell && won.labyrinth.levels[3].open);
    assert.ok(won.report.system.some((line) => line.includes('Piekielny')));
    // Piekielny's guardian beaten: the day is done.
    await set('level = 200');
    let hell = null;
    for (let i = 0; i < 8 && !hell?.room.won; i++) {
      await place(4);
      hell = (await enter({ level: 4, row: last, room: 0 })).data;
    }
    if (hell.room.won) {
      assert.equal(hell.labyrinth.over, 'done');
      assert.equal(hell.labyrinth.pending, null);
    }
  });

  test('an altar offers three blessings; the merchant sells its healing and a choice for gold, once each', async () => {
    const altar = findRoom('altar');
    if (altar) {
      await standBefore(altar);
      const at = (await enter({ level: altar.level, row: altar.row, room: altar.room })).data.labyrinth;
      assert.equal(at.pending.kind, 'blessing');
      assert.equal(at.pending.from, 'altar');
      assert.equal(at.pending.choices.length, 3);
    }
    const merchant = findRoom('merchant');
    if (!merchant) return;
    await standBefore(merchant, { hp: { me: 0.3 } });
    await set('gold = 0');
    const shop = (await enter({ level: merchant.level, row: merchant.row, room: merchant.room })).data.labyrinth;
    assert.equal(shop.pending.kind, 'merchant');
    const { heal, blessing } = shop.pending.prices;
    assert.equal((await call('POST', '/api/labyrinth/merchant', { cookie, body: { buy: 'heal' } })).data.error.code, 'no_gold');
    await set('gold = ?', heal + blessing);
    const healed = (await call('POST', '/api/labyrinth/merchant', { cookie, body: { buy: 'heal' } })).data;
    assert.equal(healed.character.gold, blessing);
    assert.equal((await kept()).hp.me, Math.round((0.3 + content.labyrinth.merchant.heal) * 10000) / 10000);
    assert.equal((await call('POST', '/api/labyrinth/merchant', { cookie, body: { buy: 'heal' } })).data.error.code, 'not_for_sale');
    const offered = (await call('POST', '/api/labyrinth/merchant', { cookie, body: { buy: 'blessing' } })).data;
    assert.equal(offered.character.gold, 0);
    assert.equal(offered.labyrinth.pending.choices.length, 3);
    const chosen = (await call('POST', '/api/labyrinth/blessing', { cookie, body: { id: offered.labyrinth.pending.choices[0].id } })).data.labyrinth;
    assert.equal(chosen.pending.kind, 'merchant');
    assert.equal(chosen.blessings.length, 1);
    const left = (await call('POST', '/api/labyrinth/merchant', { cookie, body: { leave: true } })).data.labyrinth;
    assert.equal(left.pending, null);
  });

  test('the Labirynt goes on during an exploration, not while serving as a mercenary', async () => {
    const id = (await (await db()).prepare('SELECT id FROM characters').first()).id;
    await (await db())
      .prepare("INSERT INTO activities (character_id, kind, region_id, minutes, started_at, ends_at, seed, hp_at_start, options) VALUES (?, 'hunt', 'windfalls-edge', 60, ?, ?, 'x', 100, '{}')")
      .bind(id, Date.now(), Date.now() + 3600000)
      .run();
    assert.equal((await enter({ level: 1, row: 0, room: 0 })).status, 200);
  });

  // The code review, 13.11.2026: a new level won in the Labirynt during an
  // exploration heals nothing (the exploration's report settles the HP), so
  // its report says nothing of a heal either, as a party event's does.
  test('a new level during an exploration: its XP at once, no heal and no words of one', async () => {
    const database = await db();
    const id = (await database.prepare('SELECT id FROM characters').first()).id;
    await makeClimber(database, id);
    await set('level = 60, class_level = 60, xp = ?', xpToNext(60, content) - 1);
    await database
      .prepare("INSERT INTO activities (character_id, kind, region_id, minutes, started_at, ends_at, seed, hp_at_start, options) VALUES (?, 'hunt', 'windfalls-edge', 60, ?, ?, 'x', 100, '{}')")
      .bind(id, Date.now(), Date.now() + 3600000)
      .run();
    const heals = new Set([...content.texts.levelHeal, ...content.texts.levelHealFemale]);
    const away = await enter({ level: 1, row: 0, room: 0 });
    assert.equal(away.status, 200, JSON.stringify(away.data).slice(0, 400));
    assert.equal(away.data.room.won, true);
    assert.equal(away.data.character.level, 61);
    assert.ok(!away.data.report.system.some((line) => heals.has(line)), away.data.report.system.join(' | '));
    // At home the same new level heals, and says so.
    await database.prepare('DELETE FROM activities').run();
    await set(`labyrinth = '{}', level = 60, xp = ?`, xpToNext(60, content) - 1);
    const home = await enter({ level: 1, row: 0, room: 0 });
    assert.equal(home.data.room.won, true);
    assert.ok(home.data.report.system.some((line) => heals.has(line)), home.data.report.system.join(' | '));
  });
});

describe('the Rdzeń through the API', () => {
  const { call, db, signUp } = useServer({ LABYRINTH: 'on' });
  let cookie;
  let characterId;
  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const coreRow = async () => JSON.parse((await (await db()).prepare('SELECT core FROM characters').first()).core);
  const store = async (artifact) =>
    (await (await db()).prepare('INSERT INTO core_artifacts (character_id, data, created_at) VALUES (?, ?, 0)').bind(characterId, JSON.stringify(artifact)).run()).meta.last_row_id;
  const post = (path, body) => call('POST', path, { cookie, body });
  const medium = { element: 'fire', size: 'medium', rarity: 'rare', traits: ['damage', 'main-stat'], ability: null, upgrade: 0, spent: 0 };
  const large = { element: 'earth', size: 'large', rarity: 'unique', traits: ['armor', 'endurance'], ability: 'shield', upgrade: 0, spent: 0 };

  beforeEach(async () => {
    ({ cookie } = await signUp('rdzen'));
    await call('POST', '/api/character', { cookie, body: { name: 'Rdzenny', classId: 'warrior', appearance: 'male' } });
    characterId = (await (await db()).prepare('SELECT id FROM characters').first()).id;
    await set('level = 40, class_level = 40');
  });

  test('shut until the first guardian is beaten; open, it shows its sockets (floor of level / 10, at least 3), the Skrytka and the Odłamki', async () => {
    const shut = await call('GET', '/api/core', { cookie });
    assert.equal(shut.status, 403);
    assert.equal(shut.data.error.code, 'locked');
    assert.ok(!(await call('GET', '/api/character', { cookie })).data.character.features.includes('core'));
    await set(`core = '{"open":true,"shards":7}'`);
    await store(medium);
    const { core } = (await call('GET', '/api/core', { cookie })).data;
    assert.equal(core.sockets, 4);
    assert.equal(core.free, 4);
    assert.equal(core.shards, 7);
    assert.equal(core.stored.length, 1);
    assert.equal(core.stored[0].name, 'Średni Artefakt ognia');
    assert.equal(core.stored[0].sockets, 2);
    await set('level = 20');
    assert.equal((await call('GET', '/api/core', { cookie })).data.core.sockets, 3);
  });

  test('Wchłoń takes free sockets and raises the stats; Ulepsz costs growing Odłamki; Rozpuść gives back half of them; Rozbij gives Odłamki by rarity and size', async () => {
    await set(`core = '{"open":true,"shards":100}'`);
    const first = await store(medium);
    const second = await store(large);
    const before = (await call('GET', '/api/character', { cookie })).data.character;
    const absorbed = await post('/api/core/absorb', { id: first });
    assert.equal(absorbed.status, 200, JSON.stringify(absorbed.data).slice(0, 300));
    assert.equal(absorbed.data.core.free, 2);
    assert.equal(absorbed.data.core.absorbed[0].id, first);
    const strength = (view) => view.stats.find((stat) => stat.id === 'strength');
    assert.ok(strength(absorbed.data.character).sources.core > 0);
    assert.ok(strength(absorbed.data.character).total > strength(before).total);
    // Three sockets for the large one: only two are free.
    assert.equal((await post('/api/core/absorb', { id: second })).data.error.code, 'no_sockets');
    // Upgrades: each level its cost (×2 for a medium one).
    const cost = artifactUpgradeCost(medium, content);
    const upgraded = (await post('/api/core/upgrade', { id: first })).data.core;
    assert.equal(upgraded.shards, 100 - cost);
    assert.equal(upgraded.absorbed[0].upgrade, 1);
    const again = (await post('/api/core/upgrade', { id: first })).data.core;
    const spent = cost + artifactUpgradeCost({ ...medium, upgrade: 1 }, content);
    assert.equal(again.shards, 100 - spent);
    // Rozpuść: gone, the sockets free, half of the Odłamki back.
    const dissolved = (await post('/api/core/dissolve', { id: first })).data.core;
    assert.equal(dissolved.absorbed.length, 0);
    assert.equal(dissolved.free, 4);
    assert.equal(dissolved.shards, 100 - spent + Math.floor(spent / 2));
    // Rozbij: the stored large unique one.
    const broken = (await post('/api/core/break', { id: second })).data.core;
    assert.equal(broken.stored.length, 0);
    assert.equal(broken.shards, dissolved.shards + breakShards(large, content));
    assert.equal((await post('/api/core/break', { id: second })).data.error.code, 'artifact_not_found');
  });

  test('the Rdzeń waits for the character back from an exploration; the Skrytka does not', async () => {
    await set(`core = '{"open":true,"shards":20}'`);
    const id = await store(medium);
    await (await db())
      .prepare("INSERT INTO activities (character_id, kind, region_id, minutes, started_at, ends_at, seed, hp_at_start, options) VALUES (?, 'hunt', 'windfalls-edge', 60, ?, ?, 'x', 100, '{}')")
      .bind(characterId, Date.now(), Date.now() + 3600000)
      .run();
    assert.equal((await post('/api/core/absorb', { id })).data.error.code, 'busy');
    assert.equal((await post('/api/core/upgrade', { id })).status, 200);
  });

  test('a gem set in the Rdzeń in the Szlifiernia raises the numbers of its Artefakty (863 A)', async () => {
    await set(`level = 40, core = '{"open":true}', minerals = '{"quartz":1}'`);
    const id = await store({ ...medium, rarity: 'divine', upgrade: 10 });
    await post('/api/core/absorb', { id });
    const plain = (await call('GET', '/api/core', { cookie })).data.core.absorbed[0].traits[0].text;
    const started = await call('POST', '/api/professions/jewel', { cookie, body: { set: true, itemId: 'core', gem: 'quartz' } });
    assert.equal(started.status, 201, JSON.stringify(started.data).slice(0, 300));
    assert.deepEqual(started.data.character.activity.set, { gem: 'Kwarc', item: 'Rdzeń' });
    await (await db()).prepare('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ?').bind(3600000, 3600000).run();
    const claimed = (await call('POST', '/api/hunts/claim', { cookie })).data;
    assert.equal(claimed.report.set.text, 'Kwarc tkwi teraz w przedmiocie: Rdzeń.');
    assert.equal((await coreRow()).gem, 'quartz');
    const core = (await call('GET', '/api/core', { cookie })).data.core;
    assert.equal(core.gem.id, 'quartz');
    assert.notEqual(core.absorbed[0].traits[0].text, plain);
    assert.equal((await call('POST', '/api/professions/jewel', { cookie, body: { set: true, itemId: 'core', gem: 'quartz' } })).data.error.code, 'same_gem');
    // A weaker gem never takes the place of a stronger one (the author, 13.11.2026).
    await set(`core = json_set(core, '$.gem', 'agate'), minerals = '{"quartz":1}'`);
    const weaker = await call('POST', '/api/professions/jewel', { cookie, body: { set: true, itemId: 'core', gem: 'quartz' } });
    assert.equal(weaker.data.error.code, 'weaker_gem');
    assert.equal(weaker.data.error.message, 'W Rdzeniu tkwi Agat. Oprawisz w nim tylko mocniejszy kamień.');
  });

  test('the Artefakty work in the character\'s fights, never in a companion\'s', () => {
    const character = { classId: 'warrior', level: 40, xp: 0, classLevel: 40, classXp: 0, points: {}, position: 'front' };
    const plain = playerCombatant({ character, equipped: [], name: 'A' }, content);
    const cored = playerCombatant({ character: { ...character, core: { absorbed: [large, medium], gem: null } }, equipped: [], name: 'A' }, content);
    assert.ok(cored.armor > plain.armor);
    assert.ok(cored.damageBonus > 0);
    assert.ok(cored.openingShield > 0);
    assert.ok(coreEffects({ absorbed: [medium] }, 'warrior', content).stats.strength > 0);
    void makeArtifact;
    void createRng;
  });
});

describe('the Labirynt and the Rdzeń where LABYRINTH is off', () => {
  const { call, signUp, db } = useServer();
  test('no routes, no unlock, no Rdzeń', async () => {
    const { cookie } = await signUp('bezlabiryntu');
    await call('POST', '/api/character', { cookie, body: { name: 'Bez', classId: 'warrior', appearance: 'male' } });
    await (await db()).prepare(`UPDATE characters SET level = 60, core = '{"open":true}'`).run();
    assert.equal((await call('GET', '/api/labyrinth', { cookie })).status, 404);
    assert.equal((await call('POST', '/api/labyrinth/room', { cookie, body: { level: 1, row: 0, room: 0 } })).status, 404);
    assert.equal((await call('GET', '/api/core', { cookie })).status, 404);
    const { content: page } = { content: (await call('GET', '/api/content')).data };
    assert.ok(!page.unlocks.some((unlock) => unlock.id === 'labyrinth'));
    const character = (await call('GET', '/api/character', { cookie })).data.character;
    assert.ok(!character.features.includes('labyrinth'));
    assert.ok(!character.features.includes('core'));
    assert.equal(character.core, null);
  });
});

describe('the Wieże\'s champions and the Rdzeń', () => {
  const { call, db, signUp } = useServer({ LABYRINTH: 'on' });

  test('the first win of a champion\'s floor brings an Artefakt into the Skrytka (864 A); a second win of it none', async () => {
    const { cookie } = await signUp('czempion');
    await call('POST', '/api/character', { cookie, body: { name: 'Czempion', classId: 'warrior', appearance: 'female' } });
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    await makeClimber(database, id);
    const champion = content.towers.floors.championEvery;
    await database.prepare('UPDATE characters SET towers = ? WHERE id = ?').bind(JSON.stringify({ best: { solo: champion - 1 } }), id).run();
    let report = null;
    for (let i = 0; i < 5 && !report?.tower.won; i++) report = (await call('POST', '/api/towers/enter', { cookie, body: { tower: 'solo', floor: champion } })).data.report;
    assert.equal(report.tower.won, true, 'the floor is won');
    assert.ok(report.tower.artifact.name.includes('Artefakt'));
    assert.ok(report.system.some((line) => line.includes('Czempion Wieży zostawia Artefakt')));
    const rows = await database.prepare('SELECT data FROM core_artifacts WHERE character_id = ?').bind(id).all();
    assert.equal(rows.results.length, 1);
    const artifact = JSON.parse(rows.results[0].data);
    assert.ok(Object.keys(content.labyrinth.levels.find((level) => level.id === content.labyrinth.core.tower.level).artifact).includes(artifact.rarity));
  });
});

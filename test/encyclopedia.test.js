// The Encyklopedia: what a character holds written down, its tabs, tiers
// and sets, the chests of sets and counts, the trophies of materials and
// their blows in fights, and through the API the record kept with every
// request, the chests opened once and the trophies taken on explorations.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  createRng,
  encyclopediaChest,
  encyclopediaView,
  heldDiscoveries,
  itemSets,
  mergeDiscoveries,
  monsterCombatant,
  playerCombatant,
  readyChests,
  simulateFight,
  trophyBonuses,
  trophyGrades,
} from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

describe('the Encyklopedia in the engine', () => {
  test('what a character holds becomes keys: each base with its best rarity, potions, herbs, grades of materials and parts', () => {
    const held = heldDiscoveries(
      {
        items: [
          { base: 'sword', rarity: 'common' },
          { base: 'sword', rarity: 'epic' },
          { base: 'no-such-base', rarity: 'rare' },
        ],
        potions: { 'lesser-healing': 2, 'no-such-potion': 1, mana: 0 },
        herbs: { comfrey: 5 },
        materials: { 'wolf-pelt:rare': 3, 'constructor:common': 1, 'fox-pelt:common': 0 },
        parts: { scraps: 4 },
      },
      content,
    );
    assert.deepEqual(held, { 'item:sword': 4, 'potion:lesser-healing': 1, 'herb:comfrey': 1, 'material:wolf-pelt:rare': 1, 'part:scraps': 1 });
    assert.equal(mergeDiscoveries(held, { 'item:sword': 2, 'herb:comfrey': 1 }), null);
    assert.deepEqual(mergeDiscoveries({ 'item:sword': 2, 'herb:comfrey': 1 }, held), held);
  });

  test('items come in four tiers by the class level they are worn from, each with a set for every class and one with the accessories', () => {
    const sets = itemSets(content);
    assert.equal(sets.length, 24);
    assert.deepEqual(
      sets.filter((set) => set.tier === 0).map((set) => [set.name, set.bases.length]),
      [
        ['Wojownik', 5],
        ['Łucznik', 4],
        ['Mag', 4],
        ['Kleryk', 5],
        ['Cień', 4],
        ['Dodatki', 5],
      ],
    );
    assert.deepEqual(sets.find((set) => set.id === 'items:2:warrior').bases.slice(0, 3), ['broadsword', 'war-axe', 'pavise']);
    const covered = new Set(sets.flatMap((set) => set.bases));
    assert.equal(covered.size, content.bases.length);
  });

  test('a full set opens the chest of its tier, a count of discoveries its own chest in turn, each once', () => {
    const warrior = itemSets(content).find((set) => set.id === 'items:1:warrior');
    const discovered = Object.fromEntries(warrior.bases.map((id) => [`item:${id}`, 1]));
    assert.deepEqual(encyclopediaChest('items:1:warrior', discovered, [], content).chest, content.encyclopedia.chests[0]);
    assert.equal(encyclopediaChest('items:1:warrior', {}, [], content).code, 'not_ready');
    assert.equal(encyclopediaChest('items:1:warrior', discovered, ['items:1:warrior'], content).code, 'opened');
    assert.equal(encyclopediaChest('nothing', discovered, [], content).code, 'no_chest');
    const parts = { 'part:scraps': 1, 'part:straps': 1, 'part:fittings': 1 };
    assert.deepEqual(encyclopediaChest('parts:3', parts, [], content).chest, content.encyclopedia.chests[0]);
    assert.equal(encyclopediaChest('parts:5', parts, [], content).code, 'not_ready');
    assert.equal(readyChests({ ...discovered, ...parts }, [], content), 2);
    assert.equal(readyChests({ ...discovered, ...parts }, ['parts:3'], content), 1);
  });

  test('a trophy asks for a material in its species\' grade and the two above, and gives blows against its creature 5% more', () => {
    assert.deepEqual(trophyGrades('wolf-pelt', content), ['common', 'rare', 'unique']);
    const divine = content.materials.find((material) => material.rarity === 'divine');
    assert.deepEqual(trophyGrades(divine.id, content), ['divine']);
    const two = { 'material:wolf-pelt:common': 1, 'material:wolf-pelt:rare': 1 };
    assert.deepEqual(trophyBonuses(two, content), {});
    const all = { ...two, 'material:wolf-pelt:unique': 1 };
    assert.deepEqual(trophyBonuses(all, content), { wolf: 0.05 });
    assert.deepEqual(trophyBonuses(all, content, ['fox']), {});
  });

  test('a blow against the creature of a trophy hits harder', () => {
    const area = content.areasById['windfalls-edge'];
    const first = (trophies) => {
      const ally = { ...playerCombatant({ character: newCharacter('warrior', { level: 5 }), equipped: [], hp: 500, name: 'Mira', area }, content), ...(trophies && { trophies }) };
      const enemy = monsterCombatant({ monsterId: 'wolf', level: 3, id: 'e0' }, content);
      const fight = simulateFight({ allies: [ally], enemies: [enemy], rng: createRng('trofeum'), content, record: true });
      return fight.events.find((event) => (event.kind === 'hit' || event.kind === 'crit') && event.actor === ally.id);
    };
    const plain = first(null);
    const stronger = first({ wolf: 1 });
    assert.ok(plain && stronger, 'the warrior strikes');
    assert.ok(Math.abs(stronger.damage - 2 * plain.damage) <= 1, `${plain.damage} → ${stronger.damage}`);
  });

  test('the tier a character is in is marked on each tab: items by class level, potions and herbs by profession level, materials by level', () => {
    const levels = { level: 30, classLevel: 10, professions: { alchemy: { level: 60, xp: 0 }, herbalism: { level: 30, xp: 0 } } };
    const view = encyclopediaView({ discovered: {}, claimed: [], met: [], levels }, content);
    const currentOf = (tiers) => tiers.filter((tier) => tier.current).map((tier) => tier.index);
    assert.deepEqual(currentOf(view.items.tiers), [1]);
    assert.deepEqual(currentOf(view.potions.tiers), [2]);
    assert.deepEqual(currentOf(view.herbs.tiers), [1]);
    assert.deepEqual(currentOf(view.materials.tiers), [1]);
    assert.deepEqual(currentOf(encyclopediaView({ discovered: {}, claimed: [], met: [], levels: { level: 1, classLevel: 1, professions: {} } }, content).potions.tiers), [0]);
    assert.deepEqual(currentOf(encyclopediaView({ discovered: {}, claimed: [], met: [] }, content).items.tiers), []);
  });

  test('the tabs show what is got by name, the rest as "???" with where to get it, a creature unmet as "???" too', () => {
    const view = encyclopediaView({ discovered: { 'item:sword': 3, 'material:wolf-pelt:common': 1 }, claimed: [], met: [] }, content);
    assert.deepEqual([view.items.found, view.items.all], [1, content.bases.length]);
    const sword = view.items.tiers[0].entries.find((entry) => entry.id === 'sword');
    assert.equal(sword.name, 'Miecz');
    assert.ok(sword.sources.includes('Najlepszy zdobyty: unikalny.'));
    const broadsword = view.items.tiers[1].entries.find((entry) => entry.id === 'broadsword');
    assert.equal(broadsword.name, '???');
    assert.ok(broadsword.sources[0].startsWith('Wyprawy: wypada od regionu'));
    const pelt = view.materials.tiers[0].entries.find((entry) => entry.id === 'wolf-pelt');
    assert.equal(pelt.name, 'Skóra wilka');
    assert.match(pelt.sources[0], /^Zostawia: \?\?\? \(/);
    assert.match(encyclopediaView({ discovered: {}, claimed: [], met: ['wolf'] }, content).materials.tiers[0].entries.find((entry) => entry.id === 'wolf-pelt').sources[0], /^Zostawia: Wilk/);
    const potion = view.potions.tiers[0].entries[0];
    assert.deepEqual([potion.name, potion.description, potion.sources.length], ['???', null, 1]);
  });
});

describe('the Encyklopedia through the API', () => {
  const { call, db, signUp } = useServer();
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('kronikarz'));
    await call('POST', '/api/character', { cookie, body: { name: 'Kronikarz', classId: 'warrior', appearance: 'male' } });
    await (await db()).prepare('UPDATE characters SET level = 10').run();
  });

  const set = async (sql) => (await db()).prepare(`UPDATE characters SET ${sql}`).run();
  const read = async () => (await call('GET', '/api/encyclopedia', { cookie })).data.encyclopedia;
  const record = async () => JSON.parse((await (await db()).prepare('SELECT discovered FROM characters').first()).discovered);

  test('what the character holds is written down with any request and stays when it is gone', async () => {
    await set(`potions = '{"lesser-healing":2}', herbs = '{"comfrey":3}', materials = '{"wolf-pelt:common":2}', parts = '{"scraps":1}'`);
    await (await db())
      .prepare("INSERT INTO items (character_id, slot, data, created_at) SELECT id, NULL, ?, 0 FROM characters")
      .bind(JSON.stringify({ base: 'axe', slot: 'weapon', level: 3, rarity: 'rare', affixes: [], damage: { min: 3, max: 5 } }))
      .run();
    await call('GET', '/api/character', { cookie });
    assert.deepEqual(await record(), { 'item:axe': 2, 'potion:lesser-healing': 1, 'herb:comfrey': 1, 'material:wolf-pelt:common': 1, 'part:scraps': 1 });
    await set(`potions = '{}', herbs = '{}', materials = '{}', parts = '{}'`);
    await (await db()).prepare('DELETE FROM items').run();
    await set('class_level = 10');
    const book = await read();
    assert.equal(book.items.tiers.find((tier) => tier.current).index, 1, 'class level 10 is in Tier II');
    assert.equal(book.potions.found, 1);
    assert.equal(book.items.tiers[0].entries.find((entry) => entry.id === 'axe').name, 'Topór');
    assert.equal(book.materials.found, 1);
  });

  test('a chest opens once, when its list is full, with gold, Punkty Czasu and Punkty Systemu', async () => {
    await set(`gold = 0, time_points = 0, system_points = 0, parts = '{"scraps":1,"straps":1}'`);
    const shut = await call('POST', '/api/encyclopedia/chest', { cookie, body: { id: 'parts:3' } });
    assert.equal(shut.status, 409);
    assert.equal(shut.data.error.code, 'not_ready');
    await set(`parts = '{"scraps":1,"straps":1,"fittings":1}'`);
    assert.equal((await call('GET', '/api/character', { cookie })).data.character.encyclopedia.ready, 1);
    const opened = await call('POST', '/api/encyclopedia/chest', { cookie, body: { id: 'parts:3' } });
    assert.equal(opened.status, 200, JSON.stringify(opened.data));
    assert.deepEqual(opened.data.chest, { gold: 50, timePoints: 5, systemPoints: 2 });
    assert.equal(opened.data.character.gold, 50);
    assert.equal((await (await db()).prepare('SELECT system_points FROM characters').first()).system_points, 2);
    assert.equal(opened.data.character.encyclopedia.ready, 0);
    assert.equal(opened.data.encyclopedia.parts.chests[0].opened, true);
    assert.equal((await call('POST', '/api/encyclopedia/chest', { cookie, body: { id: 'parts:3' } })).data.error.code, 'opened');
    assert.equal((await call('POST', '/api/encyclopedia/chest', { cookie, body: { id: 'nic' } })).status, 404);
  });

  test('an exploration takes the trophies of its creatures along', async () => {
    await set(`discovered = '{"material:wolf-pelt:common":1,"material:wolf-pelt:rare":1,"material:wolf-pelt:unique":1,"material:bear-hide:common":1}'`);
    const started = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    assert.equal(started.status, 201, JSON.stringify(started.data));
    const { options } = await (await db()).prepare('SELECT options FROM activities').first();
    assert.deepEqual(JSON.parse(options).trophies, { wolf: 0.05 });
  });
});

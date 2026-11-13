// The Zaklinaczka's zaklęcie żywiołu (the Osada, part III, question 101 A):
// a weapon turns a share of its blows into an element, a body armour gets
// the element's resistance, for gold and the element's material.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { computeStats, createRng, generateItem, imbueBlock, imbueCost, imbueEffect, itemProperties, monsterCombatant, playerCombatant, simulateFight } from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const tuning = content.settlement.imbue;
const sword = generateItem({ baseId: 'sword', level: 20, rarity: 'rare' }, createRng('miecz'), content);
const chainmail = generateItem({ baseId: 'chainmail', level: 20, rarity: 'rare' }, createRng('kolczuga'), content);

describe('the zaklęcie żywiołu in the engine', () => {
  test('every element comes from a material of the game', () => {
    for (const { element, material } of tuning.elements) {
      assert.ok(content.elementsById[element], element);
      assert.ok(content.materialsById[material], material);
    }
  });

  test('a weapon takes a share of its damage in the element, a body armour its resistance', () => {
    assert.deepEqual(imbueEffect(sword, 'fire', content), { element: 'fire', share: tuning.weaponShare });
    const armour = imbueEffect(chainmail, 'fire', content);
    assert.equal(armour.stat, 'resist.fire');
    assert.ok(armour.value > 0);
    const character = newCharacter('warrior', { level: 20 });
    const before = computeStats(character, [chainmail], content).bonuses.resist.fire ?? 0;
    const after = computeStats(character, [{ ...chainmail, imbue: armour }], content).bonuses.resist.fire ?? 0;
    assert.equal(after - before, armour.value);
    assert.ok(itemProperties({ ...sword, imbue: imbueEffect(sword, 'fire', content) }, content).some((line) => line.includes('ogień')));
  });

  test('blows of an imbued weapon hit a creature weak to the element harder', () => {
    const blows = (weapon) => {
      const character = newCharacter('warrior', { level: 20, classLevel: 20 });
      const ally = playerCombatant({ character, equipped: [weapon], hp: 5000, name: 'Mira' }, content);
      const enemy = { ...monsterCombatant({ monsterId: 'peatling', level: 20, id: 'e0' }, content), maxHp: 100000, hp: 100000 };
      const fight = simulateFight({ allies: [ally], enemies: [enemy], rng: createRng('ogien'), content, record: true });
      return fight.events.filter((event) => (event.kind === 'hit' || event.kind === 'crit') && event.actor === ally.id).slice(0, 5).map((event) => event.damage);
    };
    const plain = blows(sword);
    const fiery = blows({ ...sword, imbue: imbueEffect(sword, 'fire', content) });
    assert.ok(plain.length === 5 && fiery.length === 5);
    for (let i = 0; i < 5; i++) assert.ok(fiery[i] > plain[i], `${plain[i]} → ${fiery[i]}`);
  });

  // 914: each blow of an imbued weapon names the part its element made,
  // for the number over the target and „w tym N od ognia” in the log.
  test('a blow of an imbued weapon names the part its element made', () => {
    const character = newCharacter('warrior', { level: 20, classLevel: 20 });
    const fight = (weapon) => {
      const ally = playerCombatant({ character, equipped: [weapon], hp: 5000, name: 'Mira' }, content);
      const enemy = { ...monsterCombatant({ monsterId: 'peatling', level: 20, id: 'e0' }, content), maxHp: 100000, hp: 100000 };
      return simulateFight({ allies: [ally], enemies: [enemy], rng: createRng('ogien'), content, record: true }).events.filter((event) => (event.kind === 'hit' || event.kind === 'crit') && event.actor === ally.id);
    };
    assert.ok(fight(sword).every((event) => event.imbued === undefined));
    const share = tuning.weaponShare;
    const blows = fight({ ...sword, imbue: imbueEffect(sword, 'fire', content) }).slice(0, 5);
    assert.equal(blows.length, 5);
    for (const event of blows) {
      assert.equal(event.imbued.element, 'fire');
      assert.ok(event.imbued.damage > 0 && event.imbued.damage < event.damage, JSON.stringify(event.imbued));
      // A creature weak to fire takes more from it than its plain share.
      assert.ok(event.imbued.damage >= Math.round(event.damage * share), `${event.imbued.damage} of ${event.damage}`);
    }
  });

  test('it asks for gold and three pieces of the material, and not twice the same element', () => {
    const cost = imbueCost(sword, 'fire', content);
    assert.equal(cost.count, tuning.materialCount);
    const enough = { gold: cost.gold, materials: { [cost.stack]: cost.count } };
    assert.equal(imbueBlock(sword, 'fire', enough, content), null);
    assert.equal(imbueBlock(sword, 'fire', { ...enough, gold: cost.gold - 1 }, content).code, 'not_enough_gold');
    assert.equal(imbueBlock(sword, 'fire', { ...enough, materials: {} }, content).code, 'not_enough_materials');
    assert.equal(imbueBlock({ ...sword, imbue: { element: 'fire' } }, 'fire', enough, content).code, 'same_element');
    assert.equal(imbueBlock(sword, 'frost', enough, content).code, 'invalid_element');
    const talisman = generateItem({ baseId: content.bases.find((base) => base.slot === 'talisman').id, level: 20 }, createRng('t'), content);
    assert.equal(imbueBlock(talisman, 'fire', enough, content).code, 'wrong_slot');
  });
});

describe('the zaklęcie żywiołu through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on', SETTLEMENT: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('zaklinanie'));
    await call('POST', '/api/character', { cookie, body: { name: 'Zaklinacz', classId: 'warrior', appearance: 'male' } });
    await (await db()).prepare('UPDATE characters SET level = 25, class_level = 25, gold = 100000').run();
  });

  test('the Zaklinaczka puts fire on a sword for gold and Iskra ognika', async () => {
    const database = await db();
    const { meta } = await database.prepare('INSERT INTO items (character_id, slot, data, created_at) SELECT id, NULL, ?, 0 FROM characters').bind(JSON.stringify(sword)).run();
    const id = meta.last_row_id;
    const cost = imbueCost(sword, 'fire', content);
    assert.equal((await call('POST', '/api/settlement/imbue', { cookie, body: { itemId: id, element: 'fire' } })).data.error.code, 'not_enough_materials');
    await database.prepare('UPDATE characters SET materials = ?').bind(JSON.stringify({ [cost.stack]: cost.count + 1 })).run();
    const view = (await call('GET', '/api/settlement', { cookie })).data.settlement.imbue;
    assert.ok(view.items.some((item) => item.id === id && item.element === null));
    assert.equal(view.elements.find((one) => one.element === 'fire').have, cost.count + 1);
    const imbued = await call('POST', '/api/settlement/imbue', { cookie, body: { itemId: id, element: 'fire' } });
    assert.equal(imbued.status, 200);
    assert.equal(imbued.data.character.gold, 100000 - cost.gold);
    const row = await database.prepare('SELECT materials, settlement FROM characters').first();
    assert.equal(JSON.parse(row.materials)[cost.stack], 1);
    assert.equal(JSON.parse(row.settlement).relations[tuning.resident], tuning.relationGain);
    const item = JSON.parse((await database.prepare('SELECT data FROM items WHERE id = ?').bind(id).first()).data);
    assert.deepEqual(item.imbue, { element: 'fire', share: tuning.weaponShare });
    assert.equal((await call('POST', '/api/settlement/imbue', { cookie, body: { itemId: id, element: 'fire' } })).data.error.code, 'same_element');
  });
});

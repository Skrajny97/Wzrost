// The level lock of items beside the Tier (the author, 24.11.2026:
// „Pomijając Tier powinna być też blokada poziomem na ~30-50 w górę, by nie
// robić potencjału na smurfkonta i postaci, założone już za wysokie
// przedmioty będą zdjęte wtedy”; balance.items.levelLock, items.js): the
// allowance by level, the higher of the character's level and its class
// level counting, "Załóż" refusing an item above it with the level it needs,
// an item worn above it taken off at the next look (not on an exploration),
// and no fight counting such an item, also a defender's who has not come
// back since.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  arenaDuel,
  autoEquip,
  companionCombatant,
  companionWearBlock,
  computeStats,
  createRng,
  equipBlock,
  generateItem,
  itemLevelCap,
  itemView,
  levelAllowance,
  levelFits,
  playerCombatant,
  wearLevelFor,
  wearersOf,
} from '../src/engine/index.js';
import { playerOf } from '../tools/difficulty-sim.mjs';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const sword = (level, rarityId = 'rare') => generateItem({ baseId: 'sword', level, rarityId }, createRng(`miecz-${level}`), content);
const helmet = (level) => generateItem({ baseId: 'helmet', level, rarityId: 'rare' }, createRng(`hełm-${level}`), content);

describe('the level lock in the engine', () => {
  test('the allowance: 30 up to level 100, evenly to 50 at level 300 (40 at 200), 50 above', () => {
    assert.deepEqual(content.balance.items.levelLock.curve, [
      [100, 30],
      [300, 50],
    ]);
    const levels = [1, 50, 100, 101, 110, 150, 200, 250, 299, 300, 400, 500];
    assert.deepEqual(
      levels.map((level) => levelAllowance(level, content)),
      [30, 30, 30, 30, 31, 35, 40, 45, 49, 50, 50, 50],
    );
    assert.deepEqual(
      [1, 100, 200, 300, 450].map((level) => itemLevelCap(level, content)),
      [31, 130, 240, 350, 500],
    );
    // The level an item is worn from, as its card says it: the lowest at
    // which the lock lets it be worn.
    assert.deepEqual(
      [1, 31, 32, 81, 130, 131, 141, 240, 241, 350, 351, 400].map((level) => wearLevelFor(level, content)),
      [1, 1, 2, 51, 100, 101, 110, 200, 201, 300, 301, 350],
    );
    for (let itemLevel = 1; itemLevel <= 560; itemLevel++) {
      const from = wearLevelFor(itemLevel, content);
      assert.ok(levelFits({ level: itemLevel }, from, content), `${itemLevel}`);
      assert.ok(from === 1 || !levelFits({ level: itemLevel }, from - 1, content), `${itemLevel}`);
    }
    assert.equal(itemView(sword(31), content).wearLevel, null);
    assert.equal(itemView(sword(81), content).wearLevel, 51);
  });

  test('"Załóż" asks for the higher of the character level and the class level; the Tier first', () => {
    // Class level 50 ahead of level 20: 50 + 30.
    assert.equal(equipBlock(sword(80), 'warrior', 50, content, 20), null);
    assert.equal(equipBlock(sword(81), 'warrior', 50, content, 20), 'item_level');
    // Level 120 ahead of class level 60: 120 + 32.
    assert.equal(equipBlock(sword(152), 'warrior', 60, content, 120), null);
    assert.equal(equipBlock(sword(153), 'warrior', 60, content, 120), 'item_level');
    // A later Tier waits for its class level first.
    const saber = generateItem({ baseId: 'saber', level: 200 }, createRng('szabla'), content);
    assert.equal(equipBlock(saber, 'warrior', 20, content, 120), 'class_level');
    // The Targowisko's "Dla mnie" asks the same.
    assert.deepEqual(wearersOf(sword(81), { classId: 'warrior', classLevel: 50, level: 20 }, content), []);
    assert.deepEqual(wearersOf(sword(80), { classId: 'warrior', classLevel: 50, level: 20 }, content), ['me']);
  });

  test("a companion counts the higher of its level and its character's class level, as it wears its character's finds", () => {
    const companion = {
      id: 'c1',
      name: 'Bogna',
      appearance: 'female',
      classId: 'warrior',
      level: 20,
      xp: 0,
      traits: [],
      skills: content.skills.filter((skill) => skill.classId === 'warrior').map((skill) => skill.id).slice(0, 2),
      gear: [],
      relation: 0,
    };
    assert.equal(companionWearBlock(companion, sword(50), content), null);
    assert.deepEqual(companionWearBlock(companion, sword(51), content), { code: 'item_level', message: 'Ten przedmiot towarzysz założy od poziomu 21.' });
    assert.equal(companionWearBlock(companion, sword(80), content, 50), null);
    assert.equal(companionWearBlock(companion, sword(81), content, 50)?.code, 'item_level');
    assert.deepEqual(wearersOf(sword(80), { classId: 'warrior', classLevel: 50, level: 20, companions: [companion] }, content), ['me', 'c1']);
    // In a fight too: by its character's class level its sword counts.
    const armed = { ...companion, gear: [sword(80)] };
    assert.equal(companionCombatant(armed, { classLevel: 50 }, content).weapon.base, 'sword');
    assert.notEqual(companionCombatant(armed, { classLevel: 20 }, content).weapon.base, 'sword');
  });

  test('a find above the lock goes to the bag, not into an empty slot', () => {
    const finds = [sword(41), helmet(40)];
    assert.deepEqual(autoEquip([], finds, content, 'warrior', 10, 10), [1]);
    assert.deepEqual(autoEquip([], finds, content, 'warrior', 10, 11), [0, 1]);
  });

  test('no fight counts an item above the lock: neither its blows nor its numbers', () => {
    const character = newCharacter('warrior', { level: 10, classLevel: 10, points: { strength: 20, vitality: 10 } });
    const bare = playerCombatant({ character, equipped: [], name: 'Ala' }, content);
    const high = playerCombatant({ character, equipped: [sword(41), helmet(41)], name: 'Ala' }, content);
    assert.deepEqual(high, bare);
    assert.deepEqual(computeStats(character, [helmet(41)], content), computeStats(character, [], content));
    // One at the top of the lock counts.
    const armed = playerCombatant({ character, equipped: [sword(40), helmet(40)], name: 'Ala' }, content);
    assert.equal(armed.weapon.base, 'sword');
    assert.ok(armed.armor > bare.armor);
  });

  test("a duel of the Arena counts no item above the lock of a defender who has not come back since", () => {
    const attacker = { ...playerOf('realistic', 'warrior', 60, content), name: 'Ala' };
    const defender = { ...playerOf('realistic', 'mage', 60, content, 1), name: 'Bolek' };
    assert.ok(defender.equipped.length > 0);
    // The same gear, its levels far above the defender's.
    const geared = { ...defender, equipped: defender.equipped.map((item) => ({ ...item, level: 200 })) };
    const without = { ...defender, equipped: [] };
    const seed = 'blokada';
    assert.deepEqual(arenaDuel({ attacker, defender: geared, seed }, content), arenaDuel({ attacker, defender: without, seed }, content));
    assert.notDeepEqual(arenaDuel({ attacker, defender, seed }, content).fight.enemies[0], arenaDuel({ attacker, defender: without, seed }, content).fight.enemies[0]);
  });
});

describe('the level lock through the API', () => {
  const { call, db, signUp } = useServer();

  // A warrior named `name` at level 20 and class level 50 (the lock: up
  // to 80), with `items` ([item, slot or null]) put straight into its bag
  // or slots.
  async function warrior(name, items) {
    const { cookie } = await signUp(name.toLowerCase());
    await call('POST', '/api/character', { cookie, body: { name, classId: 'warrior', appearance: 'male' } });
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters WHERE name = ?').bind(name).first();
    await database.prepare('UPDATE characters SET level = 20, class_level = 50 WHERE id = ?').bind(id).run();
    await database.prepare('DELETE FROM items WHERE character_id = ?').bind(id).run();
    const ids = [];
    for (const [item, slot] of items) {
      ids.push((await database.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, ?, ?, 0)').bind(id, slot, JSON.stringify(item)).run()).meta.last_row_id);
    }
    return { cookie, database, id, ids };
  }

  test('"Załóż" refuses an item above the lock with the level it needs; the bag says why and gives it no verdict', async () => {
    const { cookie, ids } = await warrior('Rycerz', [
      [sword(81), null],
      [sword(80), null],
    ]);
    const [high, fit] = ids;
    const refused = await call('POST', `/api/items/${high}/equip`, { cookie });
    assert.equal(refused.status, 403, JSON.stringify(refused.data));
    assert.deepEqual(refused.data.error, { code: 'item_level', message: 'Ten przedmiot założysz od 51. poziomu postaci albo klasy.' });
    const view = (await call('GET', '/api/character', { cookie })).data.character;
    const shown = view.bag.find((item) => item.id === high);
    assert.deepEqual([shown.equipBlock, shown.wearLevel, shown.verdict], ['item_level', 51, null]);
    const fitting = view.bag.find((item) => item.id === fit);
    assert.deepEqual([fitting.equipBlock, fitting.wearLevel], [undefined, 50]);
    const worn = await call('POST', `/api/items/${fit}/equip`, { cookie });
    assert.equal(worn.status, 200, JSON.stringify(worn.data));
    assert.equal(worn.data.character.equipment.weapon.id, fit);
  });

  test('an item worn above the lock comes off into the bag at the next look, past a full bag too; on an exploration it waits for the return', async () => {
    const { cookie, database, id, ids } = await warrior('Rycerka', [
      [sword(81), 'weapon'],
      [helmet(80), 'head'],
    ]);
    const [high, fit] = ids;
    const slotOf = async (itemId) => (await database.prepare('SELECT slot FROM items WHERE id = ?').bind(itemId).first()).slot;
    // On an exploration it stays as it set out (its fights count it not).
    const now = Date.now();
    await database
      .prepare("INSERT INTO activities (character_id, kind, region_id, minutes, started_at, ends_at, seed, hp_at_start, options) VALUES (?, 'hunt', 'windfalls-edge', 60, ?, ?, 'x', 100, '{}')")
      .bind(id, now, now + 3600000)
      .run();
    const away = (await call('GET', '/api/character', { cookie })).data.character;
    assert.equal(away.equipment.weapon?.id, high);
    assert.equal(await slotOf(high), 'weapon');
    await database.prepare('DELETE FROM activities WHERE character_id = ?').bind(id).run();
    // A full bag: herbs in every place left.
    const stack = content.professionRules.stack;
    await database
      .prepare('UPDATE characters SET herbs = ? WHERE id = ?')
      .bind(JSON.stringify({ [content.herbs[0].id]: stack * (away.bagCapacity - away.bagUsed) }), id)
      .run();
    const { version } = await database.prepare('SELECT version FROM characters WHERE id = ?').bind(id).first();
    const view = (await call('GET', '/api/character', { cookie })).data.character;
    assert.equal(view.equipment.weapon, null);
    assert.equal(view.equipment.head.id, fit);
    assert.deepEqual([await slotOf(high), await slotOf(fit)], [null, 'head']);
    const back = view.bag.find((item) => item.id === high);
    assert.deepEqual([back.equipBlock, back.wearLevel], ['item_level', 51]);
    assert.equal(view.bagUsed, view.bagCapacity + 1);
    assert.ok((await database.prepare('SELECT version FROM characters WHERE id = ?').bind(id).first()).version > version);
    // Once: the next look changes nothing.
    const again = (await call('GET', '/api/character', { cookie })).data.character;
    assert.deepEqual([again.equipment.weapon, again.equipment.head.id, again.bagUsed], [null, fit, view.bagUsed]);
  });
});

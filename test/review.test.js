// Fixes from the code review of 1.11.2026 (DECISIONS.md, "Przegląd kodu"):
// ids of the object prototype find nothing in the content, a batch with the
// assertion that the character is as read rolls back as a whole, and the
// engine's slips: the evolution in the level-up lines, a weapon found on the
// way, the parts of a lucky crafted item, Odnowa without its evolution,
// Warsztat names from creatures without an adjective and a tower's first
// floors.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { canUse, craftItems, encountersFor, itemName, levelUpMessages, salvageYield, simulateHunt, towerArea, towerFloor } from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

describe('the code review: the engine', () => {
  test('a class level after the evolution brings its Skill Point and goes by the evolution\'s name', () => {
    const lines = levelUpMessages(newCharacter('warrior', { level: 60, classLevel: 50, evolution: 'barbarian' }), { level: 60, classLevel: 51 }, content);
    assert.ok(lines.includes('Osiągnięto poziom Klasy Barbarzyńca: 51'), lines.join(' | '));
    assert.ok(lines.includes('Zdobyto Punkty Umiejętności: +1'), lines.join(' | '));
  });

  test('a weapon found on the way is held only when the class level lets the character wear it', () => {
    const hunt = (classLevel, seed) => simulateHunt({ character: newCharacter('warrior', { level: 8, classLevel }), equipped: [], hp: 200, name: 'Test', areaId: 'fox-ravines', minutes: 60, seed }, content);
    let checked = 0;
    for (let n = 0; n < 60 && checked < 3; n += 1) {
      const low = hunt(5, `w${n}`);
      const at = low.fights.findIndex((fight) => fight.chests.some((index) => low.items[index].slot === 'weapon'));
      if (at < 0 || at === low.fights.length - 1) continue;
      const weapon = low.items[low.fights[at].chests.find((index) => low.items[index].slot === 'weapon')];
      if (canUse(weapon.base, 'warrior', content, 5)) continue;
      checked += 1;
      // Fists to the end, as after the exploration.
      assert.ok(low.fights.every((fight) => fight.allies[0].attack === low.fights[0].allies[0].attack), `w${n}`);
      // A character that may wear it holds it from the next fight.
      if (canUse(weapon.base, 'warrior', content, 10)) {
        const able = hunt(10, `w${n}`);
        assert.notEqual(able.fights.at(-1).allies[0].attack, able.fights[0].allies[0].attack, `w${n}`);
      }
    }
    assert.ok(checked > 0);
  });

  test('a crafted item luck made rarer gives back parts of the rarity ordered', () => {
    let item = null;
    for (let n = 0; n < 200 && !item; n += 1) {
      const [made] = craftItems({ baseId: 'sword', rarityId: 'rare', count: 1, level: 50, professionLevel: 60, seed: `x${n}` }, content);
      if (made.made && made.item.rarity !== 'rare') item = made.item;
    }
    assert.ok(item);
    assert.deepEqual(salvageYield(item, content), { partId: content.partsByRarity.rare.id, count: Math.floor(item.crafted.parts / 2) });
    // An item made before the rarity ordered was kept gives its own.
    const { rarity, ...before } = item.crafted;
    assert.equal(rarity, 'rare');
    assert.equal(salvageYield({ ...item, crafted: before }, content).partId, content.partsByRarity[item.rarity].id);
  });

  test('Odnowa of an evolution no longer on does not stop the fight', () => {
    const cleric = newCharacter('cleric', { level: 60, classLevel: 50, skills: { renewal: 20 } });
    const hunt = simulateHunt({ character: cleric, equipped: [], hp: 900, name: 'Kleryk', areaId: 'mossy-boulders', minutes: 240, seed: 'odnowa' }, content);
    assert.ok(JSON.stringify(hunt.fights).includes(content.skillsById.renewal.name));
  });

  test('the Warsztat names an item after creatures met that have no adjective', () => {
    const plain = Object.values(content.affixNamesByMonster)
      .filter((name) => !name.prefix)
      .map((name) => name.monster);
    const made = craftItems({ baseId: 'sword', rarityId: 'epic', count: 4, level: 20, professionLevel: 60, met: plain.slice(0, 2), seed: 'bez' }, content).filter((one) => one.made);
    assert.ok(made.some(({ item }) => item.affixes.some((affix) => affix.kind === 'prefix')));
    for (const { item } of made) assert.ok(itemName(item, content).length > 0);
  });

  test('a tower\'s floor brings only the encounters its level lets come', () => {
    const open = new Set(encountersFor(towerArea(1, content), 1).map((encounter) => encounter.monsters.join()));
    for (let n = 0; n < 300; n += 1) {
      const { encounter } = towerFloor(1, `s${n}`, content);
      if (encounter.elite || encounter.champion) continue;
      assert.ok(open.has(encounter.members.map((member) => member.monsterId).join()), `s${n}`);
    }
  });
});

describe('the code review', () => {
  test('the content lookups have no object prototype', () => {
    for (const map of [content.statsById, content.classesById, content.areasById, content.potionsById, content.herbsById, content.appearancesById, content.skinsById]) {
      for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) assert.equal(map[key], undefined, key);
    }
  });

  describe('through the API', () => {
    const { call, db, signUp } = useServer();
    let cookie;

    beforeEach(async () => {
      ({ cookie } = await signUp('przeglad'));
      await call('POST', '/api/character', { cookie, body: { name: 'Przeglad', classId: 'warrior', appearance: 'female' } });
      await (await db()).prepare('UPDATE characters SET level = 10, class_level = 10').run();
    });

    test('stat points go only to stats: "constructor" is refused and stores nothing', async () => {
      const bad = await call('POST', '/api/character/points', { cookie, body: { points: { constructor: 1 } } });
      assert.equal(bad.status, 400);
      assert.equal(bad.data.error.code, 'invalid_points');
      const stored = await (await db()).prepare('SELECT points FROM characters').first();
      assert.equal(JSON.parse(stored.points).constructor, Object.prototype.constructor);
      assert.ok(!Object.hasOwn(JSON.parse(stored.points), 'constructor'));
      // A look or a class of the prototype is refused too, not a server error.
      assert.equal((await call('POST', '/api/character/appearance', { cookie, body: { appearance: 'constructor' } })).status, 400);
      assert.equal((await call('POST', '/api/time/skip', { cookie, body: { target: 'constructor' } })).data.error?.code ?? 'none', 'invalid_target');
    });

    test('a batch led by the assertion that the character is as read changes nothing when it is not', async () => {
      const database = await db();
      const { id, version, gold } = await database.prepare('SELECT id, version, gold FROM characters').first();
      const sameVersion = (row) => database.prepare("SELECT CASE WHEN (SELECT version FROM characters WHERE id = ?) = ? THEN 1 ELSE json('nie') END").bind(row.id, row.version);
      await assert.rejects(database.batch([sameVersion({ id, version: version - 1 }), database.prepare('UPDATE characters SET gold = gold + 100 WHERE id = ?').bind(id)]), /malformed JSON/i);
      assert.equal((await database.prepare('SELECT gold FROM characters').first()).gold, gold);
      await database.batch([sameVersion({ id, version }), database.prepare('UPDATE characters SET gold = gold + 100 WHERE id = ?').bind(id)]);
      assert.equal((await database.prepare('SELECT gold FROM characters').first()).gold, gold + 100);
    });
  });
});

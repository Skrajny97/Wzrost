// Statystyki liczone jako inna (DECISIONS.md, 26.11.2026): a form that
// counts a stat as another (`as`, 988: the Wielki Inkwizytor's Intelekt is
// its Siła, the Łowca's Zręczność its Siła, the Nekromanta's and the
// Strzelec Burzy's Zręczność their Intelekt) moves that stat's points into
// the other from the class, the points, the professions and the gear. The
// numbers were right, but nothing said so: a gracz at level 86 saw his
// helmet's „Intelekt: +70 (+81)” and an Intelekt of 0 from everywhere that
// „nie zmienia dziś Twoich wartości bojowych”. Now computeStats reports the
// points moved, by source (`moved`), the character's view puts them on the
// stats' rows (`countsAs` on the stat counted so, `counted` on the other)
// and names the stat on its items' lines (`propertiesAs`), only for forms
// with `as`. The names are made up.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { computeStats, createRng, gearKey, gemProperties, generateItem, itemProperties, professionStats, propertiesAs, statAsOf } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const PARTS = ['class', 'character', 'professions', 'equipment'];

// An item of `baseId` whose affixes give these stats instead of their own.
function itemWith(baseId, stats, seed = baseId) {
  const item = generateItem({ baseId, level: 80, rarityId: 'epic' }, createRng(seed), content);
  return { ...item, implicit: null, affixes: stats.map(([stat, value], index) => ({ ...item.affixes[index], stat, value })) };
}

// A Wojownik's helmet with Intelekt twice, as the player's.
const helmet = itemWith('visored-helmet', [
  ['intellect', 70],
  ['intellect', 35],
  ['vitality', 20],
]);
// A ring with Zręczność.
const ring = itemWith('ring', [
  ['dexterity', 25],
  ['will', 10],
]);

describe('Statystyki liczone jako inna: the points moved, by source', () => {
  test('a Wielki Inkwizytor with an Intelekt helmet: its Intelekt from the class, the points, the professions and the gear is in its Siła, each part reported', () => {
    // At class level 100 the Inkwizytor and the Wielki Inkwizytor have the
    // same class levels behind them (the second form's growth starts at
    // 101), so they differ only by `as`.
    const base = { classId: 'cleric', level: 100, classLevel: 100, points: { strength: 30, intellect: 50 }, professions: { alchemy: { level: 5, xp: 0 } } };
    const before = computeStats({ ...base, evolution: 'inquisitor' }, [helmet], content);
    const after = computeStats({ ...base, evolution: 'grand-inquisitor' }, [helmet], content);
    assert.deepEqual(before.moved, {});
    const fromAlchemy = professionStats(base.professions, content).intellect;
    assert.ok(before.sources.intellect.class > 0 && fromAlchemy > 0);
    assert.deepEqual(after.moved, {
      intellect: { to: 'strength', class: before.sources.intellect.class, character: 50, professions: fromAlchemy, equipment: 105 },
    });
    for (const part of PARTS) {
      assert.equal(after.sources.strength[part], before.sources.strength[part] + before.sources.intellect[part], part);
      assert.equal(after.sources.intellect[part], 0, part);
    }
    assert.equal(after.totals.intellect, 0);
    assert.equal(after.totals.strength, before.totals.strength + before.totals.intellect);
  });

  test('a Łowca with a Zręczność ring: its Zręczność is in its Siła, each part reported', () => {
    // At class level 50 the Łowca's growth has not begun (from 51).
    const base = { classId: 'archer', level: 60, classLevel: 50, points: { dexterity: 40 }, professions: { crafting: { level: 4, xp: 0 } } };
    const before = computeStats(base, [ring], content);
    const after = computeStats({ ...base, evolution: 'hunter' }, [ring], content);
    assert.deepEqual(before.moved, {});
    assert.deepEqual(after.moved, {
      dexterity: { to: 'strength', class: before.sources.dexterity.class, character: 40, professions: professionStats(base.professions, content).dexterity, equipment: 25 },
    });
    for (const part of PARTS) assert.equal(after.sources.strength[part], before.sources.strength[part] + before.sources.dexterity[part], part);
    assert.equal(after.totals.dexterity, 0);
  });

  test('every form reports what it counts as another, the later forms of a line too (fieldOf), and the others nothing', () => {
    const counting = [];
    for (const form of content.evolutions) {
      const as = statAsOf(gearKey(form.classId, form.id, content), content);
      const { moved } = computeStats({ classId: form.classId, level: 300, classLevel: 300, points: {}, evolution: form.id }, [], content);
      assert.deepEqual(Object.fromEntries(Object.entries(moved).map(([from, one]) => [from, one.to])), as, form.id);
      for (const one of Object.values(moved)) assert.ok(one.class > 0, `${form.id}: the class's points moved`);
      if (Object.keys(as).length > 0) counting.push(form.id);
    }
    // The Strzelec Burzy's, the Łowca's, the Wielki Inkwizytor's and the
    // Nekromanta's lines, to their fifth forms.
    assert.deepEqual(counting.sort(), [
      'beast-lord', 'demon-slayer', 'grand-inquisitor', 'heaven-avenger', 'heaven-sword', 'hunt-god', 'hunter', 'lich', 'master-hunter', 'navia-emperor', 'navia-king', 'necromancer',
      'perun-chosen', 'perun-son', 'storm-archer', 'thunder-lord', 'thunderer', 'wild-lord',
    ]);
  });
});

describe('Statystyki liczone jako inna: the lines of an item', () => {
  test('each line of a stat counted as another names that one, one for one with the card\'s lines, with a gem too', () => {
    const key = gearKey('cleric', 'grand-inquisitor', content);
    const lines = itemProperties(helmet, content);
    const as = propertiesAs(helmet, key, content);
    assert.deepEqual(as, lines.map((line) => (line.startsWith('Intelekt:') ? 'Siła' : null)));
    assert.equal(as.filter(Boolean).length, 2);
    // A gem raises the numbers, the lines stay the same.
    const gemmed = { ...helmet, gem: 'agate', upgrade: 3 };
    assert.deepEqual(propertiesAs(gemmed, key, content), gemProperties(gemmed, content).map(({ text }) => (text.startsWith('Intelekt:') ? 'Siła' : null)));
    // The fifth form keeps its line's `as`.
    assert.deepEqual(propertiesAs(helmet, gearKey('cleric', 'heaven-sword', content), content), as);
    // A Zręczność form on its ring.
    assert.deepEqual(propertiesAs(ring, gearKey('shadow', 'necromancer', content), content), ['Intelekt', null]);
    assert.deepEqual(propertiesAs(ring, gearKey('archer', 'hunter', content), content), ['Siła', null]);
  });

  test('nothing for a form without `as`, nor for an item without the stat', () => {
    for (const [classId, evolution] of [['cleric', null], ['cleric', 'inquisitor'], ['warrior', 'barbarian'], ['archer', 'sniper'], ['shadow', 'poisoner']]) {
      assert.equal(propertiesAs(helmet, gearKey(classId, evolution, content), content), null, String(evolution));
      assert.equal(propertiesAs(ring, gearKey(classId, evolution, content), content), null, String(evolution));
    }
    assert.equal(propertiesAs(ring, gearKey('cleric', 'grand-inquisitor', content), content), null);
  });
});

describe('Statystyki liczone jako inna through the API', () => {
  const { call, db, signUp } = useServer();

  test("a Wielki Inkwizytor's stats say where its Intelekt went, its items name Siła on their Intelekt; an Inkwizytor's nothing", async () => {
    const { cookie } = await signUp('gromislaw');
    await call('POST', '/api/character', { cookie, body: { name: 'Gromislaw', classId: 'cleric', appearance: 'male' } });
    const database = await db();
    const { id } = await database.prepare("SELECT id FROM characters WHERE name = 'Gromislaw'").first();
    await database.prepare("UPDATE characters SET level = 110, class_level = 110, evolution = 'grand-inquisitor', points = ? WHERE id = ?").bind(JSON.stringify({ intellect: 40 }), id).run();
    // The helmet worn; in the bag an Intelekt ring and a kropidło the form
    // no longer wears.
    const bagRing = itemWith('ring', [['intellect', 12]], 'bag-ring');
    const aspergillum = itemWith('aspergillum', [['intellect', 30]], 'bag-aspergillum');
    await database
      .prepare("INSERT INTO items (character_id, slot, data, created_at) VALUES (?, 'head', ?, 0), (?, NULL, ?, 0), (?, NULL, ?, 0)")
      .bind(id, JSON.stringify(helmet), id, JSON.stringify(bagRing), id, JSON.stringify(aspergillum))
      .run();
    const seen = await call('GET', '/api/character', { cookie });
    assert.equal(seen.status, 200, JSON.stringify(seen.data));
    let view = seen.data.character;
    const stat = (statId) => view.stats.find((one) => one.id === statId);
    const intellect = stat('intellect');
    assert.deepEqual(Object.keys(intellect.countsAs.sources), PARTS);
    assert.deepEqual([intellect.countsAs.id, intellect.countsAs.name, intellect.countsAs.sources.character, intellect.countsAs.sources.equipment], ['strength', 'Siła', 40, 105]);
    assert.ok(intellect.countsAs.sources.class > 0);
    assert.equal(intellect.countsAs.total, PARTS.reduce((sum, part) => sum + intellect.countsAs.sources[part], 0));
    assert.equal(intellect.total, 0);
    assert.deepEqual(stat('strength').counted, [{ id: 'intellect', name: 'Intelekt', total: intellect.countsAs.total }]);
    assert.deepEqual(
      view.stats.filter((one) => one.countsAs || one.counted).map((one) => one.id),
      ['strength', 'intellect'],
    );
    // Its items: the helmet's two Intelekt lines and the ring's one; nothing
    // on the kropidło it cannot wear.
    const worn = view.equipment.head;
    assert.deepEqual(worn.propertiesAs, worn.properties.map((line) => (line.startsWith('Intelekt:') ? 'Siła' : null)));
    const bag = (base) => view.bag.find((item) => item.base === base);
    assert.deepEqual(bag('ring').propertiesAs, bag('ring').properties.map((line) => (line.startsWith('Intelekt:') ? 'Siła' : null)));
    assert.equal(bag('aspergillum').propertiesAs, undefined);

    // An Inkwizytor counts nothing as another.
    await database.prepare("UPDATE characters SET evolution = 'inquisitor' WHERE id = ?").bind(id).run();
    view = (await call('GET', '/api/character', { cookie })).data.character;
    assert.deepEqual(view.stats.filter((one) => one.countsAs || one.counted), []);
    assert.ok(stat('intellect').total > 0);
    assert.deepEqual([...Object.values(view.equipment), ...view.bag].filter((item) => item?.propertiesAs), []);
  });
});

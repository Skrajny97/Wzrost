// Evolutions that become another class's kind (988; src/engine/gear.js;
// DECISIONS.md, "Ewolucje, które zmieniają broń"): the Nekromanta and the
// Licz take the Mag's kostury and fokusy, count every point of Zręczność as
// Intelekt (from the class, the points, the professions and the gear), have
// their Intelekt give their speed and dodge, hit with the kostur by its
// share of the Mag's damage, spread their points by Intelekt, find their own
// gear, and wear their sztylet and mizerykordia made into a kostur and a
// fokus; their first form, the Truciciel, stays as it was.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { autoDistribute, autoPointsOf, canUse, computeStats, createRng, gearKey, gearLists, gearWearers, generateItem, itemView, playerCombatant, randomItem, regearItem, upgradedItem } from '../src/engine/index.js';
import { playerOf } from '../tools/difficulty-sim.mjs';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const necromancer = content.evolutionsById.necromancer;

describe('Ewolucje, które zmieniają broń (988)', () => {
  test('the gear key: the Nekromanta and the Licz have the Mag\'s weapons and off-hands, the Cień\'s armour; the Truciciel and the Cień their own', () => {
    assert.equal(gearKey('shadow', null, content), 'shadow');
    assert.equal(gearKey('shadow', 'poisoner', content), 'shadow');
    assert.equal(gearKey('shadow', 'necromancer', content), 'shadow:necromancer');
    assert.equal(gearKey('shadow', 'lich', content), 'shadow:lich');
    assert.deepEqual(gearLists('shadow:necromancer', content), { weapons: ['staff'], offhands: ['focus'], armor: content.classesById.shadow.armor });
    const key = gearKey('shadow', 'lich', content);
    for (const [base, usable] of [['staff', true], ['merlin-staff', true], ['grimoire', true], ['dagger', false], ['misericorde', false], ['tunic', true], ['robe', false], ['boots', true], ['ring', true]]) {
      assert.equal(canUse(base, key, content), usable, base);
    }
    assert.equal(canUse('dagger', 'shadow', content), true);
    assert.equal(canUse('staff', 'shadow', content), false);
    assert.deepEqual(autoPointsOf(key, content), necromancer.autoPoints);
  });

  test('their finds: a weapon of their own gear, never a sztylet', () => {
    const key = gearKey('shadow', 'necromancer', content);
    for (let index = 0; index < 40; index += 1) {
      const item = randomItem(80, createRng(`gear:${index}`), content, { classId: key, maxClassLevel: 150, filled: new Set() });
      assert.equal(item.slot, 'weapon');
      assert.equal(content.basesById[item.base].family ?? item.base, 'staff');
    }
  });

  test('a worn sztylet and mizerykordia made into a kostur and a fokus of the same place in the family, rarity, level, upgrade and affixes', () => {
    const key = gearKey('shadow', 'necromancer', content);
    const dagger = { ...generateItem({ baseId: 'kris', level: 90, rarityId: 'epic' }, createRng('kris'), content), upgrade: 4 };
    const staff = regearItem(dagger, key, content);
    assert.equal(staff.base, 'scepter');
    assert.equal(content.basesById[staff.base].classLevel, content.basesById.kris.classLevel);
    assert.deepEqual([staff.rarity, staff.level, staff.upgrade, staff.affixes, staff.regeared], [dagger.rarity, dagger.level, 4, dagger.affixes, { from: 'kris' }]);
    assert.ok(staff.damage.min > 0 && staff.damage.max >= staff.damage.min);
    assert.ok(content.basesById.scepter.elements.includes(staff.element));
    const parry = generateItem({ baseId: 'stiletto', level: 90, rarityId: 'rare' }, createRng('stiletto'), content);
    const focus = regearItem(parry, key, content);
    assert.equal(focus.base, 'crystal-ball');
    assert.equal(focus.implicit.stat, 'intellect');
    // The same tier's numbers: the same statFactor and bonus range.
    assert.equal(focus.implicit.value, parry.implicit.value);
    // What fits stays.
    assert.equal(regearItem(staff, key, content), null);
    assert.equal(regearItem(dagger, 'shadow', content), null);
    assert.equal(regearItem(generateItem({ baseId: 'tunic', level: 90 }, createRng('tunic'), content), key, content), null);
  });

  test('every point of Zręczność is Intelekt, which hits with the kostur by its share and gives the speed and dodge', () => {
    const { character, equipped } = playerOf('realistic', 'shadow', 150, content, 0, 'poisoned-blade');
    assert.equal(character.evolution, 'necromancer');
    assert.equal(equipped.find((item) => item.slot === 'weapon').base.includes('staff') || content.basesById[equipped.find((item) => item.slot === 'weapon').base].family === 'staff', true);
    const { totals, sources } = computeStats(character, equipped, content);
    assert.equal(totals.dexterity, 0);
    assert.deepEqual(Object.values(sources.dexterity).filter(Boolean), []);
    // Its points spread by Intelekt.
    const points = autoDistribute({ ...character, points: {} }, content);
    assert.ok((points.intellect ?? 0) > 0 && !points.dexterity, JSON.stringify(points));
    const unit = playerCombatant({ character, equipped, name: 'Mira' }, content);
    assert.equal(unit.weapon.scaling, 'intellect');
    // The Truciciel at the same level hits with Zręczność, as before.
    const poisoner = { ...character, evolution: 'poisoner' };
    const dagger = equipped.map((item) => (item.slot === 'weapon' ? { ...item, base: 'kris', element: undefined } : item));
    assert.equal(playerCombatant({ character: poisoner, equipped: dagger, name: 'Mira' }, content).weapon.scaling, 'dexterity');
    // The speed from Intelekt, as a Cień's from its Zręczność.
    assert.ok(unit.speed > 1.5, String(unit.speed));
    // The kostur hits by weaponDamage of its numbers, its upgrade in them.
    const held = upgradedItem(equipped.find((item) => item.slot === 'weapon'), content);
    assert.equal(necromancer.weaponDamage, 0.8);
    assert.deepEqual([unit.weapon.min, unit.weapon.max], [Math.round(held.damage.min * 0.8), Math.round(held.damage.max * 0.8)]);
  });
});

describe('Kto nosi jaką broń (988; the author, 15.11.2026: „tak logicznie to przemyśl żeby sie zgadzalo wszystko u każdej ewolucji i klasy”)', () => {
  test('every form wears its class\'s gear but the Nekromanta and the Licz, with the Mag\'s weapons and off-hands, and the Wielki Inkwizytor and the Pogromca Demonów, with the Wojownik\'s weapons', () => {
    const mage = content.classesById.mage;
    const warrior = content.classesById.warrior;
    for (const form of content.evolutions) {
      const lists = gearLists(gearKey(form.classId, form.id, content), content);
      const own = content.classesById[form.classId];
      if (['necromancer', 'lich'].includes(form.id)) assert.deepEqual(lists, { weapons: mage.weapons, offhands: mage.offhands, armor: own.armor }, form.id);
      else if (['grand-inquisitor', 'demon-slayer'].includes(form.id)) assert.deepEqual(lists, { weapons: warrior.weapons, offhands: own.offhands, armor: own.armor }, form.id);
      else assert.deepEqual(lists, { weapons: own.weapons, offhands: own.offhands, armor: own.armor }, form.id);
    }
  });

  test('who else wears a kind, and who of its classes does not: on the cards, in the Warsztat and the Encyklopedia', () => {
    assert.deepEqual(gearWearers('staff', content), { forms: ['necromancer', 'lich'], without: [] });
    assert.deepEqual(gearWearers('focus', content), { forms: ['necromancer', 'lich'], without: [] });
    assert.deepEqual(gearWearers('dagger', content), { forms: [], without: ['necromancer', 'lich'] });
    assert.deepEqual(gearWearers('misericorde', content), { forms: [], without: ['necromancer', 'lich'] });
    assert.deepEqual(gearWearers('sword', content), { forms: ['grand-inquisitor', 'demon-slayer'], without: [] });
    assert.deepEqual(gearWearers('aspergillum', content), { forms: [], without: ['grand-inquisitor', 'demon-slayer'] });
    for (const family of ['shield', 'bow', 'quiver', 'tunic', 'robe', 'hood']) assert.deepEqual(gearWearers(family, content), { forms: [], without: [] }, family);
    const card = (baseId) => itemView(generateItem({ baseId, level: 30 }, createRng(baseId), content), content);
    const staff = card('staff');
    assert.deepEqual([staff.family, staff.classNames, staff.formNames, staff.exceptNames], ['staff', ['Mag'], ['Nekromanta', 'Licz'], undefined]);
    const dagger = card('dagger');
    assert.deepEqual([dagger.family, dagger.classNames, dagger.formNames, dagger.exceptNames], ['dagger', ['Cień'], undefined, ['Nekromanta', 'Licz']]);
    const ring = card('ring');
    assert.deepEqual([ring.classIds, ring.formNames, ring.exceptNames], [null, undefined, undefined]);
  });
});

describe('Ewolucje, które zmieniają broń (988) through the API', () => {
  const { call, db, signUp } = useServer();

  test('a Nekromanta\'s worn sztylet becomes a kostur at its next look; a sztylet in the bag stays and cannot be worn', async () => {
    const { cookie } = await signUp('nekromanta');
    await call('POST', '/api/character', { cookie, body: { name: 'Nekromanta', classId: 'shadow', appearance: 'male' } });
    const database = await db();
    const { id } = await database.prepare("SELECT id FROM characters WHERE name = 'Nekromanta'").first();
    await database.prepare("UPDATE characters SET level = 110, class_level = 110, evolution = 'necromancer' WHERE id = ?").bind(id).run();
    const dagger = generateItem({ baseId: 'kris', level: 90, rarityId: 'rare' }, createRng('api-kris'), content);
    await database.prepare("DELETE FROM items WHERE character_id = ? AND slot = 'weapon'").bind(id).run();
    await database.prepare("INSERT INTO items (character_id, slot, data, created_at) VALUES (?, 'weapon', ?, 0), (?, NULL, ?, 0)").bind(id, JSON.stringify(dagger), id, JSON.stringify(dagger)).run();
    const seen = await call('GET', '/api/character', { cookie });
    assert.equal(seen.status, 200, JSON.stringify(seen.data));
    const worn = await database.prepare("SELECT data FROM items WHERE character_id = ? AND slot = 'weapon'").bind(id).first();
    const made = JSON.parse(worn.data);
    assert.deepEqual([made.base, made.rarity, made.level, made.regeared], ['scepter', 'rare', 90, { from: 'kris' }]);
    const bag = await database.prepare('SELECT id, data FROM items WHERE character_id = ? AND slot IS NULL').bind(id).first();
    assert.equal(JSON.parse(bag.data).base, 'kris');
    const refused = await call('POST', `/api/items/${bag.id}/equip`, { cookie });
    assert.equal(refused.data?.error?.code, 'wrong_class', JSON.stringify(refused.data));
    // The page is told so: the kinds its gear takes, and the sztylet's kind
    // and why it cannot be worn (the author, 15.11.2026: „Nekromanta nie
    // moze juz nosic tych przedmiotów sztyletowych… niech gra jakoś
    // informuje”).
    const view = seen.data.character;
    assert.ok(view.gear.includes('staff') && view.gear.includes('focus') && !view.gear.includes('dagger') && !view.gear.includes('misericorde'), JSON.stringify(view.gear));
    const shown = view.bag.find((item) => item.id === bag.id);
    assert.deepEqual([shown.family, shown.classIds.includes('shadow'), shown.equipBlock], ['dagger', true, 'wrong_class']);
    assert.equal(view.equipment.weapon.family, 'staff');
    // A Cień's gear is its class's.
    await database.prepare("UPDATE characters SET evolution = 'poisoner' WHERE id = ?").bind(id).run();
    const shadow = (await call('GET', '/api/character', { cookie })).data.character;
    assert.deepEqual([...shadow.gear].sort(), Object.values(gearLists('shadow', content)).flat().sort());
  });
});

describe('The gear made anew at an evolution and at a change of evolution', () => {
  const { call, db, signUp } = useServer();

  // The author, 15.11.2026: „Przy ewolucji w te odmienione formy też broń i
  // druga ręka powinny sie przekształcać automatycznie, żeby postać nie
  // zostawała bez broni”.
  test("a Truciciel evolving into a Nekromanta has its sztylet and mizerykordia made into a kostur and a fokus in the evolution's answer; a change of evolution away from it makes them a sztylet and a mizerykordia again", async () => {
    const { cookie } = await signUp('truciciel');
    await call('POST', '/api/character', { cookie, body: { name: 'Truciciel', classId: 'shadow', appearance: 'female' } });
    const database = await db();
    const { id } = await database.prepare("SELECT id FROM characters WHERE name = 'Truciciel'").first();
    const skills = Object.fromEntries(content.evolutionsById.poisoner.skills.map((skill) => [skill, 45]));
    await database.prepare("UPDATE characters SET level = 80, class_level = 100, evolution = 'poisoner', skills = ? WHERE id = ?").bind(JSON.stringify(skills), id).run();
    const dagger = generateItem({ baseId: 'kindjal', level: 70, rarityId: 'unique' }, createRng('evolve-dagger'), content);
    const parry = generateItem({ baseId: 'parrying-dagger', level: 70, rarityId: 'rare' }, createRng('evolve-parry'), content);
    await database.prepare("DELETE FROM items WHERE character_id = ? AND slot IN ('weapon', 'offhand')").bind(id).run();
    await database
      .prepare("INSERT INTO items (character_id, slot, data, created_at) VALUES (?, 'weapon', ?, 0), (?, 'offhand', ?, 0)")
      .bind(id, JSON.stringify(dagger), id, JSON.stringify(parry))
      .run();
    const worn = async () =>
      Object.fromEntries((await database.prepare("SELECT slot, data FROM items WHERE character_id = ? AND slot IN ('weapon', 'offhand')").bind(id).all()).results.map((row) => [row.slot, JSON.parse(row.data)]));
    const evolved = await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'necromancer' } });
    assert.equal(evolved.status, 200, JSON.stringify(evolved.data));
    // A second form brings a Zwój Niepamięci too.
    assert.deepEqual([evolved.data.oblivionScroll, evolved.data.character.oblivionScrolls], [true, 1]);
    let now = await worn();
    assert.deepEqual([now.weapon.base, now.offhand.base], ['posokh', 'quartz-crystal']);
    assert.deepEqual([now.weapon.rarity, now.weapon.level, now.offhand.implicit.stat], ['unique', 70, 'intellect']);
    // The answer itself shows them.
    const shown = evolved.data.character.equipment ?? evolved.data.character.equipped ?? evolved.data.character.items;
    assert.ok(JSON.stringify(shown ?? evolved.data.character).includes('posokh'), 'the kostur in the answer');
    // A change of evolution at the Pustelnik's to the Królobójca, as it
    // saves it: back to a sztylet and a mizerykordia at the next look.
    await database.prepare("UPDATE characters SET evolution = 'kingslayer' WHERE id = ?").bind(id).run();
    assert.equal((await call('GET', '/api/character', { cookie })).status, 200);
    now = await worn();
    assert.deepEqual([now.weapon.base, now.offhand.base], ['kindjal', 'parrying-dagger']);
    assert.equal(now.offhand.implicit.stat, 'dexterity');
  });
});

describe('Zwój Niepamięci (989)', () => {
  const { call, db, signUp } = useServer();

  test('past the free reset\'s level a Zwój Niepamięci resets the points once, and goes', async () => {
    const { cookie } = await signUp('niepamiec');
    await call('POST', '/api/character', { cookie, body: { name: 'Niepamiec', classId: 'mage', appearance: 'female' } });
    const database = await db();
    const set = (sql, ...binds) => database.prepare(`UPDATE characters SET ${sql} WHERE name = 'Niepamiec'`).bind(...binds).run();
    await set('level = 40, class_level = 40');
    await call('POST', '/api/character/points/auto', { cookie });
    let view = (await call('GET', '/api/character', { cookie })).data.character;
    assert.deepEqual([view.canResetPoints, view.oblivionScrolls, view.resetWithScroll], [false, 0, false]);
    assert.equal((await call('POST', '/api/character/points/reset', { cookie })).data.error.code, 'reset_locked');
    // One scroll, as every character got one.
    await set('oblivion_scrolls = 1');
    view = (await call('GET', '/api/character', { cookie })).data.character;
    assert.deepEqual([view.canResetPoints, view.oblivionScrolls, view.resetWithScroll], [true, 1, true]);
    const reset = await call('POST', '/api/character/points/reset', { cookie });
    assert.equal(reset.status, 200, JSON.stringify(reset.data));
    assert.deepEqual([reset.data.character.oblivionScrolls, reset.data.character.canResetPoints], [0, false]);
    const row = await database.prepare("SELECT points, oblivion_scrolls FROM characters WHERE name = 'Niepamiec'").first();
    assert.deepEqual([JSON.parse(row.points), row.oblivion_scrolls], [{}, 0]);
    // Once.
    await call('POST', '/api/character/points/auto', { cookie });
    assert.equal((await call('POST', '/api/character/points/reset', { cookie })).data.error.code, 'reset_locked');
    // Up to the free reset's level the scroll stays.
    await set('level = 10, class_level = 10, oblivion_scrolls = 1');
    await call('POST', '/api/character/points/auto', { cookie });
    const free = await call('POST', '/api/character/points/reset', { cookie });
    assert.deepEqual([free.status, free.data.character.oblivionScrolls], [200, 1]);
  });
});

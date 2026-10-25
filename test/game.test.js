// Character, items, hunts and reports through the API.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, test } from 'node:test';

import { createRng, generateItem, itemName } from '../src/engine/index.js';
import { skipTime } from '../src/server/testing.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const { call, db } = useServer();
// What a new character finds in the abandoned camp (data/balance.json).
const supply = content.balance.startingSupply;

async function signUp(login = 'karol') {
  const { cookie } = await call('POST', '/api/auth/register', { body: { login, password: 'tajnehaslo1' } });
  return cookie;
}

async function newCharacter(cookie, classId = 'warrior', name = 'Mira', appearance = 'female') {
  return call('POST', '/api/character', { cookie, body: { name, classId, appearance } });
}

// Moves the current hunt into the past, as if its time had passed. The seed is
// fixed, so the outcome is always the same: a random one now and then starts
// with the elite and brings no XP.
async function finishHunt() {
  await (await db())
    .prepare("UPDATE activities SET started_at = started_at - 86400000, ends_at = ?, seed = 'test-seed'")
    .bind(Date.now() - 1)
    .run();
}

describe('content', () => {
  test('describes classes, regions and durations for the page', async () => {
    const { status, data } = await call('GET', '/api/content');
    assert.equal(status, 200);
    assert.deepEqual(data.classes.map((cls) => cls.id), ['warrior', 'archer', 'mage', 'cleric', 'shadow']);
    assert.deepEqual(data.classes.filter((cls) => cls.start === 'gentle').map((cls) => cls.name), ['Wojownik', 'Kleryk']);
    assert.deepEqual(data.classes.filter((cls) => cls.start === 'hard').map((cls) => cls.name), ['Mag']);
    assert.deepEqual(data.durations, { min: 1, step: 5, max: 240 });
    assert.equal(data.regions[0].name, 'Wiatrołomy');
    assert.deepEqual(data.regions[0].areas.map((area) => [area.minLevel, area.maxLevel]), [[1, 5], [6, 10], [11, 15], [16, 20], [21, 25]]);
    assert.equal(data.regions[0].areas[0].name, 'Skraj Wiatrołomów');
    // An inner region opens at the class level just below its lowest one.
    assert.deepEqual(data.regions[0].areas.map((area) => area.unlockClassLevel), [1, 5, 10, 15, 20]);
    assert.equal(data.regions[1].areas[0].unlockClassLevel, 25);
    assert.equal(data.stats.length, 8);
    assert.equal(data.unlocks.find((unlock) => unlock.id === 'professions').level, 10);
    assert.match(data.elements.find((element) => element.id === 'fire').color, /^#[0-9a-f]{6}$/);
  });
});

describe('character creation', () => {
  let cookie;
  beforeEach(async () => {
    cookie = await signUp();
  });

  test('there is no character until one is created', async () => {
    const { status, data } = await call('GET', '/api/character', { cookie });
    assert.equal(status, 404);
    assert.equal(data.error.code, 'no_character');
    assert.equal((await call('GET', '/api/character')).status, 401);
  });

  test('a character has a look, chosen at the start and changed at any time', async () => {
    const missing = await call('POST', '/api/character', { cookie, body: { name: 'Mira', classId: 'archer' } });
    assert.equal(missing.status, 400);
    assert.equal(missing.data.error.code, 'invalid_appearance');
    assert.equal((await newCharacter(cookie, 'archer', 'Mira', 'male')).data.character.appearance, 'male');
    const changed = await call('POST', '/api/character/appearance', { cookie, body: { appearance: 'female' } });
    assert.equal(changed.status, 200);
    assert.equal(changed.data.character.appearance, 'female');
    assert.equal((await call('POST', '/api/character/appearance', { cookie, body: { appearance: 'troll' } })).status, 400);
  });

  test('creates a level 1 character with full HP and no items', async () => {
    const { status, data } = await newCharacter(cookie, 'warrior', '  Mira   z Boru ');
    assert.equal(status, 201);
    const character = data.character;
    assert.equal(character.name, 'Mira z Boru');
    assert.equal(character.className, 'Wojownik');
    assert.equal(character.appearance, 'female');
    assert.equal(character.level, 1);
    assert.equal(character.hp, character.maxHp);
    assert.equal(character.freePoints, 0);
    assert.deepEqual(Object.values(character.equipment).filter(Boolean), []);
    assert.deepEqual(character.bag, []);
    assert.match(character.combat.damage, /^\d+–\d+$/);
    assert.equal(character.stats.find((stat) => stat.id === 'strength').sources.class, 8);
    assert.equal(character.stats.find((stat) => stat.id === 'vitality').perPoint.maxHp, 5);
    // The first level takes about 4 minutes of exploring.
    // The first levels take about 20 minutes of exploring each.
    assert.ok(character.hoursToNext * 60 > 15 && character.hoursToNext * 60 <= 25);
  });

  test('"Zacznij od nowa" removes the character, so a new one can be made', async () => {
    await newCharacter(cookie, 'mage');
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    const removed = await call('DELETE', '/api/character', { cookie });
    assert.equal(removed.status, 200);
    assert.equal((await call('GET', '/api/character', { cookie })).data.error.code, 'no_character');
    const rows = await (await db()).prepare('SELECT (SELECT COUNT(*) FROM characters) AS c, (SELECT COUNT(*) FROM activities) AS a').first();
    assert.deepEqual(rows, { c: 0, a: 0 });
    assert.equal((await newCharacter(cookie, 'archer', 'Druga')).status, 201);
  });

  test('Punkty Systemu belong to the character and go with "Zacznij od nowa"', async () => {
    await newCharacter(cookie, 'mage');
    await (await db()).prepare('UPDATE characters SET system_points = 25').run();
    assert.equal((await call('GET', '/api/character', { cookie })).data.character.systemPoints, 25);
    await call('DELETE', '/api/character', { cookie });
    await newCharacter(cookie, 'archer', 'Druga');
    assert.equal((await call('GET', '/api/character', { cookie })).data.character.systemPoints, 0);
  });

  test('allows one character per account and checks the input', async () => {
    assert.equal((await newCharacter(cookie)).status, 201);
    assert.equal((await newCharacter(cookie)).data.error.code, 'character_exists');
    const other = await signUp('inny');
    assert.equal((await newCharacter(other, 'warrior', 'X')).data.error.code, 'invalid_name');
    assert.equal((await newCharacter(other, 'warrior', 'Bob<script>')).data.error.code, 'invalid_name');
    assert.equal((await newCharacter(other, 'warrior', '725')).data.error.code, 'invalid_name');
    assert.equal((await newCharacter(other, 'warrior', 'Justi_')).data.error.code, 'invalid_name');
    assert.equal((await newCharacter(other, 'necromancer')).data.error.code, 'invalid_class');
  });

  test('a name may have digits and underscores, as players like it, and a curly apostrophe', async () => {
    assert.equal((await newCharacter(cookie, 'warrior', 'Justi_725')).data.character.name, 'Justi_725');
    const other = await signUp('inny');
    assert.equal((await newCharacter(other, 'mage', 'D\u2019Artagnan')).data.character.name, "D'Artagnan");
  });

  test("what a phone's keyboard adds unseen does not stop a name, and a wrong one says why", async () => {
    // An invisible mark after the name, and an accent typed apart from its letter.
    assert.equal((await newCharacter(cookie, 'cleric', 'Justi\u200b')).data.character.name, 'Justi');
    const other = await signUp('inny');
    assert.equal((await newCharacter(other, 'mage', 'Zos\u0301ka')).data.character.name, 'Zośka');
    const third = await signUp('trzeci');
    const message = async (name) => (await newCharacter(third, 'warrior', name)).data.error.message;
    assert.equal(await message('X'), 'Imię postaci musi mieć od 2 do 20 znaków.');
    assert.equal(await message('Bob<script>'), 'Imię postaci nie może zawierać znaku „<”. Mogą być litery, cyfry, spacje, myślniki, apostrofy i podkreślniki.');
    assert.equal(await message('725'), 'Imię postaci musi zaczynać się od litery.');
    assert.equal(await message('Justi_'), 'Imię postaci musi kończyć się literą albo cyfrą.');
  });

  test('a name belongs to one player in the whole game, whatever the letter case', async () => {
    assert.equal((await newCharacter(cookie, 'warrior', 'Łucja')).status, 201);
    const other = await signUp('inny');
    const taken = await newCharacter(other, 'mage', 'ŁUCJA');
    assert.equal(taken.status, 409);
    assert.deepEqual(taken.data.error, { code: 'name_taken', message: 'To imię nosi już inna postać w grze. Wybierz inne.' });
    // "Zacznij od nowa" frees the name.
    await call('DELETE', '/api/character', { cookie });
    assert.equal((await newCharacter(other, 'mage', 'łucja')).status, 201);
  });

  test('the fresh start removes every character with its Punkty Systemu, and the accounts stay', async () => {
    const other = await signUp('inny');
    await newCharacter(cookie, 'warrior', 'Ola');
    await newCharacter(other, 'mage', 'Ewa');
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    const database = await db();
    await database.prepare('UPDATE characters SET system_points = 7').run();
    const migration = readFileSync('migrations/0010_fresh_start.sql', 'utf8')
      .replace(/--.*$/gm, '')
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);
    await database.batch(migration.map((statement) => database.prepare(statement)));

    const left = await database
      .prepare('SELECT (SELECT COUNT(*) FROM characters) AS characters, (SELECT COUNT(*) FROM activities) AS activities, (SELECT COUNT(*) FROM users) AS users')
      .first();
    assert.deepEqual(left, { characters: 0, activities: 0, users: 2 });
    assert.equal((await call('GET', '/api/character', { cookie })).data.error.code, 'no_character');
    // A new character starts with the introduction, and the name is free again.
    const again = await newCharacter(cookie, 'archer', 'Ewa');
    assert.equal(again.status, 201);
    assert.deepEqual(again.data.character.tutorial, []);
    assert.equal(again.data.character.systemPoints, 0);
  });

  test('players made before unique names keep them, and nobody new takes them', async () => {
    const others = [await signUp('inny'), await signUp('trzeci')];
    await newCharacter(cookie, 'warrior', 'Ola');
    await newCharacter(others[0], 'mage', 'Ewa');
    await newCharacter(others[1], 'archer', 'Iga');
    // The database as it was before migrations/0009: two players share a name.
    const database = await db();
    await database.batch([
      database.prepare('DROP INDEX characters_unique_name'),
      database.prepare('ALTER TABLE characters DROP COLUMN name_key'),
      database.prepare("UPDATE characters SET name = 'Łucja' WHERE name = 'Ola'"),
      database.prepare("UPDATE characters SET name = 'ŁUCJA' WHERE name = 'Ewa'"),
    ]);
    const migration = readFileSync('migrations/0009_unique_names.sql', 'utf8')
      .replace(/--.*$/gm, '')
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);
    await database.batch(migration.map((statement) => database.prepare(statement)));

    const { results } = await database.prepare('SELECT id, name, name_key FROM characters ORDER BY id').all();
    assert.deepEqual(results.map((row) => row.name_key), ['łucja', `łucja#${results[1].id}`, 'iga']);
    assert.equal((await call('GET', '/api/character', { cookie: others[0] })).data.character.name, 'ŁUCJA');
    const late = await signUp('czwarty');
    assert.equal((await newCharacter(late, 'cleric', 'łucja')).data.error.code, 'name_taken');
    assert.equal((await newCharacter(late, 'cleric', 'IGA')).data.error.code, 'name_taken');
    assert.equal((await newCharacter(late, 'cleric', 'Ola')).status, 201);
  });
});

describe('free points', () => {
  let cookie;
  beforeEach(async () => {
    cookie = await signUp();
    await newCharacter(cookie, 'archer');
    await (await db()).prepare('UPDATE characters SET level = 3, class_level = 2').run();
  });

  test('8 points per level and 2 per class level can be spent', async () => {
    const before = await call('GET', '/api/character', { cookie });
    assert.equal(before.data.character.freePoints, 8 * 2 + 2 * 1);
    const spent = await call('POST', '/api/character/points', { cookie, body: { points: { dexterity: 5, will: 1 } } });
    assert.equal(spent.status, 200);
    assert.equal(spent.data.character.freePoints, 12);
    const dexterity = spent.data.character.stats.find((stat) => stat.id === 'dexterity');
    assert.equal(dexterity.sources.character, 5);
  });

  test('cannot spend more than there is, or nonsense', async () => {
    const over = await call('POST', '/api/character/points', { cookie, body: { points: { strength: 19 } } });
    assert.equal(over.data.error.code, 'not_enough_points');
    for (const points of [{ luck: 1 }, { strength: -1 }, { strength: 1.5 }, {}, null]) {
      const result = await call('POST', '/api/character/points', { cookie, body: { points } });
      assert.equal(result.data.error.code, 'invalid_points', JSON.stringify(points));
    }
  });

  test('"Rozdaj według klasy" spends everything and reset is free up to level 20', async () => {
    const auto = await call('POST', '/api/character/points/auto', { cookie });
    assert.equal(auto.data.character.freePoints, 0);
    assert.equal(auto.data.character.canResetPoints, true);
    const reset = await call('POST', '/api/character/points/reset', { cookie });
    assert.equal(reset.data.character.freePoints, 18);
    await (await db()).prepare('UPDATE characters SET level = 21').run();
    const locked = await call('POST', '/api/character/points/reset', { cookie });
    assert.equal(locked.status, 403);
  });
});

describe('equipment', () => {
  let cookie;
  let bagItemId;
  let swordId;
  let mailId;
  const addItem = async (item) => {
    const result = await (await db())
      .prepare('INSERT INTO items (character_id, slot, data, created_at) SELECT id, NULL, ?, 0 FROM characters')
      .bind(JSON.stringify(item))
      .run();
    return result.meta.last_row_id;
  };
  beforeEach(async () => {
    cookie = await signUp();
    await newCharacter(cookie, 'warrior');
    swordId = await addItem({ base: 'sword', slot: 'weapon', level: 1, rarity: 'common', affixes: [], damage: { min: 7, max: 10 } });
    mailId = await addItem({ base: 'chainmail', slot: 'chest', level: 1, rarity: 'common', affixes: [], armor: 15 });
    bagItemId = await addItem({ base: 'axe', slot: 'weapon', level: 2, rarity: 'rare', affixes: [{ id: 'bear', kind: 'prefix', stat: 'strength', value: 3 }], damage: { min: 8, max: 14 } });
  });

  test('wearing an item puts the previous one in the bag', async () => {
    await call('POST', `/api/items/${swordId}/equip`, { cookie });
    const { data } = await call('POST', `/api/items/${bagItemId}/equip`, { cookie });
    assert.equal(data.character.equipment.weapon.name, 'Niedźwiedzi Topór');
    assert.equal(data.character.equipment.weapon.rarityName, 'rzadki');
    assert.deepEqual(data.character.bag.map((item) => item.name), ['Kolczuga', 'Miecz']);
    const strength = data.character.stats.find((stat) => stat.id === 'strength');
    assert.equal(strength.sources.equipment, 3);
  });

  test('taking off and throwing away', async () => {
    const worn = (await call('POST', `/api/items/${mailId}/equip`, { cookie })).data.character.equipment.chest;
    const off = await call('POST', `/api/items/${worn.id}/unequip`, { cookie });
    assert.equal(off.data.character.equipment.chest, null);
    assert.equal((await call('POST', `/api/items/${worn.id}/discard`, { cookie })).status, 200);
    await call('POST', `/api/items/${swordId}/equip`, { cookie });
    assert.equal((await call('POST', `/api/items/${swordId}/discard`, { cookie })).data.error.code, 'equipped');
    assert.equal((await call('POST', '/api/items/99999/equip', { cookie })).status, 404);
  });

  test('a preview shows what wearing an item changes', async () => {
    const { data } = await call('GET', `/api/items/${mailId}/preview`, { cookie });
    assert.equal(data.equipped, false);
    assert.ok(data.after.reduction > data.now.reduction);
    assert.equal(data.after.damage, data.now.damage);
    const weapon = (await call('GET', `/api/items/${bagItemId}/preview`, { cookie })).data;
    assert.ok(weapon.after.damageAverage > weapon.now.damageAverage);
  });

  test('a weapon or armour of another class cannot be worn, and gloves fit anyone', async () => {
    const staffId = await addItem({ base: 'staff', slot: 'weapon', level: 1, rarity: 'common', element: 'fire', affixes: [], damage: { min: 6, max: 9 } });
    const robeId = await addItem({ base: 'robe', slot: 'chest', level: 1, rarity: 'common', affixes: [], armor: 8 });
    const glovesId = await addItem({ base: 'gloves', slot: 'hands', level: 1, rarity: 'common', affixes: [], armor: 5 });
    for (const id of [staffId, robeId]) {
      const { status, data } = await call('POST', `/api/items/${id}/equip`, { cookie });
      assert.equal(status, 403);
      assert.equal(data.error.code, 'wrong_class');
    }
    const bag = (await call('GET', '/api/character', { cookie })).data.character.bag;
    assert.deepEqual(bag.find((item) => item.id === staffId).classNames, ['Mag']);
    assert.deepEqual(bag.find((item) => item.id === robeId).classNames, ['Mag']);
    assert.deepEqual(bag.find((item) => item.id === mailId).classNames, ['Wojownik']);
    assert.equal(bag.find((item) => item.id === glovesId).classIds, null);
    assert.equal((await call('POST', `/api/items/${glovesId}/equip`, { cookie })).status, 200);
  });

  test('with armour bound to classes, what a character wore against its class goes back to the bag', async () => {
    const other = await signUp('lucznik');
    await newCharacter(other, 'archer', 'Iga');
    const database = await db();
    const archer = await database.prepare("SELECT id FROM characters WHERE class_id = 'archer'").first();
    const wear = async (characterId, base, slot) =>
      database
        .prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, ?, ?, 0)')
        .bind(characterId, slot, JSON.stringify({ base, slot, level: 1, rarity: 'common', affixes: [], armor: 6 }))
        .run();
    // As before migrations/0012: an archer in a robe and a helmet, with a
    // hood in the bag and gloves on; the warrior in its own chainmail.
    await wear(archer.id, 'robe', 'chest');
    await wear(archer.id, 'helmet', 'head');
    await wear(archer.id, 'gloves', 'hands');
    await call('POST', `/api/items/${mailId}/equip`, { cookie });
    const migration = readFileSync('migrations/0012_class_armour.sql', 'utf8')
      .replace(/--.*$/gm, '')
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);
    await database.batch(migration.map((statement) => database.prepare(statement)));

    const archerView = (await call('GET', '/api/character', { cookie: other })).data.character;
    assert.equal(archerView.equipment.chest, null);
    assert.equal(archerView.equipment.head, null);
    assert.equal(archerView.equipment.hands.name, 'Rękawice');
    assert.deepEqual(archerView.bag.map((item) => item.name).sort(), ['Hełm', 'Szata']);
    const warriorView = (await call('GET', '/api/character', { cookie })).data.character;
    assert.equal(warriorView.equipment.chest.name, 'Kolczuga');
  });

  test('the cleric now wears what the mage wears: its helmet and chainmail go back to the bag', async () => {
    const other = await signUp('kleryk');
    await newCharacter(other, 'cleric', 'Jagna');
    const database = await db();
    const cleric = await database.prepare("SELECT id FROM characters WHERE class_id = 'cleric'").first();
    const wear = async (base, slot) =>
      database
        .prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, ?, ?, 0)')
        .bind(cleric.id, slot, JSON.stringify({ base, slot, level: 1, rarity: 'common', affixes: [], armor: 6 }))
        .run();
    // As before migrations/0013: a cleric in chainmail and a helmet, with
    // gloves on; the warrior in its own chainmail.
    await wear('chainmail', 'chest');
    await wear('helmet', 'head');
    await wear('gloves', 'hands');
    await call('POST', `/api/items/${mailId}/equip`, { cookie });
    const migration = readFileSync('migrations/0013_cleric_armour.sql', 'utf8')
      .replace(/--.*$/gm, '')
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);
    await database.batch(migration.map((statement) => database.prepare(statement)));

    const clericView = (await call('GET', '/api/character', { cookie: other })).data.character;
    assert.equal(clericView.equipment.chest, null);
    assert.equal(clericView.equipment.head, null);
    assert.equal(clericView.equipment.hands.name, 'Rękawice');
    assert.deepEqual(clericView.bag.map((item) => item.name).sort(), ['Hełm', 'Kolczuga']);
    const warriorView = (await call('GET', '/api/character', { cookie })).data.character;
    assert.equal(warriorView.equipment.chest.name, 'Kolczuga');
  });

  test("with a set of its own, the cleric's hood and robe become a Kapuza and a Komża", async () => {
    const database = await db();
    const characterOf = async (login, classId, name) => {
      const owner = await signUp(login);
      await newCharacter(owner, classId, name);
      return { owner, id: (await database.prepare('SELECT id FROM characters WHERE name = ?').bind(name).first()).id };
    };
    const cleric = await characterOf('kleryk', 'cleric', 'Jagna');
    const mage = await characterOf('mag', 'mage', 'Wanda');
    const give = async (characterId, base, slot, worn, affixes = []) =>
      database
        .prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, ?, ?, 0)')
        .bind(characterId, worn ? slot : null, JSON.stringify({ base, slot, level: 1, rarity: affixes.length ? 'rare' : 'common', affixes, armor: 4 }))
        .run();
    // As before migrations/0014: a cleric in an owl hood and a robe, with
    // another robe in the bag; the mage in its own robe.
    await give(cleric.id, 'hood', 'head', true, [{ id: 'owl', kind: 'prefix', stat: 'wisdom', value: 2 }]);
    await give(cleric.id, 'robe', 'chest', true);
    await give(cleric.id, 'robe', 'chest', false);
    await give(mage.id, 'robe', 'chest', true);
    const migration = readFileSync('migrations/0014_cleric_set.sql', 'utf8')
      .replace(/--.*$/gm, '')
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);
    await database.batch(migration.map((statement) => database.prepare(statement)));

    const clericView = (await call('GET', '/api/character', { cookie: cleric.owner })).data.character;
    assert.equal(clericView.equipment.head.name, 'Puszczykowa Kapuza');
    assert.equal(clericView.equipment.chest.name, 'Komża');
    assert.deepEqual(clericView.equipment.chest.classNames, ['Kleryk']);
    assert.deepEqual(clericView.bag.map((item) => item.name), ['Komża']);
    const mageView = (await call('GET', '/api/character', { cookie: mage.owner })).data.character;
    assert.equal(mageView.equipment.chest.name, 'Szata');
  });

  test('the scrapper buys bag items up to the chosen rarity', async () => {
    await call('POST', `/api/items/${swordId}/equip`, { cookie });
    const before = (await call('GET', '/api/character', { cookie })).data.character;
    // The worn sword stays; the common mail goes, the rare axe stays.
    const commons = await call('POST', '/api/items/sell', { cookie, body: { maxRarity: 'common' } });
    assert.equal(commons.status, 200);
    assert.deepEqual(commons.data.sold, { count: 1, gold: 1 });
    assert.equal(commons.data.character.gold, before.gold + 1);
    assert.deepEqual(commons.data.character.bag.map((item) => item.name), ['Niedźwiedzi Topór']);
    assert.equal(commons.data.character.equipment.weapon.name, 'Miecz');

    const rares = await call('POST', '/api/items/sell', { cookie, body: { maxRarity: 'rare' } });
    assert.deepEqual(rares.data.sold, { count: 1, gold: 4 });
    assert.deepEqual(rares.data.character.bag, []);
    const nothing = await call('POST', '/api/items/sell', { cookie, body: { maxRarity: 'divine' } });
    assert.deepEqual(nothing.data.sold, { count: 0, gold: 0 });
    assert.equal(nothing.data.character.gold, before.gold + 5);
    assert.equal((await call('POST', '/api/items/sell', { cookie, body: { maxRarity: 'tin' } })).status, 400);
  });

  test("another player's items are out of reach", async () => {
    const other = await signUp('inny');
    await newCharacter(other, 'mage', 'Obcy');
    assert.equal((await call('POST', `/api/items/${bagItemId}/equip`, { cookie: other })).status, 404);
  });
});

describe('hunts and reports', () => {
  let cookie;
  beforeEach(async () => {
    cookie = await signUp();
    await newCharacter(cookie, 'cleric');
  });

  test('options show a threat level for every open inner region and duration', async () => {
    // Without a choice: the inner region of each region that fits the level, if it is open.
    const { status, data } = await call('GET', '/api/hunts/options', { cookie });
    assert.equal(status, 200);
    assert.deepEqual(data.areas.map((area) => area.id), ['windfalls-edge']);
    const steps = Object.keys(data.areas[0].threat);
    assert.equal(steps.length, 49);
    assert.deepEqual([steps[0], steps[1], steps[2], steps.at(-1)], ['1', '5', '10', '240']);
    assert.equal(data.areas[0].threat['5'], 'low');

    const one = await call('GET', '/api/hunts/options?area=windfalls-edge', { cookie });
    assert.deepEqual(one.data.areas.map((area) => area.id), ['windfalls-edge']);
    assert.deepEqual(one.data.areas[0].threat, data.areas[0].threat);
    assert.equal((await call('GET', '/api/hunts/options?area=moon', { cookie })).status, 400);
    const locked = await call('GET', '/api/hunts/options?area=boar-thicket', { cookie });
    assert.equal(locked.status, 403);
    assert.equal(locked.data.error.code, 'area_locked');

    // The class level opens places above the character's level too.
    await (await db()).prepare('UPDATE characters SET class_level = 20').run();
    const far = await call('GET', '/api/hunts/options?area=boar-thicket', { cookie });
    assert.equal(far.data.areas[0].threat['1'], 'very-high');
  });

  test('inner regions open with the class level, lower ones stay open', async () => {
    const locked = await call('POST', '/api/hunts', { cookie, body: { areaId: 'fox-ravines', minutes: 5 } });
    assert.equal(locked.status, 403);
    assert.equal(locked.data.error.code, 'area_locked');
    assert.equal(locked.data.error.message, 'To miejsce odblokujesz na poziomie klasy 5.');
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'mossy-boulders', minutes: 5 } })).status, 403);

    // A level 20 character with class level 22 may go to the first place of all.
    await (await db()).prepare('UPDATE characters SET level = 20, class_level = 22').run();
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'mossy-boulders', minutes: 5 } })).status, 403);
    const easy = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    assert.equal(easy.status, 201);
    assert.equal(easy.data.character.activity.areaId, 'windfalls-edge');
  });

  test('a hunt runs on server time and pays out once, after it ends', async () => {
    const start = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30 } });
    assert.equal(start.status, 201);
    const activity = start.data.character.activity;
    assert.deepEqual([activity.areaName, activity.regionName], ['Skraj Wiatrołomów', 'Wiatrołomy']);
    assert.equal(activity.endsAt - activity.startedAt, 30 * 60000);
    assert.equal(activity.finished, false);

    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } })).data.error.code, 'busy');
    assert.equal((await call('POST', '/api/character/points/auto', { cookie })).data.error.code, 'busy');
    assert.equal((await call('POST', '/api/hunts/claim', { cookie })).data.error.code, 'not_finished');

    await finishHunt();
    const [first, second] = await Promise.all([
      call('POST', '/api/hunts/claim', { cookie }),
      call('POST', '/api/hunts/claim', { cookie }),
    ]);
    const claims = [first, second].sort((a, b) => a.status - b.status);
    assert.equal(claims[0].status, 200);
    assert.equal(claims[1].status, 409);
    assert.ok(['already_claimed', 'no_activity'].includes(claims[1].data.error.code));

    const { report, character } = claims[0].data;
    assert.deepEqual([report.areaId, report.areaName, report.regionName], ['windfalls-edge', 'Skraj Wiatrołomów', 'Wiatrołomy']);
    assert.ok(['success', 'escaped'].includes(report.result));
    assert.ok(report.summary.xp > 0);
    assert.equal(report.summary.classXp, report.summary.xp);
    assert.ok(report.fights[report.keyFight.index].events.length > 0);
    assert.ok(report.fights.every((fight) => fight.allies.length === 1 && fight.enemies.length >= 1));
    assert.equal(character.activity, null);
    assert.equal(character.gold, supply.gold + report.summary.gold);
    // Levels and class levels bring Time Points, on top of the narrator's.
    assert.equal(character.timePoints, content.balance.timePoints.start + report.summary.timePoints);
    // The first weapon goes straight into the empty slot, the rest into the bag.
    assert.ok(character.equipment.weapon);
    const worn = Object.values(character.equipment).filter(Boolean).length;
    assert.equal(character.bag.length + worn, report.items.length);
    assert.ok(report.system.some((line) => line.startsWith('Założono od razu: ')));
    assert.equal(character.level > 1 || character.xp === report.summary.xp, true);
    assert.equal(report.fights.length, report.summary.fights);

    const journal = await call('GET', '/api/reports', { cookie });
    assert.equal(journal.data.reports.length, 1);
    assert.equal(journal.data.reports[0].id, report.id);
    const again = await call('GET', `/api/reports/${report.id}`, { cookie });
    assert.deepEqual(again.data.report.summary, report.summary);
    assert.equal((await call('GET', '/api/reports/999999', { cookie })).status, 404);
    assert.equal((await call('POST', '/api/hunts/claim', { cookie })).data.error.code, 'no_activity');
  });

  test('the claim keeps only the 50 newest reports', async () => {
    const database = await db();
    await database
      .prepare(
        `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 55)
         INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data)
         SELECT (SELECT id FROM characters), 'old:' || i, 'hunt', i, '{}', '{}' FROM n`,
      )
      .run();
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    await finishHunt();
    const { data } = await call('POST', '/api/hunts/claim', { cookie });
    const rows = await database.prepare('SELECT COUNT(*) AS count, MAX(id) AS newest, MIN(created_at) AS oldest FROM reports').first();
    assert.equal(rows.count, 50);
    assert.equal(rows.newest, data.report.id);
    // The 49 newest of the old ones stay: 7 to 55.
    assert.equal(rows.oldest, 7);
  });

  test('"Pomiń czas" in test mode ends the hunt at once, then the rest', async () => {
    assert.equal((await call('GET', '/api/me', { cookie })).data.user.testMode, true);
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30 } });
    const skipped = await call('POST', '/api/test/skip-time', { cookie });
    assert.equal(skipped.status, 200);
    const activity = skipped.data.character.activity;
    assert.equal(activity.finished, true);
    assert.equal(activity.endsAt - activity.startedAt, 30 * 60000);
    const claim = await call('POST', '/api/hunts/claim', { cookie });
    assert.equal(claim.status, 200);
    assert.equal(claim.data.report.minutes, 30);

    // Without a hunt it fills HP.
    await (await db()).prepare('UPDATE characters SET hp = 1, hp_at = ?').bind(Date.now()).run();
    const rested = await call('POST', '/api/test/skip-time', { cookie });
    assert.equal(rested.data.character.hp, rested.data.character.maxHp);
  });

  test('without test mode "Pomiń czas" does not exist', async () => {
    await assert.rejects(skipTime({ env: { TEST_MODE: 'off' } }), (error) => error.status === 404);
  });

  test('hunts last up to 30 minutes at first; longer ones open at levels 25, 35 and 50', async () => {
    const before = (await call('GET', '/api/character', { cookie })).data.character;
    assert.deepEqual([before.huntDurations[0], before.huntDurations[1], before.huntDurations.at(-1)], [1, 5, 30]);
    assert.deepEqual(before.huntNext, { level: 25, minutes: 60 });
    assert.deepEqual(before.features, []);
    const locked = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 35 } });
    assert.equal(locked.status, 403);
    assert.equal(locked.data.error.code, 'duration_locked');
    assert.match(locked.data.error.message, /30 minut.*poziomie 25/);

    await (await db()).prepare('UPDATE characters SET level = 25').run();
    const after = (await call('GET', '/api/character', { cookie })).data.character;
    assert.equal(after.huntDurations.at(-1), 60);
    assert.deepEqual(after.huntNext, { level: 35, minutes: 120 });
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 60 } })).status, 201);
  });

  test('a hunt can be called off early, without rewards', async () => {
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30 } });
    const cancel = await call('POST', '/api/hunts/cancel', { cookie });
    assert.equal(cancel.status, 200);
    assert.equal(cancel.data.character.activity, null);
    assert.equal(cancel.data.character.gold, supply.gold);
    assert.equal((await call('POST', '/api/hunts/cancel', { cookie })).data.error.code, 'no_activity');
  });

  test('checks the place and the duration', async () => {
    const place = await call('POST', '/api/hunts', { cookie, body: { areaId: 'moon', minutes: 60 } });
    assert.equal(place.data.error.code, 'invalid_area');
    // Only steps of the slider: 5, 10, 15… up to 4 hours.
    for (const minutes of [7, 0, 245, '30']) {
      const wrong = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes } });
      assert.equal(wrong.data.error.code, 'invalid_duration');
    }
  });

  test('an exploration from before inner regions finishes in the inner region for the level', async () => {
    // "Wyrusz ponownie" from an old report sends the whole region.
    const start = await call('POST', '/api/hunts', { cookie, body: { regionId: 'windfalls', minutes: 5 } });
    assert.equal(start.data.character.activity.areaId, 'windfalls-edge');
    // The previous version stored the whole region with the activity.
    await (await db()).prepare("UPDATE activities SET region_id = 'windfalls'").run();
    assert.equal((await call('GET', '/api/character', { cookie })).data.character.activity.areaName, 'Skraj Wiatrołomów');
    await finishHunt();
    const { report } = (await call('POST', '/api/hunts/claim', { cookie })).data;
    assert.equal(report.areaId, 'windfalls-edge');
  });

  test('HP lost on a hunt comes back with time', async () => {
    await (await db()).prepare('UPDATE characters SET hp = 1, hp_at = ?').bind(Date.now()).run();
    const wounded = (await call('GET', '/api/character', { cookie })).data.character;
    assert.equal(wounded.hp, 1);
    assert.ok(wounded.regen.perMinute > 0);
    await (await db()).prepare('UPDATE characters SET hp_at = ?').bind(Date.now() - 600000).run();
    const rested = (await call('GET', '/api/character', { cookie })).data.character;
    assert.ok(rested.hp > 1 + 9 * wounded.regen.perMinute);
  });
});

describe('camp', () => {
  let cookie;
  beforeEach(async () => {
    cookie = await signUp();
    await newCharacter(cookie, 'warrior');
  });

  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const build = (buildingId) => call('POST', '/api/camp/build', { cookie, body: { buildingId } });
  const finishBuilding = async () => (await db()).prepare('UPDATE buildings SET ends_at = ?').bind(Date.now() - 1).run();
  // Gold and resources for building, as if gathered on explorations.
  const stock = async (gold, resources) =>
    (await db()).prepare('UPDATE characters SET gold = ?, resources = ?').bind(gold, JSON.stringify(resources)).run();
  // Items straight into the bag, as if found earlier.
  async function fillBag(count, { baseId = 'helmet', rarityId = 'common', level = 3 } = {}) {
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    const rng = createRng('bag');
    for (let i = 0; i < count; i++) {
      const item = generateItem({ baseId, level, rarityId }, rng, content);
      await database.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, ?)').bind(id, JSON.stringify(item), i).run();
    }
  }

  test("starts with eight buildings at level 0, the abandoned camp's supply and a bag of 30", async () => {
    const start = await character();
    assert.deepEqual(
      start.camp.buildings.map((building) => [building.id, building.level]),
      [['sawmill', 0], ['quarry', 0], ['mine', 0], ['campfire', 0], ['loot-shed', 0], ['scrap-bench', 0], ['anvil', 0], ['craft-table', 0]],
    );
    assert.equal(start.camp.construction, null);
    const campfire = start.camp.buildings.find((building) => building.id === 'campfire');
    assert.deepEqual(campfire.next, { level: 1, effect: 'Odpoczynek między wyprawami szybszy o 10%', minutes: 1, cost: { gold: 5, wood: 4 } });
    assert.equal(campfire.production, null);
    assert.deepEqual(start.resources, { wood: 15, stone: 3, 'iron-ore': 0 });
    assert.equal(start.gold, 15);
    assert.equal(start.systemPoints, 0);
    assert.equal(start.bagCapacity, 30);
    const { data } = await call('GET', '/api/content');
    assert.deepEqual(data.resources.map((resource) => resource.name), ['Drewno', 'Kamień', 'Ruda żelaza']);
    assert.deepEqual(
      data.buildings.map((building) => building.name),
      ['Tartak', 'Kamieniołom', 'Kopalnia', 'Ognisko', 'Szałas na łupy', 'Skup złomu', 'Kowadło', 'Stół rzemieślniczy'],
    );
  });

  test('a building is paid in gold and resources, takes time, and one is built at a time', async () => {
    await stock(0, {});
    assert.equal((await build('campfire')).data.error.code, 'not_enough');
    assert.equal((await build('tower')).data.error.code, 'invalid_building');
    await stock(100, { wood: 20, stone: 5 });
    const before = await character();

    const started = await build('campfire');
    assert.equal(started.status, 201);
    const running = started.data.character.camp.construction;
    assert.deepEqual([running.buildingId, running.name, running.level, running.endsAt - running.startedAt], ['campfire', 'Ognisko', 1, 60000]);
    assert.equal(started.data.character.gold, 95);
    assert.deepEqual(started.data.character.resources, { wood: 16, stone: 5, 'iron-ore': 0 });
    // Until the end the building keeps its old level, and nothing else can be built.
    const campfire = (view) => view.camp.buildings.find((building) => building.id === 'campfire');
    assert.equal(campfire(started.data.character).level, 0);
    assert.equal((await build('loot-shed')).data.error.code, 'camp_busy');
    assert.equal((await build('campfire')).data.error.code, 'camp_busy');

    await finishBuilding();
    const done = await character();
    assert.equal(done.camp.construction, null);
    assert.equal(campfire(done).level, 1);
    assert.equal(campfire(done).effect, 'Odpoczynek między wyprawami szybszy o 10%');
    // Ognisko: resting 10% faster from the end of the upgrade on, which came
    // after the HP saved at its start.
    assert.equal(done.regen.perMinute, before.regen.perMinute);
    assert.ok(Math.abs(done.regen.change.perMinute / before.regen.perMinute - 1.1) < 1e-6);

    // Level 2 takes more gold and wood, and stone too.
    const second = await build('campfire');
    assert.equal(second.status, 201);
    assert.equal(second.data.character.gold, 85);
    assert.deepEqual(second.data.character.resources, { wood: 8, stone: 2, 'iron-ore': 0 });
    assert.equal(second.data.character.camp.construction.endsAt - second.data.character.camp.construction.startedAt, 2 * 60000);
  });

  test('building goes on during an exploration', async () => {
    await stock(100, { wood: 20 });
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30 } });
    const started = await build('loot-shed');
    assert.equal(started.status, 201);
    assert.equal(started.data.character.activity.areaId, 'windfalls-edge');
  });

  test('"Pomiń czas" in test mode finishes the upgrade', async () => {
    await stock(100, { wood: 20 });
    await build('loot-shed');
    const skipped = await call('POST', '/api/test/skip-build', { cookie });
    assert.equal(skipped.status, 200);
    assert.equal(skipped.data.character.camp.construction, null);
    assert.equal(skipped.data.character.bagCapacity, 35);
  });

  test('a full bag: the scrapper buys the weakest items, and nothing can be taken off', async () => {
    await fillBag(31, { rarityId: 'common', level: 3 });
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 15 } });
    await finishHunt();
    const { report, character: after } = (await call('POST', '/api/hunts/claim', { cookie })).data;
    assert.equal(after.bag.length, 30);
    assert.ok(report.system.some((line) => line.startsWith('Plecak był pełny (30 miejsc).')));
    // The first weapon went into the hand; with a full bag it cannot be taken off.
    const weapon = after.equipment.weapon;
    assert.ok(weapon);
    const off = await call('POST', `/api/items/${weapon.id}/unequip`, { cookie });
    assert.equal(off.status, 409);
    assert.equal(off.data.error.code, 'bag_full');
  });

  test('a production building fills its store, which the player collects', async () => {
    await stock(200, { wood: 6 });
    const built = await build('sawmill');
    const store = (view) => view.camp.buildings.find((building) => building.id === 'sawmill').production;
    // The store comes with the building.
    assert.equal(store(built.data.character), null);
    await call('POST', '/api/test/skip-build', { cookie });
    const ready = await character();
    assert.deepEqual([store(ready).paused, store(ready).perHour, store(ready).capacity], [false, 6, 6]);
    assert.equal((await call('POST', '/api/camp/collect', { cookie, body: { buildingId: 'sawmill' } })).data.error.code, 'nothing_to_collect');
    assert.equal((await call('POST', '/api/camp/collect', { cookie, body: { buildingId: 'campfire' } })).data.error.code, 'invalid_building');

    // With nothing being built, "Pomiń czas" fills the stores.
    const full = await call('POST', '/api/test/skip-build', { cookie });
    assert.equal(store(full.data.character).amount, 6);
    const collected = await call('POST', '/api/camp/collect', { cookie, body: { buildingId: 'sawmill' } });
    assert.equal(collected.status, 200);
    assert.deepEqual(collected.data.collected, { resource: 'wood', amount: 6 });
    assert.equal(collected.data.character.resources.wood, 6);
    assert.equal(collected.data.character.gold, 200 - 8);
    assert.equal((await call('POST', '/api/camp/collect', { cookie, body: { buildingId: 'sawmill' } })).data.error.code, 'nothing_to_collect');

    // An upgrade first collects the store: level 2 costs 16 gold, 11 wood and 3 stone.
    await stock(192, { wood: 11, stone: 3 });
    await call('POST', '/api/test/skip-build', { cookie });
    const upgraded = await build('sawmill');
    assert.equal(upgraded.status, 201);
    assert.deepEqual(upgraded.data.character.resources, { wood: 11 + 6 - 11, stone: 0, 'iron-ore': 0 });
    assert.equal(upgraded.data.character.gold, 192 - 16);
    assert.deepEqual([store(upgraded.data.character).paused, store(upgraded.data.character).amount], [true, 0]);
  });

  test('two taps on "Zbierz" collect once', async () => {
    await stock(200, { wood: 6 });
    await build('sawmill');
    await finishBuilding();
    // Half an hour of 6 wood an hour: 3 wood, the store not full.
    await (await db()).prepare("UPDATE buildings SET collected_at = ? WHERE building_id = 'sawmill'").bind(Date.now() - 31 * 60000).run();
    const taps = await Promise.all([
      call('POST', '/api/camp/collect', { cookie, body: { buildingId: 'sawmill' } }),
      call('POST', '/api/camp/collect', { cookie, body: { buildingId: 'sawmill' } }),
    ]);
    const [won, lost] = taps.sort((a, b) => a.status - b.status);
    assert.deepEqual([won.status, won.data.collected.amount, lost.status], [200, 3, 409]);
    assert.equal((await character()).resources.wood, 3);
  });

  test('Skup złomu raises the prices', async () => {
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    await database
      .prepare("INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) VALUES (?, 'scrap-bench', 5, 0, 1)")
      .bind(id)
      .run();
    await fillBag(1, { rarityId: 'common', level: 10 });
    const view = await character();
    // Level 10, common: 10 gold, and 50% more at level 5.
    assert.equal(view.bag[0].price, 15);
    const sold = await call('POST', '/api/items/sell', { cookie, body: { maxRarity: 'common' } });
    assert.deepEqual(sold.data.sold, { count: 1, gold: 15 });
    assert.equal(sold.data.character.gold, supply.gold + 15);
  });

  test('resources found on an exploration go to the camp', async () => {
    // Four-hour explorations open at level 50.
    await (await db()).prepare('UPDATE characters SET level = 50, class_level = 2').run();
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 240 } });
    await finishHunt();
    const { report, character: after } = (await call('POST', '/api/hunts/claim', { cookie })).data;
    const found = report.summary.resources;
    assert.ok(Object.values(found).some((amount) => amount > 0));
    for (const [resource, amount] of Object.entries(after.resources)) {
      assert.equal(amount, (found[resource] ?? 0) + (supply.resources[resource] ?? 0));
    }
    assert.ok(report.entries.some((entry) => /\+\d+\.$/.test(entry.text) && entry.type === 'find'));
  });
});

describe('upgrades on the Kowadło', () => {
  let cookie;
  let itemId;
  beforeEach(async () => {
    cookie = await signUp();
    await newCharacter(cookie, 'warrior');
    const database = await db();
    const item = { base: 'chainmail', slot: 'chest', level: 5, rarity: 'common', affixes: [], armor: 15 };
    itemId = (
      await database
        .prepare('INSERT INTO items (character_id, slot, data, created_at) SELECT id, NULL, ?, 0 FROM characters')
        .bind(JSON.stringify(item))
        .run()
    ).meta.last_row_id;
  });

  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const stock = async (gold, resources) =>
    (await db()).prepare('UPDATE characters SET gold = ?, resources = ?').bind(gold, JSON.stringify(resources)).run();
  const upgrade = () => call('POST', `/api/items/${itemId}/upgrade`, { cookie });
  const anvilAt = async (level) =>
    (await db())
      .prepare(
        'INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) SELECT id, ?, ?, 0, 1 FROM characters WHERE true ON CONFLICT (character_id, building_id) DO UPDATE SET level = excluded.level',
      )
      .bind('anvil', level)
      .run();

  test('without the Kowadło an item cannot be upgraded', async () => {
    const bag = (await character()).bag;
    assert.deepEqual(bag[0].anvil, { level: 0, cap: 0, max: 10, next: null });
    const { status, data } = await upgrade();
    assert.equal(status, 409);
    assert.equal(data.error.code, 'anvil_level');
  });

  test('a try is paid in gold and iron ore, and moves the item a level up or keeps it at +0', async () => {
    await anvilAt(2);
    await stock(100, { wood: 0, stone: 0, 'iron-ore': 10 });
    const { status, data } = await upgrade();
    assert.equal(status, 200);
    assert.deepEqual(data.upgrade.cost, { gold: 8, 'iron-ore': 2 });
    assert.equal(data.character.gold, 92);
    assert.equal(data.character.resources['iron-ore'], 8);
    const item = data.character.bag.find((candidate) => candidate.id === itemId);
    if (data.upgrade.result === 'success') {
      assert.equal(item.upgrade, 1);
      assert.equal(item.name, 'Kolczuga');
      assert.deepEqual(item.properties, ['Pancerz: +16']);
    } else {
      assert.equal(data.upgrade.result, 'failure');
      assert.equal(item.upgrade, 0);
    }
  });

  test('the Kowadło caps the upgrade at its level, and the price must be there', async () => {
    await anvilAt(1);
    await (await db()).prepare("UPDATE items SET data = json_set(data, '$.upgrade', 1)").run();
    await stock(1000, { wood: 0, stone: 0, 'iron-ore': 100 });
    const capped = await upgrade();
    assert.equal(capped.data.error.code, 'anvil_level');
    assert.match(capped.data.error.message, /\+1/);
    await anvilAt(5);
    await stock(1, { wood: 0, stone: 0, 'iron-ore': 0 });
    assert.equal((await upgrade()).data.error.code, 'not_enough');
  });

  test('nothing is upgraded during an exploration, and the scrapper does not sell upgraded items by the handful', async () => {
    await anvilAt(3);
    await (await db()).prepare("UPDATE items SET data = json_set(data, '$.upgrade', 2)").run();
    const sale = await call('POST', '/api/items/sell', { cookie, body: { maxRarity: 'divine' } });
    assert.equal(sale.data.sold.count, 0);
    await stock(1000, { wood: 0, stone: 0, 'iron-ore': 100 });
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    assert.equal((await upgrade()).data.error.code, 'busy');
  });
});


describe('Time Points and the narrator', () => {
  let cookie;
  beforeEach(async () => {
    cookie = await signUp();
    await newCharacter(cookie, 'warrior');
  });

  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const skip = (target) => call('POST', '/api/time/skip', { cookie, body: { target } });
  const setPoints = async (points) => (await db()).prepare('UPDATE characters SET time_points = ?').bind(points).run();
  const start = content.balance.timePoints.start;

  test('a new character gets the Time Points of the narrator and the introduction', async () => {
    const view = await character();
    assert.equal(view.timePoints, start);
    assert.deepEqual(view.tutorial, []);
    const { data } = await call('GET', '/api/content');
    // Only the general parchments stand in the middle of the screen; the
    // others stand by the place they speak of.
    const cards = data.tutorial.lines.filter((line) => line.kind === 'card').map((line) => line.id);
    assert.deepEqual(cards, ['intro', 'purpose', 'test', 'report', 'ending']);
    assert.deepEqual([data.tutorial.hideLabel, data.tutorial.showLabel], ['Ukryj', 'Pokaż pergamin']);
    assert.equal(data.tutorial.startTimePoints, start);
    assert.equal(data.tutorial.$comment, undefined);
  });

  test('the points skip the whole exploration, and its report is the same as after waiting', async () => {
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30 } });
    const skipped = await skip('activity');
    assert.equal(skipped.status, 200);
    assert.equal(skipped.data.spent, 30);
    assert.equal(skipped.data.character.timePoints, start - 30);
    assert.ok(skipped.data.character.activity.endsAt <= Date.now());
    assert.equal(skipped.data.character.activity.finished, true);
    const claim = await call('POST', '/api/hunts/claim', { cookie });
    assert.equal(claim.status, 200);
    assert.equal(claim.data.character.timePoints, start - 30 + claim.data.report.summary.timePoints);
    assert.equal((await skip('activity')).data.error.code, 'nothing_to_skip');
  });

  test('fewer points than minutes make the wait that much shorter', async () => {
    await setPoints(10);
    const started = (await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30 } })).data.character;
    const skipped = await skip('activity');
    assert.equal(skipped.data.spent, 10);
    const activity = skipped.data.character.activity;
    assert.equal(started.activity.endsAt - activity.endsAt, 10 * 60000);
    assert.equal(activity.finished, false);
    assert.equal(skipped.data.character.timePoints, 0);
    assert.equal((await skip('activity')).data.error.code, 'no_time_points');
  });

  test('the points skip resting and a camp upgrade', async () => {
    const view = await character();
    await (await db()).prepare('UPDATE characters SET hp = 1, hp_at = ?').bind(Date.now()).run();
    const rested = await skip('rest');
    assert.equal(rested.status, 200);
    assert.ok(rested.data.spent > 0 && rested.data.spent <= start);
    assert.equal(rested.data.character.hp, view.maxHp);
    assert.equal(rested.data.character.timePoints, start - rested.data.spent);
    assert.equal((await skip('rest')).data.error.code, 'nothing_to_skip');

    // Ognisko level 1 takes a minute, paid from the abandoned camp's supply.
    assert.equal((await call('POST', '/api/camp/build', { cookie, body: { buildingId: 'campfire' } })).status, 201);
    const built = await skip('build');
    assert.equal(built.data.spent, 1);
    assert.equal(built.data.character.camp.construction, null);
    assert.equal(built.data.character.camp.buildings.find((building) => building.id === 'campfire').level, 1);
    assert.equal((await skip('build')).data.error.code, 'nothing_to_skip');
    assert.equal((await skip('everything')).data.error.code, 'invalid_target');
  });

  test('resting cannot be skipped during an exploration', async () => {
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    assert.equal((await skip('rest')).data.error.code, 'busy');
  });

  test('"Pomiń wprowadzenie" plays the first steps for the player: the same start either way', async () => {
    const skipped = await call('POST', '/api/tutorial', { cookie, body: { skip: true } });
    assert.equal(skipped.status, 200);
    const view = skipped.data.character;
    const reports = (await call('GET', '/api/reports', { cookie })).data.reports;
    // The first exploration, as long as the start allows, in Skraj Wiatrołomów:
    // skipped with Time Points as the narrator asks, its report claimed.
    assert.equal(reports.length, 1);
    assert.equal(reports[0].areaName, 'Skraj Wiatrołomów');
    assert.equal(reports[0].minutes, 30);
    assert.equal(view.activity, null);
    assert.equal(view.timePoints, start - 30 + reports[0].timePoints);
    assert.equal(view.level, reports[0].levelAfter);
    // The first weapon is worn and the Ognisko is built.
    assert.ok(view.equipment.weapon);
    assert.equal(view.camp.buildings.find((building) => building.id === 'campfire').level, 1);
    assert.equal(view.camp.construction, null);
    // Skipped once more, nothing else happens.
    assert.equal((await call('POST', '/api/tutorial', { cookie, body: { skip: true } })).data.character.timePoints, view.timePoints);
    assert.equal((await call('GET', '/api/reports', { cookie })).data.reports.length, 1);
  });

  test('skipped halfway, only the first steps not done yet are played', async () => {
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    const view = (await call('POST', '/api/tutorial', { cookie, body: { skip: true } })).data.character;
    const reports = (await call('GET', '/api/reports', { cookie })).data.reports;
    // The exploration already under way is the first one: skipped and claimed.
    assert.equal(reports.length, 1);
    assert.equal(reports[0].minutes, 5);
    assert.equal(view.timePoints, start - 5 + reports[0].timePoints);
    assert.equal(view.camp.buildings.find((building) => building.id === 'campfire').level, 1);
  });

  test('the narrator remembers the cards and pointers read, and "Pomiń wprowadzenie" marks them all', async () => {
    const see = (body) => call('POST', '/api/tutorial', { cookie, body });
    assert.deepEqual((await see({ card: 'intro' })).data.character.tutorial, ['intro']);
    assert.deepEqual((await see({ card: 'intro' })).data.character.tutorial, ['intro']);
    assert.deepEqual((await see({ card: 'purpose' })).data.character.tutorial, ['intro', 'purpose']);
    assert.deepEqual((await see({ card: 'report-summary' })).data.character.tutorial, ['intro', 'purpose', 'report-summary']);
    assert.equal((await see({ card: 'dragon' })).data.error.code, 'invalid_card');
    // A lead or a tap is done when the game moves on, so it is not kept.
    assert.equal((await see({ card: 'tap-region' })).data.error.code, 'invalid_card');
    assert.equal((await see({ card: 'lead-camp' })).data.error.code, 'invalid_card');
    const once = (await call('GET', '/api/content')).data.tutorial.lines.filter((line) => line.kind === 'card' || line.kind === 'point');
    assert.deepEqual((await see({ skip: true })).data.character.tutorial, once.map((line) => line.id));

    // A character from before the introduction never sees it.
    await (await db()).prepare('UPDATE characters SET tutorial = NULL').run();
    assert.equal((await character()).tutorial, null);
    assert.equal((await see({ card: 'intro' })).data.error.code, 'no_tutorial');
  });
});

describe('Stół rzemieślniczy', () => {
  let cookie;
  beforeEach(async () => {
    cookie = await signUp();
    await newCharacter(cookie, 'warrior');
  });

  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const craft = (body) => call('POST', '/api/craft/materials', { cookie, body });
  const salvage = (id) => call('POST', `/api/items/${id}/salvage`, { cookie });
  const tableAt = async (level) =>
    (await db())
      .prepare(
        "INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) SELECT id, 'craft-table', ?, 0, 1 FROM characters WHERE true ON CONFLICT (character_id, building_id) DO UPDATE SET level = excluded.level",
      )
      .bind(level)
      .run();
  const stockMaterials = async (materials) => (await db()).prepare('UPDATE characters SET materials = ?').bind(JSON.stringify(materials)).run();
  // The table's queue moved `minutes` into the past, as if they had passed.
  async function wait(minutes) {
    const database = await db();
    const { crafting } = await database.prepare('SELECT crafting FROM characters').first();
    const shift = (order) => ({ ...order, startsAt: order.startsAt - minutes * 60000, endsAt: order.endsAt - minutes * 60000 });
    await database.prepare('UPDATE characters SET crafting = ?').bind(JSON.stringify(JSON.parse(crafting).map(shift))).run();
  }
  async function bagItem(rarityId = 'rare', level = 25) {
    const item = generateItem({ baseId: 'helmet', level, rarityId }, createRng('rozbiórka'), content);
    const { meta } = await (await db())
      .prepare('INSERT INTO items (character_id, slot, data, created_at) SELECT id, NULL, ?, 0 FROM characters')
      .bind(JSON.stringify(item))
      .run();
    return { id: meta.last_row_id, item };
  }
  const parts = (view, id) => view.crafting.parts.find((part) => part.id === id).count;

  test('creatures leave materials, which wait at the table', async () => {
    // Four-hour explorations open at level 50.
    await (await db()).prepare('UPDATE characters SET level = 50, class_level = 2').run();
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 240 } });
    await finishHunt();
    const { report, character: after } = (await call('POST', '/api/hunts/claim', { cookie })).data;
    const found = report.summary.materials.map(({ key, count }) => [key, count]).sort();
    assert.ok(found.length > 0);
    assert.deepEqual(after.crafting.materials.map(({ key, count }) => [key, count]).sort(), found);
    assert.equal(after.crafting.pace, 0);
    // The fights name their materials, and items came only in chests.
    assert.deepEqual(report.fights.flatMap((fight) => fight.materials.map(({ key, count }) => [key, count])).length > 0, true);
    assert.ok(report.entries.some((entry) => /skrzyni|skrzynk|kuferek/.test(entry.text)));
  });

  test('without the table nothing is made; with it, materials become parts in time, for free', async () => {
    await stockMaterials({ 'wolf-pelt:common': 3, 'boar-tusk:rare': 1 });
    const none = await craft({ all: true });
    assert.deepEqual([none.status, none.data.error.code], [409, 'no_table']);
    await tableAt(1);
    const before = await character();
    const { status, data } = await craft({ keys: ['wolf-pelt:common'] });
    assert.deepEqual([status, data.ordered], [200, 1]);
    const view = data.character.crafting;
    assert.deepEqual(view.materials.map((material) => material.key), ['boar-tusk:rare']);
    // Three parts of 5 minutes, 10% faster at level 1: 14 minutes.
    const [order] = view.queue;
    assert.deepEqual([order.name, order.count, order.part, order.parts, (order.endsAt - order.startsAt) / 60000], ['Skóra wilka', 3, 'Ścinki', 3, 14]);
    assert.deepEqual([data.character.gold, data.character.resources], [before.gold, before.resources]);
    assert.equal(parts(data.character, 'scraps'), 0);
    await wait(14);
    const later = await character();
    assert.deepEqual([later.crafting.queue.length, parts(later, 'scraps')], [0, 3]);
    // The next order counts from now, and the parts made stay.
    await craft({ all: true });
    await wait(8);
    const last = await character();
    assert.deepEqual([parts(last, 'scraps'), parts(last, 'straps'), last.crafting.materials.length], [3, 1, 0]);
  });

  test('"Przerób wszystko" takes every stack while the queue has room', async () => {
    await tableAt(1);
    await stockMaterials(Object.fromEntries(content.materials.map((material) => [`${material.id}:${material.rarity}`, 2])));
    const { data } = await craft({ all: true });
    const limit = content.balance.crafting.queueLimit;
    assert.equal(data.ordered, limit);
    assert.equal(data.character.crafting.materials.length, content.materials.length - limit);
    const full = await craft({ all: true });
    assert.deepEqual([full.status, full.data.error.code], [409, 'queue_full']);
  });

  test('an item from the bag is taken apart into parts of its rarity', async () => {
    await tableAt(1);
    const { id, item } = await bagItem('rare', 25);
    const { status, data } = await salvage(id);
    assert.equal(status, 200);
    // 2 + 25 / 10: 4 Rzemienie, 8 minutes each, 10% faster.
    assert.deepEqual([data.salvage.name, data.salvage.part, data.salvage.parts], [itemName(item, content), 'Rzemienie', 4]);
    assert.equal(data.character.bag.length, 0);
    assert.equal(data.character.crafting.queue[0].endsAt - data.character.crafting.queue[0].startsAt, 29 * 60000);
    assert.equal((await salvage(id)).status, 404);
    await wait(29);
    assert.equal(parts(await character(), 'straps'), 4);
  });

  test('two taps on "Rozbierz" make one order', async () => {
    await tableAt(1);
    const { id } = await bagItem();
    const taps = await Promise.all([salvage(id), salvage(id)]);
    const [won, lost] = taps.sort((a, b) => a.status - b.status);
    assert.equal(won.status, 200);
    assert.ok([404, 409].includes(lost.status), `${lost.status}`);
    const view = await character();
    assert.equal(view.crafting.queue.length, 1);
    assert.equal(view.bag.length, 0);
  });

  test('a worn item, or anything during an exploration, cannot be taken apart; the table works on', async () => {
    await tableAt(1);
    const { id } = await bagItem('common', 3);
    await call('POST', `/api/items/${id}/equip`, { cookie });
    assert.equal((await salvage(id)).data.error.code, 'equipped');
    await call('POST', `/api/items/${id}/unequip`, { cookie });
    await stockMaterials({ 'fox-pelt:common': 1 });
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30 } });
    assert.equal((await salvage(id)).data.error.code, 'busy');
    assert.equal((await craft({ all: true })).status, 200);
  });

  test('"Pomiń czas" at the table in test mode ends every order', async () => {
    await tableAt(1);
    await stockMaterials({ 'wolf-pelt:common': 2, 'fox-pelt:rare': 1 });
    await craft({ all: true });
    const skipped = await call('POST', '/api/test/skip-craft', { cookie });
    assert.equal(skipped.status, 200);
    assert.deepEqual([skipped.data.character.crafting.queue.length, parts(skipped.data.character, 'scraps'), parts(skipped.data.character, 'straps')], [0, 2, 1]);
  });
});

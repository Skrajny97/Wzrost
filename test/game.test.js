// Character, items, hunts and reports through the API.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, test } from 'node:test';

import { createRng, generateItem, itemName, questPeriod, upgradeCost, xpToNext } from '../src/engine/index.js';
import { skipTime } from '../src/server/testing.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const { call, db, signUp: account } = useServer();
// What a new character finds in the abandoned camp (data/balance.json).
const supply = content.balance.startingSupply;

async function signUp(login = 'karol') {
  const { cookie } = await account(login);
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
    // Skills open at a class level, and the locked tab says which.
    assert.equal(data.unlocks.find((unlock) => unlock.id === 'skills').classLevel, 10);
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

  test('a character has a skin tone, chosen at the start and changed at any time', async () => {
    const wrong = await call('POST', '/api/character', { cookie, body: { name: 'Mira', classId: 'archer', appearance: 'female', skin: 'green' } });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.data.error.code, 'invalid_skin');
    const made = await call('POST', '/api/character', { cookie, body: { name: 'Mira', classId: 'archer', appearance: 'female', skin: 'dark' } });
    assert.equal(made.status, 201);
    assert.equal(made.data.character.skin, 'dark');
    const changed = await call('POST', '/api/character/skin', { cookie, body: { skin: 'golden' } });
    assert.equal(changed.status, 200);
    assert.equal(changed.data.character.skin, 'golden');
    assert.equal((await call('POST', '/api/character/skin', { cookie, body: { skin: 'green' } })).status, 400);
    // The tones reach the screen with their dots; one is the portrait as drawn.
    const { skins } = (await call('GET', '/api/content')).data;
    assert.ok(skins.tones.some((tone) => tone.id === skins.default));
    assert.equal(skins.tones.filter((tone) => tone.drawn).length, 1);
  });

  test('without a chosen skin tone the character starts in the default one', async () => {
    assert.equal((await newCharacter(cookie, 'archer', 'Mira', 'male')).data.character.skin, 'light');
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

  test('a later talisman waits for its class level, the first fits from the start', async () => {
    const stoneId = await addItem({ base: 'holed-stone', slot: 'talisman', level: 1, rarity: 'common', affixes: [], implicit: { stat: 'vitality', value: 2 } });
    const charmId = await addItem({ base: 'talisman', slot: 'talisman', level: 1, rarity: 'common', affixes: [], implicit: { stat: 'vitality', value: 1 } });
    const early = await call('POST', `/api/items/${stoneId}/equip`, { cookie });
    assert.equal(early.status, 403);
    assert.equal(early.data.error.code, 'class_level');
    assert.equal(early.data.error.message, 'Ten przedmiot założysz od poziomu klasy 10.');
    const bag = (await call('GET', '/api/character', { cookie })).data.character.bag;
    assert.equal(bag.find((item) => item.id === stoneId).classLevel, 10);
    assert.equal(bag.find((item) => item.id === stoneId).name, 'Otoczak');
    assert.equal(bag.find((item) => item.id === charmId).classLevel, null);
    assert.equal((await call('POST', `/api/items/${charmId}/equip`, { cookie })).status, 200);
    await (await db()).prepare('UPDATE characters SET class_level = 10').run();
    assert.equal((await call('POST', `/api/items/${stoneId}/equip`, { cookie })).data.character.equipment.talisman.name, 'Otoczak');
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

  test('an exploration can avoid the elite and the champion, or seek them, each with its own threat', async () => {
    const options = await call('GET', '/api/hunts/options?area=windfalls-edge', { cookie });
    const { threat, threatAvoiding, threatSeeking } = options.data.areas[0];
    assert.deepEqual(Object.keys(threatAvoiding), Object.keys(threat));
    assert.deepEqual(Object.keys(threatSeeking), Object.keys(threat));
    const wrong = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30, avoidRare: 'tak' } });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.data.error.code, 'invalid_avoid');
    const started = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30, avoidRare: true } });
    assert.equal(started.status, 201);
    assert.equal(started.data.character.activity.avoidRare, true);
    const row = await (await db()).prepare('SELECT avoid_rare FROM activities').first();
    assert.equal(row.avoid_rare, 1);
    await call('POST', '/api/test/skip-time', { cookie });
    const claim = await call('POST', '/api/hunts/claim', { cookie });
    assert.ok(claim.data.report.fights.every((fight) => !fight.elite && !fight.champion));
    // Seeking them instead ("Trop elity i czempiony"); not both at once.
    const both = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30, avoidRare: true, seekRare: true } });
    assert.equal(both.status, 400);
    assert.equal(both.data.error.code, 'invalid_rare');
    const odd = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30, seekRare: 1 } });
    assert.equal(odd.data.error.code, 'invalid_seek');
    const seeking = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30, seekRare: true } });
    assert.equal(seeking.status, 201);
    assert.equal(seeking.data.character.activity.seekRare, true);
    assert.equal(seeking.data.character.activity.avoidRare, false);
    assert.equal((await (await db()).prepare('SELECT seek_rare FROM activities').first()).seek_rare, 1);
    await call('POST', '/api/test/skip-time', { cookie });
    assert.equal((await call('POST', '/api/hunts/claim', { cookie })).status, 200);
    // Without the choice the exploration goes as before.
    const plain = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30 } });
    assert.equal(plain.data.character.activity.avoidRare, false);
    assert.equal(plain.data.character.activity.seekRare, false);
  });

  test('an exploration can track the creatures of the quests', async () => {
    const quest = (target, progress = 0) => ({ kind: 'kill', target, count: 2, progress, reward: { kind: 'gold', amount: 5 }, claimed: false });
    const stored = JSON.parse((await (await db()).prepare('SELECT quests FROM characters').first()).quests);
    stored.daily.quests = [quest('fox'), quest('wolf', 2), quest('bear')];
    stored.weekly.quests = [];
    await (await db()).prepare('UPDATE characters SET quests = ?').bind(JSON.stringify(stored)).run();
    const wrong = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30, trackQuests: 'tak' } });
    assert.equal(wrong.data.error.code, 'invalid_track');
    // Only the fox: the wolves are beaten already and no bear lives on the edge.
    const started = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30, trackQuests: true } });
    assert.equal(started.status, 201);
    assert.equal(started.data.character.activity.tracksQuests, true);
    assert.equal((await (await db()).prepare('SELECT tracked FROM activities').first()).tracked, '["fox"]');
    await call('POST', '/api/test/skip-time', { cookie });
    assert.equal((await call('POST', '/api/hunts/claim', { cookie })).status, 200);
    // With no quest creature living there, nothing is tracked.
    stored.daily.quests = [quest('bear')];
    await (await db()).prepare('UPDATE characters SET quests = ?').bind(JSON.stringify(stored)).run();
    const none = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30, trackQuests: true } });
    assert.equal(none.data.character.activity.tracksQuests, false);
    assert.equal((await (await db()).prepare('SELECT tracked FROM activities').first()).tracked, null);
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

  test("starts with nine buildings at level 0, the abandoned camp's supply and a bag of 30", async () => {
    const start = await character();
    assert.deepEqual(
      start.camp.buildings.map((building) => [building.id, building.level]),
      [['sawmill', 0], ['quarry', 0], ['mine', 0], ['midas-lake', 0], ['campfire', 0], ['loot-shed', 0], ['scrap-bench', 0], ['anvil', 0], ['craft-table', 0]],
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
      ['Tartak', 'Kamieniołom', 'Kopalnia', 'Staw Midasa', 'Ognisko', 'Magazyn', 'Skup złomu', 'Kowadło', 'Stół rozbiórki'],
    );
  });

  test('the camp grows for gold alone, slowly, one level at a time up to 10, and then builds faster', async () => {
    const start = (await character()).camp.level;
    assert.deepEqual([start.id, start.name, start.level, start.maxLevel, start.effect], ['camp', 'Obóz', 1, 10, 'Budowy w zwykłym tempie']);
    assert.deepEqual(start.next, { level: 2, effect: 'Budowy szybsze o 10%', minutes: 240, cost: { gold: 500 } });
    assert.equal(start.evolution, null);
    // Gold alone: wood or stone do not help.
    await stock(499, { wood: 999, stone: 999, 'iron-ore': 999 });
    assert.equal((await build('camp')).data.error.code, 'not_enough');
    await stock(520, {});
    const started = await build('camp');
    assert.equal(started.status, 201);
    const running = started.data.character.camp.construction;
    assert.deepEqual([running.buildingId, running.name, running.level, running.endsAt - running.startedAt], ['camp', 'Obóz', 2, 4 * 3600000]);
    assert.equal(started.data.character.gold, 20);
    // It is a build like a building's: the Ognisko now waits for its end.
    await stock(100, { wood: 20 });
    const queued = await build('campfire');
    assert.equal(queued.status, 201);
    assert.deepEqual(queued.data.character.camp.queue.map((entry) => [entry.buildingId, entry.level, entry.startsAt]), [['campfire', 1, running.endsAt]]);
    await (await db()).prepare("UPDATE characters SET build_queue = '[]'").run();
    await finishBuilding();
    const grown = await character();
    assert.deepEqual([grown.camp.level.level, grown.camp.level.effect, grown.camp.level.next.cost], [2, 'Budowy szybsze o 10%', { gold: 1000 }]);
    // The buildings build 10% faster: the crafting table's 10 minutes to level 2 take 9.
    const table = (view) => view.camp.buildings.find((building) => building.id === 'craft-table');
    await (await db()).prepare("INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) SELECT id, 'craft-table', 1, 0, 1 FROM characters").run();
    assert.equal(table(await character()).next.minutes, 9);
    // The highest level leaves only the village to come.
    await (await db()).prepare("UPDATE buildings SET level = 10 WHERE building_id = 'camp'").run();
    const top = (await character()).camp.level;
    assert.deepEqual([top.level, top.next, top.effect], [10, null, 'Budowy szybsze o 90%']);
    assert.match(top.evolution, /Wioską/);
    await stock(10 ** 9, {});
    assert.equal((await build('camp')).data.error.code, 'max_level');
  });

  test('a building is paid in gold and resources and takes time', async () => {
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
    // Until the end the building keeps its old level.
    const campfire = (view) => view.camp.buildings.find((building) => building.id === 'campfire');
    assert.equal(campfire(started.data.character).level, 0);

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

  // Time passes for the camp: the builds, their stores and the queue move back.
  async function travel(ms) {
    const database = await db();
    await database
      .prepare('UPDATE buildings SET started_at = started_at - ?, ends_at = ends_at - ?, collected_at = collected_at - ?')
      .bind(ms, ms, ms)
      .run();
    const { build_queue: queue } = await database.prepare('SELECT build_queue FROM characters').first();
    const moved = JSON.parse(queue).map((entry) => ({ ...entry, startsAt: entry.startsAt - ms, endsAt: entry.endsAt - ms }));
    await database.prepare('UPDATE characters SET build_queue = ?').bind(JSON.stringify(moved)).run();
  }
  const find = (view, id) => view.camp.buildings.find((building) => building.id === id);

  test('up to three builds at once: the others wait in the queue, paid at once, and start one after another', async () => {
    await stock(1000, { wood: 200, stone: 100, 'iron-ore': 50 });
    const first = await build('sawmill');
    const running = first.data.character.camp.construction;
    assert.equal((await build('quarry')).status, 201);
    const third = await build('sawmill');
    assert.equal(third.status, 201);
    const { camp } = third.data.character;
    assert.deepEqual(camp.queue.map((entry) => [entry.buildingId, entry.name, entry.level]), [['quarry', 'Kamieniołom', 1], ['sawmill', 'Tartak', 2]]);
    assert.equal(camp.queue[0].startsAt, running.endsAt);
    assert.equal(camp.queue[1].startsAt, camp.queue[0].endsAt);
    assert.deepEqual([camp.underWay, camp.queueSize], [3, 3]);
    // Each was paid when it was queued: the Tartak twice and the Kamieniołom once.
    assert.equal(third.data.character.gold, 1000 - 8 - 8 - 16);
    assert.deepEqual(third.data.character.resources, { wood: 200 - 6 - 8 - 11, stone: 100 - 3 - 3, 'iron-ore': 50 });
    // The Tartak's next level comes after the queue.
    assert.deepEqual([find(third.data.character, 'sawmill').next.level, find(third.data.character, 'sawmill').queued], [3, [2]]);
    // A fourth build does not fit, and a waiting one cannot be paid twice.
    const fourth = await build('mine');
    assert.equal(fourth.data.error.code, 'queue_full');
    assert.equal((await character()).gold, 968);

    // The build under way skipped ("Pomiń czas"): the next one starts at once.
    const skipped = (await call('POST', '/api/test/skip-build', { cookie })).data.character;
    assert.equal(skipped.camp.construction.buildingId, 'quarry');
    assert.deepEqual(skipped.camp.queue.map((entry) => [entry.buildingId, entry.level]), [['sawmill', 2]]);
    assert.equal(skipped.camp.queue[0].startsAt, skipped.camp.construction.endsAt);
    assert.equal(find(skipped, 'sawmill').level, 1);
    // There is room again.
    assert.equal((await build('mine')).status, 201);

    // Hours later everything has started and ended by itself.
    await travel(3 * 3600000);
    const later = await character();
    assert.equal(later.camp.construction, null);
    assert.deepEqual(later.camp.queue, []);
    assert.deepEqual(['sawmill', 'quarry', 'mine'].map((id) => find(later, id).level), [2, 1, 1]);
  });

  test('a waiting build starts at its own time: the store made until then goes to the resources', async () => {
    await stock(3000, { wood: 100, stone: 50 });
    for (const id of ['craft-table', 'sawmill']) {
      await build(id);
      await call('POST', '/api/test/skip-build', { cookie });
    }
    // The Tartak works while the camp grows for 4 hours, then its upgrade starts.
    assert.equal((await build('camp')).status, 201);
    await build('sawmill');
    const queued = (await build('craft-table')).data.character;
    const [upgrade, table] = queued.camp.queue;
    assert.deepEqual([upgrade.buildingId, upgrade.level, upgrade.startsAt], ['sawmill', 2, queued.camp.construction.endsAt]);
    // They build in the camp the growth leaves behind: the table's 10 minutes take 9.
    assert.deepEqual([table.buildingId, table.level, table.endsAt - table.startsAt], ['craft-table', 2, 9 * 60000]);
    const wood = queued.resources.wood;
    await travel(4 * 3600000 + 30 * 60000);
    const later = await character();
    assert.equal(later.camp.level.level, 2);
    assert.equal(later.camp.construction?.buildingId ?? null, null);
    // Its store was full (2 hours, 12 wood) when the upgrade started, and went to the resources.
    assert.equal(later.resources.wood, wood + 12);
    assert.deepEqual([find(later, 'sawmill').level, find(later, 'craft-table').level], [2, 2]);
  });

  test('"Anuluj" gives a waiting build its whole cost back, with the higher levels that need it', async () => {
    await stock(1000, { wood: 200, stone: 100, 'iron-ore': 50 });
    const cost = (id, level) => upgradeCost(content.buildingsById[id], level);
    await build('sawmill');
    await build('sawmill');
    const before = (await build('quarry')).data.character;
    const [sawmill, quarry] = before.camp.queue;
    assert.deepEqual([sawmill.cost, quarry.cost], [cost('sawmill', 2), cost('quarry', 1)]);
    // The Tartak's level 2 called off: what it cost comes back, and the
    // Kamieniołom moves up to start as the build under way ends.
    const cancelled = await call('POST', '/api/camp/cancel', { cookie, body: { buildingId: 'sawmill', level: 2 } });
    assert.equal(cancelled.status, 200);
    assert.deepEqual(cancelled.data.refund, cost('sawmill', 2));
    const after = cancelled.data.character;
    assert.equal(after.gold, before.gold + cost('sawmill', 2).gold);
    assert.deepEqual(after.resources, { wood: before.resources.wood + cost('sawmill', 2).wood, stone: before.resources.stone + cost('sawmill', 2).stone, 'iron-ore': 50 });
    assert.deepEqual(after.camp.queue.map((entry) => [entry.buildingId, entry.level, entry.startsAt]), [['quarry', 1, before.camp.construction.endsAt]]);
    assert.equal(find(after, 'sawmill').next.level, 2);
    assert.equal((await call('POST', '/api/camp/cancel', { cookie, body: { buildingId: 'sawmill', level: 2 } })).data.error.code, 'not_queued');
    // A level with a higher one waiting after it takes that one along.
    await build('quarry');
    const both = (await call('POST', '/api/camp/cancel', { cookie, body: { buildingId: 'quarry', level: 1 } })).data;
    assert.deepEqual(both.cancelled, [{ buildingId: 'quarry', level: 1 }, { buildingId: 'quarry', level: 2 }]);
    assert.deepEqual(both.refund, { gold: cost('quarry', 1).gold + cost('quarry', 2).gold, wood: cost('quarry', 1).wood + cost('quarry', 2).wood, stone: cost('quarry', 1).stone + cost('quarry', 2).stone });
    assert.deepEqual(both.character.camp.queue, []);
    assert.equal(both.character.gold, 1000 - cost('sawmill', 1).gold);
  });

  test('a camp level called off makes the builds after it slow again', async () => {
    await stock(3000, { wood: 100, stone: 50 });
    await build('craft-table');
    await call('POST', '/api/test/skip-build', { cookie });
    await build('sawmill');
    await build('camp');
    const fast = (await build('craft-table')).data.character.camp.queue[1];
    assert.equal(fast.endsAt - fast.startsAt, 9 * 60000);
    const slow = (await call('POST', '/api/camp/cancel', { cookie, body: { buildingId: 'camp', level: 2 } })).data.character.camp.queue[0];
    assert.deepEqual([slow.buildingId, slow.level, slow.endsAt - slow.startsAt], ['craft-table', 2, 10 * 60000]);
  });

  test('a full queue in a growing camp: the camp too can wait in the queue', async () => {
    await stock(5000, { wood: 100, stone: 50 });
    await build('campfire');
    assert.equal((await build('camp')).status, 201);
    const view = (await build('camp')).data.character;
    assert.deepEqual(view.camp.queue.map((entry) => [entry.buildingId, entry.level]), [['camp', 2], ['camp', 3]]);
    assert.deepEqual([view.camp.level.next.level, view.camp.level.queued], [4, [2, 3]]);
    assert.equal(view.gold, 5000 - 5 - 500 - 1000);
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
    assert.deepEqual([store(ready).paused, store(ready).perHour, store(ready).capacity], [false, 6, 12]);
    assert.equal((await call('POST', '/api/camp/collect', { cookie, body: { buildingId: 'sawmill' } })).data.error.code, 'nothing_to_collect');
    assert.equal((await call('POST', '/api/camp/collect', { cookie, body: { buildingId: 'campfire' } })).data.error.code, 'invalid_building');

    // With nothing being built, "Pomiń czas" fills the stores.
    const full = await call('POST', '/api/test/skip-build', { cookie });
    assert.equal(store(full.data.character).amount, 12);
    const collected = await call('POST', '/api/camp/collect', { cookie, body: { buildingId: 'sawmill' } });
    assert.equal(collected.status, 200);
    assert.deepEqual(collected.data.collected, { resource: 'wood', amount: 12 });
    assert.equal(collected.data.character.resources.wood, 12);
    assert.equal(collected.data.character.gold, 200 - 8);
    assert.equal((await call('POST', '/api/camp/collect', { cookie, body: { buildingId: 'sawmill' } })).data.error.code, 'nothing_to_collect');

    // An upgrade first collects the store: level 2 costs 16 gold, 11 wood and 3 stone.
    await stock(192, { wood: 11, stone: 3 });
    await call('POST', '/api/test/skip-build', { cookie });
    const upgraded = await build('sawmill');
    assert.equal(upgraded.status, 201);
    assert.deepEqual(upgraded.data.character.resources, { wood: 11 + 12 - 11, stone: 0, 'iron-ore': 0 });
    assert.equal(upgraded.data.character.gold, 192 - 16);
    assert.deepEqual([store(upgraded.data.character).paused, store(upgraded.data.character).amount], [true, 0]);
  });

  test('the fire spirit trades gold for resources up to the pieces of a day, cheaper with each level', async () => {
    const trade = (resource, amount) => call('POST', '/api/camp/trade', { cookie, body: { resource, amount } });
    const fire = (view) => view.camp.buildings.find((building) => building.id === 'campfire').trade;
    await stock(3000, {});
    // Before the Ognisko stands there is no trade.
    assert.equal(fire(await character()), null);
    assert.equal((await trade('wood', 1)).data.error.code, 'not_built');
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    await database.prepare("INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) VALUES (?, 'campfire', 3, 0, 1)").bind(id).run();
    // Level 3: 9 gold a piece, 250 pieces a day.
    const open = fire(await character());
    assert.deepEqual([open.title, open.resources, open.unitGold, open.perDay, open.left], ['Duch ognia', ['wood', 'stone', 'iron-ore'], 9, 250, 250]);
    assert.deepEqual(open.next, { level: 4, unitGold: 8, perDay: 250 });
    assert.equal((await trade('gold', 1)).status, 400);
    assert.equal((await trade('wood')).data.error.code, 'invalid_amount');
    const first = await trade('wood', 50);
    assert.equal(first.status, 200);
    assert.deepEqual(first.data.traded, { resource: 'wood', amount: 50, gold: 450 });
    assert.deepEqual([first.data.character.gold, first.data.character.resources.wood, fire(first.data.character).left], [2550, 50, 200]);
    // Two taps at once: each trade made is paid and counted once.
    const taps = await Promise.all([trade('stone', 10), trade('stone', 10)]);
    const made = taps.filter((tap) => tap.status === 200).length;
    const tapped = await character();
    assert.ok(made >= 1);
    assert.deepEqual([tapped.gold, tapped.resources.stone, fire(tapped).left], [2550 - 90 * made, 10 * made, 200 - 10 * made]);
    // More than is left today is refused; all that is left goes in one trade.
    const left = fire(tapped).left;
    assert.equal((await trade('iron-ore', left + 1)).data.error.code, 'invalid_amount');
    const rest = await trade('iron-ore', left);
    assert.equal(rest.status, 200);
    assert.deepEqual([rest.data.character.gold, fire(rest.data.character).left], [2550 - 90 * made - 9 * left, 0]);
    assert.equal((await trade('wood', 1)).data.error.code, 'no_trades');
    const spent = await character();
    assert.equal(Object.values(spent.resources).reduce((sum, amount) => sum + amount, 0), 250);
    // A new day brings the pieces back; without the gold there is none.
    await database.prepare("UPDATE characters SET fire_day = '2000-01-01'").run();
    assert.equal(fire(await character()).left, 250);
    await stock(449, {});
    assert.equal((await trade('wood', 50)).data.error.code, 'not_enough');
    const small = await trade('wood', 5);
    assert.deepEqual(small.data.traded, { resource: 'wood', amount: 5, gold: 45 });
    assert.deepEqual([small.data.character.gold, fire(small.data.character).left], [404, 245]);
    assert.equal((await trade('wood', 45)).data.error.code, 'not_enough');
  });

  test('the scrap dealer sells parts for gold, rarer and cheaper ones with each level of the Skup złomu', async () => {
    const buy = (partId, count) => call('POST', '/api/camp/buy', { cookie, body: { partId, count } });
    const shop = (view) => view.camp.buildings.find((building) => building.id === 'scrap-bench').shop;
    const owned = (view, partId) => view.crafting.parts.find((part) => part.id === partId).count;
    await stock(1000, {});
    // Before the Skup złomu stands there is nothing to buy.
    assert.equal(shop(await character()), null);
    assert.equal((await buy('scraps', 1)).data.error.code, 'not_built');
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    await database.prepare("INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) VALUES (?, 'scrap-bench', 2, 0, 1)").bind(id).run();
    // Level 2: Ścinki and Rzemienie, and Okucia at the next level.
    const open = shop(await character());
    assert.deepEqual([open.title, open.counts, open.parts], ['Lada złomiarza', [1, 10], [{ id: 'scraps', price: 38 }, { id: 'straps', price: 75 }]]);
    assert.deepEqual(open.next, { level: 3, added: [{ id: 'fittings', name: 'Okucia', gender: 'pl' }], discount: 0.06 });
    assert.equal((await buy('fittings', 1)).data.error.code, 'not_sold');
    assert.equal((await buy('scraps', 5)).status, 400);
    assert.equal((await buy('constructor', 1)).status, 400);
    const first = await buy('scraps', 10);
    assert.equal(first.status, 200);
    assert.deepEqual(first.data.bought, { partId: 'scraps', count: 10, gold: 380 });
    assert.deepEqual([first.data.character.gold, owned(first.data.character, 'scraps')], [620, 10]);
    // Two taps at once: each purchase made is paid once.
    const taps = await Promise.all([buy('straps', 1), buy('straps', 1)]);
    const made = taps.filter((tap) => tap.status === 200).length;
    const tapped = await character();
    assert.ok(made >= 1);
    assert.deepEqual([tapped.gold, owned(tapped, 'straps'), owned(tapped, 'scraps')], [620 - 75 * made, made, 10]);
    await stock(74, {});
    assert.equal((await buy('straps', 1)).data.error.code, 'not_enough');
    assert.equal((await buy('scraps', 1)).status, 200);
  });

  test('Staw Midasa fills its store with gold, which goes to the gold, also when an upgrade collects it', async () => {
    await stock(500, { wood: 50, stone: 20, 'iron-ore': 20 });
    const lake = (view) => view.camp.buildings.find((building) => building.id === 'midas-lake');
    const built = await build('midas-lake');
    assert.equal(built.status, 201);
    assert.equal(built.data.character.gold, 500 - 10);
    await call('POST', '/api/test/skip-build', { cookie });
    const ready = lake(await character());
    assert.deepEqual([ready.production.resource, ready.production.perHour, ready.production.capacity], ['gold', 4, 8]);
    assert.equal(ready.effect, 'Odsącza 4 złota na godzinę, magazyn na 2\u00a0h produkcji');
    // A full store goes to the gold, not to the resources.
    await call('POST', '/api/test/skip-build', { cookie });
    const collected = await call('POST', '/api/camp/collect', { cookie, body: { buildingId: 'midas-lake' } });
    assert.equal(collected.status, 200);
    assert.deepEqual(collected.data.collected, { resource: 'gold', amount: 8 });
    assert.equal(collected.data.character.gold, 490 + 8);
    assert.equal(collected.data.character.resources.gold, undefined);
    // An upgrade first collects the store, into the gold that pays for it:
    // level 2 costs 20 gold, 15 wood and 8 stone.
    await call('POST', '/api/test/skip-build', { cookie });
    const upgraded = await build('midas-lake');
    assert.equal(upgraded.status, 201);
    assert.equal(upgraded.data.character.gold, 498 + 8 - 20);
    assert.equal(upgraded.data.character.resources.gold, undefined);
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

  test('the scrapper buys one item from its card, an upgraded one too, but not a worn one', async () => {
    const plain = (await character()).bag.find((item) => item.id === itemId).price;
    await (await db()).prepare("UPDATE items SET data = json_set(data, '$.upgrade', 2)").run();
    await stock(10, { wood: 0, stone: 0, 'iron-ore': 0 });
    const before = await character();
    const price = before.bag.find((item) => item.id === itemId).price;
    // Half the gold its upgrades cost comes on top.
    assert.ok(price > plain);
    const sold = await call('POST', `/api/items/${itemId}/sell`, { cookie });
    assert.equal(sold.status, 200);
    assert.deepEqual(sold.data.sold, { count: 1, gold: price });
    assert.equal(sold.data.character.gold, 10 + price);
    assert.deepEqual(sold.data.character.bag, []);
    assert.equal((await call('POST', `/api/items/${itemId}/sell`, { cookie })).data.error.code, 'item_not_found');
    // A worn item stays on.
    const mail = { base: 'chainmail', slot: 'chest', level: 5, rarity: 'common', affixes: [], armor: 15 };
    await (await db()).prepare("INSERT INTO items (character_id, slot, data, created_at) SELECT id, 'chest', ?, 0 FROM characters").bind(JSON.stringify(mail)).run();
    const worn = (await character()).equipment.chest;
    assert.equal((await call('POST', `/api/items/${worn.id}/sell`, { cookie })).data.error.code, 'equipped');
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
    const cards = data.tutorial.lines.filter((line) => line.kind === 'card' && !line.chapter).map((line) => line.id);
    assert.deepEqual(cards, ['ask', 'intro', 'purpose', 'test', 'report', 'ending']);
    // The first card asks whether to go through the introduction.
    assert.deepEqual([data.tutorial.startLabel, data.tutorial.recommendedLabel, data.tutorial.skipLabel], ['Wprowadź mnie', 'zalecane', 'Pomiń wprowadzenie']);
    // The first card is the author's: signed so, with no narrator and no recording.
    const ask = data.tutorial.lines[0];
    assert.deepEqual([ask.id, ask.speaker, ask.voice ?? null, data.tutorial.authorLabel], ['ask', 'author', null, 'Autor']);
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

  test('a Punkt Czasu comes every half an hour by itself, also while away, and counts once', async () => {
    const view = await character();
    assert.equal(view.timePointsGain.minutes, 30);
    assert.ok(Math.abs(view.timePointsGain.since - Date.now()) < 60000);
    // 95 minutes away: three points, and the next one 25 minutes on. Two
    // requests at once add them once.
    const database = await db();
    const since = Date.now() - 95 * 60000;
    await database.prepare('UPDATE characters SET time_points_at = ?').bind(since).run();
    for (const seen of await Promise.all([character(), character()])) {
      assert.equal(seen.timePoints, start + 3);
      assert.equal(seen.timePointsGain.since, since + 90 * 60000);
    }
    assert.deepEqual(await database.prepare('SELECT time_points, time_points_at FROM characters').first(), {
      time_points: start + 3,
      time_points_at: since + 90 * 60000,
    });
    assert.equal((await character()).timePoints, start + 3);
  });

  test('a point that came while away can be spent at once', async () => {
    await setPoints(0);
    await (await db()).prepare('UPDATE characters SET time_points_at = ?').bind(Date.now() - 31 * 60000).run();
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30 } });
    const skipped = await skip('activity');
    assert.equal(skipped.data.spent, 1);
    assert.equal(skipped.data.character.timePoints, 0);
  });

  test('characters made before the half-hour points start counting at the migration', async () => {
    const database = await db();
    await database.prepare('ALTER TABLE characters DROP COLUMN time_points_at').run();
    const migration = readFileSync('migrations/0016_time_points_clock.sql', 'utf8')
      .replace(/--.*$/gm, '')
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);
    await database.batch(migration.map((statement) => database.prepare(statement)));
    const view = await character();
    assert.equal(view.timePoints, start);
    assert.ok(Math.abs(view.timePointsGain.since - Date.now()) < 5000);
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
    // A lead marked once, whose tap changes no screen (the wallet), is kept.
    assert.deepEqual((await see({ card: 'wallet' })).data.character.tutorial, ['intro', 'purpose', 'report-summary', 'wallet']);
    const once = (await call('GET', '/api/content')).data.tutorial.lines.filter((line) => (line.kind === 'card' || line.kind === 'point' || line.once) && !line.chapter);
    assert.deepEqual((await see({ skip: true })).data.character.tutorial, once.map((line) => line.id));

    // A character from before the introduction never sees it.
    await (await db()).prepare('UPDATE characters SET tutorial = NULL').run();
    assert.equal((await character()).tutorial, null);
    assert.equal((await see({ card: 'intro' })).data.error.code, 'no_tutorial');
  });

  test('the Umiejętności chapter after the introduction keeps its lines apart', async () => {
    const see = (body) => call('POST', '/api/tutorial', { cookie, body });
    const { tutorial } = (await call('GET', '/api/content')).data;
    const kept = (line) => line.kind === 'card' || line.kind === 'point' || line.once;
    const intro = tutorial.lines.filter((line) => kept(line) && !line.chapter).map((line) => line.id);
    const chapter = tutorial.lines.filter((line) => kept(line) && line.chapter === 'skills').map((line) => line.id);
    assert.deepEqual(chapter, ['skills-welcome', 'skills-intro', 'skills-paths', 'skills-card', 'skills-choice', 'skills-points', 'skills-evolution', 'skills-ending']);
    // The chapter's lines come after the introduction's ending.
    assert.ok(tutorial.lines.findIndex((line) => line.chapter) > tutorial.lines.findIndex((line) => line.id === 'ending'));
    assert.deepEqual(tutorial.chapters.skills, { skipLabel: 'Pomiń objaśnienie', skippedText: 'Objaśnienie pominięte. Umiejętności czekają w zakładce Postać.' });
    // Each class has its own words where the narrator speaks of the class.
    for (const id of ['skills-welcome', 'skills-paths']) {
      const line = tutorial.lines.find((candidate) => candidate.id === id);
      assert.deepEqual(Object.keys(line.classes).sort(), content.classes.map((cls) => cls.id).sort());
      assert.equal(line.text, undefined);
    }
    // "Pomiń wprowadzenie" leaves the chapter for its moment.
    assert.deepEqual((await see({ skip: true })).data.character.tutorial, intro);
    assert.deepEqual((await see({ card: 'skills-welcome' })).data.character.tutorial, [...intro, 'skills-welcome']);
    // A lead of the chapter is not kept.
    assert.equal((await see({ card: 'skills-lead' })).data.error.code, 'invalid_card');
    // The chapter's own "Pomiń" marks only its lines and plays nothing.
    const reports = (await call('GET', '/api/reports', { cookie })).data.reports.length;
    assert.deepEqual((await see({ skip: true, chapter: 'skills' })).data.character.tutorial, [...intro, ...chapter]);
    assert.equal((await call('GET', '/api/reports', { cookie })).data.reports.length, reports);
    // Skipped once more, the introduction keeps the chapter read.
    assert.deepEqual((await see({ skip: true })).data.character.tutorial, [...intro, ...chapter]);
    assert.equal((await see({ skip: true, chapter: 'dragons' })).data.error.code, 'invalid_chapter');
  });

  test('test mode starts the Umiejętności chapter again, with the skills forgotten', async () => {
    const see = (body) => call('POST', '/api/tutorial', { cookie, body });
    const intro = (await see({ skip: true })).data.character.tutorial;
    await see({ skip: true, chapter: 'skills' });
    await (await db()).prepare(`UPDATE characters SET class_level = 12, skills = '{"power-strike":2}'`).run();
    const before = await character();
    assert.equal(before.skills.points, 1);
    const again = await call('POST', '/api/test/skills-tour', { cookie });
    assert.equal(again.status, 200);
    assert.deepEqual(again.data.character.tutorial, intro);
    // The skill is forgotten and its points come back.
    assert.ok(again.data.character.skills.pools.every((pool) => pool.chosen.length === 0));
    assert.equal(again.data.character.skills.points, 3);
  });

  test('the Profesje chapter comes after the Umiejętności and keeps its lines apart', async () => {
    const see = (body) => call('POST', '/api/tutorial', { cookie, body });
    const { tutorial } = (await call('GET', '/api/content')).data;
    const kept = (line) => line.kind === 'card' || line.kind === 'point' || line.once;
    const ids = (chapter) => tutorial.lines.filter((line) => kept(line) && line.chapter === chapter).map((line) => line.id);
    const intro = tutorial.lines.filter((line) => kept(line) && !line.chapter).map((line) => line.id);
    const chapter = ids('professions');
    assert.deepEqual(chapter, ['professions-welcome', 'professions-intro', 'professions-list', 'professions-ending']);
    // Its lines stand after those of the Umiejętności, which come first.
    const at = (id) => tutorial.lines.findIndex((line) => line.id === id);
    assert.ok(at('professions-welcome') > at('skills-ending'));
    assert.deepEqual(tutorial.chapters.professions, { skipLabel: 'Pomiń objaśnienie', skippedText: 'Objaśnienie pominięte. Profesje czekają w zakładce Profesje.' });
    // The lead to the tab is not kept, and "Pomiń objaśnienie" marks only this chapter.
    await see({ skip: true });
    assert.equal((await see({ card: 'professions-lead' })).data.error.code, 'invalid_card');
    assert.deepEqual((await see({ skip: true, chapter: 'professions' })).data.character.tutorial, [...intro, ...chapter]);
    // The lines read keep the order of the data.
    assert.deepEqual((await see({ skip: true, chapter: 'skills' })).data.character.tutorial, [...intro, ...ids('skills'), ...chapter]);
  });

  test('test mode starts the Profesje chapter again, with the professions kept', async () => {
    const see = (body) => call('POST', '/api/tutorial', { cookie, body });
    const intro = (await see({ skip: true })).data.character.tutorial;
    await see({ skip: true, chapter: 'skills' });
    const skills = (await see({ skip: true, chapter: 'professions' })).data.character.tutorial.filter((id) => !id.startsWith('professions-'));
    const professions = '{"herbalism":{"level":3,"xp":20}}';
    await (await db()).prepare('UPDATE characters SET level = 12, professions = ?').bind(professions).run();
    const again = await call('POST', '/api/test/professions-tour', { cookie });
    assert.equal(again.status, 200);
    assert.deepEqual(again.data.character.tutorial, skills);
    assert.ok(skills.length > intro.length);
    // Only the narrator starts again: the levels stay.
    const row = await (await db()).prepare('SELECT professions FROM characters').first();
    assert.equal(row.professions, professions);
  });
});

describe('Stół rozbiórki', () => {
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

  test('the table takes higher rarities with its levels, and a stack too rare waits', async () => {
    await tableAt(1);
    await stockMaterials({ 'wolf-pelt:common': 2, 'lynx-fur:unique': 1 });
    const rare = await craft({ keys: ['lynx-fur:unique'] });
    assert.deepEqual([rare.status, rare.data.error.code], [409, 'too_rare']);
    assert.match(rare.data.error.message, /na poziomie 2\./);
    const view = (await character()).crafting;
    assert.deepEqual([view.level, view.maxRarity], [1, 'rare']);
    assert.deepEqual(view.materials.map(({ key, needs, minutes }) => [key, needs, minutes === null]), [
      ['wolf-pelt:common', null, false],
      ['lynx-fur:unique', 2, true],
    ]);
    const { data } = await craft({ all: true });
    assert.deepEqual([data.ordered, data.skipped], [1, 1]);
    // An item takes the same levels: an epic one from level 3.
    const { id } = await bagItem('epic', 10);
    assert.equal((await character()).bag[0].salvage.needs, 3);
    const early = await salvage(id);
    assert.deepEqual([early.status, early.data.error.code], [409, 'too_rare']);
    await tableAt(3);
    assert.equal((await salvage(id)).status, 200);
  });

  test('from level 6 an order may bring extra parts, which come when it ends', async () => {
    await tableAt(10);
    await stockMaterials({ 'wolf-pelt:common': 40 });
    const { data } = await craft({ all: true });
    // A quarter of a part for each of the 40 at level 10.
    const [order] = data.character.crafting.queue;
    assert.deepEqual([order.parts, order.bonus], [40, 10]);
    await wait((order.endsAt - order.startsAt) / 60000);
    assert.equal(parts(await character(), 'scraps'), 50);
  });

  test('the Runy made before the rename become Odłamki, kept and on the table', async () => {
    const database = await db();
    const order = { id: 'a1', kind: 'item', name: 'Miecz', rarity: 'epic', partId: 'runes', parts: 2, startsAt: 0, endsAt: Date.now() + 3600000 };
    await database.prepare('UPDATE characters SET parts = ?, crafting = ?').bind(JSON.stringify({ runes: 3, scraps: 1 }), JSON.stringify([order])).run();
    const migration = readFileSync('migrations/0017_shards.sql', 'utf8')
      .replace(/--.*$/gm, '')
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);
    await database.batch(migration.map((statement) => database.prepare(statement)));
    assert.deepEqual(JSON.parse((await database.prepare('SELECT parts FROM characters').first()).parts), { scraps: 1, shards: 3 });
    const view = await character();
    assert.deepEqual([parts(view, 'shards'), parts(view, 'scraps'), view.crafting.queue[0].part], [3, 1, 'Odłamki']);
  });

  test('"Przerób wszystko" takes every stack while the queue has room', async () => {
    await tableAt(5);
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

describe('Bestiariusz', () => {
  let cookie;
  beforeEach(async () => {
    cookie = await signUp();
    await newCharacter(cookie, 'warrior');
  });

  const fought = (report) => [...new Set(report.fights.flatMap((fight) => fight.enemies.map((enemy) => enemy.monsterId)))].sort();
  async function hunt() {
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30 } });
    await finishHunt();
    return (await call('POST', '/api/hunts/claim', { cookie })).data;
  }

  test('every inner region lists its creatures, and those fought become known', async () => {
    const { data } = await call('GET', '/api/content');
    const edge = data.regions[0].areas.find((area) => area.id === 'windfalls-edge');
    assert.deepEqual(edge.dangers.map((danger) => danger.monsterId), ['wolf', 'fox', 'viper', 'badger', 'wisp']);
    assert.deepEqual([edge.dangers[0].name, edge.dangers[0].minLevel, edge.dangers[0].maxLevel], ['Wilk', 1, 5]);
    assert.deepEqual(edge.dangers.at(-1).elite, true);
    assert.deepEqual((await call('GET', '/api/character', { cookie })).data.character.met, []);
    const { report, character } = await hunt();
    assert.ok(fought(report).length > 0);
    assert.deepEqual([...character.met].sort(), fought(report));
  });

  test('characters made before know the creatures of the reports they keep', async () => {
    const { report } = await hunt();
    const database = await db();
    await database.prepare('ALTER TABLE characters DROP COLUMN met').run();
    const migration = readFileSync('migrations/0018_met_monsters.sql', 'utf8')
      .replace(/--.*$/gm, '')
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);
    await database.batch(migration.map((statement) => database.prepare(statement)));
    const { character } = (await call('GET', '/api/character', { cookie })).data;
    assert.deepEqual([...character.met].sort(), fought(report));
  });

  test('its chest opens once every creature of the inner region is met, once', async () => {
    const { data } = await call('GET', '/api/content');
    assert.deepEqual(data.regions[0].areas[0].chest, { gold: 30, timePoints: 5, systemPoints: 20 });
    const open = (area) => call('POST', '/api/bestiary/chest', { cookie, body: { area } });
    const before = (await call('GET', '/api/character', { cookie })).data.character;
    assert.deepEqual(before.bestiary, []);
    assert.equal((await open('nowhere')).status, 404);
    const database = await db();
    await database.prepare('UPDATE characters SET met = ?').bind(JSON.stringify(['wolf', 'fox', 'viper', 'badger'])).run();
    const shut = await open('windfalls-edge');
    assert.deepEqual([shut.status, shut.data.error.code], [409, 'not_ready']);
    await database.prepare('UPDATE characters SET met = ?').bind(JSON.stringify(['wolf', 'fox', 'viper', 'badger', 'wisp'])).run();
    const opened = await open('windfalls-edge');
    assert.equal(opened.status, 200);
    assert.deepEqual(opened.data.chest, { gold: 30, timePoints: 5, systemPoints: 20 });
    assert.equal(opened.data.character.gold, before.gold + 30);
    assert.equal(opened.data.character.timePoints, before.timePoints + 5);
    assert.equal(opened.data.character.systemPoints, before.systemPoints + 20);
    assert.deepEqual(opened.data.character.bestiary, ['windfalls-edge']);
    const again = await open('windfalls-edge');
    assert.deepEqual([again.status, again.data.error.code], [409, 'opened']);
    // Another inner region's list is not full with these.
    assert.equal((await open('fox-ravines')).data.error.code, 'not_ready');
  });

  test('chests opened before the Punkty Systemu get them once, by the migration', async () => {
    const database = await db();
    await database.prepare(`UPDATE characters SET bestiary = '["windfalls-edge","fox-ravines"]', system_points = 3`).run();
    const migration = readFileSync('migrations/0034_bestiary_system_points.sql', 'utf8').replace(/--.*$/gm, '').trim();
    await database.prepare(migration).run();
    assert.equal((await call('GET', '/api/character', { cookie })).data.character.systemPoints, 3 + 2 * 20);
  });
});

describe('Awans', () => {
  test('a new character or class level heals fully when the report is claimed', async () => {
    const cookie = await signUp();
    await newCharacter(cookie, 'warrior');
    // One XP short of level 2: the fights hurt, and the level heals.
    await (await db()).prepare('UPDATE characters SET xp = ?').bind(xpToNext(1, content) - 1).run();
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    await finishHunt();
    const { report, character } = (await call('POST', '/api/hunts/claim', { cookie })).data;
    assert.ok(character.level >= 2);
    assert.equal(character.hp, character.maxHp);
    assert.ok(report.system.includes('Awansowałaś. Twoje HP i Mana odnowiły się.'));
  });
});

describe('Zadania od narratora', () => {
  let cookie;
  beforeEach(async () => {
    cookie = await signUp();
    await newCharacter(cookie, 'warrior');
  });

  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const claim = (period, index) => call('POST', '/api/quests/claim', { cookie, body: { period, index } });
  const claimAll = (period) => call('POST', '/api/quests/claim-all', { cookie, body: { period } });
  const chest = (period) => call('POST', '/api/quests/chest', { cookie, body: { period } });
  const stored = async () => JSON.parse((await (await db()).prepare('SELECT quests FROM characters').first()).quests);
  const store = async (quests) => (await db()).prepare('UPDATE characters SET quests = ?').bind(JSON.stringify(quests)).run();
  // Every quest of a period done, as if its work had been done.
  async function finishAll(periodId) {
    const quests = await stored();
    quests[periodId].quests = quests[periodId].quests.map((quest) => ({ ...quest, progress: quest.count }));
    await store(quests);
  }

  test('a new character gets five daily and five weekly quests, which end at midnight Polish time', async () => {
    const created = await newCharacter(await signUp('ola'), 'mage', 'Ola');
    assert.equal(created.data.character.quests.daily.quests.length, 5);
    const view = (await character()).quests;
    const now = Date.now();
    for (const periodId of ['daily', 'weekly']) {
      assert.equal(view[periodId].quests.length, content.quests.periods[periodId].count);
      assert.equal(view[periodId].endsAt, questPeriod(periodId, now, content).endsAt);
      assert.ok(view[periodId].quests.every((quest) => quest.progress === 0 && !quest.done && !quest.claimed && quest.text.endsWith('.')));
      assert.deepEqual(view[periodId].chest, { ...content.quests.periods[periodId].chest, ready: false, opened: false });
    }
    assert.deepEqual([view.daily.name, view.weekly.name], ['Dzienne', 'Tygodniowe']);
    // Drawn once and saved: the next request shows the same quests.
    assert.equal((await stored()).daily.period, questPeriod('daily', now, content).key);
    assert.deepEqual((await character()).quests, view);
  });

  test('the creatures beaten and the minutes of a claimed exploration move the quests on', async () => {
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30 } });
    await finishHunt();
    const { report, character: after } = (await call('POST', '/api/hunts/claim', { cookie })).data;
    const beaten = {};
    for (const fight of report.fights.filter((candidate) => candidate.won === true)) {
      for (const enemy of fight.enemies) beaten[enemy.monsterId] = (beaten[enemy.monsterId] ?? 0) + 1;
    }
    for (const quest of [...after.quests.daily.quests, ...after.quests.weekly.quests]) {
      const expected = quest.kind === 'kill' ? (beaten[quest.monsterId] ?? 0) : quest.kind === 'explore' ? 30 : 0;
      assert.equal(quest.progress, Math.min(quest.count, expected), quest.text);
    }
  });

  test("the table's work counts: materials handed over and items taken apart", async () => {
    const quests = await stored();
    const quest = (kind, count) => ({ kind, count, progress: 0, reward: { kind: 'gold', amount: 5 }, claimed: false });
    quests.daily.quests = [quest('process', 4), quest('salvage', 1)];
    await store(quests);
    const database = await db();
    await database
      .prepare("INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) SELECT id, 'craft-table', 1, 0, 1 FROM characters")
      .run();
    await database.prepare('UPDATE characters SET materials = ?').bind(JSON.stringify({ 'wolf-pelt:common': 3 })).run();
    const item = generateItem({ baseId: 'helmet', level: 3, rarityId: 'common' }, createRng('zadanie'), content);
    const { meta } = await database.prepare('INSERT INTO items (character_id, slot, data, created_at) SELECT id, NULL, ?, 0 FROM characters').bind(JSON.stringify(item)).run();
    await call('POST', '/api/craft/materials', { cookie, body: { all: true } });
    const after = (await call('POST', `/api/items/${meta.last_row_id}/salvage`, { cookie })).data.character;
    assert.deepEqual(after.quests.daily.quests.map((entry) => [entry.progress, entry.done]), [[3, false], [1, true]]);
  });

  test('a quest done gives its reward once: gold, a resource or parts', async () => {
    const quests = await stored();
    const rewards = [{ kind: 'resource', id: 'iron-ore', amount: 7 }, { kind: 'gold', amount: 40 }, { kind: 'part', id: 'scraps', amount: 2 }];
    quests.daily.quests = quests.daily.quests.map((quest, index) => ({ ...quest, progress: index < 3 ? quest.count : 0, reward: rewards[index] ?? quest.reward }));
    await store(quests);
    const before = await character();
    assert.equal((await claim('daily', 3)).data.error.code, 'not_done');
    const ore = await claim('daily', 0);
    assert.equal(ore.status, 200);
    assert.deepEqual(ore.data.reward, rewards[0]);
    assert.equal(ore.data.character.resources['iron-ore'], before.resources['iron-ore'] + 7);
    assert.equal((await claim('daily', 0)).data.error.code, 'claimed');
    assert.equal((await claim('daily', 1)).data.character.gold, before.gold + 40);
    const parts = (await claim('daily', 2)).data.character.crafting.parts.find((part) => part.id === 'scraps').count;
    assert.equal(parts, 2);
    const after = await character();
    assert.deepEqual(after.quests.daily.quests.map((quest) => quest.claimed), [true, true, true, false, false]);
    assert.equal((await claim('monthly', 0)).status, 400);
    assert.equal((await claim('daily', 9)).status, 404);
    assert.equal((await claim('daily', '0')).status, 404);
  });

  test('"Odbierz wszystkie" takes every reward of the period done and not taken yet, summed', async () => {
    const quests = await stored();
    const rewards = [
      { kind: 'resource', id: 'iron-ore', amount: 7 },
      { kind: 'gold', amount: 40 },
      { kind: 'resource', id: 'iron-ore', amount: 3 },
      { kind: 'part', id: 'scraps', amount: 2 },
    ];
    quests.daily.quests = quests.daily.quests.map((quest, index) => ({ ...quest, progress: index < 4 ? quest.count : 0, reward: rewards[index] ?? quest.reward }));
    await store(quests);
    const before = await character();
    assert.equal((await claim('daily', 3)).status, 200);
    const all = await claimAll('daily');
    assert.equal(all.status, 200);
    assert.deepEqual(all.data.rewards, rewards.slice(0, 3));
    const after = all.data.character;
    assert.equal(after.resources['iron-ore'], before.resources['iron-ore'] + 10);
    assert.equal(after.gold, before.gold + 40);
    assert.equal(after.crafting.parts.find((part) => part.id === 'scraps').count, 2);
    assert.deepEqual(after.quests.daily.quests.map((quest) => quest.claimed), [true, true, true, true, false]);
    // The week's quests and the chest wait for their own taps.
    assert.ok(after.quests.weekly.quests.every((quest) => !quest.claimed));
    assert.equal(after.quests.daily.chest.opened, false);
    assert.equal((await claimAll('daily')).data.error.code, 'nothing_to_claim');
    assert.equal((await claimAll('weekly')).data.error.code, 'nothing_to_claim');
    assert.equal((await claimAll('monthly')).status, 400);
  });

  test('two taps on "Odbierz wszystkie" give the rewards once', async () => {
    const quests = await stored();
    quests.daily.quests = quests.daily.quests.map((quest) => ({ ...quest, progress: quest.count, reward: { kind: 'gold', amount: 10 } }));
    await store(quests);
    const before = await character();
    const taps = await Promise.all([claimAll('daily'), claimAll('daily')]);
    assert.deepEqual(taps.map((tap) => tap.status).sort(), [200, 409]);
    assert.equal((await character()).gold, before.gold + 10 * quests.daily.quests.length);
  });

  test('all the daily quests done open the chest: Punkty Czasu and Punkty Systemu, once', async () => {
    const before = await character();
    assert.equal((await chest('daily')).data.error.code, 'not_ready');
    await finishAll('daily');
    assert.equal((await character()).quests.daily.chest.ready, true);
    const opened = await chest('daily');
    assert.equal(opened.status, 200);
    assert.deepEqual(opened.data.chest, { timePoints: 30, systemPoints: 5, item: null });
    assert.equal(opened.data.character.timePoints, before.timePoints + 30);
    assert.equal(opened.data.character.systemPoints, before.systemPoints + 5);
    assert.equal(opened.data.character.quests.daily.chest.opened, true);
    assert.equal((await chest('daily')).data.error.code, 'opened');
    // The quests' own rewards wait to be claimed.
    assert.ok(opened.data.character.quests.daily.quests.every((quest) => quest.done && !quest.claimed));
  });

  test('the weekly chest also holds an item of the level for the class, with room in the backpack', async () => {
    await (await db()).prepare('UPDATE characters SET level = 14, class_level = 12').run();
    await finishAll('weekly');
    const database = await db();
    const filler = JSON.stringify(generateItem({ baseId: 'ring', level: 1 }, createRng('pełno'), content));
    await database.batch(
      Array.from({ length: content.balance.items.bagSlots }, () => database.prepare('INSERT INTO items (character_id, slot, data, created_at) SELECT id, NULL, ?, 0 FROM characters').bind(filler)),
    );
    assert.equal((await chest('weekly')).data.error.code, 'bag_full');
    await database.prepare('DELETE FROM items WHERE id = (SELECT MIN(id) FROM items)').run();
    const before = await character();
    const opened = await chest('weekly');
    assert.equal(opened.status, 200);
    const { chest: inside, character: after } = opened.data;
    assert.equal(after.timePoints, before.timePoints + 120);
    assert.equal(after.systemPoints, before.systemPoints + 20);
    const found = after.bag.find((item) => item.name === inside.item.name && item.level === 14);
    assert.ok(found, 'the item is in the backpack');
    assert.ok(Object.keys(content.quests.levels[0].chestRarities).includes(found.rarity));
    assert.ok(found.classIds === null || found.classIds.includes('warrior'));
    assert.equal(after.bag.length, content.balance.items.bagSlots);
  });

  test('two taps on the chest open it once', async () => {
    await finishAll('daily');
    const before = await character();
    const taps = await Promise.all([chest('daily'), chest('daily')]);
    assert.deepEqual(taps.map((tap) => tap.status).sort(), [200, 409]);
    assert.equal((await character()).systemPoints, before.systemPoints + 5);
  });

  test("a new day draws new quests and keeps the week's; old characters get theirs on the first request", async () => {
    const quests = await stored();
    const week = quests.weekly;
    await store({ ...quests, daily: { ...quests.daily, period: '2000-01-01', quests: quests.daily.quests.map((quest) => ({ ...quest, progress: quest.count })) } });
    const view = (await character()).quests;
    assert.ok(view.daily.quests.every((quest) => quest.progress === 0));
    const now = await stored();
    assert.equal(now.daily.period, questPeriod('daily', Date.now(), content).key);
    assert.deepEqual(now.weekly, week);
    await (await db()).prepare("UPDATE characters SET quests = '{}'").run();
    assert.equal((await character()).quests.weekly.quests.length, 5);
    assert.ok((await stored()).weekly.period);
  });
});

describe('Pierwsza wyprawa', () => {
  test('the first exploration brings one plain weapon of the class, worn at once, and nothing else to wear', async () => {
    const cookie = await signUp();
    await newCharacter(cookie, 'mage');
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30 } });
    await finishHunt();
    const { report, character } = (await call('POST', '/api/hunts/claim', { cookie })).data;
    assert.equal(report.result, 'success');
    assert.equal(report.summary.itemsFound, 1);
    assert.equal(character.equipment.weapon.rarity, 'common');
    assert.ok(content.classesById.mage.weapons.includes(character.equipment.weapon.base));
    assert.deepEqual(character.bag, []);
    assert.ok(report.fights.every((fight) => !fight.elite && !fight.tough));
  });
});

describe('Profesje', () => {
  // In the game from version 0.0.9: Zielarstwo and Alchemia open with the tab
  // at character level 10, while Rzemieślnictwo waits as "Wkrótce" (CRAFTING
  // off in wrangler.jsonc); the test version opens it (test/workshop.test.js).
  test('open at level 10 with Zielarstwo and Alchemia, Rzemieślnictwo coming soon', async () => {
    const cookie = await signUp();
    await newCharacter(cookie);
    await (await db()).prepare('UPDATE characters SET level = 9').run();
    assert.equal((await call('GET', '/api/character', { cookie })).data.character.professions, null);
    await (await db()).prepare('UPDATE characters SET level = 10').run();
    const { professions } = (await call('GET', '/api/character', { cookie })).data.character;
    assert.deepEqual(professions.list.map(({ id, soon }) => [id, soon]), [['herbalism', false], ['alchemy', false], ['crafting', true]]);
    assert.equal(professions.workshop, null);
  });
});

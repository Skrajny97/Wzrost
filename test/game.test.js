// Character, items, hunts and reports through the API.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { useServer } from './helpers/server.js';

const { call, db } = useServer();

async function signUp(login = 'karol') {
  const { cookie } = await call('POST', '/api/auth/register', { body: { login, password: 'tajnehaslo1' } });
  return cookie;
}

async function newCharacter(cookie, classId = 'warrior', name = 'Mira') {
  return call('POST', '/api/character', { cookie, body: { name, classId } });
}

// Moves the current hunt into the past, as if its time had passed.
async function finishHunt() {
  await (await db()).prepare('UPDATE activities SET started_at = started_at - 86400000, ends_at = ?').bind(Date.now() - 1).run();
}

describe('content', () => {
  test('describes classes, regions and durations for the page', async () => {
    const { status, data } = await call('GET', '/api/content');
    assert.equal(status, 200);
    assert.deepEqual(data.classes.map((cls) => cls.id), ['warrior', 'archer', 'mage', 'cleric', 'shadow']);
    assert.deepEqual(data.classes.filter((cls) => cls.gentleStart).map((cls) => cls.name), ['Wojownik', 'Kleryk']);
    assert.deepEqual(data.durations, [5, 15, 30, 60, 120, 240]);
    assert.equal(data.regions[0].name, 'Wiatrołomy');
    assert.equal(data.stats.length, 8);
    assert.equal(data.unlocks.find((unlock) => unlock.id === 'professions').level, 6);
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

  test('creates a level 1 character with full HP and no items', async () => {
    const { status, data } = await newCharacter(cookie, 'warrior', '  Mira   z Boru ');
    assert.equal(status, 201);
    const character = data.character;
    assert.equal(character.name, 'Mira z Boru');
    assert.equal(character.className, 'Wojownik');
    assert.equal(character.level, 1);
    assert.equal(character.hp, character.maxHp);
    assert.equal(character.freePoints, 0);
    assert.deepEqual(Object.values(character.equipment).filter(Boolean), []);
    assert.deepEqual(character.bag, []);
    assert.match(character.combat.damage, /^\d+–\d+$/);
    assert.equal(character.stats.find((stat) => stat.id === 'strength').sources.class, 8);
    assert.equal(character.stats.find((stat) => stat.id === 'vitality').perPoint.maxHp, 5);
    assert.ok(character.hoursToNext > 0.4 && character.hoursToNext < 0.7);
  });

  test('"Zacznij od nowa" removes the character, so a new one can be made', async () => {
    await newCharacter(cookie, 'mage');
    await call('POST', '/api/hunts', { cookie, body: { regionId: 'windfalls', minutes: 5 } });
    const removed = await call('DELETE', '/api/character', { cookie });
    assert.equal(removed.status, 200);
    assert.equal((await call('GET', '/api/character', { cookie })).data.error.code, 'no_character');
    const rows = await (await db()).prepare('SELECT (SELECT COUNT(*) FROM characters) AS c, (SELECT COUNT(*) FROM activities) AS a').first();
    assert.deepEqual(rows, { c: 0, a: 0 });
    assert.equal((await newCharacter(cookie, 'archer', 'Druga')).status, 201);
  });

  test('allows one character per account and checks the input', async () => {
    assert.equal((await newCharacter(cookie)).status, 201);
    assert.equal((await newCharacter(cookie)).data.error.code, 'character_exists');
    const other = await signUp('inny');
    assert.equal((await newCharacter(other, 'warrior', 'X')).data.error.code, 'invalid_name');
    assert.equal((await newCharacter(other, 'warrior', 'Bob<script>')).data.error.code, 'invalid_name');
    assert.equal((await newCharacter(other, 'necromancer')).data.error.code, 'invalid_class');
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

  test('"Rozdaj według klasy" spends everything and reset is free up to level 10', async () => {
    const auto = await call('POST', '/api/character/points/auto', { cookie });
    assert.equal(auto.data.character.freePoints, 0);
    assert.equal(auto.data.character.canResetPoints, true);
    const reset = await call('POST', '/api/character/points/reset', { cookie });
    assert.equal(reset.data.character.freePoints, 18);
    await (await db()).prepare('UPDATE characters SET level = 11').run();
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

  test('options show a threat level for every region and duration', async () => {
    const { status, data } = await call('GET', '/api/hunts/options', { cookie });
    assert.equal(status, 200);
    assert.deepEqual(data.regions.map((region) => region.id), ['windfalls', 'stone-glade']);
    assert.deepEqual(Object.keys(data.regions[0].threat), ['5', '15', '30', '60', '120', '240']);
    assert.equal(data.regions[0].threat['5'], 'low');
    assert.equal(data.regions[1].threat['240'], 'very-high');

    const one = await call('GET', '/api/hunts/options?region=windfalls', { cookie });
    assert.deepEqual(one.data.regions.map((region) => region.id), ['windfalls']);
    assert.deepEqual(one.data.regions[0].threat, data.regions[0].threat);
    assert.equal((await call('GET', '/api/hunts/options?region=moon', { cookie })).status, 400);
  });

  test('a hunt runs on server time and pays out once, after it ends', async () => {
    const start = await call('POST', '/api/hunts', { cookie, body: { regionId: 'windfalls', minutes: 30 } });
    assert.equal(start.status, 201);
    const activity = start.data.character.activity;
    assert.equal(activity.regionName, 'Wiatrołomy');
    assert.equal(activity.endsAt - activity.startedAt, 30 * 60000);
    assert.equal(activity.finished, false);

    assert.equal((await call('POST', '/api/hunts', { cookie, body: { regionId: 'windfalls', minutes: 5 } })).data.error.code, 'busy');
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
    assert.equal(report.regionName, 'Wiatrołomy');
    assert.ok(['success', 'escaped'].includes(report.result));
    assert.ok(report.summary.xp > 0);
    assert.ok(report.fights[report.keyFight.index].events.length > 0);
    assert.ok(report.fights.every((fight) => fight.allies.length === 1 && fight.enemies.length >= 1));
    assert.equal(character.activity, null);
    assert.equal(character.gold, report.summary.gold);
    assert.equal(character.bag.length, report.items.length);
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
    await call('POST', '/api/hunts', { cookie, body: { regionId: 'windfalls', minutes: 5 } });
    await finishHunt();
    const { data } = await call('POST', '/api/hunts/claim', { cookie });
    const rows = await database.prepare('SELECT COUNT(*) AS count, MAX(id) AS newest, MIN(created_at) AS oldest FROM reports').first();
    assert.equal(rows.count, 50);
    assert.equal(rows.newest, data.report.id);
    // The 49 newest of the old ones stay: 7 to 55.
    assert.equal(rows.oldest, 7);
  });

  test('level 1 hunts are short; long ones open at level 2', async () => {
    const before = (await call('GET', '/api/character', { cookie })).data.character;
    assert.deepEqual(before.huntDurations, [5, 15, 30]);
    assert.deepEqual(before.features, []);
    const locked = await call('POST', '/api/hunts', { cookie, body: { regionId: 'windfalls', minutes: 60 } });
    assert.equal(locked.status, 403);
    assert.equal(locked.data.error.code, 'duration_locked');

    await (await db()).prepare('UPDATE characters SET level = 2').run();
    const after = (await call('GET', '/api/character', { cookie })).data.character;
    assert.deepEqual(after.huntDurations, [5, 15, 30, 60, 120, 240]);
    assert.deepEqual(after.features, ['long-hunts', 'stats']);
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { regionId: 'windfalls', minutes: 240 } })).status, 201);
  });

  test('a hunt can be called off early, without rewards', async () => {
    await call('POST', '/api/hunts', { cookie, body: { regionId: 'windfalls', minutes: 30 } });
    const cancel = await call('POST', '/api/hunts/cancel', { cookie });
    assert.equal(cancel.status, 200);
    assert.equal(cancel.data.character.activity, null);
    assert.equal(cancel.data.character.gold, 0);
    assert.equal((await call('POST', '/api/hunts/cancel', { cookie })).data.error.code, 'no_activity');
  });

  test('checks the region and the duration', async () => {
    const region = await call('POST', '/api/hunts', { cookie, body: { regionId: 'moon', minutes: 60 } });
    assert.equal(region.data.error.code, 'invalid_region');
    const minutes = await call('POST', '/api/hunts', { cookie, body: { regionId: 'windfalls', minutes: 7 } });
    assert.equal(minutes.data.error.code, 'invalid_duration');
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

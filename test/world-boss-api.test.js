// The World Bossy through the API (src/server/world-boss.js; the author:
// 1222–1226 A): one boss for each band of levels and week, with HP for the
// band's active characters and one bar for all of them; three attacks a
// day; a character's band written down with its first attack of the week
// and kept, whatever its levels do; the hit that fells the boss, with the
// last blow and the titles of the best ten in the profile and the Ranking;
// the chests each character opens on its own visit, half as big when the
// boss lived through the week, with the last blow's item and gold; a full
// bag keeping a chest with items shut.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { createRng, generateItem, questPeriod, worldBossBandOf, worldBossDamage, worldBossHp, worldBossPart } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rules = content.worldBosses;
const HOUR = 3600000;

describe('the World Boss through the API', () => {
  const { call, db, signUp } = useServer();
  const cookies = {};
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();

  // A character of `level` and `classLevel`, its account seen an hour ago.
  async function player(login, name, level = 40, classLevel = level, appearance = 'female') {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance } });
    await run('UPDATE characters SET level = ?, class_level = ?, gold = 5000 WHERE name = ?', level, classLevel, name);
    await run('UPDATE users SET seen_at = ? WHERE login = ?', Date.now() - HOUR, login);
  }
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const attack = (login) => as(login, 'POST', '/api/world-boss/attack');
  const view = async (login) => (await as(login, 'GET', '/api/world-boss')).data;
  const characterId = async (name) => (await first('SELECT id FROM characters WHERE name = ?', name)).id;
  const week = () => questPeriod('weekly', Date.now(), content).key;

  beforeEach(async () => {
    await player('lowczyni', 'Łowczyni', 40);
    await player('tropiciel', 'Tropiciel', 30, 45, 'male');
  });

  test('below its unlock, no World Boss', async () => {
    await player('nowicjusz', 'Nowicjusz', content.unlocksById['world-boss'].level - 1);
    const locked = await as('nowicjusz', 'GET', '/api/world-boss');
    assert.equal(locked.status, 403);
    assert.equal(locked.data.error.code, 'locked');
    assert.equal((await attack('nowicjusz')).status, 403);
  });

  test('a band\'s boss of the week: HP for the band\'s active characters, the same for all of them, one row for the band', async () => {
    // Someone of another band, someone not seen for long and one below the unlock count not.
    await player('daleki', 'Daleki', 120);
    await player('dawny', 'Dawny', 41);
    await run("UPDATE users SET seen_at = ? WHERE login = 'dawny'", Date.now() - 30 * 86400000);
    await player('mlody', 'Mlody', 10, 30);
    const seen = await view('lowczyni');
    const band = worldBossBandOf('stone-glade', content);
    assert.equal(seen.boss.id, 'wb-kotolak');
    assert.equal(seen.boss.region, 'stone-glade');
    assert.deepEqual(seen.boss.band, { min: 26, max: 50, last: false });
    assert.equal(seen.boss.level, 40);
    assert.equal(seen.boss.players, 2);
    assert.equal(seen.boss.maxHp, worldBossHp(band, [40, 45], content).maxHp);
    assert.equal(seen.boss.hp, seen.boss.maxHp);
    assert.equal(seen.boss.maxHp, Math.round(rules.hp.attacksPerPlayer * (worldBossDamage(40, content) + worldBossDamage(45, content))));
    assert.equal(seen.boss.week, week());
    assert.equal(seen.boss.sprite, 'lynx');
    assert.deepEqual(seen.attacks, { left: rules.attacksPerDay, perDay: rules.attacksPerDay, blocked: null });
    assert.deepEqual(seen.top, []);
    assert.equal(seen.own, null);
    assert.deepEqual(seen.chests, []);
    assert.ok(seen.texts.rules.length > 0 && !seen.texts.rules.join(' ').includes('{'));
    // Tropiciel's class level puts it in the same band, the boss fights it at 45.
    const other = await view('tropiciel');
    assert.equal(other.boss.maxHp, seen.boss.maxHp);
    assert.equal(other.boss.level, 45);
    assert.equal((await first('SELECT COUNT(*) AS count FROM world_bosses')).count, 1);
    // Daleki's band has a boss of its own.
    assert.equal((await view('daleki')).boss.id, 'wb-triglav-steed');
    assert.equal((await first('SELECT COUNT(*) AS count FROM world_bosses')).count, 2);
  });

  test('three attacks a day; the HP goes down for the whole band and the best of the week show who hit how much', async () => {
    let damage = 0;
    for (let left = rules.attacksPerDay - 1; left >= 0; left--) {
      const hit = await attack('lowczyni');
      assert.equal(hit.status, 200, JSON.stringify(hit.data).slice(0, 300));
      assert.equal(hit.data.attacks.left, left);
      assert.ok(hit.data.attack.log.length > 0);
      assert.ok(hit.data.attack.fight.enemies.length === 1);
      damage += hit.data.attack.damage;
    }
    const spent = await attack('lowczyni');
    assert.equal(spent.status, 409);
    assert.equal(spent.data.error.code, 'no_attacks');
    const other = await view('tropiciel');
    assert.equal(other.boss.hp, other.boss.maxHp - damage);
    assert.deepEqual(other.top, [{ place: 1, name: 'Łowczyni', classId: 'warrior', damage, hits: 3, own: false }]);
    assert.equal(other.fighters, 1);
    const mine = await view('lowczyni');
    assert.equal(mine.own.damage, damage);
    assert.equal(mine.own.hits, 3);
    assert.equal(mine.own.place, 1);
    assert.ok(['small', 'medium', 'large', 'huge'].includes(mine.own.size));
    // No XP, gold or items for an attack.
    assert.deepEqual(await first("SELECT xp, gold FROM characters WHERE name = 'Łowczyni'"), { xp: 0, gold: 5000 });
    assert.equal((await first('SELECT COUNT(*) AS count FROM items')).count, 0);
    // A new day, new attacks.
    await run("UPDATE world_boss_fighters SET day = '2020-01-01'");
    assert.equal((await attack('lowczyni')).status, 200);
    assert.equal((await view('lowczyni')).attacks.left, rules.attacksPerDay - 1);
  });

  test('the band is written down with the first attack and kept for the week; before it, the band follows the levels', async () => {
    assert.equal((await attack('lowczyni')).status, 200);
    // Both go up to the next band in the week.
    await run("UPDATE characters SET level = 60, class_level = 60 WHERE name IN ('Łowczyni', 'Tropiciel')");
    const kept = await view('lowczyni');
    assert.equal(kept.boss.id, 'wb-kotolak');
    // At its level in the band, now the band's last.
    assert.equal(kept.boss.level, 50);
    assert.equal((await attack('lowczyni')).data.boss.id, 'wb-kotolak');
    // Tropiciel had not attacked yet: the new band's boss.
    const moved = await view('tropiciel');
    assert.equal(moved.boss.id, 'wb-rusalka');
    assert.equal((await attack('tropiciel')).data.boss.id, 'wb-rusalka');
    assert.equal((await first('SELECT COUNT(*) AS count FROM world_boss_fighters')).count, 2);
  });

  test('the hit that fells the boss is written down; the best ten get its title for a week, in the profile and the Ranking', async () => {
    await attack('tropiciel');
    await attack('lowczyni');
    await run('UPDATE world_bosses SET hp = 3');
    const felled = (await attack('tropiciel')).data;
    assert.equal(felled.attack.damage, 3);
    assert.equal(felled.attack.hp, 0);
    assert.equal(felled.attack.fell, true);
    assert.equal(felled.boss.fallen, true);
    assert.equal(felled.boss.fallenBy, 'Tropiciel');
    assert.ok(felled.boss.fallenAt > 0);
    const late = await attack('lowczyni');
    assert.equal(late.status, 409);
    assert.equal(late.data.error.code, 'fallen');
    // The titles: both, by their damage, for title.days days from the fall.
    const titles = (await (await db()).prepare('SELECT character_id, place, until, created_at FROM world_boss_titles ORDER BY place').all()).results;
    assert.equal(titles.length, 2);
    assert.equal(titles[0].until, titles[0].created_at + rules.title.days * 86400000);
    const fighters = (await (await db()).prepare('SELECT character_id FROM world_boss_fighters ORDER BY damage DESC, created_at, character_id').all()).results;
    assert.deepEqual(
      titles.map((one) => one.character_id),
      fighters.map((one) => one.character_id),
    );
    const mine = await view('lowczyni');
    assert.equal(mine.title.text, 'Pogromczyni Kotołaka');
    assert.equal(mine.title.place, titles.find((one) => one.character_id === fighters.find((_, index) => mine.top[index]?.own)?.character_id)?.place);
    const profile = (await as('tropiciel', 'GET', '/api/profile/Łowczyni')).data.profile;
    assert.equal(profile.worldBossTitle, 'Pogromczyni Kotołaka');
    assert.equal((await as('lowczyni', 'GET', '/api/profile/Tropiciel')).data.profile.worldBossTitle, 'Pogromca Kotołaka');
    const ranking = (await as('lowczyni', 'GET', '/api/ranking')).data.rows;
    assert.equal(ranking.find((row) => row.name === 'Łowczyni').bossTitle, 'Pogromczyni Kotołaka');
    // Worn out after a week.
    await run('UPDATE world_boss_titles SET until = ?', Date.now() - 1);
    assert.equal((await as('tropiciel', 'GET', '/api/profile/Łowczyni')).data.profile.worldBossTitle, null);
    assert.equal((await as('lowczyni', 'GET', '/api/ranking')).data.rows.find((row) => row.name === 'Łowczyni').bossTitle, null);
  });

  test('the chests wait for each character\'s own visit; the last blow\'s holds an item and more gold; each opens once', async () => {
    await attack('lowczyni');
    await attack('tropiciel');
    // While the boss stands, this week's chest waits.
    assert.deepEqual((await view('lowczyni')).chests, []);
    await run('UPDATE world_bosses SET hp = 2');
    assert.equal((await attack('lowczyni')).data.attack.fell, true);
    // Nothing given to anybody by the fall itself.
    assert.deepEqual(await first("SELECT gold FROM characters WHERE name = 'Tropiciel'"), { gold: 5000 });
    assert.equal((await first('SELECT COUNT(*) AS count FROM world_boss_fighters WHERE claimed_at IS NOT NULL')).count, 0);
    const [mine] = (await view('lowczyni')).chests;
    assert.equal(mine.week, week());
    assert.equal(mine.fallen, true);
    assert.ok(mine.gold > 0);
    assert.ok(mine.lastBlow && mine.lastBlow.gold > 0);
    const [theirs] = (await view('tropiciel')).chests;
    assert.equal(theirs.lastBlow, null);
    const before = JSON.parse((await first("SELECT materials FROM characters WHERE name = 'Łowczyni'")).materials);
    const opened = await as('lowczyni', 'POST', '/api/world-boss/claim', { week: week() });
    assert.equal(opened.status, 200, JSON.stringify(opened.data).slice(0, 300));
    assert.equal(opened.data.chest.gold, mine.gold);
    assert.equal((await first("SELECT gold FROM characters WHERE name = 'Łowczyni'")).gold, 5000 + mine.gold);
    // The last blow's item at least, found in the bag by its id.
    assert.ok(opened.data.chest.items.length >= 1);
    for (const item of opened.data.chest.items) assert.equal(opened.data.character.bag.find((one) => one.id === item.id)?.name, item.name);
    // The land's elite's and champion's materials.
    const land = content.regionsById['stone-glade'];
    const allowed = [content.materialsByMonster[land.elite].id, content.materialsByMonster[land.areas.find((area) => area.champion).champion].id];
    const after = JSON.parse((await first("SELECT materials FROM characters WHERE name = 'Łowczyni'")).materials);
    const gained = Object.entries(after).filter(([key, count]) => count > (before[key] ?? 0));
    assert.ok(gained.length > 0 && gained.every(([key]) => allowed.some((id) => key.startsWith(`${id}:`))), JSON.stringify(gained));
    assert.match(opened.data.chest.text, /Skrzynia Bossa otwarta/);
    assert.deepEqual(opened.data.chests, []);
    const again = await as('lowczyni', 'POST', '/api/world-boss/claim', { week: week() });
    assert.equal(again.status, 409);
    assert.equal(again.data.error.code, 'claimed');
    // Tropiciel's waits for it, untouched.
    assert.equal((await view('tropiciel')).chests.length, 1);
    assert.equal((await as('tropiciel', 'POST', '/api/world-boss/claim', { week: week() })).status, 200);
  });

  test('last week\'s boss that lived: half the chest, no last blow, and none of the weeks before', async () => {
    const current = questPeriod('weekly', Date.now(), content);
    const previous = questPeriod('weekly', current.startsAt - 1, content);
    const older = questPeriod('weekly', previous.startsAt - 1, content);
    const id = await characterId('Łowczyni');
    const boss = async (key, hp) => {
      const made = await run("INSERT INTO world_bosses (week, region, boss, players, level, max_hp, hp, created_at) VALUES (?, 'stone-glade', 'wb-kotolak', 4, 40, 1000, ?, ?)", key, hp, Date.now());
      return made.meta.last_row_id;
    };
    const fighter = (key, bossId, damage) => run('INSERT INTO world_boss_fighters (week, character_id, boss_id, damage, hits, day, day_hits, created_at) VALUES (?, ?, ?, ?, 3, ?, 3, ?)', key, id, bossId, damage, key, Date.now());
    await fighter(previous.key, await boss(previous.key, 300), 400);
    await fighter(older.key, await boss(older.key, 0), 400);
    const { chests } = await view('lowczyni');
    // 400 of a share of 250: the huge chest, half of it.
    assert.equal(chests.length, 1);
    const [chest] = chests;
    assert.equal(chest.week, previous.key);
    assert.equal(chest.fallen, false);
    assert.equal(chest.size, 'huge');
    assert.equal(chest.lastBlow, null);
    assert.equal(chest.itemChance, rules.chests.find((one) => one.id === 'huge').itemChance * rules.unbeaten);
    assert.equal(chest.until, current.endsAt);
    assert.equal(worldBossPart({ maxHp: 1000, players: 4 }), 250);
    // The week's new boss took the older weeks' bosses and fighters away.
    assert.equal((await first('SELECT COUNT(*) AS count FROM world_bosses WHERE week = ?', older.key)).count, 0);
    assert.equal((await first('SELECT COUNT(*) AS count FROM world_boss_fighters WHERE week = ?', older.key)).count, 0);
    assert.equal((await as('lowczyni', 'POST', '/api/world-boss/claim', { week: older.key })).data.error.code, 'no_chest');
    const opened = await as('lowczyni', 'POST', '/api/world-boss/claim', { week: previous.key });
    assert.equal(opened.status, 200, JSON.stringify(opened.data).slice(0, 300));
    assert.equal(opened.data.chest.gold, chest.gold);
    const fallen = (await view('lowczyni')).chests;
    assert.deepEqual(fallen, []);
  });

  test('a full bag keeps a chest with items shut; room again, it opens', async () => {
    await attack('lowczyni');
    await run('UPDATE world_bosses SET hp = 1');
    assert.equal((await attack('lowczyni')).data.attack.fell, true);
    // The whole bar by itself: the huge chest's item and the last blow's.
    await run('UPDATE world_boss_fighters SET damage = (SELECT max_hp FROM world_bosses)');
    const id = await characterId('Łowczyni');
    const database = await db();
    const filler = JSON.stringify(generateItem({ baseId: 'ring', level: 1 }, createRng('pełno'), content));
    await database.batch(Array.from({ length: content.balance.items.bagSlots - 1 }, () => database.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)').bind(id, filler)));
    const full = await as('lowczyni', 'POST', '/api/world-boss/claim', { week: week() });
    assert.equal(full.status, 409);
    assert.equal(full.data.error.code, 'bag_full');
    assert.equal(full.data.error.message, rules.texts.errors.bagFull);
    await database.prepare('DELETE FROM items WHERE id = (SELECT MIN(id) FROM items)').run();
    const opened = await as('lowczyni', 'POST', '/api/world-boss/claim', { week: week() });
    assert.equal(opened.status, 200, JSON.stringify(opened.data).slice(0, 300));
    assert.equal(opened.data.chest.items.length, 2);
  });

  test('an attack also on an exploration, which comes out as before', async () => {
    assert.equal((await as('lowczyni', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).status, 201);
    const version = async () => (await first("SELECT version FROM characters WHERE name = 'Łowczyni'")).version;
    const before = await version();
    assert.equal((await attack('lowczyni')).status, 200);
    assert.equal(await version(), before);
  });
});

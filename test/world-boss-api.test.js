// The World Bosses through the API (src/server/world-boss.js; the author:
// 1222–1226 A, and a boss every 3 days from 30.11.2026): one boss for each
// band of levels and period, with HP for the band's active characters and
// one bar for all of them; three attacks a day; a character's band written
// down with its first attack of the period and kept, whatever its levels
// do; the hit that fells the boss, with the last blow and the titles of the
// best ten in the profile and the Ranking; the chests each character opens
// on its own visit, half as big when the boss lived through its period,
// with the last blow's item and gold; a full bag keeping a chest with items
// shut; and on the test clock, the last weekly boss to its Sunday, then the
// cycles of 3 days with their band, chests and titles.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { createRng, generateItem, worldBossBandOf, worldBossDamage, worldBossHp, worldBossPart, worldBossPeriod } from '../src/engine/index.js';
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
  // The key of the boss's period now (a week, then 3 days from 30.11.2026).
  const week = () => worldBossPeriod(Date.now(), content).key;

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

  test('a band\'s boss of the period: HP for the band\'s active characters, the same for all of them, one row for the band', async () => {
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

  test('three attacks a day; the HP goes down for the whole band and the best of the boss show who hit how much', async () => {
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

  test('the band is written down with the first attack and kept for the period; before it, the band follows the levels', async () => {
    assert.equal((await attack('lowczyni')).status, 200);
    // Both go up to the next band in the period.
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

  test('the hit that fells the boss is written down; the best ten get its title to the end of the next period, in the profile and the Ranking', async () => {
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
    // The titles: both, by their damage, to the end of the period after the boss's.
    const titles = (await (await db()).prepare('SELECT character_id, place, until, created_at FROM world_boss_titles ORDER BY place').all()).results;
    assert.equal(titles.length, 2);
    const period = worldBossPeriod(titles[0].created_at, content);
    assert.equal(titles[0].until, worldBossPeriod(period.endsAt, content).endsAt);
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
    // Worn out after the next period.
    await run('UPDATE world_boss_titles SET until = ?', Date.now() - 1);
    assert.equal((await as('tropiciel', 'GET', '/api/profile/Łowczyni')).data.profile.worldBossTitle, null);
    assert.equal((await as('lowczyni', 'GET', '/api/ranking')).data.rows.find((row) => row.name === 'Łowczyni').bossTitle, null);
  });

  test('the chests wait for each character\'s own visit; the last blow\'s holds an item and more gold; each opens once', async () => {
    await attack('lowczyni');
    await attack('tropiciel');
    // While the boss stands, this period's chest waits.
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

  test('the last period\'s boss that lived: half the chest, no last blow, and none of the periods before', async () => {
    const current = worldBossPeriod(Date.now(), content);
    const previous = worldBossPeriod(current.startsAt - 1, content);
    const older = worldBossPeriod(previous.startsAt - 1, content);
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
    assert.equal(chest.startsAt, previous.startsAt);
    assert.equal(chest.endsAt, previous.endsAt);
    assert.equal(worldBossPart({ maxHp: 1000, players: 4 }), 250);
    // The period's new boss took the older periods' bosses and fighters away.
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

// A boss every 3 days (the author, 24.11.2026: „Ewentualnie resp co 3 dni
// zamiast tygodnia - więcej nagród i zabawy”): the weekly boss of 23–29.11
// to its Sunday, then from Monday 30.11.2026 cycles of 3 Polish days, each
// with its own boss, band, chests and titles, on the test clock.
describe('the World Boss every 3 days through the API', () => {
  const { call, db, signUp } = useServer({ TEST_CLOCK: 'on' });
  const cookies = {};
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  const DAY = 86400000;
  // The Polish midnights of Monday 23.11.2026, Monday 30.11, Thursday 3.12, Sunday 6.12 and Wednesday 9.12.
  const MONDAY = Date.parse('2026-11-22T23:00:00Z');
  const FIRST = Date.parse('2026-11-29T23:00:00Z');
  const SECOND = FIRST + 3 * DAY;
  const THIRD = SECOND + 3 * DAY;
  const FOURTH = THIRD + 3 * DAY;

  // A character of `level` made at `now`, its account seen an hour before.
  async function player(login, name, level, now) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' }, now });
    await run('UPDATE characters SET level = ?, class_level = ?, gold = 5000 WHERE name = ?', level, level, name);
    await run('UPDATE users SET seen_at = ? WHERE login = ?', now - HOUR, login);
    await run('UPDATE sessions SET expires_at = ?', Date.UTC(2030, 0, 1));
  }
  const as = (login, method, path, now, body) => call(method, path, { cookie: cookies[login], body, now });
  const attack = (login, now) => as(login, 'POST', '/api/world-boss/attack', now);
  const view = async (login, now) => (await as(login, 'GET', '/api/world-boss', now)).data;
  const fell = async (login, now) => {
    await run('UPDATE world_bosses SET hp = 1 WHERE hp > 0');
    const hit = await attack(login, now);
    assert.equal(hit.data.attack.fell, true, JSON.stringify(hit.data).slice(0, 300));
  };

  beforeEach(async () => {
    await player('lowczyni', 'Łowczyni', 40, MONDAY + 4 * DAY);
  });

  test('the last weekly boss stays to Sunday midnight; then a boss every 3 days, its chest and title to the end of the first cycle', async () => {
    // Sunday 29.11, 23:00: still the week of 23.11.
    const sunday = FIRST - HOUR;
    const last = await view('lowczyni', sunday);
    assert.equal(last.boss.week, '2026-11-23');
    assert.equal(last.boss.startsAt, MONDAY);
    assert.equal(last.boss.endsAt, FIRST);
    await attack('lowczyni', sunday);
    await fell('lowczyni', sunday + 1000);
    // Its title to the end of the period after it: the first cycle.
    assert.equal((await first('SELECT until FROM world_boss_titles')).until, SECOND);
    // Monday 30.11, 0:30: the first cycle's boss, new; the week's chest to open to the cycle's end.
    const monday = FIRST + HOUR / 2;
    const cycle = await view('lowczyni', monday);
    assert.equal(cycle.boss.week, '2026-11-30');
    assert.equal(cycle.boss.startsAt, FIRST);
    assert.equal(cycle.boss.endsAt, SECOND);
    assert.equal(cycle.boss.fallen, false);
    assert.equal(cycle.boss.hp, cycle.boss.maxHp);
    assert.equal(cycle.attacks.left, content.worldBosses.attacksPerDay);
    assert.equal(cycle.chests.length, 1);
    assert.deepEqual([cycle.chests[0].week, cycle.chests[0].fallen, cycle.chests[0].startsAt, cycle.chests[0].endsAt, cycle.chests[0].until], ['2026-11-23', true, MONDAY, FIRST, SECOND]);
    assert.equal(cycle.title.until, SECOND);
    assert.equal(cycle.texts.rules.join(' ').includes('{'), false);
    assert.match(cycle.texts.lead, /Co 3 dni/);
    // Thursday 3.12, 0:30: the second cycle; the week's chest and title gone with the first cycle.
    const thursday = await view('lowczyni', SECOND + HOUR / 2);
    assert.equal(thursday.boss.week, '2026-12-03');
    assert.deepEqual(thursday.chests, []);
    assert.equal(thursday.title, null);
    assert.equal((await as('lowczyni', 'POST', '/api/world-boss/claim', SECOND + HOUR, { week: '2026-11-23' })).data.error.code, 'no_chest');
    assert.equal((await first("SELECT COUNT(*) AS count FROM world_bosses WHERE week = '2026-11-23'")).count, 0);
  });

  test('the band written down at the first attack of a cycle, kept to its end; the next cycle by the levels again', async () => {
    await player('tropiciel', 'Tropiciel', 45, FIRST + HOUR);
    const morning = FIRST + 9 * HOUR;
    assert.equal((await attack('lowczyni', morning)).data.boss.id, 'wb-kotolak');
    await run("UPDATE characters SET level = 60, class_level = 60 WHERE name IN ('Łowczyni', 'Tropiciel')");
    // The same cycle: the band of the first attack; Tropiciel had none, so the new band's.
    assert.equal((await view('lowczyni', SECOND - HOUR)).boss.id, 'wb-kotolak');
    assert.equal((await attack('lowczyni', SECOND - HOUR)).data.boss.id, 'wb-kotolak');
    assert.equal((await view('tropiciel', SECOND - HOUR)).boss.id, 'wb-rusalka');
    // The next cycle: the band by the levels now, and a new day's attacks.
    const next = await view('lowczyni', SECOND + HOUR);
    assert.equal(next.boss.id, 'wb-rusalka');
    assert.equal(next.boss.week, '2026-12-03');
    assert.equal(next.attacks.left, content.worldBosses.attacksPerDay);
    assert.equal((await attack('lowczyni', SECOND + HOUR)).data.boss.id, 'wb-rusalka');
  });

  test('a cycle\'s boss that lived: half the chest at the cycle\'s end, to the end of the next cycle', async () => {
    await attack('lowczyni', FIRST + HOUR);
    assert.deepEqual((await view('lowczyni', SECOND - HOUR)).chests, []);
    const [chest] = (await view('lowczyni', SECOND + HOUR)).chests;
    assert.deepEqual([chest.week, chest.fallen, chest.lastBlow, chest.startsAt, chest.endsAt, chest.until], ['2026-11-30', false, null, FIRST, SECOND, THIRD]);
    assert.equal(chest.itemChance, content.worldBosses.chests.find((one) => one.id === chest.size).itemChance * content.worldBosses.unbeaten);
    // Still there at the end of the next cycle, gone after it.
    assert.equal((await view('lowczyni', THIRD - HOUR)).chests.length, 1);
    assert.deepEqual((await view('lowczyni', THIRD + HOUR)).chests, []);
  });

  test('a fallen cycle\'s boss: its title to the end of the next cycle, its chest open to then and once', async () => {
    await attack('lowczyni', FIRST + HOUR);
    await fell('lowczyni', FIRST + 2 * HOUR);
    assert.equal((await first('SELECT until FROM world_boss_titles')).until, THIRD);
    const profile = async (now) => (await as('lowczyni', 'GET', '/api/profile/Łowczyni', now)).data.profile.worldBossTitle;
    assert.equal(await profile(THIRD - HOUR), 'Pogromczyni Kotołaka');
    assert.equal(await profile(THIRD + HOUR), null);
    // The chest: open from the fall, through the next cycle, and once.
    const [now] = (await view('lowczyni', FIRST + 3 * HOUR)).chests;
    assert.deepEqual([now.week, now.fallen, now.until], ['2026-11-30', true, THIRD]);
    const later = (await view('lowczyni', THIRD - HOUR)).chests;
    assert.equal(later.length, 1);
    const opened = await as('lowczyni', 'POST', '/api/world-boss/claim', THIRD - HOUR, { week: '2026-11-30' });
    assert.equal(opened.status, 200, JSON.stringify(opened.data).slice(0, 300));
    assert.equal((await as('lowczyni', 'POST', '/api/world-boss/claim', THIRD - HOUR, { week: '2026-11-30' })).data.error.code, 'claimed');
    // The fourth cycle has no chest of the first left.
    assert.deepEqual((await view('lowczyni', FOURTH + HOUR)).chests, []);
  });
});

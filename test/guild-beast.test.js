// The Bestia Gildii (src/engine/guild-beast.js, src/server/guild-beast.js;
// the author: "344 A"): the beast drawn from the guild's and the week's
// seed, its level and its HP growing with the members; an attack's damage,
// never more than the HP left; the chests by how the week ended; and
// through the API the attacks of a day, in whatever guild, the bar going
// down for the whole guild, the fall, one chest a week only for those who
// hit, never on an exploration, and a full bag keeping the item's chest shut.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  beastAttackDamage,
  beastChest,
  beastChestTier,
  beastLairs,
  createRng,
  generateItem,
  guildBeast,
  guildBeastFight,
  questPeriod,
} from '../src/engine/index.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rules = content.guilds.beast;
const rarityIndex = (id) => content.rarities.findIndex((rarity) => rarity.id === id);

describe('the Bestia Gildii', () => {
  test('the data: the damage by rising levels, the chests from the fallen beast down', () => {
    const levels = rules.damage.map(([level]) => level);
    assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
    assert.equal(new Set(levels).size, levels.length);
    const shares = rules.chests.map((chest) => chest.share);
    assert.deepEqual(shares, [...shares].sort((a, b) => b - a));
    assert.equal(rules.chests[0].share, 1);
    assert.equal(rules.chests[0].item, true);
    assert.ok(rules.chests.slice(1).every((chest) => !chest.item));
  });

  test('the beast is a champion of one of the regions, the same for the same seed', () => {
    const lairs = beastLairs(content);
    assert.ok(lairs.length >= 4);
    const beast = guildBeast({ seed: '7:2026-11-02', levels: [40] }, content);
    assert.deepEqual(guildBeast({ seed: '7:2026-11-02', levels: [40] }, content), beast);
    assert.ok(content.monstersById[beast.monsterId].champion);
    assert.equal(content.areasById[beast.areaId].champion, beast.monsterId);
    // Every region's champion comes in some week.
    const drawn = new Set(Array.from({ length: 60 }, (_, guild) => guildBeast({ seed: `${guild + 1}:2026-11-02`, levels: [40] }, content).monsterId));
    assert.deepEqual([...drawn].sort(), lairs.map((area) => area.champion).sort());
  });

  test('its level is the members\' rounded average, its HP grows with their number', () => {
    assert.equal(guildBeast({ seed: 'a', levels: [30, 41] }, content).level, 36);
    assert.equal(guildBeast({ seed: 'a', levels: [30, 40, 41] }, content).level, 37);
    assert.equal(guildBeast({ seed: 'a', levels: [] }, content).level, 1);
    const one = guildBeast({ seed: 'a', levels: [50] }, content);
    const five = guildBeast({ seed: 'a', levels: [50, 50, 50, 50, 50] }, content);
    assert.equal(one.members, 1);
    assert.equal(five.members, 5);
    assert.equal(five.maxHp, 5 * one.maxHp);
    assert.equal(one.maxHp, Math.round(rules.memberAttacks * beastAttackDamage(50, content)));
    // Between the measured levels on the line; above the last in proportion.
    const [[low, lowDamage], [high, highDamage]] = rules.damage.filter(([level]) => level === 40 || level === 45);
    assert.equal(beastAttackDamage((low + high) / 2, content), (lowDamage + highDamage) / 2);
    const [last, lastDamage] = rules.damage.at(-1);
    assert.equal(beastAttackDamage(last * 2, content), lastDamage * 2);
  });

  test('a member\'s memberAttacks typical attacks take about its share of the bar', () => {
    const level = 50;
    let total = 0;
    let fights = 0;
    for (const cls of content.classes) {
      const { character, equipped } = typicalCharacter(cls.id, level, content);
      for (const area of beastLairs(content)) {
        for (let i = 0; i < 3; i++) {
          const beast = { monsterId: area.champion, areaId: area.id, level, hp: 1e9, maxHp: 1e9 };
          total += guildBeastFight({ character, equipped, name: 'Typowa', beast, seed: `typical:${cls.id}:${area.id}:${i}` }, content).damage;
          fights += 1;
        }
      }
    }
    const share = (rules.memberAttacks * (total / fights)) / guildBeast({ seed: 'a', levels: [level] }, content).maxHp;
    assert.ok(share > 0.7 && share < 1.4, `${share}`);
  });

  test('an attack takes the HP the beast lost, never more than it had, the same for the same seed', () => {
    const character = newCharacter('warrior', { level: 40, classLevel: 40 });
    const beast = { ...guildBeast({ seed: 'b', levels: [40] }, content) };
    const full = guildBeastFight({ character, equipped: [], name: 'Łowczyni', beast: { ...beast, hp: beast.maxHp }, seed: 's' }, content);
    assert.ok(full.damage > 0 && full.damage < beast.maxHp, `${full.damage}`);
    assert.equal(full.hp, beast.maxHp - full.damage);
    assert.equal(full.fallen, false);
    assert.ok(full.log.length > 0 && full.log.every((line) => typeof line === 'string'));
    assert.deepEqual(guildBeastFight({ character, equipped: [], name: 'Łowczyni', beast: { ...beast, hp: beast.maxHp }, seed: 's' }, content), full);
    // Nearly felled: the damage is what it had left.
    const last = guildBeastFight({ character, equipped: [], name: 'Łowczyni', beast: { ...beast, hp: 5 }, seed: 's' }, content);
    assert.equal(last.damage, 5);
    assert.equal(last.hp, 0);
    assert.equal(last.fallen, true);
    assert.equal(last.won, true);
  });

  test('the chest by how the week ended: the item only for a fallen beast, materials by the bar knocked off', () => {
    const tier = (hp) => beastChestTier({ hp, maxHp: 1000 }, content);
    assert.equal(tier(0), rules.chests[0]);
    assert.equal(tier(240), rules.chests.find((chest) => chest.share === 0.75));
    assert.equal(tier(499), rules.chests.find((chest) => chest.share === 0.5));
    assert.equal(tier(750), rules.chests.find((chest) => chest.share === 0.25));
    assert.equal(tier(751), null);
    const beast = guildBeast({ seed: 'c', levels: [50] }, content);
    const material = content.materialsByMonster[beast.monsterId];
    const character = { level: 52, classId: 'archer', classLevel: 45, wornSlots: ['weapon'], beast, seed: 'chest' };
    const fallen = beastChest({ ...character, tier: tier(0) }, content);
    assert.equal(fallen.item.level, 52);
    assert.ok(rarityIndex(fallen.item.rarity) >= rarityIndex('epic'));
    assert.ok(content.basesById[fallen.item.base].classes?.includes('archer') ?? true, fallen.item.base);
    const pieces = (materials) => Object.values(materials).reduce((sum, count) => sum + count, 0);
    assert.ok(pieces(fallen.materials) >= 1 && pieces(fallen.materials) <= rules.chests[0].materials);
    assert.ok(Object.keys(fallen.materials).every((key) => key.startsWith(`${material.id}:`)));
    assert.deepEqual(beastChest({ ...character, tier: tier(0) }, content), fallen);
    const quarter = beastChest({ ...character, tier: tier(700) }, content);
    assert.equal(quarter.item, null);
    assert.equal(pieces(quarter.materials), 1);
  });
});

describe('the Bestia Gildii through the API', () => {
  const { call, db, signUp } = useServer();
  const cookies = {};
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();

  async function player(login, name, level = 40) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await run('UPDATE characters SET level = ?, class_level = ?, gold = 5000 WHERE name = ?', level, level, name);
  }
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const attack = (login) => as(login, 'POST', '/api/guild/beast/attack');
  const view = async (login) => (await as(login, 'GET', '/api/guild/beast')).data;
  const guildId = async () => (await first('SELECT id FROM guilds')).id;
  const characterId = async (name) => (await first('SELECT id FROM characters WHERE name = ?', name)).id;

  async function join(login, tag) {
    const invites = (await as(login, 'GET', '/api/guild')).data.invites;
    return as(login, 'POST', '/api/guild/accept', { guildId: invites.find((invite) => invite.tag === tag).guildId });
  }

  beforeEach(async () => {
    await player('lowczyni', 'Łowczyni');
    await player('tropiciel', 'Tropiciel', 50);
    await as('lowczyni', 'POST', '/api/guild/found', { name: 'Sfora', tag: 'SF' });
    await as('lowczyni', 'POST', '/api/guild/invite', { name: 'Tropiciel' });
    await join('tropiciel', 'SF');
  });

  test('a guild\'s beast of the week: a champion at the members\' average level, with HP for each of them', async () => {
    const seen = await view('lowczyni');
    assert.equal(seen.beast.level, 45);
    assert.equal(seen.beast.members, 2);
    assert.equal(seen.beast.hp, seen.beast.maxHp);
    assert.equal(seen.beast.maxHp, guildBeast({ seed: `${await guildId()}:${seen.beast.week}`, levels: [40, 50] }, content).maxHp);
    assert.ok(content.monstersById[seen.beast.monsterId].champion);
    assert.equal(seen.beast.week, questPeriod('weekly', Date.now(), content).key);
    assert.deepEqual(seen.attacks, { left: rules.attacksPerDay, perDay: rules.attacksPerDay });
    assert.deepEqual(seen.contribution, []);
    assert.deepEqual(seen.chests, []);
    assert.ok(seen.texts.rules.length > 0 && !seen.texts.rules.join(' ').includes('{'));
    // The same beast for the other member, one row for the guild.
    assert.deepEqual((await view('tropiciel')).beast, seen.beast);
    assert.equal((await first('SELECT COUNT(*) AS count FROM guild_beasts')).count, 1);
  });

  test('three attacks a day, counted for the character in whatever guild', async () => {
    for (let left = rules.attacksPerDay - 1; left >= 0; left--) {
      const hit = await attack('lowczyni');
      assert.equal(hit.status, 200, JSON.stringify(hit.data).slice(0, 300));
      assert.equal(hit.data.attacks.left, left);
      assert.ok(hit.data.attack.log.length > 0);
    }
    const spent = await attack('lowczyni');
    assert.equal(spent.status, 409);
    assert.equal(spent.data.error.code, 'no_attacks');
    // Another guild, with a beast of its own, brings no fresh attacks.
    await as('lowczyni', 'POST', '/api/guild/leave');
    assert.equal((await as('lowczyni', 'POST', '/api/guild/found', { name: 'Wataha', tag: 'WA' })).status, 200);
    const elsewhere = await view('lowczyni');
    assert.equal(elsewhere.beast.hp, elsewhere.beast.maxHp);
    assert.equal(elsewhere.attacks.left, 0);
    assert.equal((await attack('lowczyni')).data.error.code, 'no_attacks');
    // A new day, new attacks.
    await run("UPDATE guild_beast_hits SET day = '2020-01-01'");
    assert.equal((await attack('lowczyni')).status, 200);
  });

  test('the HP goes down for the whole guild, and the Wkład tygodnia shows who hit how much', async () => {
    const hit = (await attack('lowczyni')).data;
    assert.ok(hit.attack.damage > 0);
    assert.equal(hit.attack.fell, false);
    const other = await view('tropiciel');
    assert.equal(other.beast.hp, other.beast.maxHp - hit.attack.damage);
    assert.equal(other.beast.hp, hit.attack.hp);
    assert.deepEqual(other.contribution, [{ name: 'Łowczyni', damage: hit.attack.damage, hits: 1, own: false }]);
    assert.deepEqual(other.own, { damage: 0, hits: 0 });
    const second = (await attack('tropiciel')).data;
    assert.equal(second.beast.hp, other.beast.hp - second.attack.damage);
    const mine = await view('lowczyni');
    assert.deepEqual(mine.own, { damage: hit.attack.damage, hits: 1 });
    assert.deepEqual(
      mine.contribution.map((entry) => entry.name),
      [hit.attack.damage >= second.attack.damage ? 'Łowczyni' : 'Tropiciel', hit.attack.damage >= second.attack.damage ? 'Tropiciel' : 'Łowczyni'],
    );
    // No XP, gold or items for an attack.
    const row = await first("SELECT xp, gold FROM characters WHERE name = 'Łowczyni'");
    assert.deepEqual(row, { xp: 0, gold: 5000 - content.guilds.found.gold });
  });

  test('the hit that fells the beast is written down; then it waits for the next week', async () => {
    await view('lowczyni');
    await run('UPDATE guild_beasts SET hp = 3');
    const felled = (await attack('tropiciel')).data;
    assert.equal(felled.attack.damage, 3);
    assert.equal(felled.attack.hp, 0);
    assert.equal(felled.attack.fell, true);
    assert.equal(felled.beast.fallen, true);
    assert.equal(felled.beast.fallenBy, 'Tropiciel');
    assert.ok(felled.beast.fallenAt > 0);
    const late = await attack('lowczyni');
    assert.equal(late.status, 409);
    assert.equal(late.data.error.code, 'fallen');
    // The attack refused costs nothing.
    assert.equal((await view('lowczyni')).attacks.left, rules.attacksPerDay);
  });

  test('one chest a week, only for those who hit: an item and materials once the beast fell', async () => {
    await attack('lowczyni');
    // While the beast stands, this week's chest waits.
    assert.deepEqual((await view('lowczyni')).chests, []);
    await run('UPDATE guild_beasts SET hp = 0, fallen_at = ?', Date.now());
    const week = questPeriod('weekly', Date.now(), content).key;
    const [chest] = (await view('lowczyni')).chests;
    assert.equal(chest.week, week);
    assert.equal(chest.fallen, true);
    assert.equal(chest.item, true);
    assert.deepEqual((await view('tropiciel')).chests, []);
    assert.equal((await as('tropiciel', 'POST', '/api/guild/beast/claim', { week })).data.error.code, 'no_chest');
    const before = JSON.parse((await first("SELECT materials FROM characters WHERE name = 'Łowczyni'")).materials);
    const opened = await as('lowczyni', 'POST', '/api/guild/beast/claim', { week });
    assert.equal(opened.status, 200, JSON.stringify(opened.data).slice(0, 300));
    assert.ok(opened.data.chest.item.name);
    assert.ok(opened.data.chest.materials.length > 0);
    // The page shows what the chest held as icons and finds each in the bag
    // for its card: the item by its id, the materials by their keys.
    const bagItem = opened.data.character.bag.find((one) => one.id === opened.data.chest.item.id);
    assert.equal(bagItem?.name, opened.data.chest.item.name);
    for (const material of opened.data.chest.materials) {
      assert.ok(material.materialId && material.rarityName, JSON.stringify(material));
      assert.ok(opened.data.character.crafting.materials.some((one) => one.key === material.key), material.key);
    }
    assert.match(opened.data.chest.text, /Skrzynia Bestii otwarta/);
    assert.deepEqual(opened.data.chests, []);
    const item = JSON.parse((await first('SELECT data FROM items WHERE character_id = ? AND slot IS NULL', await characterId('Łowczyni'))).data);
    assert.equal(item.level, 40);
    assert.ok(rarityIndex(item.rarity) >= rarityIndex('epic'));
    // The beast's own material.
    const material = content.materialsByMonster[opened.data.beast.monsterId];
    const after = JSON.parse((await first("SELECT materials FROM characters WHERE name = 'Łowczyni'")).materials);
    const gained = Object.entries(after).filter(([key, count]) => count > (before[key] ?? 0));
    assert.ok(gained.length > 0 && gained.every(([key]) => key.startsWith(`${material.id}:`)), JSON.stringify(gained));
    const again = await as('lowczyni', 'POST', '/api/guild/beast/claim', { week });
    assert.equal(again.status, 409);
    assert.equal(again.data.error.code, 'claimed');
  });

  test('last week\'s chest when the beast lived on: materials by the bar knocked off, none under a quarter, and none older', async () => {
    const now = Date.now();
    const current = questPeriod('weekly', now, content);
    const previous = questPeriod('weekly', current.startsAt - 1, content);
    const older = questPeriod('weekly', previous.startsAt - 1, content);
    const id = await characterId('Łowczyni');
    const guild = await guildId();
    const beast = async (week, hp) => {
      const made = await run("INSERT INTO guild_beasts (guild_id, week, monster_id, area_id, level, members, max_hp, hp, created_at) VALUES (?, ?, 'tusker', 'boar-thicket', 40, 2, 1000, ?, ?)", guild, week, hp, now);
      return made.meta.last_row_id;
    };
    const hit = (beastId) => run("INSERT INTO guild_beast_hits (beast_id, character_id, day, damage, created_at) VALUES (?, ?, '2020-01-01', 10, ?)", beastId, id, now);
    await hit(await beast(previous.key, 400));
    await hit(await beast(older.key, 0));
    const { chests } = await view('lowczyni');
    assert.deepEqual(chests, [{ week: previous.key, fallen: false, share: 60, item: false, until: current.endsAt }]);
    // Only for those who hit.
    assert.deepEqual((await view('tropiciel')).chests, []);
    // The week's new beast took the older weeks' beasts and hits away.
    assert.equal((await first('SELECT COUNT(*) AS count FROM guild_beasts WHERE week = ?', older.key)).count, 0);
    assert.equal((await first('SELECT COUNT(*) AS count FROM guild_beast_hits')).count, 1);
    assert.equal((await as('lowczyni', 'POST', '/api/guild/beast/claim', { week: older.key })).data.error.code, 'no_chest');
    const opened = await as('lowczyni', 'POST', '/api/guild/beast/claim', { week: previous.key });
    assert.equal(opened.status, 200, JSON.stringify(opened.data).slice(0, 300));
    assert.equal(opened.data.chest.item, null);
    const pieces = opened.data.chest.materials.reduce((sum, material) => sum + material.count, 0);
    assert.ok(pieces >= 1 && pieces <= rules.chests.find((chest) => chest.share === 0.5).materials);
    assert.equal((await first('SELECT COUNT(*) AS count FROM items')).count, 0);
    // A beast left with more than three quarters of its HP gives no chest.
    await run('DELETE FROM guild_beast_chests');
    await run('UPDATE guild_beasts SET hp = 800 WHERE week = ?', previous.key);
    assert.deepEqual((await view('lowczyni')).chests, []);
  });

  test('an attack also on an exploration and before its report, which comes out as before; a profession\'s work is no matter', async () => {
    assert.equal((await as('lowczyni', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).status, 201);
    // The author: "powinienem móc atakować po resecie". An attack changes
    // nothing of the character, so its exploration's report comes out the same.
    const version = async () => (await first("SELECT version FROM characters WHERE name = 'Łowczyni'")).version;
    const before = await version();
    assert.equal((await attack('lowczyni')).status, 200);
    assert.equal(await version(), before);
    await run('UPDATE activities SET started_at = started_at - 300000, ends_at = ends_at - 300000');
    assert.equal((await attack('lowczyni')).status, 200);
    let claimed = await as('lowczyni', 'POST', '/api/hunts/claim');
    if (claimed.data.event) claimed = await as('lowczyni', 'POST', '/api/hunts/claim', { choice: claimed.data.event.options[0].id });
    assert.equal(claimed.status, 200);
    assert.equal((await attack('lowczyni')).status, 200);
    assert.equal((await attack('lowczyni')).data.error.code, 'no_attacks');
    await run('DELETE FROM guild_beast_hits');
    const gathering = await as('lowczyni', 'POST', '/api/professions/gather', { herbs: ['comfrey'], minutes: 60 });
    assert.equal(gathering.status, 201, JSON.stringify(gathering.data));
    assert.equal((await attack('lowczyni')).status, 200);
  });

  test('outside a guild there is no beast to attack', async () => {
    await player('samotnik', 'Samotnik');
    const alone = await view('samotnik');
    assert.equal(alone.beast, null);
    assert.equal((await attack('samotnik')).data.error.code, 'no_guild');
  });

  test('a full bag keeps the chest with an item shut; a chest of materials opens anyway', async () => {
    await attack('lowczyni');
    await run('UPDATE guild_beasts SET hp = 0, fallen_at = ?', Date.now());
    const week = questPeriod('weekly', Date.now(), content).key;
    const database = await db();
    const filler = JSON.stringify(generateItem({ baseId: 'ring', level: 1 }, createRng('pełno'), content));
    const id = await characterId('Łowczyni');
    await database.batch(Array.from({ length: content.balance.items.bagSlots }, () => database.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)').bind(id, filler)));
    const full = await as('lowczyni', 'POST', '/api/guild/beast/claim', { week });
    assert.equal(full.status, 409);
    assert.equal(full.data.error.code, 'bag_full');
    assert.equal(full.data.error.message, rules.texts.errors.bagFull);
    // With the beast alive at three quarters of the bar knocked off, last
    // week's chest has only materials, and the bag does not matter.
    const previous = questPeriod('weekly', questPeriod('weekly', Date.now(), content).startsAt - 1, content).key;
    const made = await run("INSERT INTO guild_beasts (guild_id, week, monster_id, area_id, level, members, max_hp, hp, created_at) VALUES (?, ?, 'basilisk', 'glade-heart', 40, 2, 1000, 200, ?)", await guildId(), previous, Date.now());
    await run("INSERT INTO guild_beast_hits (beast_id, character_id, day, damage, created_at) VALUES (?, ?, '2020-01-01', 800, ?)", made.meta.last_row_id, id, Date.now());
    assert.equal((await as('lowczyni', 'POST', '/api/guild/beast/claim', { week: previous })).status, 200);
    // Room again: this week's chest opens.
    await database.prepare('DELETE FROM items WHERE id = (SELECT MIN(id) FROM items)').run();
    assert.equal((await as('lowczyni', 'POST', '/api/guild/beast/claim', { week })).status, 200);
  });
});

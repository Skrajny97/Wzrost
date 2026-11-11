// The Wyprawa Gildii (src/engine/guild-expedition.js,
// src/server/guild-expedition.js; the author's 621 A and mock-up 624): the
// route of a week through the land of the members' average level, its seven
// guardians (creatures of that land, all different, each stronger than the
// one before, the last a champion), the minutes of a stage, the route
// stopping at a guardian with the minutes kept meanwhile, the guardian's HP
// and its chest; and through the API the minutes of a claimed exploration
// (alone and in a Drużyna) for the guild the character is in, a guardian
// coming once the route reaches it, attacks only for those who added
// minutes, three a day apart from the Bestia's, the fall walking the route
// on with the kept minutes, one chest a stage for those who added minutes
// (also for a later member), last week's chests and nothing older, and a
// new route each week.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  beastAttackDamage,
  createRng,
  expeditionChest,
  expeditionGuardian,
  expeditionGuardians,
  expeditionLand,
  expeditionLevel,
  expeditionProgress,
  expeditionStageMinutes,
  expeditionStages,
  generateItem,
  guildBeastFight,
  guildExpedition,
  joinShare,
  questPeriod,
  trialDay,
} from '../src/engine/index.js';
import { CHESTS_SQL } from '../src/server/guild-expedition.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rules = content.guilds.expedition;
const rarityIndex = (id) => content.rarities.findIndex((rarity) => rarity.id === id);
const pieces = (materials) => Object.values(materials).reduce((sum, count) => sum + count, 0);

describe('the Wyprawa Gildii', () => {
  test('the data: seven guardians, each asking for more attacks and giving more, the last a rare item', () => {
    assert.equal(expeditionStages(content), 7);
    const attacks = rules.guardians.map((guardian) => guardian.attacks);
    assert.deepEqual(attacks, [...attacks].sort((a, b) => a - b));
    assert.ok(attacks.at(-1) > attacks[0]);
    assert.deepEqual(
      rules.guardians.map((guardian) => guardian.materials),
      [1, 2, 3, 4, 5, 6, 7],
    );
    assert.deepEqual(
      rules.guardians.map((guardian) => Boolean(guardian.item)),
      [false, false, false, false, false, false, true],
    );
    assert.ok(rules.guardians.every((guardian, index) => index === 0 || guardian.gold.perLevel > rules.guardians[index - 1].gold.perLevel));
    assert.ok(content.guilds.tabs.findIndex((tab) => tab.id === 'expedition') === content.guilds.tabs.findIndex((tab) => tab.id === 'beast') - 1);
  });

  test('the land of the week holds the members\' rounded average level, the highest one above them all', () => {
    assert.equal(expeditionLevel([30, 41]), 36);
    assert.equal(expeditionLevel([]), 1);
    for (const land of content.regions) {
      assert.equal(expeditionLand(land.minLevel, content).id, land.id);
      assert.equal(expeditionLand(land.maxLevel, content).id, land.id);
    }
    const top = [...content.regions].sort((a, b) => b.maxLevel - a.maxLevel)[0];
    assert.equal(expeditionLand(top.maxLevel + 40, content).id, top.id);
    const route = guildExpedition({ levels: [58, 61, 62] }, content);
    assert.equal(route.level, 60);
    assert.equal(route.landId, expeditionLand(60, content).id);
    assert.deepEqual(route.guardians, expeditionGuardians(route.landId, content));
  });

  test('every land has seven different guardians of its own: ordinary creatures first, then its elites, the last a champion', () => {
    for (const land of content.regions) {
      const guardians = expeditionGuardians(land.id, content);
      assert.equal(guardians.length, 7, land.id);
      assert.equal(new Set(guardians.map((guardian) => guardian.monsterId)).size, 7, land.id);
      for (const guardian of guardians) {
        const area = content.areasById[guardian.areaId];
        assert.equal(area.regionId, land.id, `${guardian.monsterId} in ${land.id}`);
        assert.ok(content.monstersById[guardian.monsterId], guardian.monsterId);
      }
      const rank = (id) => (content.monstersById[id].champion ? 2 : content.monstersById[id].elite ? 1 : 0);
      const ranks = guardians.map((guardian) => rank(guardian.monsterId));
      assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), land.id);
      assert.equal(ranks.at(-1), 2, `${land.id}: the last a champion`);
      // Its elites are all there.
      const elites = new Set(land.areas.map((area) => area.elite).filter(Boolean));
      for (const elite of elites) assert.ok(guardians.some((guardian) => guardian.monsterId === elite), `${land.id}: ${elite}`);
      assert.deepEqual(expeditionGuardians(land.id, content), guardians);
    }
  });

  test('a stage takes 150 minutes for each member, up to whole tens, at least 150', () => {
    const { perMember, step, min } = rules.stageMinutes;
    assert.equal(expeditionStageMinutes(1, content), Math.max(min, perMember));
    assert.equal(expeditionStageMinutes(5, content), 5 * perMember);
    assert.equal(expeditionStageMinutes(0, content), min);
    const part = 2 + joinShare(3);
    assert.equal(expeditionStageMinutes(part, content), Math.ceil((part * perMember) / step) * step);
    assert.equal(expeditionStageMinutes(part, content) % step, 0);
  });

  test('each guardian is a level higher and has more HP, as the Bestia: members × attacks × a typical attack at its level', () => {
    const route = guildExpedition({ levels: [40, 40, 40] }, content);
    const guardians = route.guardians.map((_, index) => expeditionGuardian({ stage: index + 1, level: route.level, members: 3, guardians: route.guardians }, content));
    guardians.forEach((guardian, index) => {
      assert.equal(guardian.stage, index + 1);
      assert.equal(guardian.level, 40 + index);
      assert.equal(guardian.monsterId, route.guardians[index].monsterId);
      assert.equal(guardian.maxHp, Math.round(3 * rules.guardians[index].attacks * beastAttackDamage(40 + index, content)));
      if (index > 0) assert.ok(guardian.maxHp > guardians[index - 1].maxHp);
    });
    // More members, more HP; a part of a member counts in part.
    const one = expeditionGuardian({ stage: 1, level: 40, members: 1, guardians: route.guardians }, content);
    const more = expeditionGuardian({ stage: 1, level: 40, members: 2.5, guardians: route.guardians }, content);
    assert.equal(more.maxHp, Math.round(2.5 * one.maxHp));
  });

  test('the route walks with the minutes, stops at a guardian keeping the minutes meanwhile, and walks on with them as it falls', () => {
    const need = 300;
    const at = (minutes, walked, beaten, standing = false) => expeditionProgress({ minutes, walked, beaten, need, standing }, content);
    assert.deepEqual(at(0, 0, 0), { stage: 1, progress: 0, need, guardian: false, banked: 0, done: false });
    assert.deepEqual(at(120, 0, 0), { stage: 1, progress: 120, need, guardian: false, banked: 0, done: false });
    // At the end of the stage the guardian bars the way; the minutes wait.
    assert.deepEqual(at(300, 0, 0), { stage: 1, progress: 300, need, guardian: true, banked: 0, done: false });
    assert.deepEqual(at(750, 0, 0, true), { stage: 1, progress: 300, need, guardian: true, banked: 450, done: false });
    // It fell: the kept minutes walk the next stage at once, to its guardian.
    assert.deepEqual(at(750, 300, 1), { stage: 2, progress: 300, need, guardian: true, banked: 150, done: false });
    assert.deepEqual(at(750, 600, 2), { stage: 3, progress: 150, need, guardian: false, banked: 0, done: false });
    // A guardian that came stands, whatever the minutes.
    assert.equal(at(100, 0, 0, true).guardian, true);
    assert.equal(at(9000, 2100, 7).done, true);
  });

  test('a guardian\'s chest: gold by the level, its stage\'s draws of the guardian\'s material, and the last one an item of the class', () => {
    const route = guildExpedition({ levels: [50] }, content);
    const guardian = (stage) => expeditionGuardian({ stage, level: route.level, members: 2, guardians: route.guardians }, content);
    const character = { level: 52, classId: 'archer', classLevel: 45, wornSlots: ['weapon'], seed: 'chest' };
    for (let stage = 1; stage <= 7; stage++) {
      const one = guardian(stage);
      const chest = expeditionChest({ ...character, stage, guardian: one }, content);
      const tuning = rules.guardians[stage - 1];
      assert.equal(chest.gold, Math.round(tuning.gold.base + tuning.gold.perLevel * 52));
      const material = content.materialsByMonster[one.monsterId];
      assert.ok(material, one.monsterId);
      assert.ok(pieces(chest.materials) >= 1, `${stage}: ${JSON.stringify(chest.materials)}`);
      assert.ok(Object.keys(chest.materials).every((key) => key.startsWith(`${material.id}:`)), JSON.stringify(chest.materials));
      assert.deepEqual(expeditionChest({ ...character, stage, guardian: one }, content), chest);
      if (stage < 7) assert.equal(chest.item, null);
      else {
        assert.equal(chest.item.level, 52);
        assert.ok(rarityIndex(chest.item.rarity) >= rarityIndex('epic'));
        assert.ok(content.basesById[chest.item.base].classes?.includes('archer') ?? true, chest.item.base);
      }
    }
  });

  test('an attack on a guardian is the Bestia\'s fight: damage never more than the HP left', () => {
    const character = newCharacter('warrior', { level: 40, classLevel: 40 });
    const route = guildExpedition({ levels: [40] }, content);
    const guardian = expeditionGuardian({ stage: 3, level: route.level, members: 1, guardians: route.guardians }, content);
    const fight = guildBeastFight({ character, equipped: [], name: 'Łowczyni', beast: { ...guardian, hp: guardian.maxHp }, seed: 's' }, content);
    assert.ok(fight.damage > 0 && fight.damage <= guardian.maxHp);
    assert.equal(fight.replay.enemies[0].name, content.monstersById[guardian.monsterId].name);
    const last = guildBeastFight({ character, equipped: [], name: 'Łowczyni', beast: { ...guardian, hp: 4 }, seed: 's' }, content);
    assert.equal(last.damage, 4);
    assert.equal(last.fallen, true);
  });
});

describe('the Wyprawa Gildii through the API', () => {
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
  const view = async (login) => (await as(login, 'GET', '/api/guild/expedition')).data;
  const attack = (login) => as(login, 'POST', '/api/guild/expedition/attack');
  const claim = (login, week, stage) => as(login, 'POST', '/api/guild/expedition/claim', { week, stage });
  const idOf = async (name) => (await first('SELECT id FROM characters WHERE name = ?', name)).id;
  const guildId = async () => (await first("SELECT id FROM guilds WHERE tag = 'SF'")).id;
  const week = () => questPeriod('weekly', Date.now(), content).key;

  async function join(login, tag) {
    const invites = (await as(login, 'GET', '/api/guild')).data.invites;
    return as(login, 'POST', '/api/guild/accept', { guildId: invites.find((invite) => invite.tag === tag).guildId });
  }

  // An exploration of 5 minutes, its time skipped and its report claimed.
  async function explore(login) {
    assert.equal((await as(login, 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).status, 201);
    await as(login, 'POST', '/api/test/skip-time');
    const claimed = await as(login, 'POST', '/api/hunts/claim');
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
  }

  // The minutes of a character on its guild's route this week, set by hand.
  const setMinutes = async (name, minutes, guild = null) =>
    run(
      `INSERT INTO guild_expedition_minutes (guild_id, week, character_id, minutes, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (guild_id, week, character_id) DO UPDATE SET minutes = excluded.minutes`,
      guild ?? (await guildId()),
      week(),
      await idOf(name),
      minutes,
      Date.now(),
    );

  beforeEach(async () => {
    await player('lowczyni', 'Łowczyni');
    await player('tropiciel', 'Tropiciel', 50);
    await as('lowczyni', 'POST', '/api/guild/found', { name: 'Sfora', tag: 'SF' });
    await as('lowczyni', 'POST', '/api/guild/invite', { name: 'Tropiciel' });
    await join('tropiciel', 'SF');
    await run('UPDATE users SET seen_at = ?', Date.now());
  });

  test('the route of the week: the land of the members\' average level, seven guardians ahead, a stage for the active members', async () => {
    const seen = await view('lowczyni');
    const { expedition } = seen;
    assert.equal(expedition.level, 45);
    assert.equal(expedition.land.id, expeditionLand(45, content).id);
    assert.equal(expedition.week, week());
    assert.equal(expedition.stages, 7);
    assert.deepEqual([expedition.stage, expedition.progress, expedition.barred, expedition.done], [1, 0, false, false]);
    assert.equal(expedition.members, 2);
    assert.equal(expedition.need, expeditionStageMinutes(2, content));
    assert.deepEqual(
      expedition.guardians.map((guardian) => [guardian.monsterId, guardian.level, guardian.state]),
      expeditionGuardians(expedition.land.id, content).map((guardian, index) => [guardian.monsterId, 45 + index, 'ahead']),
    );
    assert.deepEqual(seen.attacks, { left: rules.attacksPerDay, perDay: rules.attacksPerDay, blocked: null });
    assert.equal(seen.contributor, false);
    assert.deepEqual(seen.contribution, []);
    assert.deepEqual(seen.chests, []);
    assert.ok(seen.texts.how.length > 0 && !seen.texts.how.join(' ').includes('{'));
    assert.ok(!seen.texts.lead.includes('{'));
    // One route for the guild.
    assert.deepEqual((await view('tropiciel')).expedition, expedition);
    assert.equal((await first('SELECT COUNT(*) AS count FROM guild_expeditions')).count, 1);
    // Outside a guild only the words and the chests.
    await player('samotnik', 'Samotnik');
    const alone = await view('samotnik');
    assert.deepEqual([alone.expedition, alone.chests], [null, []]);
    assert.equal((await attack('samotnik')).data.error.code, 'no_guild');
  });

  test('a claimed exploration\'s minutes go onto the route of the guild the character is in, and stay there after it leaves', async () => {
    await view('lowczyni');
    await explore('lowczyni');
    const seen = await view('tropiciel');
    assert.equal(seen.expedition.progress, 5);
    assert.deepEqual(seen.contribution, [{ name: 'Łowczyni', minutes: 5, own: false }]);
    assert.equal(seen.contributor, false);
    const own = await view('lowczyni');
    assert.equal(own.contributor, true);
    assert.deepEqual(own.own, { minutes: 5 });
    await explore('lowczyni');
    assert.equal((await view('lowczyni')).own.minutes, 10);
    // Out of the guild: its minutes stay on the route, the next go nowhere.
    await as('lowczyni', 'POST', '/api/guild/leave');
    await explore('lowczyni');
    assert.equal((await view('tropiciel')).expedition.progress, 10);
    assert.equal((await first('SELECT SUM(minutes) AS total FROM guild_expedition_minutes')).total, 10);
  });

  test('a Drużyna\'s trip counts for each member who went', async () => {
    await view('lowczyni');
    // Within the Drużyna's spread of class levels.
    await run("UPDATE characters SET class_level = 40 WHERE name = 'Tropiciel'");
    const invited = await as('lowczyni', 'POST', '/api/party/invite', { name: 'Tropiciel' });
    assert.equal(invited.status, 200, JSON.stringify(invited.data).slice(0, 300));
    await as('tropiciel', 'POST', '/api/party/accept', { partyId: invited.data.party.id });
    // In the first, safe place: a trip that faints counts no minutes
    // (651 C), and a random one at level 40 without gear now and then does.
    const went = await as('lowczyni', 'POST', '/api/party/hunt', { areaId: 'windfalls-edge', minutes: 30 });
    assert.equal(went.status, 201, JSON.stringify(went.data).slice(0, 300));
    await as('lowczyni', 'POST', '/api/test/skip-time');
    for (const login of ['lowczyni', 'tropiciel']) assert.equal((await as(login, 'POST', '/api/hunts/claim')).status, 200);
    const seen = await view('lowczyni');
    assert.equal(seen.expedition.progress, 60);
    assert.deepEqual(
      seen.contribution.map((entry) => [entry.name, entry.minutes]).sort(),
      [
        ['Tropiciel', 30],
        ['Łowczyni', 30],
      ],
    );
  });

  test('a guardian comes once the route reaches it; only those who added minutes attack it, three times a day apart from the Bestia', async () => {
    const { expedition } = await view('lowczyni');
    await setMinutes('Łowczyni', expedition.need);
    const seen = await view('tropiciel');
    assert.equal(seen.expedition.barred, true);
    assert.equal(seen.expedition.progress, expedition.need);
    const [guardian] = seen.expedition.guardians;
    assert.equal(guardian.state, 'standing');
    assert.equal(guardian.hp, guardian.maxHp);
    const plan = expeditionGuardians(expedition.land.id, content);
    assert.equal(guardian.maxHp, expeditionGuardian({ stage: 1, level: 45, members: 2, guardians: plan }, content).maxHp);
    assert.equal((await first('SELECT COUNT(*) AS count FROM guild_expedition_guardians')).count, 1);
    // Tropiciel added no minutes this week.
    const refused = await attack('tropiciel');
    assert.equal(refused.status, 409);
    assert.equal(refused.data.error.code, 'not_contributor');
    // Her points given out by class: a warrior of level 40 with none of them
    // spent misses the guardian in about one attack in two hundred, which
    // made this test fail now and then (11.11.2026); so trained, never in
    // thousands of fights.
    assert.equal((await as('lowczyni', 'POST', '/api/character/points/auto')).status, 200);
    for (let left = rules.attacksPerDay - 1; left >= 0; left--) {
      await run('UPDATE guild_expedition_guardians SET hp = max_hp');
      const hit = await attack('lowczyni');
      assert.equal(hit.status, 200, JSON.stringify(hit.data).slice(0, 300));
      assert.equal(hit.data.attacks.left, left);
      assert.ok(hit.data.attack.damage > 0);
      assert.equal(hit.data.attack.fell, false);
      assert.ok(hit.data.attack.fight.enemies.length === 1);
      assert.equal(hit.data.expedition.guardians[0].hp, hit.data.attack.hp);
    }
    assert.equal((await attack('lowczyni')).data.error.code, 'no_attacks');
    // The Bestia's attacks are its own.
    assert.equal((await as('lowczyni', 'GET', '/api/guild/beast')).data.attacks.left, content.guilds.beast.attacksPerDay);
    // A new day, new attacks.
    await run("UPDATE guild_expedition_hits SET day = '2020-01-01'");
    assert.equal((await attack('lowczyni')).status, 200);
    // No XP, gold or items for an attack.
    assert.deepEqual(await first("SELECT xp, gold FROM characters WHERE name = 'Łowczyni'"), { xp: 0, gold: 5000 - content.guilds.found.gold });
    // The dot of the Wyprawa: an attack left on the guardian barring the way.
    assert.equal((await as('lowczyni', 'GET', '/api/guild/todo')).data.todo.expedition, true);
    assert.equal((await as('tropiciel', 'GET', '/api/guild/todo')).data.todo.expedition, false);
  });

  test('the fall walks the route on with the minutes kept meanwhile; a chest for each who added minutes, once, also for a later member', async () => {
    const { expedition } = await view('lowczyni');
    const need = expedition.need;
    // Enough for the first stage and the second one too, kept at the guardian.
    await setMinutes('Łowczyni', 2 * need + 20);
    const at = await view('lowczyni');
    assert.equal(at.expedition.banked, need + 20);
    await run('UPDATE guild_expedition_guardians SET hp = 3');
    const felled = await attack('lowczyni');
    assert.equal(felled.status, 200, JSON.stringify(felled.data).slice(0, 300));
    assert.deepEqual([felled.data.attack.damage, felled.data.attack.hp, felled.data.attack.fell, felled.data.attack.last], [3, 0, true, false]);
    // The kept minutes walk the second stage at once, to its guardian.
    const after = felled.data.expedition;
    assert.equal(after.stage, 2);
    assert.equal(after.barred, true);
    assert.equal(after.banked, 20);
    assert.deepEqual(
      after.guardians.slice(0, 3).map((guardian) => guardian.state),
      ['fallen', 'standing', 'ahead'],
    );
    assert.equal(after.guardians[0].fallenBy, 'Łowczyni');
    assert.equal(after.guardians[1].level, 46);
    // A chest for the one who added minutes; none for the other.
    assert.deepEqual(
      felled.data.chests.map((chest) => [chest.week, chest.stage, chest.item]),
      [[week(), 1, false]],
    );
    assert.equal((await as('lowczyni', 'GET', '/api/guild/todo')).data.todo.expedition, true);
    assert.deepEqual((await view('tropiciel')).chests, []);
    assert.equal((await claim('tropiciel', week(), 1)).data.error.code, 'no_chest');
    const before = await first("SELECT gold, materials FROM characters WHERE name = 'Łowczyni'");
    const opened = await claim('lowczyni', week(), 1);
    assert.equal(opened.status, 200, JSON.stringify(opened.data).slice(0, 300));
    const tuning = rules.guardians[0];
    assert.equal(opened.data.chest.gold, Math.round(tuning.gold.base + tuning.gold.perLevel * 40));
    assert.equal(opened.data.chest.item, null);
    assert.match(opened.data.chest.text, /Skrzynia Wyprawy otwarta/);
    const row = await first("SELECT gold, materials FROM characters WHERE name = 'Łowczyni'");
    assert.equal(row.gold, before.gold + opened.data.chest.gold);
    const material = content.materialsByMonster[after.guardians[0].monsterId];
    const gained = Object.entries(JSON.parse(row.materials)).filter(([key, count]) => count > (JSON.parse(before.materials)[key] ?? 0));
    assert.ok(gained.length > 0 && gained.every(([key]) => key.startsWith(`${material.id}:`)), JSON.stringify(gained));
    for (const one of opened.data.chest.materials) assert.ok(opened.data.character.crafting.materials.some((stack) => stack.key === one.key), one.key);
    assert.deepEqual(opened.data.chests, []);
    assert.equal((await claim('lowczyni', week(), 1)).data.error.code, 'claimed');
    // Tropiciel adds minutes after the fall: the chest is its too.
    await explore('tropiciel');
    const late = await view('tropiciel');
    assert.equal(late.contributor, true);
    assert.deepEqual(
      late.chests.map((chest) => [chest.stage, chest.name]),
      [[1, after.guardians[0].name]],
    );
    assert.equal((await claim('tropiciel', week(), 1)).status, 200);
  });

  test('a later member raises the next stages and guardians by its share of the week; the last guardian\'s chest holds an item and needs room', async () => {
    await view('lowczyni');
    await player('nowa', 'Nowa');
    await as('lowczyni', 'POST', '/api/guild/invite', { name: 'Nowa' });
    await join('nowa', 'SF');
    const share = joinShare(trialDay(Date.now(), content));
    const seen = await view('lowczyni');
    assert.ok(Math.abs(seen.expedition.members - (2 + share)) < 1e-9, `${seen.expedition.members}`);
    assert.equal(seen.expedition.need, expeditionStageMinutes(2 + share, content));
    // The route at its last guardian: six fell.
    const route = await first('SELECT id, level, guardians FROM guild_expeditions');
    const plan = JSON.parse(route.guardians);
    for (let stage = 1; stage <= 6; stage++) {
      await run(
        `INSERT INTO guild_expedition_guardians (expedition_id, stage, monster_id, area_id, level, members, need, max_hp, hp, created_at, fallen_at, fallen_by)
         VALUES (?, ?, ?, ?, ?, 2, 300, 1000, 0, ?, ?, ?)`,
        route.id,
        stage,
        plan[stage - 1].monsterId,
        plan[stage - 1].areaId,
        route.level + stage - 1,
        Date.now(),
        Date.now(),
        await idOf('Łowczyni'),
      );
    }
    await setMinutes('Nowa', 6 * 300 + seen.expedition.need);
    const last = await view('nowa');
    assert.equal(last.expedition.stage, 7);
    assert.equal(last.expedition.barred, true);
    const guardian = last.expedition.guardians[6];
    assert.equal(guardian.state, 'standing');
    assert.ok(content.monstersById[guardian.monsterId].champion);
    assert.equal(guardian.maxHp, expeditionGuardian({ stage: 7, level: route.level, members: 2 + share, guardians: plan }, content).maxHp);
    await run('UPDATE guild_expedition_guardians SET hp = 2 WHERE stage = 7');
    const felled = await attack('nowa');
    assert.deepEqual([felled.data.attack.fell, felled.data.attack.last], [true, true]);
    assert.equal(felled.data.expedition.done, true);
    assert.equal(felled.data.chests.length, 7);
    assert.equal(felled.data.chests.at(-1).item, true);
    assert.equal((await attack('nowa')).data.error.code, 'done');
    // A full bag keeps the item's chest shut; the others open anyway.
    const database = await db();
    const filler = JSON.stringify(generateItem({ baseId: 'ring', level: 1 }, createRng('pełno'), content));
    const id = await idOf('Nowa');
    await database.batch(Array.from({ length: content.balance.items.bagSlots }, () => database.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)').bind(id, filler)));
    const full = await claim('nowa', week(), 7);
    assert.equal(full.data.error.code, 'bag_full');
    assert.equal((await claim('nowa', week(), 6)).status, 200);
    await database.prepare('DELETE FROM items WHERE character_id = ? AND slot IS NULL').bind(id).run();
    const opened = await claim('nowa', week(), 7);
    assert.equal(opened.status, 200, JSON.stringify(opened.data).slice(0, 300));
    const item = JSON.parse((await first('SELECT data FROM items WHERE character_id = ? AND slot IS NULL', id)).data);
    assert.equal(item.level, 40);
    assert.ok(rarityIndex(item.rarity) >= rarityIndex('epic'));
    assert.equal(opened.data.character.bag.find((one) => one.id === opened.data.chest.item.id)?.name, opened.data.chest.item.name);
  });

  test('last week\'s chests wait through this week, older ones go; each week a new route', async () => {
    const now = Date.now();
    const current = questPeriod('weekly', now, content);
    const previous = questPeriod('weekly', current.startsAt - 1, content);
    const older = questPeriod('weekly', previous.startsAt - 1, content);
    const guild = await guildId();
    const id = await idOf('Łowczyni');
    const plan = expeditionGuardians('stone-glade', content);
    async function pastRoute(key) {
      const made = await run("INSERT INTO guild_expeditions (guild_id, week, land_id, level, guardians, active, created_at) VALUES (?, ?, 'stone-glade', 40, ?, 2, ?)", guild, key, JSON.stringify(plan), now);
      await run(
        "INSERT INTO guild_expedition_guardians (expedition_id, stage, monster_id, area_id, level, members, need, max_hp, hp, created_at, fallen_at, fallen_by) VALUES (?, 1, ?, ?, 40, 2, 300, 1000, 0, ?, ?, ?)",
        made.meta.last_row_id,
        plan[0].monsterId,
        plan[0].areaId,
        now,
        now,
        id,
      );
      await run('INSERT INTO guild_expedition_minutes (guild_id, week, character_id, minutes, updated_at) VALUES (?, ?, ?, 300, ?)', guild, key, id, now);
    }
    await pastRoute(previous.key);
    await pastRoute(older.key);
    // The week's new route takes the older weeks' rows away.
    const seen = await view('lowczyni');
    assert.equal(seen.expedition.week, current.key);
    assert.deepEqual([seen.expedition.stage, seen.expedition.progress, seen.contributor], [1, 0, false]);
    assert.deepEqual(
      seen.chests.map((chest) => [chest.week, chest.stage, chest.until]),
      [[previous.key, 1, current.endsAt]],
    );
    assert.equal((await first('SELECT COUNT(*) AS count FROM guild_expeditions WHERE week = ?', older.key)).count, 0);
    assert.equal((await first('SELECT COUNT(*) AS count FROM guild_expedition_minutes WHERE week = ?', older.key)).count, 0);
    assert.equal((await claim('lowczyni', older.key, 1)).data.error.code, 'no_chest');
    // Last week's: for the one who added minutes, even outside the guild now.
    assert.deepEqual((await view('tropiciel')).chests, []);
    await as('lowczyni', 'POST', '/api/guild/leave');
    const outside = await view('lowczyni');
    assert.equal(outside.expedition, null);
    assert.equal(outside.chests.length, 1);
    assert.equal((await claim('lowczyni', previous.key, 1)).status, 200);
    assert.equal((await claim('lowczyni', previous.key, 1)).data.error.code, 'claimed');
  });

  test('a member who leaves and joins again in the same week is counted once on the route; one who joins later adds its share once', async () => {
    const { expedition } = await view('lowczyni');
    assert.equal(expedition.members, 2);
    async function again(login, name) {
      assert.equal((await as(login, 'POST', '/api/guild/leave')).status, 200);
      await as('lowczyni', 'POST', '/api/guild/invite', { name });
      assert.equal((await join(login, 'SF')).status, 200);
    }
    // Tropiciel, active when the route came, leaves and comes back twice:
    // the stages and the guardians stay those of two members.
    await again('tropiciel', 'Tropiciel');
    await again('tropiciel', 'Tropiciel');
    const same = (await view('lowczyni')).expedition;
    assert.equal(same.members, 2);
    assert.equal(same.need, expeditionStageMinutes(2, content));
    // A new member adds its share of the week left, once, however often it comes back.
    await player('nowa', 'Nowa');
    await as('lowczyni', 'POST', '/api/guild/invite', { name: 'Nowa' });
    assert.equal((await join('nowa', 'SF')).status, 200);
    const share = joinShare(trialDay(Date.now(), content));
    assert.ok(Math.abs((await view('lowczyni')).expedition.members - (2 + share)) < 1e-9);
    await again('nowa', 'Nowa');
    const later = (await view('lowczyni')).expedition;
    assert.ok(Math.abs(later.members - (2 + share)) < 1e-9, `${later.members}`);
    assert.equal(later.need, expeditionStageMinutes(2 + share, content));
    const counted = JSON.parse((await first('SELECT counted FROM guild_expeditions')).counted);
    assert.deepEqual(
      counted.sort((a, b) => a - b),
      [await idOf('Łowczyni'), await idOf('Tropiciel'), await idOf('Nowa')].sort((a, b) => a - b),
    );
  });

  test('the chests are found from the character\'s own minutes of the two weeks, never from every guild\'s routes', async () => {
    // Another guild with a fallen guardian of its own, where Łowczyni added nothing.
    await player('obca', 'Obca');
    await as('obca', 'POST', '/api/guild/found', { name: 'Obce Strony', tag: 'OS' });
    await run('UPDATE users SET seen_at = ?', Date.now());
    for (const login of ['lowczyni', 'obca']) await view(login);
    const fall = async (tag) =>
      run(
        `INSERT INTO guild_expedition_guardians (expedition_id, stage, monster_id, area_id, level, members, need, max_hp, hp, created_at, fallen_at, fallen_by)
         SELECT e.id, 1, 'wolf', 'windfalls-edge', 40, 1, 150, 100, 0, ?, ?, NULL FROM guild_expeditions e JOIN guilds g ON g.id = e.guild_id WHERE g.tag = ?`,
        Date.now(),
        Date.now(),
        tag,
      );
    await fall('SF');
    await fall('OS');
    await setMinutes('Łowczyni', 30);
    await setMinutes('Obca', 30, (await first("SELECT id FROM guilds WHERE tag = 'OS'")).id);
    const own = await view('lowczyni');
    assert.deepEqual(
      own.chests.map((chest) => [chest.week, chest.stage]),
      [[week(), 1]],
    );
    assert.equal((await view('obca')).chests.length, 1);
    assert.deepEqual((await view('tropiciel')).chests, []);
    // The query starts from the character's minutes (their index by
    // character), so it reads only the routes of the guilds it added minutes in.
    const current = questPeriod('weekly', Date.now(), content);
    const previous = questPeriod('weekly', current.startsAt - 1, content);
    const id = await idOf('Łowczyni');
    const plan = (await (await db()).prepare(`EXPLAIN QUERY PLAN ${CHESTS_SQL}`).bind(id, previous.key, current.key, 0, id, 0).all()).results.map((step) => step.detail);
    assert.match(plan[0], /guild_expedition_minutes_character/, JSON.stringify(plan));
    assert.ok(!plan.some((step) => /guild_expeditions_week/.test(step)), JSON.stringify(plan));
  });
});

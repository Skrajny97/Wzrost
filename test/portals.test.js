// The Portale Systemu (src/engine/portals.js, src/server/portals.js; the
// author's answers 731–735 and the portals that came after them): the
// stages of a portal, the ordinary creatures of the land whose levels hold
// the stage, at its level, never an elite or a champion, the loot by the
// stage alone, double at its first win, in gold, a camp resource,
// creatures' materials or crafting parts; an entry's fight, which brings
// nothing else; the sweep of a stage won; and the portals through the API,
// from character level 5: fights for the next stage as often as the
// player likes, up to the character's level, sweeps a few times a day in
// each portal, also during an exploration, and their reports kept in the
// Dziennik apart from the others.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { createRng, encounterCombatants, encountersFor, explorationPace, portalAmount, portalArea, portalById, portalExpected, portalFight, portalLoot, portalNext, portalStage, portalSweep } from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rules = content.portals;
const portal = (id) => portalById(id, content);
const rarityIndex = (id) => content.rarities.findIndex((rarity) => rarity.id === id);

describe('the Portale Systemu', () => {
  test('the answers 731–735 and the six portals: from level 5, 5 sweeps a day, a win and a sweep worth about 45 minutes of an exploration', () => {
    assert.equal(content.unlocksById.portals.level, 5);
    assert.equal(rules.sweeps.perDay, 5);
    assert.equal(rules.lootMinutes, 45);
    assert.equal(rules.firstWinMultiplier, 1);
    assert.deepEqual(
      rules.portals.map((one) => one.name),
      ['Portal Złota', 'Portal Drewna', 'Portal Kamienia', 'Portal Rudy', 'Portal Materiałów', 'Portal Części'],
    );
  });

  test('a won stage opens the next, up to the character\'s level and the last stage, 100 for a start', () => {
    assert.equal(rules.maxStage, 100);
    assert.equal(portalNext(0, 5, content), 1);
    assert.equal(portalNext(3, 5, content), 4);
    assert.equal(portalNext(4, 5, content), 5);
    assert.equal(portalNext(5, 5, content), null);
    assert.equal(portalNext(9, 5, content), null);
    assert.equal(portalNext(99, 140, content), 100);
    assert.equal(portalNext(100, 140, content), null);
  });

  test('a stage\'s creatures are stronger than an exploration\'s of their level (the author: "z trudniejszymi stworami niż w Eksploracji")', () => {
    const plan = portalStage(40, 'strong', content);
    const explored = encounterCombatants(plan.encounter, content);
    const portal = portalFight({ character: newCharacter('warrior', { level: 40, classLevel: 40 }), equipped: [], name: 'Wędrowiec', portalId: 'gold', stage: 40, seed: 'strong' }, content).fights[0].enemiesView;
    assert.ok(rules.strength.every((factor) => factor > 1));
    portal.forEach((enemy, index) => assert.ok(enemy.maxHp > explored[index].maxHp, `${enemy.maxHp} vs ${explored[index].maxHp}`));
  });

  test('a stage holds the creatures of the land whose levels hold it, at its level', () => {
    const { areas } = content;
    for (const stage of [1, 5, 6, 37, 100, areas.at(-1).maxLevel]) {
      const area = portalArea(stage, content);
      assert.ok(area.minLevel <= stage && stage <= area.maxLevel, `${stage}: ${area.id}`);
    }
    // Past the last land, its last place.
    assert.equal(portalArea(areas.at(-1).maxLevel + 40, content).id, areas.at(-1).id);
    const plan = portalStage(3, 'up', content);
    assert.equal(plan.level, 3);
    assert.equal(plan.areaId, areas[0].id);
    const living = new Set(areas[0].encounters.flatMap((encounter) => encounter.monsters));
    assert.ok(plan.encounter.members.every((member) => member.level === 3 && living.has(member.monsterId)));
    assert.deepEqual(portalStage(3, 'up', content), plan);
  });

  test('no stage has an elite or a champion (the author: they would fill the Bestiariusz)', () => {
    const rare = new Set(content.areas.flatMap((area) => [area.elite, area.champion]).filter(Boolean));
    for (let stage = 1; stage <= content.areas.at(-1).maxLevel; stage++) {
      const plan = portalStage(stage, `s${stage}`, content);
      assert.equal(plan.encounter.elite, false, `stage ${stage}`);
      assert.ok(plan.encounter.members.every((member) => !rare.has(member.monsterId) && !content.monstersById[member.monsterId].champion), `stage ${stage}`);
    }
  });

  test('a sweep pays a stage\'s plain loot, with its line', () => {
    const sweep = portalSweep('gold', 30, 'seed', content);
    assert.equal(sweep.gold, portalAmount(portal('gold'), 30, false, content));
    assert.match(sweep.text, /^Stopień 30 wyczyszczony\. Łup: \d+ złota\.$/);
    const wood = portalSweep('wood', 30, 'seed', content);
    assert.deepEqual(wood.resources, { wood: portalAmount(portal('wood'), 30, false, content) });
  });

  test('a win and a sweep pay about as much as 45 minutes of an exploration at the stage\'s level (the author), more the higher the stage', () => {
    const rng = createRng('loot');
    // 45 minutes of an exploration: its fights' gold and the gold of its
    // finds, all its resources, the materials of its fights, the parts of
    // its chests taken apart.
    const pace = explorationPace(45, content);
    const stage = 20;
    const expected = portalExpected(stage, content);
    const { rewards } = content.balance;
    assert.ok(expected.gold > rewards.goldPerLevel * stage * pace.fights * pace.timeFactor * 0.3, `${expected.gold}`);
    assert.ok(expected.resources >= (rewards.gatherPerLevelHour * stage * 45) / 60);
    assert.equal(portalLoot(portal('gold'), stage, false, rng, content).gold, Math.round(expected.gold));
    for (const id of ['wood', 'stone', 'ore']) {
      const one = portal(id);
      const loot = portalLoot(one, stage, false, rng, content);
      assert.equal(loot.gold, 0);
      assert.deepEqual(loot.resources, { [one.resource]: Math.round(expected.resources) });
    }
    for (const id of rules.portals.map((one) => one.id)) {
      assert.ok(portalAmount(portal(id), 60, false, content) >= portalAmount(portal(id), 10, false, content), id);
      // A win pays as a sweep (the author: "Czyszczenie i pierwsza walka […] podobnej wielkości").
      assert.equal(portalAmount(portal(id), 30, true, content), portalAmount(portal(id), 30, false, content), id);
      // At least one piece, however low the stage.
      assert.ok(portalAmount(portal(id), 1, false, content) >= 1, id);
    }
    assert.ok(portalAmount(portal('gold'), 60, false, content) > portalAmount(portal('gold'), 20, false, content));
  });

  test('the Portal Materiałów pays materials of the stage\'s ordinary creatures, the Portal Części its parts, now and then rarer', () => {
    const stage = 60;
    const area = portalArea(stage, content);
    const ordinary = new Set(encountersFor(area, stage).flatMap((encounter) => encounter.monsters).map((id) => content.materialsByMonster[id]?.id));
    const pieces = portalAmount(portal('materials'), stage, false, content);
    let raised = 0;
    for (let n = 0; n < 40; n++) {
      const loot = portalLoot(portal('materials'), stage, false, createRng(`m${n}`), content);
      assert.deepEqual([loot.gold, loot.resources, loot.parts], [0, {}, {}]);
      assert.equal(Object.values(loot.materials).reduce((sum, count) => sum + count, 0), pieces);
      for (const key of Object.keys(loot.materials)) {
        const [materialId, rarityId] = key.split(':');
        assert.ok(ordinary.has(materialId), key);
        if (rarityIndex(rarityId) > rarityIndex(content.materialsById[materialId].rarity)) raised += 1;
      }
    }
    assert.ok(raised > 0, 'some pieces are rarer');
    const base = content.partsById[portal('parts').part];
    let rarer = 0;
    for (let n = 0; n < 40; n++) {
      const loot = portalLoot(portal('parts'), stage, true, createRng(`p${n}`), content);
      assert.equal(Object.values(loot.parts).reduce((sum, count) => sum + count, 0), portalAmount(portal('parts'), stage, true, content));
      for (const id of Object.keys(loot.parts)) if (id !== base.id) rarer += 1;
    }
    assert.ok(rarer > 0, 'some parts are rarer');
  });
});

describe('an entry\'s fight', () => {
  const character = newCharacter('warrior', { level: 30, classLevel: 30 });
  const fight = (stage, seed, portalId = 'gold', first = false, who = character) => portalFight({ character: who, equipped: [], name: 'Wędrowiec', portalId, stage, first, seed }, content);

  test('a win brings only its loot: no XP, no items, and the same seed the same fight', () => {
    let won = null;
    for (let i = 0; i < 10 && !won?.portal.won; i++) won = fight(2, `w${i}`);
    assert.equal(won.portal.won, true);
    assert.equal(won.xp, 0);
    assert.deepEqual(won.items, []);
    assert.deepEqual([won.materials, won.parts, won.resources], [{}, {}, {}]);
    assert.equal(won.gold, portalAmount(portal('gold'), 2, false, content));
    assert.equal(won.fights.length, 1);
    assert.deepEqual(fight(2, 'same'), fight(2, 'same'));
    let wood = null;
    for (let i = 0; i < 10 && !wood?.portal.won; i++) wood = fight(2, `d${i}`, 'wood', true);
    assert.equal(wood.portal.won, true);
    assert.equal(wood.gold, 0);
    assert.deepEqual(wood.resources, { wood: portalAmount(portal('wood'), 2, true, content) });
    assert.equal(wood.portal.first, true);
    assert.match(wood.portal.loot, /^drewno \+\d+$/);
  });

  test('a stage starts in the portals\' own words and a lost one leads the character out with nothing', () => {
    const starts = rules.texts.fightStart.map((line) => line.split('{enemies}')[0]);
    const first = fight(3, 'a');
    assert.ok(starts.some((start) => first.entries[0].text.startsWith(start)), first.entries[0].text);
    const weak = newCharacter('mage', { level: 60, classLevel: 50 });
    const lost = fight(60, 'd', 'gold', true, weak);
    if (!lost.portal.won) {
      assert.match(lost.entries[0].text, /z portalu: Wędrowiec\./);
      assert.equal(lost.gold, 0);
      assert.deepEqual(lost.resources, {});
      assert.equal(lost.portal.first, false);
    }
  });

  test('companions fight beside the character and gain nothing', () => {
    const companion = { id: 'c1', name: 'Bratomir', classId: 'warrior', level: 30, gear: [], traits: [], skills: [], relation: 0 };
    let fought = null;
    try {
      fought = portalFight({ character, equipped: [], name: 'Wędrowiec', portalId: 'gold', stage: 5, seed: 'c', companions: [companion] }, content);
    } catch (error) {
      assert.fail(`a companion breaks the fight: ${error.message}`);
    }
    assert.equal(fought.fights[0].allies.length, 2);
    assert.deepEqual(fought.portal.companions, ['Bratomir']);
    assert.equal(fought.xp, 0);
  });

  test('the higher the stage, the stronger the creatures', () => {
    const hp = (stage) => {
      const enemies = fight(stage, 'h').fights[0].enemiesView;
      return enemies.reduce((sum, enemy) => sum + enemy.maxHp, 0) / enemies.length;
    };
    assert.ok(hp(20) > hp(10), `${hp(20)} vs ${hp(10)}`);
    assert.ok(hp(40) > hp(20), `${hp(40)} vs ${hp(20)}`);
  });
});

describe('the Portale through the API', () => {
  const { call, db, signUp } = useServer();
  let cookie = null;
  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const as = (method, path, body) => call(method, path, { cookie, body });
  const enter = (id) => as('POST', '/api/portals/enter', { portal: id });
  const sweep = (id) => as('POST', '/api/portals/sweep', { portal: id });
  const row = async () => (await db()).prepare('SELECT gold, resources, materials, parts, xp, level, met, quests, hp, hp_at, portals FROM characters').first();
  const view = async () => (await as('GET', '/api/portals')).data.portals;
  // A fight won, tried a few times: a level 5 warrior wins the first stages.
  async function win(id) {
    let entered = null;
    for (let i = 0; i < 8 && !entered?.data.report?.portal.won; i++) entered = await enter(id);
    assert.equal(entered.status, 200, JSON.stringify(entered.data).slice(0, 300));
    assert.equal(entered.data.report.portal.won, true, 'the stage is won');
    return entered;
  }

  beforeEach(async () => {
    ({ cookie } = await signUp('wedrowiec'));
    await call('POST', '/api/character', { cookie, body: { name: 'Wędrowiec', classId: 'warrior', appearance: 'female' } });
    await set('level = 5');
  });

  test('the portals open at character level 5', async () => {
    await set('level = 4');
    const locked = await as('GET', '/api/portals');
    assert.equal(locked.status, 403);
    assert.equal(locked.data.error.code, 'locked');
    assert.equal((await enter('gold')).data.error.code, 'locked');
    assert.equal((await sweep('gold')).data.error.code, 'locked');
  });

  test('a fight is for the next stage, as often as the player likes, with its report at once; its first win pays double and opens the next', async () => {
    const portals = await view();
    assert.equal(portals.sweepsPerDay, rules.sweeps.perDay);
    assert.deepEqual(
      portals.portals.map((one) => [one.id, one.best, one.next, one.sweepsLeft]),
      rules.portals.map((one) => [one.id, 0, 1, 0]),
    );
    assert.equal((await enter('none')).data.error.code, 'invalid_portal');
    const before = await row();
    const items = async () => (await (await db()).prepare('SELECT COUNT(*) AS count FROM items').first()).count;
    const itemsBefore = await items();
    const entered = await win('gold');
    const { report } = entered.data;
    assert.equal(report.kind, 'portal');
    assert.equal(report.portal.stage, 1);
    assert.equal(report.portal.first, true);
    assert.equal(report.fights.length, 1);
    assert.equal(report.summary.xp, 0);
    const gold = entered.data.portals.portals.find((one) => one.id === 'gold');
    assert.deepEqual([gold.best, gold.next, gold.sweepsLeft], [1, 2, rules.sweeps.perDay]);
    assert.equal(await items(), itemsBefore);
    // The first win doubled; the creatures fought are in the Bestiariusz;
    // nothing else changed.
    const after = await row();
    assert.equal(after.gold - before.gold, portalAmount(portal('gold'), 1, true, content));
    const met = JSON.parse(after.met);
    assert.ok(report.fights[0].enemies.every((enemy) => met.includes(enemy.monsterId)));
    for (const key of ['xp', 'level', 'quests', 'hp', 'hp_at', 'resources', 'materials', 'parts']) assert.deepEqual(after[key], before[key], key);
    // Far more fights than any daily number, every one for the next stage
    // (won or lost: a character of level 60 at stages it may not beat).
    await set('level = 60');
    for (let i = 0; i < 25; i++) assert.equal((await enter('stone')).status, 200, `fight ${i}`);
    const journal = (await as('GET', '/api/reports')).data.reports;
    assert.equal(journal[0].kind, 'portal');
  });

  test('never above the character\'s level', async () => {
    await set('portals = ?', JSON.stringify({ best: { stone: 5 } }));
    const stone = (await view()).portals.find((one) => one.id === 'stone');
    assert.equal(stone.next, null);
    assert.equal((await enter('stone')).data.error.code, 'level');
  });

  test('a sweep pays the highest stage won at once, five times a day in each portal, and comes back from midnight', async () => {
    assert.equal((await sweep('gold')).data.error.code, 'no_stage');
    await set('portals = ?', JSON.stringify({ best: { gold: 4, wood: 3, materials: 5, parts: 2 } }));
    const before = await row();
    const first = await sweep('gold');
    assert.equal(first.status, 200, JSON.stringify(first.data).slice(0, 300));
    assert.equal(first.data.sweep.stage, 4);
    assert.match(first.data.sweep.text, /^Stopień 4 wyczyszczony/);
    assert.equal((await row()).gold - before.gold, portalAmount(portal('gold'), 4, false, content));
    for (let i = 1; i < rules.sweeps.perDay; i++) assert.equal((await sweep('gold')).status, 200);
    assert.equal((await sweep('gold')).data.error.code, 'no_sweeps');
    assert.equal((await view()).portals.find((one) => one.id === 'gold').sweepsLeft, 0);
    // Each portal has its own.
    for (const id of ['wood', 'materials', 'parts']) assert.equal((await sweep(id)).status, 200, id);
    const after = await row();
    const grew = (column) => {
      const old = JSON.parse(before[column]);
      const now = JSON.parse(after[column]);
      return Object.keys(now).reduce((sum, key) => sum + now[key] - (old[key] ?? 0), 0);
    };
    assert.equal(grew('resources'), portalAmount(portal('wood'), 3, false, content));
    assert.equal(grew('materials'), portalAmount(portal('materials'), 5, false, content));
    assert.equal(grew('parts'), portalAmount(portal('parts'), 2, false, content));
    // A new day, new sweeps.
    const stored = JSON.parse(after.portals);
    await set('portals = ?', JSON.stringify({ ...stored, day: '2020-01-01' }));
    assert.equal((await sweep('gold')).status, 200);
  });

  test('in also during an exploration and before its report is claimed (732 A), and the report claimed after', async () => {
    assert.equal((await as('POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).status, 201);
    assert.equal((await enter('gold')).status, 200);
    await (await db()).prepare('UPDATE activities SET started_at = started_at - 300000, ends_at = ends_at - 300000').run();
    assert.equal((await enter('materials')).status, 200);
    await set('portals = ?', JSON.stringify({ best: { parts: 1 } }));
    assert.equal((await sweep('parts')).status, 200);
    let claimed = await as('POST', '/api/hunts/claim');
    if (claimed.data.event) claimed = await as('POST', '/api/hunts/claim', { choice: claimed.data.event.options[0].id });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
  });

  test('the Dziennik keeps the portals\' reports apart: a new one pushes out only the oldest of its own kind', async () => {
    const { reports: kept, portalReports } = content.balance.journal;
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    const insert = database.prepare('INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) VALUES (?, ?, ?, ?, ?, ?)');
    await database.batch([
      ...Array.from({ length: kept }, (_, index) => insert.bind(id, `old-hunt-${index}`, 'hunt', index, '{}', '{}')),
      ...Array.from({ length: portalReports }, (_, index) => insert.bind(id, `old-portal-${index}`, 'portal', index, '{}', '{}')),
    ]);
    const kinds = async () => Object.fromEntries((await database.prepare('SELECT kind, COUNT(*) AS count FROM reports GROUP BY kind').all()).results.map((one) => [one.kind, one.count]));
    const stays = async (key) => Boolean(await database.prepare('SELECT 1 AS found FROM reports WHERE activity_key = ?').bind(key).first());
    assert.equal((await enter('gold')).status, 200);
    assert.deepEqual(await kinds(), { hunt: kept, portal: portalReports });
    assert.equal(await stays('old-portal-0'), false);
    assert.equal(await stays('old-portal-1'), true);
    assert.equal(await stays('old-hunt-0'), true);
    assert.equal((await as('GET', '/api/reports')).data.reports.length, kept + portalReports);
  });
});

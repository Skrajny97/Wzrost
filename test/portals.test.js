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
// Dziennik apart from the others; and a few stages at one tap (×5, ×10, "Do
// oporu", 19.11.2026), each fight a single entry's, until the first loss,
// with one report for them all.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { createRng, encounterCombatants, encountersFor, explorationPace, portalAmount, portalArea, portalById, portalExpected, portalFight, portalLoot, portalLootText, portalNext, portalSeries, portalStage, portalSweep } from '../src/engine/index.js';
import { say } from '../src/engine/text.js';
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

  test('a won stage opens the next, up to the character\'s level and the last stage, the highest level of a character (the author: "Portale trzeba zwiększyć tak daleko jak to możliwe")', () => {
    assert.equal(rules.maxStage, content.balance.progression.maxLevel);
    assert.equal(rules.maxStage, 500);
    assert.equal(portalNext(0, 5, content), 1);
    assert.equal(portalNext(3, 5, content), 4);
    assert.equal(portalNext(4, 5, content), 5);
    assert.equal(portalNext(5, 5, content), null);
    assert.equal(portalNext(9, 5, content), null);
    // Past the old last stage, 100.
    assert.equal(portalNext(99, 140, content), 100);
    assert.equal(portalNext(100, 140, content), 101);
    assert.equal(portalNext(140, 140, content), null);
    assert.equal(portalNext(499, 500, content), 500);
    assert.equal(portalNext(500, 500, content), null);
  });

  test('a stage past the last land holds the creatures of its last place, at the stage\'s level, and pays more than the stage below', () => {
    const last = content.areas.reduce((top, area) => (area.maxLevel > top.maxLevel ? area : top));
    for (const stage of [last.maxLevel + 1, 400, rules.maxStage]) {
      assert.equal(portalArea(stage, content).id, last.id);
      const plan = portalStage(stage, 'far', content);
      assert.equal(plan.level, stage);
      plan.encounter.members.forEach((member) => assert.equal(member.level, stage));
      assert.ok(portalAmount(portalById('gold', content), stage, false, content) > portalAmount(portalById('gold', content), stage - 1, false, content));
    }
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

  test('a few stages at one tap: the last fight, the loot of every stage won, and the series in words', () => {
    const texts = rules.series.texts;
    assert.deepEqual(
      rules.series.options.map((one) => [one.id, one.count ?? null, one.label]),
      [
        ['five', 5, '×5'],
        ['ten', 10, '×10'],
        ['max', null, 'Do oporu'],
      ],
    );
    // A hunt as portalFight returns it, of a fight won or lost on a stage.
    const hunt = (stage, won) => ({
      portal: { stage, won, loot: won ? `${stage} złota` : '' },
      gold: won ? stage : 0,
      resources: {},
      materials: {},
      parts: {},
      fights: [{ stage }],
      entries: [{ t: 0, type: 'fight', fight: 0, text: `Walka ${stage}.` }],
    });
    // Five won of five, the next open: all their gold, the last fight played.
    const five = portalSeries([11, 12, 13, 14, 15].map((stage) => hunt(stage, true)), { best: 10, level: 30 }, content);
    assert.deepEqual([five.from, five.to, five.won, five.highest, five.next], [11, 15, 5, 15, 16]);
    assert.equal(five.result, 'Stopnie 11–15 pokonane.');
    assert.equal(five.stop, '5 walk za Tobą. Dalej czeka stopień 16.');
    assert.equal(five.range, 'stopnie 11–15');
    assert.equal(five.chip, '5 pokonanych');
    assert.equal(five.loot, `${11 + 12 + 13 + 14 + 15} złota`);
    assert.equal(five.hunt.gold, 11 + 12 + 13 + 14 + 15);
    assert.deepEqual(five.hunt.fights, [{ stage: 15 }]);
    assert.deepEqual(
      five.hunt.entries.map((entry) => entry.text),
      [11, 12, 13, 14, 15].map((stage) => `Stopień ${stage}. Walka ${stage}.`),
    );
    // Only the last fight's lines name the fight the report plays.
    assert.deepEqual(
      five.hunt.entries.map((entry) => entry.fight),
      [undefined, undefined, undefined, undefined, 0],
    );
    assert.equal(say(texts, 'stopCount', 0, { fights: 2, stage: 3 }), '2 walki za Tobą. Dalej czeka stopień 3.');
    // Lost on the third: the two before won, the third still open.
    const lost = portalSeries([hunt(21, true), hunt(22, true), hunt(23, false)], { best: 20, level: 40 }, content);
    assert.deepEqual([lost.won, lost.highest, lost.next, lost.hunt.gold], [2, 22, 23, 21 + 22]);
    assert.equal(lost.result, 'Stopnie 21–22 pokonane.');
    assert.equal(lost.stop, 'Stopień 23: porażka.');
    assert.equal(lost.range, 'stopnie 21–23');
    // Lost on the first: nothing won.
    const none = portalSeries([hunt(7, false)], { best: 6, level: 40 }, content);
    assert.deepEqual([none.won, none.highest, none.loot, none.hunt.gold], [0, 6, '', 0]);
    assert.equal(none.result, 'Żaden stopień nie został pokonany.');
    assert.equal(none.range, 'stopień 7');
    assert.equal(none.chip, '0 pokonanych');
    // Up to the character's level, and up to the portals' last stage.
    const top = portalSeries([hunt(33, true)], { best: 32, level: 33 }, content);
    assert.deepEqual([top.result, top.stop, top.next], ['Stopień 33 pokonany.', 'Dalej otworzy się na poziomie postaci 34.', null]);
    const last = portalSeries([hunt(rules.maxStage - 1, true), hunt(rules.maxStage, true)], { best: rules.maxStage - 2, level: rules.maxStage }, content);
    assert.equal(last.stop, 'To ostatni stopień tego portalu. Kolejne stopnie przyjdą później.');
    // The sums a series brings, written as the page writes its numbers.
    assert.equal(portalLootText({ gold: 16834, resources: { wood: 12345 }, materials: {}, parts: { scraps: 1500 } }, content), '16\u00a0834 złota, drewno +12\u00a0345, ścinki ×1500');
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

  test('the report of a stage won names the next stage open, and none at the character\'s level (the next fight at the top of the report)', async () => {
    const entered = await win('gold');
    assert.equal(entered.data.report.portal.stage, 1);
    assert.equal(entered.data.report.portal.next, 2);
    const stored = (await as('GET', `/api/reports/${entered.data.report.id}`)).data.report;
    assert.equal(stored.portal.next, 2);
    // A fight at the character's level (5): won, stage 6 waits for level 6;
    // lost, stage 5 stays the next. Either way, whatever the fight's luck.
    await set('portals = ?', JSON.stringify({ best: { wood: 4 } }));
    const last = await enter('wood');
    assert.equal(last.status, 200, JSON.stringify(last.data).slice(0, 300));
    assert.equal(last.data.report.portal.stage, 5);
    assert.equal(last.data.report.portal.next, last.data.report.portal.won ? null : 5);
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

  test('"Wyczyść wszystkie" uses every sweep left today in every portal with a stage won, at once, and then says there is nothing left', async () => {
    const sweepAll = () => as('POST', '/api/portals/sweep-all');
    assert.equal((await sweepAll()).data.error.code, 'no_sweeps');
    await set('portals = ?', JSON.stringify({ best: { gold: 4, wood: 3, materials: 5 } }));
    // Two of the gold portal's sweeps used before.
    for (let i = 0; i < 2; i++) assert.equal((await sweep('gold')).status, 200);
    const before = await row();
    const all = await sweepAll();
    assert.equal(all.status, 200, JSON.stringify(all.data).slice(0, 300));
    assert.deepEqual(
      all.data.sweep.swept.map((one) => [one.portal, one.stage, one.count]),
      [
        ['gold', 4, rules.sweeps.perDay - 2],
        ['wood', 3, rules.sweeps.perDay],
        ['materials', 5, rules.sweeps.perDay],
      ],
    );
    assert.match(all.data.sweep.text, /^Wyczyszczone portale: Portal Złota ×3: \d+ złota; Portal Drewna ×5: drewno \+\d+; Portal Materiałów ×5: .+\.$/);
    const after = await row();
    assert.equal(after.gold - before.gold, (rules.sweeps.perDay - 2) * portalAmount(portal('gold'), 4, false, content));
    const grew = (column) => {
      const old = JSON.parse(before[column]);
      const now = JSON.parse(after[column]);
      return Object.keys(now).reduce((sum, key) => sum + now[key] - (old[key] ?? 0), 0);
    };
    assert.equal(grew('resources'), rules.sweeps.perDay * portalAmount(portal('wood'), 3, false, content));
    assert.equal(grew('materials'), rules.sweeps.perDay * portalAmount(portal('materials'), 5, false, content));
    assert.ok(all.data.portals.portals.every((one) => one.sweepsLeft === 0));
    assert.equal((await sweepAll()).data.error.code, 'no_sweeps');
    assert.equal((await sweep('wood')).data.error.code, 'no_sweeps');
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

  // A few stages at one tap (a player's idea, the author: „mądre pomysły”,
  // 19.11.2026): ×5, ×10 and "Do oporu", each fight as a single entry.
  const series = (id, kind, from, extra = {}) => as('POST', '/api/portals/enter', { portal: id, series: kind, from, ...extra });
  // A warrior far stronger than the stages it fights: it wins every one of
  // them, whatever the seeds (in 2000 fights on each of stages 1–20, with at
  // least 91% of its HP left).
  const strong = () => set('level = 20, class_level = 20, points = ?', JSON.stringify({ strength: 400, vitality: 400, endurance: 200, dexterity: 100 }));
  const reportCount = async () => (await (await db()).prepare("SELECT COUNT(*) AS count FROM reports WHERE kind = 'portal'").first()).count;
  const goldOf = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => portalAmount(portal('gold'), from + index, true, content)).reduce((sum, one) => sum + one, 0);

  test('×5 fights five stages one after another at one tap, with one report for all: the last fight, the loot of each first win, the stages won and the next one open', async () => {
    await strong();
    const before = await row();
    const fought = await series('gold', 'five', 1);
    assert.equal(fought.status, 200, JSON.stringify(fought.data).slice(0, 300));
    const { report } = fought.data;
    assert.equal(report.kind, 'portal');
    assert.equal(report.result, 'success');
    assert.equal(report.resultText, 'Stopnie 1–5 pokonane.');
    assert.deepEqual(report.portal.series, { id: 'five', from: 1, to: 5, won: 5, range: 'stopnie 1–5', loot: `${goldOf(1, 5)} złota`, stop: '5 walk za Tobą. Dalej czeka stopień 6.' });
    // The last fight as a single entry's report shows it, the next stage open.
    assert.deepEqual([report.portal.stage, report.portal.won, report.portal.next, report.fights.length], [5, true, 6, 1]);
    assert.ok(report.fights[0].events.length > 0);
    assert.equal(report.portal.loot, `${portalAmount(portal('gold'), 5, true, content)} złota`);
    assert.deepEqual(
      report.entries.map((entry) => entry.text.split('. ')[0]),
      [1, 2, 3, 4, 5].map((stage) => `Stopień ${stage}`),
    );
    // One report, the loot of the five first wins, the creatures met, the
    // stage won; nothing else.
    assert.equal(await reportCount(), 1);
    const after = await row();
    assert.equal(after.gold - before.gold, goldOf(1, 5));
    assert.equal(report.summary.gold, goldOf(1, 5));
    assert.equal(JSON.parse(after.portals).best.gold, 5);
    const met = JSON.parse(after.met);
    assert.ok(report.fights[0].enemies.every((enemy) => met.includes(enemy.monsterId)));
    for (const key of ['xp', 'level', 'quests', 'hp', 'hp_at', 'resources', 'materials', 'parts']) assert.deepEqual(after[key], before[key], key);
    // The Dziennik: the stages fought and how many were won.
    const [listed] = (await as('GET', '/api/reports')).data.reports;
    assert.deepEqual([listed.result, listed.portal.loot, listed.portal.series], ['success', `${goldOf(1, 5)} złota`, { range: 'stopnie 1–5', chip: '5 pokonanych' }]);
    const gold = fought.data.portals.portals.find((one) => one.id === 'gold');
    assert.deepEqual([gold.best, gold.next], [5, 6]);
    // A resource's portal pays its resource, each stage's first win.
    const wood = await series('wood', 'five', 1);
    assert.equal(wood.status, 200);
    const pieces = [1, 2, 3, 4, 5].reduce((sum, stage) => sum + portalAmount(portal('wood'), stage, true, content), 0);
    assert.equal(JSON.parse((await row()).resources).wood - (JSON.parse(before.resources).wood ?? 0), pieces);
    assert.equal(await reportCount(), 2);
  });

  test('a series stops at its first loss: the stages won before it pay, the stage lost stays the next', async () => {
    // Of level 300 with nothing spent: the first ten stages it wins (in 3000
    // fights on each, with a third of its HP left at the least), from stage
    // 36 on it loses (all but one in 3000), so "Do oporu" stops on a loss.
    await set('level = 300');
    const before = await row();
    const fought = await series('gold', 'max', 1);
    assert.equal(fought.status, 200, JSON.stringify(fought.data).slice(0, 300));
    const { report } = fought.data;
    const lost = report.portal.series.to;
    assert.ok(lost > 10 && lost <= 40, `lost on stage ${lost}`);
    assert.equal(report.portal.won, false);
    assert.equal(report.portal.stage, lost);
    assert.equal(report.portal.next, lost);
    assert.deepEqual([report.portal.series.from, report.portal.series.won], [1, lost - 1]);
    assert.equal(report.resultText, `Stopnie 1–${lost - 1} pokonane.`);
    assert.equal(report.portal.series.stop, `Stopień ${lost}: porażka.`);
    assert.equal(report.entries.length, lost);
    assert.equal(report.fights[0].won, false);
    const after = await row();
    assert.equal(after.gold - before.gold, goldOf(1, lost - 1));
    assert.equal(JSON.parse(after.portals).best.gold, lost - 1);
    assert.equal(await reportCount(), 1);
    // The next tap starts from the stage lost.
    assert.equal((await series('gold', 'five', lost - 1)).data.error.code, 'stale_stage');
  });

  test('"Do oporu" goes up to the character\'s level, ×10 too when fewer are open; then nothing is left to fight', async () => {
    await strong();
    await set('portals = ?', JSON.stringify({ best: { gold: 10, stone: 15 } }));
    const fought = await series('gold', 'max', 11);
    assert.equal(fought.status, 200, JSON.stringify(fought.data).slice(0, 300));
    const { report } = fought.data;
    assert.deepEqual([report.portal.series.from, report.portal.series.to, report.portal.series.won], [11, 20, 10]);
    assert.equal(report.portal.series.stop, 'Dalej otworzy się na poziomie postaci 21.');
    assert.equal(report.portal.next, null);
    assert.equal(JSON.parse((await row()).portals).best.gold, 20);
    // ×10 with five stages open fights those five.
    const ten = await series('stone', 'ten', 16);
    assert.equal(ten.status, 200);
    assert.deepEqual([ten.data.report.portal.series.from, ten.data.report.portal.series.to, ten.data.report.portal.series.stop], [16, 20, 'Dalej otworzy się na poziomie postaci 21.']);
    assert.equal((await series('gold', 'max', 21)).data.error.code, 'level');
    assert.equal((await enter('gold')).data.error.code, 'level');
    assert.equal(await reportCount(), 2);
  });

  test('a stale or a double tap fights nothing: the stage the page saw must still be the next', async () => {
    await strong();
    await set('portals = ?', JSON.stringify({ best: { gold: 3 } }));
    const before = await row();
    // A page left open while the portal moved on.
    const stale = await series('gold', 'ten', 2);
    assert.equal(stale.status, 409);
    assert.equal(stale.data.error.code, 'stale_stage');
    assert.equal(stale.data.error.message, 'Portal zmienił się w międzyczasie. Spróbuj jeszcze raz.');
    assert.deepEqual(await row(), before);
    assert.equal(await reportCount(), 0);
    // Two taps at once: one series, the other refused.
    const both = await Promise.all([series('gold', 'five', 4), series('gold', 'five', 4)]);
    assert.deepEqual(both.map((one) => one.status).sort(), [200, 409], JSON.stringify(both.map((one) => one.data.error)));
    assert.ok(['character_changed', 'stale_stage'].includes(both.find((one) => one.status === 409).data.error.code));
    const after = await row();
    assert.equal(after.gold - before.gold, goldOf(4, 8));
    assert.equal(JSON.parse(after.portals).best.gold, 8);
    assert.equal(await reportCount(), 1);
    // The same tap once more, after the first came back.
    assert.equal((await series('gold', 'five', 4)).data.error.code, 'stale_stage');
    assert.equal((await row()).gold, after.gold);
    // A series the game has not got.
    const unknown = await series('gold', 'twenty', 9);
    assert.equal(unknown.status, 400);
    assert.equal(unknown.data.error.code, 'invalid_series');
  });
});

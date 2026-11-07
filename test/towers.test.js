// The Wieże Systemu (src/engine/towers.js, src/server/towers.js): the floors
// of a climb, floor 1 of level 50 and each next one a level higher (0.2.11),
// the creatures of every land in turn at the floor's level, made stronger
// by the System (744),
// elites on the fifth floors of every other lap of the regions and
// champions every championEvery floors (the 25th since Sosnowe Wydmy),
// champions of every land in turn, every creature somewhere, the top open
// to a party; an entry's fight and its pay, the champion's trophy only at the
// first win of its floor; and the towers through the API, from level 50,
// with the entries of a day, the chest of a tenth floor once, the trophy
// once, the Wieża Drużyn with a Drużyna, never on an exploration, and
// their reports kept in the Dziennik apart from the explorations'.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  areaDangers,
  createRng,
  encountersFor,
  expectedExploration,
  materialDrops,
  monsterXp,
  parseStack,
  portalAmount,
  portalById,
  towerArea,
  towerEliteFloor,
  towerFight,
  towerFloor,
  towerGold,
  towerLevel,
  towerMaterialRarities,
  towerMaterials,
  towerTop,
} from '../src/engine/index.js';
import { encounterCombatants } from '../src/engine/hunt.js';
import { makeClimber, strongClimber } from './helpers/climb.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

// A champion's floor: every championEvery floors (data/towers.json; 342 A
// said the 15th, the 25th since the 30 regions of Sosnowe Wydmy).
const CHAMPION = content.towers.floors.championEvery;
const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));

describe('the Wieże Systemu', () => {
  test('floor 1 is of level 50, each next one a level higher (0.2.11); the floors open one by one as they are won, whatever the level (0.2.12)', () => {
    assert.equal(content.towers.firstFloorLevel, 50);
    assert.equal(content.towers.firstFloorLevel, content.unlocksById.towers.level);
    assert.equal(towerLevel(1, content), 50);
    assert.equal(towerLevel(11, content), 60);
    assert.equal(towerTop(undefined), 1);
    assert.equal(towerTop(0), 1);
    assert.equal(towerTop(30), 31);
  });

  test('the System makes the creatures three times as strong: three times the HP (746 B)', () => {
    assert.deepEqual(content.towers.strength, [3, 3]);
    const plain = { ...content, towers: { ...content.towers, strength: [1, 1] } };
    const climber = newCharacter('warrior', { level: 60, classLevel: 50 });
    const hp = (rules) => towerFight({ character: climber, equipped: [], name: 'Wspinacz', floor: 3, seed: 'moc' }, rules).fights[0].enemiesView[0].maxHp;
    assert.ok(Math.abs(hp(content) / hp(plain) - 3) < 0.03, `${hp(content)} vs ${hp(plain)}`);
  });

  test('in the Wieża Drużyn the System\'s strength goes as many times over as there are fighters on the party\'s side (0.2.18)', () => {
    const fighter = (classId) => ({ character: newCharacter(classId, { level: 60, classLevel: 50 }), equipped: [], name: classId });
    const climber = newCharacter('warrior', { level: 60, classLevel: 50 });
    const enemy = (partners) => towerFight({ character: climber, equipped: [], name: 'Wspinacz', floor: 3, seed: 'moc', partners }, content).fights[0].enemiesView[0].maxHp;
    const [damage, hp] = content.towers.strength;
    const expected = (fighters) => encounterCombatants(towerFloor(3, 'moc', content).encounter, content, { strength: [damage * fighters, hp * fighters] })[0].maxHp;
    assert.equal(enemy([fighter('cleric')]), expected(2));
    assert.equal(enemy([fighter('cleric'), fighter('mage')]), expected(3));
  });

  test('a floor holds one inner region\'s creatures at its level, the regions in turn from the first', () => {
    const { areas } = content;
    assert.equal(towerArea(1, content).id, areas[0].id);
    assert.equal(towerArea(2, content).id, areas[1].id);
    assert.equal(towerArea(areas.length + 1, content).id, areas[0].id);
    const floor = towerFloor(3, 'climb', content);
    assert.equal(floor.level, 52);
    assert.equal(floor.areaId, areas[2].id);
    const living = new Set(areas[2].encounters.flatMap((encounter) => encounter.monsters));
    assert.ok(floor.encounter.members.every((member) => member.level === 52 && living.has(member.monsterId)));
    assert.deepEqual(towerFloor(3, 'climb', content), floor);
  });

  test('every fifth floor an elite only in every other lap of the regions (484 A), a champion every championEvery floors in every lap (342 A), and elites now and then on other floors', () => {
    const lap = (floor) => Math.floor((floor - 1) / content.areas.length);
    for (let floor = 5; floor <= 400; floor += 5) {
      const { encounter } = towerFloor(floor, 'climb', content);
      const area = towerArea(floor, content);
      // The first lap as before, the next one without, and so on in turn.
      assert.equal(towerEliteFloor(floor, content), lap(floor) % 2 === 0, `floor ${floor}`);
      if (floor % CHAMPION === 0 && area.champion) assert.equal(encounter.members[0].monsterId, area.champion, `floor ${floor}`);
      else if (lap(floor) % 2 === 0 && area.elite) assert.equal(encounter.members[0].monsterId, area.elite, `floor ${floor}`);
    }
    // A lap is as long as the inner regions are many (40 with Ostępy
    // Nowiu), so the floors of each lap follow from the data.
    const regions = content.areas.length;
    const fifths = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index).filter((floor) => floor % 5 === 0);
    assert.ok(fifths(1, regions).every((floor) => towerEliteFloor(floor, content)), 'the first lap keeps its elites');
    assert.ok(fifths(regions + 1, 2 * regions).every((floor) => !towerEliteFloor(floor, content)), 'the second lap has none');
    assert.ok(fifths(2 * regions + 1, 3 * regions).every((floor) => towerEliteFloor(floor, content)), 'the third lap has them again');
    assert.equal([1, 2, 3, 4, regions + 1, regions + 4, 2 * regions + 1].some((floor) => towerEliteFloor(floor, content)), false);
    // In the laps between, a fifth floor (not a champion's) is a usual floor
    // of its region: its creatures, an elite only now and then.
    const usual = Array.from({ length: 400 }, (_, index) => index + 1).filter((floor) => floor % 5 === 0 && lap(floor) % 2 === 1 && floor % CHAMPION !== 0);
    let elites = 0;
    for (const floor of usual) {
      for (let n = 0; n < 10; n++) {
        const { encounter } = towerFloor(floor, `usual${n}`, content);
        if (encounter.elite) {
          elites += 1;
          continue;
        }
        const open = encountersFor(towerArea(floor, content), floor).map((group) => group.monsters.join());
        assert.ok(open.includes(encounter.members.map((member) => member.monsterId).join()), `floor ${floor}: ${JSON.stringify(encounter)}`);
      }
    }
    assert.ok(elites > usual.length * 10 * 0.03 && elites < usual.length * 10 * 0.2, `${elites} of ${usual.length * 10}`);
    // Champions of every land in turn, not of two (342 A): with 30 regions
    // every 15th floor would meet only the Wodnik and the Raróg.
    const champions = new Set(Array.from({ length: 20 }, (_, index) => (index + 1) * CHAMPION).map((floor) => towerFloor(floor, 'climb', content).encounter).filter((encounter) => encounter.champion).map((encounter) => encounter.members[0].monsterId));
    assert.deepEqual([...champions].sort(), content.areas.filter((area) => area.champion).map((area) => area.champion).sort());
    const others = Array.from({ length: 1000 }, (_, index) => index + 1).filter((floor) => floor % 5 !== 0);
    const random = others.filter((floor) => towerFloor(floor, 'climb', content).encounter.elite).length;
    assert.ok(random > others.length * 0.05 && random < others.length * 0.2, `${random}`);
  });

  test('every creature of every region comes on some floor, those of each land\'s last region too, as usual creatures (484 A)', () => {
    // The first four laps of the regions, or as many as the champions'
    // floors take to come round to every region (five with 40 regions and
    // every 25th floor), many climbs on each floor.
    const met = new Map(content.areas.map((area) => [area.id, new Set()]));
    const usual = new Map(content.areas.map((area) => [area.id, new Set()]));
    const laps = Math.max(4, CHAMPION / gcd(CHAMPION, content.areas.length));
    for (let floor = 1; floor <= laps * content.areas.length; floor++) {
      for (let n = 0; n < 40; n++) {
        const { areaId, encounter } = towerFloor(floor, `every${n}`, content);
        for (const { monsterId } of encounter.members) {
          met.get(areaId).add(monsterId);
          if (!encounter.elite && !encounter.champion) usual.get(areaId).add(monsterId);
        }
      }
    }
    for (const area of content.areas) {
      for (const danger of areaDangers(area, content)) {
        assert.ok(met.get(area.id).has(danger.monsterId), `${area.id}: ${danger.monsterId}`);
        if (!danger.elite && !danger.champion) assert.ok(usual.get(area.id).has(danger.monsterId), `${area.id}: ${danger.monsterId} in a usual fight`);
      }
    }
    // Before 484 A these never came: the creatures of each land's last region.
    for (const monsterId of ['boar', 'stag', 'wildcat', 'black-stork', 'bear', 'aurochs', 'aesculapian-snake', 'strzyga', 'skeleton', 'drowner', 'sludger', 'mud-goblin', 'peat-cutter', 'bog-worm', 'mine-spirit', 'giant-rat']) {
      assert.ok([...usual.values()].some((seen) => seen.has(monsterId)), monsterId);
    }
  });
});

describe('an entry\'s fight', () => {
  const character = newCharacter('warrior', { level: 60, classLevel: 50 });
  // Strong enough for the low floors and the first champions
  // (tests/helpers/climb.js).
  const { character: climber, equipped: gear } = strongClimber();

  test('alone on a floor the monsters have half the late growth, with a partner all of it; up to 50 the same (438.3 A)', () => {
    const climber = newCharacter('warrior', { level: 110, classLevel: 100 });
    const partner = { character: newCharacter('mage', { level: 110, classLevel: 100 }), equipped: [], name: 'Druh' };
    // Per fighter on the character's side, as the System's strength goes
    // as many times over as there are fighters (0.2.18).
    const hp = (floor, partners) => towerFight({ character: climber, equipped: [], name: 'Wspinacz', floor, seed: 'g', partners }, content).fights[0].enemiesView[0].maxHp / (1 + partners.length);
    // Floor 1 is of level 50; floors 51 and 91 of 100 and 140.
    assert.ok(Math.abs(hp(1, []) - hp(1, [partner])) <= 1, `${hp(1, [])} vs ${hp(1, [partner])}`);
    for (const floor of [51, 91]) assert.ok(hp(floor, []) < hp(floor, [partner]) * 0.8, `${floor}: ${hp(floor, [])} vs ${hp(floor, [partner])}`);
  });

  test('a floor starts and ends in the towers\' own words, the name after a colon', () => {
    const won = towerFight({ character, equipped: [], name: 'Wspinacz', floor: 3, seed: 'a' }, content);
    const starts = [...content.towers.texts.fightStart, ...content.towers.texts.eliteStart, ...content.towers.texts.championStart].map((line) => line.split('{enemies}')[0]);
    assert.ok(starts.some((start) => won.entries[0].text.startsWith(start)), won.entries[0].text);
    assert.ok(!/zarośli|drzewami|las /i.test(won.entries[0].text), won.entries[0].text);
    const weak = { ...newCharacter('mage', { level: 60, classLevel: 50 }), stats: { ...newCharacter('mage').stats } };
    const lost = towerFight({ character: weak, equipped: [], name: 'Słaby', floor: 60, seed: 'd' }, content);
    if (!lost.tower.won) assert.match(lost.entries[0].text, /z Wieży: Słaby\./);
  });

  test('a won floor pays the XP of a fight of an hour\'s exploration, an elite and a champion as a regular creature', () => {
    const won = towerFight({ character: climber, equipped: gear, name: 'Wspinacz', floor: 3, seed: 'a' }, content);
    assert.equal(won.tower.won, true);
    assert.equal(won.result, 'success');
    assert.ok(won.xp > 0 && won.gold > 0);
    assert.equal(won.fights.length, 1);
    assert.equal(won.areaId, towerArea(3, content).id);
    // The same seed, the same fight.
    assert.deepEqual(towerFight({ character: climber, equipped: gear, name: 'Wspinacz', floor: 3, seed: 'a' }, content), won);
    // A champion floor: no champion's multiplier on the pay.
    const champion = towerFight({ character: climber, equipped: gear, name: 'Wspinacz', floor: CHAMPION, seed: 'b' }, content);
    assert.equal(champion.tower.won, true);
    assert.equal(champion.fights[0].champion, true);
    const [enemy] = champion.fights[0].enemies;
    const monster = content.monstersById[enemy.monsterId];
    const regular = monsterXp({ ...monster, elite: false, champion: false }, enemy.level, content);
    assert.ok(champion.xp < regular * 2, `${champion.xp} vs ${regular}`);
    assert.ok(champion.xp < monsterXp(monster, enemy.level, content) / 2, `${champion.xp} vs ${monsterXp(monster, enemy.level, content)}`);
  });

  test('a champion leaves its trophy only when asked (the first win of its floor in the tower), and then for certain; the rest of the pay the same (483 A)', () => {
    const champion = towerFloor(CHAMPION, 'any', content).encounter.members[0].monsterId;
    assert.ok(content.monstersById[champion].champion);
    const trophy = content.materialsByMonster[champion].id;
    const pieces = (found) => Object.entries(found).filter(([key]) => parseStack(key).materialId === trophy).reduce((sum, [, count]) => sum + count, 0);
    // The strong character wins the first champion's floor (Rokita, the
    // 25th, of level 74).
    for (let n = 0; n < 20; n++) {
      const first = towerFight({ character: climber, equipped: gear, name: 'Wspinacz', floor: CHAMPION, seed: `trofeum${n}`, championTrophy: true }, content);
      assert.equal(first.tower.won, true);
      assert.equal(first.tower.champion, true);
      assert.equal(pieces(first.materials), 1, JSON.stringify(first.materials));
      const again = towerFight({ character: climber, equipped: gear, name: 'Wspinacz', floor: CHAMPION, seed: `trofeum${n}`, championTrophy: false }, content);
      assert.equal(pieces(again.materials), 0, JSON.stringify(again.materials));
      assert.deepEqual([again.tower.won, again.xp, again.gold], [true, first.xp, first.gold]);
      // Not asked, none.
      assert.equal(pieces(towerFight({ character: climber, equipped: gear, name: 'Wspinacz', floor: CHAMPION, seed: `trofeum${n}` }, content).materials), 0);
    }
    // Elsewhere (an exploration, the Bestia Gildii) a champion leaves it by its chance, as before.
    const rng = createRng('czempion');
    const drops = Array.from({ length: 400 }, () => pieces(materialDrops(champion, 15, 1, rng, content)));
    const share = drops.reduce((sum, count) => sum + count, 0) / drops.length;
    assert.ok(Math.abs(share - content.balance.rewards.championMaterialChance) < 0.06, `${share}`);
    assert.equal(pieces(materialDrops(champion, 15, 1, createRng('a'), content, true)), 1);
    assert.equal(pieces(materialDrops(champion, 15, 1, createRng('a'), content, false)), 0);
  });

  test('the chest comes only when asked, with an item of the character\'s class it can wear', () => {
    const none = towerFight({ character: climber, equipped: gear, name: 'Wspinacz', floor: 10, seed: 'c' }, content);
    assert.equal(none.tower.won, true);
    assert.equal(none.items.length, Number(none.tower.lootItem));
    assert.equal(none.tower.chest, false);
    const chest = towerFight({ character: climber, equipped: gear, name: 'Wspinacz', floor: 10, seed: 'c', chest: true }, content);
    assert.equal(chest.tower.chest, true);
    assert.equal(chest.tower.lootItem, none.tower.lootItem);
    assert.equal(chest.items.length, 1 + Number(chest.tower.lootItem));
    const [item] = chest.items;
    assert.equal(item.level, towerLevel(10, content));
    assert.ok(content.rarities.findIndex((rarity) => rarity.id === item.rarity) >= content.rarities.findIndex((rarity) => rarity.id === 'epic'));
  });

  // The author: "zmodyfikować Wieże by dawały więcej niż Portale, o wiele
  // więcej - rzadkie łupy i materiały szczególnie legendarne i mityczne na
  // odpowiednich poziomach".
  test('a win pays far more gold than a portal\'s sweep: two hours\' worth of an exploration at the floor\'s level', () => {
    const { rewardMinutes, loot } = content.towers;
    assert.equal(loot.goldMultiplier, 2);
    for (const floor of [3, 50, 100, 150]) {
      const gold = towerGold(floor, content);
      assert.equal(gold, Math.round(expectedExploration(towerArea(floor, content), towerLevel(floor, content), rewardMinutes, content).gold * loot.goldMultiplier));
      if (floor <= content.portals.maxStage) {
        const portal = portalAmount(portalById('gold', content), floor, false, content);
        assert.ok(gold > portal * 2, `${floor}: ${gold} vs ${portal}`);
      }
    }
    assert.ok(towerGold(100, content) > towerGold(50, content));
    const won = towerFight({ character: climber, equipped: gear, name: 'Wspinacz', floor: 3, seed: 'a' }, content);
    assert.equal(won.tower.won, true);
    assert.equal(won.gold, towerGold(3, content));
  });

  test('a win brings three materials of the floor\'s creatures, rarer with the floor\'s level: legendary and mythic high up, never below the species\' own', () => {
    const index = (id) => content.rarities.findIndex((rarity) => rarity.id === id);
    const top = (floor) => Math.max(...Object.keys(towerMaterialRarities(floor, content)).map(index));
    // By the floor's level: floor 1 is of level 50, so the step of 50 at once.
    const step = (level) => content.towers.loot.materials.rarities.filter((one) => one.fromLevel <= level).at(-1).rarities;
    assert.deepEqual(towerMaterialRarities(1, content), step(50));
    assert.deepEqual(towerMaterialRarities(26, content), step(75));
    assert.deepEqual(towerMaterialRarities(51, content), step(100));
    assert.ok(top(1) >= index('mythic'));
    assert.ok(Object.keys(towerMaterialRarities(51, content)).includes('legendary'));
    for (const floor of [3, 26, 50, 100, 160]) {
      const plan = towerFloor(floor, 'm', content);
      const enemies = plan.encounter.members;
      const counts = {};
      const rng = createRng(`materials${floor}`);
      for (let n = 0; n < 200; n++) {
        const found = towerMaterials(floor, enemies, rng, content);
        assert.equal(Object.values(found).reduce((sum, count) => sum + count, 0), content.towers.loot.materials.pieces);
        for (const [key, count] of Object.entries(found)) {
          const { materialId, rarityId } = parseStack(key);
          const material = content.materialsById[materialId];
          assert.ok(index(rarityId) >= index(material.rarity), key);
          // Of the creatures fought, the champion's trophy aside.
          if (!plan.encounter.champion) assert.ok(enemies.some((enemy) => content.materialsByMonster[enemy.monsterId]?.id === materialId), `${floor}: ${key}`);
          counts[rarityId] = (counts[rarityId] ?? 0) + count;
        }
      }
      // The rarities drawn are those of the floor's level.
      const allowed = Object.keys(towerMaterialRarities(floor, content)).map(index);
      for (const rarityId of Object.keys(counts)) assert.ok(index(rarityId) >= Math.min(...allowed), `${floor}: ${rarityId}`);
    }
    // At floor 100 most pieces are legendary or mythic.
    const rng = createRng('sto');
    const enemies = towerFloor(101, 'm', content).encounter.members;
    let rare = 0;
    for (let n = 0; n < 300; n++) {
      for (const [key, count] of Object.entries(towerMaterials(100, enemies, rng, content))) if (index(parseStack(key).rarityId) >= index('legendary')) rare += count;
    }
    assert.ok(rare / (300 * 3) > 0.6, `${rare}`);
  });

  test('now and then a win brings an item of the character\'s class, of a champion\'s rarity at the floor\'s level', () => {
    let wins = 0;
    let lucky = 0;
    for (let n = 0; n < 200; n++) {
      const won = towerFight({ character: climber, equipped: gear, name: 'Wspinacz', floor: 20, seed: `łup${n}` }, content);
      if (!won.tower.won) continue;
      wins += 1;
      assert.equal(won.items.length, Number(won.tower.lootItem));
      if (won.tower.lootItem) {
        lucky += 1;
        const [item] = won.items;
        assert.equal(item.level, towerLevel(20, content));
        // Of a champion's rarity at the floor's level (69): epic or legendary.
        assert.ok(['epic', 'legendary'].includes(item.rarity), item.rarity);
        assert.match(won.entries[0].text, new RegExp(content.towers.texts.loot.map((line) => line.split('{item}')[0]).join('|')));
      }
    }
    assert.ok(wins > 150, `${wins}`);
    const share = lucky / wins;
    assert.ok(Math.abs(share - content.towers.loot.itemChance) < 0.08, `${share}`);
  });

  test('a lost floor pays nothing and costs no XP', () => {
    const weak = newCharacter('mage', { level: 1, classLevel: 1 });
    const lost = towerFight({ character: weak, equipped: [], name: 'Słaby', floor: 60, seed: 'd' }, content);
    assert.equal(lost.tower.won, false);
    assert.equal(lost.result, 'escaped');
    assert.equal(lost.xp, 0);
    assert.equal(lost.gold, 0);
    assert.deepEqual(lost.items, []);
  });
});

describe('the Wieże through the API', () => {
  const { call, db, signUp } = useServer();
  const cookies = {};
  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();

  async function player(login, name, level = 60) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = ?, class_level = 50 WHERE name = ?').bind(level, name).run();
  }
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const enter = (login, body) => as(login, 'POST', '/api/towers/enter', body);
  // Strong enough for the low floors and the first champions
  // (tests/helpers/climb.js), the Wieża Solo climbed to `best` (the floors
  // open as they are won, 0.2.12).
  async function strong(best = 60) {
    const database = await db();
    await makeClimber(database, (await database.prepare('SELECT id FROM characters').first()).id);
    await set('towers = ?', JSON.stringify({ best: { solo: best } }));
  }

  beforeEach(async () => {
    await player('wspinacz', 'Wspinacz');
  });

  test('the Wieże open at character level 50', async () => {
    await set('level = 49');
    const locked = await as('wspinacz', 'GET', '/api/towers');
    assert.equal(locked.status, 403);
    assert.equal(locked.data.error.code, 'locked');
    assert.equal((await enter('wspinacz', { tower: 'solo', floor: 1 })).data.error.code, 'locked');
  });

  test('an entry fights one floor and brings its report at once; at first only floor 1, the 50th level, is open', async () => {
    const { towers } = (await as('wspinacz', 'GET', '/api/towers')).data;
    assert.equal(towers.left, content.towers.entries.perDay);
    assert.equal(towers.cycle.length, content.areas.length);
    const solo = towers.towers.find((tower) => tower.id === 'solo');
    assert.equal(solo.top, 1);
    assert.equal(towers.firstFloorLevel, 50);
    assert.deepEqual(towers.strength, [3, 3]);
    assert.equal((await enter('wspinacz', { tower: 'solo', floor: 2 })).data.error.code, 'invalid_floor');
    assert.equal((await enter('wspinacz', { tower: 'solo', floor: 0 })).data.error.code, 'invalid_floor');
    assert.equal((await enter('wspinacz', { tower: 'none', floor: 1 })).data.error.code, 'invalid_tower');
    const entered = await enter('wspinacz', { tower: 'solo', floor: 1 });
    assert.equal(entered.status, 200, JSON.stringify(entered.data).slice(0, 300));
    const { report } = entered.data;
    assert.equal(report.kind, 'tower');
    assert.equal(report.tower.floor, 1);
    assert.equal(report.tower.level, 50);
    assert.equal(report.fights.length, 1);
    assert.equal(entered.data.towers.left, content.towers.entries.perDay - 1);
    // The creatures fought are in the Bestiariusz, and the report in the Dziennik.
    const row = await (await db()).prepare('SELECT met, towers FROM characters').first();
    const met = JSON.parse(row.met);
    assert.ok(report.fights[0].enemies.every((enemy) => met.includes(enemy.monsterId)));
    assert.equal(JSON.parse(row.towers).best.solo, report.tower.won ? 1 : 0);
    const journal = (await as('wspinacz', 'GET', '/api/reports')).data.reports;
    assert.equal(journal[0].kind, 'tower');
    assert.equal(journal[0].tower.floor, 1);
  });

  test('a floor won opens the next one, whatever the character\'s level: a level-200 character climbs from floor 1 (0.2.12)', async () => {
    await strong(0);
    const solo = async () => (await as('wspinacz', 'GET', '/api/towers')).data.towers.towers.find((tower) => tower.id === 'solo');
    assert.equal((await solo()).top, 1);
    assert.equal((await enter('wspinacz', { tower: 'solo', floor: 2 })).data.error.code, 'invalid_floor');
    const won = (await enter('wspinacz', { tower: 'solo', floor: 1 })).data.report;
    assert.equal(won.tower.won, true);
    assert.equal((await solo()).top, 2);
    assert.equal((await solo()).best, 1);
    // A character below the floor's level climbs as high as it wins.
    await set('level = 50, towers = ?', JSON.stringify({ best: { solo: 40 } }));
    assert.equal((await solo()).top, 41);
    assert.equal((await enter('wspinacz', { tower: 'solo', floor: 41 })).status, 200);
  });

  test('the entries of a day run out and come back from midnight', async () => {
    const today = (await as('wspinacz', 'GET', '/api/towers')).data;
    assert.ok(today.towers.left > 0);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: content.quests.timeZone }).format(new Date());
    await set('towers = ?', JSON.stringify({ day, used: content.towers.entries.perDay }));
    assert.equal((await enter('wspinacz', { tower: 'solo', floor: 1 })).data.error.code, 'no_entries');
    await set('towers = ?', JSON.stringify({ day: '2020-01-01', used: content.towers.entries.perDay }));
    assert.equal((await enter('wspinacz', { tower: 'solo', floor: 1 })).status, 200);
  });

  test('a tenth floor won the first time brings the chest, once in each tower', async () => {
    await strong();
    let first = null;
    for (let i = 0; i < 5 && !first?.tower.won; i++) first = (await enter('wspinacz', { tower: 'solo', floor: 10 })).data.report;
    assert.equal(first.tower.won, true, 'the floor is won');
    assert.equal(first.tower.chest, true);
    assert.equal(first.items.length, 1 + Number(first.tower.lootItem));
    const items = async () => (await (await db()).prepare('SELECT COUNT(*) AS count FROM items').first()).count;
    const before = await items();
    let again = null;
    for (let i = 0; i < 5 && !again?.tower.won; i++) again = (await enter('wspinacz', { tower: 'solo', floor: 10 })).data.report;
    assert.equal(again.tower.won, true);
    assert.equal(again.tower.chest, false);
    assert.equal(again.items.length, Number(again.tower.lootItem));
    assert.equal(await items(), before + again.items.length);
    assert.deepEqual(JSON.parse((await (await db()).prepare('SELECT towers FROM characters').first()).towers).chests.solo, [10]);
  });

  test('a champion\'s floor won the first time brings its trophy, a second win not; the page knows the floors won (483 A)', async () => {
    const champion = towerFloor(CHAMPION, 'any', content).encounter.members[0].monsterId;
    const trophy = content.materialsByMonster[champion].id;
    const row = async () => (await db()).prepare('SELECT materials, towers FROM characters').first();
    const pieces = async () =>
      Object.entries(JSON.parse((await row()).materials))
        .filter(([key]) => parseStack(key).materialId === trophy)
        .reduce((sum, [, count]) => sum + count, 0);
    const solo = async () => (await as('wspinacz', 'GET', '/api/towers')).data.towers.towers.find((tower) => tower.id === 'solo');
    // Strong enough, it wins Rokita's floor (the 25th, of level 74).
    await strong();
    assert.deepEqual((await solo()).champions, []);
    let first = null;
    for (let i = 0; i < 5 && !first?.tower.won; i++) first = (await enter('wspinacz', { tower: 'solo', floor: CHAMPION })).data.report;
    assert.equal(first.tower.won, true, 'the floor is won');
    assert.equal(first.fights[0].champion, true);
    assert.equal(await pieces(), 1);
    assert.deepEqual((await solo()).champions, [CHAMPION]);
    let again = null;
    for (let i = 0; i < 5 && !again?.tower.won; i++) again = (await enter('wspinacz', { tower: 'solo', floor: CHAMPION })).data.report;
    assert.equal(again.tower.won, true);
    assert.ok(again.summary.xp > 0);
    assert.equal(await pieces(), 1);
    assert.deepEqual(JSON.parse((await row()).towers).champions, { solo: [CHAMPION] });
    // A floor lost is not won: its trophy still waits.
    const lost = (await enter('wspinacz', { tower: 'solo', floor: 2 * CHAMPION })).data.report;
    assert.equal((await solo()).champions.includes(2 * CHAMPION), lost.tower.won);
  });

  test('the Dziennik keeps the towers\' reports apart from the others: each new report pushes out only the oldest of its own kind (486 A)', async () => {
    const { reports: kept, towerReports } = content.balance.journal;
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    const insert = database.prepare('INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) VALUES (?, ?, ?, ?, ?, ?)');
    await database.batch([
      ...Array.from({ length: kept }, (_, index) => insert.bind(id, `old-hunt-${index}`, 'hunt', index, '{}', '{}')),
      ...Array.from({ length: towerReports }, (_, index) => insert.bind(id, `old-tower-${index}`, 'tower', index, '{}', '{}')),
    ]);
    const kinds = async () => Object.fromEntries((await database.prepare('SELECT kind, COUNT(*) AS count FROM reports GROUP BY kind').all()).results.map((one) => [one.kind, one.count]));
    const stays = async (key) => Boolean(await database.prepare('SELECT 1 AS found FROM reports WHERE activity_key = ?').bind(key).first());
    // An entry: the oldest tower report goes, every exploration stays.
    const entered = await enter('wspinacz', { tower: 'solo', floor: 1 });
    assert.equal(entered.status, 200, JSON.stringify(entered.data).slice(0, 300));
    assert.deepEqual(await kinds(), { hunt: kept, tower: towerReports });
    assert.equal(await stays('old-tower-0'), false);
    assert.equal(await stays('old-tower-1'), true);
    assert.equal(await stays('old-hunt-0'), true);
    // The Dziennik lists both, newest first.
    const journal = (await as('wspinacz', 'GET', '/api/reports')).data.reports;
    assert.equal(journal.length, kept + towerReports);
    assert.equal(journal[0].id, entered.data.report.id);
    assert.deepEqual(
      journal.map((report) => report.id),
      journal.map((report) => report.id).sort((a, b) => b - a),
    );
    // An exploration's report: the oldest exploration goes, the towers' stay.
    assert.equal((await as('wspinacz', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).status, 201);
    await database.prepare('UPDATE activities SET started_at = started_at - 300000, ends_at = ends_at - 300000').run();
    let claimed = await as('wspinacz', 'POST', '/api/hunts/claim');
    if (claimed.data.event) claimed = await as('wspinacz', 'POST', '/api/hunts/claim', { choice: claimed.data.event.options[0].id });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
    assert.deepEqual(await kinds(), { hunt: kept, tower: towerReports });
    assert.equal(await stays('old-hunt-0'), false);
    assert.equal(await stays('old-hunt-1'), true);
    assert.equal(await stays('old-tower-1'), true);
  });

  test('the Wieża Drużyn needs a Drużyna of two players; its floors open as the character entering climbs them', async () => {
    const shut = await enter('wspinacz', { tower: 'party', floor: 1 });
    assert.equal(shut.data.error.code, 'no_party');
    await player('druh', 'Druh', 55);
    const { data } = await as('wspinacz', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
    const party = (await as('wspinacz', 'GET', '/api/towers')).data.towers.towers.find((tower) => tower.id === 'party');
    assert.equal(party.missing, null);
    assert.equal(party.top, 1);
    assert.deepEqual(party.partners.map((partner) => partner.name), ['Druh']);
    assert.equal((await enter('wspinacz', { tower: 'party', floor: 2 })).data.error.code, 'invalid_floor');
    const entered = await enter('wspinacz', { tower: 'party', floor: 1 });
    assert.equal(entered.status, 200, JSON.stringify(entered.data).slice(0, 300));
    assert.deepEqual(entered.data.report.tower.partners, ['Druh']);
    assert.ok(entered.data.report.fights[0].allies.some((unit) => unit.name === 'Druh'));
    // The floors open by the character's own climb in this tower, whatever
    // the levels in the Drużyna.
    await (await db()).prepare("UPDATE characters SET towers = ? WHERE name = 'Wspinacz'").bind(JSON.stringify({ best: { party: 12 } })).run();
    const climbed = (await as('wspinacz', 'GET', '/api/towers')).data.towers.towers.find((tower) => tower.id === 'party');
    assert.equal(climbed.top, 13);
    assert.equal(climbed.missing, null);
    // One grown beyond the class levels' spread leaves the party, so it
    // climbs no more (parties.js).
    await (await db()).prepare("UPDATE characters SET class_level = ? WHERE name = 'Druh'").bind(50 + content.balance.parties.classSpread + 1).run();
    const apart = (await as('wspinacz', 'GET', '/api/towers')).data.towers.towers.find((tower) => tower.id === 'party');
    assert.deepEqual(apart.partners, []);
    assert.match(apart.missing, /co najmniej/);
  });

  test('no climb on an exploration or before its report: the report is made with the character as it is then', async () => {
    assert.equal((await as('wspinacz', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).status, 201);
    assert.equal((await enter('wspinacz', { tower: 'solo', floor: 2 })).data.error.code, 'busy');
    await (await db()).prepare('UPDATE activities SET started_at = started_at - 300000, ends_at = ends_at - 300000').run();
    assert.equal((await enter('wspinacz', { tower: 'solo', floor: 2 })).data.error.code, 'claim_first');
    let claimed = await as('wspinacz', 'POST', '/api/hunts/claim');
    if (claimed.data.event) claimed = await as('wspinacz', 'POST', '/api/hunts/claim', { choice: claimed.data.event.options[0].id });
    assert.equal(claimed.status, 200);
    // Home again: in it goes, and its HP stays.
    const before = await (await db()).prepare('SELECT hp, hp_at, level FROM characters').first();
    const entered = await enter('wspinacz', { tower: 'solo', floor: 1 });
    assert.equal(entered.status, 200, JSON.stringify(entered.data).slice(0, 300));
    const after = await (await db()).prepare('SELECT hp, hp_at, level FROM characters').first();
    if (after.level === before.level) assert.deepEqual(after, before);
  });
});

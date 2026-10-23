import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  applyHunt,
  areaFor,
  autoDistribute,
  autoEquip,
  canUse,
  computeStats,
  createRng,
  damageScale,
  earnedPoints,
  estimateThreat,
  explorationPace,
  faintChances,
  faintPenalty,
  freePoints,
  gearLevel,
  generateItem,
  classXpToNext,
  hoursToNext,
  huntDurations,
  huntingHours,
  itemName,
  itemProperties,
  lowLevelMultiplier,
  monsterCombatant,
  playerCombatant,
  randomItem,
  reduction,
  restedHp,
  sellPrice,
  simulateFight,
  simulateHunt,
  statEffects,
  unlockedFeatures,
  areaUnlocked,
  areaUnlockLevel,
  xpToNext,
} from '../src/engine/index.js';
import { simulateMany, typicalCharacter } from '../tools/simulate.mjs';
import { content, newCharacter } from './helpers/content.js';

// A few level 1 common items of a class, like the first gear a character finds.
const KITS = {
  warrior: ['sword', 'shield', 'chainmail', 'helmet'],
  archer: ['bow', 'quiver', 'tunic', 'hood'],
  mage: ['staff', 'focus', 'robe', 'hood'],
  cleric: ['aspergillum', 'shield', 'robe', 'hood'],
  shadow: ['dagger', 'tunic', 'hood'],
};
const kit = (classId, seed = 'kit') => {
  const rng = createRng(seed);
  return KITS[classId].map((baseId) => generateItem({ baseId, level: 1, element: baseId === 'staff' ? 'fire' : undefined }, rng, content));
};

describe('random numbers', () => {
  test('the same seed gives the same sequence', () => {
    const a = createRng('ziarno');
    const b = createRng('ziarno');
    const c = createRng('inne ziarno');
    const first = Array.from({ length: 5 }, () => a.next());
    assert.deepEqual(first, Array.from({ length: 5 }, () => b.next()));
    assert.notDeepEqual(first, Array.from({ length: 5 }, () => c.next()));
  });

  test('helpers stay in range and follow the weights', () => {
    const rng = createRng('zakres');
    const counts = { rare: 0, common: 0 };
    for (let i = 0; i < 4000; i++) {
      const value = rng.int(3, 5);
      assert.ok(value >= 3 && value <= 5 && Number.isInteger(value));
      counts[rng.weighted([{ id: 'common', weight: 3 }, { id: 'rare', weight: 1 }]).id] += 1;
    }
    assert.ok(Math.abs(counts.common / 4000 - 0.75) < 0.03);
  });
});

describe('statistics', () => {
  test('show where every point comes from', () => {
    const character = newCharacter('warrior', { level: 3, classLevel: 2, points: { strength: 5 } });
    const sword = generateItem({ baseId: 'sword', level: 2, rarityId: 'rare', affixIds: ['bear'] }, createRng('x'), content);
    const { totals, sources } = computeStats(character, [sword], content);
    const base = content.classesById.warrior.baseStats.strength + content.classesById.warrior.growth.strength;
    assert.deepEqual(sources.strength, { class: base, character: 5, professions: 0, equipment: sword.affixes[0].value, core: 0 });
    assert.equal(totals.strength, base + 5 + sword.affixes[0].value);
  });

  test('a level gives 8 points and a class level 2', () => {
    const character = newCharacter('mage', { level: 4, classLevel: 3, points: { intellect: 10 } });
    assert.equal(earnedPoints(character, content), 8 * 3 + 2 * 2);
    assert.equal(freePoints(character, content), 18);
  });

  test('"Rozdaj według klasy" spends every free point by the class weights', () => {
    const character = newCharacter('archer', { level: 3, classLevel: 2, points: { vitality: 1 } });
    const points = autoDistribute(character, content);
    assert.equal(freePoints({ ...character, points }, content), 0);
    assert.ok(points.dexterity > points.perception && points.perception >= points.vitality - 1);
  });
});

describe('items', () => {
  test('rarity sets the number of affixes and the budget grows with it', () => {
    const rng = createRng('rzadkość');
    for (const rarity of content.rarities) {
      const item = generateItem({ baseId: 'sword', level: 10, rarityId: rarity.id }, rng, content);
      assert.equal(item.affixes.length, rarity.affixes);
      assert.equal(new Set(item.affixes.map((affix) => affix.id)).size, rarity.affixes);
    }
    const common = generateItem({ baseId: 'ring', level: 10 }, rng, content);
    const divine = generateItem({ baseId: 'ring', level: 10, rarityId: 'divine' }, rng, content);
    const total = (item) => item.implicit.value + item.affixes.reduce((sum, affix) => sum + affix.value, 0);
    assert.ok(total(divine) > 2 * total(common));
  });

  test('names agree with the grammatical gender of the base', () => {
    const rng = createRng('nazwy');
    const named = (baseId, affixIds) => itemName(generateItem({ baseId, level: 1, rarityId: 'unique', affixIds }, rng, content), content);
    assert.equal(named('sword', ['wolf', 'mist']), 'Wilczy Miecz Mgły');
    assert.equal(named('shield', ['wolf', 'mist']), 'Wilcza Tarcza Mgły');
    assert.equal(named('aspergillum', ['wolf', 'mist']), 'Wilcze Kropidło Mgły');
    assert.equal(named('boots', ['oak', 'leshy']), 'Dębowe Buty Leszego');
    assert.equal(itemName(generateItem({ baseId: 'bow', level: 1 }, rng, content), content), 'Łuk');
  });

  test('properties are described in Polish', () => {
    const rng = createRng('opis');
    const staff = generateItem({ baseId: 'staff', level: 3, rarityId: 'rare', element: 'frost', affixIds: ['embers'] }, rng, content);
    const lines = itemProperties(staff, content);
    assert.match(lines[0], /^Obrażenia: \d+–\d+ \(magiczne, mróz\)$/);
    assert.match(lines[1], /^Odporność na ogień: \+\d+$/);
  });

  test('weapons and off-hands belong to classes, the rest fits anyone', () => {
    assert.equal(canUse('staff', 'mage', content), true);
    assert.equal(canUse('staff', 'shadow', content), false);
    assert.equal(canUse('shield', 'cleric', content), true);
    assert.equal(canUse('quiver', 'mage', content), false);
    for (const classId of ['warrior', 'archer', 'mage', 'cleric', 'shadow']) assert.equal(canUse('helmet', classId, content), true);
    // Loot only ever holds weapons and off-hands of the character's class.
    const rng = createRng('łup');
    for (let i = 0; i < 300; i++) {
      const item = randomItem(10, rng, content, { classId: 'shadow', filled: new Set(['weapon']) });
      assert.ok(canUse(item.base, 'shadow', content), item.base);
    }
  });

  test('the scrapper pays by level and rarity', () => {
    const rng = createRng('złom');
    const price = (rarityId, level) => sellPrice(generateItem({ baseId: 'ring', level, rarityId }, rng, content), content);
    const perLevel = content.balance.items.sellGoldPerLevel;
    assert.equal(price('common', 10), 10 * perLevel);
    assert.equal(price('rare', 10), 2 * price('common', 10));
    assert.equal(price('divine', 10), 64 * price('common', 10));
    assert.ok(price('common', 1) >= 1);
  });
});

describe('combat', () => {
  const fight = (seed, allies, enemies) =>
    simulateFight({ allies, enemies, rng: createRng(seed), content, record: true });

  test('is fully determined by the seed', () => {
    const player = playerCombatant({ character: newCharacter('warrior'), equipped: kit('warrior'), name: 'Mira' }, content);
    const wolves = () => [0, 1].map((i) => monsterCombatant({ monsterId: 'wolf', level: 1, id: `e${i}`, name: `Wilk ${i + 1}` }, content));
    assert.deepEqual(fight('walka', [player], wolves()), fight('walka', [player], wolves()));
  });

  test('works three against three and ends with one side down', () => {
    const allies = ['warrior', 'cleric', 'archer'].map((classId, i) => ({
      ...playerCombatant({ character: newCharacter(classId, { level: 5 }), equipped: kit(classId), name: classId }, content),
      id: `a${i}`,
    }));
    const enemies = ['wolf', 'viper', 'crow'].map((monsterId, i) => monsterCombatant({ monsterId, level: 5, id: `e${i}` }, content));
    const result = fight('3v3', allies, enemies);
    const alive = (side) => result.units.filter((unit) => unit.id.startsWith(side) && unit.hp > 0).length;
    assert.ok(result.won === true ? alive('e') === 0 : alive('a') === 0);
    assert.ok(result.events.some((event) => event.kind === 'kill'));
  });

  test('a unit never acts more than three times in a row', () => {
    const fast = { ...playerCombatant({ character: newCharacter('archer'), equipped: kit('archer'), name: 'Szybki' }, content), speed: 50 };
    const boar = monsterCombatant({ monsterId: 'boar', level: 3, id: 'e0' }, content);
    const result = fight('tempo', [fast], [{ ...boar, maxHp: 5000, hp: 5000 }]);
    let streak = 0;
    let last = null;
    for (const event of result.events.filter((e) => e.actor)) {
      streak = event.actor === last ? streak + 1 : 1;
      last = event.actor;
      assert.ok(streak <= content.balance.combat.maxConsecutiveMoves);
    }
  });

  test('a viper bite can poison, and poison ticks every turn', () => {
    const target = { ...playerCombatant({ character: newCharacter('mage'), equipped: [], name: 'Cel' }, content), maxHp: 5000, hp: 5000, willRating: 0 };
    const viper = monsterCombatant({ monsterId: 'viper', level: 3, id: 'e0' }, content);
    const events = fight('jad', [target], [viper]).events;
    assert.ok(events.some((event) => event.kind === 'effect' && event.effect === 'Zatrucie'));
    assert.ok(events.some((event) => event.kind === 'tick' && event.target === target.id && event.damage > 0));
  });

  test('magic ignores armor and dodge, physical attacks do not', () => {
    const wall = { ...monsterCombatant({ monsterId: 'boar', level: 5, id: 'e0' }, content), armor: 100000, dodgeRating: 0, hp: 100000, maxHp: 100000 };
    const mage = playerCombatant({ character: newCharacter('mage'), equipped: kit('mage'), name: 'Mag' }, content);
    const warrior = playerCombatant({ character: newCharacter('warrior'), equipped: kit('warrior'), name: 'Woj' }, content);
    const hits = (attacker) => fight('mur', [attacker], [wall]).events.filter((e) => e.actor === attacker.id && e.kind !== 'dodge');
    assert.ok(Math.min(...hits(warrior).map((e) => e.damage)) <= 1);
    assert.ok(Math.min(...hits(mage).map((e) => e.damage)) > 3);
  });

  test('the party finishes off the enemy it can defeat fastest', () => {
    const player = { ...playerCombatant({ character: newCharacter('warrior', { level: 5 }), equipped: kit('warrior'), name: 'Mira' }, content), maxHp: 9000, hp: 9000 };
    const boar = (id, hp) => ({ ...monsterCombatant({ monsterId: 'boar', level: 5, id }, content), hp, maxHp: 400 });
    const result = fight('cel', [player], [boar('e0', 400), boar('e1', 40)]);
    const blows = result.events.filter((event) => event.actor === player.id && event.target);
    const down = result.events.findIndex((event) => event.kind === 'kill' && event.target === 'e1');
    assert.ok(down > 0);
    // Every blow goes to the wounded boar until it is down.
    assert.ok(blows.length > 0);
    for (const blow of blows.filter((event) => result.events.indexOf(event) < down)) assert.equal(blow.target, 'e1');
  });

  test('the damage bonus of a stat flattens out, so fights last alike at every level', () => {
    const { balance } = content;
    assert.equal(damageScale(0, 10, balance), 1);
    assert.ok(damageScale(1e9, 10, balance) < 1 + balance.combat.scalingMax);
    // The same stat counts for less at a higher level, and a stat that grows
    // with the level keeps the bonus.
    assert.ok(damageScale(100, 50, balance) < damageScale(100, 5, balance));
    const k = (level) => balance.combat.kBase + balance.combat.kPerLevel * level;
    assert.ok(Math.abs(damageScale(k(5), 5, balance) - damageScale(k(500), 500, balance)) < 1e-9);
  });

  test('armor follows P / (P + K) and never reaches 100%', () => {
    assert.equal(reduction(0, 5, content.balance), 0);
    assert.ok(Math.abs(reduction(140, 5, content.balance) - 0.5) < 1e-9);
    assert.ok(reduction(1e9, 1, content.balance) < 1);
  });
});

describe('hunts', () => {
  const warrior = typicalCharacter('warrior', 3, content);
  const hunt = (overrides = {}) =>
    simulateHunt(
      { ...warrior, hp: 9999, name: 'Mira', areaId: 'windfalls-edge', minutes: 60, seed: 'polowanie', ...overrides },
      content,
    );

  test('the same seed always gives the same hunt', () => {
    assert.deepEqual(hunt(), hunt());
    assert.notDeepEqual(hunt(), hunt({ seed: 'inne' }));
  });

  test('fights grow slowly with the length, rewards with the time', () => {
    // 1 minute: 1 fight, 5 minutes: 2, 15: 3, an hour: 4, 4 hours: 5.
    assert.deepEqual([1, 5, 15, 60, 240].map((minutes) => hunt({ minutes }).fights.length), [1, 2, 3, 4, 5]);
    // A character that does not outgrow the place earns with the time.
    const settled = typicalCharacter('warrior', 43, content);
    const xp = (minutes) => simulateHunt({ ...settled, hp: 9999, name: 'Mira', areaId: 'wolf-circles', minutes, seed: 'czas' }, content).xp;
    assert.ok(xp(240) > xp(15) * 5);
    const pace = (minutes) => explorationPace(minutes, content);
    assert.equal(pace(240).timeFactor, 240 / 5 / content.balance.hunt.minutesPerFightReference);
    // Longer explorations meet demanding encounters and the elite more often.
    assert.equal(pace(1).toughChance, 0);
    assert.ok(pace(30).toughChance < pace(120).toughChance && pace(120).toughChance < pace(240).toughChance);
    assert.ok(pace(15).eliteChance < pace(240).eliteChance);
  });

  test('demanding encounters are stronger and bring better loot', () => {
    const level = 20;
    const always = { ...content, balance: { ...content.balance, hunt: { ...content.balance.hunt, toughChanceByMinutes: [[1, 1]] } } };
    const character = typicalCharacter('warrior', level, content);
    const result = simulateHunt({ ...character, hp: 9999, name: 'Mira', areaId: 'viper-heaps', minutes: 60, seed: 'trudne' }, always);
    assert.ok(result.fights.every((fight) => fight.tough));
    // Monsters of the place (16–20), some levels higher.
    const bonus = content.balance.hunt.toughLevelBonus;
    assert.ok(result.fights.every((fight) => fight.enemies.every((enemy) => enemy.level >= 16 + bonus && enemy.level <= 20 + bonus)));
  });

  test('HP carries over between fights and is only partly restored', () => {
    const result = hunt({ minutes: 240 });
    for (let i = 1; i < result.fights.length; i++) {
      const previous = result.fights[i - 1];
      assert.equal(result.fights[i].hpBefore, previous.hpAfter + previous.recovered);
      assert.ok(previous.recovered <= result.maxHp - previous.hpAfter);
    }
  });

  test('a lost fight ends the hunt with fainting', () => {
    const weak = { ...newCharacter('mage'), level: 1 };
    const result = simulateHunt({ character: weak, equipped: [], hp: 5, name: 'Pech', areaId: 'mossy-boulders', minutes: 60, seed: 'pech' }, content);
    assert.equal(result.result, 'fainted');
    assert.equal(result.fights.at(-1).won, false);
    assert.equal(result.hpEnd, Math.round(result.maxHp * content.balance.hunt.hpAfterFaint));
  });

  test('losing to the elite in a safe region wounds but does not faint', () => {
    // Every fight is the elite.
    const elite = { ...content.balance.hunt, eliteChancePerFight: 100 };
    const always = { ...content, balance: { ...content.balance, hunt: elite } };
    const result = simulateHunt({ character: newCharacter('shadow'), equipped: [], hp: 10, name: 'Cień', areaId: 'windfalls-edge', minutes: 15, seed: 'elita' }, always);
    assert.equal(result.result, 'escaped');
    assert.ok(result.fights[0].elite);
  });

  test('every fight keeps its sides and events for the playback', () => {
    const result = hunt({ minutes: 120 });
    assert.ok(result.fights.length > 1);
    for (const fight of result.fights) {
      assert.ok(fight.events.length > 0);
      assert.equal(fight.allies[0].name, 'Mira');
      assert.ok(fight.enemiesView.length >= 1);
    }
    assert.ok(result.keyFight.index < result.fights.length);
    assert.ok(result.entries.every((entry, i, all) => i === 0 || all[i - 1].t <= entry.t));
  });

  test('a character without a weapon finds one of its class first', () => {
    const naked = typicalCharacter('mage', 1, content);
    assert.equal(naked.equipped.length, 0);
    const result = simulateHunt({ ...naked, hp: 9999, name: 'Mira', areaId: 'windfalls-edge', minutes: 30, seed: 'pierwsza' }, content);
    assert.equal(result.result, 'success');
    assert.equal(result.items[0].base, 'staff');
    // Further loot favours the other empty slots, so one hunt brings no second weapon.
    assert.ok(result.items.slice(1).every((item) => item.slot !== 'weapon'));
  });

  test('a short hunt pays for its share of time, not for a whole fight', () => {
    // A level 43 warrior in an inner region of its level does not outgrow it in an hour.
    const settled = typicalCharacter('warrior', 43, content);
    const per = (minutes) => {
      let xp = 0;
      for (let i = 0; i < 200; i++) {
        xp += simulateHunt({ ...settled, hp: 9999, name: 'Mira', areaId: 'wolf-circles', minutes, seed: `udział:${minutes}:${i}` }, content).xp;
      }
      return (xp / 200 / minutes) * 60;
    };
    assert.ok(per(5) < per(60) * 1.25, `5 min: ${per(5)} XP/h, 60 min: ${per(60)} XP/h`);
  });

  test('a long exploration in one place gives fewer levels than moving on', () => {
    // XP from monsters far below the character's level drops as the level rises.
    const beginner = typicalCharacter('warrior', 2, content);
    const levelsAfter = (minutes) => {
      let total = 0;
      for (let i = 0; i < 40; i++) {
        const result = simulateHunt({ ...beginner, hp: 9999, name: 'Mira', areaId: 'windfalls-edge', minutes, seed: `daleko:${i}` }, content);
        total += applyHunt(beginner.character, result, content).level;
      }
      return total / 40;
    };
    const short = levelsAfter(30);
    const long = levelsAfter(240);
    assert.ok(long - 2 < (short - 2) * 3, `30 min: ${short}, 4 h: ${long}`);
    assert.ok(long < 11, `4 h: level ${long}`);
  });

  test('finds are rarer and sometimes empty', () => {
    const result = hunt({ minutes: 240, seed: 'puste' });
    const finds = result.entries.filter((entry) => entry.type === 'find');
    assert.ok(finds.length >= 6 && finds.length <= 18, `${finds.length} finds`);
    let empty = 0;
    let items = 0;
    for (let i = 0; i < 50; i++) {
      const long = hunt({ minutes: 240, seed: `puste:${i}` });
      empty += long.entries.filter((entry) => entry.type === 'find' && entry.item === undefined && !/złota/.test(entry.text)).length;
      items += long.items.length;
    }
    assert.ok(empty > 0);
    assert.ok(items / 50 < 8, `${items / 50} items in 4 hours`);
  });

  test('monsters have the levels of the place, not of the character', () => {
    const beginner = typicalCharacter('warrior', 3, content);
    const result = simulateHunt({ ...beginner, hp: 99999, name: 'Mira', areaId: 'fox-ravines', minutes: 240, seed: 'jary' }, content);
    for (const fight of result.fights) {
      for (const enemy of fight.enemies) assert.ok(enemy.level >= 6 && enemy.level <= 11, `${enemy.name}: ${enemy.level}`);
    }
  });

  test('short explorations still earn gold: fractions add up before rounding', () => {
    const beginner = typicalCharacter('shadow', 1, content);
    let gold = 0;
    for (let i = 0; i < 40; i++) {
      const result = simulateHunt({ ...beginner, name: 'Cień', areaId: 'windfalls-edge', minutes: 5, seed: `grosz:${i}` }, content);
      gold += result.fights.reduce((sum, fight) => sum + fight.gold, 0);
    }
    assert.ok(gold / 40 > 0.5, `${gold / 40} gold from fights per 5 minutes`);
  });

  test('a 4-hour hunt stays well within the CPU budget', () => {
    const strong = typicalCharacter('cleric', 10, content);
    const started = performance.now();
    for (let i = 0; i < 20; i++) {
      simulateHunt({ ...strong, hp: 9999, name: 'Test', areaId: 'mossy-boulders', minutes: 240, seed: `cpu${i}` }, content);
    }
    assert.ok((performance.now() - started) / 20 < 8, 'average hunt took too long');
  });
});

describe('inner regions', () => {
  test('every region has five inner regions of five levels that take its trait, elite and safety', () => {
    for (const region of content.regions) {
      assert.equal(region.areas.length, 5);
      assert.equal(region.areas[0].minLevel, region.minLevel);
      assert.equal(region.areas.at(-1).maxLevel, region.maxLevel);
      for (const area of region.areas) {
        assert.equal(area.maxLevel - area.minLevel, 4);
        assert.equal(area.regionId, region.id);
        assert.equal(area.elite, region.elite);
        assert.equal(area.safe, region.safe);
        assert.deepEqual(area.trait, region.trait);
      }
    }
  });

  test('monsters keep to the levels of the inner region', () => {
    const strong = typicalCharacter('warrior', 12, content);
    const result = simulateHunt({ ...strong, hp: 9999, name: 'Mira', areaId: 'windfalls-edge', minutes: 60, seed: 'skraj' }, content);
    for (const fight of result.fights) {
      for (const enemy of fight.enemies) assert.ok(enemy.level <= (fight.elite ? 6 : 5), `${enemy.name}: ${enemy.level}`);
    }
  });

  test('an id from before inner regions means the inner region for the level', () => {
    assert.equal(areaFor('windfalls', 1, content).id, 'windfalls-edge');
    assert.equal(areaFor('windfalls', 12, content).id, 'raven-hollows');
    assert.equal(areaFor('windfalls', 40, content).id, 'boar-thicket');
    assert.equal(areaFor('stone-glade', 3, content).id, 'mossy-boulders');
    assert.equal(areaFor('lynx-ridge', 3, content).id, 'lynx-ridge');
    assert.equal(areaFor('moon', 3, content), undefined);
  });
});

describe('progression', () => {
  test('the first levels take minutes, level 500 about a day', () => {
    assert.ok(xpToNext(2, content) > xpToNext(1, content));
    // A 5-minute exploration is enough for each of the first levels.
    for (const level of [1, 2, 3, 4, 5]) assert.ok(huntingHours(level, content) * 60 <= 5);
    assert.ok(huntingHours(100, content) > 2 && huntingHours(100, content) < 5);
    assert.ok(huntingHours(500, content) > 20 && huntingHours(500, content) < 30);
    assert.equal(content.balance.progression.maxLevel, 500);
    // Class levels need less XP, so they come faster.
    assert.ok(classXpToNext(1, content) < xpToNext(1, content));
  });

  test('worn gear lags behind the level by at most 45 minutes of exploring', () => {
    assert.equal(gearLevel(1, content), 1);
    const lag = content.balance.monsters.gearLagMinutes;
    for (const level of [5, 20, 100, 300, 500]) {
      const gear = gearLevel(level, content);
      assert.ok(gear <= level);
      let minutes = 0;
      for (let l = gear; l < level; l++) minutes += huntingHours(l, content) * 60;
      assert.ok(minutes <= lag + huntingHours(gear, content) * 60, `level ${level}: ${minutes} min`);
    }
    // High up a level takes longer than the lag, so the gear is at most one level behind.
    assert.ok(gearLevel(500, content) >= 499);
  });

  test('fainting costs half a level of XP but never the level', () => {
    const needed = xpToNext(4, content);
    assert.equal(faintPenalty(4, needed - 1, content), Math.floor(needed / 2));
    assert.equal(faintPenalty(4, 10, content), 10);
  });

  test('applying a hunt levels up and keeps XP and class XP apart', () => {
    const character = newCharacter('cleric', { level: 1, xp: 0, classLevel: 1, classXp: 0 });
    const applied = applyHunt(character, { xp: xpToNext(1, content) + 5, result: 'success' }, content);
    assert.equal(applied.level, 2);
    assert.equal(applied.xp, 5);
    assert.equal(applied.classLevel, 2);
    assert.equal(applied.classXp, xpToNext(1, content) + 5 - classXpToNext(1, content));
    assert.match(applied.messages[0], /^Osiągnięto poziom 2\. Wolne punkty statystyk: \+8\.$/);
    // Level 2 opens long hunts and the stats screen, and the System says so.
    const unlocks = content.unlocks.filter((u) => u.level === 2).map((u) => u.message);
    assert.deepEqual(applied.messages.slice(1, 1 + unlocks.length), unlocks);
    assert.match(applied.messages.at(-1), /^Kleryk: poziom klasy 2\. Wolne punkty statystyk: \+2\.$/);
    // A class level before character level 2 says when its points can be spent.
    const early = applyHunt(character, { xp: classXpToNext(1, content), result: 'success' }, content);
    assert.equal(early.level, 1);
    assert.deepEqual(early.messages, ['Kleryk: poziom klasy 2. Wolne punkty statystyk: +2. Rozdasz je od poziomu 2.']);

    const fainted = applyHunt({ ...character, level: 3, xp: 10 }, { xp: 0, result: 'fainted' }, content);
    assert.equal(fainted.level, 3);
    assert.equal(fainted.xp, 0);
    assert.equal(fainted.penalty, 10);
  });

  test('hunting far below your level gives clearly less XP', () => {
    assert.equal(lowLevelMultiplier(5, 3, content), 1);
    assert.equal(lowLevelMultiplier(8, 5, content), 0.75);
    assert.equal(lowLevelMultiplier(20, 1, content), content.balance.hunt.lowLevelMinMultiplier);
  });

  test('the stats screen estimates the hours of hunting left to the next level', () => {
    assert.ok(Math.abs(hoursToNext(1, 0, content) - huntingHours(1, content)) < 0.05);
    assert.ok(Math.abs(hoursToNext(10, xpToNext(10, content) / 2, content) - huntingHours(10, content) / 2) < 0.05);
    assert.equal(hoursToNext(content.balance.progression.maxLevel, 0, content), 0);
  });

  test('HP regenerates over time between hunts', () => {
    const at = (minutes) => restedHp({ hp: 10, since: 0, now: minutes * 60000, maxHp: 100, vitality: 10 }, content);
    assert.equal(at(0), 10);
    assert.ok(at(10) > 10 && at(10) < 100);
    assert.equal(at(10000), 100);
  });
});

test('finds go straight into empty slots, the best one for each', () => {
  const rng = createRng('auto');
  const item = (baseId, rarityId = 'common', level = 1) => generateItem({ baseId, level, rarityId }, rng, content);
  const finds = [item('sword'), item('helmet'), item('axe', 'rare'), item('boots'), item('hood', 'common', 2)];
  // Nothing worn: the rare axe beats the sword, the level 2 hood beats the helmet.
  assert.deepEqual(autoEquip([], finds, content), [2, 3, 4]);
  // A worn weapon keeps every weapon in the bag.
  assert.deepEqual(autoEquip([item('dagger')], finds, content), [3, 4]);
  // A mage puts on neither the sword nor the axe.
  assert.deepEqual(autoEquip([], finds, content, 'mage'), [3, 4]);
  assert.deepEqual(autoEquip([], [item('staff'), ...finds], content, 'mage'), [0, 4, 5]);
});

describe('tutorial unlocks', () => {
  test('level 1 hunts last up to 45 minutes; level 2 opens long hunts and stats', () => {
    // The slider starts at 1 minute, then moves in steps of 5 minutes.
    assert.deepEqual(huntDurations(1, content), [1, 5, 10, 15, 20, 25, 30, 35, 40, 45]);
    const long = huntDurations(2, content);
    assert.equal(long.length, 49);
    assert.deepEqual([long[0], long[1], long[2], long.at(-1)], [1, 5, 10, 240]);
    assert.deepEqual(unlockedFeatures(1, content), []);
    assert.deepEqual(unlockedFeatures(2, content), ['long-hunts', 'stats']);
    // A module for each inner region of Wiatrołomy: 5, 10, 15, 20 and 25.
    assert.deepEqual(
      ['skills', 'professions', 'training', 'settlement', 'dungeons'].map((id) => content.unlocksById[id].level),
      [5, 10, 15, 20, 25],
    );
    assert.ok(!unlockedFeatures(19, content).includes('settlement'));
    assert.ok(unlockedFeatures(20, content).includes('settlement'));
    assert.ok(!unlockedFeatures(100, content).includes('core'));
  });

  test('an inner region opens when the class reaches the level before its lowest one', () => {
    assert.deepEqual(content.areas.map((area) => areaUnlockLevel(area, content)), [1, 5, 10, 15, 20, 25, 30, 35, 40, 45]);
    // A class at level 5 may go to the places of levels 1–5 and 6–10, not further.
    const open = content.areas.filter((area) => areaUnlocked(area, 5, content)).map((area) => area.id);
    assert.deepEqual(open, ['windfalls-edge', 'fox-ravines']);
    assert.ok(areaUnlocked(content.areasById['windfalls-edge'], 500, content));
  });
});

describe('stat previews', () => {
  test('show in numbers what one more point gives', () => {
    const warrior = statEffects(newCharacter('warrior'), kit('warrior'), content);
    assert.equal(warrior.vitality.maxHp, content.balance.character.hpPerVitality);
    assert.ok(warrior.vitality.regen > 0);
    assert.ok(warrior.strength.damage > 0.02 && warrior.strength.damage < 0.03);
    assert.ok(warrior.dexterity.dodge > 0 && warrior.dexterity.speed > 0);
    assert.ok(warrior.endurance.reduction > 0);
    assert.ok(warrior.perception.crit > 0);
    assert.ok(warrior.will.effectResist > 0);
    assert.equal(warrior.intellect.damage, undefined);

    const mage = statEffects(newCharacter('mage'), kit('mage'), content);
    assert.ok(mage.intellect.damage > 0);
    assert.equal(mage.strength.damage, undefined);
    const cleric = statEffects(newCharacter('cleric'), kit('cleric'), content);
    assert.ok(cleric.wisdom.recovery > 0 && cleric.wisdom.mana > 0);
  });
});

test('the threat level rises with hunt length and falls with HP', () => {
  const { character, equipped } = typicalCharacter('mage', 26, content);
  const order = ['low', 'moderate', 'high', 'very-high'];
  const full = estimateThreat({ character, equipped, hp: 9999, areaId: 'mossy-boulders' }, content);
  const wounded = estimateThreat({ character, equipped, hp: 20, areaId: 'mossy-boulders' }, content);
  const durations = huntDurations(2, content);
  assert.deepEqual(Object.keys(full).map(Number), durations);
  for (let i = 1; i < durations.length; i++) {
    assert.ok(order.indexOf(full[durations[i]]) >= order.indexOf(full[durations[i - 1]]));
  }
  assert.ok(order.indexOf(wounded[5]) > order.indexOf(full[5]));
});

test('the threat level follows the whole character, not its level alone', () => {
  // The same level 26 mage, with and without equipment, in the first unsafe inner region.
  const { character, equipped } = typicalCharacter('mage', 26, content);
  const hp = 9999;
  const geared = faintChances({ character, equipped, hp, areaId: 'mossy-boulders' }, content);
  const bare = faintChances({ character, equipped: [], hp, areaId: 'mossy-boulders' }, content);
  assert.ok(bare[60] > geared[60] + 0.1);
  // An inner region far above the character is judged by sample fights too.
  const novice = newCharacter('warrior');
  const above = faintChances({ character: novice, equipped: [], hp, areaId: 'mossy-boulders' }, content);
  assert.ok(above[5] > 0.5);
});

test('the threat level follows the simulated chance of fainting', () => {
  // A level 30 mage on a 4-hour exploration in the first unsafe inner region faints now and then.
  const { character, equipped } = typicalCharacter('mage', 30, content);
  const estimated = faintChances({ character, equipped, hp: 9999, areaId: 'mossy-boulders' }, content)[240];
  const simulated = simulateMany({ classId: 'mage', level: 30, minutes: 240, hunts: 300 }, content).faintRate;
  assert.ok(simulated > 0.05, `simulated ${simulated}`);
  assert.ok(Math.abs(estimated - simulated) < 0.1, `estimated ${estimated}, simulated ${simulated}`);
  assert.ok(['high', 'very-high'].includes(estimateThreat({ character, equipped, hp: 9999, areaId: 'mossy-boulders' }, content)[240]));

  // An inner region far above the character is hopeless, by sample fights too.
  const beginner = typicalCharacter('cleric', 1, content);
  assert.deepEqual(new Set(Object.values(estimateThreat({ ...beginner, hp: 9999, areaId: 'mossy-boulders' }, content))), new Set(['very-high']));

  // The first inner region stays safe for a character of its level.
  const warrior = typicalCharacter('warrior', 3, content);
  const safe = estimateThreat({ ...warrior, hp: 9999, areaId: 'windfalls-edge' }, content);
  assert.deepEqual(new Set(Object.values(safe)), new Set(['low']));
});

test('the threat estimate for one inner region stays well within the CPU budget', () => {
  // Below the levels of the place many kinds of fights are in doubt: the costliest case.
  const cases = [['shadow', 20], ['warrior', 15], ['mage', 26]].map(([classId, level]) => typicalCharacter(classId, level, content));
  for (const { character, equipped } of cases) faintChances({ character, equipped, hp: 9999, areaId: 'mossy-boulders' }, content);
  const started = performance.now();
  for (let i = 0; i < 10; i++) {
    for (const { character, equipped } of cases) faintChances({ character, equipped, hp: 9999, areaId: 'mossy-boulders' }, content);
  }
  assert.ok((performance.now() - started) / 30 < 6, 'the average estimate took too long');
});

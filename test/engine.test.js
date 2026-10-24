import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  applyHunt,
  areaFor,
  autoDistribute,
  autoEquip,
  bagCapacity,
  bagOverflow,
  breakChance,
  buildingLevel,
  campBonus,
  campLevels,
  construction,
  effectText,
  missingFor,
  collect,
  production,
  regenPerMinute,
  restBonus,
  upgradeChance,
  upgradeCost,
  upgradeMinutes,
  upgradeView,
  upgradedItem,
  rollUpgrade,
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
  unlockMessages,
  nextHuntUnlock,
  huntingHours,
  huntReport,
  itemName,
  itemUpgradeCost,
  itemProperties,
  lowLevelMultiplier,
  monsterCombatant,
  playerCombatant,
  randomItem,
  reduction,
  restedHp,
  sellPrice,
  simulateFight,
  resourceBundle,
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
    // Four hours give clearly less than eight half-hours would at the same pace.
    assert.ok(long - 2 < (short - 2) * 8 * 0.75, `30 min: ${short}, 4 h: ${long}`);
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
  test('the first levels take about 20 minutes, level 500 about a day', () => {
    assert.ok(xpToNext(2, content) > xpToNext(1, content));
    // A slow burn: a 30-minute exploration gives one or two levels at first.
    for (const level of [1, 2, 5, 10, 17]) assert.ok(Math.abs(huntingHours(level, content) * 60 - 20) < 0.5, `level ${level}`);
    assert.ok(huntingHours(25, content) * 60 > 30);
    assert.ok(huntingHours(100, content) > 2 && huntingHours(100, content) < 5);
    assert.ok(huntingHours(500, content) > 20 && huntingHours(500, content) < 30);
    assert.equal(content.balance.progression.maxLevel, 500);
    // Class levels need less XP, so they come faster.
    assert.ok(classXpToNext(1, content) < xpToNext(1, content));
  });

  test('levels 2 to 5 need the same XP, and later ones more', () => {
    // In the first inner region monsters are mostly of levels 1–2, so levels
    // 2–5 need the same, smaller XP (earlyXpFactors): about 20 minutes each.
    const needed = [1, 2, 3, 4, 5, 6, 7].map((level) => xpToNext(level, content));
    assert.deepEqual(needed.slice(1, 5), [needed[1], needed[1], needed[1], needed[1]]);
    for (let i = 1; i < needed.length; i++) assert.ok(needed[i] >= needed[i - 1], `level ${i + 1}`);
    assert.ok(needed[5] > needed[4]);
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
    assert.match(applied.messages[0], /^Osiągnięto poziom 2\. Wolne punkty statystyk: \+8\. Punkty Czasu: \+3\.$/);
    // Level 2 opens long hunts and the stats screen, and the System says so.
    const unlocks = content.unlocks.filter((u) => u.level === 2).map((u) => u.message);
    assert.deepEqual(applied.messages.slice(1, 1 + unlocks.length), unlocks);
    assert.match(applied.messages.at(-1), /^Kleryk: poziom klasy 2\. Wolne punkty statystyk: \+2\. Punkty Czasu: \+2\.$/);
    // A level and a class level: 3 and 2 Time Points (data/balance.json).
    assert.equal(applied.timePoints, 5);
    // A class level before character level 2 says when its points can be spent.
    const early = applyHunt(character, { xp: classXpToNext(1, content), result: 'success' }, content);
    assert.equal(early.level, 1);
    assert.deepEqual(early.messages, ['Kleryk: poziom klasy 2. Wolne punkty statystyk: +2, rozdasz je od poziomu 2. Punkty Czasu: +2.']);
    assert.equal(early.timePoints, 2);

    // Several levels at once make one line for the character and one for the class.
    const xp = [1, 2, 3].reduce((sum, level) => sum + xpToNext(level, content), 0);
    const many = applyHunt(character, { xp, result: 'success' }, content);
    assert.equal(many.level, 4);
    assert.equal(many.messages.filter((message) => message.startsWith('Osiągnięto poziom')).length, 1);
    assert.equal(many.messages[0], 'Osiągnięto poziom 4. Wolne punkty statystyk: +24. Punkty Czasu: +9.');
    assert.equal(many.messages.filter((message) => message.startsWith('Kleryk: poziom klasy')).length, 1);
    assert.match(
      many.messages.at(-1),
      new RegExp(`^Kleryk: poziom klasy ${many.classLevel}\\. Wolne punkty statystyk: \\+${2 * (many.classLevel - 1)}\\. Punkty Czasu: \\+${2 * (many.classLevel - 1)}\\.$`),
    );
    assert.equal(many.timePoints, 9 + 2 * (many.classLevel - 1));

    const fainted = applyHunt({ ...character, level: 3, xp: 10 }, { xp: 0, result: 'fainted' }, content);
    assert.equal(fainted.level, 3);
    assert.equal(fainted.xp, 0);
    assert.equal(fainted.penalty, 10);
    assert.equal(fainted.timePoints, 0);
    // Time shards found on the way count too.
    assert.equal(applyHunt(character, { xp: 0, result: 'success', timePoints: 5 }, content).timePoints, 5);
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
  test('hunts last up to 30 minutes, then grow to 1 h at level 25, 2 h at 35 and 4 h at 50', () => {
    // The slider starts at 1 minute, then moves in steps of 5 minutes.
    assert.deepEqual(huntDurations(1, content), [1, 5, 10, 15, 20, 25, 30]);
    assert.deepEqual(huntDurations(24, content).at(-1), 30);
    assert.deepEqual([25, 34, 35, 49, 50, 500].map((level) => huntDurations(level, content).at(-1)), [60, 60, 120, 120, 240, 240]);
    assert.equal(huntDurations(50, content).length, 49);
    assert.deepEqual(nextHuntUnlock(1, content), { level: 25, minutes: 60 });
    assert.deepEqual(nextHuntUnlock(35, content), { level: 50, minutes: 240 });
    assert.equal(nextHuntUnlock(50, content), null);
    assert.deepEqual(unlockedFeatures(1, content), []);
    assert.deepEqual(unlockedFeatures(2, content), ['stats']);
    // Each step has its System message, and dungeons open with the longest hunts.
    assert.deepEqual(unlockMessages(25, content), ['Odblokowano eksploracje do 1 godziny.']);
    assert.deepEqual(
      ['skills', 'professions', 'training', 'settlement', 'dungeons'].map((id) => content.unlocksById[id].level),
      [5, 10, 15, 20, 50],
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
  const durations = huntDurations(50, content);
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

describe('camp', () => {
  const campfire = content.buildingsById.campfire;

  test('each level costs more gold and resources and takes longer, from the first one on', () => {
    assert.deepEqual(upgradeCost(campfire, 1), { gold: 5, wood: 4 });
    assert.deepEqual(upgradeCost(campfire, 2), { gold: 10, wood: 8, stone: 3 });
    assert.deepEqual(Object.keys(upgradeCost(campfire, 4)), ['gold', 'wood', 'stone', 'iron-ore']);
    const minutes = Array.from({ length: campfire.maxLevel }, (_, i) => upgradeMinutes(campfire, i + 1));
    assert.deepEqual(minutes.slice(0, 4), [1, 2, 5, 11]);
    for (let i = 1; i < minutes.length; i++) assert.ok(minutes[i] > minutes[i - 1]);
    // The last level of Ognisko builds for most of a day.
    assert.ok(minutes.at(-1) > 16 * 60 && minutes.at(-1) < 24 * 60);
    for (const building of content.buildings) {
      // Every level needs more than gold: the resources come from explorations.
      assert.ok(Object.keys(upgradeCost(building, 1)).length >= 2, building.id);
      for (let level = 2; level <= building.maxLevel; level++) {
        const [cost, before] = [upgradeCost(building, level), upgradeCost(building, level - 1)];
        for (const [resource, amount] of Object.entries(before)) assert.ok(cost[resource] > amount, `${building.id} ${level} ${resource}`);
      }
    }
  });

  test('an upgrade counts once it ends, and one runs at a time', () => {
    const stored = { campfire: { level: 2, startedAt: 1000, endsAt: 5000 } };
    assert.equal(buildingLevel(stored.campfire, 4999), 1);
    assert.equal(buildingLevel(stored.campfire, 5000), 2);
    assert.equal(buildingLevel(undefined, 5000), 0);
    assert.deepEqual(campLevels(stored, 4000, content), { sawmill: 0, quarry: 0, mine: 0, campfire: 1, 'loot-shed': 0, 'scrap-bench': 0, anvil: 0 });
    assert.equal(construction(stored, 4000).buildingId, 'campfire');
    assert.equal(construction(stored, 5000), null);
    assert.deepEqual(missingFor({ gold: 19, wood: 6 }, { gold: 20, wood: 2 }), [{ resource: 'wood', amount: 4 }]);
  });

  test('buildings speed up resting, enlarge the bag and raise the prices', () => {
    const levels = { campfire: 3, 'loot-shed': 2, 'scrap-bench': 5 };
    assert.ok(Math.abs(campBonus(levels, 'restSpeed', content) - 0.3) < 1e-9);
    assert.equal(bagCapacity(levels, content), content.balance.items.bagSlots + 10);
    assert.equal(bagCapacity({}, content), 30);
    assert.ok(Math.abs(campBonus(levels, 'sellPrice', content) - 0.5) < 1e-9);
    assert.equal(effectText(campfire, 3), 'Odpoczynek między wyprawami szybszy o 30%');
    assert.equal(effectText(content.buildingsById['loot-shed'], 2), 'Plecak większy o 10 miejsc');
    const item = generateItem({ baseId: 'sword', level: 10, rarityId: 'common' }, createRng('price'), content);
    assert.equal(sellPrice(item, content, 0.5), Math.round(sellPrice(item, content) * 1.5));
  });

  test('an Ognisko finished during the rest speeds it up from then on', () => {
    const stored = { campfire: { level: 1, startedAt: 0, endsAt: 30 * 60000 } };
    const rest = restBonus(stored, 10 * 60000, 50 * 60000, content);
    assert.deepEqual(rest, { bonus: 0, change: { at: 30 * 60000, bonus: 0.1 } });
    // Far from full HP, so the cap does not hide the difference.
    const base = { hp: 0, since: 10 * 60000, now: 50 * 60000, maxHp: 100000, vitality: 0 };
    const plain = restedHp(base, content);
    const faster = restedHp({ ...base, ...rest }, content);
    // Half the time at the old pace, half 10% faster: 5% more in total.
    assert.ok(Math.abs(faster / plain - 1.05) < 0.01);
    assert.ok(Math.abs(regenPerMinute(100, 5, content, 0.1) / regenPerMinute(100, 5, content) - 1.1) < 1e-9);
    // Built before the rest started: the whole rest is faster.
    assert.deepEqual(restBonus(stored, 40 * 60000, 60 * 60000, content), { bonus: 0.1 });
  });

  test('a full bag sells the weakest items, new finds before old ones', () => {
    const rng = createRng('bag');
    const make = (baseId, rarityId, level, id) => ({ ...generateItem({ baseId, level, rarityId }, rng, content), ...(id && { id }) });
    const bag = [make('sword', 'rare', 5, 1), make('staff', 'rare', 9, 2), make('sword', 'common', 3, 3)];
    const finds = [make('sword', 'common', 3), make('helmet', 'unique', 4)];
    // A warrior cannot use the staff, so it goes first; then the new common sword.
    assert.deepEqual(bagOverflow([...bag, ...finds], 3, 'warrior', content), [1, 3]);
    assert.deepEqual(bagOverflow(bag, 3, 'warrior', content), []);
  });
});

describe('production', () => {
  const sawmill = content.buildingsById.sawmill;
  const hour = 3600000;

  test('a store holds an hour of production for each level and then stops', () => {
    const first = { level: 1, startedAt: 0, endsAt: 0, collectedAt: 0 };
    assert.deepEqual(production(sawmill, first, hour / 2), { resource: 'wood', perHour: 6, capacity: 6, amount: 3, since: 0, fullAt: hour });
    assert.equal(production(sawmill, first, 5 * hour).amount, 6);
    const top = { level: 10, startedAt: 0, endsAt: 0, collectedAt: 0 };
    const store = production(sawmill, top, 20 * hour);
    assert.deepEqual([store.perHour, store.capacity, store.amount, store.fullAt], [60, 600, 600, 10 * hour]);
    assert.equal(effectText(sawmill, 10), 'Wytwarza 60 drewna na godzinę, magazyn na 10\u00a0h produkcji');
    assert.equal(production(content.buildingsById.campfire, first, hour), null);
    assert.equal(production(sawmill, undefined, hour), null);
  });

  test('nothing is made during an upgrade, and collecting keeps what is half made', () => {
    // An upgrade to level 2 running until 2 h: the store starts filling then.
    const upgrading = { level: 2, startedAt: hour, endsAt: 2 * hour, collectedAt: 2 * hour };
    assert.equal(production(sawmill, upgrading, 1.5 * hour).amount, 0);
    // 12 an hour: after 25 minutes 5 are made and a sixth is on its way.
    const store = { level: 2, startedAt: 0, endsAt: 0, collectedAt: 0 };
    const now = (25 / 60) * hour;
    const gathered = collect(sawmill, store, now);
    assert.deepEqual([gathered.resource, gathered.amount], ['wood', 5]);
    assert.equal(gathered.collectedAt, Math.round((5 / 12) * hour));
    // A full store stood still, so production starts again now.
    assert.equal(collect(sawmill, store, 10 * hour).collectedAt, 10 * hour);
    assert.equal(collect(sawmill, store, 1000), null);
  });
});

describe('resources', () => {
  test('explorations find resources of the region, instead of most empty finds', () => {
    const character = newCharacter('warrior', { level: 10, classLevel: 11 });
    const totals = {};
    let empty = 0;
    let finds = 0;
    for (let i = 0; i < 40; i++) {
      const hunt = simulateHunt(
        { character, equipped: kit('warrior'), hp: 9999, name: 'Mira', areaId: 'fox-ravines', minutes: 240, seed: `res:${i}` },
        content,
      );
      for (const [id, amount] of Object.entries(hunt.resources)) totals[id] = (totals[id] ?? 0) + amount;
      for (const entry of hunt.entries.filter((candidate) => candidate.type === 'find')) {
        finds += 1;
        if (content.texts.findNothing.includes(entry.text)) empty += 1;
      }
    }
    assert.deepEqual(Object.keys(totals).sort(), ['iron-ore', 'stone', 'wood']);
    // Wiatrołomy: more wood than stone, more stone than ore.
    assert.ok(totals.wood > totals.stone && totals.stone > totals['iron-ore']);
    assert.ok(empty / finds < 0.12, `${empty} of ${finds} empty`);
    const report = huntReport(
      {
        hunt: simulateHunt({ character, equipped: kit('warrior'), hp: 9999, name: 'Mira', areaId: 'fox-ravines', minutes: 240, seed: 'res:0' }, content),
        applied: { penalty: 0, level: 10, classLevel: 11, messages: [] },
        character,
        areaId: 'fox-ravines',
        startedAt: 0,
        endsAt: 1,
      },
      content,
    );
    assert.equal(typeof report.summary.resources, 'object');
  });

  test('a rare find is a shard of time, worth Time Points', () => {
    const character = newCharacter('warrior', { level: 10, classLevel: 11 });
    let shards = 0;
    let points = 0;
    let finds = 0;
    for (let i = 0; i < 40; i++) {
      const hunt = simulateHunt(
        { character, equipped: kit('warrior'), hp: 9999, name: 'Mira', areaId: 'fox-ravines', minutes: 240, seed: `time:${i}` },
        content,
      );
      const found = hunt.entries.filter((entry) => entry.type === 'find');
      finds += found.length;
      shards += found.filter((entry) => entry.text.includes('odłamek czasu')).length;
      points += hunt.timePoints;
    }
    assert.equal(points, shards * content.balance.timePoints.find);
    // About one find in twenty (data/balance.json: findOutcomes.time).
    assert.ok(shards > 0 && shards / finds < 0.1, `${shards} of ${finds}`);
  });

  test('a resource find is a bundle split by the region weights, at least one unit', () => {
    const windfalls = content.areasById['windfalls-edge'];
    assert.deepEqual(resourceBundle(windfalls, 10), [['wood', 5], ['stone', 3], ['iron-ore', 2]]);
    assert.deepEqual(resourceBundle(windfalls, 0.6), [['wood', 1]]);
    assert.deepEqual(resourceBundle(content.areasById['mossy-boulders'], 20), [['wood', 6], ['stone', 10], ['iron-ore', 4]]);
  });

  test('on the way the character gathers a steady bundle for the time explored', () => {
    const character = newCharacter('warrior', { level: 3, classLevel: 3 });
    // Skraj Wiatrołomów (levels 1–5, middle 3): 2 × 3 = 6 units an hour.
    const hunt = simulateHunt({ character, equipped: kit('warrior'), hp: 9999, name: 'Mira', areaId: 'windfalls-edge', minutes: 60, seed: 'gather' }, content);
    const gathered = hunt.entries.filter((entry) => entry.type === 'gather');
    assert.equal(gathered.length, 1);
    assert.equal(gathered[0].t, 60 * 60000);
    assert.match(gathered[0].text, /drewno \+3, kamień \+2, ruda żelaza \+1/);
    assert.ok(hunt.resources.wood >= 3 && hunt.resources.stone >= 2 && hunt.resources['iron-ore'] >= 1);
    // A minute is too short to gather anything.
    const short = simulateHunt({ character, equipped: kit('warrior'), hp: 9999, name: 'Mira', areaId: 'windfalls-edge', minutes: 1, seed: 'gather' }, content);
    assert.equal(short.entries.filter((entry) => entry.type === 'gather').length, 0);
  });
});

describe('upgrades', () => {
  const sword = { base: 'sword', slot: 'weapon', level: 20, rarity: 'rare', element: undefined, affixes: [{ id: 'bear', kind: 'prefix', stat: 'strength', value: 10 }], damage: { min: 30, max: 45 } };
  const mail = { base: 'chainmail', slot: 'chest', level: 5, rarity: 'common', affixes: [], armor: 15 };
  // Scripted rolls: the next value in turn for each chance() call.
  const rolls = (...values) => ({ chance: (probability) => values.shift() < probability });

  test('each level of upgrade adds 6% of every base number, rounded', () => {
    assert.equal(upgradedItem(sword, content), sword);
    const plus5 = upgradedItem({ ...sword, upgrade: 5 }, content);
    assert.deepEqual(plus5.damage, { min: 39, max: 59 });
    assert.equal(plus5.affixes[0].value, 13);
    assert.equal(upgradedItem({ ...mail, upgrade: 10 }, content).armor, 24);
    // The card shows the upgraded numbers; the stored item keeps its own.
    assert.deepEqual(itemProperties({ ...mail, upgrade: 10 }, content), ['Pancerz: +24']);
    assert.equal(mail.armor, 15);
  });

  test('worn upgraded items count with their upgraded numbers', () => {
    const character = { classId: 'warrior', classLevel: 1, level: 1, points: {} };
    const plain = computeStats(character, [mail, sword], content);
    const upgraded = computeStats(character, [{ ...mail, upgrade: 10 }, { ...sword, upgrade: 10 }], content);
    assert.equal(upgraded.bonuses.armor - plain.bonuses.armor, 9);
    assert.equal(upgraded.sources.strength.equipment - plain.sources.strength.equipment, 6);
  });

  test('the price grows with the item level, its rarity and each level of upgrade', () => {
    assert.deepEqual(itemUpgradeCost(mail, 1, content), { gold: 8, 'iron-ore': 2 });
    assert.deepEqual(itemUpgradeCost(mail, 2, content), { gold: 12, 'iron-ore': 3 });
    assert.deepEqual(itemUpgradeCost(mail, 10, content), { gold: 515, 'iron-ore': 120 });
    const common = itemUpgradeCost({ ...sword, rarity: 'common' }, 3, content);
    const rare = itemUpgradeCost(sword, 3, content);
    assert.ok(rare.gold > common.gold && rare['iron-ore'] > common['iron-ore']);
  });

  test('the chance falls from 95% to 15%, and from +7 a failure may break the item', () => {
    assert.deepEqual([1, 2, 5, 10].map((target) => upgradeChance(target, content)), [0.95, 0.9, 0.65, 0.15]);
    assert.deepEqual([0, 6, 7, 9].map((level) => breakChance(level, content)), [0, 0, 0.1, 0.1]);
  });

  test('a roll succeeds, fails a level, or from +7 breaks the item', () => {
    assert.deepEqual(rollUpgrade({ ...mail, upgrade: 2 }, rolls(0.5), content), { result: 'success', upgrade: 3 });
    assert.deepEqual(rollUpgrade({ ...mail, upgrade: 2 }, rolls(0.99, 0), content), { result: 'failure', upgrade: 1 });
    // At +0 a failure costs only the payment.
    assert.deepEqual(rollUpgrade(mail, rolls(0.99, 0), content), { result: 'failure', upgrade: 0 });
    assert.deepEqual(rollUpgrade({ ...mail, upgrade: 7 }, rolls(0.99, 0.05), content), { result: 'broken', upgrade: 7 });
    assert.deepEqual(rollUpgrade({ ...mail, upgrade: 7 }, rolls(0.99, 0.5), content), { result: 'failure', upgrade: 6 });
    // On real random numbers: at +8, about 25% success and 7.5% broken.
    const rng = createRng('anvil');
    const counts = { success: 0, failure: 0, broken: 0 };
    for (let i = 0; i < 20000; i++) counts[rollUpgrade({ ...mail, upgrade: 8 }, rng, content).result]++;
    assert.ok(Math.abs(counts.success / 20000 - 0.25) < 0.02, JSON.stringify(counts));
    assert.ok(Math.abs(counts.broken / 20000 - 0.075) < 0.015, JSON.stringify(counts));
  });

  test('the Kowadło allows as many levels as its own level, up to +10', () => {
    assert.equal(upgradeView(mail, 0, content).next, null);
    const view = upgradeView({ ...mail, upgrade: 2 }, 3, content);
    assert.deepEqual([view.level, view.cap, view.max, view.next.level], [2, 3, 10, 3]);
    assert.deepEqual(view.next.properties, ['Pancerz: +18']);
    assert.equal(upgradeView({ ...mail, upgrade: 3 }, 3, content).next, null);
    assert.equal(upgradeView({ ...mail, upgrade: 10 }, 10, content).next, null);
    assert.equal(campBonus({ anvil: 4 }, 'upgradeCap', content), 4);
  });

  test('a full bag sells upgraded items last', () => {
    const plain = { ...mail, id: 1, rarity: 'rare' };
    const upgraded = { ...mail, id: 2, upgrade: 3 };
    assert.deepEqual(bagOverflow([upgraded, plain], 1, 'warrior', content), [1]);
  });
});


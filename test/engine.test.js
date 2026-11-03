import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  applyHunt,
  exchangeBlock,
  confirmationEmail,
  championEncounter,
  championItemRarity,
  monsterXp,
  fireDay,
  fireTrade,
  fireTradeBlock,
  fireUnitsMade,
  resourceExchange,
  shopBlock,
  shopLevelFor,
  shopOffer,
  hpAfterHunt,
  areaDangers,
  bestiaryChest,
  bestiaryFull,
  landBestiaryChest,
  landBestiaryFull,
  openedChestEntry,
  openedChests,
  meetingChances,
  regionDangers,
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
  buildMinutes,
  buildSpeed,
  buildsUnderWay,
  cancelFromQueue,
  plannedLevel,
  queueEnd,
  replanQueue,
  shiftQueue,
  campEffectText,
  campLevel,
  upgradeView,
  upgradeMaterials,
  upgradedItem,
  rollUpgrade,
  heldOfRarity,
  piecesOfRarity,
  rarityNeedView,
  stacksOfRarity,
  canUse,
  computeStats,
  craftLevelFor,
  craftMinutes,
  craftPace,
  craftTable,
  createRng,
  rollRarity,
  damageScale,
  earnedPoints,
  estimateThreat,
  explorationPace,
  faintChances,
  faintPenalty,
  freePoints,
  gainedTimePoints,
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
  itemView,
  itemUpgradeCost,
  itemProperties,
  lowLevelMultiplier,
  lowerThreat,
  higherThreat,
  withRareOdds,
  easyPlace,
  rareCatchUp,
  materialDrops,
  materialView,
  materialsText,
  monsterCombatant,
  orderMaterials,
  orderSalvage,
  orderSalvageMany,
  playerCombatant,
  randomItem,
  rarityUpChances,
  reduction,
  restedHp,
  rollEncounter,
  sellPrice,
  simulateFight,
  resourceBundle,
  salvageYield,
  settleCrafting,
  simulateHunt,
  statEffects,
  extraValues,
  combatValues,
  equipChange,
  itemLines,
  THREAT_LEVELS,
  unlockedFeatures,
  areasOpened,
  areaUnlocked,
  areaUnlockLevel,
  xpToNext,
  addQuestProgress,
  chestItem,
  chestReady,
  countedForm,
  currentQuests,
  drawQuests,
  huntKills,
  questArea,
  questCreatures,
  questLevel,
  questPeriod,
  questText,
  questsStale,
  questsView,
  rerolledQuests,
  unknownCreatures,
  weekShare,
  withChest,
  withClaimed,
} from '../src/engine/index.js';
import { simulateMany, typicalCharacter } from '../tools/simulate.mjs';
import { content, newCharacter } from './helpers/content.js';

// A few level 1 common items of a class, like the first gear a character finds.
const KITS = {
  warrior: ['sword', 'shield', 'chainmail', 'helmet'],
  archer: ['bow', 'quiver', 'tunic', 'hood'],
  mage: ['staff', 'focus', 'robe', 'hood'],
  cleric: ['aspergillum', 'shield', 'surplice', 'cowl'],
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
    assert.equal(named('sword', ['wolf', 'mist']), 'Wilczy Miecz Rysia');
    assert.equal(named('shield', ['wolf', 'mist']), 'Wilcza Tarcza Rysia');
    assert.equal(named('aspergillum', ['wolf', 'mist']), 'Wilcze Kropidło Rysia');
    assert.equal(named('boots', ['oak', 'leshy']), 'Dzicze Buty Puszczyka');
    assert.equal(itemName(generateItem({ baseId: 'bow', level: 1 }, rng, content), content), 'Łuk');
  });

  test('the creatures living where an item was found name its affixes', () => {
    const rng = createRng('afiksy miejsca');
    for (const area of content.areas) {
      const living = new Set(areaDangers(area, content).map((danger) => danger.monsterId));
      for (let i = 0; i < 200; i++) {
        const item = randomItem(area.maxLevel, rng, content, { rarityId: 'legendary', area });
        for (const affix of item.affixes) assert.ok(living.has(affix.monster), `${area.name}: ${affix.monster}`);
      }
    }
    // The author's find: no Fokus Puszczyka from Skraj Wiatrołomów, where no
    // tawny owl lives.
    const edge = content.areasById['windfalls-edge'];
    const names = Array.from({ length: 400 }, () => itemName(generateItem({ baseId: 'focus', level: 5, rarityId: 'unique', area: edge }, rng, content), content));
    assert.ok(!names.some((name) => name.includes('Puszczyk')));
    assert.ok(names.some((name) => name.includes('Wilka')));
  });

  test('the place only names the affixes: what they give rolls as anywhere', () => {
    for (const area of content.areas) {
      const anywhere = generateItem({ baseId: 'ring', level: 20, rarityId: 'divine' }, createRng(`ten sam ${area.id}`), content);
      const here = generateItem({ baseId: 'ring', level: 20, rarityId: 'divine', area }, createRng(`ten sam ${area.id}`), content);
      assert.deepEqual(
        here.affixes.map(({ monster, ...affix }) => affix),
        anywhere.affixes,
      );
    }
  });

  test('a creature names one affix of an item while the place has others', () => {
    const rng = createRng('jeden stwór');
    for (const area of [content.areasById['windfalls-edge'], content.areasById['boar-thicket']]) {
      for (let i = 0; i < 400; i++) {
        const item = generateItem({ baseId: 'helmet', level: 5, rarityId: 'epic', area }, rng, content);
        const named = new Set();
        for (const affix of item.affixes) {
          if (area.affixNames[affix.kind].some((name) => !named.has(name.monster))) assert.ok(!named.has(affix.monster), `${area.id}: ${affix.monster} twice`);
          named.add(affix.monster);
        }
        // So the name never has one creature twice: no "Wilczy Hełm Wilka".
        const [prefix, suffix] = ['prefix', 'suffix'].map((kind) => item.affixes.find((affix) => affix.kind === kind));
        assert.notEqual(prefix.monster, suffix.monster);
      }
    }
  });

  test('an item found before keeps the names of its affixes', () => {
    const old = (affixes) => itemName({ base: 'focus', affixes: affixes.map(([id, kind]) => ({ id, kind, stat: 'wisdom', value: 3 })) }, content);
    assert.equal(old([['owl', 'prefix'], ['leshy', 'suffix']]), 'Puszczykowy Fokus Puszczyka');
    assert.equal(old([['mire', 'suffix']]), 'Fokus Topieli');
  });

  test('a later talisman of the family drops up to its class level, fits from it, and is stronger', () => {
    const rng = createRng('talizmany');
    const talismans = (maxClassLevel, count = 400) => {
      const found = [];
      for (let index = 0; index < count; index++) {
        const item = randomItem(20, rng, content, { classId: 'mage', maxClassLevel });
        if (item.slot === 'talisman') found.push(item.base);
      }
      return found;
    };
    const below = talismans(9);
    assert.ok(below.length > 0 && below.every((base) => base === 'talisman'), 'no Otoczak below class level 10');
    const from = talismans(10);
    assert.ok(from.includes('talisman') && from.includes('holed-stone'), 'both talismans from class level 10');
    // A family with two bases drops no more often than one with a single base.
    assert.ok(Math.abs(from.length - below.length) < 30, `${below.length} and ${from.length} talismans`);
    assert.equal(canUse('holed-stone', 'mage', content, 9), false);
    assert.equal(canUse('holed-stone', 'warrior', content, 10), true);
    assert.equal(canUse('holed-stone', 'mage', content), true);
    assert.equal(itemView(generateItem({ baseId: 'holed-stone', level: 10 }, rng, content), content).classLevel, 10);
    assert.equal(itemView(generateItem({ baseId: 'talisman', level: 10 }, rng, content), content).classLevel, null);
    // Every item is worn by its Tier, the Encyklopedia's, wherever it came
    // from (the author: "Niech przedmioty z Wymian i Targowiska działają w
    // oparciu o Tiery a nie poziomy samej broni"), and the card names it.
    const axe = generateItem({ baseId: 'bearded-axe', level: 36 }, rng, content);
    for (const from of [{}, { traded: 1 }, { chest: 1 }]) assert.equal(itemView({ ...axe, ...from }, content).classLevel, 25);
    assert.equal(itemView(axe, content).tier, 'Tier III');
    assert.equal(itemView(generateItem({ baseId: 'talisman', level: 60 }, rng, content), content).tier, 'Tier I');
    assert.equal(itemView(generateItem({ baseId: 'holed-stone', level: 10 }, rng, content), content).tier, 'Tier II');
    // Stronger by a slightly higher factor (0.32 against 0.3) and a flat
    // +2–4 Witalność on top: the lead grows only a little with the level.
    let lowLead = 0;
    for (const level of [6, 10, 100, 400]) {
      const charm = generateItem({ baseId: 'talisman', level }, rng, content).implicit.value;
      const leads = [...new Set(Array.from({ length: 40 }, () => generateItem({ baseId: 'holed-stone', level }, rng, content).implicit.value - charm))].sort((a, b) => a - b);
      assert.equal(leads.length, 3, `level ${level}: ${leads}`);
      assert.equal(leads[2] - leads[0], 2, `level ${level}: ${leads}`);
      const fromFactor = leads[0] - 2;
      assert.ok(fromFactor >= 0 && fromFactor <= Math.ceil(charm * 0.1) + 1, `level ${level}: ${fromFactor} more on ${charm}`);
      if (level === 10) lowLead = fromFactor;
      if (level === 400) assert.ok(fromFactor > lowLead, `the factor shows at level 400: ${fromFactor}`);
    }
    const stone = generateItem({ baseId: 'holed-stone', level: 10 }, rng, content);
    assert.deepEqual(autoEquip([], [stone], content, 'mage', 9), []);
    assert.deepEqual(autoEquip([], [stone], content, 'mage', 10), [0]);
  });

  test('each later base of a category is a better version from its class level', () => {
    const later = content.bases.filter((base) => base.family);
    assert.ok(later.length >= 63, `${later.length} later bases`);
    const key = { weapon: 'damageFactor', armor: 'armorFactor', implicit: 'statFactor' };
    const number = (item) => (item.damage ? (item.damage.min + item.damage.max) / 2 : item.armor ?? item.implicit.value);
    const rng = createRng('lepsze-wersje');
    const rolls = (baseId, level) => Array.from({ length: 12 }, () => number(generateItem({ baseId, level }, rng, content)));
    for (const base of later) {
      const first = content.basesById[base.family];
      // The base before it in its family: the one of the next lower class level.
      const before = content.bases
        .filter((other) => (other.family ?? other.id) === base.family && (other.classLevel ?? 1) < base.classLevel)
        .reduce((best, other) => ((other.classLevel ?? 1) > (best.classLevel ?? 1) ? other : best));
      assert.ok([10, 25, 50].includes(base.classLevel), base.id);
      assert.ok(base[key[base.kind]] > before[key[base.kind]] && base[key[base.kind]] <= first[key[base.kind]] * 1.2, base.id);
      for (const cls of content.classes) {
        assert.equal(canUse(base.id, cls.id, content), canUse(first.id, cls.id, content), `${base.id} for ${cls.id}`);
      }
      // Even its weakest roll beats the best roll of the base before it at
      // the same item level.
      for (const level of [10, 100]) {
        const weakest = Math.min(...rolls(base.id, level));
        const best = Math.max(...rolls(before.id, level));
        assert.ok(weakest > best, `${base.id} at level ${level}: ${weakest} against ${before.id} ${best}`);
      }
    }
  });

  test('every category has bases from class levels 10, 25 and 50, dropping from those levels', () => {
    const firsts = content.bases.filter((base) => !base.family);
    for (const first of firsts) {
      const levels = content.bases.filter((base) => base.family === first.id).map((base) => base.classLevel);
      assert.deepEqual(levels, [10, 25, 50], first.id);
    }
    assert.equal(canUse('saber', 'warrior', content, 24), false);
    assert.equal(canUse('saber', 'warrior', content, 25), true);
    assert.equal(canUse('estoc', 'warrior', content, 49), false);
    assert.equal(canUse('estoc', 'warrior', content, 50), true);
    assert.equal(canUse('estoc', 'mage', content, 50), false);
    const rng = createRng('trzecie-bazy');
    const swords = (maxClassLevel) => {
      const found = new Set();
      for (let index = 0; index < 600; index++) {
        const item = randomItem(60, rng, content, { classId: 'warrior', maxClassLevel });
        if (item.slot === 'weapon' && content.basesById[item.base].family === 'sword') found.add(item.base);
      }
      return [...found].sort();
    };
    assert.deepEqual(swords(24), ['broadsword']);
    assert.deepEqual(swords(25), ['broadsword', 'saber']);
    assert.deepEqual(swords(50), ['broadsword', 'estoc', 'saber']);
  });

  test('properties are described in Polish', () => {
    const rng = createRng('opis');
    const staff = generateItem({ baseId: 'staff', level: 3, rarityId: 'rare', element: 'frost', affixIds: ['embers'] }, rng, content);
    const lines = itemProperties(staff, content);
    assert.match(lines[0], /^Obrażenia: \d+–\d+ \(magiczne, mróz\)$/);
    assert.match(lines[1], /^Odporność na ogień: \+\d+$/);
  });

  test('weapons, off-hands and the armour of the head and chest belong to classes, the rest fits anyone', () => {
    assert.equal(canUse('staff', 'mage', content), true);
    assert.equal(canUse('staff', 'shadow', content), false);
    assert.equal(canUse('shield', 'cleric', content), true);
    assert.equal(canUse('quiver', 'mage', content), false);
    // Chainmail and the helmet are the warrior's alone, the robe the mage's,
    // the Kapuza and the Komża the cleric's, the jacket is for the archer and
    // the shadow, and the hood for them and the mage.
    const wearers = (baseId) => ['warrior', 'archer', 'mage', 'cleric', 'shadow'].filter((classId) => canUse(baseId, classId, content));
    assert.deepEqual(wearers('robe'), ['mage']);
    assert.deepEqual(wearers('chainmail'), ['warrior']);
    assert.deepEqual(wearers('helmet'), ['warrior']);
    assert.deepEqual(wearers('cowl'), ['cleric']);
    assert.deepEqual(wearers('surplice'), ['cleric']);
    assert.deepEqual(wearers('tunic'), ['archer', 'shadow']);
    assert.deepEqual(wearers('hood'), ['archer', 'mage', 'shadow']);
    // The Kołczan and the Sajdak are the archer's alone; the Cień, who does
    // not shoot, has the Mizerykordia and the Kordzik with the same numbers.
    assert.deepEqual(wearers('quiver'), ['archer']);
    assert.deepEqual(wearers('bow-case'), ['archer']);
    assert.deepEqual(wearers('misericorde'), ['shadow']);
    assert.deepEqual(wearers('dirk'), ['shadow']);
    assert.equal(canUse('dirk', 'shadow', content, 9), false);
    for (const baseId of ['gloves', 'boots', 'amulet', 'ring', 'talisman']) assert.equal(wearers(baseId).length, 5, baseId);
    // Loot only ever holds what the character's class can use.
    const rng = createRng('łup');
    const found = new Set();
    for (let i = 0; i < 300; i++) {
      const item = randomItem(10, rng, content, { classId: 'shadow', filled: new Set(['weapon']) });
      assert.ok(canUse(item.base, 'shadow', content), item.base);
      found.add(item.base);
    }
    assert.ok(found.has('tunic') && found.has('hood') && found.has('gloves'));
    // With a share for other classes, that share is theirs alone: to trade or take apart.
    const others = Array.from({ length: 2000 }, () =>
      randomItem(20, rng, content, { classId: 'shadow', filled: new Set(['weapon']), otherClassShare: 0.25 }),
    ).filter((item) => !canUse(item.base, 'shadow', content));
    assert.ok(Math.abs(others.length / 2000 - 0.25) < 0.04, `${others.length}`);
    assert.ok(new Set(others.map((item) => item.base)).has('staff'));
    // The first weapon is still of the character's class.
    assert.ok(canUse(randomItem(20, rng, content, { classId: 'shadow', filled: new Set(), otherClassShare: 1 }).base, 'shadow', content));
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

  test('the front draws the party\'s blows: the back only when it falls much sooner', () => {
    const player = { ...playerCombatant({ character: newCharacter('warrior', { level: 5 }), equipped: kit('warrior'), name: 'Mira' }, content), maxHp: 9000, hp: 9000 };
    const boar = (id, hp, position) => ({ ...monsterCombatant({ monsterId: 'boar', level: 5, id }, content), hp, maxHp: 400, position });
    const first = (back) => fight('przod', [player], [boar('e0', 400, 'front'), boar('e1', back, 'back')]).events.find((event) => event.actor === player.id && event.target).target;
    // The back needs fewer blows, but not 40% of the front's: the front.
    assert.equal(first(240), 'e0');
    // A third of the front's: the back.
    assert.equal(first(130), 'e1');
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

  // The swamps' effects: Ugrzęźnięcie, Wysysanie, a weakness, and the traits
  // of Szuwary and Opary torfu.
  const swampFight = (seed, classId, level, monsterId, { trait = null, sure = false } = {}) => {
    const { character, equipped } = typicalCharacter(classId, level, content);
    const player = { ...playerCombatant({ character, equipped, name: 'Mira' }, content), willRating: 0 };
    const enemy = monsterCombatant({ monsterId, level, id: 'e0' }, content);
    const weapon = sure && enemy.weapon.slow ? { ...enemy.weapon, slow: { ...enemy.weapon.slow, chance: 1 } } : enemy.weapon;
    return simulateFight({ allies: [player], enemies: [{ ...enemy, weapon, maxHp: 50000, hp: 50000 }], rng: createRng(seed), content, record: true, trait });
  };

  test('a miring blow (Ugrzęźnięcie) puts off the next move of the one it hits', () => {
    const result = swampFight('grzęzawisko', 'warrior', 88, 'sundew', { sure: true });
    const mired = result.events.filter((event) => event.kind === 'slow' && event.effect === 'Ugrzęźnięcie');
    assert.ok(mired.length > 0);
    assert.deepEqual(mired[0].targets, ['a0']);
    // The sundew moves more often than the mired warrior would let it otherwise.
    const free = swampFight('grzęzawisko', 'warrior', 88, 'peatling');
    const moves = (fight, id) => fight.events.filter((event) => event.actor === id && (event.kind === 'hit' || event.kind === 'crit' || event.kind === 'dodge')).length;
    assert.ok(moves(result, 'e0') / Math.max(1, moves(result, 'a0')) > moves(free, 'e0') / Math.max(1, moves(free, 'a0')));
  });

  test('a draining blow (Wysysanie) heals the monster by a share of the damage', () => {
    const result = swampFight('pijawki', 'warrior', 82, 'leech');
    const drains = result.events.filter((event) => event.kind === 'drain');
    assert.ok(drains.length > 0);
    // Each drain follows the leech's own blow and gives back at most 60% of it.
    for (const drain of drains) {
      const blow = result.events[result.events.indexOf(drain) - 1];
      assert.equal(blow.actor, 'e0');
      assert.ok(drain.amount <= Math.round(blow.damage * 0.6));
      assert.match(drain.text, /Pijawka/);
    }
  });

  test('the Torfiak takes half as much again from fire, from blows and burns', () => {
    const result = swampFight('torf', 'mage', 88, 'peatling');
    const fireHits = result.events.filter((event) => (event.kind === 'hit' || event.kind === 'crit') && event.actor === 'a0' && /Słaby punkt \(ogień\): \+50%/.test(event.text));
    assert.ok(fireHits.length > 0);
    // Without the weakness the same fight's first fire blow is two thirds as strong.
    const plain = simulateFight({
      allies: [{ ...playerCombatant({ ...typicalCharacter('mage', 88, content), name: 'Mira' }, content), willRating: 0 }],
      enemies: [{ ...monsterCombatant({ monsterId: 'peatling', level: 88, id: 'e0' }, content), weak: undefined, maxHp: 50000, hp: 50000 }],
      rng: createRng('torf'),
      content,
      record: true,
    });
    const first = (fight) => fight.events.find((event) => (event.kind === 'hit' || event.kind === 'crit') && event.actor === 'a0').damage;
    assert.ok(Math.abs(first(result) / first(plain) - 1.5) < 0.02, `${first(result)} / ${first(plain)}`);
  });

  test('Opary torfu make a poison last one move longer, and Szuwary hide the back of the line', () => {
    const peat = content.regionsById['peat-bogs'].trait;
    const ticksLeft = (fight) => fight.events.find((event) => event.kind === 'tick' && event.effect === 'Zatrucie')?.left;
    const plain = swampFight('opary', 'warrior', 92, 'salamander');
    const fumes = swampFight('opary', 'warrior', 92, 'salamander', { trait: peat });
    assert.equal(ticksLeft(fumes), ticksLeft(plain) + 1);
    const { character, equipped } = typicalCharacter('archer', 53, content);
    const reeds = content.areasById['reed-beds'];
    const back = (area) => playerCombatant({ character: { ...character, position: 'back' }, equipped, name: 'Mira', area }, content).dodgeRating;
    assert.ok(Math.abs(back(reeds) / back(content.areasById['glade-heart']) - 1.05) < 1e-9);
    const front = playerCombatant({ character: { ...character, position: 'front' }, equipped, name: 'Mira', area: reeds }, content).dodgeRating;
    assert.ok(Math.abs(front / back(content.areasById['glade-heart']) - 1) < 1e-9);
  });
});

describe('hunts', () => {
  const warrior = typicalCharacter('warrior', 3, content);
  const hunt = (overrides = {}) =>
    simulateHunt(
      { ...warrior, hp: 9999, name: 'Mira', areaId: 'windfalls-edge', minutes: 60, seed: 'polowanie', ...overrides },
      content,
    );

  test('from character level 15 some of the items found are for other classes', () => {
    const foreign = (level, areaId) => {
      const character = typicalCharacter('warrior', level, content);
      return Array.from({ length: 60 }, (_, i) => simulateHunt({ ...character, hp: 9999, name: 'Mira', areaId, minutes: 120, seed: `obce:${i}` }, content))
        .flatMap((result) => result.items)
        .filter((item) => !canUse(item.base, 'warrior', content)).length;
    };
    assert.equal(foreign(content.balance.items.otherClass.fromLevel - 1, 'raven-hollows'), 0);
    assert.ok(foreign(content.balance.items.otherClass.fromLevel, 'raven-hollows') > 0);
  });

  test('the same seed always gives the same hunt', () => {
    assert.deepEqual(hunt(), hunt());
    assert.notDeepEqual(hunt(), hunt({ seed: 'inne' }));
  });

  test('fights grow with the length, never fewer on a longer one, rewards with the time', () => {
    // 1 minute: 1 fight, 5 minutes: 2, 15: 3, half an hour: 4, an hour: 6,
    // 2 hours: 8, 4 hours: 10 (the author, 166: "nie może być więcej walk w
    // krótkiej wyprawie niż w długiej").
    assert.deepEqual([1, 5, 15, 30, 60, 120, 240].map((minutes) => explorationPace(minutes, content).fights), [1, 2, 3, 4, 6, 8, 10]);
    assert.deepEqual([1, 5, 15].map((minutes) => hunt({ minutes }).fights.length), [1, 2, 3]);
    // A character that does not outgrow the place earns with the time.
    const settled = typicalCharacter('warrior', 43, content);
    const xp = (minutes) => simulateHunt({ ...settled, hp: 9999, name: 'Mira', areaId: 'wolf-circles', minutes, seed: 'czas' }, content).xp;
    assert.ok(xp(240) > xp(15) * 5);
    const pace = (minutes) => explorationPace(minutes, content);
    assert.equal(pace(240).timeFactor, 240 / 10 / content.balance.hunt.minutesPerFightReference);
    // A light bonus for the length and a longer rest after each fight.
    assert.equal(pace(30).lengthBonus, 0);
    assert.ok(pace(60).lengthBonus > 0 && pace(60).lengthBonus < pace(240).lengthBonus && pace(240).lengthBonus <= 0.06);
    assert.equal(pace(30).restBonus, 0);
    assert.ok(pace(60).restBonus > 0 && pace(60).restBonus < pace(240).restBonus);
    // Longer explorations meet demanding encounters and the elite more often.
    assert.equal(pace(1).toughChance, 0);
    assert.ok(pace(30).toughChance < pace(120).toughChance && pace(120).toughChance < pace(240).toughChance);
    assert.ok(pace(15).eliteChance < pace(240).eliteChance);
  });

  test('a longer exploration finds unique and rarer items a little more often, at most a tenth more at four hours (482 B)', () => {
    const tuning = content.balance.hunt;
    const raised = (from) => content.rarities.slice(content.rarities.findIndex((rarity) => rarity.id === from)).map((rarity) => rarity.id);
    assert.deepEqual(raised(tuning.uniqueLengthFrom), ['unique', 'epic', 'legendary', 'mythic', 'divine']);
    // The draw: the same weights up to half an hour, the rarer ones x1.1 at
    // four hours; common and rare items never gain.
    const share = (unique) => {
      const rng = createRng('rzadkie');
      let count = 0;
      for (let i = 0; i < 40000; i++) if (raised('unique').includes(rollRarity(rng, content, 1, unique))) count += 1;
      return count / 40000;
    };
    const base = share(1);
    const long = share(1.1);
    assert.ok(long > base * 1.04 && long < base * 1.14, `${base} → ${long}`);
    // The factor by length: 1 to half an hour, then the same step at each
    // doubling, 1.1 at four hours and never more.
    const factor = (minutes) => {
      const pairs = tuning.uniqueLengthFactorByMinutes;
      if (minutes <= pairs[0][0]) return pairs[0][1];
      for (let i = 1; i < pairs.length; i++) {
        const [m0, v0] = pairs[i - 1];
        const [m1, v1] = pairs[i];
        if (minutes <= m1) return v0 + ((v1 - v0) * Math.log(minutes / m0)) / Math.log(m1 / m0);
      }
      return pairs.at(-1)[1];
    };
    assert.deepEqual([factor(5), factor(30), factor(240), factor(480)], [1, 1, 1.1, 1.1]);
    assert.ok(Math.abs(factor(60) - (1 + 0.1 / 3)) < 1e-9 && Math.abs(factor(120) - (1 + 0.2 / 3)) < 1e-9);
  });

  test('a longer exploration pays off more: from half an hour on, the elite, the champion and finds come more often in an hour', () => {
    const pace = (minutes) => explorationPace(minutes, content);
    // Meetings and finds a minute.
    const elites = (minutes) => (pace(minutes).eliteChance * pace(minutes).fights) / minutes;
    const champions = (minutes) => (pace(minutes).championChance * pace(minutes).fights) / minutes;
    const finds = (minutes) => pace(minutes).finds / minutes;
    const near = (a, b) => Math.abs(a - b) < 1e-12;
    // Up to half an hour the same in an hour, as before.
    for (const minutes of [1, 5, 15]) {
      assert.ok(near(elites(minutes), elites(30)), `${minutes}`);
      assert.ok(near(champions(minutes), champions(30)), `${minutes}`);
      assert.ok(near(finds(minutes), finds(30)), `${minutes}`);
    }
    // Then more and more: twice the elites and champions and a fifth more
    // finds in an hour of a four-hour exploration.
    assert.ok(elites(30) < elites(60) && elites(60) < elites(120) && elites(120) < elites(240));
    assert.ok(near(elites(240), 2 * elites(30)));
    assert.ok(near(champions(240), 2 * champions(30)));
    assert.ok(finds(30) < finds(60) && finds(60) < finds(240));
    assert.ok(near(finds(240), 1.2 * finds(30)));
  });

  test('demanding encounters are stronger and leave more materials', () => {
    const level = 20;
    const withTough = (chance) => ({ ...content, balance: { ...content.balance, hunt: { ...content.balance.hunt, toughChanceByMinutes: [[1, chance]] } } });
    const character = typicalCharacter('warrior', level, content);
    const result = simulateHunt({ ...character, hp: 9999, name: 'Mira', areaId: 'viper-heaps', minutes: 60, seed: 'trudne' }, withTough(1));
    assert.ok(result.fights.every((fight) => fight.tough));
    // Monsters of the place (16–20), some levels higher.
    const bonus = content.balance.hunt.toughLevelBonus;
    assert.ok(result.fights.every((fight) => fight.enemies.every((enemy) => enemy.level >= 16 + bonus && enemy.level <= 20 + bonus)));
    const materials = (chance) => {
      let total = 0;
      for (let i = 0; i < 60; i++) {
        const hunt = simulateHunt({ ...character, hp: 9999, name: 'Mira', areaId: 'viper-heaps', minutes: 60, seed: `trudne:${i}` }, withTough(chance));
        total += Object.values(hunt.materials).reduce((sum, count) => sum + count, 0);
      }
      return total;
    };
    assert.ok(materials(1) > materials(0) * 1.2, `${materials(1)} vs ${materials(0)}`);
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

  test('the Otoczak is found where the place reaches class level 10, whatever the class level', () => {
    // Every find is a treasure chest, one a minute.
    const hunt = { ...content.balance.hunt, findIntervalMinutes: 1 };
    const rewards = { ...content.balance.rewards, findOutcomes: { chest: 1 } };
    const chests = { ...content, balance: { ...content.balance, hunt, rewards } };
    const talismans = (character, equipped, areaId) =>
      Array.from({ length: 4 }, (_, i) => simulateHunt({ character, equipped, hp: 9999, name: 'Mira', areaId, minutes: 60, seed: `otoczak:${areaId}:${i}` }, chests))
        .flatMap((result) => result.items)
        .filter((item) => item.slot === 'talisman')
        .map((item) => item.base);
    // Class level 20 in Skraj Wiatrołomów (levels 1–5): the wooden Talizman only.
    const strong = typicalCharacter('warrior', 30, content);
    const edge = talismans({ ...strong.character, classLevel: 20 }, strong.equipped, 'windfalls-edge');
    assert.ok(edge.length > 0 && edge.every((base) => base === 'talisman'), edge.join());
    // Class level 5 in Lisie Jary (6–10): the Otoczak too, worn from 10.
    const young = typicalCharacter('warrior', 8, content);
    const ravines = talismans({ ...young.character, classLevel: 5 }, young.equipped, 'fox-ravines');
    assert.ok(ravines.includes('holed-stone') && ravines.includes('talisman'), ravines.join());
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
        assert.ok(content.monstersById[area.elite].elite, area.id);
        assert.equal(area.safe, region.safe);
        assert.deepEqual(area.trait, region.trait);
      }
      // The champion lives in the last inner region only.
      assert.deepEqual(region.areas.slice(0, -1).map((area) => area.champion), [null, null, null, null]);
      assert.ok(content.monstersById[region.areas.at(-1).champion].champion, region.id);
    }
    // Wiatrołomy: Błędnica in the first three inner regions, Płanetnik deeper.
    assert.deepEqual(content.regionsById.windfalls.areas.map((area) => area.elite), ['wisp', 'wisp', 'wisp', 'planetnik', 'planetnik']);
    assert.deepEqual(content.regions.map((region) => region.areas.at(-1).champion), ['tusker', 'basilisk', 'water-spirit', 'mud-lord', 'rokita', 'rarog']);
  });

  test('Uroczysko Kamieni has its own creatures, none from Wiatrołomy', () => {
    const roster = (region) => new Set(region.areas.flatMap((area) => [...area.encounters, ...area.tough].flatMap((encounter) => encounter.monsters)));
    const windfalls = roster(content.regionsById.windfalls);
    const glade = roster(content.regionsById['stone-glade']);
    assert.deepEqual([...glade].filter((id) => windfalls.has(id)), []);
    for (const id of ['stag', 'marten', 'hornets']) assert.ok(windfalls.has(id), id);
    for (const id of ['stoneling', 'bat', 'eagle-owl', 'she-wolf']) assert.ok(glade.has(id), id);
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
    for (const level of [1, 2, 5, 10]) assert.ok(Math.abs(huntingHours(level, content) * 60 - 20) < 0.5, `level ${level}`);
    assert.ok(huntingHours(25, content) * 60 > 30);
    assert.ok(huntingHours(100, content) > 8 && huntingHours(100, content) < 12);
    assert.ok(huntingHours(500, content) > 20 && huntingHours(500, content) < 30);
    assert.equal(content.balance.progression.maxLevel, 500);
    // Class levels need less XP, so they come faster.
    assert.ok(classXpToNext(1, content) < xpToNext(1, content));
  });

  test('the mid-game levels take longer, twice as long at its end, and none takes less than the one before', () => {
    const { firstLevelMinutes, flatLevels, levelTimeExponent, midGame } = content.balance.progression;
    const plain = (level) => (firstLevelMinutes / 60) * Math.max(1, level / flatLevels) ** levelTimeExponent;
    assert.ok(Math.abs(huntingHours(midGame.fromLevel, content) - plain(midGame.fromLevel)) < 1e-9);
    assert.ok(huntingHours(35, content) > plain(35) * 1.3);
    assert.ok(Math.abs(huntingHours(midGame.toLevel, content) / plain(midGame.toLevel) - midGame.levelTimeFactor) < 1e-9);
    // Past the mid-game the slowdown fades, and the late game keeps its pace.
    assert.ok(Math.abs(huntingHours(midGame.fadeLevel, content) - plain(midGame.fadeLevel)) < 1e-9);
    for (let level = 2; level <= content.balance.progression.maxLevel; level++) {
      assert.ok(huntingHours(level, content) >= huntingHours(level - 1, content), `level ${level}`);
    }
  });

  test('mid-game monsters hit harder and last longer, the first ones do not', () => {
    const { midGame } = content.balance.monsters;
    const plainContent = { ...content, balance: { ...content.balance, monsters: { ...content.balance.monsters, midGame: { ...midGame, damage: 0, hp: 0 } } } };
    const bear = (level, from) => monsterCombatant({ monsterId: 'bear', level, id: 'e0' }, from);
    assert.equal(bear(midGame.fromLevel, content).maxHp, bear(midGame.fromLevel, plainContent).maxHp);
    assert.equal(bear(midGame.fromLevel, content).weapon.max, bear(midGame.fromLevel, plainContent).weapon.max);
    assert.ok(Math.abs(bear(midGame.toLevel, content).maxHp / bear(midGame.toLevel, plainContent).maxHp - (1 + midGame.hp)) < 0.01);
    assert.ok(Math.abs(bear(midGame.toLevel, content).weapon.max / bear(midGame.toLevel, plainContent).weapon.max - (1 + midGame.damage)) < 1e-9);
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
    // One gain to a line: the levels, the points of both together, the heal,
    // and then what level 2 opens (long hunts and the stats screen).
    const unlocks = content.unlocks.filter((u) => u.level === 2).map((u) => u.message);
    assert.deepEqual(applied.messages, [
      'Osiągnięto poziom: 2',
      'Osiągnięto poziom Klasy Kleryk: 2',
      'Zdobyto wolne punkty statystyk: +10',
      'Zdobyto Punkty Czasu: +3',
      'Awansowałeś. Twoje HP i Mana odnowiły się.',
      ...unlocks,
    ]);
    assert.equal(applied.levelled, true);
    // A level and a class level: 2 and 1 Time Points (data/balance.json).
    assert.equal(applied.timePoints, 3);
    // A woman's character is told in her form.
    const her = applyHunt({ ...character, appearance: 'female' }, { xp: xpToNext(1, content) + 5, result: 'success' }, content);
    assert.equal(her.messages[4], 'Awansowałaś. Twoje HP i Mana odnowiły się.');
    // A class level before character level 2 says when its points can be spent.
    const early = applyHunt(character, { xp: classXpToNext(1, content), result: 'success' }, content);
    assert.equal(early.level, 1);
    assert.deepEqual(early.messages, [
      'Osiągnięto poziom Klasy Kleryk: 2',
      'Zdobyto wolne punkty statystyk: +2 (rozdasz je od poziomu 2)',
      'Zdobyto Punkty Czasu: +1',
      'Awansowałeś. Twoje HP i Mana odnowiły się.',
    ]);
    assert.equal(early.timePoints, 1);

    // Several levels at once: one line for each kind, with all their points.
    const xp = [1, 2, 3].reduce((sum, level) => sum + xpToNext(level, content), 0);
    const many = applyHunt(character, { xp, result: 'success' }, content);
    assert.equal(many.level, 4);
    const classLevels = many.classLevel - 1;
    assert.deepEqual(many.messages.slice(0, 5), [
      'Osiągnięto poziom: 4',
      `Osiągnięto poziom Klasy Kleryk: ${many.classLevel}`,
      `Zdobyto wolne punkty statystyk: +${24 + 2 * classLevels}`,
      `Zdobyto Punkty Czasu: +${6 + classLevels}`,
      'Awansowałeś. Twoje HP i Mana odnowiły się.',
    ]);
    assert.equal(many.messages.filter((message) => message.startsWith('Osiągnięto poziom')).length, 2);
    assert.equal(many.timePoints, 6 + (many.classLevel - 1));

    const fainted = applyHunt({ ...character, level: 3, xp: 10 }, { xp: 0, result: 'fainted' }, content);
    assert.equal(fainted.levelled, false);
    assert.equal(fainted.level, 3);
    assert.equal(fainted.xp, 0);
    assert.equal(fainted.penalty, 10);
    assert.equal(fainted.timePoints, 0);
    // Time shards found on the way count too.
    assert.equal(applyHunt(character, { xp: 0, result: 'success', timePoints: 5 }, content).timePoints, 5);
  });

  test('a new level heals fully at the new level; without one the HP after the exploration stays', () => {
    const character = newCharacter('warrior', { level: 1, xp: 0, classLevel: 1, classXp: 0 });
    const hunt = { xp: xpToNext(1, content) + 5, result: 'success', hpEnd: 3 };
    const applied = applyHunt(character, hunt, content);
    const before = playerCombatant({ character, equipped: [], name: 'A' }, content).maxHp;
    const healed = hpAfterHunt({ character, applied, hunt, equipped: [], name: 'A' }, content);
    assert.ok(healed > before, `${healed} > ${before}`);
    assert.equal(healed, playerCombatant({ character: { ...character, level: 2, classLevel: applied.classLevel }, equipped: [], name: 'A' }, content).maxHp);
    const calm = { xp: 1, result: 'success', hpEnd: 3 };
    assert.equal(hpAfterHunt({ character, applied: applyHunt(character, calm, content), hunt: calm, equipped: [], name: 'A' }, content), 3);
  });

  test('hunting far below your level gives less XP, at most half less', () => {
    // From 4 levels above a creature, 10% less for each level, down to half.
    assert.equal(lowLevelMultiplier(5, 3, content), 1);
    assert.equal(lowLevelMultiplier(8, 5, content), 1);
    assert.equal(lowLevelMultiplier(10, 5, content), 0.8);
    assert.equal(lowLevelMultiplier(20, 1, content), 0.5);
    assert.equal(content.balance.hunt.lowLevelMinMultiplier, 0.5);
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

  test('a Punkt Czasu comes every half an hour, with no limit, and the rest of an interval carries on', () => {
    const minute = 60000;
    assert.equal(content.balance.timePoints.generateMinutes, 30);
    assert.deepEqual(gainedTimePoints(0, 29 * minute, content), { points: 0, since: 0 });
    assert.deepEqual(gainedTimePoints(0, 30 * minute, content), { points: 1, since: 30 * minute });
    // 95 minutes: three points, and the next one 25 minutes on.
    assert.deepEqual(gainedTimePoints(1000, 1000 + 95 * minute, content), { points: 3, since: 1000 + 90 * minute });
    // A month away: every point, none lost.
    assert.equal(gainedTimePoints(0, 30 * 24 * 60 * minute, content).points, 30 * 48);
    // A clock behind the start gives nothing.
    assert.deepEqual(gainedTimePoints(5000, 0, content), { points: 0, since: 5000 });
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
    // Each step has its System message, and the towers open with the longest hunts.
    assert.deepEqual(unlockMessages(25, content), [
      'Odblokowano Górnictwo. Systemowa Kopalnia czeka w zakładce Profesje.',
      'Odblokowano Jubilerstwo. Systemowa Szlifiernia czeka w zakładce Profesje.',
      content.unlocksById.party.message,
      'Odblokowano eksploracje do 1 godziny.',
    ]);
    assert.deepEqual(unlockMessages(10, content), ['Odblokowano Profesje. Zajrzyj do zakładki Profesje.']);
    // Rzemieślnictwo's message only where the game has it on.
    assert.deepEqual(unlockMessages(15, content), []);
    assert.deepEqual(unlockMessages(15, { ...content, features: ['crafting'] }), ['Odblokowano Rzemieślnictwo. Systemowy Warsztat czeka w zakładce Profesje.']);
    assert.deepEqual(
      ['professions', 'settlement', 'party', 'towers'].map((id) => content.unlocksById[id].level),
      [10, 20, 25, 50],
    );
    // The skills open with the class level, not the character's.
    assert.equal(content.unlocksById.skills.classLevel, 10);
    assert.ok(!unlockedFeatures(30, content, 9).includes('skills'));
    assert.ok(unlockedFeatures(8, content, 10).includes('skills'));
    assert.ok(!unlockedFeatures(19, content).includes('settlement'));
    assert.ok(unlockedFeatures(20, content).includes('settlement'));
    assert.ok(!unlockedFeatures(100, content).includes('core'));
  });

  test('an inner region opens when the class reaches the level before its lowest one', () => {
    assert.deepEqual(content.areas.map((area) => areaUnlockLevel(area, content)), [1, ...Array.from({ length: 29 }, (_, i) => 5 * (i + 1))]);
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

describe('Parametry dodatkowe', () => {
  test('show the total armour with its sources, the chances under their caps and every resistance', () => {
    const character = newCharacter('warrior');
    const worn = kit('warrior');
    const extra = extraValues(character, worn, content);
    const values = combatValues(character, worn, content);
    const tuning = content.balance.combat;
    assert.ok(extra.armor.equipment > 0 && extra.armor.endurance > 0);
    assert.equal(extra.armor.total, extra.armor.equipment + extra.armor.endurance);
    assert.equal(extra.armor.trait, null);
    assert.equal(extra.armor.reduction, values.reduction);
    assert.equal(extra.dodge.chance, values.dodge);
    assert.equal(extra.crit.chance, values.crit);
    assert.equal(extra.effectResist.chance, values.effectResist);
    for (const [chance, cap] of [[extra.dodge, tuning.dodgeCap], [extra.crit, tuning.critCap], [extra.effectResist, tuning.willCap]]) {
      assert.equal(chance.cap, cap);
      assert.ok(chance.chance > 0 && chance.chance < cap);
    }
    assert.equal(extra.crit.multiplier, tuning.critMultiplier);
    assert.equal(extra.speed, values.speed);
    assert.equal(extra.regen, values.regen);
    assert.equal(extra.recovery, values.recovery);
    assert.deepEqual(extra.resist.map((element) => element.id), content.elements.map((element) => element.id));
    // The Ognisko's share speeds up the HP at rest.
    assert.ok(extraValues(character, worn, content, { rest: 0.5 }).regen > extra.regen);
  });

  test('name the trait that raises the armour, and the one that makes crits hit harder', () => {
    const guardian = { ...newCharacter('warrior'), evolution: 'guardian' };
    const worn = kit('warrior');
    const plain = extraValues(newCharacter('warrior'), worn, content);
    const extra = extraValues(guardian, worn, content);
    assert.deepEqual(extra.armor.trait, { name: 'Opoka', share: 0.1 });
    assert.equal(extra.armor.total, Math.round((plain.armor.equipment + plain.armor.endurance) * 1.1));
    const sniper = extraValues({ ...newCharacter('archer'), evolution: 'sniper' }, kit('archer'), content);
    assert.equal(sniper.crit.multiplier, content.balance.combat.critMultiplier * 1.25);
  });
});

describe('item comparisons', () => {
  test('a find is better, worse, a trade-off or the same as what its slot holds', () => {
    const character = newCharacter('warrior');
    const worn = kit('warrior');
    const sword = worn.find((item) => item.slot === 'weapon');
    const mail = worn.find((item) => item.slot === 'chest');
    const stronger = equipChange(character, worn, { ...sword, damage: { min: sword.damage.min + 5, max: sword.damage.max + 5 } }, content);
    assert.equal(stronger.verdict, 'better');
    assert.ok(stronger.changes.damage > 0);
    assert.equal(equipChange(character, worn, { ...sword, damage: { min: 1, max: 1 } }, content).verdict, 'worse');
    assert.deepEqual(equipChange(character, worn, sword, content), { changes: {}, verdict: 'same' });
    // Less armour for much more strength: more damage, less reduction.
    const traded = equipChange(character, worn, { ...mail, armor: 1, affixes: [{ kind: 'prefix', stat: 'strength', value: 20 }] }, content);
    assert.equal(traded.verdict, 'mixed');
    assert.ok(traded.changes.damage > 0 && traded.changes.reduction < 0);
    // Into an empty slot anything that adds something is better.
    assert.equal(equipChange(character, worn.filter((item) => item !== mail), mail, content).verdict, 'better');
  });

  test('a resistance counts as a change in combat, by its element', () => {
    const character = newCharacter('warrior');
    const worn = kit('warrior');
    const mail = worn.find((item) => item.slot === 'chest');
    const warded = equipChange(character, worn, { ...mail, affixes: [...mail.affixes, { kind: 'suffix', stat: 'resist.fire', value: 10 }] }, content);
    assert.equal(warded.verdict, 'better');
    assert.deepEqual(Object.keys(warded.changes), ['resist.fire']);
    assert.ok(warded.changes['resist.fire'] > 0);
  });

  test("an item's lines add its armour and stats up by kind", () => {
    const sword = { base: 'sword', slot: 'weapon', level: 1, rarity: 'common', damage: { min: 5, max: 8 }, affixes: [{ kind: 'prefix', stat: 'strength', value: 3 }] };
    assert.deepEqual(itemLines(sword, content), [
      { id: 'damage', label: 'Obrażenia', value: 6.5, text: '5–8' },
      { id: 'strength', label: content.statsById.strength.name, value: 3, text: '+3' },
    ]);
    const mail = { base: 'chainmail', slot: 'chest', level: 1, rarity: 'common', armor: 10, affixes: [{ kind: 'suffix', stat: 'armor', value: 2 }] };
    assert.deepEqual(itemLines(mail, content), [{ id: 'armor', label: 'Pancerz', value: 12, text: '+12' }]);
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
  // A level 26 mage, new to the first unsafe inner region, faints now and then on a 4-hour exploration
  // (with the slower levels of 28.10.2026 its gear lags less, so about one in twenty).
  const { character, equipped } = typicalCharacter('mage', 26, content);
  const estimated = faintChances({ character, equipped, hp: 9999, areaId: 'mossy-boulders' }, content)[240];
  const simulated = simulateMany({ classId: 'mage', level: 26, minutes: 240, hunts: 300 }, content).faintRate;
  assert.ok(simulated > 0.03, `simulated ${simulated}`);
  assert.ok(Math.abs(estimated - simulated) < 0.1, `estimated ${estimated}, simulated ${simulated}`);
  assert.ok(['moderate', 'high', 'very-high'].includes(estimateThreat({ character, equipped, hp: 9999, areaId: 'mossy-boulders' }, content)[240]));

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
    // The crafting table sets up in a minute, but its next levels take
    // longer than the other buildings': 10 minutes, half an hour, a day at last.
    const table = content.buildingsById['craft-table'];
    const tableMinutes = Array.from({ length: table.maxLevel }, (_, i) => upgradeMinutes(table, i + 1));
    assert.deepEqual(tableMinutes.slice(0, 3), [1, 10, 30]);
    assert.equal(tableMinutes.at(-1), 24 * 60);
    for (let i = 1; i < tableMinutes.length; i++) assert.ok(tableMinutes[i] > tableMinutes[i - 1] && tableMinutes[i] >= minutes[i]);
    // The camp's own level is on no plot, costs gold alone and grows slowly:
    // 4 hours to level 2, from level 1, which the camp has from the start.
    const { camp } = content;
    assert.equal(campLevel({}, 0, content), 1);
    assert.equal(campLevel({ camp: { level: 3, startedAt: 0, endsAt: 10 } }, 5, content), 2);
    assert.deepEqual([upgradeCost(camp, 2), upgradeCost(camp, 3), upgradeCost(camp, 10)], [{ gold: 500 }, { gold: 1000 }, { gold: 128000 }]);
    assert.equal(buildMinutes(camp, 2, 1, content), 240);
    assert.equal(buildMinutes(camp, 3, 2, content), 480);
    assert.ok(!content.buildings.some((building) => building.id === camp.id));
    // Each camp level above the first makes the buildings build 10% faster.
    assert.deepEqual([1, 2, 10].map((level) => buildSpeed(level, content)), [0, 0.1, 0.9]);
    assert.equal(buildMinutes(campfire, 10, 1, content), minutes.at(-1));
    assert.equal(buildMinutes(campfire, 10, 10, content), Math.round(minutes.at(-1) / 1.9));
    assert.deepEqual([campEffectText(1, content), campEffectText(4, content)], ['Budowy w zwykłym tempie', 'Budowy szybsze o 30%']);
    for (const building of content.buildings) {
      // Every level needs more than gold: the resources come from explorations.
      assert.ok(Object.keys(upgradeCost(building, 1)).length >= 2, building.id);
      for (let level = 2; level <= building.maxLevel; level++) {
        const [cost, before] = [upgradeCost(building, level), upgradeCost(building, level - 1)];
        for (const [resource, amount] of Object.entries(before)) assert.ok(cost[resource] > amount, `${building.id} ${level} ${resource}`);
      }
    }
  });

  test('the queue: builds wait one after another, and the levels come after them', () => {
    const { camp } = content;
    const sawmill = content.buildingsById.sawmill;
    const stored = { sawmill: { level: 2, startedAt: 0, endsAt: 100 } };
    const queue = [
      { buildingId: 'camp', level: 2, startsAt: 100, endsAt: 500 },
      { buildingId: 'sawmill', level: 3, startsAt: 500, endsAt: 800 },
    ];
    assert.equal(content.camp.queue, 3);
    assert.deepEqual([buildsUnderWay(stored, queue, 50), buildsUnderWay(stored, [], 50), buildsUnderWay(stored, [], 150)], [3, 1, 0]);
    assert.deepEqual([queueEnd(stored, queue, 50), queueEnd(stored, [], 50), queueEnd(stored, [], 150)], [800, 100, 150]);
    // The level after everything under way and waiting: the Tartak's 2 under
    // way, then 3 waiting; the camp's 2 waiting; nothing yet for the mine.
    assert.deepEqual(
      [plannedLevel(sawmill, stored, queue), plannedLevel(sawmill, stored, []), plannedLevel(camp, stored, queue), plannedLevel(camp, stored, [])],
      [3, 2, 2, 1],
    );
    assert.equal(plannedLevel(content.buildingsById.mine, stored, queue), 0);
    assert.deepEqual(shiftQueue(queue, 60).map((entry) => [entry.startsAt, entry.endsAt]), [[40, 440], [440, 740]]);
  });

  test('a waiting build called off goes with the higher levels that need it, and the rest is laid out again', () => {
    const minute = 60000;
    const stored = { sawmill: { level: 1, startedAt: 0, endsAt: minute }, 'craft-table': { level: 1, startedAt: 0, endsAt: -1 } };
    const queue = [
      { buildingId: 'camp', level: 2, startsAt: minute, endsAt: 241 * minute },
      { buildingId: 'craft-table', level: 2, startsAt: 241 * minute, endsAt: 250 * minute },
      { buildingId: 'camp', level: 3, startsAt: 250 * minute, endsAt: 730 * minute },
    ];
    const { cancelled, kept } = cancelFromQueue(queue, 'camp', 2);
    assert.deepEqual(cancelled.map((entry) => entry.level), [2, 3]);
    // Without the camp's level 2 the table starts as the Tartak ends and
    // takes its full 10 minutes.
    assert.deepEqual(replanQueue(stored, kept, 0, content).map((entry) => [entry.buildingId, entry.startsAt, entry.endsAt]), [['craft-table', minute, 11 * minute]]);
    // Laid out as it was, nothing moves.
    assert.deepEqual(replanQueue(stored, queue, 0, content).map((entry) => [entry.startsAt, entry.endsAt]), queue.map((entry) => [entry.startsAt, entry.endsAt]));
  });

  test('an upgrade counts once it ends, and one runs at a time', () => {
    const stored = { campfire: { level: 2, startedAt: 1000, endsAt: 5000 } };
    assert.equal(buildingLevel(stored.campfire, 4999), 1);
    assert.equal(buildingLevel(stored.campfire, 5000), 2);
    assert.equal(buildingLevel(undefined, 5000), 0);
    assert.deepEqual(campLevels(stored, 4000, content), {
      sawmill: 0,
      quarry: 0,
      mine: 0,
      'midas-lake': 0,
      campfire: 1,
      'loot-shed': 0,
      'scrap-bench': 0,
      anvil: 0,
      'craft-table': 0,
      // The Osada's Kwatery count too: built only where the Osada is open.
      quarters: 0,
    });
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
    // The Stół rozbiórki names its exchange's rate at the level, on the build card and in "Teraz".
    assert.equal(effectText(content.buildingsById['craft-table'], 2, content), 'Najwyższa rzadkość: unikalna, przeróbka szybsza o 20%, wymiana zasobów 9 za 1');
    assert.equal(effectText(content.buildingsById['craft-table'], 10, content).endsWith(', wymiana zasobów 1 za 1'), true);
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

  test("the Ognisko's fire spirit: cheaper pieces and more of them a day with each level, counted anew each Polish day", () => {
    assert.equal(fireTrade(0, content), null);
    assert.deepEqual(fireTrade(1, content), { unitGold: 10, perDay: 200, resources: ['wood', 'stone', 'iron-ore'] });
    // A piece costs 1 gold less every 2 levels, and a day takes 50 more
    // pieces every 2 levels.
    assert.deepEqual([2, 3, 4, 5, 9, 10].map((level) => [fireTrade(level, content).unitGold, fireTrade(level, content).perDay]), [
      [9, 200],
      [9, 250],
      [8, 250],
      [8, 300],
      [6, 400],
      [5, 400],
    ]);
    // 23:30 and 0:30 in Warsaw (an hour ahead of UTC in winter) are two days.
    const late = Date.UTC(2026, 10, 3, 22, 30);
    assert.deepEqual([fireDay(late, content), fireDay(late + 3600000, content)], ['2026-11-03', '2026-11-04']);
    const kept = { day: fireDay(late, content), units: 150 };
    assert.equal(fireUnitsMade(kept, late, content), 150);
    assert.equal(fireUnitsMade(kept, late + 3600000, content), 0);
    // 150 of 200 pieces traded today: 50 are left, in one trade or many.
    const block = (changes) => fireTradeBlock({ level: 1, gold: 500, made: 150, resource: 'wood', amount: 50, ...changes }, content)?.code ?? null;
    assert.equal(block({}), null);
    assert.equal(block({ amount: 1 }), null);
    assert.equal(block({ amount: 51 }), 'invalid_amount');
    assert.equal(block({ made: 200 }), 'no_trades');
    assert.equal(block({ made: 200, amount: 1 }), 'no_trades');
    assert.equal(block({ gold: 499 }), 'not_enough');
    assert.equal(block({ amount: 3, gold: 30 }), null);
    assert.equal(block({ amount: 3, gold: 29 }), 'not_enough');
    assert.equal(block({ resource: 'gold' }), 'invalid_resource');
    assert.equal(block({ level: 0 }), 'not_built');
    assert.deepEqual([undefined, 0, 2.5, '3'].map((amount) => block({ amount })), ['invalid_amount', 'invalid_amount', 'invalid_amount', 'invalid_amount']);
    // At level 10 a piece costs 5 gold.
    assert.equal(fireTradeBlock({ level: 10, gold: 15, made: 0, resource: 'stone', amount: 3 }, content), null);
    assert.equal(fireTradeBlock({ level: 10, gold: 14, made: 0, resource: 'stone', amount: 3 }, content).code, 'not_enough');
  });

  test("the Stół rozbiórki's exchange: ten pieces of a resource for one of another at level 1, one fewer with each level, one for one at 10", () => {
    assert.equal(resourceExchange(0, content), null);
    assert.deepEqual(resourceExchange(1, content), { rate: 10, resources: ['wood', 'stone', 'iron-ore'] });
    assert.deepEqual([2, 5, 9, 10].map((level) => resourceExchange(level, content).rate), [9, 6, 2, 1]);
    const block = (changes) => exchangeBlock({ level: 1, resources: { wood: 50, stone: 0 }, from: 'wood', to: 'stone', amount: 5, ...changes }, content)?.code ?? null;
    assert.equal(block({}), null);
    assert.equal(block({ amount: 6 }), 'not_enough');
    assert.equal(block({ level: 2, amount: 5 }), null);
    assert.equal(block({ level: 10, amount: 50 }), null);
    assert.equal(block({ level: 10, amount: 51 }), 'not_enough');
    assert.equal(block({ from: 'stone', to: 'wood', amount: 1 }), 'not_enough');
    assert.equal(block({ to: 'wood' }), 'invalid_resource');
    assert.equal(block({ to: 'gold' }), 'invalid_resource');
    assert.equal(block({ from: undefined }), 'invalid_resource');
    assert.equal(block({ level: 0 }), 'not_built');
    assert.deepEqual([undefined, 0, -1, 2.5, '3'].map((amount) => block({ amount })), Array(5).fill('invalid_amount'));
    assert.equal(exchangeBlock({ level: 1, resources: { wood: 49 }, from: 'wood', to: 'iron-ore', amount: 5 }, content).message, 'Brakuje zasobów: Drewno (potrzeba 50).');
  });

  test("the Skup złomu's dealer: rarer parts and lower prices with each level", () => {
    const offer = (level) => shopOffer(level, content).map(({ partId, price }) => `${partId} ${price}`);
    assert.deepEqual(shopOffer(0, content), []);
    assert.deepEqual(offer(1), ['scraps 40']);
    assert.deepEqual(offer(2), ['scraps 38', 'straps 75']);
    assert.deepEqual(offer(5), ['scraps 31', 'straps 62', 'fittings 125', 'shards 250']);
    assert.deepEqual(offer(10), ['scraps 23', 'straps 46', 'fittings 92', 'shards 183', 'amber 367', 'bloodstone 733', 'star-shard 1467']);
    assert.deepEqual(['common', 'rare', 'unique', 'epic', 'legendary', 'mythic', 'divine'].map((rarity) => shopLevelFor(rarity, content)), [1, 2, 3, 5, 7, 9, 10]);
    const block = (changes) => shopBlock({ level: 2, gold: 750, partId: 'straps', count: 10, ...changes }, content)?.code ?? null;
    assert.equal(block({}), null);
    assert.equal(block({ gold: 749 }), 'not_enough');
    assert.equal(block({ partId: 'fittings' }), 'not_sold');
    assert.equal(block({ partId: 'constructor' }), 'invalid_part');
    assert.equal(block({ partId: { id: 'straps' } }), 'invalid_part');
    assert.equal(block({ count: 5 }), 'invalid_count');
    assert.equal(block({ level: 0 }), 'not_built');
  });

  // The design's rule that selling pays less than buying: an item sold
  // instead of taken apart never buys back the parts it would give, at any
  // level of the Skup złomu (it raises what the dealer pays too).
  test('parts bought cost more than the items they come from fetch when sold', () => {
    const bench = content.buildingsById['scrap-bench'];
    for (let level = 1; level <= bench.maxLevel; level++) {
      const bonus = campBonus({ 'scrap-bench': level }, 'sellPrice', content);
      for (const { partId, price } of shopOffer(level, content)) {
        const rarityId = content.partsById[partId].rarity;
        for (let itemLevel = 1; itemLevel <= 510; itemLevel++) {
          const item = { level: itemLevel, rarity: rarityId };
          const { count } = salvageYield(item, content);
          assert.ok(price * count > sellPrice(item, content, bonus), `${partId} at level ${level}, item level ${itemLevel}`);
        }
      }
    }
  });
});

describe('production', () => {
  const sawmill = content.buildingsById.sawmill;
  const hour = 3600000;

  test('a store holds two hours of production for each level and then stops', () => {
    const first = { level: 1, startedAt: 0, endsAt: 0, collectedAt: 0 };
    assert.deepEqual(production(sawmill, first, hour / 2), { resource: 'wood', perHour: 6, capacity: 12, amount: 3, since: 0, fullAt: 2 * hour });
    assert.equal(production(sawmill, first, 5 * hour).amount, 12);
    assert.equal(effectText(sawmill, 1), 'Wytwarza 6 drewna na godzinę, magazyn na 2\u00a0h produkcji');
    const top = { level: 10, startedAt: 0, endsAt: 0, collectedAt: 0 };
    const store = production(sawmill, top, 30 * hour);
    assert.deepEqual([store.perHour, store.capacity, store.amount, store.fullAt], [60, 1200, 1200, 20 * hour]);
    assert.equal(effectText(sawmill, 10), 'Wytwarza 60 drewna na godzinę, magazyn na 20\u00a0h produkcji');
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

  test('each level of upgrade adds 6% of every base number, rounded, and at least 1 to the damage or the armor', () => {
    assert.equal(upgradedItem(sword, content), sword);
    const plus5 = upgradedItem({ ...sword, upgrade: 5 }, content);
    assert.deepEqual(plus5.damage, { min: 39, max: 59 });
    assert.equal(plus5.affixes[0].value, 13);
    // 6% of 15 is less than 1 a level, so +10 gives 10.
    assert.equal(upgradedItem({ ...mail, upgrade: 10 }, content).armor, 25);
    // The card shows the upgraded numbers; the stored item keeps its own.
    assert.deepEqual(itemProperties({ ...mail, upgrade: 10 }, content), ['Pancerz: +25']);
    assert.equal(mail.armor, 15);
    // Small numbers grow too: a first-level sword gains on each level.
    const knife = { ...sword, level: 1, affixes: [], damage: { min: 2, max: 4 } };
    assert.deepEqual(upgradedItem({ ...knife, upgrade: 1 }, content).damage, { min: 3, max: 5 });
    // The author: a talisman's upgrade gives at least +1 Pancerz a level; its
    // Witalność +2 stays until 6% of it rounds up.
    const talisman = { base: 'talisman', slot: 'talisman', level: 1, rarity: 'common', affixes: [], implicit: { stat: 'vitality', value: 2 } };
    assert.deepEqual(itemProperties({ ...talisman, upgrade: 2 }, content), ['Witalność: +2', 'Pancerz: +2']);
    assert.equal(upgradedItem(talisman, content).armor, undefined);
  });

  test('worn upgraded items count with their upgraded numbers', () => {
    const character = { classId: 'warrior', classLevel: 1, level: 1, points: {} };
    const plain = computeStats(character, [mail, sword], content);
    const upgraded = computeStats(character, [{ ...mail, upgrade: 10 }, { ...sword, upgrade: 10 }], content);
    assert.equal(upgraded.bonuses.armor - plain.bonuses.armor, 10);
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

  test('the scrapper adds half the gold the upgrades cost, without the camp bonus on that half', () => {
    // A common level-1 Talizman sells for 1 gold, and +1 and +2 cost 2 gold each.
    const talisman = { base: 'talisman', slot: 'talisman', level: 1, rarity: 'common', affixes: [], implicit: { stat: 'vitality', value: 2 } };
    assert.equal(sellPrice(talisman, content), 1);
    assert.equal(sellPrice({ ...talisman, upgrade: 2 }, content), 3);
    // The Kolczuga's +1 and +2 cost 8 and 12 gold: 10 more, with a Skup złomu or without.
    assert.equal(sellPrice({ ...mail, upgrade: 2 }, content), sellPrice(mail, content) + 10);
    assert.equal(sellPrice({ ...mail, upgrade: 2 }, content, 1), sellPrice(mail, content, 1) + 10);
    // Never more than the upgrades cost, even with the best Skup złomu.
    for (let level = 1; level <= 10; level += 1) {
      let spent = 0;
      for (let target = 1; target <= level; target += 1) spent += itemUpgradeCost(sword, target, content).gold;
      assert.ok(sellPrice({ ...sword, upgrade: level }, content, 1) - sellPrice(sword, content, 1) < spent);
    }
  });

  test('the chance falls from 95% to 35% (340 A), and from +7 a failure may break the item', () => {
    assert.deepEqual([1, 2, 5, 7, 8, 9, 10].map((target) => upgradeChance(target, content)), [0.95, 0.9, 0.65, 0.5, 0.45, 0.4, 0.35]);
    assert.deepEqual([0, 6, 7, 9].map((level) => breakChance(level, content)), [0, 0, 0.1, 0.1]);
  });

  test('a roll succeeds, fails a level, or from +7 breaks the item', () => {
    assert.deepEqual(rollUpgrade({ ...mail, upgrade: 2 }, rolls(0.5), content), { result: 'success', upgrade: 3 });
    assert.deepEqual(rollUpgrade({ ...mail, upgrade: 2 }, rolls(0.99, 0), content), { result: 'failure', upgrade: 1 });
    // At +0 a failure costs only the payment.
    assert.deepEqual(rollUpgrade(mail, rolls(0.99, 0), content), { result: 'failure', upgrade: 0 });
    assert.deepEqual(rollUpgrade({ ...mail, upgrade: 7 }, rolls(0.99, 0.05), content), { result: 'broken', upgrade: 7 });
    assert.deepEqual(rollUpgrade({ ...mail, upgrade: 7 }, rolls(0.99, 0.5), content), { result: 'failure', upgrade: 6 });
    // On real random numbers: at +8, about 40% success and 6% broken.
    const rng = createRng('anvil');
    const counts = { success: 0, failure: 0, broken: 0 };
    for (let i = 0; i < 20000; i++) counts[rollUpgrade({ ...mail, upgrade: 8 }, rng, content).result]++;
    assert.ok(Math.abs(counts.success / 20000 - 0.4) < 0.02, JSON.stringify(counts));
    assert.ok(Math.abs(counts.broken / 20000 - 0.06) < 0.015, JSON.stringify(counts));
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

  test('materials of one rarity add up (481 B), taken first from the material held most, on a tie by its id', () => {
    const need = { rarity: 'unique', count: 2 };
    // One Futro rysia and one Skóra węgorza make the two pieces +6 asks for.
    assert.deepEqual(piecesOfRarity({ 'lynx-fur:unique': 1, 'eel-skin:unique': 1 }, need, content), { 'eel-skin:unique': 1, 'lynx-fur:unique': 1 });
    // The most plentiful first, so the single rarer pieces stay; other
    // rarities and keys the data does not know never count.
    const held = { 'lynx-fur:unique': 1, 'spider-silk:unique': 4, 'wolf-pelt:unique': 2, 'wolf-pelt:common': 50, 'bogus:unique': 9, 'eel-skin:epic': 9 };
    assert.deepEqual(stacksOfRarity(held, 'unique', content), [
      ['spider-silk:unique', 4],
      ['wolf-pelt:unique', 2],
      ['lynx-fur:unique', 1],
    ]);
    assert.equal(heldOfRarity(held, 'unique', content), 7);
    assert.deepEqual(piecesOfRarity(held, need, content), { 'spider-silk:unique': 2 });
    assert.deepEqual(piecesOfRarity(held, { rarity: 'unique', count: 6 }, content), { 'spider-silk:unique': 4, 'wolf-pelt:unique': 2 });
    assert.deepEqual(piecesOfRarity(held, { rarity: 'unique', count: 7 }, content), { 'spider-silk:unique': 4, 'wolf-pelt:unique': 2, 'lynx-fur:unique': 1 });
    // Too few in all: nothing is taken.
    assert.equal(piecesOfRarity(held, { rarity: 'unique', count: 8 }, content), null);
    assert.equal(piecesOfRarity({}, need, content), null);
    assert.equal(piecesOfRarity({ 'lynx-fur:unique': 1, 'eel-skin:rare': 5 }, need, content), null);
    // Equal stacks go by the material's id.
    assert.deepEqual(piecesOfRarity({ 'spider-silk:unique': 2, 'eel-skin:unique': 2, 'lynx-fur:unique': 2 }, { rarity: 'unique', count: 3 }, content), {
      'eel-skin:unique': 2,
      'lynx-fur:unique': 1,
    });
    // The page's view: all held, and the pieces with their names, or null.
    assert.deepEqual(rarityNeedView({ 'lynx-fur:unique': 1, 'eel-skin:unique': 1 }, need, content), {
      rarity: 'unique',
      count: 2,
      have: 2,
      takes: [
        { key: 'eel-skin:unique', materialId: 'eel-skin', label: 'skóra węgorza', count: 1 },
        { key: 'lynx-fur:unique', materialId: 'lynx-fur', label: 'futro rysia', count: 1 },
      ],
    });
    assert.deepEqual(rarityNeedView({ 'wolf-pelt:unique': 1 }, need, content), { rarity: 'unique', count: 2, have: 1, takes: null });
  });

  test('from +5 on the card shows the materials an upgrade takes, from all those of the item\'s rarity', () => {
    const stock = { 'wolf-pelt:common': 1, 'fox-pelt:common': 1, 'wolf-pelt:rare': 9 };
    assert.equal(upgradeView({ ...mail, upgrade: 3 }, 10, content, stock).next.materials, null);
    assert.deepEqual(upgradeView({ ...mail, upgrade: 4 }, 10, content).next.materials, { rarity: 'common', count: 1 });
    assert.deepEqual(upgradeView({ ...mail, upgrade: 5 }, 10, content, stock).next.materials, {
      rarity: 'common',
      count: 2,
      have: 2,
      takes: [
        { key: 'fox-pelt:common', materialId: 'fox-pelt', label: 'skóra lisa', count: 1 },
        { key: 'wolf-pelt:common', materialId: 'wolf-pelt', label: 'skóra wilka', count: 1 },
      ],
    });
    assert.deepEqual(upgradeView({ ...mail, upgrade: 6 }, 10, content, stock).next.materials, { rarity: 'common', count: 3, have: 2, takes: null });
    assert.equal(upgradeMaterials({ ...mail, upgrade: 9 }, 10, content).count, 6);
  });

  test('a full bag sells upgraded items last', () => {
    const plain = { ...mail, id: 1, rarity: 'rare' };
    const upgraded = { ...mail, id: 2, upgrade: 3 };
    assert.deepEqual(bagOverflow([upgraded, plain], 1, 'warrior', content), [1]);
  });
});


describe('champions', () => {
  const geared = (classId, level) => typicalCharacter(classId, level, content);
  // The same game in which every fight of a champion's inner region meets the champion.
  const always = (rewards = {}) => ({
    ...content,
    balance: {
      ...content.balance,
      hunt: { ...content.balance.hunt, championChancePerFight: 100 },
      rewards: { ...content.balance.rewards, ...rewards },
    },
  });

  test('the champion lives in the last inner region, two levels above it, and is listed last', () => {
    const thicket = content.areasById['boar-thicket'];
    assert.deepEqual(championEncounter(thicket, content), { elite: false, champion: true, members: [{ monsterId: 'tusker', level: 27 }] });
    const dangers = areaDangers(thicket, content);
    assert.deepEqual(dangers.at(-1), { monsterId: 'tusker', minLevel: 27, maxLevel: 27, elite: false, champion: true });
    assert.deepEqual(dangers.find((danger) => danger.elite), { monsterId: 'planetnik', minLevel: 26, maxLevel: 26, elite: true, champion: false });
    assert.ok(!areaDangers(content.areasById['viper-heaps'], content).some((danger) => danger.champion));
    // The rarest meeting of all: less often than the elite.
    const pace = explorationPace(60, content);
    const longer = Object.fromEntries(content.balance.hunt.rareLengthFactorByMinutes)[60];
    assert.equal(pace.championChance, content.balance.hunt.championChancePerFight * pace.timeFactor * longer);
    assert.ok(pace.championChance < pace.eliteChance);
  });

  test('a beaten champion pays five times the XP and gold, leaves its material almost always and sometimes an epic item', () => {
    const tusker = content.monstersById.tusker;
    assert.equal(monsterXp(tusker, 27, content), monsterXp({ ...tusker, champion: false }, 27, content) * 5);
    // One piece at most, whatever share of the time the fight stands for.
    const rng = createRng('kły');
    let pieces = 0;
    for (let i = 0; i < 2000; i++) {
      const found = Object.values(materialDrops('tusker', 27, 4, rng, content)).reduce((sum, count) => sum + count, 0);
      assert.ok(found <= 1);
      pieces += found;
    }
    assert.ok(Math.abs(pieces / 2000 - 0.9) < 0.03, pieces);
    // Every fight in Dzicza Głusza is the champion here; a strong character beats it.
    const game = always({ championItemChance: 1 });
    const hero = geared('warrior', 45);
    const hunt = simulateHunt({ ...hero, hp: 99999, name: 'Mira', areaId: 'boar-thicket', minutes: 60, seed: 'odyniec' }, game);
    assert.ok(hunt.fights.length > 0 && hunt.fights.every((fight) => fight.champion && fight.won === true));
    for (const fight of hunt.fights) {
      assert.deepEqual(fight.enemies.map((enemy) => [enemy.monsterId, enemy.level]), [['tusker', 27]]);
      assert.equal(fight.chests.length, 1);
      assert.equal(hunt.items[fight.chests[0]].rarity, 'epic');
      for (const key of Object.keys(fight.materials)) assert.ok(key.startsWith('tusker-tusks:'), key);
    }
    assert.ok(hunt.entries.some((entry) => /czempion/i.test(entry.text)));
    // The report marks the champion's fights for their chip.
    const report = huntReport(
      { hunt, applied: { penalty: 0, level: 45, classLevel: 45, messages: [] }, character: hero.character, areaId: 'boar-thicket', startedAt: 0, endsAt: 1 },
      game,
    );
    assert.ok(report.fights.every((fight) => fight.champion === true && fight.elite === false));
  });

  test('higher champions bring rarer items', () => {
    const rng = createRng('skrzynie');
    const rarities = (level) => new Set(Array.from({ length: 400 }, () => championItemRarity(level, rng, content)));
    assert.deepEqual([...rarities(27)], ['epic']);
    assert.deepEqual([...rarities(52)].sort(), ['epic', 'legendary']);
    assert.deepEqual([...rarities(450)].sort(), ['divine', 'mythic']);
  });

  test('losing to the champion of a safe region is a retreat, elsewhere a faint', () => {
    const game = always();
    const weak = geared('mage', 12);
    const windfalls = simulateHunt({ ...weak, hp: 99999, name: 'Mira', areaId: 'boar-thicket', minutes: 30, seed: 'ucieczka' }, game);
    assert.equal(windfalls.result, 'escaped');
    const glade = simulateHunt({ ...weak, hp: 99999, name: 'Mira', areaId: 'glade-heart', minutes: 30, seed: 'omdlenie' }, game);
    assert.equal(glade.result, 'fainted');
    assert.deepEqual(glade.fights[0].enemies.map((enemy) => enemy.monsterId), ['basilisk']);
  });

  test('the threat estimate counts the champion: a retreat in a safe region, fainting elsewhere', () => {
    const weak = geared('mage', 24);
    const input = { ...weak, hp: 99999, areaId: 'boar-thicket' };
    const usual = faintChances(input, content);
    const met = faintChances(input, always());
    // In Wiatrołomy a lost champion fight ends the exploration without fainting.
    assert.ok(met[60] <= usual[60] + 1e-9, `${met[60]} vs ${usual[60]}`);
    const glade = { ...geared('mage', 49), hp: 99999, areaId: 'glade-heart' };
    assert.ok(faintChances(glade, always())[60] > faintChances(glade, content)[60]);
  });

  test('an exploration that avoids them meets neither the elite nor the champion, and its threat counts neither', () => {
    // Every fight would meet the champion or the elite here.
    const game = always();
    game.balance.hunt = { ...game.balance.hunt, eliteChancePerFight: 100 };
    const hero = geared('warrior', 49);
    for (const areaId of ['boar-thicket', 'glade-heart', 'mossy-boulders']) {
      const meets = simulateHunt({ ...hero, hp: 99999, name: 'Mira', areaId, minutes: 60, seed: `unik:${areaId}` }, game);
      assert.ok(meets.fights.every((fight) => fight.elite || fight.champion), areaId);
      const avoids = simulateHunt({ ...hero, hp: 99999, name: 'Mira', areaId, minutes: 60, seed: `unik:${areaId}`, avoidRare: true }, game);
      assert.ok(avoids.fights.length > 0 && avoids.fights.every((fight) => !fight.elite && !fight.champion), areaId);
    }
    // Without them, fainting in Serce Uroczyska is as likely as with neither
    // in the game at all.
    const glade = { ...geared('mage', 49), hp: 99999, areaId: 'glade-heart' };
    const none = {
      ...content,
      balance: { ...content.balance, hunt: { ...content.balance.hunt, eliteChancePerFight: 0, championChancePerFight: 0 } },
    };
    const avoided = faintChances({ ...glade, avoidRare: true }, game);
    const without = faintChances(glade, none);
    for (const minutes of [15, 60]) assert.ok(Math.abs(avoided[minutes] - without[minutes]) < 1e-9, `${minutes}: ${avoided[minutes]} vs ${without[minutes]}`);
    assert.ok(avoided[60] < faintChances(glade, game)[60]);
  });

  test('avoiding them never shows a higher threat, even where a retreat before them would end the exploration early', () => {
    // In the safe Dzicza Głusza every fight would be the champion's: without
    // the box the first lost one is a retreat, with it the regular fights go on.
    const game = always();
    const hero = { ...geared('archer', 18), hp: 99999, areaId: 'boar-thicket' };
    const threat = estimateThreat(hero, game);
    const avoiding = estimateThreat({ ...hero, avoidRare: true }, game);
    assert.ok(THREAT_LEVELS.indexOf(avoiding[60]) > THREAT_LEVELS.indexOf(threat[60]), `${avoiding[60]} vs ${threat[60]}`);
    const shown = lowerThreat(avoiding, threat);
    for (const minutes of Object.keys(threat)) {
      assert.ok(THREAT_LEVELS.indexOf(shown[minutes]) <= THREAT_LEVELS.indexOf(threat[minutes]), minutes);
      assert.ok(THREAT_LEVELS.indexOf(shown[minutes]) <= THREAT_LEVELS.indexOf(avoiding[minutes]), minutes);
    }
    assert.deepEqual(lowerThreat({ 15: 'high', 60: 'low' }, { 15: 'moderate', 60: 'very-high' }), { 15: 'moderate', 60: 'low' });
  });

  test('an exploration that seeks them meets the elite and the champion twice as often, and its threat counts them so', () => {
    const pace = explorationPace(240, content);
    const sought = withRareOdds(pace, { seekRare: true }, content);
    assert.equal(sought.eliteChance, pace.eliteChance * 2);
    assert.equal(sought.championChance, pace.championChance * 2);
    assert.deepEqual(withRareOdds(pace, { avoidRare: true }, content), { ...pace, eliteChance: 0, championChance: 0 });
    assert.equal(withRareOdds(pace, {}, content), pace);
    // Over many explorations of Serce Uroczyska, about twice as large a share
    // of fights with the elite or the champion (a lost one ends the
    // exploration, so the share, not the count).
    const hero = geared('warrior', 49);
    const rareShare = (seekRare) => {
      let rare = 0;
      let all = 0;
      for (let i = 0; i < 2000; i++) {
        const hunt = simulateHunt({ ...hero, hp: 99999, name: 'Mira', areaId: 'glade-heart', minutes: 240, seed: `trop:${i}`, seekRare }, content);
        rare += hunt.fights.filter((fight) => fight.elite || fight.champion).length;
        all += hunt.fights.length;
      }
      return rare / all;
    };
    const plain = rareShare(false);
    const seeking = rareShare(true);
    assert.ok(seeking > plain * 1.7 && seeking < plain * 2.3, `${seeking} vs ${plain}`);
    // Outside a safe region more of them make fainting more likely.
    const glade = { ...geared('mage', 49), hp: 99999, areaId: 'glade-heart' };
    assert.ok(faintChances({ ...glade, seekRare: true }, content)[240] > faintChances(glade, content)[240]);
    assert.deepEqual(higherThreat({ 15: 'high', 60: 'low' }, { 15: 'moderate', 60: 'very-high' }), { 15: 'high', 60: 'very-high' });
  });

  test('in a place too easy for the character, the elite and the champion it has not met come far more often, until met', () => {
    // Dzicza Głusza (21–25): the Płanetnik and the Odyniec.
    const area = content.areasById['boar-thicket'];
    assert.deepEqual([easyPlace(28, area, content), easyPlace(29, area, content)], [false, true]);
    assert.equal(rareCatchUp(28, area, [], content), null);
    assert.deepEqual(rareCatchUp(29, area, [], content), { elite: true, champion: true });
    assert.deepEqual(rareCatchUp(29, area, ['tusker'], content), { elite: true, champion: false });
    assert.equal(rareCatchUp(29, area, ['planetnik', 'tusker'], content), null);
    assert.equal(rareCatchUp(29, area, null, content), null);
    const pace = explorationPace(30, content);
    const caught = withRareOdds(pace, { catchUp: { elite: true, champion: false } }, content);
    assert.equal(caught.eliteChance, content.balance.hunt.rareCatchUpChance);
    assert.equal(caught.championChance, pace.championChance);
    assert.deepEqual(withRareOdds(pace, { avoidRare: true, catchUp: { elite: true, champion: true } }, content), { ...pace, eliteChance: 0, championChance: 0 });
    // A warrior of level 20 in Skraj Wiatrołomów (1–5) that has not met its
    // Błędnica meets it on almost every exploration, once; one that has
    // met it, avoids the elites or whose met creatures are not known,
    // seldom or never.
    const hero = geared('warrior', 20);
    const elites = (options) => {
      const counts = [];
      for (let i = 0; i < 200; i++) {
        const hunt = simulateHunt({ ...hero, hp: 99999, name: 'Mira', areaId: 'windfalls-edge', minutes: 30, seed: `blednica:${i}`, ...options }, content);
        counts.push(hunt.fights.filter((fight) => fight.elite).length);
      }
      return { some: counts.filter((count) => count > 0).length, more: counts.filter((count) => count > 1).length };
    };
    const unmet = elites({ met: [] });
    assert.ok(unmet.some > 160 && unmet.more < 10, JSON.stringify(unmet));
    for (const options of [{ met: ['wisp'] }, { met: [], avoidRare: true }, {}]) {
      assert.ok(elites(options).some < 20, JSON.stringify(options));
    }
    // In its own place the odds are as usual.
    assert.equal(rareCatchUp(20, content.areasById['viper-heaps'], [], content), null);
  });
});

describe('materials and chests', () => {
  const geared = (classId, level) => typicalCharacter(classId, level, content);

  test('beaten creatures leave their own material, and items come only in chests', () => {
    const character = geared('warrior', 13);
    for (let i = 0; i < 20; i++) {
      const hunt = simulateHunt({ ...character, hp: 99999, name: 'Mira', areaId: 'raven-hollows', minutes: 60, seed: `materiały:${i}` }, content);
      const fromChests = new Set([
        ...hunt.entries.filter((entry) => entry.type === 'find' && entry.item !== undefined).map((entry) => entry.item),
        ...hunt.fights.flatMap((fight) => fight.chests),
      ]);
      assert.equal(fromChests.size, hunt.items.length);
      for (const fight of hunt.fights) {
        const monsters = new Set(fight.enemies.map((enemy) => enemy.monsterId));
        for (const key of Object.keys(fight.materials)) {
          assert.ok(monsters.has(content.materialsById[key.split(':')[0]].monster), `${key} from ${[...monsters]}`);
        }
      }
    }
  });

  test('the commonest material comes about 30% of the time, rarer ones less often', () => {
    const rng = createRng('łup');
    const average = (monsterId) => {
      let total = 0;
      for (let i = 0; i < 20000; i++) total += Object.values(materialDrops(monsterId, 1, 1, rng, content)).reduce((sum, count) => sum + count, 0);
      return total / 20000;
    };
    assert.ok(Math.abs(average('wolf') - 0.3) < 0.015);
    assert.ok(Math.abs(average('boar') - 0.2) < 0.015);
    assert.ok(Math.abs(average('likho') - 0.05) < 0.01);
    // A fight that stands for four of the reference length leaves more.
    const long = Object.values(materialDrops('wolf', 1, 4, createRng('długo'), content)).reduce((sum, count) => sum + count, 0);
    assert.ok(long === 1 || long === 2, `${long}`);
  });

  test('a material is sometimes a rarity higher, much more rarely two, and higher grades open with the levels', () => {
    const near = (actual, expected) => actual.length === expected.length && actual.every((chance, i) => Math.abs(chance - expected[i]) < 1e-12);
    // At low levels the second grade comes sometimes and the third ten
    // times more rarely; every 25 levels one more grade opens.
    assert.ok(near(rarityUpChances(1, content), [0.05, 0.005]), `${rarityUpChances(1, content)}`);
    assert.ok(near(rarityUpChances(25, content), [0.125, 0.0125]));
    assert.ok(near(rarityUpChances(30, content), [0.15, 0.015, 0.0015]));
    assert.ok(near(rarityUpChances(80, content), [0.25, 0.025, 0.0025, 0.00025, 0.000025]));
    const drops = (level, fights) => {
      const rng = createRng(`rzadkość:${level}`);
      const seen = {};
      for (let i = 0; i < fights; i++) {
        for (const [key, count] of Object.entries(materialDrops('wolf', level, 1, rng, content))) seen[key] = (seen[key] ?? 0) + count;
      }
      return seen;
    };
    const low = drops(3, 40000);
    assert.deepEqual(Object.keys(low).sort(), ['wolf-pelt:common', 'wolf-pelt:rare', 'wolf-pelt:unique']);
    const total = Object.values(low).reduce((sum, count) => sum + count, 0);
    assert.ok(Math.abs(low['wolf-pelt:rare'] / total - 0.045) < 0.01, `${low['wolf-pelt:rare'] / total}`);
    assert.ok(Math.abs(low['wolf-pelt:unique'] / total - 0.005) < 0.003, `${low['wolf-pelt:unique'] / total}`);
    // However many grades open, a material stays within the last rarity.
    assert.ok(Object.keys(drops(500, 2000)).every((key) => content.raritiesById[key.split(':')[1]]));
  });

  test('names say the rarity only when it is above the species', () => {
    assert.equal(materialView('wolf-pelt:common', 1, content).label, 'skóra wilka');
    assert.equal(materialView('wolf-pelt:rare', 1, content).label, 'rzadka skóra wilka');
    assert.equal(materialView('badger-claws:rare', 1, content).part, 'Rzemienie');
    assert.equal(materialsText({ 'wolf-pelt:common': 2, 'crow-feather:unique': 1, 'boar-tusk:unique': 1 }, content), 'skóra wilka ×2, unikalne pióro kruka, unikalny kieł dzika');
  });

  test('treasure chests are a rare find: about three in four hours, and two on a half-hour trip are luck', () => {
    const character = geared('warrior', 8);
    let items = 0;
    for (let i = 0; i < 200; i++) {
      items += simulateHunt({ ...character, hp: 99999, name: 'Mira', areaId: 'fox-ravines', minutes: 60, seed: `skrzynie:${i}` }, content).items.length;
    }
    assert.ok(items / 200 > 0.55 && items / 200 < 1, `${items / 200} an hour`);
    const five = geared('archer', 5);
    const trips = Array.from({ length: 600 }, (_, i) => simulateHunt({ ...five, hp: 99999, name: 'Mira', areaId: 'windfalls-edge', minutes: 30, seed: `pół:${i}` }, content));
    const lucky = trips.filter((hunt) => hunt.items.length >= 2).length / trips.length;
    assert.ok(lucky > 0 && lucky < 0.06, `${lucky} of half-hour trips bring two chests`);
  });

  test("a character's very first exploration goes one way: one plain weapon of its class and nothing else to wear", () => {
    for (const classId of ['warrior', 'archer', 'mage', 'cleric', 'shadow']) {
      for (let i = 0; i < 40; i++) {
        const hunt = simulateHunt({ character: newCharacter(classId), equipped: [], name: 'Mira', areaId: 'windfalls-edge', minutes: 30, seed: `pierwsza:${classId}:${i}`, first: true }, content);
        assert.equal(hunt.result, 'success');
        assert.equal(hunt.items.length, 1, `${classId} ${i}`);
        const [weapon] = hunt.items;
        assert.equal(weapon.slot, 'weapon');
        assert.equal(weapon.rarity, 'common');
        assert.ok(content.classesById[classId].weapons.includes(weapon.base));
        assert.ok(hunt.fights.every((fight) => !fight.tough && !fight.elite));
      }
    }
  });

  test('a beaten elite leaves a chest', () => {
    const elite = { ...content, balance: { ...content.balance, hunt: { ...content.balance.hunt, eliteChancePerFight: 100 } } };
    const hunt = simulateHunt({ ...geared('warrior', 23), hp: 99999, name: 'Mira', areaId: 'windfalls-edge', minutes: 15, seed: 'elita' }, elite);
    const won = hunt.fights.filter((fight) => fight.won === true);
    assert.ok(won.length > 0 && won.every((fight) => fight.elite && fight.chests.length === 1));
    assert.ok(hunt.entries.filter((entry) => entry.type === 'fight').every((entry) => /stoi skrzynia/.test(entry.text)));
  });

  test('the report lists the materials of each fight and of the whole exploration', () => {
    const character = geared('archer', 13);
    const hunt = simulateHunt({ ...character, hp: 99999, name: 'Mira', areaId: 'raven-hollows', minutes: 240, seed: 'raport' }, content);
    const report = huntReport(
      { hunt, applied: applyHunt(character.character, hunt, content), character: character.character, areaId: 'raven-hollows', startedAt: 0, endsAt: 1 },
      content,
    );
    const total = (list) => list.reduce((sum, material) => sum + material.count, 0);
    assert.equal(total(report.summary.materials), Object.values(hunt.materials).reduce((sum, count) => sum + count, 0));
    assert.equal(total(report.fights.flatMap((fight) => fight.materials)), total(report.summary.materials));
    assert.ok(total(report.summary.materials) > 0);
  });
});

describe('Stół rozbiórki', () => {
  const MINUTE = 60000;
  const empty = { materials: {}, parts: {}, queue: [] };
  // A table that takes every rarity, at pace 1 and without extra parts.
  const plain = { level: 5, pace: 1, maxRarity: content.rarities.length - 1, bonusChance: 0 };
  const rng = () => createRng('stół');

  test('without the table nothing is made, and each level makes it faster', () => {
    assert.equal(craftPace({}, content), 0);
    assert.ok(Math.abs(craftPace({ 'craft-table': 1 }, content) - 1.1) < 1e-9);
    assert.ok(Math.abs(craftPace({ 'craft-table': 10 }, content) - 2) < 1e-9);
    assert.equal(craftMinutes('common', 3, 1, content), 15);
    assert.equal(craftMinutes('common', 3, 2, content), 8);
  });

  test('levels 1 to 5 open the rarities, the levels after add extra parts', () => {
    const rarity = (level) => content.rarities[craftTable({ 'craft-table': level }, content).maxRarity].id;
    assert.deepEqual([1, 2, 3, 4, 5, 6, 10].map(rarity), ['rare', 'unique', 'epic', 'legendary', 'divine', 'divine', 'divine']);
    assert.deepEqual(['common', 'rare', 'unique', 'epic', 'legendary', 'mythic', 'divine'].map((id) => craftLevelFor(id, content)), [1, 1, 2, 3, 4, 5, 5]);
    const chance = (level) => Math.round(craftTable({ 'craft-table': level }, content).bonusChance * 100);
    assert.deepEqual([1, 5, 6, 8, 10].map(chance), [0, 0, 5, 15, 25]);
    assert.deepEqual(craftTable({}, content), { level: 0, pace: 0, maxRarity: -1, bonusChance: 0 });
  });

  test('a stack of a rarity the table does not take yet stays, the others go', () => {
    const table = craftTable({ 'craft-table': 1 }, content);
    const state = { ...empty, materials: { 'wolf-pelt:common': 2, 'lynx-fur:unique': 1, 'boar-tusk:rare': 1 } };
    const { state: next, ordered, tooRare } = orderMaterials(state, Object.keys(state.materials), table, 0, rng(), content);
    assert.deepEqual([ordered, tooRare], [2, 1]);
    assert.deepEqual(next.materials, { 'lynx-fur:unique': 1 });
  });

  test('from level 6 an order may bring extra parts, decided when it starts', () => {
    const table = craftTable({ 'craft-table': 10 }, content);
    let extra = 0;
    let made = 0;
    for (let i = 0; i < 200; i++) {
      const { state } = orderMaterials({ ...empty, materials: { 'wolf-pelt:common': 4 } }, ['wolf-pelt:common'], table, 0, createRng(`premia-${i}`), content);
      const [order] = state.queue;
      assert.equal(order.parts, 4);
      extra += order.bonus;
      made += settleCrafting(state, order.endsAt).parts.scraps;
    }
    // A quarter of a part for each of the 4: about 1 extra part an order.
    assert.ok(extra > 160 && extra < 240, `extra parts: ${extra}`);
    assert.equal(made, 200 * 4 + extra);
    const { state } = orderMaterials({ ...empty, materials: { 'wolf-pelt:common': 4 } }, ['wolf-pelt:common'], craftTable({ 'craft-table': 5 }, content), 0, rng(), content);
    assert.equal(state.queue[0].bonus, 0);
  });

  test('materials become parts of their rarity, one order after another, for free', () => {
    const state = { ...empty, materials: { 'wolf-pelt:common': 3, 'boar-tusk:rare': 1 } };
    const { state: next, ordered } = orderMaterials(state, ['wolf-pelt:common', 'boar-tusk:rare', 'fox-pelt:common'], plain, 0, rng(), content);
    assert.equal(ordered, 2);
    assert.deepEqual(next.materials, {});
    assert.deepEqual(next.queue.map((order) => [order.startsAt / MINUTE, order.endsAt / MINUTE, order.partId, order.parts]), [
      [0, 15, 'scraps', 3],
      [15, 23, 'straps', 1],
    ]);
    assert.deepEqual(settleCrafting(next, 14 * MINUTE).parts, {});
    assert.deepEqual(settleCrafting(next, 15 * MINUTE).parts, { scraps: 3 });
    const later = settleCrafting(next, 23 * MINUTE);
    assert.deepEqual([later.parts, later.queue.length, later.done.length], [{ scraps: 3, straps: 1 }, 0, 2]);
  });

  test('a new order waits for the last one, and the queue has a limit', () => {
    const materials = Object.fromEntries(content.materials.map((material) => [`${material.id}:${material.rarity}`, 1]));
    const { state, ordered } = orderMaterials({ ...empty, materials }, Object.keys(materials), plain, 0, rng(), content);
    assert.equal(ordered, content.balance.crafting.queueLimit);
    assert.equal(Object.keys(state.materials).length, content.materials.length - ordered);
    for (let i = 1; i < state.queue.length; i++) assert.equal(state.queue[i].startsAt, state.queue[i - 1].endsAt);
  });

  test('several items taken apart at once: one order for each kind of part, its parts and minutes added up ("Rozbierz kilka")', () => {
    const items = [
      { rarity: 'rare', level: 25 },
      { rarity: 'common', level: 3 },
      { rarity: 'rare', level: 5, upgrade: 1 },
    ];
    const entries = items.map((item, index) => ({ item, name: `Przedmiot ${index}` }));
    const state = orderSalvageMany(empty, entries, plain, 10 * MINUTE, rng(), content);
    // 4 Rzemienie (32 minutes) and 3 (24); 2 Ścinki (10 minutes) after them.
    assert.deepEqual(
      state.queue.map((order) => [order.kind, order.name, order.count, order.rarity, order.partId, order.parts, order.startsAt / MINUTE, order.endsAt / MINUTE]),
      [
        ['item', undefined, 2, 'rare', 'straps', 7, 10, 66],
        ['item', 'Przedmiot 1', undefined, 'common', 'scraps', 2, 66, 76],
      ],
    );
    assert.deepEqual(settleCrafting(state, 76 * MINUTE).parts, { straps: 7, scraps: 2 });
  });

  test('taking an item apart gives more parts for a higher level and each upgrade', () => {
    assert.deepEqual(salvageYield({ rarity: 'common', level: 3 }, content), { partId: 'scraps', count: 2 });
    assert.deepEqual(salvageYield({ rarity: 'rare', level: 25, upgrade: 2 }, content), { partId: 'straps', count: 6 });
    const item = generateItem({ baseId: 'sword', level: 12, rarityId: 'epic' }, createRng('rozbiórka'), content);
    const state = orderSalvage(empty, item, itemName(item, content), { ...plain, pace: 2 }, 10 * MINUTE, rng(), content);
    assert.deepEqual(state.queue.map((order) => [order.kind, order.partId, order.parts, order.startsAt / MINUTE, order.endsAt / MINUTE]), [
      ['item', 'shards', 3, 10, 40],
    ]);
    assert.deepEqual(settleCrafting(state, 40 * MINUTE).parts, { shards: 3 });
  });
});

describe('Bestiariusz', () => {
  test('an inner region lists its creatures with the levels they come at, the elite last', () => {
    const edge = areaDangers(content.areasById['windfalls-edge'], content);
    assert.deepEqual(
      edge.map(({ monsterId, minLevel, maxLevel, elite }) => [monsterId, minLevel, maxLevel, elite]),
      [
        ['wolf', 1, 5, false],
        ['badger', 1, 5, false],
        ['squirrel', 1, 5, false],
        ['grass-snake', 1, 5, false],
        ['wisp', 6, 6, true],
      ],
    );
    // A demanding encounter brings its creatures some levels above the place.
    const hollows = areaDangers(content.areasById['raven-hollows'], content);
    const crow = hollows.find((danger) => danger.monsterId === 'crow');
    assert.deepEqual([crow.minLevel, crow.maxLevel], [11, 15 + content.balance.hunt.toughLevelBonus]);
  });

  test('every inner region has at least two creatures of its own (the author: "niech się różnią")', () => {
    for (const region of content.regions) {
      const homes = new Map();
      for (const area of region.areas) {
        for (const danger of areaDangers(area, content)) homes.set(danger.monsterId, [...(homes.get(danger.monsterId) ?? []), area.id]);
      }
      for (const area of region.areas) {
        const own = areaDangers(area, content).filter((danger) => homes.get(danger.monsterId).length === 1);
        assert.ok(own.length >= 2, `${area.id}: ${own.map((danger) => danger.monsterId)}`);
      }
    }
  });

  test('it shows the chance of meeting each creature in a fight of a standard exploration', () => {
    const pace = explorationPace(content.balance.bestiary.chanceMinutes, content);
    // Skraj Wiatrołomów: wolves in 46 of the 104 weight, badgers in 29,
    // squirrels in 23 and grass snakes in 20, the elite before them, nothing
    // demanding.
    const edge = meetingChances(content.areasById['windfalls-edge'], content);
    const usual = 1 - pace.eliteChance;
    assert.deepEqual([...edge.keys()], ['wolf', 'badger', 'squirrel', 'grass-snake', 'wisp']);
    assert.ok(Math.abs(edge.get('wolf') - (usual * 46) / 104) < 1e-9);
    assert.ok(Math.abs(edge.get('badger') - (usual * 29) / 104) < 1e-9);
    assert.ok(Math.abs(edge.get('squirrel') - (usual * 23) / 104) < 1e-9);
    assert.ok(Math.abs(edge.get('grass-snake') - (usual * 20) / 104) < 1e-9);
    assert.ok(Math.abs(edge.get('wisp') - pace.eliteChance) < 1e-9);
    // As often as the draws of an exploration bring them, the champion and
    // the demanding encounters too.
    for (const id of ['boar-thicket', 'raven-hollows']) {
      const area = content.areasById[id];
      const chances = meetingChances(area, content);
      const rng = createRng(`szanse-${id}`);
      const seen = new Map();
      const rolls = 40000;
      for (let i = 0; i < rolls; i++) {
        for (const monsterId of new Set(rollEncounter(area, rng, content, area.maxLevel, pace).members.map((member) => member.monsterId))) seen.set(monsterId, (seen.get(monsterId) ?? 0) + 1);
      }
      assert.deepEqual([...seen.keys()].sort(), [...chances.keys()].sort());
      for (const [monsterId, chance] of chances) assert.ok(Math.abs(seen.get(monsterId) / rolls - chance) < 0.01, `${id}: ${monsterId}`);
    }
    // Every creature on a list has its chance.
    for (const area of content.areas) {
      const chances = meetingChances(area, content);
      for (const danger of areaDangers(area, content)) assert.ok(chances.get(danger.monsterId) > 0 && chances.get(danger.monsterId) <= 1, `${area.id}: ${danger.monsterId}`);
    }
  });

  test('a whole land lists all creatures of its inner regions, the elites and the champion last', () => {
    const windfalls = regionDangers(content.regionsById.windfalls, content);
    assert.deepEqual(windfalls.map((danger) => danger.monsterId), [
      'wolf', 'badger', 'squirrel', 'grass-snake', 'fox', 'marten', 'raccoon-dog', 'antlion', 'crow', 'owl', 'capercaillie', 'weasel',
      'viper', 'hornets', 'stag-beetle', 'snake-hawk', 'boar', 'stag', 'wildcat', 'black-stork', 'wisp', 'planetnik', 'tusker',
    ]);
    // The elite of three inner regions, at the levels of all three.
    const wisp = windfalls.find((danger) => danger.monsterId === 'wisp');
    assert.deepEqual([wisp.minLevel, wisp.maxLevel, wisp.elite], [6, 16, true]);
    const all = windfalls.map((danger) => danger.monsterId);
    assert.equal(landBestiaryFull(content.regionsById.windfalls, all.slice(1), content), false);
    assert.equal(landBestiaryFull(content.regionsById.windfalls, all, content), true);
  });

  test("a land's chest holds a quarter more than its last inner region's", () => {
    // Dzicza Głusza: 245 gold, 45 Punktów Czasu and 20 Punktów Systemu.
    assert.deepEqual(landBestiaryChest(content.regionsById.windfalls, content), { gold: 305, timePoints: 56, systemPoints: 25 });
    // Serce Uroczyska: 600, 95 and 20.
    assert.deepEqual(landBestiaryChest(content.regionsById['stone-glade'], content), { gold: 750, timePoints: 119, systemPoints: 25 });
  });

  test('its chest holds gold growing along a curve, Punkty Czasu growing by 10 a region and 20 Punkty Systemu', () => {
    const chest = (id) => bestiaryChest(content.areasById[id], content);
    // The author: +30 gold and +5 Punkty Czasu for the first inner region.
    assert.deepEqual(chest('windfalls-edge'), { gold: 30, timePoints: 5, systemPoints: 20 });
    assert.deepEqual(chest('fox-ravines'), { gold: 75, timePoints: 15, systemPoints: 20 });
    assert.deepEqual(chest('boar-thicket'), { gold: 245, timePoints: 45, systemPoints: 20 });
    assert.deepEqual(chest('glade-heart'), { gold: 600, timePoints: 95, systemPoints: 20 });
    // Each next inner region gives more of both.
    const areas = Object.values(content.areasById).sort((a, b) => a.maxLevel - b.maxLevel).map((area) => bestiaryChest(area, content));
    for (const [before, after] of areas.slice(1).map((next, index) => [areas[index], next])) {
      assert.ok(after.gold > before.gold && after.timePoints > before.timePoints);
    }
  });

  test('it is full once every creature on the list is met, the elite too', () => {
    const edge = content.areasById['windfalls-edge'];
    assert.equal(bestiaryFull(edge, ['wolf', 'badger', 'wisp'], content), false);
    assert.equal(bestiaryFull(edge, ['wolf', 'badger', 'squirrel', 'grass-snake', 'wisp', 'boar'], content), true);
  });

  test('a chest opened before new creatures joined its list opens again', () => {
    assert.equal(openedChestEntry('windfalls-edge', content), 'windfalls-edge:5');
    assert.equal(openedChestEntry('windfalls', content), `windfalls:${regionDangers(content.regionsById.windfalls, content).length}`);
    // Kept by id alone: opened before the creatures of 28.10.2026, which
    // Skraj Wiatrołomów and its land got and Trzcinowisko did not.
    assert.deepEqual(openedChests(['windfalls-edge', 'windfalls', 'reed-beds', 'nowhere'], content), ['reed-beds']);
    assert.deepEqual(openedChests(['windfalls-edge:5', openedChestEntry('windfalls', content)], content), ['windfalls-edge', 'windfalls']);
    // A list longer now than when its chest was opened.
    assert.deepEqual(openedChests(['windfalls-edge:3'], content), []);
  });

  test('tracking the creatures of the quests meets them more often', () => {
    const edge = content.areasById['windfalls-edge'];
    const share = (tracked) => {
      const rng = createRng('tropienie');
      let badgers = 0;
      for (let i = 0; i < 6000; i++) {
        const encounter = rollEncounter(edge, rng, content, edge.maxLevel, { eliteChance: 0, toughChance: 0 }, tracked);
        if (encounter.members.some((member) => member.monsterId === 'badger')) badgers += 1;
      }
      return badgers / 6000;
    };
    // At level 5 a badger comes in 29 of the 104 weight of Skraj's
    // encounters, and tracked in 43.5 of 118.5: from about 28% of fights to
    // about 37%.
    assert.ok(Math.abs(share([]) - 29 / 104) < 0.02, String(share([])));
    assert.ok(Math.abs(share(['badger']) - 43.5 / 118.5) < 0.02, String(share(['badger'])));
  });

  test('tracking the creatures not met yet meets them a tenth more often, with the quests\' tracking on top', () => {
    const edge = content.areasById['windfalls-edge'];
    const share = (tracked, unknown) => {
      const rng = createRng('nieznane');
      let badgers = 0;
      for (let i = 0; i < 20000; i++) {
        const encounter = rollEncounter(edge, rng, content, edge.maxLevel, { eliteChance: 0, toughChance: 0 }, tracked, unknown);
        if (encounter.members.some((member) => member.monsterId === 'badger')) badgers += 1;
      }
      return badgers / 20000;
    };
    // A badger in 29 of the 104 weight, a tenth more: 31.9 of 106.9, and
    // tracked for a quest too: 47.85 of 122.85.
    assert.ok(Math.abs(share([], ['badger']) - 31.9 / 106.9) < 0.01, String(share([], ['badger'])));
    assert.ok(Math.abs(share(['badger'], ['badger']) - 47.85 / 122.85) < 0.01, String(share(['badger'], ['badger'])));
    // The place's creatures the character has not met, elites and champions apart.
    const all = unknownCreatures(edge, []);
    assert.ok(all.includes('badger') && !all.includes(edge.elite));
    assert.deepEqual(unknownCreatures(edge, ['badger']), all.filter((id) => id !== 'badger'));
    assert.deepEqual(unknownCreatures(edge, all), []);
  });

  test('every creature an inner region can roll is on its list, within its levels', () => {
    for (const area of Object.values(content.areasById)) {
      const dangers = new Map(areaDangers(area, content).map((danger) => [danger.monsterId, danger]));
      const rng = createRng(`niebezpieczeństwa-${area.id}`);
      for (let i = 0; i < 300; i++) {
        const encounter = rollEncounter(area, rng, content, area.maxLevel, { eliteChance: 0.1, toughChance: 0.3 });
        for (const member of encounter.members) {
          const danger = dangers.get(member.monsterId);
          assert.ok(danger, `${area.id}: ${member.monsterId} is missing`);
          assert.ok(member.level >= danger.minLevel && member.level <= danger.maxLevel, `${area.id}: ${member.monsterId} at ${member.level}`);
        }
      }
    }
  });
});

describe('quests from the narrator', () => {
  const at = (iso) => Date.parse(iso);
  const iso = (ms) => new Date(ms).toISOString();
  // The data with the week's whole numbers at every level, for what the
  // drawing does before the level's share (weekShare).
  const wholeWeek = { ...content, quests: { ...content.quests, periods: { ...content.quests.periods, weekly: { ...content.quests.periods.weekly, curve: [[1, 1]] } } } };

  test('a day starts at midnight Polish time and a week on Monday, also when the clocks change', () => {
    // 25 October 2026: the clocks go back an hour, so the day has 25 hours.
    const sunday = questPeriod('daily', at('2026-10-25T10:00:00Z'), content);
    assert.deepEqual([sunday.key, iso(sunday.startsAt), iso(sunday.endsAt)], ['2026-10-25', '2026-10-24T22:00:00.000Z', '2026-10-25T23:00:00.000Z']);
    const week = questPeriod('weekly', at('2026-10-25T10:00:00Z'), content);
    assert.deepEqual([week.key, iso(week.startsAt), iso(week.endsAt)], ['2026-10-19', '2026-10-18T22:00:00.000Z', '2026-10-25T23:00:00.000Z']);
    // Half past midnight on Monday is a new day and a new week.
    const monday = at('2026-10-25T23:30:00Z');
    assert.equal(questPeriod('daily', monday, content).key, '2026-10-26');
    assert.equal(questPeriod('weekly', monday, content).key, '2026-10-26');
    assert.equal(questPeriod('daily', at('2026-10-25T22:59:59Z'), content).key, '2026-10-25');
    // Summer time: midnight is at 22:00 UTC.
    assert.equal(questPeriod('daily', at('2026-07-15T21:59:59Z'), content).key, '2026-07-15');
    assert.equal(questPeriod('daily', at('2026-07-15T22:00:00Z'), content).key, '2026-07-16');
    // 29 March 2026: the clocks go forward, so the day has 23 hours.
    const spring = questPeriod('daily', at('2026-03-29T12:00:00Z'), content);
    assert.deepEqual([iso(spring.startsAt), iso(spring.endsAt)], ['2026-03-28T23:00:00.000Z', '2026-03-29T22:00:00.000Z']);
    // A week over the turn of a month.
    assert.equal(questPeriod('weekly', at('2026-11-01T12:00:00Z'), content).key, '2026-10-26');
  });

  test('a new character gets quests of the creatures of its place, of creatures of any kind and of the time explored', () => {
    const character = newCharacter('warrior');
    const area = questArea(character, content);
    assert.equal(area.id, 'windfalls-edge');
    const prey = new Set(area.encounters.flatMap((encounter) => encounter.monsters));
    // Skraj Wiatrołomów, before the Stół rozbiórki stands: in the day five
    // of its creatures, creatures of any kind and the time; the week asks
    // for the general ones only (the author: "Tygodniowe zadania powinny być
    // bardziej ogólne"): creatures of any kind, the time and the inner
    // regions to open; no daily chests (the author: "nie rób otwierania
    // skrzynek zadań jako zadania").
    const kinds = { daily: ['kill', 'killAny', 'explore'], weekly: ['killAny', 'explore', 'unlock'] };
    for (const periodId of ['daily', 'weekly']) {
      for (let seed = 0; seed < 30; seed++) {
        const quests = drawQuests(periodId, { character, hasTable: false, seed }, content);
        assert.equal(quests.length, periodId === 'daily' ? 5 : 3);
        const kills = quests.filter((quest) => quest.kind === 'kill');
        assert.ok(kills.every((quest) => prey.has(quest.target) && quest.count >= 1));
        assert.equal(new Set(kills.map((quest) => quest.target)).size, kills.length, 'a creature twice');
        // Nothing for the Stół rozbiórki before it stands.
        assert.ok(quests.every((quest) => kinds[periodId].includes(quest.kind)));
        assert.ok(quests.every((quest) => quest.progress === 0 && !quest.claimed && quest.reward.amount >= 1));
      }
    }
    // The same character and period always get the same quests.
    assert.deepEqual(drawQuests('daily', { character, hasTable: true, seed: 'a:daily:2026-10-25' }, content), drawQuests('daily', { character, hasTable: true, seed: 'a:daily:2026-10-25' }, content));
    assert.notDeepEqual(drawQuests('daily', { character, hasTable: true, seed: 'a:daily:2026-10-25' }, content), drawQuests('daily', { character, hasTable: true, seed: 'a:daily:2026-10-26' }, content));
  });

  test('a new character is asked to open inner regions: only in the week, fewer as its class grows, only while new', () => {
    const unlock = content.quests.kinds.find((kind) => kind.id === 'unlock');
    const asked = (character, periodId, data = content) =>
      Array.from({ length: 40 }, (_, seed) => drawQuests(periodId, { character, hasTable: true, seed }, data))
        .flat()
        .filter((quest) => quest.kind === 'unlock')
        .map((quest) => quest.count);
    // Lisie Jary opens at class level 5, then one more every 5 levels.
    assert.equal(areasOpened(1, 5, content), 1);
    assert.equal(areasOpened(4, 20, content), 4);
    // Never in the day (the author: "najlepiej, żeby wcale w dziennych tego nie było").
    assert.deepEqual(asked(newCharacter('warrior'), 'daily'), []);
    // A week's whole numbers are 2–3, from class level 10 for 2 and from 20
    // for 1; at a new character's level its share of them is one.
    assert.deepEqual(new Set(asked(newCharacter('warrior'), 'weekly', wholeWeek)), new Set([2, 3]));
    assert.deepEqual(new Set(asked(newCharacter('warrior', { level: 12, classLevel: 10 }), 'weekly', wholeWeek)), new Set([2]));
    assert.deepEqual(new Set(asked(newCharacter('warrior', { level: 22, classLevel: 20 }), 'weekly', wholeWeek)), new Set([1]));
    assert.deepEqual(new Set(asked(newCharacter('warrior'), 'weekly')), new Set([1]));
    // Near the last inner region of the game a week asks for no more than are left.
    const always = {
      ...wholeWeek,
      quests: { ...wholeWeek.quests, kinds: content.quests.kinds.map((kind) => (kind.id === 'unlock' ? { ...kind, untilClassLevel: 150, weekly: { ...kind.weekly, most: [] } } : kind)) },
    };
    assert.deepEqual(new Set(asked(newCharacter('warrior', { level: 142, classLevel: 142 }), 'weekly', always)), new Set([1]));
    // Only while new.
    assert.ok(asked(newCharacter('warrior', { level: 28, classLevel: unlock.untilClassLevel - 1 }), 'weekly').length > 0);
    assert.deepEqual(asked(newCharacter('warrior', { level: 30, classLevel: unlock.untilClassLevel }), 'weekly'), []);
    assert.deepEqual(asked(newCharacter('warrior', { level: 50, classLevel: 50 }), 'weekly'), []);
    // Progress: the inner regions a claim's new class levels open.
    const quests = { weekly: { period: 'w', quests: [{ kind: 'unlock', count: 1, progress: 0, claimed: false }], chest: false } };
    assert.equal(addQuestProgress(quests, { opened: 2 }).weekly.quests[0].progress, 1);
    assert.equal(addQuestProgress(quests, { minutes: 30 }).weekly.quests[0].progress, 0);
    assert.equal(questText({ kind: 'unlock', count: 2 }, content), 'Odblokuj dostęp do 2 nowych regionów.');
    assert.equal(questText({ kind: 'unlock', count: 1 }, content), 'Odblokuj dostęp do 1 nowego regionu.');
  });

  test('the week asks much less up to level 50 and more as the character grows', () => {
    // The author: "do 50 lvla o wiele lżejsze i z czassem trudniej troche".
    const share = (level, days = 7) => weekShare(level, days, content);
    assert.equal(share(1), 0.3);
    assert.equal(share(50), 0.5);
    assert.equal(share(200), 1);
    assert.equal(share(450), 1);
    assert.ok(share(10) < share(40) && share(40) < share(60) && share(60) < share(150) && share(150) < share(199));
    assert.equal(share(50, 1), 0.5 / 7);
    // The minutes of explorations a week asks for, at level 10 and at 200.
    const minutes = (level) =>
      Array.from({ length: 40 }, (_, seed) => drawQuests('weekly', { character: newCharacter('cleric', { level, classLevel: level }), hasTable: false, seed }, content))
        .flat()
        .filter((quest) => quest.kind === 'explore')
        .map((quest) => quest.count);
    const low = minutes(10);
    const high = minutes(200);
    assert.ok(low.length > 0 && high.length > 0);
    assert.ok(low.every((count) => count % 60 === 0 && count >= 240 && count <= 600), String(low));
    assert.ok(high.every((count) => count >= 900 && count <= 1800), String(high));
  });

  test('the quests not done yet are drawn anew once a period; done and claimed ones stay', () => {
    // The author: "jednorazowa możliwość przelosowania zadań dziennych -
    // dziennie i tygodniowych - tygodniowo".
    const character = newCharacter('cleric', { level: 12, classLevel: 12 });
    const context = { character, hasTable: true, seed: 9 };
    const monday = at('2026-10-26T08:00:00Z');
    const drawn = currentQuests({}, context, monday, content);
    const done = { ...drawn.daily.quests[0], progress: drawn.daily.quests[0].count };
    const claimed = { ...drawn.daily.quests[1], progress: drawn.daily.quests[1].count, claimed: true };
    // The rest begun, not done.
    const quests = { ...drawn, daily: { ...drawn.daily, quests: [done, claimed, ...drawn.daily.quests.slice(2).map((quest) => ({ ...quest, progress: quest.count - 1 }))] } };
    const next = rerolledQuests(quests, 'daily', context, monday, content);
    assert.equal(next.daily.rerolled, true);
    assert.deepEqual(next.daily.quests.slice(0, 2), [done, claimed]);
    // The others anew, from the start, none twice and others than before.
    const key = (quest) => `${quest.kind}:${quest.target ?? ''}`;
    assert.equal(new Set(next.daily.quests.map(key)).size, next.daily.quests.length);
    assert.ok(next.daily.quests.slice(2).every((quest) => quest.progress === 0 && !quest.claimed));
    assert.ok(next.daily.quests.slice(2).some((quest, index) => key(quest) !== key(quests.daily.quests[index + 2])));
    assert.equal(next.weekly, quests.weekly);
    assert.equal(questsView(next, monday, content).daily.rerolled, true);
    // Once a period, and only with something left to draw anew.
    assert.equal(rerolledQuests(next, 'daily', context, monday, content), null);
    const all = { ...drawn, weekly: { ...drawn.weekly, quests: drawn.weekly.quests.map((quest) => ({ ...quest, progress: quest.count })) } };
    assert.equal(rerolledQuests(all, 'weekly', context, monday, content), null);
    // A week's on its last day: what can be done in it, a seventh of level
    // 12's share (an hour of explorations at most).
    const sunday = rerolledQuests(drawn, 'weekly', context, at('2026-11-01T08:00:00Z'), content).weekly;
    assert.ok(sunday.quests.every((quest) => quest.count <= 60), JSON.stringify(sunday.quests));
  });

  test('no quest asks to open the daily chest; a kept one is drawn anew, to be done in what is left of the week', () => {
    assert.ok(!content.quests.kinds.some((kind) => kind.id === 'dailies'));
    const character = newCharacter('cleric', { level: 12, classLevel: 12 });
    const context = { character, hasTable: false, seed: 4, createdAt: at('2026-10-01T10:00:00Z') };
    const sunday = at('2026-11-01T08:00:00Z');
    const quest = (kind, extra = {}) => ({ kind, count: 4, progress: 1, reward: { kind: 'gold', amount: 9 }, claimed: false, ...extra });
    const stored = {
      daily: currentQuests({}, context, sunday, content).daily,
      weekly: { period: '2026-10-26', chest: false, scaled: true, quests: [quest('dailies'), quest('explore', { count: 120, progress: 60 }), quest('dailies', { progress: 4, claimed: true })] },
    };
    const healed = currentQuests(stored, context, sunday, content).weekly;
    const [fresh, kept, claimed] = healed.quests;
    assert.ok(['killAny', 'unlock'].includes(fresh.kind), fresh.kind);
    assert.deepEqual([fresh.progress, fresh.claimed], [0, false]);
    // On the last day: a seventh of the share at level 12.
    if (fresh.kind === 'killAny') assert.ok(fresh.count <= Math.ceil(200 * 2 * weekShare(12, 1, content)), String(fresh.count));
    assert.deepEqual(kept, stored.weekly.quests[1]);
    // One claimed stays as it was, hidden from the page.
    assert.deepEqual(claimed, stored.weekly.quests[2]);
    assert.ok(!questsView({ daily: stored.daily, weekly: healed }, sunday, content).weekly.quests.some((one) => one.kind === 'dailies'));
    assert.deepEqual(currentQuests({ ...stored, weekly: healed }, context, sunday, content).weekly, healed);
  });

  test('with the table built, its work comes into the draw', () => {
    const character = newCharacter('archer', { level: 12, classLevel: 10 });
    const kinds = new Set();
    for (let seed = 0; seed < 40; seed++) for (const quest of drawQuests('daily', { character, hasTable: true, seed }, content)) kinds.add(quest.kind);
    assert.deepEqual([...kinds].sort(), ['explore', 'kill', 'killAny', 'process', 'salvage']);
  });

  test('no quest sends a character to the creatures of a place too easy for it', () => {
    const kinds = (character) => {
      const found = new Set();
      for (let seed = 0; seed < 40; seed++) for (const quest of drawQuests('daily', { character, hasTable: true, seed }, content)) found.add(quest.kind);
      return [...found].sort();
    };
    // A class far behind the character opens only Krucze Wykroty (11–15):
    // too easy at level 19, still fine at 18.
    const behind = newCharacter('archer', { level: 19, classLevel: 14 });
    assert.equal(questArea(behind, content).id, 'raven-hollows');
    assert.deepEqual(kinds(behind), ['explore', 'process', 'salvage']);
    assert.ok(kinds({ ...behind, level: 18 }).includes('kill'));
    // Past every place of the game the same.
    assert.ok(!kinds(newCharacter('archer', { level: 160, classLevel: 169 })).includes('kill'));
  });

  test('a quest asks for as many creatures as its fights bring; the week for creatures of any kind only', () => {
    // Skraj Wiatrołomów at level 1: wolves come in 30 fights of 84, badgers
    // in 20, squirrels in 18 and grass snakes in 16, and each fight brings
    // one creature.
    const character = newCharacter('mage');
    const shares = { wolf: 30 / 84, badger: 20 / 84, squirrel: 18 / 84, 'grass-snake': 16 / 84 };
    for (const periodId of ['daily', 'weekly']) {
      for (let seed = 0; seed < 30; seed++) {
        for (const quest of drawQuests(periodId, { character, hasTable: false, seed }, wholeWeek).filter((candidate) => candidate.kind.startsWith('kill'))) {
          const [fewest, most] = content.quests.kinds.find((kind) => kind.id === quest.kind)[periodId].fights;
          const share = quest.kind === 'killAny' ? 1 : shares[quest.target];
          assert.ok(quest.count >= Math.max(1, Math.round(fewest * share)) && quest.count <= Math.round(most * share), `${periodId} ${quest.target} ${quest.count}`);
          assert.ok(periodId === 'daily' || quest.kind === 'killAny', 'a single creature for the week');
        }
      }
    }
    // A creature of few fights in the place (here a bat in Wilcze Kręgi of
    // the test): never a quest of its own.
    const later = newCharacter('mage', { level: 42, classLevel: 40 });
    assert.equal(questArea(later, content).id, 'wolf-circles');
    const rare = { ...content.areasById['wolf-circles'], encounters: [{ weight: 60, monsters: ['she-wolf'] }, { weight: 4, monsters: ['bat'] }] };
    const rareContent = { ...content, areas: content.areas.map((area) => (area.id === rare.id ? rare : area)) };
    const targets = (periodId, who = later, data = rareContent) =>
      new Set(Array.from({ length: 60 }, (_, seed) => drawQuests(periodId, { character: who, hasTable: false, seed }, data)).flat().map((quest) => quest.target));
    assert.ok(!targets('daily').has('bat'));
    assert.ok(!targets('weekly').has('bat'));
    // The champion is never a quest's target.
    const last = newCharacter('mage', { level: 23, classLevel: 22 });
    assert.equal(questArea(last, content).id, 'boar-thicket');
    assert.ok(!targets('daily', last, content).has('tusker'));
  });

  test('rewards: gold, resources and parts, more for a higher level and for the week', () => {
    const rewards = (periodId, level) =>
      Array.from({ length: 60 }, (_, seed) => drawQuests(periodId, { character: newCharacter('warrior', { level, classLevel: level }), hasTable: true, seed }, content))
        .flat()
        .map((quest) => quest.reward);
    const daily = rewards('daily', 10);
    const weekly = rewards('weekly', 10);
    assert.deepEqual([...new Set(daily.map((reward) => reward.kind))].sort(), ['gold', 'part', 'resource']);
    const gold = (list) => list.filter((reward) => reward.kind === 'gold').map((reward) => reward.amount);
    assert.ok(Math.min(...gold(weekly)) > Math.max(...gold(daily)), 'a weekly quest pays more');
    assert.ok(Math.min(...gold(rewards('daily', 40))) > Math.max(...gold(daily)), 'a higher level pays more');
    for (const reward of daily.filter((candidate) => candidate.kind === 'resource')) assert.ok(content.resourcesById[reward.id]);
    // Parts by the level's band: Ścinki at first, Rzemienie from level 25.
    assert.ok(daily.filter((reward) => reward.kind === 'part').every((reward) => reward.id === 'scraps'));
    assert.ok(rewards('daily', 30).filter((reward) => reward.kind === 'part').every((reward) => reward.id === 'straps'));
    assert.equal(questLevel(1, content).part, 'scraps');
    assert.equal(questLevel(499, content).fromLevel, 400);
  });

  test('a period keeps its quests until midnight, then new ones come', () => {
    const context = { character: newCharacter('cleric'), hasTable: false, seed: 5 };
    const morning = at('2026-10-21T06:00:00Z');
    const stored = currentQuests({}, context, morning, content);
    assert.equal(stored.daily.period, '2026-10-21');
    assert.equal(stored.weekly.period, '2026-10-19');
    const busy = addQuestProgress(stored, { minutes: 15 });
    // Later that day the quests and their progress stay, also for a stronger character.
    const evening = currentQuests(busy, { ...context, character: newCharacter('cleric', { level: 9, classLevel: 8 }) }, at('2026-10-21T21:59:00Z'), content);
    assert.deepEqual(evening, busy);
    assert.ok(!questsStale(busy, at('2026-10-21T21:59:00Z'), content));
    // After midnight the day's quests are new and the week's stay.
    const next = currentQuests(busy, context, at('2026-10-21T22:00:00Z'), content);
    assert.ok(questsStale(busy, at('2026-10-21T22:00:00Z'), content));
    assert.equal(next.daily.period, '2026-10-22');
    assert.ok(next.daily.quests.every((quest) => quest.progress === 0));
    assert.equal(next.weekly, busy.weekly);
  });

  test('a week drawn while it is under way asks for the days left of it, its rewards whole', () => {
    // The tester's new character on a Sunday (the author: "błąd mocny",
    // "ustaw na robienie do końca czasu pozostałego"): 1320 minutes of
    // explorations with 15 hours left.
    const context = { character: newCharacter('cleric'), hasTable: false, seed: 11 };
    const monday = currentQuests({}, context, at('2026-10-26T08:00:00Z'), content).weekly;
    const sunday = currentQuests({}, context, at('2026-11-01T08:00:00Z'), content).weekly;
    const thursday = currentQuests({}, context, at('2026-10-29T08:00:00Z'), content).weekly;
    assert.deepEqual([monday.days, monday.scaled], [undefined, true]);
    assert.equal(sunday.days, 1);
    assert.equal(thursday.days, 4);
    // The same quests and rewards; fewer of each, the fewer days are left.
    assert.deepEqual(sunday.quests.map((quest) => [quest.kind, quest.reward]), monday.quests.map((quest) => [quest.kind, quest.reward]));
    const count = (period, kind) => period.quests.find((quest) => quest.kind === kind)?.count;
    // At level 1: 0.3 of 900–1800 minutes in the week, an hour on its last day.
    assert.ok(count(monday, 'explore') >= 240 && count(monday, 'explore') <= 540, String(count(monday, 'explore')));
    assert.equal(count(sunday, 'explore'), 60);
    assert.ok(count(thursday, 'explore') >= 120 && count(thursday, 'explore') <= 300 && count(thursday, 'explore') % 60 === 0);
    for (const period of [sunday, thursday]) {
      for (const quest of period.quests) assert.ok(quest.count >= 1 && quest.count <= count(monday, quest.kind), JSON.stringify(quest));
    }
    // The words under the week's quests.
    const view = questsView({ daily: currentQuests({}, context, at('2026-11-01T08:00:00Z'), content).daily, weekly: sunday }, at('2026-11-01T08:00:00Z'), content);
    assert.equal(view.weekly.late, 'Ten tydzień zaczął się dla Ciebie później, więc zadania są na 1 z 7 dni.');
    assert.equal(view.daily.late, undefined);
  });

  test('a week drawn before 0.0.73 is cut to the level\'s share and, for a character that came during it, the days left then; once', () => {
    // The tester's week as drawn before: a character of level 12 made on
    // Saturday, seen on Sunday.
    const saturday = at('2026-10-31T10:00:00Z');
    const now = at('2026-11-01T08:00:00Z');
    const character = newCharacter('cleric', { level: 12, classLevel: 12 });
    const context = { character, hasTable: false, seed: 11 };
    const quest = (kind, count, progress, extra = {}) => ({ kind, count, progress, reward: { kind: 'gold', amount: 50 }, claimed: false, ...extra });
    const stored = {
      daily: currentQuests({}, context, now, content).daily,
      weekly: {
        period: '2026-10-26',
        chest: false,
        quests: [quest('killAny', 150, 55), quest('explore', 1320, 270), quest('dailies', 4, 1), quest('unlock', 3, 3, { claimed: true })],
      },
    };
    const share = weekShare(12, 2, content);
    const late = currentQuests(stored, { ...context, createdAt: saturday }, now, content).weekly;
    assert.deepEqual([late.days, late.scaled], [2, true]);
    const [kills, minutes, ...rest] = late.quests;
    assert.deepEqual([kills.count, kills.progress], [Math.round(150 * share), Math.round(150 * share)]);
    assert.deepEqual([minutes.count, minutes.progress], [Math.max(60, Math.round((1320 * share) / 60) * 60), Math.max(60, Math.round((1320 * share) / 60) * 60)]);
    // The daily chests' quest has nothing to be drawn for in its place: it
    // goes, and the claimed one stays, so the week's chest opens.
    assert.deepEqual(rest, [stored.weekly.quests[3]]);
    assert.ok(chestReady(late));
    // Once: the cut week stays as it is.
    assert.equal(currentQuests({ ...stored, weekly: late }, { ...context, createdAt: saturday }, now, content).weekly, late);
    // A character there before the week began: the level's share only.
    const older = currentQuests(stored, { ...context, createdAt: at('2026-10-20T10:00:00Z') }, now, content).weekly;
    assert.equal(older.days, undefined);
    assert.equal(older.quests[1].count, Math.round((1320 * weekShare(12, 7, content)) / 60) * 60);
  });

  test('the day asks for creatures of the newest open inner region and the one before it, the week for none', () => {
    const character = newCharacter('cleric', { level: 23, classLevel: 27 });
    const targets = (periodId) =>
      new Set(
        Array.from({ length: 80 }, (_, seed) => drawQuests(periodId, { character, hasTable: true, seed }, content))
          .flat()
          .filter((quest) => quest.kind === 'kill')
          .map((quest) => quest.target),
      );
    assert.deepEqual([...targets('daily')].sort(), ['bat', 'black-stork', 'boar', 'imp', 'mossling', 'stag', 'stoneling', 'wildcat']);
    assert.deepEqual([...targets('weekly')], []);
  });

  test('a kept quest for a creature the class cannot reach is drawn anew, the others stay', () => {
    // As drawn on 28.10 before the creatures moved to inner regions of their
    // own (0.0.27): Wadera now lives only where class level 40 goes.
    const character = newCharacter('cleric', { level: 23, classLevel: 27 });
    const context = { character, hasTable: true, seed: 7 };
    const now = at('2026-10-28T18:00:00Z');
    const quest = (kind, target, extra = {}) => ({ kind, ...(target && { target }), count: 2, progress: 0, reward: { kind: 'gold', amount: 9 }, claimed: false, ...extra });
    const drawn = currentQuests({}, context, now, content);
    const stored = {
      ...drawn,
      daily: {
        ...drawn.daily,
        quests: [quest('kill', 'she-wolf'), quest('kill', 'stoneling'), quest('kill', 'spider', { progress: 2 }), quest('explore', null, { count: 60, progress: 60, claimed: true }), quest('salvage')],
      },
    };
    const healed = currentQuests(stored, context, now, content);
    const [fresh, ...kept] = healed.daily.quests;
    // A new quest the period does not ask for yet, from what the class may get.
    assert.notEqual(fresh.target, 'she-wolf');
    assert.ok(!['explore', 'salvage'].includes(fresh.kind) && fresh.target !== 'stoneling');
    assert.ok(fresh.kind !== 'kill' || ['bat', 'mossling', 'imp', 'boar', 'stag', 'wildcat', 'black-stork'].includes(fresh.target));
    assert.deepEqual([fresh.progress, fresh.claimed], [0, false]);
    // Reachable, done or claimed quests stay as they were.
    assert.deepEqual(kept, stored.daily.quests.slice(1));
    assert.equal(healed.weekly, stored.weekly);
    // The same every time, and nothing more once saved.
    assert.deepEqual(currentQuests(stored, context, now, content), healed);
    assert.equal(currentQuests(healed, context, now, content).daily, healed.daily);
  });

  test('beaten creatures, minutes and the table move the quests on, up to their count', () => {
    const quests = {
      daily: {
        period: '2026-10-25',
        chest: false,
        quests: [
          { kind: 'kill', target: 'wolf', count: 3, progress: 1, reward: { kind: 'gold', amount: 9 }, claimed: false },
          { kind: 'kill', target: 'fox', count: 2, progress: 0, reward: { kind: 'gold', amount: 9 }, claimed: false },
          { kind: 'explore', count: 30, progress: 25, reward: { kind: 'gold', amount: 9 }, claimed: false },
          { kind: 'process', count: 4, progress: 0, reward: { kind: 'gold', amount: 9 }, claimed: false },
          { kind: 'salvage', count: 1, progress: 0, reward: { kind: 'gold', amount: 9 }, claimed: false },
        ],
      },
      weekly: { period: '2026-10-19', chest: false, quests: [] },
    };
    const after = addQuestProgress(quests, { kills: { wolf: 5, viper: 2 }, minutes: 10 });
    assert.deepEqual(after.daily.quests.map((quest) => quest.progress), [3, 0, 30, 0, 0]);
    const table = addQuestProgress(after, { processed: 3, salvaged: 1 });
    assert.deepEqual(table.daily.quests.map((quest) => quest.progress), [3, 0, 30, 3, 1]);
    assert.ok(!chestReady(table.daily));
    const done = addQuestProgress(table, { kills: { fox: 2 }, processed: 9 });
    assert.ok(chestReady(done.daily));
    assert.ok(!chestReady(done.weekly), 'no quests, no chest');
    const claimed = withChest(withClaimed(done, 'daily', 1), 'daily');
    assert.deepEqual(claimed.daily.quests.map((quest) => quest.claimed), [false, true, false, false, false]);
    assert.equal(claimed.daily.chest, true);
    assert.equal(done.daily.chest, false);
  });

  test('only the creatures of won fights count as beaten', () => {
    const kills = huntKills({
      fights: [
        { won: true, enemies: [{ monsterId: 'wolf' }, { monsterId: 'wolf' }] },
        { won: true, enemies: [{ monsterId: 'fox' }] },
        { won: false, enemies: [{ monsterId: 'bear' }] },
      ],
    }, content);
    assert.deepEqual(kills, { wolf: 2, fox: 1 });
    const hunt = simulateHunt({ character: newCharacter('warrior'), equipped: [], name: 'Test', areaId: 'windfalls-edge', minutes: 30, seed: 'zadania' }, content);
    const beaten = Object.values(huntKills(hunt, content)).reduce((sum, count) => sum + count, 0);
    const won = hunt.fights.filter((fight) => fight.won === true).reduce((sum, fight) => sum + fight.enemies.length, 0);
    assert.equal(beaten, won);
  });

  test('an exploration tracks the creatures the quests still ask for, if they live there', () => {
    const quest = (kind, target, progress = 0) => ({ kind, ...(target && { target }), count: 3, progress, reward: { kind: 'gold', amount: 5 }, claimed: false });
    const quests = {
      daily: { period: 'd', quests: [quest('kill', 'badger'), quest('kill', 'wolf', 3), quest('kill', 'bear'), quest('explore'), quest('killAny')], chest: false },
      weekly: { period: 'w', quests: [quest('kill', 'badger', 1), quest('kill', 'viper')], chest: false },
    };
    assert.deepEqual(questCreatures(quests, content.areasById['windfalls-edge']), ['badger']);
    assert.deepEqual(questCreatures(quests, content.areasById['glade-heart']), ['bear']);
  });

  test('the weekly chest holds an item of the level for the class, its rarity by the level', () => {
    const counts = {};
    for (let i = 0; i < 300; i++) {
      const item = chestItem({ level: 12, classId: 'mage' }, ['weapon', 'chest'], createRng(`skrzynia-${i}`), content);
      assert.equal(item.level, 12);
      assert.ok(canUse(item.base, 'mage', content));
      counts[item.rarity] = (counts[item.rarity] ?? 0) + 1;
    }
    assert.deepEqual(Object.keys(counts).sort(), Object.keys(questLevel(12, content).chestRarities).sort());
    const late = chestItem({ level: 120, classId: 'warrior' }, [], createRng('późno'), content);
    assert.ok(Object.keys(questLevel(120, content).chestRarities).includes(late.rarity));
  });

  test('the weekly chest may hold the Otoczak from class level 10, wherever the character explores', () => {
    const worn = content.slots.map((slot) => slot.id).filter((id) => id !== 'talisman');
    const talismans = (classLevel) =>
      Array.from({ length: 300 }, (_, i) => chestItem({ level: 12, classId: 'mage', classLevel }, worn, createRng(`tydzień-${i}`), content))
        .filter((item) => item.slot === 'talisman')
        .map((item) => item.base);
    assert.ok(!talismans(9).includes('holed-stone'));
    assert.ok(talismans(10).includes('holed-stone'));
  });

  test('the creatures of the place the quests are about name the affixes in the weekly chest', () => {
    const area = questArea({ classLevel: 1 }, content);
    const living = new Set(areaDangers(area, content).map((danger) => danger.monsterId));
    let affixes = 0;
    for (let i = 0; i < 200; i++) {
      const item = chestItem({ level: 30, classId: 'cleric', classLevel: 1 }, [], createRng(`skrzynia-miejsca-${i}`), content);
      for (const affix of item.affixes) {
        assert.ok(living.has(affix.monster), affix.monster);
        affixes += 1;
      }
    }
    assert.ok(affixes > 100);
  });

  test('quests read in Polish, with the noun to go with the number', () => {
    assert.deepEqual([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 102, 112].map((count) => countedForm(count, ['wilka', 'wilki', 'wilków'])), [
      'wilka', 'wilki', 'wilki', 'wilków', 'wilków', 'wilków', 'wilków', 'wilków', 'wilki', 'wilków', 'wilki', 'wilków',
    ]);
    const text = (quest) => questText({ progress: 0, ...quest }, content);
    assert.equal(text({ kind: 'kill', target: 'wolf', count: 3 }), 'Pokonaj 3 wilki.');
    assert.equal(text({ kind: 'kill', target: 'viper', count: 1 }), 'Pokonaj 1 żmiję.');
    assert.equal(text({ kind: 'kill', target: 'lynx', count: 5 }), 'Pokonaj 5 rysiów.');
    assert.equal(text({ kind: 'explore', count: 45 }), 'Spędź na wyprawach łącznie 45 minut.');
    assert.equal(text({ kind: 'process', count: 2 }), 'Przerób na Stole rozbiórki 2 materiały.');
    assert.equal(text({ kind: 'salvage', count: 1 }), 'Rozbierz na Stole rozbiórki 1 przedmiot.');
    assert.deepEqual([1, 3, 12].map((count) => text({ kind: 'killAny', count })), [
      'Pokonaj łącznie 1 stwora.', 'Pokonaj łącznie 3 stwory.', 'Pokonaj łącznie 12 stworów.',
    ]);
    for (const monster of Object.values(content.monstersById)) assert.equal(monster.counted.length, 3, monster.id);
    // A creature the character has not met yet keeps its secret, as on the list of dangers.
    assert.equal(questText({ kind: 'kill', target: 'viper', count: 1, progress: 0 }, content, ['wolf']), 'Pokonaj 1 ???.');
    assert.equal(questText({ kind: 'kill', target: 'wolf', count: 3, progress: 0 }, content, ['wolf']), 'Pokonaj 3 wilki.');
    assert.equal(questText({ kind: 'explore', count: 45, progress: 0 }, content, []), 'Spędź na wyprawach łącznie 45 minut.');
  });

  test('the page gets each period with its end, its quests and its chest', () => {
    const now = at('2026-10-25T10:00:00Z');
    // A day drawn with a quest for the time of explorations.
    const draw = (seed) => currentQuests({}, { character: newCharacter('shadow'), hasTable: false, seed }, now, content);
    const quests = draw([...Array(20).keys()].find((seed) => draw(seed).daily.quests.some((quest) => quest.kind === 'explore')));
    const view = questsView(addQuestProgress(quests, { minutes: 240 }), now, content);
    assert.deepEqual(Object.keys(view), ['daily', 'weekly']);
    assert.equal(view.daily.name, 'Dzienne');
    assert.equal(iso(view.daily.endsAt), '2026-10-25T23:00:00.000Z');
    assert.deepEqual(view.weekly.chest, { ...content.quests.periods.weekly.chest, ready: false, opened: false });
    const explore = view.daily.quests.find((quest) => quest.kind === 'explore');
    assert.ok(explore.done && !explore.claimed && explore.progress === explore.count);
    assert.deepEqual(view.daily.quests.map((quest) => quest.index), [0, 1, 2, 3, 4]);
    assert.ok(view.daily.quests.filter((quest) => quest.kind === 'kill').every((quest) => quest.monsterId && quest.text.startsWith('Pokonaj')));
    // A quest of a creature no longer in the data is left out, the others keep their places.
    const gone = { ...quests, daily: { ...quests.daily, quests: [{ ...quests.daily.quests[0], kind: 'kill', target: 'dragon' }, ...quests.daily.quests.slice(1)] } };
    assert.deepEqual(questsView(gone, now, content).daily.quests.map((quest) => quest.index), [1, 2, 3, 4]);
  });
});

describe('the confirmation mail', () => {
  test('names the player, the link and the Punkty Systemu, as text and as a page', () => {
    const link = 'https://insightrpg.com/api/auth/confirm?token=abc&x=<y>';
    const mail = confirmationEmail({ login: 'Karol_97', link }, content);
    assert.equal(mail.subject, 'Potwierdź adres e-mail w grze Insight');
    assert.match(mail.text, /^Cześć, Karol_97!/);
    assert.ok(mail.text.includes(`\n\n${link}\n\n`));
    assert.match(mail.text, /dostaniesz 10 Punktów Systemu/);
    // The page escapes what it shows, the link too.
    assert.ok(mail.html.includes('href="https://insightrpg.com/api/auth/confirm?token=abc&amp;x=&lt;y&gt;"'));
    assert.ok(!mail.html.includes('<y>'));
    assert.match(mail.html, />Potwierdź adres e-mail</);
  });
});

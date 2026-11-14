// Górnictwo and Jubilerstwo (534–539): digging gems, ores and the gold of
// veins in the Systemowa Kopalnia, and in the Systemowa Szlifiernia making
// jewellery of them and setting gems in items; in the engine and through the
// API, both from character level 25.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  bagOverflow,
  craftJewels,
  encyclopediaView,
  explorationGold,
  gemOf,
  gemProperties,
  generateItem,
  createRng,
  drawQuests,
  heldDiscoveries,
  itemProperties,
  itemView,
  jewelBases,
  jewelChance,
  jewelCost,
  jewelMinutes,
  jewelOrderMinutes,
  jewelPatternFrom,
  jewelReport,
  knownGems,
  knownJewelPatterns,
  knownMinerals,
  mineMinerals,
  mineralsPerHour,
  nextGem,
  miningMinutes,
  miningReport,
  notificationsDue,
  oreOf,
  professionStats,
  questPeriod,
  questText,
  addQuestProgress,
  setMinutes,
  transmuteBlock,
  transmuteGems,
  upgradedItem,
  veinGoldPerHour,
  weakerGem,
  workProfession,
  workXp,
} from '../src/engine/index.js';
import { contentIn } from '../src/server/content.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const near = (actual, expected, share) => assert.ok(Math.abs(actual - expected) <= expected * share, `${actual} is not within ${share * 100}% of ${expected}`);

describe('Górnictwo in the engine', () => {
  test('both professions open at character level 25; Górnictwo raises Witalność and Wytrzymałość, Jubilerstwo Wola and Percepcja', () => {
    assert.deepEqual(
      ['mining', 'jewelcrafting'].map((id) => [content.professionsById[id].name, content.professionsById[id].unlockLevel, content.professionsById[id].stats]),
      [
        ['Górnictwo', 25, ['vitality', 'endurance']],
        ['Jubilerstwo', 25, ['will', 'perception']],
      ],
    );
    const mining = content.professionsById.mining;
    const jewels = content.professionsById.jewelcrafting;
    const mastered = 99 * jewels.statPerLevel + jewels.maxLevelBonus;
    assert.deepEqual(professionStats({ mining: { level: 11, xp: 0 }, jewelcrafting: { level: 100, xp: 0 } }, content), {
      wisdom: 0,
      perception: mastered,
      intellect: 0,
      strength: 0,
      dexterity: 0,
      vitality: 10 * mining.statPerLevel,
      endurance: 10 * mining.statPerLevel,
      will: mastered,
    });
    // Both go on to the 200th (825), the mastery's reward kept from the 100th.
    const past = professionStats({ mining: { level: 150, xp: 0 }, jewelcrafting: { level: 200, xp: 0 } }, content);
    assert.deepEqual([past.vitality, past.endurance, past.will, past.perception], [600, 600, 750, 750]);
    assert.deepEqual([mining.maxLevel, jewels.maxLevel, mining.masteryLevel, jewels.masteryLevel], [200, 200, 100, 100]);
  });

  test('the System shows Kwarc and the silver ore first, a gem for each rarity from the levels of 535 A, the gold ore at 25 and the star ore at 60', () => {
    assert.deepEqual(knownMinerals(1, content).map((mineral) => mineral.id), ['quartz', 'silver-ore']);
    assert.deepEqual(
      content.minerals.filter((mineral) => mineral.kind === 'gem').map((gem) => [gem.name, gem.rarity, gem.level]),
      [
        ['Kwarc', 'common', 1],
        ['Agat', 'rare', 5],
        ['Ametyst', 'unique', 15],
        ['Szmaragd', 'epic', 25],
        ['Szafir', 'legendary', 40],
        ['Rubin', 'mythic', 60],
        ['Diament', 'divine', 80],
      ],
    );
    assert.deepEqual(knownMinerals(25, content).map((mineral) => mineral.id), ['quartz', 'agate', 'amethyst', 'emerald', 'silver-ore', 'gold-ore']);
    assert.equal(knownMinerals(80, content).length, 10);
    assert.deepEqual(miningMinutes(content).slice(0, 2), [10, 20]);
    assert.equal(miningMinutes(content).at(-1), 480);
  });

  test('each level digs 2% more, and a digging brings about the expected pieces, always at least one', () => {
    const quartz = content.mineralsById.quartz;
    assert.equal(mineralsPerHour(quartz, 1, content), 2);
    assert.ok(Math.abs(mineralsPerHour(quartz, 51, content) - 4) < 1e-9);
    // Past the 100th (825) it keeps growing: almost five times level 1's at the 200th.
    assert.ok(Math.abs(mineralsPerHour(quartz, 200, content) - 9.96) < 1e-9);
    let found = 0;
    for (let index = 0; index < 400; index += 1) found += mineMinerals({ minutes: 60, level: 1, characterLevel: 25, seed: `q${index}` }, content).found.quartz ?? 0;
    near(found / 400, 2, 0.1);
    // Ten minutes at level 1 still bring something.
    for (let index = 0; index < 50; index += 1) {
      assert.ok(Object.keys(mineMinerals({ minutes: 10, level: 1, characterLevel: 25, seed: `s${index}` }, content).found).length > 0);
    }
    // The seed decides it all.
    assert.deepEqual(mineMinerals({ minutes: 240, level: 30, characterLevel: 40, seed: 'x' }, content), mineMinerals({ minutes: 240, level: 30, characterLevel: 40, seed: 'x' }, content));
  });

  test('the veins give half the gold an hour of exploring gives at the character level (532 A): about 170 at 25', () => {
    assert.equal(veinGoldPerHour(25, content), 170);
    assert.equal(explorationGold(30, content), 390);
    // Straight between two measured levels, and in proportion past the last.
    assert.equal(explorationGold(27, content), 360);
    assert.equal(explorationGold(300, content), 4280);
    let gold = 0;
    let veins = 0;
    for (let index = 0; index < 300; index += 1) {
      const mined = mineMinerals({ minutes: 120, level: 10, characterLevel: 50, seed: `g${index}` }, content);
      gold += mined.gold;
      veins += mined.veins;
    }
    near(gold / 300, veinGoldPerHour(50, content) * 2, 0.06);
    near(veins / 300, 4, 0.1);
  });

  test('the report: the mine, the minerals, the veins, the levels and the minerals revealed', () => {
    const mined = { found: { quartz: 3, 'silver-ore': 7 }, veins: 2, gold: 345 };
    const before = { level: 4, xp: 100 };
    const after = { level: 5, xp: 20 };
    const report = miningReport(
      { minutes: 120, startedAt: 0, endsAt: 7200000, seed: 's', mined, before, after, character: { level: 30 }, xp: 50, work: { level: 30, timePoints: 0, messages: [] } },
      content,
    );
    assert.equal(report.kind, 'minerals');
    assert.equal(report.placeName, 'Systemowa Kopalnia');
    assert.equal(report.found, 'Wydobyto: 3 × Kwarc, 7 × Srebrny kruszec.');
    assert.equal(report.veinsText, 'Żyły złota: 2, razem +345 złota.');
    assert.deepEqual(report.revealed, ['agate']);
    assert.deepEqual(report.system, [
      'Osiągnięto poziom Górnictwa: 5',
      `Zdobyto Witalność: +${content.professionsById.mining.statPerLevel}`,
      `Zdobyto Wytrzymałość: +${content.professionsById.mining.statPerLevel}`,
      'System odsłania nowy kamień: Agat',
    ]);
  });

  test('the Encyklopedia counts the gems and ores held, in a tab of their own with its chests', () => {
    const found = heldDiscoveries({ minerals: { quartz: 2, 'silver-ore': 1, nothing: 3 } }, content);
    assert.deepEqual(found, { 'mineral:quartz': 1, 'mineral:silver-ore': 1 });
    const { minerals } = encyclopediaView({ discovered: found, claimed: [], met: [] }, content);
    assert.deepEqual([minerals.found, minerals.all], [2, 10]);
    const entries = minerals.tiers.flatMap((tier) => tier.entries);
    assert.deepEqual(
      entries.slice(0, 2).map((entry) => [entry.name, entry.sources]),
      [
        [
          'Kwarc',
          ['Górnictwo: od 1. poziomu, w Kopalni.', 'Jubilerstwo: od 1. poziomu, w Szlifierni.', 'Daje biżuterii rzadkość: pospolity. Oprawiony podnosi wszystkie wartości przedmiotu o 5%.'],
        ],
        ['Srebrny kruszec', ['Górnictwo: od 1. poziomu, w Kopalni.', 'Jubilerstwo: od 1. poziomu, w Szlifierni.', 'Idzie na oprawy biżuterii rzadkości: pospolity, rzadki, unikalny.']],
      ],
    );
    assert.deepEqual(entries.at(-1).name, '???');
    assert.deepEqual(entries.at(-1).sources, ['Górnictwo: od 80. poziomu, w Kopalni.', 'Jubilerstwo: od 80. poziomu, w Szlifierni.']);
    assert.deepEqual(minerals.chests.map((chest) => chest.need), [3, 6, 10]);
  });

  // The author: "elementy z Górnictwa i Jubilerstwa musza korespondować z
  // Encyklopedią i miec swoje zakladki lub na przyklad Amulety i Pierścienie
  // być w Tierach odpowiednich" (3.11.2026).
  test('the Encyklopedia: gems and ores in tiers by the level of Górnictwo, as the herbs by Zielarstwo', () => {
    const { minerals } = encyclopediaView({ discovered: {}, claimed: [], met: [], levels: { level: 60, classLevel: 60, professions: { mining: { level: 40, xp: 0 } } } }, content);
    assert.deepEqual(
      minerals.tiers.map((tier) => [tier.name, tier.range, tier.current, tier.entries.map((entry) => content.mineralsById[entry.id].name)]),
      [
        ['Tier I', 'poziomy 1–25', false, ['Kwarc', 'Srebrny kruszec', 'Agat', 'Ametyst', 'Szmaragd', 'Złoty kruszec']],
        ['Tier II', 'poziomy 26–50', true, ['Szafir']],
        ['Tier III', 'poziomy 51–75', false, ['Rubin', 'Gwiezdny kruszec']],
        ['Tier IV', 'poziomy 76–100', false, ['Diament']],
      ],
    );
  });

  test('the Encyklopedia: every jewel stands in the Tier its Szlifiernia pattern opens at, and says so', () => {
    const { items } = encyclopediaView({ discovered: {}, claimed: [], met: [] }, content);
    const tierOf = new Map(items.tiers.flatMap((tier) => tier.entries.map((entry) => [entry.id, tier])));
    const rows = jewelBases(content).map((base) => {
      const tier = tierOf.get(base.id);
      const set = tier.sets.find((each) => each.bases.includes(base.id));
      return [base.name, tier.name, set.name, tier.entries.find((entry) => entry.id === base.id).sources.find((line) => line.startsWith('Szlifiernia'))];
    });
    assert.deepEqual(rows, [
      ['Amulet', 'Tier I', 'Dodatki', 'Szlifiernia: wzór od 1. poziomu Jubilerstwa.'],
      ['Kaptorga', 'Tier II', 'Dodatki', 'Szlifiernia: wzór od 10. poziomu Jubilerstwa.'],
      ['Wisior', 'Tier III', 'Dodatki', 'Szlifiernia: wzór od 25. poziomu Jubilerstwa.'],
      ['Medalion', 'Tier IV', 'Dodatki', 'Szlifiernia: wzór od 50. poziomu Jubilerstwa.'],
      ['Kolia', 'Tier V', 'Dodatki', 'Szlifiernia: wzór od 75. poziomu Jubilerstwa.'],
      ['Kamea', 'Tier VI', 'Dodatki', 'Szlifiernia: wzór od 100. poziomu Jubilerstwa.'],
      ['Pektorał', 'Tier VII', 'Dodatki', 'Szlifiernia: wzór od 125. poziomu Jubilerstwa.'],
      ['Ryngraf', 'Tier VIII', 'Dodatki', 'Szlifiernia: wzór od 150. poziomu Jubilerstwa.'],
      ['Pierścień', 'Tier I', 'Dodatki', 'Szlifiernia: wzór od 1. poziomu Jubilerstwa.'],
      ['Sygnet', 'Tier II', 'Dodatki', 'Szlifiernia: wzór od 10. poziomu Jubilerstwa.'],
      ['Obrączka', 'Tier III', 'Dodatki', 'Szlifiernia: wzór od 25. poziomu Jubilerstwa.'],
      ['Pierścień rodowy', 'Tier IV', 'Dodatki', 'Szlifiernia: wzór od 50. poziomu Jubilerstwa.'],
      ['Pierścień koronny', 'Tier V', 'Dodatki', 'Szlifiernia: wzór od 75. poziomu Jubilerstwa.'],
      ['Pierścień wieczności', 'Tier VI', 'Dodatki', 'Szlifiernia: wzór od 100. poziomu Jubilerstwa.'],
      ['Pierścień przodków', 'Tier VII', 'Dodatki', 'Szlifiernia: wzór od 125. poziomu Jubilerstwa.'],
      ['Pierścień Salomona', 'Tier VIII', 'Dodatki', 'Szlifiernia: wzór od 150. poziomu Jubilerstwa.'],
      ['Talizman', 'Tier I', 'Dodatki', 'Szlifiernia: wzór od 1. poziomu Jubilerstwa.'],
      ['Otoczak', 'Tier II', 'Dodatki', 'Szlifiernia: wzór od 10. poziomu Jubilerstwa.'],
      ['Kieł', 'Tier III', 'Dodatki', 'Szlifiernia: wzór od 25. poziomu Jubilerstwa.'],
      ['Bursztyn', 'Tier IV', 'Dodatki', 'Szlifiernia: wzór od 50. poziomu Jubilerstwa.'],
      ['Róg tura', 'Tier V', 'Dodatki', 'Szlifiernia: wzór od 75. poziomu Jubilerstwa.'],
      ['Lunula', 'Tier VI', 'Dodatki', 'Szlifiernia: wzór od 100. poziomu Jubilerstwa.'],
      ['Grzywna', 'Tier VII', 'Dodatki', 'Szlifiernia: wzór od 125. poziomu Jubilerstwa.'],
      ['Kamień Alatyr', 'Tier VIII', 'Dodatki', 'Szlifiernia: wzór od 150. poziomu Jubilerstwa.'],
    ]);
    // A jewel's card names the same Tier, and no Warsztat base says Szlifiernia.
    for (const base of jewelBases(content)) {
      const item = generateItem({ baseId: base.id, rarityId: 'common', level: 60 }, createRng(base.id), content);
      assert.equal(itemView(item, content).tier, tierOf.get(base.id).name, base.id);
    }
    const others = items.tiers.flatMap((tier) => tier.entries).filter((entry) => !jewelBases(content).some((base) => base.id === entry.id));
    assert.ok(others.every((entry) => !entry.sources.some((line) => line.startsWith('Szlifiernia'))));
  });

  // The author's 572 ("koniecznie"): the narrator's quests know Górnictwo
  // and Jubilerstwo.
  test('narrator quests ask for minerals and jewels only once their profession is open, and count them', () => {
    const character = newCharacter('warrior', { level: 30 });
    const drawn = (openProfessions, periodId) =>
      Array.from({ length: 60 }, (_, index) => drawQuests(periodId, { character, hasTable: true, hasProfessions: true, hasCrafting: true, openProfessions, seed: `m${index}` }, content)).flat();
    for (const periodId of ['daily', 'weekly']) assert.ok(!drawn(['herbalism', 'alchemy', 'crafting'], periodId).some((quest) => ['mineAny', 'jewelAny'].includes(quest.kind)));
    const daily = drawn(['herbalism', 'alchemy', 'crafting', 'mining', 'jewelcrafting'], 'daily');
    const mine = daily.find((quest) => quest.kind === 'mineAny');
    const jewel = daily.find((quest) => quest.kind === 'jewelAny');
    assert.deepEqual([questText(mine, content), questText(jewel, content)], ['Wydobądź łącznie 12 minerałów.', 'Wykonaj łącznie 2 sztuki biżuterii.']);
    assert.ok(drawn(['mining', 'jewelcrafting'], 'weekly').some((quest) => quest.kind === 'mineAny'));
    const quests = {
      daily: { period: 'd', chest: false, quests: [{ kind: 'mineAny', count: 12, progress: 0, claimed: false }, { kind: 'jewelAny', count: 2, progress: 1, claimed: false }] },
      weekly: { period: 'w', chest: false, quests: [] },
    };
    const moved = addQuestProgress(quests, { minerals: 5, jewels: 3 });
    assert.deepEqual(moved.daily.quests.map((quest) => quest.progress), [5, 2]);
  });

  test('the end of a digging and of a work in the Szlifiernia come as phone notifications', () => {
    const due = notificationsDue(
      { level: 30, activity: { kind: 'minerals', endsAt: 1000 }, avatarActivity: { kind: 'jewels', endsAt: 2000 }, buildings: {}, queue: [] },
      0,
      3000,
      content,
    );
    assert.deepEqual(
      due.map(({ tag, url, title, body }) => [tag, url, title, body]),
      [
        ['minerals', '#/profesje/gornictwo', 'Koniec kopania', 'Kopanie zakończone: Systemowa Kopalnia. Raport czeka na odbiór.'],
        ['avatar-jewels', '#/profesje/jubilerstwo', 'Praca Awatara Systemu zakończona', 'Praca zakończona: Systemowa Szlifiernia. Raport czeka na odbiór.'],
      ],
    );
  });
});

describe('Jubilerstwo in the engine', () => {
  test('rings, amulets and talismans, the first of each family at once and the later ones from 10, 25, 50, 75, 100, 125 and 150; the Warsztat makes none of them', () => {
    assert.deepEqual(knownJewelPatterns(1, [], content).map((base) => base.id), ['amulet', 'ring', 'talisman']);
    assert.equal(knownJewelPatterns(10, [], content).length, 6);
    assert.ok(knownJewelPatterns(25, [], content).some((base) => base.id === 'band-ring'));
    assert.equal(knownJewelPatterns(50, [], content).length, 12);
    assert.equal(knownJewelPatterns(75, [], content).length, 15);
    // Tier VI (665): the Kamea, the Pierścień wieczności and the Lunula at
    // the 100th level, or earlier when taken apart.
    assert.equal(knownJewelPatterns(99, [], content).length, 15);
    const at100 = knownJewelPatterns(100, [], content).map((base) => base.id);
    assert.deepEqual([at100.length, ['cameo', 'eternity-ring', 'lunula'].every((id) => at100.includes(id))], [18, true]);
    assert.ok(knownJewelPatterns(99, ['lunula'], content).some((base) => base.id === 'lunula'));
    const reportOf = {
      base: content.basesById.ring,
      rarityId: 'common',
      results: [],
      learned: [],
      minutes: 30,
      startedAt: 0,
      endsAt: 1,
      seed: 'r',
      stopped: false,
      before: { level: 99, xp: 0 },
      after: { level: 100, xp: 0 },
      character: { level: 130 },
      xp: 0,
      work: { level: 130, timePoints: 0, messages: [] },
    };
    const report = jewelReport(reportOf, content);
    assert.deepEqual(report.revealed, ['cameo', 'eternity-ring', 'lunula']);
    // Tier VII (814): the Pektorał, the Pierścień przodków and the Grzywna at
    // the 125th level, which Jubilerstwo reaches since it goes on to the
    // 200th (825), or earlier when taken apart.
    assert.equal(knownJewelPatterns(124, [], content).length, 18);
    const at125 = knownJewelPatterns(125, [], content).map((base) => base.id);
    assert.deepEqual([at125.length, ['pectoral', 'ancestors-ring', 'grzywna'].every((id) => at125.includes(id))], [21, true]);
    assert.equal(content.professionsById[content.jewelcrafting.profession].maxLevel, 200);
    // Tier VIII (949) at the 150th.
    assert.equal(knownJewelPatterns(149, [], content).length, 21);
    const at150 = knownJewelPatterns(150, [], content).map((base) => base.id);
    assert.deepEqual([at150.length, ['ryngraf', 'solomon-ring', 'alatyr'].every((id) => at150.includes(id))], [24, true]);
    assert.equal(knownJewelPatterns(200, [], content).length, 24);
    const seventh = jewelReport({ ...reportOf, before: { level: 124, xp: 0 }, after: { level: 125, xp: 0 } }, content);
    assert.deepEqual(seventh.revealed, ['pectoral', 'ancestors-ring', 'grzywna']);
    assert.ok(seventh.system.includes('Osiągnięto poziom Jubilerstwa: 125'), seventh.system.join(' | '));
    assert.ok(knownJewelPatterns(100, ['grzywna'], content).some((base) => base.id === 'grzywna'));
    assert.ok(jewelBases(content).every((base) => !content.workshop.parts[base.slot]));
  });

  // The author: "Rozbieranie przedmiotów jak pierścienie czy talizmany też
  // powinny dawać dostępy do wyższych tierów jeśli chodzi o jubilerstwo tak
  // jak w Rzemiośle jest" (3.11.2026).
  test('a jewel of a later pattern taken apart teaches it, as an item of the Warsztat does; a level does not reveal it again', () => {
    const jewelOf = (base) => ({ base, slot: content.basesById[base].slot, level: 30, rarity: 'common', affixes: [] });
    assert.equal(jewelPatternFrom(jewelOf('signet-ring'), [], content), 'signet-ring');
    assert.equal(jewelPatternFrom(jewelOf('amber-charm'), [], content), 'amber-charm');
    // Tier VII's too (814), the one way to them while Jubilerstwo ends at the 100th level.
    assert.equal(jewelPatternFrom(jewelOf('grzywna'), [], content), 'grzywna');
    // The first of a family is known from the start, a pattern once learned stays, and the Warsztat's items are the Warsztat's.
    assert.equal(jewelPatternFrom(jewelOf('ring'), [], content), null);
    assert.equal(jewelPatternFrom(jewelOf('signet-ring'), ['signet-ring'], content), null);
    assert.equal(jewelPatternFrom({ base: 'broadsword', slot: 'weapon', level: 30, rarity: 'common', affixes: [] }, [], content), null);
    assert.deepEqual(knownJewelPatterns(1, ['signet-ring'], content).map((base) => base.id), ['amulet', 'ring', 'signet-ring', 'talisman']);
    // At the 10th level the System reveals Kaptorga and Otoczak, not the Sygnet learned before.
    const report = jewelReport(
      {
        base: content.basesById.ring,
        rarityId: 'common',
        results: [],
        learned: ['signet-ring'],
        minutes: 30,
        startedAt: 0,
        endsAt: 1,
        seed: 'r',
        stopped: false,
        before: { level: 9, xp: 0 },
        after: { level: 10, xp: 0 },
        character: { level: 30 },
        xp: 0,
        work: { level: 30, timePoints: 0, messages: [] },
      },
      content,
    );
    assert.deepEqual(report.revealed, ['reliquary', 'holed-stone']);
  });

  test('a gem gives the rarity and an ore of its tier sets it: silver up to unique, gold for epic and legendary, star above', () => {
    assert.deepEqual(
      content.rarities.map((rarity) => [rarity.id, gemOf(rarity.id, content).id, oreOf(rarity.id, content).id]),
      [
        ['common', 'quartz', 'silver-ore'],
        ['rare', 'agate', 'silver-ore'],
        ['unique', 'amethyst', 'silver-ore'],
        ['epic', 'emerald', 'gold-ore'],
        ['legendary', 'sapphire', 'gold-ore'],
        ['mythic', 'ruby', 'star-ore'],
        ['divine', 'diamond', 'star-ore'],
      ],
    );
    assert.deepEqual(jewelCost(content.basesById.ring, 'epic', 2, content), { emerald: 2, 'gold-ore': 4 });
    assert.deepEqual(jewelCost(content.basesById.medallion, 'common', 1, content), { quartz: 1, 'silver-ore': 3 });
    assert.deepEqual(knownGems(24, content).map((gem) => gem.id), ['quartz', 'agate', 'amethyst']);
  });

  test('time and chance as in the Warsztat: 30 minutes for a common jewel, twice as long a rarity up, quicker with the level, and rarer ones may fail', () => {
    assert.equal(jewelMinutes('common', 1, content), 30);
    assert.equal(jewelMinutes('epic', 1, content), 240);
    assert.equal(jewelMinutes('common', 51, content), 15);
    assert.equal(jewelOrderMinutes(3, 'rare', 11, content), 162);
    assert.equal(jewelChance('common', 1, content), 1);
    assert.equal(jewelChance('rare', 5, content), 0.92);
    assert.equal(jewelChance('divine', 100, content), 0.595);
  });

  test('jewels have the character level and affixes named by the creatures met, and some fail', () => {
    const results = craftJewels({ baseId: 'amulet', rarityId: 'legendary', count: 20, level: 40, professionLevel: 40, met: ['wolf'], seed: 'j' }, content);
    const made = results.filter((result) => result.made);
    assert.ok(made.length > 0 && made.length < 20, String(made.length));
    for (const { item } of made) {
      assert.deepEqual([item.base, item.rarity, item.level, item.affixes.length], ['amulet', 'legendary', 40, 4]);
      assert.ok(item.affixes.every((affix) => affix.monster === 'wolf'));
    }
  });

  test('a set gem raises every number of the item by its percent, each by at least 1, and shows on its card', () => {
    assert.deepEqual(
      content.minerals.filter((mineral) => mineral.kind === 'gem').map((gem) => gem.setBonus),
      [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35],
    );
    const item = generateItem({ baseId: 'sword', level: 30, rarityId: 'epic' }, createRng('i'), content);
    const plain = upgradedItem(item, content);
    const diamond = upgradedItem({ ...item, gem: 'diamond' }, content);
    assert.equal(diamond.damage.min, plain.damage.min + Math.round(plain.damage.min * 0.35));
    assert.equal(diamond.damage.max, plain.damage.max + Math.round(plain.damage.max * 0.35));
    diamond.affixes.forEach((affix, index) => assert.equal(affix.value, plain.affixes[index].value + Math.max(1, Math.round(plain.affixes[index].value * 0.35))));
    // A small number grows by 1 at least, and on top of an upgrade.
    const ring = { base: 'ring', slot: 'ring', level: 1, rarity: 'common', affixes: [], implicit: { stat: 'perception', value: 2 } };
    assert.equal(upgradedItem({ ...ring, gem: 'quartz' }, content).implicit.value, 3);
    assert.equal(upgradedItem({ ...ring, upgrade: 5, gem: 'quartz' }, content).implicit.value, upgradedItem({ ...ring, upgrade: 5 }, content).implicit.value + 1);
    assert.notDeepEqual(itemProperties({ ...item, gem: 'emerald' }, content), itemProperties(item, content));
    assert.deepEqual(itemView({ ...item, gem: 'emerald' }, content).gem, {
      id: 'emerald',
      name: 'Szmaragd',
      bonus: 0.2,
      color: content.raritiesById.epic.color,
      line: 'Szmaragd: +20% do wszystkich wartości',
      help: 'Kamień oprawiony w Szlifierni podnosi o 20% każdą wartość tego przedmiotu: obrażenia, pancerz i każdą cechę z listy, każdą co najmniej o 1. Wartości w kolorze kamienia już to uwzględniają.',
    });
    assert.equal(itemView(item, content).gem, undefined);
    // A gem the game no longer has adds nothing.
    assert.deepEqual(upgradedItem({ ...item, gem: 'nothing' }, content).damage, plain.damage);
  });

  // 906 B (the author: „Niech pokazują itemki bazowe statystyki i obok w
  // kolorze oprawionego kamienia zmienione statystyki”): the card writes each
  // number without the gem and beside it, in brackets, the number with it.
  test("an item's card has each number without its gem and with it, cut where the number ends", () => {
    const sword = {
      base: 'sword',
      slot: 'weapon',
      level: 30,
      rarity: 'rare',
      damage: { min: 20, max: 31 },
      affixes: [
        { stat: 'strength', value: 4 },
        { stat: 'resist.fire', value: 30 },
      ],
      gem: 'agate',
    };
    // The damage's range with its kind after it, a stat whose 10% rounds to
    // nothing and so grows by 1, and a resistance.
    assert.deepEqual(gemProperties(sword, content), [
      { text: 'Obrażenia: 20–31', gem: '22–34', rest: ' (fizyczne)' },
      { text: 'Siła: +4', gem: '+5', rest: '' },
      { text: 'Odporność na ogień: +30', gem: '+33', rest: '' },
    ]);
    // Read without the gem, the lines are the card's without it; the numbers
    // with it are those itemProperties gives, which short lists keep.
    const pairs = gemProperties(sword, content);
    assert.deepEqual(
      pairs.map(({ text, rest }) => text + rest),
      itemProperties({ ...sword, gem: undefined }, content),
    );
    assert.deepEqual(itemProperties(sword, content), ['Obrażenia: 22–34 (fizyczne)', 'Siła: +5', 'Odporność na ogień: +33']);
    // On top of an upgrade from the Kowadło: the gem raises the upgraded
    // numbers, as the fights count them (upgradedItem).
    assert.deepEqual(gemProperties({ ...sword, upgrade: 5 }, content), [
      { text: 'Obrażenia: 26–40', gem: '29–44', rest: ' (fizyczne)' },
      { text: 'Siła: +5', gem: '+6', rest: '' },
      { text: 'Odporność na ogień: +39', gem: '+43', rest: '' },
    ]);
    // A magical weapon's damage, with its element after the range.
    const staff = { base: 'staff', slot: 'weapon', level: 3, rarity: 'common', element: 'frost', damage: { min: 9, max: 14 }, affixes: [], gem: 'quartz' };
    assert.deepEqual(gemProperties(staff, content), [{ text: 'Obrażenia: 9–14', gem: '10–15', rest: ' (magiczne, mróz)' }]);
    // The armor an upgrade gives a talisman, after its stats; the
    // Zaklinaczka's zaklęcie żywiołu, which no gem raises, stays as it is.
    const talisman = { base: 'talisman', slot: 'talisman', level: 1, rarity: 'common', affixes: [], implicit: { stat: 'vitality', value: 2 }, upgrade: 2, gem: 'quartz' };
    assert.deepEqual(gemProperties(talisman, content), [
      { text: 'Witalność: +2', gem: '+3', rest: '' },
      { text: 'Pancerz: +2', gem: '+3', rest: '' },
    ]);
    assert.deepEqual(gemProperties({ ...sword, imbue: { element: 'fire', share: 0.2 } }, content).at(-1), { text: 'Zaklęcie żywiołu: 20% obrażeń jako ogień', gem: null, rest: '' });
    // The card gets the lines with the gem only, beside the gem itself; a
    // gem the game no longer has adds nothing and shows nothing.
    assert.deepEqual(itemView(sword, content).gemProperties, pairs);
    assert.equal('gemProperties' in itemView({ ...sword, gem: undefined }, content), false);
    assert.equal('gemProperties' in itemView({ ...sword, gem: 'nothing' }, content), false);
    // In English, as the English card writes its lines.
    const english = contentIn('en');
    assert.deepEqual(gemProperties(sword, english)[0], { text: 'Damage: 20–31', gem: '22–34', rest: ' (physical)' });
    assert.match(itemView(sword, english).gem.help, /The values in the stone's colour already include it\.$/);
  });

  test('an item with a gem is kept as an upgraded one when the bag overflows', () => {
    const plain = { base: 'ring', slot: 'ring', level: 30, rarity: 'common', affixes: [] };
    assert.deepEqual(bagOverflow([{ ...plain, id: 1, gem: 'quartz' }, { ...plain, id: 2 }], 1, 'warrior', content), [1]);
  });

  test('setting takes 15 minutes for Kwarc, twice as long a rarity up, quicker with the level', () => {
    assert.deepEqual(['quartz', 'agate', 'emerald'].map((gem) => setMinutes(gem, 1, content)), [15, 30, 120]);
    assert.equal(setMinutes('diamond', 80, content), 480);
    assert.equal(setMinutes('quartz', 11, content), 14);
  });

  test('a weaker gem never takes the place of a stronger one, a stronger one does (the author, 13.11.2026)', () => {
    assert.equal(weakerGem('quartz', 'agate', content), true);
    assert.equal(weakerGem('ruby', 'diamond', content), true);
    assert.equal(weakerGem('agate', 'quartz', content), false);
    assert.equal(weakerGem('diamond', 'ruby', content), false);
    // An empty item, or one with a gem the data no longer knows, takes any.
    assert.equal(weakerGem('quartz', null, content), false);
    assert.equal(weakerGem('quartz', 'nothing', content), false);
  });

  test('przemiana: ten gems give one a rarity up, at once, only into a gem the System shows (913, the author 13.11.2026)', () => {
    assert.equal(content.jewelcrafting.transmute.cost, 10);
    assert.deepEqual(
      ['quartz', 'agate', 'amethyst', 'emerald', 'sapphire', 'ruby', 'diamond'].map((id) => nextGem(id, content)?.id ?? null),
      ['agate', 'amethyst', 'emerald', 'sapphire', 'ruby', 'diamond', null],
    );
    assert.equal(nextGem('silver-ore', content), null);
    // Agat shows from the 5th level of Jubilerstwo, Diament has none above.
    assert.equal(transmuteBlock({ gemId: 'quartz', count: 1, have: 10, level: 4 }, content).code, 'locked');
    assert.equal(transmuteBlock({ gemId: 'quartz', count: 1, have: 10, level: 5 }, content), null);
    assert.equal(transmuteBlock({ gemId: 'quartz', count: 2, have: 19, level: 5 }, content).message, 'Brakuje: Kwarc (potrzeba 20).');
    assert.equal(transmuteBlock({ gemId: 'quartz', count: 0, have: 19, level: 5 }, content).code, 'invalid_count');
    assert.equal(transmuteBlock({ gemId: 'quartz', count: 1.5, have: 19, level: 5 }, content).code, 'invalid_count');
    assert.equal(transmuteBlock({ gemId: 'diamond', count: 1, have: 10, level: 200 }, content).code, 'top_gem');
    assert.equal(transmuteBlock({ gemId: 'silver-ore', count: 1, have: 10, level: 200 }, content).code, 'unknown_gem');
    assert.deepEqual(transmuteGems({ quartz: 23, agate: 1 }, 'quartz', 2, content), { quartz: 3, agate: 3 });
    assert.deepEqual(transmuteGems({ quartz: 20 }, 'quartz', 2, content), { agate: 2 });
  });

  test('the report of a setting names the gem, the item and the gem it destroyed, or the gem that came back', () => {
    const work = { level: 30, timePoints: 0, messages: [] };
    const base = { minutes: 15, startedAt: 0, endsAt: 900000, seed: 's', before: { level: 1, xp: 0 }, after: { level: 1, xp: 15 }, character: { level: 30 }, xp: 5, work };
    const item = { base: 'ring', slot: 'ring', level: 30, rarity: 'common', affixes: [], implicit: { stat: 'perception', value: 9 }, gem: 'agate' };
    const set = jewelReport({ ...base, set: { gem: 'agate', item, replaced: 'quartz' } }, content);
    assert.equal(set.kind, 'jewels');
    assert.equal(set.set.text, 'Agat tkwi teraz w przedmiocie: Pierścień.');
    assert.equal(set.set.replaced, 'Poprzedni kamień, Kwarc, rozpadł się przy oprawianiu.');
    assert.equal(set.set.item.gem.name, 'Agat');
    const missing = jewelReport({ ...base, set: { gem: 'agate', item: null, replaced: null } }, content);
    assert.equal(missing.set.text, 'Tego przedmiotu już nie ma. Kamień wrócił do plecaka: Agat.');
    assert.equal(missing.set.item, null);
    // The Rdzeń has a line of its own (the code review, 13.11.2026: "…
    // tkwi teraz w przedmiocie: Rdzeń.").
    const core = jewelReport({ ...base, set: { gem: 'agate', core: true, replaced: 'quartz' } }, content);
    assert.equal(core.set.text, 'Agat tkwi teraz w Rdzeniu.');
    assert.equal(core.set.replaced, 'Poprzedni kamień, Kwarc, rozpadł się przy oprawianiu.');
    assert.equal(core.set.core, true);
  });
});

describe('Górnictwo and Jubilerstwo through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('gornik'));
    await call('POST', '/api/character', { cookie, body: { name: 'Gornik', classId: 'warrior', appearance: 'male' } });
    await (await db()).prepare('UPDATE characters SET level = 25, xp = 0').run();
  });

  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  // Moves the current work `minutes` into the past.
  const age = async (minutes, table = 'activities') =>
    (await db()).prepare(`UPDATE ${table} SET started_at = started_at - ?, ends_at = ends_at - ?`).bind(minutes * 60000, minutes * 60000).run();
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const mine = (body) => call('POST', '/api/professions/mine', { cookie, body });
  const jewel = (body) => call('POST', '/api/professions/jewel', { cookie, body });
  const claim = () => call('POST', '/api/hunts/claim', { cookie });
  const minerals = (view) => Object.fromEntries(view.minerals.map((mineral) => [mineral.id, mineral.count]));

  test('both open at level 25, their squares locked before it, with the System message', async () => {
    await set('level = 24');
    const before = await character();
    assert.deepEqual(
      before.professions.list.filter((profession) => ['mining', 'jewelcrafting'].includes(profession.id)).map((profession) => [profession.name, profession.locked, profession.unlockLevel]),
      [
        ['Górnictwo', true, 25],
        ['Jubilerstwo', true, 25],
      ],
    );
    assert.deepEqual(before.professions.rows, [['herbalism', 'mining'], ['alchemy', 'jewelcrafting'], ['crafting']]);
    assert.equal(before.professions.mining, null);
    const locked = await mine({ minutes: 60 });
    assert.deepEqual([locked.status, locked.data.error.message], [403, 'Górnictwo odblokujesz na poziomie postaci 25.']);
    assert.equal((await jewel({ baseId: 'ring', rarity: 'common', count: 1 })).status, 403);
    await set('level = 25');
    const { mining, jewelcrafting } = (await character()).professions;
    assert.equal(mining.place.name, 'Systemowa Kopalnia');
    assert.equal(mining.goldPerHour, 170);
    assert.deepEqual(mining.minerals.filter((mineral) => !mineral.hidden).map((mineral) => mineral.name), ['Kwarc', 'Srebrny kruszec']);
    assert.equal(mining.minerals.find((mineral) => mineral.id === 'agate').hint, 'Ukryte przez System do 5. poziomu Górnictwa.');
    assert.equal(mining.about[0].includes('2% więcej urobku'), true);
    assert.equal(jewelcrafting.place.name, 'Systemowa Szlifiernia');
    assert.deepEqual(jewelcrafting.slots.map((slot) => [slot.name, slot.ores]), [
      ['Pierścień', 2],
      ['Amulet', 3],
      ['Talizman', 3],
    ]);
    assert.deepEqual(jewelcrafting.gems.filter((gem) => !gem.hidden).map((gem) => [gem.name, gem.bonus, gem.minutes]), [['Kwarc', 0.05, 15]]);
  });

  test('a digging: the character rests, and the report brings minerals, the veins\' gold, XP and levels', async () => {
    await set('hp = 1, gold = 0');
    assert.equal((await mine({ minutes: 45 })).data.error.code, 'invalid_duration');
    const started = await mine({ minutes: 480 });
    assert.equal(started.status, 201);
    const { activity } = started.data.character;
    assert.deepEqual([activity.kind, activity.placeName, activity.profession], ['minerals', 'Systemowa Kopalnia', 'mining']);
    assert.ok(started.data.character.regen, 'HP keeps coming back while digging');
    const hunt = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 1 } });
    assert.deepEqual([hunt.status, hunt.data.error.message], [409, 'Postać kopie w Kopalni. Poczekaj na koniec kopania.']);
    await age(480);
    // The hours of digging pass for resting too.
    await set('hp_at = hp_at - 9000000');
    const claimed = await claim();
    assert.equal(claimed.status, 200);
    const { report, character: after } = claimed.data;
    assert.equal(report.kind, 'minerals');
    assert.ok(report.minerals.some((mineral) => mineral.id === 'quartz'));
    assert.ok(report.gold > 0 && report.veins > 0);
    assert.equal(after.gold, report.gold);
    assert.deepEqual(minerals(after), Object.fromEntries(report.minerals.map((mineral) => [mineral.id, mineral.count])));
    // Minerals take no room in the bag.
    assert.equal(after.bagUsed, 0);
    // 480 minutes of work: 30 + 60 + 90 + 120 + 150 to level 6.
    assert.equal(report.profession.levelAfter, 6);
    assert.equal(after.stats.find((stat) => stat.id === 'vitality').sources.professions, 5 * content.professionsById.mining.statPerLevel);
    assert.equal(after.stats.find((stat) => stat.id === 'endurance').sources.professions, 5 * content.professionsById.mining.statPerLevel);
    assert.ok(after.hp > 1);
    const { data } = await call('GET', '/api/reports', { cookie });
    assert.equal(data.reports[0].kind, 'minerals');
    assert.equal(data.reports[0].gold, report.gold);
    assert.equal((await claim()).status, 409);
  });

  // The code review, 13.11.2026: the start saved the HP rested so far with
  // no check that the character was still as read, so a healing potion
  // drunk at the same moment (or an Awatar's level that heals) was undone.
  // Here the potion lands right after the request read the character, at
  // its first write (the Encyklopedia's record, settleDiscoveries).
  test('a healing potion drunk while a digging starts is not undone', async () => {
    const database = await db();
    // A herb in the bag the Encyklopedia has not written down yet: the
    // request writes it down first, before the start.
    await database.prepare(`UPDATE characters SET hp = 1, hp_at = ?, herbs = '{"comfrey":1}', discovered = '{}'`).bind(Date.now()).run();
    await database
      .prepare(
        `CREATE TRIGGER drunk_meanwhile AFTER UPDATE OF discovered ON characters
         BEGIN
           UPDATE characters SET hp = 40, version = version + 1 WHERE id = NEW.id;
         END`,
      )
      .run();
    try {
      const raced = await mine({ minutes: 60 });
      assert.equal(raced.status, 409, JSON.stringify(raced.data));
      assert.equal(raced.data.error.code, 'character_changed');
    } finally {
      await database.prepare('DROP TRIGGER IF EXISTS drunk_meanwhile').run();
    }
    assert.equal((await database.prepare('SELECT hp FROM characters').first()).hp, 40);
    assert.equal(await database.prepare('SELECT 1 FROM activities').first(), null);
    // Tried again, it starts, with the HP the potion gave.
    assert.equal((await mine({ minutes: 60 })).status, 201);
    assert.ok((await database.prepare('SELECT hp FROM characters').first()).hp >= 40);
  });

  test('calling back early gives nothing; Time Points skip a digging; minerals sell to the scrapper or go away', async () => {
    await mine({ minutes: 60 });
    assert.equal((await call('POST', '/api/hunts/cancel', { cookie })).status, 200);
    const back = await character();
    assert.deepEqual([back.activity, back.minerals, back.professions.list.find((profession) => profession.id === 'mining').xp], [null, [], 0]);
    await mine({ minutes: 10 });
    const skipped = await call('POST', '/api/time/skip', { cookie, body: { target: 'activity' } });
    assert.equal(skipped.data.spent, 10);
    assert.equal((await claim()).data.report.kind, 'minerals');

    await set(`gold = 0, minerals = '{"quartz":5,"silver-ore":3}'`);
    const sold = await call('POST', '/api/minerals/sell', { cookie, body: { mineralId: 'quartz', count: 3 } });
    assert.deepEqual(sold.data.sold, { count: 3, gold: 6 });
    assert.deepEqual(minerals(sold.data.character), { quartz: 2, 'silver-ore': 3 });
    assert.equal((await call('POST', '/api/minerals/sell', { cookie, body: { mineralId: 'quartz', count: 3 } })).data.error.code, 'invalid_count');
    const thrown = await call('POST', '/api/minerals/discard', { cookie, body: { mineralId: 'silver-ore', count: 3 } });
    assert.deepEqual(minerals(thrown.data.character), { quartz: 2 });
    assert.equal((await call('POST', '/api/minerals/sell', { cookie, body: { mineralId: 'gold-ore', count: 1 } })).data.error.code, 'no_mineral');
  });

  test('the report of a digging moves the quest of minerals, and the jewels made move the quest of jewellery', async () => {
    const now = Date.now();
    const quest = (kind, count) => ({ kind, count, progress: 0, reward: { kind: 'gold', amount: 10 }, claimed: false });
    const period = (periodId, quests) => ({ period: questPeriod(periodId, now, content).key, chest: false, quests, ...(periodId === 'weekly' && { scaled: true }) });
    await set('quests = ?', JSON.stringify({ daily: period('daily', [quest('mineAny', 12), quest('jewelAny', 2)]), weekly: period('weekly', []) }));
    assert.equal((await mine({ minutes: 60 })).status, 201);
    await age(60);
    const dug = (await claim()).data;
    const found = dug.report.minerals.reduce((sum, mineral) => sum + mineral.count, 0);
    const progress = (view, kind) => view.quests.daily.quests.find((one) => one.kind === kind).progress;
    assert.equal(progress(dug.character, 'mineAny'), Math.min(12, found));
    await set(`minerals = '{"quartz":2,"silver-ore":4}'`);
    assert.equal((await jewel({ baseId: 'ring', rarity: 'common', count: 2 })).status, 201);
    await age(60);
    const made = (await claim()).data;
    assert.equal(made.report.items.length, 2);
    assert.equal(progress(made.character, 'jewelAny'), 2);
  });

  test('an order of jewels takes the gems and the ore at once and brings the jewels at the character level; stopped early, the rest comes back', async () => {
    await set(`minerals = '{"quartz":3,"silver-ore":5}'`);
    assert.equal((await jewel({ baseId: 'signet-ring', rarity: 'common', count: 1 })).data.error.code, 'unknown_pattern');
    assert.equal((await jewel({ baseId: 'ring', rarity: 'rare', count: 1 })).data.error.code, 'unknown_rarity');
    assert.equal((await jewel({ baseId: 'ring', rarity: 'common', count: 3 })).data.error.code, 'no_minerals');
    const started = await jewel({ baseId: 'ring', rarity: 'common', count: 2 });
    assert.equal(started.status, 201);
    assert.deepEqual(minerals(started.data.character), { quartz: 1, 'silver-ore': 1 });
    assert.deepEqual([started.data.character.activity.kind, started.data.character.activity.minutes, started.data.character.activity.count], ['jewels', 60, 2]);
    await age(60);
    const { report, character: after } = (await claim()).data;
    assert.equal(report.kind, 'jewels');
    assert.deepEqual(report.items.map((item) => [item.base, item.rarity, item.level]), [
      ['ring', 'common', 25],
      ['ring', 'common', 25],
    ]);
    assert.equal(report.made, 'Wykonano: 2 × Pierścień.');
    // The jewels wait in the Przechowalnia, out of the bag (842).
    assert.equal(report.stored, 'Gotowa biżuteria czeka w Przechowalni, poza plecakiem.');
    assert.equal(after.bag.length, 0);
    assert.deepEqual(after.professions.storage.items.map((item) => item.base), ['ring', 'ring']);

    // Stopped after the first of two: one ring, and the gem and the ore of the other back.
    await set(`minerals = '{"quartz":2,"silver-ore":4}'`);
    await jewel({ baseId: 'ring', rarity: 'common', count: 2 });
    await age(35);
    const stopped = await call('POST', '/api/hunts/cancel', { cookie });
    assert.equal(stopped.data.report.items.length, 1);
    assert.deepEqual(minerals(stopped.data.character), { quartz: 1, 'silver-ore': 2 });
  });

  test('taking a Sygnet apart teaches its pattern in the Szlifiernia before the 10th level, and the card and the Warsztat say where', async () => {
    const database = await db();
    await database
      .prepare(
        "INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) SELECT id, 'craft-table', 1, 0, 1 FROM characters WHERE true ON CONFLICT (character_id, building_id) DO UPDATE SET level = excluded.level",
      )
      .run();
    const addItem = async (item) =>
      (await database.prepare('INSERT INTO items (character_id, slot, data, created_at) SELECT id, NULL, ?, 0 FROM characters').bind(JSON.stringify(item)).run()).meta.last_row_id;
    const signet = await addItem({ base: 'signet-ring', slot: 'ring', level: 25, rarity: 'common', affixes: [] });
    const broadsword = await addItem({ base: 'broadsword', slot: 'weapon', level: 25, rarity: 'common', affixes: [], damage: { min: 6, max: 10 } });
    const card = (id, view) => view.bag.find((item) => item.id === id).salvage;
    const before = await character();
    assert.deepEqual([card(signet, before).pattern, card(signet, before).patternAt], ['Sygnet', 'w Szlifierni']);
    assert.deepEqual([card(broadsword, before).pattern, card(broadsword, before).patternAt], ['Pałasz', 'w Warsztacie']);
    await set(`minerals = '{"quartz":1,"silver-ore":2}'`);
    assert.equal((await jewel({ baseId: 'signet-ring', rarity: 'common', count: 1 })).data.error.code, 'unknown_pattern');

    // Both at once: each pattern where it is used.
    const { status, data } = await call('POST', '/api/items/salvage', { cookie, body: { ids: [signet, broadsword] } });
    assert.equal(status, 200);
    assert.deepEqual(data.salvaged.patterns, [
      { name: 'Sygnet', at: 'w Szlifierni' },
      { name: 'Pałasz', at: 'w Warsztacie' },
    ]);
    const slots = data.character.professions.jewelcrafting.slots;
    const sygnet = slots.find((slot) => slot.id === 'ring').patterns.find((pattern) => pattern.id === 'signet-ring');
    assert.deepEqual([sygnet.name, sygnet.learned, sygnet.hidden], ['Sygnet', true, undefined]);
    assert.equal(slots.find((slot) => slot.id === 'amulet').patterns.find((pattern) => pattern.id === 'reliquary').hidden, true);
    assert.equal((await jewel({ baseId: 'signet-ring', rarity: 'common', count: 1 })).status, 201);

    // Another Sygnet teaches nothing new.
    const again = await addItem({ base: 'signet-ring', slot: 'ring', level: 25, rarity: 'common', affixes: [] });
    assert.equal(card(again, await character()).pattern, undefined);
  });

  test('a gem is set in a worn item at the end of the work, raising its numbers; a new gem destroys the old, and an item gone gives the gem back', async () => {
    await set(`minerals = '{"quartz":3}'`);
    // A sword worn and a ring in the bag.
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    const sword = generateItem({ baseId: 'sword', level: 25, rarityId: 'rare' }, createRng('sword'), content);
    await database.prepare("INSERT INTO items (character_id, slot, data, created_at) VALUES (?, 'weapon', ?, 0)").bind(id, JSON.stringify(sword)).run();
    await database.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)').bind(id, JSON.stringify({ base: 'ring', slot: 'ring', level: 25, rarity: 'common', affixes: [], implicit: { stat: 'perception', value: 5 } })).run();
    const { equipment } = await character();
    const weapon = equipment.weapon;
    assert.equal((await jewel({ set: true, itemId: weapon.id, gem: 'agate' })).data.error.code, 'locked');
    const started = await jewel({ set: true, itemId: weapon.id, gem: 'quartz' });
    assert.equal(started.status, 201);
    assert.deepEqual(started.data.character.activity.set, { gem: 'Kwarc', item: weapon.name });
    assert.equal(started.data.character.activity.minutes, 15);
    await age(15);
    const { report, character: after } = (await claim()).data;
    assert.equal(report.set.text, `Kwarc tkwi teraz w przedmiocie: ${weapon.name}.`);
    assert.equal(report.set.replaced, null);
    const worn = after.equipment.weapon;
    assert.deepEqual(worn.gem, {
      id: 'quartz',
      name: 'Kwarc',
      bonus: 0.05,
      color: '#9b9b9b',
      line: 'Kwarc: +5% do wszystkich wartości',
      help: 'Kamień oprawiony w Szlifierni podnosi o 5% każdą wartość tego przedmiotu: obrażenia, pancerz i każdą cechę z listy, każdą co najmniej o 1. Wartości w kolorze kamienia już to uwzględniają.',
    });
    assert.notDeepEqual(worn.properties, weapon.properties);
    assert.equal((await jewel({ set: true, itemId: weapon.id, gem: 'quartz' })).data.error.code, 'same_gem');

    // A new gem destroys the old one.
    await set(`minerals = '{"quartz":1,"agate":1}', professions = '{"jewelcrafting":{"level":5,"xp":0}}'`);
    await jewel({ set: true, itemId: weapon.id, gem: 'agate' });
    await age(30);
    const again = (await claim()).data;
    assert.equal(again.report.set.replaced, 'Poprzedni kamień, Kwarc, rozpadł się przy oprawianiu.');
    assert.equal(again.character.equipment.weapon.gem.id, 'agate');

    // A weaker gem never takes the place of a stronger one (the author, 13.11.2026).
    const weaker = await jewel({ set: true, itemId: weapon.id, gem: 'quartz' });
    assert.equal(weaker.status, 409);
    assert.equal(weaker.data.error.code, 'weaker_gem');
    assert.equal(weaker.data.error.message, 'W tym przedmiocie tkwi Agat. Oprawisz w nim tylko mocniejszy kamień.');
    assert.deepEqual(minerals(await character()), { quartz: 1 });

    // An item gone by the end gives its gem back, and called back early the gem comes back too.
    const ring = (await character()).bag[0];
    await jewel({ set: true, itemId: ring.id, gem: 'quartz' });
    await (await db()).prepare('DELETE FROM items WHERE id = ?').bind(ring.id).run();
    await age(15);
    const gone = (await claim()).data;
    assert.equal(gone.report.set.text, 'Tego przedmiotu już nie ma. Kamień wrócił do plecaka: Kwarc.');
    assert.deepEqual(minerals(gone.character), { quartz: 1 });
    await (await db()).prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)').bind(id, JSON.stringify({ base: 'ring', slot: 'ring', level: 25, rarity: 'common', affixes: [], implicit: { stat: 'perception', value: 5 } })).run();
    const fresh = (await character()).bag[0];
    assert.equal((await jewel({ set: true, itemId: fresh.id, gem: 'quartz' })).status, 201);
    assert.deepEqual(minerals(await character()), {});
    assert.equal((await call('POST', '/api/hunts/cancel', { cookie })).data.report, null);
    assert.deepEqual(minerals(await character()), { quartz: 1 });
  });

  test('przemiana through the API: 10 gems into 1 a rarity up at once, also while the character explores; refused when locked, short or the rarest (913)', async () => {
    await set(`minerals = '{"quartz":25,"silver-ore":4}'`);
    const transmute = (body) => call('POST', '/api/professions/transmute', { cookie, body });
    // Agat is hidden until the 5th level of Jubilerstwo.
    const locked = await transmute({ gem: 'quartz', count: 1 });
    assert.deepEqual([locked.status, locked.data.error.code, locked.data.error.message], [409, 'locked', 'Ukryte przez System do 5. poziomu Jubilerstwa.']);
    await set(`professions = '{"jewelcrafting":{"level":5,"xp":0}}'`);
    assert.equal((await character()).professions.jewelcrafting.transmute.cost, 10);
    const short = await transmute({ gem: 'quartz', count: 3 });
    assert.deepEqual([short.status, short.data.error.code, short.data.error.message], [409, 'no_minerals', 'Brakuje: Kwarc (potrzeba 30).']);
    assert.equal((await transmute({ gem: 'quartz', count: 0 })).status, 400);
    assert.equal((await transmute({ gem: 'silver-ore', count: 1 })).data.error.code, 'unknown_gem');
    // While the character explores, the bag's gems change all the same.
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30 } })).status, 201);
    const done = await transmute({ gem: 'quartz', count: 2 });
    assert.equal(done.status, 200);
    assert.deepEqual(done.data.transmuted, { from: 'quartz', to: 'agate', count: 2 });
    assert.deepEqual(minerals(done.data.character), { quartz: 5, agate: 2, 'silver-ore': 4 });
    // The rarest gem has nothing above it.
    await set(`minerals = '{"diamond":10}', professions = '{"jewelcrafting":{"level":200,"xp":0}}'`);
    assert.equal((await transmute({ gem: 'diamond', count: 1 })).data.error.code, 'top_gem');
  });

  test('two przemiany at once never use the same gems twice', async () => {
    await set(`minerals = '{"quartz":10}', professions = '{"jewelcrafting":{"level":5,"xp":0}}'`);
    const body = { gem: 'quartz', count: 1 };
    const answers = await Promise.all([call('POST', '/api/professions/transmute', { cookie, body }), call('POST', '/api/professions/transmute', { cookie, body })]);
    assert.deepEqual(answers.map((answer) => answer.status).sort(), [200, 409]);
    assert.deepEqual(minerals(await character()), { agate: 1 });
  });

  // A setting's report keeps its item's card as it was made, and the card
  // opens from the Dziennik when the item is no longer there as it was. One
  // from before 0.1.77 has the gem without its line and what it means, which
  // the card reads (the code review of 0.1.77: the line said "undefined").
  test("an older setting's report shows the gem's line and what it means, as the item's card reads them", async () => {
    await set(`minerals = '{"quartz":1}'`);
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    const sword = generateItem({ baseId: 'sword', level: 25, rarityId: 'rare' }, createRng('sword'), content);
    await database.prepare("INSERT INTO items (character_id, slot, data, created_at) VALUES (?, 'weapon', ?, 0)").bind(id, JSON.stringify(sword)).run();
    const weapon = (await character()).equipment.weapon;
    assert.equal((await jewel({ set: true, itemId: weapon.id, gem: 'quartz' })).status, 201);
    await age(15);
    const { report } = (await claim()).data;
    const shown = report.set.item.gem;
    assert.equal(shown.line, 'Kwarc: +5% do wszystkich wartości');
    // As a report from before 0.1.77 keeps it.
    await database.prepare("UPDATE reports SET data = json_remove(data, '$.set.item.gem.line', '$.set.item.gem.help') WHERE id = ?").bind(report.id).run();
    const again = (await call('GET', `/api/reports/${report.id}`, { cookie })).data.report;
    assert.deepEqual(again.set.item.gem, shown);
  });

  test('one setting of an item at a time, and a worn item takes the Awatar\'s gem only after the exploration\'s report (the code review)', async () => {
    await set(`minerals = '{"quartz":3}', gold = 10000`);
    await call('POST', '/api/avatar/buy', { cookie });
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    const sword = generateItem({ baseId: 'sword', level: 25, rarityId: 'rare' }, createRng('sword'), content);
    await database.prepare("INSERT INTO items (character_id, slot, data, created_at) VALUES (?, 'weapon', ?, 0)").bind(id, JSON.stringify(sword)).run();
    const weapon = (await character()).equipment.weapon;
    // While the character sets a gem in the sword, the Awatar sets none in
    // it, and the other way round.
    assert.equal((await jewel({ set: true, itemId: weapon.id, gem: 'quartz' })).status, 201);
    assert.equal((await jewel({ set: true, itemId: weapon.id, gem: 'quartz', avatar: true })).data.error.code, 'setting_under_way');
    assert.equal((await call('POST', '/api/hunts/cancel', { cookie })).status, 200);
    assert.equal((await jewel({ set: true, itemId: weapon.id, gem: 'quartz', avatar: true })).status, 201);
    assert.equal((await jewel({ set: true, itemId: weapon.id, gem: 'quartz' })).data.error.code, 'setting_under_way');
    // The character sets out and the Awatar's work ends on the way: the worn
    // sword takes the gem only once the exploration's report is claimed.
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 1 } })).status, 201);
    await age(15, 'avatar_activities');
    const early = await call('POST', '/api/avatar/claim', { cookie });
    assert.equal(early.data.error.code, 'item_worn_exploring');
    assert.ok(!(await character()).equipment.weapon.gem);
    await age(1);
    assert.equal((await claim()).status, 200);
    const later = (await call('POST', '/api/avatar/claim', { cookie })).data;
    assert.equal(later.report.set.text, `Kwarc tkwi teraz w przedmiocie: ${weapon.name}.`);
    assert.equal(later.character.equipment.weapon.gem.id, 'quartz');
  });

  test('"Sprzedaj zbędne" keeps an item with a gem, as an upgraded one', async () => {
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    const ring = { base: 'ring', slot: 'ring', level: 25, rarity: 'common', affixes: [], implicit: { stat: 'perception', value: 5 } };
    for (const data of [ring, { ...ring, gem: 'quartz' }]) {
      await database.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)').bind(id, JSON.stringify(data)).run();
    }
    const sold = await call('POST', '/api/items/sell', { cookie, body: { maxRarity: 'divine' } });
    assert.equal(sold.data.sold.count, 1);
    assert.deepEqual(sold.data.character.bag.map((item) => item.gem?.id ?? null), ['quartz']);
  });

  test('the Awatar Systemu digs while the character explores and brings the minerals, the gold and a quarter of the XP and of the profession\'s progress (10.11.2026)', async () => {
    await set('gold = 10000');
    await call('POST', '/api/avatar/buy', { cookie });
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 1 } })).status, 201);
    const started = await mine({ minutes: 120, avatar: true });
    assert.equal(started.status, 201);
    assert.equal(started.data.character.professions.avatar.activity.kind, 'minerals');
    await age(120, 'avatar_activities');
    const claimed = await call('POST', '/api/avatar/claim', { cookie });
    const { report, character: after } = claimed.data;
    assert.equal(report.avatar, true);
    assert.equal(report.summary.xp, Math.round(workXp(25, 120, content) * content.avatar.share));
    assert.equal(after.gold, report.gold);
    assert.equal(after.professions.list.find((profession) => profession.id === 'mining').level, workProfession(content.professionsById.mining, { level: 1, xp: 0 }, Math.round(120 * content.avatar.share)).level);
    assert.ok(after.minerals.length > 0);
  });
});

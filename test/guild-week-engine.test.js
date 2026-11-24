// The engine of the guild's week (1198 A, 1200 A, 1202 A): the Bohaterowie
// tygodnia picked from a week's counts (the members of now only, of two with
// as much the one in the guild longer, nobody with nothing); the Krainy pod
// sztandarem's winners (the most minutes, of as many the older guild, none
// where nobody explored), the shares of a land's Sława by minutes, a guild's
// standing in each land (lead, alone, chase, the gap) and the banner's
// share more gold and materials from the creatures; and the Kram Gildii's
// rules (its goods, the slots of an item, why a purchase is refused) and its
// item, of the class's gear for the slot chosen, at the level, of a
// champion's rarity.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  heroName,
  heroReward,
  landOfArea,
  landRules,
  landShares,
  landStandings,
  landWinners,
  marksLeft,
  simulateHunt,
  stallBlock,
  stallGood,
  stallGoods,
  stallItem,
  stallSlots,
  weekHeroes,
} from '../src/engine/index.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';

describe('the Bohaterowie tygodnia (1198 A)', () => {
  const members = [
    { id: 7, joinedAt: 300 },
    { id: 3, joinedAt: 100 },
    { id: 5, joinedAt: 100 },
  ];

  test("each kind's best member of now, above nothing; of two with as much, the one in the guild longer, then the lower id", () => {
    const heroes = weekHeroes(
      {
        members,
        counts: {
          pillar: new Map([
            [7, 90],
            [3, 60],
            [99, 500],
          ]),
          slayer: new Map([
            [7, 1200],
            [5, 1200],
            [3, 1200],
          ]),
          benefactor: { 7: 12, 5: 12 },
        },
      },
      content,
    );
    assert.deepEqual(heroes, [
      // 99 has the most Sława but is no member now.
      { kind: 'pillar', characterId: 7, value: 90 },
      // Three with as much: 3 and 5 joined first, 3 has the lower id.
      { kind: 'slayer', characterId: 3, value: 1200 },
      // 5 joined before 7.
      { kind: 'benefactor', characterId: 5, value: 12 },
    ]);
  });

  test('nobody wins a kind with nothing, and nothing is no hero at all', () => {
    assert.deepEqual(weekHeroes({ members, counts: { pillar: new Map([[7, 0]]), slayer: new Map(), benefactor: {} } }, content), []);
    assert.deepEqual(weekHeroes({ members: [], counts: { pillar: new Map([[7, 40]]) } }, content), []);
  });

  test("the heroes' names for a man and a woman, and the reward", () => {
    assert.equal(heroName('pillar', 'male', content), 'Filar Gildii');
    assert.equal(heroName('slayer', 'male', content), 'Pogromca');
    assert.equal(heroName('slayer', 'female', content), 'Pogromczyni');
    assert.equal(heroName('benefactor', 'female', content), 'Dobroczyńczyni');
    assert.deepEqual(heroReward(content), { timePoints: 30, packs: 1 });
  });
});

describe('the Krainy pod sztandarem (1200 A)', () => {
  test('the lands of the Wyprawa Gildii, from Wiatrołomy to Podniebne Konary, and a place by its land', () => {
    assert.equal(content.regions.length, 17);
    assert.equal(content.regions[0].name, 'Wiatrołomy');
    assert.equal(content.regions.at(-1).name, 'Podniebne Konary');
    assert.equal(landOfArea('windfalls-edge', content), 'windfalls');
    assert.equal(landOfArea('no-such-place', content), null);
    assert.deepEqual(landRules(content), { fame: 30, bonus: 0.05 });
  });

  test('each land to the guild with the most minutes, of as many the older one (the lower id); no banner where nobody explored', () => {
    const banners = landWinners(
      [
        { landId: 'stone-glade', guildId: 4, minutes: 300 },
        { landId: 'windfalls', guildId: 4, minutes: 120 },
        { landId: 'windfalls', guildId: 2, minutes: 90 },
        { landId: 'windfalls', guildId: 2, minutes: 40 },
        { landId: 'backwaters', guildId: 9, minutes: 200 },
        { landId: 'backwaters', guildId: 3, minutes: 200 },
        { landId: 'peat-bogs', guildId: 1, minutes: 0 },
        { landId: 'no-such-land', guildId: 1, minutes: 999 },
      ],
      content,
    );
    // In the order of the lands; Wiatrołomy 130 to 120 for the guild 2.
    assert.deepEqual(banners, [
      { landId: 'windfalls', guildId: 2, minutes: 130 },
      { landId: 'stone-glade', guildId: 4, minutes: 300 },
      { landId: 'backwaters', guildId: 3, minutes: 200 },
    ]);
    assert.deepEqual(landWinners([], content), []);
  });

  test("a land's Sława split by the members' minutes, whole points only", () => {
    assert.deepEqual(
      landShares(
        30,
        new Map([
          [1, 100],
          [2, 50],
          [3, 5],
        ]),
      ),
      [
        { characterId: 1, points: 19 },
        { characterId: 2, points: 9 },
      ],
    );
    assert.deepEqual(landShares(30, new Map([[1, 60]])), [{ characterId: 1, points: 30 }]);
    assert.deepEqual(landShares(30, new Map()), []);
    assert.deepEqual(landShares(0, new Map([[1, 60]])), []);
  });

  test("a guild's standing in each land anyone explored: lead and by how much, alone, chase and how much is missing, a tie by age", () => {
    const rows = [
      { landId: 'windfalls', guildId: 2, minutes: 200 },
      { landId: 'windfalls', guildId: 5, minutes: 150 },
      { landId: 'stone-glade', guildId: 5, minutes: 80 },
      { landId: 'backwaters', guildId: 2, minutes: 40 },
      { landId: 'backwaters', guildId: 5, minutes: 100 },
      { landId: 'peat-bogs', guildId: 2, minutes: 60 },
      { landId: 'peat-bogs', guildId: 5, minutes: 60 },
      { landId: 'black-bog', guildId: 7, minutes: 30 },
    ];
    assert.deepEqual(landStandings(rows, 5, content), [
      { landId: 'windfalls', own: 150, rival: { guildId: 2, minutes: 200 }, state: 'chase', gap: 50 },
      { landId: 'stone-glade', own: 80, rival: null, state: 'alone', gap: 80 },
      { landId: 'backwaters', own: 100, rival: { guildId: 2, minutes: 40 }, state: 'lead', gap: 60 },
      // As many minutes: the older guild (2) wins, so 5 chases with no gap.
      { landId: 'peat-bogs', own: 60, rival: { guildId: 2, minutes: 60 }, state: 'chase', gap: 0 },
      // A land only another guild explored: chased from nothing.
      { landId: 'black-bog', own: 0, rival: { guildId: 7, minutes: 30 }, state: 'chase', gap: 30 },
    ]);
    // The older guild leads the tie, with no gap.
    assert.deepEqual(landStandings(rows, 2, content)[3], { landId: 'peat-bogs', own: 60, rival: { guildId: 5, minutes: 60 }, state: 'lead', gap: 0 });
  });

  test("an exploration under its guild's banner: about 5% more gold and materials from the creatures, the finds' gold as it was", () => {
    const { character, equipped } = typicalCharacter('warrior', 24, content);
    let gold = 0;
    let goldBanner = 0;
    let materials = 0;
    let materialsBanner = 0;
    const count = (hunt) => Object.values(hunt.materials).reduce((sum, one) => sum + one, 0);
    const fightGold = (hunt) => hunt.fights.reduce((sum, fight) => sum + fight.gold, 0);
    for (let index = 0; index < 60; index += 1) {
      const hunt = (banner) => simulateHunt({ character, equipped, hp: 99999, name: 'Mira', areaId: 'boar-thicket', minutes: 240, seed: `sztandar:${index}`, banner }, content);
      const plain = hunt(0);
      const raised = hunt(0.05);
      gold += fightGold(plain);
      goldBanner += fightGold(raised);
      materials += count(plain);
      materialsBanner += count(raised);
      // The first fight's first creature pays its share more on the dot.
      if (index === 0) assert.ok(raised.fights[0].gold >= plain.fights[0].gold);
    }
    const goldShare = goldBanner / gold;
    const materialShare = materialsBanner / materials;
    assert.ok(gold > 1000 && goldShare > 1.02 && goldShare < 1.08, `złoto ${gold} → ${goldBanner}`);
    assert.ok(materials > 50 && materialShare > 0.98 && materialShare < 1.15, `materiały ${materials} → ${materialsBanner}`);
    // No banner, no change: the same exploration.
    const again = simulateHunt({ character, equipped, hp: 99999, name: 'Mira', areaId: 'boar-thicket', minutes: 240, seed: 'sztandar:0' }, content);
    assert.deepEqual(again.gold, simulateHunt({ character, equipped, hp: 99999, name: 'Mira', areaId: 'boar-thicket', minutes: 240, seed: 'sztandar:0', banner: 0 }, content).gold);
  });

  test('from class level 250 the banner multiplies the halved rewards: 5% of the half, not of the whole', () => {
    const { character, equipped } = typicalCharacter('warrior', 24, content);
    const late = { ...character, classLevel: 260 };
    let gold = 0;
    let goldBanner = 0;
    for (let index = 0; index < 60; index += 1) {
      const hunt = (banner) => simulateHunt({ character: late, equipped, hp: 99999, name: 'Mira', areaId: 'boar-thicket', minutes: 240, seed: `pół:${index}`, banner }, content);
      gold += hunt(0).fights.reduce((sum, fight) => sum + fight.gold, 0);
      goldBanner += hunt(0.05).fights.reduce((sum, fight) => sum + fight.gold, 0);
    }
    const share = goldBanner / gold;
    assert.ok(gold > 300 && share > 1.02 && share < 1.08, `złoto ${gold} → ${goldBanner}`);
  });
});

describe('the Kram Gildii (1202 A)', () => {
  test('the goods, their prices and limits: a pack, a scroll and an item a week, the title and the frame once', () => {
    assert.deepEqual(
      stallGoods(content).map((good) => [good.id, good.price, good.weekly ?? null]),
      [
        ['pack', 50, 2],
        ['ward-scroll', 40, 2],
        ['item', 200, 1],
        ['title', 500, null],
        ['frame', 1000, null],
      ],
    );
    assert.equal(stallGood('title', content).achievement, 'banner-warden');
    assert.equal(stallGood('frame', content).cosmetic, 'frame-guild-banner');
    assert.equal(stallGood('nothing', content), null);
    assert.equal(stallGood(7, content), null);
  });

  test('the slots an item may be for: all but the Rdzeń, each with gear of the class', () => {
    for (const cls of content.classes) {
      assert.deepEqual(stallSlots(cls.id, content), ['head', 'amulet', 'chest', 'hands', 'feet', 'weapon', 'offhand', 'ring', 'talisman'], cls.id);
    }
  });

  test('why a purchase is refused, in order: an unknown good, owned, the limit, the slot, too few Znaki', () => {
    const ask = (over) => stallBlock({ id: 'pack', marks: 100, bought: 0, owned: false, key: 'warrior', ...over }, content);
    assert.equal(ask({}), null);
    assert.equal(ask({ id: 'nothing' }), 'unknown_good');
    assert.equal(ask({ id: 'frame', owned: true, marks: 0 }), 'owned');
    assert.equal(ask({ bought: 2 }), 'limit');
    assert.equal(ask({ bought: 1 }), null);
    assert.equal(ask({ id: 'title', bought: 1, marks: 900 }), 'limit');
    assert.equal(ask({ id: 'item', marks: 900 }), 'invalid_slot');
    assert.equal(ask({ id: 'item', marks: 900, slot: 'core' }), 'invalid_slot');
    assert.equal(ask({ id: 'item', marks: 900, slot: 'ring' }), null);
    assert.equal(ask({ id: 'item', marks: 199, slot: 'ring' }), 'too_few_marks');
    assert.equal(ask({ marks: 49 }), 'too_few_marks');
  });

  test('the Znaki left: credited and live, less those spent, never below none', () => {
    assert.equal(marksLeft({ earned: 120, live: 35, spent: 50 }), 105);
    assert.equal(marksLeft({ earned: 0, live: 10, spent: 50 }), 0);
  });

  test("the item: of the class's gear for the slot chosen, at the level, of a champion's rarity, the same for the same seed", () => {
    const rarities = new Set();
    for (const [classId, slot] of [
      ['warrior', 'weapon'],
      ['mage', 'offhand'],
      ['archer', 'chest'],
      ['cleric', 'head'],
      ['shadow', 'ring'],
    ]) {
      for (let index = 0; index < 10; index += 1) {
        const item = stallItem({ level: 80, key: classId, classLevel: 90, slot, seed: `kram:${classId}:${index}` }, content);
        assert.equal(item.slot, slot);
        assert.equal(item.level, 80);
        const classes = content.basesById[item.base].classes;
        assert.ok(!classes || classes.includes(classId), `${classId}: ${item.base}`);
        assert.ok((content.basesById[item.base].classLevel ?? 1) <= 90);
        rarities.add(item.rarity);
      }
    }
    // A champion's chest at the 80th level: no common item.
    assert.ok(!rarities.has('common'), [...rarities].join(', '));
    const a = stallItem({ level: 40, key: 'warrior', classLevel: 40, slot: 'feet', seed: 'ten sam' }, content);
    assert.deepEqual(stallItem({ level: 40, key: 'warrior', classLevel: 40, slot: 'feet', seed: 'ten sam' }, content), a);
    assert.equal(stallItem({ level: 40, key: 'warrior', classLevel: 40, slot: 'core', seed: 'x' }, content), null);
  });
});

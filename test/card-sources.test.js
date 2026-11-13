// Talia Systemu's cards from more sources in the engine (src/engine/cards.js,
// hunt.js, labyrinth.js; DECISIONS.md, "Karty z innymi graczami, z
// mieszkańcami Osady i z nowych źródeł", 902 B and 903): the lands below a
// place and the lands at a level or lower; a source's roll under its chance;
// the one picker of every source, a card not got yet first, never one at
// its top level nor one just given; a profession's chance by the hours of
// its work; a won fight of an exploration giving a card of a lower land,
// from the exploration's own seed of cards; and the creatures beaten in the
// Labirynt leaving their own cards, from the day's seed and the room.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  areaLand,
  cardComes,
  cardFrom,
  cardHomes,
  cardKind,
  cardsUpTo,
  createRng,
  labyrinthFight,
  lowerLandCards,
  newLabyrinth,
  pickCard,
  simulateHunt,
  workCardChance,
} from '../src/engine/index.js';
import { playerOf } from '../tools/difficulty-sim.mjs';
import { strongClimber } from './helpers/climb.js';
import { content } from './helpers/content.js';

const rules = content.cards;
const homes = cardHomes(content);
// A generator whose draws are `values`, one after another (the last one
// again once they run out), counting them (`drawn`).
function fakeRng(...values) {
  let index = 0;
  return {
    next: () => values[Math.min(index++, values.length - 1)],
    get drawn() {
      return index;
    },
  };
}
// The game's data with other chances of the cards.
const withDrops = (drops) => ({ ...content, cards: { ...rules, drops: { ...rules.drops, ...drops } } });

describe('Talia Systemu: the pickers of the cards from more sources (902 B, 903)', () => {
  test('the lands below a place: only cards of lower lands, none below the first', () => {
    const lands = new Set([...homes.values()].map((home) => home.land));
    assert.ok(lands.size >= 3);
    for (const region of content.regions) {
      for (const area of region.areas) {
        const land = areaLand(area.id, content);
        assert.ok(land >= 0, area.id);
        const lower = lowerLandCards(land, content);
        assert.ok(lower.every((id) => homes.get(id).land < land), area.id);
        assert.equal(lower.length, [...homes.values()].filter((home) => home.land < land).length, area.id);
      }
    }
    assert.deepEqual(lowerLandCards(areaLand('windfalls-edge', content), content), []);
    assert.ok(lowerLandCards(areaLand('reed-beds', content), content).length > 0);
    assert.equal(areaLand('nie-ma-takiego', content), -1);
  });

  test('the lands at a level or lower: every card whose home is at that level or below', () => {
    for (const level of [1, 30, 75, 150]) {
      const pool = cardsUpTo(level, content);
      assert.ok(pool.length > 0, String(level));
      assert.ok(pool.every((id) => homes.get(id).level <= level), String(level));
      assert.equal(pool.length, [...homes.values()].filter((home) => home.level <= level).length, String(level));
    }
    assert.deepEqual(cardsUpTo(0, content), []);
    // Elites and champions of those lands too: a random creature of them.
    assert.ok(cardsUpTo(50, content).some((id) => cardKind(id, content) !== 'ordinary'));
  });

  test('a source\'s roll comes under its chance: 0 never, 1 always', () => {
    assert.equal(cardComes(fakeRng(0.0099), 0.01), true);
    assert.equal(cardComes(fakeRng(0.01), 0.01), false);
    assert.equal(cardComes(fakeRng(0), 0), false);
    assert.equal(cardComes(fakeRng(0.9999999), 1), true);
    // The odds: about one in a hundred.
    const came = Array.from({ length: 20000 }, (_, index) => cardComes(createRng(`rzut:${index}`), rules.drops.lower)).filter(Boolean).length;
    assert.ok(came > 120 && came < 280, `${came}`);
  });

  test('the picker: a card not got yet first, all alike, then one got below its top level; never one at its top level nor one just given', () => {
    const pool = ['wolf', 'badger', 'squirrel', 'grass-snake', 'wisp'];
    // Not got yet: the first draw picks among them only.
    assert.equal(pickCard(pool, fakeRng(0), { owned: ['wolf', 'badger'] }), 'squirrel');
    assert.equal(pickCard(pool, fakeRng(0.99), { owned: ['wolf', 'badger'] }), 'wisp');
    const picked = new Set(Array.from({ length: 300 }, (_, index) => pickCard(pool, createRng(`wybór:${index}`), { owned: ['wolf', 'badger'] })));
    assert.deepEqual([...picked].sort(), ['grass-snake', 'squirrel', 'wisp']);
    // All got: those below their top level, none of those at it.
    const owned = new Set(Array.from({ length: 300 }, (_, index) => pickCard(pool, createRng(`wybór:${index}`), { owned: pool, maxed: ['wolf', 'wisp'] })));
    assert.deepEqual([...owned].sort(), ['badger', 'grass-snake', 'squirrel']);
    // One just given comes no more, even one not got: then one got.
    assert.equal(pickCard(pool, fakeRng(0.99), { owned: ['wolf', 'badger'], found: ['squirrel', 'grass-snake', 'wisp'] }), 'badger');
    // Nothing left: none.
    assert.equal(pickCard(pool, fakeRng(0.5), { owned: pool, maxed: pool }), null);
    assert.equal(pickCard([], fakeRng(0.5)), null);
    // One draw, whatever it picks.
    const rng = fakeRng(0.3);
    pickCard(pool, rng, { owned: pool, maxed: pool });
    assert.equal(rng.drawn, 1);
  });

  test('a source\'s roll and its card take two draws, whatever comes', () => {
    const pool = ['wolf', 'badger'];
    const missed = fakeRng(0.5, 0);
    assert.equal(cardFrom(pool, missed, { chance: 0.01 }), null);
    assert.equal(missed.drawn, 2);
    const hit = fakeRng(0.005, 0.9);
    assert.equal(cardFrom(pool, hit, { chance: 0.01, owned: [] }), 'badger');
    assert.equal(hit.drawn, 2);
    const none = fakeRng(0, 0);
    assert.equal(cardFrom(pool, none, { chance: 1, maxed: pool }), null);
    assert.equal(none.drawn, 2);
  });

  test('a profession\'s work: 1% for each hour it lasted, at most 10%', () => {
    assert.equal(rules.drops.professionPerHour, 0.01);
    assert.equal(rules.drops.professionMax, 0.1);
    assert.equal(workCardChance(60, content), 0.01);
    assert.equal(workCardChance(30, content), 0.005);
    assert.equal(workCardChance(240, content), 0.04);
    assert.equal(workCardChance(600, content), 0.1);
    assert.equal(workCardChance(1440, content), 0.1);
    assert.equal(workCardChance(0, content), 0);
    assert.equal(rules.drops.guild, 0.02);
    assert.equal(rules.drops.lower, 0.01);
  });
});

describe('Talia Systemu: a card of a lower land on an exploration (902 B)', () => {
  const { character, equipped } = playerOf('realistic', 'warrior', 60, content);
  const always = withDrops({ lower: 1 });
  const hunt = (cards, data = always, areaId = 'beaver-dams', seed = 'nizsze') => simulateHunt({ character, equipped, hp: 99999, name: 'Mira', areaId, minutes: 240, seed, cards }, data);
  const lowerLand = areaLand('beaver-dams', content);

  test('each fight won may give a card of a creature of a lower land, from the exploration\'s seed of cards: the rest goes as without it', () => {
    const plain = hunt(null);
    const found = hunt({ maxed: [], owned: [] });
    assert.equal(found.xp, plain.xp);
    assert.equal(found.gold, plain.gold);
    assert.deepEqual(found.items, plain.items);
    assert.deepEqual(found.materials, plain.materials);
    const won = found.fights.filter((fight) => fight.won === true).length;
    assert.ok(won > 0);
    // With the chance at 1, each fight won gave one, none twice.
    const lower = found.cards.filter((id) => homes.get(id).land < lowerLand);
    assert.equal(lower.length, won);
    assert.equal(new Set(found.cards).size, found.cards.length);
    // The report says so in the fight's lines.
    const name = content.monstersById[lower[0]].name;
    assert.ok(found.entries.some((entry) => entry.text.includes(`Wśród łupu leży karta stwora z niższej krainy: ${name}.`)));
    // The same seed, the same cards.
    assert.deepEqual(hunt({ maxed: [], owned: [] }).cards, found.cards);
  });

  test('a card not got yet first, then one got below its top level; none at its top level', () => {
    const pool = lowerLandCards(lowerLand, content);
    const missing = pool.slice(0, 3);
    const found = hunt({ owned: pool.filter((id) => !missing.includes(id)), maxed: pool.slice(3, 20) });
    const lower = found.cards.filter((id) => homes.get(id).land < lowerLand);
    assert.ok(lower.length > 3, String(lower.length));
    assert.deepEqual(lower.slice(0, 3).sort(), [...missing].sort());
    assert.ok(lower.slice(3).every((id) => pool.slice(20).includes(id)));
  });

  test('none in the first land, and none at the data\'s chance of nothing', () => {
    const first = hunt({ maxed: [], owned: [] }, always, 'boar-thicket');
    const beaten = new Set(first.fights.filter((fight) => fight.won === true).flatMap((fight) => fight.enemies.map((enemy) => enemy.monsterId)));
    assert.ok(first.cards.every((id) => beaten.has(id)));
    const never = hunt({ maxed: [], owned: [] }, withDrops({ lower: 0 }));
    assert.ok(never.cards.every((id) => homes.get(id).land === lowerLand));
  });
});

describe('Talia Systemu: the creatures beaten in the Labirynt leave their cards (903)', () => {
  const { character, equipped } = strongClimber();
  const day = '2026-11-13';
  const state = (seed = 'dzien') => newLabyrinth({ day, charLevel: 60, companions: [], seed });
  const always = withDrops({ ordinary: 1, elite: 1, champion: 1, guardian: 1 });
  const fight = ({ cards = { maxed: [] }, data = always, type = 'fight', row = 0, room = 0, seed = 'dzien', party = { character, equipped, name: 'Mira' } } = {}) =>
    labyrinthFight({ state: state(seed), type, row, room, party: { ...party, cards }, seed: 'walka' }, data);

  test('each creature of a won fight leaves its own card by its kind\'s chance, once a fight; the fight goes as without them', () => {
    const won = fight();
    assert.equal(won.labyrinth.won, true);
    const beaten = [...new Set(won.fights[0].enemies.map((enemy) => enemy.monsterId))];
    assert.deepEqual(won.cards, beaten);
    assert.deepEqual(won.fights[0].cards, beaten);
    const plain = fight({ cards: null });
    assert.equal(plain.cards, undefined);
    assert.deepEqual(plain.fights[0].events, won.fights[0].events);
    assert.equal(plain.xp, won.xp);
    assert.equal(plain.gold, won.gold);
    // None at its top level.
    assert.deepEqual(fight({ cards: { maxed: [beaten[0]] } }).cards, beaten.slice(1));
    // The same day's seed and room, the same draws.
    const odds = (seed) => fight({ data: content, seed, row: 0, room: 1 }).cards;
    assert.deepEqual(odds('jeden'), odds('jeden'));
  });

  test('the guardian leaves its card by the guardians\' chance; a lost fight leaves none', () => {
    const guardianOnly = withDrops({ ordinary: 0, elite: 0, champion: 0, guardian: 1 });
    const guardian = fight({ data: guardianOnly, type: 'guardian', row: content.labyrinth.map.rows, room: 0 });
    assert.equal(guardian.labyrinth.won, true);
    assert.deepEqual(guardian.cards, [guardian.fights[0].enemies[0].monsterId]);
    assert.deepEqual(fight({ data: guardianOnly }).cards, []);
    const weak = { character: { classId: 'mage', level: 1, xp: 0, classLevel: 1, classXp: 0, points: {}, position: 'back' }, equipped: [], name: 'Nowicjusz' };
    const lost = fight({ party: weak });
    assert.equal(lost.labyrinth.won, false);
    assert.deepEqual(lost.cards, []);
  });
});

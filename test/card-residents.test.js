// The residents of the Osada at their card tables, in the engine (904 B;
// src/engine/card-residents.js, data/cards.json `residents`): nine
// residents, each at its own place with its own deck in its style, two
// between each two of Szczęsny's tiers and one stronger than his top one,
// by the data and by played matches; their stakes between the neighbouring
// tiers' (Jagna's 250 zł at level 64, as on mock-up 910.2); the card of a
// staked win: at the first one always one of the deck the character has not
// got, at a later one with a chance of 10%, never one at its top level.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  aboveTiers,
  autoTurn,
  cardComes,
  cardType,
  cardView,
  createRng,
  hostTiers,
  newMatch,
  playTurn,
  residentCardsLeft,
  residentDeck,
  residentStake,
  residentTable,
  residentTables,
  residentWinCard,
  starterDeck,
  tierStake,
} from '../src/engine/index.js';
import { content } from './helpers/content.js';

const rules = content.cards;
const tiers = hostTiers(content);

describe('the residents\' tables (904 B)', () => {
  test('nine residents of the Osada, each with a place of its own, Szczęsny not among them', () => {
    const ids = residentTables(content).map((table) => table.id);
    assert.deepEqual([...ids].sort(), ['enchantress', 'groom', 'headman', 'herbalist', 'hermit', 'innkeeper', 'merchant', 'smith', 'tanner']);
    assert.ok(!ids.includes(rules.host.resident));
    for (const id of ids) assert.ok(content.settlement.places.some((place) => place.resident === id), id);
    assert.equal(residentTable('gamehost', content), null);
    assert.equal(residentTable('nobody', content), null);
    assert.equal(residentTable(7, content), null);
    assert.equal(residentTable('herbalist', content).name, 'Talia z bagien');
  });

  test('two between each two of Szczęsny\'s tiers, one above his top one', () => {
    for (let after = 1; after < tiers.length; after += 1) assert.equal(residentTables(content).filter((table) => table.after === after).length, 2, `po stopniu ${after}`);
    const top = residentTables(content).filter((table) => aboveTiers(table, content));
    assert.deepEqual(top.map((table) => table.id), ['hermit']);
    assert.equal(top[0].after, tiers.length);
  });

  test('each stake between the neighbouring tiers\', and above the top one\'s for the strongest; Jagna\'s 250 zł at level 64 (910.2)', () => {
    for (const level of [20, 64, 80, 150]) {
      for (const table of residentTables(content)) {
        const stake = residentStake(table, level, content);
        const below = tierStake(tiers[table.after - 1], level, content);
        const above = tiers[table.after] ? tierStake(tiers[table.after], level, content) : Infinity;
        assert.ok(stake > below && stake < above, `${table.id} na poziomie ${level}: ${below} < ${stake} < ${above}`);
        assert.equal(stake, Math.round(stake));
      }
    }
    assert.equal(residentStake(residentTable('herbalist', content), 64, content), 250);
    assert.equal(residentStake(residentTable('herbalist', content), 80, content), 500);
  });

  test('a whole deck each, in its style: Jagna Magia from the Torfowiska with the four cards of 910.2 first, Żelisław Siła', () => {
    for (const table of residentTables(content)) {
      assert.equal(new Set(residentDeck(table)).size, rules.deckSize, table.id);
      for (const card of table.cards) assert.ok(card.level >= 1 && card.level <= rules.stats.maxLevel, `${table.id}: ${card.monster}`);
    }
    const count = (id, type) => residentDeck(residentTable(id, content)).filter((monster) => cardType(monster, content) === type).length;
    const jagna = residentTable('herbalist', content);
    assert.deepEqual(
      jagna.cards.slice(0, rules.residents.shown).map((card) => [card.monster, card.level]),
      [
        ['toad', 3],
        ['sundew', 2],
        ['wraith', 2],
        ['will-o-wisp', 3],
      ],
    );
    assert.deepEqual(
      jagna.cards.slice(0, 4).map((card) => cardView(card.monster, card.level, content)).map((card) => `${card.name} ${card.attack}/${card.life}`),
      ['Ropucha 14/34', 'Bagienna rosiczka 11/37', 'Zjawa 15/30', 'Ognik 18/24'],
    );
    assert.ok(residentDeck(jagna).every((monster) => content.areasById[cardView(monster, 1, content).area].land === 'Torfowiska'));
    assert.ok(count('herbalist', 'intellect') > count('herbalist', 'strength') && count('herbalist', 'intellect') > count('herbalist', 'dexterity'));
    assert.ok(count('smith', 'strength') > count('smith', 'dexterity') && count('smith', 'strength') > count('smith', 'intellect'));
  });

  test('played: each resident stronger than the tier before it and weaker than the next one, the hermit stronger than the top tier', () => {
    // A gap's rivals (its two tiers and its residents) against the two decks
    // that tell them apart: the deck of the tier below the gap's lower tier
    // (the starter's below the first) and the lower tier's own, played by
    // the game (autoTurn) from the same fixed seeds. A rival's strength is
    // how rarely they win (tools/cards-sim.mjs plays every pair).
    const decks = [starterDeck(content).map((id) => ({ id, level: 1 })), ...tiers.map((tier) => tier.cards.map((card) => ({ id: card.monster, level: card.level })))];
    const wins = (rival, after) => {
      let won = 0;
      for (const cards of [decks[after - 1], decks[after]]) {
        for (let index = 0; index < 30; index += 1) {
          let match = newMatch({ seed: `mieszkancy:${index}`, me: { cards }, foe: { cards: rival.cards.map((card) => ({ id: card.monster, level: card.level })), smart: rival.smart } }, content);
          while (!match.result) match = playTurn(match, autoTurn(match, content), content);
          won += match.result === 'won' ? 1 : match.result === 'drawn' ? 0.5 : 0;
        }
      }
      return won;
    };
    for (let after = 1; after <= tiers.length; after += 1) {
      const below = wins(tiers[after - 1], after);
      const above = tiers[after] ? wins(tiers[after], after) : -Infinity;
      for (const table of residentTables(content).filter((one) => one.after === after)) {
        const won = wins(table, after);
        assert.ok(won < below && won > above, `${table.id} między stopniami ${after} i ${after + 1}: ${below} > ${won} > ${above}`);
      }
    }
  });
});

describe('the card of a staked win at a resident\'s table (904 B)', () => {
  const jagna = residentTable('herbalist', content);
  const deck = residentDeck(jagna);
  // The first seed `prefix:N` whose chance's draw comes (or not).
  const seedWhere = (prefix, comes) => {
    for (let index = 0; index < 10000; index += 1) {
      const seed = `${prefix}:${index}`;
      if (cardComes(createRng(`${seed}:resident-card`), rules.residents.chance) === comes) return seed;
    }
    throw new Error('no such seed');
  };

  test('the first win always gives a card of the deck the character has not got: the only one missing, when one is', () => {
    for (let index = 0; index < 50; index += 1) {
      const card = residentWinCard({ table: jagna, first: true, seed: `pierwsza:${index}`, owned: [] }, content);
      assert.ok(deck.includes(card), card);
    }
    const missing = deck[7];
    const owned = deck.filter((id) => id !== missing);
    for (let index = 0; index < 20; index += 1) assert.equal(residentWinCard({ table: jagna, first: true, seed: `jedna:${index}`, owned }, content), missing);
    // All of them got: one below its top level; all at the top: none.
    const maxed = deck.filter((id) => id !== deck[2]);
    assert.equal(residentWinCard({ table: jagna, first: true, seed: 'wszystkie', owned: deck, maxed }, content), deck[2]);
    assert.equal(residentWinCard({ table: jagna, first: true, seed: 'wszystkie', owned: deck, maxed: deck }, content), null);
  });

  test('a later win gives one with a chance of 10%, the same for the same seed, a missing card first', () => {
    assert.equal(rules.residents.chance, 0.1);
    let came = 0;
    for (let index = 0; index < 2000; index += 1) if (residentWinCard({ table: jagna, first: false, seed: `kolejna:${index}`, owned: deck }, content)) came += 1;
    assert.ok(came > 150 && came < 250, `${came} z 2000`);
    const yes = seedWhere('tak', true);
    const no = seedWhere('nie', false);
    assert.equal(residentWinCard({ table: jagna, first: false, seed: no, owned: [] }, content), null);
    const card = residentWinCard({ table: jagna, first: false, seed: yes, owned: deck.slice(1) }, content);
    assert.equal(card, deck[0]);
    assert.equal(residentWinCard({ table: jagna, first: false, seed: yes, owned: deck.slice(1) }, content), card);
    assert.equal(residentWinCard({ table: jagna, first: false, seed: yes, owned: deck, maxed: deck }, content), null);
  });

  test('what the deck is to the character: the cards it has not got, and those that can still come', () => {
    const top = rules.stats.maxLevel;
    assert.deepEqual(residentCardsLeft(jagna, new Map(), content), { missing: 12, left: 12 });
    const collection = new Map([
      [deck[0], 1],
      [deck[1], top],
      ['wolf', top],
    ]);
    assert.deepEqual(residentCardsLeft(jagna, collection, content), { missing: 10, left: 11 });
    assert.deepEqual(residentCardsLeft(jagna, new Map(deck.map((id) => [id, top])), content), { missing: 0, left: 0 });
  });
});

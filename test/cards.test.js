// Talia Systemu in the engine (src/engine/cards.js; DECISIONS.md, "Talia
// Systemu: gra karciana w Salonie Gier", 871–877): the cards of the
// creatures living in the lands, their types, rarities, Atak and Życie, their
// levels; the starter deck and the decks; a match's setup by the seed, the
// rival's lines first, the player's turn and its checks, the blows of a
// round (the type advantage, the card with none opposite), the cards beaten,
// the reserves drawn, the end and the rounds' limit; the heroes' skills with
// their evolutions; the stakes, the payouts and the first win's card; the
// cards the creatures of an exploration leave, from a seed of their own.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  autoTurn,
  cardDrop,
  cardHomes,
  cardKind,
  cardLevel,
  cardRarity,
  cardStats,
  cardType,
  cardsLeft,
  createRng,
  deckBlock,
  firstWinCard,
  heroSkill,
  hostTier,
  hostTiers,
  isCard,
  matchPayout,
  matchView,
  newMatch,
  playTurn,
  roundHits,
  simulateHunt,
  stakeBase,
  starterDeck,
  startBlock,
  surrenderMatch,
  tierStake,
  turnBlock,
  typeBeats,
  wheelStakes,
} from '../src/engine/index.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';

const rules = content.cards;
const tier = (number) => hostTier(number, content);
const deckOf = (ids, level = 1) => ids.map((id) => ({ id, level }));
const starter = () => deckOf(starterDeck(content));
// A match of the starter deck against a tier, from a seed.
const matchWith = (number = 1, seed = 'stol', hero = null) =>
  newMatch({ seed, me: { cards: starter(), hero }, foe: { cards: tier(number).cards.map((card) => ({ id: card.monster, level: card.level })), smart: tier(number).smart } }, content);
// A match laid out by hand: each side's cards ({ id, level }), its lines as
// keys of them and its reserve, nothing in the decks.
function laidOut({ me, foe, meLines, foeLines, meHand = [], foeHand = [], hero = null, round = 1 }) {
  const side = (cards, lines, hand) => {
    const built = cards.map((card, key) => {
      const { attack, life } = cardStats(card.id, card.level ?? 1, content);
      return { key, id: card.id, level: card.level ?? 1, type: cardType(card.id, content), attack, life: card.life ?? life, max: life };
    });
    return { cards: built, deck: [], hand, lines, out: [], hero: null, smart: 0 };
  };
  const match = { v: 1, seed: 'reka', round, me: side(me, meLines, meHand), foe: side(foe, foeLines, foeHand), last: null, result: null, end: null };
  if (hero) match.me.hero = { ...hero, used: false };
  return match;
}

describe('Talia Systemu: the cards', () => {
  test('every creature living in a land is a card, of the type it attacks with, its species rarity and its kind', () => {
    const homes = cardHomes(content);
    for (const region of content.regions) {
      for (const area of region.areas) {
        for (const encounter of area.encounters ?? []) for (const id of encounter.monsters) assert.ok(isCard(id, content), id);
      }
      assert.ok(isCard(region.elite, content), region.elite);
    }
    assert.ok(homes.size >= 150);
    assert.equal(isCard('nobody', content), false);
    assert.equal(cardType('wolf', content), 'strength');
    assert.equal(cardType('fox', content), 'dexterity');
    assert.equal(cardType('phantasm', content), 'intellect');
    assert.equal(cardRarity('wolf', content), 'common');
    assert.equal(cardKind('wolf', content), 'ordinary');
    assert.equal(cardKind('planetnik', content), 'elite');
    assert.equal(cardKind('basilisk', content), 'champion');
    // Elites and champions have the rarest cards (874 A: "lepsze").
    assert.ok(['legendary', 'mythic'].includes(cardRarity('planetnik', content)));
    assert.ok(['mythic', 'divine'].includes(cardRarity('basilisk', content)));
    // The first land is 0, the Torfowiska 1.
    assert.equal(homes.get('wolf').land, 0);
    assert.equal(homes.get('heron').land, 1);
  });

  test('Siła beats Zręczność, Zręczność Magię and Magia Siłę, and nothing else', () => {
    assert.ok(typeBeats('strength', 'dexterity', content));
    assert.ok(typeBeats('dexterity', 'intellect', content));
    assert.ok(typeBeats('intellect', 'strength', content));
    for (const [a, b] of [['dexterity', 'strength'], ['intellect', 'dexterity'], ['strength', 'intellect'], ['strength', 'strength']]) assert.equal(typeBeats(a, b, content), false);
  });

  test('a card level is the copies won up to the top, each level more Atak and Życie', () => {
    assert.equal(cardLevel(1, content), 1);
    assert.equal(cardLevel(3, content), 3);
    assert.equal(cardLevel(99, content), rules.stats.maxLevel);
    let before = cardStats('wolf', 1, content);
    for (let level = 2; level <= rules.stats.maxLevel; level += 1) {
      const now = cardStats('wolf', level, content);
      assert.ok(now.attack >= before.attack && now.life > before.life, `poziom ${level}`);
      before = now;
    }
    assert.deepEqual(cardStats('wolf', 9, content), cardStats('wolf', rules.stats.maxLevel, content));
  });

  test('cards stay comparable across the lands, but later lands, rarer species and elites and champions are stronger', () => {
    const value = (id) => {
      const { attack, life } = cardStats(id, 1, content);
      return attack * life;
    };
    const average = (ids) => ids.reduce((sum, id) => sum + value(id), 0) / ids.length;
    const homes = [...cardHomes(content)];
    const ordinaryOf = (land) => homes.filter(([id, home]) => home.land === land && cardKind(id, content) === 'ordinary').map(([id]) => id);
    assert.ok(average(ordinaryOf(1)) > average(ordinaryOf(0)));
    assert.ok(average(ordinaryOf(2)) > average(ordinaryOf(1)));
    // Comparable: a later land's ordinary cards no more than a third stronger.
    assert.ok(average(ordinaryOf(2)) < 1.35 * average(ordinaryOf(0)));
    const ofKind = (kind) => homes.filter(([id]) => cardKind(id, content) === kind).map(([id]) => id);
    assert.ok(average(ofKind('elite')) > average(ofKind('ordinary')));
    assert.ok(average(ofKind('champion')) > average(ofKind('elite')));
    // A glass cannon hits harder than it lasts, a tank the other way.
    const squirrel = cardStats('squirrel', 1, content);
    const moonEater = cardStats('moon-eater', 1, content);
    assert.ok(squirrel.attack / squirrel.life > moonEater.attack / moonEater.life);
  });

  test('the starter deck: twelve ordinary creatures of the first lands, four of each type (874 A)', () => {
    const deck = starterDeck(content);
    assert.equal(deck.length, rules.deckSize);
    assert.equal(new Set(deck).size, deck.length);
    for (const id of deck) {
      assert.equal(cardKind(id, content), 'ordinary', id);
      assert.ok(cardHomes(content).get(id).land <= 1, id);
    }
    for (const type of rules.types) assert.equal(deck.filter((id) => cardType(id, content) === type.id).length, 4, type.id);
  });

  test('a deck is twelve different cards of the collection', () => {
    const owned = new Set([...starterDeck(content), 'boar']);
    assert.equal(deckBlock(starterDeck(content), owned, content), null);
    assert.equal(deckBlock(starterDeck(content).slice(1), owned, content).code, 'invalid_deck');
    assert.equal(deckBlock([...starterDeck(content).slice(1), starterDeck(content)[1]], owned, content).code, 'invalid_deck');
    assert.equal(deckBlock([...starterDeck(content).slice(1), 'basilisk'], owned, content).code, 'invalid_deck');
    assert.equal(deckBlock([...starterDeck(content).slice(1), 'boar'], owned, content), null);
    assert.equal(deckBlock('wolf', owned, content).code, 'invalid_deck');
  });
});

describe('Talia Systemu: a match', () => {
  test('the seed shuffles both decks, both reserves are drawn and the rival lays its lines first', () => {
    const match = matchWith(1, 'tasowanie');
    assert.equal(match.round, 1);
    assert.equal(match.me.hand.length, rules.hand);
    assert.deepEqual(match.me.lines, [null, null, null]);
    assert.equal(match.foe.lines.filter((key) => key !== null).length, 3);
    assert.equal(match.foe.hand.length, rules.hand);
    assert.equal(cardsLeft(match.me), rules.deckSize);
    assert.equal(cardsLeft(match.foe), rules.deckSize);
    assert.deepEqual(match.last.placed, [0, 1, 2]);
    // The same seed, the same match; another seed, another order.
    assert.deepEqual(matchWith(1, 'tasowanie'), match);
    assert.notDeepEqual(matchWith(1, 'inne').me.deck, match.me.deck);
  });

  test('the page never sees the seed, the decks\' order nor the rival\'s reserve', () => {
    const view = matchView(matchWith(), content);
    const text = JSON.stringify(view);
    assert.ok(!text.includes('stol'));
    assert.equal(typeof view.foe.hand, 'number');
    assert.equal(typeof view.me.deck, 'number');
    assert.equal(view.me.hand.length, rules.hand);
    assert.ok(view.foe.lines.every((card) => card && card.name && card.attack > 0 && card.life > 0));
  });

  test('a turn: the round the page saw, the lines filled from the reserve, a card on the table staying on its line', () => {
    const match = matchWith();
    const [a, b, c, d] = match.me.hand;
    assert.equal(turnBlock(match, { round: 2, lines: [a, b, c] }, content).code, 'stale_round');
    assert.equal(turnBlock(match, { round: 1, lines: [a, b, null] }, content).code, 'lines_empty');
    assert.equal(turnBlock(match, { round: 1, lines: [a, a, b] }, content).code, 'invalid_turn');
    assert.equal(turnBlock(match, { round: 1, lines: [a, b] }, content).code, 'invalid_turn');
    const away = match.me.cards.find((card) => !match.me.hand.includes(card.key)).key;
    assert.equal(turnBlock(match, { round: 1, lines: [a, b, away] }, content).code, 'not_in_hand');
    assert.equal(turnBlock(match, { round: 1, lines: [a, b, c] }, content), null);
    assert.equal(turnBlock(match, { round: 1, lines: [d, b, c] }, content), null);
    // A card on the table cannot move to another line nor go back.
    const next = playTurn(match, { round: 1, lines: [a, b, c] }, content);
    const standing = next.me.lines.findIndex((key) => key !== null);
    if (standing >= 0) {
      const lines = [...next.me.lines];
      const key = lines[standing];
      lines[standing] = null;
      lines[(standing + 1) % 3] = key;
      assert.equal(turnBlock(next, { round: 2, lines }, content).code, 'card_kept');
    }
  });

  test('every card hits the card opposite, all at once, half again harder against a type it beats', () => {
    // Wilk (Siła) against Lis (Zręczność): the wolf beats the fox.
    const match = laidOut({ me: [{ id: 'wolf' }], foe: [{ id: 'fox' }], meLines: [0, null, null], foeLines: [0, null, null] });
    const hits = roundHits(match, content);
    const wolf = cardStats('wolf', 1, content);
    const fox = cardStats('fox', 1, content);
    const mine = hits.find((hit) => hit.side === 'me');
    const theirs = hits.find((hit) => hit.side === 'foe');
    assert.equal(mine.damage, Math.round(wolf.attack * (1 + rules.typeBonus)));
    assert.equal(mine.advantage, true);
    assert.equal(theirs.damage, fox.attack);
    assert.equal(theirs.advantage, false);
    const after = playTurn(match, { round: 1, lines: [0, null, null] }, content);
    // Both hit from where they stood, so the fox hits back even if beaten.
    assert.equal(after.me.cards[0].life, Math.max(0, wolf.life - fox.attack));
    assert.equal(after.foe.cards[0].life, Math.max(0, fox.life - mine.damage));
  });

  test('a card with no card opposite hits the rival\'s first card from the front', () => {
    const match = laidOut({ me: [{ id: 'wolf' }, { id: 'badger' }], foe: [{ id: 'fox' }], meLines: [null, 0, 1], foeLines: [null, 0, null] });
    const hits = roundHits(match, content).filter((hit) => hit.side === 'me');
    assert.deepEqual(hits.map((hit) => hit.target.line), [1, 1]);
    const back = roundHits(laidOut({ me: [{ id: 'wolf' }], foe: [{ id: 'fox' }, { id: 'viper' }], meLines: [null, null, 0], foeLines: [null, 0, 1] }), content).find((hit) => hit.side === 'me');
    assert.equal(back.target.line, 2);
  });

  test('a beaten card leaves the table, the reserves are drawn up and the rival fills its lines again', () => {
    let match = matchWith(1, 'bitwa');
    const before = match.foe.out.length;
    for (let round = 0; round < 3 && !match.result; round += 1) match = playTurn(match, autoTurn(match, content), content);
    assert.ok(match.me.out.length + match.foe.out.length > before);
    if (!match.result) {
      assert.equal(match.me.hand.length, Math.min(rules.hand, match.me.hand.length + match.me.deck.length));
      // The rival's empty lines filled while it has cards in its reserve.
      const empty = match.foe.lines.filter((key) => key === null).length;
      assert.ok(empty === 0 || match.foe.hand.length === 0);
    }
    for (const side of [match.me, match.foe]) {
      for (const key of side.out) assert.ok(!side.lines.includes(key) && !side.hand.includes(key) && !side.deck.includes(key));
    }
  });

  test('the match ends when a side has no cards left, and after the rounds\' limit by the cards, then the Życie, left', () => {
    const won = playTurn(laidOut({ me: [{ id: 'bear', level: 5 }], foe: [{ id: 'squirrel', life: 1 }], meLines: [0, null, null], foeLines: [0, null, null] }), { round: 1, lines: [0, null, null] }, content);
    assert.equal(won.result, 'won');
    assert.equal(won.end, 'out');
    const lost = playTurn(laidOut({ me: [{ id: 'squirrel', life: 1 }], foe: [{ id: 'bear', level: 5 }], meLines: [0, null, null], foeLines: [0, null, null] }), { round: 1, lines: [0, null, null] }, content);
    assert.equal(lost.result, 'lost');
    const both = playTurn(laidOut({ me: [{ id: 'wolf', life: 1 }], foe: [{ id: 'wolf', life: 1 }], meLines: [0, null, null], foeLines: [0, null, null] }), { round: 1, lines: [0, null, null] }, content);
    assert.equal(both.result, 'drawn');
    const cap = rules.roundCap;
    // At the limit: two cards against one.
    const more = playTurn(
      laidOut({ me: [{ id: 'aurochs', level: 5 }, { id: 'raccoon-dog' }], foe: [{ id: 'aurochs', level: 5 }], meLines: [0, null, null], meHand: [1], foeLines: [0, null, null], round: cap }),
      { round: cap, lines: [0, 1, null] },
      content,
    );
    assert.equal(more.result, 'won');
    assert.equal(more.end, 'cap');
    // The same cards: the Życie decides, and with it equal it is a draw.
    const even = laidOut({ me: [{ id: 'aurochs', level: 5 }], foe: [{ id: 'aurochs', level: 5 }], meLines: [0, null, null], foeLines: [0, null, null], round: cap });
    assert.equal(playTurn(even, { round: cap, lines: [0, null, null] }, content).result, 'drawn');
    const hurt = laidOut({ me: [{ id: 'aurochs', level: 5 }], foe: [{ id: 'aurochs', level: 5, life: 20 }], meLines: [0, null, null], foeLines: [0, null, null], round: cap });
    assert.equal(playTurn(hurt, { round: cap, lines: [0, null, null] }, content).result, 'won');
    assert.equal(surrenderMatch(matchWith()).result, 'lost');
    assert.equal(turnBlock(won, { round: 1, lines: [0, null, null] }, content).code, 'match_over');
  });

  test('the same turns from the same seed play the same match to its end', () => {
    const play = (seed) => {
      let match = matchWith(2, seed);
      const views = [];
      while (!match.result) {
        const turn = autoTurn(match, content);
        assert.equal(turnBlock(match, turn, content), null);
        match = playTurn(match, turn, content);
        views.push(matchView(match, content));
      }
      return { match, views };
    };
    const one = play('powtorka');
    assert.deepEqual(play('powtorka'), one);
    assert.ok(['won', 'lost', 'drawn'].includes(one.match.result));
    assert.ok(one.match.round <= rules.roundCap);
  });

  test('a match takes several rounds of decisions, about five minutes', () => {
    let rounds = 0;
    for (let index = 0; index < 20; index += 1) {
      let match = matchWith(1, `dlugosc:${index}`);
      while (!match.result) match = playTurn(match, autoTurn(match, content), content);
      rounds += match.round;
    }
    const average = rounds / 20;
    assert.ok(average >= 6 && average <= rules.roundCap, `średnio ${average} rund`);
  });
});

describe('Talia Systemu: the heroes (872 A, point 8)', () => {
  const duel = (hero, extra = {}) =>
    laidOut({ me: [{ id: 'wolf' }, { id: 'badger' }, { id: 'phantasm' }], foe: [{ id: 'fox' }, { id: 'viper' }, { id: 'squirrel' }], meLines: [0, 1, null], meHand: [2], foeLines: [0, 1, 2], hero, ...extra });

  test('each class has its skill, and its evolutions strengthen it', () => {
    for (const classId of ['warrior', 'archer', 'mage', 'cleric', 'shadow']) assert.ok(heroSkill(classId, 0, content), classId);
    assert.equal(heroSkill('warrior', 0, content).power, 0.5);
    assert.equal(heroSkill('warrior', 1, content).power, 0.75);
    assert.equal(heroSkill('warrior', 2, content).power, 1);
    // A later evolution than the data's takes the last.
    assert.equal(heroSkill('warrior', 3, content).power, 1);
    assert.match(heroSkill('warrior', 1, content).text, /75%/);
    assert.ok(!heroSkill('archer', 0, content).text.includes('%'));
    assert.match(heroSkill('archer', 2, content).text, /50%/);
  });

  test('Wojownik: one card hits harder this round, once a match', () => {
    const match = duel({ classId: 'warrior', stage: 0 });
    const turn = { round: 1, lines: [0, 1, 2], skill: { card: 0 } };
    assert.equal(turnBlock(match, turn, content), null);
    const after = playTurn(match, turn, content);
    const plain = Math.round(cardStats('wolf', 1, content).attack * 1.5);
    const hit = after.last.hits.find((one) => one.side === 'me' && one.key === 0);
    assert.equal(hit.damage, Math.round(cardStats('wolf', 1, content).attack * 1.5 * 1.5));
    assert.ok(hit.damage > plain && hit.boosted);
    assert.equal(after.me.hero.used, true);
    assert.equal(turnBlock({ ...after, round: after.round }, { round: after.round, lines: after.me.lines, skill: { card: 1 } }, content)?.code, after.result ? 'match_over' : 'skill_used');
    // After the second evolution it hits twice as hard.
    const evolved = playTurn(duel({ classId: 'warrior', stage: 2 }), turn, content).last.hits.find((one) => one.side === 'me' && one.key === 0);
    assert.equal(evolved.damage, Math.round(cardStats('wolf', 1, content).attack * 1.5 * 2));
  });

  test('Łucznik: one card hits the rival\'s card chosen instead of the one opposite', () => {
    const match = duel({ classId: 'archer', stage: 0 });
    assert.equal(turnBlock(match, { round: 1, lines: [0, 1, 2], skill: { card: 0 } }, content).code, 'invalid_skill');
    const turn = { round: 1, lines: [0, 1, 2], skill: { card: 0, target: 2 } };
    assert.equal(turnBlock(match, turn, content), null);
    const hit = playTurn(match, turn, content).last.hits.find((one) => one.side === 'me' && one.key === 0);
    assert.equal(hit.target.line, 2);
    assert.equal(hit.damage, Math.round(cardStats('wolf', 1, content).attack * 1.5));
    const evolved = playTurn(duel({ classId: 'archer', stage: 1 }), turn, content).last.hits.find((one) => one.side === 'me' && one.key === 0);
    assert.equal(evolved.damage, Math.round(cardStats('wolf', 1, content).attack * 1.5 * 1.25));
  });

  test('Mag: one card takes another type for the rest of the match', () => {
    const match = duel({ classId: 'mage', stage: 0 });
    assert.equal(turnBlock(match, { round: 1, lines: [0, 1, 2], skill: { card: 0, type: 'strength' } }, content).code, 'invalid_skill');
    const turn = { round: 1, lines: [0, 1, 2], skill: { card: 2, type: 'strength' } };
    assert.equal(turnBlock(match, turn, content), null);
    const after = playTurn(match, turn, content);
    assert.equal(after.me.cards[2].type, 'strength');
    assert.equal(after.me.cards[2].shifted, true);
    // Phantasm as Siła against a squirrel (Zręczność): half again harder.
    const hit = after.last.hits.find((one) => one.side === 'me' && one.key === 2);
    assert.equal(hit.advantage, true);
  });

  test('Kleryk: the card chosen comes back with its share of Życie when beaten this round', () => {
    const weak = laidOut({ me: [{ id: 'squirrel', life: 1 }], foe: [{ id: 'bear', level: 5 }, { id: 'bear' }], meLines: [0, null, null], foeLines: [0, null, null], foeHand: [1], hero: { classId: 'cleric', stage: 0 } });
    const after = playTurn(weak, { round: 1, lines: [0, null, null], skill: { card: 0 } }, content);
    assert.equal(after.result, null);
    assert.equal(after.last.revived, 0);
    assert.equal(after.me.cards[0].life, Math.round(after.me.cards[0].max * 0.5));
    assert.equal(after.me.lines[0], 0);
    const full = playTurn({ ...weak, me: { ...weak.me, hero: { classId: 'cleric', stage: 2, used: false } } }, { round: 1, lines: [0, null, null], skill: { card: 0 } }, content);
    assert.equal(full.me.cards[0].life, full.me.cards[0].max);
  });

  test('Cień: after the rival\'s setup one card on a line swaps with a card of the reserve', () => {
    const match = laidOut({
      me: [{ id: 'wolf' }, { id: 'badger' }, { id: 'phantasm' }, { id: 'raccoon-dog' }],
      foe: [{ id: 'fox' }, { id: 'viper' }, { id: 'squirrel' }],
      meLines: [0, 1, 3],
      meHand: [2],
      foeLines: [0, 1, 2],
      hero: { classId: 'shadow', stage: 1 },
    });
    // Without the skill the card stays on its line.
    assert.equal(turnBlock(match, { round: 1, lines: [2, 1, 3] }, content).code, 'card_kept');
    // The reserve's card takes the line of the card it swaps.
    assert.equal(turnBlock(match, { round: 1, lines: [0, 2, 3], skill: { card: 0, swap: 2 } }, content).code, 'invalid_skill');
    const turn = { round: 1, lines: [2, 1, 3], skill: { card: 0, swap: 2 } };
    assert.equal(turnBlock(match, turn, content), null);
    const after = playTurn(match, turn, content);
    assert.equal(after.me.lines[0], 2);
    assert.ok(after.me.hand.includes(0));
    assert.equal(after.me.cards[0].life, after.me.cards[0].max);
    const hit = after.last.hits.find((one) => one.side === 'me' && one.key === 2);
    assert.equal(hit.boosted, true);
    assert.equal(hit.damage, Math.round(cardStats('phantasm', 1, content).attack * 1.25 * (hit.advantage ? 1.5 : 1)));
  });
});

describe('Talia Systemu: Szczęsny, the stakes and the rewards (873 A, 875 A)', () => {
  test('five tiers, their decks whole, harder one by one', () => {
    const tiers = hostTiers(content);
    assert.equal(tiers.length, 5);
    const might = (number) => tier(number).cards.reduce((sum, card) => {
      const { attack, life } = cardStats(card.monster, card.level, content);
      return sum + attack * life;
    }, 0);
    for (let number = 2; number <= 5; number += 1) assert.ok(might(number) > might(number - 1), `stopień ${number}`);
    assert.equal(hostTier(0, content), null);
    assert.equal(hostTier(6, content), null);
    assert.equal(hostTier('1', content), null);
  });

  test('the stake grows with the level as the Koło Fortuny\'s lowest stake, times the tier\'s', () => {
    for (const level of [20, 39, 40, 79, 80, 150, 200]) assert.equal(stakeBase(level, content), wheelStakes(level, 0, content)[0], `poziom ${level}`);
    assert.equal(tierStake(tier(1), 20, content), 100);
    assert.equal(tierStake(tier(3), 85, content), 3 * 200);
  });

  test('za wygraną zgarniesz podwójną stawkę, a draw gives the stake back, a training nothing', () => {
    const end = { staked: true, stake: 300, dailyGold: 120, rewardedToday: false, beatenBefore: false, firstCard: 'imp' };
    assert.deepEqual(matchPayout({ ...end, result: 'won' }), { gold: 600, daily: 120, card: 'imp' });
    assert.deepEqual(matchPayout({ ...end, result: 'won', rewardedToday: true, beatenBefore: true }), { gold: 600, daily: 0, card: null });
    assert.deepEqual(matchPayout({ ...end, result: 'drawn' }), { gold: 300, daily: 0, card: null });
    assert.deepEqual(matchPayout({ ...end, result: 'lost' }), { gold: 0, daily: 0, card: null });
    assert.deepEqual(matchPayout({ ...end, staked: false, result: 'won' }), { gold: 0, daily: 0, card: null });
  });

  test('a match starts with a deck, none running, a staked one within the day\'s ten and with the gold', () => {
    const state = { tier: tier(1), staked: true, hasDeck: true, running: false, stakedToday: 0, gold: 500, stake: 100 };
    assert.equal(startBlock(state, content), null);
    assert.equal(startBlock({ ...state, tier: null }, content).code, 'invalid_tier');
    assert.equal(startBlock({ ...state, hasDeck: false }, content).code, 'no_deck');
    assert.equal(startBlock({ ...state, running: true }, content).code, 'match_running');
    assert.equal(startBlock({ ...state, stakedToday: rules.stakes.perDay }, content).code, 'stakes_used');
    assert.equal(startBlock({ ...state, gold: 99 }, content).code, 'not_enough_gold');
    // Training: no limit and no gold.
    assert.equal(startBlock({ ...state, staked: false, stakedToday: 99, gold: 0 }, content), null);
  });

  test('the first win\'s card: of the tier\'s rarity, first one not in the collection', () => {
    const rare = tier(1);
    const one = firstWinCard(rare, new Map(), 'mecz', content);
    assert.equal(cardRarity(one, content), rare.firstWin.rarity);
    assert.equal(firstWinCard(rare, new Map(), 'mecz', content), one);
    const all = [...cardHomes(content).keys()].filter((id) => cardRarity(id, content) === rare.firstWin.rarity);
    const missing = all[3];
    const owned = new Map(all.filter((id) => id !== missing).map((id) => [id, 1]));
    assert.equal(firstWinCard(rare, owned, 'mecz', content), missing);
    // With all of them, one of those it has fewest copies of.
    assert.equal(firstWinCard(rare, new Map(all.map((id) => [id, id === missing ? 1 : 2])), 'mecz', content), missing);
  });
});

describe('Talia Systemu: cards from the explorations (874 A)', () => {
  const { character, equipped } = typicalCharacter('warrior', 24, content);
  const hunt = (cards, seed = 'karty') => simulateHunt({ character, equipped, hp: 99999, name: 'Mira', areaId: 'boar-thicket', minutes: 240, seed, cards }, content);

  test('a creature leaves its card by its kind\'s chance, never one at its top level nor of no card', () => {
    const rng = () => createRng('rzut');
    const always = { ...content, cards: { ...rules, drops: { ordinary: 1, elite: 1, champion: 1, guardian: 1 } } };
    assert.equal(cardDrop('wolf', rng(), {}, always), 'wolf');
    assert.equal(cardDrop('wolf', rng(), { maxed: ['wolf'] }, always), null);
    assert.equal(cardDrop('nobody', rng(), {}, always), null);
    const never = { ...content, cards: { ...rules, drops: { ordinary: 0, elite: 0, champion: 0, guardian: 0 } } };
    assert.equal(cardDrop('wolf', rng(), {}, never), null);
    // The odds: an elite's card more often than an ordinary creature's.
    const count = (id) => Array.from({ length: 4000 }, (_, index) => cardDrop(id, createRng(`szansa:${index}`), {}, content)).filter(Boolean).length;
    assert.ok(count('planetnik') > 2 * count('wolf'));
  });

  test('an exploration\'s cards come from the creatures it beat, from a seed of their own: the rest goes as without them', () => {
    const without = hunt(null);
    assert.equal(without.cards, undefined);
    let found = 0;
    for (let index = 0; index < 30; index += 1) {
      const seed = `karty:${index}`;
      const plain = hunt(null, seed);
      const withCards = hunt({ maxed: [] }, seed);
      assert.equal(withCards.xp, plain.xp);
      assert.equal(withCards.gold, plain.gold);
      assert.deepEqual(withCards.items, plain.items);
      assert.deepEqual(withCards.materials, plain.materials);
      const beaten = new Set(withCards.fights.filter((fight) => fight.won === true).flatMap((fight) => fight.enemies.map((enemy) => enemy.monsterId)));
      for (const id of withCards.cards) assert.ok(beaten.has(id), id);
      assert.equal(new Set(withCards.cards).size, withCards.cards.length);
      found += withCards.cards.length;
    }
    // Rare, but there: 30 four-hour explorations find some.
    assert.ok(found > 0 && found < 60, `kart: ${found}`);
    // A card at its top level never comes.
    const always = { ...content, cards: { ...rules, drops: { ordinary: 1, elite: 1, champion: 1, guardian: 1 } } };
    const all = simulateHunt({ character, equipped, hp: 99999, name: 'Mira', areaId: 'boar-thicket', minutes: 240, seed: 'wszystkie', cards: { maxed: ['boar'] } }, always);
    assert.ok(all.cards.length > 0 && !all.cards.includes('boar'));
    assert.ok(all.entries.some((entry) => entry.text.includes(content.monstersById[all.cards[0]].name)));
  });
});

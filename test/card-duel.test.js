// Partie kart na żywo in the engine (src/engine/card-duel.js; 901 B): both
// decks dealt as with Szczęsny from the match's seed, the first round's
// leader from it too; the leader's cards laid in the open and the other's
// answer that plays the round, who leads changing every round; both sides'
// moves checked as a player's are against Szczęsny, each side's hero for its
// own cards; a move missed made by the game at its deadline and two in a
// row lost, the same however often the match is read; the end, a draw and a
// surrender; the stakes the two may play for and what a win gives.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  duelCatchUp,
  duelMove,
  duelPayout,
  duelPot,
  duelSeen,
  duelStakes,
  duelTurnBlock,
  duelView,
  liveRules,
  newDuel,
  otherSeat,
  surrenderDuel,
} from '../src/engine/card-duel.js';
import { autoTurn, cardStats, cardType, hostTiers, newMatch, starterDeck, tierStake } from '../src/engine/index.js';
import { content } from './helpers/content.js';

const rules = content.cards;
const live = liveRules(content);
const TURN = live.turnSeconds * 1000;
// A round's first move, the leader's, has more (918 B): the round before
// still plays on both screens as it becomes due.
const FIRST = live.firstMoveSeconds * 1000;
const GRACE = live.graceSeconds * 1000;
const starter = () => starterDeck(content).map((id) => ({ id, level: 1 }));
const fresh = (seed = 'stol', now = 0, heroes = {}) => newDuel({ seed, now, me: { cards: starter(), hero: heroes.me ?? null }, foe: { cards: starter(), hero: heroes.foe ?? null } }, content);
// The game's own move for `seat`, as the player would make it.
const own = (duel, seat) => autoTurn(duelSeen(duel, seat), content);
const move = (duel, seat, at, turn = own(duel, seat)) => {
  assert.equal(duelTurnBlock(duel, seat, turn, content), null);
  return duelMove(duel, seat, turn, at, content);
};

// A match laid out by hand: each side's cards ({ id, level, life }), its
// lines as keys of them and its reserve, nothing in the decks.
function laidOut({ me, foe, meLines, foeLines, meHand = [], foeHand = [], lead = 'me', heroes = {}, round = 1 }) {
  const side = (cards, lines, hand, hero) => ({
    cards: cards.map((card, key) => {
      const { attack, life } = cardStats(card.id, card.level ?? 1, content);
      return { key, id: card.id, level: card.level ?? 1, type: cardType(card.id, content), attack, life: card.life ?? life, max: life };
    }),
    deck: [],
    hand,
    lines,
    out: [],
    hero: hero ? { ...hero, used: false } : null,
    smart: 0,
  });
  return {
    v: 1,
    duel: 1,
    seed: 'reka',
    round,
    me: side(me, meLines, meHand, heroes.me),
    foe: side(foe, foeLines, foeHand, heroes.foe),
    last: null,
    result: null,
    end: null,
    lead,
    step: lead,
    moves: { me: null, foe: null },
    missed: { me: 0, foe: 0 },
    deadline: FIRST,
  };
}

describe('Partie na żywo: the table and the turns', () => {
  test('both decks are dealt as with Szczęsny, from the seed; the first leader comes from the seed; its move is due in 35 seconds (918 B), 5 more than for the answer', () => {
    assert.equal(live.firstMoveSeconds - live.turnSeconds, 5);
    const duel = fresh('stol', 1000);
    assert.deepEqual(duel.me, newMatch({ seed: 'stol:me', me: { cards: starter() }, foe: { cards: [] } }, content).me);
    assert.deepEqual(duel.foe, newMatch({ seed: 'stol:foe', me: { cards: starter() }, foe: { cards: [] } }, content).me);
    for (const seat of ['me', 'foe']) {
      assert.equal(duel[seat].hand.length, rules.hand);
      assert.deepEqual(duel[seat].lines, [null, null, null]);
    }
    assert.notDeepEqual(duel.me.hand.map((key) => duel.me.cards[key].id), duel.foe.hand.map((key) => duel.foe.cards[key].id));
    assert.equal(duel.deadline, 1000 + FIRST);
    assert.equal(duel.step, duel.lead);
    assert.equal(duel.round, 1);
    assert.deepEqual(fresh('stol', 1000), duel);
    const leads = new Set(Array.from({ length: 24 }, (_, index) => fresh(`stol-${index}`).lead));
    assert.deepEqual([...leads].sort(), ['foe', 'me']);
  });

  test('the leader lays first, in the open; the other sees its new cards and answers, which plays the round; who leads changes every round', () => {
    let duel = fresh('naprzemian');
    const first = duel.lead;
    const second = otherSeat(first);
    assert.equal(duelTurnBlock(duel, second, own(duel, second), content).code, 'not_your_move');
    const lead = own(duel, first);
    duel = move(duel, first, 5000, lead);
    assert.equal(duel.step, second);
    assert.equal(duel.deadline, 5000 + TURN);
    assert.equal(duel.round, 1);
    assert.equal(duel.last, null);
    assert.deepEqual(duel.moves[first], { filled: [0, 1, 2], skill: null, auto: false });
    assert.equal(duelTurnBlock(duel, first, own(duel, first), content).code, 'not_your_move');
    // The other sees the leader's cards on its lines, new this round.
    const seen = duelView(duel, second, content);
    assert.deepEqual(seen.foe.lines.map((card) => card.key), lead.lines);
    assert.deepEqual(seen.moves.foe.filled, [0, 1, 2]);
    assert.equal(seen.step, 'me');
    assert.equal(seen.lead, 'foe');
    assert.equal(seen.foe.hand, rules.hand - 3);
    const leaderSees = duelView(duel, first, content);
    assert.equal(leaderSees.step, 'foe');
    assert.deepEqual(leaderSees.foe.lines, [null, null, null]);
    // The answer plays the round: every card on the table hits.
    duel = move(duel, second, 9000);
    assert.equal(duel.round, 2);
    assert.equal(duel.last.round, 1);
    assert.equal(duel.last.hits.length, 6);
    assert.deepEqual(new Set(duel.last.hits.map((hit) => hit.side)), new Set(['me', 'foe']));
    assert.deepEqual(duel.moves, { me: null, foe: null });
    // The lines as the blows found them, for the leader's page to play the
    // round it did not see laid: each from its own side.
    assert.deepEqual(duel.last.before[first].map((one) => one.key), lead.lines);
    assert.ok(duel.last.before[first].every((one) => one.life === duel[first].cards[one.key].max));
    assert.deepEqual(duelView(duel, first, content).last.before.me, duel.last.before[first]);
    assert.deepEqual(duelView(duel, first, content).last.before.foe, duel.last.before[second]);
    assert.equal(duel.lead, second);
    assert.equal(duel.step, second);
    // The next round's first move, the new leader's, has the 35 seconds.
    assert.equal(duel.deadline, 9000 + FIRST);
    for (const seat of ['me', 'foe']) assert.equal(duel[seat].hand.length + duel[seat].lines.filter((key) => key !== null).length + duel[seat].out.length + duel[seat].deck.length, rules.deckSize);
    // And so on: the leaders take turns.
    const leads = [first, second];
    let at = 9000;
    while (!duel.result && leads.length < 6) {
      at += 1000;
      duel = move(duel, duel.step, at);
      at += 1000;
      duel = move(duel, duel.step, at);
      if (!duel.result) leads.push(duel.lead);
    }
    assert.deepEqual(leads, [first, second, first, second, first, second].slice(0, leads.length));
    assert.ok(leads.length >= 4);
  });

  test("both sides' moves are checked as a player's are against Szczęsny", () => {
    let duel = fresh('sprawdzam');
    const first = duel.lead;
    const second = otherSeat(first);
    const hand = duel[first].hand;
    assert.equal(duelTurnBlock(duel, first, { round: 2, lines: [hand[0], hand[1], hand[2]] }, content).code, 'stale_round');
    assert.equal(duelTurnBlock(duel, first, { round: 1, lines: [hand[0], null, null] }, content).code, 'lines_empty');
    const notMine = duel[first].cards.map((card) => card.key).find((key) => !hand.includes(key));
    assert.equal(duelTurnBlock(duel, first, { round: 1, lines: [notMine, hand[1], hand[2]] }, content).code, 'not_in_hand');
    duel = move(duel, first, 1000);
    const answer = duel[second].hand;
    assert.equal(duelTurnBlock(duel, second, { round: 1, lines: [answer[0], answer[0], answer[1]] }, content).code, 'invalid_turn');
    assert.equal(duelTurnBlock(duel, second, { round: 1, lines: [answer[0], null, null] }, content).code, 'lines_empty');
    duel = move(duel, second, 2000);
    // A card on the table stays on its line, for the second leader too.
    const standing = duel[second].lines.findIndex((key) => key !== null);
    if (standing >= 0 && duel[second].hand.length > 0) {
      const lines = [...duel[second].lines];
      lines[standing] = duel[second].hand[0];
      assert.equal(duelTurnBlock(duel, second, { round: 2, lines }, content).code, 'card_kept');
    }
    const over = surrenderDuel(duel, first);
    assert.equal(duelTurnBlock(over, second, own(duel, second), content).code, 'match_over');
  });

  test("each side's hero works for its own cards, the leader's skill in the open", () => {
    const cards = { me: [{ id: 'wolf' }, { id: 'badger' }, { id: 'phantasm' }], foe: [{ id: 'fox' }, { id: 'viper' }, { id: 'squirrel' }] };
    let duel = laidOut({ ...cards, meLines: [0, 1, 2], foeLines: [0, 1, 2], heroes: { me: { classId: 'warrior', stage: 0 }, foe: { classId: 'warrior', stage: 0 } } });
    duel = move(duel, 'me', 1000, { round: 1, lines: [0, 1, 2], skill: { card: 0 } });
    assert.equal(duel.me.hero.used, true);
    // The other sees it before it answers.
    assert.deepEqual(duelView(duel, 'foe', content).moves.foe.skill, { card: 0, kind: 'fury', power: 0.5 });
    duel = move(duel, 'foe', 2000, { round: 1, lines: [0, 1, 2], skill: { card: 2 } });
    const hit = (side, key) => duel.last.hits.find((one) => one.side === side && one.key === key);
    // Wilk (Siła) beats Lis (Zręczność), Wiewiórka (Zręczność) beats Zwid (Magia).
    assert.equal(hit('me', 0).damage, Math.round(cardStats('wolf', 1, content).attack * 1.5 * 1.5));
    assert.equal(hit('foe', 2).damage, Math.round(cardStats('squirrel', 1, content).attack * 1.5 * 1.5));
    assert.equal(hit('me', 1).boosted, false);
    assert.deepEqual(duel.last.skills.me.kind, 'fury');
    assert.deepEqual(duel.last.skills.foe.kind, 'fury');
    // The answering Łucznik aims, the leading Mag's card shows its new type at once.
    let aimed = laidOut({ ...cards, meLines: [0, 1, 2], foeLines: [0, 1, 2], heroes: { me: { classId: 'mage', stage: 0 }, foe: { classId: 'archer', stage: 0 } } });
    aimed = move(aimed, 'me', 1000, { round: 1, lines: [0, 1, 2], skill: { card: 2, type: 'strength' } });
    const seen = duelView(aimed, 'foe', content);
    assert.equal(seen.foe.lines[2].type, 'strength');
    assert.equal(seen.foe.lines[2].shifted, true);
    assert.equal(duelTurnBlock(aimed, 'foe', { round: 1, lines: [0, 1, 2], skill: { card: 0 } }, content).code, 'invalid_skill');
    aimed = move(aimed, 'foe', 2000, { round: 1, lines: [0, 1, 2], skill: { card: 0, target: 2 } });
    const shot = aimed.last.hits.find((one) => one.side === 'foe' && one.key === 0);
    assert.equal(shot.target.line, 2);
    // A Kleryk's card on the answering side comes back.
    let revived = laidOut({ me: [{ id: 'bear', level: 5 }], foe: [{ id: 'squirrel', life: 1 }, { id: 'fox' }], meLines: [0, null, null], foeLines: [0, null, null], foeHand: [1], heroes: { foe: { classId: 'cleric', stage: 0 } } });
    revived = move(revived, 'me', 1000, { round: 1, lines: [0, null, null] });
    revived = move(revived, 'foe', 2000, { round: 1, lines: [0, 1, null], skill: { card: 0 } });
    assert.equal(revived.last.revived.foe, 0);
    assert.equal(revived.foe.cards[0].life, Math.round(revived.foe.cards[0].max * 0.5));
    assert.equal(duelView(revived, 'foe', content).last.revived, 0);
    assert.equal(duelView(revived, 'me', content).last.revivedFoe, 0);
  });
});

describe('Partie na żywo: moves missed', () => {
  test('a move missed is made by the game at its deadline; two in a row lose the match, one of its own clears the count', () => {
    let duel = fresh('spoznienie');
    const first = duel.lead;
    const second = otherSeat(first);
    // Within the grace nothing happens.
    assert.equal(duelCatchUp(duel, FIRST + GRACE, content), duel);
    duel = duelCatchUp(duel, FIRST + GRACE + 1, content);
    assert.equal(duel.moves[first].auto, true);
    assert.deepEqual(duel.moves[first].filled, [0, 1, 2]);
    assert.equal(duel.missed[first], 1);
    assert.equal(duel.step, second);
    // The game's move for the leader at its deadline (and grace): the
    // answer is due 30 seconds after it.
    assert.equal(duel.deadline, FIRST + GRACE + TURN);
    duel = move(duel, second, FIRST + GRACE + 5000);
    assert.equal(duel.missed[second], 0);
    assert.equal(duel.missed[first], 1);
    assert.equal(duel.lead, second);
    duel = move(duel, second, 70000);
    assert.equal(duel.step, first);
    // Its second in a row: the match lost.
    const lost = duelCatchUp(duel, 70000 + TURN + GRACE + 1, content);
    assert.equal(lost.end, 'missed');
    assert.equal(lost.result, first === 'me' ? 'lost' : 'won');
    assert.equal(lost.step, null);
    assert.equal(lost.missed[first], 2);
    assert.equal(duelView(lost, first, content).result, 'lost');
    assert.equal(duelView(lost, second, content).result, 'won');
    // A move of its own in between clears the count.
    const back = move(duel, first, 75000);
    assert.equal(back.missed[first], 0);
  });

  test('nobody moves: every deadline is applied in its order, and the first to miss twice loses; read at once or bit by bit, the same', () => {
    const duel = fresh('nikt');
    const end = duelCatchUp(duel, 10 * 60000, content);
    const loser = otherSeat(duel.lead);
    assert.equal(end.end, 'missed');
    assert.equal(end.missed[loser], 2);
    assert.equal(end.missed[duel.lead], 1);
    assert.equal(end.result, loser === 'me' ? 'lost' : 'won');
    let step = duel;
    for (const now of [FIRST + GRACE + 1, FIRST + TURN + 2 * GRACE + 1, 5 * 60000, 10 * 60000]) step = duelCatchUp(step, now, content);
    assert.deepEqual(step, end);
  });
});

describe('Partie na żywo: the end and the gold', () => {
  test('a side with no cards left loses; both at once is a draw; after 20 rounds more cards, then more Życie, win', () => {
    let draw = laidOut({ me: [{ id: 'wolf', life: 1 }], foe: [{ id: 'fox', life: 1 }], meLines: [0, null, null], foeLines: [0, null, null] });
    draw = move(move(draw, 'me', 1000, { round: 1, lines: [0, null, null] }), 'foe', 2000, { round: 1, lines: [0, null, null] });
    assert.deepEqual([draw.result, draw.end, draw.step], ['drawn', 'out', null]);
    let won = laidOut({ me: [{ id: 'bear', level: 5 }, { id: 'wolf' }], foe: [{ id: 'squirrel', life: 1 }], meLines: [0, null, null], meHand: [1], foeLines: [0, null, null], lead: 'foe' });
    won = move(move(won, 'foe', 1000, { round: 1, lines: [0, null, null] }), 'me', 2000, { round: 1, lines: [0, 1, null] });
    assert.deepEqual([won.result, won.end], ['won', 'out']);
    assert.equal(duelView(won, 'foe', content).result, 'lost');
    let capped = laidOut({ me: [{ id: 'bear', level: 5 }, { id: 'wolf' }], foe: [{ id: 'bear', level: 5 }], meLines: [0, 1, null], foeLines: [0, null, null], round: rules.roundCap });
    capped = move(move(capped, 'me', 1000, { round: rules.roundCap, lines: [0, 1, null] }), 'foe', 2000, { round: rules.roundCap, lines: [0, null, null] });
    assert.deepEqual([capped.result, capped.end], ['won', 'cap']);
  });

  test('a surrender loses the match for who gives up', () => {
    const duel = fresh('poddaje');
    assert.deepEqual([surrenderDuel(duel, 'me').result, surrenderDuel(duel, 'foe').result], ['lost', 'won']);
    assert.equal(surrenderDuel(duel, 'foe').end, 'surrender');
    assert.equal(duel.result, null);
  });

  test('za wygraną zgarniesz obie stawki bez 5% (w dół); a draw gives each its stake back; nothing without a stake', () => {
    assert.equal(live.systemCut, 0.05);
    assert.deepEqual([100, 333, 500, 1000, 1].map((stake) => duelPot(stake, content)), [190, 632, 950, 1900, 1]);
    assert.deepEqual(duelPayout('won', 500, content), { me: 950, foe: 0 });
    assert.deepEqual(duelPayout('lost', 500, content), { me: 0, foe: 950 });
    assert.deepEqual(duelPayout('drawn', 500, content), { me: 500, foe: 500 });
    assert.deepEqual(duelPayout('won', 0, content), { me: 0, foe: 0 });
    assert.deepEqual(duelPayout(null, 500, content), { me: 0, foe: 0 });
  });

  test("the stakes: none, or Szczęsny's tiers' stakes at the lower level, up to his top tier's; none below level 20", () => {
    const top = hostTiers(content).at(-1);
    assert.deepEqual(duelStakes([30, 90], content), [0, ...hostTiers(content).map((tier) => tierStake(tier, 30, content))]);
    assert.deepEqual(duelStakes([30, 90], content), [0, 100, 200, 300, 400, 500]);
    assert.equal(duelStakes([90, 130], content).at(-1), tierStake(top, 90, content));
    assert.equal(duelStakes([90, 130], content).at(-1), 1000);
    assert.deepEqual(duelStakes([live.minLevel - 1, 90], content), [0]);
  });

  test("each sees the match from its own side: never the seed, the decks' order nor the other's reserve", () => {
    const duel = fresh('widok');
    for (const seat of ['me', 'foe']) {
      const view = duelView(duel, seat, content);
      const text = JSON.stringify(view);
      assert.ok(!text.includes('widok'));
      assert.equal(typeof view.foe.hand, 'number');
      assert.equal(view.me.hand.length, rules.hand);
      assert.equal(typeof view.me.deck, 'number');
      assert.equal(view.deadline, duel.deadline);
      assert.equal(view.step, duel.step === seat ? 'me' : 'foe');
      assert.deepEqual(view.me.hand.map((card) => card.key), duel[seat].hand);
    }
  });
});

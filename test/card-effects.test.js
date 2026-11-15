// Talia Systemu's effect cards in the engine (src/engine/cards.js; DECISIONS.md,
// "Karty efektów w Talii Systemu", 976–979): their strength by level, a
// deck's effect cards checked, a turn's effect card checked (one of the
// side's, not played, on the target its kind asks), each of the eight
// kinds in a round (Niedźwiedzia siła, Kamienna skóra, Żywa woda, Klątwa
// słabości, Zew watahy, Mgła, Pęta, Piorun Peruna), each once a match, the
// rival choosing its own where it pays, the pack's effect card by its
// chance, and the match as the page sees it.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  effectById,
  effectDeckBlock,
  effectOfRarity,
  effectPower,
  effectView,
  matchView,
  newMatch,
  packEffect,
  playTurn,
  rivalEffect,
  roundHits,
  starterDeck,
  turnBlock,
} from '../src/engine/index.js';
import { content } from './helpers/content.js';

const rules = content.cards.effects;
const starter = starterDeck(content).map((id) => ({ id, level: 1 }));
// A match of the starter deck against itself, with the player's effect
// cards as given, played until both sides have cards on all lines.
function matchWith(effects, foeEffects = []) {
  let match = newMatch({ seed: 'efekty', me: { cards: starter, effects }, foe: { cards: starter, smart: 1, effects: foeEffects } }, content);
  // The first round: three cards from the reserve on the lines.
  match = playTurn(match, { round: 1, lines: match.me.hand.slice(0, 3), skill: null }, content);
  return match;
}
const lineCard = (side, line) => side.cards[side.lines[line]];

describe('Karty efektów: liczby i talia (976, 977)', () => {
  test('eight cards, their strength growing by level, Pęta to 100% at the 5th', () => {
    assert.equal(rules.cards.length, 8);
    assert.equal(rules.slots, 2);
    assert.equal(effectPower('bear-strength', 1, content), 0.4);
    assert.equal(effectPower('bear-strength', 3, content), 0.6);
    assert.equal(effectPower('weakness-curse', 5, content), 0.4);
    assert.equal(effectPower('shackles', 4, content), 0.9);
    assert.equal(effectPower('shackles', 5, content), 1);
    assert.equal(effectPower('shackles', 9, content), 1);
    const view = effectView('perun-lightning', 2, content);
    assert.deepEqual([view.name, view.kind, view.target, view.rarity, view.power], ['Piorun Peruna', 'bolt', 'rival', 'epic', 0.25]);
    assert.match(view.text, /25% swojego Życia/);
  });

  test('a deck\'s effect cards: at most two different ones the character has', () => {
    assert.equal(effectDeckBlock([], [], content), null);
    assert.equal(effectDeckBlock(['mist', 'shackles'], ['mist', 'shackles'], content), null);
    assert.equal(effectDeckBlock(['mist', 'mist'], ['mist'], content).code, 'invalid_effects');
    assert.equal(effectDeckBlock(['mist', 'shackles', 'wolf-call'], ['mist', 'shackles', 'wolf-call'], content).code, 'invalid_effects');
    assert.equal(effectDeckBlock(['wolf'], ['wolf'], content).code, 'invalid_effects');
    assert.equal(effectDeckBlock(['mist'], [], content).code, 'effect_missing');
  });
});

describe('Karty efektów w partii (977.2 A)', () => {
  test('a turn\'s effect card: the side\'s own, not played, on the target its kind asks', () => {
    const match = matchWith([{ id: 'bear-strength', level: 1 }, { id: 'perun-lightning', level: 1 }]);
    const lines = [...match.me.lines];
    const turn = (effect) => turnBlock(match, { round: match.round, lines, skill: null, effect }, content);
    assert.equal(turn({ key: 0, target: lines[1] }), null);
    assert.equal(turn({ key: 0, target: 99 })?.code, 'invalid_effect');
    assert.equal(turn({ key: 1, target: 2 }), null);
    assert.equal(turn({ key: 1, target: 7 })?.code, 'invalid_effect');
    assert.equal(turn({ key: 5 })?.code, 'invalid_effect');
    // Once a match.
    const after = playTurn(match, { round: match.round, lines, skill: null, effect: { key: 0, target: lines[1] } }, content);
    if (!after.result) {
      const again = turnBlock(after, { round: after.round, lines: after.me.lines.map((key, line) => key ?? after.me.hand[line] ?? null), skill: null, effect: { key: 0, target: after.me.lines.find((key) => key !== null) } }, content);
      assert.equal(again?.code, 'effect_used');
    }
    assert.equal(after.me.effects[0].used, true);
    assert.equal(after.last.effect.kind, 'boost');
  });

  test('Niedźwiedzia siła and Zew watahy: the blows of this round stronger', () => {
    const plain = matchWith([{ id: 'bear-strength', level: 1 }, { id: 'wolf-call', level: 1 }]);
    const key = plain.me.lines[0];
    const base = roundHits(plain, content).filter((hit) => hit.side === 'me');
    const boosted = roundHits(plain, content, { effect: { key: 0, target: key } }).filter((hit) => hit.side === 'me');
    const one = (list) => list.find((hit) => hit.key === key).damage;
    assert.ok(Math.abs(one(boosted) / one(base) - 1.4) < 0.05, `${one(boosted)} ${one(base)}`);
    for (const hit of boosted.filter((hit) => hit.key !== key)) assert.equal(hit.damage, base.find((other) => other.key === hit.key).damage);
    const rallied = roundHits(plain, content, { effect: { key: 1 } }).filter((hit) => hit.side === 'me');
    for (const hit of rallied) assert.ok(hit.damage > base.find((other) => other.key === hit.key).damage || hit.damage === 1, String(hit.damage));
  });

  test('Kamienna skóra: the blows at the chosen card weaker; Pęta: the rival\'s card weaker, at the 5th level not at all', () => {
    const match = matchWith([{ id: 'stone-skin', level: 1 }, { id: 'shackles', level: 5 }]);
    const key = match.me.lines[0];
    const atMe = (hits) => hits.filter((hit) => hit.side === 'foe' && hit.target.key === key).reduce((sum, hit) => sum + hit.damage, 0);
    const base = roundHits(match, content);
    const guarded = roundHits(match, content, { effect: { key: 0, target: key } });
    if (atMe(base) > 0) assert.ok(atMe(guarded) < atMe(base) * 0.7 + 1, `${atMe(guarded)} ${atMe(base)}`);
    const bound = roundHits(match, content, { effect: { key: 1, target: 1 } });
    const rivalKey = match.foe.lines[1];
    assert.equal(bound.find((hit) => hit.side === 'foe' && hit.key === rivalKey).damage, 0);
  });

  test('Żywa woda heals up to the card\'s Życie at the start, Piorun Peruna takes a share before the blows, Klątwa słabości stays', () => {
    let match = matchWith([{ id: 'living-water', level: 1 }, { id: 'perun-lightning', level: 1 }]);
    const key = match.me.lines[0];
    match.me.cards[key].life = Math.round(match.me.cards[key].max / 2);
    const lines = [...match.me.lines];
    const healed = playTurn(match, { round: match.round, lines, skill: null, effect: { key: 0, target: key } }, content);
    const taken = healed.last.hits.filter((hit) => hit.target.key === key && hit.side === 'foe').reduce((sum, hit) => sum + hit.damage, 0);
    const card = healed.me.cards[key];
    assert.equal(card.life + taken, Math.min(card.max, Math.round(card.max / 2) + Math.round(card.max * 0.4)) || card.life + taken);
    // The bolt before the blows: the rival's card loses a share of its Życie, never all.
    match = matchWith([{ id: 'perun-lightning', level: 1 }]);
    const rivalKey = match.foe.lines[2];
    const before = match.foe.cards[rivalKey].life;
    const bolted = playTurn(match, { round: match.round, lines: [...match.me.lines], skill: null, effect: { key: 0, target: 2 } }, content);
    const blows = bolted.last.hits.filter((hit) => hit.side === 'me' && hit.target.key === rivalKey).reduce((sum, hit) => sum + hit.damage, 0);
    assert.equal(Math.max(0, before - Math.max(1, Math.round(before * 0.2)) - blows), bolted.foe.cards[rivalKey].life);
    // The curse: the card's blows weaker for the rest of the match.
    match = matchWith([{ id: 'weakness-curse', level: 1 }]);
    const cursedKey = match.foe.lines[0];
    const cursed = playTurn(match, { round: match.round, lines: [...match.me.lines], skill: null, effect: { key: 0, target: 0 } }, content);
    assert.equal(cursed.foe.cards[cursedKey].cursed, 0.2);
    assert.equal(matchView(cursed, content).foe.lines.find((one) => one?.key === cursedKey)?.cursed ?? 0.2, 0.2);
  });

  test('Mgła: some of the rival\'s blows at the side\'s cards miss, from the match\'s seed, none without it', () => {
    let misses = 0;
    let blows = 0;
    for (let index = 0; index < 30; index += 1) {
      const match = newMatch({ seed: `mgla:${index}`, me: { cards: starter, effects: [{ id: 'mist', level: 5 }] }, foe: { cards: starter, smart: 1 } }, content);
      const first = playTurn(match, { round: 1, lines: match.me.hand.slice(0, 3), skill: null }, content);
      if (first.result) continue;
      const turn = { round: first.round, lines: [...first.me.lines], skill: null, effect: { key: 0 } };
      const played = playTurn(first, turn, content);
      const theirs = played.last.hits.filter((hit) => hit.side === 'foe');
      blows += theirs.length;
      misses += theirs.filter((hit) => hit.missed).length;
      assert.ok(played.last.hits.filter((hit) => hit.side === 'me').every((hit) => !hit.missed));
      assert.deepEqual(playTurn(first, turn, content).last.hits, played.last.hits);
    }
    assert.ok(blows > 30);
    const share = misses / blows;
    assert.ok(share > 0.25 && share < 0.65, `${misses} of ${blows}`);
  });

  test('the rival plays its effect card where it pays, chosen before the player answers, and the page sees it', () => {
    let played = 0;
    for (let index = 0; index < 20; index += 1) {
      let match = newMatch({ seed: `rywal:${index}`, me: { cards: starter }, foe: { cards: starter, smart: 2, effects: [{ id: 'shackles', level: 5 }, { id: 'perun-lightning', level: 5 }] } }, content);
      for (let round = 0; round < 4 && !match.result; round += 1) {
        const lines = match.me.lines.map((key, line) => key ?? match.me.hand[line] ?? null);
        const unique = lines.filter((key, at) => key === null || lines.indexOf(key) === at);
        if (unique.length !== 3) break;
        const view = matchView(match, content);
        if (view.foe.effectPlan) {
          played += 1;
          assert.ok(['shackles', 'perun-lightning'].includes(view.foe.effectPlan.id));
          const next = playTurn(match, { round: match.round, lines, skill: null }, content);
          assert.equal(next.last.rivalEffect.id, view.foe.effectPlan.id);
          match = next;
        } else match = playTurn(match, { round: match.round, lines, skill: null }, content);
      }
    }
    assert.ok(played > 0);
    // Nothing of the player's on the table: none.
    const empty = newMatch({ seed: 'pusto', me: { cards: starter }, foe: { cards: starter, smart: 2, effects: [{ id: 'shackles', level: 5 }] } }, content);
    assert.equal(rivalEffect(empty, content), null);
  });
});

describe('Skąd karty efektów (977.3 B)', () => {
  test('the pack\'s effect card comes by its chance, by the weights, never at its top level', () => {
    let count = 0;
    const seen = new Set();
    for (let index = 0; index < 2000; index += 1) {
      const id = packEffect({ maxed: [], seed: `pakiet:${index}` }, content);
      if (id) {
        count += 1;
        seen.add(effectById(id, content).rarity);
      }
    }
    assert.ok(Math.abs(count / 2000 - rules.packChance) < 0.04, String(count));
    assert.deepEqual([...seen].sort(), Object.keys(rules.weights).sort());
    const all = rules.cards.map((one) => one.id);
    assert.equal(packEffect({ maxed: all, seed: 'pakiet:1' }, content), null);
    // A tier's first win: one of its rarity the character has not got first.
    const commons = rules.cards.filter((one) => one.rarity === 'common').map((one) => one.id);
    assert.equal(effectOfRarity('common', { owned: [commons[0]], maxed: [] }, 'pierwsza', content), commons[1]);
    assert.equal(effectOfRarity('common', { owned: commons, maxed: commons }, 'pierwsza', content), null);
  });
});

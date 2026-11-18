// Nawia (levels 276–350, 1088 B and 1096): three lands of five places each,
// Mgliste Bagna Nawii, Łąki Welesa and Kraina bez Słońca, with their traits,
// on both sides: Mgła zaświatów (any blow may miss in the fog), Czary Welesa
// (spells 5% stronger) and Bez słońca (every heal 5% weaker); and the new
// ways of fighting of their creatures: a stun, a silence, two blows in a
// move, the whole foremost row trampled, two effects at once, a blow struck
// back, a spring's water, a rise once a fight and a change of shape with
// every move.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createRng, monsterCombatant, playerCombatant, simulateFight } from '../src/engine/index.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';

const BLOWS = new Set(['hit', 'crit', 'dodge']);
const LANDED = new Set(['hit', 'crit']);

// A character of a class that does not fall, with no Will to keep effects
// off and no dodge.
function member(classId, id, level = 280) {
  const { character, equipped } = typicalCharacter(classId, level, content);
  return { ...playerCombatant({ character, equipped, name: `${classId} ${id}`, id }, content), maxHp: 1e8, hp: 1e8, willRating: 0, dodgeRating: 0 };
}

// A creature that does not fall, its attack changed by `attack`.
function creature(monsterId, level, attack = {}, id = 'e0') {
  const unit = monsterCombatant({ monsterId, level, id }, content);
  return { ...unit, weapon: { ...unit.weapon, ...attack }, maxHp: 1e8, hp: 1e8 };
}

const fight = (allies, enemies, seed, trait = null) => simulateFight({ allies, enemies, rng: createRng(seed), content, record: true, trait });
const blowsOf = (result, id) => result.events.filter((event) => event.actor === id && BLOWS.has(event.kind) && !event.counter);

describe('the traits of Nawia, on both sides', () => {
  test('Mgła zaświatów: any blow may miss in the fog, a creature’s and a character’s, and nowhere else', () => {
    const allies = [member('warrior', 'a0')];
    const enemies = [creature('hen-leg-hut', 280)];
    const misses = (trait) => fight(allies, enemies, 'mgla', trait).events.filter((event) => event.kind === 'dodge' && event.missed === true);
    assert.equal(misses(null).length, 0);
    const foggy = fight(allies, enemies, 'mgla', { missChance: 0.2 });
    const missed = foggy.events.filter((event) => event.kind === 'dodge' && event.missed === true);
    const share = (side) => missed.filter((event) => event.actor === side).length / blowsOf(foggy, side).length;
    for (const side of ['a0', 'e0']) assert.ok(share(side) > 0.12 && share(side) < 0.3, `${side}: ${share(side)}`);
    const names = { a0: allies[0].name, e0: enemies[0].name };
    const said = (event) => content.texts.fogMiss.map((text) => text.replaceAll('{actor}', names[event.actor]).replaceAll('{target}', names[event.target]));
    assert.ok(missed.every((event) => said(event).includes(event.text)), missed.map((event) => event.text).join(' / '));
  });

  test('Czary Welesa: a spell strikes 5% harder, a physical blow as before', () => {
    const blows = (enemy, trait) => fight([member('warrior', 'a0')], [enemy], 'czary', trait).events.filter((event) => event.actor === 'e0' && LANDED.has(event.kind));
    const spell = creature('seeress', 280);
    assert.equal(spell.weapon.category, 'magical');
    const [plain] = blows(spell, null);
    const [strong] = blows(spell, { spellBonus: 0.05 });
    assert.ok(Math.abs(strong.damage - plain.damage * 1.05) <= 1, `${strong.damage} of ${plain.damage}`);
    const claw = creature('hen-leg-hut', 280);
    assert.equal(claw.weapon.category, 'physical');
    assert.deepEqual(blows(claw, { spellBonus: 0.05 }).map((event) => event.damage), blows(claw, null).map((event) => event.damage));
  });

  test('Bez słońca: drained life and a potion give back 5% less', () => {
    const leech = { ...creature('changeling', 280, { drain: 0.5 }), hp: 1e7 };
    const drained = (trait) => fight([member('warrior', 'a0')], [leech], 'slonce', trait).events.find((event) => event.kind === 'drain' && event.actor === 'e0');
    const [before, after] = [drained(null), drained({ healMalus: 0.05 })];
    assert.ok(Math.abs(after.amount - before.amount * 0.95) <= 1, `${after.amount} of ${before.amount}`);
  });
});

describe('the ways of fighting of Nawia’s creatures', () => {
  test('Ogłuszenie: a stunned character loses its next move, its card says so', () => {
    const allies = [member('warrior', 'a0')];
    const plain = fight(allies, [creature('hen-leg-hut', 280)], 'ogluszenie');
    const stunning = fight(allies, [creature('hen-leg-hut', 280, { stun: { chance: 1, label: 'ogłuszony' } })], 'ogluszenie');
    const stuns = stunning.events.filter((event) => event.kind === 'stun');
    assert.ok(stuns.length > 0);
    assert.ok(stuns.every((event) => event.target === 'a0' && event.label === 'ogłuszony'));
    assert.ok(blowsOf(stunning, 'a0').length < blowsOf(plain, 'a0').length);
    // Will keeps it off as it does a mire, up to its cap.
    const withWill = (willRating) =>
      fight([{ ...member('warrior', 'a0'), willRating }], [creature('hen-leg-hut', 280, { stun: { chance: 0.5, label: 'ogłuszony' } })], 'ogluszenie-wola').events.filter((event) => event.kind === 'stun').length;
    assert.ok(withWill(1e9) < withWill(0), `${withWill(1e9)} of ${withWill(0)}`);
  });

  test('Cisza: a silenced character uses no skill on its next move, only its blow', () => {
    const mage = member('mage', 'a0');
    const usual = fight([mage], [creature('hen-leg-hut', 280)], 'cisza');
    assert.ok(usual.events.some((event) => event.actor === 'a0' && event.skill));
    const hushed = fight([mage], [creature('hen-leg-hut', 280, { silence: { chance: 1, label: 'uciszony' } })], 'cisza');
    const silences = hushed.events.filter((event) => event.kind === 'slow' && event.silence);
    assert.ok(silences.length > 0);
    for (const silence of silences) {
      assert.deepEqual([silence.targets, silence.effect], [['a0'], 'uciszony']);
      const next = hushed.events.slice(hushed.events.indexOf(silence) + 1).find((event) => event.actor === 'a0' && (BLOWS.has(event.kind) || event.kind === 'skill'));
      if (next) assert.equal(next.skill, undefined, next.text);
    }
  });

  test('two blows in a move: the same target twice while it stands', () => {
    const result = fight([member('warrior', 'a0'), member('mage', 'a1')], [creature('viper', 280, { hits: 2 })], 'dwa-kesy');
    const moments = new Map();
    for (const event of blowsOf(result, 'e0')) moments.set(event.t, [...(moments.get(event.t) ?? []), event]);
    assert.ok(moments.size >= 10);
    for (const blows of moments.values()) {
      assert.equal(blows.length, 2);
      assert.equal(blows[0].target, blows[1].target);
    }
  });

  test('Tratowanie: every one in the foremost row at full strength, nobody behind it', () => {
    const allies = [member('warrior', 'a0'), member('warrior', 'a1'), member('mage', 'a2')];
    const result = fight(allies, [creature('hen-leg-hut', 280, { trample: true })], 'tratowanie');
    const moments = new Map();
    for (const event of blowsOf(result, 'e0')) moments.set(event.t, [...(moments.get(event.t) ?? []), event]);
    assert.ok(moments.size >= 10);
    for (const blows of moments.values()) {
      assert.deepEqual(blows.map((event) => event.target).sort(), ['a0', 'a1']);
      assert.equal(blows[0].sweep, undefined);
      assert.equal(blows[1].sweep, true);
    }
  });

  test('two effects at once: each with its own chance', () => {
    const flame = creature('hen-leg-hut', 280, { dot: { effect: 'burning', chance: 1, power: 0.2, ticks: 2 }, dot2: { effect: 'chilled', chance: 1, power: 0.2, ticks: 2 } });
    const result = fight([member('warrior', 'a0')], [flame], 'dwa-efekty');
    const first = result.events.find((event) => event.actor === 'e0' && LANDED.has(event.kind));
    const effects = result.events.filter((event) => event.kind === 'effect' && event.actor === 'e0' && event.t === first.t).map((event) => event.effect);
    assert.deepEqual(effects.sort(), [content.effectsById.burning.name, content.effectsById.chilled.name].sort());
  });

  test('Zemsta: whoever strikes Wróżda is struck back at once, never an answer to an answer', () => {
    const avenger = { ...creature('seeress', 280), vengeance: 0.5 };
    const result = fight([member('warrior', 'a0')], [avenger], 'zemsta');
    const landed = result.events.filter((event) => event.actor === 'a0' && LANDED.has(event.kind) && !event.counter);
    const back = result.events.filter((event) => event.actor === 'e0' && event.counter);
    assert.ok(landed.length >= 10);
    assert.equal(back.length, landed.length);
    assert.ok(back.every((event) => event.target === 'a0'));
    for (const event of landed) {
      const answer = result.events[result.events.indexOf(event) + 1];
      assert.deepEqual([answer.actor, answer.counter, answer.t], ['e0', true, event.t]);
    }
  });

  test('Źródło: Wężowa Panna heals a share of her HP at the start of each of her moves', () => {
    const maiden = { ...creature('viper', 280), regen: 0.05, hp: 5e7 };
    const result = fight([member('warrior', 'a0')], [maiden], 'zrodlo');
    const springs = result.events.filter((event) => event.kind === 'drain' && event.actor === 'e0');
    assert.ok(springs.length >= 10);
    assert.equal(springs[0].amount, 5e6);
    assert.ok(springs.every((event) => event.amount > 0 && event.amount <= 5e6));
  });

  test('Kościej rises once with half its HP, and the second time it falls for good', () => {
    const koschei = { ...monsterCombatant({ monsterId: 'hen-leg-hut', level: 280, id: 'e0' }, content), rises: 0.5 };
    const result = fight([member('warrior', 'a0'), member('warrior', 'a1'), member('warrior', 'a2')], [koschei], 'kosciej');
    const rises = result.events.filter((event) => event.kind === 'drain' && event.actor === 'e0');
    assert.equal(rises.length, 1);
    assert.equal(rises[0].amount, Math.round(koschei.maxHp / 2));
    assert.equal(result.events.filter((event) => event.kind === 'kill' && event.target === 'e0').length, 1);
    assert.equal(result.won, true);
  });

  test('Postacie: a new shape with every move, in turn, each with its own blow', () => {
    const base = creature('hen-leg-hut', 280);
    const snake = { ...base.weapon, attackName: 'Wężowy jad', category: 'magical', element: 'poison' };
    const shapes = [
      { name: 'starzec', weapon: base.weapon, damageScale: base.damageScale },
      { name: 'wąż', weapon: snake, damageScale: base.damageScale },
    ];
    const result = fight([member('warrior', 'a0')], [{ ...base, shapes }], 'postacie');
    const own = result.events.filter((event) => event.actor === 'e0' && (BLOWS.has(event.kind) || event.kind === 'skill'));
    const names = own.filter((event) => event.kind !== 'skill').map((event) => (event.text.includes('Wężowy jad') ? 'wąż' : 'starzec'));
    assert.ok(names.length >= 10);
    assert.ok(names.every((name, index) => name === (index % 2 === 0 ? 'starzec' : 'wąż')), names.join(' '));
    const changes = own.filter((event) => event.kind === 'skill').map((event) => event.skillName);
    assert.equal(changes[0], 'wąż');
    assert.ok(changes.every((name, index) => name === (index % 2 === 0 ? 'wąż' : 'starzec')));
  });
});

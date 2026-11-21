// Mana ×2, Mądrość and Zręczność (the author, 20.11.2026: „zwiększ jeszcze
// bardziej użycie many by mikstury miały sens, myślę, że dwukrotne
// zwiększenie użycia to minimum” and „Daj też boost jakiś dla statystyki
// Mądrość i chyba Zręczność”). A skill costs its whole cost and 6% of the
// maximum mana, a summon priced in a share of it twice that share; the
// players' duels pay as before (balance.skills.duelManaCost). Mądrość
// strengthens the healing and mana potions, 1% for every 20 points, at
// most 50% (balance.potionWisdom), in every fight, in the threat and from
// the bag, and the stats screen says so. A point of Zręczność gives 3 of
// dodge rating instead of 2, and the creatures keep 2
// (balance.monsters.dodgePerDexterity).

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  createRng,
  duelist,
  extraValues,
  faintChances,
  monsterCombatant,
  playerCombatant,
  potionBonus,
  simulateFight,
  statShares,
  threatSamples,
} from '../src/engine/index.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';

// A Wojownik of level 12 with `wisdom` points more and the skill asked for.
function wise(wisdom, skills = {}) {
  const { character, equipped } = typicalCharacter('warrior', 12, content);
  const points = { ...character.points, wisdom: (character.points.wisdom ?? 0) + wisdom };
  return { character: { ...character, classLevel: Math.max(character.classLevel, 10), points, skills }, equipped };
}
const unitOf = ({ character, equipped }, hpShare = 1) => {
  const unit = playerCombatant({ character, equipped, name: 'Mira' }, content);
  return { ...unit, hp: Math.round(unit.maxHp * hpShare) };
};
const sturdy = () => ({ ...monsterCombatant({ monsterId: 'boar', level: 12, id: 'e0', name: 'Wróg' }, content), hp: 5000, maxHp: 5000 });
const fight = (seed, ally) => simulateFight({ allies: [ally], enemies: [sturdy()], rng: createRng(seed), content, record: true });
const drunk = (result, effect) => result.events.find((event) => event.kind === 'potion' && event.effect === effect);

describe('Mana ×2, Mądrość and Zręczność (20.11.2026)', () => {
  test('the numbers in the data', () => {
    const { skills, potionWisdom, combat, monsters } = content.balance;
    assert.deepEqual(skills.manaCost, { base: 1, share: 0.06, manaShareFactor: 2 });
    assert.deepEqual(skills.duelManaCost, { base: 0.5, share: 0.03 });
    assert.deepEqual(potionWisdom, { per: 20, step: 0.01, cap: 0.5 });
    assert.equal(combat.dodgePerDexterity, 3);
    assert.equal(combat.dodgeCap, 0.3);
    assert.equal(monsters.dodgePerDexterity, 2);
  });

  test('Mądrość: 1% more of what the potions restore for every whole 20 points, at most 50%', () => {
    const at = (wisdom) => potionBonus(wisdom, content.balance);
    assert.deepEqual([at(0), at(19), at(20), at(39), at(245), at(999), at(1000), at(5000)], [0, 0, 0.01, 0.01, 0.12, 0.49, 0.5, 0.5]);
    assert.equal(potionBonus(500, { ...content.balance, potionWisdom: undefined }), 0);
  });

  test('a healing potion heals and a mana potion restores a share more with Mądrość, in the fight', () => {
    const heal = { id: 'lesser-healing', accusative: 'Mniejszą miksturę leczenia', amount: 0.2, below: 0.4 };
    const plain = unitOf(wise(0), 0.6);
    const sage = unitOf(wise(400), 0.6);
    assert.equal(plain.potionBonus, undefined);
    assert.equal(sage.potionBonus, potionBonus(sage.wisdom, content.balance));
    assert.ok(sage.potionBonus >= 0.2);
    assert.equal(drunk(fight('lecz', { ...plain, potions: { heal } }), 'heal').amount, Math.round(0.2 * plain.maxHp));
    assert.equal(drunk(fight('lecz', { ...sage, potions: { heal } }), 'heal').amount, Math.round(0.2 * (1 + sage.potionBonus) * sage.maxHp));
    // A mana potion when Potężny cios lacks mana, as much more.
    const mana = { id: 'lesser-mana', accusative: 'Mniejszą miksturę many', amount: 0.3 };
    const striker = unitOf(wise(400, { 'power-strike': 1 }));
    const restored = drunk(fight('mana', { ...striker, potions: { mana } }), 'mana');
    assert.ok(restored, 'drunk');
    assert.ok(restored.amount <= Math.round(0.3 * (1 + striker.potionBonus) * striker.maxMana));
    assert.ok(restored.amount > Math.round(0.3 * striker.maxMana));
  });

  test('the threat counts the healing potions as strong as Mądrość makes them', () => {
    const { character, equipped } = wise(800);
    const areaId = content.areas.find((area) => area.minLevel <= 12 && area.maxLevel >= 12).id;
    const samples = threatSamples({ character, equipped, areaId }, content);
    assert.equal(samples.potionBonus, unitOf({ character, equipped }).potionBonus);
    const healing = { count: 3, amount: 0.2, below: 0.4 };
    const input = { character, equipped, hp: 1, areaId, healing };
    const weak = faintChances(input, content, { ...samples, potionBonus: 0 });
    const strong = faintChances(input, content, samples);
    assert.ok(Object.keys(strong).every((minutes) => strong[minutes] <= weak[minutes] + 1e-12));
    assert.ok(Object.keys(strong).some((minutes) => strong[minutes] < weak[minutes]));
  });

  test('Postać › Statystyki: what Mądrość gives the potions, with the rule', () => {
    const { character, equipped } = wise(400);
    const shares = statShares(character, equipped, content);
    const unit = unitOf({ character, equipped });
    assert.equal(shares.wisdom.potions, unit.potionBonus);
    for (const stat of content.statIds.filter((id) => id !== 'wisdom')) assert.equal(shares[stat].potions, undefined, stat);
    const extra = extraValues(character, equipped, content);
    assert.deepEqual(extra.potions, { bonus: unit.potionBonus, wisdom: Math.round(unit.wisdom), rule: content.balance.potionWisdom });
  });

  test('a skill costs its whole cost and 6%, a summon twice its share; in the players\' duels as before', () => {
    const { character, equipped } = typicalCharacter('mage', 60, content);
    const arcanist = { ...character, classLevel: 60, evolution: 'arcanist', skills: { fireball: 1, 'elemental-summon': 1 } };
    const fighter = playerCombatant({ character: arcanist, equipped, name: 'Mira' }, content);
    const cost = (unit, id) => unit.skills.find((skill) => skill.id === id).mana;
    const fireball = content.skillsById.fireball.mana;
    assert.equal(cost(fighter, 'fireball'), fireball + Math.round(fighter.maxMana * 0.06));
    assert.equal(cost(fighter, 'elemental-summon'), Math.round(fighter.maxMana * 0.5));
    const inDuel = duelist({ character: arcanist, equipped, name: 'Mira' }, 'a0', 'ally', { factor: 1, armor: 1 }, content);
    assert.equal(inDuel.maxMana, fighter.maxMana);
    assert.equal(cost(inDuel, 'fireball'), Math.max(fireball, Math.round(fireball * 0.5) + Math.round(inDuel.maxMana * 0.03)));
    assert.equal(cost(inDuel, 'elemental-summon'), Math.round(inDuel.maxMana * 0.25));
  });

  test('Zręczność: 3 of dodge rating a point for the characters, 2 for the creatures as before', () => {
    const { character, equipped } = typicalCharacter('archer', 60, content);
    const archer = playerCombatant({ character, equipped, name: 'Mira' }, content);
    const asBefore = playerCombatant({ character, equipped, name: 'Mira' }, { ...content, balance: { ...content.balance, combat: { ...content.balance.combat, dodgePerDexterity: 2 } } });
    assert.ok(Math.abs(archer.dodgeRating / asBefore.dodgeRating - 1.5) < 1e-9);
    // The creatures keep their number, not the characters'.
    const wolf = monsterCombatant({ monsterId: 'wolf', level: 60, id: 'e0' }, content);
    const shared = monsterCombatant({ monsterId: 'wolf', level: 60, id: 'e0' }, { ...content, balance: { ...content.balance, monsters: { ...content.balance.monsters, dodgePerDexterity: undefined } } });
    assert.ok(wolf.dodgeRating > 0);
    assert.ok(Math.abs(shared.dodgeRating / wolf.dodgeRating - 1.5) < 1e-9);
  });
});

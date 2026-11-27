// The Cień's poison path, Truciciel → Nekromanta → Licz (1277 A,
// 27.11.2026; DECISIONS.md, „Cień i ścieżka Nekromanty (1277 A,
// 27.11.2026)”). A player asked whether the Cień is the weakest class: its
// single blows are the smallest in the game, but it moves twice as often and
// deals the most damage after the Łucznik. The weak one was this path: its
// damage is mostly poison, which does not stack, and summons, so the
// Nekromanta and the Licz killed 15–23% slower than the other forms, their
// companions fell, they fainted on long explorations and the Nekromanta won
// 26–36% of its duels. The author chose 1277 A: the two forms' own skills
// half as strong again (Wskrzeszenie's skeleton, Klątwa rozkładu's poison,
// Armia umarłych's knight), in every fight. Their later forms, the
// Truciciel and Dotyk śmierci stay as they were.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { contentIn } from '../src/server/content.js';
import { skillParams, skillText, topLevel } from '../src/engine/skills.js';
import { measure } from '../tools/pvp-arena-sim.mjs';
import { content } from './helpers/content.js';

const skill = (id) => content.skillsById[id];

describe('the Nekromanta and the Licz (1277 A)', () => {
  test('the data: Wskrzeszenie, Klątwa rozkładu and Armia umarłych half as strong again, nothing else of the path changed', () => {
    assert.deepEqual(skill('raise-dead').params.power, [0.75, 1.35]);
    assert.deepEqual(skill('curse-of-decay').params.dotPower, [0.375, 0.6]);
    assert.deepEqual(skill('army-of-dead').params.power, [1.35, 1.95]);
    // The rest of these skills as before.
    assert.deepEqual(skill('raise-dead').params.hp, [0.3, 0.45]);
    assert.deepEqual(skill('raise-dead').params.dotPower, [0.25, 0.4]);
    assert.deepEqual(skill('curse-of-decay').params.decay, [0.03, 0.06]);
    assert.deepEqual(skill('army-of-dead').params.dotPower, [0.4, 0.55]);
    // Dotyk śmierci half as strong again gave the Licz 80% of its duels on
    // average over levels 210–290, the Truciciel's poison hardly helped it.
    assert.deepEqual(skill('death-touch').params.power, [1.4, 2.0]);
    assert.deepEqual(skill('black-venom').params.dotPower, [0.2, 0.32]);
    // The staff keeps hitting at 80% of a Mage's in the whole line.
    assert.equal(content.evolutionsById.necromancer.weaponDamage, 0.8);
    for (const id of ['lich', 'navia-king', 'navia-emperor']) assert.equal(content.evolutionsById[id].weaponDamage, undefined, id);
  });

  test('the skills\' words give the new numbers, in Polish and in English, at the first and the top level', () => {
    const words = {
      'raise-dead': [['za 75% obrażeń', 'for 75% damage'], ['za 135% obrażeń', 'for 135% damage']],
      'curse-of-decay': [['traci po 38% obrażeń', 'loses 38% of'], ['traci po 60% obrażeń', 'loses 60% of']],
      'army-of-dead': [['za 135% obrażeń', 'for 135% damage'], ['za 195% obrażeń', 'for 195% damage']],
    };
    for (const [lang, index] of [['pl', 0], ['en', 1]]) {
      const data = contentIn(lang);
      for (const [id, [first, top]] of Object.entries(words)) {
        const one = data.skillsById[id];
        const at = (level) => skillText(one.effect, one, skillParams(one, level, data), data);
        assert.ok(at(1).includes(first[index]), `${lang} ${id} 1: ${at(1)}`);
        assert.ok(at(topLevel(one, data)).includes(top[index]), `${lang} ${id} top: ${at(topLevel(one, data))}`);
      }
    }
  });

  test('in the Arena the Nekromanta wins at least 35% of its duels at level 100 and the Licz at least 45% at level 200 (before 1277 A: 31% and 39%)', () => {
    // tools/pvp-arena-sim.mjs as the evolution tests take it: every path
    // against every path, one seed, the realistic gear.
    const second = measure({ level: 100, seeds: 1, model: 'realistic', paths: true }, content);
    assert.ok(second.paths.necromancer >= 0.35, `the Nekromanta wins ${second.paths.necromancer}`);
    const third = measure({ level: 200, seeds: 1, model: 'realistic', paths: true }, content);
    assert.ok(third.paths.lich >= 0.45, `the Licz wins ${third.paths.lich}`);
  });
});

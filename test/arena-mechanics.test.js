// The Arena through the forms' mechanics (1271 B, 26.11.2026; the author:
// „trzeba rozwiązać balans postaci inaczej niż przez te modyfikatory na
// arenie, to trzeba dogłębnie z pozycji mechanik”; DECISIONS.md, „Arena
// przez mechanikę (1271 B, 26.11.2026)”). No form has a strength of its own
// in the players' duels any more (duelPower, duelHp and duelSummonPower are
// gone; test/pvp-arena.test.js has the duels' new rules: the judge, every
// summon's HP from the HP before the factor, a shield's share as dealt).
// Instead 28 numbers of 18 forms' skills and traits changed, the same in
// every fight: a verdict strikes a lone foe at any HP, Stos burns a lone foe
// harder, the Tytan's shockwave passes all armour, the Archanioł heals
// again and again, the Pradruid's Wisdom gives its summons HP and no more
// blows, and the weaker sides: the Władca Piorunów's ball, the
// Gromowładny's stuns and slow, the Mistrz Łowów's harpoon, the Bastion's
// throwing back and the hurricanes' bleeding.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import { createRng, monsterCombatant, playerCombatant, simulateFight } from '../src/engine/index.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';

const english = JSON.parse(readFileSync(new URL('../data/en/evolutions.json', import.meta.url), 'utf8'));
const skill = (id) => content.skillsById[id];
const BLOWS = ['hit', 'crit'];

// A character of a form at its stage's usual levels (as the evolution
// tests make them), with the form's skills at their stage's level (`only`:
// just these of them).
const STAGES = { 2: [90, 120, 50], 3: [160, 230, 100], 4: [270, 330, 150], 5: [350, 420, 200] };
function form(evolutionId, { only, id = 'a0' } = {}) {
  const evolution = content.evolutionsById[evolutionId];
  const [level, classLevel, skillLevel] = STAGES[evolution.stage];
  const { character, equipped } = typicalCharacter(evolution.classId, level, content);
  const skills = Object.fromEntries(evolution.skills.filter((one) => !only || only.includes(one)).map((one) => [one, skillLevel]));
  return playerCombatant({ character: { ...character, classLevel, skills, evolution: evolutionId }, equipped, name: evolution.name, id }, content);
}
// A creature of a level with plenty of HP; `soft`: striking a quarter as
// hard, so the character lasts it out.
const sturdy = (monsterId, level, id, { soft = true, ...extra } = {}) => {
  const unit = monsterCombatant({ monsterId, level, id }, content);
  return { ...unit, hp: 200000, maxHp: 200000, ...(soft && { damageScale: unit.damageScale * 0.25 }), ...extra };
};
const fight = (seed, allies, enemies, maxActions) => simulateFight({ allies, enemies, rng: createRng(seed), content, record: true, ...(maxActions && { maxActions }) });
const withParam = (unit, skillId, key, value) => ({ ...unit, skills: unit.skills.map((one) => (one.id === skillId ? { ...one, params: { ...one.params, [key]: value } } : one)) });
const near = (actual, expected, tolerance, told) => assert.ok(Math.abs(actual - expected) <= tolerance * Math.abs(expected), `${told}: ${actual} vs ${expected}`);

describe('the forms evened out by their mechanics (1271 B)', () => {
  test('the data: the 28 numbers of 18 forms, the same in every fight', () => {
    const numbers = [
      ['thunder-orb', 'power', [0.25, 0.5]],
      ['sky-thunder', 'single', [2.0, 2.95]],
      ['perun-storm', 'stunChance', [0.12, 0.23]],
      ['ball-lightning', 'power', [0.6, 1.15]],
      ['unbending', 'reflect', [1.6, 2.4]],
      ['pyre', 'single', [1.6, 3.2]],
      ['pillar-of-light', 'single', [3.5, 6.6]],
      ['mountain-wrath', 'single', [4.8, 9.2]],
      ['mountain-wrath', 'armorIgnore', 1],
      ['earth-wrath', 'single', [5.0, 11.0]],
      ['earth-wrath', 'armorIgnore', 1],
      ['glory-hurricane', 'dotPower', [0.1, 0.19]],
      ['gods-hurricane', 'dotPower', [0.16, 0.35]],
      ['last-harvest', 'power', [5.3, 11.7]],
      ['oak-of-ages', 'root', [0.15, 0.28]],
      ['blade-storm', 'power', [1.1, 1.45]],
    ];
    for (const [id, key, value] of numbers) assert.deepEqual(skill(id).params[key], value, `${id} ${key}`);
    for (const id of ['final-verdict', 'last-judgment', 'day-of-wrath', 'fiery-sword']) assert.equal(skill(id).params.loneAny, true, id);
    assert.deepEqual(['harpoon', 'soul-harvest', 'last-harvest', 'divine-healing'].map((id) => skill(id).cooldown), [5, 2, 2, 6]);
    assert.equal(skill('divine-healing').once, undefined);
    assert.equal(content.evolutionsById.thunderer.trait.params.slow, 0.2);
    assert.deepEqual(['elder-druid', 'wilds-father'].map((id) => content.evolutionsById[id].trait.params.wisdomPower), [false, false]);
    // The other Druids keep Wisdom in their summons' blows.
    assert.deepEqual(['druid', 'archdruid'].map((id) => content.evolutionsById[id].trait.params.wisdomPower), [undefined, undefined]);
  });

  test('each changed skill and trait says the new rule, in Polish and in English', () => {
    for (const id of ['final-verdict', 'last-judgment', 'day-of-wrath', 'fiery-sword']) {
      assert.ok(skill(id).effect.endsWith(' Jedynego wroga wyrok trafia przy każdym jego HP.'), id);
      assert.ok(english.skills[id].effect.endsWith(' A lone enemy is struck at any HP.'), id);
    }
    assert.ok(skill('pyre').effect.endsWith('każdy wróg dostaje {power%} obrażeń sakrum, a jedyny wróg {single%}.'));
    assert.ok(english.skills.pyre.effect.endsWith('every enemy takes {power%} sacred damage, and a lone enemy {single%}.'));
    for (const id of ['mountain-wrath', 'earth-wrath']) {
      assert.match(skill(id).effect, /bez chybień i przez cały pancerz/, id);
      assert.match(english.skills[id].effect, /without a miss and through all armour/, id);
    }
    assert.match(skill('divine-healing').effect, /^Gdy HP spadnie poniżej/);
    assert.match(english.skills['divine-healing'].effect, /^When HP falls below/);
    assert.match(content.evolutionsById.thunderer.trait.text, /traci wtedy 20% szybkości/);
    assert.match(english.evolutions.thunderer.trait.text, /loses 20% speed/);
    for (const [id, points] of [['elder-druid', 20], ['wilds-father', 15]]) {
      assert.match(content.evolutionsById[id].trait.text, new RegExp(`Każde ${points} punktów Mądrości daje przywołańcom jeszcze 1% HP\\.`), id);
      assert.match(english.evolutions[id].trait.text, new RegExp(`Every ${points} points of Wisdom give the summons another 1% HP\\.`), id);
    }
  });

  test('a verdict strikes a lone foe at any HP with the first move, and among two foes at full HP waits for one below its mark', () => {
    for (const [evolutionId, verdict] of [['grand-inquisitor', 'final-verdict'], ['demon-slayer', 'last-judgment'], ['heaven-avenger', 'day-of-wrath'], ['heaven-sword', 'fiery-sword']]) {
      const unit = form(evolutionId, { only: [verdict] });
      const level = unit.level;
      const firstBlow = (enemies) => fight(`wyrok:${verdict}`, [unit], enemies, 12).events.find((event) => event.actor === 'a0' && [...BLOWS, 'dodge'].includes(event.kind));
      assert.equal(firstBlow([sturdy('boar', level, 'e0')]).skill, verdict, evolutionId);
      assert.notEqual(firstBlow([sturdy('boar', level, 'e0'), sturdy('wolf', level, 'e1')]).skill, verdict, evolutionId);
    }
  });

  test('Stos burns a lone foe with its own number (single) and every foe of a crowd with its power', () => {
    const inquisitor = form('grand-inquisitor', { only: ['pyre'] });
    const { power, single } = inquisitor.skills.find((one) => one.id === 'pyre').params;
    assert.ok(single > 3 * power);
    // The first burn of a lone foe, with the skill's `single` and without.
    const burn = (unit) => fight('stos', [unit], [sturdy('boar', unit.level, 'e0')], 20).events.find((event) => event.skill === 'pyre' && BLOWS.includes(event.kind)).damage;
    near(burn(inquisitor) / burn(withParam(inquisitor, 'pyre', 'single', undefined)), single / power, 0.02, 'Stos at a lone foe');
    // Two foes: each burns with the power, as before.
    const crowd = (unit) => fight('stos-dwa', [unit], [sturdy('boar', unit.level, 'e0'), sturdy('wolf', unit.level, 'e1')], 20).events.find((event) => event.skill === 'pyre' && BLOWS.includes(event.kind)).damage;
    assert.equal(crowd(inquisitor), crowd(withParam(inquisitor, 'pyre', 'single', undefined)));
  });

  test('the Tytan\'s and the Tarcza Świata\'s shockwave passes all armour', () => {
    for (const [evolutionId, wave] of [['titan', 'mountain-wrath'], ['world-shield', 'earth-wrath']]) {
      const unit = form(evolutionId, { only: [wave] });
      const blow = (armor) => fight(`fala:${wave}`, [unit], [sturdy('boar', unit.level, 'e0', { armor })], 12).events.find((event) => event.skill === wave && BLOWS.includes(event.kind)).damage;
      const bare = blow(0);
      assert.ok(bare > 0);
      assert.equal(blow(5000), bare, evolutionId);
      // A blow that minds armour would lose much of it.
      const minded = (armor) => fight(`fala:${wave}`, [withParam(unit, wave, 'armorIgnore', undefined)], [sturdy('boar', unit.level, 'e0', { armor })], 12).events.find((event) => event.skill === wave && BLOWS.includes(event.kind)).damage;
      assert.ok(minded(5000) < 0.8 * minded(0), evolutionId);
    }
  });

  test('the Archanioł\'s Boskie uzdrowienie comes again whenever HP falls below its mark, at most every 6th move, not once a fight', () => {
    const archangel = form('archangel', { only: ['divine-healing'] });
    const result = fight('uzdrowienie', [archangel], [sturdy('boar', archangel.level + 30, 'e0', { soft: false, hp: 1e7, maxHp: 1e7 })], 80);
    const healings = result.events.filter((event) => event.actor === 'a0' && event.skill === 'divine-healing' && event.kind === 'skill');
    assert.ok(healings.length >= 2, `${healings.length} healings`);
  });

  test('the Pradruid\'s and the Ojciec Puszczy\'s Wisdom gives their summons more HP and no stronger blows (until 1271 B both)', () => {
    // Twin fights against a sturdy boar, the summoner with 400 points more
    // of Wisdom or not: the first summon's HP and its first blow.
    const first = (unit) => {
      const result = fight('madrosc', [unit], [sturdy('boar', unit.level, 'e0')], 30);
      const up = result.events.find((event) => event.kind === 'summon' && event.state === 'up');
      const blow = result.events.find((event) => event.actor === 'a0' && BLOWS.includes(event.kind) && content.skillsById[event.skill]?.kind === 'summon');
      return { hp: up.summonHp, blow: blow.damage };
    };
    // The trait as it was: Wisdom in the blows too.
    const before = (unit) => ({ ...unit, feat: { ...unit.feat, wisdomPower: undefined } });
    for (const evolutionId of ['elder-druid', 'wilds-father']) {
      const unit = form(evolutionId);
      const wiser = { ...unit, wisdom: unit.wisdom + 400 };
      const [plain, wise] = [first(unit), first(wiser)];
      assert.ok(wise.hp > plain.hp, evolutionId);
      assert.equal(wise.blow, plain.blow, evolutionId);
      assert.ok(first(before(wiser)).blow > first(before(unit)).blow, evolutionId);
    }
  });
});

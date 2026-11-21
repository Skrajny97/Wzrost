// Mana in a fight's playback (21.11.2026; the author: „Powinien byc
// widoczny poziom many w walce (będzie to wymagało modyfikacji dodatkowej
// dla Osłony many itp.) jak komus spadnie mana wyjątkowo nisko to nie użyje
// umiejętności oczywiście”). A unit's view keeps its most mana and what the
// fight starts with (combatantView); a recorded fight's event carries the
// mana of each unit whose mana changed since the event before it (a skill
// paid, a mana potion, a mana shield's share); the report's fight of an
// exploration keeps the character's mana as it began and ended, for the
// line under it („Mana: 1552 → 340”). A fight kept before has none of it
// and plays without a bar (src/client/fight-mana.js).

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  applyHunt,
  combatantView,
  createRng,
  fightPotions,
  huntReport,
  monsterCombatant,
  playerCombatant,
  resolveEvent,
  simulateFight,
  simulateHunt,
} from '../src/engine/index.js';
import { fightManaLine, manaChanges, manaStart } from '../src/client/fight-mana.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';

const placeOf = (level) => content.areas.find((area) => level >= area.minLevel && level <= area.maxLevel);
// A character of a class with one skill learned, as test/skills.test.js has it.
function withSkill(classId, skillId, { level = 12, hpShare } = {}) {
  const { character, equipped } = typicalCharacter(classId, level, content);
  const skilled = { ...character, classLevel: Math.max(character.classLevel, 10), skills: { [skillId]: 1 } };
  const unit = playerCombatant({ character: skilled, equipped, name: 'Mira' }, content);
  return hpShare === undefined ? unit : { ...unit, hp: Math.round(unit.maxHp * hpShare) };
}
// A foe that does not fall quickly, so a fight lasts many moves.
const sturdy = (monsterId, level, id) => ({ ...monsterCombatant({ monsterId, level, id, name: `Wróg ${id}` }, content), hp: 5000, maxHp: 5000 });
const fight = (seed, allies, enemies) => simulateFight({ allies, enemies, rng: createRng(seed), content, record: true });

// The mana bars as the playback moves them: from each view's start, every
// event's changes in turn; each step the mana of every unit with a bar.
function bars(views, events) {
  const now = new Map(views.filter((view) => manaStart(view) !== null).map((view) => [view.id, manaStart(view)]));
  const steps = events.map((event) => {
    for (const [id, mana] of manaChanges(event)) {
      assert.ok(now.has(id), `${id} has a bar`);
      now.set(id, mana);
    }
    return new Map(now);
  });
  return { now, steps };
}

describe('the mana bar of a fight (21.11.2026)', () => {
  test("a unit's view keeps its most mana and what the fight starts with; a creature has none", () => {
    const area = placeOf(28);
    const { character, equipped } = typicalCharacter('warrior', 30, content);
    const unit = playerCombatant({ character, equipped, name: 'Mira', area }, content);
    assert.ok(unit.maxMana > 0);
    const foe = monsterCombatant({ monsterId: area.encounters[0].monsters[0], level: 28, id: 'e0' }, content);
    assert.deepEqual([combatantView(unit, 28, content).maxMana, combatantView(unit, 28, content).mana], [unit.maxMana, unit.maxMana]);
    assert.equal(combatantView({ ...unit, mana: 20 }, 28, content).mana, 20);
    // Never above its most, as the fight starts it.
    assert.equal(combatantView({ ...unit, mana: 10000 }, 28, content).mana, unit.maxMana);
    const view = combatantView(foe, 30, content);
    assert.equal(view.maxMana, undefined);
    assert.equal(manaStart(view), null);
  });

  test('every skill paid carries the mana left, and the bars end where the fight leaves the mana', () => {
    const area = placeOf(28);
    const { character, equipped } = typicalCharacter('warrior', 30, content);
    const unit = playerCombatant({ character, equipped, name: 'Mira', area }, content);
    const enemies = [monsterCombatant({ monsterId: area.encounters[0].monsters[0], level: 28, id: 'e0' }, content)];
    const result = fight('pasek-many', [unit], enemies);
    const views = [combatantView(unit, 28, content), ...enemies.map((enemy) => combatantView(enemy, 30, content))];
    const { now, steps } = bars(views, result.events);
    assert.equal(now.get('a0'), result.units.find((one) => one.id === 'a0').mana);
    // The creature has no bar, and no event names its mana.
    assert.ok(result.events.every((event) => !event.mana || !('e0' in event.mana)));
    // The first skill paid: the mana before it less the skill's cost.
    const first = result.events.findIndex((event) => event.actor === 'a0' && event.skill);
    assert.ok(first >= 0);
    const paid = unit.skills.find((skill) => skill.id === result.events[first].skill);
    assert.equal(result.events[first].mana.a0, unit.maxMana - paid.mana);
    assert.equal(steps[first].get('a0'), unit.maxMana - paid.mana);
    // Only an event that changes mana carries it.
    let last = unit.maxMana;
    for (const [index, event] of result.events.entries()) {
      if (event.mana) assert.notEqual(event.mana.a0, last, `event ${index}`);
      last = steps[index].get('a0');
    }
  });

  test('a mana shield lowers the mana by the share it takes, as it rises', () => {
    const mage = withSkill('mage', 'mana-shield', { hpShare: 0.45 });
    const result = fight('pasek-osłona', [mage], [sturdy('boar', 12, 'e0')]);
    const at = result.events.findIndex((event) => event.kind === 'skill' && event.skill === 'mana-shield');
    assert.ok(at >= 0);
    const { steps } = bars([combatantView(mage, 12, content)], result.events);
    const before = at === 0 ? mage.maxMana : steps[at - 1].get('a0');
    const taken = Math.min(before, Math.round(mage.maxMana * content.skillsById['mana-shield'].params.pool));
    assert.ok(taken > 0);
    assert.equal(result.events[at].mana.a0, before - taken);
    assert.equal(steps[at].get('a0'), before - taken);
  });

  test('a mana potion raises the mana by what it gave', () => {
    const area = placeOf(28);
    const { character, equipped } = typicalCharacter('warrior', 30, content);
    const unit = playerCombatant({ character, equipped, name: 'Mira', area }, content);
    const dry = { ...unit, mana: 0, potions: fightPotions({ 'lesser-mana': 1 }, 0.4, content) };
    const result = fight('pasek-mikstura', [dry], [monsterCombatant({ monsterId: area.encounters[0].monsters[0], level: 28, id: 'e0' }, content)]);
    const view = combatantView(dry, 28, content);
    assert.equal(manaStart(view), 0);
    const at = result.events.findIndex((event) => event.kind === 'potion' && event.effect === 'mana');
    assert.ok(at >= 0);
    const drunk = result.events[at];
    assert.ok(drunk.amount > 0);
    const { steps } = bars([view], result.events);
    const before = at === 0 ? 0 : steps[at - 1].get('a0');
    assert.equal(drunk.mana.a0, before + drunk.amount);
    assert.ok(steps[at].get('a0') > before);
  });

  test("an exploration's fights: the character's bar starts from the mana it brings, and the report keeps it for the line", () => {
    const area = placeOf(22);
    const warrior = typicalCharacter('warrior', 30, content);
    const hunt = simulateHunt({ ...warrior, hp: 99999, name: 'Mira', areaId: area.id, minutes: 240, seed: 'pasek-wyprawa', potions: { 'lesser-mana': 3 } }, content);
    assert.ok(hunt.fights.length > 3);
    assert.ok(hunt.fights.some((one) => one.manaBefore < one.allies[0].maxMana));
    for (const one of hunt.fights) {
      const own = one.allies.find((view) => view.id === 'a0');
      assert.equal(own.mana, one.manaBefore);
      assert.equal(bars([...one.allies, ...one.enemiesView], one.events).now.get('a0'), one.manaAfter);
    }
    const report = huntReport({ hunt, applied: applyHunt(warrior.character, hunt, content), character: warrior.character, areaId: area.id, startedAt: 0, endsAt: 1 }, content);
    assert.deepEqual(
      report.fights.map((one) => [one.manaBefore, one.manaAfter]),
      hunt.fights.map((one) => [one.manaBefore, one.manaAfter]),
    );
    assert.equal(fightManaLine(report.fights[1]), `Mana: ${report.fights[1].manaBefore} → ${report.fights[1].manaAfter}`);
  });

  test("an event's fight at the exploration's end keeps the mana it began with, the exploration's, and ended with", () => {
    const area = placeOf(22);
    const warrior = typicalCharacter('warrior', 30, content);
    const hunt = simulateHunt({ ...warrior, hp: 99999, name: 'Mira', areaId: area.id, minutes: 60, seed: 'mana-event' }, content);
    const told = resolveEvent({ hunt: { ...hunt, manaEnd: 20 }, event: content.eventsById['wounded-woman'], optionId: 'help', caseId: 'ambush', ...warrior, name: 'Mira', seed: 'mana-event' }, content);
    const last = told.fights.at(-1);
    assert.equal(last.event, true);
    assert.equal(last.manaBefore, 20);
    assert.equal(last.allies.find((view) => view.id === 'a0').mana, 20);
    assert.equal(bars([...last.allies, ...last.enemiesView], last.events).now.get('a0'), last.manaAfter);
  });

  test('a fight kept before has no bar and plays as it did; its report has no line', () => {
    // A view and events as reports kept them before 21.11.2026.
    const view = { id: 'a0', side: 'ally', name: 'Mira', level: 30, position: 'front', maxHp: 900, hp: 900 };
    const events = [
      { t: 10, kind: 'skill', actor: 'a0', skill: 'power-strike', skillName: 'Potężny cios', text: 'Mira: Potężny cios.' },
      { t: 10, kind: 'hit', actor: 'a0', target: 'e0', damage: 50, hp: 10, text: 'Mira trafia.' },
    ];
    assert.equal(manaStart(view), null);
    assert.deepEqual(events.map(manaChanges), [[], []]);
    assert.equal(bars([view], events).now.size, 0);
    assert.equal(fightManaLine({ hpBefore: 900, hpAfter: 700, won: true }), null);
    assert.equal(fightManaLine(null), null);
  });

  test('the line under a fight: „Mana: 1552 → 340”, in the numbers of the page', () => {
    assert.equal(fightManaLine({ manaBefore: 1552, manaAfter: 340 }), 'Mana: 1552 → 340');
    assert.equal(fightManaLine({ manaBefore: 12345, manaAfter: 0 }), 'Mana: 12 345 → 0');
  });
});

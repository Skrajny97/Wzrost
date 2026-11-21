// Mana between the fights of an exploration (1220 B, the author,
// 21.11.2026: „mana wraca częściowo. Po każdej wygranej walce wraca 30%
// brakującej many, tak jak HP. Mikstury many przydadzą się na dłuższych
// wyprawach, a postać bez nich dalej da radę.”). An exploration sets out
// with full mana; each next fight starts with what the last one left and
// balance.hunt.manaRecoveryAfterFight of the missing mana after a won one
// (restedMana), the mana potions drunk in it counted. Each player of a
// Drużyna's trip has its own; the companions and the mercenary carry no
// potions and start each fight full; an event's fight at the end goes on
// from the exploration's mana. The threat's explorations with companions
// do the same, with the mana potions taken along. The Wieże, the Labirynt
// and the Arena start each fight full, as before.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  arenaDuel,
  createRng,
  faintChances,
  labyrinthFight,
  monsterCombatant,
  newLabyrinth,
  playerCombatant,
  resolveEvent,
  restedMana,
  simulateFight,
  simulateHunt,
  threatSamples,
  towerFight,
} from '../src/engine/index.js';
import { companionsOf, newestArea, playerOf, roadKit, withArea } from '../tools/difficulty-sim.mjs';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content, newCharacter } from './helpers/content.js';

// The content with another share of the missing mana back.
const recovering = (share) => ({ ...content, balance: { ...content.balance, hunt: { ...content.balance.hunt, manaRecoveryAfterFight: share } } });
// A place of levels holding `level`.
const placeOf = (level) => content.areas.find((area) => level >= area.minLevel && level <= area.maxLevel);
// A typical Wojownik of level 30: Potężny cios and Wir stali, 63 mana.
const warrior = typicalCharacter('warrior', 30, content);
const maxManaOf = ({ character, equipped }, area) => playerCombatant({ character, equipped, name: 'Mira', area }, content).maxMana;

// Each fight of an exploration starts with what the last left and the rest
// after it (it ended won, or the exploration ended); the first full.
function assertCarried(hunt, maxMana, share = content.balance.hunt.manaRecoveryAfterFight) {
  assert.ok(hunt.fights.length > 1);
  assert.equal(hunt.fights[0].manaBefore, maxMana);
  hunt.fights.forEach((fight, index) => {
    const rested = fight.manaAfter + Math.round((maxMana - fight.manaAfter) * share);
    const next = hunt.fights[index + 1];
    if (next) {
      assert.equal(fight.won, true);
      assert.equal(next.manaBefore, rested, `fight ${index + 1}`);
    } else assert.equal(hunt.manaEnd, fight.won === true ? rested : fight.manaAfter);
  });
}

describe('mana between the fights of an exploration (1220 B)', () => {
  test('the rule: 30% of the missing mana back after a won fight; null, full, stays null', () => {
    assert.equal(content.balance.hunt.manaRecoveryAfterFight, 0.3);
    assert.equal(restedMana(null, 63, content), null);
    assert.equal(restedMana(3, 63, content), 21);
    assert.equal(restedMana(0, 100, content), 30);
    assert.equal(restedMana(63, 63, content), 63);
  });

  test('a fight starts with the mana a unit brings, never above its most, else full, and gives it back at the end', () => {
    const area = placeOf(28);
    const unit = playerCombatant({ ...warrior, name: 'Mira', area }, content);
    assert.ok(unit.skills.length > 0 && unit.maxMana === 63);
    const fight = (extra) => simulateFight({ allies: [{ ...unit, ...extra }], enemies: [monsterCombatant({ monsterId: area.encounters[0].monsters[0], level: 28, id: 'e0' }, content)], rng: createRng('mana'), content, record: true });
    const skilled = (result) => result.events.some((event) => event.actor === 'a0' && event.skill);
    const full = fight({});
    assert.ok(skilled(full));
    const left = full.units.find((one) => one.id === 'a0').mana;
    assert.ok(left >= 0 && left < 63);
    // Without mana and without potions, no skill at all.
    const dry = fight({ mana: 0 });
    assert.ok(!skilled(dry));
    assert.equal(dry.units.find((one) => one.id === 'a0').mana, 0);
    // More than its most is its most.
    assert.deepEqual(fight({ mana: 10000 }), full);
  });

  test('alone: the first fight full, each next with what the last left and 30% of the missing; the potions drunk count', () => {
    const area = placeOf(22);
    const maxMana = maxManaOf(warrior, area);
    const hunt = simulateHunt({ ...warrior, hp: 99999, name: 'Mira', areaId: area.id, minutes: 240, seed: 'mana-carry' }, content);
    assertCarried(hunt, maxMana);
    assert.ok(hunt.fights.some((fight) => fight.manaBefore < maxMana));
    // With mana potions it drinks them, one a fight when short, and goes on
    // from what they gave; with all the mana back after each fight (as
    // before 1220 B) it needs none.
    const potions = { 'lesser-mana': 10 };
    const drinking = simulateHunt({ ...warrior, hp: 99999, name: 'Mira', areaId: area.id, minutes: 240, seed: 'mana-carry', potions }, content);
    assertCarried(drinking, maxMana);
    assert.ok((drinking.potionsUsed['lesser-mana'] ?? 0) > 0);
    const rested = simulateHunt({ ...warrior, hp: 99999, name: 'Mira', areaId: area.id, minutes: 240, seed: 'mana-carry', potions }, recovering(1));
    assert.ok(rested.fights.every((fight) => fight.manaBefore === maxMana));
    assert.equal(rested.potionsUsed['lesser-mana'] ?? 0, 0);
  });

  test("a Drużyna's trip: each player with its own mana, the same in every member's report", () => {
    const area = placeOf(22);
    const archer = typicalCharacter('archer', 30, content);
    const roster = [
      { id: 'lead', name: 'Mira', ...warrior, hp: 99999, potions: {}, windows: {}, trophies: {} },
      { id: 'm2', name: 'Bolek', ...archer, hp: 99999, potions: {}, windows: {}, trophies: {} },
    ];
    const trip = (self) => simulateHunt({ ...warrior, hp: 99999, name: 'Mira', areaId: area.id, minutes: 240, seed: 'mana-trip', lootSeed: `mana-trip:${self}`, roster, self }, content);
    const lead = trip('lead');
    const member = trip('m2');
    assertCarried(lead, maxManaOf(warrior, area));
    assertCarried(member, maxManaOf(archer, area));
    assert.equal(lead.partners[0].manaEnd, member.manaEnd);
    assert.equal(member.partners[0].manaEnd, lead.manaEnd);
    assert.notDeepEqual(
      lead.fights.map((fight) => fight.manaAfter),
      member.fights.map((fight) => fight.manaAfter),
    );
  });

  test('the companions start each fight with full mana: without skills of its own the character goes the same at any share', () => {
    const level = 50;
    const area = newestArea(level, content, -2);
    const local = withArea(area, content);
    const one = playerOf('realistic', 'mage', level, local, 0);
    const companions = companionsOf(one.plan, level, 0, local);
    assert.equal(companions.length, 2);
    const plain = { ...one.character, evolution: null, skills: {} };
    assert.equal(playerCombatant({ character: plain, equipped: one.equipped, name: 'Mira', area }, local).skills.length, 0);
    const go = (rules) => simulateHunt({ character: plain, equipped: one.equipped, hp: 99999, name: 'Mira', areaId: area.id, minutes: 240, seed: 'mana-mates', companions }, rules);
    const now = go(local);
    assert.ok(now.fights.length > 3);
    assert.deepEqual(go({ ...local, balance: { ...local.balance, hunt: { ...local.balance.hunt, manaRecoveryAfterFight: 0 } } }), now);
  });

  test("an event's fight at the end goes on from the exploration's mana", () => {
    const area = placeOf(22);
    const hunt = simulateHunt({ ...warrior, hp: 99999, name: 'Mira', areaId: area.id, minutes: 60, seed: 'mana-event' }, content);
    const woman = content.eventsById['wounded-woman'];
    const resolve = (manaEnd) => resolveEvent({ hunt: { ...hunt, manaEnd }, event: woman, optionId: 'help', caseId: 'ambush', ...warrior, name: 'Mira', seed: 'mana-event' }, content);
    const skilled = (result) => result.fights.at(-1).events.some((event) => event.actor === 'a0' && event.skill);
    assert.ok(skilled(resolve(undefined)));
    const dry = resolve(0);
    assert.ok(!skilled(dry));
    const maxMana = maxManaOf(warrior, area);
    assert.equal(dry.manaEnd, dry.fights.at(-1).won === true ? Math.round(maxMana * 0.3) : 0);
  });

  test("the threat's explorations with companions carry the character's mana and drink the mana potions taken along", () => {
    const level = 100;
    let estimate = 0;
    let real = 0;
    let without = 0;
    const builds = [
      ['warrior', 0],
      ['warrior', 1],
      ['shadow', 0],
      ['shadow', 1],
    ];
    for (const [classId, build] of builds) {
      const area = newestArea(level, content);
      const local = withArea(area, content);
      const one = playerOf('realistic', classId, level, local, build);
      const companions = companionsOf(one.plan, level, build, local);
      const kit = roadKit(one.plan, area, 240, local);
      const [id] = Object.keys(kit.potions);
      const potions = { ...kit.potions, 'greater-mana': 10 };
      const healing = (taken) => ({ count: kit.potions[id], amount: local.potionsById[id].effect.heal, below: kit.healBelow, potions: taken });
      const maxHp = playerCombatant({ character: one.character, equipped: one.equipped, name: 'Próba', area }, local).maxHp;
      const chance = (taken) => {
        const samples = threatSamples({ character: one.character, equipped: one.equipped, areaId: area.id, companions, healing: healing(taken) }, local);
        return faintChances({ character: one.character, equipped: one.equipped, hp: maxHp, areaId: area.id, healing: healing(taken) }, local, samples)[240];
      };
      estimate += chance(potions);
      without += chance(kit.potions);
      let faints = 0;
      for (let i = 0; i < 120; i++) {
        const hunt = simulateHunt({ character: one.character, equipped: one.equipped, hp: maxHp, name: 'Próba', areaId: area.id, minutes: 240, seed: `mana-threat:${classId}:${build}:${i}`, companions, potions, healBelow: kit.healBelow }, local);
        if (hunt.result === 'fainted') faints += 1;
      }
      real += faints / 120;
    }
    estimate /= builds.length;
    real /= builds.length;
    without /= builds.length;
    // Within a few points of the explorations as the game runs them; left
    // out, the mana potions made it several points too high.
    assert.ok(Math.abs(estimate - real) <= 0.05, `${estimate} vs ${real}`);
    assert.ok(without > estimate + 0.05, `${without} vs ${estimate}`);
  });

  test('the Wieże, the Labirynt and the Arena: each fight with full mana, whatever the share', () => {
    const still = recovering(0);
    const climber = newCharacter('warrior', { level: 60, classLevel: 50 });
    const tower = (rules) => towerFight({ character: climber, equipped: [], name: 'Wspinacz', floor: 3, seed: 'moc' }, rules);
    assert.deepEqual(tower(still), tower(content));
    const attacker = { ...playerOf('realistic', 'warrior', 60, content, 0), name: 'Ala' };
    const defender = { ...playerOf('realistic', 'mage', 62, content, 1), name: 'Bolek' };
    const duel = (rules) => arenaDuel({ attacker, defender, seed: 'seed-1' }, rules);
    assert.deepEqual(duel(still), duel(content));
    const state = newLabyrinth({ day: '2026-11-13', charLevel: 60, companions: [], seed: 'dzien' });
    const room = (rules) => labyrinthFight({ state, type: 'fight', row: 0, room: 0, party: { character: attacker.character, equipped: attacker.equipped, name: 'Ala' }, seed: 'walka' }, rules);
    assert.ok(room(content).fights.length > 0);
    assert.deepEqual(room(still), room(content));
  });
});

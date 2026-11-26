// The XP of a Drużyna's trip (1274 A, 26.11.2026). A player (poz. 134) wrote
// that the game leans too much on finding two others for a party: a party
// skips its trip's time together while only the one who skips pays
// (src/server/time.js), so it levelled far faster than a player with its
// companions from the Kwatery. The author: „lepiej osłabić drużyny na
// przykład uzyskiwanego expa mocno”, and chose A: on a trip each other
// player takes parties.tripXpCost of the XP of the fights (partyTripXpShare
// in src/engine/parties.js), so a trio gets 30% less than with the cost
// every player took before (parties.xpCost) and a duo 14% less; the class
// gets the same XP. Alone, with companions, with a mercenary and in the
// Wieża Drużyn nothing changes. The names are synthetic.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { applyHunt, drawCandidates, partyTripXpLess, partyTripXpShare, simulateHunt, towerFight } from '../src/engine/index.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content, newCharacter } from './helpers/content.js';

const { parties } = content.balance;
// The game before 1274 A: a player beside the character took parties.xpCost
// on a trip too.
const before = { ...content, balance: { ...content.balance, parties: { ...parties, tripXpCost: parties.xpCost } } };
const near = (actual, expected, within) => assert.ok(Math.abs(actual - expected) <= within, `${actual} vs ${expected}`);

// A player of a trip's roster as parties.js keeps it: a typical character
// of its class and level (tools/simulate.mjs) at full HP.
function member(id, classId, level) {
  const { character, equipped } = typicalCharacter(classId, level, content);
  return { id, name: id, character, equipped, hp: null, windows: {}, trophies: {} };
}

// The leader's exploration of a trip of `roster`, as hunts.js claims it.
function trip(roster, data) {
  const [lead] = roster;
  return simulateHunt({ character: lead.character, equipped: lead.equipped, hp: lead.hp, name: lead.name, areaId: 'mossy-boulders', minutes: 60, seed: 'wyprawa-1274', lootSeed: 'łup-1274', roster, self: lead.id }, data);
}

describe("a Drużyna's trip gives less XP (1274 A)", () => {
  const trio = [member('lider', 'warrior', 40), member('druh', 'cleric', 40), member('trzeci', 'mage', 40)];
  const duo = trio.slice(0, 2);

  test('each player beside takes parties.tripXpCost: a trio 0.64 of the XP, a duo 0.82, alone all of it', () => {
    near(partyTripXpShare(3, content), 1 - 2 * parties.tripXpCost, 1e-9);
    near(partyTripXpShare(3, content), 0.64, 0.005);
    near(partyTripXpShare(2, content), 0.82, 0.005);
    assert.equal(partyTripXpShare(1, content), 1);
    // The cost of a mercenary and in the Wieża Drużyn stays below it.
    assert.ok(parties.xpCost < parties.tripXpCost);
  });

  test('a trio gets 30% less XP from every fight of its trip than before, a duo 14% less, and the class as much', () => {
    for (const [roster, less] of [
      [trio, 0.3],
      [duo, 0.14],
    ]) {
      const ratio = partyTripXpShare(roster.length, content) / (1 - (roster.length - 1) * parties.xpCost);
      near(1 - ratio, less, 0.005);
      const now = trip(roster, content);
      const then = trip(roster, before);
      // The same fights, only their XP less.
      assert.deepEqual(
        now.fights.map((fight) => fight.won),
        then.fights.map((fight) => fight.won),
      );
      assert.ok(now.fights.filter((fight) => fight.won === true && fight.xp > 0).length >= 2, `${roster.length}: ${now.fights.length} fights`);
      now.fights.forEach((fight, index) => near(fight.xp, then.fights[index].xp * ratio, 1));
      near(now.xp, then.xp * ratio, now.fights.length);
      // The class gets the XP of the exploration, so 30% (14%) less too.
      const character = roster[0].character;
      const after = applyHunt(character, now, content);
      const afterThen = applyHunt(character, then, before);
      assert.equal(after.characterXp, now.xp);
      assert.ok(after.classLevel === afterThen.classLevel && after.classXp < afterThen.classXp, `${after.classXp} vs ${afterThen.classXp}`);
      near(after.classXp - character.classXp, (afterThen.classXp - character.classXp) * ratio, now.fights.length);
    }
  });

  test('alone, with companions, with a mercenary and in the Wieża Drużyn the XP stays as before', () => {
    const { character, equipped } = typicalCharacter('archer', 40, content);
    const hunt = { character, equipped, hp: null, name: 'Sama', areaId: 'mossy-boulders', minutes: 60, seed: 'sama-1274' };
    const [companion] = drawCandidates({ character, seed: 'karczma-1274' }, Date.UTC(2026, 10, 26, 12), content);
    const hired = typicalCharacter('warrior', 40, content);
    const mercenary = { id: 9, name: 'Najemnik', character: hired.character, equipped: hired.equipped, hp: null };
    for (const one of [hunt, { ...hunt, companions: [companion] }, { ...hunt, partners: [mercenary] }]) {
      const now = simulateHunt(one, content);
      assert.ok(now.fights.some((fight) => fight.won === true && fight.xp > 0));
      assert.deepEqual(now, simulateHunt(one, before));
    }
    // A player beside the character in the Wieża Drużyn takes
    // parties.xpCost, as before.
    const climber = typicalCharacter('warrior', 60, content);
    const partner = { ...typicalCharacter('cleric', 60, content), name: 'Druh' };
    const floor = { character: climber.character, equipped: climber.equipped, name: 'Lider', floor: 2, seed: 'wieża-1274' };
    const fought = towerFight({ ...floor, partners: [partner] }, content);
    assert.equal(fought.result, 'success');
    assert.deepEqual(fought, towerFight({ ...floor, partners: [partner] }, before));
    near(fought.xp, towerFight(floor, content).xp * (1 - parties.xpCost), 1);
  });

  test("the Drużyna's „Jak to działa?” numbers: how much less XP than with two companions", () => {
    const companions = 1 - 2 * content.settlement.companions.xpCost;
    assert.equal(partyTripXpLess(3, content), Math.round(100 * (1 - (1 - 2 * parties.tripXpCost) / companions)));
    assert.equal(partyTripXpLess(3, content), 32);
    assert.equal(partyTripXpLess(2, content), 13);
  });
});

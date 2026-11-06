// Ostępy Nowiu (levels 176–200), the third land of the Szumiący Bór (666):
// its places, creatures and materials, its trait Przymrozek (a chill lasts
// one move longer, both sides), the Morowa Dziewica's breath that may poison
// the whole party, and Cios w cały szyk, the Księżycożerca's blow at the
// whole line: its chosen target at full strength, every other member at a
// share of it, each on its own.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { autoDistribute, createRng, monsterCombatant, playerCombatant, simulateFight, towerArea, towerFight, towerFloor } from '../src/engine/index.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content, newCharacter } from './helpers/content.js';

const land = content.regionsById['new-moon-depths'];
const ROSTER = {
  'creaking-pines': ['lichen-beard', 'hollow-dweller', 'murmur-wraith'],
  'rotting-logs': ['rotwood', 'puffball', 'earwig'],
  'devils-crossroads': ['headless', 'chochol', 'smetek'],
  'plague-graves': ['deadman', 'burying-beetle', 'bell-ringer'],
  'eclipsed-glade': ['abomination', 'koltun', 'bebok'],
};
const OWN = new Set([...Object.values(ROSTER).flat(), 'plague-maiden', 'moon-eater']);
const BLOWS = new Set(['hit', 'crit', 'dodge']);

// A character of a class at its position that does not fall, with no Will
// to keep effects off and no dodge.
function member(classId, id, level = 190) {
  const { character, equipped } = typicalCharacter(classId, level, content);
  return { ...playerCombatant({ character, equipped, name: `${classId} ${id}`, id }, content), maxHp: 1e7, hp: 1e7, willRating: 0, dodgeRating: 0 };
}

// A creature that does not fall, its attack changed by `attack`.
function creature(monsterId, level, attack = {}, id = 'e0') {
  const unit = monsterCombatant({ monsterId, level, id }, content);
  return { ...unit, weapon: { ...unit.weapon, ...attack }, maxHp: 1e7, hp: 1e7 };
}

// The blows of the creature, by the moment they came.
function blowsByMoment(fight, id) {
  const moments = new Map();
  for (const event of fight.events) {
    if (event.actor !== id || !BLOWS.has(event.kind) || event.counter) continue;
    if (!moments.has(event.t)) moments.set(event.t, []);
    moments.get(event.t).push(event);
  }
  return [...moments.values()];
}

describe('Ostępy Nowiu', () => {
  test('the eighth land, the last of the Szumiący Bór: five places of five levels from 176, the Morowa Dziewica everywhere, the Księżycożerca on Zaćmiona Polana', () => {
    assert.equal(content.regions.indexOf(land), content.regions.indexOf(content.regionsById['silent-wilds']) + 1);
    assert.deepEqual([land.land, land.name, land.minLevel, land.maxLevel, land.safe], ['Szumiący Bór', 'Ostępy Nowiu', 176, 200, false]);
    assert.deepEqual(
      land.areas.map((area) => [area.id, area.name, area.minLevel, area.maxLevel]),
      [
        ['creaking-pines', 'Skrzypiące Sosny', 176, 180],
        ['rotting-logs', 'Próchniejące Pnie', 181, 185],
        ['devils-crossroads', 'Czarcie Rozdroże', 186, 190],
        ['plague-graves', 'Morowe Mogiły', 191, 195],
        ['eclipsed-glade', 'Zaćmiona Polana', 196, 200],
      ],
    );
    assert.ok(land.areas.every((area) => area.elite === 'plague-maiden'));
    assert.deepEqual(land.areas.map((area) => area.champion), [null, null, null, null, 'moon-eater']);
    for (const area of land.areas) {
      const living = new Set([...area.encounters, ...area.tough].flatMap((encounter) => encounter.monsters));
      assert.deepEqual([...living].sort(), [...ROSTER[area.id]].sort(), area.id);
      assert.deepEqual(ROSTER[area.id].map((id) => content.monstersById[id].position), ['front', 'middle', 'back'], area.id);
    }
    const rarity = (id) => content.materialsByMonster[id].rarity;
    assert.deepEqual(Object.values(ROSTER).map((ids) => ids.map(rarity)), [
      ['rare', 'unique', 'common'],
      ['unique', 'common', 'rare'],
      ['rare', 'unique', 'epic'],
      ['common', 'rare', 'unique'],
      ['epic', 'unique', 'epic'],
    ]);
    assert.deepEqual([rarity('plague-maiden'), rarity('moon-eater')], ['mythic', 'divine']);
    assert.equal(new Set([...OWN].map((id) => content.materialsByMonster[id].id)).size, OWN.size);
  });

  test('the ways of fighting of 666: three lie in wait, four strike the back (the Bebok both), four chill, the elite poisons everyone, the champion strikes the whole line', () => {
    const which = (test) => [...OWN].filter((id) => test(content.monstersById[id])).sort();
    assert.deepEqual(which((monster) => monster.ambush), ['bebok', 'burying-beetle', 'hollow-dweller']);
    assert.deepEqual(which((monster) => monster.attack.target === 'back'), ['bebok', 'bell-ringer', 'earwig', 'murmur-wraith']);
    assert.deepEqual(which((monster) => monster.attack.dot?.effect === 'chilled'), ['bell-ringer', 'deadman', 'lichen-beard', 'moon-eater']);
    assert.deepEqual(which((monster) => monster.attack.dot?.all), ['plague-maiden']);
    assert.equal(content.monstersById['plague-maiden'].attack.dot.effect, 'poisoned');
    // The only blow at the whole line in the game.
    assert.deepEqual(Object.values(content.monstersById).filter((monster) => monster.attack.cleave).map((monster) => monster.id), ['moon-eater']);
  });

  test('Przymrozek makes a chill last one move longer, for the creatures and the characters', () => {
    assert.deepEqual(land.trait.effectTicks, { chilled: 1 });
    const left = (fight) => fight.events.find((event) => event.kind === 'tick' && event.effect === 'Wychłodzenie').left;
    const onCharacter = (trait) =>
      left(simulateFight({ allies: [member('warrior', 'a0')], enemies: [creature('lichen-beard', 178, { dot: { ...content.monstersById['lichen-beard'].attack.dot, chance: 1 } })], rng: createRng('przymrozek'), content, record: true, trait }));
    assert.equal(onCharacter(land.trait), onCharacter(null) + 1);
    const frost = member('mage', 'a0');
    const chiller = { ...frost, weapon: { ...frost.weapon, dot: { effect: 'chilled', chance: 1, power: 0.2, ticks: 3 } } };
    const onCreature = (trait) => left(simulateFight({ allies: [chiller], enemies: [{ ...creature('rotwood', 183), willRating: 0 }], rng: createRng('przymrozek2'), content, record: true, trait }));
    assert.equal(onCreature(land.trait), onCreature(null) + 1);
  });

  test("the Morowa Dziewica's breath may poison every member of the party, each on its own", () => {
    const party = [member('warrior', 'a0'), member('cleric', 'a1'), member('archer', 'a2')];
    const dot = { ...content.monstersById['plague-maiden'].attack.dot, chance: 1 };
    const fight = simulateFight({ allies: party, enemies: [creature('plague-maiden', 192, { dot })], rng: createRng('mor'), content, record: true });
    const blow = fight.events.find((event) => event.actor === 'e0' && (event.kind === 'hit' || event.kind === 'crit'));
    const poisoned = fight.events.filter((event) => event.kind === 'effect' && event.actor === 'e0' && event.t === blow.t && event.effect === 'Zatrucie').map((event) => event.target);
    assert.deepEqual([...poisoned].sort(), ['a0', 'a1', 'a2']);
  });
});

describe('Cios w cały szyk (666)', () => {
  // Three alike, so the shares of the blow show plainly; a blow of one size.
  const line = () => [member('warrior', 'a0'), member('warrior', 'a1'), member('warrior', 'a2')];
  const steady = (unit) => ({ ...unit, critRating: 0, weapon: { ...unit.weapon, min: (unit.weapon.min + unit.weapon.max) / 2, max: (unit.weapon.min + unit.weapon.max) / 2 } });

  test("the Księżycożerca strikes its chosen target at full strength and each other member at the share, at the same moment", () => {
    const share = content.monstersById['moon-eater'].attack.cleave;
    assert.ok(share > 0 && share < 1);
    const fight = simulateFight({ allies: line(), enemies: [steady(creature('moon-eater', 198))], rng: createRng('zaćmienie'), content, record: true });
    const moments = blowsByMoment(fight, 'e0');
    assert.ok(moments.length >= 10);
    for (const blows of moments) {
      // One blow of its own choice, then the rest of the line as a sweep.
      assert.equal(blows.length, 3);
      const [first, ...rest] = blows;
      assert.equal(first.sweep, undefined);
      assert.ok(rest.every((event) => event.sweep === true));
      assert.deepEqual([first.target, ...rest.map((event) => event.target)].sort(), ['a0', 'a1', 'a2']);
      for (const event of rest) assert.ok(Math.abs(event.damage - first.damage * share) <= 1, `${event.damage} of ${first.damage}`);
    }
    // Its chosen target changes by the usual draw.
    assert.ok(new Set(moments.map((blows) => blows[0].target)).size > 1);
  });

  test('each one struck on its own: a critical blow of its own, and the chill may land on each', () => {
    const dot = { ...content.monstersById['moon-eater'].attack.dot, chance: 1 };
    const fight = simulateFight({ allies: line(), enemies: [creature('moon-eater', 198, { dot })], rng: createRng('zaćmienie:chłód'), content, record: true });
    const [first] = blowsByMoment(fight, 'e0');
    const chilled = fight.events.filter((event) => event.kind === 'effect' && event.actor === 'e0' && event.t === first[0].t && event.effect === 'Wychłodzenie').map((event) => event.target);
    // Its first blow at the line chills all three it struck.
    assert.equal(first.length, 3);
    assert.deepEqual([...chilled].sort(), first.map((event) => event.target).sort());
    // A magical blow, so nobody dodges it; with critical blows as likely as
    // they get, one of a moment's blows is critical while another is not.
    const sharp = { ...creature('moon-eater', 198), critRating: 1e6 };
    const crits = blowsByMoment(simulateFight({ allies: line(), enemies: [sharp], rng: createRng('zaćmienie:kryt'), content, record: true }), 'e0');
    assert.ok(crits.every((blows) => blows.every((event) => event.kind !== 'dodge')));
    assert.ok(crits.some((blows) => blows.some((event) => event.kind === 'crit') && blows.some((event) => event.kind === 'hit')));
  });

  test('without it (the author\'s other answer) and for every other creature: one blow a move; a lone character takes just the one', () => {
    const plain = simulateFight({ allies: line(), enemies: [creature('moon-eater', 198, { cleave: undefined })], rng: createRng('zaćmienie'), content, record: true });
    assert.ok(blowsByMoment(plain, 'e0').every((blows) => blows.length === 1));
    const rarog = simulateFight({ allies: line(), enemies: [creature('rarog', 198)], rng: createRng('zaćmienie'), content, record: true });
    assert.ok(blowsByMoment(rarog, 'e0').every((blows) => blows.length === 1));
    const alone = simulateFight({ allies: [member('warrior', 'a0')], enemies: [creature('moon-eater', 198)], rng: createRng('zaćmienie:sam'), content, record: true });
    assert.ok(blowsByMoment(alone, 'e0').every((blows) => blows.length === 1));
  });

  test('in the Wieże the Księżycożerca waits on its champion floor, the 200th; the same seed, the same fight', () => {
    // Every 25th floor: with 40 places the 200th is Zaćmiona Polana's.
    const { championEvery } = content.towers.floors;
    const floor = Array.from({ length: 400 }, (_, index) => index + 1).find((one) => one % championEvery === 0 && towerArea(one, content).id === 'eclipsed-glade');
    assert.equal(floor, 200);
    assert.equal(towerFloor(floor, 'any', content).encounter.members[0].monsterId, 'moon-eater');
    const climber = newCharacter('warrior', { level: 200, classLevel: 200 });
    const entry = towerFight({ character: { ...climber, points: autoDistribute(climber, content) }, equipped: [], name: 'Wspinacz', floor, seed: 'nów' }, content);
    assert.equal(entry.fights[0].champion, true);
    const fight = () => simulateFight({ allies: line(), enemies: [creature('moon-eater', 198)], rng: createRng('zaćmienie:los'), content, record: true });
    assert.deepEqual(fight(), fight());
  });
});

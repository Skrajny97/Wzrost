// Sosnowe Wydmy (levels 126–150), the first land of the Szumiący Bór: its
// places, creatures and materials, its trait Spiekota, and the creatures'
// two ways of fighting from the design document ("nocne zasadzki, ataki na
// tył szyku"): Zasadzka (464), the Piaskun lying in wait, so the creatures
// move first wherever it fights, and Atak na tył szyku (463), blows at the
// one standing furthest back; and the Raróg, whose storm may burn the whole
// party.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  autoDistribute,
  createRng,
  encounterCombatants,
  monsterCombatant,
  playerCombatant,
  simulateFight,
  simulateHunt,
  threatSamples,
  towerArea,
  towerFight,
  towerFloor,
} from '../src/engine/index.js';
import { companionsOf, playerOf } from '../tools/difficulty-sim.mjs';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content, newCharacter } from './helpers/content.js';

const land = content.regionsById['pine-dunes'];
const ROSTER = {
  'heather-dunes': ['sandman', 'heather-mare', 'nightjar'],
  'resin-pinewood': ['resin-golem', 'barkborer', 'tar-moth'],
  'drifting-sands': ['drought-husk', 'sand-whirl', 'barrow-wight'],
  'tar-pits': ['tar-burner', 'charcoal-imp', 'latawiec'],
  'burnt-forest': ['charred-pine', 'ash-wraith', 'spark-swarm'],
};
const BLOWS = new Set(['hit', 'crit', 'dodge']);
// The land's creatures, its elite and its champion: the next lands have
// their own that strike the back and lie in wait (test/silent-wilds.test.js,
// test/new-moon-depths.test.js).
const OWN = new Set([...Object.values(ROSTER).flat(), 'noon-wraith', 'rarog']);
const own = (monster) => OWN.has(monster.id);

// A character of a class at its position that does not fall, with no Will
// to keep effects off.
function member(classId, id, level = 130) {
  const { character, equipped } = typicalCharacter(classId, level, content);
  return { ...playerCombatant({ character, equipped, name: `${classId} ${id}`, id }, content), maxHp: 1e7, hp: 1e7, willRating: 0 };
}

// A creature that does not fall either, its attack changed by `attack`.
function creature(monsterId, level, attack = {}, id = 'e0') {
  const unit = monsterCombatant({ monsterId, level, id }, content);
  return { ...unit, weapon: { ...unit.weapon, ...attack }, maxHp: 1e7, hp: 1e7 };
}

// The units a creature's own blows went to, in order.
const targetsOf = (fight, id) => fight.events.filter((event) => event.actor === id && BLOWS.has(event.kind) && !event.counter).map((event) => event.target);

// Every creature's first blow comes before the party's first one.
function creaturesFirst(fight, enemyIds) {
  const blows = fight.events.filter((event) => BLOWS.has(event.kind) && !event.counter);
  const party = blows.findIndex((event) => !enemyIds.includes(event.actor));
  return enemyIds.every((id) => {
    const at = blows.findIndex((event) => event.actor === id);
    return at >= 0 && (party < 0 || at < party);
  });
}

describe('Sosnowe Wydmy', () => {
  test('the sixth land, the first of the Szumiący Bór: five places of five levels from 126, the Południca everywhere, the Raróg in Pogorzelisko', () => {
    assert.equal(content.regions.indexOf(land), content.regions.indexOf(content.regionsById['black-bog']) + 1);
    assert.deepEqual([land.land, land.name, land.minLevel, land.maxLevel, land.safe], ['Szumiący Bór', 'Sosnowe Wydmy', 126, 150, false]);
    assert.deepEqual(
      land.areas.map((area) => [area.id, area.minLevel, area.maxLevel]),
      [['heather-dunes', 126, 130], ['resin-pinewood', 131, 135], ['drifting-sands', 136, 140], ['tar-pits', 141, 145], ['burnt-forest', 146, 150]],
    );
    assert.ok(land.areas.every((area) => area.elite === 'noon-wraith'));
    assert.deepEqual(land.areas.map((area) => area.champion), [null, null, null, null, 'rarog']);
    // Three creatures in each place: at the front, in the middle and at the back.
    for (const area of land.areas) {
      const living = new Set([...area.encounters, ...area.tough].flatMap((encounter) => encounter.monsters));
      assert.deepEqual([...living].sort(), [...ROSTER[area.id]].sort(), area.id);
      assert.deepEqual(ROSTER[area.id].map((id) => content.monstersById[id].position), ['front', 'middle', 'back'], area.id);
    }
    // Each leaves its own material, the elite's mythic and the champion's divine.
    const creatures = [...Object.values(ROSTER).flat(), 'noon-wraith', 'rarog'];
    assert.equal(new Set(creatures.map((id) => content.materialsByMonster[id].id)).size, creatures.length);
    assert.deepEqual([content.materialsByMonster['noon-wraith'].rarity, content.materialsByMonster.rarog.rarity], ['mythic', 'divine']);
  });

  test('Spiekota makes a burn last one move longer, for the creatures and the characters', () => {
    assert.deepEqual(land.trait.effectTicks, { burning: 1 });
    const left = (trait) => {
      const fight = simulateFight({ allies: [member('warrior', 'a0')], enemies: [creature('charcoal-imp', 142, { dot: { ...content.monstersById['charcoal-imp'].attack.dot, chance: 1 } })], rng: createRng('spiekota'), content, record: true, trait });
      return fight.events.find((event) => event.kind === 'tick' && event.effect === 'Oparzenie').left;
    };
    assert.equal(left(land.trait), left(null) + 1);
  });
});

describe('Atak na tył szyku (463)', () => {
  test('the Lelek, the Latawiec and the Iskrzak strike the back of the line, other creatures anyone', () => {
    const backStrikers = Object.values(content.monstersById).filter((monster) => own(monster) && monster.attack.target === 'back').map((monster) => monster.id);
    assert.deepEqual(backStrikers.sort(), ['latawiec', 'nightjar', 'spark-swarm']);
    const party = [member('warrior', 'a0'), member('cleric', 'a1'), member('archer', 'a2')];
    assert.deepEqual(party.map((unit) => unit.position), ['front', 'middle', 'back']);
    for (const monsterId of backStrikers) {
      const fight = simulateFight({ allies: party, enemies: [creature(monsterId, 140)], rng: createRng(`tył:${monsterId}`), content, record: true });
      const targets = targetsOf(fight, 'e0');
      assert.ok(targets.length >= 10, monsterId);
      assert.deepEqual([...new Set(targets)], ['a2'], monsterId);
    }
    // A creature without it strikes all along the line, the front most often.
    const plain = targetsOf(simulateFight({ allies: party, enemies: [creature('heather-mare', 140)], rng: createRng('tył:mara'), content, record: true }), 'e0');
    assert.deepEqual([...new Set(plain)].sort(), ['a0', 'a1', 'a2']);
  });

  test('with the back fallen or empty, the one furthest back of those standing; among equals, by the usual draw', () => {
    // The archer at the back falls soon: then the cleric in the middle.
    const party = [member('warrior', 'a0'), member('cleric', 'a1'), { ...member('archer', 'a2'), hp: 1 }];
    const fight = simulateFight({ allies: party, enemies: [creature('latawiec', 144)], rng: createRng('tył:pada'), content, record: true });
    const fall = fight.events.findIndex((event) => event.kind === 'kill' && event.target === 'a2');
    assert.ok(fall > 0);
    const blows = fight.events.filter((event) => event.actor === 'e0' && BLOWS.has(event.kind) && !event.counter);
    const before = blows.filter((event) => fight.events.indexOf(event) < fall).map((event) => event.target);
    const after = blows.filter((event) => fight.events.indexOf(event) > fall).map((event) => event.target);
    assert.deepEqual([...new Set(before)], ['a2']);
    assert.ok(after.length >= 10);
    assert.deepEqual([...new Set(after)], ['a1']);
    // Only the front: the front.
    const alone = targetsOf(simulateFight({ allies: [member('warrior', 'a0')], enemies: [creature('nightjar', 128)], rng: createRng('tył:sam'), content, record: true }), 'e0');
    assert.deepEqual([...new Set(alone)], ['a0']);
    // Two at the back: both of them, and never the front.
    const two = targetsOf(simulateFight({ allies: [member('warrior', 'a0'), member('mage', 'a1'), member('archer', 'a2')], enemies: [creature('spark-swarm', 148)], rng: createRng('tył:dwaj'), content, record: true }), 'e0');
    assert.deepEqual([...new Set(two)].sort(), ['a1', 'a2']);
  });

  test('the same seed, the same fight', () => {
    const fight = () => simulateFight({ allies: [member('warrior', 'a0'), member('archer', 'a1')], enemies: [creature('nightjar', 128), creature('sandman', 128, {}, 'e1')], rng: createRng('tył:los'), content, record: true });
    assert.deepEqual(fight(), fight());
  });
});

describe('Zasadzka (464)', () => {
  test('with a Piaskun in the fight every creature moves before the party, however quick, and the playback opens with it', () => {
    assert.deepEqual(Object.values(content.monstersById).filter((monster) => own(monster) && monster.ambush).map((monster) => monster.id), ['sandman']);
    const archer = member('archer', 'a0');
    const quick = { ...archer, speed: archer.speed * 3 };
    for (const seed of ['a', 'b', 'c', 'd']) {
      const enemies = encounterCombatants({ members: [{ monsterId: 'heather-mare', level: 128 }, { monsterId: 'sandman', level: 128 }] }, content);
      const fight = simulateFight({ allies: [quick, member('warrior', 'a1')], enemies, rng: createRng(seed), content, record: true });
      assert.ok(creaturesFirst(fight, ['e0', 'e1']), seed);
      assert.equal(fight.events[0].kind, 'ambush');
      assert.equal(fight.events[0].actor, 'e1');
      assert.equal(fight.events[0].text, 'Zasadzka! Piaskun wyłania się znienacka i stwory ruszają pierwsze.');
    }
    // Without it the quick archer moves first.
    const calm = simulateFight({ allies: [quick], enemies: encounterCombatants({ members: [{ monsterId: 'heather-mare', level: 128 }] }, content), rng: createRng('a'), content, record: true });
    assert.equal(calm.events.find((event) => event.t > 0 && event.actor).actor, 'a0');
    assert.ok(calm.events.every((event) => event.kind !== 'ambush'));
  });

  test('the Piaskun lies in wait wherever it fights: on an exploration, in the Wieże and in the threat estimate', () => {
    // An exploration of Wrzosowe Wydmy, with two companions, as a player of
    // these levels goes (tools/difficulty-sim.mjs): every fight with a
    // Piaskun, and only such a fight, opens with it.
    const { character, equipped, plan } = playerOf('realistic', 'warrior', 130, content);
    const companions = companionsOf(plan, 130, 0, content);
    const hunt = simulateHunt({ character, equipped, hp: 99999, name: 'Mira', areaId: 'heather-dunes', minutes: 240, seed: 'wydmy', avoidRare: true, companions }, content);
    const lurking = (fight) => fight.enemies.some((enemy) => enemy.monsterId === 'sandman');
    assert.ok(hunt.fights.filter(lurking).length >= 3, `${hunt.fights.length} fights`);
    assert.ok(hunt.fights.some((fight) => !lurking(fight)));
    for (const fight of hunt.fights) {
      assert.equal(fight.events[0].kind === 'ambush', lurking(fight));
      if (lurking(fight)) assert.ok(creaturesFirst(fight, fight.enemiesView.map((enemy) => enemy.id)));
    }
    // A floor of Wrzosowe Wydmy in the Wieże (the 26th, the first of the
    // sixth land) with a Piaskun.
    const floor = content.areas.findIndex((area) => area.id === 'heather-dunes') + 1;
    assert.equal(towerArea(floor, content).id, 'heather-dunes');
    const seed = Array.from({ length: 50 }, (_, n) => `piętro${n}`).find((one) => towerFloor(floor, one, content).encounter.members.some((member) => member.monsterId === 'sandman'));
    const climber = newCharacter('warrior', { level: 60, classLevel: 50 });
    const entry = towerFight({ character: { ...climber, points: autoDistribute(climber, content) }, equipped: [], name: 'Wspinacz', floor, seed }, content);
    assert.equal(entry.fights[0].events[0].kind, 'ambush');
    assert.ok(creaturesFirst(entry.fights[0], entry.fights[0].enemiesView.map((enemy) => enemy.id)));
    // The threat estimate fights the same fights: it counts the ambush too.
    // The creatures strike first, so fewer fights end without a scratch (the
    // HP lost on average is too close to call with the gear of Tier V).
    const without = { ...content, monstersById: { ...content.monstersById, sandman: { ...content.monstersById.sandman, ambush: false } } };
    const clean = (samples) => samples.regular[0];
    const options = { character, equipped, areaId: 'heather-dunes', companions };
    assert.ok(clean(threatSamples(options, content)) < clean(threatSamples(options, without)));
  });
});

describe('Ognista nawałnica', () => {
  // The first blow of the creature and the effects it left at that moment.
  const firstStorm = (monsterId, level) => {
    const party = [member('warrior', 'a0'), member('cleric', 'a1'), member('archer', 'a2')];
    const dot = { ...content.monstersById[monsterId].attack.dot, chance: 1 };
    const fight = simulateFight({ allies: party, enemies: [creature(monsterId, level, { dot })], rng: createRng(`burza:${monsterId}`), content, record: true });
    const blow = fight.events.find((event) => event.actor === 'e0' && (event.kind === 'hit' || event.kind === 'crit'));
    const burnt = fight.events.filter((event) => event.kind === 'effect' && event.actor === 'e0' && event.t === blow.t && event.effect === 'Oparzenie').map((event) => event.target);
    return { blow, burnt };
  };

  test("the Raróg's blow may burn every member of the party, each on its own; Rokita's only the one it strikes", () => {
    assert.equal(content.monstersById.rarog.attack.dot.all, true);
    const storm = firstStorm('rarog', 152);
    assert.deepEqual([...storm.burnt].sort(), ['a0', 'a1', 'a2']);
    assert.equal(storm.burnt[0], storm.blow.target);
    const fire = firstStorm('rokita', 127);
    assert.deepEqual(fire.burnt, [fire.blow.target]);
  });
});

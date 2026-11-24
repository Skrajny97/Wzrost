// Łysogóry (levels 201–275, 816 A and 966): three lands of five places each,
// Gołoborza, Jodłowa Puszcza and Łysa Góra, with their traits, on both
// sides: Rumowisko (a mire puts the next move off by half as long again),
// Jodłowy cień (5% more dodge in the middle of the line) and Noc sabatu
// (poison, burning, chill and bleeding last one move longer); and the blows
// at the whole line of the Stolem, the Kostucha and Baba Jaga (Cios w cały
// szyk, 666), each one struck on its own, with its own chance of the blow's
// effect.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createRng, monsterCombatant, playerCombatant, simulateFight, towerArea, towerFloor } from '../src/engine/index.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';

const LANDS = [
  ['scree-slopes', 'Gołoborza', 201, 225, 'griffin', 'stolem'],
  ['fir-forest', 'Jodłowa Puszcza', 226, 250, 'cuckoo', 'twardowski'],
  ['bald-mountain', 'Łysa Góra', 251, 275, 'kostucha', 'baba-yaga'],
];
// Each place with its creatures at the front, in the middle and at the back.
const PLACES = {
  'grey-scree': ['Szare Gołoborze', 201, ['marmot', 'roller', 'echo']],
  'windy-ridge': ['Wietrzna Grań', 206, ['chamois', 'wallcreeper', 'swift']],
  'devils-stones': ['Diabelskie Kamienie', 211, ['stone-rooster', 'cicada', 'hoopoe']],
  'vulture-crags': ['Sępie Turnie', 216, ['wolverine', 'vulture', 'shrike']],
  'stone-throne': ['Kamienny Tron', 221, ['stone-knight', 'dormouse', 'bee-eater']],
  'fir-slope': ['Jodłowy Stok', 226, ['tarpan', 'jay', 'black-woodpecker']],
  'witches-path': ['Ścieżka Czarownic', 231, ['wood-ant', 'changeling', 'nightshade']],
  'misty-ravine': ['Mglisty Jar', 236, ['great-slug', 'mistletoe-leech', 'kingfisher']],
  'witch-glade': ['Wiedźmia Polana', 241, ['witch-cauldron', 'witch-broom', 'hedge-witch']],
  'cursed-manor': ['Zaklęty Dwór', 246, ['empty-armor', 'haunted-portrait', 'black-grimoire']],
  'stone-rampart': ['Kamienny Wał', 251, ['fire-wheel', 'nutcracker', 'seeress']],
  'witch-kitchen': ['Wiedźmia Kuchnia', 256, ['mortar', 'witch-hare', 'broom-witch']],
  'dance-circle': ['Taneczny Krąg', 261, ['dance-frenzy', 'magpie', 'cursed-piper']],
  'stone-altars': ['Kamienne Ołtarze', 266, ['offering-oven', 'wax-doll', 'fate-spinner']],
  'baba-yaga-hut': ['Chata Baby Jagi', 271, ['hen-leg-hut', 'black-goose', 'burning-skull']],
};
const OWN = new Set([...Object.values(PLACES).flatMap(([, , roster]) => roster), ...LANDS.flatMap(([, , , , elite, champion]) => [elite, champion])]);
const BLOWS = new Set(['hit', 'crit', 'dodge']);
const region = (id) => content.regionsById[id];

// A character of a class that does not fall, with no Will to keep effects
// off and no dodge.
function member(classId, id, level = 250) {
  const { character, equipped } = typicalCharacter(classId, level, content);
  return { ...playerCombatant({ character, equipped, name: `${classId} ${id}`, id }, content), maxHp: 1e8, hp: 1e8, willRating: 0, dodgeRating: 0 };
}

// A creature that does not fall, its attack changed by `attack`.
function creature(monsterId, level, attack = {}, id = 'e0') {
  const unit = monsterCombatant({ monsterId, level, id }, content);
  return { ...unit, weapon: { ...unit.weapon, ...attack }, maxHp: 1e8, hp: 1e8 };
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

describe('Łysogóry', () => {
  test('three lands after Ostępy Nowiu, each of five places of five levels, with its elite everywhere and its champion in the last place', () => {
    const after = content.regions.indexOf(region('new-moon-depths'));
    assert.deepEqual(content.regions.slice(after + 1, after + 1 + LANDS.length).map((one) => one.id), LANDS.map(([id]) => id));
    for (const [id, name, from, to, elite, champion] of LANDS) {
      const land = region(id);
      assert.deepEqual([land.land, land.name, land.minLevel, land.maxLevel, land.safe, land.fightBoard], ['Łysogóry', name, from, to, false, `board-${id}`]);
      assert.ok(land.areas.every((area) => area.elite === elite), id);
      assert.deepEqual(land.areas.map((area) => area.champion ?? null), [null, null, null, null, champion], id);
      for (const area of land.areas) {
        const [placeName, level, roster] = PLACES[area.id];
        assert.deepEqual([area.name, area.minLevel, area.maxLevel], [placeName, level, level + 4], area.id);
        const living = new Set([...area.encounters, ...area.tough].flatMap((encounter) => encounter.monsters));
        assert.deepEqual([...living].sort(), [...roster].sort(), area.id);
        assert.deepEqual(roster.map((one) => content.monstersById[one].position), ['front', 'middle', 'back'], area.id);
      }
    }
    assert.deepEqual(Object.keys(PLACES), LANDS.flatMap(([id]) => region(id).areas.map((area) => area.id)));
  });

  test('materials of the rarities of the lands before, a mythic one for each elite and a divine one for each champion, none twice', () => {
    const rarity = (id) => content.materialsByMonster[id].rarity;
    const pattern = [
      ['rare', 'unique', 'common'],
      ['unique', 'common', 'rare'],
      ['rare', 'unique', 'epic'],
      ['common', 'rare', 'unique'],
      ['epic', 'unique', 'epic'],
    ];
    assert.deepEqual(Object.values(PLACES).map(([, , roster]) => roster.map(rarity)), [...pattern, ...pattern, ...pattern]);
    for (const [, , , , elite, champion] of LANDS) assert.deepEqual([rarity(elite), rarity(champion)], ['mythic', 'divine']);
    assert.equal(new Set([...OWN].map((id) => content.materialsByMonster[id].id)).size, OWN.size);
  });

  test('the ways of fighting of 966: two lie in wait, five strike the back, four drain life, three strike the whole line', () => {
    const which = (test) => [...OWN].filter((id) => test(content.monstersById[id])).sort();
    assert.deepEqual(which((monster) => monster.ambush), ['chamois', 'jay']);
    assert.deepEqual(which((monster) => monster.attack.target === 'back'), ['broom-witch', 'cuckoo', 'echo', 'griffin', 'kingfisher']);
    assert.deepEqual(which((monster) => monster.attack.drain), ['changeling', 'cuckoo', 'mistletoe-leech', 'twardowski']);
    assert.deepEqual(which((monster) => monster.attack.cleave), ['baba-yaga', 'kostucha', 'stolem']);
    // The blow at the whole line strikes everyone already, so the effect of
    // the Kostucha's scythe and of Baba Jaga's curse comes with each blow, as
    // the Księżycożerca's chill does, never once more for everyone.
    assert.deepEqual(which((monster) => monster.attack.dot?.all), []);
    assert.deepEqual(['stolem', 'kostucha', 'baba-yaga'].map((id) => content.monstersById[id].attack.dot?.effect ?? null), [null, 'bleeding', 'poisoned']);
  });
});

describe('the traits of the Łysogóry', () => {
  test('Rumowisko: a mire puts the next move off for longer, and Jodłowy cień: 5% more dodge in the middle of the line', () => {
    const rubble = region('scree-slopes').trait;
    assert.deepEqual(rubble.slowLonger, { mired: 0.5 });
    // The warrior's move that a Pomrów's first mire puts off; a slow Pomrów,
    // so that the warrior moves before it mires again.
    const actions = new Set(['hit', 'crit', 'dodge', 'skill']);
    const after = (trait) => {
      const slug = creature('great-slug', 238, { slow: { ...content.monstersById['great-slug'].attack.slow, chance: 1 } });
      const fight = simulateFight({ allies: [member('warrior', 'a0', 238)], enemies: [{ ...slug, speed: slug.speed / 10, willRating: 0 }], rng: createRng('rumowisko'), content, record: true, trait });
      const mired = fight.events.findIndex((event) => event.kind === 'slow' && event.effect === 'Ugrzęźnięcie');
      return fight.events.slice(mired).find((event) => event.actor === 'a0' && actions.has(event.kind)).t;
    };
    assert.ok(after(rubble) > after(null));

    const firs = region('fir-forest');
    assert.equal(firs.trait.middleDodgeBonus, 0.05);
    const { character, equipped } = typicalCharacter('mage', 230, content);
    const dodge = (position, area) => playerCombatant({ character: { ...character, position }, equipped, name: 'Mira', area }, content).dodgeRating;
    const elsewhere = region('new-moon-depths').areas[0];
    assert.ok(Math.abs(dodge('middle', firs.areas[0]) / dodge('middle', elsewhere) - 1.05) < 1e-9);
    assert.ok(Math.abs(dodge('front', firs.areas[0]) / dodge('front', elsewhere) - 1) < 1e-9);
    assert.ok(Math.abs(dodge('back', firs.areas[0]) / dodge('back', elsewhere) - 1) < 1e-9);
  });

  test('Noc sabatu: poison, burning, chill and bleeding last one move longer, for the creatures and the characters', () => {
    const sabbath = region('bald-mountain').trait;
    assert.deepEqual(sabbath.effectTicks, { poisoned: 1, burning: 1, chilled: 1, bleeding: 1 });
    // Each effect from a creature of the Łysogóry that has it.
    const sources = { poisoned: ['nightshade', 233], burning: ['burning-skull', 273], chilled: ['haunted-portrait', 248], bleeding: ['black-goose', 273] };
    for (const [effect, [monsterId, level]] of Object.entries(sources)) {
      const name = content.effectsById[effect].name;
      const left = (fight) => fight.events.find((event) => event.kind === 'tick' && event.effect === name).left;
      const dot = { ...content.monstersById[monsterId].attack.dot, chance: 1 };
      assert.equal(dot.effect, effect);
      const onCharacter = (trait) => left(simulateFight({ allies: [member('warrior', 'a0', level)], enemies: [creature(monsterId, level, { dot })], rng: createRng(`sabat:${effect}`), content, record: true, trait }));
      assert.equal(onCharacter(sabbath), onCharacter(null) + 1, effect);
      const caster = member('mage', 'a0', level);
      const own = { ...caster, weapon: { ...caster.weapon, dot: { effect, chance: 1, power: 0.2, ticks: 3 } } };
      const onCreature = (trait) => left(simulateFight({ allies: [own], enemies: [{ ...creature('mortar', 258), willRating: 0 }], rng: createRng(`sabat2:${effect}`), content, record: true, trait }));
      assert.equal(onCreature(sabbath), onCreature(null) + 1, effect);
    }
  });
});

describe('the blows at the whole line of the Łysogóry', () => {
  // Three alike, so the shares of the blow show plainly; a blow of one size.
  const line = (level) => [member('warrior', 'a0', level), member('warrior', 'a1', level), member('warrior', 'a2', level)];
  const steady = (unit) => ({ ...unit, critRating: 0, weapon: { ...unit.weapon, min: (unit.weapon.min + unit.weapon.max) / 2, max: (unit.weapon.min + unit.weapon.max) / 2 } });

  for (const [id, level] of [['stolem', 223], ['kostucha', 263], ['baba-yaga', 273]]) {
    test(`${id}: its chosen target at full strength, each other member at the share, at the same moment, each with its own chance of the effect`, () => {
      const share = content.monstersById[id].attack.cleave;
      assert.ok(share > 0 && share < 1);
      const fight = simulateFight({ allies: line(level), enemies: [steady(creature(id, level))], rng: createRng(`szyk:${id}`), content, record: true });
      const moments = blowsByMoment(fight, 'e0');
      assert.ok(moments.length >= 10);
      for (const blows of moments) {
        assert.equal(blows.length, 3);
        const [first, ...rest] = blows;
        assert.equal(first.sweep, undefined);
        assert.ok(rest.every((event) => event.sweep === true));
        assert.deepEqual([first.target, ...rest.map((event) => event.target)].sort(), ['a0', 'a1', 'a2']);
        if (blows.every((event) => event.kind === 'hit')) {
          for (const event of rest) assert.ok(Math.abs(event.damage - first.damage * share) <= 1, `${event.damage} of ${first.damage}`);
        }
      }
      // With an effect that always lands, its first blow at the line puts it
      // on each of the three, once.
      const dot = content.monstersById[id].attack.dot;
      if (!dot) return;
      const sure = simulateFight({ allies: line(level), enemies: [creature(id, level, { dot: { ...dot, chance: 1 } })], rng: createRng(`szyk:${id}:efekt`), content, record: true });
      const [blows] = blowsByMoment(sure, 'e0');
      const struck = blows.filter((event) => event.kind !== 'dodge').map((event) => event.target);
      const effects = sure.events.filter((event) => event.kind === 'effect' && event.actor === 'e0' && event.t === blows[0].t).map((event) => event.target);
      assert.deepEqual([...effects].sort(), [...struck].sort());
    });
  }

  // With the World Tree's 85 places (test/world-tree.test.js): Twardowski
  // stays on the 50th floor, Baba Jaga waits on the 225th and the Stolem on
  // the 300th (with Nawia's 70 the 125th and the 325th).
  test('in the Wieże the champions wait on their floors: Twardowski on the 50th, Baba Jaga on the 225th, the Stolem on the 300th', () => {
    const { championEvery } = content.towers.floors;
    const floorOf = (placeId) => Array.from({ length: 1000 }, (_, index) => index + 1).find((one) => one % championEvery === 0 && towerArea(one, content).id === placeId);
    assert.deepEqual(['cursed-manor', 'stone-throne', 'baba-yaga-hut'].map(floorOf), [50, 300, 225]);
    for (const [floor, champion] of [[50, 'twardowski'], [300, 'stolem'], [225, 'baba-yaga']]) {
      const { encounter } = towerFloor(floor, 'any', content);
      assert.equal(encounter.champion, true);
      assert.equal(encounter.members[0].monsterId, champion);
    }
  });
});

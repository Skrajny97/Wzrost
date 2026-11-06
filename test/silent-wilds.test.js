// Głucha Knieja (levels 151–175), the second land of the Szumiący Bór
// (666): its places, creatures and materials, its trait Ciernie (a bleeding
// lasts one move longer, both sides), and Ukryty w mroku, the Szeleśnik and
// the Mrokun hidden in the dark: the party does not choose them while a
// creature without it fights beside them, strikes them once only hidden
// ones are left, and blows at many strike them as any other.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createRng, monsterCombatant, playerCombatant, simulateFight, simulateHunt } from '../src/engine/index.js';
import { companionsOf, playerOf } from '../tools/difficulty-sim.mjs';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';

const land = content.regionsById['silent-wilds'];
const ROSTER = {
  'spruce-dusk': ['needleback', 'smooth-snake', 'rustler'],
  'fern-thicket': ['millipede', 'fernling', 'mantis'],
  'forgotten-track': ['dog-headed', 'ghost-coachman', 'gadfly'],
  'mossy-dell': ['rootwad', 'murkling', 'strangler'],
  'wild-den': ['bone-gnawer', 'carcass', 'smoke-hound'],
};
const OWN = new Set([...Object.values(ROSTER).flat(), 'nightingale-robber', 'night-huntsman']);
const BLOWS = new Set(['hit', 'crit', 'dodge']);

// A character of a class at its position that does not fall, with no Will
// to keep effects off.
function member(classId, id, level = 160) {
  const { character, equipped } = typicalCharacter(classId, level, content);
  return { ...playerCombatant({ character, equipped, name: `${classId} ${id}`, id }, content), maxHp: 1e7, hp: 1e7, willRating: 0 };
}

// A creature with `hp` (by default one that does not fall), its attack
// changed by `attack`, in `data` changed by `own` (e.g. without its trait).
function creature(monsterId, level, { id = 'e0', hp = 1e7, attack = {}, own = {} } = {}) {
  const local = Object.keys(own).length > 0 ? { ...content, monstersById: { ...content.monstersById, [monsterId]: { ...content.monstersById[monsterId], ...own } } } : content;
  const unit = monsterCombatant({ monsterId, level, id }, local);
  return { ...unit, weapon: { ...unit.weapon, ...attack }, maxHp: hp, hp };
}

// The party's own blows at a single foe it chose: not a blow at many (a
// sweep, a cloud, a splash, an echo) and not an answer to a blow.
const chosen = (fight, allies) => fight.events.filter((event) => BLOWS.has(event.kind) && allies.has(event.actor) && !event.sweep && !event.counter);

// Whether the party chose a hidden creature while one without it was still
// standing: the creatures' falls followed through the playback.
function hiddenChosenEarly(fight, allyIds, enemies) {
  const hidden = new Set(enemies.filter((enemy) => content.monstersById[enemy.monsterId].hidden).map((enemy) => enemy.id));
  const fallen = new Set();
  for (const event of fight.events) {
    if (event.kind === 'kill') fallen.add(event.target);
    const own = BLOWS.has(event.kind) && allyIds.has(event.actor) && !event.sweep && !event.counter;
    if (!own || !hidden.has(event.target)) continue;
    if (enemies.some((enemy) => !hidden.has(enemy.id) && !fallen.has(enemy.id))) return event;
  }
  return null;
}

describe('Głucha Knieja', () => {
  test('the seventh land, the second of the Szumiący Bór: five places of five levels from 151, the Słowik Rozbójnik everywhere, the Nocny Łowczy in Matecznik', () => {
    assert.equal(content.regions.indexOf(land), content.regions.indexOf(content.regionsById['pine-dunes']) + 1);
    assert.deepEqual([land.land, land.name, land.minLevel, land.maxLevel, land.safe], ['Szumiący Bór', 'Głucha Knieja', 151, 175, false]);
    assert.deepEqual(
      land.areas.map((area) => [area.id, area.name, area.minLevel, area.maxLevel]),
      [
        ['spruce-dusk', 'Świerkowy Zmrok', 151, 155],
        ['fern-thicket', 'Paprociowy Gąszcz', 156, 160],
        ['forgotten-track', 'Zapomniany Trakt', 161, 165],
        ['mossy-dell', 'Mszysty Wądół', 166, 170],
        ['wild-den', 'Matecznik', 171, 175],
      ],
    );
    assert.ok(land.areas.every((area) => area.elite === 'nightingale-robber'));
    assert.deepEqual(land.areas.map((area) => area.champion), [null, null, null, null, 'night-huntsman']);
    for (const area of land.areas) {
      const living = new Set([...area.encounters, ...area.tough].flatMap((encounter) => encounter.monsters));
      assert.deepEqual([...living].sort(), [...ROSTER[area.id]].sort(), area.id);
      assert.deepEqual(ROSTER[area.id].map((id) => content.monstersById[id].position), ['front', 'middle', 'back'], area.id);
    }
    // Each leaves its own material, place by place as in Sosnowe Wydmy, the
    // elite's mythic and the champion's divine.
    const rarity = (id) => content.materialsByMonster[id].rarity;
    assert.deepEqual(Object.values(ROSTER).map((ids) => ids.map(rarity)), [
      ['rare', 'unique', 'common'],
      ['unique', 'common', 'rare'],
      ['rare', 'unique', 'epic'],
      ['common', 'rare', 'unique'],
      ['epic', 'unique', 'epic'],
    ]);
    assert.deepEqual([rarity('nightingale-robber'), rarity('night-huntsman')], ['mythic', 'divine']);
    assert.equal(new Set([...OWN].map((id) => content.materialsByMonster[id].id)).size, OWN.size);
  });

  test('the ways of fighting of 666: three lie in wait, five strike the back, two hide in the dark, five make a wound bleed', () => {
    const which = (test) => [...OWN].filter((id) => test(content.monstersById[id])).sort();
    assert.deepEqual(which((monster) => monster.ambush), ['fernling', 'needleback', 'rootwad']);
    assert.deepEqual(which((monster) => monster.attack.target === 'back'), ['gadfly', 'mantis', 'night-huntsman', 'nightingale-robber', 'smoke-hound']);
    assert.deepEqual(which((monster) => monster.hidden), ['murkling', 'rustler']);
    assert.deepEqual(which((monster) => monster.attack.dot?.effect === 'bleeding'), ['bone-gnawer', 'dog-headed', 'needleback', 'night-huntsman', 'smooth-snake']);
    // The Nocny Łowczy shoots from a bow.
    assert.equal(content.monstersById['night-huntsman'].attack.strike, 'arrow');
  });

  test('Ciernie makes a bleeding last one move longer, for the creatures and the characters', () => {
    assert.deepEqual(land.trait.effectTicks, { bleeding: 1 });
    const left = (fight) => fight.events.find((event) => event.kind === 'tick' && event.effect === 'Krwawienie').left;
    // A creature's bleeding on a character.
    const onCharacter = (trait) =>
      left(simulateFight({ allies: [member('warrior', 'a0')], enemies: [creature('needleback', 152, { attack: { dot: { ...content.monstersById.needleback.attack.dot, chance: 1 } } })], rng: createRng('ciernie'), content, record: true, trait }));
    assert.equal(onCharacter(land.trait), onCharacter(null) + 1);
    // A character's bleeding on a creature (as the evolutions' skills make it).
    const cutter = member('warrior', 'a0');
    const bleeder = { ...cutter, weapon: { ...cutter.weapon, dot: { effect: 'bleeding', chance: 1, power: 0.2, ticks: 3 } } };
    const onCreature = (trait) => left(simulateFight({ allies: [bleeder], enemies: [{ ...creature('rootwad', 168), willRating: 0 }], rng: createRng('ciernie2'), content, record: true, trait }));
    assert.equal(onCreature(land.trait), onCreature(null) + 1);
  });
});

describe('Ukryty w mroku (666)', () => {
  const party = () => [member('warrior', 'a0'), member('cleric', 'a1'), member('archer', 'a2')];
  const ids = (units) => new Set(units.map((unit) => unit.id));

  test('the party does not choose a hidden creature while one without it fights beside it; blows at many strike it as any', () => {
    for (const seed of ['a', 'b', 'c']) {
      const allies = party();
      // The Szeleśnik would be the quickest kill by far: without its trait
      // the party goes for it first.
      const enemies = [creature('needleback', 152), creature('rustler', 152, { id: 'e1', hp: 3e4 })];
      const fight = simulateFight({ allies, enemies, rng: createRng(`mrok:${seed}`), content, record: true });
      const blows = chosen(fight, ids(allies));
      assert.ok(blows.length >= 30, seed);
      assert.deepEqual([...new Set(blows.map((event) => event.target))], ['e0'], seed);
      // The warrior's Szeroki zamach and the cleric's Egzorcyzm reach it.
      assert.ok(fight.events.some((event) => event.sweep && allies.some((unit) => unit.id === event.actor) && event.target === 'e1'), seed);
    }
    // Without the trait (the author's other answer): it is chosen first.
    const allies = party();
    const plain = [creature('needleback', 152), creature('rustler', 152, { id: 'e1', hp: 3e4, own: { hidden: false } })];
    const fight = simulateFight({ allies, enemies: plain, rng: createRng('mrok:a'), content, record: true });
    assert.equal(chosen(fight, ids(allies))[0].target, 'e1');
  });

  test('once only hidden ones are left, the party strikes them as any', () => {
    const allies = party();
    const enemies = [creature('needleback', 152, { hp: 2e4 }), creature('rustler', 152, { id: 'e1' }), creature('rustler', 152, { id: 'e2' })];
    const fight = simulateFight({ allies, enemies, rng: createRng('mrok:sami'), content, record: true });
    const fall = fight.events.findIndex((event) => event.kind === 'kill' && event.target === 'e0');
    assert.ok(fall > 0);
    const blows = chosen(fight, ids(allies));
    const before = blows.filter((event) => fight.events.indexOf(event) < fall);
    const after = blows.filter((event) => fight.events.indexOf(event) > fall);
    assert.deepEqual([...new Set(before.map((event) => event.target))], ['e0']);
    // Then the quickest kill of the two hidden ones, as of any two.
    assert.ok(after.length >= 20);
    assert.ok(after.every((event) => event.target === 'e1' || event.target === 'e2'));
  });

  test("a skill's own aim passes it over too: the Cień's Cios w plecy goes to the one in sight, not to the hidden one at the back", () => {
    const backstab = (own) => {
      const allies = [member('shadow', 'a0', 160)];
      const enemies = [creature('millipede', 158), creature('rustler', 158, { id: 'e1', own })];
      const fight = simulateFight({ allies, enemies, rng: createRng('mrok:plecy'), content, record: true });
      return fight.events.filter((event) => event.actor === 'a0' && event.skill === 'backstab' && BLOWS.has(event.kind)).map((event) => event.target);
    };
    const hidden = backstab({});
    assert.ok(hidden.length >= 5);
    assert.deepEqual([...new Set(hidden)], ['e0']);
    assert.deepEqual([...new Set(backstab({ hidden: false }))], ['e1']);
  });

  test('the Mrokun stays hidden on an exploration of Mszysty Wądół, with companions; the same seed, the same fight', () => {
    const { character, equipped, plan } = playerOf('realistic', 'warrior', 170, content);
    let met = 0;
    for (let i = 0; i < 4; i++) {
      const hunt = simulateHunt({ character, equipped, hp: 99999, name: 'Mira', areaId: 'mossy-dell', minutes: 240, seed: `wadol${i}`, avoidRare: true, companions: companionsOf(plan, 170, i, content) }, content);
      for (const fight of hunt.fights) {
        const enemies = fight.enemiesView.map((enemy) => ({ id: enemy.id, monsterId: enemy.monsterId }));
        if (!enemies.some((enemy) => enemy.monsterId === 'murkling')) continue;
        met += 1;
        const allyIds = new Set(fight.allies.map((unit) => unit.id));
        assert.equal(hiddenChosenEarly(fight, allyIds, enemies), null, JSON.stringify(hiddenChosenEarly(fight, allyIds, enemies)));
      }
    }
    assert.ok(met >= 5, `${met}`);
    const fight = () => simulateFight({ allies: party(), enemies: [creature('rootwad', 168), creature('murkling', 168, { id: 'e1' })], rng: createRng('mrok:los'), content, record: true });
    assert.deepEqual(fight(), fight());
  });
});

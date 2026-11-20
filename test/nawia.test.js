// Nawia (levels 276–350, 1088 B and 1096): three lands of five places each,
// Mgliste Bagna Nawii, Łąki Welesa and Kraina bez Słońca, with their traits,
// on both sides: Mgła zaświatów (any blow may miss in the fog), Czary Welesa
// (spells 5% stronger) and Bez słońca (every heal 5% weaker); and the new
// ways of fighting of their creatures: a stun, a silence, two blows in a
// move, the whole foremost row trampled, two effects at once, a blow struck
// back, a spring's water, a rise once a fight and a change of shape with
// every move.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createRng, monsterCombatant, playerCombatant, simulateFight, towerArea, towerFloor } from '../src/engine/index.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';

const BLOWS = new Set(['hit', 'crit', 'dodge']);
const LANDED = new Set(['hit', 'crit']);

// A character of a class that does not fall, with no Will to keep effects
// off and no dodge.
function member(classId, id, level = 280) {
  const { character, equipped } = typicalCharacter(classId, level, content);
  return { ...playerCombatant({ character, equipped, name: `${classId} ${id}`, id }, content), maxHp: 1e8, hp: 1e8, willRating: 0, dodgeRating: 0 };
}

// A creature that does not fall, its attack changed by `attack`.
function creature(monsterId, level, attack = {}, id = 'e0') {
  const unit = monsterCombatant({ monsterId, level, id }, content);
  return { ...unit, weapon: { ...unit.weapon, ...attack }, maxHp: 1e8, hp: 1e8 };
}

const fight = (allies, enemies, seed, trait = null) => simulateFight({ allies, enemies, rng: createRng(seed), content, record: true, trait });
const blowsOf = (result, id) => result.events.filter((event) => event.actor === id && BLOWS.has(event.kind) && !event.counter);

describe('the traits of Nawia, on both sides', () => {
  test('Mgła zaświatów: any blow may miss in the fog, a creature’s and a character’s, and nowhere else', () => {
    const allies = [member('warrior', 'a0')];
    const enemies = [creature('hen-leg-hut', 280)];
    const misses = (trait) => fight(allies, enemies, 'mgla', trait).events.filter((event) => event.kind === 'dodge' && event.missed === true);
    assert.equal(misses(null).length, 0);
    const foggy = fight(allies, enemies, 'mgla', { missChance: 0.2 });
    const missed = foggy.events.filter((event) => event.kind === 'dodge' && event.missed === true);
    const share = (side) => missed.filter((event) => event.actor === side).length / blowsOf(foggy, side).length;
    for (const side of ['a0', 'e0']) assert.ok(share(side) > 0.12 && share(side) < 0.3, `${side}: ${share(side)}`);
    const names = { a0: allies[0].name, e0: enemies[0].name };
    const said = (event) => content.texts.fogMiss.map((text) => text.replaceAll('{actor}', names[event.actor]).replaceAll('{target}', names[event.target]));
    assert.ok(missed.every((event) => said(event).includes(event.text)), missed.map((event) => event.text).join(' / '));
  });

  test('Czary Welesa: a spell strikes 5% harder, a physical blow as before', () => {
    const blows = (enemy, trait) => fight([member('warrior', 'a0')], [enemy], 'czary', trait).events.filter((event) => event.actor === 'e0' && LANDED.has(event.kind));
    const spell = creature('seeress', 280);
    assert.equal(spell.weapon.category, 'magical');
    const [plain] = blows(spell, null);
    const [strong] = blows(spell, { spellBonus: 0.05 });
    assert.ok(Math.abs(strong.damage - plain.damage * 1.05) <= 1, `${strong.damage} of ${plain.damage}`);
    const claw = creature('hen-leg-hut', 280);
    assert.equal(claw.weapon.category, 'physical');
    assert.deepEqual(blows(claw, { spellBonus: 0.05 }).map((event) => event.damage), blows(claw, null).map((event) => event.damage));
  });

  test('Bez słońca: drained life and a potion give back 5% less', () => {
    const leech = { ...creature('changeling', 280, { drain: 0.5 }), hp: 1e7 };
    const drained = (trait) => fight([member('warrior', 'a0')], [leech], 'slonce', trait).events.find((event) => event.kind === 'drain' && event.actor === 'e0');
    const [before, after] = [drained(null), drained({ healMalus: 0.05 })];
    assert.ok(Math.abs(after.amount - before.amount * 0.95) <= 1, `${after.amount} of ${before.amount}`);
  });
});

describe('the ways of fighting of Nawia’s creatures', () => {
  test('Ogłuszenie: a stunned character loses its next move, its card says so', () => {
    const allies = [member('warrior', 'a0')];
    const plain = fight(allies, [creature('hen-leg-hut', 280)], 'ogluszenie');
    const stunning = fight(allies, [creature('hen-leg-hut', 280, { stun: { chance: 1, label: 'ogłuszony' } })], 'ogluszenie');
    const stuns = stunning.events.filter((event) => event.kind === 'stun');
    assert.ok(stuns.length > 0);
    assert.ok(stuns.every((event) => event.target === 'a0' && event.label === 'ogłuszony'));
    assert.ok(blowsOf(stunning, 'a0').length < blowsOf(plain, 'a0').length);
    // Will keeps it off as it does a mire, up to its cap.
    const withWill = (willRating) =>
      fight([{ ...member('warrior', 'a0'), willRating }], [creature('hen-leg-hut', 280, { stun: { chance: 0.5, label: 'ogłuszony' } })], 'ogluszenie-wola').events.filter((event) => event.kind === 'stun').length;
    assert.ok(withWill(1e9) < withWill(0), `${withWill(1e9)} of ${withWill(0)}`);
  });

  test('Cisza: a silenced character uses no skill on its next move, only its blow', () => {
    const mage = member('mage', 'a0');
    const usual = fight([mage], [creature('hen-leg-hut', 280)], 'cisza');
    assert.ok(usual.events.some((event) => event.actor === 'a0' && event.skill));
    const hushed = fight([mage], [creature('hen-leg-hut', 280, { silence: { chance: 1, label: 'uciszony' } })], 'cisza');
    const silences = hushed.events.filter((event) => event.kind === 'slow' && event.silence);
    assert.ok(silences.length > 0);
    for (const silence of silences) {
      assert.deepEqual([silence.targets, silence.effect], [['a0'], 'uciszony']);
      const next = hushed.events.slice(hushed.events.indexOf(silence) + 1).find((event) => event.actor === 'a0' && (BLOWS.has(event.kind) || event.kind === 'skill'));
      if (next) assert.equal(next.skill, undefined, next.text);
    }
  });

  test('two blows in a move: the same target twice while it stands', () => {
    const result = fight([member('warrior', 'a0'), member('mage', 'a1')], [creature('viper', 280, { hits: 2 })], 'dwa-kesy');
    const moments = new Map();
    for (const event of blowsOf(result, 'e0')) moments.set(event.t, [...(moments.get(event.t) ?? []), event]);
    assert.ok(moments.size >= 10);
    for (const blows of moments.values()) {
      assert.equal(blows.length, 2);
      assert.equal(blows[0].target, blows[1].target);
    }
  });

  test('Tratowanie: every one in the foremost row at full strength, nobody behind it', () => {
    const allies = [member('warrior', 'a0'), member('warrior', 'a1'), member('mage', 'a2')];
    const result = fight(allies, [creature('hen-leg-hut', 280, { trample: true })], 'tratowanie');
    const moments = new Map();
    for (const event of blowsOf(result, 'e0')) moments.set(event.t, [...(moments.get(event.t) ?? []), event]);
    assert.ok(moments.size >= 10);
    for (const blows of moments.values()) {
      assert.deepEqual(blows.map((event) => event.target).sort(), ['a0', 'a1']);
      assert.equal(blows[0].sweep, undefined);
      assert.equal(blows[1].sweep, true);
    }
  });

  test('two effects at once: each with its own chance', () => {
    const flame = creature('hen-leg-hut', 280, { dot: { effect: 'burning', chance: 1, power: 0.2, ticks: 2 }, dot2: { effect: 'chilled', chance: 1, power: 0.2, ticks: 2 } });
    const result = fight([member('warrior', 'a0')], [flame], 'dwa-efekty');
    const first = result.events.find((event) => event.actor === 'e0' && LANDED.has(event.kind));
    const effects = result.events.filter((event) => event.kind === 'effect' && event.actor === 'e0' && event.t === first.t).map((event) => event.effect);
    assert.deepEqual(effects.sort(), [content.effectsById.burning.name, content.effectsById.chilled.name].sort());
  });

  test('Zemsta: whoever strikes Wróżda is struck back at once, never an answer to an answer', () => {
    const avenger = { ...creature('seeress', 280), vengeance: 0.5 };
    const result = fight([member('warrior', 'a0')], [avenger], 'zemsta');
    const landed = result.events.filter((event) => event.actor === 'a0' && LANDED.has(event.kind) && !event.counter);
    const back = result.events.filter((event) => event.actor === 'e0' && event.counter);
    assert.ok(landed.length >= 10);
    assert.equal(back.length, landed.length);
    assert.ok(back.every((event) => event.target === 'a0'));
    for (const event of landed) {
      const answer = result.events[result.events.indexOf(event) + 1];
      assert.deepEqual([answer.actor, answer.counter, answer.t], ['e0', true, event.t]);
    }
  });

  test('Źródło: Wężowa Panna heals a share of her HP at the start of each of her moves', () => {
    const maiden = { ...creature('viper', 280), regen: 0.05, hp: 5e7 };
    const result = fight([member('warrior', 'a0')], [maiden], 'zrodlo');
    const springs = result.events.filter((event) => event.kind === 'drain' && event.actor === 'e0');
    assert.ok(springs.length >= 10);
    assert.equal(springs[0].amount, 5e6);
    assert.ok(springs.every((event) => event.amount > 0 && event.amount <= 5e6));
  });

  test('Kościej rises once with half its HP, and the second time it falls for good', () => {
    const koschei = { ...monsterCombatant({ monsterId: 'hen-leg-hut', level: 280, id: 'e0' }, content), rises: 0.5 };
    const result = fight([member('warrior', 'a0'), member('warrior', 'a1'), member('warrior', 'a2')], [koschei], 'kosciej');
    const rises = result.events.filter((event) => event.kind === 'drain' && event.actor === 'e0');
    assert.equal(rises.length, 1);
    assert.equal(rises[0].amount, Math.round(koschei.maxHp / 2));
    assert.equal(result.events.filter((event) => event.kind === 'kill' && event.target === 'e0').length, 1);
    assert.equal(result.won, true);
  });

  test('Postacie: a new shape with every move, in turn, each with its own blow', () => {
    const base = creature('hen-leg-hut', 280);
    const snake = { ...base.weapon, attackName: 'Wężowy jad', category: 'magical', element: 'poison' };
    const shapes = [
      { name: 'starzec', weapon: base.weapon, damageScale: base.damageScale },
      { name: 'wąż', weapon: snake, damageScale: base.damageScale },
    ];
    const result = fight([member('warrior', 'a0')], [{ ...base, shapes }], 'postacie');
    const own = result.events.filter((event) => event.actor === 'e0' && (BLOWS.has(event.kind) || event.kind === 'skill'));
    const names = own.filter((event) => event.kind !== 'skill').map((event) => (event.text.includes('Wężowy jad') ? 'wąż' : 'starzec'));
    assert.ok(names.length >= 10);
    assert.ok(names.every((name, index) => name === (index % 2 === 0 ? 'starzec' : 'wąż')), names.join(' '));
    const changes = own.filter((event) => event.kind === 'skill').map((event) => event.skillName);
    assert.equal(changes[0], 'wąż');
    assert.ok(changes.every((name, index) => name === (index % 2 === 0 ? 'wąż' : 'starzec')));
  });
});

const LANDS = [
  ['navia-marshes', 'Mgliste Bagna Nawii', 276, 300, 'indrik', 'nyja', { missChance: 0.05 }],
  ['veles-meadows', 'Łąki Welesa', 301, 325, 'turon', 'veles', { spellBonus: 0.05 }],
  ['sunless-land', 'Kraina bez Słońca', 326, 350, 'marzanna', 'koschei', { healMalus: 0.05 }],
];
// Each place with its creatures at the front, in the middle and at the back.
const PLACES = {
  'misty-shore': ['Mglisty Brzeg', 276, ['death-boat', 'water-strider', 'nameless']],
  'viburnum-bridge': ['Kalinowy Most', 281, ['bridge-keeper', 'harvestman', 'death-candle']],
  'forefathers-isle': ['Wyspa Praszczurów', 286, ['mole-cricket', 'forefather', 'giant-mole']],
  'crossing-of-the-dead': ['Przeprawa Umarłych', 291, ['coffin', 'two-headed-snake', 'candle-snuffer']],
  'gate-of-nav': ['Brama Nawii', 296, ['gatekeeper', 'hourglass', 'shade']],
  'eternal-pastures': ['Wieczne Pastwiska', 301, ['woolly-rhino', 'bumblebee', 'stampede']],
  'golden-ravines': ['Złote Jary', 306, ['cockroach', 'house-serpent', 'greed']],
  'serpent-springs': ['Wężowe Źródła', 311, ['pill-bug', 'snake-maiden', 'dead-water']],
  'veles-oakwood': ['Dąbrowa Welesa', 316, ['stick-insect', 'simargl', 'blood-feud']],
  'veles-court': ['Dwór Welesa', 321, ['ghost-smith', 'shackles', 'steward']],
  'frozen-caves': ['Zamarznięte Pieczary', 326, ['mammoth', 'pseudoscorpion', 'silence']],
  'road-of-the-dead': ['Szlak Umarłych', 331, ['sledge', 'snow-flea', 'oblivion']],
  'black-lake': ['Czarne Jezioro', 336, ['ice-block', 'mayfly', 'longing']],
  'chernobog-stronghold': ['Gród Czarnoboga', 341, ['dread', 'rat-king', 'black-flame']],
  'koschei-castle': ['Zamek Kościeja', 346, ['koschei-egg', 'bayun', 'ice-princess']],
};
const OWN = new Set([...Object.values(PLACES).flatMap(([, , roster]) => roster), ...LANDS.flatMap(([, , , , elite, champion]) => [elite, champion])]);
const region = (id) => content.regionsById[id];
const which = (test) => [...OWN].filter((id) => test(content.monstersById[id])).sort();

describe('Nawia', () => {
  test('three lands after the Łysogóry, each of five places of five levels, with its trait, its elite everywhere and its champion in the last place', () => {
    const after = content.regions.indexOf(region('bald-mountain'));
    assert.deepEqual(content.regions.slice(after + 1).map((one) => one.id), LANDS.map(([id]) => id));
    for (const [id, name, from, to, elite, champion, trait] of LANDS) {
      const land = region(id);
      assert.deepEqual([land.land, land.name, land.minLevel, land.maxLevel, land.safe, land.fightBoard], ['Nawia', name, from, to, false, `board-${id}`]);
      const { name: traitName, description, ...rule } = land.trait;
      assert.ok(traitName && description);
      assert.deepEqual(rule, trait);
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
    assert.equal(OWN.size, 51);
    // No bird among them (the author, 15.11.2026), and every one drawn by PixelLab under its own id.
    assert.deepEqual(which((monster) => monster.family === 'bird'), []);
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

  test('the ways of fighting of 1096', () => {
    assert.deepEqual(which((monster) => monster.ambush), ['mayfly', 'snow-flea', 'stick-insect', 'water-strider']);
    assert.deepEqual(which((monster) => monster.attack.target === 'back'), ['giant-mole', 'shade']);
    assert.deepEqual(which((monster) => monster.attack.cleave), ['indrik', 'marzanna', 'nyja']);
    assert.deepEqual(which((monster) => monster.attack.trample), ['sledge', 'stampede', 'turon']);
    assert.deepEqual(which((monster) => monster.attack.hits === 2), ['rat-king', 'two-headed-snake']);
    assert.deepEqual(which((monster) => monster.attack.stun), ['bayun', 'coffin', 'death-boat', 'dread', 'forefather', 'ghost-smith', 'mammoth', 'oblivion', 'pill-bug']);
    assert.deepEqual(which((monster) => monster.attack.silence), ['silence']);
    assert.deepEqual(which((monster) => monster.attack.dot2), ['black-flame']);
    assert.deepEqual([content.monstersById['black-flame'].attack.dot.effect, content.monstersById['black-flame'].attack.dot2.effect], ['burning', 'chilled']);
    assert.deepEqual(which((monster) => monster.attack.slow), ['bridge-keeper', 'greed', 'hourglass', 'ice-block', 'indrik', 'shackles', 'veles']);
    assert.deepEqual([which((monster) => monster.vengeance), which((monster) => monster.regen), which((monster) => monster.rises), which((monster) => monster.shapes)], [['blood-feud'], ['snake-maiden'], ['koschei'], ['veles']]);
    assert.deepEqual(content.monstersById.veles.shapes.map((shape) => shape.name), ['rogaty starzec', 'wąż', 'niedźwiedź']);
    // Nyja and Marzanna chill the whole line, each one struck with its own chance.
    assert.deepEqual(['nyja', 'marzanna'].map((id) => content.monstersById[id].attack.dot.effect), ['chilled', 'chilled']);
  });

  test('Weles strikes in his shapes in turn, and Kościej rises once, as the data says', () => {
    const veles = { ...monsterCombatant({ monsterId: 'veles', level: 327, id: 'e0' }, content), maxHp: 1e8, hp: 1e8 };
    assert.deepEqual(veles.shapes.map((shape) => shape.weapon.attackName), ['Laska Welesa', 'Kieł węża', 'Łapa niedźwiedzia']);
    const result = fight([member('warrior', 'a0', 325)], [veles], 'weles');
    const shifts = result.events.filter((event) => event.actor === 'e0' && event.kind === 'skill').map((event) => event.skillName);
    assert.deepEqual(shifts.slice(0, 4), ['wąż', 'niedźwiedź', 'rogaty starzec', 'wąż']);

    // Three plain Wojownicy fell him twice just within the 300 moves of a
    // fight (284) while their skills cost half as much; since 20.11.2026
    // (mana ×2) they strike half as many skills, so the fight may go on
    // longer: it is his rising that counts here.
    const koschei = monsterCombatant({ monsterId: 'koschei', level: 352, id: 'e0' }, content);
    const allies = [member('warrior', 'a0', 350), member('warrior', 'a1', 350), member('warrior', 'a2', 350)];
    const fall = simulateFight({ allies, enemies: [koschei], rng: createRng('kosciej-dane'), content, record: true, maxActions: 600 });
    assert.equal(fall.won, true);
    assert.deepEqual(fall.events.filter((event) => event.kind === 'drain' && event.actor === 'e0').map((event) => event.amount), [Math.round(koschei.maxHp * 0.5)]);
  });

  test('a Wanted variant of one of its own creatures waits in every place', () => {
    const variants = content.settlement.wanted.variants.filter((one) => one.area in PLACES);
    assert.deepEqual(variants.map((one) => one.area), Object.keys(PLACES));
    for (const one of variants) assert.ok(PLACES[one.area][2].includes(one.monster), one.area);
  });

  test('in the Wieże every champion still waits on a floor of its own: Nyja on the 200th, Weles on the 275th, Kościej on the 350th', () => {
    const { championEvery } = content.towers.floors;
    const floorOf = (placeId) => Array.from({ length: 2000 }, (_, index) => index + 1).find((one) => one % championEvery === 0 && towerArea(one, content).id === placeId);
    assert.deepEqual(['gate-of-nav', 'veles-court', 'koschei-castle'].map(floorOf), [200, 275, 350]);
    for (const [floor, champion] of [[200, 'nyja'], [275, 'veles'], [350, 'koschei']]) {
      const { encounter } = towerFloor(floor, 'any', content);
      assert.equal(encounter.champion, true);
      assert.equal(encounter.members[0].monsterId, champion);
    }
  });
});

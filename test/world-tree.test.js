// The World Tree (Drzewo Świata, levels 351–425, 1233 B): three lands of
// five places each, Wyspa Bujan, Wielki Pień and Podniebne Konary, written
// before their creatures (`soon` in data/regions.json), so the game does
// not see them yet; and their traits: Ałatyr (bleeding a move shorter, on
// both sides, never below one move), Stromizna (the rest between fights
// gives back 5% less of the missing HP and mana) and Wicher (everyone at
// the front of the formation fights with 5% less armour, on both sides).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import { createRng, monsterCombatant, playerCombatant, restedMana, simulateFight } from '../src/engine/index.js';
import { loadData, validateData } from '../tools/validate-data.mjs';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';

const LANDS = ['isle-of-buyan', 'great-trunk', 'sky-boughs'];
const LANDED = new Set(['hit', 'crit']);

// A unit that does not fall: a creature, on either side.
function creature(monsterId, level, { id = 'e0', side = 'enemy', attack = {} } = {}) {
  const unit = monsterCombatant({ monsterId, level, id, side }, content);
  return { ...unit, weapon: { ...unit.weapon, ...attack }, maxHp: 1e8, hp: 1e8, willRating: 0, dodgeRating: 0 };
}

const fight = (allies, enemies, seed, trait = null) => simulateFight({ allies, enemies, rng: createRng(seed), content, record: true, trait });

describe('the World Tree’s lands, written before their creatures', () => {
  const raw = loadData().regions;

  test('three lands of the World Tree after Kraina bez Słońca, levels 351–425, five places of five levels each', () => {
    const lands = raw.filter((region) => LANDS.includes(region.id));
    assert.deepEqual(lands.map((region) => region.id), LANDS);
    assert.equal(raw.findIndex((region) => region.id === 'isle-of-buyan'), raw.findIndex((region) => region.id === 'sunless-land') + 1);
    assert.deepEqual(lands.map((region) => [region.minLevel, region.maxLevel]), [[351, 375], [376, 400], [401, 425]]);
    for (const region of lands) {
      assert.equal(region.land, 'Drzewo Świata');
      assert.equal(region.soon, true);
      assert.equal(region.fightBoard, `board-${region.id}`);
      assert.equal(region.areas.length, 5);
      region.areas.forEach((area, index) => {
        assert.equal(area.minLevel, region.minLevel + index * 5);
        assert.equal(area.maxLevel, area.minLevel + 4);
        assert.deepEqual(area.encounters, []);
      });
    }
    assert.deepEqual(
      lands.flatMap((region) => region.areas.map((area) => area.name)),
      ['Skalisty Przylądek', 'Zatoka Rozbitków', 'Morskie Groty', 'Biały Kamień', 'Pod Zielonym Dębem', 'Korowe Urwiska', 'Hubowe Tarasy', 'Miodowe Barcie', 'Bursztynowe Kaskady', 'Bezdenna Dziupla', 'Rozwidlenie', 'Obłoczne Kładki', 'Morze Liści', 'Kołyska Księżyca', 'Najwyższa Gałąź'],
    );
    assert.deepEqual(
      lands.map((region) => [region.name, region.trait.name, Object.keys(region.trait).filter((key) => key !== 'name' && key !== 'description')]),
      [['Wyspa Bujan', 'Ałatyr', ['effectTicks']], ['Wielki Pień', 'Stromizna', ['restMalus']], ['Podniebne Konary', 'Wicher', ['frontArmorMalus']]],
    );
  });

  test('their English follows the glossary: World Tree, Isle of Buyan, Great Trunk, Sky Boughs', () => {
    const english = JSON.parse(readFileSync(new URL('../data/en/regions.json', import.meta.url), 'utf8'));
    assert.deepEqual(LANDS.map((id) => [english[id].land, english[id].name]), [['World Tree', 'Isle of Buyan'], ['World Tree', 'Great Trunk'], ['World Tree', 'Sky Boughs']]);
    for (const id of LANDS) assert.equal(Object.keys(english[id].areas).length, 5);
  });

  test('the game does not see them: no character goes there, the lands that are ready end at Kraina bez Słońca', () => {
    for (const id of LANDS) assert.equal(content.regionsById[id], undefined);
    for (const area of raw.filter((region) => region.soon).flatMap((region) => region.areas)) assert.equal(content.areasById[area.id], undefined);
    assert.equal(content.regions.at(-1).id, 'sunless-land');
    assert.equal(content.areas.at(-1).maxLevel, 350);
  });

  test('the validator: a land being made stands after the ready ones and goes on with their levels; it may lack an elite and encounters, a ready one may not', () => {
    assert.deepEqual(validateData(), []);
    const early = loadData();
    const [buyan] = early.regions.splice(early.regions.findIndex((region) => region.id === 'isle-of-buyan'), 1);
    early.regions.splice(1, 0, buyan);
    assert.ok(validateData(early).includes('regions.json: gotowa kraina stone-glade stoi za krainą w przygotowaniu'), validateData(early).join('\n'));
    const gap = loadData();
    const trunk = gap.regions.find((region) => region.id === 'great-trunk');
    trunk.minLevel = 380;
    trunk.areas[0].minLevel = 380;
    assert.ok(validateData(gap).includes('regions.json: kraina w przygotowaniu great-trunk powinna zaczynać się od poziomu 376'), validateData(gap).join('\n'));
    const ready = loadData();
    delete ready.regions.find((region) => region.id === 'sky-boughs').soon;
    const errors = validateData(ready);
    assert.ok(errors.some((error) => error.startsWith('regions.json/16') && error.includes('elite')), errors.join('\n'));
    assert.ok(errors.some((error) => error.startsWith('regions.json/16/areas/0/encounters')), errors.join('\n'));
    const unknown = loadData();
    unknown.regions.find((region) => region.id === 'isle-of-buyan').areas[0].encounters.push({ weight: 1, monsters: ['kraken'] });
    assert.deepEqual(validateData(unknown), ['regions.json: rocky-cape ma nieznanego potwora "kraken"']);
  });
});

describe('the traits of the World Tree', () => {
  // The first bleeding laid on `target` and the ticks it lasts (the first
  // tick's `left` is what is left after it).
  const bleedingTicks = (result, target) => {
    const laid = result.events.findIndex((event) => event.kind === 'effect' && event.target === target && event.effect === 'Krwawienie');
    assert.ok(laid >= 0, 'no bleeding laid');
    const tick = result.events.slice(laid + 1).find((event) => event.kind === 'tick' && event.target === target && event.effect === 'Krwawienie');
    return tick.left + 1;
  };

  test('Ałatyr: bleeding lasts a move less, a creature’s on a character and a character’s side’s on a creature, never below one move', () => {
    const ALATYR = { effectTicks: { bleeding: -1 } };
    const bleeds = (ticks) => ({ dot: { effect: 'bleeding', chance: 1, power: 0.25, ticks } });
    const { character, equipped } = typicalCharacter('warrior', 360, content);
    const hero = { ...playerCombatant({ character, equipped, name: 'warrior', id: 'a0' }, content), maxHp: 1e8, hp: 1e8, willRating: 0 };
    const claws = creature('wolverine', 360, { attack: bleeds(3) });
    assert.equal(bleedingTicks(fight([hero], [claws], 'alatyr'), 'a0'), 3);
    assert.equal(bleedingTicks(fight([hero], [claws], 'alatyr', ALATYR), 'a0'), 2);
    // The other side: a creature fighting with the party bleeds its foe as long, less on Ałatyr.
    const ally = creature('wolverine', 360, { id: 'a0', side: 'ally', attack: bleeds(3) });
    const foe = creature('hen-leg-hut', 360);
    assert.equal(bleedingTicks(fight([ally], [foe], 'alatyr-2'), 'e0'), 3);
    assert.equal(bleedingTicks(fight([ally], [foe], 'alatyr-2', ALATYR), 'e0'), 2);
    // A bleeding of one move stays one move.
    const short = creature('wolverine', 360, { attack: bleeds(1) });
    assert.equal(bleedingTicks(fight([hero], [short], 'alatyr-3', ALATYR), 'a0'), 1);
    // Other effects last as long as they did.
    const venom = creature('wolverine', 360, { attack: { dot: { effect: 'poisoned', chance: 1, power: 0.25, ticks: 3 } } });
    const poisoned = (trait) => fight([hero], [venom], 'alatyr-4', trait).events.find((event) => event.kind === 'tick' && event.target === 'a0').left;
    assert.equal(poisoned(ALATYR), poisoned(null));
  });

  test('Wicher: everyone at the front fights with 5% less armour, on both sides, and the middle and the back as before', () => {
    const GALE = { frontArmorMalus: 0.05 };
    const { character, equipped } = typicalCharacter('warrior', 410, content);
    const front = { ...playerCombatant({ character: { ...character, position: 'front' }, equipped, name: 'front', id: 'a0' }, content), maxHp: 1e8, hp: 1e8, dodgeRating: 0 };
    const back = { ...playerCombatant({ character: { ...character, position: 'back' }, equipped, name: 'back', id: 'a1' }, content), maxHp: 1e8, hp: 1e8, dodgeRating: 0 };
    const brute = creature('hen-leg-hut', 410);
    assert.equal(brute.position, 'front');
    assert.equal(brute.weapon.category, 'physical');
    const blows = (trait) => fight([front, back], [brute], 'wicher', trait).events.filter((event) => LANDED.has(event.kind));
    const [calm, windy] = [blows(null), blows(GALE)];
    assert.equal(windy.length, calm.length);
    const pairs = calm.map((event, index) => [event, windy[index]]);
    // The creature's blows on the character at the front strike harder, on
    // the one at the back as before; the party's blows on the creature at
    // the front strike harder too.
    const onFront = pairs.filter(([event]) => event.actor === 'e0' && event.target === 'a0');
    const onBack = pairs.filter(([event]) => event.actor === 'e0' && event.target === 'a1');
    const onCreature = pairs.filter(([event]) => event.target === 'e0');
    assert.ok(onFront.length > 0 && onBack.length > 0 && onCreature.length > 0);
    assert.ok(onFront.every(([a, b]) => b.damage >= a.damage) && onFront.some(([a, b]) => b.damage > a.damage));
    assert.ok(onBack.every(([a, b]) => b.damage === a.damage));
    assert.ok(onCreature.every(([a, b]) => b.damage >= a.damage) && onCreature.some(([a, b]) => b.damage > a.damage));
  });

  test('Stromizna: the rest between fights gives back 5% less of the missing HP and mana, never below none', () => {
    const { character, equipped } = typicalCharacter('mage', 390, content);
    const steep = { trait: { name: 'Stromizna', description: '', restMalus: 0.05 } };
    const flat = { trait: { name: 'x', description: '' } };
    const recovery = (area) => playerCombatant({ character, equipped, name: 'mage', area }, content).recovery;
    assert.ok(Math.abs(recovery(flat) - recovery(steep) - 0.05) < 1e-9, `${recovery(flat)} → ${recovery(steep)}`);
    assert.equal(recovery({ trait: { name: 'x', description: '', restMalus: 5 } }), 0);
    const share = content.balance.hunt.manaRecoveryAfterFight;
    assert.equal(restedMana(0, 1000, content), Math.round(1000 * share));
    assert.equal(restedMana(0, 1000, content, steep.trait), Math.round(1000 * (share - 0.05)));
    assert.equal(restedMana(0, 1000, content, flat.trait), restedMana(0, 1000, content));
    assert.equal(restedMana(null, 1000, content, steep.trait), null);
  });
});

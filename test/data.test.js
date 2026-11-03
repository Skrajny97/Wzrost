import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadData, validateData } from '../tools/validate-data.mjs';

test('game data matches the schemas and its references hold', () => {
  assert.deepEqual(validateData(), []);
});

test('the validator catches broken references and schema errors', () => {
  const data = structuredClone(loadData());
  data.regions[0].areas[0].encounters[0].monsters = ['dragon'];
  data.classes[0].autoPoints = { strength: 1 };
  assert.deepEqual(validateData(data), [
    'classes.json: warrior rozdaje 1 punktów, a poziom daje 8',
    'regions.json: windfalls-edge ma nieznanego potwora "dragon"',
  ]);

  // Inner regions follow one another without gaps.
  const gap = structuredClone(loadData());
  gap.regions[0].areas[1].minLevel = 7;
  assert.deepEqual(validateData(gap), ['regions.json: fox-ravines powinien zaczynać się od poziomu 6']);

  // A report's music must be a known track, for a known result.
  const music = structuredClone(loadData());
  music.music.reports.success = 'fanfare';
  assert.deepEqual(validateData(music), ['music.json: raport success ma nieznany utwór fanfare']);
  music.music.reports = { draw: 'victory-v1' };
  assert.match(validateData(music)[0], /^music\.json\/reports: must be equal to one of the allowed values/);

  // Every creature has a name for affixes, and a suffix of an older item has
  // a creature or a text to go by.
  const affixes = structuredClone(loadData());
  affixes.affixes.names = affixes.affixes.names.filter((name) => name.monster !== 'stag');
  affixes.affixes.suffixes.find((affix) => affix.id === 'mire').monster = 'wolf';
  assert.deepEqual(validateData(affixes), ['affixes.json: stwór stag nie ma nazwy do afiksów', 'affixes.json: przyrostek mire ma mieć stwora albo tekst']);

  // An event limited to inner regions comes only where its creatures live.
  const events = structuredClone(loadData());
  events.events.list[0].areas = ['windfalls-edge', 'viper-heaps', 'nowhere'];
  assert.deepEqual(validateData(events), [
    'events.json: wounded-woman przychodzi w viper-heaps, a tam nie żyje wisp',
    'events.json: wounded-woman ma nieznany region wewnętrzny "nowhere"',
  ]);

  // The Duch budowniczego buys known resources only, each for less than the
  // fire spirit sells a piece of it at the Ognisko's top level.
  const spirit = structuredClone(loadData());
  spirit.camp.cornerstone.spirit.gold = { ...spirit.camp.cornerstone.spirit.gold, 'iron-ore': 500, clay: 1 };
  assert.deepEqual(validateData(spirit), [
    'camp.json: duch budowniczego płaci za "iron-ore" co najmniej tyle, ile duch ognia bierze za sztukę',
    'camp.json: duch budowniczego skupuje nieznany zasób "clay"',
  ]);

  // The Salon Gier: a chance under 100% (a prize is worth more than the
  // stake and at most what a win costs), item rarities in order, rarities
  // that exist, and the draw's words that name the winner and the gold.
  const casino = structuredClone(loadData());
  casino.settlement.casino.wheel.chance = 1;
  casino.settlement.casino.wheel.topItemRarity = 'common';
  casino.settlement.casino.wheel.materialRarities = { epic: 3, golden: 1 };
  casino.settlement.casino.texts.announce = 'Loterię [wygrała|wygrał] {name}.';
  assert.deepEqual(validateData(casino), [
    'settlement.json: szansa Koła musi być mniejsza niż 100%, żeby nagroda mogła być warta więcej niż stawka',
    'settlement.json: casino.wheel.topItemRarity nie może być niższa niż itemRarity',
    'settlement.json: casino.wheel.materialRarities ma nieznaną rzadkość golden',
    'settlement.json: casino.texts.announce nie ma {gold}',
  ]);

  const broken = structuredClone(loadData());
  broken.rarities[0].color = 'grey';
  assert.match(validateData(broken)[0], /^rarities\.json\/0\/color: must match pattern/);
});

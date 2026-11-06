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

  // A code repeats only for different single characters (the PC code for
  // several players): not for the same one, and a code for everyone never.
  const codes = structuredClone(loadData());
  const pc = codes['gift-codes'].codes.find((gift) => gift.code === 'PC');
  codes['gift-codes'].codes.push({ ...pc, id: 'pc-twice' }, { ...pc, id: 'pc-for-all', for: undefined });
  codes['gift-codes'].codes.push({ ...codes['gift-codes'].codes.find((gift) => gift.code === 'TIGER'), id: 'tiger-twice' });
  assert.deepEqual(validateData(codes), ['gift-codes.json: kod PC powtarza się', 'gift-codes.json: kod PC powtarza się', 'gift-codes.json: kod TIGER powtarza się']);

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
  // A place of the Osada with its own music (the Salon Gier's) is one of its places.
  const placed = structuredClone(loadData());
  placed.music.places['settlement:nowhere'] = 'casino-v1';
  assert.deepEqual(validateData(placed), ['music.json: nieznane miejsce settlement:nowhere']);

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

  // The Salon Gier: the Wheel's chances of nothing and of the tiers adding up
  // to 1 at the lowest stake and at the highest, nothing no likelier at a
  // higher stake (586), rarities that exist, ranges from the fewer pieces,
  // and the draw's words that name the winner and the gold.
  const casino = structuredClone(loadData());
  casino.settlement.casino.wheel.none = { low: 0.5, high: 0.65 };
  casino.settlement.casino.wheel.goodRarity = 'golden';
  casino.settlement.casino.wheel.weakMaterials = [4, 2];
  casino.settlement.casino.texts.announce = 'Loterię [wygrała|wygrał] {name}.';
  assert.deepEqual(validateData(casino), [
    'settlement.json: casino.wheel: none.low i szanse progów (low) muszą dawać razem 1, a dają 0.8',
    'settlement.json: casino.wheel: none.high i szanse progów (high) muszą dawać razem 1, a dają 1.05',
    'settlement.json: casino.wheel.none.high nie może być większe niż none.low: wyższa stawka nie zmniejsza szansy na wygraną',
    'settlement.json: casino.wheel.goodRarity to nieznana rzadkość golden',
    'settlement.json: casino.wheel.weakMaterials: od nie może być więcej niż do',
    'settlement.json: casino.texts.announce nie ma {gold}',
  ]);

  // A pet of the Sklep Systemu: its sheets are there, each its frames side by
  // side, and a place on the portrait counted from its corner starts on it.
  const pets = structuredClone(loadData());
  const fox = pets.cosmetics.items.find((item) => item.id === 'fox');
  fox.pet.walk.file = 'art/pets/nope.png';
  fox.pet.portrait.frames = 7;
  fox.pet.portrait.x = -5;
  assert.deepEqual(validateData(pets), [
    'cosmetics.json: fox: brak arkusza src/client/art/pets/nope.png',
    'cosmetics.json: fox: arkusz art/pets/fox-portrait.png ma 256 × 32, a 7 klatek po 32 × 32 to 224 × 32',
    'cosmetics.json: fox: chowaniec poza portretem 96 × 128',
  ]);
  // Its places in the Walka scene, walking and riding, each with a bottom or a top.
  const placeless = structuredClone(loadData());
  const raven = placeless.cosmetics.items.find((item) => item.id === 'raven');
  delete raven.pet.ride;
  raven.pet.foot.bottom = 0;
  const placeErrors = validateData(placeless);
  assert.ok(placeErrors.some((error) => /^cosmetics\.json\/items\/\d+\/pet: must have required property 'ride'/.test(error)), placeErrors.join('\n'));
  assert.ok(placeErrors.some((error) => /^cosmetics\.json\/items\/\d+\/pet\/foot: must match exactly one schema in oneOf/.test(error)), placeErrors.join('\n'));

  // A rare recipe of Jagna's comes at a standing of the relation that exists (121 A).
  const taught = structuredClone(loadData());
  taught.professions.potions.find((potion) => potion.id === 'owl-draught').taught = 'beloved';
  assert.deepEqual(validateData(taught), ['professions.json: mikstura owl-draught ma nieznany stopień relacji "beloved" (taught)']);

  const broken = structuredClone(loadData());
  broken.rarities[0].color = 'grey';
  assert.match(validateData(broken)[0], /^rarities\.json\/0\/color: must match pattern/);
});

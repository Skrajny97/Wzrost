// The World Tree (Drzewo Świata, levels 351–425, 1233 B): three lands of
// five places each, Wyspa Bujan, Wielki Pień and Podniebne Konary, with
// their traits on both sides: Ałatyr (bleeding a move shorter, never below
// one move), Stromizna (the rest between fights gives back 5% less of the
// missing HP and mana) and Wicher (everyone at the front of the formation
// fights with 5% less armour); their 51 creatures as the author rated them
// (1240), their materials, Wanted, champions in the Wieże, the three World
// Bosses of their bands (1241) and the explorer's achievement. A land may
// also be written before its creatures (`soon` in data/regions.json): the
// game does not see it then, and the validator checks it on its own.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import { buildContent, createRng, monsterCombatant, playerCombatant, restedMana, simulateFight, towerArea, towerFloor, worldBossBand, worldBossBands } from '../src/engine/index.js';
import { loadData, validateData } from '../tools/validate-data.mjs';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';

const LANDED = new Set(['hit', 'crit']);
const LANDS = [
  ['isle-of-buyan', 'Wyspa Bujan', 351, 375, 'ninth-wave', 'octopus', { effectTicks: { bleeding: -1 } }],
  ['great-trunk', 'Wielki Pień', 376, 400, 'pangolin', 'heartwood', { restMalus: 0.05 }],
  ['sky-boughs', 'Podniebne Konary', 401, 425, 'ball-lightning', 'pride', { frontArmorMalus: 0.05 }],
];
// Each place with its creatures at the front, in the middle and at the back.
const PLACES = {
  'rocky-cape': ['Skalisty Przylądek', 351, ['horseshoe-crab', 'starfish', 'electric-ray']],
  'shipwreck-bay': ['Zatoka Rozbitków', 356, ['shark', 'pufferfish', 'swordfish']],
  'sea-caves': ['Morskie Groty', 361, ['sea-cucumber', 'anglerfish', 'lions-mane']],
  'white-stone': ['Biały Kamień', 366, ['walrus', 'haemorrhage', 'whispered-charm']],
  'green-oak': ['Pod Zielonym Dębem', 371, ['acorn', 'acorn-weevil', 'oak-gall']],
  'bark-cliffs': ['Korowe Urwiska', 376, ['processionary', 'tarsier', 'scorpionfly']],
  'fungus-terraces': ['Hubowe Tarasy', 381, ['beefsteak-fungus', 'water-shrew', 'snakefly']],
  'honey-hives': ['Miodowe Barcie', 386, ['log-hive', 'waxworm', 'intoxication']],
  'amber-cascades': ['Bursztynowe Kaskady', 391, ['jewel-beetle', 'gecko', 'glare']],
  'bottomless-hollow': ['Bezdenna Dziupla', 396, ['capricorn-beetle', 'olm', 'honey-fungus']],
  'great-fork': ['Rozwidlenie', 401, ['sloth', 'aphid', 'hesitation']],
  'cloud-bridges': ['Obłoczne Kładki', 406, ['hailstone', 'flying-carpet', 'thunder-arrow']],
  'sea-of-leaves': ['Morze Liści', 411, ['bush-cricket', 'chameleon', 'oak-leaf']],
  'moon-cradle': ['Kołyska Księżyca', 416, ['sleepwalker', 'glowworm', 'moon-halo']],
  'highest-bough': ['Najwyższa Gałąź', 421, ['shield-bug', 'ladybird', 'comet']],
};
const OWN = new Set([...Object.values(PLACES).flatMap(([, , roster]) => roster), ...LANDS.flatMap(([, , , , elite, champion]) => [elite, champion])]);
const region = (id) => content.regionsById[id];
const which = (rule) => [...OWN].filter((id) => rule(content.monstersById[id])).sort();

// A unit that does not fall: a creature, on either side.
function creature(monsterId, level, { id = 'e0', side = 'enemy', attack = {} } = {}) {
  const unit = monsterCombatant({ monsterId, level, id, side }, content);
  return { ...unit, weapon: { ...unit.weapon, ...attack }, maxHp: 1e8, hp: 1e8, willRating: 0, dodgeRating: 0 };
}

const fight = (allies, enemies, seed, trait = null) => simulateFight({ allies, enemies, rng: createRng(seed), content, record: true, trait });

describe('the World Tree', () => {
  test('three lands after Kraina bez Słońca, each of five places of five levels, with its trait, its elite everywhere and its champion in the last place', () => {
    const after = content.regions.indexOf(region('sunless-land'));
    assert.deepEqual(content.regions.slice(after + 1).map((one) => one.id), LANDS.map(([id]) => id));
    for (const [id, name, from, to, elite, champion, trait] of LANDS) {
      const land = region(id);
      assert.deepEqual([land.land, land.name, land.minLevel, land.maxLevel, land.safe, land.fightBoard], ['Drzewo Świata', name, from, to, false, `board-${id}`]);
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
    // No bird among them (the author, 15.11.2026), and every one drawn as the author chose it (1240).
    assert.deepEqual(which((monster) => monster.family === 'bird'), []);
  });

  test('every creature, place circle, land card and fight board drawn, the bosses too, in the sprites’ lists', async () => {
    const { SPRITES } = await import('../src/client/art.js');
    for (const id of [...OWN, 'wb-whale-fish', 'wb-svarozhich', 'wb-miesiac']) assert.ok(SPRITES.monsters.ids.includes(id), id);
    for (const id of Object.keys(PLACES)) assert.ok(SPRITES.areas.ids.includes(id), id);
    for (const [id] of LANDS) {
      assert.ok(SPRITES.lands.ids.includes(id), id);
      assert.ok(SPRITES.boards.ids.includes(`board-${id}`), id);
    }
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

  test('the ways of fighting of 1240', () => {
    assert.deepEqual(which((monster) => monster.ambush), ['bush-cricket', 'shark', 'water-shrew']);
    assert.deepEqual(which((monster) => monster.hidden), ['anglerfish', 'chameleon']);
    assert.deepEqual(which((monster) => monster.attack.target === 'back'), ['gecko', 'swordfish', 'thunder-arrow']);
    assert.deepEqual(which((monster) => monster.attack.cleave), ['ball-lightning', 'log-hive', 'oak-gall', 'pride']);
    assert.deepEqual(which((monster) => monster.attack.trample), ['heartwood', 'ninth-wave']);
    assert.deepEqual(which((monster) => monster.attack.hits === 2), ['flying-carpet', 'octopus', 'scorpionfly']);
    assert.deepEqual(which((monster) => monster.attack.stun), ['acorn', 'electric-ray', 'hailstone', 'tarsier']);
    assert.deepEqual(which((monster) => monster.attack.silence), ['intoxication', 'moon-halo', 'whispered-charm']);
    assert.deepEqual(which((monster) => monster.attack.slow), ['hesitation', 'ninth-wave', 'octopus', 'waxworm']);
    assert.deepEqual(which((monster) => monster.attack.drain), ['aphid', 'beefsteak-fungus', 'haemorrhage']);
    assert.deepEqual(
      [which((monster) => monster.vengeance), which((monster) => monster.regen), which((monster) => monster.rises)],
      [['sea-cucumber', 'sleepwalker'], ['heartwood', 'ladybird', 'olm', 'starfish'], ['pride']],
    );
    const effects = (effect) => which((monster) => monster.attack.dot?.effect === effect);
    assert.deepEqual(effects('bleeding'), ['acorn-weevil', 'capricorn-beetle', 'oak-leaf', 'pangolin', 'shark', 'snakefly', 'walrus']);
    assert.deepEqual(effects('poisoned'), ['processionary', 'pufferfish', 'shield-bug', 'water-shrew']);
    assert.deepEqual(effects('burning'), ['ball-lightning', 'comet', 'glare', 'lions-mane']);
    assert.deepEqual(effects('chilled'), ['glowworm', 'honey-fungus']);
  });

  test('Pycha rises once with half its HP, and the second time it falls for good', () => {
    const pride = { ...monsterCombatant({ monsterId: 'pride', level: 427, id: 'e0' }, content) };
    const warrior = (id) => {
      const { character, equipped } = typicalCharacter('warrior', 425, content);
      return { ...playerCombatant({ character, equipped, name: id, id }, content), maxHp: 1e8, hp: 1e8 };
    };
    const result = simulateFight({ allies: [warrior('a0'), warrior('a1'), warrior('a2')], enemies: [pride], rng: createRng('pycha'), content, record: true, maxActions: 600 });
    assert.equal(result.won, true);
    assert.deepEqual(result.events.filter((event) => event.kind === 'drain' && event.actor === 'e0' && event.amount === Math.round(pride.maxHp * 0.5)).length, 1);
  });

  test('a Wanted variant of one of its own creatures waits in every place', () => {
    const variants = content.settlement.wanted.variants.filter((one) => one.area in PLACES);
    assert.deepEqual(variants.map((one) => one.area), Object.keys(PLACES));
    for (const one of variants) assert.ok(PLACES[one.area][2].includes(one.monster), one.area);
  });

  test('in the Wieże every champion still waits on a floor of its own: Ośmiornica on the 75th, Serce Pnia on the 250th, Pycha on the 425th', () => {
    const { championEvery } = content.towers.floors;
    const floorOf = (placeId) => Array.from({ length: 2000 }, (_, index) => index + 1).find((one) => one % championEvery === 0 && towerArea(one, content).id === placeId);
    assert.deepEqual(['green-oak', 'bottomless-hollow', 'highest-bough'].map(floorOf), [75, 250, 425]);
    for (const [floor, champion] of [[75, 'octopus'], [250, 'heartwood'], [425, 'pride']]) {
      const { encounter } = towerFloor(floor, 'any', content);
      assert.equal(encounter.champion, true);
      assert.equal(encounter.members[0].monsterId, champion);
    }
  });

  test('three new bands of the World Boss: Ryba-Wieloryb for 351–375, Swarożyc for 376–400, Miesiąc for 401–425, each with its cry', () => {
    const bands = worldBossBands(content).slice(-3);
    assert.deepEqual(bands.map((band) => [band.boss.id, band.minLevel, band.maxLevel]), [['wb-whale-fish', 351, 375], ['wb-svarozhich', 376, 400], ['wb-miesiac', 401, 425]]);
    assert.equal(worldBossBand(388, 380, content).boss.id, 'wb-svarozhich');
    const { voices } = loadData().sounds;
    for (const id of ['wb-whale-fish', 'wb-svarozhich', 'wb-miesiac']) {
      assert.deepEqual(voices[id].cry.files, [`audio/sfx/${id}-cry-1.mp3`]);
    }
    const levels = content.worldBosses.damage.map(([level]) => level);
    for (const level of [351, 363, 375, 376, 388, 400, 401, 413, 425]) assert.ok(levels.includes(level), String(level));
  });

  test('Odkrywca Drzewa Świata: reaching the World Tree, as the explorers of the lands before', () => {
    const lands = JSON.parse(readFileSync(new URL('../data/achievements.json', import.meta.url), 'utf8'));
    const all = JSON.stringify(lands);
    assert.ok(all.includes('"id":"tree-explorer"'));
    const explorer = JSON.parse(all.slice(all.indexOf('{"id":"tree-explorer"'), all.indexOf('}', all.indexOf('"art":', all.indexOf('"id":"tree-explorer"'))) + 1));
    assert.deepEqual([explorer.count, explorer.land, explorer.target, explorer.title], ['landReached', 'Drzewo Świata', 1, ['Odkrywca Drzewa Świata', 'Odkrywczyni Drzewa Świata']]);
  });

  test('their English follows the glossary: World Tree, Isle of Buyan, Great Trunk, Sky Boughs; every creature and material named', () => {
    const read = (name) => JSON.parse(readFileSync(new URL(`../data/en/${name}.json`, import.meta.url), 'utf8'));
    const english = read('regions');
    assert.deepEqual(LANDS.map(([id]) => [english[id].land, english[id].name]), [['World Tree', 'Isle of Buyan'], ['World Tree', 'Great Trunk'], ['World Tree', 'Sky Boughs']]);
    const monsters = read('monsters');
    const materials = read('materials').materials;
    for (const id of OWN) {
      assert.ok(monsters[id]?.name && monsters[id].counted.length === 3 && monsters[id].attack.name, id);
      assert.ok(materials[content.materialsByMonster[id].id]?.name, id);
    }
    const bosses = read('world-bosses').bosses;
    assert.deepEqual(['wb-whale-fish', 'wb-svarozhich', 'wb-miesiac'].map((id) => bosses[id].name), ['Whale-Fish', 'Svarozhich', 'Myesyats']);
  });
});

describe('a land written before its creatures (`soon`)', () => {
  // The Podniebne Konary as if written before their creatures: no
  // encounters, no elite or champion in them, and none of their creatures,
  // materials, names, Wanted, cries or World Boss in the data.
  const soonData = () => {
    const raw = loadData();
    const boughs = raw.regions.find((one) => one.id === 'sky-boughs');
    const places = new Set(boughs.areas.map((area) => area.id));
    const gone = new Set([boughs.elite, ...boughs.areas.flatMap((area) => [...area.encounters, ...area.tough].flatMap((encounter) => encounter.monsters).concat(area.champion ?? []))]);
    boughs.soon = true;
    delete boughs.elite;
    for (const area of boughs.areas) {
      area.encounters = [];
      delete area.tough;
      delete area.champion;
    }
    raw.monsters = raw.monsters.filter((monster) => !gone.has(monster.id));
    raw.materials.materials = raw.materials.materials.filter((material) => !gone.has(material.monster));
    raw.affixes.names = raw.affixes.names.filter((name) => !gone.has(name.monster));
    raw.settlement.wanted.variants = raw.settlement.wanted.variants.filter((variant) => !places.has(variant.area));
    for (const boss of raw['world-bosses'].bosses.filter((one) => one.region === 'sky-boughs')) delete raw.sounds.voices[boss.sound];
    raw['world-bosses'].bosses = raw['world-bosses'].bosses.filter((boss) => boss.region !== 'sky-boughs');
    for (const id of gone) delete raw.sounds.voices[id];
    return raw;
  };

  test('the game does not see it: no character goes there, and the lands that are ready end before it', () => {
    const raw = soonData();
    assert.deepEqual(validateData(raw), []);
    const game = buildContent(raw);
    assert.equal(game.regionsById['sky-boughs'], undefined);
    assert.equal(game.areasById['great-fork'], undefined);
    assert.equal(game.regions.at(-1).id, 'great-trunk');
    assert.equal(game.areas.at(-1).maxLevel, 400);
  });

  test('the validator: it stands after the ready lands and goes on with their levels; it may lack an elite and encounters, a ready one may not', () => {
    const early = soonData();
    const [boughs] = early.regions.splice(early.regions.findIndex((one) => one.id === 'sky-boughs'), 1);
    early.regions.splice(1, 0, boughs);
    assert.ok(validateData(early).includes('regions.json: gotowa kraina stone-glade stoi za krainą w przygotowaniu'), validateData(early).join('\n'));
    const gap = soonData();
    const moved = gap.regions.find((one) => one.id === 'sky-boughs');
    moved.minLevel = 405;
    moved.areas[0].minLevel = 405;
    assert.ok(validateData(gap).includes('regions.json: kraina w przygotowaniu sky-boughs powinna zaczynać się od poziomu 401'), validateData(gap).join('\n'));
    const ready = soonData();
    delete ready.regions.find((one) => one.id === 'sky-boughs').soon;
    const errors = validateData(ready);
    assert.ok(errors.some((error) => error.startsWith('regions.json/16') && error.includes('elite')), errors.join('\n'));
    assert.ok(errors.some((error) => error.startsWith('regions.json/16/areas/0/encounters')), errors.join('\n'));
    const unknown = soonData();
    unknown.regions.find((one) => one.id === 'sky-boughs').areas[0].encounters.push({ weight: 1, monsters: ['kraken'] });
    assert.deepEqual(validateData(unknown), ['regions.json: great-fork ma nieznanego potwora "kraken"']);
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

  test('the traits stand in the lands: Wyspa Bujan bleeds shorter, Wielki Pień rests less, Podniebne Konary blow at the front', () => {
    assert.deepEqual(region('isle-of-buyan').trait.effectTicks, { bleeding: -1 });
    assert.equal(region('great-trunk').trait.restMalus, 0.05);
    assert.equal(region('sky-boughs').trait.frontArmorMalus, 0.05);
  });
});

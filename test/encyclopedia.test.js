// The Encyklopedia: what a character holds written down, its tabs, tiers
// and sets, the chests of sets and counts, the trophies of materials and
// their blows in fights, and through the API the record kept with every
// request, the chests opened once and the trophies taken on explorations.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  createRng,
  encyclopediaChest,
  encyclopediaView,
  heldDiscoveries,
  itemSets,
  mergeDiscoveries,
  monsterCombatant,
  playerCombatant,
  readyChests,
  simulateFight,
  trophyBonuses,
  trophyGrades,
} from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

describe('the Encyklopedia in the engine', () => {
  test('what a character holds becomes keys: each base with its best rarity, potions, herbs, grades of materials and parts', () => {
    const held = heldDiscoveries(
      {
        items: [
          { base: 'sword', rarity: 'common' },
          { base: 'sword', rarity: 'epic' },
          { base: 'no-such-base', rarity: 'rare' },
        ],
        potions: { 'lesser-healing': 2, 'no-such-potion': 1, mana: 0 },
        herbs: { comfrey: 5 },
        materials: { 'wolf-pelt:rare': 3, 'constructor:common': 1, 'fox-pelt:common': 0 },
        parts: { scraps: 4 },
      },
      content,
    );
    assert.deepEqual(held, { 'item:sword': 4, 'potion:lesser-healing': 1, 'herb:comfrey': 1, 'material:wolf-pelt:rare': 1, 'part:scraps': 1 });
    assert.equal(mergeDiscoveries(held, { 'item:sword': 2, 'herb:comfrey': 1 }), null);
    assert.deepEqual(mergeDiscoveries({ 'item:sword': 2, 'herb:comfrey': 1 }, held), held);
  });

  test('items come in ten tiers by the class level they are worn from, each with a set for every class and one with the accessories', () => {
    const sets = itemSets(content);
    assert.equal(sets.length, 60);
    assert.deepEqual(
      sets.filter((set) => set.tier === 0).map((set) => [set.name, set.bases.length]),
      [
        ['Wojownik', 5],
        ['Łucznik', 4],
        ['Mag', 4],
        ['Kleryk', 5],
        ['Cień', 4],
        ['Dodatki', 5],
      ],
    );
    assert.deepEqual(sets.find((set) => set.id === 'items:2:warrior').bases.slice(0, 3), ['broadsword', 'war-axe', 'pavise']);
    // Tier V (the author's 582), from class level 75.
    assert.deepEqual(sets.find((set) => set.id === 'items:5:warrior').bases.slice(0, 3), ['karabela', 'halberd', 'hussar-shield']);
    // Tier VI (665), from class level 100.
    assert.deepEqual(sets.find((set) => set.id === 'items:6:warrior').bases.slice(0, 3), ['flamberge', 'double-axe', 'jousting-shield']);
    // Tier VII (814), from class level 125.
    assert.deepEqual(sets.find((set) => set.id === 'items:7:warrior').bases.slice(0, 3), ['coronation-sword', 'nadziak', 'royal-shield']);
    // Tier VIII (949), from class level 150.
    assert.deepEqual(sets.find((set) => set.id === 'items:8:warrior').bases.slice(0, 3), ['self-swinging-sword', 'executioner-axe', 'aegis']);
    // Tier IX (1018), from class level 175.
    assert.deepEqual(sets.find((set) => set.id === 'items:9:warrior').bases.slice(0, 3), ['szczerbiec', 'perun-axe', 'achilles-shield']);
    // Tier X (1086), from class level 200.
    assert.deepEqual(sets.find((set) => set.id === 'items:10:warrior').bases.slice(0, 3), ['grunwald-sword', 'svarozhich-axe', 'lech-shield']);
    const covered = new Set(sets.flatMap((set) => set.bases));
    assert.equal(covered.size, content.bases.length);
  });

  // The author's 570 A and 665: Tier VI from class level 100, as Tier V came
  // from 75 (DECISIONS.md, "Tier V w grze").
  test('Tier VI: its items from class level 100 with a set for every class and the accessories, its chest, and the materials of creatures above level 125', () => {
    const levels = { level: 130, classLevel: 100, professions: {} };
    const view = encyclopediaView({ discovered: {}, claimed: [], met: [], levels }, content);
    const sixth = view.items.tiers.find((tier) => tier.name === 'Tier VI');
    assert.deepEqual([sixth.name, sixth.range, sixth.current, sixth.entries.length], ['Tier VI', 'od 100. poziomu klasy', true, 22]);
    assert.deepEqual(
      sixth.sets.map((set) => [set.name, set.bases]),
      [
        ['Wojownik', ['flamberge', 'double-axe', 'jousting-shield', 'great-helm', 'gothic-armor']],
        ['Łucznik', ['scythian-bow', 'parade-quiver', 'diadem', 'kontusz']],
        ['Mag', ['caduceus', 'astrolabe', 'diadem', 'ferezja']],
        ['Kleryk', ['processional-cross', 'jousting-shield', 'astrolabe', 'halo', 'cassock']],
        ['Cień', ['cinquedea', 'swordbreaker', 'diadem', 'kontusz']],
        ['Dodatki', ['falconry-gloves', 'sabatons', 'cameo', 'eternity-ring', 'lunula']],
      ],
    );
    // A full set opens the sixth chest, more than Tier V's.
    for (const set of sixth.sets) assert.deepEqual(set.chest, content.encyclopedia.chests[5], set.name);
    assert.deepEqual(content.encyclopedia.chests.slice(4, 6), [
      { gold: 2500, timePoints: 50, systemPoints: 32 },
      { gold: 6250, timePoints: 60, systemPoints: 64 },
    ]);
    const warrior = itemSets(content).find((set) => set.id === 'items:6:warrior');
    const found = Object.fromEntries(warrior.bases.map((id) => [`item:${id}`, 1]));
    assert.deepEqual(encyclopediaChest('items:6:warrior', found, [], content).chest, { gold: 6250, timePoints: 60, systemPoints: 64 });
    // Where it comes from: explorations from Stare Wyrobisko (96–100), worn
    // from class level 100, the Warsztat's and the Szlifiernia's patterns
    // from level 100 of their professions.
    assert.deepEqual(sixth.entries.find((entry) => entry.id === 'flamberge').sources, [
      'Wyprawy: wypada od regionu Stare Wyrobisko (poz. 96–100).',
      'Dla klas: Wojownik, Wielki Inkwizytor, Pogromca Demonów, Mściciel Niebios.',
      'Założysz od 100. poziomu klasy.',
      'Warsztat: wzór od 100. poziomu Rzemieślnictwa.',
    ]);
    assert.ok(sixth.entries.find((entry) => entry.id === 'cameo').sources.includes('Szlifiernia: wzór od 100. poziomu Jubilerstwa.'));
    // Materials by the highest level of their creature: up to 125 in Tier V,
    // 126–150 in Tier VI (Sosnowe Wydmy, and the creatures of Rokitowe
    // Bezdno that come a level or two above its 125); Tier VII takes those
    // above 150.
    assert.deepEqual(view.materials.tiers.filter((tier) => ['Tier V', 'Tier VI'].includes(tier.name)).map((tier) => [tier.name, tier.range, tier.current]), [
      ['Tier V', 'poziomy 101–125', false],
      ['Tier VI', 'poziomy 126–150', true],
    ]);
    const tierOf = (materialId) => view.materials.tiers.find((tier) => tier.entries.some((entry) => entry.id === materialId)).name;
    assert.deepEqual(['glassy-sand', 'latawiec-membrane', 'cyrograf', 'bog-lantern-eye', 'veles-scale'].map(tierOf), ['Tier VI', 'Tier VI', 'Tier VI', 'Tier V', 'Tier V']);
  });

  // The author's 814: Tier VII from class level 125, as Tier VI came from
  // 100 (DECISIONS.md, "Tier VII przedmiotów").
  test('Tier VII: its items from class level 125 with a set for every class and the accessories, its chest, and the materials of creatures above level 150', () => {
    const levels = { level: 160, classLevel: 125, professions: {} };
    const view = encyclopediaView({ discovered: {}, claimed: [], met: [], levels }, content);
    const seventh = view.items.tiers.find((tier) => tier.name === 'Tier VII');
    assert.deepEqual([seventh.name, seventh.range, seventh.current, seventh.entries.length], ['Tier VII', 'od 125. poziomu klasy', true, 22]);
    assert.deepEqual(
      seventh.sets.map((set) => [set.name, set.bases]),
      [
        ['Wojownik', ['coronation-sword', 'nadziak', 'royal-shield', 'armet', 'maximilian-armor']],
        ['Łucznik', ['persian-bow', 'crown-quiver', 'magnate-cap', 'czamara']],
        ['Mag', ['archmage-staff', 'hourglass', 'magnate-cap', 'szuba']],
        ['Kleryk', ['pacifical', 'royal-shield', 'hourglass', 'prophet-crown', 'pallium']],
        ['Cień', ['baselard', 'rondel', 'magnate-cap', 'czamara']],
        ['Dodatki', ['hetman-gloves', 'safian-boots', 'pectoral', 'ancestors-ring', 'grzywna']],
      ],
    );
    // A full set opens the seventh chest: Tier VI's gold x2.5 and Punkty
    // Systemu x2, Punkty Czasu 10 more (0.4.44).
    for (const set of seventh.sets) assert.deepEqual(set.chest, content.encyclopedia.chests[6], set.name);
    assert.deepEqual(content.encyclopedia.chests.slice(5, 7), [
      { gold: 6250, timePoints: 60, systemPoints: 64 },
      { gold: 15625, timePoints: 70, systemPoints: 100 },
    ]);
    const warrior = itemSets(content).find((set) => set.id === 'items:7:warrior');
    const found = Object.fromEntries(warrior.bases.map((id) => [`item:${id}`, 1]));
    assert.deepEqual(encyclopediaChest('items:7:warrior', found, [], content).chest, { gold: 15625, timePoints: 70, systemPoints: 100 });
    // Where it comes from: explorations from Rokitowe Bezdno (121–125), the
    // last place of Czarne Bagno, worn from class level 125, the Warsztat's
    // and the Szlifiernia's patterns from level 125 of their professions.
    assert.deepEqual(seventh.entries.find((entry) => entry.id === 'coronation-sword').sources, [
      'Wyprawy: wypada od regionu Rokitowe Bezdno (poz. 121–125).',
      'Dla klas: Wojownik, Wielki Inkwizytor, Pogromca Demonów, Mściciel Niebios.',
      'Założysz od 125. poziomu klasy.',
      'Warsztat: wzór od 125. poziomu Rzemieślnictwa.',
    ]);
    assert.ok(seventh.entries.find((entry) => entry.id === 'pectoral').sources.includes('Szlifiernia: wzór od 125. poziomu Jubilerstwa.'));
    // A Cień's sztylet, which the Nekromanta, the Licz and the Król Nawii no longer wear
    // (988), and the Mag's kostur, which they do.
    const baselard = seventh.entries.find((entry) => entry.id === 'baselard').sources;
    assert.ok(baselard.includes('Dla klasy: Cień.') && baselard.includes('Nie dla: Nekromanta, Licz, Król Nawii.'), JSON.stringify(baselard));
    assert.ok(seventh.entries.find((entry) => entry.id === 'archmage-staff').sources.includes('Dla klas: Mag, Nekromanta, Licz, Król Nawii.'));
    // Materials of creatures of levels 151–175 in Tier VII: Głucha Knieja's
    // and those of Sosnowe Wydmy that come a level or two above its 150 (the
    // Południca, the Raróg and Pogorzelisko's). Ostępy Nowiu's go on to Tier
    // VIII (949), and its Księżycożerca's, a champion above level 200, to
    // Tier IX (1018).
    assert.deepEqual(view.materials.tiers.filter((tier) => ['Tier VI', 'Tier VII'].includes(tier.name)).map((tier) => [tier.name, tier.range, tier.current]), [
      ['Tier VI', 'poziomy 126–150', false],
      ['Tier VII', 'poziomy 151–175', true],
    ]);
    const tierOf = (materialId) => view.materials.tiers.find((tier) => tier.entries.some((entry) => entry.id === materialId)).name;
    assert.deepEqual(
      ['black-needle', 'hunting-horn', 'moon-bite', 'noon-sickle', 'rarog-feather', 'ruin-ash', 'latawiec-membrane', 'glassy-sand'].map(tierOf),
      ['Tier VII', 'Tier VIII', 'Tier IX', 'Tier VII', 'Tier VII', 'Tier VII', 'Tier VI', 'Tier VI'],
    );
  });

  // The author's 949: Tier VIII from class level 150, as Tier VII came from
  // 125 (DECISIONS.md, "Tier VIII przedmiotów").
  test('Tier VIII: its items from class level 150 with a set for every class and the accessories, its chest, and the materials of creatures above level 175', () => {
    const levels = { level: 180, classLevel: 150, professions: {} };
    const view = encyclopediaView({ discovered: {}, claimed: [], met: [], levels }, content);
    const eighth = view.items.tiers.find((tier) => tier.name === 'Tier VIII');
    assert.deepEqual([eighth.name, eighth.range, eighth.current, eighth.entries.length], ['Tier VIII', 'od 150. poziomu klasy', true, 22]);
    assert.deepEqual(
      eighth.sets.map((set) => [set.name, set.bases]),
      [
        ['Wojownik', ['self-swinging-sword', 'executioner-axe', 'aegis', 'svetovid-helm', 'zawisza-armor']],
        ['Łucznik', ['devana-bow', 'bottomless-quiver', 'cap-of-invisibility', 'bekesha']],
        ['Mag', ['merlin-staff', 'twardowski-mirror', 'cap-of-invisibility', 'mokosh-robe']],
        ['Kleryk', ['holy-grail', 'aegis', 'twardowski-mirror', 'papal-tiara', 'rationale']],
        ['Cień', ['khanjar', 'nocnitsa-blade', 'cap-of-invisibility', 'bekesha']],
        ['Dodatki', ['svarog-gauntlets', 'seven-league-boots', 'ryngraf', 'solomon-ring', 'alatyr']],
      ],
    );
    // A full set opens the eighth chest: Tier VII's gold x2.5 (rounded up),
    // Punkty Systemu at most 100, Punkty Czasu 10 more (0.4.44).
    for (const set of eighth.sets) assert.deepEqual(set.chest, content.encyclopedia.chests[7], set.name);
    assert.deepEqual(content.encyclopedia.chests.slice(6, 8), [
      { gold: 15625, timePoints: 70, systemPoints: 100 },
      { gold: 39063, timePoints: 80, systemPoints: 100 },
    ]);
    const warrior = itemSets(content).find((set) => set.id === 'items:8:warrior');
    const found = Object.fromEntries(warrior.bases.map((id) => [`item:${id}`, 1]));
    assert.deepEqual(encyclopediaChest('items:8:warrior', found, [], content).chest, { gold: 39063, timePoints: 80, systemPoints: 100 });
    // Where it comes from: explorations from Pogorzelisko (146–150), the last
    // place of Sosnowe Wydmy, worn from class level 150, the Warsztat's and
    // the Szlifiernia's patterns from level 150 of their professions.
    assert.deepEqual(eighth.entries.find((entry) => entry.id === 'self-swinging-sword').sources, [
      'Wyprawy: wypada od regionu Pogorzelisko (poz. 146–150).',
      'Dla klas: Wojownik, Wielki Inkwizytor, Pogromca Demonów, Mściciel Niebios.',
      'Założysz od 150. poziomu klasy.',
      'Warsztat: wzór od 150. poziomu Rzemieślnictwa.',
    ]);
    assert.ok(eighth.entries.find((entry) => entry.id === 'ryngraf').sources.includes('Szlifiernia: wzór od 150. poziomu Jubilerstwa.'));
    // Materials of creatures of levels 176–200 in Tier VIII: Ostępy Nowiu's;
    // those above 200 in Tier IX since it came (1018).
    assert.deepEqual(view.materials.tiers.filter((tier) => ['Tier VII', 'Tier VIII'].includes(tier.name)).map((tier) => [tier.name, tier.range, tier.current]), [
      ['Tier VII', 'poziomy 151–175', false],
      ['Tier VIII', 'poziomy 176–200', true],
    ]);
    const tierOf = (materialId) => view.materials.tiers.find((tier) => tier.entries.some((entry) => entry.id === materialId)).name;
    assert.deepEqual(['hunting-horn', 'moon-bite', 'plague-kerchief', 'black-needle'].map(tierOf), ['Tier VIII', 'Tier IX', 'Tier IX', 'Tier VII']);
  });

  // The author's 1018: Tier IX from class level 175, as Tier VIII came from
  // 150, for Łysogóry (201–275).
  test('Tier IX: its items from class level 175 with a set for every class and the accessories, its chest, and the materials of creatures above level 200', () => {
    const levels = { level: 210, classLevel: 175, professions: {} };
    const view = encyclopediaView({ discovered: {}, claimed: [], met: [], levels }, content);
    const ninth = view.items.tiers.find((tier) => tier.name === 'Tier IX');
    assert.deepEqual([ninth.name, ninth.range, ninth.current, ninth.entries.length], ['Tier IX', 'od 175. poziomu klasy', true, 22]);
    assert.deepEqual(
      ninth.sets.map((set) => [set.name, set.bases]),
      [
        ['Wojownik', ['szczerbiec', 'perun-axe', 'achilles-shield', 'krakus-helmet', 'chrobry-armor']],
        ['Łucznik', ['dazhbog-bow', 'stribog-quiver', 'borowy-hood', 'piast-sukmana']],
        ['Mag', ['triglav-staff', 'sendivogius-book', 'borowy-hood', 'zhiva-cloak']],
        ['Kleryk', ['maurice-spear', 'achilles-shield', 'sendivogius-book', 'lada-wreath', 'adalbert-stole']],
        ['Cień', ['koschei-dagger', 'wawel-dragon-tooth', 'borowy-hood', 'piast-sukmana']],
        ['Dodatki', ['dratewka-gloves', 'waligora-boots', 'jurata-necklace', 'kinga-ring', 'golden-horn']],
      ],
    );
    // Tier VIII's gold x2.5 (rounded up), Punkty Systemu at most 100 (949);
    // from Tier V, Punkty Czasu 10 more a tier (0.4.44, the author: „zmniejszyć
    // trzeba bonusy do Punktów Czasu z Encyklopedii”, „na pozniejszych lvlach”).
    for (const set of ninth.sets) assert.deepEqual(set.chest, { gold: 97658, timePoints: 90, systemPoints: 100 }, set.name);
    // From Matecznik (171–175), the last place of Głucha Knieja, worn from
    // class level 175, the patterns from level 175 of the professions.
    assert.deepEqual(ninth.entries.find((entry) => entry.id === 'szczerbiec').sources, [
      'Wyprawy: wypada od regionu Matecznik (poz. 171–175).',
      'Dla klas: Wojownik, Wielki Inkwizytor, Pogromca Demonów, Mściciel Niebios.',
      'Założysz od 175. poziomu klasy.',
      'Warsztat: wzór od 175. poziomu Rzemieślnictwa.',
    ]);
    assert.ok(ninth.entries.find((entry) => entry.id === 'jurata-necklace').sources.includes('Szlifiernia: wzór od 175. poziomu Jubilerstwa.'));
    const ninthMaterials = view.materials.tiers.find((tier) => tier.name === 'Tier IX');
    assert.deepEqual([ninthMaterials.range, ninthMaterials.current], ['poziomy 201–275', true]);
  });

  // The author's 1086: Tier X from class level 200, as Tier IX came from
  // 175. Until the lands from level 276 came it only dropped (1086.0 A);
  // with Nawia's lands (276–350) the Warsztat and the Szlifiernia show its
  // patterns from the 200th level of their professions.
  test('Tier X: its items from class level 200 with a set for every class and the accessories, its chest, its patterns, and the materials of Nawia\'s creatures', () => {
    const levels = { level: 230, classLevel: 200, professions: {} };
    const view = encyclopediaView({ discovered: {}, claimed: [], met: [], levels }, content);
    const tenth = view.items.tiers.at(-1);
    assert.deepEqual([tenth.name, tenth.range, tenth.current, tenth.entries.length], ['Tier X', 'od 200. poziomu klasy', true, 22]);
    assert.deepEqual(
      tenth.sets.map((set) => [set.name, set.bases]),
      [
        ['Wojownik', ['grunwald-sword', 'svarozhich-axe', 'lech-shield', 'mieszko-helmet', 'jagiello-armor']],
        ['Łucznik', ['jutrzenka-bow', 'zorza-quiver', 'strzygon-hood', 'sobieski-zupan']],
        ['Mag', ['veles-staff', 'copernicus-sphere', 'strzygon-hood', 'wanda-robe']],
        ['Kleryk', ['stanislaus-crosier', 'lech-shield', 'copernicus-sphere', 'jadwiga-crown', 'casimir-cope']],
        ['Cień', ['marzanna-dagger', 'basilisk-fang', 'strzygon-hood', 'sobieski-zupan']],
        ['Dodatki', ['lokietek-gloves', 'walgierz-boots', 'rzepicha-necklace', 'bona-ring', 'golden-duck']],
      ],
    );
    // Tier IX's gold x2.5 (rounded up), Punkty Czasu 10 more, Punkty Systemu
    // at most 100.
    for (const set of tenth.sets) assert.deepEqual(set.chest, { gold: 244145, timePoints: 100, systemPoints: 100 }, set.name);
    // From Zaćmiona Polana (196–200), the last place of Ostępy Nowiu, worn
    // from class level 200, and made in the Warsztat from its 200th level.
    assert.deepEqual(tenth.entries.find((entry) => entry.id === 'grunwald-sword').sources, [
      'Wyprawy: wypada od regionu Zaćmiona Polana (poz. 196–200).',
      'Dla klas: Wojownik, Wielki Inkwizytor, Pogromca Demonów, Mściciel Niebios.',
      'Założysz od 200. poziomu klasy.',
      'Warsztat: wzór od 200. poziomu Rzemieślnictwa.',
    ]);
    assert.ok(tenth.entries.find((entry) => entry.id === 'rzepicha-necklace').sources.includes('Szlifiernia: wzór od 200. poziomu Jubilerstwa.'));
    // The materials of creatures above level 275: Nawia's, and the Łysogóry's
    // champions above it, as Tier IX took those of Ostępy Nowiu above 200.
    const tenthMaterials = view.materials.tiers.at(-1);
    assert.deepEqual([tenthMaterials.name, tenthMaterials.range, tenthMaterials.current], ['Tier X', 'poziomy 276–350', false]);
  });

  test('a full set opens the chest of its tier, a count of discoveries its own chest in turn, each once', () => {
    const warrior = itemSets(content).find((set) => set.id === 'items:1:warrior');
    const discovered = Object.fromEntries(warrior.bases.map((id) => [`item:${id}`, 1]));
    assert.deepEqual(encyclopediaChest('items:1:warrior', discovered, [], content).chest, content.encyclopedia.chests[0]);
    assert.equal(encyclopediaChest('items:1:warrior', {}, [], content).code, 'not_ready');
    assert.equal(encyclopediaChest('items:1:warrior', discovered, ['items:1:warrior'], content).code, 'opened');
    assert.equal(encyclopediaChest('nothing', discovered, [], content).code, 'no_chest');
    const parts = { 'part:scraps': 1, 'part:straps': 1, 'part:fittings': 1 };
    assert.deepEqual(encyclopediaChest('parts:3', parts, [], content).chest, content.encyclopedia.chests[0]);
    assert.equal(encyclopediaChest('parts:5', parts, [], content).code, 'not_ready');
    assert.equal(readyChests({ ...discovered, ...parts }, [], content), 2);
    assert.equal(readyChests({ ...discovered, ...parts }, ['parts:3'], content), 1);
  });

  test('a trophy asks for a material in its species\' grade and the two above, and gives blows against its creature 5% more', () => {
    assert.deepEqual(trophyGrades('wolf-pelt', content), ['common', 'rare', 'unique']);
    const divine = content.materials.find((material) => material.rarity === 'divine');
    assert.deepEqual(trophyGrades(divine.id, content), ['divine']);
    const two = { 'material:wolf-pelt:common': 1, 'material:wolf-pelt:rare': 1 };
    assert.deepEqual(trophyBonuses(two, content), {});
    const all = { ...two, 'material:wolf-pelt:unique': 1 };
    assert.deepEqual(trophyBonuses(all, content), { wolf: 0.05 });
    assert.deepEqual(trophyBonuses(all, content, ['fox']), {});
  });

  test('a blow against the creature of a trophy hits harder', () => {
    const area = content.areasById['windfalls-edge'];
    const first = (trophies) => {
      const ally = { ...playerCombatant({ character: newCharacter('warrior', { level: 5 }), equipped: [], hp: 500, name: 'Mira', area }, content), ...(trophies && { trophies }) };
      const enemy = monsterCombatant({ monsterId: 'wolf', level: 3, id: 'e0' }, content);
      const fight = simulateFight({ allies: [ally], enemies: [enemy], rng: createRng('trofeum'), content, record: true });
      return fight.events.find((event) => (event.kind === 'hit' || event.kind === 'crit') && event.actor === ally.id);
    };
    const plain = first(null);
    const stronger = first({ wolf: 1 });
    assert.ok(plain && stronger, 'the warrior strikes');
    assert.ok(Math.abs(stronger.damage - 2 * plain.damage) <= 1, `${plain.damage} → ${stronger.damage}`);
  });

  test('the tier a character is in is marked on each tab: items by class level, potions and herbs by profession level, materials by level', () => {
    const levels = { level: 30, classLevel: 10, professions: { alchemy: { level: 60, xp: 0 }, herbalism: { level: 30, xp: 0 } } };
    const view = encyclopediaView({ discovered: {}, claimed: [], met: [], levels }, content);
    const currentOf = (tiers) => tiers.filter((tier) => tier.current).map((tier) => tier.index);
    assert.deepEqual(currentOf(view.items.tiers), [1]);
    assert.deepEqual(currentOf(view.potions.tiers), [2]);
    assert.deepEqual(currentOf(view.herbs.tiers), [1]);
    assert.deepEqual(currentOf(view.materials.tiers), [1]);
    assert.deepEqual(currentOf(encyclopediaView({ discovered: {}, claimed: [], met: [], levels: { level: 1, classLevel: 1, professions: {} } }, content).potions.tiers), [0]);
    assert.deepEqual(currentOf(encyclopediaView({ discovered: {}, claimed: [], met: [] }, content).items.tiers), []);
    // A profession past the 100th (825) is in its own tier, now that the herbs and potions of the mastery (952) fill
    // Tiers V–VIII, or in the last tier with entries, as the minerals' Tier IV, not unfolding Tier I.
    const masters = { level: 130, classLevel: 130, professions: { alchemy: { level: 150, xp: 0 }, herbalism: { level: 200, xp: 0 }, mining: { level: 101, xp: 0 } } };
    const late = encyclopediaView({ discovered: {}, claimed: [], met: [], levels: masters }, content);
    assert.deepEqual([late.potions, late.herbs, late.minerals].map((tab) => [tab.tiers.at(-1).index, currentOf(tab.tiers)]), [
      [7, [5]],
      [7, [7]],
      [3, [3]],
    ]);
    assert.deepEqual(currentOf(late.items.tiers), [6]);
  });

  test('the tabs show what is got by name, the rest as "???" with where to get it, a creature unmet as "???" too', () => {
    const view = encyclopediaView({ discovered: { 'item:sword': 3, 'material:wolf-pelt:common': 1 }, claimed: [], met: [] }, content);
    assert.deepEqual([view.items.found, view.items.all], [1, content.bases.length]);
    const sword = view.items.tiers[0].entries.find((entry) => entry.id === 'sword');
    assert.equal(sword.name, 'Miecz');
    assert.ok(sword.sources.includes('Najlepszy zdobyty: unikalny.'));
    const broadsword = view.items.tiers[1].entries.find((entry) => entry.id === 'broadsword');
    assert.equal(broadsword.name, '???');
    assert.ok(broadsword.sources[0].startsWith('Wyprawy: wypada od regionu'));
    const pelt = view.materials.tiers[0].entries.find((entry) => entry.id === 'wolf-pelt');
    assert.equal(pelt.name, 'Skóra wilka');
    assert.match(pelt.sources[0], /^Zostawia: \?\?\? \(/);
    assert.match(encyclopediaView({ discovered: {}, claimed: [], met: ['wolf'] }, content).materials.tiers[0].entries.find((entry) => entry.id === 'wolf-pelt').sources[0], /^Zostawia: Wilk/);
    const potion = view.potions.tiers[0].entries[0];
    assert.deepEqual([potion.name, potion.description, potion.sources.length], ['???', null, 1]);
  });
});

describe('the Encyklopedia through the API', () => {
  const { call, db, signUp } = useServer();
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('kronikarz'));
    await call('POST', '/api/character', { cookie, body: { name: 'Kronikarz', classId: 'warrior', appearance: 'male' } });
    await (await db()).prepare('UPDATE characters SET level = 10').run();
  });

  const set = async (sql) => (await db()).prepare(`UPDATE characters SET ${sql}`).run();
  const read = async () => (await call('GET', '/api/encyclopedia', { cookie })).data.encyclopedia;
  const record = async () => JSON.parse((await (await db()).prepare('SELECT discovered FROM characters').first()).discovered);

  test('what the character holds is written down with any request and stays when it is gone', async () => {
    await set(`potions = '{"lesser-healing":2}', herbs = '{"comfrey":3}', materials = '{"wolf-pelt:common":2}', parts = '{"scraps":1}'`);
    await (await db())
      .prepare("INSERT INTO items (character_id, slot, data, created_at) SELECT id, NULL, ?, 0 FROM characters")
      .bind(JSON.stringify({ base: 'axe', slot: 'weapon', level: 3, rarity: 'rare', affixes: [], damage: { min: 3, max: 5 } }))
      .run();
    await call('GET', '/api/character', { cookie });
    assert.deepEqual(await record(), { 'item:axe': 2, 'potion:lesser-healing': 1, 'herb:comfrey': 1, 'material:wolf-pelt:common': 1, 'part:scraps': 1 });
    await set(`potions = '{}', herbs = '{}', materials = '{}', parts = '{}'`);
    await (await db()).prepare('DELETE FROM items').run();
    await set('class_level = 10');
    const book = await read();
    assert.equal(book.items.tiers.find((tier) => tier.current).index, 1, 'class level 10 is in Tier II');
    assert.equal(book.potions.found, 1);
    assert.equal(book.items.tiers[0].entries.find((entry) => entry.id === 'axe').name, 'Topór');
    assert.equal(book.materials.found, 1);
  });

  test('a chest opens once, when its list is full, with gold, Punkty Czasu and Punkty Systemu', async () => {
    await set(`gold = 0, time_points = 0, system_points = 0, parts = '{"scraps":1,"straps":1}'`);
    const shut = await call('POST', '/api/encyclopedia/chest', { cookie, body: { id: 'parts:3' } });
    assert.equal(shut.status, 409);
    assert.equal(shut.data.error.code, 'not_ready');
    await set(`parts = '{"scraps":1,"straps":1,"fittings":1}'`);
    assert.equal((await call('GET', '/api/character', { cookie })).data.character.encyclopedia.ready, 1);
    const opened = await call('POST', '/api/encyclopedia/chest', { cookie, body: { id: 'parts:3' } });
    assert.equal(opened.status, 200, JSON.stringify(opened.data));
    assert.deepEqual(opened.data.chest, { gold: 50, timePoints: 5, systemPoints: 2 });
    assert.equal(opened.data.character.gold, 50);
    assert.equal((await (await db()).prepare('SELECT system_points FROM characters').first()).system_points, 2);
    assert.equal(opened.data.character.encyclopedia.ready, 0);
    assert.equal(opened.data.encyclopedia.parts.chests[0].opened, true);
    assert.equal((await call('POST', '/api/encyclopedia/chest', { cookie, body: { id: 'parts:3' } })).data.error.code, 'opened');
    assert.equal((await call('POST', '/api/encyclopedia/chest', { cookie, body: { id: 'nic' } })).status, 404);
  });

  test('an exploration takes the trophies of its creatures along', async () => {
    await set(`discovered = '{"material:wolf-pelt:common":1,"material:wolf-pelt:rare":1,"material:wolf-pelt:unique":1,"material:bear-hide:common":1}'`);
    const started = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    assert.equal(started.status, 201, JSON.stringify(started.data));
    const { options } = await (await db()).prepare('SELECT options FROM activities').first();
    assert.deepEqual(JSON.parse(options).trophies, { wolf: 0.05 });
  });
});

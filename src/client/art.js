// Pixel-art sprites drawn with Retro Diffusion (prompts in art/prompts.json):
// one for each monster and item base listed below, in /art/<kind>/<id>.png,
// and a full-figure portrait for each class and look. Whatever has no sprite
// yet keeps its line icon or vector art.

import { append, h, icon } from './dom.js';
import { RESOURCE_ICONS } from './icons.js';
import { state } from './state.js';

// The ids with a sprite file, and the size it was drawn at.
export const SPRITES = {
  monsters: {
    size: 48,
    ids: [
      'wolf', 'alpha-wolf', 'fox', 'lynx', 'bear', 'boar', 'badger', 'crow', 'owl', 'viper', 'spider', 'wisp', 'likho',
      // Wiatrołomy and Uroczysko Kamieni from 26.10.2026, with their champions.
      'stag', 'marten', 'hornets', 'planetnik', 'tusker', 'stoneling', 'bat', 'eagle-owl', 'she-wolf', 'basilisk',
      // Pajęczy Parów from 28.10.2026.
      'tarantula', 'bird-eater', 'spiderlings',
      // Zarośnięte Rozlewiska and Torfowe Mszary from 28.10.2026; the Ognik
      // takes the old Błędnica sprite.
      'otter', 'heron', 'reedling', 'giant-mosquito', 'beaver', 'mosquitoes', 'eel', 'eagle', 'catfish', 'toad', 'cormorant',
      'crocodile', 'willow-spirit', 'wraith', 'mistling', 'skeleton', 'drowner', 'sludger', 'mud-goblin', 'water-spirit',
      'drowned-maiden', 'elk', 'crane', 'leech', 'crayfish', 'harrier', 'sundew', 'peatling', 'salamander', 'will-o-wisp',
      'peat-cutter', 'bog-worm', 'mud-lord', 'kikimora',
      // The bandits of the wounded woman's event (data/events.json).
      'bandit-thug', 'bandit-knifer', 'bandit-crossbow',
      // Four regular creatures per inner region of levels 1–50, from 28.10.2026.
      'squirrel', 'grass-snake', 'raccoon-dog', 'antlion', 'capercaillie', 'weasel', 'stag-beetle', 'snake-hawk',
      'wildcat', 'black-stork', 'mossling', 'imp', 'cross-spider', 'mouflon', 'falcon', 'werewolf', 'wolf-shepherd',
      'aurochs', 'aesculapian-snake', 'strzyga',
      // Four regular creatures per inner region of levels 66–100, from 29.10.2026.
      'phantasm', 'black-grouse', 'diving-beetle', 'little-owl', 'zmij', 'fume-spirit', 'mine-spirit', 'giant-rat',
      // The Upiór of the haunted shrine and the leshy of the duel, events'
      // foes from 31.10.2026.
      'upior', 'leshy',
      // The outlaws of the Osada's wanted posters (619 B, 622), and three
      // named ones from 5.11.2026 (635.1–635.3).
      'bandit-chief', 'poacher', 'horse-thief', 'smuggler', 'arsonist', 'highwaywoman', 'grave-robber',
      // The mimic of the party event „Zakopana skrzynia” (848.5, 849 A).
      'mimic',
      // The foes of the events of 951 (14.11.2026).
      'robber-knight', 'snake-king', 'viper-knot',
      // Czarne Bagno (101–125) from 3.11.2026.
      'pond-turtle', 'mink', 'dragonfly', 'pike', 'water-spider', 'black-tern', 'wooden-idol', 'veles-serpent', 'pagan-priest', 'bog-demon', 'tick', 'night-heron', 'bies', 'black-goat', 'klobuk', 'mamuna', 'rokita',
      // Sosnowe Wydmy (126–150) from 3.11.2026.
      'sandman', 'heather-mare', 'nightjar', 'resin-golem', 'barkborer', 'tar-moth', 'drought-husk', 'sand-whirl', 'barrow-wight', 'tar-burner', 'charcoal-imp', 'latawiec', 'charred-pine', 'ash-wraith', 'spark-swarm', 'noon-wraith', 'rarog',
      // Głucha Knieja and Ostępy Nowiu (151–200) from 6.11.2026.
      'needleback', 'smooth-snake', 'rustler', 'millipede', 'fernling', 'mantis', 'dog-headed', 'ghost-coachman', 'gadfly', 'rootwad', 'murkling',
      'strangler', 'bone-gnawer', 'carcass', 'smoke-hound', 'nightingale-robber', 'night-huntsman', 'lichen-beard', 'hollow-dweller',
      'murmur-wraith', 'rotwood', 'puffball', 'earwig', 'headless', 'chochol', 'smetek', 'deadman', 'burying-beetle', 'bell-ringer', 'abomination',
      'koltun', 'bebok', 'plague-maiden', 'moon-eater',
      // Łysogóry (201–275) from 15.11.2026.
      'marmot', 'roller', 'echo', 'chamois', 'wallcreeper', 'swift', 'stone-rooster', 'cicada', 'hoopoe', 'wolverine', 'vulture', 'shrike',
      'stone-knight', 'dormouse', 'bee-eater', 'griffin', 'stolem', 'tarpan', 'jay', 'black-woodpecker', 'wood-ant', 'changeling', 'nightshade', 'great-slug',
      'mistletoe-leech', 'kingfisher', 'witch-cauldron', 'witch-broom', 'hedge-witch', 'empty-armor', 'haunted-portrait', 'black-grimoire', 'cuckoo', 'twardowski', 'fire-wheel', 'nutcracker',
      'seeress', 'mortar', 'witch-hare', 'broom-witch', 'dance-frenzy', 'magpie', 'cursed-piper', 'offering-oven', 'wax-doll', 'fate-spinner', 'hen-leg-hut', 'black-goose',
      'burning-skull', 'kostucha', 'baba-yaga',
    ],
  },
  // <class>-<look>, 96×128 (3:4), filled in as the portraits are approved,
  // and the class evolutions' <evolution>-<look> in the same frame.
  // `faces`: where the face is across, when not in the middle (a head turned
  // in three quarters), as tools/normalize-portraits.py prints it, or for a
  // figure with a bow or a staff at its head, the middle of the face's skin.
  // Busts centre on the face; the whole figure stays centred. `perches`: the
  // top of the shoulder behind the head (left of the face), where a pet of
  // the Sklep Systemu perches (the raven) or floats beside it (the wisp;
  // cosmetics.js), picked by eye on each portrait; the barbarian's (45, 30)
  // is the place in the film the author approved (541). `toned`: the
  // classes' portraits with a file for every skin tone (the class cards fetch
  // them ahead); `tonedEvolutions`: the evolutions' with theirs, recoloured
  // through masks made by hand (tools/evolution-tones.py).
  portraits: {
    width: 96,
    height: 128,
    ids: [
      'warrior-female', 'warrior-male', 'archer-female', 'archer-male', 'mage-female', 'mage-male', 'cleric-female', 'cleric-male', 'shadow-female', 'shadow-male',
      // The evolutions that took the earlier, well-equipped portraits.
      'guardian-female', 'guardian-male', 'sniper-female', 'sniper-male', 'ice-lord-female', 'ice-lord-male', 'priest-female', 'priest-male', 'assassin-female', 'assassin-male',
      // The evolutions drawn anew (Retro Diffusion), as the author picked them.
      'barbarian-female', 'barbarian-male', 'gladiator-female', 'gladiator-male', 'storm-archer-female', 'storm-archer-male', 'hunter-female', 'hunter-male',
      'elementalist-female', 'elementalist-male', 'arcanist-female', 'arcanist-male', 'healer-female', 'healer-male', 'inquisitor-female', 'inquisitor-male',
      'poisoner-female', 'poisoner-male', 'night-dancer-female', 'night-dancer-male',
      // The second forms at class level 100 (DECISIONS.md, „Druga ewolucja klas”).
      'berserker-female', 'berserker-male', 'arena-champion-female', 'arena-champion-male', 'bastion-female', 'bastion-male', 'marksman-female',
      'marksman-male', 'thunder-lord-female', 'thunder-lord-male', 'master-hunter-female', 'master-hunter-male', 'archmage-female', 'archmage-male',
      'winter-lord-female', 'winter-lord-male', 'druid-female', 'druid-male', 'miracle-worker-female', 'miracle-worker-male',
      'grand-inquisitor-female', 'grand-inquisitor-male', 'high-priest-female', 'high-priest-male', 'kingslayer-female', 'kingslayer-male',
      'necromancer-female', 'necromancer-male', 'phantom-female', 'phantom-male',
      // The third forms at class level 200 (DECISIONS.md, „Trzecia ewolucja
      // klas”), as the author accepted them (811, the Prorok 811.12 v3).
      'horde-slayer-female', 'horde-slayer-male', 'arena-legend-female', 'arena-legend-male', 'colossus-female', 'colossus-male',
      'bow-master-female', 'bow-master-male', 'perun-chosen-female', 'perun-chosen-male', 'wild-lord-female', 'wild-lord-male',
      'elemental-avatar-female', 'elemental-avatar-male', 'frost-monarch-female', 'frost-monarch-male', 'archdruid-female', 'archdruid-male',
      'saint-female', 'saint-male', 'demon-slayer-female', 'demon-slayer-male', 'prophet-female', 'prophet-male', 'godslayer-female', 'godslayer-male',
      'lich-female', 'lich-male', 'shadow-lord-female', 'shadow-lord-male',
      // The fourth forms at class level 300, shown only where FOURTH_EVOLUTION is on.
      'ravager-female', 'ravager-male', 'immortal-female', 'immortal-male', 'titan-female', 'titan-male',
      'celestial-archer-female', 'celestial-archer-male', 'thunderer-female', 'thunderer-male', 'beast-lord-female', 'beast-lord-male',
      'primordial-female', 'primordial-male', 'frost-god-female', 'frost-god-male', 'elder-druid-female', 'elder-druid-male',
      'archangel-female', 'archangel-male', 'heaven-avenger-female', 'heaven-avenger-male', 'seer-female', 'seer-male',
      'soul-reaper-female', 'soul-reaper-male', 'navia-king-female', 'navia-king-male', 'dark-prince-female', 'dark-prince-male',
      // The outfits of the Sklep Systemu (skórki, 763 A), <look>-<appearance>.
      'skin-night-raven-female', 'skin-night-raven-male', 'skin-forest-lord-female', 'skin-forest-lord-male',
      'skin-perun-female', 'skin-perun-male',
      'skin-dawn-female', 'skin-dawn-male', 'skin-eclipse-female', 'skin-eclipse-male',
      // The winter outfits of Szczodre Gody, sold in December (1044).
      'skin-winter-warrior-female', 'skin-winter-warrior-male', 'skin-winter-archer-female', 'skin-winter-archer-male',
      'skin-winter-mage-female', 'skin-winter-mage-male', 'skin-winter-cleric-female', 'skin-winter-cleric-male',
      'skin-winter-shadow-female', 'skin-winter-shadow-male',
    ],
    faces: {
      'archer-female': 49, 'archer-male': 52, 'cleric-male': 49, 'shadow-male': 51, 'warrior-male': 50,
      'guardian-female': 50, 'sniper-female': 43, 'sniper-male': 47, 'ice-lord-female': 50, 'priest-female': 50, 'priest-male': 50, 'assassin-female': 54, 'assassin-male': 52,
      'barbarian-female': 55, 'barbarian-male': 57, 'gladiator-female': 51, 'gladiator-male': 51, 'storm-archer-female': 46, 'storm-archer-male': 52, 'hunter-female': 51, 'hunter-male': 56,
      'elementalist-female': 53, 'arcanist-female': 47, 'arcanist-male': 52, 'healer-female': 46, 'healer-male': 45, 'inquisitor-female': 44, 'poisoner-female': 52, 'poisoner-male': 49,
      'night-dancer-female': 50, 'night-dancer-male': 47,
      'berserker-female': 51, 'berserker-male': 50, 'arena-champion-female': 51, 'arena-champion-male': 52, 'bastion-female': 49, 'bastion-male': 46,
      'marksman-female': 47, 'thunder-lord-female': 50, 'thunder-lord-male': 51, 'master-hunter-female': 52, 'master-hunter-male': 49,
      'archmage-female': 49, 'archmage-male': 51, 'winter-lord-female': 51, 'winter-lord-male': 49, 'druid-female': 50, 'druid-male': 49,
      'miracle-worker-female': 47, 'miracle-worker-male': 43, 'grand-inquisitor-female': 50, 'high-priest-female': 50, 'kingslayer-female': 55,
      'kingslayer-male': 54, 'necromancer-female': 44, 'necromancer-male': 49, 'phantom-male': 45,
      'horde-slayer-male': 50, 'arena-legend-female': 50, 'arena-legend-male': 50, 'colossus-female': 49, 'bow-master-male': 50,
      'perun-chosen-female': 50, 'perun-chosen-male': 51, 'wild-lord-female': 50, 'wild-lord-male': 50, 'elemental-avatar-female': 54,
      'elemental-avatar-male': 52, 'frost-monarch-female': 51, 'frost-monarch-male': 50, 'archdruid-female': 53, 'archdruid-male': 49,
      'saint-female': 47, 'saint-male': 51, 'demon-slayer-female': 51, 'demon-slayer-male': 52, 'prophet-female': 49, 'prophet-male': 49, 'godslayer-female': 50,
      'godslayer-male': 52, 'lich-female': 52, 'lich-male': 50, 'shadow-lord-female': 50, 'shadow-lord-male': 50,
      'skin-night-raven-female': 50, 'skin-night-raven-male': 51, 'skin-forest-lord-female': 51, 'skin-forest-lord-male': 52,
      'skin-perun-female': 49, 'skin-perun-male': 49,
      'skin-dawn-female': 48, 'skin-dawn-male': 52, 'skin-eclipse-female': 50, 'skin-eclipse-male': 50,
      'skin-winter-warrior-male': 49, 'skin-winter-warrior-female': 50, 'skin-winter-archer-male': 49, 'skin-winter-archer-female': 49, 'skin-winter-mage-male': 51,
      'skin-winter-mage-female': 51, 'skin-winter-cleric-male': 49, 'skin-winter-cleric-female': 48, 'skin-winter-shadow-male': 49, 'skin-winter-shadow-female': 48,
      // The fourth forms (the face's middle, measured on the skin of the head).
      'ravager-female': 49, 'ravager-male': 50, 'immortal-female': 49, 'immortal-male': 50, 'titan-female': 52,
      'titan-male': 51, 'celestial-archer-female': 48, 'celestial-archer-male': 51, 'thunderer-female': 50, 'thunderer-male': 49,
      'beast-lord-female': 49, 'beast-lord-male': 50, 'primordial-female': 53, 'primordial-male': 52, 'frost-god-female': 50,
      'frost-god-male': 50, 'elder-druid-female': 50, 'elder-druid-male': 50, 'archangel-female': 46, 'archangel-male': 47,
      'heaven-avenger-female': 49, 'heaven-avenger-male': 50, 'seer-female': 50, 'seer-male': 52, 'soul-reaper-female': 46,
      'soul-reaper-male': 52, 'navia-king-female': 51, 'navia-king-male': 51, 'dark-prince-female': 49, 'dark-prince-male': 49,
    },
    perches: {
      'warrior-female': [32, 38], 'warrior-male': [34, 40], 'archer-female': [34, 41], 'archer-male': [35, 36], 'mage-female': [34, 41],
      'mage-male': [33, 44], 'cleric-female': [32, 40], 'cleric-male': [34, 41], 'shadow-female': [33, 39], 'shadow-male': [35, 36],
      'guardian-female': [32, 35], 'guardian-male': [34, 36], 'sniper-female': [31, 37], 'sniper-male': [34, 34], 'ice-lord-female': [33, 33],
      'ice-lord-male': [33, 29], 'priest-female': [33, 35], 'priest-male': [33, 37], 'assassin-female': [35, 31], 'assassin-male': [34, 30],
      'barbarian-female': [44, 30], 'barbarian-male': [45, 30], 'gladiator-female': [33, 35], 'gladiator-male': [32, 34], 'storm-archer-female': [34, 38],
      'storm-archer-male': [35, 31], 'hunter-female': [35, 31], 'hunter-male': [37, 33], 'elementalist-female': [35, 34], 'elementalist-male': [34, 32],
      'arcanist-female': [33, 30], 'arcanist-male': [34, 37], 'healer-female': [32, 36], 'healer-male': [31, 34], 'inquisitor-female': [32, 31],
      'inquisitor-male': [32, 31], 'poisoner-female': [34, 31], 'poisoner-male': [33, 30], 'night-dancer-female': [35, 37], 'night-dancer-male': [33, 32],
      'berserker-female': [31, 33], 'berserker-male': [31, 33], 'arena-champion-female': [33, 39], 'arena-champion-male': [35, 37],
      'bastion-female': [31, 31], 'bastion-male': [31, 31], 'marksman-female': [33, 29], 'marksman-male': [33, 28], 'thunder-lord-female': [37, 34],
      'thunder-lord-male': [34, 29], 'master-hunter-female': [34, 30], 'master-hunter-male': [34, 29], 'archmage-female': [33, 31],
      'archmage-male': [33, 31], 'winter-lord-female': [34, 36], 'winter-lord-male': [32, 29], 'druid-female': [34, 35], 'druid-male': [36, 36],
      'miracle-worker-female': [33, 35], 'miracle-worker-male': [31, 34], 'grand-inquisitor-female': [34, 30], 'grand-inquisitor-male': [33, 29],
      'high-priest-female': [34, 35], 'high-priest-male': [32, 35], 'kingslayer-female': [37, 33], 'kingslayer-male': [34, 30],
      'necromancer-female': [30, 38], 'necromancer-male': [37, 32], 'phantom-female': [36, 35], 'phantom-male': [39, 42],
      'horde-slayer-female': [33, 30], 'horde-slayer-male': [35, 27], 'arena-legend-female': [36, 30], 'arena-legend-male': [37, 30],
      'colossus-female': [34, 32], 'colossus-male': [33, 29], 'bow-master-female': [35, 32], 'bow-master-male': [37, 31],
      'perun-chosen-female': [38, 30], 'perun-chosen-male': [36, 30], 'wild-lord-female': [36, 30], 'wild-lord-male': [35, 30],
      'elemental-avatar-female': [40, 32], 'elemental-avatar-male': [39, 30], 'frost-monarch-female': [36, 32], 'frost-monarch-male': [35, 29],
      'archdruid-female': [40, 41], 'archdruid-male': [35, 35], 'saint-female': [37, 34], 'saint-male': [38, 31], 'demon-slayer-female': [38, 21],
      'demon-slayer-male': [37, 25], 'prophet-female': [40, 35], 'prophet-male': [40, 35], 'godslayer-female': [35, 37], 'godslayer-male': [37, 37], 'lich-female': [40, 30],
      'lich-male': [38, 32], 'shadow-lord-female': [38, 34], 'shadow-lord-male': [38, 31],
      'skin-night-raven-female': [33, 40], 'skin-night-raven-male': [33, 38], 'skin-forest-lord-female': [37, 41], 'skin-forest-lord-male': [38, 40],
      'skin-perun-female': [32, 38], 'skin-perun-male': [34, 40],
      'skin-dawn-female': [36, 40], 'skin-dawn-male': [36, 38], 'skin-eclipse-female': [38, 36], 'skin-eclipse-male': [38, 34],
      'skin-winter-warrior-male': [34, 31], 'skin-winter-warrior-female': [35, 31], 'skin-winter-archer-male': [35, 34], 'skin-winter-archer-female': [35, 34],
      'skin-winter-mage-male': [37, 39], 'skin-winter-mage-female': [37, 40], 'skin-winter-cleric-male': [37, 37], 'skin-winter-cleric-female': [36, 38],
      'skin-winter-shadow-male': [35, 29], 'skin-winter-shadow-female': [34, 29],
      // The fourth forms (the shoulder left of the face, as on the others).
      'ravager-female': [34, 26], 'ravager-male': [35, 26], 'immortal-female': [34, 33], 'immortal-male': [35, 39], 'titan-female': [37, 26],
      'titan-male': [36, 26], 'celestial-archer-female': [33, 48], 'celestial-archer-male': [36, 26], 'thunderer-female': [35, 33], 'thunderer-male': [34, 26],
      'beast-lord-female': [34, 39], 'beast-lord-male': [35, 30], 'primordial-female': [38, 26], 'primordial-male': [37, 26], 'frost-god-female': [35, 35],
      'frost-god-male': [35, 26], 'elder-druid-female': [35, 26], 'elder-druid-male': [35, 26], 'archangel-female': [31, 26], 'archangel-male': [32, 26],
      'heaven-avenger-female': [34, 26], 'heaven-avenger-male': [35, 26], 'seer-female': [35, 43], 'seer-male': [37, 28], 'soul-reaper-female': [37, 37],
      'soul-reaper-male': [37, 26], 'navia-king-female': [36, 26], 'navia-king-male': [36, 29], 'dark-prince-female': [34, 26], 'dark-prince-male': [34, 26],
    },
    // `petSpots`: a pet's own place on a portrait where its usual one would
    // cover what the figure holds at the shoulder (a falcon, a staff's head,
    // a bow, arrows in a quiver): the top left corner of its frame in the
    // portrait's pixels, picked by eye (the author on the Łowca: "2 chowańce
    // są źle ustawione przy Łowcy"). The wisp floats there, mostly behind the
    // head; the raven perches beside the Łowca's head, not on its hair.
    petSpots: {
      // The Szaty Świtu and the Szata Zaćmienia hold a staff's head at the
      // shoulder where the raven perches: it sits on the other shoulder.
      raven: {
        'hunter-female': [5, 13], 'hunter-male': [9, 12],
        // The Władczyni Puszczy's eagle sits on the shoulder where the raven
        // perches: it sits on the other one, on the white wolf's pelt.
        'wild-lord-female': [56, 14],
        'skin-dawn-female': [51, 14], 'skin-dawn-male': [50, 12], 'skin-eclipse-female': [49, 10], 'skin-eclipse-male': [49, 8],
      },
      wisp: {
        'arcanist-female': [-3, 52], 'arcanist-male': [-3, 52], 'archmage-female': [-1, 11], 'archmage-male': [-1, 11],
        'druid-female': [64, 4], 'druid-male': [2, 8], 'elementalist-female': [1, 14], 'healer-female': [-2, 16], 'healer-male': [-3, 14],
        'high-priest-female': [0, 15], 'hunter-female': [0, 16], 'hunter-male': [2, 14], 'ice-lord-female': [-1, 13], 'ice-lord-male': [-1, 9],
        'inquisitor-female': [-2, 11], 'marksman-female': [-3, 40], 'marksman-male': [-3, -4], 'master-hunter-male': [0, 9],
        'miracle-worker-female': [-1, 15], 'miracle-worker-male': [-3, 14], 'necromancer-female': [-3, 18], 'night-dancer-female': [1, 17],
        'phantom-male': [2, 8], 'sniper-male': [-3, 52],
      },
    },
    toned: ['warrior-female', 'warrior-male', 'archer-female', 'archer-male', 'mage-female', 'mage-male', 'cleric-female', 'cleric-male', 'shadow-female', 'shadow-male'],
    tonedEvolutions: [
      'guardian-female', 'guardian-male', 'sniper-female', 'sniper-male', 'ice-lord-female', 'ice-lord-male', 'priest-female', 'priest-male', 'assassin-female', 'assassin-male',
      'barbarian-female', 'barbarian-male', 'gladiator-female', 'gladiator-male', 'storm-archer-female', 'storm-archer-male', 'hunter-female', 'hunter-male',
      'elementalist-female', 'elementalist-male', 'arcanist-female', 'arcanist-male', 'healer-female', 'healer-male', 'inquisitor-female', 'inquisitor-male',
      'poisoner-female', 'poisoner-male', 'night-dancer-female', 'night-dancer-male',
      'berserker-female', 'berserker-male', 'arena-champion-female', 'arena-champion-male', 'bastion-female', 'bastion-male', 'marksman-female',
      'marksman-male', 'thunder-lord-female', 'thunder-lord-male', 'master-hunter-female', 'master-hunter-male', 'archmage-female', 'archmage-male',
      'winter-lord-female', 'winter-lord-male', 'druid-female', 'druid-male', 'miracle-worker-female', 'miracle-worker-male',
      'grand-inquisitor-female', 'grand-inquisitor-male', 'high-priest-female', 'high-priest-male', 'kingslayer-female', 'kingslayer-male',
      'necromancer-female', 'necromancer-male', 'phantom-female', 'phantom-male',
      'horde-slayer-female', 'horde-slayer-male', 'arena-legend-female', 'arena-legend-male', 'colossus-female', 'colossus-male',
      'bow-master-female', 'bow-master-male', 'perun-chosen-female', 'perun-chosen-male', 'wild-lord-female', 'wild-lord-male',
      'elemental-avatar-female', 'elemental-avatar-male', 'frost-monarch-female', 'frost-monarch-male', 'archdruid-female', 'archdruid-male',
      'saint-female', 'saint-male', 'demon-slayer-female', 'demon-slayer-male', 'prophet-female', 'prophet-male', 'godslayer-female', 'godslayer-male',
      'lich-female', 'lich-male', 'shadow-lord-female', 'shadow-lord-male',
      // The fourth forms at class level 300, shown only where FOURTH_EVOLUTION is on.
      'ravager-female', 'ravager-male', 'immortal-female', 'immortal-male', 'titan-female', 'titan-male',
      'celestial-archer-female', 'celestial-archer-male', 'thunderer-female', 'thunderer-male', 'beast-lord-female', 'beast-lord-male',
      'primordial-female', 'primordial-male', 'frost-god-female', 'frost-god-male', 'elder-druid-female', 'elder-druid-male',
      'archangel-female', 'archangel-male', 'heaven-avenger-female', 'heaven-avenger-male', 'seer-female', 'seer-male',
      'soul-reaper-female', 'soul-reaper-male', 'navia-king-female', 'navia-king-male', 'dark-prince-female', 'dark-prince-male',
      'skin-night-raven-female', 'skin-night-raven-male', 'skin-forest-lord-female', 'skin-forest-lord-male',
      'skin-perun-female', 'skin-perun-male',
      'skin-dawn-female', 'skin-dawn-male', 'skin-eclipse-female', 'skin-eclipse-male',
      // The winter outfits of Szczodre Gody, sold in December (1044).
      'skin-winter-warrior-female', 'skin-winter-warrior-male', 'skin-winter-archer-female', 'skin-winter-archer-male',
      'skin-winter-mage-female', 'skin-winter-mage-male', 'skin-winter-cleric-female', 'skin-winter-cleric-male',
      'skin-winter-shadow-female', 'skin-winter-shadow-male',
    ],
  },
  items: {
    size: 32,
    ids: [
      'sword', 'axe', 'dagger', 'bow', 'staff', 'aspergillum', 'shield', 'quiver', 'misericorde', 'focus', 'hood', 'helmet', 'tunic', 'chainmail', 'robe', 'cowl', 'surplice', 'gloves', 'boots', 'amulet', 'ring', 'talisman', 'holed-stone',
      // The second bases of the categories, from class level 10.
      'broadsword', 'war-axe', 'hunting-knife', 'recurve-bow', 'rune-staff', 'censer', 'pavise', 'bow-case', 'dirk', 'tome', 'fur-cap', 'peaked-helmet', 'biretta',
      'gambeson', 'brigandine', 'cloak', 'chasuble', 'bracers', 'pointed-shoes', 'reliquary', 'signet-ring',
      // The third bases, from class level 25.
      'saber', 'bearded-axe', 'kindjal', 'longbow', 'posokh', 'rosary', 'kalkan', 'war-quiver', 'parrying-dagger', 'quartz-crystal', 'hat', 'kettle-hat',
      'monk-hood', 'caftan', 'cuirass', 'rune-cloak', 'dalmatic', 'vambraces', 'laced-shoes', 'pendant', 'band-ring', 'fang-charm',
      // The fourth bases, from class level 50.
      'estoc', 'berdiche', 'yataghan', 'horn-bow', 'star-staff', 'crozier', 'heraldic-shield', 'falcon-quiver', 'poniard', 'grimoire', 'mask', 'visored-helmet',
      'mitre', 'buff-coat', 'scale-armor', 'star-robe', 'cope', 'gauntlets', 'greaves', 'medallion', 'family-ring', 'amber-charm',
      // The fifth bases, from class level 75 (the author's 582).
      'karabela', 'halberd', 'kris', 'tatar-bow', 'scepter', 'monstrance', 'hussar-shield', 'hunting-quiver', 'stiletto', 'crystal-ball', 'turban', 'hussar-helmet',
      'zupan', 'hussar-armor', 'delia', 'crown-of-faith', 'alb', 'knight-gloves', 'riding-boots', 'necklace', 'crown-ring', 'aurochs-horn',
      // The sixth bases, from class level 100 (665, the author's picks 669).
      'flamberge', 'double-axe', 'cinquedea', 'scythian-bow', 'caduceus', 'processional-cross', 'jousting-shield', 'parade-quiver', 'swordbreaker', 'astrolabe',
      'diadem', 'great-helm', 'kontusz', 'gothic-armor', 'ferezja', 'halo', 'cassock', 'falconry-gloves', 'sabatons', 'cameo', 'eternity-ring', 'lunula',
      // The seventh bases, from class level 125 (814, the author's picks 813).
      'coronation-sword', 'nadziak', 'baselard', 'persian-bow', 'archmage-staff', 'pacifical', 'royal-shield', 'crown-quiver', 'rondel', 'hourglass',
      'magnate-cap', 'armet', 'czamara', 'maximilian-armor', 'szuba', 'prophet-crown', 'pallium', 'hetman-gloves', 'safian-boots', 'pectoral', 'ancestors-ring', 'grzywna',
      // The eighth bases, from class level 150 (949, the author's picks 950).
      'self-swinging-sword', 'executioner-axe', 'khanjar', 'devana-bow', 'merlin-staff', 'holy-grail', 'aegis', 'bottomless-quiver', 'nocnitsa-blade', 'twardowski-mirror',
      'cap-of-invisibility', 'svetovid-helm', 'bekesha', 'zawisza-armor', 'mokosh-robe', 'papal-tiara', 'rationale', 'svarog-gauntlets', 'seven-league-boots', 'ryngraf', 'solomon-ring', 'alatyr',
      // The ninth bases, from class level 175 (1018, the author's picks 1024).
      'szczerbiec', 'perun-axe', 'koschei-dagger', 'dazhbog-bow', 'triglav-staff', 'maurice-spear', 'achilles-shield', 'stribog-quiver', 'wawel-dragon-tooth', 'sendivogius-book', 'borowy-hood',
      'krakus-helmet', 'piast-sukmana', 'chrobry-armor', 'zhiva-cloak', 'lada-wreath', 'adalbert-stole', 'dratewka-gloves', 'waligora-boots', 'jurata-necklace', 'kinga-ring', 'golden-horn',
      // The tenth bases, from class level 200 (1086, the author's picks).
      'grunwald-sword', 'svarozhich-axe', 'marzanna-dagger', 'jutrzenka-bow', 'veles-staff', 'stanislaus-crosier', 'lech-shield', 'zorza-quiver', 'basilisk-fang', 'copernicus-sphere', 'strzygon-hood',
      'mieszko-helmet', 'sobieski-zupan', 'jagiello-armor', 'wanda-robe', 'jadwiga-crown', 'casimir-cope', 'lokietek-gloves', 'walgierz-boots', 'rzepicha-necklace', 'bona-ring', 'golden-duck',
    ],
  },
  // Materials left by creatures, the parts the Stół rozbiórki makes and
  // the treasure chest, 32×32.
  materials: {
    size: 32,
    ids: [
      'wolf-pelt', 'fox-pelt', 'badger-claws', 'viper-scales', 'boar-tusk', 'crow-feather', 'owl-feather', 'lynx-fur', 'spider-silk', 'alpha-fang', 'bear-hide', 'wisp-flame', 'likho-eye',
      'scraps', 'straps', 'fittings', 'shards', 'amber', 'bloodstone', 'star-shard', 'chest',
      // The creatures of 26.10.2026.
      'stag-antler', 'marten-fur', 'hornet-sting', 'hailstone', 'tusker-tusks', 'stone-heart', 'bat-wing', 'eagle-owl-feather', 'she-wolf-fur', 'basilisk-scale',
      // Pajęczy Parów from 28.10.2026.
      'tarantula-hair', 'bird-eater-fang', 'spider-moults',
      // Zarośnięte Rozlewiska and Torfowe Mszary from 28.10.2026.
      'heron-feather', 'otter-fur', 'mosquito-proboscis', 'reed-bundle', 'beaver-teeth', 'mosquito-wings', 'eel-skin',
      'eagle-feather', 'cormorant-feather', 'catfish-whisker', 'toad-venom', 'crocodile-hide', 'willow-bark', 'wraith-veil',
      'mist-drop', 'old-bone', 'drowner-weeds', 'sludge-lump', 'vodnik-pearl', 'drowned-tear', 'crane-feather', 'elk-antler',
      'crayfish-shell', 'harrier-feather', 'sundew-dew', 'peat-heart', 'wisp-spark', 'salamander-skin', 'peat-spade', 'worm-jaw',
      'goblin-trinket', 'leech-slime', 'kikimora-yarn', 'bog-heart',
      // Four regular creatures per inner region of levels 1–50, from 28.10.2026.
      'squirrel-tail', 'grass-snake-slough', 'raccoon-dog-fur', 'antlion-jaws', 'capercaillie-feather', 'weasel-fur',
      'stag-beetle-horn', 'snake-hawk-talon', 'wildcat-fur', 'black-stork-feather', 'living-moss', 'imp-dust',
      'cross-spider-silk', 'mouflon-horn', 'falcon-feather', 'werewolf-fur', 'shepherd-crook', 'aurochs-horn',
      'aesculapian-skin', 'strzyga-fang',
      // Four regular creatures per inner region of levels 66–100, from 29.10.2026.
      'phantasm-shard', 'black-grouse-feather', 'diving-beetle-shell', 'little-owl-feather', 'zmij-scale', 'fume-ember',
      'mine-lantern', 'rat-tail',
      'turtle-shell', 'mink-fur', 'dragonfly-wing', 'pike-teeth', 'silver-bubble', 'tern-feather', 'bog-oak', 'veles-scale', 'bone-amulet', 'bog-lantern-eye', 'tick-shell', 'night-heron-plume', 'bies-horn', 'black-fleece', 'klobuk-feather', 'mamuna-braid', 'cyrograf',
      'glassy-sand', 'everheather', 'nightjar-feather', 'amber-lump', 'bored-bark', 'moth-dust', 'husk-dust', 'whirl-pebble', 'bronze-ring', 'birch-tar', 'glowing-ember', 'latawiec-membrane', 'charred-splinter', 'ruin-ash', 'everspark', 'noon-sickle', 'rarog-feather',
      'black-needle', 'copper-scale', 'glass-tooth', 'millipede-segment', 'fern-curl', 'mantis-blade', 'dog-skull', 'coachman-whip', 'rainbow-eye',
      'tangled-root', 'congealed-murk', 'black-rope', 'gnawed-bone', 'rotten-pelt', 'broken-leash', 'whistling-feather', 'hunting-horn',
      'grey-beard', 'bony-finger', 'murmuring-cone', 'glowing-rot', 'spore-pouch', 'earwig-pincers', 'rusty-spur', 'chochol-straw', 'cold-candle',
      'deadman-shroud', 'beetle-antenna', 'bell-clapper', 'abomination-tooth', 'matted-tangle', 'bebok-sack', 'plague-kerchief', 'moon-bite',
      // Łysogóry (201–275) from 15.11.2026.
      'marmot-fat', 'roller-feather', 'echo-pebble', 'chamois-horn', 'wallcreeper-wing', 'swift-nest', 'stone-comb', 'cicada-wing', 'hoopoe-crest', 'wolverine-fur', 'vulture-ruff', 'shrike-thorn',
      'stone-blade-shard', 'dormouse-fur', 'bee-eater-feather', 'stolem-boulder', 'griffin-feather', 'tarpan-mane', 'jay-acorn', 'woodpecker-beak', 'ant-acid', 'changeling-rattle', 'nightshade-berry', 'slug-slime',
      'leech-root', 'kingfisher-feather', 'cauldron-ladle', 'broom-twig', 'witch-pouch', 'armor-plate', 'gilded-frame', 'black-page', 'twardowski-quill', 'cuckoo-egg', 'burning-spoke', 'pine-nut',
      'fortune-bone', 'pestle', 'hare-foot', 'flying-ointment', 'red-ribbon', 'magpie-trinket', 'piper-whistle', 'offering-loaf', 'wax-lump', 'thread-of-fate', 'hut-claw', 'black-down',
      'skull-flame', 'iron-tooth', 'scythe-tip',
    ],
  },
  // The skills of the classes (data/skills.json), 48×48.
  skills: {
    size: 48,
    ids: [
      'power-strike', 'wide-sweep', 'unyielding', 'aimed-shot', 'arrow-rain', 'pinning-shot', 'fireball', 'frost-gust', 'mana-shield', 'prayer-of-health', 'exorcism', 'blessing', 'backstab', 'poisoned-blade', 'shadow-dance',
      // The class evolutions' skills, as the author approved them, or the
      // drafts in their place till the author picks (DECISIONS.md).
      'crushing-blow', 'blood-frenzy', 'millstone', 'riposte', 'indomitable', 'challenge', 'piercing-shot', 'ambush-shot', 'arrow-storm', 'storm-cloud',
      'barbed-arrow', 'falcon', 'fire-burst', 'elemental-ray', 'blizzard', 'ice-lance', 'mana-mirror', 'elemental-summon', 'renewal', 'miracle',
      'judgement', 'verdict', 'great-blessing', 'psalm', 'execution', 'death-mark', 'black-venom', 'toxic-slime', 'blade-dance', 'shadow-whirl',
      // The third forms' skills at class level 200, as the author accepted
      // them (823). The second forms' skills have none of their own yet and
      // stand in with the skills they grew from (artChain).
      'smashing-blow', 'slaughter', 'steel-hurricane', 'cheers', 'unbroken', 'earthquake', 'master-shot', 'steady-hand', 'perun-wrath', 'thunder-sign',
      'pack-leader', 'eagle-talon', 'cataclysm', 'elemental-shield', 'ice-storm', 'ice-tomb', 'oak-awakening', 'bison-call', 'miraculous-healing', 'holy-light',
      'last-judgment', 'holy-seal', 'hymn', 'vision', 'final-blow', 'blood-mark', 'army-of-dead', 'death-touch', 'shadow-storm', 'eclipse',
      // The fourth forms' skills at class level 300, as the author chose them
      // (1100).
      'carnage', 'breach', 'glory-hurricane', 'champion-challenge', 'mountain-wrath', 'titan-shield', 'heaven-arrow', 'star-rain', 'perun-storm', 'ball-lightning',
      'pack-chief', 'bear-call', 'primal-chaos', 'elemental', 'ice-eternity', 'ice-heart', 'oak-of-ages', 'forest-rebirth', 'divine-healing', 'wings-of-light',
      'day-of-wrath', 'pillar-of-light', 'clairvoyance', 'fate-reversal', 'soul-harvest', 'scythe-dance', 'navia-legion', 'navia-mist', 'eternal-night', 'shadow-strike',
    ],
  },
  // The character walking in place on the Walka scene, <class>-<look> or an
  // evolution's <evolution>-<look>: eight frames of 128×128 in a row, facing
  // right, drawn from the portraits and animated by PixelLab (DECISIONS.md,
  // "Chody od zera"). A skin tone other than the one drawn has its own
  // recoloured file, as a portrait does (tools/walk-tones.py).
  walkers: {
    width: 1024,
    height: 128,
    ids: [
      'warrior-female', 'warrior-male', 'archer-female', 'archer-male', 'mage-female', 'mage-male', 'cleric-female', 'cleric-male', 'shadow-female', 'shadow-male',
      'guardian-female', 'guardian-male', 'sniper-female', 'sniper-male', 'ice-lord-female', 'ice-lord-male', 'priest-female', 'priest-male', 'assassin-female', 'assassin-male',
      'barbarian-female', 'barbarian-male', 'gladiator-female', 'gladiator-male', 'storm-archer-female', 'storm-archer-male', 'hunter-female', 'hunter-male',
      'elementalist-female', 'elementalist-male', 'arcanist-female', 'arcanist-male', 'healer-female', 'healer-male', 'inquisitor-female', 'inquisitor-male',
      'poisoner-female', 'poisoner-male', 'night-dancer-female', 'night-dancer-male',
      // The second forms at class level 100.
      'berserker-female', 'berserker-male', 'arena-champion-female', 'arena-champion-male', 'bastion-female', 'bastion-male', 'marksman-female',
      'marksman-male', 'thunder-lord-female', 'thunder-lord-male', 'master-hunter-female', 'master-hunter-male', 'archmage-female', 'archmage-male',
      'winter-lord-female', 'winter-lord-male', 'druid-female', 'druid-male', 'miracle-worker-female', 'miracle-worker-male',
      'grand-inquisitor-female', 'grand-inquisitor-male', 'high-priest-female', 'high-priest-male', 'kingslayer-female', 'kingslayer-male',
      'necromancer-female', 'necromancer-male', 'phantom-female', 'phantom-male',
      // The third forms at class level 200, as the author accepted them (822,
      // the riders drawn anew one by one; the large ones in walk.rider.large).
      'horde-slayer-female', 'horde-slayer-male', 'arena-legend-female', 'arena-legend-male', 'colossus-female', 'colossus-male',
      'bow-master-female', 'bow-master-male', 'perun-chosen-female', 'perun-chosen-male', 'wild-lord-female', 'wild-lord-male',
      'elemental-avatar-female', 'elemental-avatar-male', 'frost-monarch-female', 'frost-monarch-male', 'archdruid-female', 'archdruid-male',
      'saint-female', 'saint-male', 'demon-slayer-female', 'demon-slayer-male', 'prophet-female', 'prophet-male', 'godslayer-female', 'godslayer-male',
      'lich-female', 'lich-male', 'shadow-lord-female', 'shadow-lord-male',
      // The fourth forms at class level 300 (Lodowa Bogini and Niebiańska Łuczniczka once
      // their fixes 1108 and 1109 are accepted), shown only where FOURTH_EVOLUTION is on.
      'ravager-female', 'ravager-male', 'immortal-female', 'immortal-male', 'titan-female', 'titan-male',
      'celestial-archer-male', 'thunderer-female', 'thunderer-male', 'beast-lord-female', 'beast-lord-male', 'primordial-female',
      'primordial-male', 'frost-god-male', 'elder-druid-female', 'elder-druid-male', 'archangel-female', 'archangel-male',
      'heaven-avenger-female', 'heaven-avenger-male', 'seer-female', 'seer-male', 'soul-reaper-female', 'soul-reaper-male',
      'navia-king-female', 'navia-king-male', 'dark-prince-female', 'dark-prince-male',
      'skin-night-raven-female', 'skin-night-raven-male', 'skin-forest-lord-female', 'skin-forest-lord-male',
      'skin-perun-female', 'skin-perun-male',
      'skin-dawn-female', 'skin-dawn-male', 'skin-eclipse-female', 'skin-eclipse-male',
      // The winter outfits of Szczodre Gody, sold in December (1044).
      'skin-winter-warrior-female', 'skin-winter-warrior-male', 'skin-winter-archer-female', 'skin-winter-archer-male',
      'skin-winter-mage-female', 'skin-winter-mage-male', 'skin-winter-cleric-female', 'skin-winter-cleric-male',
      'skin-winter-shadow-female', 'skin-winter-shadow-male',
    ],
  },
  // The ethereal narrator of the introduction, reading its scroll (narrator.js).
  narrator: {
    width: 96,
    height: 128,
    ids: ['narrator'],
  },
  // The inner regions' scenes in their circles on the Walka screen, 128×128
  // (area-art.js keeps a vector scene for a place without one).
  areas: {
    size: 128,
    ids: [
      'windfalls-edge', 'fox-ravines', 'raven-hollows', 'viper-heaps', 'boar-thicket', 'mossy-boulders', 'spider-gully', 'lynx-ridge', 'wolf-circles', 'glade-heart',
      'reed-beds', 'beaver-dams', 'drowned-forest', 'willow-isles', 'old-riverbed', 'crane-meadows', 'leech-pools', 'sundew-field', 'smoldering-peat',
      'old-diggings',
      'black-alder-carr', 'black-tarn', 'sunken-shrine', 'quaking-bog', 'rokita-deep',
      'heather-dunes', 'resin-pinewood', 'drifting-sands', 'tar-pits', 'burnt-forest',
      'spruce-dusk', 'fern-thicket', 'forgotten-track', 'mossy-dell', 'wild-den', 'creaking-pines', 'rotting-logs', 'devils-crossroads',
      'plague-graves', 'eclipsed-glade',
      'grey-scree', 'windy-ridge', 'devils-stones', 'vulture-crags', 'stone-throne',
      'fir-slope', 'witches-path', 'misty-ravine', 'witch-glade', 'cursed-manor',
      'stone-rampart', 'witch-kitchen', 'dance-circle', 'stone-altars', 'baba-yaga-hut',
    ],
  },
  // The lands' wide scenes, dim behind the text of their cards, 192×96.
  lands: {
    width: 192,
    height: 96,
    ids: ['windfalls', 'stone-glade', 'backwaters', 'peat-bogs', 'black-bog', 'pine-dunes', 'silent-wilds', 'new-moon-depths', 'scree-slopes', 'fir-forest', 'bald-mountain'],
  },
  // The camp's buildings, <building>-<look> for the looks of levels 1–3, 4–7
  // and 8–10 (8–19 for the resource buildings, whose fourth look is the
  // Warownia's level 20), 128×96 (camp-art.js keeps a vector drawing for a look without
  // one).
  // The camp board's ground, without paths (camp-art.js draws them): the
  // glade at the camp's levels 1–3, 4–7 and 8–10, its fence and palisade
  // growing, all of them at the picture's edges.
  board: {
    width: 320,
    height: 480,
    ids: ['camp-1', 'camp-2', 'camp-3'],
  },
  // The same glades on the taller board the camp has with the Osada: a band
  // of 83 rows more in their middle, below the Magazyn's row.
  'board-tall': {
    width: 320,
    height: 563,
    ids: ['camp-1', 'camp-2', 'camp-3'],
  },
  // The Warownia's board (606 A): the taller board in its third look with
  // stone walls in place of the palisade and two bands more below the
  // Osada's, for the Warownia's buildings (tools/fortress-board-walls.py).
  'board-fortress': {
    width: 320,
    height: 729,
    ids: ['fortress'],
  },
  // The same boards under snow, for the winter camp of Szczodre Gody (all
  // of December; 1044.3): the glade's snow of 1048 A, painted by PixelLab
  // into each board. A board without its winter picture keeps its own.
  'board-winter': {
    width: 320,
    height: 480,
    ids: ['camp-1', 'camp-2', 'camp-3'],
  },
  'board-tall-winter': {
    width: 320,
    height: 563,
    ids: ['camp-1', 'camp-2', 'camp-3'],
  },
  'board-fortress-winter': {
    width: 320,
    height: 729,
    ids: ['fortress'],
  },
  // Each building cut to its outline, at most 128 × 96, and the Kamień
  // węgielny Warowni on the board with the Osada. The Warownia's buildings
  // after them (578, 585, 588); the Plac treningowy's looks 2 and 3 were
  // completed past their 128 × 96 frame by PixelLab (608 A, 609 A), so a
  // picture may be up to 160 × 128. Last, the Zbieracz Systemu's icon by the
  // Skrzynia Konta, 32 × 32 (data/camp.json, collector.art).
  camp: {
    width: 160,
    height: 128,
    fit: true,
    ids: [
      'sawmill-1', 'sawmill-2', 'sawmill-3', 'sawmill-4', 'quarry-1', 'quarry-2', 'quarry-3', 'quarry-4', 'mine-1', 'mine-2', 'mine-3', 'mine-4',
      'midas-lake-1', 'midas-lake-2', 'midas-lake-3', 'midas-lake-4', 'campfire-1', 'campfire-2', 'campfire-3', 'loot-shed-1', 'loot-shed-2', 'loot-shed-3',
      'scrap-bench-1', 'scrap-bench-2', 'scrap-bench-3', 'anvil-1', 'anvil-2', 'anvil-3', 'craft-table-1', 'craft-table-2', 'craft-table-3',
      'quarters-1', 'quarters-2', 'quarters-3', 'cornerstone-1',
      'training-yard-1', 'training-yard-2', 'training-yard-3', 'armory-1', 'armory-2', 'trophy-hall-1', 'trophy-hall-2', 'trophy-hall-3',
      'watchtower-1', 'watchtower-2', 'watchtower-3', 'system-altar-1', 'system-altar-2', 'system-altar-3',
      'greenhouse-1', 'greenhouse-2', 'greenhouse-3', 'shrine-1', 'shrine-2', 'shrine-3',
      'collector-spirit',
    ],
  },
  // The herbs of Zielarstwo, 32×32, filled in as they are approved.
  herbs: {
    size: 32,
    ids: [
      'comfrey', 'mugwort', 'nettle', 'plantain', 'st-johns-wort', 'calamus', 'arnica', 'wormwood', 'valerian', 'cranberry', 'aconite', 'mistletoe', 'fern-blossom',
      // From the 100th level of Zielarstwo (952.1), the author's picks 955.
      'adders-tongue', 'mandrake', 'henbane', 'springwort', 'golden-root',
    ],
  },
  // The potions of Alchemia, 32×32, filled in as they are approved, Jagna's
  // six rare recipes (121 A) with the author's picks among the drafts (670).
  potions: {
    size: 32,
    ids: [
      'lesser-healing', 'lesser-mana', 'lesser-speed', 'healing', 'mana', 'antidote', 'speed', 'stoneskin-brew', 'strength-brew', 'focus-draught',
      'greater-healing', 'greater-mana', 'greater-speed', 'aconite-oil', 'mistletoe-elixir', 'fern-brew',
      'owl-draught', 'bearskin-brew', 'wolf-strength-brew', 'burn-brew', 'evil-eye-brew', 'jagna-balm',
      // From the 100th level of Alchemia (952.2), the author's picks 954.
      'mana-elixir', 'great-healing-balm', 'bison-hide-brew', 'aurochs-strength-brew', 'falcon-eye-draught', 'halny-wind-draught', 'henbane-oil', 'springwort-elixir', 'living-water',
    ],
  },
  // The camp's resources (data/resources.json), 32×32, shown at the size of
  // the line icons they replace.
  resources: {
    size: 32,
    ids: ['wood', 'stone', 'iron-ore'],
  },
  // The coin of gold and the hourglass of Punkty Czasu where their line icons
  // stood, and the Encyclopedia's corner of the top bar, 32×32. Punkty
  // Systemu keep their line icon (the author: "tylko Punkty Systemu będą w
  // takiej wyróżniającej formie jak do tej pory"). The Kowadło's two
  // scrolls, the Zwój ochronny and the Zwój utrwalenia (598 C).
  icons: {
    size: 32,
    ids: ['gold', 'time-points', 'encyclopedia', 'ward-scroll', 'steady-scroll', 'oblivion-scroll', 'fir-branch'],
  },
  // The professions' squares on the Profesje tab, 48×48.
  professions: {
    size: 48,
    ids: ['herbalism', 'alchemy', 'crafting', 'mining', 'jewelcrafting', 'fishing', 'farming', 'cooking'],
  },
  // The gems and ores of Górnictwo (data/professions.json, minerals), 32×32,
  // drawn in PixelLab (545).
  minerals: {
    size: 32,
    ids: ['quartz', 'agate', 'amethyst', 'emerald', 'sapphire', 'ruby', 'diamond', 'silver-ore', 'gold-ore', 'star-ore'],
  },
  // The fish of Rybołówstwo (data/professions.json, fish), 32×32, drawn in
  // PixelLab (1001, 1057).
  fish: {
    size: 32,
    ids: ['roach', 'perch', 'crucian', 'bream', 'tench', 'carp', 'eel', 'pike', 'zander', 'trout', 'catfish', 'sturgeon', 'salmon', 'golden-carp', 'water-catfish', 'silverfish', 'drowned-pike', 'golden-fish'],
  },
  // The crops of Rolnictwo (data/professions.json, crops), 32×32, drawn in
  // PixelLab (1002, 1058).
  crops: {
    size: 32,
    ids: ['turnip', 'peas', 'millet', 'oats', 'cabbage', 'onion', 'carrot', 'rye', 'broad-bean', 'beet', 'wheat', 'buckwheat', 'pumpkin', 'poppy', 'garlic', 'giant-turnip', 'golden-ear', 'mokosh-grain'],
  },
  // The dishes of Gotowanie (data/professions.json, dishes), 32×32, drawn in
  // PixelLab (1003, 1059).
  dishes: {
    size: 32,
    ids: [
      'baked-turnip', 'pea-soup', 'fried-roach', 'millet-crucian', 'oat-kissel', 'fish-cabbage', 'fried-carp', 'zurek', 'eel-beans', 'borscht',
      'pike-pierogi', 'buckwheat-zander', 'campfire-trout', 'pumpkin-soup', 'fisherman-feast', 'kutia', 'garlic-salmon', 'golden-carp-herbs', 'switez-soup', 'mokosh-feast',
    ],
  },
  // The places where professions work, dim behind their cards, the
  // Ewolucja tab's spring behind its heading, and the Osada's rooms behind
  // their residents' cards (the Salon Gier's), 192×96.
  places: {
    width: 192,
    height: 96,
    ids: ['system-grove', 'system-workshop', 'system-workbench', 'system-mine', 'system-lapidary', 'system-pond', 'system-field', 'system-kitchen', 'system-spring', 'tower-solo', 'tower-party', 'guild-keep', 'casino-hall', 'trial-hall', 'wanted-board', 'portal-gold', 'portal-wood', 'portal-stone', 'portal-ore', 'portal-materials', 'portal-parts', 'arena'],
  },
  // The fights' boards under the formation of a fight's playback (arena.js;
  // 790 B, the Arena's sand), 192×160, a place's fightBoard in
  // data/settlement.json and a land's in data/regions.json.
  boards: {
    width: 192,
    height: 160,
    ids: ['arena-board', 'board-windfalls', 'board-stone-glade', 'board-backwaters', 'board-peat-bogs', 'board-black-bog', 'board-pine-dunes', 'board-silent-wilds', 'board-new-moon-depths', 'board-scree-slopes', 'board-fir-forest', 'board-bald-mountain'],
  },
  // The buildings of the Siedziba Gildii (data/guilds.json, seat), by the
  // building's id, 128×96 on a transparent ground: the first look the
  // author picked for each (623), drawn in PixelLab, for all their levels
  // until more looks come.
  guild: {
    width: 128,
    height: 96,
    ids: ['guild-banner', 'guild-treasury', 'guild-forge', 'scouts-house'],
  },
  // The events at the end of an exploration (data/events.json): the people
  // met, 96×128, and the scenes behind them, 192×96, filled in as they are
  // approved.
  events: {
    width: 96,
    height: 128,
    ids: [
      'wounded-woman', 'fern-flower', 'blue-mushroom', 'wandering-beggar', 'wayside-shrine', 'stuck-merchant', 'leshy', 'lost-child', 'forest-wedding', 'treasure-hunter', 'bog-herbalist', 'star-iron', 'ferryman', 'fireside-dice', 'refugees', 'old-soldier',
      // The events of 951 (14.11.2026), the author's picks 957.
      'bounty-hunters', 'robber-knight', 'skarbnik', 'snake-king', 'ghost-caravan', 'white-stag', 'forefathers-eve', 'boruta',
    ],
  },
  'event-scenes': {
    width: 192,
    height: 96,
    ids: ['forest-ambush', 'fern-glade'],
  },
  // The figures the evolutions' skills summon in fights, by the skill's id
  // (Przywołanie żywiołaka, Trujący Szlam, Przywołanie enta, Przebudzenie
  // dębu: 893 B and C, 13.11.2026): square, cut close around the figure,
  // shown in a card of its own before the summoner.
  summons: {
    size: 48,
    fit: true,
    ids: ['elemental-summon', 'toxic-slime', 'ent-summon', 'oak-awakening'],
  },
  // The Osada (data/settlement.json): its places on the board, by the
  // place's id, each cut to its outline, the Targowisko in the middle the
  // largest, and the torch that stands in a few places on it, burning and
  // put out; the residents' busts, 96×128; and the board's ground, twice
  // as tall as the camp's, which scrolls with the page. The Salon Gier
  // (`casino`, 528 H) and its host Szczęsny (`gamehost`, 529 C) are drawn
  // in PixelLab.
  settlement: {
    width: 192,
    height: 144,
    fit: true,
    ids: ['board', 'enchanter', 'hermitage', 'tavern', 'market', 'herbalist', 'forge', 'tannery', 'stable', 'casino', 'trial-hall', 'arena', 'torch', 'torch-off'],
  },
  // The Salon Gier's games on the screen (data/settlement.json, casino.show;
  // PixelLab, 550.1 C, 550.2 B): the Koło Fortuny and the Loteria's drum,
  // 128×128, and the ticket and the pointer over the wheel, 64×64.
  salon: {
    size: 128,
    ids: ['fortune-wheel', 'lottery-drum'],
  },
  'salon-small': {
    size: 64,
    ids: ['lottery-ticket', 'wheel-pointer'],
  },
  residents: {
    width: 96,
    height: 128,
    ids: ['headman', 'enchantress', 'hermit', 'innkeeper', 'herbalist', 'merchant', 'smith', 'tanner', 'groom', 'gamehost', 'builder-spirit'],
  },
  // The companions hired in the Karczma: a bust for each class and look,
  // other faces than the players' portraits (question 107 B), cut off the
  // plain background they were drawn on (tools/cut-bust.py).
  companions: {
    width: 96,
    height: 128,
    ids: ['warrior-female', 'warrior-male', 'archer-female', 'archer-male', 'mage-female', 'mage-male', 'cleric-female', 'cleric-male', 'shadow-female', 'shadow-male'],
  },
  // The companions' whole figures for fights (the author: "Do popiersi
  // towarzyszy trzeba też wygenerować portrety do walki"), in the class
  // portraits' frame and size (tools/normalize-portraits.py), as the author
  // picked them; `faces` as the class portraits'. A companion without one
  // would show its bust.
  'companion-portraits': {
    width: 96,
    height: 128,
    ids: ['warrior-female', 'warrior-male', 'archer-female', 'archer-male', 'mage-female', 'mage-male', 'cleric-female', 'cleric-male', 'shadow-female', 'shadow-male'],
    faces: { 'warrior-female': 54, 'warrior-male': 52, 'archer-female': 48, 'archer-male': 44, 'mage-female': 47, 'mage-male': 45, 'cleric-female': 53, 'cleric-male': 58, 'shadow-female': 45, 'shadow-male': 46 },
  },
  // The companions walking beside the character on the Walka scene (640 A,
  // 648), <class>-<look>: eight frames of 128×128 in a row, as the
  // character's walks, from their walk starts (art/walks.json,
  // companion-<class>-<look>) animated by PixelLab, as the author picked
  // them. A companion's look is fixed, so there are no skin tones.
  'companion-walkers': {
    width: 1024,
    height: 128,
    ids: ['warrior-female', 'warrior-male', 'archer-female', 'archer-male', 'mage-female', 'mage-male', 'cleric-female', 'cleric-male', 'shadow-female', 'shadow-male'],
  },
  'settlement-board': {
    width: 384,
    height: 768,
    ids: ['settlement', 'settlement-winter'],
  },
  // The Osada under snow for Szczodre Gody (all of December, as the winter
  // camp, 1063 v2): the ground ("settlement-winter" among the boards above)
  // and the places with snow on their roofs, their sand trodden snow. A
  // place without its winter picture keeps its own.
  'settlement-winter': {
    width: 192,
    height: 144,
    fit: true,
    ids: ['arena', 'board', 'casino', 'enchanter', 'forge', 'herbalist', 'hermitage', 'market', 'stable', 'tannery', 'tavern', 'trial-hall'],
  },
  // The Stajnia's mounts (data/settlement.json, stable.mounts, by id), saddled
  // and seen from the side, cut to their outline, on their cards in the
  // Stajnia, and the look a mount can wear from the Sklep Systemu
  // ("sabertooth", the Tygrys szablozębny, a frame of its walk with its long
  // tail). Their trot for the Walka scene is a sheet of its own
  // (data/animations.json, walk.mounts).
  mounts: {
    width: 176,
    height: 144,
    fit: true,
    ids: ['pony', 'horse', 'steed', 'sabertooth', 'reindeer'],
  },
  // The Sklep Systemu's frames of the portrait, 120×160 with a window in the
  // middle, and its backgrounds behind the figure, 96×128
  // (data/cosmetics.json, by their art). A mount's look has its picture
  // among the mounts.
  // The decorations of the winter camp from the calendar of Szczodre Gody
  // (data/winter.json, 1044.3a B and 1044.3b D), 76×76, drawn in PixelLab.
  winter: {
    size: 76,
    ids: ['podlaznniczka', 'snopek'],
  },
  // Andrzejki's eight omens, wax figurines, and the candle of its
  // achievement (andrzejki.js, 1082 C), 32×32, drawn in PixelLab.
  omens: {
    size: 32,
    ids: ['dragon', 'purse', 'key', 'raven', 'star', 'leaf', 'heart', 'crown', 'candle'],
  },
  // Andrzejki's two evenings, the wax and the three cups (1082 C: the wax's
  // version 2, the cups' version 3 with all three covered, 1093.3), and the
  // cups once one is chosen, without it (cups-open-1 to 3), 128×96, drawn in
  // PixelLab.
  andrzejki: {
    width: 128,
    height: 96,
    ids: ['wax', 'cups', 'cups-open-1', 'cups-open-2', 'cups-open-3'],
  },
  cosmetics: {
    width: 120,
    height: 160,
    fit: true,
    ids: ['frame-gold', 'frame-system', 'frame-forest', 'bg-spring', 'bg-tower', 'bg-camp', 'frame-szron', 'bg-szczodre', 'bg-andrzejki'],
  },
  // The character riding, <class>-<look> or an evolution's
  // <evolution>-<look>: one picture sitting in a saddle that is not drawn
  // (tools/ride-skeleton.py), put on the mount's trot in the Walka scene. A
  // skin tone other than the one drawn has its own file, as a walk does.
  riders: {
    width: 64,
    height: 96,
    ids: [
      'warrior-female', 'warrior-male', 'archer-female', 'archer-male', 'mage-female', 'mage-male', 'cleric-female', 'cleric-male', 'shadow-female', 'shadow-male',
      'guardian-female', 'guardian-male', 'sniper-female', 'sniper-male', 'ice-lord-female', 'ice-lord-male', 'priest-female', 'priest-male', 'assassin-female', 'assassin-male',
      'barbarian-female', 'barbarian-male', 'gladiator-female', 'gladiator-male', 'storm-archer-female', 'storm-archer-male', 'hunter-female', 'hunter-male',
      'elementalist-female', 'elementalist-male', 'arcanist-female', 'arcanist-male', 'healer-female', 'healer-male', 'inquisitor-female', 'inquisitor-male',
      'poisoner-female', 'poisoner-male', 'night-dancer-female', 'night-dancer-male',
      // The second forms at class level 100.
      'berserker-female', 'berserker-male', 'arena-champion-female', 'arena-champion-male', 'bastion-female', 'bastion-male', 'marksman-female',
      'marksman-male', 'thunder-lord-female', 'thunder-lord-male', 'master-hunter-female', 'master-hunter-male', 'archmage-female', 'archmage-male',
      'winter-lord-female', 'winter-lord-male', 'druid-female', 'druid-male', 'miracle-worker-female', 'miracle-worker-male',
      'grand-inquisitor-female', 'grand-inquisitor-male', 'high-priest-female', 'high-priest-male', 'kingslayer-female', 'kingslayer-male',
      'necromancer-female', 'necromancer-male', 'phantom-female', 'phantom-male',
      // The third forms at class level 200, as the author accepted them (822,
      // the riders drawn anew one by one; the large ones in walk.rider.large).
      'horde-slayer-female', 'horde-slayer-male', 'arena-legend-female', 'arena-legend-male', 'colossus-female', 'colossus-male',
      'bow-master-female', 'bow-master-male', 'perun-chosen-female', 'perun-chosen-male', 'wild-lord-female', 'wild-lord-male',
      'elemental-avatar-female', 'elemental-avatar-male', 'frost-monarch-female', 'frost-monarch-male', 'archdruid-female', 'archdruid-male',
      'saint-female', 'saint-male', 'demon-slayer-female', 'demon-slayer-male', 'prophet-female', 'prophet-male', 'godslayer-female', 'godslayer-male',
      'lich-female', 'lich-male', 'shadow-lord-female', 'shadow-lord-male',
      // The fourth forms at class level 300, shown only where FOURTH_EVOLUTION is on.
      'ravager-female', 'ravager-male', 'immortal-female', 'immortal-male', 'titan-female', 'titan-male',
      'celestial-archer-female', 'celestial-archer-male', 'thunderer-female', 'thunderer-male', 'beast-lord-female', 'beast-lord-male',
      'primordial-female', 'primordial-male', 'frost-god-female', 'frost-god-male', 'elder-druid-female', 'elder-druid-male',
      'archangel-female', 'archangel-male', 'heaven-avenger-female', 'heaven-avenger-male', 'seer-female', 'seer-male',
      'soul-reaper-female', 'soul-reaper-male', 'navia-king-female', 'navia-king-male', 'dark-prince-female', 'dark-prince-male',
      'skin-night-raven-female', 'skin-night-raven-male', 'skin-forest-lord-female', 'skin-forest-lord-male',
      'skin-perun-female', 'skin-perun-male',
      'skin-dawn-female', 'skin-dawn-male', 'skin-eclipse-female', 'skin-eclipse-male',
      // The winter outfits of Szczodre Gody, sold in December (1044).
      'skin-winter-warrior-female', 'skin-winter-warrior-male', 'skin-winter-archer-female', 'skin-winter-archer-male',
      'skin-winter-mage-female', 'skin-winter-mage-male', 'skin-winter-cleric-female', 'skin-winter-cleric-male',
      'skin-winter-shadow-female', 'skin-winter-shadow-male',
    ],
  },
};

const available = Object.fromEntries(Object.entries(SPRITES).map(([kind, { ids }]) => [kind, new Set(ids)]));

function sprite(kind, id, className) {
  if (!available[kind].has(id)) return null;
  const { size } = SPRITES[kind];
  return h('img', {
    src: `/art/${kind}/${id}.png`,
    alt: '',
    width: size,
    height: size,
    class: `sprite ${className}`,
    decoding: 'async',
    draggable: 'false',
  });
}

// The ids a second or third form's skill stands in with until it has its
// own art (the server's evolutionArt): the skill itself first, then the
// skill it grew from, or the earlier form's skill in its place, and so on
// back to the first evolution's (a third form's through its second form's).
// Any other skill: itself.
export const artChain = (skillId) => [skillId, ...(state.content?.evolutionArt?.skills?.[skillId] ?? [])];

// The first of `ids` with a sprite of `kind`.
const firstSprite = (kind, ids, className) => {
  for (const id of ids) {
    const art = sprite(kind, id, className);
    if (art) return art;
  }
  return null;
};

export const monsterSprite = (monsterId) => sprite('monsters', monsterId, 'sprite--monster');
// The figure a summoning skill puts in fights: its own, else the creature
// it calls (`figure`: a wolf, a bear, a skeleton, the white wolf as the
// Basior, the bison as the Tur, as the creatures are drawn), else that of
// the skill it stands in with (a later form's summon without its own).
export function summonSprite(skillId, figure) {
  const [own, ...stand] = artChain(skillId);
  return sprite('summons', own, 'sprite--summon') ?? (figure ? sprite('monsters', figure, 'sprite--summon') : null) ?? firstSprite('summons', stand, 'sprite--summon');
}
export const itemSprite = (item) => sprite('items', item.base, 'sprite--item');
// A material, a part ("scraps") or the chest ("chest").
export const materialSprite = (id) => sprite('materials', id, 'sprite--item');
// An Andrzejki omen's wax figurine, or the candle (andrzejki.js).
export const omenSprite = (id) => sprite('omens', id, 'sprite--item');
// A skill's icon, a second or third form's skill's stand-in until it has
// its own.
export const skillSprite = (id) => firstSprite('skills', artChain(id), 'sprite--skill');
export const areaSprite = (areaId) => sprite('areas', areaId, 'area-art');
// The picture of a place as a CSS url, for a card's background; null when
// the place has none.
export const areaArtUrl = (areaId) => (available.areas.has(areaId) ? `url("/art/areas/${areaId}.png")` : null);
// The address of a land's background, or null while it has none.
export const landArt = (regionId) => (available.lands.has(regionId) ? `/art/lands/${regionId}.png` : null);
// The address of the camp board's ground and of a camp building's picture at
// a look (1–3), or null while it has none.
// `winter`: the board under snow of the winter camp, where it has one.
export const boardGround = (tier, tall = false, winter = false) => {
  // The Warownia stands only on a camp at its top level, on the walls' board.
  const kind = tall === 'fortress' ? 'board-fortress' : tall ? 'board-tall' : 'board';
  const id = tall === 'fortress' ? 'fortress' : `camp-${tier}`;
  if (winter && available[`${kind}-winter`].has(id)) return `/art/${kind}-winter/${id}.png`;
  return available[kind].has(id) ? `/art/${kind}/${id}.png` : null;
};
export const campArt = (buildingId, tier) => (available.camp.has(`${buildingId}-${tier}`) ? `/art/camp/${buildingId}-${tier}.png` : null);
// A decoration of the winter camp (data/winter.json, decorations), or null
// without its picture.
export const winterDecorationArt = (id) => (available.winter.has(id) ? `/art/winter/${id}.png` : null);
// The Zbieracz Systemu's icon on the camp board, 32×32 (data/camp.json,
// collector.art), or null while it has none.
export const campIcon = (id) =>
  available.camp.has(id) ? h('img', { src: `/art/camp/${id}.png`, alt: '', width: 32, height: 32, class: 'sprite camp-icon', decoding: 'async', draggable: 'false' }) : null;
// A herb of Zielarstwo, a potion of Alchemia, a profession's square on the
// Profesje tab, and the address of the background of a place where a
// profession works.
export const herbSprite = (id) => sprite('herbs', id, 'sprite--item');
export const potionSprite = (id) => sprite('potions', id, 'sprite--item');
// A gem or an ore of Górnictwo.
export const mineralSprite = (id) => sprite('minerals', id, 'sprite--item');
// A fish of Rybołówstwo.
export const fishSprite = (id) => sprite('fish', id, 'sprite--item');
// A crop of Rolnictwo.
export const cropSprite = (id) => sprite('crops', id, 'sprite--item');
// A dish of Gotowanie.
export const dishSprite = (id) => sprite('dishes', id, 'sprite--item');
// A good of the Spiżarnia: a fish, a crop or a dish (their ids differ).
export const pantrySprite = (id) => fishSprite(id) ?? cropSprite(id) ?? dishSprite(id);
// The Systemowe Pole's pictures (1005 B, accepted on 16.11.2026): the
// meadow under the board, 192×160, a plot's tilled ground and the plants'
// four stages of growth, common to all crops, 48×48.
export const farmArt = {
  board: '/art/farm/field-board.png',
  plot: '/art/farm/plot.png',
  stage: (stage) => `/art/farm/stage-${stage}.png`,
};
export const professionSprite = (id) => sprite('professions', id, 'sprite--profession');
// Gold or a resource where a line icon stood: the resource's sprite, never
// under 24 px, where its detail still reads (at 14 px in the camp's bubbles
// the author took it for the old icon), or its line icon at `size` while it
// has none.
const RESOURCE_SPRITE_MIN = 24;
export function resourceArt(id, size) {
  const art = id === 'gold' ? sprite('icons', 'gold', 'sprite--resource') : sprite('resources', id, 'sprite--resource');
  if (!art) return icon(RESOURCE_ICONS[id] ?? 'unknown', { size });
  art.width = Math.max(size, RESOURCE_SPRITE_MIN);
  art.height = Math.max(size, RESOURCE_SPRITE_MIN);
  return art;
}
// The coin of gold and the hourglass of Punkty Czasu at just `size`, by a
// number in a line of text, or their line icons while they have no sprite.
function iconArt(id, size, fallback) {
  const art = sprite('icons', id, 'sprite--resource');
  if (!art) return icon(fallback, { size });
  art.width = size;
  art.height = size;
  return art;
}
export const goldArt = (size) => iconArt('gold', size, 'coin');
export const timePointsArt = (size) => iconArt('time-points', size, 'hourglass');
export const encyclopediaArt = (size) => iconArt('encyclopedia', size, 'book');
// A scroll by its id: the Kowadło's (ward-scroll, steady-scroll) and the
// Zwój Niepamięci (oblivion-scroll, 989).
export const scrollArt = (id, size) => iconArt(id, size, 'scroll');
// The fir branch of Szczodre Gody's winter quest (1044.7 D).
export const firBranchArt = (size) => iconArt('fir-branch', size, 'leaf');
export const placeArt = (placeId) => (available.places.has(placeId) ? `/art/places/${placeId}.png` : null);
// The pictures of the Labirynt Systemu and the Rdzeń (art/labyrinth/, 850–866,
// accepted in 868 and 869): its rooms (room-<type>), its Artefakty
// (artifact-<element>), the Odłamki (shards) and the Rdzeń itself (core). A
// picture this page has shown once shows at once; the first time it shows
// once its file has loaded, and while it cannot load the placeholder
// `fallback` stands in its place.
const labyrinthLoaded = new Set();
const labyrinthMissing = new Set();
export function labyrinthArt(name, size, fallback) {
  const box = h('span', { class: 'labyrinth-art' });
  box.style.width = `${size}px`;
  box.style.height = `${size}px`;
  const image = () => h('img', { src: `/art/labyrinth/${name}.png`, alt: '', width: size, height: size, class: 'sprite labyrinth-art-image', decoding: 'async', draggable: 'false' });
  if (labyrinthLoaded.has(name)) return append(box, [image()]);
  if (labyrinthMissing.has(name)) return append(box, [fallback]);
  const first = image();
  first.hidden = true;
  first.addEventListener('load', () => {
    labyrinthLoaded.add(name);
    first.hidden = false;
    fallback?.remove();
  });
  first.addEventListener('error', () => {
    labyrinthMissing.add(name);
    first.remove();
  });
  return append(box, [fallback, first]);
}
// A room's placeholder: its line icon in its colour (styles.css).
const ROOM_ICONS = { fight: 'swords', elite: 'star', treasure: 'coffer', spring: 'spirit', altar: 'skills', merchant: 'pouch', guardian: 'keep' };
export const roomPlaceholder = (type) => h('span', { class: `room-placeholder room-placeholder--${type}` }, icon(ROOM_ICONS[type] ?? 'unknown', { size: 20 }));
// A fight's board under its formation (arena.js), or null while it has none.
export const boardArt = (boardId) => (available.boards.has(boardId) ? `/art/boards/${boardId}.png` : null);
// A building of the Siedziba Gildii at its own size, or null while it has
// no picture.
export function guildSeatSprite(buildingId) {
  if (!available.guild.has(buildingId)) return null;
  const { width, height } = SPRITES.guild;
  return h('img', { src: `/art/guild/${buildingId}.png`, alt: '', width, height, class: 'sprite sprite--seat', decoding: 'async', draggable: 'false' });
}
// The figure of an event and the address of its scene, or null while there
// is none.
export const eventFigure = (id) =>
  available.events.has(id) ? h('img', { src: `/art/events/${id}.png`, alt: '', width: 96, height: 128, class: 'sprite event-figure', decoding: 'async', draggable: 'false' }) : null;
export const eventScene = (id) => (available['event-scenes'].has(id) ? `/art/event-scenes/${id}.png` : null);
// A companion as the figure of its errand (817.7): its whole figure for
// fights, standing in the scene like an event's person.
export function companionFigure(classId, appearance) {
  const id = `${classId}-${appearance}`;
  return available['companion-portraits'].has(id)
    ? h('img', { src: `/art/companion-portraits/${id}.png`, alt: '', width: 96, height: 128, class: 'sprite event-figure', decoding: 'async', draggable: 'false' })
    : null;
}
// The Osada's place on its board, a resident's bust and the board's ground,
// or null while there is none.
// `winter`: in December, the place with snow on its roof, where it has one.
export const settlementPlaceArt = (placeId, winter = false) => {
  const src = winter && available['settlement-winter'].has(placeId) ? `/art/settlement-winter/${placeId}.png` : available.settlement.has(placeId) ? `/art/settlement/${placeId}.png` : null;
  return src ? h('img', { src, alt: '', class: 'sprite settlement-place-art', decoding: 'async', draggable: 'false' }) : null;
};
// A torch of the Osada's board, burning or, by day, put out.
export const settlementTorchArt = (lit = true) => {
  const id = lit ? 'torch' : 'torch-off';
  return available.settlement.has(id) ? h('img', { src: `/art/settlement/${id}.png`, alt: '', class: 'sprite settlement-torch-art', decoding: 'async', draggable: 'false' }) : null;
};
// A picture of the Salon Gier's games, by its name, or null while there is none.
export const salonArt = (id) => (available.salon.has(id) ? `/art/salon/${id}.png` : available['salon-small'].has(id) ? `/art/salon-small/${id}.png` : null);
export const residentBust = (residentId) =>
  available.residents.has(residentId)
    ? h('img', { src: `/art/residents/${residentId}.png`, alt: '', width: 96, height: 128, class: 'sprite resident-bust', decoding: 'async', draggable: 'false' })
    : null;
// A companion's bust, by its class and look, or null while it has none.
export function companionBust(classId, appearance) {
  const id = `${classId}-${appearance}`;
  return available.companions.has(id)
    ? h('img', { src: `/art/companions/${id}.png`, alt: '', width: 96, height: 128, class: 'sprite companion-bust', decoding: 'async', draggable: 'false' })
    : null;
}
// A companion's whole figure for fights, as a bust centred on its face like
// a class portrait in the arena, or null while it has none.
export function companionPortrait(classId, appearance) {
  const id = `${classId}-${appearance}`;
  if (!available['companion-portraits'].has(id)) return null;
  const { width, height, faces } = SPRITES['companion-portraits'];
  const off = (faces[id] ?? width / 2) - width / 2;
  return h('img', {
    src: `/art/companion-portraits/${id}.png`,
    alt: '',
    width,
    height,
    class: 'sprite sprite--portrait sprite--bust',
    style: off ? { objectPosition: `calc(50% - ${off}px) 0` } : undefined,
    decoding: 'async',
    draggable: 'false',
  });
}
// `winter`: in December, the ground under snow, where it has one.
export const settlementGround = (winter = false) =>
  winter && available['settlement-board'].has('settlement-winter')
    ? '/art/settlement-board/settlement-winter.png'
    : available['settlement-board'].has('settlement')
      ? '/art/settlement-board/settlement.png'
      : null;

// A skin tone other than the one drawn has its own recoloured file
// (data/skins.json, tools/skin-tones.py).
function toneFile(id, skin) {
  const tone = state.content?.skins?.tones.find((candidate) => candidate.id === skin);
  return tone && !tone.drawn ? `${id}-${tone.id}` : id;
}

const toned = new Set([...SPRITES.portraits.toned, ...SPRITES.portraits.tonedEvolutions]);

// The art of an outfit of the Sklep Systemu (skórka, 763 A) by the
// cosmetic's id: its `look`, the prefix of its pictures, or null.
const outfitLook = (id) => (id ? (state.content?.cosmetics?.items.find((item) => item.id === id && item.kind === 'outfit')?.look ?? null) : null);

// The ids a look is drawn under, best first: the outfit's worn (`outfit`,
// the cosmetic's id), the evolution's, then for a second or third form
// without its own art yet the forms it grew out of, the nearest first (the
// server's evolutionArt), then the class's.
export function lookIds(classId, appearance, evolution, outfit = null) {
  const look = outfitLook(outfit);
  const ids = look ? [`${look}-${appearance}`] : [];
  for (let id = evolution, n = 0; id && n < 4; id = state.content?.evolutionArt?.forms?.[id], n += 1) ids.push(`${id}-${appearance}`);
  ids.push(`${classId}-${appearance}`);
  return ids;
}
// The first of a look's ids that has art of `kind`, or null.
const lookId = (kind, classId, appearance, evolution, outfit) => lookIds(classId, appearance, evolution, outfit).find((id) => available[kind].has(id)) ?? null;

// A class's figure for a look, or its evolution's once it has one. `bust`
// shows the head and shoulders at the image's own size, cut by the box it
// sits in (the arena, the class cards).
export function portraitSprite(classId, appearance, { bust = false, skin, evolution, outfit } = {}) {
  const id = lookId('portraits', classId, appearance, evolution, outfit);
  if (!id) return null;
  const file = toned.has(id) ? toneFile(id, skin) : id;
  const { width, height, faces } = SPRITES.portraits;
  const off = bust ? (faces[id] ?? width / 2) - width / 2 : 0;
  // A skórka's portrait is the whole figure in a wide cloak: its bust fades
  // out at the sides instead of ending in a hard cut (styles.css).
  const look = outfitLook(outfit);
  const whole = bust && look && id.startsWith(`${look}-`);
  return h('img', {
    src: `/art/portraits/${file}.png`,
    alt: '',
    width,
    height,
    class: `sprite sprite--portrait${bust ? ' sprite--bust' : ''}${whole ? ' sprite--outfit' : ''}`,
    style: off ? { objectPosition: `calc(50% - ${off}px) 0` } : undefined,
    decoding: 'async',
    draggable: 'false',
  });
}

// Where a pet perches on the portrait of a look (SPRITES.portraits.perches),
// in the portrait's pixels: on the portrait shown, its evolution's or its
// class's, or, for a look without one, about where most shoulders are.
export function portraitPerch(classId, appearance, evolution, outfit) {
  return SPRITES.portraits.perches[lookId('portraits', classId, appearance, evolution, outfit)] ?? [34, 34];
}

// A pet's own place on the portrait of a look (SPRITES.portraits.petSpots):
// the top left corner of its frame in the portrait's pixels, or null where
// the pet keeps its usual place.
export function portraitPetSpot(petId, classId, appearance, evolution, outfit) {
  return SPRITES.portraits.petSpots[petId]?.[lookId('portraits', classId, appearance, evolution, outfit)] ?? null;
}

// The sheet of the character walking in its look and skin tone, or its
// evolution's once it has one, as a path from the site's root like the
// scenes' sheets (data/animations.json), or null for a look without one.
export function walkerSheet(classId, appearance, skin, evolution, outfit) {
  const id = lookId('walkers', classId, appearance, evolution, outfit);
  return id ? `art/walkers/${toneFile(id, skin)}.png` : null;
}

// The sheet of a companion from the Kwatery walking, by its class and look,
// as a path like walkerSheet's, or null for a look without one.
export function companionWalkerSheet(classId, appearance) {
  const id = `${classId}-${appearance}`;
  return available['companion-walkers'].has(id) ? `art/companion-walkers/${id}.png` : null;
}

// The address of a frame's or a background's picture (the Sklep Systemu),
// or null while it has none.
export const cosmeticArt = (art) => (available.cosmetics.has(art) ? `/art/cosmetics/${art}.png` : null);

// A mount of the Stajnia on its card, or null while it has no picture.
export const mountArt = (id) =>
  available.mounts.has(id) ? h('img', { src: `/art/mounts/${id}.png`, alt: '', class: 'sprite mount-art', decoding: 'async', draggable: 'false' }) : null;

// The rider's look id (<class>-<look>, an evolution's or an outfit's), or
// null for a look without one.
export const riderLook = (classId, appearance, evolution, outfit) => lookId('riders', classId, appearance, evolution, outfit);

// The character riding, in its look and skin tone (or its evolution's), as a
// path from the site's root, or null for a look without one.
export function riderFile(classId, appearance, skin, evolution, outfit) {
  const id = riderLook(classId, appearance, evolution, outfit);
  return id ? `art/riders/${toneFile(id, skin)}.png` : null;
}

// The narrator's hooded face, for the quests in the top bar (quests.js).
export function narratorFace() {
  return h('img', {
    src: '/art/narrator/narrator.png',
    alt: '',
    width: SPRITES.narrator.width,
    height: SPRITES.narrator.height,
    class: 'sprite narrator-face',
    decoding: 'async',
    draggable: 'false',
  });
}

export function narratorSprite() {
  const { width, height } = SPRITES.narrator;
  return h('img', {
    src: '/art/narrator/narrator.png',
    alt: '',
    width,
    height,
    class: 'sprite sprite--narrator',
    decoding: 'async',
    draggable: 'false',
  });
}

// Fetches the classes' portraits ahead, so the class cards show them at once.
export function preloadPortraits() {
  for (const id of SPRITES.portraits.toned) {
    const image = new Image();
    image.decoding = 'async';
    image.src = `/art/portraits/${id}.png`;
  }
}

// Pixel-art sprites drawn with Retro Diffusion (prompts in art/prompts.json):
// one for each monster and item base listed below, in /art/<kind>/<id>.png,
// and a full-figure portrait for each class and look. Whatever has no sprite
// yet keeps its line icon or vector art.

import { h, icon } from './dom.js';
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
    ],
  },
  // <class>-<look>, 96×128 (3:4), filled in as the portraits are approved.
  // `faces`: where the face is across, when not in the middle (a head turned
  // in three quarters), as tools/normalize-portraits.py prints it. Busts
  // centre on the face; the whole figure stays centred.
  portraits: {
    width: 96,
    height: 128,
    ids: ['warrior-female', 'warrior-male', 'archer-female', 'archer-male', 'mage-female', 'mage-male', 'cleric-female', 'cleric-male', 'shadow-female', 'shadow-male'],
    faces: { 'archer-female': 49, 'archer-male': 52, 'cleric-male': 49, 'shadow-male': 51, 'warrior-male': 50 },
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
    ],
  },
  // The skills of the classes (data/skills.json), 48×48.
  skills: {
    size: 48,
    ids: ['power-strike', 'wide-sweep', 'unyielding', 'aimed-shot', 'arrow-rain', 'pinning-shot', 'fireball', 'frost-gust', 'mana-shield', 'prayer-of-health', 'exorcism', 'blessing', 'backstab', 'poisoned-blade', 'shadow-dance'],
  },
  // The character walking in place on the Walka scene, <class>-<look>: four
  // frames of 48×48 in a row, facing right, drawn from the portraits. A skin
  // tone other than the one drawn has its own recoloured file, as a portrait
  // does (tools/walker-tones.py).
  walkers: {
    width: 192,
    height: 48,
    ids: ['warrior-female', 'warrior-male', 'archer-female', 'archer-male', 'mage-female', 'mage-male', 'cleric-female', 'cleric-male', 'shadow-female', 'shadow-male'],
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
    ],
  },
  // The lands' wide scenes, dim behind the text of their cards, 192×96.
  lands: {
    width: 192,
    height: 96,
    ids: ['windfalls', 'stone-glade', 'backwaters', 'peat-bogs'],
  },
  // The camp's buildings, <building>-<look> for the looks of levels 1–3, 4–7
  // and 8–10, 128×96 (camp-art.js keeps a vector drawing for a look without
  // one).
  // The camp board's ground, without paths (camp-art.js draws them): the
  // glade at the camp's levels 1–3, 4–7 and 8–10, its palisade growing.
  board: {
    width: 320,
    height: 352,
    ids: ['camp-1', 'camp-2', 'camp-3'],
  },
  // Each building cut to its outline, at most 128 × 96.
  camp: {
    width: 128,
    height: 96,
    fit: true,
    ids: [
      'sawmill-1', 'sawmill-2', 'sawmill-3', 'quarry-1', 'quarry-2', 'quarry-3', 'mine-1', 'mine-2', 'mine-3',
      'midas-lake-1', 'midas-lake-2', 'midas-lake-3', 'campfire-1', 'campfire-2', 'campfire-3', 'loot-shed-1', 'loot-shed-2', 'loot-shed-3',
      'scrap-bench-1', 'scrap-bench-2', 'scrap-bench-3', 'anvil-1', 'anvil-2', 'anvil-3', 'craft-table-1', 'craft-table-2', 'craft-table-3',
    ],
  },
  // The herbs of Zielarstwo, 32×32, filled in as they are approved.
  herbs: {
    size: 32,
    ids: ['comfrey', 'mugwort', 'nettle', 'plantain', 'st-johns-wort', 'calamus', 'arnica', 'wormwood', 'valerian', 'cranberry', 'aconite', 'mistletoe', 'fern-blossom'],
  },
  // The potions of Alchemia, 32×32, filled in as they are approved.
  potions: {
    size: 32,
    ids: [
      'lesser-healing', 'lesser-mana', 'lesser-speed', 'healing', 'mana', 'antidote', 'speed', 'stoneskin-brew', 'strength-brew', 'focus-draught',
      'greater-healing', 'greater-mana', 'greater-speed', 'aconite-oil', 'mistletoe-elixir', 'fern-brew',
    ],
  },
  // The camp's resources (data/resources.json), 32×32, shown at the size of
  // the line icons they replace.
  resources: {
    size: 32,
    ids: ['wood', 'stone', 'iron-ore'],
  },
  // The professions' squares on the Profesje tab, 48×48.
  professions: {
    size: 48,
    ids: ['herbalism', 'alchemy', 'crafting'],
  },
  // The places where professions work, dim behind their cards, 192×96.
  places: {
    width: 192,
    height: 96,
    ids: ['system-grove', 'system-workshop', 'system-workbench'],
  },
  // The events at the end of an exploration (data/events.json): the people
  // met, 96×128, and the scenes behind them, 192×96, filled in as they are
  // approved.
  events: {
    width: 96,
    height: 128,
    ids: ['wounded-woman', 'fern-flower'],
  },
  'event-scenes': {
    width: 192,
    height: 96,
    ids: ['forest-ambush', 'fern-glade'],
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

export const monsterSprite = (monsterId) => sprite('monsters', monsterId, 'sprite--monster');
export const itemSprite = (item) => sprite('items', item.base, 'sprite--item');
// A material, a part ("scraps") or the chest ("chest").
export const materialSprite = (id) => sprite('materials', id, 'sprite--item');
export const skillSprite = (id) => sprite('skills', id, 'sprite--skill');
export const areaSprite = (areaId) => sprite('areas', areaId, 'area-art');
// The address of a land's background, or null while it has none.
export const landArt = (regionId) => (available.lands.has(regionId) ? `/art/lands/${regionId}.png` : null);
// The address of the camp board's ground and of a camp building's picture at
// a look (1–3), or null while it has none.
export const boardGround = (tier) => (available.board.has(`camp-${tier}`) ? `/art/board/camp-${tier}.png` : null);
export const campArt = (buildingId, tier) => (available.camp.has(`${buildingId}-${tier}`) ? `/art/camp/${buildingId}-${tier}.png` : null);
// A herb of Zielarstwo, a potion of Alchemia, a profession's square on the
// Profesje tab, and the address of the background of a place where a
// profession works.
export const herbSprite = (id) => sprite('herbs', id, 'sprite--item');
export const potionSprite = (id) => sprite('potions', id, 'sprite--item');
export const professionSprite = (id) => sprite('professions', id, 'sprite--profession');
// Gold or a resource at a line icon's size: the resource's sprite, or its
// line icon while it has none (gold keeps its coin).
export function resourceArt(id, size) {
  const art = sprite('resources', id, 'sprite--resource');
  if (!art) return icon(RESOURCE_ICONS[id] ?? 'unknown', { size });
  art.width = size;
  art.height = size;
  return art;
}
export const placeArt = (placeId) => (available.places.has(placeId) ? `/art/places/${placeId}.png` : null);
// The figure of an event and the address of its scene, or null while there
// is none.
export const eventFigure = (id) =>
  available.events.has(id) ? h('img', { src: `/art/events/${id}.png`, alt: '', width: 96, height: 128, class: 'sprite event-figure', decoding: 'async', draggable: 'false' }) : null;
export const eventScene = (id) => (available['event-scenes'].has(id) ? `/art/event-scenes/${id}.png` : null);

// A skin tone other than the one drawn has its own recoloured file
// (data/skins.json, tools/skin-tones.py).
function toneFile(id, skin) {
  const tone = state.content?.skins?.tones.find((candidate) => candidate.id === skin);
  return tone && !tone.drawn ? `${id}-${tone.id}` : id;
}

// A class's figure for a look. `bust` shows the head and shoulders at the
// image's own size, cut by the box it sits in (the arena, the class cards).
export function portraitSprite(classId, appearance, { bust = false, skin } = {}) {
  const id = `${classId}-${appearance}`;
  if (!available.portraits.has(id)) return null;
  const file = toneFile(id, skin);
  const { width, height, faces } = SPRITES.portraits;
  const off = bust ? (faces[id] ?? width / 2) - width / 2 : 0;
  return h('img', {
    src: `/art/portraits/${file}.png`,
    alt: '',
    width,
    height,
    class: `sprite sprite--portrait${bust ? ' sprite--bust' : ''}`,
    style: off ? { objectPosition: `calc(50% - ${off}px) 0` } : undefined,
    decoding: 'async',
    draggable: 'false',
  });
}

// The sheet of the character walking in its look and skin tone, as a path
// from the site's root like the scenes' sheets (data/animations.json), or
// null for a look without one.
export function walkerSheet(classId, appearance, skin) {
  const id = `${classId}-${appearance}`;
  return available.walkers.has(id) ? `art/walkers/${toneFile(id, skin)}.png` : null;
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

// Fetches every portrait ahead, so the class cards show them at once.
export function preloadPortraits() {
  for (const id of SPRITES.portraits.ids) {
    const image = new Image();
    image.decoding = 'async';
    image.src = `/art/portraits/${id}.png`;
  }
}

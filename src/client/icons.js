// Line icons on a 24×24 grid, drawn for this game (the ones from the
// character screen mockup included). Each icon is a list of SVG shapes.

const path = (d) => ['path', { d }];
const circle = (cx, cy, r) => ['circle', { cx, cy, r }];
// A solid shape, e.g. the sand in the hourglass.
const solid = (d) => ['path', { d, fill: 'currentColor' }];

export const ICONS = {
  unknown: [circle(12, 12, 8)],

  // Navigation
  person: [circle(12, 7.5, 3.5), path('M5 21c0-4.2 3.1-7.5 7-7.5s7 3.3 7 7.5')],
  // Społeczność: two figures side by side.
  people: [circle(9, 8, 3.2), path('M3 20.5c0-3.8 2.7-6.8 6-6.8s6 3 6 6.8'), circle(16.5, 9, 2.6), path('M15.2 14.1c.4-.1.9-.2 1.3-.2 2.5 0 4.5 2.6 4.5 5.8')],
  swords: [
    path('M4 4l10.5 10.5M20 4L9.5 14.5'),
    path('M4 4h3.5M4 4v3.5M20 4h-3.5M20 4v3.5'),
    path('M12.5 16.5l4 4M11.5 16.5l-4 4M14 13l3 3M10 13l-3 3'),
  ],
  leaf: [path('M5 19C5 10.5 10 5 19 5c0 9-5.5 14-14 14z'), path('M5 19l8-8')],
  house: [path('M3 11l9-7 9 7'), path('M5.5 9.5V20h13V9.5'), path('M10 20v-6h4v6')],
  book: [path('M4 5.5c3-1.2 6-1 8 .8 2-1.8 5-2 8-.8v13.4c-3-1.2-6-1-8 .8-2-1.8-5-2-8-.8z'), path('M12 6.3v14')],
  back: [path('M15 5l-7 7 7 7')],
  stats: [path('M5 20V11M12 20V4M19 20v-7')],
  skills: [path('M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z')],
  core: [path('M12 2l8 4.5v11L12 22l-8-4.5v-11z'), path('M12 7l4 2.5v5L12 17l-4-2.5v-5z')],

  // Interface
  gear: [
    circle(12, 12, 3),
    circle(12, 12, 7),
    path('M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1'),
  ],
  coin: [circle(12, 12, 8), circle(12, 12, 4)],
  eye: [path('M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z'), circle(12, 12, 3)],
  'eye-off': [path('M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z'), circle(12, 12, 3), path('M3 3l18 18')],
  lock: [['rect', { x: 5, y: 11, width: 14, height: 10, rx: 1 }], path('M8 11V8a4 4 0 0 1 8 0v3')],
  plus: [path('M12 5v14M5 12h14')],
  minus: [path('M5 12h14')],
  close: [path('M6 6l12 12M18 6L6 18')],
  // Straight glass narrowing to the neck, with sand above and below.
  hourglass: [
    path('M6 3h12M6 21h12'),
    path('M8 3v3.5L12 12l-4 5.5V21M16 3v3.5L12 12l4 5.5V21'),
    solid('M10.2 8h3.6L12 10.4z'),
    solid('M9.5 20h5L12 17.2z'),
  ],
  chevron: [path('M9 5l7 7-7 7')],
  // The Społeczność's list: the chat, the Ranking, the Gildie, the Upominek
  // and the chat's light muted.
  chat: [path('M4 5h16v11H10l-6 4.5z'), path('M8 9h8M8 12.5h5')],
  trophy: [path('M8 3.5h8V9a4 4 0 0 1-8 0z'), path('M8 5.5H4.5c0 3 1.5 4.8 3.7 5M16 5.5h3.5c0 3-1.5 4.8-3.7 5'), path('M12 13v3.5M9 20.5h6M10 16.5h4v4h-4z')],
  banner: [path('M6 21V3'), path('M6 4h12l-3 4 3 4H6')],
  gift: [['rect', { x: 4, y: 10.5, width: 16, height: 10, rx: 1 }], path('M3 7h18v3.5H3z'), path('M12 7v13.5'), path('M12 7c-1.5-3.5-5.5-4.2-5.5-1.6C6.5 7 10 7 12 7zM12 7c1.5-3.5 5.5-4.2 5.5-1.6C17.5 7 14 7 12 7z')],
  bell: [path('M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z'), path('M10 20.5a2 2 0 0 0 4 0')],
  'bell-off': [path('M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z'), path('M10 20.5a2 2 0 0 0 4 0'), path('M3.5 3.5l17 17')],
  tent: [path('M2.5 20L12 4l9.5 16'), path('M2.5 20h19'), path('M9 20l3-6 3 6'), path('M12 4l1.5-2')],
  hammer: [path('M13 4.5l6.5 6.5-2.5 2.5L10.5 7z'), path('M12 9L4 17l3 3 8-8')],
  // A tied pouch: the materials and parts of the Stół rozbiórki.
  pouch: [
    path('M9.5 7.5L8 4h8l-1.5 3.5'),
    path('M8.5 7.5h7'),
    path('M9.5 7.5C6 9.5 4 13 4 16.5 4 19.5 7 21 12 21s8-1.5 8-4.5c0-3.5-2-7-5.5-9'),
    path('M12 7.5v2.5'),
  ],
  // A phone with an arrow into it: install as an app.
  install: [['rect', { x: 6, y: 2.5, width: 12, height: 19, rx: 2 }], path('M12 6.5v8M8.8 11.5l3.2 3.2 3.2-3.2'), path('M10.5 18.5h3')],

  // Camp resources (gold has the coin)
  logs: [circle(7.5, 16, 3.5), circle(16.5, 16, 3.5), circle(12, 8.5, 3.5), circle(12, 8.5, 1), circle(7.5, 16, 1), circle(16.5, 16, 1)],
  stone: [path('M3.5 18.5l2.5-7 5.5-5 6 2.5 3 6-1.5 3.5z'), path('M6 11.5l5 3.5 9-0.5')],
  ore: [path('M3.5 18.5l2.5-7 5.5-5 6 2.5 3 6-1.5 3.5z'), circle(10, 12.5, 1.2), circle(14.5, 10, 1.2), circle(13.5, 15.5, 1.2)],

  // Equipment slots
  head: [path('M4 16c0-5 3.6-9 8-9s8 4 8 9'), path('M4 16h16v3H4z'), path('M12 7V4')],
  amulet: [path('M6 3c0 6 3 9 6 9s6-3 6-9'), circle(12, 16, 4)],
  chest: [path('M8 3l4 3 4-3 4 3-2 5v10H6V11L4 6z'), path('M12 6v15')],
  hands: [path('M7 21v-6L5 10l2-1 2 3V6a1.5 1.5 0 0 1 3 0v4V5a1.5 1.5 0 0 1 3 0v5V7a1.5 1.5 0 0 1 3 0v8l-2 6z')],
  feet: [path('M8 3h5v10l6 3a2 2 0 0 1 1 2v2H6v-5z'), path('M6 20h14')],
  weapon: [path('M18 3h3v3L10.5 16.5l-3-3z'), path('M5.5 12.5l6 6'), path('M7 17l-3.5 3.5')],
  offhand: [path('M12 3l7 3v5c0 5-3 8.2-7 10-4-1.8-7-5-7-10V6z')],
  ring: [circle(12, 14, 6), path('M9 6l3-3 3 3-3 3z')],
  talisman: [path('M12 21c-5-4-7-9-4-15 1 3 4 4 4 4s3-1 4-4c3 6 1 11-4 15z'), path('M12 10v9')],

  // Item bases that look different from their slot
  sword: [path('M18 3h3v3L10.5 16.5l-3-3z'), path('M5.5 12.5l6 6'), path('M7 17l-3.5 3.5')],
  axe: [path('M4 20L15.5 8.5'), path('M12 6c3-3 6.5-3 8.5-1-1 3.5-3.5 5.5-6.5 6.5z')],
  dagger: [path('M16 4h4v4l-6 6-4-4z'), path('M8 12l4 4'), path('M9.5 14.5L5 19')],
  bow: [path('M6 3c8 3 8 15 0 18'), path('M6 3v18'), path('M6 12h14M17 9l3 3-3 3')],
  staff: [path('M5 21L16.5 7.5'), circle(18, 5.5, 2.5), path('M14.5 3l-1-1M22 9l-1-1')],
  aspergillum: [path('M4.5 19.5l8.5-8.5'), circle(16.5, 7.5, 4), path('M15 6h.01M18 7.5h.01M16 9.5h.01')],
  shield: [path('M12 3l7 3v5c0 5-3 8.2-7 10-4-1.8-7-5-7-10V6z')],
  quiver: [path('M8 8h8l-1 13H9z'), path('M10 8V3M12 8V2M14 8V3')],
  focus: [path('M12 3l5 6-5 12-5-12z'), path('M7 9h10')],
  hood: [path('M5 20c0-8 3-15 7-15s7 7 7 15'), path('M9 20c0-4 1.3-7 3-7s3 3 3 7')],

  // Monster families
  beast: [circle(7.5, 8.5, 1.8), circle(12, 6, 1.8), circle(16.5, 8.5, 1.8), path('M7 16.5c0-3 2.4-5 5-5s5 2 5 5c0 2-2 3-5 3s-5-1-5-3z')],
  bird: [path('M3 12.5c4-1 6.5-4.5 9.5-4.5 3.5 0 5.5 2.5 8.5 2.5-2 2.5-4.5 3.5-7.5 3.5l-3 5-1-5c-3 0-5-.5-6.5-1.5z')],
  snake: [path('M5 18.5c2.5 2 7 1.5 7.5-1.5S8 13 8.5 10s5.5-3.5 7-1.5'), path('M15.5 8.5c1-2 3.5-2.5 4.5-1')],
  spider: [circle(12, 14, 3), circle(12, 8.5, 2), path('M9.3 12.5L4 9M9 14.5H3M9.5 16.5L5 20M14.7 12.5L20 9M15 14.5h6M14.5 16.5L19 20')],
  spirit: [path('M12 3c3 4 6 6.5 6 10.5a6 6 0 0 1-12 0c0-2.2 1-3.5 2-4.5 0 2 1 3 2 3 0-3 0-6 2-9z')],
  flask: [path('M10 3h4M10.5 3v5L6 17a2.6 2.6 0 0 0 2.3 4h7.4a2.6 2.6 0 0 0 2.3-4l-4.5-9V3'), path('M7.6 14h8.8')],
  insect: [
    path('M12 8.5c1.9 0 3 1.6 3 4.5s-1.1 6-3 6-3-3.1-3-6 1.1-4.5 3-4.5z'),
    path('M9.3 12.5h5.4M9.4 15.5h5.2'),
    path('M11 8.6C9 6 6 5.5 4.5 7s.5 3.5 4.7 3.6M13 8.6C15 6 18 5.5 19.5 7s-.5 3.5-4.7 3.6'),
    circle(12, 6.5, 1.5),
  ],
};

export const SLOT_ICONS = {
  head: 'head',
  amulet: 'amulet',
  chest: 'chest',
  hands: 'hands',
  feet: 'feet',
  weapon: 'weapon',
  offhand: 'offhand',
  ring: 'ring',
  talisman: 'talisman',
  core: 'core',
};

export const CLASS_ICONS = {
  warrior: 'sword',
  archer: 'bow',
  mage: 'staff',
  cleric: 'aspergillum',
  shadow: 'dagger',
};

// The icon of an item: its base when it has its own, otherwise its slot.
export const itemIcon = (item) => (ICONS[item.base] ? item.base : SLOT_ICONS[item.slot] ?? 'unknown');

export const RESOURCE_ICONS = {
  gold: 'coin',
  wood: 'logs',
  stone: 'stone',
  'iron-ore': 'ore',
};

// Punkty Systemu, the premium currency of the account.
export const SYSTEM_POINTS_ICON = 'core';

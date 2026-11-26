// Statystyki liczone jako inna (DECISIONS.md, 26.11.2026) on just enough of
// a page (helpers/narrator-page.js): where the character's form counts a
// stat as another (`countsAs` and `counted` on its stats, `propertiesAs` on
// its items, from the server), the Statystyki say that each point of the
// stat counts as the other, how many points from where, and on the other
// how many of its points are that stat's; the item card and the comparison
// with the worn item name the other stat beside the stat's lines; the
// Parametry dodatkowe name the stat the dodge and the speed come from. A
// character whose form counts nothing as another sees the screens as
// before. The names are made up.

import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';

import { narratorPage } from './helpers/narrator-page.js';

const page = narratorPage();
let state;
let mountStats;
let itemDetails;
let compareTable;
before(async () => {
  await page.ready;
  ({ state } = page);
  state.content = { ...state.content, unlocks: [{ id: 'professions', level: 10 }], classEvolutionLevels: [50, 100, 200, 300, 400] };
  ({ mountStats } = await import('../src/client/screens/stats.js'));
  ({ itemDetails, compareTable } = await import('../src/client/screens/character.js'));
});

const sources = (values) => ({ class: 0, character: 0, professions: 0, equipment: 0, core: 0, ...values });

// A Wielki Inkwizytor as the server shows it, its Intelekt counted as Siła
// (`counting`) or, as a form without `as` would have it, not.
function character(counting) {
  return {
    id: 1,
    name: 'Gromislaw',
    level: 110,
    xp: 10,
    xpToNext: 1000,
    hoursToNext: 2,
    className: 'Wielki Inkwizytor',
    classLevel: 110,
    classXp: 5,
    classXpToNext: 900,
    features: ['stats', 'professions'],
    freePoints: 0,
    activity: null,
    canResetPoints: false,
    professions: null,
    skills: null,
    evolution: { current: 'grand-inquisitor' },
    stats: [
      {
        id: 'strength',
        name: 'Siła',
        effect: 'Obrażenia bronią ciężką.',
        total: 980,
        sources: sources({ class: 158, character: 427, professions: 65, equipment: 309, core: 21 }),
        gives: { damage: 0.92 },
        ...(counting && { counted: [{ id: 'intellect', name: 'Intelekt', total: 594 }] }),
      },
      {
        id: 'intellect',
        name: 'Intelekt',
        effect: 'Moc zaklęć i broni magicznej.',
        total: 0,
        sources: sources({}),
        gives: {},
        ...(counting && { countsAs: { id: 'strength', name: 'Siła', total: 594, sources: { class: 12, character: 400, professions: 20, equipment: 162 } } }),
      },
      { id: 'vitality', name: 'Witalność', effect: 'Maksymalne HP.', total: 300, sources: sources({ class: 300 }), gives: { maxHp: 1500 } },
    ],
    combat: { damage: '10–20', damageKind: 'fizyczne', reduction: 10, maxHp: 1000, maxMana: 100, perClassLevel: { hp: 10, mana: 2 }, extra: null },
    equipment: {},
    bag: [],
  };
}

const withClass = (node, name) => node.find((one) => one.classList.contains(name));

// The Statystyki of `view`, with the rows of `open` unfolded: for each
// stat, its effect line and its detail's lines.
function statsScreen(view, open = []) {
  state.character = view;
  const screen = globalThis.document.createElement('main');
  mountStats(screen);
  for (const id of open) {
    const row = withClass(screen, 'stat-row').find((one) => withClass(one, 'stat-name')[0].textContent === view.stats.find((stat) => stat.id === id).name);
    withClass(row, 'stat-main')[0].click();
  }
  return Object.fromEntries(
    withClass(screen, 'stat-row').map((row) => [
      withClass(row, 'stat-name')[0].textContent,
      { effect: withClass(row, 'stat-effect')[0].textContent, detail: withClass(row, 'stat-detail').flatMap((detail) => detail.children.filter((node) => node.tagName === 'P').map((node) => node.textContent)) },
    ]),
  );
}

describe('Statystyki liczone jako inna on the page', () => {
  test('the stat counted as another says so, and how many of its points went where; the other how many of its points are that stat\'s', () => {
    const rows = statsScreen(character(true), ['intellect', 'strength']);
    assert.equal(rows.Intelekt.effect, 'Każdy punkt liczy się u Ciebie jako Siła.');
    assert.deepEqual(rows.Intelekt.detail, ['Intelekt 594 liczy się u Ciebie jako Siła:', 'klasa 12 · postać 400 · profesje 20 · ekwipunek 162']);
    assert.equal(rows.Siła.effect, 'Obrażenia bronią ciężką.');
    assert.deepEqual(rows.Siła.detail.slice(1), ['klasa 158 · postać 427 · profesje 65 · ekwipunek 309', 'w tym Intelekt: 594']);
    assert.equal(rows.Witalność.effect, 'Maksymalne HP.');
  });

  test('a form that counts nothing as another sees the stats as before', () => {
    const rows = statsScreen(character(false), ['intellect', 'strength']);
    assert.equal(rows.Intelekt.effect, 'Moc zaklęć i broni magicznej.');
    assert.deepEqual(rows.Intelekt.detail, ['Intelekt nie zmienia dziś Twoich wartości bojowych.', 'klasa 0 · postać 0 · profesje 0 · ekwipunek 0']);
    assert.deepEqual(rows.Siła.detail.slice(1), ['klasa 158 · postać 427 · profesje 65 · ekwipunek 309']);
  });

  test('the Parametry dodatkowe name the stat the dodge and the speed come from: Intelekt for a form that counts Zręczność as Intelekt, Zręczność for the others', () => {
    // The game's one sheet (index.html's #sheet), found as the page finds it.
    const dialog = globalThis.document.createElement('dialog');
    page.places.set('#sheet', [dialog]);
    globalThis.HTMLElement ??= globalThis.Node;
    const extra = {
      level: 110,
      armor: { total: 500, equipment: 400, endurance: 100, trait: null, core: 0, reduction: 0.2 },
      dodge: { chance: 0.12, rating: 456, cap: 0.5, core: 0 },
      crit: { chance: 0.1, rating: 300, cap: 0.5, multiplier: 1.5, core: 0 },
      effectResist: { chance: 0.1, rating: 200, cap: 0.5, core: 0 },
      speed: 1.5,
      speedCore: 0,
      regen: 12,
      recovery: 0.3,
      recoveryCore: 0,
      resist: [],
      side: null,
      potions: { bonus: 0, wisdom: 0, rule: null },
    };
    const notes = (view) => {
      state.character = { ...view, combat: { ...view.combat, extra } };
      const screen = globalThis.document.createElement('main');
      mountStats(screen);
      withClass(screen, 'combat-extra')[0].click();
      return withClass(dialog, 'extra-note').map((node) => node.textContent);
    };
    // A Nekromanta's Zręczność, counted as Intelekt.
    const dexterity = { id: 'dexterity', name: 'Zręczność', effect: 'Unik.', total: 0, sources: sources({}), gives: {}, countsAs: { id: 'intellect', name: 'Intelekt', total: 300, sources: { class: 300, character: 0, professions: 0, equipment: 0 } } };
    const necromancer = notes({ ...character(false), stats: [...character(false).stats, dexterity] });
    assert.ok(necromancer.includes('ocena 456 (Intelekt), najwyżej 50%'), necromancer.join(' | '));
    assert.ok(necromancer.includes('im wyższa, tym częściej postać rusza się w walce (Intelekt)'));
    const inquisitor = notes(character(true));
    assert.ok(inquisitor.includes('ocena 456 (Zręczność), najwyżej 50%'), inquisitor.join(' | '));
    assert.ok(inquisitor.includes('im wyższa, tym częściej postać rusza się w walce (Zręczność)'));
    page.places.delete('#sheet');
  });

  // A helmet of the character's, as the server shows it: with `propertiesAs`
  // for a form that counts its Intelekt as Siła, with a gem or without.
  const helmet = (counting, gem = false) => ({
    id: 7,
    name: 'Hełm z przyłbicą',
    base: 'visored-helmet',
    color: '#b06cff',
    rarityName: 'epicki',
    slotName: 'Hełm',
    level: 80,
    upgrade: 0,
    properties: ['Pancerz: +321', 'Intelekt: +81', 'Intelekt: +40', 'Witalność: +23'],
    ...(gem && {
      gem: { id: 'agate', name: 'Agat', color: '#3fbf5f', line: 'Agat: +10% liczb przedmiotu', help: 'Kamień oprawiony w Jubilerstwie.' },
      gemProperties: [
        { text: 'Pancerz: +292', gem: '+321', rest: '' },
        { text: 'Intelekt: +70', gem: '+81', rest: '' },
        { text: 'Intelekt: +35', gem: '+40', rest: '' },
        { text: 'Witalność: +20', gem: '+23', rest: '' },
      ],
    }),
    ...(counting && { propertiesAs: [null, 'Siła', 'Siła', null] }),
    lines: [
      { id: 'armor', label: 'Pancerz', value: 321, text: '+321' },
      { id: 'intellect', label: 'Intelekt', value: 121, text: '+121' },
      { id: 'vitality', label: 'Witalność', value: 23, text: '+23' },
    ],
  });
  const propertyTexts = (item) =>
    withClass(itemDetails(item), 'item-properties')[0]
      .children.filter((node) => !node.className)
      .map((node) => node.textContent);

  test("the item card names Siła beside each Intelekt line of the character's item, with the gem's numbers too", () => {
    state.character = character(true);
    assert.deepEqual(propertyTexts(helmet(true)), ['Pancerz: +321', 'Intelekt: +81, u Ciebie jako Siła', 'Intelekt: +40, u Ciebie jako Siła', 'Witalność: +23']);
    assert.deepEqual(propertyTexts(helmet(true, true)), ['Pancerz: +292 (+321)', 'Intelekt: +70 (+81), u Ciebie jako Siła', 'Intelekt: +35 (+40), u Ciebie jako Siła', 'Witalność: +20 (+23)']);
    // Without `propertiesAs` (a form without `as`, another player's item):
    // the lines as before.
    assert.deepEqual(propertyTexts(helmet(false, true)), ['Pancerz: +292 (+321)', 'Intelekt: +70 (+81)', 'Intelekt: +35 (+40)', 'Witalność: +20 (+23)']);
  });

  test("the comparison with the worn item names Siła under Intelekt for the character, never for a companion's gear nor a form without `as`", () => {
    const worn = { ...helmet(false), name: 'Hełm', level: 60, lines: [{ id: 'intellect', label: 'Intelekt', value: 80, text: '+80' }] };
    const rowNames = (table) => table.find((node) => node.tagName === 'TH' && node.getAttribute('scope') === 'row').map((node) => node.textContent);
    state.character = character(true);
    assert.deepEqual(rowNames(compareTable(helmet(true), worn)), ['Pancerz', 'Intelekt u Ciebie jako Siła', 'Witalność']);
    assert.deepEqual(rowNames(compareTable(helmet(true), worn, { wornLabel: 'Nosi', counted: {} })), ['Pancerz', 'Intelekt', 'Witalność']);
    state.character = character(false);
    assert.deepEqual(rowNames(compareTable(helmet(false), worn)), ['Pancerz', 'Intelekt', 'Witalność']);
  });
});

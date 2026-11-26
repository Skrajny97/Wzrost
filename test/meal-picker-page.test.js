// The meal in the Walka's "Opcje wyprawy" (screens/combat.js, mealPicker),
// on just enough of a page (helpers/narrator-page.js): a dish picked starts
// at the most portions that can be eaten now, as many as the Spiżarnia has
// and the meal at work has room for, up to 3, or at as many as the player
// last chose, remembered in this browser beside the dish (the author,
// 24.11.2026: „Automatyczne jedzenie w drużynie i w ogóle trzeba ustawić
// tak mogło jeść 3 te same posiłki na raz nie tylko jeden”); "Wyrusz" eats
// them. The same picker serves a Drużyna's leader.

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { narratorPage, settled } from './helpers/narrator-page.js';

const page = narratorPage();
const area = { id: 'windfalls-edge', name: 'Skraj Wiatrołomów', minLevel: 1, maxLevel: 5, unlockClassLevel: 1, description: 'Polana.', dangers: [] };
const region = { id: 'windfalls', name: 'Wiatrołomy', minLevel: 1, maxLevel: 10, areas: [area] };
// What this browser keeps for the character, under its id (state.js,
// keptChoice).
const ID = 7;
const MEAL_KEY = `wzrost.meal-choice.${ID}`;
const PORTIONS_KEY = `wzrost.meal-portions.${ID}`;
// A dish of the Spiżarnia as the server shows it (bagPantry): its meals of
// one to three portions.
const dish = (id, name, count) => ({
  id,
  group: 'dish',
  name,
  count,
  bonus: '+12% XP z wyprawy',
  stacks: [1, 2, 3].map((portions) => ({ name: portions > 1 ? `${name} ×${portions}` : name, bonus: `+${12 * portions}% XP z wyprawy` })),
});

let state;
// What this browser keeps, and what the page asked the server for.
let stored;
let sent = [];
let kept;
before(async () => {
  await page.ready;
  ({ state } = page);
  kept = { fetch: globalThis.fetch, content: state.content, user: state.user, history: globalThis.history, localStorage: globalThis.localStorage };
  state.content = { ...state.content, regions: [region], resources: [], lengths: [{ upTo: 30, name: 'krótka' }, { name: 'długa' }] };
  state.user = { testMode: false };
  // After "Wyrusz" the Walka goes back to the lands.
  globalThis.history = { state: null, go() {}, pushState() {} };
  globalThis.location.replace = () => {};
  globalThis.localStorage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, String(value)),
    removeItem: (key) => stored.delete(key),
  };
  globalThis.fetch = async (path, options = {}) => {
    const url = String(path);
    sent.push({ method: options.method ?? 'GET', path: url, body: options.body ? JSON.parse(options.body) : null });
    const answer = url.startsWith('/api/hunts/options')
      ? { areas: [{ id: area.id, threat: { 5: 'low', 15: 'low', 30: 'low' }, threatAvoiding: { 5: 'low', 15: 'low', 30: 'low' }, threatSeeking: { 5: 'low', 15: 'low', 30: 'low' } }] }
      : {};
    return new Response(JSON.stringify(answer), { status: 200 });
  };
});
after(() => {
  globalThis.fetch = kept.fetch;
  globalThis.localStorage = kept.localStorage;
  state.content = kept.content;
  state.user = kept.user;
  if (kept.history === undefined) delete globalThis.history;
  else globalThis.history = kept.history;
});
beforeEach(() => {
  sent = [];
  stored = new Map([
    ['insight.motion', 'off'],
    ['insight.narratorVoice', 'off'],
  ]);
});

// A character of level 30 at home, with these dishes and this meal at work.
function character(pantry, meal = null) {
  return {
    id: ID,
    name: 'Próbna',
    level: 30,
    classLevel: 30,
    xp: 100,
    tutorial: null,
    features: [],
    hp: 100,
    maxHp: 100,
    regen: null,
    timePoints: 0,
    timePointsGain: { since: Date.now(), minutes: 30 },
    stats: [],
    equipment: {},
    bag: [],
    skills: [],
    buffs: [],
    activity: null,
    huntDurations: [5, 15, 30],
    huntNext: null,
    mount: null,
    mercenaries: null,
    quickHunts: null,
    wanted: null,
    pantry,
    meal,
  };
}

// The place on the Walka screen, its meal picker drawn.
async function place(pantry, meal) {
  state.character = character(pantry, meal);
  const { mountCombat } = await import('../src/client/screens/combat.js');
  const screen = globalThis.document.createElement('main');
  globalThis.document.body.append(screen);
  const view = mountCombat(screen, { params: { region: region.id, area: area.id }, navigate() {} });
  await settled();
  const [picker] = screen.find((node) => node.classList.contains('meal-picker'));
  assert.ok(picker, 'the meal picker');
  const labelled = (label) => picker.find((node) => node.getAttribute('aria-label') === label)[0];
  const row = picker.find((node) => node.classList.contains('potion-pick'))[0];
  return {
    // What the picker shows: the meal picked, and its portions' row.
    meal: () => picker.find((node) => node.classList.contains('potion-kind-current'))[0].textContent,
    portions: () => (row.hidden ? null : row.find((node) => node.tagName === 'OUTPUT')[0].textContent),
    less: () => labelled('Porcje: mniej').click(),
    more: () => labelled('Porcje: więcej').click(),
    // The list's choices, and picking one by its first words.
    choices: () => picker.find((node) => node.classList.contains('potion-kind-option')).map((node) => node.textContent),
    pick: async (start) => {
      picker.find((node) => node.classList.contains('potion-kind-option') && node.textContent.startsWith(start))[0].click();
      await settled();
    },
    // "Wyrusz": the exploration's request.
    setOut: async () => {
      screen.find((node) => node.tagName === 'BUTTON' && node.getAttribute('data-guide') === 'start')[0].click();
      await settled();
      return sent.find((one) => one.method === 'POST')?.body;
    },
    unmount() {
      view.unmount?.();
      screen.remove();
    },
  };
}

describe('the meal in "Opcje wyprawy"', () => {
  test('the dish remembered starts at the most portions at once, 3, and "Wyrusz" eats them', async () => {
    stored.set(MEAL_KEY, 'zurek');
    const shown = await place([dish('zurek', 'Żurek', 5), dish('pea-soup', 'Grochówka', 1)]);
    assert.equal(shown.portions(), '3 z 3');
    assert.ok(shown.meal().startsWith('Żurek ×3 · masz 5'), shown.meal());
    assert.ok(shown.meal().includes('+36% XP z wyprawy'), shown.meal());
    const body = await shown.setOut();
    assert.deepEqual([body?.meal, body?.mealPortions, body?.mealReplaces], ['zurek', 3, null]);
    shown.unmount();
  });

  test('as many as the Spiżarnia has; all of them counts as the most, fewer is remembered', async () => {
    stored.set(MEAL_KEY, 'zurek');
    const shown = await place([dish('zurek', 'Żurek', 2)]);
    assert.equal(shown.portions(), '2 z 2');
    shown.less();
    assert.equal(shown.portions(), '1 z 2');
    assert.equal(stored.get(PORTIONS_KEY), '1');
    shown.more();
    assert.equal(shown.portions(), '2 z 2');
    assert.equal(stored.has(PORTIONS_KEY), false);
    shown.unmount();
    // One left: no row, one eaten.
    const last = await place([dish('zurek', 'Żurek', 1)]);
    assert.equal(last.portions(), null);
    assert.equal((await last.setOut())?.mealPortions, 1);
    last.unmount();
  });

  test('the last choice of portions is remembered beside the dish, for the next time and the next dish', async () => {
    stored.set(MEAL_KEY, 'zurek');
    const first = await place([dish('zurek', 'Żurek', 5), dish('pea-soup', 'Grochówka', 4)]);
    first.less();
    assert.equal(first.portions(), '2 z 3');
    assert.equal(stored.get(PORTIONS_KEY), '2');
    // Another dish picked starts at the same.
    await first.pick('Grochówka');
    assert.equal(stored.get(MEAL_KEY), 'pea-soup');
    assert.equal(first.portions(), '2 z 3');
    first.unmount();
    const again = await place([dish('zurek', 'Żurek', 5), dish('pea-soup', 'Grochówka', 4)]);
    assert.equal(again.portions(), '2 z 3');
    assert.ok(again.meal().startsWith('Grochówka ×2'), again.meal());
    // The list shows each dish with the meal it makes as picked now.
    assert.ok(again.choices().some((choice) => choice.startsWith('Żurek ×2 · masz 5')), again.choices().join(' | '));
    assert.equal((await again.setOut())?.mealPortions, 2);
    again.unmount();
    // Back to the most: none kept, 3 again.
    const most = await place([dish('zurek', 'Żurek', 5), dish('pea-soup', 'Grochówka', 4)]);
    most.more();
    assert.equal(most.portions(), '3 z 3');
    assert.equal(stored.has(PORTIONS_KEY), false);
    most.unmount();
  });

  test('a meal at work stays as it comes; its own dish picked fills what room it has, and that is not remembered', async () => {
    stored.set(MEAL_KEY, 'zurek');
    const meal = { id: 'zurek', name: 'Żurek', bonus: '+12% XP z wyprawy', portions: 1, left: 100, minutes: 240, swap: { title: '', text: '', eat: '', note: '' } };
    const shown = await place([dish('zurek', 'Żurek', 5)], meal);
    assert.ok(shown.meal().startsWith('Posiłek: Żurek'), shown.meal());
    assert.equal(shown.portions(), null);
    await shown.pick('Żurek');
    assert.equal(shown.portions(), '2 z 2');
    assert.ok(shown.meal().startsWith('Żurek ×3 · masz 5'), shown.meal());
    shown.less();
    assert.equal(shown.portions(), '1 z 2');
    assert.equal(stored.has(PORTIONS_KEY), false);
    const body = await shown.setOut();
    assert.deepEqual([body?.meal, body?.mealPortions, body?.mealReplaces], ['zurek', 1, { dish: 'zurek', portions: 1 }]);
    shown.unmount();
  });
});

// A Drużyna member's rubric "Posiłek na wyprawy drużyny" (screens/party.js,
// mealRubric), on just enough of a page (helpers/narrator-page.js): beside
// the dish and „Autouzupełnianie”, its portions at once with −/+, ×1 to ×3
// and ×3 as it comes (the author, 24.11.2026: „Automatyczne jedzenie w
// drużynie i w ogóle trzeba ustawić tak mogło jeść 3 te same posiłki na raz
// nie tylko jeden”), saved with the choice at each change (PUT
// /api/party/meal). The names are synthetic.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import { narratorPage, settled } from './helpers/narrator-page.js';

const page = narratorPage();
const { party: partyData } = JSON.parse(readFileSync(new URL('../data/community.json', import.meta.url), 'utf8'));
const dish = (id, name, count) => ({ id, group: 'dish', name, count, bonus: '+12% XP z wyprawy', stacks: [1, 2, 3].map((portions) => ({ name, bonus: `+${12 * portions}%` })) });
const member = (name, own) => ({ id: own ? 2 : 1, name, own, leader: !own, status: 'free', classId: 'warrior', level: 30, classLevel: 30 });

let state;
let sent = [];
let kept;
// The member's choice as the server keeps it.
let meal;
const view = () => ({
  party: { id: 1, size: 3, members: [member('Przewodniczka', false), member('Druhna', true)], invited: [], limits: null },
  range: { from: 20, to: 40, spread: 10 },
  invites: [],
  unlockLevel: 10,
  companions: null,
  ownCompanions: [],
  potions: null,
  meal,
  mealMost: 3,
});
before(async () => {
  await page.ready;
  ({ state } = page);
  kept = { fetch: globalThis.fetch, content: state.content };
  state.content = { ...state.content, community: { party: { texts: partyData.texts } }, unlocks: [{ id: 'party', level: 10 }] };
  globalThis.fetch = async (path, options = {}) => {
    const url = String(path);
    const body = options.body ? JSON.parse(options.body) : null;
    sent.push({ method: options.method ?? 'GET', path: url, body });
    if (url === '/api/party/meal') meal = body.dish ? { ...body, name: 'Żurek' } : null;
    const answer = url === '/api/friends' ? { friends: [] } : view();
    return new Response(JSON.stringify(answer), { status: 200 });
  };
});
after(() => {
  globalThis.fetch = kept.fetch;
  state.content = kept.content;
});
beforeEach(() => {
  sent = [];
  globalThis.document.body.replaceChildren();
});

// The Drużyna of a member of level 30 with Żurek in its Spiżarnia. The
// list and the box read as a browser shows them: the dish chosen, the box
// as kept (the page's plain nodes keep no such state of their own).
async function partyScreen() {
  state.character = { name: 'Druhna', level: 30, classLevel: 30, features: ['party'], pantry: [dish('zurek', 'Żurek', 5)], potions: [], huntDurations: [5, 15, 30] };
  const { mountParty } = await import('../src/client/screens/party.js');
  const screen = globalThis.document.createElement('main');
  globalThis.document.body.append(screen);
  const shown = mountParty(screen);
  await settled();
  const one = (match) => screen.find(match)[0];
  const select = () => one((node) => node.getAttribute('id') === 'party-meal-dish');
  const box = () => one((node) => node.getAttribute('id') === 'party-meal-auto');
  const asShown = () => {
    select().value = meal?.dish ?? '';
    box().checked = Boolean(meal?.auto);
  };
  asShown();
  return {
    portions: () => one((node) => node.getAttribute('id') === 'party-meal-portions')?.textContent,
    less: () => one((node) => node.getAttribute('aria-label') === 'Porcje: mniej'),
    more: () => one((node) => node.getAttribute('aria-label') === 'Porcje: więcej'),
    box,
    // A dish chosen from the list, or a tap, and the rubric drawn anew from
    // the server's answer.
    pick: async (id) => {
      const list = select();
      list.value = id;
      list.dispatchEvent({ type: 'change', currentTarget: list });
      await settled();
      asShown();
    },
    tap: async (button) => {
      button.click();
      await settled();
      asShown();
    },
    saved: () => sent.filter((one) => one.path === '/api/party/meal').map((one) => one.body),
    unmount() {
      shown.unmount();
      screen.remove();
    },
  };
}

describe('a member\'s meal for the party\'s trips', () => {
  test('×3 as it comes; a dish chosen is saved with it, and −/+ saves ×1 to ×3', async () => {
    meal = null;
    const shown = await partyScreen();
    assert.equal(shown.portions(), '×3');
    // Nothing chosen yet: nothing to step.
    assert.equal(shown.less().disabled, true);
    assert.equal(shown.more().disabled, true);
    await shown.pick('zurek');
    assert.deepEqual(shown.saved(), [{ dish: 'zurek', auto: false, portions: 3 }]);
    assert.equal(shown.portions(), '×3');
    assert.equal(shown.more().disabled, true);
    await shown.tap(shown.less());
    assert.equal(shown.portions(), '×2');
    await shown.tap(shown.less());
    assert.equal(shown.portions(), '×1');
    assert.equal(shown.less().disabled, true);
    await shown.tap(shown.more());
    assert.deepEqual(shown.saved().slice(1), [
      { dish: 'zurek', auto: false, portions: 2 },
      { dish: 'zurek', auto: false, portions: 1 },
      { dish: 'zurek', auto: false, portions: 2 },
    ]);
    assert.equal(shown.portions(), '×2');
    shown.unmount();
  });

  test('a choice kept shows its portions, and the box keeps them', async () => {
    meal = { dish: 'zurek', auto: false, portions: 1, name: 'Żurek' };
    const shown = await partyScreen();
    assert.equal(shown.portions(), '×1');
    const box = shown.box();
    box.checked = true;
    box.dispatchEvent({ type: 'change' });
    await settled();
    assert.deepEqual(shown.saved(), [{ dish: 'zurek', auto: true, portions: 1 }]);
    assert.equal(shown.portions(), '×1');
    shown.unmount();
  });
});

// The choices of an exploration are each character's own (state.js,
// keptChoice; DECISIONS.md, „Ustawienia wyprawy osobno dla każdej postaci”,
// 26.11.2026), on just enough of a page (helpers/narrator-page.js). Gracz:
// „Przenosi ustawienia trudności jak przejdziesz między swoimi postaciami
// na koncie, przez co możesz np. przez przypadek na wysokim poziomie
// wrzucić sobie Piekielny, który farmiłeś na innej postaci na niskim
// poziomie”. The account plays another of its characters as the game does
// (app.js, characterGone): the screen goes, the new character comes, the
// screen comes again. It finds its own Trudna or Piekielna wyprawa, boxes,
// length, meal and potions, or none, on the place's screen and in "Wyrusz
// ponownie"; what the device kept for all its characters before goes to
// the one played first. The names are synthetic.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import { narratorPage, settled } from './helpers/narrator-page.js';

const page = narratorPage();
const data = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
const { challenge, hunt } = data('balance');
const { potionUse } = data('professions');
const area = { id: 'windfalls-edge', name: 'Skraj Wiatrołomów', minLevel: 1, maxLevel: 5, unlockClassLevel: 1, description: 'Polana.', dangers: [] };
const region = { id: 'windfalls', name: 'Wiatrołomy', minLevel: 1, maxLevel: 10, areas: [area] };
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
// A potion of the bag as the server shows it (bagPotions).
const potion = (id, name, fight, amount, count) => ({ id, name, count, fight, amount, cures: null, carry: null, usable: true });

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
    const threat = { 5: 'low', 15: 'low', 30: 'low' };
    const answer = url.startsWith('/api/hunts/options') ? { areas: [{ id: area.id, threat, threatAvoiding: threat, threatSeeking: threat }] } : {};
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

// A character of the account, of level 30 at home, with the Trudna and the
// Piekielna wyprawa open, potions in its bag and dishes in its Spiżarnia.
// Each test has characters of its own ids, as the page keeps what was
// ticked on it for each character until it is closed.
function character(id, name) {
  return {
    id,
    name,
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
    hardHunt: challenge.hard,
    hellHunt: challenge.hell,
    wanted: null,
    professions: { potionUse: { healBelow: potionUse.healBelow, healBelowChoices: potionUse.healBelowChoices, fightsByMinutes: hunt.fightsByMinutes } },
    potions: [potion('greater-healing', 'Duża mikstura leczenia', 'heal', 0.5, 4), potion('greater-mana', 'Duża mikstura many', 'mana', 0.6, 4)],
    pantry: [dish('zurek', 'Żurek', 5), dish('pea-soup', 'Grochówka', 4)],
    meal: null,
  };
}

// The request the page sent last that starts an exploration.
const started = () => sent.filter((one) => one.method === 'POST').at(-1)?.body;

// The place on the Walka screen of `who`, the character played now.
async function place(who) {
  state.character = who;
  const { mountCombat } = await import('../src/client/screens/combat.js');
  const screen = globalThis.document.createElement('main');
  globalThis.document.body.append(screen);
  const view = mountCombat(screen, { params: { region: region.id, area: area.id }, navigate() {} });
  await settled();
  const byId = (id) => screen.find((node) => node.getAttribute('id') === id)[0];
  const labelled = (label) => screen.find((node) => node.getAttribute('aria-label') === label)[0];
  const [picker] = screen.find((node) => node.classList.contains('meal-picker'));
  return {
    // Whether a box of "Opcje wyprawy" comes ticked.
    ticked: (id) => byId(id).getAttribute('checked') !== null,
    tick(id, on) {
      const box = byId(id);
      box.checked = on;
      box.dispatchEvent({ type: 'change' });
    },
    // The meal picked, and picking one by its first words.
    meal: () => picker.find((node) => node.classList.contains('potion-kind-current'))[0].textContent,
    pickMeal: async (start) => {
      picker.find((node) => node.classList.contains('potion-kind-option') && node.textContent.startsWith(start))[0].click();
      await settled();
    },
    // `times` more potions of a kind ("Leczenie", "Mana").
    morePotions(kind, times) {
      for (let one = 0; one < times; one += 1) labelled(`${kind}: więcej`).click();
    },
    // How long, and a longer exploration.
    minutes: () => screen.find((node) => node.classList.contains('duration-value'))[0].textContent,
    longer: () => labelled('Dłużej').click(),
    // "Wyrusz": the exploration's request.
    setOut: async () => {
      screen.find((node) => node.tagName === 'BUTTON' && node.getAttribute('data-guide') === 'start')[0].click();
      await settled();
      return started();
    },
    unmount() {
      view.unmount?.();
      screen.remove();
    },
  };
}

// "Wyrusz ponownie" on the report of the character played now, of an
// exploration of `minutes` there.
async function setOutAgain(minutes) {
  const { reportCache } = await import('../src/client/state.js');
  const { mountReport } = await import('../src/client/screens/report.js');
  const id = `raport-${sent.length}`;
  reportCache.set(id, {
    kind: 'hunt',
    areaId: area.id,
    areaName: area.name,
    regionId: region.id,
    regionName: region.name,
    minutes,
    startedAt: Date.now() - minutes * 60000,
    endsAt: Date.now(),
    result: 'success',
    resultText: 'Wyprawa udana.',
    summary: { xp: 0, classXp: 0, gold: 0, resources: {}, materials: [], fights: 0, hpStart: 100, hpEnd: 100, maxHp: 100, timePoints: 0, bestFind: null },
    system: [],
    fights: [],
    items: [],
    entries: [],
  });
  state.freshReport = id;
  const screen = globalThis.document.createElement('main');
  globalThis.document.body.append(screen);
  const view = mountReport(screen, { params: { id }, navigate() {} });
  await settled();
  const again = screen.find((node) => node.tagName === 'BUTTON' && node.textContent.startsWith('Wyrusz ponownie:'));
  assert.equal(again.length, 1, screen.textContent);
  again[0].click();
  await settled();
  view.unmount?.();
  screen.remove();
  return started();
}

describe("an exploration's choices after the account plays another character", () => {
  test('carry nothing over: no Piekielna or Trudna wyprawa, no meal, no potions, the length as it comes', async () => {
    const first = await place(character(11, 'Pierwsza'));
    first.tick('hell-hunt', true);
    await first.pickMeal('Żurek');
    first.morePotions('Leczenie', 2);
    first.morePotions('Mana', 1);
    first.tick('track-quests', true);
    first.longer();
    const own = await first.setOut();
    first.unmount();
    assert.deepEqual([own.hell, own.meal, own.mealPortions, own.potions, own.trackQuests, own.minutes], [true, 'zurek', 3, { 'greater-healing': 2, 'greater-mana': 1 }, true, 30]);
    // Another character of the account (app.js, switchCharacter).
    const asked = sent.length;
    const second = await place(character(12, 'Druga'));
    assert.equal(second.ticked('hell-hunt'), false);
    assert.equal(second.ticked('hard-hunt'), false);
    assert.equal(second.ticked('track-quests'), false);
    assert.ok(second.meal().startsWith('Bez posiłku'), second.meal());
    assert.equal(second.minutes(), '15 min');
    // Its threat is asked without the Piekielna and without potions.
    const threats = sent.slice(asked).filter((one) => one.path.startsWith('/api/hunts/options'));
    assert.ok(threats.length > 0);
    for (const one of threats) assert.equal(one.path, `/api/hunts/options?area=${area.id}`);
    const none = await second.setOut();
    second.unmount();
    assert.deepEqual(
      { hell: none.hell, hard: none.hard, meal: none.meal, potions: none.potions, healBelow: none.healBelow, trackQuests: none.trackQuests, minutes: none.minutes },
      { hell: undefined, hard: undefined, meal: undefined, potions: {}, healBelow: potionUse.healBelow, trackQuests: false, minutes: 15 },
    );
    // "Wyrusz ponownie" on its report sends the same.
    assert.deepEqual(await setOutAgain(15), none);
  });

  test("each character keeps its own, on the place's screen and in \"Wyrusz ponownie\"", async () => {
    const one = character(21, 'Pierwsza');
    const two = character(22, 'Druga');
    // The first: the Trudna wyprawa, Żurek and 2 healing potions, 30 minutes.
    let shown = await place(one);
    shown.tick('hard-hunt', true);
    await shown.pickMeal('Żurek');
    shown.morePotions('Leczenie', 2);
    shown.longer();
    const ownFirst = await shown.setOut();
    shown.unmount();
    // The second: the Piekielna, Grochówka, 1 mana potion and the box
    // avoiding the elite, 15 minutes.
    shown = await place(two);
    shown.tick('hell-hunt', true);
    await shown.pickMeal('Grochówka');
    shown.morePotions('Mana', 1);
    shown.tick('avoid-rare', true);
    const ownSecond = await shown.setOut();
    shown.unmount();
    assert.deepEqual(
      [ownFirst.hard, ownFirst.hell, ownFirst.meal, ownFirst.potions, ownFirst.avoidRare, ownFirst.minutes],
      [true, undefined, 'zurek', { 'greater-healing': 2 }, false, 30],
    );
    assert.deepEqual(
      [ownSecond.hard, ownSecond.hell, ownSecond.meal, ownSecond.potions, ownSecond.avoidRare, ownSecond.minutes],
      [undefined, true, 'pea-soup', { 'greater-mana': 1 }, true, 15],
    );
    // Back and forth: each as it left them.
    for (const [who, own] of [
      [one, ownFirst],
      [two, ownSecond],
      [one, ownFirst],
    ]) {
      shown = await place(who);
      assert.equal(shown.ticked('hard-hunt'), Boolean(own.hard), who.name);
      assert.equal(shown.ticked('hell-hunt'), Boolean(own.hell), who.name);
      assert.deepEqual(await shown.setOut(), own, who.name);
      shown.unmount();
      assert.deepEqual(await setOutAgain(own.minutes), own, who.name);
    }
    // Kept on this device under each one's id, none for all of them.
    assert.deepEqual(
      ['wzrost.hard-hunt.21', 'wzrost.hell-hunt.22', 'wzrost.meal-choice.21', 'wzrost.meal-choice.22'].map((key) => stored.get(key)),
      ['on', 'on', 'zurek', 'pea-soup'],
    );
    assert.deepEqual(
      ['wzrost.hard-hunt', 'wzrost.hell-hunt', 'wzrost.meal-choice', 'wzrost.potion-choice', 'wzrost.hunt-choice'].filter((key) => stored.has(key)),
      [],
    );
  });

  test('what the device kept for all its characters before goes to the one played first, and to no other', async () => {
    stored.set('wzrost.hell-hunt', 'on');
    stored.set('wzrost.track-unknown', 'on');
    stored.set('wzrost.meal-choice', 'zurek');
    stored.set('wzrost.meal-portions', '2');
    stored.set('wzrost.potion-choice', JSON.stringify({ picks: { heal: 'greater-healing' }, counts: { heal: 2 }, healBelow: 0.5 }));
    stored.set('wzrost.hunt-choice', JSON.stringify({ [area.id]: 30 }));
    const one = character(31, 'Pierwsza');
    const two = character(32, 'Druga');
    let shown = await place(one);
    assert.equal(shown.ticked('hell-hunt'), true);
    const own = await shown.setOut();
    shown.unmount();
    assert.deepEqual(
      [own.hell, own.trackUnknown, own.meal, own.mealPortions, own.potions, own.healBelow, own.minutes],
      [true, true, 'zurek', 2, { 'greater-healing': 2 }, 0.5, 30],
    );
    // The device's keys are gone, now the first character's own.
    for (const key of ['wzrost.hell-hunt', 'wzrost.track-unknown', 'wzrost.meal-choice', 'wzrost.meal-portions', 'wzrost.potion-choice', 'wzrost.hunt-choice']) {
      assert.equal(stored.has(key), false, key);
      assert.ok(stored.has(`${key}.31`), key);
    }
    // The second has none of them.
    shown = await place(two);
    assert.equal(shown.ticked('hell-hunt'), false);
    assert.ok(shown.meal().startsWith('Bez posiłku'), shown.meal());
    const none = await shown.setOut();
    shown.unmount();
    assert.deepEqual(
      [none.hell, none.trackUnknown, none.meal, none.potions, none.healBelow, none.minutes],
      [undefined, false, undefined, {}, potionUse.healBelow, 15],
    );
    assert.deepEqual(await setOutAgain(15), none);
    // The first keeps them.
    shown = await place(one);
    assert.deepEqual(await shown.setOut(), own);
    shown.unmount();
    assert.deepEqual(await setOutAgain(30), own);
  });
});

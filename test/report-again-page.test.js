// "Wyrusz ponownie" on an exploration's report (screens/report.js) sends
// what "Wyrusz" on the place's screen sends (screens/combat.js), on just
// enough of a page (helpers/narrator-page.js): the dish this browser
// remembers, eaten with its portions, the potions taken along with the
// healing mark, and the boxes, alone and as a Drużyna's leader with its
// party (gracz (poz. 202), 26.11.2026: „Jak jesteś liderem drużyny i
// klikasz powtórz wyprawę, to nie dodaje z automatu jedzenia”). The
// members' own meals and potions the server adds as the party sets out
// (test/party-meal.test.js). The names are synthetic.

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
// What this browser keeps for the character, under its id (state.js,
// keptChoice).
const ID = 7;
const MEAL_KEY = `wzrost.meal-choice.${ID}`;
const PORTIONS_KEY = `wzrost.meal-portions.${ID}`;
const POTION_KEY = `wzrost.potion-choice.${ID}`;
const member = (name, own) => ({ name, own, leader: own, status: 'free' });
// The party the leader sends out, with a member free now.
const leading = { members: [member('Próbna', true), member('Druhna', false)], limits: { minutes: 60, minutesBy: 'Druhna', classLevel: 30, classLevelBy: 'Druhna', mount: { shorter: 0, by: 'Druhna' } } };
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
const potion = (id, name, fight, amount, count) => ({ id, name, count, fight, amount, cures: fight === 'cure' ? 'poisoned' : null, carry: null, usable: true });

let state;
let boxes;
// What this browser keeps, the Drużyna the server answers with, and what
// the page asked the server for.
let stored;
let party = null;
let sent = [];
let kept;
before(async () => {
  await page.ready;
  ({ state } = page);
  boxes = await import('../src/client/state.js');
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
    const answer =
      url === '/api/party/hunt'
        ? { went: ['Druhna'], notes: [] }
        : url.startsWith('/api/party')
          ? { party }
          : url.startsWith('/api/hunts/options')
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
    // Żurek, the most portions at once.
    [MEAL_KEY, 'zurek'],
    // Healing of the strongest kind, as many as the exploration's fights,
    // below half HP, and an antidote.
    [POTION_KEY, JSON.stringify({ potions: { antidote: 1 }, picks: { heal: 'greater-healing' }, counts: { heal: 3 }, healBelow: 0.5 })],
  ]);
  boxes.setHardHunt(false);
  boxes.setHellHunt(false);
  boxes.setAvoidRare(false);
  boxes.setSeekRare(false);
  boxes.setTrackQuests(false);
  boxes.setTrackUnknown(false);
});

// A character of level 30 at home, in a Drużyna or not, with potions in its
// bag and dishes in its Spiżarnia, and this meal at work.
function character({ inParty, meal = null }) {
  return {
    id: ID,
    name: 'Próbna',
    level: 30,
    classLevel: 30,
    xp: 100,
    tutorial: null,
    features: inParty ? ['party'] : [],
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
    potions: [
      potion('greater-healing', 'Duża mikstura leczenia', 'heal', 0.5, 2),
      potion('healing', 'Zwykła mikstura leczenia', 'heal', 0.35, 5),
      potion('greater-mana', 'Duża mikstura many', 'mana', 0.6, 4),
      potion('antidote', 'Odtrutka', 'cure', 1, 2),
    ],
    pantry: [dish('zurek', 'Żurek', 5), dish('pea-soup', 'Grochówka', 2)],
    meal,
  };
}

// The request the page sent last that starts an exploration.
const started = () => sent.filter((one) => one.method === 'POST').at(-1);

// "Wyrusz" on the place's screen for 15 minutes, its "Opcje wyprawy" as
// they come: with "Z drużyną" ticked when the character leads a party.
async function setOut() {
  const { mountCombat } = await import('../src/client/screens/combat.js');
  stored.set(`wzrost.hunt-choice.${ID}`, JSON.stringify({ [area.id]: 15 }));
  const screen = globalThis.document.createElement('main');
  globalThis.document.body.append(screen);
  const view = mountCombat(screen, { params: { region: region.id, area: area.id }, navigate() {} });
  await settled();
  const [start] = screen.find((node) => node.tagName === 'BUTTON' && node.getAttribute('data-guide') === 'start');
  assert.ok(start, 'the button "Wyrusz"');
  start.click();
  await settled();
  view.unmount?.();
  screen.remove();
  return started();
}

// "Wyrusz ponownie" on the report of an exploration of 15 minutes there.
async function setOutAgain(label) {
  const { mountReport } = await import('../src/client/screens/report.js');
  const id = `raport-${sent.length}`;
  boxes.reportCache.set(id, {
    kind: 'hunt',
    areaId: area.id,
    areaName: area.name,
    regionId: region.id,
    regionName: region.name,
    minutes: 15,
    startedAt: Date.now() - 15 * 60000,
    endsAt: Date.now(),
    result: 'success',
    resultText: 'Wyprawa udana.',
    ...(party && { party: party.members.map((one) => one.name) }),
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
  const again = screen.find((node) => node.tagName === 'BUTTON' && node.textContent.startsWith(label));
  assert.equal(again.length, 1, screen.textContent);
  again[0].click();
  await settled();
  view.unmount?.();
  screen.remove();
  return started();
}

describe('"Wyrusz ponownie" sends what "Wyrusz" sends', () => {
  test("a Drużyna's leader: the party sets out again with the leader's meal eaten, its potions and its boxes", async () => {
    party = leading;
    state.character = character({ inParty: true });
    boxes.setHardHunt(true);
    boxes.setTrackQuests(true);
    const first = await setOut();
    assert.equal(first?.path, '/api/party/hunt', JSON.stringify(sent));
    // Żurek ×3 of the leader's Spiżarnia, as "Opcje wyprawy" come.
    assert.deepEqual([first.body.meal, first.body.mealPortions, first.body.mealReplaces], ['zurek', 3, null]);
    // 15 minutes have 3 fights: 2 of the kind picked, 1 of the weaker.
    assert.deepEqual(first.body.potions, { 'greater-healing': 2, healing: 1, antidote: 1 });
    assert.equal(first.body.healBelow, 0.5);
    const again = await setOutAgain('Wyrusz ponownie z drużyną');
    assert.equal(again?.path, '/api/party/hunt', JSON.stringify(sent));
    assert.deepEqual(again.body, first.body);
  });

  test('alone: the same meal, potions and boxes, the portions remembered', async () => {
    party = null;
    state.character = character({ inParty: false });
    stored.set(PORTIONS_KEY, '2');
    boxes.setAvoidRare(true);
    const first = await setOut();
    assert.equal(first?.path, '/api/hunts', JSON.stringify(sent));
    assert.deepEqual([first.body.meal, first.body.mealPortions, first.body.mealReplaces], ['zurek', 2, null]);
    const again = await setOutAgain('Wyrusz ponownie:');
    assert.equal(again?.path, '/api/hunts', JSON.stringify(sent));
    assert.deepEqual(again.body, first.body);
  });

  test('a meal at work goes on as it is, with the party and alone: no dish eaten in its place', async () => {
    const meal = { id: 'pea-soup', name: 'Grochówka', bonus: '+12% XP z wyprawy', portions: 1, left: 100, minutes: 240, swap: { title: '', text: '', eat: '', note: '' } };
    for (const [inParty, label] of [
      [true, 'Wyrusz ponownie z drużyną'],
      [false, 'Wyrusz ponownie:'],
    ]) {
      party = inParty ? leading : null;
      state.character = character({ inParty, meal });
      const first = await setOut();
      assert.equal(first.body.meal, undefined);
      const again = await setOutAgain(label);
      assert.deepEqual(again.body, first.body);
      assert.deepEqual(again.body.potions, { 'greater-healing': 2, healing: 1, antidote: 1 });
    }
  });

  test('without a dish remembered, or with none in the Spiżarnia, nothing is eaten', async () => {
    party = leading;
    stored.delete(MEAL_KEY);
    state.character = character({ inParty: true });
    const first = await setOut();
    assert.equal(first.body.meal, undefined);
    assert.deepEqual((await setOutAgain('Wyrusz ponownie z drużyną')).body, first.body);
    stored.set(MEAL_KEY, 'zurek');
    state.character = { ...character({ inParty: true }), pantry: [dish('pea-soup', 'Grochówka', 2)] };
    const none = await setOut();
    assert.equal(none.body.meal, undefined);
    assert.deepEqual((await setOutAgain('Wyrusz ponownie z drużyną')).body, none.body);
  });
});

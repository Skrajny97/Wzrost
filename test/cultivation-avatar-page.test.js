// The Kultywacja's screen with Awatary Systemu (src/client/cultivation.js;
// DECISIONS.md, „Kultywacja Awatarem (26.11.2026)”), on just enough of a
// page (helpers/narrator-page.js): „Kto medytuje” as the Profesje's „Kto
// pracuje” (Postać, Awatar, Drugi Awatar), the character away shut with the
// note why, the Awatar's share said and its plan's XP shown, the start
// naming the one chosen; nobody free said as on the Profesje; an Awatar's
// meditation under its name, rewound and claimed as its work.

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { cultivationMinutes, cultivationPlan } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { narratorPage, settled } from './helpers/narrator-page.js';

const page = narratorPage();
const SHARE = content.avatar.share;
const levels = { level: 104, xp: 0, classLevel: 124 };
const fresh = { level: 0, xp: 0 };
const lengths = cultivationMinutes(content);
const plan = cultivationPlan(levels, fresh, lengths, content);
const avatarPlan = cultivationPlan(levels, fresh, lengths, content, SHARE);
const base = { level: 0, xp: 0, xpToNext: 240, maxLevel: 100, bonus: 0, perLevel: 0.01, firstMinutes: 240, lastMinutes: 1200, avatarShare: SHARE };
const HOUR = 3600000;

describe("the Kultywacja's screen with Awatary", () => {
  let state;
  let screen;
  let format;
  let kept;
  before(async () => {
    await page.ready;
    ({ state } = page);
    kept = { content: state.content, character: state.character };
    state.content = { ...state.content, unlocks: [{ id: 'cultivation', name: 'Kultywacja', level: 20 }] };
    screen = await import('../src/client/cultivation.js');
    format = await import('../src/client/format.js');
  });
  after(() => {
    state.content = kept.content;
    state.character = kept.character;
  });

  // The Profesje's view of the Awatary: `second` false for one only.
  const avatars = ({ first = null, second = null, two = true } = {}) => ({
    avatar: { owned: true, name: 'Awatar Systemu', activity: first, second: { owned: two, name: 'Drugi Awatar Systemu', activity: second } },
  });
  // The screen for a character of `character`, in the page's body.
  function show(character) {
    state.character = { id: 1, level: 104, classLevel: 124, features: ['cultivation'], activity: null, timePoints: 500, timePointsGain: { since: Date.now(), minutes: 30 }, ...character };
    const container = new globalThis.Node('main');
    globalThis.document.body.replaceChildren(container);
    screen.mountCultivation(container, { navigate() {} });
    return container;
  }
  const byClass = (root, name) => root.find((node) => node.classList.contains(name));
  const picker = (root) => byClass(root, 'worker-picker')[0] ?? null;
  const options = (root) => byClass(picker(root), 'segmented-option').map((button) => ({ button, name: button.textContent, off: button.getAttribute('disabled') !== null, on: button.getAttribute('aria-pressed') === 'true' }));
  const notes = (root) => byClass(picker(root), 'muted').map((node) => node.textContent);
  const gain = (root) => byClass(root, 'cultivation-gain')[0].textContent;
  // The length the slider starts at (no length kept on this page): the
  // shortest that catches the class up, else the longest.
  const startAt = (one) => {
    const enough = one.lengths.findIndex((length) => length.minutes >= one.minutes);
    return enough >= 0 ? enough : one.lengths.length - 1;
  };
  const xpLine = (one, index) => `XP postaci: +${format.formatNumber(one.lengths[index].xp)}`;
  async function start(root) {
    page.sent.length = 0;
    root.find((node) => node.getAttribute('data-guide') === 'cultivation-start')[0].click();
    await settled();
    return page.sent.at(-1);
  }
  const exploring = { kind: 'hunt', areaName: 'Skraj', startedAt: Date.now(), endsAt: Date.now() + HOUR };

  test('the character away: „Kto medytuje” shuts it with the note why, chooses the first Awatar free, says its share and shows its plan', async () => {
    const root = show({ activity: exploring, professions: avatars(), cultivation: { ...base, avatarPlan } });
    assert.deepEqual(
      options(root).map(({ name, off, on }) => [name, off, on]),
      [
        ['Postać', true, false],
        ['Awatar', false, true],
        ['Drugi Awatar', false, false],
      ],
    );
    assert.ok(byClass(picker(root), 'segmented--three').length === 1);
    assert.deepEqual(notes(root), [
      'Postać jest na wyprawie, więc medytować będzie Awatar.',
      'Postać dostaje z medytacji Awatara całe XP Kultywacji i 25% XP postaci, które dałaby jej ta sama medytacja.',
    ]);
    const index = startAt(avatarPlan);
    assert.ok(gain(root).startsWith(xpLine(avatarPlan, index)), gain(root));
    // „Jak to działa?” tells the Awatar may meditate, one at a time.
    assert.ok(root.textContent.includes('Zamiast postaci może medytować Awatar Systemu. Postać jest wtedy wolna, a Awatar nie pracuje w profesjach. Naraz medytuje tylko jeden.'));
    assert.deepEqual(await start(root), { method: 'POST', path: '/api/cultivation', body: { minutes: lengths[index], avatar: true } });
    // The second Awatar chosen: the note names it, and the start too.
    options(root)[2].button.click();
    assert.deepEqual(
      options(root).map(({ on }) => on),
      [false, false, true],
    );
    assert.equal(notes(root)[0], 'Postać jest na wyprawie, więc medytować będzie Drugi Awatar.');
    assert.deepEqual((await start(root)).body, { minutes: lengths[index], avatar: 2 });
  });

  test('the character at home: Postać first, its own plan; an Awatar chosen shows its share of the XP', async () => {
    const root = show({ professions: avatars({ first: { kind: 'minerals', placeName: 'Kopalnia', startedAt: Date.now(), endsAt: Date.now() + HOUR } }), cultivation: { ...base, plan, avatarPlan } });
    assert.deepEqual(
      options(root).map(({ name, off, on }) => [name, off, on]),
      [
        ['Postać', false, true],
        ['Awatar', true, false],
        ['Drugi Awatar', false, false],
      ],
    );
    // The first Awatar at its work, as the Profesje say it.
    assert.deepEqual(notes(root), ['Awatar kopie w Kopalni.']);
    const own = startAt(plan);
    assert.ok(gain(root).startsWith(xpLine(plan, own)), gain(root));
    assert.deepEqual((await start(root)).body, { minutes: lengths[own] });
    options(root)[2].button.click();
    assert.ok(gain(root).startsWith(xpLine(avatarPlan, own)), gain(root));
    assert.ok(avatarPlan.lengths[own].xp < plan.lengths[own].xp);
    assert.deepEqual(notes(root), ['Awatar kopie w Kopalni.', 'Postać dostaje z medytacji Awatara całe XP Kultywacji i 25% XP postaci, które dałaby jej ta sama medytacja.']);
  });

  test('one Awatar is named whole, as on the Profesje; without one there is no choice', async () => {
    let root = show({ professions: avatars({ two: false }), cultivation: { ...base, plan, avatarPlan } });
    assert.deepEqual(
      options(root).map(({ name }) => name),
      ['Postać', 'Awatar Systemu'],
    );
    assert.equal(byClass(picker(root), 'segmented--three').length, 0);
    root = show({ professions: { avatar: { owned: false, activity: null, second: { owned: false, activity: null } } }, cultivation: { ...base, avatarShare: undefined, plan } });
    assert.equal(picker(root), null);
    assert.ok(!root.textContent.includes('Zamiast postaci może medytować Awatar Systemu'));
    assert.deepEqual((await start(root)).body, { minutes: lengths[startAt(plan)] });
  });

  test('nobody free: the character away and both Awatary at work, said as on the Profesje', () => {
    const root = show({
      activity: exploring,
      professions: avatars({ first: { kind: 'minerals', endsAt: Date.now() + HOUR }, second: { kind: 'fish', endsAt: Date.now() - 5000 } }),
      cultivation: base,
    });
    const panel = byClass(root, 'system-text').map((node) => node.textContent);
    assert.deepEqual(panel, [
      'Postać jest na wyprawie, a oba Awatary są zajęte. Kultywację zaczniesz, gdy któreś z nich będzie wolne.',
      'Awatar kopie w Kopalni.',
      'Drugi Awatar czeka na odbiór raportu.',
    ]);
    assert.equal(picker(root), null);
  });

  test("an Awatar's meditation stands under its name, rewound and claimed as its work", async () => {
    const meditating = { kind: 'cultivation', placeName: 'Kultywacja', minutes: 60, startedAt: Date.now(), endsAt: Date.now() + HOUR };
    const running = { xp: 1000, level: 104, capped: false, cultivationXp: 60, cultivationLevel: 0, avatar: 2 };
    let root = show({ activity: exploring, professions: avatars({ second: meditating }), cultivation: { ...base, running } });
    assert.deepEqual(
      byClass(root, 'section-title').map((node) => node.textContent),
      ['Drugi Awatar Systemu'],
    );
    assert.equal(picker(root), null);
    assert.equal(root.find((node) => node.getAttribute('data-guide') === 'skip-avatar2').length, 1);
    assert.ok(byClass(root, 'system-hint').some((node) => node.textContent.endsWith('Do tego czasu Awatar nie podejmie pracy w profesji, a Twoja postać jest wolna.')));
    // Ended: its report is the Awatar's claim.
    root = show({ activity: exploring, professions: avatars({ second: { ...meditating, startedAt: Date.now() - 2 * HOUR, endsAt: Date.now() - HOUR } }), cultivation: { ...base, running } });
    page.sent.length = 0;
    root.find((node) => node.getAttribute('data-guide') === 'cultivation-claim')[0].click();
    await settled();
    assert.deepEqual(page.sent.at(-1), { method: 'POST', path: '/api/avatar/claim', body: { avatar: 2 } });
  });
});

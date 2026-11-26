// The Walka's switch (src/client/combat-modes.js; the author, 24.11.2026:
// „Postrach Krainy i Kultywacja powinny byc osobnymi zakładkami w Walce”),
// on just enough of a page (helpers/narrator-page.js): its five parts in
// their order, each leading to its own address, the one shown pressed; a
// part still locked shut with its level, as the Portale and the Wieże were;
// a gold dot on the Postrach Krainy while a Skrzynia Bossa waits and on the
// Kultywacja once a meditation has ended, never on a part still locked; a
// part whose unlock the deployment lacks left out. An Awatar's Kultywacja
// ended lights the Kultywacja as the character's does (26.11.2026).

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { narratorPage } from './helpers/narrator-page.js';

const page = narratorPage();
const unlocks = [
  { id: 'portals', name: 'Portale', level: 5 },
  { id: 'world-boss', name: 'Postrach Krainy', level: 15 },
  { id: 'cultivation', name: 'Kultywacja', level: 20 },
  { id: 'towers', name: 'Wieże', level: 50 },
];
const ALL = ['portals', 'world-boss', 'cultivation', 'towers'];

describe("the Walka's switch", () => {
  let state;
  let modes;
  let kept;
  before(async () => {
    await page.ready;
    ({ state } = page);
    kept = { content: state.content, character: state.character, chests: state.worldBossChests };
    state.content = { ...state.content, unlocks };
    modes = await import('../src/client/combat-modes.js');
  });
  after(() => {
    state.content = kept.content;
    state.character = kept.character;
    state.worldBossChests = kept.chests;
  });

  const character = (features, activity = null) => {
    state.character = { id: 1, level: features.length > 0 ? 146 : 1, features, activity };
  };
  // The switch's options, each with its part, address, name, lock and dot.
  function shown(active = 'explore') {
    const went = [];
    const frame = modes.combatModes(active, (hash) => went.push(hash));
    const [group] = frame.childNodes;
    assert.equal(group.getAttribute('role'), 'group');
    const options = group.childNodes.map((button) => ({
      button,
      mode: button.getAttribute('data-mode'),
      name: button.childNodes[0].childNodes[0],
      pressed: button.getAttribute('aria-pressed') === 'true',
      locked: button.getAttribute('disabled') !== null,
      lock: button.find((node) => node.classList.contains('lock-label'))[0]?.textContent ?? null,
      dot: button.find((node) => node.classList.contains('community-dot'))[0]?.getAttribute('aria-label') ?? null,
    }));
    return { options, went };
  }
  const option = (options, mode) => options.find((one) => one.mode === mode);

  test('five parts in their order, each to its own address; the one shown pressed, a tap on another goes there', () => {
    character(ALL);
    const { options, went } = shown('world-boss');
    assert.deepEqual(
      options.map((one) => [one.mode, one.name]),
      [
        ['explore', 'Eksploracja'],
        ['portals', 'Portale'],
        ['towers', 'Wieże'],
        ['world-boss', 'Postrach Krainy'],
        ['cultivation', 'Kultywacja'],
      ],
    );
    assert.deepEqual(
      options.filter((one) => one.pressed).map((one) => one.mode),
      ['world-boss'],
    );
    assert.ok(options.every((one) => !one.locked && one.lock === null));
    for (const one of options) one.button.click();
    assert.deepEqual(went, ['#/walka', '#/portale', '#/wieze', '#/kultywacja']);
  });

  test('a part still locked is shut with its level, and no dot lights it', () => {
    character([], { kind: 'cultivation', endsAt: Date.now() - 5000 });
    state.worldBossChests = 2;
    const { options, went } = shown();
    assert.deepEqual(
      options.map((one) => [one.mode, one.locked, one.lock]),
      [
        ['explore', false, null],
        ['portals', true, 'poz. 5'],
        ['towers', true, 'poz. 50'],
        ['world-boss', true, 'poz. 15'],
        ['cultivation', true, 'poz. 20'],
      ],
    );
    assert.ok(options.every((one) => one.dot === null));
    assert.equal(modes.combatModeNews('world-boss'), null);
  });

  test('a dot on the Postrach Krainy while a chest waits, on the Kultywacja once a meditation has ended', () => {
    character(ALL);
    state.worldBossChests = 0;
    assert.ok(shown().options.every((one) => one.dot === null));
    state.worldBossChests = 1;
    let { options } = shown('world-boss');
    assert.equal(option(options, 'world-boss').dot, 'czeka do odebrania');
    assert.equal(option(options, 'cultivation').dot, null);
    // A meditation under way lights nothing; one ended does, a hunt ended not.
    state.worldBossChests = 0;
    character(ALL, { kind: 'cultivation', endsAt: Date.now() + 60000 });
    assert.equal(option(shown().options, 'cultivation').dot, null);
    character(ALL, { kind: 'cultivation', endsAt: Date.now() - 5000 });
    ({ options } = shown());
    assert.equal(option(options, 'cultivation').dot, 'raport czeka');
    assert.deepEqual(
      options.filter((one) => one.dot).map((one) => one.mode),
      ['cultivation'],
    );
    character(ALL, { kind: 'hunt', endsAt: Date.now() - 5000 });
    assert.ok(shown().options.every((one) => one.dot === null));
  });

  test("an Awatar's Kultywacja ended lights the Kultywacja too, its work ended not (26.11.2026)", () => {
    state.worldBossChests = 0;
    const withAvatars = (first, second = null) => {
      character(ALL);
      state.character.professions = { avatar: { owned: true, activity: first, second: { owned: true, activity: second } } };
    };
    withAvatars({ kind: 'cultivation', endsAt: Date.now() + 60000 });
    assert.equal(option(shown().options, 'cultivation').dot, null);
    withAvatars({ kind: 'cultivation', endsAt: Date.now() - 5000 });
    assert.equal(option(shown().options, 'cultivation').dot, 'raport czeka');
    withAvatars(null, { kind: 'cultivation', endsAt: Date.now() - 5000 });
    assert.equal(option(shown().options, 'cultivation').dot, 'raport czeka');
    withAvatars({ kind: 'herbs', endsAt: Date.now() - 5000 });
    assert.equal(option(shown().options, 'cultivation').dot, null);
  });

  test('a part whose unlock the deployment lacks is left out', () => {
    character(ALL);
    state.content = { ...state.content, unlocks: unlocks.filter((unlock) => unlock.id !== 'world-boss') };
    try {
      assert.deepEqual(
        shown().options.map((one) => one.mode),
        ['explore', 'portals', 'towers', 'cultivation'],
      );
    } finally {
      state.content = { ...state.content, unlocks };
    }
  });
});

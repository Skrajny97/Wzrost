// The Walka and the report of a Drużyna's leader with the Trudna or the
// Piekielna wyprawa (the author, 19.11.2026: „Trudne i Piekielne wyprawy
// zrób tak by można je bylo robić z drużyną”), on just enough of a page
// (helpers/narrator-page.js): the boxes stay with "Z drużyną" and their
// lines no longer leave the party out, the threat counts the mode's
// creatures, for the whole party since 24.11.2026 („party=1”, gracz (poz.
// 95)), "Wyrusz" sends the party out in it, and "Wyrusz ponownie z
// drużyną" keeps it, as the boxes are kept. The names are synthetic.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import { narratorPage, settled } from './helpers/narrator-page.js';

const page = narratorPage();
const { challenge } = JSON.parse(readFileSync(new URL('../data/balance.json', import.meta.url), 'utf8'));
const area = { id: 'windfalls-edge', name: 'Skraj Wiatrołomów', minLevel: 1, maxLevel: 5, unlockClassLevel: 1, description: 'Polana.', dangers: [] };
const region = { id: 'windfalls', name: 'Wiatrołomy', minLevel: 1, maxLevel: 10, areas: [area] };
const member = (name, own) => ({ name, own, leader: own, status: 'free' });
// The party the leader sends out, with a member free now.
const leading = { members: [member('Próbna', true), member('Druhna', false)], limits: { minutes: 60, minutesBy: 'Druhna', classLevel: 30, classLevelBy: 'Druhna', mount: { shorter: 0, by: 'Druhna' } } };

let state;
let boxes;
// What the page asked the server for.
let sent = [];
let kept;
before(async () => {
  await page.ready;
  ({ state } = page);
  boxes = await import('../src/client/state.js');
  kept = { fetch: globalThis.fetch, content: state.content, user: state.user, history: globalThis.history };
  state.content = { ...state.content, regions: [region], resources: [], lengths: [{ upTo: 30, name: 'krótka' }, { name: 'długa' }] };
  state.user = { testMode: false };
  // After "Wyrusz" the Walka goes back to the lands.
  globalThis.history = { state: null, go() {}, pushState() {} };
  globalThis.location.replace = () => {};
  globalThis.fetch = async (path, options = {}) => {
    const url = String(path);
    sent.push({ method: options.method ?? 'GET', path: url, body: options.body ? JSON.parse(options.body) : null });
    const answer = url === '/api/party/hunt' ? { went: ['Druhna'], notes: [] } : url.startsWith('/api/party') ? { party: leading } : { areas: [{ id: area.id, threat: { 5: 'low', 15: 'low', 30: 'moderate' }, threatAvoiding: { 5: 'low', 15: 'low', 30: 'low' }, threatSeeking: { 5: 'low', 15: 'moderate', 30: 'high' } }] };
    return new Response(JSON.stringify(answer), { status: 200 });
  };
});
after(() => {
  globalThis.fetch = kept.fetch;
  state.content = kept.content;
  state.user = kept.user;
  if (kept.history === undefined) delete globalThis.history;
  else globalThis.history = kept.history;
});
beforeEach(() => {
  sent = [];
  boxes.setHardHunt(false);
  boxes.setHellHunt(false);
});

// A leader of level 30 with both boxes open, at home.
function character() {
  return {
    id: 7,
    name: 'Próbna',
    level: 30,
    classLevel: 30,
    xp: 100,
    tutorial: null,
    features: ['party'],
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
  };
}

const byId = (screen, id) => screen.find((node) => node.getAttribute('id') === id)[0];
const tick = (box, on) => {
  box.checked = on;
  box.dispatchEvent({ type: 'change' });
};

// The place on the Walka screen, the party's box drawn.
async function place() {
  state.character = character();
  const { mountCombat } = await import('../src/client/screens/combat.js');
  const screen = globalThis.document.createElement('main');
  globalThis.document.body.append(screen);
  const view = mountCombat(screen, { params: { region: region.id, area: area.id }, navigate() {} });
  await settled();
  return {
    screen,
    unmount() {
      view.unmount?.();
      screen.remove();
    },
  };
}

describe('the Walka of a Drużyna\'s leader', () => {
  for (const [name, key, other] of [
    ['Trudna', 'hard', 'hell'],
    ['Piekielna', 'hell', 'hard'],
  ]) {
    test(`with "Z drużyną" the ${name} wyprawa's box stays: the threat counts its creatures and "Wyrusz" sends the party out in it`, async () => {
      const shown = await place();
      const { screen } = shown;
      // "Z drużyną" ticked, as it comes.
      const along = byId(screen, 'party-along');
      assert.ok(along, 'the box "Z drużyną"');
      assert.ok(along.checked ?? along.getAttribute('checked') !== null);
      const box = byId(screen, `${key}-hunt`);
      assert.ok(box, `the box of the ${name} wyprawa`);
      // Its line names only the Szybkie and the Błyskawiczne polowanie.
      const lines = screen.find((node) => node.classList.contains('track-quests-note') && node.textContent.startsWith('Stwory:')).map((node) => node.textContent);
      assert.equal(lines.length, 2, lines.join(' | '));
      for (const line of lines) {
        assert.ok(line.endsWith('Nie na Szybkim i Błyskawicznym polowaniu.'), line);
        assert.ok(!line.includes('drużyn'), line);
      }
      tick(box, true);
      await settled();
      // For the whole party as it would go (hunts.js: huntOptions).
      assert.ok(
        sent.some((one) => one.path === `/api/hunts/options?area=${area.id}&${key}=1&party=1`),
        sent.map((one) => one.path).join(', '),
      );
      const [start] = screen.find((node) => node.tagName === 'BUTTON' && node.textContent.startsWith('Wyrusz'));
      start.click();
      await settled();
      const trip = sent.find((one) => one.method === 'POST');
      assert.equal(trip?.path, '/api/party/hunt', JSON.stringify(sent));
      assert.equal(trip.body.areaId, area.id);
      assert.equal(trip.body[key], true);
      assert.equal(trip.body[other], undefined);
      shown.unmount();
    });
  }
});

describe('the report of a Drużyna\'s trip', () => {
  const report = () => ({
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
    hell: true,
    party: ['Próbna', 'Druhna'],
    summary: { xp: 0, classXp: 0, gold: 0, resources: {}, materials: [], fights: 0, hpStart: 100, hpEnd: 100, maxHp: 100, timePoints: 0, bestFind: null },
    system: [],
    fights: [],
    items: [],
    entries: [],
  });

  test('it says the Piekielna wyprawa, and "Wyrusz ponownie z drużyną" keeps it as the boxes are kept', async () => {
    state.character = character();
    boxes.setHellHunt(true);
    const { mountReport } = await import('../src/client/screens/report.js');
    boxes.reportCache.set('wyprawa-druzyny', report());
    state.freshReport = 'wyprawa-druzyny';
    const screen = globalThis.document.createElement('main');
    globalThis.document.body.append(screen);
    const view = mountReport(screen, { params: { id: 'wyprawa-druzyny' }, navigate() {} });
    await settled();
    assert.ok(screen.textContent.includes('Piekielna wyprawa: dużo silniejsze stwory, więcej XP, złota i łupów.'), screen.textContent);
    assert.ok(screen.textContent.includes('W drużynie: Próbna, Druhna.'));
    const again = screen.find((node) => node.tagName === 'BUTTON' && node.textContent.startsWith('Wyrusz ponownie z drużyną'));
    assert.equal(again.length, 1, screen.textContent);
    again[0].click();
    await settled();
    const trip = sent.find((one) => one.method === 'POST');
    assert.equal(trip?.path, '/api/party/hunt', JSON.stringify(sent));
    assert.equal(trip.body.hell, true);
    assert.equal(trip.body.hard, undefined);
    assert.equal(trip.body.minutes, 15);
    view.unmount?.();
    screen.remove();
  });
});

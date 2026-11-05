// The narrator's chapters on the page (src/client/narrator.js), on just
// enough of a page for its cards and lit places
// (test/helpers/narrator-page.js), after the review of the narrator's lines
// (664): no chapter that waits for the character at home, or for a free
// worker, keeps the later ones from a player who sets out again straight
// from each report; a chapter a claimed report brings comes after the
// report, not over it; and the System's words a line asks to read unfold.

import assert from 'node:assert/strict';
import { before, beforeEach, test } from 'node:test';
import { cards, intro, narratorPage, part, settled } from './helpers/narrator-page.js';

const page = narratorPage();
const { sent } = page;
let narrator;
let state;
before(async () => {
  await page.ready;
  ({ narrator, state } = page);
});

// No character: whatever the narrator had on the page goes with it.
beforeEach(() => {
  state.character = null;
  narrator.narrate();
  sent.length = 0;
});

// A character after the introduction, at `level`, with the parts of the game
// it has; `away` while on an exploration.
function character({ read = intro, level = 20, features = ['community'], away = false } = {}) {
  return {
    name: 'Mira',
    classId: 'warrior',
    appearance: 'female',
    level,
    classLevel: level,
    xp: 0,
    activity: away ? { kind: 'hunt', endsAt: Date.now() + 3600000 } : null,
    tutorial: [...read],
    features,
    skills: { pools: [] },
    quickHunts: { left: 3, perDay: 3 },
    professions: { workshop: {}, avatar: { owned: false, activity: null } },
    settlementOpen: level >= 20,
    camp: { construction: null, buildings: [{ id: 'campfire', level: 1 }] },
  };
}

// Told the Społeczność up to the chat's rules (its Szybkie Polowanie waits
// for the character at home) and the Profesje, never the Rzemieślnictwo,
// which waits for a free worker.
const toldSoFar = [...intro, ...part('professions'), 'community-welcome', 'community-tabs', 'community-rules'];

test('a player who always sets out again from the report still gets the Osada at level 20', () => {
  // On the Walka tab after "Wyrusz ponownie" in a report: the character is
  // away, as after every report.
  state.user = { skipTutorials: false };
  state.character = character({ read: toldSoFar, away: true });
  narrator.narrate('#/walka');
  assert.equal(cards().length, 1);
  assert.match(cards()[0].textContent, /System otworzył przed Tobą Osadę/);
});

test('Szybkie Polowanie is told once the character is home on an inner region, after the chapters that came meanwhile', () => {
  state.user = { skipTutorials: false };
  // Away, on the inner region: nothing to tell there.
  state.character = character({ read: [...toldSoFar, ...part('settlement')], away: true });
  narrator.narrate('#/walka/windfalls/windfalls-edge');
  assert.equal(narrator.narratorIdle(), true);
  // Home: the Rzemieślnictwo comes first, now that a worker is free.
  state.character = character({ read: [...toldSoFar, ...part('settlement')] });
  narrator.narrate('#/walka/windfalls/windfalls-edge');
  assert.equal(cards().length, 1);
  assert.match(cards()[0].textContent, /System otworzył przed Tobą Rzemieślnictwo/);
  // Then Szybkie Polowanie, pointed at in that inner region.
  state.character = null;
  narrator.narrate();
  state.character = character({ read: [...toldSoFar, ...part('settlement'), ...part('crafting')] });
  narrator.narrate('#/walka/windfalls/windfalls-edge');
  assert.equal(cards().length, 0);
  assert.equal(narrator.narratorIdle(), false);
  // Its pointer looks for its place on this page: it goes with the character.
  state.character = null;
  narrator.narrate();
});

// "Odbierz raport" (screens/combat.js): the claim's answer brings the
// character, at level 20 and home again, a moment before the page goes to
// the report. The Osada's card came then, on the inner region being left,
// and stayed over the report (664); now it comes after the report.
test('a chapter the claim of a report brings begins after the report, not over it', async () => {
  state.user = { skipTutorials: false };
  const told = [...toldSoFar, 'community-ending', ...part('crafting')];
  globalThis.location.hash = '#/walka/windfalls/windfalls-edge';
  state.character = { ...character({ read: told, level: 19 }), activity: { kind: 'hunt', endsAt: Date.now() - 5000 } };
  narrator.narrate('#/walka/windfalls/windfalls-edge');
  assert.equal(cards().length, 0);
  // The answer, as app.js hands it to the narrator, and then the page goes
  // to the report.
  state.character = character({ read: told, level: 20 });
  narrator.narrateSoon();
  globalThis.location.hash = '#/raport/1';
  await settled();
  assert.equal(cards().length, 0);
  // "Powrót": the Osada's card, on the Walka tab.
  narrator.narrate('#/walka');
  assert.equal(cards().length, 1);
  assert.match(cards()[0].textContent, /System otworzył przed Tobą Osadę/);
});

// The System's words over the Profesje show their first sentence and fold
// the rest under "Jak to działa?" (315 A), while the narrator asks to read
// them, and no tap reaches a place he points at: they unfold for him (664).
test('the System words the narrator asks to read in the Profesje unfold', () => {
  state.user = { skipTutorials: false };
  const panel = globalThis.document.createElement('section');
  panel.dataset.guide = 'professions-intro';
  const fold = globalThis.document.createElement('details');
  fold.className = 'how-more';
  panel.append(fold);
  globalThis.document.body.append(panel);
  page.places.set('[data-guide="professions-intro"]', [panel]);
  state.character = { ...character({ read: [...intro, 'professions-welcome'], level: 10 }), professions: { avatar: { owned: false, activity: null } } };
  narrator.narrate('#/profesje');
  assert.equal(fold.open, true);
  // The light goes with the character, and the panel with the screen.
  state.character = null;
  narrator.narrate();
  page.places.clear();
  panel.remove();
});

test('the Rzemieślnictwo waiting for a free worker does not begin in the middle of the Osada', () => {
  state.user = { skipTutorials: false };
  // The Osada began while the character was away; back home, its lead to
  // the Osada tab goes on, and the Rzemieślnictwo waits for its end.
  state.character = character({ read: [...toldSoFar, 'settlement-welcome'] });
  narrator.narrate('#/walka');
  assert.equal(cards().length, 0);
  assert.equal(narrator.narratorIdle(), false);
  state.character = null;
  narrator.narrate();
  state.character = character({ read: [...toldSoFar, ...part('settlement')] });
  narrator.narrate('#/walka');
  assert.equal(cards().length, 1);
  assert.match(cards()[0].textContent, /System otworzył przed Tobą Rzemieślnictwo/);
});

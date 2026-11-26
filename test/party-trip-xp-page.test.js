// The Drużyna's „Jak to działa?” (screens/party.js) says how much less XP a
// party's trip gives than an exploration with two companions (1274 A,
// 26.11.2026; the author: „lepiej osłabić drużyny na przykład uzyskiwanego
// expa mocno”), with the numbers the server sends (parties.js:
// tripXpLess), to the leader and to a member, on just enough of a page
// (helpers/narrator-page.js). The names are synthetic.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { narratorPage, settled } from './helpers/narrator-page.js';

const page = narratorPage();
const { party: partyData } = JSON.parse(readFileSync(new URL('../data/community.json', import.meta.url), 'utf8'));
const member = (name, own, leader) => ({ id: own ? 2 : 1, name, own, leader, status: 'free', classId: 'warrior', level: 30, classLevel: 30 });
const SENTENCE = 'Drużyna może wspólnie przewijać czas, więc z wyprawy drużyny każdy dostaje mniej XP niż z wyprawy z dwoma towarzyszami: w trio o 32%, a w duecie o 13%.';

let state;
let kept;
// The character's own place in the party: the leader or a member.
let leading = false;
const view = () => ({
  party: { id: 1, size: 3, members: [member('Przewodniczka', leading, true), member('Druhna', !leading, false)], invited: [], limits: null },
  range: { from: 20, to: 40, spread: 10 },
  tripXpLess: { trio: 32, duo: 13 },
  invites: [],
  unlockLevel: 10,
  companions: null,
  ownCompanions: [],
  potions: null,
  meal: null,
  mealMost: 3,
});
before(async () => {
  await page.ready;
  ({ state } = page);
  kept = { fetch: globalThis.fetch, content: state.content };
  state.content = { ...state.content, community: { party: { texts: partyData.texts } }, unlocks: [{ id: 'party', level: 10 }] };
  globalThis.fetch = async (path) => new Response(JSON.stringify(String(path) === '/api/friends' ? { friends: [] } : view()), { status: 200 });
});
after(() => {
  globalThis.fetch = kept.fetch;
  state.content = kept.content;
});

// The lines under „Jak to działa?” on the Drużyna's card.
async function howLines() {
  globalThis.document.body.replaceChildren();
  state.character = { name: leading ? 'Przewodniczka' : 'Druhna', level: 30, classLevel: 30, features: ['party'], pantry: [], potions: [], huntDurations: [5, 15, 30] };
  const { mountParty } = await import('../src/client/screens/party.js');
  const screen = globalThis.document.createElement('main');
  globalThis.document.body.append(screen);
  const shown = mountParty(screen);
  await settled();
  const lines = screen.find((node) => node.tagName === 'P' && node.parentNode?.tagName === 'DETAILS').map((node) => node.textContent);
  // The line in sight above them: the leader's or a member's.
  const lead = screen.find((node) => node.tagName === 'P' && node.parentNode?.className === 'how')[0]?.textContent;
  shown.unmount();
  screen.remove();
  return { lines, lead };
}

describe("the Drużyna's „Jak to działa?” on a party trip's XP", () => {
  test('a member reads it after the shared time', async () => {
    leading = false;
    const { lines, lead } = await howLines();
    assert.match(lead, /^Wyprawy wybiera lider\./);
    const at = lines.indexOf(SENTENCE);
    assert.ok(at > 0, lines.join('\n'));
    assert.equal(lines[at - 1], 'Wyprawa drużyny ma wspólny czas: gdy ktokolwiek ją przewinie, skraca się wszystkim.');
  });

  test('the leader reads it too', async () => {
    leading = true;
    const { lines, lead } = await howLines();
    assert.match(lead, /^Wyprawę drużyny zaczynasz w Walce/);
    assert.ok(lines.includes(SENTENCE), lines.join('\n'));
  });
});

// "Zagraj o … zł" and "Trening" at a resident's table (src/client/cards.js)
// wait while the character's live match with another player runs
// (card-duel.js), with a word why and the way to its table: the server
// starts no other match meanwhile (withoutDuel in src/server/card-duel.js).
// The code review: they stayed on and only the server said no. Once the
// match is over they are on again, on the table as it stands.

import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import { narratorPage, settled } from './helpers/narrator-page.js';

const page = narratorPage();
let duel;
let cards;

// Jagna's table, as GET /api/cards brings it, with a whole deck.
const view = {
  starter: true,
  deck: ['wolf'],
  deckSize: 12,
  staked: { today: 0, limit: 5 },
  match: null,
  types: [],
  texts: { win: [], loss: [], draw: [], rules: [] },
  residents: [
    {
      id: 'herbalist',
      name: 'Jagna',
      place: 'herbalist',
      gender: 'f',
      with: 'z Jagną',
      of: 'Jagny',
      deck: 'Zielona talia',
      style: 'Leczy swoje karty.',
      icon: 'dice',
      after: 2,
      top: false,
      stake: 120,
      win: 240,
      chance: 0.1,
      beaten: false,
      left: 3,
      missing: 2,
      size: 12,
      cards: [],
      texts: { win: [], loss: [], draw: [] },
    },
  ],
};

before(async () => {
  await page.ready;
  globalThis.fetch = async (path) => {
    if (path === '/api/cards') return new Response(JSON.stringify({ cards: view }), { status: 200 });
    if (path.startsWith('/api/cards/duel')) return new Response(JSON.stringify({ duel: null }), { status: 200 });
    return new Response('{}', { status: 200 });
  };
  page.state.character = { id: 1, name: 'Ala', gold: 1000, features: ['community'], tutorial: null };
  duel = await import('../src/client/card-duel.js');
  cards = await import('../src/client/cards.js');
});

const play = (holder) => holder.find((node) => node.tagName === 'BUTTON' && /^(Zagraj o|Trening)/.test(node.textContent));
const off = (button) => 'disabled' in button.attributes;
const note = (holder) => holder.find((node) => node.classList.contains('cards-elsewhere'))[0] ?? null;

test("a resident's table waits for the live match, says so, and plays again once it is over", async () => {
  // A live match going on, as the chat's poll brings it.
  duel.duelSeen({ id: 7, state: 'playing', mine: true, stake: 0, pot: 0, other: { name: 'Rywal' }, step: 'foe', deadline: Date.now() + 30000, round: 1 });
  const holder = document.createElement('div');
  document.body.append(holder);
  const table = cards.mountCards(holder, { resident: 'herbalist' });
  await settled();
  let buttons = play(holder);
  assert.deepEqual(
    buttons.map((button) => [button.textContent, off(button)]),
    [
      ['Zagraj o 120 zł', true],
      ['Trening', true],
    ],
  );
  assert.equal(note(holder).find((node) => node.tagName === 'P')[0].textContent, 'Trwa Twoja partia na żywo. Dokończ ją, zanim zaczniesz następną.');
  assert.equal(note(holder).find((node) => node.tagName === 'A')[0].getAttribute('href'), '#/osada/casino/cards');

  // The match is over: the next poll says none, and the page's ticker
  // tells the table within a second.
  duel.duelSeen(null);
  duel.offerDuel();
  await settled();
  buttons = play(holder);
  assert.deepEqual(
    buttons.map((button) => [button.textContent, off(button)]),
    [
      ['Zagraj o 120 zł', false],
      ['Trening', false],
    ],
  );
  assert.equal(note(holder), null);
  table.unmount();
});

// The shortcut to help in the guild on the Walka screen (the author,
// 20.11.2026: „Trzeba zrobić jakoś łatwo dostepny skrót do pomagania innym z
// gildii w ramach tej nowej funkcji”; src/client/guild-help.js,
// guildHelpStrip), on just enough of a page (helpers/narrator-page.js): it
// shows while the guild's todo, which the page asks for anyway, says there
// is someone to help, with how many, in the words of data/guilds.json;
// "Pomóż wszystkim" asks the server once, the strip shows its answer for a
// moment and hides; nothing shows outside a guild or before the
// Społeczność. The names are synthetic.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, mock, test } from 'node:test';

import { narratorPage, settled } from './helpers/narrator-page.js';

const page = narratorPage();
const { texts } = JSON.parse(readFileSync(new URL('../data/guilds.json', import.meta.url), 'utf8')).help;
const ANSWER = 'Pomoc wysłana 4 razy. Zgarniasz 4 punkty Sławy.';
// What the server says: whether the character is in a guild (GET
// /api/chat/latest) and how many builds and works wait for its help (GET
// /api/guild/todo); "Pomóż wszystkim" helps with all of them.
let inGuild = true;
let waiting = 4;
let sent = [];
let state;
let boxes;
let chat;
let help;
let kept;

before(async () => {
  await page.ready;
  ({ state } = page);
  kept = { fetch: globalThis.fetch, content: state.content };
  state.content = { ...state.content, guildHelp: { waiting: texts.strip, all: texts.stripAll } };
  globalThis.fetch = async (path, options = {}) => {
    sent.push({ method: options.method ?? 'GET', path });
    let answer = {};
    if (path === '/api/chat/latest') answer = { latest: 0, conversations: [], mentions: { private: {} }, guild: inGuild ? { name: 'Gildia Próbna', tag: 'GP', latest: 0 } : null };
    if (path === '/api/guild/todo') answer = { todo: { trials: false, beast: false, expedition: false, requests: false, chest: false, guild: waiting > 0, seat: false }, help: waiting };
    if (path === '/api/guild/help/all') {
      answer = { helped: waiting, open: 0, text: ANSWER };
      waiting = 0;
    }
    return new Response(JSON.stringify(answer), { status: 200 });
  };
  boxes = await import('../src/client/state.js');
  chat = await import('../src/client/chat-news.js');
  help = await import('../src/client/guild-help.js');
});
after(() => {
  globalThis.fetch = kept.fetch;
  state.content = kept.content;
});

const play = (features) => boxes.setCharacter({ id: 1, name: 'Postać Próbna', features, tutorial: null });
const find = (strip, className) => strip.find((node) => node.classList.contains(className))[0];
// Promises settled while setTimeout is held by the mocked timers.
const flush = async () => {
  for (let round = 0; round < 10; round += 1) await new Promise((resolve) => setImmediate(resolve));
};

test('the strip shows how many wait for help, helps with all at one tap, shows the answer and hides', async () => {
  play(['community']);
  const strip = help.guildHelpStrip();
  // Before the guild's todo has come: nothing.
  assert.equal(strip.hidden, true);

  await chat.checkChat({ now: true });
  await settled();
  assert.equal(chat.guildHelpWaiting(), 4);
  assert.equal(strip.hidden, false);
  const link = find(strip, 'guild-help-strip-link');
  assert.equal(link.getAttribute('href'), '#/gildia/guild');
  assert.equal(find(strip, 'guild-help-strip-text').textContent, 'Gildia czeka na pomoc: 4');
  assert.equal(find(strip, 'guild-help-strip-button').textContent, 'Pomóż wszystkim');

  // One tap: one request, the answer in the strip, which stays for a moment
  // although the todo asked again says nobody waits any more.
  sent = [];
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    find(strip, 'guild-help-strip-button').click();
    await flush();
    assert.deepEqual(
      sent.map((one) => `${one.method} ${one.path}`),
      ['POST /api/guild/help/all', 'GET /api/guild/todo'],
    );
    assert.equal(chat.guildHelpWaiting(), 0);
    assert.equal(strip.hidden, false);
    assert.equal(strip.classList.contains('guild-help-strip--done'), true);
    assert.equal(find(strip, 'guild-help-strip-text').textContent, ANSWER);
    assert.equal(find(strip, 'guild-help-strip-button'), undefined);
    mock.timers.tick(6000);
  } finally {
    mock.timers.reset();
  }
  assert.equal(strip.hidden, true);

  // New builds to help: it shows again, with the new count.
  waiting = 2;
  await chat.checkGuildTodo({ now: true });
  assert.equal(strip.hidden, false);
  assert.equal(find(strip, 'guild-help-strip-text').textContent, 'Gildia czeka na pomoc: 2');
  strip.stop();
});

test('nothing shows outside a guild or before the Społeczność', async () => {
  waiting = 3;
  play(['community']);
  inGuild = false;
  const strip = help.guildHelpStrip();
  await chat.checkChat({ now: true });
  await settled();
  assert.equal(chat.guildHelpWaiting(), 0);
  assert.equal(strip.hidden, true);
  strip.stop();

  // In a guild again, but a character without the Społeczność yet.
  inGuild = true;
  await chat.checkChat({ now: true });
  await chat.checkGuildTodo({ now: true });
  assert.equal(chat.guildHelpWaiting(), 3);
  play([]);
  const early = help.guildHelpStrip();
  assert.equal(chat.guildHelpWaiting(), 0);
  assert.equal(early.hidden, true);
  early.stop();
});

// The chat's marks of what was read (src/client/chat-news.js) are a
// character's own: kept on the device with its id, so after a change of
// character on one device the guild's channel and the private conversations
// light for what the new character has not read, and its reads go to the
// server. The code review: the marks of the character played before kept
// them dark, and no read below those marks went to the server, so the new
// character's marks there stopped moving forward.

import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import { narratorPage, settled } from './helpers/narrator-page.js';

const page = narratorPage();
// The device's storage, holding the marks of character 1 played before.
const stored = new Map([
  ['insight-chat-seen-character', '1'],
  ['insight-chat-seen', '5000'],
  ['insight-chat-guild-seen', '5000'],
  ['insight-chat-private-seen', JSON.stringify({ 9: 5000 })],
]);
// What the server says of each character (GET /api/chat/latest): the
// newest messages of its guild's channel and of its conversation with
// character 9, and the marks it keeps of what the character read.
const server = {
  1: { guild: 5000, talk: 5000, seen: 5000 },
  2: { guild: 4900, talk: 4800, seen: 4000 },
  3: { guild: 300, talk: 300, seen: 0 },
};
let played = 1;
const sent = [];
// An answer held back until `release()`, for the next check.
let held = null;
let chat;
let setCharacter;

const latest = (id) => ({
  latest: 0,
  conversations: [{ id: 9, latest: server[id].talk }],
  mentions: { private: {} },
  invites: 0,
  gifts: 0,
  unsent: 0,
  partyInvites: 0,
  trade: null,
  duel: null,
  guild: { name: `Gildia ${id}`, tag: `G${id}`, latest: server[id].guild },
  guildInvites: 0,
  seen: { global: server[id].seen, trade: 0, guild: server[id].seen, private: { 9: server[id].seen } },
});

before(async () => {
  await page.ready;
  globalThis.localStorage = { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, String(value)), removeItem: (key) => stored.delete(key) };
  globalThis.fetch = async (path, options) => {
    sent.push({ method: options.method, path, body: options.body ? JSON.parse(options.body) : null });
    if (path === '/api/chat/latest') {
      const answer = latest(played);
      if (held) await held.gate;
      return new Response(JSON.stringify(answer), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  };
  ({ setCharacter } = await import('../src/client/state.js'));
  chat = await import('../src/client/chat-news.js');
});

const play = (id) => {
  played = id;
  setCharacter({ id, name: `Postać ${id}`, features: ['community'], tutorial: null });
};
const marksSent = () => sent.filter((one) => one.path === '/api/chat/seen').map((one) => one.body);

test("another character on the device lights its own unread messages, and its reads reach the server", async () => {
  // Character 1 again, as on the device before: its marks hold.
  play(1);
  await chat.checkChat({ now: true });
  assert.equal(chat.guildChannelNews(), false);
  assert.equal(chat.conversationNews(9), false);
  assert.equal(stored.get('insight-chat-guild-seen'), '5000');

  // Character 2 on the same device: what it has not read lights, by the
  // server's marks of it, not by character 1's.
  play(2);
  await chat.checkChat({ now: true });
  assert.equal(chat.guildChannelNews(), true);
  assert.equal(chat.conversationNews(9), true);
  // Read, the light goes out and the marks go to the server.
  chat.guildRead(4900);
  chat.privateRead(9, 4800);
  await settled();
  assert.deepEqual(marksSent(), [{ guild: 4900 }, { with: 9, id: 4800 }]);
  assert.equal(chat.guildChannelNews(), false);
  assert.equal(chat.conversationNews(9), false);
  assert.equal(stored.get('insight-chat-seen-character'), '2');
  assert.equal(stored.get('insight-chat-guild-seen'), '4900');

  // An answer for character 2 that comes after a change to character 3 is
  // no news of character 3.
  let release;
  held = { gate: new Promise((resolve) => (release = resolve)) };
  const late = chat.checkChat({ now: true });
  await settled();
  play(3);
  held = null;
  release();
  await late;
  assert.equal(chat.guildChannelNews(), false);
  await chat.checkChat({ now: true });
  assert.equal(chat.guildChannelNews(), true);
  assert.equal(stored.get('insight-chat-seen-character'), '3');
});

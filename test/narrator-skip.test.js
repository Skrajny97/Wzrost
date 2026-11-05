// "Pomijaj objaśnienia narratora" on the page (src/client/narrator.js), the
// account's switch in the Ustawienia. A player on the chat: „Czy można
// wprowadzić opcję pominięcia instrukcji jak np. przy otwarciu osady? Aby
// każdą postacią nie trzeba było czytać tego samego”. With the switch on, a
// line that comes due never shows: its part is passed as its "Pomiń" passes
// it, with the same request to the server and the same message. The
// narrator runs here on just enough of a page for its cards; the server's
// side (the switch kept on the account, a new character without the
// introduction) is in game.test.js.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';

const data = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
const tutorial = { ...data('tutorial'), $comment: undefined, startTimePoints: 60 };
const kept = (line) => line.kind === 'card' || line.kind === 'point' || line.once === true;
const intro = tutorial.lines.filter((line) => kept(line) && !line.chapter).map((line) => line.id);
const part = (chapter) => tutorial.lines.filter((line) => kept(line) && line.chapter === chapter).map((line) => line.id);

class FakeNode {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.childNodes = [];
    this.parentNode = null;
    this.attributes = {};
    this.dataset = {};
    this.className = '';
    this.style = { setProperty() {} };
    this.listeners = {};
    this.open = false;
    const names = () => this.className.split(' ').filter(Boolean);
    this.classList = {
      add: (...more) => (this.className = [...new Set([...names(), ...more])].join(' ')),
      remove: (...less) => (this.className = names().filter((name) => !less.includes(name)).join(' ')),
      toggle: (name, on = !names().includes(name)) => (on ? this.classList.add(name) : this.classList.remove(name)),
      contains: (name) => names().includes(name),
    };
  }
  append(...nodes) {
    for (const node of nodes) {
      if (node instanceof FakeNode) {
        node.parentNode?.removeChild(node);
        node.parentNode = this;
      }
      this.childNodes.push(node);
    }
  }
  removeChild(node) {
    this.childNodes = this.childNodes.filter((child) => child !== node);
    node.parentNode = null;
  }
  remove() {
    this.parentNode?.removeChild(this);
  }
  replaceChildren(...nodes) {
    for (const child of this.childNodes) if (child instanceof FakeNode) child.parentNode = null;
    this.childNodes = [];
    this.append(...nodes);
  }
  get isConnected() {
    let node = this;
    while (node.parentNode) node = node.parentNode;
    return node === globalThis.document?.body;
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
  addEventListener(type, listener) {
    (this.listeners[type] ??= []).push(listener);
  }
  removeEventListener() {}
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
  }
  focus() {}
  click() {
    for (const listener of this.listeners.click ?? []) listener({ currentTarget: this, target: this, preventDefault() {}, stopPropagation() {} });
  }
  get textContent() {
    return this.childNodes.map((node) => (typeof node === 'string' ? node : node.textContent)).join('');
  }
  set textContent(text) {
    this.childNodes = [String(text)];
  }
  // The elements below this one that `match`, in order.
  find(match) {
    return this.childNodes.flatMap((node) => (typeof node === 'string' ? [] : [...(match(node) ? [node] : []), ...node.find(match)]));
  }
  // Only ".class", which is all the narrator asks a card for.
  querySelector(selector) {
    return this.find((node) => node.classList.contains(selector.slice(1)))[0] ?? null;
  }
}

// The animations and the narrator's voice off, as one may set them: the
// parchment shows at once, and no line waits for the first touch of the page.
const STORED = { 'insight.motion': 'off', 'insight.narratorVoice': 'off' };
const toastBox = new FakeNode('div');
const sent = [];
const saved = {};
let narrator;
let state;

before(async () => {
  for (const name of ['document', 'window', 'Node', 'localStorage', 'fetch', 'location']) saved[name] = globalThis[name];
  globalThis.Node = FakeNode;
  globalThis.location = { hash: '#/walka' };
  globalThis.localStorage = { getItem: (key) => STORED[key] ?? null, setItem() {}, removeItem() {} };
  globalThis.window = { innerWidth: 390, innerHeight: 844, scrollX: 0, scrollY: 0, addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) };
  globalThis.document = {
    body: new FakeNode('body'),
    documentElement: new FakeNode('html'),
    createElement: (tag) => new FakeNode(tag),
    createElementNS: (namespace, tag) => new FakeNode(tag),
    addEventListener() {},
    removeEventListener() {},
    getElementById: (id) => (id === 'toast' ? toastBox : null),
    querySelector: (selector) => (selector === '#toast' ? toastBox : null),
    querySelectorAll: () => [],
  };
  // The server answers with the character as the page now has it: its lines
  // read the way the request asks (game.test.js checks the server does so).
  globalThis.fetch = async (path, options) => {
    sent.push({ method: options.method, path, body: options.body ? JSON.parse(options.body) : null });
    return new Response(JSON.stringify({ character: { ...state.character, serverTime: Date.now() } }), { status: 200 });
  };
  ({ state } = await import('../src/client/state.js'));
  narrator = await import('../src/client/narrator.js');
  // The first inner region, where Szybkie Polowanie waits at the end of the
  // Społeczność chapter.
  state.content = { tutorial, regions: [{ id: 'windfalls', areas: [{ id: 'windfalls-edge', minLevel: 1, unlockClassLevel: 1 }] }] };
});

after(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete globalThis[name];
    else globalThis[name] = value;
  }
});

// No character: whatever the narrator had on the page goes with it.
beforeEach(() => {
  state.character = null;
  narrator.narrate();
  sent.length = 0;
  toastBox.textContent = '';
});

const settled = () => new Promise((resolve) => setTimeout(resolve, 10));
const cards = () => globalThis.document.body.find((node) => node.tagName === 'DIALOG');
const button = (className) => globalThis.document.body.find((node) => node.classList.contains(className))[0];

// A character at home after the introduction, with the Ognisko built, at
// `level` with the parts of the game it has.
function character({ tutorial: read = intro, level = 5, features = ['community'], settlementOpen = false } = {}) {
  return {
    name: 'Mira',
    classId: 'warrior',
    appearance: 'female',
    level,
    classLevel: level,
    xp: 0,
    activity: null,
    tutorial: [...read],
    features,
    skills: { pools: [] },
    professions: null,
    settlementOpen,
    camp: { construction: null, buildings: [{ id: 'campfire', level: 1 }] },
  };
}

test('off, as at first: the first card asks about the introduction; turned on, it goes at once', async () => {
  state.user = { skipTutorials: false };
  state.character = character({ tutorial: [], level: 1, features: [] });
  narrator.narrate('#/walka');
  assert.equal(cards().length, 1);
  assert.equal(cards()[0].open, true);
  assert.match(cards()[0].textContent, /Czy chcesz przejść Wprowadzenie\?/);
  assert.deepEqual(sent, []);
  // The switch turned on in the settings meanwhile (app.js): as "Pomiń
  // wprowadzenie", which plays the first steps on the server.
  state.user.skipTutorials = true;
  narrator.passTold();
  assert.equal(cards().length, 0);
  assert.deepEqual(sent, [{ method: 'POST', path: '/api/tutorial', body: { skip: true } }]);
  assert.deepEqual(state.character.tutorial, intro);
  await settled();
  assert.equal(toastBox.textContent, tutorial.skippedText);
});

test('on: a character without the introduction read never sees its first card', async () => {
  // The server skips it for a new character already (tutorial.js); one
  // that began it before the switch was on, or on another device, has it
  // skipped here.
  state.user = { skipTutorials: true };
  state.character = character({ tutorial: [], level: 1, features: [] });
  narrator.narrate('#/walka');
  assert.equal(cards().length, 0);
  assert.deepEqual(sent, [{ method: 'POST', path: '/api/tutorial', body: { skip: true } }]);
  await settled();
  assert.equal(toastBox.textContent, tutorial.skippedText);
  // Nothing more to tell or to send.
  narrator.narrate('#/walka');
  assert.deepEqual(sent.length, 1);
});

test('on: a chapter goes as by its "Pomiń objaśnienie", with the same request and message', async () => {
  // Off, the Społeczność chapter opens at level 5, and its "Pomiń
  // objaśnienie" is tapped.
  state.user = { skipTutorials: false };
  state.character = character();
  narrator.narrate('#/walka');
  assert.equal(cards().length, 1);
  assert.equal(button('narrator-skip').textContent, tutorial.chapters.community.skipLabel);
  button('narrator-skip').click();
  await settled();
  const tapped = { sent: [...sent], read: [...state.character.tutorial], told: toastBox.textContent };
  assert.deepEqual(tapped.sent, [{ method: 'POST', path: '/api/tutorial', body: { skip: true, chapter: 'community' } }]);
  assert.equal(tapped.told, tutorial.chapters.community.skippedText);

  // On, the same character at the same moment: no card, and the same.
  state.character = null;
  narrator.narrate();
  sent.length = 0;
  toastBox.textContent = '';
  state.user = { skipTutorials: true };
  state.character = character();
  narrator.narrate('#/walka');
  assert.equal(cards().length, 0);
  await settled();
  assert.deepEqual(sent, tapped.sent);
  assert.deepEqual(state.character.tutorial, tapped.read);
  assert.deepEqual(state.character.tutorial, [...intro, ...part('community')]);
  assert.equal(toastBox.textContent, tapped.told);
});

test('on: the Osada opens without its chapter, its places too', async () => {
  state.user = { skipTutorials: true };
  state.character = character({ tutorial: [...intro, ...part('community')], level: 20, settlementOpen: true });
  narrator.narrate('#/walka');
  assert.equal(cards().length, 0);
  assert.deepEqual(sent, [{ method: 'POST', path: '/api/tutorial', body: { skip: true, chapter: 'settlement' } }]);
  await settled();
  assert.equal(toastBox.textContent, tutorial.chapters.settlement.skippedText);
  // The lines of the places, told on their first visit, are passed with it.
  for (const id of part('settlement')) assert.ok(state.character.tutorial.includes(id), id);
  narrator.narrate('#/osada/tavern');
  assert.equal(sent.length, 1);
});

test('on: a late line, after the ending, goes without a word', async () => {
  state.user = { skipTutorials: true };
  state.character = character({ tutorial: intro.filter((id) => id !== 'quests') });
  // The Społeczność chapter read, so only the late line about the quests is due.
  state.character.tutorial.push(...part('community'));
  narrator.narrate('#/walka');
  assert.equal(cards().length, 0);
  assert.deepEqual(sent, [{ method: 'POST', path: '/api/tutorial', body: { skip: true } }]);
  await settled();
  assert.equal(toastBox.textContent, '');
  assert.ok(state.character.tutorial.includes('quests'));
});

test('on: a chapter left halfway takes nobody anywhere, and goes when its next line comes due', async () => {
  // The Społeczność chapter told up to the chat's rules, before the switch:
  // its end waits for an inner region, where the narrator takes the player.
  const halfway = [...intro, 'community-welcome', 'community-tabs', 'community-rules'];
  state.user = { skipTutorials: false };
  state.character = { ...character({ tutorial: halfway }), quickHunts: { left: 3 } };
  globalThis.location.hash = '#/walka';
  narrator.narrate('#/walka');
  assert.equal(globalThis.location.hash, '#/walka/windfalls/windfalls-edge');
  assert.equal(narrator.narratorIdle(), false);

  // On, it stays where it is, and other parchments need not wait for it.
  state.character = null;
  narrator.narrate();
  state.user = { skipTutorials: true };
  state.character = { ...character({ tutorial: halfway }), quickHunts: { left: 3 } };
  globalThis.location.hash = '#/walka';
  narrator.narrate('#/walka');
  assert.equal(globalThis.location.hash, '#/walka');
  assert.deepEqual(sent, []);
  assert.equal(narrator.narratorIdle(), true);
  // In the inner region its last line goes, with the chapter's message.
  narrator.narrate('#/walka/windfalls/windfalls-edge');
  assert.equal(cards().length, 0);
  assert.deepEqual(sent, [{ method: 'POST', path: '/api/tutorial', body: { skip: true, chapter: 'community' } }]);
  await settled();
  assert.equal(toastBox.textContent, tutorial.chapters.community.skippedText);
});

test('off again: the chapters to come show as before', () => {
  state.user = { skipTutorials: false };
  state.character = character({ tutorial: [...intro, ...part('community')], level: 20, settlementOpen: true });
  narrator.narrate('#/walka');
  assert.equal(cards().length, 1);
  assert.match(cards()[0].textContent, /System otworzył przed Tobą Osadę/);
  assert.deepEqual(sent, []);
});

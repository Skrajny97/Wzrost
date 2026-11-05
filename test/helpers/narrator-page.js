// Just enough of a page for the narrator (src/client/narrator.js) and its
// cards: plain nodes in a body, the game's requests kept in `sent` and
// answered with the character as the page has it, and the messages in the
// toast. The animations and the narrator's voice are off, as one may set
// them: the parchment shows at once, and no line waits for the first touch
// of the page. node --test runs each test file in a process of its own, so
// each file gets its own page and its own narrator.

import { readFileSync } from 'node:fs';
import { after, before } from 'node:test';

const data = (name) => JSON.parse(readFileSync(new URL(`../../data/${name}.json`, import.meta.url), 'utf8'));
export const tutorial = { ...data('tutorial'), $comment: undefined, startTimePoints: 60 };
const kept = (line) => line.kind === 'card' || line.kind === 'point' || line.once === true;
// The introduction's lines kept once read, and those of a part after it.
export const intro = tutorial.lines.filter((line) => kept(line) && !line.chapter).map((line) => line.id);
export const part = (chapter) => tutorial.lines.filter((line) => kept(line) && line.chapter === chapter).map((line) => line.id);

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

const STORED = { 'insight.motion': 'off', 'insight.narratorVoice': 'off' };

// The page for the test file, with the first inner region, where Szybkie
// Polowanie waits: `page.state` and `page.narrator` once `page.ready` has
// come (the test runner does not wait for one top-level `before` before it
// starts the next), `page.sent` with the requests and `page.toastBox` with
// the message.
export function narratorPage() {
  const page = { sent: [], toastBox: new FakeNode('div'), state: null, narrator: null };
  let opened;
  page.ready = new Promise((resolve) => (opened = resolve));
  const saved = {};
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
      getElementById: (id) => (id === 'toast' ? page.toastBox : null),
      querySelector: (selector) => (selector === '#toast' ? page.toastBox : null),
      querySelectorAll: () => [],
    };
    // The server answers with the character as the page now has it: its lines
    // read the way the request asks (game.test.js checks the server does so).
    globalThis.fetch = async (path, options) => {
      page.sent.push({ method: options.method, path, body: options.body ? JSON.parse(options.body) : null });
      return new Response(JSON.stringify({ character: { ...page.state.character, serverTime: Date.now() } }), { status: 200 });
    };
    ({ state: page.state } = await import('../../src/client/state.js'));
    page.narrator = await import('../../src/client/narrator.js');
    page.state.content = { tutorial, regions: [{ id: 'windfalls', areas: [{ id: 'windfalls-edge', minLevel: 1, unlockClassLevel: 1 }] }] };
    opened();
  });
  after(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  });
  return page;
}

export const settled = () => new Promise((resolve) => setTimeout(resolve, 10));
export const cards = () => globalThis.document.body.find((node) => node.tagName === 'DIALOG');
export const button = (className) => globalThis.document.body.find((node) => node.classList.contains(className))[0];

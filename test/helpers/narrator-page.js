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
  // A lit place, as the narrator measures and opens it: simple selectors
  // only (see `matches`), a box in the middle of a phone's screen.
  querySelectorAll(selector) {
    return this.find((node) => node.matches(selector));
  }
  matches(selector) {
    return selector.split(',').some((one) => matchesOne(this, one.trim()));
  }
  closest(selector) {
    for (let node = this; node instanceof FakeNode; node = node.parentNode) if (node.matches(selector)) return node;
    return null;
  }
  contains(other) {
    for (let node = other; node; node = node.parentNode) if (node === this) return true;
    return false;
  }
  get children() {
    return this.childNodes.filter((node) => node instanceof FakeNode);
  }
  getBoundingClientRect() {
    return { top: 300, bottom: 400, left: 20, right: 370, width: 350, height: 100 };
  }
  getClientRects() {
    return [this.getBoundingClientRect()];
  }
  dispatchEvent(event) {
    for (const listener of this.listeners[event.type] ?? []) listener(event);
    return true;
  }
}

// One simple selector: a tag, ".class"es, "[attribute]" or
// '[attribute="value"]' (also data-*), and ":not([attribute])".
function matchesOne(node, selector) {
  const not = /:not\(\[([\w-]+)\]\)$/.exec(selector);
  if (not) return !has(node, not[1]) && matchesOne(node, selector.slice(0, not.index));
  const parts = selector.match(/^[\w-]+|\.[\w-]+|\[[^\]]+\]/g) ?? [];
  if (parts.join('') !== selector) return false;
  return parts.every((one) => {
    if (one.startsWith('.')) return node.classList.contains(one.slice(1));
    if (one.startsWith('[')) {
      const [, name, value] = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(one);
      return value === undefined ? has(node, name) : attribute(node, name) === value;
    }
    return node.tagName === one.toUpperCase();
  });
}
// A data-* attribute set either way: by h() as an attribute, or in `dataset`.
const attribute = (node, name) =>
  (name.startsWith('data-') ? node.dataset[name.slice(5).replace(/-(\w)/g, (_, letter) => letter.toUpperCase())] : undefined) ?? node.getAttribute(name);
const has = (node, name) => (name === 'open' ? Boolean(node.open) : attribute(node, name) !== null);

const STORED = { 'insight.motion': 'off', 'insight.narratorVoice': 'off' };

// The page for the test file, with the first inner region, where Szybkie
// Polowanie waits: `page.state` and `page.narrator` once `page.ready` has
// come (the test runner does not wait for one top-level `before` before it
// starts the next), `page.sent` with the requests, `page.toastBox` with the
// message, and in `page.places` the elements the narrator finds for a
// place's selector, the first of them also for the button of a tab or a
// fold he opens (none unless a test puts them there). The game's screen
// is empty, so the camera stays where it is.
export function narratorPage() {
  const page = { sent: [], toastBox: new FakeNode('div'), screen: new FakeNode('main'), places: new Map(), state: null, narrator: null };
  let opened;
  page.ready = new Promise((resolve) => (opened = resolve));
  const saved = {};
  before(async () => {
    const globals = ['document', 'window', 'Node', 'localStorage', 'fetch', 'location', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'];
    for (const name of globals) saved[name] = globalThis[name];
    globalThis.Node = FakeNode;
    globalThis.location = { hash: '#/walka' };
    globalThis.localStorage = { getItem: (key) => STORED[key] ?? null, setItem() {}, removeItem() {} };
    globalThis.window = { innerWidth: 390, innerHeight: 844, scrollX: 0, scrollY: 0, addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) };
    globalThis.getComputedStyle = () => ({ overflow: 'hidden' });
    globalThis.requestAnimationFrame = (step) => setTimeout(step, 16);
    globalThis.cancelAnimationFrame = (frame) => clearTimeout(frame);
    globalThis.document = {
      body: new FakeNode('body'),
      documentElement: new FakeNode('html'),
      createElement: (tag) => new FakeNode(tag),
      createElementNS: (namespace, tag) => new FakeNode(tag),
      addEventListener() {},
      removeEventListener() {},
      getElementById: (id) => ({ toast: page.toastBox, screen: page.screen })[id] ?? null,
      querySelector: (selector) => (selector === '#toast' ? page.toastBox : (page.places.get(selector)?.[0] ?? null)),
      querySelectorAll: (selector) => page.places.get(selector) ?? [],
      elementsFromPoint: () => [],
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

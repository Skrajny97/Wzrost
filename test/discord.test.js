// The Discord invite button (the author, 10.11.2026: „Musimy dodać ikonkę
// Discorda do gry.”, then „jak chce tylko przycisk linku z zaproszeniem
// zrobić?”): the invite link in data/community.json, which the page gets
// with the game's content, and the Discord mark by the Społeczność's title
// and the "Discord" row in the Ustawienia (src/client/discord.js), which
// open it in a new card and show only while there is a link.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { publicContent } from '../src/server/content.js';
import { runInLanguage } from '../src/server/i18n.js';
import { loadData, validateData } from '../tools/validate-data.mjs';

test('the invite link starts empty, and only a Discord invite link may stand there', () => {
  assert.equal(loadData().community.discord.invite, '');
  const errors = (invite) => {
    const data = structuredClone(loadData());
    data.community.discord.invite = invite;
    return validateData(data);
  };
  for (const invite of ['', 'https://discord.gg/insightrpg', 'https://discord.com/invite/Ab3-xY']) assert.deepEqual(errors(invite), [], invite);
  for (const invite of ['http://discord.gg/insightrpg', 'https://example.com/insight', 'https://discord.gg/insight/channels', 'discord.gg/insightrpg']) {
    assert.match(errors(invite)[0] ?? '', /^community\.json\/discord\/invite: must match pattern/, invite);
  }
});

test("the page gets the link and the button's words in its language", () => {
  const pl = runInLanguage('pl', () => publicContent()).community.discord;
  const en = runInLanguage('en', () => publicContent()).community.discord;
  assert.deepEqual(pl, { invite: '', texts: { join: 'Dołącz do serwera Discord' } });
  assert.deepEqual(en, { invite: '', texts: { join: 'Join the Discord server' } });
});

// Just enough of a document for dom.js's h() and the mark's SVG.
class FakeNode {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.childNodes = [];
    this.attributes = {};
    this.dataset = {};
    this.className = '';
    this.style = { setProperty() {} };
  }
  append(...nodes) {
    this.childNodes.push(...nodes);
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
  addEventListener() {}
  get textContent() {
    return this.childNodes.map((node) => (typeof node === 'string' ? node : node.textContent)).join('');
  }
  set textContent(text) {
    this.childNodes = [String(text)];
  }
  find(match) {
    return this.childNodes.flatMap((node) => (typeof node === 'string' ? [] : [...(match(node) ? [node] : []), ...node.find(match)]));
  }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (tag) => new FakeNode(tag), createElementNS: (namespace, tag) => new FakeNode(tag) };

test('the mark and the row show only with an invite link, and open it in a new card', async () => {
  const { discordButton, discordRow } = await import('../src/client/discord.js');
  const { state } = await import('../src/client/state.js');

  // As the game is now: no link, nothing to show.
  state.content = { community: runInLanguage('pl', () => publicContent()).community };
  assert.equal(discordButton(), null);
  assert.equal(discordRow(), null);
  // No content yet (the start screen): nothing either.
  state.content = null;
  assert.equal(discordButton(), null);
  assert.equal(discordRow(), null);

  const invite = 'https://discord.gg/insightrpg';
  state.content = { community: { discord: { invite, texts: { join: 'Dołącz do serwera Discord' } } } };
  const mark = discordButton();
  assert.equal(mark.tagName, 'A');
  assert.equal(mark.className, 'community-discord');
  assert.deepEqual([mark.getAttribute('href'), mark.getAttribute('target'), mark.getAttribute('rel')], [invite, '_blank', 'noopener noreferrer']);
  // Its words for the screen reader and the pointer.
  assert.equal(mark.getAttribute('title'), 'Dołącz do serwera Discord');
  assert.equal(mark.textContent, 'Dołącz do serwera Discord');
  // Discord's mark: white on its Blurple tile.
  const [svg] = mark.find((node) => node.tagName === 'SVG');
  assert.equal(svg.getAttribute('aria-hidden'), 'true');
  assert.equal(svg.find((node) => node.tagName === 'RECT')[0].getAttribute('fill'), '#5865F2');
  assert.equal(svg.find((node) => node.tagName === 'PATH')[0].getAttribute('fill'), '#ffffff');

  const row = discordRow();
  assert.equal(row.className, 'status-row status-row--discord');
  assert.equal(row.find((node) => node.tagName === 'DT')[0].textContent, 'Discord');
  const [link] = row.find((node) => node.tagName === 'A');
  assert.deepEqual([link.getAttribute('href'), link.getAttribute('target'), link.getAttribute('rel')], [invite, '_blank', 'noopener noreferrer']);
  assert.equal(link.textContent, 'Dołącz do serwera Discord');
});

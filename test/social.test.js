// Facebook, TikTok and Wattpad in the Ustawienia (the author, 18.11.2026:
// „podepnij facebooka, tiktoka i wattpada do gry, gdzieś w ustawienia albo
// społeczność obok discorda z przyciskami”): the links in
// data/community.json, which the page gets with the game's content, and a
// row each below Discord's (src/client/social.js), which opens the link in a
// new card and shows only while there is one.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { publicContent } from '../src/server/content.js';
import { runInLanguage } from '../src/server/i18n.js';
import { loadData, validateData } from '../tools/validate-data.mjs';

// The links the author sent on 18.11.2026, Wattpad's without its sharing
// tags, and the wiki's on 22.11.2026.
const LINKS = {
  facebook: 'https://www.facebook.com/share/1AQJtnqMi2/',
  tiktok: 'https://www.tiktok.com/@insight_rpg',
  wattpad: 'https://www.wattpad.com/story/419946881',
  wiki: 'https://insightrpg.fandom.com/pl/wiki/Klasy_i_Ewolucje',
};

test("the links are the author's, and each place takes only its own", () => {
  const places = loadData().community.social.places;
  assert.deepEqual(Object.fromEntries(places.map((place) => [place.id, place.url])), LINKS);
  const errors = (id, url) => {
    const data = structuredClone(loadData());
    data.community.social.places.find((place) => place.id === id).url = url;
    return validateData(data);
  };
  for (const [id, url] of [['facebook', ''], ['facebook', 'https://facebook.com/insightrpg'], ['tiktok', 'https://tiktok.com/@insight_rpg'], ['wattpad', 'https://wattpad.com/user/InsightRPG'], ['wiki', 'https://insightrpg.fandom.com/pl/wiki/Insight_RPG_Wiki']]) {
    assert.deepEqual(errors(id, url), [], `${id} ${url}`);
  }
  for (const [id, url] of [['facebook', 'http://www.facebook.com/share/1AQJtnqMi2/'], ['facebook', 'https://www.tiktok.com/@insight_rpg'], ['tiktok', 'https://example.com/@insight_rpg'], ['wattpad', 'wattpad.com/story/419946881'], ['wiki', 'https://www.wattpad.com/story/419946881'], ['wiki', 'https://insightrpg.wikia.example.com/pl/']]) {
    assert.match(errors(id, url)[0] ?? '', /^community\.json\/social\/places\/\d+\/url: must match pattern/, `${id} ${url}`);
  }
});

test("the page gets the links and the buttons' words in its language", () => {
  const pl = runInLanguage('pl', () => publicContent()).community.social.places;
  const en = runInLanguage('en', () => publicContent()).community.social.places;
  assert.deepEqual(
    pl.map((place) => [place.id, place.url, place.label]),
    [
      ['facebook', LINKS.facebook, 'Odwiedź nas na Facebooku'],
      ['tiktok', LINKS.tiktok, 'Obserwuj nas na TikToku'],
      ['wattpad', LINKS.wattpad, 'Czytaj powieść ze świata gry'],
      ['wiki', LINKS.wiki, 'Zajrzyj do wiki tworzonej przez graczy'],
    ],
  );
  assert.deepEqual(
    en.map((place) => [place.id, place.url, place.label]),
    [
      ['facebook', LINKS.facebook, 'Visit us on Facebook'],
      ['tiktok', LINKS.tiktok, 'Follow us on TikTok'],
      ['wattpad', LINKS.wattpad, "Read the novel set in the game's world"],
      ['wiki', LINKS.wiki, "Browse the players' wiki (in Polish)"],
    ],
  );
});

// Just enough of a document for dom.js's h() and the marks' SVG.
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

test('a row for each place with a link, below Discord, opening it in a new card', async () => {
  const { socialRows } = await import('../src/client/social.js');
  const { state } = await import('../src/client/state.js');

  // No content yet (the start screen): no rows.
  state.content = null;
  assert.deepEqual(socialRows(), []);

  const community = runInLanguage('pl', () => publicContent()).community;
  state.content = { community };
  const rows = socialRows();
  assert.deepEqual(
    rows.map((row) => row.className),
    ['status-row status-row--social status-row--facebook', 'status-row status-row--social status-row--tiktok', 'status-row status-row--social status-row--wattpad', 'status-row status-row--social status-row--wiki'],
  );
  assert.deepEqual(
    rows.map((row) => row.find((node) => node.tagName === 'DT')[0].textContent),
    ['Facebook', 'TikTok', 'Wattpad', 'Wiki'],
  );
  for (const [row, place] of rows.map((row, index) => [row, community.social.places[index]])) {
    const [link] = row.find((node) => node.tagName === 'A');
    assert.deepEqual([link.getAttribute('href'), link.getAttribute('target'), link.getAttribute('rel')], [place.url, '_blank', 'noopener noreferrer']);
    assert.equal(link.textContent, place.label);
    const [svg] = link.find((node) => node.tagName === 'SVG');
    assert.equal(svg.getAttribute('aria-hidden'), 'true');
  }
  // The marks in their brands' colours: Facebook's white f in its blue
  // circle, TikTok's white note on black, Wattpad's white W on its orange,
  // Fandom's white mark on its pink for the wiki.
  const colours = rows.map((row) => row.find((node) => ['CIRCLE', 'RECT', 'PATH'].includes(node.tagName)).map((node) => [node.tagName, node.getAttribute('fill')]));
  assert.deepEqual(colours, [
    [['CIRCLE', '#ffffff'], ['PATH', '#0866FF']],
    [['RECT', '#000000'], ['PATH', '#ffffff']],
    [['RECT', '#FF500A'], ['PATH', '#ffffff']],
    [['RECT', '#FA005A'], ['PATH', '#ffffff']],
  ]);

  // A place without a link does not show; the others stay in their order.
  state.content = { community: { ...community, social: { places: community.social.places.map((place) => (place.id === 'tiktok' ? { ...place, url: '' } : place)) } } };
  assert.deepEqual(
    socialRows().map((row) => row.find((node) => node.tagName === 'DT')[0].textContent),
    ['Facebook', 'Wattpad', 'Wiki'],
  );
});

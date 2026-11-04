// "Co nowego?" (the author's answers 594 A + C and 595 A; src/server/news.js):
// after entering the game the entries the account has not seen yet open once
// in a sheet, as soon as nothing of the narrator's waits (the introduction
// first, for a new player); the scroll in the top bar, without a dot, opens
// the latest entries at any time. Only the entries the author published show.

import { h } from './dom.js';
import { narratorIdle } from './narrator.js';
import { call, state } from './state.js';
import { afterSheet, closeSheet, openSheet } from './ui.js';

const dateFormat = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'numeric', year: 'numeric' });

// The entry's text: a line beginning with "- " is a point of a list, any
// other line a paragraph of its own.
function textOf(body) {
  const blocks = [];
  let list = null;
  for (const line of body.split('\n')) {
    const text = line.trim();
    if (!text) {
      list = null;
    } else if (text.startsWith('- ')) {
      if (!list) {
        list = h('ul', { class: 'news-points' });
        blocks.push(list);
      }
      list.append(h('li', { text: text.slice(2) }));
    } else {
      list = null;
      blocks.push(h('p', { class: 'news-text', text }));
    }
  }
  return blocks;
}

export const newsEntry = (entry) =>
  h(
    'article',
    { class: 'card news-entry' },
    h('h3', { class: 'news-title' }, entry.title, h('span', { class: 'news-date', text: ` · ${dateFormat.format(new Date(entry.publishedAt))}` })),
    textOf(entry.body),
  );

// The newest entry the account has seen, as the server last told it.
let seenUpTo = 0;

// The account has seen the entries up to the newest of these.
function seen(entries) {
  const newest = Math.max(0, ...entries.map((entry) => entry.id));
  if (!newest || newest <= seenUpTo) return;
  seenUpTo = newest;
  call('POST', '/api/news/seen', { id: newest }).catch(() => {});
}

// The scroll in the top bar: the latest entries, newest first.
export async function openNews() {
  const { entries, seen: before } = await call('GET', '/api/news');
  seenUpTo = Math.max(seenUpTo, before);
  openSheet(
    h('h2', { class: 'sheet-title', text: 'Co nowego?' }),
    entries.length === 0 ? h('p', { class: 'sheet-text muted', text: 'Na razie nie ma tu wpisów.' }) : h('div', { class: 'news-entries' }, entries.map(newsEntry)),
    h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--system', text: 'Zamknij', onClick: closeSheet })),
  );
  seen(entries);
}

// The window after entering the game: once a page load, when a character
// plays, the narrator has nothing to say and no other window is open, the
// entries the account has not seen; app.js asks again on each screen.
let asked = false;
// A character from before the introduction (its `tutorial` null) has no
// narrator waiting to speak.
const quiet = () => state.character?.tutorial === null || narratorIdle();
export async function showNewsIfAny() {
  if (asked || !state.character || !quiet() || document.querySelector('dialog[open]')) return;
  asked = true;
  const { entries, seen: before, since } = await call('GET', '/api/news');
  seenUpTo = Math.max(seenUpTo, before);
  const unseen = entries.filter((entry) => entry.id > before && entry.publishedAt > since);
  if (unseen.length === 0) return;
  // Another window opened meanwhile: the next screen asks again.
  if (document.querySelector('dialog[open]')) {
    asked = false;
    return;
  }
  openSheet(
    h('h2', { class: 'sheet-title', text: 'Co nowego?' }),
    h('p', { class: 'sheet-text muted', text: 'Od Twojej ostatniej wizyty:' }),
    h('div', { class: 'news-entries' }, unseen.map(newsEntry)),
    h(
      'div',
      { class: 'sheet-actions' },
      entries.length > unseen.length && h('button', { type: 'button', class: 'button button--world', text: 'Wcześniejsze wpisy', onClick: () => openNews().catch(() => {}) }),
      h('button', { type: 'button', class: 'button button--system', text: 'Zamknij', onClick: closeSheet }),
    ),
  );
  afterSheet(() => seen(unseen));
}

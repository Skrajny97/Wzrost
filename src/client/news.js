// "Co nowego?" (the author's answers 594 A + C and 595 A; src/server/news.js):
// the scroll in the top bar opens the latest entries, and while an entry the
// account has not seen waits it has a yellow dot. No window opens by itself
// (the author, 4.11.2026: „wyłączmy to wyświetlanie i dajmy tylko żółtą
// kropkę jak wjedzie nowy wpis”). Only the entries the author published show.

import { h } from './dom.js';
import { language, t } from './i18n.js';
import { call, state } from './state.js';
import { closeSheet, openSheet } from './ui.js';

// The entries stay in Polish until English comes to the live game; their
// dates follow the page's language.
const dateFormat = { format: (date) => new Intl.DateTimeFormat(language() === 'en' ? 'en-GB' : 'pl-PL', { day: 'numeric', month: 'numeric', year: 'numeric' }).format(date) };

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

// The newest entry the account has seen, as the server last told it, and
// the newest one it has not seen yet (0 for none): the scroll's dot.
let seenUpTo = 0;
let unseenUpTo = 0;
export const newsWaiting = () => unseenUpTo > seenUpTo;

// The account has seen the entries up to the newest of these.
function seen(entries) {
  const newest = Math.max(0, ...entries.map((entry) => entry.id));
  if (!newest || newest <= seenUpTo) return;
  seenUpTo = newest;
  call('POST', '/api/news/seen', { id: newest }).catch(() => {});
}

// Whether an entry waits that the account has not seen: one published after
// the account was made and after the newest it has seen. A character plays
// when it is asked, on entering the game and then every ten minutes
// (app.js), so an entry published meanwhile lights the dot too.
const EVERY = 10 * 60000;
let checkedAt = -Infinity;
export function watchNews(now) {
  if (!state.character || now - checkedAt < EVERY) return;
  checkedAt = now;
  call('GET', '/api/news')
    .then(({ entries, seen: before, since }) => {
      seenUpTo = Math.max(seenUpTo, before);
      unseenUpTo = Math.max(0, ...entries.filter((entry) => entry.id > before && entry.publishedAt > since).map((entry) => entry.id));
    })
    .catch(() => {});
}

// Leaving the game: the next account starts afresh.
export function forgetNews() {
  seenUpTo = 0;
  unseenUpTo = 0;
  checkedAt = -Infinity;
}

// The scroll in the top bar: the latest entries, newest first.
export async function openNews() {
  const { entries, seen: before } = await call('GET', '/api/news');
  seenUpTo = Math.max(seenUpTo, before);
  openSheet(
    h('h2', { class: 'sheet-title', text: t('Co nowego?') }),
    entries.length === 0 ? h('p', { class: 'sheet-text muted', text: t('Na razie nie ma tu wpisów.') }) : h('div', { class: 'news-entries' }, entries.map(newsEntry)),
    h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--system', text: t('Zamknij'), onClick: closeSheet })),
  );
  seen(entries);
}

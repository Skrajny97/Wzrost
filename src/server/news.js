// "Co nowego?" (the author's answers 594 A + C and 595 A): the entries the
// author publishes in the Panel autora, each from a draft of data/news.json
// (one a version, as the game's changes go out) or written there from
// scratch, and nothing before "Opublikuj". The scroll in the top bar lists
// the latest entries at any time, with a dot while one waits that was
// published after the account was made and after the newest one the account
// has seen (`news_seen`); no window opens by itself (the author, 4.11.2026).
// A player in English reads each entry in English (0.2.2): the draft's own
// English when the entry is the draft as written, else the machine's.

import news from '../../data/news.json' with { type: 'json' };
import { isAuthor } from './author.js';
import { OVERLAYS } from './content.js';
import { englishOn } from './features.js';
import { ApiError, json, readJson } from './http.js';
import { language } from './i18n.js';
import { requireSession } from './sessions.js';
import { translateText } from './translate.js';

const { limits } = news;
const draftsById = Object.fromEntries(news.drafts.map((draft) => [draft.id, draft]));

// An entry as a player reads it: in English where the player plays in it
// and the entry has its English.
const entryView = (row, lang = 'pl') => ({
  id: row.id,
  title: lang === 'en' && row.title_en ? row.title_en : row.title,
  body: lang === 'en' && row.body_en ? row.body_en : row.body,
  publishedAt: row.published_at,
  ...(row.edited_at !== null && row.edited_at !== undefined && { editedAt: row.edited_at }),
});

// The translator's calls one listing may spend on entries still without
// their English (an entry costs one for its title and one a line).
const TRANSLATIONS_PER_LIST = 8;

// "Wersja 0.1.39: Warownia": the version said by rule, the rest by the
// translator.
const VERSION_TITLE = /^Wersja (\d+(?:\.\d+)+)(?::\s*(.+))?$/;

// An entry's English, or null when it cannot be made now: the draft's own
// when the entry is its draft as written, else the translator's, line by
// line so that the list's "- " stays. `budget.calls` is what the
// translator may still be asked.
async function englishOf(env, row, budget) {
  const draft = row.draft ? draftsById[row.draft] : null;
  const own = draft ? OVERLAYS.en.news?.drafts?.[draft.id] : null;
  if (own?.title && own?.body && draft.title === row.title && draft.body === row.body) return { title: own.title, body: own.body };
  const lines = row.body.split('\n');
  if (budget.calls < 1 + lines.length) return null;
  budget.calls -= 1 + lines.length;
  const translate = (text) => translateText(env, text, 'pl', 'en');
  const version = row.title.match(VERSION_TITLE);
  const named = version ? (version[2] ? await translate(version[2]) : '') : await translate(row.title);
  if (named === null) return null;
  const title = version ? `Version ${version[1]}${named ? `: ${named}` : ''}` : named;
  const body = [];
  for (const line of lines) {
    const [, mark = '', text] = line.match(/^(- )?([\s\S]*)$/);
    if (!text.trim()) {
      body.push(line);
      continue;
    }
    const english = await translate(text);
    if (!english) return null;
    body.push(mark + english);
  }
  return { title, body: body.join('\n') };
}

// After the translator failed, players' listings leave it alone for a while
// (the page asks for the list every ten minutes); the author's "Opublikuj"
// and corrections always try.
const QUIET_MS = 10 * 60000;
let quietUntil = 0;

// Makes and keeps the English of the entries that have none yet, as far as
// `budget` lets the translator go. An entry corrected meanwhile keeps none
// (the UPDATE finds its text changed) and gets it from its correction.
async function fillEnglish(env, rows, budget, now) {
  if (!englishOn()) return;
  for (const row of rows) {
    if (row.title_en) continue;
    if (Number.isFinite(budget.calls) && now < quietUntil) budget.calls = 0;
    const before = budget.calls;
    let english = null;
    try {
      english = await englishOf(env, row, budget);
    } catch (error) {
      console.error('news english:', error);
    }
    // The translator was asked and gave nothing.
    if (!english && budget.calls < before) quietUntil = now + QUIET_MS;
    if (!english) continue;
    row.title_en = english.title;
    row.body_en = english.body;
    await env.DB.prepare('UPDATE news SET title_en = ?, body_en = ? WHERE id = ? AND title = ? AND body = ?').bind(english.title, english.body, row.id, row.title, row.body).run();
  }
}

// GET /api/news: the latest entries, newest first, in the player's language,
// with what the account has seen and since when it plays, so the page knows
// which are new to it.
export async function listNews(context) {
  const session = await requireSession(context);
  const { results } = await context.env.DB.prepare('SELECT * FROM news ORDER BY id DESC LIMIT ?').bind(limits.shown).all();
  const lang = language();
  if (lang === 'en') await fillEnglish(context.env, results, { calls: TRANSLATIONS_PER_LIST }, context.now);
  return json({ entries: results.map((row) => entryView(row, lang)), seen: session.newsSeen ?? 0, since: session.user.createdAt });
}

// The entry a request names by its number. Anything else is refused here,
// as D1 cannot bind it and the request would end in an error 500 (the
// code review: an edit or a deletion without a number).
function entryId(body) {
  if (!Number.isSafeInteger(body.id) || body.id < 1) throw new ApiError(400, 'invalid_id', 'Nie ma takiego wpisu.');
  return body.id;
}

// POST /api/news/seen { id }: the window was seen up to this entry.
export async function seeNews(context) {
  const session = await requireSession(context);
  const body = await readJson(context.request);
  const id = entryId(body);
  const db = context.env.DB;
  await db.prepare('UPDATE users SET news_seen = ? WHERE id = ? AND news_seen < ? AND EXISTS (SELECT 1 FROM news WHERE id = ?)').bind(id, session.userId, id, id).run();
  return json({ ok: true });
}

// The author's account only; anyone else finds nothing here.
async function requireAuthor(context) {
  const session = await requireSession(context);
  if (!isAuthor(context.env, session.user)) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  return session;
}

// A title and a text as the author typed them: trimmed, with Windows line
// ends made plain, within the data's limits.
function written(body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const text = typeof body.body === 'string' ? body.body.replace(/\r\n?/g, '\n').trim() : '';
  if (!title || title.length > limits.title) throw new ApiError(400, 'invalid_title', `Tytuł musi mieć od 1 do ${limits.title} znaków.`);
  if (!text || text.length > limits.body) throw new ApiError(400, 'invalid_body', `Treść musi mieć od 1 do ${limits.body} znaków.`);
  return { title, text };
}

// What the Panel autora shows: the drafts neither published nor deleted, as
// the data has them, and every published entry, newest first.
async function authorView(db) {
  const [{ results }, { results: dismissed }] = await db.batch([
    db.prepare('SELECT * FROM news ORDER BY id DESC'),
    db.prepare('SELECT draft FROM news_dismissed'),
  ]);
  const hidden = new Set([...results.map((row) => row.draft).filter(Boolean), ...dismissed.map((row) => row.draft)]);
  return {
    limits: { title: limits.title, body: limits.body },
    drafts: news.drafts.filter((draft) => !hidden.has(draft.id)),
    entries: results.map((row) => ({ ...entryView(row), draft: row.draft ?? null, english: Boolean(row.title_en) })),
  };
}

// GET /api/author/news
export async function authorNews(context) {
  await requireAuthor(context);
  return json(await authorView(context.env.DB));
}

// POST /api/author/news { draft?, title, body }: "Opublikuj", a draft (once)
// with the author's corrections, or a new entry.
export async function publishNews(context) {
  await requireAuthor(context);
  const body = await readJson(context.request);
  const draft = body.draft ?? null;
  if (draft !== null && !Object.hasOwn(draftsById, draft)) throw new ApiError(400, 'invalid_draft', 'Nie ma takiego szkicu.');
  const { title, text } = written(body);
  const db = context.env.DB;
  const result = await db
    .prepare('INSERT INTO news (draft, title, body, published_at) SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM news WHERE draft IS NOT NULL AND draft = ?)')
    .bind(draft, title, text, context.now, draft)
    .run();
  if (result.meta.changes !== 1) throw new ApiError(409, 'published', 'Ten szkic jest już opublikowany.');
  // Its English at once, so that players in English read it from the start.
  await fillEnglish(context.env, [{ id: result.meta.last_row_id, draft, title, body: text }], { calls: Infinity }, context.now);
  return json(await authorView(db), 201);
}

// POST /api/author/news/dismiss { draft }: "Usuń" by a draft (the author,
// 6.11.2026). It leaves the drafts for good; a draft is in the game's data,
// so the deletion is kept apart (news_dismissed). An entry already published
// from it stays, and deleting that entry no longer brings the draft back.
export async function dismissDraft(context) {
  await requireAuthor(context);
  const body = await readJson(context.request);
  if (!Object.hasOwn(draftsById, body.draft)) throw new ApiError(400, 'invalid_draft', 'Nie ma takiego szkicu.');
  const db = context.env.DB;
  await db.prepare('INSERT OR IGNORE INTO news_dismissed (draft, dismissed_at) VALUES (?, ?)').bind(body.draft, context.now).run();
  return json(await authorView(db));
}

// POST /api/author/news/edit { id, title, body }: a published entry corrected.
// Players who saw it do not get it again.
export async function editNews(context) {
  await requireAuthor(context);
  const body = await readJson(context.request);
  const id = entryId(body);
  const { title, text } = written(body);
  const db = context.env.DB;
  const result = await db
    .prepare('UPDATE news SET title = ?, body = ?, edited_at = ?, title_en = NULL, body_en = NULL WHERE id = ? RETURNING id, draft, title, body')
    .bind(title, text, context.now, id)
    .all();
  if (result.results.length !== 1) throw new ApiError(404, 'not_found', 'Nie ma takiego wpisu.');
  // The correction in English too.
  await fillEnglish(context.env, result.results, { calls: Infinity }, context.now);
  return json(await authorView(db));
}

// POST /api/author/news/delete { id }: an entry taken down; a draft it came
// from waits in the drafts again, unless the author deleted that draft.
export async function deleteNews(context) {
  await requireAuthor(context);
  const body = await readJson(context.request);
  const id = entryId(body);
  const db = context.env.DB;
  const result = await db.prepare('DELETE FROM news WHERE id = ?').bind(id).run();
  if (result.meta.changes !== 1) throw new ApiError(404, 'not_found', 'Nie ma takiego wpisu.');
  return json(await authorView(db));
}

// "Co nowego?" (the author's answers 594 A + C and 595 A): the entries the
// author publishes in the Panel autora, each from a draft of data/news.json
// (one a version, as the game's changes go out) or written there from
// scratch, and nothing before "Opublikuj". The scroll in the top bar lists
// the latest entries at any time, with a dot while one waits that was
// published after the account was made and after the newest one the account
// has seen (`news_seen`); no window opens by itself (the author, 4.11.2026).

import news from '../../data/news.json' with { type: 'json' };
import { isAuthor } from './author.js';
import { ApiError, json, readJson } from './http.js';
import { requireSession } from './sessions.js';

const { limits } = news;
const draftsById = Object.fromEntries(news.drafts.map((draft) => [draft.id, draft]));

const entryView = (row) => ({
  id: row.id,
  title: row.title,
  body: row.body,
  publishedAt: row.published_at,
  ...(row.edited_at !== null && row.edited_at !== undefined && { editedAt: row.edited_at }),
});

// GET /api/news: the latest entries, newest first, with what the account
// has seen and since when it plays, so the page knows which are new to it.
export async function listNews(context) {
  const session = await requireSession(context);
  const { results } = await context.env.DB.prepare('SELECT * FROM news ORDER BY id DESC LIMIT ?').bind(limits.shown).all();
  return json({ entries: results.map(entryView), seen: session.newsSeen ?? 0, since: session.user.createdAt });
}

// POST /api/news/seen { id }: the window was seen up to this entry.
export async function seeNews(context) {
  const session = await requireSession(context);
  const body = await readJson(context.request);
  if (!Number.isInteger(body.id) || body.id < 1) throw new ApiError(400, 'invalid_id', 'Nie ma takiego wpisu.');
  const db = context.env.DB;
  await db.prepare('UPDATE users SET news_seen = ? WHERE id = ? AND news_seen < ? AND EXISTS (SELECT 1 FROM news WHERE id = ?)').bind(body.id, session.userId, body.id, body.id).run();
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
    entries: results.map((row) => ({ ...entryView(row), draft: row.draft ?? null })),
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
  const { title, text } = written(body);
  const db = context.env.DB;
  const result = await db.prepare('UPDATE news SET title = ?, body = ?, edited_at = ? WHERE id = ?').bind(title, text, context.now, body.id).run();
  if (result.meta.changes !== 1) throw new ApiError(404, 'not_found', 'Nie ma takiego wpisu.');
  return json(await authorView(db));
}

// POST /api/author/news/delete { id }: an entry taken down; a draft it came
// from waits in the drafts again, unless the author deleted that draft.
export async function deleteNews(context) {
  await requireAuthor(context);
  const body = await readJson(context.request);
  const db = context.env.DB;
  const result = await db.prepare('DELETE FROM news WHERE id = ?').bind(body.id).run();
  if (result.meta.changes !== 1) throw new ApiError(404, 'not_found', 'Nie ma takiego wpisu.');
  return json(await authorView(db));
}

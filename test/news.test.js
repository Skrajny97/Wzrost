// "Co nowego?" (the author's answers 594 A + C and 595 A): the author
// publishes a draft of data/news.json, corrected or not, or a new entry, in
// the Panel autora; a player's window shows each entry once, only those that
// came after the account was made, and the list shows them all.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import enNews from '../data/en/news.json' with { type: 'json' };
import news from '../data/news.json' with { type: 'json' };
import { useServer } from './helpers/server.js';

describe('Co nowego?', () => {
  const { call, db, signUp } = useServer({ AUTHOR_LOGINS: 'szef' });
  let player;
  let author;

  beforeEach(async () => {
    ({ cookie: player } = await signUp('gracz'));
    await call('POST', '/api/character', { cookie: player, body: { name: 'Gracz', classId: 'mage', appearance: 'female' } });
    // The player's account is older than anything published below.
    await (await db()).prepare("UPDATE users SET created_at = created_at - 60000 WHERE login = 'gracz'").run();
    ({ cookie: author } = await signUp('szef'));
    await (await db()).prepare("UPDATE users SET google_sub = 'szef' WHERE login = 'szef'").run();
  });

  const publish = (body) => call('POST', '/api/author/news', { cookie: author, body });
  // The entries the account's window would show.
  const unseen = async (cookie) => {
    const { entries, seen, since } = (await call('GET', '/api/news', { cookie })).data;
    return entries.filter((entry) => entry.id > seen && entry.publishedAt > since).length;
  };

  test('only the author finds the drafts, and nothing shows to players before "Opublikuj"', async () => {
    assert.equal((await call('GET', '/api/author/news', { cookie: player })).status, 404);
    assert.equal((await call('POST', '/api/author/news', { cookie: player, body: { title: 'x', body: 'y' } })).status, 404);
    const panel = (await call('GET', '/api/author/news', { cookie: author })).data;
    assert.deepEqual(
      panel.drafts.map((draft) => draft.id),
      news.drafts.map((draft) => draft.id),
    );
    assert.deepEqual(panel.entries, []);
    assert.equal(await unseen(player), 0);
    assert.deepEqual((await call('GET', '/api/news', { cookie: player })).data.entries, []);
  });

  test('a draft goes out once, with the author’s corrections, and a new entry from scratch too', async () => {
    const [draft] = news.drafts;
    const first = await publish({ draft: draft.id, title: draft.title, body: `${draft.body}\n- Poprawka autora.` });
    assert.equal(first.status, 201, JSON.stringify(first.data));
    assert.ok(!first.data.drafts.some((one) => one.id === draft.id));
    assert.equal(first.data.entries[0].draft, draft.id);
    assert.match(first.data.entries[0].body, /Poprawka autora\.$/);
    assert.equal((await publish({ draft: draft.id, title: draft.title, body: draft.body })).data.error.code, 'published');
    assert.equal((await publish({ draft: '9.9.9', title: 'x', body: 'y' })).data.error.code, 'invalid_draft');
    assert.equal((await publish({ title: '   ', body: 'y' })).data.error.code, 'invalid_title');
    assert.equal((await publish({ title: 'x', body: 'y'.repeat(news.limits.body + 1) })).data.error.code, 'invalid_body');
    const own = await publish({ title: 'Turniej w sobotę', body: 'Od 18:00 na czacie.\r\n- Nagrody: Punkty Systemu.' });
    assert.equal(own.status, 201);
    assert.equal(own.data.entries[0].draft, null);
    // Line ends kept plain.
    assert.equal(own.data.entries[0].body, 'Od 18:00 na czacie.\n- Nagrody: Punkty Systemu.');
  });

  test('the window shows each entry once, the list shows them all, and a newer account starts after them', async () => {
    await publish({ draft: news.drafts[0].id, title: news.drafts[0].title, body: news.drafts[0].body });
    await publish({ title: 'Drugi wpis', body: 'Treść.' });
    assert.equal(await unseen(player), 2);
    const list = (await call('GET', '/api/news', { cookie: player })).data;
    assert.deepEqual(
      list.entries.map((entry) => entry.title),
      ['Drugi wpis', news.drafts[0].title],
    );
    assert.equal(list.seen, 0);
    assert.equal((await call('POST', '/api/news/seen', { cookie: player, body: { id: 0 } })).data.error.code, 'invalid_id');
    assert.equal((await call('POST', '/api/news/seen', { cookie: player, body: { id: list.entries[0].id } })).status, 200);
    assert.equal(await unseen(player), 0);
    // An older entry seen later does not bring the newer one back.
    await call('POST', '/api/news/seen', { cookie: player, body: { id: list.entries[1].id } });
    assert.equal((await call('GET', '/api/news', { cookie: player })).data.seen, list.entries[0].id);
    // A new account is not greeted with what came before it, but can read it.
    const { cookie: fresh } = await signUp('nowy');
    assert.equal(await unseen(fresh), 0);
    assert.equal((await call('GET', '/api/news', { cookie: fresh })).data.entries.length, 2);
  });

  test('the author deletes a draft for good; a published entry stays and its deletion does not bring the draft back', async () => {
    const dismiss = (draft, cookie = author) => call('POST', '/api/author/news/dismiss', { cookie, body: { draft } });
    const [first, second] = news.drafts;
    assert.equal((await dismiss(first.id, player)).status, 404);
    assert.equal((await dismiss('9.9.9')).data.error.code, 'invalid_draft');
    const gone = await dismiss(first.id);
    assert.equal(gone.status, 200, JSON.stringify(gone.data));
    assert.ok(!gone.data.drafts.some((draft) => draft.id === first.id));
    assert.equal(gone.data.drafts.length, news.drafts.length - 1);
    // Twice is no error, and the draft stays gone on the next visit.
    assert.equal((await dismiss(first.id)).status, 200);
    assert.ok(!(await call('GET', '/api/author/news', { cookie: author })).data.drafts.some((draft) => draft.id === first.id));
    // A draft published, then deleted, then its entry taken down: it does not come back.
    const made = await publish({ draft: second.id, title: second.title, body: second.body });
    const [entry] = made.data.entries;
    await dismiss(second.id);
    assert.equal((await call('GET', '/api/news', { cookie: player })).data.entries.length, 1);
    const down = await call('POST', '/api/author/news/delete', { cookie: author, body: { id: entry.id } });
    assert.ok(!down.data.drafts.some((draft) => draft.id === second.id));
    assert.equal(await unseen(player), 0);
  });

  test('a correction does not show an entry again; a deleted one gives its draft back and never its number', async () => {
    const made = await publish({ draft: news.drafts[0].id, title: news.drafts[0].title, body: news.drafts[0].body });
    const [entry] = made.data.entries;
    await call('POST', '/api/news/seen', { cookie: player, body: { id: entry.id } });
    const edited = await call('POST', '/api/author/news/edit', { cookie: author, body: { id: entry.id, title: 'Wersja poprawiona', body: 'Nowa treść.' } });
    assert.equal(edited.status, 200, JSON.stringify(edited.data));
    assert.equal(edited.data.entries[0].title, 'Wersja poprawiona');
    assert.ok(edited.data.entries[0].editedAt > 0);
    assert.equal(await unseen(player), 0);
    assert.equal((await call('POST', '/api/author/news/edit', { cookie: author, body: { id: 999, title: 'x', body: 'y' } })).status, 404);
    const gone = await call('POST', '/api/author/news/delete', { cookie: author, body: { id: entry.id } });
    assert.deepEqual(gone.data.entries, []);
    assert.ok(gone.data.drafts.some((draft) => draft.id === news.drafts[0].id));
    // The next entry takes a new number, so the player who saw the deleted one sees it.
    const next = await publish({ title: 'Po usunięciu', body: 'Treść.' });
    assert.ok(next.data.entries[0].id > entry.id);
    assert.equal(await unseen(player), 1);
  });
});

// "Co nowego?" in English (0.2.2): a draft published as written reads in its
// own English (data/en/news.json), anything else in the translator's, kept
// once made; a player in Polish reads the Polish.
describe('Co nowego? po angielsku', () => {
  const { server, db, signUp } = useServer({ AUTHOR_LOGINS: 'szef', ENGLISH: 'on', FAKE_TRANSLATOR: 'on' });
  const ask = async (method, path, { body, cookie, lang } = {}) => {
    const headers = { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(cookie && { Cookie: cookie }), ...(lang && { 'X-Lang': lang }) };
    const response = await server.fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  let player;
  let author;

  beforeEach(async () => {
    ({ cookie: player } = await signUp('gracz'));
    await ask('POST', '/api/character', { cookie: player, body: { name: 'Gracz', classId: 'mage', appearance: 'female' } });
    ({ cookie: author } = await signUp('szef'));
    await (await db()).prepare("UPDATE users SET google_sub = 'szef' WHERE login = 'szef'").run();
  });

  const publish = (body) => ask('POST', '/api/author/news', { cookie: author, body });
  const list = async (lang) => (await ask('GET', '/api/news', { cookie: player, lang })).data.entries;

  test('every draft has its English, and a draft published as written reads in it', async () => {
    for (const draft of news.drafts) {
      const own = enNews.drafts[draft.id];
      assert.ok(own?.title && own?.body, `${draft.id}: brak angielskiego`);
      // The same list points in both languages.
      assert.equal(own.body.split('\n').length, draft.body.split('\n').length, draft.id);
    }
    const [draft] = news.drafts;
    const made = await publish({ draft: draft.id, title: draft.title, body: draft.body });
    assert.equal(made.status, 201, JSON.stringify(made.data));
    assert.equal(made.data.entries[0].english, true);
    const [english] = await list('en');
    assert.equal(english.title, enNews.drafts[draft.id].title);
    assert.equal(english.body, enNews.drafts[draft.id].body);
    const [polish] = await list('pl');
    assert.equal(polish.title, draft.title);
    assert.equal(polish.body, draft.body);
  });

  test('an entry of the author’s own, or a corrected draft, goes through the translator, the list’s points kept', async () => {
    const own = await publish({ title: 'Wersja 9.9.9: Turniej', body: 'Od 18:00 na czacie.\n- Nagrody: Punkty Systemu.' });
    assert.equal(own.status, 201);
    const [english] = await list('en');
    assert.equal(english.title, 'Version 9.9.9: [pl→en] Turniej');
    assert.equal(english.body, '[pl→en] Od 18:00 na czacie.\n- [pl→en] Nagrody: Punkty Systemu.');
    // A correction is translated anew.
    await ask('POST', '/api/author/news/edit', { cookie: author, body: { id: own.data.entries[0].id, title: 'Turniej', body: 'Od 19:00.' } });
    const [corrected] = await list('en');
    assert.equal(corrected.title, '[pl→en] Turniej');
    assert.equal(corrected.body, '[pl→en] Od 19:00.');
  });

  test('an entry from before 0.2.2 gets its English on the first list in English, and keeps it', async () => {
    const [draft] = news.drafts;
    const database = await db();
    await database.prepare('INSERT INTO news (draft, title, body, published_at) VALUES (?, ?, ?, 1), (NULL, ?, ?, 2)').bind(draft.id, draft.title, draft.body, 'Stary wpis', 'Treść.').run();
    assert.equal((await list('pl'))[0].title, 'Stary wpis');
    const english = await list('en');
    assert.deepEqual(
      english.map((entry) => entry.title),
      ['[pl→en] Stary wpis', enNews.drafts[draft.id].title],
    );
    const kept = await database.prepare('SELECT title_en FROM news ORDER BY id').all();
    assert.deepEqual(
      kept.results.map((row) => row.title_en),
      [enNews.drafts[draft.id].title, '[pl→en] Stary wpis'],
    );
  });
});

describe('Co nowego? po angielsku bez tłumacza', () => {
  const { server, signUp, db } = useServer({ AUTHOR_LOGINS: 'szef', ENGLISH: 'on' });

  test('without the translator an entry of the author’s own stays Polish for players in English', async () => {
    const { cookie: author } = await signUp('szef');
    await (await db()).prepare("UPDATE users SET google_sub = 'szef' WHERE login = 'szef'").run();
    const headers = { 'Content-Type': 'application/json', Cookie: author };
    const made = await server.fetch('/api/author/news', { method: 'POST', headers, body: JSON.stringify({ title: 'Turniej', body: 'Treść.' }) });
    assert.equal(made.status, 201);
    const listed = await (await server.fetch('/api/news', { headers: { Cookie: author, 'X-Lang': 'en' } })).json();
    assert.equal(listed.entries[0].title, 'Turniej');
  });
});

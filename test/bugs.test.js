// "Zgłoś błąd" (the author: "Trzeba dodac przycisk Zgłoś błąd i zeby
// przychodzil mi w Panel Autora"): a player's report waits in the author's
// panel with the screen, the game's version and the character, until the
// author marks it done; the author's settings show how many wait. A
// screenshot may go with it (the author: "daj opcje dołączania screena w
// zgłoś błąd"), which only the author sees.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { BUG_IMAGE, BUG_REPORTS } from '../src/server/bugs.js';
import { useServer } from './helpers/server.js';

// A PNG of 1×1 px, and a file of `size` bytes that starts as a JPEG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const jpeg = (size) => {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  return bytes;
};
// The phone's word for the file's kind, which the server does not believe.
const file = (bytes, type = 'image/jpeg') => new File([bytes], 'zrzut-ekranu.jpg', { type });

describe('Zgłoś błąd', () => {
  const { server, call, db, signUp } = useServer({ AUTHOR_LOGINS: 'szef' });
  let player;
  let author;

  beforeEach(async () => {
    ({ cookie: player } = await signUp('gracz'));
    await call('POST', '/api/character', { cookie: player, body: { name: 'Gracz', classId: 'mage', appearance: 'female' } });
    ({ cookie: author } = await signUp('szef'));
    await (await db()).prepare("UPDATE users SET google_sub = 'szef' WHERE login = 'szef'").run();
  });

  const report = (cookie, text, screen = '#/walka') => call('POST', '/api/bug-reports', { cookie, body: { text, screen } });
  // A report as a form (multipart/form-data), as the page sends one with a
  // screenshot.
  async function reportForm(cookie, fields) {
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.append(name, value);
    const encoded = new Response(form);
    const response = await server.fetch('/api/bug-reports', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': encoded.headers.get('Content-Type') },
      body: new Uint8Array(await encoded.arrayBuffer()),
    });
    return { status: response.status, data: await response.json() };
  }
  // The author's panel's picture of a report.
  async function picture(cookie, id) {
    const response = await server.fetch(`/api/author/bugs/image?id=${id}`, { headers: cookie ? { Cookie: cookie } : {} });
    return { status: response.status, headers: response.headers, bytes: new Uint8Array(await response.arrayBuffer()) };
  }
  const count = async (table) => (await (await db()).prepare(`SELECT COUNT(*) AS count FROM ${table}`).first()).count;

  test('a report waits in the author\'s panel with the screen, the version and the character, until done', async () => {
    const sent = await report(player, '  Po stuknięciu „Wyrusz” nic się nie dzieje.  ', '#/walka/peat-bogs');
    assert.equal(sent.status, 201, JSON.stringify(sent.data));
    // The author's settings know that one waits.
    assert.equal((await call('GET', '/api/me', { cookie: author })).data.user.bugReports, 1);
    assert.equal((await call('GET', '/api/me', { cookie: player })).data.user.bugReports, undefined);
    const panel = (await call('GET', '/api/author', { cookie: author })).data;
    assert.equal(panel.counts.bugs, 1);
    const [bug] = panel.bugs;
    assert.equal(bug.login, 'gracz');
    assert.equal(bug.text, 'Po stuknięciu „Wyrusz” nic się nie dzieje.');
    assert.equal(bug.screen, '#/walka/peat-bogs');
    assert.match(bug.character, /^Gracz · Mag, poziom 1, klasa 1$/);
    assert.ok(bug.version);
    assert.equal(bug.resolvedAt, null);
    // Done, and back again.
    const done = await call('POST', '/api/author/bugs/resolve', { cookie: author, body: { id: bug.id } });
    assert.deepEqual(done.data, { ok: true, open: 0 });
    assert.ok((await call('GET', '/api/author', { cookie: author })).data.bugs[0].resolvedAt > 0);
    assert.equal((await call('POST', '/api/author/bugs/resolve', { cookie: author, body: { id: bug.id, done: false } })).data.open, 1);
    // Only the author sees the reports and marks them.
    assert.equal((await call('GET', '/api/author', { cookie: player })).status, 404);
    assert.equal((await call('POST', '/api/author/bugs/resolve', { cookie: player, body: { id: bug.id } })).status, 404);
  });

  test('the notifications\' state the page adds goes with the report, cut to its length, also in a form', async () => {
    const state = 'push: permission granted; worker active; subscription none; installed app no; failure 2026-11-12 20:40 UTC, subscribe: AbortError: Registration failed - push service not available';
    const sent = await call('POST', '/api/bug-reports', { cookie: player, body: { text: 'Nie mogę włączyć powiadomień.', screen: '#/czat', details: state } });
    assert.equal(sent.status, 201, JSON.stringify(sent.data));
    assert.equal((await reportForm(player, { text: 'Formularz ze stanem powiadomień.', screen: '#/oboz', details: 'x'.repeat(600) })).status, 201);
    assert.equal((await report(player, 'Zgłoszenie bez stanu powiadomień.')).status, 201);
    const bugs = (await call('GET', '/api/author', { cookie: author })).data.bugs;
    assert.deepEqual(
      bugs.map((bug) => bug.details),
      [null, 'x'.repeat(500), state],
    );
  });

  test('a report has a few words at least and a limit a day, and goes with its account', async () => {
    assert.equal((await report(player, 'krótko')).data.error.code, 'too_short');
    assert.equal((await report(player, 'x'.repeat(BUG_REPORTS.longest + 1))).data.error.code, 'too_long');
    // One with a screenshot counts as any other.
    assert.equal((await reportForm(player, { text: 'Błąd numer 1 w grze.', screen: '#/walka', image: file(PNG, 'image/png') })).status, 201);
    for (let index = 1; index < BUG_REPORTS.daily; index += 1) assert.equal((await report(player, `Błąd numer ${index + 1} w grze.`)).status, 201);
    assert.equal((await report(player, 'Jeszcze jeden błąd w grze.')).data.error.code, 'too_many');
    assert.equal((await reportForm(player, { text: 'Jeszcze jeden, ze zrzutem.', image: file(PNG) })).data.error.code, 'too_many');
    assert.equal(await count('bug_report_images'), 1);
    // Without a session, nothing.
    assert.equal((await call('POST', '/api/bug-reports', { body: { text: 'Błąd bez logowania.' } })).status, 401);
    assert.equal((await reportForm('', { text: 'Błąd bez logowania.', image: file(PNG) })).status, 401);
    // The account deleted, its reports go with it, and their screenshots;
    // the author's own stays.
    assert.equal((await reportForm(author, { text: 'Zgłoszenie autora ze zrzutem.', image: file(PNG) })).status, 201);
    assert.equal((await call('DELETE', '/api/me', { cookie: player, body: { login: 'gracz' } })).status, 200);
    assert.equal(await count('bug_reports'), 1);
    assert.equal(await count('bug_report_images'), 1);
    const [left] = (await call('GET', '/api/author', { cookie: author })).data.bugs;
    assert.equal(left.login, 'szef');
    assert.equal((await picture(author, left.id)).status, 200);
  });

  test('a screenshot goes with a report as a form, and only the author sees it', async () => {
    // The phone says JPEG, the bytes say PNG: the bytes win.
    const sent = await reportForm(player, { text: '  Ekran Osady jest pusty po powrocie.  ', screen: '#/osada', image: file(PNG, 'image/jpeg') });
    assert.equal(sent.status, 201, JSON.stringify(sent.data));
    // A JPEG, a WebP, a form without a picture and a report as JSON, as
    // before.
    assert.equal((await reportForm(player, { text: 'Zrzut w formacie JPEG.', screen: '#/postac', image: file(jpeg(300 * 1024), 'image/png') })).status, 201);
    const webp = new Uint8Array([...Buffer.from('RIFF'), 26, 0, 0, 0, ...Buffer.from('WEBPVP8 '), 0, 0, 0, 0]);
    assert.equal((await reportForm(player, { text: 'Zrzut w formacie WebP.', image: file(webp, '') })).status, 201);
    assert.equal((await reportForm(player, { text: 'Formularz bez zrzutu ekranu.', screen: '#/oboz' })).status, 201);
    assert.equal((await report(player, 'Zgłoszenie bez zrzutu, jak dawniej.')).status, 201);
    const bugs = (await call('GET', '/api/author', { cookie: author })).data.bugs.toReversed();
    assert.deepEqual(
      bugs.map((bug) => [bug.text, bug.screen, bug.image]),
      [
        ['Ekran Osady jest pusty po powrocie.', '#/osada', true],
        ['Zrzut w formacie JPEG.', '#/postac', true],
        ['Zrzut w formacie WebP.', null, true],
        ['Formularz bez zrzutu ekranu.', '#/oboz', false],
        ['Zgłoszenie bez zrzutu, jak dawniej.', '#/walka', false],
      ],
    );
    assert.match(bugs[0].character, /^Gracz · Mag, poziom 1, klasa 1$/);
    // The picture, byte for byte, as its bytes say, for the author alone.
    const shown = await picture(author, bugs[0].id);
    assert.equal(shown.status, 200);
    assert.equal(shown.headers.get('Content-Type'), 'image/png');
    assert.match(shown.headers.get('Cache-Control'), /^private/);
    assert.equal(shown.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.deepEqual(shown.bytes, new Uint8Array(PNG));
    assert.equal((await picture(author, bugs[1].id)).headers.get('Content-Type'), 'image/jpeg');
    assert.equal((await picture(author, bugs[1].id)).bytes.length, 300 * 1024);
    assert.equal((await picture(author, bugs[2].id)).headers.get('Content-Type'), 'image/webp');
    assert.equal((await picture(player, bugs[0].id)).status, 404);
    assert.equal((await picture(null, bugs[0].id)).status, 401);
    // None for a report without one, nor for an id that is no report's.
    for (const id of [bugs[3].id, bugs[4].id, 999, 0, -1, 'abc', '', '1e3', '1;2']) assert.equal((await picture(author, id)).status, 404, String(id));
    // Marked done, the picture stays with the report.
    await call('POST', '/api/author/bugs/resolve', { cookie: author, body: { id: bugs[0].id } });
    assert.equal((await picture(author, bugs[0].id)).status, 200);
  });

  test('a file that is no picture, or one too big, is turned down, and nothing of the report is saved', async () => {
    const text = 'Błąd z dziwnym załącznikiem.';
    const refused = [
      [file(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/png'), 400, 'invalid_image'],
      [file(Buffer.from('GIF89a\x01\x00\x01\x00'), 'image/gif'), 400, 'invalid_image'],
      [file(PNG.subarray(0, 6), 'image/png'), 400, 'invalid_image'],
      ['to nie jest plik', 400, 'invalid_image'],
      [file(jpeg(BUG_IMAGE.most + 1)), 413, 'image_too_large'],
      [file(jpeg(BUG_IMAGE.form + 1)), 413, 'image_too_large'],
    ];
    for (const [image, status, code] of refused) {
      const answer = await reportForm(player, { text, screen: '#/walka', image });
      assert.equal(answer.status, status, code);
      assert.equal(answer.data.error.code, code);
      assert.match(answer.data.error.message, /^(Dołączony plik nie jest obrazkiem|Zrzut ekranu jest za duży)/);
    }
    // At the limit, it goes.
    assert.equal((await reportForm(player, { text, image: file(jpeg(BUG_IMAGE.most)) })).status, 201);
    assert.equal(await count('bug_reports'), 1);
    assert.equal(await count('bug_report_images'), 1);
    // The words are checked as in JSON, and a broken form is turned down.
    assert.equal((await reportForm(player, { text: 'krótko', image: file(PNG) })).data.error.code, 'too_short');
    const broken = await server.fetch('/api/bug-reports', {
      method: 'POST',
      headers: { Cookie: player, 'Content-Type': 'multipart/form-data; boundary=granica' },
      body: '--granica\r\nto nie jest formularz',
    });
    assert.equal(broken.status, 400);
    assert.equal((await broken.json()).error.code, 'invalid_json');
    assert.equal(await count('bug_reports'), 1);
    assert.equal(await count('bug_report_images'), 1);
  });
});

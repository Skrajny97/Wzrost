// Security review of the Panel autora, the chat and the community features
// (12.11.2026): each test shows a hole the code had, and fails without its
// fix.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BUG_IMAGE, BUG_REPORTS } from '../src/server/bugs.js';
import { useServer } from './helpers/server.js';

// Requests that start together, as a script sends them: each sent straight
// to the worker (the dev proxy in front of it passes requests on one by
// one) with its body held back, and all the bodies let go at once, so the
// handlers, which start once the whole body has come (bodyCome in
// index.js), run side by side. `bodies`: [{ type, bytes }].
async function together(server, cookie, path, bodies) {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const answers = bodies.map(({ type, bytes }) => {
    const stream = new ReadableStream(
      {
        async pull(controller) {
          await gate;
          controller.enqueue(bytes);
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    return server
      .getWorker()
      .fetch(path, { method: 'POST', headers: { 'Content-Type': type, Cookie: cookie }, body: stream, duplex: 'half' })
      .then(async (response) => ({ status: response.status, data: await response.json() }));
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  release();
  return Promise.all(answers);
}
const jsonBody = (value) => ({ type: 'application/json', bytes: new TextEncoder().encode(JSON.stringify(value)) });
// A report with a screenshot, as the page sends it (multipart/form-data).
async function formBody(fields) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  const encoded = new Response(form);
  return { type: encoded.headers.get('Content-Type'), bytes: new Uint8Array(await encoded.arrayBuffer()) };
}
// A file of `size` bytes that starts as a JPEG.
const jpeg = (size) => {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  return new File([bytes], 'zrzut.jpg', { type: 'image/jpeg' });
};
// How the local runtime lines the requests up varies from run to run, so
// each proof sends a few bursts, each from an account of its own, and every
// burst must keep the limit.
const BURSTS = 3;

describe('Zgłoś błąd', () => {
  const { server, call, db, signUp } = useServer();
  const perAccount = async (sql) => (await (await db()).prepare(sql).all()).results.map((row) => row.count);

  test('the daily limit of bug reports holds for reports sent at the same moment', async () => {
    for (let n = 0; n < BURSTS; n += 1) {
      const { cookie } = await signUp(`gracz${n}`);
      await call('POST', '/api/character', { cookie, body: { name: `Gracz${n}`, classId: 'mage', appearance: 'female' } });
      const answers = await together(server, cookie, '/api/bug-reports', Array.from({ length: 20 }, (_, index) => jsonBody({ text: `Błąd numer ${index + 1} w grze, opisany.`, screen: '#/walka' })));
      assert.equal(answers.filter((answer) => answer.status === 201).length, BUG_REPORTS.daily);
      assert.ok(answers.every((answer) => answer.status === 201 || answer.data.error.code === 'too_many'));
    }
    const stored = await perAccount('SELECT COUNT(*) AS count FROM bug_reports GROUP BY user_id');
    assert.deepEqual(stored, Array(BURSTS).fill(BUG_REPORTS.daily));
  });

  test('screenshots sent at the same moment keep the daily limit, each with its own report', async () => {
    for (let n = 0; n < BURSTS; n += 1) {
      const { cookie } = await signUp(`zrzut${n}`);
      const bodies = await Promise.all(Array.from({ length: 20 }, (_, index) => formBody({ text: `Błąd ze zrzutem numer ${index + 1}.`, image: jpeg(4096) })));
      await together(server, cookie, '/api/bug-reports', bodies);
    }
    const stored = await perAccount('SELECT COUNT(*) AS count FROM bug_report_images i JOIN bug_reports b ON b.id = i.report_id GROUP BY b.user_id');
    // Each may be BUG_IMAGE.most (1 MB) as well.
    assert.deepEqual(stored, Array(BURSTS).fill(BUG_REPORTS.daily), `screenshots stored per account (up to ${BUG_IMAGE.most} bytes each)`);
    const reports = await perAccount('SELECT COUNT(DISTINCT i.report_id) AS count FROM bug_report_images i');
    assert.deepEqual(reports, [BURSTS * BUG_REPORTS.daily]);
  });

  test('an account without a confirmed e-mail sends its words, but no screenshot', async () => {
    // Only registered: no confirmed e-mail and no character.
    const { cookie } = await signUp('nowy', { confirmed: false });
    const [picture] = await together(server, cookie, '/api/bug-reports', [await formBody({ text: 'Nie dostaję maila z linkiem.', image: jpeg(4096) })]);
    assert.equal(picture.status, 403);
    assert.equal(picture.data.error.code, 'email_unconfirmed');
    assert.equal((await call('POST', '/api/bug-reports', { cookie, body: { text: 'Nie dostaję maila z linkiem.' } })).status, 201);
    assert.deepEqual(await perAccount('SELECT COUNT(*) AS count FROM bug_report_images'), [0]);
  });
});

// Player messages were refused only for http(s), www. and some twenty
// domain endings, read as typed: other endings, an address with a path,
// and a full-width dot passed.
describe('links in the chat', () => {
  const { call, db, signUp } = useServer();

  test('a player writes no address in the chat, whatever its ending or dot', async () => {
    const { cookie } = await signUp('Ala');
    await call('POST', '/api/character', { cookie, body: { name: 'Ala', classId: 'mage', appearance: 'female' } });
    await (await db()).prepare("UPDATE characters SET level = 5 WHERE name = 'Ala'").run();
    await call('POST', '/api/chat/rules', { cookie });
    const say = async (text) => {
      // Past the wait between messages.
      await (await db()).prepare('UPDATE chat_messages SET created_at = created_at - 10000').run();
      return call('POST', '/api/chat', { cookie, body: { channel: 'global', text } });
    };
    for (const text of ['Darmowe Punkty Systemu: insight-bonus.top', 'Zaloguj się na insightrpg.co/konto', 'wejdź na gra\u{FF0E}pl', 'wejdź na gra\u{3002}pl']) {
      const answer = await say(text);
      assert.equal(answer.status, 400, text);
      assert.equal(answer.data.error.code, 'link', text);
    }
    // Words after a dot without a space stay words.
    for (const text of ['Hej.co tam?', 'Dobra.to idziemy', 'mam 2.5 lvl', 'np. coś tam']) {
      assert.equal((await say(text)).status, 201, text);
    }
  });
});

// A failed chat translation went back to the day's every time, so a text
// the translator answers with nothing could be sent to it without end.
describe('failed translations', () => {
  const { server, db, signUp } = useServer({ ENGLISH: 'on', FAKE_TRANSLATOR: 'on' });

  test('go back to the day\'s at most as many times as the day has', async () => {
    const ask = async (method, path, { body, cookie, lang } = {}) => {
      const headers = { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(cookie && { Cookie: cookie }), ...(lang && { 'X-Lang': lang }) };
      const response = await server.fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, data: await response.json() };
    };
    const cookies = {};
    for (const [login, language] of [['Ala', 'pl'], ['Rowan', 'en']]) {
      const { cookie } = await signUp(login);
      await ask('POST', '/api/character', { cookie, body: { name: login, classId: 'mage', appearance: 'female' } });
      await (await db()).prepare('UPDATE characters SET level = 5 WHERE name = ?').bind(login).run();
      await (await db()).prepare('UPDATE users SET language = ? WHERE login = ?').bind(language, login).run();
      await ask('POST', '/api/chat/rules', { cookie });
      cookies[login] = cookie;
    }
    // Signs only: the stand-in translator gives nothing for them.
    const sent = await ask('POST', '/api/chat', { cookie: cookies.Ala, lang: 'pl', body: { channel: 'global', text: '?!?!' } });
    assert.equal(sent.status, 201);
    const most = 100;
    const translate = () => ask('POST', '/api/chat/translate', { cookie: cookies.Rowan, lang: 'en', body: { id: sent.data.message.id } });
    const after = (await db()).prepare("SELECT translations_used AS used, translations_returned AS returned FROM users WHERE login = 'Rowan'");
    // The day's are given back for the first `most` failures...
    const failed = await translate();
    assert.equal(failed.data.error.code, 'translate_failed');
    assert.deepEqual(await after.first(), { used: 0, returned: 1 });
    await (await db()).prepare("UPDATE users SET translations_returned = ? WHERE login = 'Rowan'").bind(most - 1).run();
    await translate();
    assert.deepEqual(await after.first(), { used: 0, returned: most });
    // ...and then each counts.
    await translate();
    assert.deepEqual(await after.first(), { used: 1, returned: most });
  });
});

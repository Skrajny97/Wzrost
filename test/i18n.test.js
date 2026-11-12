// The English beta (490–497 A): English laid over the Polish data, the
// language of each request (src/server/i18n.js), the account's language, and
// the translations of the parts already translated (tools/i18n-check.mjs).
// English is only where ENGLISH is "on" (the test version and local work);
// the live game answers in Polish whatever the page asks for.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { overlayTexts } from '../src/engine/index.js';
import { MAX_FAILURES } from '../src/server/throttle.js';
import { checkTranslations, codeTexts, htmlTexts, looksLikeText } from '../tools/i18n-check.mjs';
import { useServer } from './helpers/server.js';

test('the parts already translated have all their English, with the same {names} and key names, made from the Polish as it is now', () => {
  const result = checkTranslations();
  const show = (list) => list.map((entry) => `${entry.where}: ${entry.text}`).join('\n');
  assert.equal(show(result.missing), '', 'brakujące tłumaczenia (node tools/i18n-check.mjs)');
  assert.equal(show(result.variables), '', 'niezgodne zmienne {…}');
  assert.equal(show(result.outdated), '', 'polski zmienił się po angielskim: przetłumacz go od nowa, potem node tools/i18n-check.mjs --stamp-all');
  assert.equal(show(result.unstamped), '', 'node tools/i18n-check.mjs --stamp');
  assert.equal(show(result.unwired), '', 'plik tłumaczeń bez importu w src/server/content.js');
  assert.equal(show(result.glossary), '', 'tłumaczenie inne niż w słowniku nazw (data/en/glossary.json)');
});

// Every new text of the game comes in English at once (the author,
// 6.11.2026): Polish outside the parts translated is only the author's own,
// the Author Panel and the test tools. The news drafts are translated too
// (0.2.2).
test('every new text has its English: no Polish outside the parts translated but the author\'s own', () => {
  const ownPolish = new Set(['src/client/screens/author.js', 'src/server/author.js', 'src/server/testing.js']);
  const outside = Object.keys(checkTranslations({ all: true }).outside).filter((where) => !ownPolish.has(where));
  assert.deepEqual(outside, [], 'polski tekst bez angielskiego: przetłumacz go i dopisz plik do data/en/scope.json');
});

test('English lies over the Polish data by ids and keys, and never changes anything but its texts', () => {
  const polish = {
    $comment: 'x',
    title: 'Ognisko',
    level: 3,
    list: [
      { id: 'wolf', name: 'Wilk', hp: 10 },
      { id: 'fox', name: 'Lis', hp: 5 },
    ],
    names: [{ monster: 'wolf', prefix: 'Wilczy' }],
    lines: ['raz', 'dwa'],
    untouched: { deep: ['a'] },
  };
  const english = {
    $comment: 'y',
    title: 'Campfire',
    level: 'three',
    extra: 'not in the Polish',
    list: { wolf: { name: 'Wolf', hp: 'many' }, bear: { name: 'Bear' } },
    names: { wolf: { prefix: 'Wolf' } },
    lines: ['one', ''],
  };
  const merged = overlayTexts(polish, english);
  assert.equal(merged.title, 'Campfire');
  assert.equal(merged.level, 3);
  assert.equal(merged.$comment, 'x');
  assert.ok(!('extra' in merged));
  assert.deepEqual(merged.list, [
    { id: 'wolf', name: 'Wolf', hp: 10 },
    { id: 'fox', name: 'Lis', hp: 5 },
  ]);
  assert.deepEqual(merged.names, [{ monster: 'wolf', prefix: 'Wolf' }]);
  // An empty English text keeps the Polish.
  assert.deepEqual(merged.lines, ['one', 'dwa']);
  // What has no English is the Polish itself, which stays as it was.
  assert.equal(merged.untouched, polish.untouched);
  assert.equal(merged.list[1], polish.list[1]);
  assert.equal(polish.title, 'Ognisko');
  assert.equal(overlayTexts(polish, undefined), polish);
});

test("the checker finds the code's texts: t() keys, plural forms, errors' messages, and not ids or log lines", () => {
  const found = codeTexts(
    [
      "const tabs = [{ id: 'walka', label: 'Walka', icon: 'swords' }];",
      "h('p', { class: 'muted status-row', text: t('Konto {login} zniknie.', { login }) });",
      "countOf(count, 'postać', 'postacie', 'postaci');",
      "throw new ApiError(400, 'invalid_email', 'Podaj poprawny adres e-mail.');",
      'throw new ApiError(429, \'wait\', `Spróbuj ponownie za ${minutes} min.`);',
      "console.error('Push: nie wysłano');",
      'const pattern = /^[a-z]+$/;',
    ].join('\n'),
    { client: true },
  );
  assert.deepEqual(found.keys.map((key) => key.text), ['Konto {login} zniknie.']);
  assert.deepEqual(found.plurals.map((key) => key.text), ['postać|postacie|postaci']);
  assert.deepEqual(found.texts.map((text) => text.text), ['Walka', 'Podaj poprawny adres e-mail.', 'Spróbuj ponownie za {} min.']);
  assert.ok(looksLikeText('Nie znaleziono.'));
  assert.ok(!looksLikeText('status-row status-row--name'));
  assert.ok(!looksLikeText('#/osada'));
  const html = htmlTexts('<p class="a" data-i18n>Hasło</p><div aria-label="Wybierz formularz" data-i18n-attr="aria-label"></div><button data-busy-label="Łączenie…" data-i18n>Zaloguj się</button>');
  assert.deepEqual(html.map((entry) => entry.text).sort(), ['Hasło', 'Wybierz formularz', 'Zaloguj się', 'Łączenie…']);
});

// A request with a language: the page's own (X-Lang) or the browser's.
function caller(server) {
  return async (method, path, { body, cookie, lang, accept } = {}) => {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    if (lang) headers['X-Lang'] = lang;
    if (accept) headers['Accept-Language'] = accept;
    const response = await server.fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const setCookie = response.headers.get('Set-Cookie');
    return { status: response.status, data: await response.json(), cookie: setCookie ? setCookie.split(';')[0] : null };
  };
}

describe('English where ENGLISH is on (the test version)', () => {
  const { server, db } = useServer({ ENGLISH: 'on' });
  const ask = caller(server);
  const className = async (options) => (await ask('GET', '/api/content', options)).data.classes.find((cls) => cls.id === 'warrior').name;

  test('the page learns English is offered, and gets the English of its texts', async () => {
    assert.equal((await ask('GET', '/api/health')).data.english, true);
    const english = await ask('GET', '/api/strings', { lang: 'en' });
    assert.equal(english.data.language, 'en');
    assert.equal(english.data.strings.Ustawienia, 'Settings');
    assert.deepEqual((await ask('GET', '/api/strings', { lang: 'pl' })).data, { language: 'pl', strings: {} });
  });

  test("each request gets the game's data in its own language, also when many come at once", async () => {
    assert.equal(await className({ lang: 'en' }), 'Warrior');
    assert.equal(await className({ lang: 'pl' }), 'Wojownik');
    // Without the page's choice, the browser's language: Polish for a
    // Polish phone, English for any other, and Polish without one.
    assert.equal(await className({ accept: 'en-US,en;q=0.9' }), 'Warrior');
    assert.equal(await className({ accept: 'pl-PL,pl;q=0.9,en;q=0.8' }), 'Wojownik');
    assert.equal(await className({}), 'Wojownik');
    const langs = Array.from({ length: 16 }, (_, index) => (index % 2 ? 'en' : 'pl'));
    const names = await Promise.all(langs.map((lang) => className({ lang })));
    assert.deepEqual(names, langs.map((lang) => (lang === 'en' ? 'Warrior' : 'Wojownik')));
  });

  test('errors come in the language asked for, those with numbers too', async () => {
    const missing = await ask('POST', '/api/auth/login', { body: {}, lang: 'en' });
    assert.equal(missing.status, 400);
    assert.equal(missing.data.error.code, 'missing_credentials');
    assert.equal(missing.data.error.message, 'Enter your login or e-mail and your password.');
    assert.equal((await ask('POST', '/api/auth/login', { body: {}, lang: 'pl' })).data.error.message, 'Podaj login lub e-mail oraz hasło.');
    for (let attempt = 0; attempt < MAX_FAILURES; attempt += 1) {
      await ask('POST', '/api/auth/login', { body: { identifier: 'nikt', password: 'zlehaslo1' }, lang: 'en' });
    }
    const blocked = await ask('POST', '/api/auth/login', { body: { identifier: 'nikt', password: 'zlehaslo1' }, lang: 'en' });
    assert.equal(blocked.status, 429);
    assert.match(blocked.data.error.message, /^Too many failed sign-in attempts\. Try again in \d+ min\.$/);
    // A message made of a sentence and another the code added after it.
    const sign = await ask('POST', '/api/auth/register', { body: { login: 'Gracz_en', email: 'gracz@example.com', password: 'tajnehaslo1', adult: true }, lang: 'en' });
    await (await db()).prepare('UPDATE users SET email_confirmed_at = created_at').run();
    const wrong = await ask('POST', '/api/character', { body: { name: 'Zła@nazwa', classId: 'warrior', appearance: 'female' }, cookie: sign.cookie, lang: 'en' });
    assert.equal(wrong.data.error.message, "The character's name cannot contain the sign “@”. Letters of the Latin, Greek or Cyrillic alphabet, digits, spaces, hyphens, apostrophes and underscores are allowed.");
  });

  test('the account keeps its language: from the page at the registration, then from the switch', async () => {
    const made = await ask('POST', '/api/auth/register', { body: { login: 'Angielski', email: 'angielski@example.com', password: 'tajnehaslo1', adult: true }, lang: 'en' });
    assert.equal(made.status, 201);
    assert.equal(made.data.user.language, 'en');
    assert.equal((await ask('GET', '/api/me', { cookie: made.cookie })).data.user.language, 'en');
    assert.deepEqual((await ask('POST', '/api/me/language', { body: { language: 'pl' }, cookie: made.cookie })).data, { language: 'pl' });
    assert.equal((await ask('GET', '/api/me', { cookie: made.cookie })).data.user.language, 'pl');
    const wrong = await ask('POST', '/api/me/language', { body: { language: 'de' }, cookie: made.cookie, lang: 'en' });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.data.error.message, 'There is no such language.');
    const stored = await (await db()).prepare('SELECT language FROM users WHERE login = ?').bind('Angielski').first('language');
    assert.equal(stored, 'pl');
  });

  test('the registration form names the account language ("Język gry"), whatever the page shows', async () => {
    const languageOf = async (login) => (await db()).prepare('SELECT language FROM users WHERE login = ?').bind(login).first('language');
    const english = await ask('POST', '/api/auth/register', { body: { login: 'Wybor_en', email: 'wybor-en@example.com', password: 'tajnehaslo1', adult: true, language: 'en' }, lang: 'pl' });
    assert.equal(english.status, 201);
    assert.equal(english.data.user.language, 'en');
    assert.equal(await languageOf('Wybor_en'), 'en');
    const polish = await ask('POST', '/api/auth/register', { body: { login: 'Wybor_pl', email: 'wybor-pl@example.com', password: 'tajnehaslo1', adult: true, language: 'pl' }, lang: 'en' });
    assert.equal(polish.status, 201);
    assert.equal(polish.data.user.language, 'pl');
    assert.equal(await languageOf('Wybor_pl'), 'pl');
    // No such language: no account, and the message in the page's language.
    const wrong = await ask('POST', '/api/auth/register', { body: { login: 'Wybor_de', email: 'wybor-de@example.com', password: 'tajnehaslo1', adult: true, language: 'de' }, lang: 'en' });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.data.error.message, 'There is no such language.');
    assert.equal(await languageOf('Wybor_de'), null);
  });
});

describe('Polish only where ENGLISH is off (the live game)', () => {
  const { server, db } = useServer();
  const ask = caller(server);

  test('the server answers in Polish whatever the page asks for, and offers no choice', async () => {
    assert.equal((await ask('GET', '/api/health')).data.english, false);
    const content = await ask('GET', '/api/content', { lang: 'en', accept: 'en-US' });
    assert.equal(content.data.classes.find((cls) => cls.id === 'warrior').name, 'Wojownik');
    assert.equal((await ask('POST', '/api/auth/login', { body: {}, lang: 'en' })).data.error.message, 'Podaj login lub e-mail oraz hasło.');
    assert.deepEqual((await ask('GET', '/api/strings', { lang: 'en' })).data, { language: 'pl', strings: {} });
    // The form's choice is not there either: a language sent anyway is not
    // looked at.
    const made = await ask('POST', '/api/auth/register', { body: { login: 'Polski', email: 'polski@example.com', password: 'tajnehaslo1', adult: true, language: 'en' }, lang: 'en' });
    assert.equal(made.status, 201);
    assert.ok(!('language' in made.data.user));
    assert.equal(await (await db()).prepare('SELECT language FROM users WHERE login = ?').bind('Polski').first('language'), 'pl');
    const odd = await ask('POST', '/api/auth/register', { body: { login: 'Polski2', email: 'polski2@example.com', password: 'tajnehaslo1', adult: true, language: 'de' } });
    assert.equal(odd.status, 201);
    const choice = await ask('POST', '/api/me/language', { body: { language: 'en' }, cookie: made.cookie, lang: 'en' });
    assert.equal(choice.status, 404);
    assert.equal(choice.data.error.message, 'Nie znaleziono.');
  });
});

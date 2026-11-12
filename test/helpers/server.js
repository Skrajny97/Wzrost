// A local Workers runtime with a fresh D1 database for API tests.

import { after, before, beforeEach } from 'node:test';
import { createTestHarness } from 'wrangler';

// Test mode, with "Testuj samouczki", is for every account here, unless
// `vars` sets TEST_LOGINS.
export function useServer(vars = {}) {
  // No events at the end of explorations, which would come after a tenth of
  // them, unless a test asks for them (events.test.js). The class evolutions
  // are on, as on the test version, unless a test turns them off. The Osada
  // is off unless a test opens it (SETTLEMENT), as before it came into the
  // game: its companions and rumors would change the other tests' trips. So
  // is the Warownia (FORTRESS), on in the game from 0.1.49. English is off
  // unless a test asks for it (ENGLISH), as the tests were written before
  // it came into the game (0.1.97): Polish answers and no English channel.
  // The weeks of the year are off unless a test asks for them (WEEKS), so
  // no test's numbers hang on the week it runs in (weeks.test.js). So is the
  // Arena (ARENA), in the game from 0.2.38: its unlock and its place on the
  // Osada's board would change the other tests' (pvp-arena.test.js). So are
  // the guild wars (GUILD_WARS, guild-wars.test.js), first on the test
  // version: their Wojna tab and their evening's battles. So is Talia
  // Systemu (CARDS, cards-api.test.js), which wrangler.jsonc names only for
  // the test version. So are the payments for Punkty Systemu (PAYMENTS,
  // payments.test.js), for every player when a test turns them on
  // (PAYMENTS_FOR). So are the Labirynt Systemu and the Rdzeń (LABYRINTH,
  // labyrinth-api.test.js), in the game from 0.2.87: the Rdzeń's Artefakty
  // would change the other tests' fights.
  const server = createTestHarness({
    workers: [
      {
        configPath: './wrangler.jsonc',
        vars: { TEST_LOGINS: '', TUTORIAL_TESTS: 'on', EVENTS: '', EVOLUTIONS: 'on', SETTLEMENT: '', FORTRESS: '', ENGLISH: '', WEEKS: '', ARENA: '', GUILD_WARS: '', LABYRINTH: '', PAYMENTS: '', PAYMENTS_FOR: '', ...vars },
      },
    ],
  });
  before(() => server.listen());
  beforeEach(async () => {
    await server.reset();
    await server.getWorker().applyD1Migrations('DB');
  });
  after(() => server.close());

  async function call(method, path, { body, cookie, origin } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    if (origin) headers.Origin = origin;
    const response = await server.fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.get('Set-Cookie');
    return {
      status: response.status,
      headers: response.headers,
      data: await response.json(),
      cookie: setCookie ? setCookie.split(';')[0] : null,
    };
  }

  const db = async () => (await server.getWorker().getEnv()).DB;

  // An account made with a password, its e-mail confirmed as after the link
  // from its mail (src/server/email.js); `confirmed: false` leaves it waiting.
  async function signUp(login, { email = `${login.toLowerCase()}@example.com`, confirmed = true } = {}) {
    const answer = await call('POST', '/api/auth/register', { body: { login, email, password: 'tajnehaslo1', adult: true } });
    if (confirmed) await (await db()).prepare('UPDATE users SET email_confirmed_at = created_at WHERE login = ?').bind(login).run();
    return answer;
  }

  return { server, call, db, signUp };
}

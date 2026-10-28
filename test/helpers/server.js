// A local Workers runtime with a fresh D1 database for API tests.

import { after, before, beforeEach } from 'node:test';
import { createTestHarness } from 'wrangler';

// Test mode, with "Testuj samouczki", is for every account here, unless
// `vars` sets TEST_LOGINS.
export function useServer(vars = {}) {
  // No events at the end of explorations, which would come after a tenth of
  // them, unless a test asks for them (events.test.js).
  const server = createTestHarness({ workers: [{ configPath: './wrangler.jsonc', vars: { TEST_LOGINS: '', TUTORIAL_TESTS: 'on', EVENTS: '', ...vars } }] });
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
    const answer = await call('POST', '/api/auth/register', { body: { login, email, password: 'tajnehaslo1' } });
    if (confirmed) await (await db()).prepare('UPDATE users SET email_confirmed_at = created_at WHERE login = ?').bind(login).run();
    return answer;
  }

  return { server, call, db, signUp };
}

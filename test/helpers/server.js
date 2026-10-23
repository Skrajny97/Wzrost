// A local Workers runtime with a fresh D1 database for API tests.

import { after, before, beforeEach } from 'node:test';
import { createTestHarness } from 'wrangler';

export function useServer() {
  const server = createTestHarness({ workers: [{ configPath: './wrangler.jsonc' }] });
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

  return { server, call, db };
}

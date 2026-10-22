// Run by the deploy workflow before migrations and `wrangler deploy`.
// Makes sure the Cloudflare account has a workers.dev subdomain and the D1
// database exists, then writes the database ID into wrangler.jsonc. The file
// is changed only in the CI checkout; the repository keeps the placeholder.

import { readFileSync, writeFileSync } from 'node:fs';

const CONFIG_FILE = 'wrangler.jsonc';
const PLACEHOLDER_ID = '00000000-0000-0000-0000-000000000000';
// Eastern Europe: the D1 region closest to players in Poland.
const LOCATION_HINT = 'eeur';
const SUBDOMAIN_CANDIDATES = ['wzrost', 'wzrost-gra'];

const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();

function fail(message, errors = []) {
  console.log(`::error::${message}`);
  for (const error of errors) console.log(`Cloudflare: [${error.code}] ${error.message}`);
  const codes = errors.map((error) => error.code);
  if (codes.includes(10000) || codes.includes(9109)) {
    console.log(
      'Wskazówka: token nie ma wymaganych uprawnień. Utwórz nowy linkiem z README (sekcja „Token API”).',
    );
  }
  if (codes.includes(7003) || codes.includes(7000)) {
    console.log('Wskazówka: sprawdź sekret CLOUDFLARE_ACCOUNT_ID (32 znaki z adresu panelu Cloudflare).');
  }
  process.exit(1);
}

async function api(method, path, body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok && data.success === true, result: data.result, errors: data.errors ?? [] };
}

const hasError = (response, code) => response.errors.some((error) => error.code === code);

async function ensureSubdomain() {
  const current = await api('GET', '/workers/subdomain');
  if (current.ok) {
    console.log(`Subdomena workers.dev: ${current.result.subdomain}.workers.dev`);
    return;
  }
  // 10007: the account has no workers.dev subdomain yet.
  if (!hasError(current, 10007)) fail('Nie udało się odczytać subdomeny workers.dev.', current.errors);

  const random = Math.random().toString(36).slice(2, 8);
  for (const candidate of [...SUBDOMAIN_CANDIDATES, `wzrost-${random}`]) {
    const created = await api('PUT', '/workers/subdomain', { subdomain: candidate });
    if (created.ok) {
      console.log(
        `Założono subdomenę ${candidate}.workers.dev. Można ją zmienić w panelu Cloudflare (Workers & Pages).`,
      );
      return;
    }
    // 10031: this name is already taken by another account.
    if (!hasError(created, 10031)) fail('Nie udało się założyć subdomeny workers.dev.', created.errors);
  }
  fail('Wszystkie proponowane nazwy subdomeny workers.dev są zajęte. Załóż ją ręcznie w panelu Cloudflare.');
}

async function ensureDatabase(name) {
  const list = await api('GET', `/d1/database?name=${encodeURIComponent(name)}`);
  if (!list.ok) fail('Nie udało się odczytać listy baz D1.', list.errors);
  const existing = list.result.find((database) => database.name === name);
  if (existing) {
    console.log(`Baza D1 „${name}” istnieje: ${existing.uuid}`);
    return existing.uuid;
  }

  const created = await api('POST', '/d1/database', { name, primary_location_hint: LOCATION_HINT });
  if (!created.ok) fail(`Nie udało się utworzyć bazy D1 „${name}”.`, created.errors);
  console.log(`Utworzono bazę D1 „${name}” (${created.result.uuid}), region ${LOCATION_HINT}.`);
  return created.result.uuid;
}

if (!token || !accountId) {
  fail('Brakuje sekretów CLOUDFLARE_API_TOKEN lub CLOUDFLARE_ACCOUNT_ID (instrukcja w README).');
}
if (!/^[0-9a-f]{32}$/i.test(accountId)) {
  fail(
    `Sekret CLOUDFLARE_ACCOUNT_ID ma ${accountId.length} znaków, a Account ID to 32 cyfry i litery a–f. Wklej go ponownie z adresu panelu Cloudflare.`,
  );
}
if (/\s/.test(token)) fail('Sekret CLOUDFLARE_API_TOKEN zawiera spacje lub złamania wiersza. Wklej token ponownie.');

const config = readFileSync(CONFIG_FILE, 'utf8');
const name = config.match(/"database_name":\s*"([^"]+)"/)?.[1];
if (!name) fail(`Nie znaleziono database_name w ${CONFIG_FILE}.`);

await ensureSubdomain();
const databaseId = await ensureDatabase(name);

if (config.includes(PLACEHOLDER_ID)) {
  writeFileSync(CONFIG_FILE, config.replace(PLACEHOLDER_ID, databaseId));
} else if (!config.includes(databaseId)) {
  fail(`${CONFIG_FILE} wskazuje inną bazę D1 niż „${name}” w Cloudflare (${databaseId}).`);
}

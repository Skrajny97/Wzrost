// Adds GitHub secrets, given by name, to the JSON file of the Worker's secrets
// that `wrangler deploy --secrets-file` reads (.github/workflows/deploy.yml):
// all of them when every one of them is set, none when one is missing (with a
// warning, unless none is set). The file keeps what earlier steps wrote
// (Google's keys). No value is ever printed.
//   node tools/worker-secrets.mjs <file> NAME [NAME...]

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const [file, ...names] = process.argv.slice(2);
if (!file || names.length === 0) {
  console.error('Użycie: node tools/worker-secrets.mjs <plik> NAZWA [NAZWA...]');
  process.exit(2);
}
const values = names.map((name) => [name, process.env[name] ?? '']);
const set = values.filter(([, value]) => value.trim() !== '');
if (set.length === 0) {
  console.log(`Brak sekretów ${names.join(', ')}: zostają bez zmian.`);
} else if (set.length < names.length) {
  const missing = values.filter(([, value]) => value.trim() === '').map(([name]) => name);
  console.log(`::warning title=Sekrety Workera::Brakuje ${missing.join(', ')}, więc ${names.join(', ')} zostają bez zmian.`);
} else {
  const secrets = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  for (const [name, value] of values) secrets[name] = value.trim();
  writeFileSync(file, JSON.stringify(secrets), { mode: 0o600 });
  console.log(`Sekrety ${names.join(', ')} trafią do Workera.`);
}

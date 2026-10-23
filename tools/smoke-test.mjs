// Run by the deploy workflow after `wrangler deploy`:
//   node tools/smoke-test.mjs <wrangler output file> <expected version>
// Finds the game URL in the wrangler output, waits until /api/health answers
// with the new version, checks that the game content is served and puts the
// URL in the run summary.

import { appendFileSync, readFileSync } from 'node:fs';

const [logFile, expectedVersion] = process.argv.slice(2);
const ATTEMPTS = 12;
const DELAY_MS = 5000;

function summary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

const url = readFileSync(logFile, 'utf8').match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i)?.[0];
if (!url) {
  console.log('::error::Nie znaleziono adresu gry w wyniku wrangler deploy.');
  process.exit(1);
}
summary(`## Gra jest wdrożona\n\nAdres: ${url}\n\nWersja: \`${expectedVersion}\``);

// The bundled game data must reach the page: classes and regions.
async function checkContent() {
  const response = await fetch(`${url}/api/content`);
  const content = await response.json().catch(() => null);
  if (!response.ok || !content?.classes?.length || !content?.regions?.length) {
    console.log(`::error::/api/content nie zwraca treści gry (HTTP ${response.status}).`);
    process.exit(1);
  }
  console.log(`Treść gry: ${content.classes.length} klas, ${content.regions.length} regiony.`);
}

let gotResponse = false;
let lastProblem = '';
for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  try {
    const response = await fetch(`${url}/api/health`, { headers: { 'Cache-Control': 'no-cache' } });
    gotResponse = true;
    const data = await response.json().catch(() => null);
    if (response.ok && data?.ok === true && data.version === expectedVersion) {
      console.log(`Gra działa: ${url} (wersja ${data.version}, czas serwera ${new Date(data.time).toISOString()}).`);
      await checkContent();
      process.exit(0);
    }
    lastProblem = `HTTP ${response.status}, wersja ${data?.version ?? 'nieznana'}`;
  } catch (error) {
    lastProblem = error.cause?.code ?? error.message;
  }
  console.log(`Próba ${attempt}/${ATTEMPTS}: ${lastProblem}`);
  if (attempt < ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
}

if (gotResponse) {
  console.log(`::error::Gra pod ${url} nie odpowiada poprawnie (${lastProblem}).`);
  process.exit(1);
}
// A brand-new workers.dev subdomain can take a few minutes to appear in DNS.
console.log(`::warning::Adres ${url} jeszcze nie odpowiada (${lastProblem}). Nowa subdomena może potrzebować kilku minut.`);

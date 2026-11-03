// The beginning of the game, walked in a browser (the author: "pilnuj tego
// na przyszlosc nie może tak byc, poczatek jest najwazniejszy"): a fresh
// account makes a character and follows the narrator's introduction from
// its first card to its first exploration, on a phone and on a computer.
// It stops with an error when an exploration does not start, when the page
// throws, or when the narrator waits for something nobody can press.
//
// Needs the game running locally (npm run dev, http://localhost:8787 by
// default) and Playwright with its Chromium:
//   node tools/first-steps.cjs [base URL]
// Each walk takes a new account; its e-mail is marked confirmed straight in
// the local D1 database (wrangler d1 execute --local).

const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const BASE = process.argv[2] ?? 'http://localhost:8787';
const SIZES = [
  { name: 'telefon', width: 390, height: 844 },
  { name: 'komputer', width: 1366, height: 768 },
  { name: 'duży monitor', width: 1920, height: 1080 },
];
const MOST_STEPS = 40;

async function account(page) {
  const login = `start${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const made = await page.evaluate(
    async ({ login }) => (await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login, email: `${login}@example.com`, password: 'pierwszekroki1' }) })).status,
    { login },
  );
  if (made !== 201 && made !== 200) throw new Error(`Rejestracja zwróciła ${made}.`);
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--command', `UPDATE users SET email_confirmed_at = 1 WHERE login = '${login}'`], { stdio: 'ignore' });
  const signed = await page.evaluate(
    async ({ login }) => (await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: login, password: 'pierwszekroki1' }) })).status,
    { login },
  );
  if (signed !== 200) throw new Error(`Logowanie zwróciło ${signed}.`);
  const character = await page.evaluate(async () => (await fetch('/api/character', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `Start${String(Date.now()).slice(-9)}`, classId: 'warrior', appearance: 'female' }) })).status);
  if (character !== 201) throw new Error(`Tworzenie postaci zwróciło ${character}.`);
}

async function walk(browser, size) {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(BASE);
  await account(page);
  await page.reload();
  await page.waitForTimeout(2500);
  const toasts = new Set();
  for (let step = 1; step <= MOST_STEPS; step += 1) {
    for (const text of await page.locator('.toast').allInnerTexts().catch(() => [])) if (text.trim()) toasts.add(text.trim());
    const activity = await page.evaluate(async () => (await (await fetch('/api/character')).json()).character?.activity?.kind ?? null);
    if (activity === 'hunt') {
      await page.close();
      if (errors.length > 0) throw new Error(`${size.name}: błędy strony: ${errors.join(' | ')}`);
      return step;
    }
    const choice = page.locator('.narrator-choice button').first();
    const next = page.locator('.narrator-actions button:not(.narrator-skip)').last();
    const noteNext = page.locator('.guide-note:not(.guide-note--hidden) button', { hasText: 'Dalej' }).first();
    const ring = await page.evaluate(() => {
      const element = document.querySelector('.guide-ring');
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return box.width > 0 ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
    });
    if (await choice.count()) await choice.click();
    else if (await next.count()) await next.click();
    else if (await noteNext.count()) await noteNext.click();
    else if (ring) {
      if (ring.y < 0 || ring.y > size.height || ring.x < 0 || ring.x > size.width) throw new Error(`${size.name}: narrator wskazuje coś poza ekranem (krok ${step}).`);
      await page.mouse.click(ring.x, ring.y);
    } else {
      throw new Error(`${size.name}: narrator czeka, a nie ma czego nacisnąć (krok ${step}, ${page.url()}). Komunikaty: ${[...toasts].join(' | ') || 'brak'}.`);
    }
    await page.waitForTimeout(1200);
  }
  throw new Error(`${size.name}: po ${MOST_STEPS} krokach pierwsza wyprawa nie ruszyła. Komunikaty: ${[...toasts].join(' | ') || 'brak'}. Błędy: ${errors.join(' | ') || 'brak'}.`);
}

(async () => {
  const browser = await chromium.launch();
  let failed = false;
  for (const size of SIZES) {
    try {
      const steps = await walk(browser, size);
      console.log(`✔ ${size.name} (${size.width}×${size.height}): pierwsza wyprawa ruszyła po ${steps} krokach.`);
    } catch (error) {
      failed = true;
      console.error(`✖ ${error.message}`);
    }
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();

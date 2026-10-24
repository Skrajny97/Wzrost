// Plays the game as a new player on an iPhone: Safari's engine (Playwright
// WebKit) at an iPhone 13's size, against the game running locally over
// https (Safari keeps the login cookie, which is Secure, only from an https
// page: `wrangler dev --local-protocol https`). It goes through the whole introduction, the main screens,
// the settings with the install steps, and names a second character with a
// name already taken. Every step leaves a screenshot, and report.md lists
// the steps with what the page complained about. Run by the "iPhone (WebKit)"
// workflow; at a computer:
//
//   BROWSER=chromium PLAYWRIGHT=/path/to/playwright/index.mjs BASE=https://127.0.0.1:8787 node tools/iphone-check.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const { chromium, devices, webkit } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'https://127.0.0.1:8787';
const OUT = process.env.OUT ?? 'checks/iphone';
const browserType = process.env.BROWSER === 'chromium' ? chromium : webkit;
mkdirSync(OUT, { recursive: true });

const browser = await browserType.launch();
// The local server's certificate is its own.
const options = { ...devices['iPhone 13'], locale: 'pl-PL', timezoneId: 'Europe/Warsaw', ignoreHTTPSErrors: true };
const context = await browser.newContext(options);
const page = await context.newPage();
page.setDefaultTimeout(20000);

const steps = [];
const complaints = [];
page.on('pageerror', (error) => complaints.push(`błąd strony: ${error.message}`));
// A failed request shows once, as its response; the console only repeats it.
// The service worker cannot start on the local server's own certificate.
page.on('console', (message) => {
  const text = message.text();
  if (message.type() === 'error' && !text.startsWith('Failed to load resource') && !/SSL certificate error occurred when fetching the script/.test(text)) {
    complaints.push(`konsola: ${text}`);
  }
});
page.on('response', (response) => {
  // Expected: no session before signing in, no character before creating
  // one, and the refused name.
  if (response.status() >= 400 && !/\/api\/(me|character)$/.test(new URL(response.url()).pathname)) {
    complaints.push(`odpowiedź ${response.status()}: ${response.url()}`);
  }
});

let shots = 0;
// A step: its action, then a screenshot of the screen it leaves.
async function step(name, action) {
  const started = Date.now();
  const file = `${String(++shots).padStart(2, '0')}.png`;
  let error = null;
  try {
    await action();
  } catch (failure) {
    error = failure.message.split('\n')[0];
  }
  // caret: 'initial': hiding the caret takes a style of Playwright's own,
  // which the game's policy refuses in WebKit.
  await page.screenshot({ path: join(OUT, file), caret: 'initial' }).catch(() => {});
  steps.push({ name, ok: !error, seconds: (Date.now() - started) / 1000, file, error });
  console.log(`${error ? '✖' : '✔'} ${name}${error ? ` — ${error}` : ''}`);
  return !error;
}

const card = async () => {
  await page.waitForSelector('.narrator[open] .narrator-next');
  await page.waitForTimeout(1200);
};
const next = async () => {
  await page.click('.narrator .narrator-next');
  await page.waitForTimeout(600);
};
// The next parchment up, not the one rolling away.
const note = async () => {
  await page.evaluate(() => document.querySelectorAll('.guide-note').forEach((element) => element.setAttribute('data-old', '')));
};
const arrived = async () => {
  await page.waitForSelector('.guide-note:not([data-old]):not(.guide-note--waiting)', { timeout: 20000 });
  await page.waitForTimeout(1500);
};
const pointer = async (action) => {
  await note();
  await action();
  await arrived();
};
const onward = () => pointer(() => page.click('.guide-next'));

const stamp = Date.now() % 100000;
const name = `Justi${'abcdefghij'[stamp % 10]}${'abcdefghij'[Math.floor(stamp / 10) % 10]}`;

async function register(login) {
  await page.goto(BASE);
  await page.click('[data-auth-mode="register"]');
  await page.fill('#register-login', login);
  await page.fill('#register-password', 'tajnehaslo1');
  await page.click('#register-form button[type="submit"]');
  await page.waitForSelector('.class-card');
}

async function create(characterName, classId = 'archer', look = 'female') {
  await page.click(`[data-look="${look}"]`);
  await page.click(`.class-card[data-class-id="${classId}"]`);
  await page.fill('#character-name', characterName);
  await page.click('#create-screen button[type="submit"]');
}

await step('Ekran startowy', async () => {
  await page.goto(BASE);
  await page.waitForSelector('[data-auth-mode="register"]');
});
await step('Rejestracja i tworzenie postaci', () => register(`iphone${stamp}`));
await step(`Imię „${name}”, Łuczniczka`, async () => {
  await create(name);
  await card();
});
let intro = true;
for (const label of ['Karta 2', 'Karta 3']) {
  intro &&= await step(label, async () => {
    await next();
    await card();
  });
}
const pointers = [
  ['Wybór regionu', () => pointer(() => next())],
  ['Wybór miejsca', () => pointer(() => page.click('[data-guide="region-windfalls"]'))],
  ['Suwak długości', () => pointer(() => page.click('[data-guide="area-windfalls-edge"]'))],
  ['„Wyrusz”', () => onward()],
  ['Pominięcie czasu', () => pointer(() => page.click('[data-guide="start"]'))],
  ['„Pomiń” na wyprawie', () => onward()],
  [
    'Odbiór raportu',
    () =>
      pointer(async () => {
        await page.click('[data-guide="skip-activity"]');
        await page.waitForSelector('#sheet[open]');
        await page.click('#sheet .button--system');
      }),
  ],
  [
    'Karta raportu',
    async () => {
      await page.click('[data-guide="claim"]');
      await card();
    },
  ],
  ['Raport: podsumowanie', () => pointer(() => next())],
  ['Raport: komunikaty Systemu', () => onward()],
  ['Raport: walki', () => onward()],
  ['Raport: łupy', () => onward()],
  ['Raport: konto', () => onward()],
  ['Prowadzenie do Postaci', () => onward()],
  ['Postać: broń', () => onward()],
  ['Prowadzenie do Statystyk', () => onward()],
  ['Statystyki', () => onward()],
  ['Wolne punkty', () => onward()],
  [
    'Prowadzenie do obozu',
    () =>
      pointer(async () => {
        await page.click('[data-guide="auto-points"]');
        await page.waitForTimeout(900);
      }),
  ],
  ['Obóz', () => onward()],
  ['Obóz: Tartak', () => onward()],
  ['Obóz: Kamieniołom i Kopalnia', () => onward()],
  ['Obóz: Kowadło', () => onward()],
  ['Obóz: Ognisko', () => onward()],
  ['Budowa Ogniska', () => onward()],
  ['Odliczanie budowy', () => pointer(() => page.click('[data-guide="build"]'))],
  ['Ustawienia', () => onward()],
  [
    'Ostatnia karta',
    async () => {
      await page.click('.guide-next');
      await card();
      await next();
    },
  ],
];
for (const [label, action] of pointers) {
  if (!intro) break;
  intro = await step(label, action);
}
if (!intro) {
  // Whatever went wrong, the rest is still worth seeing.
  await step('Pominięcie reszty wprowadzenia', async () => {
    const skip = page.locator('.narrator-skip, .guide-skip').first();
    if (await skip.count()) await skip.click();
    await page.waitForTimeout(2500);
  });
}

for (const [label, hash, selector] of [
  ['Walka', '#/walka', '.region-card, [data-guide^="region-"]'],
  ['Postać', '#/postac', '[data-guide="slot-weapon"]'],
  ['Statystyki', '#/postac/statystyki', '.stat-row, .stat'],
  ['Obóz', '#/oboz', '[data-guide="plot-campfire"]'],
  ['Dziennik', '#/dziennik', 'a[href^="#/raport/"]'],
]) {
  await step(`Ekran: ${label}`, async () => {
    await page.goto(`${BASE}/${hash}`);
    await page.waitForSelector(selector);
    await page.waitForTimeout(800);
  });
}
await step('Raport z Dziennika', async () => {
  await page.click('a[href^="#/raport/"]');
  await page.waitForSelector('.unit--ally');
  await page.locator('.arena').scrollIntoViewIfNeeded();
  await page.waitForTimeout(2000);
});
await step('Ustawienia', async () => {
  await page.click('.topbar .icon-button[aria-label="Ustawienia"]');
  await page.waitForSelector('#sheet[open]');
  await page.waitForTimeout(500);
});
await step('Instalacja na iPhonie', async () => {
  await page.click('#sheet .install-button');
  await page.waitForTimeout(1000);
});

// A second player picks the same name: the page must say it is taken.
const context2 = await browser.newContext(options);
const second = await context2.newPage();
second.on('pageerror', (error) => complaints.push(`błąd strony (druga postać): ${error.message}`));
let taken = '';
await step('Drugi gracz: to samo imię', async () => {
  await second.goto(BASE);
  await second.click('[data-auth-mode="register"]');
  await second.fill('#register-login', `iphone${stamp}b`);
  await second.fill('#register-password', 'tajnehaslo1');
  await second.click('#register-form button[type="submit"]');
  await second.waitForSelector('.class-card');
  await second.click('[data-look="male"]');
  await second.click('.class-card[data-class-id="mage"]');
  await second.fill('#character-name', name.toUpperCase());
  await second.click('#create-screen button[type="submit"]');
  await second.waitForSelector('#create-screen .form-error:not([hidden])');
  taken = await second.locator('#create-screen .form-error').innerText();
  await second.screenshot({ path: join(OUT, 'zajete-imie.png'), caret: 'initial' });
  if (!/inna postać/.test(taken)) throw new Error(`komunikat: ${taken}`);
});

await browser.close();
const ok = steps.filter((entry) => entry.ok).length;
const report = [
  `# Przejście gry w silniku Safari (${process.env.BROWSER === 'chromium' ? 'Chromium' : 'WebKit'}, iPhone 13)`,
  '',
  `${ok} z ${steps.length} kroków przeszło. Imię: ${name}. Komunikat przy zajętym imieniu: „${taken}”.`,
  '',
  '| Krok | Wynik | Czas | Zrzut |',
  '| --- | --- | --- | --- |',
  ...steps.map((entry) => `| ${entry.name} | ${entry.ok ? 'ok' : `błąd: ${entry.error}`} | ${entry.seconds.toFixed(1)} s | ${entry.file} |`),
  '',
  '## Uwagi strony',
  '',
  ...(complaints.length ? [...new Set(complaints)].map((line) => `- ${line}`) : ['Brak.']),
  '',
].join('\n');
writeFileSync(join(OUT, 'report.md'), report);
console.log(`\n${ok} z ${steps.length} kroków przeszło, uwag strony: ${new Set(complaints).size}`);
process.exitCode = ok === steps.length ? 0 : 1;

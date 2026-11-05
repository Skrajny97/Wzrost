// The game's screens on many screen sizes (the author, 5.11.2026: „robić
// solidnie gui adaptation na przyszlosc na rozne rozdzielczości”): phones
// from 320 to 430 px wide, a tablet and computers, with a character of big
// numbers (level 146, almost a million gold, six-digit camp resources), a
// long name, orders on the Stół rozbiórki's queue and a guild of its own
// with a long name. On each screen, and on the tabs TABS opens, it
// looks for a page wider than the screen, text out of its frame
// and elements past the right edge, and lists text cut with "…" for a look.
// Run against a dev server (npm run dev) from the repo folder whose local D1
// the server uses, as tools/first-steps.cjs:
//   NODE_PATH=$(npm root -g) node tools/layout-check.cjs http://localhost:8787 [folder for screenshots]
// Exit code 1 when a screen has a problem; the "…" cuts never fail it.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE = process.argv[2] ?? 'http://localhost:8787';
const OUT = process.argv[3] ?? null;
// The local D1 of the folder it runs from, as tools/first-steps.cjs.
const sql = (command) => execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--command', command], { stdio: 'ignore' });

const SIZES = [
  { name: 'telefon 320', width: 320, height: 568, mobile: true },
  { name: 'telefon 360', width: 360, height: 780, mobile: true },
  { name: 'telefon 375', width: 375, height: 667, mobile: true },
  { name: 'telefon 390', width: 390, height: 844, mobile: true },
  { name: 'telefon 414', width: 414, height: 896, mobile: true },
  { name: 'telefon 430', width: 430, height: 932, mobile: true },
  { name: 'tablet 768', width: 768, height: 1024, mobile: true },
  { name: 'komputer 1366', width: 1366, height: 768, mobile: false },
  { name: 'komputer 1920', width: 1920, height: 1080, mobile: false },
];
const SCREENS = [
  '#/postac',
  '#/postac/statystyki',
  '#/postac/umiejetnosci',
  '#/walka',
  '#/walka/windfalls',
  '#/profesje',
  '#/oboz',
  '#/oboz/craft-table',
  '#/osada',
  '#/osada/board',
  '#/osada/tavern',
  '#/osada/tavern/companions',
  '#/osada/tavern/mercenaries',
  '#/osada/trial-hall',
  '#/spolecznosc',
  '#/spolecznosc/ranking',
  '#/gildia',
  '#/gildia/seat',
  '#/gildia/expedition',
  '#/gildia/beast',
  '#/gildia/trials',
  '#/gildia/requests',
  '#/gildia/exchange',
  '#/sklep',
  '#/encyklopedia',
  '#/dziennik',
];
// Tabs opened on a screen after its first look, by the start of their
// names: the Stół rozbiórki's queue, with "Usuń z kolejki" by each order,
// the Tablica zleceń's Poszukiwani and the Ranking's guilds.
const TABS = { '#/oboz/craft-table': ['Kolejka'], '#/osada/board': ['Poszukiwani'], '#/spolecznosc/ranking': ['Gildie'] };

// What is wrong on the screen now, by the page itself.
function audit() {
  const found = [];
  const vw = document.documentElement.clientWidth;
  const wider = document.documentElement.scrollWidth - vw;
  if (wider > 1) found.push({ kind: 'page', where: 'strona', text: `szersza od ekranu o ${wider} px` });
  const label = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };
  const shown = (el) => {
    if (el.closest('[hidden], [aria-hidden="true"], .sr-only, .visually-hidden')) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };
  // Inside something that scrolls sideways or clips on purpose.
  const insideClip = (el) => {
    for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
      const x = getComputedStyle(up).overflowX;
      if (x === 'auto' || x === 'scroll' || x === 'hidden' || x === 'clip') return true;
    }
    return false;
  };
  for (const el of document.querySelectorAll('body *')) {
    if (!shown(el)) continue;
    const style = getComputedStyle(el);
    if (style.position === 'fixed' && el.closest('#toast, .toast')) continue;
    const text = [...el.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent).join('').trim();
    const block = style.display !== 'inline' && el.clientWidth > 0;
    if (text && block && el.scrollWidth > el.clientWidth + 1) {
      if (style.textOverflow === 'ellipsis') found.push({ kind: 'cut', where: label(el), text: text.slice(0, 40) });
      else if (style.overflowX === 'visible' && !insideClip(el)) found.push({ kind: 'spill', where: label(el), text: `${text.slice(0, 40)} (${el.scrollWidth} px w ${el.clientWidth} px)` });
    }
    const box = el.getBoundingClientRect();
    if (box.right > vw + 1 && box.left < vw && !insideClip(el) && style.position !== 'fixed') found.push({ kind: 'edge', where: label(el), text: `${Math.round(box.right - vw)} px za prawą krawędzią` });
  }
  // One line for each element: an element past the edge drags its children.
  const seen = new Set();
  return found.filter((one) => {
    const key = `${one.kind}|${one.where}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  const browser = await chromium.launch();
  const stamp = Date.now().toString(36).slice(-5);
  const login = `uklad${stamp}`;
  // A long name of 20 characters with Polish letters.
  const name = `Bożydarłomiej${stamp}`.slice(0, 20);
  const first = await browser.newContext();
  const page = await first.newPage();
  await page.goto(BASE);
  const api = (method, url, body) =>
    page.evaluate(async ({ method, url, body }) => {
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      return response.status;
    }, { method, url, body });
  await api('POST', '/api/auth/register', { login, email: `${login}@example.com`, password: 'pierwszekroki1' });
  sql(`UPDATE users SET email_confirmed_at = 1 WHERE login = '${login}'`);
  await api('POST', '/api/auth/login', { identifier: login, password: 'pierwszekroki1' });
  if ((await api('POST', '/api/character', { name, classId: 'warrior', appearance: 'female' })) >= 400) throw new Error('Nie powstała postać.');
  sql(`UPDATE characters SET level = 146, class_level = 99, gold = 987654, system_points = 12345, time_points = 9876, tutorial = NULL WHERE name = '${name}'`);
  sql(`UPDATE characters SET resources = '${JSON.stringify({ wood: 123456, stone: 98765, 'iron-ore': 54321 })}' WHERE name = '${name}'`);
  // A guild of its own, with a long name, for the Gildia's tabs.
  if ((await api('POST', '/api/guild/found', { name: `Bractwo Żelaznych ${stamp}`, tag: `W${stamp.slice(-3).toUpperCase()}` })) >= 400) throw new Error('Nie powstała gildia.');
  // The Stół rozbiórki built, with long names and big numbers: three orders
  // in its queue, one at work, and a stack left on the Materiały tab.
  const materials = { 'tick-shell:common': 12345, 'black-stork-feather:rare': 9876, 'night-heron-plume:mythic': 1234, 'goblin-trinket:epic': 987 };
  sql(`INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) SELECT id, 'craft-table', 10, 0, 1 FROM characters WHERE name = '${name}'`);
  sql(`UPDATE characters SET materials = '${JSON.stringify(materials)}' WHERE name = '${name}'`);
  if ((await api('POST', '/api/craft/materials', { keys: Object.keys(materials).slice(0, 3) })) >= 400) throw new Error('Stół nie przyjął materiałów.');
  const storage = await first.storageState();
  await first.close();

  let problems = 0;
  for (const size of SIZES) {
    const context = await browser.newContext({ storageState: storage, viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1, isMobile: size.mobile, hasTouch: size.mobile, locale: 'pl-PL', timezoneId: 'Europe/Warsaw' });
    const view = await context.newPage();
    const errors = [];
    view.on('pageerror', (error) => errors.push(error.message));
    await view.goto(`${BASE}/${SCREENS[0]}`);
    await view.waitForTimeout(2500);
    const check = async (screen) => {
      const found = await view.evaluate(audit);
      const bad = found.filter((one) => one.kind !== 'cut');
      const cut = found.filter((one) => one.kind === 'cut');
      if (bad.length > 0) {
        problems += bad.length;
        console.log(`✖ ${size.name} ${screen}`);
        for (const one of bad) console.log(`    ${one.kind}: ${one.where} — ${one.text}`);
        if (OUT) await view.screenshot({ path: path.join(OUT, `${size.width}-${screen.replace(/[^\p{L}\w]+/gu, '-').replace(/^-|-$/g, '')}.png`) });
      }
      for (const one of cut) console.log(`  … ${size.name} ${screen}: ${one.where} „${one.text}”`);
    };
    for (const screen of SCREENS) {
      await view.goto(`${BASE}/${screen}`);
      await view.waitForTimeout(1500);
      await check(screen);
      for (const tab of TABS[screen] ?? []) {
        // A tab the screen does not show (as Poszukiwani with no posters)
        // is named and skipped.
        const button = view.locator('button.segmented-option, [role="tab"]', { hasText: tab }).first();
        if ((await button.count()) === 0) {
          console.log(`  – ${size.name} ${screen}: brak zakładki „${tab}”`);
          continue;
        }
        await button.click();
        await view.waitForTimeout(500);
        await check(`${screen} › ${tab}`);
      }
    }
    if (errors.length > 0) {
      problems += errors.length;
      console.log(`✖ ${size.name}: błędy strony: ${errors.join(' | ')}`);
    }
    await context.close();
  }
  await browser.close();
  console.log(problems === 0 ? `✔ ${SIZES.length} rozmiarów ekranu × ${SCREENS.length} ekranów bez problemów.` : `✖ Problemów: ${problems}.`);
  process.exit(problems === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

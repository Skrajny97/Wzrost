// The game's screens on many screen sizes (the author, 5.11.2026: „robić
// solidnie gui adaptation na przyszlosc na rozne rozdzielczości”): phones
// from 320 to 430 px wide, a tablet and computers, with a character of big
// numbers (level 146, almost a million gold, six-digit camp resources), a
// long name, orders on the Stół rozbiórki's queue and a guild of its own
// with a long name, and a companion hired in the Kwatery, with its five
// places for items and amulets of big numbers in the bag for "Załóż z
// plecaka" (one worn by the companion), on an account with the longest login. On each screen,
// on the tabs TABS opens and in the sheets SHEETS opens over a screen (the
// Ustawienia and "Zgłoś błąd", with a screenshot picked too), it looks for a
// page wider than the screen (a sheet that scrolls sideways), text out of
// its frame and elements past the right edge, and lists text cut with "…"
// for a look. Before the game, the screens around it: the login and the new
// account's forms, the choice of a character on an account with two of them,
// long-named, and the creation of a new one.
// Run against a dev server (npm run dev) from the repo folder whose local D1
// the server uses, as tools/first-steps.cjs:
//   NODE_PATH=$(npm root -g) node tools/layout-check.cjs http://localhost:8787 [folder for screenshots] [--lang pl|en]
// Exit code 1 when a screen has a problem; the "…" cuts never fail it.
// --lang (Polish by default): the browser's language, so the accounts and
// the page take it where the game offers English (src/client/i18n.js); the
// names of tabs and sheets it looks for are then their English
// (data/en/strings.json) where they have it. In English it also lists, for a
// look, the Polish words left on the screens around the game, in the
// Ustawienia and on the screens already translated (TRANSLATED; the names of
// the characters and the guild aside).
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const langAt = args.indexOf('--lang');
const LANG = langAt >= 0 ? args.splice(langAt, 2)[1] : 'pl';
if (!['pl', 'en'].includes(LANG)) throw new Error(`Nieznany język: ${LANG}. Wybierz pl albo en.`);
const LOCALE = { pl: 'pl-PL', en: 'en-US' }[LANG];
const ENGLISH = LANG === 'en' ? JSON.parse(fs.readFileSync(path.join(__dirname, '../data/en/strings.json'), 'utf8')) : {};
// A text of the page as it shows in the language checked.
const said = (polish) => ENGLISH[polish] || polish;
const BASE = args[0] ?? 'http://localhost:8787';
const OUT = args[1] ?? null;
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
  '#/postac/ewolucja',
  '#/walka',
  '#/walka/windfalls',
  '#/walka/windfalls/windfalls-edge',
  '#/portale',
  '#/wieze',
  '#/profesje',
  '#/oboz',
  '#/oboz/craft-table',
  '#/oboz/quarters',
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
// The screens already in English (data/en/scope.json, stages 2 to 4 of
// the English beta: all of them now): in English the check lists the
// Polish words left on them, as on the screens before the game.
const TRANSLATED = new Set([
  '#/postac',
  '#/postac/statystyki',
  '#/postac/umiejetnosci',
  '#/postac/ewolucja',
  '#/walka',
  '#/walka/windfalls',
  '#/walka/windfalls/windfalls-edge',
  '#/portale',
  '#/wieze',
  '#/profesje',
  '#/oboz',
  '#/oboz/craft-table',
  '#/oboz/quarters',
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
]);
// Tabs opened on a screen after its first look, by the start of their
// names: the Stół rozbiórki's queue, with "Usuń z kolejki" by each order,
// the Tablica zleceń's Poszukiwani and the Ranking's guilds.
// The Ranking's guilds tab is named in data/guilds.json (fame.tabs), so its
// English comes from data/en/guilds.json, not from strings.json.
const GUILDS_TAB = LANG === 'en' ? JSON.parse(fs.readFileSync(path.join(__dirname, '../data/en/guilds.json'), 'utf8')).fame.texts.tabs.guilds : 'Gildie';
// Folds opened on a screen after its tabs, all at once: the Portale's
// cards, each its picture till a tap shows its stage (7.11.2026).
const FOLDS = { '#/portale': '.portal-toggle[aria-expanded="false"]' };
const TABS = { '#/oboz/craft-table': [said('Kolejka ({count}/{limit})').replace(/\s*\(.*$/, '')], '#/osada/board': [said('Poszukiwani')], '#/spolecznosc/ranking': [GUILDS_TAB] };
// Sheets opened over a screen after its tabs, each from the one before (a
// tap on `tap`, or a picture given to the file field `pick`), looked at
// alone once `ready` shows in it, and closed at the end with "Zamknij". The
// Ustawienia from the gear in the top bar, found by its class as the
// narrator finds it (on a computer the bar is laid out otherwise), with
// "Pomijaj objaśnienia narratora" and the line under it; "Zgłoś błąd" from
// them; and the same with a picture picked in "Dołącz zrzut ekranu", which
// the page makes smaller on a canvas and shows on it, "Usuń zrzut" under it.
const SHEETS = {
  '#/oboz/quarters': [
    { name: 'Załóż z plecaka', tap: `button:text-is("${said('Załóż z plecaka')}")`, ready: '.item-list:has(.wear-choice)', words: true },
    { name: 'porównanie', tap: '#sheet .item-list > li:first-child .wear-choice > summary', ready: '.wear-choice[open] .compare', words: true },
  ],
  // The sheet Tygodnie from the week's line on the Walka screen (weeks.js),
  // its whole year left as the player left it.
  '#/walka': [{ name: 'Tygodnie', tap: '.week-line', ready: '.week-card--now', words: true }],
  '#/postac': [
    { name: 'Ustawienia', tap: '.topbar .settings-button', ready: `h2.sheet-title:text-is("${said('Ustawienia')}")`, words: true },
    { name: 'Zgłoś błąd', tap: `#sheet button:text-is("${said('Zgłoś błąd')}")`, ready: `h2.sheet-title:text-is("${said('Zgłoś błąd')}")`, words: true },
    { name: 'zrzut ekranu', pick: '#sheet input[type="file"]', ready: '.bug-shot-preview' },
  ],
};

// The Polish words on the screen, or in the sheet `frame`, for a look at
// what is left to translate: each text with a Polish letter, but the names
// the check gave (`names`).
function polishWords({ frame, names }) {
  const root = frame ? document.querySelector(frame) : document.body;
  const found = new Set();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const element = node.parentElement;
    if (!element || element.closest('[hidden], [aria-hidden="true"]') || getComputedStyle(element).display === 'none') continue;
    let text = node.textContent.trim();
    for (const name of names) text = text.replaceAll(name, '');
    if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(text)) found.add(node.textContent.trim().slice(0, 60));
  }
  return [...found];
}

// What is wrong on the screen now, by the page itself. With `frame`, the
// selector of a sheet open over the screen, only what is in the sheet: it
// stands for the screen, and as it scrolls on its own, what is too wide for
// it makes it scroll sideways, not the page.
function audit(frame) {
  const found = [];
  const label = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };
  const sheet = frame ? document.querySelector(frame) : null;
  let vw = document.documentElement.clientWidth;
  if (sheet) {
    const box = sheet.getBoundingClientRect();
    if (box.right > vw + 1) found.push({ kind: 'edge', where: label(sheet), text: `${Math.round(box.right - vw)} px za prawą krawędzią` });
    const wider = sheet.scrollWidth - sheet.clientWidth;
    if (wider > 1) found.push({ kind: 'page', where: 'okienko', text: `przewija się na boki o ${wider} px` });
    // The sheet's own right edge, inside its border and scroll bar.
    vw = box.left + sheet.clientLeft + sheet.clientWidth;
  } else {
    const wider = document.documentElement.scrollWidth - vw;
    if (wider > 1) found.push({ kind: 'page', where: 'strona', text: `szersza od ekranu o ${wider} px` });
  }
  const shown = (el) => {
    if (el.closest('[hidden], [aria-hidden="true"], .sr-only, .visually-hidden')) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };
  // Inside something that scrolls sideways or clips on purpose (in the
  // sheet, below the sheet itself).
  const top = sheet ?? document.body;
  const insideClip = (el) => {
    for (let up = el.parentElement; up && up !== top; up = up.parentElement) {
      const x = getComputedStyle(up).overflowX;
      if (x === 'auto' || x === 'scroll' || x === 'hidden' || x === 'clip') return true;
    }
    return false;
  };
  for (const el of sheet ? sheet.querySelectorAll('*') : document.querySelectorAll('body *')) {
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
    if (box.right > vw + 1 && box.left < vw && !insideClip(el) && style.position !== 'fixed') {
      found.push({ kind: 'edge', where: label(el), text: `${Math.round(box.right - vw)} px za prawą krawędzią${sheet ? ' okienka' : ''}` });
    }
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
  // The longest login, 24 characters, for the Ustawienia's Konto and E-mail.
  const login = `uklad${stamp}_ekranu_gracza`;
  // A long name of 20 characters with Polish letters.
  const name = `Bożydarłomiej${stamp}`.slice(0, 20);
  const first = await browser.newContext({ locale: LOCALE });
  const page = await first.newPage();
  await page.goto(BASE);
  const api = (method, url, body) =>
    page.evaluate(async ({ method, url, body }) => {
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      return response.status;
    }, { method, url, body });
  await api('POST', '/api/auth/register', { login, email: `${login}@example.com`, password: 'pierwszekroki1', adult: true });
  sql(`UPDATE users SET email_confirmed_at = 1 WHERE login = '${login}'`);
  await api('POST', '/api/auth/login', { identifier: login, password: 'pierwszekroki1' });
  if ((await api('POST', '/api/character', { name, classId: 'warrior', appearance: 'female' })) >= 400) throw new Error('Nie powstała postać.');
  sql(`UPDATE characters SET level = 146, class_level = 99, gold = 987654, system_points = 12345, time_points = 9876, tutorial = NULL WHERE name = '${name}'`);
  sql(`UPDATE characters SET resources = '${JSON.stringify({ wood: 123456, stone: 98765, 'iron-ore': 54321 })}' WHERE name = '${name}'`);
  // The Portale high up, and one entry for the Dziennik's row.
  sql(`UPDATE characters SET portals = '${JSON.stringify({ best: { gold: 100, wood: 99, materials: 95, parts: 12 } })}' WHERE name = '${name}'`);
  if ((await api('POST', '/api/portals/enter', { portal: 'materials' })) >= 400) throw new Error('Nie udało się wejść do Portalu.');
  // A guild of its own, with a long name, for the Gildia's tabs.
  if ((await api('POST', '/api/guild/found', { name: `Bractwo Żelaznych ${stamp}`, tag: `W${stamp.slice(-3).toUpperCase()}` })) >= 400) throw new Error('Nie powstała gildia.');
  // The Stół rozbiórki built, with long names and big numbers: three orders
  // in its queue, one at work, and a stack left on the Materiały tab.
  const materials = { 'tick-shell:common': 12345, 'black-stork-feather:rare': 9876, 'night-heron-plume:mythic': 1234, 'goblin-trinket:epic': 987 };
  sql(`INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) SELECT id, 'craft-table', 10, 0, 1 FROM characters WHERE name = '${name}'`);
  sql(`UPDATE characters SET materials = '${JSON.stringify(materials)}' WHERE name = '${name}'`);
  if ((await api('POST', '/api/craft/materials', { keys: Object.keys(materials).slice(0, 3) })) >= 400) throw new Error('Stół nie przyjął materiałów.');
  // The Kwatery built, with a companion hired from the Karczma.
  sql(`INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) SELECT id, 'quarters', 3, 0, 1 FROM characters WHERE name = '${name}'`);
  const { settlement } = await page.evaluate(() => fetch('/api/settlement').then((response) => response.json()));
  const candidate = settlement?.companions?.candidates?.[0];
  if (!candidate || (await api('POST', '/api/settlement/hire', { candidateId: candidate.id })) >= 400) throw new Error('Nie udało się zwerbować towarzysza.');
  // Three amulets of one name and big numbers in the bag, one of them put on
  // the companion, for "Załóż z plecaka" and its comparison.
  for (const affixes of [[{ stat: 'strength', value: 9876 }, { stat: 'vitality', value: 8765 }], [{ stat: 'dexterity', value: 7654 }, { stat: 'perception', value: 6543 }], [{ stat: 'endurance', value: 5432 }]]) {
    const data = JSON.stringify({ base: 'amulet', slot: 'amulet', level: 146, rarity: 'legendary', affixes, implicit: { stat: 'will', value: 4321 } });
    sql(`INSERT INTO items (character_id, slot, data, created_at) SELECT id, NULL, '${data}', 1 FROM characters WHERE name = '${name}'`);
  }
  const hired = (await page.evaluate(() => fetch('/api/settlement').then((response) => response.json()))).settlement?.companions?.hired?.[0];
  if (!hired?.wearable?.length || (await api('POST', '/api/settlement/equip', { companionId: hired.id, itemId: hired.wearable[0] })) >= 400) throw new Error('Towarzysz nie założył amuletu.');
  // The picture for "Dołącz zrzut ekranu": a PNG drawn on a canvas, of a
  // computer screen's shape and wider than any sheet, so that its preview
  // has to fit itself in.
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const draw = canvas.getContext('2d');
    draw.fillStyle = '#2f4a2a';
    draw.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const picture = { name: 'zrzut-ekranu.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') };
  const storage = await first.storageState();
  // For the screens before the game: an account with two characters, both
  // with long names, and the longest login, signed in with the form. The
  // first account's session stays for the game's screens: the cookie goes,
  // without signing out.
  const other = `wybor${stamp}_postaci_konta_`.slice(0, 24);
  const otherNames = [`Wszemiłosława${stamp}`.slice(0, 20), `Świętopełkowa${stamp}`.slice(0, 20)];
  await first.clearCookies();
  await api('POST', '/api/auth/register', { login: other, email: `${other}@example.com`, password: 'pierwszekroki1', adult: true });
  sql(`UPDATE users SET email_confirmed_at = 1 WHERE login = '${other}'`);
  for (const [index, otherName] of otherNames.entries()) {
    if ((await api('POST', '/api/character', { name: otherName, classId: index === 0 ? 'cleric' : 'shadow', appearance: 'male' })) >= 400) throw new Error('Nie powstała postać do wyboru.');
  }
  sql(`UPDATE characters SET level = 146, class_level = 99 WHERE name = '${otherNames[0]}'`);
  await first.close();
  const names = [name, ...otherNames, login, other, `Bractwo Żelaznych ${stamp}`, ...(hired?.name ? [hired.name] : [])];

  let problems = 0;
  for (const size of SIZES) {
    const options = { viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1, isMobile: size.mobile, hasTouch: size.mobile, locale: LOCALE, timezoneId: 'Europe/Warsaw' };
    let view = null;
    const check = async (screen, frame, words = false) => {
      const found = await view.evaluate(audit, frame);
      const bad = found.filter((one) => one.kind !== 'cut');
      const cut = found.filter((one) => one.kind === 'cut');
      if (bad.length > 0) {
        problems += bad.length;
        console.log(`✖ ${size.name} ${screen}`);
        for (const one of bad) console.log(`    ${one.kind}: ${one.where} — ${one.text}`);
        if (OUT) await view.screenshot({ path: path.join(OUT, `${size.width}-${screen.replace(/[^\p{L}\w]+/gu, '-').replace(/^-|-$/g, '')}.png`) });
      }
      for (const one of cut) console.log(`  … ${size.name} ${screen}: ${one.where} „${one.text}”`);
      if (LANG === 'en' && words) for (const text of await view.evaluate(polishWords, { frame, names })) console.log(`  pl ${size.name} ${screen}: „${text}”`);
    };

    // Before the game: the login, the new account's form, the choice of a
    // character after signing in, and the creation of a new one from it.
    const start = await browser.newContext(options);
    view = await start.newPage();
    const startErrors = [];
    view.on('pageerror', (error) => startErrors.push(error.message));
    const trail = [];
    try {
      await view.goto(BASE);
      await view.locator('#view-auth:not([hidden]) #login-form').waitFor({ timeout: 10000 });
      await view.waitForTimeout(1000);
      trail.push('logowanie');
      await check('logowanie', null, true);
      trail.push('nowe konto');
      await view.locator('[data-auth-mode="register"]').click();
      await check('nowe konto', null, true);
      trail.push('wybór postaci');
      await view.locator('[data-auth-mode="login"]').click();
      await view.locator('#login-identifier').fill(other);
      await view.locator('#login-password').fill('pierwszekroki1');
      await view.locator('#login-form button[type="submit"]').click();
      await view.locator('#view-select:not([hidden]) .select-card').first().waitFor({ timeout: 10000 });
      await view.waitForTimeout(500);
      await check('wybór postaci', null, true);
      trail.push('nowa postać');
      await view.locator('#view-select .select-actions .button--system').click();
      await view.locator('#view-create:not([hidden]) .class-card').first().waitFor({ timeout: 10000 });
      await view.waitForTimeout(500);
      await check('nowa postać', null, true);
    } catch (error) {
      problems += 1;
      console.log(`✖ ${size.name} ${trail.join(' › ')}`);
      console.log(`    start: ${error.message.split('\n')[0]}`);
    }
    if (startErrors.length > 0) {
      problems += startErrors.length;
      console.log(`✖ ${size.name}: błędy strony przed grą: ${startErrors.join(' | ')}`);
    }
    await start.close();

    const context = await browser.newContext({ ...options, storageState: storage });
    view = await context.newPage();
    const errors = [];
    view.on('pageerror', (error) => errors.push(error.message));
    await view.goto(`${BASE}/${SCREENS[0]}`);
    await view.waitForTimeout(2500);
    for (const screen of SCREENS) {
      await view.goto(`${BASE}/${screen}`);
      await view.waitForTimeout(1500);
      await check(screen, null, TRANSLATED.has(screen));
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
        await check(`${screen} › ${tab}`, null, TRANSLATED.has(screen));
      }
      if (FOLDS[screen]) {
        // Each one opened leaves the selector, so always the first closed one.
        for (let left = await view.locator(FOLDS[screen]).count(); left > 0; left -= 1) await view.locator(FOLDS[screen]).first().click();
        await view.waitForTimeout(500);
        await check(`${screen} › otwarte`, null, TRANSLATED.has(screen));
      }
      // A sheet that does not open or close is a problem; the steps after it
      // are left, and the page loaded anew.
      const trail = [screen];
      try {
        for (const step of SHEETS[screen] ?? []) {
          trail.push(step.name);
          if (step.pick) await view.locator(step.pick).setInputFiles(picture, { timeout: 5000 });
          else await view.locator(step.tap).click({ timeout: 5000 });
          await view.locator(`#sheet[open] ${step.ready}`).waitFor({ timeout: 5000 });
          await view.waitForTimeout(500);
          await check(trail.join(' › '), '#sheet', step.words);
        }
        if (SHEETS[screen]) {
          trail.push('Zamknij');
          await view.locator('#sheet .sheet-close').click({ timeout: 5000 });
          await view.locator('#sheet').waitFor({ state: 'hidden', timeout: 5000 });
        }
      } catch (error) {
        problems += 1;
        console.log(`✖ ${size.name} ${trail.join(' › ')}`);
        console.log(`    sheet: #sheet — ${error.message.split('\n')[0]}`);
        await view.reload();
        await view.waitForTimeout(1500);
      }
    }
    if (errors.length > 0) {
      problems += errors.length;
      console.log(`✖ ${size.name}: błędy strony: ${errors.join(' | ')}`);
    }
    await context.close();
  }
  await browser.close();
  console.log(problems === 0 ? `✔ ${SIZES.length} rozmiarów ekranu × ${SCREENS.length + 4} ekranów bez problemów${LANG === 'pl' ? '' : ` (${LANG.toUpperCase()})`}.` : `✖ Problemów: ${problems}.`);
  process.exit(problems === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

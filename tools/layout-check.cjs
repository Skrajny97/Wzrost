// The game's screens on many screen sizes (the author, 5.11.2026: „robić
// solidnie gui adaptation na przyszlosc na rozne rozdzielczości”): phones
// from 320 to 430 px wide, a tablet and computers, with a character of big
// numbers (level 146, almost a million gold, six-digit camp resources), a
// long name, a build under way in the camp, orders on the Stół rozbiórki's queue and a guild of its own
// with a long name (its fifteen other members each building, for the
// shortcut to help on the Walka screen), a Drużyna it leads with two busy
// members of the longest names (their lines in the Drużyna and in the
// Walka), and a companion hired in the Kwatery, with its five
// places for items and amulets of big numbers in the bag for "Załóż z
// plecaka" (one worn by the companion), a sword at +10 with three of the
// Zaklinaczka's stars, an item of the longest name with a gem in it and
// gems by the hundred thousand for Jubilerstwo's „Oprawianie” and its "Z
// plecaka" (20.11.2026), the Osada's residents at several standings of the
// relation (one at the top in seven digits), on an account with the longest login and gold in
// billions in its Skrzynia Konta (its sheet "Wyjmij złoto" with all of it, and
// with too much typed), and above it in the Ranking postaci and the Punkty
// Sławy a member of its guild with all a row can hold (the longest name and
// title, the moderator's mark, the guild's tag, a World Boss's title), and on
// the Walka's Postrach Krainy tab the World Boss of its band with HP in ten
// digits, the best ten of the week and last week's chest to open (the dot
// on its option of the Walka's switch), and an attack on it with the fight
// in the arena (the cards' HP lines inside their cards). The bag
// is checked with its six tabs, on its Zioła and Spiżarnia (herbs, dishes,
// fish and crops by the thousand), and in "Zaznacz do sprzedaży" too, with
// an item marked; then the card of its item of the longest name, with
// "Wystaw na Targowisku", and the Targowisko's price sheet it opens. On
// each screen,
// on the tabs TABS opens and in the sheets SHEETS opens over a screen (the
// Ustawienia and "Zgłoś błąd", with a screenshot picked too), it looks for a
// page wider than the screen (a sheet that scrolls sideways), text out of
// its frame and elements past the right edge, and lists text cut with "…"
// for a look. In a ranking's row a character's name has to show whole, or
// cut with "…" only where it alone is wider than its cell. Before the game,
// the screens around it: the login and the new
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
  '#/postrach',
  '#/kultywacja',
  '#/portale',
  '#/wieze',
  '#/postac/rdzen',
  '#/postac/rdzen/skrytka',
  '#/profesje',
  '#/profesje/jubilerstwo',
  '#/oboz',
  '#/oboz/craft-table',
  '#/oboz/anvil',
  '#/oboz/quarters',
  '#/oboz/skrzynia-konta',
  '#/osada',
  '#/osada/board',
  '#/osada/enchanter',
  '#/osada/tavern',
  '#/osada/tavern/companions',
  '#/osada/tavern/mercenaries',
  '#/osada/trial-hall',
  '#/osada/trial-hall/trials',
  '#/labirynt',
  '#/osada/arena',
  '#/osada/casino/cards',
  '#/osada/herbalist/cards',
  '#/osada/market/cards',
  '#/spolecznosc',
  '#/spolecznosc/druzyna',
  '#/spolecznosc/ranking',
  '#/spolecznosc/slawa',
  '#/czat',
  '#/gildia',
  '#/gildia/seat',
  '#/gildia/expedition',
  '#/gildia/beast',
  '#/gildia/trials',
  '#/gildia/requests',
  '#/gildia/exchange',
  '#/gildia/chest',
  '#/gildia/stall',
  '#/gildia/war',
  '#/sklep',
  '#/encyklopedia',
  '#/encyklopedia/cards',
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
  '#/postrach',
  '#/kultywacja',
  '#/portale',
  '#/wieze',
  '#/postac/rdzen',
  '#/postac/rdzen/skrytka',
  '#/profesje',
  '#/profesje/jubilerstwo',
  '#/oboz',
  '#/oboz/craft-table',
  '#/oboz/anvil',
  '#/oboz/quarters',
  '#/oboz/skrzynia-konta',
  '#/osada',
  '#/osada/board',
  '#/osada/enchanter',
  '#/osada/tavern',
  '#/osada/tavern/companions',
  '#/osada/tavern/mercenaries',
  '#/osada/trial-hall',
  '#/osada/trial-hall/trials',
  '#/labirynt',
  '#/osada/arena',
  '#/osada/casino/cards',
  '#/osada/herbalist/cards',
  '#/osada/market/cards',
  '#/spolecznosc',
  '#/spolecznosc/druzyna',
  '#/spolecznosc/ranking',
  '#/spolecznosc/slawa',
  '#/czat',
  '#/gildia',
  '#/gildia/seat',
  '#/gildia/expedition',
  '#/gildia/beast',
  '#/gildia/trials',
  '#/gildia/requests',
  '#/gildia/exchange',
  '#/gildia/chest',
  '#/gildia/stall',
  '#/gildia/war',
  '#/sklep',
  '#/encyklopedia',
  '#/encyklopedia/cards',
  '#/dziennik',
]);
// Tabs opened on a screen after its first look, by the start of their
// names: the Stół rozbiórki's queue, with "Usuń z kolejki" by each order,
// the Tablica zleceń's Poszukiwani and the Ranking's guilds.
// The Ranking's guilds tab is named in data/guilds.json (fame.tabs), so its
// English comes from data/en/guilds.json, not from strings.json.
const GUILDS = JSON.parse(fs.readFileSync(path.join(__dirname, `../data/${LANG === 'en' ? 'en/' : ''}guilds.json`), 'utf8'));
const GUILDS_TAB = GUILDS.fame.texts.tabs.guilds;
// The Ranking członków of the Gildia tab (guild-ranking.js, 897 A): its
// "Wpłaty" from the start, the line of the donations of before under all.
const MEMBERS = GUILDS.members;
// Folds opened on a screen after its tabs, all at once: the Portale's
// cards, each its picture till a tap shows its stage (7.11.2026).
// The Encyklopedia's "Karty" (where CARDS is on), every land's cards.
// The league of the Wojna (996): its trios, the evenings' results and the
// fights, and "Jak to działa?", all opened.
// The Statystyki's stats, each with what it gives now (the side stats'
// lines too, 1218).
const FOLDS = {
  '#/postac/statystyki': '.stat-main[aria-expanded="false"]',
  // The Kultywacja's "Jak to działa?" (cultivation.js, 1230 A).
  '#/kultywacja': '.how-more:not([open]) > summary',
  '#/portale': '.portal-toggle[aria-expanded="false"]',
  '#/encyklopedia/cards': 'details.encyclopedia-fold:not([open]) > summary',
  '#/gildia/war': '.war details:not([open]) > summary',
};
// The Arena's Karty (card-arena.js, 900 A, where CARDS is on): its tab, the
// week's table, and on it the switch to the cards' table, named in
// data/settlement.json; the tab and the switch found by their marks (the
// switch's "Karty" is the tab's name too), each given the time the Karty
// take to come from the server the first time.
const ARENA = JSON.parse(fs.readFileSync(path.join(__dirname, `../data/${LANG === 'en' ? 'en/' : ''}settlement.json`), 'utf8')).arena;
const TABS = {
  '#/oboz/craft-table': [said('Kolejka ({count}/{limit})').replace(/\s*\(.*$/, '')],
  '#/osada/board': [said('Poszukiwani')],
  // The Skrzynia Konta's goods, under its gold.
  '#/oboz/skrzynia-konta': [said('Towary')],
  '#/osada/arena': [
    { name: ARENA.cards.texts.tab, tap: '[data-guide="arena-tab-cards"]', wait: 2000 },
    ARENA.texts.tabTable,
    { name: `${ARENA.texts.tabTable} › ${ARENA.cards.texts.boardCards}`, tap: '[data-guide="arena-board-cards"]', wait: 1000 },
  ],
  // "Poziom Profesji" with its list of professions (975 B), then the guilds.
  '#/spolecznosc/ranking': [said('Poziom Profesji'), GUILDS_TAB],
  '#/gildia': [MEMBERS.views.donations, MEMBERS.periods.all],
  // The Kowadło's "Sortuj:" at its fifth order, Ulepszenie, and the bag in
  // "Zaznacz do sprzedaży" with an item marked and the bar at the bottom
  // (19.11.2026; their words in data/buildings.json).
  '#/oboz/anvil': [{ name: 'Sortuj › Ulepszenie', tap: '.anvil-items .bag-sort .segmented-option:nth-child(5)' }],
  // The bag's Zioła and Spiżarnia tabs (24.11.2026), then "Zaznacz do
  // sprzedaży", left again for the items, whose cards SHEETS opens.
  '#/postac': [
    said('Zioła'),
    said('Spiżarnia'),
    { name: 'Zaznacz do sprzedaży', tap: '[data-guide="bag-pick"]' },
    { name: 'Zaznacz do sprzedaży › zaznaczony', tap: '.bag--sale .salvage-pick:not(.salvage-pick--favorite)' },
    { name: 'Zaznacz do sprzedaży › Anuluj', tap: '.bag--sale .sale-bar-head .button--small' },
    said('Przedmioty'),
  ],
  // Jubilerstwo's „Oprawianie”: the figure and „Z plecaka” under it
  // (20.11.2026).
  '#/profesje/jubilerstwo': [said('Oprawianie')],
};
// Sheets opened over a screen after its tabs, each from the one before (a
// tap on `tap`, a picture given to the file field `pick`, or `value` typed
// into the field `fill`), looked at
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
  // The sheet of the first item of „Z plecaka” in „Oprawianie” (the tab
  // TABS opens, 20.11.2026): the item of the longest name, with a gem in it.
  '#/profesje/jubilerstwo': [{ name: 'Oprawianie › z plecaka', tap: '.set-bag .item-list > li:first-child > .set-bag-row', ready: '.set-chosen', words: true }],
  // "Wyjmij złoto" in the Skrzynia Konta (19.11.2026): the chest's gold in
  // billions, all of it with "Wszystko" (the button's longest words), then
  // more than there is typed, with the line that says so.
  '#/oboz/skrzynia-konta': [
    { name: 'Wyjmij złoto', tap: '[data-chest-gold="take"]', ready: '.chest-gold-field', words: true },
    { name: 'Wszystko', tap: '#sheet .chest-gold-quick--all', ready: '.chest-gold-field' },
    { name: 'za dużo', fill: '#chest-gold-amount', value: '99999999999', ready: '.chest-gold-warn:not([hidden])', words: true },
  ],
  // The sheet Tygodnie from the week's line on the Walka screen (weeks.js),
  // its whole year left as the player left it.
  '#/walka': [{ name: 'Tygodnie', tap: '.week-line', ready: '.week-card--now', words: true }],
  // An attack on the World Boss on its tab of the Walka (Postrach Krainy,
  // 24.11.2026) with its fight played in the arena, the boss's HP of ten
  // digits on its card. The button under a short phone's bars is tapped as
  // a script would (`script`), and the fight is given the time the server
  // takes for it.
  '#/postrach': [{ name: 'walka', tap: '.world-boss-attack', script: true, ready: '.arena', timeout: 30000, words: true }],
  // A card of the starter deck in the Encyklopedia's "Karty": its sheet.
  '#/encyklopedia/cards': [{ name: 'karta', tap: '[data-guide="encyclopedia-card"]', ready: '.encyclopedia-card-sheet', words: true }],
  // "Parametry dodatkowe" (with the side stats, 1218), then, that sheet
  // closed first (`anew`), "Co nowego?" under the scroll in the top bar,
  // with its long address.
  '#/postac/statystyki': [
    { name: 'Parametry dodatkowe', tap: '.combat-extra', ready: `h2.sheet-title:text-is("${said('Parametry dodatkowe')}")`, words: true },
    // "Rozdaj ręcznie" with the points typed in beside each stat (20.11.2026).
    { name: 'Rozdaj ręcznie', anew: true, tap: `button:text-is("${said('Rozdaj ręcznie')}")`, ready: '.manual-list > .manual-stat:first-child .manual-input', words: true },
    { name: 'Co nowego?', anew: true, tap: '.topbar .news-button', ready: '.news-entries > .news-entry:first-child .news-text .news-link' },
  ],
  // The card of the bag's first item, the newest, of the longest name, with
  // "Wystaw na Targowisku" by "Sprzedaj" (27.11.2026), and the Targowisko's
  // price sheet it opens; the Ustawienia after them, that sheet closed.
  '#/postac': [
    { name: 'karta przedmiotu', tap: '.bag .bag-grid > li:first-child .slot--bag', ready: `button:text-is("${said('Wystaw na Targowisku')}")`, words: true },
    { name: 'Wystaw na Targowisku', tap: `#sheet button:text-is("${said('Wystaw na Targowisku')}")`, ready: '#market-start', words: true },
    { name: 'Ustawienia', anew: true, tap: '.topbar .settings-button', ready: `h2.sheet-title:text-is("${said('Ustawienia')}")`, words: true },
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
  // A character's name in a ranking's row (a player, 24.11.2026: beside a
  // title, the moderator's mark and a guild's tag the name was squeezed to
  // nothing and could not be tapped): whole, or cut with "…" only where it
  // alone is wider than its cell, and the row's parts inside the cell.
  for (const who of top.querySelectorAll('.ranking-who')) {
    if (!shown(who)) continue;
    if (who.scrollWidth > who.clientWidth + 1) found.push({ kind: 'spill', where: label(who), text: `${who.textContent.trim().slice(0, 40)} (${who.scrollWidth} px w ${who.clientWidth} px)` });
    const name = who.querySelector('.chat-name');
    if (!name) continue;
    const box = name.getBoundingClientRect();
    const room = who.getBoundingClientRect().right - parseFloat(getComputedStyle(who).paddingRight) - box.left;
    if (box.width + 1 < Math.min(name.scrollWidth, room)) {
      found.push({ kind: 'name', where: label(who), text: `${name.textContent.slice(0, 40)}: ${Math.round(box.width)} px z ${name.scrollWidth} px` });
    }
  }
  // A countdown's digits on one line (setTimer's .timer-run).
  for (const run of top.querySelectorAll('.timer-run')) {
    if (!shown(run)) continue;
    const lines = new Set([...run.querySelectorAll('.timer-digit')].map((digit) => Math.round(digit.getBoundingClientRect().top))).size;
    if (lines > 1) found.push({ kind: 'spill', where: label(run.parentElement), text: `licznik ${run.textContent} łamie się na ${lines} linijki` });
  }
  // A fight card's HP line (arena.js; 24.11.2026, the World Boss's HP of
  // eight digits on a phone): inside its card, on one line or on two, the
  // maximum on the second. The arena clips what reaches past it, so the
  // check above does not see it.
  for (const line of top.querySelectorAll('.unit-hp-line')) {
    if (!shown(line)) continue;
    const box = line.parentElement.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(line);
    const rects = [...range.getClientRects()];
    const lines = new Set(rects.map((rect) => Math.round(rect.top))).size;
    const out = rects.some((rect) => rect.left < box.left - 1 || rect.right > box.right + 1);
    if (out || lines > 2) found.push({ kind: 'spill', where: label(line.closest('.unit') ?? line), text: `HP „${line.textContent}” ${out ? 'wychodzi poza kartę' : `łamie się na ${lines} linijki`}` });
  }
  // A fight card's name (arena.js; the author, 1270, 26.11.2026: „Nazwa
  // stwora musi być zawsze w jednej linii a nie zawijać się”): on one line,
  // as small as it needs; one too wide even so is cut with "…" (listed for
  // a look, as the other cuts).
  for (const line of top.querySelectorAll('.unit-name-line')) {
    if (!shown(line)) continue;
    const range = document.createRange();
    range.selectNodeContents(line);
    const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
    const where = label(line.closest('.unit') ?? line);
    if (lines > 1) found.push({ kind: 'spill', where, text: `imię „${line.textContent}” łamie się na ${lines} linijki` });
    const box = line.parentElement;
    if (box.scrollWidth > box.clientWidth + 1) found.push({ kind: 'cut', where, text: line.textContent.slice(0, 40) });
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
  // Gold in billions in the account's Skrzynia Konta (19.11.2026).
  sql(`UPDATE users SET chest_gold = 9876543210 WHERE login = '${login}'`);
  // A "Co nowego?" entry with a long address, the newest (the author,
  // 14.11.2026: the testers' link went out of the frame).
  const longLink = 'https://play.google.com/apps/testing/com.insightrpg.app?sprawdzenie-ukladu-bardzo-dlugi-adres-bez-spacji=1';
  // Made anew on each run, so that it has the highest number (the game
  // shows the entries newest number first).
  sql(`DELETE FROM news WHERE title = 'Sprawdzenie układu'`);
  sql(`INSERT INTO news (title, body, published_at) VALUES ('Sprawdzenie układu', 'Dołącz przez link: ${longLink}\n- Albo tu: [Zostań testerem](${longLink})', ${Date.now()})`);
  // The Portale high up, and one entry for the Dziennik's row.
  sql(`UPDATE characters SET portals = '${JSON.stringify({ best: { gold: 100, wood: 99, materials: 95, parts: 12 } })}' WHERE name = '${name}'`);
  if ((await api('POST', '/api/portals/enter', { portal: 'materials' })) >= 400) throw new Error('Nie udało się wejść do Portalu.');
  // The Labirynt Systemu (the Sala prób's first tab) on its second level,
  // with blessings taken (one twice) and the choice of three waiting over
  // the map, and the Rdzeń open
  // with big numbers: a large, a medium and a small Artefakt absorbed, a gem,
  // and the Skrytka with more (where LABYRINTH is on: npm run dev).
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' }).format(new Date());
  const labyrinth = {
    day, level: 2, row: 1, room: 0, path: [0, 0], cleared: 1, over: null, team: [], hp: { me: 0.62 }, charLevel: 146,
    blessings: ['might', 'might', 'common-cause', 'blood-tithe', 'first-blood'],
    pending: { kind: 'blessing', from: 'elite', choices: ['shoulder', 'breath', 'keen-eye'] },
    gains: { xp: 9876543, gold: 987654, shards: 12345, artifacts: 3 }, seed: 'layout',
  };
  const artifact = (element, size, rarity, traits, ability, upgrade) => ({ element, size, rarity, traits, ability, upgrade, spent: 0 });
  const absorbed = [
    { ...artifact('lightning', 'large', 'divine', ['speed', 'crit'], 'rally', 10), id: 900001 },
    { ...artifact('nature', 'medium', 'mythic', ['hp', 'vitality'], null, 7), id: 900002 },
    { ...artifact('fire', 'small', 'legendary', ['main-stat'], null, 3), id: 900003 },
  ];
  sql(`UPDATE characters SET labyrinth = '${JSON.stringify(labyrinth)}', core = '${JSON.stringify({ open: true, shards: 123456, gem: 'diamond', absorbed })}' WHERE name = '${name}'`);
  for (const one of [artifact('sacred', 'large', 'epic', ['mana', 'wisdom'], 'opening-crit', 4), artifact('poison', 'medium', 'rare', ['lifesteal', 'perception'], null, 0), artifact('water', 'small', 'common', ['recovery'], null, 0)]) {
    sql(`INSERT INTO core_artifacts (character_id, data, created_at) SELECT id, '${JSON.stringify(one)}', 1 FROM characters WHERE name = '${name}'`);
  }
  // Talia Systemu (the Salon Gier's "Karty", where CARDS is on: npm run
  // dev): the starter deck taken and a match against Szczęsny's last tier,
  // its strongest cards, on the table. Without the cards the Encyklopedia
  // has no "Karty", so no card's sheet to open there. The residents' tables
  // (904 B: Jagna's, and Gościwit's with the longest forms of a name) open
  // by their address, under the busts, with that match waiting in the Salon.
  if ((await api('POST', '/api/cards/starter')) < 400) {
    if ((await api('POST', '/api/cards/match', { tier: 5, staked: false })) >= 400) throw new Error('Nie zaczęła się partia kart.');
  } else delete SHEETS['#/encyklopedia/cards'];
  // Punkty Sławy of this week in six digits (fame.js), their row made by a
  // sweep in the week the server counts.
  if ((await api('POST', '/api/portals/sweep', { portal: 'gold' })) >= 400) throw new Error('Nie udało się wyczyścić Portalu.');
  sql(`UPDATE fame_points SET points = 123456 WHERE character_id = (SELECT id FROM characters WHERE name = '${name}')`);
  // A guild of its own, with a long name, for the Gildia's tabs.
  if ((await api('POST', '/api/guild/found', { name: `Bractwo Żelaznych ${stamp}`, tag: `W${stamp.slice(-3).toUpperCase()}` })) >= 400) throw new Error('Nie powstała gildia.');
  // Fifteen more members, all in the Wojna's reserve: the author's guild had
  // as many, and one row of their busts made the page three screens wide on
  // a Galaxy S23 Ultra (11.11.2026). They are characters of an account of
  // their own, made in the database, so the session stays the first one's.
  const reserveLogin = `rezerwa${stamp}`;
  const reserveClasses = ['warrior', 'archer', 'mage', 'cleric', 'shadow'];
  sql(
    [
      `INSERT INTO users (login, password_hash, created_at) VALUES ('${reserveLogin}', 'x', 1)`,
      ...Array.from({ length: 15 }, (_, index) => {
        const member = `Rezerwowy${stamp}${index}`;
        return `INSERT INTO characters (user_id, role, name, name_key, class_id, appearance, level, class_level, position, hp, hp_at, created_at)
          SELECT u.id, 'aside', '${member}', '${member.toLowerCase()}', '${reserveClasses[index % 5]}', '${index % 2 ? 'male' : 'female'}', 120, 80, c.position, c.hp, c.hp_at, 1
          FROM users u, characters c WHERE u.login = '${reserveLogin}' AND c.name = '${name}'`;
      }),
      `INSERT INTO guild_members (character_id, guild_id, role, joined_at)
        SELECT c.id, m.guild_id, 'member', 2 FROM characters c, guild_members m
        WHERE c.user_id = (SELECT id FROM users WHERE login = '${reserveLogin}') AND m.character_id = (SELECT id FROM characters WHERE name = '${name}')`,
      // Each with a build under way, so the shortcut to help in the guild
      // shows on the Walka screen ("Gildia czeka na pomoc: 15", 20.11.2026)
      // and the Gildia tab's help card lists them all.
      `INSERT INTO buildings (character_id, building_id, level, started_at, ends_at)
        SELECT id, 'quarry', 3, ${Date.now() - 600000}, ${Date.now() + 18000000} FROM characters WHERE user_id = (SELECT id FROM users WHERE login = '${reserveLogin}')`,
    ].join('; '),
  );
  // One more member, a level higher, so that it stands first in the Ranking
  // postaci, and with this week's Punkty Sławy, with all a row can hold
  // (24.11.2026): the longest name, the longest title worn, the moderator's
  // mark of its own account and the guild's tag.
  const marked = `Świętomiłosława${stamp}`.slice(0, 20);
  const markedLogin = `moderator${stamp}`;
  const longestTitle = LANG === 'en' ? 'bald-explorer' : 'champion-slayer';
  sql(
    [
      `INSERT INTO users (login, password_hash, created_at, chat_moderator) VALUES ('${markedLogin}', 'x', 1, 1)`,
      `INSERT INTO characters (user_id, role, name, name_key, class_id, appearance, level, class_level, position, hp, hp_at, created_at, title, achievements, professions)
        SELECT u.id, 'player', '${marked}', '${marked.toLowerCase()}', 'archer', 'female', 147, 99, c.position, c.hp, c.hp_at, 1, '${longestTitle}', '${JSON.stringify({ [longestTitle]: 1 })}', '${JSON.stringify({ mining: { level: 150, xp: 0 } })}'
        FROM users u, characters c WHERE u.login = '${markedLogin}' AND c.name = '${name}'`,
      `INSERT INTO guild_members (character_id, guild_id, role, joined_at)
        SELECT c.id, m.guild_id, 'member', 2 FROM characters c, guild_members m WHERE c.name = '${marked}' AND m.character_id = (SELECT id FROM characters WHERE name = '${name}')`,
      `INSERT INTO fame_points (character_id, week, points)
        SELECT (SELECT id FROM characters WHERE name = '${marked}'), week, 123455 FROM fame_points WHERE character_id = (SELECT id FROM characters WHERE name = '${name}')`,
    ].join('; '),
  );
  // A Drużyna the character leads (screens/party.js; 25.11.2026, on the
  // report of gracz (poz. 120): what each member is doing and until when),
  // with two members of the longest names, each of an account of its own,
  // both busy, so that the Walka's line under „Z drużyną” names them with
  // what keeps them home: one on the party's trip to the place of the
  // longest name, its player away for 25 minutes; the other at Jubilerstwo
  // for 30 hours (its end with its day), its player playing another of its
  // characters now. Their class levels keep to the party's spread.
  const mates = [`Wszechsławowska${stamp}`.slice(0, 20), `Dobrogniewiczka${stamp}`.slice(0, 20)];
  const partyOwn = `(SELECT id FROM parties WHERE leader_id = (SELECT id FROM characters WHERE name = '${name}'))`;
  sql(
    [
      ...mates.flatMap((mate, index) => [
        `INSERT INTO users (login, password_hash, created_at, seen_at) VALUES ('druzyna${index}${stamp}', 'x', 1, ${index === 0 ? Date.now() - 25 * 60000 : Date.now()})`,
        `INSERT INTO characters (user_id, role, name, name_key, class_id, appearance, level, class_level, position, hp, hp_at, created_at)
          SELECT u.id, '${index === 0 ? 'player' : 'aside'}', '${mate}', '${mate.toLowerCase()}', '${index === 0 ? 'mage' : 'archer'}', 'female', 146, ${index === 0 ? 95 : 104}, c.position, c.hp, c.hp_at, 1
          FROM users u, characters c WHERE u.login = 'druzyna${index}${stamp}' AND c.name = '${name}'`,
      ]),
      `INSERT INTO parties (leader_id, created_at) SELECT id, 1 FROM characters WHERE name = '${name}'`,
      `INSERT INTO party_members (character_id, party_id, joined_at) SELECT id, ${partyOwn}, 1 FROM characters WHERE name = '${name}'`,
      ...mates.map((mate, index) => `INSERT INTO party_members (character_id, party_id, joined_at) SELECT id, ${partyOwn}, ${index + 2} FROM characters WHERE name = '${mate}'`),
      `INSERT INTO activities (character_id, kind, region_id, minutes, started_at, ends_at, seed, hp_at_start, options)
        SELECT id, 'hunt', 'frozen-caves', 240, ${Date.now() - 600000}, ${Date.now() + 12000000}, 'layout', hp, json_object('party', json_object('id', ${partyOwn}, 'trip', ${Date.now() - 600000}))
        FROM characters WHERE name = '${mates[0]}'`,
      `INSERT INTO activities (character_id, kind, region_id, minutes, started_at, ends_at, seed, hp_at_start, options)
        SELECT id, 'jewels', 'system-gem-works', 1800, ${Date.now()}, ${Date.now() + 30 * 3600000}, 'layout', hp, '{}' FROM characters WHERE name = '${mates[1]}'`,
    ].join('; '),
  );
  // The Arena's Karty (where CARDS is on): the first reserve's deck, the
  // starter cards at their top level, so it is a rival there; a match it
  // lost against the character's deck, among its deck's defences; and the
  // character's card rating in five digits, on this week's card table (its
  // Monday and month in Polish time, as src/engine/quests.js counts them).
  if (!SHEETS['#/encyklopedia/cards']) delete TABS['#/osada/arena'];
  else {
    const starter = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8')).starter.monsters;
    const rival = `(SELECT id FROM characters WHERE name = 'Rezerwowy${stamp}0')`;
    const own = `(SELECT id FROM characters WHERE name = '${name}')`;
    const sinceMonday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Warsaw', weekday: 'short' }).format(new Date()));
    const monday = new Date(`${day}T12:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() - sinceMonday);
    const [year, month] = day.split('-').map(Number);
    sql(
      [
        ...starter.map((monster) => `INSERT INTO cards (character_id, monster_id, copies, created_at) VALUES (${rival}, '${monster}', 5, 1)`),
        `INSERT INTO card_decks (character_id, cards, updated_at) VALUES (${rival}, '${JSON.stringify(starter)}', 1)`,
        `INSERT INTO card_arena_ratings (character_id, rating, season, week) VALUES (${own}, 12345, ${year * 12 + month - 1}, '${monday.toISOString().slice(0, 10)}')`,
        `INSERT INTO card_arena_results (attacker_id, defender_id, created_at, result, rounds, attacker_change, defender_change, attacker_rating, defender_rating)
          VALUES (${rival}, ${own}, ${Date.now()}, 'loss', 12, -16, 8, 9984, 12345)`,
      ].join('; '),
    );
  }
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
  // A build under way, for its countdowns (the camp's map, the top bar, the
  // construction panel): in 0.3.92–0.3.93 the one on the map broke into
  // three lines in its narrow frame (0.3.94). The Kamieniołom to level 2.
  sql(`INSERT OR REPLACE INTO buildings (character_id, building_id, level, started_at, ends_at) SELECT id, 'quarry', 2, ${Date.now() - 600000}, ${Date.now() + 16932000} FROM characters WHERE name = '${name}'`);
  // Three amulets of one name and big numbers in the bag, one of them put on
  // the companion, for "Załóż z plecaka" and its comparison.
  for (const affixes of [[{ stat: 'strength', value: 9876 }, { stat: 'vitality', value: 8765 }], [{ stat: 'dexterity', value: 7654 }, { stat: 'perception', value: 6543 }], [{ stat: 'endurance', value: 5432 }]]) {
    const data = JSON.stringify({ base: 'amulet', slot: 'amulet', level: 146, rarity: 'legendary', affixes, implicit: { stat: 'will', value: 4321 } });
    sql(`INSERT INTO items (character_id, slot, data, created_at) SELECT id, NULL, '${data}', 1 FROM characters WHERE name = '${name}'`);
  }
  const hired = (await page.evaluate(() => fetch('/api/settlement').then((response) => response.json()))).settlement?.companions?.hired?.[0];
  if (!hired?.wearable?.length || (await api('POST', '/api/settlement/equip', { companionId: hired.id, itemId: hired.wearable[0] })) >= 400) throw new Error('Towarzysz nie założył amuletu.');
  // A sword at +10 with three of the Zaklinaczka's stars and big numbers, and
  // her relation at Zaufany, for her "Gwiazdki" (ascension, 1180 B–1184 A),
  // the name with its stars and the tile's "+10★3". The other residents'
  // relations for their cards' bars (20.11.2026): Szczęsny's halfway to Stały
  // klient, Jagna's just below Zaufany with the longest line of what it
  // gives, Gościwit's at the top in seven digits, Zbylut's just below
  // Przyjaciel and the sołtys's below Znajomy.
  const starred = JSON.stringify({ base: 'karabela', slot: 'weapon', level: 146, rarity: 'legendary', upgrade: 10, stars: 3, damage: { min: 98765, max: 123456 }, affixes: [{ id: 'bear', kind: 'prefix', stat: 'strength', value: 9876 }] });
  sql(`INSERT INTO items (character_id, slot, data, created_at) SELECT id, NULL, '${starred}', 1 FROM characters WHERE name = '${name}'`);
  // Jubilerstwo's „Oprawianie” (20.11.2026): the longest name an item gets
  // („Czarnoksięski Ząb Smoka Wawelskiego Wielkiego Kleszcza +10”, its stars
  // after it), divine with a Rubin in it, the first in „Z plecaka”, and the
  // gems by the hundred thousand at the profession's last level, which
  // shows them all.
  const longest = JSON.stringify({
    base: 'wawel-dragon-tooth',
    slot: 'offhand',
    level: 146,
    rarity: 'divine',
    upgrade: 10,
    stars: 3,
    gem: 'ruby',
    implicit: { stat: 'dexterity', value: 123456 },
    affixes: [
      { id: 'bear', monster: 'black-grimoire', kind: 'prefix', stat: 'dexterity', value: 98765 },
      { id: 'aurochs', monster: 'tick', kind: 'suffix', stat: 'strength', value: 87654 },
    ],
  });
  sql(`INSERT INTO items (character_id, slot, data, created_at) SELECT id, NULL, '${longest}', 1 FROM characters WHERE name = '${name}'`);
  const gems = { quartz: 123456, agate: 234567, amethyst: 345678, emerald: 456789, sapphire: 567890, ruby: 678901, diamond: 987654 };
  sql(`UPDATE characters SET minerals = '${JSON.stringify(gems)}', professions = json_set(COALESCE(professions, '{}'), '$.jewelcrafting', json('{"level":200,"xp":0}')) WHERE name = '${name}'`);
  // The bag's six tabs with big numbers (24.11.2026): the herbs in their
  // own tab, with room for them in the Magazyn at its last level, and the
  // Spiżarnia's dishes over the fish and crops, each group under its
  // heading.
  sql(`INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) SELECT id, 'loot-shed', 10, 0, 1 FROM characters WHERE name = '${name}'`);
  const herbs = { comfrey: 834, mugwort: 222, nettle: 129, plantain: 49 };
  const pantry = { roach: 12345, perch: 567, turnip: 23456, 'baked-turnip': 3, 'pea-soup': 2, zurek: 123 };
  sql(`UPDATE characters SET herbs = '${JSON.stringify(herbs)}', pantry = '${JSON.stringify(pantry)}' WHERE name = '${name}'`);
  const relations = { enchantress: 760, gamehost: 180, herbalist: 699, merchant: 1234567, innkeeper: 1399, headman: 30 };
  const setRelations = Object.entries(relations)
    .map(([resident, points]) => `'$.${resident}', ${points}`)
    .join(', ');
  sql(
    `UPDATE characters SET settlement = json_set(COALESCE(settlement, '{}'), '$.relations', json_set(COALESCE(json_extract(settlement, '$.relations'), '{}'), ${setRelations})) WHERE name = '${name}'`,
  );
  // The World Boss of its band on its tab of the Walka (world-boss.js;
  // 1222–1226 A): Kamienna Baba of the levels 126–150, with HP in ten digits and two
  // attacks left today; the best ten of the boss, the member of the longest
  // name first, then the guild's reserve, and the character 12th with nine
  // digits of damage; the boss of the period before fallen by its blow, its
  // chest waiting with the last blow's part and the title of the first
  // place, which the member of the longest name wears in the Ranking too.
  // The periods' keys as the server has them (worldBossPeriod: weeks, then
  // 3 days from 27.11.2026).
  const engine = await import('../src/engine/index.js');
  const { loadData } = await import('./validate-data.mjs');
  const bossContent = engine.buildContent(loadData());
  const period = engine.worldBossPeriod(Date.now(), bossContent);
  const weekOf = (back) => (back === 0 ? period : engine.worldBossPeriod(period.startsAt - 1, bossContent)).key;
  const now = Date.now();
  const own = `(SELECT id FROM characters WHERE name = '${name}')`;
  const boss = (back) => `(SELECT id FROM world_bosses WHERE week = '${weekOf(back)}' AND region = 'pine-dunes')`;
  // The band's bosses of these two weeks made anew on each run, with whom
  // they had (the local D1 keeps those of the run before).
  const bands = `SELECT id FROM world_bosses WHERE region = 'pine-dunes' AND week IN ('${weekOf(0)}', '${weekOf(1)}')`;
  sql(
    [
      `DELETE FROM world_boss_titles WHERE boss_id IN (${bands})`,
      `DELETE FROM world_boss_fighters WHERE boss_id IN (${bands})`,
      `DELETE FROM world_bosses WHERE id IN (${bands})`,
      `INSERT INTO world_bosses (week, region, boss, players, level, max_hp, hp, created_at) VALUES ('${weekOf(0)}', 'pine-dunes', 'wb-stone-baba', 12345, 141, 9876543210, 4567890123, ${now})`,
      `INSERT INTO world_bosses (week, region, boss, players, level, max_hp, hp, created_at, fallen_at, fallen_by) SELECT '${weekOf(1)}', 'pine-dunes', 'wb-stone-baba', 12345, 141, 9876543210, 0, ${now}, ${now - 3 * 86400000}, id FROM characters WHERE name = '${name}'`,
      `INSERT INTO world_boss_fighters (week, character_id, boss_id, damage, hits, day, day_hits, created_at) SELECT '${weekOf(0)}', id, ${boss(0)}, 987654321, 21, '${day}', 1, ${now} FROM characters WHERE name = '${marked}'`,
      `INSERT INTO world_boss_fighters (week, character_id, boss_id, damage, hits, day, day_hits, created_at)
        SELECT '${weekOf(0)}', id, ${boss(0)}, 900000000 - id, 18, '${day}', 3, ${now} FROM characters WHERE name LIKE 'Rezerwowy${stamp}%'`,
      `INSERT INTO world_boss_fighters (week, character_id, boss_id, damage, hits, day, day_hits, created_at) SELECT '${weekOf(0)}', ${own}, ${boss(0)}, 123456789, 13, '${day}', 1, ${now}`,
      `INSERT INTO world_boss_fighters (week, character_id, boss_id, damage, hits, day, day_hits, created_at) SELECT '${weekOf(1)}', ${own}, ${boss(1)}, 1987654321, 21, '${weekOf(1)}', 3, ${now}`,
      `INSERT INTO world_boss_titles (boss_id, character_id, place, until, created_at) SELECT ${boss(1)}, ${own}, 1, ${now + 4 * 86400000}, ${now}`,
      `INSERT INTO world_boss_titles (boss_id, character_id, place, until, created_at) SELECT ${boss(1)}, id, 2, ${now + 4 * 86400000}, ${now} FROM characters WHERE name = '${marked}'`,
    ].join('; '),
  );
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
  const names = [name, ...otherNames, marked, ...mates, login, other, `Bractwo Żelaznych ${stamp}`, ...(hired?.name ? [hired.name] : [])];

  let problems = 0;
  for (const size of SIZES) {
    // The World Boss's attacks of today as seeded (two left), whatever the
    // size before took with its fight (SHEETS, '#/postrach').
    sql(`UPDATE world_boss_fighters SET day = '${day}', day_hits = 1 WHERE week = '${weekOf(0)}' AND character_id = ${own}`);
    const options ={ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1, isMobile: size.mobile, hasTouch: size.mobile, locale: LOCALE, timezoneId: 'Europe/Warsaw' };
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
        // is named and skipped. A tab given as { name, tap } is found by
        // `tap`, a selector (the Arena's switch to the cards' table).
        const named = typeof tab === 'string' ? tab : tab.name;
        const button = typeof tab === 'string' ? view.locator('button.segmented-option, [role="tab"], button.war-button', { hasText: tab }).first() : view.locator(tab.tap).first();
        if ((await button.count()) === 0) {
          console.log(`  – ${size.name} ${screen}: brak zakładki „${named}”`);
          continue;
        }
        // A button in the screen itself (the Ranking członków's "Wpłaty"
        // low on the Gildia) may stand under the bars
        // fixed over a short phone's page wherever the browser scrolls it:
        // it is tapped as a script would, when a finger cannot reach it.
        if (await button.evaluate((element) => element.matches('[role="tab"], .segmented-option'))) {
          await button.click({ timeout: 3000 }).catch(() => button.evaluate((element) => element.click()));
        } else await button.evaluate((element) => element.click());
        await view.waitForTimeout(typeof tab === 'string' ? 500 : (tab.wait ?? 500));
        await check(`${screen} › ${named}`, null, TRANSLATED.has(screen));
      }
      if (FOLDS[screen]) {
        // Each one opened leaves the selector, so always the first closed one;
        // one under the bars fixed over a short phone's page is tapped as a
        // script would, as the tabs are.
        for (let left = await view.locator(FOLDS[screen]).count(); left > 0; left -= 1) {
          const fold = view.locator(FOLDS[screen]).first();
          await fold.click({ timeout: 3000 }).catch(() => fold.evaluate((element) => element.click()));
        }
        await view.waitForTimeout(500);
        await check(`${screen} › otwarte`, null, TRANSLATED.has(screen));
      }
      // A sheet that does not open or close is a problem; the steps after it
      // are left, and the page loaded anew.
      const trail = [screen];
      try {
        // A sheet the game opened by itself (the series of days' reward,
        // the Szczodre Gody calendar) closed first, as a player would: it
        // covers the buttons that open the sheets checked here.
        if (SHEETS[screen]) {
          for (let tries = 0; tries < 3 && (await view.locator('#sheet[open]').count()) > 0; tries += 1) {
            await view.keyboard.press('Escape');
            await view.waitForTimeout(400);
          }
        }
        for (const step of SHEETS[screen] ?? []) {
          trail.push(step.name);
          if (step.anew) {
            await view.locator('#sheet .sheet-close').click({ timeout: 5000 });
            await view.locator('#sheet').waitFor({ state: 'hidden', timeout: 5000 });
          }
          if (step.pick) await view.locator(step.pick).setInputFiles(picture, { timeout: 5000 });
          else if (step.fill) await view.locator(step.fill).fill(step.value, { timeout: 5000 });
          else if (step.script) {
            const button = view.locator(step.tap).first();
            await button.click({ timeout: 3000 }).catch(() => button.evaluate((element) => element.click()));
          } else await view.locator(step.tap).click({ timeout: 5000 });
          await view.locator(`#sheet[open] ${step.ready}`).waitFor({ timeout: step.timeout ?? 5000 });
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

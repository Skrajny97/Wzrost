// The English beta (490–497 A) on the page: the language it shows and the
// English of its texts.
//
// The page offers English only where the server does (/api/health
// `english`: everywhere from version 0.1.97); where it does not, the page
// shows Polish and no choice. The language comes first from the phone, Polish for a
// Polish phone and English for any other, then from the PL | EN switch on
// the login screen and in the Ustawienia, or the "Język gry" of the
// registration form. The account keeps it (users.language), so a signed-in
// page takes the account's, and one picked on the login screen goes to the
// account at the sign-in. Each request tells the server the language
// (X-Lang, api.js), so the game's data, the errors and what the server
// writes come in it too (src/server/i18n.js). A switch loads the page
// again, so every screen is drawn anew in the language chosen; the
// registration form's choice turns only the login screen, in place, so
// what was typed stays.
//
// t() gives a Polish text of the page in the language shown: its English
// (data/en/strings.json, under the Polish text), or the Polish itself
// while it has none. {name} is filled in from `vars`, in both languages.

import { h } from './dom.js';

export const LANGUAGES = ['pl', 'en'];
// The language chosen on this phone, and whether the server offered
// English the last time it was asked (localStorage).
const LANGUAGE_KEY = 'insight.language';
const ENGLISH_KEY = 'insight.english';
// A language picked on the login screen, for the account to take at the
// sign-in (sessionStorage).
const PICKED_KEY = 'insight.language-picked';

// `storage`: "localStorage" or "sessionStorage", looked up only here, so a
// page without them (blocked storage, the tests' modules in Node) goes on.
function read(storage, key) {
  try {
    return globalThis[storage].getItem(key);
  } catch {
    return null;
  }
}

function write(storage, key, value) {
  try {
    if (value === null) globalThis[storage].removeItem(key);
    else globalThis[storage].setItem(key, value);
  } catch {
    // Without storage the choice lasts until the page is closed.
  }
}

// The phone's own language: Polish for a Polish phone, English for any other.
function phoneLanguage() {
  const first = String(navigator.languages?.[0] ?? navigator.language ?? '').toLowerCase();
  return first === '' || first === 'pl' || first.startsWith('pl-') ? 'pl' : 'en';
}

const chosenOrPhone = () => {
  const chosen = read('localStorage', LANGUAGE_KEY);
  return LANGUAGES.includes(chosen) ? chosen : phoneLanguage();
};

let offered = read('localStorage', ENGLISH_KEY) === 'on';
let lang = offered ? chosenOrPhone() : 'pl';
let strings = {};
let stringsOf = 'pl';

export const language = () => lang;
export const englishOffered = () => offered;

const fill = (template, vars) => template.replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole));

const englishOf = (text) => {
  if (lang === 'pl' || !Object.hasOwn(strings, text)) return null;
  const found = strings[text];
  return typeof found === 'string' && found !== '' ? found : null;
};

// A Polish text of the page in the language shown, {name} filled in.
export function t(text, vars = null) {
  const template = englishOf(text) ?? text;
  return vars ? fill(template, vars) : template;
}

// The English of a Polish noun after a number (format.js, plural):
// [one, other], or null where the page is Polish or the noun has none.
export function englishForms(one, few, many) {
  const found = englishOf(`${one}|${few}|${many}`);
  if (found === null) return null;
  const [single, other = single] = found.split('|');
  return [single, other];
}

// The English of the page's texts, from the server, for a page in English.
async function loadStrings() {
  if (lang === 'pl' || stringsOf === lang) return;
  try {
    const response = await fetch('/api/strings', { headers: { Accept: 'application/json', 'X-Lang': lang }, credentials: 'same-origin' });
    const data = response.ok ? await response.json() : null;
    strings = data?.strings ?? {};
    stringsOf = lang;
  } catch {
    // Without a connection the texts stay Polish until the page loads again.
  }
}

// The texts written in index.html, marked with data-i18n (its text) and
// data-i18n-attr (the attributes named there), in the language shown; their
// Polish is kept the first time.
const originals = new WeakMap();
export function translatePage(root = document) {
  document.documentElement.lang = lang;
  // Links to a page that has its own English (data-href-en), as the
  // terms and the privacy policy (0.2.3).
  for (const link of root.querySelectorAll('a[data-href-en]')) {
    link.dataset.hrefPl ??= link.getAttribute('href');
    link.setAttribute('href', lang === 'en' ? link.dataset.hrefEn : link.dataset.hrefPl);
  }
  // The app's description when installed, in the language shown (0.2.2).
  document.querySelector('link[rel="manifest"]')?.setAttribute('href', lang === 'en' ? '/manifest-en.webmanifest' : '/manifest.webmanifest');
  for (const element of root.querySelectorAll('[data-i18n], [data-i18n-attr]')) {
    if (!originals.has(element)) {
      const names = (element.dataset.i18nAttr ?? '').split(/\s+/).filter(Boolean);
      originals.set(element, {
        text: element.hasAttribute('data-i18n') ? element.textContent.trim() : null,
        attributes: names.map((name) => [name, element.getAttribute(name) ?? '']),
      });
    }
    const { text, attributes } = originals.get(element);
    if (text !== null) element.textContent = t(text);
    for (const [name, value] of attributes) element.setAttribute(name, t(value));
  }
}

// The start of the page: whether the server offers English (`health`, its
// /api/health, or null without an answer: then as the last time), the
// language, and its texts. Never fails.
export async function prepareLanguage(health) {
  if (health) {
    offered = health.english === true;
    write('localStorage', ENGLISH_KEY, offered ? 'on' : null);
  }
  lang = offered ? chosenOrPhone() : 'pl';
  await loadStrings();
  translatePage();
}

async function sendLanguage(next) {
  const response = await fetch('/api/me/language', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Lang': next },
    credentials: 'same-origin',
    body: JSON.stringify({ language: next }),
  });
  if (!response.ok) throw new Error(String(response.status));
}

// The account signed in (`user` from /api/me or the sign-in): a language
// picked on the login screen goes to the account; otherwise the page takes
// the account's. True when the page's language changed, so what was loaded
// in the other one is loaded again.
export async function followAccount(user) {
  if (!offered || !LANGUAGES.includes(user?.language)) return false;
  if (read('sessionStorage', PICKED_KEY)) {
    write('sessionStorage', PICKED_KEY, null);
    if (user.language !== lang) {
      try {
        await sendLanguage(lang);
        user.language = lang;
      } catch {
        // The next sign-in tries again.
        write('sessionStorage', PICKED_KEY, '1');
      }
    }
    return false;
  }
  if (user.language === lang) return false;
  lang = user.language;
  write('localStorage', LANGUAGE_KEY, lang);
  await loadStrings();
  translatePage();
  return true;
}

// A language picked in the registration form ("Język gry", app.js): the
// page turns to it at once, without loading again, so what was typed stays.
// The account is made in it; signed in another way instead (Google, the
// login form), the account takes it at the sign-in (followAccount). True
// when the language changed.
export async function pickLanguage(next) {
  if (!offered || next === lang || !LANGUAGES.includes(next)) return false;
  lang = next;
  write('localStorage', LANGUAGE_KEY, next);
  write('sessionStorage', PICKED_KEY, '1');
  await loadStrings();
  translatePage();
  return true;
}

// The languages by their own names, for the registration form.
export const LANGUAGE_NAMES = { pl: 'Polski', en: 'English' };

// The PL | EN switch: the language for this phone and, signed in, for the
// account; the page loads again in it. Picked before the sign-in, the
// account takes it at the sign-in (followAccount).
async function choose(next, signedIn) {
  if (!offered || next === lang || !LANGUAGES.includes(next)) return;
  write('localStorage', LANGUAGE_KEY, next);
  if (!signedIn) write('sessionStorage', PICKED_KEY, '1');
  else {
    try {
      await sendLanguage(next);
    } catch {
      write('sessionStorage', PICKED_KEY, '1');
    }
  }
  location.reload();
}

// The switch itself, two buttons, for the login screen and the Ustawienia;
// null where English is not offered.
export function languageSwitch({ labelledBy = null, signedIn = false } = {}) {
  if (!offered) return null;
  const buttons = LANGUAGES.map((id) =>
    h('button', {
      type: 'button',
      class: 'segmented-option',
      lang: id,
      'aria-pressed': String(id === lang),
      text: id.toUpperCase(),
      onClick: (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        choose(id, signedIn).finally(() => {
          button.disabled = false;
        });
      },
    }),
  );
  return h('div', { class: 'segmented segmented--language', role: 'group', ...(labelledBy ? { 'aria-labelledby': labelledBy } : { 'aria-label': t('Język') }) }, buttons);
}

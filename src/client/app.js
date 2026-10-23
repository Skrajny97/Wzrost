// Game page: checks the session on start, then shows the login screen, the
// character creation or the game. Screens are chosen by the address after #,
// so the static file server needs no routes. All visible texts are in Polish.

import { ApiError, request } from './api.js';
import { $, $$, clear, h } from './dom.js';
import { buildTopbar, updateNav, updateTopbar } from './layout.js';
import { mountCharacter } from './screens/character.js';
import { mountCombat } from './screens/combat.js';
import { renderCreate } from './screens/create.js';
import { mountJournal } from './screens/journal.js';
import { lockedScreen } from './screens/locked.js';
import { mountReport } from './screens/report.js';
import { mountStats } from './screens/stats.js';
import { call, handleSessionLost, onCharacterChange, serverNow, state } from './state.js';
import { closeSheet, initSheet, openSheet, toast } from './ui.js';

const views = {
  loading: $('#view-loading'),
  auth: $('#view-auth'),
  create: $('#view-create'),
  game: $('#view-game'),
};

const ROUTES = [
  { pattern: /^#\/walka$/, nav: 'main', tab: 'walka', mount: mountCombat },
  { pattern: /^#\/postac$/, nav: 'character', tab: 'equipment', mount: mountCharacter },
  { pattern: /^#\/postac\/statystyki$/, nav: 'character', tab: 'stats', mount: mountStats },
  { pattern: /^#\/postac\/umiejetnosci$/, nav: 'character', tab: 'skills', mount: lockedScreen('skills', 'Umiejętności') },
  { pattern: /^#\/postac\/rdzen$/, nav: 'character', tab: 'core', mount: lockedScreen('core', 'Rdzeń') },
  { pattern: /^#\/profesje$/, nav: 'main', tab: 'profesje', mount: lockedScreen('professions', 'Profesje') },
  { pattern: /^#\/osada$/, nav: 'main', tab: 'osada', mount: lockedScreen('settlement', 'Osada') },
  { pattern: /^#\/dziennik(?:\/(?<tab>system))?$/, nav: 'main', tab: 'dziennik', mount: mountJournal },
  { pattern: /^#\/raport\/(?<id>\d+)$/, nav: 'main', tab: null, mount: mountReport },
];
const HOME = '#/walka';

let current = null; // { route, screen }
let lastMainHash = HOME;
let lastMainTab = 'walka';
let ticker = null;

function show(name) {
  for (const [key, view] of Object.entries(views)) view.hidden = key !== name;
}

async function start() {
  show('loading');
  $('#loading-text').textContent = 'Nawiązywanie połączenia…';
  $('#retry-button').hidden = true;
  try {
    const { user } = await request('GET', '/api/me');
    state.user = user;
    await enterGame();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      enterAuth();
      return;
    }
    $('#loading-text').textContent = error.message;
    $('#retry-button').hidden = false;
  }
}

async function enterGame() {
  state.content ??= await request('GET', '/api/content');
  try {
    await call('GET', '/api/character');
  } catch (error) {
    if (error instanceof ApiError && error.code === 'no_character') {
      show('create');
      renderCreate($('#create-screen'), () => {
        // A new character starts on the Walka tab.
        history.replaceState(null, '', HOME);
        openGame();
      });
      return;
    }
    throw error;
  }
  openGame();
}

function openGame() {
  show('game');
  buildTopbar(openSettings);
  route();
  clearInterval(ticker);
  ticker = setInterval(() => {
    const now = serverNow();
    updateTopbar(now);
    current?.screen.tick?.(now);
  }, 1000);
}

function route() {
  if (!state.character) return;
  const hash = location.hash || HOME;
  const found = ROUTES.map((candidate) => ({ candidate, match: candidate.pattern.exec(hash) })).find(({ match }) => match);
  if (!found) {
    location.replace(HOME);
    return;
  }
  const { candidate, match } = found;
  current?.screen.unmount?.();
  closeSheet();

  if (candidate.nav === 'main') {
    lastMainHash = hash;
    if (candidate.tab) lastMainTab = candidate.tab;
  }
  // Every screen gets its own element, so a late answer meant for the
  // previous screen can only draw into a detached one.
  const container = h('div', { class: 'screen-body' });
  clear($('#screen')).append(container);
  window.scrollTo(0, 0);
  const screen = candidate.mount(container, { params: match.groups ?? {}, navigate }) ?? {};
  current = { route: candidate, screen };
  renderNav();
  $('.page-title', container)?.focus({ preventScroll: true });
}

function renderNav() {
  if (!current) return;
  const { route: active } = current;
  updateNav({
    kind: active.nav,
    active: active.nav === 'main' ? active.tab ?? lastMainTab : active.tab,
    // "Powrót": from stats, skills or the Core to the equipment, from there to the main menu.
    onBack: () => navigate(active.tab === 'equipment' ? lastMainHash : '#/postac'),
  });
}

function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

onCharacterChange(() => {
  if (views.game.hidden || !current) return;
  updateTopbar();
  renderNav();
  current.screen.update?.();
});

// Coming back to the page (for example after the hunt timer ran out) refreshes
// the character, so timers and HP follow the server again.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.character && !views.game.hidden) {
    call('GET', '/api/character').catch((error) => toast(error.message));
  }
});

window.addEventListener('hashchange', route);

function openSettings() {
  const version = h('dd', { text: '…' });
  openSheet(
    h('h2', { class: 'sheet-title', text: 'Ustawienia' }),
    h(
      'dl',
      { class: 'status-list' },
      h('div', { class: 'status-row' }, h('dt', { text: 'Konto' }), h('dd', { text: state.user.login })),
      h('div', { class: 'status-row' }, h('dt', { text: 'Postać' }), h('dd', { text: state.character.name })),
      h('div', { class: 'status-row' }, h('dt', { text: 'Wersja gry' }), version),
    ),
    h('button', { type: 'button', class: 'button button--world', onClick: logout, text: 'Wyloguj się' }),
  );
  request('GET', '/api/health')
    .then((health) => {
      version.textContent = health.version;
    })
    .catch(() => {
      version.textContent = 'brak połączenia';
    });
}

async function logout(event) {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await request('POST', '/api/auth/logout');
    leaveGame();
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
}

function leaveGame() {
  closeSheet();
  clearInterval(ticker);
  current?.screen.unmount?.();
  current = null;
  state.user = null;
  state.character = null;
  enterAuth();
}

handleSessionLost(() => {
  if (state.user) leaveGame();
});

// Login and registration

function enterAuth() {
  for (const form of [$('#login-form'), $('#register-form')]) {
    form.reset();
    $('.form-error', form).hidden = true;
  }
  for (const toggle of $$('.password-toggle')) setPasswordVisible(toggle, false);
  setAuthMode('login');
  show('auth');
  request('GET', '/api/health')
    .then((health) => {
      for (const element of $$('[data-version]')) element.textContent = health.version;
    })
    .catch(() => {});
}

function setAuthMode(mode) {
  for (const button of $$('[data-auth-mode]')) {
    button.setAttribute('aria-pressed', String(button.dataset.authMode === mode));
  }
  $('#login-form').hidden = mode !== 'login';
  $('#register-form').hidden = mode !== 'register';
}

function setPasswordVisible(toggle, visible) {
  const input = document.getElementById(toggle.getAttribute('aria-controls'));
  input.type = visible ? 'text' : 'password';
  toggle.textContent = visible ? 'Ukryj' : 'Pokaż';
  toggle.setAttribute('aria-label', visible ? 'Ukryj hasło' : 'Pokaż hasło');
}

function bindForm(form, submit) {
  const errorBox = $('.form-error', form);
  const button = $('button[type="submit"]', form);
  const idleLabel = button.textContent;
  form.addEventListener('input', () => {
    errorBox.hidden = true;
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    button.disabled = true;
    button.textContent = button.dataset.busyLabel;
    try {
      const { user } = await submit(Object.fromEntries(new FormData(form)));
      form.reset();
      state.user = user;
      await enterGame();
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = idleLabel;
    }
  });
}

for (const button of $$('[data-auth-mode]')) {
  button.addEventListener('click', () => setAuthMode(button.dataset.authMode));
}

for (const toggle of $$('.password-toggle')) {
  toggle.addEventListener('click', () => {
    const input = document.getElementById(toggle.getAttribute('aria-controls'));
    setPasswordVisible(toggle, input.type === 'password');
  });
}

bindForm($('#login-form'), (data) => request('POST', '/api/auth/login', data));
bindForm($('#register-form'), (data) => request('POST', '/api/auth/register', data));

$('#retry-button').addEventListener('click', start);

initSheet();
start();

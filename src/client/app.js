// Game page: checks the session on start, then shows the login screen, the
// character creation or the game. Screens are chosen by the address after #,
// so the static file server needs no routes. All visible texts are in Polish.

import { ApiError, request } from './api.js';
import { $, $$, clear, h } from './dom.js';
import { preloadPortraits } from './art.js';
import { installBlock, installButton } from './install.js';
import { buildTopbar, showWallet, updateNav, updateTopbar } from './layout.js';
import { mountCamp } from './screens/camp.js';
import { mountCharacter } from './screens/character.js';
import { mountCombat } from './screens/combat.js';
import { renderCreate } from './screens/create.js';
import { mountJournal } from './screens/journal.js';
import { lockedScreen } from './screens/locked.js';
import { mountReport } from './screens/report.js';
import { mountStats } from './screens/stats.js';
import { musicVolume, setMusicConfig, setMusicPlace, setMusicVolume, startMusic } from './music.js';
import { effectsVolume, playSound, setEffectsVolume, setRecordings, unlockSound } from './sound.js';
import { call, handleSessionLost, loadContent, onCharacterChange, serverNow, setTestMode, state, testModeOn } from './state.js';
import { closeSheet, confirmAction, initSheet, openSheet, toast, withButton } from './ui.js';

const views = {
  loading: $('#view-loading'),
  auth: $('#view-auth'),
  create: $('#view-create'),
  game: $('#view-game'),
};

const ROUTES = [
  // Walka, a region, an inner region of it.
  { pattern: /^#\/walka(?:\/(?<region>[a-z0-9-]+)(?:\/(?<area>[a-z0-9-]+))?)?$/, nav: 'main', tab: 'walka', mount: mountCombat },
  { pattern: /^#\/postac$/, nav: 'character', tab: 'equipment', mount: mountCharacter },
  { pattern: /^#\/postac\/statystyki$/, nav: 'character', tab: 'stats', mount: mountStats },
  { pattern: /^#\/postac\/umiejetnosci$/, nav: 'character', tab: 'skills', mount: lockedScreen('skills', 'Umiejętności') },
  { pattern: /^#\/postac\/rdzen$/, nav: 'character', tab: 'core', mount: lockedScreen('core', 'Rdzeń') },
  { pattern: /^#\/profesje$/, nav: 'main', tab: 'profesje', mount: lockedScreen('professions', 'Profesje') },
  { pattern: /^#\/osada$/, nav: 'main', tab: 'osada', mount: lockedScreen('settlement', 'Osada') },
  { pattern: /^#\/dziennik(?:\/(?<tab>system))?$/, nav: 'main', tab: 'dziennik', mount: mountJournal },
  { pattern: /^#\/raport\/(?<id>\d+)$/, nav: 'main', tab: null, mount: mountReport },
  // The camp opens from the top bar: the board, or one building.
  { pattern: /^#\/oboz(?:\/(?<building>[a-z0-9-]+))?$/, nav: 'main', tab: null, mount: mountCamp },
];
const HOME = '#/walka';

let current = null; // { route, screen }
let lastMainHash = HOME;
let lastMainTab = 'walka';
let lastTabHash = HOME; // the last tab of the main menu, where a report's "Powrót" leads
let ticker = null;

function show(name) {
  for (const [key, view] of Object.entries(views)) view.hidden = key !== name;
}

async function start() {
  // The music plays from the start screen on, after the first touch, and
  // the recorded fight sounds load then too.
  loadContent()
    .then((content) => {
      setMusicConfig(content.music);
      setRecordings(content.sounds);
    })
    .catch(() => {});
  preloadPortraits();
  // The version this page runs, to notice a newer one later.
  request('GET', '/api/health')
    .then((health) => {
      loadedVersion ??= health.version;
    })
    .catch(() => {});
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
  await loadContent();
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
    watchConstruction(now);
  }, 1000);
}

// When a camp upgrade ends, the character is fetched again (new levels,
// faster rest, a bigger bag) and a short message says so.
let campRetryAt = 0;
function watchConstruction(now) {
  const building = state.character?.camp.construction;
  if (!building || now < building.endsAt + 1000 || now < campRetryAt) return;
  // Without a connection it tries again every 30 seconds.
  campRetryAt = now + 30000;
  call('GET', '/api/character')
    .then(() => {
      toast(`${building.name}: poziom ${building.level} gotowy.`);
      playSound('done');
    })
    .catch((error) => toast(error.message));
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
  showWallet(false);

  if (candidate.nav === 'main') {
    lastMainHash = hash;
    if (candidate.tab) {
      lastMainTab = candidate.tab;
      lastTabHash = hash;
    }
  }
  // Every screen gets its own element, so a late answer meant for the
  // previous screen can only draw into a detached one.
  const container = h('div', { class: 'screen-body' });
  clear($('#screen')).append(container);
  window.scrollTo(0, 0);
  const params = match.groups ?? {};
  const screen = candidate.mount(container, { params, navigate, backHash: lastTabHash }) ?? {};
  current = { route: candidate, screen };
  // An inner region or a region can have its own music, and so can the camp.
  setMusicPlace(candidate.mount === mountCamp ? ['camp'] : [params.area, params.region].filter(Boolean));
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

// Coming back to the page after a new version of the game was deployed
// reloads it, so an open page (or the installed app) never runs old code.
// Everything that matters is on the server; only the music starts anew.
let loadedVersion = null;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !loadedVersion) return;
  request('GET', '/api/health')
    .then((health) => {
      if (health.version !== loadedVersion) location.reload();
    })
    .catch(() => {});
});

// Coming back to the page (for example after the hunt timer ran out) refreshes
// the character, so timers and HP follow the server again.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.character && !views.game.hidden) {
    call('GET', '/api/character').catch((error) => toast(error.message));
  }
});

window.addEventListener('hashchange', route);

// A volume slider for the settings, from 0 (silence) to 100%. `preview`
// plays a sample when the finger lets go.
function volumeRow(id, label, value, change, preview) {
  const output = h('output', { class: 'volume-value', for: id });
  const slider = h('input', {
    type: 'range',
    id,
    class: 'duration-slider volume-slider',
    min: 0,
    max: 100,
    step: 5,
    value,
    onInput: () => {
      change(Number(slider.value));
      show();
    },
    onChange: () => preview?.(),
  });
  const show = () => {
    output.textContent = slider.value === '0' ? 'wył.' : `${slider.value}%`;
    slider.setAttribute('aria-valuetext', slider.value === '0' ? 'wyłączone' : `${slider.value}%`);
    slider.style.setProperty('--fill', `${slider.value}%`);
  };
  show();
  return h('div', { class: 'status-row status-row--volume' }, h('dt', {}, h('label', { for: id, text: label })), h('dd', {}, slider, output));
}

// The look of the character: a free change of its portrait and voice.
function lookRow() {
  const buttons = state.content.appearances.map((appearance) =>
    h('button', {
      type: 'button',
      class: 'segmented-option',
      'aria-pressed': String(state.character.appearance === appearance.id),
      text: appearance.name,
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          await call('POST', '/api/character/appearance', { appearance: appearance.id });
          for (const [index, button] of buttons.entries()) {
            button.setAttribute('aria-pressed', String(state.content.appearances[index].id === state.character.appearance));
          }
        }),
    }),
  );
  return h(
    'div',
    { class: 'status-row status-row--look' },
    h('dt', { id: 'look-label', text: 'Wygląd' }),
    h('dd', {}, h('div', { class: 'segmented', role: 'group', 'aria-labelledby': 'look-label' }, buttons)),
  );
}

function openSettings() {
  const version = h('dd', { text: '…' });
  // Shown only while the server allows test mode ("Pomiń czas" and the like).
  const testToggle =
    state.user.testMode &&
    h('button', {
      type: 'button',
      class: 'toggle',
      role: 'switch',
      'aria-checked': testModeOn(),
      'aria-labelledby': 'test-mode-label',
      onClick: () => {
        setTestMode(!testModeOn());
        testToggle.setAttribute('aria-checked', String(testModeOn()));
        testToggle.textContent = testModeOn() ? 'Włączony' : 'Wyłączony';
        current?.screen.update?.();
      },
      text: testModeOn() ? 'Włączony' : 'Wyłączony',
    });
  openSheet(
    h('h2', { class: 'sheet-title', text: 'Ustawienia' }),
    h(
      'dl',
      { class: 'status-list' },
      h('div', { class: 'status-row' }, h('dt', { text: 'Konto' }), h('dd', { text: state.user.login })),
      h('div', { class: 'status-row' }, h('dt', { text: 'Postać' }), h('dd', { text: state.character.name })),
      lookRow(),
      volumeRow('music-volume', 'Muzyka', musicVolume(), setMusicVolume),
      volumeRow('effects-volume', 'Efekty dźwiękowe', effectsVolume(), setEffectsVolume, () => playSound('system')),
      testToggle && h('div', { class: 'status-row' }, h('dt', { id: 'test-mode-label', text: 'Tryb testowy' }), h('dd', {}, testToggle)),
      h('div', { class: 'status-row' }, h('dt', { text: 'Wersja gry' }), version),
    ),
    installButton(),
    h('button', { type: 'button', class: 'button button--world', onClick: logout, text: 'Wyloguj się' }),
    h('button', { type: 'button', class: 'button button--danger', onClick: startOver, text: 'Zacznij od nowa' }),
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

// Removes the character after a question; the account stays.
async function startOver() {
  const sure = await confirmAction({
    title: 'Zacząć od nowa?',
    text: `${state.character.name} zniknie na zawsze razem z przedmiotami, złotem i raportami. Konto zostaje, a zaraz potem stworzysz nową postać.`,
    confirmLabel: 'Usuń postać',
    danger: true,
  });
  if (!sure) return;
  try {
    await call('DELETE', '/api/character');
    clearInterval(ticker);
    current?.screen.unmount?.();
    current = null;
    state.character = null;
    history.replaceState(null, '', HOME);
    await enterGame();
  } catch (error) {
    toast(error.message);
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
  setMusicPlace([]);
  const installSlot = $('#install-slot');
  clear(installSlot);
  const install = installBlock();
  if (install) installSlot.append(install);
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

// Sound effects and music start with a touch (browsers allow sound only
// after one); then buttons give a soft tap and tabs a different one.
function touched() {
  unlockSound();
  startMusic();
}
document.addEventListener('pointerdown', touched, { capture: true });
document.addEventListener(
  'click',
  (event) => {
    touched();
    const target = event.target.closest('button, a');
    if (!target || target.disabled || target.closest('.arena')) return;
    const tab = target.matches('.nav-item, .segmented-option, [role="tab"]');
    playSound(tab ? 'tab' : 'tap');
  },
  { capture: true },
);

// The service worker makes the game installable and shows a page when there
// is no connection (sw.js).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

initSheet();
start();

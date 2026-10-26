// Game page: checks the session on start, then shows the login screen, the
// character creation or the game. Screens are chosen by the address after #,
// so the static file server needs no routes. All visible texts are in Polish.

import { ApiError, request } from './api.js';
import { $, $$, clear, h, icon } from './dom.js';
import { emailRow, inviteToConfirm, mustConfirm, renderConfirm, takeEmailResult } from './email.js';
import { countOf } from './format.js';
import { preloadPortraits } from './art.js';
import { inAppBrowser, installBlock, installButton } from './install.js';
import { buildTopbar, showPouch, showWallet, updateNav, updateTopbar } from './layout.js';
import { showQuests, watchQuests } from './quests.js';
import { mountAuthor } from './screens/author.js';
import { mountCamp } from './screens/camp.js';
import { mountCharacter } from './screens/character.js';
import { mountCombat } from './screens/combat.js';
import { renderCreate } from './screens/create.js';
import { mountJournal } from './screens/journal.js';
import { lockedScreen } from './screens/locked.js';
import { mountReport } from './screens/report.js';
import { mountSkills } from './screens/skills.js';
import { mountStats } from './screens/stats.js';
import { musicVolume, setMusicConfig, setMusicPlace, setMusicVolume, startMusic } from './music.js';
import { resetCamera } from './camera.js';
import { applyMotion } from './motion.js';
import { ZOOM_MAX, ZOOM_MIN, applyZoom, stepZoom, zoomLevel, zoomOffered } from './zoom.js';
import { narrate } from './narrator.js';
import { pushRow, stopPush, syncPush } from './push.js';
import { effectsVolume, playSound, setEffectsVolume, setRecordings, unlockSound } from './sound.js';
import { call, handleSessionLost, loadContent, onCharacterChange, reportCache, serverNow, setTestMode, state, testModeOn } from './state.js';
import { closeSheet, confirmAction, initSheet, motionSwitch, openSheet, toast, voiceSwitch, withButton } from './ui.js';

const views = {
  loading: $('#view-loading'),
  auth: $('#view-auth'),
  create: $('#view-create'),
  confirm: $('#view-confirm'),
  game: $('#view-game'),
};

const ROUTES = [
  // Walka, a region, an inner region of it.
  { pattern: /^#\/walka(?:\/(?<region>[a-z0-9-]+)(?:\/(?<area>[a-z0-9-]+))?)?$/, nav: 'main', tab: 'walka', mount: mountCombat },
  { pattern: /^#\/postac$/, nav: 'character', tab: 'equipment', mount: mountCharacter },
  { pattern: /^#\/postac\/statystyki$/, nav: 'character', tab: 'stats', mount: mountStats },
  { pattern: /^#\/postac\/umiejetnosci$/, nav: 'character', tab: 'skills', music: 'skills', mount: mountSkills },
  { pattern: /^#\/postac\/rdzen$/, nav: 'character', tab: 'core', mount: lockedScreen('core', 'Rdzeń') },
  { pattern: /^#\/profesje$/, nav: 'main', tab: 'profesje', music: 'professions', mount: lockedScreen('professions', 'Profesje') },
  { pattern: /^#\/osada$/, nav: 'main', tab: 'osada', mount: lockedScreen('settlement', 'Osada') },
  { pattern: /^#\/dziennik(?:\/(?<tab>system))?$/, nav: 'main', tab: 'dziennik', mount: mountJournal },
  { pattern: /^#\/raport\/(?<id>\d+)$/, nav: 'main', tab: null, mount: mountReport },
  // The camp opens from the top bar: the board, or one building.
  // The camp is a tab of its own, in the top bar (`lit`), but not one to
  // come back to with "Powrót".
  { pattern: /^#\/oboz(?:\/(?<building>[a-z0-9-]+))?$/, nav: 'main', tab: null, lit: 'oboz', music: 'camp', mount: mountCamp },
  // The author's panel, from the settings of the author's account.
  { pattern: /^#\/autor$/, nav: 'main', tab: null, mount: mountAuthor },
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

// How a return from Google sign-in went: the server sends the browser to
// /?google=<result> (src/server/google.js).
const GOOGLE_NOTES = {
  linked: 'Połączono konto Google. Możesz już logować się przyciskiem Google.',
  // An account with test mode (src/server/accounts.js).
  linkedOnly: 'Połączono konto Google. To konto otwiera się teraz tylko przez Google.',
  taken: 'To konto Google jest już połączone z innym kontem w grze.',
  exists: 'Konto w grze z tym adresem e-mail już istnieje. Zaloguj się loginem i hasłem, a potem połącz Google w Ustawieniach.',
  cancelled: 'Logowanie przez Google zostało przerwane.',
  expired: 'Logowanie przez Google trwało za długo albo sesja wygasła. Spróbuj ponownie.',
  failed: 'Nie udało się zalogować przez Google. Spróbuj ponownie za chwilę.',
  unavailable: 'Logowanie przez Google jest teraz niedostępne.',
};

// Why Google sign-in cannot work here, or null. Google refuses browsers
// built into other apps, and a game added to the iPhone home screen keeps its
// cookies apart from Safari, where the sign-in would end.
function googleHint() {
  if (inAppBrowser()) {
    return 'Google nie pozwala logować się w przeglądarce wbudowanej w inną aplikację. Aby zalogować się przez Google, wybierz w jej menu „Otwórz w przeglądarce”.';
  }
  if (navigator.standalone === true) {
    return 'Na iPhonie logowanie przez Google działa w Safari, ale jeszcze nie w grze z ekranu początkowego. Tutaj zaloguj się loginem i hasłem.';
  }
  return null;
}

// Reads the result once and removes it from the address.
function takeGoogleResult() {
  const params = new URLSearchParams(location.search);
  const result = params.get('google');
  if (result === null) return null;
  params.delete('google');
  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
  return result in GOOGLE_NOTES ? result : 'failed';
}

async function start() {
  const googleResult = takeGoogleResult();
  // How a link from the confirmation mail went (email.js).
  const emailResult = takeEmailResult();
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
      state.googleLogin = health.google === true;
    })
    .catch(() => {});
  show('loading');
  $('#loading-text').textContent = 'Nawiązywanie połączenia…';
  $('#retry-button').hidden = true;
  try {
    const { user } = await request('GET', '/api/me');
    state.user = user;
    await enterGame();
    if (googleResult) toast(GOOGLE_NOTES[googleResult === 'linked' && user.testMode ? 'linkedOnly' : googleResult]);
    if (emailResult) toast(emailResult);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      enterAuth((googleResult && GOOGLE_NOTES[googleResult]) || (emailResult && `${emailResult} Zaloguj się, żeby grać.`));
      return;
    }
    $('#loading-text').textContent = error.message;
    $('#retry-button').hidden = false;
  }
}

async function enterGame() {
  await loadContent();
  // A new account plays once its e-mail is confirmed (email.js).
  if (mustConfirm(state.user)) {
    showConfirm();
    return;
  }
  // The phone's notifications follow the account signed in (push.js).
  syncPush();
  try {
    await call('GET', '/api/character');
  } catch (error) {
    if (error instanceof ApiError && error.code === 'email_unconfirmed') {
      state.user = { ...state.user, emailConfirmed: false, emailRequired: true };
      showConfirm();
      return;
    }
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

// The screen of a new account that waits for the link from its mail.
let emailUnsent = false; // the mail after the registration did not go out
function showConfirm() {
  setMusicPlace([]);
  show('confirm');
  renderConfirm($('#confirm-panel'), { onConfirmed: () => enterGame(), onLogout: signOut, unsent: emailUnsent });
  emailUnsent = false;
}

function openGame() {
  show('game');
  buildTopbar(openSettings);
  route();
  // An older account without a confirmed e-mail is invited to confirm it,
  // once the narrator is done (email.js).
  setTimeout(inviteToConfirm, 1500);
  clearInterval(ticker);
  ticker = setInterval(() => {
    const now = serverNow();
    updateTopbar(now);
    current?.screen.tick?.(now);
    watchConstruction(now);
    watchCrafting(now);
    watchQuests(now);
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

// When an order on the Stół rzemieślniczy ends, the character is fetched
// again, with the parts made, and a short message says what is ready.
let craftRetryAt = 0;
function watchCrafting(now) {
  const order = state.character?.crafting?.queue[0];
  if (!order || now < order.endsAt + 1000 || now < craftRetryAt) return;
  craftRetryAt = now + 30000;
  call('GET', '/api/character')
    .then(() => {
      const extra = order.bonus > 0 ? ` i ${countOf(order.bonus, 'dodatkowa część', 'dodatkowe części', 'dodatkowych części')}` : '';
      toast(`Stół rzemieślniczy skończył: ${order.part} ×${order.parts}${extra}.`);
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
  showPouch(false);
  showQuests(false);

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
  // The narrator's camera leaves the screen before the next one is drawn.
  resetCamera();
  clear($('#screen')).append(container);
  window.scrollTo(0, 0);
  const params = match.groups ?? {};
  const screen = candidate.mount(container, { params, navigate, backHash: lastTabHash }) ?? {};
  current = { route: candidate, screen };
  // An inner region or a region can have its own music, and so can the camp
  // and the tabs with a music place (Umiejętności, Profesje). A report opened
  // right after its exploration plays the music of its result once; opened
  // again, from the Dziennik say, it keeps the usual one.
  const fresh = candidate.mount === mountReport && params.id === state.freshReport;
  if (!fresh) state.freshReport = null;
  const places = [params.area, params.region, candidate.music].filter(Boolean);
  setMusicPlace(places, fresh ? reportCache.get(params.id)?.result : null);
  renderNav();
  $('.page-title', container)?.focus({ preventScroll: true });
  // A new character's narrator: a card or the place to tap on this screen.
  narrate(hash);
}

function renderNav() {
  if (!current) return;
  const { route: active } = current;
  updateNav({
    kind: active.nav,
    active: active.nav === 'main' ? active.lit ?? active.tab ?? lastMainTab : active.tab,
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
  narrate();
  // The narrator's lines read: the invitation may come once he is done.
  setTimeout(inviteToConfirm, 1500);
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

// The size of the game on the screen (zoom.js): "−" takes it farther, "+"
// closer, 5% at a time.
function zoomRow() {
  const output = h('output', { class: 'zoom-value', 'aria-live': 'polite' });
  const step = (direction) => {
    stepZoom(direction);
    show();
  };
  const farther = h('button', { type: 'button', class: 'zoom-button', 'aria-label': 'Oddal widok', onClick: () => step(-1) }, icon('minus', { size: 20 }));
  const closer = h('button', { type: 'button', class: 'zoom-button', 'aria-label': 'Przybliż widok', onClick: () => step(1) }, icon('plus', { size: 20 }));
  const show = () => {
    output.textContent = `${zoomLevel()}%`;
    farther.disabled = zoomLevel() <= ZOOM_MIN;
    closer.disabled = zoomLevel() >= ZOOM_MAX;
  };
  show();
  return h(
    'div',
    { class: 'status-row status-row--zoom' },
    h('dt', { id: 'zoom-label', text: 'Widok' }),
    h('dd', {}, h('div', { class: 'zoom-control', role: 'group', 'aria-labelledby': 'zoom-label' }, farther, output, closer)),
  );
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

// Google sign-in for this account: linked, or a button that links it.
function googleRow() {
  if (!state.user.google && (!state.googleLogin || googleHint())) return null;
  return h(
    'div',
    { class: 'status-row status-row--google' },
    h('dt', { text: 'Google' }),
    h(
      'dd',
      {},
      state.user.google
        ? h('span', { class: 'status-ok', text: 'Połączone' })
        : h(
            'a',
            { class: 'google-button google-button--small', href: '/api/auth/google/start?mode=link', onClick: confirmGoogleOnly },
            h('img', { class: 'google-logo', src: '/google-g.svg', alt: '', width: 18, height: 18 }),
            'Połącz z Google',
          ),
    ),
  );
}

// An account with test mode opens only with Google once linked, so the
// player is asked first.
async function confirmGoogleOnly(event) {
  if (!state.user.testMode) return;
  event.preventDefault();
  const { href } = event.currentTarget;
  const sure = await confirmAction({
    title: 'Połączyć z Google?',
    text: 'To konto ma tryb testowy. Po połączeniu otworzy się już tylko przez Google, bez hasła, a na innych urządzeniach się wyloguje.',
    confirmLabel: 'Połącz',
  });
  if (sure) location.href = href;
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
    // The reports and System messages: the Dziennik has no tab in the bottom
    // bar.
    h('a', { class: 'button button--world settings-journal', href: '#/dziennik', onClick: closeSheet }, icon('book', { size: 20 }), 'Dziennik'),
    h(
      'dl',
      { class: 'status-list' },
      h('div', { class: 'status-row' }, h('dt', { text: 'Konto' }), h('dd', { text: state.user.login })),
      emailRow(),
      h('div', { class: 'status-row' }, h('dt', { text: 'Postać' }), h('dd', { text: state.character.name })),
      lookRow(),
      googleRow(),
      volumeRow('music-volume', 'Muzyka', musicVolume(), setMusicVolume),
      volumeRow('effects-volume', 'Efekty dźwiękowe', effectsVolume(), setEffectsVolume, () => playSound('system')),
      h('div', { class: 'status-row' }, h('dt', { id: 'voice-label', text: 'Głos narratora' }), h('dd', {}, voiceSwitch('voice-label'))),
      h('div', { class: 'status-row' }, h('dt', { id: 'motion-label', text: 'Animacje' }), h('dd', {}, motionSwitch('motion-label'))),
      pushRow(),
      zoomOffered() && zoomRow(),
      testToggle && h('div', { class: 'status-row' }, h('dt', { id: 'test-mode-label', text: 'Tryb testowy' }), h('dd', {}, testToggle)),
      h('div', { class: 'status-row' }, h('dt', { text: 'Wersja gry' }), version),
    ),
    installButton(),
    state.user.author && h('a', { class: 'button button--system', href: '#/autor', onClick: closeSheet, text: 'Panel autora' }),
    h('button', { type: 'button', class: 'button button--world', onClick: logout, text: 'Wyloguj się' }),
    h('button', { type: 'button', class: 'button button--danger', onClick: startOver, text: 'Zacznij od nowa' }),
    h('button', { type: 'button', class: 'button button--danger', onClick: deleteAccount, text: 'Usuń konto' }),
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
    await signOut(true);
  } catch {
    button.disabled = false;
  }
}

// `rethrow`: the button that asked for it is enabled again on a failure.
async function signOut(rethrow = false) {
  try {
    // This phone stops getting the account's notifications.
    await stopPush();
    await request('POST', '/api/auth/logout');
    leaveGame();
  } catch (error) {
    toast(error.message);
    if (rethrow === true) throw error;
  }
}

// Removes the account for good after its login is typed in, and goes back to
// signing in (Google Play asks for this path inside the app).
async function deleteAccount() {
  const { login } = state.user;
  const sure = await confirmAction({
    title: 'Usunąć konto?',
    text: `Konto ${login} zniknie na zawsze razem z postacią, przedmiotami, raportami i obozem. Tego nie da się cofnąć.`,
    confirmLabel: 'Usuń konto',
    danger: true,
    typed: login,
  });
  if (!sure) return;
  try {
    await request('DELETE', '/api/me', { login });
    stopPush();
    leaveGame();
    toast('Konto zostało usunięte.');
  } catch (error) {
    toast(error.message);
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
    narrate();
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
  state.freshReport = null;
  // The narrator leaves with the character, and gives the screen back.
  narrate();
  enterAuth();
}

handleSessionLost(() => {
  if (state.user) leaveGame();
});

// Login and registration

// `note`: how a return from Google went, if the page opened after one.
function enterAuth(note = null) {
  const googleNote = $('#google-note');
  googleNote.textContent = note ?? '';
  googleNote.hidden = !note;
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
      state.googleLogin = health.google === true;
      const hint = state.googleLogin ? googleHint() : null;
      $('#google-block').hidden = !state.googleLogin || hint !== null;
      $('#google-hint').textContent = hint ?? '';
      $('#google-hint').hidden = hint === null;
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
bindForm($('#register-form'), async (data) => {
  const answer = await request('POST', '/api/auth/register', data);
  emailUnsent = answer.emailSent === false;
  return answer;
});

$('#retry-button').addEventListener('click', start);

// Sound effects and music start with a touch (browsers allow sound only
// after one). Then every move to another screen clicks like a tab (the
// menus, a link in the game such as a camp plot or a report, "Powrót"),
// and a button that does something gives a soft tap.
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
    const move = target.matches('.nav-item, .segmented-option, [role="tab"], .back-button, a[href^="#/"]');
    playSound(move ? 'tab' : 'tap');
  },
  { capture: true },
);

// The service worker makes the game installable and shows a page when there
// is no connection (sw.js).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

applyZoom();
applyMotion();
initSheet();
start();

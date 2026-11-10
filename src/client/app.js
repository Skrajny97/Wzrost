// Game page: checks the session on start, then shows the login screen, the
// character creation or the game. Screens are chosen by the address after #,
// so the static file server needs no routes. The visible texts are written in
// Polish and shown in the page's language (t(), i18n.js).

import { ApiError, request } from './api.js';
import { $, $$, clear, fill, h, icon } from './dom.js';
import { legalLinks, mustConfirmAge, renderAge } from './age.js';
import { emailRow, hideInvite, inviteToConfirm, mustConfirm, renderConfirm, takeEmailResult } from './email.js';
import { countOf } from './format.js';
import { preloadPortraits } from './art.js';
import { inAppBrowser, installBlock, installButton } from './install.js';
import { buildTopbar, showWallet, updateNav, updateTopbar } from './layout.js';
import { desktopLayout, layoutChoice, layoutOffered, onLayoutChange, setLayoutChoice } from './layout-mode.js';
import { updateSide } from './side.js';
import { chatBubbleOn, setChatBubbleOn, updateChatBubble } from './chat-bubble.js';
// The computer's keys 1–6 for the main tabs (477 A, 508 A).
import './keys.js';
import { showQuests, watchQuests } from './quests.js';
import { offerNameNotice, offerRename, openNameChange } from './rename.js';
import { offerWeekNotice } from './weeks.js';
import { screenshotPicker } from './screenshot.js';
import { mountAuthor } from './screens/author.js';
import { mountEncyclopedia } from './screens/encyclopedia.js';
import { mountEvolution } from './screens/evolution.js';
import { mountCamp } from './screens/camp.js';
import { mountCharacter } from './screens/character.js';
import { mountCombat } from './screens/combat.js';
import { mountTowers } from './screens/towers.js';
import { mountPortals } from './screens/portals.js';
import { mountCommunity } from './screens/community.js';
import { mountChatScreen } from './screens/chat.js';
import { mountGuildPage } from './screens/guild.js';
import { checkChat, onActivityEnds, onChatNews } from './chat-news.js';
import { activityMoved } from './activity-sync.js';
import { checkOnline, mountOnline } from './online.js';
import { enableHold } from './hold.js';
import { renderCreate } from './screens/create.js';
import { renderSelect } from './screens/select.js';
import { mountJournal } from './screens/journal.js';
import { lockedScreen } from './screens/locked.js';
import { mountSettlement } from './screens/settlement.js';
import { mountShop } from './screens/shop.js';
import { mountProfessions } from './screens/professions.js';
import { mountReport } from './screens/report.js';
import { mountSkills } from './screens/skills.js';
import { mountStats } from './screens/stats.js';
import { mountTrade, offerTrade } from './screens/trade.js';
import { musicOn, musicVolume, prefetchMusic, setMusicConfig, setMusicOn, setMusicPlace, setMusicVolume, startMusic } from './music.js';
import { resetCamera } from './camera.js';
import { applyMotion } from './motion.js';
import { ZOOM_MAX, ZOOM_MIN, applyZoom, stepZoom, zoomLevel, zoomOffered } from './zoom.js';
import { forgetPart, narrate, narrateSoon, passTold } from './narrator.js';
import { forgetNews, watchNews } from './news.js';
import { LANGUAGES, LANGUAGE_NAMES, englishOffered, followAccount, language, languageSwitch, pickLanguage, prepareLanguage, t } from './i18n.js';
import { pushRow, stopPush, syncPush } from './push.js';
import { effectsVolume, playSound, setEffectsVolume, setRecordings, unlockSound } from './sound.js';
import { call, filledForCollector, handleSessionLost, isUnlocked, loadContent, onCharacterChange, reportCache, serverNow, setTestMode, state, testModeOn, unlockInfo } from './state.js';
import { offerPointsReset, openEvolutionTests } from './evolution.js';
import { giftCodeRow } from './gift-code.js';
import { discordRow } from './discord.js';
import { closeSheet, confirmAction, initSheet, motionSwitch, openSheet, skinSwatches, switchButton, toast, voiceSwitch, withButton } from './ui.js';

const views = {
  loading: $('#view-loading'),
  auth: $('#view-auth'),
  create: $('#view-create'),
  select: $('#view-select'),
  confirm: $('#view-confirm'),
  game: $('#view-game'),
};

// `part`: the part of its tab a screen shows, whose shortcut lights under
// the tab in the computer's menu (layout.js, 507 A); the Społeczność tells
// its own, as its tabs change (setPart).
const ROUTES = [
  // Walka, a region, an inner region of it.
  { pattern: /^#\/walka(?:\/(?<region>[a-z0-9-]+)(?:\/(?<area>[a-z0-9-]+))?)?$/, nav: 'main', tab: 'walka', part: () => 'explore', mount: mountCombat },
  { pattern: /^#\/wieze$/, nav: 'main', tab: 'walka', part: () => 'towers', mount: mountTowers },
  { pattern: /^#\/portale$/, nav: 'main', tab: 'walka', part: () => 'portals', mount: mountPortals },
  { pattern: /^#\/postac$/, nav: 'character', tab: 'equipment', mount: mountCharacter },
  { pattern: /^#\/postac\/statystyki$/, nav: 'character', tab: 'stats', mount: mountStats },
  { pattern: /^#\/postac\/umiejetnosci$/, nav: 'character', tab: 'skills', music: 'skills', mount: mountSkills },
  { pattern: /^#\/postac\/ewolucja$/, nav: 'character', tab: 'evolution', music: 'skills', mount: mountEvolution },
  { pattern: /^#\/postac\/rdzen$/, nav: 'character', tab: 'core', mount: lockedScreen('core', 'Rdzeń') },
  // Profesje, or one profession's screen (Zielarstwo).
  { pattern: /^#\/profesje(?:\/(?<profession>[a-z]+))?$/, nav: 'main', tab: 'profesje', part: ({ profession }) => profession, music: 'professions', mount: mountProfessions },
  // The Osada's board, or one of its places, the Karczma at one of its
  // tabs (settlement.js).
  { pattern: /^#\/osada(?:\/(?<place>[a-z0-9-]+)(?:\/(?<tab>[a-z]+))?)?$/, nav: 'main', tab: 'osada', part: ({ place }) => place, mount: mountSettlement },
  // The Czat's address of the days it was a part of the Społeczność, in the
  // notifications sent before 0.2.40: the Czat's own screen now.
  { pattern: /^#\/spolecznosc\/czat$/, redirect: '#/czat' },
  // The Społeczność, or one of its parts (the computer menu's shortcuts).
  { pattern: /^#\/spolecznosc(?:\/(?<section>[a-z]+))?$/, nav: 'main', tab: 'spolecznosc', mount: mountCommunity },
  // The Czat on a screen of its own, from the round chat button over the
  // game on a phone (782 C, chat-bubble.js, screens/chat.js), the only place
  // of the chat there since it left the Społeczność (0.2.40).
  // No tab of the bottom bar lights on it (`lit` names none).
  { pattern: /^#\/czat$/, nav: 'main', tab: null, lit: 'czat', mount: mountChatScreen },
  // The Gildia's own page, from its tab in the Społeczność, at one of its
  // tabs (data/guilds.json, tabs).
  { pattern: /^#\/gildia(?:\/(?<tab>[a-z]+))?$/, nav: 'main', tab: null, lit: 'spolecznosc', part: () => 'guilds', mount: mountGuildPage },
  // A Wymiana with another player's character, from the Społeczność.
  { pattern: /^#\/wymiana$/, nav: 'main', tab: null, lit: 'spolecznosc', mount: mountTrade },
  { pattern: /^#\/dziennik(?:\/(?<tab>system))?$/, nav: 'main', tab: 'dziennik', mount: mountJournal },
  { pattern: /^#\/raport\/(?<id>\d+)$/, nav: 'main', tab: null, mount: mountReport },
  // The camp opens from the top bar (on a computer from its tab in the
  // menu): the board, or one building. The camp is a tab of its own
  // (`lit`), but not one to come back to with "Powrót".
  { pattern: /^#\/oboz(?:\/(?<building>[a-z0-9-]+))?$/, nav: 'main', tab: null, lit: 'oboz', music: 'camp', mount: mountCamp },
  // The Encyklopedia, from its book in the top bar, at one of its tabs.
  { pattern: /^#\/encyklopedia(?:\/(?<tab>[a-z]+))?$/, nav: 'main', tab: null, lit: 'encyklopedia', mount: mountEncyclopedia },
  // The Sklep Systemu, from its stall in the top bar, at one of its tabs.
  { pattern: /^#\/sklep(?:\/(?<tab>[a-z]+))?$/, nav: 'main', tab: null, lit: 'sklep', mount: mountShop },
  // The author's panel, from the settings of the author's account.
  { pattern: /^#\/autor$/, nav: 'main', tab: null, mount: mountAuthor },
];
const HOME = '#/walka';

let current = null; // { route, screen, view: { part } }
let lastMainHash = HOME;
let lastMainTab = 'walka';
let lastTabHash = HOME; // the last tab of the main menu, where a report's "Powrót" leads
let ticker = null;

function show(name) {
  for (const [key, view] of Object.entries(views)) view.hidden = key !== name;
  updateSide();
  updateChatBubble();
}

// Another layout (the settings, or the window grown or shrunk past a
// computer's width): the menu and the side column as it wants them.
onLayoutChange(() => {
  renderNav();
  updateSide();
  updateChatBubble();
});

// How a return from Google sign-in went: the server sends the browser to
// /?google=<result> (src/server/google.js).
const GOOGLE_NOTES = {
  linked: 'Połączono konto Google. Możesz już logować się przyciskiem Google.',
  // The same, and the link brought Punkty Systemu (googleNote).
  rewarded: 'Połączono konto Google. Możesz już logować się przyciskiem Google.',
  // A new account made with Google (googleNote adds its Punkty Systemu).
  created: 'Konto założone przez Google.',
  // A sign-in into an account that exists: no note, the choice of the
  // character comes as after a sign-in with the login.
  signed: null,
  // An account with test mode (src/server/accounts.js).
  linkedOnly: 'Połączono konto Google. To konto otwiera się teraz tylko przez Google.',
  taken: 'To konto Google jest już połączone z innym kontem w grze.',
  exists: 'Konto w grze z tym adresem e-mail już istnieje. Zaloguj się loginem i hasłem, a potem połącz Google w Ustawieniach.',
  cancelled: 'Logowanie przez Google zostało przerwane.',
  expired: 'Logowanie przez Google trwało za długo albo sesja wygasła. Spróbuj ponownie.',
  failed: 'Nie udało się zalogować przez Google. Spróbuj ponownie za chwilę.',
  unavailable: 'Logowanie przez Google jest teraz niedostępne.',
  closed: 'Zakładanie nowych kont jest wyłączone.',
};

// The note for a return from Google signed in: an account with test mode
// opens only with Google once linked, and Punkty Systemu are named.
function googleNote(result, user) {
  const linked = result === 'linked' || result === 'rewarded';
  const note = t(GOOGLE_NOTES[linked && user.testMode ? 'linkedOnly' : result]);
  const points = t('{count} Punktów Systemu', { count: state.content?.emailReward ?? 10 });
  if (result === 'rewarded') return t('{note} Za połączenie: {points}.', { note, points });
  if (result === 'created') return t('{note} Na start: {points}.', { note, points });
  return note;
}

// Why Google sign-in cannot work here, or null. Google refuses browsers
// built into other apps, and a game added to the iPhone home screen keeps its
// cookies apart from Safari, where the sign-in would end.
function googleHint() {
  if (inAppBrowser()) {
    return t('Google nie pozwala logować się w przeglądarce wbudowanej w inną aplikację. Aby zalogować się przez Google, wybierz w jej menu „Otwórz w przeglądarce”.');
  }
  if (navigator.standalone === true) {
    return t('Na iPhonie logowanie przez Google działa w Safari, ale jeszcze nie w grze z ekranu początkowego. Tutaj zaloguj się loginem i hasłem.');
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
  // The version this page runs, to notice a newer one later, and the page's
  // language (i18n.js): whether the server offers English, and the English
  // of the page's texts.
  const languageReady = request('GET', '/api/health')
    .catch(() => null)
    .then((health) => {
      if (health) {
        loadedVersion ??= health.version;
        state.googleLogin = health.google === true;
      }
      return prepareLanguage(health);
    });
  // The music plays from the start screen on, after the first touch, and
  // the recorded fight sounds load then too.
  languageReady
    .then(() => loadContent())
    .then((content) => {
      setMusicConfig(content.music);
      setRecordings(content.sounds);
    })
    .catch(() => {});
  preloadPortraits();
  show('loading');
  $('#loading-text').textContent = t('Nawiązywanie połączenia…');
  $('#retry-button').hidden = true;
  let user = null;
  let failure = null;
  try {
    ({ user } = await request('GET', '/api/me'));
  } catch (error) {
    failure = error;
  }
  await languageReady;
  // How a link from the confirmation mail went (email.js).
  const emailResult = takeEmailResult();
  try {
    if (failure) throw failure;
    // The account's language, or one picked before the sign-in for it.
    await followAccount(user);
    state.user = user;
    await enterGame({ choose: googleResult === 'signed' });
    if (googleResult && GOOGLE_NOTES[googleResult]) toast(googleNote(googleResult, user));
    if (emailResult) toast(emailResult);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      enterAuth((googleResult && GOOGLE_NOTES[googleResult] && t(GOOGLE_NOTES[googleResult])) || (emailResult && t('{note} Zaloguj się, żeby grać.', { note: emailResult })));
      return;
    }
    $('#loading-text').textContent = error.message;
    $('#retry-button').hidden = false;
  }
}

// `choose`: right after signing in, an account with more characters than
// one chooses the one to play first (screens/select.js). One that plays none
// of them chooses too, and one without any creates its first.
async function enterGame({ choose = false } = {}) {
  await loadContent();
  // A new account made with Google answers once that its player is 16 or
  // over (age.js).
  if (mustConfirmAge(state.user)) {
    showAge();
    return;
  }
  // A new account plays once its e-mail is confirmed (email.js).
  if (mustConfirm(state.user)) {
    showConfirm();
    return;
  }
  // The phone's notifications follow the account signed in (push.js).
  syncPush();
  try {
    if (choose) {
      const list = await call('GET', '/api/characters');
      if (list.characters.length > 1 && !list.parked) {
        showChoice(list);
        return;
      }
    }
    await call('GET', '/api/character');
  } catch (error) {
    if (error instanceof ApiError && error.code === 'age_unconfirmed') {
      state.user = { ...state.user, ageRequired: true };
      showAge();
      return;
    }
    if (error instanceof ApiError && error.code === 'email_unconfirmed') {
      state.user = { ...state.user, emailConfirmed: false, emailRequired: true };
      showConfirm();
      return;
    }
    if (error instanceof ApiError && error.code === 'no_character') {
      const list = await call('GET', '/api/characters');
      // The test version's introduction makes a new character while the
      // player's own waits parked (offerBack).
      if (list.characters.length > 0 && !list.parked) showChoice(list);
      else showCreate(list);
      return;
    }
    throw error;
  }
  openGame();
}

// The creation of a character: the account's first, or one more beside
// those it has, with the way back to choosing among them.
function showCreate(list) {
  setMusicPlace([]);
  show('create');
  const container = $('#create-screen');
  renderCreate(
    container,
    () => {
      // A new character starts on the Walka tab.
      history.replaceState(null, '', HOME);
      openGame();
    },
    list.classes,
  );
  if (list.parked) {
    if (state.user.tutorialTests) offerBack(container);
  } else if (list.characters.length > 0) {
    container.append(h('div', { class: 'create-back' }, h('button', { type: 'button', class: 'button button--world', onClick: () => showChoice(list), text: t('Wróć do wyboru postaci') })));
  }
}

// The choice of the character to play among the account's (screens/select.js).
function showChoice(list) {
  setMusicPlace([]);
  show('select');
  renderSelect($('#select-screen'), list, { onChoose: chooseCharacter, onCreate: () => showCreate(list), onLogout: () => signOut(true) });
}

// The account plays that character from now on: the game starts again with
// it, from the Walka tab.
async function chooseCharacter(id) {
  await request('POST', '/api/characters/choose', { id });
  await characterGone();
}

// Another of the account's characters played with one tap on its bust at
// the top of the Postać tab (players on the chat, via the author, 7.11.2026:
// "miniaturki postaci w formie ikon"): the game starts again with it, on its
// Postać tab.
async function switchCharacter(id) {
  await call('POST', '/api/characters/choose', { id });
  await characterGone('#/postac');
}

// "Zmień postać" in the Ustawienia: the game steps back to the choice.
async function changeCharacter(event) {
  await withButton(event.currentTarget, async () => {
    const list = await call('GET', '/api/characters');
    closeSheet();
    clearInterval(ticker);
    current?.screen.unmount?.();
    current = null;
    state.character = null;
    narrate();
    showChoice(list);
  });
}

// The screen of a new account that waits for the link from its mail.
let emailUnsent = false; // the mail after the registration did not go out
function showAge() {
  setMusicPlace([]);
  show('confirm');
  renderAge($('#confirm-panel'), {
    onConfirmed: () => enterGame({ choose: true }),
    onDeleted: () => enterAuth(t('Konto zostało usunięte. Insight jest dla osób, które mają co najmniej 16 lat.')),
  });
}

function showConfirm() {
  setMusicPlace([]);
  show('confirm');
  renderConfirm($('#confirm-panel'), { onConfirmed: () => enterGame(), onLogout: signOut, unsent: emailUnsent });
  emailUnsent = false;
}

function openGame() {
  show('game');
  buildTopbar(openSettings);
  mountOnline($('#view-game'));
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
    watchStores(now);
    watchQuests(now);
    // A new entry of "Co nowego?" lights the scroll's dot (news.js).
    watchNews(now);
    checkChat();
    checkOnline();
    offerTrade();
    offerPointsReset();
    offerRename();
    offerNameNotice();
    // A new week of the year, named once (weeks.js).
    offerWeekNotice();
  }, 1000);
  checkChat({ now: true });
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
      toast(t('{name}: poziom {level} gotowy.', { name: building.name, level: building.level }));
      playSound('done');
    })
    .catch((error) => toast(error.message));
}

// With the Zbieracz Systemu, when a camp store fills the character is
// fetched again: the server collects the store as it loads it, so the
// resources and the store follow at once, with no message. Without a
// connection it tries again every 30 seconds.
let storesRetryAt = 0;
function watchStores(now) {
  if (now < storesRetryAt || !filledForCollector(state.character, now)) return;
  storesRetryAt = now + 30000;
  call('GET', '/api/character').catch(() => {});
}

// When an order on the Stół rozbiórki ends, the character is fetched
// again, with the parts made, and a short message says what is ready. The
// server tells an order's extra parts only once it has ended (taken off and
// ordered again, an order would draw them anew), so the message finds them
// among the parts that came: those of the part beyond what the orders done
// since were to make.
let craftRetryAt = 0;
function watchCrafting(now) {
  const crafting = state.character?.crafting;
  const order = crafting?.queue[0];
  if (!order || now < order.endsAt + 1000 || now < craftRetryAt) return;
  craftRetryAt = now + 30000;
  const held = (view) => view?.parts.find((part) => part.name === order.part)?.count ?? 0;
  call('GET', '/api/character')
    .then(() => {
      const after = state.character.crafting;
      const made = crafting.queue
        .filter((one) => one.part === order.part && !after?.queue.some((next) => next.id === one.id))
        .reduce((sum, one) => sum + one.parts, 0);
      const bonus = held(after) - held(crafting) - made;
      const extra = bonus > 0 && bonus <= made ? t(' i {parts}', { parts: countOf(bonus, 'dodatkowa część', 'dodatkowe części', 'dodatkowych części') }) : '';
      toast(t('Stół rozbiórki skończył: {part} ×{count}{extra}.', { part: order.part, count: order.parts, extra }));
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
  if (candidate.redirect) {
    location.replace(candidate.redirect);
    return;
  }
  current?.screen.unmount?.();
  closeSheet();
  showWallet(false);
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
  // The part shown, which a screen with tabs of its own may change; the
  // computer's menu lights its shortcut.
  const view = { part: candidate.part?.(params) ?? null };
  const setPart = (id) => {
    if (view.part === id) return;
    view.part = id;
    if (current?.view === view && desktopLayout()) renderNav();
  };
  const screen = candidate.mount(container, { params, navigate, backHash: lastTabHash, setPart, switchCharacter }) ?? {};
  current = { route: candidate, screen, view };
  // An inner region or a region can have its own music, and so can the camp
  // and the tabs with a music place (Umiejętności, Profesje). A report opened
  // right after its exploration plays the music of its result once; opened
  // again, from the Dziennik say, it keeps the usual one.
  const fresh = candidate.mount === mountReport && params.id === state.freshReport;
  if (!fresh) state.freshReport = null;
  const places = [params.area, params.region, candidate.music].filter(Boolean);
  setMusicPlace(places, fresh ? reportCache.get(params.id)?.result : null);
  prefetchMusic();
  renderNav();
  $('.page-title', container)?.focus({ preventScroll: true });
  // A new character's narrator: a card or the place to tap on this screen,
  // at the address the screen has once drawn: one that opens on a tab of
  // its own puts it in the address (the Gildia's Wyprawa, 664).
  narrate(location.hash || hash);
}

function renderNav() {
  if (!current) return;
  const { route: active } = current;
  updateNav({
    kind: active.nav,
    active: active.nav === 'main' ? active.lit ?? active.tab ?? lastMainTab : active.tab,
    part: current.view.part,
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
  // The chat in the side column once the Społeczność opens, or its round
  // button on a phone.
  updateSide();
  updateChatBubble();
  current.screen.update?.();
  // A moment later, at the page's address then: a chapter the claim of a
  // report brings begins after the report, not over it (664).
  narrateSoon();
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
    checkChat({ now: true });
  }
});

// A Drużyna's exploration moved by another member's "Przewiń" (the trip's
// shared timer, src/server/time.js), or one the leader sent the character
// on (parties.js): the chat's check hears its end, and the character is
// fetched again whenever it is not the activity the page shows
// (activity-sync.js), so the timers and the Walka screen follow. Before
// 10.11.2026 only a trip the page showed already was followed, and a
// member sent out while its page showed it at home stayed there.
onActivityEnds((endsAt) => {
  if (!state.character || !activityMoved(state.character.activity, endsAt)) return;
  call('GET', '/api/character').catch(() => {});
});

// Someone wrote in the chat, or the player read it: the bar shows it. A
// Wymiana proposed asks in a sheet.
onChatNews(() => {
  if (views.game.hidden) return;
  renderNav();
  offerTrade();
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
    output.textContent = slider.value === '0' ? t('wył.') : `${slider.value}%`;
    slider.setAttribute('aria-valuetext', slider.value === '0' ? t('wyłączone') : `${slider.value}%`);
    slider.style.setProperty('--fill', `${slider.value}%`);
  };
  show();
  return h('div', { class: 'status-row status-row--volume' }, h('dt', {}, h('label', { for: id, text: label })), h('dd', {}, slider, output));
}

// "Muzyka": a switch that turns the music off for good, not only down (the
// author, 10.11.2026: „Opcja wyłączenia nie tylko wyciszenia głośności
// muzyki, by można było słuchać swojej.”), with a line on what it is for,
// and under it, while the music is on, its volume. Off, no track downloads
// or plays (music.js) and the game's sounds leave the phone's other audio
// playing where the phone lets them (sound.js).
function musicRows() {
  const volume = volumeRow('music-volume', t('Głośność muzyki'), musicVolume(), setMusicVolume);
  volume.hidden = !musicOn();
  // The same switch as "Głos narratora" and "Animacje" (ui.js).
  const toggle = switchButton('music-label', musicOn, setMusicOn, [t('Włączona'), t('Wyłączona')]);
  toggle.setAttribute('aria-describedby', 'music-hint');
  // After the switch's own listener, which has set it.
  toggle.addEventListener('click', () => {
    volume.hidden = !musicOn();
  });
  return [
    h(
      'div',
      { class: 'status-row status-row--hinted' },
      h('dt', { id: 'music-label', text: t('Muzyka') }),
      h('dd', {}, toggle),
      h('dd', { class: 'status-hint', id: 'music-hint', text: t('Wyłącz, żeby słuchać własnej muzyki: gra nie będzie wtedy pobierać ani odtwarzać swojej.') }),
    ),
    volume,
  ];
}

// The size of the game on the screen (zoom.js): "−" takes it farther, "+"
// closer, 5% at a time.
// "Układ ekranu" (473 A): the computer's layout on its own on a wide screen
// with a mouse, or the phone's or the computer's always, on this device.
const LAYOUTS = [
  { id: 'auto', name: 'Sam' },
  { id: 'phone', name: 'Telefon' },
  { id: 'desktop', name: 'Komputer' },
];

function layoutRow() {
  const buttons = LAYOUTS.map((layout) =>
    h('button', {
      type: 'button',
      class: 'segmented-option',
      'aria-pressed': String(layoutChoice() === layout.id),
      text: t(layout.name),
      onClick: () => {
        setLayoutChoice(layout.id);
        for (const [index, button] of buttons.entries()) button.setAttribute('aria-pressed', String(LAYOUTS[index].id === layoutChoice()));
      },
    }),
  );
  return h(
    'div',
    { class: 'status-row status-row--layout' },
    h('dt', { id: 'layout-label', text: t('Układ ekranu') }),
    h('dd', {}, h('div', { class: 'segmented segmented--three', role: 'group', 'aria-labelledby': 'layout-label' }, buttons)),
  );
}

function zoomRow() {
  const output = h('output', { class: 'zoom-value', 'aria-live': 'polite' });
  const step = (direction) => {
    stepZoom(direction);
    show();
  };
  const farther = h('button', { type: 'button', class: 'zoom-button', 'aria-label': t('Oddal widok'), onClick: () => step(-1) }, icon('minus', { size: 20 }));
  const closer = h('button', { type: 'button', class: 'zoom-button', 'aria-label': t('Przybliż widok'), onClick: () => step(1) }, icon('plus', { size: 20 }));
  const show = () => {
    output.textContent = `${zoomLevel()}%`;
    farther.disabled = zoomLevel() <= ZOOM_MIN;
    closer.disabled = zoomLevel() >= ZOOM_MAX;
  };
  show();
  return h(
    'div',
    { class: 'status-row status-row--zoom' },
    h('dt', { id: 'zoom-label', text: t('Widok') }),
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
    h('dt', { id: 'look-label', text: t('Wygląd') }),
    h('dd', {}, h('div', { class: 'segmented', role: 'group', 'aria-labelledby': 'look-label' }, buttons)),
  );
}

// The character's name, with its one change (the author: "jednorazowo, po
// czym opcja się blokuje"), greyed out once used.
function nameRow() {
  const names = state.content.chat.names;
  return h(
    'div',
    { class: 'status-row status-row--name' },
    h('dt', { text: t('Postać') }),
    h(
      'dd',
      {},
      h('span', { class: 'status-name', text: state.character.name }),
      h('button', {
        type: 'button',
        class: 'button button--world button--small status-rename',
        disabled: !state.character.canRename,
        text: state.character.canRename ? names.change : names.used,
        onClick: openNameChange,
      }),
    ),
  );
}

// The skin tone of the portrait: a free change, like the look.
function skinRow() {
  const dots = skinSwatches(state.character.skin, async (skin, dot) => {
    let done = false;
    await withButton(dot, async () => {
      await call('POST', '/api/character/skin', { skin });
      done = true;
    });
    return done;
  });
  return h(
    'div',
    { class: 'status-row status-row--skin' },
    h('dt', { id: 'skin-label', text: t('Kolor skóry') }),
    h('dd', {}, h('div', { class: 'skin-swatches', role: 'radiogroup', 'aria-labelledby': 'skin-label' }, dots)),
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
        ? h('span', { class: 'status-ok', text: t('Połączone') })
        : h(
            'a',
            { class: 'google-button google-button--small', href: '/api/auth/google/start?mode=link', onClick: confirmGoogleOnly },
            h('img', { class: 'google-logo', src: '/google-g.svg', alt: '', width: 18, height: 18 }),
            t('Połącz z Google'),
          ),
    ),
  );
}

// "Wymiana" (screens/trade.js): whether the player takes trades, and the
// players it takes none from, each with "Odblokuj". From the Społeczność on.
function tradeRows() {
  if (!isUnlocked('community')) return null;
  let off = false;
  const toggle = h('button', { type: 'button', class: 'toggle', role: 'switch', 'aria-labelledby': 'trade-label', 'aria-checked': 'false', disabled: true, text: '…' });
  const blocked = h('div', { class: 'status-row status-row--trade-blocked', hidden: true });
  const show = (settings) => {
    off = settings.off;
    toggle.disabled = false;
    toggle.setAttribute('aria-checked', String(!off));
    toggle.textContent = off ? t('Wyłączona') : t('Włączona');
    blocked.hidden = settings.blocked.length === 0;
    fill(
      blocked,
      h('dt', { text: t('Zablokowane wymiany') }),
      h(
        'dd',
        {},
        h(
          'ul',
          { class: 'trade-blocked' },
          settings.blocked.map((entry) =>
            h(
              'li',
              {},
              h('span', { text: entry.name }),
              h('button', {
                type: 'button',
                class: 'button button--world button--small',
                text: t('Odblokuj'),
                onClick: (event) => withButton(event.currentTarget, async () => show(await call('POST', '/api/trade/block', { user: entry.user, blocked: false }))),
              }),
            ),
          ),
        ),
      ),
    );
  };
  toggle.addEventListener('click', () => withButton(toggle, async () => show(await call('POST', '/api/trade/settings', { off: !off }))));
  call('GET', '/api/trade/settings').then(show, () => {
    toggle.textContent = t('brak połączenia');
  });
  return [h('div', { class: 'status-row' }, h('dt', { id: 'trade-label', text: t('Wymiana') }), h('dd', {}, toggle)), blocked];
}

// "Pomijaj objaśnienia narratora" (the account's, so for each of its
// characters and on every device): the narrator passes each of its chapters
// as their "Pomiń objaśnienie" does, and a new character starts as after
// "Pomiń wprowadzenie" (narrator.js, src/server/tutorial.js). Turned on, it
// passes at once what the narrator is telling now. The line under it says
// what it does (data/tutorial.json, skipSetting).
function tutorialsRow() {
  const setting = state.content.tutorial.skipSetting;
  const toggle = h('button', { type: 'button', class: 'toggle', role: 'switch', 'aria-labelledby': 'tutorials-label', 'aria-describedby': 'tutorials-hint' });
  const show = () => {
    const on = Boolean(state.user.skipTutorials);
    toggle.setAttribute('aria-checked', String(on));
    toggle.textContent = on ? t('Włączone') : t('Wyłączone');
  };
  toggle.addEventListener('click', () =>
    withButton(toggle, async () => {
      const { skip } = await call('POST', '/api/tutorial/settings', { skip: !state.user.skipTutorials });
      state.user = { ...state.user, skipTutorials: skip };
      show();
      if (skip) passTold();
    }),
  );
  show();
  return h(
    'div',
    { class: 'status-row status-row--hinted' },
    h('dt', { id: 'tutorials-label', text: setting.label }),
    h('dd', {}, toggle),
    h('dd', { class: 'status-hint', id: 'tutorials-hint', text: setting.hint }),
  );
}

// "Kółko czatu" (782 C): the round chat button over the game on this
// device (chat-bubble.js), which dragging it onto its × turns off. Not on a
// computer with the chat's column, where there is no button.
function chatBubbleRow() {
  if (!isUnlocked('community') || !$('#side').hidden) return null;
  const toggle = h('button', { type: 'button', class: 'toggle', role: 'switch', 'aria-labelledby': 'chat-bubble-label', 'aria-describedby': 'chat-bubble-hint' });
  const show = () => {
    const on = chatBubbleOn();
    toggle.setAttribute('aria-checked', String(on));
    toggle.textContent = on ? t('Włączone') : t('Wyłączone');
  };
  toggle.addEventListener('click', () => {
    setChatBubbleOn(!chatBubbleOn());
    show();
  });
  show();
  return h(
    'div',
    { class: 'status-row status-row--hinted' },
    h('dt', { id: 'chat-bubble-label', text: t('Kółko czatu') }),
    h('dd', {}, toggle),
    h('dd', { class: 'status-hint', id: 'chat-bubble-hint', text: t('Okrągły przycisk czatu nad grą. Przesuń go palcem w inne miejsce przy krawędzi ekranu albo upuść na ×, żeby go schować.') }),
  );
}

// An account with test mode opens only with Google once linked, so the
// player is asked first.
async function confirmGoogleOnly(event) {
  if (!state.user.testMode) return;
  event.preventDefault();
  const { href } = event.currentTarget;
  const sure = await confirmAction({
    title: t('Połączyć z Google?'),
    text: t('To konto ma tryb testowy. Po połączeniu otworzy się już tylko przez Google, bez hasła, a na innych urządzeniach się wyloguje.'),
    confirmLabel: t('Połącz'),
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
        testToggle.textContent = testModeOn() ? t('Włączony') : t('Wyłączony');
        current?.screen.update?.();
      },
      text: testModeOn() ? t('Włączony') : t('Wyłączony'),
    });
  openSheet(
    h('h2', { class: 'sheet-title', text: t('Ustawienia') }),
    // The reports and System messages: the Dziennik has no tab in the bottom
    // bar.
    h('a', { class: 'button button--world settings-journal', href: '#/dziennik', onClick: closeSheet }, icon('book', { size: 20 }), t('Dziennik')),
    // "Zmień postać" above "Zgłoś błąd", not at the bottom (the author,
    // 7.11.2026: "Daj przycisk Zmień postać nad Zgłoś błąd zamiast na samym
    // dole").
    h('button', { type: 'button', class: 'button button--world', onClick: changeCharacter, text: t('Zmień postać') }),
    h('button', { type: 'button', class: 'button button--world', onClick: openBugReport, text: t('Zgłoś błąd') }),
    h(
      'dl',
      { class: 'status-list' },
      // PL | EN, where the server offers English (i18n.js).
      languageRow(),
      layoutOffered() && layoutRow(),
      h('div', { class: 'status-row' }, h('dt', { text: t('Konto') }), h('dd', { text: state.user.login })),
      emailRow(),
      nameRow(),
      lookRow(),
      skinRow(),
      googleRow(),
      // The game's Discord server, by its invite link (discord.js).
      discordRow(),
      musicRows(),
      volumeRow('effects-volume', t('Efekty dźwiękowe'), effectsVolume(), setEffectsVolume, () => playSound('system')),
      h('div', { class: 'status-row' }, h('dt', { id: 'voice-label', text: t('Głos narratora') }), h('dd', {}, voiceSwitch('voice-label'))),
      tutorialsRow(),
      h('div', { class: 'status-row' }, h('dt', { id: 'motion-label', text: t('Animacje') }), h('dd', {}, motionSwitch('motion-label'))),
      chatBubbleRow(),
      pushRow(),
      tradeRows(),
      zoomOffered() && zoomRow(),
      testToggle && h('div', { class: 'status-row' }, h('dt', { id: 'test-mode-label', text: t('Tryb testowy') }), h('dd', {}, testToggle)),
      giftCodeRow(),
      h('div', { class: 'status-row' }, h('dt', { text: t('Dokumenty') }), h('dd', {}, legalLinks())),
      h('div', { class: 'status-row' }, h('dt', { text: t('Wersja gry') }), version),
    ),
    state.user.tutorialTests && h('button', { type: 'button', class: 'button button--system', onClick: openTutorialTests, text: t('Testuj samouczki') }),
    state.user.tutorialTests && h('button', { type: 'button', class: 'button button--system', onClick: openEventTests, text: t('Testuj zdarzenia') }),
    state.user.tutorialTests && state.character && h('button', { type: 'button', class: 'button button--system', onClick: () => openEvolutionTests().catch((error) => toast(error.message)), text: t('Testuj ewolucję') }),
    state.user.tutorialTests && state.character && h('button', { type: 'button', class: 'button button--system', onClick: openSettlementTests, text: t('Testuj Osadę') }),
    installButton(),
    state.user.author &&
      h('a', {
        class: `button button--system${state.user.bugReports > 0 ? ' settings-author--news' : ''}`,
        href: '#/autor',
        onClick: closeSheet,
        text: state.user.bugReports > 0 ? t('Panel autora · nowe zgłoszenia: {count}', { count: state.user.bugReports }) : t('Panel autora'),
      }),
    h('button', { type: 'button', class: 'button button--world', onClick: logout, text: t('Wyloguj się') }),
    h('button', { type: 'button', class: 'button button--danger', onClick: deleteCharacter, text: t('Usuń postać') }),
    h('button', { type: 'button', class: 'button button--danger', onClick: deleteAccount, text: t('Usuń konto') }),
  );
  request('GET', '/api/health')
    .then((health) => {
      version.textContent = health.version;
    })
    .catch(() => {
      version.textContent = t('brak połączenia');
    });
}

// "Język" (490–497 A): PL | EN for the account, where the server offers
// English; the page loads again in the language chosen (i18n.js).
function languageRow() {
  const choice = languageSwitch({ labelledBy: 'language-label', signedIn: true });
  if (!choice) return null;
  return h('div', { class: 'status-row status-row--language' }, h('dt', { id: 'language-label', text: t('Język') }), h('dd', {}, choice));
}

// "Zgłoś błąd" (the author: "Trzeba dodac przycisk Zgłoś błąd i zeby
// przychodzil mi w Panel Autora"): what went wrong, in the player's words;
// the server adds the game's version and the character, and this the screen
// the player was on under the settings. A screenshot may go with it
// (screenshot.js), and then the report goes as a form.
function openBugReport() {
  const screen = location.hash;
  const text = h('textarea', { class: 'bug-text', id: 'bug-text', rows: '6', maxlength: '2000', placeholder: t('Np. po stuknięciu „Wyrusz” ekran przestał reagować.') });
  const shot = screenshotPicker();
  const report = async () => {
    const image = await shot.image();
    if (!image) return { text: text.value, screen };
    const form = new FormData();
    form.append('text', text.value);
    form.append('screen', screen);
    form.append('image', image, 'zrzut-ekranu.jpg');
    return form;
  };
  openSheet(
    h('h2', { class: 'sheet-title', text: t('Zgłoś błąd') }),
    h('p', { class: 'sheet-text', text: t('Opisz, co się stało i co było wtedy na ekranie. Gra sama dołączy numer wersji, ekran, na którym jesteś, i Twoją postać.') }),
    h('label', { class: 'field-label', for: 'bug-text', text: t('Opis błędu') }),
    text,
    shot.element,
    h(
      'div',
      { class: 'sheet-actions' },
      h('button', { type: 'button', class: 'button button--world', text: t('Anuluj'), onClick: closeSheet }),
      h('button', {
        type: 'button',
        class: 'button button--system',
        text: t('Wyślij'),
        onClick: (event) =>
          withButton(event.currentTarget, async () => {
            await call('POST', '/api/bug-reports', await report());
            closeSheet();
            toast(t('Dzięki! Zgłoszenie trafiło do autora gry.'));
          }),
      }),
    ),
  );
  text.focus();
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
    title: t('Usunąć konto?'),
    text: t('Konto {login} zniknie na zawsze razem ze wszystkimi postaciami, przedmiotami, raportami i obozem. Tego nie da się cofnąć.', { login }),
    confirmLabel: t('Usuń konto'),
    danger: true,
    typed: login,
  });
  if (!sure) return;
  try {
    await request('DELETE', '/api/me', { login });
    stopPush();
    leaveGame();
    toast(t('Konto zostało usunięte.'));
  } catch (error) {
    toast(error.message);
  }
}

// Removes the character after a question; the account stays.
// "Testuj samouczki" on the test version (testing.js): every tutorial from
// its start, in the order the game brings them. The introduction needs a new
// character, so the player's own waits aside until "Wróć do postaci".
async function openTutorialTests() {
  let parked;
  try {
    ({ parked } = await call('GET', '/api/test/tutorials'));
  } catch (error) {
    toast(error.message);
    return;
  }
  const told = Boolean(state.character.tutorial);
  const row = (title, note, run, ready) =>
    h(
      'li',
      { class: 'tutorial-test' },
      h('div', { class: 'tutorial-test-text' }, h('strong', { text: title }), h('span', { class: 'muted', text: note })),
      h('button', { type: 'button', class: 'button button--system button--small', text: t('Od nowa'), disabled: !ready, onClick: run }),
    );
  openSheet(
    h('h2', { class: 'sheet-title', text: t('Testuj samouczki') }),
    h('p', { class: 'sheet-text', text: t('Na wersji testowej każdy samouczek zaczniesz tu od początku.') }),
    // With "Pomijaj objaśnienia narratora" on, the narrator passes them too.
    state.user.skipTutorials &&
      h('p', { class: 'sheet-text', text: t('Przełącznik „{label}” jest włączony, więc samouczki miną bez słowa. Wyłącz go w Ustawieniach, żeby je obejrzeć.', { label: state.content.tutorial.skipSetting.label }) }),
    parked && backButton(parked),
    h(
      'ul',
      { class: 'tutorial-tests' },
      row(
        t('Wprowadzenie'),
        parked ? t('Trwa na postaci testowej, {name} czeka z boku.', { name: parked.name }) : t('Nowa postać testowa od pierwszej karty. Twoja postać poczeka z boku.'),
        testIntroduction,
        !parked,
      ),
      row(t('Objaśnienie Społeczności i Szybkiego Polowania'), t('Od 5. poziomu postaci.'), repeatCommunityTour, told && isUnlocked('community')),
      row(t('Objaśnienie Portali'), t('Od 5. poziomu postaci. Pokonane stopnie zostają.'), repeatPortalsTour, told && isUnlocked('portals')),
      row(t('Objaśnienie Umiejętności'), t('Od 10. poziomu klasy. Postać zapomni wybrane umiejętności.'), repeatSkillsTour, told && isUnlocked('skills')),
      row(t('Objaśnienie Profesji'), t('Od 10. poziomu postaci. Poziomy profesji zostają.'), repeatProfessionsTour, told && Boolean(state.character.professions)),
      row(t('Objaśnienie Rzemieślnictwa'), t('Od 15. poziomu postaci. Poziomy profesji zostają.'), repeatCraftingTour, told && Boolean(state.character.professions?.workshop)),
      row(t('Objaśnienie Osady'), t('Od 20. poziomu postaci.'), repeatSettlementTour, told && Boolean(state.character.settlementOpen)),
      row(t('Objaśnienie Górnictwa i Jubilerstwa'), t('Od 25. poziomu postaci. Poziomy profesji zostają.'), repeatMiningTour, told && isUnlocked('mining')),
      row(t('Objaśnienie Ewolucji'), t('Od 50. poziomu klasy, dopóki ewolucja nie jest wybrana.'), repeatEvolutionTour, told && (state.character.evolution?.choices.length ?? 0) > 0),
      row(t('Objaśnienie Wież'), t('Od 50. poziomu postaci.'), repeatTowersTour, told && isUnlocked('towers')),
      // The lines of places (646, 647 and those of 6.11.2026), each told on
      // its first look; the Gildia's all together.
      row(t('Gildia'), t('W gildii, przy pierwszym spojrzeniu na jej stronę i na każdą jej zakładkę.'), repeatGuildTour, told && Boolean(state.character.guildTag)),
      row(t('Warownia'), t('Gdy obóz jest Warownią, przy wejściu do obozu.'), repeatFortressTour, told && Boolean(state.character.camp?.cornerstone?.fortress?.stands)),
      row(t('Kamień węgielny'), t('Po objaśnieniu Osady, przy wejściu do obozu, dopóki obóz nie jest Warownią.'), repeatCornerstoneTour, told && Boolean(state.character.settlementOpen && state.character.camp?.cornerstone?.fortress && !state.character.camp.cornerstone.fortress.stands)),
      row(t('Drużyna'), t('Od 10. poziomu postaci, przy wejściu do Społeczności.'), repeatPartyTour, told && isUnlocked('party')),
      row(t('Trudna wyprawa'), t('Od 10. poziomu postaci, przy wejściu na miejsce wyprawy.'), repeatHardHuntTour, told && Boolean(state.character.hardHunt)),
      row(t('Skrzynia Konta'), t('Przy wejściu do Skrzyni Konta w obozie.'), repeatAccountChestTour, told),
      row(t('Porażka'), t('Przy pierwszym raporcie z wyprawy zakończonej porażką.'), repeatFaintTour, told),
    ),
  );
}

// "Testuj zdarzenia" on the test version (testing.js): the event chosen
// here comes at the end of the next exploration that ends as planned,
// without the draw, in the case chosen with it or in a drawn one, or with
// an ending of an option chosen (in a case that leads to it).
async function openEventTests() {
  let data;
  try {
    data = await call('GET', '/api/test/events');
  } catch (error) {
    toast(error.message);
    return;
  }
  const choose = (eventId, caseId = null, endingId = null) => async (event) => {
    await withButton(event.currentTarget, async () => {
      const { next } = await call('POST', '/api/test/events', { eventId, caseId, endingId });
      toast(next ? t('Zdarzenie przyjdzie po następnej wyprawie, przy „Odbierz raport”.') : t('Zdarzenia znów losują się jak w grze.'));
      closeSheet();
    });
  };
  const chosen = (eventId, caseId, endingId) =>
    data.next?.eventId === eventId && (endingId ? data.next.endingId === endingId : data.next.caseId === caseId && !data.next.endingId);
  const pick = (eventId, caseId, text, endingId = null) =>
    h('button', {
      type: 'button',
      class: 'button button--system button--small',
      text: chosen(eventId, caseId, endingId) ? t('{text} (wybrane)', { text }) : text,
      disabled: chosen(eventId, caseId, endingId),
      onClick: choose(eventId, caseId, endingId),
    });
  openSheet(
    h('h2', { class: 'sheet-title', text: t('Testuj zdarzenia') }),
    h('p', {
      class: 'sheet-text',
      text: t('Wybrane zdarzenie przyjdzie po następnej wyprawie, gdy dotkniesz „Odbierz raport”, bez losowania. Możesz też wybrać, co się w nim naprawdę dzieje. Wyprawa musi się skończyć bez porażki.'),
    }),
    h(
      'ul',
      { class: 'tutorial-tests' },
      data.events.map((event) =>
        h(
          'li',
          { class: 'tutorial-test event-test' },
          h('div', { class: 'tutorial-test-text' }, h('strong', { text: event.draft ? t('{title} (szkic)', { title: event.title }) : event.title }), data.next?.eventId === event.id && h('span', { class: 'muted', text: t('Czeka na następny raport.') })),
          h('div', { class: 'event-test-cases' }, [
            pick(event.id, null, t('Losowo')),
            ...event.cases.map((one) => pick(event.id, one.id, one.name)),
            ...event.endings.map((one) => pick(event.id, null, one.name, one.id)),
          ]),
        ),
      ),
    ),
    data.next && h('button', { type: 'button', class: 'button button--world', text: t('Bez wybranego zdarzenia'), onClick: choose(null) }),
  );
}

// "Testuj Osadę" on the test version (settlement.js): the Osada below its
// level, every brotherhood and resident at one standing, new orders on the
// whole board at once, and the Targowisko's trial offers and their end.
async function openSettlementTests() {
  let standings;
  try {
    ({ standings } = await call('GET', '/api/test/settlement'));
  } catch (error) {
    toast(error.message);
    return;
  }
  const run = (body, message, hash = '#/osada') => (event) =>
    withButton(event.currentTarget, async () => {
      await call('POST', '/api/test/settlement', body);
      closeSheet();
      toast(message);
      navigate(hash);
    });
  const unlock = unlockInfo('settlement');
  openSheet(
    h('h2', { class: 'sheet-title', text: t('Testuj Osadę') }),
    h('p', {
      class: 'sheet-text',
      text: t('Na wersji testowej ustawisz tu naraz stopień u wszystkich bractw i mieszkańców. „Nowe zlecenia” zmienia od razu wszystkie zlecenia na tablicy, a oddane zlecenie tygodnia wraca.'),
    }),
    !isUnlocked('settlement') &&
      h('button', { type: 'button', class: 'button button--world', text: t('Otwórz Osadę przed {level}. poziomem', { level: unlock.level }), onClick: run({ action: 'open' }, t('Osada otwarta do testu.')) }),
    h(
      'div',
      { class: 'settlement-test-standings' },
      standings.map((standing) =>
        h('button', {
          type: 'button',
          class: 'button button--system button--small',
          text: standing.name,
          onClick: run({ action: 'standing', standing: standing.id }, t('Stopień „{name}” u wszystkich bractw i mieszkańców.', { name: standing.name })),
        }),
      ),
    ),
    h('button', { type: 'button', class: 'button button--system', text: t('Nowe zlecenia'), onClick: run({ action: 'orders' }, t('Na tablicy wiszą nowe zlecenia.')) }),
    h('p', {
      class: 'sheet-text',
      text: t('Targowisko: „Próbne oferty” wystawiają przedmiot, zioła i materiał od handlarza próbnego na 15 minut, a wędrowny handlarz przychodzi dziś. „Zakończ licytacje” kończy od razu Twoje oferty i oferty handlarza próbnego.'),
    }),
    h(
      'div',
      { class: 'settlement-test-standings' },
      h('button', { type: 'button', class: 'button button--system button--small', text: t('Próbne oferty'), onClick: run({ action: 'market' }, t('Na Targowisku czekają próbne oferty.'), '#/osada/market') }),
      h('button', { type: 'button', class: 'button button--system button--small', text: t('Zakończ licytacje'), onClick: run({ action: 'marketEnd' }, t('Licytacje zakończone.'), '#/osada/market') }),
    ),
  );
}

const backButton = (parked) =>
  h('button', { type: 'button', class: 'button button--world', text: t('Wróć do postaci {name}', { name: parked.name }), onClick: backFromTest });

async function testIntroduction() {
  const sure = await confirmAction({
    title: t('Wprowadzenie od nowa?'),
    text: t('{name} poczeka z boku. Stworzysz postać testową i przejdziesz wprowadzenie od pierwszej karty. Potem w „Testuj samouczki” wybierz „Wróć do postaci {name}”, a postać testowa zniknie.', { name: state.character.name }),
    confirmLabel: t('Zacznij'),
  });
  if (!sure) return;
  closeSheet();
  try {
    await call('POST', '/api/test/introduction');
    await characterGone();
  } catch (error) {
    toast(error.message);
  }
}

async function backFromTest() {
  closeSheet();
  try {
    await call('POST', '/api/test/back');
    await characterGone();
  } catch (error) {
    toast(error.message);
  }
}

// On the creation screen of the test version: the way back to the character
// that waits aside, when one does.
async function offerBack(container) {
  try {
    const { parked } = await call('GET', '/api/test/tutorials');
    if (parked) container.append(h('div', { class: 'create-back' }, backButton(parked)));
  } catch {
    // Without it the account makes the test character as usual.
  }
}

// Test mode: the narrator's Umiejętności chapter from the start (testing.js).
async function repeatSkillsTour() {
  const sure = await confirmAction({
    title: t('Objaśnienie Umiejętności od nowa?'),
    text: t('Postać zapomni wybrane umiejętności, a Punkty Umiejętności wrócą. Narrator objaśni Umiejętności od początku.'),
    confirmLabel: t('Od nowa'),
  });
  if (!sure) return;
  closeSheet();
  try {
    await call('POST', '/api/test/skills-tour');
    forgetPart('skills');
  } catch (error) {
    toast(error.message);
  }
}

// Test mode: the narrator's Profesje chapter from the start (testing.js).
async function repeatCraftingTour() {
  const sure = await confirmAction({
    title: t('Objaśnienie Rzemieślnictwa od nowa?'),
    text: t('Poziomy profesji zostaną. Narrator objaśni Rzemieślnictwo od początku.'),
    confirmLabel: t('Od nowa'),
  });
  if (!sure) return;
  closeSheet();
  try {
    await call('POST', '/api/test/crafting-tour');
    forgetPart('crafting');
  } catch (error) {
    toast(error.message);
  }
}

async function repeatProfessionsTour() {
  const sure = await confirmAction({
    title: t('Objaśnienie Profesji od nowa?'),
    text: t('Poziomy profesji zostaną. Narrator objaśni Profesje od początku.'),
    confirmLabel: t('Od nowa'),
  });
  if (!sure) return;
  closeSheet();
  try {
    await call('POST', '/api/test/professions-tour');
    forgetPart('professions');
  } catch (error) {
    toast(error.message);
  }
}

// Test mode: the narrator's Społeczność chapter from the start (testing.js).
async function repeatCommunityTour() {
  const sure = await confirmAction({
    title: t('Objaśnienie Społeczności od nowa?'),
    text: t('Narrator objaśni Społeczność i Szybkie Polowanie od początku.'),
    confirmLabel: t('Od nowa'),
  });
  if (!sure) return;
  closeSheet();
  try {
    await call('POST', '/api/test/community-tour');
    forgetPart('community');
  } catch (error) {
    toast(error.message);
  }
}

// Test mode: the narrator's Osada chapter from the start (testing.js).
async function repeatSettlementTour() {
  const sure = await confirmAction({
    title: t('Objaśnienie Osady od nowa?'),
    text: t('Narrator objaśni Osadę od początku.'),
    confirmLabel: t('Od nowa'),
  });
  if (!sure) return;
  closeSheet();
  try {
    await call('POST', '/api/test/settlement-tour');
    forgetPart('settlement');
  } catch (error) {
    toast(error.message);
  }
}

// Test mode: the narrator's Ewolucja chapter from the start (testing.js).
async function repeatEvolutionTour() {
  const sure = await confirmAction({
    title: t('Objaśnienie Ewolucji od nowa?'),
    text: t('Narrator objaśni Ewolucję od początku.'),
    confirmLabel: t('Od nowa'),
  });
  if (!sure) return;
  closeSheet();
  try {
    await call('POST', '/api/test/evolution-tour');
    forgetPart('evolution');
  } catch (error) {
    toast(error.message);
  }
}

// Test mode: the narrator's Wieże chapter from the start (testing.js).
async function repeatTowersTour() {
  const sure = await confirmAction({
    title: t('Objaśnienie Wież od nowa?'),
    text: t('Narrator objaśni Wieże od początku.'),
    confirmLabel: t('Od nowa'),
  });
  if (!sure) return;
  closeSheet();
  try {
    await call('POST', '/api/test/towers-tour');
    forgetPart('towers');
  } catch (error) {
    toast(error.message);
  }
}

// Test mode: the narrator's Portale chapter from the start (testing.js).
async function repeatPortalsTour() {
  const sure = await confirmAction({
    title: t('Objaśnienie Portali od nowa?'),
    text: t('Narrator objaśni Portale od początku.'),
    confirmLabel: t('Od nowa'),
  });
  if (!sure) return;
  closeSheet();
  try {
    await call('POST', '/api/test/portals-tour');
    forgetPart('portals');
  } catch (error) {
    toast(error.message);
  }
}

// Test mode: the narrator's Górnictwo and Jubilerstwo chapter from the start
// (testing.js).
async function repeatMiningTour() {
  const sure = await confirmAction({
    title: t('Objaśnienie Górnictwa i Jubilerstwa od nowa?'),
    text: t('Narrator objaśni Górnictwo i Jubilerstwo od początku.'),
    confirmLabel: t('Od nowa'),
  });
  if (!sure) return;
  closeSheet();
  try {
    await call('POST', '/api/test/mining-tour');
    forgetPart('mining');
  } catch (error) {
    toast(error.message);
  }
}

// Test mode: the narrator's lines about the Gildia, its tabs and its
// Wyprawa, from the start (testing.js).
async function repeatGuildTour() {
  const sure = await confirmAction({
    title: t('Objaśnienia Gildii od nowa?'),
    text: t('Narrator powie o zakładkach Gildii przy następnym spojrzeniu na jej stronę, a o każdej zakładce przy pierwszym spojrzeniu na nią.'),
    confirmLabel: t('Od nowa'),
  });
  if (!sure) return;
  closeSheet();
  try {
    await call('POST', '/api/test/guild-tour');
    forgetPart('guild');
  } catch (error) {
    toast(error.message);
  }
}

// Test mode: the narrator's card about the Warownia from the start
// (testing.js).
async function repeatFortressTour() {
  const sure = await confirmAction({
    title: t('Warownia od nowa?'),
    text: t('Narrator powie o Warowni przy następnym wejściu do obozu.'),
    confirmLabel: t('Od nowa'),
  });
  if (!sure) return;
  closeSheet();
  try {
    await call('POST', '/api/test/fortress-tour');
    forgetPart('fortress');
  } catch (error) {
    toast(error.message);
  }
}

// Test mode: the narrator's line about the Kamień węgielny from the start
// (testing.js).
async function repeatCornerstoneTour() {
  const sure = await confirmAction({
    title: t('Kamień węgielny od nowa?'),
    text: t('Narrator powie o Kamieniu węgielnym przy następnym wejściu do obozu.'),
    confirmLabel: t('Od nowa'),
  });
  if (!sure) return;
  closeSheet();
  try {
    await call('POST', '/api/test/cornerstone-tour');
    forgetPart('cornerstone');
  } catch (error) {
    toast(error.message);
  }
}

// Test mode: the narrator's line about the Drużyna from the start
// (testing.js).
async function repeatPartyTour() {
  const sure = await confirmAction({
    title: t('Drużyna od nowa?'),
    text: t('Narrator powie o Drużynie przy następnym wejściu do Społeczności.'),
    confirmLabel: t('Od nowa'),
  });
  if (!sure) return;
  closeSheet();
  try {
    await call('POST', '/api/test/party-tour');
    forgetPart('party');
  } catch (error) {
    toast(error.message);
  }
}

// Test mode: the narrator's line about the Trudna wyprawa from the start
// (testing.js).
async function repeatHardHuntTour() {
  const sure = await confirmAction({
    title: t('Trudna wyprawa od nowa?'),
    text: t('Narrator powie o Trudnej wyprawie przy następnym wejściu na miejsce wyprawy.'),
    confirmLabel: t('Od nowa'),
  });
  if (!sure) return;
  closeSheet();
  try {
    await call('POST', '/api/test/hard-hunt-tour');
    forgetPart('hard-hunt');
  } catch (error) {
    toast(error.message);
  }
}

// Test mode: the narrator's line about the Skrzynia Konta from the start
// (testing.js).
async function repeatAccountChestTour() {
  const sure = await confirmAction({
    title: t('Skrzynia Konta od nowa?'),
    text: t('Narrator powie o Skrzyni Konta przy następnym wejściu do niej.'),
    confirmLabel: t('Od nowa'),
  });
  if (!sure) return;
  closeSheet();
  try {
    await call('POST', '/api/test/account-chest-tour');
    forgetPart('account-chest');
  } catch (error) {
    toast(error.message);
  }
}

// Test mode: the narrator's line about a faint from the start (testing.js).
async function repeatFaintTour() {
  const sure = await confirmAction({
    title: t('Porażka od nowa?'),
    text: t('Narrator powie o porażce przy następnym raporcie z wyprawy zakończonej porażką.'),
    confirmLabel: t('Od nowa'),
  });
  if (!sure) return;
  closeSheet();
  try {
    await call('POST', '/api/test/faint-tour');
    forgetPart('faint');
  } catch (error) {
    toast(error.message);
  }
}

// "Usuń postać" (the author: "Dodaj też opcję »Usuń postać«, bo jest tylko
// »Usuń konto«"; it was "Zacznij od nowa"): the character being played goes
// for good after its name is typed in, as the login is for the account.
async function deleteCharacter() {
  let others = 0;
  try {
    others = (await call('GET', '/api/characters')).characters.length - 1;
  } catch (error) {
    toast(error.message);
    return;
  }
  const { name } = state.character;
  const sure = await confirmAction({
    title: t('Usunąć postać?'),
    text: t('{name} zniknie na zawsze razem z przedmiotami, złotem i raportami. Tego nie da się cofnąć. {then}', {
      name,
      then: others > 0 ? t('Konto i inne postacie zostają, a zaraz potem wybierzesz postać albo stworzysz nową.') : t('Konto zostaje, a zaraz potem stworzysz nową postać.'),
    }),
    confirmLabel: t('Usuń postać'),
    danger: true,
    typed: name,
  });
  if (!sure) return;
  try {
    await call('DELETE', '/api/character');
    await characterGone();
  } catch (error) {
    toast(error.message);
  }
}

// The character is gone from the game (removed or waiting aside): the game
// starts again from the account, with a new character or the one back.
async function characterGone(landing = HOME) {
  clearInterval(ticker);
  current?.screen.unmount?.();
  current = null;
  state.character = null;
  narrate();
  history.replaceState(null, '', landing);
  // The way back of the reports and screens starts anew too.
  lastMainHash = HOME;
  lastMainTab = 'walka';
  lastTabHash = HOME;
  await enterGame();
}

function leaveGame() {
  closeSheet();
  // The parchments of quests and of the e-mail go with the game (the code
  // review: they stayed over the login screen).
  showQuests(false);
  hideInvite();
  clearInterval(ticker);
  current?.screen.unmount?.();
  current = null;
  state.user = null;
  state.character = null;
  state.freshReport = null;
  forgetNews();
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
  drawAuthLanguage();
  setMusicPlace([]);
  drawInstall();
  show('auth');
  request('GET', '/api/health')
    .then((health) => {
      for (const element of $$('[data-version]')) element.textContent = health.version;
      state.googleLogin = health.google === true;
      // Where no new accounts are made, only the login form stays.
      $('#auth-modes').hidden = health.registration === false;
      drawGoogleHint();
    })
    .catch(() => {});
}

function drawInstall() {
  fill($('#install-slot'), installBlock());
}

function drawGoogleHint() {
  const hint = state.googleLogin ? googleHint() : null;
  $('#google-block').hidden = !state.googleLogin || hint !== null;
  $('#google-hint').textContent = hint ?? '';
  $('#google-hint').hidden = hint === null;
}

function setAuthMode(mode) {
  for (const button of $$('[data-auth-mode]')) {
    button.setAttribute('aria-pressed', String(button.dataset.authMode === mode));
  }
  $('#login-form').hidden = mode !== 'login';
  $('#register-form').hidden = mode !== 'register';
  // The registration form has a choice of its own ("Język gry").
  $('#auth-language').hidden = mode === 'register' || !englishOffered();
}

// The choices of language on the login screen, where the server offers
// English (i18n.js): PL | EN under the login form, which loads the page
// again, and the "Język gry" of the registration form, the page's own
// language at first. The account is made in the language picked there,
// and the page turns to it at once, keeping what was typed.
function drawAuthLanguage() {
  const switchSlot = $('#auth-language');
  const choice = languageSwitch();
  fill(switchSlot, choice);
  switchSlot.hidden = !choice || !$('#register-form').hidden;
  const field = $('#register-language-field');
  const value = $('#register-language-value');
  field.hidden = !englishOffered();
  value.disabled = field.hidden;
  value.value = language();
  fill(
    $('#register-language'),
    LANGUAGES.map((id) =>
      h('button', {
        type: 'button',
        class: 'segmented-option',
        lang: id,
        'aria-pressed': String(id === language()),
        text: LANGUAGE_NAMES[id],
        onClick: () => pickAuthLanguage(id),
      }),
    ),
  );
}

// The registration form's language picked: the login screen in it, with
// the texts the code writes there drawn again.
let pickingLanguage = false;
async function pickAuthLanguage(id) {
  if (pickingLanguage) return;
  pickingLanguage = true;
  try {
    if (!(await pickLanguage(id))) return;
  } finally {
    pickingLanguage = false;
  }
  drawAuthLanguage();
  $('#register-language [aria-pressed="true"]')?.focus();
  for (const toggle of $$('.password-toggle')) {
    setPasswordVisible(toggle, document.getElementById(toggle.getAttribute('aria-controls')).type === 'text');
  }
  // A message shown before stays in the language it came in: gone.
  for (const box of $$('#view-auth .form-error')) box.hidden = true;
  drawInstall();
  drawGoogleHint();
}

function setPasswordVisible(toggle, visible) {
  const input = document.getElementById(toggle.getAttribute('aria-controls'));
  input.type = visible ? 'text' : 'password';
  toggle.textContent = visible ? t('Ukryj') : t('Pokaż');
  toggle.setAttribute('aria-label', visible ? t('Ukryj hasło') : t('Pokaż hasło'));
}

function bindForm(form, submit) {
  const errorBox = $('.form-error', form);
  const button = $('button[type="submit"]', form);
  // The labels as index.html writes them, shown in the page's language.
  const idleLabel = button.textContent.trim();
  form.addEventListener('input', () => {
    errorBox.hidden = true;
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    button.disabled = true;
    button.textContent = t(button.dataset.busyLabel);
    try {
      const { user } = await submit(Object.fromEntries(new FormData(form)));
      form.reset();
      // The account's language, or the one picked on this screen for it.
      await followAccount(user);
      state.user = user;
      await enterGame({ choose: true });
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = t(idleLabel);
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
  // "Mam co najmniej 16 lat" (age.js).
  const answer = await request('POST', '/api/auth/register', { ...data, adult: data.adult === 'on' });
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
enableHold();
start();

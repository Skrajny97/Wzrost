// The round chat button over the game on a phone (782 C, the author
// 10.11.2026: „783.4 wariant C ale niech można będzie przesuwać to kółko
// jak dymek messengera albo schować aż do samych ustawień”). A tap opens
// the Czat on a screen of its own (screens/chat.js). It stands by the right
// edge over the bottom bar; dragged with a finger it follows the finger
// and, let go, sticks to the nearer side edge at the height it was let go,
// which the device remembers. Dragged onto the × that shows at the bottom
// while it moves, it hides until "Kółko czatu" is turned on again in the
// Ustawienia (app.js), or until a tap on the small chat tab that stands
// meanwhile under the players online by the right edge (online.js; the
// author, 11.11.2026, after a player could not find a hidden one: „wrzucić
// trzeba gdzieś opcję czatu na główny ekran, może dodatkowo pod ilość
// graczy online, żeby wskoczył dymek”), which brings it back popping in at
// its place. It lights when the chat has something new
// (chat-news.js); the Społeczność tab does not light for the chat any more,
// which is no part of it (the author: „tylko z zakładki”). It is not there on
// a computer with the chat's column (side.js), before the narrator has told
// the chat's rules, on the Czat itself, nor while the narrator points at a
// place on the screen, which it could cover.

import { anyMentionNews, chatNews, onChatNews } from './chat-news.js';
import { $, h, icon } from './dom.js';
import { t } from './i18n.js';
import { isUnlocked, state } from './state.js';
import { toast } from './ui.js';

const SHOWN_KEY = 'insight.chat-bubble';
const PLACE_KEY = 'insight.chat-bubble-place';
const SIZE = 52;
const EDGE = 10;
// How far a finger moves before a tap becomes a drag.
const DRAG = 8;
// How close to the × the button's middle comes to hide it there.
const BIN_REACH = 56;

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Without storage the choice lasts until the page is closed.
  }
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// Whether the player keeps the button (the Ustawienia's "Kółko czatu").
export const chatBubbleOn = () => read(SHOWN_KEY) !== 'off';

export function setChatBubbleOn(on) {
  write(SHOWN_KEY, on ? null : 'off');
  updateChatBubble();
}

// Where the button stands: the side edge and the height, 0 at the top of
// its room and 1 at the bottom.
function savedPlace() {
  try {
    const kept = JSON.parse(read(PLACE_KEY));
    if ((kept?.side === 'left' || kept?.side === 'right') && kept.y >= 0 && kept.y <= 1) return kept;
  } catch {
    // The usual place, then.
  }
  return { side: 'right', y: 1 };
}

// The room the button stands in: under the top bar, over the bottom bar.
function room() {
  const top = ($('#topbar')?.getBoundingClientRect().bottom ?? 0) + 8;
  const bars = [...document.querySelectorAll('#menu .nav')].filter((bar) => !bar.hidden).map((bar) => bar.getBoundingClientRect().top);
  const floor = bars.length ? Math.min(...bars) : window.innerHeight;
  return { top, bottom: Math.max(top, floor - 8 - SIZE), width: document.documentElement.clientWidth };
}

let shown = null; // { button, bin, dragged } while the button is there
let place = null;
let back = null; // the tab that brings a hidden button back, while it is there

function stand() {
  // A finger moving the button keeps it where the finger is.
  if (!shown || shown.dragged()) return;
  place ??= savedPlace();
  const { top, bottom, width } = room();
  shown.button.style.top = `${Math.round(top + (bottom - top) * place.y)}px`;
  shown.button.style.left = `${place.side === 'left' ? EDGE : width - SIZE - EDGE}px`;
}

function light() {
  const news = chatNews();
  if (back) {
    back.classList.toggle('chat-back--news', news);
    back.setAttribute('aria-label', news ? t('Przywróć kółko czatu, nowe wiadomości') : t('Przywróć kółko czatu'));
  }
  if (!shown) return;
  shown.button.classList.toggle('chat-bubble--news', news);
  // A tag waiting says so (data/chat.json, mentions.texts.news).
  const tag = news && anyMentionNews() ? state.content?.chat?.mentions?.texts.news : null;
  shown.button.setAttribute('aria-label', tag ? `${t('Czat')}, ${tag}` : news ? t('Czat, nowe wiadomości') : t('Czat'));
}

// The middles of the button and the × within reach of each other.
function overBin() {
  const a = shown.button.getBoundingClientRect();
  const b = shown.bin.getBoundingClientRect();
  return Math.hypot(a.left + a.width / 2 - (b.left + b.width / 2), a.top + a.height / 2 - (b.top + b.height / 2)) < BIN_REACH;
}

function open() {
  location.hash = '#/czat';
}

function show() {
  const button = h('button', { type: 'button', class: 'chat-bubble', 'aria-label': t('Czat') }, icon('chat', { size: 26 }), h('span', { class: 'chat-bubble-dot', 'aria-hidden': 'true' }));
  const bin = h('div', { class: 'chat-bubble-bin', 'aria-hidden': 'true', hidden: true }, icon('close', { size: 22 }));
  let drag = null;
  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    // No text selection or dragging of the icon starts under the finger.
    event.preventDefault();
    const rect = button.getBoundingClientRect();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: event.clientX - rect.left, dy: event.clientY - rect.top, moving: false };
    button.setPointerCapture?.(event.pointerId);
  });
  button.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (!drag.moving && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG) return;
    if (!drag.moving) {
      drag.moving = true;
      button.classList.add('chat-bubble--dragging');
      bin.hidden = false;
    }
    button.style.left = `${clamp(event.clientX - drag.dx, 0, document.documentElement.clientWidth - SIZE)}px`;
    button.style.top = `${clamp(event.clientY - drag.dy, 0, window.innerHeight - SIZE)}px`;
    bin.classList.toggle('chat-bubble-bin--near', overBin());
  });
  const end = (event, cancelled) => {
    if (!drag || event.pointerId !== drag.id) return;
    const { moving } = drag;
    drag = null;
    button.classList.remove('chat-bubble--dragging');
    if (!moving) {
      if (!cancelled) open();
      return;
    }
    const hide = !cancelled && overBin();
    bin.hidden = true;
    bin.classList.remove('chat-bubble-bin--near');
    if (hide) {
      setChatBubbleOn(false);
      toast(t('Kółko czatu schowane. Wróci po dotknięciu dymka przy prawej krawędzi ekranu.'));
      return;
    }
    const rect = button.getBoundingClientRect();
    const { top, bottom, width } = room();
    place = { side: rect.left + SIZE / 2 < width / 2 ? 'left' : 'right', y: bottom > top ? clamp((rect.top - top) / (bottom - top), 0, 1) : 1 };
    write(PLACE_KEY, JSON.stringify(place));
    stand();
  };
  button.addEventListener('pointerup', (event) => end(event, false));
  button.addEventListener('pointercancel', (event) => end(event, true));
  button.addEventListener('dragstart', (event) => event.preventDefault());
  // Enter or Space on the button (a tap is told by pointerup above).
  button.addEventListener('click', (event) => {
    if (event.detail === 0) open();
  });
  document.body.append(bin, button);
  shown = { button, bin, dragged: () => Boolean(drag?.moving) };
  stand();
  light();
}

function hide() {
  if (!shown) return;
  shown.button.remove();
  shown.bin.remove();
  shown = null;
}

// A tap on the tab: the button is back, popping in at its place.
function bringBack() {
  setChatBubbleOn(true);
  if (!shown) return;
  shown.button.classList.add('chat-bubble--back');
  shown.button.focus({ preventScroll: true });
}

// The tab under the players online (#edge-tabs, online.js) while the
// button is hidden.
function showBack(wanted) {
  const edge = $('#edge-tabs');
  if (wanted && edge && !back) {
    back = h('button', { type: 'button', class: 'chat-back', onClick: bringBack }, icon('chat', { size: 16 }), h('span', { class: 'chat-back-dot', 'aria-hidden': 'true' }));
    edge.append(back);
  } else if (!wanted && back) {
    back.remove();
    back = null;
  }
}

// The narrator pointing at a place on the screen (narrator.js), which the
// button could stand over.
const narratorPoints = () => Boolean(document.querySelector('.guide'));
// The Czat has the chat right there.
const chatInSight = () => location.hash === '#/czat';
// The narrator tells the chat's rules in his Społeczność chapter, on the
// Czat, where he takes the player from the Społeczność's tabs (narrator.js);
// a character made before his introduction has no list of his lines.
const rulesTold = () => !state.character?.tutorial || state.character.tutorial.includes('community-rules');

// The button as the game wants it now (app.js calls it with the side column).
export function updateChatBubble() {
  // Where the button may stand; turned off, its tab stands there instead.
  const allowed =
    Boolean(state.character) &&
    !$('#view-game')?.hidden &&
    Boolean($('#side')?.hidden) &&
    isUnlocked('community') &&
    rulesTold() &&
    !chatInSight() &&
    !narratorPoints();
  const wanted = allowed && chatBubbleOn();
  showBack(allowed && !chatBubbleOn());
  if (wanted && !shown) show();
  else if (!wanted && !shown?.dragged()) hide();
  else stand();
  light();
}

onChatNews(light);
window.addEventListener('hashchange', updateChatBubble);
window.addEventListener('resize', stand);
// The narrator's pointing comes and goes as an element of the page's body.
if (typeof MutationObserver === 'function') new MutationObserver(updateChatBubble).observe(document.body, { childList: true });

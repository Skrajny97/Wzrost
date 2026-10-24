// The narrator's introduction for a new character (data/tutorial.json), line
// by line in its order:
// - a card is parchment the narrator reads: it unrolls before the words and
//   rolls up after them,
// - a pointer shows the narrator alone beside one lit place, says its line
//   and waits for "Dalej",
// - a tap shows the narrator beside the one place to tap.
// Around a pointer and a tap the rest of the screen waits under a shade.
// Cards and pointers are read once and the server keeps them
// (src/server/tutorial.js), so a reload or another device goes on from
// there; a tap is done when the game has moved on. "Pomiń wprowadzenie" ends
// the whole introduction.

import { narratorSprite } from './art.js';
import { $, fill, h } from './dom.js';
import { playSound } from './sound.js';
import { activityFinished, call, isUnlocked, state } from './state.js';
import { toast } from './ui.js';

const running = () => Boolean(state.character.activity) && !activityFinished(state.character.activity);
const finished = () => activityFinished(state.character.activity);
// Before the first exploration: nothing earned yet and nothing under way.
const firstTrip = (read) => !state.character.activity && state.character.level === 1 && state.character.xp === 0 && !read.has('report');
const freePoints = () => state.character.freePoints > 0 && isUnlocked('stats');
const campStarted = () => Boolean(state.character.camp.construction) || state.character.camp.buildings.some((building) => building.level > 0);
const onReport = (hash) => hash.startsWith('#/raport/');
const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function affordable(buildingId) {
  const building = state.character.camp.buildings.find((candidate) => candidate.id === buildingId);
  const have = { gold: state.character.gold, ...state.character.resources };
  return Boolean(building?.next) && Object.entries(building.next.cost).every(([id, amount]) => (have[id] ?? 0) >= amount);
}

// When each line shows (`hash` is the screen's address, `read` the lines
// read) and, for a pointer or a tap, its place: a data-guide mark or a
// selector. A line shows when it is the first in the order that is due.
const BEATS = {
  intro: { when: () => true },
  time: { when: () => true },
  'tap-region': { guide: 'region-windfalls', when: (hash, read) => hash === '#/walka' && firstTrip(read) },
  'tap-area': { guide: 'area-windfalls-edge', when: (hash, read) => hash === '#/walka/windfalls' && firstTrip(read) },
  'tap-start': { guide: 'start', when: (hash, read) => hash === '#/walka/windfalls/windfalls-edge' && firstTrip(read) },
  skip: { when: (hash) => hash.startsWith('#/walka') && running() },
  'tap-skip': { guide: 'skip-activity', when: (hash, read) => hash.startsWith('#/walka') && running() && !read.has('report') },
  'tap-claim': { guide: 'claim', when: (hash, read) => hash.startsWith('#/walka') && finished() && !read.has('report') },
  report: { when: onReport },
  'report-summary': { guide: 'report-summary', when: onReport },
  'report-system': { guide: 'report-system', when: onReport },
  'report-fights': { guide: 'report-fights', when: onReport },
  'report-items': { guide: 'report-items', when: onReport },
  'report-account': { guide: 'report-account', when: onReport },
  'tap-character': {
    selector: '.nav-item[href="#/postac"]',
    when: (hash, read) => read.has('report') && !read.has('character') && !hash.startsWith('#/postac'),
  },
  character: { when: (hash) => hash === '#/postac' },
  'tap-stats': {
    selector: '.nav-item[href="#/postac/statystyki"]',
    when: (hash, read) => hash === '#/postac' && read.has('character') && !read.has('camp') && freePoints(),
  },
  'tap-points': {
    guide: 'auto-points',
    when: (hash, read) => hash === '#/postac/statystyki' && read.has('character') && !read.has('camp') && freePoints(),
  },
  'tap-camp': {
    selector: '.camp-button',
    when: (hash, read) => read.has('character') && !read.has('camp') && !freePoints() && !hash.startsWith('#/oboz'),
  },
  camp: { when: (hash) => hash === '#/oboz' },
  'camp-sawmill': { guide: 'plot-sawmill', when: (hash) => hash === '#/oboz' && !campStarted() },
  'tap-plot': { guide: 'plot-campfire', when: (hash, read) => hash === '#/oboz' && read.has('camp') && !campStarted() && affordable('campfire') },
  'tap-build': {
    guide: 'build',
    when: (hash, read) => hash === '#/oboz/campfire' && read.has('camp') && !campStarted() && affordable('campfire'),
  },
  'camp-countdown': { guide: 'build-countdown', when: (hash) => hash.startsWith('#/oboz') && campStarted() },
  ending: { when: (hash, read) => read.has('camp') && (campStarted() || !affordable('campfire')) },
};

let place = '#/walka';
let scroll = null; // the open card: { dialog, sheet, line, busy, rolling }
let light = null; // { line, target, root, frame, tapped } while a place is lit
let waiting = null; // the timer looking for the place of the next line

// Called after every screen is drawn and every change of the character.
export function narrate(hash = place) {
  place = hash;
  const read = state.character?.tutorial;
  if (!read || read.includes('ending') || !state.content?.tutorial) {
    stopLight();
    return;
  }
  // An open card goes on by itself.
  if (scroll) return;
  const line = nextLine();
  if (!line) stopLight();
  else if (line.kind === 'card') {
    stopLight();
    openCard(line);
  } else lightUp(line);
}

// The first line in the order that is due: a tap whenever its moment holds,
// a card or a pointer only until it is read.
function nextLine() {
  const read = new Set(state.character.tutorial);
  return state.content.tutorial.lines.find((line) => (line.kind === 'tap' || !read.has(line.id)) && BEATS[line.id]?.when(place, read));
}

// A line is read as soon as it is passed: the page counts it at once, and
// the server keeps it.
function markRead(id) {
  if (!state.character.tutorial.includes(id)) state.character.tutorial = [...state.character.tutorial, id];
  call('POST', '/api/tutorial', { card: id }).catch(() => {});
}

function skipAll() {
  closeCard();
  stopLight();
  state.character.tutorial = state.content.tutorial.lines.filter((line) => line.kind !== 'tap').map((line) => line.id);
  call('POST', '/api/tutorial', { skip: true })
    .then(() => toast('Wprowadzenie pominięte.'))
    .catch((error) => toast(error.message));
}

const words = (line) => line.text.map((text) => text.replaceAll('{points}', String(state.content.tutorial.startTimePoints)));

// The card: the figure above a scroll between two rods.
function openCard(line) {
  const dialog = h('dialog', { class: 'narrator', 'aria-labelledby': 'narrator-label' });
  // Escape passes the card, like "Dalej".
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    next();
  });
  const sheet = h('div', { class: 'narrator-sheet' });
  dialog.append(
    h('div', { class: 'narrator-art' }, narratorSprite()),
    h(
      'div',
      { class: 'narrator-scroll' },
      h('div', { class: 'narrator-rod', 'aria-hidden': 'true' }),
      sheet,
      h('div', { class: 'narrator-rod', 'aria-hidden': 'true' }),
    ),
  );
  document.body.append(dialog);
  scroll = { dialog, sheet, line, busy: true, rolling: null };
  write(line);
  dialog.showModal();
  playSound('open');
  roll(true).then(() => {
    if (scroll) scroll.busy = false;
  });
}

function write(line) {
  const tutorial = state.content.tutorial;
  fill(
    scroll.sheet,
    h(
      'div',
      { class: 'narrator-page' },
      h('p', { class: 'narrator-label', id: 'narrator-label', text: 'Narrator' }),
      h('div', { class: 'narrator-text' }, words(line).map((text) => h('p', { text }))),
      h(
        'div',
        { class: 'narrator-actions' },
        line.id !== 'ending' && h('button', { type: 'button', class: 'narrator-skip', text: tutorial.skipLabel, onClick: skipAll }),
        h('button', { type: 'button', class: 'button narrator-next', text: tutorial.nextLabel, onClick: next }),
      ),
    ),
  );
}

// "Dalej": the scroll rolls up, and unrolls again for the next card, or the
// game goes on.
async function next() {
  if (!scroll || scroll.busy) return;
  scroll.busy = true;
  markRead(scroll.line.id);
  await roll(false);
  if (!scroll) return;
  const after = state.character.tutorial.includes('ending') ? null : nextLine();
  if (after?.kind === 'card') {
    scroll.line = after;
    write(after);
    await roll(true);
    if (scroll) scroll.busy = false;
    return;
  }
  closeCard();
  narrate();
}

// The parchment between the rods grows from nothing to its height, or back.
async function roll(open) {
  const sheet = scroll?.sheet;
  if (!sheet) return;
  if (!calm()) {
    scroll.rolling?.cancel();
    const frames = open ? [{ height: '0px' }, { height: `${sheet.scrollHeight}px` }] : [{ height: `${sheet.offsetHeight}px` }, { height: '0px' }];
    const animation = sheet.animate(frames, {
      duration: open ? 700 : 380,
      easing: open ? 'cubic-bezier(0.2, 0.7, 0.2, 1)' : 'cubic-bezier(0.5, 0, 0.8, 0.4)',
      fill: 'forwards',
    });
    scroll.rolling = animation;
    try {
      await animation.finished;
    } catch {
      // Cancelled by the next roll or by closing.
    }
    // Unrolled, the parchment takes its natural height again.
    if (open && scroll?.rolling === animation) {
      animation.cancel();
      scroll.rolling = null;
    }
  }
  if (open) $('.narrator-next', sheet)?.focus();
}

function closeCard() {
  if (!scroll) return;
  scroll.rolling?.cancel();
  if (scroll.dialog.open) scroll.dialog.close();
  scroll.dialog.remove();
  scroll = null;
}

// The light: four shades around the place, which take every other tap, a
// ring around it and the narrator with the line in a bubble beside it. A tap
// on the shade nudges the ring.
function lightUp(line) {
  if (light?.line === line && light.target.isConnected) return;
  stopLight();
  let tries = 0;
  const look = () => {
    waiting = null;
    const target = find(line);
    if (target && !target.hidden && target.getClientRects().length > 0) {
      startLight(line, target);
      return;
    }
    // The screen may still be drawing.
    if (++tries < 20) {
      waiting = setTimeout(look, 100);
      return;
    }
    // A pointer at a place this screen does not have is passed over.
    if (line.kind === 'point') {
      markRead(line.id);
      narrate();
    }
  };
  look();
}

function find(line) {
  const beat = BEATS[line.id];
  return beat.selector ? $(beat.selector) : $(`[data-guide="${beat.guide}"]`);
}

function startLight(line, target) {
  const tutorial = state.content.tutorial;
  const shades = [0, 1, 2, 3].map(() => h('div', { class: 'guide-shade', onClick: nudge }));
  const ring = h('div', { class: 'guide-ring', 'aria-hidden': 'true' });
  const pointer = line.kind === 'point';
  const onward = () => {
    stopLight();
    markRead(line.id);
    narrate();
  };
  const bubble = h(
    'div',
    { class: 'guide-bubble', role: 'status' },
    words(line).map((text) => h('p', { text })),
    pointer && h('button', { type: 'button', class: 'button guide-next', text: tutorial.nextLabel, onClick: onward }),
  );
  const note = h('div', { class: 'guide-note' }, narratorSprite(), bubble);
  const skip = h('button', { type: 'button', class: 'guide-skip', text: tutorial.skipLabel, onClick: skipAll });
  const root = h('div', { class: 'guide' }, shades, ring, note, skip);
  document.body.append(root);
  target.scrollIntoView({ block: 'center' });
  light = { line, target, root, frame: 0 };
  if (pointer) $('.guide-next', bubble).focus({ preventScroll: true });

  // A tap on the place itself goes through to the game; after a tap the
  // next line follows the screen or the character it changes.
  const tapped = (event) => {
    if (!pointer && light?.target.contains(event.target)) {
      stopLight();
      setTimeout(() => narrate(), 700);
    }
  };
  document.addEventListener('click', tapped, true);
  light.tapped = tapped;

  const follow = () => {
    if (!light) return;
    if (!light.target.isConnected) {
      // Drawn anew: the same place on the new screen, if it is still there.
      const again = find(line);
      if (!again) {
        stopLight();
        narrate();
        return;
      }
      light.target = again;
    }
    const rect = light.target.getBoundingClientRect();
    const pad = 6;
    const top = Math.max(0, rect.top - pad);
    const bottom = rect.bottom + pad;
    const left = Math.max(0, rect.left - pad);
    const right = rect.right + pad;
    const [above, below, before, after] = shades;
    Object.assign(above.style, { top: '0', left: '0', right: '0', height: `${top}px` });
    Object.assign(below.style, { top: `${bottom}px`, left: '0', right: '0', bottom: '0' });
    Object.assign(before.style, { top: `${top}px`, left: '0', width: `${left}px`, height: `${bottom - top}px` });
    Object.assign(after.style, { top: `${top}px`, left: `${right}px`, right: '0', height: `${bottom - top}px` });
    Object.assign(ring.style, { top: `${top}px`, left: `${left}px`, width: `${right - left}px`, height: `${bottom - top}px` });
    // The narrator stands below the place, or above it when there is more
    // room there; it never leaves the screen.
    const height = note.offsetHeight;
    const gap = 14;
    const roomBelow = window.innerHeight - bottom - gap;
    const underneath = roomBelow >= height || roomBelow >= top - gap;
    note.classList.toggle('guide-note--below', underneath);
    note.classList.toggle('guide-note--above', !underneath);
    const limit = window.innerHeight - height - 8;
    if (underneath) Object.assign(note.style, { top: `${Math.max(8, Math.min(bottom + gap, limit))}px`, bottom: '' });
    else Object.assign(note.style, { top: '', bottom: `${Math.max(8, Math.min(window.innerHeight - top + gap, limit))}px` });
    // The bubble's tail points at the middle of the place.
    const box = bubble.getBoundingClientRect();
    const middle = (rect.left + rect.right) / 2 - box.left;
    bubble.style.setProperty('--tail-x', `${Math.min(box.width - 18, Math.max(18, middle))}px`);
    light.frame = requestAnimationFrame(follow);
  };
  follow();

  function nudge() {
    ring.classList.remove('guide-ring--nudge');
    // Restarts the animation.
    void ring.offsetWidth;
    ring.classList.add('guide-ring--nudge');
  }
}

function stopLight() {
  clearTimeout(waiting);
  waiting = null;
  if (!light) return;
  cancelAnimationFrame(light.frame);
  document.removeEventListener('click', light.tapped, true);
  light.root.remove();
  light = null;
}

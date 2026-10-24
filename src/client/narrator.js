// The narrator's introduction for a new character (data/tutorial.json): cards
// on parchment read by an ethereal narrator, and at the first steps a light on
// the one place to tap, while the rest of the screen waits under a shade. A
// card shows once, and the server keeps the cards read (src/server/tutorial.js),
// so a reload or another device goes on from there. "Dalej" passes a card, and
// "Pomiń wprowadzenie" the whole introduction.

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

function affordable(buildingId) {
  const building = state.character.camp.buildings.find((candidate) => candidate.id === buildingId);
  const have = { gold: state.character.gold, ...state.character.resources };
  return Boolean(building?.next) && Object.entries(building.next.cost).every(([id, amount]) => (have[id] ?? 0) >= amount);
}

// When a card shows: `hash` is the screen's address and `read` the cards read
// or about to be shown. The first two open the game; the last one follows the
// first building in the camp.
const CARDS = {
  intro: () => true,
  time: (hash, read) => read.has('intro'),
  skip: (hash) => hash.startsWith('#/walka') && running(),
  report: (hash) => hash.startsWith('#/raport/'),
  character: (hash) => hash === '#/postac',
  camp: (hash) => hash === '#/oboz',
  ending: (hash, read) => read.has('camp') && (campStarted() || !affordable('campfire')),
};

// The place to tap at each first step: a data-guide mark or a selector. The
// hint under the light is in data/tutorial.json (hints).
const STEPS = [
  { id: 'region', guide: 'region-windfalls', when: (hash, read) => hash === '#/walka' && firstTrip(read) },
  { id: 'area', guide: 'area-windfalls-edge', when: (hash, read) => hash === '#/walka/windfalls' && firstTrip(read) },
  { id: 'start', guide: 'start', when: (hash, read) => hash === '#/walka/windfalls/windfalls-edge' && firstTrip(read) },
  { id: 'skip', guide: 'skip-activity', when: (hash, read) => hash.startsWith('#/walka') && running() && !read.has('report') },
  { id: 'claim', guide: 'claim', when: (hash, read) => hash.startsWith('#/walka') && finished() && !read.has('report') },
  {
    id: 'character',
    selector: '.nav-item[href="#/postac"]',
    when: (hash, read) => read.has('report') && !read.has('character') && !hash.startsWith('#/postac'),
  },
  {
    id: 'stats',
    selector: '.nav-item[href="#/postac/statystyki"]',
    when: (hash, read) => hash === '#/postac' && read.has('character') && !read.has('camp') && freePoints(),
  },
  { id: 'points', guide: 'auto-points', when: (hash, read) => hash === '#/postac/statystyki' && read.has('character') && !read.has('camp') && freePoints() },
  {
    id: 'camp',
    selector: '.camp-button',
    when: (hash, read) => read.has('character') && !read.has('camp') && !freePoints() && !hash.startsWith('#/oboz'),
  },
  { id: 'plot', guide: 'plot-campfire', when: (hash, read) => hash === '#/oboz' && read.has('camp') && !campStarted() && affordable('campfire') },
  { id: 'build', guide: 'build', when: (hash, read) => hash === '#/oboz/campfire' && read.has('camp') && !campStarted() && affordable('campfire') },
];

let place = '#/walka';
let dialog = null; // the open card
let light = null; // { step, target, root, frame } while a place is lit
let waiting = null; // the timer looking for the place of the next step

// Called after every screen is drawn and every change of the character.
export function narrate(hash = place) {
  place = hash;
  const read = state.character?.tutorial;
  if (!read || read.includes('ending') || !state.content?.tutorial) {
    stopLight();
    return;
  }
  if (dialog) return;
  const known = new Set(read);
  const cards = state.content.tutorial.cards.filter((card) => {
    if (known.has(card.id) || !CARDS[card.id]?.(place, known)) return false;
    known.add(card.id);
    return true;
  });
  if (cards.length > 0) {
    stopLight();
    showCards(cards);
    return;
  }
  const step = STEPS.find((candidate) => candidate.when(place, new Set(read)));
  if (step) lightUp(step);
  else stopLight();
}

// A card is read as soon as it is passed: the page counts it at once, and the
// server keeps it.
function markRead(id) {
  if (!state.character.tutorial.includes(id)) state.character.tutorial = [...state.character.tutorial, id];
  call('POST', '/api/tutorial', { card: id }).catch(() => {});
}

function skipAll() {
  closeCards();
  stopLight();
  state.character.tutorial = state.content.tutorial.cards.map((card) => card.id);
  call('POST', '/api/tutorial', { skip: true })
    .then(() => toast('Wprowadzenie pominięte.'))
    .catch((error) => toast(error.message));
}

const withPoints = (line) => line.replaceAll('{points}', String(state.content.tutorial.startTimePoints));

function showCards(cards) {
  const tutorial = state.content.tutorial;
  dialog = h('dialog', { class: 'narrator', 'aria-labelledby': 'narrator-label' });
  // Escape passes the card, like "Dalej".
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    next();
  });
  document.body.append(dialog);
  let index = 0;

  function render() {
    const card = cards[index];
    fill(
      dialog,
      h(
        'div',
        { class: 'narrator-card' },
        h('div', { class: 'narrator-art' }, narratorSprite()),
        h('p', { class: 'narrator-label', id: 'narrator-label', text: 'Narrator' }),
        h('div', { class: 'narrator-text' }, card.text.map((line) => h('p', { text: withPoints(line) }))),
        h(
          'div',
          { class: 'narrator-actions' },
          card.id !== 'ending' && h('button', { type: 'button', class: 'narrator-skip', text: tutorial.skipLabel, onClick: skipAll }),
          h('button', { type: 'button', class: 'button narrator-next', text: tutorial.nextLabel, onClick: next }),
        ),
      ),
    );
    $('.narrator-next', dialog).focus();
  }

  function next() {
    if (!dialog) return;
    markRead(cards[index].id);
    index += 1;
    if (index < cards.length) {
      render();
      return;
    }
    closeCards();
    narrate();
  }

  render();
  dialog.showModal();
  playSound('open');
}

function closeCards() {
  if (!dialog) return;
  if (dialog.open) dialog.close();
  dialog.remove();
  dialog = null;
}

// The light: four shades around the place to tap, which take every other tap,
// a ring around it and the hint. A tap on the shade nudges the ring.
function lightUp(step) {
  if (light?.step === step && light.target.isConnected) return;
  stopLight();
  let tries = 0;
  const find = () => (step.selector ? $(step.selector) : $(`[data-guide="${step.guide}"]`));
  const look = () => {
    waiting = null;
    const target = find();
    if (target && !target.hidden && target.getClientRects().length > 0) {
      startLight(step, target);
      return;
    }
    // The screen may still be drawing; a place that never comes is no step.
    if (++tries < 20) waiting = setTimeout(look, 100);
  };
  look();
}

function startLight(step, target) {
  const shades = [0, 1, 2, 3].map(() => h('div', { class: 'guide-shade', onClick: nudge }));
  const ring = h('div', { class: 'guide-ring', 'aria-hidden': 'true' });
  const hint = h('p', { class: 'guide-hint', role: 'status', text: state.content.tutorial.hints[step.id] });
  const skip = h('button', { type: 'button', class: 'guide-skip', text: state.content.tutorial.skipLabel, onClick: skipAll });
  const root = h('div', { class: 'guide' }, shades, ring, hint, skip);
  document.body.append(root);
  target.scrollIntoView({ block: 'center' });
  light = { step, target, root, frame: 0 };

  // A tap on the place itself goes through to the game; the next step
  // follows the screen or the character it changes.
  const tapped = (event) => {
    if (light?.target.contains(event.target)) {
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
      const again = step.selector ? $(step.selector) : $(`[data-guide="${step.guide}"]`);
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
    // The hint goes below the place, or above it when the place is low.
    const low = bottom > window.innerHeight * 0.62;
    hint.classList.toggle('guide-hint--above', low);
    Object.assign(hint.style, low ? { top: '', bottom: `${window.innerHeight - top + 12}px` } : { top: `${bottom + 12}px`, bottom: '' });
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

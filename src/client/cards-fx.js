// Talia Systemu's motion (cards.js), in the look the author chose of the
// three a prototype showed: 895 C „Widowiskowe” (13.11.2026; the author:
// „Potrzebujemy też … animacje w grze w karty”).
//   A card laid flies in a low arc from the reserve to its line and settles
//     there, or back; the cards dealt to the reserve and laid by Szczęsny fly
//     face down from their pile and turn face up in their place.
//   After "Walcz" the round plays on the table as it stood, line by line,
//     the player's card first in each: the two cards of a blow come into
//     focus (they grow a little, the rest of the cards dims, the table's
//     edges darken), the card takes a wind-up, lunges and recoils, and the
//     card hit is thrown back and shakes, with sparks (in the type's colour
//     with a ring at a type's advantage, gold when the hero's skill drove the
//     blow), "−N" popping and drifting, and Życie and its bar draining. The
//     cards beaten crack and fall, the match's last one in slow motion, and
//     the "zbite" counts go up as they land; a Kleryk's card brought back
//     glows gold.
//   The match's end is a scene on the table: Szczęsny's bust, the result,
//     his words and the stake, from which coins fly to the gold in the top
//     bar. The cards won (the starter deck, the card of a tier's first win,
//     a report's cards) turn face up and shine in their rarity's colour, the
//     legendary, mythic and divine ones with a glow round their frame.
// Everything is drawn in code (CSS, the Web Animations API, SVG and a small
// canvas for the sparks) inside the table's box. A tap on the table during
// the motion ends it at once, and the table takes taps again only once it is
// over. With the game's animations off ("Animacje", motion.js) nothing here
// plays: the table changes at once, as cards.js draws it.

import { residentBust } from './art.js';
import { h, icon } from './dom.js';
import { formatNumber, formatShort } from './format.js';
import { t } from './i18n.js';
import { motionOn } from './motion.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
// At most so many sparks at once on the table, so a phone keeps up.
const MAX_SPECKS = 90;
const MAX_COINS = 12;
const RARITIES = ['common', 'rare', 'unique', 'epic', 'legendary', 'mythic', 'divine'];
// The types' colours, as their badges have them (styles.css, .tcard-type).
const TYPE_COLORS = { strength: '#e0835c', dexterity: '#a7c47f', intellect: '#9db7f0' };
const TYPE_SPARKS = {
  strength: ['#ffd2b8', '#e0835c', '#b8502e'],
  dexterity: ['#e8f6c8', '#a7c47f', '#6f9a3a'],
  intellect: ['#e6efff', '#9db7f0', '#5f7fd0'],
};
const HIT_COLOR = '#ef9a85';
const HIT_SPARKS = ['#fff6d8', '#ffd27a', '#ef9a85'];
const GOLD = '#f2c14e';
const GOLD_SPARKS = ['#fff6d8', '#f8e7a0', '#f2c14e'];
const DUST = ['#c9c1b0', '#9b9384', '#6f685b'];

const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const EASE_IN = 'cubic-bezier(0.5, 0, 0.75, 0)';
const EASE_IN_OUT = 'cubic-bezier(0.45, 0, 0.25, 1)';

// The motion's pace, in ms: the gap between blows, a blow's length (and
// `contact`, the share of it at which it lands), a card beaten falling and
// its crack, a card dealt flying and turning, the gap between cards dealt, a
// card laid, and the hero's skill shown.
const PACE = { gap: 340, blow: 400, contact: 0.5, beaten: 470, crack: 130, deal: 280, flip: 220, dealGap: 80, lay: 280, skill: 420 };
// The fall of the match's last card beaten at this share of its pace.
const SLOW = 0.45;

// The sparks' and cracks' own random numbers (mulberry32), so the motion
// takes none of the page's Math.random (Szczęsny's words after a match).
let seed = 0x2f6b1d;
function random() {
  seed = (seed + 0x6d2b79f5) | 0;
  let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}
const between = (low, high) => low + random() * (high - low);
const centre = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
const now = () => performance.now();

// One sequence of motion (a round, a deal), which a tap ends at once: its
// animations finished, its waits over, nothing new started.
function createRun() {
  let skipped = false;
  const animations = new Set();
  const timers = new Map();
  const cleanups = [];
  return {
    get skipped() {
      return skipped;
    },
    animate(element, keyframes, options) {
      if (skipped || !element?.animate) return null;
      const animation = element.animate(keyframes, options);
      animations.add(animation);
      const done = () => animations.delete(animation);
      animation.finished.then(done, done);
      return animation;
    },
    wait(ms) {
      if (skipped || !(ms > 0)) return Promise.resolve();
      return new Promise((resolve) => {
        const id = setTimeout(() => {
          timers.delete(id);
          resolve();
        }, ms);
        timers.set(id, resolve);
      });
    },
    // Until the animations (or promises) given end, or the run is skipped.
    all(list) {
      return Promise.all(list.filter(Boolean).map((one) => Promise.resolve(one.finished ?? one).catch(() => {})));
    },
    later(fn) {
      cleanups.push(fn);
    },
    skip() {
      if (skipped) return;
      skipped = true;
      for (const animation of [...animations]) {
        try {
          animation.finish();
        } catch {
          animation.cancel();
        }
      }
      for (const [id, resolve] of timers) {
        clearTimeout(id);
        resolve();
      }
      timers.clear();
    },
    close() {
      for (const fn of cleanups.splice(0).reverse()) {
        try {
          fn();
        } catch {
          // A leftover of the motion never stops the game.
        }
      }
    },
  };
}

// The part of the screen not under the top bar or the bottom menu.
function visibleBand() {
  const top = Math.max(0, document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0);
  let bottom = window.innerHeight;
  for (const nav of document.querySelectorAll('.nav')) {
    const box = nav.getBoundingClientRect();
    if (box.height > 0 && box.top > window.innerHeight / 2) bottom = Math.min(bottom, box.top);
  }
  return { top, bottom };
}

function union(elements) {
  const boxes = elements.filter(Boolean).map((element) => element.getBoundingClientRect()).filter((box) => box.width > 0 || box.height > 0);
  if (boxes.length === 0) return null;
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  const right = Math.max(...boxes.map((box) => box.right));
  const bottom = Math.max(...boxes.map((box) => box.bottom));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

// The page scrolled so `box` is in sight (its top under the top bar when it
// is taller than the screen), in a short glide with the run's clock.
function reveal(run, box, margin = 10) {
  if (!box) return Promise.resolve();
  const { top, bottom } = visibleBand();
  let delta = 0;
  if (box.height > bottom - top - 2 * margin || box.top < top + margin) delta = box.top - top - margin;
  else if (box.bottom > bottom - margin) delta = box.bottom - bottom + margin;
  delta = Math.max(-window.scrollY, delta);
  if (Math.abs(delta) < 6) return Promise.resolve();
  const start = window.scrollY;
  if (run.skipped) {
    window.scrollTo(0, start + delta);
    return Promise.resolve();
  }
  const duration = Math.min(420, 180 + Math.abs(delta) * 0.35);
  return new Promise((resolve) => {
    const began = now();
    const step = () => {
      const share = run.skipped ? 1 : Math.min(1, (now() - began) / duration);
      window.scrollTo(0, start + delta * (1 - (1 - share) ** 3));
      if (share < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

// The table in sight: all of it where it fits on the screen, else its lines.
function revealTable(run, table) {
  const { top, bottom } = visibleBand();
  const whole = table.getBoundingClientRect();
  return reveal(run, whole.height <= bottom - top - 20 ? whole : union([...table.querySelectorAll('.cards-lines')]));
}

// The last number of an element's text set anew (the "zbite" count as the
// cards land), with a short pulse.
function bumpNumber(run, element, add) {
  if (!element || !add) return;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let last = null;
  while (walker.nextNode()) if (/\d/.test(walker.currentNode.textContent)) last = walker.currentNode;
  if (!last) return;
  last.textContent = last.textContent.replace(/(\d+)(\D*)$/, (whole, digits, rest) => `${Number(digits) + add}${rest}`);
  run.animate(element, [{ opacity: 1 }, { opacity: 0.35, offset: 0.3 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
}

// A card's copy for a flight over the page, its inline looks (the scene, the
// name's size, the bar) carried over through the CSSOM, as the page's
// rules allow no style attributes.
function cloneCard(element) {
  const copy = element.cloneNode(true);
  const from = [element, ...element.querySelectorAll('*')];
  const to = [copy, ...copy.querySelectorAll('*')];
  from.forEach((source, index) => {
    const target = to[index];
    if (!target) return;
    target.removeAttribute('style');
    for (let i = 0; i < source.style.length; i++) {
      const name = source.style[i];
      target.style.setProperty(name, source.style.getPropertyValue(name));
    }
  });
  copy.removeAttribute('data-fx');
  copy.removeAttribute('id');
  copy.setAttribute('aria-hidden', 'true');
  copy.setAttribute('tabindex', '-1');
  copy.classList.remove('cfx-hidden');
  return copy;
}

// The sparks: one canvas over the table, drawn while any fly, on the page's
// clock (performance.now).
function createSparks(layer) {
  const canvas = h('canvas', { class: 'cfx-sparks', 'aria-hidden': 'true' });
  layer.append(canvas);
  const context = canvas.getContext('2d');
  const specks = [];
  let frame = 0;
  let last = 0;
  let size = { width: 0, height: 0, ratio: 1 };
  function fit() {
    const width = layer.clientWidth;
    const height = layer.clientHeight;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    if (width === size.width && height === size.height && ratio === size.ratio) return;
    size = { width, height, ratio };
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
  }
  function tick() {
    const time = now();
    const step = Math.min(0.05, (time - last) / 1000);
    last = time;
    context.setTransform(size.ratio, 0, 0, size.ratio, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    for (let index = specks.length - 1; index >= 0; index--) {
      const speck = specks[index];
      speck.age += step * 1000;
      if (speck.age >= speck.life) {
        specks.splice(index, 1);
        continue;
      }
      speck.vx *= 1 - speck.drag * step;
      speck.vy = speck.vy * (1 - speck.drag * step) + speck.gravity * step;
      speck.x += speck.vx * step;
      speck.y += speck.vy * step;
      const fade = 1 - speck.age / speck.life;
      context.globalAlpha = Math.max(0, Math.min(1, fade * 1.4));
      context.fillStyle = speck.color;
      if (speck.shape === 'streak') {
        context.save();
        context.translate(speck.x, speck.y);
        context.rotate(Math.atan2(speck.vy, speck.vx));
        context.fillRect(-speck.size * 2, -speck.size / 2, speck.size * 4, speck.size);
        context.restore();
      } else context.fillRect(speck.x - speck.size / 2, speck.y - speck.size / 2, speck.size, speck.size);
    }
    context.globalAlpha = 1;
    frame = specks.length > 0 ? requestAnimationFrame(tick) : 0;
    if (!frame) context.clearRect(0, 0, size.width, size.height);
  }
  return {
    // `count` sparks from (x, y) in the layer, flying `angle` ± `spread`.
    burst({ x, y, count, colors, angle = -Math.PI / 2, spread = Math.PI, speed = [70, 180], life = [320, 620], sizes = [1.5, 3], shape = 'spark', gravity = 260, drag = 3 }) {
      fit();
      for (let index = 0; index < count; index++) {
        if (specks.length >= MAX_SPECKS) specks.shift();
        const direction = angle + (random() * 2 - 1) * spread;
        const velocity = between(...speed);
        specks.push({
          x,
          y,
          vx: Math.cos(direction) * velocity,
          vy: Math.sin(direction) * velocity,
          life: between(...life),
          age: 0,
          size: between(...sizes),
          color: colors[Math.floor(random() * colors.length)],
          shape,
          gravity,
          drag,
        });
      }
      if (!frame) {
        last = now();
        frame = requestAnimationFrame(tick);
      }
    },
    stop() {
      cancelAnimationFrame(frame);
      frame = 0;
      specks.length = 0;
    },
  };
}

// A crack over a card beaten: jagged lines from where it was hit.
function crackOver(card, from) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'cfx-crack');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const start = { x: 50 + from.x * 18, y: 42 + from.y * 22 };
  const paths = [];
  for (let index = 0; index < 4; index++) {
    const direction = (index / 4) * Math.PI * 2 + between(-0.5, 0.5);
    let { x, y } = start;
    const points = [`${x.toFixed(1)},${y.toFixed(1)}`];
    for (let step = 0; step < 4; step++) {
      const bend = direction + between(-0.6, 0.6);
      x += Math.cos(bend) * between(9, 16);
      y += Math.sin(bend) * between(9, 16);
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    for (const kind of ['cfx-crack-shade', 'cfx-crack-line']) {
      const path = document.createElementNS(SVG_NS, 'polyline');
      path.setAttribute('points', points.join(' '));
      path.setAttribute('class', kind);
      path.setAttribute('pathLength', '1');
      svg.append(path);
      paths.push(path);
    }
  }
  card.append(svg);
  return { svg, paths };
}

export function createCardsFx(holder) {
  // The sequence playing (a round, a deal), the cards still in flight after
  // a tap, the layers over the page they and the coins fly in, and the gold
  // held in the top bar.
  let run = null;
  let holding = false;
  let swallowUntil = 0;
  let flights = [];
  let fly = null;
  let top = null;
  let goldHold = null;

  // The cards in flight pass under the top bar and the bottom menu, the
  // coins over them, to the gold.
  function flyLayer() {
    if (!fly || !fly.isConnected) {
      fly = h('div', { class: 'cfx-fly', 'aria-hidden': 'true' });
      document.body.append(fly);
    }
    return fly;
  }
  function topLayer() {
    if (!top || !top.isConnected) {
      top = h('div', { class: 'cfx-fly cfx-fly--top', 'aria-hidden': 'true' });
      document.body.append(top);
    }
    return top;
  }

  // While a run plays, the tab takes no taps: the first one ends it.
  const guard = (event) => {
    if (!run && now() > swallowUntil) return;
    if (event.type === 'keydown' && !['Enter', ' ', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (run && (event.type === 'pointerdown' || event.type === 'keydown')) {
      swallowUntil = now() + 450;
      run.skip();
    }
  };
  for (const type of ['pointerdown', 'click', 'keydown']) holder.addEventListener(type, guard, true);

  function begin() {
    run?.skip();
    run?.close();
    run = createRun();
    holding = true;
    holder.dataset.cfxBusy = '';
    return run;
  }

  function finish(current) {
    current.close();
    if (run === current) {
      run = null;
      holding = false;
      delete holder.dataset.cfxBusy;
    }
  }

  // --- The table's layer: numbers, flashes, sparks ---------------------------

  function tableLayer(current, table) {
    const layer = h('div', { class: 'cfx-layer', 'aria-hidden': 'true' });
    table.append(layer);
    const speckles = createSparks(layer);
    current.later(() => {
      speckles.stop();
      layer.remove();
    });
    const box = () => layer.getBoundingClientRect();
    return {
      layer,
      sparks: speckles,
      // A point of the page in the layer's own.
      at(x, y) {
        const own = box();
        return { x: x - own.left, y: y - own.top };
      },
      rect(rect) {
        const own = box();
        return { left: rect.left - own.left, top: rect.top - own.top, width: rect.width, height: rect.height };
      },
      place(element, rect) {
        const own = box();
        element.style.left = `${rect.left - own.left}px`;
        element.style.top = `${rect.top - own.top}px`;
        element.style.width = `${rect.width}px`;
        element.style.height = `${rect.height}px`;
        layer.append(element);
        return element;
      },
    };
  }

  // A blow's number over the card hit: "−N", in the type's colour with its
  // sign at an advantage, gold when the hero's skill drove it, bigger when
  // it beats the card.
  function popNumber(current, stage, card, { damage, type, advantage, boosted, lethal, index, types, strong }) {
    const box = card.getBoundingClientRect();
    const typeInfo = advantage ? types.find((one) => one.id === type) : null;
    const number = h(
      'span',
      { class: ['cfx-num', advantage && `cfx-num--${type}`, boosted && 'cfx-num--boost', lethal && 'cfx-num--lethal'].filter(Boolean).join(' ') },
      typeInfo && icon(typeInfo.icon, { size: 14, className: 'cfx-num-type' }),
      h('span', { text: `−${formatNumber(damage)}` }),
    );
    const side = index === 0 ? 0 : index % 2 ? 1 : -1;
    const point = stage.at(box.left + box.width / 2 + side * box.width * 0.18, box.top + box.height * (0.3 + 0.1 * Math.min(index, 2)));
    number.style.left = `${point.x}px`;
    number.style.top = `${point.y}px`;
    stage.layer.append(number);
    const peak = strong ? 1.25 : 1.12;
    const drift = strong ? -30 : -22;
    const animation = current.animate(
      number,
      [
        { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0 },
        { transform: `translate(-50%, -50%) scale(${peak})`, opacity: 1, offset: 0.16 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.3 },
        { transform: `translate(-50%, calc(-50% + ${drift * 0.6}px)) scale(1)`, opacity: 1, offset: 0.72 },
        { transform: `translate(-50%, calc(-50% + ${drift}px)) scale(0.96)`, opacity: 0 },
      ],
      { duration: strong ? 980 : 860, easing: 'linear', fill: 'forwards' },
    );
    if (!animation) number.remove();
    else animation.finished.then(() => number.remove(), () => number.remove());
  }

  // The card hit flashes in the blow's colour.
  function flash(current, stage, card, color, strength = 0.75) {
    const box = card.getBoundingClientRect();
    const glow = stage.place(h('span', { class: 'cfx-flash' }), box);
    glow.style.setProperty('--cfx-color', color);
    const animation = current.animate(glow, [{ opacity: 0 }, { opacity: strength, offset: 0.25 }, { opacity: 0 }], { duration: 300, easing: 'ease-out', fill: 'forwards' });
    if (!animation) glow.remove();
    else animation.finished.then(() => glow.remove(), () => glow.remove());
  }

  // Życie on the card after a blow, and its bar drained.
  function drain(current, card, life, max) {
    const chip = card.querySelector('.tcard-life');
    if (chip) {
      const text = [...chip.childNodes].reverse().find((node) => node.nodeType === Node.TEXT_NODE);
      if (text) text.textContent = formatNumber(life);
      else chip.append(formatNumber(life));
      current.animate(chip, [{ transform: 'scale(1)' }, { transform: 'scale(1.3)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 260, easing: EASE_OUT });
    }
    if (!max) return;
    let bar = card.querySelector('.tcard-bar');
    let before = 1;
    if (!bar) {
      bar = h('span', { class: 'tcard-bar' }, h('span', { class: 'tcard-bar-fill' }));
      card.append(bar);
    } else {
      const share = parseFloat(bar.querySelector('.tcard-bar-fill')?.style.getPropertyValue('--share') ?? '100');
      before = Number.isFinite(share) ? share / 100 : 1;
    }
    const fill = bar.querySelector('.tcard-bar-fill');
    const kept = card.dataset.cfxShare ? Number(card.dataset.cfxShare) : before;
    const after = Math.max(0, life / max);
    card.dataset.cfxShare = String(after);
    fill.style.setProperty('--share', '100%');
    fill.style.transformOrigin = '0 50%';
    current.animate(fill, [{ transform: `scaleX(${kept})` }, { transform: `scaleX(${after})` }], { duration: 320, easing: EASE_OUT, fill: 'forwards' });
  }

  // The focus on two cards: they grow a little and stay bright, the rest
  // of the cards dims, and the table's edges darken. The cards grow by their
  // own `scale`, so their blows' moves add to it.
  function createFocus(current, table) {
    let cards = [...table.querySelectorAll('.tcard, .tcard-slot')];
    const shade = new Map(cards.map((card) => [card, { opacity: 1, scale: 1 }]));
    // Under the cards (the table's first child), over its slab.
    const vignette = h('span', { class: 'cfx-vignette', 'aria-hidden': 'true' });
    table.prepend(vignette);
    current.later(() => vignette.remove());
    let on = false;
    function lean(x, y, scale, duration, bright) {
      if (!on) current.animate(vignette, [{ opacity: 0 }, { opacity: 1 }], { duration, easing: EASE_IN_OUT, fill: 'forwards' });
      on = true;
      for (const card of cards) {
        const goal = bright.includes(card) ? { opacity: 1, scale } : { opacity: 0.4, scale: 1 };
        const was = shade.get(card);
        if (was.opacity === goal.opacity && was.scale === goal.scale) continue;
        current.animate(card, [{ opacity: was.opacity, scale: `${was.scale}` }, { opacity: goal.opacity, scale: `${goal.scale}` }], { duration, easing: EASE_IN_OUT, fill: 'forwards' });
        shade.set(card, goal);
      }
      return current.wait(duration * 0.6);
    }
    function release(duration = 240) {
      if (!on) return Promise.resolve();
      on = false;
      for (const card of cards) {
        const was = shade.get(card);
        if (was.opacity === 1 && was.scale === 1) continue;
        current.animate(card, [{ opacity: was.opacity, scale: `${was.scale}` }, { opacity: 1, scale: '1' }], { duration, easing: EASE_IN_OUT, fill: 'forwards' });
        shade.set(card, { opacity: 1, scale: 1 });
      }
      current.animate(vignette, [{ opacity: 1 }, { opacity: 0 }], { duration, fill: 'forwards' });
      return current.wait(duration);
    }
    // A card beaten: its own fall has its look from now on.
    function forget(card) {
      cards = cards.filter((one) => one !== card);
      shade.delete(card);
    }
    return { lean, release, forget };
  }

  // --- A card laid, or taken back ------------------------------------------

  function cancelFlights() {
    for (const flight of flights) flight();
    flights = [];
  }

  // Where each card stands now (before a redraw), by side and key.
  function measure() {
    const boxes = new Map();
    for (const element of holder.querySelectorAll('[data-fx]')) boxes.set(element.dataset.fx, element.getBoundingClientRect());
    return boxes;
  }

  // After a redraw: each card that changed its place flies there in a low
  // arc from the old one (from the reserve to its line, or back), as a copy
  // over the page, the card itself shown once it lands and settles.
  function lay(before) {
    if (!motionOn() || run) return;
    cancelFlights();
    for (const element of holder.querySelectorAll('[data-fx]')) {
      const was = before.get(element.dataset.fx);
      if (!was) continue;
      const box = element.getBoundingClientRect();
      const dx = was.left - box.left;
      const dy = was.top - box.top;
      if (Math.abs(dx) + Math.abs(dy) < 4 || box.width === 0) continue;
      const ghost = cloneCard(element);
      ghost.classList.add('cfx-ghost');
      ghost.style.left = `${box.left}px`;
      ghost.style.top = `${box.top}px`;
      flyLayer().append(ghost);
      element.classList.add('cfx-hidden');
      const scale = was.width / Math.max(1, box.width);
      const lift = Math.min(26, 8 + Math.hypot(dx, dy) * 0.06);
      const animation = ghost.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
          { transform: `translate(${dx / 2}px, ${dy / 2 - lift}px) scale(1.07)`, offset: 0.5 },
          { transform: 'translate(0px, 0px) scale(1)' },
        ],
        { duration: PACE.lay, easing: EASE_OUT },
      );
      const land = () => {
        ghost.remove();
        element.classList.remove('cfx-hidden');
      };
      flights.push(() => {
        animation.cancel();
        land();
      });
      animation.finished.then(() => {
        land();
        if (element.isConnected) element.animate([{ transform: 'scale(1.05, 0.95)' }, { transform: 'scale(1)' }], { duration: 160, easing: EASE_OUT });
      }, land);
    }
  }

  // --- Cards dealt, laid by Szczęsny, won ----------------------------------

  // A card's back over the page at `box`, for a deal or a turn.
  function backGhost(box) {
    const ghost = h('span', { class: 'cfx-ghost cfx-card-back' });
    ghost.style.left = `${box.left}px`;
    ghost.style.top = `${box.top}px`;
    ghost.style.width = `${box.width}px`;
    ghost.style.height = `${box.height}px`;
    flyLayer().append(ghost);
    return ghost;
  }

  // A card flies face down from `from` (a pile) to its place and turns face
  // up there; with no pile it turns where it stands. The card itself is
  // hidden until then.
  async function dealCard(current, card, from, { delay = 0, rise = 0, shine = false } = {}) {
    await current.wait(delay);
    if (current.skipped || !card.isConnected) {
      card.classList.remove('cfx-hidden');
      return;
    }
    const box = card.getBoundingClientRect();
    const ghost = backGhost(box);
    current.later(() => ghost.remove());
    if (from) {
      const start = centre(from);
      const end = centre(box);
      const scale = Math.max(0.15, Math.min(1, from.width / Math.max(1, box.width)));
      await current.all([
        current.animate(
          ghost,
          [
            { transform: `translate(${start.x - end.x}px, ${start.y - end.y}px) scale(${scale}) rotate(-8deg)`, opacity: 0.6 },
            { transform: 'translate(0px, 0px) scale(1) rotate(0deg)', opacity: 1 },
          ],
          { duration: PACE.deal, easing: EASE_OUT, fill: 'forwards' },
        ),
      ]);
    } else if (rise) {
      await current.all([current.animate(ghost, [{ transform: `translateY(${rise}px)`, opacity: 0 }, { transform: 'translateY(0px)', opacity: 1 }], { duration: 160, easing: EASE_OUT, fill: 'forwards' })]);
    }
    await current.all([current.animate(ghost, [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: PACE.flip / 2, easing: EASE_IN, fill: 'forwards' })]);
    ghost.remove();
    card.classList.remove('cfx-hidden');
    if (current.skipped || !card.isConnected) return;
    await current.all([current.animate(card, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: PACE.flip / 2, easing: EASE_OUT })]);
    if (shine) await rarityShine(current, card);
  }

  // A card won shines in its rarity's colour, and a legendary, mythic or
  // divine one glows round its frame.
  function rarityShine(current, card) {
    if (current.skipped) return Promise.resolve();
    const rarity = RARITIES.find((id) => card.classList.contains(`tcard--${id}`)) ?? 'common';
    const rank = RARITIES.indexOf(rarity);
    const band = h('span', { class: 'cfx-shine-band' });
    const shine = h('span', { class: 'cfx-shine', 'aria-hidden': 'true' }, band);
    card.append(shine);
    current.later(() => shine.remove());
    const sweeps = [current.animate(band, [{ transform: 'translateX(-130%) skewX(-18deg)' }, { transform: 'translateX(230%) skewX(-18deg)' }], { duration: 620, easing: EASE_IN_OUT, fill: 'forwards' })];
    if (rank >= 4) {
      const aura = h('span', { class: 'cfx-aura', 'aria-hidden': 'true' });
      card.prepend(aura);
      current.later(() => aura.remove());
      sweeps.push(current.animate(
        aura,
        [
          { opacity: 0, transform: 'scale(0.92)' },
          { opacity: 1, transform: 'scale(1.05)', offset: 0.25 },
          { opacity: 0.75, transform: 'scale(1)', offset: 0.55 },
          { opacity: 1, transform: 'scale(1.02)', offset: 0.75 },
          { opacity: 0, transform: 'scale(1)' },
        ],
        { duration: 1500, easing: 'ease-in-out', fill: 'forwards' },
      ));
    }
    return current.all(sweeps);
  }

  // --- The round -------------------------------------------------------------

  // One blow: its two cards come into focus (the match's last blow closer),
  // the card lunges at its target with a wind-up and a recoil, and as it
  // lands the target takes it: its number, a flash, its Życie drained, a
  // knock and sparks.
  async function blow(current, stage, focus, hit, { attacker, target, life, types, count, slow }) {
    const from = centre(attacker.getBoundingClientRect());
    const to = centre(target.getBoundingClientRect());
    const distance = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y));
    const ux = (to.x - from.x) / distance;
    const uy = (to.y - from.y) / distance;
    await focus.lean((from.x + to.x) / 2, (from.y + to.y) / 2, slow ? 1.12 : 1.07, slow ? 260 : 180, [attacker, target]);
    if (current.skipped) return;
    const reach = Math.min(26, distance * 0.17);
    const frames = [
      { transform: 'translate(0px, 0px) scale(1)' },
      { transform: `translate(${-ux * 6}px, ${-uy * 6}px) scale(1.03)`, offset: 0.24 },
      { transform: `translate(${ux * reach}px, ${uy * reach}px) scale(1.06)`, offset: PACE.contact },
      { transform: `translate(${-ux * 3}px, ${-uy * 3}px) scale(1)`, offset: 0.78 },
      { transform: 'translate(0px, 0px) scale(1)' },
    ];
    attacker.classList.add('cfx-raised');
    const moving = current.animate(attacker, frames, { duration: PACE.blow, easing: 'cubic-bezier(0.4, 0, 0.3, 1)' });
    await current.wait(PACE.blow * PACE.contact);
    // The blow lands.
    const other = hit.side === 'me' ? 'foe' : 'me';
    const id = `${other}:${hit.target.key}`;
    const before = life.get(id) ?? { life: 0, max: 0 };
    const after = Math.max(0, before.life - hit.damage);
    life.set(id, { ...before, life: after });
    const lethal = after === 0 && before.life > 0;
    const type = hit.type;
    const color = hit.boosted ? GOLD : hit.advantage ? (TYPE_COLORS[type] ?? HIT_COLOR) : HIT_COLOR;
    if (!current.skipped) {
      popNumber(current, stage, target, { damage: hit.damage, type, advantage: hit.advantage, boosted: hit.boosted, lethal, index: count, types, strong: hit.advantage || hit.boosted || lethal });
      flash(current, stage, target, color, 0.8);
      drain(current, target, after, before.max);
      const knock = hit.advantage || hit.boosted ? 9 : 6;
      const px = -uy;
      const py = ux;
      target.classList.add('cfx-raised');
      current.animate(
        target,
        [
          { transform: 'translate(0px, 0px) rotate(0deg)' },
          { transform: `translate(${ux * knock}px, ${uy * knock}px) rotate(${ux * 2}deg)`, offset: 0.14 },
          { transform: `translate(${-ux * 3 + px * 3}px, ${-uy * 3 + py * 3}px) rotate(${-ux * 1.5}deg)`, offset: 0.34 },
          { transform: `translate(${ux * 2 - px * 2}px, ${uy * 2 - py * 2}px)`, offset: 0.54 },
          { transform: `translate(${-ux}px, ${-uy}px)`, offset: 0.76 },
          { transform: 'translate(0px, 0px) rotate(0deg)' },
        ],
        { duration: 320, easing: 'ease-out' },
      );
      const box = target.getBoundingClientRect();
      const point = stage.at(to.x - ux * box.width * 0.32, to.y - uy * box.height * 0.3);
      stage.sparks.burst({
        x: point.x,
        y: point.y,
        count: hit.advantage || hit.boosted ? 16 : 8,
        colors: hit.boosted ? GOLD_SPARKS : hit.advantage ? (TYPE_SPARKS[type] ?? HIT_SPARKS) : HIT_SPARKS,
        angle: Math.atan2(uy, ux),
        spread: 1.1,
        speed: hit.advantage || hit.boosted ? [110, 260] : [80, 170],
        life: [260, 560],
        shape: 'streak',
        gravity: 200,
      });
      if (hit.advantage || hit.boosted) {
        const ring = h('span', { class: 'cfx-ring' });
        ring.style.setProperty('--cfx-color', color);
        ring.style.left = `${point.x}px`;
        ring.style.top = `${point.y}px`;
        stage.layer.append(ring);
        const grow = current.animate(ring, [{ transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0.95 }, { transform: 'translate(-50%, -50%) scale(1.6)', opacity: 0 }], { duration: 420, easing: EASE_OUT, fill: 'forwards' });
        if (!grow) ring.remove();
        else grow.finished.then(() => ring.remove(), () => ring.remove());
      }
    }
    await current.all([moving]);
    attacker.classList.remove('cfx-raised');
  }

  // The cards beaten crack and fall, the match's last one slowly and in
  // focus, and their side's "zbite" count goes up as each lands; a Kleryk's
  // card brought back glows gold with its Życie.
  async function beatenGo(current, stage, focus, table, { last, after, slowKey }) {
    const counts = { foe: table.querySelector('.cards-table-who .cards-table-count'), me: table.querySelector('.cards-table-count--me') };
    const moves = [];
    let slowOne = null;
    for (const side of ['me', 'foe']) {
      for (const key of last.beaten[side]) {
        const card = table.querySelector(`[data-fx="${side}:${key}"]`);
        if (!card) continue;
        if (`${side}:${key}` === slowKey) {
          slowOne = { side, card };
          continue;
        }
        moves.push({ side, card });
      }
    }
    const fall = async ({ side, card }, tempo = 1, delay = 0) => {
      await current.wait(delay);
      if (current.skipped) return;
      focus.forget(card);
      card.classList.add('cfx-raised');
      const crack = crackOver(card, { x: 0, y: side === 'foe' ? 0.6 : -0.6 });
      current.later(() => crack.svg.remove());
      flash(current, stage, card, '#ffffff', 0.6);
      await current.all(crack.paths.map((path) => current.animate(path, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: PACE.crack / tempo, easing: EASE_OUT, fill: 'forwards' })));
      await current.wait(60 / tempo);
      const box = card.getBoundingClientRect();
      const point = stage.at(box.left + box.width / 2, box.top + box.height * 0.55);
      stage.sparks.burst({ x: point.x, y: point.y, count: 12, colors: DUST, angle: -Math.PI / 2, spread: Math.PI * 0.9, speed: [40, 120], life: [400, 800], sizes: [1.5, 3.5], gravity: 260 });
      const turn = between(8, 16) * (random() < 0.5 ? -1 : 1);
      await current.all([
        current.animate(
          card,
          [
            { transform: 'translate(0px, 0px) rotate(0deg)', opacity: 1 },
            { transform: `translate(0px, -4px) rotate(${turn * 0.15}deg)`, opacity: 1, offset: 0.18 },
            { transform: `translate(${turn * 0.9}px, ${box.height * 0.26}px) rotate(${turn * 0.8}deg) scale(0.94)`, opacity: 0, offset: 0.85 },
            { transform: `translate(${turn}px, ${box.height * 0.3}px) rotate(${turn}deg) scale(0.92)`, opacity: 0 },
          ],
          { duration: PACE.beaten / tempo, easing: EASE_IN, fill: 'forwards' },
        ),
      ]);
      bumpNumber(current, counts[side]?.lastElementChild ?? counts[side], 1);
    };
    await Promise.all(moves.map((move, index) => fall(move, 1, index * 70)));
    if (slowOne) {
      const box = slowOne.card.getBoundingClientRect();
      await focus.lean(box.left + box.width / 2, box.top + box.height / 2, 1.16, 260, [slowOne.card]);
      await fall(slowOne, SLOW);
    }
    // A Kleryk's card back with its Życie.
    if (last.revived !== null && last.revived !== undefined) {
      const card = table.querySelector(`[data-fx="me:${last.revived}"]`);
      const back = after?.me?.lines?.find((one) => one?.key === last.revived);
      if (card && back) {
        flash(current, stage, card, GOLD, 0.9);
        drain(current, card, back.life, back.max);
        const box = card.getBoundingClientRect();
        const point = stage.at(box.left + box.width / 2, box.top + box.height * 0.8);
        stage.sparks.burst({ x: point.x, y: point.y, count: 16, colors: GOLD_SPARKS, angle: -Math.PI / 2, spread: 0.5, speed: [60, 140], life: [500, 900], gravity: -60, drag: 1.5 });
        await current.wait(320);
      }
    }
  }

  // The hero's skill shown before the blows: its card glows gold.
  async function skillShown(current, stage, focus, table, skill) {
    const key = skill.kind === 'swap' ? skill.swap : skill.card;
    const card = table.querySelector(`[data-fx="me:${key}"]`);
    if (!card) return;
    const rest = card.getBoundingClientRect();
    await focus.lean(rest.left + rest.width / 2, rest.top + rest.height / 2, 1.08, 220, [card]);
    const box = card.getBoundingClientRect();
    const halo = stage.place(h('span', { class: 'cfx-halo' }), box);
    current.later(() => halo.remove());
    const chip = card.querySelector('.tcard-chip--skill');
    current.animate(halo, [{ opacity: 0, transform: 'scale(0.9)' }, { opacity: 1, transform: 'scale(1.05)', offset: 0.4 }, { opacity: 0, transform: 'scale(1.12)' }], { duration: 620, easing: EASE_OUT, fill: 'forwards' });
    if (chip) current.animate(chip, [{ transform: 'translateX(-50%) scale(1)' }, { transform: 'translateX(-50%) scale(1.25)', offset: 0.35 }, { transform: 'translateX(-50%) scale(1)' }], { duration: 520, easing: EASE_OUT });
    const point = stage.at(box.left + box.width / 2, box.top + box.height / 2);
    stage.sparks.burst({ x: point.x, y: point.y, count: 18, colors: GOLD_SPARKS, angle: -Math.PI / 2, spread: Math.PI, speed: [60, 150], life: [420, 760], gravity: -40, drag: 2.5 });
    await current.wait(PACE.skill);
  }

  // The match's end as a scene over the table's lines: Szczęsny's bust, the
  // result, his words and the stake (and the day's reward); a win showers
  // gold sparks. Gives the stake's value, where the coins fly from.
  async function endShown(current, stage, table, end) {
    const lines = union([...table.querySelectorAll('.cards-lines')]) ?? table.getBoundingClientRect();
    const title = { won: t('Wygrana!'), lost: t('Przegrana'), drawn: t('Remis') }[end.result];
    const stakeRow =
      end.mode === 'staked'
        ? end.result === 'won'
          ? [t('Za wygraną zgarniasz'), t('+{gold} zł', { gold: formatNumber(end.gold) })]
          : end.result === 'drawn'
            ? [t('Stawka wraca'), t('+{gold} zł', { gold: formatNumber(end.gold) })]
            : [t('Stawka przepada'), t('−{gold} zł', { gold: formatNumber(end.stake) })]
        : [t('Trening'), t('bez stawki i nagród')];
    const rows = [stakeRow, end.daily > 0 && [t('Nagroda dnia'), t('+{gold} zł', { gold: formatNumber(end.daily) })]].filter(Boolean);
    const row = ([label, value]) => h('p', { class: 'cfx-end-row' }, h('span', { text: label }), ' ', h('strong', { text: value }));
    const bust = residentBust('gamehost');
    const scene = h(
      'div',
      { class: `cfx-end cfx-end--${end.result}` },
      h(
        'div',
        { class: 'cfx-end-panel' },
        h('span', { class: 'cfx-end-bust' }, bust),
        h('p', { class: 'cfx-end-name', text: t('Szczęsny') }),
        h('p', { class: 'cfx-end-title', text: title }),
        end.words && h('p', { class: 'cfx-end-words', text: end.words }),
        h('div', { class: 'cfx-end-rows' }, rows.map(row)),
      ),
    );
    stage.layer.append(scene);
    current.later(() => scene.remove());
    const panel = scene.querySelector('.cfx-end-panel');
    const box = stage.rect(lines);
    panel.style.top = `${box.top}px`;
    panel.style.height = `${box.height}px`;
    current.animate(scene, [{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out', fill: 'forwards' });
    const parts = [...panel.children];
    parts.forEach((part, index) => {
      const pop = part.classList.contains('cfx-end-title');
      current.animate(
        part,
        pop
          ? [{ transform: 'scale(2)', opacity: 0 }, { transform: 'scale(0.95)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }]
          : [{ transform: `translateY(${index === 0 ? 30 : 10}px)`, opacity: 0 }, { transform: 'translateY(0px)', opacity: 1 }],
        { duration: pop ? 480 : 340, delay: 120 + index * 110, easing: EASE_OUT, fill: 'both' },
      );
    });
    await current.wait(120 + parts.length * 110 + 250);
    if (end.result === 'won') {
      const point = stage.at(lines.left + lines.width / 2, lines.top + lines.height * 0.3);
      stage.sparks.burst({ x: point.x, y: point.y, count: 34, colors: GOLD_SPARKS, angle: -Math.PI / 2, spread: Math.PI, speed: [120, 320], life: [700, 1200], gravity: 220, drag: 1.4 });
    }
    return scene.querySelector('.cfx-end-row strong');
  }

  // Coins from `from` to the gold in the top bar (a staked win, or a draw's
  // stake back), the gold counting up as they land.
  async function coins(current, from, count) {
    const goal = document.querySelector('.topbar .gold-row') ?? document.querySelector('.topbar .gold-value');
    if (!from || !goal || current.skipped) {
      goldHold?.release();
      return;
    }
    const end = centre(goal.getBoundingClientRect());
    const start = centre(from.getBoundingClientRect());
    const many = Math.min(MAX_COINS, Math.max(5, count));
    const flights = [];
    for (let index = 0; index < many; index++) {
      const coin = h('span', { class: 'cfx-coin' });
      coin.style.left = `${end.x}px`;
      coin.style.top = `${end.y}px`;
      topLayer().append(coin);
      current.later(() => coin.remove());
      const sx = start.x + between(-28, 28) - end.x;
      const sy = start.y + between(-8, 8) - end.y;
      const arc = between(50, 110);
      const animation = current.animate(
        coin,
        [
          { transform: `translate(${sx}px, ${sy}px) scale(0.4)`, opacity: 0 },
          { transform: `translate(${sx * 0.92}px, ${sy * 0.85 - arc * 0.4}px) scale(1.1)`, opacity: 1, offset: 0.18 },
          { transform: `translate(${sx * 0.45}px, ${sy * 0.5 - arc}px) scale(1)`, opacity: 1, offset: 0.55 },
          { transform: 'translate(0px, 0px) scale(0.7)', opacity: 1 },
        ],
        { duration: 720, delay: index * 55, easing: 'cubic-bezier(0.45, 0, 0.6, 1)', fill: 'both' },
      );
      if (!animation) break;
      flights.push(
        animation.finished.then(
          () => {
            coin.remove();
            goldHold?.step((index + 1) / many);
            current.animate(goal, [{ transform: 'scale(1)' }, { transform: 'scale(1.18)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 200, easing: EASE_OUT });
          },
          () => coin.remove(),
        ),
      );
    }
    await Promise.all(flights);
    goldHold?.release();
  }

  // --- What cards.js asks for ------------------------------------------------

  return {
    // Whether the table moves: the game's animations on (without them
    // cards.js changes the table at once).
    on: () => motionOn(),
    // While a run plays, the tab's redraws wait for its end.
    holding: () => holding,
    measure,
    lay,
    cancelFlights,

    // The gold of the top bar held at `before` until the coins land (a
    // staked match won or drawn): a copy of its number over it, as the bar
    // shows the new gold the moment the answer comes.
    holdGold(before, after) {
      goldHold?.release();
      const value = document.querySelector('.topbar .gold-value');
      if (!value || !(after > before)) return;
      const box = value.getBoundingClientRect();
      if (box.width === 0) return;
      const style = getComputedStyle(value);
      const cover = h('span', { class: 'cfx-gold-hold', text: formatShort(before) });
      for (const name of ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'color', 'lineHeight']) cover.style[name] = style[name];
      cover.style.left = `${box.left - 2}px`;
      cover.style.top = `${box.top}px`;
      cover.style.minWidth = `${box.width + 4}px`;
      cover.style.height = `${box.height}px`;
      topLayer().append(cover);
      const hold = {
        step(share) {
          cover.textContent = formatShort(Math.round(before + (after - before) * share));
        },
        release() {
          cover.remove();
          if (goldHold === hold) goldHold = null;
        },
      };
      goldHold = hold;
    },

    // A round after "Walcz", on the table as it stood: the hero's skill, the
    // blows one after another, the cards beaten, and at the match's end its
    // scene and the coins from its stake. `shown`: the cards as the table
    // showed them (their Życie), by side and key; `after`: the match after
    // the round.
    begin,
    async round(current, { last, shown, after, end, types, onEnd }) {
      const table = holder.querySelector('.cards-table');
      if (!table || !last) return { coinsDone: false };
      const stage = tableLayer(current, table);
      await revealTable(current, table);
      for (const chip of table.querySelectorAll('.tcard-blow')) current.animate(chip, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
      const focus = createFocus(current, table);
      if (last.skill) await skillShown(current, stage, focus, table, last.skill);
      const life = new Map();
      for (const side of ['me', 'foe']) for (const card of shown[side].values()) life.set(`${side}:${card.key}`, { life: card.life, max: card.max });
      // The blows by line, the player's first in each.
      const order = [...last.hits].sort((a, b) => a.line - b.line || (a.side === 'me' ? 0 : 1) - (b.side === 'me' ? 0 : 1));
      // The match's last beaten card, and the blow that beat it, slowly.
      let slowKey = null;
      let slowHit = null;
      if (end) {
        const losing = end.result === 'won' ? 'foe' : end.result === 'lost' ? 'me' : last.beaten.foe.length ? 'foe' : 'me';
        const keys = last.beaten[losing];
        const hits = order.filter((hit) => hit.side !== losing && keys.includes(hit.target.key));
        slowHit = hits.at(-1) ?? null;
        if (slowHit) slowKey = `${losing}:${slowHit.target.key}`;
      }
      const counts = new Map();
      const blows = [];
      for (const hit of order) {
        if (current.skipped) break;
        const other = hit.side === 'me' ? 'foe' : 'me';
        const attacker = table.querySelector(`[data-fx="${hit.side}:${hit.key}"]`);
        const target = table.querySelector(`[data-fx="${other}:${hit.target.key}"]`);
        if (!attacker || !target) continue;
        const card = shown[hit.side].get(hit.key);
        const id = `${other}:${hit.target.key}`;
        const count = counts.get(id) ?? 0;
        counts.set(id, count + 1);
        const slow = hit === slowHit;
        if (slow) await Promise.all(blows.splice(0));
        const playing = blow(current, stage, focus, { ...hit, type: card?.type }, { attacker, target, life, types, count, slow });
        blows.push(playing);
        if (slow) await playing;
        else await current.wait(PACE.gap);
      }
      // The cards beaten go once the last blow has landed.
      await current.wait(PACE.blow * PACE.contact + 140 - PACE.gap);
      if (!slowKey) await focus.release(200);
      await beatenGo(current, stage, focus, table, { last, after, slowKey });
      if (slowKey) await focus.release(260);
      if (end) {
        onEnd?.();
        const from = await endShown(current, stage, table, end);
        // The coins straight from the scene's stake.
        if (from && end.mode === 'staked' && end.result !== 'lost') {
          await coins(current, from, Math.round((end.gold + (end.daily ?? 0)) / 25));
          await current.wait(300);
          return { coinsDone: true };
        }
      }
      return { coinsDone: false };
    },

    // The table drawn anew after a round, or at a match's start: Szczęsny's
    // new cards fly from his pile and turn face up, the reserve's new cards
    // come from the deck, and the blows of the next round show. Hides them
    // at once (before the screen is painted), then plays.
    enter(current, { previous, match }) {
      const table = holder.querySelector('.cards-table');
      if (!table || !match) return Promise.resolve();
      const placed = new Set(match.last?.placed ?? []);
      const foeCards = [...table.querySelectorAll('.cards-lines--foe .cards-line')].map((line, index) => (placed.has(index) ? line.querySelector('.tcard') : null)).filter(Boolean);
      const known = new Set([...(previous?.me.hand ?? []), ...(previous?.me.lines ?? [])].filter(Boolean).map((card) => card.key));
      const mine = match.me.hand.filter((card) => !known.has(card.key)).map((card) => holder.querySelector(`.cards-reserve [data-fx="me:${card.key}"]`)).filter(Boolean);
      for (const card of [...foeCards, ...mine]) card.classList.add('cfx-hidden');
      const chips = [...table.querySelectorAll('.tcard-blow')];
      for (const chip of chips) chip.classList.add('cfx-faded');
      current.later(() => {
        for (const card of [...foeCards, ...mine]) card.classList.remove('cfx-hidden');
        for (const chip of chips) chip.classList.remove('cfx-faded');
      });
      return (async () => {
        // Two frames: the screen laid out anew (the Salon's card folding).
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        // At a match's start the table in sight first, if it is not at all.
        const { top: upper, bottom: lower } = visibleBand();
        const box = table.getBoundingClientRect();
        if (box.bottom < upper + 80 || box.top > lower - 80) await revealTable(current, table);
        // Szczęsny's cards from his pile, and the player's from the deck at
        // the same time (a card going to a reserve out of sight flies on
        // under the bottom menu).
        const foePile = table.querySelector('.cards-table-who .cards-backs') ?? table.querySelector('.cards-table-bust');
        const myPile = table.querySelector('.cards-table-count--me .cards-backs') ?? table.querySelector('.cards-table-count--me');
        const foeFrom = foePile?.getBoundingClientRect() ?? null;
        const myFrom = myPile?.getBoundingClientRect() ?? null;
        await Promise.all([
          ...foeCards.map((card, index) => dealCard(current, card, foeFrom, { delay: index * PACE.dealGap })),
          ...mine.map((card, index) => dealCard(current, card, myFrom, { delay: 60 + index * PACE.dealGap })),
        ]);
        for (const chip of chips) {
          chip.classList.remove('cfx-faded');
          current.animate(chip, [{ opacity: 0, transform: 'translateX(-50%) translateY(4px)' }, { opacity: 1, transform: 'translateX(-50%) translateY(0px)' }], { duration: 200, easing: EASE_OUT });
        }
        await current.wait(120);
      })();
    },

    // The match's end card drawn: it comes in, its title pulses, the coins
    // fly to the gold if the scene's stake did not send them, and the first
    // win's card turns face up and shines.
    ended(current, { end, coinsDone }) {
      const card = holder.querySelector('.cards-end');
      if (!card) {
        goldHold?.release();
        return Promise.resolve();
      }
      const reward = card.querySelector('.cards-reward .tcard');
      reward?.classList.add('cfx-hidden');
      current.later(() => reward?.classList.remove('cfx-hidden'));
      return (async () => {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await current.all([
          current.animate(card, [{ opacity: 0, transform: 'translateY(12px) scale(0.98)' }, { opacity: 1, transform: 'translateY(0px) scale(1)' }], { duration: 300, easing: EASE_OUT }),
        ]);
        const title = card.querySelector('.cards-end-title');
        current.animate(title, [{ transform: 'scale(1)' }, { transform: 'scale(1.12)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 360, easing: EASE_OUT });
        const gold = end.mode === 'staked' && end.result !== 'lost' && !coinsDone;
        const from = gold ? card.querySelector('.status-row dd') : null;
        const flying = gold ? coins(current, from, Math.round((end.gold + (end.daily ?? 0)) / 25)) : (goldHold?.release(), null);
        if (reward) {
          await reveal(current, reward.getBoundingClientRect());
          await dealCard(current, reward, null, { rise: 10, shine: true });
          await current.wait(500);
        }
        await flying;
      })();
    },

    // The starter deck taken (brought into sight first, `show`), or the
    // cards of a report: they turn face up one by one.
    dealt(current, cards, { show = false } = {}) {
      if (!cards.length) return Promise.resolve();
      for (const card of cards) card.classList.add('cfx-hidden');
      current.later(() => cards.forEach((card) => card.classList.remove('cfx-hidden')));
      return (async () => {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        // The new deck in sight (its first rows, where it is taller).
        if (show) await reveal(current, union(cards));
        await Promise.all(cards.map((card, index) => dealCard(current, card, null, { delay: index * 55, rise: 12, shine: true })));
      })();
    },

    finish,
    stop() {
      run?.skip();
      if (run) finish(run);
      cancelFlights();
      goldHold?.release();
      fly?.remove();
      top?.remove();
      fly = null;
      top = null;
      for (const type of ['pointerdown', 'click', 'keydown']) holder.removeEventListener(type, guard, true);
    },
  };
}

// The cards an exploration left, in its report (cards.js, droppedCardsSection):
// once the section comes into sight, they turn face up one by one and shine
// in their rarity's colour (none of it with the game's animations off).
export function fxDroppedCards(section) {
  if (!motionOn() || typeof IntersectionObserver !== 'function') return;
  const cards = [...section.querySelectorAll('.tcard')];
  for (const card of cards) card.classList.add('cfx-hidden');
  const watch = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      watch.disconnect();
      const fx = createCardsFx(section);
      const current = fx.begin();
      fx.dealt(current, cards).then(() => {
        fx.finish(current);
        fx.stop();
      });
    },
    { threshold: 0.3 },
  );
  watch.observe(section);
}

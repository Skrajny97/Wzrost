// The blows of a fight's playback (arena.js), in the look the author chose of
// the three a prototype showed: 892 C „Kinowe” (13.11.2026; the author:
// „Potrzebujemy też ładniejszych animacji ciosów wszelkiego rodzaju”).
//   The blows: a blade's blow takes a short wind-up, lunges and follows
//     through; an archer or a mage draws back and lets go, and the arrow or
//     the spell flies with a glowing trail. The hit lights its target in the
//     colour of its kind (a blade, fire, frost, lightning, poison, holy
//     light, shadow) and stops the moment for a few frames; the target is
//     thrown back, sparks and dust fly off it, a blade draws its arc across
//     it (two parallel arcs for a critical blow, never a cross: that is the
//     mark of a fallen unit) and a spell bursts in its element. Critical and
//     heavy blows shake the arena; a critical one has a bigger number, a
//     white blink and "KRYTYK!" over its target. The numbers pop and drift,
//     and step aside when the next blow lands on the same card. A dodge is a
//     side-step that leaves an afterimage, with the blow's swish through it;
//     a heal rises in green sparks; a skill's light gathers on its user
//     before its blow.
//   The camera: a critical blow, a blow that fells its target, a skill's own
//     blow and a skill over a whole row draw it in for a moment while the
//     arena's edges darken; the fight's last blow plays in slow motion, the
//     camera staying on its target until it falls.
// Everything is drawn in code (CSS, the Web Animations API, SVG and a canvas
// for the specks), stays in the arena's box and follows the fight's tempo.
// With the game's animations off ("Animacje", motion.js) nothing shakes,
// zooms or slows down and no specks fly: the blows keep the fight's calm
// moves (a short lunge, an arrow or a spell flying, the cards lit in the
// blow's colour).

import { h } from './dom.js';
import { t } from './i18n.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
// At most so many specks at once in an arena, so a phone keeps up.
const MAX_SPECKS = 140;
// The fight's last blow plays at this share of its tempo, and its target's
// fall at the second.
const SLOW_MOTION = 0.4;
const SLOW_FALL = 0.65;

// The light of a blow by its kind: `glow` for its flash and trails, the
// specks that fly off it.
const KINDS = {
  physical: { glow: '#ef9a85', specks: ['#fff6d8', '#ffd27a', '#ffb36b'] },
  fire: { glow: '#ff8a3d', specks: ['#ffe28a', '#ffa047', '#ff6a2a'] },
  frost: { glow: '#8fd3ff', specks: ['#ffffff', '#dff4ff', '#8fd3ff'] },
  lightning: { glow: '#f2e36b', specks: ['#ffffff', '#fff7c2', '#f2e36b'] },
  poison: { glow: '#9ccc65', specks: ['#d7f5a8', '#9ccc65', '#6f9a3a'] },
  nature: { glow: '#8bc34a', specks: ['#c5e38f', '#8bc34a', '#5f8f2e'] },
  earth: { glow: '#c49a6c', specks: ['#e0c49e', '#c49a6c', '#8a6a48'] },
  water: { glow: '#4fa3e0', specks: ['#ffffff', '#a8d6ff', '#4fa3e0'] },
  sacred: { glow: '#f2d675', specks: ['#fffbe0', '#f8e7a0', '#f2d675'] },
  shadow: { glow: '#a690e8', specks: ['#d9ccff', '#a690e8', '#5d4a8f'] },
  arcane: { glow: '#8fe3ef', specks: ['#ffffff', '#c8f4fa', '#8fe3ef'] },
};
const DUST = ['#b9ab92', '#8d806b', '#6f6453'];
const HEAL = ['#e3f5a8', '#b6e388', '#7fd36b'];

const between = ([low, high]) => low + Math.random() * (high - low);
const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

// What kind of blow it is: a skill's own look first, then the weapon's
// element; a spell without one is the System's light, anything else a
// plain blow of a blade, a claw or an arrow.
function kindOf(actor, look) {
  if (look?.impact === 'fire') return 'fire';
  if (look?.impact === 'shadow' || look?.teleport) return 'shadow';
  if (look?.cast === 'holy') return 'sacred';
  if (look?.cast === 'frost') return 'frost';
  if (look?.cast === 'poison') return 'poison';
  if (actor?.element && KINDS[actor.element]) return actor.element;
  return actor?.strike === 'magic' ? 'arcane' : 'physical';
}

// The specks: one canvas over the stage, drawn while anything flies, with
// the time of the fight (its tempo, the last blow's slow motion).
function createSpecks(canvas, host, pace) {
  const context = canvas.getContext('2d');
  const specks = [];
  const emitters = [];
  let frame = 0;
  let last = 0;
  let size = { width: 0, height: 0, ratio: 1 };

  function fit() {
    const width = host.offsetWidth;
    const height = host.offsetHeight;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    if (width === size.width && height === size.height && ratio === size.ratio) return;
    size = { width, height, ratio };
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
  }

  function start() {
    if (frame) return;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function add(speck) {
    if (specks.length >= MAX_SPECKS) specks.shift();
    specks.push(speck);
  }

  // `count` specks from a point (spread over `area`), flying `angle` ±
  // `spread` (radians) at `speed` px/s for `life` ms; `gravity` pulls them
  // down (up when below 0), `drag` slows them, `rise` lifts them at once.
  function burst({ x, y, count, colors, angle = 0, spread = Math.PI, speed = [60, 160], life = [380, 700], size: sizes = [1.5, 3], shape = 'spark', gravity = 0, drag = 2, rise = 0, area = null }) {
    fit();
    for (let index = 0; index < count; index++) {
      const direction = angle + (Math.random() * 2 - 1) * spread;
      const velocity = between(speed);
      add({
        x: x + (area ? (Math.random() - 0.5) * area.width : (Math.random() - 0.5) * 6),
        y: y + (area ? (Math.random() - 0.5) * area.height : (Math.random() - 0.5) * 6),
        vx: Math.cos(direction) * velocity,
        vy: Math.sin(direction) * velocity - rise,
        age: 0,
        life: between(life),
        size: between(sizes),
        color: colors[index % colors.length],
        shape,
        gravity,
        drag,
        spin: (Math.random() * 2 - 1) * 7,
        turn: Math.random() * Math.PI,
        sway: Math.random() * Math.PI * 2,
      });
    }
    start();
  }

  // Specks shed along a path while a projectile flies it (ease-in, as the
  // projectile does).
  function trail({ from, to, duration, colors, rate = 50, sizes = [1.2, 2.4], life = [240, 460], shape = 'ember' }) {
    fit();
    emitters.push({ from, to, duration, colors, rate, sizes, life, shape, age: 0, owed: 0 });
    start();
  }

  function draw(speck) {
    const left = clamp(1 - speck.age / speck.life, 0, 1);
    const { x, y } = speck;
    context.globalAlpha = Math.min(1, left * 1.6);
    context.globalCompositeOperation = speck.shape === 'dust' || speck.shape === 'bubble' ? 'source-over' : 'lighter';
    context.fillStyle = speck.color;
    context.strokeStyle = speck.color;
    switch (speck.shape) {
      case 'spark': {
        const speed = Math.hypot(speck.vx, speck.vy) || 1;
        const length = Math.min(15, 2 + speed * 0.04);
        context.lineWidth = speck.size * (0.45 + left * 0.55);
        context.lineCap = 'round';
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x - (speck.vx / speed) * length, y - (speck.vy / speed) * length);
        context.stroke();
        break;
      }
      case 'dust': {
        context.globalAlpha = 0.42 * left;
        context.beginPath();
        context.arc(x, y, speck.size * (1 + (1 - left) * 1.6), 0, Math.PI * 2);
        context.fill();
        break;
      }
      case 'shard': {
        const s = speck.size;
        context.save();
        context.translate(x, y);
        context.rotate(speck.turn);
        context.beginPath();
        context.moveTo(0, -s * 2.2);
        context.lineTo(s * 0.7, 0);
        context.lineTo(0, s * 2.2);
        context.lineTo(-s * 0.7, 0);
        context.closePath();
        context.fill();
        context.restore();
        break;
      }
      case 'bubble': {
        context.globalAlpha = 0.85 * left;
        context.lineWidth = 1.2;
        context.beginPath();
        context.arc(x, y, speck.size * (1 + (1 - left) * 0.5), 0, Math.PI * 2);
        context.stroke();
        break;
      }
      case 'plus': {
        const s = speck.size * 1.5;
        context.lineWidth = 1.6;
        context.lineCap = 'round';
        context.beginPath();
        context.moveTo(x - s, y);
        context.lineTo(x + s, y);
        context.moveTo(x, y - s);
        context.lineTo(x, y + s);
        context.stroke();
        break;
      }
      case 'mote': {
        context.globalAlpha = left * (0.6 + 0.4 * Math.sin(speck.age / 55 + speck.sway));
        context.beginPath();
        context.arc(x, y, speck.size * 0.8, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha *= 0.3;
        context.beginPath();
        context.arc(x, y, speck.size * 2.2, 0, Math.PI * 2);
        context.fill();
        break;
      }
      default: {
        // An ember: a glowing dot with its halo.
        const r = speck.size * (0.55 + 0.45 * left);
        context.beginPath();
        context.arc(x, y, r, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha *= 0.3;
        context.beginPath();
        context.arc(x, y, r * 2.4, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  // The clock is performance.now(), not the frame's stamp, which follows
  // the document's animations rather than the page's time.
  function tick() {
    const now = performance.now();
    const dt = clamp(now - last, 0, 48) * pace();
    last = now;
    fit();
    for (let index = emitters.length - 1; index >= 0; index--) {
      const emitter = emitters[index];
      emitter.age += dt;
      const done = Math.min(1, emitter.age / emitter.duration);
      const along = done * done;
      emitter.owed += (dt / 1000) * emitter.rate;
      while (emitter.owed >= 1) {
        emitter.owed -= 1;
        add({
          x: emitter.from.x + (emitter.to.x - emitter.from.x) * along + (Math.random() - 0.5) * 4,
          y: emitter.from.y + (emitter.to.y - emitter.from.y) * along + (Math.random() - 0.5) * 4,
          vx: (Math.random() - 0.5) * 30,
          vy: (Math.random() - 0.5) * 30 - 12,
          age: 0,
          life: between(emitter.life),
          size: between(emitter.sizes),
          color: emitter.colors[Math.floor(Math.random() * emitter.colors.length)],
          shape: emitter.shape,
          gravity: 0,
          drag: 3,
          spin: 0,
          turn: 0,
          sway: Math.random() * Math.PI * 2,
        });
      }
      if (done >= 1) emitters.splice(index, 1);
    }
    const { width, height, ratio } = size;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const step = dt / 1000;
    for (let index = specks.length - 1; index >= 0; index--) {
      const speck = specks[index];
      speck.age += dt;
      if (speck.age >= speck.life) {
        specks.splice(index, 1);
        continue;
      }
      const slow = Math.exp(-speck.drag * step);
      speck.vx *= slow;
      speck.vy = speck.vy * slow + speck.gravity * step;
      speck.x += speck.vx * step + (speck.shape === 'mote' || speck.shape === 'plus' || speck.shape === 'bubble' ? Math.sin(speck.age / 160 + speck.sway) * 9 * step : 0);
      speck.y += speck.vy * step;
      speck.turn += speck.spin * step;
      draw(speck);
    }
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    frame = specks.length > 0 || emitters.length > 0 ? requestAnimationFrame(tick) : 0;
  }

  function clear() {
    specks.length = 0;
    emitters.length = 0;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  return { burst, trail, clear };
}

// `kit` is what the arena shares (arena.js): its stage, cards and effects
// layer, its animation helpers (every one cancelled with the rest) and the
// fight's clock.
export function createFx(kit) {
  const { arena, stage, fx, cards, animate, track, later, pace, run, reduced, playSound } = kit;
  const canvas = h('canvas', { class: 'arena-specks', 'aria-hidden': 'true' });
  stage.insertBefore(canvas, fx);
  const specks = createSpecks(canvas, stage, pace);
  // The arena's edges darken with a strong blow, over the stage, so the
  // camera's zoom does not move them.
  const vignette = h('div', { class: 'fx-vignette', 'aria-hidden': 'true' });
  arena.append(vignette);
  const motion = () => !reduced();

  // Where an element stands on the stage, by the page's layout: neither the
  // camera's zoom nor a card's own movement shifts it.
  function boxOf(element) {
    let x = 0;
    let y = 0;
    let node = element;
    while (node && node !== stage) {
      x += node.offsetLeft;
      y += node.offsetTop;
      node = node.offsetParent;
    }
    if (node !== stage) {
      const frame = stage.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      return { x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height };
    }
    return { x, y, width: element.offsetWidth, height: element.offsetHeight };
  }
  function centerOf(element) {
    const box = boxOf(element);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  function mark(className, { x, y }, vars = {}) {
    const element = h('span', { class: className, 'aria-hidden': 'true' });
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    for (const [name, value] of Object.entries(vars)) element.style.setProperty(name, value);
    fx.append(element);
    return element;
  }

  // How big an effect over a card is: about its picture, so a computer's
  // wide card does not get a burst as wide as itself.
  const reachOf = (card) => Math.min(card.offsetWidth, card.offsetHeight * 1.15);

  // Inside the arena by its edges, for something `half` as wide.
  const inside = (x, half) => clamp(x, half + 3, Math.max(half + 3, stage.clientWidth - half - 3));

  // The numbers over a card: they pop, then drift up and aside and fade;
  // two at once on one card stand one under the other, and a number still
  // in sight when the next blow lands steps up and dims, so they do not
  // overlap.
  const lastNumber = new Map(); // card id → { at, slot }
  const showing = new Map(); // card id → its numbers in sight
  let side = 1;
  function number(id, text, kind, delay = 0, color = null) {
    const entry = cards.get(id);
    if (!entry) return;
    const box = boxOf(entry.card);
    const now = performance.now();
    const previous = lastNumber.get(id);
    const slot = previous && now - previous.at < 420 / pace() ? (previous.slot + 1) % 3 : 0;
    lastNumber.set(id, { at: now, slot });
    const shown = showing.get(id) ?? new Set();
    showing.set(id, shown);
    if (slot === 0) {
      for (const older of shown) {
        if (older.dataset.stepped) continue;
        older.dataset.stepped = '1';
        animate(older, [{ translate: '0 0', filter: 'opacity(1)' }, { translate: '0 -18px', filter: 'opacity(0.55)' }], { duration: 180, easing: 'ease-out', fill: 'forwards' });
      }
    }
    const bubble = h('span', { class: `fx-num fx-num--${kind}`, text, 'aria-hidden': 'true' });
    shown.add(bubble);
    if (color) bubble.style.color = color;
    fx.append(bubble);
    const half = bubble.offsetWidth / 2;
    const x = inside(box.x + box.width / 2, half);
    const y = box.y + box.height * 0.4 + slot * 24;
    bubble.style.left = `${x}px`;
    bubble.style.top = `${y}px`;
    const big = kind === 'crit';
    side = -side;
    const drift = big ? 0 : side * 9;
    const dx = clamp(drift, half + 3 - x, stage.clientWidth - half - 3 - x);
    const keyframes = motion()
      ? [
          { transform: 'translate(-50%, -50%) scale(0.25)', opacity: 0, easing: 'cubic-bezier(0.2, 0.9, 0.35, 1.3)' },
          { transform: `translate(-50%, -50%) scale(${big ? 1.5 : 1.28})`, opacity: 1, offset: big ? 0.12 : 0.1, easing: 'ease-out' },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: big ? 0.26 : 0.22, easing: 'cubic-bezier(0.35, 0, 0.5, 1)' },
          { transform: `translate(calc(-50% + ${(dx * 0.7).toFixed(1)}px), calc(-50% - 22px)) scale(1)`, opacity: 1, offset: 0.74, easing: 'ease-in' },
          { transform: `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% - 32px)) scale(0.92)`, opacity: 0 },
        ]
      : [
          { transform: 'translate(-50%, -50%)', opacity: 0 },
          { transform: 'translate(-50%, -50%)', opacity: 1, offset: 0.12 },
          { transform: 'translate(-50%, -50%)', opacity: 1, offset: 0.75 },
          { transform: 'translate(-50%, -50%)', opacity: 0 },
        ];
    animate(bubble, keyframes, { duration: big ? 1350 : 1100, delay, fill: 'backwards' }).then(() => {
      bubble.remove();
      shown.delete(bubble);
    });
  }

  // A card lit for a moment in a colour, over its picture and words.
  function tint(card, color, strength, duration) {
    const glow = h('span', { class: 'fx-tint', 'aria-hidden': 'true' });
    glow.style.setProperty('--fx', color);
    card.append(glow);
    return animate(glow, [{ opacity: 0 }, { opacity: strength, offset: 0.12 }, { opacity: 0 }], { duration, easing: 'ease-out' }).then(() => glow.remove());
  }

  // The card's frame glows in a colour.
  function rim(card, color, duration = 420) {
    return animate(
      card,
      [
        { boxShadow: '0 0 0 0 transparent' },
        { boxShadow: `0 0 0 2px ${color}, 0 0 16px 2px ${color}`, offset: 0.2 },
        { boxShadow: '0 0 0 0 transparent' },
      ],
      { duration },
    );
  }

  // A critical blow: the picture goes white for a blink.
  function blink(card) {
    const art = card.querySelector('.unit-art img, .unit-art svg, .unit-icon');
    if (!art) return;
    animate(art, [{ filter: 'brightness(1)' }, { filter: 'brightness(2.6) saturate(0.4)', offset: 0.15 }, { filter: 'brightness(1)' }], { duration: 260 });
  }

  // The target is thrown back along the blow's way and springs back; up
  // and down only a little, so the card keeps to its row.
  function knock(card, angle, distance) {
    if (!motion()) return;
    const box = boxOf(card);
    const x = clamp(Math.cos(angle) * distance, 2 - box.x, stage.clientWidth - 2 - box.x - box.width);
    const y = clamp(Math.sin(angle) * distance * 0.6, 2 - box.y, stage.clientHeight - 2 - box.y - box.height);
    const turn = Math.cos(angle) >= 0 ? 2.5 : -2.5;
    animate(
      card,
      [
        { transform: 'translate(0px, 0px) rotate(0deg)', easing: 'cubic-bezier(0.15, 0.9, 0.3, 1)' },
        { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${turn}deg)`, offset: 0.22, easing: 'cubic-bezier(0.4, 0, 0.3, 1.4)' },
        { transform: `translate(${(-x * 0.12).toFixed(1)}px, ${(-y * 0.12).toFixed(1)}px) rotate(${-turn * 0.2}deg)`, offset: 0.7, easing: 'ease-in-out' },
        { transform: 'translate(0px, 0px) rotate(0deg)' },
      ],
      { duration: 440 },
    );
  }

  // The whole arena shakes, a little zoomed so its edges stay covered.
  function quake(power) {
    if (!motion()) return;
    const steps = 7;
    const frames = Array.from({ length: steps + 1 }, (_, index) => {
      if (index === 0 || index === steps) return { transform: 'translate(0px, 0px) scale(1)' };
      const left = 1 - index / steps;
      const x = (index % 2 ? 1 : -1) * power * left;
      const y = ((index % 3) - 1) * power * 0.6 * left;
      return { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(1 + power * 0.004).toFixed(3)})` };
    });
    animate(stage, frames, { duration: 320, composite: 'add' });
  }

  // With the animations off, a blade's blow leaves the fight's old cut over
  // its target instead of the arc, in the blow's colour (two parallel cuts
  // for a critical blow: a cross is the mark of a fallen unit).
  function cut(point, color, strong) {
    const element = mark(`slash${strong ? ' slash--strong' : ''}`, point, { '--fx': color });
    animate(
      element,
      [
        { transform: 'translate(-50%, -50%) scale(0.4) rotate(-20deg)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.1) rotate(0deg)', opacity: 1, offset: 0.35 },
        { transform: 'translate(-50%, -50%) scale(1.25) rotate(8deg)', opacity: 0 },
      ],
      { duration: 360, easing: 'ease-out' },
    ).then(() => element.remove());
  }

  function svg(className, point, box) {
    const element = document.createElementNS(SVG_NS, 'svg');
    element.setAttribute('class', className);
    element.setAttribute('viewBox', '-50 -50 100 100');
    element.setAttribute('width', String(Math.round(box)));
    element.setAttribute('height', String(Math.round(box)));
    element.setAttribute('aria-hidden', 'true');
    element.style.left = `${point.x}px`;
    element.style.top = `${point.y}px`;
    return element;
  }

  function path(d, className, width) {
    const line = document.createElementNS(SVG_NS, 'path');
    line.setAttribute('d', d);
    line.setAttribute('class', className);
    line.setAttribute('stroke-width', String(width));
    line.setAttribute('pathLength', '100');
    return line;
  }

  // A blade's arc drawn across the target, across the blow's way: one for a
  // blow, two parallel ones for a critical blow.
  function slashArc(point, angle, color, strong, card) {
    const size = reachOf(card) * 1.25;
    const art = svg('fx-slash', point, size);
    art.style.setProperty('--fx', color);
    const turn = (angle * 180) / Math.PI + 90 + (Math.random() < 0.5 ? -26 : 26);
    const cuts = strong ? [-8, 8] : [0];
    for (const [index, offset] of cuts.entries()) {
      const d = `M -42 ${offset - 4} Q 0 ${offset + 20} 42 ${offset - 4}`;
      for (const [className, width] of [
        ['fx-slash-glow', strong ? 10 : 8],
        ['fx-slash-core', strong ? 3.4 : 2.6],
      ]) {
        const line = path(d, className, width);
        line.setAttribute('stroke-dasharray', '100 100');
        line.setAttribute('stroke-dashoffset', '100');
        art.append(line);
        animate(line, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duration: 120, delay: index * 55, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', fill: 'both' });
      }
    }
    fx.append(art);
    const at = `translate(-50%, -50%) rotate(${turn.toFixed(1)}deg)`;
    animate(
      art,
      [
        { transform: `${at} scale(0.92)`, opacity: 1 },
        { transform: `${at} scale(1.02)`, opacity: 1, offset: 0.5 },
        { transform: `${at} scale(1.1)`, opacity: 0 },
      ],
      { duration: 460, easing: 'ease-out' },
    ).then(() => art.remove());
  }

  // A flash of light (a burst) and a ring of it, around a point.
  function flare(point, color, size, duration = 420) {
    const element = mark('fx-burst', point, { '--fx': color, '--size': `${Math.round(size)}px` });
    return animate(
      element,
      [
        { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.05)', opacity: 1, offset: 0.25 },
        { transform: 'translate(-50%, -50%) scale(1.3)', opacity: 0 },
      ],
      { duration, easing: 'ease-out' },
    ).then(() => element.remove());
  }
  function ring(point, color, size, duration = 460, inward = false) {
    const element = mark('fx-ring', point, { '--fx': color, '--size': `${Math.round(size)}px` });
    const keyframes = inward
      ? [
          { transform: 'translate(-50%, -50%) scale(1.3)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(0.9)', opacity: 0.95, offset: 0.4 },
          { transform: 'translate(-50%, -50%) scale(0.15)', opacity: 0 },
        ]
      : [
          { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0.95 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
        ];
    return animate(element, keyframes, { duration, easing: inward ? 'ease-in' : 'ease-out' }).then(() => element.remove());
  }

  // Lightning: jagged bolts from the impact outwards, flickering.
  function bolts(point, length, count) {
    const art = svg('fx-bolts', point, length * 2.2);
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2 + Math.random() * 0.8;
      let x = 0;
      let y = 0;
      let d = 'M 0 0';
      for (let step = 1; step <= 4; step++) {
        const reach = (step / 4) * 44;
        const wobble = (Math.random() - 0.5) * 16;
        x = Math.cos(angle) * reach - Math.sin(angle) * wobble;
        y = Math.sin(angle) * reach + Math.cos(angle) * wobble;
        d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      art.append(path(d, 'fx-bolt-glow', 6), path(d, 'fx-bolt-core', 2));
    }
    fx.append(art);
    animate(
      art,
      [
        { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.15 },
        { opacity: 0.25, offset: 0.35 },
        { opacity: 1, offset: 0.5 },
        { transform: 'translate(-50%, -50%) scale(1.05)', opacity: 0 },
      ],
      { duration: 320 },
    ).then(() => art.remove());
  }

  // Holy light: a short column over the target.
  function pillar(point, color, card) {
    const beam = mark('fx-beam', point, { '--fx': color });
    beam.style.height = `${card.offsetHeight + 24}px`;
    animate(
      beam,
      [
        { transform: 'translate(-50%, -50%) scaleY(0)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scaleY(1)', opacity: 1, offset: 0.3 },
        { transform: 'translate(-50%, -50%) scale(1.6, 1)', opacity: 0 },
      ],
      { duration: 520, easing: 'ease-out' },
    ).then(() => beam.remove());
  }

  // A spell bursts on its target in its element's own way.
  function elementBurst(blow, point, card) {
    const { kind, glow, palette, strong } = blow;
    const reach = reachOf(card);
    const quiet = !motion();
    const spray = (options) => quiet || specks.burst({ x: point.x, y: point.y, colors: palette.specks, ...options });
    switch (kind) {
      case 'fire':
        flare(point, glow, reach * 0.95);
        ring(point, glow, reach * 1.1, 420);
        spray({ count: strong ? 18 : 12, angle: -Math.PI / 2, spread: Math.PI * 0.9, speed: [40, 140], life: [500, 900], size: [1.6, 3.2], shape: 'ember', gravity: -70, drag: 1.6 });
        break;
      case 'frost':
        flare(point, glow, reach * 0.75);
        ring(point, '#dff4ff', reach, 380);
        spray({ count: strong ? 14 : 10, speed: [100, 220], life: [380, 620], size: [1.5, 2.6], shape: 'shard', drag: 4 });
        break;
      case 'lightning':
        bolts(point, reach * 0.62, strong ? 5 : 4);
        flare(point, '#fff7c2', reach * 0.8, 300);
        spray({ count: 10, speed: [150, 300], life: [200, 380], size: [1, 1.8], shape: 'spark', drag: 4 });
        break;
      case 'poison':
      case 'nature':
        ring(point, glow, reach * 0.95, 520);
        spray({ count: strong ? 14 : 10, angle: -Math.PI / 2, spread: Math.PI, speed: [15, 50], rise: 45, life: [700, 1100], size: [2, 3.5], shape: kind === 'poison' ? 'bubble' : 'mote', drag: 1 });
        break;
      case 'sacred':
        pillar(point, glow, card);
        spray({ count: strong ? 16 : 12, angle: -Math.PI / 2, spread: Math.PI, speed: [20, 70], rise: 50, life: [600, 1000], size: [1.2, 2.2], shape: 'mote', drag: 1.2 });
        break;
      case 'shadow':
        ring(point, glow, reach * 1.25, 420, true);
        flare(point, '#4b3a73', reach * 0.8);
        spray({ count: 12, speed: [50, 130], life: [400, 700], size: [1.6, 3], shape: 'ember', drag: 3 });
        break;
      case 'earth':
      case 'water':
        ring(point, glow, reach, 420);
        spray({ count: 12, angle: -Math.PI / 2, spread: 1.2, speed: [90, 190], life: [450, 700], size: [1.6, 3], shape: kind === 'earth' ? 'dust' : 'ember', gravity: 380, drag: 1 });
        break;
      default:
        flare(point, glow, reach * 0.75);
        ring(point, glow, reach, 420);
        spray({ count: 10, speed: [90, 200], life: [300, 520], size: [1.2, 2.2], shape: 'spark', drag: 3 });
    }
  }

  // Sparks (and the dust of a blade's or an arrow's blow) flying on from
  // the impact.
  function impactSpecks(blow, point, angle) {
    if (!motion()) return;
    const { kind, palette, strong } = blow;
    const count = strong ? 16 : 10;
    if (kind === 'physical') {
      specks.burst({ x: point.x, y: point.y, count, colors: palette.specks, angle, spread: 1.1, speed: [120, 270], life: [220, 440], size: [1.2, 2.2], shape: 'spark', drag: 3.5, gravity: 260 });
      specks.burst({ x: point.x, y: point.y + 8, count: strong ? 6 : 4, colors: DUST, angle, spread: 1.7, speed: [20, 60], life: [450, 760], size: [3, 5], shape: 'dust', drag: 2.5, gravity: -12 });
      return;
    }
    specks.burst({ x: point.x, y: point.y, count, colors: palette.specks, angle, spread: 1.6, speed: [80, 210], life: [260, 520], size: [1.2, 2.4], shape: 'spark', drag: 3, gravity: 90 });
  }

  // "KRYTYK!" over the card of a critical blow, stamped on and fading.
  function critStamp(card, point) {
    const label = h('span', { class: 'fx-crit', text: t('KRYTYK!'), 'aria-hidden': 'true' });
    fx.append(label);
    const half = label.offsetWidth / 2;
    const top = Math.max(label.offsetHeight / 2 + 2, point.y - card.offsetHeight / 2 + 4);
    label.style.left = `${inside(point.x, half)}px`;
    label.style.top = `${top}px`;
    const keyframes = motion()
      ? [
          { transform: 'translate(-50%, -50%) scale(2.3) rotate(-9deg)', opacity: 0, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
          { transform: 'translate(-50%, -50%) scale(0.94) rotate(-4deg)', opacity: 1, offset: 0.13 },
          { transform: 'translate(-50%, -50%) scale(1) rotate(-4deg)', opacity: 1, offset: 0.22 },
          { transform: 'translate(-50%, -50%) scale(1) rotate(-4deg)', opacity: 1, offset: 0.74, easing: 'ease-in' },
          { transform: 'translate(-50%, calc(-50% - 10px)) scale(1.04) rotate(-4deg)', opacity: 0 },
        ]
      : [
          { transform: 'translate(-50%, -50%) rotate(-4deg)', opacity: 0 },
          { transform: 'translate(-50%, -50%) rotate(-4deg)', opacity: 1, offset: 0.15 },
          { transform: 'translate(-50%, -50%) rotate(-4deg)', opacity: 1, offset: 0.75 },
          { transform: 'translate(-50%, -50%) rotate(-4deg)', opacity: 0 },
        ];
    animate(label, keyframes, { duration: 1050 }).then(() => label.remove());
  }

  // The camera: the stage zoomed toward a point and pulled a little to the
  // middle, never so far that its edges show.
  let lens = null; // a short zoom
  let held = null; // the last blow's, until let go
  const REST = 'translate(0px, 0px) scale(1)';
  function frameFor(point, scale) {
    const width = stage.offsetWidth;
    const height = stage.offsetHeight;
    const pull = 0.35;
    const x = clamp(point.x + (width / 2 - point.x) * pull - scale * point.x, width - scale * width, 0);
    const y = clamp(point.y + (height / 2 - point.y) * pull - scale * point.y, height - scale * height, 0);
    return `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale})`;
  }
  function zoom(point, scale, duration = 820) {
    if (!motion() || held) return;
    lens?.cancel();
    const to = frameFor(point, scale);
    lens = track(
      stage.animate(
        [
          { transform: REST, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
          { transform: to, offset: 0.2 },
          { transform: to, offset: 0.6, easing: 'cubic-bezier(0.5, 0, 0.3, 1)' },
          { transform: REST },
        ],
        { duration: duration / pace() },
      ),
    );
  }
  // The fight's last blow: the camera goes in and stays until let go.
  function zoomIn(point, scale) {
    if (!motion()) return;
    lens?.cancel();
    lens = null;
    held?.cancel();
    held = track(stage.animate([{ transform: REST }, { transform: frameFor(point, scale) }], { duration: 300 / pace(), easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'forwards' }));
  }
  function zoomOut() {
    if (!held) return;
    const now = getComputedStyle(stage).transform;
    const old = held;
    held = null;
    if (now && now !== 'none') track(stage.animate([{ transform: now }, { transform: 'none' }], { duration: 480 / pace(), easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }));
    old.cancel();
  }

  // The arena's edges darken, a little in the blow's colour.
  let shade = null; // a short darkening
  let dim = null; // the last blow's, until let go
  function darken(color, strength, duration = 900) {
    if (dim) return;
    shade?.cancel();
    vignette.style.setProperty('--fx', color);
    shade = track(vignette.animate([{ opacity: 0 }, { opacity: strength, offset: 0.2 }, { opacity: 0 }], { duration: duration / pace(), easing: 'ease-out' }));
  }
  function darkenHold(color, strength) {
    shade?.cancel();
    shade = null;
    dim?.cancel();
    vignette.style.setProperty('--fx', color);
    dim = track(vignette.animate([{ opacity: 0 }, { opacity: strength }], { duration: 300 / pace(), easing: 'ease-out', fill: 'forwards' }));
  }
  function lighten() {
    if (!dim) return;
    const now = getComputedStyle(vignette).opacity;
    const old = dim;
    dim = null;
    track(vignette.animate([{ opacity: now }, { opacity: 0 }], { duration: 520 / pace(), easing: 'ease-out' }));
    old.cancel();
  }

  // What a blow is, for the strike and its impact.
  function blow(event, actor, target, look, { killing = false, final = false } = {}) {
    const kind = kindOf(actor, look);
    const palette = KINDS[kind];
    const glow = look?.color && (kind === 'physical' || kind === 'arcane') ? look.color : palette.glow;
    const strong = event.kind === 'crit';
    const heavy = strong || killing || look?.impact === 'heavy' || Boolean(look?.big) || (event.damage ?? 0) >= 0.5 * (target?.maxHp ?? Infinity);
    const melee = actor?.strike === 'melee' && !event.sweep && !look?.teleport;
    const missed = event.kind === 'dodge';
    // The moment stops for a few frames as the blow lands (none for a miss,
    // a sweep's blows or with the animations off).
    const stop = motion() && !missed && !event.sweep ? (strong || killing ? 85 : heavy ? 65 : 45) : 0;
    return { event, actor, target, look, kind, palette, glow, strong, heavy, melee, missed, killing, final, stop };
  }

  // A blow lands: everything that happens on its target.
  function hit(blow) {
    const entry = cards.get(blow.target.id);
    if (!entry) return;
    const id = run();
    const card = entry.card;
    const point = centerOf(card);
    const from = blow.actor && cards.get(blow.actor.id) ? centerOf(cards.get(blow.actor.id).card) : { x: point.x, y: point.y + 60 };
    const angle = Math.atan2(point.y - from.y, point.x - from.x);
    const { strong, heavy, glow, kind, look, event } = blow;
    tint(card, strong ? '#ffffff' : glow, strong ? 0.9 : 0.62, strong ? 380 : 300);
    rim(card, strong ? '#ffe08a' : glow);
    if (strong) blink(card);
    if (blow.melee) {
      if (motion()) slashArc(point, angle, glow, strong, card);
      else cut(point, glow, strong);
    }
    // A skill with its own impact (skill-fx.js) keeps it; any other spell
    // bursts in its element.
    if (!blow.melee && kind !== 'physical' && !look?.impact) elementBurst(blow, point, card);
    if (strong) critStamp(card, point);
    // The camera: in and staying for the fight's last blow, a short zoom for
    // a critical blow, a felling one or a skill's own.
    const skillful = look && !event.sweep && Boolean(look.impact || look.big);
    if (blow.final) {
      zoomIn(point, 1.2);
      darkenHold(glow, 0.7);
    } else if (strong || blow.killing || skillful) {
      zoom(point, strong || blow.killing ? 1.15 : 1.08);
      darken(glow, strong || blow.killing ? 0.75 : 0.5);
    }
    const react = () => {
      if (id !== run()) return;
      if (blow.final && motion()) kit.setDilation(SLOW_FALL);
      impactSpecks(blow, point, angle);
      if (look?.impact && motion()) {
        specks.burst({ x: point.x, y: point.y, count: 10, colors: [look.color, '#ffffff'], angle, spread: 1.4, speed: [90, 210], life: [300, 560], size: [1.2, 2.4], shape: kind === 'fire' ? 'ember' : 'spark', drag: 3, gravity: kind === 'fire' ? -60 : 120 });
      }
      knock(card, angle, strong ? 14 : heavy ? 10 : 6);
      if (heavy) quake(strong || blow.killing ? 7 : 4);
    };
    if (blow.stop) later(blow.stop).then(react);
    else react();
  }

  // A dodge: a quick step aside, an afterimage left where the card stood
  // and the blow's swish through it.
  function dodge(target, actor) {
    const entry = cards.get(target.id);
    if (!entry) return;
    const card = entry.card;
    if (!motion()) {
      tint(card, '#8fe3ef', 0.4, 380);
      return;
    }
    const box = boxOf(card);
    const middle = box.x + box.width / 2;
    const from = actor && cards.get(actor.id) ? centerOf(cards.get(actor.id).card) : null;
    let away = from && Math.abs(middle - from.x) > 12 ? Math.sign(middle - from.x) : middle < stage.clientWidth / 2 ? 1 : -1;
    const step = Math.min(22, box.width * 0.22);
    if (box.x + box.width + step > stage.clientWidth - 2) away = -1;
    if (box.x - step < 2) away = 1;
    const copy = card.cloneNode(true);
    copy.classList.add('fx-afterimage');
    copy.removeAttribute('aria-label');
    copy.removeAttribute('role');
    copy.setAttribute('aria-hidden', 'true');
    for (const extra of copy.querySelectorAll('.fx-tint')) extra.remove();
    copy.style.left = `${box.x}px`;
    copy.style.top = `${box.y}px`;
    copy.style.width = `${box.width}px`;
    copy.style.height = `${box.height}px`;
    fx.append(copy);
    animate(
      copy,
      [
        { opacity: 0.75, transform: 'translateX(0px)' },
        { opacity: 0.4, transform: `translateX(${away * 4}px)`, offset: 0.35 },
        { opacity: 0, transform: `translateX(${away * 8}px)` },
      ],
      { duration: 560, easing: 'ease-out' },
    ).then(() => copy.remove());
    animate(
      card,
      [
        { transform: 'translateX(0px) skewX(0deg)', easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
        { transform: `translateX(${away * step}px) skewX(${-away * 5}deg)`, offset: 0.24 },
        { transform: `translateX(${away * step}px) skewX(0deg)`, offset: 0.5, easing: 'cubic-bezier(0.5, 0, 0.3, 1)' },
        { transform: 'translateX(0px) skewX(0deg)' },
      ],
      { duration: 500 },
    );
    if (from) {
      const point = { x: middle, y: box.y + box.height / 2 };
      const angle = Math.atan2(point.y - from.y, point.x - from.x);
      const swish = mark('fx-swish', point);
      swish.style.width = `${Math.round(box.width * 1.3)}px`;
      const at = `translate(-50%, -50%) rotate(${((angle * 180) / Math.PI).toFixed(1)}deg)`;
      animate(
        swish,
        [
          { transform: `${at} translateX(-30%) scaleX(0.3)`, opacity: 0 },
          { transform: `${at} translateX(0%) scaleX(1)`, opacity: 0.9, offset: 0.35 },
          { transform: `${at} translateX(35%) scaleX(0.6)`, opacity: 0 },
        ],
        { duration: 320, easing: 'ease-out' },
      ).then(() => swish.remove());
    }
  }

  // The attacker reaches the target: a blow with a wind-up, the lunge and
  // its follow-through; an arrow or a spell drawn back, let go and flying
  // with its trail. A strike cut short (Pomiń, Powtórz) lands nowhere.
  async function strike(actor, target, onImpact, style = {}) {
    const id = run();
    const from = cards.get(actor.id).card;
    const to = cards.get(target.id).card;
    const a = centerOf(from);
    const b = centerOf(to);
    const stop = style.blow?.stop ?? 0;
    const settle = async () => {
      if (stop) await later(stop);
    };
    if (style.teleport && motion()) {
      playSound('swing');
      await animate(from, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0.12, transform: 'scale(0.94)' }], { duration: 220 });
      if (id !== run()) return;
      onImpact();
      await settle();
      await animate(from, [{ opacity: 0.12, transform: 'scale(0.94)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 260 });
      await later(200);
      return;
    }
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.hypot(dx, dy) || 1;
    const ux = dx / distance;
    const uy = dy / distance;
    if (actor.strike === 'melee') {
      const quiet = !motion();
      const reach = quiet ? 0.3 : 0.62;
      const hit = { x: dx * reach, y: dy * reach };
      const back = quiet ? { x: 0, y: 0 } : { x: -ux * 9, y: -uy * 9 };
      const lean = quiet ? 0 : ux >= 0 ? 3 : -3;
      const pose = (point, scale, turn) => `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px) scale(${scale}) rotate(${turn}deg)`;
      const windup = quiet ? 0 : 130;
      const lunge = quiet ? 190 : 150;
      from.classList.add('unit--acting');
      playSound('swing');
      const out = track(
        from.animate(
          quiet
            ? [{ transform: pose({ x: 0, y: 0 }, 1, 0) }, { transform: pose(hit, 1.07, 0) }]
            : [
                { transform: pose({ x: 0, y: 0 }, 1, 0), easing: 'cubic-bezier(0.3, 0, 0.4, 1)' },
                { transform: pose(back, 0.95, -lean), offset: windup / (windup + lunge), easing: 'cubic-bezier(0.55, 0, 0.9, 0.45)' },
                { transform: pose(hit, 1.08, lean) },
              ],
          { duration: (windup + lunge) / pace(), easing: quiet ? 'cubic-bezier(0.5, 0, 0.75, 0.4)' : 'linear', fill: 'forwards' },
        ),
      );
      await out.finished.catch(() => {});
      if (id !== run()) return;
      onImpact();
      await settle();
      if (id !== run()) return;
      const through = { x: hit.x + ux * 7, y: hit.y + uy * 7 };
      await Promise.all([
        animate(
          from,
          quiet
            ? [{ transform: pose(hit, 1.07, 0) }, { transform: pose({ x: 0, y: 0 }, 1, 0) }]
            : [
                { transform: pose(hit, 1.08, lean), easing: 'ease-out' },
                { transform: pose(through, 1.06, lean * 0.5), offset: 0.18, easing: 'cubic-bezier(0.3, 0, 0.4, 1.35)' },
                { transform: pose({ x: 0, y: 0 }, 1, 0) },
              ],
          { duration: quiet ? 240 : 380, easing: quiet ? 'ease-out' : 'linear' },
        ).then(() => out.cancel()),
        later(260),
      ]);
      if (id === run()) from.classList.remove('unit--acting');
      return;
    }

    const magic = actor.strike === 'magic';
    const color = style.color ?? (magic ? kit.elementColor(actor.element) : null);
    playSound(magic ? 'magic' : 'shot');
    if (motion()) {
      // Drawn back (a bow's string, a spell gathering), then let go: the
      // card's recoil plays on while the projectile flies.
      if (magic) tint(from, color, 0.45, 300);
      await animate(
        from,
        [
          { transform: 'translate(0px, 0px) scale(1)', easing: 'ease-out' },
          { transform: `translate(${(-ux * 5).toFixed(1)}px, ${(-uy * 5).toFixed(1)}px) scale(1.06)`, offset: 0.72, easing: 'ease-in' },
          { transform: `translate(${(ux * 3).toFixed(1)}px, ${(uy * 3).toFixed(1)}px) scale(1.02)` },
        ],
        { duration: 200 },
      );
      if (id !== run()) return;
      animate(
        from,
        [
          { transform: `translate(${(ux * 3).toFixed(1)}px, ${(uy * 3).toFixed(1)}px) scale(1.02)` },
          { transform: `translate(${(-ux * 1.5).toFixed(1)}px, ${(-uy * 1.5).toFixed(1)}px) scale(0.99)`, offset: 0.45 },
          { transform: 'translate(0px, 0px) scale(1)' },
        ],
        { duration: 300, easing: 'ease-out' },
      );
    } else {
      await animate(from, [{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 160 });
      if (id !== run()) return;
    }
    const tail = motion();
    const bolt = h('span', {
      class: ['projectile', `projectile--${magic ? 'magic' : 'arrow'}`, style.big && 'projectile--big', style.glow && 'projectile--glow', tail && 'projectile--tail'].filter(Boolean).join(' '),
    });
    if (magic || style.color) bolt.style.setProperty('--fx', color);
    fx.append(bolt);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const flight = magic ? 330 : 240;
    if (tail) {
      // The path lit behind the projectile, fading after it lands, and a
      // spell's embers shed along it.
      const streak = mark(`fx-trail${magic ? ' fx-trail--magic' : ''}`, a, { '--fx': color ?? '#efe3c8' });
      streak.style.width = `${Math.round(distance)}px`;
      const at = `translate(0px, -50%) rotate(${angle.toFixed(1)}deg)`;
      animate(
        streak,
        [
          { transform: `${at} scaleX(0)`, opacity: 0.85, easing: 'ease-in' },
          { transform: `${at} scaleX(1)`, opacity: 0.85, offset: flight / (flight + 300), easing: 'ease-out' },
          { transform: `${at} scaleX(1)`, opacity: 0 },
        ],
        { duration: flight + 300 },
      ).then(() => streak.remove());
      if (magic) specks.trail({ from: a, to: b, duration: flight, colors: [color, '#ffffff'], rate: 55 });
    }
    await animate(
      bolt,
      [
        { transform: `translate(${a.x}px, ${a.y}px) rotate(${angle}deg) scale(0.6)`, opacity: 0 },
        { opacity: 1, offset: 0.15 },
        { transform: `translate(${b.x}px, ${b.y}px) rotate(${angle}deg) scale(1)`, opacity: 1 },
      ],
      { duration: flight, easing: 'ease-in' },
    );
    bolt.remove();
    if (id !== run()) return;
    onImpact();
    await settle();
    await later(300);
  }

  // Before a skill's own blow, its light gathers on its user.
  function charge(id, color) {
    const entry = cards.get(id);
    if (!entry || !motion()) return;
    const point = centerOf(entry.card);
    const radius = reachOf(entry.card) * 0.75;
    for (let index = 0; index < 10; index++) {
      const angle = (index / 10) * Math.PI * 2 + Math.random() * 0.4;
      const life = 260 + Math.random() * 80;
      specks.burst({
        x: point.x + Math.cos(angle) * radius,
        y: point.y + Math.sin(angle) * radius,
        count: 1,
        colors: [index % 3 ? color : '#ffffff'],
        angle: angle + Math.PI,
        spread: 0,
        speed: [(radius / life) * 1000 * 0.95, (radius / life) * 1000],
        life: [life, life],
        size: [1.3, 2.2],
        shape: 'mote',
        drag: 0,
      });
    }
    tint(entry.card, color, 0.4, 340);
  }

  // A heal: green sparks rising over the card (a potion's in its own
  // colour), with a soft light.
  function heal(id, color = null) {
    const entry = cards.get(id);
    if (!entry) return;
    tint(entry.card, color ?? '#a7c47f', 0.35, 760);
    if (!motion()) return;
    const box = boxOf(entry.card);
    const colors = color ? [color, '#ffffff'] : HEAL;
    const base = { x: box.x + box.width / 2, y: box.y + box.height * 0.7, area: { width: box.width * 0.75, height: box.height * 0.35 }, colors, angle: -Math.PI / 2, spread: 0.45, speed: [18, 45], rise: 35, gravity: -28, drag: 0.6, life: [850, 1300] };
    specks.burst({ ...base, count: 11, size: [1.3, 2.4], shape: 'mote' });
    specks.burst({ ...base, count: 5, size: [2, 2.8], shape: 'plus' });
  }

  // A guard or a blessing on a card: golden motes instead.
  function glint(id, color) {
    const entry = cards.get(id);
    if (!entry || !motion()) return;
    const box = boxOf(entry.card);
    specks.burst({ x: box.x + box.width / 2, y: box.y + box.height / 2, area: { width: box.width * 0.8, height: box.height * 0.6 }, count: 10, colors: [color, '#ffffff'], angle: -Math.PI / 2, spread: Math.PI, speed: [15, 45], rise: 20, life: [600, 1000], size: [1.2, 2.2], shape: 'mote', drag: 1 });
  }

  // An effect's tick (a burn, poison): a few specks of its colour.
  function tick(id, color) {
    const entry = cards.get(id);
    if (!entry || !motion()) return;
    const box = boxOf(entry.card);
    specks.burst({ x: box.x + box.width / 2, y: box.y + box.height * 0.5, area: { width: box.width * 0.6, height: box.height * 0.4 }, count: 7, colors: [color, '#ffffff'], angle: -Math.PI / 2, spread: 1, speed: [20, 60], rise: 20, life: [450, 750], size: [1.3, 2.4], shape: 'ember', drag: 1.5 });
  }

  // A skill over a whole row draws the camera to it.
  function cast(event, look) {
    if (!event.targets?.length || !['sweep', 'frost', 'holy', 'rain'].includes(look.cast)) return;
    const points = event.targets.map((id) => cards.get(id)).filter(Boolean).map((entry) => centerOf(entry.card));
    if (points.length === 0) return;
    const middle = { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length };
    zoom(middle, 1.06, 900);
    darken(look.color, 0.45);
  }

  // A fallen unit: a last flash, it sinks and greys (dust where it stood).
  async function fall(card) {
    const box = boxOf(card);
    if (motion()) {
      specks.burst({ x: box.x + box.width / 2, y: box.y + box.height - 8, area: { width: box.width * 0.75, height: 6 }, count: 9, colors: DUST, angle: -Math.PI / 2, spread: 1.3, speed: [15, 45], life: [650, 1000], size: [3, 6], shape: 'dust', drag: 2 });
    }
    const turn = Math.random() < 0.5 ? -3 : 3;
    await animate(
      card,
      motion()
        ? [
            { opacity: 1, filter: 'grayscale(0) brightness(1)', transform: 'translateY(0px) rotate(0deg) scale(1)', easing: 'ease-out' },
            { opacity: 1, filter: 'grayscale(0) brightness(1.8)', transform: 'translateY(-3px) rotate(0deg) scale(1.03)', offset: 0.14, easing: 'cubic-bezier(0.5, 0, 0.8, 0.6)' },
            { opacity: 0.5, filter: 'grayscale(0.85) brightness(1)', transform: `translateY(4px) rotate(${turn}deg) scale(0.95)`, offset: 0.7, easing: 'ease-out' },
            { opacity: 0.4, filter: 'grayscale(1) brightness(1)', transform: 'translateY(0px) rotate(0deg) scale(0.94)' },
          ]
        : [
            { opacity: 1, filter: 'grayscale(0)' },
            { opacity: 0.4, filter: 'grayscale(1)' },
          ],
      { duration: 600 },
    );
  }

  // The fight's last blow in slow motion; let go after its fall, when its
  // number and "KRYTYK!", made slow, fade at once before the result.
  function slowMotion(on) {
    kit.setDilation(on && motion() ? SLOW_MOTION : 1);
    if (on) return;
    zoomOut();
    lighten();
    for (const element of fx.children) {
      animate(element, [{ opacity: getComputedStyle(element).opacity }, { opacity: 0 }], { duration: 220, fill: 'forwards' });
    }
  }

  function cancel() {
    specks.clear();
    lastNumber.clear();
    showing.clear();
    lens = null;
    held = null;
    shade = null;
    dim = null;
    kit.setDilation(1);
  }

  return { boxOf, centerOf, number, blow, hit, dodge, strike, charge, heal, glint, tick, cast, fall, slowMotion, cancel };
}

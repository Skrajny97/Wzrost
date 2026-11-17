// Falling snow over the whole game in December (1065; the author: „Można też
// dodac efekt nałożony na caly ekran gry - padającego puchu śnieżnego”):
// pixel flakes on a canvas that every tap passes through, under the windows
// (styles.css, .snowfall), drifting from side to side as they fall. It falls
// while the character's winter camp stands (all of December, every day on the
// test version) with the density of data/winter.json (snow: light or heavy),
// only while the game's animations are on, and rests while the game is
// hidden (another app, a locked screen).

import { motionOn } from './motion.js';

// Flakes on a phone's screen of 390 × 844 (more on a bigger one, as many to
// the same area), their sizes in the flakes' own pixels, their speed in
// screen pixels a second and how opaque they are.
const DENSITIES = {
  light: { perArea: 42 / (390 * 844), sizes: [1, 1, 1, 2], speed: [18, 46], alpha: [0.45, 0.85] },
  heavy: { perArea: 110 / (390 * 844), sizes: [1, 1, 2, 2, 3], speed: [26, 70], alpha: [0.55, 0.95] },
};
// A pixel of the flakes, in screen pixels: as chunky as the game's art.
const PIXEL = 2;
// The longest step of a frame, in seconds, so a flake does not jump after a
// pause.
const LONGEST_STEP = 0.05;

let density = null;
let canvas = null;
let context = null;
let flakes = [];
let width = 0;
let height = 0;
let frame = 0;
let last = 0;

const between = ([low, high]) => low + Math.random() * (high - low);

function flake(config, top) {
  return {
    x: Math.random() * width,
    y: top ? -2 : Math.random() * height,
    size: config.sizes[Math.floor(Math.random() * config.sizes.length)],
    speed: between(config.speed),
    alpha: between(config.alpha),
    sway: between([6, 22]),
    phase: Math.random() * Math.PI * 2,
    pace: between([0.4, 1.1]),
  };
}

function fit() {
  if (!canvas || !density) return;
  const config = DENSITIES[density];
  width = Math.ceil(window.innerWidth / PIXEL);
  height = Math.ceil(window.innerHeight / PIXEL);
  canvas.width = width;
  canvas.height = height;
  const count = Math.round(config.perArea * window.innerWidth * window.innerHeight);
  while (flakes.length < count) flakes.push(flake(config, false));
  flakes.length = count;
}

function draw(now) {
  frame = 0;
  if (!canvas || !density) return;
  const step = Math.min(LONGEST_STEP, (now - last) / 1000);
  last = now;
  context.clearRect(0, 0, width, height);
  if (motionOn() && !document.hidden) {
    const config = DENSITIES[density];
    for (const one of flakes) {
      one.y += (one.speed / PIXEL) * step;
      one.phase += one.pace * step;
      if (one.y > height + 2) Object.assign(one, flake(config, true));
      const x = (((Math.round(one.x + Math.sin(one.phase) * (one.sway / PIXEL)) % width) + width) % width);
      const y = Math.round(one.y);
      context.fillStyle = `rgba(255, 255, 255, ${one.alpha})`;
      context.fillRect(x, y, one.size, one.size);
      // The biggest flakes with a faint fringe on both sides, as a puff.
      if (one.size === 3) {
        context.fillStyle = `rgba(220, 236, 255, ${one.alpha * 0.6})`;
        context.fillRect(x - 1, y + 1, 1, 1);
        context.fillRect(x + 3, y + 1, 1, 1);
      }
    }
  }
  frame = requestAnimationFrame(draw);
}

function resume() {
  if (canvas && density && !frame && !document.hidden) {
    last = performance.now();
    frame = requestAnimationFrame(draw);
  }
}

// The snow of this density (light or heavy), or none (null).
export function setSnow(next) {
  const wanted = next && DENSITIES[next] ? next : null;
  if (wanted === density) return;
  density = wanted;
  if (!density) {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    canvas?.remove();
    canvas = null;
    context = null;
    flakes = [];
    return;
  }
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'snowfall';
    canvas.setAttribute('aria-hidden', 'true');
    context = canvas.getContext('2d');
    document.body.append(canvas);
  }
  flakes = [];
  fit();
  resume();
}

window.addEventListener('resize', fit);
document.addEventListener('visibilitychange', resume);

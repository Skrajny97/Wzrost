// The narrator's camera over the game screen (#screen; the bars above and
// below it stay put). It goes to a place like a film camera: the page
// scrolls there, on the way from one place to another the screen draws back
// a little, and at the place it comes closer, up to 1.25 times for a small
// one. It frames the place with room for the narrator below it, stays while
// the narrator speaks, and goes home (the screen as it is) when the narrator
// leaves the screen. A place to be seen whole that does not fit with the
// narrator makes it draw back, down to 0.6 times. With the animations off it
// only scrolls, at once, and draws back at once too.

import { motionOn } from './motion.js';

const CLOSEST = 1.25;
const FARTHEST = 0.6;
// A smaller zoom is not worth the slightly softer letters.
const SLIGHTEST = 1.06;
// Kept clear around a framed place, from the bars and from the sides, so
// that its light's ring stays whole: a place as wide as the screen is not
// zoomed.
const ROOM = 12;
const SIDE = 10;
// A bar pinned to the bottom from inside the screen (the stats' pending bar)
// would ride off with a zoom, so while one shows the camera only scrolls.
const PINNED = '.pending-bar';

const HOME = { z: 1, x: 0, y: 0 };
let view = HOME; // the screen: translate(x, y) scale(z) from its top left corner
let move = null; // { frame, resolve } of the move under way

const screen = () => document.getElementById('screen');
const ease = (done) => (1 - Math.cos(Math.PI * done)) / 2;
const mix = (from, to, done) => from + (to - from) * done;

// The window between the top bar and the bottom one.
function sight() {
  const top = document.getElementById('topbar')?.getBoundingClientRect().bottom ?? 0;
  const bar = [...document.querySelectorAll('.nav')].find((nav) => !nav.hidden);
  const bottom = bar ? bar.getBoundingClientRect().top : window.innerHeight;
  return { top: Math.max(0, top), bottom: Math.min(window.innerHeight, bottom), width: window.innerWidth };
}

// The screen's top left corner on the page, as laid out (offsets ignore the
// camera's transform).
function corner(element) {
  const at = { left: 0, top: 0 };
  for (let node = element; node; node = node.offsetParent) {
    at.left += node.offsetLeft;
    at.top += node.offsetTop;
  }
  return at;
}

// A point seen in the window, on the screen itself without the camera.
const unseen = (at, x, y) => ({
  x: (x + window.scrollX - at.left - view.x) / view.z,
  y: (y + window.scrollY - at.top - view.y) / view.z,
});

function show(next) {
  view = next;
  const home = view === HOME;
  screen().style.transform = home ? '' : `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
  // Meanwhile the page neither grows with the zoom nor scrolls sideways.
  document.getElementById('view-game')?.classList.toggle('filming', !home);
}

function halt() {
  if (!move) return;
  cancelAnimationFrame(move.frame);
  screen().style.willChange = '';
  move.resolve();
  move = null;
}

// The screen as it is, at once: before another screen is drawn.
export function resetCamera() {
  halt();
  if (view !== HOME) show(HOME);
}

// Goes to the places (elements on the screen), or home with none of them on
// the screen, and says when the move started, how long it takes and when it
// is done. `zoom` lets the camera come closer, `travel` marks the way from
// one place to another, `keep` is the room the narrator needs below the
// place, and `whole` frames all the places together, drawing back if need be.
export function aim(elements, { zoom = true, travel = false, keep = 0, whole = false } = {}) {
  halt();
  const start = performance.now();
  const element = screen();
  const inside = elements.filter((candidate) => element.contains(candidate) && !candidate.closest(PINNED));
  if (inside.length === 0 && view === HOME) return { start, duration: 0, done: Promise.resolve() };
  const at = corner(element);
  const bars = sight();
  const height = bars.bottom - bars.top;
  const middle = bars.top + height / 2;
  const most = Math.max(0, Math.min(document.documentElement.scrollHeight, at.top + element.offsetHeight) - window.innerHeight);
  const clamp = (scroll) => Math.max(0, Math.min(most, scroll));
  // Where a point of the screen stands in the window, unzoomed, with the
  // page scrolled to `scroll`.
  const natural = (point, scroll) => ({ x: at.left + point.x - window.scrollX, y: at.top + point.y - scroll });

  // From: whatever is in the middle of the window now.
  const from = { scroll: window.scrollY, z: view.z, eye: { x: bars.width / 2, y: middle } };
  from.point = unseen(at, from.eye.x, from.eye.y);

  // To: home keeps what is in the middle where it is. A place stands with
  // the narrator's room below it in the middle of the window, or from its
  // top when both do not fit; as far as the page scrolls, and closer if it
  // is small.
  const to = { z: 1 };
  // Drawing back to take in a whole place: a cut with the animations off.
  let back = false;
  if (inside.length === 0) {
    to.point = from.point;
    to.scroll = clamp(at.top + to.point.y - middle);
  } else {
    const boxes = inside.map((candidate) => {
      const rect = candidate.getBoundingClientRect();
      const [first, last] = [unseen(at, rect.left, rect.top), unseen(at, rect.right, rect.bottom)];
      return { left: first.x, top: first.y, right: last.x, bottom: last.y };
    });
    let box = boxes.reduce((all, part) => ({
      left: Math.min(all.left, part.left),
      top: Math.min(all.top, part.top),
      right: Math.max(all.right, part.right),
      bottom: Math.max(all.bottom, part.bottom),
    }));
    if (!whole && box.bottom - box.top > height && boxes.length > 1) box = boxes[0];
    const half = { x: Math.max(1, (box.right - box.left) / 2), y: Math.max(1, (box.bottom - box.top) / 2) };
    to.point = { x: box.left + half.x, y: box.top + half.y };
    const across = natural(to.point, 0).x;
    let z = 1;
    if (zoom && !element.querySelector(PINNED)) {
      const fits = (height - keep - 2 * ROOM) / (2 * half.y);
      const most = Math.min((across - SIDE) / half.x, (bars.width - SIDE - across) / half.x, fits);
      back = whole && fits < 1;
      if (back) z = Math.max(FARTHEST, most);
      else if (motionOn()) {
        z = Math.min(CLOSEST, most);
        if (z < SLIGHTEST) z = 1;
      }
    }
    const block = 2 * half.y * z + keep;
    const room = height - 2 * ROOM;
    const eye = bars.top + ROOM + (block <= room ? (room - block) / 2 + half.y * z : half.y);
    to.scroll = clamp(at.top + to.point.y - eye);
    // Where the page stops short, the zoom keeps clear of the bars.
    const stands = natural(to.point, to.scroll).y;
    z = Math.min(z, (stands - bars.top - ROOM) / half.y, (bars.bottom - ROOM - stands) / half.y);
    to.z = back || z >= SLIGHTEST ? z : 1;
  }
  to.eye = natural(to.point, to.scroll);

  // The camera follows a point of the screen from the window's middle to
  // the place's (`point`), showing it on the way where `eye` says, closer or
  // farther by `z`, and drawing back midway on a travel.
  const way = Math.abs(to.scroll - from.scroll) + Math.hypot(to.eye.x - from.eye.x, to.eye.y - from.eye.y) / 2;
  const closer = Math.abs(Math.log(to.z / from.z));
  const dip = travel ? 0.05 + Math.min(0.09, way / 3500) : 0;
  const frame = (done) => {
    const step = ease(done);
    window.scrollTo(window.scrollX, mix(from.scroll, to.scroll, step));
    if (done === 1 && to.z === 1) {
      show(HOME);
      return;
    }
    const z = mix(from.z, to.z, step) * (1 - dip * Math.sin(Math.PI * step));
    const point = { x: mix(from.point.x, to.point.x, step), y: mix(from.point.y, to.point.y, step) };
    const eye = { x: mix(from.eye.x, to.eye.x, step), y: mix(from.eye.y, to.eye.y, step) };
    show({ z, x: eye.x + window.scrollX - at.left - z * point.x, y: eye.y + window.scrollY - at.top - z * point.y });
  };
  let duration = way < 8 && closer < 0.01 && !travel ? 0 : Math.min(2400, 900 + way * 1.1 + closer * 1500);
  if (travel) duration = Math.max(duration, 1100);
  if (duration === 0 || !motionOn()) {
    if (!motionOn() && !back) to.z = 1;
    frame(1);
    return { start, duration: 0, done: Promise.resolve() };
  }
  element.style.willChange = 'transform';
  const done = new Promise((resolve) => {
    const current = { frame: 0, resolve };
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      frame(progress);
      if (progress < 1) {
        current.frame = requestAnimationFrame(tick);
        return;
      }
      // Still, the screen is drawn sharp again at its zoom.
      element.style.willChange = '';
      move = null;
      resolve();
    };
    move = current;
    current.frame = requestAnimationFrame(tick);
  });
  return { start, duration, done };
}

// A turned phone lays the screen out anew: the camera starts again from it.
let width = window.innerWidth;
window.addEventListener('resize', () => {
  if (window.innerWidth === width) return;
  width = window.innerWidth;
  resetCamera();
});

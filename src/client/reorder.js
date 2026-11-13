// Rows of a list put in a new order by hand (the author's 905 C, after a
// player's note: „Do zrobienia w stole do rozbiórki jakiś shuffle w
// kolejce”): each row that moves has a ≡ handle. A finger holds it for a
// moment (HOLD_MS) and the row lifts; a mouse lifts it as soon as it moves.
// The row lifted follows the pointer over the list, and a dashed frame shows
// where it will land: the row's own place, its look taken off, which the
// other rows make way for. A swipe that starts on the handle before the row
// lifts still scrolls the page; under a row lifted the page does not
// scroll (its touchmove is kept from the browser), but near the top or the
// bottom of the window between the bars it scrolls by itself. Let go, the
// row stays where the frame is and `onDrop` hears of it: the row and the
// row now after it, null at the end. Should `onDrop` fail, the rows go back
// as they were. On a handle with the focus, the arrows up and down move its
// row by one place. Rows that do not move (the order at work) come first
// and stay there, and none goes before them. With the game's animations off
// (motion.js) nothing glides.

import { sight } from './camera.js';
import { motionOn } from './motion.js';

// How long a finger holds the handle before the row lifts, how far it may
// stray meanwhile before it scrolls the page instead, and how far a mouse
// moves before the row lifts.
const HOLD_MS = 250;
const SLOP = 8;
const MOUSE_SLOP = 4;
// The page scrolls by itself while the pointer is within EDGE px of the
// window's top or bottom, by up to SPEED px a frame at the very edge.
const EDGE = 64;
const SPEED = 14;
// How long the rows making way and the row let go glide.
const GLIDE_MS = 150;

// The one row held or lifted on the page, and whether a move is on its way
// to the server: no other starts meanwhile.
let drag = null;
let busy = false;

/**
 * @param {HTMLElement} list the list, its rows its children
 * @param {{ row: string, handle: string, onDrop: (row: HTMLElement, next: HTMLElement | null, how: { keyboard: boolean }) => Promise<unknown> }} options
 *   `row`: the selector of the rows that move; `handle`: of their handles.
 */
export function reorderable(list, { row: rowSelector, handle: handleSelector, onDrop }) {
  // The rows that move, in their order now (the lifted row's copy aside).
  const movable = () => [...list.children].filter((child) => child.matches(rowSelector) && !child.classList.contains('reorder-ghost'));
  const nextOf = (row) => {
    const rows = movable();
    return rows[rows.indexOf(row) + 1] ?? null;
  };
  // The rows back in the order they had.
  const restore = (rows) => {
    for (const row of rows) list.append(row);
  };

  // The rows in a new order, those that change places gliding there.
  function shift(change, scale) {
    const rows = movable();
    const before = motionOn() ? rows.map((row) => row.getBoundingClientRect().top) : null;
    change();
    if (!before) return;
    rows.forEach((row, index) => {
      const by = (before[index] - row.getBoundingClientRect().top) / scale;
      if (Math.abs(by) >= 1) row.animate([{ transform: `translateY(${by}px)` }, { transform: 'none' }], { duration: GLIDE_MS, easing: 'ease-out' });
    });
  }

  async function send(row, rows, keyboard) {
    busy = true;
    try {
      await onDrop(row, nextOf(row), { keyboard });
    } catch {
      if (list.isConnected) restore(rows);
    } finally {
      busy = false;
    }
  }

  // The lifted row's copy where the pointer holds it, between the end of
  // the rows that stay and the end of the list, and the frame at the place
  // the copy's middle is over.
  function place() {
    if (!list.isConnected) {
      // The screen was drawn anew meanwhile (the character fetched again).
      stop();
      return;
    }
    const { row, ghost, scale, grab } = drag;
    const height = ghost.offsetHeight;
    const staying = [...list.children].filter((child) => !child.matches(rowSelector) && child !== ghost);
    const floor = Math.max(0, ...staying.map((child) => child.offsetTop + child.offsetHeight));
    const middle = Math.min(Math.max((drag.y - list.getBoundingClientRect().top) / scale - grab + height / 2, floor), list.offsetHeight);
    ghost.style.top = `${middle - height / 2}px`;
    const others = movable().filter((other) => other !== row);
    if (others.length === 0) return;
    const next = others.find((other) => other.offsetTop + other.offsetHeight / 2 > middle) ?? null;
    if (nextOf(row) !== next) shift(() => (next ? list.insertBefore(row, next) : others[others.length - 1].after(row)), scale);
  }

  // Near the window's top or bottom the page scrolls, a little each frame,
  // while the list goes on past that edge, and never past the list's end.
  function scroll() {
    if (!drag?.ghost) return;
    const { top, bottom } = sight();
    const { y } = drag;
    const box = list.getBoundingClientRect();
    let by = 0;
    if (y < top + EDGE && box.top < top) by = Math.max(-Math.ceil(SPEED * Math.min(1, (top + EDGE - y) / EDGE)), Math.floor(box.top - top));
    else if (y > bottom - EDGE && box.bottom > bottom) by = Math.min(Math.ceil(SPEED * Math.min(1, (y - bottom + EDGE) / EDGE)), Math.ceil(box.bottom - bottom));
    if (by !== 0) {
      const was = window.scrollY;
      window.scrollBy(0, by);
      if (window.scrollY !== was) place();
    }
    if (drag) drag.frame = requestAnimationFrame(scroll);
  }

  function lift() {
    clearTimeout(drag.timer);
    if (!list.isConnected) {
      stop();
      return;
    }
    const { row, handle, pointerId } = drag;
    const box = row.getBoundingClientRect();
    // The narrator's camera may have the screen zoomed (camera.js).
    const scale = box.height / row.offsetHeight || 1;
    const ghost = /** @type {HTMLElement} */ (row.cloneNode(true));
    // The rarity's colour of a name and the like, set through the CSSOM.
    const styled = [row, ...row.querySelectorAll('[style]')];
    [ghost, ...ghost.querySelectorAll('[style]')].forEach((copy, index) => {
      if (styled[index]) copy.style.cssText = styled[index].style.cssText;
    });
    ghost.classList.add('reorder-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    ghost.style.height = `${row.offsetHeight}px`;
    Object.assign(drag, { ghost, scale, grab: (drag.y - box.top) / scale, rows: movable() });
    row.classList.add('reorder-frame');
    list.classList.add('reorder-list');
    list.append(ghost);
    document.documentElement.classList.add('reorder-dragging');
    try {
      handle.setPointerCapture(pointerId);
    } catch {
      // A pointer already gone: its pointerup or pointercancel ends the drag.
    }
    place();
    if (drag) drag.frame = requestAnimationFrame(scroll);
  }

  // The drag over: the listeners go, and the row lifted comes down into its
  // frame, gliding there with the animations on.
  function stop() {
    const { timer, frame, ghost, row, handle, pointerId, listeners } = drag;
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    for (const [type, listener, capture] of listeners) window.removeEventListener(type, listener, capture);
    document.documentElement.classList.remove('reorder-dragging');
    if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
    drag = null;
    if (!ghost) return;
    const land = () => {
      ghost.remove();
      row.classList.remove('reorder-frame');
      list.classList.remove('reorder-list');
    };
    if (!motionOn() || !list.isConnected) {
      land();
      return;
    }
    ghost.animate([{ top: ghost.style.top }, { top: `${row.offsetTop}px` }], { duration: GLIDE_MS, easing: 'ease-out' }).finished.then(land, land);
  }

  function press(event, handle) {
    if (drag || busy || !event.isPrimary || event.button > 0) return;
    const mouse = event.pointerType === 'mouse';
    // A mouse selects no text and drags no picture from here.
    if (mouse) event.preventDefault();
    const row = handle.closest(rowSelector);
    drag = { row, handle, pointerId: event.pointerId, x: event.clientX, y: event.clientY, mouse, ghost: null, timer: 0, frame: 0, listeners: [] };
    drag.timer = setTimeout(lift, HOLD_MS);
    const own = (listener) => (moved) => {
      if (drag && moved.pointerId === drag.pointerId) listener(moved);
    };
    // The pointer's events wherever they go (captured: before anything on
    // the page stops them), Escape, and the window left (no pointerup comes
    // then): [type, listener, capture].
    drag.listeners = [
      [
        'pointermove',
        own((moved) => {
          if (!drag.ghost) {
            if (Math.hypot(moved.clientX - drag.x, moved.clientY - drag.y) <= (drag.mouse ? MOUSE_SLOP : SLOP)) return;
            // A finger moving before the hold scrolls the page; a mouse lifts the row.
            if (!drag.mouse) {
              stop();
              return;
            }
            lift();
            if (!drag) return;
          }
          drag.x = moved.clientX;
          drag.y = moved.clientY;
          place();
        }),
        true,
      ],
      [
        'pointerup',
        own(() => {
          const { ghost, row, rows } = drag;
          stop();
          if (!ghost) return;
          const now = movable();
          if (rows.some((one, index) => now[index] !== one)) send(row, rows, false);
        }),
        true,
      ],
      ['pointercancel', own(() => cancel()), true],
      [
        'keydown',
        (key) => {
          if (key.key === 'Escape') cancel();
        },
        true,
      ],
      ['blur', () => cancel(), false],
    ];
    for (const [type, listener, capture] of drag.listeners) window.addEventListener(type, listener, capture);
  }

  // The drag given up: the rows as they were.
  function cancel() {
    if (!drag) return;
    const { ghost, rows } = drag;
    stop();
    if (ghost && list.isConnected) restore(rows);
  }

  // The arrows up and down on a handle with the focus: its row one place
  // up or down, among the rows that move.
  async function step(event, handle) {
    const by = { ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (!by) return;
    event.preventDefault();
    if (drag || busy) return;
    const row = handle.closest(rowSelector);
    const rows = movable();
    const other = rows[rows.indexOf(row) + by];
    if (!other) return;
    shift(() => (by < 0 ? list.insertBefore(row, other) : other.after(row)), 1);
    handle.focus();
    await send(row, rows, true);
  }

  for (const handle of list.querySelectorAll(handleSelector)) {
    handle.addEventListener('pointerdown', (event) => press(event, handle));
    // Under a row lifted the page stays: a finger's touchmove does not scroll
    // it. The listener is there from the start, so the browser waits for it.
    handle.addEventListener(
      'touchmove',
      (event) => {
        if (drag?.ghost && event.cancelable) event.preventDefault();
      },
      { passive: false },
    );
    // No menu of a long press, no picture dragged by the browser.
    handle.addEventListener('contextmenu', (event) => event.preventDefault());
    handle.addEventListener('dragstart', (event) => event.preventDefault());
    handle.addEventListener('keydown', (event) => step(event, handle));
  }
  return list;
}

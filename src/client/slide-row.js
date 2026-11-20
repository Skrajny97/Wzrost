// One of a row's elements slides into another place among them: a chat's
// channel tab (1039.3; the author: „niech będzie można je po prostu
// slideować te zakładki na czacie”) and a bust of the account's characters
// over the Postać tab (the author, 20.11.2026: „W karcie postaci daj
// możliwość tez przenoszenia jak na czacie zakładek tych kółek od zmiany
// postaci, żeby sobie ustawić jak komu wygodnie”). Held still for HOLD ms it
// lifts (its class `lifted`, the row's `sliding`) and follows the finger (or
// the mouse), the others making room as it passes their middle; let go, it
// stays there, and `onDrop` gets the new order, each element's
// `dataset[key]` (`onCancel` when the slide breaks off). A move before the
// lift is the row's own scroll, a short tap chooses as before, and the
// release after a slide chooses nothing. Lifted near the row's start or end,
// it scrolls the row that way while the row can, so a place out of sight is
// reached too. `sideways`: a row of one line, where only the finger's x
// counts and the element slides along the row. While it slides, the row is
// not to be drawn anew (its `sliding` class says so).

const HOLD = 350;
// How far a finger may stray before the lift: further, it scrolls.
const SLOP = 8;
// Lifted within EDGE px of the row's start or end, the row scrolls by up to
// SPEED px a frame, the more the nearer the finger is to the edge.
const EDGE = 32;
const SPEED = 8;

/**
 * @param {HTMLElement} element the one that slides
 * @param {HTMLElement} row the row it slides in
 * @param {{ items: string, lifted: string, sliding: string, key: string, sideways?: boolean }} options
 *   `items`: the selector of the row's elements that slide
 * @param {(order: string[]) => void} onDrop
 * @param {() => void} onCancel
 */
export function slideInRow(element, row, { items, lifted: liftedClass, sliding, key, sideways = false }, onDrop, onCancel) {
  let start = null;
  let timer = null;
  let lifted = false;
  let grip = null;
  let point = null;
  let frame = 0;
  let dropped = false;
  const others = () => [...row.querySelectorAll(items)].filter((one) => one !== element);
  const reset = () => {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    timer = null;
    start = null;
    if (!lifted) return;
    lifted = false;
    element.style.transform = '';
    element.classList.remove(liftedClass);
    row.classList.remove(sliding);
  };
  // The element before or after the one under the finger, as the finger is
  // left or right of its middle, and drawn under the finger. The others
  // move around it, and it stays in the page: taken out even for a moment,
  // it would lose the pointer it holds (a mouse moved fast then left it
  // lifted, the row never drawn anew).
  const follow = () => {
    element.style.transform = '';
    const rest = others();
    const under = rest.find((one) => {
      const box = one.getBoundingClientRect();
      return point.x >= box.left && point.x <= box.right && (sideways || (point.y >= box.top && point.y <= box.bottom));
    });
    if (under) {
      const box = under.getBoundingClientRect();
      const at = rest.indexOf(under) + (point.x < box.left + box.width / 2 ? 0 : 1);
      const now = [...row.querySelectorAll(items)];
      if (now.indexOf(element) !== at) {
        for (const one of rest.slice(0, at)) row.insertBefore(one, element);
        for (const one of rest.slice(at).reverse()) element.after(one);
      }
    }
    const here = element.getBoundingClientRect();
    const x = point.x - grip.x - here.left;
    element.style.transform = sideways ? `translateX(${x}px)` : `translate(${x}px, ${point.y - grip.y - here.top}px)`;
  };
  // Each frame while lifted: near the row's start or end, the row scrolls.
  const roll = () => {
    if (!lifted) return;
    const box = row.getBoundingClientRect();
    const by =
      point.x < box.left + EDGE
        ? -Math.ceil(SPEED * Math.min(1, (box.left + EDGE - point.x) / EDGE))
        : point.x > box.right - EDGE
          ? Math.ceil(SPEED * Math.min(1, (point.x - box.right + EDGE) / EDGE))
          : 0;
    if (by !== 0) {
      const was = row.scrollLeft;
      row.scrollLeft += by;
      if (row.scrollLeft !== was) follow();
    }
    frame = requestAnimationFrame(roll);
  };
  // One finger at a time: a second one on the screen starts nothing.
  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    clearTimeout(timer);
    dropped = false;
    start = { x: event.clientX, y: event.clientY, id: event.pointerId };
    timer = setTimeout(() => {
      // The element takes the pointer, and lifts only once it holds it: the
      // row drawn anew meanwhile or the pointer gone, nothing lifts, so
      // nothing waits lifted for a release that never comes.
      try {
        element.setPointerCapture(start.id);
      } catch {
        // The element out of the page, or the pointer gone.
      }
      if (!element.isConnected || !element.hasPointerCapture(start.id)) {
        reset();
        return;
      }
      lifted = true;
      const box = element.getBoundingClientRect();
      grip = { x: start.x - box.left, y: start.y - box.top };
      point = { x: start.x, y: start.y };
      element.classList.add(liftedClass);
      row.classList.add(sliding);
      navigator.vibrate?.(15);
      if (row.scrollWidth > row.clientWidth + 1) frame = requestAnimationFrame(roll);
    }, HOLD);
  });
  element.addEventListener('pointermove', (event) => {
    if (!start) return;
    if (!lifted) {
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > SLOP) reset();
      return;
    }
    event.preventDefault();
    point = { x: event.clientX, y: event.clientY };
    follow();
  });
  // A mouse gone off the element before the lift is a move away, as one
  // past SLOP.
  element.addEventListener('pointerleave', () => {
    if (!lifted) reset();
  });
  // Lifted, the finger moves the element and not the row.
  element.addEventListener(
    'touchmove',
    (event) => {
      if (lifted) event.preventDefault();
    },
    { passive: false },
  );
  // Let go, the element stays where it is. The pointer lost otherwise while
  // lifted (the page took it from the element) ends the slide there too, so
  // the row is never left lifted. A finger's pointer, held at first by what
  // it touched inside the element, passes to the element at the lift: that
  // loss, coming up from inside, is no end.
  const drop = () => {
    const was = lifted;
    reset();
    if (!was) return;
    dropped = true;
    onDrop([...row.querySelectorAll(items)].map((one) => one.dataset[key]));
  };
  element.addEventListener('pointerup', drop);
  element.addEventListener('lostpointercapture', (event) => {
    if (event.target === element) drop();
  });
  element.addEventListener('pointercancel', () => {
    const was = lifted;
    reset();
    if (was) onCancel();
  });
  element.addEventListener('contextmenu', (event) => event.preventDefault());
  // The release after a slide chooses nothing.
  element.addEventListener(
    'click',
    (event) => {
      if (!dropped) return;
      dropped = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );
}

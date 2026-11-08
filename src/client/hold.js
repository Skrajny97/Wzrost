// Press and hold (a player's note via the author, 8.11.2026: "Można dodać
// przyciskanie plusa w sprzedaży różnych surowców, punktów statystyk, bo da
// się tylko pojedynczy klik a na telefonie czasem jak się szybko klika to
// przybliża zamiast zwiększyć liczbę"): a "+" or "−" of a number
// (.duration-step) or a stat's "+" (.stat-add) held down goes on by itself,
// faster and faster, until it is let go or can go no further. A screen that
// draws itself anew after each step puts a new button under the finger, so
// each step presses the one under it. The click the browser sends as the
// finger leaves a held button adds nothing more. The fast taps' zoom is off
// in styles.css (touch-action: manipulation).

const HOLDABLE = '.duration-step, .stat-add';
const FIRST_MS = 400;
const START_MS = 180;
const FASTEST_MS = 50;

let timer = null;
let point = null;
let held = false;

function stop() {
  clearTimeout(timer);
  timer = null;
  point = null;
}

function step(delay) {
  const button = point && document.elementFromPoint(point.x, point.y)?.closest(HOLDABLE);
  if (!button || button.disabled) {
    stop();
    return;
  }
  held = true;
  button.click();
  timer = setTimeout(() => step(Math.max(FASTEST_MS, delay * 0.85)), delay);
}

// Called once at the start (app.js).
export function enableHold() {
  document.addEventListener('pointerdown', (event) => {
    const button = event.target.closest?.(HOLDABLE);
    stop();
    held = false;
    if (!button || button.disabled || event.button > 0) return;
    point = { x: event.clientX, y: event.clientY };
    timer = setTimeout(() => step(START_MS), FIRST_MS);
  });
  for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, stop);
  document.addEventListener('pointermove', (event) => {
    if (point && Math.hypot(event.clientX - point.x, event.clientY - point.y) > 12) stop();
  });
  document.addEventListener(
    'click',
    (event) => {
      if (!held || !event.isTrusted) return;
      held = false;
      if (event.target.closest?.(HOLDABLE)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true,
  );
  // No menu of a long press on a phone over these buttons.
  document.addEventListener('contextmenu', (event) => {
    if (event.target.closest?.(HOLDABLE)) event.preventDefault();
  });
}

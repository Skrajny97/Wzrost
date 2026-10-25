// The size of the game on the screen: from 75 to 125% in steps of 5, with
// "−" and "+" in the settings, kept in this browser. The page is laid out
// for a wider or a narrower screen and the phone scales it to fit (the
// viewport tag), so the whole game, its dialogs and the narrator's camera
// keep counting in CSS pixels. A computer's browser ignores the tag and has
// its own zoom, so the settings offer this only on a touch screen.

const ZOOM_KEY = 'insight.zoom';
export const ZOOM_STEP = 5;
export const ZOOM_MIN = 75;
export const ZOOM_MAX = 125;
const NORMAL = 'width=device-width, initial-scale=1, viewport-fit=cover';

let zoom = readZoom();
let screenWidth = 0; // the width of the screen the tag was set for

function readZoom() {
  try {
    const stored = Number(localStorage.getItem(ZOOM_KEY) ?? 100);
    return stored >= ZOOM_MIN && stored <= ZOOM_MAX && stored % ZOOM_STEP === 0 ? stored : 100;
  } catch {
    return 100;
  }
}

export const zoomLevel = () => zoom;
export const zoomOffered = () => window.matchMedia('(pointer: coarse)').matches;

// One step closer (+1) or farther (−1).
export function stepZoom(direction) {
  zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom + direction * ZOOM_STEP));
  try {
    localStorage.setItem(ZOOM_KEY, String(zoom));
  } catch {
    // Without storage the size lasts until the page is closed.
  }
  applyZoom();
}

// The screen's width in CSS pixels at the normal size, whatever the tag
// and a pinch of the fingers did to the page.
const screenNow = () => (window.visualViewport ? window.visualViewport.width * window.visualViewport.scale : window.innerWidth);

export function applyZoom() {
  const tag = document.querySelector('meta[name="viewport"]');
  if (!tag) return;
  screenWidth = screenNow();
  const scale = zoom / 100;
  tag.content = zoom === 100 ? NORMAL : `width=${Math.round(screenWidth / scale)}, initial-scale=${scale}, viewport-fit=cover`;
}

// A turned phone has another width, and the tag follows it.
window.addEventListener('resize', () => {
  if (zoom !== 100 && Math.abs(screenNow() - screenWidth) > 1) applyZoom();
});

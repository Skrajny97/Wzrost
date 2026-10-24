// Vector busts of the classes, for the class choice and the party in fights:
// a hooded figure whose face the System lights up, with the weapon and colours
// of the class, on a dark medallion. The author will replace them with their
// own artwork. Fixed markup only: no game data goes into these strings.

const SVG_NS = 'http://www.w3.org/2000/svg';

const LINE = '#b9ae94';
const PALE = '#e7dcc2';
const INK = '#0d110b';
const VOID = '#060805';
const EYE = '#8fe3ef';
const GOLD = '#d9b45a';

const path = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra ? ` ${extra}` : ''}></path>`;
const stroke = (d, color, width = 1, extra = '') =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${extra ? ` ${extra}` : ''}></path>`;
const dot = (cx, cy, r, fill, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${extra ? ` ${extra}` : ''}></circle>`;
const oval = (cx, cy, rx, ry, fill, extra = '') =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${extra ? ` ${extra}` : ''}></ellipse>`;
// The left half of a figure, drawn again mirrored for the right half.
const mirror = (markup) => `${markup}<g transform="matrix(-1 0 0 1 64 0)">${markup}</g>`;
const outline = (d, width = 1.1) => stroke(d, LINE, width);

// The medallion behind the bust: a lit glade.
const background = (uid) =>
  `<defs><radialGradient id="bg-${uid}" cx="50%" cy="38%" r="72%">` +
  '<stop offset="0" stop-color="#2e3d27"></stop><stop offset="0.55" stop-color="#18210f"></stop><stop offset="1" stop-color="#0b0f09"></stop>' +
  `</radialGradient></defs><rect width="64" height="64" fill="url(#bg-${uid})"></rect>`;

const SHOULDERS = 'M32.6 64 L4 64 C5 54 10 46 18 42 L32.6 40 Z';
const HOOD = 'M32.6 8 C25 9 19 15 18 24 C17 31 18 38 20 43 C24 45 28 46 32.6 46 Z';
const FACE = 'M32.6 21 C28.6 21 25 23.6 24.4 27.6 C24 31.6 25 35.6 27 38 C28.6 39.6 30.6 40.2 32.6 40.2 Z';
const eyes = (y = 29.6, r = 1.1) => mirror(dot(28.4, y, r * 2.6, EYE, 'opacity="0.22"') + dot(28.4, y, r, EYE));

const CLASSES = {
  warrior: () =>
    path('M2 40 C2 34 8 31 14 31 C20 31 26 34 26 40 C26 52 20 59 14 63.4 C8 59 2 52 2 40 Z', '#4a3d2c', `stroke="${LINE}" stroke-width="1.1"`) +
    stroke('M14 32 V62.4 M3 41.6 H25', '#6b5a3e', 1.4) +
    dot(14, 44, 2.6, '#9aa096', `stroke="${LINE}" stroke-width="0.6"`) +
    stroke('M43.6 21.6 L56.4 18.8', '#8a7350', 2.8) +
    stroke('M49.4 20.2 L48.4 11.4', '#4a3d2c', 2.8) +
    dot(48.2, 9.6, 2.1, GOLD, `stroke="${INK}" stroke-width="0.5"`) +
    mirror(
      path(SHOULDERS, '#5d6459') +
        stroke('M8 58 C14 54 20 52 26 51.6 M6 63 C13 58.6 20 57 26 56.4 M11 52 C16 48.6 21 47 26.6 46.6', '#454c42', 0.9, 'stroke-dasharray="1 1.1"') +
        path('M32.6 64 L23.6 64 L25.6 46.4 L32.6 45 Z', '#7a2e22') +
        path('M32.6 14 C25 14 18.6 19 18 27 C17.6 34 18 40 20 44 L32.6 46.4 Z', '#5d6459') +
        path('M32.6 24 C29 24 25.6 25.6 24.6 29 C24 32 24.6 36 26 38.6 C28 40.6 30.6 41 32.6 41 Z', VOID) +
        path('M32.6 9 C25.6 9 20 13.6 19.6 21 L19.6 25 C24 23.2 28 22.6 32.6 22.6 Z', '#9aa096') +
        outline('M32.6 9 C25.6 9 20 13.6 19.6 21 L19.6 25 C24 23.2 28 22.6 32.6 22.6') +
        stroke('M19.8 24.6 C24 22.8 28 22.2 32.6 22.2', '#6c7268', 1.6) +
        dot(22.2, 23.4, 0.55, PALE) +
        dot(26.6, 22.6, 0.55, PALE) +
        path('M31.2 22 L31.2 33 L32.6 34.4 L32.6 22 Z', '#9aa096') +
        outline('M18 27 C17.6 34 18 40 20 44 M4 64 C5 54 10 46 18 42'),
    ) +
    eyes(31, 1.05) +
    stroke('M23.4 17.6 C24.4 13.8 27.4 11.8 30.2 11.2', PALE, 0.9, 'opacity="0.5"'),
  archer: () =>
    stroke('M14 2 C1.6 18 1.6 46 14 62', '#6b5a3e', 2.6) +
    stroke('M14 2 L14 62', PALE, 0.6, 'opacity="0.8"') +
    path('M43.6 11 L53.6 6.4 L58.4 26.4 L48.4 30.4 Z', '#5a4030', `stroke="${LINE}" stroke-width="1"`) +
    stroke('M45.6 18.6 L55.6 14.4', '#3e2c1c', 1) +
    path('M45.4 10 L43 3.4 L46.8 4.8 Z', '#c8553d') +
    path('M49.4 8.2 L48.6 1.6 L51.8 3.4 Z', PALE) +
    path('M53.4 6.4 L53.6 0.4 L56.4 2.6 Z', '#c8553d') +
    mirror(
      path(SHOULDERS, '#3d4a2e') +
        path(HOOD, '#4a5a36') +
        path(FACE, VOID) +
        stroke('M24.4 27.6 C25 23.6 28.6 21 32.6 21', '#6f8050', 1) +
        outline('M32.6 8 C25 9 19 15 18 24 C17 31 18 38 20 43 M4 64 C5 54 10 46 18 42'),
    ) +
    stroke('M18 46 L44 64', '#5a4030', 2.4) +
    eyes(),
  mage: () =>
    stroke('M54.6 64 L50.4 13', '#6b5a3e', 2.8) +
    dot(50, 8.4, 9, EYE, 'opacity="0.12"') +
    dot(50, 8.4, 5.6, EYE, 'opacity="0.22"') +
    path('M50 1.4 L54.2 8.6 L50 15.6 L45.8 8.6 Z', EYE, `stroke="${PALE}" stroke-width="0.7"`) +
    path('M50 1.4 L50 15.6 L45.8 8.6 Z', '#5fc1d1') +
    mirror(
      path(SHOULDERS, '#2c3a4a') +
        path('M32.6 3 C28 7 21 13 19 22 C17.6 30 18 38 20 43 C24 45 28 46 32.6 46 Z', '#34465a') +
        path(FACE, VOID) +
        stroke('M24.4 27.6 C25 23.6 28.6 21 32.6 21', '#56708c', 1) +
        outline('M32.6 3 C28 7 21 13 19 22 C17.6 30 18 38 20 43 M4 64 C5 54 10 46 18 42'),
    ) +
    stroke('M30 53 L32.6 48.4 L35.2 53 M32.6 48.4 L32.6 57', EYE, 0.9, 'opacity="0.85"') +
    [[12, 20, 0.6], [8, 30, 0.45], [57, 32, 0.5], [41, 6, 0.4]].map(([x, y, r]) => dot(x, y, r, EYE)).join('') +
    eyes(29.6, 1.3),
  cleric: () =>
    stroke('M56.4 64 L50 23', '#8a7350', 2.6) +
    dot(49, 18.4, 4.6, '#9aa096', `stroke="${LINE}" stroke-width="1"`) +
    [[47.6, 17], [50.4, 17.6], [48.6, 19.8], [50.8, 20.2], [47, 19.6]].map(([x, y]) => dot(x, y, 0.55, VOID)).join('') +
    mirror(
      path(SHOULDERS, '#a89c80') +
        path('M32.6 64 L27 64 L28.6 44 L32.6 43 Z', '#6b2e2a') +
        stroke('M27 64 L28.6 44', GOLD, 0.8) +
        path(HOOD, '#c4b896') +
        path(FACE, VOID) +
        stroke('M24.4 27.6 C25 23.6 28.6 21 32.6 21', GOLD, 1.3) +
        outline('M32.6 8 C25 9 19 15 18 24 C17 31 18 38 20 43 M4 64 C5 54 10 46 18 42'),
    ) +
    stroke('M32.6 48.6 V59.4 M28.6 52.6 H36.6', GOLD, 1.7) +
    eyes(),
  shadow: () =>
    mirror(
      stroke('M5 15 L21 38', '#c9cdc4', 2.2) +
        stroke('M21 38 L25.4 44.4', '#3a2e22', 2.6) +
        stroke('M17.6 40.4 L23.6 36', '#8a7350', 1.6) +
        path(SHOULDERS, '#1d1a24') +
        path(HOOD, '#26222e') +
        path(FACE, VOID) +
        path('M32.6 31.6 C28.4 31.6 25.6 32 24.8 32.6 C25.2 35.8 27 38.6 29 39.8 C30.2 40.4 31.4 40.6 32.6 40.6 Z', '#3a3546') +
        stroke('M24.8 32.6 C27.6 31.8 30 31.6 32.6 31.6', '#57506a', 0.9) +
        stroke('M24.4 27.6 C25 23.6 28.6 21 32.6 21', '#3e3848', 1) +
        outline('M32.6 8 C25 9 19 15 18 24 C17 31 18 38 20 43 M4 64 C5 54 10 46 18 42'),
    ) + mirror(oval(28.4, 28.6, 3.8, 1.8, EYE, 'opacity="0.2"') + oval(28.4, 28.6, 1.7, 0.75, EYE)),
};

// A small counter keeps the gradient ids of each drawing apart.
let drawn = 0;

export function classMarkup(classId, { uid = 'c' } = {}) {
  const draw = CLASSES[classId];
  return draw ? background(uid) + draw() : null;
}

// The bust of a class, or null when it has none (the caller keeps its icon).
export function classArt(classId) {
  drawn += 1;
  const markup = classMarkup(classId, { uid: `c${drawn}` });
  if (!markup) return null;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'class-art');
  svg.innerHTML = markup;
  return svg;
}

export const classArtIds = Object.keys(CLASSES);

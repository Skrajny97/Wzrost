// The camp board: the glade with its paths, and each building at three looks
// (levels 1–3, 4–7 and 8–10), as an empty plot and under construction. A look
// with a Retro Diffusion picture (SPRITES.camp in art.js) shows it; the others
// keep the vector stand-ins below, drawn in the colours of the inner regions'
// scenes. Fixed markup only: no game data goes into these strings.

import { campArt } from './art.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const LINE = '#b9ae94';
const WOOD = '#4a3d2c';
const WOOD_DARK = '#3a2e22';
const WOOD_LIGHT = '#6b5a3e';
const PLANK = '#8a7350';
const STONE = '#5d6459';
const STONE_DARK = '#454c42';
const STONE_LIGHT = '#7a8173';
const METAL = '#9aa096';
const HOLE = '#0d110b';
const CLOTH = '#a89676';
const FIRE = '#d9b45a';
const EMBER = '#c46a2b';
const RUST = '#a0522d';
const HIDE = '#8c6a48';
const HIDE_DARK = '#6e5238';

// The board is 360 × 400; each plot's art box is 104 × 83, centred at x, y.
export const BOARD_WIDTH = 360;
export const BOARD_HEIGHT = 400;
export const PLOT_WIDTH = 104;
export const PLOT_HEIGHT = 83;

// In the left column, plots one above another stay 21 apart: a name hangs
// 11 below its plot, and the narrator's ring stands 6 off the plot it lights.
export const CAMP_PLOTS = {
  sawmill: { x: 74, y: 48 },
  // Staw Midasa, where the pond at the edge of the glade lay.
  'midas-lake': { x: 70, y: 152 },
  quarry: { x: 286, y: 86 },
  mine: { x: 258, y: 318 },
  campfire: { x: 180, y: 192 },
  'loot-shed': { x: 70, y: 256 },
  'scrap-bench': { x: 290, y: 214 },
  anvil: { x: 180, y: 64 },
  'craft-table': { x: 112, y: 342 },
};

// The size of a building's drawing at a level.
export const buildingTier = (level) => (level >= 8 ? 3 : level >= 4 ? 2 : 1);

const log = (x, y, w, h, fill = WOOD) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}" stroke="${LINE}" stroke-width="0.8"></rect>` +
  `<ellipse cx="${x + w - h / 3}" cy="${y + h / 2}" rx="${h / 3}" ry="${h / 2 - 0.4}" fill="${PLANK}" stroke="${LINE}" stroke-width="0.6"></ellipse>`;
const pole = (x1, y1, x2, y2, width = 2.4, color = WOOD_LIGHT) =>
  `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"></path>`;
const rock = (points, fill = STONE) => `<path d="M${points} Z" fill="${fill}" stroke="${LINE}" stroke-width="0.8"></path>`;
const block = (x, y, w, h) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${STONE_LIGHT}" stroke="${LINE}" stroke-width="0.7"></rect>` +
  `<path d="M${x} ${y + 2} h${w}" stroke="#9aa196" stroke-width="0.6"></path>`;
const flame = (x, y, size) =>
  `<ellipse cx="${x}" cy="${y + size * 0.15}" rx="${size * 1.6}" ry="${size * 0.55}" fill="${FIRE}" opacity="0.12"></ellipse>` +
  `<path d="M${x} ${y - size * 1.4} C${x + size * 0.9} ${y - size * 0.6} ${x + size * 0.8} ${y - size * 0.1} ${x + size * 0.45} ${y} L${x - size * 0.45} ${y} C${x - size * 0.8} ${y - size * 0.15} ${x - size * 0.7} ${y - size * 0.8} ${x} ${y - size * 1.4} Z" fill="${FIRE}"></path>` +
  `<path d="M${x} ${y - size * 0.8} C${x + size * 0.4} ${y - size * 0.4} ${x + size * 0.35} ${y - size * 0.1} ${x + size * 0.2} ${y} L${x - size * 0.2} ${y} C${x - size * 0.35} ${y - size * 0.1} ${x - size * 0.3} ${y - size * 0.45} ${x} ${y - size * 0.8} Z" fill="${EMBER}"></path>`;
// An anvil whose base stands at y, its horn to the left.
const anvil = (x, y, size = 1) => `<g transform="translate(${x} ${y - 5 * size}) scale(${size})">
<path d="M-17 -6 Q-12 -8.5 -8 -8.5 H14 V-3 H8 L6 2 H10 V5 H-10 V2 H-6 L-8 -3 H-10 Q-14 -3 -17 -6 Z" fill="#4f5550" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M-8 -7.8 H13.4" stroke="${METAL}" stroke-width="1"></path>
</g>`;
const tufts = (spots) =>
  spots.map(([x, y]) => `<path d="M${x - 3} ${y} l1.5 -4 l1.5 4 l1.5 -5 l1.5 5" stroke="#5f7a3f" stroke-width="1" fill="none"></path>`).join('');

const GROUND = `<ellipse cx="50" cy="66" rx="45" ry="12" fill="#2a2519"></ellipse><ellipse cx="50" cy="66" rx="45" ry="12" fill="none" stroke="#3a3324" stroke-width="1"></ellipse>`;

// Staw Midasa: dark water with a glint of light, reeds, the trapper's pan
// and specks of gold.
const POND = `<ellipse cx="50" cy="62" rx="44" ry="15" fill="#16242a" stroke="#28393d" stroke-width="1.5"></ellipse>
<ellipse cx="40" cy="58" rx="15" ry="3.2" fill="#8fe3ef" opacity="0.08"></ellipse>
<ellipse cx="62" cy="67" rx="9" ry="2.3" fill="#8fe3ef" opacity="0.07"></ellipse>`;
const reeds = (spots) =>
  spots.map(([x, y]) => `<path d="M${x} ${y} q2 -10 0 -16 M${x + 4} ${y + 3} q3 -9 2 -14" stroke="#5f7a3f" stroke-width="1.2" fill="none"></path>`).join('');
const specks = (spots) => spots.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.9" fill="${FIRE}" opacity="0.85"></circle>`).join('');
// A shallow trapper's pan with gold in it, its rim at y.
const pan = (x, y) =>
  `<path d="M${x - 9} ${y} Q${x} ${y + 8} ${x + 9} ${y} Z" fill="#7d6a4a" stroke="${LINE}" stroke-width="0.8"></path>` +
  `<ellipse cx="${x}" cy="${y}" rx="9" ry="2.2" fill="#5a4a33" stroke="${LINE}" stroke-width="0.6"></ellipse>` +
  `<circle cx="${x - 2}" cy="${y}" r="1" fill="${FIRE}"></circle><circle cx="${x + 2.5}" cy="${y - 0.3}" r="0.8" fill="${FIRE}"></circle>`;
// A wooden sluice slanting into the water, with its riffles.
const SLUICE = `<path d="M10 46 L40 56 L40 61 L10 51 Z" fill="${WOOD}" stroke="${LINE}" stroke-width="0.7"></path>
<path d="M16 49.5 l0 4 M22 51.5 l0 4 M28 53.5 l0 4 M34 55.5 l0 4" stroke="${PLANK}" stroke-width="0.9"></path>
${pole(14, 52, 14, 64, 1.8)}${pole(34, 59, 34, 68, 1.8)}`;

// Each building: its drawing at tiers 1, 2 and 3 (without the ground).
const BUILDINGS = {
  // A saw-horse by a pile of logs; then a lean-to over it; then a shed and planks.
  sawmill: [
    () => `${log(8, 54, 34, 8)}${log(10, 47, 30, 8)}${log(14, 40, 24, 8)}
${pole(54, 70, 64, 52)}${pole(64, 70, 54, 52)}${pole(76, 70, 86, 52)}${pole(86, 70, 76, 52)}
${log(48, 49, 44, 8, '#5a4a33')}
<path d="M60 49 q9 -15 18 0" stroke="${PLANK}" stroke-width="1.6" fill="none"></path>
<path d="M60 49 h18" stroke="${METAL}" stroke-width="1.2"></path>
<path d="M62 71 l2 -1 M68 72 l2 -1 M74 71 l2 -1" stroke="#c9a14a" stroke-width="1.2" opacity="0.7"></path>`,
    () => `${log(6, 56, 34, 8)}${log(8, 49, 30, 8)}${log(10, 42, 28, 8)}${log(14, 35, 22, 8)}
${pole(48, 72, 48, 22, 2.6)}${pole(94, 72, 94, 16, 2.6)}
<path d="M42 26 L98 14 L98 21 L42 33 Z" fill="${WOOD_DARK}" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M50 24 v7 M60 22 v7 M70 20 v7 M80 18 v7 M90 16 v7" stroke="${WOOD}" stroke-width="0.8"></path>
${pole(56, 70, 66, 52)}${pole(66, 70, 56, 52)}${pole(76, 70, 86, 52)}${pole(86, 70, 76, 52)}
${log(50, 49, 42, 8, '#5a4a33')}
<path d="M62 49 q9 -15 18 0" stroke="${PLANK}" stroke-width="1.6" fill="none"></path>
<path d="M62 49 h18" stroke="${METAL}" stroke-width="1.2"></path>`,
    () => `<path d="M4 24 L24 8 L44 24 Z" fill="${WOOD_DARK}" stroke="${LINE}" stroke-width="0.8"></path>
<rect x="8" y="24" width="32" height="26" fill="${WOOD}" stroke="${LINE}" stroke-width="0.8"></rect>
<path d="M8 31 h32 M8 38 h32 M8 45 h32" stroke="${WOOD_DARK}" stroke-width="0.8"></path>
<rect x="19" y="33" width="10" height="17" fill="#2b2219" stroke="${LINE}" stroke-width="0.7"></rect>
${log(4, 58, 30, 7)}${log(8, 51, 24, 7)}
${pole(48, 72, 48, 22, 2.6)}${pole(94, 72, 94, 16, 2.6)}
<path d="M42 26 L98 14 L98 21 L42 33 Z" fill="${WOOD_DARK}" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M50 24 v7 M60 22 v7 M70 20 v7 M80 18 v7 M90 16 v7" stroke="${WOOD}" stroke-width="0.8"></path>
${pole(56, 70, 66, 52)}${pole(66, 70, 56, 52)}${pole(76, 70, 86, 52)}${pole(86, 70, 76, 52)}
${log(50, 49, 42, 8, '#5a4a33')}
<path d="M62 49 q9 -15 18 0" stroke="${PLANK}" stroke-width="1.6" fill="none"></path>
<path d="M62 49 h18" stroke="${METAL}" stroke-width="1.2"></path>
<path d="M36 70 h18 v-3 h-18 Z M38 66 h16 v-3 h-16 Z" fill="${PLANK}" stroke="${LINE}" stroke-width="0.6"></path>`,
  ],

  // A rock face with cut blocks and a pick; then a crane; then a cart.
  quarry: [
    () => `${rock('8 64 L13 36 L28 24 L46 28 L60 18 L78 28 L90 46 L92 64')}
<path d="M30 25 L35 46 M60 19 L56 40 M78 29 L70 48" stroke="${STONE_DARK}" stroke-width="1.2"></path>
<path d="M35 46 L56 40 L58 64 L37 64 Z" fill="${STONE_LIGHT}" opacity="0.55"></path>
${block(58, 58, 12, 8)}${block(72, 60, 10, 7)}
${pole(20, 70, 32, 48, 2, PLANK)}
<path d="M26 47 q6 -3 11 3" stroke="${METAL}" stroke-width="2.2" fill="none" stroke-linecap="round"></path>`,
    () => `${rock('6 64 L11 36 L26 24 L44 28 L58 18 L76 28 L88 46 L90 64')}
<path d="M28 25 L33 46 M58 19 L54 40 M76 29 L68 48" stroke="${STONE_DARK}" stroke-width="1.2"></path>
<path d="M33 46 L54 40 L56 64 L35 64 Z" fill="${STONE_LIGHT}" opacity="0.55"></path>
${pole(60, 70, 76, 14)}${pole(94, 70, 76, 14)}
<path d="M76 14 V46" stroke="${CLOTH}" stroke-width="0.9"></path>
${block(71, 46, 10, 7)}
${block(10, 60, 12, 7)}${block(24, 61, 11, 6)}${block(16, 54, 11, 6)}
${pole(40, 72, 50, 52, 2, PLANK)}
<path d="M44 51 q6 -3 11 3" stroke="${METAL}" stroke-width="2.2" fill="none" stroke-linecap="round"></path>`,
    () => `${rock('6 62 L10 30 L24 16 L42 20 L58 10 L76 20 L90 40 L92 62')}
<path d="M10 40 H86 M12 51 H90" stroke="${STONE_DARK}" stroke-width="1.2"></path>
<path d="M26 17 L31 40 M58 11 L54 40 M76 21 L70 40" stroke="${STONE_DARK}" stroke-width="1.2"></path>
<path d="M31 40 L54 40 L56 62 L33 62 Z" fill="${STONE_LIGHT}" opacity="0.55"></path>
${pole(62, 70, 78, 12)}${pole(96, 70, 78, 12)}
<path d="M78 12 V44" stroke="${CLOTH}" stroke-width="0.9"></path>
${block(73, 44, 10, 7)}
<rect x="8" y="54" width="26" height="11" fill="${WOOD}" stroke="${LINE}" stroke-width="0.8"></rect>
<path d="M12 54 q3 -5 6 0 q3 -5 6 0 q3 -5 6 0" fill="${STONE_LIGHT}" stroke="${LINE}" stroke-width="0.6"></path>
<circle cx="14" cy="67" r="4" fill="${WOOD_DARK}" stroke="${LINE}" stroke-width="0.8"></circle>
<circle cx="28" cy="67" r="4" fill="${WOOD_DARK}" stroke="${LINE}" stroke-width="0.8"></circle>
${block(40, 62, 11, 7)}${block(52, 63, 10, 6)}`,
  ],

  // A timbered tunnel in a mound; then rails and a cart; then a winch and lanterns.
  mine: [
    () => `<path d="M4 68 Q10 32 38 22 Q60 15 80 27 Q96 40 96 68 Z" fill="#2c3324" stroke="${LINE}" stroke-width="0.8"></path>
${rock('14 50 L20 44 L26 48 L24 54', STONE_DARK)}${rock('76 44 L84 40 L90 48 L82 52', STONE_DARK)}
<path d="M38 68 V46 Q50 34 62 46 V68 Z" fill="${HOLE}"></path>
<rect x="35" y="44" width="4" height="24" fill="${WOOD_LIGHT}" stroke="${LINE}" stroke-width="0.7"></rect>
<rect x="61" y="44" width="4" height="24" fill="${WOOD_LIGHT}" stroke="${LINE}" stroke-width="0.7"></rect>
<rect x="32" y="40" width="36" height="5" fill="#5a4a33" stroke="${LINE}" stroke-width="0.7"></rect>
${rock('70 66 L74 60 L80 62 L80 68', STONE)}<circle cx="75" cy="64" r="1.3" fill="${RUST}"></circle>
${rock('82 68 L85 63 L90 64 L90 69', STONE)}<circle cx="86" cy="66" r="1" fill="${RUST}"></circle>`,
    () => `<path d="M4 68 Q10 32 38 22 Q60 15 80 27 Q96 40 96 68 Z" fill="#2c3324" stroke="${LINE}" stroke-width="0.8"></path>
${rock('14 50 L20 44 L26 48 L24 54', STONE_DARK)}${rock('76 44 L84 40 L90 48 L82 52', STONE_DARK)}
<path d="M38 68 V46 Q50 34 62 46 V68 Z" fill="${HOLE}"></path>
<rect x="35" y="44" width="4" height="24" fill="${WOOD_LIGHT}" stroke="${LINE}" stroke-width="0.7"></rect>
<rect x="61" y="44" width="4" height="24" fill="${WOOD_LIGHT}" stroke="${LINE}" stroke-width="0.7"></rect>
<rect x="32" y="40" width="36" height="5" fill="#5a4a33" stroke="${LINE}" stroke-width="0.7"></rect>
<path d="M44 66 L40 79 M56 66 L60 79" stroke="${METAL}" stroke-width="1.2"></path>
<path d="M42 70 h16 M41 75 h18" stroke="${WOOD_LIGHT}" stroke-width="1.4"></path>
<path d="M64 58 L84 58 L81 68 L67 68 Z" fill="${STONE}" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M66 58 q4 -6 8 -1 q4 -5 8 1 Z" fill="#7a5a44" stroke="${LINE}" stroke-width="0.6"></path>
<circle cx="70" cy="69" r="2.4" fill="${HOLE}" stroke="${LINE}" stroke-width="0.6"></circle>
<circle cx="79" cy="69" r="2.4" fill="${HOLE}" stroke="${LINE}" stroke-width="0.6"></circle>`,
    () => `<path d="M4 68 Q10 30 38 20 Q60 13 80 25 Q96 38 96 68 Z" fill="#2c3324" stroke="${LINE}" stroke-width="0.8"></path>
${pole(18, 36, 28, 6, 2.2)}${pole(38, 30, 28, 6, 2.2)}
<circle cx="28" cy="8" r="5" fill="none" stroke="${METAL}" stroke-width="1.4"></circle>
<path d="M28 8 V30" stroke="${CLOTH}" stroke-width="0.8"></path>
<path d="M38 68 V44 Q50 31 62 44 V68 Z" fill="${HOLE}"></path>
<rect x="35" y="42" width="4" height="26" fill="${WOOD_LIGHT}" stroke="${LINE}" stroke-width="0.7"></rect>
<rect x="61" y="42" width="4" height="26" fill="${WOOD_LIGHT}" stroke="${LINE}" stroke-width="0.7"></rect>
<rect x="31" y="37" width="38" height="6" fill="#5a4a33" stroke="${LINE}" stroke-width="0.7"></rect>
<circle cx="33" cy="49" r="2.2" fill="${FIRE}"></circle><circle cx="33" cy="49" r="5" fill="${FIRE}" opacity="0.18"></circle>
<circle cx="67" cy="49" r="2.2" fill="${FIRE}"></circle><circle cx="67" cy="49" r="5" fill="${FIRE}" opacity="0.18"></circle>
<path d="M44 66 L40 79 M56 66 L60 79" stroke="${METAL}" stroke-width="1.2"></path>
<path d="M42 70 h16 M41 75 h18" stroke="${WOOD_LIGHT}" stroke-width="1.4"></path>
<path d="M64 58 L84 58 L81 68 L67 68 Z" fill="${STONE}" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M66 58 q4 -6 8 -1 q4 -5 8 1 Z" fill="#7a5a44" stroke="${LINE}" stroke-width="0.6"></path>
<circle cx="70" cy="69" r="2.4" fill="${HOLE}" stroke="${LINE}" stroke-width="0.6"></circle>
<circle cx="79" cy="69" r="2.4" fill="${HOLE}" stroke="${LINE}" stroke-width="0.6"></circle>`,
  ],

  // A pond with reeds and the trapper's pan at its edge; then a sluice
  // washing the silt; then a small pier with a lantern and a sack of gold.
  'midas-lake': [
    () => `${POND}${reeds([[10, 60], [84, 64]])}${pan(70, 56)}${specks([[34, 62], [48, 67], [56, 59]])}`,
    () => `${POND}${SLUICE}${reeds([[84, 64]])}${pan(70, 56)}${specks([[34, 64], [48, 67], [56, 59], [44, 60]])}`,
    () => `${POND}${SLUICE}
<rect x="56" y="49" width="38" height="4.5" fill="${PLANK}" stroke="${LINE}" stroke-width="0.6"></rect>
${pole(60, 53, 60, 66, 2)}${pole(88, 53, 88, 64, 2)}
${pole(92, 49, 92, 24, 2)}<circle cx="92" cy="22" r="2.4" fill="${FIRE}"></circle><circle cx="92" cy="22" r="6.5" fill="${FIRE}" opacity="0.18"></circle>
<path d="M66 49 Q64 40 70 38 Q76 40 74 49 Z" fill="${CLOTH}" stroke="${LINE}" stroke-width="0.7"></path><circle cx="70" cy="37.5" r="1.4" fill="${FIRE}"></circle>
${pan(80, 47)}${specks([[34, 64], [48, 67], [56, 60], [44, 60], [28, 66]])}`,
  ],

  // A fire in a ring of stones; then seats and a cauldron; then torches.
  campfire: [
    () => `${log(10, 56, 22, 7)}
${[[34, 64], [40, 59], [50, 57], [60, 59], [66, 64], [58, 68], [42, 68], [50, 69]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="4.2" ry="3" fill="${STONE}" stroke="${LINE}" stroke-width="0.6"></ellipse>`).join('')}
${pole(40, 64, 60, 58, 3, WOOD)}${pole(60, 64, 40, 58, 3, WOOD)}
${flame(50, 61, 14)}`,
    () => `${log(6, 56, 22, 7)}${log(72, 58, 22, 7)}
${[[34, 64], [40, 59], [50, 57], [60, 59], [66, 64], [58, 68], [42, 68], [50, 69]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="4.2" ry="3" fill="${STONE}" stroke="${LINE}" stroke-width="0.6"></ellipse>`).join('')}
${pole(36, 68, 50, 14, 2)}${pole(64, 68, 50, 14, 2)}
${flame(50, 62, 11)}
<path d="M50 14 V30" stroke="${METAL}" stroke-width="1"></path>
<path d="M41 30 h18 q0 11 -9 13 q-9 -2 -9 -13 Z" fill="#2b2b2b" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M45 26 q2 -4 0 -7 M53 25 q2 -4 0 -7" stroke="${CLOTH}" stroke-width="0.8" fill="none" opacity="0.6"></path>`,
    () => `${log(4, 58, 22, 7)}${log(74, 58, 22, 7)}${log(26, 70, 20, 6)}${log(56, 70, 20, 6)}
${[[32, 64], [38, 58], [50, 56], [62, 58], [68, 64], [60, 69], [40, 69], [50, 70]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="4.6" ry="3.2" fill="${STONE_LIGHT}" stroke="${LINE}" stroke-width="0.6"></ellipse>`).join('')}
${pole(36, 68, 50, 14, 2)}${pole(64, 68, 50, 14, 2)}
${flame(50, 63, 12)}
<path d="M50 14 V30" stroke="${METAL}" stroke-width="1"></path>
<path d="M41 30 h18 q0 11 -9 13 q-9 -2 -9 -13 Z" fill="#2b2b2b" stroke="${LINE}" stroke-width="0.8"></path>
${pole(10, 58, 10, 26, 2)}${flame(10, 26, 5)}
${pole(90, 58, 90, 26, 2)}${flame(90, 26, 5)}`,
  ],

  // A lean-to of branches with a sack; then a hut and a crate; then a storehouse.
  'loot-shed': [
    () => `<path d="M16 68 L42 22 L70 68 Z" fill="#3a3124" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M42 22 L30 68 M42 22 L54 68 M24 54 L62 54 M30 42 L55 42" stroke="${WOOD_LIGHT}" stroke-width="1"></path>
<path d="M33 68 L42 48 L51 68 Z" fill="${HOLE}"></path>
<path d="M40 18 L42 22 L46 16" stroke="#5f7a3f" stroke-width="1.4" fill="none"></path>
<path d="M76 68 q-7 -1 -6 -10 q2 -8 9 -9 q7 1 9 9 q1 9 -6 10 Z" fill="${CLOTH}" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M76 50 l3 -4 l3 4" stroke="${WOOD}" stroke-width="1" fill="none"></path>`,
    () => `<path d="M10 40 L44 16 L80 40 Z" fill="${WOOD_DARK}" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M20 34 l-4 6 M30 27 l-4 9 M44 18 v20 M58 27 l4 9 M68 34 l4 6" stroke="${WOOD}" stroke-width="1"></path>
<rect x="16" y="40" width="58" height="28" fill="${WOOD}" stroke="${LINE}" stroke-width="0.8"></rect>
<path d="M16 47 h58 M16 54 h58 M16 61 h58" stroke="${WOOD_DARK}" stroke-width="0.8"></path>
<rect x="38" y="48" width="14" height="20" fill="#2b2219" stroke="${LINE}" stroke-width="0.7"></rect>
<rect x="78" y="56" width="14" height="12" fill="${WOOD_LIGHT}" stroke="${LINE}" stroke-width="0.8"></rect>
<path d="M78 56 L92 68 M92 56 L78 68" stroke="${WOOD}" stroke-width="0.9"></path>`,
    () => `<path d="M4 36 L46 8 L90 36 Z" fill="${WOOD_DARK}" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M16 30 l-4 6 M28 22 l-4 10 M46 10 v24 M64 22 l4 10 M76 30 l4 6" stroke="${WOOD}" stroke-width="1"></path>
<rect x="10" y="36" width="72" height="32" fill="${WOOD}" stroke="${LINE}" stroke-width="0.8"></rect>
<path d="M10 44 h72 M10 52 h72 M10 60 h72" stroke="${WOOD_DARK}" stroke-width="0.8"></path>
<rect x="38" y="46" width="16" height="22" fill="#2b2219" stroke="${LINE}" stroke-width="0.7"></rect>
<rect x="18" y="42" width="10" height="8" fill="${HOLE}" stroke="${LINE}" stroke-width="0.6"></rect>
<rect x="64" y="42" width="10" height="8" fill="${HOLE}" stroke="${LINE}" stroke-width="0.6"></rect>
<rect x="84" y="52" width="12" height="16" rx="3" fill="${WOOD_LIGHT}" stroke="${LINE}" stroke-width="0.8"></rect>
<path d="M84 57 h12 M84 63 h12" stroke="${METAL}" stroke-width="0.9"></path>
<path d="M2 68 q-1 -9 6 -10 q7 1 6 10 Z" fill="${CLOTH}" stroke="${LINE}" stroke-width="0.8"></path>`,
  ],

  // A stump with a hammer and scrap; then a workbench and an anvil; then an awning and a forge.
  'scrap-bench': [
    () => `<rect x="34" y="48" width="30" height="19" fill="${WOOD}" stroke="${LINE}" stroke-width="0.8"></rect>
<ellipse cx="49" cy="48" rx="15" ry="5" fill="${PLANK}" stroke="${LINE}" stroke-width="0.8"></ellipse>
<ellipse cx="49" cy="48" rx="8" ry="2.5" fill="none" stroke="${WOOD_LIGHT}" stroke-width="0.7"></ellipse>
${pole(40, 46, 52, 42, 1.6, WOOD_LIGHT)}<rect x="50" y="38" width="7" height="5" fill="${METAL}" stroke="${LINE}" stroke-width="0.6"></rect>
<path d="M70 68 L74 58 L80 60 L84 54 L90 60 L92 68 Z" fill="${STONE_DARK}" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M74 60 L86 66 M80 56 q5 -1 6 4" stroke="${METAL}" stroke-width="1.2" fill="none"></path>
<path d="M12 68 q2 -10 10 -10 q8 0 10 10 Z" fill="${METAL}" stroke="${LINE}" stroke-width="0.8" opacity="0.85"></path>`,
    () => `<rect x="22" y="40" width="54" height="6" fill="${WOOD_LIGHT}" stroke="${LINE}" stroke-width="0.8"></rect>
<rect x="26" y="46" width="4" height="22" fill="${WOOD}" stroke="${LINE}" stroke-width="0.7"></rect>
<rect x="68" y="46" width="4" height="22" fill="${WOOD}" stroke="${LINE}" stroke-width="0.7"></rect>
${pole(34, 38, 46, 34, 1.6, WOOD_LIGHT)}<rect x="44" y="30" width="7" height="5" fill="${METAL}" stroke="${LINE}" stroke-width="0.6"></rect>
<path d="M56 40 l8 -8 l3 3 l-8 8" fill="${METAL}" stroke="${LINE}" stroke-width="0.6"></path>
<rect x="6" y="58" width="14" height="10" fill="${WOOD}" stroke="${LINE}" stroke-width="0.7"></rect>
<path d="M2 52 h22 l-4 4 h-4 v2 h-6 v-2 h-4 Z" fill="#3c403a" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M78 68 L82 56 L88 58 L92 50 L98 58 L98 68 Z" fill="${STONE_DARK}" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M82 58 L94 66 M88 52 q5 -1 6 4" stroke="${METAL}" stroke-width="1.2" fill="none"></path>`,
    () => `${pole(18, 70, 18, 20, 2.4)}${pole(82, 70, 82, 20, 2.4)}
<path d="M10 22 L50 8 L90 22 L90 27 L10 27 Z" fill="${CLOTH}" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M22 27 v-9 M34 27 v-13 M46 27 v-17 M58 27 v-15 M70 27 v-11" stroke="#8c7a5c" stroke-width="2"></path>
<path d="M30 27 v6 M30 33 l-2 3 h4 Z M60 27 v5 M58 32 h4 v4 h-4 Z" stroke="${METAL}" stroke-width="0.9" fill="${METAL}"></path>
<rect x="24" y="42" width="52" height="6" fill="${WOOD_LIGHT}" stroke="${LINE}" stroke-width="0.8"></rect>
<rect x="28" y="48" width="4" height="20" fill="${WOOD}" stroke="${LINE}" stroke-width="0.7"></rect>
<rect x="68" y="48" width="4" height="20" fill="${WOOD}" stroke="${LINE}" stroke-width="0.7"></rect>
${pole(36, 40, 48, 36, 1.6, WOOD_LIGHT)}<rect x="46" y="32" width="7" height="5" fill="${METAL}" stroke="${LINE}" stroke-width="0.6"></rect>
<path d="M2 68 V52 Q2 44 10 44 Q18 44 18 52 V68 Z" fill="${STONE}" stroke="${LINE}" stroke-width="0.8"></path>
<ellipse cx="10" cy="56" rx="4" ry="3" fill="${EMBER}"></ellipse><ellipse cx="10" cy="56" rx="8" ry="6" fill="${FIRE}" opacity="0.16"></ellipse>
<path d="M80 68 L84 58 L90 60 L93 52 L98 60 L98 68 Z" fill="${STONE_DARK}" stroke="${LINE}" stroke-width="0.8"></path>`,
  ],
  // An anvil on a stump with a hammer and a bucket; then a stone hearth with
  // bellows and tongs; then a smithy under a roof, with a chimney and a barrel.
  anvil: [
  () => `<rect x="38" y="50" width="24" height="17" fill="${WOOD}" stroke="${LINE}" stroke-width="0.8"></rect>
<ellipse cx="50" cy="50" rx="12" ry="3.6" fill="${PLANK}" stroke="${LINE}" stroke-width="0.8"></ellipse>
${anvil(50, 50)}
${pole(66, 68, 74, 52, 1.8, WOOD_LIGHT)}<rect x="70" y="47" width="9" height="5" rx="1" fill="${METAL}" stroke="${LINE}" stroke-width="0.6" transform="rotate(-25 74.5 49.5)"></rect>
<path d="M18 68 L20 56 H32 L34 68 Z" fill="${WOOD_DARK}" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M19 61 H33" stroke="${METAL}" stroke-width="1"></path>
<ellipse cx="26" cy="56" rx="6" ry="1.6" fill="#2e4b52" stroke="${LINE}" stroke-width="0.6"></ellipse>`,
  () => `<path d="M6 68 V44 Q6 36 18 36 Q30 36 30 44 V68 Z" fill="${STONE}" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M10 50 Q18 42 26 50 V60 H10 Z" fill="${HOLE}"></path>
<ellipse cx="18" cy="55" rx="10" ry="7" fill="${FIRE}" opacity="0.16"></ellipse>
<ellipse cx="18" cy="58" rx="6" ry="2.6" fill="${EMBER}"></ellipse>${flame(18, 58, 4)}
<path d="M30 58 L40 53 L43 59 L33 64 Z" fill="#6b4a30" stroke="${LINE}" stroke-width="0.7"></path>
<path d="M40 53 L46 50" stroke="${WOOD_LIGHT}" stroke-width="1.4" stroke-linecap="round"></path>
<rect x="44" y="52" width="22" height="15" fill="${WOOD}" stroke="${LINE}" stroke-width="0.8"></rect>
<ellipse cx="55" cy="52" rx="11" ry="3.2" fill="${PLANK}" stroke="${LINE}" stroke-width="0.7"></ellipse>
${anvil(56, 52)}
${pole(78, 68, 78, 36, 2)}${pole(92, 68, 92, 36, 2)}<path d="M76 40 H94" stroke="${WOOD_LIGHT}" stroke-width="2" stroke-linecap="round"></path>
<path d="M81 40 v12 M83 40 v12 M88 40 v9 M86 49 h4" stroke="${METAL}" stroke-width="1"></path>`,
  () => `${pole(6, 68, 6, 26, 2.4)}${pole(94, 68, 94, 26, 2.4)}
<rect x="15" y="6" width="10" height="16" fill="${STONE_DARK}" stroke="${LINE}" stroke-width="0.7"></rect>
<path d="M20 6 q-4 -2 -1 -5" stroke="${CLOTH}" stroke-width="1.2" fill="none" opacity="0.55"></path>
<path d="M0 27 L50 12 L100 27 V31 H0 Z" fill="${WOOD_DARK}" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M12 29 v-4 M26 25 v-6 M40 21 v-7 M60 21 v-7 M74 25 v-6 M88 29 v-4" stroke="${WOOD}" stroke-width="1.2"></path>
<path d="M8 68 V46 Q8 38 20 38 Q32 38 32 46 V68 Z" fill="${STONE}" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M12 52 Q20 44 28 52 V62 H12 Z" fill="${HOLE}"></path>
<ellipse cx="20" cy="57" rx="11" ry="8" fill="${FIRE}" opacity="0.18"></ellipse>
<ellipse cx="20" cy="60" rx="6" ry="2.6" fill="${EMBER}"></ellipse>${flame(20, 60, 5)}
<rect x="44" y="52" width="22" height="15" fill="${WOOD}" stroke="${LINE}" stroke-width="0.8"></rect>
<ellipse cx="55" cy="52" rx="11" ry="3.2" fill="${PLANK}" stroke="${LINE}" stroke-width="0.7"></ellipse>
${anvil(56, 52, 1.1)}
<circle cx="63" cy="37" r="0.9" fill="${FIRE}"></circle><circle cx="67" cy="34" r="0.7" fill="${FIRE}"></circle><circle cx="59" cy="35" r="0.6" fill="${FIRE}"></circle>
<rect x="76" y="52" width="14" height="16" rx="2" fill="${WOOD}" stroke="${LINE}" stroke-width="0.8"></rect>
<path d="M76 57 h14 M76 63 h14" stroke="${METAL}" stroke-width="0.9"></path>
<ellipse cx="83" cy="52" rx="7" ry="2" fill="#2e4b52" stroke="${LINE}" stroke-width="0.6"></ellipse>`,
],
  // A plank on two trestles with a hide and a knife, and a basket of scraps;
  // then a workbench with a vice and a hide on a stretching frame; then a
  // workshop under a roof, with hides drying on a line and a lantern.
  'craft-table': [
  () => `<rect x="20" y="44" width="58" height="5" fill="${WOOD_LIGHT}" stroke="${LINE}" stroke-width="0.8"></rect>
${pole(28, 49, 23, 68, 2.2, WOOD)}${pole(28, 49, 33, 68, 2.2, WOOD)}${pole(70, 49, 65, 68, 2.2, WOOD)}${pole(70, 49, 75, 68, 2.2, WOOD)}
<path d="M27 44 q3 -6 10 -5 q6 -4 11 0 q5 -2 9 5 Z" fill="${HIDE}" stroke="${LINE}" stroke-width="0.7"></path>
<path d="M33 42 q6 -2 12 0" stroke="${HIDE_DARK}" stroke-width="0.8" fill="none"></path>
<path d="M60 42 l9 -3" stroke="${METAL}" stroke-width="1.4" stroke-linecap="round"></path>
<path d="M69 39 l5 -1.6" stroke="${WOOD_LIGHT}" stroke-width="2" stroke-linecap="round"></path>
<path d="M80 68 q0 -10 8 -10 q8 0 8 10 Z" fill="${WOOD_DARK}" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M81 63 h14" stroke="${PLANK}" stroke-width="0.8"></path>
<path d="M84 58 l2 -4 M88 58 l1 -5 M92 58 l-1 -4" stroke="${CLOTH}" stroke-width="1"></path>`,
  () => `${pole(8, 70, 8, 26, 2)}${pole(28, 70, 28, 26, 2)}
<path d="M5 29 H31 M5 62 H31" stroke="${WOOD_LIGHT}" stroke-width="2" stroke-linecap="round"></path>
<path d="M11 33 q7 -3 14 0 q2 12 0 25 q-7 3 -14 0 q-2 -13 0 -25 Z" fill="${HIDE}" stroke="${LINE}" stroke-width="0.7"></path>
<path d="M8 35 l3 1 M8 45 h3 M8 55 l3 -1 M28 35 l-3 1 M28 45 h-3 M28 55 l-3 -1" stroke="${CLOTH}" stroke-width="0.7"></path>
<rect x="36" y="42" width="56" height="6" fill="${WOOD_LIGHT}" stroke="${LINE}" stroke-width="0.8"></rect>
<rect x="40" y="48" width="4" height="20" fill="${WOOD}" stroke="${LINE}" stroke-width="0.7"></rect>
<rect x="84" y="48" width="4" height="20" fill="${WOOD}" stroke="${LINE}" stroke-width="0.7"></rect>
<rect x="44" y="58" width="40" height="3" fill="${WOOD}" stroke="${LINE}" stroke-width="0.6"></rect>
<rect x="80" y="35" width="9" height="7" fill="${METAL}" stroke="${LINE}" stroke-width="0.6"></rect>
<path d="M84.5 35 v-4 M80 31 h9" stroke="${METAL}" stroke-width="1.2"></path>
<path d="M46 40 q5 -5 12 -2 q4 -3 8 1 l-1 3 Z" fill="${HIDE_DARK}" stroke="${LINE}" stroke-width="0.6"></path>
<path d="M66 40 l8 -3" stroke="${METAL}" stroke-width="1.3" stroke-linecap="round"></path>
<path d="M50 56 h6 M60 56 h5 M70 56 h7" stroke="${CLOTH}" stroke-width="1.6"></path>`,
  () => `${pole(6, 68, 6, 24, 2.4)}${pole(94, 68, 94, 24, 2.4)}
<path d="M0 25 L50 10 L100 25 V29 H0 Z" fill="${WOOD_DARK}" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M12 27 v-4 M26 23 v-6 M40 19 v-6 M60 19 v-6 M74 23 v-6 M88 27 v-4" stroke="${WOOD}" stroke-width="1.2"></path>
<path d="M6 34 Q50 41 94 34" stroke="${CLOTH}" stroke-width="0.8" fill="none"></path>
<path d="M14 35.5 h10 v11 q-5 3 -10 0 Z" fill="${HIDE}" stroke="${LINE}" stroke-width="0.6"></path>
<path d="M30 37 h9 v10 q-4.5 3 -9 0 Z" fill="#7c7a64" stroke="${LINE}" stroke-width="0.6"></path>
<path d="M70 37 h9 v12 q-4.5 3 -9 0 Z" fill="${HIDE_DARK}" stroke="${LINE}" stroke-width="0.6"></path>
<path d="M50 29 v6" stroke="${METAL}" stroke-width="0.9"></path>
<rect x="46.5" y="35" width="7" height="8" rx="1.5" fill="${FIRE}" stroke="${LINE}" stroke-width="0.6"></rect>
<ellipse cx="50" cy="39" rx="9" ry="7" fill="${FIRE}" opacity="0.14"></ellipse>
<rect x="18" y="50" width="62" height="6" fill="${WOOD_LIGHT}" stroke="${LINE}" stroke-width="0.8"></rect>
<rect x="22" y="56" width="4" height="12" fill="${WOOD}" stroke="${LINE}" stroke-width="0.7"></rect>
<rect x="72" y="56" width="4" height="12" fill="${WOOD}" stroke="${LINE}" stroke-width="0.7"></rect>
<rect x="74" y="43" width="9" height="7" fill="${METAL}" stroke="${LINE}" stroke-width="0.6"></rect>
<path d="M30 48 q5 -5 12 -2 q4 -3 8 1 l-1 3 Z" fill="${HIDE}" stroke="${LINE}" stroke-width="0.6"></path>
<path d="M54 48 l9 -3" stroke="${METAL}" stroke-width="1.3" stroke-linecap="round"></path>
<rect x="84" y="50" width="12" height="18" rx="2" fill="${WOOD}" stroke="${LINE}" stroke-width="0.8"></rect>
<path d="M84 56 h12 M84 62 h12" stroke="${METAL}" stroke-width="0.9"></path>
<path d="M2 68 q0 -9 7 -9 q7 0 7 9 Z" fill="${WOOD_DARK}" stroke="${LINE}" stroke-width="0.8"></path>
<path d="M5 59 l1 -4 M9 59 l0 -5 M13 59 l-1 -4" stroke="${CLOTH}" stroke-width="1"></path>`,
],
};


// Stakes and a rope round the ground of a plot nobody has built on yet.
const EMPTY_PLOT = `<ellipse cx="50" cy="66" rx="45" ry="12" fill="#262116"></ellipse>
<ellipse cx="50" cy="66" rx="45" ry="12" fill="none" stroke="${PLANK}" stroke-width="1" stroke-dasharray="3 3"></ellipse>
<path d="M12 58 L50 52 L88 58 L74 76 L26 76 Z" fill="none" stroke="${CLOTH}" stroke-width="0.7" opacity="0.7"></path>
${[[12, 58], [50, 52], [88, 58], [74, 76], [26, 76]].map(([x, y]) => `<rect x="${x - 1.3}" y="${y - 7}" width="2.6" height="8" fill="${PLANK}" stroke="${LINE}" stroke-width="0.5"></rect>`).join('')}`;

// Poles and planks in front of a building being built or upgraded.
const SCAFFOLD = `<g opacity="0.95">
${pole(16, 72, 16, 18, 2.2, PLANK)}${pole(84, 72, 84, 18, 2.2, PLANK)}${pole(50, 72, 50, 26, 1.8, PLANK)}
<rect x="10" y="30" width="80" height="3.4" fill="${PLANK}" stroke="${LINE}" stroke-width="0.6"></rect>
<rect x="10" y="50" width="80" height="3.4" fill="${PLANK}" stroke="${LINE}" stroke-width="0.6"></rect>
<path d="M16 50 L50 33 M50 50 L84 33" stroke="${WOOD_LIGHT}" stroke-width="1.2"></path>
</g>`;

// Trees round the glade: [x, y, radius].
const TREES = [
  [-6, 14, 26], [22, 4, 22], [50, -2, 24], [80, 8, 20], [112, -4, 24], [142, 6, 20], [172, -6, 24], [204, 4, 22],
  [234, -4, 22], [262, 8, 18], [318, -2, 26], [352, 10, 24], [-8, 52, 22], [-10, 92, 20], [-4, 138, 18],
  [-12, 176, 22], [-8, 300, 22], [6, 396, 26], [38, 404, 20], [100, 410, 24], [366, 58, 22], [370, 104, 20],
  [364, 150, 18], [372, 276, 22], [350, 404, 24], [312, 410, 18],
];

// Firs between the trees: [x, y, size]; boulders by the quarry and the mine: [x, y, radius].
const FIRS = [[96, 24, 20], [250, 26, 18], [18, 116, 18], [16, 230, 20], [344, 128, 18], [348, 238, 20], [70, 396, 18], [330, 392, 20]];
const BOULDERS = [[318, 38, 14], [342, 60, 10], [296, 30, 8], [244, 42, 9], [232, 362, 7], [336, 334, 8], [300, 372, 6]];

const BOARD = `<defs><radialGradient id="camp-glade" cx="0.5" cy="0.52" r="0.62">
<stop offset="0" stop-color="#2d3b24"></stop><stop offset="0.72" stop-color="#222e1c"></stop><stop offset="1" stop-color="#151d12"></stop>
</radialGradient></defs>
<rect width="360" height="400" fill="url(#camp-glade)"></rect>
<path d="M212 400 Q236 300 300 286 Q340 280 360 296 V400 Z" fill="#1b2417"></path>
${BOULDERS.map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.72}" fill="${STONE_DARK}" stroke="#2a3322" stroke-width="1"></ellipse><ellipse cx="${x - r * 0.2}" cy="${y - r * 0.28}" rx="${r * 0.55}" ry="${r * 0.3}" fill="${STONE}" opacity="0.7"></ellipse>`).join('')}
<g fill="none" stroke-linecap="round">
<path d="M176 410 Q168 330 180 262 M180 230 Q140 170 84 126 M180 226 Q236 160 284 118 M170 236 Q120 252 76 266 M192 232 Q242 236 286 244 M188 244 Q220 300 252 338 M180 176 Q174 138 180 96 M171 332 Q150 330 128 340" stroke="#2a2218" stroke-width="16"></path>
<path d="M176 410 Q168 330 180 262 M180 230 Q140 170 84 126 M180 226 Q236 160 284 118 M170 236 Q120 252 76 266 M192 232 Q242 236 286 244 M188 244 Q220 300 252 338 M180 176 Q174 138 180 96 M171 332 Q150 330 128 340" stroke="#352b1f" stroke-width="10"></path>
</g>
${tufts([[128, 70], [232, 120], [140, 304], [326, 176], [36, 186], [212, 372], [118, 156], [252, 196], [150, 110], [40, 300], [320, 260]])}
<ellipse cx="128" cy="388" rx="16" ry="5" fill="${WOOD}" stroke="${LINE}" stroke-width="0.6" opacity="0.8" transform="rotate(-12 128 388)"></ellipse>
<ellipse cx="330" cy="146" rx="7" ry="4" fill="${PLANK}" stroke="${LINE}" stroke-width="0.6" opacity="0.8"></ellipse>
${FIRS.map(([x, y, size]) => `<path d="M${x} ${y - size} L${x + size * 0.55} ${y + size * 0.2} L${x + size * 0.3} ${y + size * 0.2} L${x + size * 0.7} ${y + size * 0.9} L${x - size * 0.7} ${y + size * 0.9} L${x - size * 0.3} ${y + size * 0.2} L${x - size * 0.55} ${y + size * 0.2} Z" fill="#132013" stroke="#1d2a19" stroke-width="1"></path>`).join('')}
${TREES.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#101710"></circle><circle cx="${x - r * 0.25}" cy="${y - r * 0.25}" r="${r * 0.7}" fill="#162114"></circle><circle cx="${x - r * 0.4}" cy="${y - r * 0.4}" r="${r * 0.3}" fill="#1d2a19"></circle>`).join('')}
<circle cx="150" cy="40" r="1.2" fill="${FIRE}" opacity="0.6"></circle><circle cx="214" cy="62" r="1" fill="${FIRE}" opacity="0.5"></circle>
<circle cx="40" cy="250" r="1" fill="${FIRE}" opacity="0.5"></circle><circle cx="330" cy="200" r="1.2" fill="${FIRE}" opacity="0.5"></circle>`;

export const campArtIds = Object.keys(BUILDINGS);

function svgElement(viewBox, className, markup) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', className);
  // Fixed markup from this file only; no game data goes into it.
  svg.innerHTML = markup;
  return svg;
}

// The share of the plot a picture fills at each look, so that a building
// grows on the board with its level.
const ART_SIZES = [0.64, 0.82, 1];

// A building's look: its picture, standing on the bottom of the plot over its
// shadow, or its vector stand-in. The picture's address is one of the fixed
// ones in art.js.
function look(buildingId, tier) {
  const src = campArt(buildingId, tier);
  if (!src) return (BUILDINGS[buildingId] ?? BUILDINGS.campfire)[tier - 1]();
  const size = ART_SIZES[tier - 1];
  const width = 100 * size;
  const height = 78 * size;
  return `<ellipse cx="50" cy="75" rx="${(width * 0.42).toFixed(1)}" ry="${(3 + 3 * size).toFixed(1)}" fill="#0b0f09" opacity="0.45"></ellipse>
<image href="${src}" x="${((100 - width) / 2).toFixed(1)}" y="${(78 - height).toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" preserveAspectRatio="xMidYMax meet"></image>`;
}

// The markup of a plot: the building at its level, an empty plot with a faint
// outline of what will stand there, or either behind scaffolding. A picture
// stands on its shadow; a vector drawing on the trodden earth.
export function plotMarkup(buildingId, { level, building = false }) {
  if (level <= 0) {
    return `${EMPTY_PLOT}<g opacity="${building ? 0.45 : 0.22}">${look(buildingId, 1)}</g>${building ? SCAFFOLD : ''}`;
  }
  const tier = buildingTier(level);
  return `${campArt(buildingId, tier) ? '' : GROUND}${look(buildingId, tier)}${building ? SCAFFOLD : ''}`;
}

export const boardMarkup = () => BOARD;

export const boardArt = () => svgElement(`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`, 'camp-board-art', BOARD);

export const plotArt = (buildingId, state) => svgElement('0 0 100 80', 'camp-plot-art', plotMarkup(buildingId, state));

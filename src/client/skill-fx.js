// How skills look in a fight's playback (arena.js): the skill's name pops up
// over its user, a sweep crosses the whole enemy row before its blows land
// (a blade's arc, an icy gust, columns of holy light, falling arrows),
// a skill blow lands with its own impact (a heavy crack, a fiery burst, a
// strike out of the shadows), a heal rises in green sparks, and a blessing,
// a shield or a dance of shadows wraps the character in its aura. Each skill
// has a look below, by its id in data/skills.json.

import { artChain, itemSprite, monsterSprite } from './art.js';
import { h } from './dom.js';
import { t } from './i18n.js';
import { playSkill } from './sound.js';

// cast: what plays when the skill wakes or a sweep starts; impact: extra
// on the target of the skill's own blow; color: its light.
export const SKILL_LOOKS = {
  'power-strike': { color: '#f6ecd6', impact: 'heavy' },
  'wide-sweep': { color: '#dfe7ea', cast: 'sweep' },
  unyielding: { color: '#d9b45a', cast: 'guard' },
  'aimed-shot': { color: '#ef9a85', impact: 'aim', glow: true },
  'arrow-rain': { color: '#e3cf98', cast: 'rain' },
  'pinning-shot': { color: '#c49a6c', impact: 'pin', glow: true },
  fireball: { color: '#ff8a3d', impact: 'fire', big: true },
  'frost-gust': { color: '#8fd3ff', cast: 'frost' },
  'mana-shield': { color: '#6fb6ff', cast: 'shield' },
  'prayer-of-health': { color: '#a7c47f', cast: 'heal' },
  exorcism: { color: '#f2d675', cast: 'holy' },
  blessing: { color: '#f2d675', cast: 'bless' },
  backstab: { color: '#a690e8', impact: 'shadow', teleport: true },
  'poisoned-blade': { color: '#9ccc65', cast: 'poison' },
  'shadow-dance': { color: '#a690e8', cast: 'dance' },
  // The evolutions' skills (data/evolutions.json), in the looks of the
  // skills they grow from until they have their own.
  'crushing-blow': { color: '#f6ecd6', impact: 'heavy', big: true },
  'blood-frenzy': { color: '#d9534f', cast: 'bless' },
  millstone: { color: '#dfe7ea', cast: 'sweep' },
  riposte: { color: '#e8d9a0' },
  indomitable: { color: '#d9b45a', cast: 'guard' },
  challenge: { color: '#e0a03c', cast: 'bless' },
  'piercing-shot': { color: '#ef9a85', impact: 'aim', glow: true },
  'ambush-shot': { color: '#c9b7ff', impact: 'aim', glow: true },
  'arrow-storm': { color: '#b9a8ff', cast: 'rain' },
  'storm-cloud': { color: '#b9a8ff', cast: 'holy' },
  'barbed-arrow': { color: '#c49a6c', impact: 'pin', glow: true },
  falcon: { color: '#d8c39a' },
  'fire-burst': { color: '#ff8a3d', impact: 'fire', big: true },
  'elemental-ray': { color: '#ffd27a', cast: 'holy' },
  blizzard: { color: '#8fd3ff', cast: 'frost' },
  'ice-lance': { color: '#bfe8ff', impact: 'heavy', glow: true },
  'mana-mirror': { color: '#9fc8ff', cast: 'shield' },
  'elemental-summon': { color: '#ffb36b', cast: 'bless' },
  renewal: { color: '#a7c47f', cast: 'heal' },
  miracle: { color: '#f2c14e', cast: 'heal' },
  judgement: { color: '#f2d675', cast: 'holy' },
  verdict: { color: '#f2d675', impact: 'heavy', glow: true },
  'great-blessing': { color: '#f2d675', cast: 'bless' },
  psalm: { color: '#cfe6a0', cast: 'bless' },
  execution: { color: '#a690e8', impact: 'shadow', teleport: true },
  'death-mark': { color: '#7b5fc7', impact: 'shadow' },
  'black-venom': { color: '#7fa34a', cast: 'poison' },
  'toxic-slime': { color: '#9ccc65', cast: 'poison' },
  'blade-dance': { color: '#a690e8', cast: 'dance' },
  'shadow-whirl': { color: '#a690e8', cast: 'sweep' },
  // The second forms' skills ("Druga ewolucja klas"), brighter or heavier
  // than the skills they grow from, until they have their own.
  'shattering-blow': { color: '#ffe2a8', impact: 'heavy', big: true, glow: true },
  'berserker-roar': { color: '#e8462f', cast: 'bless' },
  'steel-whirl': { color: '#f0f4f6', cast: 'sweep' },
  duel: { color: '#f2c14e', impact: 'aim' },
  unbending: { color: '#f2c14e', cast: 'guard' },
  'shield-wall': { color: '#d9b45a', cast: 'shield' },
  'heart-shot': { color: '#ff7a6b', impact: 'aim', glow: true, big: true },
  'target-lock': { color: '#ff7a6b', impact: 'aim' },
  'sky-thunder': { color: '#c9b7ff', cast: 'rain' },
  'thunder-orb': { color: '#c9b7ff', impact: 'aim', glow: true },
  harpoon: { color: '#b07d4f', impact: 'pin', glow: true, big: true },
  'wolf-call': { color: '#c8b49a', cast: 'bless' },
  'meteor-shower': { color: '#ff6a2a', cast: 'rain' },
  'elemental-harmony': { color: '#ffd27a', cast: 'bless' },
  'ice-star': { color: '#d6f1ff', impact: 'heavy', glow: true, big: true },
  'ice-armor': { color: '#a8e0ff', cast: 'shield' },
  'ent-summon': { color: '#7fb069', cast: 'bless' },
  'bear-summon': { color: '#a0784f', cast: 'bless' },
  'great-renewal': { color: '#b9d98f', cast: 'heal' },
  'life-aura': { color: '#d9f0a3', cast: 'bless' },
  'final-verdict': { color: '#ffe08a', impact: 'heavy', glow: true, big: true },
  pyre: { color: '#ffb347', cast: 'holy' },
  choir: { color: '#e6f2b8', cast: 'bless' },
  'divine-shield': { color: '#f2d675', cast: 'shield' },
  beheading: { color: '#b9a3f0', impact: 'shadow', teleport: true, big: true },
  vanish: { color: '#5d4a8f', cast: 'dance' },
  'raise-dead': { color: '#8fbf5a', cast: 'poison' },
  'curse-of-decay': { color: '#6b8f3a', cast: 'poison' },
  'blade-storm': { color: '#b9a3f0', cast: 'sweep' },
  'shadow-double': { color: '#4b3a73', cast: 'dance' },
  // The third forms' skills ("Trzecia ewolucja klas"), brighter or heavier
  // again, until they have their own.
  'smashing-blow': { color: '#fff1c9', impact: 'heavy', big: true, glow: true },
  slaughter: { color: '#c0392b', cast: 'sweep' },
  'steel-hurricane': { color: '#ffffff', cast: 'sweep' },
  cheers: { color: '#ffd24d', cast: 'bless' },
  unbroken: { color: '#ffd76a', cast: 'guard' },
  earthquake: { color: '#b08a5a', cast: 'sweep' },
  'master-shot': { color: '#ff5a4a', impact: 'aim', glow: true, big: true },
  'steady-hand': { color: '#9fe3b0', cast: 'bless' },
  'perun-wrath': { color: '#e0d4ff', cast: 'rain' },
  'thunder-sign': { color: '#b9a8ff', cast: 'bless' },
  'pack-leader': { color: '#f2efe6', cast: 'bless' },
  'eagle-talon': { color: '#d9b26b', impact: 'pin', glow: true },
  cataclysm: { color: '#ff7a3a', cast: 'rain' },
  'elemental-shield': { color: '#ffcf7a', cast: 'shield' },
  'ice-storm': { color: '#e6f7ff', cast: 'frost' },
  'ice-tomb': { color: '#bfefff', cast: 'frost' },
  'oak-awakening': { color: '#6fa058', cast: 'bless' },
  'bison-call': { color: '#8a6a45', cast: 'bless' },
  'miraculous-healing': { color: '#e3f5b0', cast: 'heal' },
  'holy-light': { color: '#fff3b0', cast: 'holy' },
  'last-judgment': { color: '#fff0a8', impact: 'heavy', glow: true, big: true },
  'holy-seal': { color: '#f2d675', cast: 'holy' },
  hymn: { color: '#f4fbd2', cast: 'bless' },
  vision: { color: '#d8e9ff', cast: 'bless' },
  'final-blow': { color: '#d6c2ff', impact: 'shadow', teleport: true, big: true },
  'blood-mark': { color: '#b3263b', impact: 'shadow' },
  'army-of-dead': { color: '#a6d96a', cast: 'poison' },
  'death-touch': { color: '#7fbf3f', impact: 'shadow' },
  'shadow-storm': { color: '#d0b8ff', cast: 'sweep' },
  eclipse: { color: '#2e2350', cast: 'dance' },
  // The skeleton Żniwo raises (combat.js RISEN).
  risen: { color: '#8fbf5a', cast: 'poison' },
};

const DEFAULT_LOOK = { color: '#8fe3ef' };
// A skill's look, or that of the skill it stands in with (art.js artChain).
export const lookOf = (event) => artChain(event.skill).map((id) => SKILL_LOOKS[id]).find(Boolean) ?? DEFAULT_LOOK;

// `kit` is what the arena shares: its cards, its effects layer and its
// animation helpers, so every animation here can be cancelled with the rest,
// and its measures: where an element stands on the arena's stage as its box
// (`boxOf`) or its middle (`centerOf`), by the page's layout, so the camera's
// zoom (arena-fx.js) does not shift them.
// The new looks of 956 (the author: „Sprawdź te [animacje] od umiejętności
// zaczynając od podstawowych”, „świetne nowe animacje niech zostają”):
// every skill drawn as a basic one is drawn the new way, the evolutions'
// skills in the looks they share with it too. A fireball flies in an arc and
// bursts; a gust of frost comes as a cone of snow and rimes the foes; a
// shield is a wall of hexagons over the card; an aimed shot locks a sight on
// its target and pierces it; a pinning shot leaves its arrow quivering in
// the ground with a coil of rope; a sweep is a giant blade's crescent; a
// guard brings a golden shield down. The arrows' rain is a volley loosed into
// the sky (the archers' rains only), and the warriors' heavy blows crack
// the ground.
for (const look of Object.values(SKILL_LOOKS)) {
  if (look.impact === 'fire') look.orb = 'fire';
  if (look.cast === 'frost') look.blizzard = true;
  if (look.cast === 'shield') look.hexwall = true;
  if (look.impact === 'aim') look.reticle = true;
  if (look.impact === 'pin') look.pinned = true;
  if (look.cast === 'sweep') look.crescent = true;
  if (look.cast === 'guard') look.emblem = true;
}
for (const id of ['arrow-rain', 'arrow-storm', 'sky-thunder']) SKILL_LOOKS[id].volley = true;
for (const id of ['power-strike', 'crushing-blow', 'shattering-blow']) SKILL_LOOKS[id].quake = true;
// The Kleryk's and the Cień's basic skills (956.10–956.15, the author: "wszystkie
// nowe super"): a beam of light on the healed ally, circles of runes and
// pillars of light under the foes, a golden halo with falling feathers, a
// strike out of shadow smoke, venom coating the blade and a dance of shadow
// afterimages. The evolved classes' skills of the same kinds keep their
// looks until their own turn (the author: animations of the evolved
// classes after the basic ones).
SKILL_LOOKS['prayer-of-health'].lightfall = true;
SKILL_LOOKS.exorcism.runes = true;
SKILL_LOOKS.blessing.halo = true;
SKILL_LOOKS.backstab.smoke = true;
SKILL_LOOKS['poisoned-blade'].venom = true;
SKILL_LOOKS['shadow-dance'].afterimages = true;

// The evolved Mag's skills in looks of their own (960.1–960.18, the
// author: "Wszystko super").
// The summons: a circle opens on the ground and the creature's card comes
// its own way.
SKILL_LOOKS['oak-awakening'].arrival = 'oak';
SKILL_LOOKS['bison-call'].arrival = 'aurochs';
SKILL_LOOKS['elemental-summon'].arrival = 'elemental';
SKILL_LOOKS['ent-summon'].arrival = 'ent';
SKILL_LOOKS['bear-summon'].arrival = 'bear';
// Burning boulders from the sky; lightning and ice with them in the
// Kataklizm.
SKILL_LOOKS['meteor-shower'].meteors = 'fire';
SKILL_LOOKS.cataclysm.meteors = 'cataclysm';
SKILL_LOOKS['elemental-harmony'].harmony = true;
SKILL_LOOKS['mana-mirror'].mirror = true;
SKILL_LOOKS['elemental-shield'].orbit = true;
SKILL_LOOKS['ice-armor'].icearmor = true;
SKILL_LOOKS['fire-burst'].splash = true;
SKILL_LOOKS['elemental-ray'].braid = true;
SKILL_LOOKS['ice-storm'].icefall = true;
SKILL_LOOKS.blizzard.snowstorm = true;
SKILL_LOOKS['ice-tomb'].tomb = true;
// A star of ice and a lance of ice fly instead of a spell's light
// (arena-fx.js strike()).
SKILL_LOOKS['ice-star'].orb = 'ice-star';
SKILL_LOOKS['ice-lance'].orb = 'ice-lance';
// The light the blows of these skills land in (arena-fx.js kindOf()),
// and the sweeps whose cast has already struck every foe: their hits
// only light the foes up, without a second burst.
for (const [id, kind] of [
  ['meteor-shower', 'fire'],
  ['cataclysm', 'fire'],
  ['elemental-ray', 'arcane'],
  ['ice-star', 'frost'],
  ['ice-lance', 'frost'],
]) {
  SKILL_LOOKS[id].kind = kind;
}
for (const id of ['meteor-shower', 'cataclysm', 'elemental-ray', 'ice-storm']) SKILL_LOOKS[id].struck = true;

// The evolved Łucznik's skills in looks of their own (961.1–961.18, the
// author: "wszystko super"). After the 0.3.43 loop: `reticle: false` and
// `pinned: false` override what it sets.
// A barbed head lodged in the foe, which bleeds; a harpoon on its rope,
// which yanks the foe toward its hunter (arena-fx.js strike(), hit()).
Object.assign(SKILL_LOOKS['barbed-arrow'], { barbs: true, pinned: false });
Object.assign(SKILL_LOOKS.harpoon, { orb: 'harpoon', pinned: false });
// Birds diving out of the sky instead of an arrow: the Łowca's falcon
// pecks, the Władca Puszczy's eagle rakes with its talons.
Object.assign(SKILL_LOOKS.falcon, { orb: 'falcon', wake: 'falcon' });
Object.assign(SKILL_LOOKS['eagle-talon'], { orb: 'eagle', impact: 'talons', pinned: false });
// The wolves come at the hunter's whistle and bite their foes.
Object.assign(SKILL_LOOKS['wolf-call'], { arrival: 'wolf', orb: 'bite', kind: 'physical' });
Object.assign(SKILL_LOOKS['pack-leader'], { arrival: 'alpha-wolf', orb: 'bite', kind: 'physical' });
// Shots that go on through their target into those behind it, without
// being aimed again.
Object.assign(SKILL_LOOKS['piercing-shot'], { orb: 'pierce', through: true });
Object.assign(SKILL_LOOKS['heart-shot'], { orb: 'heart', through: true, reticle: false, heart: true });
Object.assign(SKILL_LOOKS['master-shot'], { orb: 'master', through: true, reticle: false, sightline: true });
Object.assign(SKILL_LOOKS['ambush-shot'], { orb: 'ambush', reticle: false, hidden: true });
SKILL_LOOKS['steady-hand'].focus = true;
SKILL_LOOKS['target-lock'].lock = true;
// The storm's violet lightning (arena-fx.js KINDS.storm).
Object.assign(SKILL_LOOKS['arrow-storm'], { storm: 'arrows', kind: 'storm', struck: true });
Object.assign(SKILL_LOOKS['sky-thunder'], { storm: 'thunder', kind: 'storm', struck: true });
Object.assign(SKILL_LOOKS['perun-wrath'], { storm: 'wrath', kind: 'storm', struck: true });
Object.assign(SKILL_LOOKS['storm-cloud'], { cloud: true, kind: 'storm', struck: true });
Object.assign(SKILL_LOOKS['thunder-orb'], { orb: 'thunder-orb', wake: 'thunder-orb', kind: 'storm', impact: 'zap', reticle: false });
SKILL_LOOKS['thunder-sign'].rune = 'thunder';
// The archer's creatures that come at a whistle, not out of a circle.
const HUNT_CALLS = new Set(['wolf', 'alpha-wolf']);


// 960: the summoning circles, drawn flat on the ground. A druid's: two
// rings, a wreath of leaves between them and a triskele inside; an
// arcanist's: two rings, runes and a star of two triangles.
const DRUID_CIRCLE = (() => {
  const leaf = 'M0 -4.6C2.9 -2.4 2.9 2.4 0 4.6C-2.9 2.4 -2.9 -2.4 0 -4.6ZM0 -4.6V4.6';
  const wreath = Array.from({ length: 12 }, (_, k) => `<path d="${leaf}" transform="rotate(${k * 30}) translate(0 -38.5) rotate(70)"/>`).join('');
  const arm = (turn) => {
    const points = Array.from({ length: 15 }, (_, step) => {
      const share = step / 14;
      const angle = ((turn + share * 250) * Math.PI) / 180;
      const radius = 3 + share * 22;
      return `${(Math.cos(angle) * radius).toFixed(1)} ${(Math.sin(angle) * radius).toFixed(1)}`;
    });
    return `<path d="M${points.join('L')}"/>`;
  };
  return (
    '<svg viewBox="-50 -50 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle r="46" stroke-width="3.2"/><circle r="31" stroke-width="2"/>' +
    `<g stroke-width="1.7">${wreath}</g><g stroke-width="2.4">${[0, 120, 240].map(arm).join('')}</g></g></svg>`
  );
})();
const ARCANE_CIRCLE = (() => {
  const glyphs = ['M-2.5 -3.5V3.5M-2.5 -3.5L2.5 -1L-2.5 1.5', 'M-2.5 3.5L0 -3.5L2.5 3.5M-1.3 0.6H1.3', 'M0 -3.5V3.5M-2.5 -1.5L2.5 1.5', 'M-2.5 -3.5L2.5 3.5M2.5 -3.5L0 0', 'M2.5 -3.5H-2.5V3.5H2.5', 'M-2.5 3.5V-3.5L2.5 3.5V-3.5'];
  const runes = Array.from({ length: 12 }, (_, k) => `<path d="${glyphs[(k * 5) % glyphs.length]}" transform="rotate(${k * 30 + 15}) translate(0 -38.5)"/>`).join('');
  const triangle = (turn) =>
    Array.from({ length: 3 }, (_, k) => {
      const angle = ((k * 120 + turn - 90) * Math.PI) / 180;
      return `${(Math.cos(angle) * 29).toFixed(1)},${(Math.sin(angle) * 29).toFixed(1)}`;
    }).join(' ');
  return (
    '<svg viewBox="-50 -50 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle r="46" stroke-width="3.2"/><circle r="31" stroke-width="2"/>' +
    `<g stroke-width="2.2">${runes}</g>` +
    `<polygon points="${triangle(0)}" stroke-width="1.8"/><polygon points="${triangle(60)}" stroke-width="1.8"/>` +
    '<circle r="9" stroke-width="1.8"/></g></svg>'
  );
})();

// A leaf (the druids' summons), in one of the greens.
const LEAF = (fill) =>
  '<svg viewBox="0 0 10 16" aria-hidden="true">' +
  `<path d="M5 0.6C8.8 3.4 9.6 9.2 5.7 15.4H4.3C0.4 9.2 1.2 3.4 5 0.6Z" fill="${fill}" stroke="#24300f" stroke-width="0.8"/>` +
  '<path d="M5 2.6V14.8" stroke="#e4f0b0" stroke-width="0.7" opacity="0.7"/></svg>';
const LEAVES = ['#6f9a3a', '#8bbf4a', '#5c8a2e', '#a6c45a'];
const THICKET = ['#5c8a2e', '#6f9a3a', '#4f7a22', '#8bbf4a'];
const TWIGS = ['#6b4f2a', '#8a6a3a', '#4a3520'];
const MANA = ['#ffffff', '#c8f4fa', '#8fd3ff'];
const BOLT = ['#ffffff', '#fff7c2', '#f2e36b'];

// A wave of a roar (the Niedźwiedź's coming): the top of a circle.
const ROAR =
  '<svg viewBox="-50 -50 100 100" aria-hidden="true"><path d="M-30.6 -25.7A40 40 0 0 1 30.6 -25.7" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>';

// A whirl of mana and flame (the Żywiołak's coming): four spiral arms.
const VORTEX = (() => {
  const arm = (turn, width, color) => {
    const points = Array.from({ length: 19 }, (_, step) => {
      const share = step / 18;
      const angle = ((turn + share * 300) * Math.PI) / 180;
      const radius = 47 - share * 40;
      return `${(Math.cos(angle) * radius).toFixed(1)} ${(Math.sin(angle) * radius).toFixed(1)}`;
    });
    return `<path d="M${points.join('L')}" stroke="${color}" stroke-width="${width}"/>`;
  };
  const arms = [0, 90, 180, 270].map((turn, k) => arm(turn, 6, '#18304d') + arm(turn + 3, 2.2, k % 2 ? '#ffb36b' : '#bfe8ff')).join('');
  return `<svg viewBox="-50 -50 100 100" aria-hidden="true"><g fill="none" stroke-linecap="round" stroke-linejoin="round">${arms}</g></svg>`;
})();

// A star of ice with sharp arms (the Lodowa gwiazda's and the Lodowa
// nawałnica's): six long arms, six short ones and a bright heart.
export const ICE_STAR = (() => {
  const arm = (angle, length, width) => `<path d="M0 0L${width} ${(-length * 0.32).toFixed(1)}L0 ${-length}L${-width} ${(-length * 0.32).toFixed(1)}Z" transform="rotate(${angle})"/>`;
  const long = [0, 60, 120, 180, 240, 300].map((angle) => arm(angle, 47, 8)).join('');
  const short = [30, 90, 150, 210, 270, 330].map((angle) => arm(angle, 25, 5.5)).join('');
  const spines = [0, 60, 120].map((angle) => `<path d="M0 -40V40" transform="rotate(${angle})"/>`).join('');
  return (
    `<svg viewBox="-50 -50 100 100" aria-hidden="true"><g fill="#e6f7ff" stroke="#4fa8e0" stroke-width="2.4" stroke-linejoin="round">${short}${long}</g>` +
    `<g stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" opacity="0.85">${spines}</g><circle r="6" fill="#ffffff" stroke="#9fd8ff" stroke-width="2"/></svg>`
  );
})();

// One arm of a star of ice, flying off as it breaks.
const ICE_SHARD = '<svg viewBox="-6 -24 12 26" aria-hidden="true"><path d="M0 0L5 -8L0 -23L-5 -8Z" fill="#e6f7ff" stroke="#4fa8e0" stroke-width="1.6" stroke-linejoin="round"/><path d="M0 -3V-20" stroke="#ffffff" stroke-width="1.1" stroke-linecap="round"/></svg>';

// A lance of ice, its point to the right (the Lodowa włócznia's).
export const ICE_LANCE =
  '<svg viewBox="0 0 120 24" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="fx-lance-ice" x1="0" y1="0" x2="0" y2="1">' +
  '<stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="#d8f2ff"/><stop offset="1" stop-color="#7cc4ee"/></linearGradient></defs>' +
  '<path d="M1 12L9 6.5L14 9L82 7L119 12L82 17L14 15L9 17.5Z" fill="url(#fx-lance-ice)" stroke="#3f8fc8" stroke-width="1.4" stroke-linejoin="round"/>' +
  '<path d="M14 12H112" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round"/>' +
  '<path d="M30 8.6L38 15.4M52 8L60 16M72 7.6L80 16.2" stroke="#ffffff" stroke-width="0.8" opacity="0.7"/></svg>';

// Cracks running out from a point, as in glass or ice (a star of ice
// breaking on its foe, a tomb of ice cracking): jagged lines, each
// branching once.
function cracksArt(seed, rays = 7) {
  let value = seed;
  const random = () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
  const lines = [];
  for (let index = 0; index < rays; index++) {
    const angle = (index / rays) * Math.PI * 2 + random() * 0.5;
    let x = 0;
    let y = 0;
    let d = 'M0 0';
    for (let step = 1; step <= 4; step++) {
      const reach = step * 11 + random() * 4;
      const bend = angle + (random() - 0.5) * 0.7;
      x = Math.cos(bend) * reach;
      y = Math.sin(bend) * reach;
      d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
      if (step === 2) {
        const side = angle + (random() < 0.5 ? -0.9 : 0.9);
        lines.push(`M${x.toFixed(1)} ${y.toFixed(1)}L${(x + Math.cos(side) * 12).toFixed(1)} ${(y + Math.sin(side) * 12).toFixed(1)}`);
      }
    }
    lines.push(d);
  }
  return (
    '<svg viewBox="-50 -50 100 100" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' +
    lines.map((d) => `<path d="${d}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`).join('') +
    '</g></svg>'
  );
}
const GLASS_CRACKS = cracksArt(7);
const TOMB_CRACKS = cracksArt(23, 6);

// The faces of a block of ice (the Lodowy grobowiec): a few lines of its
// facets and the shine on its edges, stretched over the block.
const TOMB_FACETS =
  '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="#ffffff" stroke-linecap="round">' +
  '<path d="M0 24L30 12L58 28L100 16" stroke-width="1.4" opacity="0.75" vector-effect="non-scaling-stroke"/>' +
  '<path d="M30 12L36 100M58 28L64 100" stroke-width="1" opacity="0.4" vector-effect="non-scaling-stroke"/>' +
  '<path d="M9 36L14 84M88 30L92 70" stroke-width="2.4" opacity="0.55" vector-effect="non-scaling-stroke"/></g></svg>';

// The three elements circling the Tarcza żywiołów: a flame, a shard of
// ice and a spark of lightning.
const FLAME =
  '<svg viewBox="0 0 20 28" aria-hidden="true"><path d="M10 1C13 7 18 10 18 17C18 23 14.5 27 10 27C5.5 27 2 23 2 17C2 12 6 10 7 5C8.5 8 9.5 9 10 1Z" fill="#ff7a2e"/>' +
  '<path d="M10 10C12 14 14.5 15.5 14.5 19.5C14.5 23 12.5 25 10 25C7.5 25 5.5 23 5.5 19.5C5.5 16.5 8 15 10 10Z" fill="#ffd27a"/>' +
  '<path d="M10 17C11 19 12 20 12 21.6C12 23.2 11.1 24 10 24C8.9 24 8 23.2 8 21.6C8 20 9.2 19 10 17Z" fill="#fff6d6"/></svg>';
const FROST_SHARD =
  '<svg viewBox="0 0 20 28" aria-hidden="true"><path d="M10 1L15.5 9L13 25L10 27L7 25L4.5 9Z" fill="#e6f7ff" stroke="#4fa8e0" stroke-width="1.4" stroke-linejoin="round"/>' +
  '<path d="M10 3.5V24.5M4.5 9L15.5 9" stroke="#ffffff" stroke-width="1" stroke-linecap="round"/></svg>';
const SPARK_BOLT =
  '<svg viewBox="0 0 20 28" aria-hidden="true"><path d="M12.5 1L3 16H9.2L6.8 27L17 10.6H10.8L14.6 1Z" fill="#fff3a0" stroke="#d9a520" stroke-width="1.3" stroke-linejoin="round"/></svg>';

// The Promień Żywiołów: three strands, fire, frost and lightning, twisting
// round a white core; the strands run toward the foes (their group
// moves).
const RAY = (() => {
  const wave = (phase) => {
    const points = [];
    for (let x = 0; x <= 260; x += 2.5) points.push(`${x} ${(10 + Math.sin((x / 26) * Math.PI * 2 + phase) * 6).toFixed(2)}`);
    return `M${points.join('L')}`;
  };
  const strands = [
    ['#ff7a2e', 0],
    ['#8fd3ff', (Math.PI * 2) / 3],
    ['#f2e36b', (Math.PI * 4) / 3],
  ]
    .map(([color, phase]) => `<path d="${wave(phase)}" stroke="${color}" stroke-width="2.6" vector-effect="non-scaling-stroke"/>`)
    .join('');
  return (
    '<svg viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true">' +
    '<path d="M0 10H200" stroke="#fff3d6" stroke-width="9" stroke-linecap="round" opacity="0.32" vector-effect="non-scaling-stroke"/>' +
    `<g class="fx-ray-strands" fill="none" stroke-linecap="round">${strands}</g>` +
    '<path d="M0 10H200" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>'
  );
})();

// A flat ring in the three elements' colours (the Tarcza żywiołów's).
const ELEMENT_RING =
  '<svg viewBox="-50 -50 100 100" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke">' +
  '<circle r="46" pathLength="300" stroke="#ff8a3d" stroke-dasharray="96 204" vector-effect="non-scaling-stroke"/>' +
  '<circle r="46" pathLength="300" stroke="#8fd3ff" stroke-dasharray="96 204" stroke-dashoffset="-100" vector-effect="non-scaling-stroke"/>' +
  '<circle r="46" pathLength="300" stroke="#f2e36b" stroke-dasharray="96 204" stroke-dashoffset="-200" vector-effect="non-scaling-stroke"/></g></svg>';

const DUST = ['#b9a98f', '#8f816b', '#d8cbb0'];
const STONE = ['#8a8274', '#6f675b', '#a39a89'];

// A sight's four corners, a ring and a dot (the Celny strzał's look).
const RETICLE =
  '<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="square">' +
  '<path d="M8 30V8h22M70 8h22v22M92 70v22H70M30 92H8V70"/></g>' +
  '<circle cx="50" cy="50" r="26" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="7 6"/>' +
  '<circle cx="50" cy="50" r="4" fill="currentColor"/></svg>';

// Cracks in the ground from a point (the Potężny cios's look).
const CRACKS =
  '<svg viewBox="-50 -20 100 40" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M0 0l-9 3-6-4-10 5-8-2-12 6"/><path d="M0 0l10 2 5-5 11 4 9-3 13 5"/><path d="M0 0l-3 8-7 4-2 7"/><path d="M0 0l4 9 8 3 1 6"/>' +
  '<path d="M-15 -1l-4-7-7-3"/><path d="M16 -3l3-8 8-2"/></g></svg>';

// A heater shield with a cross (the Nieugięty's look).
const EMBLEM =
  '<svg viewBox="0 0 60 72" aria-hidden="true"><path d="M30 3 L55 11 L55 34 C55 52 43 63 30 69 C17 63 5 52 5 34 L5 11 Z" fill="rgba(60,44,12,0.55)" stroke="currentColor" stroke-width="4"/>' +
  '<path d="M30 14 V58 M15 30 H45" stroke="currentColor" stroke-width="6" stroke-linecap="round"/></svg>';

const FIRE = ['#fff1c1', '#ffd27a', '#ff8a3d', '#ff5a1f'];
const SMOKE = ['#4a3d35', '#5d4c40', '#3a312b'];
const ICE = ['#ffffff', '#e4f6ff', '#bfe8ff', '#8fd3ff'];
const LIFE = ['#ffffff', '#e3f5a8', '#b6e388', '#7fd36b'];
const HOLY = ['#ffffff', '#fff6cf', '#f2d675'];
const GOLD = ['#fff6cf', '#ffe08a', '#f2d675', '#e8c76a'];
const SHADE = ['#2a2040', '#3a2c58', '#1e1730'];
const SHADE_SPARKS = ['#efe8ff', '#c9b7ff', '#a690e8'];
const VENOM = ['#eaffc0', '#c5f08a', '#9ccc65', '#6f9a3a'];
// The venom's band on a blade's icon (the Zatrute ostrze's look): between
// the guard's line and a line across the blade that moves to the point.
const VENOM_FROM = 'polygon(-100% -72%, 200% 228%, 200% 228%, -100% -72%)';
const VENOM_TO = 'polygon(-100% -72%, 200% 228%, 200% 100%, -100% -200%)';

// A cross of light (the Modlitwa o zdrowie's look).
const CROSS =
  '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M15 3h10v12h12v10H25v12H15V25H3V15h12z" fill="currentColor" stroke="#ffffff" stroke-width="2.4" stroke-linejoin="round"/>' +
  '<path d="M20 8v24M8 20h24" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" opacity="0.75"/></svg>';

// A circle of runes on the ground (the Egzorcyzm's look): two rings, runes
// between them and an eight-pointed star inside.
const RUNES = (() => {
  const glyphs = ['M-2.5 -3.5V3.5M-2.5 -3.5L2.5 -1L-2.5 1.5', 'M-2.5 3.5L0 -3.5L2.5 3.5M-1.3 0.6H1.3', 'M0 -3.5V3.5M-2.5 -1.5L2.5 1.5', 'M-2.5 -3.5L2.5 3.5M2.5 -3.5L0 0', 'M2.5 -3.5H-2.5V3.5H2.5', 'M-2.5 3.5V-3.5L2.5 3.5V-3.5'];
  const runes = Array.from({ length: 12 }, (_, k) => `<path d="${glyphs[k % glyphs.length]}" transform="rotate(${k * 30}) translate(0 -38.5)"/>`).join('');
  const square = (turn) =>
    Array.from({ length: 4 }, (_, k) => {
      const angle = ((k * 90 + turn) * Math.PI) / 180;
      return `${(Math.cos(angle) * 29).toFixed(1)},${(Math.sin(angle) * 29).toFixed(1)}`;
    }).join(' ');
  return (
    '<svg viewBox="-50 -50 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle r="46" stroke-width="3.2"/><circle r="31" stroke-width="2"/>' +
    `<g stroke-width="2.2">${runes}</g>` +
    `<polygon points="${square(0)}" stroke-width="1.8"/><polygon points="${square(45)}" stroke-width="1.8"/>` +
    '<circle r="7" stroke-width="1.8"/></g></svg>'
  );
})();

// A dark wisp torn out of a foe (the Egzorcyzm's look).
const WISP =
  '<svg viewBox="0 0 20 60" aria-hidden="true"><defs><linearGradient id="fx-wisp-fade" x1="0" y1="1" x2="0" y2="0">' +
  '<stop offset="0" stop-color="#1b1429" stop-opacity="0"/><stop offset="0.35" stop-color="#1b1429"/><stop offset="0.75" stop-color="#2e2347"/><stop offset="1" stop-color="#2e2347" stop-opacity="0"/></linearGradient>' +
  '<linearGradient id="fx-wisp-edge" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#b9a6f0" stop-opacity="0"/><stop offset="0.4" stop-color="#b9a6f0"/><stop offset="1" stop-color="#b9a6f0" stop-opacity="0"/></linearGradient></defs>' +
  '<path d="M10 58C2 47 17 39 10 28C4 19 15 11 10 2" fill="none" stroke="url(#fx-wisp-fade)" stroke-width="7" stroke-linecap="round"/>' +
  '<path d="M10 58C2 47 17 39 10 28C4 19 15 11 10 2" fill="none" stroke="url(#fx-wisp-edge)" stroke-width="1.8" stroke-linecap="round"/></svg>';

// A halo (the Błogosławieństwo's look).
const HALO =
  '<svg viewBox="0 0 60 20" aria-hidden="true"><ellipse cx="30" cy="10" rx="26" ry="6.5" fill="none" stroke="#fff6cf" stroke-width="4.4"/>' +
  '<ellipse cx="30" cy="10" rx="26" ry="6.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

// A white feather with a golden quill, its vane a little bent.
const FEATHER =
  '<svg viewBox="0 0 12 30" aria-hidden="true"><path d="M6.4 1.5C9.6 5 10.6 11 9.4 17C8.6 21 7.4 24 6.6 27L5.8 27C4.4 23 2.2 19 2 14C1.8 8.6 3.6 4.4 6.4 1.5Z" fill="#fffdf6" stroke="#b8902f" stroke-width="0.8"/>' +
  '<path d="M6.2 8L9.4 6.4M6.2 11L9.8 9.2M6.2 14L9.8 12.4M6.1 17L9.2 15.6M6.2 8L2.8 5.8M6.2 11L2.3 9M6.2 14L2.1 12.2M6.1 17L2.5 15.4" stroke="#d9c38a" stroke-width="0.55"/>' +
  '<path d="M6.4 3C6.6 11 6.4 19 6 29" fill="none" stroke="#b8862a" stroke-width="1.2" stroke-linecap="round"/></svg>';

// A four-pointed glint of light.
const GLINT = '<svg viewBox="-10 -10 20 20" aria-hidden="true"><path d="M0 -10L1.8 -1.8L10 0L1.8 1.8L0 10L-1.8 1.8L-10 0L-1.8 -1.8Z" fill="currentColor"/><circle r="2.2" fill="#ffffff"/></svg>';

// A violet cut from behind (the Cios w plecy's look), with a thin echo
// along it: parallel, never a cross (that is the mark of a fallen unit).
const SHADOW_SLASH =
  '<svg viewBox="-50 -50 100 100" aria-hidden="true"><path d="M-49 -23Q-4 -13 49 26Q-10 2 -49 -23Z" fill="#241a38"/>' +
  '<path d="M-46 -21Q-4 -12 46 23Q-8 0 -46 -21Z" fill="currentColor"/>' +
  '<path d="M-42 -18Q-3 -9 42 20" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/>' +
  '<path d="M-38 -5Q0 5 38 30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/></svg>';

// Three spiral arms of a whirl of shadows (the Taniec cieni's look), drawn
// on a circle that the card's box stretches.
const SWIRL = (() => {
  const arm = (turn, width, color) => {
    const points = Array.from({ length: 17 }, (_, step) => {
      const share = step / 16;
      const angle = ((turn + share * 160) * Math.PI) / 180;
      const radius = 47 - share * 25;
      return `${(Math.cos(angle) * radius).toFixed(1)} ${(Math.sin(angle) * radius).toFixed(1)}`;
    });
    return `<path d="M${points.join('L')}" stroke="${color}" stroke-width="${width}" vector-effect="non-scaling-stroke"/>`;
  };
  const arms = [0, 120, 240].map((turn) => arm(turn, 6, '#241a38') + arm(turn + 4, 1.8, '#c9b7ff')).join('');
  return `<svg viewBox="-50 -50 100 100" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke-linecap="round" stroke-linejoin="round">${arms}</g></svg>`;
})();

// Hexagons in the skill's colour over the Osłona many's wall (its new
// look), as an inline SVG pattern (the page's rules allow no image made of
// data).
let hexPatterns = 0;
const hexPattern = (color) => {
  const r = 7;
  const w = Math.sqrt(3) * r;
  const hex = (cx, cy) =>
    Array.from({ length: 6 }, (_, k) => {
      const angle = Math.PI / 6 + (k * Math.PI) / 3;
      return `${(cx + Math.cos(angle) * r).toFixed(2)},${(cy + Math.sin(angle) * r).toFixed(2)}`;
    }).join(' ');
  const cells = [hex(w / 2, r), hex(0, r * 2.5), hex(w, r * 2.5), hex(w / 2, r * 4)].map((points) => `<polygon points="${points}"/>`).join('');
  const id = `fx-hex-${(hexPatterns += 1)}`;
  return (
    `<svg width="100%" height="100%" aria-hidden="true"><defs><pattern id="${id}" width="${w.toFixed(2)}" height="${(r * 3).toFixed(2)}" patternUnits="userSpaceOnUse">` +
    `<g fill="none" stroke="${color}" stroke-width="1" stroke-opacity="0.85">${cells}</g></pattern></defs><rect width="100%" height="100%" fill="url(#${id})"/></svg>`
  );
};

// 961: the evolved Łucznik's looks: blood, the storm's violet lightning
// and the brown of a bird's feathers.
const BLOOD = ['#ff8a7a', '#d9534f', '#b3263b', '#7a1424'];
const STORM = ['#ffffff', '#ece6ff', '#c9b7ff', '#9fb8ff'];
const PLUMAGE = ['#8a6a45', '#c8a87a', '#5c4024'];

// A barbed arrow, its point to the right (the Grot z zadziorem): the
// shaft, its fletching and a head whose two hooks turn back.
const BARBED_ARROW =
  '<svg viewBox="0 0 64 16" aria-hidden="true">' +
  '<path d="M7 8H50" stroke="#3e2a18" stroke-width="3.2" stroke-linecap="round"/>' +
  '<path d="M7 8H50" stroke="#d8ad6e" stroke-width="1.5" stroke-linecap="round"/>' +
  '<path d="M1.5 8L7 3.2H13L9 8L13 12.8H7Z" fill="#fbf6ea" stroke="#5a4630" stroke-width="0.8" stroke-linejoin="round"/>' +
  '<path d="M63 8L53 3.4L46.2 0.9L50.4 6.1L47.6 8L50.4 9.9L46.2 15.1L53 12.6Z" fill="#cfd4dc" stroke="#2a2d34" stroke-width="0.9" stroke-linejoin="round"/>' +
  '<path d="M51 8H60.5" stroke="#ffffff" stroke-width="0.8" stroke-linecap="round" opacity="0.85"/></svg>';

// A harpoon, its point to the right: a heavy shaft, a ring at its tail for
// its rope and an iron head with two big barbs (the Harpun).
export const HARPOON =
  '<svg viewBox="0 0 90 18" preserveAspectRatio="none" aria-hidden="true">' +
  '<path d="M9 9H66" stroke="#3a2614" stroke-width="3.8" stroke-linecap="round"/>' +
  '<path d="M9 9H66" stroke="#9a7044" stroke-width="1.6" stroke-linecap="round"/>' +
  '<circle cx="5.6" cy="9" r="3.4" fill="none" stroke="#2a2d34" stroke-width="2.6"/>' +
  '<circle cx="5.6" cy="9" r="3.4" fill="none" stroke="#b9bfc8" stroke-width="1.2"/>' +
  '<path d="M89 9L73 3.2L75.6 7.1L62.5 1.2L66.5 9L62.5 16.8L75.6 10.9L73 14.8Z" fill="#c9ced6" stroke="#2a2d34" stroke-width="1.1" stroke-linejoin="round"/>' +
  '<path d="M74 9H86" stroke="#ffffff" stroke-width="1" stroke-linecap="round" opacity="0.85"/></svg>';

// A heart (the Strzał w serce's mark), and its two halves broken along a
// zigzag.
const HEART_PATH = 'M0 38C-30 18 -46 2 -46 -16C-46 -32 -33 -42 -20 -42C-10 -42 -3 -36 0 -28C3 -36 10 -42 20 -42C33 -42 46 -32 46 -16C46 2 30 18 0 38Z';
const HEART =
  '<svg viewBox="-50 -50 100 100" aria-hidden="true">' +
  `<path d="${HEART_PATH}" fill="rgba(255, 80, 70, 0.24)" stroke="currentColor" stroke-width="5.5" stroke-linejoin="round"/>` +
  `<path d="${HEART_PATH}" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linejoin="round" transform="scale(0.7)" opacity="0.85"/></svg>`;
const HEART_HALVES = [
  'M0 -28C-3 -36 -10 -42 -20 -42C-33 -42 -46 -32 -46 -16C-46 2 -30 18 0 38L-4 24L4 10L-4 -4L4 -16Z',
  'M0 -28L4 -16L-4 -4L4 10L-4 24L0 38C30 18 46 2 46 -16C46 -32 33 -42 20 -42C10 -42 3 -36 0 -28Z',
].map((d) => `<svg viewBox="-50 -50 100 100" aria-hidden="true"><path d="${d}" fill="rgba(255, 80, 70, 0.3)" stroke="currentColor" stroke-width="5.5" stroke-linejoin="round"/></svg>`);

// A sight's four corners alone (the Spokojna ręka's calm focus).
const FOCUS =
  '<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="square">' +
  '<path d="M8 30V8h22M70 8h22v22M92 70v22H70M30 92H8V70"/></g></svg>';

// The sign of thunder (the Znak gromu): six petals in a circle, the
// rosette once carved over the doors of cottages against lightning. Each
// stroke is drawn on in turn (its length counted as 100).
const THUNDER_SIGN = (() => {
  const petal = 25;
  const tip = petal * Math.sqrt(3);
  const petals = Array.from({ length: 6 }, (_, k) => {
    const angle = ((k * 60 - 90) * Math.PI) / 180;
    const x = (Math.cos(angle) * tip).toFixed(2);
    const y = (Math.sin(angle) * tip).toFixed(2);
    return `<path class="fx-sign-stroke" pathLength="100" d="M0 0A${petal} ${petal} 0 0 1 ${x} ${y}A${petal} ${petal} 0 0 1 0 0"/>`;
  }).join('');
  return (
    '<svg viewBox="-50 -50 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle class="fx-sign-stroke" pathLength="100" r="47" stroke-width="3.2"/>' +
    `<circle class="fx-sign-stroke" pathLength="100" r="${tip.toFixed(2)}" stroke-width="1.6"/>` +
    `<g stroke-width="2.8">${petals}</g></g></svg>`
  );
})();

// A wolf's jaws snapping shut (the wolves' bites): a row of fangs above, a
// row below, each in its own group, to move.
export const FANGS = (() => {
  const fang = (x, y, length, half, down) => `M${x - half} ${y}L${x} ${y + (down ? length : -length)}L${x + half} ${y}Z`;
  const upper = [-24, -12, 0, 12, 24].map((x) => fang(x, -9 + Math.abs(x) * 0.16, Math.abs(x) === 12 ? 17 : 11, Math.abs(x) === 12 ? 5 : 4, true)).join('');
  const lower = [-18, -6, 6, 18].map((x) => fang(x, 9 - Math.abs(x) * 0.16, Math.abs(x) === 18 ? 15 : 10, Math.abs(x) === 18 ? 4.6 : 3.8, false)).join('');
  const row = (d) => `<path d="${d}" fill="#fffaf0" stroke="#3a1a10" stroke-width="1.6" stroke-linejoin="round"/>`;
  return `<svg viewBox="-50 -50 100 100" aria-hidden="true"><g class="fx-jaw">${row(upper)}</g><g class="fx-jaw">${row(lower)}</g></svg>`;
})();

// Talons' rakes across a foe (the Szpon orła's three, the falcon's two),
// each drawn along its line.
function rakesArt(count) {
  const lines = Array.from({ length: count }, (_, k) => {
    const shift = (k - (count - 1) / 2) * 15;
    return `M${-24 + shift} -36Q${-4 + shift} 0 ${8 + shift} 36`;
  });
  return (
    '<svg viewBox="-50 -50 100 100" aria-hidden="true"><g fill="none" stroke-linecap="round">' +
    lines.map((d) => `<path class="fx-rake-glow" pathLength="100" d="${d}" stroke-width="8"/>`).join('') +
    lines.map((d) => `<path class="fx-rake-core" pathLength="100" d="${d}" stroke-width="2.6"/>`).join('') +
    '</g></svg>'
  );
}

// A feather of a bird of prey: the white feather's shape in browns.
const BROWN_FEATHER = FEATHER.replace('#fffdf6', '#a8804e').replace('#b8902f', '#3a2814').replace('#d9c38a', '#6b4f2a').replace('#b8862a', '#3a2814');

// Arcs of lightning crackling round a ball of it (the Kula piorunów).
export const ORB_ARCS = (() => {
  let seed = 11;
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const arc = (turn) => {
    const points = Array.from({ length: 7 }, (_, step) => {
      const angle = ((turn + step * 14) * Math.PI) / 180;
      const radius = 34 + (random() - 0.5) * 14;
      return `${(Math.cos(angle) * radius).toFixed(1)} ${(Math.sin(angle) * radius).toFixed(1)}`;
    });
    return `M${points.join('L')}`;
  };
  const arcs = [0, 120, 240].map(arc);
  return (
    '<svg viewBox="-50 -50 100 100" aria-hidden="true"><g fill="none" stroke-linecap="round" stroke-linejoin="round">' +
    arcs.map((d) => `<path d="${d}" stroke="currentColor" stroke-width="6" opacity="0.6"/>`).join('') +
    arcs.map((d) => `<path d="${d}" stroke="#ffffff" stroke-width="2.2"/>`).join('') +
    '</g></svg>'
  );
})();

// 961: a bolt of lightning from one point of the stage to another, jagged,
// with a fork or two: the box it takes (its corner `x`, `y`) and its SVG,
// in the colour of its element's `--fx`.
export function boltArt(from, to, { jag = 1, forks = 1, width = 1 } = {}) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const steps = Math.max(3, Math.round(length / 20));
  const swing = Math.min(18, length * 0.18) * jag;
  const main = [from];
  for (let step = 1; step < steps; step++) {
    const share = step / steps;
    const off = (Math.random() - 0.5) * 2 * swing * Math.sqrt(Math.sin(share * Math.PI));
    main.push({ x: from.x + dx * share + nx * off, y: from.y + dy * share + ny * off });
  }
  main.push(to);
  const lines = [main];
  for (let fork = 0; fork < forks && main.length > 3; fork++) {
    const at = main[1 + Math.floor(Math.random() * (main.length - 3))];
    const turn = Math.atan2(dy, dx) + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.4);
    const reach = length * (0.16 + Math.random() * 0.12);
    const branch = [at];
    for (let step = 1; step <= 3; step++) {
      const off = (Math.random() - 0.5) * swing * 0.8;
      branch.push({ x: at.x + Math.cos(turn) * reach * (step / 3) - Math.sin(turn) * off, y: at.y + Math.sin(turn) * reach * (step / 3) + Math.cos(turn) * off });
    }
    lines.push(branch);
  }
  const all = lines.flat();
  const pad = 8;
  const x = Math.min(...all.map((point) => point.x)) - pad;
  const y = Math.min(...all.map((point) => point.y)) - pad;
  const w = Math.ceil(Math.max(...all.map((point) => point.x)) + pad - x);
  const hgt = Math.ceil(Math.max(...all.map((point) => point.y)) + pad - y);
  const d = (line) => `M${line.map((point) => `${(point.x - x).toFixed(1)} ${(point.y - y).toFixed(1)}`).join('L')}`;
  const html =
    `<svg width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}" aria-hidden="true">` +
    lines.map((line, index) => `<path class="fx-zap-glow" stroke-width="${((index ? 3.6 : 6) * width).toFixed(1)}" d="${d(line)}"/>`).join('') +
    lines.map((line, index) => `<path class="fx-zap-core" stroke-width="${((index ? 1.2 : 2.2) * width).toFixed(1)}" d="${d(line)}"/>`).join('') +
    '</svg>';
  return { x, y, html };
}
// A bolt's flicker as it strikes.
export const FLICKER = [{ opacity: 0 }, { opacity: 1, offset: 0.06 }, { opacity: 0.3, offset: 0.16 }, { opacity: 1, offset: 0.26 }, { opacity: 0.85, offset: 0.55 }, { opacity: 0 }];

// 961: the frames of a bird (a creature's sprite, which faces right)
// flying through `points` (its middle on the stage), facing the way it
// flies and tilted a little with its path, at `scales`.
export function birdFrames(points, scales) {
  return points.map((point, index) => {
    const next = points[Math.min(points.length - 1, index + 1)];
    const prev = points[Math.max(0, index - 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const face = dx < 0 ? -1 : 1;
    const tilt = Math.max(-30, Math.min(30, ((Math.atan2(dy, Math.abs(dx) || 0.001) * 180) / Math.PI) * 0.5));
    const scale = scales[index];
    return { transform: `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px) translate(-50%, -50%) rotate(${(tilt * face).toFixed(1)}deg) scale(${(face * scale).toFixed(3)}, ${scale.toFixed(3)})` };
  });
}
// A point of a quadratic Bézier curve.
export const curve = (from, control, to, t) => ({
  x: (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * control.x + t * t * to.x,
  y: (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * control.y + t * t * to.y,
});

export function skillEffects(kit) {
  const { animate, boxOf, centerOf, cards, fx, row, reduced, wait } = kit;
  const particles = kit.specks;

  // A small element in the effects layer at a point, removed when done.
  function spark(className, { x, y }, style = {}) {
    const element = h('span', { class: className });
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    for (const [key, value] of Object.entries(style)) element.style.setProperty(key, value);
    fx.append(element);
    return element;
  }

  // The skill's name over its user, kept inside the arena by its edges.
  function callout(id, text, color) {
    const entry = cards.get(id);
    if (!entry) return Promise.resolve();
    const { x, y } = centerOf(entry.card);
    const label = spark('skill-callout', { x, y: y - entry.card.offsetHeight / 2 }, { '--fx': color });
    label.textContent = text;
    const half = label.offsetWidth / 2;
    label.style.left = `${Math.min(Math.max(x, half + 4), kit.arena.clientWidth - half - 4)}px`;
    return animate(
      label,
      [
        { transform: 'translate(-50%, 0) scale(0.6)', opacity: 0 },
        { transform: 'translate(-50%, -10px) scale(1.08)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, -14px) scale(1)', opacity: 1, offset: 0.75 },
        { transform: 'translate(-50%, -22px) scale(1)', opacity: 0 },
      ],
      { duration: 1300, easing: 'ease-out' },
    ).then(() => label.remove());
  }

  // A glow that pulses around a card.
  function aura(id, color, pulses = 2) {
    const entry = cards.get(id);
    if (!entry) return Promise.resolve();
    return animate(
      entry.card,
      [
        { boxShadow: '0 0 0 0 transparent' },
        { boxShadow: `0 0 18px 6px ${color}`, offset: 0.5 },
        { boxShadow: '0 0 0 0 transparent' },
      ],
      { duration: 520, iterations: pulses },
    );
  }

  // A ring of light that grows from a card's middle.
  function ring(id, color, size = 90, duration = 520) {
    const entry = cards.get(id);
    if (!entry) return Promise.resolve();
    const mark = spark('fx-ring', centerOf(entry.card), { '--fx': color, '--size': `${size}px` });
    return animate(
      mark,
      [
        { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0.95 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
      ],
      { duration, easing: 'ease-out' },
    ).then(() => mark.remove());
  }

  // A burst of light, bigger and brighter than a plain hit's.
  function burst(id, color, size = 70) {
    const entry = cards.get(id);
    if (!entry) return Promise.resolve();
    const mark = spark('fx-burst', centerOf(entry.card), { '--fx': color, '--size': `${size}px` });
    return animate(
      mark,
      [
        { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.1)', opacity: 1, offset: 0.3 },
        { transform: 'translate(-50%, -50%) scale(1.35)', opacity: 0 },
      ],
      { duration: 480, easing: 'ease-out' },
    ).then(() => mark.remove());
  }

  // Specks rising (a heal) or dripping (venom) over a card.
  function specks(id, color, { count = 7, rise = true } = {}) {
    const entry = cards.get(id);
    if (!entry) return Promise.resolve();
    const box = boxOf(entry.card);
    const { x, y } = centerOf(entry.card);
    const all = Array.from({ length: count }, (_, index) => {
      const dx = ((index + 0.5) / count - 0.5) * box.width * 0.8;
      const mark = spark('fx-speck', { x: x + dx, y: y + (rise ? box.height * 0.3 : -box.height * 0.3) }, { '--fx': color });
      const travel = (rise ? -1 : 1) * (box.height * 0.5 + (index % 3) * 6);
      return animate(
        mark,
        [
          { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0 },
          { transform: `translate(-50%, calc(-50% + ${travel * 0.3}px)) scale(1)`, opacity: 1, offset: 0.25 },
          { transform: `translate(-50%, calc(-50% + ${travel}px)) scale(0.7)`, opacity: 0 },
        ],
        { duration: 760, delay: index * 50, easing: 'ease-out', fill: 'backwards' },
      ).then(() => mark.remove());
    });
    return Promise.all(all);
  }

  // A box over the enemy row that clips what moves inside it, so nothing
  // reaches past the arena's edge and the page never scrolls sideways.
  function overRow() {
    const target = row('enemy');
    if (!target) return null;
    const box = boxOf(target);
    const clip = spark('fx-clip', { x: box.x, y: box.y });
    clip.style.width = `${box.width}px`;
    clip.style.height = `${box.height}px`;
    return clip;
  }

  // A blade's arc drawn over the whole enemy row, left to right.
  function arc(color) {
    const clip = overRow();
    if (!clip) return Promise.resolve();
    const blade = h('span', { class: 'fx-arc' });
    blade.style.setProperty('--fx', color);
    clip.append(blade);
    const keyframes = reduced()
      ? [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }]
      : [
          { transform: 'scaleX(0.08)', opacity: 0 },
          { transform: 'scaleX(1)', opacity: 1, offset: 0.5 },
          { transform: 'scaleX(1) translateY(8px)', opacity: 0 },
        ];
    return animate(blade, keyframes, { duration: 560, easing: 'ease-out' }).then(() => clip.remove());
  }

  // An icy gust that blows over the enemy row, and frost settling on each foe.
  function gust(color, targets) {
    const clip = overRow();
    if (!clip) return Promise.resolve();
    const wind = h('span', { class: 'fx-gust' });
    wind.style.setProperty('--fx', color);
    clip.append(wind);
    const blow = reduced()
      ? animate(wind, [{ opacity: 0 }, { opacity: 0.8 }, { opacity: 0 }], { duration: 500 })
      : animate(
          wind,
          [
            { transform: 'translateX(-60%)', opacity: 0 },
            { transform: 'translateX(-10%)', opacity: 0.9, offset: 0.5 },
            { transform: 'translateX(30%)', opacity: 0 },
          ],
          { duration: 720, easing: 'ease-out' },
        );
    return Promise.all([blow.then(() => clip.remove()), ...targets.map((id) => specks(id, '#e4f5ff', { count: 5, rise: false }))]);
  }

  // A column of holy light falling on each foe.
  function beams(color, targets) {
    return Promise.all(
      targets.map((id, index) => {
        const entry = cards.get(id);
        if (!entry) return null;
        const beam = spark('fx-beam', centerOf(entry.card), { '--fx': color });
        beam.style.height = `${entry.card.offsetHeight + 20}px`;
        return animate(
          beam,
          [
            { transform: 'translate(-50%, -50%) scaleY(0)', opacity: 0 },
            { transform: 'translate(-50%, -50%) scaleY(1)', opacity: 1, offset: 0.35 },
            { transform: 'translate(-50%, -50%) scale(1.5, 1)', opacity: 0 },
          ],
          { duration: 680, delay: index * 80, easing: 'ease-out', fill: 'backwards' },
        ).then(() => beam.remove());
      }),
    );
  }

  // Arrows falling on every enemy at once.
  function rain(color, targets) {
    return Promise.all(
      targets.map((id, index) => {
        const entry = cards.get(id);
        if (!entry) return null;
        const { x, y } = centerOf(entry.card);
        return Promise.all(
          [-12, 0, 12].map((dx, arrow) => {
            const mark = spark('projectile projectile--arrow projectile--fall projectile--glow', { x: x + dx, y }, { '--fx': color });
            return animate(
              mark,
              [
                { transform: 'translate(0, -70px) rotate(90deg)', opacity: 0 },
                { opacity: 1, offset: 0.3 },
                { transform: 'translate(0, -6px) rotate(90deg)', opacity: 1 },
              ],
              { duration: 300, delay: index * 60 + arrow * 40, easing: 'ease-in', fill: 'backwards' },
            ).then(() => mark.remove());
          }),
        );
      }),
    );
  }

  // Faint copies of a card that drift aside and fade: a dance of shadows.
  function ghosts(id, color) {
    const entry = cards.get(id);
    if (!entry || reduced()) return aura(id, color, 1);
    return Promise.all(
      [-18, 18].map((dx) => {
        const copy = entry.card.cloneNode(true);
        copy.classList.add('fx-ghost');
        copy.removeAttribute('aria-label');
        copy.style.setProperty('--fx', color);
        const box = boxOf(entry.card);
        copy.style.left = `${box.x}px`;
        copy.style.top = `${box.y}px`;
        copy.style.width = `${box.width}px`;
        copy.style.height = `${box.height}px`;
        fx.append(copy);
        return animate(
          copy,
          [
            { transform: 'translateX(0)', opacity: 0.6 },
            { transform: `translateX(${dx}px)`, opacity: 0 },
          ],
          { duration: 620, easing: 'ease-out' },
        ).then(() => copy.remove());
      }),
    );
  }

  // A blue bubble around a card, kept while the shield holds.
  function bubble(id, color) {
    const entry = cards.get(id);
    if (!entry) return Promise.resolve();
    entry.card.classList.add('unit--shielded');
    entry.card.style.setProperty('--shield', color);
    return ring(id, color, 120, 700);
  }

  // A round flash over a whole card, then a ring around it.
  function flashAround(id, color) {
    const entry = cards.get(id);
    if (!entry) return Promise.resolve();
    const size = Math.round(Math.hypot(entry.card.offsetWidth, entry.card.offsetHeight));
    return Promise.all([burst(id, color, size), ring(id, color, Math.round(size * 1.25), 700)]);
  }

  // A flash of light over the whole arena (an explosion's, a shield's).
  function flash(color, strength = 0.2, duration = 360) {
    const veil = h('span', { class: 'fx-flash' });
    veil.style.setProperty('--fx', color);
    fx.append(veil);
    return animate(veil, [{ opacity: 0 }, { opacity: strength, offset: 0.2 }, { opacity: 0 }], { duration, easing: 'ease-out' }).then(() => veil.remove());
  }

  // The fireball gathering in the Mag's hands before it flies.
  function gather(id) {
    const entry = cards.get(id);
    if (!entry || reduced()) return Promise.resolve();
    const { x, y } = centerOf(entry.card);
    const orb = spark('fx-fireball', { x, y }, { '--size': `${Math.round(entry.card.offsetWidth * 0.42)}px` });
    particles?.burst({ x, y, count: 10, colors: FIRE, speed: [20, 70], life: [260, 460], size: [1.4, 2.8], shape: 'ember', rise: 40, drag: 1.5, gravity: -40 });
    return animate(
      orb,
      [
        { transform: 'translate(-50%, -50%) scale(0.1) rotate(0deg)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(0.8) rotate(120deg)', opacity: 1, offset: 0.7 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(200deg)', opacity: 0 },
      ],
      { duration: 380, easing: 'ease-out' },
    ).then(() => orb.remove());
  }

  // The fireball bursting on its target: a bloom of fire, a ring, embers,
  // sparks and smoke, the arena lit up and the target scorched.
  function explode(id) {
    const entry = cards.get(id);
    if (!entry) return Promise.resolve();
    const { x, y } = centerOf(entry.card);
    const size = Math.round(Math.hypot(entry.card.offsetWidth, entry.card.offsetHeight) * 0.9);
    const bloom = spark('fx-explosion', { x, y }, { '--size': `${size}px` });
    particles?.burst({ x, y, count: 26, colors: FIRE, angle: -Math.PI / 2, spread: Math.PI, speed: [140, 340], life: [420, 900], size: [1.4, 3.2], shape: 'ember', gravity: 170, drag: 2.2 });
    particles?.burst({ x, y, count: 14, colors: ['#fff7d6', '#ffd27a'], speed: [220, 440], life: [160, 340], size: [1.2, 2], shape: 'spark', drag: 4 });
    particles?.burst({ x, y, count: 7, colors: SMOKE, speed: [16, 60], life: [800, 1300], size: [6, 11], shape: 'dust', gravity: -40, drag: 1.6, area: { width: size * 0.4, height: size * 0.3 } });
    flash('#ff9a4d', 0.2, 380);
    animate(entry.card, [{ filter: 'brightness(1.9) sepia(0.6) saturate(2.2)' }, { filter: 'brightness(1)' }], { duration: 650, easing: 'ease-out' });
    return Promise.all([
      animate(
        bloom,
        [
          { transform: 'translate(-50%, -50%) scale(0.15)', opacity: 1 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.95, offset: 0.35 },
          { transform: 'translate(-50%, -50%) scale(1.3)', opacity: 0 },
        ],
        { duration: 560, easing: 'ease-out' },
      ).then(() => bloom.remove()),
      ring(id, '#ffcf8a', Math.round(size * 1.5), 520),
    ]);
  }

  // Streaks of wind blowing over the enemy row, one after another.
  function windLines() {
    const clip = overRow();
    if (!clip) return Promise.resolve();
    const lines = [0.22, 0.42, 0.62, 0.8].map((top, index) => {
      const line = h('span', { class: 'fx-windline' });
      line.style.top = `${top * 100}%`;
      clip.append(line);
      return animate(
        line,
        [
          { transform: 'translateX(-90%) scaleX(0.4)', opacity: 0 },
          { transform: 'translateX(10%) scaleX(1)', opacity: 1, offset: 0.45 },
          { transform: 'translateX(150%) scaleX(0.6)', opacity: 0 },
        ],
        { duration: 560, delay: index * 70, easing: 'ease-out', fill: 'backwards' },
      );
    });
    return Promise.all(lines).then(() => clip.remove());
  }

  // Frost settling on a foe: an icy rim, shards and crystals.
  function freeze(id) {
    const entry = cards.get(id);
    if (!entry) return Promise.resolve();
    const { x, y } = centerOf(entry.card);
    entry.card.classList.add('unit--frosted');
    wait(1200).then(() => entry.card.classList.remove('unit--frosted'));
    particles?.burst({ x, y, count: 12, colors: ['#ffffff', '#cfefff', '#8fd3ff'], speed: [60, 170], life: [380, 720], size: [1.6, 3], shape: 'shard', gravity: 240, drag: 2 });
    [-0.28, 0.05, 0.3].forEach((dx, index) => {
      const crystal = spark('fx-crystal', { x: x + dx * entry.card.offsetWidth, y: y + (index % 2 ? -0.16 : 0.12) * entry.card.offsetHeight });
      animate(
        crystal,
        [
          { transform: 'translate(-50%, -50%) scale(0) rotate(0deg)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(1.15) rotate(30deg)', opacity: 1, offset: 0.3 },
          { transform: 'translate(-50%, -50%) scale(0.9) rotate(50deg)', opacity: 0 },
        ],
        { duration: 900, delay: index * 60, easing: 'ease-out', fill: 'backwards' },
      ).then(() => crystal.remove());
    });
    return wait(380);
  }

  // The Mroźny podmuch's new look: a cone of snow from the Mag, wind over the
  // foes and frost on each of them.
  async function blizzard(event, color, targets) {
    const caster = cards.get(event.actor);
    const foes = row('enemy');
    if (!caster || !foes || reduced() || !particles) return gust(color, targets);
    const from = centerOf(caster.card);
    const box = boxOf(foes);
    const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const reach = Math.hypot(to.x - from.x, to.y - from.y);
    const cone = spark('fx-cone', from, { '--fx': color });
    cone.style.width = `${Math.round(reach * 1.15)}px`;
    cone.style.height = `${Math.round(Math.max(60, reach * 0.55))}px`;
    animate(
      cone,
      [
        { transform: `translate(0, -50%) rotate(${angle}rad) scaleX(0.1)`, opacity: 0 },
        { transform: `translate(0, -50%) rotate(${angle}rad) scaleX(1)`, opacity: 0.9, offset: 0.45 },
        { transform: `translate(0, -50%) rotate(${angle}rad) scaleX(1.05)`, opacity: 0 },
      ],
      { duration: 620, easing: 'ease-out' },
    ).then(() => cone.remove());
    for (let wave = 0; wave < 3; wave++) {
      wait(wave * 90).then(() => particles.burst({ x: from.x, y: from.y, count: 30, colors: ICE, angle, spread: 0.32, speed: [reach * 1.3, reach * 2.1], life: [480, 820], size: [1.6, 3.4], shape: 'mote', drag: 0.5 }));
    }
    const streaks = windLines();
    await wait(240);
    await Promise.all([streaks, ...targets.map((id, index) => wait(index * 70).then(() => freeze(id)))]);
  }

  // The Osłona many's new look: motes of mana drawn into the Mag, then a
  // dome of hexagons that flares and settles into the shield.
  async function hexShield(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await bubble(id, color);
      return;
    }
    const { x, y } = centerOf(entry.card);
    const radius = Math.hypot(entry.card.offsetWidth, entry.card.offsetHeight) * 0.62;
    for (let index = 0; index < 16; index++) {
      const angle = (index / 16) * Math.PI * 2;
      particles.burst({ x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius, count: 1, colors: [color, '#e8f4ff'], angle: angle + Math.PI, spread: 0.04, speed: [radius * 2.3, radius * 2.5], life: [330, 360], size: [1.6, 2.6], shape: 'mote', drag: 0 });
    }
    await wait(300);
    // A wall of hexagons the shape of the card, so it never leaves the arena.
    const box = boxOf(entry.card);
    const wall = h('span', { class: 'fx-hexwall' });
    wall.style.left = `${box.x - 5}px`;
    wall.style.top = `${box.y - 5}px`;
    wall.style.width = `${box.width + 10}px`;
    wall.style.height = `${box.height + 10}px`;
    wall.style.setProperty('--fx', color);
    wall.innerHTML = hexPattern(color);
    fx.append(wall);
    entry.card.classList.add('unit--shielded');
    entry.card.style.setProperty('--shield', color);
    flash(color, 0.12, 320);
    await animate(
      wall,
      [
        { clipPath: 'circle(0% at 50% 50%)', opacity: 1, transform: 'scale(0.96)' },
        { clipPath: 'circle(75% at 50% 50%)', opacity: 1, transform: 'scale(1.03)', offset: 0.35 },
        { clipPath: 'circle(75% at 50% 50%)', opacity: 0.8, transform: 'scale(1)', offset: 0.7 },
        { clipPath: 'circle(75% at 50% 50%)', opacity: 0, transform: 'scale(1)' },
      ],
      { duration: 1100, easing: 'ease-out' },
    );
    wall.remove();
  }

  // The Celny strzał's sight closing on its target and locking on.
  function reticle(id, color) {
    const entry = cards.get(id);
    if (!entry) return Promise.resolve();
    const size = Math.round(Math.max(entry.card.offsetWidth, entry.card.offsetHeight) * 0.95);
    const sight = spark('fx-reticle', centerOf(entry.card), { '--fx': color, '--size': `${size}px` });
    sight.innerHTML = RETICLE;
    return animate(
      sight,
      [
        { transform: 'translate(-50%, -50%) scale(1.9) rotate(60deg)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1, offset: 0.45 },
        { transform: 'translate(-50%, -50%) scale(0.92) rotate(0deg)', opacity: 1, offset: 0.6 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1, offset: 0.85 },
        { transform: 'translate(-50%, -50%) scale(0.7) rotate(0deg)', opacity: 0 },
      ],
      { duration: 620, easing: 'ease-out' },
    ).then(() => sight.remove());
  }

  // An aimed arrow piercing its target: a bright line through it along the
  // shot, and sparks thrown on.
  function pierce(event, color) {
    const target = cards.get(event.target);
    const shooter = cards.get(event.actor);
    if (!target || !shooter) return Promise.resolve();
    const to = centerOf(target.card);
    const from = centerOf(shooter.card);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const length = Math.hypot(target.card.offsetWidth, target.card.offsetHeight) * 1.5;
    const line = spark('fx-pierce', to, { '--fx': color });
    line.style.width = `${Math.round(length)}px`;
    particles?.burst({ x: to.x, y: to.y, count: 16, colors: ['#ffffff', color, '#ffe0c4'], angle, spread: 0.35, speed: [200, 420], life: [180, 360], size: [1.2, 2.4], shape: 'spark', drag: 3.5 });
    return animate(
      line,
      [
        { transform: `translate(-50%, -50%) rotate(${angle}rad) scaleX(0)`, opacity: 1 },
        { transform: `translate(-50%, -50%) rotate(${angle}rad) scaleX(1)`, opacity: 1, offset: 0.3 },
        { transform: `translate(-50%, -50%) rotate(${angle}rad) scaleX(1.1) scaleY(0.3)`, opacity: 0 },
      ],
      { duration: 380, easing: 'ease-out' },
    ).then(() => line.remove());
  }

  // One arrow of a volley: up from the archer, or down onto a foe.
  function arrowFlight(point, frames, duration, delay, color) {
    const arrow = spark('projectile projectile--arrow projectile--glow', point, { '--fx': color });
    return animate(arrow, frames, { duration, delay, easing: 'ease-in', fill: 'backwards' }).then(() => arrow.remove());
  }

  // The Grad strzał's new look: a volley loosed up into the sky, then a
  // shower of arrows on every foe, each raising dust where it lands.
  async function volley(event, color, targets) {
    const caster = cards.get(event.actor);
    if (!caster || reduced()) {
      await rain(color, targets);
      return;
    }
    const from = centerOf(caster.card);
    const up = [-14, -5, 4, 13, 22].map((dx, index) =>
      arrowFlight(
        { x: from.x + dx, y: from.y },
        [
          { transform: 'translate(0, 0) rotate(-90deg)', opacity: 0 },
          { opacity: 1, offset: 0.2 },
          { transform: `translate(${dx * 0.6}px, -240px) rotate(-90deg)`, opacity: 0 },
        ],
        300,
        index * 45,
        color,
      ),
    );
    await wait(260);
    const falls = targets.flatMap((id, index) => {
      const entry = cards.get(id);
      if (!entry) return [];
      const box = boxOf(entry.card);
      return [-0.32, -0.12, 0.08, 0.26, 0.4].map((dx, arrow) => {
        const land = { x: box.x + box.width * (0.5 + dx), y: box.y + box.height * (0.42 + (arrow % 2) * 0.22) };
        const delay = index * 60 + arrow * 45;
        return arrowFlight(
          land,
          [
            { transform: 'translate(-26px, -110px) rotate(76deg)', opacity: 0 },
            { opacity: 1, offset: 0.25 },
            { transform: 'translate(0, 0) rotate(76deg)', opacity: 1 },
          ],
          260,
          delay,
          color,
        ).then(() => particles?.burst({ x: land.x, y: land.y + 4, count: 2, colors: DUST, speed: [10, 40], life: [380, 620], size: [3, 5], shape: 'dust', gravity: -10, drag: 2 }));
      });
    });
    await Promise.all([...up, ...falls]);
  }

  // The Przyszpilenie's new look: the arrow stays stuck at the foe's feet,
  // quivering, and a coil of rope tightens round it.
  function pin(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return Promise.resolve();
    const box = boxOf(entry.card);
    const foot = { x: box.x + box.width * 0.62, y: box.y + box.height - 10 };
    const arrow = spark('projectile projectile--arrow projectile--glow fx-pinned', foot, { '--fx': color });
    const rope = spark('fx-rope', { x: box.x + box.width / 2, y: box.y + box.height - 6 }, { '--fx': color });
    rope.style.width = `${Math.round(box.width * 1.08)}px`;
    particles?.burst({ x: foot.x, y: foot.y, count: 6, colors: DUST, speed: [20, 70], life: [420, 700], size: [3, 6], shape: 'dust', gravity: -12, drag: 2 });
    animate(entry.card, [{ transform: 'translateY(0)' }, { transform: 'translateY(3px)' }, { transform: 'translateY(0)' }], { duration: 220, easing: 'ease-out' });
    const quiver = animate(
      arrow,
      [
        { transform: 'translate(-50%, -50%) rotate(58deg)' },
        { transform: 'translate(-50%, -50%) rotate(70deg)', offset: 0.1 },
        { transform: 'translate(-50%, -50%) rotate(60deg)', offset: 0.2 },
        { transform: 'translate(-50%, -50%) rotate(67deg)', offset: 0.3 },
        { transform: 'translate(-50%, -50%) rotate(63deg)', offset: 0.4 },
        { transform: 'translate(-50%, -50%) rotate(64deg)', opacity: 1, offset: 0.85 },
        { transform: 'translate(-50%, -50%) rotate(64deg)', opacity: 0 },
      ],
      { duration: 1500, easing: 'ease-out' },
    ).then(() => arrow.remove());
    const tie = animate(
      rope,
      [
        { transform: 'translate(-50%, -50%) scale(1.5, 1.5)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1, 1)', opacity: 1, offset: 0.25 },
        { transform: 'translate(-50%, -50%) scale(1, 1)', opacity: 1, offset: 0.8 },
        { transform: 'translate(-50%, -50%) scale(1, 1)', opacity: 0 },
      ],
      { duration: 1400, easing: 'ease-out' },
    ).then(() => rope.remove());
    return Promise.all([quiver, tie]);
  }

  // The Potężny cios's new look: the ground cracks under the foe, a shock
  // wave runs out and stones fly.
  function quake(id, color) {
    const entry = cards.get(id);
    if (!entry) return Promise.resolve();
    const box = boxOf(entry.card);
    const base = { x: box.x + box.width / 2, y: box.y + box.height - 8 };
    const cracks = spark('fx-cracks', base, { '--fx': color });
    cracks.style.width = `${Math.round(box.width * 1.7)}px`;
    cracks.innerHTML = CRACKS;
    particles?.burst({ x: base.x, y: base.y, count: 12, colors: STONE, angle: -Math.PI / 2, spread: 1.2, speed: [120, 280], life: [420, 760], size: [1.8, 3.4], shape: 'shard', gravity: 520, drag: 1.2 });
    particles?.burst({ x: base.x, y: base.y, count: 8, colors: DUST, speed: [30, 90], life: [600, 950], size: [5, 9], shape: 'dust', gravity: -20, drag: 2, area: { width: box.width, height: 8 } });
    animate(entry.card, [{ transform: 'translateY(0)' }, { transform: 'translateY(5px) scaleY(0.97)', offset: 0.25 }, { transform: 'translateY(0)' }], { duration: 300, easing: 'ease-out' });
    const wave = spark('fx-shockwave', base, { '--fx': color });
    wave.style.width = `${Math.round(box.width * 2.2)}px`;
    return Promise.all([
      animate(
        cracks,
        [
          { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 1 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.25 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.7 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
        ],
        { duration: 900, easing: 'ease-out' },
      ).then(() => cracks.remove()),
      animate(
        wave,
        [
          { transform: 'translate(-50%, -50%) scale(0.15)', opacity: 0.95 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
        ],
        { duration: 480, easing: 'ease-out' },
      ).then(() => wave.remove()),
    ]);
  }

  // The Szeroki zamach's new look: a broad glowing crescent swept over the
  // whole enemy row, each foe flashing as it passes.
  async function crescent(color, targets) {
    const clip = overRow();
    if (!clip || reduced()) {
      if (clip) clip.remove();
      await arc(color);
      return;
    }
    // A giant blade's arc, swung on a pivot below the row, with two fading
    // copies behind it for its blur.
    const box = boxOf(clip);
    const blades = [0, 45, 90].map((delay, index) => {
      const blade = h('span', { class: 'fx-crescent' });
      blade.style.setProperty('--fx', color);
      blade.style.width = `${Math.round(box.width * 1.1)}px`;
      blade.style.opacity = '0';
      blade.innerHTML =
        '<svg viewBox="0 0 200 80" aria-hidden="true"><defs><linearGradient id="fx-crescent-' + index + '" x1="0" x2="1">' +
        '<stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.45" stop-color="#ffffff"/><stop offset="0.8" stop-color="currentColor"/>' +
        '<stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>' +
        '<path d="M6 72 Q100 -22 194 72 Q100 14 6 72 Z" fill="url(#fx-crescent-' + index + ')"/></svg>';
      clip.append(blade);
      const fade = [1, 0.45, 0.22][index];
      return animate(
        blade,
        [
          { transform: 'translate(-50%, -50%) rotate(-64deg)', opacity: 0 },
          { transform: 'translate(-50%, -50%) rotate(-30deg)', opacity: fade, offset: 0.22 },
          { transform: 'translate(-50%, -50%) rotate(34deg)', opacity: fade, offset: 0.78 },
          { transform: 'translate(-50%, -50%) rotate(58deg)', opacity: 0 },
        ],
        { duration: 520, delay, easing: 'cubic-bezier(0.35, 0, 0.3, 1)', fill: 'backwards' },
      );
    });
    const sweep = Promise.all(blades);
    const row0 = boxOf(clip);
    const flashes = targets.map((id) => {
      const entry = cards.get(id);
      if (!entry) return null;
      const { x } = centerOf(entry.card);
      const share = Math.min(1, Math.max(0, (x - row0.x) / Math.max(1, row0.width)));
      return wait(140 + share * 240).then(() => {
        const point = centerOf(entry.card);
        particles?.burst({ x: point.x, y: point.y, count: 8, colors: ['#ffffff', color], angle: 0, spread: 0.6, speed: [160, 320], life: [180, 340], size: [1.2, 2.2], shape: 'spark', drag: 3.5 });
        return animate(entry.card, [{ filter: 'brightness(2.2)' }, { filter: 'brightness(1)' }], { duration: 260, easing: 'ease-out' });
      });
    });
    await Promise.all([sweep.then(() => clip.remove()), ...flashes]);
  }

  // The Nieugięty's new look: a golden shield comes down on the warrior,
  // with a ring on the ground and golden sparks.
  function emblem(id, color) {
    const entry = cards.get(id);
    if (!entry) return Promise.resolve();
    const { x, y } = centerOf(entry.card);
    const size = Math.round(entry.card.offsetWidth * 0.9);
    const shield = spark('fx-emblem', { x, y }, { '--fx': color, '--size': `${size}px` });
    shield.innerHTML = EMBLEM;
    particles?.burst({ x, y: y + entry.card.offsetHeight * 0.35, count: 16, colors: ['#fff3c4', color, '#e8c76a'], angle: -Math.PI / 2, spread: 1.3, speed: [80, 200], life: [380, 700], size: [1.2, 2.4], shape: 'spark', gravity: 160, drag: 2 });
    return Promise.all([
      animate(
        shield,
        [
          { transform: 'translate(-50%, -110%) scale(1.5)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(0.95)', opacity: 1, offset: 0.28 },
          { transform: 'translate(-50%, -50%) scale(1.04)', opacity: 1, offset: 0.4 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.9, offset: 0.75 },
          { transform: 'translate(-50%, -50%) scale(1.1)', opacity: 0 },
        ],
        { duration: 1000, easing: 'ease-out' },
      ).then(() => shield.remove()),
      wait(260).then(() => ring(id, color, Math.round(entry.card.offsetWidth * 1.6), 520)),
      wait(260).then(() => animate(entry.card, [{ boxShadow: `0 0 0 0 ${color}` }, { boxShadow: `0 0 16px 4px ${color}`, offset: 0.3 }, { boxShadow: '0 0 0 0 transparent' }], { duration: 700 })),
    ]);
  }

  // A step of an effect after a pause, left out when the fight was cut short
  // meanwhile: Pomiń and Powtórz clear the stage, `element` with it, so a
  // late step neither flashes over the replay nor sets an HP over the end.
  const after = (ms, element, step) => wait(ms).then(() => (element.isConnected ? step() : null));

  // The stage's size, and a middle kept inside it for a thing `half` wide.
  const stageWidth = () => kit.arena.clientWidth;
  const stageHeight = () => kit.arena.clientHeight;
  const inside = (value, half, size) => Math.min(Math.max(value, half + 2), Math.max(half + 2, size - half - 2));
  // The box of a card's picture (its upper part when it has none).
  function artOf(card) {
    const art = card.querySelector('.unit-art');
    if (art) return boxOf(art);
    const box = boxOf(card);
    return { x: box.x, y: box.y, width: box.width, height: box.height * 0.5 };
  }
  // The size of the figure in a card's picture, which keeps its size when a
  // computer's card is wider: the looks round a figure follow it.
  const figureOf = (art) => Math.min(art.width, art.height);

  // A four-pointed glint that flares and turns.
  function twinkle(point, color, size = 16, delay = 0) {
    const star = spark('fx-glint', point, { '--fx': color, '--size': `${Math.round(size)}px` });
    star.innerHTML = GLINT;
    return animate(
      star,
      [
        { transform: 'translate(-50%, -50%) scale(0) rotate(0deg)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.25) rotate(45deg)', opacity: 1, offset: 0.35 },
        { transform: 'translate(-50%, -50%) scale(0) rotate(90deg)', opacity: 0 },
      ],
      { duration: 440, delay, easing: 'ease-out', fill: 'backwards' },
    ).then(() => star.remove());
  }

  // A ring of light opening on the ground at a card's foot.
  function groundRing(id, color, { delay = 0, scale = 1, duration = 820 } = {}) {
    const entry = cards.get(id);
    if (!entry) return Promise.resolve();
    const box = boxOf(entry.card);
    const mark = spark('fx-groundring', { x: box.x + box.width / 2, y: box.y + box.height - 9 }, { '--fx': color });
    mark.style.width = `${Math.round(Math.min(box.width * 0.96, figureOf(artOf(entry.card)) * 1.4) * scale)}px`;
    return animate(
      mark,
      [
        { transform: 'translate(-50%, -50%) scale(0.25)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(0.85)', opacity: 1, offset: 0.35 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
      ],
      { duration, delay, easing: 'ease-out', fill: 'backwards' },
    ).then(() => mark.remove());
  }

  // The Modlitwa o zdrowie's new look: a soft beam of light comes down on the
  // healed ally, rings of light open at its feet, and a cross of light forms
  // over it and breaks into small crosses as the HP comes back.
  async function lightfall(event, color) {
    const entry = cards.get(event.target);
    const landed = () => {
      kit.setHp(event.target, event.hp);
      kit.float(event.target, `+${event.amount}`, 'heal');
    };
    if (!entry) {
      landed();
      return;
    }
    const box = boxOf(entry.card);
    const x = box.x + box.width / 2;
    const top = Math.max(0, box.y - box.height * 0.8);
    const foot = box.y + box.height - 6;
    const span = Math.min(box.width * 0.84, figureOf(artOf(entry.card)) * 1.2);
    const beam = spark('fx-lightfall', { x, y: top }, { '--fx': color });
    beam.style.width = `${Math.round(span)}px`;
    beam.style.height = `${Math.round(foot - top)}px`;
    animate(
      beam,
      [
        { transform: 'translate(-50%, 0) scaleY(0)', opacity: 0 },
        { transform: 'translate(-50%, 0) scaleY(1)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, 0) scale(1.06, 1)', opacity: 0.9, offset: 0.65 },
        { transform: 'translate(-50%, 0) scale(0.55, 1)', opacity: 0 },
      ],
      { duration: 1300, easing: 'ease-out' },
    ).then(() => beam.remove());
    // Light falling down the beam.
    for (let wave = 0; wave < 4; wave++) {
      after(wave * 110, beam, () =>
        particles.burst({ x, y: top + 4, area: { width: span * 0.55, height: 10 }, count: 4, colors: ['#ffffff', '#fff6cf', '#e3f5a8'], angle: Math.PI / 2, spread: 0.05, speed: [280, 400], life: [240, 380], size: [0.9, 1.5], shape: 'spark', drag: 1 }),
      );
    }
    await wait(240);
    if (!beam.isConnected) return;
    // The light lands: the card brightens, motes rise from its feet and a
    // cross of light forms over it, then breaks into small crosses as the
    // HP comes back.
    animate(entry.card, [{ filter: 'brightness(1.35) saturate(1.1)' }, { filter: 'brightness(1)' }], { duration: 700, easing: 'ease-out' });
    particles.burst({ x, y: foot - 4, area: { width: span * 0.95, height: 6 }, count: 10, colors: LIFE, angle: -Math.PI / 2, spread: 0.35, speed: [40, 90], rise: 20, gravity: -30, drag: 0.8, life: [800, 1200], size: [1.2, 2.2], shape: 'mote' });
    const crossAt = { x, y: box.y + box.height * 0.36 };
    const cross = spark('fx-holycross', crossAt, { '--fx': color, '--size': `${Math.round(Math.min(box.width, box.height) * 0.42)}px` });
    cross.innerHTML = CROSS;
    const lift = animate(
      cross,
      [
        { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.15)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.34 },
        { transform: 'translate(-50%, -50%) scale(1.02)', opacity: 1, offset: 0.66 },
        { transform: 'translate(-50%, -50%) scale(1.5)', opacity: 0 },
      ],
      { duration: 460, easing: 'ease-out' },
    ).then(() => cross.remove());
    after(320, beam, () => {
      particles.burst({ x, y: crossAt.y, count: 10, colors: LIFE, angle: -Math.PI / 2, spread: 1.3, speed: [50, 130], gravity: -20, drag: 1.8, life: [700, 1100], size: [1.6, 2.6], shape: 'plus' });
      landed();
    });
    await Promise.all([groundRing(event.target, color), groundRing(event.target, '#fff6cf', { delay: 160, scale: 0.8 }), lift, aura(event.target, color, 1), wait(820)]);
  }

  // The Egzorcyzm's new look: a circle of runes opens under each foe, a
  // pillar of light comes down on it and tears dark wisps out of it, the
  // arena lit up. Resolves when the light has struck the last foe.
  async function exorcise(color, targets) {
    if (reduced() || !particles) {
      await beams(color, targets);
      return;
    }
    await Promise.all(targets.map((id, index) => purge(id, color, index * 90, index === 0)));
  }

  // One foe of the Egzorcyzm: its circle at the creature's feet (under its
  // picture, so its HP stays in sight), the pillar down to it, the strike.
  async function purge(id, color, delay, first) {
    const entry = cards.get(id);
    if (!entry) return;
    const box = boxOf(entry.card);
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const width = stageWidth();
    const x = art.x + art.width / 2;
    const foot = art.y + art.height - 6;
    const size = Math.round(Math.min(box.width, figure * 1.3, (Math.min(x, width - x) - 2) * 2));
    const circle = spark('fx-runes', { x, y: foot }, { '--fx': color, '--size': `${size}px` });
    circle.innerHTML = RUNES;
    const flat = 'translate(-50%, -50%) scale(1, 0.38)';
    animate(
      circle,
      [
        { transform: `${flat} rotate(-50deg) scale(0.3)`, opacity: 0 },
        { transform: `${flat} rotate(0deg) scale(1)`, opacity: 1, offset: 0.26 },
        { transform: `${flat} rotate(45deg) scale(1)`, opacity: 1, offset: 0.66 },
        { transform: `${flat} rotate(68deg) scale(1.1)`, opacity: 0 },
      ],
      { duration: 1150, delay, fill: 'backwards' },
    ).then(() => circle.remove());
    after(delay, circle, () => particles.burst({ x, y: foot, area: { width: size * 0.8, height: size * 0.22 }, count: 6, colors: HOLY, angle: -Math.PI / 2, spread: 0.3, speed: [20, 60], rise: 10, gravity: -40, drag: 1, life: [600, 900], size: [1, 1.8], shape: 'mote' }));
    await wait(delay + 220);
    if (!circle.isConnected) return;
    // The pillar: from above the foe (never above the stage) to its circle.
    const top = Math.max(0, box.y - box.height * 0.55);
    const pillar = spark('fx-pillar', { x, y: top }, { '--fx': color });
    pillar.style.width = `${Math.round(figure * 0.72)}px`;
    pillar.style.height = `${Math.round(foot - top + 6)}px`;
    animate(
      pillar,
      [
        { transform: 'translate(-50%, 0) scaleY(0)', opacity: 1 },
        { transform: 'translate(-50%, 0) scaleY(1)', opacity: 1, offset: 0.16 },
        { transform: 'translate(-50%, 0) scale(1.3, 1)', opacity: 1, offset: 0.3 },
        { transform: 'translate(-50%, 0) scale(1, 1)', opacity: 0.8, offset: 0.6 },
        { transform: 'translate(-50%, 0) scale(0.2, 1)', opacity: 0 },
      ],
      { duration: 1000, easing: 'ease-out' },
    ).then(() => pillar.remove());
    await wait(165);
    if (!pillar.isConnected) return;
    // The light strikes: a bloom on the circle, the foe blazes and dark
    // wisps are torn out of it; the first strike lights the arena up.
    if (first) flash('#fff3c4', 0.16, 420);
    const bloom = spark('fx-burst', { x, y: foot }, { '--fx': color, '--size': `${Math.round(size * 0.8)}px` });
    animate(
      bloom,
      [
        { transform: 'translate(-50%, -50%) scale(0.3, 0.12)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1, 0.45)', opacity: 1, offset: 0.3 },
        { transform: 'translate(-50%, -50%) scale(1.3, 0.55)', opacity: 0 },
      ],
      { duration: 480, easing: 'ease-out' },
    ).then(() => bloom.remove());
    animate(entry.card, [{ filter: 'brightness(1.9) saturate(0.7)' }, { filter: 'brightness(1)' }], { duration: 560, easing: 'ease-out' });
    particles.burst({ x, y: foot, area: { width: size * 0.7, height: 6 }, count: 10, colors: HOLY, angle: -Math.PI / 2, spread: 1.2, speed: [60, 160], drag: 2.5, life: [300, 560], size: [1.1, 2], shape: 'spark' });
    tear({ x: x - figure / 2, y: art.y, width: figure, height: art.height });
  }

  // Dark wisps and smoke torn out of a foe's picture, rising into the light.
  function tear(box) {
    const x = box.x + box.width / 2;
    const y = box.y + box.height * 0.6;
    particles.burst({ x, y, area: { width: box.width * 0.55, height: box.height * 0.3 }, count: 8, colors: SHADE, angle: -Math.PI / 2, spread: 0.5, speed: [40, 110], gravity: -60, drag: 1.4, life: [600, 950], size: [3.5, 6], shape: 'dust' });
    particles.burst({ x, y, area: { width: box.width * 0.5, height: box.height * 0.3 }, count: 8, colors: ['#c9b7ff', '#7b5fc7', '#fff6cf'], angle: -Math.PI / 2, spread: 0.6, speed: [60, 160], gravity: -40, drag: 2, life: [400, 700], size: [1.2, 2.2], shape: 'ember' });
    [-0.22, 0.04, 0.25].forEach((dx, index) => {
      const wisp = spark('fx-wisp', { x: x + dx * box.width, y: y + (index % 2) * 10 });
      wisp.innerHTML = WISP;
      const lean = dx * 40;
      animate(
        wisp,
        [
          { transform: 'translate(-50%, -30%) scale(0.6, 0.4)', opacity: 0 },
          { transform: `translate(-50%, -60%) rotate(${(lean * 0.3).toFixed(1)}deg) scale(1, 1)`, opacity: 0.95, offset: 0.3 },
          { transform: `translate(calc(-50% + ${(lean * 0.4).toFixed(1)}px), -130%) rotate(${lean.toFixed(1)}deg) scale(0.7, 1.4)`, opacity: 0 },
        ],
        { duration: 700, delay: index * 60, easing: 'ease-out', fill: 'backwards' },
      ).then(() => wisp.remove());
    });
  }

  // The Błogosławieństwo's new look: rays of light open behind the Kleryk's
  // head, a golden halo settles over it, golden feathers and sparks drift
  // down and a warm light fills the card.
  async function halo(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await Promise.all([ring(id, color, 130, 760), aura(id, color, 2)]);
      return;
    }
    const box = boxOf(entry.card);
    const art = artOf(entry.card);
    const x = art.x + art.width / 2;
    const face = Math.min(art.width, art.height, 72);
    // The halo over the crown of the head, below the skill's name over the
    // card.
    const crown = art.y + face * 0.17;
    // The rays behind the head.
    const glory = spark('fx-aureole', { x, y: art.y + face * 0.4 }, { '--fx': color, '--size': `${Math.round(Math.min(box.width * 0.98, box.height * 0.9))}px` });
    animate(
      glory,
      [
        { transform: 'translate(-50%, -50%) scale(0.5) rotate(0deg)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(12deg)', opacity: 0.9, offset: 0.25 },
        { transform: 'translate(-50%, -50%) scale(1.02) rotate(36deg)', opacity: 0.75, offset: 0.75 },
        { transform: 'translate(-50%, -50%) scale(1.08) rotate(48deg)', opacity: 0 },
      ],
      { duration: 1500, easing: 'ease-out' },
    ).then(() => glory.remove());
    // The warm light over the card.
    const warmth = h('span', { class: 'fx-tint' });
    warmth.style.setProperty('--fx', color);
    entry.card.append(warmth);
    animate(warmth, [{ opacity: 0 }, { opacity: 0.42, offset: 0.3 }, { opacity: 0.3, offset: 0.7 }, { opacity: 0 }], { duration: 1400, easing: 'ease-out' }).then(() => warmth.remove());
    // The halo comes down and settles over the head.
    const ringWidth = Math.round(face * 0.56);
    const crownMark = spark('fx-halo', { x, y: crown }, { '--fx': color, '--size': `${ringWidth}px` });
    crownMark.innerHTML = HALO;
    animate(
      crownMark,
      [
        { transform: 'translate(-50%, calc(-50% - 18px)) scale(1.3)', opacity: 0 },
        { transform: 'translate(-50%, calc(-50% + 2px)) scale(0.96)', opacity: 1, offset: 0.24 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.34 },
        { transform: 'translate(-50%, calc(-50% - 1px)) scale(1.02)', opacity: 1, offset: 0.8 },
        { transform: 'translate(-50%, calc(-50% - 5px)) scale(1.06)', opacity: 0 },
      ],
      { duration: 1450, easing: 'ease-out' },
    ).then(() => crownMark.remove());
    after(360, crownMark, () => {
      twinkle({ x: x - ringWidth * 0.46, y: crown }, '#fff6cf', 14);
      twinkle({ x: x + ringWidth * 0.46, y: crown }, '#fff6cf', 12, 90);
      particles.burst({ x, y: crown, area: { width: ringWidth, height: 6 }, count: 8, colors: GOLD, angle: -Math.PI / 2, spread: Math.PI, speed: [30, 90], drag: 2, life: [400, 700], size: [1, 1.8], shape: 'spark' });
    });
    // Golden feathers and sparks drifting down over the card, round the
    // figure.
    const spread = Math.min(box.width, figureOf(art) * 1.45);
    const left = box.x + (box.width - spread) / 2;
    particles.burst({ x: box.x + box.width / 2, y: box.y + 6, area: { width: spread * 0.85, height: 14 }, count: 12, colors: GOLD, angle: Math.PI / 2, spread: 0.5, speed: [12, 40], gravity: 34, drag: 0.8, life: [900, 1400], size: [1.1, 2], shape: 'mote' });
    // (They and the halo keep fading while the fight goes on.)
    [0.16, 0.84, 0.36, 0.64, 0.26, 0.74].forEach((share, index) => {
      const feather = spark('fx-feather', { x: left + spread * share, y: box.y - 8 + (index % 3) * 12 }, { '--fx': color });
      feather.innerHTML = FEATHER;
      const fall = box.height * (0.5 + (index % 3) * 0.1);
      const sway = (index % 2 ? 1 : -1) * Math.min(9, spread * 0.08);
      const frames = Array.from({ length: 6 }, (_, step) => {
        const share0 = step / 5;
        const swing = Math.sin(share0 * Math.PI * 2.2 + index) * sway;
        return {
          transform: `translate(calc(-50% + ${swing.toFixed(1)}px), calc(-50% + ${(fall * share0).toFixed(1)}px)) rotate(${(swing * 3.6 + (index % 2 ? 18 : -18)).toFixed(1)}deg)`,
          opacity: step === 0 || step === 5 ? 0 : 1,
        };
      });
      animate(feather, frames, { duration: 1500 + (index % 3) * 180, delay: 60 + index * 70, easing: 'linear', fill: 'backwards' }).then(() => feather.remove());
    });
    await Promise.all([groundRing(id, color, { delay: 280 }), aura(id, color, 2), wait(1150)]);
  }

  // A puff of shadow smoke at a point: a dark cloud that swells and thins,
  // smoke and violet sparks.
  function puff(point, size) {
    const cloud = spark('fx-smoke', point, { '--size': `${Math.round(size)}px` });
    particles.burst({ x: point.x, y: point.y, count: 9, colors: SHADE, speed: [20, 70], life: [600, 950], size: [size * 0.06, size * 0.1], shape: 'dust', gravity: -30, drag: 2.2, area: { width: size * 0.5, height: size * 0.4 } });
    particles.burst({ x: point.x, y: point.y, count: 8, colors: SHADE_SPARKS, speed: [60, 150], life: [300, 560], size: [1.2, 2.2], shape: 'ember', drag: 3 });
    animate(
      cloud,
      [
        { transform: 'translate(-50%, -50%) scale(0.35)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(0.9)', opacity: 0.95, offset: 0.25 },
        { transform: 'translate(-50%, -50%) scale(1.15)', opacity: 0 },
      ],
      { duration: 640, easing: 'ease-out' },
    ).then(() => cloud.remove());
    return cloud;
  }

  // The Cios w plecy's new look, as its blow starts (arena-fx.js strike()
  // fades the Cień out and thrusts its dagger by the target): the Cień
  // vanishes in a puff of shadow smoke and comes out of another behind its
  // target, as a shadow of itself that melts away after the blow; a last
  // puff as it is back in its place.
  function vanish(event) {
    const actor = cards.get(event.actor);
    const target = cards.get(event.target);
    if (!actor || !target || reduced() || !particles) return;
    const from = boxOf(actor.card);
    const to = boxOf(target.card);
    const width = stageWidth();
    const art = artOf(actor.card);
    const smoke = figureOf(art) * 1.3;
    const home = puff({ x: from.x + from.width / 2, y: from.y + from.height * 0.42 }, smoke);
    // Behind the target: on its side toward the arena's middle, where the
    // dagger comes from.
    const side = to.x + to.width / 2 < width / 2 ? 1 : -1;
    const half = figureOf(art) / 2;
    const x = inside(side > 0 ? to.x + to.width + half - 8 : to.x - half + 8, half, width);
    const y = inside(to.y + (art.y - from.y) + art.height / 2, art.height / 2, stageHeight());
    const shade = actor.card.querySelector('.unit-art')?.cloneNode(true) ?? null;
    after(20, home, () => puff({ x, y }, smoke * 0.85));
    if (shade) {
      shade.querySelector('.unit-level')?.remove();
      shade.classList.add('fx-shade');
      shade.setAttribute('aria-hidden', 'true');
      shade.style.left = `${x - art.width / 2}px`;
      shade.style.top = `${y - art.height / 2}px`;
      shade.style.width = `${art.width}px`;
      shade.style.height = `${art.height}px`;
      fx.append(shade);
      animate(
        shade,
        [
          { transform: `translate(${side * 6}px, 4px) scale(0.9)`, opacity: 0 },
          { transform: 'translate(0, 0) scale(1)', opacity: 0.92, offset: 0.15 },
          { transform: 'translate(0, 0) scale(1)', opacity: 0.92, offset: 0.62 },
          { transform: `translate(${-side * 4}px, -8px) scale(1.05)`, opacity: 0 },
        ],
        { duration: 720, delay: 25, easing: 'ease-out', fill: 'backwards' },
      ).then(() => shade.remove());
      after(450, shade, () => puff({ x, y: y + 4 }, smoke * 0.75));
    }
    after(320, home, () => puff({ x: from.x + from.width / 2, y: from.y + from.height * 0.42 }, smoke * 0.75));
  }

  // The Cios w plecy's blow: a violet cut across the target from behind,
  // shadow smoke and violet shards.
  function shadowCut(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    const box = boxOf(entry.card);
    const width = stageWidth();
    const { x, y } = centerOf(entry.card);
    const side = x < width / 2 ? 1 : -1;
    const size = Math.round(Math.min(Math.min(box.width, box.height * 1.15) * 1.3, (Math.min(x, width - x) - 2) * 2));
    const cut = spark('fx-shadowslash', { x, y }, { '--fx': color, '--size': `${size}px` });
    cut.innerHTML = SHADOW_SLASH;
    // Drawn from the Cień's side across to the other.
    const at = `translate(-50%, -50%) scaleX(${-side})`;
    animate(
      cut,
      [
        { transform: `${at} scale(0.92)`, clipPath: 'inset(0 100% 0 0)', opacity: 1 },
        { transform: `${at} scale(1)`, clipPath: 'inset(0 0% 0 0)', opacity: 1, offset: 0.2 },
        { transform: `${at} scale(1.02)`, clipPath: 'inset(0 0% 0 0)', opacity: 1, offset: 0.6 },
        { transform: `${at} scale(1.08)`, clipPath: 'inset(0 0% 0 0)', opacity: 0 },
      ],
      { duration: 600, easing: 'ease-out' },
    ).then(() => cut.remove());
    particles.burst({ x, y, count: 14, colors: SHADE_SPARKS, angle: side > 0 ? Math.PI * 0.82 : Math.PI * 0.18, spread: 0.45, speed: [150, 320], life: [260, 480], size: [1.4, 2.6], shape: 'shard', drag: 3, gravity: 120 });
    puff({ x: x + side * box.width * 0.1, y }, figureOf(artOf(entry.card)) * 1.05);
    burst(event.target, '#7b5fc7', 80);
  }

  // The Zatrute ostrze's new look: the Cień's own blade over its card, point
  // down, venom running down it from the guard to the point, bubbling and
  // dripping from the point, a toxic glint along it and a green haze at the
  // card's foot.
  async function venom(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    const base = entry.unit.weapon ?? (entry.unit.classId === 'shadow' ? 'dagger' : null);
    const steel = base && !reduced() && particles ? itemSprite({ base }) : null;
    if (!steel) {
      await Promise.all([specks(id, color, { rise: false }), aura(id, color, 1)]);
      return;
    }
    const box = boxOf(entry.card);
    const art = artOf(entry.card);
    const size = Math.round(Math.min(art.width, art.height, 72) * 1.08);
    const x = art.x + art.width / 2;
    const y = art.y + art.height * 0.52;
    // Where the point is, the blade turned point down (the item icons'
    // blades point up and to the right).
    const tip = { x, y: y + size * 0.47 };
    const blade = spark('fx-venom', { x, y }, { '--fx': color, '--size': `${size}px` });
    steel.removeAttribute('width');
    steel.removeAttribute('height');
    steel.className = 'fx-venom-steel';
    const coat = steel.cloneNode();
    coat.className = 'fx-venom-coat';
    const shine = h('span', { class: 'fx-venom-shine' });
    const picture = `url("${steel.getAttribute('src')}")`;
    shine.style.setProperty('-webkit-mask-image', picture);
    shine.style.setProperty('mask-image', picture);
    blade.append(steel, coat, shine);
    const held = 'translate(-50%, -50%) rotate(135deg)';
    animate(
      blade,
      [
        { transform: `translate(-50%, calc(-50% - 12px)) rotate(135deg) scale(0.7)`, opacity: 0 },
        { transform: `${held} scale(1)`, opacity: 1, offset: 0.13 },
        { transform: `${held} scale(1)`, opacity: 1, offset: 0.84 },
        { transform: `translate(-50%, calc(-50% + 4px)) rotate(135deg) scale(0.94)`, opacity: 0 },
      ],
      { duration: 1550, easing: 'ease-out' },
    ).then(() => blade.remove());
    // The venom runs down the blade from the crossguard to the point: a band
    // across the blade (in the icon, from its guard's line, x − y = −0.28,
    // toward its point, up and to the right) that grows.
    animate(coat, [{ clipPath: VENOM_FROM }, { clipPath: VENOM_TO }], { duration: 560, delay: 160, easing: 'ease-in-out', fill: 'both' });
    for (const [delay, count] of [
      [260, 5],
      [620, 6],
      [980, 5],
    ]) {
      after(delay, blade, () => particles.burst({ x, y: y + size * 0.1, area: { width: size * 0.16, height: size * 0.6 }, count, colors: ['#eaffc0', '#9ccc65'], angle: -Math.PI / 2, spread: 0.6, speed: [8, 26], rise: 14, life: [600, 1000], size: [1.4, 2.6], shape: 'bubble', drag: 1 }));
    }
    // Drops gather on the point and fall.
    for (const [index, delay] of [560, 960].entries()) {
      after(delay, blade, () => drop(tip, box, index));
    }
    for (let step = 0; step < 6; step++) {
      after(640 + step * 110, blade, () => particles.burst({ x: tip.x, y: tip.y, count: 1, colors: VENOM, angle: Math.PI / 2, spread: 0.15, speed: [10, 30], gravity: 420, life: [360, 480], size: [1.6, 2.4], shape: 'ember', drag: 0.6 }));
    }
    // The toxic glint along the blade, a flash on its point.
    animate(shine, [{ backgroundPosition: '100% 0%', opacity: 1 }, { backgroundPosition: '0% 100%', opacity: 1 }], { duration: 440, delay: 740, easing: 'ease-in-out', fill: 'both' });
    twinkle({ x: tip.x, y: tip.y - size * 0.08 }, '#eaffc0', 18, 1060);
    // A green haze and bubbles at the card's feet, its frame lit green.
    after(420, blade, () => {
      particles.burst({ x: box.x + box.width / 2, y: box.y + box.height - 10, area: { width: size * 1.1, height: 6 }, count: 4, colors: ['#6f9a3a', '#4f7a22'], angle: -Math.PI / 2, spread: 0.8, speed: [6, 18], gravity: -10, drag: 1.5, life: [700, 1000], size: [2.5, 4], shape: 'dust' });
      particles.burst({ x: box.x + box.width / 2, y: box.y + box.height - 12, area: { width: size * 1.0, height: 8 }, count: 7, colors: ['#d7f5a8', '#9ccc65'], angle: -Math.PI / 2, spread: 0.5, speed: [10, 30], rise: 16, life: [600, 950], size: [1.4, 2.4], shape: 'bubble', drag: 1 });
      aura(id, color, 1);
    });
    // The blade fades while the fight goes on.
    await wait(1250);
  }

  // A drop of venom gathering on the blade's point and falling, splashing
  // at the card's foot.
  function drop(tip, box, index) {
    const bead = spark('fx-drop', tip);
    const fall = Math.max(12, box.y + box.height - 14 - tip.y);
    return animate(
      bead,
      [
        { transform: 'translate(-50%, -20%) scale(0.2)', opacity: 0 },
        { transform: 'translate(-50%, 0%) scale(1)', opacity: 1, offset: 0.55, easing: 'ease-in' },
        { transform: `translate(-50%, ${fall.toFixed(1)}px) scale(0.9, 1.15)`, opacity: 1 },
      ],
      { duration: 520 + index * 40, easing: 'ease-out' },
    ).then(() => {
      bead.remove();
      particles.burst({ x: tip.x, y: tip.y + fall + 4, count: 5, colors: VENOM, angle: -Math.PI / 2, spread: 0.9, speed: [40, 90], gravity: 300, drag: 1, life: [260, 420], size: [1.1, 1.8], shape: 'ember' });
    });
  }

  // The Taniec cieni's new look: shadows whirl round the Cień, its figure
  // dims in its card while dark violet copies of it dash from side to side
  // round it, and it comes back in a burst of violet light.
  async function dance(id, color) {
    const entry = cards.get(id);
    const source = entry?.card.querySelector('.unit-art');
    if (!entry || !source || reduced() || !particles) {
      await ghosts(id, color);
      return;
    }
    const box = boxOf(entry.card);
    const art = boxOf(source);
    const width = stageWidth();
    // The whirl: the card's height, as wide as the card at most (round the
    // figure on a computer's wide card), a little more, kept on the stage.
    const across = Math.min(box.width, box.height);
    const from = box.x + (box.width - across) / 2;
    const margin = Math.max(0, Math.min(6, from - 1, width - from - across - 1, box.y - 1));
    const swirl = spark('fx-swirl', { x: from - margin, y: box.y - margin }, { '--fx': color });
    swirl.style.width = `${Math.round(across + margin * 2)}px`;
    swirl.style.height = `${Math.round(box.height + margin * 2)}px`;
    swirl.innerHTML = SWIRL;
    animate(swirl.querySelector('g'), [{ transform: 'rotate(0deg)' }, { transform: 'rotate(300deg)' }], { duration: 1000, easing: 'cubic-bezier(0.3, 0.1, 0.4, 1)' });
    const whirl = animate(
      swirl,
      [
        { transform: 'scale(1.08)', opacity: 0 },
        { transform: 'scale(1)', opacity: 0.95, offset: 0.18 },
        { transform: 'scale(0.96)', opacity: 0.85, offset: 0.7 },
        { transform: 'scale(0.86)', opacity: 0 },
      ],
      { duration: 1000, easing: 'ease-out' },
    ).then(() => swirl.remove());
    particles.burst({ x: box.x + box.width / 2, y: box.y + box.height - 10, area: { width: across * 0.8, height: 8 }, count: 6, colors: SHADE, angle: -Math.PI / 2, spread: 0.7, speed: [10, 40], gravity: -20, drag: 1.5, life: [700, 1100], size: [3, 5], shape: 'dust' });
    // The figure dims in its card while its shadows dance.
    const figure = source.querySelector('img, svg, .unit-icon') ?? source;
    animate(figure, [{ opacity: 1 }, { opacity: 0.2, offset: 0.1 }, { opacity: 0.2, offset: 0.78 }, { opacity: 1 }], { duration: 720 });
    // Where the copies stand round the figure (by its middle), kept on the
    // stage: left, right, up left, up right, and back in the middle.
    const reach = Math.min(figureOf(art) * 0.44, 32);
    const fit = (dx) => Math.min(Math.max(dx, 2 - art.x), width - 2 - art.x - art.width);
    const spots = [
      [-1, 0.06],
      [1, -0.04],
      [-0.75, -0.2],
      [0.8, -0.12],
      [0, 0],
    ].map(([sideways, up]) => ({ x: fit(sideways * reach), y: up * art.height * 0.5 }));
    spots.forEach((at, step) => {
      const last = step === spots.length - 1;
      after(step * 105, swirl, () => {
        const before = spots[step - 1] ?? { x: 0, y: 0 };
        shadowCopy(source, art, at, Math.sign(at.x - before.x) || 1, last);
        if (step > 0) dashLine(art, before.x, at.x, color);
      });
    });
    await wait(spots.length * 105 + 40);
    if (!swirl.isConnected) return;
    // Back in its place, wrapped in violet light.
    particles.burst({ x: art.x + art.width / 2, y: art.y + art.height / 2, area: { width: figureOf(art) * 0.7, height: art.height * 0.6 }, count: 14, colors: SHADE_SPARKS, speed: [60, 150], drag: 3, life: [300, 600], size: [1.2, 2.2], shape: 'spark' });
    animate(entry.card, [{ filter: 'brightness(0.6) saturate(1.4)' }, { filter: 'brightness(1)' }], { duration: 420, easing: 'ease-out' });
    await Promise.all([whirl, aura(id, color, 1)]);
  }

  // A dark violet copy of a card's figure at `at` from it, fading as it
  // drifts back against its dash (the last one comes back into the figure).
  function shadowCopy(source, art, at, way, last) {
    const copy = source.cloneNode(true);
    copy.querySelector('.unit-level')?.remove();
    copy.classList.add('fx-shade', 'fx-shade--dance');
    copy.setAttribute('aria-hidden', 'true');
    copy.style.left = `${art.x + at.x}px`;
    copy.style.top = `${art.y + at.y}px`;
    copy.style.width = `${art.width}px`;
    copy.style.height = `${art.height}px`;
    fx.append(copy);
    const frames = last
      ? [
          { transform: 'scale(1.12)', opacity: 0.85 },
          { transform: 'scale(1)', opacity: 0 },
        ]
      : [
          { transform: `translateX(${-way * 4}px) skewX(${-way * 8}deg)`, opacity: 0.95 },
          { transform: 'translateX(0) skewX(0deg)', opacity: 0.8, offset: 0.25 },
          { transform: `translateX(${-way * 7}px) skewX(0deg)`, opacity: 0 },
        ];
    return animate(copy, frames, { duration: last ? 320 : 420, easing: 'ease-out' }).then(() => copy.remove());
  }

  // A streak of a dash, across a figure's middle.
  function dashLine(box, from, to, color) {
    const line = spark('fx-dashline', { x: box.x + box.width / 2 + (from + to) / 2, y: box.y + box.height * (0.4 + Math.random() * 0.3) }, { '--fx': color });
    line.style.width = `${Math.round(Math.max(24, Math.abs(to - from) + figureOf(box) * 0.6))}px`;
    const way = Math.sign(to - from) || 1;
    return animate(
      line,
      [
        { transform: `translate(-50%, -50%) translateX(${-way * 10}px) scaleX(0.3)`, opacity: 0 },
        { transform: 'translate(-50%, -50%) scaleX(1)', opacity: 0.9, offset: 0.35 },
        { transform: `translate(-50%, -50%) translateX(${way * 12}px) scaleX(0.5)`, opacity: 0 },
      ],
      { duration: 260, easing: 'ease-out' },
    ).then(() => line.remove());
  }

  // ——— 960: the evolved Mag's skills in looks of their own ———

  // The arena trembling (the ground shaking, a heavy landing): the stage
  // shakes a little, a little zoomed so its edges stay covered.
  function shake(power, duration = 320) {
    if (reduced()) return;
    const steps = 8;
    const frames = Array.from({ length: steps + 1 }, (_, index) => {
      if (index === 0 || index === steps) return { transform: 'translate(0px, 0px) scale(1)' };
      const left = 1 - index / steps;
      const x = (index % 2 ? 1 : -1) * power * left;
      const y = ((index % 3) - 1) * power * 0.6 * left;
      return { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(1 + power * 0.004).toFixed(3)})` };
    });
    animate(kit.arena, frames, { duration, composite: 'add' });
  }

  // An empty mark in the effects layer for a look's late steps: they go on
  // while it is there (Pomiń and Powtórz clear the layer).
  function anchor(duration) {
    const mark = spark('fx-anchor', { x: 0, y: 0 });
    wait(duration).then(() => mark.remove());
    return mark;
  }

  // Leaves thrown up out of a point, turning and drifting down, kept on
  // the stage.
  function leaves(point, { count = 8, reach = 40, delay = 0, colors = LEAVES } = {}) {
    const width = stageWidth();
    for (let index = 0; index < count; index++) {
      const share = count > 1 ? index / (count - 1) : 0.5;
      const angle = -Math.PI / 2 + (share - 0.5) * Math.PI * 1.25;
      const far = reach * (0.65 + ((index * 7) % 5) * 0.09);
      const dx = Math.min(Math.max(Math.cos(angle) * far, (8 - point.x) / 1.25), (width - 8 - point.x) / 1.25);
      const dy = Math.max(Math.sin(angle) * far * 0.75, 6 - point.y);
      const drop = 16 + (index % 3) * 8;
      const spin = (index % 2 ? 1 : -1) * (120 + ((index * 53) % 140));
      const leaf = spark('fx-leaf', point);
      leaf.innerHTML = LEAF(colors[index % colors.length]);
      animate(
        leaf,
        [
          { transform: 'translate(-50%, -50%) scale(0.3) rotate(0deg)', opacity: 0 },
          { transform: `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px)) scale(1) rotate(${Math.round(spin * 0.45)}deg)`, opacity: 1, offset: 0.3, easing: 'ease-in-out' },
          { transform: `translate(calc(-50% + ${(dx * 1.25).toFixed(1)}px), calc(-50% + ${(dy + drop).toFixed(1)}px)) scale(0.9) rotate(${spin}deg)`, opacity: 0 },
        ],
        { duration: 950 + (index % 3) * 110, delay: delay + index * 16, easing: 'ease-out', fill: 'backwards' },
      ).then(() => leaf.remove());
    }
  }

  // Motes of light drawn into a point from a ring round it.
  function gatherTo(point, radius, colors, { count = 12, life = 320 } = {}) {
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2 + Math.random() * 0.4;
      particles.burst({ x: point.x + Math.cos(angle) * radius, y: point.y + Math.sin(angle) * radius, count: 1, colors: [colors[index % colors.length]], angle: angle + Math.PI, spread: 0, speed: [(radius / life) * 950, (radius / life) * 1000], life: [life, life], size: [1.3, 2.3], shape: 'mote', drag: 0 });
    }
  }

  // The card of the creature a summon calls (arena.js gives it a card of
  // its own before its summoner), by its summoner and its skill.
  function summonedCard(event) {
    for (const entry of cards.values()) {
      if (entry.unit.summon === event.skill && entry.unit.id.startsWith(`${event.target}~`)) return entry;
    }
    return null;
  }

  // How each creature comes: the circle's colour (a druid's, or an
  // arcanist's runes), the summoner's magic and the creature's own colour.
  const ARRIVALS = {
    oak: { circle: '#9fd36b', motes: LIFE, own: '#7fb069' },
    ent: { circle: '#9fd36b', motes: LIFE, own: '#7fb069' },
    bear: { circle: '#9fd36b', motes: LIFE, own: '#c8a070' },
    aurochs: { circle: '#9fd36b', motes: LIFE, own: '#c8a26a' },
    elemental: { circle: '#8fd3ff', motes: MANA, own: '#ffb36b', arcane: true },
  };
  // When the creature starts to come, after the circle opened.
  const COMING = 380;

  // 960: a summoning (Przebudzenie dębu, Przywołanie żubra, żywiołaka, enta
  // and niedźwiedzia). A circle opens on the ground where the creature will
  // stand and the summoner's magic flows into it; then the creature's card
  // comes its own way, with a burst in its style: an oak rises out of the
  // trembling ground, an ent grows up out of it, a bear bursts out of a
  // thicket with a roar, an aurochs charges in, an elemental takes shape in
  // a whirl of mana and flame. (Its card's own coming in arena.js plays
  // under this one, which hides it until its time.)
  async function summonCreature(event, look) {
    const owner = cards.get(event.actor);
    const entry = summonedCard(event);
    if (!owner || !entry || reduced() || !particles) {
      await Promise.all([ring(event.actor, look.color, 130, 760), aura(event.actor, look.color, 2)]);
      return;
    }
    const style = ARRIVALS[look.arrival];
    const box = boxOf(entry.card);
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const width = stageWidth();
    const x = box.x + box.width / 2;
    const ground = box.y + box.height - 8;
    const size = Math.round(Math.min(box.width * 0.96, figure * 1.45, (Math.min(x, width - x) - 2) * 2));
    // The circle, under the card's foot.
    const circle = spark('fx-circle', { x, y: ground }, { '--fx': style.circle, '--size': `${size}px` });
    circle.innerHTML = style.arcane ? ARCANE_CIRCLE : DRUID_CIRCLE;
    const flat = 'translate(-50%, -50%) scale(1, 0.38)';
    animate(
      circle,
      [
        { transform: `${flat} rotate(-60deg) scale(0.2)`, opacity: 0 },
        { transform: `${flat} rotate(0deg) scale(1)`, opacity: 1, offset: 0.24 },
        { transform: `${flat} rotate(45deg) scale(1)`, opacity: 1, offset: 0.68 },
        { transform: `${flat} rotate(64deg) scale(1.12)`, opacity: 0 },
      ],
      { duration: 1500 },
    ).then(() => circle.remove());
    // The summoner's magic flowing into it.
    const from = centerOf(owner.card);
    const distance = Math.hypot(x - from.x, ground - from.y);
    const toward = Math.atan2(ground - from.y, x - from.x);
    for (let wave = 0; wave < 3; wave++) {
      after(wave * 70, circle, () => particles.burst({ x: from.x, y: from.y, area: { width: 10, height: 10 }, count: 6, colors: style.motes, angle: toward, spread: 0.1, speed: [distance * 2.9, distance * 3.1], life: [320, 330], size: [1.4, 2.4], shape: 'mote', drag: 0 }));
    }
    after(160, circle, () => particles.burst({ x, y: ground, area: { width: size * 0.8, height: size * 0.18 }, count: 8, colors: style.motes, angle: -Math.PI / 2, spread: 0.3, speed: [30, 70], rise: 10, gravity: -40, drag: 1, life: [500, 800], size: [1, 1.8], shape: 'mote' }));
    const scene = { entry, card: entry.card, box, art, figure, x, ground, circle, width };
    if (look.arrival === 'oak') riseOak(scene);
    else if (look.arrival === 'ent') growEnt(scene);
    else if (look.arrival === 'bear') bearOut(scene);
    else if (look.arrival === 'aurochs') chargeIn(scene);
    else formElemental(scene);
    await wait(1250);
  }

  // An oak rising out of the trembling ground: the ground cracks, stones
  // and dust fly, the card comes up from under its foot (what is still
  // under the ground unseen) and its crown shakes out leaves.
  function riseOak({ entry, card, box, art, figure, x, ground, circle }) {
    after(COMING - 220, circle, () => shake(2.4, 560));
    const cracks = spark('fx-cracks', { x, y: ground + 2 }, { '--fx': '#8bbf4a' });
    cracks.style.width = `${Math.round(Math.min(box.width * 1.05, figure * 1.7))}px`;
    cracks.style.color = '#d8c39a';
    cracks.innerHTML = CRACKS;
    animate(
      cracks,
      [
        { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.25 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.7 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
      ],
      { duration: 1150, delay: COMING - 140, easing: 'ease-out', fill: 'backwards' },
    ).then(() => cracks.remove());
    const depth = box.height + 4;
    animate(
      card,
      [
        { transform: `translateY(${depth}px)`, clipPath: `inset(0px -14px ${depth}px -14px)`, easing: 'cubic-bezier(0.2, 0.75, 0.35, 1)' },
        { transform: 'translateY(-5px)', clipPath: 'inset(-14px -14px -5px -14px)', offset: 0.78, easing: 'ease-in-out' },
        { transform: 'translateY(0px)', clipPath: 'inset(-14px -14px 0px -14px)' },
      ],
      { duration: 600, delay: COMING, fill: 'backwards' },
    );
    for (const [delay, count] of [
      [COMING, 8],
      [COMING + 160, 6],
      [COMING + 320, 4],
    ]) {
      after(delay, circle, () => {
        particles.burst({ x, y: ground, area: { width: box.width * 0.7, height: 4 }, count, colors: STONE, angle: -Math.PI / 2, spread: 0.9, speed: [90, 220], life: [380, 700], size: [1.6, 3], shape: 'shard', gravity: 520, drag: 1.2 });
        particles.burst({ x, y: ground, area: { width: box.width * 0.8, height: 6 }, count: Math.ceil(count / 2), colors: DUST, speed: [20, 70], life: [600, 950], size: [4, 8], shape: 'dust', gravity: -20, drag: 2 });
      });
    }
    after(COMING + 470, circle, () => {
      leaves({ x, y: art.y + art.height * 0.3 }, { count: 9, reach: figure * 0.75 });
      groundRing(entry.unit.id, '#9fd36b');
      aura(entry.unit.id, '#7fb069', 1);
    });
  }

  // An ent growing up out of the ground from a sprout, green light rising
  // round it and leaves sprouting on its crown.
  function growEnt({ entry, card, box, art, figure, x, ground, circle }) {
    const lift = (scale) => `translate(0px, ${((1 - scale) * box.height * 0.5).toFixed(1)}px)`;
    animate(
      card,
      [
        { transform: `${lift(0.06)} scale(0.3, 0.06)`, opacity: 0, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' },
        { transform: `${lift(0.62)} scale(0.78, 0.62)`, opacity: 1, offset: 0.4 },
        { transform: `${lift(1.08)} scale(1.04, 1.08)`, opacity: 1, offset: 0.78, easing: 'ease-in-out' },
        { transform: `${lift(1)} scale(1, 1)`, opacity: 1 },
      ],
      { duration: 640, delay: COMING, fill: 'backwards' },
    );
    for (let wave = 0; wave < 4; wave++) {
      after(COMING + wave * 120, circle, () => particles.burst({ x, y: ground, area: { width: box.width * 0.6, height: 6 }, count: 5, colors: LIFE, angle: -Math.PI / 2, spread: 0.35, speed: [50, 110], gravity: -20, drag: 1, life: [600, 900], size: [1.2, 2.2], shape: 'mote' }));
    }
    after(COMING + 470, circle, () => {
      leaves({ x, y: art.y + art.height * 0.25 }, { count: 7, reach: figure * 0.6 });
      groundRing(entry.unit.id, '#9fd36b');
      aura(entry.unit.id, '#7fb069', 1);
    });
  }

  // A bear bursting out of a thicket: leaves and twigs thrown about, the
  // card stepping out, and its roar rolling out over the arena.
  function bearOut({ entry, card, art, figure, x, circle, width }) {
    const middle = { x, y: art.y + art.height * 0.6 };
    after(COMING - 40, circle, () => {
      leaves(middle, { count: 11, reach: figure * 0.8, colors: THICKET });
      particles.burst({ x: middle.x, y: middle.y, area: { width: figure * 0.6, height: figure * 0.4 }, count: 10, colors: TWIGS, speed: [80, 200], life: [380, 650], size: [1.4, 2.6], shape: 'shard', gravity: 300, drag: 1.5 });
    });
    animate(
      card,
      [
        { transform: 'translateY(10px) scale(0.86)', opacity: 0, easing: 'cubic-bezier(0.25, 0.8, 0.35, 1)' },
        { transform: 'translateY(-4px) scale(1.05)', opacity: 1, offset: 0.55, easing: 'ease-in-out' },
        { transform: 'translateY(0px) scale(1)', opacity: 1 },
      ],
      { duration: 420, delay: COMING, fill: 'backwards' },
    );
    // Its roar: waves of sound rolling up from its head toward the foes.
    const head = { x, y: art.y + art.height * 0.32 };
    const across = Math.round(Math.min(figure * 1.4, (Math.min(head.x, width - head.x) - 3) * 2));
    for (let index = 0; index < 3; index++) {
      const wave = spark('fx-roar', head, { '--fx': '#f1e6cc', '--size': `${across}px` });
      wave.innerHTML = ROAR;
      animate(
        wave,
        [
          { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(0.7)', opacity: 1, offset: 0.3 },
          { transform: 'translate(-50%, -50%) scale(1.15)', opacity: 0 },
        ],
        { duration: 480, delay: COMING + 300 + index * 110, easing: 'ease-out', fill: 'backwards' },
      ).then(() => wave.remove());
    }
    after(COMING + 300, circle, () => {
      shake(2.2, 300);
      groundRing(entry.unit.id, '#c8a070');
      aura(entry.unit.id, '#a0784f', 1);
    });
  }

  // An aurochs charging in from the arena's edge, dust under its hooves,
  // and stopping dead with a thud.
  function chargeIn({ entry, card, box, x, ground, circle }) {
    const from = -(box.x + box.width + 6);
    const run = 560;
    animate(
      card,
      [
        { transform: `translateX(${from}px) skewX(-9deg)`, easing: 'cubic-bezier(0.35, 0.1, 0.55, 1)' },
        { transform: 'translateX(9px) skewX(-5deg)', offset: 0.74, easing: 'cubic-bezier(0.2, 0.8, 0.4, 1)' },
        { transform: 'translateX(-2px) skewX(2deg)', offset: 0.88, easing: 'ease-in-out' },
        { transform: 'translateX(0px) skewX(0deg)' },
      ],
      { duration: run, delay: COMING, fill: 'backwards' },
    );
    // Dust kicked up behind it as it runs.
    for (let step = 0; step < 6; step++) {
      const at = x + from * (1 - (step + 1) / 6.5) - box.width * 0.3;
      if (at < 6) continue;
      after(COMING + step * 70, circle, () => particles.burst({ x: at, y: ground + 2, area: { width: 24, height: 5 }, count: 2, colors: DUST, angle: -Math.PI * 0.8, spread: 0.5, speed: [20, 50], life: [450, 700], size: [2.5, 4.5], shape: 'dust', gravity: -10, drag: 2 }));
    }
    after(COMING + run * 0.74, circle, () => {
      particles.burst({ x, y: ground, area: { width: box.width * 0.9, height: 6 }, count: 9, colors: DUST, speed: [30, 100], life: [600, 950], size: [3.5, 6.5], shape: 'dust', gravity: -20, drag: 2 });
      particles.burst({ x: x + box.width * 0.3, y: ground, count: 6, colors: STONE, angle: -Math.PI * 0.35, spread: 0.6, speed: [100, 220], life: [350, 600], size: [1.4, 2.6], shape: 'shard', gravity: 520, drag: 1.2 });
      shake(4, 340);
      groundRing(entry.unit.id, '#c8a26a');
      aura(entry.unit.id, '#8a6a45', 1);
    });
  }

  // An elemental taking shape in a whirl of mana and flame: the whirl spins
  // up where it will stand, the card comes out of it in a flare, and
  // flames and sparks of mana burst round it.
  function formElemental({ entry, card, box, art, figure, x, circle, width }) {
    const middle = { x, y: art.y + art.height * 0.5 };
    const across = Math.round(Math.min(figure * 1.35, box.width, (Math.min(x, width - x) - 2) * 2));
    const vortex = spark('fx-vortex', middle, { '--fx': '#8fd3ff', '--size': `${across}px` });
    vortex.innerHTML = VORTEX;
    animate(vortex.querySelector('g'), [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-560deg)' }], { duration: 1100, delay: 60, easing: 'cubic-bezier(0.3, 0.1, 0.5, 1)', fill: 'backwards' });
    animate(
      vortex,
      [
        { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.95, offset: 0.3 },
        { transform: 'translate(-50%, -50%) scale(1.05)', opacity: 0.8, offset: 0.6 },
        { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0 },
      ],
      { duration: 1100, delay: 60, easing: 'ease-out', fill: 'backwards' },
    ).then(() => vortex.remove());
    after(COMING - 160, circle, () => gatherTo(middle, across * 0.62, [...MANA, '#ffb36b'], { count: 14, life: 300 }));
    animate(
      card,
      [
        { transform: 'scale(0.2) rotate(-35deg)', opacity: 0, filter: 'brightness(3) saturate(0.3)', easing: 'cubic-bezier(0.25, 0.8, 0.35, 1)' },
        { transform: 'scale(1.08) rotate(4deg)', opacity: 1, filter: 'brightness(1.8) saturate(0.8)', offset: 0.6 },
        { transform: 'scale(1) rotate(0deg)', opacity: 1, filter: 'brightness(1) saturate(1)' },
      ],
      { duration: 480, delay: COMING + 60, fill: 'backwards' },
    );
    after(COMING + 300, circle, () => {
      particles.burst({ x: middle.x, y: middle.y, count: 16, colors: FIRE, angle: -Math.PI / 2, spread: Math.PI, speed: [80, 200], life: [380, 700], size: [1.4, 2.8], shape: 'ember', gravity: -60, drag: 2 });
      particles.burst({ x: middle.x, y: middle.y, count: 10, colors: MANA, speed: [120, 260], life: [200, 380], size: [1.1, 2], shape: 'spark', drag: 3.5 });
      ring(entry.unit.id, '#ffb36b', Math.round(figure * 1.3), 520);
      aura(entry.unit.id, '#ffb36b', 1);
    });
  }

  // 960: the Deszcz meteorów and the Kataklizm. The sky over the foes
  // darkens red and burning boulders fall on each foe and burst; in the
  // Kataklizm a bolt of lightning and a comet of ice fall with each, and
  // the ground under the foes burns, freezes and crackles. Resolves when
  // the last has landed.
  async function meteors(event, look, targets) {
    if (reduced() || !particles) {
      await rain(look.color, targets);
      return;
    }
    const cataclysm = look.meteors === 'cataclysm';
    const foes = row('enemy');
    const reach = foes ? boxOf(foes) : null;
    const sky = spark(`fx-sky${cataclysm ? ' fx-sky--storm' : ''}`, { x: 0, y: 0 });
    sky.style.width = `${stageWidth()}px`;
    sky.style.height = `${Math.round(reach ? reach.y + Math.min(reach.height * 0.5, 140) : stageHeight() * 0.3)}px`;
    animate(sky, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0.85, offset: 0.7 }, { opacity: 0 }], { duration: cataclysm ? 1800 : 1500, easing: 'ease-out' }).then(() => sky.remove());
    const kinds = cataclysm ? ['bolt', 'fire', 'ice'] : ['fire', 'fire'];
    const landings = targets.flatMap((id, index) => {
      const entry = cards.get(id);
      if (!entry) return [];
      const art = artOf(entry.card);
      const figure = figureOf(art);
      const middle = { x: art.x + art.width / 2, y: art.y + art.height * 0.55 };
      return kinds.map((kind, step) => {
        const spot = step === 0 || kind === 'bolt' ? middle : { x: middle.x + (step % 2 ? -1 : 1) * figure * 0.2, y: middle.y + figure * 0.1 };
        const delay = 200 + index * 120 + step * (cataclysm ? 150 : 210);
        return skyfall(id, spot, kind, figure, delay, sky, index === 0 && step === 0).then(() => {
          if (step === kinds.length - 1 && sky.isConnected) burning(id, figure, cataclysm, sky);
        });
      });
    });
    await Promise.all(landings);
  }

  // One thing falling out of the sky onto a point of a foe's card and
  // bursting there: a burning boulder ('fire'), a comet of ice ('ice') or
  // a bolt of lightning ('bolt'). The boulders come from above the stage.
  function skyfall(id, point, kind, figure, delay, mark, first) {
    if (kind === 'bolt') return after(delay, mark, () => thunderbolt(id, point, figure, first));
    const ice = kind === 'ice';
    const size = Math.round(figure * (ice ? 0.24 : 0.3));
    const rock = spark(`fx-meteor${ice ? ' fx-meteor--ice' : ''}`, { x: 0, y: 0 }, { '--size': `${size}px` });
    const run = Math.min(80, figure) * (ice ? -0.7 : 1);
    const start = { x: point.x - run, y: -size * 1.6 };
    const angle = Math.atan2(point.y - start.y, point.x - start.x);
    const flight = 300;
    const place = (at, scale) => `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px) translate(-50%, -50%) rotate(${angle.toFixed(3)}rad) scale(${scale})`;
    after(delay, mark, () => particles.trail({ from: start, to: point, duration: flight, colors: ice ? ICE : FIRE, rate: 150, sizes: [1.4, 3], life: [200, 420], shape: ice ? 'mote' : 'ember' }));
    return animate(
      rock,
      [
        { transform: place(start, 0.85), opacity: 1 },
        { transform: place(point, 1), opacity: 1 },
      ],
      { duration: flight, delay, easing: 'cubic-bezier(0.55, 0, 0.9, 0.55)', fill: 'backwards' },
    ).then(() => {
      rock.remove();
      if (!mark.isConnected) return;
      if (ice) iceImpact(id, point, figure);
      else fireImpact(id, point, figure, first);
    });
  }

  // A burning boulder bursting on a foe: a bloom of fire, embers, sparks
  // and smoke, the card scorched and the arena shaken (the first one
  // lights the arena up).
  function fireImpact(id, point, figure, first) {
    const entry = cards.get(id);
    const size = Math.round(figure * 1.05);
    const bloom = spark('fx-explosion', point, { '--size': `${size}px` });
    animate(
      bloom,
      [
        { transform: 'translate(-50%, -50%) scale(0.15)', opacity: 1 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.95, offset: 0.35 },
        { transform: 'translate(-50%, -50%) scale(1.25)', opacity: 0 },
      ],
      { duration: 520, easing: 'ease-out' },
    ).then(() => bloom.remove());
    particles.burst({ x: point.x, y: point.y, count: 14, colors: FIRE, angle: -Math.PI / 2, spread: Math.PI * 0.85, speed: [110, 260], life: [380, 760], size: [1.4, 3], shape: 'ember', gravity: 200, drag: 2.2 });
    particles.burst({ x: point.x, y: point.y, count: 8, colors: ['#fff7d6', '#ffd27a'], speed: [200, 380], life: [140, 280], size: [1.2, 2], shape: 'spark', drag: 4 });
    particles.burst({ x: point.x, y: point.y, count: 4, colors: SMOKE, speed: [14, 50], life: [700, 1100], size: [5, 9], shape: 'dust', gravity: -40, drag: 1.6, area: { width: size * 0.4, height: size * 0.3 } });
    if (entry) animate(entry.card, [{ filter: 'brightness(1.8) sepia(0.5) saturate(2)' }, { filter: 'brightness(1)' }], { duration: 560, easing: 'ease-out' });
    if (first) flash('#ff9a4d', 0.18, 380);
    shake(first ? 3.2 : 2.2, 280);
  }

  // A comet of ice shattering on a foe: shards, a cold flare and frost
  // settling on it.
  function iceImpact(id, point, figure) {
    const glow = spark('fx-burst', point, { '--fx': '#bfe8ff', '--size': `${Math.round(figure * 0.85)}px` });
    animate(
      glow,
      [
        { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.05)', opacity: 1, offset: 0.25 },
        { transform: 'translate(-50%, -50%) scale(1.3)', opacity: 0 },
      ],
      { duration: 440, easing: 'ease-out' },
    ).then(() => glow.remove());
    particles.burst({ x: point.x, y: point.y, count: 12, colors: ICE, speed: [120, 260], life: [300, 600], size: [1.6, 3], shape: 'shard', gravity: 240, drag: 2.2 });
    freeze(id);
    shake(1.6, 220);
  }

  // A bolt of lightning from the top of the stage down to a point of a
  // foe's card, flickering; the first lights the whole arena.
  function thunderbolt(id, point, figure, first) {
    const entry = cards.get(id);
    const height = Math.max(24, Math.round(point.y));
    const width = Math.round(figure * 0.9);
    let x = width / 2 + (Math.random() - 0.5) * width * 0.3;
    let d = `M${x.toFixed(1)} 0`;
    for (let step = 1; step <= 7; step++) {
      x = step === 7 ? width / 2 : width / 2 + (Math.random() - 0.5) * width * 0.6;
      d += `L${x.toFixed(1)} ${((step / 7) * height).toFixed(1)}`;
    }
    const bolt = spark('fx-strike', { x: point.x - width / 2, y: 0 });
    bolt.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><path class="fx-strike-glow" d="${d}"/><path class="fx-strike-core" d="${d}"/></svg>`;
    animate(bolt, [{ opacity: 0 }, { opacity: 1, offset: 0.06 }, { opacity: 0.25, offset: 0.18 }, { opacity: 1, offset: 0.28 }, { opacity: 0.85, offset: 0.55 }, { opacity: 0 }], { duration: 460 }).then(() => bolt.remove());
    const glow = spark('fx-burst', point, { '--fx': '#fff7c2', '--size': `${Math.round(figure * 0.8)}px` });
    animate(
      glow,
      [
        { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, -50%) scale(1.2)', opacity: 0 },
      ],
      { duration: 360, easing: 'ease-out' },
    ).then(() => glow.remove());
    particles.burst({ x: point.x, y: point.y, count: 12, colors: BOLT, speed: [150, 320], life: [200, 380], size: [1, 1.8], shape: 'spark', drag: 4 });
    if (entry) animate(entry.card, [{ filter: 'brightness(2.4) saturate(0.4)' }, { filter: 'brightness(1)' }], { duration: 380, easing: 'ease-out' });
    if (first) flash('#fff7c2', 0.24, 320);
    shake(2.4, 240);
  }

  // The ground under a foe after the fall: flames licking it (frost and
  // sparks too, after the Kataklizm).
  function burning(id, figure, cataclysm, mark) {
    const entry = cards.get(id);
    if (!entry) return;
    const box = boxOf(entry.card);
    const foot = { x: box.x + box.width / 2, y: box.y + box.height - 12 };
    const span = Math.min(box.width * 0.8, figure * 1.2);
    for (let wave = 0; wave < 3; wave++) {
      after(wave * 140, mark, () => particles.burst({ x: foot.x, y: foot.y, area: { width: span, height: 6 }, count: 5, colors: FIRE, angle: -Math.PI / 2, spread: 0.3, speed: [30, 80], gravity: -30, drag: 1.2, life: [400, 700], size: [1.4, 2.6], shape: 'ember' }));
    }
    if (!cataclysm) return;
    [-0.3, 0.3].forEach((share, index) => {
      const crystal = spark('fx-crystal', { x: foot.x + share * span, y: foot.y - 2 });
      animate(
        crystal,
        [
          { transform: 'translate(-50%, -50%) scale(0) rotate(0deg)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(1.1) rotate(30deg)', opacity: 1, offset: 0.3 },
          { transform: 'translate(-50%, -50%) scale(0.9) rotate(50deg)', opacity: 0 },
        ],
        { duration: 820, delay: index * 90, easing: 'ease-out', fill: 'backwards' },
      ).then(() => crystal.remove());
    });
    for (let wave = 0; wave < 2; wave++) {
      after(120 + wave * 200, mark, () => particles.burst({ x: foot.x, y: foot.y, area: { width: span, height: 4 }, count: 5, colors: BOLT, angle: -Math.PI / 2, spread: 1.2, speed: [80, 180], life: [140, 260], size: [0.9, 1.6], shape: 'spark', drag: 4 }));
    }
  }

  // 960: the Zamieć: the Władca Lodu sends the cold out, and a snowstorm
  // sweeps over the whole enemy row: snow driving across it in gusts, the
  // row going white, and ice crusting at each foe's feet as the frost takes
  // it. Resolves when the last foe is frozen over.
  async function snowstorm(event, color, targets) {
    const caster = cards.get(event.actor);
    const foes = row('enemy');
    if (!caster || !foes || reduced() || !particles) {
      await blizzard(event, color, targets);
      return;
    }
    const box = boxOf(foes);
    const from = centerOf(caster.card);
    const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    // The storm blows from the caster's side across the row.
    const way = from.x >= middle.x ? -1 : 1;
    const distance = Math.hypot(middle.x - from.x, middle.y - from.y);
    particles.burst({ x: from.x, y: from.y, area: { width: 14, height: 14 }, count: 16, colors: ICE, angle: Math.atan2(middle.y - from.y, middle.x - from.x), spread: 0.2, speed: [distance * 2.4, distance * 3], life: [300, 380], size: [1.4, 2.6], shape: 'mote', drag: 0.4 });
    const clip = overRow();
    const veil = h('span', { class: 'fx-whiteout' });
    clip.append(veil);
    const enter = way < 0 ? '60%' : '-60%';
    const leave = way < 0 ? '-40%' : '40%';
    animate(
      veil,
      [
        { transform: `translateX(${enter})`, opacity: 0 },
        { transform: 'translateX(0%)', opacity: 0.85, offset: 0.3 },
        { transform: 'translateX(0%)', opacity: 0.7, offset: 0.7 },
        { transform: `translateX(${leave})`, opacity: 0 },
      ],
      { duration: 1400, delay: 120, easing: 'ease-in-out', fill: 'backwards' },
    ).then(() => clip.remove());
    // Snow driving across the row in gusts, from its edge.
    const edge = way < 0 ? box.x + box.width - 2 : box.x + 2;
    for (let gust = 0; gust < 5; gust++) {
      after(120 + gust * 150, clip, () => particles.burst({ x: edge, y: middle.y, area: { width: 12, height: box.height * 0.92 }, count: 22, colors: ICE, angle: way < 0 ? Math.PI - 0.1 : 0.1, spread: 0.14, speed: [box.width * 1.1, box.width * 1.7], life: [600, 900], size: [1.2, 2.6], shape: 'mote', drag: 0.25 }));
    }
    after(160, clip, () => windLines());
    // The frost takes each foe, ice crusting at its feet.
    await wait(420);
    if (!clip.isConnected) return;
    await Promise.all(
      targets.map((id, index) =>
        after(index * 90, clip, () => {
          freeze(id);
          iceCrust(id);
        }),
      ),
    );
    await wait(380);
  }

  // Ice crusting at a foe's feet: shards growing up round the bottom of its
  // figure, melting a moment later.
  function iceCrust(id) {
    const entry = cards.get(id);
    if (!entry) return;
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const x = art.x + art.width / 2;
    const bottom = art.y + art.height;
    [-0.42, -0.2, 0.02, 0.24, 0.44].forEach((share, index) => {
      const shard = spark('fx-spike', { x: x + share * figure, y: bottom });
      shard.style.height = `${Math.round(figure * (0.22 + (index % 2) * 0.12))}px`;
      animate(
        shard,
        [
          { transform: `translate(-50%, -100%) rotate(${(share * 30).toFixed(1)}deg) scaleY(0)`, opacity: 1 },
          { transform: `translate(-50%, -100%) rotate(${(share * 30).toFixed(1)}deg) scaleY(1)`, opacity: 1, offset: 0.3 },
          { transform: `translate(-50%, -100%) rotate(${(share * 30).toFixed(1)}deg) scaleY(1)`, opacity: 0.9, offset: 0.75 },
          { transform: `translate(-50%, -100%) rotate(${(share * 30).toFixed(1)}deg) scaleY(0.9)`, opacity: 0 },
        ],
        { duration: 1000, delay: index * 30, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'backwards' },
      ).then(() => shard.remove());
    });
  }

  // 960: the Lodowa nawałnica. Stars of ice fall on the foes one after
  // another, spinning, and break; frost settles on each foe as its last
  // star lands. Resolves when the last has broken.
  async function icefall(event, color, targets) {
    if (reduced() || !particles) {
      await blizzard(event, color, targets);
      return;
    }
    // A cold haze over the foes, the sky they fall from.
    const foes = row('enemy');
    const reach = foes ? boxOf(foes) : null;
    const mark = spark('fx-sky fx-sky--frost', { x: 0, y: 0 });
    mark.style.width = `${stageWidth()}px`;
    mark.style.height = `${Math.round(reach ? reach.y + Math.min(reach.height * 0.5, 140) : stageHeight() * 0.3)}px`;
    animate(mark, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0.8, offset: 0.75 }, { opacity: 0 }], { duration: 1600 + targets.length * 110, easing: 'ease-out' }).then(() => mark.remove());
    const landings = targets.flatMap((id, index) => {
      const entry = cards.get(id);
      if (!entry) return [];
      const art = artOf(entry.card);
      const figure = figureOf(art);
      const middle = { x: art.x + art.width / 2, y: art.y + art.height * 0.5 };
      return [-0.22, 0.2, 0].map((dx, step) => {
        const spot = { x: middle.x + dx * figure, y: middle.y + (step === 2 ? 0.06 : -0.06) * figure };
        return starfall(id, spot, figure, 140 + index * 110 + step * 190, mark, step === 2);
      });
    });
    await Promise.all(landings);
  }

  // One star of ice falling and breaking where it lands.
  function starfall(id, point, figure, delay, mark, last) {
    const size = Math.round(figure * (last ? 0.46 : 0.34));
    const star = spark('fx-icestar', { x: 0, y: 0 }, { '--size': `${size}px` });
    star.innerHTML = ICE_STAR;
    const start = { x: point.x + figure * 0.35, y: -size };
    const flight = 280;
    const place = (at, turn, scale) => `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px) translate(-50%, -50%) rotate(${turn}deg) scale(${scale})`;
    after(delay, mark, () => particles.trail({ from: start, to: point, duration: flight, colors: ICE, rate: 110, sizes: [1, 2.2], life: [200, 380], shape: 'mote' }));
    return animate(
      star,
      [
        { transform: place(start, 0, 0.8), opacity: 1 },
        { transform: place(point, 300, 1), opacity: 1 },
      ],
      { duration: flight, delay, easing: 'cubic-bezier(0.5, 0, 0.85, 0.6)', fill: 'backwards' },
    ).then(() => {
      star.remove();
      if (!mark.isConnected) return;
      breakStar(point, size, 300);
      particles.burst({ x: point.x, y: point.y, count: last ? 12 : 7, colors: ICE, speed: [100, 230], life: [260, 520], size: [1.4, 2.6], shape: 'shard', gravity: 220, drag: 2.4 });
      if (last) {
        freeze(id);
        shake(1.6, 220);
      }
    });
  }

  // A star of ice breaking: its six long arms fly apart, turning, and a
  // cold flare where it was.
  function breakStar(point, size, turn = 0) {
    const glow = spark('fx-burst', point, { '--fx': '#bfe8ff', '--size': `${Math.round(size * 1.6)}px` });
    animate(
      glow,
      [
        { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.25 },
        { transform: 'translate(-50%, -50%) scale(1.25)', opacity: 0 },
      ],
      { duration: 380, easing: 'ease-out' },
    ).then(() => glow.remove());
    const length = size * 0.47;
    for (let index = 0; index < 6; index++) {
      const angle = turn + index * 60;
      const way = ((angle - 90) * Math.PI) / 180;
      const piece = spark('fx-iceshard', point, { '--size': `${Math.round(length)}px` });
      piece.innerHTML = ICE_SHARD;
      const far = size * 0.55;
      const spin = (index % 2 ? 1 : -1) * 70;
      animate(
        piece,
        [
          { transform: `translate(-50%, -100%) rotate(${angle}deg)`, opacity: 1 },
          { transform: `translate(calc(-50% + ${(Math.cos(way) * far).toFixed(1)}px), calc(-100% + ${(Math.sin(way) * far + size * 0.25).toFixed(1)}px)) rotate(${angle + spin}deg) scale(0.7)`, opacity: 0 },
        ],
        { duration: 420, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' },
      ).then(() => piece.remove());
    }
  }

  // 960: ice gathering at the caster before it flies: a star of ice
  // (Lodowa gwiazda) or a lance of ice aimed at its target (Lodowa
  // włócznia), formed as the caster draws back (arena-fx.js strike()
  // flies it from there).
  function forge(event, kind) {
    const caster = cards.get(event.actor);
    const target = cards.get(event.target);
    if (!caster || !target || reduced() || !particles) return;
    const a = centerOf(caster.card);
    const b = centerOf(target.card);
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    gatherTo(a, Math.min(caster.card.offsetWidth, caster.card.offsetHeight) * 0.55, ICE, { count: 10, life: 220 });
    if (kind === 'ice-star') {
      const size = Math.round(Math.min(40, Math.max(24, distance * 0.14)));
      // Formed while the caster draws back (200 ms, arena-fx.js strike()),
      // and held until the star that flies takes its place (iceStar()).
      const star = spark('fx-icestar fx-forged', a, { '--size': `${size}px` });
      star.innerHTML = ICE_STAR;
      animate(
        star,
        [
          { transform: 'translate(-50%, -50%) scale(0) rotate(-140deg)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(0.8) rotate(0deg)', opacity: 1 },
        ],
        { duration: 200, easing: 'ease-out', fill: 'forwards' },
      );
      wait(600).then(() => star.remove());
      return;
    }
    const length = Math.round(Math.min(110, Math.max(60, distance * 0.42)));
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    // As the star: held until the lance that flies takes its place.
    const lance = spark('fx-lance fx-forged', { x: 0, y: 0 });
    lance.innerHTML = ICE_LANCE;
    lance.style.width = `${length}px`;
    const held = `translate(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px) rotate(${angle.toFixed(3)}rad) translate(0, -50%)`;
    animate(
      lance,
      [
        { transform: `${held} scaleX(0.05)`, opacity: 0 },
        { transform: `${held} scaleX(1)`, opacity: 1 },
      ],
      { duration: 200, easing: 'ease-out', fill: 'forwards' },
    );
    wait(600).then(() => lance.remove());
  }

  // 960: the Lodowa gwiazda bursting on its foe: the star breaks into its
  // arms, the foe cracks like glass and frost settles on it.
  function starBreak(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 90);
      ring(event.target, color, 110, 420);
      return;
    }
    const point = centerOf(entry.card);
    const art = artOf(entry.card);
    const figure = figureOf(art);
    breakStar(point, Math.round(figure * 0.55), 20);
    particles.burst({ x: point.x, y: point.y, count: 16, colors: ICE, speed: [130, 280], life: [300, 620], size: [1.6, 3], shape: 'shard', gravity: 220, drag: 2.2 });
    glassCracks(entry, art, figure);
    freeze(event.target);
    ring(event.target, '#dff4ff', Math.round(figure * 1.4), 420);
  }

  // Cracks over a foe's picture, as in glass, gone in a moment.
  function glassCracks(entry, art, figure, cracks = GLASS_CRACKS, delay = 0, duration = 700) {
    const size = Math.round(Math.min(art.width, figure * 1.25));
    const mark = spark('fx-glasscrack', { x: art.x + art.width / 2, y: art.y + art.height / 2 }, { '--size': `${size}px` });
    mark.style.height = `${Math.round(Math.min(art.height, size))}px`;
    mark.innerHTML = cracks;
    return animate(
      mark,
      [
        { transform: 'translate(-50%, -50%) scale(0.5)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.12 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.9, offset: 0.6 },
        { transform: 'translate(-50%, -50%) scale(1.02)', opacity: 0 },
      ],
      { duration, delay, easing: 'ease-out', fill: 'backwards' },
    ).then(() => mark.remove());
  }

  // 960: the Lodowa włócznia striking: it runs through its foe (a bright
  // line along the throw), breaks into shards thrown on and frost settles
  // on the foe.
  function lanceBreak(event, color) {
    const target = cards.get(event.target);
    const caster = cards.get(event.actor);
    if (!target || !caster) return;
    if (reduced() || !particles) {
      burst(event.target, color, 90);
      ring(event.target, color, 110, 420);
      return;
    }
    const to = centerOf(target.card);
    const from = centerOf(caster.card);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const length = Math.hypot(target.card.offsetWidth, target.card.offsetHeight) * 1.2;
    const line = spark('fx-pierce', to, { '--fx': '#bfe8ff' });
    line.style.width = `${Math.round(length)}px`;
    animate(
      line,
      [
        { transform: `translate(-50%, -50%) rotate(${angle}rad) scaleX(0)`, opacity: 1 },
        { transform: `translate(-50%, -50%) rotate(${angle}rad) scaleX(1)`, opacity: 1, offset: 0.3 },
        { transform: `translate(-50%, -50%) rotate(${angle}rad) scaleX(1.1) scaleY(0.3)`, opacity: 0 },
      ],
      { duration: 380, easing: 'ease-out' },
    ).then(() => line.remove());
    particles.burst({ x: to.x, y: to.y, count: 16, colors: ICE, angle, spread: 0.5, speed: [180, 360], life: [260, 520], size: [1.6, 3], shape: 'shard', drag: 3, gravity: 160 });
    particles.burst({ x: to.x, y: to.y, count: 8, colors: ['#ffffff', '#dff4ff'], angle: angle + Math.PI, spread: 0.9, speed: [60, 140], life: [200, 380], size: [1.2, 2.2], shape: 'shard', drag: 3, gravity: 200 });
    burst(event.target, '#dff4ff', 70);
    freeze(event.target);
  }

  // 960: the Lodowy grobowiec closing on its foe: shards of ice shoot up
  // round its figure, a block of clear ice rises over it from the ground,
  // it cracks, and melts away while the fight goes on.
  function tomb(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 60);
      return;
    }
    const box = boxOf(entry.card);
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const x = art.x + art.width / 2;
    const width = Math.round(Math.min(box.width - 6, figure * 1.2));
    const height = Math.round(Math.min(art.height + 10, box.height * 0.8));
    const bottom = art.y + art.height + 6;
    const block = spark('fx-tomb', { x: x - width / 2, y: bottom - height });
    block.style.width = `${width}px`;
    block.style.height = `${height}px`;
    block.innerHTML = TOMB_FACETS;
    animate(
      block,
      [
        { clipPath: 'inset(100% -4px -4px -4px)', opacity: 1, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
        { clipPath: 'inset(0% -4px -4px -4px)', opacity: 1, offset: 0.2 },
        { clipPath: 'inset(0% -4px -4px -4px)', opacity: 1, offset: 0.76 },
        { clipPath: 'inset(0% -4px -4px -4px)', opacity: 0 },
      ],
      { duration: 1700, delay: 120, easing: 'ease-out', fill: 'backwards' },
    ).then(() => block.remove());
    // The shards shooting up round it first.
    [-0.5, -0.28, 0.3, 0.52, 0].forEach((share, index) => {
      const shard = spark('fx-spike', { x: x + share * width, y: bottom });
      shard.style.height = `${Math.round(height * (index === 4 ? 0.5 : 0.36 + (index % 2) * 0.16))}px`;
      animate(
        shard,
        [
          { transform: `translate(-50%, -100%) rotate(${(share * 24).toFixed(1)}deg) scaleY(0)`, opacity: 1 },
          { transform: `translate(-50%, -100%) rotate(${(share * 24).toFixed(1)}deg) scaleY(1)`, opacity: 1, offset: 0.35 },
          { transform: `translate(-50%, -100%) rotate(${(share * 24).toFixed(1)}deg) scaleY(1)`, opacity: 0 },
        ],
        { duration: 520, delay: index * 30, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'backwards' },
      ).then(() => shard.remove());
    });
    particles.burst({ x, y: bottom - 4, area: { width, height: 6 }, count: 10, colors: ICE, angle: -Math.PI / 2, spread: 0.6, speed: [60, 160], life: [300, 600], size: [1.4, 2.6], shape: 'shard', gravity: 260, drag: 2 });
    after(140, block, () => {
      flash('#dff4ff', 0.12, 320);
      particles.burst({ x, y: bottom - height / 2, area: { width, height }, count: 10, colors: ['#ffffff', '#e4f6ff'], angle: -Math.PI / 2, spread: 1.2, speed: [10, 40], life: [700, 1100], size: [1, 1.8], shape: 'mote', gravity: -10, drag: 1 });
    });
    // It cracks.
    const inner = { x: x - width / 2, y: bottom - height, width, height };
    after(760, block, () => {
      glassCracks(entry, inner, Math.min(width, height), TOMB_CRACKS, 0, 900);
      particles.burst({ x, y: bottom - height * 0.55, count: 6, colors: ['#ffffff', '#cfefff'], speed: [60, 140], life: [240, 420], size: [1.2, 2], shape: 'shard', gravity: 260, drag: 2 });
    });
    entry.card.classList.add('unit--frosted');
    wait(1700).then(() => entry.card.classList.remove('unit--frosted'));
  }

  // 960: the Lustro many: mana drawn into the Arkanista, then a pane of
  // mirror turning to face the foes over its card, a shine running across
  // it and glints at its corners, and it settles into the shield.
  async function mirror(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await bubble(id, color);
      return;
    }
    const box = boxOf(entry.card);
    const middle = centerOf(entry.card);
    gatherTo(middle, Math.hypot(box.width, box.height) * 0.6, [color, '#e8f4ff', '#ffffff'], { count: 16, life: 330 });
    await wait(300);
    const pane = spark('fx-mirror', { x: box.x - 4, y: box.y - 4 }, { '--fx': color });
    pane.style.width = `${Math.round(box.width + 8)}px`;
    pane.style.height = `${Math.round(box.height + 8)}px`;
    const shine = h('span', { class: 'fx-mirror-shine' });
    pane.append(shine);
    entry.card.classList.add('unit--shielded');
    entry.card.style.setProperty('--shield', color);
    flash(color, 0.12, 320);
    animate(
      pane,
      [
        { transform: 'scaleX(0.04)', opacity: 0 },
        { transform: 'scaleX(1.03)', opacity: 1, offset: 0.2 },
        { transform: 'scaleX(1)', opacity: 1, offset: 0.3 },
        { transform: 'scaleX(1)', opacity: 0.85, offset: 0.74 },
        { transform: 'scaleX(1)', opacity: 0 },
      ],
      { duration: 1250, easing: 'ease-out' },
    ).then(() => pane.remove());
    animate(shine, [{ transform: 'translateX(-60%)' }, { transform: 'translateX(60%)' }], { duration: 560, delay: 280, easing: 'ease-in-out', fill: 'both' });
    after(420, pane, () => twinkle({ x: box.x + box.width - 7, y: box.y + 9 }, '#ffffff', 18));
    after(600, pane, () => twinkle({ x: box.x + 9, y: box.y + box.height - 12 }, '#e8f4ff', 14));
    await wait(1000);
  }

  // 960: the Tarcza żywiołów: a flame, a shard of ice and a spark of
  // lightning circle the Awatar's card, the ring they make flares in their
  // three colours, and the shield settles.
  async function elementRing(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await bubble(id, color);
      return;
    }
    const box = boxOf(entry.card);
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const width = stageWidth();
    const cx = art.x + art.width / 2;
    const cy = art.y + art.height * 0.7;
    const rx = Math.min(box.width * 0.6, figure * 0.85, cx - 12, width - cx - 12);
    const ry = Math.min(art.height * 0.3, 22);
    const size = Math.round(Math.min(26, Math.max(17, figure * 0.32)));
    const steps = 32;
    const duration = 1300;
    const turns = 1.3;
    const kinds = [
      { art: FLAME, glow: '#ff8a3d', specks: FIRE, shape: 'ember' },
      { art: FROST_SHARD, glow: '#8fd3ff', specks: ICE, shape: 'mote' },
      { art: SPARK_BOLT, glow: '#f2e36b', specks: BOLT, shape: 'spark' },
    ];
    const at = (start, share) => {
      const angle = start + share * turns * Math.PI * 2;
      const open = Math.min(1, share * 3.5);
      return { x: cx + Math.cos(angle) * rx * (0.35 + 0.65 * open), y: cy + Math.sin(angle) * ry * (0.35 + 0.65 * open), front: Math.sin(angle) };
    };
    kinds.forEach((kind, k) => {
      const start = (k / 3) * Math.PI * 2 - Math.PI / 2;
      const orbiter = spark('fx-orbiter', { x: 0, y: 0 }, { '--fx': kind.glow, '--size': `${size}px` });
      orbiter.innerHTML = kind.art;
      const frames = Array.from({ length: steps + 1 }, (_, step) => {
        const share = step / steps;
        const point = at(start, share);
        const scale = 0.8 + point.front * 0.22;
        const opacity = step === 0 || step === steps ? 0 : point.front < -0.2 ? 0.55 : 1;
        return { transform: `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px) translate(-50%, -50%) scale(${scale.toFixed(2)})`, opacity };
      });
      animate(orbiter, frames, { duration, easing: 'linear' }).then(() => orbiter.remove());
      for (let step = 1; step < steps - 1; step += 2) {
        const point = at(start, step / steps);
        after((step / steps) * duration, orbiter, () => particles.burst({ x: point.x, y: point.y, count: 2, colors: kind.specks, speed: [6, 24], life: [260, 440], size: [1.2, 2.2], shape: kind.shape, drag: 2 }));
      }
    });
    // The ring they make flares and the shield settles.
    const band = spark('fx-elementring', { x: cx, y: cy });
    band.style.width = `${Math.round(rx * 2)}px`;
    band.style.height = `${Math.round(ry * 2)}px`;
    band.innerHTML = ELEMENT_RING;
    animate(
      band,
      [
        { transform: 'translate(-50%, -50%) scale(0.5) rotate(0deg)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 0, offset: 0.3 },
        { transform: 'translate(-50%, -50%) scale(1.04) rotate(0deg)', opacity: 1, offset: 0.5 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 0.8, offset: 0.78 },
        { transform: 'translate(-50%, -50%) scale(1.08) rotate(0deg)', opacity: 0 },
      ],
      { duration, easing: 'ease-out' },
    ).then(() => band.remove());
    after(duration * 0.45, band, () => {
      entry.card.classList.add('unit--shielded');
      entry.card.style.setProperty('--shield', color);
      flash(color, 0.1, 300);
      aura(id, color, 1);
    });
    await wait(duration - 100);
  }

  // A plate of ice the size of a card (the Lodowa zbroja): a frosted pane
  // and shards of ice along its edges and in its corners, each pointing
  // in, to grow from its base (`data-delay`: the corners first, the middle
  // of the edges last).
  function frostPlate(width, height) {
    const reach = Math.min(width, height) * 0.34;
    const lengths = [1, 0.55, 0.8, 0.45, 0.95, 0.6, 0.75, 0.5];
    const far = Math.hypot(width, height) / 2;
    const shards = [];
    const tooth = (x, y, nx, ny, base, long) => {
      const tx = -ny;
      const ty = nx;
      const points = `${(x + tx * base).toFixed(1)},${(y + ty * base).toFixed(1)} ${(x + nx * long).toFixed(1)},${(y + ny * long).toFixed(1)} ${(x - tx * base).toFixed(1)},${(y - ty * base).toFixed(1)}`;
      const shine = `M${x.toFixed(1)} ${y.toFixed(1)}L${(x + nx * long * 0.8).toFixed(1)} ${(y + ny * long * 0.8).toFixed(1)}`;
      const corner = Math.min(Math.hypot(x, y), Math.hypot(width - x, y), Math.hypot(x, height - y), Math.hypot(width - x, height - y));
      const delay = Math.round((corner / far) * 420);
      shards.push(`<g class="fx-shard" data-delay="${delay}" data-origin="${x.toFixed(1)}px ${y.toFixed(1)}px"><polygon points="${points}"/><path d="${shine}"/></g>`);
    };
    const across = Math.max(3, Math.round(width / 17));
    const down = Math.max(4, Math.round(height / 17));
    for (let k = 0; k < across; k++) {
      const x = (width * (k + 0.5)) / across;
      const base = (width / across) * 0.55;
      tooth(x, 0, 0, 1, base, reach * lengths[k % 8]);
      tooth(x, height, 0, -1, base, reach * lengths[(k + 3) % 8]);
    }
    for (let k = 0; k < down; k++) {
      const y = (height * (k + 0.5)) / down;
      const base = (height / down) * 0.55;
      tooth(0, y, 1, 0, base, reach * lengths[(k + 5) % 8] * 0.9);
      tooth(width, y, -1, 0, base, reach * lengths[(k + 1) % 8] * 0.9);
    }
    const corner = reach * 1.15;
    for (const [x, y, nx, ny] of [
      [0, 0, 0.707, 0.707],
      [width, 0, -0.707, 0.707],
      [0, height, 0.707, -0.707],
      [width, height, -0.707, -0.707],
    ]) {
      tooth(x, y, nx, ny, 9, corner);
    }
    return (
      `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">` +
      `<rect class="fx-frostpane" x="1.5" y="1.5" width="${width - 3}" height="${height - 3}" rx="7" fill="rgba(200, 236, 255, 0.2)" stroke="#e8f8ff" stroke-width="2"/>` +
      `<g fill="rgba(226, 246, 255, 0.82)" stroke="#5aaee0" stroke-width="1" stroke-linejoin="round">${shards.join('')}</g></svg>`
    );
  }

  // 960: the Lodowa zbroja: snow drawn in round the Pan Zimy, then frost
  // grows over its card: shards of ice shoot out from its corners and its
  // edges into a plate of armour, a cold glint runs over it and it
  // settles into the shield.
  async function iceArmor(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await bubble(id, color);
      return;
    }
    const box = boxOf(entry.card);
    gatherTo(centerOf(entry.card), Math.hypot(box.width, box.height) * 0.6, ICE, { count: 16, life: 300 });
    await wait(240);
    const width = Math.round(box.width + 6);
    const height = Math.round(box.height + 6);
    const plate = spark('fx-frostplate', { x: box.x - 3, y: box.y - 3 });
    plate.style.width = `${width}px`;
    plate.style.height = `${height}px`;
    plate.innerHTML = frostPlate(width, height);
    const shine = h('span', { class: 'fx-mirror-shine fx-mirror-shine--frost' });
    plate.append(shine);
    entry.card.classList.add('unit--shielded');
    entry.card.style.setProperty('--shield', color);
    animate(plate, [{ opacity: 1 }, { opacity: 1, offset: 0.62 }, { opacity: 0 }], { duration: 1350, easing: 'ease-in' }).then(() => plate.remove());
    animate(plate.querySelector('.fx-frostpane'), [{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: 'ease-out', fill: 'backwards' });
    for (const shard of plate.querySelectorAll('.fx-shard')) {
      // Its base, set here: the page's rules allow no style in markup.
      shard.style.transformOrigin = shard.dataset.origin;
      animate(
        shard,
        [
          { transform: 'scale(0)', opacity: 0 },
          { transform: 'scale(1.12)', opacity: 1, offset: 0.65 },
          { transform: 'scale(1)', opacity: 1 },
        ],
        { duration: 260, delay: Number(shard.dataset.delay), easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'backwards' },
      );
    }
    animate(shine, [{ transform: 'translateX(-60%)' }, { transform: 'translateX(60%)' }], { duration: 520, delay: 560, easing: 'ease-in-out', fill: 'both' });
    after(300, plate, () => {
      flash('#dff4ff', 0.12, 320);
      particles.burst({ x: box.x + box.width / 2, y: box.y + box.height / 2, area: { width: box.width, height: box.height }, count: 12, colors: ['#ffffff', '#e4f6ff', '#bfe8ff'], angle: -Math.PI / 2, spread: Math.PI, speed: [10, 40], life: [600, 1000], size: [1, 1.8], shape: 'mote', drag: 1 });
    });
    after(700, plate, () => twinkle({ x: box.x + box.width - 8, y: box.y + 10 }, '#ffffff', 16));
    await wait(1100);
  }

  // 960: the Harmonia żywiołów: three lights, fire, frost and lightning,
  // rise round the Arcymag in a braid, meet over its head in a star of
  // light, and their three colours ring out round it.
  async function harmony(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await Promise.all([ring(id, color, 130, 760), aura(id, color, 2)]);
      return;
    }
    const box = boxOf(entry.card);
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const cx = art.x + art.width / 2;
    const bottom = box.y + box.height - 12;
    const top = Math.max(8, art.y + figure * 0.18);
    const radius = Math.min(figure * 0.5, box.width * 0.42);
    const size = Math.round(Math.max(11, figure * 0.21));
    const lights = [
      { glow: '#ff8a3d', specks: FIRE },
      { glow: '#8fd3ff', specks: ICE },
      { glow: '#f2e36b', specks: BOLT },
    ];
    const steps = 28;
    const duration = 950;
    const at = (k, share) => {
      const angle = (k / 3) * Math.PI * 2 + share * Math.PI * 2.3;
      const rise = 1 - (1 - share) ** 1.6;
      const r = radius * (1 - share * 0.9);
      return { x: cx + Math.cos(angle) * r, y: bottom + (top - bottom) * rise, front: Math.sin(angle) };
    };
    const mark = anchor(duration + 900);
    lights.forEach((light, k) => {
      const orb = spark('fx-orb', { x: 0, y: 0 }, { '--fx': light.glow, '--size': `${size}px` });
      const frames = Array.from({ length: steps + 1 }, (_, step) => {
        const share = step / steps;
        const point = at(k, share);
        const scale = (0.85 + point.front * 0.2) * (step === steps ? 0.6 : 1);
        return { transform: `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px) translate(-50%, -50%) scale(${scale.toFixed(2)})`, opacity: step === 0 ? 0 : point.front < -0.3 ? 0.6 : 1 };
      });
      animate(orb, frames, { duration, easing: 'ease-in-out' }).then(() => orb.remove());
      for (let step = 1; step < steps; step += 2) {
        const point = at(k, step / steps);
        after((step / steps) * duration, mark, () => particles.burst({ x: point.x, y: point.y, count: 2, colors: light.specks, speed: [5, 20], life: [300, 520], size: [1.1, 2], shape: 'mote', drag: 2 }));
      }
    });
    // They meet: a star of light over the head, rings of the three colours
    // and their motes falling round the Arcymag.
    after(duration - 30, mark, () => {
      const point = { x: cx, y: top };
      twinkle(point, '#ffffff', figure * 0.75);
      const glow = spark('fx-burst', point, { '--fx': '#ffe6a8', '--size': `${Math.round(figure * 0.8)}px` });
      animate(
        glow,
        [
          { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.25 },
          { transform: 'translate(-50%, -50%) scale(1.3)', opacity: 0 },
        ],
        { duration: 520, easing: 'ease-out' },
      ).then(() => glow.remove());
      lights.forEach((light, k) => after(k * 90, mark, () => ring(id, light.glow, Math.round(Math.min(box.width, box.height) * (0.9 + k * 0.18)), 620)));
      particles.burst({ x: cx, y: top, area: { width: radius * 1.6, height: 8 }, count: 15, colors: ['#ff8a3d', '#8fd3ff', '#f2e36b', '#ffffff'], angle: Math.PI / 2, spread: 0.9, speed: [20, 70], gravity: 40, drag: 1, life: [700, 1100], size: [1.1, 2], shape: 'mote' });
      aura(id, color, 1);
    });
    await wait(duration + 650);
  }

  // 960: the Promień Żywiołów: fire, frost and lightning twist into one
  // beam from the Elementalist that sweeps across the foes, each lit in the
  // three colours as it passes.
  async function braid(event, color, targets) {
    const caster = cards.get(event.actor);
    if (!caster || reduced() || !particles) {
      await beams(color, targets);
      return;
    }
    const art = artOf(caster.card);
    const from = { x: art.x + art.width / 2, y: art.y + art.height * 0.45 };
    // The foes in the order the beam turns through them.
    const turn = (point) => Math.atan2(point.y - from.y, point.x - from.x);
    const foes = targets
      .map((id) => ({ id, entry: cards.get(id) }))
      .filter((foe) => foe.entry)
      .map((foe) => ({ ...foe, point: centerOf(foe.entry.card) }))
      .sort((a, b) => turn(a.point) - turn(b.point));
    if (foes.length === 0) {
      await beams(color, targets);
      return;
    }
    // The beam's end: from the first foe to the last, a line from each to
    // the next.
    const path = [];
    foes.forEach((foe, index) => {
      if (index === 0) path.push(foe.point);
      else {
        const before = foes[index - 1].point;
        for (let step = 1; step <= 6; step++) path.push({ x: before.x + ((foe.point.x - before.x) * step) / 6, y: before.y + ((foe.point.y - before.y) * step) / 6 });
      }
    });
    if (foes.length === 1) path.push({ x: foes[0].point.x + 1, y: foes[0].point.y });
    const reach = Math.max(...path.map((point) => Math.hypot(point.x - from.x, point.y - from.y)));
    const thick = Math.round(Math.max(12, Math.min(20, art.height * 0.24)));
    const ray = spark('fx-ray', { x: 0, y: 0 }, { '--size': `${thick}px` });
    ray.style.width = `${Math.round(reach)}px`;
    ray.innerHTML = RAY;
    const shoot = 160;
    const sweep = 260 * Math.max(1, foes.length - 1) + 120;
    const fade = 260;
    const duration = shoot + sweep + fade;
    const pose = (point, grow = 1, wide = 1) => {
      const length = Math.hypot(point.x - from.x, point.y - from.y);
      const angle = Math.atan2(point.y - from.y, point.x - from.x);
      return `translate(${from.x.toFixed(1)}px, ${from.y.toFixed(1)}px) rotate(${angle.toFixed(4)}rad) scale(${((length / reach) * grow).toFixed(4)}, ${wide}) translate(0, -50%)`;
    };
    const frames = [{ transform: pose(path[0], 0.05, 0.6), opacity: 0, offset: 0 }, { transform: pose(path[0]), opacity: 1, offset: shoot / duration }];
    path.slice(1).forEach((point, index) => frames.push({ transform: pose(point), opacity: 1, offset: (shoot + (sweep * (index + 1)) / Math.max(1, path.length - 1)) / duration }));
    frames.push({ transform: pose(path[path.length - 1], 1, 0.15), opacity: 0, offset: 1 });
    const strands = ray.querySelector('.fx-ray-strands');
    animate(strands, [{ transform: 'translateX(0px)' }, { transform: 'translateX(-52px)' }], { duration: 420, iterations: Math.ceil(duration / 420) });
    const beam = animate(ray, frames, { duration, easing: 'linear' }).then(() => ray.remove());
    // Its light at the end, where it strikes, and at the caster's hands.
    const tip = spark('fx-burst', { x: 0, y: 0 }, { '--fx': '#ffe6a8', '--size': `${thick * 2.6}px` });
    const tipFrames = frames.map((frame, index) => {
      const point = index === 0 ? from : path[Math.min(path.length - 1, Math.max(0, index - 1))];
      return { transform: `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px) translate(-50%, -50%)`, opacity: frame.opacity, offset: frame.offset };
    });
    animate(tip, tipFrames, { duration, easing: 'linear' }).then(() => tip.remove());
    gatherTo(from, art.height * 0.5, ['#ff8a3d', '#8fd3ff', '#f2e36b'], { count: 9, life: 200 });
    // Sparks of the three elements thrown off where it strikes.
    const ticks = Math.ceil((sweep + shoot) / 60);
    for (let tick = 0; tick < ticks; tick++) {
      const at = tick * 60;
      const share = Math.min(1, Math.max(0, (at - shoot) / sweep));
      const point = path[Math.round(share * (path.length - 1))];
      after(at, ray, () => particles.burst({ x: point.x, y: point.y, count: 3, colors: [['#ff8a3d', '#ffd27a'], ['#8fd3ff', '#ffffff'], ['#f2e36b', '#fff7c2']][tick % 3], speed: [80, 200], life: [200, 380], size: [1.1, 2.2], shape: tick % 3 === 1 ? 'shard' : tick % 3 === 2 ? 'spark' : 'ember', drag: 3 }));
    }
    // Each foe lit as the beam reaches it.
    foes.forEach((foe, index) => {
      const atFoe = shoot + (foes.length > 1 ? (sweep * index) / (foes.length - 1) : 0) - 20;
      after(Math.max(0, atFoe), ray, () => {
        animate(foe.entry.card, [{ filter: 'brightness(2) saturate(1.3)' }, { filter: 'brightness(1)' }], { duration: 420, easing: 'ease-out' });
        particles.burst({ x: foe.point.x, y: foe.point.y, count: 6, colors: FIRE, angle: -Math.PI / 2, spread: 1.2, speed: [60, 160], life: [300, 560], size: [1.4, 2.6], shape: 'ember', gravity: -40, drag: 2 });
        particles.burst({ x: foe.point.x, y: foe.point.y, count: 6, colors: ICE, speed: [90, 200], life: [260, 480], size: [1.4, 2.6], shape: 'shard', gravity: 200, drag: 2.2 });
        particles.burst({ x: foe.point.x, y: foe.point.y, count: 6, colors: BOLT, speed: [140, 280], life: [160, 300], size: [1, 1.8], shape: 'spark', drag: 4 });
      });
    });
    await beam;
  }

  // 960: the Ognisty wybuch's blast: burning shards of the fireball fly
  // from where it burst to every other foe and splash on them in fire.
  function splash(event) {
    const entry = cards.get(event.target);
    if (!entry || reduced() || !particles) return;
    const from = centerOf(entry.card);
    const width = stageWidth();
    const others = [...cards.values()].filter((other) => other !== entry && other.unit.side === entry.unit.side && !other.unit.summon && !other.card.classList.contains('unit--down') && other.card.isConnected);
    const base = boxOf(entry.card);
    const mark = anchor(2000);
    const wave = spark('fx-shockwave', { x: from.x, y: base.y + base.height - 10 }, { '--fx': '#ff8a3d' });
    wave.style.width = `${Math.round(Math.min(base.width * 1.6, figureOf(artOf(entry.card)) * 2.6, (Math.min(from.x, width - from.x) - 2) * 2))}px`;
    animate(
      wave,
      [
        { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0.95 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
      ],
      { duration: 520, easing: 'ease-out' },
    ).then(() => wave.remove());
    others.forEach((other, index) => {
      const to = centerOf(other.card);
      const figure = figureOf(artOf(other.card));
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      const lift = Math.min(60, distance * 0.35);
      const control = { x: (from.x + to.x) / 2, y: Math.max(8, Math.min(from.y, to.y) - lift) };
      const along = (t) => ({ x: (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * control.x + t * t * to.x, y: (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * control.y + t * t * to.y });
      const steps = 10;
      const flight = 420;
      const delay = 120 + index * 60;
      const size = Math.round(Math.max(12, figure * 0.22));
      const shard = spark('fx-fireball', { x: 0, y: 0 }, { '--size': `${size}px` });
      const points = Array.from({ length: steps + 1 }, (_, step) => along(step / steps));
      animate(
        shard,
        points.map((point, step) => ({ transform: `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px) translate(-50%, -50%) rotate(${step * 40}deg) scale(${(0.6 + (step / steps) * 0.4).toFixed(2)})`, opacity: step === 0 ? 0 : 1 })),
        { duration: flight, delay, easing: 'linear', fill: 'backwards' },
      ).then(() => {
        shard.remove();
        if (mark.isConnected) splashOn(other, to, figure, mark);
      });
      points.slice(0, -1).forEach((point, step) => after(delay + (step * flight) / steps, mark, () => particles.trail({ from: point, to: points[step + 1], duration: flight / steps, colors: FIRE, rate: 160, sizes: [1.4, 3], life: [160, 360], shape: 'ember' })));
    });
  }

  // A burning shard splashing on a foe: a small burst of fire, embers and
  // flames licking the card a moment.
  function splashOn(other, point, figure, mark) {
    const bloom = spark('fx-explosion', point, { '--size': `${Math.round(figure * 0.7)}px` });
    animate(
      bloom,
      [
        { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 1 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.9, offset: 0.35 },
        { transform: 'translate(-50%, -50%) scale(1.2)', opacity: 0 },
      ],
      { duration: 460, easing: 'ease-out' },
    ).then(() => bloom.remove());
    particles.burst({ x: point.x, y: point.y, count: 10, colors: FIRE, angle: -Math.PI / 2, spread: Math.PI * 0.8, speed: [80, 200], life: [360, 680], size: [1.3, 2.6], shape: 'ember', gravity: 160, drag: 2.2 });
    animate(other.card, [{ filter: 'brightness(1.7) sepia(0.5) saturate(2)' }, { filter: 'brightness(1)' }], { duration: 520, easing: 'ease-out' });
    // It keeps burning until its own hit comes (the blast's damage shows
    // with the next moves of the fight).
    const box = boxOf(other.card);
    [4, 4, 3, 3, 3, 2, 2].forEach((count, wave) => {
      after(80 + wave * 160, mark, () => particles.burst({ x: box.x + box.width / 2, y: box.y + box.height * 0.6, area: { width: figure * 0.7, height: figure * 0.4 }, count, colors: FIRE, angle: -Math.PI / 2, spread: 0.3, speed: [30, 70], gravity: -40, drag: 1.2, life: [380, 620], size: [1.3, 2.4], shape: 'ember' }));
    });
  }

  // ——— 961: the evolved Łucznik's skills in looks of their own ———

  // A bolt of lightning from one point to another, flickering (boltArt()).
  function lightning(from, to, { color = '#b9a8ff', jag = 1, forks = 1, width = 1, duration = 420, delay = 0 } = {}) {
    const art = boltArt(from, to, { jag, forks, width });
    const bolt = spark('fx-zap', { x: art.x, y: art.y }, { '--fx': color });
    bolt.innerHTML = art.html;
    return animate(bolt, FLICKER, { duration, delay, fill: 'backwards' }).then(() => bolt.remove());
  }

  // Short bolts crackling out of a point.
  function crackle(point, reach, color, count = 3, delay = 0) {
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2 + Math.random() * 1.4;
      const far = reach * (0.6 + Math.random() * 0.5);
      lightning(point, { x: point.x + Math.cos(angle) * far, y: point.y + Math.sin(angle) * far }, { color, jag: 0.8, forks: 0, width: 0.65, duration: 280, delay: delay + index * 35 });
    }
  }

  // Sparks of the storm's lightning out of a point.
  function stormSparks(point, count = 10) {
    particles.burst({ x: point.x, y: point.y, count, colors: STORM, speed: [140, 300], life: [180, 360], size: [1, 1.8], shape: 'spark', drag: 4 });
  }

  // A foe struck by the storm's lightning: its card flares white.
  function shocked(entry, strength = 2.3) {
    animate(entry.card, [{ filter: `brightness(${strength}) saturate(0.4)` }, { filter: 'brightness(1)' }], { duration: 420, easing: 'ease-out' });
  }

  // The sky over the foes blackening with a storm (the Gniew Peruna's over
  // nearly the whole stage), for `duration`.
  function stormSky(duration, deep = false) {
    const foes = row('enemy');
    const reach = foes ? boxOf(foes) : null;
    const sky = spark(`fx-sky fx-sky--thunder${deep ? ' fx-sky--wrath' : ''}`, { x: 0, y: 0 });
    sky.style.width = `${stageWidth()}px`;
    sky.style.height = `${Math.round(deep ? stageHeight() * 0.8 : reach ? reach.y + Math.min(reach.height * 0.6, 160) : stageHeight() * 0.35)}px`;
    animate(sky, [{ opacity: 0 }, { opacity: 1, offset: 0.18 }, { opacity: 0.85, offset: 0.72 }, { opacity: 0 }], { duration, easing: 'ease-out' }).then(() => sky.remove());
    return sky;
  }

  // The middle of a card's figure, and a point of its picture.
  const figurePoint = (card, down = 0.5) => {
    const art = artOf(card);
    return { x: art.x + art.width / 2, y: art.y + art.height * down };
  };

  // A wound bleeding: drops thrown out of it (`away`: their way) and a few
  // running down from it over the picture, in the card so they move with
  // it.
  function bleed(card, wound, away, { count = 10, drips = 2, delay = 0 } = {}) {
    particles.burst({ x: wound.x, y: wound.y, count, colors: BLOOD, angle: away, spread: 0.8, speed: [50, 150], gravity: 480, drag: 1.4, life: [380, 640], size: [1, 1.9], shape: 'drop' });
    const box = boxOf(card);
    const art = artOf(card);
    const fall = Math.max(8, art.y + art.height - 6 - wound.y);
    for (let index = 0; index < drips; index++) {
      const bead = h('span', { class: 'fx-blood' });
      bead.style.left = `${(wound.x - box.x + (index ? 4 : -3)).toFixed(1)}px`;
      bead.style.top = `${(wound.y - box.y + 1).toFixed(1)}px`;
      card.append(bead);
      animate(
        bead,
        [
          { transform: 'translate(-50%, -30%) scale(0.3)', opacity: 0 },
          { transform: 'translate(-50%, 0px) scale(1)', opacity: 1, offset: 0.3, easing: 'ease-in' },
          { transform: `translate(-50%, ${(fall * 0.85).toFixed(1)}px) scale(0.85, 1.15)`, opacity: 1, offset: 0.8 },
          { transform: `translate(-50%, ${fall.toFixed(1)}px) scale(0.7, 1)`, opacity: 0 },
        ],
        { duration: 900 + index * 200, delay: delay + 120 + index * 240, easing: 'linear', fill: 'backwards' },
      ).then(() => bead.remove());
    }
  }

  // 961: the Grot z zadziorem: its barbed head lodges in the foe, the arrow
  // sticking out toward the archer and quivering; the foe thrashes, the
  // barbs hold, and it bleeds.
  function barbs(event, color) {
    const entry = cards.get(event.target);
    const shooter = cards.get(event.actor);
    if (!entry) return;
    if (!shooter || reduced() || !particles) {
      burst(event.target, color, 60);
      return;
    }
    const card = entry.card;
    const box = boxOf(card);
    const art = artOf(card);
    const figure = figureOf(art);
    const from = centerOf(shooter.card);
    const middle = art.x + art.width / 2;
    // The wound: low on its body, on the archer's side (the damage number
    // pops over its middle).
    const toward = Math.sign(from.x - middle || 1);
    const wound = { x: middle + toward * figure * 0.2, y: art.y + art.height * 0.7 };
    const angle = Math.atan2(wound.y - from.y, wound.x - from.x);
    const deg = (angle * 180) / Math.PI;
    const arrow = h('span', { class: 'fx-barbed' });
    arrow.innerHTML = BARBED_ARROW;
    arrow.style.width = `${Math.round(Math.min(66, Math.max(44, figure * 0.85)))}px`;
    arrow.style.left = `${(wound.x - box.x).toFixed(1)}px`;
    arrow.style.top = `${(wound.y - box.y).toFixed(1)}px`;
    arrow.style.setProperty('--fx', color);
    // In the card, so it moves with it; its point (where it turns) in the
    // wound, the head sunk a little way in.
    card.append(arrow);
    const pose = (turn, sink) => `translate(-100%, -50%) rotate(${(deg + turn).toFixed(1)}deg) translateX(${sink}px)`;
    animate(
      arrow,
      [
        { transform: pose(0, -8), opacity: 1 },
        { transform: pose(0, 3), offset: 0.05 },
        { transform: pose(8, 3), offset: 0.12 },
        { transform: pose(-6, 3), offset: 0.19 },
        { transform: pose(4, 3), offset: 0.26 },
        { transform: pose(-2, 3), offset: 0.33 },
        { transform: pose(0, 3), opacity: 1, offset: 0.82 },
        { transform: pose(0, 3), opacity: 0 },
      ],
      { duration: 1700, easing: 'ease-out' },
    ).then(() => arrow.remove());
    // A spurt of blood back toward the archer and a red flash in the wound.
    const flare = spark('fx-burst', wound, { '--fx': '#d9534f', '--size': `${Math.round(figure * 0.55)}px` });
    animate(
      flare,
      [
        { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.9, offset: 0.25 },
        { transform: 'translate(-50%, -50%) scale(1.25)', opacity: 0 },
      ],
      { duration: 380, easing: 'ease-out' },
    ).then(() => flare.remove());
    bleed(card, wound, angle + Math.PI, { count: 12, drips: 2 });
    // The foe thrashes, after the blow's own jolt, and the barbs hold.
    const width = stageWidth();
    const shift = (value) => Math.min(Math.max(value, 2 - box.x), width - 2 - box.x - box.width);
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const lean = ux > 0 ? 2 : -2;
    after(480, arrow, () => {
      twinkle(wound, '#ffffff', 14);
      animate(
        card,
        [
          { transform: 'translate(0px, 0px) rotate(0deg)' },
          { transform: `translate(${shift(ux * 6).toFixed(1)}px, ${(uy * 2).toFixed(1)}px) rotate(${lean}deg)`, offset: 0.2 },
          { transform: `translate(${shift(-ux * 2).toFixed(1)}px, 0px) rotate(${-lean * 0.4}deg)`, offset: 0.42 },
          { transform: `translate(${shift(ux * 4).toFixed(1)}px, ${(uy * 1.5).toFixed(1)}px) rotate(${lean * 0.7}deg)`, offset: 0.64 },
          { transform: 'translate(0px, 0px) rotate(0deg)' },
        ],
        { duration: 460, easing: 'ease-in-out' },
      );
      particles.burst({ x: wound.x, y: wound.y, count: 5, colors: BLOOD, angle: angle + Math.PI, spread: 1, speed: [40, 110], gravity: 480, drag: 1.4, life: [340, 560], size: [1, 1.7], shape: 'drop' });
    });
  }

  // 961: the Harpun's blow: the foe bleeds where it went in, and again as
  // it is yanked toward the archer (arena-fx.js draws the harpoon, its
  // rope and the yank).
  function harpooned(event, color) {
    const entry = cards.get(event.target);
    const shooter = cards.get(event.actor);
    if (!entry) return;
    if (!shooter || reduced() || !particles) {
      burst(event.target, color, 60);
      return;
    }
    const from = centerOf(shooter.card);
    const to = centerOf(entry.card);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const sink = Math.min(12, entry.card.offsetWidth * 0.1);
    const wound = { x: to.x - Math.cos(angle) * sink, y: to.y - Math.sin(angle) * sink };
    burst(event.target, '#d9534f', 70);
    bleed(entry.card, wound, angle + Math.PI, { count: 14, drips: 2 });
    const mark = anchor(900);
    after(300, mark, () => particles.burst({ x: wound.x, y: wound.y, count: 6, colors: BLOOD, angle: angle + Math.PI, spread: 0.7, speed: [70, 150], gravity: 480, drag: 1.4, life: [340, 560], size: [1, 1.8], shape: 'drop' }));
  }

  // The hunter's whistle: small waves of sound from its head, turned
  // (degrees from straight up) toward what it calls.
  function whistle(art, turn) {
    const head = { x: art.x + art.width / 2, y: art.y + art.height * 0.3 };
    const size = Math.round(figureOf(art) * 0.55);
    for (let index = 0; index < 3; index++) {
      const wave = spark('fx-roar', head, { '--fx': '#f1e6cc', '--size': `${size}px` });
      wave.innerHTML = ROAR;
      const at = `translate(-50%, -50%) rotate(${turn}deg)`;
      animate(
        wave,
        [
          { transform: `${at} scale(0.25)`, opacity: 0 },
          { transform: `${at} translateY(-6px) scale(0.6)`, opacity: 0.95, offset: 0.35 },
          { transform: `${at} translateY(-16px) scale(0.95)`, opacity: 0 },
        ],
        { duration: 420, delay: index * 90, easing: 'ease-out', fill: 'backwards' },
      ).then(() => wave.remove());
    }
  }

  // Feathers knocked loose from a bird, tumbling down from a point.
  function feathers(point, count, figure, color = '#d9b26b') {
    const width = stageWidth();
    for (let index = 0; index < count; index++) {
      const feather = spark('fx-feather', point, { '--fx': color });
      feather.innerHTML = BROWN_FEATHER;
      const side = index % 2 ? 1 : -1;
      const dx = Math.min(Math.max(side * figure * (0.25 + (index % 3) * 0.12), 10 - point.x), width - 10 - point.x);
      const rise = -figure * (0.1 + (index % 2) * 0.12);
      const fall = figure * (0.35 + (index % 3) * 0.1);
      const spin = side * (60 + index * 25);
      animate(
        feather,
        [
          { transform: 'translate(-50%, -50%) scale(0.5) rotate(0deg)', opacity: 0 },
          { transform: `translate(calc(-50% + ${(dx * 0.6).toFixed(1)}px), calc(-50% + ${rise.toFixed(1)}px)) scale(0.8) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.25 },
          { transform: `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${fall.toFixed(1)}px)) scale(0.75) rotate(${spin}deg)`, opacity: 0 },
        ],
        { duration: 900 + (index % 3) * 120, delay: index * 30, easing: 'ease-out', fill: 'backwards' },
      ).then(() => feather.remove());
    }
  }

  // Talons' rakes across a point, drawn along one after another.
  function rakes(point, size, color, count) {
    const mark = spark('fx-rakes', point, { '--fx': color, '--size': `${Math.round(size)}px` });
    mark.innerHTML = rakesArt(count);
    mark.querySelectorAll('path').forEach((line, index) => {
      line.setAttribute('stroke-dasharray', '100 100');
      line.setAttribute('stroke-dashoffset', '100');
      animate(line, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duration: 110, delay: (index % count) * 45, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', fill: 'both' });
    });
    return animate(
      mark,
      [
        { transform: 'translate(-50%, -50%) rotate(-8deg) scale(0.95)', opacity: 1 },
        { transform: 'translate(-50%, -50%) rotate(-8deg) scale(1)', opacity: 1, offset: 0.55 },
        { transform: 'translate(-50%, -50%) rotate(-8deg) scale(1.05)', opacity: 0 },
      ],
      { duration: 520, easing: 'ease-out' },
    ).then(() => mark.remove());
  }

  // 961: the Sokół wakes: at the Łowca's whistle a falcon swoops down out
  // of the sky onto its card, spreads its wings and flies off at the foes.
  async function falconCall(id, color) {
    const entry = cards.get(id);
    const bird = monsterSprite('falcon');
    if (!entry || !bird || reduced() || !particles) {
      await aura(id, color, 1);
      return;
    }
    const box = boxOf(entry.card);
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const width = stageWidth();
    const inward = box.x + box.width / 2 < width / 2 ? 1 : -1;
    whistle(art, inward * 24);
    const size = Math.round(figure * 0.62);
    const half = size / 2;
    // It lands on the picture's top corner toward the arena's middle.
    const perch = { x: inside(art.x + art.width / 2 + inward * figure * 0.3, half, width), y: Math.max(half, art.y + size * 0.1) };
    const start = { x: inside(perch.x + inward * figure * 2, half, width), y: -size };
    const flyoff = { x: perch.x + inward * figure * 2.2, y: -size };
    const holder = spark('fx-bird', { x: 0, y: 0 }, { '--size': `${size}px` });
    holder.append(bird);
    const steps = 12;
    const swoop = Array.from({ length: steps + 1 }, (_, step) => curve(start, { x: perch.x + inward * figure * 1.3, y: perch.y - figure * 0.1 }, perch, step / steps));
    await animate(holder, birdFrames(swoop, swoop.map((_, step) => 0.8 + (step / steps) * 0.2)), { duration: 560, delay: 120, easing: 'cubic-bezier(0.3, 0.2, 0.4, 1)', fill: 'backwards' });
    if (!holder.isConnected) return;
    // It lands: its wings beat twice, a feather or two drift down.
    aura(id, color, 1);
    feathers({ x: perch.x, y: perch.y + half * 0.4 }, 2, figure);
    const face = -inward;
    const sit = (sx, sy, lift = 0) => `translate(${perch.x.toFixed(1)}px, ${(perch.y - lift).toFixed(1)}px) translate(-50%, -50%) scale(${(face * sx).toFixed(3)}, ${sy.toFixed(3)})`;
    await animate(
      holder,
      [
        { transform: sit(1, 1) },
        { transform: sit(1.16, 0.9, 2), offset: 0.2 },
        { transform: sit(1, 1), offset: 0.4 },
        { transform: sit(1.14, 0.92, 2), offset: 0.6 },
        { transform: sit(1, 1) },
      ],
      { duration: 340, easing: 'ease-in-out' },
    );
    if (!holder.isConnected) return;
    // And it flies off up toward the foes.
    const climb = Array.from({ length: steps + 1 }, (_, step) => curve(perch, { x: perch.x + inward * figure * 0.3, y: perch.y - figure * 1.1 }, flyoff, step / steps));
    await animate(holder, birdFrames(climb, climb.map((_, step) => 1 - (step / steps) * 0.25)), { duration: 420, easing: 'cubic-bezier(0.4, 0, 0.7, 1)' });
    holder.remove();
  }

  // 961: the falcon's peck at the foe's head: two scratches and a few
  // feathers.
  function peck(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 60);
      return;
    }
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const head = { x: art.x + art.width / 2, y: art.y + art.height * 0.32 };
    rakes(head, figure * 0.6, '#f1e6cc', 2);
    feathers(head, 3, figure * 0.8);
    particles.burst({ x: head.x, y: head.y, count: 6, colors: ['#ffffff', '#f1e6cc'], speed: [90, 200], life: [160, 300], size: [1, 1.8], shape: 'spark', drag: 4 });
  }

  // 961: the Szpon orła: the eagle's talons rake the foe's face (three
  // gashes of light), feathers fly and a shadow falls over its eyes: it is
  // blinded.
  function talons(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 60);
      return;
    }
    const card = entry.card;
    const box = boxOf(card);
    const art = artOf(card);
    const figure = figureOf(art);
    const face = { x: art.x + art.width / 2, y: art.y + art.height * 0.42 };
    rakes(face, figure * 0.95, color, 3);
    feathers(face, 5, figure);
    particles.burst({ x: face.x, y: face.y, count: 12, colors: ['#ffffff', '#fff1c9', color], speed: [120, 260], life: [200, 380], size: [1.2, 2.2], shape: 'spark', drag: 3.5 });
    // The shadow over its eyes, in the card, so it moves with it.
    const band = h('span', { class: 'fx-blindfold' });
    band.style.left = `${(face.x - box.x).toFixed(1)}px`;
    band.style.top = `${(art.y + art.height * 0.3 - box.y).toFixed(1)}px`;
    band.style.width = `${Math.round(figure * 1.1)}px`;
    band.style.height = `${Math.round(art.height * 0.34)}px`;
    card.append(band);
    animate(
      band,
      [
        { transform: 'translate(-50%, -50%) scaleX(0.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scaleX(1)', opacity: 0.9, offset: 0.25 },
        { transform: 'translate(-50%, -50%) scaleX(1)', opacity: 0.8, offset: 0.75 },
        { transform: 'translate(-50%, -50%) scaleX(1.1)', opacity: 0 },
      ],
      { duration: 1200, delay: 220, easing: 'ease-out', fill: 'backwards' },
    ).then(() => band.remove());
    after(260, band, () => particles.burst({ x: face.x, y: art.y + art.height * 0.3, area: { width: figure * 0.8, height: 6 }, count: 6, colors: SHADE, angle: -Math.PI / 2, spread: 0.6, speed: [8, 26], gravity: -12, drag: 1.5, life: [700, 1000], size: [3, 5], shape: 'dust' }));
  }

  // 961: the hunter's call (Wilk, Przewodnik watahy): it whistles, and its
  // wolf leaps out of the thicket at the arena's edge into its place; the
  // white wolf comes out of a pale mist and howls, and its howl lights up
  // the whole party. (The card's own coming in arena.js plays under this
  // one, which hides it until its time.)
  async function huntCall(event, look) {
    const owner = cards.get(event.actor);
    const entry = summonedCard(event);
    if (!owner || !entry || reduced() || !particles) {
      await Promise.all([ring(event.actor, look.color, 130, 760), aura(event.actor, look.color, 2)]);
      return;
    }
    const box = boxOf(entry.card);
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const width = stageWidth();
    const x = box.x + box.width / 2;
    const ground = box.y + box.height - 8;
    const mark = anchor(1800);
    const ownerBox = boxOf(owner.card);
    whistle(artOf(owner.card), x < ownerBox.x + ownerBox.width / 2 ? -35 : 35);
    const scene = { entry, card: entry.card, box, art, figure, x, ground, mark, width, look, owner };
    if (look.arrival === 'wolf') wolfLeap(scene);
    else whiteWolf(scene);
    await wait(1250);
  }

  // A wolf leaping out of the thicket at the arena's edge on the side away
  // from its hunter, in an arc, and landing in its place in a puff of dust.
  function wolfLeap({ entry, card, box, art, figure, x, ground, mark, width, look, owner }) {
    const hunter = boxOf(owner.card);
    const side = hunter.x + hunter.width / 2 > x ? -1 : 1;
    const from = side < 0 ? -(box.x + box.width + 6) : width - box.x + 6;
    const edge = { x: side < 0 ? 8 : width - 8, y: art.y + art.height * 0.6 };
    after(COMING - 200, mark, () => {
      leaves(edge, { count: 9, reach: figure * 0.75, colors: THICKET });
      particles.burst({ x: edge.x, y: edge.y, area: { width: 10, height: figure * 0.5 }, count: 8, colors: TWIGS, angle: side < 0 ? 0 : Math.PI, spread: 0.9, speed: [80, 180], life: [380, 650], size: [1.4, 2.6], shape: 'shard', gravity: 300, drag: 1.5 });
    });
    const rise = Math.max(0, Math.min(box.y - 4, figure * 0.45));
    const lean = -side * 6;
    animate(
      card,
      [
        { transform: `translate(${from.toFixed(1)}px, 0px) rotate(${lean}deg)`, easing: 'cubic-bezier(0.25, 0.4, 0.6, 1)' },
        { transform: `translate(${(from * 0.42).toFixed(1)}px, ${(-rise).toFixed(1)}px) rotate(${lean * 0.5}deg)`, offset: 0.5, easing: 'cubic-bezier(0.45, 0, 0.75, 0.6)' },
        { transform: 'translate(0px, 3px) rotate(0deg) scale(1.05, 0.93)', offset: 0.84, easing: 'ease-out' },
        { transform: 'translate(0px, 0px) rotate(0deg) scale(1, 1)' },
      ],
      { duration: 560, delay: COMING, fill: 'backwards' },
    );
    after(COMING + 470, mark, () => {
      particles.burst({ x, y: ground, area: { width: box.width * 0.8, height: 6 }, count: 8, colors: DUST, speed: [30, 90], life: [600, 950], size: [3.5, 6.5], shape: 'dust', gravity: -20, drag: 2 });
      leaves({ x, y: art.y + art.height * 0.4 }, { count: 4, reach: figure * 0.45, colors: THICKET });
      groundRing(entry.unit.id, '#c8b49a');
      aura(entry.unit.id, look.color, 1);
    });
  }

  // The white wolf coming out of a pale mist, its howl rising and the
  // party lit up by it.
  function whiteWolf({ entry, card, box, art, figure, x, mark, width, look, owner }) {
    const middle = { x, y: art.y + art.height * 0.55 };
    const across = Math.round(Math.min(box.width, figure * 1.6, (Math.min(x, width - x) - 2) * 2));
    const mist = spark('fx-mist', middle, { '--size': `${across}px` });
    animate(
      mist,
      [
        { transform: 'translate(-50%, -50%) scale(0.4, 0.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1, 1)', opacity: 0.95, offset: 0.3 },
        { transform: 'translate(-50%, -55%) scale(1.15, 1.05)', opacity: 0.35, offset: 0.6 },
        { transform: 'translate(-50%, -65%) scale(1.3, 1.1)', opacity: 0 },
      ],
      { duration: 1400, easing: 'ease-out' },
    ).then(() => mist.remove());
    for (let wave = 0; wave < 3; wave++) {
      after(wave * 130, mark, () => particles.burst({ x, y: middle.y + art.height * 0.2, area: { width: across * 0.8, height: 10 }, count: 6, colors: ['#ffffff', '#e6eeff', '#c9d8f0'], angle: -Math.PI / 2, spread: 0.6, speed: [10, 36], gravity: -18, drag: 1, life: [800, 1200], size: [3, 6], shape: 'dust' }));
    }
    animate(
      card,
      [
        { opacity: 0, filter: 'brightness(2.4) saturate(0)', transform: 'translateY(6px) scale(0.94)', easing: 'cubic-bezier(0.3, 0.6, 0.4, 1)' },
        { opacity: 1, filter: 'brightness(1.7) saturate(0.4)', transform: 'translateY(0px) scale(1.02)', offset: 0.6 },
        { opacity: 1, filter: 'brightness(1) saturate(1)', transform: 'translateY(0px) scale(1)' },
      ],
      { duration: 560, delay: COMING - 80, fill: 'backwards' },
    );
    // Its howl: it lifts its head, waves rise from it, and the whole party
    // is lit up.
    const howl = COMING + 500;
    // (A computer's wide card tilts less, to lift the head as far.)
    const tilt = Math.min(3, Math.max(1.2, 300 / box.width)).toFixed(1);
    after(howl, mark, () => animate(card, [{ transform: 'translateY(0px) rotate(0deg)' }, { transform: `translateY(-3px) rotate(-${tilt}deg)`, offset: 0.3 }, { transform: `translateY(-3px) rotate(-${tilt}deg)`, offset: 0.7 }, { transform: 'translateY(0px) rotate(0deg)' }], { duration: 620, easing: 'ease-in-out' }));
    const head = { x, y: art.y + art.height * 0.2 };
    const size = Math.round(Math.min(figure * 1.5, (Math.min(x, width - x) - 3) * 2));
    for (let index = 0; index < 4; index++) {
      const wave = spark('fx-roar fx-roar--howl', head, { '--fx': '#dfe9ff', '--size': `${size}px` });
      wave.innerHTML = ROAR;
      animate(
        wave,
        [
          { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
          { transform: 'translate(-50%, calc(-50% - 8px)) scale(0.7)', opacity: 1, offset: 0.3 },
          { transform: 'translate(-50%, calc(-50% - 26px)) scale(1.1)', opacity: 0 },
        ],
        { duration: 620, delay: howl + 40 + index * 130, easing: 'ease-out', fill: 'backwards' },
      ).then(() => wave.remove());
    }
    after(howl + 140, mark, () => {
      for (const ally of cards.values()) {
        if (ally.unit.side !== owner.unit.side || ally.card.classList.contains('unit--down') || !ally.card.isConnected) continue;
        const glow = boxOf(ally.card);
        animate(ally.card, [{ boxShadow: '0 0 0 0 transparent' }, { boxShadow: '0 0 0 2px #e8f0ff, 0 0 16px 3px #c9d8f0', offset: 0.3 }, { boxShadow: '0 0 0 0 transparent' }], { duration: 760 });
        particles.burst({ x: glow.x + glow.width / 2, y: glow.y + glow.height * 0.7, area: { width: glow.width * 0.7, height: glow.height * 0.3 }, count: 8, colors: ['#ffffff', '#e8f0ff', look.color], angle: -Math.PI / 2, spread: 0.5, speed: [20, 50], rise: 30, gravity: -24, drag: 0.8, life: [700, 1000], size: [1.2, 2.2], shape: 'mote' });
      }
    });
  }

  // 961: the Strzał w serce's aim: a heart on the foe's chest, beating
  // twice while the archer draws.
  function heartMark(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      ring(id, color, 70, 420);
      return;
    }
    const figure = figureOf(artOf(entry.card));
    const point = figurePoint(entry.card, 0.56);
    const size = Math.round(figure * 0.5);
    const heart = spark('fx-heart', point, { '--fx': color, '--size': `${size}px` });
    heart.innerHTML = HEART;
    const at = (scale) => `translate(-50%, -50%) scale(${scale})`;
    animate(
      heart,
      [
        { transform: at(0.4), opacity: 0 },
        { transform: at(1), opacity: 1, offset: 0.14 },
        { transform: at(1.24), opacity: 1, offset: 0.24 },
        { transform: at(0.98), opacity: 1, offset: 0.34 },
        { transform: at(1.18), opacity: 1, offset: 0.44 },
        { transform: at(1), opacity: 1, offset: 0.56 },
        { transform: at(1), opacity: 1, offset: 0.9 },
        { transform: at(1.1), opacity: 0 },
      ],
      { duration: 900 },
    ).then(() => heart.remove());
    // A ring of red light with each beat.
    for (const delay of [190, 370]) {
      after(delay, heart, () => {
        const pulse = spark('fx-ring', point, { '--fx': color, '--size': `${Math.round(size * 1.5)}px` });
        animate(
          pulse,
          [
            { transform: 'translate(-50%, -50%) scale(0.5)', opacity: 0.9 },
            { transform: 'translate(-50%, -50%) scale(1.1)', opacity: 0 },
          ],
          { duration: 380, easing: 'ease-out' },
        ).then(() => pulse.remove());
      });
    }
  }

  // The heart of the Strzał w serce breaking where the arrow went in: its
  // halves fall apart, red sparks fly.
  function heartBreak(color) {
    const heart = fx.querySelector('.fx-heart');
    if (!heart) return;
    const point = { x: parseFloat(heart.style.left), y: parseFloat(heart.style.top) };
    const size = heart.style.getPropertyValue('--size');
    heart.remove();
    HEART_HALVES.forEach((half, index) => {
      const piece = spark('fx-heart', point, { '--fx': color, '--size': size });
      piece.innerHTML = half;
      const side = index ? 1 : -1;
      animate(
        piece,
        [
          { transform: 'translate(-50%, -50%) rotate(0deg)', opacity: 1 },
          { transform: `translate(calc(-50% + ${side * 12}px), calc(-50% - 2px)) rotate(${side * 14}deg)`, opacity: 1, offset: 0.28 },
          { transform: `translate(calc(-50% + ${side * 24}px), calc(-50% + 10px)) rotate(${side * 30}deg)`, opacity: 1, offset: 0.6 },
          { transform: `translate(calc(-50% + ${side * 30}px), calc(-50% + 22px)) rotate(${side * 40}deg)`, opacity: 0 },
        ],
        { duration: 720, easing: 'ease-in' },
      ).then(() => piece.remove());
    });
    particles.burst({ x: point.x, y: point.y, count: 14, colors: ['#ffffff', '#ffb3a8', color, '#d9534f'], speed: [90, 220], life: [260, 520], size: [1.2, 2.4], shape: 'spark', drag: 3, gravity: 120 });
  }

  // The cards standing in the fields behind a card's, deeper in its side's
  // formation (where a shot that goes through it goes on), the nearest
  // field first.
  function behindOf(card) {
    const field = card.closest('.arena-field');
    const fields = field?.parentElement ? [...field.parentElement.querySelectorAll(':scope > .arena-field')] : [];
    const depth = fields.indexOf(field);
    if (depth < 0) return [];
    return fields.slice(depth + 1).flatMap((deeper) => [...deeper.querySelectorAll(':scope > .unit')].filter((unit) => !unit.classList.contains('unit--down')));
  }

  // The card a shot that went through it came out of: in the nearest field
  // ahead of a card's (standing or fallen), the one nearest to it.
  function aheadOf(card) {
    const field = card.closest('.arena-field');
    const fields = field?.parentElement ? [...field.parentElement.querySelectorAll(':scope > .arena-field')] : [];
    const at = centerOf(card);
    for (let depth = fields.indexOf(field) - 1; depth >= 0; depth--) {
      const units = [...fields[depth].querySelectorAll(':scope > .unit')];
      if (units.length > 0) return units.reduce((best, unit) => (Math.abs(centerOf(unit).y - at.y) < Math.abs(centerOf(best).y - at.y) ? unit : best));
    }
    return null;
  }

  // A bright line through a card along a shot's way, and sparks thrown on
  // (as pierce(), along any way).
  function pierceAlong(card, angle, color) {
    const to = centerOf(card);
    const line = spark('fx-pierce', to, { '--fx': color });
    line.style.width = `${Math.round(Math.hypot(card.offsetWidth, card.offsetHeight) * 1.5)}px`;
    particles.burst({ x: to.x, y: to.y, count: 16, colors: ['#ffffff', color, '#ffe0c4'], angle, spread: 0.35, speed: [200, 420], life: [180, 360], size: [1.2, 2.4], shape: 'spark', drag: 3.5 });
    animate(
      line,
      [
        { transform: `translate(-50%, -50%) rotate(${angle}rad) scaleX(0)`, opacity: 1 },
        { transform: `translate(-50%, -50%) rotate(${angle}rad) scaleX(1)`, opacity: 1, offset: 0.3 },
        { transform: `translate(-50%, -50%) rotate(${angle}rad) scaleX(1.1) scaleY(0.3)`, opacity: 0 },
      ],
      { duration: 380, easing: 'ease-out' },
    ).then(() => line.remove());
  }

  // A dashed line of sight between two points, drawn on from the first.
  function sightOf(from, to, color, delay, duration) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const line = spark('fx-sightline', from, { '--fx': color });
    line.style.width = `${Math.round(Math.hypot(dx, dy))}px`;
    const at = `rotate(${Math.atan2(dy, dx).toFixed(4)}rad)`;
    return animate(
      line,
      [
        { transform: `${at} scaleX(0)`, opacity: 0 },
        { transform: `${at} scaleX(1)`, opacity: 0.85, offset: 0.3 },
        { transform: `${at} scaleX(1)`, opacity: 0.85, offset: 0.82 },
        { transform: `${at} scaleX(1)`, opacity: 0 },
      ],
      { duration, delay, easing: 'ease-out', fill: 'backwards' },
    ).then(() => line.remove());
  }

  // 961: the Mistrzowski strzał's aim, while the bowstring is drawn to the
  // ear (arena-fx.js): a line of sight from the archer to its target, and on
  // from it to every foe in the formation behind it, which the arrow will go
  // through.
  function sightline(event, color) {
    const target = cards.get(event.target);
    const shooter = cards.get(event.actor);
    if (!target || !shooter) return;
    reticle(event.target, color);
    if (reduced()) return;
    const to = centerOf(target.card);
    sightOf(centerOf(shooter.card), to, color, 0, 760);
    behindOf(target.card).forEach((card, index) => sightOf(to, centerOf(card), color, 160 + index * 60, 600 - index * 60));
  }

  // 961: a shot that goes on through its target (Przebijający strzał,
  // Strzał w serce, Mistrzowski strzał): a line of light pierces it and the
  // arrow bursts out of its back in splinters and sparks; the Strzał w
  // serce breaks its heart, the Mistrzowski strzał blazes.
  function throughShot(event, look) {
    const target = cards.get(event.target);
    const shooter = cards.get(event.actor);
    if (!target || !shooter) return;
    if (reduced() || !particles) {
      pierce(event, look.color);
      burst(event.target, look.color, 60);
      return;
    }
    const to = centerOf(target.card);
    // Its way: from the archer, or for its pierce from the foe it went
    // through; it goes on toward the foe behind, if one stands there.
    const ahead = event.pierced ? aheadOf(target.card) : null;
    const from = centerOf(ahead ?? shooter.card);
    const way = Math.atan2(to.y - from.y, to.x - from.x);
    const next = behindOf(target.card)[0];
    const toward = next ? centerOf(next) : null;
    const angle = toward ? Math.atan2(toward.y - to.y, toward.x - to.x) : way;
    const figure = figureOf(artOf(target.card));
    const master = look.orb === 'master';
    pierceAlong(target.card, way, look.color);
    if (look.heart && !event.pierced) heartBreak(look.color);
    // Out of its back.
    const exit = { x: to.x + Math.cos(angle) * figure * 0.45, y: to.y + Math.sin(angle) * figure * 0.45 };
    particles.burst({ x: exit.x, y: exit.y, count: master ? 20 : 14, colors: ['#ffffff', look.color, '#efe3c8'], angle, spread: 0.3, speed: [220, 440], life: [200, 380], size: [1.2, 2.4], shape: 'spark', drag: 3 });
    particles.burst({ x: exit.x, y: exit.y, count: 6, colors: TWIGS, angle, spread: 0.5, speed: [110, 230], life: [300, 520], size: [1.2, 2], shape: 'shard', gravity: 320, drag: 2 });
    const flare = spark('fx-burst', exit, { '--fx': look.color, '--size': `${Math.round(figure * (master ? 0.75 : 0.5))}px` });
    animate(
      flare,
      [
        { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.25 },
        { transform: 'translate(-50%, -50%) scale(1.3)', opacity: 0 },
      ],
      { duration: 360, easing: 'ease-out' },
    ).then(() => flare.remove());
    if (master) {
      burst(event.target, '#fff1c9', Math.round(figure * 1.4));
      ring(event.target, look.color, Math.round(figure * 1.6), 460);
      if (!event.pierced) flash(look.color, 0.14, 320);
    } else burst(event.target, look.color, 60);
  }

  // 961: the Strzał z ukrycia: the Snajper hides in the shadow of leaves,
  // its card darkened and leaves stirring over it, until its arrow has
  // flown out of hiding (arena-fx.js flies it unseen).
  function hide(event) {
    const shooter = cards.get(event.actor);
    if (!shooter || reduced() || !particles) {
      ring(event.target, lookOf(event).color, 70, 420);
      return;
    }
    const box = boxOf(shooter.card);
    const art = artOf(shooter.card);
    const figure = figureOf(art);
    animate(
      shooter.card,
      [
        { filter: 'brightness(1) saturate(1)' },
        { filter: 'brightness(0.32) saturate(0.45)', offset: 0.22 },
        { filter: 'brightness(0.32) saturate(0.45)', offset: 0.8 },
        { filter: 'brightness(1) saturate(1)' },
      ],
      { duration: 1000, easing: 'ease-in-out' },
    );
    leaves({ x: art.x + art.width / 2, y: art.y + 6 }, { count: 10, reach: figure * 0.55, colors: THICKET });
    particles.burst({ x: box.x + box.width / 2, y: art.y + art.height * 0.5, area: { width: figure * 0.9, height: art.height * 0.8 }, count: 8, colors: SHADE, angle: -Math.PI / 2, spread: 1.2, speed: [6, 24], gravity: -8, drag: 1.4, life: [700, 1000], size: [4, 7], shape: 'dust' });
    // The leaves stir again as the arrow leaves its cover.
    const mark = anchor(700);
    after(200, mark, () => leaves({ x: art.x + art.width / 2, y: art.y + art.height * 0.4 }, { count: 6, reach: figure * 0.45, colors: THICKET }));
  }

  // 961: the arrow out of hiding strikes: a sudden white flash on the foe,
  // a dark line through it, and the leaves it came through scattering.
  function ambushHit(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    pierce(event, color);
    if (reduced() || !particles) {
      burst(event.target, color, 60);
      return;
    }
    burst(event.target, '#ffffff', Math.round(figureOf(artOf(entry.card)) * 1.3));
    flash('#e6dcff', 0.16, 240);
    particles.burst({ x: centerOf(entry.card).x, y: centerOf(entry.card).y, count: 10, colors: SHADE_SPARKS, speed: [80, 200], life: [260, 480], size: [1.2, 2.2], shape: 'spark', drag: 3 });
  }

  // 961: the Spokojna ręka: the world goes still round the Mistrz Łuku: the
  // arena dims but for it, a slow breath draws in and goes out, the corners
  // of a sight close calmly round its head and its eye glints.
  async function steady(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await Promise.all([ring(id, color, 130, 760), aura(id, color, 2)]);
      return;
    }
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const middle = { x: art.x + art.width / 2, y: art.y + art.height * 0.45 };
    const stillness = spark('fx-stillness', { x: 0, y: 0 });
    stillness.style.width = `${stageWidth()}px`;
    stillness.style.height = `${stageHeight()}px`;
    stillness.style.setProperty('--x', `${middle.x.toFixed(1)}px`);
    stillness.style.setProperty('--y', `${middle.y.toFixed(1)}px`);
    stillness.style.setProperty('--r', `${Math.round(figure * 0.85)}px`);
    animate(stillness, [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 1, offset: 0.72 }, { opacity: 0 }], { duration: 1600, easing: 'ease-in-out' }).then(() => stillness.remove());
    // The breath: a ring drawing in, then going out again, slowly.
    const size = Math.round(figure * 1.45);
    const breath = spark('fx-breath', middle, { '--fx': color, '--size': `${size}px` });
    animate(
      breath,
      [
        { transform: 'translate(-50%, -50%) scale(1.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.05)', opacity: 0.85, offset: 0.2 },
        { transform: 'translate(-50%, -50%) scale(0.5)', opacity: 0.9, offset: 0.45, easing: 'cubic-bezier(0.3, 0, 0.3, 1)' },
        { transform: 'translate(-50%, -50%) scale(1.45)', opacity: 0 },
      ],
      { duration: 1400, easing: 'ease-in-out' },
    ).then(() => breath.remove());
    // The sight's corners close calmly round its head and hold.
    const head = { x: middle.x, y: art.y + art.height * 0.38 };
    const corners = spark('fx-reticle', head, { '--fx': '#ffffff', '--size': `${Math.round(figure * 0.78)}px` });
    corners.innerHTML = FOCUS;
    animate(
      corners,
      [
        { transform: 'translate(-50%, -50%) scale(1.7)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.95, offset: 0.4, easing: 'ease-in-out' },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.95, offset: 0.78 },
        { transform: 'translate(-50%, -50%) scale(0.92)', opacity: 0 },
      ],
      { duration: 1400, easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)' },
    ).then(() => corners.remove());
    // The breath held: its eye glints, calm motes drift round it.
    after(640, stillness, () => {
      twinkle({ x: middle.x + figure * 0.08, y: art.y + art.height * 0.32 }, '#ffffff', 16);
      aura(id, color, 1);
    });
    particles.burst({ x: middle.x, y: middle.y, area: { width: figure * 1.2, height: art.height }, count: 10, colors: ['#ffffff', color, '#d8f5df'], angle: -Math.PI / 2, spread: Math.PI, speed: [4, 14], drag: 0.4, life: [1000, 1400], size: [1, 1.8], shape: 'mote' });
    await wait(1300);
  }

  // 961: the Namierzenie: the Strzelec Wyborowy's line of sight runs to the
  // foe, a red sight closes on it and locks with two clicks, crosshairs
  // run across its card and a ring marks its feet.
  async function lockOn(event, color) {
    const target = cards.get(event.targets[0]);
    const shooter = cards.get(event.actor);
    if (!target || !shooter || reduced() || !particles) {
      await aura(event.actor, color, 1);
      return;
    }
    const from = centerOf(shooter.card);
    const box = boxOf(target.card);
    const to = centerOf(target.card);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const line = spark('fx-sightline fx-sightline--lock', from, { '--fx': color });
    line.style.width = `${Math.round(Math.hypot(dx, dy))}px`;
    const along = `rotate(${Math.atan2(dy, dx).toFixed(4)}rad)`;
    animate(
      line,
      [
        { transform: `${along} scaleX(0)`, opacity: 0 },
        { transform: `${along} scaleX(1)`, opacity: 0.9, offset: 0.22 },
        { transform: `${along} scaleX(1)`, opacity: 0.9, offset: 0.6 },
        { transform: `${along} scaleX(1)`, opacity: 0 },
      ],
      { duration: 1000, easing: 'ease-out' },
    ).then(() => line.remove());
    const size = Math.round(Math.min(box.width, box.height) * 1.05);
    const sight = spark('fx-reticle', to, { '--fx': color, '--size': `${size}px` });
    sight.innerHTML = RETICLE;
    const at = (scale, turn) => `translate(-50%, -50%) scale(${scale}) rotate(${turn}deg)`;
    animate(
      sight,
      [
        { transform: at(2.1, 90), opacity: 0 },
        { transform: at(1, 0), opacity: 1, offset: 0.34, easing: 'ease-out' },
        { transform: at(0.86, 0), opacity: 1, offset: 0.4 },
        { transform: at(1, 0), opacity: 1, offset: 0.46 },
        { transform: at(0.88, 0), opacity: 1, offset: 0.52 },
        { transform: at(0.94, 0), opacity: 1, offset: 0.58 },
        { transform: at(0.94, 0), opacity: 1, offset: 0.86 },
        { transform: at(0.8, 0), opacity: 0 },
      ],
      { duration: 1300, delay: 120, easing: 'ease-in-out', fill: 'backwards' },
    ).then(() => sight.remove());
    // Locked: the crosshairs run across the foe's card, which reddens, and
    // a ring marks its feet.
    after(640, sight, () => {
      for (const across of [true, false]) {
        const hair = spark('fx-crosshair', to, { '--fx': color });
        hair.style.width = across ? `${Math.round(box.width + 14)}px` : '2px';
        hair.style.height = across ? '2px' : `${Math.round(box.height + 14)}px`;
        animate(
          hair,
          [
            { transform: `translate(-50%, -50%) ${across ? 'scaleX' : 'scaleY'}(0)`, opacity: 0.95 },
            { transform: `translate(-50%, -50%) ${across ? 'scaleX' : 'scaleY'}(1)`, opacity: 0.95, offset: 0.3 },
            { transform: `translate(-50%, -50%) ${across ? 'scaleX' : 'scaleY'}(1)`, opacity: 0 },
          ],
          { duration: 700, easing: 'ease-out' },
        ).then(() => hair.remove());
      }
      animate(target.card, [{ boxShadow: '0 0 0 0 transparent' }, { boxShadow: `0 0 0 2px ${color}, 0 0 16px 2px ${color}`, offset: 0.3 }, { boxShadow: '0 0 0 0 transparent' }], { duration: 760 });
      groundRing(event.targets[0], color);
      twinkle({ x: to.x, y: to.y }, '#ffffff', 14);
    });
    await wait(1250);
  }

  // The volley loosed up into the storm (as the Grad strzał's).
  function volleyUp(from, color) {
    return [-14, -5, 4, 13, 22].map((dx, index) =>
      arrowFlight(
        { x: from.x + dx, y: from.y },
        [
          { transform: 'translate(0, 0) rotate(-90deg)', opacity: 0 },
          { opacity: 1, offset: 0.2 },
          { transform: `translate(${dx * 0.6}px, -240px) rotate(-90deg)`, opacity: 0 },
        ],
        300,
        index * 45,
        color,
      ),
    );
  }

  // Arrows falling on a foe, out of the storm; `landed` for each where it
  // lands.
  function arrowsOn(entry, color, delay, count, landed) {
    const box = boxOf(entry.card);
    return [-0.3, 0.06, 0.32, -0.12, 0.2].slice(0, count).map((dx, arrow) => {
      const land = { x: box.x + box.width * (0.5 + dx), y: box.y + box.height * (0.42 + (arrow % 2) * 0.2) };
      return arrowFlight(
        land,
        [
          { transform: 'translate(-26px, -110px) rotate(76deg)', opacity: 0 },
          { opacity: 1, offset: 0.25 },
          { transform: 'translate(0, 0) rotate(76deg)', opacity: 1 },
        ],
        260,
        delay + arrow * 50,
        color,
      ).then(() => landed(land, arrow));
    });
  }

  // 961: the storms of the Strzelec Burzy's line. The Burza strzał: storm
  // clouds darken the sky over the foes, a volley goes up into them and
  // comes down on every foe charged with lightning, each arrow landing in a
  // crackle of sparks. The Grom z nieba: the sky blackens, and with the
  // arrows a bolt of lightning strikes every foe. The Gniew Peruna: the
  // whole sky blackens, bolts strike every foe by the handful and leap from
  // foe to foe.
  async function storm(event, look, targets) {
    const caster = cards.get(event.actor);
    if (!caster || reduced() || !particles) {
      await (look.volley ? volley(event, look.color, targets) : rain(look.color, targets));
      return;
    }
    if (look.storm === 'wrath') {
      await perunWrath(look.color, targets);
      return;
    }
    const thunder = look.storm === 'thunder';
    const sky = stormSky(thunder ? 1800 : 1500);
    const from = centerOf(caster.card);
    const up = volleyUp(from, look.color);
    for (let index = 0; index < 4; index++) {
      after(40 + index * 55, sky, () => particles.burst({ x: from.x + (index % 2 ? 10 : -6), y: from.y - 30 - index * 40, count: 3, colors: STORM, speed: [60, 140], life: [140, 260], size: [1, 1.6], shape: 'spark', drag: 4 }));
    }
    // Lightning in the clouds as the volley goes into them.
    after(220, sky, () => flash('#c9b7ff', thunder ? 0.16 : 0.1, 280));
    await wait(260);
    if (!sky.isConnected) return;
    const falls = targets.flatMap((id, index) => {
      const entry = cards.get(id);
      if (!entry) return [];
      const art = artOf(entry.card);
      const figure = figureOf(art);
      const delay = index * (thunder ? 110 : 70);
      if (thunder) {
        // The bolt first, then the arrows with it.
        after(delay, sky, () => {
          const point = figurePoint(entry.card, 0.5);
          lightning({ x: point.x + (Math.random() - 0.5) * 20, y: 0 }, point, { color: look.color, forks: 2, width: 1.15, duration: 460 });
          stormSparks(point, 12);
          shocked(entry, 2.6);
          if (index === 0) flash('#ece6ff', 0.22, 300);
          shake(index === 0 ? 3 : 2, 240);
        });
      }
      let first = true;
      return arrowsOn(entry, look.color, delay + (thunder ? 60 : 0), thunder ? 3 : 5, (land) => {
        if (!sky.isConnected) return;
        crackle(land, figure * 0.22, look.color, 2);
        particles.burst({ x: land.x, y: land.y, count: 3, colors: STORM, speed: [80, 180], life: [140, 280], size: [1, 1.6], shape: 'spark', drag: 4 });
        particles.burst({ x: land.x, y: land.y + 4, count: 2, colors: DUST, speed: [10, 40], life: [380, 620], size: [3, 5], shape: 'dust', gravity: -10, drag: 2 });
        if (first && !thunder) shocked(entry, 1.9);
        first = false;
      });
    });
    await Promise.all([...up, ...falls]);
  }

  // The Gniew Peruna (storm() above).
  async function perunWrath(color, targets) {
    const sky = stormSky(2100, true);
    after(140, sky, () => {
      flash('#ece6ff', 0.24, 320);
      shake(2.4, 260);
    });
    const foes = targets.map((id) => cards.get(id)).filter(Boolean);
    const strikes = [];
    foes.forEach((entry, index) => {
      for (let bolt = 0; bolt < 2; bolt++) {
        strikes.push(
          after(260 + index * 120 + bolt * 90, sky, () => {
            const point = figurePoint(entry.card, bolt ? 0.42 : 0.6);
            lightning({ x: point.x + (bolt ? 1 : -1) * (8 + Math.random() * 14), y: 0 }, point, { color, forks: 2, width: 1.2, duration: 480 });
            stormSparks(point, 10);
            shocked(entry, 2.8);
            shake(bolt ? 2.6 : 3.2, 240);
            if (bolt) flash('#c9b7ff', 0.14, 260);
          }),
        );
      }
    });
    // The bolts leap from foe to foe.
    const chained = 260 + foes.length * 120 + 160;
    foes.slice(1).forEach((entry, index) => {
      strikes.push(
        after(chained + index * 110, sky, () => {
          const a = figurePoint(foes[index].card, 0.5);
          const b = figurePoint(entry.card, 0.5);
          lightning(a, b, { color, jag: 1.4, forks: 1, width: 0.9, duration: 380 });
          stormSparks(a, 6);
          stormSparks(b, 8);
          shocked(entry, 2.2);
        }),
      );
    });
    await Promise.all(strikes);
    await wait(220);
  }

  // A storm cloud rolling in over the enemy row (the Chmura burzowa): two
  // rows of dark puffs gathering from both sides, the sky darkening under
  // them, lit from inside now and then.
  function cloudOver(duration) {
    const foes = row('enemy');
    const reach = foes ? boxOf(foes) : { x: 0, y: 0, width: stageWidth(), height: 120 };
    const width = stageWidth();
    const left = Math.max(0, reach.x - 6);
    const across = Math.min(width, reach.x + reach.width + 6) - left;
    const top = -22;
    const height = Math.round(Math.min(96, Math.max(68, reach.y + 72)));
    const sky = stormSky(duration);
    const cloud = spark('fx-cloud', { x: left, y: top });
    cloud.style.width = `${Math.round(across)}px`;
    cloud.style.height = `${height}px`;
    // The back row higher and lighter, the front row lower and darker.
    // (As many as the cloud is wide, so a computer's wide one stays a cloud.)
    const rows = [
      { count: Math.max(7, Math.round(across / 50)), from: -0.12, size: 0.62, kind: 'fx-cloud-puff fx-cloud-puff--back' },
      { count: Math.max(9, Math.round(across / 40)), from: 0.2, size: 0.56, kind: 'fx-cloud-puff' },
    ];
    for (const [layer, { count, from, size: share0, kind }] of rows.entries()) {
      for (let index = 0; index < count; index++) {
        const puff = h('span', { class: kind });
        const share = (index + 0.5 + (layer ? 0 : 0.25)) / count;
        const size = height * share0 * (index % 2 ? 0.9 : 1.15) * (0.9 + ((index * 37) % 5) * 0.06);
        puff.style.left = `${(share * across - size * 0.75).toFixed(1)}px`;
        puff.style.top = `${(height * from + (index % 2 ? size * 0.12 : 0)).toFixed(1)}px`;
        puff.style.width = `${(size * 1.5).toFixed(1)}px`;
        puff.style.height = `${size.toFixed(1)}px`;
        cloud.append(puff);
        animatePuff(puff, share, across, duration, layer);
      }
    }
    const glow = h('span', { class: 'fx-cloud-glow' });
    cloud.append(glow);
    animate(cloud, [{ opacity: 1 }, { opacity: 1 }], { duration }).then(() => {
      cloud.remove();
      sky.remove();
    });
    return { cloud, glow, bottom: top + height * 0.78, left, across };
  }

  // A puff of the cloud drifting in from its side, growing, and thinning
  // away at the end.
  function animatePuff(puff, share, across, duration, layer) {
    const drift = (share < 0.5 ? -1 : 1) * across * (layer ? 0.25 : 0.18);
    animate(
      puff,
      [
        { transform: `translateX(${drift.toFixed(1)}px) scale(0.6)`, opacity: 0 },
        { transform: 'translateX(0px) scale(1)', opacity: 1, offset: 0.3 },
        { transform: `translateX(${(-drift * 0.08).toFixed(1)}px) scale(1.03)`, opacity: 1, offset: 0.8 },
        { transform: `translateX(${(-drift * 0.12).toFixed(1)}px) scale(1.05)`, opacity: 0 },
      ],
      { duration, easing: 'ease-out' },
    );
  }

  // The cloud lit from inside, as lightning goes through it.
  function rumble(sky) {
    animate(sky.glow, [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 0.3, offset: 0.3 }, { opacity: 0.8, offset: 0.42 }, { opacity: 0 }], { duration: 420 });
  }

  // 961: the Chmura burzowa: as it wakes, a storm cloud rolls in over the
  // foes and rumbles; on each of its moves after, it gathers again and
  // lightning strikes from it at every foe.
  async function stormCloud(event, look, targets) {
    if (reduced() || !particles) {
      await beams(look.color, targets);
      return;
    }
    if (targets.length === 0) {
      const sky = cloudOver(1700);
      after(520, sky.cloud, () => rumble(sky));
      after(900, sky.cloud, () => {
        rumble(sky);
        lightning({ x: sky.left + sky.across * 0.35, y: sky.bottom - 6 }, { x: sky.left + sky.across * 0.62, y: sky.bottom + 4 }, { color: look.color, jag: 1.2, forks: 1, width: 0.8, duration: 320 });
      });
      await wait(1300);
      return;
    }
    const sky = cloudOver(1250);
    after(200, sky.cloud, () => rumble(sky));
    await wait(300);
    if (!sky.cloud.isConnected) return;
    await Promise.all(
      targets.map((id, index) =>
        after(index * 100, sky.cloud, () => {
          const entry = cards.get(id);
          if (!entry) return;
          const point = figurePoint(entry.card, 0.5);
          lightning({ x: point.x + (Math.random() - 0.5) * 18, y: sky.bottom }, point, { color: look.color, forks: 1, duration: 420 });
          stormSparks(point, 8);
          shocked(entry);
          if (index === 0) flash('#c9b7ff', 0.12, 260);
        }),
      ),
    );
    await wait(260);
  }

  // Where the Kula piorunów hangs: over its archer's head, toward the
  // arena's middle.
  function orbAt(card) {
    const box = boxOf(card);
    const art = artOf(card);
    const figure = figureOf(art);
    const inward = box.x + box.width / 2 < stageWidth() / 2 ? 1 : -1;
    return { point: { x: art.x + art.width / 2 + inward * figure * 0.34, y: art.y + figure * 0.27 }, size: Math.round(Math.max(16, figure * 0.3)), figure };
  }

  // 961: the Kula piorunów wakes: sparks gather over the Władca Piorunów's
  // head into a crackling ball of lightning, which flares and hangs there
  // (arena-fx.js strikes from it).
  async function orbForm(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await aura(id, color, 1);
      return;
    }
    const { point, size, figure } = orbAt(entry.card);
    gatherTo(point, figure * 0.62, STORM, { count: 14, life: 320 });
    const ball = spark('fx-thunderorb', point, { '--fx': color, '--size': `${size}px` });
    ball.innerHTML = ORB_ARCS;
    animate(
      ball,
      [
        { transform: 'translate(-50%, -50%) scale(0)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(0)', opacity: 0, offset: 0.2 },
        { transform: 'translate(-50%, -50%) scale(1.35)', opacity: 1, offset: 0.32 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.42 },
        { transform: 'translate(-50%, -50%) translateY(-3px) scale(1.06)', opacity: 1, offset: 0.66 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.86 },
        { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0 },
      ],
      { duration: 1500, easing: 'ease-in-out' },
    ).then(() => ball.remove());
    after(330, ball, () => {
      stormSparks(point, 12);
      aura(id, color, 1);
    });
    for (const delay of [560, 820, 1060]) after(delay, ball, () => crackle(point, size * 1.1, color, 2));
    await wait(1300);
  }

  // 961: the Kula piorunów's bolt lands: it crackles over the foe.
  function zapped(event, color) {
    const entry = cards.get(event.target);
    if (!entry) return;
    if (reduced() || !particles) {
      burst(event.target, color, 60);
      return;
    }
    const point = centerOf(entry.card);
    crackle(point, figureOf(artOf(entry.card)) * 0.45, color, 4);
    stormSparks(point, 12);
    burst(event.target, '#ece6ff', 70);
    shocked(entry, 2);
  }

  // 961: the Znak gromu: the Wybraniec Peruna draws the sign of thunder in
  // the air over its card, stroke after stroke; it flares and crackles,
  // and its lightning runs to every card of the party, whose blows it
  // charges.
  async function thunderSign(id, color) {
    const entry = cards.get(id);
    if (!entry) return;
    if (reduced() || !particles) {
      await Promise.all([ring(id, color, 130, 760), aura(id, color, 2)]);
      return;
    }
    const box = boxOf(entry.card);
    const art = artOf(entry.card);
    const figure = figureOf(art);
    const width = stageWidth();
    const point = { x: art.x + art.width / 2, y: art.y + art.height * 0.5 };
    const size = Math.round(Math.min(box.width * 0.96, figure * 1.2, (Math.min(point.x, width - point.x) - 2) * 2, point.y * 2 - 4));
    const sign = spark('fx-sign', point, { '--fx': color, '--size': `${size}px` });
    sign.innerHTML = THUNDER_SIGN;
    sign.querySelectorAll('.fx-sign-stroke').forEach((stroke, index) => {
      stroke.setAttribute('stroke-dasharray', '100 100');
      stroke.setAttribute('stroke-dashoffset', '100');
      animate(stroke, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duration: 220, delay: 60 + index * 75, easing: 'ease-in-out', fill: 'both' });
    });
    const at = (scale, turn = 0) => `translate(-50%, -50%) scale(${scale}) rotate(${turn}deg)`;
    animate(
      sign,
      [
        { transform: at(0.94, -10), opacity: 1 },
        { transform: at(1, 0), opacity: 1, offset: 0.5 },
        { transform: at(1.12), opacity: 1, offset: 0.58, easing: 'ease-out' },
        { transform: at(1), opacity: 0.95, offset: 0.7 },
        { transform: at(1.02), opacity: 0.9, offset: 0.84 },
        { transform: at(1.08), opacity: 0 },
      ],
      { duration: 1550, easing: 'ease-in-out' },
    ).then(() => sign.remove());
    // Drawn: it flares, crackles at its petals' tips, and its lightning
    // runs to the party.
    after(800, sign, () => {
      flash(color, 0.14, 320);
      animate(sign, [{ filter: 'brightness(1.8)' }, { filter: 'brightness(1)' }], { duration: 420, easing: 'ease-out' });
      const reach = size * 0.43;
      for (let k = 0; k < 6; k++) {
        const angle = ((k * 60 - 90) * Math.PI) / 180;
        const tip = { x: point.x + Math.cos(angle) * reach, y: point.y + Math.sin(angle) * reach };
        if (k % 2 === 0) crackle(tip, size * 0.16, color, 1, k * 20);
      }
      stormSparks(point, 14);
      for (const ally of cards.values()) {
        if (ally.unit.side !== entry.unit.side || ally.card.classList.contains('unit--down') || !ally.card.isConnected) continue;
        if (ally !== entry) lightning(point, figurePoint(ally.card, 0.5), { color, jag: 0.9, forks: 0, width: 0.8, duration: 360 });
        aura(ally.unit.id, color, 1);
      }
    });
    await wait(1400);
  }

  // What plays when a skill wakes (a 'skill' event), or when a sweep starts:
  // the skill's own sound, or a plain one while it has none.
  async function cast(event) {
    const look = lookOf(event);
    playSkill(artChain(event.skill), look.cast === 'sweep' ? 'swing' : look.cast === 'rain' ? 'shot' : 'magic');
    callout(event.actor, event.skillName, look.color);
    const targets = event.targets ?? [];
    // 961: a stance that wakes a creature of its own (the Sokół's falcon,
    // the Kula piorunów), and the Namierzenie's sight on its foe.
    if (look.wake && !event.targets) {
      await (look.wake === 'falcon' ? falconCall(event.actor, look.color) : orbForm(event.actor, look.color));
      await wait(120);
      return;
    }
    if (look.lock && targets.length > 0) {
      await lockOn(event, look.color);
      await wait(120);
      return;
    }
    switch (look.cast) {
      case 'sweep':
        await (look.crescent ? crescent(look.color, targets) : arc(look.color));
        break;
      case 'frost':
        if (look.icefall) await icefall(event, look.color, targets);
        else if (look.snowstorm) await snowstorm(event, look.color, targets);
        else await (look.blizzard ? blizzard(event, look.color, targets) : gust(look.color, targets));
        break;
      case 'holy':
        if (look.cloud) await stormCloud(event, look, targets);
        else await (look.braid ? braid(event, look.color, targets) : look.runes ? exorcise(look.color, targets) : beams(look.color, targets));
        break;
      case 'rain':
        if (look.storm) await storm(event, look, targets);
        else await (look.meteors ? meteors(event, look, targets) : look.volley ? volley(event, look.color, targets) : rain(look.color, targets));
        break;
      case 'bless':
        if (look.arrival && event.kind === 'summon') await (HUNT_CALLS.has(look.arrival) ? huntCall(event, look) : summonCreature(event, look));
        else if (look.harmony) await harmony(event.actor, look.color);
        else if (look.focus) await steady(event.actor, look.color);
        else if (look.rune) await thunderSign(event.actor, look.color);
        else await (look.halo ? halo(event.actor, look.color) : Promise.all([ring(event.actor, look.color, 130, 760), aura(event.actor, look.color, 2)]));
        break;
      case 'poison':
        await (look.venom ? venom(event.actor, look.color) : Promise.all([specks(event.actor, look.color, { rise: false }), aura(event.actor, look.color, 1)]));
        break;
      case 'shield':
        if (look.mirror) await mirror(event.actor, look.color);
        else if (look.orbit) await elementRing(event.actor, look.color);
        else if (look.icearmor) await iceArmor(event.actor, look.color);
        else await (look.hexwall ? hexShield(event.actor, look.color) : bubble(event.actor, look.color));
        break;
      case 'dance':
        await (look.afterimages ? dance(event.actor, look.color) : ghosts(event.actor, look.color));
        break;
      default:
        await aura(event.actor, look.color, 1);
    }
    await wait(120);
  }

  // A heal: green sparks and the HP that came back. A guard instead flashes
  // round the whole card, with the armour it gives. A heal that goes on for
  // a few moves (a psalm) heals quietly, without its name each time.
  async function heal(event) {
    const look = lookOf(event);
    if (!event.quiet) {
      playSkill(artChain(event.skill), 'effect');
      callout(event.actor, event.skillName, look.color);
    }
    // The Modlitwa o zdrowie's new look brings the HP back as its light
    // lands.
    if (look.lightfall && !reduced() && particles) {
      await lightfall(event, look.color);
      return;
    }
    kit.setHp(event.target, event.hp);
    kit.float(event.target, `+${event.amount}`, 'heal');
    if (look.cast === 'guard') {
      if (event.armor) kit.float(event.target, t('pancerz +{armor}%', { armor: event.armor }), 'guard', 380);
      await (look.emblem ? emblem(event.target, look.color) : flashAround(event.target, look.color));
      return;
    }
    await Promise.all([specks(event.target, '#a7c47f'), aura(event.target, look.color, 1)]);
  }

  // Before a skill's own blow travels: its sound and name, and a mark on the
  // target.
  function before(event) {
    const look = lookOf(event);
    playSkill(artChain(event.skill));
    callout(event.actor, event.skillName, look.color);
    // 961: the Strzał w serce's beating heart, the Mistrzowski strzał's
    // line through the formation, the Strzał z ukrycia's hiding.
    if (look.heart) heartMark(event.target, look.color);
    else if (look.sightline) sightline(event, look.color);
    else if (look.hidden) hide(event);
    else if (look.reticle) reticle(event.target, look.color);
    else if (look.impact === 'aim') ring(event.target, look.color, 70, 420);
    if (look.orb === 'fire') gather(event.actor);
    if (look.orb === 'ice-star' || look.orb === 'ice-lance') forge(event, look.orb);
    if (look.smoke) vanish(event);
  }

  // When a skill's own blow lands, on top of the plain hit.
  function impact(event) {
    const look = lookOf(event);
    // 961: the evolved Łucznik's blows. (A wolf's bite is drawn with its
    // blow, arena-fx.js.)
    if (look.orb === 'bite') return;
    if (look.barbs) barbs(event, look.color);
    else if (look.orb === 'harpoon') harpooned(event, look.color);
    else if (look.orb === 'falcon') peck(event, look.color);
    else if (look.orb === 'eagle') talons(event, look.color);
    else if (look.orb === 'thunder-orb') zapped(event, look.color);
    else if (look.through) throughShot(event, look);
    else if (look.orb === 'ambush') ambushHit(event, look.color);
    if (look.barbs || look.through || ['harpoon', 'falcon', 'eagle', 'thunder-orb', 'ambush'].includes(look.orb)) return;
    if (look.orb === 'ice-star') {
      starBreak(event, look.color);
    } else if (look.orb === 'ice-lance') {
      lanceBreak(event, look.color);
    } else if (look.tomb) {
      tomb(event, look.color);
    } else if (look.quake) {
      burst(event.target, look.color, 90);
      quake(event.target, look.color);
    } else if (look.impact === 'heavy') {
      burst(event.target, look.color, 90);
      ring(event.target, look.color, 110, 420);
    } else if (look.orb === 'fire') {
      explode(event.target);
      if (look.splash) splash(event);
    } else if (look.reticle) {
      pierce(event, look.color);
      burst(event.target, look.color, 60);
    } else if (look.pinned) {
      pin(event, look.color);
      burst(event.target, look.color, 60);
    } else if (look.impact === 'fire') {
      burst(event.target, look.color, 100);
      specks(event.target, look.color, { count: 6 });
    } else if (look.smoke && !reduced() && particles) {
      shadowCut(event, look.color);
    } else if (look.impact === 'shadow') {
      burst(event.target, look.color, 80);
    } else {
      burst(event.target, look.color, 60);
    }
  }

  // A pinned or slowed foe shows it on its card.
  function status(id, text) {
    const entry = cards.get(id);
    if (entry) entry.status.textContent = text;
  }

  return { cast, heal, before, impact, status, ring, callout };
}

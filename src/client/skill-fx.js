// How skills look in a fight's playback (arena.js): the skill's name pops up
// over its user, a sweep crosses the whole enemy row before its blows land
// (a blade's arc, an icy gust, columns of holy light, falling arrows),
// a skill blow lands with its own impact (a heavy crack, a fiery burst, a
// strike out of the shadows), a heal rises in green sparks, and a blessing,
// a shield or a dance of shadows wraps the character in its aura. Each skill
// has a look below, by its id in data/skills.json.

import { artChain } from './art.js';
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

  // What plays when a skill wakes (a 'skill' event), or when a sweep starts:
  // the skill's own sound, or a plain one while it has none.
  async function cast(event) {
    const look = lookOf(event);
    playSkill(artChain(event.skill), look.cast === 'sweep' ? 'swing' : look.cast === 'rain' ? 'shot' : 'magic');
    callout(event.actor, event.skillName, look.color);
    const targets = event.targets ?? [];
    switch (look.cast) {
      case 'sweep':
        await (look.crescent ? crescent(look.color, targets) : arc(look.color));
        break;
      case 'frost':
        await (look.blizzard ? blizzard(event, look.color, targets) : gust(look.color, targets));
        break;
      case 'holy':
        await beams(look.color, targets);
        break;
      case 'rain':
        await (look.volley ? volley(event, look.color, targets) : rain(look.color, targets));
        break;
      case 'bless':
        await Promise.all([ring(event.actor, look.color, 130, 760), aura(event.actor, look.color, 2)]);
        break;
      case 'poison':
        await Promise.all([specks(event.actor, look.color, { rise: false }), aura(event.actor, look.color, 1)]);
        break;
      case 'shield':
        await (look.hexwall ? hexShield(event.actor, look.color) : bubble(event.actor, look.color));
        break;
      case 'dance':
        await ghosts(event.actor, look.color);
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
    if (look.reticle) reticle(event.target, look.color);
    else if (look.impact === 'aim') ring(event.target, look.color, 70, 420);
    if (look.orb === 'fire') gather(event.actor);
  }

  // When a skill's own blow lands, on top of the plain hit.
  function impact(event) {
    const look = lookOf(event);
    if (look.quake) {
      burst(event.target, look.color, 90);
      quake(event.target, look.color);
    } else if (look.impact === 'heavy') {
      burst(event.target, look.color, 90);
      ring(event.target, look.color, 110, 420);
    } else if (look.orb === 'fire') {
      explode(event.target);
    } else if (look.reticle) {
      pierce(event, look.color);
      burst(event.target, look.color, 60);
    } else if (look.pinned) {
      pin(event, look.color);
      burst(event.target, look.color, 60);
    } else if (look.impact === 'fire') {
      burst(event.target, look.color, 100);
      specks(event.target, look.color, { count: 6 });
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

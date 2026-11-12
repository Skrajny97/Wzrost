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
// animation helpers, so every animation here can be cancelled with the rest.
export function skillEffects(kit) {
  const { animate, centerOf, cards, fx, row, reduced, wait } = kit;

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
    const box = entry.card.getBoundingClientRect();
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
    const frame = kit.arena.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    const clip = spark('fx-clip', { x: box.left - frame.left, y: box.top - frame.top });
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
        const box = entry.card.getBoundingClientRect();
        const frame = kit.arena.getBoundingClientRect();
        copy.style.left = `${box.left - frame.left}px`;
        copy.style.top = `${box.top - frame.top}px`;
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

  // What plays when a skill wakes (a 'skill' event), or when a sweep starts:
  // the skill's own sound, or a plain one while it has none.
  async function cast(event) {
    const look = lookOf(event);
    playSkill(artChain(event.skill), look.cast === 'sweep' ? 'swing' : look.cast === 'rain' ? 'shot' : 'magic');
    callout(event.actor, event.skillName, look.color);
    const targets = event.targets ?? [];
    switch (look.cast) {
      case 'sweep':
        await arc(look.color);
        break;
      case 'frost':
        await gust(look.color, targets);
        break;
      case 'holy':
        await beams(look.color, targets);
        break;
      case 'rain':
        await rain(look.color, targets);
        break;
      case 'bless':
        await Promise.all([ring(event.actor, look.color, 130, 760), aura(event.actor, look.color, 2)]);
        break;
      case 'poison':
        await Promise.all([specks(event.actor, look.color, { rise: false }), aura(event.actor, look.color, 1)]);
        break;
      case 'shield':
        await bubble(event.actor, look.color);
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
      await flashAround(event.target, look.color);
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
    if (look.impact === 'aim') ring(event.target, look.color, 70, 420);
  }

  // When a skill's own blow lands, on top of the plain hit.
  function impact(event) {
    const look = lookOf(event);
    if (look.impact === 'heavy') {
      burst(event.target, look.color, 90);
      ring(event.target, look.color, 110, 420);
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

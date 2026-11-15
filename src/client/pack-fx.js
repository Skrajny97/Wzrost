// The opening of Szczęsny's card pack, like a booster's (15.11.2026; the
// author: „niech to będzie coś à la boostery w Pokemonach i też trzeba
// zrobić jakąś animację ich otwierania”). Over the page, on the Salon's
// picture: the sealed pack drops onto the table and trembles, its top tears
// off with a burst of light, the three cards rise out of it face down and
// fan out in a row, then turn face up one by one, each with a flash, a ring
// and sparks in its rarity's colour, more of them the rarer it is. A
// legendary, mythic or divine card first trembles and glows, then turns
// with rays behind it and its aura. The last card waits a beat longer, as a
// booster's rare one. Under each card „nowa” (new in the collection) or
// „+1 poziom”. A tap ends the motion at once, and „Dalej” closes the scene.
// With the game's animations off it never plays: cards.js shows the cards
// at once.

import { placeArt } from './art.js';
import { createRun, createSparks } from './cards-fx.js';
import { h } from './dom.js';
import { t } from './i18n.js';
import { playSound } from './sound.js';

const RARITIES = ['common', 'rare', 'unique', 'epic', 'legendary', 'mythic', 'divine'];
// Sparks at a card's turn, by its rarity's place among RARITIES.
const SPARKS = [0, 8, 14, 24, 34, 40, 48];
const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const EASE_IN = 'cubic-bezier(0.5, 0, 0.75, 0)';
const DROP = 'cubic-bezier(0.3, 1.3, 0.5, 1)';
const centre = (box) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });

/**
 * The scene of the pack's opening, over the page.
 * @param {Array<Record<string, any>>} cards the cards as the server gives them (cardView), with `fresh`
 * @param {{ face: (card: Record<string, any>) => HTMLElement, words: string, summary: string, onClose: () => void }} options
 */
export function openPack(cards, { face, words, summary, onClose }) {
  const run = createRun();
  let over = false;
  const top = h('span', { class: 'pfx-pack-top' });
  const slit = h('span', { class: 'pfx-slit' });
  const pack = h('div', { class: 'pfx-pack', 'aria-hidden': 'true' }, h('span', { class: 'pfx-pack-body' }), top, slit);
  const glow = h('span', { class: 'pfx-glow', 'aria-hidden': 'true' });
  const slots = cards.map((card) => {
    const back = h('span', { class: 'pfx-back' });
    const front = face(card);
    front.classList.add('pfx-front');
    const body = h('div', { class: 'pfx-card' }, h('span', { class: 'pfx-charge' }), back, front);
    const rays = h('span', { class: 'pfx-rays', 'aria-hidden': 'true' });
    const flash = h('span', { class: 'pfx-flash', 'aria-hidden': 'true' });
    const ring = h('span', { class: 'pfx-ring', 'aria-hidden': 'true' });
    const tag = h('span', { class: `pfx-tag${card.fresh ? ' pfx-tag--new' : ''}`, text: card.fresh ? t('nowa') : t('+1 poziom') });
    const rank = Math.max(0, RARITIES.indexOf(card.rarity));
    // A legendary, mythic or divine card keeps a soft glow once turned.
    const slot = h('div', { class: `pfx-slot${rank >= 4 ? ' pfx-slot--shiny' : ''}` }, rays, flash, ring, body, tag);
    slot.style.setProperty('--rarity', card.color ?? '#f2c14e');
    return { card, slot, body, back, front, rays, flash, ring, tag, rank };
  });
  const row = h('div', { class: 'pfx-row' }, slots.map((one) => one.slot));
  const next = h('button', { type: 'button', class: 'button button--system', text: t('Dalej'), onClick: () => close() });
  const done = h('div', { class: 'pfx-done' }, h('p', { class: 'pfx-summary', text: summary }), next);
  const hint = h('p', { class: 'pfx-hint', text: t('Dotknij, aby pominąć.') });
  const root = h(
    'div',
    { class: 'pfx', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('Pakiet kart') },
    h('div', { class: 'pfx-head' }, h('h2', { class: 'pfx-title', text: t('Pakiet kart') }), h('p', { class: 'pfx-words', text: words })),
    h('div', { class: 'pfx-stage' }, glow, pack, row),
    h('div', { class: 'pfx-foot' }, hint, done),
  );
  const art = placeArt('casino-hall');
  if (art) root.style.setProperty('--pfx-art', `url("${art}")`);
  const sparks = createSparks(root);
  document.body.append(root);

  // A tap (or a key) during the motion ends it at once.
  const skip = (event) => {
    if (over || event.target.closest?.('.pfx-done')) return;
    event.preventDefault();
    run.skip();
    settle();
  };
  root.addEventListener('pointerdown', skip);
  const onKey = (event) => {
    if (event.key === 'Escape' && over) close();
    else if (!over && (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ')) skip(event);
  };
  document.addEventListener('keydown', onKey);

  // The scene as it ends: the pack gone, every card turned, the words and
  // „Dalej” in sight.
  function settle() {
    if (over) return;
    over = true;
    for (const element of root.querySelectorAll('*')) for (const animation of element.getAnimations?.() ?? []) animation.cancel();
    root.classList.add('pfx--end');
    next.focus({ preventScroll: true });
  }

  function close() {
    run.skip();
    sparks.stop();
    document.removeEventListener('keydown', onKey);
    root.remove();
    onClose?.();
  }

  // One card turns: the rarer it is, the more it shines.
  async function turn(one, last) {
    const { rank } = one;
    const color = one.card.color ?? '#f2c14e';
    // A legendary, mythic or divine card (and a little the last one) first
    // trembles and glows.
    if (rank >= 4 || last) {
      const long = rank >= 4 ? 760 : 360;
      const charge = one.body.querySelector('.pfx-charge');
      run.animate(charge, [{ opacity: 0, transform: 'scale(0.9)' }, { opacity: 1, transform: 'scale(1.12)' }], { duration: long, easing: 'ease-in', fill: 'forwards' });
      await run.all([
        run.animate(
          one.body,
          Array.from({ length: 9 }, (_, index) => ({ transform: index === 0 || index === 8 ? 'translate(0px, 0px)' : `translate(${index % 2 ? -2 : 2}px, ${index % 3 === 0 ? 1 : -1}px) rotate(${index % 2 ? -1 : 1}deg)` })),
          { duration: long, easing: 'linear' },
        ),
      ]);
    }
    if (run.skipped) return;
    await run.all([run.animate(one.back, [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: 120, easing: EASE_IN, fill: 'forwards' })]);
    one.slot.classList.add('pfx-slot--turned');
    playSound(rank >= 4 ? 'casino-win' : rank >= 3 ? 'magic' : 'tab');
    const box = one.body.getBoundingClientRect();
    const middle = centre(box);
    if (SPARKS[rank] > 0) sparks.burst({ x: middle.x, y: middle.y, count: SPARKS[rank], colors: ['#fffaf0', color, color], spread: Math.PI, speed: [90, 240 + rank * 30], life: [380, 700 + rank * 60], sizes: [1.5, 3 + rank * 0.3], gravity: 160 });
    run.animate(one.flash, [{ opacity: 0.95, transform: 'scale(0.6)' }, { opacity: 0, transform: 'scale(1.5)' }], { duration: 420 + rank * 60, easing: EASE_OUT, fill: 'forwards' });
    if (rank >= 1) run.animate(one.ring, [{ opacity: 1, transform: 'scale(0.4)' }, { opacity: 0, transform: `scale(${1.6 + rank * 0.15})` }], { duration: 520 + rank * 40, easing: EASE_OUT, fill: 'forwards' });
    if (rank >= 4) {
      run.animate(
        one.rays,
        [
          { opacity: 0, transform: 'rotate(0deg) scale(0.6)' },
          { opacity: 1, transform: 'rotate(40deg) scale(1)', offset: 0.25 },
          { opacity: 0.85, transform: 'rotate(140deg) scale(1.05)', offset: 0.8 },
          { opacity: 0, transform: 'rotate(180deg) scale(1.1)' },
        ],
        { duration: 1800, easing: 'linear', fill: 'forwards' },
      );
    }
    await run.all([run.animate(one.front, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1.08)', offset: 0.7 }, { transform: 'scaleX(1)' }], { duration: 220, easing: EASE_OUT })]);
    run.animate(one.tag, [{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'scale(1.15)', offset: 0.6 }, { opacity: 1, transform: 'scale(1)' }], { duration: 280, easing: EASE_OUT, fill: 'forwards' });
  }

  async function play() {
    // The pack falls onto the table.
    await run.all([
      run.animate(root, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out', fill: 'forwards' }),
      run.animate(pack, [{ transform: 'translateY(-75vh) rotate(-12deg)' }, { transform: 'translateY(0px) rotate(0deg)' }], { duration: 640, easing: DROP, fill: 'forwards' }),
    ]);
    // It trembles, its light growing behind it.
    run.animate(glow, [{ opacity: 0, transform: 'scale(0.5)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 900, easing: 'ease-in', fill: 'forwards' });
    await run.all([
      run.animate(
        pack,
        [
          { transform: 'rotate(0deg) scale(1)' },
          { transform: 'rotate(-4deg) scale(1.02)' },
          { transform: 'rotate(4deg) scale(1.03)' },
          { transform: 'rotate(-5deg) scale(1.04)' },
          { transform: 'rotate(5deg) scale(1.05)' },
          { transform: 'rotate(-3deg) scale(1.05)' },
          { transform: 'rotate(0deg) scale(1.04)' },
        ],
        { duration: 820, easing: 'ease-in-out', fill: 'forwards' },
      ),
    ]);
    if (run.skipped) return settle();
    // The top tears off, and light bursts out of the pack.
    playSound('chest');
    const box = pack.getBoundingClientRect();
    const seam = { x: box.left + box.width / 2, y: box.top + box.height * 0.17 };
    sparks.burst({ x: seam.x, y: seam.y, count: 46, colors: ['#ffffff', '#fff3c4', '#9ee8ff', '#f2c14e'], angle: -Math.PI / 2, spread: Math.PI * 0.55, speed: [140, 320], life: [420, 820], sizes: [2, 4], gravity: 220 });
    await run.all([
      run.animate(top, [{ transform: 'translate(0px, 0px) rotate(0deg)', opacity: 1 }, { transform: 'translate(54px, -110px) rotate(42deg)', opacity: 0 }], { duration: 560, easing: EASE_OUT, fill: 'forwards' }),
      run.animate(slit, [{ opacity: 0, transform: 'scaleX(0.3)' }, { opacity: 1, transform: 'scaleX(1)', offset: 0.3 }, { opacity: 0.7, transform: 'scaleX(1)' }], { duration: 480, easing: EASE_OUT, fill: 'forwards' }),
    ]);
    if (run.skipped) return settle();
    // The cards rise out of the pack face down, the pack sinks away, and
    // they fan out to their places.
    const from = centre(pack.getBoundingClientRect());
    const rises = slots.map((one, index) => {
      const place = centre(one.body.getBoundingClientRect());
      const dx = from.x - place.x;
      const dy = from.y - place.y;
      const tilt = (index - (slots.length - 1) / 2) * 7;
      return run.animate(
        one.slot,
        [
          { transform: `translate(${dx}px, ${dy + 20}px) scale(0.62) rotate(0deg)`, opacity: 0 },
          { transform: `translate(${dx}px, ${dy - 70}px) scale(0.78) rotate(${tilt}deg)`, opacity: 1, offset: 0.42 },
          { transform: 'translate(0px, 0px) scale(1) rotate(0deg)', opacity: 1 },
        ],
        { duration: 820, delay: index * 130, easing: EASE_OUT, fill: 'both' },
      );
    });
    run.animate(pack, [{ transform: 'translateY(0px) scale(1.04)', opacity: 1 }, { transform: 'translateY(46px) scale(0.92)', opacity: 0 }], { duration: 520, delay: 300, easing: EASE_IN, fill: 'forwards' });
    run.animate(glow, [{ opacity: 1 }, { opacity: 0.35 }], { duration: 700, delay: 300, fill: 'forwards' });
    await run.all(rises);
    if (run.skipped) return settle();
    // They turn one by one, the last a beat later.
    for (const [index, one] of slots.entries()) {
      const last = index === slots.length - 1;
      await run.wait(last ? 560 : 300);
      if (run.skipped) return settle();
      await turn(one, last);
    }
    // The rays of a legendary, mythic or divine last card fade out first.
    await run.wait(slots.at(-1)?.rank >= 4 ? 1500 : 650);
    settle();
    run.animate(done, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0px)' }], { duration: 280, easing: EASE_OUT });
  }

  play();
  return { close };
}

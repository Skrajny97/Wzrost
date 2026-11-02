// The Sklep Systemu's look (data/cosmetics.json; src/server/cosmetics.js): a
// portrait on the background worn, in place of the forest, and in the frame
// worn, with the frame's light, on Postać, in the shop's previews and on the
// card another player sees, and the aura worn lighting the figure. In a
// frame the background and the figure stand in its window, smaller. The
// game's switch of animations stills the light (.calm in styles.css). A name
// in its frame's colour is ui.js framedName.

import { cosmeticArt, portraitSprite } from './art.js';
import { h } from './dom.js';
import { portrait } from './portraits.js';
import { state } from './state.js';

// A frame's picture: its window and the points of its light are in its pixels.
const FRAME = { width: 120, height: 160 };
const across = (x) => `${(x / FRAME.width) * 100}%`;
const down = (y) => `${(y / FRAME.height) * 100}%`;

// The fireflies' ways, in the frame's pixels, one after another.
const FLIGHTS = [[3, -4], [-4, -2], [2, 4], [-3, 3], [4, 1], [-2, -4], [3, 3], [-4, 1], [1, -3]];

// An aura's motes: where each starts, in percent of the portrait across and
// down, and its way, in percent of the portrait, one after another.
const MOTES = [
  [22, 70, 6, -10], [74, 62, -5, -12], [30, 38, -6, -8], [68, 30, 5, -9], [16, 52, 4, -14], [82, 78, -6, -10],
  [40, 84, 3, -16], [58, 18, -4, -7], [26, 22, 5, -6], [76, 46, 4, -11], [48, 92, -3, -12], [62, 70, 6, -9],
];

// A cosmetic of the data by its id, or null.
export const cosmeticOf = (id) => (id ? (state.content?.cosmetics?.items.find((item) => item.id === id) ?? null) : null);

// The look of the player's own character, as a portrait takes it.
export const characterLook = (character) => ({
  classId: character.classId,
  appearance: character.appearance,
  skin: character.skin,
  evolution: character.evolution?.current?.id,
});

// The layers of a portrait of `look` ({ classId, appearance, skin,
// evolution }): the forest, or the background worn, with the figure over it,
// lit by the aura worn; with a frame worn, these two in its window and the
// frame over them.
export function portraitLayers(look, { frame = null, background = null, aura = null } = {}) {
  const figure = portraitSprite(look.classId, look.appearance, { skin: look.skin, evolution: look.evolution });
  const back = cosmeticArt(cosmeticOf(background)?.art);
  // A look without its figure keeps the drawn stand-in, with its own forest.
  const scenery = !figure
    ? portrait(look.classId)
    : back
      ? h('img', { src: back, alt: '', class: 'sprite portrait-background', decoding: 'async', draggable: 'false' })
      : portrait(look.classId, { figure: false });
  // The forest covers a frame's window, narrower than the portrait.
  if (scenery instanceof SVGElement) scenery.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  const art = h('div', { class: 'portrait-art' }, scenery, figure);
  const lit = cosmeticOf(aura)?.aura;
  if (figure && lit) light(art, figure, lit);
  const framed = cosmeticOf(frame);
  const layer = framed && frameLayer(framed);
  if (!layer) return [art];
  // The window, a pixel of the frame further on each side, so no seam shows.
  const [left, top, right, bottom] = framed.window;
  Object.assign(art.style, { left: across(left - 1), top: down(top - 1), right: across(FRAME.width - right - 2), bottom: down(FRAME.height - bottom - 2) });
  return [art, layer];
}

// A portrait in a box of its own, 3:4, its width from `className`: a
// preview in the shop, the card another player sees.
export function portraitBox(look, worn, className) {
  const layers = portraitLayers(look, worn);
  return h('div', { class: `portrait-box ${className}${layers.length > 1 ? ' portrait-box--framed' : ''}`, 'aria-hidden': 'true' }, layers);
}

// The frame over the portrait, and its light (effect.kind): a band sweeping
// across the gold now and then, and glints on its rubies as it passes
// (shine); a pulsing glow and a line of light running down it (pulse);
// fireflies drifting and blinking about it (fireflies). The band and the
// line light only the frame's own pixels.
function frameLayer(item) {
  const src = cosmeticArt(item.art);
  if (!src) return null;
  const { kind, points = [] } = item.effect;
  const layer = h(
    'div',
    { class: `portrait-frame portrait-frame--${kind}` },
    h('img', { src, alt: '', class: 'sprite portrait-frame-art', decoding: 'async', draggable: 'false' }),
  );
  if (kind !== 'fireflies') {
    const light = h('span', { class: 'portrait-frame-light' });
    light.style.maskImage = `url("${src}")`;
    light.style.webkitMaskImage = `url("${src}")`;
    layer.append(light);
  }
  points.forEach(([x, y], index) => {
    const spark = h('span', { class: kind === 'shine' ? 'portrait-frame-glint' : 'portrait-frame-firefly' });
    spark.style.left = across(x + 0.5);
    spark.style.top = down(y + 0.5);
    if (kind === 'shine') {
      // As the band, from the left, reaches the ruby.
      spark.style.animationDelay = `${(0.2 + (x / FRAME.width) * 1.3).toFixed(2)}s`;
    } else {
      const [dx, dy] = FLIGHTS[index % FLIGHTS.length];
      spark.style.setProperty('--dx', String(dx));
      spark.style.setProperty('--dy', String(dy));
      spark.style.setProperty('--drift', `${4 + (index % 3) * 1.3}s`);
      spark.style.setProperty('--blink', `${1.8 + (index % 4) * 0.6}s`);
      spark.style.animationDelay = `${-index * 0.7}s, ${-index * 0.45}s`;
    }
    layer.append(spark);
  });
  return layer;
}

// An aura (the Sklep Systemu; the author: "416 akcept", "417 akcept"): its
// light around the figure's outline, a halo behind it that swells and fades,
// and its motes drifting about the figure (drift) or sparks rising from it
// (rise). The halo is the figure again, under it, all in the light; the game's
// switch of animations stills it all (.calm in styles.css).
export function light(art, figure, { glow, spark, sparks }) {
  art.style.setProperty('--aura-glow', glow);
  art.style.setProperty('--aura-spark', spark);
  figure.classList.add('aura-figure');
  const halo = figure.cloneNode(true);
  halo.classList.replace('aura-figure', 'aura-halo');
  figure.before(halo);
  const motes = h('div', { class: `aura-motes aura-motes--${sparks}` });
  MOTES.forEach(([x, y, dx, dy], index) => {
    const mote = h('span');
    mote.style.left = `${x}%`;
    mote.style.top = `${y}%`;
    mote.style.setProperty('--dx', `${dx}cqw`);
    mote.style.setProperty('--dy', `${sparks === 'rise' ? -14 - (index % 4) * 4 : dy}cqh`);
    mote.style.animationDelay = `${(-index * 0.53).toFixed(2)}s`;
    motes.append(mote);
  });
  art.append(motes);
}

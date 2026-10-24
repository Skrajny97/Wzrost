// Pixel-art sprites drawn with Retro Diffusion (prompts in art/prompts.json):
// one for each monster and item base listed below, in /art/<kind>/<id>.png.
// Whatever has no sprite yet keeps its line icon.

import { h } from './dom.js';

// The ids with a sprite file, and the size it was drawn at.
export const SPRITES = {
  monsters: {
    size: 48,
    ids: ['wolf', 'alpha-wolf', 'fox', 'lynx', 'bear', 'boar', 'badger', 'crow', 'owl', 'viper', 'spider', 'wisp', 'likho'],
  },
  items: {
    size: 32,
    ids: ['sword', 'axe', 'dagger', 'bow', 'staff', 'aspergillum', 'shield', 'quiver', 'focus', 'hood', 'helmet', 'tunic', 'chainmail', 'robe', 'gloves', 'boots', 'amulet', 'ring', 'talisman'],
  },
};

const available = Object.fromEntries(Object.entries(SPRITES).map(([kind, { ids }]) => [kind, new Set(ids)]));

function sprite(kind, id, className) {
  if (!available[kind].has(id)) return null;
  const { size } = SPRITES[kind];
  return h('img', {
    src: `/art/${kind}/${id}.png`,
    alt: '',
    width: size,
    height: size,
    class: `sprite ${className}`,
    decoding: 'async',
    draggable: 'false',
  });
}

export const monsterSprite = (monsterId) => sprite('monsters', monsterId, 'sprite--monster');
export const itemSprite = (item) => sprite('items', item.base, 'sprite--item');

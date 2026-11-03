// On a computer (477 A): the item under the mouse in a small card beside it,
// with its properties and what wearing it changes, without a click. The
// tiles of the bag and of the worn items carry their item (itemTip); the
// card's look comes from the Postać screen (setTipRenderer), which knows how
// an item is shown.

import { h } from './dom.js';
import { desktopLayout } from './layout-mode.js';

const items = new WeakMap();
let card = null;
let shownFor = null;
let render = null;

export function itemTip(element, item) {
  items.set(element, item);
  element.dataset.tip = '';
  return element;
}

export function setTipRenderer(renderer) {
  render = renderer;
}

function hide() {
  if (card) card.hidden = true;
  shownFor = null;
}

// Beside the tile, on the right where it fits, else on the left; never past
// the window's edges.
function show(element) {
  const item = items.get(element);
  if (!item || !render) return;
  if (!card) {
    card = h('div', { class: 'item-tip', role: 'tooltip', hidden: true });
    document.body.append(card);
  }
  card.replaceChildren(render(item));
  card.hidden = false;
  const box = element.getBoundingClientRect();
  const { offsetWidth: width, offsetHeight: height } = card;
  const left = box.right + 12 + width <= window.innerWidth - 8 ? box.right + 12 : box.left - 12 - width;
  card.style.left = `${Math.max(8, left)}px`;
  card.style.top = `${Math.max(8, Math.min(box.top, window.innerHeight - height - 8))}px`;
  shownFor = element;
}

document.addEventListener('mouseover', (event) => {
  const element = desktopLayout() && event.target instanceof Element ? event.target.closest('[data-tip]') : null;
  if (element === shownFor) return;
  if (element && items.has(element)) show(element);
  else hide();
});
// A click, a key or a scroll puts the card away.
for (const type of ['click', 'keydown', 'scroll']) document.addEventListener(type, hide, true);

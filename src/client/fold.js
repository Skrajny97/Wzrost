// A group of a long list that folds under its heading (a player through
// the author, 28.11.2026: „żeby można było zwijać materiały w tradzie i w
// skrzyni i tak samo karty w tradzie”, „Bo jak masz tego dużo to musisz
// dużo przewijać”, „Tak jak i zwinięcie materiałów na stole rozbiórki na
// podgrupy”): the Wymiana's offer, the Skrzynia konta's goods and the Stół
// rozbiórki's materials by rarity. The heading's whole line is the button,
// with how many rows are under it and the caret. A group is open until the
// player folds it, and stays as they left it on this device.

import { h } from './dom.js';
import { formatNumber } from './format.js';

const KEY = 'insight-folded';
let folded = new Set();
try {
  const kept = JSON.parse(localStorage.getItem(KEY) ?? '[]');
  if (Array.isArray(kept)) folded = new Set(kept.filter((id) => typeof id === 'string'));
} catch {
  // Without storage every group starts open.
}

function keep() {
  try {
    localStorage.setItem(KEY, JSON.stringify([...folded]));
  } catch {
    // Kept while the page is open.
  }
}

let made = 0;

// `id` names the group for its fold ("trade-material"), `title` is its
// heading, `count` how many rows it holds, `children` the rows.
export function foldGroup(id, title, count, ...children) {
  const bodyId = `fold-${(made += 1)}`;
  const open = !folded.has(id);
  const body = h('div', { class: 'fold-body', id: bodyId, hidden: !open }, children);
  const toggle = h(
    'button',
    {
      type: 'button',
      class: 'fold-toggle',
      'aria-expanded': String(open),
      'aria-controls': bodyId,
      onClick: () => {
        const opening = body.hidden;
        body.hidden = !opening;
        toggle.setAttribute('aria-expanded', String(opening));
        if (opening) folded.delete(id);
        else folded.add(id);
        keep();
      },
    },
    h('span', { class: 'fold-title', text: title }),
    h('span', { class: 'fold-count', text: `(${formatNumber(count)})` }),
    h('span', { class: 'fold-caret', 'aria-hidden': 'true' }),
  );
  return h('div', { class: 'fold' }, h('h3', { class: 'profile-section fold-head' }, toggle), body);
}

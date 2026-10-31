// The bonuses at work now: the potions for a time and the strengthenings of
// events, such as the blue mushroom's (characters.js on the server gives
// them by kind; two of one kind make one bonus). Each with what it does and
// the time of explorations it has left, above the character on Postać and
// before "Wyrusz" (the author: "powinny byc bonusy przed wyprawą napisane
// gdzieś i w oknie postaci, najlepiej nad postacią jakie aktualne są
// obecne").

import { potionSprite } from './art.js';
import { h, icon } from './dom.js';
import { formatMinutes } from './format.js';
import { serverNow } from './state.js';

// What a bonus has left now: its own time and, of an exploration under way,
// what is still ahead of it. The time passes only on explorations.
const timeLeft = (buff, now) => buff.ms + Math.max(0, (buff.until ?? 0) - now);

export const activeBuffs = (character, now = serverNow()) =>
  (character?.buffs ?? []).map((buff) => ({ ...buff, left: timeLeft(buff, now) })).filter((buff) => buff.left > 0);

const leftText = (left) => `jeszcze ${formatMinutes(Math.ceil(left / 60000))} wypraw`;

// The list, or null while no bonus works. A bonus's words are its name, a
// colon and what it does (data/professions.json, buffLabels).
export function bonusList(character) {
  const buffs = activeBuffs(character);
  if (buffs.length === 0) return null;
  return h(
    'section',
    { class: 'bonus-list', 'aria-label': 'Aktywne bonusy' },
    h('h2', { class: 'bonus-title', text: 'Aktywne bonusy' }),
    h(
      'ul',
      { class: 'bonus-rows' },
      buffs.map((buff) => {
        const [name, effect] = buff.label.split(/: (.*)/s);
        return h(
          'li',
          { class: 'bonus-row' },
          h('span', { class: 'bonus-art', 'aria-hidden': 'true' }, potionSprite(buff.potion) ?? icon(buff.kind === 'curse' ? 'spirit' : 'flask', { size: 24 })),
          h(
            'span',
            { class: 'bonus-text' },
            h('span', { class: 'bonus-name' }, h('strong', { text: name }), effect && `: ${effect}`),
            h('span', { class: 'bonus-left', 'data-buff': buff.kind, text: leftText(buff.left) }),
          ),
        );
      }),
    ),
  );
}

// Every second with the top bar: the times shown run down on an exploration.
export function updateBonusTimes(character, now) {
  for (const element of document.querySelectorAll('.bonus-left[data-buff]')) {
    const buff = character.buffs?.find((one) => one.kind === element.dataset.buff);
    if (buff) element.textContent = leftText(timeLeft(buff, now));
  }
}

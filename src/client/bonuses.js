// The bonuses at work now: the strengthening potions and the strengthenings
// of events, such as the blue mushroom's (characters.js on the server gives
// them by kind; two of one kind make one bonus). Each with what it does and
// the fights of explorations it has left, above the character on Postać and
// before "Wyrusz" (the author: "powinny byc bonusy przed wyprawą napisane
// gdzieś i w oknie postaci, najlepiej nad postacią jakie aktualne są
// obecne"; "2 mikstury -> 4 walki i tak będziemy to wyświetlać i opisywać,
// wszędzie").

import { potionSprite } from './art.js';
import { h, icon } from './dom.js';
import { countOf } from './format.js';
import { t } from './i18n.js';

// The fights a bonus has left: they go when a report is claimed
// (characters.js), so they stay as they are on an exploration.
export const activeBuffs = (character) => (character?.buffs ?? []).filter((buff) => buff.fights > 0);

// "4 walki", "1 walka".
export const fightsLeft = (fights) => countOf(fights, 'walka', 'walki', 'walk');

const leftText = (fights) => t('jeszcze {fights}', { fights: fightsLeft(fights) });

// The list, or null while no bonus works. A bonus's words are its name, a
// colon and what it does (data/professions.json, buffLabels).
export function bonusList(character) {
  const buffs = activeBuffs(character);
  if (buffs.length === 0) return null;
  return h(
    'section',
    { class: 'bonus-list', 'aria-label': t('Aktywne bonusy') },
    h('h2', { class: 'bonus-title', text: t('Aktywne bonusy') }),
    h(
      'ul',
      { class: 'bonus-rows' },
      buffs.map((buff) => {
        const [name, effect] = buff.label.split(/: (.*)/s);
        return h(
          'li',
          { class: 'bonus-row' },
          h('span', { class: 'bonus-art', 'aria-hidden': 'true' }, potionSprite(buff.potion) ?? icon(buff.kind === 'curse' || buff.kind === 'wounds' ? 'spirit' : 'flask', { size: 24 })),
          h(
            'span',
            { class: 'bonus-text' },
            h('span', { class: 'bonus-name' }, h('strong', { text: name }), effect && `: ${effect}`),
            h('span', { class: 'bonus-left', text: leftText(buff.fights) }),
          ),
        );
      }),
    ),
  );
}


// The bonuses at work now: the strengthening potions and the strengthenings
// of events, such as the blue mushroom's (characters.js on the server gives
// them by kind; two of one kind make one bonus). Each with what it does and
// the fights of explorations it has left, above the character on Postać and
// before "Wyrusz" (the author: "powinny byc bonusy przed wyprawą napisane
// gdzieś i w oknie postaci, najlepiej nad postacią jakie aktualne są
// obecne"; "2 mikstury -> 4 walki i tak będziemy to wyświetlać i opisywać,
// wszędzie").

import { dishSprite, potionSprite } from './art.js';
import { cultivationMark } from './cultivation.js';
import { h, icon } from './dom.js';
import { countOf, formatMinutes, formatNumber } from './format.js';
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
  // The meal at work (cooking.js; 999.5 v2), with the time of explorations
  // it still works for.
  const meal = character?.meal ?? null;
  // The Kultywacja's share more character XP from explorations, from its
  // first level on, for good (cultivation.js, 1230 A).
  const cultivation = character?.cultivation?.level > 0 ? character.cultivation : null;
  if (buffs.length === 0 && !meal && !cultivation) return null;
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
      meal &&
        h(
          'li',
          { class: 'bonus-row' },
          h('span', { class: 'bonus-art', 'aria-hidden': 'true' }, dishSprite(meal.id) ?? icon('pot', { size: 24 })),
          h(
            'span',
            { class: 'bonus-text' },
            h('span', { class: 'bonus-name' }, h('strong', { text: t('Posiłek: {dish}', { dish: meal.name }) }), `: ${meal.bonus}`),
            h('span', { class: 'bonus-left', text: t('jeszcze {time} wypraw', { time: formatMinutes(meal.left) }) }),
          ),
        ),
      cultivation &&
        h(
          'li',
          { class: 'bonus-row' },
          h('span', { class: 'bonus-art', 'aria-hidden': 'true' }, cultivationMark() ?? icon('spirit', { size: 24 })),
          h(
            'span',
            { class: 'bonus-text' },
            h(
              'span',
              { class: 'bonus-name' },
              h('strong', { text: t('Kultywacja (poziom {level})', { level: cultivation.level }) }),
              `: ${t('+{share}% XP postaci z wypraw', { share: formatNumber(Math.round(cultivation.bonus * 1000) / 10) })}`,
            ),
            h('span', { class: 'bonus-left', text: t('na stałe, bez XP klasy') }),
          ),
        ),
    ),
  );
}


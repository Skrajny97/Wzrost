// The saved decks of Talia Systemu (938, the author, 14.11.2026: „opcje
// zapisania kilku różnych talii kart do użytku za jednym kliknieciem w
// wiekszosci miejsc”; src/server/cards.js, deckSlots): a row of small card
// piles, one for each slot, numbered, each with its deck's strength under
// it, the deck in play lit. A tap on another whole deck plays it from now
// on, everywhere: at Szczęsny's, at the residents' tables, in the Arena
// (where it also defends) and in the live matches. In the Salon's tab
// (cards.js) every slot shows, and a tap on an empty one, or on one no
// longer whole, lays a deck there; elsewhere (the residents' tables, the
// Arena's Karty, the live matches' sheets) only the whole decks show, and
// only while there are two of them at least.

import { h, icon } from './dom.js';
import { formatNumber } from './format.js';
import { t } from './i18n.js';
import { playSound } from './sound.js';
import { call } from './state.js';
import { toast, withButton } from './ui.js';

// A slot in words, for a reader: „Talia 2, w grze: 4 × Siła, 4 ×
// Zręczność, 4 × Magia, siła 312”.
function slotLabel(one, active) {
  const vars = { slot: one.slot };
  if (one.whole) {
    const types = one.types.map((type) => t('{count} × {type}', { count: type.count, type: type.name })).join(', ');
    const whole = { ...vars, types, strength: formatNumber(one.strength) };
    return active ? t('Talia {slot}, w grze: {types}, siła {strength}', whole) : t('Talia {slot}: {types}, siła {strength}', whole);
  }
  if (one.cards?.length) return active ? t('Talia {slot}, w grze: niepełna', vars) : t('Talia {slot}: niepełna', vars);
  return t('Talia {slot}: pusta', vars);
}

// Plays the deck of `slot` from now on; the server's answer is the Salon's
// tab as it is then.
export async function playDeck(slot) {
  const answer = await call('POST', '/api/cards/decks/use', { slot });
  playSound('tap');
  toast(t('Grasz talią {slot}.', { slot }));
  return answer;
}

// The row, or nothing where it has nothing to choose. `decks` as the server
// tells them; `onPlay(answer)` after a tap played another deck; `onLay(slot)`
// (the Salon's tab only) for a tap on a slot without a whole deck; `label`,
// the words before the row where they are needed.
export function deckSlotsRow(decks, { onPlay, onLay = null, label = null }) {
  if (!decks) return null;
  const whole = decks.slots.filter((one) => one.whole);
  if (!onLay && whole.length < 2) return null;
  const tile = (one) => {
    const active = one.slot === decks.active;
    const state = one.whole ? 'whole' : one.cards?.length ? 'broken' : 'empty';
    return h(
      'button',
      {
        type: 'button',
        class: `deck-slot deck-slot--${state}${active ? ' deck-slot--active' : ''}`,
        'aria-pressed': String(active),
        'aria-label': slotLabel(one, active),
        onClick: (event) => {
          if (active && one.whole) return;
          if (!one.whole) {
            onLay?.(one.slot);
            return;
          }
          withButton(event.currentTarget, async () => onPlay(await playDeck(one.slot)));
        },
      },
      h(
        'span',
        { class: 'deck-slot-pile', 'aria-hidden': 'true' },
        one.whole || one.cards?.length ? h('span', { class: 'deck-slot-back' }) : icon('plus', { size: 16, className: 'deck-slot-plus' }),
        h('span', { class: 'deck-slot-number', text: String(one.slot) }),
      ),
      h(
        'span',
        { class: 'deck-slot-note', 'aria-hidden': 'true' },
        active && one.whole && icon('check', { size: 11, className: 'deck-slot-check' }),
        one.whole ? formatNumber(one.strength) : state === 'broken' ? t('niepełna') : t('pusta'),
      ),
    );
  };
  return h(
    'div',
    { class: `deck-slots${onLay ? '' : ' deck-slots--compact'}` },
    label && h('p', { class: 'deck-slots-label', text: label }),
    h('div', { class: 'deck-slots-row', role: 'group', 'aria-label': t('Zapisane talie') }, (onLay ? decks.slots : whole).map(tile)),
  );
}

// The saved decks alone, for the sheets that do not have them (the live
// matches' challenges, card-duel.js); null when the server does not answer.
export async function loadDecks() {
  try {
    return (await call('GET', '/api/cards/decks')).decks;
  } catch {
    return null;
  }
}

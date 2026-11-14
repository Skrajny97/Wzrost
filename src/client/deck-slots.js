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
//
// A deck may have its name (939, the author: „przydałoby się dać opcję
// nazywania swoich talii”): under its pile in place of its strength, on two
// lines at most, in every row; the Salon's „Nazwij” gives it one.

import { h, icon } from './dom.js';
import { formatNumber } from './format.js';
import { t } from './i18n.js';
import { playSound } from './sound.js';
import { call } from './state.js';
import { closeSheet, openSheet, toast, withButton } from './ui.js';

// A deck's title: its name, or its number.
export const deckTitle = (one) => one.name || t('Talia {slot}', { slot: one.slot });

// A slot in words, for a reader: „Talia 2, w grze: 4 × Siła, 4 ×
// Zręczność, 4 × Magia, siła 312”, its name after its number.
function slotLabel(one, active) {
  const vars = { slot: one.name ? t('{slot} „{name}”', { slot: one.slot, name: one.name }) : one.slot };
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
export async function playDeck(one) {
  const answer = await call('POST', '/api/cards/decks/use', { slot: one.slot });
  playSound('tap');
  toast(one.name ? t('Grasz talią „{name}”.', { name: one.name }) : t('Grasz talią {slot}.', { slot: one.slot }));
  return answer;
}

// „Nazwij” (939): the name of the saved deck `one` in a window, up to the
// length the server allows; an empty field leaves the deck its number.
// `onNamed(answer)` gets the server's answer (the Salon's tab as it is then).
export function nameDeckSheet(one, nameLength, onNamed) {
  const input = h('input', {
    id: 'deck-name',
    type: 'text',
    maxlength: String(nameLength),
    autocomplete: 'off',
    spellcheck: 'false',
    value: one.name ?? '',
    placeholder: t('Talia {slot}', { slot: one.slot }),
  });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const submit = h('button', { type: 'submit', class: 'button button--world', text: t('Zapisz') });
  openSheet(
    h('h2', { class: 'sheet-title', text: t('Nazwa talii {slot}', { slot: one.slot }) }),
    h(
      'form',
      {
        class: 'stack',
        onSubmit: (event) => {
          event.preventDefault();
          error.hidden = true;
          withButton(submit, async () => {
            try {
              const answer = await call('POST', '/api/cards/decks/name', { slot: one.slot, name: input.value });
              closeSheet();
              toast(t('Zapisano nazwę talii.'));
              onNamed(answer);
            } catch (failure) {
              error.textContent = failure.message;
              error.hidden = false;
            }
          });
        },
      },
      h('div', { class: 'field' }, h('label', { for: 'deck-name', text: t('Nazwa') }), input),
      h('p', { class: 'muted', text: t('Do {count} znaków. Bez nazwy talia ma sam numer.', { count: nameLength }) }),
      error,
      h('div', { class: 'sheet-actions' }, submit, h('button', { type: 'button', class: 'button button--system', text: t('Anuluj'), onClick: closeSheet })),
    ),
  );
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
          withButton(event.currentTarget, async () => onPlay(await playDeck(one)));
        },
      },
      h(
        'span',
        { class: 'deck-slot-pile', 'aria-hidden': 'true' },
        one.whole || one.cards?.length ? h('span', { class: 'deck-slot-back' }) : icon('plus', { size: 16, className: 'deck-slot-plus' }),
        h('span', { class: 'deck-slot-number', text: String(one.slot) }),
        // The deck in play: a tick on its pile's corner (939; before, by its
        // strength, where a name has no room for it).
        active && one.whole && h('span', { class: 'deck-slot-tick' }, icon('check', { size: 10 })),
      ),
      h(
        'span',
        { class: one.name ? 'deck-slot-note deck-slot-note--name' : 'deck-slot-note', 'aria-hidden': 'true' },
        h('span', { class: 'deck-slot-note-text', text: one.name || (one.whole ? formatNumber(one.strength) : state === 'broken' ? t('niepełna') : t('pusta')) }),
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

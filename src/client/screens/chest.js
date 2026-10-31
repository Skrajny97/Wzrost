// The Skrzynia Konta in the camp (src/server/chest.js): the few items all the
// account's characters share, each with "Wyjmij", and the bag below with
// "Włóż". At home only, as every change of the bag. An item from another
// character is worn from its own level and the Encyklopedia leaves it out,
// as one from a Wymiana.

import { materialSprite } from '../art.js';
import { fill, h, icon } from '../dom.js';
import { countOf } from '../format.js';
import { call, state } from '../state.js';
import { systemPanel, toast, withButton } from '../ui.js';
import { itemSheet, itemSummary } from './character.js';

// `onBack` leads back to the camp's board.
export function mountChest(container, onBack) {
  let chest = null;

  async function load() {
    try {
      ({ chest } = await call('GET', '/api/chest'));
      render();
    } catch (error) {
      toast(error.message);
    }
  }

  const act = (path, body, done) => (event) =>
    withButton(event.currentTarget, async () => {
      ({ chest } = await call('POST', path, body));
      toast(done);
      render();
    });

  function render() {
    const character = state.character;
    const room = chest ? chest.slots - chest.items.length : 0;
    fill(
      container,
      h(
        'div',
        { class: 'page-heading page-heading--back' },
        h(
          'div',
          { class: 'page-heading-text' },
          h('h1', { class: 'page-title', tabindex: '-1', text: 'Skrzynia Konta' }),
          h('p', { class: 'page-subtitle', text: 'Wspólna dla postaci na koncie' }),
        ),
        h('button', { type: 'button', class: 'button button--system back-button', onClick: onBack }, icon('back', { size: 20 }), 'Powrót'),
      ),
      systemPanel(
        `Skrzynia Konta mieści ${chest ? countOf(chest.slots, 'przedmiot', 'przedmioty', 'przedmiotów') : '…'} i jest wspólna dla wszystkich postaci na tym koncie.`,
        // The author's words: "Encyklopedia nie zaliczy przedmiotu: [...]".
        'Encyklopedia nie zaliczy przedmiotu: liczy się tylko to, co postać sama zdobędzie albo wytworzy.',
      ),
      chest &&
        h(
          'section',
          { class: 'card chest-section', 'aria-label': 'W skrzyni' },
          h('div', { class: 'chest-head' }, h('span', { class: 'chest-art' }, materialSprite('chest')), h('h2', { class: 'section-title', text: `W skrzyni · ${chest.items.length} / ${chest.slots}` })),
          chest.items.length === 0
            ? h('p', { class: 'muted', text: 'Skrzynia jest pusta. Włóż do niej przedmiot z plecaka.' })
            : h(
                'ul',
                { class: 'chest-list' },
                chest.items.map((item) =>
                  h(
                    'li',
                    { class: 'chest-row' },
                    h('span', { class: 'chest-item' }, itemSummary(item), h('span', { class: 'chest-note', text: note(item, character) })),
                    h('button', {
                      type: 'button',
                      class: 'button button--system button--small',
                      text: 'Wyjmij',
                      onClick: act('/api/chest/take', { id: item.id }, `${item.name}: w plecaku.`),
                    }),
                  ),
                ),
              ),
        ),
      chest &&
        h(
          'section',
          { class: 'card chest-section', 'aria-label': 'Plecak' },
          h('h2', { class: 'section-title', text: `Plecak · ${countOf(character.bag.length, 'przedmiot', 'przedmioty', 'przedmiotów')}` }),
          character.bag.length === 0
            ? h('p', { class: 'muted', text: 'W plecaku nie ma przedmiotów.' })
            : h(
                'ul',
                { class: 'chest-list' },
                character.bag.map((item) =>
                  h(
                    'li',
                    { class: 'chest-row' },
                    h('button', { type: 'button', class: 'chest-item chest-item--bag', onClick: () => itemSheet(item, { equipped: false }) }, itemSummary(item)),
                    h('button', {
                      type: 'button',
                      class: 'button button--world button--small',
                      disabled: room <= 0,
                      text: 'Włóż',
                      onClick: act('/api/chest/put', { itemId: item.id }, `${item.name}: w Skrzyni Konta.`),
                    }),
                  ),
                ),
              ),
        ),
    );
  }

  // Who put the item in, and whether this character wears it at once.
  function note(item, character) {
    const from = item.own ? 'Twój przedmiot' : item.from ? `Od postaci ${item.from}` : 'Od postaci, której już nie ma';
    const wear = !item.usable ? 'nie dla tej klasy' : item.wornFrom && item.wornFrom > character.level ? `założysz od poziomu ${item.wornFrom}` : null;
    return [from, wear].filter(Boolean).join(' · ');
  }

  render();
  load();
  return { update: render };
}

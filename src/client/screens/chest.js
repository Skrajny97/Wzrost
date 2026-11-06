// The Skrzynia Konta in the camp (src/server/chest.js): the few items all the
// account's characters share, each with "Wyjmij", and the bag below with
// "Włóż". At home only, as every change of the bag. An item from another
// character is worn from its own level and the Encyklopedia leaves it out,
// as one from a Wymiana.

import { materialSprite } from '../art.js';
import { fill, h, icon } from '../dom.js';
import { countOf } from '../format.js';
import { t } from '../i18n.js';
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
          h('h1', { class: 'page-title', tabindex: '-1', text: t('Skrzynia Konta') }),
          h('p', { class: 'page-subtitle', text: t('Wspólna dla postaci na koncie') }),
        ),
        h('button', { type: 'button', class: 'button button--system back-button', onClick: onBack }, icon('back', { size: 20 }), t('Powrót')),
      ),
      systemPanel(
        t('Skrzynia Konta mieści {items} i jest wspólna dla wszystkich postaci na tym koncie.', { items: chest ? countOf(chest.slots, 'przedmiot', 'przedmioty', 'przedmiotów') : '…' }),
        // The author's words: "Encyklopedia nie zaliczy przedmiotu: [...]".
        t('Encyklopedia nie zaliczy przedmiotu: liczy się tylko to, co postać sama zdobędzie albo wytworzy.'),
      ),
      chest &&
        h(
          'section',
          // The narrator points here on the first look (narrator.js).
          { class: 'card chest-section', 'aria-label': t('W skrzyni'), 'data-guide': 'account-chest' },
          h('div', { class: 'chest-head' }, h('span', { class: 'chest-art' }, materialSprite('chest')), h('h2', { class: 'section-title', text: t('W skrzyni · {count} / {slots}', { count: chest.items.length, slots: chest.slots }) })),
          chest.items.length === 0
            ? h('p', { class: 'muted', text: t('Skrzynia jest pusta. Włóż do niej przedmiot z plecaka.') })
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
                      text: t('Wyjmij'),
                      onClick: act('/api/chest/take', { id: item.id }, t('{name}: w plecaku.', { name: item.name })),
                    }),
                  ),
                ),
              ),
        ),
      chest &&
        h(
          'section',
          { class: 'card chest-section', 'aria-label': t('Plecak') },
          h('h2', { class: 'section-title', text: t('Plecak · {items}', { items: countOf(character.bag.length, 'przedmiot', 'przedmioty', 'przedmiotów') }) }),
          character.bag.length === 0
            ? h('p', { class: 'muted', text: t('W plecaku nie ma przedmiotów.') })
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
                      text: t('Włóż'),
                      onClick: act('/api/chest/put', { itemId: item.id }, t('{name}: w Skrzyni Konta.', { name: item.name })),
                    }),
                  ),
                ),
              ),
        ),
    );
  }

  // Who put the item in, and whether this character wears it at once.
  function note(item, character) {
    const from = item.own ? t('Twój przedmiot') : item.from ? t('Od postaci {name}', { name: item.from }) : t('Od postaci, której już nie ma');
    const wear = !item.usable ? t('nie dla tej klasy') : item.wornFrom && item.wornFrom > character.classLevel ? t('założysz od poziomu klasy {level}', { level: item.wornFrom }) : null;
    return [from, wear].filter(Boolean).join(' · ');
  }

  render();
  load();
  return { update: render };
}

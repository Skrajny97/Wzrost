// The Skrzynia Konta in the camp (src/server/chest.js): what all the
// account's characters share. Items: a few of them, each with "Wyjmij", and
// the bag below with "Włóż". At home only, as every change of the bag. An
// item from another character is worn from its own level and the
// Encyklopedia leaves it out, as one from a Wymiana.
//
// The author, 12.11.2026: „Skrzynia Konta powinna pozwalać przekładać też
// mikstury, rośliny, wszystko, nawet zasoby, ale miec kłódkę i być
// zablokowana do 20 poziomu postaci” (mock-ups 843). Once the server sends
// `chest.goods`, the screen has two tabs: Przedmioty as before, and Towary:
// the potions, herbs, materials, minerals and camp resources in the chest,
// each taken out by the piece, and the character's own, each put in by the
// piece. A chest the character cannot open yet (`chest.locked`, its level)
// shows only when it opens.

import { herbSprite, materialSprite, mineralSprite, potionSprite, resourceArt } from '../art.js';
import { materialIcon } from '../craft-table.js';
import { fill, h, icon } from '../dom.js';
import { countOf, formatNumber } from '../format.js';
import { t } from '../i18n.js';
import { call, state, walletEntries } from '../state.js';
import { closeSheet, openSheet, systemPanel, toast, withButton } from '../ui.js';
import { itemSheet, itemSummary, materialTitle } from './character.js';

// The tab open last, kept while the game is open.
let openTab = 'items';

// The art of a good, by its kind.
function goodArt(good, size = 24) {
  switch (good.kind) {
    case 'resource':
      return resourceArt(good.id, size);
    case 'material':
      return materialIcon(good.materialId, size);
    case 'mineral':
      return mineralSprite(good.id) ?? icon('ore', { size });
    case 'herb':
      return herbSprite(good.id) ?? icon('leaf', { size });
    default:
      return potionSprite(good.id) ?? icon('flask', { size });
  }
}

// The character's own goods that can go into the chest, kind by kind, in
// the order the sections show them.
function ownGoods(character) {
  const of = (kind, entries) => entries.filter((entry) => entry.count > 0).map((entry) => ({ kind, ...entry }));
  return [
    [
      t('Zasoby obozu'),
      of(
        'resource',
        walletEntries(character)
          .filter((entry) => entry.id !== 'gold')
          .map((entry) => ({ id: entry.id, name: entry.name, count: entry.amount })),
      ),
    ],
    [t('Mikstury'), of('potion', character.potions ?? [])],
    [t('Zioła'), of('herb', character.herbs ?? [])],
    [t('Materiały'), of('material', (character.crafting?.materials ?? []).map((material) => ({ id: material.key, name: materialTitle(material), count: material.count, materialId: material.materialId })))],
    [t('Minerały'), of('mineral', character.minerals ?? [])],
  ].filter(([, entries]) => entries.length > 0);
}

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

  // How many pieces of a good to put in or take out: a slider with a
  // button for one more or less and "wszystkie", as the Duch budowniczego's
  // sale (builder-spirit.js). `put` says which way.
  function amountSheet(good, put) {
    const most = good.count;
    let count = most;
    const value = h('output', { class: 'fire-trade-amount', 'aria-live': 'off' });
    const go = h('button', { type: 'button', class: 'button button--system' });
    const slider = h('input', {
      type: 'range',
      class: 'duration-slider fire-trade-slider',
      min: 1,
      max: most,
      step: 1,
      value: count,
      'aria-label': put ? t('Ile sztuk włożyć') : t('Ile sztuk wyjąć'),
      disabled: most <= 1,
      onInput: () => set(Number(slider.value)),
    });
    const stepButton = (sign, label) =>
      h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': label, text: sign < 0 ? '−' : '+', onClick: () => set(count + sign) });
    const less = stepButton(-1, t('O sztukę mniej'));
    const more = stepButton(1, t('O sztukę więcej'));
    function set(next) {
      count = Math.min(most, Math.max(1, next));
      slider.value = String(count);
      slider.setAttribute('aria-valuetext', t('{count} szt.', { count: formatNumber(count) }));
      slider.style.setProperty('--fill', `${((count - 1) / Math.max(1, most - 1)) * 100}%`);
      value.textContent = t('{count} szt.', { count: formatNumber(count) });
      go.textContent = put ? t('Włóż {count} szt.', { count: formatNumber(count) }) : t('Wyjmij {count} szt.', { count: formatNumber(count) });
      less.disabled = count <= 1;
      more.disabled = count >= most;
    }
    set(count);
    go.addEventListener('click', (event) =>
      withButton(event.currentTarget, async () => {
        ({ chest } = await call('POST', put ? '/api/chest/goods/put' : '/api/chest/goods/take', { kind: good.kind, id: good.id, count }));
        closeSheet();
        toast(put ? t('{name}: {count} szt. w Skrzyni Konta.', { name: good.name, count: formatNumber(count) }) : t('{name}: {count} szt. u postaci.', { name: good.name, count: formatNumber(count) }));
        render();
      }),
    );
    openSheet(
      h('h2', { class: 'sheet-title chest-sheet-title' }, h('span', { class: 'potion-pick-art' }, goodArt(good, 28)), h('span', { text: good.name })),
      h('p', {
        class: 'sheet-text',
        text: put ? t('Masz {count} szt. Włożone czekają w Skrzyni Konta na każdą postać tego konta.', { count: formatNumber(most) }) : t('W Skrzyni Konta: {count} szt.', { count: formatNumber(most) }),
      }),
      h('p', { class: 'fire-trade-pick' }, value),
      h('div', { class: 'duration-row' }, less, slider, more),
      h('p', { class: 'builder-spirit-quick' }, h('button', { type: 'button', class: 'link-button', text: t('wszystkie'), onClick: () => set(most) })),
      h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--world', text: t('Anuluj'), onClick: closeSheet }), go),
    );
  }

  function itemsTab(character) {
    const room = chest.slots - chest.items.length;
    return [
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
    ];
  }

  // A row of a good: its art, name and count, a note under it, and a button.
  const goodRow = (good, noteText, button) =>
    h(
      'li',
      { class: 'chest-row' },
      h(
        'span',
        { class: 'chest-good' },
        h('span', { class: 'potion-pick-art' }, goodArt(good)),
        h('span', { class: 'chest-item' }, h('span', { class: 'chest-good-name', text: good.name }), noteText && h('span', { class: 'chest-note', text: noteText })),
        h('span', { class: 'chest-good-count', text: `×${formatNumber(good.count)}` }),
      ),
      button,
    );

  function goodsTab(character) {
    const own = ownGoods(character);
    return [
      h(
        'section',
        { class: 'card chest-section', 'aria-label': t('Towary w skrzyni') },
        h('div', { class: 'chest-head' }, h('span', { class: 'chest-art' }, materialSprite('chest')), h('h2', { class: 'section-title', text: t('W skrzyni') })),
        chest.goods.length === 0
          ? h('p', { class: 'muted', text: t('W skrzyni nie ma towarów. Włóż je niżej: mikstury, zioła, materiały, minerały albo zasoby obozu.') })
          : h(
              'ul',
              { class: 'chest-list' },
              chest.goods.map((good) =>
                goodRow(
                  good,
                  good.own >= good.count ? t('Twoje') : good.own > 0 ? t('Twoje: {count} szt.', { count: formatNumber(good.own) }) : t('Od innych postaci'),
                  h('button', { type: 'button', class: 'button button--system button--small', text: t('Wyjmij'), onClick: () => amountSheet(good, false) }),
                ),
              ),
            ),
      ),
      h(
        'section',
        { class: 'card chest-section', 'aria-label': t('Twoje towary') },
        h('h2', { class: 'section-title', text: t('Twoje towary') }),
        own.length === 0
          ? h('p', { class: 'muted', text: t('Postać nie ma teraz żadnych towarów.') })
          : own.map(([title, goods]) => [
              h('h3', { class: 'profile-section', text: title }),
              h(
                'ul',
                { class: 'chest-list' },
                goods.map((good) => goodRow(good, null, h('button', { type: 'button', class: 'button button--world button--small', text: t('Włóż'), onClick: () => amountSheet(good, true) }))),
              ),
            ]),
      ),
    ];
  }

  function render() {
    const character = state.character;
    const tabs = chest && Array.isArray(chest.goods);
    const tab = tabs ? openTab : 'items';
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
      chest?.locked
        ? systemPanel(t('Skrzynia Konta otworzy się na {level}. poziomie postaci.', { level: chest.locked.level }))
        : [
            systemPanel(
              tabs
                ? t('Skrzynia Konta mieści {items} i dowolnie wiele towarów. Jest wspólna dla wszystkich postaci na tym koncie.', { items: countOf(chest.slots, 'przedmiot', 'przedmioty', 'przedmiotów') })
                : t('Skrzynia Konta mieści {items} i jest wspólna dla wszystkich postaci na tym koncie.', { items: chest ? countOf(chest.slots, 'przedmiot', 'przedmioty', 'przedmiotów') : '…' }),
              // The author's words: "Encyklopedia nie zaliczy przedmiotu: [...]".
              tabs
                ? t('Encyklopedia nie zaliczy przedmiotu ani towaru od innej postaci: liczy się tylko to, co postać sama zdobędzie albo wytworzy.')
                : t('Encyklopedia nie zaliczy przedmiotu: liczy się tylko to, co postać sama zdobędzie albo wytworzy.'),
            ),
            tabs &&
              h(
                'div',
                { class: 'chat-tabs market-tabs', role: 'tablist', 'aria-label': t('Skrzynia Konta') },
                [
                  ['items', t('Przedmioty · {count} / {slots}', { count: chest.items.length, slots: chest.slots })],
                  ['goods', t('Towary')],
                ].map(([id, label]) =>
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'chat-tab',
                      role: 'tab',
                      'aria-selected': String(tab === id),
                      onClick: () => {
                        openTab = id;
                        render();
                      },
                    },
                    h('span', { class: 'chat-tab-name', text: label }),
                  ),
                ),
              ),
            chest && (tab === 'goods' ? goodsTab(character) : itemsTab(character)),
          ],
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

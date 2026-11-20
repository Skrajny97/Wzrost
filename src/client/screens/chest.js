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
// the potions, herbs, materials, parts, minerals and camp resources in the chest,
// each taken out by the piece, and the character's own, each put in by the
// piece. A chest the character cannot open yet (`chest.locked`, its level)
// shows only when it opens.
//
// Talia Systemu's cards too, where the game has them (`chest.cards`;
// DECISIONS.md, "Karty Talii: Skrzynia Konta, Targowisko i Wymiana"): a card
// in the chest is a line of the goods, „Karta: Licho ×2” with its small
// picture and „Weź”, and the character's collection is under "Włóż kartę",
// its cards' faces to choose from. Both ask how many copies, with the card
// at the level the move would give. Their words come from the data
// (cards.json texts.goods), with the chest's answer.
//
// And the account's gold (`chest.gold`; DECISIONS.md, "Złoto w Skrzyni Konta
// (19.11.2026)"; the author: „dorób złoto możliwe do przenoszenia miedzy
// postaciami w skrzyni konta”): a row over the tabs with the gold in the
// chest, the character's own under it, and "Włóż" and "Wyjmij", each with a
// sheet that asks how much: a field, the quick amounts and "Wszystko". Its
// words and quick amounts come from the data (camp.json chest.gold), with
// the chest's answer.

import { goldArt, herbSprite, materialSprite, mineralSprite, pantrySprite, potionSprite, resourceArt, scrollArt } from '../art.js';
import { cardAtLevel, cardFace, cardThumb } from '../cards.js';
import { materialIcon } from '../craft-table.js';
import { fill, h, icon } from '../dom.js';
import { countOf, formatNumber } from '../format.js';
import { t } from '../i18n.js';
import { call, state, walletEntries } from '../state.js';
import { closeSheet, openSheet, systemPanel, toast, withButton } from '../ui.js';
import { bagSortRow, itemSheet, itemSummary, materialTitle, sortBag } from './character.js';

// The tab open last, kept while the game is open.
let openTab = 'items';

// The order of the character's own goods to put in (the author,
// 16.11.2026: „Powinna też być opcja sortowania tych przedmiotów przy
// wybieraniu”), within each kind: the game's, the most pieces first, or by
// name; kept on the device. The bag's items follow the bag's own "Sortuj:"
// (screens/character.js).
const GOOD_SORTS = [
  { id: 'order', label: 'Kolejność' },
  { id: 'count', label: 'Liczba' },
  { id: 'name', label: 'Nazwa' },
];
const GOOD_SORT_KEY = 'insight-chest-goods-sort';
let goodSort = 'order';
try {
  const kept = localStorage.getItem(GOOD_SORT_KEY);
  if (GOOD_SORTS.some((one) => one.id === kept)) goodSort = kept;
} catch {
  // Without storage the game's order.
}
function sortGoods(goods) {
  if (goodSort === 'count') return [...goods].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  if (goodSort === 'name') return [...goods].sort((a, b) => a.name.localeCompare(b.name));
  return goods;
}

// The art of a good, by its kind.
function goodArt(good, size = 24) {
  switch (good.kind) {
    // A card of Talia Systemu: its small picture.
    case 'card':
    case 'effect-card':
      return cardThumb(good.face);
    case 'resource':
      return resourceArt(good.id, size);
    case 'material':
      return materialIcon(good.materialId, size);
    // The Stół rozbiórki's parts (0.3.90), as the bag draws them.
    case 'part':
      return materialIcon(good.id, size);
    case 'mineral':
      return mineralSprite(good.id) ?? icon('ore', { size });
    case 'herb':
      return herbSprite(good.id) ?? icon('leaf', { size });
    // The scrolls (1061).
    case 'scroll':
      return scrollArt(good.id, size);
    // The Spiżarnia's fish and crops (1057, 1058).
    case 'pantry':
      return pantrySprite(good.id) ?? icon('fish', { size });
    default:
      return potionSprite(good.id) ?? icon('flask', { size });
  }
}

// The character's own goods that can go into the chest, kind by kind, in
// the order the sections show them.
function ownGoods(character) {
  // The chest's kind of the good last: a mineral's entry has its own `kind`
  // (gem or ore, professions-view.js), which went to the server in its place
  // (a player, through the author, 16.11.2026: „Skrzynia Konta z
  // niewyjaśnionego powodu nie przyjmuje minerałów i nie wyświetla
  // ikonki”).
  const of = (kind, entries) => entries.filter((entry) => entry.count > 0).map((entry) => ({ ...entry, kind }));
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
    [t('Części'), of('part', (character.crafting?.parts ?? []).map((part) => ({ id: part.id, name: part.name, count: part.count })))],
    [t('Minerały'), of('mineral', character.minerals ?? [])],
    [t('Zwoje'), of('scroll', character.scrollGoods ?? [])],
    [t('Spiżarnia'), of('pantry', character.pantry ?? [])],
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
        character.bag.length > 1 && bagSortRow('items', render),
        character.bag.length === 0
          ? h('p', { class: 'muted', text: t('W plecaku nie ma przedmiotów.') })
          : h(
              'ul',
              { class: 'chest-list' },
              sortBag('items', character.bag).map((item) =>
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

  // "Sortuj:" over the character's own goods, in the look of the bag's.
  const goodSortRow = () =>
    h(
      'div',
      { class: 'bag-sort' },
      h('span', { class: 'bag-sort-label', text: t('Sortuj:') }),
      h(
        'div',
        { class: 'segmented bag-sort-options bag-sort-options--3', role: 'group', 'aria-label': t('Kolejność towarów') },
        GOOD_SORTS.map((one) =>
          h(
            'button',
            {
              type: 'button',
              class: 'segmented-option',
              'aria-pressed': goodSort === one.id,
              onClick: () => {
                goodSort = one.id;
                try {
                  localStorage.setItem(GOOD_SORT_KEY, one.id);
                } catch {
                  // Kept while the page is open.
                }
                render();
              },
            },
            t(one.label),
          ),
        ),
      ),
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
                isCard(good)
                  ? goodRow(good, cardNote(good), h('button', { type: 'button', class: 'button button--system button--small', text: words().take, onClick: () => cardSheet(good, false) }))
                  : goodRow(
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
        own.length > 0 && goodSortRow(),
        own.length === 0 && !chest.cards
          ? h('p', { class: 'muted', text: t('Postać nie ma teraz żadnych towarów.') })
          : own.map(([title, goods]) => [
              h('h3', { class: 'profile-section', text: title }),
              h(
                'ul',
                { class: 'chest-list' },
                sortGoods(goods).map((good) => goodRow(good, null, h('button', { type: 'button', class: 'button button--world button--small', text: t('Włóż'), onClick: () => amountSheet(good, true) }))),
              ),
            ]),
        chest.cards && cardsGroup(),
      ),
    ];
  }

  // --- Talia Systemu's cards -------------------------------------------

  const words = () => chest.cards?.texts ?? {};
  const isCard = (good) => good.kind === 'card' || good.kind === 'effect-card';
  const filled = (text, vars) => String(text ?? '').replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole));
  // A level from copies, up to the top.
  const levelOf = (copies) => Math.max(1, Math.min(chest.cards.maxLevel, copies));

  // Under a card in the chest: whose copies they are, and the level the
  // character has it at (or that it has none).
  function cardNote(good) {
    const whose = good.own >= good.count ? words().own : good.own > 0 ? filled(words().ownSome, { count: formatNumber(good.own) }) : words().others;
    const have = good.have > 0 ? filled(words().haveLevel, { level: levelOf(good.have) }) : words().haveNone;
    return `${whose} · ${have}`;
  }

  // "Karty" under the character's own goods: its collection's count and
  // "Włóż kartę", which opens the collection to choose from.
  function cardsGroup() {
    const own = chest.cards.own;
    return [
      h('h3', { class: 'profile-section', text: words().group }),
      h(
        'div',
        { class: 'chest-row chest-cards-row' },
        h(
          'span',
          { class: 'chest-good' },
          h('span', { class: 'potion-pick-art chest-cards-back', 'aria-hidden': 'true' }),
          h('span', { class: 'chest-item' }, h('span', { class: 'chest-good-name', text: own.length > 0 ? filled(words().collection, { count: formatNumber(own.length) }) : words().pickEmpty })),
        ),
        own.length > 0 && h('button', { type: 'button', class: 'button button--world button--small', 'data-guide': 'chest-put-card', text: words().put, onClick: pickSheet }),
      ),
    ];
  }

  // "Włóż kartę": the collection's faces, the creatures' first and then the
  // effect cards, each with its copies; a card a match running now plays
  // says so and stays.
  function pickSheet() {
    const own = chest.cards.own;
    const grid = (entries) =>
      h(
        'div',
        { class: 'tcard-grid chest-card-grid' },
        entries.map((entry) =>
          h(
            'div',
            { class: 'chest-card-pick' },
            cardFace(entry.face, {
              marks: { dim: entry.busy },
              label: `${entry.cardName}, ${entry.busy ? words().busy : filled(words().copies, { count: formatNumber(entry.copies) })}`,
              onClick: () => (entry.busy ? toast(words().inMatch) : cardSheet(entry, true)),
            }),
            h('span', { class: `chest-card-copies${entry.busy ? ' chest-card-copies--busy' : ''}`, text: entry.busy ? words().busy : filled(words().copies, { count: formatNumber(entry.copies) }) }),
          ),
        ),
      );
    const creatures = own.filter((entry) => entry.kind === 'card');
    const effects = own.filter((entry) => entry.kind === 'effect-card');
    openSheet(
      h('h2', { class: 'sheet-title', text: words().put }),
      h('p', { class: 'sheet-text', text: words().pickText }),
      creatures.length > 0 && grid(creatures),
      effects.length > 0 && [h('h3', { class: 'profile-section', text: words().pickEffects }), grid(effects)],
    );
  }

  // How many copies of a card to put in (`put`: an entry of the collection)
  // or to take out (a card of the chest), as amountSheet asks for goods: the
  // card's face at the level the move would give, what it does to the
  // collection and to the decks the card is in, and the button.
  function cardSheet(card, put) {
    const most = put ? card.copies : card.count;
    const have = put ? card.copies : card.have;
    let count = most;
    const show = h('div', { class: 'chest-card-show' });
    const after = h('p', { class: 'sheet-text chest-card-after' });
    const warn = h('p', { class: 'region-warning chest-card-warn' });
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
    // The decks a card put in whole leaves incomplete.
    const decks = put ? (card.decks ?? []).map((deck) => (deck.name ? `„${deck.name}”` : String(deck.slot))) : [];
    function set(next) {
      count = Math.min(most, Math.max(1, next));
      slider.value = String(count);
      slider.setAttribute('aria-valuetext', t('{count} szt.', { count: formatNumber(count) }));
      slider.style.setProperty('--fill', `${((count - 1) / Math.max(1, most - 1)) * 100}%`);
      value.textContent = t('{count} szt.', { count: formatNumber(count) });
      less.disabled = count <= 1;
      more.disabled = count >= most;
      if (put) {
        const left = have - count;
        fill(show, cardFace(card.face));
        after.textContent = left > 0 ? filled(words().putLeft, { level: levelOf(left) }) : words().putAll;
        warn.hidden = left > 0 || decks.length === 0;
        warn.textContent = decks.length > 1 ? filled(words().putDecks, { decks: decks.join(', ') }) : filled(words().putDeck, { deck: decks[0] ?? '' });
        go.textContent = filled(words().putButton, { count: formatNumber(count) });
      } else {
        const level = levelOf(have + count);
        fill(show, cardFace(cardAtLevel(card.face, level)));
        after.textContent =
          have >= chest.cards.maxLevel
            ? filled(words().takeTop, { level: chest.cards.maxLevel })
            : have > 0
              ? filled(words().takeHave, { have: levelOf(have), level })
              : filled(words().takeNew, { level });
        warn.hidden = true;
        go.textContent = filled(words().takeButton, { count: formatNumber(count) });
      }
    }
    set(count);
    go.addEventListener('click', (event) =>
      withButton(event.currentTarget, async () => {
        ({ chest } = await call('POST', put ? '/api/chest/goods/put' : '/api/chest/goods/take', { kind: card.kind, id: card.id, count }));
        closeSheet();
        toast(put ? filled(words().putDone, { name: card.cardName, count: formatNumber(count) }) : filled(words().takeDone, { name: card.cardName, level: levelOf(have + count) }));
        render();
      }),
    );
    openSheet(
      h('h2', { class: 'sheet-title chest-sheet-title' }, h('span', { text: card.cardName })),
      show,
      h('p', {
        class: 'sheet-text',
        text: put ? filled(words().putHave, { count: formatNumber(card.copies), level: levelOf(card.copies) }) : filled(words().takeChest, { count: formatNumber(card.count) }),
      }),
      h('p', { class: 'fire-trade-pick' }, value),
      h('div', { class: 'duration-row' }, less, slider, more),
      h('p', { class: 'builder-spirit-quick' }, h('button', { type: 'button', class: 'link-button', text: t('wszystkie'), onClick: () => set(most) })),
      after,
      warn,
      // Copies of another character: the level, not the Encyklopedia.
      !put && card.own < card.count && h('p', { class: 'muted chest-card-rule', text: words().rule }),
      h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--world', text: t('Anuluj'), onClick: closeSheet }), go),
    );
  }

  // --- Gold --------------------------------------------------------------

  const goldWords = () => chest.gold.texts;
  const withGold = (text, gold) => filled(text, { gold: formatNumber(gold) });
  // The character's gold as the server counts it: whole.
  const ownGold = () => Math.max(0, Math.floor(state.character.gold ?? 0));

  // The row over the tabs: the gold in the chest, the character's own under
  // it, and the two buttons, each off while there is nothing to move.
  function goldRow() {
    const words = goldWords();
    return h(
      'section',
      { class: 'card chest-gold', 'aria-label': words.title },
      h(
        'div',
        { class: 'chest-gold-inner' },
        h('span', { class: 'chest-gold-art', 'aria-hidden': 'true' }, goldArt(32)),
        h(
          'span',
          { class: 'chest-gold-text' },
          h('span', { class: 'chest-gold-title', text: words.title }),
          h('span', { class: 'chest-gold-amount', text: formatNumber(chest.gold.amount) }),
          h('span', { class: 'chest-note', text: withGold(words.own, ownGold()) }),
        ),
        h(
          'span',
          { class: 'chest-gold-actions' },
          h('button', { type: 'button', class: 'button button--world button--small', 'data-chest-gold': 'put', text: words.put, disabled: ownGold() < 1, onClick: () => goldSheet(true) }),
          h('button', { type: 'button', class: 'button button--system button--small', 'data-chest-gold': 'take', text: words.take, disabled: chest.gold.amount < 1, onClick: () => goldSheet(false) }),
        ),
      ),
    );
  }

  // "Włóż złoto" (`put`) or "Wyjmij złoto": both numbers, a field for the
  // amount with the quick amounts and "Wszystko" under it, and the button
  // with the amount, off until the amount is a whole number from 1 up to
  // what there is (a line under the field says what is wrong). The request
  // carries the chest's gold the sheet showed (`seen`): when the chest moved
  // meanwhile, the server says so and the chest is read again.
  function goldSheet(put) {
    const words = goldWords();
    const seen = chest.gold.amount;
    const most = put ? ownGold() : seen;
    const input = h('input', {
      type: 'number',
      id: 'chest-gold-amount',
      class: 'trade-number chest-gold-number',
      min: '1',
      max: String(most),
      step: '1',
      inputmode: 'numeric',
      placeholder: '0',
      'aria-label': words.amount,
    });
    const warn = h('p', { class: 'region-warning chest-gold-warn', 'aria-live': 'polite' });
    const go = h('button', { type: 'button', class: 'button button--system' });
    const typed = () => (input.value.trim() === '' ? null : Number(input.value));
    function update() {
      const amount = typed();
      const whole = Number.isSafeInteger(amount) && amount >= 1;
      const fits = whole && amount <= most;
      go.disabled = !fits;
      go.textContent = fits ? withGold(put ? words.putButton : words.takeButton, amount) : put ? words.putTitle : words.takeTitle;
      warn.hidden = amount === null || fits;
      const short = put ? (most > 0 ? withGold(words.errors.notEnough, most) : words.errors.none) : most > 0 ? withGold(words.errors.notInChest, most) : words.errors.empty;
      warn.textContent = whole ? short : words.errors.invalid;
    }
    const set = (amount) => {
      input.value = String(amount);
      update();
    };
    input.addEventListener('input', update);
    const quick = (text, amount, extra = '') =>
      h('button', { type: 'button', class: `button button--world button--small chest-gold-quick${extra}`, text, disabled: amount < 1 || amount > most, onClick: () => set(amount) });
    update();
    go.addEventListener('click', (event) =>
      withButton(event.currentTarget, async () => {
        const amount = typed();
        try {
          ({ chest } = await call('POST', put ? '/api/chest/gold/put' : '/api/chest/gold/take', { amount, seen }));
        } catch (error) {
          // The chest is not as the sheet showed it: read again, the sheet
          // closed, so the next try starts from what is there now.
          if (error.status === 409) {
            closeSheet();
            await load();
          }
          throw error;
        }
        closeSheet();
        toast(withGold(put ? words.putDone : words.takeDone, amount));
        render();
      }),
    );
    openSheet(
      h('h2', { class: 'sheet-title chest-sheet-title' }, h('span', { class: 'potion-pick-art' }, goldArt(28)), h('span', { text: put ? words.putTitle : words.takeTitle })),
      h('p', { class: 'chest-gold-both' }, h('span', { text: withGold(words.own, ownGold()) }), h('span', { text: withGold(words.inChest, seen) })),
      h('p', { class: 'sheet-text', text: put ? words.putText : words.takeText }),
      h(
        'div',
        { class: 'chest-gold-field' },
        input,
        h(
          'div',
          { class: 'chest-gold-quicks' },
          chest.gold.quick.map((amount) => quick(formatNumber(amount), amount)),
          quick(words.all, most, ' chest-gold-quick--all'),
        ),
      ),
      warn,
      h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--world', text: t('Anuluj'), onClick: closeSheet }), go),
    );
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
            chest?.gold && goldRow(),
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

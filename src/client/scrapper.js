// The scrapper's sale by the handful: every item in the bag up to a rarity,
// from a report or at the Skup złomu. Worn and upgraded items stay, and so
// do those with a gem set in them; such an item sells alone, from its card
// in the bag. The favourites stay too (the author, 10.11.2026: "Do tego
// opcja dodawania do ulubionych, by przypadkiem nie rozebrać czegoś na
// później"), until their star comes off.

import { h } from './dom.js';
import { countOf, formatNumber } from './format.js';
import { t } from './i18n.js';
import { call, state } from './state.js';
import { confirmAction, openSheet, toast } from './ui.js';

export function scrapperSheet() {
  const bag = state.character.bag.filter((item) => !(item.upgrade > 0) && !item.gem && !item.favorite);
  const rarities = state.content.rarities;
  const rank = (item) => rarities.findIndex((rarity) => rarity.id === item.rarity);
  openSheet(
    h('h2', { class: 'sheet-title', text: t('Złomiarz') }),
    h('p', { class: 'sheet-text', text: t('Sprzedaj przedmioty z plecaka o rzadkości niższej lub równej:') }),
    h(
      'div',
      { class: 'scrap-options' },
      rarities.map((rarity, index) => {
        const items = bag.filter((item) => rank(item) <= index);
        const gold = items.reduce((sum, item) => sum + item.price, 0);
        const amount = countOf(items.length, 'przedmiot', 'przedmioty', 'przedmiotów');
        return h(
          'button',
          {
            type: 'button',
            class: 'button button--world scrap-option',
            disabled: items.length === 0,
            onClick: () => sell(rarity, amount, gold),
          },
          h('span', { class: 'item-name', vars: { '--rarity': rarity.color }, text: rarity.name }),
          h('span', { class: 'scrap-detail', text: items.length > 0 ? t('{items} · {gold} złota', { items: amount, gold: formatNumber(gold) }) : t('nic do sprzedania') }),
        );
      }),
    ),
    h('p', { class: 'muted', text: t('Założone i ulepszone przedmioty oraz te z kamieniem zostają. Sprzedasz je bezpośrednio z pozycji plecaka.') }),
    state.character.bag.some((item) => item.favorite) && h('p', { class: 'muted', text: t('Ulubione, z gwiazdką, też zostają, dopóki jej nie zdejmiesz.') }),
  );
}

async function sell(rarity, amount, gold) {
  const sure = await confirmAction({
    title: t('Sprzedać przedmioty?'),
    text: t('Złomiarz kupi {items} (do rzadkości: {rarity}) za {gold} złota.', { items: amount, rarity: rarity.name, gold: formatNumber(gold) }),
    confirmLabel: t('Sprzedaj'),
  });
  if (!sure) return;
  try {
    const { sold } = await call('POST', '/api/items/sell', { maxRarity: rarity.id });
    toast(t('Sprzedano: {items} za {gold} złota.', { items: countOf(sold.count, 'przedmiot', 'przedmioty', 'przedmiotów'), gold: formatNumber(sold.gold) }));
  } catch (error) {
    toast(error.message);
  }
}

// The scrapper's sale by the handful: every item in the bag up to a rarity,
// from a report or at the Skup złomu. Worn and upgraded items stay; an
// upgraded one sells alone, from its card in the bag.

import { h } from './dom.js';
import { countOf, formatNumber } from './format.js';
import { call, state } from './state.js';
import { confirmAction, openSheet, toast } from './ui.js';

export function scrapperSheet() {
  const bag = state.character.bag.filter((item) => !(item.upgrade > 0));
  const rarities = state.content.rarities;
  const rank = (item) => rarities.findIndex((rarity) => rarity.id === item.rarity);
  openSheet(
    h('h2', { class: 'sheet-title', text: 'Złomiarz' }),
    h('p', { class: 'sheet-text', text: 'Sprzedaj przedmioty z plecaka o rzadkości niższej lub równej:' }),
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
          h('span', { class: 'scrap-detail', text: items.length > 0 ? `${amount} · ${formatNumber(gold)} złota` : 'nic do sprzedania' }),
        );
      }),
    ),
    h('p', { class: 'muted', text: 'Założone i ulepszone przedmioty zostają. Ulepszone sprzedasz bezpośrednio z pozycji plecaka.' }),
  );
}

async function sell(rarity, amount, gold) {
  const sure = await confirmAction({
    title: 'Sprzedać przedmioty?',
    text: `Złomiarz kupi ${amount} (do rzadkości: ${rarity.name}) za ${formatNumber(gold)} złota.`,
    confirmLabel: 'Sprzedaj',
  });
  if (!sure) return;
  try {
    const { sold } = await call('POST', '/api/items/sell', { maxRarity: rarity.id });
    toast(`Sprzedano: ${countOf(sold.count, 'przedmiot', 'przedmioty', 'przedmiotów')} za ${formatNumber(sold.gold)} złota.`);
  } catch (error) {
    toast(error.message);
  }
}

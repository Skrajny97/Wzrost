// The Garbarnia in the Osada (src/server/tannery.js; the author's 325 A:
// "Niech sprzedaje i skupuje skóry (drożej) na podobieństwo Jagny", then
// "wszystkimi materiałami włącznie z łuskami żmii i podobnymi"): Wszebor's
// tabs Kup and Sprzedaj, as Jagna's in the Chata zielarki. Kup lists the
// creatures' materials he sells at the relation with him, each opening its
// card under a tap; Sprzedaj the character's, which he buys for more than
// the scrapper. The Osada's place screen keeps the open tab as it redraws.

import { h } from './dom.js';
import { countOf, formatDecimal, formatNumber, saleGold, tradePace } from './format.js';
import { t } from './i18n.js';
import { call, state } from './state.js';
import { closeSheet, openSheet, toast, withButton } from './ui.js';
import { numberField, stackArt, stackButton } from './screens/market.js';

// The tabs, their names shown through t().
const TABS = [
  ['buy', 'Kup'],
  ['sell', 'Sprzedaj'],
];

// The trade's reputation today out of the day's limit, under both tabs.
const tradeLine = (trade) =>
  `${t('Handel daje relację z nim i reputację Bractwa Łowców: dziś {today} z {daily} punktów.', { today: trade.today, daily: trade.daily })}${tradePace(trade)}`;

// A material he sells: as many pieces as the gold allows, typed in.
// Materials take no place in the bag.
function buySheet(good, apply) {
  const most = Math.floor(state.character.gold / good.price);
  const field = numberField('tannery-buy-count', t('Ile sztuk'), 1, 1, Math.max(1, most));
  openSheet(
    h('h2', { class: 'sheet-title', text: good.name }),
    h('p', { class: 'sheet-text', text: t('{price} zł. za sztukę. Możesz kupić najwyżej {most} szt.: na tyle starczy złota.', { price: formatNumber(good.price), most: formatNumber(most) }) }),
    field.element,
    h(
      'div',
      { class: 'sheet-actions' },
      h('button', { type: 'button', class: 'button button--world', text: t('Anuluj'), onClick: closeSheet }),
      h('button', {
        type: 'button',
        class: 'button button--system',
        text: t('Kup'),
        onClick: (event) =>
          withButton(event.currentTarget, async () => {
            const answer = await call('POST', '/api/settlement/tannery/buy', { key: good.key, count: field.read() });
            closeSheet();
            apply(answer);
            const { name, count, gold, points } = answer.bought;
            toast(
              `${t('Kupione: {name} ×{count} za {gold} zł.', { name, count: formatNumber(count), gold: formatNumber(gold) })}${points > 0 ? ` ${t('Relacja ze Wszeborem i reputacja Bractwa Łowców +{points}.', { points })}` : ''}`,
            );
          }),
      }),
    ),
  );
}

// The Kup tab: the materials he sells at the relation with him, dearer than he
// buys them, each opening its card under a tap, and the standing that
// brings more. They count for the Tablica's orders for materials (the
// author: "ułatwi dodatkowo sprawę tym, którym braknie pare materiałów do
// Zleceń w Osadzie").
function shop(view, apply) {
  const { shop: offer, trade } = view;
  const gold = state.character.gold;
  return h(
    'section',
    { class: 'stack' },
    h('h2', { class: 'section-title', text: t('Towar Wszebora') }),
    h('p', {
      class: 'muted',
      text: `${t('Wszebor sprzedaje materiały ze stworów drożej, niż je skupuje.')} ${offer.discount > 0 ? t('Dzięki relacji z nim ceny są niższe o {discount}%.', { discount: formatDecimal(offer.discount * 100) }) : t('Z lepszą relacją ceny będą niższe.')} ${tradeLine(trade)}`,
    }),
    h('p', { class: 'muted', text: t('Kupione materiały pasują do zleceń z Tablicy zleceń.') }),
    h(
      'ul',
      { class: 'stack market-list' },
      offer.goods.map((good) => {
        const button = (small) =>
          h('button', {
            type: 'button',
            class: `button button--world${small ? ' button--small' : ''}`,
            text: t('Kup'),
            disabled: gold < good.price,
            onClick: () => buySheet(good, apply),
          });
        const price = t('{gold} zł. za sztukę', { gold: formatNumber(good.price) });
        return h(
          'li',
          { class: 'card tannery-good' },
          stackButton(good, { count: false, meta: price }, () => [h('p', { class: 'market-price', text: `Wszebor: ${price}.` }), button(false)]),
          button(true),
        );
      }),
    ),
    offer.next &&
      h('p', {
        class: 'muted',
        text: t('Od stopnia relacji {standing} dojdą kolejne: {materials}.', {
          standing: offer.next.standing,
          materials: countOf(offer.next.count, 'materiał', 'materiały', 'materiałów'),
        }),
      }),
  );
}

// Selling to Wszebor: as many pieces as chosen, one at first, as to Jagna.
function sellSheet(good, apply) {
  let count = 1;
  const value = h('output', { class: 'herb-count-value' });
  const sell = h('button', { type: 'button', class: 'button button--system' });
  const less = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': t('Mniej'), text: '−', onClick: () => set(count - 1) });
  const more = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': t('Więcej'), text: '+', onClick: () => set(count + 1) });
  const all = h('button', { type: 'button', class: 'link-button', text: t('wszystkie'), onClick: () => set(good.count) });
  function set(next) {
    count = Math.min(good.count, Math.max(1, next));
    value.textContent = t('{count} szt.', { count: formatNumber(count) });
    sell.textContent = t('Sprzedaj za {gold} zł.', { gold: formatNumber(saleGold(good.price, count)) });
    less.disabled = count === 1;
    more.disabled = count === good.count;
  }
  set(count);
  sell.addEventListener('click', (event) =>
    withButton(event.currentTarget, async () => {
      const answer = await call('POST', '/api/settlement/tannery', { key: good.key, count });
      closeSheet();
      apply(answer);
      const { gold, points } = answer.sold;
      toast(`${t('Wszebor płaci {gold} zł.', { gold: formatNumber(gold) })}${points > 0 ? ` ${t('Relacja z nim i reputacja Bractwa Łowców +{points}.', { points })}` : ''}`);
    }),
  );
  openSheet(
    h('h2', { class: 'sheet-title', text: good.name }),
    h('p', {
      class: 'sheet-text',
      text: t('Masz {count} szt. Wszebor płaci {price} zł. za sztukę, złomiarz {scrap} zł.', {
        count: formatNumber(good.count),
        price: formatDecimal(good.price),
        scrap: formatDecimal(good.scrap),
      }),
    }),
    h('div', { class: 'herb-count' }, less, value, more, all),
    h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--world', text: t('Anuluj'), onClick: closeSheet }), sell),
  );
}

// The Sprzedaj tab: the character's materials, which he buys for more than the
// scrapper, and for more again with a better relation.
function sale(view, apply) {
  const { premium, best, goods, trade } = view;
  return h(
    'section',
    { class: 'stack', 'data-guide': 'tannery-sell' },
    h('h2', { class: 'section-title', text: t('Skup materiałów') }),
    h('p', {
      class: 'muted',
      text: `${best ? t('Wszebor płaci o {percent}% więcej niż złomiarz.', { percent: Math.round(premium * 100) }) : t('Wszebor płaci o {percent}% więcej niż złomiarz, a z lepszą relacją jeszcze więcej.', { percent: Math.round(premium * 100) })} ${tradeLine(trade)}`,
    }),
    goods.length === 0
      ? h('p', { class: 'muted', text: t('Nie masz materiałów ze stworów, które Wszebor kupuje.') })
      : h(
          'ul',
          { class: 'settlement-goods' },
          goods.map((good) =>
            h(
              'li',
              { class: 'settlement-good' },
              // The material's icon by its name, as at Jagna's, and the name in
              // its rarity's colour, as in the bag, so what to sell
              // shows at a glance (a player via the author, 12.11.2026).
              h(
                'p',
                { class: 'settlement-good-name' },
                h('span', { class: 'potion-pick-art' }, stackArt(good)),
                h('strong', { class: 'item-name', vars: { '--rarity': good.material.color }, text: `${good.name} × ${formatNumber(good.count)}` }),
              ),
              h('p', { class: 'muted', text: t('{price} zł. za sztukę, u złomiarza {scrap} zł.', { price: formatDecimal(good.price), scrap: formatDecimal(good.scrap) }) }),
              h('button', { type: 'button', class: 'button button--world button--small', text: t('Sprzedaj'), onClick: () => sellSheet(good, apply) }),
            ),
          ),
        ),
  );
}

// Wszebor's services on the Garbarnia's screen: the tabs Kup and Sprzedaj,
// as Jagna's. `tab` is the one open, `pick` opens another and `apply` takes
// what a trade answers with.
export function tanneryCard(view, { tab, pick, apply }) {
  const tabs = h(
    'div',
    { class: 'chat-tabs market-tabs', role: 'tablist', 'aria-label': t('Garbarnia') },
    TABS.map(([id, label]) =>
      h(
        'button',
        {
          type: 'button',
          class: 'chat-tab',
          role: 'tab',
          'data-guide': `tannery-tab-${id}`,
          'aria-selected': String(tab === id),
          onClick: () => pick(id),
        },
        h('span', { class: 'chat-tab-name', text: t(label) }),
      ),
    ),
  );
  return h('div', { class: 'stack' }, tabs, tab === 'buy' ? shop(view, apply) : sale(view, apply));
}

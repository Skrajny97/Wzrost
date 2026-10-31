// The Targowisko in the Osada (src/server/market.js, questions 237–242): the
// players' offers as auctions, the character's own offers with "Wystaw" and
// what waits to be collected, and the residents' offers: the merchant's
// goods of the day and the wandering trader on his day of the week.
//
// The Osada's place screen mounts the panel once and keeps it while it
// redraws itself, so a redraw never asks the server again.

import { herbSprite, potionSprite } from '../art.js';
import { materialIcon } from '../craft-table.js';
import { h, icon } from '../dom.js';
import { countOf, formatDecimal, formatNumber } from '../format.js';
import { call, serverNow, state } from '../state.js';
import { closeSheet, confirmAction, openSheet, systemPanel, toast, withButton } from '../ui.js';
import { itemSummary } from './character.js';

const TABS = [
  ['offers', 'Oferty graczy'],
  ['mine', 'Moje'],
  ['residents', 'Mieszkańcy'],
];
const KIND_NAMES = { herb: 'zioło', potion: 'mikstura', material: 'materiał', part: 'część' };
const REASONS = { won: 'wygrana licytacja', bought: 'kupione', returned: 'wraca do Ciebie', sold: 'zapłata za sprzedaż' };
const rarityOf = (id) => state.content?.rarities?.find((rarity) => rarity.id === id);

// What is left until `at`: "2 dni 5 h", "5 h 12 min", "12 min".
function left(at) {
  const minutes = Math.ceil(Math.max(0, at - serverNow()) / 60000);
  if (minutes <= 0) return 'chwilę';
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} ${days === 1 ? 'dzień' : 'dni'} ${hours % 24} h`;
  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

// A stack's picture by its kind.
function stackArt(goods, size = 24) {
  if (goods.kind === 'herb') return herbSprite(goods.key) ?? icon('leaf', { size });
  if (goods.kind === 'potion') return potionSprite(goods.key) ?? icon('flask', { size });
  if (goods.kind === 'material') return materialIcon(goods.material.materialId, size);
  if (goods.kind === 'part') return materialIcon(goods.key, size);
  return icon('coin', { size });
}

// A stack, or a parcel's gold, in one line; `meta` in place of its kind,
// as a price.
function stackLine(goods, { count = true, meta } = {}) {
  const rarity = rarityOf(goods.rarity);
  const name = goods.kind === 'gold' ? `${formatNumber(goods.count)} zł` : count ? `${goods.name} ×${formatNumber(goods.count)}` : goods.name;
  return h(
    'span',
    { class: 'item-summary-art market-goods' },
    h('span', { class: 'potion-pick-art' }, stackArt(goods)),
    h(
      'span',
      { class: 'item-summary' },
      h('span', { class: 'item-name', vars: rarity ? { '--rarity': rarity.color } : {}, text: name }),
      goods.kind !== 'gold' && h('span', { class: 'item-meta', text: meta ?? [KIND_NAMES[goods.kind], rarity?.name].filter(Boolean).join(' · ') }),
    ),
  );
}

// How many of a stack's goods the character already has.
function owned(goods) {
  const character = state.character;
  if (goods.kind === 'herb') return character.herbs?.find((one) => one.id === goods.key)?.count ?? 0;
  if (goods.kind === 'potion') return character.potions?.find((one) => one.id === goods.key)?.count ?? 0;
  if (goods.kind === 'material') return character.crafting?.materials.find((one) => one.key === goods.key)?.count ?? 0;
  if (goods.kind === 'part') return character.crafting?.parts.find((one) => one.id === goods.key)?.count ?? 0;
  return 0;
}

// A stack's card (the author: "bym mogl kliknac przedmiot i go sprawdzić u
// kupca"): its picture, what it is, what the scrapper pays for a piece, the
// Zielarstwo level that gathers a herb, and how many the character has;
// `actions` below, as the merchant's "Kup".
function goodsSheet(goods, actions = null) {
  const rarity = rarityOf(goods.rarity);
  const colour = rarity ? { '--rarity': rarity.color } : {};
  openSheet(
    h(
      'div',
      { class: 'item-details' },
      h(
        'div',
        { class: 'item-head' },
        h('span', { class: 'item-art', vars: colour }, stackArt(goods, 32)),
        h(
          'div',
          {},
          h('h2', { class: 'item-title', vars: colour, text: goods.name }),
          h('p', { class: 'item-meta', text: [KIND_NAMES[goods.kind], rarity?.name].filter(Boolean).join(' · ') }),
        ),
      ),
      goods.description && h('p', { class: 'sheet-text', text: goods.description }),
      h(
        'ul',
        { class: 'item-properties' },
        goods.scrap !== undefined && goods.scrap !== null && h('li', { class: 'item-price', text: `U złomiarza: ${formatDecimal(goods.scrap)} złota za sztukę` }),
        goods.gatherLevel && h('li', { text: `Do zebrania w Zielarstwie od poziomu ${goods.gatherLevel}.` }),
        h('li', { text: `Masz: ${formatNumber(owned(goods))} szt.` }),
      ),
    ),
    actions,
  );
}

// A stack in one line that opens its card under a tap (Jagna's herbs too).
export const stackButton = (goods, options, actions) =>
  h('button', { type: 'button', class: 'market-goods-button', 'aria-label': `${goods.name}: szczegóły`, onClick: () => goodsSheet(goods, actions?.()) }, stackLine(goods, options));

// An item to buy, its properties under a tap, and when the character can
// wear it: an item from the Targowisko is worn from its own level of the
// class on, as one from the Wymiana (241). `opened` keeps the unfolded ones by `key`
// through the panel's redraws.
function itemEntry(item, key, opened) {
  const character = state.character;
  const notes = [
    item.classIds && !item.classIds.includes(character.classId) && 'Twoja klasa nie może go używać.',
    character.classLevel < (item.classLevel ?? 1) && `Założysz go od poziomu klasy ${item.classLevel}.`,
  ].filter(Boolean);
  return [
    h(
      'details',
      {
        class: 'profile-item',
        open: opened.has(key),
        onToggle: (event) => (event.currentTarget.open ? opened.add(key) : opened.delete(key)),
      },
      h('summary', {}, itemSummary(item)),
      h(
        'ul',
        { class: 'item-properties' },
        item.properties.map((line) => h('li', { text: line })),
        item.classNames && h('li', { class: 'item-classes', text: `${item.classNames.length > 1 ? 'Dla klas' : 'Dla klasy'}: ${item.classNames.join(', ')}` }),
        item.price !== undefined && h('li', { class: 'item-price', text: `U złomiarza: ${formatNumber(item.price)} złota` }),
      ),
    ),
    notes.map((note) => h('p', { class: 'region-warning trade-note', text: note })),
  ];
}


// A whole number typed into a sheet, from `least` to `most`; an optional
// one may stay empty.
export function numberField(id, label, value, least, most) {
  const input = h('input', { type: 'number', id, class: 'trade-number', min: String(least), max: String(most), step: '1', inputmode: 'numeric', value: value === null ? '' : String(value) });
  const element = h('div', { class: 'trade-field' }, h('label', { for: id, class: 'trade-field-label', text: label }), input);
  const read = (optional = false) => {
    const raw = input.value.trim();
    if (optional && raw === '') return null;
    const number = Number(raw);
    if (raw === '' || !Number.isInteger(number) || number < least || number > most) throw new Error(`${label}: wpisz od ${formatNumber(least)} do ${formatNumber(most)}.`);
    return number;
  };
  return { element, read };
}

// The Targowisko's panel in `holder`: it loads its own data and redraws
// itself. `refresh` redraws it from what it has, as the character changes.
export function mountMarket(holder) {
  let market = null;
  let failure = null;
  let tab = 'offers';
  let timer = null;
  let gone = false;
  const opened = new Set();
  // The times left on the screen, moved on each half minute in place.
  let clocks = [];
  const clock = (at) => {
    const element = h('span', { text: left(at) });
    clocks.push({ element, at });
    return element;
  };
  const goodsEntry = (goods, key) => (goods.kind === 'item' ? itemEntry(goods.item, key, opened) : stackButton(goods));

  async function load() {
    try {
      ({ market } = await call('GET', '/api/market'));
      failure = null;
    } catch (error) {
      failure = error;
    }
    if (!gone) render();
  }

  // An action's answer is the Targowisko after it.
  const act = (button, path, body, done) =>
    withButton(button, async () => {
      const answer = await call('POST', path, body);
      market = answer.market;
      closeSheet();
      if (done) toast(typeof done === 'function' ? done(answer) : done);
      if (!gone) render();
    });

  // Reads a sheet's fields and acts, or says what is wrong with them.
  const submit = (path, read, done) => (event) => {
    let body;
    try {
      body = read();
    } catch (error) {
      toast(error.message);
      return;
    }
    act(event.currentTarget, path, body, done);
  };

  function bidSheet(offer) {
    const field = numberField('market-bid', 'Twoja oferta (zł)', offer.minBid, offer.minBid, Math.max(offer.minBid, state.character.gold));
    openSheet(
      h('h2', { class: 'sheet-title', text: 'Licytuj' }),
      goodsEntry(offer.goods, `bid:${offer.id}`),
      h(
        'p',
        { class: 'sheet-text' },
        `Najmniej ${formatNumber(offer.minBid)} zł. Złoto odchodzi od razu. Gdy ktoś Cię przebije, wraca do Ciebie, a gdy licytacja się skończy, towar czeka w zakładce „Moje”.`,
      ),
      offer.buyNow && h('p', { class: 'muted', text: `Za ${formatNumber(offer.buyNow)} zł kupisz od razu przyciskiem „Kup teraz”.` }),
      field.element,
      h(
        'div',
        { class: 'sheet-actions' },
        h('button', { type: 'button', class: 'button button--world', text: 'Anuluj', onClick: closeSheet }),
        h('button', {
          type: 'button',
          class: 'button button--system',
          text: 'Licytuj',
          onClick: submit('/api/market/bid', () => ({ offerId: offer.id, amount: field.read() }), (answer) => `Prowadzisz: ${formatNumber(answer.bid.amount)} zł.`),
        }),
      ),
    );
  }

  async function buyNow(offer, button) {
    const what = offer.goods.kind === 'item' ? offer.goods.name : `${offer.goods.name} ×${formatNumber(offer.goods.count)}`;
    const sure = await confirmAction({ title: 'Kupić teraz?', text: `${what} za ${formatNumber(offer.buyNow)} zł. Towar odbierzesz w zakładce „Moje”.`, confirmLabel: 'Kup' });
    if (sure) act(button, '/api/market/buy', { offerId: offer.id }, 'Kupione. Towar czeka w zakładce „Moje”.');
  }

  async function cancel(offer, button) {
    const sure = await confirmAction({ title: 'Wycofać ofertę?', text: 'Towar wróci do Ciebie przez „Do odebrania” w zakładce „Moje”.', confirmLabel: 'Wycofaj' });
    if (sure) act(button, '/api/market/cancel', { offerId: offer.id }, 'Oferta wycofana.');
  }

  function offerCard(offer) {
    const price = offer.bid
      ? `Najwyższa oferta: ${formatNumber(offer.bid)} zł (${countOf(offer.bids, 'licytacja', 'licytacje', 'licytacji')})`
      : `Cena wywoławcza: ${formatNumber(offer.startPrice)} zł`;
    const gold = state.character.gold;
    const actions = offer.own
      ? [
          offer.bid
            ? h('p', { class: 'muted', text: 'Ktoś licytuje, więc oferta zostaje do końca.' })
            : h('button', { type: 'button', class: 'button button--small', text: 'Wycofaj', onClick: (event) => cancel(offer, event.currentTarget) }),
        ]
      : [
          offer.leading
            ? h('span', { class: 'market-leading', text: 'Prowadzisz' })
            : h('button', {
                type: 'button',
                class: 'button button--world button--small',
                text: `Licytuj od ${formatNumber(offer.minBid)} zł`,
                disabled: gold < offer.minBid || Boolean(offer.buyNow && offer.minBid >= offer.buyNow),
                onClick: () => bidSheet(offer),
              }),
          offer.buyNow &&
            h('button', {
              type: 'button',
              class: 'button button--system button--small',
              text: `Kup teraz: ${formatNumber(offer.buyNow)} zł`,
              disabled: gold < offer.buyNow,
              onClick: (event) => buyNow(offer, event.currentTarget),
            }),
        ];
    return h(
      'li',
      { class: 'card market-offer' },
      goodsEntry(offer.goods, `offer:${offer.id}`),
      h('p', { class: 'market-price', text: price }),
      offer.own && offer.buyNow && h('p', { class: 'muted', text: `„Kup teraz”: ${formatNumber(offer.buyNow)} zł` }),
      h('p', { class: 'muted' }, `${offer.own ? 'Twoja oferta' : `Wystawia: ${offer.seller}`} · koniec za `, clock(offer.endsAt)),
      h('div', { class: 'settlement-actions' }, actions),
    );
  }

  // "Wystaw": the goods first, then the count and the prices.
  function listSheet() {
    const { items, stacks } = market.sellable;
    const choose = (goods) => h('button', { type: 'button', class: 'button button--world button--small', text: 'Wybierz', onClick: () => priceSheet(goods) });
    openSheet(
      h('h2', { class: 'sheet-title', text: 'Wystaw na Targowisku' }),
      h('p', { class: 'sheet-text', text: `Oferta trwa ${market.hours} godziny. Przy sprzedaży Targowisko bierze ${Math.round(market.fee * 100)}% ceny.` }),
      items.length + stacks.length === 0 && h('p', { class: 'muted', text: 'W plecaku nie ma nic do wystawienia. Założonych przedmiotów się nie wystawia.' }),
      items.length > 0 && h('ul', { class: 'market-picks' }, items.map((item) => h('li', { class: 'market-pick' }, itemSummary(item), choose({ kind: 'item', itemId: item.id, name: item.name, count: 1 })))),
      stacks.length > 0 && h('ul', { class: 'market-picks' }, stacks.map((stack) => h('li', { class: 'market-pick' }, stackLine(stack), choose(stack)))),
    );
  }

  function priceSheet(goods) {
    const { maxPrice } = market;
    const count = goods.kind === 'item' ? null : numberField('market-count', `Ile sztuk (masz ${formatNumber(goods.count)})`, goods.count, 1, goods.count);
    const start = numberField('market-start', 'Cena wywoławcza (zł)', null, 1, maxPrice);
    const now = numberField('market-buy-now', '„Kup teraz” (zł, może zostać puste)', null, 1, maxPrice);
    openSheet(
      h('h2', { class: 'sheet-title', text: goods.name }),
      count && h('p', { class: 'sheet-text', text: 'Cena dotyczy wszystkich wystawionych sztuk razem.' }),
      count?.element,
      start.element,
      now.element,
      h(
        'div',
        { class: 'sheet-actions' },
        h('button', { type: 'button', class: 'button button--world', text: 'Anuluj', onClick: closeSheet }),
        h('button', {
          type: 'button',
          class: 'button button--system',
          text: 'Wystaw',
          onClick: submit(
            '/api/market/list',
            () => ({
              kind: goods.kind,
              ...(goods.kind === 'item' ? { itemId: goods.itemId } : { key: goods.key, count: count.read() }),
              startPrice: start.read(),
              buyNow: now.read(true),
            }),
            'Wystawione na Targowisku.',
          ),
        }),
      ),
    );
  }

  function mineTab() {
    const collect = (event) =>
      act(event.currentTarget, '/api/market/collect', {}, ({ collected }) =>
        collected.left > 0 ? `Odebrane. Reszta poczeka, aż zrobisz miejsce w plecaku: ${countOf(collected.left, 'paczka', 'paczki', 'paczek')}.` : 'Odebrane.',
      );
    return [
      h(
        'section',
        { class: 'stack' },
        h('h2', { class: 'section-title', text: 'Do odebrania' }),
        market.parcels.length === 0
          ? h('p', { class: 'muted', text: 'Nic na Ciebie nie czeka.' })
          : [
              h(
                'ul',
                { class: 'market-picks' },
                market.parcels.map((parcel) =>
                  h(
                    'li',
                    { class: 'market-pick' },
                    parcel.goods.kind === 'item' ? itemSummary(parcel.goods.item) : stackLine(parcel.goods),
                    h('span', { class: 'muted market-reason', text: REASONS[parcel.reason] ?? '' }),
                  ),
                ),
              ),
              h('button', { type: 'button', class: 'button button--system', text: 'Odbierz wszystko', onClick: collect }),
            ],
      ),
      h(
        'section',
        { class: 'stack' },
        h('h2', { class: 'section-title', text: `Moje oferty: ${market.mine.length} z ${market.limit}` }),
        h('p', { class: 'muted', text: 'Każdy kolejny stopień reputacji Kompanii Kupców daje miejsce na jeszcze jedną ofertę.' }),
        h('button', { type: 'button', class: 'button button--world', text: 'Wystaw', disabled: market.mine.length >= market.limit, onClick: listSheet }),
        market.mine.length > 0 && h('ul', { class: 'stack market-list' }, market.mine.map(offerCard)),
      ),
    ];
  }

  function merchantSheet(good) {
    const most = Math.min(good.left, Math.max(1, Math.floor(state.character.gold / good.price)));
    const field = numberField('market-merchant-count', 'Ile sztuk', 1, 1, most);
    openSheet(
      h('h2', { class: 'sheet-title', text: good.name }),
      h('p', { class: 'sheet-text', text: `${formatNumber(good.price)} zł za sztukę. Dziś możesz kupić jeszcze ${formatNumber(good.left)} szt.` }),
      field.element,
      h(
        'div',
        { class: 'sheet-actions' },
        h('button', { type: 'button', class: 'button button--world', text: 'Anuluj', onClick: closeSheet }),
        h('button', {
          type: 'button',
          class: 'button button--system',
          text: 'Kup',
          onClick: submit('/api/market/resident', () => ({ from: 'merchant', id: good.id, count: field.read() }), ({ bought }) => `Kupione: ${bought.name} ×${formatNumber(bought.count)}.`),
        }),
      ),
    );
  }

  async function buyItem(good, button) {
    const sure = await confirmAction({ title: 'Kupić przedmiot?', text: `${good.name} za ${formatNumber(good.price)} zł. Trafi prosto do plecaka.`, confirmLabel: 'Kup' });
    if (sure) act(button, '/api/market/resident', { from: 'wanderer', id: good.id }, ({ bought }) => `${bought.name}: w plecaku.`);
  }

  function residentsTab() {
    const { merchant, wanderer } = market;
    const gold = state.character.gold;
    return [
      h(
        'section',
        { class: 'stack' },
        h('h2', { class: 'section-title', text: 'Kupiec' }),
        h('p', { class: 'muted' }, 'Towar i ceny zmieniają się codziennie. Nowe za ', clock(merchant.endsAt), '.'),
        // The relation with him lowers his prices (287 A).
        h('p', {
          class: 'muted',
          text: merchant.discount > 0 ? `Dzięki relacji z Gościwitem ceny są niższe o ${formatDecimal(merchant.discount * 100)}%.` : 'Z lepszą relacją z Gościwitem ceny będą niższe.',
        }),
        h(
          'ul',
          { class: 'stack market-list' },
          merchant.goods.map((good) =>
            h(
              'li',
              { class: 'card market-offer' },
              stackButton(good, { count: false }, () => [
                h('p', { class: 'market-price', text: `Kupiec: ${formatNumber(good.price)} zł za sztukę, dziś jeszcze ${formatNumber(good.left)} szt.` }),
                h('button', {
                  type: 'button',
                  class: 'button button--world',
                  text: 'Kup',
                  disabled: good.left < 1 || state.character.gold < good.price,
                  onClick: () => merchantSheet(good),
                }),
              ]),
              h('p', { class: 'market-price', text: `${formatNumber(good.price)} zł za sztukę` }),
              h('p', { class: 'muted', text: good.left > 0 ? `Dziś jeszcze ${formatNumber(good.left)} szt.` : 'Na dziś wykupione.' }),
              h(
                'div',
                { class: 'settlement-actions' },
                h('button', { type: 'button', class: 'button button--world button--small', text: 'Kup', disabled: good.left < 1 || gold < good.price, onClick: () => merchantSheet(good) }),
              ),
            ),
          ),
        ),
      ),
      h(
        'section',
        { class: 'stack' },
        h('h2', { class: 'section-title', text: 'Wędrowny handlarz' }),
        wanderer.goods
          ? [
              h('p', { class: 'muted' }, 'Przyszedł tylko na dziś. Odejdzie za ', clock(wanderer.endsAt), '.'),
              h(
                'ul',
                { class: 'stack market-list' },
                wanderer.goods.map((good) =>
                  h(
                    'li',
                    { class: 'card market-offer' },
                    itemEntry(good.item, `wanderer:${good.id}`, opened),
                    h('p', { class: 'market-price', text: `${formatNumber(good.price)} zł` }),
                    h(
                      'div',
                      { class: 'settlement-actions' },
                      good.bought
                        ? h('span', { class: 'market-leading', text: 'Kupione' })
                        : h('button', { type: 'button', class: 'button button--world button--small', text: 'Kup', disabled: gold < good.price, onClick: (event) => buyItem(good, event.currentTarget) }),
                    ),
                  ),
                ),
              ),
            ]
          : wanderer.startsAt > serverNow()
            ? h('p', { class: 'muted' }, 'Przychodzi raz w tygodniu na jeden dzień. Będzie za ', clock(wanderer.startsAt), '.')
            : h('p', { class: 'muted', text: 'W tym tygodniu już był. Przyjdzie w następnym.' }),
      ),
    ];
  }

  // The times it shows: when one of them passes, the Targowisko is asked
  // again, as an offer ended or a resident came or went.
  const deadlines = () => [
    ...market.offers.map((offer) => offer.endsAt),
    ...market.mine.map((offer) => offer.endsAt),
    market.merchant.endsAt,
    market.wanderer.goods ? market.wanderer.endsAt : market.wanderer.startsAt,
  ];

  // Each half minute the times left move on; when one of them passes, as an
  // offer ends or a resident comes or goes, the Targowisko is asked anew.
  function tick() {
    clearTimeout(timer);
    if (gone || !market) return;
    const now = serverNow();
    if (deadlines().some((at) => at <= now && at > shownAt)) {
      load();
      return;
    }
    for (const { element, at } of clocks) element.textContent = left(at);
    timer = setTimeout(tick, 30000);
  }
  let shownAt = 0;

  function render() {
    clearTimeout(timer);
    clocks = [];
    if (failure) {
      holder.replaceChildren(systemPanel(failure.message));
      return;
    }
    if (!market) {
      holder.replaceChildren(h('p', { class: 'muted', text: 'Wczytywanie Targowiska…' }));
      return;
    }
    const body =
      tab === 'offers'
        ? market.offers.length === 0
          ? h('p', { class: 'muted', text: 'Nikt nic teraz nie wystawia.' })
          : h('ul', { class: 'stack market-list' }, market.offers.map(offerCard))
        : tab === 'mine'
          ? mineTab()
          : residentsTab();
    holder.replaceChildren(
      h(
        'div',
        { class: 'stack' },
        h(
          'section',
          { class: 'card market-intro', 'data-guide': 'market-intro' },
          h('p', { text: `Licytacja trwa ${market.hours} godziny. Przebity gracz od razu dostaje złoto z powrotem, a Targowisko bierze ${Math.round(market.fee * 100)}% ceny sprzedaży.` }),
          h('p', { class: 'muted', text: `Handel daje reputację Kompanii Kupców, dziś ${market.trade.today} z ${market.trade.daily} pkt. Postacie z jednego konta nie kupują od siebie.` }),
        ),
        h(
          'div',
          { class: 'chat-tabs market-tabs', role: 'tablist', 'aria-label': 'Targowisko' },
          TABS.map(([id, label]) =>
            h(
              'button',
              {
                type: 'button',
                class: 'chat-tab',
                role: 'tab',
                'data-guide': `market-tab-${id}`,
                'aria-selected': String(tab === id),
                onClick: () => {
                  tab = id;
                  render();
                },
              },
              h('span', { class: 'chat-tab-name', text: label }),
              id === 'mine' && market.parcels.length > 0 && h('span', { class: 'community-dot', role: 'img', 'aria-label': 'czeka do odebrania' }),
            ),
          ),
        ),
        body,
      ),
    );
    shownAt = serverNow();
    timer = setTimeout(tick, 30000);
  }

  render();
  load();
  return {
    refresh: () => {
      if (!gone) render();
    },
    unmount() {
      gone = true;
      clearTimeout(timer);
    },
  };
}

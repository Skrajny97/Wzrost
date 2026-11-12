// The Targowisko in the Osada (src/server/market.js, questions 237–242): the
// players' offers as auctions, the character's own offers with "Wystaw" and
// what waits to be collected, the residents' offers: the merchant's goods
// of the day and the wandering trader on his day of the week, and the
// Rejestr of the character's trade. The players' offers have filters for
// the character ("Wszystko", "Dla mnie", "Licytuję") with the categories
// under them, and the goods to put up filters by category. The search over
// the players' offers is the server's (browseOffers in the engine), over
// all of them, a page at a time (a player's remarks passed on by the
// author, 11.11.2026: "za chwilę każdy będzie wystawiał coś i strasznie
// ciężko będzie coś znaleźć"): the kinds of goods as tabs of their own, the
// class an item is for, who of the character's own can put it on, the
// rarity and the order by price.
//
// The Osada's place screen mounts the panel once and keeps it while it
// redraws itself, so a redraw never asks the server again.

import { herbSprite, mineralSprite, potionSprite } from '../art.js';
import { ALL, BIDDING, FOR_ME, categoriesOf, goodsCategory, inCategory, shownCategory } from '../categories.js';
import { materialIcon } from '../craft-table.js';
import { fill, h, icon } from '../dom.js';
import { countOf, dateTimeFormat, formatDecimal, formatNumber, tradePace } from '../format.js';
import { t } from '../i18n.js';
import { call, serverNow, state } from '../state.js';
import { closeSheet, confirmAction, howItWorks, openSheet, systemPanel, toast, withButton } from '../ui.js';
import { compareTable, itemSummary } from './character.js';

// The tabs and the names of kinds and reasons below are Polish, shown
// through t(). The Rejestr of the character's trade (the author,
// 10.11.2026: "Zbudować rejestr na targowisku sprzedanych i odebranych
// przedmiotów (oraz wygranych w licytacjach)") has a tab of its own.
const TABS = [
  ['offers', 'Oferty graczy'],
  ['mine', 'Moje'],
  ['residents', 'Mieszkańcy'],
  ['log', 'Rejestr'],
];
// The filters over the players' offers (the author, 10.11.2026: "Wywalić
// aktualne filtry Targowiska i zrobić bardziej przydatne - Licytowane przeze
// mnie, Do założenia przeze mnie (czy tam moją klasę)"): what each shows when
// it holds nothing.
const OFFER_FILTERS = [
  [ALL, 'Wszystko'],
  [FOR_ME, 'Dla mnie'],
  [BIDDING, 'Licytuję'],
];
const NO_OFFERS = {
  [FOR_ME]: 'Nikt nie wystawia teraz przedmiotu, który możesz założyć.',
  [BIDDING]: 'Nie licytujesz teraz żadnej oferty.',
};
const KIND_NAMES = { herb: 'zioło', potion: 'mikstura', material: 'materiał', part: 'część', mineral: 'minerał' };
// The same kinds as the filters name them, in their order.
const KIND_GROUPS = { herb: 'Zioła', potion: 'Mikstury', material: 'Materiały', part: 'Części', mineral: 'Minerały' };
// The kinds of goods as tabs of their own under "Wszystko", items first (a
// player's remark, 11.11.2026: "osobne zakładki na mikstury, zioła i
// materiały"), each with what it holds when it holds nothing.
const KIND_TABS = [
  ['item', 'Przedmioty'],
  ['herb', 'Zioła'],
  ['potion', 'Mikstury'],
  ['material', 'Materiały'],
  ['mineral', 'Minerały'],
  ['part', 'Części'],
];
const NO_KIND = {
  item: 'Nikt nie wystawia teraz przedmiotów.',
  herb: 'Nikt nie wystawia teraz ziół.',
  potion: 'Nikt nie wystawia teraz mikstur.',
  material: 'Nikt nie wystawia teraz materiałów.',
  mineral: 'Nikt nie wystawia teraz minerałów.',
  part: 'Nikt nie wystawia teraz części.',
};
// The order of the offers (a player's remark, 11.11.2026: "od najtańszych i
// od najdroższych"): the soonest to end first, as before, or by the price
// of a piece. The choice stays on the device, as the bag's order.
const SORTS = [
  ['ends', 'Kończące się'],
  ['cheap', 'Najtańsze'],
  ['dear', 'Najdroższe'],
];
const SORT_KEY = 'insight-market-sort';
function savedSort() {
  try {
    const saved = localStorage.getItem(SORT_KEY);
    return SORTS.some(([id]) => id === saved) ? saved : 'ends';
  } catch {
    return 'ends';
  }
}
function saveSort(sort) {
  try {
    localStorage.setItem(SORT_KEY, sort);
  } catch {
    // The order then lasts for this visit only.
  }
}
const REASONS = { won: 'wygrana licytacja', bought: 'kupione', returned: 'wraca do Ciebie', sold: 'zapłata za sprzedaż' };
const kindName = (kind) => (KIND_NAMES[kind] ? t(KIND_NAMES[kind]) : null);
const rarityOf = (id) => state.content?.rarities?.find((rarity) => rarity.id === id);

// What is left until `at`: "2 dni 5 h", "5 h 12 min", "12 min".
function left(at) {
  const minutes = Math.ceil(Math.max(0, at - serverNow()) / 60000);
  if (minutes <= 0) return t('chwilę');
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${countOf(days, 'dzień', 'dni', 'dni')} ${hours % 24} h`;
  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

// A stack's picture by its kind.
export function stackArt(goods, size = 24) {
  if (goods.kind === 'herb') return herbSprite(goods.key) ?? icon('leaf', { size });
  if (goods.kind === 'potion') return potionSprite(goods.key) ?? icon('flask', { size });
  if (goods.kind === 'material') return materialIcon(goods.material.materialId, size);
  if (goods.kind === 'part') return materialIcon(goods.key, size);
  if (goods.kind === 'mineral') return mineralSprite(goods.key) ?? icon('ore', { size });
  return icon('coin', { size });
}

// A stack, or a parcel's gold, in one line; `meta` in place of its kind,
// as a price.
function stackLine(goods, { count = true, meta } = {}) {
  const rarity = rarityOf(goods.rarity);
  const name = goods.kind === 'gold' ? t('{gold} zł', { gold: formatNumber(goods.count) }) : count ? `${goods.name} ×${formatNumber(goods.count)}` : goods.name;
  return h(
    'span',
    { class: 'item-summary-art market-goods' },
    h('span', { class: 'potion-pick-art' }, stackArt(goods)),
    h(
      'span',
      { class: 'item-summary' },
      h('span', { class: 'item-name', vars: rarity ? { '--rarity': rarity.color } : {}, text: name }),
      goods.kind !== 'gold' && h('span', { class: 'item-meta', text: meta ?? [kindName(goods.kind), rarity?.name].filter(Boolean).join(' · ') }),
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
  if (goods.kind === 'mineral') return character.minerals?.find((one) => one.id === goods.key)?.count ?? 0;
  return 0;
}

// A stack's card (the author: "bym mogl kliknac przedmiot i go sprawdzić u
// kupca"): its picture, what it is, what the scrapper pays for a piece, the
// Zielarstwo level that gathers a herb, the Górnictwo level that digs a gem
// or an ore, and how many the character has;
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
          h('p', { class: 'item-meta', text: [kindName(goods.kind), rarity?.name].filter(Boolean).join(' · ') }),
        ),
      ),
      goods.description && h('p', { class: 'sheet-text', text: goods.description }),
      h(
        'ul',
        { class: 'item-properties' },
        goods.scrap !== undefined && goods.scrap !== null && h('li', { class: 'item-price', text: t('U złomiarza: {gold} złota za sztukę', { gold: formatDecimal(goods.scrap) }) }),
        goods.gatherLevel && h('li', { text: t('Do zebrania w Zielarstwie od poziomu {level}.', { level: goods.gatherLevel }) }),
        goods.mineLevel && h('li', { text: t('Do wydobycia w Górnictwie od poziomu {level}.', { level: goods.mineLevel }) }),
        h('li', { text: t('Masz: {count} szt.', { count: formatNumber(owned(goods)) }) }),
      ),
    ),
    actions,
  );
}

// A stack in one line that opens its card under a tap (Jagna's herbs too).
export const stackButton = (goods, options, actions) =>
  h('button', { type: 'button', class: 'market-goods-button', 'aria-label': t('{name}: szczegóły', { name: goods.name }), onClick: () => goodsSheet(goods, actions?.()) }, stackLine(goods, options));

// An item to buy, its properties under a tap with the comparison to the
// one the character wears in its slot (the author: "jak klikamy dany
// przedmiot to nie tylko pojawiają się dane przedmiotu, ale i otwiera
// porównywarka z aktualnym przedmiotem"), and when the character can wear
// it: from its Tier, as every item. `opened` keeps the unfolded ones by
// `key` through the panel's redraws. The Salon Gier shows its prizes so too.
// `notes: false` leaves out when the character can wear it, as the
// Rejestr's goods already traded. `wearers` (the server's, wearersOf in the
// engine) names the companions of `team` who can put it on now: the card
// compares it with what each of them wears there too (a player's remark
// passed on by the author, 11.11.2026), the one shopped for (`first`, "Dla
// mnie" for a companion) before the character, whose notes then say
// nothing.
export function itemEntry(item, key, opened, { notes: noted = true, wearers = null, team = [], first = 'me' } = {}) {
  const character = state.character;
  const usable = !item.classIds || item.classIds.includes(character.classId);
  const worn = character.equipment?.[item.slot] ?? null;
  const own = first === 'me';
  const notes = [
    noted && own && !usable && t('Twoja klasa nie może go używać.'),
    noted && own && character.classLevel < (item.classLevel ?? 1) && t('Założysz go od poziomu klasy {level}.', { level: item.classLevel }),
  ].filter(Boolean);
  const companions = (wearers ?? []).map((id) => team.find((companion) => companion.id === id)).filter(Boolean);
  const chosen = companions.find((companion) => companion.id === first);
  const others = companions.filter((companion) => companion !== chosen);
  return [
    h(
      'details',
      {
        class: 'profile-item',
        open: opened.has(key),
        onToggle: (event) => (event.currentTarget.open ? opened.add(key) : opened.delete(key)),
      },
      h('summary', {}, itemSummary(item, { tier: true })),
      h(
        'ul',
        { class: 'item-properties' },
        item.properties.map((line) => h('li', { text: line })),
        item.classNames &&
          h('li', {
            class: 'item-classes',
            text: item.classNames.length > 1 ? t('Dla klas: {classes}', { classes: item.classNames.join(', ') }) : t('Dla klasy: {classes}', { classes: item.classNames.join(', ') }),
          }),
        // Raised by the Kowal, once per item: a buyer sees it before buying
        // (the author, 12.11.2026).
        item.raised && h('li', { class: 'item-classes', text: t('Kowal już przekuł go na wyższą rzadkość: drugi raz się nie da.') }),
        item.price !== undefined && h('li', { class: 'item-price', text: t('U złomiarza: {gold} złota', { gold: formatNumber(item.price) }) }),
      ),
      chosen && companionCompare(chosen, item),
      usable && (worn ? compareTable(item, worn) : h('p', { class: 'muted', text: t('W miejscu „{slot}” postać nic teraz nie nosi.', { slot: item.slotName }) })),
      others.map((companion) => companionCompare(companion, item)),
    ),
    notes.map((note) => h('p', { class: 'region-warning trade-note', text: note })),
  ];
}

// An item beside what a companion who can put it on wears in its place
// (its weapon, its armour, or its one piece of jewellery for an amulet, a
// ring or a talisman), as "Załóż z plecaka" in the Kwatery compares them.
function companionCompare(companion, item) {
  const worn = (companion.wear.find((place) => place.slot === item.slot) ?? companion.wear.find((place) => place.slot === 'jewelry'))?.item ?? null;
  return worn
    ? compareTable(item, worn, { title: t('Porównanie z tym, co nosi {name}', { name: companion.name }), wornLabel: t('Nosi') })
    : h('p', { class: 'muted', text: t('W tym miejscu {name} nic teraz nie nosi.', { name: companion.name }) });
}

// The categories of goods in their order: the items by their slot, named as
// in the data (data/slots.json), then the stacks by their kind.
const goodsCategories = () => [
  ...state.content.slots.map(({ id, name }) => ({ id, name })),
  ...Object.entries(KIND_GROUPS).map(([id, name]) => ({ id, name: t(name) })),
];

// Chips over a long list of goods that show one category of them at a time
// (the author: "filtracja potrzebna w targowisku zeby szukac itemy po
// kategoriach, bo jak jest duzo w plecaku to lista przytłaczająca"):
// "Wszystko" first, then each category with something in the list, with how
// many; no chips while there is only one. `filter.id` keeps the choice
// through the panel's redraws and the sheet opened again, and gives way to
// "Wszystko" once its category is empty. `draw` makes the list of the goods
// shown, drawn anew in place under the chips.
function filtered(entries, categoryOf, filter, draw) {
  const categories = categoriesOf(entries, categoryOf, goodsCategories());
  filter.id = shownCategory(filter.id, categories);
  const list = h('div', { class: 'market-filtered' }, draw(inCategory(entries, categoryOf, filter.id)));
  if (categories.length < 2) return list;
  const options = [{ id: ALL, name: t('Wszystko'), count: entries.length }, ...categories];
  const chips = options.map(({ id, name, count }) =>
    h(
      'button',
      {
        type: 'button',
        class: 'market-filter',
        'aria-pressed': String(id === filter.id),
        onClick: (event) => {
          if (id === filter.id) return;
          filter.id = id;
          chips.forEach((chip, index) => chip.setAttribute('aria-pressed', String(options[index].id === id)));
          // A sheet keeps its height for a shorter list, so that the chips
          // stay where the finger is.
          const body = event.currentTarget.closest('.sheet-body');
          if (body) body.style.minHeight = `${body.parentElement.clientHeight}px`;
          fill(list, draw(inCategory(entries, categoryOf, id)));
        },
      },
      name,
      ' ',
      h('span', { class: 'market-filter-count', text: formatNumber(count) }),
    ),
  );
  return [h('div', { class: 'market-filters', role: 'group', 'aria-label': t('Kategoria towaru') }, chips), list];
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
    if (raw === '' || !Number.isInteger(number) || number < least || number > most) throw new Error(t('{label}: wpisz od {least} do {most}.', { label, least: formatNumber(least), most: formatNumber(most) }));
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
  // The category chosen over the goods to put up, for this visit to the
  // Targowisko.
  const filters = { sellable: { id: ALL } };
  // The search over the players' offers, for this visit to the Targowisko
  // but its order (savedSort): which offers (`show`: "Wszystko", "Dla mnie"
  // or "Licytuję"), the tab of the kind of goods, the class an item is for,
  // who of the character's own shops ("Dla mnie": 'me' or a companion's
  // id), the Tier of an item, the rarity, the category, the order and how
  // many offers (null: a page). The server answers with the search as it
  // made it (`view`), a choice with nothing left in it given way.
  const view = { show: ALL, kind: 'item', classId: null, who: 'me', tier: null, rarity: null, category: ALL, sort: savedSort(), limit: null };
  // The search as the server takes it, in a query or an action's body.
  const asked = () => {
    const search = { show: view.show, sort: view.sort };
    if (view.show === ALL) search.kind = view.kind;
    if (view.show === ALL && view.kind === 'item' && view.classId) search.classId = view.classId;
    if (view.show === FOR_ME) search.who = view.who;
    if (view.tier) search.tier = view.tier;
    if (view.rarity) search.rarity = view.rarity;
    if (view.category !== ALL) search.category = view.category;
    if (view.limit) search.limit = String(view.limit);
    return search;
  };
  // The answer's search over the page's: the choices that gave way.
  const answered = (made) => {
    view.tier = made.tier ?? null;
    view.rarity = made.rarity;
    view.category = made.category;
    view.limit = made.limit;
    if (made.show === FOR_ME) view.who = made.who;
    if (made.show === ALL && made.kind === 'item') view.classId = made.classId;
  };
  // The answer asked for last; one overtaken by a later choice is left.
  let asks = 0;
  let searching = false;
  // The Rejestr, asked each time its tab opens: { since, limit, log }, or
  // null while on its way.
  let register = null;
  let registerFailure = null;
  // The times left on the screen, moved on each half minute in place.
  let clocks = [];
  const clock = (at) => {
    const element = h('span', { text: left(at) });
    clocks.push({ element, at });
    return element;
  };
  // An offer's goods; an item compared with what the character and each of
  // its companions who can put it on wear (among the players' offers "Dla
  // mnie" for a companion: that one first).
  const goodsEntry = (goods, key, wearers = null) =>
    goods.kind === 'item'
      ? itemEntry(goods.item, key, opened, { wearers, team: market?.team ?? [], first: tab === 'offers' && view.show === FOR_ME ? view.who : 'me' })
      : stackButton(goods);

  async function load() {
    const ask = ++asks;
    searching = true;
    try {
      const answer = await call('GET', `/api/market?${new URLSearchParams(asked())}`);
      if (ask !== asks) return;
      market = answer.market;
      answered(market.view);
      failure = null;
    } catch (error) {
      if (ask !== asks) return;
      searching = false;
      // With the Targowisko already on the screen, it stays and the game
      // asks again in half a minute (as the Osada does).
      if (market) {
        if (gone) return;
        render();
        clearTimeout(timer);
        timer = setTimeout(load, 30000);
        return;
      }
      failure = error;
    }
    searching = false;
    if (!gone) render();
    if (tab === 'log') loadRegister();
  }

  // A choice of the search: the controls show it at once over the list as
  // it was, dimmed, until the server's answer; "Pokaż kolejne" asks for a
  // page more of the same.
  function search(changes) {
    Object.assign(view, { limit: null }, changes);
    searching = true;
    render();
    load();
  }

  // The Rejestr, from the server anew: what ended meanwhile is in it.
  async function loadRegister() {
    try {
      register = await call('GET', '/api/market/log');
      registerFailure = null;
    } catch (error) {
      if (!register) registerFailure = error;
    }
    if (!gone && tab === 'log') render();
  }

  // An action's answer is the Targowisko after it, with the page's search.
  const act = (button, path, body, done) =>
    withButton(button, async () => {
      const answer = await call('POST', path, { ...body, view: asked() });
      asks += 1;
      searching = false;
      market = answer.market;
      answered(market.view);
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
    const field = numberField('market-bid', t('Twoja oferta (zł)'), offer.minBid, offer.minBid, Math.max(offer.minBid, state.character.gold));
    openSheet(
      h('h2', { class: 'sheet-title', text: t('Licytuj') }),
      goodsEntry(offer.goods, `bid:${offer.id}`, offer.wearers),
      h(
        'p',
        { class: 'sheet-text' },
        t('Najmniej {gold} zł. Złoto odchodzi od razu. Gdy ktoś Cię przebije, wraca do Ciebie, a gdy licytacja się skończy, towar czeka w zakładce „Moje”.', { gold: formatNumber(offer.minBid) }),
      ),
      offer.buyNow && h('p', { class: 'muted', text: t('Za {gold} zł kupisz od razu przyciskiem „Kup teraz”.', { gold: formatNumber(offer.buyNow) }) }),
      field.element,
      h(
        'div',
        { class: 'sheet-actions' },
        h('button', { type: 'button', class: 'button button--world', text: t('Anuluj'), onClick: closeSheet }),
        h('button', {
          type: 'button',
          class: 'button button--system',
          text: t('Licytuj'),
          onClick: submit('/api/market/bid', () => ({ offerId: offer.id, amount: field.read() }), (answer) => t('Prowadzisz: {gold} zł.', { gold: formatNumber(answer.bid.amount) })),
        }),
      ),
    );
  }

  async function buyNow(offer, button) {
    const what = offer.goods.kind === 'item' ? offer.goods.name : `${offer.goods.name} ×${formatNumber(offer.goods.count)}`;
    const sure = await confirmAction({
      title: t('Kupić teraz?'),
      text: t('{what} za {gold} zł. Towar odbierzesz w zakładce „Moje”.', { what, gold: formatNumber(offer.buyNow) }),
      confirmLabel: t('Kup'),
    });
    if (sure) act(button, '/api/market/buy', { offerId: offer.id }, t('Kupione. Towar czeka w zakładce „Moje”.'));
  }

  async function cancel(offer, button) {
    const sure = await confirmAction({ title: t('Wycofać ofertę?'), text: t('Towar wróci do Ciebie przez „Do odebrania” w zakładce „Moje”.'), confirmLabel: t('Wycofaj') });
    if (sure) act(button, '/api/market/cancel', { offerId: offer.id }, t('Oferta wycofana.'));
  }

  function offerCard(offer) {
    const price = offer.bid
      ? t('Najwyższa oferta: {gold} zł ({bids})', { gold: formatNumber(offer.bid), bids: countOf(offer.bids, 'licytacja', 'licytacje', 'licytacji') })
      : t('Cena wywoławcza: {gold} zł', { gold: formatNumber(offer.startPrice) });
    const gold = state.character.gold;
    const actions = offer.own
      ? [
          offer.bid
            ? h('p', { class: 'muted', text: t('Ktoś licytuje, więc oferta zostaje do końca.') })
            : h('button', { type: 'button', class: 'button button--small', text: t('Wycofaj'), onClick: (event) => cancel(offer, event.currentTarget) }),
        ]
      : [
          // An auction it bids on says whether it leads or was outbid
          // ("Licytuję").
          !offer.leading && offer.myBid !== null && offer.myBid !== undefined && h('span', { class: 'market-outbid', text: t('Przebito Cię') }),
          offer.leading
            ? h('span', { class: 'market-leading', text: t('Prowadzisz') })
            : h('button', {
                type: 'button',
                class: 'button button--world button--small',
                text: t('Licytuj od {gold} zł', { gold: formatNumber(offer.minBid) }),
                disabled: gold < offer.minBid || Boolean(offer.buyNow && offer.minBid >= offer.buyNow),
                onClick: () => bidSheet(offer),
              }),
          offer.buyNow &&
            h('button', {
              type: 'button',
              class: 'button button--system button--small',
              text: t('Kup teraz: {gold} zł', { gold: formatNumber(offer.buyNow) }),
              disabled: gold < offer.buyNow,
              onClick: (event) => buyNow(offer, event.currentTarget),
            }),
        ];
    // A stack's price for a piece, as the order by price counts it.
    const pieces = offer.goods.kind !== 'item' && offer.goods.count > 1 ? (offer.bid ?? offer.startPrice) / offer.goods.count : null;
    return h(
      'li',
      { class: 'card market-offer' },
      goodsEntry(offer.goods, `offer:${offer.id}`, offer.wearers),
      h('p', { class: 'market-price', text: price }),
      pieces !== null && h('p', { class: 'muted market-piece', text: t('Za sztukę: {gold} zł', { gold: formatDecimal(Math.round(pieces * 10) / 10) }) }),
      !offer.own && !offer.leading && offer.myBid && h('p', { class: 'muted', text: t('Twoja ostatnia oferta: {gold} zł', { gold: formatNumber(offer.myBid) }) }),
      offer.own && offer.buyNow && h('p', { class: 'muted', text: t('„Kup teraz”: {gold} zł', { gold: formatNumber(offer.buyNow) }) }),
      h('p', { class: 'muted' }, offer.own ? t('Twoja oferta · koniec za ') : t('Wystawia: {name} · koniec za ', { name: offer.seller }), clock(offer.endsAt)),
      h('div', { class: 'settlement-actions' }, actions),
    );
  }

  // What the scrapper pays for the goods, under their name while the player
  // chooses what to put up (the author: "Niech przy wyborze czegoś do
  // wystawienia na licytacji pokazuje za ile dany przedmiot idzie u
  // złomiarza"); goods he does not buy, as parts, show nothing.
  const scrapText = (price, each = false) =>
    typeof price === 'number'
      ? each
        ? t('U złomiarza: {gold} zł za sztukę', { gold: formatDecimal(price) })
        : t('U złomiarza: {gold} zł', { gold: formatDecimal(price) })
      : null;
  const pickWithScrap = (summary, text) => (text ? h('span', { class: 'market-pick-goods' }, summary, h('span', { class: 'muted market-scrap', text })) : summary);

  // "Wystaw": the goods first, then the count and the prices.
  function listSheet() {
    const { items, stacks } = market.sellable;
    const choose = (goods) => h('button', { type: 'button', class: 'button button--world button--small', text: t('Wybierz'), onClick: () => priceSheet(goods) });
    // The bag's items as goods, so that the filters sort them with the stacks.
    const goods = [...items.map((item) => ({ kind: 'item', item })), ...stacks];
    const picks = (shown) => {
      const bag = shown.filter((one) => one.kind === 'item');
      const others = shown.filter((one) => one.kind !== 'item');
      return [
        bag.length > 0 &&
          h(
            'ul',
            { class: 'market-picks' },
            bag.map(({ item }) =>
              h('li', { class: 'market-pick' }, pickWithScrap(itemSummary(item, { tier: true }), scrapText(item.price)), choose({ kind: 'item', itemId: item.id, name: item.name, count: 1, scrap: item.price })),
            ),
          ),
        others.length > 0 &&
          h(
            'ul',
            { class: 'market-picks' },
            others.map((stack) => h('li', { class: 'market-pick' }, pickWithScrap(stackLine(stack), scrapText(stack.scrap, true)), choose(stack))),
          ),
      ];
    };
    openSheet(
      h('h2', { class: 'sheet-title', text: t('Wystaw na Targowisku') }),
      h('p', {
        class: 'sheet-text',
        text: t('Ofertę wystawisz na {hours}. Przy sprzedaży Targowisko bierze {fee}% ceny.', {
          hours: `${market.minHours}–${countOf(market.hours, 'godzinę', 'godziny', 'godzin')}`,
          fee: formatDecimal(market.fee * 100),
        }),
      }),
      goods.length === 0
        ? h('p', { class: 'muted', text: t('W plecaku nie ma nic do wystawienia. Założonych przedmiotów się nie wystawia.') })
        : filtered(goods, goodsCategory, filters.sellable, picks),
    );
  }

  // The auction's length, an hour a step from the shortest to the longest
  // (the author: "Czas licytacji powinien moc byc do wyboru od 1h do 24h po
  // godzinie suwak sie przesuwający"). It starts at the usual longest, 24 h,
  // also when the Kompania Kupców lets the character go on longer (592).
  function hoursPicker() {
    const { minHours, hours: longest } = market;
    let hours = Math.min(longest, market.usualHours ?? longest);
    const text = (value) => `${formatNumber(value)} h`;
    const value = h('output', { class: 'duration-value', 'aria-live': 'off' });
    const slider = h('input', {
      type: 'range',
      class: 'duration-slider',
      min: minHours,
      max: longest,
      step: 1,
      value: hours,
      'aria-label': t('Czas licytacji'),
      onInput: () => set(Number(slider.value)),
    });
    const stepButton = (sign, label) =>
      h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': label, text: sign < 0 ? '−' : '+', onClick: () => set(hours + sign) });
    const less = stepButton(-1, t('Krócej'));
    const more = stepButton(1, t('Dłużej'));
    function set(next) {
      hours = Math.min(longest, Math.max(minHours, next));
      slider.value = String(hours);
      slider.setAttribute('aria-valuetext', countOf(hours, 'godzina', 'godziny', 'godzin'));
      slider.style.setProperty('--fill', `${((hours - minHours) / Math.max(1, longest - minHours)) * 100}%`);
      value.textContent = text(hours);
      less.disabled = hours === minHours;
      more.disabled = hours === longest;
    }
    set(hours);
    const element = h(
      'div',
      { class: 'duration-picker' },
      h('p', { class: 'duration-head' }, h('span', { class: 'duration-title' }, t('Czas licytacji')), value),
      h('div', { class: 'duration-row' }, less, slider, more),
      h('p', { class: 'duration-scale', 'aria-hidden': 'true' }, h('span', { text: text(minHours) }), h('span', { text: text(longest) })),
    );
    return { element, read: () => hours };
  }

  function priceSheet(goods) {
    const { maxPrice } = market;
    const count = goods.kind === 'item' ? null : numberField('market-count', t('Ile sztuk (masz {count})', { count: formatNumber(goods.count) }), goods.count, 1, goods.count);
    const start = numberField('market-start', t('Cena wywoławcza (zł)'), null, 1, maxPrice);
    const now = numberField('market-buy-now', t('„Kup teraz” (zł, może zostać puste)'), null, 1, maxPrice);
    const length = hoursPicker();
    const scrap = scrapText(goods.scrap, goods.kind !== 'item');
    openSheet(
      h('h2', { class: 'sheet-title', text: goods.name }),
      scrap && h('p', { class: 'muted market-scrap', text: scrap }),
      count && h('p', { class: 'sheet-text', text: t('Cena dotyczy wszystkich wystawionych sztuk razem.') }),
      count?.element,
      start.element,
      now.element,
      length.element,
      h(
        'div',
        { class: 'sheet-actions' },
        h('button', { type: 'button', class: 'button button--world', text: t('Anuluj'), onClick: closeSheet }),
        h('button', {
          type: 'button',
          class: 'button button--system',
          text: t('Wystaw'),
          onClick: submit(
            '/api/market/list',
            () => ({
              kind: goods.kind,
              ...(goods.kind === 'item' ? { itemId: goods.itemId } : { key: goods.key, count: count.read() }),
              startPrice: start.read(),
              buyNow: now.read(true),
              hours: length.read(),
            }),
            t('Wystawione na Targowisku.'),
          ),
        }),
      ),
    );
  }

  function mineTab() {
    const collect = (event) =>
      act(event.currentTarget, '/api/market/collect', {}, ({ collected }) =>
        collected.left > 0
          ? t('Odebrane. Reszta poczeka, aż zrobisz miejsce w plecaku: {parcels}.', { parcels: countOf(collected.left, 'paczka', 'paczki', 'paczek') })
          : t('Odebrane.'),
      );
    return [
      h(
        'section',
        { class: 'stack' },
        h('h2', { class: 'section-title', text: t('Do odebrania') }),
        market.parcels.length === 0
          ? h('p', { class: 'muted', text: t('Nic na Ciebie nie czeka.') })
          : [
              h(
                'ul',
                { class: 'market-picks' },
                market.parcels.map((parcel) =>
                  h(
                    'li',
                    { class: 'market-pick' },
                    parcel.goods.kind === 'item' ? itemSummary(parcel.goods.item, { tier: true }) : stackLine(parcel.goods),
                    h('span', { class: 'muted market-reason', text: REASONS[parcel.reason] ? t(REASONS[parcel.reason]) : '' }),
                  ),
                ),
              ),
              h('button', { type: 'button', class: 'button button--system', text: t('Odbierz wszystko'), onClick: collect }),
            ],
      ),
      h(
        'section',
        { class: 'stack' },
        h('h2', { class: 'section-title', text: t('Moje oferty: {count} z {all}', { count: market.mine.length, all: market.limit }) }),
        h('p', { class: 'muted', text: t('Każdy kolejny stopień reputacji Kompanii Kupców daje miejsce na jeszcze jedną ofertę.') }),
        h('button', { type: 'button', class: 'button button--world', text: t('Wystaw'), disabled: market.mine.length >= market.limit, onClick: listSheet }),
        market.mine.length > 0 && h('ul', { class: 'stack market-list' }, market.mine.map(offerCard)),
      ),
    ];
  }

  function merchantSheet(good) {
    const most = Math.min(good.left, Math.max(1, Math.floor(state.character.gold / good.price)));
    const field = numberField('market-merchant-count', t('Ile sztuk'), 1, 1, most);
    openSheet(
      h('h2', { class: 'sheet-title', text: good.name }),
      h('p', { class: 'sheet-text', text: t('{gold} zł za sztukę. Dziś możesz kupić jeszcze {left} szt.', { gold: formatNumber(good.price), left: formatNumber(good.left) }) }),
      field.element,
      h(
        'div',
        { class: 'sheet-actions' },
        h('button', { type: 'button', class: 'button button--world', text: t('Anuluj'), onClick: closeSheet }),
        h('button', {
          type: 'button',
          class: 'button button--system',
          text: t('Kup'),
          onClick: submit('/api/market/resident', () => ({ from: 'merchant', id: good.id, count: field.read() }), ({ bought }) =>
            t('Kupione: {name} ×{count}.', { name: bought.name, count: formatNumber(bought.count) }),
          ),
        }),
      ),
    );
  }

  async function buyItem(good, button) {
    const sure = await confirmAction({
      title: t('Kupić przedmiot?'),
      text: t('{name} za {gold} zł. Trafi prosto do plecaka.', { name: good.name, gold: formatNumber(good.price) }),
      confirmLabel: t('Kup'),
    });
    if (sure) act(button, '/api/market/resident', { from: 'wanderer', id: good.id }, ({ bought }) => t('{name}: w plecaku.', { name: bought.name }));
  }

  function residentsTab() {
    const { merchant, wanderer } = market;
    const gold = state.character.gold;
    return [
      h(
        'section',
        { class: 'stack' },
        h('h2', { class: 'section-title', text: t('Kupiec') }),
        h('p', { class: 'muted' }, t('Towar i ceny zmieniają się codziennie. Nowe za '), clock(merchant.endsAt), '.'),
        // The relation with him lowers his prices (287 A).
        h('p', {
          class: 'muted',
          text:
            merchant.discount > 0
              ? t('Dzięki relacji z Gościwitem ceny są niższe o {discount}%.', { discount: formatDecimal(merchant.discount * 100) })
              : t('Z lepszą relacją z Gościwitem ceny będą niższe.'),
        }),
        h(
          'ul',
          { class: 'stack market-list' },
          merchant.goods.map((good) =>
            h(
              'li',
              { class: 'card market-offer' },
              stackButton(good, { count: false }, () => [
                h('p', { class: 'market-price', text: t('Kupiec: {gold} zł za sztukę, dziś jeszcze {left} szt.', { gold: formatNumber(good.price), left: formatNumber(good.left) }) }),
                h('button', {
                  type: 'button',
                  class: 'button button--world',
                  text: t('Kup'),
                  disabled: good.left < 1 || state.character.gold < good.price,
                  onClick: () => merchantSheet(good),
                }),
              ]),
              h('p', { class: 'market-price', text: t('{gold} zł za sztukę', { gold: formatNumber(good.price) }) }),
              h('p', { class: 'muted', text: good.left > 0 ? t('Dziś jeszcze {left} szt.', { left: formatNumber(good.left) }) : t('Na dziś wykupione.') }),
              h(
                'div',
                { class: 'settlement-actions' },
                h('button', { type: 'button', class: 'button button--world button--small', text: t('Kup'), disabled: good.left < 1 || gold < good.price, onClick: () => merchantSheet(good) }),
              ),
            ),
          ),
        ),
      ),
      h(
        'section',
        { class: 'stack' },
        h('h2', { class: 'section-title', text: t('Wędrowny handlarz') }),
        wanderer.goods
          ? [
              h('p', { class: 'muted' }, t('Przyszedł tylko na dziś. Odejdzie za '), clock(wanderer.endsAt), '.'),
              h(
                'ul',
                { class: 'stack market-list' },
                wanderer.goods.map((good) =>
                  h(
                    'li',
                    { class: 'card market-offer' },
                    itemEntry(good.item, `wanderer:${good.id}`, opened, { wearers: good.wearers, team: market.team ?? [] }),
                    h('p', { class: 'market-price', text: t('{gold} zł', { gold: formatNumber(good.price) }) }),
                    h(
                      'div',
                      { class: 'settlement-actions' },
                      good.bought
                        ? h('span', { class: 'market-leading', text: t('Kupione') })
                        : h('button', { type: 'button', class: 'button button--world button--small', text: t('Kup'), disabled: gold < good.price, onClick: (event) => buyItem(good, event.currentTarget) }),
                    ),
                  ),
                ),
              ),
            ]
          : wanderer.startsAt > serverNow()
            ? h('p', { class: 'muted' }, t('Przychodzi raz w tygodniu na jeden dzień. Będzie za '), clock(wanderer.startsAt), '.')
            // The author's words (1.11.2026).
            : h('p', { class: 'muted', text: t('W tym tygodniu już go tu nie uświadczysz. Wyczekuj w kolejnym.') }),
      ),
    ];
  }

  // A row of buttons, each with how many it holds under its name, one of
  // them pressed: the filter for the character over the offers and the
  // tabs of the kinds of goods.
  const switchRow = (classes, label, options, chosen, choose) =>
    h(
      'div',
      { class: `segmented market-top ${classes}`, role: 'group', 'aria-label': label },
      options.map(({ id, name, count }) =>
        h(
          'button',
          { type: 'button', class: `segmented-option${count === 0 ? ' market-top--empty' : ''}`, 'aria-pressed': String(id === chosen), onClick: () => id !== chosen && choose(id) },
          h('span', { class: 'market-top-name', text: name }),
          h('span', { class: 'market-filter-count', text: formatNumber(count) }),
        ),
      ),
    );

  // A list to choose from with its name over it; '' is "any".
  const choice = (id, label, value, options, choose) =>
    h(
      'div',
      { class: 'market-choice' },
      h('label', { class: 'bag-sort-label', for: id, text: label }),
      h(
        'select',
        { id, class: 'anvil-material market-choice-list', onChange: (event) => choose(event.currentTarget.value || null) },
        options.map((option) => h('option', { value: option.value, selected: option.value === (value ?? ''), text: option.text })),
      ),
    );

  // The search's controls over the players' offers (a player's remarks
  // passed on by the author, 11.11.2026): under "Wszystko" the kinds of
  // goods as tabs, and for items the class they are for (the player looks
  // for items for companions of other classes); under "Dla mnie" who of the
  // character's own shops, the character or one of its companions; over
  // items their Tier (a player's remark passed on by the author, 12.11.2026:
  // "żeby szybciej znaleźć przedmiot odpowiedni dla poziomu naszej
  // postaci"), with the class level it asks for; the rarity, the categories
  // as chips (2.11.2026) and the order.
  function searchControls() {
    const { counts, team = [] } = market;
    const companion = view.show === FOR_ME ? team.find((one) => one.id === view.who) : null;
    const rarities = (state.content?.rarities ?? []).filter((rarity) => counts.rarities?.[rarity.id] > 0);
    const tiers = (market.tiers ?? []).filter((tier) => counts.tiers?.[tier.id] > 0);
    const categories = [...state.content.slots.map(({ id, name }) => ({ id, name })), ...Object.entries(KIND_GROUPS).map(([id, name]) => ({ id, name: t(name) }))]
      .filter(({ id }) => counts.categories?.[id] > 0)
      .map((category) => ({ ...category, count: counts.categories[category.id] }));
    const lists = [
      view.show === ALL &&
        view.kind === 'item' &&
        choice('market-class', t('Klasa'), view.classId, [{ value: '', text: t('Każda klasa') }, ...state.content.classes.map((cls) => ({ value: cls.id, text: `${cls.name} (${formatNumber(counts.classes?.[cls.id] ?? 0)})` }))], (classId) =>
          search({ classId }),
        ),
      view.show === FOR_ME &&
        team.length > 0 &&
        choice(
          'market-who',
          t('Dla kogo'),
          view.who,
          [{ value: 'me', text: `${t('Ty')} (${formatNumber(counts.people?.me ?? 0)})` }, ...team.map((one) => ({ value: one.id, text: `${one.name} (${formatNumber(counts.people?.[one.id] ?? 0)})` }))],
          (who) => search({ who: who ?? 'me' }),
        ),
      (tiers.length > 1 || view.tier) &&
        choice(
          'market-tier',
          t('Tier'),
          view.tier,
          [
            { value: '', text: t('Każdy Tier') },
            ...tiers.map((tier) => ({ value: tier.id, text: t('{tier}, od poz. klasy {level} ({count})', { tier: tier.name, level: tier.classLevel, count: formatNumber(counts.tiers[tier.id]) }) })),
          ],
          (tier) => search({ tier }),
        ),
      (rarities.length > 1 || view.rarity) &&
        choice('market-rarity', t('Rzadkość'), view.rarity, [{ value: '', text: t('Każda rzadkość') }, ...rarities.map((rarity) => ({ value: rarity.id, text: `${rarity.name} (${formatNumber(counts.rarities[rarity.id])})` }))], (rarity) =>
          search({ rarity }),
        ),
    ].filter(Boolean);
    const total = categories.reduce((sum, category) => sum + category.count, 0);
    return [
      view.show === ALL &&
        switchRow(
          'market-kinds',
          t('Rodzaj towaru'),
          KIND_TABS.map(([id, name]) => ({ id, name: t(name), count: counts.kinds?.[id] ?? 0 })),
          view.kind,
          (kind) => search({ kind, category: ALL, tier: null, rarity: null }),
        ),
      lists.length > 0 && h('div', { class: 'market-choices' }, lists),
      // Who a companion is and what it wears, as the list holds only what
      // it can put on now.
      companion && h('p', { class: 'muted market-who', text: t('{className}, poz. {level}. Nosi broń, pancerz i jedną sztukę biżuterii.', { className: companion.className, level: companion.level }) }),
      (categories.length > 1 || view.category !== ALL) &&
        h(
          'div',
          { class: 'market-filters', role: 'group', 'aria-label': t('Kategoria towaru') },
          [{ id: ALL, name: t('Wszystko'), count: total }, ...categories].map(({ id, name, count }) =>
            h(
              'button',
              { type: 'button', class: 'market-filter', 'aria-pressed': String(id === view.category), onClick: () => id !== view.category && search({ category: id }) },
              name,
              ' ',
              h('span', { class: 'market-filter-count', text: formatNumber(count) }),
            ),
          ),
        ),
      h(
        'div',
        { class: 'bag-sort market-sort' },
        h('span', { class: 'bag-sort-label', text: t('Sortuj:') }),
        h(
          'div',
          { class: 'segmented bag-sort-options bag-sort-options--3', role: 'group', 'aria-label': t('Kolejność ofert') },
          SORTS.map(([id, label]) =>
            h('button', {
              type: 'button',
              class: 'segmented-option',
              'aria-pressed': String(id === view.sort),
              text: t(label),
              onClick: () => {
                if (id === view.sort) return;
                saveSort(id);
                search({ sort: id });
              },
            }),
          ),
        ),
      ),
    ];
  }

  // What the search shows when it finds nothing.
  function nothingFound() {
    if (view.show === FOR_ME) {
      const companion = market.team?.find((one) => one.id === view.who);
      return companion ? t('Nikt nie wystawia teraz przedmiotu, który {name} może założyć.', { name: companion.name }) : t(NO_OFFERS[FOR_ME]);
    }
    if (view.show === BIDDING) return t(NO_OFFERS[BIDDING]);
    if (view.classId || view.tier || view.rarity || view.category !== ALL) return t('Nic tu nie pasuje do wybranych filtrów.');
    return t(NO_KIND[view.kind] ?? 'Nikt nic teraz nie wystawia.');
  }

  // The players' offers: the filter for the character over them ("Dla
  // mnie": the items it could wear now, its class and Tier as "Załóż" asks,
  // or one of its companions; "Licytuję": the auctions with its bid,
  // leading or outbid), each with how many it holds, and under it the
  // search (searchControls), the page of offers it found and "Pokaż
  // kolejne", up to the most the server gives at once.
  function offersTab() {
    const { counts, offers, found, most } = market;
    if (counts.shows.all === 0) return h('p', { class: 'muted', text: t('Nikt nic teraz nie wystawia.') });
    const more = found > offers.length;
    return [
      switchRow(
        'segmented--three',
        t('Które oferty'),
        OFFER_FILTERS.map(([id, label]) => ({ id, name: t(label), count: counts.shows[id] ?? 0 })),
        view.show,
        (show) => search({ show, category: ALL }),
      ),
      searchControls(),
      h(
        'div',
        { class: `market-results${searching ? ' market-results--busy' : ''}`, 'aria-busy': String(searching) },
        offers.length === 0 ? h('p', { class: 'muted', text: nothingFound() }) : h('ul', { class: 'stack market-list' }, offers.map(offerCard)),
        more &&
          (offers.length < most
            ? [
                h('p', { class: 'muted market-more', text: t('Widać {shown} z {found} ofert.', { shown: formatNumber(offers.length), found: formatNumber(found) }) }),
                h('button', { type: 'button', class: 'button button--world', text: t('Pokaż kolejne'), onClick: () => search({ limit: offers.length + market.page }) }),
              ]
            : h('p', { class: 'muted market-more', text: t('Widać pierwsze {shown} z {found} ofert. Zawęź wyszukiwanie, żeby zobaczyć resztę.', { shown: formatNumber(offers.length), found: formatNumber(found) }) })),
      ),
    ];
  }

  // A line of the Rejestr: what happened and for how much, the goods (an
  // item in its rarity's colour, its card under a tap, as on the offers; a
  // stack's card too), the other side and when.
  function registerLine(line) {
    const gold = (value) => formatNumber(value);
    const said = {
      sold: () => {
        const sold = t('Sprzedane za {gold} zł', { gold: gold(line.price) });
        return line.gold !== null && line.gold !== line.price ? `${sold} · ${t('po opłacie: {gold} zł', { gold: gold(line.gold) })}` : sold;
      },
      bought: () => t('Kupione za {gold} zł', { gold: gold(line.price) }),
      won: () => t('Wygrana licytacja za {gold} zł', { gold: gold(line.price) }),
      expired: () => t('Bez kupca: wróciło do Ciebie'),
      withdrawn: () => t('Wycofane z Targowiska: wróciło do Ciebie'),
    }[line.event];
    const who = !line.with ? null : line.event === 'sold' ? t('Kupuje: {name}', { name: line.with }) : line.event === 'bought' || line.event === 'won' ? t('Sprzedaje: {name}', { name: line.with }) : null;
    return h(
      'li',
      { class: `card market-offer market-log market-log--${line.event}` },
      h('p', { class: 'market-log-event', text: said ? said() : line.event }),
      line.goods.kind === 'item' && line.goods.item ? itemEntry(line.goods.item, `log:${line.id}`, opened, { notes: false }) : stackButton(line.goods),
      h('p', { class: 'muted', text: [who, dateTimeFormat.format(new Date(line.at))].filter(Boolean).join(' · ') }),
    );
  }

  // The Rejestr (the author, 10.11.2026: "Zbudować rejestr na targowisku
  // sprzedanych i odebranych przedmiotów (oraz wygranych w licytacjach)"),
  // the newest first, kept from the version that brought it.
  function registerTab() {
    if (!register) return registerFailure ? systemPanel(registerFailure.message) : h('p', { class: 'muted', text: t('Wczytywanie rejestru…') });
    if (register.log.length === 0) {
      return h('p', {
        class: 'muted',
        text: t('Rejestr jest pusty. Targowisko zapisuje tu Twój handel od wersji {version}: co sprzedajesz, kupujesz i wygrywasz w licytacjach oraz co wraca do Ciebie bez kupca.', {
          version: register.since,
        }),
      });
    }
    return [
      h('p', { class: 'muted', text: t('Najnowsze na górze, do {count} ostatnich wpisów. Rejestr działa od wersji {version}.', { count: formatNumber(register.limit), version: register.since }) }),
      h('ul', { class: 'stack market-list' }, register.log.map(registerLine)),
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
    // The offers drawn anew under a filter left their old clocks behind.
    clocks = clocks.filter(({ element }) => element.isConnected);
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
      holder.replaceChildren(h('p', { class: 'muted', text: t('Wczytywanie Targowiska…') }));
      return;
    }
    const body = tab === 'offers' ? offersTab() : tab === 'mine' ? mineTab() : tab === 'log' ? registerTab() : residentsTab();
    holder.replaceChildren(
      h(
        'div',
        { class: 'stack' },
        h(
          'section',
          { class: 'card market-intro', 'data-guide': 'market-intro' },
          howItWorks(
            t('Licytacja trwa od {from} do {to} godzin, tyle, ile wybierze wystawiający.', { from: countOf(market.minHours, 'godziny', 'godzin', 'godzin'), to: market.hours }),
            [
              t('Przebity gracz od razu dostaje złoto z powrotem, a Targowisko bierze {fee}% ceny sprzedaży.', { fee: formatDecimal(market.fee * 100) }),
              `${t('Handel daje reputację Kompanii Kupców, dziś {today} z {daily} pkt.', { today: market.trade.today, daily: market.trade.daily })}${tradePace(market.trade)} ${t('Postacie z jednego konta nie kupują od siebie.')}`,
            ],
          ),
        ),
        h(
          'div',
          { class: 'chat-tabs market-tabs market-tabs--four', role: 'tablist', 'aria-label': t('Targowisko') },
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
                  // The Rejestr is asked anew each time its tab opens.
                  if (id === 'log') loadRegister();
                },
              },
              h('span', { class: 'chat-tab-name', text: t(label) }),
              id === 'mine' && market.parcels.length > 0 && h('span', { class: 'community-dot', role: 'img', 'aria-label': t('czeka do odebrania') }),
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

// The Punkty Systemu bought for money (src/server/payments.js; DECISIONS.md,
// "Płatności: odpowiedzi autora 804–808"), the Sklep Systemu's page at
// #/sklep/punkty, from its "Kup Punkty Systemu": the packs with their prices
// in złoty, the two ticks a purchase needs (the terms, being of age), the
// button that says it buys and pays (consumer law: the words of the duty to
// pay) and takes the player to the gateway's page, and the account's
// purchases, a paid one with "Odstąp od umowy" while it can be given back.
// Back from the gateway, an order waiting for its payment is asked about
// every few seconds, for a while, until the gateway's news credits it.
// Only where the payments are on for the account (the server answers "not
// found" elsewhere, and the page says so).
//
// Through Google Play (867 A; play-billing.js) the page shows Google's
// prices, buys a pack in Google Play's window and gives the server the
// purchase's token, which credits it; an order left in the window is
// closed at once, and a purchase not finished before (the app closed in the
// middle) is given to the server when the page opens. Outside the app, in a
// browser, it says the points are bought in the app.

import { fill, h, icon } from '../dom.js';
import { dateTimeFormat, formatMoney, formatNumber } from '../format.js';
import { t } from '../i18n.js';
import { SYSTEM_POINTS_ICON } from '../icons.js';
import { buyInPlay, playBilling, playPrices, playPurchases } from '../play-billing.js';
import { systemPoints } from '../quests.js';
import { call, state } from '../state.js';
import { confirmAction, pageHeading, toast, withButton } from '../ui.js';

// The order the player went to pay, kept for the way back from the gateway's
// page (in this tab only).
const WAITING_KEY = 'insight-payment';
const POLL_MS = 4000;
const POLL_FOR_MS = 3 * 60 * 1000;

const remember = (orderId) => {
  try {
    sessionStorage.setItem(WAITING_KEY, JSON.stringify({ orderId, at: Date.now() }));
  } catch {}
};
const forget = () => {
  try {
    sessionStorage.removeItem(WAITING_KEY);
  } catch {}
};
// Whether the player comes back from paying in this tab, within the hour:
// the game then opens this page once (app.js), wherever on the game's
// address the gateway sends the player.
export function takePaymentReturn() {
  try {
    const kept = JSON.parse(sessionStorage.getItem(WAITING_KEY) ?? 'null');
    sessionStorage.removeItem(WAITING_KEY);
    return Boolean(kept && Date.now() - kept.at < 60 * 60 * 1000);
  } catch {
    return false;
  }
}

// The words of a purchase's state.
const STATUS = {
  pending: { text: 'Czeka na zapłatę', kind: '' },
  paid: { text: 'Zapłacony', kind: 'chip--success' },
  refunding: { text: 'Zwrot w toku', kind: '' },
  refunded: { text: 'Zwrócony', kind: '' },
  failed: { text: 'Nieudany', kind: '' },
  expired: { text: 'Nieopłacony', kind: '' },
  charged_back: { text: 'Cofnięty przez bank', kind: '' },
};

const DAY = 24 * 60 * 60 * 1000;

// The order bought in Google Play's window, kept until the server credits it
// (the app may close in the middle): its id and product.
const PLAY_KEY = 'insight-play-order';
const keepPlayOrder = (order) => {
  try {
    localStorage.setItem(PLAY_KEY, JSON.stringify(order));
  } catch {}
};
const playOrder = () => {
  try {
    return JSON.parse(localStorage.getItem(PLAY_KEY) ?? 'null');
  } catch {
    return null;
  }
};
const forgetPlayOrder = () => {
  try {
    localStorage.removeItem(PLAY_KEY);
  } catch {}
};
// The day a quarter begins, on the Polish clock its limit counts by (a phone
// elsewhere would show the evening before).
const quarterDate = (ms) => new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', day: 'numeric', month: '2-digit', year: 'numeric' }).format(new Date(ms));

export function mountShopPoints(container) {
  let shop = null;
  let off = false;
  let chosen = null;
  let terms = false;
  let adult = false;
  let poll = null;
  let pollUntil = 0;
  // Google Play (867 A): whether the page is in the app, and Google's
  // prices by product.
  let play = false;
  let prices = new Map();
  const throughPlay = () => shop?.provider === 'google-play';

  async function load() {
    try {
      shop = await call('GET', '/api/payments');
      off = false;
      if (throughPlay()) {
        play = (await playBilling()) !== null;
        if (play) prices = await playPrices(shop.packs.map((pack) => pack.playId));
      }
    } catch {
      shop = null;
      off = true;
    }
    if (container.isConnected) render();
    watch();
  }

  // The purchases Google has that the server did not credit yet (the app
  // closed in the middle of one): given to the server, which credits each
  // once; the order kept for its product goes with it.
  async function finishPlay() {
    const kept = playOrder();
    let credited = 0;
    for (const purchase of await playPurchases()) {
      try {
        const { state: done } = await call('POST', '/api/payments/play', { token: purchase.purchaseToken, sku: purchase.itemId, orderId: kept?.sku === purchase.itemId ? kept.orderId : undefined });
        if (done === 'paid') credited += 1;
      } catch {}
    }
    if (credited > 0) {
      forgetPlayOrder();
      await call('GET', '/api/character').catch(() => {});
      await load();
    }
  }

  // A pack's price: Google's in the app, else the game's own.
  function priceOf(pack) {
    const google = throughPlay() ? prices.get(pack.playId) : null;
    const value = Number(google?.value);
    return google && Number.isFinite(value) ? formatMoney(Math.round(value * 100), google.currency) : formatMoney(pack.price, shop.currency);
  }

  // An order waiting for its payment, made in the last minutes: asked about
  // until it is paid, closed or the time is up; paid, the points come.
  function watch() {
    clearTimeout(poll);
    const waiting = shop?.purchases.find((purchase) => purchase.status === 'pending');
    if (!waiting || !container.isConnected) return;
    if (!pollUntil) pollUntil = Date.now() + POLL_FOR_MS;
    if (Date.now() > pollUntil) return;
    poll = setTimeout(async () => {
      const before = waiting.id;
      await load();
      const now = shop?.purchases.find((purchase) => purchase.id === before);
      if (now?.status === 'paid') {
        forget();
        toast(t('Dodano {points}.', { points: systemPoints(now.points) }));
        await call('GET', '/api/character').catch(() => {});
      }
    }, POLL_MS);
  }

  function render() {
    const character = state.character;
    fill(
      container,
      pageHeading(t('Kup Punkty Systemu')),
      h('p', { class: 'shop-points' }, icon(SYSTEM_POINTS_ICON, { size: 20 }), h('span', { text: t('Punkty Systemu:') }), h('strong', { text: formatNumber(character.systemPoints) })),
      off ? h('p', { class: 'muted', text: t('Zakup Punktów Systemu nie jest jeszcze dostępny.') }) : shop ? body() : h('p', { class: 'muted', text: t('Wczytywanie…') }),
      h('a', { class: 'button button--world', href: '#/sklep', text: t('Wróć do Sklepu Systemu') }),
    );
  }

  function body() {
    // Through Google Play, outside the app there is nothing to buy (867 A).
    if (throughPlay() && !play) return [h('p', { class: 'card points-note', text: t('Punkty Systemu kupisz w aplikacji Insight ze Sklepu Play.') }), history()];
    const waiting = shop.purchases.find((purchase) => purchase.status === 'pending' && !(throughPlay() && purchase.id === playOrder()?.orderId));
    return [
      waiting && waitingCard(waiting),
      shop.blocked
        ? h('p', { class: 'card points-note', text: t('Zakupy na tym koncie są wstrzymane. Napisz do nas, a wyjaśnimy sprawę.') })
        : [packs(), consents(), buyButton(), rules()],
      history(),
    ];
  }

  function waitingCard(purchase) {
    return h(
      'div',
      { class: 'card points-waiting', role: 'status' },
      h('p', { class: 'points-waiting-title', text: t('Czekamy na potwierdzenie płatności') }),
      h('p', { class: 'muted', text: t('{points} za {price}. Punkty pojawią się tu same, zwykle w kilka sekund po zapłacie.', { points: systemPoints(purchase.points), price: formatMoney(purchase.price, purchase.currency) }) }),
    );
  }

  function packs() {
    return h(
      'div',
      { class: 'points-packs', role: 'radiogroup', 'aria-label': t('Wybierz pakiet') },
      shop.packs.map((pack) =>
        h(
          'button',
          {
            type: 'button',
            role: 'radio',
            class: 'points-pack',
            'aria-checked': chosen === pack.id,
            disabled: !pack.available,
            onClick: () => {
              chosen = pack.id;
              render();
            },
          },
          icon(SYSTEM_POINTS_ICON, { size: 28 }),
          h('span', { class: 'points-pack-amount', text: formatNumber(pack.points) }),
          h('span', { class: 'points-pack-unit', text: t('Punktów Systemu') }),
          h('span', { class: 'points-pack-price', text: priceOf(pack) }),
          !pack.available && shop.resumesAt && h('span', { class: 'points-pack-note', text: t('Od {date}', { date: quarterDate(shop.resumesAt) }) }),
        ),
      ),
    );
  }

  function check(id, checked, label, onChange) {
    const box = h('input', { type: 'checkbox', id, class: 'points-check-box', checked, onChange: () => onChange(box.checked) });
    return h('label', { class: 'points-check', for: id }, box, label);
  }

  function consents() {
    return h(
      'div',
      { class: 'points-consents' },
      check(
        'points-terms',
        terms,
        h('span', {}, t('Akceptuję'), ' ', h('a', { href: '/regulamin', 'data-href-en': '/terms', target: '_blank', rel: 'noopener', text: t('Regulamin') }), t(', w tym zasady Punktów Systemu.')),
        (value) => {
          terms = value;
          render();
        },
      ),
      shop.adultOnly &&
        check('points-adult', adult, h('span', { text: t('Mam ukończone 18 lat.') }), (value) => {
          adult = value;
          render();
        }),
    );
  }

  function buyButton() {
    const pack = shop.packs.find((each) => each.id === chosen);
    const ready = pack && pack.available && terms && (adult || !shop.adultOnly);
    return h('button', {
      type: 'button',
      class: 'button button--system points-buy',
      disabled: !ready,
      text: pack ? t('Kupuję i płacę {price}', { price: priceOf(pack) }) : t('Wybierz pakiet'),
      onClick: (event) => buy(event.currentTarget, pack),
    });
  }

  async function buy(button, pack) {
    if (throughPlay()) return buyThroughPlay(button, pack);
    await withButton(button, async () => {
      const { orderId, url } = await call('POST', '/api/payments/order', { packId: pack.id, terms: true, adult: true });
      remember(orderId);
      if (url) {
        location.assign(url);
        return;
      }
      pollUntil = 0;
      await load();
    });
  }

  // The order written, then Google Play's window: the purchase's token to
  // the server, which credits it after Google's word; the window closed
  // without paying closes the order (it holds no limit then).
  async function buyThroughPlay(button, pack) {
    await withButton(button, async () => {
      const { orderId, sku } = await call('POST', '/api/payments/order', { packId: pack.id, terms: true, adult: true });
      keepPlayOrder({ orderId, sku });
      let response;
      try {
        response = await buyInPlay(sku);
      } catch {
        forgetPlayOrder();
        await call('POST', '/api/payments/cancel', { orderId }).catch(() => {});
        await load();
        return;
      }
      const token = response.details?.purchaseToken;
      try {
        const done = await call('POST', '/api/payments/play', { orderId, token, sku });
        await response.complete('success').catch(() => {});
        forgetPlayOrder();
        if (done.state === 'paid') toast(t('Dodano {points}.', { points: systemPoints(pack.points) }));
        else toast(t('Płatność czeka na potwierdzenie Google Play. Punkty dojdą same.'));
        await call('GET', '/api/character').catch(() => {});
      } catch (error) {
        // Paid in Google Play, not yet credited: kept, and given to the server
        // again when the page opens (finishPlay).
        await response.complete('fail').catch(() => {});
        toast(t('Zakup jest w Google Play, ale gra jeszcze go nie potwierdziła. Punkty dojdą, gdy otworzysz tę stronę ponownie.'));
        console.error(error);
      }
      await load();
    });
  }

  function rules() {
    const left = Math.max(0, shop.monthlyLimit - shop.spent);
    return h(
      'ul',
      { class: 'points-rules muted' },
      h('li', { text: throughPlay() ? t('Płacisz przez Google Play.') : t('Płacisz BLIK-iem albo przelewem na stronie Autopay.') }),
      h('li', { text: t('Punkty trafiają do tej postaci zaraz po potwierdzeniu płatności.') }),
      h('li', { text: t('W Sklepie Systemu najpierw wydajesz punkty zdobyte w grze. Kupione, których nie wydasz, możesz zwrócić przez {days} dni od zapłaty.', { days: shop.withdrawalDays }) }),
      h('li', { text: t('Limit zakupów: {limit} na {days} dni. Zostało: {left}.', { limit: formatMoney(shop.monthlyLimit, shop.currency), days: shop.limitDays, left: formatMoney(left, shop.currency) }) }),
    );
  }

  function history() {
    if (shop.purchases.length === 0) return null;
    return h(
      'section',
      { class: 'points-history' },
      h('h2', { class: 'section-title', text: t('Twoje zakupy') }),
      h(
        'ul',
        { class: 'points-history-list' },
        shop.purchases.map((purchase) => {
          const status = STATUS[purchase.status] ?? { text: purchase.status, kind: '' };
          const returnable = purchase.status === 'paid' && purchase.paidAt && Date.now() - purchase.paidAt <= shop.withdrawalDays * DAY;
          return h(
            'li',
            { class: 'card points-history-row' },
            h(
              'div',
              { class: 'points-history-text' },
              h('strong', { text: systemPoints(purchase.points) }),
              h('span', { class: 'muted', text: `${formatMoney(purchase.price, purchase.currency)} · ${dateTimeFormat.format(new Date(purchase.paidAt ?? purchase.createdAt))}` }),
            ),
            h('span', { class: `chip ${status.kind}`.trim(), text: t(status.text) }),
            returnable &&
              h('button', {
                type: 'button',
                class: 'button button--world button--small',
                text: t('Odstąp od umowy'),
                onClick: (event) => withdraw(event.currentTarget, purchase),
              }),
          );
        }),
      ),
    );
  }

  async function withdraw(button, purchase) {
    const sure = await confirmAction({
      title: t('Odstąpić od umowy?'),
      text: throughPlay()
        ? t('{points} zniknie od razu, a {price} wróci przez Google Play, zwykle w kilka dni.', { points: systemPoints(purchase.points), price: formatMoney(purchase.price, purchase.currency) })
        : t('{points} zniknie od razu, a {price} wróci na Twoje konto przez Autopay, zwykle w kilka dni.', { points: systemPoints(purchase.points), price: formatMoney(purchase.price, purchase.currency) }),
      confirmLabel: t('Odstępuję od umowy'),
    });
    if (!sure) return;
    await withButton(button, async () => {
      await call('POST', '/api/payments/withdraw', { orderId: purchase.id });
      toast(throughPlay() ? t('Zakup zwrócony. Pieniądze wrócą przez Google Play.') : t('Zakup zwrócony. Pieniądze wrócą przez Autopay.'));
      await load();
    });
  }

  render();
  load().then(() => throughPlay() && play && finishPlay());
  return {
    update: () => {
      if (container.isConnected) render();
    },
    unmount: () => clearTimeout(poll),
  };
}

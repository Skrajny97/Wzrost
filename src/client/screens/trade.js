// The Wymiana with another player's character (src/server/trades.js),
// proposed on its sheet (profile.js) or in a row of the Znajomi while both
// players are online and both characters at home. The other accepts the
// proposal, both put their offers together (gold, items, herbs, potions,
// materials, the minerals of Górnictwo and the camp's resources), and the
// first confirmation freezes both: the other side then only accepts the
// trade, when all of it moves at once, or rejects it. Each confirmation asks
// first, with what goes and what comes. While the screen is open and the page is in front, it asks
// for the trade every two seconds. A proposal to this character opens a
// sheet wherever the player is, once nothing else is on the screen
// (offerTrade), and waits in the Społeczność too (tradeBanner).

import { goldArt, herbSprite, mineralSprite, potionSprite, resourceArt } from '../art.js';
import { liveTrade, tradeSeen } from '../chat-news.js';
import { materialIcon } from '../craft-table.js';
import { fill, h, icon } from '../dom.js';
import { formatCountdown, formatNumber } from '../format.js';
import { t } from '../i18n.js';
import { narratorIdle } from '../narrator.js';
import { playSound } from '../sound.js';
import { call, serverNow, state, walletEntries } from '../state.js';
import { closeSheet, confirmAction, openSheet, pageHeading, toast, withButton } from '../ui.js';
import { gemFold, itemSummary, itemTitle, materialTitle, propertyLines } from './character.js';

const HASH = '#/wymiana';
const EVERY_MS = 2000;
const LIVE = ['proposed', 'open', 'locked'];

// The trade the screen follows, to show how it ended too; the screen's own
// restart while it is open; and the live trade it shows, which no sheet
// asks about then.
let followed = null;
let restart = null;
let onScreen = null;

function follow(trade) {
  followed = trade.id;
  tradeSeen(trade);
  if (location.hash === HASH && restart) restart();
  else location.hash = HASH;
}

// "Wymiana" on a character's sheet or in the Znajomi: the proposal goes,
// and the trade's screen opens with it. Why it cannot shows in a toast
// (withButton).
export async function proposeTrade(person) {
  const { trade } = await call('POST', '/api/trade/propose', { id: person.id });
  closeSheet();
  follow(trade);
}

async function answer(id, accept) {
  const { trade } = await call('POST', '/api/trade/answer', { id, accept });
  if (accept) follow(trade);
  else {
    tradeSeen(trade);
    toast(t('Propozycja odrzucona.'));
  }
  return trade;
}

const button = (label, kind, run, { disabled = false } = {}) =>
  h('button', { type: 'button', class: `button button--${kind}`, text: label, disabled, onClick: (event) => withButton(event.currentTarget, run) });

// The proposals asked about in a sheet already.
const asked = new Set();

// A proposal to this character, in a sheet over whatever the player does,
// once the narrator and other sheets are done. The app asks every second.
export function offerTrade() {
  const trade = liveTrade();
  if (!trade || trade.state !== 'proposed' || trade.proposer || asked.has(trade.id) || onScreen === trade.id) return;
  if (!narratorIdle() || document.querySelector('dialog[open]')) return;
  asked.add(trade.id);
  const reply = (accept) => async () => {
    try {
      await answer(trade.id, accept);
    } finally {
      closeSheet();
    }
  };
  openSheet(
    h('h2', { class: 'sheet-title trade-sheet-title' }, icon('swap', { size: 22 }), t('Propozycja wymiany')),
    h('p', { class: 'sheet-text', text: t('{name} proponuje Ci wymianę przedmiotów, ziół, mikstur, materiałów albo złota.', { name: trade.other }) }),
    h('p', { class: 'muted', text: t('Bez odpowiedzi propozycja przepadnie po {minutes} min.', { minutes: Math.round(state.content.community.trade.proposalSeconds / 60) }) }),
    h('div', { class: 'sheet-actions' }, button(t('Odrzuć'), 'world', reply(false)), button(t('Przyjmij'), 'system', reply(true))),
  );
}

// The trade in the Społeczność, over its parts: a proposal to answer, or
// the way back to a trade going on. Null without one.
export function tradeBanner() {
  const trade = liveTrade();
  if (!trade) return null;
  const open = () => h('a', { class: 'button button--system button--small', href: HASH, onClick: () => (followed = trade.id), text: t('Otwórz') });
  const parts =
    trade.state === 'proposed' && !trade.proposer
      ? [
          h('p', { text: t('{name} proponuje Ci wymianę.', { name: trade.other }) }),
          h('div', { class: 'trade-banner-actions' }, button(t('Odrzuć'), 'world', () => answer(trade.id, false)), button(t('Przyjmij'), 'system', () => answer(trade.id, true))),
        ]
      : [
          h('p', { text: trade.state === 'proposed' ? t('Czekasz, aż {name} przyjmie wymianę.', { name: trade.other }) : t('Trwa wymiana z postacią {name}.', { name: trade.other }) }),
          open(),
        ];
  return h('section', { class: 'card trade-banner', 'aria-label': t('Wymiana') }, icon('swap', { size: 22, className: 'trade-banner-icon' }), parts);
}

// The herbs, potions, materials, minerals and camp resources of an offer,
// each with its name.
const stacksOf = (offer) => [
  ...offer.herbs.map((stack) => ({ ...stack, herb: true })),
  ...offer.potions,
  ...(offer.materials ?? []).map((stack) => ({ ...stack, name: materialTitle(stack), material: true })),
  ...(offer.minerals ?? []).map((stack) => ({ ...stack, mineral: true })),
  ...(offer.resources ?? []).map((stack) => ({ ...stack, resource: true })),
];

// What an offer holds, in words: "120 złota, Amulet Dębu, Żywokost ×5".
function offerText(offer) {
  const parts = [
    offer.gold > 0 && t('{gold} złota', { gold: formatNumber(offer.gold) }),
    ...offer.items.map(itemTitle),
    ...stacksOf(offer).map((stack) => `${stack.name} ×${formatNumber(stack.count)}`),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : t('nic');
}

const isEmpty = (offer) => offer.gold === 0 && offer.items.length === 0 && stacksOf(offer).length === 0;

export function mountTrade(container, { backHash }) {
  let view = null;
  let seen = '';
  let gone = false;
  let asking = false;
  let timer = null;
  const countdown = h('p', { class: 'muted trade-countdown' });
  const body = h('div', { class: 'trade' }, h('p', { class: 'muted', text: t('Wczytywanie…') }));
  fill(container, pageHeading(t('Wymiana')), body);

  async function refresh() {
    if (gone || asking || document.hidden) return;
    asking = true;
    try {
      let { trade } = await call('GET', view ? `/api/trade?id=${view.id}` : '/api/trade');
      if (!trade && !view && followed) ({ trade } = await call('GET', `/api/trade?id=${followed}`));
      show(trade);
    } catch (error) {
      if (!view && !gone) fill(body, h('p', { class: 'chat-error', role: 'status', text: error.message }));
    } finally {
      asking = false;
    }
  }

  function start() {
    view = null;
    seen = '';
    clearInterval(timer);
    timer = setInterval(refresh, EVERY_MS);
    refresh();
  }

  // `own`: the answer to this player's confirmation, which brings the
  // character with what it got.
  function show(next, own = false) {
    if (gone) return;
    const was = view;
    view = next;
    tradeSeen(view);
    const live = Boolean(view) && LIVE.includes(view.state);
    onScreen = live ? view.id : null;
    if (!live) clearInterval(timer);
    if (view?.state === 'done' && was && was.state !== 'done') {
      playSound('collect');
      if (!own) {
        toast(t('Wymiana zakończona.'));
        call('GET', '/api/character').catch(() => {});
      }
    }
    const text = JSON.stringify(view);
    if (text === seen) return;
    seen = text;
    render();
  }

  // An action on the trade: on a refusal its words, and the trade as it is
  // now.
  const act = (run) => async () => {
    try {
      await run();
    } catch (error) {
      toast(error.message);
      refresh();
    }
  };
  const end = act(async () => show((await call('POST', '/api/trade/cancel', { id: view.id })).trade));
  const reply = (accept) => act(async () => show(await answer(view.id, accept)));
  const confirm = act(async () => {
    const final = view.state === 'locked';
    // The offers as the player saw them: changed meanwhile, the server says so.
    const { id, version, mine, theirs, other } = view;
    const offers = { give: offerText(mine), get: offerText(theirs) };
    const sure = await confirmAction({
      title: final ? t('Przyjąć wymianę?') : t('Zatwierdzić wymianę?'),
      text: final
        ? t('Oddasz: {give}. Dostaniesz: {get}.', offers)
        : t('Oddasz: {give}. Dostaniesz: {get}. Potem żadna z ofert już się nie zmieni, a {name} przyjmie wymianę albo ją odrzuci.', { ...offers, name: other.name }),
      confirmLabel: final ? t('Przyjmij') : t('Zatwierdź'),
    });
    if (!sure || gone) return;
    const result = await call('POST', '/api/trade/confirm', { id, version });
    if (result.text) toast(result.text);
    show(result.trade, true);
  });

  function statusText() {
    const name = view.other.name;
    switch (view.state) {
      case 'proposed':
        return view.proposer ? t('Propozycja wysłana. Czekasz, aż {name} ją przyjmie.', { name }) : t('{name} proponuje Ci wymianę.', { name });
      case 'open':
        return t('Dodajcie do ofert, co chcecie dać. Kto pierwszy zatwierdzi wymianę, ten zamrozi obie oferty, a druga strona już tylko ją przyjmie albo odrzuci.');
      case 'locked':
        return view.lockedBy === 'me'
          ? t('Wymiana zatwierdzona. Oferty już się nie zmienią. Czekasz, aż {name} ją przyjmie albo odrzuci.', { name })
          : t('Postać {name} zatwierdziła wymianę. Oferty już się nie zmienią: przyjmij ją albo odrzuć.', { name });
      case 'done':
        return t('Wymiana zakończona. Wszystko jest już w plecakach.');
      case 'rejected':
        return view.proposer ? t('Postać {name} odrzuciła wymianę.', { name }) : t('Wymiana odrzucona.');
      case 'cancelled':
        return t('Wymiana anulowana.');
      default:
        return t('Wymiana przepadła, bo za długo nic się w niej nie działo.');
    }
  }

  function render() {
    if (!view) {
      fill(
        body,
        h('p', { class: 'sheet-text', text: t('Nie trwa żadna wymiana. Zaproponujesz ją w karcie postaci innego gracza albo na liście Znajomych.') }),
        h('a', { class: 'button button--world', href: '#/spolecznosc', text: t('Społeczność') }),
      );
      return;
    }
    const live = LIVE.includes(view.state);
    fill(
      body,
      h('p', { class: 'trade-with' }, icon('swap', { size: 18 }), t('Z postacią {name}', { name: view.other.name })),
      h('p', { class: 'trade-status', role: 'status', text: statusText() }),
      view.state === 'proposed' && countdown,
      live && !view.other.online && h('p', { class: 'region-warning', text: t('Gracz {name} nie jest teraz online.', { name: view.other.name }) }),
      ['open', 'locked', 'done'].includes(view.state) && [offerCard(true), offerCard(false)],
      actions(),
    );
    tick(serverNow());
  }

  function offerCard(mine) {
    const offer = mine ? view.mine : view.theirs;
    const stacks = stacksOf(offer);
    return h(
      'section',
      { class: 'card trade-offer' },
      h('h2', {
        class: 'card-title',
        text: view.state === 'done' ? (mine ? t('Oddano') : t('Otrzymano')) : mine ? t('Twoja oferta') : t('Oferta: {name}', { name: view.other.name }),
      }),
      isEmpty(offer) && h('p', { class: 'muted', text: t('Na razie pusto.') }),
      offer.gold > 0 && h('p', { class: 'trade-gold' }, goldArt(20), t('{gold} złota', { gold: formatNumber(offer.gold) })),
      offer.items.length > 0 && h('ul', { class: 'item-list' }, offer.items.map((item) => h('li', {}, itemEntry(item, mine)))),
      stacks.length > 0 && h('ul', { class: 'trade-stacks' }, stacks.map((stack) => stackEntry(stack, mine))),
      mine && view.state === 'open' && h('button', { type: 'button', class: 'button button--world', text: isEmpty(offer) ? t('Dodaj do oferty') : t('Zmień ofertę'), onClick: editOffer }),
    );
  }

  // An item of an offer, its properties under a tap; one the character
  // gets says when it can wear it. An item from a trade is worn from its own
  // level on (src/server/inventory.js).
  function itemEntry(item, mine) {
    const character = state.character;
    const notes = mine
      ? []
      : [
          item.classIds && !item.classIds.includes(character.classId) && t('Twoja klasa nie może go używać.'),
          // From its own level of the class on, as one from a Wymiana is.
          character.classLevel < (item.classLevel ?? 1) && t('Założysz go od poziomu klasy {level}.', { level: item.classLevel }),
        ].filter(Boolean);
    return [
      h(
        'details',
        { class: 'profile-item' },
        h('summary', {}, itemSummary(item)),
        h(
          'ul',
          { class: 'item-properties' },
          // Its numbers and the gem set in it, as on the item's own card:
          // with a gem, each number without it and with it (906 B).
          propertyLines(item),
          item.gem && gemFold(item.gem),
          item.classNames &&
            h('li', {
              class: 'item-classes',
              text: item.classNames.length > 1 ? t('Dla klas: {classes}', { classes: item.classNames.join(', ') }) : t('Dla klasy: {classes}', { classes: item.classNames.join(', ') }),
            }),
          item.price !== undefined && h('li', { class: 'item-price', text: t('U złomiarza: {gold} złota', { gold: formatNumber(item.price) }) }),
        ),
      ),
      notes.map((note) => h('p', { class: 'region-warning trade-note', text: note })),
    ];
  }

  // Herbs, potions, materials, minerals or camp resources of an offer; a
  // potion whose recipe the character does not know waits for it.
  function stackEntry(stack, mine) {
    const art = stack.material
      ? materialIcon(stack.materialId, 20)
      : stack.resource
        ? resourceArt(stack.id, 20)
        : stack.mineral
          ? (mineralSprite(stack.id) ?? icon('ore', { size: 20 }))
          : ((stack.herb ? herbSprite(stack.id) : potionSprite(stack.id)) ?? icon(stack.herb ? 'leaf' : 'flask', { size: 20 }));
    return h(
      'li',
      { class: 'trade-stack' },
      h('span', { class: 'potion-pick-art' }, art),
      h('span', { class: 'trade-stack-name', text: stack.name }),
      h('span', { class: 'trade-stack-count', text: `×${formatNumber(stack.count)}` }),
      !mine && !stack.herb && !stack.material && !stack.mineral && !stack.resource && !stack.known && h('p', { class: 'region-warning trade-note', text: t('Nie znasz jej receptury, więc jej nie użyjesz.') }),
    );
  }

  function actions() {
    const row = (...buttons) => h('div', { class: 'sheet-actions' }, buttons);
    switch (view.state) {
      case 'proposed':
        return view.proposer ? row(button(t('Cofnij propozycję'), 'world', end)) : row(button(t('Odrzuć'), 'world', reply(false)), button(t('Przyjmij'), 'system', reply(true)));
      case 'open':
        return row(button(t('Odrzuć wymianę'), 'world', end), button(t('Zatwierdź wymianę'), 'system', confirm, { disabled: isEmpty(view.mine) && isEmpty(view.theirs) }));
      case 'locked':
        return row(button(t('Odrzuć wymianę'), 'world', end), view.lockedBy === 'them' && button(t('Przyjmij wymianę'), 'system', confirm));
      default:
        return row(h('a', { class: 'button button--world', href: backHash ?? '#/spolecznosc', text: t('Wróć') }));
    }
  }

  // The player's offer in a sheet: gold, the camp's resources, items from the
  // bag (not those worn), herbs, potions, materials and minerals, saved at
  // once for the other to see.
  function editOffer() {
    const character = state.character;
    const { maxItems } = state.content.community.trade;
    const picked = new Set(view.mine.items.map((item) => item.id).filter((id) => character.bag.some((item) => item.id === id)));
    const counts = Object.fromEntries(stacksOf(view.mine).map((stack) => [stack.id, stack.count]));
    const field = (id, label, value, most, art) => {
      const input = h('input', { type: 'number', id, class: 'trade-number', min: '0', max: String(most), step: '1', inputmode: 'numeric', value: String(Math.min(value, most)) });
      const element = h(
        'div',
        { class: 'trade-field' },
        art && h('span', { class: 'potion-pick-art' }, art),
        h('label', { for: id, class: 'trade-field-label', text: label }),
        input,
        h('span', { class: 'muted trade-field-most', text: t('z {max}', { max: formatNumber(most) }) }),
      );
      const read = () => {
        const value = input.value.trim() === '' ? 0 : Number(input.value);
        if (!Number.isInteger(value) || value < 0 || value > most) throw new Error(t('{name}: wpisz od 0 do {max}.', { name: label, max: formatNumber(most) }));
        return value;
      };
      return { element, read };
    };
    const gold = field('trade-gold', t('Złoto'), view.mine.gold, character.gold, goldArt(20));
    const stackFields = (entries, kind, art) =>
      entries.map((entry) => ({ id: entry.id, ...field(`trade-${kind}-${entry.id.replace(':', '-')}`, entry.name, counts[entry.id] ?? 0, entry.count, art(entry)) }));
    const herbs = stackFields(character.herbs ?? [], 'herb', (entry) => herbSprite(entry.id) ?? icon('leaf', { size: 20 }));
    const potions = stackFields(character.potions ?? [], 'potion', (entry) => potionSprite(entry.id) ?? icon('flask', { size: 20 }));
    const owned = (character.crafting?.materials ?? []).map((material) => ({ id: material.key, name: materialTitle(material), count: material.count, materialId: material.materialId }));
    const materials = stackFields(owned, 'material', (entry) => materialIcon(entry.materialId, 20));
    const minerals = stackFields(character.minerals ?? [], 'mineral', (entry) => mineralSprite(entry.id) ?? icon('ore', { size: 20 }));
    // The camp's resources the character has, by gold (state.js).
    const stores = walletEntries(character)
      .filter((entry) => entry.id !== 'gold' && entry.amount > 0)
      .map((entry) => ({ id: entry.id, name: entry.name, count: entry.amount }));
    const resources = stackFields(stores, 'resource', (entry) => resourceArt(entry.id, 20));
    const count = h('p', { class: 'muted' });
    const showCount = () => {
      count.textContent = t('Wybrane: {count} z {max}.', { count: picked.size, max: maxItems });
    };
    showCount();
    const items = character.bag.map((item) => {
      const row = h(
        'button',
        {
          type: 'button',
          class: 'item-row trade-pick',
          'aria-pressed': String(picked.has(item.id)),
          onClick: () => {
            if (picked.has(item.id)) picked.delete(item.id);
            else if (picked.size >= maxItems) {
              toast(t('W jednej wymianie najwyżej {count} przedmiotów.', { count: maxItems }));
              return;
            } else picked.add(item.id);
            row.setAttribute('aria-pressed', String(picked.has(item.id)));
            showCount();
          },
        },
        itemSummary(item),
        h('span', { class: 'trade-pick-mark', 'aria-hidden': 'true' }, icon('check', { size: 18 })),
      );
      return h('li', {}, row);
    });
    const save = async () => {
      let offer;
      try {
        const kept = (fields) => Object.fromEntries(fields.map((entry) => [entry.id, entry.read()]).filter(([, value]) => value > 0));
        offer = { gold: gold.read(), resources: kept(resources), items: [...picked], herbs: kept(herbs), potions: kept(potions), materials: kept(materials), minerals: kept(minerals) };
      } catch (error) {
        toast(error.message);
        return;
      }
      try {
        const { trade } = await call('POST', '/api/trade/offer', { id: view.id, offer });
        closeSheet();
        show(trade);
      } catch (error) {
        closeSheet();
        toast(error.message);
        refresh();
      }
    };
    const section = (title, ...children) => [h('h3', { class: 'profile-section', text: title }), children];
    openSheet(
      h('h2', { class: 'sheet-title', text: t('Twoja oferta') }),
      h('p', { class: 'sheet-text', text: t('Co dasz postaci {name}? Zapisana oferta od razu pokaże się po drugiej stronie.', { name: view.other.name }) }),
      gold.element,
      resources.length > 0 && section(t('Zasoby obozu'), resources.map((entry) => entry.element)),
      section(
        t('Przedmioty z plecaka'),
        character.bag.length === 0 ? h('p', { class: 'muted', text: t('W plecaku nie ma przedmiotów. Założonych nie wymienisz.') }) : [count, h('ul', { class: 'item-list' }, items)],
      ),
      herbs.length > 0 && section(t('Zioła'), herbs.map((entry) => entry.element)),
      potions.length > 0 && section(t('Mikstury'), potions.map((entry) => entry.element)),
      materials.length > 0 && section(t('Materiały'), materials.map((entry) => entry.element)),
      minerals.length > 0 && section(t('Minerały'), minerals.map((entry) => entry.element)),
      h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--world', text: t('Anuluj'), onClick: closeSheet }), button(t('Zapisz ofertę'), 'system', save)),
    );
  }

  // A proposal waits a while for its answer.
  function tick(now) {
    if (view?.state === 'proposed') countdown.textContent = t('Propozycja przepadnie za {time}.', { time: formatCountdown(view.endsAt - now) });
  }

  restart = start;
  start();
  return {
    tick,
    unmount() {
      gone = true;
      clearInterval(timer);
      restart = null;
      onScreen = null;
      if (view && !LIVE.includes(view.state)) followed = null;
    },
  };
}

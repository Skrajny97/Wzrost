// The Wymiana with another player's character (src/server/trades.js),
// proposed on its sheet (profile.js) or in a row of the Znajomi while both
// players are online and both characters at home. The other accepts the
// proposal, both put their offers together, and the first confirmation
// freezes both: the other side then only accepts the trade, when all of it
// moves at once, or rejects it. Each confirmation asks first, with what goes
// and what comes. While the screen is open and the page is in front, it asks
// for the trade every two seconds. A proposal to this character opens a
// sheet wherever the player is, once nothing else is on the screen
// (offerTrade), and waits in the Społeczność too (tradeBanner).

import { goldArt, herbSprite, potionSprite } from '../art.js';
import { liveTrade, tradeSeen } from '../chat-news.js';
import { fill, h, icon } from '../dom.js';
import { formatCountdown, formatNumber } from '../format.js';
import { narratorIdle } from '../narrator.js';
import { playSound } from '../sound.js';
import { call, serverNow, state } from '../state.js';
import { closeSheet, confirmAction, openSheet, pageHeading, toast, withButton } from '../ui.js';
import { itemSummary, itemTitle } from './character.js';

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
    toast('Propozycja odrzucona.');
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
    h('h2', { class: 'sheet-title trade-sheet-title' }, icon('swap', { size: 22 }), 'Propozycja wymiany'),
    h('p', { class: 'sheet-text', text: `${trade.other} proponuje Ci wymianę przedmiotów, ziół, mikstur albo złota.` }),
    h('p', { class: 'muted', text: `Bez odpowiedzi propozycja przepadnie po ${Math.round(state.content.community.trade.proposalSeconds / 60)} min.` }),
    h('div', { class: 'sheet-actions' }, button('Odrzuć', 'world', reply(false)), button('Przyjmij', 'system', reply(true))),
  );
}

// The trade in the Społeczność, over its parts: a proposal to answer, or
// the way back to a trade going on. Null without one.
export function tradeBanner() {
  const trade = liveTrade();
  if (!trade) return null;
  const open = () => h('a', { class: 'button button--system button--small', href: HASH, onClick: () => (followed = trade.id), text: 'Otwórz' });
  const parts =
    trade.state === 'proposed' && !trade.proposer
      ? [
          h('p', { text: `${trade.other} proponuje Ci wymianę.` }),
          h('div', { class: 'trade-banner-actions' }, button('Odrzuć', 'world', () => answer(trade.id, false)), button('Przyjmij', 'system', () => answer(trade.id, true))),
        ]
      : [h('p', { text: trade.state === 'proposed' ? `Czekasz, aż ${trade.other} przyjmie wymianę.` : `Trwa wymiana z postacią ${trade.other}.` }), open()];
  return h('section', { class: 'card trade-banner', 'aria-label': 'Wymiana' }, icon('swap', { size: 22, className: 'trade-banner-icon' }), parts);
}

// What an offer holds, in words: "120 złota, Amulet Dębu, Żywokost ×5".
function offerText(offer) {
  const parts = [
    offer.gold > 0 && `${formatNumber(offer.gold)} złota`,
    ...offer.items.map(itemTitle),
    ...[...offer.herbs, ...offer.potions].map((stack) => `${stack.name} ×${formatNumber(stack.count)}`),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'nic';
}

const isEmpty = (offer) => offer.gold === 0 && offer.items.length === 0 && offer.herbs.length === 0 && offer.potions.length === 0;

export function mountTrade(container, { backHash }) {
  let view = null;
  let seen = '';
  let gone = false;
  let asking = false;
  let timer = null;
  const countdown = h('p', { class: 'muted trade-countdown' });
  const body = h('div', { class: 'trade' }, h('p', { class: 'muted', text: 'Wczytywanie…' }));
  fill(container, pageHeading('Wymiana'), body);

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
        toast('Wymiana zakończona.');
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
    const sure = await confirmAction({
      title: final ? 'Przyjąć wymianę?' : 'Zatwierdzić wymianę?',
      text: `Oddasz: ${offerText(mine)}. Dostaniesz: ${offerText(theirs)}.${final ? '' : ` Potem żadna z ofert już się nie zmieni, a ${other.name} przyjmie wymianę albo ją odrzuci.`}`,
      confirmLabel: final ? 'Przyjmij' : 'Zatwierdź',
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
        return view.proposer ? `Propozycja wysłana. Czekasz, aż ${name} ją przyjmie.` : `${name} proponuje Ci wymianę.`;
      case 'open':
        return 'Dodajcie do ofert, co chcecie dać. Kto pierwszy zatwierdzi wymianę, ten zamrozi obie oferty, a druga strona już tylko ją przyjmie albo odrzuci.';
      case 'locked':
        return view.lockedBy === 'me'
          ? `Wymiana zatwierdzona. Oferty już się nie zmienią. Czekasz, aż ${name} ją przyjmie albo odrzuci.`
          : `Postać ${name} zatwierdziła wymianę. Oferty już się nie zmienią: przyjmij ją albo odrzuć.`;
      case 'done':
        return 'Wymiana zakończona. Wszystko jest już w plecakach.';
      case 'rejected':
        return view.proposer ? `Postać ${name} odrzuciła wymianę.` : 'Wymiana odrzucona.';
      case 'cancelled':
        return 'Wymiana anulowana.';
      default:
        return 'Wymiana przepadła, bo za długo nic się w niej nie działo.';
    }
  }

  function render() {
    if (!view) {
      fill(
        body,
        h('p', { class: 'sheet-text', text: 'Nie trwa żadna wymiana. Zaproponujesz ją w karcie postaci innego gracza albo na liście Znajomych.' }),
        h('a', { class: 'button button--world', href: '#/spolecznosc', text: 'Społeczność' }),
      );
      return;
    }
    const live = LIVE.includes(view.state);
    fill(
      body,
      h('p', { class: 'trade-with' }, icon('swap', { size: 18 }), `Z postacią ${view.other.name}`),
      h('p', { class: 'trade-status', role: 'status', text: statusText() }),
      view.state === 'proposed' && countdown,
      live && !view.other.online && h('p', { class: 'region-warning', text: `Gracz ${view.other.name} nie jest teraz online.` }),
      live && state.character.activity && h('p', { class: 'region-warning', text: 'Twoja postać jest poza obozem. Wymienisz się po jej powrocie.' }),
      ['open', 'locked', 'done'].includes(view.state) && [offerCard(true), offerCard(false)],
      actions(),
    );
    tick(serverNow());
  }

  function offerCard(mine) {
    const offer = mine ? view.mine : view.theirs;
    const stacks = [...offer.herbs.map((stack) => ({ ...stack, herb: true })), ...offer.potions];
    return h(
      'section',
      { class: 'card trade-offer' },
      h('h2', { class: 'card-title', text: view.state === 'done' ? (mine ? 'Oddano' : 'Otrzymano') : mine ? 'Twoja oferta' : `Oferta: ${view.other.name}` }),
      isEmpty(offer) && h('p', { class: 'muted', text: 'Na razie pusto.' }),
      offer.gold > 0 && h('p', { class: 'trade-gold' }, goldArt(20), `${formatNumber(offer.gold)} złota`),
      offer.items.length > 0 && h('ul', { class: 'item-list' }, offer.items.map((item) => h('li', {}, itemEntry(item, mine)))),
      stacks.length > 0 && h('ul', { class: 'trade-stacks' }, stacks.map((stack) => stackEntry(stack, mine))),
      mine && view.state === 'open' && h('button', { type: 'button', class: 'button button--world', text: isEmpty(offer) ? 'Dodaj do oferty' : 'Zmień ofertę', onClick: editOffer }),
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
          item.classIds && !item.classIds.includes(character.classId) && 'Twoja klasa nie może go używać.',
          item.level > character.level && `Założysz go od poziomu postaci ${item.level}.`,
          item.classLevel && character.classLevel < item.classLevel && `Założysz go od poziomu klasy ${item.classLevel}.`,
        ].filter(Boolean);
    return [
      h(
        'details',
        { class: 'profile-item' },
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

  // Herbs or potions of an offer; a potion whose recipe the character does
  // not know waits for it.
  function stackEntry(stack, mine) {
    const art = (stack.herb ? herbSprite(stack.id) : potionSprite(stack.id)) ?? icon(stack.herb ? 'leaf' : 'flask', { size: 20 });
    return h(
      'li',
      { class: 'trade-stack' },
      h('span', { class: 'potion-pick-art' }, art),
      h('span', { class: 'trade-stack-name', text: stack.name }),
      h('span', { class: 'trade-stack-count', text: `×${formatNumber(stack.count)}` }),
      !mine && !stack.herb && !stack.known && h('p', { class: 'region-warning trade-note', text: 'Nie znasz jej receptury, więc jej nie użyjesz.' }),
    );
  }

  function actions() {
    const row = (...buttons) => h('div', { class: 'sheet-actions' }, buttons);
    switch (view.state) {
      case 'proposed':
        return view.proposer ? row(button('Cofnij propozycję', 'world', end)) : row(button('Odrzuć', 'world', reply(false)), button('Przyjmij', 'system', reply(true)));
      case 'open':
        return row(button('Odrzuć wymianę', 'world', end), button('Zatwierdź wymianę', 'system', confirm, { disabled: isEmpty(view.mine) && isEmpty(view.theirs) }));
      case 'locked':
        return row(button('Odrzuć wymianę', 'world', end), view.lockedBy === 'them' && button('Przyjmij wymianę', 'system', confirm));
      default:
        return row(h('a', { class: 'button button--world', href: backHash ?? '#/spolecznosc', text: 'Wróć' }));
    }
  }

  // The player's offer in a sheet: gold, items from the bag (not those
  // worn), herbs and potions, saved at once for the other to see.
  function editOffer() {
    const character = state.character;
    const { maxItems } = state.content.community.trade;
    const picked = new Set(view.mine.items.map((item) => item.id).filter((id) => character.bag.some((item) => item.id === id)));
    const counts = Object.fromEntries([...view.mine.herbs, ...view.mine.potions].map((stack) => [stack.id, stack.count]));
    const field = (id, label, value, most, art) => {
      const input = h('input', { type: 'number', id, class: 'trade-number', min: '0', max: String(most), step: '1', inputmode: 'numeric', value: String(Math.min(value, most)) });
      const element = h(
        'div',
        { class: 'trade-field' },
        art && h('span', { class: 'potion-pick-art' }, art),
        h('label', { for: id, class: 'trade-field-label', text: label }),
        input,
        h('span', { class: 'muted trade-field-most', text: `z ${formatNumber(most)}` }),
      );
      const read = () => {
        const value = input.value.trim() === '' ? 0 : Number(input.value);
        if (!Number.isInteger(value) || value < 0 || value > most) throw new Error(`${label}: wpisz od 0 do ${formatNumber(most)}.`);
        return value;
      };
      return { element, read };
    };
    const gold = field('trade-gold', 'Złoto', view.mine.gold, character.gold, goldArt(20));
    const stackFields = (entries, kind, art) => entries.map((entry) => ({ id: entry.id, ...field(`trade-${kind}-${entry.id}`, entry.name, counts[entry.id] ?? 0, entry.count, art(entry.id)) }));
    const herbs = stackFields(character.herbs ?? [], 'herb', (id) => herbSprite(id) ?? icon('leaf', { size: 20 }));
    const potions = stackFields(character.potions ?? [], 'potion', (id) => potionSprite(id) ?? icon('flask', { size: 20 }));
    const count = h('p', { class: 'muted' });
    const showCount = () => {
      count.textContent = `Wybrane: ${picked.size} z ${maxItems}.`;
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
              toast(`W jednej wymianie najwyżej ${maxItems} przedmiotów.`);
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
        offer = { gold: gold.read(), items: [...picked], herbs: kept(herbs), potions: kept(potions) };
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
      h('h2', { class: 'sheet-title', text: 'Twoja oferta' }),
      h('p', { class: 'sheet-text', text: `Co dasz postaci ${view.other.name}? Zapisana oferta od razu pokaże się po drugiej stronie.` }),
      gold.element,
      section(
        'Przedmioty z plecaka',
        character.bag.length === 0 ? h('p', { class: 'muted', text: 'W plecaku nie ma przedmiotów. Założonych nie wymienisz.' }) : [count, h('ul', { class: 'item-list' }, items)],
      ),
      herbs.length > 0 && section('Zioła', herbs.map((entry) => entry.element)),
      potions.length > 0 && section('Mikstury', potions.map((entry) => entry.element)),
      h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--world', text: 'Anuluj', onClick: closeSheet }), button('Zapisz ofertę', 'system', save)),
    );
  }

  // A proposal waits a while for its answer.
  function tick(now) {
    if (view?.state === 'proposed') countdown.textContent = `Propozycja przepadnie za ${formatCountdown(view.endsAt - now)}.`;
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

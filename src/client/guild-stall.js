// The Kram tab of the Gildia's page (1202 A; the server's guild-stall.js;
// DECISIONS.md, "Znaki Gildii i Kram"): the character's Znaki Gildii, a Znak
// for each point of Sława it brings its guild, and the Kram's goods, each
// with its price, its limit this week (or once) and what keeps it from the
// purchase now. The item opens a sheet of the slots, each with what the
// character wears there, and buys for the one chosen. Outside a guild, the
// Znaki and the words that the Kram is for members. The words come with
// the answer (data/guilds.json, stall), in the page's language.

import { cosmeticArt, guildMarkArt, scrollArt } from './art.js';
import { fill, h, icon } from './dom.js';
import { formatNumber } from './format.js';
import { t } from './i18n.js';
import { SLOT_ICONS } from './icons.js';
import { call } from './state.js';
import { closeSheet, howItWorks, openSheet, toast, withButton } from './ui.js';

const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole));

// "50 Znaków" in the page's forms of the noun.
function marksText(count, [one, few, many]) {
  const last = count % 10;
  const tens = count % 100;
  const form = count === 1 ? one : last >= 2 && last <= 4 && (tens < 12 || tens > 14) ? few : many;
  return `${formatNumber(count)} ${form}`;
}

// A good's picture: the pack of cards, the scroll, a chest, the title's
// trophy and the frame itself.
function goodArt(good) {
  if (good.id === 'pack') return h('img', { class: 'stall-art-image', src: '/art/cards/pack.png', alt: '', width: 30, height: 40 });
  if (good.id === 'ward-scroll') return scrollArt('ward-scroll', 32);
  if (good.id === 'frame') {
    const art = cosmeticArt('frame-guild-banner');
    return art ? h('img', { class: 'stall-art-image', src: art, alt: '', width: 30, height: 40 }) : icon('star', { size: 28 });
  }
  return icon(good.id === 'item' ? 'coffer' : 'trophy', { size: 28 });
}

export function mountGuildStall(container) {
  let view = null;
  let gone = false;
  const holder = h('div', { class: 'friends guild-stall' }, h('p', { class: 'muted', text: t('Wczytywanie…') }));
  container.append(holder);

  // A purchase: the good (for an item, the slot) with the Znaki the page
  // shows, answered with the Kram anew and its words in a toast.
  async function buy(good, slot = null) {
    const answer = await call('POST', '/api/guild/stall/buy', { good: good.id, ...(slot && { slot }), seen: view.marks.version });
    view = answer.stall;
    toast(answer.bought.text);
    render();
  }

  // The item's slots in a sheet: each with what the character wears there,
  // one picked, then the purchase for the price.
  function chooseSlot(good) {
    const { texts } = view;
    let picked = null;
    const confirm = h('button', { type: 'button', class: 'button button--system stall-slot-buy', disabled: true, text: filled(texts.buy, { price: good.priceText }) });
    const options = view.slots.map((slot) =>
      h(
        'button',
        {
          type: 'button',
          class: 'stall-slot',
          'aria-pressed': 'false',
          dataset: { slot: slot.id },
          onClick: () => {
            picked = slot.id;
            for (const one of options) one.setAttribute('aria-pressed', String(one.dataset.slot === picked));
            confirm.disabled = false;
          },
        },
        icon(SLOT_ICONS[slot.id] ?? 'unknown', { size: 22, className: 'stall-slot-icon' }),
        h(
          'span',
          { class: 'stall-slot-text' },
          h('strong', { text: slot.name }),
          slot.worn
            ? h('span', { class: 'stall-slot-worn', style: slot.worn.color ? { color: slot.worn.color } : null, text: filled(texts.worn, { item: slot.worn.name }) })
            : h('span', { class: 'stall-slot-worn muted', text: texts.empty }),
        ),
      ),
    );
    confirm.addEventListener('click', () =>
      withButton(confirm, async () => {
        if (!picked) return;
        await buy(good, picked);
        closeSheet();
      }),
    );
    openSheet(h('h2', { class: 'sheet-title', text: texts.slotTitle }), h('p', { class: 'muted', text: texts.slotLead }), h('div', { class: 'stall-slots' }, options), confirm);
  }

  // A good's line under its name: its limit this week, "once", or owned.
  function limitLine(good) {
    const { texts } = view;
    if (good.owned) return h('span', { class: 'stall-limit stall-limit--owned' }, icon('check', { size: 14 }), texts.owned);
    if (good.weekly === null) return h('span', { class: 'stall-limit', text: texts.once });
    return h('span', { class: 'stall-limit', text: filled(texts.weekly, { bought: formatNumber(good.bought), limit: formatNumber(good.weekly) }) });
  }

  // Why a good cannot be bought now, under its button.
  function reasonLine(good) {
    const { texts } = view;
    if (!good.block || good.block === 'owned' || good.block === 'no_guild') return null;
    const text =
      good.block === 'limit'
        ? texts.limitReached
        : good.block === 'too_few_marks'
          ? filled(texts.tooFew, { missing: marksText(good.missing, texts.markForms) })
          : good.block === 'bag_full'
            ? texts.bagFull
            : null;
    return text && h('p', { class: 'stall-reason', text });
  }

  function goodRow(good) {
    const { texts } = view;
    const button =
      view.member && !good.owned
        ? h(
            'button',
            {
              type: 'button',
              class: 'button button--system button--small stall-buy',
              disabled: Boolean(good.block),
              onClick: (event) => (good.id === 'item' ? chooseSlot(good) : withButton(event.currentTarget, () => buy(good))),
            },
            guildMarkArt(16),
            h('span', { text: filled(texts.buy, { price: formatNumber(good.price) }) }),
          )
        : null;
    return h(
      'li',
      { class: `stall-good${good.block && good.block !== 'no_guild' ? ' stall-good--blocked' : ''}${good.owned ? ' stall-good--owned' : ''}`, dataset: { good: good.id } },
      h('span', { class: 'stall-art' }, goodArt(good)),
      h(
        'span',
        { class: 'stall-text' },
        h('strong', { class: 'stall-name', text: good.name }),
        h('span', { class: 'stall-description', text: good.description }),
        h('span', { class: 'stall-meta' }, h('span', { class: 'stall-price' }, guildMarkArt(14), h('span', { text: good.priceText })), limitLine(good)),
        reasonLine(good),
      ),
      button && h('span', { class: 'stall-action' }, button),
    );
  }

  function render() {
    if (gone || !view) return;
    const { texts } = view;
    fill(
      holder,
      h(
        'section',
        { class: 'card stall-card', 'aria-labelledby': 'stall-title' },
        h('h2', { class: 'card-title', id: 'stall-title' }, icon('shop', { size: 22 }), texts.title),
        h('p', { class: 'muted', text: texts.lead }),
        h(
          'div',
          { class: 'stall-balance' },
          h('span', { class: 'stall-balance-art' }, guildMarkArt(32)),
          h('span', { class: 'stall-balance-text' }, h('span', { class: 'stall-balance-label', text: texts.balance }), h('strong', { class: 'stall-balance-count', text: formatNumber(view.marks.left) })),
        ),
        h('p', { class: view.member ? 'muted' : 'stall-outside', text: view.member ? texts.growing : texts.outside }),
        h('ul', { class: 'stall-goods' }, view.goods.map(goodRow)),
        howItWorks(null, texts.how),
      ),
    );
  }

  call('GET', '/api/guild/stall')
    .then((answer) => {
      view = answer.stall;
      render();
    })
    .catch((error) => {
      if (!gone) fill(holder, h('section', { class: 'card' }, h('p', { class: 'muted', text: error.message ?? t('Nie udało się wczytać Kramu.') })));
    });

  return {
    unmount() {
      gone = true;
    },
  };
}

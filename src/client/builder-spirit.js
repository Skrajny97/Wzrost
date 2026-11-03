// The Duch budowniczego at the Kamień węgielny Warowni
// (src/engine/builder-spirit.js; the author: "Niech przy Kamieniu czuwa
// duch budowniczego, który za zasoby płaci złotem"), in the stone's window:
// his bust once it is drawn (on the residents' list in art.js), his name and
// words, and the camp's resources he buys, each with what the character has,
// his price, what the camp's builds still need of it and "Sprzedaj", as at
// Jagna's. The sale's window picks the pieces as the fire spirit's does,
// from the fewest that bring a coin, with "wszystkie" and, while the builds
// still need some, "nadmiar".

import { residentBust, resourceArt } from './art.js';
import { h } from './dom.js';
import { formatNumber } from './format.js';
import { playSound } from './sound.js';
import { call } from './state.js';
import { openSheet, toast, withButton } from './ui.js';

// One of the spirit's texts with its {gold}, {lot} or {count} filled in.
const say = (text, values) => text.replace(/\{(\w+)\}/g, (whole, key) => (Object.hasOwn(values, key) ? formatNumber(values[key]) : whole));

// What the spirit pays for `count` pieces of a good, as the server counts it
// (spiritGold in the engine): whole coins, rounded down.
export const spiritGold = (good, lot, count) => Math.floor((count * good.gold) / lot);

// The pieces a sale of a good may take: from the fewest that bring a coin up
// to all the character has; null when it has fewer than those.
export const saleRange = (good) => (good.have >= good.least ? { least: good.least, most: good.have } : null);

// What the character has over the camp's builds' need, when they still need
// some of it and the rest is enough for a sale; null otherwise.
export function surplusOf(good) {
  const surplus = good.have - good.need;
  return good.need > 0 && surplus >= good.least ? surplus : null;
}

// The spirit's part of the stone's window; `sell` opens a good's sale.
export function spiritPart(spirit, sell) {
  const bust = residentBust(spirit.art);
  return h(
    'section',
    { class: 'builder-spirit', 'aria-label': spirit.name },
    h(
      'div',
      { class: 'settlement-resident-head' },
      bust && h('span', { class: 'settlement-resident-bust' }, bust),
      h('div', {}, h('p', { class: 'settlement-resident-name', text: spirit.name }), h('p', { class: 'settlement-greeting', text: `„${spirit.line}”` })),
    ),
    h(
      'ul',
      { class: 'settlement-goods' },
      spirit.goods.map((good) =>
        h(
          'li',
          { class: 'settlement-good' },
          h('p', { class: 'builder-spirit-good' }, resourceArt(good.id, 20), h('strong', { text: `${good.name} × ${formatNumber(good.have)}` })),
          h('p', { class: 'muted', text: say(spirit.texts.price, { gold: good.gold, lot: spirit.lot }) }),
          good.need > 0 && h('p', { class: 'muted', text: say(spirit.texts.need, { count: good.need }) }),
          good.have > 0 && !saleRange(good) && h('p', { class: 'muted', text: say(spirit.texts.least, { count: good.least }) }),
          h('button', {
            type: 'button',
            class: 'button button--world button--small',
            text: 'Sprzedaj',
            disabled: !saleRange(good),
            onClick: () => sell(good),
          }),
        ),
      ),
    ),
  );
}

// A good's sale: the pieces by the slider, with a button for one more or
// less, "wszystkie" and "nadmiar", and "Sprzedaj za N zł", which is the
// question before the sale, as at Jagna's. `back` opens the stone's window
// again, after the sale or on "Anuluj".
export function spiritSaleSheet(spirit, good, back) {
  const range = saleRange(good);
  if (!range) return;
  let count = range.least;
  const value = h('output', { class: 'fire-trade-amount', 'aria-live': 'off' });
  const sell = h('button', { type: 'button', class: 'button button--system' });
  const slider = h('input', {
    type: 'range',
    class: 'duration-slider fire-trade-slider',
    min: range.least,
    max: range.most,
    step: 1,
    value: count,
    'aria-label': 'Ile sztuk sprzedać',
    disabled: range.most <= range.least,
    onInput: () => set(Number(slider.value)),
  });
  const stepButton = (sign, label) =>
    h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': label, text: sign < 0 ? '−' : '+', onClick: () => set(count + sign) });
  const less = stepButton(-1, 'O sztukę mniej');
  const more = stepButton(1, 'O sztukę więcej');
  const surplus = surplusOf(good);
  function set(next) {
    count = Math.min(range.most, Math.max(range.least, next));
    const gold = spiritGold(good, spirit.lot, count);
    slider.value = String(count);
    slider.setAttribute('aria-valuetext', `${formatNumber(count)} szt. za ${formatNumber(gold)} zł`);
    slider.style.setProperty('--fill', `${((count - range.least) / Math.max(1, range.most - range.least)) * 100}%`);
    value.textContent = `${formatNumber(count)} szt.`;
    sell.textContent = `Sprzedaj za ${formatNumber(gold)} zł`;
    less.disabled = count <= range.least;
    more.disabled = count >= range.most;
  }
  set(count);
  sell.addEventListener('click', (event) =>
    withButton(event.currentTarget, async () => {
      const { sold } = await call('POST', '/api/camp/sell', { resource: good.id, amount: count });
      playSound('collect');
      toast(say(spirit.texts.sold, { gold: sold.gold }));
      back();
    }),
  );
  openSheet(
    h('h2', { class: 'sheet-title', text: good.name }),
    h('p', {
      class: 'sheet-text',
      text: [`Masz ${formatNumber(good.have)} szt.`, `${spirit.name}: ${say(spirit.texts.price, { gold: good.gold, lot: spirit.lot })}`, good.need > 0 && say(spirit.texts.need, { count: good.need })]
        .filter(Boolean)
        .join(' '),
    }),
    h('p', { class: 'fire-trade-pick' }, value),
    h('div', { class: 'duration-row' }, less, slider, more),
    h(
      'p',
      { class: 'builder-spirit-quick' },
      h('button', { type: 'button', class: 'link-button', text: 'wszystkie', onClick: () => set(range.most) }),
      surplus !== null && h('button', { type: 'button', class: 'link-button', text: 'nadmiar', onClick: () => set(surplus) }),
    ),
    h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--world', text: 'Anuluj', onClick: back }), sell),
  );
}

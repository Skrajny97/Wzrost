// The Pustelnik's Punkty Czasu for gold in his hut (the author, 10.11.2026:
// "Dodaj w Chacie Pustelnika opcję kupienia Punktów Czasu za złoto - do 30
// dziennie, 3000 złota za sztukę"; src/server/settlement.js, buyTimePoints):
// a button in his list and the buy's window, which picks the count by a
// slider, with one more or less and "najwięcej", up to what is left of the
// day's limit and what the gold pays for, as the Duch budowniczego's sale.

import { timePointsArt } from './art.js';
import { h } from './dom.js';
import { formatNumber } from './format.js';
import { t } from './i18n.js';
import { playSound } from './sound.js';
import { call, state } from './state.js';
import { closeSheet, openSheet, toast, withButton } from './ui.js';

// The most one buy can take now: what is left of today's limit, as far as
// `gold` goes. `offer` is the hut's { gold, daily, left } from the server.
export const timePointsMost = (offer, gold) => Math.max(0, Math.min(offer.left, Math.floor(gold / offer.gold)));

// The Pustelnik's button for the Punkty Czasu; `done` loads the Osada again
// after a buy. With the day's limit bought it says so and does nothing.
export function timePointsButton(offer, done) {
  const sold = offer.left < 1;
  return h('button', {
    type: 'button',
    class: 'button button--world button--small',
    text: sold
      ? t('Punkty Czasu: dziś kupione wszystkie ({daily})', { daily: formatNumber(offer.daily) })
      : t('Kup Punkty Czasu ({gold} zł/szt.)', { gold: formatNumber(offer.gold) }),
    disabled: sold,
    onClick: () => (timePointsMost(offer, state.character.gold) < 1 ? toast(t('Brakuje złota.')) : timePointsSheet(offer, done)),
  });
}

function timePointsSheet(offer, done) {
  const most = timePointsMost(offer, state.character.gold);
  let count = 1;
  const value = h('output', { class: 'fire-trade-amount', 'aria-live': 'off' });
  const buy = h('button', { type: 'button', class: 'button button--system' });
  const slider = h('input', {
    type: 'range',
    class: 'duration-slider fire-trade-slider',
    min: 1,
    max: most,
    step: 1,
    value: count,
    'aria-label': t('Ile Punktów Czasu kupić'),
    disabled: most <= 1,
    onInput: () => set(Number(slider.value)),
  });
  const stepButton = (sign, label) =>
    h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': label, text: sign < 0 ? '−' : '+', onClick: () => set(count + sign) });
  const less = stepButton(-1, t('O sztukę mniej'));
  const more = stepButton(1, t('O sztukę więcej'));
  function set(next) {
    count = Math.min(most, Math.max(1, next));
    const gold = count * offer.gold;
    slider.value = String(count);
    slider.setAttribute('aria-valuetext', t('{count} szt. za {gold} zł', { count: formatNumber(count), gold: formatNumber(gold) }));
    slider.style.setProperty('--fill', `${((count - 1) / Math.max(1, most - 1)) * 100}%`);
    value.textContent = t('{count} szt.', { count: formatNumber(count) });
    buy.textContent = t('Kup za {gold} zł', { gold: formatNumber(gold) });
    less.disabled = count <= 1;
    more.disabled = count >= most;
  }
  set(count);
  buy.addEventListener('click', (event) =>
    withButton(event.currentTarget, async () => {
      const answer = await call('POST', '/api/settlement/hermit', { service: 'time', count });
      playSound('collect');
      closeSheet();
      toast(t('Pustelnik wziął {gold} złota. Punkty Czasu: +{count}.', { gold: formatNumber(answer.gold), count: formatNumber(answer.timePoints) }));
      done();
    }),
  );
  openSheet(
    h('h2', { class: 'sheet-title', text: t('Punkty Czasu od Pustelnika') }),
    h('p', {
      class: 'sheet-text',
      text: t('{gold} zł za Punkt Czasu. Każdy skraca o minutę wyprawę, pracę albo budowę. Dziś kupisz jeszcze {left} z {daily}.', {
        gold: formatNumber(offer.gold),
        left: formatNumber(offer.left),
        daily: formatNumber(offer.daily),
      }),
    }),
    h('p', { class: 'fire-trade-pick' }, timePointsArt(20), ' ', value),
    h('div', { class: 'duration-row' }, less, slider, more),
    h('p', { class: 'builder-spirit-quick' }, h('button', { type: 'button', class: 'link-button', text: t('najwięcej'), onClick: () => set(most) })),
    h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--world', text: t('Anuluj'), onClick: closeSheet }), buy),
  );
}

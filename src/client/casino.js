// The Salon Gier in the Osada (src/server/casino.js; answers 523–526), under
// Szczęsny's card on its screen: the Loteria, with today's pot, the ticket of
// the day and the last draw, and the Koło Fortuny, with the stake by a
// slider, its chance, the spin and the character's pool of the day. The
// words are the data's (data/settlement.json, casino.texts).
//
// The Osada's place screen mounts the panel once and keeps it while it
// redraws itself, as the Targowisko's, so a redraw never asks the server
// again.

import { h } from './dom.js';
import { formatDecimal, formatNumber } from './format.js';
import { playSound } from './sound.js';
import { call, serverNow, state } from './state.js';
import { systemPanel, toast, withButton } from './ui.js';
import { itemEntry, stackButton } from './screens/market.js';

// One of the Salon's texts with its {…} filled in: numbers as the game
// writes them, words as they are.
const say = (text, values = {}) =>
  text.replace(/\{(\w+)\}/g, (whole, key) => (Object.hasOwn(values, key) ? (typeof values[key] === 'number' ? formatNumber(values[key]) : values[key]) : whole));

// A chance as a percent, "50", "0,5".
const percent = (chance) => formatDecimal(chance * 100);

// A day of the draws ("2026-11-02") as "2.11".
const dayLabel = (key) => {
  const [, month, day] = key.split('-').map(Number);
  return `${day}.${month}`;
};

// A prize's name in one line: an item's own, materials with their count.
const prizeName = (prize) => (prize.kind === 'item' ? prize.name : `${prize.name} ×${formatNumber(prize.count)}`);

// Szczęsny's words after a spin, one of the data's.
const oneOf = (lines) => lines[Math.floor(Math.random() * lines.length)];

export function mountCasino(holder) {
  let casino = null;
  let failure = null;
  let gone = false;
  let timer = null;
  // The stake chosen, kept while the panel redraws.
  let stake = null;
  // The last spin, for its words over the pool: { win, text, words }.
  let result = null;
  const opened = new Set();

  async function load() {
    try {
      ({ casino } = await call('GET', '/api/settlement/casino'));
      failure = null;
    } catch (error) {
      // With the Salon already on the screen, it stays and the game asks
      // again in half a minute (as the Targowisko does).
      if (casino) {
        if (gone) return;
        clearTimeout(timer);
        timer = setTimeout(load, 30000);
        return;
      }
      failure = error;
    }
    if (!gone) render();
  }

  // An action's answer is the Salon after it.
  const apply = (answer) => {
    casino = answer.casino;
    if (!gone) render();
  };

  // The last draw: its words of the System, and the character's own win.
  function lastDraw() {
    const { texts } = casino;
    const { last } = casino.lottery;
    if (!last) return h('p', { class: 'muted', text: texts.lotteryNone });
    return h(
      'div',
      { class: 'casino-last' },
      h('p', { class: 'muted', text: last.yesterday ? texts.lotteryYesterday : say(texts.lotteryEarlier, { date: dayLabel(last.day) }) }),
      h('p', { class: 'casino-announce', text: last.text }),
      last.own && h('p', { class: 'casino-own', text: texts.lotteryMine }),
    );
  }

  // The Loteria (524 A): today's pot and tickets, the ticket of the day or
  // the button that buys it, and the last draw.
  function lotteryCard() {
    const { texts, lottery } = casino;
    const short = state.character.gold < lottery.ticket;
    return h(
      'section',
      { class: 'card stack casino-game', 'data-guide': 'casino-lottery' },
      h('h2', { class: 'section-title', text: lottery.name }),
      h('p', { class: 'muted', text: say(texts.lotteryAbout, { ticket: lottery.ticket, base: lottery.base }) }),
      h('p', { class: 'casino-pot', text: say(texts.lotteryToday, { pot: lottery.pot, tickets: lottery.tickets }) }),
      lottery.mine
        ? h('p', {}, h('span', { class: 'chip chip--success', text: texts.lotteryHas }))
        : h('button', {
            type: 'button',
            class: 'button button--world',
            text: short ? 'Brakuje złota' : say(texts.lotteryBuy, { ticket: lottery.ticket }),
            disabled: short,
            onClick: (event) =>
              withButton(event.currentTarget, async () => {
                apply(await call('POST', '/api/settlement/casino/ticket'));
                toast(texts.lotteryBought);
              }),
          }),
      lastDraw(),
    );
  }

  // A prize of the pool: an item with its card and the comparison with the
  // one worn, or materials as the Targowisko shows a stack; one won is
  // marked so.
  const prizeEntry = (prize, index) =>
    h(
      'li',
      { class: `card market-offer casino-prize${prize.won ? ' casino-prize--won' : ''}` },
      prize.kind === 'item' ? itemEntry(prize.item, `casino:${index}`, opened) : stackButton(prize),
      prize.won && h('p', {}, h('span', { class: 'chip chip--success', text: casino.texts.wheelWon })),
    );

  // The Koło Fortuny (525 A, 526 A): the stake by a slider with a step
  // either way, its chance, the spin, the last spin's words, and the pool.
  function wheelCard() {
    const { texts, wheel } = casino;
    const { minStake, maxStake } = wheel;
    const gold = state.character.gold;
    // At first the top stake, or all the gold when there is less.
    stake = Math.min(maxStake, Math.max(minStake, stake ?? gold));
    const value = h('p', { class: 'fire-trade-pick' });
    const chance = h('p', { class: 'casino-chance' });
    const spin = h('button', { type: 'button', class: 'button button--world' });
    const slider = h('input', {
      type: 'range',
      class: 'duration-slider',
      min: minStake,
      max: maxStake,
      step: 1,
      value: stake,
      'aria-label': 'Stawka',
      onInput: () => set(Number(slider.value)),
    });
    const stepButton = (sign, label) =>
      h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': label, text: sign < 0 ? '−' : '+', onClick: () => set(stake + sign) });
    const less = stepButton(-1, 'Mniejsza stawka');
    const more = stepButton(1, 'Większa stawka');
    const blocked = wheel.itemLeft && wheel.bagFree < 1;
    function set(next) {
      stake = Math.min(maxStake, Math.max(minStake, next));
      slider.value = String(stake);
      slider.setAttribute('aria-valuetext', `${formatNumber(stake)} zł`);
      slider.style.setProperty('--fill', `${((stake - minStake) / Math.max(1, maxStake - minStake)) * 100}%`);
      value.textContent = say(texts.wheelStake, { stake });
      chance.textContent = say(texts.wheelChance, { chance: percent(stake * wheel.chancePerGold) });
      spin.textContent = gold < stake ? 'Brakuje złota' : say(texts.wheelSpin, { stake });
      spin.disabled = gold < stake || blocked;
      less.disabled = stake <= minStake;
      more.disabled = stake >= maxStake;
    }
    set(stake);
    spin.addEventListener('click', (event) =>
      withButton(event.currentTarget, async () => {
        const answer = await call('POST', '/api/settlement/casino/spin', { stake });
        const { win, prize } = answer.spin;
        result = { win, text: win ? say(texts.won, { prize: prizeName(prize) }) : texts.lost, words: oneOf(win ? texts.win : texts.loss) };
        playSound(win ? 'chest' : 'tick');
        toast(result.text);
        apply(answer);
      }),
    );
    return h(
      'section',
      { class: 'card stack casino-game', 'data-guide': 'casino-wheel' },
      h('h2', { class: 'section-title', text: wheel.name }),
      h('p', { class: 'muted', text: say(texts.wheelAbout, { min: minStake, max: maxStake, top: percent(maxStake * wheel.chancePerGold) }) }),
      wheel.left === 0
        ? h('p', { class: 'muted', text: texts.wheelEmpty })
        : [value, h('div', { class: 'duration-row' }, less, slider, more), chance, blocked && h('p', { class: 'region-warning', text: texts.wheelBag }), spin],
      result &&
        h(
          'div',
          { class: `casino-result${result.win ? ' casino-result--win' : ''}`, role: 'status' },
          h('p', { class: 'settlement-greeting', text: `„${result.words}”` }),
          h('p', { class: 'casino-result-text', text: result.text }),
        ),
      h('h3', { class: 'casino-pool-title', text: texts.wheelPool }),
      h('p', { class: 'muted', text: say(texts.wheelPoolAbout, { over: wheel.prizeOver }) }),
      h('ul', { class: 'stack market-list' }, wheel.prizes.map(prizeEntry)),
    );
  }

  function render() {
    clearTimeout(timer);
    if (failure) {
      holder.replaceChildren(systemPanel(failure.message));
      return;
    }
    if (!casino) {
      holder.replaceChildren(h('p', { class: 'muted', text: 'Wczytywanie Salonu Gier…' }));
      return;
    }
    holder.replaceChildren(h('div', { class: 'stack' }, lotteryCard(), wheelCard()));
    // At midnight the draw comes and the pool is new: the Salon is asked
    // again then.
    const next = Math.min(casino.lottery.endsAt, casino.wheel.endsAt);
    timer = setTimeout(load, Math.max(5000, next - serverNow() + 60000));
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

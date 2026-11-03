// The Salon Gier in the Osada (src/server/casino.js; answers 523–526 and
// 542 C), under Szczęsny's card on its screen, in two tabs (the author:
// "Zadbaj o intuicyjne GUI jeśli chodzi o Salon Gier bo na screenach widzę
// znowu dużo scrollowania, opisy chowaj jak zawsze pod 'Jak to działa?'"):
// the Loteria, with today's pot, the ticket of the day and the last draw,
// and the Koło Fortuny, with the stake, stepping through the day's stakes,
// the spin and the stake's pool of the day. The rules wait under "Jak to
// działa?". The words are the data's (data/settlement.json, casino.texts).
//
// The games happen on the screen too (the author: "Trzeba zrobić animację
// jeszcze do koła fortuny wyświetlającą się na ekranie i do kupowania losu,
// żeby nadać temu estetyki"): the Wheel turns under its pointer and stops on
// a gold wedge for a win, a crimson one for a loss, and a bought ticket
// falls into the Loteria's drum (casino.show in the data).
//
// The Osada's place screen mounts the panel once and keeps it while it
// redraws itself, as the Targowisko's, so a redraw never asks the server
// again.

import { salonArt } from './art.js';
import { h } from './dom.js';
import { formatDecimal, formatNumber } from './format.js';
import { motionOn } from './motion.js';
import { playSound } from './sound.js';
import { call, serverNow, state } from './state.js';
import { howItWorks, systemPanel, toast, withButton } from './ui.js';
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

// A game on the screen over the page, gone after `seconds` or at a tap:
// `stage` is what it shows, `start` sets it going, `end` brings it to its
// last look at once (a tap), `close` plays its ending. Resolves when it is
// gone. With the game's animations off there is nothing to show.
function showOnScreen(stage, { start, end, close, seconds }) {
  return new Promise((resolve) => {
    const layer = h('div', { class: 'casino-show', role: 'presentation' }, stage);
    document.body.append(layer);
    let over = false;
    const finish = () => {
      if (over) return;
      over = true;
      end();
      close(layer);
      setTimeout(() => {
        layer.classList.add('casino-show--out');
        setTimeout(() => {
          layer.remove();
          resolve();
        }, 250);
      }, 900);
    };
    layer.addEventListener('click', finish);
    // Two frames, so the start look is painted before it moves.
    requestAnimationFrame(() => requestAnimationFrame(() => start()));
    setTimeout(finish, seconds * 1000 + 150);
  });
}

// The Koło Fortuny on the screen: the wheel under its pointer turns `turns`
// times and more, slower and slower, and stops on a win's wedge for a win,
// a loss's for a loss, somewhere inside it.
function wheelShow(win, show) {
  const { wheel, sounds } = show;
  const wedge = 360 / wheel.wedges;
  const which = Math.floor(Math.random() * (wheel.wedges / 2));
  const centre = wheel.winAt + (win ? 0 : wedge) + which * 2 * wedge + (Math.random() - 0.5) * wedge * 0.6;
  // Turned by this much clockwise, the wheel has that point under the pointer.
  const angle = wheel.turns * 360 + (360 - (((centre % 360) + 360) % 360));
  const disc = h('img', { class: 'casino-show-disc', src: salonArt(wheel.art), alt: '', draggable: 'false' });
  const [x, y] = wheel.pivot;
  disc.style.transformOrigin = `${(x / 128) * 100}% ${(y / 128) * 100}%`;
  disc.style.transitionDuration = `${wheel.seconds}s`;
  const stage = h(
    'div',
    { class: 'casino-show-wheel' },
    h('div', { class: 'casino-show-glow' }),
    disc,
    h('img', { class: 'casino-show-pointer', src: salonArt(wheel.pointer), alt: '', draggable: 'false' }),
  );
  return showOnScreen(stage, {
    seconds: wheel.seconds,
    start: () => {
      playSound(sounds.spin);
      disc.style.transform = `rotate(${angle}deg)`;
    },
    end: () => {
      disc.style.transition = 'none';
      disc.style.transform = `rotate(${angle}deg)`;
    },
    close: (layer) => {
      layer.classList.add(win ? 'casino-show--win' : 'casino-show--loss');
      playSound(win ? sounds.win : sounds.lose);
    },
  });
}

// The Loteria on the screen: the ticket bought falls into the drum, which
// rocks with it.
function ticketShow(show) {
  const { lottery, sounds } = show;
  const stage = h(
    'div',
    { class: 'casino-show-lottery' },
    h('img', { class: 'casino-show-drum', src: salonArt(lottery.drum), alt: '', draggable: 'false' }),
    h('img', { class: 'casino-show-ticket', src: salonArt(lottery.ticket), alt: '', draggable: 'false' }),
  );
  return showOnScreen(stage, {
    seconds: lottery.seconds,
    start: () => {
      playSound(sounds.ticket);
      stage.classList.add('casino-show-lottery--go');
    },
    end: () => stage.classList.add('casino-show-lottery--done'),
    close: () => {},
  });
}

// Whether the games may play on the screen: the animations on, and their
// pictures there.
const showable = (show) => Boolean(show) && motionOn() && Boolean(salonArt(show.wheel.art));

export function mountCasino(holder) {
  let casino = null;
  let failure = null;
  let gone = false;
  let timer = null;
  // The tab open, kept while the panel redraws: at first the Loteria, or
  // the Wheel once today's ticket is bought.
  let tab = null;
  // The stake chosen, kept while the panel redraws; at first the server's
  // (the lowest). While the pool of a stake just chosen is on its way, the
  // pool shown is still the old stake's, and the Wheel waits.
  let stake = null;
  // The newest answer's number, so an older one never draws over it.
  let asked = 0;
  // The last spin, for its words over the pool: { win, text, words }.
  let result = null;
  const opened = new Set();

  // The Salon as an answer brings it.
  function take(answer) {
    casino = answer.casino;
    stake = casino.wheel.stake;
    tab ??= casino.lottery.mine ? 'wheel' : 'lottery';
  }

  async function load() {
    asked += 1;
    const mine = asked;
    try {
      const answer = await call('GET', `/api/settlement/casino${stake ? `?stake=${stake}` : ''}`);
      if (mine !== asked) return;
      take(answer);
      failure = null;
    } catch (error) {
      if (mine !== asked) return;
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

  // An action's answer is the Salon after it, newer than any on its way.
  const apply = (answer) => {
    asked += 1;
    take(answer);
    if (!gone) render();
  };

  // Another stake: its pool comes from the server.
  function choose(next) {
    if (next === undefined || next === stake) return;
    stake = next;
    result = null;
    render();
    load();
  }

  // The tabs: the Loteria and the Koło Fortuny.
  function tabs() {
    const names = { lottery: casino.lottery.name, wheel: casino.wheel.name };
    return h(
      'div',
      { class: 'chat-tabs market-tabs', role: 'tablist', 'aria-label': 'Salon Gier' },
      ['lottery', 'wheel'].map((id) =>
        h(
          'button',
          {
            type: 'button',
            class: 'chat-tab',
            role: 'tab',
            'data-guide': `casino-tab-${id}`,
            'aria-selected': String(tab === id),
            onClick: () => {
              tab = id;
              render();
            },
          },
          h('span', { class: 'chat-tab-name', text: names[id] }),
        ),
      ),
    );
  }

  // The last draw in a line: the System's words of it, and the character's
  // own win.
  function lastDraw() {
    const { texts } = casino;
    const { last } = casino.lottery;
    if (!last) return h('p', { class: 'muted', text: texts.lotteryNone });
    return h(
      'div',
      { class: 'casino-last' },
      h('p', {}, h('span', { class: 'muted', text: `${last.yesterday ? texts.lotteryYesterday : say(texts.lotteryEarlier, { date: dayLabel(last.day) })} ` }), h('span', { class: 'casino-announce', text: last.text })),
      last.own && h('p', { class: 'casino-own', text: texts.lotteryMine }),
    );
  }

  // The Loteria (524 A): today's pot and tickets, the ticket of the day or
  // the button that buys it, the last draw, and the rules folded.
  function lotteryCard() {
    const { texts, lottery } = casino;
    const short = state.character.gold < lottery.ticket;
    return h(
      'section',
      { class: 'card stack casino-game', 'data-guide': 'casino-lottery' },
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
                const answer = await call('POST', '/api/settlement/casino/ticket', { stake });
                if (showable(casino.show)) await ticketShow(casino.show);
                apply(answer);
                toast(texts.lotteryBought);
              }),
          }),
      lastDraw(),
      howItWorks(null, say(texts.lotteryAbout, { ticket: lottery.ticket, base: lottery.base })),
    );
  }

  // A prize of the pool: an item with its card and the comparison with the
  // one worn, or materials as the Targowisko shows a stack; one won is
  // marked so.
  const prizeEntry = (prize, index) =>
    h(
      'li',
      { class: `card market-offer casino-prize${prize.won ? ' casino-prize--won' : ''}` },
      prize.kind === 'item' ? itemEntry(prize.item, `casino:${casino.wheel.stake}:${index}`, opened) : stackButton(prize),
      prize.won && h('p', {}, h('span', { class: 'chip chip--success', text: casino.texts.wheelWon })),
    );

  // The Koło Fortuny (525 A, 526 A, 542 C): the stake and its chance, a
  // step either way and a slider through the day's stakes, the spin, the
  // last spin's words, the rules folded, and the stake's pool.
  function wheelCard() {
    const { texts, wheel } = casino;
    const { stakes } = wheel;
    const gold = state.character.gold;
    const at = Math.max(0, stakes.indexOf(stake));
    // The pool shown is the chosen stake's.
    const ready = stake === wheel.stake;
    const stakeText = (value) => say(texts.wheelStake, { stake: value, chance: percent(wheel.chance) });
    const fill = (index) => `${(index / Math.max(1, stakes.length - 1)) * 100}%`;
    const label = h('p', { class: 'casino-chance', text: stakeText(stake) });
    // The slider names the stake under the finger and asks for its pool when
    // let go.
    const slider = h('input', {
      type: 'range',
      class: 'duration-slider',
      min: 0,
      max: stakes.length - 1,
      step: 1,
      value: at,
      'aria-label': 'Stawka',
      'aria-valuetext': `${formatNumber(stake)} zł`,
      vars: { '--fill': fill(at) },
      onInput: () => {
        const index = Number(slider.value);
        label.textContent = stakeText(stakes[index]);
        slider.style.setProperty('--fill', fill(index));
        slider.setAttribute('aria-valuetext', `${formatNumber(stakes[index])} zł`);
      },
      onChange: () => choose(stakes[Number(slider.value)]),
    });
    const stepButton = (sign, text) =>
      h('button', {
        type: 'button',
        class: 'button button--world duration-step',
        'aria-label': text,
        text: sign < 0 ? '−' : '+',
        disabled: stakes[at + sign] === undefined,
        onClick: () => choose(stakes[at + sign]),
      });
    const blocked = wheel.itemLeft && wheel.bagFree < 1;
    const short = gold < stake;
    const spin =
      ready && wheel.left === 0
        ? h('p', { class: 'muted', text: texts.wheelEmpty })
        : h('button', {
            type: 'button',
            class: 'button button--world',
            text: short ? 'Brakuje złota' : say(texts.wheelSpin, { stake }),
            disabled: !ready || short || blocked,
            onClick: (event) =>
              withButton(event.currentTarget, async () => {
                const answer = await call('POST', '/api/settlement/casino/spin', { stake });
                const { win, prize } = answer.spin;
                result = { win, text: win ? say(texts.won, { prize: prizeName(prize) }) : texts.lost, words: oneOf(win ? texts.win : texts.loss) };
                // The Wheel turns on the screen first; without it, a sound alone.
                if (showable(casino.show)) await wheelShow(win, casino.show);
                else playSound(win ? 'chest' : 'tick');
                toast(result.text);
                apply(answer);
              }),
          });
    return [
      h(
        'section',
        { class: 'card stack casino-game', 'data-guide': 'casino-wheel' },
        label,
        // With one stake of the day there is nothing to step through.
        stakes.length > 1 && h('div', { class: 'duration-row' }, stepButton(-1, 'Mniejsza stawka'), slider, stepButton(1, 'Większa stawka')),
        ready && wheel.left > 0 && blocked && h('p', { class: 'region-warning', text: texts.wheelBag }),
        spin,
        result &&
          h(
            'div',
            { class: `casino-result${result.win ? ' casino-result--win' : ''}`, role: 'status' },
            h('p', { class: 'settlement-greeting', text: `„${result.words}”` }),
            h('p', { class: 'casino-result-text', text: result.text }),
          ),
        howItWorks(null, [say(texts.wheelAbout, { step: wheel.step, chance: percent(wheel.chance) }), texts.wheelPoolAbout]),
      ),
      h('h3', { class: 'casino-pool-title', text: say(texts.wheelPool, { stake: wheel.stake, left: wheel.left, all: wheel.prizes.length }) }),
      h('ul', { class: `stack market-list casino-pool${ready ? '' : ' casino-pool--waiting'}`, 'aria-busy': String(!ready) }, wheel.prizes.map(prizeEntry)),
    ];
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
    holder.replaceChildren(h('div', { class: 'stack' }, tabs(), tab === 'lottery' ? lotteryCard() : wheelCard()));
    // At midnight the draw comes and the pools are new: the Salon is asked
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

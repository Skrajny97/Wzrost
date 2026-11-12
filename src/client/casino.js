// The Salon Gier in the Osada (src/server/casino.js; answers 523–526 and
// 542 C), under Szczęsny's card on its screen, in two tabs (the author:
// "Zadbaj o intuicyjne GUI jeśli chodzi o Salon Gier bo na screenach widzę
// znowu dużo scrollowania, opisy chowaj jak zawsze pod 'Jak to działa?'"):
// the Loteria, with today's pot, the ticket of the day and the last draw,
// and the Koło Fortuny, with the stake, stepping through the day's stakes,
// the chances at the stake, the spin and the day's one pool, the same at
// every stake (the author on 4.11.2026: "Ma jedną pulę codziennie losowaną
// niezależnie od stawki"). The rules wait under "Jak to
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

import { resourceArt, salonArt } from './art.js';
import { h } from './dom.js';
import { formatDecimal, formatNumber } from './format.js';
import { language, t } from './i18n.js';
import { motionOn } from './motion.js';
import { openProfile } from './profile.js';
import { playSound } from './sound.js';
import { call, serverNow, state } from './state.js';
import { guildTag, howItWorks, systemPanel, toast, withButton } from './ui.js';
import { itemEntry, stackButton } from './screens/market.js';

// One of the Salon's texts with its {…} filled in: numbers as the game
// writes them, words as they are.
const say = (text, values = {}) =>
  text.replace(/\{(\w+)\}/g, (whole, key) => (Object.hasOwn(values, key) ? (typeof values[key] === 'number' ? formatNumber(values[key]) : values[key]) : whole));

// A chance as a percent, "50", "0,5".
const percent = (chance) => formatDecimal(chance * 100);

// A day of the draws ("2026-11-02") as "2.11", in English "2/11".
const dayLabel = (key) => {
  const [, month, day] = key.split('-').map(Number);
  return language() === 'en' ? `${day}/${month}` : `${day}.${month}`;
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
  // (the lowest).
  let stake = null;
  // The newest answer's number, so an older one never draws over it.
  let asked = 0;
  // The last spin, for its words over the pool: { win, text, words }.
  let result = null;
  const opened = new Set();
  // Whether today's players are unfolded, kept while the panel redraws.
  let playersOpen = false;

  // The Salon as an answer brings it; the stake chosen stays while it is
  // still one of the day's.
  function take(answer) {
    casino = answer.casino;
    if (!casino.wheel.stakes.includes(stake)) stake = casino.wheel.stake;
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

  // Another stake: the pool stays, its chances change.
  function choose(next) {
    if (next === undefined || next === stake) return;
    stake = next;
    result = null;
    render();
  }

  // The tabs: the Loteria and the Koło Fortuny.
  function tabs() {
    const names = { lottery: casino.lottery.name, wheel: casino.wheel.name };
    return h(
      'div',
      { class: 'chat-tabs market-tabs', role: 'tablist', 'aria-label': t('Salon Gier') },
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
  // Who plays today (the author: "Dodaj do loterii możliwość dla gracza,
  // żeby widzieć kto bierze w niej udział"): folded under their count, in
  // the order the tickets were bought, each name with its guild's tag and
  // opening the character's card, as in the chat.
  function players() {
    const { texts, lottery } = casino;
    if (lottery.players.length === 0) return null;
    const fold = h(
      'details',
      {
        class: 'how-more casino-players',
        'data-guide': 'casino-players',
        open: playersOpen,
        onToggle: () => {
          playersOpen = fold.open;
        },
      },
      h('summary', { class: 'how-toggle', text: say(texts.lotteryPlayers, { tickets: lottery.players.length }) }),
      h(
        'ul',
        { class: 'casino-player-list' },
        lottery.players.map((player) =>
          h(
            'li',
            {},
            h('button', { type: 'button', class: 'link-button', text: player.name, onClick: () => openProfile(player.name) }),
            player.guildTag && [' ', guildTag(player.guildTag)],
          ),
        ),
      ),
    );
    return fold;
  }

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
            text: short ? t('Brakuje złota') : say(texts.lotteryBuy, { ticket: lottery.ticket }),
            disabled: short,
            onClick: (event) =>
              withButton(event.currentTarget, async () => {
                const answer = await call('POST', '/api/settlement/casino/ticket', { stake });
                if (showable(casino.show)) await ticketShow(casino.show);
                apply(answer);
                toast(texts.lotteryBought);
              }),
          }),
      players(),
      lastDraw(),
      howItWorks(null, say(texts.lotteryAbout, { ticket: lottery.ticket, base: lottery.base })),
    );
  }

  // A prize of the pool with its tier: an item with its card and the
  // comparison with the one worn, materials as the Targowisko shows a
  // stack, or the camp's resources; one won is marked so.
  const tierName = (id) => casino.wheel.tiers.find((tier) => tier.id === id)?.name ?? '';
  const prizeEntry = (prize, index) =>
    h(
      'li',
      { class: `card market-offer casino-prize casino-prize--${prize.tier}${prize.won ? ' casino-prize--won' : ''}` },
      h('p', { class: 'casino-prize-tier' }, h('span', { class: `chip casino-tier casino-tier--${prize.tier}`, text: tierName(prize.tier) }), prize.won && h('span', { class: 'chip chip--success', text: casino.texts.wheelWon })),
      prize.kind === 'item'
        ? itemEntry(prize.item, `casino:${index}`, opened)
        : prize.kind === 'resource'
          ? h('p', { class: 'casino-resource' }, resourceArt(prize.key, 24), h('span', { text: prizeName(prize) }))
          : stackButton(prize),
    );

  // The chances at a stake in a line: the tiers from the best, and nothing.
  function oddsText(value) {
    const { texts, wheel } = casino;
    const odds = wheel.odds[Math.max(0, wheel.stakes.indexOf(value))];
    const by = Object.fromEntries(odds.tiers.map((tier) => [tier.id, percent(tier.chance)]));
    return say(texts.wheelOdds, { ...by, none: percent(odds.none) });
  }

  // The Koło Fortuny (525 A, 542 C, one pool since 4.11.2026): the stake and
  // its chances, a step either way and a slider through the day's stakes,
  // the spin, the last spin's words, the rules folded, and the day's pool.
  function wheelCard() {
    const { texts, wheel } = casino;
    const { stakes } = wheel;
    const gold = state.character.gold;
    const at = Math.max(0, stakes.indexOf(stake));
    const stakeText = (value) => say(texts.wheelStake, { stake: value });
    const fill = (index) => `${(index / Math.max(1, stakes.length - 1)) * 100}%`;
    const label = h('p', { class: 'casino-chance', text: stakeText(stake) });
    const chances = h('p', { class: 'casino-odds', text: oddsText(stake) });
    // The slider names the stake and its chances under the finger, and
    // chooses the stake when let go.
    const slider = h('input', {
      type: 'range',
      class: 'duration-slider',
      min: 0,
      max: stakes.length - 1,
      step: 1,
      value: at,
      'aria-label': t('Stawka'),
      'aria-valuetext': t('{gold} zł', { gold: formatNumber(stake) }),
      vars: { '--fill': fill(at) },
      onInput: () => {
        const index = Number(slider.value);
        label.textContent = stakeText(stakes[index]);
        chances.textContent = oddsText(stakes[index]);
        slider.style.setProperty('--fill', fill(index));
        slider.setAttribute('aria-valuetext', t('{gold} zł', { gold: formatNumber(stakes[index]) }));
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
    // One spin: at the stake, or the day's free one (`body.free`, at the
    // lowest stake's chances; a player via the author, 12.11.2026).
    const spinWith = (event, body) =>
      withButton(event.currentTarget, async () => {
        const answer = await call('POST', '/api/settlement/casino/spin', body);
        const { win, prize, tier, free } = answer.spin;
        // A tier with nothing left in the pool: the Wheel stopped on a prize
        // already won. A free spin loses no stake.
        const lost = tier ? (free ? texts.wheelGoneFree : texts.wheelGone) : free ? texts.lostFree : texts.lost;
        result = { win, text: win ? say(texts.won, { prize: prizeName(prize) }) : lost, words: oneOf(win ? texts.win : free ? texts.lossFree : texts.loss) };
        // The Wheel turns on the screen first; without it, a sound alone.
        if (showable(casino.show)) await wheelShow(win, casino.show);
        else playSound(win ? 'chest' : 'tick');
        toast(result.text);
        apply(answer);
      });
    const freeSpin = wheel.left > 0 &&
      wheel.free && [
        h('button', {
          type: 'button',
          class: 'button button--system',
          text: texts.wheelFree,
          disabled: blocked,
          onClick: (event) => spinWith(event, { free: true, stake }),
        }),
        h('p', { class: 'muted', text: say(texts.wheelFreeAbout, { stake: stakes[0] }) }),
      ];
    const spin =
      wheel.left === 0
        ? h('p', { class: 'muted', text: texts.wheelEmpty })
        : h('button', {
            type: 'button',
            class: 'button button--world',
            text: short ? t('Brakuje złota') : say(texts.wheelSpin, { stake }),
            disabled: short || blocked,
            onClick: (event) => spinWith(event, { stake }),
          });
    return [
      h(
        'section',
        { class: 'card stack casino-game', 'data-guide': 'casino-wheel' },
        label,
        chances,
        // With one stake of the day there is nothing to step through.
        stakes.length > 1 && h('div', { class: 'duration-row' }, stepButton(-1, t('Mniejsza stawka')), slider, stepButton(1, t('Większa stawka'))),
        wheel.left > 0 && blocked && h('p', { class: 'region-warning', text: texts.wheelBag }),
        freeSpin,
        spin,
        result &&
          h(
            'div',
            { class: `casino-result${result.win ? ' casino-result--win' : ''}`, role: 'status' },
            h('p', { class: 'settlement-greeting', text: t('„{line}”', { line: result.words }) }),
            h('p', { class: 'casino-result-text', text: result.text }),
          ),
        howItWorks(null, [say(texts.wheelAbout, { step: wheel.step, low: percent(wheel.none.low), high: percent(wheel.none.high) }), texts.wheelPoolAbout]),
      ),
      h('h3', { class: 'casino-pool-title', text: say(texts.wheelPool, { left: wheel.left, all: wheel.prizes.length }) }),
      h('ul', { class: 'stack market-list casino-pool' }, wheel.prizes.map(prizeEntry)),
    ];
  }

  function render() {
    clearTimeout(timer);
    if (failure) {
      holder.replaceChildren(systemPanel(failure.message));
      return;
    }
    if (!casino) {
      holder.replaceChildren(h('p', { class: 'muted', text: t('Wczytywanie Salonu Gier…') }));
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

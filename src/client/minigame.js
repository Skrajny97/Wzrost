// The mini-game at a work's report (1006, accepted on 16.11.2026, A with
// the author's note: „niech będzie tak jak tutaj, ale niech szybko leci ten
// znacznik”; src/server/minigame.js): "Odbierz raport" of a finished work
// opens a sheet with the place's picture, a bar with its green zone and the
// marker running to and fro, three tries, each zone narrower, and "Pomiń".
// The game begins on the server, which keeps its time; the page sends only
// the times of the taps, and the server finds the hits.

import { placeArt } from './art.js';
import { h } from './dom.js';
import { t } from './i18n.js';
import { effectsVolume, playSound } from './sound.js';
import { call, serverNow } from './state.js';
import { closeSheet, openDecision } from './ui.js';

// The works with a mini-game, as the server has them (MINIGAME_KINDS), but
// an order of scrolls and the setting of a gem.
const KINDS = new Set(['herbs', 'potions', 'items', 'minerals', 'jewels', 'fish', 'crops', 'dishes']);
export const hasMinigame = (activity) => Boolean(activity && KINDS.has(activity.kind) && !activity.scroll && !activity.set);

// The marker's place along the bar (0 at the left, 1 at the right) `ms`
// after the game began, as the server counts it (markerAt in the engine).
const markerAt = (ms, period) => {
  const phase = (((ms % period) + period) % period) / period;
  return phase < 0.5 ? phase * 2 : 2 - phase * 2;
};

// A short buzz of the phone at a tap (1022; the author: „może dac jakiś
// efekt dźwiękowy, wibracje i chwilową pauzę po trafieniu (lub inny dźwięk
// przy nietrafieniu)?”): one at a hit, two at a miss. Only where the
// browser can (not on an iPhone), and not with the game's sounds off.
function buzz(hit) {
  if (effectsVolume() === 0) return;
  try {
    navigator.vibrate?.(hit ? 35 : [25, 60, 25]);
  } catch {
    // A buzz is a nicety.
  }
}

// "{value}" of a text filled in.
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole));

// Plays the mini-game of the finished work (`avatar`: the Awatar's) and
// resolves with what the claim sends: { taps } after the tries, { skip: true }
// when skipped, or null when the work has none or the game cannot begin.
export async function playMinigame(activity, avatar) {
  if (!hasMinigame(activity)) return null;
  let game;
  try {
    ({ minigame: game } = await call('POST', '/api/minigame', avatar ? { avatar: true } : {}));
  } catch {
    return null;
  }
  return new Promise((resolve) => {
    const words = game.texts;
    const taps = [];
    let hits = 0;
    let frame = 0;
    let done = false;
    // The marker stands still `pause` ms after each tap (1022), where the
    // tap caught it, and goes on from there after: as the server counts it
    // (minigameHits with the pause). A tap meanwhile does not count.
    const pause = game.pause ?? 0;
    let standsUntil = 0;
    let stoodAt = 0;
    const standing = () => serverNow() < standsUntil;
    const rarity = game.kind === 'items' || game.kind === 'jewels';
    const zone = h('div', { class: 'minigame-zone' });
    const marker = h('div', { class: 'minigame-marker' });
    const gauge = h('div', { class: `minigame-gauge minigame-gauge--${game.look}`, role: 'img', 'aria-label': game.title }, zone, marker);
    const tries = h('ol', { class: 'minigame-tries', 'aria-hidden': 'true' }, game.zones.map(() => h('li')));
    const state = h('p', { class: 'minigame-state', 'aria-live': 'polite' });
    const result = h('p', { class: 'minigame-result', hidden: true });
    const finish = (answer) => {
      if (done) return;
      done = true;
      cancelAnimationFrame(frame);
      closeSheet();
      resolve(answer);
    };
    // A tap counts the moment the finger touches the button (pointerdown),
    // not when it lifts (click): the marker crosses the bar in 0.7 s, so the
    // tenth of a second between the two moved it some 14% of the bar, more
    // than the narrowest zone (a player, 16.11.2026: „Mam wrażenie że ta
    // minigra na zbieranie ziół ma lekkie opóźnienie od kliknięcia”). The
    // click that ends a touch (detail > 0) is let go; a keyboard's Enter and
    // Space click with detail 0 and still tap, as every click does where the
    // browser has no pointer events. "Odbierz raport" after the last try
    // waits for a new touch, so the click of the last try's own touch, if
    // it comes, does not claim before the result is seen.
    const pointer = 'PointerEvent' in window;
    let touchedAgain = false;
    const go = h('button', {
      type: 'button',
      class: 'button button--system minigame-go',
      text: game.button,
      onPointerdown: (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (standing()) return;
        if (taps.length >= game.zones.length) {
          touchedAgain = true;
          return;
        }
        tap();
      },
      onClick: (event) => {
        if (standing()) return;
        const ownClick = !pointer || event.detail === 0;
        if (taps.length < game.zones.length) {
          if (ownClick) tap();
          return;
        }
        if (ownClick || touchedAgain) finish({ taps, pause });
      },
    });
    const skip = h('button', { type: 'button', class: 'link-button minigame-skip', text: words.skip[0], onClick: () => finish({ skip: true }) });
    const showTry = () => {
      const index = taps.length;
      const current = game.zones[index];
      zone.style.left = `${(current.center - current.width / 2) * 100}%`;
      zone.style.width = `${current.width * 100}%`;
      [...tries.children].forEach((dot, at) => dot.classList.toggle('now', at === index));
      state.textContent = [filled(words.try[0], { try: index + 1, tries: game.zones.length }), index > 0 && words.narrower[0]].filter(Boolean).join(' · ');
    };
    const bonusOf = (count) => {
      const value = Math.round((rarity ? game.rarity[count] : game.shares[count]) * 100);
      return value > 0 ? game.bonus.replace('{value}', String(value)) : null;
    };
    function tap() {
      const now = serverNow();
      if (now < standsUntil) return;
      const index = taps.length;
      const ms = Math.round(now - game.at);
      const place = markerAt(ms - index * pause, game.period);
      taps.push(ms);
      const current = game.zones[index];
      const hit = Math.abs(place - current.center) <= current.width / 2;
      if (hit) hits += 1;
      tries.children[index].classList.add(hit ? 'hit' : 'miss');
      // The marker stands where the tap caught it, lit up as a hit or a
      // miss, with its sound and buzz; the next try comes after the pause.
      stoodAt = place;
      standsUntil = now + pause;
      marker.classList.add(hit ? 'minigame-marker--hit' : 'minigame-marker--miss');
      playSound(hit ? 'minigame-hit' : 'minigame-miss');
      buzz(hit);
      const verdict = hit ? words.hit[0] : words.miss[0];
      state.textContent = verdict;
      const last = taps.length >= game.zones.length;
      setTimeout(() => {
        if (done) return;
        marker.classList.remove('minigame-marker--hit', 'minigame-marker--miss');
        if (!last) {
          showTry();
          state.textContent = `${verdict} ${state.textContent}`;
          return;
        }
        // The last try: the result, and "Odbierz raport".
        cancelAnimationFrame(frame);
        [...tries.children].forEach((dot) => dot.classList.remove('now'));
        gauge.hidden = true;
        const bonus = bonusOf(hits);
        result.hidden = false;
        result.textContent = bonus ? filled(words.result[0], { bonus }) : words.resultNone[0];
        state.textContent = filled(words.hits[0], { hits, tries: game.zones.length });
        go.textContent = words.claim[0];
        skip.hidden = true;
      }, pause);
    }
    const move = () => {
      const now = serverNow();
      const place = now < standsUntil ? stoodAt : markerAt(now - game.at - taps.length * pause, game.period);
      marker.style.left = `${place * 100}%`;
      frame = requestAnimationFrame(move);
    };
    const art = placeArt(game.place);
    const head = h('div', { class: 'minigame-art' }, h('p', { class: 'minigame-kicker', text: game.kicker }), h('h2', { class: 'sheet-title', text: game.title }));
    if (art) head.style.setProperty('--art', `url("${art}")`);
    const dialog = openDecision(h('div', { class: 'minigame' }, head, h('p', { class: 'sheet-text', text: game.text }), gauge, result, tries, state, go, skip));
    dialog.addEventListener('close', () => finish({ skip: true }), { once: true });
    showTry();
    move();
  });
}

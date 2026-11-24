// Poszukiwani on the Osada's Tablica zleceń (619 B; src/server/wanted.js):
// the sołtys's wanted posters of the day, two by two, each with its
// target's picture, place and bounty; one in hand at a time, given back or
// its bounty claimed here once its target has fallen on an exploration. An
// open poster has its die, which draws it anew (24.11.2026).

import { monsterSprite, placeArt } from './art.js';
import { h } from './dom.js';
import { formatNumber } from './format.js';
import { t } from './i18n.js';
import { playSound } from './sound.js';
import { call } from './state.js';
import { howItWorks, rerollDie, rerollsText, toast, withButton } from './ui.js';

const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
// "[female|male]" in the texts, by the target's gender.
const gendered = (text, female) => text.replace(/\[([^[\]|]*)\|([^[\]|]*)\]/g, (_, she, he) => (female ? she : he));

// One poster: what it says and what can be done with it now.
function posterCard(poster, view, apply, label = null) {
  const { texts } = view;
  const act = (path, body) => (event) =>
    withButton(event.currentTarget, async () => {
      const answer = await call('POST', path, body ?? undefined);
      if (answer.claimed) toast(filled(texts.claimed, { gold: formatNumber(answer.claimed.gold), time: answer.claimed.timePoints, reputation: answer.claimed.reputation }));
      apply(answer);
    });
  const button = (text, path, body, extra = {}) => h('button', { type: 'button', class: 'button wanted-poster-button', text, onClick: act(path, body), ...extra });
  // The die (24.11.2026): the poster drawn anew at once, for free, while
  // today's rerolls last.
  const reroll = () =>
    view.reroll &&
    rerollDie({
      label: t('Przelosuj list: {name}', { name: poster.name }),
      rerolls: view.reroll,
      reroll: async () => {
        const answer = await call('POST', '/api/settlement/wanted/reroll', { posterId: poster.id });
        playSound('system');
        toast(t('Nowy list gończy na tablicy.'));
        apply(answer);
      },
    });
  const action = {
    open: () => h('div', { class: 'wanted-poster-actions' }, button(texts.take, '/api/settlement/wanted', { posterId: poster.id }, { disabled: view.holding }), reroll()),
    taken: () => [h('p', { class: 'wanted-poster-note', text: gendered(filled(texts.hunting, { area: poster.areaName }), poster.female) }), button(texts.drop, '/api/settlement/wanted/drop', null, { class: 'button button--system wanted-poster-button' })],
    beaten: () => [h('p', { class: 'wanted-poster-note wanted-poster-note--beaten', text: gendered(texts.beaten, poster.female) }), button(texts.claim, '/api/settlement/wanted/claim')],
    done: () => h('p', { class: 'wanted-poster-stamp', text: texts.done }),
  }[poster.state];
  const outlaw = poster.kind === 'outlaw';
  return h(
    'article',
    { class: `wanted-poster wanted-poster--${poster.state}${outlaw ? ' wanted-poster--outlaw' : ''}` },
    label && h('p', { class: 'wanted-poster-earlier', text: label }),
    h('p', { class: 'wanted-poster-label', text: gendered(outlaw ? texts.outlaw : texts.wanted, poster.female) }),
    h('span', { class: 'wanted-poster-art' }, monsterSprite(poster.monsterId)),
    h('h3', { class: 'wanted-poster-name', text: poster.name }),
    h('p', { class: 'wanted-poster-place', text: filled(texts.place, { area: poster.areaName, levels: poster.levels }) }),
    h('p', { class: 'wanted-poster-reward', text: filled(outlaw ? texts.lootReward : texts.trophyReward, { gold: formatNumber(poster.gold) }) }),
    action?.(),
  );
}

// The Poszukiwani card for the Tablica zleceń: `view` is the Osada's
// wanted, `apply` takes the server's answer (screens/settlement.js).
export function wantedCard(view, apply) {
  if (!view) return null;
  const art = view.backdrop && placeArt(view.backdrop);
  const banner = h('div', { class: `wanted-banner${art ? ' wanted-banner--art' : ''}` }, h('h2', { class: 'wanted-banner-title', id: 'wanted-title', text: view.texts.title }));
  if (art) banner.style.setProperty('--place-art', `url("${art}")`);
  return h(
    'section',
    { class: 'card wanted-card', 'aria-labelledby': 'wanted-title', 'data-guide': 'board-wanted' },
    banner,
    // The sołtys's words folded under "Jak to działa?", so the posters come
    // first (the author's screenshot, 5.11.2026: „Ten opis schowaj pod »Jak
    // to działa?«”).
    howItWorks(null, view.texts.intro),
    // The dice's rerolls left today, while a poster has its die.
    view.reroll && view.posters.some((poster) => poster.state === 'open') && h('p', { class: 'board-rerolls wanted-rerolls', text: rerollsText(view.reroll) }),
    h(
      'div',
      { class: 'wanted-posters' },
      view.earlier && posterCard(view.earlier, view, apply, view.texts.earlier),
      view.posters.map((poster) => posterCard(poster, view, apply)),
    ),
    h('p', { class: 'muted small wanted-footer', text: view.texts.footer }),
  );
}

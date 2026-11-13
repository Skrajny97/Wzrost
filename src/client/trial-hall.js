// The Sala prób in the Osada (620 B; src/server/trial-hall.js): the place
// the character may open early, its three fights (the creatures the trial
// may bring), the day's free trial and what passing it gives. The trial's
// report opens at once, as a Wieża's does (screens/towers.js).

import { monsterSprite, placeArt } from './art.js';
import { h, icon } from './dom.js';
import { serviceBusy } from './mercenaries.js';
import { activityFinished, buildLocked, call, reportCache, state } from './state.js';
import { systemPanel, withButton } from './ui.js';

const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));

// One of the three fights: the creature's picture and which fight it is.
function fightTile(fight, index, texts) {
  const label = fight.elite ? filled(texts.eliteFight, { number: index + 1, name: fight.name }) : filled(texts.fight, { number: index + 1 });
  return h('li', { class: `trial-hall-fight${fight.elite ? ' trial-hall-fight--elite' : ''}` }, h('span', { class: 'trial-hall-fight-art' }, monsterSprite(fight.monsterId)), h('span', { text: label }));
}

// Why the trial waits now, or null: an exploration under way or its report
// to claim, or the character's offer or service as a mercenary (the
// server's requireNotExploring refuses them all).
function waitText(texts) {
  const activity = state.character?.activity;
  if (activity?.kind === 'hunt') return activityFinished(activity) ? texts.claimFirst : texts.exploring;
  return serviceBusy(activity);
}

// The hall's cards for the Osada's place screen: `view` is the Osada's
// trialHall, `place` the board's place (its backdrop), `navigate` opens the
// report. Not while the character is on an exploration or a mercenary's
// offer or service: the button waits and says why (the code review,
// 13.11.2026: it stayed on for a mercenary, whom the server refuses).
export function trialHallCards(view, place, navigate) {
  if (!view) return null;
  const { texts, target } = view;
  const art = place.backdrop && placeArt(place.backdrop);
  const banner = h('section', { class: `card trial-hall-banner${art ? ' place-card place-card--art' : ''}`, 'data-guide': 'trial-hall' }, h('p', { text: texts.intro }));
  if (art) banner.style.setProperty('--place-art', `url("${art}")`);
  if (!target) return [banner, systemPanel(texts.allOpen)];
  if (target.passed) return [banner, systemPanel(filled(texts.passed, { area: target.name }))];
  const waiting = buildLocked(state.character);
  const why = waiting ? waitText(texts) : null;
  const start = h('button', {
    type: 'button',
    class: 'button button--system',
    text: texts.start,
    disabled: view.used || waiting,
    onClick: (event) =>
      withButton(event.currentTarget, async () => {
        const { report } = await call('POST', '/api/settlement/trial-hall');
        reportCache.set(String(report.id), report);
        state.freshReport = String(report.id);
        navigate(`#/raport/${report.id}`);
      }),
  });
  return [
    banner,
    h(
      'section',
      { class: 'card trial-hall-target', 'aria-labelledby': 'trial-hall-target' },
      h('h2', { class: 'card-title', id: 'trial-hall-target' }, icon('lock', { size: 20 }), ' ', filled(texts.target, { area: target.name, levels: target.levels })),
      h('p', { class: 'muted', text: filled(texts.usual, { level: target.unlockClassLevel }) }),
      h('p', { text: texts.rules }),
      h('ol', { class: 'trial-hall-fights' }, target.fights.map((fight, index) => fightTile(fight, index, texts))),
      view.used ? h('p', { class: 'muted', text: texts.used }) : start,
      !view.used && why && h('p', { class: 'muted', text: why }),
      h('p', { class: 'muted small', text: filled(texts.after, { area: target.name }) }),
    ),
  ];
}

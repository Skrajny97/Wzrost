// The event at the end of an exploration (src/engine/events.js): after
// "Odbierz raport" the character meets someone, and the player picks one of
// the options before the report opens. The choice claims the report with
// it, and the report tells what came of it. An option may lead to a further
// choice: the sheet then tells what happened and offers the new options. Closed
// without a choice, the event waits where it stopped: the next "Odbierz
// raport" brings it again.

import { eventFigure, eventScene, landArt } from './art.js';
import { h } from './dom.js';
import { formatNumber } from './format.js';
import { t } from './i18n.js';
import { playSound } from './sound.js';
import { call } from './state.js';
import { closeSheet, openSheet, withButton } from './ui.js';

// `done` gets the report once an option is chosen.
export function openEvent(event, done) {
  // An event of any land stands on the background of the land explored.
  const scene = event.land ? landArt(event.land) : eventScene(event.scene);
  const figure = eventFigure(event.art);
  // An option with a price shows it; one the character cannot take (of
  // another class, or above the purse) stays in sight, greyed out, with why.
  const options = event.options.map((option) =>
    h(
      'button',
      {
        type: 'button',
        class: 'button button--world event-option',
        disabled: Boolean(option.locked),
        onClick: (click) =>
          withButton(click.currentTarget, async () => {
            const answer = await call('POST', '/api/hunts/claim', { choice: option.id });
            if (answer.event) {
              openEvent(answer.event, done);
              return;
            }
            closeSheet();
            done(answer.report);
          }),
      },
      option.cost ? t('{label} ({gold} zł)', { label: option.label, gold: formatNumber(option.cost) }) : option.label,
      option.locked && h('span', { class: 'event-option-note', text: option.locked }),
    ),
  );
  playSound('system');
  // The person sits in their place in the scene (event.figure, in percent
  // of it); without a scene they stand alone, and without any art yet the
  // event shows only its text.
  const { left, bottom, height } = event.figure;
  const art = scene
    ? h(
        'div',
        { class: 'event-scene', vars: { '--scene': `url("${scene}")` } },
        figure && h('div', { class: 'event-figure-place', vars: { '--left': `${left}%`, '--bottom': `${bottom}%`, '--height': `${height}%` } }, figure),
      )
    : figure && h('div', { class: 'event-scene event-scene--bare' }, figure);
  // Further on, the choices made so far and what came of them, the latest
  // last, above the new options.
  const steps = event.steps ?? [];
  openSheet(
    art,
    h('h2', { class: 'sheet-title', text: event.title }),
    h('p', { class: `sheet-text event-text${steps.length > 0 ? ' event-text--before' : ''}`, text: event.text }),
    steps.map((step) => h('p', { class: 'sheet-text event-text event-step' }, h('strong', { text: `${step.label}. ` }), step.text)),
    h('div', { class: 'event-options' }, options),
  );
}

// The event at the end of an exploration (src/engine/events.js): after
// "Odbierz raport" the character meets someone, and the player picks one of
// the options before the report opens. The choice claims the report with
// it, and the report tells what came of it. Closed without a choice, the
// event waits: the next "Odbierz raport" brings it again.

import { eventFigure, eventScene } from './art.js';
import { h } from './dom.js';
import { playSound } from './sound.js';
import { call } from './state.js';
import { closeSheet, openSheet, withButton } from './ui.js';

// `done` gets the report once an option is chosen.
export function openEvent(event, done) {
  const scene = eventScene(event.scene);
  const figure = eventFigure(event.art);
  const options = event.options.map((option) =>
    h('button', {
      type: 'button',
      class: 'button button--world event-option',
      text: option.label,
      onClick: (click) =>
        withButton(click.currentTarget, async () => {
          const { report } = await call('POST', '/api/hunts/claim', { choice: option.id });
          closeSheet();
          done(report);
        }),
    }),
  );
  playSound('system');
  // Without its art yet, the event shows only its text.
  openSheet(
    (scene || figure) && h('div', { class: 'event-scene', ...(scene && { vars: { '--scene': `url("${scene}")` } }) }, figure),
    h('h2', { class: 'sheet-title', text: event.title }),
    h('p', { class: 'sheet-text event-text', text: event.text }),
    h('div', { class: 'event-options' }, options),
  );
}

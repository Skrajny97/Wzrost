// "Przewiń": Punkty Czasu skip the current wait, one a minute
// (src/server/time.js). The button shows how many points it would use now
// and asks before spending them.

import { timePointsArt } from './art.js';
import { h } from './dom.js';
import { countOf, formatMinutes } from './format.js';
import { playSound } from './sound.js';
import { call, serverNow, state, timePointsNow } from './state.js';
import { confirmAction, toast, withButton } from './ui.js';

const MINUTE = 60000;

export const timePoints = (count) => countOf(count, 'Punkt Czasu', 'Punkty Czasu', 'Punktów Czasu');

// The points a wait of `ms` would take at `now`: all its minutes, or as many
// as there are.
function plan(ms, now) {
  const minutes = Math.ceil(Math.max(0, ms) / MINUTE);
  const { points } = timePointsNow(state.character, now);
  return { minutes, points, spend: Math.min(minutes, points) };
}

// A button for one kind of wait (target: activity, rest or build). `left`
// gives the milliseconds the wait has left at a time; `update` keeps the
// label right on every tick, and the button hides when there is nothing to
// skip or no points.
export function skipControl(target, left, name) {
  const label = h('span', {});
  const cost = h('span', { class: 'time-cost' });
  const element = h(
    'button',
    {
      type: 'button',
      class: 'button button--time',
      'data-guide': `skip-${target}`,
      onClick: (event) => withButton(event.currentTarget, () => skip(target, left, name)),
    },
    timePointsArt(20),
    label,
    cost,
  );
  const update = (now = serverNow()) => {
    const { minutes, spend } = plan(left(now), now);
    element.hidden = spend < 1;
    label.textContent = spend < minutes ? `Przewiń o ${formatMinutes(spend)}` : 'Przewiń';
    cost.textContent = String(spend);
    element.setAttribute('aria-label', `${label.textContent}, ${timePoints(spend)}`);
  };
  update();
  return { element, update };
}

async function skip(target, left, name) {
  const now = serverNow();
  const { minutes, points, spend } = plan(left(now), now);
  if (spend < 1) return;
  const sure = await confirmAction({
    title: 'Przewinąć czas?',
    text: `${name}: ${spend < minutes ? `krócej o ${formatMinutes(spend)}` : 'od razu do końca'}. To kosztuje ${timePoints(spend)}, zostanie ${points - spend}.`,
    confirmLabel: 'Przewiń',
  });
  if (!sure) return;
  const { spent } = await call('POST', '/api/time/skip', { target });
  playSound('system');
  toast(`Przewinięto ${formatMinutes(spent)}.`);
}

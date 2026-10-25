// Parchment between two wooden rods, which unrolls before it is read and
// rolls up after: the narrator's scrolls (narrator.js) and his quests
// (quests.js). Without animations it simply shows.

import { h } from './dom.js';
import { motionOn } from './motion.js';

const rolls = new WeakMap(); // parchment → its running animation

// Parchment between two rods grows from nothing to its height, or back.
export async function roll(sheet, open, duration = open ? 700 : 380) {
  if (!motionOn()) return;
  rolls.get(sheet)?.cancel();
  const frames = open ? [{ height: '0px' }, { height: `${sheet.scrollHeight}px` }] : [{ height: `${sheet.offsetHeight}px` }, { height: '0px' }];
  const animation = sheet.animate(frames, {
    duration,
    easing: open ? 'cubic-bezier(0.2, 0.7, 0.2, 1)' : 'cubic-bezier(0.5, 0, 0.8, 0.4)',
    fill: 'forwards',
  });
  rolls.set(sheet, animation);
  try {
    await animation.finished;
  } catch {
    // Cancelled by the next roll or by closing.
  }
  // Unrolled, the parchment takes its natural height again.
  if (open && rolls.get(sheet) === animation) {
    animation.cancel();
    rolls.delete(sheet);
  }
}

// Stops a roll halfway, as when the parchment is taken away.
export const stopRoll = (sheet) => rolls.get(sheet)?.cancel();

export const rod = () => h('div', { class: 'narrator-rod', 'aria-hidden': 'true' });

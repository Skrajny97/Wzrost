// The weeks of the year on server time (src/engine/weeks.js, data/weeks.json;
// the author, 10.11.2026: „buffy i debuffy obszarowe tygodniowe dla każdego
// gracza w zależności jaki tydzień jest [...] Tygodniowe bonusy ustawione na
// stało na sztywno.”): the week of a moment, which an exploration and a
// profession's work keep from their start and everything else takes as it
// happens, and what one of its kinds multiplies. Where the weeks are off
// (WEEKS, features.js) there is no week, and every factor is 1.

import { weekAt, weekFactor, weekView } from '../engine/index.js';
import { content } from './content.js';
import { weeksOn } from './features.js';

// The week as the character's view gives it (weekView: this week and the
// three after it), or null where the weeks are off; with `notice` while the
// character has not been told of this week yet (the author: „tylko musi być
// jakaś informacja o takich obszarówkach dla gracza”): on its first visit in
// a week that began after it came into the game, the page names the week
// and its effects once (`week_seen`, the start of the week it was last told
// of; weekNoticeSeen in characters.js).
export function weekOfCharacter(row, now) {
  if (!weeksOn()) return null;
  const view = weekView(now, content());
  const told = row.created_at >= view.startsAt || (row.week_seen ?? 0) >= view.startsAt;
  return told ? view : { ...view, notice: true };
}

// The week at `now` as an activity keeps it ({ number, effects }), or null.
export const weekNow = (now) => (weeksOn() ? weekAt(now, content()).week : null);

// What the week at `now` multiplies a kind of effect by.
export const weekFactorNow = (now, kind) => weekFactor(weekNow(now), kind);

// The week an activity's options keep (`week`), or null: one begun before
// the weeks, or where they were off.
export function keptWeek(options) {
  try {
    const week = (typeof options === 'string' ? JSON.parse(options) : options)?.week;
    return week && Array.isArray(week.effects) ? week : null;
  } catch {
    return null;
  }
}

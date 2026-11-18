// The weeks of the year on server time (src/engine/weeks.js, data/weeks.json;
// the author, 10.11.2026: „buffy i debuffy obszarowe tygodniowe dla każdego
// gracza w zależności jaki tydzień jest [...] Tygodniowe bonusy ustawione na
// stało na sztywno.”): the week of a moment, which an exploration and a
// profession's work keep from their start and everything else takes as it
// happens, and what one of its kinds multiplies. Where the weeks are off
// (WEEKS, features.js) there is no week, and every factor is 1.

import { omenEffects, weekAt, weekFactor, weekView } from '../engine/index.js';
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

// The character's fortunes of Andrzejki (characters.andrzejki, andrzejki.js),
// or none.
function fortunesOf(row) {
  try {
    return JSON.parse(row?.andrzejki ?? 'null');
  } catch {
    return null;
  }
}

// The character's Andrzejki omens running at `now` (1083 C): each an effect
// of the weeks, marked with its omen, and until when it runs.
export const omensOf = (row, now) => omenEffects(fortunesOf(row), now, content().winter.andrzejki);

// The week at `now` for a character (its row): the week's effects and its
// Andrzejki omens running then, so an activity keeps them and a factor takes
// them as the week's own; the week alone when none runs. The omens are a
// character's own week effects, so where the weeks are off they are too.
export function weekFor(row, now) {
  const week = weekNow(now);
  const omens = week ? omensOf(row, now).map(({ kind, value, omen }) => ({ kind, value, omen })) : [];
  return omens.length === 0 ? week : { ...week, effects: [...week.effects, ...omens] };
}

// What the week and the character's omens at `now` multiply a kind by.
export const weekFactorFor = (row, now, kind) => weekFactor(weekFor(row, now), kind);

// The character's omens of rest, each with when it runs, for the pace of
// resting (weekRest): also one that ended within a rest counts there.
export function restOmens(row) {
  const { omens, hours, value } = content().winter.andrzejki;
  const rest = new Set(omens.filter((omen) => omen.kind === 'rest').map((omen) => omen.id));
  return Object.values(fortunesOf(row) ?? {})
    .filter((fortune) => rest.has(fortune.omen))
    .map((fortune) => ({ at: fortune.at, until: fortune.at + hours * 3600000, value }));
}

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

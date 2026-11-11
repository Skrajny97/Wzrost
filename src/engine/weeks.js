// @ts-check
// The weeks of the year (data/weeks.json; the author, 10.11.2026: „wpadłem
// na pomysł zaczerpnięty z Heroes of Might & Magic 3 - buffy i debuffy
// obszarowe tygodniowe dla każdego gracza w zależności jaki tydzień jest.
// Trzeba by było przygotować 52 takie na cały rok. Drobne +5% do różnych
// rzeczy [...] Skupienie bardziej na buffach niż debuffach. Tygodniowe
// bonusy ustawione na stało na sztywno.”): every week of the year has its
// effects for every player, the same every year. The week is the ISO week
// number of the date on the clock of quests.timeZone (Polish time), so a
// week starts at the midnight between Sunday and Monday, as the narrator's
// weekly quests count them (quests.js); an ISO week 53 takes week 52's
// entry. An effect is a share in percent of one kind (negative for a
// malus), and each kind works in one place:
//   xp, gold      the XP and gold of fights: simulateHunt (explorations, a
//                 Drużyna's trips too), resolveEvent (an event's fight),
//                 towerFight (the Wieże) and portalLoot (a Portal's fight);
//   items         the chance of an item in the loot: the chest among an
//                 exploration's finds, a champion's chest, an event's and
//                 a Wieża's item, at most certain;
//   materials     the materials creatures leave, a Wieża's and a Portal
//                 Materiałów's;
//   profession-xp a profession's XP from work (workProfession);
//   herbs         the herbs gathered (gatherHerbs);
//   minerals      what the Kopalnia digs (mineMinerals);
//   camp          what the camp's production buildings give as their stores
//                 are collected (collect in camp.js);
//   rest          how fast HP comes back while resting (weekRest);
//   upgrade       the chance of an upgrade on the Kowadło, at most certain
//                 (upgradeChance in items.js);
//   reputation    the brotherhoods' reputation (tradePoints, deliverOrder,
//                 a wanted poster's bounty; not an event's reward, whose text
//                 names it) and the companions' relation (companionAfterHunt,
//                 talkWith);
//   stat          one stat of the players in fights (weekFighter, which
//                 playerCombatant reads).
// An exploration and a profession's work take the week they set out in,
// kept with them (`week`: its number and effects, weekAt), so the report is
// the same whenever it is claimed and the player knows the bonus when
// setting out; everything else the week of the moment it happens. A count
// a share makes a fraction of is made whole fairly from a seed (weekCount).
// Pure: the server gives the time, and no week where the weeks are off
// (src/server/features.js).

import { sinceMonday, zoneClock, zoneMidnight } from './quests.js';
import { countEvents, createRng } from './rng.js';
import { decimalText } from './text.js';

const DAY = 86400000;

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ kind: string, value: number, stat?: string }} WeekEffect An effect of a week (data/weeks.json). */
/** @typedef {{ number?: number, effects?: WeekEffect[] } & Record<string, any>} Week A week as an activity keeps it ({ number, effects }). */
/** @typedef {{ timeZone: string, startsAt: number, endsAt: number, isoYear: number, iso: number }} Span */

// The ISO week of a date (year, month 1–12, day): the week of the Thursday
// of its Monday-to-Sunday week, of that Thursday's year.
/**
 * @param {number} year
 * @param {number} month
 * @param {number} day
 * @returns {{ isoYear: number, iso: number }}
 */
export function isoWeek(year, month, day) {
  const date = Date.UTC(year, month - 1, day);
  const weekday = (new Date(date).getUTCDay() + 6) % 7;
  const thursday = new Date(date + (3 - weekday) * DAY);
  const isoYear = thursday.getUTCFullYear();
  return { isoYear, iso: Math.floor((thursday.getTime() - Date.UTC(isoYear, 0, 1)) / (7 * DAY)) + 1 };
}

// The weeks worked out lately, so a page's every request (its week, the
// next three, the rest's) does not count the zone's clock again; any moment
// inside a week has the same one.
/** @type {Span[]} */
const spans = [];

// The week around `ms` on the zone's clock: its start, its end and its ISO
// number, as quests.js counts a week (questPeriod).
/**
 * @param {number} ms
 * @param {string} timeZone
 * @returns {Span}
 */
function weekSpan(ms, timeZone) {
  const kept = spans.find((span) => span.timeZone === timeZone && span.startsAt <= ms && ms < span.endsAt);
  if (kept) return kept;
  const back = sinceMonday(ms, timeZone);
  const startsAt = zoneMidnight(ms, timeZone, -back);
  // quests.js is not checked yet.
  const { year, month, day } = /** @type {{ year: number, month: number, day: number }} */ (zoneClock(startsAt, timeZone));
  const span = { timeZone, startsAt, endsAt: zoneMidnight(ms, timeZone, 7 - back), ...isoWeek(year, month, day) };
  spans.unshift(span);
  if (spans.length > 16) spans.pop();
  return span;
}

// The week at `now`: its ISO number (`iso`, of `isoYear`), the number of
// its entry (52 for an ISO week 53), its start and end, and `week`, what an
// activity keeps of it: { number, effects }, or null without the data.
/**
 * @param {number} now
 * @param {Content} content
 * @returns {{ iso: number, isoYear: number, number: number, startsAt: number, endsAt: number, week: { number: number, effects: WeekEffect[] } | null }}
 */
export function weekAt(now, content) {
  const span = weekSpan(now, content.quests.timeZone);
  const number = Math.min(span.iso, 52);
  const entry = content.weeksByNumber?.[number] ?? null;
  return { iso: span.iso, isoYear: span.isoYear, number, startsAt: span.startsAt, endsAt: span.endsAt, week: entry && { number, effects: entry.effects } };
}

// The effects of a week kept (or null) that count.
/**
 * @param {Week | null | undefined} week
 * @returns {WeekEffect[]}
 */
const effectsOf = (week) => (Array.isArray(week?.effects) ? week.effects.filter((effect) => Number.isFinite(effect?.value)) : []);

// What a week multiplies a kind of effect by: 1 and the shares of its
// effects of that kind, 1 without a week.
/**
 * @param {Week | null | undefined} week
 * @param {string | undefined} kind
 * @returns {number}
 */
export function weekFactor(week, kind) {
  const share = effectsOf(week).reduce((sum, effect) => sum + (effect.kind === kind ? effect.value : 0), 0);
  return share === 0 ? 1 : 1 + share / 100;
}

// A chance with a week's share of a kind more or less, at most certain.
/**
 * @param {number} chance
 * @param {Week | null | undefined} week
 * @param {string} kind
 * @returns {number}
 */
export const weekChance = (chance, week, kind) => {
  const factor = weekFactor(week, kind);
  return factor === 1 ? chance : Math.min(1, chance * factor);
};

// The stats a week raises or lowers in fights, as shares by stat
// ({ strength: 0.05 }), or null.
/**
 * @param {Week | null | undefined} week
 * @returns {Record<string, number> | null}
 */
export function weekStats(week) {
  /** @type {Record<string, number>} */
  const shares = {};
  for (const effect of effectsOf(week)) if (effect.kind === 'stat' && effect.stat) shares[effect.stat] = (shares[effect.stat] ?? 0) + effect.value / 100;
  return Object.keys(shares).length > 0 ? shares : null;
}

// A player's character as it fights in a week: with the week's shares of
// its stats (`weekStats`), which playerCombatant lays over its totals; the
// character itself in a week without them.
/**
 * @template {Record<string, any>} T
 * @param {T} character
 * @param {Week | null | undefined} week
 * @returns {T | T & { weekStats: Record<string, number> }}
 */
export function weekFighter(character, week) {
  const stats = weekStats(week);
  return stats ? { ...character, weekStats: stats } : character;
}

// `amount` with a week's `factor`, made whole fairly: the whole part, and
// one more with the chance of the rest, drawn from `seed` (countEvents), so
// on average it is just the share more or less; as it is with a factor of 1.
/**
 * @param {number} amount
 * @param {number} factor
 * @param {string | number} seed
 * @returns {number}
 */
export function weekCount(amount, factor, seed) {
  if (factor === 1) return amount;
  return countEvents(Math.max(0, amount * factor), createRng(seed));
}

// Gains by id ({ merchants: 15 }, a brotherhood's reputation) with a week's
// share of a kind, each made whole fairly from `seed` and its id.
/**
 * @param {Record<string, number>} gains
 * @param {Week | null | undefined} week
 * @param {string} kind
 * @param {string | number} seed
 * @returns {Record<string, number>}
 */
export function weekGains(gains, week, kind, seed) {
  const factor = weekFactor(week, kind);
  if (factor === 1) return gains;
  return Object.fromEntries(Object.entries(gains).map(([id, points]) => [id, weekCount(points, factor, `${seed}:${id}`)]));
}

// Weighted outcomes ([id, weight] pairs) with `id`'s chance `factor` times
// as large, at most certain, and the others sharing the rest as they did:
// the chest among an exploration's finds (items).
/**
 * @template {string} K
 * @param {[K, number][]} entries
 * @param {K} id
 * @param {number} factor
 * @returns {[K, number][]}
 */
export function raisedOutcome(entries, id, factor) {
  if (factor === 1) return entries;
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  const own = entries.find(([key]) => key === id)?.[1] ?? 0;
  if (total <= 0 || own <= 0) return entries;
  const chance = Math.min(1, (own / total) * factor);
  const rest = total - own;
  return entries.map(([key, weight]) => /** @type {[K, number]} */ ([key, key === id ? chance * total : rest > 0 ? (weight * (1 - chance) * total) / rest : 0]));
}

// An effect in words (data/weeks.json, kinds): "odpoczynek szybszy o 5%",
// or `short` with its sign, "+5% złota z walk".
/**
 * @param {WeekEffect} effect
 * @param {Content} content
 * @param {boolean} [short]
 * @returns {string}
 */
export function weekEffectText(effect, content, short = false) {
  const words = content.weeks?.kinds?.[effect.kind];
  if (!words) return '';
  const size = decimalText(Math.abs(effect.value), content);
  const value = short ? `${effect.value < 0 ? '−' : '+'}${size}` : size;
  const template = short ? words.short : effect.value < 0 ? words.down : words.up;
  return template.replace(/\{(\w+)\}/g, (/** @type {string} */ whole, /** @type {string} */ name) => (name === 'value' ? value : name === 'stat' ? (content.weeks.stats[effect.stat ?? ''] ?? '') : whole));
}

// A week's effects in words, one after another.
/**
 * @param {WeekEffect[]} effects
 * @param {Content} content
 * @param {boolean} [short]
 * @returns {string}
 */
export const weekEffectsText = (effects, content, short = false) =>
  effects
    .map((effect) => weekEffectText(effect, content, short))
    .filter(Boolean)
    .join(', ');

// What a fight's effects had to change in a hunt (an exploration, a
// Wieża's or a Portal's fight): XP, gold, items and materials it brought,
// and the stats in any fight it had.
/** @type {Record<string, (hunt: Record<string, any>) => boolean>} */
const CHANGED = {
  xp: (hunt) => hunt.xp > 0,
  gold: (hunt) => hunt.gold > 0,
  items: (hunt) => (hunt.items ?? []).length > 0,
  materials: (hunt) => Object.keys(hunt.materials ?? {}).length > 0,
  stat: (hunt) => (hunt.fights ?? []).length > 0,
};

// The System's line of a report on the week the hunt kept (`hunt.week`):
// its effects that changed the result ("Tydzień Kuny: +5% złota z walk."),
// or null when none did.
/**
 * @param {Record<string, any>} hunt
 * @param {Content} content
 * @returns {string | null}
 */
export function weekLine(hunt, content) {
  const changed = effectsOf(hunt.week).filter((effect) => CHANGED[effect.kind]?.(hunt));
  const name = content.weeksByNumber?.[hunt.week?.number]?.name;
  if (changed.length === 0 || !name) return null;
  return content.weeks.texts.report.replace('{week}', name).replace('{effects}', weekEffectsText(changed, content, true));
}

// The week as the page shows it (the line on the Walka screen and the
// sheet Tygodnie): its number and ISO number, its start and end, and the
// three weeks after it; their names and words come with the content
// (weeksContent).
/**
 * @param {number} now
 * @param {Content} content
 */
export function weekView(now, content) {
  const at = weekAt(now, content);
  /** @type {{ number: number, iso: number, startsAt: number, endsAt: number }[]} */
  const next = [];
  for (let from = at.endsAt; next.length < 3; ) {
    const week = weekAt(from, content);
    next.push({ number: week.number, iso: week.iso, startsAt: week.startsAt, endsAt: week.endsAt });
    from = week.endsAt;
  }
  return { number: at.number, iso: at.iso, startsAt: at.startsAt, endsAt: at.endsAt, next };
}

// The weeks for the page (src/server/content.js): the words of the line and
// the sheet, and every week with its name and its effects in words, long
// and short, a malus marked.
/** @param {Content} content */
export function weeksContent(content) {
  if (!content.weeks) return null;
  return {
    texts: content.weeks.texts,
    list: content.weeks.weeks.map((/** @type {{ number: number, name: string, effects: WeekEffect[] }} */ week) => ({
      number: week.number,
      name: week.name,
      effects: week.effects.map((effect) => ({ text: weekEffectText(effect, content), short: weekEffectText(effect, content, true), ...(effect.value < 0 && { malus: true }) })),
    })),
  };
}

// The pace of resting with the weeks' `rest` (`camp`, restBonus in camp.js:
// the camp's `bonus` from `since` and its `change` from then on): the share
// the camp adds and the week's factor as one share more than the plain pace
// (regenPerMinute), `bonus` at `since` and `change` from the last change
// before `now` on, a new camp bonus or a new week, so restedHp, the pace of
// now and the page's count of HP take it as they took the camp's. A rest is
// over within about an hour, so only a new week and a new camp bonus both
// within one rest would count it a little off.
/**
 * @param {{ bonus: number, change?: { at: number, bonus: number } | null }} camp
 * @param {number} since
 * @param {number} now
 * @param {Content} content
 * @returns {{ bonus: number, change?: { at: number, bonus: number } }}
 */
export function weekRest(camp, since, now, content) {
  /** @param {number} at */
  const campAt = (at) => (camp.change && at >= camp.change.at ? camp.change.bonus : camp.bonus);
  /** @param {number} at */
  const pace = (at) => {
    const factor = weekFactor(weekAt(at, content).week, 'rest');
    return factor === 1 ? campAt(at) : (1 + campAt(at)) * factor - 1;
  };
  const { startsAt } = weekAt(now, content);
  const last = Math.max(camp.change?.at ?? since, startsAt > since ? startsAt : since);
  const first = pace(since);
  if (last <= since) return { bonus: first };
  // A new week with the same pace changes nothing.
  const then = pace(last);
  return then === first && !camp.change ? { bonus: first } : { bonus: first, change: { at: last, bonus: then } };
}

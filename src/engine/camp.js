// @ts-check
// The camp the player builds up alongside the character's activity
// (data/buildings.json). A building has levels; each level costs more gold and
// resources and takes longer to build. One building is upgraded at a time,
// and a few more can wait in the queue.
// A stored building is { level, startedAt, endsAt, collectedAt }: the level it
// has once the last upgrade has ended, and for a production building the time
// its store started filling. The server passes the time. The Zbieracz
// Systemu, once bought, collects every store as it goes (collectorTakes).

import { countedForm, decimalText, word } from './text.js';
import { weekCount } from './weeks.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ level: number, startedAt?: number, endsAt: number, collectedAt?: number | null }} Stored A building as the camp keeps it. */
/** @typedef {Record<string, Stored>} Camp The camp's buildings as kept, by id. */
/** @typedef {{ buildingId: string, level: number, startsAt: number, endsAt: number }} Waiting A build waiting in the queue. */
/**
 * @typedef {{
 *   id: string,
 *   costs: { resource: string, base: number, growth: number, fromLevel?: number }[],
 *   minutes: { levels?: number[], base: number, growth: number },
 *   maxLevel: number,
 *   beyond?: { goldGrowth: number, minutesGrowth: number },
 *   startLevel?: number,
 *   effect: Record<string, any>,
 *   exchange?: { levelText: string, rates: (string | number)[] },
 * } & Record<string, any>} Building A building of data/buildings.json.
 */
/** @typedef {{ resource: string, perHour: number, capacity: number, amount: number, since: number, fullAt: number }} Store A production building's store. */
/** @typedef {{ resource: string, amount: number, collectedAt: number }} Collected What a collection gives. */

// The level a stored building has at `now`: an upgrade counts once it ends.
/**
 * @param {Stored | null | undefined} stored
 * @param {number} now
 * @returns {number}
 */
export function buildingLevel(stored, now) {
  if (!stored) return 0;
  return stored.endsAt > now ? stored.level - 1 : stored.level;
}

// Levels of every building at `now`, 0 for those not built yet.
/**
 * @param {Camp} stored
 * @param {number} now
 * @param {Content} content
 * @returns {Record<string, number>}
 */
export function campLevels(stored, now, content) {
  return Object.fromEntries(content.buildings.map((/** @type {Building} */ building) => [building.id, buildingLevel(stored[building.id], now)]));
}

// The upgrade in progress, if any.
/**
 * @param {Camp} stored
 * @param {number} now
 * @returns {(Stored & { buildingId: string }) | null}
 */
export function construction(stored, now) {
  const entry = Object.entries(stored).find(([, building]) => building.endsAt > now);
  return entry ? { buildingId: entry[0], ...entry[1] } : null;
}

// What reaching `level` costs: { gold, wood, … }. Each part counts from its
// own level on, so the first levels take gold alone. Past its maxLevel, in
// the Warownia (beyond; the author's 618): the resources of the maxLevel
// and its gold growing by beyond.goldGrowth a level.
/**
 * @param {Building} building
 * @param {number} level
 * @returns {Record<string, number>}
 */
export function upgradeCost(building, level) {
  const { beyond, maxLevel } = building;
  if (beyond && level > maxLevel) {
    const top = upgradeCost(building, maxLevel);
    return { ...top, gold: Math.round((top.gold ?? 0) * beyond.goldGrowth ** (level - maxLevel)) };
  }
  /** @type {Record<string, number>} */
  const cost = {};
  for (const part of building.costs) {
    const from = part.fromLevel ?? 1;
    if (level >= from) cost[part.resource] = Math.round(part.base * part.growth ** (level - from));
  }
  return cost;
}

// How long reaching `level` takes: the building's own list, level by level,
// or base × growth^(level − 1); past its maxLevel (beyond), the maxLevel's
// time growing by beyond.minutesGrowth a level.
/**
 * @param {Building} building
 * @param {number} level
 * @returns {number}
 */
export function upgradeMinutes(building, level) {
  const { beyond, maxLevel } = building;
  if (beyond && level > maxLevel) return Math.max(1, Math.round(upgradeMinutes(building, maxLevel) * beyond.minutesGrowth ** (level - maxLevel)));
  const { levels, base, growth } = building.minutes;
  return Math.max(1, Math.round(levels ? levels[level - 1] : base * growth ** (level - 1)));
}

// The builds waiting after the one under way (data/camp.json: queue counts
// them all, the one under way too). Each starts when the one before it ends
// and is paid when it is queued. A waiting build is
// { buildingId, level, startsAt, endsAt }.

// How many builds the camp has at `now`: the one under way and the waiting ones.
/**
 * @param {Camp} stored
 * @param {Waiting[]} queue
 * @param {number} now
 * @returns {number}
 */
export const buildsUnderWay = (stored, queue, now) => (construction(stored, now) ? 1 : 0) + queue.length;

// When a build queued at `now` starts: as the last one ends, or at once.
/**
 * @param {Camp} stored
 * @param {Waiting[]} queue
 * @param {number} now
 * @returns {number}
 */
export function queueEnd(stored, queue, now) {
  if (queue.length > 0) return queue[queue.length - 1].endsAt;
  return construction(stored, now)?.endsAt ?? now;
}

// The level a building has once the build under way and the waiting ones end.
/**
 * @param {{ id: string, startLevel?: number }} building
 * @param {Camp} stored
 * @param {Waiting[]} queue
 * @returns {number}
 */
export function plannedLevel(building, stored, queue) {
  const waiting = queue.filter((entry) => entry.buildingId === building.id);
  if (waiting.length > 0) return waiting[waiting.length - 1].level;
  return Math.max(building.startLevel ?? 0, stored[building.id]?.level ?? 0);
}

// The waiting builds `by` milliseconds sooner, after the one under way was
// skipped by as much.
/**
 * @param {Waiting[]} queue
 * @param {number} by
 * @returns {Waiting[]}
 */
export const shiftQueue = (queue, by) => queue.map((entry) => ({ ...entry, startsAt: entry.startsAt - by, endsAt: entry.endsAt - by }));

// A waiting build called off ("Anuluj"): it leaves the queue with the higher
// levels of the same building after it, which need it. Returns the builds
// that go, whose cost comes back, and those that stay.
/**
 * @param {Waiting[]} queue
 * @param {string} buildingId
 * @param {number} level
 * @returns {{ cancelled: Waiting[], kept: Waiting[] }}
 */
export function cancelFromQueue(queue, buildingId, level) {
  /** @param {Waiting} entry */
  const gone = (entry) => entry.buildingId === buildingId && entry.level >= level;
  return { cancelled: queue.filter(gone), kept: queue.filter((entry) => !gone(entry)) };
}

// The waiting builds laid out again one after another from the end of the
// build under way, each in the camp the builds before it leave behind: after
// one is called off the rest come sooner, and with a camp level called off
// the later ones build at the slower pace again.
/**
 * @param {Camp} stored
 * @param {Waiting[]} queue
 * @param {number} now
 * @param {Content} content
 * @returns {Waiting[]}
 */
export function replanQueue(stored, queue, now, content) {
  let at = construction(stored, now)?.endsAt ?? now;
  /** @type {Waiting[]} */
  const planned = [];
  for (const entry of queue) {
    const building = content.buildingsById[entry.buildingId];
    const minutes = building
      ? buildMinutes(building, entry.level, plannedLevel(content.camp, stored, planned), content)
      : Math.round((entry.endsAt - entry.startsAt) / 60000);
    planned.push({ ...entry, startsAt: at, endsAt: at + minutes * 60000 });
    at += minutes * 60000;
  }
  return planned;
}

// The camp's own level (data/camp.json): it starts at its first level
// without building, and an upgrade counts once it ends.
/**
 * @param {Camp} stored
 * @param {number} now
 * @param {Content} content
 * @returns {number}
 */
export function campLevel(stored, now, content) {
  return Math.max(content.camp.startLevel, buildingLevel(stored[content.camp.id], now));
}

// How much faster the buildings build in a camp of `level`: nothing on the
// first level.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {number}
 */
export const buildSpeed = (level, content) => content.camp.effect.perLevel * (level - content.camp.startLevel);

// How long an upgrade to `level` takes in a camp of level `camp`: the camp
// itself grows at its own pace, the buildings faster with each camp level.
/**
 * @param {Building} building
 * @param {number} level
 * @param {number} camp
 * @param {Content} content
 * @returns {number}
 */
export function buildMinutes(building, level, camp, content) {
  const minutes = upgradeMinutes(building, level);
  // So does the transformation into a Warownia: 3 days (419 A).
  if (building.id === content.camp.id || building.id === content.camp.fortress?.id) return minutes;
  return Math.max(1, Math.round(minutes / (1 + buildSpeed(camp, content))));
}

// The camp level's effect as the page shows it.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {string}
 */
export function campEffectText(level, content) {
  const { effect, startLevel } = content.camp;
  return level <= startLevel ? effect.startText : effect.text.replace('{value}', `${Math.round(buildSpeed(level, content) * 100)}%`);
}

// What is missing to pay a cost from a wallet of gold and resources.
/**
 * @param {Record<string, number>} cost
 * @param {Record<string, number>} wallet
 * @returns {{ resource: string, amount: number }[]}
 */
export function missingFor(cost, wallet) {
  return Object.entries(cost)
    .filter(([id, amount]) => (wallet[id] ?? 0) < amount)
    .map(([id, amount]) => ({ resource: id, amount: amount - (wallet[id] ?? 0) }));
}

// The sum of one kind of effect over the camp's buildings at their levels.
/**
 * @param {Record<string, number>} levels
 * @param {string} kind
 * @param {Content} content
 * @returns {number}
 */
export function campBonus(levels, kind, content) {
  let total = 0;
  for (const building of content.buildings) {
    if (building.effect.kind === kind) total += building.effect.perLevel * (levels[building.id] ?? 0);
  }
  return total;
}

/**
 * @param {Record<string, number>} levels
 * @param {Content} content
 * @returns {number}
 */
export const bagCapacity = (levels, content) => content.balance.items.bagSlots + campBonus(levels, 'bagSlots', content);

// The bonus to resting from `since` and, when an upgrade of a building that
// speeds up resting ends before `now`, the bonus from then on. Only the last
// upgrade is stored, and every start of one saves the HP rested so far, so one
// change is enough.
/**
 * @param {Camp} stored
 * @param {number} since
 * @param {number} now
 * @param {Content} content
 * @returns {{ bonus: number, change?: { at: number, bonus: number } }}
 */
export function restBonus(stored, since, now, content) {
  /** @param {number} time */
  const bonus = (time) => campBonus(campLevels(stored, time, content), 'restSpeed', content);
  /** @type {number[]} */
  const ended = content.buildings
    .filter((/** @type {Building} */ building) => building.effect.kind === 'restSpeed')
    .map((/** @type {Building} */ building) => stored[building.id]?.endsAt)
    .filter((/** @type {number | undefined} */ at) => at !== undefined && at > since && at <= now);
  if (ended.length === 0) return { bonus: bonus(now) };
  return { bonus: bonus(since), change: { at: Math.max(...ended), bonus: bonus(now) } };
}

// The effect of a building at a level, as the page shows it: "o 20%", or
// for a production building "6 drewna na godzinę… na 1 h".
/**
 * @param {Building} building
 * @param {number} level
 * @param {Content} content
 * @returns {string}
 */
export function effectText(building, level, content) {
  const { effect } = building;
  // The Strażnica gives only its first effect below `fromLevel`.
  if (effect.fromLevel && level < effect.fromLevel) return effect.startText;
  const value = (effect.base ?? 0) + effect.perLevel * level;
  const text = effect.text.replace('{value}', shownValue(value, effect.unit, content)).replace('{hours}', `${effect.storageHours * level}\u00a0h`);
  if (effect.startText) return `${effect.startText}, ${text}`;
  // A building that exchanges resources (the Stół rozbiórki) adds its rate
  // at the level (the author: "Dopisz na górę info o możliwości wymiany
  // zasobów i rozwoju sytuacji wraz z lvlem").
  const { exchange } = building;
  const rate = exchange ? `, ${exchange.levelText.replace('{rate}', String(exchange.rates[Math.min(level, exchange.rates.length) - 1]))}` : '';
  if (!effect.rarities) return `${text}${rate}`;
  // The Stół rozbiórki also names the highest rarity it takes and, from
  // a level on, the chance of an extra part.
  const all = level >= effect.rarities.length;
  const cap = all ? word(content, 'Wszystkie rzadkości') : word(content, 'Najwyższa rzadkość: {rarity}', { rarity: content.raritiesById[effect.rarities[level - 1]].forms.f });
  const bonus =
    level >= effect.bonusFromLevel ? word(content, ', szansa na dodatkową część: {chance}%', { chance: Math.round((level - effect.bonusFromLevel + 1) * effect.bonusPerLevel * 100) }) : '';
  return `${cap}, ${text.charAt(0).toLowerCase()}${text.slice(1)}${bonus}${rate}`;
}

// A value as the page shows it: a share with up to one decimal ("0,5%"),
// hours ("1,5 h"), fights ("8 walk") or a count; the decimal as the
// content's language writes it ("0.5%" in English).
/**
 * @param {number} value
 * @param {string | undefined} unit
 * @param {Content} content
 * @returns {string}
 */
function shownValue(value, unit, content) {
  if (unit === 'percent') return `${decimalText(value * 100, content)}%`;
  if (unit === 'hours') return `${decimalText(value, content)}\u00a0h`;
  if (unit === 'fights') return `${value} ${countedForm(value, content.potionUse.fightForms)}`;
  return String(Math.round(value));
}

const HOUR = 3600000;

// A production building's store at `now`. It fills from `since` (the end of
// the last upgrade, or what the last collection left), `perLevel` an hour for
// each level, up to `storageHours` hours of it for each level; a full store
// stops production. An upgrade in progress keeps `since` at its end, so the
// building does not produce until then.
/**
 * @param {Building} building
 * @param {Stored | null | undefined} stored
 * @param {number} now
 * @returns {Store | null}
 */
export function production(building, stored, now) {
  if (building.effect.kind !== 'production' || !stored) return null;
  const perHour = building.effect.perLevel * stored.level;
  const capacity = perHour * building.effect.storageHours * stored.level;
  const since = stored.collectedAt ?? stored.endsAt;
  const amount = Math.floor(Math.min(capacity, (Math.max(0, now - since) / HOUR) * perHour));
  return { resource: building.effect.resource, perHour, capacity, amount, since, fullAt: since + (capacity / perHour) * HOUR };
}

// What a collection gives with the week's `factor` of what the camp's
// buildings give (camp, weeks.js; the week of the moment it is collected,
// which the server gives): the store's units times it, made whole fairly
// with a seed of the building and the collection, so on average just the
// share more (or less); production goes on from the units made, as ever.
/**
 * @param {number} amount
 * @param {number} factor
 * @param {Building} building
 * @param {number} collectedAt
 */
const weekUnits = (amount, factor, building, collectedAt) => weekCount(amount, factor, `camp:${building.id}:${collectedAt}`);

// Collecting the store: what it gives, and the new start of production. The
// part of a unit already made is kept, unless the store was full and stood.
// `factor`: the week's share of it (weekUnits).
/**
 * @param {Building} building
 * @param {Stored | null | undefined} stored
 * @param {number} now
 * @param {number} [factor]
 * @returns {Collected | null}
 */
export function collect(building, stored, now, factor = 1) {
  const store = production(building, stored, now);
  if (!store || store.amount < 1) return null;
  const collectedAt = store.amount >= store.capacity ? now : store.since + Math.round((store.amount / store.perHour) * HOUR);
  return { resource: store.resource, amount: weekUnits(store.amount, factor, building, collectedAt), collectedAt };
}

// The Zbieracz Systemu (DECISIONS.md, „Zbieracz Systemu”), there since
// `from` (without it, as if he had always been there), collects every store
// the moment it fills, so production never stands: by `now` a store has
// given its whole fills since it started filling, each a full store made in
// the time from empty to full. What they give and the new start of
// production, which keeps the part of the next fill made so far; null
// before the first fill and while an upgrade keeps the building from
// producing. A store that stood full before the Zbieracz came is collected
// as he comes, and fills again from then: the time it stood brings nothing.
/**
 * @param {Building} building
 * @param {Stored} stored
 * @param {number} now
 * @param {number | null} [from]
 * @returns {Collected | null}
 */
export function wholeFills(building, stored, now, from = null) {
  const store = production(building, stored, now);
  if (!store || store.capacity <= 0 || stored.endsAt > now || (from !== null && now < from)) return null;
  const fill = Math.round((store.capacity / store.perHour) * HOUR);
  const stood = from !== null && store.since + fill <= from;
  const start = stood ? /** @type {number} */ (from) : store.since;
  const later = Math.floor((now - start) / fill);
  const fills = later + (stood ? 1 : 0);
  if (fills < 1) return null;
  return { resource: store.resource, amount: fills * store.capacity, collectedAt: start + later * fill };
}

// Collecting the store at `now` with the Zbieracz Systemu there since
// `from`: his whole fills and what the next one holds so far, as a build
// that begins takes the store along (characters.js: settleBuilds), with the
// week's share of it all (`factor`, weekUnits).
/**
 * @param {Building} building
 * @param {Stored} stored
 * @param {number} now
 * @param {number | null} [from]
 * @param {number} [factor]
 * @returns {Collected | null}
 */
export function collectWithFills(building, stored, now, from = null, factor = 1) {
  const fills = wholeFills(building, stored, now, from);
  if (!fills) return collect(building, stored, now, factor);
  const rest = collect(building, { ...stored, collectedAt: fills.collectedAt }, now);
  const collectedAt = rest?.collectedAt ?? fills.collectedAt;
  return { resource: fills.resource, amount: weekUnits(fills.amount + (rest?.amount ?? 0), factor, building, collectedAt), collectedAt };
}

// The Zbieracz Systemu collecting as it goes (the author's 753 A), there
// since `from`: at `now` a store gives all it made, its whole fills and
// the whole units of the next one (collectWithFills), once `every` ms have
// passed since it started filling, or at once when a fill is whole; null
// when nothing is due yet. So a store never stands, and the server writes
// at most about once in `every` for each building. `factor`: the week's
// share of what he collects (weekUnits).
/**
 * @param {Building} building
 * @param {Stored} stored
 * @param {number} now
 * @param {number | null} from
 * @param {number} every
 * @param {number} [factor]
 * @returns {Collected | null}
 */
export function collectorTakes(building, stored, now, from, every, factor = 1) {
  const store = production(building, stored, now);
  if (!store || stored.endsAt > now) return null;
  if (!wholeFills(building, stored, now, from) && now - store.since < every) return null;
  return collectWithFills(building, stored, now, from, factor);
}

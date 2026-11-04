// The Warownia (camp.json: fortress; the author's 419–428 and 430 A). Once
// the Obóz and each of its buildings stand at their highest level, the camp
// can turn into a Warownia: a build of its own (id "fortress", one level,
// 3 days, no faster with the camp's level), stored as a building. After it
// the seven buildings of the Warownia (buildings.json: fortress) can be
// built at once, each with an effect on the character. The server passes
// the time; the levels are campLevels' (0 for a building not built yet).

import { buildingLevel, campLevel } from './camp.js';
import { eventChance } from './events.js';
import { explorationPace, withRareOdds } from './hunt.js';
import { herbsPerHour } from './professions.js';
import { xpPerHour } from './progression.js';

// The transformation as a building, or null where the data has none.
export const fortressOf = (content) => content.camp?.fortress ?? null;

// Whether the transformation has ended by `now`.
export function fortressStands(stored, now, content) {
  const fortress = fortressOf(content);
  return Boolean(fortress) && buildingLevel(stored[fortress.id], now) >= fortress.maxLevel;
}

// Whether the camp may turn into a Warownia at `now`: the Obóz at its
// highest level and every camp building given (the open ones, without the
// Warownia's) at its own; not when the transformation is under way or done.
export function fortressReady(stored, now, buildings, content) {
  const fortress = fortressOf(content);
  if (!fortress || stored[fortress.id]) return false;
  if (campLevel(stored, now, content) < content.camp.maxLevel) return false;
  return buildings.every((building) => building.fortress === true || buildingLevel(stored[building.id], now) >= building.maxLevel);
}

// A building's effect at a level: its base and `perLevel` for each level;
// nothing before it is built. The Strażnica's tracking counts from its
// `fromLevel` on.
export function effectValue(building, level) {
  const { effect } = building;
  if (level <= 0 || (effect.fromLevel && level < effect.fromLevel)) return 0;
  return (effect.base ?? 0) + effect.perLevel * level;
}

// The effect of the Warownia's building of `kind` at the camp's levels, with
// the building, or { value: 0 } when there is none.
export function fortressEffect(levels, kind, content) {
  const building = content.buildings.find((one) => one.fortress && one.effect.kind === kind);
  if (!building) return { value: 0, level: 0, building: null };
  const level = levels[building.id] ?? 0;
  return { value: effectValue(building, level), level, building };
}

// The share of the XP a faint costs (the Kapliczka, 427 A): each level takes
// 5% of it off, half at the 10th.
export const faintShare = (levels, content) => Math.max(0, 1 - fortressEffect(levels, 'faintXp', content).value);

// The creatures of the Bestiariusz: not the events' foes (people).
const creatures = (content) => Object.values(content.monstersById).filter((monster) => !content.eventFoesById[monster.id] && monster.family);

// The creature families the character knows in full: every creature of the
// family is met.
export function familiesKnown(met, content) {
  const seen = new Set(met);
  const families = new Map();
  for (const monster of creatures(content)) {
    const family = families.get(monster.family) ?? { all: 0, met: 0 };
    family.all += 1;
    if (seen.has(monster.id)) family.met += 1;
    families.set(monster.family, family);
  }
  return [...families].filter(([, family]) => family.met === family.all).map(([id]) => id);
}

// The Sala trofeów (422 A): +0,5% damage a level against every creature of a
// family known in full, added to the Encyklopedia's trophies. `kept` are the
// families the hall already holds: a family's bonus stays when new creatures
// join it later (the wall of trophies does not empty). Returns the bonus by
// creature id; `only`, if given, keeps those creatures.
export function trophyHallBonuses(levels, met, kept, content, only = null) {
  const { value } = fortressEffect(levels, 'trophyHall', content);
  if (value <= 0) return {};
  const families = new Set([...kept, ...familiesKnown(met, content)]);
  const bonuses = {};
  for (const monster of creatures(content)) {
    if (!families.has(monster.family) || (only && !only.includes(monster.id))) continue;
    bonuses[monster.id] = value;
  }
  return bonuses;
}

// The families the hall holds, written down among the discoveries as
// "family:<id>" once known in full (familyDiscoveries).
export const keptFamilies = (discovered) =>
  Object.keys(discovered)
    .filter((key) => key.startsWith('family:'))
    .map((key) => key.slice('family:'.length));

// The discoveries to write down for the families known in full now.
export const familyDiscoveries = (met, content) => Object.fromEntries(familiesKnown(met, content).map((family) => [`family:${family}`, 1]));

// The Encyklopedia's trophies and the hall's together, by creature id.
export function addBonuses(...maps) {
  const sum = {};
  for (const map of maps) for (const [id, bonus] of Object.entries(map)) sum[id] = (sum[id] ?? 0) + bonus;
  return sum;
}

// The Plac treningowy (420 A): a training a day of an hour for each level,
// for `share` of the class XP an exploration as long gives.
export function trainingPlan(levels, content) {
  const { value, building } = fortressEffect(levels, 'training', content);
  return value > 0 ? { hours: value, share: building.effect.share } : null;
}

// The Zbrojownia (421 A): how many gear sets the character keeps.
export const gearSetCount = (levels, content) => fortressEffect(levels, 'gearSets', content).value;

// The Strażnica (423 A): from its 1st level the chances shown before an
// exploration, from its 2nd a creature tracked, met more often by the share
// returned (40% at the 2nd level, 100% at the 5th).
export function scouting(levels, content) {
  const { level, value } = fortressEffect(levels, 'scouting', content);
  return level > 0 ? { chances: true, track: Math.round(value * 100) / 100 } : null;
}

// The Ołtarz Systemu (424 A, 425 A, the author's buffs counted in fights):
// a blessing a day for 4 fights of explorations a level, of `bonus` strength.
export function blessingPlan(levels, content) {
  const { value, building } = fortressEffect(levels, 'blessing', content);
  return value > 0 ? { fights: value, bonus: building.effect.bonus } : null;
}

// The Szklarnia (426 A): the hours of gathering in the Systemowy Zagajnik it
// grows of the chosen herb each day, half an hour a level.
export const greenhouseHours = (levels, content) => fortressEffect(levels, 'greenhouse', content).value;

// The class XP of a training of the Plac treningowy: `share` of what an
// exploration as long gives at the character's level (xpPerHour).
export const trainingXp = (level, plan, content) => Math.round(xpPerHour(level, content) * plan.hours * plan.share);

// The Strażnica's chances for an exploration of `minutes` in `area`, as
// shares: of at least one elite, of at least one champion (where one lives)
// and of an event at its end, with the elite and the champion avoided or
// sought (`rare`, withRareOdds). The champion is drawn before the elite in
// each fight (rollEncounter).
export function scoutChances(area, minutes, content, rare = {}, events = true) {
  const pace = withRareOdds(explorationPace(minutes, content), rare, content);
  const champion = area.champion ? pace.championChance : 0;
  const atLeastOnce = (chance) => 1 - (1 - chance) ** pace.fights;
  return {
    elite: atLeastOnce((1 - champion) * pace.eliteChance),
    champion: atLeastOnce(champion),
    event: events ? eventChance(content, minutes) : 0,
  };
}

// The creature an exploration tracks with the Strażnica: one of the place's,
// with its share (scouting), or null below the level that tracks.
export function scoutedCreature(levels, area, monsterId, content) {
  const plan = scouting(levels, content);
  if (!plan || plan.track <= 0 || typeof monsterId !== 'string') return null;
  const living = [...area.encounters, ...(area.tough ?? [])].some((encounter) => encounter.monsters.includes(monsterId));
  return living ? { id: monsterId, bonus: plan.track } : null;
}

const DAY = 24 * 3600000;

// The Szklarnia's store at `now`: its herb (`state`: { herb, since }) grows
// all the time, a day bringing what `greenhouseHours` of gathering give at
// the Zielarstwo level `herbalism`. It holds a day's growth and the herb
// still growing (`limit`), so collecting once a day loses nothing, and a
// full store stops growing. Null without the building or a herb.
export function greenhouseStore(levels, state, herbalism, now, content) {
  const hours = greenhouseHours(levels, content);
  const herb = state?.herb ? content.herbsById[state.herb] : null;
  if (hours <= 0 || !herb) return null;
  const perDay = herbsPerHour(herb, herbalism, content) * hours;
  const limit = perDay + 1;
  const grown = Math.min(limit, Math.max(0, ((now - state.since) / DAY) * perDay));
  return { herb: herb.id, perDay, limit, capacity: Math.floor(limit), grown, amount: Math.floor(grown + 1e-9), since: state.since };
}

// The time the store grows from after `taken` of it is collected at `now`:
// what is left, the part of a herb grown already too, stays in it.
export const greenhouseSince = (store, taken, now) => now - Math.round(((store.grown - taken) / store.perDay) * DAY);

// The Zbrojownia (421 A): its sets ([{ name, items }], null for one not
// saved) keep the items the character wore, by id. The items of the sets
// not worn hang on its racks, out of the bag.
export const gearSetIds = (sets) => new Set(sets.flatMap((set) => set?.items ?? []));

// Wearing set `index` over the character's `items` (with equippedSlot): the
// set's items still had, each into its slot (one a slot), and what else is
// worn comes off, onto a rack while a set keeps it, else into the bag
// (`toBag`).
export function gearSetPlan(sets, index, items) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const slots = new Set();
  const wear = (sets[index]?.items ?? [])
    .map((id) => byId.get(id))
    .filter((item) => item && !slots.has(item.slot) && slots.add(item.slot));
  const wearing = new Set(wear.map((item) => item.id));
  const kept = gearSetIds(sets);
  return { wear, toBag: items.filter((item) => item.equippedSlot && !wearing.has(item.id) && !kept.has(item.id)) };
}

// The items that leave the racks for the bag when set `index` becomes
// `next` (null: emptied): the set's before, not worn, kept by no set after.
export function leavingRack(sets, index, next, items) {
  const kept = gearSetIds(sets.map((set, at) => (at === index ? next : set)));
  const byId = new Map(items.map((item) => [item.id, item]));
  return (sets[index]?.items ?? []).map((id) => byId.get(id)).filter((item) => item && !item.equippedSlot && !kept.has(item.id));
}

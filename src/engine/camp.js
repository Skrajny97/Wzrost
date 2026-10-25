// The camp the player builds up alongside the character's activity
// (data/buildings.json). A building has levels; each level costs more gold and
// resources and takes longer to build. One building is upgraded at a time.
// A stored building is { level, startedAt, endsAt, collectedAt }: the level it
// has once the last upgrade has ended, and for a production building the time
// its store started filling. The server passes the time.

// The level a stored building has at `now`: an upgrade counts once it ends.
export function buildingLevel(stored, now) {
  if (!stored) return 0;
  return stored.endsAt > now ? stored.level - 1 : stored.level;
}

// Levels of every building at `now`, 0 for those not built yet.
export function campLevels(stored, now, content) {
  return Object.fromEntries(content.buildings.map((building) => [building.id, buildingLevel(stored[building.id], now)]));
}

// The upgrade in progress, if any.
export function construction(stored, now) {
  const entry = Object.entries(stored).find(([, building]) => building.endsAt > now);
  return entry ? { buildingId: entry[0], ...entry[1] } : null;
}

// What reaching `level` costs: { gold, wood, … }. Each part counts from its
// own level on, so the first levels take gold alone.
export function upgradeCost(building, level) {
  const cost = {};
  for (const part of building.costs) {
    const from = part.fromLevel ?? 1;
    if (level >= from) cost[part.resource] = Math.round(part.base * part.growth ** (level - from));
  }
  return cost;
}

// How long reaching `level` takes: the building's own list, level by level,
// or base × growth^(level − 1).
export function upgradeMinutes(building, level) {
  const { levels, base, growth } = building.minutes;
  return Math.max(1, Math.round(levels ? levels[level - 1] : base * growth ** (level - 1)));
}

// The camp's own level (data/camp.json): it starts at its first level
// without building, and an upgrade counts once it ends.
export function campLevel(stored, now, content) {
  return Math.max(content.camp.startLevel, buildingLevel(stored[content.camp.id], now));
}

// How much faster the buildings build in a camp of `level`: nothing on the
// first level.
export const buildSpeed = (level, content) => content.camp.effect.perLevel * (level - content.camp.startLevel);

// How long an upgrade to `level` takes in a camp of level `camp`: the camp
// itself grows at its own pace, the buildings faster with each camp level.
export function buildMinutes(building, level, camp, content) {
  const minutes = upgradeMinutes(building, level);
  if (building.id === content.camp.id) return minutes;
  return Math.max(1, Math.round(minutes / (1 + buildSpeed(camp, content))));
}

// The camp level's effect as the page shows it.
export function campEffectText(level, content) {
  const { effect, startLevel } = content.camp;
  return level <= startLevel ? effect.startText : effect.text.replace('{value}', `${Math.round(buildSpeed(level, content) * 100)}%`);
}

// What is missing to pay a cost from a wallet of gold and resources.
export function missingFor(cost, wallet) {
  return Object.entries(cost)
    .filter(([id, amount]) => (wallet[id] ?? 0) < amount)
    .map(([id, amount]) => ({ resource: id, amount: amount - (wallet[id] ?? 0) }));
}

// The sum of one kind of effect over the camp's buildings at their levels.
export function campBonus(levels, kind, content) {
  let total = 0;
  for (const building of content.buildings) {
    if (building.effect.kind === kind) total += building.effect.perLevel * (levels[building.id] ?? 0);
  }
  return total;
}

export const bagCapacity = (levels, content) => content.balance.items.bagSlots + campBonus(levels, 'bagSlots', content);

// The bonus to resting from `since` and, when an upgrade of a building that
// speeds up resting ends before `now`, the bonus from then on. Only the last
// upgrade is stored, and every start of one saves the HP rested so far, so one
// change is enough.
export function restBonus(stored, since, now, content) {
  const bonus = (time) => campBonus(campLevels(stored, time, content), 'restSpeed', content);
  const ended = content.buildings
    .filter((building) => building.effect.kind === 'restSpeed')
    .map((building) => stored[building.id]?.endsAt)
    .filter((at) => at > since && at <= now);
  if (ended.length === 0) return { bonus: bonus(now) };
  return { bonus: bonus(since), change: { at: Math.max(...ended), bonus: bonus(now) } };
}

// The effect of a building at a level, as the page shows it: "o 20%", or
// for a production building "6 drewna na godzinę… na 1 h".
export function effectText(building, level, content) {
  const { effect } = building;
  const value = effect.perLevel * level;
  const shown = effect.unit === 'percent' ? `${Math.round(value * 100)}%` : String(Math.round(value));
  const text = effect.text.replace('{value}', shown).replace('{hours}', `${effect.storageHours * level}\u00a0h`);
  if (!effect.rarities) return text;
  // The Stół rzemieślniczy also names the highest rarity it takes and, from
  // a level on, the chance of an extra part.
  const all = level >= effect.rarities.length;
  const cap = all ? 'Wszystkie rzadkości' : `Najwyższa rzadkość: ${content.raritiesById[effect.rarities[level - 1]].forms.f}`;
  const bonus = level >= effect.bonusFromLevel ? `, szansa na dodatkową część: ${Math.round((level - effect.bonusFromLevel + 1) * effect.bonusPerLevel * 100)}%` : '';
  return `${cap}, ${text.charAt(0).toLowerCase()}${text.slice(1)}${bonus}`;
}

const HOUR = 3600000;

// A production building's store at `now`. It fills from `since` (the end of
// the last upgrade, or what the last collection left), `perLevel` an hour for
// each level, up to `storageHours` hours of it for each level; a full store
// stops production. An upgrade in progress keeps `since` at its end, so the
// building does not produce until then.
export function production(building, stored, now) {
  if (building.effect.kind !== 'production' || !stored) return null;
  const perHour = building.effect.perLevel * stored.level;
  const capacity = perHour * building.effect.storageHours * stored.level;
  const since = stored.collectedAt ?? stored.endsAt;
  const amount = Math.floor(Math.min(capacity, (Math.max(0, now - since) / HOUR) * perHour));
  return { resource: building.effect.resource, perHour, capacity, amount, since, fullAt: since + (capacity / perHour) * HOUR };
}

// Collecting the store: what it gives, and the new start of production. The
// part of a unit already made is kept, unless the store was full and stood.
export function collect(building, stored, now) {
  const store = production(building, stored, now);
  if (!store || store.amount < 1) return null;
  const collectedAt = store.amount >= store.capacity ? now : store.since + Math.round((store.amount / store.perHour) * HOUR);
  return { resource: store.resource, amount: store.amount, collectedAt };
}

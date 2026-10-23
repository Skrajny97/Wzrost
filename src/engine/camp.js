// The camp the player builds up alongside the character's activity
// (data/buildings.json). A building has levels; each level costs more gold and
// resources and takes longer to build. One building is upgraded at a time.
// A stored building is { level, startedAt, endsAt }: the level it has once
// the last upgrade has ended. The server passes the time.

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

export function upgradeMinutes(building, level) {
  return Math.max(1, Math.round(building.minutes.base * building.minutes.growth ** (level - 1)));
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

// The effect of a building at a level, as the page shows it: "o 20%".
export function effectText(building, level) {
  const value = building.effect.perLevel * level;
  const shown = building.effect.unit === 'percent' ? `${Math.round(value * 100)}%` : String(Math.round(value));
  return building.effect.text.replace('{value}', shown);
}

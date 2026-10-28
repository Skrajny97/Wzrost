// The Stół rozbiórki's exchange (`exchange` of the building in
// data/buildings.json): pieces of one of the camp's resources for a piece
// of another, rates[L − 1] pieces for one at the building's level L, the
// last rate from there on (the author: "możliwość wymiany zasobów typu
// kamień na drewno w stosunku 1 za 10 i aż do 1 do 1 przy poziomie 10-tym
// stołu rozbiórki"). It has no daily limit and works beside whatever the
// character does, as the camp does.

// The one building with an exchange, if any.
export const exchangeBuilding = (content) => content.buildings.find((building) => building.exchange) ?? null;

// The exchange at the building's level: the pieces given for one (`rate`)
// and the resources it takes and gives; null before it is built.
export function resourceExchange(level, content) {
  const building = exchangeBuilding(content);
  if (!building || level < 1) return null;
  const { rates, resources } = building.exchange;
  return { rate: rates[Math.min(level, rates.length) - 1], resources };
}

// Why `amount` pieces of `to` cannot be had for pieces of `from` now, or
// null: `resources` is what the character has, by id.
export function exchangeBlock({ level, resources, from, to, amount }, content) {
  const exchange = resourceExchange(level, content);
  if (!exchange) return { code: 'not_built', message: `Najpierw zbuduj: ${exchangeBuilding(content)?.name ?? 'Stół rozbiórki'}.` };
  if (!exchange.resources.includes(from) || !exchange.resources.includes(to) || from === to) {
    return { code: 'invalid_resource', message: 'Tych zasobów stół nie wymienia.' };
  }
  if (!Number.isInteger(amount) || amount < 1) return { code: 'invalid_amount', message: 'Wybierz, ile sztuk wziąć.' };
  const given = amount * exchange.rate;
  if ((resources[from] ?? 0) < given) return { code: 'not_enough', message: `Brakuje zasobów: ${content.resourcesById[from].name} (potrzeba ${given}).` };
  return null;
}

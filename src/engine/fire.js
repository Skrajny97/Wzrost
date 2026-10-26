// The Ognisko's fire spirit (`trade` of the building in data/buildings.json):
// gold thrown into the fire comes back as wood, stone or iron ore. At the
// building's level L a trade gives unitsPerLevel × L of one resource for
// goldPerUnit gold each, and a day holds tradesPerDay trades, one more for
// every moreTradesEvery levels. Days follow the quests' clock (Polish time),
// so the trades come back at midnight.

import { questPeriod } from './quests.js';

// The one building with a trade, if any.
export const fireBuilding = (content) => content.buildings.find((building) => building.trade) ?? null;

// A trade at the building's level: how much of a resource it gives, for how
// much gold, and how many trades a day holds; null before it is built.
export function fireTrade(level, content) {
  const building = fireBuilding(content);
  if (!building || level < 1) return null;
  const { unitsPerLevel, goldPerUnit, tradesPerDay, moreTradesEvery, resources } = building.trade;
  const amount = unitsPerLevel * level;
  return { amount, gold: amount * goldPerUnit, perDay: tradesPerDay + Math.floor((level - 1) / moreTradesEvery), resources };
}

// The day of `now` on the quests' clock ("2026-10-26").
export const fireDay = (now, content) => questPeriod('daily', now, content).key;

// The trades made on the day of `now`: a count kept for an earlier day is
// none today.
export const fireTradesMade = ({ day, count }, now, content) => (day === fireDay(now, content) ? count : 0);

// Why a trade cannot be made now, or null: `made` is fireTradesMade.
export function fireTradeBlock({ level, gold, made, resource }, content) {
  const trade = fireTrade(level, content);
  if (!trade) return { code: 'not_built', message: `Najpierw zbuduj: ${fireBuilding(content)?.name ?? 'Ognisko'}.` };
  if (!trade.resources.includes(resource)) return { code: 'invalid_resource', message: 'Duch ognia nie wymienia złota na to.' };
  if (made >= trade.perDay) return { code: 'no_trades', message: 'Duch ognia nie przyjmie już dziś więcej złota. Wróć jutro.' };
  if (gold < trade.gold) return { code: 'not_enough', message: 'Brakuje złota na tę wymianę.' };
  return null;
}

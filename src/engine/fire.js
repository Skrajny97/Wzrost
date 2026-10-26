// The Ognisko's fire spirit (`trade` of the building in data/buildings.json):
// gold thrown into the fire comes back as wood, stone or iron ore, for
// goldPerUnit gold a piece, 1 gold less for every cheaperEvery levels of the
// building (the author: "rozwój Ogniska powinien zmniejszać koszt wymiany
// złota na zasoby zamiast maksymalną wymianę"). A day takes unitsPerDay
// pieces, moreUnits more for every moreUnitsEvery levels, in one trade or
// many: the slider picks how many (the author: "Limit wymian u ducha ognia
// ustal na jednostki, nie na liczby wymian, w związku z wprowadzeniem
// Suwaka"). Days follow the quests' clock (Polish time), so the pieces come
// back at midnight.

import { questPeriod } from './quests.js';

// The one building with a trade, if any.
export const fireBuilding = (content) => content.buildings.find((building) => building.trade) ?? null;

// The trade at the building's level: the gold a piece costs (`unitGold`)
// and the pieces a day takes in all (`perDay`); null before it is built.
export function fireTrade(level, content) {
  const building = fireBuilding(content);
  if (!building || level < 1) return null;
  const { goldPerUnit, cheaperEvery, unitsPerDay, moreUnits, moreUnitsEvery, resources } = building.trade;
  return {
    unitGold: Math.max(1, goldPerUnit - Math.floor(level / cheaperEvery)),
    perDay: unitsPerDay + moreUnits * Math.floor((level - 1) / moreUnitsEvery),
    resources,
  };
}

// The day of `now` on the quests' clock ("2026-10-26").
export const fireDay = (now, content) => questPeriod('daily', now, content).key;

// The pieces traded on the day of `now`: a count kept for an earlier day is
// none today.
export const fireUnitsMade = ({ day, units }, now, content) => (day === fireDay(now, content) ? units : 0);

// Why a trade of `amount` pieces cannot be made now, or null: `made` is
// fireUnitsMade.
export function fireTradeBlock({ level, gold, made, resource, amount }, content) {
  const trade = fireTrade(level, content);
  if (!trade) return { code: 'not_built', message: `Najpierw zbuduj: ${fireBuilding(content)?.name ?? 'Ognisko'}.` };
  if (!trade.resources.includes(resource)) return { code: 'invalid_resource', message: 'Duch ognia nie wymienia złota na to.' };
  const left = trade.perDay - made;
  if (left < 1) return { code: 'no_trades', message: 'Duch ognia nie przyjmie już dziś więcej złota. Wróć jutro.' };
  if (!Number.isInteger(amount) || amount < 1 || amount > left) {
    return { code: 'invalid_amount', message: `Duch ognia wymieni dziś od 1 do ${left} sztuk.` };
  }
  if (gold < amount * trade.unitGold) return { code: 'not_enough', message: 'Brakuje złota na tę wymianę.' };
  return null;
}

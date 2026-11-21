// Mana in a fight (21.11.2026; the author: „Powinien byc widoczny poziom
// many w walce”): the thin bar under a unit's HP in the playback (arena.js)
// and the line under a report's fight (screens/report.js). The fight keeps
// each unit's mana at its start in the unit's view and each change in the
// event that made it (src/engine/combat.js, combatantView); a fight kept
// before has neither, and plays without a bar.

import { formatNumber } from './format.js';
import { t } from './i18n.js';

// A unit's mana as the fight starts (never above its most), or null for one
// without a bar: a creature, a summon, any unit of a fight kept before.
/** @param {{ maxMana?: number, mana?: number }} unit */
export const manaStart = (unit) => (unit.maxMana > 0 ? Math.min(unit.maxMana, unit.mana ?? unit.maxMana) : null);

// What an event did to the units' mana: [unit id, its mana after the event]
// for each unit whose mana it changed (a skill paid, a mana potion drunk, a
// mana shield raised); none in a fight kept before.
/** @param {{ mana?: Record<string, number> }} event */
export const manaChanges = (event) => Object.entries(event.mana ?? {});

// The character's mana as the fight began and as it ended, under the fight
// of an exploration's report: „Mana: 1552 → 340”; null for a fight without
// it (a Wieża's, a report from before the mana went on from fight to fight).
/** @param {{ manaBefore?: number, manaAfter?: number } | null | undefined} fight */
export function fightManaLine(fight) {
  if (typeof fight?.manaBefore !== 'number' || typeof fight.manaAfter !== 'number') return null;
  return t('Mana: {before} → {after}', { before: formatNumber(fight.manaBefore), after: formatNumber(fight.manaAfter) });
}

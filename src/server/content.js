// Game content bundled into the Worker from data/ (validated against
// data/schemas before every deploy).

import { buildContent } from '../engine/index.js';
import affixes from '../../data/affixes.json' with { type: 'json' };
import balance from '../../data/balance.json' with { type: 'json' };
import classes from '../../data/classes.json' with { type: 'json' };
import effects from '../../data/effects.json' with { type: 'json' };
import elements from '../../data/elements.json' with { type: 'json' };
import itemBases from '../../data/item-bases.json' with { type: 'json' };
import monsters from '../../data/monsters.json' with { type: 'json' };
import rarities from '../../data/rarities.json' with { type: 'json' };
import regions from '../../data/regions.json' with { type: 'json' };
import slots from '../../data/slots.json' with { type: 'json' };
import stats from '../../data/stats.json' with { type: 'json' };
import texts from '../../data/texts.json' with { type: 'json' };
import unlocks from '../../data/unlocks.json' with { type: 'json' };

export const content = buildContent({
  stats,
  elements,
  effects,
  rarities,
  slots,
  classes,
  'item-bases': itemBases,
  affixes,
  monsters,
  regions,
  balance,
  texts,
  unlocks,
});

// What the page needs to label things; no balance numbers.
export function publicContent() {
  return {
    stats: content.stats.map(({ id, name, combat }) => ({ id, name, effect: combat })),
    classes: content.classes.map(({ id, name, role, gentleStart, description, position }) => ({
      id,
      name,
      role,
      gentleStart,
      description,
      position,
    })),
    elements: content.elements.map(({ id, name, color }) => ({ id, name, color })),
    slots: content.slots,
    rarities: content.rarities.map(({ id, name, color }) => ({ id, name, color })),
    regions: content.regions.map(({ id, land, name, minLevel, maxLevel, safe, description, trait }) => ({
      id,
      land,
      name,
      minLevel,
      maxLevel,
      safe,
      description,
      trait: { name: trait.name, description: trait.description },
    })),
    durations: { min: content.balance.hunt.minMinutes, step: content.balance.hunt.stepMinutes, max: content.balance.hunt.maxMinutes },
    unlocks: content.unlocks.map(({ id, name, level, condition }) => ({ id, name, level, condition })),
    freeResetMaxLevel: content.balance.progression.freeResetMaxLevel,
    classEvolutionLevel: content.balance.progression.classEvolutionLevel,
  };
}

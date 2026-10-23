// Game content bundled into the Worker from data/ (validated against
// data/schemas before every deploy).

import { areaUnlockLevel, buildContent } from '../engine/index.js';
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
import resources from '../../data/resources.json' with { type: 'json' };
import buildings from '../../data/buildings.json' with { type: 'json' };

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
  resources,
  buildings,
});

// What the page needs to label things; no balance numbers.
export function publicContent() {
  return {
    stats: content.stats.map(({ id, name, combat }) => ({ id, name, effect: combat })),
    classes: content.classes.map(({ id, name, role, start, description, position }) => ({
      id,
      name,
      role,
      start,
      description,
      position,
    })),
    elements: content.elements.map(({ id, name, color }) => ({ id, name, color })),
    slots: content.slots,
    rarities: content.rarities.map(({ id, name, color }) => ({ id, name, color })),
    regions: content.regions.map(({ id, land, name, minLevel, maxLevel, safe, description, trait, areas }) => ({
      id,
      land,
      name,
      minLevel,
      maxLevel,
      safe,
      description,
      trait: { name: trait.name, description: trait.description },
      areas: areas.map((area) => ({
        id: area.id,
        name: area.name,
        minLevel: area.minLevel,
        maxLevel: area.maxLevel,
        description: area.description,
        unlockClassLevel: areaUnlockLevel(area, content),
      })),
    })),
    durations: { min: content.balance.hunt.minMinutes, step: content.balance.hunt.stepMinutes, max: content.balance.hunt.maxMinutes },
    lengths: content.texts.lengths,
    unlocks: content.unlocks.map(({ id, name, level, condition }) => ({ id, name, level, condition })),
    resources: content.resources.map(({ id, name, description }) => ({ id, name, description })),
    buildings: content.buildings.map(({ id, name, description, maxLevel }) => ({ id, name, description, maxLevel })),
    freeResetMaxLevel: content.balance.progression.freeResetMaxLevel,
    classEvolutionLevel: content.balance.progression.classEvolutionLevel,
  };
}

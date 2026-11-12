// @ts-check
// The game engine: deterministic pure functions. State, time and the random
// seed always give the same result. No Date.now(), Math.random() or I/O here.

// Names of types more than one module gives its own (a loose shape of the
// game's data, mostly): the first module's here, so that the re-exports
// below name each once.
/** @typedef {import('./items.js').Affix} Affix */
/** @typedef {import('./combatant.js').Area} Area */
/** @typedef {import('./formulas.js').Balance} Balance */
/** @typedef {import('./workshop.js').Base} Base */
/** @typedef {import('./skills.js').Block} Block */
/** @typedef {import('./camp.js').Building} Building */
/** @typedef {import('./stats.js').Character} Character */
/** @typedef {import('./stats.js').Content} Content */
/** @typedef {import('./crafting.js').Counts} Counts */
/** @typedef {import('./towers.js').Encounter} Encounter */
/** @typedef {import('./pvp-arena.js').Fighter} Fighter */
/** @typedef {import('./hunt.js').Hunt} Hunt */
/** @typedef {import('./items.js').Item} Item */
/** @typedef {import('./fortress.js').Levels} Levels */
/** @typedef {import('./mining.js').Mineral} Mineral */
/** @typedef {import('./events.js').Option} Option */
/** @typedef {import('./quests.js').Period} Period */
/** @typedef {import('./items.js').Rng} Rng */
/** @typedef {import('./evolutions.js').Span} Span */
/** @typedef {import('./camp.js').Stored} Stored */
/** @typedef {import('./casino.js').Tier} Tier */

export { buildContent } from './content.js';
export { overlayKey, overlayTexts } from './overlay.js';
export { countEvents, createRng } from './rng.js';
export * from './formulas.js';
export * from './stats.js';
export * from './items.js';
export * from './progression.js';
export * from './combatant.js';
export { sharedBonus, simulateFight } from './combat.js';
export * from './hunt.js';
export * from './threat.js';
export * from './unlocks.js';
export * from './camp.js';
export * from './fortress.js';
export * from './fire.js';
export * from './shop.js';
export * from './exchange.js';
export * from './builder-spirit.js';
export * from './events.js';
export * from './crafting.js';
export * from './preview.js';
export * from './quests.js';
export * from './skills.js';
export * from './skill-demo.js';
export * from './notifications.js';
export * from './professions.js';
export * from './brewing.js';
export * from './potions.js';
export * from './workshop.js';
export * from './mining.js';
export * from './jewelcraft.js';
export * from './mail.js';
export * from './gifts.js';
export * from './encyclopedia.js';
export * from './evolutions.js';
export * from './gift-codes.js';
export * from './settlement.js';
export * from './brotherhood-rewards.js';
export * from './parties.js';
export * from './forge.js';
export * from './companions.js';
export * from './market.js';
export * from './stable.js';
export * from './casino.js';
export * from './tannery.js';
export * from './resident-gifts.js';
export * from './names.js';
export * from './mentions.js';
export * from './towers.js';
export * from './portals.js';
export * from './labyrinth.js';
export * from './core.js';
export * from './trial-hall.js';
export * from './pvp-arena.js';
export * from './guild-beast.js';
export * from './guild-trials.js';
export * from './guild-seat.js';
export * from './guild-expedition.js';
export * from './guild-wars.js';
export * from './cosmetics.js';
export * from './payments.js';
export * from './wanted.js';
export * from './mercenaries.js';
export * from './weeks.js';
export * from './fame.js';
export * from './account-chest.js';
export * from './party-events.js';

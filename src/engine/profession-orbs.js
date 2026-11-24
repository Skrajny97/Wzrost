// @ts-check
// Kulki Profesji over the scene of a work (data/orbs.json `professions`;
// DECISIONS.md, „Kulki Profesji (24.11.2026)”). The author: „Podczas
// Profesji niech latają osobne kulki z bonusami i zasobami jak podczas
// wyprawy”. While the character itself works in a profession (never its
// Awatar Systemu), now and then an orb of its own floats across the work's
// scene on the Profesje screen, and a tap catches it. They come as the
// Kulki Systemu do (orbMoments in orbs.js, by the same rules, from the
// work's seed and length), and what each gives comes from the seed and the
// orb's number, so a tap repeated never draws it anew. The work draws from
// its seed itself, the orbs from seeds of their own (`<seed>:orbs`,
// `<seed>:work-orb:<n>`), so no work brings other than it would. Their day
// has a limit of its own (perDay; orbsCaught and orbBlock in orbs.js).
// Never Punkty Systemu.

import { sownPlots } from './farming.js';
import { helpProfession } from './guild-help.js';
import { knownMinerals } from './mining.js';
import { orbMoments } from './orbs.js';
import { lateRewards } from './progression.js';
import { createRng } from './rng.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ id: string, weight: number }} WorkProduct A product a work's orb may give, with its weight. */
/**
 * @typedef {{ kind: 'resources', resource: string, amount: number }
 *   | { kind: 'product', product: string, store: string, amount: number }
 *   | { kind: 'xp', profession: string, minutes: number }
 *   | { kind: 'time', timePoints: number }} WorkOrbReward
 */

// Where a work's product goes, by the work's kind: the bag's herbs and
// potions (they take its places), the minerals, and the pantry's fish,
// crops and dishes.
/** @type {Record<string, string>} */
export const WORK_ORB_STORES = { herbs: 'herbs', potions: 'potions', minerals: 'minerals', fish: 'pantry', crops: 'pantry', dishes: 'pantry' };

// When the orbs of a work come, in server time, by their numbers: as the
// Kulki Systemu of an exploration as long (orbMoments), over the time from
// its start to its end.
/**
 * @param {{ seed: string, minutes: number, startedAt: number, endsAt: number }} work
 * @param {Content} content
 * @returns {number[]}
 */
export const workOrbTimes = ({ seed, minutes, startedAt, endsAt }, content) =>
  orbMoments(seed, minutes, endsAt - startedAt, content).map((offset) => startedAt + offset);

// What of its own product a work's orb may give, each with its weight: the
// herbs of a gathering, the fish of a fishing and the crops sown on a
// farming, each as often as it comes in the work (perHour); the minerals
// Górnictwo at `level` has revealed, so too; the potion of a brewing, the
// dish of a cooking. None for the Warsztat's and the Szlifiernia's works,
// whose pieces are items.
/**
 * @param {{ kind: string, options: Record<string, any>, level: number }} work
 * @param {Content} content
 * @returns {WorkProduct[]}
 */
export function workOrbProducts({ kind, options, level }, content) {
  /**
   * @param {unknown[]} ids
   * @param {Record<string, { perHour: number }>} byId
   */
  const listed = (ids, byId) =>
    /** @type {string[]} */ ([...new Set(ids)].filter((id) => typeof id === 'string' && Object.hasOwn(byId, id))).map((id) => ({ id, weight: byId[id].perHour }));
  if (kind === 'herbs') return listed(options.herbs ?? [], content.herbsById);
  if (kind === 'fish') return listed(options.fish ?? [], content.fishById);
  if (kind === 'crops') return listed(sownPlots(options.plots ?? []), content.cropsById);
  if (kind === 'minerals') return knownMinerals(level, content).map((/** @type {{ id: string, perHour: number }} */ mineral) => ({ id: mineral.id, weight: mineral.perHour }));
  if ((kind === 'potions' && content.potionsById[options.recipe]) || (kind === 'dishes' && content.dishesById[options.recipe])) return [{ id: options.recipe, weight: 1 }];
  return [];
}

// What orb `index` of the work of `seed` (an activity of `kind`) gives a
// character of `level` and `classLevel`, as it began the work, with the
// work's `products` (workOrbProducts). By the weights of `kinds`: camp
// resources, one of them, from resourceShare[0] to resourceShare[1] of a
// find's (rewards.findResourcePerLevel × level; a find gives as many
// resources as gold, so this is what a Kulka Systemu gives in gold), from
// the late class levels on a part of it, as that gold (lateRewards); from
// `products` of the profession's range a few, drawn by their weights, for a
// profession with one (its weight going to the resources where there is
// none); the profession's XP of xpMinutes of its work; or Punkty Czasu, as
// a Kulka Systemu's (timePoints). Never Punkty Systemu.
/**
 * @param {{ seed: string, index: number, kind: string, level: number, classLevel?: number, products: WorkProduct[] }} orb
 * @param {Content} content
 * @returns {WorkOrbReward}
 */
export function workOrbReward({ seed, index, kind, level, classLevel = 0, products }, content) {
  const rules = content.orbs.professions;
  const rng = createRng(`${seed}:work-orb:${index}`);
  const profession = helpProfession(kind, content);
  /** @type {[number, number] | undefined} */
  const range = profession ? rules.products[profession.id] : undefined;
  const product = range && products.length > 0 ? rules.kinds.product : 0;
  const kinds = [
    { kind: 'resources', weight: rules.kinds.resources + rules.kinds.product - product },
    { kind: 'product', weight: product },
    { kind: 'xp', weight: profession ? rules.kinds.xp : 0 },
    { kind: 'time', weight: rules.kinds.time },
  ].filter((entry) => entry.weight > 0);
  const drawn = rng.weighted(kinds).kind;
  if (drawn === 'time') return { kind: 'time', timePoints: rng.int(content.orbs.timePoints[0], content.orbs.timePoints[1]) };
  if (drawn === 'xp' && profession) return { kind: 'xp', profession: profession.id, minutes: rules.xpMinutes };
  if (drawn === 'product' && range) {
    const { id } = rng.weighted(products);
    return { kind: 'product', product: id, store: WORK_ORB_STORES[kind], amount: rng.int(range[0], range[1]) };
  }
  const { id: resource } = rng.pick(content.resources);
  const [low, high] = rules.resourceShare;
  return {
    kind: 'resources',
    resource,
    amount: Math.max(1, Math.round(content.balance.rewards.findResourcePerLevel * level * rng.float(low, high) * lateRewards(classLevel, content))),
  };
}

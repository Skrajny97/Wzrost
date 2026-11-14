// @ts-check
// The Rdzeń and its Artefakty (data/labyrinth.json, core; DECISIONS.md,
// "Labirynt Systemu i Rdzeń", 858–865). The Rdzeń opens once the character
// beats its first guardian of the Labirynt Systemu (labyrinth.js). It has
// floor(level / sockets.per) sockets, at least sockets.least (858 v2 A): a
// small Artefakt takes one socket and has one trait, a medium one two
// sockets and two traits, a large one three sockets, two traits and an
// ability. Each Artefakt has one of the game's eight elements, and its
// traits fit the element and help every class (860 A): fire raises the
// damage, earth the armour, nature the HP, water the healing after a fight
// of an exploration, and so on (core.elements). A trait's number is its
// value (for one socket's worth of a common Artefakt) times the rarity's
// budget (rarities.json), the size's traitFactor, 1 + upgrade.bonus for
// each level of upgrade (862 A: +10% a level, up to +10, no failure; the
// cost of each level grows) and 1 + the setBonus of the gem set in the
// Rdzeń (863 A), so an Artefakt never ages with the character's level. Two,
// four and six absorbed Artefakty of one element give a growing bonus of
// that element (861 A, the resonance). Absorbed Artefakty feed the
// character's `core` stat source (stats.js) and its fights (combatant.js,
// combat.js), never a companion's. An Artefakt absorbed stays until it is
// dissolved (859 A: half of the Odłamki spent on upgrading it come back);
// one kept in the Skrytka can be broken into Odłamki instead. The
// Artefakty and the Odłamki are bound to the character (865 A). Pure: the
// server keeps them and gives the seeds.

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {import('./rng.js').Rng} Rng */
/**
 * An Artefakt as the character keeps it: its element, size and rarity, the
 * ids of its traits and of its ability (a large one), its level of upgrade
 * and the Odłamki spent on it. Its numbers come from the data.
 * @typedef {{ id?: number, element: string, size: string, rarity: string, traits: string[], ability?: string | null, upgrade?: number, spent?: number }} Artifact
 */
/**
 * The Rdzeń as the character keeps it: open or not, the Odłamki, the gem
 * set in it and the Artefakty absorbed.
 * @typedef {{ open?: boolean, shards?: number, gem?: string | null, absorbed?: Artifact[] }} Core
 */
/**
 * What a Rdzeń gives, all together: shares of stats (the `core` source),
 * the bonuses of the fights and the abilities of its large Artefakty.
 * @typedef {{
 *   stats: Record<string, number>,
 *   damage: number, armor: number, hp: number, recovery: number, resist: number, dodge: number,
 *   will: number, speed: number, crit: number, lifesteal: number, mana: number,
 *   abilities: Record<string, number>,
 * }} CoreEffects
 */

/** @param {Content} content */
const rules = (content) => content.labyrinth.core;

// The kinds of the traits that are a fight's bonus, each a share of the
// number it raises (lifesteal: of the damage dealt; recovery: of the HP
// missing after a won fight).
const BONUS_KINDS = /** @type {const} */ (['damage', 'armor', 'hp', 'recovery', 'resist', 'dodge', 'will', 'speed', 'crit', 'lifesteal', 'mana']);

/** @returns {CoreEffects} */
const noEffects = () => ({
  stats: {},
  damage: 0,
  armor: 0,
  hp: 0,
  recovery: 0,
  resist: 0,
  dodge: 0,
  will: 0,
  speed: 0,
  crit: 0,
  lifesteal: 0,
  mana: 0,
  abilities: {},
});

// The sockets of a Rdzeń at a character level (858 v2 A).
/**
 * @param {number} level
 * @param {Content} content
 * @returns {number}
 */
export function coreSockets(level, content) {
  const { per, least } = rules(content).sockets;
  return Math.max(least, Math.floor(level / per));
}

/**
 * @param {string} id
 * @param {Content} content
 * @returns {Record<string, any>}
 */
export const artifactSize = (id, content) => rules(content).sizes.find((/** @type {{ id: string }} */ size) => size.id === id) ?? rules(content).sizes[0];

/**
 * @param {string} id
 * @param {Content} content
 * @returns {Record<string, any> | undefined}
 */
const traitOf = (id, content) => rules(content).traits.find((/** @type {{ id: string }} */ trait) => trait.id === id);

/**
 * @param {string} id
 * @param {Content} content
 * @returns {Record<string, any> | undefined}
 */
const abilityOf = (id, content) => rules(content).abilities.find((/** @type {{ id: string }} */ ability) => ability.id === id);

/**
 * @param {string} id
 * @param {Content} content
 * @returns {Record<string, any> | undefined}
 */
const elementOf = (id, content) => rules(content).elements.find((/** @type {{ id: string }} */ element) => element.id === id);

// The sockets the Artefakty take.
/**
 * @param {Artifact[]} artifacts
 * @param {Content} content
 * @returns {number}
 */
export const socketsTaken = (artifacts, content) => artifacts.reduce((sum, artifact) => sum + artifactSize(artifact.size, content).sockets, 0);

// The sockets still free in a Rdzeń at a character level.
/**
 * @param {Core | null | undefined} core
 * @param {number} level
 * @param {Content} content
 * @returns {number}
 */
export const freeSockets = (core, level, content) => coreSockets(level, content) - socketsTaken(core?.absorbed ?? [], content);

// The rarity of an Artefakt from weights by rarity id (a level of the
// Labirynt, levels[].artifact).
/**
 * @param {Record<string, number>} weights
 * @param {Rng} rng
 * @returns {string}
 */
export const artifactRarity = (weights, rng) => rng.weighted(Object.entries(weights), ([, weight]) => weight)[0];

// A new Artefakt: its rarity drawn by `weights`, its size by the sizes'
// weights, its element any of the eight alike, its traits those of its
// element (a small one one of them), and a large one's ability.
/**
 * @param {Record<string, number>} weights
 * @param {Rng} rng
 * @param {Content} content
 * @returns {Artifact}
 */
export function makeArtifact(weights, rng, content) {
  const rarity = artifactRarity(weights, rng);
  /** @type {Record<string, any>[]} */
  const sizes = rules(content).sizes;
  /** @type {Record<string, any>[]} */
  const elements = rules(content).elements;
  const size = rng.weighted(sizes, (one) => one.weight);
  const element = rng.pick(elements);
  /** @type {string[]} */
  const pool = [...element.traits];
  /** @type {string[]} */
  const traits = [];
  while (traits.length < size.traits && pool.length > 0) traits.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  const ability = size.ability ? rng.pick(rules(content).abilities).id : null;
  return { element: element.id, size: size.id, rarity, traits, ability, upgrade: 0, spent: 0 };
}

// The gem's share more of every number of the absorbed Artefakty (863 A),
// none without one or with a gem the game no longer has.
/**
 * @param {string | null | undefined} gemId
 * @param {Content} content
 * @returns {number}
 */
export const coreGemBonus = (gemId, content) => (gemId ? (content.mineralsById[gemId]?.setBonus ?? 0) : 0);

// The factor of an Artefakt's numbers: its rarity's budget, its upgrade and
// the gem's bonus.
/**
 * @param {Artifact} artifact
 * @param {number} gemBonus
 * @param {Content} content
 * @returns {number}
 */
function artifactFactor(artifact, gemBonus, content) {
  const budget = content.raritiesById[artifact.rarity]?.budget ?? 1;
  return budget * (1 + rules(content).upgrade.bonus * (artifact.upgrade ?? 0)) * (1 + gemBonus);
}

// A trait's number on an Artefakt, as a share (0.05 for +5%).
/**
 * @param {Artifact} artifact
 * @param {string} traitId
 * @param {number} gemBonus
 * @param {Content} content
 * @returns {number}
 */
export function traitValue(artifact, traitId, gemBonus, content) {
  const trait = traitOf(traitId, content);
  if (!trait) return 0;
  return trait.value * artifactSize(artifact.size, content).traitFactor * artifactFactor(artifact, gemBonus, content);
}

// The number of a large Artefakt's ability (a share of the maximum HP),
// or 0 for one without a number: as a trait's, but with the square root
// of the rarity's budget, so a boski one at +10 with a diamond heals or
// shields about a quarter of the HP, not a half.
/**
 * @param {Artifact} artifact
 * @param {number} gemBonus
 * @param {Content} content
 * @returns {number}
 */
export function abilityValue(artifact, gemBonus, content) {
  const ability = artifact.ability ? abilityOf(artifact.ability, content) : null;
  if (!ability?.value) return 0;
  const budget = content.raritiesById[artifact.rarity]?.budget ?? 1;
  return (ability.value * artifactFactor(artifact, gemBonus, content) * Math.sqrt(budget)) / budget;
}

// The resonance of the absorbed Artefakty (861 A): for every element with
// at least the first count of them, its tier (1–3), the trait it raises
// and by how much.
/**
 * @param {Artifact[]} absorbed
 * @param {Content} content
 * @returns {{ element: string, count: number, tier: number, next: number | null, trait: string, value: number }[]}
 */
export function coreResonance(absorbed, content) {
  /** @type {number[]} */
  const counts = rules(content).resonance.counts;
  return rules(content).elements.map((/** @type {Record<string, any>} */ element) => {
    const count = absorbed.filter((artifact) => artifact.element === element.id).length;
    const tier = counts.filter((needed) => count >= needed).length;
    return {
      element: element.id,
      count,
      tier,
      next: counts.find((needed) => count < needed) ?? null,
      trait: element.resonance.trait,
      value: tier > 0 ? element.resonance.values[tier - 1] : 0,
    };
  });
}

// Everything a Rdzeń gives (CoreEffects): each absorbed Artefakt's traits
// and ability with the gem's bonus, and the resonance of its elements. A
// stat trait of the class's main stat ("main") goes to the class's biggest
// share of autoPoints. Null for a Rdzeń without Artefakty.
/**
 * @param {Core | null | undefined} core
 * @param {string} classId
 * @param {Content} content
 * @returns {CoreEffects | null}
 */
export function coreEffects(core, classId, content) {
  const absorbed = core?.absorbed ?? [];
  if (absorbed.length === 0 || !content.labyrinth) return null;
  const gem = coreGemBonus(core?.gem, content);
  const effects = noEffects();
  /** @type {Record<string, number>} */
  const autoPoints = content.classesById[classId]?.autoPoints ?? {};
  const main = Object.entries(autoPoints).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'vitality';
  /**
   * @param {string} traitId
   * @param {number} value
   */
  const add = (traitId, value) => {
    const trait = traitOf(traitId, content);
    if (!trait || !value) return;
    if (trait.kind === 'stat') {
      const stat = trait.stat === 'main' ? main : trait.stat;
      effects.stats[stat] = (effects.stats[stat] ?? 0) + value;
    } else if (/** @type {readonly string[]} */ (BONUS_KINDS).includes(trait.kind)) {
      const kind = /** @type {typeof BONUS_KINDS[number]} */ (trait.kind);
      effects[kind] += value;
    }
  };
  for (const artifact of absorbed) {
    for (const traitId of artifact.traits) add(traitId, traitValue(artifact, traitId, gem, content));
    if (artifact.ability && abilityOf(artifact.ability, content)) {
      const value = abilityValue(artifact, gem, content);
      effects.abilities[artifact.ability] = (effects.abilities[artifact.ability] ?? 0) + (value || 1);
    }
  }
  for (const resonance of coreResonance(absorbed, content)) if (resonance.tier > 0) add(resonance.trait, resonance.value);
  return effects;
}

// The Odłamki the next level of upgrade costs (862 A), or null at the top.
/**
 * @param {Artifact} artifact
 * @param {Content} content
 * @returns {number | null}
 */
export function artifactUpgradeCost(artifact, content) {
  const { max, costs } = rules(content).upgrade;
  const level = artifact.upgrade ?? 0;
  if (level >= max) return null;
  return costs[level] * artifactSize(artifact.size, content).upgradeCost;
}

// The Artefakt one level of upgrade higher, with the Odłamki spent on it.
/**
 * @param {Artifact} artifact
 * @param {Content} content
 * @returns {Artifact}
 */
export function upgradedArtifact(artifact, content) {
  const cost = artifactUpgradeCost(artifact, content);
  if (cost === null) return artifact;
  return { ...artifact, upgrade: (artifact.upgrade ?? 0) + 1, spent: (artifact.spent ?? 0) + cost };
}

// The Odłamki an absorbed Artefakt gives back when dissolved (859 A): half
// of those spent on upgrading it, rounded down.
/**
 * @param {Artifact} artifact
 * @param {Content} content
 * @returns {number}
 */
export const dissolveShards = (artifact, content) => Math.floor((artifact.spent ?? 0) * rules(content).dissolveRefund);

// The Odłamki a stored Artefakt breaks into: its rarity's number for each
// of its sockets, and, as a dissolved one, half of those spent on it.
/**
 * @param {Artifact} artifact
 * @param {Content} content
 * @returns {number}
 */
export function breakShards(artifact, content) {
  const each = rules(content).break[artifact.rarity] ?? 1;
  return each * artifactSize(artifact.size, content).sockets + dissolveShards(artifact, content);
}

// Whether an Artefakt kept by a character is one the game knows (its
// element, size, rarity and traits in the data), so a row from a day the
// data had others does nothing.
/**
 * @param {unknown} artifact
 * @param {Content} content
 * @returns {artifact is Artifact}
 */
export function knownArtifact(artifact, content) {
  if (!artifact || typeof artifact !== 'object') return false;
  const one = /** @type {Record<string, any>} */ (artifact);
  return (
    Boolean(elementOf(one.element, content)) &&
    rules(content).sizes.some((/** @type {{ id: string }} */ size) => size.id === one.size) &&
    Boolean(content.raritiesById[one.rarity]) &&
    Array.isArray(one.traits) &&
    one.traits.every((/** @type {string} */ id) => Boolean(traitOf(id, content)))
  );
}

// A share as the page shows it: "0,15", "0,20", "1,5" or "12" (percent), in the
// content's language.
/**
 * @param {number} share
 * @param {Content} content
 * @returns {string}
 */
function percent(share, content) {
  const value = share * 100;
  // Below 1% two decimals, so an upgrade of a small number shows (the
  // author, 14.11.2026, of a Mały Artefakt trucizny +4: „ulepszone na +4 a
  // nic sie nie zmienilo - nie powinno tak byc”; its 0,16% and 0,22% both
  // read 0,2%).
  const text = value >= 10 ? String(Math.round(value)) : value >= 1 ? String(Math.round(value * 10) / 10) : value.toFixed(2);
  return content.language === 'en' ? text : text.replace('.', ',');
}

// A trait's line with its number: "+2,4% obrażeń".
/**
 * @param {string} traitId
 * @param {number} value
 * @param {Content} content
 * @returns {string}
 */
export function traitText(traitId, value, content) {
  const trait = traitOf(traitId, content);
  return trait ? trait.text.replace('{value}', percent(value, content)) : '';
}

// An Artefakt's name: its size and its element's ("Mały Artefakt ognia").
/**
 * @param {Artifact} artifact
 * @param {Content} content
 * @returns {string}
 */
export function artifactName(artifact, content) {
  const texts = rules(content).texts;
  return texts.name[0].replace('{size}', artifactSize(artifact.size, content).name).replace('{name}', elementOf(artifact.element, content)?.name ?? '');
}

// An Artefakt as the page shows it: its name, element with its colour,
// size and sockets, rarity with its colour, its traits and ability with
// their numbers (with the gem of the Rdzeń: `gemBonus`), its upgrade, the
// Odłamki its next level costs, and what breaking and dissolving it give.
/**
 * @param {Artifact} artifact
 * @param {Content} content
 * @param {number} [gemBonus]
 */
export function artifactView(artifact, content, gemBonus = 0) {
  const size = artifactSize(artifact.size, content);
  const rarity = content.raritiesById[artifact.rarity];
  const element = content.elementsById[artifact.element];
  const ability = artifact.ability ? abilityOf(artifact.ability, content) : null;
  const value = ability ? abilityValue(artifact, gemBonus, content) : 0;
  return {
    id: artifact.id ?? null,
    name: artifactName(artifact, content),
    element: artifact.element,
    elementName: element?.name ?? artifact.element,
    color: element?.color ?? '#cccccc',
    size: size.id,
    sizeName: size.name,
    sockets: size.sockets,
    rarity: artifact.rarity,
    rarityName: rarity?.forms?.m ?? rarity?.name ?? artifact.rarity,
    rarityColor: rarity?.color ?? '#9b9b9b',
    traits: artifact.traits.map((id) => ({ id, name: traitOf(id, content)?.name ?? id, text: traitText(id, traitValue(artifact, id, gemBonus, content), content) })),
    ability: ability
      ? {
          id: ability.id,
          name: ability.name,
          text: ability.text.replace('{value}', percent(value, content)).replace('{below}', percent(ability.below ?? 0, content)),
        }
      : null,
    upgrade: artifact.upgrade ?? 0,
    maxUpgrade: rules(content).upgrade.max,
    nextCost: artifactUpgradeCost(artifact, content),
    breakShards: breakShards(artifact, content),
    dissolveShards: dissolveShards(artifact, content),
  };
}

// The resonance of the absorbed Artefakty as the page shows it: each
// element with any, its count, the next count and the bonus of its tier.
/**
 * @param {Artifact[]} absorbed
 * @param {Content} content
 */
export function resonanceView(absorbed, content) {
  const texts = rules(content).texts;
  const tiers = ['I', 'II', 'III'];
  return coreResonance(absorbed, content)
    .filter((one) => one.count > 0)
    .map((one) => ({
      element: one.element,
      elementName: content.elementsById[one.element]?.name ?? one.element,
      color: content.elementsById[one.element]?.color ?? '#cccccc',
      count: one.count,
      tier: one.tier,
      next: one.next,
      text: one.tier > 0 ? texts.resonance[0].replace('{tier}', tiers[one.tier - 1]).replace('{bonus}', traitText(one.trait, one.value, content)) : null,
      nextText: one.next !== null ? traitText(one.trait, elementOf(one.element, content)?.resonance.values[one.tier] ?? 0, content) : null,
    }));
}

// What the whole Rdzeń gives, line by line, as the page sums it up: the
// stats' shares, the fights' bonuses and the abilities, each once.
/**
 * @param {CoreEffects | null} effects
 * @param {Content} content
 * @returns {string[]}
 */
export function coreEffectLines(effects, content) {
  if (!effects) return [];
  /** @type {string[]} */
  const lines = [];
  // A stat with no trait of its own is the class's main one: its trait's
  // words with the stat's name.
  const main = rules(content).traits.find((/** @type {Record<string, any>} */ one) => one.kind === 'stat' && one.stat === 'main');
  for (const [stat, value] of Object.entries(effects.stats)) {
    const trait = rules(content).traits.find((/** @type {Record<string, any>} */ one) => one.kind === 'stat' && one.stat === stat);
    const name = content.statsById[stat]?.name ?? stat;
    lines.push(trait ? traitText(trait.id, value, content) : main ? `${traitText(main.id, value, content)} (${name})` : `+${percent(value, content)}% ${name}`);
  }
  for (const kind of BONUS_KINDS) {
    const value = effects[kind];
    if (!value) continue;
    const trait = rules(content).traits.find((/** @type {Record<string, any>} */ one) => one.kind === kind);
    if (trait) lines.push(traitText(trait.id, value, content));
  }
  for (const [id, value] of Object.entries(effects.abilities)) {
    const ability = abilityOf(id, content);
    if (ability) lines.push(`${ability.name}: ${ability.text.replace('{value}', percent(value, content)).replace('{below}', percent(ability.below ?? 0, content))}`);
  }
  return lines;
}

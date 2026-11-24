// @ts-check
// Threat level shown before an exploration, from the inner region, its length,
// current HP and the party. Sample fights against every kind of encounter of
// the inner region (regular, demanding, the elite and, where it lives, the
// champion) show how much HP each kind
// costs. They use the same combatant as the exploration itself (stats,
// equipment, and later skills and companions), so the rating follows the whole
// character, not its level alone. The chance of fainting then follows from how
// likely each HP level is before every next fight, with the odds of each kind
// for that length and the rest after each won fight, as in a real
// exploration. HP is counted in steps of 4% of the maximum. Healing potions
// taken along (potions.js) count too: one a fight, drunk when HP falls below
// the player's mark. Speed potions only make the fights easier, so the
// estimate leaves them out and stays on the safe side. The sample fights
// start with full mana, though on the way the mana goes on from fight to
// fight (1220 B): alone, without companions, a realistic character of
// levels 10–25 fainted at most 1.5 points more often so, with mana
// potions or without, so they leave the mana and its potions out.
// With companions that alone is far too low: their HP goes from fight to
// fight as the character's and some of them fall, and once they are down
// the creatures turn on the character (19.11.2026: a realistic player of
// level 100 with two companions was shown 1.8% where one 4-hour exploration
// in five ended in a faint). So a build with companions also goes on
// explorations of 1, 2 and 4 hours (THREAT_TRIP_MINUTES), fight after fight
// as simulateHunt fights them, everyone's HP carried on and the fallen out,
// the character's mana too, with the mana potions taken along (tripFaints):
// the share of them fainted within each number of fights is
// the chance for an exploration of that many fights at that pace, and the
// sample fights' recursion only moves it by what changes from there to the
// exploration asked for (its own pace, the HP it starts with, the elite and
// the champion sought or avoided).
// A Drużyna's trip counts the whole party as it would go (gracz (poz. 95),
// 24.11.2026: „żeby system przeliczał ryzyko wyprawy dla drużyny razem z
// innymi graczami w drużynie”): the other players (`partners`) fight beside
// the character in every sample fight and every trip of tripFaints, with
// the HP they set out with, their own healing and mana potions and their
// mana, and, as on a trip, rest after each won fight and fight on after a
// fall; the creatures grow for them as on the trip (exploreStrength's
// players, by the highest class level among them), and the trip goes
// without companions.

import { exploreStrength, fightingClassLevel, playerCombatant } from './combatant.js';
import { simulateFight } from './combat.js';
import { companionCombatant } from './companions.js';
import {
  championEncounter,
  eliteEncounter,
  encounterCombatants,
  encountersFor,
  explorationPace,
  regularEncounter,
  restedMana,
  rollEncounter,
  toughEncountersFor,
  withRareOdds,
} from './hunt.js';
import { carryLimit, fightPotions } from './potions.js';
import { createRng } from './rng.js';
import { durationsUpTo } from './unlocks.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {import('./rng.js').Rng} Rng */
/**
 * @typedef {{ build: () => any, weight: number, counts: number[], fought: number, lost: number, worst: number }} SampleKind
 *   One kind of encounter and its sample fights.
 */
/**
 * @typedef {{ minutes: number, by: number[], count: number, paths: string[], faints: boolean[] }} ThreatTrips
 *   Explorations of `minutes` with the companions (tripFaints): `by[n]`, the
 *   share of the `count` of them fainted within their first n fights; each
 *   one's kinds of encounter (`paths`) and whether it ended in a faint.
 */
/**
 * @typedef {{ maxHp: number, recovery: number, potionBonus?: number, regular: number[], tough: number[] | null, elite: number[], champion: number[] | null, safe: boolean, trips?: ThreatTrips[] | null }} ThreatSamples
 *   The sample fights of a build, mixed by kind (threatSamples), and with
 *   companions its explorations of each THREAT_TRIP_MINUTES (tripFaints).
 */
/**
 * @typedef {{ character: Record<string, any>, equipped: Record<string, any>[], name?: string, hpShare?: number, potions?: Record<string, number>, healBelow?: number }} Partner
 *   Another player of a Drużyna's trip, as it would set out: its character,
 *   its gear, its HP as a share of its most (full without one), and the
 *   healing and mana potions it takes along, with its healing mark.
 */
/**
 * @typedef {{ count: number, amount: number, below: number, amounts?: number[], potions?: Record<string, number> }} Healing
 *   The healing potions taken along: how many, their strengths (strongest
 *   first) and the mark below which one is drunk; `potions` by id, the
 *   mana potions taken along too, for the explorations of tripFaints.
 */
/**
 * @typedef {{ character: Record<string, any>, equipped: Record<string, any>[], hp: number, areaId: string, avoidRare?: boolean, seekRare?: boolean,
 *   catchUp?: any, healing?: Healing | null, hard?: boolean | 'hell' }} ThreatInput
 */

// Sample fights per kind of encounter: each encounter of the inner region and the
// elite. Kinds whose outcome is in doubt (some fights lost, or a close one)
// then share more fights, in proportion to how often they are met, so one
// unlucky fight decides less. A character that loses 15% or more of the
// regular fights is in very high danger on any exploration, so more fights
// would change nothing. The elite is met in at most one exploration in nine
// and its fights are long, so it keeps the first few, as does the champion.
const SAMPLES = 3;
/** @type {Record<string, number>} */
const MORE_SAMPLES = { regular: 27, tough: 18, elite: 0, champion: 0 };
const STEPS = 25;
const LOST = STEPS + 1;
export const THREAT_LEVELS = ['low', 'moderate', 'high', 'very-high'];
// Highest chance of fainting for "low", "moderate" and "high".
const LIMITS = [0.01, 0.05, 0.15];
// Explorations a build with companions goes on (tripFaints): of each length
// of THREAT_TRIP_MINUTES (those up to the longest), THREAT_TRIPS of them.
// Each length asked for takes the longest of them it reaches (the shorter
// ones the first), whose pace is nearest its own; with 100 a chance of one
// in five comes out within about four points, one in twenty within two.
export const THREAT_TRIPS = 100;
export const THREAT_TRIP_MINUTES = [60, 120, 240];

// One kind of encounter: how many of its sample fights cost each amount of HP,
// in steps, and how many were lost (the last bin).
/**
 * @param {() => any} build
 * @param {number} weight
 * @returns {SampleKind}
 */
const sampleKind = (build, weight) => ({ build, weight, counts: new Array(LOST + 1).fill(0), fought: 0, lost: 0, worst: 0 });

// A fight that drags on ends the exploration without fainting, so it is left out.
/**
 * @param {SampleKind} kind
 * @param {number} times
 * @param {Record<string, any>} player
 * @param {Rng} rng
 * @param {Content} content
 * @param {Record<string, any>} area
 * @param {Record<string, any>[]} [mates] The other players of a Drużyna's trip first, then the companions.
 * @param {number[]} [strength]
 * @param {number} [classLevel] Of those who fight, for the myth game (monsterCombatant).
 * @param {number} [players] The Drużyna's players who fight, 1 alone (partyStrength).
 */
function fightSamples(kind, times, player, rng, content, area, mates = [], strength = [1, 1], classLevel = 0, players = 1) {
  for (let i = 0; i < times; i++) {
    const fight = simulateFight({ allies: [{ ...player }, ...mates.map((mate) => ({ ...mate }))], enemies: encounterCombatants(kind.build(), content, { strength, classLevel, players }), rng, content, trait: area.trait });
    if (fight.won === null) continue;
    kind.fought += 1;
    if (!fight.won) {
      kind.counts[LOST] += 1;
      kind.lost += 1;
      continue;
    }
    // The player always fights.
    const left = /** @type {{ hp: number }} */ (fight.units.find((/** @type {{ id: string }} */ unit) => unit.id === player.id)).hp;
    const steps = Math.round(((player.maxHp - left) / player.maxHp) * STEPS);
    kind.counts[steps] += 1;
    kind.worst = Math.max(kind.worst, steps);
  }
}

/** @param {SampleKind} kind */
const inDoubt = (kind) => kind.lost < kind.fought && (kind.lost > 0 || kind.worst >= STEPS * 0.6);

// Weighted mix of the kinds' shares of fights, by HP lost in steps.
/**
 * @param {SampleKind[]} kinds
 * @returns {number[]}
 */
function mix(kinds) {
  const total = kinds.reduce((sum, kind) => sum + kind.weight, 0);
  /** @type {number[]} */
  const shares = new Array(LOST + 1).fill(0);
  for (const kind of kinds) {
    if (kind.fought === 0) continue;
    for (let steps = 0; steps <= LOST; steps++) shares[steps] += (kind.counts[steps] / kind.fought) * (kind.weight / total);
  }
  return shares;
}

// Explorations of `minutes` (THREAT_TRIPS of them) from full HP and mana,
// each fight as simulateHunt fights it: the encounter drawn by its odds
// (rollEncounter), the character with the potions it took along (one of a
// kind a fight: healing below its mark, mana when short of it) and the
// mana the last fight left it (1220 B), and every companion still standing
// with the HP the last fight left it and full mana; a lost fight ends it
// in a faint (a retreat from the elite or the champion of a safe place), a
// drawn one in a return, and after each won fight everyone standing rests
// as on the way, the character's mana too (restedMana). Returns
// the share fainted within each number of fights, and each exploration's
// kinds of encounter in order (`paths`: c champion, e elite, t demanding, r
// regular) with whether it ended in a faint (`faints`), so other odds of
// those kinds weigh the same explorations (tripShare).
/**
 * @param {{ minutes: number, character: Record<string, any>, area: Record<string, any>, player: Record<string, any>, mates: Record<string, any>[], partners?: { unit: Record<string, any>, hpShare: number, potions: Record<string, number>, healBelow: number }[], strength: [number, number], classLevel: number, players?: number, potions: Record<string, number>, healBelow: number }} trip
 * @param {Content} content
 * @returns {ThreatTrips}
 */
function tripFaints({ minutes, character, area, player, mates, partners = [], strength, classLevel, players = 1, potions, healBelow }, content) {
  const pace = explorationPace(minutes, content, character.level);
  const rng = createRng(`threat-trips:${area.id}:${character.level}:${minutes}`);
  const fainted = new Array(pace.fights + 1).fill(0);
  /** @type {string[]} */
  const paths = [];
  /** @type {boolean[]} */
  const faints = [];
  /** @param {Record<string, any>} unit @param {number} hp */
  const rested = (unit, hp) => hp + Math.round((unit.maxHp - hp) * Math.min(1, unit.recovery + pace.restBonus));
  // The other players' potions for a trip of these minutes: of each at most
  // one a fight (carryLimit), as a member takes them along (parties.js).
  const carried = partners.map((one) =>
    Object.fromEntries(
      Object.entries(one.potions)
        .filter(([id, count]) => content.potionsById[id] && count > 0)
        .map(([id, count]) => [id, Math.min(count, carryLimit(content.potionsById[id], pace.fights))]),
    ),
  );
  for (let trip = 0; trip < THREAT_TRIPS; trip++) {
    let hp = player.maxHp;
    const mateHp = mates.map((mate) => mate.maxHp);
    // The other players of a Drużyna's trip: the HP each sets out with,
    // its mana (full: null) and its potions, as the character's.
    const partnerHp = partners.map((one) => Math.max(1, Math.round(one.unit.maxHp * one.hpShare)));
    /** @type {(number | null)[]} */
    const partnerMana = partners.map(() => null);
    const partnerLeft = carried.map((kept) => ({ ...kept }));
    // The character's mana, full as it sets out (null), then what each
    // fight leaves it.
    /** @type {number | null} */
    let mana = null;
    /** @type {Record<string, number>} */
    const left = { ...potions };
    let path = '';
    let faint = false;
    for (let fight = 0; fight < pace.fights; fight++) {
      const encounter = /** @type {Record<string, any>} */ (rollEncounter(area, rng, content, character.level, pace));
      path += encounter.champion ? 'c' : encounter.elite ? 'e' : encounter.tough ? 't' : 'r';
      const kit = fightPotions(left, healBelow, content);
      const allies = [{ ...player, hp, ...(mana !== null && { mana }), ...(Object.keys(kit).length > 0 && { potions: kit }) }];
      partners.forEach((one, index) => {
        const own = fightPotions(partnerLeft[index], one.healBelow, content);
        const partnerManaNow = partnerMana[index];
        allies.push({ ...one.unit, hp: partnerHp[index], ...(partnerManaNow !== null && { mana: partnerManaNow }), ...(Object.keys(own).length > 0 && { potions: own }) });
      });
      mates.forEach((mate, index) => {
        if (mateHp[index] > 0) allies.push({ ...mate, hp: mateHp[index] });
      });
      const result = simulateFight({ allies, enemies: encounterCombatants(encounter, content, { strength, classLevel, players }), rng, content, trait: area.trait });
      // A potion drunk is the one player's that drank it (combat.js:
      // `drinkers`), the character's when no other player carries it.
      result.drunk.forEach((/** @type {string} */ id, /** @type {number} */ index) => {
        const drinker = partners.findIndex((one) => one.unit.id === result.drinkers?.[index]);
        const from = drinker >= 0 ? partnerLeft[drinker] : left;
        from[id] = (from[id] ?? 0) - 1;
      });
      if (result.won === null) break;
      if (result.won === false) {
        faint = !((encounter.elite || encounter.champion) && area.safe);
        if (faint) fainted[fight + 1] += 1;
        break;
      }
      /** @param {string} id */
      const after = (id) => /** @type {{ hp: number } | undefined} */ (result.units.find((/** @type {{ id: string }} */ unit) => unit.id === id))?.hp ?? 0;
      hp = rested(player, after(player.id));
      const manaLeft = /** @type {{ mana?: number } | undefined} */ (result.units.find((/** @type {{ id: string }} */ unit) => unit.id === player.id))?.mana;
      mana = restedMana(manaLeft ?? mana, player.maxMana ?? 0, content, area.trait);
      // The other players rest as the character does, and one that fell
      // fights on (simulateHunt).
      partners.forEach((one, index) => {
        partnerHp[index] = rested(one.unit, after(one.unit.id));
        const own = /** @type {{ mana?: number } | undefined} */ (result.units.find((/** @type {{ id: string }} */ unit) => unit.id === one.unit.id))?.mana;
        partnerMana[index] = restedMana(own ?? partnerMana[index], one.unit.maxMana ?? 0, content, area.trait);
      });
      mates.forEach((mate, index) => {
        if (mateHp[index] > 0) mateHp[index] = after(mate.id) > 0 ? rested(mate, after(mate.id)) : 0;
      });
    }
    paths.push(path);
    faints.push(faint);
  }
  const by = new Array(pace.fights + 1).fill(0);
  for (let fights = 1; fights <= pace.fights; fights++) by[fights] = by[fights - 1] + fainted[fights] / THREAT_TRIPS;
  return { minutes, by, count: THREAT_TRIPS, paths, faints };
}

// The odds of each kind of encounter of a fight at `pace` (rollEncounter):
// the champion first where the place has one, then the elite, then a
// demanding encounter where the place has them, else a regular one.
/**
 * @param {Record<string, any>} pace
 * @param {boolean} champion
 * @param {boolean} tough
 * @returns {Record<string, number>}
 */
const kindOdds = (pace, champion, tough) => {
  const c = champion ? pace.championChance : 0;
  const e = (1 - c) * pace.eliteChance;
  const t = (1 - c - e) * (tough ? pace.toughChance : 0);
  return { c, e, t, r: 1 - c - e - t };
};

// The share of the explorations `went` fainted within `fights` fights, had
// their encounters come by the odds of `pace` instead of their own
// (`ownPace`): each exploration weighed by how much likelier its kinds of
// encounter are so, the weights summing to one; null when no exploration
// could have gone so (an elite met by all, with the elite avoided).
/**
 * @param {ThreatTrips} went
 * @param {number} fights
 * @param {Record<string, any>} pace
 * @param {Record<string, any>} ownPace
 * @param {boolean} champion
 * @param {boolean} tough
 * @returns {number | null}
 */
function tripShare(went, fights, pace, ownPace, champion, tough) {
  const wanted = kindOdds(pace, champion, tough);
  const had = kindOdds(ownPace, champion, tough);
  let total = 0;
  let fainted = 0;
  went.paths.forEach((path, index) => {
    let weight = 1;
    for (let fight = 0; fight < Math.min(fights, path.length); fight++) weight *= wanted[path[fight]] / had[path[fight]];
    total += weight;
    if (went.faints[index] && path.length <= fights) fainted += weight;
  });
  return total > 0 ? fainted / total : null;
}

// The expensive part: sample fights for the character's current build, with
// its companions (companions.js) at full HP beside it, and with companions
// its explorations (tripFaints) with the healing and mana potions taken
// along (`healing.potions`, by id). It does not depend on HP or the length, so
// the server can keep it until the build or those potions change.
// `hard`: against the stronger creatures of a Trudna wyprawa (true, 629 A)
// or of a Piekielna ('hell'; exploreStrength in combatant.js).
// `partners`: the other players of a Drużyna's trip, as it would set out
// (gracz (poz. 95), 24.11.2026; parties.js: threatCrew): they fight beside
// the character in the sample fights, with their potions, and in its
// explorations of tripFaints with the HP they set out with, and the
// creatures grow for all of them; a trip takes no companions. Before, the
// threat with "Z drużyną" was the character's alone (926 B).
/**
 * @param {{ character: Record<string, any>, equipped: Record<string, any>[], areaId: string, companions?: Record<string, any>[], partners?: Partner[], hard?: boolean | 'hell', healing?: Healing | null }} build
 * @param {Content} content
 * @returns {ThreatSamples}
 */
export function threatSamples({ character, equipped, areaId, companions = [], partners = [], hard = false, healing = null }, content) {
  const area = content.areasById[areaId];
  const player = playerCombatant(/** @type {any} */ ({ character, equipped, name: 'próba', area }), content);
  // The other players, after the character as on a trip (simulateHunt's
  // `p` ids), each with its potions in the sample fights.
  const others = partners.map((one, index) => ({
    unit: playerCombatant(/** @type {any} */ ({ character: one.character, equipped: one.equipped, name: one.name ?? 'próba', area, id: `p${index + 1}` }), content),
    hpShare: Math.min(1, Math.max(0.01, one.hpShare ?? 1)),
    potions: one.potions ?? {},
    healBelow: one.healBelow ?? content.potionUse?.healBelow ?? 0,
  }));
  const companionsGoing = others.length > 0 ? [] : companions;
  const mates = [
    ...others.map((one) => {
      const kit = fightPotions(one.potions, one.healBelow, content);
      return { ...one.unit, ...(Object.keys(kit).length > 0 && { potions: kit }) };
    }),
    ...companionsGoing.map((companion, index) => companionCombatant(companion, /** @type {any} */ ({ area, id: `a${index + 1}`, classLevel: character.classLevel ?? 0 }), content)),
  ];
  const rng = createRng(`threat:${areaId}:${character.level}`);
  // The creatures by the highest class level of those who fight and by the
  // Drużyna's players among them, as on the trip (simulateHunt).
  const classLevel = fightingClassLevel([character, ...partners.map((one) => one.character)]);
  const players = 1 + others.length;
  const strength = exploreStrength(area, character.level, content, hard, { classLevel, players });
  /**
   * @param {Record<string, any>[]} encounters
   * @param {Record<string, any>} [options]
   */
  const kinds = (encounters, options) =>
    encounters.map((encounter) =>
      sampleKind(() => regularEncounter(encounter, area, rng, content, /** @type {any} */ ({ ...options, characterLevel: character.level })), encounter.weight),
    );
  /** @type {Record<'regular' | 'tough' | 'elite' | 'champion', SampleKind[]>} */
  const groups = {
    regular: kinds(encountersFor(area, character.level)),
    tough: kinds(toughEncountersFor(area, character.level), { tough: true }),
    elite: [sampleKind(() => eliteEncounter(area, content), 1)],
    champion: area.champion ? [sampleKind(() => championEncounter(area, content), 1)] : [],
  };
  for (const list of Object.values(groups)) for (const kind of list) fightSamples(kind, SAMPLES, player, rng, content, area, mates, strength, classLevel, players);
  if (mix(groups.regular)[LOST] < /** @type {number} */ (LIMITS.at(-1))) {
    for (const [group, list] of Object.entries(groups)) {
      const total = list.reduce((sum, kind) => sum + kind.weight, 0);
      for (const kind of list.filter(inDoubt)) {
        fightSamples(kind, Math.ceil((MORE_SAMPLES[group] * kind.weight) / total), player, rng, content, area, mates, strength, classLevel, players);
      }
    }
  }
  const potions = healing?.potions ?? {};
  const healBelow = healing?.below ?? content.potionUse?.healBelow ?? 0;
  return {
    maxHp: player.maxHp,
    recovery: player.recovery,
    // Mądrość's share more of what a healing potion heals (balance.potionWisdom).
    potionBonus: player.potionBonus ?? 0,
    regular: mix(groups.regular),
    tough: groups.tough.length > 0 ? mix(groups.tough) : null,
    elite: mix(groups.elite),
    champion: groups.champion.length > 0 ? mix(groups.champion) : null,
    // Against the elite or the champion of a safe region running out of HP
    // is a retreat.
    safe: Boolean(area.safe),
    trips:
      mates.length > 0
        ? THREAT_TRIP_MINUTES.filter((minutes) => minutes <= content.balance.hunt.maxMinutes).map((minutes) =>
            tripFaints({ minutes, character, area, player, mates: mates.slice(others.length), partners: others, strength, classLevel, players, potions, healBelow }, content),
          )
        : null,
  };
}

// Chance of fainting for every exploration length, between 0 and 1.
// `healing`: the healing potions taken ({ count, amount, below }), at most
// one for each fight of a length; with `amounts` (strongest first) potions
// of several strengths, drunk the strongest first (959: a kind and the
// weaker ones that make up for it).
// With the companions' explorations (samples.trips), each length takes the
// share of them that fainted within its number of fights, and the
// recursion below only says how much more or less often it ends so than
// those fights of the longest exploration from full HP: the chance of
// coming back is theirs times the recursion's for the length asked (its
// pace, HP and odds) over its own for those fights.
/**
 * @param {ThreatInput} input
 * @param {Content} content
 * @param {ThreatSamples | null} [samples]
 * @returns {Record<string, number>}
 */
export function faintChances({ character, equipped, hp, areaId, avoidRare = false, seekRare = false, catchUp = null, healing = null, hard = false }, content, samples) {
  const { maxHp, recovery, potionBonus = 0, regular, tough, elite, champion, safe, trips = null } = samples ?? threatSamples({ character, equipped, areaId, hard }, content);
  const start = Math.round((Math.min(hp, maxHp) / maxHp) * STEPS);
  // A healing potion, in steps: what it heals, with the share more the
  // character's Mądrość gives (as combat.js drinks it), and the HP below
  // which it is drunk. The chances are kept for each number of potions left.
  const amounts = (healing ? (healing.amounts ?? Array.from({ length: healing.count }, () => healing.amount)) : []).map((amount) => Math.min(1, amount * (1 + potionBonus)));
  const mark = healing ? healing.below * STEPS : 0;
  /** @param {number} count */
  const layers = (count) => Array.from({ length: count + 1 }, () => new Float64Array(STEPS + 1));
  // Per length: the share of fights by HP lost, all kinds mixed by their odds,
  // and the chance that a fight begun with some HP ends in fainting.
  const shares = new Float64Array(LOST + 1);
  const faintFrom = new Float64Array(STEPS + 1);
  // The same with a potion at hand: a fight that would take up to its heal
  // more than the HP left is survived. One table for each strength.
  const strengths = [...new Set(amounts.map((amount) => Math.round(amount * STEPS)))];
  const faintWithPotion = new Map(strengths.map((steps) => [steps, new Float64Array(STEPS + 1)]));

  // The chance of fainting on an exploration of `pace`, begun at the HP step
  // `begin`.
  /**
   * @param {Record<string, any>} pace
   * @param {number} begin
   * @returns {number}
   */
  const recursion = (pace, begin) => {
    // HP after the rest that follows a won fight, for each HP left after it;
    // a longer exploration rests a little longer (restBonusByMinutes).
    const rest = Math.min(1, recovery + pace.restBonus);
    const rested = Array.from({ length: STEPS + 1 }, (_, left) => Math.round(left + (STEPS - left) * rest));
    // The champion is drawn first, then the elite (rollEncounter); a
    // character who avoids them meets neither, one who seeks them both more
    // often.
    const championShare = champion ? pace.championChance : 0;
    const eliteShare = (1 - championShare) * pace.eliteChance;
    const toughShare = tough ? pace.toughChance : 0;
    /** @type {number[]} */
    const losses = [];
    // The elite's and the champion's share of fights that cost `steps`.
    /** @param {number} steps */
    const rare = (steps) => eliteShare * elite[steps] + (champion ? championShare * champion[steps] : 0);
    for (let steps = 0; steps <= LOST; steps++) {
      // A share of demanding fights only comes with their samples.
      const fight = regular[steps] * (1 - toughShare) + (toughShare > 0 ? /** @type {number[]} */ (tough)[steps] * toughShare : 0);
      shares[steps] = (1 - eliteShare - championShare) * fight + rare(steps);
      if (steps < LOST && shares[steps] > 0) losses.push(steps);
    }
    // A lost fight, or one that takes all the HP left, ends in fainting, except
    // against the elite or the champion of a safe region.
    /** @param {number} steps */
    const fainting = (steps) => shares[steps] - (safe ? rare(steps) : 0);
    let tail = fainting(LOST);
    for (let steps = STEPS; steps >= 0; steps--) {
      tail += fainting(steps);
      faintFrom[steps] = tail;
    }
    for (const [potionSteps, table] of faintWithPotion) {
      for (let steps = 0; steps <= STEPS; steps++) {
        table[steps] = steps + potionSteps <= STEPS ? faintFrom[steps + potionSteps] : fainting(LOST);
      }
    }

    const potions = Math.min(amounts.length, pace.fights);
    let chances = layers(potions);
    let next = layers(potions);
    chances[potions][begin] = 1;
    let fainted = 0;
    for (let fight = 0; fight < pace.fights; fight++) {
      for (const layer of next) layer.fill(0);
      for (let left = 0; left <= potions; left++) {
        const from = chances[left];
        for (let step = 0; step <= STEPS; step++) {
          const chance = from[step];
          if (chance === 0) continue;
          if (left === 0) {
            fainted += chance * faintFrom[step];
            for (const loss of losses) {
              if (loss >= step) break;
              next[0][rested[step - loss]] += chance * shares[loss];
            }
            continue;
          }
          // With a potion: drunk once HP falls below the mark, the
          // strongest left first.
          const potionSteps = Math.round(amounts[potions - left] * STEPS);
          fainted += chance * /** @type {Float64Array} */ (faintWithPotion.get(potionSteps))[step];
          for (const loss of losses) {
            if (loss >= step + potionSteps) break;
            const after = step - loss;
            const drinks = after < mark;
            next[drinks ? left - 1 : left][rested[drinks ? Math.min(STEPS, after + potionSteps) : after]] += chance * shares[loss];
          }
        }
      }
      [chances, next] = [next, chances];
    }
    return Math.min(1, fainted);
  };

  /** @type {Record<string, number>} */
  const result = {};
  for (const minutes of durationsUpTo(content.balance.hunt.maxMinutes, content)) {
    const pace = withRareOdds(explorationPace(minutes, content, character.level), { avoidRare, seekRare, catchUp }, content);
    const own = recursion(pace, start);
    if (!trips || trips.length === 0) {
      result[minutes] = own;
      continue;
    }
    // The longest of the explorations this one reaches, else the shortest:
    // their share fainted within its number of fights, weighed to its odds
    // of each kind of encounter (the elite and the champion avoided or
    // sought too). The recursion then moves it by what is left: the rest
    // after each fight and the HP it starts with.
    const went = trips.filter((trip) => trip.minutes <= minutes).at(-1) ?? trips[0];
    const wentPace = explorationPace(went.minutes, content, character.level);
    const fights = Math.min(pace.fights, went.by.length - 1);
    const share = tripShare(went, fights, pace, wentPace, Boolean(champion), Boolean(tough));
    if (share === null) {
      result[minutes] = own;
      continue;
    }
    const reference = recursion({ ...pace, restBonus: wentPace.restBonus, fights }, STEPS);
    const back = ((1 - share) * (1 - own)) / Math.max(1e-9, 1 - reference);
    result[minutes] = Math.min(1, Math.max(0, 1 - back));
  }
  return result;
}

/**
 * @param {number} chance
 * @returns {string}
 */
export function threatLevel(chance) {
  const index = LIMITS.findIndex((limit) => chance < limit);
  return THREAT_LEVELS[index === -1 ? THREAT_LEVELS.length - 1 : index];
}

/**
 * @param {ThreatInput} input
 * @param {Content} content
 * @param {ThreatSamples | null} [samples]
 * @returns {Record<string, string>}
 */
export function estimateThreat(input, content, samples) {
  return Object.fromEntries(
    Object.entries(faintChances(input, content, samples)).map(([minutes, chance]) => [minutes, threatLevel(chance)]),
  );
}

// The lower or the higher of two threats for each length. In a safe region a
// retreat before the elite or the champion ends the exploration early, so
// without them the chance of fainting can come out a shade higher, and with
// more of them a shade lower; the threat shown for avoiding them is never
// higher than the one without, and the one for seeking them never lower.
/**
 * @param {Record<string, string>} threat
 * @param {Record<string, string>} other
 * @param {(a: number, b: number) => number} pick
 * @returns {Record<string, string>}
 */
const pickThreat = (threat, other, pick) =>
  Object.fromEntries(
    Object.entries(threat).map(([minutes, level]) => [
      minutes,
      THREAT_LEVELS[pick(THREAT_LEVELS.indexOf(level), THREAT_LEVELS.indexOf(other[minutes] ?? level))],
    ]),
  );
/**
 * @param {Record<string, string>} threat
 * @param {Record<string, string>} other
 */
export const lowerThreat = (threat, other) => pickThreat(threat, other, Math.min);
/**
 * @param {Record<string, string>} threat
 * @param {Record<string, string>} other
 */
export const higherThreat = (threat, other) => pickThreat(threat, other, Math.max);

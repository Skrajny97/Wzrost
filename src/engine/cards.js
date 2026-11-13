// @ts-check
// Talia Systemu, the card game of the Salon Gier (data/cards.json; DECISIONS.md,
// "Talia Systemu: gra karciana w Salonie Gier", 871 B, 872–877 A and the
// points decided at the build). Pure: the server keeps the collection, the
// decks and the matches, and gives the time and the seeds.
//
// Cards are the creatures of the Bestiariusz that live in the lands, one card
// each. A card's type is the stat its creature attacks with (Siła, Zręczność,
// Magia); a type beats the next one (Siła > Zręczność > Magia > Siła) and
// hits it typeBonus harder. Its rarity is its species' (its material's), so
// ordinary creatures go from common to epic, elites are legendary or mythic
// and champions mythic or divine. Its Atak and Życie come from the
// creature's shape in a fight (its blow to its HP at its first home, against
// the median of all the creatures: a glass cannon hits hard and falls fast, a
// tank the other way), times the card's might: its rarity's, a step for each
// later land, and one for each card level over the first (a card's level is
// the copies won, up to stats.maxLevel).
//
// A match (871 B): two decks of deckSize cards, each shuffled from the
// match's seed, a reserve (`hand`) of a few cards drawn from it, three
// lines. Each round the rival (Szczęsny's AI, `smart`) first puts cards from
// its reserve on its empty lines; then the player puts its own on its empty
// lines (while its reserve has cards it must; a card stays on its line until
// it is beaten) and may use its hero's skill once a match (872 A, point 8);
// then every card on the table hits the card opposite, all at once (with
// no card opposite, the rival's first card from the front), and a card left
// with no Życie is beaten. The match ends when a side has no cards left
// (both at once: a draw); after roundCap rounds the side with more cards
// left wins, then the one with more Życie, and else it is a draw. Every
// number is the data's; hits are not random, so the page can show what a
// round will do before "Walcz".
//
// Cards come from the creatures beaten on explorations and in the Labirynt,
// each its own (cardDrop), and from more sources (902 B, 903): a won fight
// of an exploration may give a card of a lower land's creature, and a
// profession's work, an attack on the Bestia or on a guardian of the
// Wyprawa Gildii and a Próba finished a card of the lands at the
// character's level or lower; one picker chooses for all of them (pickCard),
// first a card the character has not got.

import { monsterCombatant } from './combatant.js';
import { createRng } from './rng.js';
import { say } from './text.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {import('./rng.js').Rng} Rng */
/** @typedef {'me' | 'foe'} Seat A side of a match: the player, or its rival. */
/** @typedef {{ level: number, area: string, land: number, landName: string, regionId: string }} Home A creature's first home: the lowest place it lives in (its level and id, whose picture is the card's background), and its land (0 for the first). */
/** @typedef {{ key: number, id: string, level: number, type: string, attack: number, life: number, max: number, shifted?: true }} MatchCard A card in a match: its place in its deck (`key`), creature, level, type (a Mag's skill may change it), Atak, Życie left and full. */
/** @typedef {{ classId: string, stage: number, used: boolean }} Hero A side's hero: its class, its evolution's stage (0 for none) and whether its skill is used. */
/** @typedef {{ cards: MatchCard[], deck: number[], hand: number[], lines: (number | null)[], out: number[], hero: Hero | null, smart: number }} Side A side of a match: its cards, those still in its deck (in draw order), in its reserve, on its three lines, and beaten. */
/** @typedef {{ card: number, target?: number, type?: string, swap?: number }} SkillUse A hero's skill as a turn uses it: the player's card it works on, and the rival's line aimed at (aim), the new type (shift) or the reserve's card swapped in (swap). */
/** @typedef {{ round: number, lines: (number | null)[], skill?: SkillUse | null }} Turn The player's turn: the round it is for, its cards on its three lines after it, and its hero's skill. */
/** @typedef {{ side: Seat, line: number, key: number, target: { line: number, key: number }, damage: number, advantage: boolean, boosted: boolean }} Hit A card's blow in a round. */
/** @typedef {{ round: number, hits: Hit[], beaten: { me: number[], foe: number[] }, revived: number | null, skill: (SkillUse & { kind: string }) | null, placed: number[] }} RoundLog What a round did: its blows, the cards beaten, the card a Kleryk brought back, the skill used and the rival's lines filled for the next round. */
/**
 * A match as the server keeps it: its seed (never shown), the round to be
 * played, the two sides, the last round's account, the result once it is
 * over (`won`, `lost` or `drawn`, for the player) and how it ended (`out`:
 * a side's cards all beaten, `cap`: the rounds' limit, `surrender`).
 * @typedef {{ v: number, seed: string, round: number, me: Side, foe: Side, last: RoundLog | null, result: null | 'won' | 'lost' | 'drawn', end: null | 'out' | 'cap' | 'surrender' }} Match
 */

/**
 * @param {Content} content
 * @returns {Record<string, any>}
 */
export const cardRules = (content) => content.cards;

const LINES = [0, 1, 2];

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
const clone = (value) => JSON.parse(JSON.stringify(value));

// --- The cards -------------------------------------------------------------

/** @type {WeakMap<Content, Map<string, Home>>} */
const homesBuilt = new WeakMap();

// The lands in the game's order: those of the regions as they come.
/**
 * @param {Content} content
 * @returns {string[]}
 */
function landsInOrder(content) {
  /** @type {string[]} */
  const lands = [];
  for (const region of content.regions) if (!lands.includes(region.land)) lands.push(region.land);
  return lands;
}

// The creatures that are cards, each with its first home: the lowest place
// it lives in (an ordinary creature of its encounters, its elite or its
// champion, or the region's elite at the region's first place), and the
// land, counted from the first. Events' foes and the wanted are no cards.
/**
 * @param {Content} content
 * @returns {Map<string, Home>}
 */
export function cardHomes(content) {
  const built = homesBuilt.get(content);
  if (built) return built;
  /** @type {Map<string, Home>} */
  const homes = new Map();
  const lands = landsInOrder(content);
  for (const region of content.regions) {
    const land = lands.indexOf(region.land);
    /** @type {Record<string, any>[]} */
    const areas = [...region.areas].sort((a, b) => a.minLevel - b.minLevel);
    /** @param {string} id @param {Record<string, any>} area */
    const add = (id, area) => {
      if (id && !homes.has(id) && content.monstersById[id] && !content.eventFoesById?.[id]) homes.set(id, { level: area.minLevel, area: area.id, land, landName: region.land, regionId: region.id });
    };
    for (const area of areas) {
      for (const encounter of [...(area.encounters ?? []), ...(area.tough ?? [])]) for (const id of encounter.monsters) add(id, area);
      add(area.elite, area);
      add(area.champion, area);
    }
    if (areas.length > 0) add(region.elite, areas[0]);
  }
  homesBuilt.set(content, homes);
  return homes;
}

// Whether a creature is a card.
/**
 * @param {unknown} id
 * @param {Content} content
 */
export const isCard = (id, content) => typeof id === 'string' && cardHomes(content).has(id);

// A card's kind: an ordinary creature, an elite or a champion.
/**
 * @param {string} id
 * @param {Content} content
 * @returns {'ordinary' | 'elite' | 'champion'}
 */
export function cardKind(id, content) {
  const monster = content.monstersById[id];
  return monster?.champion ? 'champion' : monster?.elite ? 'elite' : 'ordinary';
}

// A card's rarity: its species', its material's (the first rarity without one).
/**
 * @param {string} id
 * @param {Content} content
 * @returns {string}
 */
export const cardRarity = (id, content) => content.materialsByMonster[id]?.rarity ?? content.rarities[0].id;

// A card's type: the stat its creature attacks with.
/**
 * @param {string} id
 * @param {Content} content
 * @returns {string}
 */
export function cardType(id, content) {
  const scaling = content.monstersById[id]?.attack?.scaling;
  const types = cardRules(content).types;
  return types.some((/** @type {{ id: string }} */ type) => type.id === scaling) ? scaling : types[0].id;
}

// Whether type `a` beats type `b` (Siła > Zręczność > Magia > Siła).
/**
 * @param {string} a
 * @param {string} b
 * @param {Content} content
 */
export const typeBeats = (a, b, content) => cardRules(content).types.some((/** @type {{ id: string, target: string }} */ type) => type.id === a && type.target === b);

// A card's level from the copies won: one copy the first level, each more
// one level up, to the top.
/**
 * @param {number} copies
 * @param {Content} content
 */
export const cardLevel = (copies, content) => Math.max(1, Math.min(cardRules(content).stats.maxLevel, Math.floor(copies)));

/** @type {WeakMap<Content, Map<string, number>>} */
const shapesBuilt = new WeakMap();

// Each card's shape: its creature's blow over its HP in a fight at its first
// home, over the median of all the cards', kept within shapeRange and raised
// to shapeExponent. Above 1 the card hits harder than it lasts.
/**
 * @param {Content} content
 * @returns {Map<string, number>}
 */
function cardShapes(content) {
  const built = shapesBuilt.get(content);
  if (built) return built;
  const { shapeExponent, shapeRange } = cardRules(content).stats;
  /** @type {[string, number][]} */
  const ratios = [...cardHomes(content)].map(([id, home]) => {
    const unit = monsterCombatant({ monsterId: id, level: home.level, id: 'card' }, content);
    const blow = ((unit.weapon.min + unit.weapon.max) / 2) * unit.damageScale;
    return [id, blow / Math.max(1, unit.maxHp)];
  });
  const sorted = ratios.map(([, ratio]) => ratio).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 1;
  const [least, most] = shapeRange;
  const shapes = new Map(ratios.map(([id, ratio]) => [id, Math.min(most, Math.max(least, ratio / median)) ** shapeExponent]));
  shapesBuilt.set(content, shapes);
  return shapes;
}

// A card's Atak and Życie at a level.
/**
 * @param {string} id
 * @param {number} level
 * @param {Content} content
 * @returns {{ attack: number, life: number }}
 */
export function cardStats(id, level, content) {
  const { stats } = cardRules(content);
  const home = cardHomes(content).get(id);
  const shape = cardShapes(content).get(id) ?? 1;
  const might = (stats.rarity[cardRarity(id, content)] ?? 1) * (1 + stats.landStep * (home?.land ?? 0)) * (1 + stats.levelStep * (cardLevel(level, content) - 1));
  return { attack: Math.max(1, Math.round(stats.attack * shape * might)), life: Math.max(1, Math.round((stats.life / shape) * might)) };
}

// A type as the page shows it: its id, name and icon.
/**
 * @param {string} type
 * @param {Content} content
 * @returns {{ type: string, typeName: string, typeIcon: string }}
 */
function typeView(type, content) {
  const found = cardRules(content).types.find((/** @type {{ id: string }} */ one) => one.id === type);
  return { type, typeName: found?.name ?? type, typeIcon: found?.icon ?? 'unknown' };
}

// A card as the page shows it: the creature's name, type, rarity with its
// colour, kind, level, Atak and Życie, the place of its first home (the
// card's background, 12.11.2026) and what else the caller gives.
/**
 * @param {string} id
 * @param {number} level
 * @param {Content} content
 * @param {Record<string, any>} [extra]
 * @returns {Record<string, any>}
 */
export function cardView(id, level, content, extra = {}) {
  const rarity = content.raritiesById[cardRarity(id, content)];
  return {
    id,
    name: content.monstersById[id].name,
    ...typeView(cardType(id, content), content),
    rarity: rarity.id,
    // "karta pospolita": the rarity's form for a card.
    rarityName: rarity.forms?.f ?? rarity.name,
    color: rarity.color,
    kind: cardKind(id, content),
    level: cardLevel(level, content),
    ...cardStats(id, level, content),
    area: cardHomes(content).get(id)?.area ?? null,
    ...extra,
  };
}

// The card a creature beaten on an exploration (874 A) or in the Labirynt
// (903) leaves, or null: one roll for each creature, so the draws after it
// never hang on what it is; by its kind's chance (an elite and a champion
// more often, and theirs are the better cards; the Labirynt's guardian by
// the guardians', `guardian`), never of a card at its top level (`maxed`)
// nor of a creature that is no card.
/**
 * @param {string} id
 * @param {Rng} rng
 * @param {{ maxed?: string[], guardian?: boolean }} options
 * @param {Content} content
 * @returns {string | null}
 */
export function cardDrop(id, rng, { maxed = [], guardian = false }, content) {
  const roll = rng.next();
  const rules = cardRules(content);
  if (!rules || !isCard(id, content) || maxed.includes(id)) return null;
  const chance = guardian ? rules.drops.guardian : rules.drops[cardKind(id, content)];
  return roll < chance ? id : null;
}

// A report's sentence of a card left (the data's, by its place in the
// report): `key` "drop" for a creature's own card, "lower" for one of a
// lower land (902 B).
/**
 * @param {string} id
 * @param {number} step
 * @param {Content} content
 * @param {'drop' | 'lower'} [key]
 */
export const cardDropText = (id, step, content, key = 'drop') => say(cardRules(content).texts, key, step, { card: content.monstersById[id].name });

// --- Cards from the lower lands and the other sources (902 B, 903) ---------

// The land of a place, counted from the first (0), as a card's home counts
// it (cardHomes); -1 for a place the game has not.
/**
 * @param {string} areaId
 * @param {Content} content
 */
export function areaLand(areaId, content) {
  const area = content.areasById[areaId];
  return area ? landsInOrder(content).indexOf(area.land) : -1;
}

// The cards of the creatures whose home is in a land lower than `land`
// (902 B): those a won fight of an exploration there may give besides its
// creatures' own. None in the first land.
/**
 * @param {number} land
 * @param {Content} content
 * @returns {string[]}
 */
export const lowerLandCards = (land, content) => [...cardHomes(content)].filter(([, home]) => home.land < land).map(([id]) => id);

// The cards of the creatures whose home is at `level` or lower (903): those
// the professions and the Gildia give, for the higher of a character's
// level and its class level.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {string[]}
 */
export const cardsUpTo = (level, content) => [...cardHomes(content)].filter(([, home]) => home.level <= level).map(([id]) => id);

// Whether a source's roll gives a card (902 B, 903): one draw, under its
// chance (0 never, 1 always).
/**
 * @param {Rng} rng
 * @param {number} chance
 */
export const cardComes = (rng, chance) => rng.next() < chance;

// The card a source gives once its roll came (cardComes), the one picker of
// every source (902 B, 903): one draw among the cards of `pool` the
// character has not got yet (`owned` holds those it has), all alike; once it
// has them all, among those it has below their top level. Never one at its
// top level (`maxed`) nor one just given (`found`, as an exploration's
// cards). Null when none is left.
/**
 * @param {string[]} pool
 * @param {Rng} rng
 * @param {{ owned?: Iterable<string>, maxed?: Iterable<string>, found?: Iterable<string> }} [have]
 * @returns {string | null}
 */
export function pickCard(pool, rng, { owned = [], maxed = [], found = [] } = {}) {
  const roll = rng.next();
  const mine = new Set(owned);
  const out = new Set([...maxed, ...found]);
  const left = pool.filter((id) => !out.has(id));
  const fresh = left.filter((id) => !mine.has(id));
  const from = fresh.length > 0 ? fresh : left;
  return from.length > 0 ? from[Math.min(from.length - 1, Math.floor(roll * from.length))] : null;
}

// A source's roll and its card at once (an exploration's lower lands, 902
// B): always both draws, so the draws after it never hang on what it gave.
/**
 * @param {string[]} pool
 * @param {Rng} rng
 * @param {{ chance: number, owned?: Iterable<string>, maxed?: Iterable<string>, found?: Iterable<string> }} source
 * @returns {string | null}
 */
export function cardFrom(pool, rng, { chance, ...have }) {
  const comes = cardComes(rng, chance);
  const card = pickCard(pool, rng, have);
  return comes ? card : null;
}

// The pack of the day at Szczęsny's (902 C): `count` cards of the
// creatures of the lands lower than the character's own (lowerLandCards),
// each drawn as every source draws (pickCard: one the character has not
// got first, never one at its top level, never one twice in a pack), from
// the day's seed. Fewer when fewer are left; none in the first land.
/**
 * @param {{ land: number, owned: Iterable<string>, maxed: Iterable<string>, seed: string, count: number }} draw
 * @param {Content} content
 * @returns {string[]}
 */
export function packCards({ land, owned, maxed, seed, count }, content) {
  const pool = lowerLandCards(land, content);
  const rng = createRng(`${seed}:pack`);
  const have = { owned: [...owned], maxed: [...maxed] };
  /** @type {string[]} */
  const cards = [];
  for (let index = 0; index < count; index += 1) {
    const card = pickCard(pool, rng, { ...have, found: cards });
    if (!card) break;
    cards.push(card);
  }
  return cards;
}

// The lands lower than `land`, by their names, in their order (902 C).
/**
 * @param {number} land
 * @param {Content} content
 * @returns {string[]}
 */
export const lowerLandNames = (land, content) => landsInOrder(content).slice(0, Math.max(0, land));

// The chance of a card for a profession's work of `minutes` (903): its
// share for each hour of the work, up to the most.
/**
 * @param {number} minutes
 * @param {Content} content
 */
export function workCardChance(minutes, content) {
  const { professionPerHour, professionMax } = cardRules(content).drops;
  return Math.min(professionMax, (professionPerHour * Math.max(0, minutes)) / 60);
}

// The report's line of the collection's bonus (884 A: "Kolekcja kart: +3%
// XP i +3% złota z wyprawy."), where it gave some of the exploration's XP
// or gold; none after a faint, which loses them.
/**
 * @param {Record<string, any>} hunt
 * @param {Content} content
 * @returns {string | null}
 */
export function cardBonusLine(hunt, content) {
  const bonus = hunt.cardsBonus;
  if (!bonus || !cardRules(content) || hunt.forfeit || !(hunt.xp > 0 || hunt.gold > 0)) return null;
  const percent = (/** @type {number} */ share) => Math.round(share * 1000) / 10;
  return say(cardRules(content).texts.collection, 'report', 0, { xp: percent(bonus.xp), gold: percent(bonus.gold) });
}

// --- The collection and the deck ------------------------------------------

// The starter deck Szczęsny gives (874 A).
/**
 * @param {Content} content
 * @returns {string[]}
 */
export const starterDeck = (content) => [...cardRules(content).starter.monsters];

// Why `ids` is no deck of the character's, or null: deckSize cards, each a
// card it has, once.
/**
 * @param {unknown} ids
 * @param {Set<string>} owned
 * @param {Content} content
 * @returns {{ code: string, message: string } | null}
 */
export function deckBlock(ids, owned, content) {
  const size = cardRules(content).deckSize;
  if (!Array.isArray(ids) || ids.length !== size || ids.some((id) => typeof id !== 'string')) return { code: 'invalid_deck', message: `Talia to dokładnie ${size} kart.` };
  if (new Set(ids).size !== ids.length) return { code: 'invalid_deck', message: 'Każda karta może być w talii tylko raz.' };
  if (ids.some((id) => !isCard(id, content) || !owned.has(id))) return { code: 'invalid_deck', message: 'W talii mogą być tylko karty z Twojej kolekcji.' };
  return null;
}

// --- Szczęsny --------------------------------------------------------------

// Szczęsny's tiers (873 A), the first one first.
/**
 * @param {Content} content
 * @returns {Record<string, any>[]}
 */
export const hostTiers = (content) => cardRules(content).host.tiers;

// A tier by its number (1 for the first), or null.
/**
 * @param {unknown} number
 * @param {Content} content
 * @returns {Record<string, any> | null}
 */
export const hostTier = (number, content) => (Number.isInteger(number) ? (hostTiers(content)[/** @type {number} */ (number) - 1] ?? null) : null);

// The stake's base at a character level, as the Koło Fortuny's lowest stake
// grows (875 A): `step` gold, and `step` more for each levelsPerStep levels.
/**
 * @param {number} level
 * @param {Content} content
 */
export function stakeBase(level, content) {
  const { step, levelsPerStep } = cardRules(content).stakes;
  return step * Math.max(1, Math.floor(level / levelsPerStep));
}

// A tier's stake at a character level: its `stake` times the base.
/**
 * @param {Record<string, any>} tier
 * @param {number} level
 * @param {Content} content
 */
export const tierStake = (tier, level, content) => tier.stake * stakeBase(level, content);

// The card the first win over a tier gives (873 A): a card of the tier's
// rarity, first one the character has not got, then one it has fewest
// copies of; drawn from `seed`. Null when the game has no card of it.
/**
 * @param {Record<string, any>} tier
 * @param {Map<string, number>} owned the copies the character has, by card
 * @param {string} seed
 * @param {Content} content
 * @returns {string | null}
 */
export function firstWinCard(tier, owned, seed, content) {
  const fitting = [...cardHomes(content).keys()].filter((id) => cardRarity(id, content) === tier.firstWin.rarity).sort();
  if (fitting.length === 0) return null;
  const fewest = Math.min(...fitting.map((id) => owned.get(id) ?? 0));
  return createRng(`${seed}:first-win`).pick(fitting.filter((id) => (owned.get(id) ?? 0) === fewest));
}

// --- The hero --------------------------------------------------------------

// A class's hero skill (872 A, point 8) at an evolution stage: its kind, name
// and words with the number filled in, and its number (power) at that stage;
// a later stage than the data's takes the last. Null for a class without one.
/**
 * @param {string} classId
 * @param {number} stage
 * @param {Content} content
 * @returns {{ id: string, kind: string, name: string, text: string, power: number } | null}
 */
export function heroSkill(classId, stage, content) {
  const hero = cardRules(content).heroes.find((/** @type {{ id: string }} */ one) => one.id === classId);
  if (!hero) return null;
  const power = hero.power[Math.min(Math.max(0, stage), hero.power.length - 1)];
  const percent = String(Math.round(power * 100));
  const text = [hero.text, ...(hero.plus && power > 0 ? [hero.plus] : [])].join(' ').replaceAll('{power}', percent);
  return { id: hero.id, kind: hero.kind, name: hero.name, text, power };
}

// --- The match -------------------------------------------------------------

// The cards of a side left: on its lines, in its reserve and in its deck.
/**
 * @param {Side} side
 */
export const cardsLeft = (side) => side.lines.filter((key) => key !== null).length + side.hand.length + side.deck.length;

// The Życie a side has left, of every card not beaten.
/**
 * @param {Side} side
 */
export const lifeLeft = (side) => side.cards.filter((card) => !side.out.includes(card.key)).reduce((sum, card) => sum + card.life, 0);

// The reserve drawn up to its size from the deck.
/**
 * @param {Side} side
 * @param {Content} content
 */
export function refill(side, content) {
  const size = cardRules(content).hand;
  while (side.hand.length < size && side.deck.length > 0) side.hand.push(/** @type {number} */ (side.deck.shift()));
}

// `keys` shuffled by `rng` (Fisher–Yates).
/**
 * @param {number[]} keys
 * @param {Rng} rng
 */
function shuffled(keys, rng) {
  const list = [...keys];
  for (let index = list.length - 1; index > 0; index -= 1) {
    const other = rng.int(0, index);
    [list[index], list[other]] = [list[other], list[index]];
  }
  return list;
}

// What a card is worth to the rival's AI against the player's cards on the
// table: its Atak, more for each of them it beats, and its Życie, less for
// each that beats it (smart 2); without them (smart 1) its Atak and Życie.
/**
 * @param {MatchCard} card
 * @param {MatchCard[]} against
 * @param {number} smart
 * @param {Content} content
 */
function cardWorth(card, against, smart, content) {
  if (smart < 2 || against.length === 0) return card.attack + 0.4 * card.life;
  const beats = against.filter((other) => typeBeats(card.type, other.type, content)).length / against.length;
  const beaten = against.filter((other) => typeBeats(other.type, card.type, content)).length / against.length;
  return card.attack * (1 + cardRules(content).typeBonus * beats) + 0.4 * card.life * (1 - 0.5 * beaten);
}

// The rival's AI fills its empty lines from its reserve (the start of a
// round, before the player's turn), then draws its reserve up again: at
// random (smart 0), its strongest cards (1), or those strongest against the
// player's cards on the table (2), each on the line opposite a card of the
// player's it beats where it can, the hardiest in front. Returns the lines
// filled.
/**
 * @param {Match} match
 * @param {Content} content
 * @returns {number[]}
 */
function rivalSetup(match, content) {
  const { foe, me } = match;
  const empty = LINES.filter((line) => foe.lines[line] === null);
  const count = Math.min(empty.length, foe.hand.length);
  if (count === 0) {
    refill(foe, content);
    return [];
  }
  const rng = createRng(`${match.seed}:setup:${match.round}`);
  const against = me.lines.filter((key) => key !== null).map((key) => me.cards[/** @type {number} */ (key)]);
  /** @type {number[]} */
  let chosen;
  if (foe.smart <= 0) chosen = shuffled(foe.hand, rng).slice(0, count);
  else {
    chosen = [...foe.hand]
      .sort((a, b) => cardWorth(foe.cards[b], against, foe.smart, content) - cardWorth(foe.cards[a], against, foe.smart, content) || a - b)
      .slice(0, count);
  }
  /** @type {number[]} */
  const placed = [];
  const open = [...empty];
  /** @param {number} key @param {number} line */
  const put = (key, line) => {
    foe.lines[line] = key;
    placed.push(line);
    open.splice(open.indexOf(line), 1);
  };
  /** @type {number[]} */
  let rest = [...chosen];
  if (foe.smart > 0) {
    // On the line opposite a card it beats, where it can.
    for (const key of chosen) {
      const line = open.find((one) => me.lines[one] !== null && typeBeats(foe.cards[key].type, me.cards[/** @type {number} */ (me.lines[one])].type, content));
      if (line !== undefined) {
        put(key, line);
        rest = rest.filter((one) => one !== key);
      }
    }
    rest.sort((a, b) => foe.cards[b].life - foe.cards[a].life || a - b);
  }
  for (const key of rest) put(key, open[0]);
  foe.hand = foe.hand.filter((key) => !chosen.includes(key));
  refill(foe, content);
  return placed.sort((a, b) => a - b);
}

// A new match (871 B): each side's cards ({ id, level } in deck order, which
// the seed shuffles), its hero ({ classId, stage }, or none) and, for the
// rival, how its AI plays (`smart`); both reserves drawn and the rival's
// first lines laid. `seed` is the server's, never shown.
/**
 * @param {{ seed: string, me: { cards: { id: string, level: number }[], hero?: { classId: string, stage: number } | null }, foe: { cards: { id: string, level: number }[], hero?: { classId: string, stage: number } | null, smart?: number } }} setup
 * @param {Content} content
 * @returns {Match}
 */
export function newMatch({ seed, me, foe }, content) {
  /**
   * @param {Seat} who
   * @param {{ cards: { id: string, level: number }[], hero?: { classId: string, stage: number } | null, smart?: number }} spec
   * @returns {Side}
   */
  const side = (who, spec) => {
    const cards = spec.cards.map((card, key) => {
      const level = cardLevel(card.level, content);
      const { attack, life } = cardStats(card.id, level, content);
      return { key, id: card.id, level, type: cardType(card.id, content), attack, life, max: life };
    });
    return {
      cards,
      deck: shuffled(cards.map((card) => card.key), createRng(`${seed}:deck:${who}`)),
      hand: [],
      lines: [null, null, null],
      out: [],
      hero: spec.hero ? { classId: spec.hero.classId, stage: spec.hero.stage, used: false } : null,
      smart: spec.smart ?? 0,
    };
  };
  /** @type {Match} */
  const match = { v: 1, seed, round: 1, me: side('me', me), foe: side('foe', foe), last: null, result: null, end: null };
  refill(match.me, content);
  refill(match.foe, content);
  const placed = rivalSetup(match, content);
  match.last = { round: 0, hits: [], beaten: { me: [], foe: [] }, revived: null, skill: null, placed };
  return match;
}

// The card on a side's line, or null.
/**
 * @param {Side} side
 * @param {number} line
 * @returns {MatchCard | null}
 */
const onLine = (side, line) => (side.lines[line] === null ? null : side.cards[/** @type {number} */ (side.lines[line])]);

// The line a card on `line` hits: the one opposite, or the other side's
// first card from the front when there is none; null with no card at all.
/**
 * @param {Side} other
 * @param {number} line
 * @returns {number | null}
 */
function targetLine(other, line) {
  if (other.lines[line] !== null) return line;
  const first = LINES.find((one) => other.lines[one] !== null);
  return first ?? null;
}

// Why the player's turn cannot be played, or null: the match still on, the
// round the page saw, three lines with every card that stood on the table
// still on its line (only the Cień's skill takes one back to the reserve,
// the reserve's card it swaps in on its line), the new ones from the
// reserve on the empty lines, every empty line filled while the reserve has
// cards, and the hero's skill, once a match, used as its kind asks.
/**
 * @param {Match} match
 * @param {unknown} turn
 * @param {Content} content
 * @returns {{ code: string, message: string, status?: number } | null}
 */
export function turnBlock(match, turn, content) {
  if (match.result) return { code: 'match_over', message: 'Ta partia już się skończyła.', status: 409 };
  const asked = /** @type {Record<string, any>} */ (turn ?? {});
  if (asked.round !== match.round) return { code: 'stale_round', message: 'Partia poszła już dalej. Spróbuj jeszcze raz.', status: 409 };
  const { me, foe } = match;
  const lines = asked.lines;
  const invalid = { code: 'invalid_turn', message: 'Ustaw karty w trzech liniach.' };
  if (!Array.isArray(lines) || lines.length !== 3 || lines.some((key) => key !== null && !(Number.isInteger(key) && me.cards[key]))) return invalid;
  /** @type {number[]} */
  const placed = lines.filter((key) => key !== null);
  if (new Set(placed).size !== placed.length) return invalid;
  const skill = asked.skill ?? null;
  const hero = me.hero ? heroSkill(me.hero.classId, me.hero.stage, content) : null;
  if (skill !== null) {
    if (!me.hero || !hero) return { code: 'no_hero', message: 'Twoja klasa nie ma umiejętności bohatera.' };
    if (me.hero.used) return { code: 'skill_used', message: 'Umiejętność bohatera działa raz na partię.' };
    if (typeof skill !== 'object' || !Number.isInteger(skill.card)) return { code: 'invalid_skill', message: 'Wybierz kartę dla umiejętności bohatera.' };
  }
  // A card on the table stays on its line until it is beaten; only the
  // Cień's skill takes one back to the reserve, its line to the reserve's
  // card swapped in.
  const swapped = skill && hero?.kind === 'swap' ? skill.card : null;
  if (swapped !== null) {
    const line = me.lines.indexOf(swapped);
    if (line < 0 || !Number.isInteger(skill.swap) || !me.hand.includes(skill.swap) || lines[line] !== skill.swap) {
      return { code: 'invalid_skill', message: 'Wybierz kartę z linii i kartę z rezerwy, która zajmie jej miejsce.' };
    }
  }
  for (const line of LINES) {
    const standing = me.lines[line];
    if (standing !== null && standing !== swapped && lines[line] !== standing) return { code: 'card_kept', message: 'Karta zostaje na swojej linii, dopóki nie zostanie zbita.' };
    if (standing === null && lines[line] !== null && !me.hand.includes(lines[line])) return { code: 'not_in_hand', message: 'Tej karty nie ma w Twojej rezerwie.' };
  }
  // The reserve's cards left for the empty lines: the one swapped in by the
  // Cień takes its line, and the card it swaps goes to the reserve after it.
  const empty = LINES.filter((line) => me.lines[line] === null).length;
  const reserve = me.hand.length - (swapped !== null ? 1 : 0);
  if (lines.filter((key, line) => me.lines[line] === null && key !== null).length < Math.min(empty, reserve)) {
    return { code: 'lines_empty', message: 'Dołóż karty z rezerwy na puste linie.' };
  }
  if (skill !== null && hero) {
    const where = lines.indexOf(skill.card);
    if (hero.kind !== 'swap' && where < 0) return { code: 'invalid_skill', message: 'Wybierz kartę, która stoi w linii.' };
    if (hero.kind === 'aim' && !(Number.isInteger(skill.target) && LINES.includes(skill.target) && foe.lines[skill.target] !== null)) {
      return { code: 'invalid_skill', message: 'Wskaż kartę rywala, w którą bije Twoja karta.' };
    }
    if (hero.kind === 'shift' && !(cardRules(content).types.some((/** @type {{ id: string }} */ type) => type.id === skill.type) && skill.type !== me.cards[skill.card].type)) {
      return { code: 'invalid_skill', message: 'Wybierz nowy typ karty.' };
    }
  }
  return null;
}

// The blows of a round with the player's lines and skill as given (both
// checked by turnBlock): each card on the table hits the card opposite, or
// the rival's first from the front, Atak more by typeBonus against a type it
// beats and by the skill's power for the card it boosts this round; all at
// once, from the cards as they stand before the round. With the player's
// lines and skill applied to a copy of the match, so the page's preview and
// the round itself are the same.
/**
 * @param {Match} match
 * @param {Content} content
 * @param {{ boost?: Record<number, number>, aim?: { key: number, line: number } | null }} [mods]
 * @returns {Hit[]}
 */
export function roundHits(match, content, { boost = {}, aim = null } = {}) {
  const { typeBonus } = cardRules(content);
  /** @type {Hit[]} */
  const hits = [];
  for (const who of /** @type {Seat[]} */ (['me', 'foe'])) {
    const side = match[who];
    const other = match[who === 'me' ? 'foe' : 'me'];
    for (const line of LINES) {
      const card = onLine(side, line);
      if (!card) continue;
      const aimed = who === 'me' && aim?.key === card.key && other.lines[aim.line] !== null ? aim.line : null;
      const at = aimed ?? targetLine(other, line);
      if (at === null) continue;
      const target = /** @type {MatchCard} */ (onLine(other, at));
      const advantage = typeBeats(card.type, target.type, content);
      const extra = who === 'me' ? (boost[card.key] ?? 0) : 0;
      const damage = Math.max(1, Math.round(card.attack * (1 + (advantage ? typeBonus : 0)) * (1 + extra)));
      hits.push({ side: who, line, key: card.key, target: { line: at, key: target.key }, damage, advantage, boosted: extra > 0 || aimed !== null });
    }
  }
  return hits;
}

// The player's turn played (checked by turnBlock first): its lines laid,
// its skill used, the round's blows dealt at once, the cards with no Życie
// beaten (a Kleryk's chosen card back with its share of Życie), the match
// over when a side has no cards left or the rounds run out; else both
// reserves drawn up and the rival's lines filled for the next round.
/**
 * @param {Match} current
 * @param {Turn} turn
 * @param {Content} content
 * @returns {Match}
 */
export function playTurn(current, turn, content) {
  const match = clone(current);
  const { me, foe } = match;
  const skill = turn.skill ?? null;
  const hero = skill && me.hero ? heroSkill(me.hero.classId, me.hero.stage, content) : null;
  // The Cień's card goes back to the reserve with the Życie it has.
  if (hero?.kind === 'swap' && skill) me.hand.push(skill.card);
  me.lines = [...turn.lines];
  me.hand = me.hand.filter((key) => !me.lines.includes(key));
  /** @type {Record<number, number>} */
  const boost = {};
  /** @type {{ key: number, line: number } | null} */
  let aim = null;
  let revive = null;
  if (hero && skill && me.hero) {
    me.hero.used = true;
    if (hero.kind === 'fury') boost[skill.card] = hero.power;
    if (hero.kind === 'aim') {
      aim = { key: skill.card, line: /** @type {number} */ (skill.target) };
      if (hero.power > 0) boost[skill.card] = hero.power;
    }
    if (hero.kind === 'shift') {
      me.cards[skill.card].type = /** @type {string} */ (skill.type);
      me.cards[skill.card].shifted = true;
      if (hero.power > 0) boost[skill.card] = hero.power;
    }
    if (hero.kind === 'swap' && hero.power > 0) boost[/** @type {number} */ (skill.swap)] = hero.power;
    if (hero.kind === 'revive') revive = skill.card;
  }
  const hits = roundHits(match, content, { boost, aim });
  for (const hit of hits) {
    const side = match[hit.side === 'me' ? 'foe' : 'me'];
    const card = side.cards[hit.target.key];
    card.life = Math.max(0, card.life - hit.damage);
  }
  /** @type {{ me: number[], foe: number[] }} */
  const beaten = { me: [], foe: [] };
  let revived = null;
  for (const who of /** @type {Seat[]} */ (['me', 'foe'])) {
    const side = match[who];
    for (const line of LINES) {
      const card = onLine(side, line);
      if (!card || card.life > 0) continue;
      if (who === 'me' && card.key === revive && hero) {
        card.life = Math.max(1, Math.round(card.max * hero.power));
        revived = card.key;
        continue;
      }
      side.lines[line] = null;
      side.out.push(card.key);
      beaten[who].push(card.key);
    }
  }
  match.last = { round: match.round, hits, beaten, revived, skill: hero && skill ? { ...skill, kind: hero.kind } : null, placed: [] };
  const mine = cardsLeft(me);
  const theirs = cardsLeft(foe);
  if (mine === 0 || theirs === 0) {
    match.result = mine === 0 && theirs === 0 ? 'drawn' : mine === 0 ? 'lost' : 'won';
    match.end = 'out';
    return match;
  }
  if (match.round >= cardRules(content).roundCap) {
    const life = lifeLeft(me) - lifeLeft(foe);
    match.result = mine !== theirs ? (mine > theirs ? 'won' : 'lost') : life !== 0 ? (life > 0 ? 'won' : 'lost') : 'drawn';
    match.end = 'cap';
    return match;
  }
  match.round += 1;
  refill(me, content);
  match.last.placed = rivalSetup(match, content);
  return match;
}

// The player gives up: the match lost.
/**
 * @param {Match} current
 * @returns {Match}
 */
export function surrenderMatch(current) {
  const match = clone(current);
  match.result = 'lost';
  match.end = 'surrender';
  return match;
}

// A turn for the player's side chosen by the game (the simulations, and the
// absent players of the second stage): its reserve's cards on its empty
// lines, those that hit hardest and take least this round (every way of
// them is tried: 4 cards on 3 lines is 24 at most), with no skill.
/**
 * @param {Match} match
 * @param {Content} content
 * @returns {Turn}
 */
export function autoTurn(match, content) {
  const { me } = match;
  const empty = LINES.filter((line) => me.lines[line] === null);
  const count = Math.min(empty.length, me.hand.length);
  /** @type {number[][]} */
  const picks = [];
  /** @param {number[]} chosen */
  const choose = (chosen) => {
    if (chosen.length === count) {
      picks.push(chosen);
      return;
    }
    for (const key of me.hand) if (!chosen.includes(key)) choose([...chosen, key]);
  };
  choose([]);
  /** @type {(number | null)[]} */
  let best = [...me.lines];
  let bestScore = -Infinity;
  for (const pick of picks) {
    // The cards picked, in their order, on the empty lines from the front.
    const lines = [...me.lines];
    pick.forEach((key, index) => (lines[empty[index]] = key));
    const trial = clone(match);
    trial.me.lines = lines;
    // The Życie taken on each side, and a beaten card worth twice its Atak
    // more: it hits no more.
    let score = 0;
    for (const hit of roundHits(trial, content)) {
      const side = trial[hit.side === 'me' ? 'foe' : 'me'];
      const target = side.cards[hit.target.key];
      const dealt = Math.min(hit.damage, target.life);
      const sign = hit.side === 'me' ? 1 : -1;
      score += sign * (dealt + (dealt >= target.life ? 2 * target.attack : 0));
      target.life -= dealt;
    }
    if (score > bestScore) {
      bestScore = score;
      best = lines;
    }
  }
  return { round: match.round, lines: best, skill: null };
}

// The match as the page sees it: the round, each side's lines with their
// cards, the player's reserve and the number of the rival's, the decks'
// sizes, the cards beaten, the heroes, the last round's account and the
// result. Never the seed, the decks' order nor the rival's reserve.
/**
 * @param {Match} match
 * @param {Content} content
 * @returns {Record<string, any>}
 */
export function matchView(match, content) {
  /** @param {MatchCard} card */
  const card = (card) => ({ ...cardView(card.id, card.level, content), key: card.key, ...typeView(card.type, content), attack: card.attack, life: card.life, max: card.max, ...(card.shifted && { shifted: true }) });
  /** @param {Hero | null} hero */
  const heroOf = (hero) => hero && { classId: hero.classId, stage: hero.stage, used: hero.used, skill: heroSkill(hero.classId, hero.stage, content) };
  /** @param {Side} side */
  const lines = (side) => side.lines.map((key) => (key === null ? null : card(side.cards[key])));
  return {
    round: match.round,
    cap: cardRules(content).roundCap,
    result: match.result,
    end: match.end,
    me: { lines: lines(match.me), hand: match.me.hand.map((key) => card(match.me.cards[key])), deck: match.me.deck.length, out: match.me.out.length, left: cardsLeft(match.me), hero: heroOf(match.me.hero) },
    foe: { lines: lines(match.foe), hand: match.foe.hand.length, deck: match.foe.deck.length, out: match.foe.out.length, left: cardsLeft(match.foe), hero: heroOf(match.foe.hero) },
    // The cards beaten last round, with their names, for its account.
    last: match.last && {
      ...match.last,
      beatenCards: { me: match.last.beaten.me.map((key) => card(match.me.cards[key])), foe: match.last.beaten.foe.map((key) => card(match.foe.cards[key])) },
    },
  };
}

// What the end of a match gives (875 A, 873 A): nothing in training; for a
// staked one, a win twice the stake, a draw the stake back, and a win the
// tier's reward of the day (`dailyGold`, unless `rewardedToday`) and, the
// first time the tier is beaten, its card (`firstCard`, chosen by
// firstWinCard).
/**
 * @param {{ result: string | null, staked: boolean, stake: number, dailyGold: number, rewardedToday: boolean, beatenBefore: boolean, firstCard: string | null }} end
 * @returns {{ gold: number, daily: number, card: string | null }}
 */
export function matchPayout({ result, staked, stake, dailyGold, rewardedToday, beatenBefore, firstCard }) {
  if (!staked) return { gold: 0, daily: 0, card: null };
  if (result === 'drawn') return { gold: stake, daily: 0, card: null };
  if (result !== 'won') return { gold: 0, daily: 0, card: null };
  return { gold: 2 * stake, daily: rewardedToday ? 0 : dailyGold, card: beatenBefore ? null : firstCard };
}

// Why a match cannot start, or null (875 A): the starter deck taken, a whole
// deck, no match running, a tier there is, and for a staked one a stake of
// the day left (perDay) and the gold for it.
/**
 * @param {{ tier: Record<string, any> | null, staked: boolean, hasDeck: boolean, running: boolean, stakedToday: number, gold: number, stake: number }} state
 * @param {Content} content
 * @returns {{ code: string, message: string, status?: number } | null}
 */
export function startBlock({ tier, staked, hasDeck, running, stakedToday, gold, stake }, content) {
  if (!tier) return { code: 'invalid_tier', message: 'Wybierz stopień Szczęsnego.' };
  if (!hasDeck) return { code: 'no_deck', message: `Najpierw ułóż talię z ${cardRules(content).deckSize} kart.`, status: 409 };
  if (running) return { code: 'match_running', message: 'Najpierw dokończ rozpoczętą partię.', status: 409 };
  if (staked && stakedToday >= cardRules(content).stakes.perDay) {
    return { code: 'stakes_used', message: `Na dziś to już wszystkie partie o stawkę (${cardRules(content).stakes.perDay}). Następne po północy, a trening jest bez limitu.`, status: 409 };
  }
  if (staked && gold < stake) return { code: 'not_enough_gold', message: 'Brakuje złota na stawkę.', status: 409 };
  return null;
}

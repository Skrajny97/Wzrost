// @ts-check
// Companions (the Osada, part II, questions 104–113): the Karczma's
// innkeeper has four candidates a week, each with a class, a level near the
// character's, two or three traits, two of its class's skills and a short
// story (data/settlement.json, `companions`). A companion hired goes on the
// character's explorations as a second member of the party, with the
// points of its level spread by its class, its skills growing with its
// level, the gear it came with and its traits, and gains XP with the
// character, faster while it is below it. Without wages (question 110).
// Fainted in a fight, it is wounded until the character has rested to full
// HP (the author: "Niech rany towarzyszy goją się wraz z ranami postaci").
//
// Stored in the Osada: { id, name, appearance, classId, level, xp, traits,
// skills, profession, story, gear: [items], wounded, giftWeek, stays,
// trained }. An item of `gear` the player gave from the bag is marked
// `given`; `stays` marks one told to stay in the Kwatery (companionStays);
// `trained` counts the day's trainings ({ day, count }, companionTraining).

import { playerCombatant } from './combatant.js';
import { baseClassLevel, canUse, generateItem } from './items.js';
import { gainXp, xpToNext } from './progression.js';
import { questPeriod } from './quests.js';
import { createRng } from './rng.js';
import { topLevel } from './skills.js';
import { autoDistribute } from './stats.js';
import { word } from './text.js';
import { weekCount, weekFactor } from './weeks.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {Record<string, any>} Companion A hired companion or a candidate, as the Osada keeps it. */
/** @typedef {Record<string, any>} Item An item as the gear keeps it. */
/** @typedef {{ code: string, message: string }} Block Why something cannot be done. */
/** @typedef {import('./rng.js').Rng} Rng */

/**
 * @param {Content} content
 * @returns {Record<string, any>}
 */
const tuning = (content) => content.settlement.companions;

// The skills of a class a companion can learn: its own, not an evolution's.
/**
 * @param {string} classId
 * @param {Content} content
 * @returns {Record<string, any>[]}
 */
const classSkills = (classId, content) => content.skills.filter((/** @type {Record<string, any>} */ skill) => skill.classId === classId);

// A skill's level at the companion's level: the first at the skill's class
// level, one more every skillStep levels, up to the skills' top level.
/**
 * @param {string} skillId
 * @param {number} level
 * @param {Content} content
 * @returns {number}
 */
export function companionSkillLevel(skillId, level, content) {
  const skill = content.skillsById[skillId];
  if (!skill || level < skill.classLevel) return 0;
  return Math.min(topLevel(skill, content), 1 + Math.floor((level - skill.classLevel) / tuning(content).skillStep));
}

// The gear a candidate comes with (question 108 B for the start; the
// player's items later): a common weapon of its class and the class's body
// armour, both at its level.
/**
 * @param {string} classId
 * @param {number} level
 * @param {Rng} rng
 * @param {Content} content
 * @returns {Item[]}
 */
function startingGear(classId, level, rng, content) {
  const cls = content.classesById[classId];
  /** @param {string} family */
  const firstOf = (family) =>
    content.bases.find((/** @type {Record<string, any>} */ base) => base.id === family) ??
    content.bases.find((/** @type {Record<string, any>} */ base) => (base.family ?? base.id) === family);
  const weapon = firstOf(cls.weapons[0]);
  const body = firstOf(cls.armor.at(-1));
  return [weapon, body].filter(Boolean).map((base) => generateItem(/** @type {any} */ ({ baseId: base.id, level }), rng, content));
}

// This week's candidates (question 106: "czterech tylko"), the same all
// week for the character: drawn from its seed and the week. `taken` are
// the ids already hired, who no longer wait in the Karczma.
/**
 * @param {{ character: Record<string, any>, seed: string }} owner
 * @param {number} now
 * @param {Content} content
 * @param {string[]} [taken]
 * @returns {Companion[]}
 */
export function drawCandidates({ character, seed }, now, content, taken = []) {
  const t = tuning(content);
  const week = questPeriod('weekly', now, content).key;
  const rng = createRng(`${seed}:candidates:${week}`);
  const used = new Set();
  /** @type {Companion[]} */
  const candidates = [];
  for (let index = 0; index < t.candidates; index++) {
    const classId = rng.pick(content.classes).id;
    const appearance = rng.pick(['female', 'male']);
    const names = t.names[appearance].filter((/** @type {string} */ name) => !used.has(name));
    const name = rng.pick(names);
    used.add(name);
    const level = Math.max(1, Math.min(content.balance.progression.maxLevel, character.level + rng.int(t.levelSpread[0], t.levelSpread[1])));
    // Two traits, and now and then a third ("2–3 cechy", the design).
    const count = rng.chance(t.thirdTraitChance) ? 3 : 2;
    /** @type {string[]} */
    const traits = [];
    while (traits.length < count) {
      const trait = rng.pick(t.traits.filter((/** @type {Record<string, any>} */ one) => !traits.includes(one.id)));
      traits.push(trait.id);
    }
    // Two skills of its class (question 109: "dwie umiejetnosci klasy").
    const pool = classSkills(classId, content);
    /** @type {string[]} */
    const skills = [];
    while (skills.length < 2 && skills.length < pool.length) {
      skills.push(rng.pick(pool.filter((skill) => !skills.includes(skill.id))).id);
    }
    const profession = rng.pick(t.professions).id;
    const story = rng.int(0, t.stories.length - 1);
    const gear = startingGear(classId, level, rng, content);
    candidates.push({ id: `${week}:${index}`, name, appearance, classId, level, xp: 0, traits, skills, profession, story, gear });
  }
  return candidates.filter((candidate) => !taken.includes(candidate.id));
}

// What hiring one costs: goldPerLevel for each of its levels.
// What hiring costs at `points` of the relation with the innkeeper: the
// companion's level times goldPerLevel, times its standing's priceByStanding.
// Any standing may hire, a lower one for more (the author: "Nie uzależniaj
// możliwości a cenę werbunku od stopnia znajomości. Powinienem móc ale
// drożej niż na wyższym stopniu").
/**
 * @param {Companion} companion
 * @param {Content} content
 * @param {number} [points]
 * @returns {number}
 */
export function hireCost(companion, content, points = 0) {
  const { standings } = content.settlement;
  const standing = standings.findLast((/** @type {{ points: number }} */ one) => one.points <= points) ?? standings[0];
  return Math.round(companion.level * tuning(content).goldPerLevel * (tuning(content).priceByStanding[standing.id] ?? 1));
}

// The companion as the engine's character: its points spread by its class
// (the design: "automatyczny rozdział punktów według klasy"), its skills at
// its level, its class's place in the line.
/**
 * @param {Companion} companion
 * @param {Content} content
 * @returns {Record<string, any>}
 */
export function companionCharacter(companion, content) {
  const cls = content.classesById[companion.classId];
  const base = { classId: companion.classId, level: companion.level, classLevel: companion.level, points: {}, professions: {}, appearance: companion.appearance };
  /** @type {[string, number][]} */
  const levels = companion.skills.map((/** @type {string} */ id) => [id, companionSkillLevel(id, companion.level, content)]);
  const skills = Object.fromEntries(levels.filter(([, level]) => level > 0));
  return { ...base, points: autoDistribute(base, content), skills, position: cls.position };
}

// The traits' changes, summed: { damage, armor, hp, dodge, crit, speed, will }.
/**
 * @param {Companion} companion
 * @param {Content} content
 * @returns {Record<string, number>}
 */
export function traitBonuses(companion, content) {
  /** @type {Record<string, number>} */
  const total = {};
  for (const id of companion.traits) {
    const trait = tuning(content).traits.find((/** @type {Record<string, any>} */ one) => one.id === id);
    for (const key of ['damage', 'armor', 'hp', 'dodge', 'crit', 'speed', 'will']) if (trait?.[key]) total[key] = (total[key] ?? 0) + trait[key];
  }
  return total;
}

// The standing of the relation with a companion: the residents' standings
// and their points (296 A: "stopnie są jak u mieszkańców"), under the
// companions' own names (the author, 5.11.2026: "stopnie relacji
// towarzyszy powinny brzmieć inaczej niż w Bractwach"), in the companion's
// form; its index and name, the points and the next standing.
/**
 * @param {Companion} companion
 * @param {Content} content
 * @returns {{ index: number, name: string, points: number, next: Record<string, any> | null }}
 */
export function companionStanding(companion, content) {
  const { standings } = content.settlement;
  const names = tuning(content).relation.standings;
  /** @param {number} index */
  const named = (index) => ({ ...standings[index], name: gendered(names[index] ?? standings[index].name, companion.appearance) });
  const points = companion.relation ?? 0;
  const index = Math.max(0, standings.findLastIndex((/** @type {{ points: number }} */ standing) => standing.points <= points));
  return { index, name: named(index).name, points, next: index + 1 < standings.length ? named(index + 1) : null };
}

// What the relation gives in a fight (296 A: "każdy stopień daje mu w walce
// +2% obrażeń i HP"): `bonus` for each standing above the first.
/**
 * @param {Companion} companion
 * @param {Content} content
 * @returns {number}
 */
export const bondBonus = (companion, content) => companionStanding(companion, content).index * tuning(content).relation.bonus;

// The relation an exploration of `minutes` together brings (296 A: "rośnie
// z każdą wspólną wyprawą"): perHour points an hour, to the fraction, with
// no least point a trip (341 A: very short explorations farmed it).
/**
 * @param {number} minutes
 * @param {Content} content
 * @returns {number}
 */
export const bondPoints = (minutes, content) => (minutes * tuning(content).relation.perHour) / 60;

// A text in the form for a woman or a man: "[a|b]" is a for her, b for him.
/**
 * @param {string} text
 * @param {string | undefined} appearance
 * @returns {string}
 */
export const gendered = (text, appearance) => text.replace(/\[([^[\]|]*)\|([^[\]|]*)\]/g, (_, female, male) => (appearance === 'female' ? female : male));

// The pieces of its story a companion has told in talks (295 A).
/**
 * @param {Companion} companion
 * @param {Content} content
 * @returns {string[]}
 */
export function toldPieces(companion, content) {
  const { talks } = tuning(content);
  return talks.stories[companion.story % talks.stories.length].slice(0, companion.told ?? 0).map((/** @type {string} */ piece) => gendered(piece, companion.appearance));
}

// Whether the character has talked with the companion today.
/**
 * @param {Companion} companion
 * @param {number} now
 * @param {Content} content
 * @returns {boolean}
 */
export const talkedToday = (companion, now, content) => companion.talkedOn === questPeriod('daily', now, content).key;

// A word of the day for a companion at the standing `index` (the author:
// "więcej opcji rozmów na różne stopnie"): one of that standing's chatter,
// or, with lowerChance, one of the standing just below, so the words repeat
// less. `rng` is seeded by the seed, the companion and the day, so the same
// three give the same word.
/**
 * @param {number} index
 * @param {Rng} rng
 * @param {Content} content
 * @returns {string}
 */
function chatterLine(index, rng, content) {
  const { chatter, lowerChance } = tuning(content).talks;
  const below = index > 0 && rng.chance(lowerChance);
  return rng.pick(chatter[content.settlement.standings[below ? index - 1 : index].id]);
}

// A talk with a companion, once a day (295 A: "towarzysz opowiada kawałek
// swojej historii, kolejne kawałki odsłaniają się z relacją, a rozmowa ją
// podnosi"): the next piece of its story once the relation has reached
// that piece's standing, else a word of chatter of its standing, picked by
// the day; and the companion after it, `talk` points closer, with the share
// of the week (`week`, the week of the talk; reputation, weeks.js), made
// whole fairly.
/**
 * @param {Companion} companion
 * @param {{ seed: string, now: number, week?: Record<string, any> | null }} talk
 * @param {Content} content
 */
export function talkWith(companion, { seed, now, week = null }, content) {
  const t = tuning(content);
  const day = questPeriod('daily', now, content).key;
  const points = weekCount(t.relation.talk, weekFactor(week, 'reputation'), `${seed}:talk:${companion.id}:${day}:week`);
  const pieces = t.talks.stories[companion.story % t.talks.stories.length];
  const told = companion.told ?? 0;
  const { index } = companionStanding(companion, content);
  // After an errand gone on together (817.7) the next talk recalls it, once
  // (818.4: „wspomina ją w rozmowach w Kwaterach”): one line for each story.
  const memories = t.talks.memories ?? [];
  const memory = companion.errand === 'together' && !companion.recalled && memories.length > 0 ? memories[companion.story % memories.length] : null;
  const story = !memory && told < pieces.length && told <= index;
  const text = memory ?? (story ? pieces[told] : chatterLine(index, createRng(`${seed}:talk:${companion.id}:${day}`), content));
  return {
    talk: { text: gendered(text, companion.appearance), story, points, ...(memory && { memory: true }) },
    companion: { ...companion, relation: (companion.relation ?? 0) + points, ...(story && { told: told + 1 }), ...(memory && { recalled: true }), talkedOn: day },
  };
}

// A companion after its errand (817.7): its relation `relation` points
// closer, or at once at its next standing ("next"; 818.4: „towarzysz od
// razu wchodzi na kolejny stopień relacji”), and the errand settled
// (`errand`: how it went, so it does not come again).
/**
 * @param {Companion} companion
 * @param {{ relation?: number | 'next' | null, errand?: string | null }} outcome
 * @param {Content} content
 * @returns {Companion}
 */
export function companionAfterErrand(companion, { relation, errand }, content) {
  const points = companion.relation ?? 0;
  const { next } = companionStanding(companion, content);
  const raised = relation === 'next' ? Math.max(points, next?.points ?? points) : points + (relation ?? 0);
  return { ...companion, relation: raised, ...(errand && { errand }) };
}

// The companion in a fight: a character of its class with its gear, its
// traits on top, and the relation's bonus (296 A). `hp` its HP now (full
// when not given).
/**
 * @param {Companion} companion
 * @param {{ hp?: number | null, area?: Record<string, any> | null, id?: string }} fight
 * @param {Content} content
 */
export function companionCombatant(companion, { hp, area, id = 'a1' } = {}, content) {
  const unit = playerCombatant({ character: companionCharacter(companion, content), equipped: companion.gear, hp, name: companion.name, area, id }, content);
  const bonus = traitBonuses(companion, content);
  const bond = bondBonus(companion, content);
  const maxHp = Math.max(1, Math.round(unit.maxHp * (1 + (bonus.hp ?? 0) + bond)));
  return {
    ...unit,
    isPlayer: false,
    companion: true,
    maxHp,
    hp: Math.min(hp ?? maxHp, maxHp),
    armor: Math.round(unit.armor * (1 + (bonus.armor ?? 0))),
    ...((bonus.damage || bond) && { damageBonus: (bonus.damage ?? 0) + bond }),
    dodgeRating: unit.dodgeRating * (1 + (bonus.dodge ?? 0)),
    critRating: unit.critRating * (1 + (bonus.crit ?? 0)),
    willRating: unit.willRating * (1 + (bonus.will ?? 0)),
    speed: unit.speed * (1 + (bonus.speed ?? 0)),
  };
}

// The XP a companion gains from an exploration's `xp`: xpShare of it, and
// catchUp more for each level it is below the character (the design:
// "z mnożnikiem nadrabiania").
/**
 * @param {Companion} companion
 * @param {number} xp
 * @param {number} characterLevel
 * @param {Content} content
 * @returns {number}
 */
export function companionXp(companion, xp, characterLevel, content) {
  const t = tuning(content);
  return Math.round(xp * t.xpShare * (1 + t.catchUp * Math.max(0, characterLevel - companion.level)));
}

// The companion after an exploration of `minutes`: its XP and levels, the
// relation the time together brings (296 A), with the share of the week
// the exploration set out in (`week`, reputation, weeks.js), and wounded
// when it fainted, until the character rests to full HP (companionReady).
/**
 * @param {Companion} companion
 * @param {{ xp: number, fainted?: boolean, minutes?: number, week?: Record<string, any> | null }} hunt
 * @param {number} characterLevel
 * @param {Content} content
 * @returns {Companion}
 */
export function companionAfterHunt(companion, { xp, fainted, minutes, week = null }, characterLevel, content) {
  const next = gainXp(companion.level, companion.xp ?? 0, companionXp(companion, xp, characterLevel, content), (level) => xpToNext(level, content), content.balance.progression.maxLevel);
  const relation = minutes ? { relation: (companion.relation ?? 0) + bondPoints(minutes, content) * weekFactor(week, 'reputation') } : {};
  const { woundedUntil: _, ...after } = /** @type {Companion} */ ({ ...companion, level: next.level, xp: next.xp, ...relation });
  return fainted ? { ...after, wounded: true } : after;
}

// Whether the companion goes on an exploration: a wounded one only once
// the character has rested to full HP (`rested`), as its wounds heal with
// the character's.
/**
 * @param {Companion | null | undefined} companion
 * @param {boolean} rested
 * @returns {boolean}
 */
export const companionReady = (companion, rested) => !!companion && (!companion.wounded || rested);

// Whether a hired companion stays in the Kwatery: told to stay (`stays`,
// "Zostań w kwaterze"), or while the character is in a Drużyna (`inParty`),
// whose explorations go without companions (the author: "wtedy nie poluje
// się z towarzyszem, tylko samemu/z drużyną"). One who stays goes on no
// exploration, so it gains no XP and no relation from them; its talks, its
// gift and the healing of its wounds go on. Since 828 B (11.11.2026) the
// companions no longer keep the character out of a Drużyna: they stay by
// themselves while it is in one, and `stays`, the player's own setting, is
// left as it was, so out of the party each goes back to it.
/**
 * @param {Companion} companion
 * @param {boolean} [inParty]
 * @returns {boolean}
 */
export const companionStays = (companion, inParty = false) => inParty || companion.stays === true;

// Whether the companion goes on the character's exploration now: one who
// does not stay, a wounded one once the character has rested to full HP.
/**
 * @param {Companion} companion
 * @param {{ rested: boolean, inParty?: boolean }} state
 * @returns {boolean}
 */
export const companionGoes = (companion, { rested, inParty = false }) => !companionStays(companion, inParty) && companionReady(companion, rested);

// How many hired companions go on the explorations at most: the places of
// a party beside the character (parties.size). The Kwatery at their 3rd
// level give a third bed, and the third companion waits there as a reserve
// (the author, 10.11.2026: „rekrutować więcej towarzyszy o 1 (ale zabierać
// na wyprawy dalej max 2)”).
/**
 * @param {Content} content
 * @returns {number}
 */
export const companionsGoingMost = (content) => content.balance.parties.size - 1;

// How many of the hired companions are set to go on the explorations (not
// told to stay in the Kwatery).
/**
 * @param {Companion[]} companions
 * @returns {number}
 */
export const companionsSetToGo = (companions) => companions.filter((companion) => !companionStays(companion)).length;

// The companion told to stay in the Kwatery (`stays`) or to go on the
// explorations again.
/**
 * @param {Companion} companion
 * @param {boolean} stays
 * @returns {Companion}
 */
export function staying(companion, stays) {
  const { stays: _, ...rest } = companion;
  return stays ? { ...rest, stays: true } : rest;
}

// One of the companions' texts (texts in data/settlement.json) for a
// companion: in its own form ([a|b]), with its {name} and `vars` filled in.
/**
 * @param {string} key
 * @param {Companion} companion
 * @param {Content} content
 * @param {Record<string, unknown>} [vars]
 * @returns {string}
 */
export function companionText(key, companion, content, vars = {}) {
  /** @type {Record<string, unknown>} */
  const words = { name: companion.name, ...vars };
  return gendered(tuning(content).texts[key], companion.appearance).replace(/\{(\w+)\}/g, (_, name) => String(words[name] ?? ''));
}

// The one question before a character makes or joins a Drużyna (828 B,
// 11.11.2026: „Dobrogost i Dobrosława zostaną w Kwaterach, póki jesteś w
// drużynie: nie zdobędą XP ani relacji z wypraw.”), or null when no
// companion goes on the explorations: those who go, named ("A", "A i B",
// "A, B i C"), stay in the Kwatery while it is in the party. Before 828
// they kept it out of every party until told to stay.
/**
 * @param {Companion[]} companions
 * @param {Content} content
 * @returns {string | null}
 */
export function partyStayText(companions, content) {
  const names = companions.filter((companion) => !companionStays(companion)).map((companion) => companion.name);
  if (names.length === 0) return null;
  const { texts } = tuning(content);
  const listed = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')}${word(content, ' i ')}${names.at(-1)}`;
  return (names.length === 1 ? texts.partyStayOne : texts.partyStayMany).replace('{names}', listed);
}

// Training a hired companion in the Kwatery (829 B, 11.11.2026; `training`
// in data/settlement.json): a level for goldPerLevel gold times the level it
// goes up to, at most perDay times a day for each companion (the day of the
// quests, as every daily limit) and only up to the character's level less
// belowCharacter. `block`: 'cap' at that level, 'day' after the day's
// trainings, or null; `price` and `level` of the next one, how many are
// `left` today and the `cap`.
/**
 * @param {Companion} companion
 * @param {number} characterLevel
 * @param {number} now
 * @param {Content} content
 */
export function companionTraining(companion, characterLevel, now, content) {
  const { goldPerLevel, perDay, belowCharacter } = tuning(content).training;
  const day = questPeriod('daily', now, content).key;
  const done = companion.trained?.day === day ? companion.trained.count : 0;
  const cap = Math.min(content.balance.progression.maxLevel, characterLevel - belowCharacter);
  const level = companion.level + 1;
  return {
    price: Math.round(goldPerLevel * level),
    level,
    cap,
    left: Math.max(0, perDay - done),
    perDay,
    below: belowCharacter,
    block: companion.level >= cap ? 'cap' : done >= perDay ? 'day' : null,
  };
}

// The companion after a training (companionTraining): a level up, the same
// as one earned on the explorations (its numbers and skills follow its
// level), with its XP towards the next level from nothing, as after a
// level reached with just the XP it needed, and the day's trainings
// counted (`trained`).
/**
 * @param {Companion} companion
 * @param {number} now
 * @param {Content} content
 * @returns {Companion}
 */
export function companionTrained(companion, now, content) {
  const day = questPeriod('daily', now, content).key;
  const done = companion.trained?.day === day ? companion.trained.count : 0;
  return { ...companion, level: companion.level + 1, xp: 0, trained: { day, count: done + 1 } };
}

// The companion after a try at upgrading the item it wears in `place` on
// the Kowadło (rollUpgrade in items.js; the author: "niech tu będzie opcja
// kliknięcia w przedmiot i ulepszania go jak na Kowadle"): the item at its
// new level, with the try's seed (`roll`) as the character's items keep it,
// or gone from its place when it broke.
/**
 * @param {Companion} companion
 * @param {string} place
 * @param {{ result: string, upgrade?: number }} outcome
 * @param {unknown} roll
 * @returns {Companion}
 */
export function upgradedOnCompanion(companion, place, outcome, roll) {
  const worn = companion.gear.find((/** @type {Item} */ item) => companionPlace(item.slot) === companionPlace(place));
  const gear =
    outcome.result === 'broken'
      ? companion.gear.filter((/** @type {Item} */ item) => item !== worn)
      : companion.gear.map((/** @type {Item} */ item) => (item === worn ? { ...item, upgrade: outcome.upgrade, lastRoll: roll } : item));
  return { ...companion, gear };
}

// The places a companion wears items in (the design: "broń, pancerz,
// talizman"): a weapon, armour and one piece of jewellery, an amulet, a
// ring or a talisman (the author on 5.11.2026: "zmień by towarzysze mogli
// nosić bizuterie ogolnie czyli amulety i pierscienie tez a nie sam
// talizman", and then: "Towarzysz ma móc zakładać albo Amulet albo
// Pierścień albo Talizman a nie wszystko na raz").
export const COMPANION_PLACES = ['weapon', 'chest', 'jewelry'];
const JEWELRY = ['amulet', 'ring', 'talisman'];

// The companion's place for an item of `slot` (or the place itself), or null.
/**
 * @param {string} slot
 * @returns {string | null}
 */
export const companionPlace = (slot) => (JEWELRY.includes(slot) ? 'jewelry' : COMPANION_PLACES.includes(slot) ? slot : null);

// Why the companion cannot wear `item` from the character's bag (question
// 108 A: "gracz zakłada towarzyszowi przedmioty jego klasy z plecaka"), or
// null: one of its places, its class, and its class level (its level) for
// the item's Tier, wherever the item came from, as for the character.
/**
 * @param {Companion} companion
 * @param {Item} item
 * @param {Content} content
 * @returns {Block | null}
 */
export function companionWearBlock(companion, item, content) {
  if (!companionPlace(item.slot)) return { code: 'wrong_slot', message: 'Towarzysz nosi tylko broń, pancerz i jedną sztukę biżuterii: amulet, pierścień albo talizman.' };
  if (!canUse(item.base, companion.classId, content)) return { code: 'wrong_class', message: 'Klasa towarzysza nie może używać tego przedmiotu.' };
  if (!canUse(item.base, companion.classId, content, companion.level)) {
    return { code: 'class_level', message: `Ten przedmiot towarzysz założy od poziomu ${baseClassLevel(item.base, content)}.` };
  }
  return null;
}

// The companion wearing `item` (marked as given) in its place, and what it
// wore there, which goes back to the bag (`off`): an amulet put on takes
// the place of a ring or a talisman too.
/**
 * @param {Companion} companion
 * @param {Item} item
 * @returns {{ companion: Companion, off: Item[] }}
 */
export function wearOnCompanion(companion, item) {
  const place = companionPlace(item.slot);
  /** @type {Item[]} */
  const off = companion.gear.filter((/** @type {Item} */ worn) => companionPlace(worn.slot) === place);
  return { companion: { ...companion, gear: [...companion.gear.filter((/** @type {Item} */ worn) => !off.includes(worn)), { ...item, given: true }] }, off };
}

// The companion taking off what it wears in `place` (the author: "Brakuje
// też opcji zdjęcia ekwipunku towarzyszowi"): the place is empty after it,
// and the item (`off`, given or its own) goes to the bag, as one taken off
// by "Załóż z plecaka" does. Nothing in the place: nothing taken off.
/**
 * @param {Companion} companion
 * @param {string} place
 * @returns {{ companion: Companion, off: Item[] }}
 */
export function takeOffCompanion(companion, place) {
  /** @type {Item[]} */
  const off = companion.gear.filter((/** @type {Item} */ worn) => companionPlace(worn.slot) === place);
  return { companion: { ...companion, gear: companion.gear.filter((/** @type {Item} */ worn) => !off.includes(worn)) }, off };
}

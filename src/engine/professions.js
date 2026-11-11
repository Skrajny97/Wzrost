// @ts-check
// Professions (data/professions.json): a level from the minutes worked, the
// stats each level gives, and the first one, Zielarstwo. The character
// gathers herbs in the Systemowy Zagajnik, with no fights and no risk: the
// slider sets the time, the profession's level the herbs the System shows and
// how many of them at once, and the seed saved at the start the herbs found.
// Herbs stack in the bag, rules.stack to a place, and what does not fit is
// lost. The work gives the character a little XP (rules.characterXpShare of
// what an hour of exploring gives) and no class XP.

import { levelUpMessages } from './hunt.js';
import { gainXp, xpPerHour, xpToNext } from './progression.js';
import { countEvents, createRng } from './rng.js';
import { say } from './text.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {Record<string, any>} Profession A profession (data/professions.json). */
/** @typedef {{ id: string, name: string, level: number, perHour: number } & Record<string, any>} Herb A herb (data/professions.json: herbs). */
/** @typedef {{ level: number, xp: number }} ProfessionState A profession as the character keeps it. */
/** @typedef {Record<string, ProfessionState>} Professions The character's professions, by id. */

// A profession as the character keeps it, { level, xp }: level 1 before any work.
/**
 * @param {Professions | null | undefined} professions
 * @param {string} id
 * @returns {ProfessionState}
 */
export const professionState = (professions, id) => ({ level: 1, xp: 0, ...professions?.[id] });

// The character level a profession opens at: its own (unlockLevel, for one
// that comes later), or that of the Profesje tab.
/**
 * @param {Profession} profession
 * @param {Content} content
 * @returns {number}
 */
export const professionUnlockLevel = (profession, content) => profession.unlockLevel ?? content.unlocksById.professions.level;
/**
 * @param {Profession} profession
 * @param {number} level
 * @param {Content} content
 */
export const professionOpen = (profession, level, content) => level >= professionUnlockLevel(profession, content);

// The minutes of work from a level to the next: a point of XP a minute.
/**
 * @param {Profession} profession
 * @param {number} level
 * @returns {number}
 */
export const professionXpToNext = (profession, level) => level * profession.levelMinutes;

// The profession after `minutes` of work, with the levels gained. At its top
// level the XP stays at 0. `factor`: the share more (or less) of the XP of
// the week the work began in (profession-xp, weeks.js), the XP rounded; the
// XP gained (`gained`) for the report, where the week made it other than the
// minutes.
/**
 * @param {Profession} profession
 * @param {ProfessionState} state
 * @param {number} minutes
 */
export function workProfession(profession, state, minutes, factor = 1) {
  const gained = factor === 1 ? minutes : Math.round(minutes * factor);
  const next = gainXp(state.level, state.xp, gained, (level) => professionXpToNext(profession, level), profession.maxLevel);
  return { level: next.level, xp: next.xp, levels: next.levels, ...(gained !== minutes && { gained }) };
}

// What a profession at a level adds to each of its two stats: statPerLevel
// for each level after the first, so level 1 adds nothing, and from its
// masteryLevel on maxLevelBonus on top, the reward for mastering it (the
// author: "taka sowita nagroda za zamknięcie trudnego działu"). The reward
// stays at the 100th level, the last one until the professions went on to
// the 200th (825), so no character lost any of it.
/**
 * @param {Profession} profession
 * @param {number} level
 * @returns {number}
 */
export const professionStatBonus = (profession, level) =>
  (level - 1) * profession.statPerLevel + (level >= profession.masteryLevel ? profession.maxLevelBonus : 0);

// What the professions add to the stats.
/**
 * @param {Professions | null | undefined} professions
 * @param {Content} content
 */
export function professionStats(professions, content) {
  /** @type {Record<string, number>} */
  const bonus = {};
  for (const profession of content.professions) {
    const { level } = professionState(professions, profession.id);
    for (const stat of profession.stats) bonus[stat] = (bonus[stat] ?? 0) + professionStatBonus(profession, level);
  }
  return bonus;
}

// The character's highest profession, { id, level }, or null before its
// first work: for the Ranking (the author: "będzie tam brany najwyższy z
// rozwijanych przez Postać z ikonką danej Profesji obok poziomu"). Of equal
// levels, the one first in professions.json.
/**
 * @param {Professions} professions
 * @param {Content} content
 */
export function highestProfession(professions, content) {
  /** @type {{ id: string, level: number } | null} */
  let best = null;
  for (const { id } of content.professions) {
    const level = professions[id]?.level ?? 0;
    if (level > 0 && level > (best?.level ?? 0)) best = { id, level };
  }
  return best;
}

// The herbs the System shows at a level of the gathering profession.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {Herb[]}
 */
export const knownHerbs = (level, content) => content.herbs.filter((/** @type {Herb} */ herb) => herb.level <= level);

// How many herbs the character gathers at once at a level.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {number}
 */
export const herbSlots = (level, content) => content.gathering.slots.findLast((/** @type {{ level: number }} */ slot) => slot.level <= level).herbs;

// Herbs of one kind an hour at a level: more with each level, and `more`
// more with the Bractwo Zielarzy (589 A, herbYield); `week`, the factor of
// the week the gathering began in (herbs, weeks.js).
/**
 * @param {Herb} herb
 * @param {number} level
 * @param {Content} content
 * @returns {number}
 */
export const herbsPerHour = (herb, level, content, more = 0, week = 1) => herb.perHour * (1 + content.gathering.yieldPerLevel * (level - 1)) * (1 + more) * week;

// The slider's times: the shortest, then every step up to the longest.
/**
 * @param {Content} content
 * @returns {number[]}
 */
export function gatheringMinutes(content) {
  const { min, step, max } = content.gathering.minutes;
  return Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, index) => min + index * step);
}

// What a gathering of `minutes` should bring of each herb, the time shared
// evenly among them: the expected count, and the lowest and highest the
// spread allows.
/**
 * @param {string[]} herbIds
 * @param {number} minutes
 * @param {number} level
 * @param {Content} content
 * @returns {Record<string, { expected: number, low: number, high: number }>}
 */
export function expectedHerbs(herbIds, minutes, level, content, more = 0, week = 1) {
  const { spread } = content.gathering;
  return Object.fromEntries(
    herbIds.map((id) => {
      const expected = (herbsPerHour(content.herbsById[id], level, content, more, week) * minutes) / 60 / herbIds.length;
      return [id, { expected, low: Math.floor(expected * (1 - spread)), high: Math.ceil(expected * (1 + spread)) }];
    }),
  );
}

// The herbs found, by id: each herb's expected count, ± the spread, made
// whole with the seed. A gathering always brings at least one herb. `more`:
// the Bractwo Zielarzy's share more, kept with the gathering when it began;
// `week`, the factor of the week it began in (herbs, weeks.js).
/**
 * @param {{ herbIds: string[], minutes: number, level: number, seed: string, more?: number, week?: number }} gathering
 * @param {Content} content
 * @returns {Record<string, number>}
 */
export function gatherHerbs({ herbIds, minutes, level, seed, more = 0, week = 1 }, content) {
  const rng = createRng(seed);
  const { spread } = content.gathering;
  const expected = expectedHerbs(herbIds, minutes, level, content, more, week);
  const found = Object.fromEntries(herbIds.map((id) => [id, countEvents(expected[id].expected * rng.float(1 - spread, 1 + spread), rng)]));
  if (Object.values(found).every((count) => count === 0)) found[herbIds[0]] = 1;
  return found;
}

// The places in the bag that herbs or potions take, by id: each kind apart,
// a stack of rules.stack to a place.
/**
 * @param {Record<string, number> | null | undefined} counts
 * @param {Content} content
 * @returns {number}
 */
export const bagStacks = (counts, content) =>
  Object.values(counts ?? {}).reduce((sum, count) => sum + Math.ceil(count / content.professionRules.stack), 0);

// Herbs found or potions brewed, put into the bag with `free` places left:
// first into the room left in each kind's last stack, then into new stacks
// while there are places. Gives what the bag holds of them after, and what
// went in and what did not, by id.
/**
 * @param {Record<string, number>} have
 * @param {Record<string, number>} found
 * @param {number} free
 * @param {Content} content
 */
export function storeStacks(have, found, free, content) {
  const { stack } = content.professionRules;
  /** @type {Record<string, number>} */
  const after = { ...have };
  /** @type {Record<string, number>} */
  const stored = {};
  /** @type {Record<string, number>} */
  const lost = {};
  let places = Math.max(0, free);
  for (const [id, count] of Object.entries(found)) {
    const have = after[id] ?? 0;
    const fits = Math.min(count, Math.ceil(have / stack) * stack - have + places * stack);
    places -= Math.ceil((have + fits) / stack) - Math.ceil(have / stack);
    if (fits > 0) {
      after[id] = have + fits;
      stored[id] = fits;
    }
    if (count > fits) lost[id] = count - fits;
  }
  return { after, stored, lost };
}

// The character's XP from `minutes` of work at its level.
/**
 * @param {number} level
 * @param {number} minutes
 * @param {Content} content
 * @returns {number}
 */
export const workXp = (level, minutes, content) =>
  Math.round(xpPerHour(level, content) * (minutes / 60) * content.professionRules.characterXpShare);

// The character after the XP of work: its level, and the free points, Time
// Points and System lines that come with a new one, as after an exploration
// (applyHunt, levelUpMessages). A new level heals fully.
/**
 * @param {Record<string, any>} character
 * @param {number} xp
 * @param {Content} content
 * @returns {{ level: number, xp: number, levelled: boolean, timePoints: number, messages: string[] }}
 */
export function applyWork(character, xp, content) {
  const next = gainXp(character.level, character.xp, xp, (level) => xpToNext(level, content), content.balance.progression.maxLevel);
  const levels = next.level - character.level;
  const messages = levelUpMessages(character, { level: next.level }, content);
  return { level: next.level, xp: next.xp, levelled: levels > 0, timePoints: content.balance.timePoints.perLevel * levels, messages };
}

// "7 × Żywokost, 3 × Bylica", of herbs or of potions (byId).
/**
 * @param {Record<string, number>} counts
 * @param {Record<string, { name: string }>} byId
 * @returns {string}
 */
export const countList = (counts, byId) =>
  Object.entries(counts)
    .map(([id, count]) => `${count} × ${byId[id].name}`)
    .join(', ');

// The System's lines for a profession's new levels: the level, then one gain
// to a line, as after an exploration (levelUpMessages).
/**
 * @param {Profession} profession
 * @param {{ level: number }} before
 * @param {{ level: number }} after
 * @param {Content} content
 * @returns {string[]}
 */
export function professionLevelLines(profession, before, after, content) {
  if (after.level <= before.level) return [];
  const texts = content.professionTexts;
  const gained = professionStatBonus(profession, after.level) - professionStatBonus(profession, before.level);
  return [
    say(texts, 'levelUp', 0, { profession: profession.genitive, level: after.level }),
    ...profession.stats.map((/** @type {string} */ stat) => say(texts, 'statGained', 0, { stat: content.statsById[stat].accusative, bonus: gained })),
  ];
}

// A profession in a report: its levels before and after, the XP of the
// `minutes` worked (with the week's share, workProfession's `gained`) and
// what the next level needs.
/**
 * @param {Profession} profession
 * @param {{ level: number }} before
 * @param {{ level: number, xp: number, gained?: number }} after
 * @param {number} minutes
 */
export const professionProgress = (profession, before, after, minutes) => ({
  id: profession.id,
  name: profession.name,
  levelBefore: before.level,
  levelAfter: after.level,
  xp: after.gained ?? minutes,
  xpAfter: after.xp,
  xpToNext: after.level < profession.maxLevel ? professionXpToNext(profession, after.level) : 0,
});

// The report of a gathering: a line about the grove from the seed, the herbs
// found and those the full bag lost, the profession's new levels with their
// stats and the herbs the System revealed with them, and the character's XP.
/**
 * @typedef {object} GatheringWork A finished gathering, as the server hands it over.
 * @property {number} minutes
 * @property {number} startedAt
 * @property {number} endsAt
 * @property {string} seed
 * @property {Record<string, number>} found
 * @property {Record<string, number>} stored
 * @property {Record<string, number>} lost
 * @property {{ level: number }} before The profession before the work.
 * @property {{ level: number, xp: number, gained?: number }} after The profession after it (workProfession).
 * @property {{ level: number } & Record<string, any>} character The character before the work.
 * @property {number} xp
 * @property {{ level: number, timePoints: number, messages: string[] }} work The character after the work (applyWork).
 */
/**
 * @param {GatheringWork} done
 * @param {Content} content
 */
export function gatheringReport({ minutes, startedAt, endsAt, seed, found, stored, lost, before, after, character, xp, work }, content) {
  const texts = content.professionTexts;
  const profession = content.professionsById[content.gathering.profession];
  /** @type {Herb[]} */
  const revealed = content.herbs.filter((/** @type {Herb} */ herb) => herb.level > before.level && herb.level <= after.level);
  return {
    kind: 'herbs',
    placeName: content.gathering.place.name,
    minutes,
    startedAt,
    endsAt,
    line: say(texts, 'report', createRng(`${seed}:line`).int(0, texts.report.length - 1)),
    herbs: Object.entries(found).map(([id, count]) => ({ id, name: content.herbsById[id].name, count, stored: stored[id] ?? 0, lost: lost[id] ?? 0 })),
    gathered: say(texts, 'gathered', 0, { herbs: countList(found, content.herbsById) }),
    lost: Object.keys(lost).length > 0 ? say(texts, 'lost', 0, { herbs: countList(lost, content.herbsById) }) : null,
    profession: professionProgress(profession, before, after, minutes),
    revealed: revealed.map((herb) => herb.id),
    summary: { xp, levelBefore: character.level, levelAfter: work.level, timePoints: work.timePoints },
    system: [
      ...professionLevelLines(profession, before, after, content),
      ...revealed.map((herb, index) => say(texts, 'revealed', index, { herb: herb.name })),
      ...work.messages,
    ],
  };
}

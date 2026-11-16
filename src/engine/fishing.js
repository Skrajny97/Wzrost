// @ts-check
// Rybołówstwo (data/professions.json: fishing and fish; 999.1, accepted by
// the author on 16.11.2026: „łowienie ryb w Systemowym Stawie, bez walk, jak
// zbieranie ziół”): the character fishes in the Systemowy Staw as it gathers
// herbs in the Zagajnik (professions.js): the fish chosen, as many kinds at
// once as the level's slots allow, the time on the slider, the level the
// fish the System shows and how many of them an hour, and the seed saved at
// the start what is caught. The fish take no room in the bag, as minerals
// do: they go to the Spiżarnia (the character's pantry, with the crops and
// dishes to come), and the innkeeper buys them.

import { countList, luckyPieces, masteryChance, professionLevelLines, professionProgress } from './professions.js';
import { countEvents, createRng } from './rng.js';
import { say } from './text.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ id: string, name: string, level: number, perHour: number, price: number }} Fish A fish of data/professions.json. */

// The fish the System shows at a level of Rybołówstwo.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {Fish[]}
 */
export const knownFish = (level, content) => content.fish.filter((/** @type {Fish} */ fish) => fish.level <= level);

// How many kinds of fish the character catches at once at a level.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {number}
 */
export const fishSlots = (level, content) => content.fishing.slots.findLast((/** @type {{ level: number }} */ slot) => slot.level <= level).fish;

// Fish of one kind an hour at a level: more with each level; `week`, the
// factor of the week the fishing began in (fish, weeks.js).
/**
 * @param {Fish} fish
 * @param {number} level
 * @param {Content} content
 * @param {number} [week]
 * @returns {number}
 */
export const fishPerHour = (fish, level, content, week = 1) => fish.perHour * (1 + content.fishing.yieldPerLevel * (level - 1)) * week;

// The slider's times: the shortest, then every step up to the longest.
/**
 * @param {Content} content
 * @returns {number[]}
 */
export function fishingMinutes(content) {
  const { min, step, max } = content.fishing.minutes;
  return Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, index) => min + index * step);
}

// What a fishing of `minutes` should bring of each fish, the time shared
// evenly among them: the expected count, and the lowest and highest the
// spread allows.
/**
 * @param {string[]} fishIds
 * @param {number} minutes
 * @param {number} level
 * @param {Content} content
 * @param {number} [week]
 * @returns {Record<string, { expected: number, low: number, high: number }>}
 */
export function expectedFish(fishIds, minutes, level, content, week = 1) {
  const { spread } = content.fishing;
  return Object.fromEntries(
    fishIds.map((id) => {
      const expected = (fishPerHour(content.fishById[id], level, content, week) * minutes) / 60 / fishIds.length;
      return [id, { expected, low: Math.floor(expected * (1 - spread)), high: Math.ceil(expected * (1 + spread)) }];
    }),
  );
}

// A fishing's catch, by id: each fish's expected count, ± the spread, made
// whole with the seed; a fishing always brings at least one fish. Past the
// mastery's level each fish caught has the mastery's chance of one more
// (masteryChance), drawn by the same seed after the rest: `found` has them
// all, `lucky` those the mastery added, as in the Zagajnik (herbHarvest).
/**
 * @param {{ fishIds: string[], minutes: number, level: number, seed: string, week?: number }} fishing
 * @param {Content} content
 * @returns {{ found: Record<string, number>, lucky: Record<string, number> }}
 */
export function fishCatch({ fishIds, minutes, level, seed, week = 1 }, content) {
  const rng = createRng(seed);
  const { spread } = content.fishing;
  const expected = expectedFish(fishIds, minutes, level, content, week);
  /** @type {Record<string, number>} */
  const found = Object.fromEntries(fishIds.map((id) => [id, countEvents(expected[id].expected * rng.float(1 - spread, 1 + spread), rng)]));
  if (Object.values(found).every((count) => count === 0)) found[fishIds[0]] = 1;
  const lucky = luckyPieces(found, masteryChance(content.fishing, level), rng);
  for (const [id, count] of Object.entries(lucky)) found[id] += count;
  for (const id of Object.keys(found)) if (found[id] === 0) delete found[id];
  return { found, lucky };
}

// The report of a fishing: a line about the Staw from the seed, the fish
// caught and the mastery's among them (`lucky`), the profession's new levels
// with their stats and the fish the System revealed with them, and the
// character's XP.
/**
 * @param {Record<string, any>} done
 * @param {Content} content
 */
export function fishingReport({ minutes, startedAt, endsAt, seed, found, lucky = {}, before, after, character, xp, work }, content) {
  const { fishing } = content;
  const texts = fishing.texts;
  const profession = content.professionsById[fishing.profession];
  /** @type {Fish[]} */
  const revealed = content.fish.filter((/** @type {Fish} */ fish) => fish.level > before.level && fish.level <= after.level);
  return {
    kind: 'fish',
    placeName: fishing.place.name,
    minutes,
    startedAt,
    endsAt,
    line: say(texts, 'report', createRng(`${seed}:line`).int(0, texts.report.length - 1)),
    fish: Object.entries(/** @type {Record<string, number>} */ (found)).map(([id, count]) => ({ id, name: content.fishById[id].name, count })),
    caught: say(texts, 'caught', 0, { fish: countList(found, content.fishById) }),
    lucky: Object.keys(lucky).length > 0 ? say(texts, 'lucky', 0, { fish: countList(lucky, content.fishById) }) : null,
    profession: professionProgress(profession, before, after, minutes),
    revealed: revealed.map((fish) => fish.id),
    summary: { xp, levelBefore: character.level, levelAfter: work.level, timePoints: work.timePoints },
    system: [
      ...professionLevelLines(profession, before, after, content),
      ...revealed.map((fish, index) => say(texts, 'revealed', index, { fish: fish.name })),
      ...work.messages,
    ],
  };
}

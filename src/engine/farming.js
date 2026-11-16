// @ts-check
// Rolnictwo (data/professions.json: farming and crops; 999.2, the board of
// 1005, accepted by the author on 16.11.2026): the character farms the
// Systemowe Pole as it fishes in the Systemowy Staw (fishing.js), but plot by
// plot: each plot of the field has the crop chosen for it, or none, and the
// time on the slider is shared evenly among the sown plots. The level gives
// more plots (4 at the first, 6 at the 10th, 9 at the 25th, 12 at the 50th
// and 16 at the 100th) and the crops the System shows; the seed saved at the
// start decides what each plot brings. The crops go to the Spiżarnia, as
// the fish do.

import { countList, luckyPieces, masteryChance, professionLevelLines, professionProgress } from './professions.js';
import { countEvents, createRng } from './rng.js';
import { say } from './text.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ id: string, name: string, level: number, perHour: number, price: number }} Crop A crop of data/professions.json. */
/** @typedef {(string | null)[]} Plots The crop of each plot of the field, by its id, or null for a plot left empty. */

// The crops the System shows at a level of Rolnictwo.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {Crop[]}
 */
export const knownCrops = (level, content) => content.crops.filter((/** @type {Crop} */ crop) => crop.level <= level);

// How many plots the field has at a level.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {number}
 */
export const plotCount = (level, content) => content.farming.plots.findLast((/** @type {{ level: number }} */ tier) => tier.level <= level).plots;

// The next level that gives more plots, with how many, or null past the last.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {{ level: number, plots: number } | null}
 */
export const nextPlots = (level, content) => content.farming.plots.find((/** @type {{ level: number }} */ tier) => tier.level > level) ?? null;

// Crops of one kind an hour at a level, for a field sown with it alone:
// more with each level; `week`, the factor of the week the farming began in
// (crops, weeks.js).
/**
 * @param {Crop} crop
 * @param {number} level
 * @param {Content} content
 * @param {number} [week]
 * @returns {number}
 */
export const cropsPerHour = (crop, level, content, week = 1) => crop.perHour * (1 + content.farming.yieldPerLevel * (level - 1)) * week;

// The slider's times: the shortest, then every step up to the longest.
/**
 * @param {Content} content
 * @returns {number[]}
 */
export function farmingMinutes(content) {
  const { min, step, max } = content.farming.minutes;
  return Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, index) => min + index * step);
}

// The sown plots' crops, in the field's order.
/**
 * @param {Plots} plots
 * @returns {string[]}
 */
export const sownPlots = (plots) => /** @type {string[]} */ (plots.filter((id) => typeof id === 'string'));

// What one sown plot of `crop` should bring in `minutes`: its share of the
// time (the field's time shared evenly among its `sown` plots).
/**
 * @param {Crop} crop
 * @param {number} minutes
 * @param {number} sown
 * @param {number} level
 * @param {Content} content
 * @param {number} [week]
 */
const plotExpected = (crop, minutes, sown, level, content, week = 1) => (cropsPerHour(crop, level, content, week) * minutes) / 60 / sown;

// What a farming of `minutes` should bring of each crop sown, its plots'
// shares together: the expected count, and the lowest and highest the
// spread allows.
/**
 * @param {Plots} plots
 * @param {number} minutes
 * @param {number} level
 * @param {Content} content
 * @param {number} [week]
 * @returns {Record<string, { expected: number, low: number, high: number }>}
 */
export function expectedHarvest(plots, minutes, level, content, week = 1) {
  const { spread } = content.farming;
  const sown = sownPlots(plots);
  /** @type {Record<string, number>} */
  const expected = {};
  for (const id of sown) expected[id] = (expected[id] ?? 0) + plotExpected(content.cropsById[id], minutes, sown.length, level, content, week);
  return Object.fromEntries(Object.entries(expected).map(([id, value]) => [id, { expected: value, low: Math.floor(value * (1 - spread)), high: Math.ceil(value * (1 + spread)) }]));
}

// A farming's harvest, plot by plot: each sown plot's share ± the spread,
// made whole with the seed; a field always brings at least one crop. Past
// the mastery's level each crop harvested has the mastery's chance of one
// more (masteryChance), drawn by the same seed after the rest, as in the
// Zagajnik: `found` has them all by crop, `lucky` those the mastery added,
// and `byPlot` each plot's count, the mastery's at the first plot of its
// crop (null for a plot left empty).
/**
 * @param {{ plots: Plots, minutes: number, level: number, seed: string, week?: number }} farming
 * @param {Content} content
 * @returns {{ found: Record<string, number>, lucky: Record<string, number>, byPlot: (number | null)[] }}
 */
export function harvest({ plots, minutes, level, seed, week = 1 }, content) {
  const rng = createRng(seed);
  const { spread } = content.farming;
  const sown = sownPlots(plots);
  const byPlot = plots.map((id) =>
    typeof id === 'string' ? countEvents(plotExpected(content.cropsById[id], minutes, sown.length, level, content, week) * rng.float(1 - spread, 1 + spread), rng) : null,
  );
  if (sown.length > 0 && byPlot.every((count) => !count)) byPlot[plots.findIndex((id) => typeof id === 'string')] = 1;
  /** @type {Record<string, number>} */
  const found = {};
  plots.forEach((id, index) => {
    const count = byPlot[index];
    if (typeof id === 'string' && count) found[id] = (found[id] ?? 0) + count;
  });
  const lucky = luckyPieces(found, masteryChance(content.farming, level), rng);
  for (const [id, count] of Object.entries(lucky)) {
    found[id] += count;
    const first = plots.indexOf(id);
    byPlot[first] = (byPlot[first] ?? 0) + count;
  }
  return { found, lucky, byPlot };
}

// The stage the field's plants are at, from 1 to the data's `stages`, by
// the share of the farming's time gone (1005.3: seeds with sprouts,
// seedlings, young plants, ripe plants).
/**
 * @param {number} share
 * @param {Content} content
 * @returns {number}
 */
export const growthStage = (share, content) => Math.min(content.farming.stages, Math.max(1, Math.floor(share * content.farming.stages) + 1));

// The report of a farming: a line about the field from the seed, the crops
// harvested, plot by plot and together, the mastery's among them (`lucky`),
// the profession's new levels with their stats and the crops the System
// revealed with them, and the character's XP.
/**
 * @param {Record<string, any>} done
 * @param {Content} content
 */
export function farmingReport({ minutes, startedAt, endsAt, seed, plots, byPlot, found, lucky = {}, before, after, character, xp, work }, content) {
  const { farming } = content;
  const texts = farming.texts;
  const profession = content.professionsById[farming.profession];
  /** @type {Crop[]} */
  const revealed = content.crops.filter((/** @type {Crop} */ crop) => crop.level > before.level && crop.level <= after.level);
  return {
    kind: 'crops',
    placeName: farming.place.name,
    minutes,
    startedAt,
    endsAt,
    line: say(texts, 'report', createRng(`${seed}:line`).int(0, texts.report.length - 1)),
    crops: Object.entries(/** @type {Record<string, number>} */ (found)).map(([id, count]) => ({ id, name: content.cropsById[id].name, count })),
    plots: /** @type {Plots} */ (plots).map((id, index) => (typeof id === 'string' && content.cropsById[id] ? { id, name: content.cropsById[id].name, count: byPlot?.[index] ?? 0 } : null)),
    harvested: say(texts, 'harvested', 0, { crops: countList(found, content.cropsById) }),
    lucky: Object.keys(lucky).length > 0 ? say(texts, 'lucky', 0, { crops: countList(lucky, content.cropsById) }) : null,
    profession: professionProgress(profession, before, after, minutes),
    revealed: revealed.map((crop) => crop.id),
    summary: { xp, levelBefore: character.level, levelAfter: work.level, timePoints: work.timePoints },
    system: [
      ...professionLevelLines(profession, before, after, content),
      ...revealed.map((crop, index) => say(texts, 'revealed', index, { crop: crop.name })),
      ...work.messages,
    ],
  };
}

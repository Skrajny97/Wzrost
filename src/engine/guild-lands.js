// @ts-check
// Krainy pod sztandarem (1200 A; data/guilds.json `lands`;
// src/server/guild-lands.js; DECISIONS.md, "Krainy pod sztandarem"): each
// week every land (a region of data/regions.json, from Wiatrołomy to Kraina
// bez Słońca, the lands of the Wyprawa Gildii) goes to the guild whose
// members spent the most minutes of exploration there, counted as the
// Wyprawa Gildii counts them: a member's own minutes, as it claims its
// report, on a Drużyna's trip too. On Monday the winner raises its banner
// there for the week: its tag on the land's card, `fame` Sława for the
// guild, split among its members by their minutes in the land, and `bonus`
// more gold and materials from the creatures of the land for its members.
// Of two guilds with as much, the older one (the lower id); no banner
// where nobody explored. Pure: the minutes are the server's.

import { decimalText } from './text.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ landId: string, guildId: number, minutes: number }} LandMinutes A guild's minutes in a land in a week. */
/** @typedef {{ landId: string, guildId: number, minutes: number }} Banner */

/**
 * The numbers of the lands' banners: the Sława a land gives its guild and
 * the share more gold and materials from its creatures.
 * @param {Content} content
 * @returns {{ fame: number, bonus: number }}
 */
export const landRules = (content) => ({ fame: content.guilds.lands.fame, bonus: content.guilds.lands.bonus });

/**
 * The land of a place (its region's id), or null for one the game has not.
 * @param {string} areaId
 * @param {Content} content
 * @returns {string | null}
 */
export const landOfArea = (areaId, content) => content.areasById[areaId]?.regionId ?? null;

/**
 * The report's line of the banner of the character's guild over the land
 * an exploration set out in (`hunt.banner`, its share more gold and
 * materials from the creatures), where the exploration brought gold or
 * materials; null otherwise (a faint loses them all).
 * @param {Record<string, any>} hunt
 * @param {Content} content
 * @returns {string | null}
 */
export function bannerLine(hunt, content) {
  if (!(hunt.banner > 0) || !(hunt.gold > 0 || Object.keys(hunt.materials ?? {}).length > 0)) return null;
  return content.guilds.lands.texts.report.replace('{bonus}', decimalText(Math.round(hunt.banner * 1000) / 10, content));
}

// The better of two guilds' minutes in a land: the more minutes, of as
// many the older guild (the lower id).
/**
 * @param {{ guildId: number, minutes: number }} a
 * @param {{ guildId: number, minutes: number }} b
 */
const better = (a, b) => b.minutes - a.minutes || a.guildId - b.guildId;

/**
 * Each land's guilds by their minutes there, the best first; lands the game
 * has not and minutes of nothing left out.
 * @param {LandMinutes[]} rows
 * @param {Content} content
 * @returns {Map<string, { guildId: number, minutes: number }[]>}
 */
function byLand(rows, content) {
  /** @type {Map<string, Map<number, number>>} */
  const sums = new Map();
  for (const row of rows) {
    if (!content.regionsById[row.landId] || !(row.minutes > 0)) continue;
    const land = sums.get(row.landId) ?? new Map();
    land.set(row.guildId, (land.get(row.guildId) ?? 0) + row.minutes);
    sums.set(row.landId, land);
  }
  return new Map([...sums].map(([landId, guilds]) => [landId, [...guilds].map(([guildId, minutes]) => ({ guildId, minutes })).sort(better)]));
}

/**
 * The banners of a week that ended: for each land where anyone explored,
 * the guild with the most minutes there (of as many, the older one), in the
 * order of the lands.
 * @param {LandMinutes[]} rows
 * @param {Content} content
 * @returns {Banner[]}
 */
export function landWinners(rows, content) {
  const lands = byLand(rows, content);
  /** @type {Banner[]} */
  const banners = [];
  for (const region of content.regions) {
    const best = lands.get(region.id)?.[0];
    if (best) banners.push({ landId: region.id, guildId: best.guildId, minutes: best.minutes });
  }
  return banners;
}

/**
 * A land's Sława split among the members by their minutes there (`minutes`:
 * character id to its minutes), whole points only, so the shares together
 * may come out a little below it, as the members' Sława does.
 * @param {number} points
 * @param {Map<number, number>} minutes
 * @returns {{ characterId: number, points: number }[]}
 */
export function landShares(points, minutes) {
  const total = [...minutes.values()].reduce((sum, one) => sum + Math.max(0, one), 0);
  if (!(total > 0) || !(points > 0)) return [];
  return [...minutes]
    .map(([characterId, own]) => ({ characterId, points: Math.floor((points * Math.max(0, own)) / total) }))
    .filter((share) => share.points > 0);
}

/**
 * How a guild stands in each land this week, in the order of the lands,
 * those where anyone explored: its own minutes, the best other guild (its
 * id and minutes, or null), and whether it would raise the banner now
 * (`lead`: the most minutes, of as many the older guild; `alone`: only it
 * explored there) or chase the one that would (`chase`), with the minutes
 * between them (`gap`: 0 for as many, which the older guild wins).
 * @param {LandMinutes[]} rows
 * @param {number} guildId
 * @param {Content} content
 * @returns {{ landId: string, own: number, rival: { guildId: number, minutes: number } | null, state: 'lead' | 'alone' | 'chase', gap: number }[]}
 */
export function landStandings(rows, guildId, content) {
  const lands = byLand(rows, content);
  /** @type {{ landId: string, own: number, rival: { guildId: number, minutes: number } | null, state: 'lead' | 'alone' | 'chase', gap: number }[]} */
  const standings = [];
  for (const region of content.regions) {
    const guilds = lands.get(region.id);
    if (!guilds) continue;
    const own = guilds.find((one) => one.guildId === guildId)?.minutes ?? 0;
    const rival = guilds.find((one) => one.guildId !== guildId) ?? null;
    if (guilds[0].guildId === guildId) {
      standings.push({ landId: region.id, own, rival, state: rival ? 'lead' : 'alone', gap: rival ? own - rival.minutes : own });
    } else {
      standings.push({ landId: region.id, own, rival, state: 'chase', gap: guilds[0].minutes - own });
    }
  }
  return standings;
}

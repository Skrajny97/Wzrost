// @ts-check
// Bohaterowie tygodnia (1198 A; data/guilds.json `heroes`;
// src/server/guild-heroes.js; DECISIONS.md, "Bohaterowie tygodnia"): every
// Monday at midnight in Poland the game names the best members of each
// guild of the week that ended: the Filar Gildii (the most Sława it brought
// the guild), the Pogromca (the most damage dealt to the Bestia and the
// Wyprawa's guardians) and the Dobroczyńca (the most pieces given in the
// Prośby). Only the members of now count; of two with as much, the one in
// the guild longer, then the lower id; nobody wins with nothing. Each
// winner wears its badge the whole week after and gets the reward once.
// Pure: the counts are the server's.

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ id: number, joinedAt: number }} HeroMember A member of the guild now: its id and when it joined. */
/** @typedef {{ kind: string, characterId: number, value: number }} WeekHero */

/**
 * The kinds of heroes, in their order (pillar, slayer, benefactor).
 * @param {Content} content
 * @returns {{ id: string, names: string[] }[]}
 */
export const heroKinds = (content) => content.guilds.heroes.kinds;

/**
 * The heroes of one guild's week: for each kind the member of now with the
 * most of its count (`counts[kind]`: a Map or object of character id to
 * its count), above nothing; of two with as much, the one in the guild
 * longer, then the lower id. A kind nobody counts for has no hero.
 * @param {{ members: HeroMember[], counts: Record<string, Map<number, number> | Record<string, number>> }} week
 * @param {Content} content
 * @returns {WeekHero[]}
 */
export function weekHeroes({ members, counts }, content) {
  /** @type {WeekHero[]} */
  const heroes = [];
  for (const kind of heroKinds(content)) {
    const count = counts[kind.id];
    /** @param {number} id */
    const of = (id) => Math.max(0, Math.floor(Number((count instanceof Map ? count.get(id) : count?.[String(id)]) ?? 0) || 0));
    const best = [...members]
      .filter((member) => of(member.id) > 0)
      .sort((a, b) => of(b.id) - of(a.id) || a.joinedAt - b.joinedAt || a.id - b.id)[0];
    if (best) heroes.push({ kind: kind.id, characterId: best.id, value: of(best.id) });
  }
  return heroes;
}

/**
 * A hero's name for a character of `appearance` ("Pogromczyni" for a
 * woman), or the kind's id when the data has none.
 * @param {string} kind
 * @param {string} appearance
 * @param {Content} content
 * @returns {string}
 */
export function heroName(kind, appearance, content) {
  const found = heroKinds(content).find((one) => one.id === kind);
  if (!found) return kind;
  return found.names[appearance === 'female' ? 1 : 0] ?? found.names[0];
}

/**
 * What every hero gets, once: Punkty Czasu and packs of cards.
 * @param {Content} content
 * @returns {{ timePoints: number, packs: number }}
 */
export const heroReward = (content) => ({ timePoints: content.guilds.heroes.reward.timePoints, packs: content.guilds.heroes.reward.packs });

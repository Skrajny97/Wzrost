// @ts-check
// Osiągnięcia z tytułami (1030; the list and the window 1036.1–1036.2
// accepted, the title only in the profile and the Ranking: 1036.3 B; data in
// data/achievements.json): each achievement's count from the character's
// facts (what the server gathers: src/server/achievements.js), whether it is
// done, the view of them all, and the title worn.

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {Record<string, any>} Achievement An achievement as the data has it. */
/** @typedef {Record<string, any>} Facts What counts, by the achievements' `count` (`count:land` for one of a land: achievementFact); `shown` the count and target a bar shows instead (a land's cards). */

/**
 * @param {Content} content
 * @returns {Achievement[]}
 */
export const achievementList = (content) => content.achievements.groups.flatMap((/** @type {{ list: Achievement[] }} */ group) => group.list);

/**
 * @param {string} id
 * @param {Content} content
 * @returns {Achievement | null}
 */
export const achievementOf = (id, content) => achievementList(content).find((one) => one.id === id) ?? null;

/**
 * The fact an achievement counts: its `count`, and for one of a land
 * (landPlaces, landReached) that land's own, `count:land`, so that two of
 * the same count, the explorers of the Łysogóry and of Nawia, each count
 * their land.
 * @param {Achievement} one
 * @returns {string}
 */
export const achievementFact = (one) => (one.land ? `${one.count}:${one.land}` : one.count);

/**
 * An achievement's count, at most its target.
 * @param {Achievement} one
 * @param {Facts} facts
 */
export const achievementCount = (one, facts) => Math.min(one.target, Math.max(0, Math.floor(Number(facts[achievementFact(one)]) || 0)));

/**
 * @param {Achievement} one
 * @param {Facts} facts
 */
export const achievementDone = (one, facts) => achievementCount(one, facts) >= one.target;

/**
 * The title of an achievement for a character of `appearance`.
 * @param {Achievement} one
 * @param {string} appearance
 */
export const titleOf = (one, appearance) => one.title[appearance === 'female' ? 1 : 0];

/**
 * The achievements done now whose rewards are not given yet (`granted`:
 * those given, by id).
 * @param {Facts} facts
 * @param {Record<string, number>} granted
 * @param {Content} content
 * @returns {Achievement[]}
 */
export const newlyDone = (facts, granted, content) => achievementList(content).filter((one) => !granted[one.id] && achievementDone(one, facts));

/**
 * The title a character wears: its worn achievement's, once that is given;
 * else null.
 * @param {string | null} worn
 * @param {Record<string, number>} granted
 * @param {string} appearance
 * @param {Content} content
 * @returns {string | null}
 */
export function wornTitle(worn, granted, appearance, content) {
  const one = worn && granted[worn] ? achievementOf(worn, content) : null;
  return one ? titleOf(one, appearance) : null;
}

/**
 * The window of the achievements: the title worn and the groups, each
 * achievement with its count and target (or those `shown` for its bar), its
 * title for the character, its reward and picture, done (given), and
 * whether its count began with the version that brought it (`since`).
 * @param {Facts} facts
 * @param {Record<string, number>} granted
 * @param {string | null} worn
 * @param {string} appearance
 * @param {Content} content
 */
export function achievementsView(facts, granted, worn, appearance, content) {
  const { since, texts } = content.achievements;
  const shown = /** @type {Record<string, { count: number, target: number }>} */ (facts.shown ?? {});
  return {
    since: texts.since,
    worn: wornTitle(worn, granted, appearance, content),
    wornId: worn && granted[worn] ? worn : null,
    groups: content.achievements.groups.map((/** @type {{ id: string, name: string, list: Achievement[] }} */ group) => ({
      id: group.id,
      name: group.name,
      list: group.list.map((one) => {
        const done = Boolean(granted[one.id]);
        const bar = !done && shown[one.count] ? shown[one.count] : { count: done ? one.target : achievementCount(one, facts), target: one.target };
        return {
          id: one.id,
          name: one.name,
          goal: one.goal,
          count: bar.count,
          target: bar.target,
          done,
          title: titleOf(one, appearance),
          reward: one.reward,
          art: one.art,
          since: since.includes(one.count),
        };
      }),
    })),
  };
}

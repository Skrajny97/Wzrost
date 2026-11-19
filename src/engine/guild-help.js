// @ts-check
// Pomoc przy budowach i przy pracy (the author's 1196 A and B, accepted on
// the review page on 19.11.2026; data/guilds.json `help`, the Sława in
// `fame.help`; src/server/guild-help.js): the build under way in a member's
// Obóz or Warownia and a member's own work in a profession show on the
// Gildia tab, and the other members of the guild, of other accounts, help
// them: each help cuts the build's or the work's time by a share of its
// whole length (1%), at least `minMinutes`, never past the moment of the
// help, so a help ends it at most then; a build or a work takes at most
// `maxHelps` helps, each helper's once. A build is known by its building
// and level, and its helps are those given since it began (its start as it
// stands, which only moves back); a work by a key of its own seed (the
// server's hash of it, so no page learns the seed). Pure: the server gives
// the time.

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ share: number, minMinutes: number, maxHelps: number }} HelpRules */

const MINUTE = 60000;

/**
 * @param {Content} content
 * @returns {HelpRules}
 */
const rules = (content) => content.guilds.help;

// The works of the professions a guild may help with, by the activity's
// kind, each with its place in data/professions.json (whose `profession`
// names it), as the phone's notices know them (notifications.js); not an
// exploration, a mercenary's service nor an Awatar's work.
/** @type {Record<string, string>} */
export const HELP_WORKS = {
  herbs: 'gathering',
  potions: 'brewing',
  items: 'workshop',
  minerals: 'mining',
  jewels: 'jewelcrafting',
  fish: 'fishing',
  crops: 'farming',
  dishes: 'cooking',
};

// Whether an activity of `kind` is a work a guild may help with.
/** @param {string | null | undefined} kind */
export const helpableWork = (kind) => typeof kind === 'string' && Object.hasOwn(HELP_WORKS, kind);

// The profession of a work's kind, or null.
/**
 * @param {string} kind
 * @param {Content} content
 * @returns {{ id: string, name: string } | null}
 */
export function helpProfession(kind, content) {
  const place = HELP_WORKS[kind];
  const id = place ? content[place]?.profession : null;
  return (id && content.professionsById?.[id]) || null;
}

// The key of what is helped: a build by its building and the level it
// reaches, a work by the key of its seed.
/**
 * @param {{ buildingId: string, level: number } | { work: string }} target
 * @returns {string}
 */
export const helpTarget = (target) => ('work' in target ? `work:${target.work}` : `build:${target.buildingId}:${target.level}`);

// How much one help cuts off a build or a work that runs from `startedAt`
// to `endsAt`, at `now`: `share` of its whole length, at least minMinutes,
// and no more than is left of it, in milliseconds (0 once it is over).
/**
 * @param {number} startedAt
 * @param {number} endsAt
 * @param {number} now
 * @param {Content} content
 * @returns {number}
 */
export function helpCut(startedAt, endsAt, now, content) {
  const { share, minMinutes } = rules(content);
  const cut = Math.max(minMinutes * MINUTE, Math.floor(Math.max(0, endsAt - startedAt) * share));
  return Math.max(0, Math.min(cut, endsAt - now));
}

// Whether one more help is open for a build or a work that has `helps`
// already, none of them by this helper (`mine`).
/**
 * @param {number} helps
 * @param {boolean} mine
 * @param {Content} content
 */
export const helpOpen = (helps, mine, content) => !mine && helps < rules(content).maxHelps;

// "14 min", "1 h", "2 h 5 min": a cut's length in whole minutes, at least
// one, as the page writes a time (format.js, formatMinutes).
/** @param {number} ms */
export function cutText(ms) {
  const minutes = Math.max(1, Math.round(ms / MINUTE));
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${rest} min`;
}

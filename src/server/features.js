// Parts of the game switched on for a deployment (vars in wrangler.jsonc).
// Local work and the test version have the professions and Rzemieślnictwo;
// the live game shows Zielarstwo and Alchemia once they are ready, with
// Rzemieślnictwo locked ("Wkrótce") until it is done. The test version
// takes no new accounts (REGISTRATION "closed"): only the author's, made
// before. The events at the end of an exploration are on (EVENTS "on"),
// and the test version (EVENTS "test") also has the outcomes the author has
// not approved yet (drafts). The class evolutions are on except where
// EVOLUTIONS is "off", which plays as before them (the live game hid them
// in versions 0.0.58–0.0.60). English (ENGLISH "on", i18n.js) is on
// everywhere from version 0.1.97; where it is off, the game answers in
// Polish and offers no choice of language. The weeks of the year
// (src/server/weeks.js) give their effects where WEEKS is "on"; the API
// tests turn them off, so a test's numbers do not hang on the week it runs
// in. The guild wars (guild-wars.js) are only where GUILD_WARS is "on":
// first on the test version. The payments for Punkty Systemu (payments.js)
// are only where PAYMENTS names the gateway they go through ("test": the
// tests' own, signed with PAYMENTS_TEST_SECRET); off everywhere else. The
// env is the same for every request of a deployment, so the switches are
// read once per request
// (index.js) and kept here for the rest of the code.

let professions = false;
let crafting = false;
let registration = true;
let events = false;
let eventDrafts = false;
let evolutions = true;
let settlement = false;
let fortress = false;
let english = false;
let arena = false;
let weeks = false;
let guildWars = false;
let payments = '';
let paymentsForAuthors = false;
let labyrinth = false;

export function readFeatures(env) {
  professions = env.PROFESSIONS === 'on';
  crafting = env.CRAFTING === 'on';
  registration = env.REGISTRATION !== 'closed';
  events = env.EVENTS === 'on' || env.EVENTS === 'test';
  eventDrafts = env.EVENTS === 'test';
  evolutions = env.EVOLUTIONS !== 'off';
  settlement = env.SETTLEMENT === 'on';
  fortress = env.FORTRESS === 'on';
  english = env.ENGLISH === 'on';
  arena = env.ARENA === 'on';
  weeks = env.WEEKS === 'on';
  guildWars = env.GUILD_WARS === 'on';
  payments = typeof env.PAYMENTS === 'string' ? env.PAYMENTS.trim() : '';
  paymentsForAuthors = env.PAYMENTS_FOR === 'authors';
  labyrinth = env.LABYRINTH === 'on';
}

export const professionsOn = () => professions;
// Rzemieślnictwo needs the professions too.
export const craftingOn = () => professions && crafting;
export const registrationOpen = () => registration;
// The events at the end of an exploration (events.js), and their drafts.
export const eventsOn = () => events;
export const eventDraftsOn = () => eventDrafts;
// The class evolutions (evolutions.js) and their Ewolucja tab.
export const evolutionsOn = () => evolutions;
// The Osada (settlement.js), first only where SETTLEMENT is "on".
export const settlementOn = () => settlement;
// The Warownia (fortress.js), first only where FORTRESS is "on", like the
// Osada before it came into the game.
export const fortressOn = () => fortress;
// The English beta (i18n.js): the language of each request and the choice
// of it, first only where ENGLISH is "on".
export const englishOn = () => english;
// The Arena in the Osada (pvp-arena.js), only where ARENA is "on": in the
// live game from version 0.2.38 (781 B). Off, nothing of it shows: not its
// place on the Osada's board (`feature` in data/settlement.json), its unlock
// nor its System message.
export const arenaOn = () => arena;
export const placeOn = (place) => place.feature !== 'arena' || arena;
// The weeks of the year (weeks.js), where WEEKS is "on".
export const weeksOn = () => weeks;
// The guild wars (guild-wars.js; 792–800), where GUILD_WARS is "on": first
// on the test version. Off, nothing of them shows: not the Gildia's Wojna
// tab, the routes, the evening's battles nor their Sława.
export const guildWarsOn = () => guildWars;
// The payments for Punkty Systemu (payments.js): the gateway they go through,
// or '' where they are off. Off, nothing of them answers.
export const paymentsProvider = () => payments;
// "authors" in PAYMENTS_FOR: the purchases only for the author's accounts
// (author.js), as the first, real purchase is tried before the players get
// them (the author, 11.11.2026: no test environment).
export const paymentsOnlyForAuthors = () => paymentsForAuthors;
// The Labirynt Systemu and the Rdzeń with its Artefakty (labyrinth.js,
// core.js; 850–866), only where LABYRINTH is "on": locally and on the test
// version first. Off, nothing of them shows: not the Labirynt's part of the
// Walka, its unlock and System message, the Rdzeń's tab, the Artefakty of
// the Wieże's champions nor the routes, which answer "not found".
export const labyrinthOn = () => labyrinth;
// A camp building of the Osada's (Kwatery, `settlement` in buildings.json)
// stands only where the Osada is on, and one of the Warownia's (`fortress`)
// only where the Warownia is; the others everywhere.
export const buildingOn = (building) => (!building.settlement || settlement) && (building.fortress !== true || fortress);

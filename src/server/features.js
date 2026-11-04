// Parts of the game switched on for a deployment (vars in wrangler.jsonc).
// Local work and the test version have the professions and Rzemieślnictwo;
// the live game shows Zielarstwo and Alchemia once they are ready, with
// Rzemieślnictwo locked ("Wkrótce") until it is done. The test version
// takes no new accounts (REGISTRATION "closed"): only the author's, made
// before. The events at the end of an exploration are on (EVENTS "on"),
// and the test version (EVENTS "test") also has the outcomes the author has
// not approved yet (drafts). The class evolutions are on except where
// EVOLUTIONS is "off", which plays as before them (the live game hid them
// in versions 0.0.58–0.0.60). The env is the same for every
// request of a deployment, so the switches are read once per request
// (index.js) and kept here for the rest of the code.

let professions = false;
let crafting = false;
let registration = true;
let events = false;
let eventDrafts = false;
let evolutions = true;
let settlement = false;
let fortress = false;

export function readFeatures(env) {
  professions = env.PROFESSIONS === 'on';
  crafting = env.CRAFTING === 'on';
  registration = env.REGISTRATION !== 'closed';
  events = env.EVENTS === 'on' || env.EVENTS === 'test';
  eventDrafts = env.EVENTS === 'test';
  evolutions = env.EVOLUTIONS !== 'off';
  settlement = env.SETTLEMENT === 'on';
  fortress = env.FORTRESS === 'on';
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
// A camp building of the Osada's (Kwatery, `settlement` in buildings.json)
// stands only where the Osada is on, and one of the Warownia's (`fortress`)
// only where the Warownia is; the others everywhere.
export const buildingOn = (building) => (!building.settlement || settlement) && (building.fortress !== true || fortress);

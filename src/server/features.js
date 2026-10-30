// Parts of the game switched on for a deployment (vars in wrangler.jsonc).
// Local work and the test version have the professions and Rzemieślnictwo;
// the live game shows Zielarstwo and Alchemia once they are ready, with
// Rzemieślnictwo locked ("Wkrótce") until it is done. The test version
// takes no new accounts (REGISTRATION "closed"): only the author's, made
// before. The events at the end of an exploration are on (EVENTS "on"),
// and the test version (EVENTS "test") also has the outcomes the author has
// not approved yet (drafts). The class evolutions are on except where
// EVOLUTIONS is "off": the live game hides them until they are ready (the
// author, 0.0.58) and plays as before them. The env is the same for every
// request of a deployment, so the switches are read once per request
// (index.js) and kept here for the rest of the code.

let professions = false;
let crafting = false;
let registration = true;
let events = false;
let eventDrafts = false;
let evolutions = true;
let settlement = false;

export function readFeatures(env) {
  professions = env.PROFESSIONS === 'on';
  crafting = env.CRAFTING === 'on';
  registration = env.REGISTRATION !== 'closed';
  events = env.EVENTS === 'on' || env.EVENTS === 'test';
  eventDrafts = env.EVENTS === 'test';
  evolutions = env.EVOLUTIONS !== 'off';
  settlement = env.SETTLEMENT === 'on';
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

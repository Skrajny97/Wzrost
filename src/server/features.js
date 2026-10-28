// Parts of the game switched on for a deployment (vars in wrangler.jsonc).
// Local work and the test version have the professions and Rzemieślnictwo;
// the live game shows Zielarstwo and Alchemia once they are ready, with
// Rzemieślnictwo locked ("Wkrótce") until it is done. The test version
// takes no new accounts (REGISTRATION "closed"): only the author's, made
// before. The events at the end of an exploration (EVENTS "on") are on the
// test version only for now. The env is the same for every request of a
// deployment, so the switches are read once per request (index.js) and kept
// here for the rest of the code.

let professions = false;
let crafting = false;
let registration = true;
let events = false;

export function readFeatures(env) {
  professions = env.PROFESSIONS === 'on';
  crafting = env.CRAFTING === 'on';
  registration = env.REGISTRATION !== 'closed';
  events = env.EVENTS === 'on';
}

export const professionsOn = () => professions;
// Rzemieślnictwo needs the professions too.
export const craftingOn = () => professions && crafting;
export const registrationOpen = () => registration;
// The events at the end of an exploration (events.js): the test version first.
export const eventsOn = () => events;

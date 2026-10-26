// Parts of the game switched on for a deployment (vars in wrangler.jsonc).
// The professions stay hidden in the live game until all of the first three
// are ready; local work and the test version have them. The test version
// takes no new accounts (REGISTRATION "closed"): only the author's, made
// before. The env is the same for every request of a deployment, so the
// switches are read once per request (index.js) and kept here for the rest
// of the code.

let professions = false;
let registration = true;

export function readFeatures(env) {
  professions = env.PROFESSIONS === 'on';
  registration = env.REGISTRATION !== 'closed';
}

export const professionsOn = () => professions;
export const registrationOpen = () => registration;

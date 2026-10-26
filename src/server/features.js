// Parts of the game switched on for a deployment (vars in wrangler.jsonc).
// The professions stay hidden in the live game until all of the first three
// are ready; local work and the test version have them. The env is the same
// for every request of a deployment, so the switch is read once per request
// (index.js) and kept here for the rest of the code.

let professions = false;

export function readFeatures(env) {
  professions = env.PROFESSIONS === 'on';
}

export const professionsOn = () => professions;

// Test mode (TEST_MODE "on" in wrangler.jsonc): a way to try the game without
// waiting. TEST_LOGINS limits it to the listed accounts (comma-separated, any
// case); empty gives it to every account, as in tests and `npm run dev`.

export const testMode = (env) => env.TEST_MODE === 'on';

export function testModeFor(env, login) {
  if (!testMode(env)) return false;
  const logins = String(env.TEST_LOGINS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return logins.length === 0 || logins.includes(String(login).toLowerCase());
}

// "Testuj samouczki" (testing.js): every tutorial from its start, on the test
// version only (TUTORIAL_TESTS "on"), for the accounts with test mode.
export const tutorialTestsFor = (env, login) => env.TUTORIAL_TESTS === 'on' && testModeFor(env, login);

// "Testuj ewolucję" (evolutions.js): any evolution of the class at any class
// level, with a way back, where "Testuj samouczki" works.
export const evolutionTestsFor = tutorialTestsFor;

// "Testuj Osadę" (settlement.js): the Osada below its level, one standing
// with everyone and new orders at once, where "Testuj samouczki" works.
export const settlementTestsFor = tutorialTestsFor;

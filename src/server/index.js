// Worker entry point. Static files from src/client are served by Workers Static
// Assets before this code runs; only /api/* and unknown paths reach the Worker.

import { deleteAccount, login, logout, me, register } from './accounts.js';
import { authorPanel, authorSkillDemo, authorSkills } from './author.js';
import { openBestiaryChest } from './bestiary.js';
import { discardPotions, drinkPotion, sellPotions, startBrewing } from './brewing.js';
import { buyParts, cancelBuilding, collectProduction, startBuilding, tradeAtFire } from './camp.js';
import { craftMaterials, salvageItem, skipCrafting } from './crafting.js';
import { confirmEmail, requestLink } from './email.js';
import { autoPoints, createCharacter, deleteCharacter, getCharacter, resetPoints, setAppearance, spendPoints } from './characters.js';
import { publicContent } from './content.js';
import { googleCallback, googleConfigured, startGoogle } from './google.js';
import { ApiError, errorResponse, json } from './http.js';
import { readFeatures, registrationOpen } from './features.js';
import { cancelHunt, claimHunt, huntOptions, startHunt } from './hunts.js';
import { discardItem, equipItem, previewItem, sellItem, sellItems, unequipItem, upgradeItem } from './inventory.js';
import { discardHerbs, sellHerbs, startGathering } from './professions.js';
import { pushKey, sendNotifications, subscribePush, unsubscribePush } from './push.js';
import { claimAllQuests, claimQuest, openChest } from './quests.js';
import { getReport, listReports } from './reports.js';
import { learnSkill, raiseSkill } from './skills.js';
import { repeatSkillsTour, skipBuilding, skipTime } from './testing.js';
import { skipWithTimePoints } from './time.js';
import { seeTutorial } from './tutorial.js';

const routes = [
  ['GET', '/api/health', health],
  ['POST', '/api/auth/register', register],
  ['POST', '/api/auth/login', login],
  ['POST', '/api/auth/logout', logout],
  ['GET', '/api/auth/google/start', startGoogle],
  ['GET', '/api/auth/google/callback', googleCallback],
  ['GET', '/api/auth/confirm', confirmEmail],
  ['POST', '/api/auth/email', requestLink],
  ['GET', '/api/me', me],
  ['DELETE', '/api/me', deleteAccount],
  ['GET', '/api/author', authorPanel],
  ['GET', '/api/author/skills', authorSkills],
  ['GET', '/api/author/skills/:id', authorSkillDemo],
  ['GET', '/api/content', () => json(publicContent())],
  ['GET', '/api/character', getCharacter],
  ['POST', '/api/character', createCharacter],
  ['DELETE', '/api/character', deleteCharacter],
  ['POST', '/api/character/points', spendPoints],
  ['POST', '/api/character/points/auto', autoPoints],
  ['POST', '/api/character/points/reset', resetPoints],
  ['POST', '/api/character/appearance', setAppearance],
  ['POST', '/api/skills/learn', learnSkill],
  ['POST', '/api/skills/raise', raiseSkill],
  ['POST', '/api/items/:id/equip', equipItem],
  ['POST', '/api/items/:id/unequip', unequipItem],
  ['POST', '/api/items/:id/discard', discardItem],
  ['GET', '/api/items/:id/preview', previewItem],
  ['POST', '/api/items/:id/upgrade', upgradeItem],
  ['POST', '/api/items/sell', sellItems],
  ['POST', '/api/items/:id/sell', sellItem],
  ['POST', '/api/items/:id/salvage', salvageItem],
  ['POST', '/api/craft/materials', craftMaterials],
  ['POST', '/api/quests/claim', claimQuest],
  ['POST', '/api/quests/claim-all', claimAllQuests],
  ['POST', '/api/quests/chest', openChest],
  ['POST', '/api/bestiary/chest', openBestiaryChest],
  ['GET', '/api/hunts/options', huntOptions],
  ['POST', '/api/hunts', startHunt],
  ['POST', '/api/hunts/cancel', cancelHunt],
  ['POST', '/api/hunts/claim', claimHunt],
  ['POST', '/api/professions/gather', startGathering],
  ['POST', '/api/herbs/sell', sellHerbs],
  ['POST', '/api/herbs/discard', discardHerbs],
  ['POST', '/api/professions/brew', startBrewing],
  ['POST', '/api/potions/sell', sellPotions],
  ['POST', '/api/potions/discard', discardPotions],
  ['POST', '/api/potions/drink', drinkPotion],
  ['POST', '/api/camp/build', startBuilding],
  ['POST', '/api/camp/cancel', cancelBuilding],
  ['POST', '/api/camp/collect', collectProduction],
  ['POST', '/api/camp/trade', tradeAtFire],
  ['POST', '/api/camp/buy', buyParts],
  ['GET', '/api/reports', listReports],
  ['GET', '/api/reports/:id', getReport],
  ['POST', '/api/time/skip', skipWithTimePoints],
  ['POST', '/api/tutorial', seeTutorial],
  ['GET', '/api/push/key', pushKey],
  ['POST', '/api/push/subscribe', subscribePush],
  ['POST', '/api/push/unsubscribe', unsubscribePush],
  ['POST', '/api/test/skip-time', skipTime],
  ['POST', '/api/test/skip-build', skipBuilding],
  ['POST', '/api/test/skip-craft', skipCrafting],
  ['POST', '/api/test/skills-tour', repeatSkillsTour],
].map(([method, pattern, handler]) => ({ method, parts: pattern.split('/'), handler }));

// Returns the :params of a matching pattern, or null.
function match(parts, path) {
  const segments = path.split('/');
  if (segments.length !== parts.length) return null;
  const params = {};
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith(':')) params[parts[i].slice(1)] = decodeURIComponent(segments[i]);
    else if (parts[i] !== segments[i]) return null;
  }
  return params;
}

export default {
  async fetch(request, env) {
    readFeatures(env);
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return new Response('Nie znaleziono strony.', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    try {
      const matching = routes
        .map((route) => ({ route, params: match(route.parts, url.pathname) }))
        .filter(({ params }) => params);
      if (matching.length === 0) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
      const found = matching.find(({ route }) => route.method === request.method);
      if (!found) {
        throw new ApiError(405, 'method_not_allowed', 'Niedozwolona metoda.', {
          Allow: matching.map(({ route }) => route.method).join(', '),
        });
      }
      if (request.method !== 'GET') checkOrigin(request, url);
      // The server clock is the only source of truth about time.
      return await found.route.handler({ request, env, now: Date.now(), params: found.params });
    } catch (error) {
      if (error instanceof ApiError) return errorResponse(error);
      console.error(error);
      return errorResponse(
        new ApiError(500, 'internal', 'Wystąpił błąd serwera. Spróbuj ponownie za chwilę.'),
      );
    }
  },

  // The cron trigger (wrangler.jsonc), every minute: the phone notifications
  // that came due (push.js). The scheduled minute is the clock here, so each
  // run takes the time since the one before.
  async scheduled(controller, env) {
    readFeatures(env);
    await sendNotifications(env, controller.scheduledTime);
  },
};

async function health({ env, now }) {
  await env.DB.prepare('SELECT 1').first();
  // `google`: whether the Google sign-in buttons can show; `registration`:
  // whether new accounts can be made (not on the test version).
  return json({ ok: true, time: now, version: env.APP_VERSION, google: googleConfigured(env), registration: registrationOpen() });
}

// Browsers always send Origin with POST requests made by fetch; a foreign one is refused.
function checkOrigin(request, url) {
  const origin = request.headers.get('Origin');
  if (origin !== null && origin !== url.origin) {
    throw new ApiError(403, 'forbidden_origin', 'Odrzucono żądanie z innej strony.');
  }
}

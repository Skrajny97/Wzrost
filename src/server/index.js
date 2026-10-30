// Worker entry point. Static files from src/client are served by Workers Static
// Assets before this code runs; only /api/* and unknown paths reach the Worker.

import { deleteAccount, login, logout, me, register } from './accounts.js';
import { authorPanel, authorSkillDemo, authorSkills } from './author.js';
import { buyAvatar, cancelAvatar, claimAvatar } from './avatar.js';
import { openBestiaryChest } from './bestiary.js';
import { openEncyclopediaChest, readEncyclopedia } from './encyclopedia.js';
import { decidePointsReset, takeEvolution, testEvolutions, undoEvolution } from './evolutions.js';
import { redeemGiftCode } from './gift-codes.js';
import { discardPotions, drinkPotion, sellPotions, startBrewing } from './brewing.js';
import { buyParts, cancelBuilding, collectProduction, exchangeResources, startBuilding, tradeAtFire } from './camp.js';
import { acceptChatRules, blockInChat, chatReports, closeChat, latestChat, moderateChat, readChat, reportChat, sendChat, setModerator, unblockInChat, unmuteInChat } from './chat.js';
import { acceptFriend, claimGifts, friendsView, inviteFriend, ranking, removeFriend, sendGift } from './community.js';
import { craftMaterials, salvageItem, sellMaterials, skipCrafting } from './crafting.js';
import { confirmEmail, requestLink } from './email.js';
import { autoPoints, characterProfile, createCharacter, deleteCharacter, getCharacter, resetPoints, setAppearance, setSkin, spendPoints } from './characters.js';
import { publicContent } from './content.js';
import { googleCallback, googleConfigured, startGoogle } from './google.js';
import { ApiError, errorResponse, json } from './http.js';
import { readFeatures, registrationOpen } from './features.js';
import { cancelHunt, claimHunt, huntOptions, quickHunt, startHunt } from './hunts.js';
import { discardItem, equipItem, previewItem, sellItem, sellItems, unequipItem, upgradeItem } from './inventory.js';
import { discardHerbs, sellHerbs, startGathering } from './professions.js';
import { pushKey, sendNotifications, subscribePush, testPush, unsubscribePush } from './push.js';
import { claimAllQuests, claimQuest, openChest } from './quests.js';
import { getReport, listReports } from './reports.js';
import { learnSkill, raiseSkill } from './skills.js';
import {
  backFromTest,
  chooseTestEvent,
  eventTests,
  repeatCommunityTour,
  repeatCraftingTour,
  repeatEvolutionTour,
  repeatProfessionsTour,
  repeatSettlementTour,
  repeatSkillsTour,
  skipBuilding,
  skipTime,
  testIntroduction,
  tutorialTests,
} from './testing.js';
import { chooseReforged, deliverSettlementOrder, getSettlement, hermitService, reforgeAtEnchantress, rejectSettlementOrder, settlementTests, testSettlement } from './settlement.js';
import { skipWithTimePoints } from './time.js';
import { answerTrade, blockTrades, cancelTrade, confirmTrade, proposeTrade, readTrade, setOffer, setTradeSettings, tradeSettings } from './trades.js';
import { seeTutorial } from './tutorial.js';
import { exchangeParts, startCrafting } from './workshop.js';

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
  ['POST', '/api/author/chat/unmute', unmuteInChat],
  ['POST', '/api/author/chat/moderator', setModerator],
  ['GET', '/api/content', () => json(publicContent())],
  ['GET', '/api/character', getCharacter],
  ['GET', '/api/profile/:name', characterProfile],
  ['POST', '/api/character', createCharacter],
  ['DELETE', '/api/character', deleteCharacter],
  ['POST', '/api/character/points', spendPoints],
  ['POST', '/api/character/points/auto', autoPoints],
  ['POST', '/api/character/points/reset', resetPoints],
  ['POST', '/api/character/appearance', setAppearance],
  ['POST', '/api/character/skin', setSkin],
  ['POST', '/api/skills/learn', learnSkill],
  ['POST', '/api/skills/raise', raiseSkill],
  ['POST', '/api/evolution', takeEvolution],
  ['GET', '/api/evolution/test', testEvolutions],
  ['POST', '/api/evolution/undo', undoEvolution],
  ['POST', '/api/evolution/points', decidePointsReset],
  ['POST', '/api/gift-code', redeemGiftCode],
  ['POST', '/api/items/:id/equip', equipItem],
  ['POST', '/api/items/:id/unequip', unequipItem],
  ['POST', '/api/items/:id/discard', discardItem],
  ['GET', '/api/items/:id/preview', previewItem],
  ['POST', '/api/items/:id/upgrade', upgradeItem],
  ['POST', '/api/items/sell', sellItems],
  ['POST', '/api/items/:id/sell', sellItem],
  ['POST', '/api/items/:id/salvage', salvageItem],
  ['POST', '/api/craft/materials', craftMaterials],
  ['POST', '/api/materials/sell', sellMaterials],
  ['POST', '/api/quests/claim', claimQuest],
  ['POST', '/api/quests/claim-all', claimAllQuests],
  ['POST', '/api/quests/chest', openChest],
  ['POST', '/api/bestiary/chest', openBestiaryChest],
  ['GET', '/api/encyclopedia', readEncyclopedia],
  ['POST', '/api/encyclopedia/chest', openEncyclopediaChest],
  ['GET', '/api/hunts/options', huntOptions],
  ['POST', '/api/hunts', startHunt],
  ['POST', '/api/hunts/cancel', cancelHunt],
  ['POST', '/api/hunts/claim', claimHunt],
  ['POST', '/api/hunts/quick', quickHunt],
  ['POST', '/api/professions/gather', startGathering],
  ['POST', '/api/herbs/sell', sellHerbs],
  ['POST', '/api/herbs/discard', discardHerbs],
  ['POST', '/api/professions/brew', startBrewing],
  ['POST', '/api/professions/craft', startCrafting],
  ['POST', '/api/professions/exchange', exchangeParts],
  ['POST', '/api/avatar/buy', buyAvatar],
  ['POST', '/api/avatar/claim', claimAvatar],
  ['POST', '/api/avatar/cancel', cancelAvatar],
  ['POST', '/api/potions/sell', sellPotions],
  ['POST', '/api/potions/discard', discardPotions],
  ['POST', '/api/potions/drink', drinkPotion],
  ['POST', '/api/camp/build', startBuilding],
  ['POST', '/api/camp/cancel', cancelBuilding],
  ['POST', '/api/camp/collect', collectProduction],
  ['POST', '/api/camp/trade', tradeAtFire],
  ['POST', '/api/camp/buy', buyParts],
  ['POST', '/api/camp/exchange', exchangeResources],
  ['GET', '/api/settlement', getSettlement],
  ['POST', '/api/settlement/deliver', deliverSettlementOrder],
  ['POST', '/api/settlement/reject', rejectSettlementOrder],
  ['POST', '/api/settlement/reforge', reforgeAtEnchantress],
  ['POST', '/api/settlement/reforge/choose', chooseReforged],
  ['POST', '/api/settlement/hermit', hermitService],
  ['GET', '/api/test/settlement', settlementTests],
  ['POST', '/api/test/settlement', testSettlement],
  ['GET', '/api/chat', readChat],
  ['GET', '/api/chat/latest', latestChat],
  ['GET', '/api/ranking', ranking],
  ['GET', '/api/trade', readTrade],
  ['GET', '/api/trade/settings', tradeSettings],
  ['POST', '/api/trade/propose', proposeTrade],
  ['POST', '/api/trade/answer', answerTrade],
  ['POST', '/api/trade/offer', setOffer],
  ['POST', '/api/trade/confirm', confirmTrade],
  ['POST', '/api/trade/cancel', cancelTrade],
  ['POST', '/api/trade/settings', setTradeSettings],
  ['POST', '/api/trade/block', blockTrades],
  ['GET', '/api/friends', friendsView],
  ['POST', '/api/friends/invite', inviteFriend],
  ['POST', '/api/friends/accept', acceptFriend],
  ['POST', '/api/friends/remove', removeFriend],
  ['POST', '/api/friends/gift', sendGift],
  ['POST', '/api/friends/claim', claimGifts],
  ['POST', '/api/chat', sendChat],
  ['POST', '/api/chat/rules', acceptChatRules],
  ['POST', '/api/chat/close', closeChat],
  ['POST', '/api/chat/report', reportChat],
  ['POST', '/api/chat/block', blockInChat],
  ['POST', '/api/chat/unblock', unblockInChat],
  ['GET', '/api/chat/reports', chatReports],
  ['POST', '/api/chat/moderate', moderateChat],
  ['GET', '/api/reports', listReports],
  ['GET', '/api/reports/:id', getReport],
  ['POST', '/api/time/skip', skipWithTimePoints],
  ['POST', '/api/tutorial', seeTutorial],
  ['GET', '/api/push/key', pushKey],
  ['POST', '/api/push/subscribe', subscribePush],
  ['POST', '/api/push/unsubscribe', unsubscribePush],
  ['POST', '/api/push/test', testPush],
  ['POST', '/api/test/skip-time', skipTime],
  ['POST', '/api/test/skip-build', skipBuilding],
  ['POST', '/api/test/skip-craft', skipCrafting],
  ['POST', '/api/test/skills-tour', repeatSkillsTour],
  ['POST', '/api/test/professions-tour', repeatProfessionsTour],
  ['POST', '/api/test/community-tour', repeatCommunityTour],
  ['POST', '/api/test/crafting-tour', repeatCraftingTour],
  ['POST', '/api/test/settlement-tour', repeatSettlementTour],
  ['POST', '/api/test/evolution-tour', repeatEvolutionTour],
  ['GET', '/api/test/tutorials', tutorialTests],
  ['GET', '/api/test/events', eventTests],
  ['POST', '/api/test/events', chooseTestEvent],
  ['POST', '/api/test/introduction', testIntroduction],
  ['POST', '/api/test/back', backFromTest],
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

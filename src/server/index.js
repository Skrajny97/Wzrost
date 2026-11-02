// Worker entry point. Static files from src/client are served by Workers Static
// Assets before this code runs; only /api/* and unknown paths reach the Worker.

import { deleteAccount, login, logout, me, register } from './accounts.js';
import { authorPanel, authorSkillDemo, authorSkills, resolveBugReport } from './author.js';
import { reportBug } from './bugs.js';
import { buyAvatar, cancelAvatar, claimAvatar } from './avatar.js';
import { openBestiaryChest } from './bestiary.js';
import { openEncyclopediaChest, readEncyclopedia } from './encyclopedia.js';
import { decidePointsReset, takeEvolution, testClassLevel, testEvolutions, undoEvolution } from './evolutions.js';
import { redeemGiftCode } from './gift-codes.js';
import { discardPotions, drinkPotion, sellPotions, startBrewing } from './brewing.js';
import { buyParts, cancelBuilding, collectProduction, exchangeResources, startBuilding, tradeAtFire } from './camp.js';
import { acceptChatRules, blockInChat, chatReports, closeChat, latestChat, markChatSeen, moderateChat, readChat, reportChat, sendChat, setModerator, unblockInChat, unmuteInChat } from './chat.js';
import { acceptFriend, claimGifts, friendsView, inviteFriend, ranking, removeFriend, sendGift } from './community.js';
import { acceptPartyInvite, cancelPartyInvite, declinePartyInvite, getParty, inviteToParty, kickFromParty, leaveParty, partyHunt } from './parties.js';
import { enterTower, getTowers } from './towers.js';
import { acceptGuildInvite, cancelGuildInvite, declineGuildInvite, foundGuild, getGuild, handGuildLead, inviteToGuild, kickFromGuild, leaveGuild, setGuildRole } from './guilds.js';
import { attackGuildBeast, claimGuildBeastChest, getGuildBeast } from './guild-beast.js';
import { claimGuildTrialChest, dropGuildTrial, getGuildTrials, takeGuildTrial } from './guild-trials.js';
import { askGuild, cancelGuildRequest, getGuildRequests, giveToGuildRequest, thankForGuildGift } from './guild-requests.js';
import { getGuildExchange, postGuildOffer, takeGuildOffer, withdrawGuildOffer } from './guild-exchange.js';
import { craftMaterials, salvageItem, sellMaterials, skipCrafting } from './crafting.js';
import { buyCosmetic, setNameColor, wearCosmetic } from './cosmetics.js';
import { confirmEmail, requestLink } from './email.js';
import {
  autoPoints,
  characterProfile,
  chooseCharacter,
  createCharacter,
  deleteCharacter,
  getCharacter,
  listCharacters,
  nameNoticeSeen,
  renameBlockedNames,
  renameCharacter,
  resetPoints,
  setAppearance,
  setSkin,
  spendPoints,
} from './characters.js';
import { publicContent } from './content.js';
import { googleCallback, googleConfigured, startGoogle } from './google.js';
import { ApiError, errorResponse, json } from './http.js';
import { readFeatures, registrationOpen, settlementOn } from './features.js';
import { bidOnOffer, buyFromResident, buyOffer, cancelOffer, collectParcels, getMarket, listOffer, settleMarket } from './market.js';
import { cancelHunt, claimHunt, huntOptions, quickHunt, startHunt } from './hunts.js';
import { discardItem, equipItem, previewItem, sellItem, sellItems, unequipItem, upgradeItem } from './inventory.js';
import { discardHerbs, sellHerbs, startGathering } from './professions.js';
import { pushKey, sendNotifications, subscribePush, testPush, unsubscribePush } from './push.js';
import { claimAllQuests, claimQuest, openChest, rerollQuests } from './quests.js';
import { getReport, listReports } from './reports.js';
import { learnSkill, raiseSkill } from './skills.js';
import { getChest, putInChest, takeFromChest } from './chest.js';
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
import { buyScrolls, raiseAtForge } from './forge.js';
import { buyFromHerbalist, buyMug, chooseReforged, talkWithCompanion, deliverSettlementOrder, dismissCompanion, equipCompanion, getSettlement, hermitService, hireCompanion, imbueAtEnchantress, reforgeAtEnchantress, rejectSettlementOrder, sellToHerbalist, setCompanionStay, settlementTests, takeCompanionGift, testSettlement, upgradeCompanionItem } from './settlement.js';
import { buyFromTanner, sellToTanner } from './tannery.js';
import { skipWithTimePoints } from './time.js';
import { buyMount } from './stable.js';
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
  ['POST', '/api/author/bugs/resolve', resolveBugReport],
  ['POST', '/api/bug-reports', reportBug],
  ['GET', '/api/author/skills', authorSkills],
  ['GET', '/api/author/skills/:id', authorSkillDemo],
  ['POST', '/api/author/chat/unmute', unmuteInChat],
  ['POST', '/api/author/chat/moderator', setModerator],
  ['GET', '/api/content', () => json(publicContent())],
  ['GET', '/api/character', getCharacter],
  ['GET', '/api/profile/:name', characterProfile],
  ['POST', '/api/character', createCharacter],
  ['POST', '/api/character/name', renameCharacter],
  ['POST', '/api/character/name/seen', nameNoticeSeen],
  ['DELETE', '/api/character', deleteCharacter],
  ['GET', '/api/characters', listCharacters],
  ['POST', '/api/characters/choose', chooseCharacter],
  ['GET', '/api/chest', getChest],
  ['POST', '/api/chest/put', putInChest],
  ['POST', '/api/chest/take', takeFromChest],
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
  ['POST', '/api/evolution/test-level', testClassLevel],
  ['POST', '/api/evolution/points', decidePointsReset],
  ['POST', '/api/gift-code', redeemGiftCode],
  // The Sklep Systemu (cosmetics.js).
  ['POST', '/api/cosmetics/buy', buyCosmetic],
  ['POST', '/api/cosmetics/wear', wearCosmetic],
  ['POST', '/api/cosmetics/name-color', setNameColor],
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
  ['POST', '/api/quests/reroll', rerollQuests],
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
  ['POST', '/api/settlement/tavern', buyMug],
  ['POST', '/api/settlement/hire', hireCompanion],
  ['POST', '/api/settlement/stable', buyMount],
  ['GET', '/api/market', getMarket],
  ['POST', '/api/market/list', listOffer],
  ['POST', '/api/market/bid', bidOnOffer],
  ['POST', '/api/market/buy', buyOffer],
  ['POST', '/api/market/cancel', cancelOffer],
  ['POST', '/api/market/collect', collectParcels],
  ['POST', '/api/market/resident', buyFromResident],
  ['POST', '/api/settlement/dismiss', dismissCompanion],
  ['POST', '/api/settlement/gift', takeCompanionGift],
  ['POST', '/api/settlement/equip', equipCompanion],
  ['POST', '/api/settlement/companion-upgrade', upgradeCompanionItem],
  ['POST', '/api/settlement/companion-stay', setCompanionStay],
  ['POST', '/api/settlement/herbalist', sellToHerbalist],
  ['POST', '/api/settlement/herbalist/buy', buyFromHerbalist],
  ['POST', '/api/settlement/tannery', sellToTanner],
  ['POST', '/api/settlement/tannery/buy', buyFromTanner],
  ['POST', '/api/settlement/talk', talkWithCompanion],
  ['POST', '/api/settlement/imbue', imbueAtEnchantress],
  ['POST', '/api/settlement/forge/scrolls', buyScrolls],
  ['POST', '/api/settlement/forge/raise', raiseAtForge],
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
  ['GET', '/api/party', getParty],
  ['POST', '/api/party/invite', inviteToParty],
  ['POST', '/api/party/accept', acceptPartyInvite],
  ['POST', '/api/party/decline', declinePartyInvite],
  ['POST', '/api/party/cancel', cancelPartyInvite],
  ['POST', '/api/party/leave', leaveParty],
  ['POST', '/api/party/kick', kickFromParty],
  ['POST', '/api/party/hunt', partyHunt],
  ['GET', '/api/towers', getTowers],
  ['GET', '/api/guild', getGuild],
  ['POST', '/api/guild/found', foundGuild],
  ['POST', '/api/guild/invite', inviteToGuild],
  ['POST', '/api/guild/accept', acceptGuildInvite],
  ['POST', '/api/guild/decline', declineGuildInvite],
  ['POST', '/api/guild/cancel', cancelGuildInvite],
  ['POST', '/api/guild/leave', leaveGuild],
  ['POST', '/api/guild/kick', kickFromGuild],
  ['POST', '/api/guild/role', setGuildRole],
  ['POST', '/api/guild/lead', handGuildLead],
  // The Bestia Gildii (guild-beast.js).
  ['GET', '/api/guild/beast', getGuildBeast],
  ['POST', '/api/guild/beast/attack', attackGuildBeast],
  ['POST', '/api/guild/beast/claim', claimGuildBeastChest],
  // The Próby Gildii (guild-trials.js, 345 A) and the Prośby Gildii (guild-requests.js, 346 A).
  ['GET', '/api/guild/trials', getGuildTrials],
  ['POST', '/api/guild/trials/take', takeGuildTrial],
  ['POST', '/api/guild/trials/drop', dropGuildTrial],
  ['POST', '/api/guild/trials/claim', claimGuildTrialChest],
  ['GET', '/api/guild/requests', getGuildRequests],
  ['POST', '/api/guild/requests', askGuild],
  ['POST', '/api/guild/requests/cancel', cancelGuildRequest],
  ['POST', '/api/guild/requests/give', giveToGuildRequest],
  ['POST', '/api/guild/requests/thank', thankForGuildGift],
  // The Wymiana in the Gildia (guild-exchange.js).
  ['GET', '/api/guild/exchange', getGuildExchange],
  ['POST', '/api/guild/exchange', postGuildOffer],
  ['POST', '/api/guild/exchange/take', takeGuildOffer],
  ['POST', '/api/guild/exchange/withdraw', withdrawGuildOffer],
  ['POST', '/api/towers/enter', enterTower],
  ['POST', '/api/chat', sendChat],
  ['POST', '/api/chat/rules', acceptChatRules],
  ['POST', '/api/chat/seen', markChatSeen],
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

// Returns the :params of a matching pattern, or null. A parameter that is
// not a valid escape ("%E0%A4%A") matches nothing, so the address is not
// found (the code review: it was a server error).
function match(parts, path) {
  const segments = path.split('/');
  if (segments.length !== parts.length) return null;
  const params = {};
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith(':')) {
      try {
        params[parts[i].slice(1)] = decodeURIComponent(segments[i]);
      } catch {
        return null;
      }
    } else if (parts[i] !== segments[i]) return null;
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
  // that came due (push.js), and at the top of an hour the new names of
  // characters whose names break the rules (characters.js). The scheduled
  // minute is the clock here, so each run takes the time since the one
  // before. Each job runs even when one before it fails (the code review:
  // a failed rename stopped the Targowisko and the notifications).
  async scheduled(controller, env) {
    readFeatures(env);
    const jobs = [
      () => renameBlockedNames(env, controller.scheduledTime),
      // The Targowisko's offers that ended (market.js), where the Osada is.
      () => settlementOn() && settleMarket(env.DB, controller.scheduledTime),
      () => sendNotifications(env, controller.scheduledTime),
    ];
    for (const job of jobs) {
      try {
        await job();
      } catch (error) {
        console.error(error);
      }
    }
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

// Worker entry point. Static files from src/client are served by Workers Static
// Assets before this code runs; only /api/* and unknown paths reach the Worker.

import { accountNameHintSeen, confirmAge, deleteAccount, login, logout, me, register, setAccountName, setLanguage } from './accounts.js';
import { authorPanel, authorSkillDemo, authorSkills, bugReportImage, resolveBugReport } from './author.js';
import { authorNews, deleteNews, dismissDraft, editNews, listNews, publishNews, seeNews } from './news.js';
import { BUG_IMAGE, reportBug } from './bugs.js';
import { getOnline } from './online.js';
import { buyAvatar, cancelAvatar, claimAvatar } from './avatar.js';
import { openBestiaryChest } from './bestiary.js';
import { openEncyclopediaChest, readEncyclopedia } from './encyclopedia.js';
import { decidePointsReset, takeEvolution, testClassLevel, testEvolutions, undoEvolution } from './evolutions.js';
import { moveGiftRewards, redeemGiftCode } from './gift-codes.js';
import { discardPotions, drinkPotion, sellPotions, startBrewing } from './brewing.js';
import { buyCollector, buyParts, cancelBuilding, collectProduction, exchangeResources, sellToSpirit, startBuilding, tradeAtFire } from './camp.js';
import {
  chooseBlessing,
  chooseGreenhouseHerb,
  claimTraining,
  clearGearSet,
  collectGreenhouse,
  saveGearSet,
  startTraining,
  wearGearSet,
} from './fortress.js';
import { acceptChatRules, blockInChat, chatPeople, chatReports, closeChat, latestChat, markChatSeen, moderateChat, readChat, reportChat, sendChat, setModerator, translateChat, unblockInChat, unmuteInChat } from './chat.js';
import { acceptFriend, claimGifts, friendsView, inviteFriend, ranking, removeFriend, sendAllGifts, sendGift } from './community.js';
import { acceptPartyInvite, cancelPartyInvite, declinePartyInvite, getParty, inviteToParty, kickFromParty, leaveParty, partyHunt } from './parties.js';
import { settlePartyEvents } from './party-events.js';
import { enterTower, getTowers } from './towers.js';
import { enterPortal, getPortals, sweepAllPortals, sweepPortal } from './portals.js';
import { chooseLabyrinthBlessing, enterLabyrinth, getLabyrinth, labyrinthMerchant, resetLabyrinthDay } from './labyrinth.js';
import { absorbArtifact, breakArtifact, dissolveArtifact, getCore, upgradeArtifact } from './core.js';
import { acceptGuildInvite, cancelGuildInvite, declineGuildInvite, foundGuild, getGuild, handGuildLead, inviteToGuild, kickFromGuild, leaveGuild, setGuildRole } from './guilds.js';
import { attackGuildBeast, claimGuildBeastChest, getGuildBeast } from './guild-beast.js';
import { attackGuildGuardian, claimGuildExpeditionChest, getGuildExpedition } from './guild-expedition.js';
import { claimGuildTrialChest, dropGuildTrial, getGuildTrials, openGuildTrials, takeGuildTrial } from './guild-trials.js';
import { askGuild, cancelGuildRequest, getGuildRequests, giveToGuildRequest, thankForGuildGift } from './guild-requests.js';
import { getGuildTodo } from './guild-todo.js';
import { getGuildExchange, postGuildOffer, takeGuildOffer, withdrawGuildOffer } from './guild-exchange.js';
import { getGuildChest, putInGuildChest, takeFromGuildChest } from './guild-chest.js';
import { getGuildWar, getGuildWarBattle, placeInWarTeam, settleWars, testGuildWar } from './guild-wars.js';
import { donateToGuildSeat, getGuildSeat, preferGuildSeat } from './guild-seat.js';
import { changePassword, forgotPassword, resetPassword } from './password.js';
import { guildRanking } from './guild-fame.js';
import { getGuildRanking } from './guild-members.js';
import { claimFame, getFame } from './fame.js';
import { cancelOrders, craftMaterials, moveOrder, salvageItem, salvageItems, sellMaterials, skipCrafting } from './crafting.js';
import { buyCosmetic, setNameColor, wearCosmetic } from './cosmetics.js';
import { authorPaymentAction, authorPayments, getPayments, orderPoints, paymentNotice, paymentNoticeAddress, paymentReturn, withdrawPurchase } from './payments.js';
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
  weekNoticeSeen,
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
import { englishOn, guildWarsOn, readFeatures, registrationOpen, settlementOn } from './features.js';
import { language, pageDictionary, requestLanguage, runInLanguage, t } from './i18n.js';
import { bidOnOffer, buyFromResident, buyOffer, cancelOffer, collectParcels, getMarket, getMarketLog, listOffer, settleMarket } from './market.js';
import { cancelHunt, claimHunt, huntOptions, quickHunt, startHunt } from './hunts.js';
import { discardItem, equipItem, previewItem, sellItem, sellItems, unequipItem, upgradeItem } from './inventory.js';
import { markFavorite } from './favorites.js';
import { discardHerbs, sellHerbs, startGathering } from './professions.js';
import { discardMinerals, sellMinerals, startMining } from './mining.js';
import { startJewelcraft } from './jewelcraft.js';
import { pushKey, sendNotifications, subscribePush, testPush, unsubscribePush } from './push.js';
import { claimAllQuests, claimQuest, openChest, rerollQuests } from './quests.js';
import { getReport, listReports } from './reports.js';
import { learnSkill, raiseSkill } from './skills.js';
import { getChest, putGoodsInChest, putInChest, takeFromChest, takeGoodsFromChest } from './chest.js';
import {
  backFromTest,
  chooseTestEvent,
  eventTests,
  repeatAccountChestTour,
  repeatCommunityTour,
  repeatCornerstoneTour,
  repeatCraftingTour,
  repeatEvolutionTour,
  repeatFaintTour,
  repeatFortressTour,
  repeatGuildTour,
  repeatHardHuntTour,
  repeatPartyTour,
  repeatTowersTour,
  repeatMiningTour,
  repeatPortalsTour,
  repeatLabyrinthTour,
  repeatProfessionsTour,
  repeatSettlementTour,
  repeatSkillsTour,
  skipBuilding,
  skipTime,
  testIntroduction,
  tutorialTests,
} from './testing.js';
import { buyScrolls, raiseAtForge } from './forge.js';
import { buyTicket, drawLotteries, getCasino, spinCasinoWheel } from './casino.js';
import { getCards, playCardTurn, saveDeck, startMatch, surrenderCards, takeStarter } from './cards.js';
import { enterTrialHall } from './trial-hall.js';
import { arenaFight, claimArenaReward, getArena, getArenaDefence, rerollArenaRivals } from './pvp-arena.js';
import { claimCardArenaReward, getCardArena, playCardArenaTurn, rerollCardArena, startCardArenaMatch, surrenderCardArena } from './card-arena.js';
import { buyFromHerbalist, buyMug, chooseReforged, claimStandingReward, talkWithCompanion, deliverSettlementOrder, dismissCompanion, equipCompanion, getSettlement, hermitService, hireCompanion, imbueAtEnchantress, redrawCandidates, reforgeAtEnchantress, rejectSettlementOrder, sellToHerbalist, setCompanionStay, settlementTests, takeCompanionGift, testSettlement, trainCompanion, unequipCompanion, upgradeCompanionItem } from './settlement.js';
import { claimWanted, dropWanted, takeWanted } from './wanted.js';
import { claimMercenary, listMercenaries, offerMercenary, withdrawMercenary } from './mercenaries.js';
import { buyFromTanner, sellToTanner } from './tannery.js';
import { claimResidentPresent, giveToResident } from './resident-gifts.js';
import { skipWithTimePoints } from './time.js';
import { buyMount } from './stable.js';
import { salvageStored, sellStored, takeStored } from './storage.js';
import { answerTrade, blockTrades, cancelTrade, confirmTrade, proposeTrade, readTrade, setOffer, setTradeSettings, tradeSettings } from './trades.js';
import { seeTutorial, setTutorialSettings } from './tutorial.js';
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
  // Zmień hasło, Nie pamiętam hasła and the link's new password (838 A).
  ['POST', '/api/auth/password', changePassword],
  ['POST', '/api/auth/forgot', forgotPassword],
  ['POST', '/api/auth/reset', resetPassword],
  ['GET', '/api/me', me],
  ['DELETE', '/api/me', deleteAccount],
  ['POST', '/api/me/age', confirmAge],
  // The account's language, PL or EN, where English is on (i18n.js).
  ['POST', '/api/me/language', setLanguage],
  ['POST', '/api/account/name', setAccountName],
  ['POST', '/api/account/name/hint', accountNameHintSeen],
  // The English of the page's own texts, for a page in English (i18n.js).
  ['GET', '/api/strings', strings],
  ['GET', '/api/author', authorPanel],
  ['POST', '/api/author/bugs/resolve', resolveBugReport],
  // A report's screenshot, for the author's panel (?id= the report).
  ['GET', '/api/author/bugs/image', bugReportImage],
  ['POST', '/api/bug-reports', reportBug],
  ['GET', '/api/author/skills', authorSkills],
  ['GET', '/api/author/news', authorNews],
  // The sales of Punkty Systemu for the bookkeeping (payments.js), where PAYMENTS is on.
  ['GET', '/api/author/payments', authorPayments],
  // The author's hand on a purchase that waits for it: a refund asked again
  // or marked done, a purchase restored, points taken back after a refund
  // in the gateway's panel, a second payment given back (payments.js).
  ['POST', '/api/author/payments/action', authorPaymentAction],
  ['POST', '/api/author/news', publishNews],
  ['POST', '/api/author/news/edit', editNews],
  ['POST', '/api/author/news/delete', deleteNews],
  ['POST', '/api/author/news/dismiss', dismissDraft],
  ['GET', '/api/news', listNews],
  ['GET', '/api/online', getOnline],
  ['POST', '/api/news/seen', seeNews],
  ['GET', '/api/author/skills/:id', authorSkillDemo],
  ['POST', '/api/author/chat/unmute', unmuteInChat],
  ['POST', '/api/author/chat/moderator', setModerator],
  ['GET', '/api/content', () => json(publicContent())],
  ['GET', '/api/character', getCharacter],
  ['GET', '/api/profile/:name', characterProfile],
  ['POST', '/api/character', createCharacter],
  ['POST', '/api/character/name', renameCharacter],
  ['POST', '/api/character/name/seen', nameNoticeSeen],
  ['POST', '/api/character/week/seen', weekNoticeSeen],
  ['DELETE', '/api/character', deleteCharacter],
  ['GET', '/api/characters', listCharacters],
  ['POST', '/api/characters/choose', chooseCharacter],
  ['GET', '/api/chest', getChest],
  ['POST', '/api/chest/put', putInChest],
  ['POST', '/api/chest/take', takeFromChest],
  // Its goods, any number of them (843): potions, herbs, materials,
  // minerals and the camp's resources.
  ['POST', '/api/chest/goods/put', putGoodsInChest],
  ['POST', '/api/chest/goods/take', takeGoodsFromChest],
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
  // Punkty Systemu bought for money (payments.js), only where PAYMENTS names
  // a gateway; the gateway's own news comes to /notify/<its name>.
  ['GET', '/api/payments', getPayments],
  ['POST', '/api/payments/order', orderPoints],
  ['POST', '/api/payments/withdraw', withdrawPurchase],
  ['POST', '/api/payments/notify/:provider', paymentNotice],
  ['GET', '/api/payments/notify/:provider', paymentNoticeAddress],
  // Where the gateway sends the player back after paying: the shop's page of
  // the points, which waits for the gateway's news.
  ['GET', '/api/payments/return', paymentReturn],
  ['POST', '/api/items/:id/equip', equipItem],
  ['POST', '/api/items/:id/unequip', unequipItem],
  ['POST', '/api/items/:id/discard', discardItem],
  // The star of a favourite item (favorites.js).
  ['POST', '/api/items/:id/favorite', markFavorite],
  ['GET', '/api/items/:id/preview', previewItem],
  ['POST', '/api/items/:id/upgrade', upgradeItem],
  ['POST', '/api/items/sell', sellItems],
  ['POST', '/api/items/:id/sell', sellItem],
  ['POST', '/api/items/salvage', salvageItems],
  ['POST', '/api/items/:id/salvage', salvageItem],
  ['POST', '/api/craft/materials', craftMaterials],
  ['POST', '/api/craft/cancel', cancelOrders],
  ['POST', '/api/craft/move', moveOrder],
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
  // The Przechowalnia of the Warsztat and the Szlifiernia (842, storage.js).
  ['POST', '/api/professions/storage/take', takeStored],
  ['POST', '/api/professions/storage/sell', sellStored],
  ['POST', '/api/professions/storage/salvage', salvageStored],
  ['POST', '/api/professions/mine', startMining],
  ['POST', '/api/professions/jewel', startJewelcraft],
  ['POST', '/api/minerals/sell', sellMinerals],
  ['POST', '/api/minerals/discard', discardMinerals],
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
  // The Duch budowniczego at the Kamień węgielny Warowni (camp.js).
  ['POST', '/api/camp/sell', sellToSpirit],
  // The Zbieracz Systemu by the Skrzynia Konta (camp.js).
  ['POST', '/api/camp/collector', buyCollector],
  ['POST', '/api/fortress/training', startTraining],
  ['POST', '/api/fortress/training/claim', claimTraining],
  ['POST', '/api/fortress/blessing', chooseBlessing],
  ['POST', '/api/fortress/greenhouse', chooseGreenhouseHerb],
  ['POST', '/api/fortress/greenhouse/collect', collectGreenhouse],
  ['POST', '/api/fortress/sets', saveGearSet],
  ['POST', '/api/fortress/sets/wear', wearGearSet],
  ['POST', '/api/fortress/sets/clear', clearGearSet],
  ['GET', '/api/settlement', getSettlement],
  ['POST', '/api/settlement/deliver', deliverSettlementOrder],
  ['POST', '/api/settlement/brotherhoods/reward', claimStandingReward],
  ['POST', '/api/settlement/reject', rejectSettlementOrder],
  ['POST', '/api/settlement/reforge', reforgeAtEnchantress],
  ['POST', '/api/settlement/reforge/choose', chooseReforged],
  ['POST', '/api/settlement/hermit', hermitService],
  ['POST', '/api/settlement/tavern', buyMug],
  ['POST', '/api/settlement/wanted', takeWanted],
  ['POST', '/api/settlement/wanted/drop', dropWanted],
  ['POST', '/api/settlement/wanted/claim', claimWanted],
  ['POST', '/api/settlement/hire', hireCompanion],
  ['POST', '/api/settlement/redraw', redrawCandidates],
  // The Karczma's mercenaries (mercenaries.js).
  ['GET', '/api/mercenaries', listMercenaries],
  ['POST', '/api/mercenary/offer', offerMercenary],
  ['POST', '/api/mercenary/withdraw', withdrawMercenary],
  ['POST', '/api/mercenary/claim', claimMercenary],
  ['POST', '/api/settlement/stable', buyMount],
  ['GET', '/api/market', getMarket],
  // The Targowisko's Rejestr (market.js).
  ['GET', '/api/market/log', getMarketLog],
  ['POST', '/api/market/list', listOffer],
  ['POST', '/api/market/bid', bidOnOffer],
  ['POST', '/api/market/buy', buyOffer],
  ['POST', '/api/market/cancel', cancelOffer],
  ['POST', '/api/market/collect', collectParcels],
  ['POST', '/api/market/resident', buyFromResident],
  ['POST', '/api/settlement/dismiss', dismissCompanion],
  ['POST', '/api/settlement/gift', takeCompanionGift],
  ['POST', '/api/settlement/equip', equipCompanion],
  ['POST', '/api/settlement/unequip', unequipCompanion],
  ['POST', '/api/settlement/companion-upgrade', upgradeCompanionItem],
  ['POST', '/api/settlement/companion-stay', setCompanionStay],
  ['POST', '/api/settlement/companion-train', trainCompanion],
  ['POST', '/api/settlement/herbalist', sellToHerbalist],
  ['POST', '/api/settlement/herbalist/buy', buyFromHerbalist],
  ['POST', '/api/settlement/tannery', sellToTanner],
  ['POST', '/api/settlement/tannery/buy', buyFromTanner],
  ['POST', '/api/settlement/residents/gift', giveToResident],
  ['POST', '/api/settlement/residents/present', claimResidentPresent],
  ['POST', '/api/settlement/talk', talkWithCompanion],
  ['POST', '/api/settlement/imbue', imbueAtEnchantress],
  ['POST', '/api/settlement/forge/scrolls', buyScrolls],
  ['POST', '/api/settlement/forge/raise', raiseAtForge],
  // The Salon Gier: the Loteria and the Koło Fortuny (casino.js).
  ['GET', '/api/settlement/casino', getCasino],
  ['POST', '/api/settlement/trial-hall', enterTrialHall],
  // The Arena: fights with other players' characters (pvp-arena.js, 762 A).
  ['GET', '/api/settlement/arena', getArena],
  ['POST', '/api/settlement/arena/fight', arenaFight],
  // Other rivals ("Losuj innych", 874) and a defence's playback (875).
  ['POST', '/api/settlement/arena/reroll', rerollArenaRivals],
  ['GET', '/api/settlement/arena/defences/:id', getArenaDefence],
  ['POST', '/api/settlement/arena/claim', claimArenaReward],
  // The Arena's Karty: matches of Talia Systemu with other players' decks
  // (card-arena.js, 900 A), where both the Arena and the cards are on.
  ['GET', '/api/cards/arena', getCardArena],
  ['POST', '/api/cards/arena/match', startCardArenaMatch],
  ['POST', '/api/cards/arena/turn', playCardArenaTurn],
  ['POST', '/api/cards/arena/surrender', surrenderCardArena],
  ['POST', '/api/cards/arena/reroll', rerollCardArena],
  ['POST', '/api/cards/arena/claim', claimCardArenaReward],
  ['POST', '/api/settlement/casino/ticket', buyTicket],
  ['POST', '/api/settlement/casino/spin', spinCasinoWheel],
  // Talia Systemu, the Salon Gier's card game (cards.js; 871–877), where
  // CARDS is on.
  ['GET', '/api/cards', getCards],
  ['POST', '/api/cards/starter', takeStarter],
  ['POST', '/api/cards/deck', saveDeck],
  ['POST', '/api/cards/match', startMatch],
  ['POST', '/api/cards/turn', playCardTurn],
  ['POST', '/api/cards/surrender', surrenderCards],
  ['GET', '/api/test/settlement', settlementTests],
  ['POST', '/api/test/settlement', testSettlement],
  ['GET', '/api/chat', readChat],
  ['GET', '/api/chat/latest', latestChat],
  // Whom "@" suggests in the chat's line (mentions.js).
  ['GET', '/api/chat/people', chatPeople],
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
  ['POST', '/api/friends/gift-all', sendAllGifts],
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
  ['GET', '/api/portals', getPortals],
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
  // The Ranking członków of the Gildia tab (guild-members.js, 897 A).
  ['GET', '/api/guild/ranking', getGuildRanking],
  // The Siedziba Gildii (guild-seat.js, 616 A).
  ['GET', '/api/guild/seat', getGuildSeat],
  ['POST', '/api/guild/seat/donate', donateToGuildSeat],
  ['POST', '/api/guild/seat/prefer', preferGuildSeat],
  // The Wyprawa Gildii (guild-expedition.js, 621 A).
  ['GET', '/api/guild/expedition', getGuildExpedition],
  ['POST', '/api/guild/expedition/attack', attackGuildGuardian],
  ['POST', '/api/guild/expedition/claim', claimGuildExpeditionChest],
  // The Bestia Gildii (guild-beast.js).
  ['GET', '/api/guild/beast', getGuildBeast],
  ['POST', '/api/guild/beast/attack', attackGuildBeast],
  ['POST', '/api/guild/beast/claim', claimGuildBeastChest],
  // The Próby Gildii (guild-trials.js, 345 A) and the Prośby Gildii (guild-requests.js, 346 A).
  ['GET', '/api/guild/todo', getGuildTodo],
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
  // The Skrzynia Gildii (guild-chest.js).
  ['GET', '/api/guild/chest', getGuildChest],
  ['POST', '/api/guild/chest/put', putInGuildChest],
  ['POST', '/api/guild/chest/take', takeFromGuildChest],
  // The guild wars (guild-wars.js, 792–800), where GUILD_WARS is on.
  ['GET', '/api/guild/war', getGuildWar],
  ['GET', '/api/guild/war/battles/:id', getGuildWarBattle],
  ['POST', '/api/guild/war/place', placeInWarTeam],
  ['POST', '/api/test/guild-war', testGuildWar],
  // The guilds' ranking by their Sława (guild-fame.js, 381 A).
  ['GET', '/api/ranking/guilds', guildRanking],
  // The characters' Punkty Sławy, the Sława tab of the Społeczność (fame.js, 760 A).
  ['GET', '/api/fame', getFame],
  ['POST', '/api/fame/claim', claimFame],
  ['POST', '/api/towers/enter', enterTower],
  ['POST', '/api/portals/enter', enterPortal],
  ['POST', '/api/portals/sweep', sweepPortal],
  ['POST', '/api/portals/sweep-all', sweepAllPortals],
  // The Labirynt Systemu and the Rdzeń (labyrinth.js, core.js; 850–866),
  // where LABYRINTH is on.
  ['GET', '/api/labyrinth', getLabyrinth],
  ['POST', '/api/labyrinth/room', enterLabyrinth],
  ['POST', '/api/labyrinth/blessing', chooseLabyrinthBlessing],
  ['POST', '/api/labyrinth/merchant', labyrinthMerchant],
  ['POST', '/api/labyrinth/reset', resetLabyrinthDay],
  ['GET', '/api/core', getCore],
  ['POST', '/api/core/absorb', absorbArtifact],
  ['POST', '/api/core/upgrade', upgradeArtifact],
  ['POST', '/api/core/dissolve', dissolveArtifact],
  ['POST', '/api/core/break', breakArtifact],
  ['POST', '/api/chat', sendChat],
  ['POST', '/api/chat/rules', acceptChatRules],
  ['POST', '/api/chat/seen', markChatSeen],
  ['POST', '/api/chat/close', closeChat],
  // "A→ Przetłumacz" (714 A, translate.js).
  ['POST', '/api/chat/translate', translateChat],
  ['POST', '/api/chat/report', reportChat],
  ['POST', '/api/chat/block', blockInChat],
  ['POST', '/api/chat/unblock', unblockInChat],
  ['GET', '/api/chat/reports', chatReports],
  ['POST', '/api/chat/moderate', moderateChat],
  ['GET', '/api/reports', listReports],
  ['GET', '/api/reports/:id', getReport],
  ['POST', '/api/time/skip', skipWithTimePoints],
  ['POST', '/api/tutorial', seeTutorial],
  ['POST', '/api/tutorial/settings', setTutorialSettings],
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
  ['POST', '/api/test/towers-tour', repeatTowersTour],
  ['POST', '/api/test/mining-tour', repeatMiningTour],
  ['POST', '/api/test/portals-tour', repeatPortalsTour],
  ['POST', '/api/test/labyrinth-tour', repeatLabyrinthTour],
  ['POST', '/api/test/guild-tour', repeatGuildTour],
  ['POST', '/api/test/fortress-tour', repeatFortressTour],
  ['POST', '/api/test/cornerstone-tour', repeatCornerstoneTour],
  ['POST', '/api/test/party-tour', repeatPartyTour],
  ['POST', '/api/test/hard-hunt-tour', repeatHardHuntTour],
  ['POST', '/api/test/account-chest-tour', repeatAccountChestTour],
  ['POST', '/api/test/faint-tour', repeatFaintTour],
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
    // Everything the request does, in its language (i18n.js).
    return runInLanguage(requestLanguage(request), () => {
      if (!url.pathname.startsWith('/api/')) {
        return new Response(t('Nie znaleziono strony.'), {
          status: 404,
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
        });
      }
      return answer(request, env, url);
    });
  },

  // The cron trigger (wrangler.jsonc), every minute: the phone notifications
  // that came due (push.js), and at the top of an hour the new names of
  // characters whose names break the rules (characters.js). The scheduled
  // minute is the clock here, so each run takes the time since the one
  // before. Each job runs even when one before it fails (the code review:
  // a failed rename stopped the Targowisko and the notifications). The
  // Loteria of the Salon Gier draws each day gone by once, so at Polish
  // midnight (casino.js).
  async scheduled(controller, env) {
    readFeatures(env);
    const jobs = [
      () => renameBlockedNames(env, controller.scheduledTime),
      // The Targowisko's offers that ended (market.js), where the Osada is.
      () => settlementOn() && settleMarket(env.DB, controller.scheduledTime),
      () => settlementOn() && drawLotteries(env.DB, controller.scheduledTime),
      () => sendNotifications(env, controller.scheduledTime),
      // A code's rewards moved by the author's word (gift-codes.js).
      () => moveGiftRewards(env, controller.scheduledTime),
      // The guilds' boards of the Próby Gildii drawn as the week starts and
      // their trials of the day opened for every member (guild-trials.js).
      () => openGuildTrials(env.DB, controller.scheduledTime),
      // The guild wars' rivals drawn as the week starts and their battles
      // fought every evening at 20:00 (guild-wars.js), where they are on.
      () => guildWarsOn() && settleWars(env.DB, controller.scheduledTime),
      // The Drużyny's party events nobody chose in 12 hours settled with
      // their `auto` option, the results not given to every member yet
      // given, and the old ones dropped (party-events.js).
      () => settlePartyEvents(env.DB, controller.scheduledTime),
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

// A request to the API, in its language: the route's answer, or its error.
async function answer(request, env, url) {
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
    // The gateway's news comes from its own server and carries its own
    // signature (payments.js), not a page's origin.
    if (request.method !== 'GET' && !url.pathname.startsWith('/api/payments/notify/')) checkOrigin(request, url);
    // The server clock is the only source of truth about time: the moment
    // the whole request has come (bodyCome).
    await bodyCome(request);
    return await found.route.handler({ request, env, now: Date.now(), params: found.params });
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error);
    console.error(error);
    return errorResponse(
      new ApiError(500, 'internal', 'Wystąpił błąd serwera. Spróbuj ponownie za chwilę.'),
    );
  }
}

// The most of a body read before the clock: as much as the biggest that a
// route takes, a bug report's picture (bugs.js). A bigger one is the
// route's to refuse, as before.
const BODY_WAIT_BYTES = BUG_IMAGE.form + 64 * 1024;

// Waits until the request's body has come, up to BODY_WAIT_BYTES, reading a
// copy of it: a body sent slowly (its first byte before midnight, the rest
// after) would else give a handler that reads it before the character the
// time of its first byte, not of its end (the code review, 0.2.71: such a
// request bought the Pustelnik's Punkty Czasu of the day gone, redrew the
// quests of the day before over the new day's, and started a profession's
// work back in time, alongside an exploration). The handler then reads the
// body from memory.
async function bodyCome(request) {
  const reader = request.body ? request.clone().body?.getReader() : null;
  let size = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) return;
    size += value.byteLength;
    if (size > BODY_WAIT_BYTES) {
      await reader.cancel().catch(() => {});
      return;
    }
  }
}

async function health({ env, now }) {
  await env.DB.prepare('SELECT 1').first();
  // `google`: whether the Google sign-in buttons can show; `registration`:
  // whether new accounts can be made (not on the test version); `english`:
  // whether the page offers English beside Polish (only the test version).
  return json({ ok: true, time: now, version: env.APP_VERSION, google: googleConfigured(env), registration: registrationOpen(), english: englishOn() });
}

// The English of the page's own texts (data/en/strings.json), in a request
// in English; nothing in Polish, the page's own language.
function strings() {
  return json({ language: language(), strings: pageDictionary() });
}

// Browsers always send Origin with POST requests made by fetch; a foreign one is refused.
function checkOrigin(request, url) {
  const origin = request.headers.get('Origin');
  if (origin !== null && origin !== url.origin) {
    throw new ApiError(403, 'forbidden_origin', 'Odrzucono żądanie z innej strony.');
  }
}

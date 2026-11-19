// What waits for the character in its guild, for the yellow dots on the
// Społeczność tab, its Gildia part and the guild page's tabs (the author:
// "Jeśli żadna próba jest niewzięta z Prób gildii niech podświetla się
// ikonka powiadomienia żółtą kropką i podobnie inne rzeczy w Gildii do
// zrobienia"): a trials' chest to open (since 617 the trials run without
// taking, so none waits to be taken); an attack on the Bestia Gildii left
// today while it lives, or its chest to open; an attack left today on the
// Wyprawa's guardian barring the way, for one who added minutes this week,
// or a guardian's chest to open (no attack while the character offers
// itself or serves as a mercenary);
// a gift to its request not thanked for yet; an item waiting for it in the
// Skrzynia Gildii (guild-chest.js; the author, 10.11.2026: an item left
// for one member lights its dot); a build or a work of another member the
// character may help (guild-help.js, 1196 A and B), on the Gildia tab; its
// vote of the week in the Kącina not cast yet (guild-shrine.js, 1201 A), on
// the Siedziba's. The page asks
// for it about once a minute (src/client/chat-news.js) and after its
// actions in the guild. The cards of Talia Systemu left by the Próby
// finished since the last look (903, trialCards in guild-trials.js) come
// with it, for the page's toast. A threshold of the Próby reached since is
// told then in the guild's chat (1195 A, guild-chronicle.js).

import { beastView } from './guild-beast.js';
import { chestWaiting } from './guild-chest.js';
import { trialsChronicle } from './guild-chronicle.js';
import { expeditionView } from './guild-expedition.js';
import { helpTodo } from './guild-help.js';
import { requestsView } from './guild-requests.js';
import { shrineTodo } from './guild-shrine.js';
import { guildPlayer, trialCards, trialsView } from './guild-trials.js';
import { json } from './http.js';

// GET /api/guild/todo: {todo: {trials, beast, expedition, requests,
// chest, guild, seat}, cards?}, or {todo: null} outside a guild; each key
// the id of the tab whose dot it lights.
export async function getGuildTodo(context) {
  const { player, guild, db } = await guildPlayer(context);
  if (!guild) return json({ todo: null });
  const cards = await trialCards(db, player, context.now);
  const [trials, beast, expedition, requests, chest, help, vote] = await Promise.all([
    trialsView(db, player, guild, context.now),
    beastView(db, player.row, context.now, player.activity),
    expeditionView(db, player.row, guild, context.now, player.activity),
    requestsView(db, player, guild, context.now),
    chestWaiting(db, player.row, guild.id),
    // A build or a work of another member to help (1196 A and B), on the
    // Gildia tab, and this week's vote in the Kącina not cast yet (1201 A),
    // on the Siedziba's, which counts the week's patron first.
    helpTodo(db, player, guild, context.now),
    shrineTodo(db, player.row, guild.id, context.now),
  ]);
  await trialsChronicle(db, guild.id, trials.bar, context.now);
  const ready = (bar) => Boolean(bar?.thresholds.some((threshold) => threshold.ready));
  // An attack it may make now: none while it offers itself or serves as a
  // mercenary (attacks.blocked), as the attack would refuse.
  const canAttack = (attacks) => attacks.left > 0 && !attacks.blocked;
  return json({
    todo: {
      // A chest to open: the trials themselves run without taking (617).
      trials: ready(trials.bar) || ready(trials.previous) || trials.elsewhere.some(ready),
      beast: Boolean(beast.beast && !beast.beast.fallen && canAttack(beast.attacks)) || beast.chests.length > 0,
      expedition: Boolean(expedition.expedition?.barred && expedition.contributor && canAttack(expedition.attacks)) || expedition.chests.length > 0,
      requests: Boolean(requests.mine?.gifts.some((gift) => !gift.thanked)),
      chest,
      guild: help,
      seat: vote,
    },
    ...(cards.length > 0 && { cards }),
  });
}

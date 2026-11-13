// What waits for the character in its guild, for the yellow dots on the
// Społeczność tab, its Gildia part and the guild page's tabs (the author:
// "Jeśli żadna próba jest niewzięta z Prób gildii niech podświetla się
// ikonka powiadomienia żółtą kropką i podobnie inne rzeczy w Gildii do
// zrobienia"): a trial to take while none is taken, or a trials' chest to
// open; an attack on the Bestia Gildii left today while it lives, or its
// chest to open; an attack left today on the Wyprawa's guardian barring the
// way, for one who added minutes this week, or a guardian's chest to open
// (no attack while the character offers itself or serves as a mercenary);
// a gift to its request not thanked for yet; an item waiting for it in the
// Skrzynia Gildii (guild-chest.js; the author, 10.11.2026: an item left
// for one member lights its dot). The page asks
// for it about once a minute (src/client/chat-news.js) and after its
// actions in the guild. The cards of Talia Systemu left by the Próby
// finished since the last look (903, trialCards in guild-trials.js) come
// with it, for the page's toast.

import { beastView } from './guild-beast.js';
import { chestWaiting } from './guild-chest.js';
import { expeditionView } from './guild-expedition.js';
import { requestsView } from './guild-requests.js';
import { guildPlayer, trialCards, trialsView } from './guild-trials.js';
import { json } from './http.js';

// GET /api/guild/todo: {todo: {trials, beast, expedition, requests,
// chest}, cards?}, or {todo: null} outside a guild.
export async function getGuildTodo(context) {
  const { player, guild, db } = await guildPlayer(context);
  if (!guild) return json({ todo: null });
  const cards = await trialCards(db, player, context.now);
  const [trials, beast, expedition, requests, chest] = await Promise.all([
    trialsView(db, player, guild, context.now),
    beastView(db, player.row, context.now, player.activity),
    expeditionView(db, player.row, guild, context.now, player.activity),
    requestsView(db, player, guild, context.now),
    chestWaiting(db, player.row, guild.id),
  ]);
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
    },
    ...(cards.length > 0 && { cards }),
  });
}

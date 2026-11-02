// What waits for the character in its guild, for the yellow dots on the
// Społeczność tab, its Gildia part and the guild page's tabs (the author:
// "Jeśli żadna próba jest niewzięta z Prób gildii niech podświetla się
// ikonka powiadomienia żółtą kropką i podobnie inne rzeczy w Gildii do
// zrobienia"): a trial to take while none is taken, or a trials' chest to
// open; an attack on the Bestia Gildii left today while it lives, or its
// chest to open; a gift to its request not thanked for yet. The page asks
// for it about once a minute (src/client/chat-news.js) and after its
// actions in the guild.

import { beastView } from './guild-beast.js';
import { requestsView } from './guild-requests.js';
import { guildPlayer, trialsView } from './guild-trials.js';
import { json } from './http.js';

// GET /api/guild/todo: {todo: {trials, beast, requests}}, or {todo: null}
// outside a guild.
export async function getGuildTodo(context) {
  const { player, guild, db } = await guildPlayer(context);
  if (!guild) return json({ todo: null });
  const [trials, beast, requests] = await Promise.all([
    trialsView(db, player, guild, context.now),
    beastView(db, player.row, context.now),
    requestsView(db, player, guild, context.now),
  ]);
  const ready = (bar) => Boolean(bar?.thresholds.some((threshold) => threshold.ready));
  return json({
    todo: {
      trials: (!trials.taken && trials.trials.some((trial) => trial.state === 'open')) || ready(trials.bar) || ready(trials.previous),
      beast: Boolean(beast.beast && !beast.beast.fallen && beast.attacks.left > 0) || beast.chests.length > 0,
      requests: Boolean(requests.mine?.gifts.some((gift) => !gift.thanked)),
    },
  });
}

// The Awatar Systemu (DECISIONS.md, "Awatar Systemu"): bought once for good
// for gold, it does one profession's work at a time beside the character,
// with the character's levels of the professions, herbs, recipes and
// patterns, and as well as the character does it. Its work sits in
// avatar_activities as the character's own sits in activities, so the same
// code starts it (with `avatar` in the request), skips it with Time Points
// (time.js) and ends it here. Since 10.11.2026 its work brings the
// character avatar.share (a quarter) of the character's XP and of the
// profession's XP the same work of the character would, with the levels
// they bring (workGains in professions.js; the author: „Awatar niech od
// teraz daje 1/4 tego co zdobyłaby postać - XPa i wpływ na level Profesji w
// podobnej ilości - tak jakby gracz robił te czynności. Tak, pamiętam
// pierwotne założenia, ale wszystko ewoluuje.”); before, no XP, no levels
// of the professions and no stats. Its claim writes them only while the
// character is as read (workClaim), so it never undoes the character's own
// claim made meanwhile, nor that one its.
//
// The second Awatar (1066; the author: „A czy jest szansa by można było mieć
// dwa Awatary Systemu przy czym drugi bardzo drogi - za 200000 złota?”) is
// bought once the first is, for avatar.second.price, and works the same way
// beside the character and the first one: its work sits in
// avatar2_activities, and the requests name it with `avatar: 2`.
//
// Either may meditate in a Kultywacja instead of a work, in the same slot
// (cultivation.js, „Kultywacja Awatarem”, 26.11.2026): its claim and its
// "Przerwij" are here too, the latter ending it with nothing, as the
// character's own.

import { finishBrewing } from './brewing.js';
import { content } from './content.js';
import { finishCultivation } from './cultivation.js';
import { avatarAsked, avatarTexts, avatarWorkOf, characterView, loadPlayer, requirePlayer, workTable } from './characters.js';
import { ApiError, json, readJson } from './http.js';
import { finishGathering, requireProfessions } from './professions.js';
import { finishCrafting } from './workshop.js';
import { finishJewels } from './jewelcraft.js';
import { finishMining } from './mining.js';
import { finishFishing } from './fishing.js';
import { finishFarming } from './farming.js';
import { finishCooking } from './cooking.js';
import { minigameOutcome } from './minigame.js';

const FINISH = {
  herbs: finishGathering,
  potions: finishBrewing,
  items: finishCrafting,
  minerals: finishMining,
  jewels: finishJewels,
  fish: finishFishing,
  crops: finishFarming,
  dishes: finishCooking,
  cultivation: finishCultivation,
};

// The body of a request that may come without one.
const bodyOf = async (request) => ((request.headers.get('Content-Type') ?? '').startsWith('application/json') ? await readJson(request) : {});

// The purchase, only once and only with the gold for it, so two taps at
// once pay once; with `avatar: 2` the second Awatar's, once the first is
// bought.
export async function buyAvatar(context) {
  const { session, player } = await requirePlayer(context);
  requireProfessions(player);
  const second = (await bodyOf(context.request)).avatar === 2;
  const { row } = player;
  const { price, texts } = second ? content().avatar.second : content().avatar;
  if (second && !row.avatar_at) throw new ApiError(409, 'no_avatar', 'Najpierw kup pierwszego Awatara Systemu.');
  if (second ? row.avatar2_at : row.avatar_at) throw new ApiError(409, 'owned', second ? 'Drugi Awatar Systemu już na Ciebie pracuje.' : 'Awatar Systemu już na Ciebie pracuje.');
  if (row.gold < price) throw new ApiError(409, 'no_gold', 'Masz za mało złota.');
  const db = context.env.DB;
  const column = second ? 'avatar2_at' : 'avatar_at';
  const bought = await db
    .prepare(`UPDATE characters SET gold = gold - ?, ${column} = ?, version = version + 1 WHERE id = ? AND ${column} IS NULL AND gold >= ?${second ? ' AND avatar_at IS NOT NULL' : ''}`)
    .bind(price, context.now, row.id, price)
    .run();
  if (bought.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Postać zmieniła się w międzyczasie. Spróbuj ponownie.');
  return json({ text: texts.bought[0], character: characterView(await loadPlayer(db, session.userId), context.now) });
}

// The work of the Awatar named (true: the first, 2: the second).
function avatarWork(player, avatar) {
  const activity = avatarWorkOf(player, avatar);
  if (!activity || !FINISH[activity.kind]) throw new ApiError(409, 'no_activity', avatar === 2 ? 'Drugi Awatar Systemu teraz nie pracuje.' : 'Awatar Systemu teraz nie pracuje.');
  return activity;
}

// The report of the Awatar's work that ended (`avatar: 2`: the second's).
export async function claimAvatar(context) {
  const { session, player } = await requirePlayer(context);
  const now = context.now;
  // The taps of its mini-game, if it was begun (minigame.js).
  const body = await bodyOf(context.request);
  const avatar = avatarAsked(body) === 2 ? 2 : true;
  const activity = avatarWork(player, avatar);
  if (activity.ends_at > now) {
    throw new ApiError(409, 'not_finished', activity.kind === 'cultivation' ? 'Kultywacja jeszcze trwa.' : avatar === 2 ? 'Praca Drugiego Awatara Systemu jeszcze trwa.' : 'Praca Awatara Systemu jeszcze trwa.');
  }
  const db = context.env.DB;
  const done = await FINISH[activity.kind](db, player, now, { avatar, minigame: minigameOutcome(activity, body.minigame, now) });
  // A work whose recipe or pattern the game no longer has gave back what it
  // took and made no report (the code review: it answered with an error).
  const character = characterView(await loadPlayer(db, session.userId), now);
  return json(done ? { report: { id: done.id, createdAt: now, ...done.report }, character } : { character });
}

// Calling the Awatar back early (`avatar: 2`: the second), as the
// character: a gathering, a digging or a Kultywacja brings nothing, and a
// brewing, an order in the Warsztat or of jewels keeps what is done, with
// its report.
export async function cancelAvatar(context) {
  const { session, player } = await requirePlayer(context);
  const now = context.now;
  const avatar = avatarAsked(await bodyOf(context.request)) === 2 ? 2 : true;
  const activity = avatarWork(player, avatar);
  if (activity.ends_at <= now) throw new ApiError(409, 'claim_first', (activity.kind === 'cultivation' ? avatarTexts(avatar).meditated : avatarTexts(avatar).claimFirst)[0]);
  const db = context.env.DB;
  const stop = { potions: finishBrewing, items: finishCrafting, jewels: finishJewels, dishes: finishCooking }[activity.kind];
  const stopped = stop ? await stop(db, player, now, { stop: true, avatar }) : null;
  if (!stop) await db.prepare(`DELETE FROM ${workTable(avatar)} WHERE character_id = ? AND started_at = ?`).bind(player.row.id, activity.started_at).run();
  return json({
    report: stopped && { id: stopped.id, createdAt: now, ...stopped.report },
    character: characterView(await loadPlayer(db, session.userId), now),
  });
}

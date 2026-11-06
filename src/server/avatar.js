// The Awatar Systemu (DECISIONS.md, "Awatar Systemu"): bought once for good
// for gold, it does one profession's work at a time beside the character,
// with the character's levels of the professions, herbs, recipes and
// patterns, and as well as the character does it. Its work sits in
// avatar_activities as the character's own sits in activities, so the same
// code starts it (with `avatar` in the request), skips it with Time Points
// (time.js) and ends it here; it brings no XP, no levels of the professions
// and no stats.

import { finishBrewing } from './brewing.js';
import { content } from './content.js';
import { characterView, loadPlayer, requirePlayer } from './characters.js';
import { ApiError, json } from './http.js';
import { finishGathering, requireProfessions } from './professions.js';
import { finishCrafting } from './workshop.js';
import { finishJewels } from './jewelcraft.js';
import { finishMining } from './mining.js';

const FINISH = { herbs: finishGathering, potions: finishBrewing, items: finishCrafting, minerals: finishMining, jewels: finishJewels };

// The purchase, only once and only with the gold for it, so two taps at
// once pay once.
export async function buyAvatar(context) {
  const { session, player } = await requirePlayer(context);
  requireProfessions(player);
  const { row } = player;
  const { price, texts } = content().avatar;
  if (row.avatar_at) throw new ApiError(409, 'owned', 'Awatar Systemu już na Ciebie pracuje.');
  if (row.gold < price) throw new ApiError(409, 'no_gold', 'Masz za mało złota.');
  const db = context.env.DB;
  const bought = await db
    .prepare('UPDATE characters SET gold = gold - ?, avatar_at = ?, version = version + 1 WHERE id = ? AND avatar_at IS NULL AND gold >= ?')
    .bind(price, context.now, row.id, price)
    .run();
  if (bought.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Postać zmieniła się w międzyczasie. Spróbuj ponownie.');
  return json({ text: texts.bought[0], character: characterView(await loadPlayer(db, session.userId), context.now) });
}

function avatarWork(player) {
  const activity = player.avatarActivity;
  if (!activity || !FINISH[activity.kind]) throw new ApiError(409, 'no_activity', 'Awatar Systemu teraz nie pracuje.');
  return activity;
}

// The report of the Awatar's work that ended.
export async function claimAvatar(context) {
  const { session, player } = await requirePlayer(context);
  const now = context.now;
  const activity = avatarWork(player);
  if (activity.ends_at > now) throw new ApiError(409, 'not_finished', 'Praca Awatara Systemu jeszcze trwa.');
  const db = context.env.DB;
  const done = await FINISH[activity.kind](db, player, now, { avatar: true });
  // A work whose recipe or pattern the game no longer has gave back what it
  // took and made no report (the code review: it answered with an error).
  const character = characterView(await loadPlayer(db, session.userId), now);
  return json(done ? { report: { id: done.id, createdAt: now, ...done.report }, character } : { character });
}

// Calling the Awatar back early, as the character: a gathering or a digging
// brings nothing, and a brewing, an order in the Warsztat or of jewels keeps
// what is done, with its report.
export async function cancelAvatar(context) {
  const { session, player } = await requirePlayer(context);
  const now = context.now;
  const activity = avatarWork(player);
  if (activity.ends_at <= now) throw new ApiError(409, 'claim_first', content().avatar.texts.claimFirst[0]);
  const db = context.env.DB;
  const stop = { potions: finishBrewing, items: finishCrafting, jewels: finishJewels }[activity.kind];
  const stopped = stop ? await stop(db, player, now, { stop: true, avatar: true }) : null;
  if (!stop) await db.prepare('DELETE FROM avatar_activities WHERE character_id = ? AND started_at = ?').bind(player.row.id, activity.started_at).run();
  return json({
    report: stopped && { id: stopped.id, createdAt: now, ...stopped.report },
    character: characterView(await loadPlayer(db, session.userId), now),
  });
}

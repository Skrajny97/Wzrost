// The reward for days in a row (1029, mock-ups 1034 accepted on 16.11.2026,
// 1034.4 B; data/quests.json, streak): each character its own series (the
// author, 16.11.2026: „powinna działać na wszystkich postaciach”; in 0.4.2
// one series for the account), the day counted from midnight Polish time,
// as the daily quests'. Each day of the series once: the gold of its minutes of
// exploring at the character's level, its Punkty Czasu, and on the last a
// pack of cards and Punkty Systemu. A day missed starts the series anew from
// its first day, and after the last a new one starts.

import { explorationGold } from '../engine/mining.js';
import { questPeriod } from '../engine/quests.js';
import { characterView, loadPlayer, requirePlayer } from './characters.js';
import { content } from './content.js';
import { ApiError, json } from './http.js';

const rules = () => content().quests.streak;

// Each day's reward for a character of `level`: its gold rounded to
// goldRound (at least that much), its Punkty Czasu, packs of cards and
// Punkty Systemu.
export function streakDays(level) {
  const { days, goldRound } = rules();
  return days.map((one, index) => ({
    day: index + 1,
    gold: one.goldMinutes ? Math.max(goldRound, Math.round((explorationGold(level, content()) * one.goldMinutes) / 60 / goldRound) * goldRound) : 0,
    timePoints: one.timePoints ?? 0,
    packs: one.packs ?? 0,
    systemPoints: one.systemPoints ?? 0,
  }));
}

// Where the account's series stands at `now`: today's day of it (from 1),
// whether today's reward is taken, whether the series started anew after a
// day missed (`fresh`), and today's key.
export function streakState(account, now) {
  const today = questPeriod('daily', now, content());
  const yesterday = questPeriod('daily', today.startsAt - 1, content()).key;
  const last = account.streak_at ?? null;
  const length = rules().days.length;
  if (last === today.key) return { day: account.streak_day, taken: true, fresh: false, key: today.key };
  if (last === yesterday && account.streak_day < length) return { day: account.streak_day + 1, taken: false, fresh: false, key: today.key };
  return { day: 1, taken: false, fresh: last !== null && last !== yesterday, key: today.key };
}

// The series as the character's row keeps it.
const streakOf = (row) => ({ streak_day: row.streak_day ?? 0, streak_at: row.streak_at ?? null });
const viewOf = (account, level, now) => {
  const { day, taken, fresh } = streakState(account, now);
  return { day, taken, fresh, days: streakDays(level) };
};

// GET /api/streak: the series for the window (daily-streak.js).
export async function getStreak(context) {
  const { player } = await requirePlayer(context);
  return json({ streak: viewOf(streakOf(player.row), player.row.level, context.now) });
}

// POST /api/streak: today's reward of the character played, once. In one
// statement that holds only while the character is as read (two tabs at
// once give it once).
export async function takeStreak(context) {
  const { session, player } = await requirePlayer(context);
  const db = context.env.DB;
  const state = streakState(streakOf(player.row), context.now);
  if (state.taken) throw new ApiError(409, 'streak_taken', 'Nagroda dnia jest już odebrana. Wróć jutro.');
  const reward = streakDays(player.row.level)[state.day - 1];
  const done = state.day === rules().days.length ? 1 : 0;
  const row = player.row;
  const { meta } = await db
    .prepare(
      `UPDATE characters SET gold = gold + ?, time_points = time_points + ?, system_points = system_points + ?, card_packs = card_packs + ?,
         streak_day = ?, streak_at = ?, streak_done = streak_done + ?, version = version + 1
       WHERE id = ? AND version = ? AND streak_at IS ?`,
    )
    .bind(reward.gold, reward.timePoints, reward.systemPoints, reward.packs, state.day, state.key, done, row.id, row.version, row.streak_at ?? null)
    .run();
  if (meta.changes !== 1) throw new ApiError(409, 'streak_changed', 'Nagroda dnia zmieniła się w międzyczasie. Spróbuj jeszcze raz.');
  const fresh = await loadPlayer(db, session.userId);
  return json({ streak: viewOf(streakOf(fresh.row), fresh.row.level, context.now), reward, character: characterView(fresh, context.now) });
}

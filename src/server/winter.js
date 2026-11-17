// Szczodre Gody (1044; the author's 1028, decisions of 17.11.2026 in
// DECISIONS.md; data/winter.json, src/engine/winter.js): the calendar of
// 1–24 December, one reward a day for coming into the game, each character
// its own (as the series of days, streak.js), a day missed lost; the 24th
// gives the winter set, cosmetics of the event that the Sklep Systemu does
// not sell. Where WINTER is "test" (the test version, features.js) every
// day plays as a day of the calendar, so it can be tried before December.

import { bagCapacity, campLevels, questPeriod, winterCalendar, winterReward, winterTaken, winterTakenState, winterToday } from '../engine/index.js';
import { bagPlaces, characterView, loadPlayer, requirePlayer } from './characters.js';
import { content } from './content.js';
import { winterTestOn } from './features.js';
import { ApiError, json } from './http.js';
import { foreign } from './market.js';
import { addTo } from './professions.js';
import { potionsOf } from './professions-view.js';
import { scrollAdds, scrollById } from './scroll-goods.js';

const winter = () => content().winter;
const words = () => winter().texts;

// Today's place in the calendar at `now` (Polish time), or null outside it.
export const winterNow = (now) => winterToday(questPeriod('daily', now, content()).key, winter().calendar, winterTestOn());

// The character's stored calendar (characters.winter).
const storedOf = (row) => {
  try {
    return JSON.parse(row.winter ?? 'null');
  } catch {
    return null;
  }
};

// A day of the calendar as the window shows it: its rewards with the names
// of the potion, the scroll, the decoration and the winter set's cosmetics.
function dayView(day) {
  const potion = day.potion ? { ...day.potion, name: content().potionsById[day.potion.id]?.name ?? day.potion.id } : null;
  const scroll = day.scroll ? { id: day.scroll, name: scrollById(day.scroll)?.name ?? day.scroll } : null;
  const decoration = day.decoration ? { id: day.decoration, name: winter().decorations[day.decoration]?.name ?? day.decoration, art: winter().decorations[day.decoration]?.art ?? null } : null;
  const cosmetics = day.cosmetics.map((id) => ({ id, name: content().cosmeticsById[id]?.name ?? id }));
  return { ...day, potion, scroll, decoration, cosmetics };
}

// The calendar of the character's row at `now`, or null outside it.
function viewOf(row, now) {
  const today = winterNow(now);
  if (!today) return null;
  const calendar = winterCalendar(storedOf(row), today, row.level, content());
  return { ...calendar, days: calendar.days.map(dayView) };
}

// GET /api/winter: the calendar for its window (winter-calendar.js), null
// outside its days.
export async function getWinter(context) {
  const { player } = await requirePlayer(context);
  return json({ winter: viewOf(player.row, context.now) });
}

// How many pieces of the potion `id` the bag still takes: the room left in
// its last stack and the free places, a stack each (as the chest's).
function potionRoom(player, id, now) {
  const { stack } = content().professionRules;
  const free = Math.max(0, bagCapacity(campLevels(player.buildings, now, content()), content()) - bagPlaces(player));
  const have = potionsOf(player.row)[id] ?? 0;
  return Math.ceil(have / stack) * stack - have + free * stack;
}

// POST /api/winter: today's reward of the character played, once. The
// potions go into the bag (and count as got from others, so not as the
// character's own discovery in the Encyklopedia); with no room for them the
// reward waits until the bag has it. The scroll goes to its column, the
// winter set among the cosmetics owned. In one statement that holds only
// while the character is as read, so two tabs at once take it once.
export async function takeWinter(context) {
  const { session, player } = await requirePlayer(context);
  const db = context.env.DB;
  const row = player.row;
  const today = winterNow(context.now);
  if (!today) throw new ApiError(409, 'winter_closed', words().closed);
  const stored = storedOf(row);
  if (winterTaken(stored, today.period).includes(today.day)) throw new ApiError(409, 'winter_taken', words().alreadyTaken);
  const { days, first } = winter().calendar;
  const reward = winterReward(days[today.day - first], row.level, content());
  if (reward.potion && reward.potion.count > potionRoom(player, reward.potion.id, context.now)) throw new ApiError(409, 'bag_full', words().bagFull);

  const potions = addTo('potions', reward.potion ? { [reward.potion.id]: reward.potion.count } : {});
  const others = reward.potion ? foreign({ potion: { [reward.potion.id]: reward.potion.count } }) : null;
  const scrolls = scrollAdds(reward.scroll ? { [reward.scroll]: 1 } : {});
  // The winter set among the cosmetics owned, the rest of them as they are.
  const cosmetics = JSON.parse(row.cosmetics ?? '{}');
  const set = reward.cosmetics.length > 0 ? JSON.stringify({ ...cosmetics, owned: [...new Set([...(Array.isArray(cosmetics.owned) ? cosmetics.owned : []), ...reward.cosmetics])] }) : null;
  const { meta } = await db
    .prepare(
      `UPDATE characters SET gold = gold + ?, time_points = time_points + ?, system_points = system_points + ?, card_packs = card_packs + ?${potions.sql}${scrolls.sql}${
        others ? `, foreign_stacks = ${others.sql}` : ''
      }${set ? ', cosmetics = ?' : ''}, winter = ?, version = version + 1
       WHERE id = ? AND version = ?`,
    )
    .bind(
      reward.gold,
      reward.timePoints,
      reward.systemPoints,
      reward.packs,
      ...potions.binds,
      ...scrolls.binds,
      ...(others ? others.binds : []),
      ...(set ? [set] : []),
      JSON.stringify(winterTakenState(stored, today)),
      row.id,
      row.version,
    )
    .run();
  if (meta.changes !== 1) throw new ApiError(409, 'winter_changed', words().changed);
  const fresh = await loadPlayer(db, session.userId);
  const day = viewOf(fresh.row, context.now)?.days.find((one) => one.day === today.day) ?? null;
  return json({ winter: viewOf(fresh.row, context.now), reward: day, character: characterView(fresh, context.now) });
}

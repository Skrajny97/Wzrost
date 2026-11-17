// Szczodre Gody (1044; the author's 1028, decisions of 17.11.2026 in
// DECISIONS.md; data/winter.json, src/engine/winter.js): the calendar of
// 1–24 December, one reward a day for coming into the game, each character
// its own (as the series of days, streak.js), a day missed lost; the 24th
// gives the winter set, cosmetics of the event that the Sklep Systemu does
// not sell. Where WINTER is "test" (the test version, features.js) every
// day plays as a day of the calendar, so it can be tried before December.

import {
  bagCapacity,
  campLevels,
  professionOpen,
  professionState,
  questPeriod,
  winterCalendar,
  winterCampPeriod,
  winterQuestList,
  winterQuestsGain,
  winterQuestsTaken,
  winterReward,
  winterTaken,
  winterTakenState,
  winterToday,
} from '../engine/index.js';
import { atomically, sameVersion } from './atomic.js';
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

// The winter quests (1044.4; engine/winter.js): the day's key while the
// winter camp stands (all of December; on test every day), else null.
export function winterQuestsKey(now) {
  const key = questPeriod('daily', now, content()).key;
  return winterCampPeriod(key, winter().camp, winterTestOn()) ? key : null;
}

// What closes or changes the quests for the character: Rybołówstwo and
// Gotowanie open (their character level), and the carp's level of
// Rybołówstwo reached (before it any fish counts).
function winterFacts(row) {
  const professions = JSON.parse(row.professions ?? '{}');
  const fishing = content().professionsById.fishing;
  const cooking = content().professionsById.cooking;
  const carp = content().winter.quests.list.find((rule) => rule.kind === 'fish');
  const fishingLevel = professionState(professions, 'fishing').level;
  return {
    fishingOpen: Boolean(fishing) && professionOpen(fishing, row.level, content()),
    cookingOpen: Boolean(cooking) && professionOpen(cooking, row.level, content()),
    carpOpen: fishingLevel >= (content().fishById[carp?.fish]?.level ?? 1),
    fishingLevel,
    cookingLevel: professionState(professions, 'cooking').level,
  };
}

// The winter quests as a period of the narrator's quests for the page
// (quests.js on the page draws them in a tab of their own), or null outside
// the winter camp's days.
export function winterQuestsPeriod(row, now) {
  const key = winterQuestsKey(now);
  if (!key) return null;
  const facts = winterFacts(row);
  const { quests, chest } = winterQuestList(storedOf(row), key, facts, row.level, content());
  const texts = words();
  const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));
  const unlock = (id) => content().professionsById[id]?.unlockLevel ?? content().unlocksById.professions.level;
  return {
    name: texts.questsTab,
    fixed: true,
    endsAt: questPeriod('daily', now, content()).endsAt,
    note: texts.questsNote,
    quests: quests.map((quest, index) => ({
      index,
      id: quest.id,
      kind: `winter-${quest.kind}`,
      text: quest.kind === 'explore' ? fill(texts.questFir, { count: quest.count }) : quest.kind === 'fish' ? (quest.anyFish ? texts.questFish : texts.questCarp) : texts.questDish,
      hint: quest.kind === 'explore' ? fill(texts.questFirHint, { minutes: quest.minutesPerPiece }) : null,
      closed: quest.closed ? fill(texts.questLocked, { level: unlock(quest.kind === 'fish' ? 'fishing' : 'cooking') }) : null,
      count: quest.count,
      progress: quest.progress,
      done: quest.done,
      claimed: quest.claimed,
      reward: { kind: 'gold', amount: quest.gold },
      rewards: [{ kind: 'gold', amount: quest.gold }, { kind: 'timePoints', amount: quest.timePoints }],
    })),
    chest: { ready: chest.ready, opened: chest.opened, packs: chest.packs, text: texts.questsChest },
  };
}

// The part of an UPDATE of the characters row that adds the winter quests'
// gains (minutes of exploring, fish, dishes) at `now`: none outside the
// winter camp's days. Computed from the row as read: the UPDATE it goes
// into must hold only while the character is as read.
export function winterGainSql(row, now, { minutes = 0, fish = {}, dishes = 0 }) {
  const key = winterQuestsKey(now);
  if (!key) return { sql: '', binds: [] };
  const facts = winterFacts(row);
  const rule = content().winter.quests.list.find((one) => one.kind === 'fish');
  const fishCount = facts.carpOpen ? (fish[rule?.fish] ?? 0) : Object.values(fish).reduce((sum, count) => sum + count, 0);
  if (minutes <= 0 && fishCount <= 0 && dishes <= 0) return { sql: '', binds: [] };
  return { sql: ', winter = ?', binds: [JSON.stringify(winterQuestsGain(storedOf(row), key, { minutes: Math.max(0, minutes), fish: fishCount, dishes }))] };
}

// A winter quest's reward (its gold and Punkty Czasu), or the chest's packs,
// once; in one statement that holds only while the character is as read.
async function takeWinterQuests(context, { session, player }, pick) {
  const row = player.row;
  const db = context.env.DB;
  const key = winterQuestsKey(context.now);
  if (!key) throw new ApiError(404, 'no_quest', 'Nie ma takiego zadania.');
  const view = winterQuestList(storedOf(row), key, winterFacts(row), row.level, content());
  const quests = pick.chest ? [] : view.quests.filter((quest) => (pick.all ? quest.done && !quest.claimed : quest.id === pick.id));
  if (pick.chest) {
    if (view.chest.opened) throw new ApiError(409, 'opened', 'Ta skrzynia jest już otwarta.');
    if (!view.chest.ready) throw new ApiError(409, 'not_ready', 'Skrzynia otworzy się po wszystkich zadaniach.');
  } else {
    if (quests.length === 0 && !pick.all) throw new ApiError(404, 'no_quest', 'Nie ma takiego zadania.');
    if (!pick.all && quests[0].claimed) throw new ApiError(409, 'claimed', 'Ta nagroda jest już odebrana.');
    if (!pick.all && !quests[0].done) throw new ApiError(409, 'not_done', 'To zadanie nie jest jeszcze wykonane.');
    if (quests.length === 0) throw new ApiError(409, 'not_done', 'Żadne zadanie nie czeka na odebranie.');
  }
  const gold = quests.reduce((sum, quest) => sum + quest.gold, 0);
  const timePoints = quests.reduce((sum, quest) => sum + quest.timePoints, 0);
  const packs = pick.chest ? view.chest.packs : 0;
  const stored = quests.reduce((next, quest) => winterQuestsTaken(next, key, { quest: quest.id }), pick.chest ? winterQuestsTaken(storedOf(row), key, { chest: true }) : storedOf(row));
  const [, result] = await atomically(db, [
    sameVersion(db, row),
    db
      .prepare('UPDATE characters SET gold = gold + ?, time_points = time_points + ?, card_packs = card_packs + ?, winter = ?, version = version + 1 WHERE id = ? AND version = ?')
      .bind(gold, timePoints, packs, JSON.stringify(stored), row.id, row.version),
  ]);
  if (result.meta.changes !== 1) throw new ApiError(409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.');
  const rewards = [...(gold > 0 ? [{ kind: 'gold', amount: gold }] : []), ...(timePoints > 0 ? [{ kind: 'timePoints', amount: timePoints }] : [])];
  return { rewards, packs, character: characterView(await loadPlayer(db, session.userId), context.now) };
}

// The narrator's quests' routes call these for the period "winter"
// (quests.js): a quest's reward by its index, all those done, the chest.
export async function claimWinterQuest(context, index, signed) {
  const key = winterQuestsKey(context.now);
  const { row } = signed.player;
  const quest = key && Number.isInteger(index) ? winterQuestList(storedOf(row), key, winterFacts(row), row.level, content()).quests[index] : undefined;
  if (!quest) throw new ApiError(404, 'no_quest', 'Nie ma takiego zadania.');
  const { rewards, character } = await takeWinterQuests(context, signed, { id: quest.id });
  return json({ reward: rewards[0] ?? null, rewards, character });
}
export async function claimAllWinterQuests(context, signed) {
  const { rewards, character } = await takeWinterQuests(context, signed, { all: true });
  return json({ rewards, character });
}
export async function openWinterChest(context, signed) {
  const { packs, character } = await takeWinterQuests(context, signed, { chest: true });
  return json({ chest: { packs }, character });
}

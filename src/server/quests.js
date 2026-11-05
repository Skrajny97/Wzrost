// The narrator's daily, weekly and monthly quests (quests.js in the engine): a
// quest's reward is claimed once it is done, alone or with every other one
// of its period ("Odbierz wszystkie"), and a period's chest opens once all
// its quests are. Each saves only if the character is as read (its version),
// so two taps give one reward.

import { QUEST_PERIODS, bagCapacity, campLevels, chestGold, chestItem, chestReady, createRng, itemName, questDone, rerolledQuests, withChest, withClaimed } from '../engine/index.js';
import { content } from './content.js';
import { bagPlaces, characterView, equippedItems, loadPlayer, questContext, questsNow, requirePlayer } from './characters.js';
import { atomically, sameVersion } from './atomic.js';
import { ApiError, json, readJson } from './http.js';

// A JSON path for an id with a hyphen ("iron-ore").
const jsonPath = (id) => `$."${id}"`;

const changed = () => new ApiError(409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.');

function periodOf(body) {
  if (!QUEST_PERIODS.includes(body.period)) throw new ApiError(400, 'invalid_period', 'Nie ma takich zadań.');
  return body.period;
}

// What rewards add to the character's row: gold, resources and parts, those
// of one kind and id summed, so each column is set once.
function rewardsSql(rewards) {
  const sets = [];
  const binds = [];
  const gold = rewards.filter((reward) => reward.kind === 'gold');
  if (gold.length > 0) {
    sets.push('gold = gold + ?');
    binds.push(gold.reduce((total, reward) => total + reward.amount, 0));
  }
  for (const [kind, column] of [['resource', 'resources'], ['part', 'parts']]) {
    const totals = new Map();
    for (const reward of rewards.filter((entry) => entry.kind === kind)) totals.set(reward.id, (totals.get(reward.id) ?? 0) + reward.amount);
    if (totals.size === 0) continue;
    sets.push(`${column} = json_set(${column}, ${[...totals.keys()].map(() => `?, COALESCE(json_extract(${column}, ?), 0) + ?`).join(', ')})`);
    for (const [id, amount] of totals) binds.push(jsonPath(id), jsonPath(id), amount);
  }
  return { sql: sets.join(', '), binds };
}

// Saves the rewards of the quests at the indexes, with the quests marked as
// claimed, and answers with the rewards and the character.
async function saveClaims(context, session, player, quests, periodId, indexes) {
  const rewards = indexes.map((index) => quests[periodId].quests[index].reward);
  const claimed = indexes.reduce((next, index) => withClaimed(next, periodId, index), quests);
  const { sql, binds } = rewardsSql(rewards);
  const db = context.env.DB;
  const row = player.row;
  const result = await db
    .prepare(`UPDATE characters SET ${sql}, quests = ?, version = version + 1 WHERE id = ? AND version = ?`)
    .bind(...binds, JSON.stringify(claimed), row.id, row.version)
    .run();
  if (result.meta.changes !== 1) throw changed();
  return { rewards, character: characterView(await loadPlayer(db, session.userId), context.now) };
}

// { period: "daily" | "weekly" | "monthly", index }: the reward of a quest done.
export async function claimQuest(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const periodId = periodOf(body);
  const now = context.now;
  const quests = questsNow(player, now);
  const quest = Number.isInteger(body.index) ? quests[periodId].quests[body.index] : undefined;
  if (!quest) throw new ApiError(404, 'no_quest', 'Nie ma takiego zadania.');
  if (quest.claimed) throw new ApiError(409, 'claimed', 'Ta nagroda jest już odebrana.');
  if (!questDone(quest)) throw new ApiError(409, 'not_done', 'To zadanie nie jest jeszcze wykonane.');
  const { character } = await saveClaims(context, session, player, quests, periodId, [body.index]);
  return json({ reward: quest.reward, character });
}

// { period }: the rewards of every quest of the period done and not claimed
// yet, in one go.
export async function claimAllQuests(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const periodId = periodOf(body);
  const quests = questsNow(player, context.now);
  const indexes = quests[periodId].quests.flatMap((quest, index) => (questDone(quest) && !quest.claimed ? [index] : []));
  if (indexes.length === 0) throw new ApiError(409, 'nothing_to_claim', 'Nie ma nagród do odebrania.');
  return json(await saveClaims(context, session, player, quests, periodId, indexes));
}

// { period }: the chest of a period whose quests are all done: Punkty Czasu,
// Punkty Systemu, in the weekly one an item for the backpack, which needs a
// free place there, and in the monthly one gold by the character's level.
export async function openChest(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const periodId = periodOf(body);
  const now = context.now;
  const quests = questsNow(player, now);
  const period = quests[periodId];
  if (period.chest) throw new ApiError(409, 'opened', 'Ta skrzynia jest już otwarta.');
  if (!chestReady(period)) throw new ApiError(409, 'not_ready', 'Skrzynia otworzy się, gdy wykonasz wszystkie zadania.');
  const chest = content.quests.periods[periodId].chest;
  const db = context.env.DB;
  const row = player.row;
  let item = null;
  if (chest.item) {
    const capacity = bagCapacity(campLevels(player.buildings, now, content), content);
    if (bagPlaces(player) >= capacity) {
      throw new ApiError(409, 'bag_full', 'Plecak jest pełny. Zrób w nim miejsce, żeby otworzyć skrzynię.');
    }
    // The same week's chest holds the same item, whenever it is opened.
    const rng = createRng(`${row.id}:${periodId}:${period.period}:chest`);
    item = chestItem({ level: row.level, classId: row.class_id, classLevel: row.class_level }, equippedItems(player).map((worn) => worn.slot), rng, content);
  }
  const gold = chestGold(chest, row.level);
  const after = withChest(quests, periodId);
  // The batch holds only while the character is as read (atomic.js), so the
  // item comes only with the chest opened by this request (the code review:
  // another change meanwhile let the item come without the chest opening).
  const [, opened] = await atomically(db, [
    sameVersion(db, row),
    db
      .prepare('UPDATE characters SET gold = gold + ?, time_points = time_points + ?, system_points = system_points + ?, quests = ?, version = version + 1 WHERE id = ? AND version = ?')
      .bind(gold, chest.timePoints, chest.systemPoints, JSON.stringify(after), row.id, row.version),
    // The item only with the chest opened above.
    ...(item
      ? [
          db
            .prepare('INSERT INTO items (character_id, slot, data, created_at) SELECT ?, NULL, ?, ? WHERE EXISTS (SELECT 1 FROM characters WHERE id = ? AND version = ?)')
            .bind(row.id, JSON.stringify(item), now, row.id, row.version + 1),
        ]
      : []),
  ]);
  if (opened.meta.changes !== 1) throw changed();
  return json({
    chest: {
      gold,
      timePoints: chest.timePoints,
      systemPoints: chest.systemPoints,
      item: item && { name: itemName(item, content), rarity: item.rarity, color: content.raritiesById[item.rarity].color },
    },
    character: characterView(await loadPlayer(db, session.userId), now),
  });
}

// { period }: the period's quests not done yet drawn anew, once a period:
// a day, a week or a month (quests.js).
export async function rerollQuests(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const periodId = periodOf(body);
  const now = context.now;
  const quests = questsNow(player, now);
  const next = rerolledQuests(quests, periodId, questContext(player, now), now, content);
  if (!next) {
    throw quests[periodId].rerolled
      ? new ApiError(409, 'rerolled', content.quests.periods[periodId].rerolled)
      : new ApiError(409, 'nothing_to_reroll', 'Nie ma zadań do przelosowania.');
  }
  const db = context.env.DB;
  const row = player.row;
  const result = await db.prepare('UPDATE characters SET quests = ?, version = version + 1 WHERE id = ? AND version = ?').bind(JSON.stringify(next), row.id, row.version).run();
  if (result.meta.changes !== 1) throw changed();
  return json({ character: characterView(await loadPlayer(db, session.userId), now) });
}

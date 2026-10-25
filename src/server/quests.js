// The narrator's daily and weekly quests (quests.js in the engine): a
// quest's reward is claimed once it is done, and a period's chest opens once
// all its quests are. Both save only if the character is as read (its
// version), so two taps give one reward.

import { QUEST_PERIODS, bagCapacity, campLevels, chestItem, chestReady, createRng, itemName, questDone, withChest, withClaimed } from '../engine/index.js';
import { content } from './content.js';
import { characterView, equippedItems, loadPlayer, questsNow, requirePlayer } from './characters.js';
import { ApiError, json, readJson } from './http.js';

// A JSON path for an id with a hyphen ("iron-ore").
const jsonPath = (id) => `$."${id}"`;

const changed = () => new ApiError(409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.');

function periodOf(body) {
  if (!QUEST_PERIODS.includes(body.period)) throw new ApiError(400, 'invalid_period', 'Nie ma takich zadań.');
  return body.period;
}

// What a reward adds to the character's row: gold, a resource or parts.
function rewardSql(reward) {
  if (reward.kind === 'gold') return { sql: 'gold = gold + ?', binds: [reward.amount] };
  const column = reward.kind === 'resource' ? 'resources' : 'parts';
  return { sql: `${column} = json_set(${column}, ?, COALESCE(json_extract(${column}, ?), 0) + ?)`, binds: [jsonPath(reward.id), jsonPath(reward.id), reward.amount] };
}

// { period: "daily" | "weekly", index }: the reward of a quest done.
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
  const { sql, binds } = rewardSql(quest.reward);
  const db = context.env.DB;
  const row = player.row;
  const result = await db
    .prepare(`UPDATE characters SET ${sql}, quests = ?, version = version + 1 WHERE id = ? AND version = ?`)
    .bind(...binds, JSON.stringify(withClaimed(quests, periodId, body.index)), row.id, row.version)
    .run();
  if (result.meta.changes !== 1) throw changed();
  return json({ reward: quest.reward, character: characterView(await loadPlayer(db, session.userId), now) });
}

// { period }: the chest of a period whose quests are all done: Punkty Czasu,
// Punkty Systemu and, in the weekly one, an item for the backpack, which
// needs a free place there.
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
    if (player.items.filter((candidate) => !candidate.equippedSlot).length >= capacity) {
      throw new ApiError(409, 'bag_full', 'Plecak jest pełny. Zrób w nim miejsce, żeby otworzyć skrzynię.');
    }
    // The same week's chest holds the same item, whenever it is opened.
    const rng = createRng(`${row.id}:${periodId}:${period.period}:chest`);
    item = chestItem({ level: row.level, classId: row.class_id, classLevel: row.class_level }, equippedItems(player).map((worn) => worn.slot), rng, content);
  }
  const [opened] = await db.batch([
    db
      .prepare('UPDATE characters SET time_points = time_points + ?, system_points = system_points + ?, quests = ?, version = version + 1 WHERE id = ? AND version = ?')
      .bind(chest.timePoints, chest.systemPoints, JSON.stringify(withChest(quests, periodId)), row.id, row.version),
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
      timePoints: chest.timePoints,
      systemPoints: chest.systemPoints,
      item: item && { name: itemName(item, content), rarity: item.rarity, color: content.raritiesById[item.rarity].color },
    },
    character: characterView(await loadPlayer(db, session.userId), now),
  });
}

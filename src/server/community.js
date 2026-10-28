// The Społeczność tab beside the chat (chat.js), from the same level: the
// Ranking postaci, the Znajomi and their daily Upominek (data/community.json).
// A friendship starts as an invitation from one character to another and
// holds once accepted. A friend may send a friend one Upominek each Warsaw
// day; what it gives is rolled when it is sent (giftReward). The receiver
// collects at most claimsPerDay a day, all waiting ones at once, and one not
// collected goes after keepDays days.

import { giftReward, highestProfession, isUnlocked, questPeriod } from '../engine/index.js';
import { characterView, loadPlayer } from './characters.js';
import { chatRole, requireChatter } from './chat.js';
import { content } from './content.js';
import { ApiError, json, readJson } from './http.js';

const DAY = 86400000;
const today = (now) => questPeriod('daily', now, content).key;
// The first day whose Upominek still waits to be collected.
const firstKept = (now) => questPeriod('daily', now - (content.community.gift.keepDays - 1) * DAY, content).key;

// The highest level of the character's professions (characters.professions,
// {"herbalism": {"level": 3, ...}}), 0 before its first work.
const levels = content.professions.map(({ id }) => `coalesce(json_extract(c.professions, '$.${id}.level'), 0)`);
const PROFESSION_LEVEL = levels.length > 1 ? `max(${levels.join(', ')})` : levels[0];

// The Ranking's orders: by the character's level, by its class's, or by its
// highest profession's (only characters that have worked in one).
const ORDERS = {
  level: { order: 'c.level DESC, c.xp DESC, c.class_level DESC, c.class_xp DESC, c.id', where: '' },
  class: { order: 'c.class_level DESC, c.class_xp DESC, c.level DESC, c.xp DESC, c.id', where: '' },
  profession: { order: `${PROFESSION_LEVEL} DESC, c.level DESC, c.xp DESC, c.id`, where: ` AND ${PROFESSION_LEVEL} > 0` },
};

// GET /api/ranking?by=level|class|profession: the characters highest by
// the level of the character, of its class or of its highest profession,
// each with these levels, and the player's own place among all of them.
export async function ranking(context) {
  const { character, db } = await requireChatter(context);
  const asked = new URL(context.request.url).searchParams.get('by');
  const by = Object.hasOwn(ORDERS, asked) ? asked : 'level';
  const { order, where } = ORDERS[by];
  const [rows, own] = await db.batch([
    db
      .prepare(
        `SELECT c.id, c.name, c.class_id, c.level, c.class_level, c.professions, u.login, u.google_sub, u.chat_moderator
         FROM characters c JOIN users u ON u.id = c.user_id
         WHERE c.role = 'player'${where} ORDER BY ${order} LIMIT ?`,
      )
      .bind(content.community.ranking.size),
    db
      .prepare(`SELECT place FROM (SELECT c.id, ROW_NUMBER() OVER (ORDER BY ${order}) AS place FROM characters c WHERE c.role = 'player'${where}) WHERE id = ?`)
      .bind(character.id),
  ]);
  return json({
    by,
    rows: rows.results.map((row, index) => ({
      place: index + 1,
      name: row.name,
      classId: row.class_id,
      className: content.classesById[row.class_id]?.name ?? row.class_id,
      level: row.level,
      classLevel: row.class_level,
      profession: highestProfession(JSON.parse(row.professions ?? '{}'), content),
      role: chatRole(context.env, row),
      own: row.id === character.id,
    })),
    place: own.results[0]?.place ?? null,
  });
}

// GET /api/friends: the friends, the invitations both ways and the
// Upominki waiting.
export async function friendsView(context) {
  const { character, db } = await requireChatter(context);
  return json(await friendsOf(db, character.id, context.now));
}

async function friendsOf(db, id, now) {
  const day = today(now);
  const [rows, sent, waiting, claimed] = await db.batch([
    db
      .prepare(
        `SELECT f.id, f.character_id, f.friend_id, f.accepted_at, o.id AS other, o.name, o.class_id, o.level, o.class_level
         FROM friends f JOIN characters o ON o.id = CASE WHEN f.character_id = ? THEN f.friend_id ELSE f.character_id END
         WHERE (f.character_id = ? OR f.friend_id = ?) AND o.role = 'player'
         ORDER BY o.name_key`,
      )
      .bind(id, id, id),
    db.prepare('SELECT receiver_id FROM gifts WHERE sender_id = ? AND day = ?').bind(id, day),
    db
      .prepare('SELECT sender_id, COUNT(*) AS count FROM gifts WHERE receiver_id = ? AND claimed_at IS NULL AND day >= ? GROUP BY sender_id')
      .bind(id, firstKept(now)),
    db.prepare('SELECT COUNT(*) AS count FROM gifts WHERE receiver_id = ? AND claimed_day = ?').bind(id, day),
  ]);
  const sentTo = new Set(sent.results.map((row) => row.receiver_id));
  const from = new Map(waiting.results.map((row) => [row.sender_id, row.count]));
  const person = (row) => ({ id: row.id, characterId: row.other, name: row.name, classId: row.class_id, level: row.level, classLevel: row.class_level });
  const pending = rows.results.filter((row) => row.accepted_at === null);
  const { max } = content.community.friends;
  const { claimsPerDay } = content.community.gift;
  return {
    friends: rows.results
      .filter((row) => row.accepted_at !== null)
      .map((row) => ({ ...person(row), sentToday: sentTo.has(row.other), waiting: from.get(row.other) ?? 0 })),
    incoming: pending.filter((row) => row.friend_id === id).map(person),
    outgoing: pending.filter((row) => row.character_id === id).map(person),
    gifts: {
      waiting: [...from.values()].reduce((sum, count) => sum + count, 0),
      claimedToday: claimed.results[0].count,
      claimsPerDay,
    },
    max,
  };
}

// The invitations and the Upominki that wait for a character, for the light
// on the Społeczność tab (chat.js): only as many Upominki as it may still
// collect today, and the friends it has not sent one to today (the author:
// "że są upominki do wysłania/odebrania").
export async function friendNews(db, id, now) {
  const day = today(now);
  const row = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM friends WHERE friend_id = ? AND accepted_at IS NULL) AS invites,
              (SELECT COUNT(*) FROM gifts WHERE receiver_id = ? AND claimed_at IS NULL AND day >= ?) AS waiting,
              (SELECT COUNT(*) FROM gifts WHERE receiver_id = ? AND claimed_day = ?) AS claimed,
              (SELECT COUNT(*) FROM friends f JOIN characters o ON o.id = CASE WHEN f.character_id = ? THEN f.friend_id ELSE f.character_id END
               WHERE (f.character_id = ? OR f.friend_id = ?) AND f.accepted_at IS NOT NULL AND o.role = 'player'
                 AND NOT EXISTS (SELECT 1 FROM gifts g WHERE g.sender_id = ? AND g.receiver_id = o.id AND g.day = ?)) AS unsent`,
    )
    .bind(id, id, firstKept(now), id, day, id, id, id, id, day)
    .first();
  return {
    invites: row.invites,
    gifts: Math.min(row.waiting, Math.max(0, content.community.gift.claimsPerDay - row.claimed)),
    unsent: row.unsent,
  };
}

// How the other character stands to this one, for its profile.
export async function relationTo(db, id, otherId, now) {
  if (id === otherId) return { state: 'self' };
  const row = await db
    .prepare('SELECT id, character_id, accepted_at FROM friends WHERE (character_id = ? AND friend_id = ?) OR (character_id = ? AND friend_id = ?)')
    .bind(id, otherId, otherId, id)
    .first();
  if (!row) return null;
  if (row.accepted_at !== null) {
    const sent = await db.prepare('SELECT 1 FROM gifts WHERE sender_id = ? AND receiver_id = ? AND day = ?').bind(id, otherId, today(now)).first();
    return { state: 'friends', id: row.id, sentToday: Boolean(sent) };
  }
  return { state: row.character_id === id ? 'sent' : 'received', id: row.id };
}

const friendCount = (db, id) =>
  db.prepare('SELECT COUNT(*) AS count FROM friends WHERE (character_id = ? OR friend_id = ?) AND accepted_at IS NOT NULL').bind(id, id).first();

// POST /api/friends/invite { name }: an invitation to that character, which
// accepts it in its Znajomi. One the other character sent first is accepted.
export async function inviteFriend(context) {
  const { character, db } = await requireChatter(context);
  const body = await readJson(context.request);
  const target = await db
    .prepare("SELECT id, name, level FROM characters WHERE name_key = ? AND role = 'player'")
    .bind(String(body.name ?? '').toLowerCase())
    .first();
  if (!target) throw new ApiError(404, 'no_character', 'Nie ma takiej postaci.');
  if (target.id === character.id) throw new ApiError(400, 'self', 'Siebie nie zaprosisz.');
  if (!isUnlocked('community', target.level, content)) {
    throw new ApiError(409, 'locked', `${target.name} nie ma jeszcze Społeczności. Otworzy się na ${content.unlocksById.community.level}. poziomie.`);
  }
  const existing = await db
    .prepare('SELECT id, character_id, accepted_at FROM friends WHERE (character_id = ? AND friend_id = ?) OR (character_id = ? AND friend_id = ?)')
    .bind(character.id, target.id, target.id, character.id)
    .first();
  if (existing?.accepted_at) throw new ApiError(409, 'friends', `${target.name} jest już wśród Twoich znajomych.`);
  if (existing?.character_id === character.id) throw new ApiError(409, 'invited', `Zaproszenie dla postaci ${target.name} już czeka.`);
  if (existing) return accept(context, db, character.id, existing.id);
  const { max } = content.community.friends;
  const taken = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM friends WHERE (character_id = ? OR friend_id = ?) AND accepted_at IS NOT NULL)
            + (SELECT COUNT(*) FROM friends WHERE character_id = ? AND accepted_at IS NULL) AS count`,
    )
    .bind(character.id, character.id, character.id)
    .first();
  if (taken.count >= max) throw new ApiError(409, 'full', `Masz już ${max} znajomych i zaproszeń. Usuń kogoś, żeby zaprosić nową postać.`);
  await db.prepare('INSERT INTO friends (character_id, friend_id, created_at) VALUES (?, ?, ?)').bind(character.id, target.id, context.now).run();
  return json({ ...(await friendsOf(db, character.id, context.now)), text: `Zaproszenie wysłane. ${target.name} przyjmie je w Znajomych.` });
}

// POST /api/friends/accept { id }: an invitation to this character accepted.
export async function acceptFriend(context) {
  const { character, db } = await requireChatter(context);
  const body = await readJson(context.request);
  return accept(context, db, character.id, Number(body.id));
}

async function accept(context, db, id, friendshipId) {
  const row = await db
    .prepare('SELECT f.id, f.character_id, c.name FROM friends f JOIN characters c ON c.id = f.character_id WHERE f.id = ? AND f.friend_id = ? AND f.accepted_at IS NULL')
    .bind(friendshipId, id)
    .first();
  if (!row) throw new ApiError(404, 'no_invitation', 'Tego zaproszenia już nie ma.');
  const { max } = content.community.friends;
  const [own, theirs] = await Promise.all([friendCount(db, id), friendCount(db, row.character_id)]);
  if (own.count >= max) throw new ApiError(409, 'full', `Masz już ${max} znajomych. Usuń kogoś, żeby przyjąć zaproszenie.`);
  if (theirs.count >= max) throw new ApiError(409, 'full', `${row.name} ma już ${max} znajomych.`);
  await db.prepare('UPDATE friends SET accepted_at = ? WHERE id = ?').bind(context.now, row.id).run();
  return json({ ...(await friendsOf(db, id, context.now)), text: `${row.name} jest teraz wśród Twoich znajomych.` });
}

// POST /api/friends/remove { id }: a friendship ended, or an invitation
// declined or taken back.
export async function removeFriend(context) {
  const { character, db } = await requireChatter(context);
  const body = await readJson(context.request);
  await db.prepare('DELETE FROM friends WHERE id = ? AND (character_id = ? OR friend_id = ?)').bind(Number(body.id), character.id, character.id).run();
  return json(await friendsOf(db, character.id, context.now));
}

// POST /api/friends/gift { id }: today's Upominek to that friend, its reward
// rolled for the friend's level now.
export async function sendGift(context) {
  const { character, db } = await requireChatter(context);
  const body = await readJson(context.request);
  const row = await db
    .prepare(
      `SELECT o.id, o.name, o.level FROM friends f JOIN characters o ON o.id = CASE WHEN f.character_id = ? THEN f.friend_id ELSE f.character_id END
       WHERE f.id = ? AND (f.character_id = ? OR f.friend_id = ?) AND f.accepted_at IS NOT NULL AND o.role = 'player'`,
    )
    .bind(character.id, Number(body.id), character.id, character.id)
    .first();
  if (!row) throw new ApiError(404, 'no_friend', 'Tej postaci nie ma wśród Twoich znajomych.');
  const [first, second] = crypto.getRandomValues(new Uint32Array(2));
  const reward = giftReward(row.level, [first / 2 ** 32, second / 2 ** 32], content);
  const result = await db
    .prepare('INSERT OR IGNORE INTO gifts (sender_id, receiver_id, day, created_at, reward) VALUES (?, ?, ?, ?, ?)')
    .bind(character.id, row.id, today(context.now), context.now, JSON.stringify(reward))
    .run();
  if (result.meta.changes !== 1) throw new ApiError(409, 'sent', `Dziś ${row.name} dostaje już od Ciebie ${content.community.gift.name}. Kolejny jutro.`);
  return json({ ...(await friendsOf(db, character.id, context.now)), text: `${content.community.gift.name} wysłany: ${row.name} odbierze go w Znajomych.` });
}

// POST /api/friends/claim: the waiting Upominki collected, as many as today
// still allows, oldest first. One statement takes them and the next pays
// what they hold, so two taps at once cannot take more.
export async function claimGifts(context) {
  const { session, character, db } = await requireChatter(context);
  const now = context.now;
  const day = today(now);
  const { claimsPerDay } = content.community.gift;
  const token = crypto.randomUUID();
  const ids = content.resources.map((resource) => resource.id);
  const path = (id) => `$."${id}"`;
  const sum = (field) => `(SELECT COALESCE(SUM(json_extract(reward, '${field}')), 0) FROM gifts WHERE claim_token = ?)`;
  const resources = ids.reduce((sql, id) => `json_set(${sql}, '${path(id)}', COALESCE(json_extract(resources, '${path(id)}'), 0) + ${sum(`$.resources.${path(id).slice(2)}`)})`, "COALESCE(resources, '{}')");
  await db.batch([
    db
      .prepare(
        `UPDATE gifts SET claimed_at = ?, claimed_day = ?, claim_token = ?
         WHERE id IN (SELECT id FROM gifts WHERE receiver_id = ? AND claimed_at IS NULL AND day >= ? ORDER BY id
                      LIMIT MAX(0, ? - (SELECT COUNT(*) FROM gifts WHERE receiver_id = ? AND claimed_day = ?)))`,
      )
      .bind(now, day, token, character.id, firstKept(now), claimsPerDay, character.id, day),
    db
      .prepare(`UPDATE characters SET time_points = time_points + ${sum('$.timePoints')}, gold = gold + ${sum('$.gold')}, resources = ${resources}, version = version + 1 WHERE id = ?`)
      .bind(token, token, ...ids.map(() => token), character.id),
    // What can no longer be collected, and what was collected before today
    // and sent before it: today's still count toward both days' limits.
    db
      .prepare('DELETE FROM gifts WHERE receiver_id = ? AND ((claimed_at IS NULL AND day < ?) OR (claimed_at IS NOT NULL AND day < ? AND claimed_day < ?))')
      .bind(character.id, firstKept(now), day, day),
  ]);
  const taken = (await db.prepare('SELECT reward FROM gifts WHERE claim_token = ?').bind(token).all()).results.map((row) => JSON.parse(row.reward));
  if (taken.length === 0) {
    const done = await db.prepare('SELECT COUNT(*) AS count FROM gifts WHERE receiver_id = ? AND claimed_day = ?').bind(character.id, day).first();
    if (done.count >= claimsPerDay) throw new ApiError(409, 'limit', `Dziś odebrano już ${claimsPerDay} upominków. Kolejne od północy.`);
    throw new ApiError(409, 'none', 'Żaden upominek nie czeka.');
  }
  const reward = { count: taken.length, timePoints: 0, gold: 0, resources: {} };
  for (const gift of taken) {
    reward.timePoints += gift.timePoints;
    reward.gold += gift.gold;
    for (const [id, amount] of Object.entries(gift.resources)) reward.resources[id] = (reward.resources[id] ?? 0) + amount;
  }
  return json({
    reward,
    character: characterView(await loadPlayer(db, session.userId), now),
    ...(await friendsOf(db, character.id, now)),
  });
}

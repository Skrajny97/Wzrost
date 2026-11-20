// Osiągnięcia z tytułami (1030; 1036.1–1036.2 accepted, the title only in
// the profile and the Ranking: 1036.3 B; data/achievements.json, the counts
// in src/engine/achievements.js): the character's facts, gathered at a look
// at the window; an achievement done is given then, once, with its reward
// (Punkty Czasu and Punkty Systemu); its title the character may wear. The
// counts the game kept nowhere before go in `feats` (featGains), from the
// version that brought them (0.4.6).

import { achievementFact, achievementOf, achievementsView, cardHomes, newlyDone, titleOf, wornTitle } from '../engine/index.js';
import { characterView, loadPlayer, requirePlayer } from './characters.js';
import { content, contentIn } from './content.js';
import { ApiError, json, readJson } from './http.js';

const WEEK = 7 * 24 * 3600000;

// The statement that adds `gains` ({ monsters: 3, gold: 120 }) to a
// character's feats, or none for nothing to add.
export function featGains(db, characterId, gains) {
  const entries = Object.entries(gains).filter(([, value]) => value > 0);
  if (entries.length === 0 || characterId === null || characterId === undefined) return [];
  const sets = entries.map(() => '?, COALESCE(json_extract(feats, ?), 0) + ?').join(', ');
  return [
    db
      .prepare(`UPDATE characters SET feats = json_set(COALESCE(feats, '{}'), ${sets}) WHERE id = ?`)
      .bind(...entries.flatMap(([key, value]) => [`$.${key}`, `$.${key}`, value]), characterId),
  ];
}

// What counts for the achievements of a character (its row): its feats,
// levels, form, professions, cards, the Arena's rating, its weeks in its
// guild, its friends, its best Tower floor and its series of days. Lands by
// their Polish names (the data's `land`), whatever the page's language.
export async function factsOf(db, row, now) {
  const [cards, arena, member, friends] = await db.batch([
    // Its own cards only, as the Encyklopedia counts them (ownCardCollection
    // in cards.js): those from others leave the counts as they were.
    db.prepare('SELECT monster_id FROM cards WHERE character_id = ? AND copies > traded').bind(row.id),
    db.prepare('SELECT rating FROM arena_ratings WHERE character_id = ?').bind(row.id),
    db.prepare('SELECT joined_at FROM guild_members WHERE character_id = ?').bind(row.id),
    db
      .prepare('SELECT COUNT(DISTINCT CASE WHEN character_id = ? THEN friend_id ELSE character_id END) AS n FROM friends WHERE (character_id = ? OR friend_id = ?) AND accepted_at IS NOT NULL')
      .bind(row.id, row.id, row.id),
  ]);
  const polish = contentIn('pl');
  const feats = JSON.parse(row.feats ?? '{}');
  // Each profession's level, by its id.
  const professionLevels = Object.fromEntries(Object.entries(JSON.parse(row.professions ?? '{}')).map(([id, one]) => [id, typeof one === 'number' ? one : (one?.level ?? 0)]));
  const professions = Object.values(professionLevels);
  const professionsAt = (level) => professions.filter((one) => one >= level).length;
  const towers = Object.values(JSON.parse(row.towers ?? '{}').best ?? {});
  // The cards by land: each land's cards and those the character has.
  const owned = new Set(cards.results.map((card) => card.monster_id));
  const lands = new Map();
  for (const [id, home] of cardHomes(polish)) {
    const land = lands.get(home.landName) ?? { count: 0, target: 0 };
    land.target += 1;
    if (owned.has(id)) land.count += 1;
    lands.set(home.landName, land);
  }
  const best = [...lands.values()].sort((a, b) => b.count / b.target - a.count / a.target)[0] ?? { count: 0, target: 1 };
  // The places of a land the character's level has opened, and the level of
  // its first.
  const areasOf = (land) => polish.regions.filter((region) => region.land === land).flatMap((region) => region.areas);
  const facts = {
    ...feats,
    level: row.level,
    // The third form: an evolution's third stage (content.js in the engine).
    thirdForm: polish.evolutionsById[row.evolution]?.stage === 3 ? 1 : 0,
    professionTop: Math.max(0, ...professions),
    professionsAt10: professionsAt(10),
    professionsAt25: professionsAt(25),
    professionsAt50: professionsAt(50),
    professionsAt100: professionsAt(100),
    cards: owned.size,
    landCards: [...lands.values()].some((land) => land.target > 0 && land.count >= land.target) ? 1 : 0,
    arenaRating: arena.results[0]?.rating ?? 0,
    guildWeeks: member.results[0] ? Math.floor((now - member.results[0].joined_at) / WEEK) : 0,
    friends: friends.results[0]?.n ?? 0,
    towerFloor: Math.max(0, ...towers.map(Number).filter(Number.isFinite)),
    streaks: row.streak_done ?? 0,
    shown: { landCards: best },
  };
  // Each land's own count (achievementFact): the Łysogóry's explorer and
  // Nawia's count their lands apart; so does each profession's.
  for (const one of polish.achievements.groups.flatMap((group) => group.list)) {
    if (one.count === 'landPlaces') facts[achievementFact(one)] = areasOf(one.land).filter((area) => area.minLevel <= row.level).length;
    if (one.count === 'landReached') facts[achievementFact(one)] = row.level >= Math.min(...areasOf(one.land).map((area) => area.minLevel)) ? 1 : 0;
    if (one.count === 'professionLevel') facts[achievementFact(one)] = professionLevels[one.profession] ?? 0;
  }
  return facts;
}

// The achievements done since the last look, given now: their rewards to the
// character, once (in a statement that holds only while the character is as
// read; one raced gives them at the next look).
async function grantDone(db, row, facts, now) {
  const granted = JSON.parse(row.achievements ?? '{}');
  const fresh = newlyDone(facts, granted, content());
  if (fresh.length === 0) return { granted, fresh };
  const next = { ...granted, ...Object.fromEntries(fresh.map((one) => [one.id, now])) };
  const timePoints = fresh.reduce((sum, one) => sum + (one.reward.timePoints ?? 0), 0);
  const systemPoints = fresh.reduce((sum, one) => sum + (one.reward.systemPoints ?? 0), 0);
  const { meta } = await db
    .prepare('UPDATE characters SET achievements = ?, time_points = time_points + ?, system_points = system_points + ?, version = version + 1 WHERE id = ? AND version = ?')
    .bind(JSON.stringify(next), timePoints, systemPoints, row.id, row.version)
    .run();
  return meta.changes === 1 ? { granted: next, fresh } : { granted, fresh: [] };
}

const viewOf = (row, facts, granted) => achievementsView(facts, granted, row.title ?? null, row.appearance, content());

// GET /api/achievements: the window; the achievements done since the last
// look given now, named in `fresh` for the page's message.
export async function getAchievements(context) {
  const { session, player } = await requirePlayer(context);
  const db = context.env.DB;
  const facts = await factsOf(db, player.row, context.now);
  const { granted, fresh } = await grantDone(db, player.row, facts, context.now);
  const loaded = fresh.length > 0 ? await loadPlayer(db, session.userId) : player;
  return json({
    achievements: viewOf(loaded.row, facts, granted),
    fresh: fresh.map((one) => ({ name: one.name, title: titleOf(one, player.row.appearance), reward: one.reward })),
    ...(fresh.length > 0 && { character: characterView(loaded, context.now) }),
  });
}

// POST /api/achievements/title { id }: the title of an achievement given to
// wear, or none (id null).
export async function wearTitle(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const db = context.env.DB;
  const granted = JSON.parse(player.row.achievements ?? '{}');
  const id = body.id ?? null;
  if (id !== null && (typeof id !== 'string' || !granted[id] || !achievementOf(id, content()))) throw new ApiError(400, 'invalid_title', 'Tego tytułu jeszcze nie masz.');
  await db.prepare('UPDATE characters SET title = ?, version = version + 1 WHERE id = ?').bind(id, player.row.id).run();
  const loaded = await loadPlayer(db, session.userId);
  return json({ achievements: viewOf(loaded.row, await factsOf(db, loaded.row, context.now), granted) });
}

// The title a character (its row) wears, in the page's language, or null:
// for its profile and the Ranking.
export const titleText = (row) => wornTitle(row.title ?? null, JSON.parse(row.achievements ?? '{}'), row.appearance, content());

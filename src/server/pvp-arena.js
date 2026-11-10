// The Arena in the Osada (data/settlement.json, arena; src/engine/pvp-arena.js;
// the author, 10.11.2026: „Musimy zacząć też pracować nad Areną PvP, bo
// rośnie baza graczy”, after a player's „Więcej rywalizacji między
// graczami”; his choice 762 A), only where ARENA is on (features.js), from
// the arena unlock's character level (unlocks.json), in the Osada.
//
// Asynchronous: the player never waits for the rival. Five fights a Polish
// day: the player picks one of three rivals of a similar rating (other
// accounts' characters, played or set aside, at the Arena's level at least)
// and fights the rival's character as it is saved now, with the result and
// its log at once. Nothing of either character changes but its rating; the
// rival's character defends itself, and at its next visit to the Arena its
// player sees who challenged it, how it went and how its rating moved.
// Like the Bestia Gildii's attacks, a fight goes in whatever the character
// is doing (an exploration too: it changes nothing of the character, and
// the gear it fights with is the one the exploration keeps), but not while
// it offers itself or serves as a mercenary.
//
// The week's table holds the characters that fought that week, by their
// rating; the first request of the Arena in a new week freezes the weeks
// gone by once for everyone (arena_weeks, as the guilds' Sława,
// guild-fame.js), and each place there brings its reward, claimed once
// with "Odbierz", however late. The first request of a new month moves
// every rating halfway back to the start (the season). Every request of
// the Arena catches up so before anything else (catchUp). A fight is one
// batch that holds only while the attacker's record is as read
// (atomic.js), so two taps make one fight; the rival's rating moves by
// what the fight changed, also if another fight moved it meanwhile.
// Tables: migrations/0107_pvp_arena.sql.

import {
  arenaDay,
  arenaDuel,
  arenaReward,
  arenaRewardTiers,
  arenaRules,
  arenaSeason,
  arenaWeek,
  classNameOf,
  drawRivals,
  duelHpFactor,
  fightsLeft,
  ratingChanges,
  ratingStakes,
  seasonFactor,
} from '../engine/index.js';
import { assertion, atomically } from './atomic.js';
import { attackBlocked, characterView, engineCharacter, equippedItems, loadCharacter, loadPlayer, requireNotExploring, requirePlayer } from './characters.js';
import { content } from './content.js';
import { toHex } from './encoding.js';
import { arenaOn } from './features.js';
import { ApiError, json, readJson } from './http.js';
import { OWN_CHARACTERS } from './roles.js';
import { requireOpen } from './settlement.js';

const DAY = 24 * 60 * 60 * 1000;
const rules = () => arenaRules(content());
const texts = () => rules().texts;
const unlockLevel = () => content().unlocksById.arena.level;
const newSeed = () => toHex(crypto.getRandomValues(new Uint8Array(16)));
const changed = () => new ApiError(409, 'arena_changed', 'Arena zmieniła się w międzyczasie. Spróbuj jeszcze raz.');

// The Arena is there where ARENA is on and the Osada is open, from its
// unlock's level.
function requireArena(row) {
  if (!arenaOn() || !rules()) throw new ApiError(404, 'not_found', 'Areny jeszcze nie ma.');
  requireOpen(row);
  if (row.level < unlockLevel()) throw new ApiError(403, 'locked', texts().locked.replace('{level}', String(unlockLevel())));
}

// A character the Arena may offer as a rival to `row`'s: of another
// account, played or set aside, at the Arena's level at least.
const fairRival = (rival, row) => rival.user_id !== row.user_id && ['player', 'aside'].includes(rival.role) && rival.level >= unlockLevel();

// Every request of the Arena first catches up with time, in one batch: the
// weeks gone by are frozen, once for everyone, with the place and rating of
// each character that fought in them (its `week` is the last one it
// fought, and no character fights in a new week before this has run); a
// new month moves the ratings of the months before toward the start
// (seasonFactor, the same rounding as seasonRating); the fights older than
// keepDays go.
async function catchUp(db, now) {
  const week = arenaWeek(now, content()).key;
  const season = arenaSeason(now, content()).index;
  const { start } = rules().rating;
  const { results: seasons } = await db.prepare('SELECT DISTINCT season FROM arena_ratings WHERE season < ?').bind(season).all();
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO arena_weeks (character_id, week, place, rating)
         SELECT character_id, week, ROW_NUMBER() OVER (PARTITION BY week ORDER BY rating DESC, character_id), rating
         FROM arena_ratings r WHERE week IS NOT NULL AND week < ? AND NOT EXISTS (SELECT 1 FROM arena_weeks w WHERE w.week = r.week)`,
      )
      .bind(week),
    ...seasons.map(({ season: from }) =>
      db
        .prepare('UPDATE arena_ratings SET rating = ? + CAST(ROUND((rating - ?) * ?) AS INTEGER), season = ? WHERE season = ?')
        .bind(start, start, seasonFactor(season - from, content()), season, from),
    ),
    db.prepare('DELETE FROM arena_fights WHERE created_at < ?').bind(now - rules().keepDays * DAY),
  ]);
}

// The statement that gives a character its record in the Arena, with the
// start rating, unless it has one.
const recordStatement = (db, characterId, now) =>
  db.prepare('INSERT OR IGNORE INTO arena_ratings (character_id, rating, season) VALUES (?, ?, ?)').bind(characterId, rules().rating.start, arenaSeason(now, content()).index);

// The character's record, made at its first look at the Arena.
async function recordOf(db, row, now) {
  const [, record] = await db.batch([recordStatement(db, row.id, now), db.prepare('SELECT * FROM arena_ratings WHERE character_id = ?').bind(row.id)]);
  return record.results[0];
}

// The characters a rival is drawn from: those fair to `row` (fairRival),
// the nearest to `rating` first (one that never fought has the start
// rating), at most rivals.pool of them; among as near ones the order
// `seed` gives, so a crowd at the start rating does not always offer the
// same few.
async function rivalCandidates(db, row, rating, seed) {
  const { start } = rules().rating;
  const mix = 1 + (parseInt(seed.slice(0, 8), 16) % 999983);
  const { results } = await db
    .prepare(
      `SELECT c.id, COALESCE(r.rating, ?) AS rating FROM characters c LEFT JOIN arena_ratings r ON r.character_id = c.id
       WHERE c.${OWN_CHARACTERS} AND c.user_id <> ? AND c.level >= ?
       ORDER BY ABS(COALESCE(r.rating, ?) - ?), (c.id * ?) % 1000003 LIMIT ?`,
    )
    .bind(start, row.user_id, unlockLevel(), start, rating, mix, rules().rivals.pool)
    .all();
  return results;
}

// The rivals offered, as stored (ids), each read as it is now; those no
// longer fair left out.
async function rivalsOf(db, row, record) {
  const ids = JSON.parse(record.rivals ?? '[]');
  if (ids.length === 0) return [];
  const { results } = await db
    .prepare(`SELECT c.*, COALESCE(r.rating, ?) AS arena_rating FROM characters c LEFT JOIN arena_ratings r ON r.character_id = c.id WHERE c.id IN (${ids.map(() => '?').join(', ')})`)
    .bind(rules().rating.start, ...ids)
    .all();
  return results.filter((rival) => fairRival(rival, row)).sort((a, b) => b.arena_rating - a.arena_rating || a.id - b.id);
}

// The rivals offered at a look at the Arena: those stored, or, while fewer
// than rivals.count of them are still fair, new ones drawn around the
// character's rating, kept only over the record as read.
async function offeredRivals(db, row, record) {
  const kept = await rivalsOf(db, row, record);
  if (kept.length >= rules().rivals.count) return { record, rivals: kept };
  const seed = newSeed();
  const drawn = drawRivals(await rivalCandidates(db, row, record.rating, seed), seed, content()).map((one) => one.id);
  if (drawn.length <= kept.length) return { record, rivals: kept };
  const next = { ...record, rivals: JSON.stringify(drawn) };
  await db.prepare('UPDATE arena_ratings SET rivals = ? WHERE character_id = ? AND rivals = ?').bind(next.rivals, row.id, record.rivals).run();
  return { record: next, rivals: await rivalsOf(db, row, next) };
}

// A rival as the Arena shows it: its name, class (its evolution's name),
// level, look and rating, and what a win, a loss and a draw with it would
// bring the character's rating.
function rivalView(rival, rating) {
  const character = engineCharacter(rival);
  return {
    id: rival.id,
    name: rival.name,
    classId: rival.class_id,
    className: classNameOf(character, content()),
    level: rival.level,
    appearance: rival.appearance,
    skin: character.skin,
    evolution: rival.evolution ?? null,
    rating: rival.arena_rating,
    stakes: ratingStakes(rating, rival.arena_rating, content()),
  };
}

// The defences since the last visit (the author's 762 A: who, how it went,
// how the rating moved), the newest first, from the defender's side: a
// rival's win is a lost defence. They are seen once shown: the newest one's
// id is kept (seen_id), also over a defence that came meanwhile, which
// waits for the next visit.
async function freshDefences(db, row, record) {
  const { results } = await db
    .prepare(
      `SELECT f.id, f.created_at, f.result, f.defender_change, f.defender_rating, c.name, c.class_id, c.level, c.evolution, c.appearance
       FROM arena_fights f JOIN characters c ON c.id = f.attacker_id
       WHERE f.defender_id = ? AND f.id > ? ORDER BY f.id DESC LIMIT 50`,
    )
    .bind(row.id, record.seen_id)
    .all();
  if (results.length > 0) await db.prepare('UPDATE arena_ratings SET seen_id = MAX(seen_id, ?) WHERE character_id = ?').bind(results[0].id, row.id).run();
  const SIDE = { win: 'loss', loss: 'win', draw: 'draw' };
  return results.map((fight) => ({
    at: fight.created_at,
    name: fight.name,
    classId: fight.class_id,
    className: classNameOf({ classId: fight.class_id, evolution: fight.evolution, appearance: fight.appearance }, content()),
    level: fight.level,
    result: SIDE[fight.result],
    change: fight.defender_change,
    rating: fight.defender_rating,
  }));
}

// The Arena for the page: the character's rating and place on this week's
// table, the fights left today (or why it cannot fight: a mercenary's
// service), the rivals offered, its last fight with its log, the defences
// since the last visit (`defences`, at a look), this week's table (the
// first table.size and its own place), the rewards of the places and those
// waiting for "Odbierz", the season's end, the numbers of the rules and
// the words of the screen.
async function arenaView(db, player, record, rivals, now, defences = null) {
  const { row } = player;
  const arena = rules();
  const week = arenaWeek(now, content());
  const [table, own, due] = await db.batch([
    db
      .prepare(
        `SELECT r.character_id AS id, r.rating, c.name, c.class_id, c.level FROM arena_ratings r JOIN characters c ON c.id = r.character_id
         WHERE r.week = ? ORDER BY r.rating DESC, r.character_id LIMIT ?`,
      )
      .bind(week.key, arena.table.size),
    db
      .prepare('SELECT COUNT(*) + 1 AS place FROM arena_ratings WHERE week = ? AND (rating > ? OR (rating = ? AND character_id < ?))')
      .bind(week.key, record.rating, record.rating, row.id),
    db.prepare('SELECT week, place FROM arena_weeks WHERE character_id = ? AND claimed_at IS NULL ORDER BY week').bind(row.id),
  ]);
  const place = record.week === week.key ? own.results[0].place : null;
  const last = record.last_fight ? JSON.parse(record.last_fight) : null;
  const season = arenaSeason(now, content());
  return {
    rating: record.rating,
    place,
    fights: { left: fightsLeft(record, now, content()), perDay: arena.fightsPerDay, endsAt: arenaDay(now, content()).endsAt },
    blocked: attackBlocked(player.activity, arena.texts.mercenary),
    rivals: rivals.map((rival) => rivalView(rival, record.rating)),
    last,
    defences,
    table: {
      endsAt: week.endsAt,
      rows: table.results.map((one, index) => ({ place: index + 1, id: one.id, name: one.name, classId: one.class_id, level: one.level, rating: one.rating, own: one.id === row.id })),
      own: place === null ? null : { place, rating: record.rating },
    },
    rewards: {
      tiers: arenaRewardTiers(row.level, content()),
      due: due.results.map((frozen) => ({ week: frozen.week, place: frozen.place, ...arenaReward(frozen.place, row.level, content()) })),
    },
    season: { endsAt: season.endsAt },
    // The numbers the rules name: the HP factor for two characters of the
    // character's own level.
    numbers: {
      perDay: arena.fightsPerDay,
      hpFactor: Math.round(duelHpFactor(row.level, row.level, content()) * 10) / 10,
      moves: arena.duel.maxMoves,
      start: arena.rating.start,
      share: Math.round(arena.season.share * 100),
    },
    texts: arena.texts,
    now,
  };
}

// GET /api/settlement/arena: the Arena at a look, with the defences since
// the last one; rivals are drawn when fewer than rivals.count wait.
export async function getArena(context) {
  const { player } = await requirePlayer(context);
  requireArena(player.row);
  const db = context.env.DB;
  const now = context.now;
  await catchUp(db, now);
  const offered = await offeredRivals(db, player.row, await recordOf(db, player.row, now));
  const defences = await freshDefences(db, player.row, offered.record);
  return json({ arena: await arenaView(db, player, offered.record, offered.rivals, now, defences) });
}

// The fighter of a character as it is saved: its stats, gear, skills and
// evolution (arenaDuel takes nothing else).
const fighterOf = (player) => ({ character: engineCharacter(player.row), equipped: equippedItems(player), name: player.row.name });

// POST /api/settlement/arena/fight { rivalId }: one of today's fights with
// one of the rivals offered. The duel and both ratings' moves (the
// attacker's by rating.attackK, the defender's by rating.defenceK), the
// fight written down for the defender's notice, the day's count, this
// week's table and new rivals around the new rating (the one just fought
// only when no other is there) are saved in one batch over the record as
// read. Gives the fight, with its log, and the Arena after it.
export async function arenaFight(context) {
  const { player } = await requirePlayer(context);
  const { row } = player;
  requireArena(row);
  const now = context.now;
  // A character offering itself as a mercenary, or serving, does not fight
  // (as the Bestia Gildii's attacks).
  if (player.activity?.kind === 'mercenary') requireNotExploring(player, now);
  const body = await readJson(context.request);
  const rivalId = Number(body.rivalId);
  const db = context.env.DB;
  await catchUp(db, now);
  const record = await recordOf(db, row, now);
  if (fightsLeft(record, now, content()) <= 0) throw new ApiError(409, 'used', texts().used);
  if (!Number.isInteger(rivalId) || !JSON.parse(record.rivals).includes(rivalId)) throw new ApiError(409, 'gone', texts().gone);
  const rival = await loadCharacter(db, rivalId);
  if (!rival || !fairRival(rival.row, row)) throw new ApiError(409, 'gone', texts().gone);
  const rivalRecord = await db.prepare('SELECT rating FROM arena_ratings WHERE character_id = ?').bind(rivalId).first();

  const seed = newSeed();
  const duel = arenaDuel({ attacker: fighterOf(player), defender: fighterOf(rival), seed }, content());
  const before = { attacker: record.rating, defender: rivalRecord?.rating ?? rules().rating.start };
  const changes = ratingChanges(before.attacker, before.defender, duel.result, content());
  const after = { attacker: before.attacker + changes.attacker, defender: before.defender + changes.defender };
  const next = drawRivals(await rivalCandidates(db, row, after.attacker, seed), seed, content(), [rivalId]).map((one) => one.id);
  const today = arenaDay(now, content()).key;
  const { floor } = rules().rating;
  const last = {
    at: now,
    rival: { id: rivalId, name: rival.row.name, classId: rival.row.class_id, className: classNameOf(engineCharacter(rival.row), content()), level: rival.row.level },
    result: duel.result,
    limit: duel.limit,
    before: before.attacker,
    after: after.attacker,
    change: changes.attacker,
    fight: duel.fight,
  };
  await atomically(
    db,
    [
      assertion(db, "(SELECT COALESCE(day, '') || ':' || fights || ':' || rivals FROM arena_ratings WHERE character_id = ?) = ?", [
        row.id,
        `${record.day ?? ''}:${record.fights}:${record.rivals}`,
      ]),
      recordStatement(db, rivalId, now),
      db
        .prepare(
          `UPDATE arena_ratings SET rating = MAX(?, rating + ?), fights = CASE WHEN day = ? THEN fights + 1 ELSE 1 END, day = ?, week = ?, rivals = ?, last_fight = ?
           WHERE character_id = ?`,
        )
        .bind(floor, changes.attacker, today, today, arenaWeek(now, content()).key, JSON.stringify(next), JSON.stringify(last), row.id),
      db.prepare('UPDATE arena_ratings SET rating = MAX(?, rating + ?) WHERE character_id = ?').bind(floor, changes.defender, rivalId),
      db
        .prepare(
          `INSERT INTO arena_fights (attacker_id, defender_id, created_at, result, attacker_change, defender_change, attacker_rating, defender_rating, seed)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(row.id, rivalId, now, duel.result, changes.attacker, changes.defender, after.attacker, after.defender, seed),
    ],
    changed,
  );
  const saved = await recordOf(db, row, now);
  return json({ fight: last, arena: await arenaView(db, player, saved, await rivalsOf(db, row, saved), now) });
}

// POST /api/settlement/arena/claim { week }: the reward of the character's
// place on a frozen week's table, once: its Punkty Systemu and the gold for
// its level now.
export async function claimArenaReward(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireArena(row);
  const body = await readJson(context.request);
  const week = String(body.week ?? '');
  const db = context.env.DB;
  const now = context.now;
  await catchUp(db, now);
  const frozen = await db.prepare('SELECT place FROM arena_weeks WHERE character_id = ? AND week = ? AND claimed_at IS NULL').bind(row.id, week).first();
  if (!frozen) throw new ApiError(409, 'no_reward', texts().noReward);
  const reward = arenaReward(frozen.place, row.level, content());
  const gone = () => new ApiError(409, 'no_reward', texts().noReward);
  await atomically(
    db,
    [
      assertion(db, '(SELECT claimed_at FROM arena_weeks WHERE character_id = ? AND week = ?) IS NULL', [row.id, week]),
      db.prepare('UPDATE arena_weeks SET claimed_at = ? WHERE character_id = ? AND week = ?').bind(now, row.id, week),
      db.prepare('UPDATE characters SET gold = gold + ?, system_points = system_points + ?, version = version + 1 WHERE id = ?').bind(reward.gold, reward.systemPoints, row.id),
    ],
    gone,
  );
  const after = await loadPlayer(db, session.userId);
  const record = await recordOf(db, after.row, now);
  return json({
    reward: { week, place: frozen.place, ...reward },
    arena: await arenaView(db, after, record, await rivalsOf(db, after.row, record), now),
    character: characterView(after, now),
  });
}

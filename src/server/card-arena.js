// The Arena's "Karty" (data/settlement.json, arena.cards; src/engine/card-arena.js;
// DECISIONS.md, "Karty z innymi graczami, z mieszkańcami Osady i z nowych
// źródeł", 900 A; the author: „Zróbmy też opcję na grę w karty z ludźmi
// innymi, nie tylko ze Szczęsnym. Najlepiej podkategoria w ramach Areny”),
// the Arena's third tab, where both the Arena and Talia Systemu are on
// (ARENA, CARDS; features.js), from the Arena's level, in the Osada.
//
// Asynchronous, as the duels (pvp-arena.js): the player picks one of three
// rivals of a similar card rating, characters of other accounts with a deck
// saved in the Salon Gier (card_decks), and plays a match of Talia Systemu
// against that deck, its cards at the rival's levels, the server laying the
// rival's cards as Szczęsny on his higher tiers, openly before the player's
// turn, with the rival's hero card (rivalSkill in src/engine/cards.js); for
// laying first, the defending deck's cards have defenceBonus more Atak and
// Życie (915 B). The player's own deck defends it so while it is away. Five
// matches a Polish day, each counted at its start; one running at a time,
// apart from the Salon's (card_matches). What the match puts at stake for both card
// ratings is fixed at its start, and both move at its end: a match given up
// is lost. Its defender sees it among its deck's last defences, those since
// its last visit marked new. "Losuj innych" draws other rivals a few times
// a day. The week's card table is frozen on Monday at Polish midnight, as
// the duels', and each place's reward, half of the duels' (900 A), is
// claimed once with "Odbierz"; a new month moves every card rating halfway
// back to the start. Every request of the Karty catches up so first
// (catchUp). Each turn is one request, saved only over the match as read
// (its version): two taps play one turn, and two taps on "Graj" start one
// match. Tables: migrations/0128_card_arena.sql.

import {
  arenaDay,
  arenaRules,
  arenaSeason,
  arenaWeek,
  cardArenaOutcome,
  cardArenaReward,
  cardArenaRewardTiers,
  cardArenaRules,
  cardLevel,
  cardMatchesLeft,
  cardRatingStakes,
  cardRerollsLeft,
  cardSeasonFactor,
  classNameOf,
  deckBlock,
  deckStrength,
  deckTypeCounts,
  drawCardRivals,
  heroSkill,
  isCard,
  matchView,
  newMatch,
  playTurn,
  surrenderMatch,
  turnBlock,
} from '../engine/index.js';
import { assertion, atomically } from './atomic.js';
import { cardCollection, cardGameOf, deckSlots, heroOf, heroView } from './cards.js';
import { characterView, engineCharacter, loadPlayer, requirePlayer } from './characters.js';
import { content } from './content.js';
import { toHex } from './encoding.js';
import { arenaOn, cardsOn } from './features.js';
import { ApiError, json, readJson } from './http.js';
import { OWN_CHARACTERS } from './roles.js';
import { requireOpen } from './settlement.js';

const DAY = 24 * 60 * 60 * 1000;
const rules = () => cardArenaRules(content());
const texts = () => rules().texts;
const unlockLevel = () => content().unlocksById.arena.level;
const newSeed = () => toHex(crypto.getRandomValues(new Uint8Array(16)));
const changed = () => new ApiError(409, 'arena_changed', 'Arena zmieniła się w międzyczasie. Spróbuj jeszcze raz.');
const matchChanged = () => new ApiError(409, 'match_changed', 'Partia zmieniła się w międzyczasie. Spróbuj jeszcze raz.');

// Whether the Arena has its Karty here: the Arena and Talia Systemu on,
// with their data.
export const cardArenaHere = () => arenaOn() && cardsOn() && Boolean(content().cards) && Boolean(arenaRules(content())) && Boolean(rules());

// The Karty are there with the Arena, from its unlock's level, where the
// Osada is open.
function requireCardArena(row) {
  if (!cardArenaHere()) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  requireOpen(row);
  if (row.level < unlockLevel()) throw new ApiError(403, 'locked', arenaRules(content()).texts.locked.replace('{level}', String(unlockLevel())));
}

// A character the Karty may offer as a rival to `row`'s, as the duels: of
// another account, played or set aside, at the Arena's level at least (its
// deck checked apart, decksOf).
const fairRival = (rival, row) => rival.user_id !== row.user_id && ['player', 'aside'].includes(rival.role) && rival.level >= unlockLevel();

// Every request of the Karty first catches up with time, in one batch, as
// the duels' (pvp-arena.js): the weeks gone by frozen once for everyone,
// with the place and card rating of each character that finished a match
// in them; a new month moving the ratings of the months before toward the
// start; the matches finished more than keepDays ago gone.
async function catchUp(db, now) {
  const week = arenaWeek(now, content()).key;
  const season = arenaSeason(now, content()).index;
  const { start } = rules().rating;
  const { results: seasons } = await db.prepare('SELECT DISTINCT season FROM card_arena_ratings WHERE season < ?').bind(season).all();
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO card_arena_weeks (character_id, week, place, rating)
         SELECT character_id, week, ROW_NUMBER() OVER (PARTITION BY week ORDER BY rating DESC, character_id), rating
         FROM card_arena_ratings r WHERE week IS NOT NULL AND week < ? AND NOT EXISTS (SELECT 1 FROM card_arena_weeks w WHERE w.week = r.week)`,
      )
      .bind(week),
    ...seasons.map(({ season: from }) =>
      db
        .prepare('UPDATE card_arena_ratings SET rating = ? + CAST(ROUND((rating - ?) * ?) AS INTEGER), season = ? WHERE season = ?')
        .bind(start, start, cardSeasonFactor(season - from, content()), season, from),
    ),
    db.prepare('DELETE FROM card_arena_results WHERE created_at < ?').bind(now - rules().keepDays * DAY),
  ]);
}

// The statement that gives a character its record in the Karty, with the
// start rating, unless it has one.
const recordStatement = (db, characterId, now) =>
  db.prepare('INSERT OR IGNORE INTO card_arena_ratings (character_id, rating, season) VALUES (?, ?, ?)').bind(characterId, rules().rating.start, arenaSeason(now, content()).index);

// The character's record, made at its first look at the Karty.
async function recordOf(db, row, now) {
  const [, record] = await db.batch([recordStatement(db, row.id, now), db.prepare('SELECT * FROM card_arena_ratings WHERE character_id = ?').bind(row.id)]);
  return record.results[0];
}

// The decks of the characters `ids` as a match plays them: each its twelve
// cards ({ id, level }, the level from the copies its character has), only
// a whole one (deckBlock: twelve different cards of its collection, every
// one still a card of the game).
async function decksOf(db, ids) {
  const found = new Map();
  if (ids.length === 0) return found;
  const marks = ids.map(() => '?').join(', ');
  const [decks, owned] = await db.batch([
    db.prepare(`SELECT character_id, cards FROM card_decks WHERE character_id IN (${marks})`).bind(...ids),
    db.prepare(`SELECT character_id, monster_id, copies FROM cards WHERE character_id IN (${marks})`).bind(...ids),
  ]);
  const collections = new Map();
  for (const one of owned.results) {
    if (!isCard(one.monster_id, content())) continue;
    if (!collections.has(one.character_id)) collections.set(one.character_id, new Map());
    collections.get(one.character_id).set(one.monster_id, one.copies);
  }
  for (const deck of decks.results) {
    let cards;
    try {
      cards = JSON.parse(deck.cards);
    } catch {
      continue;
    }
    const collection = collections.get(deck.character_id) ?? new Map();
    if (deckBlock(cards, new Set(collection.keys()), content())) continue;
    found.set(
      deck.character_id,
      cards.map((id) => ({ id, level: cardLevel(collection.get(id), content()) })),
    );
  }
  return found;
}

// The characters a rival is drawn from: those fair to `row` with a deck
// saved, the nearest to `rating` first (one that never played has the start
// rating), at most rivals.pool of them; among as near ones the order `seed`
// gives, as in the duels.
async function rivalCandidates(db, row, rating, seed) {
  const { start } = rules().rating;
  const mix = 1 + (parseInt(seed.slice(0, 8), 16) % 999983);
  const { results } = await db
    .prepare(
      `SELECT c.id, COALESCE(r.rating, ?) AS rating FROM characters c JOIN card_decks d ON d.character_id = c.id LEFT JOIN card_arena_ratings r ON r.character_id = c.id
       WHERE c.${OWN_CHARACTERS} AND c.user_id <> ? AND c.level >= ?
       ORDER BY ABS(COALESCE(r.rating, ?) - ?), (c.id * ?) % 1000003 LIMIT ?`,
    )
    .bind(start, row.user_id, unlockLevel(), start, rating, mix, rules().rivals.pool)
    .all();
  return results;
}

// The rivals offered, as stored (ids), each read as it is now with its
// deck; those no longer fair, or with no whole deck, left out.
async function rivalsOf(db, row, record) {
  const ids = JSON.parse(record.rivals ?? '[]');
  if (ids.length === 0) return [];
  const [{ results }, decks] = await Promise.all([
    db
      .prepare(`SELECT c.*, COALESCE(r.rating, ?) AS card_rating FROM characters c LEFT JOIN card_arena_ratings r ON r.character_id = c.id WHERE c.id IN (${ids.map(() => '?').join(', ')})`)
      .bind(rules().rating.start, ...ids)
      .all(),
    decksOf(db, ids),
  ]);
  return results
    .filter((rival) => fairRival(rival, row) && decks.has(rival.id))
    .map((rival) => ({ ...rival, deck: decks.get(rival.id) }))
    .sort((a, b) => b.card_rating - a.card_rating || a.id - b.id);
}

// The rivals offered at a look: those stored, or, while fewer than
// rivals.count of them are still there, new ones drawn around the
// character's card rating, kept only over the record as read (another
// look's draw, kept first, is the one shown, as in the duels).
async function offeredRivals(db, row, record) {
  const kept = await rivalsOf(db, row, record);
  if (kept.length >= rules().rivals.count) return { record, rivals: kept };
  const seed = newSeed();
  const drawn = drawCardRivals(await rivalCandidates(db, row, record.rating, seed), seed, content()).map((one) => one.id);
  if (drawn.length <= kept.length) return { record, rivals: kept };
  const next = { ...record, rivals: JSON.stringify(drawn) };
  const saved = await db.prepare('UPDATE card_arena_ratings SET rivals = ? WHERE character_id = ? AND rivals = ?').bind(next.rivals, row.id, record.rivals).run();
  if (saved.meta.changes !== 1) {
    const stored = await db.prepare('SELECT * FROM card_arena_ratings WHERE character_id = ?').bind(row.id).first();
    if (stored) return { record: stored, rivals: await rivalsOf(db, row, stored) };
  }
  return { record: next, rivals: await rivalsOf(db, row, next) };
}

// A rival as the Karty show it: its name, class (its evolution's name),
// level, look and card rating, its deck's strength (900 A: the Atak and
// Życie of its twelve cards), what a win, a loss and a draw with it would
// bring the character's card rating, and its hero card's skill.
function rivalView(rival, rating) {
  const character = engineCharacter(rival);
  const hero = heroOf(rival);
  return {
    id: rival.id,
    name: rival.name,
    classId: rival.class_id,
    className: classNameOf(character, content()),
    level: rival.level,
    appearance: rival.appearance,
    skin: character.skin,
    evolution: rival.evolution ?? null,
    rating: rival.card_rating,
    strength: deckStrength(rival.deck, content()),
    stakes: cardRatingStakes(rating, rival.card_rating, content()).attacker,
    skill: heroSkill(hero.classId, hero.stage, content())?.name ?? null,
  };
}

// A match's result from its defender's side: a rival's win is a lost defence.
const DEFENDER = { win: 'loss', loss: 'win', draw: 'draw' };

// A defence of the character's deck as its defender sees it: who played
// against it (its class, level and whether a woman, for the words), how it
// went from the deck's side and how the card rating moved.
const defenceView = (match) => ({
  id: match.id,
  at: match.created_at,
  name: match.name,
  classId: match.class_id,
  className: classNameOf({ classId: match.class_id, evolution: match.evolution, appearance: match.appearance }, content()),
  level: match.level,
  female: match.appearance === 'female',
  result: DEFENDER[match.result],
  change: match.defender_change,
  rating: match.defender_rating,
});

// The last defences of the character's deck, the newest first, at most
// defences.shown of those kept (keepDays); those since the last visit are
// `unseen`, and seen once shown (seen_id), as the duels' defences.
async function recentDefences(db, row, record) {
  const { results } = await db
    .prepare(
      `SELECT f.id, f.created_at, f.result, f.defender_change, f.defender_rating, c.name, c.class_id, c.level, c.evolution, c.appearance
       FROM card_arena_results f JOIN characters c ON c.id = f.attacker_id WHERE f.defender_id = ? ORDER BY f.id DESC LIMIT ?`,
    )
    .bind(row.id, rules().defences.shown)
    .all();
  if (results.length > 0 && results[0].id > record.seen_id) {
    await db.prepare('UPDATE card_arena_ratings SET seen_id = MAX(seen_id, ?) WHERE character_id = ?').bind(results[0].id, row.id).run();
  }
  return results.map((match) => ({ ...defenceView(match), unseen: match.id > record.seen_id }));
}

const runningMatch = (db, characterId) => db.prepare('SELECT * FROM card_arena_matches WHERE character_id = ?').bind(characterId).first();

// The running match as the page sees it (matchView: never the seed, the
// decks' order nor the rival's reserve), with the rival as the table shows
// it and what the match puts at stake for the character's card rating.
function runningView(match) {
  return { rival: JSON.parse(match.rival), stakes: JSON.parse(match.stakes).attacker, ...matchView(JSON.parse(match.state), content()) };
}

// The Karty for the page: the character's card rating and place on this
// week's table, the matches left today, its deck (its strength, its types,
// whether it has taken Szczęsny's starter deck), its saved decks (938) and
// hero card, the rivals
// offered and the draws of others left today, its deck's last defences (at
// a look), this week's table (the first table.size and its own place), the
// rewards of the places and those waiting for "Odbierz", the season's end,
// the running match, the numbers of the rules, the words of the tab and
// those of the cards' table (types, lines).
async function cardArenaView(db, player, record, rivals, now, defences = null) {
  const { row } = player;
  const data = rules();
  const cards = content().cards;
  const week = arenaWeek(now, content());
  const [[table, own, due], running, decks, saved] = await Promise.all([
    db.batch([
      db
        .prepare(
          `SELECT r.character_id AS id, r.rating, c.name, c.class_id, c.level FROM card_arena_ratings r JOIN characters c ON c.id = r.character_id
           WHERE r.week = ? ORDER BY r.rating DESC, r.character_id LIMIT ?`,
        )
        .bind(week.key, data.table.size),
      db
        .prepare('SELECT COUNT(*) + 1 AS place FROM card_arena_ratings WHERE week = ? AND (rating > ? OR (rating = ? AND character_id < ?))')
        .bind(week.key, record.rating, record.rating, row.id),
      db.prepare('SELECT week, place FROM card_arena_weeks WHERE character_id = ? AND claimed_at IS NULL ORDER BY week').bind(row.id),
    ]),
    runningMatch(db, row.id),
    decksOf(db, [row.id]),
    // The saved decks, one played with a tap (938).
    cardCollection(db, row.id).then((collection) => deckSlots(db, row.id, collection)),
  ]);
  const place = record.week === week.key ? own.results[0].place : null;
  const deck = decks.get(row.id) ?? null;
  return {
    rating: record.rating,
    place,
    matches: { left: cardMatchesLeft(record, now, content()), perDay: data.matchesPerDay, endsAt: arenaDay(now, content()).endsAt },
    deck: deck && { strength: deckStrength(deck, content()), types: deckTypeCounts(deck, content()) },
    decks: saved,
    starter: cardGameOf(row, arenaDay(now, content()).key).starter,
    hero: heroView(row),
    rivals: rivals.map((rival) => rivalView(rival, record.rating)),
    rerolls: { left: cardRerollsLeft(record, now, content()), perDay: data.rivals.rerollsPerDay },
    defences,
    table: {
      endsAt: week.endsAt,
      rows: table.results.map((one, index) => ({ place: index + 1, id: one.id, name: one.name, classId: one.class_id, level: one.level, rating: one.rating, own: one.id === row.id })),
      own: place === null ? null : { place, rating: record.rating },
    },
    rewards: {
      tiers: cardArenaRewardTiers(row.level, content()),
      due: due.results.map((frozen) => ({ week: frozen.week, place: frozen.place, ...cardArenaReward(frozen.place, row.level, content()) })),
    },
    season: { endsAt: arenaSeason(now, content()).endsAt },
    match: running ? runningView(running) : null,
    numbers: {
      perDay: data.matchesPerDay,
      rerolls: data.rivals.rerollsPerDay,
      start: data.rating.start,
      share: Math.round(data.season.share * 100),
      defence: Math.round(data.defenceBonus * 100),
      deckSize: cards.deckSize,
    },
    texts: data.texts,
    // The cards' table, as the Salon's tab has it (cards.js).
    types: cards.types,
    lines: cards.lines,
    typeBonus: cards.typeBonus,
    now,
  };
}

// The Karty for the Arena's look (pvp-arena.js): their tab's and the week's
// table's words and the weeks whose card rewards wait, once the Karty
// caught up with time (so a week just closed shows its reward); null where
// the Arena has no Karty.
export async function cardArenaBrief(db, row, now) {
  if (!cardArenaHere()) return null;
  await catchUp(db, now);
  const due = await db.prepare('SELECT COUNT(*) AS count FROM card_arena_weeks WHERE character_id = ? AND claimed_at IS NULL').bind(row.id).first();
  const words = texts();
  return { due: due?.count ?? 0, texts: { tab: words.tab, duels: words.boardDuels, cards: words.boardCards } };
}

// The answer of an action: the Karty after it, with what the action gave.
async function respond(db, player, now, extra = {}) {
  const record = await recordOf(db, player.row, now);
  return json({ ...extra, arena: await cardArenaView(db, player, record, await rivalsOf(db, player.row, record), now) });
}

// GET /api/cards/arena: the Karty at a look, with the deck's last
// defences, those since the look before marked; rivals are drawn when fewer
// than rivals.count wait.
export async function getCardArena(context) {
  const { player } = await requirePlayer(context);
  requireCardArena(player.row);
  const db = context.env.DB;
  const now = context.now;
  await catchUp(db, now);
  const offered = await offeredRivals(db, player.row, await recordOf(db, player.row, now));
  const defences = await recentDefences(db, player.row, offered.record);
  return json({ arena: await cardArenaView(db, player, offered.record, offered.rivals, now, defences) });
}

// POST /api/cards/arena/match { rivalId }: a match with one of the rivals
// offered, against its saved deck, the character's own deck on its side,
// both at their cards' levels now and with their hero cards, the rival's
// raised by the defence's bonus (915 B); one of the day's matches. What it puts at stake for both card ratings is fixed now
// (cardRatingStakes). Saved in one batch over the record as read, with the
// rival's record made for its rating (so two taps start one match); one
// match at a time.
export async function startCardArenaMatch(context) {
  const { player } = await requirePlayer(context);
  const { row } = player;
  requireCardArena(row);
  const body = await readJson(context.request);
  const rivalId = Number(body?.rivalId);
  const db = context.env.DB;
  const now = context.now;
  await catchUp(db, now);
  const record = await recordOf(db, row, now);
  if (await runningMatch(db, row.id)) throw new ApiError(409, 'match_running', texts().running);
  if (cardMatchesLeft(record, now, content()) <= 0) throw new ApiError(409, 'used', texts().used);
  if (!Number.isInteger(rivalId) || !JSON.parse(record.rivals).includes(rivalId)) throw new ApiError(409, 'gone', texts().gone);
  const decks = await decksOf(db, [row.id, rivalId]);
  const mine = decks.get(row.id);
  if (!mine) throw new ApiError(409, 'no_deck', texts().noDeckPlay);
  const rival = await db
    .prepare('SELECT c.*, COALESCE(r.rating, ?) AS card_rating FROM characters c LEFT JOIN card_arena_ratings r ON r.character_id = c.id WHERE c.id = ?')
    .bind(rules().rating.start, rivalId)
    .first();
  const theirs = decks.get(rivalId);
  if (!rival || !fairRival(rival, row) || !theirs) throw new ApiError(409, 'gone', texts().gone);
  const stakes = cardRatingStakes(record.rating, rival.card_rating, content());
  const state = newMatch({ seed: newSeed(), me: { cards: mine, hero: heroOf(row) }, foe: { cards: theirs, hero: heroOf(rival), smart: rules().smart, boost: rules().defenceBonus } }, content());
  const today = arenaDay(now, content()).key;
  try {
    await atomically(
      db,
      [
        assertion(db, "(SELECT COALESCE(day, '') || ':' || matches || ':' || rivals FROM card_arena_ratings WHERE character_id = ?) = ?", [
          row.id,
          `${record.day ?? ''}:${record.matches}:${record.rivals}`,
        ]),
        recordStatement(db, rivalId, now),
        db.prepare('UPDATE card_arena_ratings SET matches = CASE WHEN day = ? THEN matches + 1 ELSE 1 END, day = ? WHERE character_id = ?').bind(today, today, row.id),
        db
          .prepare('INSERT INTO card_arena_matches (character_id, rival_id, rival, stakes, state, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(row.id, rivalId, JSON.stringify(rivalView({ ...rival, deck: theirs }, record.rating)), JSON.stringify(stakes), JSON.stringify(state), now),
      ],
      changed,
    );
  } catch (error) {
    if (/UNIQUE|PRIMARY KEY/i.test(String(error?.message))) throw new ApiError(409, 'match_running', texts().running);
    throw error;
  }
  return respond(db, player, now, { started: true });
}

// The end of the running match (`state`, its result set): both card ratings
// moved by what it put at stake for its result (the rival's only while its
// character is there), never below the floor; the character on this week's
// table, new rivals drawn around its new rating (the one just played only
// when no other is there), the match written down for its defender's
// notice, and the running match gone. One batch over the match as read, and
// only while the end's week is not frozen yet: a match ended just before
// Monday's midnight and saved after another look froze its week would miss
// its table, so it is refused, and ended again it counts in the new week,
// as a duel. Answers with the end (the ratings before and after it, as
// saved), the table's last board and the Karty after it.
async function finish(db, player, match, state, now) {
  const { row } = player;
  const result = cardArenaOutcome(state.result);
  const stakes = JSON.parse(match.stakes);
  const change = { attacker: stakes.attacker[result], defender: stakes.defender[result] };
  const record = await recordOf(db, row, now);
  const { floor } = rules().rating;
  const seed = newSeed();
  const recent = match.rival_id === null ? [] : [match.rival_id];
  const next = drawCardRivals(await rivalCandidates(db, row, Math.max(floor, record.rating + change.attacker), seed), seed, content(), recent).map((one) => one.id);
  const week = arenaWeek(now, content()).key;
  const rival = JSON.parse(match.rival);
  const last = { at: now, result: state.result, rounds: state.round, rival: { id: rival.id, name: rival.name, classId: rival.classId, className: rival.className, level: rival.level } };
  // The rival's character as it is now (none, once removed): read in the batch.
  const rivalNow = '(SELECT rival_id FROM card_arena_matches WHERE character_id = ?)';
  await atomically(
    db,
    [
      assertion(db, '(SELECT version FROM card_arena_matches WHERE character_id = ?) = ?', [row.id, match.version]),
      assertion(db, 'NOT EXISTS (SELECT 1 FROM card_arena_weeks WHERE week = ?)', [week]),
      db
        .prepare(
          `UPDATE card_arena_ratings SET rating = MAX(?, rating + ?), week = ?, rivals = ?,
             last_match = json_set(?, '$.before', rating, '$.after', MAX(?, rating + ?), '$.change', MAX(?, rating + ?) - rating)
           WHERE character_id = ?`,
        )
        .bind(floor, change.attacker, week, JSON.stringify(next), JSON.stringify(last), floor, change.attacker, floor, change.attacker, row.id),
      db.prepare(`UPDATE card_arena_ratings SET rating = MAX(?, rating + ?) WHERE character_id = ${rivalNow}`).bind(floor, change.defender, row.id),
      db
        .prepare(
          `INSERT INTO card_arena_results (attacker_id, defender_id, created_at, result, rounds, attacker_change, defender_change, attacker_rating, defender_rating)
           VALUES (?, ${rivalNow}, ?, ?, ?, ?, ?, (SELECT rating FROM card_arena_ratings WHERE character_id = ?), (SELECT rating FROM card_arena_ratings WHERE character_id = ${rivalNow}))`,
        )
        .bind(row.id, row.id, now, result, state.round, change.attacker, change.defender, row.id, row.id),
      db.prepare('DELETE FROM card_arena_matches WHERE character_id = ?').bind(row.id),
    ],
    changed,
  );
  const saved = await recordOf(db, row, now);
  const end = JSON.parse(saved.last_match);
  return json({
    end,
    played: matchView(state, content()),
    arena: await cardArenaView(db, player, saved, await rivalsOf(db, row, saved), now),
  });
}

// POST /api/cards/arena/turn { round, lines, skill }: the player's turn of
// the running match (turnBlock, playTurn), the rival's lines for the next
// round laid by the engine with its hero's skill; at the match's end both
// ratings move (finish). Only over the match as read (its version).
export async function playCardArenaTurn(context) {
  const { player } = await requirePlayer(context);
  const { row } = player;
  requireCardArena(row);
  const body = await readJson(context.request);
  const db = context.env.DB;
  const now = context.now;
  await catchUp(db, now);
  const match = await runningMatch(db, row.id);
  if (!match) throw new ApiError(409, 'no_match', texts().noMatch);
  const state = JSON.parse(match.state);
  const block = turnBlock(state, body, content());
  if (block) throw new ApiError(block.status ?? 400, block.code, block.message);
  const next = playTurn(state, { round: body.round, lines: body.lines, skill: body.skill ?? null }, content());
  if (next.result) return finish(db, player, match, next, now);
  await atomically(
    db,
    [
      assertion(db, '(SELECT version FROM card_arena_matches WHERE character_id = ?) = ?', [row.id, match.version]),
      db.prepare('UPDATE card_arena_matches SET state = ?, version = version + 1 WHERE character_id = ? AND version = ?').bind(JSON.stringify(next), row.id, match.version),
    ],
    matchChanged,
  );
  return respond(db, player, now);
}

// POST /api/cards/arena/surrender: the running match given up, lost: both
// ratings move as for a loss.
export async function surrenderCardArena(context) {
  const { player } = await requirePlayer(context);
  const { row } = player;
  requireCardArena(row);
  const db = context.env.DB;
  const now = context.now;
  await catchUp(db, now);
  const match = await runningMatch(db, row.id);
  if (!match) throw new ApiError(409, 'no_match', texts().noMatch);
  return finish(db, player, match, surrenderMatch(JSON.parse(match.state)), now);
}

// POST /api/cards/arena/reroll: other rivals instead of those offered
// ("Losuj innych"), rivals.rerollsPerDay times a Polish day, without using
// up a match, from the same pool around the character's card rating, those
// not offered now first; a draw that brings nobody new is refused and not
// counted. Saved over the record as read, so two taps make one draw.
export async function rerollCardArena(context) {
  const { player } = await requirePlayer(context);
  const { row } = player;
  requireCardArena(row);
  const db = context.env.DB;
  const now = context.now;
  await catchUp(db, now);
  const record = await recordOf(db, row, now);
  if (cardRerollsLeft(record, now, content()) <= 0) throw new ApiError(409, 'no_rerolls', texts().rerollsUsed);
  const offered = JSON.parse(record.rivals);
  const seed = newSeed();
  const drawn = drawCardRivals(await rivalCandidates(db, row, record.rating, seed), seed, content(), offered).map((one) => one.id);
  if (drawn.every((id) => offered.includes(id))) throw new ApiError(409, 'no_others', texts().noOthers);
  const today = arenaDay(now, content()).key;
  await atomically(
    db,
    [
      assertion(db, "(SELECT COALESCE(reroll_day, '') || ':' || rerolls || ':' || rivals FROM card_arena_ratings WHERE character_id = ?) = ?", [
        row.id,
        `${record.reroll_day ?? ''}:${record.rerolls}:${record.rivals}`,
      ]),
      db
        .prepare('UPDATE card_arena_ratings SET rivals = ?, rerolls = CASE WHEN reroll_day = ? THEN rerolls + 1 ELSE 1 END, reroll_day = ? WHERE character_id = ?')
        .bind(JSON.stringify(drawn), today, today, row.id),
    ],
    changed,
  );
  return respond(db, player, now);
}

// POST /api/cards/arena/claim { week }: the reward of the character's place
// on a frozen week's card table, once: its Punkty Systemu and the gold for
// its level now, half of the duels' (cardArenaReward).
export async function claimCardArenaReward(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireCardArena(row);
  const body = await readJson(context.request);
  const week = String(body?.week ?? '');
  const db = context.env.DB;
  const now = context.now;
  await catchUp(db, now);
  const frozen = await db.prepare('SELECT place FROM card_arena_weeks WHERE character_id = ? AND week = ? AND claimed_at IS NULL').bind(row.id, week).first();
  const gone = () => new ApiError(409, 'no_reward', texts().noReward);
  if (!frozen) throw gone();
  const reward = cardArenaReward(frozen.place, row.level, content());
  await atomically(
    db,
    [
      assertion(db, '(SELECT claimed_at FROM card_arena_weeks WHERE character_id = ? AND week = ?) IS NULL', [row.id, week]),
      db.prepare('UPDATE card_arena_weeks SET claimed_at = ? WHERE character_id = ? AND week = ?').bind(now, row.id, week),
      db.prepare('UPDATE characters SET gold = gold + ?, system_points = system_points + ?, version = version + 1 WHERE id = ?').bind(reward.gold, reward.systemPoints, row.id),
    ],
    gone,
  );
  const after = await loadPlayer(db, session.userId);
  const record = await recordOf(db, after.row, now);
  return json({
    reward: { week, place: frozen.place, ...reward },
    arena: await cardArenaView(db, after, record, await rivalsOf(db, after.row, record), now),
    character: characterView(after, now),
  });
}

// Partie kart na żywo (901 B; DECISIONS.md, „Karty z innymi graczami, z
// mieszkańcami Osady i z nowych źródeł”, point 2, and „Partie kart na żywo:
// zbudowane”): Talia Systemu's match (src/engine/card-duel.js) between two
// players, where CARDS is on, for a stake or without one.
//
// One player challenges another, who is in the game now (online as for a
// Wymiana: plays that character and asked the server lately), on that
// character's card; the challenge waits live.acceptSeconds for its answer.
// On acceptance both decks go to the table, and for a stake both pay it at
// once, in one batch that holds only while both have the gold and the day's
// matches for gold left (perDay, counted at the start, by the Salon's day).
// The match's state (the seed, both decks and reserves) never leaves the
// server; each player sees it from its side (duelView). A row of
// `card_duels` is a challenge and then its match: `proposed` → `declined`,
// `expired` or `playing` → `done`, with a version that every change raises,
// so two requests at once never apply a move twice nor pay twice.
//
// The server cannot push, so every deadline is kept when the row is read
// next (settled): a challenge past its time expires, and the moves missed in
// a match are made in their order (duelCatchUp), the match paid at its end.
// Each player's page reads it: the chat's poll every 15 seconds (duelNews,
// chat.js) and the table every two seconds while it is on the screen. Who
// wins takes both stakes but the System's cut; a draw gives each its own
// back. One challenge or match a character at a time; a challenge turned
// down or expired goes to the same player again after live.repeatSeconds.
// While a character's match runs, Szczęsny's waits (withoutDuel).

import { cardLevel, casinoDay, classNameOf } from '../engine/index.js';
import { duelCatchUp, duelMove, duelPayout, duelPot, duelStakes, duelTurnBlock, duelView, liveRules, newDuel, surrenderDuel } from '../engine/card-duel.js';
import { assertion, atomically } from './atomic.js';
import { cardCollection, cardsHere, deckOf, heroOf } from './cards.js';
import { characterView, loadPlayer } from './characters.js';
import { content } from './content.js';
import { toHex } from './encoding.js';
import { ApiError, json, readJson } from './http.js';
import { t } from './i18n.js';
import { OWN_CHARACTERS } from './roles.js';
import { requirePlayable } from './sessions.js';
import { requireOpen } from './settlement.js';

const live = () => liveRules(content());
const acceptMs = () => live().acceptSeconds * 1000;
const newSeed = () => toHex(crypto.getRandomValues(new Uint8Array(16)));
// Rows that ended stay two days: the day's matches for gold are counted
// from them, a challenge turned down waits its pause, and a page that comes
// back finds how its match ended. The challenger's older ones go with its
// next challenge.
const KEEP_MS = 2 * 24 * 3600 * 1000;
const LIVE = ['proposed', 'playing'];
const duelChanged = () => new ApiError(409, 'duel_changed', 'Partia zmieniła się w międzyczasie. Spróbuj jeszcze raz.');
// A character's matches for gold begun on a day (the Salon's day, at the
// acceptance), as a subquery: its day, then the character's id twice.
const DAY_COUNT = "(SELECT COUNT(*) FROM card_duels WHERE day = ? AND stake > 0 AND state IN ('playing', 'done') AND (from_id = ? OR to_id = ?))";

// One of the live texts (data/cards.json texts.live) with its {…} filled in.
const say = (key, vars) => String(content().cards.texts.live[key]).replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));

// Whether a character's player plays it now and asked the server lately, as
// for a Wymiana (data/community.json trade.onlineSeconds): `row` with the
// account's seen_at.
const playsNow = (row, now) => row?.role === 'player' && (row.seen_at ?? 0) >= now - content().community.trade.onlineSeconds * 1000;

// Whether another character's card offers „Zagraj w karty” (908.1): live
// matches in this game, and its player in the game now (characters.js).
export const duelOpen = (row, now) => cardsHere() && Boolean(live()) && playsNow(row, now);

// The player and the character it plays, once the Salon is open to it.
async function requireDuelist(context) {
  const session = await requirePlayable(context);
  if (!cardsHere() || !live()) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  const db = context.env.DB;
  const row = await db.prepare("SELECT * FROM characters WHERE user_id = ? AND role = 'player'").bind(session.userId).first();
  if (!row) throw new ApiError(404, 'no_character', 'Nie masz jeszcze postaci.');
  requireOpen(row);
  return { session, row, db };
}

// The statements that save a match as it is now over the row as read (its
// version), and at its end what it pays: the winner the pot, a draw each
// its stake back (duelPayout), each character's version moved with its gold.
function saveStatements(db, row, game, now) {
  const statements = [assertion(db, '(SELECT version FROM card_duels WHERE id = ?) = ?', [row.id, row.version])];
  if (!game.result) {
    statements.push(db.prepare('UPDATE card_duels SET game = ?, updated_at = ?, version = version + 1 WHERE id = ? AND version = ?').bind(JSON.stringify(game), now, row.id, row.version));
    return statements;
  }
  const pay = duelPayout(game.result, row.stake, content());
  const winner = game.result === 'won' ? row.from_id : game.result === 'lost' ? row.to_id : null;
  statements.push(
    db
      .prepare("UPDATE card_duels SET state = 'done', game = ?, winner = ?, updated_at = ?, version = version + 1 WHERE id = ? AND version = ?")
      .bind(JSON.stringify(game), winner, now, row.id, row.version),
  );
  for (const [id, gold] of [[row.from_id, pay.me], [row.to_id, pay.foe]]) {
    if (gold > 0) statements.push(db.prepare('UPDATE characters SET gold = gold + ?, version = version + 1 WHERE id = ?').bind(gold, id));
  }
  return statements;
}

const rowById = (db, id) => db.prepare('SELECT * FROM card_duels WHERE id = ?').bind(id).first();

// The row as it stands now: a challenge past its time expired, a match with
// every move missed made (duelCatchUp) and, at its end, paid. Each change is
// written only over the row as read; when another request changed it first,
// the row is read again and settled anew.
async function settled(db, row, now) {
  let current = row;
  for (let tries = 0; current && tries < 4; tries += 1) {
    if (current.state === 'proposed' && now - current.created_at > acceptMs()) {
      const at = current.created_at + acceptMs();
      await db.prepare("UPDATE card_duels SET state = 'expired', updated_at = ?, version = version + 1 WHERE id = ? AND state = 'proposed'").bind(at, current.id).run();
      current = await rowById(db, current.id);
      continue;
    }
    if (current.state !== 'playing') return current;
    const game = JSON.parse(current.game);
    const next = duelCatchUp(game, now, content());
    if (next === game) return current;
    try {
      await atomically(db, saveStatements(db, current, next, now), duelChanged);
    } catch (error) {
      if (error?.code !== 'duel_changed') throw error;
    }
    current = await rowById(db, current.id);
  }
  return current;
}

// The character's challenge or match going on (settled first), or null:
// `which` 'live' for either, 'playing' for a match only.
async function liveRowOf(db, characterId, now, which = 'live') {
  const { results } = await db
    .prepare("SELECT * FROM card_duels WHERE (from_id = ? OR to_id = ?) AND state IN ('proposed', 'playing') ORDER BY id DESC")
    .bind(characterId, characterId)
    .all();
  let found = null;
  for (const row of results) {
    const fresh = await settled(db, row, now);
    if (!found && fresh && (which === 'playing' ? fresh.state === 'playing' : LIVE.includes(fresh.state))) found = fresh;
  }
  return found;
}

// The character's matches for gold begun today (the Salon's day).
async function stakedToday(db, characterId, now) {
  const row = await db.prepare(`SELECT ${DAY_COUNT} AS count`).bind(casinoDay(now, content()).key, characterId, characterId).first();
  return row?.count ?? 0;
}

// A character's deck as a side of the table: its twelve cards at their
// levels in the collection, or null without a whole deck (cards.js).
async function deckFor(db, characterId) {
  const collection = await cardCollection(db, characterId);
  const deck = await deckOf(db, characterId, collection);
  return deck && deck.map((id) => ({ id, level: cardLevel(collection.get(id), content()) }));
}

// Another character asked for by its id, with its player's seen_at; null
// for one the game has not (played or set aside).
const targetOf = (db, id) =>
  Number.isInteger(id)
    ? db.prepare(`SELECT c.*, u.seen_at FROM characters c JOIN users u ON u.id = c.user_id WHERE c.id = ? AND c.${OWN_CHARACTERS}`).bind(id).first()
    : null;

// A character as a duel's views show it: its name, class (or evolution, in
// its form for a woman or a man), level and look; one gone from the game a
// rival without a name.
function personView(one) {
  if (!one) return { id: null, name: t('Rywal'), classId: 'warrior', className: '', level: 0, appearance: 'male', skin: content().defaultSkin, evolution: null, female: false };
  return {
    id: one.id,
    name: one.name,
    classId: one.class_id,
    className: classNameOf({ classId: one.class_id, evolution: one.evolution, appearance: one.appearance }, content()),
    level: one.level,
    appearance: one.appearance,
    skin: one.skin ?? content().defaultSkin,
    evolution: content().evolutionsById[one.evolution] ? one.evolution : null,
    female: one.appearance === 'female',
  };
}

async function peopleOf(db, row) {
  const { results } = await db.prepare('SELECT id, name, class_id, level, appearance, skin, evolution FROM characters WHERE id IN (?, ?)').bind(row.from_id, row.to_id).all();
  return new Map(results.map((one) => [one.id, one]));
}

// A challenge or match as character `viewer` sees it: who is across the
// table and who it is itself, whether it challenged, the stake and what a
// win gives, until when a challenge waits; for a match its table from the
// viewer's side (duelView) and, once over, what the viewer got.
function viewOf(row, viewer, people) {
  const mine = row.from_id === viewer;
  const seat = mine ? 'me' : 'foe';
  const view = {
    id: row.id,
    state: row.state,
    mine,
    stake: row.stake,
    pot: duelPot(row.stake, content()),
    endsAt: row.created_at + acceptMs(),
    other: personView(people.get(mine ? row.to_id : row.from_id)),
    self: personView(people.get(viewer)),
  };
  if (row.game && (row.state === 'playing' || row.state === 'done')) {
    const game = JSON.parse(row.game);
    view.match = duelView(game, seat, content());
    view.gold = row.state === 'done' ? duelPayout(game.result, row.stake, content())[seat] : 0;
  }
  return view;
}

// What the chat's poll tells the page (chat.js): the character's challenge
// or match going on, settled as it is read, in short; null without one or
// where the game has no live matches.
export async function duelNews(db, characterId, now) {
  if (!cardsHere() || !live()) return null;
  const row = await liveRowOf(db, characterId, now);
  if (!row) return null;
  const view = viewOf(row, characterId, await peopleOf(db, row));
  return {
    id: view.id,
    state: view.state,
    mine: view.mine,
    stake: view.stake,
    pot: view.pot,
    endsAt: view.endsAt,
    other: view.other,
    step: view.match?.step ?? null,
    deadline: view.match?.deadline ?? null,
    round: view.match?.round ?? null,
  };
}

// What every answer of the table carries besides the duel: the words and
// the table's shape (data/cards.json), and the viewer's matches for gold
// today with their limit.
async function tableData(db, characterId, now) {
  const data = content().cards;
  return {
    texts: data.texts.live,
    types: data.types,
    lines: data.lines,
    typeBonus: data.typeBonus,
    turnSeconds: live().turnSeconds,
    acceptSeconds: live().acceptSeconds,
    cut: Math.round(live().systemCut * 100),
    used: await stakedToday(db, characterId, now),
    limit: live().perDay,
  };
}

async function respond(db, row, characterId, now, extra = {}) {
  const duel = row ? viewOf(row, characterId, await peopleOf(db, row)) : null;
  return json({ duel, ...(await tableData(db, characterId, now)), ...extra });
}

// The character as the page shows it, after an action that moved its gold.
async function characterNow(db, session, now) {
  const player = await loadPlayer(db, session.userId);
  return player ? { character: characterView(player, now) } : {};
}

// GET /api/cards/duel (?id=…): the character's challenge or match going on,
// or the one named in whatever state it ended; with the table's words.
export async function readDuel(context) {
  const { row, db } = await requireDuelist(context);
  const now = context.now;
  const asked = Number(new URL(context.request.url).searchParams.get('id'));
  let found;
  if (asked) {
    const named = Number.isInteger(asked) ? await db.prepare('SELECT * FROM card_duels WHERE id = ? AND (from_id = ? OR to_id = ?)').bind(asked, row.id, row.id).first() : null;
    found = named && (await settled(db, named, now));
  } else found = await liveRowOf(db, row.id, now);
  return respond(db, found, row.id, now);
}

// Why a challenge from `row` to `other` cannot go now, or null, with its
// code: the other in the game, both with a whole deck, neither in another
// challenge or match, the pause after a challenge it turned down or let go.
async function challengeBlock(db, row, other, now) {
  if (!playsNow(other, now)) return { status: 409, code: 'offline', message: t('{name} nie jest teraz w grze.', { name: other.name }) };
  const [mine, theirs] = await Promise.all([deckFor(db, row.id), deckFor(db, other.id)]);
  if (!mine) return { status: 409, code: 'no_deck', message: 'Najpierw weź talię od Szczęsnego w Salonie Gier i ułóż ją.' };
  if (!theirs) return { status: 409, code: 'no_deck_other', message: t('{name} nie ma jeszcze ułożonej talii.', { name: other.name }) };
  const [busySelf, busy] = await Promise.all([liveRowOf(db, row.id, now), liveRowOf(db, other.id, now)]);
  if (busySelf) return { status: 409, code: 'busy_self', message: 'Masz już wyzwanie albo partię na żywo.' };
  if (busy) return { status: 409, code: 'busy', message: t('{name} ma już wyzwanie albo gra partię na żywo.', { name: other.name }) };
  const last = await db.prepare('SELECT state, updated_at FROM card_duels WHERE from_id = ? AND to_id = ? ORDER BY id DESC LIMIT 1').bind(row.id, other.id).first();
  const wait = last && ['declined', 'expired'].includes(last.state) ? last.updated_at + live().repeatSeconds * 1000 - now : 0;
  if (wait > 0) return { status: 429, code: 'paused', message: t('Kolejne wyzwanie dla postaci {name} wyślesz za {seconds} s.', { name: other.name, seconds: Math.ceil(wait / 1000) }) };
  return null;
}

// The other character asked for, refused as yourself or one of the same
// account (one account's characters never play each other for gold, as
// they never trade: 177 A).
async function requireOther(db, session, row, id) {
  const other = await targetOf(db, id);
  if (!other) throw new ApiError(404, 'no_character', 'Nie ma takiej postaci.');
  if (other.id === row.id) throw new ApiError(400, 'self', 'Ze sobą nie zagrasz.');
  if (other.user_id === session.userId) throw new ApiError(403, 'own', 'Ze swoją postacią nie zagrasz.');
  return other;
}

// GET /api/cards/duel/offer?id=…: the challenge sheet (908.2): the other
// character, the stakes the two may play for (duelStakes) with what a win
// gives, the viewer's gold and matches for gold today, and why a challenge
// cannot go now, if so.
export async function duelOffer(context) {
  const { session, row, db } = await requireDuelist(context);
  const now = context.now;
  const other = await requireOther(db, session, row, Number(new URL(context.request.url).searchParams.get('id')));
  const stakes = duelStakes([row.level, other.level], content());
  const [block, theirs] = await Promise.all([challengeBlock(db, row, other, now), stakedToday(db, other.id, now)]);
  const data = await tableData(db, row.id, now);
  return json({
    offer: {
      other: { ...personView(other), online: playsNow(other, now) },
      stakes: stakes.map((stake) => ({ stake, pot: duelPot(stake, content()) })),
      max: stakes.at(-1),
      minLevel: live().minLevel,
      // The other has played all its matches for gold today.
      theirsFull: theirs >= live().perDay,
      gold: row.gold,
      block: block?.message ?? null,
    },
    ...data,
  });
}

// POST /api/cards/duel/challenge { id, stake }: a challenge to the character
// `id`, in the game now, for one of the stakes the two may play for (0 for
// none). For gold the challenger needs the stake and a match for gold left
// today, and so does the other. Saved only while neither is in another
// challenge or match.
export async function challengeDuel(context) {
  const { session, row, db } = await requireDuelist(context);
  const body = await readJson(context.request);
  const now = context.now;
  const other = await requireOther(db, session, row, body?.id);
  const stake = body?.stake ?? 0;
  const stakes = duelStakes([row.level, other.level], content());
  if (Number.isInteger(stake) && stake > 0 && stakes.length === 1) {
    throw new ApiError(409, 'stake_level', t('O złoto gracie od {level}. poziomu obu postaci.', { level: live().minLevel }));
  }
  if (!Number.isInteger(stake) || !stakes.includes(stake)) throw new ApiError(400, 'invalid_stake', 'Wybierz stawkę z listy.');
  const block = await challengeBlock(db, row, other, now);
  if (block) throw new ApiError(block.status, block.code, block.message);
  if (stake > 0) {
    if (row.gold < stake) throw new ApiError(409, 'no_gold', 'Brakuje Ci złota na tę stawkę.');
    const [mine, theirs] = await Promise.all([stakedToday(db, row.id, now), stakedToday(db, other.id, now)]);
    if (mine >= live().perDay) throw new ApiError(409, 'stakes_used', t('Na dziś to już wszystkie partie na żywo o złoto ({limit}). Bez stawki gracie bez limitu.', { limit: live().perDay }));
    if (theirs >= live().perDay) throw new ApiError(409, 'stakes_used_other', t('{name} nie zagra już dziś o złoto. Bez stawki możecie grać dalej.', { name: other.name }));
  }
  const busy = () => new ApiError(409, 'busy', t('{name} ma już wyzwanie albo gra partię na żywo.', { name: other.name }));
  const [, , made] = await atomically(
    db,
    [
      assertion(
        db,
        "NOT EXISTS (SELECT 1 FROM card_duels WHERE (from_id IN (?, ?) OR to_id IN (?, ?)) AND (state = 'playing' OR (state = 'proposed' AND created_at >= ?)))",
        [row.id, other.id, row.id, other.id, now - acceptMs()],
      ),
      db.prepare("DELETE FROM card_duels WHERE (from_id = ? OR to_id = ?) AND state NOT IN ('proposed', 'playing') AND updated_at < ?").bind(row.id, row.id, now - KEEP_MS),
      db.prepare("INSERT INTO card_duels (from_id, to_id, stake, state, created_at, updated_at) VALUES (?, ?, ?, 'proposed', ?, ?)").bind(row.id, other.id, stake, now, now),
    ],
    busy,
  );
  return respond(db, await rowById(db, made.meta.last_row_id), row.id, now, { text: say('sent', { name: other.name }) });
}

// POST /api/cards/duel/answer { id, accept }: the one challenged turns the
// challenge down, or accepts it while the challenger is still in the game:
// both decks go to the table (newDuel, the seed the server's), and for a
// stake both pay it now, one of each one's matches for gold today, only
// while both have the gold and the matches left and neither plays another
// match (one batch, over the challenge as read). Answers with the match.
export async function answerDuel(context) {
  const { session, row, db } = await requireDuelist(context);
  const body = await readJson(context.request);
  const now = context.now;
  const named = Number.isInteger(body?.id) ? await db.prepare('SELECT * FROM card_duels WHERE id = ? AND to_id = ?').bind(body.id, row.id).first() : null;
  if (!named) throw new ApiError(404, 'no_duel', 'Nie ma takiego wyzwania.');
  const found = await settled(db, named, now);
  if (!found) throw new ApiError(404, 'no_duel', 'Nie ma takiego wyzwania.');
  if (found.state !== 'proposed') throw new ApiError(409, 'answered', found.state === 'expired' ? 'To wyzwanie już przepadło.' : 'Na to wyzwanie już nie odpowiesz.');
  if (body.accept !== true) {
    await db.prepare("UPDATE card_duels SET state = 'declined', updated_at = ?, version = version + 1 WHERE id = ? AND state = 'proposed'").bind(now, found.id).run();
    return respond(db, await rowById(db, found.id), row.id, now);
  }
  const challenger = await db.prepare('SELECT c.*, u.seen_at FROM characters c JOIN users u ON u.id = c.user_id WHERE c.id = ?').bind(found.from_id).first();
  // The challenge goes when the challenger cannot play it any more.
  const lapse = async (code, message) => {
    await db.prepare("UPDATE card_duels SET state = 'expired', updated_at = ?, version = version + 1 WHERE id = ? AND state = 'proposed'").bind(now, found.id).run();
    throw new ApiError(409, code, message);
  };
  const name = challenger?.name ?? '';
  if (!playsNow(challenger, now)) await lapse('offline', t('{name} nie jest już w grze. Wyzwanie przepada.', { name }));
  const [mine, theirs] = await Promise.all([deckFor(db, row.id), deckFor(db, challenger.id)]);
  if (!mine) throw new ApiError(409, 'no_deck', 'Najpierw ułóż talię z 12 kart w Salonie Gier.');
  if (!theirs) await lapse('no_deck_other', t('{name} nie ma już ułożonej talii. Wyzwanie przepada.', { name }));
  const stake = found.stake;
  if (stake > 0) {
    if (row.gold < stake) throw new ApiError(409, 'no_gold', t('Brakuje Ci złota na stawkę: potrzeba {stake} zł.', { stake }));
    if (challenger.gold < stake) await lapse('no_gold_other', t('{name} nie ma już złota na tę stawkę. Wyzwanie przepada.', { name }));
    const [used, usedOther] = await Promise.all([stakedToday(db, row.id, now), stakedToday(db, challenger.id, now)]);
    if (used >= live().perDay) throw new ApiError(409, 'stakes_used', t('Na dziś to już wszystkie partie na żywo o złoto ({limit}). Bez stawki gracie bez limitu.', { limit: live().perDay }));
    if (usedOther >= live().perDay) await lapse('stakes_used_other', t('{name} nie zagra już dziś o złoto. Wyzwanie przepada.', { name }));
  }
  const [playing, playingOther] = await Promise.all([liveRowOf(db, row.id, now, 'playing'), liveRowOf(db, challenger.id, now, 'playing')]);
  if (playing) throw new ApiError(409, 'busy_self', 'Najpierw dokończ partię na żywo.');
  if (playingOther) await lapse('busy', t('{name} gra już inną partię na żywo. Wyzwanie przepada.', { name }));
  const game = newDuel({ seed: newSeed(), now, me: { cards: theirs, hero: heroOf(challenger) }, foe: { cards: mine, hero: heroOf(row) } }, content());
  const day = casinoDay(now, content()).key;
  const statements = [
    assertion(db, "(SELECT version FROM card_duels WHERE id = ?) = ? AND (SELECT state FROM card_duels WHERE id = ?) = 'proposed'", [found.id, found.version, found.id]),
    assertion(db, "NOT EXISTS (SELECT 1 FROM card_duels WHERE state = 'playing' AND (from_id IN (?, ?) OR to_id IN (?, ?)))", [row.id, challenger.id, row.id, challenger.id]),
  ];
  if (stake > 0) {
    statements.push(
      assertion(db, '(SELECT gold FROM characters WHERE id = ?) >= ? AND (SELECT gold FROM characters WHERE id = ?) >= ?', [row.id, stake, challenger.id, stake]),
      assertion(db, `${DAY_COUNT} < ? AND ${DAY_COUNT} < ?`, [day, row.id, row.id, live().perDay, day, challenger.id, challenger.id, live().perDay]),
      db.prepare('UPDATE characters SET gold = gold - ?, version = version + 1 WHERE id IN (?, ?)').bind(stake, row.id, challenger.id),
    );
  }
  statements.push(
    db.prepare("UPDATE card_duels SET state = 'playing', game = ?, day = ?, updated_at = ?, version = version + 1 WHERE id = ? AND version = ?").bind(JSON.stringify(game), day, now, found.id, found.version),
  );
  await atomically(db, statements, () => new ApiError(409, 'duel_changed', 'Wyzwanie zmieniło się w międzyczasie. Spróbuj jeszcze raz.'));
  return respond(db, await rowById(db, found.id), row.id, now, stake > 0 ? await characterNow(db, session, now) : {});
}

// The character's match going on, named by its id, settled first.
async function ownMatch(db, row, id, now) {
  const named = Number.isInteger(id) ? await db.prepare('SELECT * FROM card_duels WHERE id = ? AND (from_id = ? OR to_id = ?)').bind(id, row.id, row.id).first() : null;
  if (!named) throw new ApiError(404, 'no_duel', 'Nie ma takiej partii.');
  const found = await settled(db, named, now);
  if (found?.state !== 'playing') throw new ApiError(409, 'match_over', 'Ta partia już się skończyła.');
  return found;
}

// A hero's skill as a turn asks for it: only the numbers the engine reads.
function skillAsked(skill) {
  if (!skill || typeof skill !== 'object') return null;
  const picked = {};
  for (const key of ['card', 'target', 'swap']) if (Number.isInteger(skill[key])) picked[key] = skill[key];
  if (typeof skill.type === 'string') picked.type = skill.type.slice(0, 32);
  return picked;
}

// POST /api/cards/duel/turn { id, round, lines, skill }: the character's move
// in its match (duelTurnBlock, duelMove): the leader's cards in the open, or
// the answer that plays the round. Saved only over the match as read (its
// version), so two taps make one move; at the match's end what it pays.
export async function duelTurn(context) {
  const { session, row, db } = await requireDuelist(context);
  const body = await readJson(context.request);
  const now = context.now;
  const found = await ownMatch(db, row, body?.id, now);
  const seat = found.from_id === row.id ? 'me' : 'foe';
  const game = JSON.parse(found.game);
  const turn = { round: body?.round, lines: body?.lines, skill: skillAsked(body?.skill) };
  const block = duelTurnBlock(game, seat, turn, content());
  if (block) throw new ApiError(block.status ?? 400, block.code, block.message);
  const next = duelMove(game, seat, turn, now, content());
  await atomically(db, saveStatements(db, found, next, now), duelChanged);
  return respond(db, await rowById(db, found.id), row.id, now, next.result && found.stake > 0 ? await characterNow(db, session, now) : {});
}

// POST /api/cards/duel/surrender { id }: the character gives up its match,
// lost; the other takes what a win gives.
export async function surrenderDuelMatch(context) {
  const { session, row, db } = await requireDuelist(context);
  const body = await readJson(context.request);
  const now = context.now;
  const found = await ownMatch(db, row, body?.id, now);
  const next = surrenderDuel(JSON.parse(found.game), found.from_id === row.id ? 'me' : 'foe');
  await atomically(db, saveStatements(db, found, next, now), duelChanged);
  return respond(db, await rowById(db, found.id), row.id, now, found.stake > 0 ? await characterNow(db, session, now) : {});
}

// Szczęsny's table waits while the character plays a live match: a match
// with him starts once that one is over (index.js wraps its route).
export const withoutDuel = (handler) => async (context) => {
  if (cardsHere() && live()) {
    const session = await requirePlayable(context);
    const db = context.env.DB;
    const own = await db.prepare("SELECT id FROM characters WHERE user_id = ? AND role = 'player'").bind(session.userId).first();
    if (own && (await liveRowOf(db, own.id, context.now, 'playing'))) throw new ApiError(409, 'duel_running', 'Najpierw dokończ partię na żywo.');
  }
  return handler(context);
};

// The statements for characters removed (`which` after the id, with its
// `binds`; characters.js, accounts.js): a match of theirs going on ends as
// theirs lost, the other taking what a win gives; their challenges lapse;
// and their rows keep them by a negative id, as the database gives a
// removed character's id again: who challenged, who was challenged and who
// won.
export function duelRemoval(db, which, binds) {
  const keep = 1 - (live()?.systemCut ?? 0);
  const theirs = `(from_id ${which} OR to_id ${which})`;
  return [
    db
      .prepare(
        `UPDATE characters SET gold = gold + (
           SELECT COALESCE(SUM(CAST(d.stake * 2 * ? + 0.000001 AS INTEGER)), 0) FROM card_duels d
           WHERE d.state = 'playing' AND ((d.from_id = characters.id AND d.to_id ${which}) OR (d.to_id = characters.id AND d.from_id ${which}))
         ), version = version + 1
         WHERE id IN (SELECT CASE WHEN from_id ${which} THEN to_id ELSE from_id END FROM card_duels WHERE state = 'playing' AND ${theirs})`,
      )
      .bind(keep, ...binds, ...binds, ...binds, ...binds, ...binds),
    db
      .prepare(
        `UPDATE card_duels SET state = 'done', winner = CASE WHEN from_id ${which} THEN to_id ELSE from_id END,
           game = json_set(game, '$.result', CASE WHEN from_id ${which} THEN 'lost' ELSE 'won' END, '$.end', 'gone', '$.step', json('null')),
           version = version + 1
         WHERE state = 'playing' AND ${theirs}`,
      )
      .bind(...binds, ...binds, ...binds, ...binds),
    db.prepare(`UPDATE card_duels SET state = 'expired', version = version + 1 WHERE state = 'proposed' AND ${theirs}`).bind(...binds, ...binds),
    db.prepare(`UPDATE card_duels SET from_id = -from_id WHERE from_id ${which}`).bind(...binds),
    db.prepare(`UPDATE card_duels SET to_id = -to_id WHERE to_id ${which}`).bind(...binds),
    db.prepare(`UPDATE card_duels SET winner = -winner WHERE winner ${which}`).bind(...binds),
  ];
}

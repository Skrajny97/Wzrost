// Talia Systemu, the card game of the Salon Gier (data/cards.json,
// src/engine/cards.js; DECISIONS.md, "Talia Systemu: gra karciana w Salonie
// Gier", 871–877), where CARDS is on (features.js), in the Salon's third tab,
// open with the Salon (876 A: the Osada's level).
//
// A character's collection is its rows of `cards` (the copies won of each
// card), its deck its row of `card_decks`, and its matches its rows of
// `card_matches`: the running one with its whole state, which never leaves
// the server (the seed, both decks, the rival's reserve), so a cheat cannot
// choose what comes. Each turn is one request, checked by the engine
// (turnBlock) and played by it (playTurn), saved only over the match as
// read (its version): two taps play one turn. A staked match takes its
// stake at the start and counts in the day's ten (875 A); its end pays,
// with the character's row as read: twice the stake for a win, the stake
// back for a draw, the tier's reward of the day at its first win of the day
// and the tier's card at its first win ever (873 A). The day's counters, the
// starter deck taken and the tiers beaten are kept in the character's row
// (`card_game`, as JSON). A training match pays nothing and touches nothing
// of the character. The creatures beaten on an exploration may leave cards
// (874 A): hunts.js asks for the collection here and adds them as the
// report is claimed.

import {
  cardLevel,
  cardView,
  casinoDay,
  deckBlock,
  expectedExploration,
  firstWinCard,
  heroSkill,
  hostTier,
  hostTiers,
  isCard,
  matchPayout,
  matchView,
  newMatch,
  playTurn,
  portalArea,
  samePeriod,
  startBlock,
  starterDeck,
  surrenderMatch,
  tierStake,
  turnBlock,
} from '../engine/index.js';
import { assertion, atomically, characterChanged } from './atomic.js';
import { characterView, loadPlayer, requirePlayer } from './characters.js';
import { content } from './content.js';
import { toHex } from './encoding.js';
import { cardsOn } from './features.js';
import { ApiError, json, readJson } from './http.js';
import { requireOpen } from './settlement.js';

const rules = () => content().cards;
const newSeed = () => toHex(crypto.getRandomValues(new Uint8Array(16)));
const matchChanged = () => new ApiError(409, 'match_changed', 'Partia zmieniła się w międzyczasie. Spróbuj jeszcze raz.');
// Finished matches are kept this long, for the weekly ranking of the second
// stage (873 A), with a small summary in place of their state.
const KEEP_FINISHED_MS = 14 * 24 * 3600 * 1000;

// Off, nothing of the cards answers; the Osada's rules for the rest (the
// Salon opens with it).
function requireCards(row) {
  if (!cardsOn() || !rules()) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  requireOpen(row);
}

// The character's game at the table on `day` (the Polish day): the starter
// deck taken, the tiers ever beaten, and the day's staked matches and the
// tiers whose reward of the day it took; a later day's kept as it is, as a
// day never goes back (quests.js, samePeriod).
export function cardGameOf(row, day) {
  let stored;
  try {
    stored = JSON.parse(row.card_game ?? '{}');
  } catch {
    stored = {};
  }
  const today = samePeriod(stored?.day, day);
  return {
    starter: stored?.starter === true,
    beaten: Array.isArray(stored?.beaten) ? stored.beaten.filter((number) => Number.isInteger(number)) : [],
    day: today ? stored.day : day,
    staked: today && Number.isInteger(stored.staked) ? stored.staked : 0,
    rewarded: today && Array.isArray(stored.rewarded) ? stored.rewarded.filter((number) => Number.isInteger(number)) : [],
  };
}

// The character's collection: the copies of each card it has, of the cards
// the game knows (a card of a creature gone from the data is left out).
export async function cardCollection(db, characterId) {
  const { results } = await db.prepare('SELECT monster_id, copies FROM cards WHERE character_id = ?').bind(characterId).all();
  return new Map(results.filter((row) => isCard(row.monster_id, content())).map((row) => [row.monster_id, row.copies]));
}

// The cards at their top level, which no exploration gives again.
export const maxedCards = (collection) => [...collection].filter(([, copies]) => copies >= rules().stats.maxLevel).map(([id]) => id);

// The statements that add a copy of each card of `ids` to the collection.
export const cardUpserts = (db, characterId, ids, now) =>
  ids.map((id) =>
    db
      .prepare('INSERT INTO cards (character_id, monster_id, copies, created_at) VALUES (?, ?, 1, ?) ON CONFLICT (character_id, monster_id) DO UPDATE SET copies = copies + 1')
      .bind(characterId, id, now),
  );

// The cards an exploration left as its report shows them, each at the level
// it has now (`collection`: as it was before them), new or not.
export const droppedCards = (ids, collection) =>
  ids.map((id) => cardView(id, (collection.get(id) ?? 0) + 1, content(), { fresh: !collection.has(id) }));

// The character's deck: its twelve cards, or null when it has none whole
// (a card gone from the collection or from the data).
async function deckOf(db, characterId, collection) {
  const row = await db.prepare('SELECT cards FROM card_decks WHERE character_id = ?').bind(characterId).first();
  if (!row) return null;
  let ids;
  try {
    ids = JSON.parse(row.cards);
  } catch {
    return null;
  }
  return deckBlock(ids, new Set(collection.keys()), content()) ? null : ids;
}

const runningMatch = (db, characterId) => db.prepare('SELECT * FROM card_matches WHERE character_id = ? AND result IS NULL').bind(characterId).first();

// The character's hero (872 A): its class and its evolution's stage (0
// before the first).
const heroOf = (row) => ({ classId: row.class_id, stage: row.evolution ? (content().evolutionsById[row.evolution]?.stage ?? 1) : 0 });

// The gold of `minutes` of exploring at a character level, as the Labirynt's
// rewards count it: a tier's reward of the day.
const explorationGold = (minutes, level) => (minutes > 0 ? Math.max(1, Math.round(expectedExploration(portalArea(level, content()), level, minutes, content()).gold)) : 0);

// The tier's number in a match's opponent ("host:3").
const tierOfMatch = (match) => Number(String(match.opponent).split(':')[1]);

// A finished match's summary, kept in place of its state.
function summaryOf(row) {
  try {
    return JSON.parse(row.state);
  } catch {
    return {};
  }
}

// The Salon's third tab for the page: the words and rules, the collection
// with the deck marked, the hero, Szczęsny's tiers with their stakes and the
// rewards still waiting, the day's staked matches, the running match as the
// page sees it (matchView), and the last match finished.
async function cardsView(db, player, now) {
  const { row } = player;
  const day = casinoDay(now, content());
  const game = cardGameOf(row, day.key);
  const [collection, running, last] = await Promise.all([
    cardCollection(db, row.id),
    runningMatch(db, row.id),
    db.prepare('SELECT * FROM card_matches WHERE character_id = ? AND result IS NOT NULL ORDER BY id DESC LIMIT 1').bind(row.id).first(),
  ]);
  const deck = await deckOf(db, row.id, collection);
  const data = rules();
  const hero = heroOf(row);
  const rarity = (id) => {
    const found = content().raritiesById[id];
    return { id: found.id, name: found.forms?.f ?? found.name, color: found.color };
  };
  return {
    name: data.name,
    texts: { intro: data.texts.intro, starterOffer: data.texts.starterOffer, starterTaken: data.texts.starterTaken, rules: data.texts.rules, win: data.texts.win, loss: data.texts.loss, draw: data.texts.draw },
    types: data.types,
    lines: data.lines,
    typeBonus: data.typeBonus,
    deckSize: data.deckSize,
    hand: data.hand,
    roundCap: data.roundCap,
    maxLevel: data.stats.maxLevel,
    starter: game.starter,
    collection: [...collection].map(([id, copies]) => cardView(id, copies, content(), { copies, inDeck: Boolean(deck?.includes(id)) })),
    deck,
    // The hero's card (872 A): the character's portrait, its class or
    // evolution's name and its skill at the evolution's stage.
    hero: {
      ...hero,
      appearance: row.appearance,
      skin: row.skin ?? content().defaultSkin,
      evolution: content().evolutionsById[row.evolution] ? row.evolution : null,
      title: content().evolutionsById[row.evolution]?.name ?? content().classesById[row.class_id]?.name ?? '',
      skill: heroSkill(hero.classId, hero.stage, content()),
    },
    tiers: hostTiers(content()).map((tier, index) => {
      const number = index + 1;
      const stake = tierStake(tier, row.level, content());
      return {
        number,
        id: tier.id,
        name: tier.name,
        text: tier.text,
        stake,
        win: 2 * stake,
        reward: explorationGold(tier.rewardMinutes, row.level),
        rewarded: game.rewarded.includes(number),
        beaten: game.beaten.includes(number),
        firstWin: rarity(tier.firstWin.rarity),
        levels: [Math.min(...tier.cards.map((card) => card.level)), Math.max(...tier.cards.map((card) => card.level))],
      };
    }),
    staked: { today: game.staked, limit: data.stakes.perDay },
    match: running ? { id: running.id, tier: tierOfMatch(running), mode: running.mode, stake: running.stake, ...matchView(JSON.parse(running.state), content()) } : null,
    last: last ? { id: last.id, tier: tierOfMatch(last), mode: last.mode, stake: last.stake, result: last.result, at: last.finished_at, ...summaryOf(last) } : null,
    endsAt: day.endsAt,
  };
}

// What the tab answers with: itself and the character, as they are now, and
// what the action gave.
async function respond(context, session, extra = {}) {
  const db = context.env.DB;
  const player = await loadPlayer(db, session.userId);
  return json({ ...extra, cards: await cardsView(db, player, context.now), character: characterView(player, context.now) });
}

// GET /api/cards: the tab.
export async function getCards(context) {
  const { session, player } = await requirePlayer(context);
  requireCards(player.row);
  return json({ cards: await cardsView(context.env.DB, player, context.now), character: characterView(player, context.now) });
}

// POST /api/cards/starter: the starter deck Szczęsny gives (874 A), once: a
// copy of each of its cards, and the deck itself unless the character has
// one. Only over the character as read, so two taps give it once.
export async function takeStarter(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireCards(row);
  const day = casinoDay(context.now, content()).key;
  const game = cardGameOf(row, day);
  if (game.starter) throw new ApiError(409, 'starter_taken', 'Talię startową od Szczęsnego już masz.');
  const db = context.env.DB;
  const ids = starterDeck(content());
  await atomically(db, [
    assertion(db, '(SELECT version FROM characters WHERE id = ?) = ?', [row.id, row.version]),
    db.prepare('UPDATE characters SET card_game = ?, version = version + 1 WHERE id = ?').bind(JSON.stringify({ ...game, starter: true }), row.id),
    ...cardUpserts(db, row.id, ids, context.now),
    db.prepare('INSERT INTO card_decks (character_id, cards, updated_at) VALUES (?, ?, ?) ON CONFLICT (character_id) DO NOTHING').bind(row.id, JSON.stringify(ids), context.now),
  ]);
  return respond(context, session, { starter: true });
}

// POST /api/cards/deck { cards: [ids] }: the deck, twelve different cards of
// the collection.
export async function saveDeck(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireCards(row);
  const body = await readJson(context.request);
  const db = context.env.DB;
  const collection = await cardCollection(db, row.id);
  const block = deckBlock(body?.cards, new Set(collection.keys()), content());
  if (block) throw new ApiError(400, block.code, block.message);
  await db
    .prepare('INSERT INTO card_decks (character_id, cards, updated_at) VALUES (?, ?, ?) ON CONFLICT (character_id) DO UPDATE SET cards = excluded.cards, updated_at = excluded.updated_at')
    .bind(row.id, JSON.stringify(body.cards), context.now)
    .run();
  return respond(context, session, { saved: true });
}

// POST /api/cards/match { tier, staked }: a match against Szczęsny's tier,
// for its stake (paid now, one of the day's ten) or for training. One match
// at a time (the table's index); finished ones older than two weeks go.
export async function startMatch(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireCards(row);
  const body = await readJson(context.request);
  const db = context.env.DB;
  const now = context.now;
  const day = casinoDay(now, content()).key;
  const game = cardGameOf(row, day);
  const staked = body?.staked === true;
  const tier = hostTier(body?.tier, content());
  const [collection, running] = await Promise.all([cardCollection(db, row.id), runningMatch(db, row.id)]);
  const deck = await deckOf(db, row.id, collection);
  const stake = staked && tier ? tierStake(tier, row.level, content()) : 0;
  const block = startBlock({ tier, staked, hasDeck: Boolean(deck), running: Boolean(running), stakedToday: game.staked, gold: row.gold, stake }, content());
  if (block) throw new ApiError(block.status ?? 400, block.code, block.message);
  const state = newMatch(
    {
      seed: newSeed(),
      me: { cards: deck.map((id) => ({ id, level: cardLevel(collection.get(id), content()) })), hero: heroOf(row) },
      foe: { cards: tier.cards.map((card) => ({ id: card.monster, level: card.level })), smart: tier.smart },
    },
    content(),
  );
  const statements = [
    db.prepare('DELETE FROM card_matches WHERE character_id = ? AND result IS NOT NULL AND finished_at < ?').bind(row.id, now - KEEP_FINISHED_MS),
    db
      .prepare('INSERT INTO card_matches (character_id, opponent, mode, stake, day, state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(row.id, `host:${body.tier}`, staked ? 'staked' : 'training', stake, day, JSON.stringify(state), now),
  ];
  if (staked) {
    statements.unshift(
      assertion(db, '(SELECT version FROM characters WHERE id = ?) = ? AND (SELECT gold FROM characters WHERE id = ?) >= ?', [row.id, row.version, row.id, stake]),
      db.prepare('UPDATE characters SET gold = gold - ?, card_game = ?, version = version + 1 WHERE id = ?').bind(stake, JSON.stringify({ ...game, staked: game.staked + 1 }), row.id),
    );
  }
  try {
    await atomically(db, statements);
  } catch (error) {
    if (String(error?.message).includes('UNIQUE')) throw new ApiError(409, 'match_running', 'Najpierw dokończ rozpoczętą partię.');
    throw error;
  }
  return respond(context, session, { started: true });
}

// The statements that end a match with its result: its summary in place of
// its state, and for a staked one what it pays (matchPayout) with the
// character's day counters and tiers beaten, only over the character as
// read. Returns them with the summary.
async function endStatements(db, player, match, state, now) {
  const { row } = player;
  const number = tierOfMatch(match);
  const tier = hostTier(number, content());
  const staked = match.mode === 'staked';
  const day = casinoDay(now, content()).key;
  const game = cardGameOf(row, day);
  const collection = staked && state.result === 'won' && !game.beaten.includes(number) ? await cardCollection(db, row.id) : new Map();
  const payout = matchPayout({
    result: state.result,
    staked,
    stake: match.stake,
    dailyGold: tier ? explorationGold(tier.rewardMinutes, row.level) : 0,
    rewardedToday: game.rewarded.includes(number),
    beatenBefore: game.beaten.includes(number),
    firstCard: tier && staked && state.result === 'won' && !game.beaten.includes(number) ? firstWinCard(tier, collection, state.seed, content()) : null,
  });
  const summary = {
    end: state.end,
    rounds: state.round,
    left: { me: state.me.lines.filter((key) => key !== null).length + state.me.hand.length + state.me.deck.length, foe: state.foe.lines.filter((key) => key !== null).length + state.foe.hand.length + state.foe.deck.length },
    gold: payout.gold,
    daily: payout.daily,
    card: payout.card ? cardView(payout.card, (collection.get(payout.card) ?? 0) + 1, content(), { fresh: !collection.has(payout.card) }) : null,
    tierName: tier?.name ?? null,
  };
  const statements = [
    db
      .prepare('UPDATE card_matches SET state = ?, result = ?, finished_at = ?, version = version + 1 WHERE id = ? AND version = ?')
      .bind(JSON.stringify(summary), state.result, now, match.id, match.version),
  ];
  if (staked) {
    const won = state.result === 'won';
    const next = {
      ...game,
      rewarded: won && !game.rewarded.includes(number) ? [...game.rewarded, number] : game.rewarded,
      beaten: won && !game.beaten.includes(number) ? [...game.beaten, number] : game.beaten,
    };
    statements.unshift(assertion(db, '(SELECT version FROM characters WHERE id = ?) = ?', [row.id, row.version]));
    statements.push(db.prepare('UPDATE characters SET gold = gold + ?, card_game = ?, version = version + 1 WHERE id = ?').bind(payout.gold + payout.daily, JSON.stringify(next), row.id));
    if (payout.card) statements.push(...cardUpserts(db, row.id, [payout.card], now));
  }
  return { statements, summary };
}

// POST /api/cards/turn { round, lines, skill }: the player's turn of the
// running match (turnBlock, playTurn), the rival's lines for the next round
// laid by the engine; at the match's end what it pays. Only over the match
// as read (its version), and a staked one's end only over the character as
// read too.
export async function playCardTurn(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireCards(row);
  const body = await readJson(context.request);
  const db = context.env.DB;
  const match = await runningMatch(db, row.id);
  if (!match) throw new ApiError(409, 'no_match', 'Nie masz rozpoczętej partii.');
  const state = JSON.parse(match.state);
  const block = turnBlock(state, body, content());
  if (block) throw new ApiError(block.status ?? 400, block.code, block.message);
  const next = playTurn(state, { round: body.round, lines: body.lines, skill: body.skill ?? null }, content());
  const ended = next.result ? await endStatements(db, player, match, next, context.now) : null;
  const statements = ended
    ? [assertion(db, '(SELECT version FROM card_matches WHERE id = ?) = ?', [match.id, match.version]), ...ended.statements]
    : [
        assertion(db, '(SELECT version FROM card_matches WHERE id = ?) = ?', [match.id, match.version]),
        db.prepare('UPDATE card_matches SET state = ?, version = version + 1 WHERE id = ? AND version = ?').bind(JSON.stringify(next), match.id, match.version),
      ];
  await atomically(db, statements, ended && match.mode === 'staked' ? characterChanged : matchChanged);
  // At the match's end what it paid, and its last board (the running match
  // is the tab's own, cards.match).
  return respond(
    context,
    session,
    ended ? { end: { result: next.result, tier: tierOfMatch(match), mode: match.mode, stake: match.stake, ...ended.summary }, played: matchView(next, content()) } : {},
  );
}

// POST /api/cards/surrender: the running match given up, lost (a staked
// one's stake stays with Szczęsny).
export async function surrenderCards(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireCards(row);
  const db = context.env.DB;
  const match = await runningMatch(db, row.id);
  if (!match) throw new ApiError(409, 'no_match', 'Nie masz rozpoczętej partii.');
  const next = surrenderMatch(JSON.parse(match.state));
  const ended = await endStatements(db, player, match, next, context.now);
  await atomically(db, [assertion(db, '(SELECT version FROM card_matches WHERE id = ?) = ?', [match.id, match.version]), ...ended.statements], matchChanged);
  return respond(context, session, { end: { result: next.result, tier: tierOfMatch(match), mode: match.mode, stake: match.stake, ...ended.summary } });
}

// The rows of the cards of the characters `which` (SQL after
// `character_id`, with `binds`), removed with them (characters.js,
// accounts.js).
export const cardRemoval = (db, which, binds) => ['cards', 'card_decks', 'card_matches'].map((table) => db.prepare(`DELETE FROM ${table} WHERE character_id ${which}`).bind(...binds));

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
// (874 A), and its won fights cards of a lower land (902 B): hunts.js asks
// for the collection here and adds them as the report is claimed; so does
// labyrinth.js for the creatures beaten in the Labirynt (903). A
// profession's work, an attack of the Gildia and a Próba finished may give
// a card of the lands at the character's level or lower (903,
// sourceCards).

import {
  areaLand,
  cardComes,
  cardLevel,
  cardsUpTo,
  cardView,
  casinoDay,
  createRng,
  deckBlock,
  expectedExploration,
  firstWinCard,
  heroSkill,
  hostTier,
  hostTiers,
  isCard,
  lowerLandCards,
  lowerLandNames,
  matchPayout,
  matchView,
  newMatch,
  packCards,
  pickCard,
  playTurn,
  portalArea,
  samePeriod,
  startBlock,
  starterDeck,
  surrenderMatch,
  tierStake,
  turnBlock,
  workCardChance,
} from '../engine/index.js';
import { say } from '../engine/text.js';
import { assertion, atomically, characterChanged } from './atomic.js';
import { characterView, loadPlayer, requirePlayer } from './characters.js';
import { content } from './content.js';
import { toHex } from './encoding.js';
import { cardsOn } from './features.js';
import { ApiError, json, readJson } from './http.js';
import { t } from './i18n.js';
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
// day never goes back (quests.js, samePeriod). Also the Próby Gildii whose
// card it was given (`trials`, their ids; guild-trials.js, trialCards),
// kept through every change of the rest.
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
    trials: Array.isArray(stored?.trials) ? stored.trials.filter((id) => Number.isInteger(id)) : [],
    // The day's pack bought at Szczęsny's (902 C).
    pack: today && stored.pack === true,
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

// The cards of a report as its Dziennik's row keeps them.
export const cardSummary = (cards) => cards.map(({ name, color, level }) => ({ name, color, level }));

// Whether Talia Systemu is in this game: anything of the cards needs it.
export const cardsHere = () => cardsOn() && Boolean(rules());

// The level whose lands the professions' and the Gildia's cards come from
// (903): the higher of the character's level and its class level.
const sourceLevel = (row) => Math.max(row.level, row.class_level ?? 0);

// The cards of the sources of 903 for the character of `row`, one roll for
// each seed of `seeds` with `chance` (cardComes) and, for each that comes,
// a creature of the lands at the character's level or lower (pickCard),
// one it has not got first, none at its top level, none twice; the
// collection is read only when a roll comes. A seed of the source's own
// gives the same draw however often it is tried. Returns { ids, cards, seeds }
// (the ids to add, the cards as a report shows them and the seeds that
// came), or null for none or where the game has no cards.
export async function sourceCards(db, row, seeds, chance) {
  if (!cardsHere()) return null;
  const rolls = seeds.map((seed) => ({ seed, rng: createRng(seed) })).filter((roll) => cardComes(roll.rng, chance));
  if (rolls.length === 0) return null;
  const collection = await cardCollection(db, row.id);
  const pool = cardsUpTo(sourceLevel(row), content());
  const ids = [];
  for (const { rng } of rolls) {
    const id = pickCard(pool, rng, { owned: collection.keys(), maxed: maxedCards(collection), found: ids });
    if (id) ids.push(id);
  }
  return ids.length > 0 ? { ids, cards: droppedCards(ids, collection), seeds: rolls.map((roll) => roll.seed) } : null;
}

// The card a profession's work leaves as its report is claimed (903): by
// the hours it lasted (workCardChance), from the work's own seed, so a
// claim tried again draws the same. The Awatar Systemu's work too, as it
// brings the work's herbs, potions and items whole.
export const workCard = (db, row, activity, minutes) => (cardsHere() ? sourceCards(db, row, [`${activity.seed}:cards`], workCardChance(minutes, content())) : null);

// The card an attack of the Gildia leaves (903, drops.guild): on the Bestia
// and on a guardian of the Wyprawa Gildii, from the attack's own seed. Its
// cards come with their words for the page's toast.
export async function guildCard(db, row, seed) {
  const found = cardsHere() ? await sourceCards(db, row, [`${seed}:cards`], rules().drops.guild) : null;
  return found && { ...found, cards: found.cards.map((card) => ({ ...card, text: say(rules().texts, 'guild', 0, { card: card.name }) })) };
}

// The statements that give the cards `ids` of a source that changes nothing
// else of the character (an attack of the Gildia): a copy of each card, and
// the character's version moved with its collection, as every claim that
// reads the collection holds only while the character is as read
// (hunts.js). In a batch whose head asserts the character as read
// (sameVersion).
export const cardGains = (db, row, ids, now) => [db.prepare('UPDATE characters SET version = version + 1 WHERE id = ?').bind(row.id), ...cardUpserts(db, row.id, ids, now)];

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
// The character's own land (902 C): the land of the place at the higher of
// its level and its class level, as for the cards of the professions (903).
const characterLand = (row) => areaLand(portalArea(Math.max(row.level, row.class_level ?? row.level), content()).id, content());

// The day's pack at Szczęsny's (902 C), for the tab: its price (the gold of
// an hour of exploring at the character's level), whether it is bought, the
// lower lands it draws from and the cards of them the character still
// misses; null in the first land, which has none lower.
function packView(row, game, collection) {
  const land = characterLand(row);
  const pool = lowerLandCards(land, content());
  if (pool.length === 0) return null;
  return {
    price: explorationGold(rules().pack.goldMinutes, row.level),
    count: rules().pack.cards,
    bought: game.pack,
    lands: lowerLandNames(land, content()),
    missing: pool.filter((id) => !collection.has(id)).length,
    // Nothing left to draw: every card of the lower lands at its top level.
    empty: pool.every((id) => (collection.get(id) ?? 0) >= rules().stats.maxLevel),
  };
}

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
    texts: { intro: data.texts.intro, starterOffer: data.texts.starterOffer, starterTaken: data.texts.starterTaken, rules: data.texts.rules, win: data.texts.win, loss: data.texts.loss, draw: data.texts.draw, pack: data.texts.pack },
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
    pack: game.starter ? packView(row, game, collection) : null,
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

// POST /api/cards/pack: the day's pack at Szczęsny's (902 C), once a day:
// three cards of the creatures of the lands lower than the character's own,
// those it has not got first (packCards), for the gold of an hour of
// exploring at its level. Drawn from the day's seed, so asking again draws
// the same; saved only over the character as read and while it has the
// gold. Answers with the cards as they are now in the collection.
export async function buyPack(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireCards(row);
  const db = context.env.DB;
  const now = context.now;
  const day = casinoDay(now, content()).key;
  const game = cardGameOf(row, day);
  if (!game.starter) throw new ApiError(409, 'no_starter', 'Najpierw weź talię od Szczęsnego.');
  if (game.pack) throw new ApiError(409, 'pack_bought', 'Pakiet na dziś już kupiony. Następny jutro.');
  const collection = await cardCollection(db, row.id);
  const land = characterLand(row);
  const cards = packCards({ land, owned: collection.keys(), maxed: maxedCards(collection), seed: `${day}:${row.id}`, count: rules().pack.cards }, content());
  if (cards.length === 0) throw new ApiError(409, 'pack_empty', lowerLandCards(land, content()).length === 0 ? 'W pierwszej krainie nie ma krain niższych, więc nie ma pakietu.' : 'Masz już wszystkie karty z niższych krain na najwyższym poziomie.');
  const price = explorationGold(rules().pack.goldMinutes, row.level);
  if (row.gold < price) throw new ApiError(409, 'no_gold', t('Brakuje złota: potrzeba {price}.', { price }));
  await atomically(
    db,
    [
      assertion(db, '(SELECT version FROM characters WHERE id = ?) = ? AND (SELECT gold FROM characters WHERE id = ?) >= ?', [row.id, row.version, row.id, price]),
      db.prepare('UPDATE characters SET gold = gold - ?, card_game = ?, version = version + 1 WHERE id = ?').bind(price, JSON.stringify({ ...game, pack: true }), row.id),
      ...cardUpserts(db, row.id, cards, now),
    ],
    characterChanged,
  );
  const opened = cards.map((id) => cardView(id, (collection.get(id) ?? 0) + 1, content(), { fresh: !collection.has(id) }));
  return respond(context, session, { pack: opened });
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

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
// read (its version): two taps play one turn; so is the reserve drawn anew,
// once a match before the first turn (redrawCards). A staked match takes its
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
//
// The residents of the Osada play too, each at their own place (904 B;
// card-residents.js in the engine): the same matches against a resident's
// table ("resident:<id>"), staked among the day's ten or for training. A
// staked win gives twice the stake, the first one over a resident a card of
// its deck the character has not got and every later one a chance of one;
// the residents ever beaten for a stake are kept in `card_game` too.

import {
  aboveTiers,
  cardHomes,
  cardLevel,
  cardsLeft,
  cardsUpTo,
  cardView,
  casinoDay,
  createRng,
  deckBlock,
  deckStrength,
  deckTypeCounts,
  dropKind,
  effectDeckBlock,
  effectDrop,
  effectOfRarity,
  effectRules,
  effectView,
  isEffect,
  expectedExploration,
  firstWinCard,
  heroSkill,
  hostTier,
  hostTiers,
  isCard,
  matchPayout,
  matchView,
  newMatch,
  packCards,
  packEffect,
  packOdds,
  pickCard,
  playTurn,
  portalArea,
  redrawBlock,
  redrawReserve,
  residentCardsLeft,
  residentStake,
  residentTable,
  residentTables,
  residentWinCard,
  samePeriod,
  standingOf,
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
import { requireOpen, settlementOf } from './settlement.js';

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
// card it was given (`trials`, their ids; guild-trials.js, trialCards), and
// the residents of the Osada it has beaten for a stake (`residents`, their
// ids, 904 B: their first win's card given), both kept through every
// change of the rest.
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
    // The day's pack bought at Szczęsny's (902 C), and its second one, for
    // pack.second times its price (the author, 16.11.2026: „3 razy drożej
    // niż standardowo opcja drugiego dokupienia pakietu u Szczęsnego”).
    pack: today && stored.pack === true,
    packSecond: today && stored.packSecond === true,
    residents: Array.isArray(stored?.residents) ? stored.residents.filter((id) => typeof id === 'string') : [],
    // The tiers whose first win gave its effect card (977.3 B), also on a
    // tier beaten before the effect cards came.
    effectTiers: Array.isArray(stored?.effectTiers) ? stored.effectTiers.filter((number) => Number.isInteger(number)) : [],
  };
}

// The character's collection: the copies of each card it has, of the cards
// the game knows (a card of a creature gone from the data is left out).
export async function cardCollection(db, characterId) {
  const { results } = await db.prepare('SELECT monster_id, copies FROM cards WHERE character_id = ?').bind(characterId).all();
  return new Map(results.filter((row) => isCard(row.monster_id, content())).map((row) => [row.monster_id, row.copies]));
}

// The character's own cards: those of its collection with a copy it won
// itself, not only copies from others (`traded`: the Wymiana, the
// Targowisko, another character through the Skrzynia Konta; card-goods.js),
// each with all its copies. The Encyklopedia's "Karty", the collection's
// bonus and the achievements count these (the author, 19.11.2026: „karty z
// wymiany/targowiska niech nie uzupełniają encyklopedii jakby coś”).
export async function ownCardCollection(db, characterId) {
  const { results } = await db.prepare('SELECT monster_id, copies FROM cards WHERE character_id = ? AND copies > traded').bind(characterId).all();
  return new Map(results.filter((row) => isCard(row.monster_id, content())).map((row) => [row.monster_id, row.copies]));
}

// The collection as the sources of cards weigh it (1193 B; the author,
// 19.11.2026: a card at its top level held only with copies from others
// „wypada dalej, aż postać znajdzie własną kopię”): the copies of each card,
// but such a card's one below its top level, so no source takes it for done
// (maxedCards, a tier's first win, the pack's and a resident's cards left)
// till a copy of the character's own comes, and the Encyklopedia counts it
// (ownCardCollection). Only to draw by: a card it gives shows at its top
// level all the same (the copies + 1, droppedCards), and the keys are the
// collection's, so a card held only so is no card not got yet.
export async function dropCollection(db, characterId) {
  const below = rules().stats.maxLevel - 1;
  const { results } = await db.prepare('SELECT monster_id, copies, traded FROM cards WHERE character_id = ?').bind(characterId).all();
  return new Map(results.filter((row) => isCard(row.monster_id, content())).map((row) => [row.monster_id, row.copies > row.traded ? row.copies : Math.min(row.copies, below)]));
}

// The cards at their top level, which no source gives again: of a
// dropCollection, so never one held only with copies from others (1193 B).
export const maxedCards = (collection) => [...collection].filter(([, copies]) => copies >= rules().stats.maxLevel).map(([id]) => id);

// The statements that add a copy of each card of `ids` to the collection.
export const cardUpserts = (db, characterId, ids, now) =>
  ids.map((id) =>
    db
      .prepare('INSERT INTO cards (character_id, monster_id, copies, created_at) VALUES (?, ?, 1, ?) ON CONFLICT (character_id, monster_id) DO UPDATE SET copies = copies + 1')
      .bind(characterId, id, now),
  );

// The character's effect cards (976, 977): the copies of each, of those the
// game knows.
export async function effectCollection(db, characterId) {
  const rows = await db.prepare('SELECT effect_id, copies FROM card_effects WHERE character_id = ?').bind(characterId).all();
  return new Map(rows.results.filter((row) => isEffect(row.effect_id, content())).map((row) => [row.effect_id, row.copies]));
}

// The effect cards at their top level already, of an effect collection.
export const maxedEffects = (effects) => [...effects].filter(([, copies]) => copies >= rules().stats.maxLevel).map(([id]) => id);

// A rare effect card (977.3 B, effects.drops) for the character, with the
// chance `chance` from `seed`: its id and its view at the level it has now,
// or null. The effect collection is read only when one comes.
export async function droppedEffect(db, characterId, seed, chance) {
  if (!effectDrop({ maxed: [], seed, chance }, content())) return null;
  const effects = await effectCollection(db, characterId);
  const id = effectDrop({ maxed: maxedEffects(effects), seed, chance }, content());
  return id ? { id, view: effectView(id, (effects.get(id) ?? 0) + 1, content(), { fresh: !effects.has(id) }) } : null;
}

// The line of a report with an effect card found (`view`, effectView).
export const effectFoundLine = (view) => effectRules(content()).texts.found.replace('{card}', view.name);

// The chance of an effect card for `minutes` of an exploration without a
// faint, or for a Labyrinth guardian beaten (effects.drops).
export const effectChance = (where, minutes = 0) => {
  const drops = effectRules(content())?.drops;
  if (!drops) return 0;
  return where === 'guardian' ? drops.guardian : (drops.explorationHour * minutes) / 60;
};

// The statements that give effect cards: one copy more of each.
export const effectUpserts = (db, characterId, ids, now) =>
  ids.map((id) =>
    db
      .prepare('INSERT INTO card_effects (character_id, effect_id, copies, created_at) VALUES (?, ?, 1, ?) ON CONFLICT (character_id, effect_id) DO UPDATE SET copies = copies + 1')
      .bind(characterId, id, now),
  );

// The effect cards of decks as a match plays them, by character (`ids`):
// each deck in play's effect cards the character has, at their levels.
export async function effectDecksOf(db, ids) {
  const found = new Map();
  if (ids.length === 0) return found;
  const marks = ids.map(() => '?').join(', ');
  const [decks, owned] = await db.batch([
    db.prepare(`SELECT character_id, effects FROM card_decks WHERE character_id IN (${marks})`).bind(...ids),
    db.prepare(`SELECT character_id, effect_id, copies FROM card_effects WHERE character_id IN (${marks})`).bind(...ids),
  ]);
  const copies = new Map(owned.results.map((one) => [`${one.character_id}:${one.effect_id}`, one.copies]));
  for (const deck of decks.results) {
    const chosen = (idsOf(deck.effects ?? '[]') ?? []).filter((id) => isEffect(id, content()) && copies.has(`${deck.character_id}:${id}`));
    found.set(
      deck.character_id,
      chosen.slice(0, effectRules(content())?.slots ?? 0).map((id) => ({ id, level: cardLevel(copies.get(`${deck.character_id}:${id}`), content()) })),
    );
  }
  return found;
}

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
// each seed of `seeds` with `chance` (dropKind) and, for each that comes,
// a creature of the lands at the character's level or lower (pickCard),
// one it has not got first, none at its top level, none twice, or, for the
// pack's share of the chance (drops.packShare), a pack of cards; the
// collection is read only when a card comes. A seed of the source's own
// gives the same draw however often it is tried. Returns { ids, packs,
// cards, seeds } (the ids to add, the packs, the cards and the packs as a
// report shows them and the seeds that came), or null for none or where
// the game has no cards.
export async function sourceCards(db, row, seeds, chance) {
  if (!cardsHere()) return null;
  const rolls = seeds
    .map((seed) => {
      const rng = createRng(seed);
      return { seed, rng, kind: dropKind(rng.next(), chance, content()) };
    })
    .filter((roll) => roll.kind !== null);
  if (rolls.length === 0) return null;
  const packs = rolls.filter((roll) => roll.kind === 'pack').length;
  const drawn = rolls.filter((roll) => roll.kind === 'card');
  const collection = drawn.length > 0 ? await dropCollection(db, row.id) : new Map();
  const pool = cardsUpTo(sourceLevel(row), content());
  const ids = [];
  for (const { rng } of drawn) {
    const id = pickCard(pool, rng, { owned: collection.keys(), maxed: maxedCards(collection), found: ids });
    if (id) ids.push(id);
  }
  if (ids.length === 0 && packs === 0) return null;
  return { ids, packs, cards: [...droppedCards(ids, collection), ...packViews(packs)], seeds: rolls.filter((roll) => roll.kind === 'pack' || ids.length > 0).map((roll) => roll.seed) };
}

// Packs of cards found (drops.packShare) as a report shows them, beside its
// cards: one a pack, with the cards it holds.
export const packViews = (count) => Array.from({ length: count }, () => ({ pack: true, name: rules().texts.packName, cards: rules().pack.cards }));

// The statements that keep `count` packs of cards found for the character,
// to be opened in the Salon's tab (openFoundPack).
export const packGains = (db, characterId, count) => (count > 0 ? [db.prepare('UPDATE characters SET card_packs = card_packs + ? WHERE id = ?').bind(count, characterId)] : []);

// The card a profession's work leaves as its report is claimed (903): by
// the hours it lasted (workCardChance), from the work's own seed, so a
// claim tried again draws the same. The Awatar Systemu's work too, as it
// brings the work's herbs, potions and items whole.
export const workCard = (db, row, activity, minutes) => (cardsHere() ? sourceCards(db, row, [`${activity.seed}:cards`], workCardChance(minutes, content())) : null);

// The card an attack of the Gildia leaves (903, drops.guild): on the Bestia
// and on a guardian of the Wyprawa Gildii, from the attack's own seed, or a
// pack of cards. Its cards and packs come with their words for the page's
// toast.
export async function guildCard(db, row, seed) {
  const found = cardsHere() ? await sourceCards(db, row, [`${seed}:cards`], rules().drops.guild) : null;
  return found && { ...found, cards: found.cards.map((card) => ({ ...card, text: card.pack ? say(rules().texts, 'packGuild', 0, {}) : say(rules().texts, 'guild', 0, { card: card.name }) })) };
}

// The statements that give the cards `ids` and the packs `packs` of a source
// that changes nothing else of the character (an attack of the Gildia): a
// copy of each card, the packs kept, and the character's version moved with
// its collection, as every claim that reads the collection holds only while
// the character is as read (hunts.js). In a batch whose head asserts the
// character as read (sameVersion).
export const cardGains = (db, row, ids, now, packs = 0) => [
  db.prepare('UPDATE characters SET version = version + 1 WHERE id = ?').bind(row.id),
  ...cardUpserts(db, row.id, ids, now),
  ...packGains(db, row.id, packs),
];

// The character's deck: its twelve cards, or null when it has none whole
// (a card gone from the collection or from the data).
export async function deckOf(db, characterId, collection) {
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

// The saved decks (938, the author, 14.11.2026: „opcje zapisania kilku
// różnych talii kart do użytku za jednym kliknieciem w wiekszosci
// miejsc”): up to savedDecks of them, each in its numbered slot
// (card_deck_slots). The deck in play (card_decks) is always the deck of the
// slot it names, and it plays everywhere: at Szczęsny's, at the residents'
// tables, in the Arena, where it also defends, and in the live matches, each
// of which takes it as it starts and keeps its own copy to the end.

// A slot as asked for: 1 to savedDecks.
function slotOf(value) {
  if (!Number.isInteger(value) || value < 1 || value > rules().savedDecks) throw new ApiError(400, 'invalid_slot', 'Nie ma takiego miejsca na talię.');
  return value;
}

// The card ids a deck keeps as JSON, or null.
function idsOf(text) {
  try {
    const ids = JSON.parse(text);
    return Array.isArray(ids) ? ids : null;
  } catch {
    return null;
  }
}

// The statement that keeps the deck in play in its own slot as it is, before
// another deck takes its place: a deck laid before the slots, or by a page
// of before them, is not in its slot's row yet.
const keepInPlay = (db, characterId) =>
  db
    .prepare(
      `INSERT INTO card_deck_slots (character_id, slot, cards, effects, updated_at) SELECT character_id, slot, cards, effects, updated_at FROM card_decks WHERE character_id = ?
       ON CONFLICT (character_id, slot) DO UPDATE SET cards = excluded.cards, effects = excluded.effects, updated_at = excluded.updated_at`,
    )
    .bind(characterId);

// The statement that plays the deck `cards` (its JSON) of `slot`, with its
// effect cards (`effects`, their JSON), from now on.
const playDeck = (db, characterId, slot, cards, now, effects = '[]') =>
  db
    .prepare(
      'INSERT INTO card_decks (character_id, cards, slot, effects, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (character_id) DO UPDATE SET cards = excluded.cards, slot = excluded.slot, effects = excluded.effects, updated_at = excluded.updated_at',
    )
    .bind(characterId, cards, slot, effects, now);

// The saved decks for the page: each slot with its name (939; null without
// one), the cards of it the character has (null when it is empty), whether
// they are a whole deck still (deckBlock), and then its strength and its
// types as the Arena counts them (900 A); `active`, the slot in play (null
// before any deck).
export async function deckSlots(db, characterId, collection) {
  const [saved, inPlay] = await db.batch([
    db.prepare('SELECT slot, cards, name, effects FROM card_deck_slots WHERE character_id = ?').bind(characterId),
    db.prepare('SELECT slot, cards, effects FROM card_decks WHERE character_id = ?').bind(characterId),
  ]);
  const bySlot = new Map(saved.results.map((one) => [one.slot, idsOf(one.cards)]));
  const names = new Map(saved.results.map((one) => [one.slot, one.name ?? null]));
  // Each slot's effect cards (976, 977), the ids saved.
  const effectsBySlot = new Map(saved.results.map((one) => [one.slot, (idsOf(one.effects ?? '[]') ?? []).filter((id) => isEffect(id, content()))]));
  const playing = inPlay.results[0] ?? null;
  // The deck in play is its slot's, whatever that slot's row still says.
  if (playing) {
    bySlot.set(playing.slot, idsOf(playing.cards));
    effectsBySlot.set(playing.slot, (idsOf(playing.effects ?? '[]') ?? []).filter((id) => isEffect(id, content())));
  }
  const owned = new Set(collection.keys());
  return {
    max: rules().savedDecks,
    nameLength: rules().deckNameLength,
    active: playing?.slot ?? null,
    slots: Array.from({ length: rules().savedDecks }, (_, index) => {
      const slot = index + 1;
      const ids = bySlot.get(slot);
      const name = names.get(slot) ?? null;
      const effects = effectsBySlot.get(slot) ?? [];
      if (!ids) return { slot, name, cards: null, whole: false, effects };
      const cards = [...new Set(ids.filter((id) => typeof id === 'string' && owned.has(id)))];
      if (deckBlock(ids, owned, content())) return { slot, name, cards, whole: false, effects };
      const leveled = ids.map((id) => ({ id, level: cardLevel(collection.get(id), content()) }));
      return {
        slot,
        name,
        cards,
        effects,
        whole: true,
        strength: deckStrength(leveled, content()),
        types: deckTypeCounts(leveled, content()).map(({ id, name, count }) => ({ id, name, count })),
      };
    }),
  };
}

const runningMatch = (db, characterId) => db.prepare('SELECT * FROM card_matches WHERE character_id = ? AND result IS NULL').bind(characterId).first();

// The character's hero (872 A): its class and its evolution's stage (0
// before the first), as a match plays it (here, card-arena.js, card-duel.js).
export const heroOf = (row) => ({ classId: row.class_id, stage: row.evolution ? (content().evolutionsById[row.evolution]?.stage ?? 1) : 0 });

// The character's hero card for the page (872 A): its portrait, its class or
// evolution's name and its skill at the evolution's stage, in the Salon's
// tab and in the Arena's Karty (card-arena.js) alike.
export function heroView(row) {
  const hero = heroOf(row);
  return {
    ...hero,
    appearance: row.appearance,
    skin: row.skin ?? content().defaultSkin,
    evolution: content().evolutionsById[row.evolution] ? row.evolution : null,
    title: content().evolutionsById[row.evolution]?.name ?? content().classesById[row.class_id]?.name ?? '',
    skill: heroSkill(hero.classId, hero.stage, content()),
  };
}

// The gold of `minutes` of exploring at a character level, as the Labirynt's
// rewards count it: a tier's reward of the day; for a character of class level
// `classLevel`, a part of it from the late class levels on (lateRewards).
const explorationGold = (minutes, level, classLevel) => (minutes > 0 ? Math.max(1, Math.round(expectedExploration(portalArea(level, content()), level, minutes, content(), classLevel).gold)) : 0);

// A match's opponent: Szczęsny's tier ("host:3", its number) or a resident
// of the Osada ("resident:herbalist", its id, 904 B), the other null.
function opponentOf(match) {
  const [kind, id] = String(match.opponent).split(':');
  return kind === 'resident' ? { tier: null, resident: id } : { tier: Number(id), resident: null };
}

// The residents' tables (904 B) for the page: each resident's name, place,
// the forms of the name its words take, its deck's name and style, its place
// among Szczęsny's tiers, the stake at the character's level and what a win
// gives, whether its first staked win is behind the character, how many of
// its cards the character has not got and how many can still come (of the
// dropCollection, 1193 B), its first cards (the rest it shows at the table)
// and its words after a match.
function residentsView(row, game, collection) {
  const data = rules();
  const { places, residents } = content().settlement;
  return residentTables(content()).map((table) => {
    const stake = residentStake(table, row.level, content());
    return {
      id: table.id,
      name: residents.find((resident) => resident.id === table.id)?.name ?? table.id,
      place: places.find((place) => place.resident === table.id)?.id ?? null,
      gender: table.gender,
      with: table.with,
      of: table.of,
      deck: table.name,
      style: table.style,
      icon: table.icon,
      after: table.after,
      top: aboveTiers(table, content()),
      stake,
      win: 2 * stake,
      chance: data.residents.chance,
      beaten: game.residents.includes(table.id),
      ...residentCardsLeft(table, collection, content()),
      size: table.cards.length,
      cards: table.cards.slice(0, data.residents.shown).map((card) => cardView(card.monster, card.level, content())),
      texts: { win: table.win, loss: table.loss, draw: table.draw },
    };
  });
}

// A finished match's summary, kept in place of its state.
function summaryOf(row) {
  try {
    return JSON.parse(row.state);
  } catch {
    return {};
  }
}

// The pack's price at Szczęsny's (902 C; the author, 15.11.2026: "niech
// pakiet będzie drogi, tańszy dzięki relacji ze Szczęsnym"): the gold of
// pack.goldMinutes of exploring at the character's level (`full`), less the
// discount of the standing of its relation with him (pack.relationDiscount,
// one a standing, the last for the higher ones), rounded up.
function packPrice(row, stored = settlementOf(row)) {
  const { pack } = rules();
  const full = explorationGold(pack.goldMinutes, row.level, row.class_level);
  const standing = standingOf(stored.relations[rules().host.resident] ?? 0, content());
  const discount = pack.relationDiscount[Math.min(standing.index, pack.relationDiscount.length - 1)];
  return { full, discount, standing: standing.name, price: Math.max(1, Math.ceil(full * (1 - discount))) };
}

// The day's pack at Szczęsny's (902 C), for the tab: its price with the
// relation's discount, whether it is bought, the day's second pack (its
// price, pack.second times as much, and whether it is bought), the packs
// found to open (drops.packShare), the odds of each rarity (of every card
// and of the last), the cards of the game the character still misses and
// whether any is left to draw (none once all are at their top level; of the
// dropCollection, so a card held only with copies from others is still
// there to draw, 1193 B).
function packView(row, game, collection) {
  const { pack, stats } = rules();
  const ids = [...cardHomes(content()).keys()];
  const rarity = (id) => content().raritiesById[id];
  const price = packPrice(row);
  return {
    ...price,
    most: Math.max(...pack.relationDiscount),
    count: pack.cards,
    bought: game.pack,
    second: { price: price.price * pack.second, times: pack.second, bought: game.packSecond },
    found: row.card_packs ?? 0,
    odds: packOdds(content()).map((odds) => ({ ...odds, name: rarity(odds.rarity).forms?.f ?? rarity(odds.rarity).name, color: rarity(odds.rarity).color })),
    missing: ids.filter((id) => !collection.has(id)).length,
    empty: ids.every((id) => (collection.get(id) ?? 0) >= stats.maxLevel),
    // The chance of an effect card in place of a creature (977.3 B).
    effectChance: effectRules(content())?.packChance ?? 0,
  };
}

// The rarity of the effect card a tier's first staked win still gives
// (977.3 B: once a tier, since the effect cards came), or null.
const effectFirst = (number, game) => (game.effectTiers.includes(number) ? null : (effectRules(content())?.firstWin[number - 1] ?? null));

// The Salon's third tab for the page: the words and rules, the collection
// with the deck marked, the hero, Szczęsny's tiers with their stakes and the
// rewards still waiting, the day's pack (902 C), the residents' tables (904
// B), the day's staked matches, the running match as the page sees it
// (matchView) with its opponent, and the last match finished.
async function cardsView(db, player, now) {
  const { row } = player;
  const day = casinoDay(now, content());
  const game = cardGameOf(row, day.key);
  const [collection, drops, running, last, effects] = await Promise.all([
    cardCollection(db, row.id),
    // What can still come (1193 B): the pack's and the residents' cards left.
    dropCollection(db, row.id),
    runningMatch(db, row.id),
    db.prepare('SELECT * FROM card_matches WHERE character_id = ? AND result IS NOT NULL ORDER BY id DESC LIMIT 1').bind(row.id).first(),
    effectCollection(db, row.id),
  ]);
  // The deck in play: its slot's, when whole (deckSlots).
  const decks = await deckSlots(db, row.id, collection);
  const playing = decks.slots[decks.active - 1];
  const deck = playing?.whole ? playing.cards : null;
  const data = rules();
  const rarity = (id) => {
    const found = content().raritiesById[id];
    return { id: found.id, name: found.forms?.f ?? found.name, color: found.color };
  };
  return {
    name: data.name,
    texts: {
      intro: data.texts.intro,
      starterOffer: data.texts.starterOffer,
      starterTaken: data.texts.starterTaken,
      rules: data.texts.rules,
      win: data.texts.win,
      loss: data.texts.loss,
      draw: data.texts.draw,
      pack: data.texts.pack,
      // "Przelosuj rezerwę" at the table and its line (the author, 19.11.2026).
      redraw: data.texts.redraw,
    },
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
    decks,
    // The effect cards (976, 977): those the character has, with their
    // levels, the deck in play's, the slots and the words.
    effects: {
      slots: effectRules(content())?.slots ?? 0,
      owned: [...effects].map(([id, copies]) => effectView(id, copies, content(), { copies, inDeck: Boolean(playing?.effects?.includes(id)) })),
      deck: (playing?.effects ?? []).filter((id) => effects.has(id)),
      texts: effectRules(content())?.texts ?? {},
    },
    hero: heroView(row),
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
        reward: explorationGold(tier.rewardMinutes, row.level, row.class_level),
        rewarded: game.rewarded.includes(number),
        beaten: game.beaten.includes(number),
        firstWin: rarity(tier.firstWin.rarity),
        // The effect card of its first staked win since the effect cards
        // came (977.3 B), while it waits; and whether its deck plays effect
        // cards (977.4 A).
        effectWin: effectFirst(number, game) ? rarity(effectFirst(number, game)) : null,
        effects: (tier.effects ?? []).length > 0,
        levels: [Math.min(...tier.cards.map((card) => card.level)), Math.max(...tier.cards.map((card) => card.level))],
      };
    }),
    residents: residentsView(row, game, drops),
    staked: { today: game.staked, limit: data.stakes.perDay },
    pack: game.starter ? packView(row, game, drops) : null,
    match: running ? { id: running.id, ...opponentOf(running), mode: running.mode, stake: running.stake, ...matchView(JSON.parse(running.state), content()) } : null,
    last: last ? { id: last.id, ...opponentOf(last), mode: last.mode, stake: last.stake, result: last.result, at: last.finished_at, ...summaryOf(last) } : null,
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
    // The deck in play, the first saved deck (938).
    keepInPlay(db, row.id),
  ]);
  return respond(context, session, { starter: true });
}

// POST /api/cards/deck { cards: [ids], slot, effects }: the deck, twelve
// different cards of the collection, laid in its slot (938; in the slot in
// play when none is named, as a page of before the slots asks) with its
// effect cards (976, 977: `effects`, at most two of the character's; kept
// as they were without them) and played from now on.
export async function saveDeck(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireCards(row);
  const body = await readJson(context.request);
  const db = context.env.DB;
  const [collection, playing, effects] = await Promise.all([cardCollection(db, row.id), db.prepare('SELECT slot FROM card_decks WHERE character_id = ?').bind(row.id).first('slot'), effectCollection(db, row.id)]);
  const slot = body?.slot == null ? (playing ?? 1) : slotOf(body.slot);
  const block = deckBlock(body?.cards, new Set(collection.keys()), content());
  if (block) throw new ApiError(400, block.code, block.message);
  // Its effect cards (976, 977): at most the slots, each the character's;
  // without them in the request, the slot's as they were.
  const effectBlock = effectDeckBlock(body?.effects, effects.keys(), content());
  if (effectBlock) throw new ApiError(400, effectBlock.code, effectBlock.message);
  const kept = body?.effects == null ? await db.prepare('SELECT effects FROM card_deck_slots WHERE character_id = ? AND slot = ?').bind(row.id, slot).first('effects') : null;
  const chosen = JSON.stringify(body?.effects ?? (idsOf(kept ?? '[]') ?? []).filter((id) => effects.has(id)));
  const cards = JSON.stringify(body.cards);
  await db.batch([
    keepInPlay(db, row.id),
    db
      .prepare(
        'INSERT INTO card_deck_slots (character_id, slot, cards, effects, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (character_id, slot) DO UPDATE SET cards = excluded.cards, effects = excluded.effects, updated_at = excluded.updated_at',
      )
      .bind(row.id, slot, cards, chosen, context.now),
    playDeck(db, row.id, slot, cards, context.now, chosen),
  ]);
  return respond(context, session, { saved: true, slot });
}

// POST /api/cards/decks/use { slot }: the saved deck of the slot plays from
// now on (938), a whole one only; one tap wherever the saved decks show
// (the Salon's tab, a resident's table, the Arena's Karty, the live
// matches' sheets). Its answer is the Salon's tab, as it is then.
export async function useDeck(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireCards(row);
  const body = await readJson(context.request);
  const slot = slotOf(body?.slot);
  const db = context.env.DB;
  const [collection, saved, playing] = await Promise.all([
    cardCollection(db, row.id),
    db.prepare('SELECT cards, effects FROM card_deck_slots WHERE character_id = ? AND slot = ?').bind(row.id, slot).first(),
    db.prepare('SELECT slot, cards, effects FROM card_decks WHERE character_id = ?').bind(row.id).first(),
  ]);
  // The deck in play is its slot's (deckSlots).
  const cards = playing?.slot === slot ? playing.cards : saved?.cards;
  const effects = (playing?.slot === slot ? playing.effects : saved?.effects) ?? '[]';
  if (!cards) throw new ApiError(409, 'empty_slot', t('Talia {slot} jest pusta. Ułóż ją w Salonie Gier.', { slot }));
  if (deckBlock(idsOf(cards), new Set(collection.keys()), content())) throw new ApiError(409, 'invalid_deck', t('Talia {slot} nie jest już cała. Ułóż ją od nowa w Salonie Gier.', { slot }));
  await db.batch([keepInPlay(db, row.id), playDeck(db, row.id, slot, cards, context.now, effects)]);
  return respond(context, session, { used: slot });
}

// A deck's name as its player typed it (939): without control and invisible
// characters or extra spaces, cut to the length the data allows; null for
// none, and the deck shows its number again.
function deckName(value) {
  if (value == null) return null;
  if (typeof value !== 'string') throw new ApiError(400, 'invalid_name', 'Nazwa talii to tekst.');
  const clean = value
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return [...clean].slice(0, rules().deckNameLength).join('').trim() || null;
}

// POST /api/cards/decks/name { slot, name }: the saved deck of the slot gets
// its name (939), or loses it for an empty one; a slot without a deck has
// none to name. The deck in play is kept in its slot first (keepInPlay), so
// a deck laid before the slots can be named too.
export async function nameDeck(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireCards(row);
  const body = await readJson(context.request);
  const slot = slotOf(body?.slot);
  const name = deckName(body?.name);
  const db = context.env.DB;
  const [, named] = await db.batch([
    keepInPlay(db, row.id),
    db.prepare('UPDATE card_deck_slots SET name = ? WHERE character_id = ? AND slot = ?').bind(name, row.id, slot),
  ]);
  if (named.meta.changes !== 1) throw new ApiError(409, 'empty_slot', t('Talia {slot} jest pusta. Ułóż ją w Salonie Gier.', { slot }));
  return respond(context, session, { named: slot });
}

// GET /api/cards/decks: the saved decks alone (deckSlots), for the live
// matches' sheets (card-duel.js in the page).
export async function getDecks(context) {
  const { player } = await requirePlayer(context);
  const { row } = player;
  requireCards(row);
  const db = context.env.DB;
  return json({ decks: await deckSlots(db, row.id, await cardCollection(db, row.id)) });
}

// The server's own key for the card draws whose seed would otherwise come
// only from numbers anyone can read in the public code (the day, the
// character's id, a trial's id): Szczęsny's pack and the Próby Gildii's
// cards (the author's 920 B, 13.11.2026). Made by the first draw that needs
// it and kept in the database (server_settings, 'card_seed'); when two calls
// meet, the key saved first stays, as with the push keys (push.js).
async function cardSeedKey(db) {
  const read = () => db.prepare("SELECT value FROM server_settings WHERE key = 'card_seed'").first('value');
  let stored = await read();
  if (stored === null) {
    await db.prepare("INSERT INTO server_settings (key, value) VALUES ('card_seed', ?) ON CONFLICT (key) DO NOTHING").bind(toHex(crypto.getRandomValues(new Uint8Array(32)))).run();
    stored = await read();
  }
  return stored;
}

// The seed of a draw from its public parts and the server's key (HMAC-SHA256,
// in hex): the same parts give the same draw on every try, as before, and
// nobody without the key can work it out from the code.
export async function keyedSeed(db, parts) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(await cardSeedKey(db)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(parts))));
}

// A pack's draw from `seed`, as Szczęsny's (902 C): its cards (packCards),
// an effect card in place of the first creature by its chance (977.3 B),
// the ids to add and the cards as they will be in the collection; null
// once every card is at its top level.
async function packDraw(db, row, seed) {
  const collection = await dropCollection(db, row.id);
  const effects = await effectCollection(db, row.id);
  const effect = packEffect({ maxed: maxedEffects(effects), seed }, content());
  const drawn = packCards({ maxed: maxedCards(collection), seed, count: rules().pack.cards }, content());
  if (drawn.length === 0) return null;
  const cards = effect ? drawn.slice(1) : drawn;
  const opened = [
    ...(effect ? [effectView(effect, (effects.get(effect) ?? 0) + 1, content(), { fresh: !effects.has(effect) })] : []),
    ...cards.map((id) => cardView(id, (collection.get(id) ?? 0) + 1, content(), { fresh: !collection.has(id) })),
  ];
  return { cards, effect, opened };
}

// POST /api/cards/pack: the day's pack at Szczęsny's (902 C), like a
// booster: three cards of all the game's creatures, each of a rarity drawn
// by the pack's weights (packCards), for its price at the relation with
// Szczęsny (packPrice), which the pack raises as a ticket of the Loteria
// does (casino.relationGain). Once bought, a second one the same day for
// pack.second times the price (the author, 16.11.2026: „3 razy drożej niż
// standardowo opcja drugiego dokupienia pakietu u Szczęsnego”), then none
// till the next day. Drawn from the day's seed (the second's own) with the
// server's key (keyedSeed, 920 B), so asking again draws the same; saved
// only over the character as read and while it has the gold. Answers with
// the cards as they are now in the collection.
export async function buyPack(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireCards(row);
  const db = context.env.DB;
  const now = context.now;
  const day = casinoDay(now, content()).key;
  const game = cardGameOf(row, day);
  if (!game.starter) throw new ApiError(409, 'no_starter', 'Najpierw weź talię od Szczęsnego.');
  if (game.pack && game.packSecond) throw new ApiError(409, 'pack_bought', 'Dwa pakiety na dziś już kupione. Następne jutro.');
  const second = game.pack;
  const draw = await packDraw(db, row, await keyedSeed(db, `${day}:${row.id}${second ? ':second' : ''}`));
  if (!draw) throw new ApiError(409, 'pack_empty', 'Masz już wszystkie karty na najwyższym poziomie.');
  const stored = settlementOf(row);
  const price = packPrice(row, stored).price * (second ? rules().pack.second : 1);
  if (row.gold < price) throw new ApiError(409, 'no_gold', t('Brakuje złota: potrzeba {price}.', { price }));
  const resident = rules().host.resident;
  const relations = { ...stored.relations, [resident]: (stored.relations[resident] ?? 0) + content().settlement.casino.relationGain };
  await atomically(
    db,
    [
      assertion(db, '(SELECT version FROM characters WHERE id = ?) = ? AND (SELECT gold FROM characters WHERE id = ?) >= ?', [row.id, row.version, row.id, price]),
      db
        .prepare('UPDATE characters SET gold = gold - ?, card_game = ?, settlement = ?, version = version + 1 WHERE id = ?')
        .bind(price, JSON.stringify(second ? { ...game, packSecond: true } : { ...game, pack: true }), JSON.stringify({ ...stored, relations }), row.id),
      ...cardUpserts(db, row.id, draw.cards, now),
      ...(draw.effect ? effectUpserts(db, row.id, [draw.effect], now) : []),
    ],
    characterChanged,
  );
  return respond(context, session, { pack: draw.opened });
}

// POST /api/cards/pack/open: a pack of cards found on an exploration, in the
// Labirynt, at a profession's work or at the Gildia (drops.packShare; the
// author, 16.11.2026: „opcja dropienia boosterów kart zamiast samych
// kart”), opened in the Salon's tab as Szczęsny's pack is (packDraw), for
// nothing: one pack fewer. Drawn from the character's version with the
// server's key, so asking again over the same character draws the same;
// saved only over the character as read. Answers as buyPack.
export async function openFoundPack(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireCards(row);
  const db = context.env.DB;
  const now = context.now;
  if ((row.card_packs ?? 0) < 1) throw new ApiError(409, 'no_pack', 'Nie masz pakietu do otwarcia.');
  const draw = await packDraw(db, row, await keyedSeed(db, `${row.id}:found-pack:${row.version}`));
  if (!draw) throw new ApiError(409, 'pack_empty', 'Masz już wszystkie karty na najwyższym poziomie.');
  await atomically(
    db,
    [
      assertion(db, '(SELECT version FROM characters WHERE id = ?) = ? AND (SELECT card_packs FROM characters WHERE id = ?) >= 1', [row.id, row.version, row.id]),
      db.prepare('UPDATE characters SET card_packs = card_packs - 1, version = version + 1 WHERE id = ?').bind(row.id),
      ...cardUpserts(db, row.id, draw.cards, now),
      ...(draw.effect ? effectUpserts(db, row.id, [draw.effect], now) : []),
    ],
    characterChanged,
  );
  return respond(context, session, { pack: draw.opened });
}

// POST /api/cards/match { tier, staked } or { resident, staked }: a match
// against Szczęsny's tier or a resident's table (904 B), for its stake (paid
// now, one of the day's ten, the same ten at every table) or for training.
// One match at a time (the table's index); finished ones older than two
// weeks go.
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
  const asksResident = body?.resident !== undefined && body?.resident !== null;
  const table = asksResident ? residentTable(body.resident, content()) : null;
  if (asksResident && !table) throw new ApiError(400, 'invalid_resident', 'Ten mieszkaniec nie gra w karty.');
  const tier = table ? null : hostTier(body?.tier, content());
  const rival = table ?? tier;
  const [collection, running, effectDecks] = await Promise.all([cardCollection(db, row.id), runningMatch(db, row.id), effectDecksOf(db, [row.id])]);
  const deck = await deckOf(db, row.id, collection);
  const stake = staked && rival ? (table ? residentStake(table, row.level, content()) : tierStake(tier, row.level, content())) : 0;
  const block = startBlock({ tier: rival, staked, hasDeck: Boolean(deck), running: Boolean(running), stakedToday: game.staked, gold: row.gold, stake }, content());
  if (block) throw new ApiError(block.status ?? 400, block.code, block.message);
  const state = newMatch(
    {
      seed: newSeed(),
      me: { cards: deck.map((id) => ({ id, level: cardLevel(collection.get(id), content()) })), hero: heroOf(row), effects: effectDecks.get(row.id) ?? [] },
      // Szczęsny's higher tiers and the residents play effect cards too (977.4 A).
      foe: { cards: rival.cards.map((card) => ({ id: card.monster, level: card.level })), smart: rival.smart, effects: rival.effects ?? [] },
    },
    content(),
  );
  const statements = [
    db.prepare('DELETE FROM card_matches WHERE character_id = ? AND result IS NOT NULL AND finished_at < ?').bind(row.id, now - KEEP_FINISHED_MS),
    db
      .prepare('INSERT INTO card_matches (character_id, opponent, mode, stake, day, state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(row.id, table ? `resident:${table.id}` : `host:${body.tier}`, staked ? 'staked' : 'training', stake, day, JSON.stringify(state), now),
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
// character's day counters, tiers beaten and residents beaten, only over
// the character as read. A resident's table (904 B) has no reward of the
// day: its staked win gives a card of its deck, at the first win over it
// always (`first`) and later with its chance (residentWinCard). Returns
// the statements with the summary.
async function endStatements(db, player, match, state, now) {
  const { row } = player;
  const { tier: number, resident } = opponentOf(match);
  const table = resident ? residentTable(resident, content()) : null;
  const tier = table || resident ? null : hostTier(number, content());
  const staked = match.mode === 'staked';
  const won = staked && state.result === 'won';
  const day = casinoDay(now, content()).key;
  const game = cardGameOf(row, day);
  const firstTier = Boolean(tier) && won && !game.beaten.includes(number);
  const firstResident = Boolean(table) && won && !game.residents.includes(table.id);
  const collection = firstTier || (table && won) ? await dropCollection(db, row.id) : new Map();
  // The tier's effect card at its first staked win since the effect cards
  // came (977.3 B), of the rarity effects.firstWin gives the tier.
  const effectTier = Boolean(tier) && won && !game.effectTiers.includes(number);
  const effects = effectTier ? await effectCollection(db, row.id) : new Map();
  const effectRarity = effectTier ? effectFirst(number, game) : null;
  const effectCard = effectRarity ? effectOfRarity(effectRarity, { owned: effects.keys(), maxed: maxedEffects(effects) }, state.seed, content()) : null;
  // The tier's card at its first win; when every card of its rarity is at
  // its top level already, it would be lost, so the tier's stake comes once
  // more instead (the author's 919 B, 13.11.2026: nothing else in the game
  // prices a card of a rarity, and the stake is the tier's own number). A
  // card held only with copies from others is not done yet (1193 B,
  // dropCollection): it comes before those done.
  const drawn = firstTier ? firstWinCard(tier, collection, state.seed, content()) : null;
  const spent = drawn !== null && (collection.get(drawn) ?? 0) >= rules().stats.maxLevel;
  const cardGold = spent ? match.stake : 0;
  const payout = matchPayout({
    result: state.result,
    staked,
    stake: match.stake,
    dailyGold: tier ? explorationGold(tier.rewardMinutes, row.level, row.class_level) : 0,
    rewardedToday: tier ? game.rewarded.includes(number) : true,
    beatenBefore: tier ? game.beaten.includes(number) : true,
    firstCard: spent ? null : drawn,
  });
  const card =
    table && won ? residentWinCard({ table, first: firstResident, seed: state.seed, owned: collection.keys(), maxed: maxedCards(collection) }, content()) : payout.card;
  const summary = {
    end: state.end,
    rounds: state.round,
    left: { me: cardsLeft(state.me), foe: cardsLeft(state.foe) },
    gold: payout.gold,
    daily: payout.daily,
    card: card ? cardView(card, (collection.get(card) ?? 0) + 1, content(), { fresh: !collection.has(card) }) : null,
    ...(effectCard && { effectCard: effectView(effectCard, (effects.get(effectCard) ?? 0) + 1, content(), { fresh: !effects.has(effectCard) }) }),
    // The gold in place of a first win's card already at its top level (919 B).
    ...(cardGold > 0 && { cardGold, maxLevel: rules().stats.maxLevel }),
    tierName: tier?.name ?? null,
    // At a resident's table: its deck's name, and whether the card is the
    // first win's (else its chance's).
    ...(table && { deck: table.name, first: firstResident }),
  };
  const statements = [
    db
      .prepare('UPDATE card_matches SET state = ?, result = ?, finished_at = ?, version = version + 1 WHERE id = ? AND version = ?')
      .bind(JSON.stringify(summary), state.result, now, match.id, match.version),
  ];
  if (staked) {
    const next = {
      ...game,
      rewarded: tier && won && !game.rewarded.includes(number) ? [...game.rewarded, number] : game.rewarded,
      beaten: tier && won && !game.beaten.includes(number) ? [...game.beaten, number] : game.beaten,
      residents: firstResident ? [...game.residents, table.id] : game.residents,
      effectTiers: effectTier ? [...game.effectTiers, number] : game.effectTiers,
    };
    statements.unshift(assertion(db, '(SELECT version FROM characters WHERE id = ?) = ?', [row.id, row.version]));
    statements.push(db.prepare('UPDATE characters SET gold = gold + ?, card_game = ?, version = version + 1 WHERE id = ?').bind(payout.gold + payout.daily + cardGold, JSON.stringify(next), row.id));
    if (card) statements.push(...cardUpserts(db, row.id, [card], now));
    if (effectCard) statements.push(...effectUpserts(db, row.id, [effectCard], now));
  }
  return { statements, summary };
}

// POST /api/cards/turn { round, lines, skill, effect }: the player's turn of the
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
  const next = playTurn(state, { round: body.round, lines: body.lines, skill: body.skill ?? null, effect: body.effect ?? null }, content());
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
    ended ? { end: { result: next.result, ...opponentOf(match), mode: match.mode, stake: match.stake, ...ended.summary }, played: matchView(next, content()) } : {},
  );
}

// POST /api/cards/redraw: the player's reserve of the running match drawn
// anew, Szczęsny's or a resident's (redrawBlock, redrawReserve; the author,
// 19.11.2026: „opcję przelosowania ręki, bo nie raz trafią się 4 jednostki
// tej samej kategorii”): once a match, before its first turn. Only over the
// match as read (its version), so two taps draw it anew once.
export async function redrawCards(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireCards(row);
  const db = context.env.DB;
  const match = await runningMatch(db, row.id);
  if (!match) throw new ApiError(409, 'no_match', 'Nie masz rozpoczętej partii.');
  const state = JSON.parse(match.state);
  const block = redrawBlock(state, content());
  if (block) throw new ApiError(block.status ?? 400, block.code, block.message);
  await atomically(
    db,
    [
      assertion(db, '(SELECT version FROM card_matches WHERE id = ?) = ?', [match.id, match.version]),
      db.prepare('UPDATE card_matches SET state = ?, version = version + 1 WHERE id = ? AND version = ?').bind(JSON.stringify(redrawReserve(state, content())), match.id, match.version),
    ],
    matchChanged,
  );
  return respond(context, session, { redrawn: true });
}

// POST /api/cards/surrender: the running match given up, lost (a staked
// one's stake stays with Szczęsny, or with the resident at its table).
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
  return respond(context, session, { end: { result: next.result, ...opponentOf(match), mode: match.mode, stake: match.stake, ...ended.summary } });
}

// The rows of the cards of the characters `which` (SQL after
// `character_id`, with `binds`), removed with them (characters.js,
// accounts.js).
export const cardRemoval = (db, which, binds) =>
  ['cards', 'card_effects', 'card_decks', 'card_deck_slots', 'card_matches'].map((table) => db.prepare(`DELETE FROM ${table} WHERE character_id ${which}`).bind(...binds));

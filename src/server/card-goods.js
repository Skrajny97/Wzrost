// Talia Systemu's cards as goods (DECISIONS.md, "Karty Talii: Skrzynia Konta,
// Targowisko i Wymiana (makiety, 19.11.2026)"; a player, poz. 33, in the
// game's chat: „możliwość wymiany kartami talii między postaciami. Wypadła
// mi fajna ale nie na głównej tylko pobocznym alcie i trochę smutek.”; the
// author, 19.11.2026: „mądre pomysły”, „przenoszenie kart Talii to powinno
// być w Skrzyni Konta, powinno się móc nimi też handlować i wymieniać miedzy
// graczami, co jest dużym przedsiewzieciem i narażonym na błędy, wiec
// dokładnie to zrób” and „karty z wymiany/targowiska niech nie uzupełniają
// encyklopedii jakby coś”): what the Skrzynia Konta (chest-cards.js), the
// Targowisko (market.js) and the Wymiana (trades.js) share about them.
//
// A creature's card (`card`) is its row of `cards`, an effect card
// (`effect-card`) its row of `card_effects`, each with the copies the
// character holds; the copies are the card's level (cardLevel, up to the
// top level; copies past it stay with the character, to be moved on). Of a
// creature card's copies, `traded` came from others (the Wymiana, the
// Targowisko, another character through the Skrzynia Konta): the
// Encyklopedia's "Karty", the collection's bonus and the achievements count
// a card only with a copy of the character's own (ownCardCollection in
// cards.js). Copies that leave go those from others first (cardAfter in
// the engine), so a character keeps a card it found in its Encyklopedia as
// long as it holds a copy of its own.
//
// Two rules hold wherever copies leave a character:
// - none of a card that a match running now plays on the character's own
//   side (at Szczęsny's or a resident's table, in the Arena's Karty or live):
//   the match plays with the copies it started with (busySql);
// - the decks stay as they were laid: a card whose copies all left is missing
//   from them, so they are incomplete ("niepełna", deckSlots in cards.js)
//   until it comes back or the deck is laid anew.
// Each move writes the copies a character holds after it (setCopies) in one
// batch whose head asserts its row exactly as read (heldCondition): two taps
// or two buyers never move a copy twice.

import { CARD_GOODS, cardAfter, cardHomes, cardStats, cardView, effectRules, effectView, isCard, isEffect } from '../engine/index.js';
import { cardsHere, deckSlots } from './cards.js';
import { content } from './content.js';

const rules = () => content().cards;
const topLevel = () => rules().stats.maxLevel;

// The words of the cards as goods (data/cards.json, texts.goods), in the
// request's language, and one with its {name} filled in.
export const goodsWords = () => rules().texts.goods;
export const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole));

// Where each kind of card is kept: its table, the column of its id, its
// place on a match's side (newMatch in the engine: `cards`, `effects`),
// whether the game knows the id, and whether its row keeps the copies from
// others (`traded`).
export const CARD_KINDS = {
  card: { table: 'cards', column: 'monster_id', side: 'cards', known: isCard, traded: true },
  'effect-card': { table: 'card_effects', column: 'effect_id', side: 'effects', known: isEffect, traded: false },
};

export const isCardGood = (kind) => CARD_GOODS.includes(kind);

// A card the game knows, where it has the cards.
export const knownCard = (kind, id) => isCardGood(kind) && typeof id === 'string' && cardsHere() && CARD_KINDS[kind].known(id, content());

// A card's face as the page draws it (cardFace in src/client/cards.js) at
// `level`, with what changes on it at each level from the first to the top
// (`levels`): a creature's Atak and Życie, an effect card's strength and
// words, so the page shows it at the level a move would give.
export function faceOf(kind, id, level) {
  const levels = Array.from({ length: topLevel() }, (_, index) => index + 1);
  if (kind === 'card') return { ...cardView(id, level, content()), levels: levels.map((one) => cardStats(id, one, content())) };
  return {
    ...effectView(id, level, content()),
    levels: levels.map((one) => {
      const { power, short, text } = effectView(id, one, content());
      return { power, short, text };
    }),
  };
}

// A card's name alone, and as goods name it ("Karta: Licho", "Karta efektu:
// Mgła").
export function cardNames(kind, id) {
  const name = kind === 'card' ? content().monstersById[id].name : effectView(id, 1, content()).name;
  return { cardName: name, name: filled(kind === 'card' ? goodsWords().card : goodsWords().effect, { name }) };
}

// The place of each card among its kind, as lists of goods order them: the
// creatures' in the order of their lands and places (the Encyklopedia's),
// the effect cards' in the data's.
const orders = new WeakMap();
export function cardOrder(kind) {
  const game = content();
  if (!orders.has(game)) {
    orders.set(game, {
      card: new Map([...cardHomes(game).keys()].map((id, index) => [id, index])),
      'effect-card': new Map((effectRules(game)?.cards ?? []).map((one, index) => [one.id, index])),
    });
  }
  return orders.get(game)[kind];
}

// The ids of the cards (`side`: 'cards' or 'effects') a match running now
// plays on the character's own side: at Szczęsny's or a resident's table
// (card_matches), in the Arena's Karty (card_arena_matches) and live
// (card_duels: `me` the side of the one who challenged, `foe` of the one
// challenged); a SELECT of `id`, bound with busyBinds.
export const busySql = (side) =>
  `SELECT json_extract(c.value, '$.id') AS id FROM card_matches m, json_each(m.state, '$.me.${side}') c WHERE m.character_id = ? AND m.result IS NULL
   UNION ALL SELECT json_extract(c.value, '$.id') FROM card_arena_matches a, json_each(a.state, '$.me.${side}') c WHERE a.character_id = ?
   UNION ALL SELECT json_extract(c.value, '$.id') FROM card_duels d, json_each(d.game, CASE WHEN d.from_id = ? THEN '$.me.${side}' ELSE '$.foe.${side}' END) c
     WHERE d.state = 'playing' AND (d.from_id = ? OR d.to_id = ?)`;
export const busyBinds = (characterId) => [characterId, characterId, characterId, characterId, characterId];

// The cards of the character's running matches, by kind ('card',
// 'effect-card'): none of their copies leaves it now.
export async function busyCards(db, characterId) {
  const [cards, effects] = await db.batch([db.prepare(busySql('cards')).bind(...busyBinds(characterId)), db.prepare(busySql('effects')).bind(...busyBinds(characterId))]);
  return { card: new Set(cards.results.map((one) => one.id)), 'effect-card': new Set(effects.results.map((one) => one.id)) };
}

// Whether a match running now plays the card on the character's side.
export async function cardBusy(db, kind, characterId, id) {
  const found = await db.prepare(`SELECT 1 AS busy FROM (${busySql(CARD_KINDS[kind].side)}) WHERE id = ? LIMIT 1`).bind(...busyBinds(characterId), id).first();
  return Boolean(found);
}

// The copies of the cards `ids` of a kind the character holds, by id: {
// copies, traded } (none: 0 of both).
export async function heldCards(db, characterId, kind, ids) {
  const spec = CARD_KINDS[kind];
  const found = new Map(ids.map((id) => [id, { copies: 0, traded: 0 }]));
  if (ids.length === 0) return found;
  const { results } = await db
    .prepare(`SELECT ${spec.column} AS id, copies, ${spec.traded ? 'traded' : '0'} AS traded FROM ${spec.table} WHERE character_id = ? AND ${spec.column} IN (SELECT value FROM json_each(?))`)
    .bind(characterId, JSON.stringify(ids))
    .all();
  for (const row of results) found.set(row.id, { copies: row.copies, traded: row.traded });
  return found;
}

// The SQL condition, with its binds, that the character's row of a card is
// exactly as read (`held`): its copies and those from others, or no row for
// none.
export function heldCondition(kind, characterId, id, held) {
  const spec = CARD_KINDS[kind];
  const of = (column) => `COALESCE((SELECT ${column} FROM ${spec.table} WHERE character_id = ? AND ${spec.column} = ?), 0) = ?`;
  return spec.traded
    ? { sql: `${of('copies')} AND ${of('traded')}`, binds: [characterId, id, held.copies, characterId, id, held.traded] }
    : { sql: of('copies'), binds: [characterId, id, held.copies] };
}

// The SQL condition, with its binds, that no match running now plays the
// card on the character's side.
export const freeCondition = (kind, characterId, id) => ({
  sql: `NOT EXISTS (SELECT 1 FROM (${busySql(CARD_KINDS[kind].side)}) WHERE id = ?)`,
  binds: [...busyBinds(characterId), id],
});

// The statement that leaves the character holding `after` ({ copies, traded },
// cardAfter) of a card: its row gone at 0 copies. Only in a batch whose head
// holds its row as read (heldCondition).
export function setCopies(db, kind, characterId, id, after, now) {
  const spec = CARD_KINDS[kind];
  if (after.copies <= 0) return db.prepare(`DELETE FROM ${spec.table} WHERE character_id = ? AND ${spec.column} = ?`).bind(characterId, id);
  return spec.traded
    ? db
        .prepare(
          `INSERT INTO cards (character_id, monster_id, copies, traded, created_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (character_id, monster_id) DO UPDATE SET copies = excluded.copies, traded = excluded.traded`,
        )
        .bind(characterId, id, after.copies, after.traded, now)
    : db
        .prepare('INSERT INTO card_effects (character_id, effect_id, copies, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (character_id, effect_id) DO UPDATE SET copies = excluded.copies')
        .bind(characterId, id, after.copies, now);
}

// The statement that adds `count` copies of a card to the character's,
// `foreign` of them from others: as the Targowisko's parcels and the
// Skrzynia Konta bring them, whatever it holds.
export function addCopies(db, kind, characterId, id, count, foreign, now) {
  return CARD_KINDS[kind].traded
    ? db
        .prepare(
          `INSERT INTO cards (character_id, monster_id, copies, traded, created_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (character_id, monster_id) DO UPDATE SET copies = copies + excluded.copies, traded = traded + excluded.traded`,
        )
        .bind(characterId, id, count, Math.min(foreign, count), now)
    : db
        .prepare('INSERT INTO card_effects (character_id, effect_id, copies, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (character_id, effect_id) DO UPDATE SET copies = copies + excluded.copies')
        .bind(characterId, id, count, now);
}

// The SQL condition, with its binds, that the character's rows of the cards
// `held` ({ id: { copies, traded } }) are each exactly as read, however many
// (one JSON object bound, as D1 takes at most 100 values a statement).
export function heldManyCondition(kind, characterId, held) {
  const spec = CARD_KINDS[kind];
  const json = JSON.stringify(Object.fromEntries(Object.entries(held).map(([id, one]) => [id, [one.copies, one.traded]])));
  const differs = (column, index) => `COALESCE((SELECT ${column} FROM ${spec.table} WHERE character_id = ? AND ${spec.column} = s.key), 0) != json_extract(s.value, '$[${index}]')`;
  return {
    sql: `NOT EXISTS (SELECT 1 FROM json_each(?) AS s WHERE ${differs('copies', 0)}${spec.traded ? ` OR ${differs('traded', 1)}` : ''})`,
    binds: spec.traded ? [json, characterId, characterId] : [json, characterId],
  };
}

// The SQL condition, with its binds, that no match running now plays any of
// the cards `ids` on the character's side.
export const freeManyCondition = (kind, characterId, ids) => ({
  sql: `NOT EXISTS (SELECT 1 FROM json_each(?) AS s WHERE s.value IN (${busySql(CARD_KINDS[kind].side)}))`,
  binds: [JSON.stringify(ids), ...busyBinds(characterId)],
});

// The statements that leave the character holding `finals` of cards of a
// kind ({ id: { copies, traded } }, cardAfter), its rows of those at 0 gone,
// however many (one JSON object bound in each). Only in a batch whose head
// holds its rows as read (heldManyCondition).
export function setManyCopies(db, kind, characterId, finals, now) {
  const spec = CARD_KINDS[kind];
  const entries = Object.entries(finals);
  const gone = entries.filter(([, after]) => after.copies <= 0).map(([id]) => id);
  const kept = JSON.stringify(Object.fromEntries(entries.filter(([, after]) => after.copies > 0).map(([id, after]) => [id, [after.copies, after.traded]])));
  const statements = [];
  if (gone.length > 0) statements.push(db.prepare(`DELETE FROM ${spec.table} WHERE character_id = ? AND ${spec.column} IN (SELECT value FROM json_each(?))`).bind(characterId, JSON.stringify(gone)));
  if (kept !== '{}') {
    statements.push(
      spec.traded
        ? db
            .prepare(
              `INSERT INTO cards (character_id, monster_id, copies, traded, created_at) SELECT ?, key, json_extract(value, '$[0]'), json_extract(value, '$[1]'), ? FROM json_each(?) WHERE true
               ON CONFLICT (character_id, monster_id) DO UPDATE SET copies = excluded.copies, traded = excluded.traded`,
            )
            .bind(characterId, now, kept)
        : db
            .prepare(
              `INSERT INTO card_effects (character_id, effect_id, copies, created_at) SELECT ?, key, json_extract(value, '$[0]'), ? FROM json_each(?) WHERE true
               ON CONFLICT (character_id, effect_id) DO UPDATE SET copies = excluded.copies`,
            )
            .bind(characterId, now, kept),
    );
  }
  return statements;
}

// Copies of a card leaving the character (`count` of `held`), those from
// others first: what it holds after, and how many of those leaving came
// from others (for a card coming back so, as the Targowisko's goods do).
export function leaving(held, count) {
  const after = cardAfter(held, count);
  return { after, foreign: held.traded - after.traded };
}

// The saved decks (938, 939) each of the character's cards is in: a
// function of the kind and id of a card giving their numbers and names, for
// the warning that a card whose copies all leave leaves them incomplete.
export async function cardDecks(db, characterId, collection) {
  const decks = await deckSlots(db, characterId, collection);
  return (kind, id) => decks.slots.filter((slot) => (kind === 'card' ? (slot.cards ?? []) : slot.effects).includes(id)).map((slot) => ({ slot: slot.slot, name: slot.name }));
}

// The character's cards for the lists of goods to give (the Skrzynia
// Konta's "Włóż kartę", the Targowisko's "Wystaw", the Wymiana's offer):
// each card of its collection and each effect card with its copies, its
// face at its level, its names and whether a match running now plays it
// (`busy`: its copies stay with the character till then), the best first;
// `with` adds what the caller needs of each (the decks it is in, in the
// Skrzynia Konta).
export async function ownedCards(db, characterId, { collection, effects, with: more = () => ({}) }) {
  const busy = await busyCards(db, characterId);
  const rank = (rarity) => content().rarities.findIndex((one) => one.id === rarity);
  const entry = (kind, id, copies) => ({ kind, id, copies, ...cardNames(kind, id), face: faceOf(kind, id, copies), busy: busy[kind].has(id), ...more(kind, id) });
  const best = (a, b) => rank(b.face.rarity) - rank(a.face.rarity) || b.copies - a.copies || a.cardName.localeCompare(b.cardName, 'pl');
  return [...[...collection].map(([id, copies]) => entry('card', id, copies)).sort(best), ...[...effects].map(([id, copies]) => entry('effect-card', id, copies)).sort(best)];
}

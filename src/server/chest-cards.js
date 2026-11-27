// Talia Systemu's cards in the Skrzynia Konta (DECISIONS.md, "Karty Talii:
// Skrzynia Konta, Targowisko i Wymiana (makiety, 19.11.2026)"; card-goods.js
// has what they share with the Targowisko and the Wymiana): one more kind of
// the chest's goods (CARD_GOODS in the engine), kept in chest_goods as the
// others are, the card's id its good. A creature's card (`card`) or an
// effect card (`effect-card`) goes in with as many of its copies as the
// character asks, and any character of the account takes them into its own
// collection, where they add up to the copies it has, so the card's level
// follows (cardLevel). As with goods, the copies a character put in come
// back to it as they were, its own as its own, and those of another
// character come as from others (`traded`), which its Encyklopedia leaves
// out. Being goods, the cards of a character removed stay in the chest for
// the account's others (detachedRows in characters.js), and the chest's
// padlock below its level holds them too (chest.js).
//
// None of the copies of a card a match running now plays leaves the
// character, and a deck whose card left whole is incomplete until it comes
// back (card-goods.js). Each move is one batch, valid only while the
// character, its row of the card and the chest's rows of it are as read, so
// two taps move the copies once; a stale tap gets the chest's "changed
// meanwhile".

import { chestTakes } from '../engine/index.js';
import { assertion, atomically } from './atomic.js';
import { CARD_KINDS, addCopies, cardBusy, cardDecks, cardNames, cardOrder, faceOf, filled, freeCondition, goodsWords, heldCards, heldCondition, knownCard, leaving, ownedCards, setCopies } from './card-goods.js';
import { cardCollection, cardsHere, effectCollection } from './cards.js';
import { content } from './content.js';
import { ApiError } from './http.js';

export { isCardGood } from './card-goods.js';

// A card in the chest as the chest lists it (goodView in chest.js): "Karta:
// Licho", its name alone and its face; null for a card the game does not
// know, or with no cards in the game.
export function cardGoodView(kind, id) {
  if (!knownCard(kind, id)) return null;
  return { ...cardNames(kind, id), rank: cardOrder(kind).get(id) ?? 0, sortName: '', face: faceOf(kind, id, 1) };
}

// The cards of the character's collection for "Włóż kartę" (ownedCards),
// each with the saved decks it is in (their numbers and names, 938 and
// 939); with the copies of each card it has (`have`, by "kind:id"), which
// the cards in the chest tell it (what taking them would give), and the
// words of the page. Null where the game has no cards.
export async function chestCards(db, row) {
  if (!cardsHere()) return null;
  const [collection, effects] = await Promise.all([cardCollection(db, row.id), effectCollection(db, row.id)]);
  const inDecks = await cardDecks(db, row.id, collection);
  const own = await ownedCards(db, row.id, { collection, effects, with: (kind, id) => ({ decks: inDecks(kind, id) }) });
  const have = new Map([...[...collection].map(([id, copies]) => [`card:${id}`, copies]), ...[...effects].map(([id, copies]) => [`effect-card:${id}`, copies])]);
  return { have, view: { texts: goodsWords(), maxLevel: content().cards.stats.maxLevel, own } };
}

// POST /api/chest/goods/put { kind: 'card' | 'effect-card', id, count }
// (chest.js, putGoodsInChest): copies of a card of the character's own into
// the chest, while it has them and no match running now plays the card;
// those it had from others first (cardAfter), marked so in the chest.
export async function putCardInChest(context, session, player, { kind, id, count }, changed) {
  const { row } = player;
  const db = context.env.DB;
  const [held, busy] = await Promise.all([heldCards(db, row.id, kind, [id]).then((found) => found.get(id)), cardBusy(db, kind, row.id, id)]);
  if (held.copies < 1) throw new ApiError(409, 'not_enough', goodsWords().missing);
  if (count > held.copies) throw new ApiError(409, 'not_enough', filled(goodsWords().fewer, { count: held.copies }));
  if (busy) throw new ApiError(409, 'card_in_match', goodsWords().inMatch);
  const { after, foreign } = leaving(held, count);
  const same = heldCondition(kind, row.id, id, held);
  const free = freeCondition(kind, row.id, id);
  await atomically(
    db,
    [
      assertion(db, `(SELECT version FROM characters WHERE id = ?) = ? AND ${same.sql} AND ${free.sql}`, [row.id, row.version, ...same.binds, ...free.binds]),
      setCopies(db, kind, row.id, id, after, context.now),
      // The character's version moves with its collection, as with every
      // card it gets (cardGains in cards.js).
      db.prepare('UPDATE characters SET version = version + 1 WHERE id = ?').bind(row.id),
      db
        .prepare(
          `INSERT INTO chest_goods (user_id, character_id, kind, good, count, traded) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (user_id, character_id, kind, good) DO UPDATE SET count = count + excluded.count, traded = traded + excluded.traded`,
        )
        .bind(session.userId, row.id, kind, id, count, foreign),
    ],
    changed,
  );
}

// POST /api/chest/goods/take { kind: 'card' | 'effect-card', id, count }
// (chest.js, takeGoodsFromChest): copies of a card out of the chest into the
// character's collection, its own first, then the others' (chestTakes): its
// own as they went in, the others' as from others.
export async function takeCardFromChest(context, session, player, { kind, id, count }, changed) {
  const { row } = player;
  const db = context.env.DB;
  const stored = await db.prepare('SELECT id, character_id, count, traded FROM chest_goods WHERE user_id = ? AND kind = ? AND good = ? ORDER BY id').bind(session.userId, kind, id).all();
  const rows = stored.results.map((one) => ({ id: one.id, characterId: one.character_id, count: one.count, traded: one.traded }));
  const plan = chestTakes(rows, row.id, count);
  if (!plan) {
    const there = rows.reduce((sum, one) => sum + one.count, 0);
    throw new ApiError(409, 'not_in_chest', there > 0 ? filled(goodsWords().only, { count: there }) : goodsWords().gone);
  }
  await atomically(
    db,
    [
      assertion(
        db,
        ['(SELECT version FROM characters WHERE id = ?) = ?', ...plan.takes.map(() => 'EXISTS (SELECT 1 FROM chest_goods WHERE id = ? AND user_id = ? AND count = ? AND traded = ?)')].join(' AND '),
        [row.id, row.version, ...plan.takes.flatMap((take) => [take.row.id, session.userId, take.row.count, take.row.traded])],
      ),
      ...plan.takes.map((take) =>
        take.gone
          ? db.prepare('DELETE FROM chest_goods WHERE id = ?').bind(take.row.id)
          : db.prepare('UPDATE chest_goods SET count = count - ?, traded = traded - ? WHERE id = ?').bind(take.count, take.traded, take.row.id),
      ),
      addCopies(db, kind, row.id, id, count, CARD_KINDS[kind].traded ? plan.foreign : 0, context.now),
      db.prepare('UPDATE characters SET version = version + 1 WHERE id = ?').bind(row.id),
    ],
    changed,
  );
}

// The statements that put the cards taken out of the chest whole into the
// character's collection ("Wyjmij wszystko" and "Wyjmij zaznaczone",
// takeManyFromChest in chest.js): each `taken` { kind, id, count, foreign }
// with all its copies, those of others as from others, as takeCardFromChest
// does.
export const cardsTaken = (db, characterId, taken, now) =>
  taken.map(({ kind, id, count, foreign }) => addCopies(db, kind, characterId, id, count, CARD_KINDS[kind].traded ? foreign : 0, now));

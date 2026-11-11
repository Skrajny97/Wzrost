// Gifts for the Osada's residents and presents from friends (the author's
// 818.1 and 818.2; resident-gifts.js in the engine has the rules). On a
// resident's place, "Podaruj" gives them, once a narrator's day, one piece
// of what they like from the character's goods, or gold to those who like
// gold, for relation with them; a resident at the standing of a friend
// leaves a present once a narrator's week, which "Odbierz" takes. Both are
// kept in the character's Osada (`gifts` in characters.settlement), so they
// need no table of their own, and both work also while the character is
// away, as the trade at Jagna's does (the bag stays at hand).

import {
  GIFT_COLUMNS,
  bagCapacity,
  bagStacks,
  campLevels,
  friendPresent,
  giftGoods,
  giftLiked,
  giftRelation,
  givenToday,
  goldGift,
  materialView,
  residentGift,
  withGiven,
  withTaken,
} from '../engine/index.js';
import { bagPlaces, characterView, knowingCharacter, loadPlayer, requirePlayer, settlementBoard } from './characters.js';
import { content } from './content.js';
import { ApiError, json, readJson } from './http.js';
import { counted, foreign } from './market.js';
import { requireOpen, settlementOf, settlementView } from './settlement.js';

// A JSON path for a key with a hyphen or a colon ("wolf-pelt:rare").
const jsonPath = (key) => `$."${key}"`;
const changed = () => new ApiError(409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.');
const rules = () => content().settlement.gifts;
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));

// The goods each gift's kind is kept as on the page (its picture): herbs,
// potions, minerals for the ores and gems, and materials.
const GOODS_KINDS = { herb: 'herb', potion: 'potion', ore: 'mineral', gem: 'mineral', material: 'material' };

// A piece as the page shows it: its goods' kind, key and name, and for a
// material the name with its rarity when above its species', the material
// for its picture and the rarity.
function pieceView(kind, key) {
  const goods = GOODS_KINDS[kind];
  if (goods === 'material') {
    const material = materialView(key, 1, content());
    return { kind: goods, key, name: material.label.charAt(0).toUpperCase() + material.label.slice(1), material, rarity: material.rarity };
  }
  const name = { herb: content().herbsById, potion: content().potionsById, mineral: content().mineralsById }[goods][key].name;
  return { kind: goods, key, name };
}

// A friend's present as the page shows it: its kind, count and, for goods,
// the piece's name.
function presentView(present) {
  if (!present) return null;
  const { kind, count, key } = present;
  return { kind, count, ...(key && { name: pieceView(kind, key).name }) };
}

// The present of the week the resident has for the character now, or null.
const presentOf = (row, stored, residentId, now, character = knowingCharacter(row)) =>
  friendPresent(residentId, { character, points: stored.relations[residentId] ?? 0, gifts: stored.gifts, seed: `${row.id}:settlement` }, now, content());

// What each resident's place shows of the gifts, for settlementView: a
// function of the resident's id, giving { gift, present }. `gift`: what
// they like (`kind`), whether today's gift is given, and the gold of the
// gift for gold, or the pieces of what they like among the character's
// goods, each with the relation it gives (`goods`, the commonest first) and
// the relation of an ordinary one (for the rule). `present`: the friend's
// present waiting this week, or null.
export function residentGiftsView(player, stored, now) {
  if (!rules()) return () => ({ gift: null, present: null });
  const { row } = player;
  const held = Object.fromEntries(['herbs', 'potions', 'minerals', 'materials'].map((column) => [column, JSON.parse(row[column] ?? '{}')]));
  const character = knowingCharacter(row);
  const ordinary = rules().relation[0];
  return (residentId) => {
    const entry = residentGift(residentId, content());
    if (!entry) return { gift: null, present: null };
    const given = givenToday(stored.gifts, residentId, now, content());
    const gift =
      entry.kind === 'gold'
        ? { kind: 'gold', given, gold: goldGift(row.level, content()), relation: giftRelation('gold', null, content()) }
        : {
            kind: entry.kind,
            given,
            relation: ordinary,
            goods: giftGoods(entry.kind, held, content())
              .map((good) => ({ ...pieceView(entry.kind, good.key), count: good.count, step: good.step, relation: good.relation }))
              .sort((a, b) => a.step - b.step || a.name.localeCompare(b.name, 'pl')),
          };
    return { gift, present: presentView(presentOf(row, stored, residentId, now, character)) };
  };
}

// The words of the gifts on the page (data/settlement.json gifts.texts).
export const giftWords = () => rules()?.texts ?? null;

// The resident a request names and what they like, or a 404.
function residentOf(body) {
  const resident = content().settlement.residents.find((one) => one.id === body.resident);
  const entry = resident && residentGift(resident.id, content());
  if (!entry) throw new ApiError(404, 'no_resident', rules().texts.unknown);
  return { resident, entry };
}

// What every answer has: the Osada and the character after the change.
async function answer(context, session, next, result) {
  const after = await loadPlayer(context.env.DB, session.userId);
  return json({
    ...result,
    settlement: settlementView(after, next, settlementBoard(after.row, next, context.now), context.now),
    character: characterView(after, context.now),
  });
}

// POST /api/settlement/residents/gift { resident, key }: today's gift to a
// resident (818.1): a piece of what they like from the character's goods
// (`key`, its stack), or the gold of the gift for those who like gold. The
// piece leaves the goods, the relation with the resident grows, and the
// next gift to them waits for the narrator's next day. Saved only while the
// character is as read, so two taps give one.
export async function giveToResident(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const { texts } = rules();
  const { resident, entry } = residentOf(body);
  const stored = settlementOf(row);
  if (givenToday(stored.gifts, resident.id, context.now, content())) throw new ApiError(409, 'given_today', texts.given);
  const gold = entry.kind === 'gold';
  if (!gold && !giftLiked(entry.kind, body.key, content())) throw new ApiError(400, 'not_liked', filled(texts.notLiked, { name: resident.name }));
  const relation = giftRelation(entry.kind, body.key, content());
  const next = {
    ...stored,
    relations: { ...stored.relations, [resident.id]: (stored.relations[resident.id] ?? 0) + relation },
    gifts: withGiven(stored.gifts, resident.id, context.now, content()),
  };
  const db = context.env.DB;
  if (gold) {
    const amount = goldGift(row.level, content());
    if (row.gold < amount) throw new ApiError(409, 'not_enough_gold', texts.noGold);
    const result = await db
      .prepare('UPDATE characters SET gold = gold - ?, settlement = ?, version = version + 1 WHERE id = ? AND version = ? AND gold >= ?')
      .bind(amount, JSON.stringify(next), row.id, row.version, amount)
      .run();
    if (result.meta.changes !== 1) throw changed();
    return answer(context, session, next, { given: { resident: resident.id, kind: 'gold', count: amount, relation } });
  }
  const column = GIFT_COLUMNS[entry.kind];
  if ((JSON.parse(row[column] ?? '{}')[body.key] ?? 0) < 1) throw new ApiError(409, 'not_enough', texts.notHeld);
  const key = jsonPath(body.key);
  const result = await db
    .prepare(
      `UPDATE characters SET settlement = ?,
         ${column} = CASE WHEN json_extract(${column}, ?) > 1 THEN json_set(${column}, ?, json_extract(${column}, ?) - 1) ELSE json_remove(${column}, ?) END,
         version = version + 1
       WHERE id = ? AND version = ? AND COALESCE(json_extract(${column}, ?), 0) >= 1`,
    )
    .bind(JSON.stringify(next), key, key, key, key, row.id, row.version, key)
    .run();
  if (result.meta.changes !== 1) throw changed();
  const piece = pieceView(entry.kind, body.key);
  return answer(context, session, next, { given: { resident: resident.id, kind: piece.kind, name: piece.name, count: 1, relation } });
}

// POST /api/settlement/residents/present { resident }: the friend's
// present of this week (818.2) goes to the character: herbs and potions
// into the bag while it has room for them (else the present waits),
// materials to the materials, kept out of the Encyklopedia as bought goods
// are; gold to the purse and Punkty Czasu to the character's.
export async function claimResidentPresent(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const { texts } = rules();
  const { resident } = residentOf(body);
  const stored = settlementOf(row);
  const present = presentOf(row, stored, resident.id, context.now);
  if (!present) throw new ApiError(409, 'no_present', texts.noPresent);
  if (present.kind === 'herb' || present.kind === 'potion') {
    const held = JSON.parse(row[GIFT_COLUMNS[present.kind]] ?? '{}');
    const free = bagCapacity(campLevels(player.buildings, context.now, content()), content()) - bagPlaces(player);
    if (bagStacks({ ...held, [present.key]: (held[present.key] ?? 0) + present.count }, content()) - bagStacks(held, content()) > free) {
      throw new ApiError(409, 'bag_full', texts.bagFull);
    }
  }
  const next = { ...stored, gifts: withTaken(stored.gifts, resident.id, present.week) };
  let set = '';
  let binds = [];
  if (present.kind === 'gold') {
    set = 'gold = gold + ?';
    binds = [present.count];
  } else if (present.kind === 'time-points') {
    set = 'time_points = time_points + ?';
    binds = [present.count];
  } else {
    const column = GIFT_COLUMNS[present.kind];
    const goods = counted(column, { [present.key]: present.count });
    const others = foreign({ [present.kind]: { [present.key]: present.count } });
    set = `${column} = ${goods.sql}, foreign_stacks = ${others.sql}`;
    binds = [...goods.binds, ...others.binds];
  }
  const result = await context.env.DB.prepare(`UPDATE characters SET ${set}, settlement = ?, version = version + 1 WHERE id = ? AND version = ?`)
    .bind(...binds, JSON.stringify(next), row.id, row.version)
    .run();
  if (result.meta.changes !== 1) throw changed();
  return answer(context, session, next, { present: { resident: resident.id, ...presentView(present) } });
}

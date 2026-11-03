// The Prośby Gildii (the author's 346 A; data/guilds.json `requests`;
// DECISIONS.md, "Próby i Prośby Gildii"): a member short of a material, a
// herb, a potion or a mineral of Górnictwo asks its guild for up to `most`
// pieces of it, and the
// request hangs on the guild's page until it is filled, taken back or its
// time is up. The others give from their own stock whenever they like, up
// to what is still missing; the pieces go straight to the one who asked,
// with the giver's name, as goods from other players the Encyklopedia
// leaves out (as a Wymiana's), and the one who asked thanks for each gift
// once. Giving pays nothing (346 A): it counts for the week's Dobroczyńcy
// tygodnia and for the Próby Gildii (their "gifts"), so a second character
// gains nothing by it. One open request for a character at a time, a new
// one `waitHours` after the last one was made. No items and no gold, so
// wealth cannot move between accounts, and characters of one account give
// each other nothing, as in a Wymiana (177 A). Herbs and potions go into
// the bag, so a request for them, and each gift, needs room there; the bag
// stays at hand during an exploration and a profession's work
// (DECISIONS.md, "Plecak poza obozem i mikstury na drogę"), so giving and
// getting works then too. No line in the guild's chat: the chat has no
// System lines, as for the Bestia Gildii.
//
// Each gift runs as one batch whose first statement fails it unless the
// request still takes it and the giver still has the pieces: the giver's
// stack goes down, the asker's up, the request's count, the gift's row and
// the giver's trial land together or not at all.

import { bagCapacity, campLevels, knownStack, materialView, questPeriod } from '../engine/index.js';
import { assertion, atomically } from './atomic.js';
import { bagPlaces, characterView, loadCharacter, loadPlayer } from './characters.js';
import { content } from './content.js';
import { guildPlayer, requireMember, trialProgress } from './guild-trials.js';
import { ApiError, json, readJson } from './http.js';
import { counted, foreign } from './market.js';

const rules = () => content.guilds.requests;
const words = () => rules().texts;
const errors = () => words().errors;
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
const HOUR = 3600000;
const COLUMNS = { material: 'materials', herb: 'herbs', potion: 'potions', mineral: 'minerals' };
const jsonPath = (key) => `$."${key}"`;
const changed = () => new ApiError(409, 'changed', errors().changed);
const member = (context) => requireMember(context, errors());

// Whether the game has the goods: a material at a rarity, a herb, a potion
// or a gem or an ore.
function realGood(kind, key) {
  if (!rules().kinds.includes(kind) || typeof key !== 'string') return false;
  if (kind === 'material') return knownStack(key, content);
  if (kind === 'mineral') return Object.hasOwn(content.mineralsById, key);
  return Object.hasOwn(kind === 'herb' ? content.herbsById : content.potionsById, key);
}

// Goods as the page shows them: the name, and for a material its rarity
// and the material for its picture, for a gem or an ore its rarity.
function goodsView(kind, key) {
  if (kind === 'material') {
    const material = materialView(key, 0, content);
    return { kind, key, name: material.label.charAt(0).toUpperCase() + material.label.slice(1), rarity: material.rarity, materialId: material.materialId };
  }
  if (kind === 'mineral') {
    const mineral = content.mineralsById[key];
    return { kind, key, name: mineral?.name ?? key, rarity: mineral && (mineral.rarity ?? mineral.for[0]) };
  }
  return { kind, key, name: (kind === 'herb' ? content.herbsById[key] : content.potionsById[key])?.name ?? key };
}

const stockOf = (row, kind, key) => JSON.parse(row[COLUMNS[kind]] ?? '{}')[key] ?? 0;

// How many pieces of the goods the character's bag takes now: materials
// and minerals take no place; herbs and potions fill the room left in their
// stack and the free places, a stack to a place (storeStacks in the engine).
const roomless = (kind) => kind === 'material' || kind === 'mineral';
function bagRoom(player, kind, key, now) {
  if (roomless(kind)) return Infinity;
  const { stack } = content.professionRules;
  const free = Math.max(0, bagCapacity(campLevels(player.buildings, now, content), content) - bagPlaces(player));
  const have = stockOf(player.row, kind, key);
  return Math.ceil(have / stack) * stack - have + free * stack;
}

// The goods the character knows, to ask for: those in its Encyklopedia and
// those it holds, materials first, then herbs, potions and minerals, each
// by name.
function knownGoods(row) {
  const pairs = new Map();
  const add = (kind, key) => {
    if (realGood(kind, key)) pairs.set(`${kind}|${key}`, [kind, key]);
  };
  for (const entry of Object.keys(JSON.parse(row.discovered ?? '{}'))) {
    const at = entry.indexOf(':');
    add(entry.slice(0, at), entry.slice(at + 1));
  }
  for (const [kind, column] of Object.entries(COLUMNS)) for (const [key, count] of Object.entries(JSON.parse(row[column] ?? '{}'))) if (count > 0) add(kind, key);
  const order = Object.keys(COLUMNS);
  const rank = (rarity) => content.rarities.findIndex((one) => one.id === rarity);
  return [...pairs.values()]
    .map(([kind, key]) => goodsView(kind, key))
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.name.localeCompare(b.name, 'pl') || rank(a.rarity) - rank(b.rarity));
}

// "3 h 20 min", "20 min": the time until a moment, in whole minutes up.
function timeLeft(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

const stateOf = (request, now) => (request.state === 'open' && request.ends_at <= now ? 'expired' : request.state);

// The card's words, with the rules' numbers filled in (all but the
// answers' errors).
function cardTexts() {
  const { most, waitHours, openHours } = rules();
  const { errors: _, ...texts } = words();
  return {
    ...texts,
    how: texts.how.map((line) => filled(line, { most, wait: waitHours, open: openHours })),
    cancelText: filled(texts.cancelText, { wait: waitHours }),
  };
}

// The Prośby Gildii for the page: the guild's open requests of its members
// (each with what this character holds of the goods and the most it may
// give now), its own last request still in sight (open, or made within
// openHours) with its gifts and thanks, when it may ask again, the goods it
// knows to ask for, the week's Dobroczyńcy tygodnia (pieces given in the
// guild since Monday, with the thanks they brought), and the words.
export async function requestsView(db, player, guild, now) {
  const { row } = player;
  const { most, waitHours, openHours } = rules();
  const week = questPeriod('weekly', now, content);
  const [open, latest, ranking] = await db.batch([
    db
      .prepare(
        `SELECT r.*, c.name, c.class_id, c.user_id FROM guild_requests r
         JOIN characters c ON c.id = r.character_id
         JOIN guild_members m ON m.character_id = r.character_id AND m.guild_id = r.guild_id
         WHERE r.guild_id = ? AND r.state = 'open' AND r.ends_at > ? ORDER BY r.created_at, r.id`,
      )
      .bind(guild.id, now),
    db.prepare('SELECT * FROM guild_requests WHERE character_id = ? ORDER BY created_at DESC, id DESC LIMIT 1').bind(row.id),
    db
      .prepare(
        `SELECT g.giver_id, c.name, c.class_id, SUM(g.count) AS pieces, COUNT(g.thanked_at) AS thanks
         FROM guild_gifts g JOIN characters c ON c.id = g.giver_id
         WHERE g.guild_id = ? AND g.created_at >= ? GROUP BY g.giver_id ORDER BY pieces DESC, thanks DESC, c.name`,
      )
      .bind(guild.id, week.startsAt),
  ]);
  const last = latest.results[0] ?? null;
  // A request taken back is gone from the card; only the wait for the next
  // one shows (the author: "Wycofane prośby powinny znikac i tylko pokazywać
  // czas przed kolejną prośbą").
  const kept =
    last && last.guild_id === guild.id && last.state !== 'cancelled' && (stateOf(last, now) === 'open' || last.created_at > now - openHours * HOUR) ? last : null;
  const gifts = kept
    ? (
        await db
          .prepare('SELECT g.id, g.count, g.created_at, g.thanked_at, c.name, c.class_id FROM guild_gifts g LEFT JOIN characters c ON c.id = g.giver_id WHERE g.request_id = ? ORDER BY g.id')
          .bind(kept.id)
          .all()
      ).results
    : [];
  // So is a request filled once every gift is thanked for (the author:
  // "spelnione prośby nie znikają"); until then its thanks wait on it.
  const shown = kept && !(kept.state === 'filled' && gifts.every((gift) => gift.thanked_at !== null)) ? kept : null;
  const waiting = last && stateOf(last, now) === 'open' && last.guild_id === guild.id;
  const nextAt = last ? last.created_at + waitHours * HOUR : 0;
  return {
    guild: { name: guild.name, tag: guild.tag },
    requests: open.results.map((request) => {
      const left = request.count - request.given;
      const have = stockOf(row, request.kind, request.good);
      const own = request.character_id === row.id;
      const sameAccount = !own && request.user_id === row.user_id;
      return {
        id: request.id,
        characterId: request.character_id,
        name: request.name,
        classId: request.class_id,
        goods: goodsView(request.kind, request.good),
        count: request.count,
        given: request.given,
        left,
        endsAt: request.ends_at,
        own,
        sameAccount,
        have,
        give: own || sameAccount ? 0 : Math.min(left, have),
      };
    }),
    mine: shown && {
      id: shown.id,
      goods: goodsView(shown.kind, shown.good),
      count: shown.count,
      given: shown.given,
      state: stateOf(shown, now),
      createdAt: shown.created_at,
      endsAt: shown.ends_at,
      gifts: gifts.map((gift) => ({ id: gift.id, name: gift.name, classId: gift.class_id, count: gift.count, at: gift.created_at, thanked: gift.thanked_at !== null })),
    },
    // When this character may ask again: null now; while its request
    // hangs, it is taken back first.
    nextAt: !waiting && nextAt > now ? nextAt : null,
    waiting: Boolean(waiting),
    known: knownGoods(row),
    ranking: ranking.results.map((one) => ({ id: one.giver_id, name: one.name, classId: one.class_id, pieces: one.pieces, thanks: one.thanks, own: one.giver_id === row.id })),
    rules: { most, waitHours, openHours, kinds: rules().kinds },
    texts: cardTexts(),
  };
}

const answer = async (db, player, guild, now, extra = {}) => json({ ...(await requestsView(db, player, guild, now)), ...extra });

// GET /api/guild/requests: outside a guild, only the card's words (as the
// Bestia Gildii's).
export async function getGuildRequests(context) {
  const { player, guild, db } = await guildPlayer(context, errors());
  if (!guild) return json({ guild: null, texts: cardTexts() });
  return answer(db, player, guild, context.now);
}

// POST /api/guild/requests { kind: material | herb | potion | mineral, key, count }:
// the character asks its guild for pieces of the goods, 1 to `most`; while
// no request of its own hangs, `waitHours` after the last one was made, and
// for herbs and potions only with room for them in the bag. A request of
// its own whose time is up, or one left in a guild it left, closes first.
// The requests of every guild closed before last week began, which no
// card, wait, thanks or ranking needs any more, go with their gifts.
export async function askGuild(context) {
  const { player, guild, db } = await member(context);
  const { row } = player;
  const body = await readJson(context.request);
  const { most, waitHours, openHours } = rules();
  if (!rules().kinds.includes(body.kind)) throw new ApiError(400, 'invalid_kind', errors().invalidKind);
  if (!realGood(body.kind, body.key)) throw new ApiError(400, 'invalid_goods', errors().invalidGoods);
  if (!Number.isInteger(body.count) || body.count < 1 || body.count > most) throw new ApiError(400, 'invalid_count', filled(errors().invalidCount, { most }));
  const now = context.now;
  const last = await db.prepare('SELECT * FROM guild_requests WHERE character_id = ? ORDER BY created_at DESC, id DESC LIMIT 1').bind(row.id).first();
  if (last && stateOf(last, now) === 'open' && last.guild_id === guild.id) throw new ApiError(409, 'open_request', errors().open);
  const nextAt = last ? last.created_at + waitHours * HOUR : 0;
  if (nextAt > now) throw new ApiError(409, 'wait', filled(errors().wait, { left: timeLeft(nextAt - now) }));
  if (bagRoom(player, body.kind, body.key, now) < body.count) throw new ApiError(409, 'bag_full', errors().bagFull);
  const lastWeek = questPeriod('weekly', questPeriod('weekly', now, content).startsAt - 1, content);
  let made;
  try {
    [, , , made] = await db.batch([
      db.prepare('DELETE FROM guild_requests WHERE COALESCE(closed_at, ends_at) < ?').bind(lastWeek.startsAt),
      db.prepare("UPDATE guild_requests SET state = 'expired', closed_at = ends_at WHERE character_id = ? AND state = 'open' AND ends_at <= ?").bind(row.id, now),
      db.prepare("UPDATE guild_requests SET state = 'cancelled', closed_at = ? WHERE character_id = ? AND state = 'open' AND guild_id != ?").bind(now, row.id, guild.id),
      db
        .prepare(
          `INSERT INTO guild_requests (guild_id, character_id, kind, good, count, created_at, ends_at)
           SELECT ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM guild_requests WHERE character_id = ? AND created_at > ?)`,
        )
        .bind(guild.id, row.id, body.kind, body.key, body.count, now, now + openHours * HOUR, row.id, now - waitHours * HOUR),
    ]);
  } catch (error) {
    if (/UNIQUE/.test(String(error?.message ?? error))) throw new ApiError(409, 'open_request', errors().open);
    throw error;
  }
  if (made.meta.changes !== 1) throw new ApiError(409, 'open_request', errors().open);
  return answer(db, player, guild, now, { text: filled(words().asked, { goods: goodsView(body.kind, body.key).name, count: body.count }) });
}

// POST /api/guild/requests/cancel: the character takes its open request
// back; the gifts it got stay, each thanked at once (the request leaves the
// card, and the givers keep their thanks in the week's ranking), and the wait
// for the next one counts from the one taken back. One nobody gave anything to goes as if never made, so the
// next one may be made at once (the author: "wycofanie prośby w Gildii przy
// braku realizacji aktualnej daje możliwość od razu wystawienia nowej
// prośby"); in one batch, so a gift cannot slip in between.
export async function cancelGuildRequest(context) {
  const { player, guild, db } = await member(context);
  const now = context.now;
  const [dropped, cancelled] = await db.batch([
    db.prepare("DELETE FROM guild_requests WHERE character_id = ? AND state = 'open' AND ends_at > ? AND given = 0").bind(player.row.id, now),
    db.prepare("UPDATE guild_requests SET state = 'cancelled', closed_at = ? WHERE character_id = ? AND state = 'open' AND ends_at > ?").bind(now, player.row.id, now),
    db
      .prepare("UPDATE guild_gifts SET thanked_at = ? WHERE thanked_at IS NULL AND request_id IN (SELECT id FROM guild_requests WHERE character_id = ? AND state = 'cancelled' AND closed_at = ?)")
      .bind(now, player.row.id, now),
  ]);
  if (dropped.meta.changes !== 1 && cancelled.meta.changes !== 1) throw new ApiError(409, 'no_request', errors().noRequest);
  return answer(db, player, guild, now, { text: dropped.meta.changes === 1 ? words().cancelledFree : words().cancelled });
}

// POST /api/guild/requests/give { requestId, count }: a member gives pieces
// of its own to another one's open request in its guild, up to what is
// still missing, what it holds and, for herbs and potions, what the asker's
// bag takes. The System pays nothing for it (346 A).
export async function giveToGuildRequest(context) {
  const { session, player, guild, db } = await member(context);
  const { row } = player;
  const body = await readJson(context.request);
  const now = context.now;
  const request = Number.isInteger(body.requestId) ? await db.prepare('SELECT * FROM guild_requests WHERE id = ?').bind(body.requestId).first() : null;
  if (!request || request.guild_id !== guild.id) throw new ApiError(404, 'no_request', errors().gone);
  if (request.character_id === row.id) throw new ApiError(400, 'own', errors().own);
  if (stateOf(request, now) !== 'open') throw new ApiError(409, 'closed', errors().closed);
  const [asker, inGuild] = await Promise.all([
    loadCharacter(db, request.character_id),
    db.prepare('SELECT 1 AS ok FROM guild_members WHERE character_id = ? AND guild_id = ?').bind(request.character_id, guild.id).first(),
  ]);
  if (!asker || !inGuild) throw new ApiError(409, 'closed', errors().closed);
  if (asker.row.user_id === row.user_id) throw new ApiError(409, 'same_account', errors().sameAccount);
  const count = body.count;
  if (!Number.isInteger(count) || count < 1) throw new ApiError(400, 'invalid_count', errors().giveCount);
  const left = request.count - request.given;
  if (count > left) throw new ApiError(409, 'too_many', filled(errors().tooMany, { left }));
  const have = stockOf(row, request.kind, request.good);
  if (count > have) throw new ApiError(409, 'not_enough', have > 0 ? filled(errors().notEnough, { have }) : errors().notHeld);
  const room = bagRoom(asker, request.kind, request.good, now);
  if (count > room) throw new ApiError(409, 'bag_full', filled(room > 0 ? errors().askerRoom : errors().askerFull, { name: asker.row.name, room }));
  const column = COLUMNS[request.kind];
  const key = jsonPath(request.good);
  const adds = counted(column, { [request.good]: count });
  const others = foreign({ [request.kind]: { [request.good]: count } });
  // Herbs and potions only while the asker's bag is as read, with the room.
  const bag = !roomless(request.kind);
  await atomically(
    db,
    [
      assertion(
        db,
        `EXISTS (SELECT 1 FROM guild_requests WHERE id = ? AND state = 'open' AND ends_at > ? AND given + ? <= count)
         AND EXISTS (SELECT 1 FROM guild_members WHERE character_id = ? AND guild_id = ?)
         AND EXISTS (SELECT 1 FROM guild_members WHERE character_id = ? AND guild_id = ?)
         AND COALESCE((SELECT json_extract(${column}, ?) FROM characters WHERE id = ?), 0) >= ?${bag ? ' AND (SELECT version FROM characters WHERE id = ?) = ?' : ''}`,
        [request.id, now, count, row.id, guild.id, request.character_id, guild.id, key, row.id, count, ...(bag ? [asker.row.id, asker.row.version] : [])],
      ),
      db
        .prepare(
          `UPDATE characters SET ${column} = CASE WHEN json_extract(${column}, ?) > ? THEN json_set(${column}, ?, json_extract(${column}, ?) - ?) ELSE json_remove(${column}, ?) END,
             version = version + 1 WHERE id = ?`,
        )
        .bind(key, count, key, key, count, key, row.id),
      db.prepare(`UPDATE characters SET ${column} = ${adds.sql}, foreign_stacks = ${others.sql}, version = version + 1 WHERE id = ?`).bind(...adds.binds, ...others.binds, request.character_id),
      db
        .prepare(
          `UPDATE guild_requests SET given = given + ?, state = CASE WHEN given + ? >= count THEN 'filled' ELSE state END,
             closed_at = CASE WHEN given + ? >= count THEN ? ELSE closed_at END WHERE id = ?`,
        )
        .bind(count, count, count, now, request.id),
      db.prepare('INSERT INTO guild_gifts (request_id, guild_id, giver_id, count, created_at) VALUES (?, ?, ?, ?, ?)').bind(request.id, guild.id, row.id, count, now),
      // The giver's trial of the Próby Gildii, if it asks for gifts.
      ...trialProgress(db, row.id, { gifts: count }, now),
    ],
    changed,
  );
  const after = await loadPlayer(db, session.userId);
  return json({
    ...(await requestsView(db, after, guild, now)),
    text: filled(words().gave, { goods: goodsView(request.kind, request.good).name, count, name: asker.row.name }),
    character: characterView(after, now),
  });
}

// POST /api/guild/requests/thank { giftId }: the one who asked thanks for a
// gift to its request, once.
export async function thankForGuildGift(context) {
  const { player, guild, db } = await member(context);
  const { row } = player;
  const body = await readJson(context.request);
  if (!Number.isInteger(body.giftId)) throw new ApiError(404, 'no_gift', errors().noGift);
  const now = context.now;
  const thanked = await db
    .prepare('UPDATE guild_gifts SET thanked_at = ? WHERE id = ? AND thanked_at IS NULL AND request_id IN (SELECT id FROM guild_requests WHERE character_id = ?)')
    .bind(now, body.giftId, row.id)
    .run();
  if (thanked.meta.changes !== 1) {
    const gift = await db.prepare('SELECT 1 AS ok FROM guild_gifts g JOIN guild_requests r ON r.id = g.request_id WHERE g.id = ? AND r.character_id = ?').bind(body.giftId, row.id).first();
    throw gift ? new ApiError(409, 'thanked', errors().thanked) : new ApiError(404, 'no_gift', errors().noGift);
  }
  return answer(db, player, guild, now, { text: words().thankedToast });
}

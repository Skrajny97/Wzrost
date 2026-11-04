// The Wymiana (DECISIONS.md, "Wymiana"): two characters whose players are
// both online trade items from their bags, herbs, potions, materials, the
// gems and ores of Górnictwo, the camp's resources and gold. One
// proposes it on the other's sheet or in the Znajomi, and the other accepts
// or turns it down. Both then put their offers together; once one confirms,
// neither offer changes any more, and the other confirms too, when all of it
// moves at once, or rejects it. A proposal unanswered, or a trade left
// alone, lapses (data/community.json "trade"). Who proposes to the same
// player too many times in a row, each time turned down, waits a while; a
// player may take no trades from one player, or from anyone. The bags stay
// at hand while the characters are away, on an exploration or at a
// profession's work (the author: "Niech system pozwala na Wymianę i różne
// działania na przedmiotach w czasie zbierania ziół itp."): the potions an
// exploration took along left the bag for the road (hunts.js), and nothing
// worn is traded.

import { bagCapacity, bagStacks, campLevels, isUnlocked, itemView, knownStack, materialView } from '../engine/index.js';
import { characterView, loadPlayer } from './characters.js';
import { requireChatter } from './chat.js';
import { content } from './content.js';
import { ApiError, json, readJson } from './http.js';
import { OWN_CHARACTERS } from './roles.js';
import { herbsOf, mineralsOf, potionKnown, potionsOf } from './professions-view.js';

const LIVE = ['proposed', 'open', 'locked'];
// An ended trade stays a day, for its screen and the pause after proposals
// turned down; the proposer's older ones go with its next proposal.
const KEEP_MS = 24 * 3600000;
const rules = () => content.community.trade;
// Who asked the server within onlineSeconds is online (requireChatter), and
// so is the character the player plays; one set aside waits offline.
const onlineSince = (now) => now - rules().onlineSeconds * 1000;
const playedOnline = (row, now) => row?.role === 'player' && (row.seen_at ?? 0) >= onlineSince(now);
const path = (id) => `$."${id}"`;

// Materials (keys "materialId:rarityId"), minerals and the camp's resources
// (wood, stone, ore: the author's "Konieczne", 4.11.2026) take no places in
// the bag.
const emptyOffer = () => ({ gold: 0, items: [], herbs: {}, potions: {}, materials: {}, minerals: {}, resources: {} });
// The stacks an offer holds, each kept in the characters' column of its name.
const STACKS = ['herbs', 'potions', 'materials', 'minerals', 'resources'];
// A stack's key in the Encyklopedia's record of goods got in a trade; the
// camp's resources are in no Encyklopedia, so none is kept for them.
const FOREIGN = { herbs: 'herb', potions: 'potion', materials: 'material', minerals: 'mineral' };
const offerOf = (raw) => ({ ...emptyOffer(), ...JSON.parse(raw || '{}') });
const sideOf = (trade, characterId) => (trade.from_id === characterId ? 'from' : 'to');
const offerColumn = (side) => (side === 'from' ? 'from_offer' : 'to_offer');

const PLAYED = "SELECT id FROM characters WHERE user_id = ? AND role = 'player'";

// The statement that ends the live Wymiana of the character the account
// plays, when another one takes its place (characters.js): a trade is for
// the characters played.
export const tradesEnded = (db, userId, now) =>
  db
    .prepare(
      `UPDATE trades SET state = 'expired', updated_at = ?
       WHERE state IN ('proposed', 'open', 'locked') AND (from_id IN (${PLAYED}) OR to_id IN (${PLAYED}))`,
    )
    .bind(now, userId, userId);

// A proposal waits for its answer, a trade for its next change.
function lapsed(trade, now) {
  const { proposalSeconds, idleMinutes } = rules();
  return trade.state === 'proposed' ? now - trade.created_at > proposalSeconds * 1000 : now - trade.updated_at > idleMinutes * 60000;
}

async function close(db, trade, state, now) {
  await db.prepare(`UPDATE trades SET state = ?, updated_at = ? WHERE id = ? AND state IN ('proposed', 'open', 'locked')`).bind(state, now, trade.id).run();
  return { ...trade, state, updated_at: now };
}

// The live trade of a character, if any; those that lapsed meanwhile are
// marked so.
async function liveTrade(db, characterId, now) {
  const rows = await db
    .prepare(`SELECT * FROM trades WHERE (from_id = ? OR to_id = ?) AND state IN ('proposed', 'open', 'locked') ORDER BY id DESC`)
    .bind(characterId, characterId)
    .all();
  let live = null;
  for (const row of rows.results) {
    if (!live && !lapsed(row, now)) live = row;
    else await close(db, row, 'expired', now);
  }
  return live;
}

// A trade of this character named in a request, lapsed ones marked so.
async function ownTrade(db, id, character, now) {
  const trade = Number.isInteger(id)
    ? await db.prepare('SELECT * FROM trades WHERE id = ? AND (from_id = ? OR to_id = ?)').bind(id, character.id, character.id).first()
    : null;
  if (!trade) throw new ApiError(404, 'no_trade', 'Tej wymiany już nie ma.');
  return LIVE.includes(trade.state) && lapsed(trade, now) ? close(db, trade, 'expired', now) : trade;
}

function requireLive(trade) {
  if (LIVE.includes(trade.state)) return;
  throw new ApiError(409, 'over', trade.state === 'done' ? 'Ta wymiana już się odbyła.' : 'Ta wymiana już przepadła.');
}


// The trade as one of its two characters sees it: the other one (and
// whether that player is online), both offers with the items described and
// the potions whose recipes this character knows, who confirmed first, and
// when it lapses.
async function tradeView(db, trade, character, now) {
  const side = sideOf(trade, character.id);
  const mine = offerOf(trade[offerColumn(side)]);
  const theirs = offerOf(trade[offerColumn(side === 'from' ? 'to' : 'from')]);
  const ids = [...mine.items, ...theirs.items];
  const [others, items, viewers] = await db.batch([
    db.prepare('SELECT c.id, c.name, c.role, u.seen_at FROM characters c JOIN users u ON u.id = c.user_id WHERE c.id = ?').bind(side === 'from' ? trade.to_id : trade.from_id),
    db.prepare(`SELECT id, data FROM items WHERE id IN (${ids.map(() => '?').join() || 'NULL'})`).bind(...ids),
    db.prepare('SELECT level, professions FROM characters WHERE id = ?').bind(character.id),
  ]);
  const other = others.results[0];
  const viewer = viewers.results[0];
  const described = new Map(items.results.map((row) => [row.id, { id: row.id, ...itemView({ id: row.id, ...JSON.parse(row.data) }, content) }]));
  const offerView = (offer) => ({
    gold: offer.gold,
    items: offer.items.map((id) => described.get(id)).filter(Boolean),
    herbs: Object.entries(offer.herbs).map(([id, count]) => ({ id, name: content.herbsById[id]?.name ?? id, count })),
    potions: Object.entries(offer.potions).map(([id, count]) => {
      const potion = content.potionsById[id];
      return { id, name: potion?.name ?? id, count, known: Boolean(potion && viewer && potionKnown(viewer, potion)) };
    }),
    materials: Object.entries(offer.materials)
      .filter(([key]) => knownStack(key, content))
      .map(([key, count]) => {
        const { label, materialId, rarity, color } = materialView(key, count, content);
        return { id: key, materialId, label, rarity, color, count };
      }),
    minerals: Object.entries(offer.minerals)
      .filter(([id]) => Object.hasOwn(content.mineralsById, id))
      .map(([id, count]) => {
        const mineral = content.mineralsById[id];
        const rarity = mineral.rarity ?? mineral.for[0];
        return { id, name: mineral.name, rarity, color: content.raritiesById[rarity].color, count };
      }),
    resources: Object.entries(offer.resources)
      .filter(([id]) => Object.hasOwn(content.resourcesById, id))
      .map(([id, count]) => ({ id, name: content.resourcesById[id].name, count })),
  });
  const { proposalSeconds, idleMinutes } = rules();
  return {
    id: trade.id,
    state: trade.state,
    version: trade.version,
    proposer: side === 'from',
    other: { id: other?.id ?? null, name: other?.name ?? '', online: playedOnline(other, now) },
    mine: offerView(mine),
    theirs: offerView(theirs),
    lockedBy: trade.locked_by === null ? null : trade.locked_by === character.id ? 'me' : 'them',
    endsAt: trade.state === 'proposed' ? trade.created_at + proposalSeconds * 1000 : trade.updated_at + idleMinutes * 60000,
  };
}

// A trade, as the light of the Społeczność tab needs it (chat.js).
export async function tradeNews(db, characterId, now) {
  const trade = await liveTrade(db, characterId, now);
  if (!trade) return null;
  const other = await db.prepare('SELECT name FROM characters WHERE id = ?').bind(trade.from_id === characterId ? trade.to_id : trade.from_id).first();
  return { id: trade.id, state: trade.state, proposer: trade.from_id === characterId, other: other?.name ?? '' };
}

// GET /api/trade (?id=…): the character's live trade, or the one named, in
// whatever state it ended.
export async function readTrade(context) {
  const { character, db } = await requireChatter(context);
  const asked = Number(new URL(context.request.url).searchParams.get('id'));
  const trade = asked ? await ownTrade(db, asked, character, context.now) : await liveTrade(db, character.id, context.now);
  return json({ trade: trade && (await tradeView(db, trade, character, context.now)) });
}

// POST /api/trade/propose {id}: a trade proposed to that character, whose
// player plays it online, takes trades and takes them from this one. Two
// characters of one account never trade (the author's 177 A).
export async function proposeTrade(context) {
  const { character, account, db, session } = await requireChatter(context);
  const body = await readJson(context.request);
  const now = context.now;
  const other = Number.isInteger(body.id)
    ? await db
        .prepare(`SELECT c.id, c.user_id, c.name, c.level, c.role, u.seen_at, u.trade_off FROM characters c JOIN users u ON u.id = c.user_id WHERE c.id = ? AND c.${OWN_CHARACTERS}`)
        .bind(body.id)
        .first()
    : null;
  if (!other) throw new ApiError(404, 'no_character', 'Nie ma takiej postaci.');
  if (other.id === character.id) throw new ApiError(400, 'self', 'Ze sobą się nie wymienisz.');
  if (other.user_id === session.userId) throw new ApiError(403, 'own', 'Postacie jednego konta nie wymieniają się między sobą.');
  if (account.trade_off) throw new ApiError(403, 'trade_off', 'Wymiana jest u Ciebie wyłączona. Włączysz ją w Ustawieniach.');
  if (!isUnlocked('community', other.level, content)) {
    throw new ApiError(409, 'locked', `${other.name} nie ma jeszcze Społeczności. Otworzy się na ${content.unlocksById.community.level}. poziomie.`);
  }
  const [blocking, blocked] = await db.batch([
    db.prepare('SELECT 1 FROM trade_blocks WHERE user_id = ? AND blocked_id = ?').bind(session.userId, other.user_id),
    db.prepare('SELECT 1 FROM trade_blocks WHERE user_id = ? AND blocked_id = ?').bind(other.user_id, session.userId),
  ]);
  if (blocking.results.length > 0) throw new ApiError(403, 'blocking', `Wymiana z postacią ${other.name} jest u Ciebie zablokowana. Odblokujesz ją w karcie tej postaci.`);
  if (other.trade_off || blocked.results.length > 0) throw new ApiError(403, 'refused', `${other.name} nie przyjmuje wymian.`);
  if (!playedOnline(other, now)) throw new ApiError(409, 'offline', `Gracz ${other.name} nie jest online.`);
  // Turned down too many times in a row: a pause from the last of them.
  const { rejectionsInRow, pauseMinutes } = rules();
  const last = await db.prepare('SELECT state, updated_at FROM trades WHERE from_id = ? AND to_id = ? ORDER BY id DESC LIMIT ?').bind(character.id, other.id, rejectionsInRow).all();
  const turnedDown = last.results.length === rejectionsInRow && last.results.every((row) => row.state === 'rejected' || row.state === 'expired');
  const waitMs = turnedDown ? last.results[0].updated_at + pauseMinutes * 60000 - now : 0;
  if (waitMs > 0) {
    throw new ApiError(429, 'paused', `${other.name} odrzuca Twoje wymiany. Kolejną zaproponujesz za ${Math.ceil(waitMs / 60000)} min.`);
  }
  if (await liveTrade(db, character.id, now)) throw new ApiError(409, 'busy_self', 'Najpierw zakończ wymianę, w której jesteś.');
  if (await liveTrade(db, other.id, now)) throw new ApiError(409, 'busy', `${other.name} jest teraz w innej wymianie.`);
  const [, made] = await db.batch([
    db.prepare("DELETE FROM trades WHERE from_id = ? AND state NOT IN ('proposed', 'open', 'locked') AND updated_at < ?").bind(character.id, now - KEEP_MS),
    db.prepare("INSERT INTO trades (from_id, to_id, state, created_at, updated_at) VALUES (?, ?, 'proposed', ?, ?)").bind(character.id, other.id, now, now),
  ]);
  const trade = await db.prepare('SELECT * FROM trades WHERE id = ?').bind(made.meta.last_row_id).first();
  return json({ trade: await tradeView(db, trade, character, now), text: `Propozycja wysłana. Czekasz, aż ${other.name} ją przyjmie.` });
}

// POST /api/trade/answer {id, accept}: the one asked accepts the proposal,
// while the one who proposed it is still online, or turns it down.
export async function answerTrade(context) {
  const { character, db, session } = await requireChatter(context);
  const body = await readJson(context.request);
  const now = context.now;
  const trade = await ownTrade(db, body.id, character, now);
  if (trade.to_id !== character.id || trade.state !== 'proposed') throw new ApiError(409, 'answered', 'Na tę propozycję już nie odpowiesz.');
  if (body.accept !== true) {
    const rejected = await close(db, trade, 'rejected', now);
    return json({ trade: await tradeView(db, rejected, character, now) });
  }
  const proposer = await db.prepare('SELECT c.name, c.role, u.seen_at FROM characters c JOIN users u ON u.id = c.user_id WHERE c.id = ?').bind(trade.from_id).first();
  if (!playedOnline(proposer, now)) {
    await close(db, trade, 'expired', now);
    throw new ApiError(409, 'offline', `Gracz ${proposer?.name ?? ''} nie jest online.`);
  }
  await db.prepare("UPDATE trades SET state = 'open', updated_at = ?, version = version + 1 WHERE id = ? AND state = 'proposed'").bind(now, trade.id).run();
  return json({ trade: await tradeView(db, { ...trade, state: 'open', updated_at: now, version: trade.version + 1 }, character, now) });
}

// An offer as kept: gold, items from the bag (not worn), herbs, potions,
// materials, minerals and the camp's resources the character has, none of
// them more than it has.
function cleanOffer(raw, player) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ApiError(400, 'invalid_offer', 'Nieprawidłowa oferta.');
  const offer = emptyOffer();
  const gold = raw.gold ?? 0;
  if (!Number.isInteger(gold) || gold < 0) throw new ApiError(400, 'invalid_offer', 'Podaj złoto jako liczbę całkowitą.');
  if (gold > player.row.gold) throw new ApiError(409, 'no_gold', 'Masz mniej złota.');
  offer.gold = gold;
  const ids = raw.items ?? [];
  if (!Array.isArray(ids) || ids.some((id) => !Number.isInteger(id)) || new Set(ids).size !== ids.length) throw new ApiError(400, 'invalid_offer', 'Nieprawidłowe przedmioty.');
  if (ids.length > rules().maxItems) throw new ApiError(400, 'too_many_items', `W jednej wymianie najwyżej ${rules().maxItems} przedmiotów.`);
  for (const id of ids) {
    const item = player.items.find((candidate) => candidate.id === id);
    if (!item) throw new ApiError(409, 'no_item', 'Tego przedmiotu nie ma już w plecaku.');
    if (item.equippedSlot) throw new ApiError(409, 'worn', 'Założonego przedmiotu nie wymienisz. Najpierw go zdejmij.');
  }
  offer.items = ids;
  const named = (table) => (id) => (Object.hasOwn(table, id) ? table[id].name : null);
  for (const [kind, have, nameOf] of [
    ['herbs', herbsOf(player.row), named(content.herbsById)],
    ['potions', potionsOf(player.row), named(content.potionsById)],
    ['materials', JSON.parse(player.row.materials ?? '{}'), (key) => (knownStack(key, content) ? materialView(key, 0, content).label : null)],
    ['minerals', mineralsOf(player.row), named(content.mineralsById)],
    ['resources', JSON.parse(player.row.resources ?? '{}'), named(content.resourcesById)],
  ]) {
    const asked = raw[kind] ?? {};
    if (!asked || typeof asked !== 'object' || Array.isArray(asked)) throw new ApiError(400, 'invalid_offer', 'Nieprawidłowa oferta.');
    for (const [id, count] of Object.entries(asked)) {
      const name = nameOf(id);
      if (!name || !Number.isInteger(count) || count < 0) throw new ApiError(400, 'invalid_offer', 'Nieprawidłowa oferta.');
      if (count > (Object.hasOwn(have, id) ? have[id] : 0)) throw new ApiError(409, 'not_enough', `Masz mniej sztuk: ${name}.`);
      if (count > 0) offer[kind][id] = count;
    }
  }
  return offer;
}

const isEmpty = (offer) => offer.gold === 0 && offer.items.length === 0 && STACKS.every((kind) => Object.keys(offer[kind]).length === 0);

// POST /api/trade/offer {id, offer}: the character's offer, while neither
// has confirmed the trade.
export async function setOffer(context) {
  const { character, db, session } = await requireChatter(context);
  const body = await readJson(context.request);
  const now = context.now;
  const trade = await ownTrade(db, body.id, character, now);
  requireLive(trade);
  if (trade.state === 'proposed') throw new ApiError(409, 'not_open', 'Wymiana jeszcze się nie zaczęła.');
  if (trade.state === 'locked') throw new ApiError(409, 'locked', 'Wymiana jest już zatwierdzona. Można ją tylko przyjąć albo odrzucić.');
  const player = await loadPlayer(db, session.userId);
  const offer = cleanOffer(body.offer, player);
  // Each offered item as stored now, so the exchange gives exactly this
  // item: not another one that got its number meanwhile, nor this one
  // changed by the Kowadło or the Zaklinaczka after the offer (the code
  // review).
  if (offer.items.length > 0) {
    const rows = await db.prepare(`SELECT id, data FROM items WHERE character_id = ? AND id IN (${offer.items.map(() => '?').join()})`).bind(player.row.id, ...offer.items).all();
    const stored = new Map(rows.results.map((row) => [row.id, row.data]));
    offer.itemData = offer.items.map((id) => stored.get(id) ?? '');
  }
  const column = offerColumn(sideOf(trade, character.id));
  const changed = await db
    .prepare(`UPDATE trades SET ${column} = ?, version = version + 1, updated_at = ? WHERE id = ? AND state = 'open'`)
    .bind(JSON.stringify(offer), now, trade.id)
    .run();
  if (changed.meta.changes !== 1) throw new ApiError(409, 'locked', 'Wymiana jest już zatwierdzona. Można ją tylko przyjąć albo odrzucić.');
  const fresh = await db.prepare('SELECT * FROM trades WHERE id = ?').bind(trade.id).first();
  return json({ trade: await tradeView(db, fresh, character, now) });
}

// The places a character's bag takes after giving `give` and getting `get`.
function placesAfter(player, give, get) {
  const merged = (have, minus, plus) => {
    const counts = { ...have };
    for (const [id, count] of Object.entries(minus)) counts[id] = (counts[id] ?? 0) - count;
    for (const [id, count] of Object.entries(plus)) counts[id] = (counts[id] ?? 0) + count;
    return Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));
  };
  const items = player.items.filter((item) => !item.equippedSlot).length - give.items.length + get.items.length;
  return items + bagStacks(merged(herbsOf(player.row), give.herbs, get.herbs), content) + bagStacks(merged(potionsOf(player.row), give.potions, get.potions), content);
}

// Everything moves at once, or nothing: one statement fails the whole
// batch (json() of a state is no JSON) unless both still have what they
// offered and the trade is as both saw it.
function exchange(db, trade, now, sides) {
  const conditions = ["t.state = 'locked'", 't.version = ?'];
  const binds = [trade.version];
  for (const { id, offer } of sides) {
    if (offer.items.length > 0) {
      // Each item as it was offered (setOffer), where the offer keeps it.
      const exact = Array.isArray(offer.itemData) && offer.itemData.length === offer.items.length;
      conditions.push(
        exact
          ? `(SELECT COUNT(*) FROM items WHERE character_id = ? AND slot IS NULL AND (${offer.items.map(() => '(id = ? AND data = ?)').join(' OR ')})) = ?`
          : `(SELECT COUNT(*) FROM items WHERE id IN (${offer.items.map(() => '?').join()}) AND character_id = ? AND slot IS NULL) = ?`,
      );
      binds.push(...(exact ? [id, ...offer.items.flatMap((item, index) => [item, offer.itemData[index]]), offer.items.length] : [...offer.items, id, offer.items.length]));
    }
    if (offer.gold > 0) {
      conditions.push('(SELECT gold FROM characters WHERE id = ?) >= ?');
      binds.push(id, offer.gold);
    }
    for (const kind of STACKS) {
      for (const [stack, count] of Object.entries(offer[kind])) {
        conditions.push(`COALESCE((SELECT json_extract(${kind}, ?) FROM characters WHERE id = ?), 0) >= ?`);
        binds.push(path(stack), id, count);
      }
    }
  }
  const [one, two] = sides;
  const moves = [];
  for (const [giver, taker] of [
    [one, two],
    [two, one],
  ]) {
    if (giver.offer.items.length > 0) {
      moves.push(
        db
          .prepare(`UPDATE items SET character_id = ?, data = json_set(data, '$.traded', 1) WHERE id IN (${giver.offer.items.map(() => '?').join()}) AND character_id = ? AND slot IS NULL`)
          .bind(taker.id, ...giver.offer.items, giver.id),
      );
    }
    // What the character gets and gives, as one change of each column.
    const change = (kind) => {
      const ids = new Set([...Object.keys(giver.offer[kind]), ...Object.keys(taker.offer[kind])]);
      let sql = kind;
      const values = [];
      for (const stack of ids) {
        sql = `json_set(${sql}, ?, COALESCE(json_extract(${kind}, ?), 0) + ?)`;
        values.push(path(stack), path(stack), (taker.offer[kind][stack] ?? 0) - (giver.offer[kind][stack] ?? 0));
      }
      return { sql, values };
    };
    const changes = STACKS.map((kind) => [kind, change(kind)]);
    // The pieces got are from a trade, which the Encyklopedia leaves out
    // (ownDiscoveries in the engine).
    let foreign = 'foreign_stacks';
    const got = [];
    for (const kind of STACKS.filter((one) => FOREIGN[one])) {
      for (const [stack, count] of Object.entries(taker.offer[kind])) {
        foreign = `json_set(${foreign}, ?, COALESCE(json_extract(foreign_stacks, ?), 0) + ?)`;
        got.push(path(`${FOREIGN[kind]}:${stack}`), path(`${FOREIGN[kind]}:${stack}`), count);
      }
    }
    moves.push(
      db
        .prepare(
          `UPDATE characters SET gold = gold + ?, ${changes.map(([kind, { sql }]) => `${kind} = ${sql}`).join(', ')}, foreign_stacks = ${foreign}, version = version + 1 WHERE id = ?`,
        )
        .bind(taker.offer.gold - giver.offer.gold, ...changes.flatMap(([, { values }]) => values), ...got, giver.id),
    );
  }
  const emptied = (kind) => `(SELECT COALESCE(json_group_object(key, value), '{}') FROM json_each(characters.${kind}) WHERE value > 0)`;
  return db.batch([
    db.prepare(`SELECT CASE WHEN ${conditions.join(' AND ')} THEN 1 ELSE json(t.state) END AS ok FROM trades t WHERE t.id = ?`).bind(...binds, trade.id),
    db.prepare("UPDATE trades SET state = 'done', updated_at = ? WHERE id = ? AND state = 'locked' AND version = ?").bind(now, trade.id, trade.version),
    ...moves,
    db.prepare(`UPDATE characters SET ${STACKS.map((kind) => `${kind} = ${emptied(kind)}`).join(', ')} WHERE id IN (?, ?)`).bind(one.id, two.id),
  ]);
}

// POST /api/trade/confirm {id, version}: the first to confirm the offers as
// they saw them freezes them; the other's confirmation makes the trade.
export async function confirmTrade(context) {
  const { character, db } = await requireChatter(context);
  const body = await readJson(context.request);
  const now = context.now;
  const trade = await ownTrade(db, body.id, character, now);
  requireLive(trade);
  if (trade.state === 'proposed') throw new ApiError(409, 'not_open', 'Wymiana jeszcze się nie zaczęła.');
  if (body.version !== trade.version) throw new ApiError(409, 'changed', 'Oferta właśnie się zmieniła. Sprawdź ją jeszcze raz.');
  const from = offerOf(trade.from_offer);
  const to = offerOf(trade.to_offer);
  if (isEmpty(from) && isEmpty(to)) throw new ApiError(400, 'empty', 'Wymiana jest pusta. Dodajcie coś do ofert.');
  if (trade.locked_by === character.id) throw new ApiError(409, 'waiting', 'Wymiana czeka na drugą stronę.');
  // Both characters as they are played now, at home or away.
  const owners = await db.prepare('SELECT id, user_id FROM characters WHERE id IN (?, ?)').bind(trade.from_id, trade.to_id).all();
  const userOf = (id) => owners.results.find((row) => row.id === id).user_id;
  const [fromPlayer, toPlayer] = await Promise.all([loadPlayer(db, userOf(trade.from_id)), loadPlayer(db, userOf(trade.to_id))]);
  // A trade is for the characters played: one set aside meanwhile ends it.
  if (fromPlayer?.row.id !== trade.from_id || toPlayer?.row.id !== trade.to_id) {
    await close(db, trade, 'expired', now);
    throw new ApiError(409, 'stale', 'Jedna z postaci jest teraz odłożona. Wymiana przepadła.');
  }
  const mine = character.id === trade.from_id ? fromPlayer : toPlayer;
  if (trade.state === 'open') {
    const locked = await db
      .prepare("UPDATE trades SET state = 'locked', locked_by = ?, updated_at = ? WHERE id = ? AND state = 'open' AND version = ?")
      .bind(character.id, now, trade.id, trade.version)
      .run();
    if (locked.meta.changes !== 1) throw new ApiError(409, 'changed', 'Oferta właśnie się zmieniła. Sprawdź ją jeszcze raz.');
    return json({ trade: await tradeView(db, { ...trade, state: 'locked', locked_by: character.id, updated_at: now }, character, now) });
  }

  // Both have what they offered, and room in their bags for what they get.
  for (const [player, offer] of [
    [fromPlayer, from],
    [toPlayer, to],
  ]) {
    try {
      cleanOffer(offer, player);
    } catch {
      await close(db, trade, 'cancelled', now);
      throw new ApiError(409, 'stale', `${player.row.name} nie ma już wszystkiego, co było w ofercie. Wymiana przepadła.`);
    }
  }
  for (const [player, give, get] of [
    [fromPlayer, from, to],
    [toPlayer, to, from],
  ]) {
    if (placesAfter(player, give, get) > bagCapacity(campLevels(player.buildings, now, content), content)) {
      throw new ApiError(409, 'bag_full', `W plecaku postaci ${player.row.name} zabraknie miejsca. Zwolnijcie miejsce albo odrzućcie wymianę.`);
    }
  }
  try {
    await exchange(db, trade, now, [
      { id: trade.from_id, offer: from },
      { id: trade.to_id, offer: to },
    ]);
  } catch {
    await close(db, trade, 'cancelled', now);
    throw new ApiError(409, 'stale', 'Coś z ofert zmieniło się w ostatniej chwili. Wymiana przepadła.');
  }
  return json({
    trade: await tradeView(db, { ...trade, state: 'done', updated_at: now }, character, now),
    character: characterView(await loadPlayer(db, mine.row.user_id), now),
    text: 'Wymiana zakończona.',
  });
}

// POST /api/trade/cancel {id}: the trade ends at either one's word; from
// the one it was proposed to, it counts as turned down.
export async function cancelTrade(context) {
  const { character, db } = await requireChatter(context);
  const body = await readJson(context.request);
  const now = context.now;
  const trade = await ownTrade(db, body.id, character, now);
  requireLive(trade);
  const ended = await close(db, trade, trade.to_id === character.id ? 'rejected' : 'cancelled', now);
  return json({ trade: await tradeView(db, ended, character, now) });
}

// GET /api/trade/settings: whether this player takes trades, and the
// players it takes none from (each an account, by the name its character
// had then).
export async function tradeSettings(context) {
  const { session, account, db } = await requireChatter(context);
  const blocked = await db.prepare('SELECT blocked_id AS user, name FROM trade_blocks WHERE user_id = ? ORDER BY created_at').bind(session.userId).all();
  return json({ off: Boolean(account.trade_off), blocked: blocked.results });
}

// POST /api/trade/settings {off}: all trades turned off, or on again.
export async function setTradeSettings(context) {
  const { session, db } = await requireChatter(context);
  const body = await readJson(context.request);
  if (typeof body.off !== 'boolean') throw new ApiError(400, 'invalid_settings', 'Nieprawidłowe ustawienie.');
  await db.prepare('UPDATE users SET trade_off = ? WHERE id = ?').bind(body.off ? 1 : 0, session.userId).run();
  return tradeSettings(context);
}

// POST /api/trade/block {id, blocked}: no trades from the player of that
// character (`id`), also its later characters, or trades again (`blocked`
// false); {user, blocked: false} takes a player off the list of
// tradeSettings.
export async function blockTrades(context) {
  const { session, db } = await requireChatter(context);
  const body = await readJson(context.request);
  const unblock = (user) => db.prepare('DELETE FROM trade_blocks WHERE user_id = ? AND blocked_id = ?').bind(session.userId, user).run();
  if (body.blocked === false && Number.isInteger(body.user)) {
    await unblock(body.user);
    return tradeSettings(context);
  }
  const other = Number.isInteger(body.id) ? await db.prepare(`SELECT user_id, name FROM characters WHERE id = ? AND ${OWN_CHARACTERS}`).bind(body.id).first() : null;
  if (!other) throw new ApiError(404, 'no_character', 'Nie ma takiej postaci.');
  if (other.user_id === session.userId) throw new ApiError(400, 'self', 'Siebie nie zablokujesz.');
  if (body.blocked === false) await unblock(other.user_id);
  else {
    await db
      .prepare('INSERT OR IGNORE INTO trade_blocks (user_id, blocked_id, name, created_at) VALUES (?, ?, ?, ?)')
      .bind(session.userId, other.user_id, other.name, context.now)
      .run();
  }
  return tradeSettings(context);
}

// Whether this player blocks trades from the player of another character,
// for its sheet (characterProfile).
export async function tradeBlockOf(db, userId, otherUserId) {
  return Boolean(await db.prepare('SELECT 1 FROM trade_blocks WHERE user_id = ? AND blocked_id = ?').bind(userId, otherUserId).first());
}

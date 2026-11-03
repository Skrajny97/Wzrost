// The Salon Gier in the Osada (answers 523–526; the rules are in the
// engine's casino.js): Szczęsny's Loteria and Koło Fortuny.
//
// The Loteria's tickets wait in their own table, one a character a day, and
// the minute's cron draws each day gone by once (drawLotteries): the winner
// gets the whole pot, the draw is written down, and the Globalny gets the
// System's message about it. The Wheel's pool of the day is kept in the
// character's Osada (`casino` in characters.settlement), drawn the first
// time the character looks at the Salon that day. Every purchase and spin is
// one batch whose first statement fails it unless the character is still as
// read, so two taps never pay twice nor win twice.

import {
  bagCapacity,
  campBonus,
  campLevels,
  casinoDay,
  gendered,
  itemName,
  itemView,
  lotteryPot,
  lotteryWinner,
  materialPrice,
  materialView,
  prizeWorth,
  prizesLeft,
  spinBlock,
  spinWheel,
  tanneryPremium,
  ticketBlock,
  wheelChance,
  wheelPrizes,
  wheelToday,
} from '../engine/index.js';
import { assertion, atomically, raced } from './atomic.js';
import { bagPlaces, characterView, engineCharacter, loadPlayer, requirePlayer } from './characters.js';
import { content } from './content.js';
import { toHex } from './encoding.js';
import { ApiError, json, readJson } from './http.js';
import { counted, foreign } from './market.js';
import { requireOpen, settlementOf } from './settlement.js';

const tuning = () => content.settlement.casino;
const changed = () => new ApiError(409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.');
const newSeed = () => toHex(crypto.getRandomValues(new Uint8Array(16)));
const goldText = (gold) => new Intl.NumberFormat('pl-PL').format(gold);

// The words of a draw, in the chat and in the Salon: "Loterię wygrała
// Dobromira: 650 zł." (the author: „Loterię wygrał X: 650 zł”).
const announcement = ({ name, appearance, pot }) => gendered(tuning().texts.announce, appearance).replaceAll('{name}', name).replaceAll('{gold}', goldText(pot));

// The character's own prices, which set what a prize is worth to it: the
// camp's Skup złomu, and the Garbarnia's premium at its relation with the
// tanner.
function bonusesOf(player, stored, now) {
  const { tannery } = content.settlement;
  return {
    sellBonus: campBonus(campLevels(player.buildings, now, content), 'sellPrice', content),
    tanneryPremium: tannery ? tanneryPremium(stored.relations[tannery.resident] ?? 0, content) : 0,
  };
}

// The character's pool of the day: the one kept in its Osada, or one drawn
// now from the character and the day.
const poolOf = (player, stored, now) =>
  wheelToday(stored.casino, now, content) ?? wheelPrizes({ character: engineCharacter(player.row), seed: `${player.row.id}:casino`, ...bonusesOf(player, stored, now) }, now, content);

// A new pool is kept in the Osada at once, as the Tablica's board is
// (settlement.js), only over the Osada as read.
async function keepPool(db, row, stored, pool) {
  if (stored.casino?.day === pool.day) return;
  await db.prepare('UPDATE characters SET settlement = ? WHERE id = ? AND settlement IS ?').bind(JSON.stringify({ ...stored, casino: pool }), row.id, row.settlement ?? null).run();
}

// The bag's free places, for an item of the pool.
const bagFree = (player, now) => Math.max(0, bagCapacity(campLevels(player.buildings, now, content), content) - bagPlaces(player));

// A prize as the Salon shows it: an item with its card (its price at the
// character's scrapper), or materials as the Targowisko shows a stack;
// `worth` is what it is worth to the character (prizeWorth).
function prizeView(prize, won, bonuses) {
  const worth = Math.floor(prizeWorth(prize, bonuses, content));
  if (prize.kind === 'item') {
    return { kind: 'item', won, worth, name: itemName(prize.item, content), rarity: prize.item.rarity, level: prize.item.level, item: itemView(prize.item, content, { sellBonus: bonuses.sellBonus }) };
  }
  const material = materialView(prize.key, prize.count, content);
  return {
    kind: 'material',
    won,
    worth,
    key: prize.key,
    count: prize.count,
    name: material.label.charAt(0).toUpperCase() + material.label.slice(1),
    rarity: material.rarity,
    material,
    description: content.materialsById[material.materialId].description,
    scrap: materialPrice(material.rarity, content) * (1 + bonuses.sellBonus),
  };
}

// The Loteria for the page: today's tickets and pot, whether the character
// has its ticket, and the last draw, with the System's words of it.
async function lotteryView(db, row, now) {
  const day = casinoDay(now, content);
  const yesterday = casinoDay(day.startsAt - 1, content).key;
  const [count, mine, last] = await db.batch([
    db.prepare('SELECT COUNT(*) AS count FROM lottery_tickets WHERE day = ?').bind(day.key),
    db.prepare('SELECT 1 AS ok FROM lottery_tickets WHERE day = ? AND character_id = ?').bind(day.key, row.id),
    db.prepare('SELECT * FROM lottery_draws ORDER BY day DESC LIMIT 1'),
  ]);
  const tickets = count.results[0].count;
  const draw = last.results[0] ?? null;
  const { lottery } = tuning();
  return {
    name: lottery.name,
    ticket: lottery.ticket,
    base: lottery.base,
    tickets,
    pot: lotteryPot(tickets, content),
    mine: mine.results.length > 0,
    endsAt: day.endsAt,
    last: draw && { day: draw.day, yesterday: draw.day === yesterday, tickets: draw.tickets, pot: draw.pot, name: draw.name, text: announcement(draw), own: draw.character_id === row.id },
  };
}

// The Salon for the page: its words, the Loteria and the Wheel with the
// character's pool of the day.
async function casinoView(db, player, stored, pool, now) {
  const bonuses = bonusesOf(player, stored, now);
  const { wheel, texts } = tuning();
  const left = prizesLeft(pool);
  return {
    texts,
    lottery: await lotteryView(db, player.row, now),
    wheel: {
      name: wheel.name,
      minStake: wheel.minStake,
      maxStake: wheel.maxStake,
      chancePerGold: wheel.chancePerGold,
      prizeOver: wheel.prizeOver,
      endsAt: casinoDay(now, content).endsAt,
      prizes: pool.prizes.map((prize, index) => prizeView(prize, pool.won.includes(index), bonuses)),
      left: left.length,
      itemLeft: left.some((index) => pool.prizes[index].kind === 'item'),
      bagFree: bagFree(player, now),
    },
  };
}

// What the Salon answers with: itself and the character, as they are now.
async function respond(context, session, extra = {}, player = null) {
  const db = context.env.DB;
  const now = context.now;
  const current = player ?? (await loadPlayer(db, session.userId));
  const stored = settlementOf(current.row);
  const pool = poolOf(current, stored, now);
  await keepPool(db, current.row, stored, pool);
  return json({ ...extra, casino: await casinoView(db, current, stored, pool, now), character: characterView(current, now) });
}

// GET /api/settlement/casino: the Salon Gier for the page.
export async function getCasino(context) {
  const { session, player } = await requirePlayer(context);
  requireOpen(player.row);
  return respond(context, session, {}, player);
}

// POST /api/settlement/casino/ticket: today's ticket of the Loteria, one a
// day, for its price, which goes to the pot. The relation with Szczęsny
// grows with it. Also while the character is away, as a mug at the Karczma.
// Never for a day already drawn (a ticket bought as midnight strikes).
export async function buyTicket(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const db = context.env.DB;
  const day = casinoDay(context.now, content).key;
  const has = await db.prepare('SELECT 1 AS ok FROM lottery_tickets WHERE day = ? AND character_id = ?').bind(day, row.id).first();
  const block = ticketBlock({ gold: row.gold, has: Boolean(has) }, content);
  if (block) throw new ApiError(409, block.code, block.message);
  const { resident, relationGain, lottery } = tuning();
  const stored = settlementOf(row);
  const next = { ...stored, relations: { ...stored.relations, [resident]: (stored.relations[resident] ?? 0) + relationGain } };
  await atomically(
    db,
    [
      assertion(
        db,
        `(SELECT version FROM characters WHERE id = ?) = ? AND (SELECT gold FROM characters WHERE id = ?) >= ?
         AND NOT EXISTS (SELECT 1 FROM lottery_tickets WHERE day = ? AND character_id = ?) AND NOT EXISTS (SELECT 1 FROM lottery_draws WHERE day = ?)`,
        [row.id, row.version, row.id, lottery.ticket, day, row.id, day],
      ),
      db.prepare('UPDATE characters SET gold = gold - ?, settlement = ?, version = version + 1 WHERE id = ?').bind(lottery.ticket, JSON.stringify(next), row.id),
      db.prepare('INSERT INTO lottery_tickets (day, character_id, created_at) VALUES (?, ?, ?)').bind(day, row.id, context.now),
    ],
    changed,
  );
  return respond(context, session, { ticket: { day, gold: lottery.ticket } });
}

// POST /api/settlement/casino/spin { stake }: the Wheel at a stake of whole
// gold. The stake goes whatever comes; a win takes one of the pool's
// prizes left: an item to the bag, as one from the Wymiana, or materials,
// as bought ones the Encyklopedia leaves out. Also while the character is
// away: the bag stays at hand, as at the Targowisko.
export async function spinCasinoWheel(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const now = context.now;
  const stored = settlementOf(row);
  const pool = poolOf(player, stored, now);
  const left = prizesLeft(pool);
  const itemLeft = left.some((index) => pool.prizes[index].kind === 'item');
  const block = spinBlock(body.stake, { gold: row.gold, left: left.length, itemLeft, bagFree: bagFree(player, now) }, content);
  if (block) throw new ApiError(block.code === 'invalid_stake' ? 400 : 409, block.code, block.message);
  const stake = body.stake;
  // The spin's own seed, which nobody knows before it.
  const result = spinWheel(stake, left, newSeed(), content);
  const prize = result.win ? pool.prizes[result.prize] : null;
  const next = { ...stored, casino: { ...pool, won: result.win ? [...pool.won, result.prize] : pool.won } };
  const db = context.env.DB;
  const statements = [assertion(db, '(SELECT version FROM characters WHERE id = ?) = ? AND (SELECT gold FROM characters WHERE id = ?) >= ?', [row.id, row.version, row.id, stake])];
  if (prize?.kind === 'material') {
    const materials = counted('materials', { [prize.key]: prize.count });
    const others = foreign({ material: { [prize.key]: prize.count } });
    statements.push(
      db
        .prepare(`UPDATE characters SET gold = gold - ?, materials = ${materials.sql}, foreign_stacks = ${others.sql}, settlement = ?, version = version + 1 WHERE id = ?`)
        .bind(stake, ...materials.binds, ...others.binds, JSON.stringify(next), row.id),
    );
  } else {
    statements.push(db.prepare('UPDATE characters SET gold = gold - ?, settlement = ?, version = version + 1 WHERE id = ?').bind(stake, JSON.stringify(next), row.id));
    if (prize) statements.push(db.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, ?)').bind(row.id, JSON.stringify({ ...prize.item, traded: 1 }), now));
  }
  await atomically(db, statements, changed);
  const bonuses = bonusesOf(player, stored, now);
  return respond(context, session, { spin: { stake, chance: wheelChance(stake, content), win: result.win, prize: prize && prizeView(prize, true, bonuses) } });
}

// The draw of each day gone by with tickets, at the minute's cron, so at
// Polish midnight (src/server/index.js): see drawLottery.
export async function drawLotteries(db, now) {
  const today = casinoDay(now, content).key;
  const { results } = await db.prepare('SELECT DISTINCT day FROM lottery_tickets WHERE day < ? ORDER BY day').bind(today).all();
  const draws = [];
  for (const { day } of results) {
    const draw = await drawLottery(db, day, now);
    if (draw) draws.push(draw);
  }
  return draws;
}

// One day's draw, written once (524 A): a ticket of the day, from the draw's
// own seed, wins the whole pot; the draw is written down, the winner gets
// the gold, the Globalny gets the System's message, and the day's tickets
// go. All of it or nothing, and only while the day is not drawn yet and its
// tickets are the ones counted here; otherwise the next minute tries again.
async function drawLottery(db, day, now) {
  const { results: tickets } = await db
    .prepare('SELECT t.character_id, c.name, c.appearance FROM lottery_tickets t JOIN characters c ON c.id = t.character_id WHERE t.day = ? ORDER BY t.character_id')
    .bind(day)
    .all();
  if (tickets.length === 0) return null;
  const seed = newSeed();
  const winner = tickets[lotteryWinner(tickets.length, seed)];
  const pot = lotteryPot(tickets.length, content);
  const text = announcement({ ...winner, pot });
  try {
    await db.batch([
      assertion(
        db,
        `NOT EXISTS (SELECT 1 FROM lottery_draws WHERE day = ?) AND (SELECT COUNT(*) FROM lottery_tickets WHERE day = ?) = ?
         AND EXISTS (SELECT 1 FROM lottery_tickets WHERE day = ? AND character_id = ?)`,
        [day, day, tickets.length, day, winner.character_id],
      ),
      db
        .prepare('INSERT INTO lottery_draws (day, tickets, pot, character_id, name, appearance, seed, drawn_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(day, tickets.length, pot, winner.character_id, winner.name, winner.appearance, seed, now),
      db.prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').bind(pot, winner.character_id),
      db
        .prepare(
          `INSERT INTO chat_messages (channel, user_id, character_id, name, level, class_id, text, created_at, system)
           SELECT ?, user_id, id, name, level, class_id, ?, ?, 1 FROM characters WHERE id = ?`,
        )
        .bind(content.chat.channels[0].id, text, now, winner.character_id),
      db.prepare('DELETE FROM lottery_tickets WHERE day = ?').bind(day),
    ]);
  } catch (error) {
    if (raced(error)) return null;
    throw error;
  }
  return { day, tickets: tickets.length, pot, characterId: winner.character_id, text };
}

// The Salon Gier in the Osada (answers 523–526; the rules are in the
// engine's casino.js): Szczęsny's Loteria and Koło Fortuny.
//
// The Loteria's tickets wait in their own table, one a character a day, and
// the minute's cron draws each day gone by once (drawLotteries): the winner
// gets the whole pot, the draw is written down, and the Globalny gets the
// System's message about it. The character's Wheel of the day (the basis
// its one pool is drawn from and the prizes won) is kept in its Osada
// (`casino` in characters.settlement), from the first time the character
// looks at the Salon that day; the pool is drawn from it again when asked.
// Every purchase and spin is one batch whose first statement fails it
// unless the character is still as read, so two taps never pay twice nor
// win twice.

import {
  bagCapacity,
  brotherhoodPerk,
  campBonus,
  campLevels,
  casinoDay,
  dayStakes,
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
  wheelDay,
  wheelOdds,
  wheelPool,
  wheelWon,
} from '../engine/index.js';
import { assertion, atomically, raced } from './atomic.js';
import { bagPlaces, characterView, engineCharacter, loadPlayer, requirePlayer } from './characters.js';
import { content } from './content.js';
import { toHex } from './encoding.js';
import { cardsOn } from './features.js';
import { ApiError, json, readJson } from './http.js';
import { numberText, runInLanguage } from './i18n.js';
import { guildTagSql } from './guilds.js';
import { counted, foreign } from './market.js';
import { requireOpen, settlementOf } from './settlement.js';

const tuning = () => content().settlement.casino;
const changed = () => new ApiError(409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.');
const newSeed = () => toHex(crypto.getRandomValues(new Uint8Array(16)));
const goldText = (gold) => numberText(gold);

// The words of a draw, in the chat and in the Salon: "Loterię wygrała
// Dobromira: 650 zł." (the author: „Loterię wygrał X: 650 zł”).
const announcement = ({ name, appearance, pot }) => gendered(tuning().texts.announce, appearance).replaceAll('{name}', name).replaceAll('{gold}', goldText(pot));

// The character's own prices, which set what a prize is worth to it: the
// camp's Skup złomu, and the Garbarnia's premium at its relation with the
// tanner.
function bonusesOf(player, stored, now) {
  const { tannery } = content().settlement;
  return {
    sellBonus: campBonus(campLevels(player.buildings, now, content()), 'sellPrice', content()),
    tanneryPremium: tannery ? tanneryPremium(stored.relations[tannery.resident] ?? 0, content()) + brotherhoodPerk('tanneryPremium', stored.reputation, content()) : 0,
  };
}

// The character's own seed of the Wheel's pools.
const seedOf = (row) => `${row.id}:casino`;

// The character's Wheel of the day: the one kept in its Osada, or a new one
// from the character as it is now.
function wheelOf(player, stored, now) {
  const { level, classId, classLevel } = engineCharacter(player.row);
  return wheelDay(stored.casino, { level, classId, classLevel, ...bonusesOf(player, stored, now) }, now, content());
}

// A new Wheel of the day is kept in the Osada at once, as the Tablica's
// board is (settlement.js), only over the Osada as read.
async function keepWheel(db, row, stored, wheel) {
  if (stored.casino?.day === wheel.day && stored.casino.basis) return;
  await db.prepare('UPDATE characters SET settlement = ? WHERE id = ? AND settlement IS ?').bind(JSON.stringify({ ...stored, casino: wheel }), row.id, row.settlement ?? null).run();
}

// The stake asked for when it is one of the day's, or else the lowest.
function stakeOf(wheel, asked) {
  const stakes = dayStakes(wheel, content());
  return stakes.includes(asked) ? asked : stakes[0];
}

// The bag's free places, for an item of the pool.
const bagFree = (player, now) => Math.max(0, bagCapacity(campLevels(player.buildings, now, content()), content()) - bagPlaces(player));

// A prize as the Salon shows it, with its tier: an item with its card (its
// price at the character's scrapper), materials as the Targowisko shows a
// stack, or the camp's resources; `worth` is what it is worth to the
// character (prizeWorth).
function prizeView(prize, won, bonuses) {
  const worth = Math.floor(prizeWorth(prize, bonuses, content()));
  const tier = prize.tier;
  if (prize.kind === 'item') {
    return { kind: 'item', tier, won, worth, name: itemName(prize.item, content()), rarity: prize.item.rarity, level: prize.item.level, item: itemView(prize.item, content(), { sellBonus: bonuses.sellBonus }) };
  }
  if (prize.kind === 'resource') {
    return { kind: 'resource', tier, won, worth, key: prize.key, count: prize.count, name: content().resourcesById[prize.key].name };
  }
  const material = materialView(prize.key, prize.count, content());
  return {
    kind: 'material',
    tier,
    won,
    worth,
    key: prize.key,
    count: prize.count,
    name: material.label.charAt(0).toUpperCase() + material.label.slice(1),
    rarity: material.rarity,
    material,
    description: content().materialsById[material.materialId].description,
    scrap: materialPrice(material.rarity, content()) * (1 + bonuses.sellBonus),
  };
}

// The Loteria for the page: today's tickets and pot, who holds them (the
// author: "Dodaj do loterii możliwość dla gracza, żeby widzieć kto bierze w
// niej udział"), in the order bought, with their guilds' tags, whether the
// character has its ticket, and the last draw, with the System's words of
// it.
async function lotteryView(db, row, now) {
  const day = casinoDay(now, content());
  const yesterday = casinoDay(day.startsAt - 1, content()).key;
  const [holders, last] = await db.batch([
    db
      .prepare(
        `SELECT t.character_id, c.name, ${guildTagSql('t.character_id')} AS guild_tag FROM lottery_tickets t JOIN characters c ON c.id = t.character_id
         WHERE t.day = ? ORDER BY t.created_at, t.character_id`,
      )
      .bind(day.key),
    db.prepare('SELECT * FROM lottery_draws ORDER BY day DESC LIMIT 1'),
  ]);
  const tickets = holders.results.length;
  const draw = last.results[0] ?? null;
  const { lottery } = tuning();
  return {
    name: lottery.name,
    ticket: lottery.ticket,
    base: lottery.base,
    tickets,
    pot: lotteryPot(tickets, content()),
    players: holders.results.map((holder) => ({ name: holder.name, guildTag: holder.guild_tag ?? null })),
    mine: holders.results.some((holder) => holder.character_id === row.id),
    endsAt: day.endsAt,
    last: draw && { day: draw.day, yesterday: draw.day === yesterday, tickets: draw.tickets, pot: draw.pot, name: draw.name, text: announcement(draw), own: draw.character_id === row.id },
  };
}

// The Salon for the page: its words, the Loteria and the Wheel with the
// day's stakes, the chances at each of them, the stake shown and the day's
// pool.
async function casinoView(db, player, stored, wheel, stake, now) {
  const bonuses = bonusesOf(player, stored, now);
  const { wheel: tuned, texts } = tuning();
  const pool = wheelPool(wheel, seedOf(player.row), content());
  const left = prizesLeft(pool);
  const stakes = dayStakes(wheel, content());
  return {
    texts,
    // The games on the screen: the Wheel turning, the ticket into the drum.
    show: tuning().show,
    // Talia Systemu's tab "Karty" (cards.js), where the game has it on.
    cards: cardsOn() && Boolean(content().cards),
    lottery: await lotteryView(db, player.row, now),
    wheel: {
      name: tuned.name,
      step: tuned.step,
      none: tuned.none,
      tiers: tuned.tiers.map(({ id, name, count }) => ({ id, name, count })),
      stakes,
      odds: stakes.map((one) => wheelOdds(one, stakes, content())),
      stake,
      endsAt: casinoDay(now, content()).endsAt,
      prizes: pool.prizes.map((prize, index) => prizeView(prize, pool.won.includes(index), bonuses)),
      left: left.length,
      itemLeft: left.some((index) => pool.prizes[index].kind === 'item'),
      bagFree: bagFree(player, now),
      // Today's free spin, at the lowest stake's chances, not used yet.
      free: wheel.free !== true,
    },
  };
}

// What the Salon answers with: itself, with the Wheel at the stake asked
// for (stakeOf), and the character, as they are now.
async function respond(context, session, asked, extra = {}, player = null) {
  const db = context.env.DB;
  const now = context.now;
  const current = player ?? (await loadPlayer(db, session.userId));
  const stored = settlementOf(current.row);
  const wheel = wheelOf(current, stored, now);
  await keepWheel(db, current.row, stored, wheel);
  return json({ ...extra, casino: await casinoView(db, current, stored, wheel, stakeOf(wheel, asked), now), character: characterView(current, now) });
}

// GET /api/settlement/casino?stake=N: the Salon Gier for the page, with the
// Wheel at the stake N (the lowest when N is not one of the day's).
export async function getCasino(context) {
  const { session, player } = await requirePlayer(context);
  requireOpen(player.row);
  return respond(context, session, Number(new URL(context.request.url).searchParams.get('stake')), {}, player);
}

// POST /api/settlement/casino/ticket { stake }: today's ticket of the
// Loteria, one a day, for its price, which goes to the pot (`stake` is only
// the Wheel's shown, for the answer). The relation with Szczęsny grows with
// it. Also while the character is away, as a mug at the Karczma. Never for a
// day already drawn (a ticket bought as midnight strikes).
export async function buyTicket(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const asked = await readJson(context.request).then(
    (body) => body?.stake,
    () => null,
  );
  const db = context.env.DB;
  const day = casinoDay(context.now, content()).key;
  const has = await db.prepare('SELECT 1 AS ok FROM lottery_tickets WHERE day = ? AND character_id = ?').bind(day, row.id).first();
  const block = ticketBlock({ gold: row.gold, has: Boolean(has) }, content());
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
  return respond(context, session, asked, { ticket: { day, gold: lottery.ticket } });
}

// POST /api/settlement/casino/spin { stake } or { free: true }: the Wheel at
// one of the day's stakes, at its chances. The stake goes whatever comes; a
// win takes one of the pool's prizes left: an item to the bag, as one from
// the Wymiana, materials, as bought ones the Encyklopedia leaves out, or the
// camp's resources. Once a day the Wheel spins free, at the lowest stake's
// chances (a player via the author, 12.11.2026); the day's Wheel keeps that
// it was used. Also while the character is away: the bag stays at hand, as
// at the Targowisko.
export async function spinCasinoWheel(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const now = context.now;
  const stored = settlementOf(row);
  const wheel = wheelOf(player, stored, now);
  const stakes = dayStakes(wheel, content());
  const free = body?.free === true;
  const stake = free ? stakes[0] : body?.stake;
  // What the spin costs: nothing when free.
  const cost = free ? 0 : stake;
  const pool = wheelPool(wheel, seedOf(row), content());
  const left = prizesLeft(pool);
  const itemLeft = left.some((index) => pool.prizes[index].kind === 'item');
  const block = spinBlock(stake, { gold: row.gold, stakes, left: left.length, itemLeft, bagFree: bagFree(player, now), free, used: wheel.free === true }, content());
  if (block) throw new ApiError(block.code === 'invalid_stake' ? 400 : 409, block.code, block.message);
  // The spin's own seed, which nobody knows before it.
  const result = spinWheel(pool, wheelOdds(stake, stakes, content()), newSeed());
  const prize = result.win ? pool.prizes[result.prize] : null;
  const spun = result.win ? wheelWon(wheel, result.prize) : wheel;
  const next = { ...stored, casino: free ? { ...spun, free: true } : spun };
  const db = context.env.DB;
  const statements = [assertion(db, '(SELECT version FROM characters WHERE id = ?) = ? AND (SELECT gold FROM characters WHERE id = ?) >= ?', [row.id, row.version, row.id, cost])];
  if (prize?.kind === 'material') {
    const materials = counted('materials', { [prize.key]: prize.count });
    const others = foreign({ material: { [prize.key]: prize.count } });
    statements.push(
      db
        .prepare(`UPDATE characters SET gold = gold - ?, materials = ${materials.sql}, foreign_stacks = ${others.sql}, settlement = ?, version = version + 1 WHERE id = ?`)
        .bind(cost, ...materials.binds, ...others.binds, JSON.stringify(next), row.id),
    );
  } else if (prize?.kind === 'resource') {
    statements.push(
      db
        .prepare('UPDATE characters SET gold = gold - ?, resources = json_set(resources, ?, COALESCE(json_extract(resources, ?), 0) + ?), settlement = ?, version = version + 1 WHERE id = ?')
        .bind(cost, `$.${prize.key}`, `$.${prize.key}`, prize.count, JSON.stringify(next), row.id),
    );
  } else {
    statements.push(db.prepare('UPDATE characters SET gold = gold - ?, settlement = ?, version = version + 1 WHERE id = ?').bind(cost, JSON.stringify(next), row.id));
    if (prize) statements.push(db.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, ?)').bind(row.id, JSON.stringify({ ...prize.item, traded: 1 }), now));
  }
  await atomically(db, statements, changed);
  const bonuses = bonusesOf(player, stored, now);
  return respond(context, session, free ? body?.stake : stake, { spin: { stake, free, win: result.win, tier: result.tier, prize: prize && prizeView(prize, true, bonuses) } });
}

// The draw of each day gone by with tickets, at the minute's cron, so at
// Polish midnight (src/server/index.js): see drawLottery.
export async function drawLotteries(db, now) {
  const today = casinoDay(now, content()).key;
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
// the gold, the Globalny gets the System's message in Polish and the
// English channel the same in English (922 A), and the day's tickets go. All of it or nothing, and only while the day is not drawn yet and its
// tickets are the ones counted here; otherwise the next minute tries again.
async function drawLottery(db, day, now) {
  const { results: tickets } = await db
    .prepare('SELECT t.character_id, c.name, c.appearance FROM lottery_tickets t JOIN characters c ON c.id = t.character_id WHERE t.day = ? ORDER BY t.character_id')
    .bind(day)
    .all();
  if (tickets.length === 0) return null;
  const seed = newSeed();
  const winner = tickets[lotteryWinner(tickets.length, seed)];
  const pot = lotteryPot(tickets.length, content());
  // Each channel's message in the channel's own language, whatever the
  // language of the minute that draws it.
  const channels = content().chat.channels;
  const said = [{ channel: channels[0].id, language: 'pl' }, ...channels.filter((one) => one.language && one.language !== 'pl').map((one) => ({ channel: one.id, language: one.language }))].map(
    (one) => ({ channel: one.channel, text: runInLanguage(one.language, () => announcement({ ...winner, pot })) }),
  );
  const text = said[0].text;
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
      ...said.map(({ channel, text: words }) =>
        db
          .prepare(
            `INSERT INTO chat_messages (channel, user_id, character_id, name, level, class_id, text, created_at, system)
             SELECT ?, user_id, id, name, level, class_id, ?, ?, 1 FROM characters WHERE id = ?`,
          )
          .bind(channel, words, now, winner.character_id),
      ),
      db.prepare('DELETE FROM lottery_tickets WHERE day = ?').bind(day),
    ]);
  } catch (error) {
    if (raced(error)) return null;
    throw error;
  }
  return { day, tickets: tickets.length, pot, characterId: winner.character_id, text };
}

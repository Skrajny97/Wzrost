// Znaki Gildii i Kram (1202 A; data/guilds.json `stall`; the engine's
// guild-stall.js has the rules; DECISIONS.md, "Znaki Gildii i Kram"): each
// point of Sława a member brings its guild gives it a Znak Gildii at once,
// counted as the members' ranking counts its Sława (guild-members.js), the
// character's own, as that Sława is. The weeks whose members' Sława is
// written are credited in the same batch (guild_marks.earned, from
// memberFameFreeze); the week going on (and the one before while it waits
// to be written) is counted from the sources each time. The Znaki stay with
// the character after it leaves its guild, but only a member buys in the
// Kram Gildii: a pack of cards, a Zwój ochronny, an item of its class for
// the slot it chooses, the title "Strażnik Sztandaru" (an achievement's
// title, achievements.js) and the Ramka Sztandaru (a frame of the Sklep
// Systemu, cosmetics.js), each with its limit a week, the last two once.
// A purchase holds only while the character, its Znaki and its purchases
// of the week are as read (atomic.js), so a double tap buys once.

import { bagCapacity, campLevels, gearKey, itemName, marksLeft, questPeriod, stallBlock, stallGood, stallGoods, stallItem, stallSlots, titleOf } from '../engine/index.js';
import { assertion, atomically, characterChanged, sameVersion } from './atomic.js';
import { featGains } from './achievements.js';
import { bagPlaces, characterView, equippedItems, loadPlayer } from './characters.js';
import { content } from './content.js';
import { toHex } from './encoding.js';
import { chronicle } from './guild-chronicle.js';
import { memberFame } from './guild-members.js';
import { guildPlayer } from './guild-trials.js';
import { ApiError, json, readJson } from './http.js';
import { numberText } from './i18n.js';

const words = () => content().guilds.stall.texts;
const errors = () => words().errors;
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (whole, name) => String(vars[name] ?? whole));

// The week around `now` and the one before it.
function weeksAround(now) {
  const current = questPeriod('weekly', now, content());
  return { current, previous: questPeriod('weekly', current.startsAt - 1, content()) };
}

// The errors of the Kram with the Społeczność's lock of the Próby (the
// same words) and its own "only for members".
const playerTexts = () => ({ ...content().guilds.trials.texts.errors, noGuild: errors().no_guild });

// A character's Znaki: those credited and spent, the version of its row of
// them, and those of the weeks whose members' Sława is not written yet,
// counted live from the sources as the members' ranking counts them (the
// week of `now`, and the one before while it waits), in whatever guild it
// brought them. All read in one batch, so a week written meanwhile is
// counted once.
export async function marksOf(db, characterId, now) {
  const { current, previous } = weeksAround(now);
  const weekStatements = (week) => memberFame(week).map(({ sql, binds }) => db.prepare(`SELECT COALESCE(SUM(points), 0) AS points FROM (${sql}) WHERE character_id = ?`).bind(...binds, characterId));
  const [stored, frozen, ...parts] = await db.batch([
    db.prepare('SELECT earned, spent, version FROM guild_marks WHERE character_id = ?').bind(characterId),
    db.prepare('SELECT 1 AS done FROM guild_member_fame_weeks WHERE week = ?').bind(previous.key),
    ...weekStatements(current),
    ...weekStatements(previous),
  ]);
  const half = parts.length / 2;
  const sum = (results) => results.reduce((total, result) => total + (result.results[0]?.points ?? 0), 0);
  const live = sum(parts.slice(0, half)) + (frozen.results[0] ? 0 : sum(parts.slice(half)));
  const row = stored.results[0] ?? { earned: 0, spent: 0, version: 0 };
  return { earned: row.earned, spent: row.spent, version: row.version, live, left: marksLeft({ earned: row.earned, live, spent: row.spent }) };
}

// How many of each good the character bought: this week of a good with a
// weekly limit, ever of one bought once.
async function boughtOf(db, characterId, now) {
  const { current } = weeksAround(now);
  const { results } = await db
    .prepare('SELECT good, SUM(CASE WHEN week = ? THEN 1 ELSE 0 END) AS week, COUNT(*) AS ever FROM guild_stall_buys WHERE character_id = ? GROUP BY good')
    .bind(current.key, characterId)
    .all();
  const rows = new Map(results.map((row) => [row.good, row]));
  return Object.fromEntries(stallGoods(content()).map((good) => [good.id, (good.weekly ? rows.get(good.id)?.week : rows.get(good.id)?.ever) ?? 0]));
}

// Whether the character has the title or the frame a good gives already,
// however it got it.
function ownedGood(row, good) {
  if (good.achievement) return Boolean(JSON.parse(row.achievements ?? '{}')[good.achievement]);
  if (good.cosmetic) {
    const owned = JSON.parse(row.cosmetics ?? '{}').owned;
    return Array.isArray(owned) && owned.includes(good.cosmetic);
  }
  return false;
}

// The title a good gives, for the character's look.
function goodTitle(row, good) {
  const achievement = content().achievements.groups.flatMap((group) => group.list).find((one) => one.id === good.achievement);
  return achievement ? titleOf(achievement, row.appearance) : '';
}

// "50 Znaków".
const marksText = (count) => {
  const [one, few, many] = words().markForms;
  const last = count % 10;
  const tens = count % 100;
  const form = count === 1 ? one : last >= 2 && last <= 4 && (tens < 12 || tens > 14) ? few : many;
  return `${numberText(count)} ${form}`;
};

// The Kram for the page: whether the character is a member, its Znaki,
// each good with its price, its limit and how many of it were bought, and
// why it cannot be bought now; the slots an item may be for, each with
// what the character wears there; the end of the week; the words.
async function stallView(db, player, guild, now) {
  const { row } = player;
  const [marks, bought] = await Promise.all([marksOf(db, row.id, now), boughtOf(db, row.id, now)]);
  const key = gearKey(row.class_id, row.evolution, content());
  const texts = words();
  const worn = new Map(equippedItems(player).map((item) => [item.equippedSlot, item]));
  const bagFull = bagPlaces(player) >= bagCapacity(campLevels(player.buildings, now, content()), content());
  const goods = stallGoods(content()).map((good) => {
    const owned = ownedGood(row, good);
    // The item's slot is chosen later: any one of them for now.
    const block = stallBlock({ id: good.id, slot: good.id === 'item' ? stallSlots(key, content())[0] : undefined, marks: marks.left, bought: bought[good.id], owned, key }, content());
    const title = good.achievement ? goodTitle(row, good) : '';
    return {
      id: good.id,
      name: filled(texts.goods[good.id].name, { title }),
      description: texts.goods[good.id].description,
      price: good.price,
      priceText: marksText(good.price),
      weekly: good.weekly ?? null,
      bought: bought[good.id],
      owned,
      block: !guild ? 'no_guild' : block ?? (good.id === 'item' && bagFull ? 'bag_full' : null),
      missing: Math.max(0, good.price - marks.left),
    };
  });
  return {
    member: Boolean(guild),
    marks: { left: marks.left, earned: marks.earned, live: marks.live, spent: marks.spent, version: marks.version },
    goods,
    slots: stallSlots(key, content()).map((id) => {
      const item = worn.get(id);
      return { id, name: content().slotsById[id].name, worn: item ? { name: itemName(item, content()), rarity: item.rarity, color: content().raritiesById[item.rarity]?.color ?? null } : null };
    }),
    weekEndsAt: weeksAround(now).current.endsAt,
    texts: {
      title: texts.title,
      lead: texts.lead,
      balance: texts.balance,
      growing: texts.growing,
      markForms: texts.markForms,
      weekly: texts.weekly,
      once: texts.once,
      owned: texts.owned,
      buy: texts.buy,
      limitReached: texts.limitReached,
      tooFew: texts.tooFew,
      slotTitle: texts.slotTitle,
      slotLead: texts.slotLead,
      worn: texts.worn,
      empty: texts.empty,
      outside: texts.outside,
      bagFull: errors().bag_full,
      how: texts.how,
    },
  };
}

// GET /api/guild/stall: the Kram (stallView); outside a guild the Znaki and
// the goods, none of them for sale.
export async function getGuildStall(context) {
  const { player, guild, db } = await guildPlayer(context, playerTexts());
  return json({ stall: await stallView(db, player, guild, context.now) });
}

// Why a good cannot be bought, as the game's answer.
function refusal(code, good, marks) {
  const status = { unknown_good: 400, invalid_slot: 400 }[code] ?? 409;
  const text = code === 'too_few_marks' ? filled(errors().too_few_marks, { marks: numberText(marks), price: numberText(good.price) }) : errors()[code];
  return new ApiError(status, code, text);
}

// POST /api/guild/stall/buy { good, slot, seen }: one good of the Kram for
// its Znaki, for a member of a guild, within its limit (a good of once,
// once; one the character has already, not at all), an item for the slot
// chosen and with a place in the bag. `seen`: the version of the Znaki the
// page showed; another answers "changed meanwhile", as the page's Znaki are
// not those of now. The purchase, the Znaki spent and what it gives land in
// one batch that holds only while the character, its Znaki, its membership
// and its purchases of the good are as read: a second tap finds them moved
// and buys nothing.
export async function buyFromGuildStall(context) {
  const { session, player, guild, db } = await guildPlayer(context, playerTexts());
  if (!guild) throw new ApiError(409, 'no_guild', errors().no_guild);
  const { row } = player;
  const now = context.now;
  const body = await readJson(context.request);
  const good = stallGood(body.good, content());
  if (!good) throw refusal('unknown_good');
  const [marks, bought] = await Promise.all([marksOf(db, row.id, now), boughtOf(db, row.id, now)]);
  if (body.seen !== undefined && body.seen !== marks.version) throw characterChanged();
  const key = gearKey(row.class_id, row.evolution, content());
  const owned = ownedGood(row, good);
  const block = stallBlock({ id: good.id, slot: body.slot, marks: marks.left, bought: bought[good.id], owned, key }, content());
  if (block) throw refusal(block, good, marks.left);
  if (good.id === 'item' && bagPlaces(player) >= bagCapacity(campLevels(player.buildings, now, content()), content())) throw refusal('bag_full', good);
  const { current } = weeksAround(now);
  const item = good.id === 'item' ? stallItem({ level: row.level, key, classLevel: row.class_level, slot: body.slot, seed: toHex(crypto.getRandomValues(new Uint8Array(16))) }, content()) : null;
  if (good.id === 'item' && !item) throw refusal('invalid_slot', good);
  const title = good.achievement ? goodTitle(row, good) : '';
  // What the good gives, on the row as read (its version moves with it).
  const gives = [];
  if (good.id === 'pack') gives.push(db.prepare('UPDATE characters SET card_packs = card_packs + 1, version = version + 1 WHERE id = ?').bind(row.id));
  if (good.id === 'ward-scroll') gives.push(db.prepare('UPDATE characters SET scrolls = scrolls + 1, version = version + 1 WHERE id = ?').bind(row.id));
  if (item) {
    gives.push(
      db.prepare('UPDATE characters SET version = version + 1 WHERE id = ?').bind(row.id),
      db.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, ?)').bind(row.id, JSON.stringify(item), now),
    );
  }
  if (good.achievement) {
    // The title's achievement given at once (achievements.js), with its
    // feat, so the title is worn at a tap in the Osiągnięcia.
    const granted = { ...JSON.parse(row.achievements ?? '{}'), [good.achievement]: now };
    gives.push(db.prepare('UPDATE characters SET achievements = ?, version = version + 1 WHERE id = ?').bind(JSON.stringify(granted), row.id), ...featGains(db, row.id, { bannerWarden: 1 }));
    // The Kronika tells the guild (1195 A, guild-chronicle.js), once:
    // "Radomira zostaje Strażniczką Sztandaru."
    gives.push(chronicle(db, guild.id, row.appearance === 'female' ? 'wardenFemale' : 'warden', { name: row.name }, now, { characterId: row.id, once: `warden:${row.id}` }));
  }
  if (good.cosmetic) {
    const cosmetics = JSON.parse(row.cosmetics ?? '{}');
    const list = Array.isArray(cosmetics.owned) ? cosmetics.owned : [];
    gives.push(db.prepare('UPDATE characters SET cosmetics = ?, version = version + 1 WHERE id = ?').bind(JSON.stringify({ ...cosmetics, owned: [...list, good.cosmetic] }), row.id));
  }
  const counted = good.weekly ? ' AND week = ?' : '';
  await atomically(db, [
    sameVersion(db, row),
    assertion(db, 'EXISTS (SELECT 1 FROM guild_members WHERE character_id = ?)', [row.id]),
    assertion(db, 'COALESCE((SELECT version FROM guild_marks WHERE character_id = ?), 0) = ?', [row.id, marks.version]),
    assertion(db, `(SELECT COUNT(*) FROM guild_stall_buys WHERE character_id = ? AND good = ?${counted}) = ?`, [row.id, good.id, ...(good.weekly ? [current.key] : []), bought[good.id]]),
    db.prepare('INSERT INTO guild_stall_buys (character_id, week, good, price, slot, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(row.id, current.key, good.id, good.price, item ? body.slot : null, now),
    db
      .prepare('INSERT INTO guild_marks (character_id, spent, version) VALUES (?, ?, 1) ON CONFLICT (character_id) DO UPDATE SET spent = spent + excluded.spent, version = version + 1')
      .bind(row.id, good.price),
    ...gives,
  ]);
  const after = await loadPlayer(db, session.userId);
  // The item came last, so its id is the highest of the character's.
  const itemId = item && Math.max(...after.items.map((one) => one.id));
  return json({
    bought: {
      good: good.id,
      text: filled(words().bought[good.id], { item: item ? itemName(item, content()) : '', title }),
      ...(item && { item: { id: itemId, name: itemName(item, content()), rarity: item.rarity, color: content().raritiesById[item.rarity]?.color ?? null } }),
    },
    stall: await stallView(db, after, guild, now),
    character: characterView(after, now),
  });
}

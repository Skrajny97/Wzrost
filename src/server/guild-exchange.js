// The Wymiana in the Gildia (data/guilds.json `exchange`; DECISIONS.md,
// "Wymiana zasobów w Gildii"; the author: "Dodatkowa funkcja w Gildii ->
// wymiana zasobów. Można wystawić, że chce się wymienić x kamienia na x
// drewna i odwrotnie, każdy zasób na inny."): a member offers pieces of one
// camp resource for pieces of another, 1 to `most` on each side, both
// counts its own (with `sameCount`, the same). The pieces given leave its
// resources at once and wait in the offer. Another member of the guild
// takes the whole offer ("Wymień"): it pays the pieces wanted and gets those
// given, and the poster gets the pieces wanted. Up to `offers` open offers
// a member, each hanging up to `openHours`. The poster withdraws an open
// offer whenever it likes, and the pieces set aside come back; they come
// back too when its time is up (settled the next time the poster opens or
// uses the Wymiana or the Gildia page) and when it leaves its guild or is
// removed from it (guildRemoval, guilds.js), so no guild ends with pieces
// in an offer. Characters of one account never exchange with each other,
// as in the Prośby (177 A). The camp's resources, and gold on one side of
// an offer, never both (4.11.2026, the author: "Daj też mozliwość wymiany i
// wystawiania ofert w Gildii zasoby za złoto"): gold given is set aside and
// comes back as the pieces do. No items or goods of the bag. Both sides
// exchange from the players' Wymiana's level (community.json
// trade.minLevel; the author's 826 A: „Wymiana w Gildii od 20. poziomu
// postaci po obu stronach, jak Wymiana między graczami”): a character
// below it posts and takes nothing, and the offers it posted before the
// rule show to no one, wait for their time and give their pieces back.
//
// Every change runs as one batch: the pieces back counted from the offers
// still open before they close, and a take only with an assertion at its
// head that the offer is open and the taker has the pieces, so two takers
// at once make one exchange and no piece is lost or made twice.

import { countedForm, questPeriod } from '../engine/index.js';
import { assertion, atomically } from './atomic.js';
import { characterView, loadPlayer, walletOf } from './characters.js';
import { content } from './content.js';
import { nameColorOf } from './cosmetics.js';
import { guildPlayer, requireMember } from './guild-trials.js';
import { ApiError, json, readJson } from './http.js';
import { numberText } from './i18n.js';

const rules = () => content().guilds.exchange;
const words = () => rules().texts;
const errors = () => words().errors;
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
const HOUR = 3600000;
const path = (id) => `$."${id}"`;
const resourceIds = () => content().resources.map((resource) => resource.id);
// Gold, one side of an offer at most, kept in the characters' `gold`.
const GOLD = 'gold';
const isGold = (id) => id === GOLD;
const goodIds = () => [...resourceIds(), GOLD];
const goodName = (id) => (isGold(id) ? rules().gold.name : (content().resourcesById[id]?.name ?? id));
const genitiveOf = (id) => (isGold(id) ? rules().gold.genitive : content().resourcesById[id].genitive);
const mostOf = (id) => (isGold(id) ? rules().gold.most : rules().most);
const changed = () => new ApiError(409, 'changed', errors().changed);
const member = (context) => requireMember(context, errors());
// The character level both sides exchange from: the players' Wymiana's (826 A).
const minLevel = () => content().community.trade.minLevel;

// An open offer whose poster is no longer in its guild (never, as leaving
// returns the pieces at once; settled all the same).
const STALE = 'NOT EXISTS (SELECT 1 FROM guild_members m WHERE m.character_id = guild_offers.character_id AND m.guild_id = guild_offers.guild_id)';

// One side of an offer as the page shows it: the resource, its name and the
// pieces; "Kamień × 50" in the answers' words, never broken before the
// count.
const side = (resource, count) => ({ resource, name: goodName(resource), count });
const sideText = ({ name, count }) => `${name} × ${count}`;
const stateOf = (offer, now) => (offer.state === 'open' && offer.ends_at <= now ? 'expired' : offer.state);

// The statements that close the open offers `where` picks (SQL on
// guild_offers with its `binds`) by `set` (SQL setting the state and
// closed_at, with its `binds`) and give their posters the pieces and the
// gold set aside: first those, counted from the offers still open, then the
// offers closed, so in one batch a piece comes back once, and an offer
// closed meanwhile gives nothing.
function closing(db, where, set) {
  const back = (id) =>
    `(SELECT COALESCE(SUM(give_count), 0) FROM guild_offers WHERE guild_offers.character_id = characters.id AND state = 'open' AND give = '${id}' AND (${where.sql}))`;
  const resources = resourceIds().reduce((sql, id) => `json_set(${sql}, '${path(id)}', COALESCE(json_extract(resources, '${path(id)}'), 0) + ${back(id)})`, 'resources');
  return [
    db
      .prepare(
        `UPDATE characters SET resources = ${resources}, gold = gold + ${back(GOLD)}, version = version + 1
         WHERE id IN (SELECT character_id FROM guild_offers WHERE state = 'open' AND (${where.sql}))`,
      )
      .bind(...resourceIds().flatMap(() => where.binds), ...where.binds, ...where.binds),
    db.prepare(`UPDATE guild_offers SET ${set.sql} WHERE state = 'open' AND (${where.sql})`).bind(...set.binds, ...where.binds),
  ];
}

// The statements that close the open offers of characters leaving their
// guilds (`characters`: SQL for their ids, with `binds`) as withdrawn, the
// pieces back to them (guildRemoval, guilds.js).
export const offersReturned = (db, characters, binds, now) =>
  closing(db, { sql: `character_id IN (${characters})`, binds }, { sql: "state = 'withdrawn', closed_at = ?", binds: [now] });

// The character's open offers whose time is up closed as expired, and any
// left in a guild it is no longer in as withdrawn, with their pieces back:
// lazily, as the poster opens or uses the Wymiana or the Gildia page.
// Whether there were any.
export async function settleOffers(db, characterId, now) {
  const where = { sql: `character_id = ? AND (ends_at <= ? OR ${STALE})`, binds: [characterId, now] };
  const due = await db.prepare(`SELECT 1 AS due FROM guild_offers WHERE state = 'open' AND ${where.sql} LIMIT 1`).bind(...where.binds).first();
  if (!due) return false;
  await db.batch(
    closing(db, where, {
      sql: "state = CASE WHEN ends_at <= ? THEN 'expired' ELSE 'withdrawn' END, closed_at = CASE WHEN ends_at <= ? THEN ends_at ELSE ? END",
      binds: [now, now, now],
    }),
  );
  return true;
}

// The card's words, with the rules' numbers filled in (all but the
// answers' errors).
function cardTexts() {
  const { most, gold, offers, openHours, sameCount } = rules();
  const { errors: _, ...texts } = words();
  const vars = {
    most,
    goldMost: numberText(gold.most),
    counts: sameCount ? texts.countsSame : texts.countsFree,
    offers: `${offers} ${countedForm(offers, texts.offerForms)}`,
    open: `${openHours} ${countedForm(openHours, texts.hourForms)}`,
    level: minLevel(),
  };
  return { ...texts, how: texts.how.map((line) => filled(line, vars)), full: filled(texts.full, vars), level: filled(texts.level, vars) };
}

// The character's own level for posting and taking (826 A), as the
// players' Wymiana checks it (requireTradeLevel, trades.js).
function requireExchangeLevel(row) {
  if (row.level < minLevel()) throw new ApiError(403, 'exchange_level', cardTexts().level);
}

// The character's resources, freshly read (the view after a change).
const resourcesOf = (row) => {
  const { gold: _, ...resources } = walletOf(row);
  return resources;
};

// What the character holds of a side's good: pieces of a resource, or gold.
const holding = (row, id) => walletOf(row)[id] ?? 0;

// The Wymiana for the page: the guild's open offers of posters at the
// level (each with its poster, what it gives and wants, and whether this
// character can take it: not its own, not of its account, and the pieces
// or the gold wanted held), this character's own offers in the guild (the
// open ones and its last `closedShown` closed, a taken one with its taker),
// whether it is below the level to post and take (`locked`, 826 A), its
// resources and gold, the rules and the words.
async function exchangeView(db, player, guild, now) {
  const { row } = player;
  const { most, gold, offers, openHours, sameCount, closedShown } = rules();
  const [open, mine] = await db.batch([
    db
      .prepare(
        `SELECT o.*, c.name, c.class_id, c.user_id, c.cosmetics FROM guild_offers o
         JOIN characters c ON c.id = o.character_id
         JOIN guild_members m ON m.character_id = o.character_id AND m.guild_id = o.guild_id
         WHERE o.guild_id = ? AND o.state = 'open' AND o.ends_at > ? AND c.level >= ? ORDER BY o.created_at, o.id`,
      )
      .bind(guild.id, now, minLevel()),
    db
      .prepare(
        `SELECT o.*, t.name AS taker_name, t.class_id AS taker_class FROM guild_offers o LEFT JOIN characters t ON t.id = o.taker_id
         WHERE o.character_id = ? AND o.guild_id = ?
           AND (o.state = 'open' OR o.id IN (SELECT id FROM guild_offers WHERE character_id = ? AND guild_id = ? AND state != 'open' ORDER BY closed_at DESC, id DESC LIMIT ?))
         ORDER BY o.state = 'open' DESC, COALESCE(o.closed_at, o.created_at) DESC, o.id DESC`,
      )
      .bind(row.id, guild.id, row.id, guild.id, closedShown),
  ]);
  const resources = resourcesOf(row);
  const offerView = (offer) => ({ id: offer.id, give: side(offer.give, offer.give_count), want: side(offer.want, offer.want_count), endsAt: offer.ends_at });
  return {
    guild: { name: guild.name, tag: guild.tag },
    offers: open.results.map((offer) => {
      const own = offer.character_id === row.id;
      const sameAccount = !own && offer.user_id === row.user_id;
      const have = holding(row, offer.want);
      return {
        ...offerView(offer),
        poster: { id: offer.character_id, name: offer.name, classId: offer.class_id, nameColor: nameColorOf(offer.cosmetics) },
        own,
        sameAccount,
        have,
        missing: Math.max(0, offer.want_count - have),
        canTake: !own && !sameAccount && have >= offer.want_count,
      };
    }),
    mine: mine.results.map((offer) => ({
      ...offerView(offer),
      state: stateOf(offer, now),
      closedAt: offer.closed_at,
      taker: offer.state === 'taken' ? { name: offer.taker_name, classId: offer.taker_class } : null,
    })),
    open: mine.results.filter((offer) => offer.state === 'open').length,
    locked: row.level < minLevel(),
    resources,
    gold: row.gold,
    rules: { most, offers, openHours, sameCount, resources: resourceIds(), gold: { id: GOLD, name: gold.name, most: gold.most } },
    texts: cardTexts(),
  };
}

const answer = async (db, player, guild, now, extra = {}) => json({ ...(await exchangeView(db, player, guild, now)), ...extra });

// The character as it is after its offers were settled: reloaded, with
// its view for the answer, when pieces came back.
async function settledPlayer(found, now) {
  if (!(await settleOffers(found.db, found.player.row.id, now))) return { player: found.player, extra: {} };
  const player = await loadPlayer(found.db, found.session.userId);
  return { player, extra: { character: characterView(player, now) } };
}

// GET /api/guild/exchange: outside a guild, only the card's words (as the
// Prośby Gildii's).
export async function getGuildExchange(context) {
  const found = await guildPlayer(context, errors());
  const { player, extra } = await settledPlayer(found, context.now);
  if (!found.guild) return json({ guild: null, texts: cardTexts(), ...extra });
  return answer(found.db, player, found.guild, context.now, extra);
}

// A side of an offer from a request: a resource of the camp and 1 to `most`
// pieces of it, or 1 to gold.most gold.
function sideOf(value) {
  if (!value || typeof value !== 'object' || !goodIds().includes(value.resource)) throw new ApiError(400, 'invalid_resource', errors().invalidResource);
  const most = mostOf(value.resource);
  if (!Number.isInteger(value.count) || value.count < 1 || value.count > most) {
    throw new ApiError(400, 'invalid_count', isGold(value.resource) ? filled(errors().invalidGold, { most: numberText(most) }) : filled(errors().invalidCount, { most }));
  }
  return side(value.resource, value.count);
}

// "Masz tylko 30 drewna." / "Nie masz złota.": the pieces of a resource or
// the gold held, short of what is needed.
const heldOnly = (resource, have) =>
  have > 0 ? filled(errors().notEnough, { have, genitive: genitiveOf(resource) }) : filled(errors().notHeld, { genitive: genitiveOf(resource) });

// SQL for what a character holds of a good, with its binds: the `gold`
// column or the resource in `resources`, in the character's own row
// (`own`), or read by its id (`heldSql`, for an assertion).
const own = (id) => (isGold(id) ? { sql: 'gold', binds: [] } : { sql: 'COALESCE(json_extract(resources, ?), 0)', binds: [path(id)] });
const heldSql = (id, characterId) =>
  isGold(id) ? { sql: '(SELECT gold FROM characters WHERE id = ?)', binds: [characterId] } : { sql: 'COALESCE((SELECT json_extract(resources, ?) FROM characters WHERE id = ?), 0)', binds: [path(id), characterId] };

// The SET clause and binds that add each [good, count] of `changes` to a
// character (a negative count takes): the resources in one json_set, the
// gold in the column.
function adding(changes) {
  const gold = changes.filter(([id]) => isGold(id)).reduce((sum, [, count]) => sum + count, 0);
  const pieces = changes.filter(([id]) => !isGold(id));
  const parts = [];
  const binds = [];
  if (pieces.length > 0) {
    parts.push(`resources = json_set(resources, ${pieces.map(() => '?, COALESCE(json_extract(resources, ?), 0) + ?').join(', ')})`);
    for (const [id, count] of pieces) binds.push(path(id), path(id), count);
  }
  if (changes.some(([id]) => isGold(id))) {
    parts.push('gold = gold + ?');
    binds.push(gold);
  }
  return { sql: parts.join(', '), binds };
}

// POST /api/guild/exchange { give: { resource, count }, want: { resource,
// count } }: the character offers pieces of one resource for pieces of
// another, or for gold, or gold for a resource ('gold' as the resource);
// what it gives leaves it at once, by a statement that takes it only while
// it holds it, and the offer hangs for `openHours`. Up to `offers` open offers. Its offers whose time is up
// close first, their pieces back. The offers of every guild closed before
// last week began, which no card or ranking needs any more, go. Only from
// the level (826 A).
export async function postGuildOffer(context) {
  const found = await member(context);
  requireExchangeLevel(found.player.row);
  const { guild, db } = found;
  const now = context.now;
  const body = await readJson(context.request);
  const { offers, openHours, sameCount } = rules();
  const give = sideOf(body.give);
  const want = sideOf(body.want);
  if (give.resource === want.resource) throw new ApiError(400, 'same_resource', errors().sameResource);
  if (sameCount && give.count !== want.count) throw new ApiError(400, 'same_count', errors().sameCount);
  const { player } = await settledPlayer(found, now);
  const { row } = player;
  const open = await db.prepare("SELECT COUNT(*) AS count FROM guild_offers WHERE character_id = ? AND state = 'open'").bind(row.id).first();
  if (open.count >= offers) throw new ApiError(409, 'too_many', cardTexts().full);
  const have = holding(row, give.resource);
  if (have < give.count) throw new ApiError(409, 'not_enough', heldOnly(give.resource, have));
  const lastWeek = questPeriod('weekly', questPeriod('weekly', now, content()).startsAt - 1, content());
  const held = heldSql(give.resource, row.id);
  const taken = adding([[give.resource, -give.count]]);
  const results = await atomically(
    db,
    [
      db.prepare("DELETE FROM guild_offers WHERE state != 'open' AND closed_at < ?").bind(lastWeek.startsAt),
      assertion(
        db,
        `${held.sql} >= ?
         AND (SELECT COUNT(*) FROM guild_offers WHERE character_id = ? AND state = 'open') < ?
         AND EXISTS (SELECT 1 FROM guild_members WHERE character_id = ? AND guild_id = ?)`,
        [...held.binds, give.count, row.id, offers, row.id, guild.id],
      ),
      db.prepare(`UPDATE characters SET ${taken.sql}, version = version + 1 WHERE id = ? AND ${own(give.resource).sql} >= ?`).bind(...taken.binds, row.id, ...own(give.resource).binds, give.count),
      db
        .prepare('INSERT INTO guild_offers (guild_id, character_id, give, give_count, want, want_count, created_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(guild.id, row.id, give.resource, give.count, want.resource, want.count, now, now + openHours * HOUR),
    ],
    changed,
  );
  if (results[2].meta.changes !== 1 || results[3].meta.changes !== 1) throw changed();
  const after = await loadPlayer(db, found.session.userId);
  return answer(db, after, guild, now, { text: filled(words().posted, { give: sideText(give), want: sideText(want) }), character: characterView(after, now) });
}

// The offer a request names, in the guild of the one who asks.
async function offerOf(db, guild, body) {
  const offer = Number.isInteger(body.offerId) ? await db.prepare('SELECT * FROM guild_offers WHERE id = ?').bind(body.offerId).first() : null;
  if (!offer || offer.guild_id !== guild.id) throw new ApiError(404, 'no_offer', errors().noOffer);
  return offer;
}

// POST /api/guild/exchange/withdraw { offerId }: the poster takes its open
// offer back, and the pieces set aside come back.
export async function withdrawGuildOffer(context) {
  const found = await member(context);
  const { guild, db } = found;
  const now = context.now;
  const body = await readJson(context.request);
  await settledPlayer(found, now);
  const offer = await offerOf(db, guild, body);
  if (offer.character_id !== found.player.row.id) throw new ApiError(403, 'not_own', errors().notOwn);
  const [, closed] = await db.batch(closing(db, { sql: 'id = ? AND character_id = ?', binds: [offer.id, offer.character_id] }, { sql: "state = 'withdrawn', closed_at = ?", binds: [now] }));
  if (closed.meta.changes !== 1) throw new ApiError(409, 'closed', errors().closed);
  const after = await loadPlayer(db, found.session.userId);
  return answer(db, after, guild, now, { text: filled(words().withdrawn, { give: sideText(side(offer.give, offer.give_count)) }), character: characterView(after, now) });
}

// POST /api/guild/exchange/take { offerId }: another member of the guild
// takes the whole offer: it pays the pieces or the gold wanted and gets
// what is given, and the poster gets what it wanted, in one batch that
// holds only while the offer is open, unexpired and in the taker's guild,
// both are members and the taker has what is wanted. Both from the level
// (826 A): an offer posted below it, before the rule, is not taken.
export async function takeGuildOffer(context) {
  const found = await member(context);
  requireExchangeLevel(found.player.row);
  const { guild, db } = found;
  const now = context.now;
  const body = await readJson(context.request);
  const { player } = await settledPlayer(found, now);
  const { row } = player;
  const offer = await offerOf(db, guild, body);
  if (offer.character_id === row.id) throw new ApiError(400, 'own', errors().own);
  if (stateOf(offer, now) !== 'open') throw new ApiError(409, 'closed', errors().closed);
  const poster = await db.prepare('SELECT name, user_id, level FROM characters WHERE id = ?').bind(offer.character_id).first();
  if (!poster) throw new ApiError(409, 'closed', errors().closed);
  if (poster.user_id === row.user_id) throw new ApiError(409, 'same_account', errors().sameAccount);
  if (poster.level < minLevel()) throw new ApiError(409, 'exchange_level_other', filled(errors().levelOther, { name: poster.name, level: minLevel() }));
  const have = holding(row, offer.want);
  if (have < offer.want_count) {
    throw new ApiError(409, 'not_enough', filled(errors().short, { missing: offer.want_count - have, genitive: genitiveOf(offer.want) }));
  }
  const held = heldSql(offer.want, row.id);
  const takerGets = adding([
    [offer.want, -offer.want_count],
    [offer.give, offer.give_count],
  ]);
  const posterGets = adding([[offer.want, offer.want_count]]);
  let results;
  try {
    results = await atomically(
      db,
      [
        assertion(
          db,
          `EXISTS (SELECT 1 FROM guild_offers WHERE id = ? AND state = 'open' AND ends_at > ? AND guild_id = ?)
           AND EXISTS (SELECT 1 FROM guild_members WHERE character_id = ? AND guild_id = ?)
           AND EXISTS (SELECT 1 FROM guild_members WHERE character_id = ? AND guild_id = ?)
           AND ${held.sql} >= ?`,
          [offer.id, now, guild.id, row.id, guild.id, offer.character_id, guild.id, ...held.binds, offer.want_count],
        ),
        db
          .prepare("UPDATE guild_offers SET state = 'taken', taker_id = ?, closed_at = ? WHERE id = ? AND state = 'open' AND ends_at > ?")
          .bind(row.id, now, offer.id, now),
        db.prepare(`UPDATE characters SET ${takerGets.sql}, version = version + 1 WHERE id = ?`).bind(...takerGets.binds, row.id),
        db.prepare(`UPDATE characters SET ${posterGets.sql}, version = version + 1 WHERE id = ?`).bind(...posterGets.binds, offer.character_id),
      ],
      changed,
    );
  } catch (error) {
    // Another taker first, or the poster's withdrawal: the offer is closed.
    if (error instanceof ApiError && error.code === 'changed') {
      const current = await db.prepare('SELECT state FROM guild_offers WHERE id = ?').bind(offer.id).first();
      if (current?.state !== 'open') throw new ApiError(409, 'closed', errors().closed);
    }
    throw error;
  }
  if (results[1].meta.changes !== 1) throw changed();
  const after = await loadPlayer(db, found.session.userId);
  return answer(db, after, guild, now, {
    text: filled(words().took, { name: poster.name, give: sideText(side(offer.give, offer.give_count)), want: sideText(side(offer.want, offer.want_count)) }),
    character: characterView(after, now),
  });
}

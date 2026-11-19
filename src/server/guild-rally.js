// The Róg zbiórki (1199 A, accepted by the author on the review page on
// 19.11.2026; data/guilds.json `rally`; src/engine/guild-strike.js has the
// rules; DECISIONS.md, "Róg zbiórki"): the leader or a deputy sets the
// hour of the guild's rally, at once or at a full hour up to a day ahead,
// one rally a Polish day (the day it starts on). When it starts every
// member's phone gets a notification (rallyNotices, from the minute's cron
// in push.js) and the Kronika writes its line in the guild's chat
// (announceRallies, the cron, or the first look after the start, whichever
// comes first). For its hour the members' attacks on the Bestia and on the
// Wyprawa's strażnik hit harder (guild-strike.js), and the card shows who
// came: who attacked in that hour. Who misses it loses nothing, as the
// attacks stay for the rest of the day. A rally not started yet can be
// called off by the leader or a deputy. Each save holds only while the one
// who asks still leads the guild (atomic.js); the day's one rally is kept
// by the table's unique key, so of two taps at once one sets it.

import { isUnlocked, rallyDay, rallySlots, rallyStartAllowed, rallyState } from '../engine/index.js';
import { assertion, atomically, raced } from './atomic.js';
import { requirePlayer } from './characters.js';
import { content } from './content.js';
import { chronicle, hourText } from './guild-chronicle.js';
import { guildOf } from './guilds.js';
import { ApiError, json, readJson } from './http.js';
import { accountLanguage, runInLanguage } from './i18n.js';

const HOUR = 3600000;
const DAY = 24 * HOUR;
const rules = () => content().guilds.rally;
const words = () => rules().texts;
const errors = () => words().errors;
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
const percentOf = (power) => Math.round((power - 1) * 100);
const leads = (guild) => guild?.role === 'leader' || guild?.role === 'deputy';
const LEADING = "role IN ('leader', 'deputy')";

// The rallies of a guild still worth a look at `now`: those not ended a
// day ago, the earliest first.
const ralliesOf = (db, guildId, now) =>
  db
    .prepare('SELECT r.*, c.name AS set_by_name FROM guild_rallies r LEFT JOIN characters c ON c.id = r.set_by AND c.created_at <= r.created_at WHERE r.guild_id = ? AND r.ends_at > ? ORDER BY r.starts_at')
    .bind(guildId, now - DAY);

// Whether the guild's rally is on at `now` (guild-strike.js).
export async function rallyOn(db, guildId, now) {
  const row = await db.prepare('SELECT id FROM guild_rallies WHERE guild_id = ? AND starts_at <= ? AND ends_at > ? LIMIT 1').bind(guildId, now, now).first();
  return Boolean(row);
}

// Who came to a rally: who of the guild attacked its Bestia or the
// Wyprawa's strażnik during it, in the order they first did.
async function cameTo(db, rally) {
  const { results } = await db
    .prepare(
      `SELECT c.name, MIN(x.created_at) AS first FROM (
         SELECT h.character_id, h.created_at FROM guild_beast_hits h JOIN guild_beasts b ON b.id = h.beast_id
         WHERE b.guild_id = ? AND h.created_at >= ? AND h.created_at < ?
         UNION ALL
         SELECT h.character_id, h.created_at FROM guild_expedition_hits h
         JOIN guild_expedition_guardians g ON g.id = h.guardian_id JOIN guild_expeditions e ON e.id = g.expedition_id
         WHERE e.guild_id = ? AND h.created_at >= ? AND h.created_at < ?
       ) x JOIN characters c ON c.id = x.character_id AND c.created_at <= x.created_at
       GROUP BY x.character_id ORDER BY first, c.name`,
    )
    .bind(rally.guild_id, rally.starts_at, rally.ends_at, rally.guild_id, rally.starts_at, rally.ends_at)
    .all();
  return results.map((one) => one.name);
}

// The statement that writes the Kronika's line of a rally's start, once.
const rallyLine = (db, rally, now) =>
  chronicle(db, rally.guild_id, 'rally', { until: rally.ends_at, percent: percentOf(rules().power) }, now, {
    characterId: rally.set_by,
    once: `rally:${rally.id}`,
  });

// A rally's start told: its line in the chat and the row marked, once,
// whoever comes first (the cron or a look).
async function announce(db, rally, now) {
  if (rally.announced_at !== null) return;
  await db.batch([db.prepare('UPDATE guild_rallies SET announced_at = ? WHERE id = ? AND announced_at IS NULL').bind(now, rally.id), rallyLine(db, rally, now)]);
}

// The cron (index.js), every minute: the rallies on and not told yet get
// their line; one that ended untold (the cron stopped meanwhile) gets none,
// as its words would be late.
export async function announceRallies(db, now) {
  const { results } = await db.prepare('SELECT * FROM guild_rallies WHERE announced_at IS NULL AND starts_at <= ? AND ends_at > ?').bind(now, now).all();
  for (const rally of results) await announce(db, rally, now);
}

// The phone notifications of the rallies that started after `from` up to
// `to` (push.js): to every member of the guild whose played character it
// is and whose player has a phone signed up, in the language of the
// player's account. Map of user id → [{ tag, url, at, title, body }].
export async function rallyNotices(db, from, to) {
  const { results } = await db
    .prepare(
      `SELECT r.id, r.guild_id, r.starts_at, r.ends_at, g.name AS guild_name, c.user_id, (SELECT u.language FROM users u WHERE u.id = c.user_id) AS language
       FROM guild_rallies r JOIN guilds g ON g.id = r.guild_id
       JOIN guild_members m ON m.guild_id = r.guild_id JOIN characters c ON c.id = m.character_id
       WHERE r.starts_at > ? AND r.starts_at <= ? AND c.role = 'player'
         AND c.user_id IN (SELECT user_id FROM push_subscriptions WHERE gone_at IS NULL)
       ORDER BY r.starts_at, c.user_id`,
    )
    .bind(from, to)
    .all();
  const due = new Map();
  for (const row of results) {
    const notice = runInLanguage(accountLanguage(row.language), () => ({
      // A newer rally of the guild takes the place of an older one.
      tag: `rally-${row.guild_id}`,
      url: '#/gildia/beast',
      at: row.starts_at,
      title: filled(words().pushTitle, { guild: row.guild_name }),
      body: filled(words().pushBody, { hour: hourText(row.ends_at), percent: percentOf(rules().power) }),
    }));
    due.set(row.user_id, [...(due.get(row.user_id) ?? []), notice]);
  }
  return due;
}

// The card's words, with the rules' numbers filled in (all but the
// answers' errors).
function cardTexts() {
  const { errors: _, ...texts } = words();
  const numbers = { percent: percentOf(rules().power), minutes: rules().minutes };
  return { ...texts, lead: filled(texts.lead, numbers), onBonus: filled(texts.onBonus, numbers), how: texts.how.map((line) => filled(line, numbers)) };
}

// A rally as the card shows it.
const rallyCard = (rally, now, came) => ({
  id: rally.id,
  state: rallyState({ startsAt: rally.starts_at, endsAt: rally.ends_at }, now),
  startsAt: rally.starts_at,
  endsAt: rally.ends_at,
  day: rally.day,
  setBy: rally.set_by_name ?? null,
  ...(came && { came }),
});

// The Róg zbiórki for the cards of the Bestia and the Wyprawa: the rally
// on now, else the next one set (`current`), the one of today that ended
// (`ended`), each with who came once it started; whether the character may
// set and call off rallies (the leader and the deputies), and when a new
// one may start (rallySlots: at once or at a full hour up to a day ahead,
// not on a day with its rally); today's day key, the bonus and the words.
// A rally that started and is not told yet in the chat is told now.
export async function rallyView(db, guild, now) {
  const { results } = await ralliesOf(db, guild.id, now).all();
  for (const rally of results) if (rally.starts_at <= now && now < rally.ends_at && rally.announced_at === null) await announce(db, rally, now);
  const today = rallyDay(now, content());
  const on = results.find((rally) => rally.starts_at <= now && now < rally.ends_at);
  const next = results.find((rally) => rally.starts_at > now);
  const current = on ?? next ?? null;
  const ended = results.filter((rally) => rally.ends_at <= now && rally.day === today && rally !== current).at(-1) ?? null;
  const canSet = leads(guild);
  return {
    current: current && rallyCard(current, now, current === on ? await cameTo(db, current) : null),
    ended: ended && rallyCard(ended, now, await cameTo(db, ended)),
    canSet,
    slots: canSet ? rallySlots(now, results.map((rally) => rally.day), content()) : [],
    today,
    percent: percentOf(rules().power),
    minutes: rules().minutes,
    texts: cardTexts(),
  };
}

// A member of a guild with the Społeczność, as the Bestia asks.
async function rallyPlayer(context) {
  const { player } = await requirePlayer(context);
  if (!isUnlocked('community', player.row.level, content())) {
    throw new ApiError(403, 'locked', filled(errors().locked, { level: content().unlocksById.community.level }));
  }
  const db = context.env.DB;
  const guild = await guildOf(db, player.row.id);
  if (!guild) throw new ApiError(409, 'no_guild', errors().noGuild);
  if (!leads(guild)) throw new ApiError(403, 'not_allowed', errors().notLeader);
  return { player, guild, db };
}

// The answer of the rally's actions: the Róg zbiórki anew and the words.
async function answer(db, guild, now, text) {
  return json({ rally: await rallyView(db, guild, now), text });
}

// POST /api/guild/rally { at }: the leader or a deputy sets the guild's
// rally: `at` "now" or a full hour after now, at most aheadHours ahead
// (rallyStartAllowed), on a day without its rally. Saved only while the
// one who asks still leads the guild; the day's rally once (the unique
// key). A rally set to start at once is told in the chat at once.
export async function setGuildRally(context) {
  const { player, guild, db } = await rallyPlayer(context);
  const now = context.now;
  const body = await readJson(context.request);
  if (!rallyStartAllowed(body.at, now, content())) throw new ApiError(400, 'bad_hour', errors().badHour);
  const startsAt = body.at === 'now' ? now : body.at;
  const endsAt = startsAt + rules().minutes * 60000;
  const day = rallyDay(startsAt, content());
  let saved;
  try {
    [, saved] = await db.batch([
      // The rallies that ended two days ago, of every guild, go.
      db.prepare('DELETE FROM guild_rallies WHERE ends_at < ?').bind(now - 2 * DAY),
      db
        .prepare(
          `INSERT INTO guild_rallies (guild_id, day, starts_at, ends_at, set_by, created_at)
           SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM guild_members WHERE character_id = ? AND guild_id = ? AND ${LEADING})`,
        )
        .bind(guild.id, day, startsAt, endsAt, player.row.id, now, player.row.id, guild.id),
    ]);
  } catch (error) {
    if (/UNIQUE constraint failed: guild_rallies/i.test(String(error?.message ?? error))) throw new ApiError(409, 'day_taken', errors().dayTaken);
    throw error;
  }
  if (saved.meta.changes !== 1) throw new ApiError(409, 'guild_changed', errors().changed);
  const words = cardTexts();
  if (body.at === 'now') {
    const rally = await db.prepare('SELECT * FROM guild_rallies WHERE guild_id = ? AND day = ?').bind(guild.id, day).first();
    if (rally) await announce(db, rally, now);
    return answer(db, guild, now, filled(words.setNow, { hour: hourText(endsAt) }));
  }
  const when = day === rallyDay(now, content()) ? words.today : words.tomorrow;
  return answer(db, guild, now, filled(words.setDone, { day: when, hour: hourText(startsAt) }));
}

// POST /api/guild/rally/cancel { id }: the leader or a deputy calls off a
// rally of the guild not started yet. Saved only while it has not started
// and the one who asks still leads the guild.
export async function cancelGuildRally(context) {
  const { player, guild, db } = await rallyPlayer(context);
  const now = context.now;
  const body = await readJson(context.request);
  const id = Number.isInteger(body.id) ? body.id : 0;
  const rally = await db.prepare('SELECT * FROM guild_rallies WHERE id = ? AND guild_id = ?').bind(id, guild.id).first();
  if (!rally) throw new ApiError(404, 'gone', errors().gone);
  if (rally.starts_at <= now) throw new ApiError(409, 'started', errors().started);
  try {
    await atomically(
      db,
      [
        assertion(db, `EXISTS (SELECT 1 FROM guild_members WHERE character_id = ? AND guild_id = ? AND ${LEADING})`, [player.row.id, guild.id]),
        assertion(db, 'EXISTS (SELECT 1 FROM guild_rallies WHERE id = ? AND starts_at > ?)', [rally.id, now]),
        db.prepare('DELETE FROM guild_rallies WHERE id = ? AND starts_at > ?').bind(rally.id, now),
      ],
      () => new ApiError(409, 'guild_changed', errors().changed),
    );
  } catch (error) {
    if (!raced(error) && !(error instanceof ApiError)) throw error;
    // Gone or started meanwhile: say which.
    const after = await db.prepare('SELECT starts_at FROM guild_rallies WHERE id = ?').bind(rally.id).first();
    if (!after) throw new ApiError(404, 'gone', errors().gone);
    if (after.starts_at <= now) throw new ApiError(409, 'started', errors().started);
    throw error;
  }
  return answer(db, guild, now, words().canceled);
}

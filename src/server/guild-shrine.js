// The Kącina: opiekun tygodnia (the author's 1201 A, accepted on the review
// page on 19.11.2026; the engine's guild-shrine.js has the rules,
// data/guilds.json `shrine` the gods and the words; DECISIONS.md, "Kącina:
// opiekun tygodnia (1201 A, 19.11.2026)"): a Slavic shrine in every
// guild's Siedziba, from the start, with no levels. Each week three gods are
// offered and each member votes once, until Sunday's end, for one of them
// (guild_shrine_votes); the vote of a week is counted once as the next one
// starts (guild_patrons, patronOf): at the first look at the guild's
// Siedziba, at what waits in the guild (guild-todo.js, asked about once a
// minute by every member's page) or as the cron draws the guild's board of
// the Próby, which takes half of its trials from the winner's domain that
// week (guild-trials.js). The patron gives every member its effects the
// whole week, as a week of the year's: the character's row brings the
// latest patron of its guild (guildPatronSql, loaded in characters.js) and
// weekFor (weeks.js) adds its effects while its week lasts, so an
// exploration and a profession's work keep them from their start and the
// Kowadło takes them at the upgrade; a character that leaves its guild has
// none from then on. A guild gone takes its votes and patrons along
// (guildRemoval, guilds.js).

import { godBonusText, offeredGods, patronWinner, questPeriod, shrineGod, voteCounts } from '../engine/index.js';
import { assertion, atomically } from './atomic.js';
import { content } from './content.js';
import { guildPlayer, requireMember } from './guild-trials.js';
import { ApiError, json, readJson } from './http.js';

const rules = () => content().guilds.shrine;
const words = () => rules().texts;
const errors = () => words().errors;
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
const changed = () => new ApiError(409, 'changed', errors().changed);

// The week around `now` and the one before it.
function weeksAround(now) {
  const current = questPeriod('weekly', now, content());
  return { current, previous: questPeriod('weekly', current.startsAt - 1, content()) };
}

// SQL for the latest patron counted for the guild of the character whose
// id `column` holds, as JSON ({ week, god }, god null for a week without
// one), or null outside a guild: loaded with the character
// (characters.js), whose week effects take it while its week lasts.
export const guildPatronSql = (column) =>
  `(SELECT json_object('week', p.week, 'god', p.god_id)
    FROM guild_members m JOIN guild_patrons p ON p.guild_id = m.guild_id WHERE m.character_id = ${column} ORDER BY p.week DESC LIMIT 1)`;

// The statement of the guild's patron of the week at `now`, as counted.
const patronRow = (db, guildId, week) => db.prepare('SELECT god_id FROM guild_patrons WHERE guild_id = ? AND week = ?').bind(guildId, week);

// The patron of the guild for the week at `now` (a god's id, or null for a
// week without one), the vote of the week before counted first when this
// week has none yet: the most votes; in a tie the leader's god, else the one
// that reached as many first (patronWinner). Of two requests at once the
// first one's stays. Counting a week takes the votes and the patrons of the
// weeks before the last one away, of every guild. `kept`: the row of this
// week already read (todo).
export async function patronOf(db, guildId, now, kept = undefined) {
  const { current, previous } = weeksAround(now);
  const found = kept === undefined ? await patronRow(db, guildId, current.key).first() : kept;
  if (found) return found.god_id ?? null;
  const [votes, leader] = await db.batch([
    db.prepare('SELECT character_id, god_id, voted_at FROM guild_shrine_votes WHERE guild_id = ? AND week = ?').bind(guildId, previous.key),
    db.prepare("SELECT character_id FROM guild_members WHERE guild_id = ? AND role = 'leader'").bind(guildId),
  ]);
  const list = votes.results.map((vote) => ({ characterId: vote.character_id, god: vote.god_id, at: vote.voted_at }));
  const winner = patronWinner(list, leader.results[0]?.character_id ?? null, offeredGods(previous.key, content()));
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO guild_patrons (guild_id, week, god_id, settled_at) VALUES (?, ?, ?, ?)').bind(guildId, current.key, winner, now),
    db.prepare('DELETE FROM guild_shrine_votes WHERE week < ?').bind(previous.key),
    db.prepare('DELETE FROM guild_patrons WHERE week < ?').bind(previous.key),
  ]);
  const stored = await patronRow(db, guildId, current.key).first();
  return stored?.god_id ?? null;
}

// A god as the page shows it: its name, who it is, what it gives (short,
// "+5% XP z walk") and its domain in the Próby.
function godView(id) {
  const god = shrineGod(id, content());
  return { id: god.id, name: god.name, genitive: god.genitive, title: god.title, bonus: godBonusText(god, content()), domain: god.domainText };
}

// The patron of a week's board of the Próby (its trials of the domain carry
// the god, drawTrialBoard), as the Próby's card shows it on top of the
// board: the god and the line about its half; null on a board without one.
export function boardPatron(trials) {
  const id = trials.find((trial) => trial.god)?.god;
  const god = id ? shrineGod(id, content()) : null;
  return god ? { id: god.id, name: god.name, text: filled(words().board, { god: god.genitive }) } : null;
}

// The card's words, with the numbers filled in (all but the errors).
function cardTexts() {
  const { errors: _, ...texts } = words();
  return texts;
}

// The Kącina for the page: the patron of this week (or none), and this
// week's vote for the next one: the gods offered, each with its votes and
// the names of those who gave them, the character's own vote, the god that
// would win now and whether the top is tied; the end of the week and the
// words.
async function shrineView(db, player, guild, now) {
  const { current } = weeksAround(now);
  const patron = await patronOf(db, guild.id, now);
  const offered = offeredGods(current.key, content());
  const [votes, leader] = await db.batch([
    db
      .prepare(
        `SELECT v.character_id, v.god_id, v.voted_at, c.name FROM guild_shrine_votes v LEFT JOIN characters c ON c.id = v.character_id
         WHERE v.guild_id = ? AND v.week = ? ORDER BY v.voted_at, v.character_id`,
      )
      .bind(guild.id, current.key),
    db.prepare("SELECT character_id FROM guild_members WHERE guild_id = ? AND role = 'leader'").bind(guild.id),
  ]);
  const list = votes.results.map((vote) => ({ characterId: vote.character_id, god: vote.god_id, at: vote.voted_at, name: vote.name }));
  const counts = voteCounts(list, offered);
  const most = Math.max(0, ...offered.map((id) => counts.get(id).count));
  const mine = list.find((vote) => vote.characterId === player.row.id)?.god ?? null;
  return {
    guild: { name: guild.name, tag: guild.tag },
    shrine: { id: rules().id, name: rules().name },
    patron: patron && shrineGod(patron, content()) ? godView(patron) : null,
    week: current.key,
    endsAt: current.endsAt,
    vote: {
      gods: offered.map((id) => ({
        ...godView(id),
        votes: counts.get(id).count,
        voters: list.filter((vote) => vote.god === id && vote.name).map((vote) => vote.name),
        mine: mine === id,
      })),
      mine,
      leading: patronWinner(list, leader.results[0]?.character_id ?? null, offered),
      tied: most > 0 && offered.filter((id) => counts.get(id).count === most).length > 1,
    },
    texts: cardTexts(),
  };
}

// GET /api/guild/shrine: outside a guild, only the card's words (as the
// Siedziba's).
export async function getGuildShrine(context) {
  const { player, guild, db } = await guildPlayer(context, errors());
  if (!guild) return json({ guild: null, texts: cardTexts() });
  return json(await shrineView(db, player, guild, context.now));
}

// POST /api/guild/shrine/vote { god, week }: the member's one vote of the
// week for one of the gods offered, saved only while it is in the guild; a
// page of a week gone (`week`) gets the usual answer that something changed.
// The vote stays to the week's end. A second tap for the same god answers
// as the first; for another god, that the vote has been cast.
export async function voteAtShrine(context) {
  const { player, guild, db } = await requireMember(context, errors());
  const body = await readJson(context.request);
  const now = context.now;
  const { current } = weeksAround(now);
  if (typeof body.god !== 'string' || !shrineGod(body.god, content())) throw new ApiError(400, 'invalid_god', errors().noGod);
  if (body.week !== undefined && body.week !== current.key) throw changed();
  if (!offeredGods(current.key, content()).includes(body.god)) throw new ApiError(409, 'not_offered', errors().noGod);
  const { row } = player;
  try {
    await atomically(
      db,
      [
        assertion(db, 'EXISTS (SELECT 1 FROM guild_members WHERE character_id = ? AND guild_id = ?)', [row.id, guild.id]),
        db.prepare('INSERT INTO guild_shrine_votes (guild_id, week, character_id, god_id, voted_at) VALUES (?, ?, ?, ?, ?)').bind(guild.id, current.key, row.id, body.god, now),
      ],
      changed,
    );
  } catch (error) {
    if (!/UNIQUE|PRIMARY/.test(String(error?.message ?? error))) throw error;
    const cast = await db.prepare('SELECT god_id FROM guild_shrine_votes WHERE guild_id = ? AND week = ? AND character_id = ?').bind(guild.id, current.key, row.id).first();
    const god = shrineGod(cast?.god_id, content());
    if (cast?.god_id !== body.god) throw new ApiError(409, 'voted', filled(errors().voted, { god: god?.name ?? '' }));
  }
  return json({ ...(await shrineView(db, player, guild, now)), text: filled(words().voted, { god: shrineGod(body.god, content()).name }) });
}

// Whether the character's vote of this week waits (the yellow dot on the
// Siedziba's tab, guild-todo.js), the guild's patron of this week counted
// first if it has not been yet: so the week's patron comes with the first
// look of any member in the new week.
export async function shrineTodo(db, row, guildId, now) {
  const { current } = weeksAround(now);
  const [vote, patron] = await db.batch([
    db.prepare('SELECT 1 AS cast FROM guild_shrine_votes WHERE guild_id = ? AND week = ? AND character_id = ?').bind(guildId, current.key, row.id),
    patronRow(db, guildId, current.key),
  ]);
  await patronOf(db, guildId, now, patron.results[0] ?? null);
  return vote.results.length === 0;
}

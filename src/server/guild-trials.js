// The Próby Gildii (the author's 345 A; the engine's guild-trials.js has the
// rules, data/guilds.json `trials` the numbers and the words; DECISIONS.md,
// "Próby i Prośby Gildii" and "Próby Gildii co dzień, wszystkie naraz"): the
// guild's board of the week, drawn by the cron when the week starts (from
// Monday, midnight in Poland, as the weekly quests) or at the first look,
// with the members active then counted; each trial open on it, a few on
// Monday and more each day (615 A), runs for every member at once from the
// moment it opens, with nothing to take (617), as a row of its own made
// when it opens, when a member joins or at the member's look; the bar of
// the guild's finished trials with its thresholds; and their chests, once a
// week and threshold for each character that finished a trial in the guild
// that week, claimed that week or the next. What an action brings to the
// character's trial is saved in the action's own batch (trialProgress), so
// it lands only with the action. No line in the guild's chat: the chat has
// no System lines, as for the Bestia Gildii. Where Talia Systemu is on, each
// trial finished may leave a card, given at the next look (903,
// trialCards).

import {
  campBonus,
  campLevels,
  casinoDay,
  countedForm,
  drawTrialBoard,
  isUnlocked,
  materialsText,
  materialView,
  questPeriod,
  trialChest,
  trialCount,
  trialDay,
  trialDayLimit,
  trialGains,
  trialOpensOn,
  trialKind,
  trialLock,
  trialNote,
  trialPoints,
  trialsOpen,
  trialText,
  trialThresholds,
} from '../engine/index.js';
import { atomically, sameVersion } from './atomic.js';
import { cardGameOf, cardsHere, cardUpserts, keyedSeed, sourceCards } from './cards.js';
import { characterView, engineCharacter, loadPlayer, questContext, requirePlayer } from './characters.js';
import { content } from './content.js';
import { craftingOn, professionsOn, settlementOn } from './features.js';
import { guildOf } from './guilds.js';
import { ApiError, json, readJson } from './http.js';
import { counted } from './market.js';
import { trialFame } from './fame.js';
import { say } from '../engine/text.js';

const rules = () => content().guilds.trials;
const words = () => rules().texts;
const errors = () => words().errors;
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
const DAY = 24 * 3600000;

// A character with the Społeczność, with its guild or null; `texts` gives
// the errors' words (also for the Prośby Gildii, guild-requests.js).
export async function guildPlayer(context, texts = errors()) {
  const { session, player } = await requirePlayer(context);
  if (!isUnlocked('community', player.row.level, content())) {
    throw new ApiError(403, 'locked', filled(texts.locked, { level: content().unlocksById.community.level }));
  }
  const db = context.env.DB;
  return { session, player, guild: await guildOf(db, player.row.id), db };
}

// A member of a guild, with the Społeczność.
export async function requireMember(context, texts = errors()) {
  const found = await guildPlayer(context, texts);
  if (!found.guild) throw new ApiError(409, 'no_guild', texts.noGuild);
  return found;
}

// The week around `now` and the one before it.
function weeksAround(now) {
  const current = questPeriod('weekly', now, content());
  return { current, previous: questPeriod('weekly', current.startsAt - 1, content()) };
}

// A guild's bar of `week` for the character (barView), as its chests are
// opened: this week's counted to the day's limit, the claims of the week
// whatever the guild. Null when the guild had no board that week. The
// board and the trials stay when a guild ends (0114), so a guild gone has
// its bar too.
async function barOf(db, guildId, week, player, now) {
  const { current } = weeksAround(now);
  const [board, trials, claims] = await db.batch([
    boardRow(db, guildId, week),
    weekTrials(db, guildId, [week]),
    db.prepare('SELECT week, threshold FROM guild_trial_chests WHERE character_id = ? AND week = ?').bind(player.row.id, week),
  ]);
  if (!board.results[0]) return null;
  const limit = week === current.key ? barLimit(JSON.parse(board.results[0].trials), trialDay(now, content())) : Infinity;
  return barView(week, trials.results, board.results[0].active, board.results[0].joined ?? 0, claims.results, player, limit);
}

// The chests the character may still open from the guilds it finished a
// trial in this week or the last one, other than `guildId` (the one it is
// in now, whose bar and `previous` show its own): a guild it left or was
// removed from, or one that ended (DECISIONS.md, "Próby i Prośby Gildii"
// 7: a chest for each character that finished a trial in that guild that
// week; the code review, 0.2.72: they were lost). Each bar with its
// guild's name and tag (null for a guild gone) and whether it is this
// week's, which waits until the end of the next.
async function chestsElsewhere(db, player, guildId, now) {
  const { current, previous } = weeksAround(now);
  const { results } = await db
    .prepare(
      `SELECT DISTINCT t.guild_id, t.week, g.name, g.tag FROM guild_trials t LEFT JOIN guilds g ON g.id = t.guild_id
       WHERE t.character_id = ? AND t.week IN (?, ?) AND t.state = 'done' AND t.guild_id IS NOT ? ORDER BY t.week, t.guild_id`,
    )
    .bind(player.row.id, previous.key, current.key, guildId)
    .all();
  const bars = [];
  for (const one of results) {
    const bar = await barOf(db, one.guild_id, one.week, player, now);
    if (bar?.thresholds.some((threshold) => threshold.ready)) {
      bars.push({ ...bar, guild: one.name ? { name: one.name, tag: one.tag } : null, thisWeek: one.week === current.key });
    }
  }
  return bars;
}

// The statement that moves the character's trial of the week on by what an
// action brought (trialGains in the engine), to put into that action's own
// batch, so both land together; none when the action brings nothing a
// trial counts. Only the trial taken this week in the guild the character
// is in now moves; one whose count is reached is done, and what came over
// its count is kept (`extra`), so orders taken off the Stół rozbiórki's
// queue take back exactly theirs (cancelOrders in crafting.js). `guard` ({
// sql, binds }) holds only with the action's own change, for a batch with
// no assertion at its head, so two taps at once move the trial on once.
export function trialProgress(db, characterId, progress, now, guard = null) {
  const gains = Object.entries(trialGains(progress));
  if (gains.length === 0) return [];
  const { key: week } = questPeriod('weekly', now, content());
  const gain = `(CASE kind ${gains.map(() => 'WHEN ? THEN ?').join(' ')} ELSE 0 END)`;
  const binds = gains.flat();
  return [
    db
      .prepare(
        `UPDATE guild_trials SET progress = MIN(count, progress + ${gain}),
           extra = extra + MAX(0, progress + ${gain} - count),
           state = CASE WHEN progress + ${gain} >= count THEN 'done' ELSE state END,
           done_at = CASE WHEN progress + ${gain} >= count THEN ? ELSE done_at END
         WHERE character_id = ? AND week = ? AND state = 'active' AND kind IN (${gains.map(() => '?').join(', ')})
           AND guild_id = (SELECT guild_id FROM guild_members WHERE character_id = ?)${guard ? ` AND ${guard.sql}` : ''}`,
      )
      .bind(...binds, ...binds, ...binds, ...binds, now, characterId, week, ...gains.map(([kind]) => kind), characterId, ...(guard?.binds ?? [])),
    // The Punkty Sławy of the trials done, each once (fame.js).
    ...trialFame(db, characterId, week),
  ];
}

// The character's trials of the Stół rozbiórki's work in the weeks the
// orders leaving its queue were made in, in its guild now (where
// trialProgress moved them), as trialAfterCancel in the engine takes them.
export async function tableTrials(db, characterId, weeks) {
  if (weeks.length === 0) return [];
  const { results } = await db
    .prepare(
      `SELECT id, kind, week, count, progress, extra, state, taken_at, done_at FROM guild_trials
       WHERE character_id = ? AND kind IN ('process', 'salvage') AND week IN (${weeks.map(() => '?').join(', ')})
         AND guild_id = (SELECT guild_id FROM guild_members WHERE character_id = ?)`,
    )
    .bind(characterId, ...weeks, characterId)
    .all();
  return results.map(({ taken_at: takenAt, done_at: doneAt, ...row }) => ({ ...row, takenAt, doneAt }));
}

// The statement that keeps a trial as trialAfterCancel left it.
export const trialTakenBack = (db, row, next) =>
  db.prepare('UPDATE guild_trials SET progress = ?, extra = ?, state = ?, done_at = ? WHERE id = ?').bind(next.progress, next.extra, next.state, next.doneAt, row.id);

// The guard of trialProgress for what an activity of some length brings (an
// exploration, a gathering, a brewing): only a trial taken by the time it
// really began (`begun` in its options, which a "Przewiń" leaves as it was)
// moves on, as a trial's progress counts from its taking; none for an
// activity begun before it was kept.
export const takenBefore = (begun) => (Number.isFinite(begun) ? { sql: 'taken_at <= ?', binds: [begun] } : null);

// What the character has of the parts of the game the trials need
// (trialLock): true, false while it has not reached them, "off" where this
// deployment has them not.
function trialAccess(player, now) {
  const quests = questContext(player, now);
  return {
    towers: isUnlocked('towers', player.row.level, content()),
    professions: professionsOn() ? quests.hasProfessions : 'off',
    crafting: craftingOn() ? quests.hasCrafting : 'off',
    table: quests.hasTable,
    settlement: settlementOn() ? quests.hasSettlement : 'off',
    anvil: campBonus(campLevels(player.buildings, now, content()), 'upgradeCap', content()) > 0,
  };
}

const boardRow = (db, guildId, week) => db.prepare('SELECT trials, active, joined, opened FROM guild_trial_boards WHERE guild_id = ? AND week = ?').bind(guildId, week);

// The guild's board of the week: the one kept, or one drawn now from the
// guild and the week, with the members whose accounts were in the game in
// the last activeDays days counted, at least one, and the shares of those
// who joined since (joined; the author's 615 A). The ids of the members it
// counts are kept with it (`counted`), so one of them who leaves and joins
// again this week adds no second share (acceptGuildInvite in guilds.js). Of
// two requests at once, the first one's stays. A new board takes the
// boards, trials and chests of the weeks before the last one away, of every
// guild: nothing of them shows or opens any more (as the Bestia Gildii's
// beasts).
async function boardOf(db, guildId, now) {
  const { current, previous } = weeksAround(now);
  let row = await boardRow(db, guildId, current.key).first();
  if (!row) {
    await db.batch([
      db.prepare('DELETE FROM guild_trials WHERE week < ?').bind(previous.key),
      db.prepare('DELETE FROM guild_trial_boards WHERE week < ?').bind(previous.key),
      db.prepare('DELETE FROM guild_trial_chests WHERE week < ?').bind(previous.key),
      db
        .prepare(
          `INSERT OR IGNORE INTO guild_trial_boards (guild_id, week, trials, active, counted, created_at)
           SELECT ?, ?, ?, MAX(1, COUNT(*)), json_group_array(m.character_id), ?
           FROM guild_members m JOIN characters c ON c.id = m.character_id JOIN users u ON u.id = c.user_id
           WHERE m.guild_id = ? AND u.seen_at >= ?`,
        )
        .bind(guildId, current.key, JSON.stringify(drawTrialBoard(`${guildId}:${current.key}`, content())), now, guildId, now - rules().activeDays * DAY),
    ]);
    row = await boardRow(db, guildId, current.key).first();
  }
  return { trials: JSON.parse(row.trials), active: row.active, joined: row.joined ?? 0, opened: row.opened ?? 0 };
}

// The moment the trial at `index` of the week's board opens: the start of
// its day of the week on the quests' clock (noon of that day, then back to
// its midnight, right on the days of 23 and 25 hours too).
function trialOpening(index, now) {
  const { current } = weeksAround(now);
  return questPeriod('daily', current.startsAt + trialOpensOn(index, content()) * DAY + DAY / 2, content()).startsAt;
}

// The rows of the board's trials at `indices` for `members` ({ id, level,
// classLevel, joinedAt }): each runs from the trial's opening, or from the
// member's joining when that came later, and asks the count for the
// member's level now. A row there already stays as it is. In statements of
// at most ROWS rows, for D1's limit of bound values in one.
const ROWS = 14;
function trialRows(db, guildId, week, trials, members, indices, now) {
  const rows = [];
  for (const index of indices) {
    const trial = trials[index];
    if (!trial || !trialKind(trial.kind, content())) continue;
    const opening = trialOpening(index, now);
    for (const member of members) rows.push([guildId, week, member.id, index, trial.kind, trialCount(trial, member, content()), Math.max(opening, member.joinedAt ?? 0)]);
  }
  const statements = [];
  for (let start = 0; start < rows.length; start += ROWS) {
    const chunk = rows.slice(start, start + ROWS);
    statements.push(
      db
        .prepare(`INSERT OR IGNORE INTO guild_trials (guild_id, week, character_id, trial, kind, count, taken_at) VALUES ${chunk.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ')}`)
        .bind(...chunk.flat()),
    );
  }
  return statements;
}

const indicesBetween = (from, to) => Array.from({ length: Math.max(0, to - from) }, (_, offset) => from + offset);

// The guild's members as trialRows needs them.
const membersOf = async (db, guildId) =>
  (
    await db
      .prepare('SELECT m.character_id AS id, m.joined_at AS joinedAt, c.level, c.class_level AS classLevel FROM guild_members m JOIN characters c ON c.id = m.character_id WHERE m.guild_id = ?')
      .bind(guildId)
      .all()
  ).results;

// The trials opened on the board since its rows were last made (opened; the
// count of trialsOpen today), for every member of the guild at once (the
// author's 617). Run by the cron as the day starts and at any look.
async function openTrials(db, guildId, board, now) {
  const { key: week } = questPeriod('weekly', now, content());
  const open = trialsOpen(trialDay(now, content()), content());
  if (board.opened >= open) return board;
  const members = await membersOf(db, guildId);
  await db.batch([
    ...trialRows(db, guildId, week, board.trials, members, indicesBetween(board.opened, Math.min(open, board.trials.length)), now),
    db.prepare('UPDATE guild_trial_boards SET opened = MAX(opened, ?) WHERE guild_id = ? AND week = ?').bind(open, guildId, week),
  ]);
  return { ...board, opened: open };
}

// A member's rows of the trials open now that it has not got yet: for one
// who joined after they opened (from its joining), or whose rows a look
// makes before the cron did.
async function ownRows(db, guildId, board, row, now) {
  const { key: week } = questPeriod('weekly', now, content());
  const open = Math.min(board.trials.length, trialsOpen(trialDay(now, content()), content()));
  const [have, membership] = await db.batch([
    db.prepare('SELECT trial FROM guild_trials WHERE guild_id = ? AND week = ? AND character_id = ?').bind(guildId, week, row.id),
    db.prepare('SELECT joined_at FROM guild_members WHERE character_id = ? AND guild_id = ?').bind(row.id, guildId),
  ]);
  const taken = new Set(have.results.map((one) => one.trial));
  const missing = indicesBetween(0, open).filter((index) => !taken.has(index));
  if (missing.length === 0 || !membership.results[0]) return;
  const member = { id: row.id, level: row.level, classLevel: row.class_level, joinedAt: membership.results[0].joined_at };
  await db.batch(trialRows(db, guildId, week, board.trials, [member], missing, now));
}

// A member who has just joined: its rows of the trials open on the guild's
// board, if the board of the week is drawn (else they come with it).
export async function joinGuildTrials(db, guildId, row, now) {
  const { key: week } = questPeriod('weekly', now, content());
  const found = await boardRow(db, guildId, week).first();
  if (!found) return;
  await ownRows(db, guildId, { trials: JSON.parse(found.trials) }, row, now);
}

// The cron's part (src/server/index.js, every minute): the boards of the
// week for the guilds that have none yet, so their trials run from the
// week's start, and the trials of the day opened for every member, a few
// guilds a minute.
export async function openGuildTrials(db, now) {
  const { current } = weeksAround(now);
  const missing = await db
    .prepare('SELECT id FROM guilds g WHERE NOT EXISTS (SELECT 1 FROM guild_trial_boards b WHERE b.guild_id = g.id AND b.week = ?) LIMIT 5')
    .bind(current.key)
    .all();
  for (const { id } of missing.results) await boardOf(db, id, now);
  const open = trialsOpen(trialDay(now, content()), content());
  const due = await db.prepare('SELECT guild_id, trials, active, joined, opened FROM guild_trial_boards WHERE week = ? AND opened < ? LIMIT 10').bind(current.key, open).all();
  for (const board of due.results) await openTrials(db, board.guild_id, { trials: JSON.parse(board.trials), active: board.active, joined: board.joined, opened: board.opened }, now);
}

// The trials of the guild's weeks taken or finished, with their takers'
// names (a character gone leaves its finished ones without a name).
const weekTrials = (db, guildId, weeks) =>
  db
    .prepare(
      `SELECT t.id, t.week, t.character_id, t.trial, t.kind, t.count, t.progress, t.state, c.name, c.class_id
       FROM guild_trials t LEFT JOIN characters c ON c.id = t.character_id
       WHERE t.guild_id = ? AND t.week IN (${weeks.map(() => '?').join(', ')}) AND t.state IN ('active', 'done')
       ORDER BY t.id`,
    )
    .bind(guildId, ...weeks);

// How many trials each member finished, by its id; each trial of a
// character gone counts on its own, so a threshold reached stays reached.
function finishedBy(rows) {
  const counts = new Map();
  for (const row of rows) {
    if (row.state !== 'done') continue;
    const key = row.character_id ?? `gone:${row.id}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

// The day's limit on this week's bar (615 A), for a board drawn under it.
// A board drawn before the change, with fewer trials (the week of 0.1.53),
// counts each member's finished trials up to the cap alone: no bar falls
// and no reached threshold goes away (DECISIONS.md, "Próby Gildii co dzień").
const barLimit = (trials, day) => (trials.length >= rules().board ? trialDayLimit(day, content()) : Infinity);

const chestSeed = (characterId, week, index) => `${characterId}:${week}:trials:${index}`;

// A chest as the page shows it, its materials with their names.
const chestView = (chest) => ({
  gold: chest.gold,
  timePoints: chest.timePoints,
  systemPoints: chest.systemPoints,
  materials: Object.entries(chest.materials).map(([key, count]) => {
    const material = materialView(key, count, content());
    return { key, count, name: material.label.charAt(0).toUpperCase() + material.label.slice(1), rarity: material.rarity, materialId: material.materialId };
  }),
});

// A chest in words: "330 złota, 10 Punktów Czasu, skóra wilka ×2".
function chestText(chest) {
  const texts = words();
  return [
    chest.gold > 0 && filled(texts.gold, { gold: chest.gold }),
    chest.timePoints > 0 && `${chest.timePoints} ${countedForm(chest.timePoints, texts.timePointForms)}`,
    Object.keys(chest.materials).length > 0 && materialsText(chest.materials, content()),
    chest.systemPoints > 0 && `${chest.systemPoints} ${countedForm(chest.systemPoints, texts.systemPointForms)}`,
  ]
    .filter(Boolean)
    .join(', ');
}

// A week's bar for the character: the guild's points (each member's
// finished trials up to the cap and, this week, to the day's limit) against
// the thresholds (the members
// active at the draw and the shares of those who joined since), and each
// threshold's chest for this character, whether it is reached, claimed and
// ready to claim (for one who finished a trial in the guild that week).
function barView(week, rows, active, joined, claims, player, limit = Infinity) {
  const { row } = player;
  const counts = finishedBy(rows);
  const points = trialPoints([...counts.values()], content(), limit);
  const contributed = (counts.get(row.id) ?? 0) > 0;
  const character = engineCharacter(row);
  return {
    week,
    points,
    active,
    joined,
    contributed,
    thresholds: trialThresholds(active + joined, points, content()).map((threshold) => {
      const claimed = claims.some((claim) => claim.week === week && claim.threshold === threshold.index);
      return {
        ...threshold,
        claimed,
        ready: threshold.reached && contributed && !claimed,
        chest: chestView(trialChest(threshold.index, character, chestSeed(row.id, week, threshold.index), content())),
      };
    }),
  };
}

// The card's words, with the rules' numbers filled in (all but the
// answers' errors).
function cardTexts() {
  const { cap, steps, activeDays, opens, perDay } = rules();
  const { errors: _, ...texts } = words();
  const numbers = { thresholds: steps.length, days: activeDays, cap, first: opens?.first, daily: opens?.perDay, perDay, twoDays: perDay * 2, threeDays: perDay * 3 };
  return { ...texts, how: texts.how.map((line) => filled(line, numbers)) };
}

// The Próby Gildii for the page: the trials of the board open today (and
// any this character finished before they would open, on a board drawn
// before the day's pace), each as it runs for this character (its count
// for the character's level when it opened, its progress; done, running or
// locked and why), the day's pace (how many trials are open, how many come
// tomorrow, how many of this character's finished ones the bar counts today
// and how many it counts later), the bar of this week and the chests of the
// last one still waiting for it, who finished how many trials this week,
// and the words. The trials opened since the board's rows were made, and
// this character's missing ones, get their rows first.
export async function trialsView(db, player, guild, now) {
  const { row } = player;
  const { current, previous } = weeksAround(now);
  const board = await openTrials(db, guild.id, await boardOf(db, guild.id, now), now);
  await ownRows(db, guild.id, board, row, now);
  const [trials, before, claims, own] = await db.batch([
    weekTrials(db, guild.id, [current.key, previous.key]),
    boardRow(db, guild.id, previous.key),
    db.prepare('SELECT week, threshold FROM guild_trial_chests WHERE character_id = ? AND week IN (?, ?)').bind(row.id, current.key, previous.key),
    db.prepare("SELECT COUNT(*) AS count FROM guild_trials WHERE character_id = ? AND week = ? AND state = 'done'").bind(row.id, current.key),
  ]);
  const day = trialDay(now, content());
  const open = trialsOpen(day, content());
  const limit = barLimit(board.trials, day);
  const finished = own.results[0]?.count ?? 0;
  const rows = trials.results.filter((one) => one.week === current.key);
  const mine = new Map(rows.filter((one) => one.character_id === row.id).map((one) => [one.trial, one]));
  const character = engineCharacter(row);
  const access = trialAccess(player, now);
  const { cap, steps, activeDays, opens, perDay } = rules();
  const counts = finishedBy(rows);
  const counted = (count) => Math.min(count, cap, limit);
  const last = before.results[0]
    ? barView(previous.key, trials.results.filter((one) => one.week === previous.key), before.results[0].active, before.results[0].joined ?? 0, claims.results, player)
    : null;
  return {
    guild: { name: guild.name, tag: guild.tag },
    week: current.key,
    endsAt: current.endsAt,
    trials: board.trials.flatMap((trial, index) => {
      const kind = trialKind(trial.kind, content());
      const one = mine.get(index);
      if (!kind || (index >= open && !one)) return [];
      const done = one?.state === 'done';
      const lock = done ? null : trialLock(trial.kind, access, content());
      const count = one?.count ?? trialCount(trial, character, content());
      return [
        {
          index,
          kind: trial.kind,
          text: trialText(trial.kind, count, content()),
          note: trialNote(trial.kind, row.level, content()),
          count,
          progress: one?.progress ?? 0,
          state: done ? 'done' : lock ? 'locked' : 'active',
          lock,
        },
      ];
    }),
    day: {
      open,
      soon: day < 6 ? trialsOpen(day + 1, content()) - open : 0,
      limit: Number.isFinite(limit) ? limit : null,
      finished,
      counted: counted(finished),
      later: Number.isFinite(limit) ? Math.max(0, Math.min(finished, cap) - limit) : 0,
    },
    bar: barView(current.key, rows, board.active, board.joined, claims.results, player, limit),
    // Last week's chests, while one of them waits for this character.
    previous: last?.thresholds.some((threshold) => threshold.ready) ? { ...last, until: current.endsAt } : null,
    // Those it earned in another guild, still to open (chestsElsewhere).
    elsewhere: await chestsElsewhere(db, player, guild.id, now),
    members: [...counts]
      .flatMap(([id, count]) => {
        const one = rows.find((other) => other.character_id === id);
        return one?.name ? [{ id, name: one.name, classId: one.class_id, count, counted: counted(count), own: id === row.id }] : [];
      })
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pl')),
    rules: { cap, activeDays, steps, opens: opens ?? null, perDay: perDay ?? null },
    texts: cardTexts(),
  };
}

const answer = async (db, player, guild, now, extra = {}) => json({ ...(await trialsView(db, player, guild, now)), ...extra });

// The Próby outside a guild: the card's words (as the Bestia Gildii's) and
// the chests earned in a guild the character is no longer in.
const outsideView = async (db, player, now) => ({ guild: null, elsewhere: await chestsElsewhere(db, player, null, now), texts: cardTexts() });

// The cards of the Próby finished (903, drops.guild in data/cards.json):
// each trial the character finished this week or the last one, in any
// guild, rolls once, from its own seed (the character and the trial), so
// every look draws the same. A card that comes is given at the first look
// at the Próby, or at what waits in the Gildia (the page asks about once a
// minute, guild-todo.js), after the trial was finished, wherever the action
// that finished it was; the trial is then kept with the character's card
// game (`trials`, cardGameOf in cards.js), so it gives its card once, and
// those of the weeks gone leave it. Saved only while the character is as
// read, its version moving with its collection: a look that loses a race
// gives nothing, and the next one gives the card. Returns the cards given,
// as the page shows them, with their words for its toast.
export async function trialCards(db, player, now) {
  if (!cardsHere()) return [];
  const { row } = player;
  const { current, previous } = weeksAround(now);
  const { results } = await db
    .prepare("SELECT id FROM guild_trials WHERE character_id = ? AND week IN (?, ?) AND state = 'done'")
    .bind(row.id, current.key, previous.key)
    .all();
  const game = cardGameOf(row, casinoDay(now, content()).key);
  const done = results.map((trial) => trial.id);
  const due = done.filter((id) => !game.trials.includes(id));
  // Each trial's seed with the server's key (keyedSeed, 920 B): the same on
  // every look, and not to be worked out from the code.
  const seeds = new Map(await Promise.all(due.map(async (id) => [id, await keyedSeed(db, `${row.id}:trial:${id}:cards`)])));
  const found = due.length > 0 ? await sourceCards(db, row, due.map((id) => seeds.get(id)), content().cards.drops.guild) : null;
  if (!found) return [];
  const given = due.filter((id) => found.seeds.includes(seeds.get(id)));
  const next = { ...game, trials: [...game.trials.filter((id) => done.includes(id)), ...given] };
  try {
    await atomically(db, [
      sameVersion(db, row),
      db.prepare('UPDATE characters SET card_game = ?, version = version + 1 WHERE id = ?').bind(JSON.stringify(next), row.id),
      ...cardUpserts(db, row.id, found.ids, now),
    ]);
  } catch (error) {
    if (error?.code === 'character_changed') return [];
    throw error;
  }
  return found.cards.map((card) => ({ ...card, text: say(content().cards.texts, 'trial', 0, { card: card.name }) }));
}

// GET /api/guild/trials, with the cards of the Próby finished since the
// last look (trialCards), inside a guild and out of it.
export async function getGuildTrials(context) {
  const { player, guild, db } = await guildPlayer(context);
  const cards = await trialCards(db, player, context.now);
  const given = cards.length > 0 ? { cards } : {};
  if (!guild) return json({ ...(await outsideView(db, player, context.now)), ...given });
  return answer(db, player, guild, context.now, given);
}

// POST /api/guild/trials/take and /drop: nothing to take or drop any more,
// every open trial runs at once (the author's 617); a page from before
// gets the Próby as they are now, with the words saying so.
export async function takeGuildTrial(context) {
  const { player, guild, db } = await requireMember(context);
  return answer(db, player, guild, context.now, { text: words().auto });
}

export const dropGuildTrial = takeGuildTrial;

// POST /api/guild/trials/claim { week, threshold }: a reached threshold's
// chest, this week's or the last one's, for a character that finished a
// trial in the guild that week; once a week and threshold for a character,
// whatever its guild. The bar is of the guild the character is in, or of
// one it finished a trial in that week and has left since, been removed
// from, or that ended (chestsElsewhere; the code review, 0.2.72). The
// chest and its record land together, or neither. It holds what suits the
// character as it is when opened (its level, the newest place of its
// class), its material drawn from its own seed.
export async function claimGuildTrialChest(context) {
  const { session, player, guild, db } = await guildPlayer(context);
  const { row } = player;
  const body = await readJson(context.request);
  const now = context.now;
  const { current, previous } = weeksAround(now);
  if (![current.key, previous.key].includes(body.week)) throw new ApiError(409, 'too_late', errors().tooLate);
  const index = body.threshold;
  if (!Number.isInteger(index) || index < 0 || index >= rules().steps.length) throw new ApiError(400, 'invalid_threshold', errors().noThreshold);
  const { results: finished } = await db
    .prepare("SELECT DISTINCT guild_id FROM guild_trials WHERE character_id = ? AND week = ? AND state = 'done' AND guild_id IS NOT ? ORDER BY guild_id")
    .bind(row.id, body.week, guild?.id ?? null)
    .all();
  const guilds = [...(guild ? [guild.id] : []), ...finished.map((one) => one.guild_id)];
  if (guilds.length === 0) throw new ApiError(409, 'no_guild', errors().noGuild);
  // The first bar whose threshold this chest is ready on; else the first
  // bar there is, for the answer why not.
  let bar = null;
  let from = null;
  for (const guildId of guilds) {
    const found = await barOf(db, guildId, body.week, player, now);
    if (!found) continue;
    if (!bar) [bar, from] = [found, guildId];
    if (found.thresholds[index].ready) {
      [bar, from] = [found, guildId];
      break;
    }
  }
  if (!bar) throw new ApiError(404, 'no_board', errors().noBoard);
  const threshold = bar.thresholds[index];
  if (threshold.claimed) throw new ApiError(409, 'claimed', errors().claimed);
  if (!threshold.reached) throw new ApiError(409, 'not_reached', errors().notReached);
  if (!bar.contributed) throw new ApiError(409, 'no_trial', words().contribute);
  const chest = trialChest(index, engineCharacter(row), chestSeed(row.id, body.week, index), content());
  const materials = counted('materials', chest.materials);
  try {
    await db.batch([
      db.prepare('INSERT INTO guild_trial_chests (character_id, week, threshold, guild_id, claimed_at) VALUES (?, ?, ?, ?, ?)').bind(row.id, body.week, index, from, now),
      db
        .prepare(`UPDATE characters SET gold = gold + ?, time_points = time_points + ?, system_points = system_points + ?, materials = ${materials.sql}, version = version + 1 WHERE id = ?`)
        .bind(chest.gold, chest.timePoints, chest.systemPoints, ...materials.binds, row.id),
    ]);
  } catch (error) {
    if (/UNIQUE|PRIMARY/.test(String(error?.message ?? error))) throw new ApiError(409, 'claimed', errors().claimed);
    throw error;
  }
  const after = await loadPlayer(db, session.userId);
  return json({
    ...(guild ? await trialsView(db, after, guild, now) : await outsideView(db, after, now)),
    chest: { ...chestView(chest), text: filled(words().opened, { contents: chestText(chest) }) },
    character: characterView(after, now),
  });
}

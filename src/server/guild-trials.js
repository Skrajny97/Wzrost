// The Próby Gildii (the author's 345 A; the engine's guild-trials.js has the
// rules, data/guilds.json `trials` the numbers and the words; DECISIONS.md,
// "Próby i Prośby Gildii"): the guild's board of the week, drawn the first
// time a member looks at it (from Monday, midnight in Poland, as the weekly
// quests), with the members active then counted; a member picks one trial
// from it at a time, drops it or finishes it in its usual play; the bar of
// the guild's finished trials with its thresholds; and their chests, once a
// week and threshold for each character that finished a trial in the guild
// that week, claimed that week or the next. What an action brings to the
// character's trial is saved in the action's own batch (trialProgress), so
// it lands only with the action. No line in the guild's chat: the chat has
// no System lines, as for the Bestia Gildii.

import {
  campBonus,
  campLevels,
  countedForm,
  drawTrialBoard,
  isUnlocked,
  materialsText,
  materialView,
  questPeriod,
  trialChest,
  trialCount,
  trialGains,
  trialKind,
  trialLock,
  trialPoints,
  trialText,
  trialThresholds,
} from '../engine/index.js';
import { characterView, engineCharacter, loadPlayer, questContext, requirePlayer } from './characters.js';
import { content } from './content.js';
import { craftingOn, professionsOn, settlementOn } from './features.js';
import { guildOf } from './guilds.js';
import { ApiError, json, readJson } from './http.js';
import { counted } from './market.js';

const rules = () => content.guilds.trials;
const words = () => rules().texts;
const errors = () => words().errors;
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
const DAY = 24 * 3600000;

// A character with the Społeczność, with its guild or null; `texts` gives
// the errors' words (also for the Prośby Gildii, guild-requests.js).
export async function guildPlayer(context, texts = errors()) {
  const { session, player } = await requirePlayer(context);
  if (!isUnlocked('community', player.row.level, content)) {
    throw new ApiError(403, 'locked', filled(texts.locked, { level: content.unlocksById.community.level }));
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
  const current = questPeriod('weekly', now, content);
  return { current, previous: questPeriod('weekly', current.startsAt - 1, content) };
}

// The statement that moves the character's trial of the week on by what an
// action brought (trialGains in the engine), to put into that action's own
// batch, so both land together; none when the action brings nothing a
// trial counts. Only the trial taken this week in the guild the character
// is in now moves; one whose count is reached is done. `guard` ({ sql,
// binds }) holds only with the action's own change, for a batch with no
// assertion at its head, so two taps at once move the trial on once.
export function trialProgress(db, characterId, progress, now, guard = null) {
  const gains = Object.entries(trialGains(progress));
  if (gains.length === 0) return [];
  const { key: week } = questPeriod('weekly', now, content);
  const gain = `(CASE kind ${gains.map(() => 'WHEN ? THEN ?').join(' ')} ELSE 0 END)`;
  const binds = gains.flat();
  return [
    db
      .prepare(
        `UPDATE guild_trials SET progress = MIN(count, progress + ${gain}),
           state = CASE WHEN progress + ${gain} >= count THEN 'done' ELSE state END,
           done_at = CASE WHEN progress + ${gain} >= count THEN ? ELSE done_at END
         WHERE character_id = ? AND week = ? AND state = 'active' AND kind IN (${gains.map(() => '?').join(', ')})
           AND guild_id = (SELECT guild_id FROM guild_members WHERE character_id = ?)${guard ? ` AND ${guard.sql}` : ''}`,
      )
      .bind(...binds, ...binds, ...binds, now, characterId, week, ...gains.map(([kind]) => kind), characterId, ...(guard?.binds ?? [])),
  ];
}

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
    towers: isUnlocked('towers', player.row.level, content),
    professions: professionsOn() ? quests.hasProfessions : 'off',
    crafting: craftingOn() ? quests.hasCrafting : 'off',
    table: quests.hasTable,
    settlement: settlementOn() ? quests.hasSettlement : 'off',
    anvil: campBonus(campLevels(player.buildings, now, content), 'upgradeCap', content) > 0,
  };
}

const boardRow = (db, guildId, week) => db.prepare('SELECT trials, active FROM guild_trial_boards WHERE guild_id = ? AND week = ?').bind(guildId, week);

// The guild's board of the week: the one kept, or one drawn now from the
// guild and the week, with the members whose accounts were in the game in
// the last activeDays days counted, at least one. Of two requests at once,
// the first one's stays. A new board takes the boards, trials and chests of
// the weeks before the last one away, of every guild: nothing of them shows
// or opens any more (as the Bestia Gildii's beasts).
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
          `INSERT OR IGNORE INTO guild_trial_boards (guild_id, week, trials, active, created_at)
           SELECT ?, ?, ?, MAX(1, COUNT(*)), ?
           FROM guild_members m JOIN characters c ON c.id = m.character_id JOIN users u ON u.id = c.user_id
           WHERE m.guild_id = ? AND u.seen_at >= ?`,
        )
        .bind(guildId, current.key, JSON.stringify(drawTrialBoard(`${guildId}:${current.key}`, content)), now, guildId, now - rules().activeDays * DAY),
    ]);
    row = await boardRow(db, guildId, current.key).first();
  }
  return { trials: JSON.parse(row.trials), active: row.active };
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

const chestSeed = (characterId, week, index) => `${characterId}:${week}:trials:${index}`;

// A chest as the page shows it, its materials with their names.
const chestView = (chest) => ({
  gold: chest.gold,
  timePoints: chest.timePoints,
  systemPoints: chest.systemPoints,
  materials: Object.entries(chest.materials).map(([key, count]) => {
    const material = materialView(key, count, content);
    return { key, count, name: material.label.charAt(0).toUpperCase() + material.label.slice(1), rarity: material.rarity, materialId: material.materialId };
  }),
});

// A chest in words: "330 złota, 10 Punktów Czasu, skóra wilka ×2".
function chestText(chest) {
  const texts = words();
  return [
    chest.gold > 0 && filled(texts.gold, { gold: chest.gold }),
    chest.timePoints > 0 && `${chest.timePoints} ${countedForm(chest.timePoints, texts.timePointForms)}`,
    Object.keys(chest.materials).length > 0 && materialsText(chest.materials, content),
    chest.systemPoints > 0 && `${chest.systemPoints} ${countedForm(chest.systemPoints, texts.systemPointForms)}`,
  ]
    .filter(Boolean)
    .join(', ');
}

// A week's bar for the character: the guild's points (each member's
// finished trials up to the cap) against the thresholds, and each
// threshold's chest for this character, whether it is reached, claimed and
// ready to claim (for one who finished a trial in the guild that week).
function barView(week, rows, active, claims, player) {
  const { row } = player;
  const counts = finishedBy(rows);
  const points = trialPoints([...counts.values()], content);
  const contributed = (counts.get(row.id) ?? 0) > 0;
  const character = engineCharacter(row);
  return {
    week,
    points,
    active,
    contributed,
    thresholds: trialThresholds(active, points, content).map((threshold) => {
      const claimed = claims.some((claim) => claim.week === week && claim.threshold === threshold.index);
      return {
        ...threshold,
        claimed,
        ready: threshold.reached && contributed && !claimed,
        chest: chestView(trialChest(threshold.index, character, chestSeed(row.id, week, threshold.index), content)),
      };
    }),
  };
}

// The card's words, with the rules' numbers filled in (all but the
// answers' errors).
function cardTexts() {
  const { cap, steps, activeDays } = rules();
  const { errors: _, ...texts } = words();
  return { ...texts, how: texts.how.map((line) => filled(line, { thresholds: steps.length, days: activeDays, cap })) };
}

// The Próby Gildii for the page: the board of the week with each trial as
// it is for this character (its count at the character's level, or the
// one it took; open, taken, done or locked and why), its trial with the
// progress, the bar of this week and the chests of the last one still
// waiting for it, who finished how many trials this week, and the words.
async function trialsView(db, player, guild, now) {
  const { row } = player;
  const { current, previous } = weeksAround(now);
  const board = await boardOf(db, guild.id, now);
  const [trials, before, claims] = await db.batch([
    weekTrials(db, guild.id, [current.key, previous.key]),
    boardRow(db, guild.id, previous.key),
    db.prepare('SELECT week, threshold FROM guild_trial_chests WHERE character_id = ? AND week IN (?, ?)').bind(row.id, current.key, previous.key),
  ]);
  const rows = trials.results.filter((one) => one.week === current.key);
  const mine = rows.filter((one) => one.character_id === row.id);
  const taken = mine.find((one) => one.state === 'active' && trialKind(one.kind, content)) ?? null;
  const done = new Map(mine.filter((one) => one.state === 'done').map((one) => [one.trial, one]));
  const character = engineCharacter(row);
  const access = trialAccess(player, now);
  const { cap, steps, activeDays } = rules();
  const counts = finishedBy(rows);
  const last = before.results[0] ? barView(previous.key, trials.results.filter((one) => one.week === previous.key), before.results[0].active, claims.results, player) : null;
  return {
    guild: { name: guild.name, tag: guild.tag },
    week: current.key,
    endsAt: current.endsAt,
    trials: board.trials.flatMap((trial, index) => {
      const kind = trialKind(trial.kind, content);
      if (!kind) return [];
      const lock = trialLock(trial.kind, access, content);
      const state = done.has(index) ? 'done' : taken?.trial === index ? 'taken' : lock ? 'locked' : 'open';
      const count = state === 'done' ? done.get(index).count : state === 'taken' ? taken.count : trialCount(trial, character, content);
      return [{ index, kind: trial.kind, text: trialText(trial.kind, count, content), note: kind.note ?? null, count, state, lock: state === 'locked' ? lock : null }];
    }),
    taken: taken && {
      index: taken.trial,
      kind: taken.kind,
      text: trialText(taken.kind, taken.count, content),
      note: trialKind(taken.kind, content).note ?? null,
      count: taken.count,
      progress: taken.progress,
    },
    bar: barView(current.key, rows, board.active, claims.results, player),
    // Last week's chests, while one of them waits for this character.
    previous: last?.thresholds.some((threshold) => threshold.ready) ? { ...last, until: current.endsAt } : null,
    members: [...counts]
      .flatMap(([id, count]) => {
        const one = rows.find((other) => other.character_id === id);
        return one?.name ? [{ id, name: one.name, classId: one.class_id, count, counted: Math.min(count, cap), own: id === row.id }] : [];
      })
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pl')),
    rules: { cap, activeDays, steps },
    texts: cardTexts(),
  };
}

const answer = async (db, player, guild, now, extra = {}) => json({ ...(await trialsView(db, player, guild, now)), ...extra });

// GET /api/guild/trials: outside a guild, only the card's words (as the
// Bestia Gildii's).
export async function getGuildTrials(context) {
  const { player, guild, db } = await guildPlayer(context);
  if (!guild) return json({ guild: null, texts: cardTexts() });
  return answer(db, player, guild, context.now);
}

// POST /api/guild/trials/take { index }: the character takes a trial of the
// board, one it can do, has not finished this week and while it has no
// other; its count is the one for the character's level now. A trial left
// active in another guild goes.
export async function takeGuildTrial(context) {
  const { player, guild, db } = await requireMember(context);
  const { row } = player;
  const body = await readJson(context.request);
  const now = context.now;
  const { key: week } = questPeriod('weekly', now, content);
  const board = await boardOf(db, guild.id, now);
  const trial = Number.isInteger(body.index) ? board.trials[body.index] : undefined;
  if (!trial || !trialKind(trial.kind, content)) throw new ApiError(404, 'no_trial', errors().noTrial);
  const lock = trialLock(trial.kind, trialAccess(player, now), content);
  if (lock) throw new ApiError(409, 'locked', lock);
  const busy = () => new ApiError(409, 'busy', errors().busy);
  const mine = (await db.prepare("SELECT guild_id, trial, state FROM guild_trials WHERE character_id = ? AND week = ? AND state IN ('active', 'done')").bind(row.id, week).all()).results;
  if (mine.some((one) => one.state === 'active' && one.guild_id === guild.id)) throw busy();
  if (mine.some((one) => one.state === 'done' && one.guild_id === guild.id && one.trial === body.index)) throw new ApiError(409, 'done', errors().done);
  const count = trialCount(trial, engineCharacter(row), content);
  try {
    await db.batch([
      db.prepare("UPDATE guild_trials SET state = 'dropped' WHERE character_id = ? AND week = ? AND state = 'active' AND guild_id != ?").bind(row.id, week, guild.id),
      db
        .prepare(
          `INSERT INTO guild_trials (guild_id, week, character_id, trial, kind, count, taken_at)
           SELECT ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM guild_trials WHERE guild_id = ? AND week = ? AND character_id = ? AND trial = ? AND state = 'done')`,
        )
        .bind(guild.id, week, row.id, body.index, trial.kind, count, now, guild.id, week, row.id, body.index),
    ]);
  } catch (error) {
    if (/UNIQUE/.test(String(error?.message ?? error))) throw busy();
    throw error;
  }
  return answer(db, player, guild, now, { text: filled(words().took, { text: trialText(trial.kind, count, content) }) });
}

// POST /api/guild/trials/drop: the character drops its trial; its progress
// goes, and the trial can be taken again.
export async function dropGuildTrial(context) {
  const { player, guild, db } = await requireMember(context);
  const { key: week } = questPeriod('weekly', context.now, content);
  const dropped = await db
    .prepare("UPDATE guild_trials SET state = 'dropped' WHERE character_id = ? AND week = ? AND state = 'active' AND guild_id = ?")
    .bind(player.row.id, week, guild.id)
    .run();
  if (dropped.meta.changes !== 1) throw new ApiError(409, 'no_trial', errors().notTaken);
  return answer(db, player, guild, context.now, { text: words().dropped });
}

// POST /api/guild/trials/claim { week, threshold }: a reached threshold's
// chest, this week's or the last one's, for a character that finished a
// trial in the guild that week; once a week and threshold for a character,
// whatever its guild. The chest and its record land together, or neither.
// It holds what suits the character as it is when opened (its level, the
// newest place of its class), its material drawn from its own seed.
export async function claimGuildTrialChest(context) {
  const { session, player, guild, db } = await requireMember(context);
  const { row } = player;
  const body = await readJson(context.request);
  const now = context.now;
  const { current, previous } = weeksAround(now);
  if (![current.key, previous.key].includes(body.week)) throw new ApiError(409, 'too_late', errors().tooLate);
  const index = body.threshold;
  if (!Number.isInteger(index) || index < 0 || index >= rules().steps.length) throw new ApiError(400, 'invalid_threshold', errors().noThreshold);
  const [board, trials, claims] = await db.batch([
    boardRow(db, guild.id, body.week),
    weekTrials(db, guild.id, [body.week]),
    db.prepare('SELECT week, threshold FROM guild_trial_chests WHERE character_id = ? AND week = ?').bind(row.id, body.week),
  ]);
  if (!board.results[0]) throw new ApiError(404, 'no_board', errors().noBoard);
  const bar = barView(body.week, trials.results, board.results[0].active, claims.results, player);
  const threshold = bar.thresholds[index];
  if (threshold.claimed) throw new ApiError(409, 'claimed', errors().claimed);
  if (!threshold.reached) throw new ApiError(409, 'not_reached', errors().notReached);
  if (!bar.contributed) throw new ApiError(409, 'no_trial', words().contribute);
  const chest = trialChest(index, engineCharacter(row), chestSeed(row.id, body.week, index), content);
  const materials = counted('materials', chest.materials);
  try {
    await db.batch([
      db.prepare('INSERT INTO guild_trial_chests (character_id, week, threshold, guild_id, claimed_at) VALUES (?, ?, ?, ?, ?)').bind(row.id, body.week, index, guild.id, now),
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
    ...(await trialsView(db, after, guild, now)),
    chest: { ...chestView(chest), text: filled(words().opened, { contents: chestText(chest) }) },
    character: characterView(after, now),
  });
}

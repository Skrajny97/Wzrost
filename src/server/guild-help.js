// Pomoc przy budowach i przy pracy (the author's 1196 A and B, accepted on
// the review page on 19.11.2026; the engine's guild-help.js has the rules,
// data/guilds.json `help` the numbers and the words, `fame.help` the Sława;
// DECISIONS.md, "Pomoc przy budowach i pracy (1196 A i B, 19.11.2026)"): on
// the Gildia tab, the build under way in each member's Obóz or Warownia and
// each member's own work in a profession, and "Pomóż" by each one the
// character may help, "Pomóż wszystkim" for all of them at once.
//
// What is under way: a build of the buildings table whose end is still to
// come, or, for a member away while its queue moved on, the build of its
// queue whose time has come and that its own next request will start
// (settleBuilds in characters.js); the work of its activity, of a
// profession's kind. A help moves the build or the work into the past by its
// cut, as Punkty Czasu do (time.js): a build of the table with its store
// waiting for its end and the queue behind it, a build of the queue with
// those after it, a work with its start (its result comes from its seed and
// its length, so it stays the same). The cut never takes it past the
// moment of the help, so the phone's notice of its end (push.js, from the
// stored ends) comes as for any other, and the owner's report, its claim
// and its next build come as they would. Each help is one batch with an
// assertion at its head: the helper and the owner are still in the guild,
// the build or the work is as read (and the owner's queue too), the helper
// has not helped it yet and it has fewer than maxHelps helps; the owner's
// version moves on, so a request of the owner built on the old end is
// answered that something changed. Two taps at once help once.
//
// Each help is a row of guild_helps, with the guild, the week and the cut:
// the owner's names of those who helped and its time cut, the cap of each
// build and work, and the Sława of the helper and its guild (fame.help:
// perHelp a help, the first `cap` of the week; guild-fame.js,
// guild-members.js). The rows of the weeks before the last one go as a new
// help is saved, as the Sława of the week before is written by then.

import { HELP_WORKS, countedForm, cutText, helpCut, helpOpen, helpProfession, helpTarget, questPeriod, shiftQueue } from '../engine/index.js';
import { assertion, atomically } from './atomic.js';
import { content } from './content.js';
import { nameColorOf } from './cosmetics.js';
import { sha256Hex } from './encoding.js';
import { guildPlayer, requireMember } from './guild-trials.js';
import { ApiError, json, readJson } from './http.js';
import { numberText } from './i18n.js';

const rules = () => content().guilds.help;
const words = () => rules().texts;
const errors = () => words().errors;
const fame = () => content().guilds.fame.help;
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
const refused = (code, key) => new ApiError(409, code, errors()[key]);
const changed = () => refused('changed', 'changed');
const WORK_KINDS = Object.keys(HELP_WORKS);

// The week around `now` and the one before it.
function weeksAround(now) {
  const current = questPeriod('weekly', now, content());
  return { current, previous: questPeriod('weekly', current.startsAt - 1, content()) };
}

// The key of a work: the start of the hash of its seed, so the page names
// it without learning the seed.
const workKey = async (seed) => (await sha256Hex(`help:${seed}`)).slice(0, 20);

// What a member has under way: its build (of the buildings table, or of its
// queue whose time has come while it was away) and its work in a
// profession, each with when it runs and its key.
async function underWay(member, builds, works, now) {
  const found = [];
  const own = builds.find((build) => build.character_id === member.id);
  const queue = JSON.parse(member.build_queue ?? '[]');
  if (own) {
    found.push({ kind: 'build', source: 'table', buildingId: own.building_id, level: own.level, startedAt: own.started_at, endsAt: own.ends_at, queue });
  } else {
    const index = queue.findIndex((entry) => entry.startsAt <= now && now < entry.endsAt);
    const entry = queue[index];
    if (entry && content().buildingsById[entry.buildingId]) {
      found.push({ kind: 'build', source: 'queue', index, buildingId: entry.buildingId, level: entry.level, startedAt: entry.startsAt, endsAt: entry.endsAt, queue });
    }
  }
  const work = works.find((one) => one.character_id === member.id);
  if (work && helpProfession(work.kind, content())) {
    found.push({ kind: 'work', workKind: work.kind, startedAt: work.started_at, endsAt: work.ends_at, work: await workKey(work.seed) });
  }
  return found.map((one) => ({ ...one, owner: member, key: helpTarget(one.kind === 'work' ? { work: one.work } : one) }));
}

// The guild's members with what each has under way, its helps (those given
// since it began: a build of a level stopped and begun again does not keep
// the old ones, unless moved back past them) and the helps the character
// gave this week.
async function guildWork(db, player, guild, now) {
  const { current, previous } = weeksAround(now);
  const [members, builds, works, helps, given] = await db.batch([
    db
      .prepare(
        `SELECT c.id, c.user_id, c.name, c.class_id, c.level, c.cosmetics, c.build_queue FROM guild_members m JOIN characters c ON c.id = m.character_id
         WHERE m.guild_id = ? ORDER BY m.joined_at, m.character_id`,
      )
      .bind(guild.id),
    db
      .prepare('SELECT b.character_id, b.building_id, b.level, b.started_at, b.ends_at FROM buildings b JOIN guild_members m ON m.character_id = b.character_id WHERE m.guild_id = ? AND b.ends_at > ?')
      .bind(guild.id, now),
    db
      .prepare(
        `SELECT a.character_id, a.kind, a.started_at, a.ends_at, a.seed FROM activities a JOIN guild_members m ON m.character_id = a.character_id
         WHERE m.guild_id = ? AND a.ends_at > ? AND a.kind IN (${WORK_KINDS.map(() => '?').join(', ')})`,
      )
      .bind(guild.id, now, ...WORK_KINDS),
    db
      .prepare(
        `SELECT h.owner_id, h.target, h.helper_id, h.cut, h.created_at, c.name FROM guild_helps h LEFT JOIN characters c ON c.id = h.helper_id
         WHERE h.week >= ? AND h.owner_id IN (SELECT character_id FROM guild_members WHERE guild_id = ?) ORDER BY h.created_at, h.id`,
      )
      .bind(previous.key, guild.id),
    db.prepare('SELECT COUNT(*) AS count FROM guild_helps WHERE helper_id = ? AND week = ?').bind(player.row.id, current.key),
  ]);
  const targets = (await Promise.all(members.results.map((member) => underWay(member, builds.results, works.results, now)))).flat();
  for (const target of targets) {
    target.helps = helps.results.filter((help) => help.owner_id === target.owner.id && help.target === target.key && help.created_at >= target.startedAt);
  }
  return { targets, given: given.results[0]?.count ?? 0 };
}

// Why the character may not help with `target`, or null: its own, of a
// character of its account, helped by it already, or with all its helps.
function helpBlock(player, target) {
  if (target.owner.id === player.row.id) return 'own';
  if (target.owner.user_id === player.row.user_id) return 'sameAccount';
  if (target.helps.some((help) => help.helper_id === player.row.id)) return 'helped';
  if (!helpOpen(target.helps.length, false, content())) return 'full';
  return null;
}

// "Kowadło, 7. poziom" or "Zielarstwo": what a build or a work is.
function targetTitle(target) {
  if (target.kind === 'work') return helpProfession(target.workKind, content()).name;
  return filled(words().build, { building: content().buildingsById[target.buildingId]?.name ?? target.buildingId, level: target.level });
}

// "1 punkt": points in words, as the Sława's.
const points = (count) => `${numberText(count)} ${countedForm(count, content().guilds.fame.texts.pointForms)}`;

// The card's words, the rules' numbers filled in (all but the errors).
function cardTexts() {
  const { errors: _, ...texts } = words();
  const vars = { share: numberText(rules().share * 100), min: cutText(rules().minMinutes * 60000), max: rules().maxHelps, perHelp: points(fame().perHelp), cap: fame().cap };
  return { ...texts, how: texts.how.map((line) => filled(line, vars)) };
}

// The help card for the page: the character's own build and work, each
// with the names of those who helped and the time they cut; the others'
// the character may see (not of its own account), each with its owner,
// time left, its helps, what one help would cut now and whether the
// character may still help; how many it may help now; its helps of the
// week against the Sława's cap; the words.
async function helpView(db, player, guild, now) {
  const { targets, given } = await guildWork(db, player, guild, now);
  const entry = (target) => ({
    target: target.key,
    kind: target.kind,
    title: targetTitle(target),
    ...(target.kind === 'build' ? { buildingId: target.buildingId, level: target.level } : { profession: helpProfession(target.workKind, content()).id }),
    endsAt: target.endsAt,
    helps: target.helps.length,
    max: rules().maxHelps,
  });
  const mine = targets
    .filter((target) => target.owner.id === player.row.id)
    .map((target) => ({ ...entry(target), cut: target.helps.reduce((sum, help) => sum + help.cut, 0), helpers: target.helps.map((help) => help.name).filter(Boolean) }));
  const others = targets
    .filter((target) => target.owner.id !== player.row.id && target.owner.user_id !== player.row.user_id)
    .map((target) => {
      const block = helpBlock(player, target);
      return {
        ...entry(target),
        owner: { id: target.owner.id, name: target.owner.name, classId: target.owner.class_id, level: target.owner.level, nameColor: nameColorOf(target.owner.cosmetics) },
        next: helpCut(target.startedAt, target.endsAt, now, content()),
        helped: block === 'helped',
        open: block === null,
      };
    })
    .sort((a, b) => Number(b.open) - Number(a.open) || a.endsAt - b.endsAt);
  return {
    guild: { name: guild.name, tag: guild.tag },
    mine,
    others,
    open: others.filter((one) => one.open).length,
    weekHelps: { count: given, cap: fame().cap },
    texts: cardTexts(),
  };
}

// Whether the character may help now (the yellow dot of the Gildia tab,
// guild-todo.js): a build or a work of another member it may still help.
export async function helpTodo(db, player, guild, now) {
  const { targets } = await guildWork(db, player, guild, now);
  return targets.some((target) => helpBlock(player, target) === null);
}

// One help of the character with `target`, as read: the cut off it and the
// row of the help in one batch, saved only while the helper and the owner
// are in the guild, the build or the work is as read, the helper has not
// helped it and it has room for one more help (see the head). Returns the
// cut, in milliseconds.
async function giveHelp(db, player, guild, target, now) {
  const cut = helpCut(target.startedAt, target.endsAt, now, content());
  if (cut <= 0) throw refused('gone', 'gone');
  const { current, previous } = weeksAround(now);
  const owner = target.owner.id;
  const queueRead = target.owner.build_queue ?? '[]';
  const same = {
    table: [
      'EXISTS (SELECT 1 FROM buildings WHERE character_id = ? AND building_id = ? AND level = ? AND ends_at = ?) AND (SELECT COALESCE(build_queue, \'[]\') FROM characters WHERE id = ?) = ?',
      [owner, target.buildingId, target.level, target.endsAt, owner, queueRead],
    ],
    queue: ['NOT EXISTS (SELECT 1 FROM buildings WHERE character_id = ? AND ends_at > ?) AND (SELECT COALESCE(build_queue, \'[]\') FROM characters WHERE id = ?) = ?', [owner, now, owner, queueRead]],
    work: ['EXISTS (SELECT 1 FROM activities WHERE character_id = ? AND kind = ? AND started_at = ? AND ends_at = ?)', [owner, target.workKind, target.startedAt, target.endsAt]],
  }[target.kind === 'work' ? 'work' : target.source];
  const head = assertion(
    db,
    `EXISTS (SELECT 1 FROM guild_members WHERE character_id = ? AND guild_id = ?)
     AND EXISTS (SELECT 1 FROM guild_members WHERE character_id = ? AND guild_id = ?)
     AND NOT EXISTS (SELECT 1 FROM guild_helps WHERE owner_id = ? AND target = ? AND helper_id = ? AND created_at >= ?)
     AND (SELECT COUNT(*) FROM guild_helps WHERE owner_id = ? AND target = ? AND created_at >= ?) < ?
     AND ${same[0]}`,
    [player.row.id, guild.id, owner, guild.id, owner, target.key, player.row.id, target.startedAt, owner, target.key, target.startedAt, rules().maxHelps, ...same[1]],
  );
  // The build or the work moves back by the cut: a build of the table with
  // its store waiting for its end and the whole queue, one of the queue with
  // those after it, a work with its start.
  const moved =
    target.kind === 'work'
      ? [
          db
            .prepare('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ? WHERE character_id = ? AND started_at = ? AND ends_at = ?')
            .bind(cut, cut, owner, target.startedAt, target.endsAt),
          db.prepare('UPDATE characters SET version = version + 1 WHERE id = ?').bind(owner),
        ]
      : [
          ...(target.source === 'table'
            ? [
                db
                  .prepare(
                    `UPDATE buildings SET started_at = started_at - ?, ends_at = ends_at - ?,
                       collected_at = CASE WHEN collected_at = ends_at THEN collected_at - ? ELSE collected_at END
                     WHERE character_id = ? AND building_id = ? AND ends_at = ?`,
                  )
                  .bind(cut, cut, cut, owner, target.buildingId, target.endsAt),
              ]
            : []),
          db
            .prepare('UPDATE characters SET build_queue = ?, version = version + 1 WHERE id = ?')
            .bind(JSON.stringify(target.source === 'table' ? shiftQueue(target.queue, cut) : [...target.queue.slice(0, target.index), ...shiftQueue(target.queue.slice(target.index), cut)]), owner),
        ];
  await atomically(
    db,
    [
      head,
      ...moved,
      db
        .prepare('INSERT INTO guild_helps (guild_id, week, helper_id, owner_id, target, cut, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(guild.id, current.key, player.row.id, owner, target.key, cut, now),
      db.prepare('DELETE FROM guild_helps WHERE week < ?').bind(previous.key),
    ],
    changed,
  );
  return cut;
}

// The Sława the helps of the week brought, from `before` helps to `after`:
// perHelp each, the first `cap` of them; in words, for the answer.
function fameText(before, after) {
  const { perHelp, cap } = fame();
  const gained = (Math.min(after, cap) - Math.min(before, cap)) * perHelp;
  return gained > 0 ? filled(words().doneFame, { points: points(gained) }) : words().doneNoFame;
}

// GET /api/guild/help: outside a guild, only the card's words.
export async function getGuildHelp(context) {
  const { player, guild, db } = await guildPlayer(context, errors());
  if (!guild) return json({ guild: null, texts: cardTexts() });
  return json(await helpView(db, player, guild, context.now));
}

// POST /api/guild/help { ownerId, target }: one help with what the page
// showed (a member's build or work by its key). Refused, each with its
// words: the character's own, one of its account, a member gone from the
// guild, a build or a work over or other than shown, helped by it already,
// with all its helps; a race lost, that something changed.
export async function helpGuildMember(context) {
  const { player, guild, db } = await requireMember(context, errors());
  const body = await readJson(context.request);
  if (!Number.isInteger(body.ownerId) || typeof body.target !== 'string') throw new ApiError(400, 'invalid_help', errors().invalid);
  if (body.ownerId === player.row.id) throw refused('own', 'own');
  const owner = await db
    .prepare('SELECT c.user_id FROM guild_members m JOIN characters c ON c.id = m.character_id WHERE m.character_id = ? AND m.guild_id = ?')
    .bind(body.ownerId, guild.id)
    .first();
  if (!owner) throw refused('not_member', 'notMember');
  if (owner.user_id === player.row.user_id) throw refused('same_account', 'sameAccount');
  const now = context.now;
  const { targets, given } = await guildWork(db, player, guild, now);
  const target = targets.find((one) => one.owner.id === body.ownerId && one.key === body.target);
  if (!target) throw refused('gone', 'gone');
  const block = helpBlock(player, target);
  if (block) throw refused(block, block);
  const cut = await giveHelp(db, player, guild, target, now);
  const text = `${filled(words().done, { name: target.owner.name, target: targetTitle(target), time: cutText(cut) })} ${fameText(given, given + 1)}`;
  return json({ ...(await helpView(db, player, guild, now)), text });
}

// POST /api/guild/help/all: a help with every build and work of the guild
// the character may still help, each on its own (one that changed
// meanwhile is left out); with none left, the card as it is and words that
// say so, so a second tap does nothing.
export async function helpGuildAll(context) {
  const { player, guild, db } = await requireMember(context, errors());
  const now = context.now;
  const { targets, given } = await guildWork(db, player, guild, now);
  let helped = 0;
  for (const target of targets.filter((one) => helpBlock(player, one) === null)) {
    try {
      await giveHelp(db, player, guild, target, now);
      helped += 1;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409) throw error;
    }
  }
  const view = await helpView(db, player, guild, now);
  if (helped === 0) return json({ ...view, helped, text: words().allHelped });
  const count = `${numberText(helped)} ${countedForm(helped, words().helpForms)}`;
  return json({ ...view, helped, text: `${filled(words().doneAll, { count })} ${fameText(given, given + helped)}` });
}

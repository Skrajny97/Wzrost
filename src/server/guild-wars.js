// The guild wars (data/guilds.json `war`; src/engine/guild-wars.js has the
// rules; DECISIONS.md, "Wojny gildii: odpowiedzi autora 792–800" and "Wojny
// gildii na wersji testowej"), only where GUILD_WARS is on (features.js),
// in the Gildia's Wojna tab (src/client/guild-war.js).
//
// A war lasts a week, from Monday to Sunday (Polish time). The guilds'
// rivals are drawn once a week, at the first run of the cron (or the first
// look) of the week, before its first battles on Monday at 20:00: later is
// too late, so the first war comes on the first Monday after the wars are
// on (12). Every evening at 20:00 the cron fights the battles of every war
// (settleWars), and a look at the war fights any its evenings owe, should
// the cron have missed them; each evening of a war is one batch that holds
// only while the war is as read, so its battles are fought and their
// rewards given once, whoever comes first. The guild that won more battles
// by Sunday gets the war's Sława (guild-fame.js) and its war chest in its
// Skrzynia (guild-chest.js).
//
// The teams are the guild's own, from week to week: each member takes a
// free place (796 A), the leader and the deputies move anyone, also to
// swap two; a place's row goes with its member's membership (guilds.js:
// guildRemoval). On the test version, "Test wojny" begins a war at once
// with a mirror guild, whose teams fight as the guild's own under other
// names, and fights an evening's battles at a tap.

import {
  classNameOf,
  countedForm,
  drawWars,
  mirrorTeam,
  nextTeamAt,
  teamFights,
  WAR_DAYS,
  warBattle,
  warChest,
  warDaysDue,
  warFightFor,
  warLineups,
  warPairings,
  warResult,
  warReward,
  warRules,
  warTeams,
  warWeek,
} from '../engine/index.js';
import { assertion, raced } from './atomic.js';
import { engineCharacter } from './characters.js';
import { content, contentIn } from './content.js';
import { nameColorOf } from './cosmetics.js';
import { fromBase64, toBase64, toHex } from './encoding.js';
import { englishOn, guildWarsOn } from './features.js';
import { warChestStatements } from './guild-chest.js';
import { guildPlayer, requireMember } from './guild-trials.js';
import { ApiError, json, readJson } from './http.js';
import { language, numberText } from './i18n.js';
import { tutorialTestsFor } from './test-mode.js';

const rules = () => warRules(content());
const words = () => rules().texts;
const errors = () => words().errors;
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
const newSeed = () => toHex(crypto.getRandomValues(new Uint8Array(16)));
const changed = () => new ApiError(409, 'war_changed', errors().changed);
// A batch that failed on its assertion or on a row of the wars another run
// wrote meanwhile (a place taken, the week drawn); any other error is one
// (11.11.2026: a constraint of another kind is no race, and is told).
const lost = (error) => raced(error) || /UNIQUE constraint failed: guild_war/i.test(String(error?.message ?? error));

// The wars are there where GUILD_WARS is on.
function requireWars() {
  if (!guildWarsOn() || !rules()) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
}

// A battle's log as kept: its JSON, gzipped, in base64 (a 5 on 5's log is
// about a hundred kilobytes, and an eighth of it so).
async function pack(value) {
  const stream = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip'));
  return toBase64(new Uint8Array(await new Response(stream).arrayBuffer()));
}

async function unpack(text) {
  const stream = new Blob([fromBase64(text)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

// The members of a guild in the order they joined, as stored, with their
// role in it.
async function membersOf(db, guildId) {
  const { results } = await db
    .prepare('SELECT c.*, m.role AS guild_role FROM guild_members m JOIN characters c ON c.id = m.character_id WHERE m.guild_id = ? ORDER BY m.joined_at, m.character_id')
    .bind(guildId)
    .all();
  return results;
}

// The places the members of a guild took.
async function slotsOf(db, guildId) {
  const { results } = await db.prepare('SELECT character_id, team, slot FROM guild_war_slots WHERE guild_id = ?').bind(guildId).all();
  return results.map((row) => ({ characterId: row.character_id, team: row.team, slot: row.slot }));
}

// A guild's teams now (warLineups), with its members as stored and the
// places they took; null for a guild that is gone.
async function teamsOf(db, guildId) {
  if (guildId === null) return null;
  const [members, slots] = await Promise.all([membersOf(db, guildId), slotsOf(db, guildId)]);
  if (members.length === 0) return null;
  return { members, slots, ...warLineups({ members: members.map((row) => row.id), slots }, content()) };
}

// The fighters of characters (their rows), each as it is saved: its stats,
// skills, evolution and the items it wears (as pvp-arena.js's fighterOf).
async function fightersOf(db, rows) {
  if (rows.length === 0) return new Map();
  const ids = rows.map((row) => row.id);
  const { results } = await db
    .prepare(`SELECT id, character_id, slot, data FROM items WHERE slot IS NOT NULL AND character_id IN (${ids.map(() => '?').join(', ')}) ORDER BY id`)
    .bind(...ids)
    .all();
  const worn = new Map(ids.map((id) => [id, []]));
  for (const item of results) worn.get(item.character_id).push({ id: item.id, equippedSlot: item.slot, ...JSON.parse(item.data) });
  return new Map(rows.map((row) => [row.id, { row, character: engineCharacter(row), equipped: worn.get(row.id), name: row.name }]));
}

// A fighter as a battle keeps it: who (with when its character was made,
// `since`, as the database gives the id of a removed one again), its look
// and levels, and (on the side that won) what it got.
function fighterRecord(fighter, reward = null) {
  const { character } = fighter;
  return {
    id: fighter.row?.id ?? null,
    ...(fighter.row && { since: fighter.row.created_at }),
    name: fighter.name,
    classId: character.classId,
    level: character.level,
    classLevel: character.classLevel,
    appearance: character.appearance,
    skin: character.skin,
    evolution: character.evolution ?? null,
    ...(character.outfit && { outfit: character.outfit }),
    ...(reward && reward),
  };
}

// The sides of a war as they fight now: guild A's teams, and guild B's or,
// for the test version's mirror guild, its teams fighting as A's do.
async function warSides(db, war) {
  const a = await teamsOf(db, war.guild_a);
  const b = war.guild_b === null ? (a && { mirror: true, count: war.mirror_teams }) : await teamsOf(db, war.guild_b);
  return { a, b };
}

// One evening of a war (`day`, its battles at `at`): the battles of its
// pairs of teams (795 B), each fought from the war's seed, its log in Polish
// and, where English is on, in English too (the same battle: its texts take
// no draws). The rewards of each battle won go to its fighters (799 A). In
// one batch that holds only while the war is as read, with the war's days
// and score; after Sunday's battles also its end, and the war chest of the
// guild that won it. A character whose account has one on the other side
// too (a character made or one that changed its guild after the draw, which
// kept such guilds apart, 3) fights on neither, so nobody fights itself
// and takes the reward for free (11.11.2026). Gives the war after it, or
// null when another run was first.
async function fightEvening(db, war, day, at, now) {
  const polish = contentIn('pl');
  const english = englishOn() ? contentIn('en') : null;
  const { a, b } = await warSides(db, war);
  const fighters = new Map([
    ...(a ? await fightersOf(db, a.members) : new Map()),
    ...(b && !b.mirror ? await fightersOf(db, b.members) : new Map()),
  ]);
  const accounts = (side) => new Set(side.members.map((row) => row.user_id));
  const both = a && b && !b.mirror ? new Set([...accounts(a)].filter((user) => accounts(b).has(user))) : new Set();
  const lineup = (side, team) => side.lineups[team - 1].map((id) => fighters.get(id)).filter((one) => one && !both.has(one.row.user_id));
  const pairings = a && b ? warPairings(a.count, b.count) : [];
  const battles = [];
  const rewards = new Map();
  for (const pairing of pairings) {
    const seed = `${war.seed}:${day}:${pairing.number}`;
    const sideA = lineup(a, pairing.a);
    // The mirror guild's fighters are no characters of their own: no
    // reward goes to anyone for their wins.
    const sideB = b.mirror
      ? mirrorTeam(lineup(a, ((pairing.b - 1) % a.count) + 1), seed, sideA.map((one) => one.name), polish).map(({ row: _, ...copy }) => copy)
      : lineup(b, pairing.b);
    if (sideA.length === 0 || sideB.length === 0) continue;
    const fought = warBattle({ sideA, sideB, seed }, polish);
    const log = await pack(fought.fight);
    const logEn = english ? await pack(warBattle({ sideA, sideB, seed }, english).fight) : null;
    const record = (side, list) =>
      list.map((fighter) => {
        if (fought.result !== side || !fighter.row) return fighterRecord(fighter);
        const reward = warReward(fighter.character.level, polish);
        const sum = rewards.get(fighter.row.id) ?? { gold: 0, systemPoints: 0 };
        rewards.set(fighter.row.id, { gold: sum.gold + reward.gold, systemPoints: sum.systemPoints + reward.systemPoints });
        return fighterRecord(fighter, reward);
      });
    battles.push({ pairing, result: fought.result, fighters: { a: record('a', sideA), b: record('b', sideB), standing: fought.standing }, log, logEn });
  }
  const wins = { a: battles.filter((one) => one.result === 'a').length, b: battles.filter((one) => one.result === 'b').length };
  const next = { ...war, days_done: day + 1, wins_a: war.wins_a + wins.a, wins_b: war.wins_b + wins.b };
  const statements = [
    assertion(db, '(SELECT days_done FROM guild_wars WHERE id = ?) = ?', [war.id, day]),
    ...battles.map((battle) =>
      db
        .prepare('INSERT INTO guild_war_battles (war_id, day, number, team_a, team_b, result, at, fighters, log, log_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(war.id, day, battle.pairing.number, battle.pairing.a, battle.pairing.b, battle.result, at, JSON.stringify(battle.fighters), battle.log, battle.logEn),
    ),
    ...[...rewards].map(([id, reward]) => db.prepare('UPDATE characters SET gold = gold + ?, system_points = system_points + ? WHERE id = ?').bind(reward.gold, reward.systemPoints, id)),
    db.prepare('UPDATE guild_wars SET days_done = ?, wins_a = ?, wins_b = ? WHERE id = ?').bind(next.days_done, next.wins_a, next.wins_b, war.id),
  ];
  if (next.days_done >= WAR_DAYS) {
    next.result = warResult(next.wins_a, next.wins_b);
    next.ended_at = now;
    statements.push(db.prepare('UPDATE guild_wars SET result = ?, ended_at = ? WHERE id = ?').bind(next.result, now, war.id));
    const winner = next.result === 'a' ? war.guild_a : next.result === 'b' ? war.guild_b : null;
    if (winner !== null) {
      const side = next.result;
      const teams = (side === 'a' ? a : b)?.count ?? 1;
      const items = warChest({ fighters: await warFighters(db, war.id, side, battles), teams, seed: war.seed }, polish);
      next.chest_items = items.length;
      statements.push(db.prepare('UPDATE guild_wars SET chest_items = ? WHERE id = ?').bind(items.length, war.id), ...warChestStatements(db, winner, items, now));
    }
  }
  try {
    await db.batch(statements);
  } catch (error) {
    if (lost(error)) return null;
    throw error;
  }
  return next;
}

// The characters who fought for a side in a war (its battles kept and those
// of the evening being fought), each once, as it fought last, for the war
// chest's items.
async function warFighters(db, warId, side, evening) {
  const { results } = await db.prepare('SELECT fighters FROM guild_war_battles WHERE war_id = ? ORDER BY day, number').bind(warId).all();
  const latest = new Map();
  for (const fighters of [...results.map((row) => JSON.parse(row.fighters)), ...evening.map((battle) => battle.fighters)]) {
    for (const one of fighters[side]) if (one.id !== null) latest.set(one.id, { classId: one.classId, level: one.level, classLevel: one.classLevel });
  }
  return [...latest.values()];
}

// The evenings a war owes (`due` of them on its week, `week`), fought in
// turn. An evening another run fought first is not fought again: the war
// is read as it is then and the evenings after it go on, so a run ends only
// once all the evenings owed are fought, by it or by another (11.11.2026:
// else last week's Sława could be frozen before its war's Sunday was
// fought, guild-fame.js). It stops when the war did not move.
async function settleWar(db, war, week, due, now) {
  const owed = Math.min(due, WAR_DAYS);
  let current = war;
  while (current.days_done < owed) {
    const day = current.days_done;
    const fought = await fightEvening(db, current, day, week.battles[day], now);
    if (fought) {
      current = fought;
      continue;
    }
    const stored = await db.prepare('SELECT * FROM guild_wars WHERE id = ?').bind(current.id).first();
    if (!stored || stored.days_done <= day) return;
    current = stored;
  }
}

// The guilds' rivals of the week (797 B), drawn once, while its first
// battles have not come (12): among the guilds in no war this week (a test
// war may be on), as the engine pairs them (drawWars), with their names,
// tags and members now. The draw also takes the wars of the weeks before
// the one before, and their battles. Two runs at once draw once: the week's
// row comes first in the batch.
async function drawWeek(db, week, now) {
  if (now >= week.battles[0]) return;
  if (await db.prepare('SELECT 1 FROM guild_war_weeks WHERE week = ?').bind(week.key).first()) return;
  const { results } = await db
    .prepare(
      `SELECT g.id, g.name, g.tag, COUNT(*) AS members, json_group_array(DISTINCT c.user_id) AS users
       FROM guilds g JOIN guild_members m ON m.guild_id = g.id JOIN characters c ON c.id = m.character_id
       WHERE NOT EXISTS (SELECT 1 FROM guild_wars w WHERE w.week = ? AND (w.guild_a = g.id OR w.guild_b = g.id))
       GROUP BY g.id`,
    )
    .bind(week.key)
    .all();
  const seed = newSeed();
  const pairs = drawWars(
    results.map((row) => ({ ...row, users: JSON.parse(row.users) })),
    seed,
    content(),
  );
  const previous = warWeek(week.startsAt - 1, content()).key;
  try {
    await db.batch([
      db.prepare('INSERT INTO guild_war_weeks (week, seed, drawn_at) VALUES (?, ?, ?)').bind(week.key, seed, now),
      ...pairs.map(([one, other], index) =>
        db
          .prepare('INSERT INTO guild_wars (week, guild_a, guild_b, name_a, tag_a, members_a, name_b, tag_b, members_b, seed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(week.key, one.id, other.id, one.name, one.tag, one.members, other.name, other.tag, other.members, `${seed}:${index}`, now),
      ),
      db.prepare('DELETE FROM guild_war_battles WHERE war_id IN (SELECT id FROM guild_wars WHERE week < ?)').bind(previous),
      db.prepare('DELETE FROM guild_wars WHERE week < ?').bind(previous),
      db.prepare('DELETE FROM guild_war_weeks WHERE week < ?').bind(previous),
    ]);
  } catch (error) {
    if (!lost(error)) throw error;
  }
}

// What the wars owe by `now`: this week's rivals drawn (drawWeek), and the
// evenings come of this week's wars and of last week's still unfinished,
// fought; with `guildId`, only that guild's war (a look at it). The cron
// runs it every minute (index.js), and before the Sława of last week is
// frozen (guild-fame.js) it finishes last week's wars.
export async function settleWars(db, now, { guildId = null } = {}) {
  if (!guildWarsOn() || !rules()) return;
  const week = warWeek(now, content());
  await drawWeek(db, week, now);
  const previous = warWeek(week.startsAt - 1, content());
  const due = warDaysDue(week, now);
  const only = guildId === null ? '' : ' AND (guild_a = ? OR guild_b = ?)';
  const { results } = await db
    .prepare(`SELECT * FROM guild_wars WHERE ((week = ? AND days_done < ?) OR (week = ? AND days_done < ?))${only} ORDER BY id`)
    .bind(week.key, due, previous.key, WAR_DAYS, ...(guildId === null ? [] : [guildId, guildId]))
    .all();
  // One war's error leaves the others to be fought; it is thrown after them
  // (the cron writes it in the log, guild-fame.js does not freeze the week
  // while a war of it is unfinished).
  let failure = null;
  for (const war of results) {
    try {
      if (war.week === week.key) await settleWar(db, war, week, due, now);
      else await settleWar(db, war, previous, WAR_DAYS, now);
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure) throw failure;
}

// The words of the tab, with the rules' numbers in its "Jak to działa?"
// (the gold for a character of `level`).
function viewTexts(level = 1) {
  const war = rules();
  const texts = words();
  const fame = content().guilds.fame.war.won;
  const reward = warReward(level, content());
  const vars = {
    size: war.teamSize,
    max: war.maxTeams,
    hour: hourText(),
    fame: `${fame} ${countedForm(fame, texts.fameForms)}`,
    gold: numberText(reward.gold),
    systemPoints: `${reward.systemPoints} ${countedForm(reward.systemPoints, texts.systemPointForms)}`,
  };
  const { errors: _, ...rest } = texts;
  return { ...rest, how: texts.how.map((line) => filled(line, vars)) };
}

// The hour of the battles as the clock shows it ("20:00").
const hourText = () => `${rules().battleHour}:00`;

// A member as the tab shows it: its bust's look, name, class, level and
// role in the guild.
function memberView(row) {
  const character = engineCharacter(row);
  return {
    id: row.id,
    name: row.name,
    nameColor: nameColorOf(row.cosmetics),
    classId: row.class_id,
    className: classNameOf(character, content()),
    level: row.level,
    appearance: row.appearance,
    skin: character.skin,
    evolution: row.evolution ?? null,
    outfit: character.outfit ?? null,
    role: row.guild_role,
  };
}

// A fighter of a battle as kept (fighterRecord), with its class's name in
// the page's language.
const fighterView = ({ since: _, ...one }) => ({ ...one, className: classNameOf({ classId: one.classId, evolution: one.evolution, appearance: one.appearance, level: one.level }, content()) });

// A battle in the list of the war's battles, from the side of guild `side`:
// its day, number and time, the teams, the result ('win', 'loss' or
// 'draw') and what the character who looks got in it, if it fought.
function battleLine(row, side, viewer) {
  const fighters = JSON.parse(row.fighters);
  const other = side === 'a' ? 'b' : 'a';
  // A character given the id of one removed (the database gives the
  // highest again) did not fight its battles: the one that fought was made
  // at another time (battles from before 0.2.69 have no `since`).
  const own = fighters[side].find((one) => one.id === viewer.id && (one.since === undefined || one.since === viewer.created_at));
  return {
    id: row.id,
    day: row.day,
    number: row.number,
    at: row.at,
    ourTeam: side === 'a' ? row.team_a : row.team_b,
    theirTeam: side === 'a' ? row.team_b : row.team_a,
    result: row.result === 'draw' ? 'draw' : row.result === side ? 'win' : 'loss',
    fought: Boolean(own),
    reward: own?.gold !== undefined ? { gold: own.gold, systemPoints: own.systemPoints } : null,
    replay: Boolean(row.replay),
    _fighters: { ours: fighters[side], theirs: fighters[other], standing: { ours: fighters.standing[side], theirs: fighters.standing[other] } },
  };
}

// The war of this week for the tab, from the side of `guild`: both guilds
// (names, tags, members and teams now), the score in battles won, the
// evenings (each with its battles won and lost), the battles fought, the
// next evening with how many battles and how often each of the guild's
// teams fights, and its end with what the guild got; null without a war.
async function warOf(db, guild, ours, week, viewer, now) {
  const war = await db.prepare('SELECT * FROM guild_wars WHERE week = ? AND (guild_a = ? OR guild_b = ?)').bind(week.key, guild.id, guild.id).first();
  if (!war) return null;
  const side = war.guild_a === guild.id ? 'a' : 'b';
  const theirId = side === 'a' ? war.guild_b : war.guild_a;
  const mirror = war.guild_b === null;
  const [{ results: rows }, theirs] = await Promise.all([
    db.prepare('SELECT id, day, number, team_a, team_b, result, at, fighters, log IS NOT NULL AS replay FROM guild_war_battles WHERE war_id = ? ORDER BY day DESC, number DESC').bind(war.id).all(),
    mirror ? null : db.prepare('SELECT g.name, g.tag, (SELECT COUNT(*) FROM guild_members m WHERE m.guild_id = g.id) AS members FROM guilds g WHERE g.id = ?').bind(theirId).first(),
  ]);
  const battles = rows.map((row) => battleLine(row, side, viewer));
  const theirMembers = mirror ? ours.members.length : (theirs?.members ?? 0);
  const theirTeams = mirror ? war.mirror_teams : theirMembers > 0 ? warTeams(theirMembers, content()) : 0;
  const mirrorWords = rules().mirror;
  const score = side === 'a' ? [war.wins_a, war.wins_b] : [war.wins_b, war.wins_a];
  const days = Array.from({ length: WAR_DAYS }, (_, day) => {
    const evening = battles.filter((battle) => battle.day === day);
    return {
      day,
      at: week.battles[day],
      fought: day >= war.first_day && day < war.days_done,
      skipped: day < war.first_day,
      wins: [evening.filter((battle) => battle.result === 'win').length, evening.filter((battle) => battle.result === 'loss').length],
    };
  });
  const ended = war.days_done >= WAR_DAYS;
  const nextDay = ended ? null : war.days_done;
  const result = war.result === null ? null : war.result === 'draw' ? 'draw' : war.result === side ? 'win' : 'loss';
  const won = result === 'win';
  return {
    id: war.id,
    test: mirror,
    ours: { name: guild.name, tag: guild.tag, members: ours.members.length, teams: ours.count },
    theirs: mirror
      ? { name: mirrorWords.name, tag: mirrorWords.tag, members: theirMembers, teams: theirTeams }
      : { name: theirs?.name ?? (side === 'a' ? war.name_b : war.name_a), tag: theirs?.tag ?? (side === 'a' ? war.tag_b : war.tag_a), members: theirMembers, teams: theirTeams, gone: !theirs },
    score,
    firstDay: war.first_day,
    days,
    battles: battles.map(({ _fighters, ...line }) => line),
    next:
      nextDay === null
        ? null
        : {
            day: nextDay,
            at: week.battles[nextDay],
            battles: theirTeams > 0 ? Math.max(ours.count, theirTeams) : 0,
            fights: theirTeams > 0 ? teamFights(ours.count, theirTeams) : [],
          },
    result,
    end: won ? { fame: content().guilds.fame.war.won, items: war.chest_items ?? 0 } : null,
    now,
  };
}

// Why the guild has no war this week: the week not drawn yet (the wars
// came after its Monday's battles, or it is before them), the guild made
// after the draw, or no rival of a similar size.
async function noWarReason(db, guild, week) {
  const [drawn, made] = await Promise.all([
    db.prepare('SELECT drawn_at FROM guild_war_weeks WHERE week = ?').bind(week.key).first(),
    db.prepare('SELECT created_at FROM guilds WHERE id = ?').bind(guild.id).first(),
  ]);
  if (!drawn) return 'notYet';
  return (made?.created_at ?? 0) > drawn.drawn_at ? 'late' : 'noRival';
}

// The tab for a member of `guild`: its teams (each with its members in
// their places, by place; the reserve; who fights where now; the next team
// and the members it needs), the members by id, the war of the week or why
// there is none, the numbers of the rules, the words, and "Test wojny"
// for a tester of the test version.
async function warView(db, player, guild, now, tester) {
  const week = warWeek(now, content());
  const ours = await teamsOf(db, guild.id);
  const war = await warOf(db, guild, ours, week, player.row, now);
  const { teamSize, maxTeams } = rules();
  const lineupTeam = ours.lineups.findIndex((lineup) => lineup.includes(player.row.id));
  const assignedTeam = ours.assigned.findIndex((team) => team.includes(player.row.id));
  return {
    guild: { id: guild.id, name: guild.name, tag: guild.tag, role: guild.role },
    me: { id: player.row.id, team: assignedTeam >= 0 ? assignedTeam + 1 : null, fights: lineupTeam >= 0 ? lineupTeam + 1 : null },
    teams: {
      count: ours.count,
      size: teamSize,
      max: maxTeams,
      members: ours.members.length,
      assigned: ours.assigned,
      reserve: ours.reserve,
      lineups: ours.lineups,
      next: nextTeamAt(ours.members.length, content()),
    },
    members: Object.fromEntries(ours.members.map((row) => [row.id, memberView(row)])),
    week: { key: week.key, startsAt: week.startsAt, endsAt: week.endsAt, today: week.today, battles: week.battles },
    war,
    none: war ? null : await noWarReason(db, guild, week),
    hour: hourText(),
    // The pictures: the Arena behind the war, the board under its battles
    // and the Siedziba's Sztandar of the banners.
    backdrop: rules().backdrop,
    fightBoard: rules().fightBoard,
    banner: rules().banner,
    texts: viewTexts(player.row.level),
    test: tester ? { start: !war, fight: Boolean(war) && war.next !== null, end: Boolean(war?.test), teams: ours.count } : null,
    now,
  };
}

// Whether the one who asks may use "Test wojny" (the test version's
// testers, as "Testuj Osadę").
const testerOf = (context, session) => tutorialTestsFor(context.env, session.user.login);

// GET /api/guild/war: the Wojna tab; the war's evenings owed fought first.
// Outside a guild, only the words.
export async function getGuildWar(context) {
  requireWars();
  const { session, player, guild, db } = await guildPlayer(context, errors());
  if (!guild) return json({ guild: null, texts: viewTexts(player.row.level) });
  // The tab shows the war as it is, should its evenings fail to be fought.
  await settleWars(db, context.now, { guildId: guild.id }).catch((error) => console.error(error));
  return json(await warView(db, player, guild, context.now, testerOf(context, session)));
}

// GET /api/guild/war/battles/:id: a battle of the guild's war with its log
// for the playback (src/client/arena.js), in the page's language, from the
// guild's side, its team at the bottom; its fighters, who stayed on their
// feet and what the character who looks got.
export async function getGuildWarBattle(context) {
  requireWars();
  const { player, guild, db } = await requireMember(context, errors());
  const id = Number(context.params.id);
  const missing = () => new ApiError(404, 'no_battle', errors().noBattle);
  if (!Number.isSafeInteger(id)) throw missing();
  const row = await db
    .prepare('SELECT b.*, b.log IS NOT NULL AS replay, w.guild_a, w.guild_b, w.name_a, w.tag_a, w.name_b, w.tag_b FROM guild_war_battles b JOIN guild_wars w ON w.id = b.war_id WHERE b.id = ? AND (w.guild_a = ? OR w.guild_b = ?)')
    .bind(id, guild.id, guild.id)
    .first();
  if (!row?.log) throw missing();
  const side = row.guild_a === guild.id ? 'a' : 'b';
  const { _fighters, ...line } = battleLine(row, side, player.row);
  const mirror = row.guild_b === null;
  const tags = { a: row.tag_a, b: mirror ? rules().mirror.tag : row.tag_b };
  const fight = warFightFor(await unpack(language() === 'en' && row.log_en ? row.log_en : row.log), side);
  return json({
    battle: {
      ...line,
      ourTag: tags[side],
      theirTag: tags[side === 'a' ? 'b' : 'a'],
      ours: _fighters.ours.map(fighterView),
      theirs: _fighters.theirs.map(fighterView),
      standing: _fighters.standing,
      fight,
    },
  });
}

// POST /api/guild/war/place { characterId, team, swapWith }: a member into a
// team (796 A): `team` from 1, or 0 for the reserve. Each member places
// itself (characterId left out, or its own): into a free place ("Zajmij")
// or the reserve; the leader and the deputies place anyone, also into the
// place of another member of the team (`swapWith`), who takes the moved
// one's place, or the reserve. One batch over the places as read: two taps
// at once take a place once, and none is lost or doubled.
export async function placeInWarTeam(context) {
  requireWars();
  const { session, player, guild, db } = await requireMember(context, errors());
  const now = context.now;
  const body = await readJson(context.request);
  const characterId = body.characterId === undefined || body.characterId === null ? player.row.id : body.characterId;
  if (!Number.isInteger(characterId)) throw new ApiError(400, 'invalid_member', errors().noMember);
  const lead = guild.role === 'leader' || guild.role === 'deputy';
  if (characterId !== player.row.id && !lead) throw new ApiError(403, 'not_allowed', errors().notAllowed);
  const ours = await teamsOf(db, guild.id);
  const mover = ours.members.find((row) => row.id === characterId);
  if (!mover) throw new ApiError(404, 'no_member', errors().noMember);
  const team = body.team;
  if (!Number.isInteger(team) || team < 0 || team > ours.count) throw new ApiError(400, 'no_team', errors().noTeam);
  const rowOf = (id) => ours.slots.find((one) => one.characterId === id) ?? null;
  const placeOf = (one) => (one ? `${one.team}:${one.slot}` : '');
  // A place left in another guild (a membership gone with its guild,
  // guilds.js: guildOf) is no place here, and goes with the move.
  const kept = (id, one) => assertion(db, "COALESCE((SELECT team || ':' || slot FROM guild_war_slots WHERE character_id = ? AND guild_id = ?), '') = ?", [id, guild.id, placeOf(one)]);
  const inGuild = (id) => assertion(db, 'EXISTS (SELECT 1 FROM guild_members WHERE character_id = ? AND guild_id = ?)', [id, guild.id]);
  const insert = (id, place) => db.prepare('INSERT INTO guild_war_slots (character_id, guild_id, team, slot, placed_at) VALUES (?, ?, ?, ?, ?)').bind(id, guild.id, place.team, place.slot, now);
  const remove = (id) => db.prepare('DELETE FROM guild_war_slots WHERE character_id = ?').bind(id);
  const own = rowOf(characterId);
  // Its place now: one of a team the guild has, else the reserve.
  const current = own && own.team <= ours.count ? own : null;
  const statements = [kept(characterId, own), inGuild(characterId)];
  let text;
  if (team === 0) {
    if (!current) throw new ApiError(409, 'same', errors().same);
    statements.push(remove(characterId));
    text = filled(words().movedReserve, { name: mover.name });
  } else if (current?.team === team) {
    throw new ApiError(409, 'same', errors().same);
  } else if (body.swapWith !== undefined && body.swapWith !== null) {
    if (!lead) throw new ApiError(403, 'not_allowed', errors().notAllowed);
    const partner = ours.members.find((row) => row.id === body.swapWith);
    const there = partner && rowOf(partner.id);
    if (!there || there.team !== team) throw changed();
    statements.push(kept(partner.id, there), inGuild(partner.id), remove(characterId), remove(partner.id), insert(characterId, there));
    if (current) statements.push(insert(partner.id, current));
    text = filled(words().swapped, { name: mover.name, other: partner.name });
  } else {
    const used = new Set(ours.slots.filter((one) => one.team === team).map((one) => one.slot));
    const slot = Array.from({ length: rules().teamSize }, (_, index) => index).find((index) => !used.has(index));
    if (slot === undefined) throw new ApiError(409, 'full', errors().full);
    statements.push(remove(characterId), insert(characterId, { team, slot }));
    text = characterId === player.row.id ? filled(words().taken, { team: roman(team) }) : filled(words().moved, { name: mover.name, team: roman(team) });
  }
  try {
    await db.batch(statements);
  } catch (error) {
    if (lost(error)) throw changed();
    throw error;
  }
  return json({ ...(await warView(db, player, guild, now, testerOf(context, session))), text });
}

// A team's number as the page writes it: I to VI.
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const roman = (team) => ROMAN[team - 1] ?? String(team);

// POST /api/test/guild-war { action, teams }, "Test wojny" on the test
// version (DECISIONS.md, "Wojny gildii na wersji testowej"): "start" begins
// at once, for a guild with no war this week, a war with the mirror guild
// (data `war.mirror`), whose `teams` teams (1 to maxTeams; the guild's own
// count without it) fight as the guild's own, each under other names; its
// battles start today. "fight" fights the next evening the guild's war owes
// at once, today's or a day ahead, so a whole week passes in seven taps.
// "end" takes a mirror war back, with its battles (what they gave stays).
export async function testGuildWar(context) {
  requireWars();
  const { session, player, guild, db } = await requireMember(context, errors());
  if (!testerOf(context, session)) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  const now = context.now;
  const body = await readJson(context.request);
  const week = warWeek(now, content());
  const war = await db.prepare('SELECT * FROM guild_wars WHERE week = ? AND (guild_a = ? OR guild_b = ?)').bind(week.key, guild.id, guild.id).first();
  if (body.action === 'start') {
    if (war) throw new ApiError(409, 'at_war', 'W tym tygodniu gildia już ma wojnę.');
    const ours = await teamsOf(db, guild.id);
    const teams = body.teams === undefined || body.teams === null ? ours.count : body.teams;
    if (!Number.isInteger(teams) || teams < 1 || teams > rules().maxTeams) throw new ApiError(400, 'invalid_teams', 'Wybierz od 1 do 6 drużyn.');
    await db
      .prepare(
        `INSERT INTO guild_wars (week, guild_a, guild_b, name_a, tag_a, members_a, name_b, tag_b, members_b, mirror_teams, seed, first_day, days_done, created_at)
         VALUES (?, ?, NULL, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(week.key, guild.id, guild.name, guild.tag, ours.members.length, ours.members.length, teams, newSeed(), week.today, week.today, now)
      .run();
  } else if (body.action === 'fight') {
    if (!war || war.days_done >= WAR_DAYS) throw new ApiError(409, 'no_war', 'Nie ma wojny, której bitwy można by teraz rozegrać.');
    if (!(await fightEvening(db, war, war.days_done, week.battles[war.days_done], now))) throw changed();
  } else if (body.action === 'end') {
    if (!war || war.guild_b !== null) throw new ApiError(409, 'no_war', 'Nie ma wojny testowej do zakończenia.');
    await db.batch([db.prepare('DELETE FROM guild_war_battles WHERE war_id = ?').bind(war.id), db.prepare('DELETE FROM guild_wars WHERE id = ?').bind(war.id)]);
  } else {
    throw new ApiError(400, 'invalid_action', 'Nie ma takiego testu.');
  }
  return json(await warView(db, player, guild, now, true));
}

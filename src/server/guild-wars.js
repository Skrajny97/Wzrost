// The guild wars as a league (data/guilds.json `war`; src/engine/guild-wars.js
// has the rules; DECISIONS.md, "Wojny gildii: odpowiedzi autora 792–800",
// "Wojny gildii na wersji testowej" and "Liga wojen gildii"), only where
// GUILD_WARS is on (features.js), in the Gildia's Wojna tab
// (src/client/guild-war.js).
//
// A league lasts a week, from Monday to Sunday (Polish time). Its matches
// are drawn once a week, at the first run of the cron (or the first look)
// of the week, for every guild there is then, each meeting every other one
// once (the author, 16.11.2026: „niech każda gildia walczy z każdą”, „każda
// z każdą gildią 1v1 i 3v3 i tyle”), from the first evening whose battles
// have not come yet; with an odd number of guilds one has each round's
// evening free („żadnych lustrzanych gildii”). Every evening at 20:00 the
// cron fights the matches of the evening (settleWars), and a look at
// the tab fights any of its guild's matches owed, should the cron have
// missed them; each match is one batch that holds only while the match is
// unfought, so its battles are fought and their rewards given once,
// whoever comes first. After Sunday's matches the league ends, once: the
// places of its table, the Sława of the best (guild-fame.js) and their war
// chests in their Skrzynia (guild-chest.js).
//
// The teams are drawn by the game for every evening (the author:
// „drużyny niech losuje samo”), from the guild's members as they are then,
// with the seed of the guild's evening, so the tab shows the same teams
// before the battles. On the test version, "Test ligi" fights the next
// evening of the whole league at a tap and draws the league again from
// today.

import {
  classNameOf,
  countedForm,
  leaguePrizes,
  leagueSchedule,
  leagueTable,
  matchFights,
  nextTeamAt,
  WAR_DAYS,
  warBattle,
  warChest,
  warDaysDue,
  warDrawnTeams,
  warFightFor,
  warResult,
  warReward,
  warRules,
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
// A batch that failed on its assertion or on a row of the league another
// run wrote meanwhile (the week drawn, a match fought, the places written);
// any other error is one (11.11.2026: a constraint of another kind is no
// race, and is told).
const lost = (error) => raced(error) || /UNIQUE constraint failed: (guild_war|guild_league)/i.test(String(error?.message ?? error));

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

// The seed of a guild's teams on an evening of a week's league: one for all
// its matches of that evening, and for the tab's look at them before.
const teamSeed = (league, day, guildId) => `${league.seed}:${day}:${guildId}`;

// A guild's teams for an evening (warDrawnTeams), drawn from its members as
// they are now with `seed`, with its members as stored; null for a guild
// that is gone.
async function teamsOf(db, guildId, seed) {
  if (guildId === null) return null;
  const members = await membersOf(db, guildId);
  if (members.length === 0) return null;
  return { members, ...warDrawnTeams(members.map((row) => row.id), seed, content()) };
}

// A guild's trios for an evening of a league, fixed at the first run of
// its day (the author's 1037.1 A, 16.11.2026: trios drawn once, at
// midnight, and kept): as stored (guild_war_lineups), of the members still
// in the guild (one gone leaves its place empty: its trio short, losing by
// walkover), the members who joined since in none (the bench: they fight
// the 1v1 only). For an evening whose trios are not fixed yet (a day to
// come), drawn from the members now (teamsOf). Null for a guild gone.
async function teamsFor(db, league, day, guildId) {
  if (guildId === null) return null;
  const row = await db.prepare('SELECT lineups FROM guild_war_lineups WHERE week = ? AND day = ? AND guild_id = ?').bind(league.week, day, guildId).first();
  if (!row) return teamsOf(db, guildId, teamSeed(league, day, guildId));
  const members = await membersOf(db, guildId);
  if (members.length === 0) return null;
  const here = new Set(members.map((one) => one.id));
  const lineups = JSON.parse(row.lineups).map((lineup) => lineup.filter((id) => here.has(id)));
  const placed = new Set(lineups.flat());
  return { members, count: lineups.length, lineups, bench: members.map((one) => one.id).filter((id) => !placed.has(id)) };
}

// Today's trios fixed (teamsFor), at the first run of the day: for each
// guild with a match of the league today still to come and no trios kept,
// drawn from its members then. The cron runs it every minute, so from
// midnight; two runs at once keep the first.
async function fixLineups(db, league, week, now) {
  const day = week.today;
  const { results: matches } = await db.prepare('SELECT guild_a, guild_b FROM guild_wars WHERE week = ? AND day = ? AND days_done = 0').bind(league.week, day).all();
  if (matches.length === 0) return;
  const { results: kept } = await db.prepare('SELECT guild_id FROM guild_war_lineups WHERE week = ? AND day = ?').bind(league.week, day).all();
  const fixed = new Set(kept.map((row) => row.guild_id));
  const guilds = [...new Set(matches.flatMap((match) => [match.guild_a, match.guild_b]))].filter((id) => id !== null && !fixed.has(id));
  const statements = [];
  for (const guildId of guilds) {
    const teams = await teamsOf(db, guildId, teamSeed(league, day, guildId));
    if (teams) statements.push(db.prepare('INSERT OR IGNORE INTO guild_war_lineups (week, day, guild_id, lineups, drawn_at) VALUES (?, ?, ?, ?, ?)').bind(league.week, day, guildId, JSON.stringify(teams.lineups), now));
  }
  if (statements.length > 0) await db.batch(statements);
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

// The league of a week: its row (seed, first evening, its guilds in the
// drawn order with their names and tags then, when it ended), or null.
async function leagueOf(db, weekKey) {
  const row = await db.prepare('SELECT * FROM guild_war_weeks WHERE week = ?').bind(weekKey).first();
  return row ? { ...row, guilds: JSON.parse(row.guilds ?? '[]') } : null;
}

// The matches of a week's league, as stored, by evening and round.
async function matchesOf(db, weekKey) {
  const { results } = await db.prepare('SELECT * FROM guild_wars WHERE week = ? ORDER BY day, round, id').bind(weekKey).all();
  return results;
}

// The rows of a match's fights, ROWS to a statement, for D1's limit of
// bound values in one (11 a row).
const ROWS = 9;
function fightRows(db, matchId, day, at, fights) {
  const statements = [];
  for (let start = 0; start < fights.length; start += ROWS) {
    const chunk = fights.slice(start, start + ROWS);
    statements.push(
      db
        .prepare(`INSERT INTO guild_war_battles (war_id, day, number, format, team_a, team_b, result, at, fighters, log, log_en) VALUES ${chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`)
        .bind(...chunk.flatMap((fight) => [matchId, day, fight.number, fight.format, fight.teamA, fight.teamB, fight.result, at, JSON.stringify(fight.fighters), fight.log, fight.logEn])),
    );
  }
  return statements;
}

// One match of a league (a row of guild_wars, its evening's fights at
// `at`; the author, 16.11.2026: „w formułach 1v1 i 3v3, gdzie drużyny
// dobierane są automatycznie i walczy każdy z każdym”, „walkower jak brakuje
// członków do obsadzenia wszystkich drużyn liczony jako porażka”): every
// member of one guild duels every member of the other (1v1), and every trio
// of one, drawn for the evening, fights every trio of the other (3v3); a
// trio short of members loses its fights by walkover (matchFights). Each
// fight from the match's seed, its log in Polish and, where English is on,
// in English too (the same fight: its texts take no draws). Every fight won
// brings its fighters gold, and every character who fought for the guild
// that won the match its Punkty Systemu, once (799 A). Characters of one
// account on both sides fight each other too (the author, 16.11.2026:
// „jeśli ktoś ma postać w gildii przeciwnej to niech walczą ze sobą”; till
// then such an account fought on neither side, and its trios, short, lost
// their fights by walkover). A side with nobody makes the match void,
// counted for neither. A guild that is gone loses
// its matches left, and two gone draw. The match's result by the balance of
// its fights won and lost, walkovers too. In one batch that holds only
// while the match is unfought. Gives whether it was this run that fought it.
async function fightMatch(db, league, match, at, now) {
  const polish = contentIn('pl');
  const english = englishOn() ? contentIn('en') : null;
  const a = await teamsFor(db, league, match.day, match.guild_a);
  const b = await teamsFor(db, league, match.day, match.guild_b);
  const fights = [];
  const gold = new Map();
  const fought = { a: new Set(), b: new Set() };
  const tally = { winsA: 0, winsB: 0, lossesA: 0, lossesB: 0, walkoversA: 0, walkoversB: 0, draws: 0 };
  let result = null;
  if (!a || !b) result = a ? 'a' : b ? 'b' : 'draw';
  else {
    const fighters = new Map([...(await fightersOf(db, a.members)), ...(await fightersOf(db, b.members))]);
    const able = (ids) => ids.map((id) => fighters.get(id)).filter(Boolean);
    const duelsA = able(a.members.map((row) => row.id));
    const duelsB = able(b.members.map((row) => row.id));
    const triosA = a.lineups.map(able);
    const triosB = b.lineups.map(able);
    if (duelsA.length === 0 || duelsB.length === 0) result = 'void';
    else {
      for (const [number, fight] of matchFights({ duelsA: duelsA.length, duelsB: duelsB.length, triosA, triosB }, polish).entries()) {
        if (fight.walkover) {
          if (fight.walkover !== 'b') {
            tally.lossesA += 1;
            tally.walkoversA += 1;
          }
          if (fight.walkover !== 'a') {
            tally.lossesB += 1;
            tally.walkoversB += 1;
          }
          if (fight.walkover === 'a') tally.winsB += 1;
          if (fight.walkover === 'b') tally.winsA += 1;
          continue;
        }
        const seed = `${match.seed}:${fight.format}:${fight.a}:${fight.b}`;
        const sideA = fight.format === '1v1' ? [duelsA[fight.a]] : triosA[fight.a];
        const sideB = fight.format === '1v1' ? [duelsB[fight.b]] : triosB[fight.b];
        const battle = warBattle({ sideA, sideB, seed }, polish);
        if (battle.result === 'a') {
          tally.winsA += 1;
          tally.lossesB += 1;
        } else if (battle.result === 'b') {
          tally.winsB += 1;
          tally.lossesA += 1;
        } else tally.draws += 1;
        const record = (side, list) =>
          list.map((one) => {
            fought[side].add(one.row.id);
            if (battle.result !== side) return fighterRecord(one);
            const reward = warReward(one.character.level, polish);
            gold.set(one.row.id, (gold.get(one.row.id) ?? 0) + reward.gold);
            return fighterRecord(one, { gold: reward.gold });
          });
        fights.push({
          number,
          format: fight.format,
          teamA: fight.a + 1,
          teamB: fight.b + 1,
          result: battle.result,
          fighters: { a: record('a', sideA), b: record('b', sideB), standing: battle.standing },
          log: await pack(battle.fight),
          logEn: english ? await pack(warBattle({ sideA, sideB, seed }, english).fight) : null,
        });
      }
      result = warResult(tally.winsA - tally.lossesA, tally.winsB - tally.lossesB);
    }
  }
  // The Punkty Systemu of the match won, once for each who fought in it.
  const points = new Map();
  const { systemPoints } = warRules(polish).reward;
  if ((result === 'a' || result === 'b') && systemPoints > 0) for (const id of fought[result]) points.set(id, systemPoints);
  const ids = [...new Set([...gold.keys(), ...points.keys()])];
  const statements = [
    assertion(db, '(SELECT days_done FROM guild_wars WHERE id = ?) = 0', [match.id]),
    ...fightRows(db, match.id, match.day, at, fights),
    ...ids.map((id) => db.prepare('UPDATE characters SET gold = gold + ?, system_points = system_points + ? WHERE id = ?').bind(gold.get(id) ?? 0, points.get(id) ?? 0, id)),
    db
      .prepare('UPDATE guild_wars SET days_done = 1, wins_a = ?, wins_b = ?, losses_a = ?, losses_b = ?, walkovers_a = ?, walkovers_b = ?, draws = ?, result = ?, ended_at = ? WHERE id = ?')
      .bind(tally.winsA, tally.winsB, tally.lossesA, tally.lossesB, tally.walkoversA, tally.walkoversB, tally.draws, result, now, match.id),
  ];
  try {
    await db.batch(statements);
  } catch (error) {
    if (lost(error)) return false;
    throw error;
  }
  return true;
}

// The table of a week's league (leagueTable) from its matches as stored.
const tableOf = (league, matches) =>
  leagueTable(
    league.guilds.map((guild) => guild.id),
    matches.map((match) => ({
      a: match.guild_a,
      b: match.guild_b,
      winsA: match.wins_a,
      winsB: match.wins_b,
      lossesA: match.losses_a,
      lossesB: match.losses_b,
      result: match.days_done > 0 ? match.result : null,
    })),
  );

// The characters who fought for a guild in a week's league, each once, as
// it fought last, for its war chest.
async function leagueFighters(db, weekKey, guildId) {
  const { results } = await db
    .prepare(
      `SELECT b.fighters, CASE WHEN w.guild_a = ? THEN 'a' ELSE 'b' END AS side FROM guild_war_battles b JOIN guild_wars w ON w.id = b.war_id
       WHERE w.week = ? AND (w.guild_a = ? OR w.guild_b = ?) ORDER BY w.day, w.round, b.number`,
    )
    .bind(guildId, weekKey, guildId, guildId)
    .all();
  const latest = new Map();
  for (const row of results) {
    for (const one of JSON.parse(row.fighters)[row.side]) if (one.id !== null) latest.set(one.id, { classId: one.classId, level: one.level, classLevel: one.classLevel });
  }
  return [...latest.values()];
}

// The end of a week's league, once all its matches are fought: the places
// of its table for every guild of it, and for the best places (leaguePrizes)
// their Sława and the items of their war chests, each chest in its guild's
// Skrzynia. In one batch that holds only while the league has not ended.
async function endLeague(db, league, now) {
  if (league.ended_at !== null) return;
  const matches = await matchesOf(db, league.week);
  if (matches.some((match) => match.days_done === 0)) return;
  const table = tableOf(league, matches);
  const { results: sizes } = await db.prepare('SELECT guild_id, COUNT(*) AS members FROM guild_members GROUP BY guild_id').all();
  const members = new Map(sizes.map((row) => [row.guild_id, row.members]));
  const prizes = new Map(leaguePrizes(table, content()).map((prize) => [prize.id, prize]));
  const chests = [];
  for (const prize of prizes.values()) {
    if (prize.items === 0 || !members.has(prize.id)) continue;
    const items = warChest({ fighters: await leagueFighters(db, league.week, prize.id), teams: prize.items / rules().chest.perTeam, seed: `${league.seed}:${prize.place}` }, contentIn('pl'));
    chests.push(...warChestStatements(db, prize.id, items, now));
    prize.items = items.length;
  }
  try {
    await db.batch([
      assertion(db, '(SELECT ended_at FROM guild_war_weeks WHERE week = ?) IS NULL', [league.week]),
      db.prepare('UPDATE guild_war_weeks SET ended_at = ? WHERE week = ?').bind(now, league.week),
      ...table.map((row) =>
        db
          .prepare('INSERT INTO guild_league_places (week, guild_id, place, fame, chest_items) VALUES (?, ?, ?, ?, ?)')
          .bind(league.week, row.id, row.place, prizes.get(row.id)?.fame ?? 0, prizes.get(row.id)?.items ?? 0),
      ),
      ...chests,
    ]);
  } catch (error) {
    if (!lost(error)) throw error;
  }
}

// The league of a week, drawn once, at its first run (or look): the guilds
// with members then, every one meeting every other (leagueSchedule) on the
// evenings from the first whose battles have not come (or from `firstDay`,
// the test version's new draw), with their names, tags and members then.
// A week drawn after its Sunday's battles has no matches, and ends at once.
// The draw also takes the leagues of the weeks before the one before, with
// their matches, battles and places. Two runs at once draw once: the
// week's row comes first in the batch.
async function drawLeague(db, week, now, firstDay = null) {
  if (await db.prepare('SELECT 1 FROM guild_war_weeks WHERE week = ?').bind(week.key).first()) return;
  const coming = week.battles.findIndex((at) => at > now);
  const from = firstDay ?? (coming < 0 ? WAR_DAYS : coming);
  const { results } = await db.prepare('SELECT g.id, g.name, g.tag, COUNT(*) AS members FROM guilds g JOIN guild_members m ON m.guild_id = g.id GROUP BY g.id').all();
  const seed = newSeed();
  const { order, matches } = leagueSchedule(
    results.map((row) => row.id),
    seed,
    from,
  );
  const byId = new Map(results.map((row) => [row.id, row]));
  const guilds = matches.length === 0 ? [] : order.map((id) => ({ id, name: byId.get(id).name, tag: byId.get(id).tag }));
  const previous = warWeek(week.startsAt - 1, content()).key;
  try {
    await db.batch([
      db
        .prepare('INSERT INTO guild_war_weeks (week, seed, drawn_at, guilds, first_day, ended_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(week.key, seed, now, JSON.stringify(guilds), Math.min(from, WAR_DAYS), matches.length === 0 ? now : null),
      ...matches.map((match, index) => {
        const one = byId.get(match.a);
        const other = byId.get(match.b);
        return db
          .prepare('INSERT INTO guild_wars (week, day, round, guild_a, guild_b, name_a, tag_a, members_a, name_b, tag_b, members_b, seed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(week.key, match.day, match.round, one.id, other.id, one.name, one.tag, one.members, other.name, other.tag, other.members, `${seed}:${index}`, now);
      }),
      db.prepare('DELETE FROM guild_war_battles WHERE war_id IN (SELECT id FROM guild_wars WHERE week < ?)').bind(previous),
      db.prepare('DELETE FROM guild_wars WHERE week < ?').bind(previous),
      db.prepare('DELETE FROM guild_league_places WHERE week < ?').bind(previous),
      db.prepare('DELETE FROM guild_war_lineups WHERE week < ?').bind(previous),
      db.prepare('DELETE FROM guild_war_weeks WHERE week < ?').bind(previous),
    ]);
  } catch (error) {
    if (!lost(error)) throw error;
  }
}

// What the league owes by `now`: this week's matches drawn (drawLeague),
// the matches of the evenings come, of this week's league and of last
// week's still unfinished, fought; with `guildId`, only that guild's (a
// look at its tab). After Sunday's matches, the league's end (endLeague).
// The cron runs it every minute (index.js), and before the Sława of last
// week is frozen (guild-fame.js) it finishes last week's league.
export async function settleWars(db, now, { guildId = null } = {}) {
  if (!guildWarsOn() || !rules()) return;
  const week = warWeek(now, content());
  await drawLeague(db, week, now);
  const previous = warWeek(week.startsAt - 1, content());
  const only = guildId === null ? '' : ' AND (guild_a = ? OR guild_b = ?)';
  // One match's error leaves the others to be fought; it is thrown after
  // them (the cron writes it in the log, guild-fame.js does not freeze the
  // week while its league is unfinished).
  let failure = null;
  for (const [period, due] of [
    [previous, WAR_DAYS],
    [week, warDaysDue(week, now)],
  ]) {
    const league = await leagueOf(db, period.key);
    if (!league || league.ended_at !== null) continue;
    if (period === week && guildId === null) {
      try {
        await fixLineups(db, league, week, now);
      } catch (error) {
        failure ??= error;
      }
    }
    // A match with its own moment (fight_at) waits for it.
    const { results } = await db
      .prepare(`SELECT * FROM guild_wars WHERE week = ? AND days_done = 0 AND day < ? AND (fight_at IS NULL OR fight_at <= ?)${only} ORDER BY day, round, id`)
      .bind(period.key, due, now, ...(guildId === null ? [] : [guildId, guildId]))
      .all();
    for (const match of results) {
      try {
        await fightMatch(db, league, match, match.fight_at ?? period.battles[match.day], now);
      } catch (error) {
        failure ??= error;
      }
    }
    if (due >= WAR_DAYS && guildId === null) {
      try {
        await endLeague(db, league, now);
      } catch (error) {
        failure ??= error;
      }
    }
  }
  if (failure) throw failure;
}

// The words of the tab, with the rules' numbers in its "Jak to działa?"
// (the gold for a character of `level`).
function viewTexts(level = 1) {
  const war = rules();
  const texts = words();
  const fame = content().guilds.fame.war.places;
  const reward = warReward(level, content());
  const famed = (count) => `${count} ${countedForm(count, texts.fameForms)}`;
  const items = (count) => `${count} ${countedForm(count, texts.itemForms)}`;
  const [first, second] = war.league.prizes;
  const vars = {
    hour: hourText(),
    first: famed(fame[0]),
    second: famed(fame[1]),
    third: famed(fame[2]),
    firstItems: items(first.items),
    secondItems: items(second.items),
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

// A fight in a list of the league's fights, from the side of guild `side`
// of its match: its day, format, number and time, the places of the sides
// (the duelist or the trio, from 1), the result ('win', 'loss' or 'draw'),
// the rival's fighters' names and what the character who looks got in it,
// if it fought.
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
    format: row.format,
    number: row.number,
    at: row.at,
    ourTeam: side === 'a' ? row.team_a : row.team_b,
    theirTeam: side === 'a' ? row.team_b : row.team_a,
    result: row.result === 'draw' ? 'draw' : row.result === side ? 'win' : 'loss',
    opponents: fighters[other].map((one) => one.name),
    fought: Boolean(own),
    reward: own?.gold !== undefined ? { gold: own.gold } : null,
    replay: Boolean(row.replay),
    _fighters: { ours: fighters[side], theirs: fighters[other], standing: { ours: fighters.standing[side], theirs: fighters.standing[other] } },
  };
}

// A guild of the league as the tab shows it: its tag and name now (or as
// drawn, for one gone).
function guildLine(id, stored, current) {
  const now = current.get(id);
  return { id, tag: now?.tag ?? stored?.tag ?? '', name: now?.name ?? stored?.name ?? '', gone: !now };
}

// The league of this week for the tab, from the side of `guild`: the table
// (each guild with its place, matches won, drawn and lost, fights won and
// lost, walkovers too, and their balance), the guild's evenings (each with
// its matches: the rival, and once fought the fights won and lost, by
// format, and the result; or free), its next evening (the rival of each
// match, how many duels and trio fights, and the trios short of members),
// the fights of the character who looks, and the end with the guild's
// place and what it got; null when the guild has no part in it.
async function leagueView(db, guild, ours, league, week, viewer, now) {
  if (!league || !league.guilds.some((one) => one.id === guild.id)) return null;
  const { teamSize } = rules();
  const matches = await matchesOf(db, week.key);
  const { results: current } = await db
    .prepare(
      `SELECT g.id, g.name, g.tag, (SELECT COUNT(*) FROM guild_members m WHERE m.guild_id = g.id) AS members FROM guilds g WHERE g.id IN (${league.guilds.map(() => '?').join(', ')})`,
    )
    .bind(...league.guilds.map((one) => one.id))
    .all();
  const now_ = new Map(current.map((row) => [row.id, row]));
  const stored = new Map(league.guilds.map((one) => [one.id, one]));
  const table = tableOf(league, matches).map((row) => ({ ...row, ...guildLine(row.id, stored.get(row.id), now_), ours: row.id === guild.id }));
  const mine = matches.filter((match) => match.guild_a === guild.id || match.guild_b === guild.id);
  const sideOf = (match) => (match.guild_a === guild.id ? 'a' : 'b');
  const rivalOf = (match) => (sideOf(match) === 'a' ? guildLine(match.guild_b, stored.get(match.guild_b), now_) : guildLine(match.guild_a, stored.get(match.guild_a), now_));
  const outcome = (match) => {
    if (match.days_done === 0) return null;
    if (match.result === 'void' || match.result === 'draw') return match.result;
    return match.result === sideOf(match) ? 'win' : 'loss';
  };
  const ids = mine.map((match) => match.id);
  const { results: counts } = ids.length
    ? await db.prepare(`SELECT war_id, format, result, COUNT(*) AS n FROM guild_war_battles WHERE war_id IN (${ids.map(() => '?').join(', ')}) GROUP BY war_id, format, result`).bind(...ids).all()
    : { results: [] };
  // A match from the guild's side: its fights won and lost, walkovers too,
  // and by format, with the walkovers won and lost.
  const tally = (match) => {
    const side = sideOf(match);
    const of = (format) => {
      const rows = counts.filter((row) => row.war_id === match.id && row.format === format);
      const sum = (test) => rows.filter(test).reduce((total, row) => total + row.n, 0);
      return { won: sum((row) => row.result === side), lost: sum((row) => row.result !== side && row.result !== 'draw'), drawn: sum((row) => row.result === 'draw') };
    };
    const [won, lost, walkoversLost] = side === 'a' ? [match.wins_a, match.losses_a, match.walkovers_a] : [match.wins_b, match.losses_b, match.walkovers_b];
    const duels = of('1v1');
    const trios = of('3v3');
    return { score: [won, lost], duels, trios: { ...trios, walkoversWon: Math.max(0, won - duels.won - trios.won), walkoversLost } };
  };
  // An evening the league plays and the guild has no match is its free
  // evening (an odd number of guilds).
  // The moment of an evening's battles: its own for matches fought at
  // another hour (fight_at), the league's otherwise.
  const atOf = (day) => mine.find((match) => match.day === day && match.fight_at !== null)?.fight_at ?? week.battles[day];
  const days = Array.from({ length: WAR_DAYS }, (_, day) => ({
    day,
    at: atOf(day),
    free: matches.some((match) => match.day === day) && !mine.some((match) => match.day === day),
    matches: mine
      .filter((match) => match.day === day)
      .map((match) => ({ id: match.id, rival: rivalOf(match), fought: match.days_done > 0, result: outcome(match), ...(match.days_done > 0 ? tally(match) : { score: [0, 0] }) })),
  }));
  const coming = mine.filter((match) => match.days_done === 0);
  const nextDay = coming[0]?.day ?? null;
  const short = (lineups) => lineups.some((lineup) => lineup.length < teamSize);
  // The rivals' trios of the next evening as fixed, once they are
  // (teamsFor); till then as many as their members make.
  const { results: kept } =
    nextDay === null ? { results: [] } : await db.prepare('SELECT guild_id, lineups FROM guild_war_lineups WHERE week = ? AND day = ?').bind(week.key, nextDay).all();
  const fixedOf = new Map(kept.map((row) => [row.guild_id, JSON.parse(row.lineups)]));
  const next =
    nextDay === null
      ? null
      : {
          day: nextDay,
          at: atOf(nextDay),
          matches: coming
            .filter((match) => match.day === nextDay)
            .map((match) => {
              const rival = rivalOf(match);
              const members = rival.gone ? 0 : (now_.get(rival.id)?.members ?? 0);
              const fixed = rival.gone ? null : fixedOf.get(rival.id);
              const trios = fixed ? fixed.length : members === 0 ? 0 : Math.ceil(members / teamSize);
              return {
                rival: { ...rival, members, trios },
                duels: ours.members.length * members,
                trioFights: ours.count * trios,
                short: { ours: short(ours.lineups), theirs: fixed ? short(fixed) : members % teamSize !== 0 },
              };
            }),
        };
  // The fights of the character who looks, the latest first.
  const { results: rows } = ids.length
    ? await db
        .prepare(
          `SELECT b.id, b.war_id, b.day, b.number, b.format, b.team_a, b.team_b, b.result, b.at, b.fighters, b.log IS NOT NULL AS replay
           FROM guild_war_battles b JOIN guild_wars w ON w.id = b.war_id
           WHERE w.week = ? AND ((w.guild_a = ? AND EXISTS (SELECT 1 FROM json_each(b.fighters, '$.a') j WHERE json_extract(j.value, '$.id') = ?))
                              OR (w.guild_b = ? AND EXISTS (SELECT 1 FROM json_each(b.fighters, '$.b') j WHERE json_extract(j.value, '$.id') = ?)))
           ORDER BY b.day DESC, b.id DESC LIMIT 120`,
        )
        .bind(week.key, guild.id, viewer.id, guild.id, viewer.id)
        .all()
    : { results: [] };
  const byMatch = new Map(mine.map((match) => [match.id, match]));
  const battles = rows
    .map((row) => {
      const match = byMatch.get(row.war_id);
      const { _fighters, ...line } = battleLine(row, sideOf(match), viewer);
      return { ...line, rival: rivalOf(match) };
    })
    .filter((line) => line.fought);
  const place = league.ended_at === null ? null : await db.prepare('SELECT place, fame, chest_items FROM guild_league_places WHERE week = ? AND guild_id = ?').bind(week.key, guild.id).first();
  return {
    guilds: league.guilds.length,
    firstDay: league.first_day,
    table,
    days,
    next,
    battles,
    end: place ? { place: place.place, fame: place.fame, items: place.chest_items } : null,
    now,
  };
}

// Why the guild has no part in this week's league: the week not drawn yet,
// the league with no matches (fewer than two guilds, or drawn after
// Sunday's battles), or the guild made after the draw.
const noLeagueReason = (league) => (!league ? 'notYet' : league.guilds.length === 0 ? 'empty' : 'late');

// The tab for a member of `guild`: its trios for its next evening, as the
// game draws them (each with its members, by place; the members its last
// trio needs to be full), the members by id, the league of the week or why
// the guild has none, the numbers of the rules, the words, and "Test ligi"
// for a tester of the test version.
async function warView(db, player, guild, now, tester) {
  const week = warWeek(now, content());
  const league = await leagueOf(db, week.key);
  const next = league ? await db.prepare('SELECT MIN(day) AS day FROM guild_wars WHERE week = ? AND days_done = 0 AND (guild_a = ? OR guild_b = ?)').bind(week.key, guild.id, guild.id).first() : null;
  const day = next?.day ?? week.today;
  const ours = league ? await teamsFor(db, league, day, guild.id) : await teamsOf(db, guild.id, `${week.key}:${day}:${guild.id}`);
  const view = await leagueView(db, guild, ours, league, week, player.row, now);
  const { teamSize, maxTeams } = rules();
  const team = ours.lineups.findIndex((lineup) => lineup.includes(player.row.id));
  const unfought = league ? await db.prepare('SELECT MIN(day) AS day FROM guild_wars WHERE week = ? AND days_done = 0').bind(week.key).first() : null;
  return {
    guild: { id: guild.id, name: guild.name, tag: guild.tag, role: guild.role },
    me: { id: player.row.id, team: team >= 0 ? team + 1 : null },
    teams: {
      count: ours.count,
      size: teamSize,
      max: maxTeams,
      members: ours.members.length,
      lineups: ours.lineups,
      bench: ours.bench,
      day,
      next: nextTeamAt(ours.members.length, content()),
    },
    members: Object.fromEntries(ours.members.map((row) => [row.id, memberView(row)])),
    week: { key: week.key, startsAt: week.startsAt, endsAt: week.endsAt, today: week.today, battles: week.battles },
    league: view,
    none: view ? null : noLeagueReason(league),
    hour: hourText(),
    // The pictures: the Arena behind the league, the board under its
    // battles and the Siedziba's Sztandar of the banners.
    backdrop: rules().backdrop,
    fightBoard: rules().fightBoard,
    banner: rules().banner,
    texts: viewTexts(player.row.level),
    test: tester ? { fight: unfought?.day ?? null } : null,
    now,
  };
}

// Whether the one who asks may use "Test ligi" (the test version's
// testers, as "Testuj Osadę").
const testerOf = (context, session) => tutorialTestsFor(context.env, session.user.login);

// GET /api/guild/war: the Wojna tab; the guild's matches owed fought first.
// Outside a guild, only the words.
export async function getGuildWar(context) {
  requireWars();
  const { session, player, guild, db } = await guildPlayer(context, errors());
  if (!guild) return json({ guild: null, texts: viewTexts(player.row.level) });
  // The tab shows the league as it is, should its matches fail to be fought.
  await settleWars(db, context.now, { guildId: guild.id }).catch((error) => console.error(error));
  return json(await warView(db, player, guild, context.now, testerOf(context, session)));
}

// GET /api/guild/war/battles/:id: a battle of the guild's matches with its
// log for the playback (src/client/arena.js), in the page's language, from
// the guild's side, its team at the bottom; its fighters, who stayed on
// their feet and what the character who looks got.
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
  const tags = { a: row.tag_a, b: row.tag_b };
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

// GET /api/guild/war/matches/:id/battles: every fight of a match of the
// guild, not only the character's own (the author, 16.11.2026: „Wszystkie
// walki mają być możliwe do obejrzenia, każda nie tylko własna”), from the
// guild's side, in their order: each as a line of the league's fights
// (battleLine), with the names on both sides. Walkovers are no fights.
export async function getGuildWarMatchBattles(context) {
  requireWars();
  const { player, guild, db } = await requireMember(context, errors());
  const id = Number(context.params.id);
  const missing = () => new ApiError(404, 'no_battle', errors().noBattle);
  if (!Number.isSafeInteger(id)) throw missing();
  const match = await db.prepare('SELECT id, guild_a FROM guild_wars WHERE id = ? AND (guild_a = ? OR guild_b = ?)').bind(id, guild.id, guild.id).first();
  if (!match) throw missing();
  const side = match.guild_a === guild.id ? 'a' : 'b';
  const { results } = await db
    .prepare('SELECT id, war_id, day, number, format, team_a, team_b, result, at, fighters, log IS NOT NULL AS replay FROM guild_war_battles WHERE war_id = ? ORDER BY number')
    .bind(id)
    .all();
  return json({
    battles: results.map((row) => {
      const { _fighters, opponents, reward: _, ...line } = battleLine(row, side, player.row);
      return { ...line, ours: _fighters.ours.map((one) => one.name), theirs: opponents };
    }),
  });
}

// POST /api/test/guild-war { action }, "Test ligi" on the test version
// (DECISIONS.md, "Liga wojen gildii"): "fight" fights at once the next
// evening of the whole league, today's or a day ahead, so a whole week
// passes in a few taps, and after Sunday's matches ends the league;
// "redraw" draws this week's league again from today, for every guild
// there is (its matches, battles and places gone; what they gave stays).
export async function testGuildWar(context) {
  requireWars();
  const { session, player, guild, db } = await requireMember(context, errors());
  if (!testerOf(context, session)) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  const now = context.now;
  const body = await readJson(context.request);
  const week = warWeek(now, content());
  if (body.action === 'fight') {
    const league = await leagueOf(db, week.key);
    const { results } = league ? await db.prepare('SELECT * FROM guild_wars WHERE week = ? AND days_done = 0 ORDER BY day, round, id').bind(week.key).all() : { results: [] };
    if (results.length === 0) throw new ApiError(409, 'no_war', 'Nie ma meczów, które można by teraz rozegrać.');
    const day = results[0].day;
    for (const match of results.filter((one) => one.day === day)) await fightMatch(db, league, match, week.battles[day], now);
    if (!results.some((one) => one.day > day)) await endLeague(db, await leagueOf(db, week.key), now);
  } else if (body.action === 'redraw') {
    await db.batch([
      db.prepare('DELETE FROM guild_war_battles WHERE war_id IN (SELECT id FROM guild_wars WHERE week = ?)').bind(week.key),
      db.prepare('DELETE FROM guild_wars WHERE week = ?').bind(week.key),
      db.prepare('DELETE FROM guild_league_places WHERE week = ?').bind(week.key),
      db.prepare('DELETE FROM guild_war_lineups WHERE week = ?').bind(week.key),
      db.prepare('DELETE FROM guild_war_weeks WHERE week = ?').bind(week.key),
    ]);
    await drawLeague(db, week, now, week.today);
  } else {
    throw new ApiError(400, 'invalid_action', 'Nie ma takiego testu.');
  }
  return json(await warView(db, player, guild, now, true));
}

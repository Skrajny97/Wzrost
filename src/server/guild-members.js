// The Ranking członków of the Gildia tab (the author, 13.11.2026: „Powinno
// być gdzieś wyszczególnione kto ile i czego wpłacił w Siedzibie Gildii oraz
// jakiś ranking”; mock-ups 897.1 and 897.2 accepted with 897 A; DECISIONS.md,
// "Ranking członków gildii (897 A)"): the members of the guild of the one
// who asks, by the Sława each of them brought the guild ("Aktywność") or by
// what each of them gave to the Siedziba ("Wpłaty"), this week or from the
// start. The ranking gives nothing; it only shows.
//
// A member's Sława counts as the guild's own (guild-fame.js), part by part:
// the Bestia's perPercent for each full 1% of its bar the member knocked off
// and its `fell` for the last blow; a fallen guardian of the Wyprawa's
// points (the seventh's `last`) split by the damage dealt to it; perTrial
// for each Próba done, up to the Próby's cap; perPiece for each piece given
// in the Prośby, up to its cap; perExchange for each offer taken in the
// Wymiana, up to its cap; and a won war's points split evenly among the
// guild's fighters of that war. A member gets whole points only, so the
// members' Sława together may come out a little below the guild's. A
// character removed and its id given again counts nothing of the old one's
// (the sources' times against its own, as the Bestia's "Wkład tygodnia").
//
// The week going on is counted from the sources each time; a week gone is
// written once, for every guild at once, into guild_member_fame (0127) when
// the week after it first asks (championOf, guild-fame.js, on any character
// loaded, and the ranking itself), since the sources keep a week's rows only
// until the week after it; where the guild wars are on, only once none of
// the week's wars is unfinished, as the guilds' Sława. "Od początku" is the
// weeks written and the one going on (with the week before while it waits
// to be written), from the first week the game wrote (2.11.2026, the week
// before this one came).
//
// The donations are those the game wrote by member (guild_seat_donations,
// from 0.3.4); those of before are only in the buildings' sums, shown
// together under the members of "Od początku". Only the guild's members of
// now are ranked.

import { WAR_DAYS, countedForm, questPeriod } from '../engine/index.js';
import { content } from './content.js';
import { nameColorOf } from './cosmetics.js';
import { guildWarsOn } from './features.js';
import { requireMember } from './guild-trials.js';
import { json } from './http.js';
import { numberText } from './i18n.js';

const rules = () => content().guilds.fame;
const words = () => content().guilds.members;
// A text with its {names} filled in; a name not given stays for the page
// ({since}, the date "Od początku" counts from, written in its language).
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (whole, name) => String(vars[name] ?? whole));

// The parts of a member's Sława, as the columns of guild_member_fame.
export const FAME_PARTS = ['beast', 'expedition', 'trials', 'requests', 'exchange', 'war'];

// The week around `now` and the one before it.
function weeksAround(now) {
  const current = questPeriod('weekly', now, content());
  return { current, previous: questPeriod('weekly', current.startsAt - 1, content()) };
}

// SQL for the Sława the characters brought their guilds in a week (`week`:
// its key and bounds), part by part, each a statement of rows (guild_id,
// character_id, points) for the characters with any of that part in a
// guild, of every guild or only of `guildId`'s, with its binds. Statements
// of their own: D1 takes no more than 5 terms of a compound SELECT.
export function memberFame(week, guildId = null) {
  const { beast, expedition, trials, requests, exchange, war } = rules();
  const only = (column) => (guildId === null ? '' : ` AND ${column} = ?`);
  const guild = guildId === null ? [] : [guildId];
  return [
    // The Bestia: the full percents of its bar each one knocked off.
    {
      part: 'beast',
      sql: `SELECT b.guild_id, h.character_id, CAST(SUM(h.damage) * 100 / b.max_hp AS INTEGER) * ? AS points
            FROM guild_beasts b JOIN guild_beast_hits h ON h.beast_id = b.id JOIN characters c ON c.id = h.character_id AND c.created_at <= h.created_at
            WHERE b.week = ? AND b.max_hp > 0${only('b.guild_id')} GROUP BY b.id, h.character_id`,
      binds: [beast.perPercent, week.key, ...guild],
    },
    // Its last blow.
    {
      part: 'beast',
      sql: `SELECT b.guild_id, b.fallen_by AS character_id, ? AS points
            FROM guild_beasts b JOIN characters c ON c.id = b.fallen_by AND c.created_at <= b.fallen_at
            WHERE b.week = ? AND b.max_hp > 0 AND b.fallen_at IS NOT NULL${only('b.guild_id')}`,
      binds: [beast.fell, week.key, ...guild],
    },
    // The Wyprawa: each fallen guardian's points by the damage dealt to it.
    {
      part: 'expedition',
      sql: `SELECT e.guild_id, h.character_id,
                   CAST(SUM(h.damage) * (CASE WHEN s.stage = ? THEN ? ELSE ? END) / (SELECT SUM(a.damage) FROM guild_expedition_hits a WHERE a.guardian_id = s.id) AS INTEGER) AS points
            FROM guild_expeditions e JOIN guild_expedition_guardians s ON s.expedition_id = e.id
              JOIN guild_expedition_hits h ON h.guardian_id = s.id JOIN characters c ON c.id = h.character_id AND c.created_at <= h.created_at
            WHERE e.week = ? AND s.fallen_at IS NOT NULL${only('e.guild_id')} GROUP BY s.id, h.character_id`,
      binds: [content().guilds.expedition.guardians.length, expedition.last, expedition.perGuardian, week.key, ...guild],
    },
    // The Próby done, up to the cap.
    {
      part: 'trials',
      sql: `SELECT t.guild_id, t.character_id, MIN(COUNT(*), ?) * ? AS points
            FROM guild_trials t JOIN characters c ON c.id = t.character_id AND c.created_at <= COALESCE(t.done_at, t.taken_at)
            WHERE t.week = ? AND t.state = 'done'${only('t.guild_id')} GROUP BY t.guild_id, t.character_id`,
      binds: [content().guilds.trials.cap, trials.perTrial, week.key, ...guild],
    },
    // The pieces given in the Prośby, up to the cap.
    {
      part: 'requests',
      sql: `SELECT g.guild_id, g.giver_id AS character_id, MIN(SUM(g.count), ?) * ? AS points
            FROM guild_gifts g JOIN characters c ON c.id = g.giver_id AND c.created_at <= g.created_at
            WHERE g.created_at >= ? AND g.created_at < ?${only('g.guild_id')} GROUP BY g.guild_id, g.giver_id`,
      binds: [requests.cap, requests.perPiece, week.startsAt, week.endsAt, ...guild],
    },
    // The offers taken in the Wymiana, up to the cap.
    {
      part: 'exchange',
      sql: `SELECT o.guild_id, o.taker_id AS character_id, MIN(COUNT(*), ?) * ? AS points
            FROM guild_offers o JOIN characters c ON c.id = o.taker_id AND c.created_at <= o.closed_at
            WHERE o.state = 'taken' AND o.closed_at >= ? AND o.closed_at < ?${only('o.guild_id')} GROUP BY o.guild_id, o.taker_id`,
      binds: [exchange.cap, exchange.perExchange, week.startsAt, week.endsAt, ...guild],
    },
    // A war won: its points split evenly among the guild's fighters of it,
    // those of its battles on its side (a character removed since among
    // them, its share no one's).
    {
      part: 'war',
      sql: `SELECT f.guild_id, f.character_id, CAST(? / f.fighters AS INTEGER) AS points
            FROM (SELECT war_id, guild_id, character_id, since, COUNT(*) OVER (PARTITION BY war_id) AS fighters
                  FROM (SELECT DISTINCT w.id AS war_id, CASE w.result WHEN 'a' THEN w.guild_a ELSE w.guild_b END AS guild_id,
                               json_extract(j.value, '$.id') AS character_id, json_extract(j.value, '$.since') AS since
                        FROM guild_wars w JOIN guild_war_battles b ON b.war_id = w.id JOIN json_each(b.fighters, '$.' || w.result) j
                        WHERE w.week = ? AND w.result IN ('a', 'b') AND json_extract(j.value, '$.id') IS NOT NULL)) f
              JOIN characters c ON c.id = f.character_id AND c.created_at = COALESCE(f.since, c.created_at)
            WHERE f.guild_id IS NOT NULL${only('f.guild_id')}`,
      binds: [war.won, week.key, ...guild],
    },
  ];
}

// The condition, with its binds, that a week's guild wars are all over,
// where the wars are on (a war still being fought would lose its Sława).
function warsOver(week) {
  if (!guildWarsOn()) return { sql: '', binds: [] };
  return { sql: ' AND NOT EXISTS (SELECT 1 FROM guild_wars WHERE week = ? AND days_done < ?)', binds: [week.key, WAR_DAYS] };
}

// The statements that write the members' Sława of `week` (one gone) for
// every guild at once, part by part, with the mark that it was written;
// nothing once it was, or while its wars go on. In one batch: also of two
// requests at once each part is written once.
export function memberFameFreeze(db, week, now) {
  const over = warsOver(week);
  const unwritten = `NOT EXISTS (SELECT 1 FROM guild_member_fame_weeks WHERE week = ?)${over.sql}`;
  return [
    ...memberFame(week).map(({ part, sql, binds }) =>
      db
        .prepare(
          `INSERT INTO guild_member_fame (guild_id, character_id, week, ${part})
           SELECT guild_id, character_id, ?, points FROM (${sql}) WHERE points > 0 AND ${unwritten}
           ON CONFLICT (guild_id, character_id, week) DO UPDATE SET ${part} = ${part} + excluded.${part}`,
        )
        .bind(week.key, ...binds, week.key, ...over.binds),
    ),
    db.prepare(`INSERT OR IGNORE INTO guild_member_fame_weeks (week, frozen_at) SELECT ?, ? WHERE ${unwritten}`).bind(week.key, now, week.key, ...over.binds),
  ];
}

// Whether the members' Sława of `week` is written, writing it first when
// it is not yet (and may be).
async function frozen(db, week, now) {
  const marked = () => db.prepare('SELECT 1 AS done FROM guild_member_fame_weeks WHERE week = ?').bind(week.key).first();
  if (await marked()) return true;
  await db.batch(memberFameFreeze(db, week, now));
  return Boolean(await marked());
}

// "310 000 złota, 4200 drewna i 900 rudy żelaza": the amounts above
// nothing in words, or null.
function amountsText(gold, resources) {
  const { goldAmount, resourceAmount } = content().guilds.seat.texts;
  const parts = [
    gold > 0 && filled(goldAmount, { count: numberText(gold) }),
    ...resources.filter((one) => one.count > 0).map((one) => filled(resourceAmount, { count: numberText(one.count), genitive: content().resourcesById[one.id].genitive })),
  ].filter(Boolean);
  if (parts.length === 0) return null;
  const { comma, and } = words().list;
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(comma)}${and}${parts.at(-1)}`;
}

// The ranking's words, with the rules' numbers filled in; the war's line
// only where the guild wars are on.
function rankingTexts() {
  const { beast, expedition, trials, requests, exchange, war } = rules();
  const texts = words();
  const points = (count) => `${count} ${countedForm(count, rules().texts.pointForms)}`;
  const vars = {
    beastPercent: points(beast.perPercent),
    beastFell: points(beast.fell),
    perGuardian: points(expedition.perGuardian),
    lastGuardian: points(expedition.last),
    perTrial: points(trials.perTrial),
    trialCap: content().guilds.trials.cap,
    perPiece: points(requests.perPiece),
    giftCap: requests.cap,
    perExchange: points(exchange.perExchange),
    exchangeCap: exchange.cap,
    warWon: points(war.won),
  };
  const { $comment: _comment, howWar, list: _list, ...rest } = texts;
  const how = guildWarsOn() ? [...texts.how.slice(0, 5), howWar, ...texts.how.slice(5)] : texts.how;
  return { ...rest, how: how.map((line) => filled(line, vars)) };
}

// The resources of the Siedziba's buildings, each once, in their order.
const seatResources = () => [...new Set(content().guilds.seat.buildings.map((building) => building.resource))];

// GET /api/guild/ranking: the members of the guild of the one who asks, each
// with its class, name and its frame's colour, ranked by their Sława and by
// their donations, this week ("week") and from the start ("all"): a row's
// place, its Sława with the parts above nothing, or its gold and the pieces
// of each resource; the line of the donations before the game wrote them
// by member; the day "Od początku" counts from; and the words.
export async function getGuildRanking(context) {
  const { player, guild, db } = await requireMember(context);
  const now = context.now;
  const { current, previous } = weeksAround(now);
  const waiting = !(await frozen(db, previous, now));
  // The parts of this week, and of the week before while it waits to be
  // written, each statement with its week.
  const live = [current, ...(waiting ? [previous] : [])].flatMap((week) => memberFame(week, guild.id).map((one) => ({ ...one, week })));
  const resources = seatResources();
  const resourceOf = Object.fromEntries(content().guilds.seat.buildings.map((building) => [building.id, building.resource]));
  const [members, weeks, kept, donations, seat, ...counted] = await db.batch([
    db
      .prepare(
        `SELECT c.id, c.name, c.class_id, c.cosmetics FROM guild_members m JOIN characters c ON c.id = m.character_id
         WHERE m.guild_id = ? ORDER BY m.joined_at, m.character_id`,
      )
      .bind(guild.id),
    db.prepare('SELECT week FROM guild_member_fame_weeks ORDER BY week LIMIT 1'),
    // The weeks written; the week before counted live while it waits, never
    // both (should another request write it in between).
    db
      .prepare(`SELECT character_id, ${FAME_PARTS.map((part) => `SUM(${part}) AS ${part}`).join(', ')} FROM guild_member_fame WHERE guild_id = ? AND week != ? GROUP BY character_id`)
      .bind(guild.id, waiting ? previous.key : ''),
    db.prepare('SELECT character_id, week, building_id, gold, resource FROM guild_seat_donations WHERE guild_id = ?').bind(guild.id),
    db.prepare('SELECT building_id, gold, resource FROM guild_seat WHERE guild_id = ?').bind(guild.id),
    ...live.map(({ sql, binds }) => db.prepare(sql).bind(...binds)),
  ]);
  const people = members.results.map((row) => ({ id: row.id, name: row.name, classId: row.class_id, nameColor: nameColorOf(row.cosmetics), own: row.id === player.row.id }));
  const ids = new Set(people.map((one) => one.id));
  const empty = () => Object.fromEntries(FAME_PARTS.map((part) => [part, 0]));
  const fame = { week: new Map(people.map((one) => [one.id, empty()])), all: new Map(people.map((one) => [one.id, empty()])) };
  const add = (map, character, part, points) => {
    if (ids.has(character)) map.get(character)[part] += points ?? 0;
  };
  for (const row of kept.results) for (const part of FAME_PARTS) add(fame.all, row.character_id, part, row[part]);
  counted.forEach((result, index) => {
    const { part, week } = live[index];
    for (const row of result.results) {
      if (week === current) add(fame.week, row.character_id, part, row.points);
      add(fame.all, row.character_id, part, row.points);
    }
  });
  const gifts = { week: new Map(), all: new Map() };
  const given = (map, row) => {
    const sum = map.get(row.character_id) ?? { gold: 0, ...Object.fromEntries(resources.map((id) => [id, 0])) };
    sum.gold += row.gold;
    const resource = resourceOf[row.building_id];
    if (resource) sum[resource] += row.resource;
    map.set(row.character_id, sum);
  };
  const recorded = { gold: 0, ...Object.fromEntries(resources.map((id) => [id, 0])) };
  for (const row of donations.results) {
    recorded.gold += row.gold;
    const resource = resourceOf[row.building_id];
    if (resource) recorded[resource] += row.resource;
    if (!ids.has(row.character_id)) continue;
    given(gifts.all, row);
    if (row.week === current.key) given(gifts.week, row);
  }
  const total = { gold: 0, ...Object.fromEntries(resources.map((id) => [id, 0])) };
  for (const row of seat.results) {
    total.gold += row.gold;
    const resource = resourceOf[row.building_id];
    if (resource) total[resource] += row.resource;
  }
  const texts = rankingTexts();
  const byName = (a, b) => a.name.localeCompare(b.name, 'pl');
  const placed = (rows) => rows.map((row, index) => ({ place: index + 1, ...row }));
  const activity = (period) =>
    placed(
      people
        .map((one) => {
          const parts = fame[period].get(one.id);
          return {
            ...one,
            fame: FAME_PARTS.reduce((sum, part) => sum + parts[part], 0),
            parts: FAME_PARTS.filter((part) => parts[part] > 0).map((part) => ({ id: part, name: texts.parts[part], points: parts[part] })),
          };
        })
        .sort((a, b) => b.fame - a.fame || byName(a, b)),
    );
  const donated = (period) =>
    placed(
      people
        .map((one) => {
          const sum = gifts[period].get(one.id);
          return {
            ...one,
            gold: sum?.gold ?? 0,
            resources: resources.map((id) => ({ id, name: content().resourcesById[id].name, count: sum?.[id] ?? 0 })),
          };
        })
        .sort((a, b) => b.gold - a.gold || b.resources.reduce((s, one) => s + one.count, 0) - a.resources.reduce((s, one) => s + one.count, 0) || byName(a, b)),
    );
  const earlier = amountsText(
    Math.max(0, total.gold - recorded.gold),
    resources.map((id) => ({ id, count: Math.max(0, total[id] - recorded[id]) })),
  );
  const since = [weeks.results[0]?.week, waiting ? previous.key : null, current.key].filter(Boolean).sort()[0];
  return json({
    activity: { week: activity('week'), all: activity('all') },
    donations: { week: donated('week'), all: donated('all') },
    earlier: earlier && filled(texts.earlier, { amounts: earlier }),
    since,
    texts,
  });
}

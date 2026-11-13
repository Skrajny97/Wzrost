// The Sława of the guilds (data/guilds.json `fame`; DECISIONS.md, "Ranking
// gildii: Sława tygodnia"; the author: "379 A", "380 C", "381 A"): what a
// guild did together in a week (from Monday, midnight in Poland, as the
// weekly quests), in points: the share of its Bestia's bar it took and the
// beast's fall, the guardians of its Wyprawa that fell (the author: "638
// A"), the Próby its members finished, the pieces they gave in the
// Prośby and the offers they took in the Wymiana, each member's part up to
// its cap first, then summed for the guild, and the guild war it won that
// week (guild-wars.js, 799 A). The Ranking's "Gildie" tab
// shows the guilds by this week's Sława or by all of it ("Od początku": the
// weeks frozen and this one). The first time a new week asks for the
// ranking, the Gildia page or the best guild of the week before (every
// GET /api/character), the Sława of that week is frozen for every guild at
// once (guild_fame): the sources keep the rows of the week before until the
// week after it (the Bestia's, the Próby's and the Prośby's clean-ups, the
// Wymiana's, guild-exchange.js, and the Wyprawa's, guild-expedition.js), so
// nothing of it is gone by then. The
// best guild of the week before (the most Sława, if any; of two with as
// much, the older) has its tag in gold the whole week (380 C).

import { WAR_DAYS, questPeriod } from '../engine/index.js';
import { requireChatter } from './chat.js';
import { content } from './content.js';
import { guildWarsOn } from './features.js';
import { fameNumbers, memberFameFreeze } from './guild-members.js';
import { settleWars } from './guild-wars.js';
import { json } from './http.js';
import { askedPage, lastOffset } from './ranking-pages.js';

const rules = () => content().guilds.fame;
const words = () => rules().texts;
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));

// The week around `now` and the one before it.
function weeksAround(now) {
  const current = questPeriod('weekly', now, content());
  return { current, previous: questPeriod('weekly', current.startsAt - 1, content()) };
}

// SQL for the Sława of every guild there is in a week (`week`: its key and
// bounds), a row (guild_id, points) a guild, with its binds. Bestia:
// perPercent for each full 1% of the bar its beast of the week lost, and
// `fell` when it fell. Próby: perTrial for each trial finished that week,
// each character's up to the Próby's own cap (a character gone leaves each
// of its trials counted on its own, as on their bar). Prośby: perPiece for
// each piece given in the guild that week, each giver's up to its cap.
// Wymiana: perExchange for each offer taken in the guild that week, each
// taker's up to its cap (a taker gone leaves each exchange on its own).
// Wyprawa: perGuardian for each guardian of its route of that week that
// fell, and `last` instead for the last of them (638 A: 20 each and 50 for
// the seventh, up to 170 a week). Wojna: war.won for the war of that week
// it won (799 A), once its Sunday's battles are fought.
function weekFame(week) {
  const { beast, expedition, trials, requests, exchange, war } = rules();
  return {
    sql: `SELECT g.id AS guild_id, COALESCE(b.points, 0) + COALESCE(t.points, 0) + COALESCE(r.points, 0) + COALESCE(x.points, 0) + COALESCE(w.points, 0) + COALESCE(v.points, 0) AS points
      FROM guilds g
      LEFT JOIN (SELECT guild_id, SUM(CAST(MAX(0, max_hp - hp) * 100 / max_hp AS INTEGER) * ? + CASE WHEN fallen_at IS NULL THEN 0 ELSE ? END) AS points
                 FROM guild_beasts WHERE week = ? AND max_hp > 0 GROUP BY guild_id) b ON b.guild_id = g.id
      LEFT JOIN (SELECT guild_id, SUM(MIN(n, ?)) * ? AS points
                 FROM (SELECT guild_id, COUNT(*) AS n FROM guild_trials WHERE week = ? AND state = 'done' GROUP BY guild_id, COALESCE(character_id, -id))
                 GROUP BY guild_id) t ON t.guild_id = g.id
      LEFT JOIN (SELECT guild_id, SUM(MIN(n, ?)) * ? AS points
                 FROM (SELECT guild_id, SUM(count) AS n FROM guild_gifts WHERE created_at >= ? AND created_at < ? GROUP BY guild_id, giver_id)
                 GROUP BY guild_id) r ON r.guild_id = g.id
      LEFT JOIN (SELECT guild_id, SUM(MIN(n, ?)) * ? AS points
                 FROM (SELECT guild_id, COUNT(*) AS n FROM guild_offers WHERE state = 'taken' AND closed_at >= ? AND closed_at < ? GROUP BY guild_id, COALESCE(taker_id, -id))
                 GROUP BY guild_id) x ON x.guild_id = g.id
      LEFT JOIN (SELECT e.guild_id, SUM(CASE WHEN s.stage = ? THEN ? ELSE ? END) AS points
                 FROM guild_expedition_guardians s JOIN guild_expeditions e ON e.id = s.expedition_id
                 WHERE e.week = ? AND s.fallen_at IS NOT NULL GROUP BY e.guild_id) w ON w.guild_id = g.id
      LEFT JOIN (SELECT CASE result WHEN 'a' THEN guild_a ELSE guild_b END AS guild_id, COUNT(*) * ? AS points
                 FROM guild_wars WHERE week = ? AND result IN ('a', 'b') GROUP BY 1) v ON v.guild_id = g.id`,
    binds: [
      beast.perPercent,
      beast.fell,
      week.key,
      content().guilds.trials.cap,
      trials.perTrial,
      week.key,
      requests.cap,
      requests.perPiece,
      week.startsAt,
      week.endsAt,
      exchange.cap,
      exchange.perExchange,
      week.startsAt,
      week.endsAt,
      content().guilds.expedition.guardians.length,
      expedition.last,
      expedition.perGuardian,
      week.key,
      war.won,
      week.key,
    ],
  };
}

// The best guild of a week as frozen, or no row.
const bestStatement = (db, week) =>
  db.prepare('SELECT f.guild_id AS id, g.tag, f.points FROM guild_fame f JOIN guilds g ON g.id = f.guild_id WHERE f.week = ? ORDER BY f.points DESC, f.guild_id LIMIT 1').bind(week);

// The best guild of the week before `now` from its row: its id and tag, or
// null when no guild got any Sława then.
export const championFrom = (row) => (row && row.points > 0 ? { id: row.id, tag: row.tag } : null);

// The statement of the best guild of the week before `now` as frozen, for
// a batch (guilds.js); championFrom reads its row.
export const championStatement = (db, now) => bestStatement(db, weeksAround(now).previous.key);

// The best guild of the week before `now` (380 C), the Sława of that week
// frozen for every guild first when the new week asks for the first time: a
// row for each guild there is, and none twice (also of two requests at
// once). Of two guilds with as much Sława, the older one. With no guild at
// all there is nothing to freeze and no best guild, so the week waits for
// the first one: the freeze leaves no row then, and every character's load
// ran it again (the code review).
export async function championOf(db, now) {
  const { previous } = weeksAround(now);
  const [found, guilds] = await db.batch([bestStatement(db, previous.key), db.prepare('SELECT EXISTS (SELECT 1 FROM guilds) AS any')]);
  let best = found.results[0] ?? null;
  if (!best && guilds.results[0].any) {
    // The guild wars of that week end first, should the cron have missed
    // their Sunday's battles (guild-wars.js): the war won counts. Where the
    // wars are on, the week is frozen only once none of its wars is
    // unfinished (11.11.2026: else a war still being fought by another run,
    // or one that failed, lost its Sława for good); until then the next
    // request tries again.
    const wars = guildWarsOn();
    if (wars) await settleWars(db, now).catch((error) => console.error(error));
    const fame = weekFame(previous);
    const finished = wars ? ' AND NOT EXISTS (SELECT 1 FROM guild_wars WHERE week = ? AND days_done < ?)' : '';
    await db
      .prepare(`INSERT OR IGNORE INTO guild_fame (guild_id, week, points) SELECT guild_id, ?, points FROM (${fame.sql}) WHERE NOT EXISTS (SELECT 1 FROM guild_fame WHERE week = ?)${finished}`)
      .bind(previous.key, ...fame.binds, previous.key, ...(wars ? [previous.key, WAR_DAYS] : []))
      .run();
    // The members' Sława of that week too (guild-members.js), on its own:
    // should it fail, the members' ranking writes it when next asked, and
    // the character still loads.
    await db.batch(memberFameFreeze(db, previous, now)).catch((error) => console.error(error));
    best = await bestStatement(db, previous.key).first();
  }
  return championFrom(best);
}

// The words of the Ranking's "Gildie", with the rules' numbers filled in;
// the war's line only where the guild wars are on.
function rankingTexts() {
  const texts = words();
  const vars = fameNumbers();
  const { howWar, ...rest } = texts;
  const how = guildWarsOn() ? [...texts.how.slice(0, -2), howWar, ...texts.how.slice(-2)] : texts.how;
  return { ...rest, how: how.map((line) => filled(line, vars)) };
}

// GET /api/ranking/guilds?period=week|all&offset=…&limit=…: the guilds by
// their Sława of this week or of all weeks ("Od początku": those frozen and
// this one), of two with as much the older first, each with its tag, name
// and members; one page of them, as the Ranking postaci's (the author,
// 10.11.2026: „Ranking max 50 postaci + przewijanie listy na dalsze pozycje
// strona po stronie”; ranking-pages.js), with how many guilds there are,
// the place of the guild of the one who asks among all, and the tag of the
// best guild of the week before.
export async function guildRanking(context) {
  const { character, db } = await requireChatter(context);
  const now = context.now;
  const champion = await championOf(db, now);
  const period = new URL(context.request.url).searchParams.get('period') === 'all' ? 'all' : 'week';
  const fame = weekFame(weeksAround(now).current);
  const total = period === 'all' ? 'live.points + COALESCE((SELECT SUM(f.points) FROM guild_fame f WHERE f.guild_id = g.id), 0)' : 'live.points';
  const [rows, own] = await db.batch([
    db
      .prepare(
        `SELECT g.id, g.name, g.tag, (SELECT COUNT(*) FROM guild_members m WHERE m.guild_id = g.id) AS members, ${total} AS fame
         FROM (${fame.sql}) live JOIN guilds g ON g.id = live.guild_id ORDER BY fame DESC, g.id`,
      )
      .bind(...fame.binds),
    db.prepare('SELECT guild_id FROM guild_members WHERE character_id = ?').bind(character.id),
  ]);
  const ownId = own.results[0]?.guild_id ?? null;
  const place = rows.results.findIndex((row) => row.id === ownId);
  const guilds = rows.results.length;
  const { limit, offset: asked } = askedPage(context.request.url);
  const offset = Math.min(asked, lastOffset(guilds, limit));
  return json({
    period,
    offset,
    limit,
    total: guilds,
    rows: rows.results.slice(offset, offset + limit).map((row, index) => ({
      place: offset + index + 1,
      id: row.id,
      name: row.name,
      tag: row.tag,
      members: row.members,
      fame: row.fame,
      own: row.id === ownId,
    })),
    place: place >= 0 ? place + 1 : null,
    championTag: champion?.tag ?? null,
    texts: rankingTexts(),
  });
}

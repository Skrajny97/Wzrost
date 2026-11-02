// The Sława of the guilds (data/guilds.json `fame`; DECISIONS.md, "Ranking
// gildii: Sława tygodnia"; the author: "379 A", "380 C", "381 A"): what a
// guild did together in a week (from Monday, midnight in Poland, as the
// weekly quests), in points: the share of its Bestia's bar it took and the
// beast's fall, the Próby its members finished, the pieces they gave in the
// Prośby and the offers they took in the Wymiana, each member's part up to
// its cap first, then summed for the guild. The Ranking's "Gildie" tab
// shows the guilds by this week's Sława or by all of it ("Od początku": the
// weeks frozen and this one). The first time a new week asks for the
// ranking, the Gildia page or the best guild of the week before (every
// GET /api/character), the Sława of that week is frozen for every guild at
// once (guild_fame): the sources keep the rows of the week before until the
// week after it (the Bestia's, the Próby's and the Prośby's clean-ups, and
// the Wymiana's, guild-exchange.js), so nothing of it is gone by then. The
// best guild of the week before (the most Sława, if any; of two with as
// much, the older) has its tag in gold the whole week (380 C).

import { countedForm, questPeriod } from '../engine/index.js';
import { requireChatter } from './chat.js';
import { content } from './content.js';
import { json } from './http.js';

const rules = () => content.guilds.fame;
const words = () => rules().texts;
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));

// The week around `now` and the one before it.
function weeksAround(now) {
  const current = questPeriod('weekly', now, content);
  return { current, previous: questPeriod('weekly', current.startsAt - 1, content) };
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
function weekFame(week) {
  const { beast, trials, requests, exchange } = rules();
  return {
    sql: `SELECT g.id AS guild_id, COALESCE(b.points, 0) + COALESCE(t.points, 0) + COALESCE(r.points, 0) + COALESCE(x.points, 0) AS points
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
                 GROUP BY guild_id) x ON x.guild_id = g.id`,
    binds: [
      beast.perPercent,
      beast.fell,
      week.key,
      content.guilds.trials.cap,
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
// once). Of two guilds with as much Sława, the older one.
export async function championOf(db, now) {
  const { previous } = weeksAround(now);
  let best = await bestStatement(db, previous.key).first();
  if (!best) {
    const fame = weekFame(previous);
    await db
      .prepare(`INSERT OR IGNORE INTO guild_fame (guild_id, week, points) SELECT guild_id, ?, points FROM (${fame.sql}) WHERE NOT EXISTS (SELECT 1 FROM guild_fame WHERE week = ?)`)
      .bind(previous.key, ...fame.binds, previous.key)
      .run();
    best = await bestStatement(db, previous.key).first();
  }
  return championFrom(best);
}

// The words of the Ranking's "Gildie", with the rules' numbers filled in.
function rankingTexts() {
  const { beast, trials, requests, exchange } = rules();
  const texts = words();
  const points = (count) => `${count} ${countedForm(count, texts.pointForms)}`;
  const vars = {
    beastPercent: points(beast.perPercent),
    beastFell: points(beast.fell),
    perTrial: points(trials.perTrial),
    trialCap: content.guilds.trials.cap,
    perPiece: points(requests.perPiece),
    giftCap: requests.cap,
    perExchange: points(exchange.perExchange),
    exchangeCap: exchange.cap,
  };
  return { ...texts, how: texts.how.map((line) => filled(line, vars)) };
}

// GET /api/ranking/guilds?period=week|all: the guilds by their Sława of
// this week or of all weeks ("Od początku": those frozen and this one), of
// two with as much the older first, each with its tag, name and members;
// the first `size` of them (as the Ranking postaci), the place of the guild
// of the one who asks among all, and the tag of the best guild of the week
// before.
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
  return json({
    period,
    rows: rows.results.slice(0, content.community.ranking.size).map((row, index) => ({
      place: index + 1,
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

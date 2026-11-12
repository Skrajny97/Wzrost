// Punkty Sławy of the characters (data/fame.json; the engine's fame.js has
// the rules; the author, 10.11.2026: „Przydałyby się Punkty Sławy dla
// postaci, gdzieś jako osobny moduł, zdobywane przez wszelakie aktywności,
// opisane. Niech trójka graczy z najwyższą aktywnością dostaje
// proporcjonalnie jakieś nagrody.”; „to mają być powtarzalne rzeczy czyli
// Wieże nie wchodzą, ale tygodniowo liczone git”; „760 A”). Apart from the
// guilds' Sława (guild-fame.js), whose weeks they follow: from Monday,
// midnight in Poland, as the weekly quests.
//
// What an action brings is added in that action's own batch (famePoints),
// so it lands only with the action, once for two taps at once: a claimed
// exploration or a Drużyna's trip (hunts.js), a profession's work claimed
// (professions.js, brewing.js, workshop.js, mining.js, jewelcraft.js), a
// wanted poster's bounty (wanted.js), a Portal's sweep (portals.js), the
// narrator's quests (quests.js), an order of the Osada (settlement.js), an
// attack on the Bestia Gildii (guild-beast.js), a try on the Kowadło
// (inventory.js, settlement.js) and a sale at the Targowisko (market.js).
// A Próba Gildii brings its points once it is done, in the batch that
// does it (trialFame beside trialProgress in guild-trials.js), each trial
// once by its id.
//
// The first time a new week asks (every GET /api/character and the Sława
// tab), the week before closes once for good, as the guilds' Sława is
// frozen: the best characters of `places` different accounts share the
// pool of Punkty Systemu by their points (fame_rewards), each to claim it
// with "Odbierz" in the Sława tab, and the first one's name is in gold the
// whole week wherever names show (the page's ui.js, framedName).

import { countedForm, fameSource, fameWeek, famePointsOf, famePreviousWeek, fameWinners, huntFame, questFame, upgradeFame, workFame } from '../engine/index.js';
import { assertion, atomically, raced } from './atomic.js';
import { characterView, loadPlayer } from './characters.js';
import { chatRole, requireChatter } from './chat.js';
import { content } from './content.js';
import { nameColorOf } from './cosmetics.js';
import { guildTagSql } from './guilds.js';
import { ApiError, json } from './http.js';
import { OWN_CHARACTERS } from './roles.js';

const rules = () => content().fame;
const words = () => rules().texts;
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));

// The key of the week after the week `key` (the date its Monday falls on).
const weekAfter = (key) => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 7)).toISOString().slice(0, 10);
};

// The week, in SQL, that points of the week `key` go to: that week while it
// is open, else the one after it. A request of Sunday's last moment saved
// after Monday's first look closed the week (a late run of the cron too)
// brought points to a week no reward counts any more, and they were lost
// (the code review, 12.11.2026, as the Arena's in 0.2.69).
const openWeek = (key) => ({ sql: 'CASE WHEN EXISTS (SELECT 1 FROM fame_weeks WHERE week = ?) THEN ? ELSE ? END', binds: [key, weekAfter(key), key] });

// The statements that add `points` Punkty Sławy to the character's week
// (the one around `now`, or the next one once it has closed: openWeek), for
// the action's own batch, so they land only with it (atomic.js); none for
// no points. `guard` ({ sql, binds }) holds only with the action's own
// change, for a batch with no assertion at its head (as trialProgress's in
// guild-trials.js).
export function famePoints(db, characterId, points, now, guard = null) {
  if (!(points > 0)) return [];
  const week = openWeek(fameWeek(now, content()).key);
  return [
    db
      .prepare(
        `INSERT INTO fame_points (character_id, week, points) SELECT ?, ${week.sql}, ? WHERE ${guard ? guard.sql : '1'}
         ON CONFLICT (character_id, week) DO UPDATE SET points = points + excluded.points`,
      )
      .bind(characterId, ...week.binds, points, ...(guard?.binds ?? [])),
  ];
}

// famePoints for each place, its points from the engine's rules (fame.js):
// an exploration claimed with its `hunt` and `minutes` (hunts.js); a
// profession's work of `minutes`, the Awatar's (`avatar`) a quarter; the
// narrator's quests of a period, `count` of them (quests.js); a try on the
// Kowadło (its `outcome`, inventory.js and settlement.js); and `count`
// times a source that gives its points at once (`id`: wanted, sweep,
// order, beast, sale).
export const huntFamePoints = (db, characterId, hunt, minutes, now) => famePoints(db, characterId, huntFame(hunt, minutes, content()), now);
export const workFamePoints = (db, characterId, minutes, avatar, now) => famePoints(db, characterId, workFame(minutes, avatar, content()), now);
export const questFamePoints = (db, characterId, periodId, count, now) => famePoints(db, characterId, questFame(periodId, count, content()), now);
export const upgradeFamePoints = (db, characterId, outcome, now, guard = null) => famePoints(db, characterId, upgradeFame(outcome, content()), now, guard);
export const sourceFamePoints = (db, characterId, id, count, now, guard = null) => famePoints(db, characterId, count * famePointsOf(id, content()), now, guard);

// The points of the character's Próby Gildii of `week` (its key) done and
// not counted yet, then those trials counted, by their ids: for the batch
// that moves the trials on (trialProgress in guild-trials.js), after it,
// so a trial done brings its points at once and only once, whatever comes
// after (a trial opened again, its guild gone).
export function trialFame(db, characterId, week) {
  const open = openWeek(week);
  return [
    db
      .prepare(
        `INSERT INTO fame_points (character_id, week, points)
         SELECT ?, ${open.sql}, n * ? FROM (
           SELECT COUNT(*) AS n FROM guild_trials t
           WHERE t.character_id = ? AND t.week = ? AND t.state = 'done' AND NOT EXISTS (SELECT 1 FROM fame_trials f WHERE f.trial_id = t.id))
         WHERE n > 0
         ON CONFLICT (character_id, week) DO UPDATE SET points = points + excluded.points`,
      )
      .bind(characterId, ...open.binds, famePointsOf('trial', content()), characterId, week),
    db.prepare("INSERT OR IGNORE INTO fame_trials (trial_id, week) SELECT id, week FROM guild_trials WHERE character_id = ? AND week = ? AND state = 'done'").bind(characterId, week),
  ];
}

// Closes the week (`week`: its key) once for good: the best character of
// each account by its points, the first `places` of them with their places
// and shares of the pool (fameWinners), and the mark that it is closed,
// all at once. Of two requests at once the second finds the mark taken and
// leaves it all as the first saved it. Points that come meanwhile, between
// the count and the close, make the close count again (the week's sum is
// checked at its head; points only grow), and those that come after it go
// to the next week (openWeek). The counted trials of the weeks before it
// go: no trial of theirs moves any more.
async function closeWeek(db, week, now) {
  for (let tries = 0; tries < 3; tries++) {
    const [{ results }, sum] = await db.batch([
      db
        .prepare(
          `SELECT character_id, user_id, points FROM (
             SELECT f.character_id, c.user_id, f.points, ROW_NUMBER() OVER (PARTITION BY c.user_id ORDER BY f.points DESC, f.character_id) AS nth
             FROM fame_points f JOIN characters c ON c.id = f.character_id
             WHERE f.week = ? AND f.points > 0 AND c.${OWN_CHARACTERS})
           WHERE nth = 1 ORDER BY points DESC, character_id LIMIT ?`,
        )
        .bind(week, rules().rewards.places),
      db.prepare('SELECT COALESCE(SUM(points), 0) AS total FROM fame_points WHERE week = ?').bind(week),
    ]);
    const winners = fameWinners(
      results.map((row) => ({ characterId: row.character_id, userId: row.user_id, points: row.points })),
      content(),
    );
    try {
      await db.batch([
        assertion(db, '(SELECT COALESCE(SUM(points), 0) FROM fame_points WHERE week = ?) = ?', [week, sum.results[0].total]),
        db.prepare('INSERT INTO fame_weeks (week, closed_at) VALUES (?, ?)').bind(week, now),
        ...winners.map((winner) =>
          db
            .prepare('INSERT INTO fame_rewards (week, place, character_id, user_id, points, share) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(week, winner.place, winner.characterId, winner.userId, winner.points, winner.share),
        ),
        db.prepare('DELETE FROM fame_trials WHERE week < ?').bind(week),
      ]);
      return;
    } catch (error) {
      if (raced(error)) continue;
      if (!String(error?.message).includes('UNIQUE')) throw error;
      return;
    }
  }
}

// What the page keeps of the Punkty Sławy (state.fame, for its names and
// lights): the name of last week's best character, in gold the whole week
// where the data says so (or null), and the Punkty Systemu of the
// character's rewards waiting (or null). Asking for it the first time in a
// new week closes the week before (closeWeek).
export async function fameNotice(db, characterId, now) {
  const previous = famePreviousWeek(now, content()).key;
  const read = () =>
    db.batch([
      db.prepare('SELECT 1 AS closed FROM fame_weeks WHERE week = ?').bind(previous),
      db.prepare('SELECT c.name FROM fame_rewards r JOIN characters c ON c.id = r.character_id WHERE r.week = ? AND r.place = 1').bind(previous),
      db.prepare('SELECT COALESCE(SUM(share), 0) AS share FROM fame_rewards WHERE character_id = ? AND claimed_at IS NULL AND share > 0').bind(characterId),
    ]);
  let [closed, champion, waiting] = await read();
  if (closed.results.length === 0) {
    await closeWeek(db, previous, now);
    [, champion, waiting] = await read();
  }
  const share = waiting.results[0]?.share ?? 0;
  return {
    champion: rules().rewards.goldName ? (champion.results[0]?.name ?? null) : null,
    reward: share > 0 ? share : null,
  };
}

// Points with their noun, in the request's language.
const pointsText = (count, forms) => `${count} ${countedForm(count, forms)}`;

// The list "Za co Sława", each source with its words filled in from its
// own numbers ({to}: the level before upgrade-high's).
function sourcesView() {
  const to = fameSource('upgrade-high', content()).from - 1;
  return rules().sources.map((source) => ({ id: source.id, label: filled(source.label, { minutes: source.minutes, from: source.from, to }), points: source.points }));
}

// The words of the Sława tab, with the pool filled in.
function textsView() {
  const texts = words();
  const pool = pointsText(rules().rewards.pool, texts.systemPointForms);
  return { ...texts, how: texts.how.map((line) => filled(line, { pool })) };
}

// The Sława tab for the character (`character`: its id; `env` for the
// marks of the admin and the moderators): this week's points and place,
// the week's best (the first `table` of them, its own row after them when
// lower), last week's rewarded with their shares, its rewards waiting, the
// sources and the words; the week before closed first.
async function fameView(db, env, character, now) {
  const fame = await fameNotice(db, character.id, now);
  const current = fameWeek(now, content());
  const previous = famePreviousWeek(now, content());
  const person = `c.id, c.name, c.class_id, c.cosmetics, ${guildTagSql('c.id')} AS guild_tag, u.login, u.google_sub, u.chat_moderator`;
  const [top, own, last, waiting] = await db.batch([
    db
      .prepare(
        `SELECT ${person}, f.points FROM fame_points f JOIN characters c ON c.id = f.character_id JOIN users u ON u.id = c.user_id
         WHERE f.week = ? AND f.points > 0 AND c.${OWN_CHARACTERS} ORDER BY f.points DESC, f.character_id LIMIT ?`,
      )
      .bind(current.key, rules().table),
    db
      .prepare(
        `SELECT ${person}, f.points,
           (SELECT COUNT(*) FROM fame_points o JOIN characters d ON d.id = o.character_id
            WHERE o.week = f.week AND d.${OWN_CHARACTERS} AND (o.points > f.points OR (o.points = f.points AND o.character_id < f.character_id))) + 1 AS place
         FROM fame_points f JOIN characters c ON c.id = f.character_id JOIN users u ON u.id = c.user_id
         WHERE f.character_id = ? AND f.week = ? AND f.points > 0`,
      )
      .bind(character.id, current.key),
    db
      .prepare(`SELECT ${person}, r.place, r.points, r.share FROM fame_rewards r JOIN characters c ON c.id = r.character_id JOIN users u ON u.id = c.user_id WHERE r.week = ? ORDER BY r.place`)
      .bind(previous.key),
    db.prepare('SELECT week, place, share FROM fame_rewards WHERE character_id = ? AND claimed_at IS NULL AND share > 0 ORDER BY week').bind(character.id),
  ]);
  const view = (row) => ({
    name: row.name,
    guildTag: row.guild_tag ?? null,
    nameColor: nameColorOf(row.cosmetics),
    classId: row.class_id,
    role: chatRole(env, row),
    points: row.points,
    own: row.id === character.id,
  });
  const mine = own.results[0] ?? null;
  const rows = top.results.map((row, index) => ({ ...view(row), place: index + 1 }));
  return {
    week: { key: current.key, endsAt: current.endsAt },
    points: mine?.points ?? 0,
    place: mine?.place ?? null,
    rows,
    // The character's own row, when it stands below the table.
    ownRow: mine && !rows.some((row) => row.own) ? { ...view(mine), place: mine.place } : null,
    last: { week: previous.key, winners: last.results.map((row) => ({ ...view(row), place: row.place, share: row.share })) },
    rewards: waiting.results.map((row) => ({ week: row.week, place: row.place, share: row.share })),
    sources: sourcesView(),
    texts: textsView(),
    fame,
  };
}

// GET /api/fame: the Sława tab (fameView), with the Społeczność.
export async function getFame(context) {
  const { character, db } = await requireChatter(context);
  return json(await fameView(db, context.env, character, context.now));
}

// POST /api/fame/claim: the Punkty Systemu of every reward of the
// character waiting, at once ("Odbierz"). Saved only while they are as
// read (atomic.js), so two taps at once give them once; the character's
// version moves on, as with every change of its row.
export async function claimFame(context) {
  const { session, character, db } = await requireChatter(context);
  const now = context.now;
  const waiting = await db.prepare('SELECT share FROM fame_rewards WHERE character_id = ? AND claimed_at IS NULL AND share > 0').bind(character.id).all();
  const share = waiting.results.reduce((sum, row) => sum + row.share, 0);
  if (share === 0) throw new ApiError(409, 'nothing_to_claim', words().nothing);
  await atomically(
    db,
    [
      assertion(db, '(SELECT COALESCE(SUM(share), 0) FROM fame_rewards WHERE character_id = ? AND claimed_at IS NULL AND share > 0) = ?', [character.id, share]),
      db.prepare('UPDATE fame_rewards SET claimed_at = ? WHERE character_id = ? AND claimed_at IS NULL AND share > 0').bind(now, character.id),
      db.prepare('UPDATE characters SET system_points = system_points + ?, version = version + 1 WHERE id = ?').bind(share, character.id),
    ],
    () => new ApiError(409, 'fame_changed', words().raced),
  );
  return json({
    claimed: { share },
    character: characterView(await loadPlayer(db, session.userId), now),
    ...(await fameView(db, context.env, character, now)),
  });
}

// Krainy pod sztandarem (1200 A; data/guilds.json `lands`; the engine's
// guild-lands.js has the rules; DECISIONS.md, "Krainy pod sztandarem"):
// every minute of exploration a member claims a report for counts in the
// land of the place it explored, for the guild it is in then (landMinutes,
// in the claim's own batch, beside the Wyprawa Gildii's minutes), on a
// Drużyna's trip each member's own. As a week ends (the first look of the
// new week, or the cron's minute after midnight: raiseBanners), each land
// goes to the guild with the most minutes there, which raises its banner
// for the week: its tag on the land's card for every player (bannersNow),
// the land's Sława for the guild in that week (guild-fame.js), split among
// its members by their minutes there (guild_land_fame, guild-members.js),
// and more gold and materials from the land's creatures for its members,
// on the explorations they set out on that week (bannerBonus, hunts.js).
// The Wojna tab shows the week live: where the guild leads and where it
// chases, and by how much (GET /api/guild/lands).

import { landOfArea, landRules, landShares, landStandings, landWinners, questPeriod } from '../engine/index.js';
import { raced } from './atomic.js';
import { content } from './content.js';
import { guildPlayer } from './guild-trials.js';
import { json } from './http.js';

const words = () => content().guilds.lands.texts;
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (whole, name) => String(vars[name] ?? whole));

// The week around `now` and the one before it.
function weeksAround(now) {
  const current = questPeriod('weekly', now, content());
  return { current, previous: questPeriod('weekly', current.startsAt - 1, content()) };
}

// The land of an exploration's place: its inner region's land, or the land
// itself for an exploration of before the inner regions.
const landOf = (placeId) => (content().regionsById[placeId] ? placeId : landOfArea(placeId, content()));

// The statement that adds an exploration's minutes to its land for the
// guild the character is in now, in the week of `now`, to put into the
// claim's own batch (hunts.js), so they land only with the report; none
// outside a guild, nor for a place of no land.
export function landMinutes(db, characterId, placeId, minutes, now) {
  const landId = typeof placeId === 'string' ? landOf(placeId) : null;
  if (!landId || !(minutes > 0)) return [];
  const { key: week } = questPeriod('weekly', now, content());
  return [
    db
      .prepare(
        `INSERT INTO guild_land_minutes (week, land_id, guild_id, character_id, minutes, updated_at)
         SELECT ?, ?, m.guild_id, ?, ?, ? FROM guild_members m JOIN guilds g ON g.id = m.guild_id WHERE m.character_id = ?
         ON CONFLICT (week, land_id, guild_id, character_id) DO UPDATE SET minutes = minutes + excluded.minutes, updated_at = excluded.updated_at`,
      )
      .bind(week, landId, characterId, Math.round(minutes), now, characterId),
  ];
}

// The banners of the week that ended before `now`'s, raised once, for the
// week of `now`: each land to the guild with the most minutes there (of as
// many, the older guild; landWinners), with the members' shares of its
// Sława by their minutes there. A guild gone has no minutes any more. In
// one batch that holds only while the week's banners are not raised, so of
// two requests at once one raises them. The rows of the weeks before the
// last one go with it.
export async function raiseBanners(db, now) {
  const { current, previous } = weeksAround(now);
  if (await db.prepare('SELECT 1 AS done FROM guild_land_weeks WHERE week = ?').bind(current.key).first()) return false;
  const { results } = await db
    .prepare('SELECT m.land_id, m.guild_id, m.character_id, m.minutes FROM guild_land_minutes m JOIN guilds g ON g.id = m.guild_id WHERE m.week = ?')
    .bind(previous.key)
    .all();
  const banners = landWinners(
    results.map((row) => ({ landId: row.land_id, guildId: row.guild_id, minutes: row.minutes })),
    content(),
  );
  const { fame } = landRules(content());
  // Each member's share of each land won, summed by guild and character.
  const shares = new Map();
  for (const banner of banners) {
    const minutes = new Map();
    for (const row of results) {
      if (row.land_id !== banner.landId || row.guild_id !== banner.guildId || row.character_id === null) continue;
      minutes.set(row.character_id, (minutes.get(row.character_id) ?? 0) + row.minutes);
    }
    for (const share of landShares(fame, minutes)) {
      const key = `${banner.guildId}:${share.characterId}`;
      const kept = shares.get(key) ?? { guildId: banner.guildId, characterId: share.characterId, points: 0 };
      kept.points += share.points;
      shares.set(key, kept);
    }
  }
  try {
    await db.batch([
      db.prepare("SELECT CASE WHEN EXISTS (SELECT 1 FROM guild_land_weeks WHERE week = ?) THEN json('nie') ELSE 1 END AS ok").bind(current.key),
      db.prepare('INSERT INTO guild_land_weeks (week, raised_at) VALUES (?, ?)').bind(current.key, now),
      ...banners.map((banner) =>
        db
          .prepare('INSERT INTO guild_land_banners (week, land_id, guild_id, minutes, created_at) SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM guilds WHERE id = ?)')
          .bind(current.key, banner.landId, banner.guildId, banner.minutes, now, banner.guildId),
      ),
      ...[...shares.values()].map((share) =>
        db
          .prepare(
            `INSERT INTO guild_land_fame (week, guild_id, character_id, points)
             SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM guilds WHERE id = ?) AND EXISTS (SELECT 1 FROM characters WHERE id = ?)`,
          )
          .bind(current.key, share.guildId, share.characterId, share.points, share.guildId, share.characterId),
      ),
      db.prepare('DELETE FROM guild_land_minutes WHERE week < ?').bind(previous.key),
      db.prepare('DELETE FROM guild_land_banners WHERE week < ?').bind(previous.key),
      db.prepare('DELETE FROM guild_land_fame WHERE week < ?').bind(previous.key),
      db.prepare('DELETE FROM guild_land_weeks WHERE week < ?').bind(previous.key),
    ]);
  } catch (error) {
    if (raced(error) || String(error?.message).includes('UNIQUE')) return false;
    throw error;
  }
  return true;
}

// The banners standing in the week of `now`, by land: the guild's id, tag
// and name, for every land's card (characters.js, GET /api/character).
export async function bannersNow(db, now) {
  const { current } = weeksAround(now);
  const { results } = await db
    .prepare('SELECT b.land_id, b.guild_id, g.tag, g.name FROM guild_land_banners b JOIN guilds g ON g.id = b.guild_id WHERE b.week = ?')
    .bind(current.key)
    .all();
  return Object.fromEntries(results.map((row) => [row.land_id, { guildId: row.guild_id, tag: row.tag, name: row.name }]));
}

// The share more gold and materials from the creatures of the land of
// `placeId` an exploration of the character set out on now gets: the
// lands' bonus while its guild's banner stands there, else 0 (hunts.js).
export async function bannerBonus(db, characterId, placeId, now) {
  const landId = typeof placeId === 'string' ? landOf(placeId) : null;
  if (!landId) return 0;
  const { current } = weeksAround(now);
  const found = await db
    .prepare('SELECT 1 AS found FROM guild_land_banners b JOIN guild_members m ON m.guild_id = b.guild_id WHERE b.week = ? AND b.land_id = ? AND m.character_id = ?')
    .bind(current.key, landId, characterId)
    .first();
  return found ? landRules(content()).bonus : 0;
}

// The lands' words for the page, the rules' numbers filled in.
function landTexts() {
  const { fame, bonus } = landRules(content());
  const { how, howFame: _fame, howMembers: _members, ...rest } = words();
  const vars = { fame, bonus: Math.round(bonus * 100) };
  return { ...rest, how: how.map((line) => filled(line, vars)), bonusPercent: Math.round(bonus * 100) };
}

// GET /api/guild/lands: the week of the lands for the guild of the one who
// asks, live: each land anyone explored this week, with its minutes, the
// guild's state there (lead, alone or chase) and the gap, the rival's tag
// and name; the banners of the guild standing this week; the rules and the
// words. Outside a guild, the words only. The banners of the week before
// are raised first, should no look have raised them yet.
export async function getGuildLands(context) {
  const { guild, db } = await guildPlayer(context);
  const now = context.now;
  await raiseBanners(db, now);
  const texts = landTexts();
  if (!guild) return json({ guild: null, texts });
  const { current } = weeksAround(now);
  const [minutes, banners, guilds] = await db.batch([
    db
      .prepare('SELECT m.land_id, m.guild_id, SUM(m.minutes) AS minutes FROM guild_land_minutes m JOIN guilds g ON g.id = m.guild_id WHERE m.week = ? GROUP BY m.land_id, m.guild_id')
      .bind(current.key),
    db.prepare('SELECT land_id FROM guild_land_banners WHERE week = ? AND guild_id = ?').bind(current.key, guild.id),
    db.prepare('SELECT DISTINCT g.id, g.tag, g.name FROM guild_land_minutes m JOIN guilds g ON g.id = m.guild_id WHERE m.week = ?').bind(current.key),
  ]);
  const byId = new Map(guilds.results.map((row) => [row.id, row]));
  const standings = landStandings(
    minutes.results.map((row) => ({ landId: row.land_id, guildId: row.guild_id, minutes: row.minutes })),
    guild.id,
    content(),
  );
  const landName = (id) => content().regionsById[id]?.name ?? id;
  return json({
    guild: { id: guild.id, tag: guild.tag, name: guild.name },
    week: { key: current.key, endsAt: current.endsAt },
    lands: standings.map((one) => ({
      id: one.landId,
      name: landName(one.landId),
      own: one.own,
      state: one.state,
      gap: one.gap,
      rival: one.rival && { tag: byId.get(one.rival.guildId)?.tag ?? '', name: byId.get(one.rival.guildId)?.name ?? '', minutes: one.rival.minutes },
    })),
    banners: banners.results.map((row) => ({ id: row.land_id, name: landName(row.land_id) })),
    rules: landRules(content()),
    texts,
  });
}

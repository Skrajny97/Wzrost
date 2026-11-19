// Bohaterowie tygodnia (1198 A; data/guilds.json `heroes`; the engine's
// guild-heroes.js picks them; DECISIONS.md, "Bohaterowie tygodnia"): every
// Monday at midnight in Poland (the first look of the new week, or the
// cron's minute after midnight: nameHeroes) the game names the best members
// of each guild of the week that ended, once its members' Sława is written
// (guild-members.js): the Filar Gildii by the Sława each brought the guild
// (guild_member_fame), the Pogromca by the damage dealt to the guild's
// Bestia and its Wyprawa's guardians (the attacks keep it, each with its
// character), the Dobroczyńca by the pieces given in its Prośby. Only the
// members of now count. Each hero gets its reward in the same batch, once,
// and wears its badge by its name on the members' list and on its card
// for the whole week (heroesOf, badgesOf). This changes 897 A, whose
// ranking gave nothing; the author accepted it on the review page.

import { countedForm, heroKinds, heroName, heroReward, questPeriod, weekHeroes } from '../engine/index.js';
import { raced } from './atomic.js';
import { content } from './content.js';
import { FAME_PARTS, memberFame } from './guild-members.js';
import { requireMember } from './guild-trials.js';
import { json } from './http.js';
import { numberText } from './i18n.js';

const rules = () => content().guilds.heroes;
const words = () => rules().texts;
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (whole, name) => String(vars[name] ?? whole));

// The week around `now` and the one before it.
function weeksAround(now) {
  const current = questPeriod('weekly', now, content());
  return { current, previous: questPeriod('weekly', current.startsAt - 1, content()) };
}

// What a week counts for each kind of hero, by guild and character: the
// statements of the damage to the Bestia and to the Wyprawa's guardians
// and of the pieces given in the Prośby (`week`: its key and bounds), each
// row (guild_id, character_id, count), of every guild or of `guildId`'s.
function weekCounts(db, week, guildId = null) {
  const only = (column) => (guildId === null ? '' : ` AND ${column} = ?`);
  const guild = guildId === null ? [] : [guildId];
  return {
    beast: db
      .prepare(
        `SELECT b.guild_id, h.character_id, SUM(h.damage) AS count FROM guild_beasts b JOIN guild_beast_hits h ON h.beast_id = b.id
           JOIN characters c ON c.id = h.character_id AND c.created_at <= h.created_at
         WHERE b.week = ?${only('b.guild_id')} GROUP BY b.guild_id, h.character_id`,
      )
      .bind(week.key, ...guild),
    guardians: db
      .prepare(
        `SELECT e.guild_id, h.character_id, SUM(h.damage) AS count FROM guild_expeditions e JOIN guild_expedition_guardians s ON s.expedition_id = e.id
           JOIN guild_expedition_hits h ON h.guardian_id = s.id JOIN characters c ON c.id = h.character_id AND c.created_at <= h.created_at
         WHERE e.week = ?${only('e.guild_id')} GROUP BY e.guild_id, h.character_id`,
      )
      .bind(week.key, ...guild),
    gifts: db
      .prepare(
        `SELECT guild_id, giver_id AS character_id, SUM(count) AS count FROM guild_gifts
         WHERE created_at >= ? AND created_at < ?${only('guild_id')} GROUP BY guild_id, giver_id`,
      )
      .bind(week.startsAt, week.endsAt, ...guild),
  };
}

// Adds rows (guild_id, character_id, count) into a Map of guild to a Map of
// character to its count.
function addRows(into, rows, field = 'count') {
  for (const row of rows) {
    const guild = into.get(row.guild_id) ?? new Map();
    guild.set(row.character_id, (guild.get(row.character_id) ?? 0) + (row[field] ?? 0));
    into.set(row.guild_id, guild);
  }
  return into;
}

// The heroes of the week that ended before `now`'s, named once, when its
// members' Sława is written (else on a later look): for each guild with
// members, the members of now, each kind's best (weekHeroes), and each hero
// its reward (Punkty Czasu and packs of cards), in one batch that holds
// only while the week is not named; a hero gone from its guild in between
// gets neither row nor reward. The rows of the weeks before the last one go.
export async function nameHeroes(db, now) {
  const { previous } = weeksAround(now);
  const [named, frozen] = await db.batch([
    db.prepare('SELECT 1 AS done FROM guild_hero_weeks WHERE week = ?').bind(previous.key),
    db.prepare('SELECT 1 AS done FROM guild_member_fame_weeks WHERE week = ?').bind(previous.key),
  ]);
  if (named.results[0] || !frozen.results[0]) return false;
  const counts = weekCounts(db, previous);
  const sum = FAME_PARTS.map((part) => `COALESCE(${part}, 0)`).join(' + ');
  const [members, fame, beast, guardians, gifts] = await db.batch([
    db.prepare('SELECT guild_id, character_id, joined_at FROM guild_members ORDER BY guild_id'),
    db.prepare(`SELECT guild_id, character_id, SUM(${sum}) AS count FROM guild_member_fame WHERE week = ? AND character_id > 0 GROUP BY guild_id, character_id`).bind(previous.key),
    counts.beast,
    counts.guardians,
    counts.gifts,
  ]);
  const pillar = addRows(new Map(), fame.results);
  const slayer = addRows(addRows(new Map(), beast.results), guardians.results);
  const benefactor = addRows(new Map(), gifts.results);
  const byGuild = new Map();
  for (const row of members.results) {
    const list = byGuild.get(row.guild_id) ?? [];
    list.push({ id: row.character_id, joinedAt: row.joined_at });
    byGuild.set(row.guild_id, list);
  }
  const heroes = [];
  for (const [guildId, list] of byGuild) {
    const found = weekHeroes(
      { members: list, counts: { pillar: pillar.get(guildId) ?? new Map(), slayer: slayer.get(guildId) ?? new Map(), benefactor: benefactor.get(guildId) ?? new Map() } },
      content(),
    );
    for (const hero of found) heroes.push({ ...hero, guildId });
  }
  const reward = heroReward(content());
  const isHero = 'EXISTS (SELECT 1 FROM guild_heroes WHERE week = ? AND guild_id = ? AND kind = ? AND character_id = ?)';
  try {
    await db.batch([
      db.prepare("SELECT CASE WHEN EXISTS (SELECT 1 FROM guild_hero_weeks WHERE week = ?) THEN json('nie') ELSE 1 END AS ok").bind(previous.key),
      db.prepare('INSERT INTO guild_hero_weeks (week, named_at) VALUES (?, ?)').bind(previous.key, now),
      ...heroes.flatMap((hero) => [
        db
          .prepare(
            `INSERT INTO guild_heroes (week, guild_id, kind, character_id, value, created_at)
             SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM guild_members WHERE guild_id = ? AND character_id = ?)`,
          )
          .bind(previous.key, hero.guildId, hero.kind, hero.characterId, hero.value, now, hero.guildId, hero.characterId),
        db
          .prepare(`UPDATE characters SET time_points = time_points + ?, card_packs = card_packs + ? WHERE id = ? AND ${isHero}`)
          .bind(reward.timePoints, reward.packs, hero.characterId, previous.key, hero.guildId, hero.kind, hero.characterId),
      ]),
      db.prepare('DELETE FROM guild_heroes WHERE week < ?').bind(previous.key),
      db.prepare('DELETE FROM guild_hero_weeks WHERE week < ?').bind(previous.key),
    ]);
  } catch (error) {
    if (raced(error) || String(error?.message).includes('UNIQUE')) return false;
    throw error;
  }
  return true;
}

// The badges of the heroes of the week before `now`'s in a guild, by
// character id: each its kinds, in their order (guilds.js, the members).
export async function heroesOf(db, guildId, now) {
  const { previous } = weeksAround(now);
  const { results } = await db.prepare('SELECT kind, character_id FROM guild_heroes WHERE week = ? AND guild_id = ?').bind(previous.key, guildId).all();
  return kindsByCharacter(results);
}

// A character's own badges of the week before `now`'s, whatever its guild
// now (its card, characters.js): the kinds, in their order.
export async function badgesOf(db, characterId, now) {
  const { previous } = weeksAround(now);
  const { results } = await db.prepare('SELECT kind, character_id FROM guild_heroes WHERE week = ? AND character_id = ?').bind(previous.key, characterId).all();
  return kindsByCharacter(results).get(characterId) ?? [];
}

function kindsByCharacter(rows) {
  const order = heroKinds(content()).map((kind) => kind.id);
  const found = new Map();
  for (const row of rows) found.set(row.character_id, [...(found.get(row.character_id) ?? []), row.kind]);
  for (const [id, kinds] of found) found.set(id, kinds.sort((a, b) => order.indexOf(a) - order.indexOf(b)));
  return found;
}

// A badge for the page: its kind, the hero's name of it for the character's
// look and the words of its tip ("Pogromczyni poprzedniego tygodnia").
export function badgeView(kind, appearance) {
  const name = heroName(kind, appearance, content());
  return { kind, name, tip: filled(words().badge, { name }) };
}

// "1 240 obrażeń": a hero's count in words.
function countText(kind, value) {
  const found = heroKinds(content()).find((one) => one.id === kind);
  return `${numberText(value)} ${countedForm(value, found.units)}`;
}

// GET /api/guild/heroes: the heroes of the guild of the one who asks of the
// week before (each with its kind, name, count and the character's name,
// class and look), this week's leaders so far, counted as the heroes will
// be on Monday (the members of now), and the words with the reward filled
// in. The week before is named first, should no look have named it yet.
export async function getGuildHeroes(context) {
  const { guild, db } = await requireMember(context);
  const now = context.now;
  await nameHeroes(db, now);
  const { current, previous } = weeksAround(now);
  const counts = weekCounts(db, current, guild.id);
  const live = memberFame(current, guild.id);
  const [members, last, beast, guardians, gifts, ...fame] = await db.batch([
    db
      .prepare('SELECT m.character_id, m.joined_at, c.name, c.class_id, c.appearance FROM guild_members m JOIN characters c ON c.id = m.character_id WHERE m.guild_id = ?')
      .bind(guild.id),
    db
      .prepare('SELECT h.kind, h.character_id, h.value, c.name, c.class_id, c.appearance FROM guild_heroes h JOIN characters c ON c.id = h.character_id WHERE h.week = ? AND h.guild_id = ?')
      .bind(previous.key, guild.id),
    counts.beast,
    counts.guardians,
    counts.gifts,
    ...live.map(({ sql, binds }) => db.prepare(sql).bind(...binds)),
  ]);
  const pillar = new Map();
  for (const result of fame) for (const row of result.results) pillar.set(row.character_id, (pillar.get(row.character_id) ?? 0) + (row.points ?? 0));
  const slayer = addRows(addRows(new Map(), beast.results), guardians.results).get(guild.id) ?? new Map();
  const benefactor = addRows(new Map(), gifts.results).get(guild.id) ?? new Map();
  const people = new Map(members.results.map((row) => [row.character_id, row]));
  const leaders = weekHeroes(
    { members: members.results.map((row) => ({ id: row.character_id, joinedAt: row.joined_at })), counts: { pillar, slayer, benefactor } },
    content(),
  );
  const person = (id, row = people.get(id)) => row && { id, name: row.name, classId: row.class_id };
  const kinds = heroKinds(content());
  const reward = heroReward(content());
  const timePoints = `${numberText(reward.timePoints)} ${countedForm(reward.timePoints, words().timePointForms)}`;
  const texts = words();
  return json({
    last: kinds
      .map((kind) => {
        const row = last.results.find((one) => one.kind === kind.id);
        return row && { ...badgeView(kind.id, row.appearance), value: row.value, valueText: countText(kind.id, row.value), character: person(row.character_id, row) };
      })
      .filter(Boolean),
    leaders: kinds.map((kind) => {
      const hero = leaders.find((one) => one.kind === kind.id);
      const row = hero && people.get(hero.characterId);
      return {
        ...badgeView(kind.id, row?.appearance ?? 'male'),
        ...(hero && row ? { value: hero.value, valueText: countText(kind.id, hero.value), character: person(hero.characterId) } : {}),
      };
    }),
    reward,
    texts: {
      title: texts.title,
      lead: texts.lead,
      last: texts.last,
      none: texts.none,
      now: texts.now,
      nobody: texts.nobody,
      reward: filled(texts.reward, { timePoints }),
      how: texts.how.map((line) => filled(line, { timePoints })),
    },
  });
}

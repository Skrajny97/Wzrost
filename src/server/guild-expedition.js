// The Wyprawa Gildii (the author's 621 A, mock-up 624; the engine's
// guild-expedition.js has the rules, data/guilds.json `expedition` the
// numbers and the words; DECISIONS.md, "Wyprawa Gildii (621 A)"): a
// guild's route of the week (from Monday, midnight in Poland, as the
// weekly quests), made by the first look at it: the land of the members'
// average level then, with its seven guardians, for the members active then
// and, in part, those who join later (as the Próby Gildii). Every minute of
// exploration a member claims a report for goes onto the route of the
// guild it is in then (expeditionMinutes, in the claim's own batch); a
// guardian comes with the first look once the route reaches it, at the
// members of that moment, and bars the way until it falls; the minutes
// gathered meanwhile wait and walk the route on as it falls. Whoever added
// minutes in the guild that week attacks the guardian attacksPerDay times a
// Polish day, apart from the Bestia's attacks, as the Bestia is attacked:
// one fight, with the report at once, whatever the character is doing,
// since it changes nothing of it. A fallen guardian gives a chest to each
// character that added minutes in that guild that week, once a week and
// stage whatever its guild, opened that week or the next. Each save holds
// only while what was read still holds (atomic.js). A character removed and
// its id given again (the characters' ids are not AUTOINCREMENT) takes
// nothing of the one before. No line in the guild's chat, as for the
// Bestia.

import {
  bagCapacity,
  campLevels,
  countedForm,
  expeditionChest,
  expeditionGuardian,
  expeditionProgress,
  expeditionStageMinutes,
  expeditionStages,
  guildBeastFight,
  guildExpedition,
  isUnlocked,
  itemName,
  materialsText,
  materialView,
  questPeriod,
} from '../engine/index.js';
import { assertion, atomically, sameVersion } from './atomic.js';
import { attackBlocked, bagPlaces, characterView, engineCharacter, equippedItems, loadPlayer, requireNotExploring, requirePlayer, trophiesFor } from './characters.js';
import { content } from './content.js';
import { toHex } from './encoding.js';
import { guildOf } from './guilds.js';
import { ApiError, json, readJson } from './http.js';

const rules = () => content().guilds.expedition;
const words = () => rules().texts;
const errors = () => words().errors;
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
const path = (key) => `$."${key}"`;
const DAY = 24 * 3600000;

// The Wyprawa comes with the Gildie, with the Społeczność.
async function requireExpeditionPlayer(context) {
  const found = await requirePlayer(context);
  if (!isUnlocked('community', found.player.row.level, content())) {
    throw new ApiError(403, 'locked', filled(errors().locked, { level: content().unlocksById.community.level }));
  }
  return { ...found, db: context.env.DB };
}

// The week around `now`, the one before it and the end of the one after.
function weeksAround(now) {
  const current = questPeriod('weekly', now, content());
  const nextEndsAt = questPeriod('weekly', current.endsAt, content()).endsAt;
  const previous = questPeriod('weekly', current.startsAt - 1, content());
  return { current, previous, nextEndsAt };
}

// The statement that adds an exploration's minutes to the route of the
// guild the character is in now, for its week, to put into the claim's own
// batch (hunts.js), so they land only with the report; none outside a
// guild. A Drużyna's trip counts for each member as it claims its own
// report; a mercenary of the Karczma claims none.
export function expeditionMinutes(db, characterId, minutes, now) {
  if (!(minutes > 0)) return [];
  const { key: week } = questPeriod('weekly', now, content());
  return [
    db
      .prepare(
        `INSERT INTO guild_expedition_minutes (guild_id, week, character_id, minutes, updated_at)
         SELECT m.guild_id, ?, ?, ?, ? FROM guild_members m JOIN guilds g ON g.id = m.guild_id WHERE m.character_id = ?
         ON CONFLICT (guild_id, week, character_id) DO UPDATE SET minutes = minutes + excluded.minutes, updated_at = excluded.updated_at`,
      )
      .bind(week, characterId, Math.round(minutes), now, characterId),
  ];
}

const routeRow = (db, guildId, week) => db.prepare('SELECT * FROM guild_expeditions WHERE guild_id = ? AND week = ?').bind(guildId, week);

// The guild's route of the week: the one kept, or one made now from the
// members' character levels, with the members whose accounts were in the
// game in the last activeDays days counted, at least one, their ids kept
// with it (`counted`), so one of them who leaves and joins again this week
// adds no second share (acceptGuildInvite in guilds.js). Of two requests at
// once, the first one's stays. A new route takes the rows of the weeks
// before the last one away, of every guild: nothing of them shows or opens
// any more (as the Bestia's beasts).
async function routeOf(db, guildId, now) {
  const { current, previous } = weeksAround(now);
  const found = await routeRow(db, guildId, current.key).first();
  if (found) return found;
  const [levels, active] = await db.batch([
    db.prepare('SELECT c.level FROM guild_members m JOIN characters c ON c.id = m.character_id WHERE m.guild_id = ?').bind(guildId),
    db
      .prepare(
        `SELECT COUNT(*) AS count, json_group_array(m.character_id) AS ids
         FROM guild_members m JOIN characters c ON c.id = m.character_id JOIN users u ON u.id = c.user_id WHERE m.guild_id = ? AND u.seen_at >= ?`,
      )
      .bind(guildId, now - rules().activeDays * DAY),
  ]);
  const route = guildExpedition({ levels: levels.results.map((member) => member.level) }, content());
  await db.batch([
    db.prepare('DELETE FROM guild_expedition_hits WHERE guardian_id IN (SELECT g.id FROM guild_expedition_guardians g JOIN guild_expeditions e ON e.id = g.expedition_id WHERE e.week < ?)').bind(previous.key),
    db.prepare('DELETE FROM guild_expedition_guardians WHERE expedition_id IN (SELECT id FROM guild_expeditions WHERE week < ?)').bind(previous.key),
    db.prepare('DELETE FROM guild_expeditions WHERE week < ?').bind(previous.key),
    db.prepare('DELETE FROM guild_expedition_minutes WHERE week < ?').bind(previous.key),
    db.prepare('DELETE FROM guild_expedition_chests WHERE week < ?').bind(previous.key),
    db
      .prepare('INSERT OR IGNORE INTO guild_expeditions (guild_id, week, land_id, level, guardians, active, counted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(guildId, current.key, route.landId, route.level, JSON.stringify(route.guardians), Math.max(1, active.results[0].count), active.results[0].ids, now),
  ]);
  return routeRow(db, guildId, current.key).first();
}

const guardiansOf = (db, routeId) =>
  db
    .prepare(
      `SELECT g.*, c.name AS fallen_name FROM guild_expedition_guardians g
       LEFT JOIN characters c ON c.id = g.fallen_by AND c.created_at <= g.fallen_at
       WHERE g.expedition_id = ? ORDER BY g.stage`,
    )
    .bind(routeId);

// The character's attacks on guardians on the day `day`, in any guild.
const attacksOn = (db, row, day) =>
  db.prepare('SELECT COUNT(*) AS count FROM guild_expedition_hits WHERE character_id = ? AND day = ? AND created_at >= ?').bind(row.id, day, row.created_at);

// Where a route stands with its guardians (rows, by stage) and the guild's
// minutes of the week (`total`): the members it counts now, how many
// guardians fell and the minutes their stages took, the guardian of the
// stage now if it came, and the route (expeditionProgress).
function standing(route, guardians, total) {
  const members = route.active + (route.joined ?? 0);
  const fallen = guardians.filter((guardian) => guardian.hp <= 0);
  const walked = fallen.reduce((sum, guardian) => sum + guardian.need, 0);
  const current = guardians.find((guardian) => guardian.stage === fallen.length + 1) ?? null;
  const need = current?.need ?? expeditionStageMinutes(members, content());
  return { members, current, progress: expeditionProgress({ minutes: total, walked, beaten: fallen.length, need, standing: Boolean(current) }, content()) };
}

// Everything of the guild's route now, for its tab and its actions: the
// route, its guardians, each member's minutes of the week (with names; a
// character gone keeps its minutes on the route, without one), their total,
// where the route stands and the character's attacks today. A guardian the
// route has reached comes now, for the members of this moment, its stage's
// minutes kept with it.
async function routeState(db, guild, row, now) {
  const route = await routeOf(db, guild.id, now);
  const day = questPeriod('daily', now, content()).key;
  const read = () =>
    db.batch([
      guardiansOf(db, route.id),
      db
        .prepare(
          `SELECT m.character_id, m.minutes, c.name FROM guild_expedition_minutes m
           LEFT JOIN characters c ON c.id = m.character_id
           WHERE m.guild_id = ? AND m.week = ? ORDER BY m.minutes DESC, m.id`,
        )
        .bind(guild.id, route.week),
      attacksOn(db, row, day),
    ]);
  let [guardians, minutes, used] = await read();
  const total = minutes.results.reduce((sum, one) => sum + one.minutes, 0);
  let state = standing(route, guardians.results, total);
  if (state.progress.guardian && !state.current && !state.progress.done) {
    const guardian = expeditionGuardian({ stage: state.progress.stage, level: route.level, members: state.members, guardians: JSON.parse(route.guardians) }, content());
    await db
      .prepare(
        `INSERT OR IGNORE INTO guild_expedition_guardians (expedition_id, stage, monster_id, area_id, level, members, need, max_hp, hp, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(route.id, guardian.stage, guardian.monsterId, guardian.areaId, guardian.level, state.members, state.progress.need, guardian.maxHp, guardian.maxHp, now)
      .run();
    [guardians, minutes, used] = await read();
    state = standing(route, guardians.results, total);
  }
  const own = minutes.results.find((one) => one.character_id === row.id)?.minutes ?? 0;
  return { route, day, guardians: guardians.results, minutes: minutes.results, total, own, used: used.results[0].count, ...state };
}

// SQL of the guardians whose chests a character may open (chestsOf), with
// the binds: the two weeks, the character's id and when it was made, twice.
// It starts from the character's own minutes of those weeks (a row a guild
// and week, by the index on the character), so it reads the routes of the
// guilds it added minutes in and not those of every guild; it is run on
// every look at the guild's dots (GET /api/guild/todo).
export const CHESTS_SQL = `SELECT g.id, g.stage, g.monster_id, g.area_id, g.level, e.week
  FROM guild_expedition_minutes m
  JOIN guild_expeditions e ON e.guild_id = m.guild_id AND e.week = m.week
  JOIN guild_expedition_guardians g ON g.expedition_id = e.id
  WHERE m.character_id = ? AND m.week IN (?, ?) AND m.minutes > 0 AND m.updated_at >= ? AND g.hp <= 0
    AND NOT EXISTS (SELECT 1 FROM guild_expedition_chests x WHERE x.character_id = ? AND x.week = e.week AND x.stage = g.stage AND x.claimed_at >= ?)
  ORDER BY e.week, g.stage, g.id`;

// The Skrzynie Wyprawy the character may open now: one for each guardian
// fallen this week or the last one on the route of a guild where it added
// minutes that week, once a week and stage whatever its guild (of two such
// guilds, the first), this week's until the end of the next one.
async function chestsOf(db, row, now) {
  const { current, previous, nextEndsAt } = weeksAround(now);
  const { results } = await db.prepare(CHESTS_SQL).bind(row.id, previous.key, current.key, row.created_at, row.id, row.created_at).all();
  const seen = new Set();
  return results.flatMap((one) => {
    const key = `${one.week}:${one.stage}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [
      {
        id: one.id,
        week: one.week,
        stage: one.stage,
        guardian: { monsterId: one.monster_id, areaId: one.area_id, level: one.level },
        item: Boolean(rules().guardians[one.stage - 1]?.item),
        until: one.week === current.key ? nextEndsAt : current.endsAt,
      },
    ];
  });
}

const monsterName = (id) => content().monstersById[id]?.name ?? id;

// The tab's words (all but the answers' errors), with the rules' numbers
// filled in.
function tabTexts() {
  const { errors: _, ...texts } = words();
  const fame = content().guilds.fame;
  const points = (count) => `${count} ${countedForm(count, fame.texts.pointForms)}`;
  const numbers = {
    stages: expeditionStages(content()),
    perMember: rules().stageMinutes.perMember,
    attacks: rules().attacksPerDay,
    fame: points(fame.expedition.perGuardian),
    fameLast: points(fame.expedition.last),
  };
  return { ...texts, lead: filled(texts.lead, numbers), how: texts.how.map((line) => filled(line, numbers)) };
}

// A chest as the tab lists it.
const chestView = (chest) => ({ week: chest.week, stage: chest.stage, monsterId: chest.guardian.monsterId, name: monsterName(chest.guardian.monsterId), item: chest.item, until: chest.until });

// The Wyprawa for the tab: outside a guild only the chests it may still
// open and the words. In a guild, the route of the week: its land and
// level, the stage now with its minutes walked and needed, the minutes kept
// at a guardian, every stage's guardian (fallen, barring the way, or ahead
// with the minutes to it), the attacks the character has left today and
// whether it may attack (it added minutes this week; `attacks.blocked`, the
// words of why not, while its `activity` is an offer or a service as a
// mercenary: attackBlocked), the "Wkład tygodnia" (who added how many
// minutes, the most first), its chests, and the words.
export async function expeditionView(db, row, guild, now, activity = null) {
  const chests = (await chestsOf(db, row, now)).map(chestView);
  if (!guild) return { expedition: null, chests, texts: tabTexts() };
  const state = await routeState(db, guild, row, now);
  const { route, progress, current } = state;
  const { current: week } = weeksAround(now);
  const planned = JSON.parse(route.guardians);
  const land = content().regionsById[route.land_id];
  const perDay = rules().attacksPerDay;
  const guardians = planned.map((guardian, index) => {
    const stage = index + 1;
    const came = state.guardians.find((one) => one.stage === stage);
    const fallen = Boolean(came && came.hp <= 0);
    return {
      stage,
      monsterId: guardian.monsterId,
      name: monsterName(guardian.monsterId),
      level: came?.level ?? route.level + index,
      state: fallen ? 'fallen' : came ? 'standing' : 'ahead',
      item: Boolean(rules().guardians[index]?.item),
      ...(came && {
        hp: came.hp,
        maxHp: came.max_hp,
        fallenAt: came.fallen_at,
        fallenBy: came.fallen_name ?? null,
      }),
    };
  });
  const area = current && content().areasById[current.area_id];
  return {
    expedition: {
      week: route.week,
      endsAt: week.endsAt,
      land: { id: route.land_id, name: land?.name ?? route.land_id },
      level: route.level,
      stages: planned.length,
      stage: progress.stage,
      progress: progress.progress,
      need: progress.need,
      banked: progress.banked,
      barred: progress.guardian && !progress.done,
      done: progress.done,
      total: state.total,
      members: state.members,
      guardians,
      placeName: area?.name ?? null,
    },
    attacks: { left: Math.max(0, perDay - state.used), perDay, blocked: attackBlocked(activity, words().mercenary) },
    contributor: state.own > 0,
    own: { minutes: state.own },
    contribution: state.minutes.filter((one) => one.name && one.minutes > 0).map((one) => ({ name: one.name, minutes: one.minutes, own: one.character_id === row.id })),
    chests,
    texts: tabTexts(),
  };
}

// GET /api/guild/expedition
export async function getGuildExpedition(context) {
  const { player, db } = await requireExpeditionPlayer(context);
  return json(await expeditionView(db, player.row, await guildOf(db, player.row.id), context.now, player.activity));
}

// The engine's guardian, for the Bestia's fight, from its row.
const engineGuardian = (row) => ({ monsterId: row.monster_id, areaId: row.area_id, level: row.level, hp: row.hp, maxHp: row.max_hp });

// POST /api/guild/expedition/attack: one fight on the guardian barring the
// way, as an attack on the Bestia (guildBeastFight): the character alone at
// full HP, no potions, its Encyklopedia's trophy against the guardian and
// the land's trait counting. Only for a member who added minutes in the
// guild this week, with an attack left today. Saved only while the
// character is as read, still in the guild, with an attack left and the
// guardian standing: the hit, never more than the HP left then, and the HP
// it takes off the bar, with who felled it and when. Answers with the
// damage, the HP left, whether this hit felled it, the fight's lines, its
// playback for the arena and the Wyprawa anew (the route walked on by the
// minutes kept, once it fell).
export async function attackGuildGuardian(context) {
  const { player, db } = await requireExpeditionPlayer(context);
  const { row } = player;
  const now = context.now;
  // Not while offering itself as a mercenary or serving, as at the Bestia.
  if (player.activity?.kind === 'mercenary') requireNotExploring(player, now);
  const guild = await guildOf(db, row.id);
  if (!guild) throw new ApiError(409, 'no_guild', errors().noGuild);
  const state = await routeState(db, guild, row, now);
  if (state.progress.done) throw new ApiError(409, 'done', errors().done);
  const guardian = state.current;
  if (!guardian || guardian.hp <= 0) throw new ApiError(409, 'no_guardian', errors().noGuardian);
  if (state.own <= 0) throw new ApiError(409, 'not_contributor', errors().notContributor);
  const perDay = rules().attacksPerDay;
  if (state.used >= perDay) throw new ApiError(409, 'no_attacks', errors().noAttacks);

  // The Encyklopedia's trophy against the guardian's creature counts.
  const trophies = trophiesFor(player, now, [guardian.monster_id]);
  const seed = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const fight = guildBeastFight({ character: engineCharacter(row), equipped: equippedItems(player), name: row.name, beast: engineGuardian(guardian), seed, trophies }, content());
  const [, , , , before, , , after] = await atomically(
    db,
    [
      sameVersion(db, row),
      assertion(db, '(SELECT COUNT(*) FROM guild_expedition_hits WHERE character_id = ? AND day = ? AND created_at >= ?) < ?', [row.id, state.day, row.created_at, perDay]),
      assertion(db, '(SELECT hp FROM guild_expedition_guardians WHERE id = ?) > 0', [guardian.id]),
      assertion(db, 'EXISTS (SELECT 1 FROM guild_members WHERE character_id = ? AND guild_id = ?)', [row.id, guild.id]),
      db.prepare('SELECT hp FROM guild_expedition_guardians WHERE id = ?').bind(guardian.id),
      // The hit reads the HP before the bar goes down below.
      db
        .prepare('INSERT INTO guild_expedition_hits (guardian_id, character_id, day, damage, created_at) SELECT id, ?, ?, MIN(?, hp), ? FROM guild_expedition_guardians WHERE id = ?')
        .bind(row.id, state.day, fight.damage, now, guardian.id),
      db
        .prepare(
          `UPDATE guild_expedition_guardians SET hp = MAX(0, hp - ?), fallen_at = CASE WHEN hp <= ? THEN ? ELSE fallen_at END, fallen_by = CASE WHEN hp <= ? THEN ? ELSE fallen_by END
           WHERE id = ? AND hp > 0`,
        )
        .bind(fight.damage, fight.damage, now, fight.damage, row.id, guardian.id),
      db.prepare('SELECT hp FROM guild_expedition_guardians WHERE id = ?').bind(guardian.id),
    ],
    () => new ApiError(409, 'raced', errors().raced),
  );
  const hpBefore = before.results[0].hp;
  const fell = fight.damage >= hpBefore;
  return json({
    attack: {
      stage: guardian.stage,
      name: monsterName(guardian.monster_id),
      damage: Math.min(fight.damage, hpBefore),
      hp: after.results[0].hp,
      fell,
      last: fell && guardian.stage >= expeditionStages(content()),
      won: fight.won,
      log: fight.log,
      fight: fight.replay,
    },
    ...(await expeditionView(db, row, guild, now, player.activity)),
  });
}

// POST /api/guild/expedition/claim { week, stage }: a fallen guardian's
// chest (chestsOf), once. The last stage's item needs a place in the bag;
// gold and materials take none. The batch holds only while the character is
// as read, and the item comes only with the chest written down by it. It
// holds what suits the character as it is when opened (its level and
// class), from its own seed, so the same whenever it is opened.
export async function claimGuildExpeditionChest(context) {
  const { session, player, db } = await requireExpeditionPlayer(context);
  const { row } = player;
  const now = context.now;
  const body = await readJson(context.request);
  const week = typeof body.week === 'string' ? body.week : '';
  const stage = body.stage;
  const chest = Number.isInteger(stage) ? (await chestsOf(db, row, now)).find((one) => one.week === week && one.stage === stage) : null;
  if (!chest) {
    const opened = Number.isInteger(stage)
      ? await db.prepare('SELECT 1 FROM guild_expedition_chests WHERE character_id = ? AND week = ? AND stage = ? AND claimed_at >= ?').bind(row.id, week, stage, row.created_at).first()
      : null;
    throw opened ? new ApiError(409, 'claimed', errors().claimed) : new ApiError(404, 'no_chest', errors().noChest);
  }
  if (chest.item && bagPlaces(player) >= bagCapacity(campLevels(player.buildings, now, content()), content())) {
    throw new ApiError(409, 'bag_full', errors().bagFull);
  }
  const { gold, materials, item } = expeditionChest(
    {
      stage,
      level: row.level,
      classId: row.class_id,
      classLevel: row.class_level,
      wornSlots: equippedItems(player).map((worn) => worn.slot),
      guardian: chest.guardian,
      seed: `${row.id}:expedition:${week}:${stage}`,
    },
    content(),
  );
  const found = Object.entries(materials);
  const setMaterials = found.length > 0 ? `, materials = json_set(materials, ${found.map(() => '?, COALESCE(json_extract(materials, ?), 0) + ?').join(', ')})` : '';
  await atomically(db, [
    sameVersion(db, row),
    // OR REPLACE: a chest written down for a removed character whose id
    // came back (chestsOf leaves it out).
    db.prepare('INSERT OR REPLACE INTO guild_expedition_chests (character_id, week, stage, guardian_id, claimed_at) VALUES (?, ?, ?, ?, ?)').bind(row.id, week, stage, chest.id, now),
    db
      .prepare(`UPDATE characters SET gold = gold + ?${setMaterials}, version = version + 1 WHERE id = ? AND version = ?`)
      .bind(gold, ...found.flatMap(([key, count]) => [path(key), path(key), count]), row.id, row.version),
    ...(item
      ? [
          db
            .prepare('INSERT INTO items (character_id, slot, data, created_at) SELECT ?, NULL, ?, ? WHERE EXISTS (SELECT 1 FROM characters WHERE id = ? AND version = ?)')
            .bind(row.id, JSON.stringify(item), now, row.id, row.version + 1),
        ]
      : []),
  ]);
  const contents = [filled(words().gold, { gold: new Intl.NumberFormat('pl-PL').format(gold) }), item && itemName(item, content()), found.length > 0 && materialsText(materials, content())].filter(Boolean).join(', ');
  const after = await loadPlayer(db, session.userId);
  // The item came last, so its id is the highest of the character's: the
  // page finds it in the bag by it, for its card.
  const itemId = item && Math.max(...after.items.map((one) => one.id));
  return json({
    chest: {
      week,
      stage,
      gold,
      item: item && { id: itemId, name: itemName(item, content()), rarity: item.rarity, color: content().raritiesById[item.rarity].color },
      materials: found.map(([key, count]) => {
        const view = materialView(key, count, content());
        return { key, materialId: view.materialId, name: view.name, label: view.label, color: view.color, rarityName: view.rarityName, count };
      }),
      text: filled(words().opened, { contents }),
    },
    character: characterView(after, now),
    ...(await expeditionView(db, after.row, await guildOf(db, after.row.id), now, after.activity)),
  });
}

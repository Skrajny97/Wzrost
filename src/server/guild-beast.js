// The Bestia Gildii (data/guilds.json, beast; src/engine/guild-beast.js;
// DECISIONS.md, "Bestia Gildii"; the author: "344 A"): a guild's weekly
// hunt on one huge beast, nobody having to play at the same time. A guild's
// beast of a week comes with the first look at it or attack on it in that
// week (from Monday, midnight in Poland, as the weekly quests): a champion
// drawn from the guild's and the week's seed, at the members' average level
// then, with HP for their number then. A character in a guild attacks it
// attacksPerDay times a Polish day, in whatever guild (a character that
// changes its guild gets no fresh attacks), not on an exploration nor
// before its report is claimed (as the Wieże: the report is made with the
// character as it is then), but at a profession's work. An attack is one
// fight with the report at once; what the beast loses stays on its bar for
// the whole guild, and the hit that brings it to 0 is written down with
// who made it and when. No XP, gold or loot for an attack: whoever hit the
// beast in a week opens a Skrzynia Bestii once for that week (the best of
// the beasts it hit then), as soon as its beast fell and through the whole
// next week whatever came of it. Each save holds only while what was read
// still holds (atomic.js). A character removed and its id given again (the
// characters' ids are not AUTOINCREMENT) takes nothing of the one before:
// only what was written since the character was made counts.

import {
  bagCapacity,
  beastChest,
  beastChestTier,
  campLevels,
  guildBeast,
  guildBeastFight,
  isUnlocked,
  itemName,
  materialsText,
  materialView,
  questPeriod,
  trophyBonuses,
} from '../engine/index.js';
import { assertion, atomically, sameVersion } from './atomic.js';
import { bagPlaces, characterView, engineCharacter, equippedItems, loadPlayer, requireNotExploring, requirePlayer } from './characters.js';
import { content } from './content.js';
import { toHex } from './encoding.js';
import { guildOf } from './guilds.js';
import { ApiError, json, readJson } from './http.js';

const rules = () => content.guilds.beast;
const errors = () => rules().texts.errors;
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
const path = (key) => `$."${key}"`;

// The Bestia comes with the Gildie, with the Społeczność.
async function requireBeastPlayer(context) {
  const found = await requirePlayer(context);
  if (!isUnlocked('community', found.player.row.level, content)) {
    throw new ApiError(403, 'locked', filled(errors().locked, { level: content.unlocksById.community.level }));
  }
  return found;
}

// The week around `now`, the one before it and the end of the one after.
function weeksAround(now) {
  const current = questPeriod('weekly', now, content);
  const nextEndsAt = questPeriod('weekly', current.endsAt, content).endsAt;
  const previous = questPeriod('weekly', current.startsAt - 1, content);
  return { current, previous, nextEndsAt };
}

// The guild's beast of the week, made by the first look at it or attack on
// it: at the members' character levels now, for their number now. The
// beasts of the weeks before the last one go then, with their hits and
// chests, of every guild: nothing of them shows or opens any more.
async function beastOf(db, guildId, now) {
  const { current, previous } = weeksAround(now);
  const read = () => db.prepare('SELECT * FROM guild_beasts WHERE guild_id = ? AND week = ?').bind(guildId, current.key).first();
  const found = await read();
  if (found) return found;
  const { results } = await db.prepare('SELECT c.level FROM guild_members m JOIN characters c ON c.id = m.character_id WHERE m.guild_id = ?').bind(guildId).all();
  const beast = guildBeast({ seed: `${guildId}:${current.key}`, levels: results.map((member) => member.level) }, content);
  await db.batch([
    db.prepare('DELETE FROM guild_beast_hits WHERE beast_id IN (SELECT id FROM guild_beasts WHERE week < ?)').bind(previous.key),
    db.prepare('DELETE FROM guild_beasts WHERE week < ?').bind(previous.key),
    db.prepare('DELETE FROM guild_beast_chests WHERE week < ?').bind(previous.key),
    db
      .prepare('INSERT OR IGNORE INTO guild_beasts (guild_id, week, monster_id, area_id, level, members, max_hp, hp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(guildId, current.key, beast.monsterId, beast.areaId, beast.level, beast.members, beast.maxHp, beast.maxHp, now),
  ]);
  return read();
}

// The engine's beast from its row.
const engineBeast = (row) => ({ monsterId: row.monster_id, areaId: row.area_id, level: row.level, hp: row.hp, maxHp: row.max_hp });

// The character's attacks on the day `day`, in any guild.
const attacksOn = (db, row, day) =>
  db.prepare('SELECT COUNT(*) AS count FROM guild_beast_hits WHERE character_id = ? AND day = ? AND created_at >= ?').bind(row.id, day, row.created_at);

// The Skrzynie Bestii the character may open now: one for each week in
// which it hit a beast and has not opened that week's chest, of the best
// result among the beasts it hit that week (it may have changed its
// guild): this week's once the beast fell, last week's whatever came of
// it, none under the smallest share of the bar knocked off.
async function chestsOf(db, row, now) {
  const { current, previous, nextEndsAt } = weeksAround(now);
  const { results } = await db
    .prepare(
      `SELECT b.* FROM guild_beasts b
       WHERE b.week IN (?, ?)
         AND b.id IN (SELECT h.beast_id FROM guild_beast_hits h WHERE h.character_id = ? AND h.created_at >= ?)
         AND NOT EXISTS (SELECT 1 FROM guild_beast_chests x WHERE x.character_id = ? AND x.week = b.week AND x.created_at >= ?)
       ORDER BY b.id`,
    )
    .bind(previous.key, current.key, row.id, row.created_at, row.id, row.created_at)
    .all();
  const rank = (tier) => rules().chests.indexOf(tier);
  const best = new Map();
  for (const beast of results) {
    if (beast.week === current.key && beast.hp > 0) continue;
    const tier = beastChestTier({ hp: beast.hp, maxHp: beast.max_hp }, content);
    if (!tier) continue;
    const known = best.get(beast.week);
    if (!known || rank(tier) < rank(known.tier)) best.set(beast.week, { beast, tier });
  }
  return [...best.values()].map(({ beast, tier }) => ({
    week: beast.week,
    beast,
    tier,
    fallen: beast.hp <= 0,
    share: Math.floor(((beast.max_hp - beast.hp) / beast.max_hp) * 100),
    item: tier.item,
    until: beast.week === current.key ? nextEndsAt : current.endsAt,
  }));
}

// The words of the card (all but the answers' errors), with the rules'
// numbers filled in.
function cardTexts() {
  const words = Object.fromEntries(Object.entries(rules().texts).filter(([key]) => key !== 'errors'));
  return { ...words, rules: words.rules.map((line) => filled(line, { attacks: rules().attacksPerDay })) };
}

// The Bestia for the card: the guild's beast of the week (none outside a
// guild) with its monster, level, region and HP, and who felled it; the
// attacks the character has left today; the "Wkład tygodnia", who hit it
// with how much and how often, the most first (a character removed since
// is left out; its damage stays off the bar); the character's own part;
// the chests it may open; and the card's words.
export async function beastView(db, row, now) {
  const guild = await guildOf(db, row.id);
  const { current } = weeksAround(now);
  const day = questPeriod('daily', now, content).key;
  const beast = guild ? await beastOf(db, guild.id, now) : null;
  const [used, hits, felled] = await db.batch([
    attacksOn(db, row, day),
    db
      .prepare(
        `SELECT h.character_id, c.name, SUM(h.damage) AS damage, COUNT(*) AS hits
         FROM guild_beast_hits h JOIN characters c ON c.id = h.character_id AND c.created_at <= h.created_at
         WHERE h.beast_id = ? GROUP BY h.character_id ORDER BY damage DESC, MIN(h.id)`,
      )
      .bind(beast?.id ?? 0),
    db.prepare('SELECT name FROM characters WHERE id = ? AND created_at <= ?').bind(beast?.fallen_by ?? 0, beast?.fallen_at ?? 0),
  ]);
  const contribution = hits.results.map((hit) => ({ name: hit.name, damage: hit.damage, hits: hit.hits, own: hit.character_id === row.id }));
  const own = contribution.find((entry) => entry.own);
  const area = beast && content.areasById[beast.area_id];
  return {
    beast: beast && {
      week: beast.week,
      monsterId: beast.monster_id,
      name: content.monstersById[beast.monster_id]?.name ?? beast.monster_id,
      level: beast.level,
      hp: beast.hp,
      maxHp: beast.max_hp,
      fallen: beast.hp <= 0,
      fallenAt: beast.fallen_at,
      fallenBy: felled.results[0]?.name ?? null,
      regionName: area?.regionName ?? null,
      areaName: area?.name ?? null,
      members: beast.members,
      endsAt: current.endsAt,
    },
    attacks: { left: Math.max(0, rules().attacksPerDay - used.results[0].count), perDay: rules().attacksPerDay },
    contribution,
    own: { damage: own?.damage ?? 0, hits: own?.hits ?? 0 },
    chests: (await chestsOf(db, row, now)).map(({ week, fallen, share, item, until }) => ({ week, fallen, share, item, until })),
    texts: cardTexts(),
  };
}

// GET /api/guild/beast
export async function getGuildBeast(context) {
  const { player } = await requireBeastPlayer(context);
  return json(await beastView(context.env.DB, player.row, context.now));
}

// POST /api/guild/beast/attack: one fight on the guild's beast. Saved only
// while the character is as read, has an attack left today and the beast
// still stands: the hit, never more than the HP left then, and the HP it
// takes off the bar, with who felled the beast and when. Answers with the
// damage, the HP left, whether this hit felled it, the fight's lines, its
// playback for the arena and the Bestia anew.
export async function attackGuildBeast(context) {
  const { player } = await requireBeastPlayer(context);
  const { row } = player;
  const db = context.env.DB;
  const now = context.now;
  requireNotExploring(player, now);
  const guild = await guildOf(db, row.id);
  if (!guild) throw new ApiError(409, 'no_guild', errors().noGuild);
  const day = questPeriod('daily', now, content).key;
  const beast = await beastOf(db, guild.id, now);
  if (beast.hp <= 0) throw new ApiError(409, 'fallen', errors().fallen);
  const perDay = rules().attacksPerDay;
  if ((await attacksOn(db, row, day).first()).count >= perDay) throw new ApiError(409, 'no_attacks', errors().noAttacks);

  // The Encyklopedia's trophy against the beast's creature counts.
  const trophies = trophyBonuses(JSON.parse(row.discovered ?? '{}'), content, [beast.monster_id]);
  const seed = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const fight = guildBeastFight({ character: engineCharacter(row), equipped: equippedItems(player), name: row.name, beast: engineBeast(beast), seed, trophies }, content);
  const [, , , before, , , after] = await atomically(
    db,
    [
      sameVersion(db, row),
      assertion(db, '(SELECT COUNT(*) FROM guild_beast_hits WHERE character_id = ? AND day = ? AND created_at >= ?) < ?', [row.id, day, row.created_at, perDay]),
      assertion(db, '(SELECT hp FROM guild_beasts WHERE id = ?) > 0', [beast.id]),
      db.prepare('SELECT hp FROM guild_beasts WHERE id = ?').bind(beast.id),
      // The hit reads the HP before the bar goes down below.
      db
        .prepare('INSERT INTO guild_beast_hits (beast_id, character_id, day, damage, created_at) SELECT id, ?, ?, MIN(?, hp), ? FROM guild_beasts WHERE id = ?')
        .bind(row.id, day, fight.damage, now, beast.id),
      db
        .prepare(
          `UPDATE guild_beasts SET hp = MAX(0, hp - ?), fallen_at = CASE WHEN hp <= ? THEN ? ELSE fallen_at END, fallen_by = CASE WHEN hp <= ? THEN ? ELSE fallen_by END
           WHERE id = ? AND hp > 0`,
        )
        .bind(fight.damage, fight.damage, now, fight.damage, row.id, beast.id),
      db.prepare('SELECT hp FROM guild_beasts WHERE id = ?').bind(beast.id),
    ],
    () => new ApiError(409, 'raced', errors().raced),
  );
  const hpBefore = before.results[0].hp;
  return json({
    attack: {
      damage: Math.min(fight.damage, hpBefore),
      hp: after.results[0].hp,
      fell: fight.damage >= hpBefore,
      won: fight.won,
      log: fight.log,
      fight: fight.replay,
    },
    ...(await beastView(db, row, now)),
  });
}

// POST /api/guild/beast/claim { week }: the Skrzynia Bestii of a week, once
// (chestsOf). Its item needs a place in the bag; the materials take none.
// The batch holds only while the character is as read, and the item comes
// only with the chest written down by it (as the weekly quests' chest:
// quests.js). The same week's chest holds the same, whenever it is opened.
export async function claimGuildBeastChest(context) {
  const { session, player } = await requireBeastPlayer(context);
  const { row } = player;
  const db = context.env.DB;
  const now = context.now;
  const body = await readJson(context.request);
  const week = typeof body.week === 'string' ? body.week : '';
  const chest = (await chestsOf(db, row, now)).find((one) => one.week === week);
  if (!chest) {
    const opened = await db.prepare('SELECT 1 FROM guild_beast_chests WHERE character_id = ? AND week = ? AND created_at >= ?').bind(row.id, week, row.created_at).first();
    throw opened ? new ApiError(409, 'claimed', errors().claimed) : new ApiError(404, 'no_chest', errors().noChest);
  }
  if (chest.item && bagPlaces(player) >= bagCapacity(campLevels(player.buildings, now, content), content)) {
    throw new ApiError(409, 'bag_full', errors().bagFull);
  }
  const { item, materials } = beastChest(
    {
      level: row.level,
      classId: row.class_id,
      classLevel: row.class_level,
      wornSlots: equippedItems(player).map((worn) => worn.slot),
      beast: engineBeast(chest.beast),
      tier: chest.tier,
      seed: `${row.id}:beast:${week}`,
    },
    content,
  );
  const found = Object.entries(materials);
  const setMaterials = found.length > 0 ? `materials = json_set(materials, ${found.map(() => '?, COALESCE(json_extract(materials, ?), 0) + ?').join(', ')}), ` : '';
  await atomically(db, [
    sameVersion(db, row),
    // OR REPLACE: a chest written down for a removed character whose id
    // came back (chestsOf leaves it out).
    db.prepare('INSERT OR REPLACE INTO guild_beast_chests (character_id, week, beast_id, created_at) VALUES (?, ?, ?, ?)').bind(row.id, week, chest.beast.id, now),
    db
      .prepare(`UPDATE characters SET ${setMaterials}version = version + 1 WHERE id = ? AND version = ?`)
      .bind(...found.flatMap(([key, count]) => [path(key), path(key), count]), row.id, row.version),
    ...(item
      ? [
          db
            .prepare('INSERT INTO items (character_id, slot, data, created_at) SELECT ?, NULL, ?, ? WHERE EXISTS (SELECT 1 FROM characters WHERE id = ? AND version = ?)')
            .bind(row.id, JSON.stringify(item), now, row.id, row.version + 1),
        ]
      : []),
  ]);
  const contents = [item && itemName(item, content), found.length > 0 && materialsText(materials, content)].filter(Boolean).join(', ');
  const after = await loadPlayer(db, session.userId);
  return json({
    chest: {
      week,
      item: item && { name: itemName(item, content), rarity: item.rarity, color: content.raritiesById[item.rarity].color },
      materials: found.map(([key, count]) => {
        const view = materialView(key, count, content);
        return { name: view.name, label: view.label, color: view.color, count };
      }),
      text: filled(rules().texts.opened, { contents }),
    },
    character: characterView(after, now),
    ...(await beastView(db, after.row, now)),
  });
}

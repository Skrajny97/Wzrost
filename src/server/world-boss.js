// The World Bosses (1222–1226 A; data/world-bosses.json; src/engine/world-boss.js;
// DECISIONS.md, "Postrach Krainy (1222–1226)" and "Postrach Krainy co 3 dni
// (24.11.2026)"): in every period (worldBossPeriod: a week, Monday to
// Sunday, before cycle.from, then cycle.days Polish days in a row, from
// midnight in Poland) each band of levels has one boss with one HP bar for
// all its players. A band's boss of a period comes with the first look at
// it or attack on it in that period, with HP for the band's active
// characters then (the character in play of an account seen in the last
// activeDays days, with the World Boss unlocked, its higher level in the
// band), as the Bestia Gildii comes for a guild's members. The column
// `week` keeps the period's key, the date of its first day. A character's
// band goes by the higher of its levels; its first attack of the period
// writes it down with that boss (world_boss_fighters), and the character
// fights that boss to the period's end, whatever its levels do meanwhile.
// It attacks attacksPerDay times a Polish day, whatever it is doing (an
// attack changes nothing of the character, so an exploration's report
// comes out the same), but not while it offers itself or serves as a
// mercenary. An attack is one fight with the report at once; what the boss
// loses stays on the bar for the whole band, and the hit that brings it to
// 0 is written down with who made it and when, and writes the titles of the
// best (world_boss_titles) in the same batch. No XP, gold or loot for an
// attack: whoever hit the boss opens its Skrzynia Bossa once the boss fell,
// or through the whole next period whatever came of it, half as big when
// the boss lived through its period, an item and more gold in it for the
// last blow (each character's own chest, on its own visit: nothing is settled
// for the others in its request). Each save holds only while what was read
// still holds (atomic.js). A character removed takes its rows along.

import {
  bagCapacity,
  bandLevel,
  campLevels,
  gearKey,
  isUnlocked,
  itemName,
  materialsText,
  materialView,
  questPeriod,
  worldBossBand,
  worldBossBandOf,
  worldBossChest,
  worldBossChestPlan,
  worldBossFight,
  worldBossHp,
  worldBossLevelOf,
  worldBossPart,
  worldBossPeriod,
  worldBossThresholds,
  worldBossTitle,
} from '../engine/index.js';
import { assertion, atomically, sameVersion } from './atomic.js';
import { attackBlocked, bagPlaces, characterView, engineCharacter, equippedItems, loadPlayer, requireNotExploring, requirePlayer } from './characters.js';
import { content } from './content.js';
import { toHex } from './encoding.js';
import { companionsGoing } from './hunts.js';
import { ApiError, json, readJson } from './http.js';

const DAY = 86400000;
const rules = () => content().worldBosses;
const errors = () => rules().texts.errors;
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
const path = (key) => `$."${key}"`;

// The World Boss opens with its unlock (data/unlocks.json, world-boss).
async function requireBossPlayer(context) {
  const found = await requirePlayer(context);
  if (!isUnlocked('world-boss', found.player.row.level, content())) {
    throw new ApiError(403, 'locked', filled(errors().locked, { level: content().unlocksById['world-boss'].level }));
  }
  return found;
}

// The boss's period around `now` (worldBossPeriod), the one before it and
// the one after.
function periodsAround(now) {
  const current = worldBossPeriod(now, content());
  return { current, previous: worldBossPeriod(current.startsAt - 1, content()), next: worldBossPeriod(current.endsAt, content()) };
}

// The band's boss of the period, made by the first look at it or attack
// on it: HP for the band's active characters now (worldBossHp). The
// bosses, the fighters' periods of the periods before the last one and the
// titles worn out go then, of every band: nothing of them shows or opens
// any more.
async function bossOf(db, band, now) {
  const { current, previous } = periodsAround(now);
  const read = () => db.prepare('SELECT * FROM world_bosses WHERE week = ? AND region = ?').bind(current.key, band.region).first();
  const found = await read();
  if (found) return found;
  const higher = 'MAX(c.level, c.class_level)';
  const { results } = await db
    .prepare(
      `SELECT ${higher} AS level FROM characters c JOIN users u ON u.id = c.user_id
       WHERE c.role = 'player' AND u.seen_at >= ? AND c.level >= ? AND ${higher} >= ?${band.last ? '' : ` AND ${higher} <= ?`}`,
    )
    .bind(now - rules().activeDays * DAY, content().unlocksById['world-boss'].level, band.minLevel, ...(band.last ? [] : [band.maxLevel]))
    .all();
  const made = worldBossHp(band, results.map((one) => one.level), content());
  await db.batch([
    db.prepare('DELETE FROM world_boss_titles WHERE until <= ?').bind(now),
    db.prepare('DELETE FROM world_boss_fighters WHERE week < ?').bind(previous.key),
    db.prepare('DELETE FROM world_bosses WHERE week < ?').bind(previous.key),
    db
      .prepare('INSERT OR IGNORE INTO world_bosses (week, region, boss, players, level, max_hp, hp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(current.key, band.region, made.boss, made.players, made.level, made.maxHp, made.maxHp, now),
  ]);
  return read();
}

// The character's period with a boss (its first attack's row), or null.
const fighterOf = (db, row, week) => db.prepare('SELECT * FROM world_boss_fighters WHERE week = ? AND character_id = ? AND created_at >= ?').bind(week, row.id, row.created_at);

// The boss the character fights in this period and its band: the one its
// first attack wrote down, else its band's by its levels now; with its row
// of the period (`fighter`, null before the first attack).
async function standingOf(db, row, now) {
  const { current } = periodsAround(now);
  const fighter = await fighterOf(db, row, current.key).first();
  if (fighter) {
    const boss = await db.prepare('SELECT * FROM world_bosses WHERE id = ?').bind(fighter.boss_id).first();
    const band = boss && worldBossBandOf(boss.region, content());
    if (band) return { fighter, boss, band };
  }
  const band = worldBossBand(row.level, row.class_level, content());
  return { fighter: null, boss: await bossOf(db, band, now), band };
}

// The level the character fights its band's boss at, and its chest's.
const levelIn = (band, row) => bandLevel(band, worldBossLevelOf(row.level, row.class_level));

// The Skrzynie Bossa the character may open now: one for each period of a
// boss it hit and whose chest it has not opened, this period's once the
// boss fell, the last one's whatever came of it, each with what it holds
// but its draws (worldBossChestPlan), the title its place won, its
// period's first and last midnight and the moment it opens until: the end
// of the period after the boss's.
async function chestsOf(db, row, now) {
  const { current, previous, next } = periodsAround(now);
  const { results } = await db
    .prepare(
      `SELECT f.week, f.damage, f.boss_id, b.region, b.boss, b.players, b.max_hp, b.hp, b.fallen_by, t.place, t.until AS title_until
       FROM world_boss_fighters f JOIN world_bosses b ON b.id = f.boss_id
       LEFT JOIN world_boss_titles t ON t.boss_id = f.boss_id AND t.character_id = f.character_id
       WHERE f.character_id = ? AND f.created_at >= ? AND f.claimed_at IS NULL AND f.week IN (?, ?)
       ORDER BY f.week`,
    )
    .bind(row.id, row.created_at, previous.key, current.key)
    .all();
  return results
    .filter((one) => one.week !== current.key || one.hp <= 0)
    .map((one) => {
      const band = worldBossBandOf(one.region, content());
      if (!band) return null;
      const fallen = one.hp <= 0;
      const plan = worldBossChestPlan({ level: levelIn(band, row), damage: one.damage, part: worldBossPart({ maxHp: one.max_hp, players: one.players }), fallen, lastBlow: one.fallen_by === row.id }, content());
      const period = one.week === current.key ? current : previous;
      return { ...one, band, fallen, plan, startsAt: period.startsAt, endsAt: period.endsAt, until: one.week === current.key ? next.endsAt : current.endsAt };
    })
    .filter(Boolean);
}

// The words of the card (all but the answers' errors), with the rules'
// numbers filled in: the attacks of a day and the days of a boss.
function cardTexts() {
  const words = Object.fromEntries(Object.entries(rules().texts).filter(([key]) => key !== 'errors'));
  const numbers = { attacks: rules().attacksPerDay, days: rules().cycle.days };
  return { ...words, lead: filled(words.lead, numbers), rules: words.rules.map((line) => filled(line, numbers)) };
}

// The title of a fallen boss the character wears now (its newest), for its
// card, its profile and the Ranking, or null.
export async function worldBossTitleOf(db, row, now) {
  const found = await db
    .prepare(
      `SELECT b.boss, t.place, t.until FROM world_boss_titles t JOIN world_bosses b ON b.id = t.boss_id
       WHERE t.character_id = ? AND t.until > ? AND t.created_at >= ? ORDER BY t.until DESC LIMIT 1`,
    )
    .bind(row.id, now, row.created_at)
    .first();
  const boss = found && content().worldBossesById[found.boss];
  return boss ? { text: worldBossTitle(boss, row.appearance), place: found.place, until: found.until } : null;
}

// The SQL of a character's World Boss title for a list of characters (the
// Ranking): the id of the boss whose title the character `c` wears at the
// bound moment, or NULL. Its text by worldBossTitleText.
export const worldBossTitleSql = `(SELECT b.boss FROM world_boss_titles t JOIN world_bosses b ON b.id = t.boss_id
  WHERE t.character_id = c.id AND t.until > ? AND t.created_at >= c.created_at ORDER BY t.until DESC LIMIT 1)`;

// The title of a boss (by its id) for a character of `appearance`, or null.
export const worldBossTitleText = (bossId, appearance) => {
  const boss = bossId ? content().worldBossesById[bossId] : null;
  return boss ? worldBossTitle(boss, appearance) : null;
};

// The World Boss for the card: the boss the character fights in this
// period (its name, words, land and band, the level it fights the
// character at, its HP, who felled it, and its period's first and last
// midnight, the next boss's coming), the attacks left today, with the
// words of why it may not attack at all while it is a mercenary
// (`attacks.blocked`); the best of the boss by damage (title.places of
// them; a character removed since is left out, its damage stays off the
// bar) and the character's own damage, place and chest now with the next
// one; the chests it may open, the title it wears and the card's words.
export async function worldBossView(db, row, now, activity = null) {
  const { current } = periodsAround(now);
  const day = questPeriod('daily', now, content()).key;
  const { fighter, boss, band } = await standingOf(db, row, now);
  const definition = content().worldBossesById[boss.boss];
  const places = rules().title.places;
  const damage = fighter?.damage ?? 0;
  const [top, counted, place, felled] = await db.batch([
    db
      .prepare(
        `SELECT f.character_id, f.damage, f.hits, c.name, c.class_id FROM world_boss_fighters f
         JOIN characters c ON c.id = f.character_id AND c.created_at <= f.created_at
         WHERE f.boss_id = ? ORDER BY f.damage DESC, f.created_at, f.character_id LIMIT ?`,
      )
      .bind(boss.id, places),
    db.prepare('SELECT COUNT(*) AS count FROM world_boss_fighters WHERE boss_id = ?').bind(boss.id),
    db
      .prepare(
        `SELECT COUNT(*) + 1 AS place FROM world_boss_fighters
         WHERE boss_id = ? AND (damage > ? OR (damage = ? AND (created_at < ? OR (created_at = ? AND character_id < ?))))`,
      )
      .bind(boss.id, damage, damage, fighter?.created_at ?? 0, fighter?.created_at ?? 0, row.id),
    db.prepare('SELECT name FROM characters WHERE id = ? AND created_at <= ?').bind(boss.fallen_by ?? 0, boss.fallen_at ?? 0),
  ]);
  const part = worldBossPart({ maxHp: boss.max_hp, players: boss.players });
  const sizes = worldBossThresholds(part, content());
  const plan = fighter && worldBossChestPlan({ level: levelIn(band, row), damage, part, fallen: boss.hp <= 0 }, content());
  const next = fighter ? sizes.find((size) => size.damage > damage) : null;
  const used = fighter && fighter.day === day ? fighter.day_hits : 0;
  const land = content().regionsById[band.region];
  return {
    boss: {
      week: boss.week,
      id: definition.id,
      name: definition.name,
      description: definition.description,
      female: Boolean(definition.female),
      region: band.region,
      land: land.name,
      band: { min: band.minLevel, max: band.maxLevel, last: band.last },
      level: levelIn(band, row),
      hp: boss.hp,
      maxHp: boss.max_hp,
      players: boss.players,
      fallen: boss.hp <= 0,
      fallenAt: boss.fallen_at,
      fallenBy: felled.results[0]?.name ?? null,
      startsAt: current.startsAt,
      endsAt: current.endsAt,
      // Its picture (src/client/art.js: its own once drawn, else the
      // creature's in its place) and its cry (sounds.json, voices.<sound>.cry).
      art: definition.art,
      sprite: definition.sprite,
      sound: definition.sound,
    },
    attacks: { left: Math.max(0, rules().attacksPerDay - used), perDay: rules().attacksPerDay, blocked: attackBlocked(activity, rules().texts.mercenary) },
    top: top.results.map((one, index) => ({ place: index + 1, name: one.name, classId: one.class_id, damage: one.damage, hits: one.hits, own: one.character_id === row.id })),
    fighters: counted.results[0].count,
    own: fighter
      ? {
          damage,
          hits: fighter.hits,
          place: place.results[0].place,
          size: plan.tier.id,
          next: next ? { id: next.id, damage: next.damage, missing: next.damage - damage } : null,
        }
      : null,
    chests: (await chestsOf(db, row, now)).map((chest) => ({
      week: chest.week,
      boss: content().worldBossesById[chest.boss]?.name ?? chest.boss,
      fallen: chest.fallen,
      size: chest.plan.tier.id,
      gold: chest.plan.gold,
      pieces: chest.plan.elite + chest.plan.champion,
      itemChance: chest.plan.itemChance,
      lastBlow: chest.plan.lastBlowItem ? { gold: chest.plan.lastBlowGold } : null,
      title: chest.place && chest.title_until > now ? { text: worldBossTitle(content().worldBossesById[chest.boss], row.appearance), place: chest.place, until: chest.title_until } : null,
      startsAt: chest.startsAt,
      endsAt: chest.endsAt,
      until: chest.until,
    })),
    title: await worldBossTitleOf(db, row, now),
    texts: cardTexts(),
  };
}

// GET /api/world-boss
export async function getWorldBoss(context) {
  const { player } = await requireBossPlayer(context);
  return json(await worldBossView(context.env.DB, player.row, context.now, player.activity));
}

// POST /api/world-boss/attack: one fight of the character and its
// companions who would go on an exploration (companionsGoing) with the
// boss it fights in this period, at its level in the band. Saved only
// while the character is as read, the boss still stands, the character's
// period is with this boss (its first attack writes it down) and it has an
// attack left today: its damage, never more than the HP left, added to its
// period, and the HP it takes off the bar, with who felled the boss and
// when, and the titles of the best when this hit felled it, worn to the
// end of the next period (the author, 24.11.2026: the title holds while
// the next boss is fought). Answers with the damage,
// the HP left, whether this hit felled the boss, the fight's lines, its
// playback for the arena and the World Boss anew.
export async function attackWorldBoss(context) {
  const { player } = await requireBossPlayer(context);
  const { row } = player;
  const db = context.env.DB;
  const now = context.now;
  // A character offering itself as a mercenary, or serving, does not fight
  // the boss (DECISIONS.md, "Najemnicy w Karczmie", 2), as the Bestia.
  if (player.activity?.kind === 'mercenary') requireNotExploring(player, now);
  const { current, next } = periodsAround(now);
  const day = questPeriod('daily', now, content()).key;
  const { fighter, boss, band } = await standingOf(db, row, now);
  if (boss.hp <= 0) throw new ApiError(409, 'fallen', errors().fallen);
  const perDay = rules().attacksPerDay;
  if (fighter && fighter.day === day && fighter.day_hits >= perDay) throw new ApiError(409, 'no_attacks', errors().noAttacks);
  const seed = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const fight = worldBossFight(
    {
      character: engineCharacter(row),
      equipped: equippedItems(player),
      name: row.name,
      companions: companionsGoing(player, now),
      boss: { id: boss.boss, region: boss.region, level: levelIn(band, row), hp: boss.hp, maxHp: boss.max_hp },
      seed,
    },
    content(),
  );
  const { places } = rules().title;
  const [, , , , , before, , , after] = await atomically(
    db,
    [
      sameVersion(db, row),
      assertion(db, '(SELECT hp FROM world_bosses WHERE id = ?) > 0', [boss.id]),
      // The character's period with this boss, from its first attack.
      db.prepare('INSERT OR IGNORE INTO world_boss_fighters (week, character_id, boss_id, day, created_at) VALUES (?, ?, ?, ?, ?)').bind(current.key, row.id, boss.id, day, now),
      assertion(db, '(SELECT boss_id FROM world_boss_fighters WHERE week = ? AND character_id = ?) = ?', [current.key, row.id, boss.id]),
      assertion(db, '(SELECT CASE WHEN day = ? THEN day_hits ELSE 0 END FROM world_boss_fighters WHERE week = ? AND character_id = ?) < ?', [day, current.key, row.id, perDay]),
      db.prepare('SELECT hp FROM world_bosses WHERE id = ?').bind(boss.id),
      // The hit reads the HP before the bar goes down below.
      db
        .prepare(
          `UPDATE world_boss_fighters SET damage = damage + MIN(?, (SELECT hp FROM world_bosses WHERE id = ?)), hits = hits + 1,
             day_hits = CASE WHEN day = ? THEN day_hits + 1 ELSE 1 END, day = ?
           WHERE week = ? AND character_id = ?`,
        )
        .bind(fight.damage, boss.id, day, day, current.key, row.id),
      db
        .prepare(
          `UPDATE world_bosses SET hp = MAX(0, hp - ?), fallen_at = CASE WHEN hp <= ? THEN ? ELSE fallen_at END, fallen_by = CASE WHEN hp <= ? THEN ? ELSE fallen_by END
           WHERE id = ? AND hp > 0`,
        )
        .bind(fight.damage, fight.damage, now, fight.damage, row.id, boss.id),
      db.prepare('SELECT hp FROM world_bosses WHERE id = ?').bind(boss.id),
      // The titles of the best, when this hit felled the boss.
      db
        .prepare(
          `INSERT OR IGNORE INTO world_boss_titles (boss_id, character_id, place, until, created_at)
           SELECT boss_id, character_id, ROW_NUMBER() OVER (ORDER BY damage DESC, created_at, character_id), ?, ?
           FROM world_boss_fighters
           WHERE boss_id = ? AND EXISTS (SELECT 1 FROM world_bosses WHERE id = ? AND hp <= 0 AND fallen_by = ? AND fallen_at = ?)
           ORDER BY damage DESC, created_at, character_id LIMIT ?`,
        )
        .bind(next.endsAt, now, boss.id, boss.id, row.id, now, places),
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
    ...(await worldBossView(db, row, now, player.activity)),
  });
}

// POST /api/world-boss/claim { week }: the Skrzynia Bossa of a period (its
// key), once (chestsOf). Its items need places in the bag; the gold and
// the materials take none. The batch holds only while the character is as
// read and the chest is not opened, and the items come only with the chest
// written down by it. The same period's chest holds the same, whenever it
// is opened.
export async function claimWorldBossChest(context) {
  const { session, player } = await requireBossPlayer(context);
  const { row } = player;
  const db = context.env.DB;
  const now = context.now;
  const body = await readJson(context.request);
  const week = typeof body.week === 'string' ? body.week : '';
  const chest = (await chestsOf(db, row, now)).find((one) => one.week === week);
  if (!chest) {
    const opened = await db.prepare('SELECT 1 FROM world_boss_fighters WHERE week = ? AND character_id = ? AND created_at >= ? AND claimed_at IS NOT NULL').bind(week, row.id, row.created_at).first();
    throw opened ? new ApiError(409, 'claimed', errors().claimed) : new ApiError(404, 'no_chest', errors().noChest);
  }
  const contents = worldBossChest(
    {
      region: chest.region,
      level: levelIn(chest.band, row),
      classId: gearKey(row.class_id, row.evolution, content()),
      classLevel: row.class_level,
      wornSlots: equippedItems(player).map((worn) => worn.slot),
      damage: chest.damage,
      part: worldBossPart({ maxHp: chest.max_hp, players: chest.players }),
      fallen: chest.fallen,
      lastBlow: chest.fallen_by === row.id,
      seed: `${row.id}:world-boss:${week}`,
    },
    content(),
  );
  if (contents.items.length > 0 && bagPlaces(player) + contents.items.length > bagCapacity(campLevels(player.buildings, now, content()), content())) {
    throw new ApiError(409, 'bag_full', errors().bagFull);
  }
  const found = Object.entries(contents.materials);
  const setMaterials = found.length > 0 ? `materials = json_set(materials, ${found.map(() => '?, COALESCE(json_extract(materials, ?), 0) + ?').join(', ')}), ` : '';
  await atomically(
    db,
    [
      sameVersion(db, row),
      assertion(db, '(SELECT claimed_at IS NULL FROM world_boss_fighters WHERE week = ? AND character_id = ?)', [week, row.id]),
      db.prepare('UPDATE world_boss_fighters SET claimed_at = ? WHERE week = ? AND character_id = ?').bind(now, week, row.id),
      db
        .prepare(`UPDATE characters SET gold = gold + ?, ${setMaterials}version = version + 1 WHERE id = ? AND version = ?`)
        .bind(contents.gold, ...found.flatMap(([key, count]) => [path(key), path(key), count]), row.id, row.version),
      ...contents.items.map((item) =>
        db
          .prepare('INSERT INTO items (character_id, slot, data, created_at) SELECT ?, NULL, ?, ? WHERE EXISTS (SELECT 1 FROM characters WHERE id = ? AND version = ?)')
          .bind(row.id, JSON.stringify(item), now, row.id, row.version + 1),
      ),
    ],
    () => new ApiError(409, 'raced', errors().raced),
  );
  const after = await loadPlayer(db, session.userId);
  // The items came last, so their ids are the character's highest: the
  // page finds them in the bag by them, for their cards.
  const ids = after.items.map((one) => one.id).sort((a, b) => a - b).slice(-contents.items.length);
  const words = [
    filled(rules().texts.gold, { gold: contents.gold }),
    ...contents.items.map((item) => itemName(item, content())),
    found.length > 0 && materialsText(contents.materials, content()),
  ].filter(Boolean);
  return json({
    chest: {
      week,
      gold: contents.gold,
      items: contents.items.map((item, index) => ({ id: ids[index], name: itemName(item, content()), rarity: item.rarity, color: content().raritiesById[item.rarity].color })),
      materials: found.map(([key, count]) => {
        const view = materialView(key, count, content());
        return { key, materialId: view.materialId, name: view.name, label: view.label, color: view.color, rarityName: view.rarityName, count };
      }),
      text: filled(rules().texts.opened, { contents: words.join(', ') }),
    },
    character: characterView(after, now),
    ...(await worldBossView(db, after.row, now, after.activity)),
  });
}

// The player's character: creation, the full view the page draws, and free
// stat points.

import {
  autoDistribute,
  classXpToNext,
  combatValues,
  computeStats,
  freePoints,
  hoursToNext,
  huntDurations,
  itemView,
  playerCombatant,
  regenPerMinute,
  restedHp,
  spentPoints,
  statEffects,
  unlockedFeatures,
  xpToNext,
} from '../engine/index.js';
import { content } from './content.js';
import { ApiError, json, readJson } from './http.js';
import { requireSession } from './sessions.js';

const NAME_PATTERN = /^\p{L}[\p{L}' -]{0,18}\p{L}$/u;

export function validateName(value) {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!NAME_PATTERN.test(name)) {
    throw new ApiError(400, 'invalid_name', 'Imię postaci musi mieć od 2 do 20 liter. Może zawierać spacje, myślniki i apostrofy.');
  }
  return name;
}

export async function loadPlayer(db, userId) {
  const row = await db.prepare("SELECT * FROM characters WHERE user_id = ? AND role = 'player'").bind(userId).first();
  if (!row) return null;
  const [items, activities] = await db.batch([
    db.prepare('SELECT id, slot, data FROM items WHERE character_id = ? ORDER BY id').bind(row.id),
    db.prepare('SELECT * FROM activities WHERE character_id = ?').bind(row.id),
  ]);
  return {
    row,
    // equippedSlot is where the item is worn (null in the bag); item.slot is where it can go.
    items: items.results.map((item) => ({ id: item.id, equippedSlot: item.slot, ...JSON.parse(item.data) })),
    activity: activities.results[0] ?? null,
  };
}

export async function requirePlayer(context) {
  const session = await requireSession(context);
  const player = await loadPlayer(context.env.DB, session.userId);
  if (!player) throw new ApiError(404, 'no_character', 'Nie masz jeszcze postaci.');
  return { session, player };
}

// For changes that need the character at home.
export async function requireIdlePlayer(context) {
  const found = await requirePlayer(context);
  const activity = found.player.activity;
  if (activity) {
    throw activity.ends_at <= context.now
      ? new ApiError(409, 'claim_first', 'Wyprawa się skończyła. Najpierw odbierz raport.')
      : new ApiError(409, 'busy', 'Postać jest na wyprawie. Poczekaj na jej koniec.');
  }
  return found;
}

export function engineCharacter(row) {
  return {
    classId: row.class_id,
    level: row.level,
    xp: row.xp,
    classLevel: row.class_level,
    classXp: row.class_xp,
    points: JSON.parse(row.points),
    position: row.position,
  };
}

export const equippedItems = (player) => player.items.filter((item) => item.equippedSlot);

// HP now: frozen at the start of an activity, otherwise rested since hp_at.
export function currentHp(player, now) {
  const character = engineCharacter(player.row);
  const { totals } = computeStats(character, equippedItems(player), content);
  const combatant = playerCombatant({ character, equipped: equippedItems(player), name: player.row.name }, content);
  const hp = player.activity
    ? player.activity.hp_at_start
    : restedHp({ hp: player.row.hp, since: player.row.hp_at, now, maxHp: combatant.maxHp, vitality: totals.vitality }, content);
  return { hp: Math.min(hp, combatant.maxHp), maxHp: combatant.maxHp, vitality: totals.vitality, combatant };
}

export function characterView(player, now) {
  const { row, items, activity } = player;
  const character = engineCharacter(row);
  const equipped = equippedItems(player);
  const { totals, sources } = computeStats(character, equipped, content);
  const { hp, maxHp, combatant } = currentHp(player, now);
  const values = combatValues(character, equipped, content);
  const perPoint = statEffects(character, equipped, content);
  const toItem = (item) => ({ id: item.id, ...itemView(item, content) });
  const weapon = combatant.weapon;

  return {
    name: row.name,
    classId: row.class_id,
    className: content.classesById[row.class_id].name,
    level: row.level,
    xp: row.xp,
    xpToNext: xpToNext(row.level, content),
    hoursToNext: Math.round(hoursToNext(row.level, row.xp, content) * 100) / 100,
    classLevel: row.class_level,
    classXp: row.class_xp,
    classXpToNext: classXpToNext(row.class_level, content),
    gold: row.gold,
    position: row.position,
    hp,
    maxHp,
    // While resting, the page counts HP up the same way the server does.
    regen: activity ? null : { hp: row.hp, since: row.hp_at, perMinute: regenPerMinute(maxHp, totals.vitality, content) },
    mana: values.mana,
    maxMana: values.mana,
    features: unlockedFeatures(row.level, content),
    huntDurations: huntDurations(row.level, content),
    freePoints: freePoints(character, content),
    canResetPoints: row.level <= content.balance.progression.freeResetMaxLevel && spentPoints(character) > 0,
    stats: content.stats.map((stat) => ({
      id: stat.id,
      name: stat.name,
      effect: stat.combat,
      total: totals[stat.id],
      sources: sources[stat.id],
      perPoint: perPoint[stat.id],
    })),
    combat: {
      damage: `${values.damageMin}–${values.damageMax}`,
      damageKind: weapon.category === 'physical' ? 'fizyczne' : `magiczne, ${content.elementsById[weapon.element].name}`,
      reduction: Math.round(values.reduction * 100),
      maxHp,
    },
    equipment: Object.fromEntries(
      content.slots.map((slot) => {
        const item = equipped.find((candidate) => candidate.equippedSlot === slot.id);
        return [slot.id, item ? toItem(item) : null];
      }),
    ),
    bag: items.filter((item) => !item.equippedSlot).reverse().map(toItem),
    activity: activity && {
      kind: activity.kind,
      regionId: activity.region_id,
      regionName: content.regionsById[activity.region_id].name,
      minutes: activity.minutes,
      startedAt: activity.started_at,
      endsAt: activity.ends_at,
      finished: activity.ends_at <= now,
    },
    serverTime: now,
  };
}

export async function getCharacter(context) {
  const { player } = await requirePlayer(context);
  return json({ character: characterView(player, context.now) });
}

// A new character starts with nothing: its first gear comes from the hunts.
export async function createCharacter(context) {
  const session = await requireSession(context);
  const body = await readJson(context.request);
  const name = validateName(body.name);
  const cls = typeof body.classId === 'string' ? content.classesById[body.classId] : undefined;
  if (!cls) throw new ApiError(400, 'invalid_class', 'Wybierz klasę postaci.');

  const db = context.env.DB;
  const exists = () => new ApiError(409, 'character_exists', 'Masz już postać.');
  if (await loadPlayer(db, session.userId)) throw exists();

  const character = { classId: cls.id, level: 1, classLevel: 1, points: {}, position: cls.position };
  const hp = playerCombatant({ character, equipped: [], name }, content).maxHp;
  const now = context.now;
  try {
    await db
      .prepare(
        "INSERT INTO characters (user_id, role, name, class_id, position, hp, hp_at, created_at) VALUES (?, 'player', ?, ?, ?, ?, ?, ?)",
      )
      .bind(session.userId, name, cls.id, cls.position, hp, now, now)
      .run();
  } catch (error) {
    if (String(error?.message).includes('UNIQUE')) throw exists();
    throw error;
  }
  return json({ character: characterView(await loadPlayer(db, session.userId), now) }, 201);
}

// "Zacznij od nowa": the character, its items, hunt and reports are removed;
// the account stays and a new character can be created.
export async function deleteCharacter(context) {
  const { player } = await requirePlayer(context);
  const db = context.env.DB;
  const id = player.row.id;
  await db.batch([
    db.prepare('DELETE FROM reports WHERE character_id = ?').bind(id),
    db.prepare('DELETE FROM activities WHERE character_id = ?').bind(id),
    db.prepare('DELETE FROM items WHERE character_id = ?').bind(id),
    db.prepare('DELETE FROM characters WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}

async function savePoints(context, player, points) {
  const result = await context.env.DB.prepare(
    'UPDATE characters SET points = ?, version = version + 1 WHERE id = ? AND version = ?',
  )
    .bind(JSON.stringify(points), player.row.id, player.row.version)
    .run();
  if (result.meta.changes !== 1) {
    throw new ApiError(409, 'conflict', 'Postać zmieniła się w międzyczasie. Spróbuj ponownie.');
  }
  const updated = { ...player, row: { ...player.row, points: JSON.stringify(points), version: player.row.version + 1 } };
  return json({ character: characterView(updated, context.now) });
}

export async function spendPoints(context) {
  const { player } = await requireIdlePlayer(context);
  const body = await readJson(context.request);
  const added = body.points;
  const invalid = new ApiError(400, 'invalid_points', 'Nieprawidłowy podział punktów.');
  if (added === null || typeof added !== 'object' || Array.isArray(added)) throw invalid;

  const character = engineCharacter(player.row);
  const points = { ...character.points };
  let total = 0;
  for (const [stat, value] of Object.entries(added)) {
    if (!content.statsById[stat] || !Number.isInteger(value) || value < 0) throw invalid;
    if (value > 0) points[stat] = (points[stat] ?? 0) + value;
    total += value;
  }
  if (total === 0) throw invalid;
  if (total > freePoints(character, content)) {
    throw new ApiError(400, 'not_enough_points', 'Nie masz tylu wolnych punktów.');
  }
  return savePoints(context, player, points);
}

export async function autoPoints(context) {
  const { player } = await requireIdlePlayer(context);
  const character = engineCharacter(player.row);
  if (freePoints(character, content) === 0) {
    throw new ApiError(400, 'no_free_points', 'Nie masz wolnych punktów.');
  }
  return savePoints(context, player, autoDistribute(character, content));
}

export async function resetPoints(context) {
  const { player } = await requireIdlePlayer(context);
  if (player.row.level > content.balance.progression.freeResetMaxLevel) {
    throw new ApiError(
      403,
      'reset_locked',
      `Darmowe zerowanie punktów jest dostępne do poziomu ${content.balance.progression.freeResetMaxLevel}.`,
    );
  }
  return savePoints(context, player, {});
}

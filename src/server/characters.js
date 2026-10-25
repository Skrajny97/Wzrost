// The player's character: creation, the full view the page draws, and free
// stat points.

import {
  areaFor,
  autoDistribute,
  bagCapacity,
  campBonus,
  campLevels,
  classXpToNext,
  combatValues,
  computeStats,
  construction,
  craftLevelFor,
  craftMinutes,
  craftTable,
  craftTakes,
  effectText,
  freePoints,
  gainedTimePoints,
  hoursToNext,
  huntDurations,
  itemView,
  materialView,
  nextHuntUnlock,
  playerCombatant,
  production,
  regenPerMinute,
  restBonus,
  restedHp,
  salvageYield,
  settleCrafting,
  spentPoints,
  statEffects,
  unlockedFeatures,
  upgradeCost,
  upgradeMinutes,
  xpToNext,
} from '../engine/index.js';
import { content } from './content.js';
import { ApiError, json, readJson } from './http.js';
import { requireSession } from './sessions.js';

// 2 to 20 characters: letters and digits, spaces, hyphens, apostrophes and
// underscores ("Justi_725"), from a letter to a letter or a digit. What a
// phone's keyboard adds unseen goes: invisible marks, letters split from
// their accents (joined again), a curly apostrophe (made straight). The
// message names what is wrong.
const NAME_CHARACTER = /[\p{L}\p{N}_' -]/u;
const ALLOWED_TEXT = 'Mogą być litery, cyfry, spacje, myślniki, apostrofy i podkreślniki.';

export function validateName(value) {
  const name =
    typeof value === 'string'
      ? value.normalize('NFC').replace(/\p{Cf}/gu, '').trim().replace(/\s+/g, ' ').replace(/[\u2018\u2019\u02bc]/g, "'")
      : '';
  const characters = [...name];
  const wrong = characters.find((character) => !NAME_CHARACTER.test(character));
  const problem =
    characters.length < 2 || characters.length > 20
      ? 'Imię postaci musi mieć od 2 do 20 znaków.'
      : wrong
        ? `Imię postaci nie może zawierać znaku „${wrong}”. ${ALLOWED_TEXT}`
        : !/^\p{L}/u.test(name)
          ? 'Imię postaci musi zaczynać się od litery.'
          : !/[\p{L}\p{N}]$/u.test(name)
            ? 'Imię postaci musi kończyć się literą albo cyfrą.'
            : null;
  if (problem) throw new ApiError(400, 'invalid_name', problem);
  return name;
}

// No two players share a name, whatever the letter case
// (migrations/0009_unique_names.sql).
const nameKey = (name) => name.toLowerCase();

export async function loadPlayer(db, userId) {
  const row = await db.prepare("SELECT * FROM characters WHERE user_id = ? AND role = 'player'").bind(userId).first();
  if (!row) return null;
  const [items, activities, buildings] = await db.batch([
    db.prepare('SELECT id, slot, data FROM items WHERE character_id = ? ORDER BY id').bind(row.id),
    db.prepare('SELECT * FROM activities WHERE character_id = ?').bind(row.id),
    db.prepare('SELECT building_id, level, started_at, ends_at, collected_at FROM buildings WHERE character_id = ?').bind(row.id),
  ]);
  return {
    row,
    // equippedSlot is where the item is worn (null in the bag); item.slot is where it can go.
    items: items.results.map((item) => ({ id: item.id, equippedSlot: item.slot, ...JSON.parse(item.data) })),
    activity: activities.results[0] ?? null,
    // { campfire: { level, startedAt, endsAt, collectedAt } }: see camp.js in the engine.
    buildings: Object.fromEntries(
      buildings.results.map((building) => [
        building.building_id,
        { level: building.level, startedAt: building.started_at, endsAt: building.ends_at, collectedAt: building.collected_at },
      ]),
    ),
  };
}

// Gold and resources together, as building costs name them.
export function walletOf(row) {
  const stored = JSON.parse(row.resources ?? '{}');
  return { gold: row.gold, ...Object.fromEntries(content.resources.map((resource) => [resource.id, stored[resource.id] ?? 0])) };
}

export async function requirePlayer(context) {
  const session = await requireSession(context);
  const player = await loadPlayer(context.env.DB, session.userId);
  if (!player) throw new ApiError(404, 'no_character', 'Nie masz jeszcze postaci.');
  await settleTimePoints(context.env.DB, player.row, context.now);
  return { session, player };
}

// The Punkty Czasu that came with time since time_points_at join the stored
// ones (gainedTimePoints), and `row` shows them. The version stays: a change
// sent at the same moment still saves, and the condition on time_points_at
// adds each point once.
async function settleTimePoints(db, row, now) {
  const { points, since } = gainedTimePoints(row.time_points_at, now, content);
  if (points === 0) return;
  const result = await db
    .prepare('UPDATE characters SET time_points = time_points + ?, time_points_at = ? WHERE id = ? AND time_points_at = ?')
    .bind(points, since, row.id, row.time_points_at)
    .run();
  if (result.meta.changes === 1) Object.assign(row, { time_points: row.time_points + points, time_points_at: since });
  else Object.assign(row, await db.prepare('SELECT time_points, time_points_at FROM characters WHERE id = ?').bind(row.id).first());
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
    appearance: row.appearance,
  };
}

export const equippedItems = (player) => player.items.filter((item) => item.equippedSlot);

// HP now: frozen at the start of an activity, otherwise rested since hp_at,
// faster with the camp's Ognisko.
export function currentHp(player, now) {
  const character = engineCharacter(player.row);
  const { totals } = computeStats(character, equippedItems(player), content);
  const combatant = playerCombatant({ character, equipped: equippedItems(player), name: player.row.name }, content);
  const rest = restBonus(player.buildings, player.row.hp_at, now, content);
  const hp = player.activity
    ? player.activity.hp_at_start
    : restedHp(
        { hp: player.row.hp, since: player.row.hp_at, now, maxHp: combatant.maxHp, vitality: totals.vitality, ...rest },
        content,
      );
  return { hp: Math.min(hp, combatant.maxHp), maxHp: combatant.maxHp, vitality: totals.vitality, combatant, rest };
}

// The camp as the page shows it: each building with its level and, below
// its highest level, what the next one gives, costs and takes.
function campView(player, levels, now) {
  const running = construction(player.buildings, now);
  return {
    construction: running && {
      buildingId: running.buildingId,
      name: content.buildingsById[running.buildingId].name,
      level: running.level,
      startedAt: running.startedAt,
      endsAt: running.endsAt,
    },
    buildings: content.buildings.map((building) => {
      const level = levels[building.id];
      const next = level < building.maxLevel ? level + 1 : null;
      const stored = player.buildings[building.id];
      // A production building's store, once the building stands: the page
      // counts it up from `since`.
      const store = level > 0 ? production(building, stored, now) : null;
      return {
        id: building.id,
        name: building.name,
        description: building.description,
        level,
        maxLevel: building.maxLevel,
        // The Stół rzemieślniczy: its screen shows the table (crafting).
        crafts: building.effect.kind === 'craftSpeed',
        effect: level > 0 ? effectText(building, level, content) : null,
        production: store && {
          resource: store.resource,
          perHour: store.perHour,
          capacity: store.capacity,
          amount: store.amount,
          since: store.since,
          paused: stored.endsAt > now,
        },
        next: next && {
          level: next,
          effect: effectText(building, next, content),
          minutes: upgradeMinutes(building, next),
          cost: upgradeCost(building, next),
        },
      };
    }),
  };
}

// What the character row keeps: materials, parts and the queue, as JSON.
export function craftingState(row) {
  return { materials: JSON.parse(row.materials ?? '{}'), parts: JSON.parse(row.parts ?? '{}'), queue: JSON.parse(row.crafting ?? '[]') };
}

const rarityIndex = (id) => content.rarities.findIndex((rarity) => rarity.id === id);

// The table as the page shows it, settled at `now`. `pace` 0: no table yet.
function craftingView(row, levels, now) {
  const table = craftTable(levels, content);
  const { pace } = table;
  const { materials, parts, queue } = settleCrafting(craftingState(row), now);
  return {
    pace,
    // The table's level, the highest rarity it takes and the chance of an
    // extra part for each part made.
    level: table.level,
    maxRarity: table.maxRarity < 0 ? null : content.rarities[table.maxRarity].id,
    bonusChance: table.bonusChance,
    limit: content.balance.crafting.queueLimit,
    materials: Object.entries(materials)
      .map(([key, count]) => {
        const view = materialView(key, count, content);
        // `needs`: the table's level that takes this rarity, when it is not built up to it yet.
        const takes = pace > 0 && craftTakes(table, view.rarity, content);
        return {
          ...view,
          minutes: takes ? craftMinutes(view.rarity, count, pace, content) : null,
          needs: pace > 0 && !takes ? craftLevelFor(view.rarity, content) : null,
        };
      })
      .sort((a, b) => rarityIndex(a.rarity) - rarityIndex(b.rarity) || a.name.localeCompare(b.name, 'pl')),
    parts: content.parts.map((part) => ({
      id: part.id,
      name: part.name,
      description: part.description,
      rarity: part.rarity,
      color: content.raritiesById[part.rarity].color,
      count: parts[part.id] ?? 0,
    })),
    queue: queue.map((order) => {
      const material = order.kind === 'material' ? materialView(order.key, order.count, content) : null;
      const rarity = material ? material.rarity : order.rarity;
      return {
        id: order.id,
        kind: order.kind,
        materialId: material?.materialId ?? null,
        name: material ? material.name : order.name,
        count: order.kind === 'material' ? order.count : 1,
        rarity,
        color: content.raritiesById[rarity].color,
        part: content.partsById[order.partId].name,
        parts: order.parts,
        // Extra parts from the table's later levels, told when the order ends.
        bonus: order.bonus ?? 0,
        startsAt: order.startsAt,
        endsAt: order.endsAt,
      };
    }),
  };
}

// Where an activity takes place. region_id holds the inner region, or a whole
// region for an activity started before inner regions.
function activityPlace(activity, level) {
  const area = areaFor(activity.region_id, level, content);
  return { areaId: area.id, areaName: area.name, regionId: area.regionId, regionName: area.regionName };
}

export function characterView(player, now) {
  const { row, items, activity } = player;
  const character = engineCharacter(row);
  const equipped = equippedItems(player);
  const { totals, sources } = computeStats(character, equipped, content);
  const { hp, maxHp, combatant, rest } = currentHp(player, now);
  const values = combatValues(character, equipped, content);
  const perPoint = statEffects(character, equipped, content);
  const levels = campLevels(player.buildings, now, content);
  const sellBonus = campBonus(levels, 'sellPrice', content);
  // The Kowadło's level is the highest upgrade it allows.
  const upgradeCap = campBonus(levels, 'upgradeCap', content);
  // What the Stół rzemieślniczy makes of an item taken apart and how long it
  // takes, or the table's level its rarity needs.
  const table = craftTable(levels, content);
  const salvage = (item) => {
    const { partId, count } = salvageYield(item, content);
    const part = content.partsById[partId];
    const takes = table.pace > 0 && craftTakes(table, item.rarity, content);
    return {
      part: part.name,
      color: content.raritiesById[part.rarity].color,
      parts: count,
      minutes: takes ? craftMinutes(item.rarity, count, table.pace, content) : null,
      needs: table.pace > 0 && !takes ? craftLevelFor(item.rarity, content) : null,
    };
  };
  const toItem = (item) => ({ id: item.id, ...itemView(item, content, { sellBonus, upgradeCap }), salvage: salvage(item) });
  const { gold, ...resources } = walletOf(row);
  const weapon = combatant.weapon;

  return {
    name: row.name,
    classId: row.class_id,
    className: content.classesById[row.class_id].name,
    // The look: the portrait and the voice in fights.
    appearance: row.appearance,
    level: row.level,
    xp: row.xp,
    xpToNext: xpToNext(row.level, content),
    hoursToNext: Math.round(hoursToNext(row.level, row.xp, content) * 100) / 100,
    classLevel: row.class_level,
    classXp: row.class_xp,
    classXpToNext: classXpToNext(row.class_level, content),
    gold,
    systemPoints: row.system_points,
    // Punkty Czasu: 1 point skips 1 minute of a wait (time.js). One more
    // comes every `minutes` from `since`; the page counts them up the same way.
    timePoints: row.time_points,
    timePointsGain: { since: row.time_points_at, minutes: content.balance.timePoints.generateMinutes },
    resources,
    position: row.position,
    hp,
    maxHp,
    // While resting, the page counts HP up the same way the server does. A
    // camp upgrade that sped up resting since hp_at changes the pace at `at`.
    regen: activity
      ? null
      : {
          hp: row.hp,
          since: row.hp_at,
          perMinute: regenPerMinute(maxHp, totals.vitality, content, rest.bonus),
          change: rest.change && { at: rest.change.at, perMinute: regenPerMinute(maxHp, totals.vitality, content, rest.change.bonus) },
        },
    mana: values.mana,
    maxMana: values.mana,
    features: unlockedFeatures(row.level, content),
    huntDurations: huntDurations(row.level, content),
    // The next longer exploration and its level, for the hint under the slider.
    huntNext: nextHuntUnlock(row.level, content),
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
    bagCapacity: bagCapacity(levels, content),
    camp: campView(player, levels, now),
    // The Stół rzemieślniczy: materials, parts and the queue (crafting.js).
    crafting: craftingView(row, levels, now),
    // The creatures met in fights, by id: the others are shadows on the
    // lists of an inner region's dangers.
    met: JSON.parse(row.met ?? '[]'),
    // The narrator's cards seen so far, or null for a character made before
    // the introduction (tutorial.js).
    tutorial: row.tutorial === null ? null : JSON.parse(row.tutorial),
    activity: activity && {
      kind: activity.kind,
      ...activityPlace(activity, row.level),
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

// A new character starts without gear: its first comes from the hunts. The
// narrator gives it Time Points, and an abandoned camp some gold and wood
// (data/balance.json: timePoints.start, startingSupply).
export async function createCharacter(context) {
  const session = await requireSession(context);
  const body = await readJson(context.request);
  const name = validateName(body.name);
  const cls = typeof body.classId === 'string' ? content.classesById[body.classId] : undefined;
  if (!cls) throw new ApiError(400, 'invalid_class', 'Wybierz klasę postaci.');
  const appearance = validAppearance(body.appearance);

  const db = context.env.DB;
  const exists = () => new ApiError(409, 'character_exists', 'Masz już postać.');
  if (await loadPlayer(db, session.userId)) throw exists();

  const character = { classId: cls.id, level: 1, classLevel: 1, points: {}, position: cls.position };
  const hp = playerCombatant({ character, equipped: [], name }, content).maxHp;
  const now = context.now;
  const supply = content.balance.startingSupply;
  try {
    await db
      .prepare(
        `INSERT INTO characters (user_id, role, name, name_key, class_id, appearance, position, hp, hp_at, created_at, gold, resources, time_points, time_points_at, tutorial)
         VALUES (?, 'player', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]')`,
      )
      .bind(
        session.userId, name, nameKey(name), cls.id, appearance, cls.position, hp, now, now,
        supply.gold, JSON.stringify(supply.resources), content.balance.timePoints.start, now,
      )
      .run();
  } catch (error) {
    const message = String(error?.message);
    if (message.includes('name_key')) throw new ApiError(409, 'name_taken', 'To imię nosi już inna postać w grze. Wybierz inne.');
    if (message.includes('UNIQUE')) throw exists();
    throw error;
  }
  return json({ character: characterView(await loadPlayer(db, session.userId), now) }, 201);
}

const validAppearance = (id) => {
  if (typeof id !== 'string' || !content.appearancesById[id]) throw new ApiError(400, 'invalid_appearance', 'Wybierz wygląd postaci.');
  return id;
};

// The look can change at any time, also during an exploration: it changes
// nothing but the portrait and the voice.
export async function setAppearance(context) {
  const { player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const appearance = validAppearance(body.appearance);
  await context.env.DB.prepare('UPDATE characters SET appearance = ?, version = version + 1 WHERE id = ?').bind(appearance, player.row.id).run();
  const updated = { ...player, row: { ...player.row, appearance, version: player.row.version + 1 } };
  return json({ character: characterView(updated, context.now) });
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
    db.prepare('DELETE FROM buildings WHERE character_id = ?').bind(id),
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

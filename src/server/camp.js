// The camp: buildings the player upgrades alongside the character's activity,
// even during an exploration, paid in gold and resources. One building is
// upgraded at a time and the upgrade counts once its time has passed.

import { buildingLevel, construction, missingFor, upgradeCost, upgradeMinutes } from '../engine/index.js';
import { content } from './content.js';
import { characterView, currentHp, loadPlayer, requirePlayer, walletOf } from './characters.js';
import { ApiError, json, readJson } from './http.js';

// A JSON path for a resource id with a hyphen ("iron-ore").
const path = (id) => `$."${id}"`;

export async function startBuilding(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const building = typeof body.buildingId === 'string' ? content.buildingsById[body.buildingId] : undefined;
  if (!building) throw new ApiError(400, 'invalid_building', 'Nie ma takiego budynku.');
  const now = context.now;
  if (construction(player.buildings, now)) throw new ApiError(409, 'camp_busy', 'W obozie trwa już budowa.');
  const level = buildingLevel(player.buildings[building.id], now);
  if (level >= building.maxLevel) throw new ApiError(409, 'max_level', 'Ten budynek ma już najwyższy poziom.');
  const target = level + 1;
  const cost = upgradeCost(building, target);
  if (missingFor(cost, walletOf(player.row)).length > 0) {
    throw new ApiError(409, 'not_enough', 'Brakuje złota albo zasobów na tę budowę.');
  }

  const row = player.row;
  const gold = cost.gold ?? 0;
  const resources = Object.keys(cost).filter((id) => id !== 'gold');
  const endsAt = now + upgradeMinutes(building, target) * 60000;
  const db = context.env.DB;
  // The upgrade starts only if nothing is being built, the building still has
  // the level seen here and the cost is still there; the payment only if the
  // upgrade started. So two taps at once start and pay one upgrade.
  const start = db
    .prepare(
      `INSERT INTO buildings (character_id, building_id, level, started_at, ends_at)
       SELECT ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM buildings WHERE character_id = ? AND ends_at > ?)
         AND COALESCE((SELECT level FROM buildings WHERE character_id = ? AND building_id = ?), 0) = ?
         AND (SELECT gold FROM characters WHERE id = ?) >= ?
         ${resources.map(() => 'AND COALESCE(json_extract((SELECT resources FROM characters WHERE id = ?), ?), 0) >= ?').join(' ')}
       ON CONFLICT (character_id, building_id) DO UPDATE
         SET level = excluded.level, started_at = excluded.started_at, ends_at = excluded.ends_at`,
    )
    .bind(
      row.id, building.id, target, now, endsAt,
      row.id, now,
      row.id, building.id, level,
      row.id, gold,
      ...resources.flatMap((id) => [row.id, path(id), cost[id]]),
    );
  const setResources = resources.length
    ? `, resources = json_set(resources, ${resources.map(() => '?, COALESCE(json_extract(resources, ?), 0) - ?').join(', ')})`
    : '';
  // While resting, the HP rested so far is saved: a faster rest from an
  // upgraded Ognisko counts from the end of the upgrade on.
  const resting = !player.activity;
  const pay = db
    .prepare(
      `UPDATE characters SET gold = gold - ?${setResources}${resting ? ', hp = ?, hp_at = ?' : ''}, version = version + 1
       WHERE id = ? AND EXISTS (
         SELECT 1 FROM buildings WHERE character_id = ? AND building_id = ? AND level = ? AND started_at = ?
       )`,
    )
    .bind(
      gold,
      ...resources.flatMap((id) => [path(id), path(id), cost[id]]),
      ...(resting ? [currentHp(player, now).hp, now] : []),
      row.id, row.id, building.id, target, now,
    );
  const [started] = await db.batch([start, pay]);
  if (started.meta.changes !== 1) {
    throw new ApiError(409, 'conflict', 'Obóz zmienił się w międzyczasie. Spróbuj ponownie.');
  }
  return json({ character: characterView(await loadPlayer(db, session.userId), now) }, 201);
}

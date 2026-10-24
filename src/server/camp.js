// The camp: buildings the player upgrades alongside the character's activity,
// even during an exploration, paid in gold and resources. One building is
// upgraded at a time and the upgrade counts once its time has passed.
// Production buildings fill a store that the player collects.

import { buildingLevel, collect, construction, missingFor, upgradeCost, upgradeMinutes } from '../engine/index.js';
import { content } from './content.js';
import { characterView, currentHp, loadPlayer, requirePlayer, walletOf } from './characters.js';
import { ApiError, json, readJson } from './http.js';

// A JSON path for a resource id with a hyphen ("iron-ore").
const path = (id) => `$."${id}"`;

export async function startBuilding(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  await beginBuilding(context.env.DB, player, body.buildingId, context.now);
  return json({ character: characterView(await loadPlayer(context.env.DB, session.userId), context.now) }, 201);
}

// The next level of a building, from now on, paid at once. The skipped
// introduction builds the Ognisko this way too (tutorial.js).
export async function beginBuilding(db, player, buildingId, now) {
  const building = typeof buildingId === 'string' ? content.buildingsById[buildingId] : undefined;
  if (!building) throw new ApiError(400, 'invalid_building', 'Nie ma takiego budynku.');
  if (construction(player.buildings, now)) throw new ApiError(409, 'camp_busy', 'W obozie trwa już budowa.');
  const level = buildingLevel(player.buildings[building.id], now);
  if (level >= building.maxLevel) throw new ApiError(409, 'max_level', 'Ten budynek ma już najwyższy poziom.');
  const target = level + 1;
  const cost = upgradeCost(building, target);
  if (missingFor(cost, walletOf(player.row)).length > 0) {
    throw new ApiError(409, 'not_enough', 'Brakuje złota albo zasobów na tę budowę.');
  }

  const row = player.row;
  const stored = player.buildings[building.id];
  const gold = cost.gold ?? 0;
  const resources = Object.keys(cost).filter((id) => id !== 'gold');
  const endsAt = now + upgradeMinutes(building, target) * 60000;
  // A production building stops during the upgrade: what its store holds goes
  // to the resources now, and it fills again from the end of the upgrade.
  const producing = building.effect.kind === 'production';
  const gathered = producing ? collect(building, stored, now) : null;
  const changes = Object.fromEntries(resources.map((id) => [id, -cost[id]]));
  if (gathered) changes[gathered.resource] = (changes[gathered.resource] ?? 0) + gathered.amount;
  // The upgrade starts only if nothing is being built, the building is as
  // seen here (level and store) and the cost is still there; the payment only
  // if the upgrade started. So two taps at once start and pay one upgrade.
  const start = db
    .prepare(
      `INSERT INTO buildings (character_id, building_id, level, started_at, ends_at, collected_at)
       SELECT ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM buildings WHERE character_id = ? AND ends_at > ?)
         AND COALESCE((SELECT level FROM buildings WHERE character_id = ? AND building_id = ?), 0) = ?
         AND COALESCE((SELECT COALESCE(collected_at, ends_at) FROM buildings WHERE character_id = ? AND building_id = ?), 0) = ?
         AND (SELECT gold FROM characters WHERE id = ?) >= ?
         ${resources.map(() => 'AND COALESCE(json_extract((SELECT resources FROM characters WHERE id = ?), ?), 0) >= ?').join(' ')}
       ON CONFLICT (character_id, building_id) DO UPDATE
         SET level = excluded.level, started_at = excluded.started_at, ends_at = excluded.ends_at, collected_at = excluded.collected_at`,
    )
    .bind(
      row.id, building.id, target, now, endsAt, producing ? endsAt : null,
      row.id, now,
      row.id, building.id, level,
      row.id, building.id, stored ? stored.collectedAt ?? stored.endsAt : 0,
      row.id, gold,
      ...resources.flatMap((id) => [row.id, path(id), cost[id]]),
    );
  const changed = Object.entries(changes);
  const setResources = changed.length
    ? `, resources = json_set(resources, ${changed.map(() => '?, COALESCE(json_extract(resources, ?), 0) + ?').join(', ')})`
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
      ...changed.flatMap(([id, amount]) => [path(id), path(id), amount]),
      ...(resting ? [currentHp(player, now).hp, now] : []),
      row.id, row.id, building.id, target, now,
    );
  const [started] = await db.batch([start, pay]);
  if (started.meta.changes !== 1) {
    throw new ApiError(409, 'conflict', 'Obóz zmienił się w międzyczasie. Spróbuj ponownie.');
  }
}

// The upgrade in progress is ready now: two seconds back, as the page counts
// a second after the end. A production building waiting for the end of the
// upgrade starts producing with it. For "Pomiń czas" in test mode and the
// skipped introduction.
export async function completeBuilding(db, player, now) {
  const running = construction(player.buildings, now);
  if (!running) return;
  const shift = Math.max(0, running.endsAt - (now - 2000));
  await db
    .prepare(
      `UPDATE buildings SET started_at = started_at - ?, ends_at = ends_at - ?,
         collected_at = CASE WHEN collected_at = ends_at THEN collected_at - ? ELSE collected_at END
       WHERE character_id = ? AND building_id = ?`,
    )
    .bind(shift, shift, shift, player.row.id, running.buildingId)
    .run();
}

// "Zbierz": what a production building's store holds goes to the resources,
// and the store fills again.
export async function collectProduction(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const building = typeof body.buildingId === 'string' ? content.buildingsById[body.buildingId] : undefined;
  if (!building || building.effect.kind !== 'production') {
    throw new ApiError(400, 'invalid_building', 'Ten budynek niczego nie wytwarza.');
  }
  const now = context.now;
  const stored = player.buildings[building.id];
  const gathered = collect(building, stored, now);
  if (!gathered) throw new ApiError(409, 'nothing_to_collect', 'Magazyn jest jeszcze pusty.');

  const row = player.row;
  const db = context.env.DB;
  // The resources come only if the store is still as seen here, and then the
  // store moves on. Two taps at once compute the same new store, so the check
  // is on the store before: the second tap finds it moved and gets nothing.
  const seen = stored.collectedAt ?? stored.endsAt;
  const [paid] = await db.batch([
    db
      .prepare(
        `UPDATE characters SET resources = json_set(resources, ?, COALESCE(json_extract(resources, ?), 0) + ?), version = version + 1
         WHERE id = ? AND EXISTS (
           SELECT 1 FROM buildings WHERE character_id = ? AND building_id = ? AND COALESCE(collected_at, ends_at) = ? AND ends_at <= ?
         )`,
      )
      .bind(path(gathered.resource), path(gathered.resource), gathered.amount, row.id, row.id, building.id, seen, now),
    db
      .prepare(
        `UPDATE buildings SET collected_at = ?
         WHERE character_id = ? AND building_id = ? AND COALESCE(collected_at, ends_at) = ? AND ends_at <= ?`,
      )
      .bind(gathered.collectedAt, row.id, building.id, seen, now),
  ]);
  if (paid.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Obóz zmienił się w międzyczasie. Spróbuj ponownie.');
  return json({
    collected: { resource: gathered.resource, amount: gathered.amount },
    character: characterView(await loadPlayer(db, session.userId), now),
  });
}

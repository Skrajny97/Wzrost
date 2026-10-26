// The camp: buildings the player upgrades alongside the character's activity,
// even during an exploration, paid in gold and resources. One building is
// upgraded at a time and the upgrade counts once its time has passed; a few
// more builds wait in the queue, paid when queued, and start one after
// another (characters.js: settleBuilds). Production buildings fill a store
// that the player collects, and the Ognisko's fire spirit trades gold for
// resources a few times a day.

import {
  buildMinutes,
  buildingLevel,
  buildsUnderWay,
  campLevel,
  cancelFromQueue,
  collect,
  construction,
  fireBuilding,
  fireDay,
  fireTrade,
  fireTradeBlock,
  fireTradesMade,
  missingFor,
  plannedLevel,
  queueEnd,
  replanQueue,
  shiftQueue,
  upgradeCost,
} from '../engine/index.js';
import { content } from './content.js';
import { buildQueue, characterView, currentHp, loadPlayer, requirePlayer, walletOf } from './characters.js';
import { ApiError, json, readJson } from './http.js';

// A JSON path for a resource id with a hyphen ("iron-ore").
const path = (id) => `$."${id}"`;

export async function startBuilding(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  await beginBuilding(context.env.DB, player, body.buildingId, context.now);
  return json({ character: characterView(await loadPlayer(context.env.DB, session.userId), context.now) }, 201);
}

const atTop = (building) => new ApiError(409, 'max_level', building.id === content.camp.id ? 'Obóz ma już najwyższy poziom.' : 'Ten budynek ma już najwyższy poziom.');
const shortOf = (building) =>
  new ApiError(409, 'not_enough', building.id === content.camp.id ? 'Brakuje złota na rozwój obozu.' : 'Brakuje złota albo zasobów na tę budowę.');

// The next level of a building, from now on, paid at once; while another
// build is under way, it goes to the queue. The skipped introduction builds
// the Ognisko this way too (tutorial.js). The camp's own level (buildingId
// "camp") grows the same way, from its first level, which it has without
// building.
export async function beginBuilding(db, player, buildingId, now) {
  const building = typeof buildingId === 'string' ? content.buildingsById[buildingId] : undefined;
  if (!building) throw new ApiError(400, 'invalid_building', 'Nie ma takiego budynku.');
  const queue = buildQueue(player.row);
  if (buildsUnderWay(player.buildings, queue, now) > 0) {
    await queueBuilding(db, player, building, queue, now);
    return;
  }
  const built = buildingLevel(player.buildings[building.id], now);
  const level = Math.max(building.startLevel ?? 0, built);
  if (level >= building.maxLevel) throw atTop(building);
  const target = level + 1;
  const cost = upgradeCost(building, target);
  if (missingFor(cost, walletOf(player.row)).length > 0) throw shortOf(building);

  const row = player.row;
  const stored = player.buildings[building.id];
  const gold = cost.gold ?? 0;
  const resources = Object.keys(cost).filter((id) => id !== 'gold');
  const endsAt = now + buildMinutes(building, target, campLevel(player.buildings, now, content), content) * 60000;
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
      row.id, building.id, built,
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

// A build while another is under way: the level after those under way and
// waiting, paid now, from the end of the last one, in the camp they leave
// behind. It is saved only if the character and the build under way are as
// seen here, so two taps at once queue and pay once.
async function queueBuilding(db, player, building, queue, now) {
  const { camp } = content;
  if (buildsUnderWay(player.buildings, queue, now) >= camp.queue) {
    throw new ApiError(409, 'queue_full', 'Kolejka budowy jest pełna.');
  }
  const level = plannedLevel(building, player.buildings, queue);
  if (level >= building.maxLevel) {
    if (buildingLevel(player.buildings[building.id], now) >= building.maxLevel) throw atTop(building);
    throw new ApiError(409, 'max_level', 'Najwyższy poziom jest już w kolejce.');
  }
  const target = level + 1;
  const cost = upgradeCost(building, target);
  if (missingFor(cost, walletOf(player.row)).length > 0) throw shortOf(building);
  const startsAt = queueEnd(player.buildings, queue, now);
  const minutes = buildMinutes(building, target, plannedLevel(camp, player.buildings, queue), content);
  // The cost paid is kept with the build: "Anuluj" gives back exactly that.
  const waiting = [...queue, { buildingId: building.id, level: target, startsAt, endsAt: startsAt + minutes * 60000, cost }];
  const row = player.row;
  const running = construction(player.buildings, now);
  const gold = cost.gold ?? 0;
  const resources = Object.keys(cost).filter((id) => id !== 'gold');
  const spend = resources.length
    ? `, resources = json_set(resources, ${resources.map(() => '?, COALESCE(json_extract(resources, ?), 0) - ?').join(', ')})`
    : '';
  const result = await db
    .prepare(
      `UPDATE characters SET gold = gold - ?${spend}, build_queue = ?, version = version + 1
       WHERE id = ? AND version = ? AND gold >= ?
         ${resources.map(() => 'AND COALESCE(json_extract(resources, ?), 0) >= ?').join(' ')}
         ${running ? 'AND EXISTS (SELECT 1 FROM buildings WHERE character_id = ? AND building_id = ? AND ends_at = ?)' : ''}`,
    )
    .bind(
      gold,
      ...resources.flatMap((id) => [path(id), path(id), cost[id]]),
      JSON.stringify(waiting),
      row.id, row.version, gold,
      ...resources.flatMap((id) => [path(id), cost[id]]),
      ...(running ? [row.id, running.buildingId, running.endsAt] : []),
    )
    .run();
  if (result.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Obóz zmienił się w międzyczasie. Spróbuj ponownie.');
}

// "Anuluj" by a waiting build: it leaves the queue with the higher levels of
// the same building after it, their whole cost comes back, and the rest of
// the queue comes sooner. Saved only if the character is as seen here.
export async function cancelBuilding(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const queue = buildQueue(player.row);
  const level = Number(body.level);
  if (!queue.some((entry) => entry.buildingId === body.buildingId && entry.level === level)) {
    throw new ApiError(409, 'not_queued', 'Tej budowy nie ma już w kolejce.');
  }
  const { cancelled, kept } = cancelFromQueue(queue, body.buildingId, level);
  const back = {};
  for (const entry of cancelled) {
    const building = content.buildingsById[entry.buildingId];
    const cost = entry.cost ?? (building ? upgradeCost(building, entry.level) : {});
    for (const [id, amount] of Object.entries(cost)) back[id] = (back[id] ?? 0) + amount;
  }
  const now = context.now;
  const row = player.row;
  const resources = Object.keys(back).filter((id) => id !== 'gold');
  const give = resources.length
    ? `, resources = json_set(resources, ${resources.map(() => '?, COALESCE(json_extract(resources, ?), 0) + ?').join(', ')})`
    : '';
  const result = await context.env.DB
    .prepare(`UPDATE characters SET gold = gold + ?${give}, build_queue = ?, version = version + 1 WHERE id = ? AND version = ?`)
    .bind(
      back.gold ?? 0,
      ...resources.flatMap((id) => [path(id), path(id), back[id]]),
      JSON.stringify(replanQueue(player.buildings, kept, now, content)),
      row.id,
      row.version,
    )
    .run();
  if (result.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Obóz zmienił się w międzyczasie. Spróbuj ponownie.');
  return json({
    cancelled: cancelled.map((entry) => ({ buildingId: entry.buildingId, level: entry.level })),
    refund: back,
    character: characterView(await loadPlayer(context.env.DB, session.userId), now),
  });
}

// The upgrade in progress is ready now: two seconds back, as the page counts
// a second after the end. A production building waiting for the end of the
// upgrade starts producing with it, and the waiting builds come as much
// sooner. For "Pomiń czas" in test mode and the skipped introduction.
export async function completeBuilding(db, player, now) {
  const running = construction(player.buildings, now);
  if (!running) return;
  const shift = Math.max(0, running.endsAt - (now - 2000));
  const queue = buildQueue(player.row);
  await db.batch([
    db
      .prepare(
        `UPDATE buildings SET started_at = started_at - ?, ends_at = ends_at - ?,
           collected_at = CASE WHEN collected_at = ends_at THEN collected_at - ? ELSE collected_at END
         WHERE character_id = ? AND building_id = ?`,
      )
      .bind(shift, shift, shift, player.row.id, running.buildingId),
    db
      .prepare('UPDATE characters SET build_queue = ? WHERE id = ? AND build_queue = ?')
      .bind(JSON.stringify(shiftQueue(queue, shift)), player.row.id, player.row.build_queue ?? '[]'),
  ]);
}

// "Wrzuć złoto": one trade with the fire spirit at the Ognisko's level now
// (an upgrade under way counts once it ends). Saved only if the character is
// as seen here, so two taps at once make one trade and the day's count holds.
export async function tradeAtFire(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const now = context.now;
  const row = player.row;
  const level = buildingLevel(player.buildings[fireBuilding(content)?.id], now);
  const made = fireTradesMade({ day: row.fire_day, count: row.fire_trades }, now, content);
  const block = fireTradeBlock({ level, gold: row.gold, made, resource: body.resource }, content);
  if (block) throw new ApiError(block.code === 'invalid_resource' ? 400 : 409, block.code, block.message);
  const { amount, gold } = fireTrade(level, content);
  const db = context.env.DB;
  const result = await db
    .prepare(
      `UPDATE characters SET gold = gold - ?, resources = json_set(resources, ?, COALESCE(json_extract(resources, ?), 0) + ?),
         fire_day = ?, fire_trades = ?, version = version + 1
       WHERE id = ? AND version = ? AND gold >= ?`,
    )
    .bind(gold, path(body.resource), path(body.resource), amount, fireDay(now, content), made + 1, row.id, row.version, gold)
    .run();
  if (result.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Obóz zmienił się w międzyczasie. Spróbuj ponownie.');
  return json({
    traded: { resource: body.resource, amount, gold },
    character: characterView(await loadPlayer(db, session.userId), now),
  });
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

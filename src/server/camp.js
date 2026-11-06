// The camp: buildings the player upgrades alongside the character's activity,
// even during an exploration, paid in gold and resources. One building is
// upgraded at a time and the upgrade counts once its time has passed; a few
// more builds wait in the queue, paid when queued, and start one after
// another (characters.js: settleBuilds). Production buildings fill a store
// that the player collects, the Ognisko's fire spirit trades gold for
// resources a few times a day, the scrap dealer at the Skup złomu sells
// crafting parts, at the Stół rozbiórki one resource goes for another, the
// Duch budowniczego at the Kamień węgielny buys resources for gold, and the
// Zbieracz Systemu, bought once by the Skrzynia Konta, collects the stores
// as they fill.

import {
  builderSpirit,
  buildMinutes,
  buildingLevel,
  buildingTop,
  buildsUnderWay,
  campLevel,
  cancelFromQueue,
  collect,
  construction,
  exchangeBlock,
  exchangeBuilding,
  fireBuilding,
  fireDay,
  fireTrade,
  fireTradeBlock,
  fireUnitsMade,
  fortressReady,
  missingFor,
  partPrice,
  plannedLevel,
  queueEnd,
  replanQueue,
  resourceExchange,
  shiftQueue,
  shopBlock,
  shopBought,
  shopBuilding,
  shopDay,
  spiritGold,
  spiritSaleBlock,
  upgradeCost,
} from '../engine/index.js';
import { content } from './content.js';
import { fortressOn } from './features.js';
import {
  buildQueue,
  buildingOpen,
  characterView,
  currentHp,
  loadPlayer,
  loadSettled,
  requirePlayer,
  restsDuring,
  settleCollector,
  settlementOpen,
  storeCollection,
  walletOf,
} from './characters.js';
import { assertion, atomically, sameVersion } from './atomic.js';
import { ApiError, json, readJson } from './http.js';

// A JSON path for a resource id with a hyphen ("iron-ore").
const path = (id) => `$."${id}"`;

export async function startBuilding(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  await beginBuilding(context.env.DB, player, body.buildingId, context.now);
  return json({ character: characterView(await loadPlayer(context.env.DB, session.userId), context.now) }, 201);
}

const atTop = (building) =>
  new ApiError(
    409,
    'max_level',
    building.id === content().camp.id ? 'Obóz ma już najwyższy poziom.' : building.id === content().camp.fortress?.id ? 'Obóz jest już Warownią.' : 'Ten budynek ma już najwyższy poziom.',
  );
const shortOf = (building) =>
  new ApiError(409, 'not_enough', building.id === content().camp.id ? 'Brakuje złota na rozwój obozu.' : 'Brakuje złota albo zasobów na tę budowę.');

// The next level of a building, from now on, paid at once; while another
// build is under way, it goes to the queue. The skipped introduction builds
// the Ognisko this way too (tutorial.js). The camp's own level (buildingId
// "camp") grows the same way, from its first level, which it has without
// building.
export async function beginBuilding(db, player, buildingId, now) {
  const building = typeof buildingId === 'string' ? content().buildingsById[buildingId] : undefined;
  const fortress = Boolean(building) && building.id === content().camp.fortress?.id;
  // The Osada's buildings (Kwatery) once the character has the Osada, the
  // Warownia's once the camp has turned into one, and the transformation
  // itself where the Warownia is on.
  if (!building || (fortress ? !fortressOn() : !buildingOpen(building, player.row, player.buildings, now))) {
    throw new ApiError(400, 'invalid_building', 'Nie ma takiego budynku.');
  }
  // The transformation once every camp building and the Obóz stand at the
  // top (fortress.js), once.
  if (fortress) {
    const stored = player.buildings[building.id];
    if (stored && buildingLevel(stored, now) < building.maxLevel) throw new ApiError(409, 'fortress_building', 'Przemiana w Warownię już trwa.');
    const open = content().buildings.filter((one) => !one.fortress && buildingOpen(one, player.row, player.buildings, now));
    if (!stored && !fortressReady(player.buildings, now, open, content())) {
      throw new ApiError(409, 'fortress_not_ready', 'Przemiana w Warownię zacznie się, gdy Obóz i wszystkie jego budynki dojdą do najwyższego poziomu.');
    }
  }
  const queue = buildQueue(player.row);
  if (buildsUnderWay(player.buildings, queue, now) > 0) {
    await queueBuilding(db, player, building, queue, now);
    return;
  }
  const built = buildingLevel(player.buildings[building.id], now);
  const level = Math.max(building.startLevel ?? 0, built);
  // The resource buildings go on to level 20 in the Warownia (618).
  if (level >= buildingTop(building, player.buildings, now, content())) throw atTop(building);
  const target = level + 1;
  const cost = upgradeCost(building, target);
  if (missingFor(cost, walletOf(player.row)).length > 0) throw shortOf(building);

  const row = player.row;
  const stored = player.buildings[building.id];
  const gold = cost.gold ?? 0;
  const resources = Object.keys(cost).filter((id) => id !== 'gold');
  const endsAt = now + buildMinutes(building, target, campLevel(player.buildings, now, content()), content()) * 60000;
  // A production building stops during the upgrade: what its store holds goes
  // to the resources now, and it fills again from the end of the upgrade.
  const producing = building.effect?.kind === 'production';
  const gathered = producing ? collect(building, stored, now) : null;
  const changes = Object.fromEntries(resources.map((id) => [id, -cost[id]]));
  // A store of gold (Staw Midasa) pays part of the cost.
  const gatheredGold = gathered?.resource === 'gold' ? gathered.amount : 0;
  if (gathered && !gatheredGold) changes[gathered.resource] = (changes[gathered.resource] ?? 0) + gathered.amount;
  // The upgrade starts only if nothing is being built, the building is as
  // seen here (level and store) and the cost is still there; the payment only
  // if the upgrade started. So two taps at once start and pay one upgrade.
  // The build keeps what it cost: "Przerwij budowę" gives back exactly that.
  const start = db
    .prepare(
      `INSERT INTO buildings (character_id, building_id, level, started_at, ends_at, collected_at, cost)
       SELECT ?, ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM buildings WHERE character_id = ? AND ends_at > ?)
         AND COALESCE((SELECT level FROM buildings WHERE character_id = ? AND building_id = ?), 0) = ?
         AND COALESCE((SELECT COALESCE(collected_at, ends_at) FROM buildings WHERE character_id = ? AND building_id = ?), 0) = ?
         AND (SELECT gold FROM characters WHERE id = ?) >= ?
         ${resources.map(() => 'AND COALESCE(json_extract((SELECT resources FROM characters WHERE id = ?), ?), 0) >= ?').join(' ')}
       ON CONFLICT (character_id, building_id) DO UPDATE
         SET level = excluded.level, started_at = excluded.started_at, ends_at = excluded.ends_at, collected_at = excluded.collected_at, cost = excluded.cost`,
    )
    .bind(
      row.id, building.id, target, now, endsAt, producing ? endsAt : null, JSON.stringify(cost),
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
  const resting = restsDuring(player.activity);
  const pay = db
    .prepare(
      `UPDATE characters SET gold = gold - ?${setResources}${resting ? ', hp = ?, hp_at = ?' : ''}, version = version + 1
       WHERE id = ? AND EXISTS (
         SELECT 1 FROM buildings WHERE character_id = ? AND building_id = ? AND level = ? AND started_at = ?
       )`,
    )
    .bind(
      gold - gatheredGold,
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
  const { camp } = content();
  if (buildsUnderWay(player.buildings, queue, now) >= camp.queue) {
    throw new ApiError(409, 'queue_full', 'Kolejka budowy jest pełna.');
  }
  const level = plannedLevel(building, player.buildings, queue);
  const top = buildingTop(building, player.buildings, now, content());
  if (level >= top) {
    if (buildingLevel(player.buildings[building.id], now) >= top) throw atTop(building);
    throw new ApiError(409, 'max_level', 'Najwyższy poziom jest już w kolejce.');
  }
  const target = level + 1;
  const cost = upgradeCost(building, target);
  if (missingFor(cost, walletOf(player.row)).length > 0) throw shortOf(building);
  const startsAt = queueEnd(player.buildings, queue, now);
  const minutes = buildMinutes(building, target, plannedLevel(camp, player.buildings, queue), content());
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
// the queue comes sooner. Saved only if the character is as seen here. The
// build under way is called off the same way (stopBuilding).
export async function cancelBuilding(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const queue = buildQueue(player.row);
  const level = Number(body.level);
  const running = construction(player.buildings, context.now);
  if (running && running.buildingId === body.buildingId && running.level === level) return stopBuilding(context, session, player, running, queue);
  if (!queue.some((entry) => entry.buildingId === body.buildingId && entry.level === level)) {
    throw new ApiError(409, 'not_queued', 'Tej budowy nie ma już w kolejce.');
  }
  const { cancelled, kept } = cancelFromQueue(queue, body.buildingId, level);
  const back = {};
  for (const entry of cancelled) {
    const building = content().buildingsById[entry.buildingId];
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
      JSON.stringify(replanQueue(player.buildings, kept, now, content())),
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

// "Przerwij budowę" by the build under way (the author, 5.11.2026: „Nie
// można anulować aktualnie budowanego miejsca ze zwrotem kosztow zasobow a
// chcemy tego”): the building goes back to the level it had, or to an empty
// plot, its whole cost comes back with the higher levels of it waiting in
// the queue, and the rest of the queue starts from now. The cost is what
// the build was paid (`cost`, kept with it), or for a build from before it
// was kept, the price of its level now. A production building, whose store
// went to the resources when the build began, fills again from now. Saved
// only if the character and the build are as seen here.
async function stopBuilding(context, session, player, running, queue) {
  const db = context.env.DB;
  const now = context.now;
  const row = player.row;
  const building = content().buildingsById[running.buildingId];
  const { cancelled, kept } = cancelFromQueue(queue, running.buildingId, running.level + 1);
  const paid = running.cost ?? (building ? upgradeCost(building, running.level) : {});
  const costs = [paid, ...cancelled.map((entry) => entry.cost ?? (building ? upgradeCost(building, entry.level) : {}))];
  const back = {};
  for (const cost of costs) for (const [id, amount] of Object.entries(cost)) back[id] = (back[id] ?? 0) + amount;
  const before = running.level - 1;
  const producing = building?.effect?.kind === 'production';
  // The level it goes back to stands as of old (`endsAt` 0): the time it was
  // reached is not kept, and the start of the build stopped changed nothing.
  // So a rest counted from before that start runs at the Ognisko's pace of
  // that level all along (restBonus), and the phone hears of no build ended
  // (notifications.js).
  const stored = { ...player.buildings };
  if (before > 0) stored[running.buildingId] = { level: before, startedAt: running.startedAt, endsAt: 0, collectedAt: producing ? now : null };
  else delete stored[running.buildingId];
  const resources = Object.keys(back).filter((id) => id !== 'gold');
  const give = resources.length
    ? `, resources = json_set(resources, ${resources.map(() => '?, COALESCE(json_extract(resources, ?), 0) + ?').join(', ')})`
    : '';
  // While resting, the HP rested so far is saved, as when a build begins.
  const resting = restsDuring(player.activity);
  const where = [row.id, running.buildingId, running.level, running.endsAt];
  await atomically(db, [
    sameVersion(db, row),
    assertion(db, 'EXISTS (SELECT 1 FROM buildings WHERE character_id = ? AND building_id = ? AND level = ? AND ends_at = ?)', where),
    db
      .prepare(`UPDATE characters SET gold = gold + ?${give}, build_queue = ?${resting ? ', hp = ?, hp_at = ?' : ''}, version = version + 1 WHERE id = ? AND version = ?`)
      .bind(
        back.gold ?? 0,
        ...resources.flatMap((id) => [path(id), path(id), back[id]]),
        JSON.stringify(replanQueue(stored, kept, now, content())),
        ...(resting ? [currentHp(player, now).hp, now] : []),
        row.id,
        row.version,
      ),
    before > 0
      ? db
          .prepare('UPDATE buildings SET level = ?, ends_at = 0, collected_at = ?, cost = NULL WHERE character_id = ? AND building_id = ? AND level = ? AND ends_at = ?')
          .bind(before, producing ? now : null, ...where)
      : db.prepare('DELETE FROM buildings WHERE character_id = ? AND building_id = ? AND level = ? AND ends_at = ?').bind(...where),
  ], () => new ApiError(409, 'conflict', 'Obóz zmienił się w międzyczasie. Spróbuj ponownie.'));
  return json({
    cancelled: [{ buildingId: running.buildingId, level: running.level }, ...cancelled.map((entry) => ({ buildingId: entry.buildingId, level: entry.level }))],
    refund: back,
    // The next build waiting starts at once.
    character: characterView(await loadSettled(db, session.userId, now), now),
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

// "Wrzuć złoto": `amount` pieces of a resource from the fire spirit at the
// Ognisko's level now (an upgrade under way counts once it ends), within
// the pieces left today. Saved only if the character is as seen here, so
// two taps at once make one trade and the day's count holds.
export async function tradeAtFire(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const now = context.now;
  const row = player.row;
  const level = buildingLevel(player.buildings[fireBuilding(content())?.id], now);
  const made = fireUnitsMade({ day: row.fire_day, units: row.fire_units }, now, content());
  const block = fireTradeBlock({ level, gold: row.gold, made, resource: body.resource, amount: body.amount }, content());
  if (block) throw new ApiError(block.code.startsWith('invalid') ? 400 : 409, block.code, block.message);
  const amount = body.amount;
  const gold = amount * fireTrade(level, content()).unitGold;
  const db = context.env.DB;
  const result = await db
    .prepare(
      `UPDATE characters SET gold = gold - ?, resources = json_set(resources, ?, COALESCE(json_extract(resources, ?), 0) + ?),
         fire_day = ?, fire_units = ?, version = version + 1
       WHERE id = ? AND version = ? AND gold >= ?`,
    )
    .bind(gold, path(body.resource), path(body.resource), amount, fireDay(now, content()), made + amount, row.id, row.version, gold)
    .run();
  if (result.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Obóz zmienił się w międzyczasie. Spróbuj ponownie.');
  return json({
    traded: { resource: body.resource, amount, gold },
    character: characterView(await loadPlayer(db, session.userId), now),
  });
}

// The scrap dealer's counter: `count` parts of a kind for gold, at the
// price of the Skup złomu's level.
export async function buyParts(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const now = context.now;
  const row = player.row;
  const level = buildingLevel(player.buildings[shopBuilding(content())?.id], now);
  // The parts bought today, by id, count toward the dealer's daily limit.
  const bought = shopBought({ day: row.shop_day, parts: JSON.parse(row.shop_parts ?? '{}') }, now, content());
  const block = shopBlock({ level, gold: row.gold, partId: body.partId, count: body.count, bought }, content());
  if (block) throw new ApiError(block.code.startsWith('invalid') ? 400 : 409, block.code, block.message);
  const gold = partPrice(body.partId, level, content()) * body.count;
  const today = { ...bought, [body.partId]: (bought[body.partId] ?? 0) + body.count };
  const db = context.env.DB;
  const result = await db
    .prepare(
      `UPDATE characters SET gold = gold - ?, parts = json_set(parts, ?, COALESCE(json_extract(parts, ?), 0) + ?), shop_day = ?, shop_parts = ?, version = version + 1
       WHERE id = ? AND version = ? AND gold >= ?`,
    )
    .bind(gold, path(body.partId), path(body.partId), body.count, shopDay(now, content()), JSON.stringify(today), row.id, row.version, gold)
    .run();
  if (result.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Obóz zmienił się w międzyczasie. Spróbuj ponownie.');
  return json({
    bought: { partId: body.partId, count: body.count, gold },
    character: characterView(await loadPlayer(db, session.userId), now),
  });
}

// The Stół rozbiórki's exchange: `amount` pieces of a resource (`to`) for
// pieces of another (`from`) at the building's level now (an upgrade under
// way counts once it ends). Saved only if the character is as seen here and
// still has the pieces, so two taps at once make one exchange.
export async function exchangeResources(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const now = context.now;
  const row = player.row;
  const level = buildingLevel(player.buildings[exchangeBuilding(content())?.id], now);
  const { from, to, amount } = body;
  const block = exchangeBlock({ level, resources: walletOf(row), from, to, amount }, content());
  if (block) throw new ApiError(block.code.startsWith('invalid') ? 400 : 409, block.code, block.message);
  const given = amount * resourceExchange(level, content()).rate;
  const db = context.env.DB;
  const result = await db
    .prepare(
      `UPDATE characters SET resources = json_set(resources, ?, json_extract(resources, ?) - ?, ?, COALESCE(json_extract(resources, ?), 0) + ?), version = version + 1
       WHERE id = ? AND version = ? AND COALESCE(json_extract(resources, ?), 0) >= ?`,
    )
    .bind(path(from), path(from), given, path(to), path(to), amount, row.id, row.version, path(from), given)
    .run();
  if (result.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Obóz zmienił się w międzyczasie. Spróbuj ponownie.');
  return json({
    exchanged: { from, to, given, amount },
    character: characterView(await loadPlayer(db, session.userId), now),
  });
}

// The Duch budowniczego at the Kamień węgielny Warowni (the author: "Niech
// przy Kamieniu czuwa duch budowniczego, który za zasoby płaci złotem"):
// `amount` pieces of a camp resource for gold, rounded down
// (builder-spirit.js). The stone stands only with the Osada, so does he.
// Like the rest of the camp he buys also while the character is away; the
// sale brings no relation or reputation, as he lives in no place of the
// Osada. Saved only if the character is as seen here and still has the
// pieces, so two taps at once sell once.
export async function sellToSpirit(context) {
  const { session, player } = await requirePlayer(context);
  const spirit = builderSpirit(content());
  if (!spirit) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  const row = player.row;
  if (!settlementOpen(row)) throw new ApiError(403, 'locked', spirit.texts.locked);
  const { resource, amount } = await readJson(context.request);
  const block = spiritSaleBlock({ resources: walletOf(row), resource, amount }, content());
  if (block) throw new ApiError(block.code.startsWith('invalid') ? 400 : 409, block.code, block.message);
  const gold = spiritGold(resource, amount, content());
  const db = context.env.DB;
  const result = await db
    .prepare(
      `UPDATE characters SET gold = gold + ?, resources = json_set(resources, ?, json_extract(resources, ?) - ?), version = version + 1
       WHERE id = ? AND version = ? AND COALESCE(json_extract(resources, ?), 0) >= ?`,
    )
    .bind(gold, path(resource), path(resource), amount, row.id, row.version, path(resource), amount)
    .run();
  if (result.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Obóz zmienił się w międzyczasie. Spróbuj ponownie.');
  return json({
    sold: { resource, amount, gold },
    character: characterView(await loadPlayer(db, session.userId), context.now),
  });
}

// "Zbierz": what a production building's store holds goes to the resources,
// and the store fills again.
export async function collectProduction(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const building = typeof body.buildingId === 'string' ? content().buildingsById[body.buildingId] : undefined;
  if (!building || building.effect.kind !== 'production') {
    throw new ApiError(400, 'invalid_building', 'Ten budynek niczego nie wytwarza.');
  }
  const now = context.now;
  const stored = player.buildings[building.id];
  const gathered = collect(building, stored, now);
  if (!gathered) throw new ApiError(409, 'nothing_to_collect', 'Magazyn jest jeszcze pusty.');

  const db = context.env.DB;
  // The resources come only if the store is still as seen here, and then the
  // store moves on (storeCollection): of two taps at once, the second finds
  // it moved and gets nothing. With the Zbieracz Systemu the whole fills
  // went to the resources as the request began (requirePlayer), so this is
  // what the next fill holds so far.
  const [paid] = await db.batch(storeCollection(db, player.row.id, building.id, stored.collectedAt ?? stored.endsAt, gathered, now));
  if (paid.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Obóz zmienił się w międzyczasie. Spróbuj ponownie.');
  return json({
    collected: { resource: gathered.resource, amount: gathered.amount },
    character: characterView(await loadPlayer(db, session.userId), now),
  });
}

// The Zbieracz Systemu (the author: „Niech Zbieracz Systemu bedzie duchem
// stojącym przy Skrzyni Konta bez opisu [...] po kliknięciu w niego
// wyświetlać się będzie opcja zakupu za sporą ilość złota [...] i wtedy on
// znika i automatycznie w grze toczy się zbieranie max zasobów gdy się
// wygenerują”): bought once for good, as the Awatar Systemu (avatar.js),
// only with the gold for it, so two taps at once pay once. The camp is open
// from the start, so every player may buy him. From then on the game
// collects the stores' whole fills whenever it loads the character
// (characters.js: settleCollector), the stores full now at once.
export async function buyCollector(context) {
  const { session, player } = await requirePlayer(context);
  const { price, texts } = content().camp.collector;
  const { row } = player;
  if (row.collector_at) throw new ApiError(409, 'owned', texts.owned);
  if (row.gold < price) throw new ApiError(409, 'no_gold', texts.noGold);
  const db = context.env.DB;
  const now = context.now;
  const bought = await db
    .prepare('UPDATE characters SET gold = gold - ?, collector_at = ?, version = version + 1 WHERE id = ? AND collector_at IS NULL AND gold >= ?')
    .bind(price, now, row.id, price)
    .run();
  if (bought.meta.changes !== 1) throw new ApiError(409, 'conflict', 'Postać zmieniła się w międzyczasie. Spróbuj ponownie.');
  const after = await loadPlayer(db, session.userId);
  await settleCollector(db, after, now);
  return json({ character: characterView(after, now) });
}

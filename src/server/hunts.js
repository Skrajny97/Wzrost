// Hunts on server time: the start stores the start time, length and seed; the
// claim after the end runs the engine with that seed and saves the report.

import {
  applyHunt,
  areaFor,
  areaUnlocked,
  areaUnlockLevel,
  autoEquip,
  bagCapacity,
  bagOverflow,
  campBonus,
  campLevels,
  durationsUpTo,
  estimateThreat,
  huntDurations,
  huntReport,
  sellPrice,
  simulateHunt,
  threatSamples,
} from '../engine/index.js';
import { content } from './content.js';
import {
  characterView,
  currentHp,
  engineCharacter,
  equippedItems,
  loadPlayer,
  requireIdlePlayer,
  requirePlayer,
} from './characters.js';
import { toHex } from './encoding.js';
import { ApiError, json, readJson } from './http.js';
import { soldGold } from './inventory.js';
import { KEPT_REPORTS } from './reports.js';

// A JSON path for a resource id with a hyphen ("iron-ore").
const resourcePath = (id) => `$."${id}"`;

// Sample fights for the threat level depend only on the build, so the Worker
// keeps them in memory while the build stays the same.
const samplesCache = new Map();
const SAMPLES_CACHE_SIZE = 200;

function cachedSamples(player, character, equipped, areaId) {
  const ids = equipped.map((item) => item.id).sort((a, b) => a - b);
  const key = JSON.stringify([player.row.id, areaId, character.level, character.classLevel, character.points, ids]);
  let samples = samplesCache.get(key);
  if (!samples) {
    samples = threatSamples({ character, equipped, areaId }, content);
    if (samplesCache.size >= SAMPLES_CACHE_SIZE) samplesCache.delete(samplesCache.keys().next().value);
    samplesCache.set(key, samples);
  }
  return samples;
}

// Inner regions open with the class level (areaUnlockLevel).
const areaLocked = (area) =>
  new ApiError(403, 'area_locked', `To miejsce odblokujesz na poziomie klasy ${areaUnlockLevel(area, content)}.`);

// ?area=… asks for one inner region, which keeps each request within the CPU
// limit. Without it the answer covers the inner region of each region that fits
// the character's level, if it is open.
export async function huntOptions(context) {
  const { player } = await requirePlayer(context);
  const character = engineCharacter(player.row);
  const equipped = equippedItems(player);
  const { hp, maxHp } = currentHp(player, context.now);
  const params = new URL(context.request.url).searchParams;
  const only = params.get('area') ?? params.get('region');
  const area = only !== null && areaFor(only, character.level, content);
  if (only !== null && !area) throw new ApiError(400, 'invalid_area', 'Nie ma takiego miejsca.');
  if (area && !areaUnlocked(area, character.classLevel, content)) throw areaLocked(area);
  const areas = area
    ? [area]
    : content.regions
        .map((region) => areaFor(region.id, character.level, content))
        .filter((candidate) => areaUnlocked(candidate, character.classLevel, content));
  return json({
    hp,
    maxHp,
    areas: areas.map(({ id }) => ({
      id,
      threat: estimateThreat({ character, equipped, hp, areaId: id }, content, cachedSamples(player, character, equipped, id)),
    })),
  });
}

export async function startHunt(context) {
  const { session, player } = await requireIdlePlayer(context);
  const body = await readJson(context.request);
  // regionId: "Wyrusz ponownie" from a report made before inner regions.
  const id = body.areaId ?? body.regionId;
  const area = typeof id === 'string' ? areaFor(id, player.row.level, content) : undefined;
  if (!area) throw new ApiError(400, 'invalid_area', 'Wybierz miejsce wyprawy.');
  if (!areaUnlocked(area, player.row.class_level, content)) throw areaLocked(area);
  if (!durationsUpTo(content.balance.hunt.maxMinutes, content).includes(body.minutes)) {
    throw new ApiError(400, 'invalid_duration', 'Wybierz czas wyprawy.');
  }
  if (!huntDurations(player.row.level, content).includes(body.minutes)) {
    const level = content.unlocksById['long-hunts'].level;
    const longest = content.balance.hunt.shortHuntMaxMinutes;
    throw new ApiError(403, 'duration_locked', `Na razie eksploracja trwa najwyżej ${longest} minut. Dłuższe odblokują się na poziomie ${level}.`);
  }

  const now = context.now;
  const { hp } = currentHp(player, now);
  const seed = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const db = context.env.DB;
  try {
    await db.batch([
      db
        .prepare(
          'INSERT INTO activities (character_id, kind, region_id, minutes, started_at, ends_at, seed, hp_at_start) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(player.row.id, 'hunt', area.id, body.minutes, now, now + body.minutes * 60000, seed, hp),
      // The HP rested so far is saved now, so it is not counted again later.
      db.prepare('UPDATE characters SET hp = ?, hp_at = ?, version = version + 1 WHERE id = ?').bind(hp, now, player.row.id),
    ]);
  } catch (error) {
    if (String(error?.message).includes('constraint')) {
      throw new ApiError(409, 'busy', 'Postać jest już na wyprawie.');
    }
    throw error;
  }
  return json({ character: characterView(await loadPlayer(db, session.userId), now) }, 201);
}

// Calling the character back early gives nothing and costs nothing.
export async function cancelHunt(context) {
  const { session, player } = await requirePlayer(context);
  const activity = player.activity;
  if (!activity) throw new ApiError(409, 'no_activity', 'Postać nie jest na wyprawie.');
  if (activity.ends_at <= context.now) {
    throw new ApiError(409, 'claim_first', 'Wyprawa się skończyła. Odbierz raport.');
  }
  const db = context.env.DB;
  await db.prepare('DELETE FROM activities WHERE character_id = ? AND started_at = ?')
    .bind(player.row.id, activity.started_at)
    .run();
  return json({ character: characterView(await loadPlayer(db, session.userId), context.now) });
}

export async function claimHunt(context) {
  const { session, player } = await requirePlayer(context);
  const activity = player.activity;
  if (!activity) throw new ApiError(409, 'no_activity', 'Postać nie jest na wyprawie.');
  if (activity.ends_at > context.now) throw new ApiError(409, 'not_finished', 'Wyprawa jeszcze trwa.');

  const row = player.row;
  const character = engineCharacter(row);
  // region_id holds the inner region (or a whole region, from before them).
  const area = areaFor(activity.region_id, row.level, content);
  const hunt = simulateHunt(
    {
      character,
      equipped: equippedItems(player),
      hp: activity.hp_at_start,
      name: row.name,
      areaId: area.id,
      minutes: activity.minutes,
      seed: activity.seed,
    },
    content,
  );
  const applied = applyHunt(character, hunt, content);
  const now = context.now;
  // A find for a slot with nothing in it is worn at once.
  const autoEquipped = autoEquip(equippedItems(player), hunt.items, content, row.class_id);
  // The rest goes to the bag. When it does not fit, the scrapper buys the
  // weakest items, old or new, at the camp's price.
  const levels = campLevels(player.buildings, now, content);
  const capacity = bagCapacity(levels, content);
  const sellBonus = campBonus(levels, 'sellPrice', content);
  const bag = player.items.filter((item) => !item.equippedSlot);
  const toBag = hunt.items.map((item, index) => index).filter((index) => !autoEquipped.includes(index));
  const candidates = [...bag, ...toBag.map((index) => hunt.items[index])];
  const sold = bagOverflow(candidates, capacity, row.class_id, content);
  const soldStored = sold.filter((index) => index < bag.length).map((index) => bag[index].id);
  const soldFound = sold.filter((index) => index >= bag.length).map((index) => toBag[index - bag.length]);
  const soldFoundGold = soldFound.reduce((sum, index) => sum + sellPrice(hunt.items[index], content, sellBonus), 0);
  const overflow =
    sold.length > 0
      ? {
          capacity,
          count: sold.length,
          gold: sold.reduce((sum, index) => sum + sellPrice(candidates[index], content, sellBonus), 0),
          sold: soldFound,
        }
      : null;
  const report = huntReport(
    { hunt, applied, character, areaId: area.id, startedAt: activity.started_at, endsAt: activity.ends_at, autoEquipped, overflow },
    content,
  );
  const summary = {
    areaName: report.areaName,
    regionName: report.regionName,
    minutes: report.minutes,
    result: report.result,
    resultText: report.resultText,
    xp: report.summary.xp,
    classXp: report.summary.classXp,
    penalty: report.summary.penalty,
    gold: report.summary.gold,
    itemsFound: report.summary.itemsFound,
    resources: report.summary.resources,
    bestFind: report.summary.bestFind && { name: report.summary.bestFind.name, color: report.summary.bestFind.color },
    levelAfter: applied.level,
    system: report.system,
  };

  const db = context.env.DB;
  const insertItem = db.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, ?, ?, ?)');
  const storedPrice = soldStored.length > 0 ? soldGold(row.id, soldStored, sellBonus) : { sql: '0', binds: [] };
  const found = Object.entries(hunt.resources);
  const setResources = found.length
    ? `, resources = json_set(resources, ${found.map(() => '?, COALESCE(json_extract(resources, ?), 0) + ?').join(', ')})`
    : '';
  let results;
  try {
    results = await db.batch([
      // First, so that a second claim of the same hunt fails as a whole.
      db
        .prepare('INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(row.id, `${row.id}:${activity.started_at}`, 'hunt', now, JSON.stringify(summary), JSON.stringify(report)),
      // A report keeps every fight (about 40 KB for 4 hours), so only those the journal shows stay.
      db
        .prepare('DELETE FROM reports WHERE character_id = ? AND id NOT IN (SELECT id FROM reports WHERE character_id = ? ORDER BY id DESC LIMIT ?)')
        .bind(row.id, row.id, KEPT_REPORTS),
      ...hunt.items.flatMap((item, index) =>
        soldFound.includes(index) ? [] : [insertItem.bind(row.id, autoEquipped.includes(index) ? item.slot : null, JSON.stringify(item), now)],
      ),
      db
        .prepare(
          `UPDATE characters SET level = ?, xp = ?, class_level = ?, class_xp = ?, gold = gold + ? + ${storedPrice.sql}${setResources},
             hp = ?, hp_at = ?, version = version + 1
           WHERE id = ?`,
        )
        .bind(
          applied.level,
          applied.xp,
          applied.classLevel,
          applied.classXp,
          hunt.gold + soldFoundGold,
          ...storedPrice.binds,
          ...found.flatMap(([id, amount]) => [resourcePath(id), resourcePath(id), amount]),
          hunt.hpEnd,
          activity.ends_at,
          row.id,
        ),
      // Bag items the scrapper bought: paid for above, while they were still there.
      ...(soldStored.length > 0
        ? [db.prepare(`DELETE FROM items WHERE character_id = ? AND id IN (${soldStored.map(() => '?').join(', ')})`).bind(row.id, ...soldStored)]
        : []),
      db.prepare('DELETE FROM activities WHERE character_id = ? AND started_at = ?').bind(row.id, activity.started_at),
    ]);
  } catch (error) {
    if (String(error?.message).includes('UNIQUE')) {
      throw new ApiError(409, 'already_claimed', 'Ten raport został już odebrany.');
    }
    throw error;
  }

  const id = results[0].meta.last_row_id;
  return json({
    report: { id, createdAt: now, ...report },
    character: characterView(await loadPlayer(db, session.userId), now),
  });
}

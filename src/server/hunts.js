// Hunts on server time: the start stores the start time, length and seed; the
// claim after the end runs the engine with that seed and saves the report.

import {
  addQuestProgress,
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
  hpAfterHunt,
  huntDurations,
  huntKills,
  huntReport,
  longestHunt,
  lowerThreat,
  nextHuntUnlock,
  questCreatures,
  sellPrice,
  simulateHunt,
  threatSamples,
} from '../engine/index.js';
import { content } from './content.js';
import {
  bagPlaces,
  characterView,
  currentHp,
  engineCharacter,
  equippedItems,
  loadPlayer,
  questsNow,
  requireIdlePlayer,
  requirePlayer,
} from './characters.js';
import { toHex } from './encoding.js';
import { ApiError, json, readJson } from './http.js';
import { soldGold } from './inventory.js';
import { finishGathering } from './professions.js';
import { KEPT_REPORTS } from './reports.js';

// A JSON path for a resource id with a hyphen ("iron-ore").
const resourcePath = (id) => `$."${id}"`;

// Sample fights for the threat level depend only on the build, so the Worker
// keeps them in memory while the build stays the same.
const samplesCache = new Map();
const SAMPLES_CACHE_SIZE = 200;

function cachedSamples(player, character, equipped, areaId) {
  const ids = equipped.map((item) => item.id).sort((a, b) => a - b);
  const key = JSON.stringify([player.row.id, areaId, character.level, character.classLevel, character.points, character.skills, ids]);
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
  // threatAvoiding: the same exploration with the elite and the champion
  // avoided, from the same sample fights, and never above the threat without.
  return json({
    hp,
    maxHp,
    areas: areas.map(({ id }) => {
      const samples = cachedSamples(player, character, equipped, id);
      const threat = estimateThreat({ character, equipped, hp, areaId: id }, content, samples);
      const avoiding = estimateThreat({ character, equipped, hp, areaId: id, avoidRare: true }, content, samples);
      return { id, threat, threatAvoiding: lowerThreat(avoiding, threat) };
    }),
  });
}

export async function startHunt(context) {
  const { session, player } = await requireIdlePlayer(context);
  const body = await readJson(context.request);
  await beginHunt(context.env.DB, player, body, context.now);
  return json({ character: characterView(await loadPlayer(context.env.DB, session.userId), context.now) }, 201);
}

// An exploration of `minutes` in an inner region, from now on, avoiding the
// elite and the champion when asked (avoidRare), and tracking the creatures
// the quests ask for (trackQuests): those living there are kept with it. The
// skipped introduction sends the first one this way too (tutorial.js).
export async function beginHunt(db, player, { areaId, regionId, minutes, avoidRare = false, trackQuests = false } = {}, now) {
  // regionId: "Wyrusz ponownie" from a report made before inner regions.
  const id = areaId ?? regionId;
  const area = typeof id === 'string' ? areaFor(id, player.row.level, content) : undefined;
  if (!area) throw new ApiError(400, 'invalid_area', 'Wybierz miejsce wyprawy.');
  if (!areaUnlocked(area, player.row.class_level, content)) throw areaLocked(area);
  if (!durationsUpTo(content.balance.hunt.maxMinutes, content).includes(minutes)) {
    throw new ApiError(400, 'invalid_duration', 'Wybierz czas wyprawy.');
  }
  if (typeof avoidRare !== 'boolean') throw new ApiError(400, 'invalid_avoid', 'Zaznacz albo odznacz omijanie elit i czempionów.');
  if (typeof trackQuests !== 'boolean') throw new ApiError(400, 'invalid_track', 'Zaznacz albo odznacz tropienie stworów z zadań.');
  if (!huntDurations(player.row.level, content).includes(minutes)) {
    const longest = longestHunt(player.row.level, content);
    const next = nextHuntUnlock(player.row.level, content);
    throw new ApiError(
      403,
      'duration_locked',
      `Na razie eksploracja trwa najwyżej ${longest} minut. Dłuższe odblokują się na poziomie ${next?.level ?? player.row.level}.`,
    );
  }

  const { hp } = currentHp(player, now);
  const seed = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const tracked = trackQuests ? questCreatures(questsNow(player, now), area) : [];
  try {
    await db.batch([
      db
        .prepare(
          'INSERT INTO activities (character_id, kind, region_id, minutes, started_at, ends_at, seed, hp_at_start, avoid_rare, tracked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(player.row.id, 'hunt', area.id, minutes, now, now + minutes * 60000, seed, hp, avoidRare ? 1 : 0, tracked.length > 0 ? JSON.stringify(tracked) : null),
      // The HP rested so far is saved now, so it is not counted again later.
      db.prepare('UPDATE characters SET hp = ?, hp_at = ?, version = version + 1 WHERE id = ?').bind(hp, now, player.row.id),
    ]);
  } catch (error) {
    if (String(error?.message).includes('constraint')) {
      throw new ApiError(409, 'busy', 'Postać jest już na wyprawie.');
    }
    throw error;
  }
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

// The report of the activity that ended: an exploration, or a gathering of
// herbs (professions.js).
export async function claimHunt(context) {
  const { session, player } = await requirePlayer(context);
  const now = context.now;
  const { id, report } = player.activity?.kind === 'herbs' && player.activity.ends_at <= now
    ? await finishGathering(context.env.DB, player, now)
    : await finishHunt(context.env.DB, player, now);
  return json({
    report: { id, createdAt: now, ...report },
    character: characterView(await loadPlayer(context.env.DB, session.userId), now),
  });
}

// The report of a finished exploration: the engine runs it with the seed
// saved at its start, and the character gets what it brought.
export async function finishHunt(db, player, now) {
  const activity = player.activity;
  if (!activity) throw new ApiError(409, 'no_activity', 'Postać nie jest na wyprawie.');
  if (activity.ends_at > now) throw new ApiError(409, 'not_finished', 'Wyprawa jeszcze trwa.');

  const row = player.row;
  const character = engineCharacter(row);
  // region_id holds the inner region (or a whole region, from before them).
  const area = areaFor(activity.region_id, row.level, content);
  // The very first exploration, before any report, goes one way (simulateHunt).
  const first = !(await db.prepare('SELECT 1 AS found FROM reports WHERE character_id = ? LIMIT 1').bind(row.id).first());
  const hunt = simulateHunt(
    {
      character,
      equipped: equippedItems(player),
      hp: activity.hp_at_start,
      name: row.name,
      areaId: area.id,
      minutes: activity.minutes,
      seed: activity.seed,
      first,
      avoidRare: activity.avoid_rare === 1,
      tracked: JSON.parse(activity.tracked ?? '[]'),
    },
    content,
  );
  const applied = applyHunt(character, hunt, content);
  // A find for a slot with nothing in it is worn at once.
  const autoEquipped = autoEquip(equippedItems(player), hunt.items, content, row.class_id, row.class_level);
  // The rest goes to the bag. When it does not fit, the scrapper buys the
  // weakest items, old or new, at the camp's price. Herbs keep the places
  // their stacks take.
  const levels = campLevels(player.buildings, now, content);
  const bag = player.items.filter((item) => !item.equippedSlot);
  const capacity = bagCapacity(levels, content) - (bagPlaces(player) - bag.length);
  const sellBonus = campBonus(levels, 'sellPrice', content);
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
    materials: report.summary.materials.map(({ name, label, color, count }) => ({ name, label, color, count })),
    timePoints: report.summary.timePoints,
    bestFind: report.summary.bestFind && { name: report.summary.bestFind.name, color: report.summary.bestFind.color },
    levelAfter: applied.level,
    system: report.system,
  };

  const insertItem = db.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, ?, ?, ?)');
  const storedPrice = soldStored.length > 0 ? soldGold(row.id, soldStored, sellBonus) : { sql: '0', binds: [] };
  const found = Object.entries(hunt.resources);
  const setResources = found.length
    ? `, resources = json_set(resources, ${found.map(() => '?, COALESCE(json_extract(resources, ?), 0) + ?').join(', ')})`
    : '';
  // Materials from beaten creatures, by stack ("wolf-pelt:common").
  const left = Object.entries(hunt.materials);
  // A new level heals fully, with the finds worn from now on (hpAfterHunt).
  const worn = [...equippedItems(player), ...autoEquipped.map((index) => hunt.items[index])];
  const hp = hpAfterHunt({ character, applied, hunt, equipped: worn, name: row.name }, content);
  // The creatures of every fight join those the character has met
  // ("Czyhające niebezpieczeństwa" shows them by name from now on).
  const met = [...new Set([...JSON.parse(row.met ?? '[]'), ...hunt.fights.flatMap((fight) => fight.enemies.map((enemy) => enemy.monsterId))])];
  // The narrator's quests count the creatures beaten and the minutes. They
  // are saved only as read, so a reward claimed meanwhile is not undone.
  const quests = JSON.stringify(addQuestProgress(questsNow(player, now), { kills: huntKills(hunt), minutes: activity.minutes }));
  const setMaterials = left.length
    ? `, materials = json_set(materials, ${left.map(() => '?, COALESCE(json_extract(materials, ?), 0) + ?').join(', ')})`
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
          `UPDATE characters SET level = ?, xp = ?, class_level = ?, class_xp = ?, gold = gold + ? + ${storedPrice.sql}${setResources}${setMaterials},
             time_points = time_points + ?, hp = ?, hp_at = ?, met = ?, quests = CASE WHEN quests = ? THEN ? ELSE quests END,
             version = version + 1
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
          ...left.flatMap(([key, count]) => [resourcePath(key), resourcePath(key), count]),
          applied.timePoints,
          hp,
          activity.ends_at,
          JSON.stringify(met),
          row.quests,
          quests,
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

  return { id: results[0].meta.last_row_id, report };
}

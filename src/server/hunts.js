// Hunts on server time: the start stores the start time, length and seed; the
// claim after the end runs the engine with that seed and saves the report.

import {
  applyHunt,
  autoEquip,
  durationsUpTo,
  estimateThreat,
  huntDurations,
  huntReport,
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
import { KEPT_REPORTS } from './reports.js';

// Sample fights for the threat level depend only on the build, so the Worker
// keeps them in memory while the build stays the same.
const samplesCache = new Map();
const SAMPLES_CACHE_SIZE = 200;

function cachedSamples(player, character, equipped, regionId) {
  const ids = equipped.map((item) => item.id).sort((a, b) => a - b);
  const key = JSON.stringify([player.row.id, regionId, character.level, character.classLevel, character.points, ids]);
  let samples = samplesCache.get(key);
  if (!samples) {
    samples = threatSamples({ character, equipped, regionId }, content);
    if (samplesCache.size >= SAMPLES_CACHE_SIZE) samplesCache.delete(samplesCache.keys().next().value);
    samplesCache.set(key, samples);
  }
  return samples;
}

// ?region=… asks for one region only, which keeps each request within the CPU limit.
export async function huntOptions(context) {
  const { player } = await requirePlayer(context);
  const character = engineCharacter(player.row);
  const equipped = equippedItems(player);
  const { hp, maxHp } = currentHp(player, context.now);
  const only = new URL(context.request.url).searchParams.get('region');
  if (only !== null && !content.regionsById[only]) throw new ApiError(400, 'invalid_region', 'Nie ma takiego regionu.');
  const regions = only === null ? content.regions : [content.regionsById[only]];
  return json({
    hp,
    maxHp,
    regions: regions.map((region) => ({
      id: region.id,
      threat: estimateThreat({ character, equipped, hp, regionId: region.id }, content, cachedSamples(player, character, equipped, region.id)),
    })),
  });
}

export async function startHunt(context) {
  const { session, player } = await requireIdlePlayer(context);
  const body = await readJson(context.request);
  const region = typeof body.regionId === 'string' ? content.regionsById[body.regionId] : undefined;
  if (!region) throw new ApiError(400, 'invalid_region', 'Wybierz region.');
  if (!durationsUpTo(content.balance.hunt.maxMinutes, content).includes(body.minutes)) {
    throw new ApiError(400, 'invalid_duration', 'Wybierz czas wyprawy.');
  }
  if (!huntDurations(player.row.level, content).includes(body.minutes)) {
    const level = content.unlocksById['long-hunts'].level;
    const longest = content.balance.hunt.shortHuntMaxMinutes;
    throw new ApiError(403, 'duration_locked', `Na razie polowanie trwa najwyżej ${longest} minut. Dłuższe odblokują się na poziomie ${level}.`);
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
        .bind(player.row.id, 'hunt', region.id, body.minutes, now, now + body.minutes * 60000, seed, hp),
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
  const hunt = simulateHunt(
    {
      character,
      equipped: equippedItems(player),
      hp: activity.hp_at_start,
      name: row.name,
      regionId: activity.region_id,
      minutes: activity.minutes,
      seed: activity.seed,
    },
    content,
  );
  const applied = applyHunt(character, hunt, content);
  // A find for a slot with nothing in it is worn at once.
  const autoEquipped = autoEquip(equippedItems(player), hunt.items, content);
  const report = huntReport(
    { hunt, applied, character, regionId: activity.region_id, startedAt: activity.started_at, endsAt: activity.ends_at, autoEquipped },
    content,
  );
  const summary = {
    regionName: report.regionName,
    minutes: report.minutes,
    result: report.result,
    resultText: report.resultText,
    xp: report.summary.xp,
    penalty: report.summary.penalty,
    gold: report.summary.gold,
    itemsFound: report.summary.itemsFound,
    bestFind: report.summary.bestFind && { name: report.summary.bestFind.name, color: report.summary.bestFind.color },
    levelAfter: applied.level,
    system: report.system,
  };

  const db = context.env.DB;
  const now = context.now;
  const insertItem = db.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, ?, ?, ?)');
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
      ...hunt.items.map((item, index) =>
        insertItem.bind(row.id, autoEquipped.includes(index) ? item.slot : null, JSON.stringify(item), now),
      ),
      db
        .prepare(
          `UPDATE characters SET level = ?, xp = ?, class_level = ?, class_xp = ?, gold = gold + ?,
             hp = ?, hp_at = ?, version = version + 1
           WHERE id = ?`,
        )
        .bind(applied.level, applied.xp, applied.classLevel, applied.classXp, hunt.gold, hunt.hpEnd, activity.ends_at, row.id),
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

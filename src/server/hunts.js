// Hunts on server time: the start stores the start time, length and seed; the
// claim after the end runs the engine with that seed and saves the report.

import {
  addQuestProgress,
  addSpeed,
  applyHunt,
  areaFor,
  areasOpened,
  areaUnlocked,
  areaUnlockLevel,
  autoEquip,
  bagCapacity,
  bagOverflow,
  campBonus,
  campLevels,
  durationsUpTo,
  estimateThreat,
  fightKind,
  fightPotions,
  higherThreat,
  hpAfterHunt,
  huntDurations,
  isUnlocked,
  huntKills,
  eventFor,
  eventView,
  huntReport,
  longestHunt,
  lowerThreat,
  nextHuntUnlock,
  potionsPerKind,
  questCreatures,
  questPeriod,
  rareCatchUp,
  sellPrice,
  resolveEvent,
  simulateHunt,
  speedWindow,
  threatSamples,
} from '../engine/index.js';
import { finishBrewing } from './brewing.js';
import { content } from './content.js';
import {
  bagPlaces,
  buffsOf,
  characterView,
  currentHp,
  engineCharacter,
  equippedItems,
  loadPlayer,
  questsNow,
  quickHuntsUsed,
  requireIdlePlayer,
  requirePlayer,
} from './characters.js';
import { toHex } from './encoding.js';
import { ApiError, json, readJson } from './http.js';
import { eventsOn } from './features.js';
import { soldGold } from './inventory.js';
import { finishGathering } from './professions.js';
import { knownPotionsOf, potionKnown, potionsOf } from './professions-view.js';
import { KEPT_REPORTS } from './reports.js';
import { finishCrafting } from './workshop.js';

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

// The healing potions of ?heal=…&below=… for the threat (potions.js): as
// many as asked of the first kind the character carries, drunk below the
// mark asked, or null.
function healingFor(player, params) {
  const count = Number(params.get('heal') ?? 0);
  if (!Number.isInteger(count) || count <= 0) return null;
  const { healBelow, healBelowChoices } = content.potionUse;
  const below = Number(params.get('below') ?? healBelow);
  const have = knownPotionsOf(player.row);
  const kit = fightPotions(have, healBelowChoices.includes(below) ? below : healBelow, content).heal;
  return kit ? { count: Math.min(count, have[kit.id]), amount: kit.amount, below: kit.below } : null;
}

// The potions an exploration of `minutes` takes along (potions.js): known
// ones that work in fights, of each at most as many as the character has
// and as the exploration has fights.
function takenPotions(player, asked, minutes) {
  if (asked === undefined || asked === null) return {};
  if (typeof asked !== 'object' || Array.isArray(asked)) throw new ApiError(400, 'invalid_potions', 'Wybierz mikstury na wyprawę.');
  const have = potionsOf(player.row);
  const most = potionsPerKind(minutes, content);
  const taken = {};
  for (const [id, count] of Object.entries(asked)) {
    const potion = content.potionsById[id];
    if (!potion || !fightKind(potion)) throw new ApiError(400, 'invalid_potions', 'Tej mikstury nie zabiera się na wyprawę.');
    const limit = Math.min(have[id] ?? 0, most);
    if (!Number.isInteger(count) || count < 0 || count > limit) throw new ApiError(400, 'invalid_potions', `Zabierz od 0 do ${limit} sztuk.`);
    // One got in a Wymiana waits for its recipe (DECISIONS.md, "Wymiana").
    if (count > 0 && !potionKnown(player.row, potion)) throw new ApiError(400, 'unknown_recipe', `Nie znasz jeszcze receptury: ${potion.name}.`);
    if (count > 0) taken[id] = count;
  }
  return taken;
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
  // threatAvoiding and threatSeeking: the same exploration with the elite and
  // the champion avoided or sought, from the same sample fights; the first is
  // never above the threat without them, the second never below it. In a
  // place too easy for the character, the elite and the champion it has not
  // met come far more often (rareCatchUp). Healing potions taken along
  // count too (healingFor).
  const met = JSON.parse(player.row.met ?? '[]');
  const healing = healingFor(player, params);
  return json({
    hp,
    maxHp,
    areas: areas.map((place) => {
      const { id } = place;
      const samples = cachedSamples(player, character, equipped, id);
      const catchUp = rareCatchUp(character.level, place, met, content);
      const threat = estimateThreat({ character, equipped, hp, areaId: id, catchUp, healing }, content, samples);
      const avoiding = estimateThreat({ character, equipped, hp, areaId: id, avoidRare: true, healing }, content, samples);
      const seeking = estimateThreat({ character, equipped, hp, areaId: id, seekRare: true, catchUp, healing }, content, samples);
      return { id, threat, threatAvoiding: lowerThreat(avoiding, threat), threatSeeking: higherThreat(seeking, threat) };
    }),
  });
}

// Szybkie Polowanie: from the level of its unlock (quick-hunts in
// data/unlocks.json), `perDay` times a day in Poland, an exploration of `minutes` in the inner region chosen,
// with the same choices as "Wyrusz", that ends as it starts, so its report
// comes with the answer (DECISIONS.md, "Szybkie Polowanie").
export async function quickHunt(context) {
  const { session, player } = await requireIdlePlayer(context);
  const rules = content.balance.quickHunt;
  if (!isUnlocked('quick-hunts', player.row.level, content)) {
    throw new ApiError(403, 'locked', `Szybkie Polowanie odblokujesz na poziomie postaci ${content.unlocksById['quick-hunts'].level}.`);
  }
  const now = context.now;
  const used = quickHuntsUsed(player.row, now);
  if (used >= rules.perDay) throw new ApiError(409, 'no_quick_hunts', 'Szybkie Polowania na dziś się skończyły. Nowe od północy.');
  const body = await readJson(context.request);
  // Potions chosen for a longer "Wyrusz" are cut to what this length takes.
  const most = potionsPerKind(rules.minutes, content);
  const asked = body.potions && typeof body.potions === 'object' && !Array.isArray(body.potions) ? body.potions : null;
  const potions = asked ? Object.fromEntries(Object.entries(asked).map(([id, count]) => [id, Number.isInteger(count) ? Math.min(count, most) : count])) : body.potions;
  const db = context.env.DB;
  await beginHunt(db, player, { ...body, potions, minutes: rules.minutes }, now, { quick: true });
  await db
    .prepare('UPDATE characters SET quick_hunts = ?, version = version + 1 WHERE id = ?')
    .bind(JSON.stringify({ day: questPeriod('daily', now, content).key, used: used + 1 }), player.row.id)
    .run();
  const { id, report } = await finishHunt(db, await loadPlayer(db, session.userId), now);
  return json({ report: { id, createdAt: now, ...report }, character: characterView(await loadPlayer(db, session.userId), now) });
}

export async function startHunt(context) {
  const { session, player } = await requireIdlePlayer(context);
  const body = await readJson(context.request);
  await beginHunt(context.env.DB, player, body, context.now);
  return json({ character: characterView(await loadPlayer(context.env.DB, session.userId), context.now) }, 201);
}

// An exploration of `minutes` in an inner region, from now on, avoiding the
// elite and the champion when asked (avoidRare) or seeking them (seekRare),
// and tracking the creatures the quests ask for (trackQuests): those living
// there are kept with it, as are the potions taken along (potions), the
// healing mark (healBelow) and a speed potion drunk before (potions.js).
// The skipped introduction sends the first one this way too (tutorial.js).
// A Szybkie Polowanie (`quick`) is over as it starts: it began `minutes`
// ago.
export async function beginHunt(db, player, { areaId, regionId, minutes, avoidRare = false, seekRare = false, trackQuests = false, potions, healBelow } = {}, now, { quick = false } = {}) {
  // regionId: "Wyrusz ponownie" from a report made before inner regions.
  const id = areaId ?? regionId;
  const area = typeof id === 'string' ? areaFor(id, player.row.level, content) : undefined;
  if (!area) throw new ApiError(400, 'invalid_area', 'Wybierz miejsce wyprawy.');
  if (!areaUnlocked(area, player.row.class_level, content)) throw areaLocked(area);
  if (!durationsUpTo(content.balance.hunt.maxMinutes, content).includes(minutes)) {
    throw new ApiError(400, 'invalid_duration', 'Wybierz czas wyprawy.');
  }
  if (typeof avoidRare !== 'boolean') throw new ApiError(400, 'invalid_avoid', 'Zaznacz albo odznacz omijanie elit i czempionów.');
  if (typeof seekRare !== 'boolean') throw new ApiError(400, 'invalid_seek', 'Zaznacz albo odznacz tropienie elit i czempionów.');
  if (avoidRare && seekRare) throw new ApiError(400, 'invalid_rare', 'Postać nie może naraz unikać i tropić elit i czempionów.');
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

  if (healBelow !== undefined && !content.potionUse.healBelowChoices.includes(healBelow)) {
    throw new ApiError(400, 'invalid_heal_below', 'Wybierz próg mikstury leczenia.');
  }
  const taken = takenPotions(player, potions, minutes);
  // A speed potion drunk before covers what it can of the exploration, and
  // that much of its time is used up (potions.js).
  const buffs = buffsOf(player.row, now);
  const speed = speedWindow(buffs, minutes);
  const options = {
    ...(Object.keys(taken).length > 0 && { potions: taken, healBelow: healBelow ?? content.potionUse.healBelow }),
    ...(speed && { speed }),
    ...(quick && { quick }),
  };
  const startsAt = quick ? now - minutes * 60000 : now;

  const { hp } = currentHp(player, now);
  const seed = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const tracked = trackQuests ? questCreatures(questsNow(player, now), area) : [];
  try {
    await db.batch([
      db
        .prepare(
          'INSERT INTO activities (character_id, kind, region_id, minutes, started_at, ends_at, seed, hp_at_start, avoid_rare, seek_rare, tracked, options) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(
          player.row.id,
          'hunt',
          area.id,
          minutes,
          startsAt,
          startsAt + minutes * 60000,
          seed,
          hp,
          avoidRare ? 1 : 0,
          seekRare ? 1 : 0,
          tracked.length > 0 ? JSON.stringify(tracked) : null,
          JSON.stringify(options),
        ),
      // The HP rested so far is saved now, so it is not counted again later.
      db
        .prepare(`UPDATE characters SET hp = ?, hp_at = ?${speed ? ', buffs = ?' : ''}, version = version + 1 WHERE id = ?`)
        .bind(hp, now, ...(speed ? [JSON.stringify(addSpeed(buffs, -speed.ms))] : []), player.row.id),
    ]);
  } catch (error) {
    if (String(error?.message).includes('constraint')) {
      throw new ApiError(409, 'busy', 'Postać jest już na wyprawie.');
    }
    throw error;
  }
}

// Calling the character back early gives nothing and costs nothing. A
// brewing keeps the potions done and an order in the Warsztat the items
// done, with their report (brewing.js, workshop.js), and a speed potion the
// time not used.
export async function cancelHunt(context) {
  const { session, player } = await requirePlayer(context);
  const activity = player.activity;
  if (!activity) throw new ApiError(409, 'no_activity', 'Postać nie jest na wyprawie.');
  if (activity.ends_at <= context.now) {
    throw new ApiError(409, 'claim_first', 'Wyprawa się skończyła. Odbierz raport.');
  }
  const db = context.env.DB;
  // A brewing or an order in the Warsztat keeps what is done.
  const stop = { potions: finishBrewing, items: finishCrafting }[activity.kind];
  if (stop) {
    const stopped = await stop(db, player, context.now, { stop: true });
    return json({
      report: stopped && { id: stopped.id, createdAt: context.now, ...stopped.report },
      character: characterView(await loadPlayer(db, session.userId), context.now),
    });
  }
  // A speed potion gets back the time the exploration did not use.
  const window = JSON.parse(activity.options ?? '{}').speed;
  const unused = window ? Math.max(0, window.ms - (context.now - activity.started_at)) : 0;
  await db.batch([
    db.prepare('DELETE FROM activities WHERE character_id = ? AND started_at = ?').bind(player.row.id, activity.started_at),
    ...(unused > 0
      ? [
          db
            .prepare('UPDATE characters SET buffs = ?, version = version + 1 WHERE id = ?')
            .bind(JSON.stringify(addSpeed(buffsOf(player.row, context.now), unused, window.bonus)), player.row.id),
        ]
      : []),
  ]);
  return json({ character: characterView(await loadPlayer(db, session.userId), context.now) });
}

// The report of the activity that ended: an exploration, a gathering of
// herbs (professions.js), a brewing of potions (brewing.js) or an order of
// items (workshop.js).
export async function claimHunt(context) {
  const { session, player } = await requirePlayer(context);
  const now = context.now;
  // The option chosen in the event at the exploration's end, if one came.
  const body = (context.request.headers.get('Content-Type') ?? '').startsWith('application/json') ? await readJson(context.request) : {};
  const finish = { herbs: finishGathering, potions: finishBrewing, items: finishCrafting }[player.activity?.kind];
  const done = finish && player.activity.ends_at <= now ? await finish(context.env.DB, player, now) : await finishHunt(context.env.DB, player, now, { choice: body.choice });
  // The event comes first: the report waits for the player's choice.
  if (done.event) return json({ event: done.event });
  const { id, report } = done;
  return json({
    report: { id, createdAt: now, ...report },
    character: characterView(await loadPlayer(context.env.DB, session.userId), now),
  });
}

// The report of a finished exploration: the engine runs it with the seed
// saved at its start, and the character gets what it brought. An event at
// its end (events.js) comes first: without `choice` only the event is
// returned ({ event }), and nothing is saved; with an option of it, the
// exploration takes the option's outcome.
export async function finishHunt(db, player, now, { choice } = {}) {
  const activity = player.activity;
  if (!activity) throw new ApiError(409, 'no_activity', 'Postać nie jest na wyprawie.');
  if (activity.ends_at > now) throw new ApiError(409, 'not_finished', 'Wyprawa jeszcze trwa.');

  const row = player.row;
  const character = engineCharacter(row);
  // region_id holds the inner region (or a whole region, from before them).
  const area = areaFor(activity.region_id, row.level, content);
  // The very first exploration, before any report, goes one way (simulateHunt).
  const first = !(await db.prepare('SELECT 1 AS found FROM reports WHERE character_id = ? LIMIT 1').bind(row.id).first());
  // The potions taken along and a speed potion's window (beginHunt).
  const options = JSON.parse(activity.options ?? '{}');
  let hunt = simulateHunt(
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
      seekRare: activity.seek_rare === 1,
      tracked: JSON.parse(activity.tracked ?? '[]'),
      // The creatures met before this exploration: it changes them only
      // when claimed, so the report comes out the same every time.
      met: JSON.parse(row.met ?? '[]'),
      potions: options.potions ?? {},
      healBelow: options.healBelow,
      speed: options.speed ?? null,
    },
    content,
  );
  // "Testuj zdarzenia" (the test version) brings its event without the draw.
  const event = eventsOn() ? eventFor({ hunt, seed: activity.seed, first, quick: options.quick === true, forced: row.event_test }, content) : null;
  if (event && choice === undefined) return { event: eventView(event) };
  if (event) {
    if (!event.options.some((option) => option.id === choice)) throw new ApiError(400, 'invalid_choice', 'Wybierz jedną z opcji.');
    hunt = resolveEvent({ hunt, event, optionId: choice, character, equipped: equippedItems(player), name: row.name, seed: activity.seed }, content);
  }
  const applied = applyHunt(character, hunt, content);
  // The potions drunk leave the bag; the bag cannot change during the
  // exploration, so they are still there.
  const drunk = Object.entries(hunt.potionsUsed);
  const potionsLeft = Object.fromEntries(
    Object.entries(potionsOf(row))
      .map(([id, count]) => [id, count - (hunt.potionsUsed[id] ?? 0)])
      .filter(([, count]) => count > 0),
  );
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
  const storedSold = sold.filter((index) => index < bag.length).map((index) => bag[index]);
  const soldStored = storedSold.map((item) => item.id);
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
  const report = {
    ...huntReport({ hunt, applied, character, areaId: area.id, startedAt: activity.started_at, endsAt: activity.ends_at, autoEquipped, overflow }, content),
    ...(options.quick && { quick: true }),
  };
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
  const storedPrice = soldStored.length > 0 ? soldGold(row.id, storedSold, sellBonus) : { sql: '0', binds: [] };
  const found = Object.entries(hunt.resources);
  const setResources = found.length
    ? `, resources = json_set(resources, ${found.map(() => '?, COALESCE(json_extract(resources, ?), 0) + ?').join(', ')})`
    : '';
  // Materials from beaten creatures, by stack ("wolf-pelt:common").
  const left = Object.entries(hunt.materials);
  // A new level heals fully, with the finds worn from now on (hpAfterHunt).
  const worn = [...equippedItems(player), ...autoEquipped.map((index) => hunt.items[index])];
  const hp = hpAfterHunt({ character, applied, hunt, equipped: worn, name: row.name }, content);
  // The creatures of every fight join those the character has met (the
  // Bestiariusz shows them by name from now on); the people of an event's
  // fight are not in the Bestiariusz.
  const met = [
    ...new Set([...JSON.parse(row.met ?? '[]'), ...hunt.fights.filter((fight) => !fight.event).flatMap((fight) => fight.enemies.map((enemy) => enemy.monsterId))]),
  ];
  // The narrator's quests count the creatures beaten, the minutes and the
  // inner regions the new class levels open. They are saved only as read,
  // so a reward claimed meanwhile is not undone.
  const opened = areasOpened(character.classLevel, applied.classLevel, content);
  const quests = JSON.stringify(addQuestProgress(questsNow(player, now), { kills: huntKills(hunt), minutes: activity.minutes, opened }));
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
             time_points = time_points + ?, hp = ?, hp_at = ?, met = ?, quests = CASE WHEN quests = ? THEN ? ELSE quests END${drunk.length > 0 ? ', potions = ?' : ''}${event ? ', event_test = NULL' : ''},
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
          ...(drunk.length > 0 ? [JSON.stringify(potionsLeft)] : []),
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

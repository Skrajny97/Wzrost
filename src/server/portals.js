// The Portale Systemu (data/portals.json, src/engine/portals.js;
// DECISIONS.md, "Portale Systemu"), from the character level of
// unlocks.json (731 A: the 5th). In each portal the character fights for
// the stage above the highest it has won there, up to its level, as often
// as it likes (the author: "niech będą nieograniczone co do ilości wejść.
// Ograniczeniem będzie trudność"), each fight with its report at once; the
// highest stage won it sweeps, its loot at once with no fight, sweeps.perDay
// times a day in each portal, from midnight in Poland ("Na czyszczenia
// (swipe'y) będzie ograniczona ilość - do 5 dziennie"). The portals pay
// only their loot and write the creatures fought into the Bestiariusz, so
// an entry may come at any time: during an exploration, before its report
// is claimed, and during work in a profession. The character fights at
// full HP with no potions and its HP stays as it was. Everything is saved
// in one batch only while the character is as read (atomic.js).

import { applyHunt, areaDangers, companionReady, companionStays, huntReport, isUnlocked, portalAmount, portalArea, portalById, portalFight, portalNext, portalSweep, questPeriod } from '../engine/index.js';
import { atomically, sameVersion } from './atomic.js';
import { characterView, engineCharacter, equippedItems, loadPlayer, requirePlayer, trophiesFor } from './characters.js';
import { content } from './content.js';
import { toHex } from './encoding.js';
import { ApiError, json, readJson } from './http.js';
import { trimReports } from './reports.js';

const rules = () => content().portals;
const path = (key) => `$."${key}"`;

function requireUnlocked(row) {
  if (!isUnlocked('portals', row.level, content())) {
    throw new ApiError(403, 'locked', `Portale odblokujesz na poziomie postaci ${content().unlocksById.portals.level}.`);
  }
}

// The character's record of the portals: the highest stage won in each,
// and the day with the sweeps made on it in each.
function recordOf(row) {
  let stored;
  try {
    stored = JSON.parse(row.portals ?? '{}');
  } catch {
    stored = {};
  }
  return { best: stored.best ?? {}, day: stored.day ?? null, swept: stored.swept ?? {} };
}

const today = (now) => questPeriod('daily', now, content()).key;

// The companions a character may take into a portal: those hired who do not
// stay in the Kwatery, a wounded one too (a portal takes nobody's HP), but
// never its Drużyna (the author: "Możliwość zabrania towarzyszy, ale w tym
// przypadku - nie drużyn").
const companionsOf = (row) => (JSON.parse(row.settlement ?? '{}').companions ?? []).filter((companion) => !companionStays(companion) && companionReady(companion, true));
const sweptToday = (record, portalId, now) => (record.day === today(now) ? (record.swept[portalId] ?? 0) : 0);

// The portals for the page: a stage's region by its levels, the last
// stage, the companions the character may take, and each portal with the
// highest stage won, the stage of its next fight (null above the
// character's level or the last stage) with what its win pays, and the
// sweeps left today with what a sweep pays.
function portalsView(row, now) {
  const record = recordOf(row);
  const { sweeps, portals } = rules();
  return {
    sweepsPerDay: sweeps.perDay,
    regions: content().areas.map((area) => ({ id: area.id, name: area.name, regionName: area.regionName, from: area.minLevel, to: area.maxLevel })),
    maxStage: rules().maxStage,
    lootMinutes: rules().lootMinutes,
    companions: companionsOf(row).map((companion) => companion.name),
    portals: portals.map((portal) => {
      const best = record.best[portal.id] ?? 0;
      const next = portalNext(best, row.level, content());
      return {
        id: portal.id,
        name: portal.name,
        description: portal.description,
        art: portal.art ?? null,
        loot: portal.loot,
        resource: portal.resource ?? null,
        part: portal.part ? content().partsById[portal.part].name : null,
        best,
        next,
        nextLoot: next === null ? null : portalAmount(portal, next, true, content()),
        sweepLoot: best > 0 ? portalAmount(portal, best, false, content()) : null,
        sweepsLeft: best > 0 ? Math.max(0, sweeps.perDay - sweptToday(record, portal.id, now)) : 0,
      };
    }),
  };
}

export async function getPortals(context) {
  const { player } = await requirePlayer(context);
  requireUnlocked(player.row);
  return json({ portals: portalsView(player.row, context.now) });
}

function portalOf(body) {
  const portal = portalById(body.portal, content());
  if (!portal) throw new ApiError(400, 'invalid_portal', 'Wybierz portal.');
  return portal;
}

// The loot into its stores: camp resources, materials and parts, each added
// to what is there, as SQL for the characters' UPDATE.
function storesSql({ resources, materials, parts }) {
  const stores = [
    ['resources', Object.entries(resources)],
    ['materials', Object.entries(materials)],
    ['parts', Object.entries(parts)],
  ].filter(([, found]) => found.length > 0);
  return {
    sql: stores.map(([column, found]) => `, ${column} = json_set(${column}, ${found.map(() => `?, COALESCE(json_extract(${column}, ?), 0) + ?`).join(', ')})`).join(''),
    binds: stores.flatMap(([, found]) => found.flatMap(([key, count]) => [path(key), path(key), count])),
  };
}

// { portal, companions }: a fight for the portal's next stage, with the
// character's companions unless `companions` is false. The report comes at
// once; the loot and the creatures met are saved with it.
export async function enterPortal(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireUnlocked(row);
  const db = context.env.DB;
  const now = context.now;
  const body = await readJson(context.request);
  const portal = portalOf(body);
  const record = recordOf(row);
  const best = record.best[portal.id] ?? 0;
  const stage = portalNext(best, row.level, content());
  if (stage === null && best >= rules().maxStage) throw new ApiError(409, 'last_stage', 'To ostatni stopień tego portalu. Kolejne przyjdą z nowymi krainami.');
  if (stage === null) throw new ApiError(409, 'level', `Kolejny stopień otworzy się na poziomie postaci ${best + 1}.`);
  const companions = body.companions === false ? [] : companionsOf(row);

  const character = engineCharacter(row);
  const area = portalArea(stage, content());
  // The Encyklopedia's trophies for the creatures of the stage's region.
  const trophies = trophiesFor(player, now, areaDangers(area, content()).map((danger) => danger.monsterId));
  const seed = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const hunt = portalFight({ character, equipped: equippedItems(player), name: row.name, portalId: portal.id, stage, first: true, seed, trophies, companions }, content());
  const { won } = hunt.portal;
  const applied = applyHunt(character, hunt, content());

  const base = huntReport({ hunt, applied, character, areaId: area.id, startedAt: now, endsAt: now }, content());
  const report = {
    ...base,
    kind: 'portal',
    resultText: hunt.portal.text,
    portal: { id: portal.id, name: portal.name, stage, level: hunt.portal.level, won, first: hunt.portal.first, loot: hunt.portal.loot, companions: hunt.portal.companions },
  };
  const summary = {
    portal: { id: portal.id, name: portal.name, stage, loot: hunt.portal.loot },
    areaName: report.areaName,
    minutes: 0,
    result: report.result,
    resultText: report.resultText,
    xp: 0,
    classXp: 0,
    penalty: 0,
    gold: hunt.gold,
    itemsFound: 0,
    resources: hunt.resources,
    materials: report.summary.materials.map(({ name, label, color, count }) => ({ name, label, color, count })),
    timePoints: 0,
    bestFind: null,
    levelAfter: row.level,
    system: report.system,
  };
  const next = { ...record, best: { ...record.best, [portal.id]: won ? stage : best } };
  // The creatures fought join those the character has met (the Bestiariusz).
  const met = [...new Set([...JSON.parse(row.met ?? '[]'), ...hunt.fights.flatMap((fight) => fight.enemies.map((enemy) => enemy.monsterId))])];
  const stores = storesSql(hunt);
  const results = await atomically(db, [
    sameVersion(db, row),
    db
      .prepare('INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(row.id, `${row.id}:portal:${seed}`, 'portal', now, JSON.stringify(summary), JSON.stringify(report)),
    trimReports(db, row.id, 'portal'),
    db
      .prepare(`UPDATE characters SET gold = gold + ?${stores.sql}, met = ?, portals = ?, version = version + 1 WHERE id = ?`)
      .bind(hunt.gold, ...stores.binds, JSON.stringify(met), JSON.stringify(next), row.id),
  ]);
  const after = await loadPlayer(db, session.userId);
  return json({
    report: { id: results[1].meta.last_row_id, createdAt: now, ...report },
    portals: portalsView(after.row, now),
    character: characterView(after, now),
  });
}

// { portal }: a sweep of the portal's highest stage won, its plain loot at
// once with no fight, while the day's sweeps last.
export async function sweepPortal(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireUnlocked(row);
  const db = context.env.DB;
  const now = context.now;
  const portal = portalOf(await readJson(context.request));
  const record = recordOf(row);
  const best = record.best[portal.id] ?? 0;
  if (best === 0) throw new ApiError(409, 'no_stage', 'Najpierw pokonaj pierwszy stopień tego portalu.');
  const swept = sweptToday(record, portal.id, now);
  if (swept >= rules().sweeps.perDay) throw new ApiError(409, 'no_sweeps', 'Czyszczenia tego portalu na dziś się skończyły. Nowe od północy.');

  const loot = portalSweep(portal.id, best, toHex(crypto.getRandomValues(new Uint8Array(16))), content());
  const day = today(now);
  const next = { ...record, day, swept: { ...(record.day === day ? record.swept : {}), [portal.id]: swept + 1 } };
  const stores = storesSql(loot);
  await atomically(db, [
    sameVersion(db, row),
    db.prepare(`UPDATE characters SET gold = gold + ?${stores.sql}, portals = ?, version = version + 1 WHERE id = ?`).bind(loot.gold, ...stores.binds, JSON.stringify(next), row.id),
  ]);
  const after = await loadPlayer(db, session.userId);
  return json({
    sweep: { portal: portal.id, stage: best, loot: loot.loot, text: loot.text },
    portals: portalsView(after.row, now),
    character: characterView(after, now),
  });
}

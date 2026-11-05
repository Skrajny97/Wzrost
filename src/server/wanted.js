// Poszukiwani in the Osada (data/settlement.json, wanted;
// src/engine/wanted.js; DECISIONS.md, "Poszukiwani"; the author's 619 B):
// the sołtys's wanted posters of the day, one in hand at a time, its target
// met on the explorations of its place (hunts.js), and the bounty claimed
// from the sołtys once it has fallen. The Osada's record keeps `wanted`:
// the day, the posters done that day and the poster taken (`beaten` once
// its target fell).

import { questPeriod, wantedOf, wantedPosters, wantedTrophy } from '../engine/index.js';
import { characterView, loadPlayer, requirePlayer, settlementBoard } from './characters.js';
import { content } from './content.js';
import { ApiError, json, readJson } from './http.js';
import { requireOpen, settlementOf, settlementView } from './settlement.js';
import { hallRecord } from './trial-hall.js';

const today = (now) => questPeriod('daily', now, content).key;

// The record for `day`: the posters done that day and the one in hand.
function recordOf(stored, day) {
  const record = stored.wanted ?? {};
  return { done: record.day === day ? (record.done ?? []) : [], taken: record.taken ?? null };
}

// A poster for the page, with its place's name and levels.
function posterView(poster, state) {
  const area = content.areasById[poster.areaId];
  return {
    id: poster.id,
    kind: poster.kind,
    areaId: poster.areaId,
    areaName: area.name,
    levels: `${area.minLevel}–${area.maxLevel}`,
    monsterId: poster.monsterId,
    name: poster.name,
    female: poster.female,
    gold: poster.gold,
    state,
  };
}

const stateOf = (poster, done, taken) => (done.includes(poster.id) ? 'done' : taken?.id === poster.id ? (taken.beaten ? 'beaten' : 'taken') : 'open');

// The posters of the day for the Osada's page, each open, taken, beaten
// (its bounty waiting) or done, and a poster of an earlier day still in
// hand; null where the game has no posters.
export function wantedView(row, stored, now) {
  const rules = wantedOf(content);
  if (!rules) return null;
  const day = today(now);
  const { done, taken } = recordOf(stored, day);
  const posters = wantedPosters(row.class_level, day, row.id, content, hallRecord(row).early).map((poster) => posterView(poster, stateOf(poster, done, taken)));
  const { meet: _a, won: _b, trophy: _c, loot: _d, ...texts } = rules.texts;
  return {
    texts,
    backdrop: rules.backdrop ?? null,
    posters,
    earlier: taken && !posters.some((poster) => poster.id === taken.id) ? posterView(taken, taken.beaten ? 'beaten' : 'taken') : null,
    holding: Boolean(taken),
  };
}

// The poster an exploration of `area` sets out with (beginHunt): the one in
// hand for that place while its target stands, with the trophy its
// variant would leave now; null otherwise.
export function wantedGoing(row, stored, area) {
  const taken = stored.wanted?.taken;
  if (!wantedOf(content) || !taken || taken.beaten || taken.areaId !== area.id) return null;
  const trophy = taken.kind === 'creature' ? wantedTrophy(taken.monsterId, JSON.parse(row.discovered ?? '{}'), content) : null;
  return { id: taken.id, kind: taken.kind, areaId: taken.areaId, monsterId: taken.monsterId, name: taken.name, female: taken.female, level: taken.level, ...(trophy && { trophy }) };
}

// The Osada's record after an exploration whose wanted target fell: the
// poster still in hand is beaten (settlementAfterHunt in hunts.js).
export function wantedAfterHunt(stored, hunt) {
  const taken = stored.wanted?.taken;
  return hunt.wanted?.beaten && taken?.id === hunt.wanted.id ? { ...stored.wanted, taken: { ...taken, beaten: true } } : null;
}

async function save(context, session, row, next, extra = { gold: 0, time: 0 }) {
  const result = await context.env.DB.prepare('UPDATE characters SET gold = gold + ?, time_points = time_points + ?, settlement = ?, version = version + 1 WHERE id = ? AND version = ?')
    .bind(extra.gold, extra.time, JSON.stringify(next), row.id, row.version)
    .run();
  if (result.meta.changes !== 1) throw new ApiError(409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.');
  const after = await loadPlayer(context.env.DB, session.userId);
  return { settlement: settlementView(after, next, settlementBoard(after.row, next, context.now), context.now), character: characterView(after, context.now) };
}

async function start(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const rules = wantedOf(content);
  if (!rules) throw new ApiError(404, 'not_found', 'Listów gończych jeszcze nie ma.');
  const day = today(context.now);
  const stored = settlementOf(row);
  return { session, row, rules, day, stored, ...recordOf(stored, day) };
}

// POST /api/settlement/wanted { posterId }: takes one of the day's posters,
// while no other is in hand.
export async function takeWanted(context) {
  const { session, row, rules, day, stored, done, taken } = await start(context);
  const body = await readJson(context.request);
  if (taken) throw new ApiError(409, 'holding', rules.texts.one);
  const poster = wantedPosters(row.class_level, day, row.id, content, hallRecord(row).early).find((one) => one.id === body.posterId);
  if (!poster || done.includes(poster.id)) throw new ApiError(404, 'no_poster', rules.texts.gone);
  return json(await save(context, session, row, { ...stored, wanted: { day, done, taken: { ...poster, beaten: false } } }));
}

// POST /api/settlement/wanted/drop: gives the poster in hand back, while
// its target still stands; a poster of the day may be taken again.
export async function dropWanted(context) {
  const { session, row, rules, day, stored, done, taken } = await start(context);
  if (!taken) throw new ApiError(409, 'not_holding', rules.texts.gone);
  if (taken.beaten) throw new ApiError(409, 'beaten', rules.texts.claimFirst);
  return json(await save(context, session, row, { ...stored, wanted: { day, done, taken: null } }));
}

// POST /api/settlement/wanted/claim: the sołtys pays the bounty of the
// poster whose target fell: its gold, the Time Points, the brotherhood's
// reputation and the relation with the sołtys; the poster is done.
export async function claimWanted(context) {
  const { session, row, rules, day, stored, done, taken } = await start(context);
  if (!taken?.beaten) throw new ApiError(409, 'not_beaten', rules.texts.notBeaten);
  const add = (points, id, gain) => ({ ...points, [id]: (points[id] ?? 0) + gain });
  const next = {
    ...stored,
    reputation: add(stored.reputation, rules.brotherhood, rules.reputation),
    relations: add(stored.relations, rules.resident, rules.relationGain),
    wanted: { day, done: taken.id.startsWith(`${day}:`) ? [...done, taken.id] : done, taken: null },
  };
  const saved = await save(context, session, row, next, { gold: taken.gold, time: rules.timePoints });
  return json({ ...saved, claimed: { gold: taken.gold, timePoints: rules.timePoints, reputation: rules.reputation } });
}

// Poszukiwani in the Osada (data/settlement.json, wanted;
// src/engine/wanted.js; DECISIONS.md, "Poszukiwani"; the author's 619 B):
// the sołtys's wanted posters of the day, one in hand at a time, its target
// met on the explorations of its place (hunts.js), and the bounty claimed
// from the sołtys once it has fallen. The Osada's record keeps `wanted`:
// the day, what the day's posters are drawn from (`basis`: the class level
// and the place the Sala prób opened, as the day's first look found them),
// the posters done that day and the poster taken (`beaten` once its target
// fell).

import { questPeriod, wantedOf, wantedPosters, wantedTrophy } from '../engine/index.js';
import { characterView, loadPlayer, requirePlayer, settlementBoard } from './characters.js';
import { content } from './content.js';
import { ApiError, json, readJson } from './http.js';
import { requireOpen, settlementOf, settlementView } from './settlement.js';
import { hallRecord } from './trial-hall.js';

const today = (now) => questPeriod('daily', now, content).key;

// The record for `day`: what its posters are drawn from, those done that
// day and the one in hand. The day's posters are those of its first look
// (wantedToKeep), so a class level or a place the Sala prób opens later that
// day hangs no new ones (the code review: a place opened after the day's
// four bounties brought more); without a basis kept for the day, it is the
// character as it is now.
function recordOf(row, stored, day) {
  const record = stored.wanted ?? {};
  const same = record.day === day;
  return {
    day,
    basis: same && record.basis ? record.basis : { classLevel: row.class_level, early: hallRecord(row).early },
    done: same ? (record.done ?? []) : [],
    taken: record.taken ?? null,
  };
}

// The day's posters, from the record's basis.
const postersOf = (row, record) => wantedPosters(record.basis.classLevel, record.day, row.id, content, record.basis.early);

// The record the Osada's first look of a day keeps (getSettlement in
// settlement.js), as the Koło Fortuny keeps its pool's basis; null when the
// day's is kept already or the game has no posters.
export function wantedToKeep(row, stored, now) {
  if (!wantedOf(content)) return null;
  const day = today(now);
  if (stored.wanted?.day === day && stored.wanted.basis) return null;
  return recordOf(row, stored, day);
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
  const record = recordOf(row, stored, today(now));
  const { done, taken } = record;
  const posters = postersOf(row, record).map((poster) => posterView(poster, stateOf(poster, done, taken)));
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
// poster still in hand is beaten (settlementAfterHunt in hunts.js). One no
// longer in hand (given back on the way, which explorations set out before
// 0.1.68 still allowed) is done for its day all the same, with no bounty, so
// it is never taken again for its target and loot once more (the code
// review); a poster of a day gone by needs no mark, as nobody takes it.
export function wantedAfterHunt(stored, hunt) {
  const sighting = hunt.wanted;
  if (!sighting?.beaten) return null;
  const record = stored.wanted ?? {};
  if (record.taken?.id === sighting.id) return { ...record, taken: { ...record.taken, beaten: true } };
  const done = record.done ?? [];
  const day = sighting.id.slice(0, sighting.id.indexOf(':'));
  return record.day === day && !done.includes(sighting.id) ? { ...record, done: [...done, sighting.id] } : null;
}

async function save(context, session, row, next, extra = { gold: 0, time: 0 }) {
  const result = await context.env.DB.prepare('UPDATE characters SET gold = gold + ?, time_points = time_points + ?, settlement = ?, version = version + 1 WHERE id = ? AND version = ?')
    .bind(extra.gold, extra.time, JSON.stringify(next), row.id, row.version)
    .run();
  if (result.meta.changes !== 1) throw new ApiError(409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.');
  const after = await loadPlayer(context.env.DB, session.userId);
  return { settlement: settlementView(after, next, settlementBoard(after.row, next, context.now), context.now), character: characterView(after, context.now) };
}

// What every request about the posters starts from: the day's record and
// the poster the character's exploration set out with (`carried`), while it
// goes on or its report waits.
async function start(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const rules = wantedOf(content);
  if (!rules) throw new ApiError(404, 'not_found', 'Listów gończych jeszcze nie ma.');
  const stored = settlementOf(row);
  const carried = player.activity?.kind === 'hunt' ? (JSON.parse(player.activity.options ?? '{}').wanted?.id ?? null) : null;
  return { session, row, rules, stored, record: recordOf(row, stored, today(context.now)), carried };
}

// POST /api/settlement/wanted { posterId }: takes one of the day's posters,
// while no other is in hand, and none other than the one an exploration
// under way set out with.
export async function takeWanted(context) {
  const { session, row, rules, stored, record, carried } = await start(context);
  const body = await readJson(context.request);
  if (record.taken) throw new ApiError(409, 'holding', rules.texts.one);
  if (carried && carried !== body.posterId) throw new ApiError(409, 'carried', rules.texts.carried);
  const poster = postersOf(row, record).find((one) => one.id === body.posterId);
  if (!poster || record.done.includes(poster.id)) throw new ApiError(404, 'no_poster', rules.texts.gone);
  return json(await save(context, session, row, { ...stored, wanted: { ...record, taken: { ...poster, beaten: false } } }));
}

// POST /api/settlement/wanted/drop: gives the poster in hand back, while
// its target still stands and no exploration under way set out with it (its
// target may come on the way: the code review); a poster of the day may be
// taken again.
export async function dropWanted(context) {
  const { session, row, rules, stored, record, carried } = await start(context);
  const { taken } = record;
  if (!taken) throw new ApiError(409, 'not_holding', rules.texts.gone);
  if (taken.beaten) throw new ApiError(409, 'beaten', rules.texts.claimFirst);
  if (carried === taken.id) throw new ApiError(409, 'carried', rules.texts.carried);
  return json(await save(context, session, row, { ...stored, wanted: { ...record, taken: null } }));
}

// POST /api/settlement/wanted/claim: the sołtys pays the bounty of the
// poster whose target fell: its gold, the Time Points, the brotherhood's
// reputation and the relation with the sołtys; the poster is done.
export async function claimWanted(context) {
  const { session, row, rules, stored, record } = await start(context);
  const { day, done, taken } = record;
  if (!taken?.beaten) throw new ApiError(409, 'not_beaten', rules.texts.notBeaten);
  const add = (points, id, gain) => ({ ...points, [id]: (points[id] ?? 0) + gain });
  const next = {
    ...stored,
    reputation: add(stored.reputation, rules.brotherhood, rules.reputation),
    relations: add(stored.relations, rules.resident, rules.relationGain),
    wanted: { ...record, done: taken.id.startsWith(`${day}:`) ? [...done, taken.id] : done, taken: null },
  };
  const saved = await save(context, session, row, next, { gold: taken.gold, time: rules.timePoints });
  return json({ ...saved, claimed: { gold: taken.gold, timePoints: rules.timePoints, reputation: rules.reputation } });
}

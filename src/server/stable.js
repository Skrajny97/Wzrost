// The Stajnia in the Osada (327 A; stable.js in the engine): Mirosław the
// koniuszy sells mounts for good, one stage after another, and the mount
// shortens the wait of every exploration of the character's own (beginHunt
// in hunts.js). The stage is kept in the character's Osada (`mount` in
// characters.settlement, settlementOf), so it needs no table of its own.
// Each mount bought raises the relation with Mirosław; the Stajnia gives no
// brotherhood's reputation (the author named none).

import { mountBlock, mountOf, mountStage } from '../engine/index.js';
import { content } from './content.js';
import { characterView, loadPlayer, requirePlayer, settlementBoard } from './characters.js';
import { ApiError, json, readJson } from './http.js';
import { requireOpen, settlementOf, settlementView } from './settlement.js';

// The Stajnia for the page: the stage of the character's mount (0 for
// none) and every mount with its stage, name, words, share of the wait, price
// and level.
export function stableView(stored) {
  const { stable } = content().settlement;
  if (!stable) return null;
  return {
    stage: mountStage(stored, content()),
    mounts: stable.mounts.map((mount, index) => ({ stage: index + 1, ...mount })),
  };
}

// { stage }: Mirosław sells the next mount, for gold, from its level, in
// place of the one the character has; the relation with him grows. Also
// while the character is away: the mount waits for the next exploration,
// as the one going on keeps its end.
export async function buyMount(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireOpen(row);
  const body = await readJson(context.request);
  const stored = settlementOf(row);
  const block = mountBlock(body.stage, mountStage(stored, content()), { level: row.level, gold: row.gold }, content());
  if (block) {
    const status = { invalid_mount: 400, locked: 403 }[block.code] ?? 409;
    throw new ApiError(status, block.code, block.message);
  }
  const mount = mountOf(body.stage, content());
  const { resident, relationGain } = content().settlement.stable;
  const next = { ...stored, mount: body.stage, relations: { ...stored.relations, [resident]: (stored.relations[resident] ?? 0) + relationGain } };
  const db = context.env.DB;
  const result = await db
    .prepare('UPDATE characters SET gold = gold - ?, settlement = ?, version = version + 1 WHERE id = ? AND version = ? AND gold >= ?')
    .bind(mount.gold, JSON.stringify(next), row.id, row.version, mount.gold)
    .run();
  if (result.meta.changes !== 1) throw new ApiError(409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.');
  const after = await loadPlayer(db, session.userId);
  return json({
    bought: { stage: body.stage, name: mount.name, shorter: mount.shorter, gold: mount.gold },
    settlement: settlementView(after, next, settlementBoard(after.row, next, context.now), context.now),
    character: characterView(after, context.now),
  });
}

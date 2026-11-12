// The Rdzeń and its Artefakty (src/engine/core.js, data/labyrinth.json,
// core; DECISIONS.md, "Labirynt Systemu i Rdzeń", 858–865), where the
// Labirynt is on (features.js), once the character has beaten its first
// guardian of the Labirynt (labyrinth.js). The Artefakty it has not absorbed
// wait in its Skrytka Rdzenia (core_artifacts, migration 0123), with no
// limit and out of the bag; those absorbed, its Odłamki and its gem are kept
// in the character's row (`core`, coreOf in characters.js). Absorbing,
// dissolving and upgrading an absorbed Artefakt change what the character's
// fights are counted with, so they wait while it is on an exploration or
// serves as a mercenary, as its gear does (requireNotExploring); upgrading
// and breaking one in the Skrytka can come at any time. The Artefakty and
// the Odłamki are the character's own (865 A): no Targowisko, Wymiana or
// Skrzynia Konta takes them. Everything is saved in one batch only while
// the character is as read (atomic.js).

import { artifactUpgradeCost, artifactView, breakShards, coreEffectLines, coreEffects, coreGemBonus, coreSockets, dissolveShards, freeSockets, gemView, knownArtifact, resonanceView, upgradedArtifact } from '../engine/index.js';
import { assertion, atomically, sameVersion } from './atomic.js';
import { characterView, coreOf, loadPlayer, requireNotExploring, requirePlayer } from './characters.js';
import { content } from './content.js';
import { labyrinthOn } from './features.js';
import { ApiError, json, readJson } from './http.js';

// Off, the Rdzeń's routes are not there; shut, it says so as the page does.
function requireCore(row) {
  if (!labyrinthOn() || !content().labyrinth) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  if (!coreOf(row).open) throw new ApiError(403, 'locked', content().unlocksById.core.locked ?? 'Rdzeń jest jeszcze zamknięty.');
}

// The Artefakty of the Skrytka, the oldest first, each with its own id.
export async function storedArtifacts(db, characterId) {
  const { results } = await db.prepare('SELECT id, data FROM core_artifacts WHERE character_id = ? ORDER BY id').bind(characterId).all();
  return results.map((row) => ({ ...JSON.parse(row.data), id: row.id })).filter((artifact) => knownArtifact(artifact, content()));
}

// An Artefakt's row of the Skrytka (its data without the id).
export const artifactData = (artifact) => {
  const { id: _, ...data } = artifact;
  return JSON.stringify(data);
};

// The Rdzeń for its tab: the sockets (all, free), the Odłamki, the gem with
// its bonus, the Artefakty absorbed and those of the Skrytka as the page
// shows them (with the gem's bonus on the absorbed ones' numbers), the
// resonance of their elements and what it all gives together.
export function coreView(row, stored) {
  const core = coreOf(row);
  const gem = coreGemBonus(core.gem, content());
  const effects = coreEffects(core, row.class_id, content());
  return {
    open: core.open,
    sockets: coreSockets(row.level, content()),
    free: freeSockets(core, row.level, content()),
    perSockets: content().labyrinth.core.sockets.per,
    shards: core.shards,
    gem: gemView(core.gem, content()),
    absorbed: core.absorbed.map((artifact) => artifactView(artifact, content(), gem)),
    stored: stored.map((artifact) => artifactView(artifact, content())),
    resonance: resonanceView(core.absorbed, content()),
    resonanceCounts: content().labyrinth.core.resonance.counts,
    effects: coreEffectLines(effects, content()),
  };
}

export async function getCore(context) {
  const { player } = await requirePlayer(context);
  requireCore(player.row);
  const db = context.env.DB;
  return json({ core: coreView(player.row, await storedArtifacts(db, player.row.id)) });
}

// The id of an Artefakt a request names.
function artifactId(body) {
  if (!Number.isSafeInteger(body.id) || body.id <= 0) throw new ApiError(400, 'invalid_artifact', 'Wybierz Artefakt.');
  return body.id;
}

const notFound = () => new ApiError(404, 'artifact_not_found', 'Nie masz tego Artefaktu.');

// The row's `core` saved with the Rdzeń given, the version moved on, while
// the character is as read; and the page's answer after it.
async function saved(context, session, player, statements) {
  const db = context.env.DB;
  await atomically(db, [sameVersion(db, player.row), ...statements]);
  const after = await loadPlayer(db, session.userId);
  return json({ core: coreView(after.row, await storedArtifacts(db, after.row.id)), character: characterView(after, context.now) });
}

const setCore = (db, row, core) => db.prepare('UPDATE characters SET core = ?, version = version + 1 WHERE id = ?').bind(JSON.stringify(core), row.id);

// { id }: an Artefakt of the Skrytka absorbed into free sockets, for good
// (until dissolved).
export async function absorbArtifact(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireCore(row);
  requireNotExploring(player, context.now);
  const id = artifactId(await readJson(context.request));
  const db = context.env.DB;
  const artifact = (await storedArtifacts(db, row.id)).find((one) => one.id === id);
  if (!artifact) throw notFound();
  const core = coreOf(row);
  const sockets = content().labyrinth.core.sizes.find((size) => size.id === artifact.size)?.sockets ?? 1;
  if (freeSockets(core, row.level, content()) < sockets) {
    throw new ApiError(409, 'no_sockets', `Ten Artefakt potrzebuje wolnych gniazd: ${sockets}. Rozpuść inny albo zdobądź kolejne gniazda poziomami postaci.`);
  }
  const next = { ...core, absorbed: [...core.absorbed, artifact] };
  return saved(context, session, player, [
    assertion(db, 'EXISTS (SELECT 1 FROM core_artifacts WHERE id = ? AND character_id = ?)', [id, row.id]),
    db.prepare('DELETE FROM core_artifacts WHERE id = ? AND character_id = ?').bind(id, row.id),
    setCore(db, row, next),
  ]);
}

// { id }: an Artefakt one level of upgrade higher for its Odłamki (862 A),
// in the Skrytka or absorbed (then not on an exploration).
export async function upgradeArtifact(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireCore(row);
  const id = artifactId(await readJson(context.request));
  const db = context.env.DB;
  const core = coreOf(row);
  const absorbed = core.absorbed.find((one) => one.id === id);
  const artifact = absorbed ?? (await storedArtifacts(db, row.id)).find((one) => one.id === id);
  if (!artifact) throw notFound();
  if (absorbed) requireNotExploring(player, context.now);
  const cost = artifactUpgradeCost(artifact, content());
  if (cost === null) throw new ApiError(409, 'max_upgrade', 'Ten Artefakt jest już ulepszony do końca.');
  if (core.shards < cost) throw new ApiError(409, 'no_shards', `Brakuje Odłamków Rdzenia: potrzeba ${cost}, masz ${core.shards}.`);
  const upgraded = upgradedArtifact(artifact, content());
  if (absorbed) {
    const next = { ...core, shards: core.shards - cost, absorbed: core.absorbed.map((one) => (one.id === id ? upgraded : one)) };
    return saved(context, session, player, [setCore(db, row, next)]);
  }
  return saved(context, session, player, [
    assertion(db, 'EXISTS (SELECT 1 FROM core_artifacts WHERE id = ? AND character_id = ?)', [id, row.id]),
    db.prepare('UPDATE core_artifacts SET data = ? WHERE id = ? AND character_id = ?').bind(artifactData(upgraded), id, row.id),
    setCore(db, row, { ...core, shards: core.shards - cost }),
  ]);
}

// { id }: an absorbed Artefakt dissolved (859 A): it is gone, its sockets
// free, and half of the Odłamki spent on upgrading it come back.
export async function dissolveArtifact(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireCore(row);
  requireNotExploring(player, context.now);
  const id = artifactId(await readJson(context.request));
  const core = coreOf(row);
  const artifact = core.absorbed.find((one) => one.id === id);
  if (!artifact) throw notFound();
  const next = { ...core, shards: core.shards + dissolveShards(artifact, content()), absorbed: core.absorbed.filter((one) => one.id !== id) };
  return saved(context, session, player, [setCore(context.env.DB, row, next)]);
}

// { id }: an Artefakt of the Skrytka broken into Odłamki (862 A): its
// rarity's for each of its sockets, and half of those spent on upgrading it.
export async function breakArtifact(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireCore(row);
  const id = artifactId(await readJson(context.request));
  const db = context.env.DB;
  const artifact = (await storedArtifacts(db, row.id)).find((one) => one.id === id);
  if (!artifact) throw notFound();
  const core = coreOf(row);
  return saved(context, session, player, [
    assertion(db, 'EXISTS (SELECT 1 FROM core_artifacts WHERE id = ? AND character_id = ?)', [id, row.id]),
    db.prepare('DELETE FROM core_artifacts WHERE id = ? AND character_id = ?').bind(id, row.id),
    setCore(db, row, { ...core, shards: core.shards + breakShards(artifact, content()) }),
  ]);
}

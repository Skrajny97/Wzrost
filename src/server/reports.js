// The journal: past reports of the player's character, of explorations, of
// gatherings, of brewing and of the Warsztat (`kind`: hunt, herbs, potions
// or items).

import { requirePlayer } from './characters.js';
import { ApiError, json } from './http.js';

// The journal shows the newest reports, and the claim of a hunt removes older ones.
export const KEPT_REPORTS = 50;

export async function listReports(context) {
  const { player } = await requirePlayer(context);
  const { results } = await context.env.DB.prepare(
    'SELECT id, kind, created_at, summary FROM reports WHERE character_id = ? ORDER BY id DESC LIMIT ?',
  )
    .bind(player.row.id, KEPT_REPORTS)
    .all();
  return json({
    reports: results.map((row) => ({ id: row.id, kind: row.kind, createdAt: row.created_at, ...JSON.parse(row.summary) })),
  });
}

export async function getReport(context) {
  const { player } = await requirePlayer(context);
  const id = Number(context.params.id);
  const notFound = new ApiError(404, 'report_not_found', 'Nie ma takiego raportu.');
  if (!Number.isSafeInteger(id)) throw notFound;
  const row = await context.env.DB.prepare('SELECT id, created_at, data FROM reports WHERE id = ? AND character_id = ?')
    .bind(id, player.row.id)
    .first();
  if (!row) throw notFound;
  return json({ report: { id: row.id, createdAt: row.created_at, ...JSON.parse(row.data) } });
}

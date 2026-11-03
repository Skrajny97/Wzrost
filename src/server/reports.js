// The journal: past reports of the player's character, of explorations, of
// gatherings, of brewing, of the Warsztat and of the Wieże (`kind`: hunt,
// herbs, potions, items or tower).

import { requirePlayer } from './characters.js';
import { content } from './content.js';
import { ApiError, json } from './http.js';

// The journal keeps the newest reports of the Wieże and, apart from them,
// the newest of everything else (explorations and professions), each group
// up to its own number (balance.json, journal), so fights in the towers do
// not push the explorations out (the author: 486 A).
const TOWER = "kind = 'tower'";
const OTHER = "kind <> 'tower'";
const groups = () => [
  { where: OTHER, kept: content.balance.journal.reports },
  { where: TOWER, kept: content.balance.journal.towerReports },
];

// The statement that removes the character's reports of the group of
// `kind` beyond those the journal keeps, for the batch that saves a new
// one: a report keeps every fight (about 40 KB for 4 hours), so only those
// the journal shows stay.
export function trimReports(db, characterId, kind) {
  const { where, kept } = groups()[kind === 'tower' ? 1 : 0];
  return db
    .prepare(`DELETE FROM reports WHERE character_id = ? AND ${where} AND id NOT IN (SELECT id FROM reports WHERE character_id = ? AND ${where} ORDER BY id DESC LIMIT ?)`)
    .bind(characterId, characterId, kept);
}

export async function listReports(context) {
  const { player } = await requirePlayer(context);
  const newest = groups().map(({ where }) => `SELECT * FROM (SELECT id, kind, created_at, summary FROM reports WHERE character_id = ? AND ${where} ORDER BY id DESC LIMIT ?)`);
  const { results } = await context.env.DB.prepare(`${newest.join(' UNION ALL ')} ORDER BY id DESC`)
    .bind(...groups().flatMap(({ kept }) => [player.row.id, kept]))
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

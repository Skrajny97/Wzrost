// The journal: past reports of the player's character, of explorations, of
// gatherings, of brewing, of the Warsztat, of the Wieże, of the Portale and
// of the Labirynt Systemu (`kind`: hunt, herbs, potions, items, tower,
// portal or labyrinth).

import { gemView } from '../engine/index.js';
import { partyReportOf, requirePlayer } from './characters.js';
import { content } from './content.js';
import { ApiError, json } from './http.js';

// The journal keeps the newest reports of the Wieże, apart from them those
// of the Portale, and apart from both the newest of everything else
// (explorations and professions), each group up to its own number
// (balance.json, journal), so fights in the towers and the Portale do not
// push the explorations out (the author: 486 A).
// The Labirynt's fights have their own share too (data/labyrinth.json,
// reportsKept).
const TOWER = "kind = 'tower'";
const PORTAL = "kind = 'portal'";
const LABYRINTH = "kind = 'labyrinth'";
const OTHER = "kind NOT IN ('tower', 'portal', 'labyrinth')";
const groups = () => [
  { where: OTHER, kept: content().balance.journal.reports },
  { where: TOWER, kept: content().balance.journal.towerReports },
  { where: PORTAL, kept: content().balance.journal.portalReports },
  { where: LABYRINTH, kept: content().labyrinth?.reportsKept ?? 40 },
];
const GROUP_OF = { tower: 1, portal: 2, labyrinth: 3 };

// The statement that removes the character's reports of the group of
// `kind` beyond those the journal keeps, for the batch that saves a new
// one: a report keeps every fight (about 40 KB for 4 hours), so only those
// the journal shows stay.
export function trimReports(db, characterId, kind) {
  const { where, kept } = groups()[GROUP_OF[kind] ?? 0];
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

// The shared report of a Drużyna's trip that another claimed for the whole
// party (hunts.js: claimTrip), opened: no longer marked on the Walka.
const reportSeen = (db, characterId, id) =>
  db.prepare("UPDATE characters SET party_report = NULL WHERE id = ? AND json_extract(party_report, '$.id') = ?").bind(characterId, id).run();

// That shared report, opened at a claim of the character with nothing to
// claim (a Walka from before the claim, or a claim at the same moment as
// another's): as the claim's answer gives a report, or null without one.
export async function openPartyReport(db, row) {
  const waiting = row && partyReportOf(row);
  if (!waiting) return null;
  const kept = await db.prepare('SELECT id, created_at, data FROM reports WHERE id = ? AND character_id = ?').bind(waiting.id, row.id).first();
  await reportSeen(db, row.id, waiting.id);
  return kept ? { id: kept.id, createdAt: kept.created_at, ...JSON.parse(kept.data) } : null;
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
  if (partyReportOf(player.row)?.id === id) await reportSeen(context.env.DB, player.row.id, id);
  const report = JSON.parse(row.data);
  // A setting's item keeps its card as it was made, and the card opens when
  // the item is no longer there as it was. Its gem is told as now (gemView):
  // one set before 0.1.77 was kept without its line and what it means, which
  // the card reads (the code review of 0.1.77).
  const item = report.set?.item;
  if (item?.gem) report.set = { ...report.set, item: { ...item, gem: gemView(item.gem.id, content()) } };
  return json({ report: { id: row.id, createdAt: row.created_at, ...report } });
}

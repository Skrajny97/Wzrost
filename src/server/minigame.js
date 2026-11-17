// The mini-game at a work's report on server time (src/engine/minigame.js;
// 1006, accepted on 16.11.2026): "Odbierz raport" of a finished work begins
// its game here, once, its time kept with the work; the claim then brings
// the times of the taps, and the server finds the hits from the work's seed
// and that time. A work claimed without its game begun gets none.

import { MINIGAME_KINDS, minigameChallenge, minigameHits, minigameLine, minigameResult } from '../engine/index.js';
import { content } from './content.js';
import { avatarAsked, avatarWorkOf, requirePlayer, workTable } from './characters.js';
import { ApiError, json, readJson } from './http.js';

// Whether a work has a mini-game: the works of MINIGAME_KINDS, but an order
// of scrolls in the Warsztat and the setting of a gem in the Szlifiernia,
// which have no rarity to raise.
function hasMinigame(activity) {
  if (!content().minigame || !activity || !MINIGAME_KINDS.includes(activity.kind)) return false;
  const options = JSON.parse(activity.options ?? '{}');
  return !(activity.kind === 'items' && options.scroll) && !(activity.kind === 'jewels' && options.set);
}

// POST /api/minigame { avatar? }: the mini-game of the work that ended, the
// character's or, with `avatar`, the Awatar's (true) or the second Awatar's
// (2, 1066), begun now, or as it began if
// it did already (one game for one work, its zones from the work's seed):
// the zones, the marker's period, when it began on the server's clock, and
// its words.
export async function startMinigame(context) {
  const body = await readJson(context.request);
  const { player } = await requirePlayer(context);
  const avatar = avatarAsked(body);
  const activity = avatar ? avatarWorkOf(player, avatar) : player.activity;
  const rules = content().minigame;
  if (!hasMinigame(activity)) throw new ApiError(409, 'no_minigame', 'Ta praca nie ma minigry.');
  if (activity.ends_at > context.now) throw new ApiError(409, 'not_finished', 'Praca jeszcze trwa.');
  const table = workTable(avatar);
  const db = context.env.DB;
  let at = JSON.parse(activity.options ?? '{}').minigame?.at;
  if (typeof at !== 'number') {
    // Two starts at once keep the first one's time.
    await db
      .prepare(`UPDATE ${table} SET options = json_set(COALESCE(options, '{}'), '$.minigame', json(?)) WHERE character_id = ? AND started_at = ? AND json_extract(COALESCE(options, '{}'), '$.minigame') IS NULL`)
      .bind(JSON.stringify({ at: context.now }), player.row.id, activity.started_at)
      .run();
    const stored = await db.prepare(`SELECT json_extract(options, '$.minigame.at') AS at FROM ${table} WHERE character_id = ? AND started_at = ?`).bind(player.row.id, activity.started_at).first();
    if (typeof stored?.at !== 'number') throw new ApiError(409, 'no_minigame', 'Ta praca nie ma minigry.');
    at = stored.at;
  }
  return json({ minigame: { kind: activity.kind, at, ...minigameChallenge(activity.seed, content()), pause: rules.pause, ...rules.kinds[activity.kind], shares: rules.shares, rarity: rules.rarity, texts: rules.texts } });
}

// What the claim's mini-game (`played`: { taps }, ms after the game began
// for each try, or { skip: true }) gives the work `activity` as read: null
// while its game was never begun, skipped or claimed without it (from the
// Dziennik, the top bar), else its hits, what they give (minigameResult)
// and the report's line.
export function minigameOutcome(activity, played, now) {
  if (!hasMinigame(activity) || !played || typeof played !== 'object' || played.skip === true) return null;
  const taps = played.taps;
  const at = JSON.parse(activity.options ?? '{}').minigame?.at;
  if (typeof at !== 'number') return null;
  // A page from 0.3.93 on stands the marker still after each tap (1022)
  // and says so; one from before does not.
  const pause = played.pause === content().minigame.pause ? content().minigame.pause : 0;
  const hits = minigameHits(taps, minigameChallenge(activity.seed, content()), now - at, content(), pause);
  const result = minigameResult(activity.kind, hits, content());
  return { ...result, line: minigameLine(result, content()) };
}

// A report with its mini-game: the game's line first among the System's.
export const withMinigame = (report, outcome) => (outcome ? { ...report, minigame: { hits: outcome.hits, tries: outcome.tries, bonus: outcome.bonus }, system: [outcome.line, ...(report.system ?? [])] } : report);

// "Zgłoś błąd" in the settings (the author: "Trzeba dodac przycisk Zgłoś
// błąd i zeby przychodzil mi w Panel Autora"): a player writes what went
// wrong, and the game adds where they were (the screen), its version, the
// phone and the character as it is now. The report waits in the author's
// panel (author.js) until marked done. A few a day per account, so that
// no one floods the panel.

import { content } from './content.js';
import { ApiError, json, readJson } from './http.js';
import { requireSession } from './sessions.js';

const DAY = 24 * 3600000;
export const BUG_REPORTS = { shortest: 10, longest: 2000, daily: 5 };

export async function reportBug(context) {
  const session = await requireSession(context);
  const body = await readJson(context.request);
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (text.length < BUG_REPORTS.shortest) throw new ApiError(400, 'too_short', `Opisz błąd w co najmniej ${BUG_REPORTS.shortest} znakach.`);
  if (text.length > BUG_REPORTS.longest) throw new ApiError(400, 'too_long', `Zgłoszenie może mieć najwyżej ${BUG_REPORTS.longest} znaków.`);
  const db = context.env.DB;
  const sent = await db.prepare('SELECT COUNT(*) AS count FROM bug_reports WHERE user_id = ? AND created_at > ?').bind(session.userId, context.now - DAY).first();
  if (sent.count >= BUG_REPORTS.daily) throw new ApiError(429, 'too_many', `Na dziś to już ${BUG_REPORTS.daily} zgłoszeń. Kolejne można wysłać jutro.`);
  const character = await db
    .prepare("SELECT id, name, class_id, level, class_level FROM characters WHERE user_id = ? AND role = 'player'")
    .bind(session.userId)
    .first();
  const screen = typeof body.screen === 'string' ? body.screen.slice(0, 120) : null;
  const device = (context.request.headers.get('user-agent') ?? '').slice(0, 300) || null;
  await db
    .prepare('INSERT INTO bug_reports (user_id, character_id, character, text, screen, version, device, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(
      session.userId,
      character?.id ?? null,
      character ? `${character.name} · ${content.classesById[character.class_id]?.name ?? character.class_id}, poziom ${character.level}, klasa ${character.class_level}` : null,
      text,
      screen,
      String(context.env.APP_VERSION ?? 'dev'),
      device,
      context.now,
    )
    .run();
  return json({ ok: true }, 201);
}

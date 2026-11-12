// "Zgłoś błąd" in the settings (the author: "Trzeba dodac przycisk Zgłoś
// błąd i zeby przychodzil mi w Panel Autora"): a player writes what went
// wrong, and the game adds where they were (the screen), its version, the
// phone, the state of its notifications there (`details`, pushDiagnosis in
// src/client/push.js) and the character as it is now. The report waits in the author's
// panel (author.js) until marked done. A few a day per account, so that
// no one floods the panel.

import { contentIn } from './content.js';
import { ApiError, json, readForm, readJson } from './http.js';
import { requireSession } from './sessions.js';

const DAY = 24 * 3600000;
export const BUG_REPORTS = { shortest: 10, longest: 2000, daily: 5 };
// A screenshot with the report (the author: "daj opcje dołączania screena
// w zgłoś błąd"): one picture of at most `most` bytes (a D1 value holds
// 2 MB), sent as a form with the report's words (`form` bytes in all). The
// page shrinks it to about 700 KB first (src/client/screenshot.js).
export const BUG_IMAGE = { most: 1024 * 1024, form: 1024 * 1024 + 16 * 1024 };

const imageTooLarge = () => new ApiError(413, 'image_too_large', 'Zrzut ekranu jest za duży: może mieć najwyżej 1 MB.');
const notAnImage = () => new ApiError(400, 'invalid_image', 'Dołączony plik nie jest obrazkiem. Wybierz zrzut ekranu w formacie JPG, PNG lub WebP.');

// The picture's kind by its first bytes, never by what the phone says.
function imageType(bytes) {
  const has = (at, ...values) => values.every((value, index) => bytes[at + index] === value);
  if (has(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (has(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  // "RIFF", the length, "WEBP".
  if (has(0, 0x52, 0x49, 0x46, 0x46) && has(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  return null;
}

// The report's words, as JSON, or as a form with the picture; the picture
// is checked whole before anything is saved.
async function readReport(request) {
  if (!(request.headers.get('Content-Type') ?? '').toLowerCase().startsWith('multipart/form-data')) {
    return { body: await readJson(request), image: null };
  }
  const form = await readForm(request, BUG_IMAGE.form, imageTooLarge());
  const body = { text: form.get('text'), screen: form.get('screen'), details: form.get('details') };
  const file = form.get('image');
  // A form without a picture, or with an empty one, is a report without it.
  if (file === null || file === '' || (typeof file !== 'string' && file.size === 0)) return { body, image: null };
  if (typeof file === 'string') throw notAnImage();
  if (file.size > BUG_IMAGE.most) throw imageTooLarge();
  const data = await file.arrayBuffer();
  const type = imageType(new Uint8Array(data, 0, Math.min(12, data.byteLength)));
  if (!type) throw notAnImage();
  return { body, image: { type, data } };
}

export async function reportBug(context) {
  const session = await requireSession(context);
  const { body, image } = await readReport(context.request);
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (text.length < BUG_REPORTS.shortest) throw new ApiError(400, 'too_short', `Opisz błąd w co najmniej ${BUG_REPORTS.shortest} znakach.`);
  if (text.length > BUG_REPORTS.longest) throw new ApiError(400, 'too_long', `Zgłoszenie może mieć najwyżej ${BUG_REPORTS.longest} znaków.`);
  // A picture only from an account with its e-mail confirmed, so that new
  // accounts made for it cannot fill the database with pictures (review of
  // 12.11.2026); the words go from any account, also about the mail itself.
  if (image && session.user.emailRequired && !session.user.emailConfirmed) {
    throw new ApiError(403, 'email_unconfirmed', 'Zrzut ekranu dołączysz po potwierdzeniu adresu e-mail. Samo zgłoszenie możesz wysłać już teraz.');
  }
  const db = context.env.DB;
  const tooMany = () => new ApiError(429, 'too_many', `Na dziś to już ${BUG_REPORTS.daily} zgłoszeń. Kolejne można wysłać jutro.`);
  const sent = await db.prepare('SELECT COUNT(*) AS count FROM bug_reports WHERE user_id = ? AND created_at > ?').bind(session.userId, context.now - DAY).first();
  if (sent.count >= BUG_REPORTS.daily) throw tooMany();
  const character = await db
    .prepare("SELECT id, name, class_id, level, class_level FROM characters WHERE user_id = ? AND role = 'player'")
    .bind(session.userId)
    .first();
  const screen = typeof body.screen === 'string' ? body.screen.slice(0, 120) : null;
  const device = (context.request.headers.get('user-agent') ?? '').slice(0, 300) || null;
  const details = typeof body.details === 'string' ? body.details.slice(0, 500) || null : null;
  // The day's count is checked again in the statement that writes, so
  // reports sent at once cannot all pass the count read above.
  const report = db
    .prepare(
      `INSERT INTO bug_reports (user_id, character_id, character, text, screen, version, device, created_at, details)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?11
       WHERE (SELECT COUNT(*) FROM bug_reports WHERE user_id = ?1 AND created_at > ?9) < ?10`,
    )
    .bind(
      session.userId,
      character?.id ?? null,
      // For the author's panel, in Polish whatever the player's language.
      character ? `${character.name} · ${contentIn('pl').classesById[character.class_id]?.name ?? character.class_id}, poziom ${character.level}, klasa ${character.class_level}` : null,
      text,
      screen,
      String(context.env.APP_VERSION ?? 'dev'),
      device,
      context.now,
      context.now - DAY,
      BUG_REPORTS.daily,
      details,
    );
  // The report and its picture together or not at all (a batch is one
  // transaction): the picture goes with the report just written, and with
  // none when the day's count kept it out.
  const statements = image
    ? [
        report,
        db
          .prepare('INSERT INTO bug_report_images (report_id, type, data, created_at) SELECT last_insert_rowid(), ?, ?, ? WHERE changes() = 1')
          .bind(image.type, image.data, context.now),
      ]
    : [report];
  const [written] = await db.batch(statements);
  if (written.meta.changes !== 1) throw tooMany();
  return json({ ok: true }, 201);
}

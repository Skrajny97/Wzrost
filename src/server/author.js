// The author's panel: how many accounts and characters the game has, and
// every account with its e-mail, its character, its silence in the chat and
// whether it moderates the chat. Only the author's account
// sees it (AUTHOR_LOGINS in wrangler.jsonc), and only once it is bound to
// Google, so that no password opens it (accounts.js); anyone else gets "not
// found". The e-mail is the one Google confirmed: an account made with
// Google has it from the start, one linked later from the link or its next
// Google sign-in (google.js).

import { skillDemo } from '../engine/index.js';
import { content } from './content.js';
import { ApiError, json } from './http.js';
import { requireSession } from './sessions.js';

const DAY = 24 * 3600000;

export function isAuthor(env, user) {
  const logins = String(env.AUTHOR_LOGINS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(user?.google) && logins.includes(String(user.login).toLowerCase());
}

export async function authorPanel(context) {
  const session = await requireSession(context);
  if (!isAuthor(context.env, session.user)) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  const db = context.env.DB;
  const since = context.now - DAY;
  const [counts, rows] = await db.batch([
    db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM users) AS accounts,
           (SELECT COUNT(*) FROM users WHERE google_sub IS NOT NULL) AS google,
           (SELECT COUNT(*) FROM users WHERE created_at >= ?) AS new_accounts,
           (SELECT COUNT(*) FROM characters WHERE role = 'player') AS characters,
           (SELECT COUNT(*) FROM characters WHERE role = 'player' AND created_at >= ?) AS new_characters`,
      )
      .bind(since, since),
    db.prepare(
      `SELECT u.login, u.email, u.google_sub IS NOT NULL AS google, u.email_confirmed_at IS NOT NULL AS email_confirmed, u.created_at, u.chat_muted_until, u.chat_moderator,
         c.name, c.class_id, c.level, c.class_level, c.created_at AS character_created_at
       FROM users u LEFT JOIN characters c ON c.user_id = u.id AND c.role = 'player'
       ORDER BY u.created_at DESC, u.id DESC
       LIMIT 1000`,
    ),
  ]);
  const total = counts.results[0];
  return json({
    counts: {
      accounts: total.accounts,
      google: total.google,
      newAccounts: total.new_accounts,
      characters: total.characters,
      newCharacters: total.new_characters,
    },
    accounts: rows.results.map((row) => ({
      login: row.login,
      email: row.email,
      google: Boolean(row.google),
      // Confirmed with the link, or by Google (sessions.js).
      emailConfirmed: Boolean(row.google) || Boolean(row.email_confirmed),
      createdAt: row.created_at,
      character: row.name && {
        name: row.name,
        className: content.classesById[row.class_id]?.name ?? row.class_id,
        level: row.level,
        classLevel: row.class_level,
        createdAt: row.character_created_at,
      },
      // The chat (chat.js): until when the account may not write, and
      // whether it moderates.
      chatMutedUntil: row.chat_muted_until > context.now ? row.chat_muted_until : null,
      chatModerator: row.chat_moderator === 1,
    })),
  });
}

// The author's preview of the skills: every skill with its class, and a short
// recorded fight that shows one of them (skill-demo.js), for the arena.
export async function authorSkills(context) {
  const session = await requireSession(context);
  if (!isAuthor(context.env, session.user)) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  return json({
    skills: [
      ...content.skills.map((skill) => ({ id: skill.id, name: skill.name, style: skill.style, className: content.classesById[skill.classId].name })),
      // The evolutions' skills, under the evolution's name and its class's.
      ...content.evolutionSkills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        style: skill.style,
        className: `${content.evolutionsById[skill.evolution].name} (${content.classesById[skill.classId].name})`,
      })),
    ],
  });
}

export async function authorSkillDemo(context) {
  const session = await requireSession(context);
  if (!isAuthor(context.env, session.user)) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  if (!content.skillsById[context.params.id]) throw new ApiError(404, 'not_found', 'Nie ma takiej umiejętności.');
  return json({ fight: skillDemo(context.params.id, content) });
}

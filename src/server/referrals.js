// Poleć grę (DECISIONS.md, "Polecenie gry z linku"; 982 A with the author's
// note, 15.11.2026: „dodatkowe 300 Punktów Systemu za 30 poziom i 100
// punktów dla grającego”; mock-ups 985 accepted). Each account has its own
// link to the game, /?p=<code>, with a random code made at its first need
// (users.referral_code), never its login. An account made from such a link,
// with a password or with Google, keeps who brought it (users.referred_by,
// set once, at its creation) and has the referral's start Punkty Systemu
// waiting for its first character. At each milestone (data/community.json,
// referral.milestones) the referrer may take its reward once the account
// from its link has its e-mail confirmed (or is a Google account) and a
// character at that level, and the account itself its own reward, both
// with "Odbierz" in the Znajomi; a referrer takes at most perMonth rewards
// a month (Polish time), the rest wait for the next month. The rewards
// taken are in referral_rewards (migrations/0136_referrals.sql).

import { questPeriod } from '../engine/index.js';
import { assertion, atomically } from './atomic.js';
import { requireChatter } from './chat.js';
import { content } from './content.js';
import { ApiError, json, readJson } from './http.js';
import { t } from './i18n.js';
import { nameColorOf } from './cosmetics.js';

const tuning = () => content().community.referral;
// The code's signs: letters and digits, without those easy to mistake (0
// and O, 1 and I).
const SIGNS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const codePattern = () => new RegExp(`^[${SIGNS}]{${tuning().codeLength}}$`);
const monthOf = (now) => questPeriod('monthly', now, content()).key;
// The level an account's characters reached: its highest one.
const LEVEL_SQL = (column) => `(SELECT MAX(level) FROM characters WHERE user_id = ${column} AND role IN ('player', 'aside'))`;
// Whether an account's e-mail counts as confirmed: confirmed with the link,
// or the account is Google's, which confirmed it.
const CONFIRMED_SQL = '(u.email_confirmed_at IS NOT NULL OR u.google_sub IS NOT NULL)';

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(tuning().codeLength));
  return [...bytes].map((byte) => SIGNS[byte % SIGNS.length]).join('');
}

// The account's code, made now when it has none (a code taken by another
// account a moment ago draws again).
export async function referralCode(db, userId) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const row = await db.prepare('SELECT referral_code FROM users WHERE id = ?').bind(userId).first();
    if (row?.referral_code) return row.referral_code;
    try {
      await db.prepare('UPDATE users SET referral_code = ? WHERE id = ? AND referral_code IS NULL').bind(randomCode(), userId).run();
    } catch (error) {
      if (!String(error?.message).includes('users.referral_code')) throw error;
    }
  }
  throw new Error('referral: no free code');
}

// The account a code brings in, or null for a code of none (or not a code).
export async function referrerOf(db, code) {
  if (typeof code !== 'string' || !codePattern().test(code)) return null;
  return db.prepare('SELECT id FROM users WHERE referral_code = ?').bind(code).first();
}

// The statements that tie a new account (`userId`) to the account whose
// code brought it, with the start Punkty Systemu waiting for its first
// character; none for no such account, or the account itself.
export function referredStatements(db, userId, referrer) {
  if (!referrer || referrer.id === userId) return [];
  return [db.prepare('UPDATE users SET referred_by = ?, system_points_waiting = system_points_waiting + ? WHERE id = ? AND referred_by IS NULL').bind(referrer.id, tuning().start, userId)];
}

// GET /api/referral?code=: who invites by this code, for the invitation on
// the sign-up: the name and level of the character its account plays, or
// 404. Asked before signing in.
export async function inviterView({ request, env }) {
  const code = new URL(request.url).searchParams.get('code');
  const referrer = await referrerOf(env.DB, code);
  const character = referrer ? await env.DB.prepare("SELECT name, level, class_id FROM characters WHERE user_id = ? AND role = 'player'").bind(referrer.id).first() : null;
  if (!character) throw new ApiError(404, 'not_found', 'Nie ma takiego zaproszenia.');
  return json({ name: character.name, level: character.level, classId: character.class_id });
}

// The card "Poleć grę" of the account `userId`: its link (on the page's own
// address), the rules in numbers, the rewards taken this month, the
// accounts from its link with the state of each reward (given, ready,
// waiting), and who brought this account in with its own reward.
export async function referralOf(db, userId, origin, now) {
  const { milestones, perMonth, start } = tuning();
  const code = await referralCode(db, userId);
  const month = monthOf(now);
  const [me, players, taken] = await db.batch([
    db.prepare(
      `SELECT u.referred_by, ${LEVEL_SQL('u.id')} AS level,
              (SELECT c.name FROM characters c WHERE c.user_id = u.referred_by AND c.role = 'player') AS inviter
       FROM users u WHERE u.id = ?`,
    ).bind(userId),
    db.prepare(
      `SELECT u.id, ${CONFIRMED_SQL} AS confirmed, ${LEVEL_SQL('u.id')} AS level,
              c.id AS character_id, c.name, c.class_id, c.level AS played, c.cosmetics
       FROM users u LEFT JOIN characters c ON c.user_id = u.id AND c.role = 'player'
       WHERE u.referred_by = ? ORDER BY u.created_at, u.id`,
    ).bind(userId),
    db.prepare('SELECT referred_id, level, side, month FROM referral_rewards WHERE user_id = ?').bind(userId),
  ]);
  const given = new Set(taken.results.map((row) => `${row.referred_id}:${row.level}:${row.side}`));
  const own = me.results[0];
  const stateOf = (referredId, milestone, side, level, confirmed) =>
    given.has(`${referredId}:${milestone.level}:${side}`) ? 'given' : confirmed && (level ?? 0) >= milestone.level ? 'ready' : 'waiting';
  const ownReward = milestones.find((milestone) => milestone.newcomer > 0);
  return {
    link: `${origin}/?p=${code}`,
    rules: {
      start,
      milestones: milestones.map(({ level, referrer, newcomer }) => ({ level, referrer, newcomer })),
    },
    month: { given: taken.results.filter((row) => row.side === 'referrer' && row.month === month).length, limit: perMonth },
    invitedBy:
      own?.referred_by && own.inviter
        ? {
            name: own.inviter,
            ...(ownReward && { level: ownReward.level, points: ownReward.newcomer, state: stateOf(userId, ownReward, 'newcomer', own.level, true) }),
          }
        : null,
    players: players.results.map((row) => ({
      account: row.id,
      name: row.name,
      classId: row.class_id,
      level: row.played ?? row.level ?? 0,
      nameColor: nameColorOf(row.cosmetics),
      emailConfirmed: Boolean(row.confirmed),
      rewards: milestones
        .filter((milestone) => milestone.referrer > 0)
        .map((milestone) => ({ level: milestone.level, points: milestone.referrer, state: stateOf(row.id, milestone, 'referrer', row.level, Boolean(row.confirmed)) })),
    })),
  };
}

const originOf = (request) => new URL(request.url).origin;

// GET /api/referrals: the card "Poleć grę" in the Znajomi.
export async function referralView(context) {
  const { session, db } = await requireChatter(context);
  return json({ referral: await referralOf(db, session.userId, originOf(context.request), context.now) });
}

// POST /api/referrals/claim { account, level }: a reward taken, to the
// character the account plays: the referrer's for the account `account`
// from its link at the milestone `level`, within the month's limit, or,
// without `account`, the account's own for coming by a link. Each once
// (referral_rewards' key), and only while it is ready, both checked in the
// same batch that pays it.
export async function claimReferral(context) {
  const { session, db, character } = await requireChatter(context);
  const body = await readJson(context.request).catch(() => ({}));
  const userId = session.userId;
  const level = Number(body?.level);
  const own = body?.account === undefined || body?.account === null;
  const milestone = tuning().milestones.find((one) => one.level === level && (own ? one.newcomer : one.referrer) > 0);
  if (!milestone) throw new ApiError(400, 'bad_request', 'Nie ma takiej nagrody.');
  const referredId = own ? userId : Number(body.account);
  if (!Number.isInteger(referredId)) throw new ApiError(400, 'bad_request', 'Nie ma takiej nagrody.');
  const side = own ? 'newcomer' : 'referrer';
  const points = own ? milestone.newcomer : milestone.referrer;
  const month = monthOf(context.now);
  const notReady = () => new ApiError(409, 'not_ready', 'Tej nagrody nie można jeszcze odebrać.');
  const account = await db
    .prepare(`SELECT u.referred_by, ${CONFIRMED_SQL} AS confirmed, ${LEVEL_SQL('u.id')} AS level FROM users u WHERE u.id = ?`)
    .bind(referredId)
    .first();
  if (!account || (own ? account.referred_by === null : account.referred_by !== userId)) throw notReady();
  if ((account.level ?? 0) < milestone.level || (!own && !account.confirmed)) throw notReady();
  if (await db.prepare('SELECT 1 FROM referral_rewards WHERE referred_id = ? AND level = ? AND side = ?').bind(referredId, level, side).first()) {
    throw new ApiError(409, 'claimed', 'Ta nagroda jest już odebrana.');
  }
  if (!own) {
    const used = await db.prepare("SELECT COUNT(*) AS count FROM referral_rewards WHERE user_id = ? AND side = 'referrer' AND month = ?").bind(userId, month).first();
    if (used.count >= tuning().perMonth) throw new ApiError(409, 'limit', t(tuning().texts.limit, { limit: tuning().perMonth }));
  }
  await atomically(
    db,
    [
      // Two taps at once: the second finds the reward taken or the month's
      // limit reached.
      assertion(db, 'NOT EXISTS (SELECT 1 FROM referral_rewards WHERE referred_id = ? AND level = ? AND side = ?)', [referredId, level, side]),
      ...(own ? [] : [assertion(db, "(SELECT COUNT(*) FROM referral_rewards WHERE user_id = ? AND side = 'referrer' AND month = ?) < ?", [userId, month, tuning().perMonth])]),
      db.prepare('INSERT INTO referral_rewards (referred_id, level, side, user_id, points, month, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(referredId, level, side, userId, points, month, context.now),
      db.prepare('UPDATE characters SET system_points = system_points + ?, version = version + 1 WHERE id = ?').bind(points, character.id),
    ],
    () => new ApiError(409, 'claimed', 'Ta nagroda jest już odebrana.'),
  );
  return json({ referral: await referralOf(db, userId, originOf(context.request), context.now), text: t(tuning().texts.claimed, { points: t('{count} PS', { count: points }) }) });
}

// The statements that take an account's referrals away with it: its
// rewards both ways, and the accounts it brought in no longer tied to it.
export const referralRemoval = (db, userId) => [
  db.prepare('DELETE FROM referral_rewards WHERE user_id = ? OR referred_id = ?').bind(userId, userId),
  db.prepare('UPDATE users SET referred_by = NULL WHERE referred_by = ?').bind(userId),
];

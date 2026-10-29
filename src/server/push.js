// Phone notifications: the end of an exploration, of a build, and a full
// store (src/engine/notifications.js says when and in what words). The
// switch in the settings asks the phone for permission and hands the server
// its push subscription; every minute the cron trigger (wrangler.jsonc)
// takes the minute that passed and sends what came due in it to the phones
// of those players. The service worker (src/client/sw.js) shows them.

import { notificationsDue } from '../engine/index.js';
import { say } from '../engine/text.js';
import { content } from './content.js';
import { fromBase64Url } from './encoding.js';
import { ApiError, json, readJson } from './http.js';
import { requireSession } from './sessions.js';
import { createVapidKeys, sendPush, vapidAuthorization } from './webpush.js';

// The push services of browsers that have them: Google's (Chrome, Edge,
// Samsung Internet, Opera on Android), Apple's (Safari), Mozilla's (Firefox)
// and Microsoft's (Edge on Windows). The server sends nowhere else.
const PUSH_HOSTS = ['.googleapis.com', '.push.apple.com', '.mozilla.com', '.notify.windows.com'];
// An account keeps its newest few phones and browsers.
const MAX_SUBSCRIPTIONS = 10;
// How long a push service keeps a message for a phone that is off.
const MESSAGE_TTL_SECONDS = 6 * 3600;
// The news is the player's to act on, so it wakes a sleeping phone at once
// rather than when the phone wakes up by itself, maybe hours later.
const URGENCY = 'high';
// How often a phone may ask for a test notification.
const TEST_EVERY_MS = 30000;
// How long a subscription the push service has given up on is kept, so that
// its phone learns it and makes a new one.
const GONE_KEPT_MS = 30 * 24 * 3600000;
// The first run looks at the last minute. After a break (a failed run) the
// next one looks back at most this far: older news would only come late.
const FIRST_WINDOW_MS = 60000;
const MAX_WINDOW_MS = 15 * 60000;

const unsupported = () => new ApiError(400, 'invalid_subscription', 'Ta przeglądarka nie obsługuje powiadomień gry.');

// The public key the phone subscribes with.
export async function pushKey(context) {
  await requireSession(context);
  return json({ key: (await vapidKeys(context.env.DB)).publicKey });
}

// The phone's subscription, as PushSubscription.toJSON() gives it. A phone
// already known moves to the account signed in now. One its push service
// has given up on stays given up (`gone`): the phone, which hands it in on
// every start, makes a new one instead (push.js in the client), so the
// player need not switch anything off and on again.
export async function subscribePush(context) {
  const session = await requireSession(context);
  const { endpoint, keys } = await readJson(context.request);
  // The phone's public key: an uncompressed point of P-256.
  const phoneKey = keyOf(keys?.p256dh, 65);
  if (!pushAddress(endpoint, context.env) || phoneKey?.[0] !== 4 || !keyOf(keys?.auth, 16)) throw unsupported();
  const db = context.env.DB;
  const known = await db.prepare('SELECT gone_at FROM push_subscriptions WHERE endpoint = ?').bind(endpoint).first();
  if (known && known.gone_at !== null) return json({ ok: false, gone: true });
  await db.batch([
    db
      .prepare(
        `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (endpoint) DO UPDATE
           SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = excluded.created_at`,
      )
      .bind(endpoint, session.userId, keys.p256dh, keys.auth, context.now),
    db
      .prepare(
        `DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint NOT IN
           (SELECT endpoint FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?)`,
      )
      .bind(session.userId, session.userId, MAX_SUBSCRIPTIONS),
  ]);
  return json({ ok: true });
}

export async function unsubscribePush(context) {
  const session = await requireSession(context);
  const { endpoint } = await readJson(context.request);
  if (typeof endpoint !== 'string') throw unsupported();
  await context.env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').bind(endpoint, session.userId).run();
  return json({ ok: true });
}

// A test notification to the phone that asks for it (Ustawienia, "Wyślij
// próbne powiadomienie"), sent at once. It shows even while the game is open
// (`always`, sw.js), and the push service's answer comes back, so the player
// sees where the way to the phone breaks: "sent" (the service took it),
// "gone" (the service no longer knows the phone, and nothing goes to it),
// "failed" with the service's status (0: unreachable), "unknown" (the server
// has no such phone of this account) or "wait" (one a half minute).
export async function testPush(context) {
  const session = await requireSession(context);
  const { endpoint } = await readJson(context.request);
  if (typeof endpoint !== 'string') throw unsupported();
  const db = context.env.DB;
  const subscription = await db
    .prepare('SELECT endpoint, p256dh, auth, tested_at, gone_at FROM push_subscriptions WHERE endpoint = ? AND user_id = ?')
    .bind(endpoint, session.userId)
    .first();
  if (!subscription) return json({ result: 'unknown' });
  if (subscription.gone_at !== null) return json({ result: 'gone' });
  if (subscription.tested_at !== null && context.now - subscription.tested_at < TEST_EVERY_MS) return json({ result: 'wait' });
  await db.prepare('UPDATE push_subscriptions SET tested_at = ? WHERE endpoint = ?').bind(context.now, endpoint).run();
  const message = { title: say(content.texts, 'pushTestTitle', 0), body: say(content.texts, 'pushTestBody', 0), tag: 'test', url: '#/walka', at: context.now, always: true };
  let status = 0;
  try {
    const authorization = await vapidAuthorization(endpoint, await vapidKeys(db), context.now);
    status = await sendPush(subscription, message, { authorization, ttl: 60, topic: 'test', urgency: URGENCY });
  } catch (error) {
    console.warn(`Push test: ${new URL(endpoint).host} unreachable: ${error?.message}`);
  }
  if (status === 404 || status === 410) {
    await db.prepare('UPDATE push_subscriptions SET gone_at = ? WHERE endpoint = ?').bind(context.now, endpoint).run();
    return json({ result: 'gone' });
  }
  if (status >= 200 && status < 300) return json({ result: 'sent' });
  console.warn(`Push test: ${new URL(endpoint).host} answered ${status}.`);
  return json({ result: 'failed', status });
}

// The cron run at `now`: the notifications that came due since the last run
// go to the phones of their players. A run takes its stretch of time first,
// so two runs never send the same news. Returns how many messages the push
// services took and how many subscriptions they no longer know.
export async function sendNotifications(env, now) {
  const db = env.DB;
  const from = await claimWindow(db, now);
  if (from === null) return { sent: 0, gone: 0 };
  const subscriptions = (await db.prepare('SELECT endpoint, user_id, p256dh, auth FROM push_subscriptions WHERE gone_at IS NULL').all()).results;
  if (subscriptions.length === 0) return { sent: 0, gone: 0 };

  const due = await notificationsByUser(db, from, now);
  const keys = await vapidKeys(db);
  // One signature for each push service in a run.
  const signatures = new Map();
  const authorization = (endpoint) => {
    const origin = new URL(endpoint).origin;
    if (!signatures.has(origin)) signatures.set(origin, vapidAuthorization(endpoint, keys, now));
    return signatures.get(origin);
  };
  let sent = 0;
  const gone = new Set();
  await Promise.all(
    subscriptions.flatMap((subscription) =>
      (due.get(subscription.user_id) ?? []).map(async ({ tag, url, at, title, body }) => {
        try {
          const status = await sendPush(subscription, { title, body, tag, url, at }, { authorization: await authorization(subscription.endpoint), ttl: MESSAGE_TTL_SECONDS, topic: tag, urgency: URGENCY });
          if (status === 404 || status === 410) gone.add(subscription.endpoint);
          else if (status >= 200 && status < 300) sent += 1;
          else console.warn(`Push: ${new URL(subscription.endpoint).host} answered ${status}.`);
        } catch (error) {
          console.warn(`Push: ${new URL(subscription.endpoint).host} unreachable: ${error?.message}`);
        }
      }),
    ),
  );
  // Given up on, a subscription stays a while to tell its phone so; after
  // that, a phone that hands it in again has it given up on once more.
  if (gone.size > 0) {
    await db.batch([
      ...[...gone].map((endpoint) => db.prepare('UPDATE push_subscriptions SET gone_at = ? WHERE endpoint = ?').bind(now, endpoint)),
      db.prepare('DELETE FROM push_subscriptions WHERE gone_at < ?').bind(now - GONE_KEPT_MS),
    ]);
  }
  return { sent, gone: gone.size };
}

// The start of this run's stretch of time, or null when another run has
// taken it.
async function claimWindow(db, now) {
  const last = await db.prepare("SELECT value FROM server_settings WHERE key = 'push_checked_at'").first('value');
  if (last !== null && Number(last) >= now) return null;
  const claimed =
    last === null
      ? await db.prepare("INSERT INTO server_settings (key, value) VALUES ('push_checked_at', ?) ON CONFLICT (key) DO NOTHING").bind(String(now)).run()
      : await db.prepare("UPDATE server_settings SET value = ? WHERE key = 'push_checked_at' AND value = ?").bind(String(now), last).run();
  if (claimed.meta.changes !== 1) return null;
  return Math.max(last === null ? now - FIRST_WINDOW_MS : Number(last), now - MAX_WINDOW_MS);
}

// The players with a phone signed up, each with what came due between
// `from` and `to`: Map of user id → notifications.
async function notificationsByUser(db, from, to) {
  const subscribed = "role = 'player' AND user_id IN (SELECT user_id FROM push_subscriptions)";
  const producing = content.buildings.filter((building) => building.effect.kind === 'production').map((building) => building.id);
  const ending = (table) =>
    db
      .prepare(`SELECT character_id, kind, region_id, ends_at FROM ${table} WHERE ends_at > ? AND ends_at <= ? AND character_id IN (SELECT id FROM characters WHERE ${subscribed})`)
      .bind(from, to);
  const [characters, activities, avatarActivities, buildings] = await db.batch([
    db.prepare(`SELECT id, user_id, level, build_queue FROM characters WHERE ${subscribed}`),
    ending('activities'),
    // The works of the Awatar Systemu (avatar.js).
    ending('avatar_activities'),
    // The production buildings for their stores, the others only when a
    // build of theirs ends now.
    db
      .prepare(
        `SELECT character_id, building_id, level, started_at, ends_at, collected_at FROM buildings
         WHERE character_id IN (SELECT id FROM characters WHERE ${subscribed})
           AND (building_id IN (${producing.map(() => '?').join(', ') || "''"}) OR (ends_at > ? AND ends_at <= ?))`,
      )
      .bind(...producing, from, to),
  ]);
  const players = new Map(
    characters.results.map((row) => [
      row.id,
      { userId: row.user_id, level: row.level, activity: null, avatarActivity: null, buildings: {}, queue: JSON.parse(row.build_queue ?? '[]') },
    ]),
  );
  for (const [rows, key] of [
    [activities.results, 'activity'],
    [avatarActivities.results, 'avatarActivity'],
  ]) {
    for (const row of rows) {
      const player = players.get(row.character_id);
      // region_id holds the inner region (or a whole region, from before them).
      if (player) player[key] = { kind: row.kind, areaId: row.region_id, endsAt: row.ends_at };
    }
  }
  for (const row of buildings.results) {
    const player = players.get(row.character_id);
    if (player) player.buildings[row.building_id] = { level: row.level, startedAt: row.started_at, endsAt: row.ends_at, collectedAt: row.collected_at };
  }
  const due = new Map();
  for (const player of players.values()) {
    const notifications = notificationsDue(player, from, to, content);
    if (notifications.length > 0) due.set(player.userId, notifications);
  }
  return due;
}

// The game's signing keys: made by the first call that needs them and kept
// in the database. When two calls meet, the pair saved first stays.
async function vapidKeys(db) {
  const read = () => db.prepare("SELECT value FROM server_settings WHERE key = 'vapid'").first('value');
  let stored = await read();
  if (stored === null) {
    await db.prepare("INSERT INTO server_settings (key, value) VALUES ('vapid', ?) ON CONFLICT (key) DO NOTHING").bind(JSON.stringify(await createVapidKeys())).run();
    stored = await read();
  }
  return JSON.parse(stored);
}

// The subscription's address, when it leads to a known push service. Tests
// send to a stand-in on their own machine (PUSH_TEST_HOSTS).
function pushAddress(value, env) {
  if (typeof value !== 'string' || value.length > 1024) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if ((env.PUSH_TEST_HOSTS ?? '').split(',').includes(url.hostname)) return url;
  return url.protocol === 'https:' && PUSH_HOSTS.some((suffix) => url.hostname.endsWith(suffix)) ? url : null;
}

// A key of the subscription in base64url, when it has `length` bytes.
function keyOf(value, length) {
  if (typeof value !== 'string' || value.length > 128) return null;
  try {
    const bytes = fromBase64Url(value);
    return bytes.length === length ? bytes : null;
  } catch {
    return null;
  }
}

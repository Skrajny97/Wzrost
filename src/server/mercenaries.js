// Najemnicy in the Karczma (data/settlement.json, mercenaries;
// src/engine/mercenaries.js; DECISIONS.md, "Najemnicy w Karczmie"; the
// author, 5.11.2026: 633.1 A, 633.2 A, 633.3 A, "Oddanie się do werbunku
// jest okresowe i postać nie może nic wtedy robić, chyba że zdejmie
// wystawienie swojej usługi" and "Gdy zostanie zwerbowany nie może już
// zdjąć swojej usługi do czasu jej zakończenia (1 wyprawa)").
// A character offers itself for some hours: an activity of the kind
// 'mercenary', so it can do nothing else meanwhile, nor change what it
// wears, until it takes the offer back. Another player takes it along on
// one plain exploration (beginHunt in hunts.js, `mercenary`) and pays its
// price for each hour of it at once; the mercenary fights beside it as a
// member of a Drużyna would, with all it wears, in one companion's place.
// Hired, it serves until that exploration ends (called back early, or
// skipped, with it) and cannot take the offer back; then it claims its pay.
// It gets nothing else and loses nothing: no XP, no loot, its HP as it
// rests.

import { classNameOf, mercenariesOf, mercenariesOpen, mercenaryFee, mercenaryFits, mercenaryPriceRange } from '../engine/index.js';
import { gendered } from '../engine/companions.js';
import { assertion, atomically, characterChanged, raced, sameVersion } from './atomic.js';
import { characterView, currentHp, engineCharacter, equippedItems, loadCharacter, loadPlayer, requireIdlePlayer, requirePlayer } from './characters.js';
import { content } from './content.js';
import { ApiError, json, readJson } from './http.js';
import { OWN_CHARACTERS } from './roles.js';

const HOUR = 3600000;
const rules = () => mercenariesOf(content);
const words = () => rules().texts;
// A placeholder the values do not name stays, for the page to fill ({time}).
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (all, name) => (name in vars ? String(vars[name]) : all));
const number = (value) => new Intl.NumberFormat('pl-PL').format(value);

// The offer an activity holds: its price an hour and, once hired, who took
// it along, where, until when and for how much; null for any other activity.
export const offerOf = (activity) => (activity?.kind === 'mercenary' ? JSON.parse(activity.options ?? '{}') : null);

// The words of the mercenary's work for requireIdle (characters.js).
export function mercenaryBusy(activity) {
  const offer = offerOf(activity);
  return { claimFirst: [words().claimFirst], busy: [offer?.hired ? words().busyHired : words().busy] };
}

// The activity as the page shows it (characters.js, activityPlace): the
// offer, who took the character along, and the words of it now, the time
// ({time}) for the page to fill.
export function mercenaryPlace(activity) {
  const { perHour, hired } = offerOf(activity);
  return {
    placeName: words().place,
    service: {
      perHour,
      hired: hired ? { name: hired.name, area: hired.area, gold: hired.gold } : null,
      text: hired
        ? filled(gendered(words().hired, hired.female ? 'female' : 'male'), { name: hired.name, area: hired.area, gold: number(hired.gold) })
        : filled(words().waiting, { price: number(perHour) }),
    },
  };
}

// Whether the offer's hours or the service are over, its pay or its close
// waiting in the Karczma: a dot on the Osada (characters.js).
export const serviceEnded = (activity, now) => activity?.kind === 'mercenary' && activity.ends_at <= now;

// What a character may offer, for the Karczma's form, or null below the
// mercenaries' level.
export function mercenaryRules(row) {
  if (!mercenariesOpen(row.level, content)) return null;
  return { hours: rules().hours, price: mercenaryPriceRange(row.level, content), fromLevel: rules().fromLevel, texts: words() };
}

// POST /api/mercenary/offer { hours, perHour }: the character offers
// itself for `hours`, at `perHour` gold for each hour of an exploration.
export async function offerMercenary(context) {
  const { session, player } = await requireIdlePlayer(context);
  const { row } = player;
  if (!mercenariesOpen(row.level, content)) throw new ApiError(403, 'locked', filled(words().locked, { level: rules().fromLevel }));
  const body = await readJson(context.request);
  if (!rules().hours.includes(body.hours)) throw new ApiError(400, 'invalid_hours', words().invalidHours);
  const range = mercenaryPriceRange(row.level, content);
  if (!Number.isInteger(body.perHour) || body.perHour < range.min || body.perHour > range.max) {
    throw new ApiError(400, 'invalid_price', filled(words().invalidPrice, { min: number(range.min), max: number(range.max) }));
  }
  const db = context.env.DB;
  const now = context.now;
  // The HP rested so far is saved now, and the rest goes on meanwhile.
  const { hp } = currentHp(player, now);
  try {
    await db.batch([
      sameVersion(db, row),
      db
        .prepare("INSERT INTO activities (character_id, kind, region_id, minutes, started_at, ends_at, seed, hp_at_start, options) VALUES (?, 'mercenary', '', ?, ?, ?, '', ?, ?)")
        .bind(row.id, body.hours * 60, now, now + body.hours * HOUR, hp, JSON.stringify({ perHour: body.perHour })),
      db.prepare('UPDATE characters SET hp = ?, hp_at = ?, version = version + 1 WHERE id = ?').bind(hp, now, row.id),
    ]);
  } catch (error) {
    if (raced(error)) throw characterChanged();
    if (String(error?.message).includes('constraint')) throw new ApiError(409, 'busy', words().busy);
    throw error;
  }
  return json({ character: characterView(await loadPlayer(db, session.userId), now) });
}

// POST /api/mercenary/withdraw: the offer taken back, while nobody hired
// the character (also once its hours are over).
export async function withdrawMercenary(context) {
  const { session, player } = await requirePlayer(context);
  const offer = offerOf(player.activity);
  if (!offer) throw new ApiError(409, 'not_offering', words().notOffering);
  if (offer.hired) throw new ApiError(409, 'hired', words().hiredLocked);
  const db = context.env.DB;
  const gone = await db
    .prepare("DELETE FROM activities WHERE character_id = ? AND kind = 'mercenary' AND started_at = ? AND json_extract(options, '$.hired') IS NULL")
    .bind(player.row.id, player.activity.started_at)
    .run();
  // Hired meanwhile: it serves.
  if (gone.meta.changes !== 1) throw new ApiError(409, 'hired', words().hiredLocked);
  return json({ text: words().withdrawn, character: characterView(await loadPlayer(db, session.userId), context.now) });
}

// POST /api/mercenary/claim: the pay of a service that ended, or an offer
// whose hours passed with nobody hiring the character closed. Once: the
// batch holds only while the activity is there.
export async function claimMercenary(context) {
  const { session, player } = await requirePlayer(context);
  const { row, activity } = player;
  const offer = offerOf(activity);
  if (!offer) throw new ApiError(409, 'not_offering', words().notOffering);
  const now = context.now;
  if (activity.ends_at > now) throw new ApiError(409, 'not_finished', offer.hired ? words().busyHired : words().busy);
  const gold = offer.hired?.gold ?? 0;
  const db = context.env.DB;
  const here = "character_id = ? AND kind = 'mercenary' AND started_at = ?";
  await atomically(
    db,
    [
      assertion(db, `EXISTS (SELECT 1 FROM activities WHERE ${here})`, [row.id, activity.started_at]),
      db.prepare('UPDATE characters SET gold = gold + ?, version = version + 1 WHERE id = ?').bind(gold, row.id),
      db.prepare(`DELETE FROM activities WHERE ${here}`).bind(row.id, activity.started_at),
    ],
    () => new ApiError(409, 'claimed', words().notOffering),
  );
  return json({ paid: gold, text: gold > 0 ? filled(words().paid, { gold: number(gold) }) : words().expired, character: characterView(await loadPlayer(db, session.userId), now) });
}

// GET /api/mercenaries?minutes=60: those waiting to be hired now whom the
// character may take along on an exploration of `minutes`: from the
// mercenaries' level, of other accounts, the class levels within the
// Drużyna's spread; each with its price an hour and for that exploration.
export async function listMercenaries(context) {
  const { player } = await requirePlayer(context);
  const { row } = player;
  if (!mercenariesOpen(row.level, content)) return json({ mercenaries: [] });
  const asked = Number(new URL(context.request.url).searchParams.get('minutes'));
  const minutes = Number.isFinite(asked) && asked > 0 ? asked : 60;
  const spread = content.balance.parties.classSpread;
  const { results } = await context.env.DB.prepare(
    `SELECT c.*, a.options AS offer, a.ends_at AS offer_ends
     FROM activities a JOIN characters c ON c.id = a.character_id
     WHERE a.kind = 'mercenary' AND json_extract(a.options, '$.hired') IS NULL AND a.ends_at > ?
       AND c.user_id != ? AND c.${OWN_CHARACTERS} AND c.level >= ? AND c.class_level BETWEEN ? AND ?
     ORDER BY c.class_level DESC, c.level DESC LIMIT 50`,
  )
    .bind(context.now, row.user_id, rules().fromLevel, row.class_level - spread, row.class_level + spread)
    .all();
  return json({
    mercenaries: results.map((one) => {
      const { perHour } = JSON.parse(one.offer);
      return {
        id: one.id,
        name: one.name,
        classId: one.class_id,
        className: classNameOf(engineCharacter(one), content),
        level: one.level,
        classLevel: one.class_level,
        female: one.appearance === 'female',
        perHour,
        fee: mercenaryFee(perHour, minutes),
        until: one.offer_ends,
      };
    }),
  });
}

// The hire of a mercenary with an exploration's start (beginHunt): `asked`
// is { id, perHour } as the player saw it. Checks what can be checked now
// and gives the fee, the mercenary as it fights (a partner: its character,
// what it wears and its HP now) and the statements for the start's batch:
// an assertion that it still waits, unhired, at that price, and its offer
// turned into the service, until the exploration ends.
export async function hireMercenary(db, player, asked, { area, minutes, startsAt, endsAt, now, plain }) {
  const { row } = player;
  if (!plain) throw new ApiError(400, 'mercenary_plain_only', words().plainOnly);
  if (!mercenariesOpen(row.level, content)) throw new ApiError(403, 'locked', filled(words().locked, { level: rules().fromLevel }));
  if (!asked || typeof asked !== 'object' || !Number.isInteger(asked.id) || !Number.isInteger(asked.perHour)) throw new ApiError(400, 'invalid_mercenary', words().gone);
  const mercenary = await loadCharacter(db, asked.id);
  const offer = offerOf(mercenary?.activity);
  if (!mercenary || !offer || offer.hired || mercenary.activity.ends_at <= now || !['player', 'aside'].includes(mercenary.row.role)) {
    throw new ApiError(409, 'mercenary_gone', words().gone);
  }
  if (mercenary.row.user_id === row.user_id) throw new ApiError(403, 'own_mercenary', words().own);
  if (!mercenaryFits(row.class_level, mercenary.row.class_level, content)) {
    throw new ApiError(403, 'mercenary_spread', filled(words().spread, { spread: content.balance.parties.classSpread }));
  }
  if (offer.perHour !== asked.perHour) throw new ApiError(409, 'mercenary_changed', words().priceChanged);
  const fee = mercenaryFee(offer.perHour, minutes);
  if (row.gold < fee) throw new ApiError(409, 'no_gold', words().noGold);
  const hired = { by: row.id, name: row.name, female: row.appearance === 'female', area: area.name, at: startsAt, gold: fee };
  const waiting = "character_id = ? AND kind = 'mercenary' AND started_at = ? AND json_extract(options, '$.hired') IS NULL AND ends_at > ? AND json_extract(options, '$.perHour') = ?";
  const binds = [mercenary.row.id, mercenary.activity.started_at, now, offer.perHour];
  return {
    fee,
    partner: { id: mercenary.row.id, name: mercenary.row.name, character: engineCharacter(mercenary.row), equipped: equippedItems(mercenary), hp: currentHp(mercenary, now).hp },
    view: { id: mercenary.row.id, name: mercenary.row.name, gold: fee },
    check: { sql: waiting, binds },
    statements: [
      assertion(db, `EXISTS (SELECT 1 FROM activities WHERE ${waiting})`, binds),
      db.prepare(`UPDATE activities SET ends_at = ?, options = json_set(options, '$.hired', json(?)) WHERE ${waiting}`).bind(endsAt, JSON.stringify(hired), ...binds),
    ],
  };
}

// Why a start with a mercenary failed on its assertions (hunts.js): the
// mercenary taken meanwhile by someone else or its offer gone, or else the
// character changed.
export async function hireRaced(db, hire) {
  const still = await db.prepare(`SELECT 1 AS ok FROM activities WHERE ${hire.check.sql}`).bind(...hire.check.binds).first();
  return still ? characterChanged() : new ApiError(409, 'mercenary_gone', words().gone);
}

// The service of the mercenary an exploration took along (`options` its
// options), ended now: the exploration called back early (hunts.js).
export function endService(db, options, hirerId, now) {
  return db
    .prepare("UPDATE activities SET ends_at = MIN(ends_at, ?) WHERE character_id = ? AND kind = 'mercenary' AND json_extract(options, '$.hired.by') = ?")
    .bind(now, options.mercenary.id, hirerId);
}

// The same service moved back with its exploration's skipped time
// (time.js), `also` its condition, as the skip's.
export function shiftService(db, options, hirerId, shift, also) {
  return db
    .prepare(`UPDATE activities SET ends_at = ends_at - ? WHERE character_id = ? AND kind = 'mercenary' AND json_extract(options, '$.hired.by') = ?${also.sql}`)
    .bind(shift, options.mercenary.id, hirerId, ...also.binds);
}

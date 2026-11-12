// Zdarzenia drużynowe on server time (src/engine/party-events.js; the
// author's 844 A, 845 A, 846 A, 847 B and 848, 12.11.2026). The first claim
// of any exploration of a Drużyna's trip that ended as planned draws the
// trip's event from its seed and keeps it (party_events, one row a trip),
// with who went and their HP at the trip's end. The trip's leader chooses
// at the claim of its own report (hunts.js: finishHunt); 12 hours after the
// trip's end, or when its report is claimed as the party sets out under
// another leader (parties.js: claimForTrip), the event settles itself with
// its `auto` option (the cron: settlePartyEvents). The result is computed
// once and kept, the first to keep it wins (a second resolution takes the
// kept one), and every member gets its own report of it, with its rewards,
// in its account's language: one batch each, while the character is as
// read, under a report's unique key, so nobody gets it twice. The trip
// reports of all who went name the event in a line of the System.

import {
  applyHunt,
  bagCapacity,
  bagStacks,
  campLevels,
  carriedHealing,
  huntReport,
  partyEventFor,
  partyEventHunt,
  partyEventView,
  partyOptionLock,
  partyTripLine,
  playerCombatant,
  resolvePartyEvent,
  storeStacks,
} from '../engine/index.js';
import { raced, sameVersion } from './atomic.js';
import { bagItems, currentHp, engineCharacter, equippedItems, loadCharacter } from './characters.js';
import { content, contentIn } from './content.js';
import { englishOn, eventDraftsOn } from './features.js';
import { ApiError } from './http.js';
import { accountLanguage, language, runInLanguage } from './i18n.js';
import { addTo } from './professions.js';
import { herbsOf, potionsOf } from './professions-view.js';
import { trimReports } from './reports.js';

const HOUR_MS = 3600000;
// How long a trip's event is kept after the trip's end: long past its
// `auto`, so its results reach everyone; a claim of a trip ended longer ago
// draws none (its members got their reports when it was settled).
const KEEP_MS = 14 * 24 * HOUR_MS;
// What the cron settles in one run at most, of each kind.
const CRON_ROWS = 5;
// A result is given to its members by the request that settled it; the
// cron gives what is still missing only this long after, so it does not
// race that request.
const APPLY_GRACE_MS = 60000;
// The tries of one member's report while its character changes meanwhile.
const TRIES = 3;

// The event of a trip's exploration claimed now (finishHunt), or null: the
// one the trip's seed draws for a trip that ended as planned (party events
// come where the exploration's events do, their drafts where theirs do),
// kept at the first claim of any member's report, and its row as it is
// now. `trip`: the exploration's options.party, with its roster in the
// trip's order (its leader first) and seed; `hunt`: the exploration as the
// claim simulates it, whose HP and the partners' are those of the trip's
// end, the same in every member's.
export async function tripEvent(db, { row, activity, trip, hunt, area, now }) {
  const event = partyEventFor({ hunt, seed: trip.seed, drafts: eventDraftsOn() }, content());
  if (!event || activity.ends_at < now - KEEP_MS) return null;
  const leader = trip.roster[0];
  const partners = new Map((hunt.partners ?? []).map((one) => [one.id, one]));
  const members = trip.roster.map((one) => ({ id: one.id, name: one.name, hpEnd: one.id === row.id ? hunt.hpEnd : (partners.get(one.id)?.hpEnd ?? one.hp) }));
  await db
    .prepare(
      `INSERT OR IGNORE INTO party_events (trip_key, party_id, leader_id, leader_name, event_id, area_id, region_id, level, members, ends_at, auto_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      trip.seed,
      trip.id,
      leader.id,
      leader.name,
      event.id,
      area.id,
      area.regionId,
      leader.character.level,
      JSON.stringify(members),
      activity.ends_at,
      activity.ends_at + content().partyEvents.autoHours * HOUR_MS,
      now,
    )
    .run();
  const eventRow = await db.prepare('SELECT * FROM party_events WHERE trip_key = ?').bind(trip.seed).first();
  return eventRow && content().partyEventsById[eventRow.event_id] ? eventRow : null;
}

// The event as the trip's leader sees it at its claim: whom it decides for,
// and its options, one that gives away a healing potion greyed out while
// the bag will hold none (`potions`: the bag's as the claim leaves it, with
// those taken along and not drunk back).
export function leaderView(eventRow, area, potions) {
  const names = JSON.parse(eventRow.members)
    .filter((one) => one.id !== eventRow.leader_id)
    .map((one) => one.name);
  return partyEventView(content().partyEventsById[eventRow.event_id], { area, names, potion: Boolean(carriedHealing(potions, content())) }, content());
}

// The leader's choice, checked: an option of the event (400) the leader may
// take (409: one that gives away a healing potion without one in the bag).
export function checkedChoice(eventRow, choice, potions) {
  const option = typeof choice === 'string' ? content().partyEventsById[eventRow.event_id].options.find((one) => one.id === choice) : null;
  if (!option) throw new ApiError(400, 'invalid_choice', 'Wybierz jedną z opcji.');
  const lock = partyOptionLock(option, { potion: Boolean(carriedHealing(potions, content())) }, content());
  if (lock) throw new ApiError(409, lock.code, 'Na tę opcję potrzebujesz mikstury leczenia w plecaku.');
  return option.id;
}

// The line of the System about the event in a trip's report, every
// member's: waiting for the leader, chosen, or settled by itself.
export function tripLine(eventRow) {
  const event = content().partyEventsById[eventRow.event_id];
  return partyTripLine({ event, leaderName: eventRow.leader_name, chosenBy: eventRow.chosen_by, optionId: eventRow.choice }, content());
}

// Those who went, as the event is resolved: each still there, as it is now,
// with its HP at the trip's end.
async function membersNow(db, eventRow) {
  const listed = JSON.parse(eventRow.members);
  const loaded = await Promise.all(listed.map((one) => loadCharacter(db, one.id)));
  return listed.flatMap((one, index) => {
    const member = loaded[index];
    return member ? [{ id: one.id, name: member.row.name, hpEnd: one.hpEnd, character: engineCharacter(member.row), equipped: equippedItems(member) }] : [];
  });
}

// The event settled with `optionId`, chosen by the leader or `auto`: the
// whole result computed first (the same from the trip's seed whoever
// computes it), its fight in Polish and, where English is on, in English
// too (its texts take no draws), then kept only if nobody kept one first,
// with the boon added to the party's in the same batch. Gives the row as
// it is kept, another's result when another was first.
export async function resolvePartyRow(db, eventRow, { optionId, chosenBy, now }) {
  const members = await membersNow(db, eventRow);
  const input = { optionId, seed: eventRow.trip_key, areaId: eventRow.area_id, level: eventRow.level, leaderId: eventRow.leader_id, members, drafts: eventDraftsOn() };
  const polish = contentIn('pl');
  const result = resolvePartyEvent({ ...input, event: polish.partyEventsById[eventRow.event_id] }, polish);
  const english = result.fight && englishOn() ? contentIn('en') : null;
  const fight = result.fight && {
    pl: result.fight,
    ...(english && { en: resolvePartyEvent({ ...input, event: english.partyEventsById[eventRow.event_id] }, english).fight }),
  };
  const kept = JSON.stringify({ ...result, fight });
  const [claimed] = await db.batch([
    db.prepare('UPDATE party_events SET choice = ?, chosen_by = ?, result = ?, resolved_at = ? WHERE id = ? AND choice IS NULL').bind(optionId, chosenBy, kept, now, eventRow.id),
    // The boon of the party's next trip, only with the result kept now;
    // one waiting already keeps what this one does not name.
    ...(result.boon
      ? [
          db
            .prepare(
              "UPDATE parties SET boon = json_patch(COALESCE(boon, '{}'), ?) WHERE id = ? AND EXISTS (SELECT 1 FROM party_events WHERE id = ? AND resolved_at = ? AND chosen_by = ? AND result = ?)",
            )
            .bind(JSON.stringify(result.boon), eventRow.party_id, eventRow.id, now, chosenBy, kept),
        ]
      : []),
  ]);
  if (claimed.meta.changes === 1) return { ...eventRow, choice: optionId, chosen_by: chosenBy, result: kept, resolved_at: now };
  return db.prepare('SELECT * FROM party_events WHERE id = ?').bind(eventRow.id).first();
}

// The event settled with its `auto` option: nobody chose in time.
export const resolveAuto = (db, eventRow, now) => resolvePartyRow(db, eventRow, { optionId: content().partyEventsById[eventRow.event_id].auto, chosenBy: 'auto', now });

// Its result given to every member still there, each its own report once
// (giveMember); the row marked `applied` once all of them have it. A member
// whose character keeps changing waits for the cron's next run.
export async function applyPartyEvent(db, eventRow, now) {
  const result = JSON.parse(eventRow.result);
  const ids = Object.keys(result.members).map(Number);
  let given = 0;
  for (const id of ids) {
    if (await giveTo(db, eventRow, result, id, now)) given += 1;
  }
  if (given === ids.length) await db.prepare('UPDATE party_events SET applied = 1 WHERE id = ?').bind(eventRow.id).run();
}

// One member's report, in its account's language, tried again while its
// character changed meanwhile: true once it has it (or its character is
// gone), false when it still has not.
async function giveTo(db, eventRow, result, id, now) {
  for (let attempt = 0; attempt < TRIES; attempt++) {
    const member = await loadCharacter(db, id);
    if (!member) return true;
    const user = await db.prepare('SELECT language FROM users WHERE id = ?').bind(member.row.user_id).first();
    try {
      await runInLanguage(accountLanguage(user?.language), () => giveMember(db, eventRow, result, member, now));
      return true;
    } catch (error) {
      // Its report is there already: given before.
      if (String(error?.message).includes('UNIQUE')) return true;
      if (!raced(error)) throw error;
    }
  }
  return false;
}

// The lines of a level's full heal (levelUpMessages), left out of the
// report of a member busy elsewhere, whose HP waits for its own claim.
const healLines = () => new Set([...content().texts.levelHeal, ...content().texts.levelHealFemale]);

// The report of the event for one member, and what it gets: its XP and the
// levels they bring (applyHunt, as an exploration's, never a faint's
// penalty), its gold, the herbs and potions that find room in the bag (the
// rest is lost, and the report says so), its materials and gems, its
// reputation in the Osada, and its HP: a loss, a faint or a new level's
// full heal, only while it is at home, with nothing going on (one busy
// elsewhere hears its wounds heal on the way). The leader who chose an
// option of `leaderPotion` gives away its best healing potion. In one batch
// while the character is as read.
async function giveMember(db, eventRow, result, member, now) {
  const { row } = member;
  // An event or option the game no longer has gives nothing more.
  const event = content().partyEventsById[eventRow.event_id];
  const option = event?.options.find((one) => one.id === result.option);
  if (!option) return;
  const share = result.members[row.id];
  const character = engineCharacter(row);
  const busy = Boolean(member.activity);
  const raw = applyHunt(character, { xp: share.xp ?? 0, result: 'success' }, content());
  const applied = busy ? { ...raw, messages: raw.messages.filter((line) => !healLines().has(line)) } : raw;
  // The HP: as rested until now, then what the event does to it.
  const { hp: hpNow, maxHp } = currentHp(member, now);
  let hp = hpNow;
  let lost = 0;
  if (!busy && share.hpLoss) {
    lost = Math.max(0, Math.min(hpNow - 1, Math.round(maxHp * share.hpLoss)));
    hp = hpNow - lost;
  }
  if (!busy && share.faint) hp = Math.min(hpNow, Math.max(1, Math.round(maxHp * content().balance.hunt.hpAfterFaint)));
  let hpMax = maxHp;
  if (!busy && applied.levelled) {
    const levelled = { ...character, level: applied.level, xp: applied.xp, classLevel: applied.classLevel, classXp: applied.classXp };
    hpMax = playerCombatant({ character: levelled, equipped: equippedItems(member), name: row.name }, content()).maxHp;
    hp = hpMax;
  }
  const setsHp = !busy && (lost > 0 || Boolean(share.faint) || applied.levelled);
  // The bag: the leader's potion given away first, then the herbs and the
  // potions of the event, into the places left (storeStacks).
  const potionsBefore = potionsOf(row);
  const paid = option.leaderPotion && eventRow.leader_id === row.id && eventRow.chosen_by === 'leader' ? carriedHealing(potionsBefore, content()) : null;
  const potionsPaid = paid ? Object.fromEntries(Object.entries({ ...potionsBefore, [paid]: potionsBefore[paid] - 1 }).filter(([, count]) => count > 0)) : potionsBefore;
  const herbsBefore = herbsOf(row);
  const capacity = bagCapacity(campLevels(member.buildings, now, content()), content()) - bagItems(member).length;
  const herbs = storeStacks(herbsBefore, share.herbs ?? {}, capacity - bagStacks(herbsBefore, content()) - bagStacks(potionsPaid, content()), content());
  const potions = storeStacks(potionsPaid, share.potions ?? {}, capacity - bagStacks(herbs.after, content()) - bagStacks(potionsPaid, content()), content());
  const herbsChanged = Object.keys(herbs.stored).length > 0;
  const potionsChanged = Boolean(paid) || Object.keys(potions.stored).length > 0;
  // The fight in the member's language, or in Polish.
  const fight = result.fight ? (result.fight[language()] ?? result.fight.pl) : null;
  const area = content().areasById[eventRow.area_id];
  const told = partyEventHunt(
    {
      event,
      result,
      fight,
      memberId: row.id,
      area,
      chosenBy: eventRow.chosen_by,
      hp: busy ? { start: null, end: null, max: null, busy: true } : { start: hpNow, end: setsHp ? hp : hpNow, max: hpMax, lost },
      bagLost: { herbs: herbs.lost, potions: potions.lost },
    },
    content(),
  );
  const names = JSON.parse(eventRow.members).map((one) => one.name);
  const report = {
    ...huntReport({ hunt: told.hunt, applied, character, areaId: area.id, startedAt: eventRow.ends_at, endsAt: now }, content()),
    kind: 'party-event',
    resultText: told.line,
    partyEvent: { id: event.id, title: told.title },
    party: names,
  };
  const summary = {
    partyEvent: { title: told.title },
    areaName: report.areaName,
    regionName: report.regionName,
    minutes: 0,
    result: report.result,
    resultText: report.resultText,
    xp: report.summary.xp,
    classXp: report.summary.classXp,
    penalty: 0,
    gold: report.summary.gold,
    itemsFound: 0,
    resources: {},
    materials: report.summary.materials.map(({ name, label, color, count }) => ({ name, label, color, count })),
    timePoints: report.summary.timePoints,
    bestFind: null,
    levelAfter: applied.level,
    system: report.system,
  };
  // The reputation with the Osada's brotherhoods, as an event's (hunts.js:
  // settlementAfterHunt).
  let settlement = null;
  if (share.reputation) {
    const before = JSON.parse(row.settlement ?? '{}');
    const reputation = { ...before.reputation };
    for (const [id, points] of Object.entries(share.reputation)) reputation[id] = (reputation[id] ?? 0) + points;
    settlement = JSON.stringify({ ...before, reputation });
  }
  const materials = addTo('materials', share.materials ?? {});
  const minerals = addTo('minerals', share.minerals ?? {});
  await db.batch([
    // Everything below is computed from the row read (atomic.js).
    sameVersion(db, row),
    // The report first, under its unique key: a second giving fails whole.
    db
      .prepare('INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(row.id, `${row.id}:party-event:${eventRow.id}`, 'party-event', now, JSON.stringify(summary), JSON.stringify(report)),
    trimReports(db, row.id, 'party-event'),
    db
      .prepare(
        `UPDATE characters SET level = ?, xp = ?, class_level = ?, class_xp = ?, gold = gold + ?, time_points = time_points + ?${herbsChanged ? ', herbs = ?' : ''}${potionsChanged ? ', potions = ?' : ''}${materials.sql}${minerals.sql}${settlement ? ', settlement = ?' : ''}${setsHp ? ', hp = ?, hp_at = ?' : ''}, version = version + 1 WHERE id = ?`,
      )
      .bind(
        applied.level,
        applied.xp,
        applied.classLevel,
        applied.classXp,
        share.gold ?? 0,
        applied.timePoints,
        ...(herbsChanged ? [JSON.stringify(herbs.after)] : []),
        ...(potionsChanged ? [JSON.stringify(potions.after)] : []),
        ...materials.binds,
        ...minerals.binds,
        ...(settlement ? [settlement] : []),
        ...(setsHp ? [hp, now] : []),
        row.id,
      ),
  ]);
}

// The cron's part (index.js, every minute), a few rows of each at most:
// the events nobody chose in time settled with their `auto` option and
// given to everyone; the results not given to everyone yet given to those
// still missing them; and the events of trips ended over KEEP_MS ago
// dropped. One row that fails stops none of the others.
export async function settlePartyEvents(db, now) {
  const { results: due } = await db.prepare('SELECT * FROM party_events WHERE choice IS NULL AND auto_at <= ? ORDER BY auto_at LIMIT ?').bind(now, CRON_ROWS).all();
  for (const eventRow of due) {
    try {
      // An event the game no longer has settles nothing.
      if (!content().partyEventsById[eventRow.event_id]) {
        await db.prepare('DELETE FROM party_events WHERE id = ? AND choice IS NULL').bind(eventRow.id).run();
        continue;
      }
      const resolved = await resolveAuto(db, eventRow, now);
      if (resolved?.choice && !resolved.applied) await applyPartyEvent(db, resolved, now);
    } catch (error) {
      console.error(error);
    }
  }
  const { results: waiting } = await db
    .prepare('SELECT * FROM party_events WHERE choice IS NOT NULL AND applied = 0 AND resolved_at <= ? ORDER BY resolved_at LIMIT ?')
    .bind(now - APPLY_GRACE_MS, CRON_ROWS)
    .all();
  for (const eventRow of waiting) {
    try {
      await applyPartyEvent(db, eventRow, now);
    } catch (error) {
      console.error(error);
    }
  }
  await db.prepare('DELETE FROM party_events WHERE ends_at < ?').bind(now - KEEP_MS).run();
}

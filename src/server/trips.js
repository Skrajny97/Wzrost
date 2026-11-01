// The explorations of one Drużyna's trip (parties.js: partyHunt), marked by
// the party's id and the moment it set out (`party.trip` in their options):
// they share their timer, so a "Przewiń" of any member moves them all and
// the others hear who skipped (time.js, testing.js; the author: "Musi być
// wspólny timer" and "xxx przewinął czas o xxx"), and one called back
// fights in none of them any more (hunts.js: cancelHunt; the author: "niech
// się nie okaże, że jednak 3 walczą").

// The party trip of an exploration (parties.js), or null.
export function tripOf(activity) {
  if (activity.kind !== 'hunt') return null;
  const party = JSON.parse(activity.options ?? '{}').party;
  return party?.trip ? party : null;
}

// Who skipped a trip's time and by how many minutes, as the others read it
// (characters.js: activityView; hunts.js: the report).
export const skipRecord = (row, minutes) => JSON.stringify({ id: row.id, name: row.name, minutes, ...(row.appearance === 'female' && { female: true }) });

// Every exploration of a party trip moved back by `shift`, each keeping the
// skip's record; `also` adds a condition with its binds.
export function shiftTrip(db, trip, startedAt, shift, record, also = { sql: '', binds: [] }) {
  return db
    .prepare(
      `UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ?,
         options = json_set(options, '$.skips', json_insert(COALESCE(json_extract(options, '$.skips'), json_array()), '$[#]', json(?)))
       WHERE kind = 'hunt' AND started_at = ? AND json_extract(options, '$.party.id') = ? AND json_extract(options, '$.party.trip') = ?${also.sql}`,
    )
    .bind(shift, shift, record, startedAt, trip.id, trip.trip, ...also.binds);
}

// A member called back from a trip leaves the others' fights and names: each
// other exploration of the trip keeps its roster (or, from before the
// roster, its partners) and names without it.
export function leaveTrip(db, trip, row) {
  const without = (path) => `json((SELECT json_group_array(json(value)) FROM json_each(activities.options, '${path}') WHERE json_extract(value, '$.id') != ?))`;
  return db
    .prepare(
      `UPDATE activities SET options = CASE WHEN json_type(options, '$.party.roster') = 'array'
         THEN json_set(options, '$.party.roster', ${without('$.party.roster')}, '$.party.names', json((SELECT json_group_array(value) FROM json_each(activities.options, '$.party.names') WHERE value != ?)))
         ELSE json_set(options, '$.partners', ${without('$.partners')}, '$.party.names', json((SELECT json_group_array(value) FROM json_each(activities.options, '$.party.names') WHERE value != ?)))
       END
       WHERE kind = 'hunt' AND character_id != ? AND json_extract(options, '$.party.id') = ? AND json_extract(options, '$.party.trip') = ?`,
    )
    .bind(row.id, row.name, row.id, row.name, row.id, trip.id, trip.trip);
}

// When a friend was last online, in the Znajomi (the author, 10.11.2026:
// „Sortowanie listy znajomych po poziomach oraz wskazywanie u każdego kiedy
// ostatnio był online.”): "teraz" while its dot says online or busy
// (`online`), else how long before `now` its account last had the game open
// (`seenAt`, src/server/community.js): minutes under an hour (at least one),
// hours under a day, "wczoraj" under two days, then days. Null for an
// account never seen. The unit and the count; screens/friends.js words them.
export function lastSeen(seenAt, now, online = false) {
  if (online) return { unit: 'now', count: 0 };
  if (seenAt === null || seenAt === undefined) return null;
  const minutes = Math.max(1, Math.floor((now - seenAt) / 60000));
  if (minutes < 60) return { unit: 'minutes', count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: 'hours', count: hours };
  const days = Math.floor(hours / 24);
  return days < 2 ? { unit: 'yesterday', count: 1 } : { unit: 'days', count: days };
}

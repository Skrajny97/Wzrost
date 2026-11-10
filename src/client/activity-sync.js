// Whether the end of the character's activity the chat's check heard
// (`endsAt`, src/server/chat.js: latestChat; null for none) is not that of
// the activity the page shows (`shown`, the character's on the page, or
// null): then the page fetches the character again (app.js). So it follows
// what happened to the character elsewhere: a Drużyna's trip moved by
// another member's "Przewiń" (src/server/time.js), a trip the leader sent
// it on while its page showed it at home or back with its report
// (src/server/parties.js), or a report claimed on another device. Before
// 10.11.2026 the page followed only a trip it already showed, so a member
// sent out by its leader stayed at home on its own screen until it left the
// page and came back (the author: „czasem robi sie błąd i nie pokazuje
// jednemu z graczy ze jest na wyprawie mimo ze jest drużynowo”).
export const activityMoved = (shown, endsAt) => endsAt !== undefined && endsAt !== (shown?.endsAt ?? null);

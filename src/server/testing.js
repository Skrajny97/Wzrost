// "Pomiń czas" in test mode (test-mode.js), and on the test version
// "Testuj samouczki": every tutorial from its start, and "Testuj zdarzenia":
// an event at the end of the next exploration, without the draw. For an
// account without test mode, and with test mode off, these routes do not
// exist.

import { construction, eventOutcome } from '../engine/index.js';
import { content, tutorialPart } from './content.js';
import { completeBuilding } from './camp.js';
import { characterRemoval, characterView, currentHp, loadPlayer, loadSettled, requirePlayer } from './characters.js';
import { eventDraftsOn, eventsOn, settlementOn } from './features.js';
import { ApiError, json, readJson } from './http.js';
import { requireSession } from './sessions.js';
import { testMode, testModeFor, tutorialTestsFor } from './test-mode.js';

const notFound = () => new ApiError(404, 'not_found', 'Nie znaleziono.');

// "Pomiń czas": the current wait ends now. A hunt is moved into the past, so
// its report can be claimed at once; its result still comes from the seed
// saved at the start. Without a hunt, HP is full again.
export async function skipTime(context) {
  if (!testMode(context.env)) throw notFound();
  const { session, player } = await requirePlayer(context);
  if (!testModeFor(context.env, session.user.login)) throw notFound();
  const db = context.env.DB;
  const now = context.now;
  const activity = player.activity;
  // Two seconds into the past, because the page shows the report a second
  // after the end. The work of the Awatar Systemu (avatar.js) ends with it.
  const end = (table, work) => {
    const shift = Math.max(0, work.ends_at - (now - 2000));
    return db
      .prepare(`UPDATE ${table} SET started_at = started_at - ?, ends_at = ends_at - ? WHERE character_id = ? AND started_at = ?`)
      .bind(shift, shift, player.row.id, work.started_at)
      .run();
  };
  if (player.avatarActivity) await end('avatar_activities', player.avatarActivity);
  if (activity) {
    await end('activities', activity);
  } else {
    const { maxHp } = currentHp(player, now);
    await db
      .prepare('UPDATE characters SET hp = ?, hp_at = ?, version = version + 1 WHERE id = ?')
      .bind(maxHp, now, player.row.id)
      .run();
  }
  return json({ character: characterView(await loadPlayer(db, session.userId), now) });
}

// "Pomiń czas" in the camp: the building being upgraded is ready now. With
// nothing being built, the stores of the production buildings are full.
export async function skipBuilding(context) {
  if (!testMode(context.env)) throw notFound();
  const { session, player } = await requirePlayer(context);
  if (!testModeFor(context.env, session.user.login)) throw notFound();
  const db = context.env.DB;
  const now = context.now;
  if (construction(player.buildings, now)) {
    await completeBuilding(db, player, now);
  } else {
    const filling = content.buildings.filter((building) => building.effect.kind === 'production' && player.buildings[building.id]);
    if (filling.length > 0) {
      await db.batch(
        filling.map((building) => {
          const { level } = player.buildings[building.id];
          const full = now - building.effect.storageHours * level * 3600000 - 1000;
          return db.prepare('UPDATE buildings SET collected_at = ? WHERE character_id = ? AND building_id = ?').bind(full, player.row.id, building.id);
        }),
      );
    }
  }
  // The next waiting build starts at once.
  return json({ character: characterView(await loadSettled(db, session.userId, now), now) });
}

// "Testuj samouczki": the character that waits aside while a test character
// goes through the introduction, if one does.
export async function tutorialTests(context) {
  const session = await requireTester(context);
  const parked = await parkedOf(context.env.DB, session.userId);
  return json({ parked: parked && { name: parked.name } });
}

// The outcomes of an event's lists that "Testuj zdarzenia" can choose: those
// with an id, drafts too.
const eventEndings = (event) =>
  [...event.options.map((option) => option.outcome), ...(event.cases ?? []).flatMap((one) => Object.values(one.outcomes))]
    .filter(Array.isArray)
    .flat()
    .filter((outcome) => outcome.id);

// The first case of an event in which an option leads to a list with the
// ending, or null.
const caseWithEnding = (event, endingId) =>
  (event.cases ?? []).find((one) => event.options.some((option) => [eventOutcome(option, one)].flat().some((outcome) => outcome?.id === endingId)))?.id ?? null;

// The choice stored in event_test: "event", "event:case", "event::ending"
// or "event:case:ending".
const storedTest = (value) => {
  const [eventId = null, caseId = null, endingId = null] = value ? value.split(':').map((part) => part || null) : [];
  return eventId ? { eventId, caseId, endingId } : null;
};

// "Testuj zdarzenia": the events there are with their cases and endings,
// and the one the next exploration brings at its end, if one was chosen.
export async function eventTests(context) {
  await requireTester(context);
  if (!eventsOn()) throw notFound();
  const { player } = await requirePlayer(context);
  return json({
    events: testableEvents().map((event) => ({
      id: event.id,
      title: event.name ?? event.title,
      draft: Boolean(event.draft),
      cases: (event.cases ?? []).map(({ id, name }) => ({ id, name })),
      endings: eventEndings(event).map(({ id, name }) => ({ id, name })),
    })),
    next: storedTest(player.row.event_test),
  });
}

// The events "Testuj zdarzenia" offers: every one, the drafts only where
// they are on (the test version), and those of the Osada only where it is.
const testableEvents = () => content.events.list.filter((event) => (eventDraftsOn() || !event.draft) && (settlementOn() || !event.settlement));

// "Przy następnym raporcie": the next exploration that ends as planned
// brings this event (`eventId`), in this case (`caseId`) or a drawn one
// (null), with this ending of a list (`endingId`), which picks a case that
// leads to it when none is given, or no event again (`eventId` null). The
// draw does not decide the event, and its play clears the choice (hunts.js).
export async function chooseTestEvent(context) {
  await requireTester(context);
  if (!eventsOn()) throw notFound();
  const { player } = await requirePlayer(context);
  const { eventId, caseId = null, endingId = null } = await readJson(context.request);
  const event = testableEvents().find((candidate) => candidate.id === eventId) ?? null;
  if (eventId !== null && !event) throw new ApiError(400, 'unknown_event', 'Nie ma takiego zdarzenia.');
  if (caseId !== null && !(event?.cases ?? []).some((candidate) => candidate.id === caseId)) throw new ApiError(400, 'unknown_case', 'To zdarzenie nie ma takiego przebiegu.');
  if (endingId !== null && !(event ? eventEndings(event) : []).some((ending) => ending.id === endingId)) {
    throw new ApiError(400, 'unknown_ending', 'To zdarzenie nie ma takiego zakończenia.');
  }
  const next = event && { eventId, caseId: endingId === null ? caseId : (caseId ?? caseWithEnding(event, endingId)), endingId };
  const stored = next ? [next.eventId, next.caseId ?? '', next.endingId ?? ''].join(':').replace(/:+$/, '') : null;
  await context.env.DB.prepare('UPDATE characters SET event_test = ? WHERE id = ?').bind(stored, player.row.id).run();
  return json({ next: next || null });
}

// "Wprowadzenie" from the start: the character waits aside (role 'parked'),
// out of the game, and the account makes a new one, which gets the
// introduction like any new character. One character waits at a time.
export async function testIntroduction(context) {
  const session = await requireTester(context);
  const { player } = await requirePlayer(context);
  const db = context.env.DB;
  if (await parkedOf(db, session.userId)) throw new ApiError(409, 'parked', 'Najpierw wróć do swojej postaci.');
  await db.prepare("UPDATE characters SET role = 'parked' WHERE id = ?").bind(player.row.id).run();
  return json({ parked: { name: player.row.name } });
}

// Back to the character that waited; the test character goes for good.
export async function backFromTest(context) {
  const session = await requireTester(context);
  const db = context.env.DB;
  const parked = await parkedOf(db, session.userId);
  if (!parked) throw new ApiError(409, 'not_parked', 'Żadna postać nie czeka.');
  const test = await db.prepare("SELECT id FROM characters WHERE user_id = ? AND role = 'player'").bind(session.userId).first();
  await db.batch([...(test ? characterRemoval(db, test.id) : []), db.prepare("UPDATE characters SET role = 'player' WHERE id = ?").bind(parked.id)]);
  return json({ character: characterView(await loadPlayer(db, session.userId), context.now) });
}

const parkedOf = (db, userId) => db.prepare("SELECT id, name FROM characters WHERE user_id = ? AND role = 'parked'").bind(userId).first();

async function requireTester(context) {
  const session = await requireSession(context);
  if (!tutorialTestsFor(context.env, session.user.login)) throw notFound();
  return session;
}

// The narrator's Umiejętności chapter from the start, to check it: the
// skills learned are forgotten, so their points come back, and the chapter's
// lines are unread again. It starts on any screen but a report.
export const repeatSkillsTour = (context) => repeatChapter(context, 'skills', "skills = '{}', ");

// The Profesje chapter from the start: only its lines are unread again, and
// the professions keep their levels. It starts on any screen but a report or
// the character's, after the Umiejętności chapter if that one waits too.
export const repeatProfessionsTour = (context) => repeatChapter(context, 'professions');

// The Społeczność chapter from the start: only its lines are unread again.
export const repeatCommunityTour = (context) => repeatChapter(context, 'community');

// The Rzemieślnictwo chapter from the start: only its lines are unread again,
// and the professions keep their levels.
export const repeatCraftingTour = (context) => repeatChapter(context, 'crafting');

// The Osada chapter from the start: only its lines are unread again.
export const repeatSettlementTour = (context) => repeatChapter(context, 'settlement');

// The Ewolucja chapter from the start: only its lines are unread again. It
// comes while the class has its evolutions to choose from.
export const repeatEvolutionTour = (context) => repeatChapter(context, 'evolution');

// A chapter's lines unread again, with `reset` (SQL assignments) done too.
async function repeatChapter(context, chapterId, reset = '') {
  await requireTester(context);
  const { session, player } = await requirePlayer(context);
  const row = player.row;
  if (row.tutorial === null) throw new ApiError(409, 'no_tutorial', 'Ta postać nie ma wprowadzenia.');
  const db = context.env.DB;
  const chapter = new Set(tutorialPart(chapterId));
  const read = JSON.parse(row.tutorial).filter((id) => !chapter.has(id));
  await db
    .prepare(`UPDATE characters SET ${reset}tutorial = ?, version = version + 1 WHERE id = ?`)
    .bind(JSON.stringify(read), row.id)
    .run();
  return json({ character: characterView(await loadPlayer(db, session.userId), context.now) });
}

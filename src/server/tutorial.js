// The narrator's introduction (data/tutorial.json): the page shows a card at
// its moment and tells the server once it has been read, so it is not shown
// again on another device. "Pomiń wprowadzenie" marks every card as read.

import { characterView, loadPlayer, requirePlayer } from './characters.js';
import { tutorialCards } from './content.js';
import { ApiError, json, readJson } from './http.js';

export async function seeTutorial(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const row = player.row;
  if (row.tutorial === null) throw new ApiError(409, 'no_tutorial', 'Ta postać nie ma wprowadzenia.');
  const db = context.env.DB;
  if (body.skip === true) {
    await db.prepare('UPDATE characters SET tutorial = ? WHERE id = ?').bind(JSON.stringify(tutorialCards), row.id).run();
  } else {
    if (!tutorialCards.includes(body.card)) throw new ApiError(400, 'invalid_card', 'Nie ma takiej karty narratora.');
    // Added in the database, so two cards read at once are both kept.
    await db
      .prepare(
        `UPDATE characters SET tutorial = json_insert(tutorial, '$[#]', ?)
         WHERE id = ? AND tutorial IS NOT NULL AND NOT EXISTS (SELECT 1 FROM json_each(characters.tutorial) WHERE value = ?)`,
      )
      .bind(body.card, row.id, body.card)
      .run();
  }
  return json({ character: characterView(await loadPlayer(db, session.userId), context.now) });
}

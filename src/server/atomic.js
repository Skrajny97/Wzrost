// Batches that hold together. D1 runs a batch as one transaction, so an
// assertion at its head fails the whole batch unless its condition holds:
// a write computed from a row read earlier never lands on a row that
// changed meanwhile (the code review: a claimed exploration undoing the
// potions sold in between, time skipped without paying, a reward given
// twice). json() of plain text is no JSON, and the error says so.

import { ApiError } from './http.js';

export const assertion = (db, condition, binds) => db.prepare(`SELECT CASE WHEN ${condition} THEN 1 ELSE json('nie') END AS ok`).bind(...binds);

// Whether a batch failed on its assertion.
export const raced = (error) => /malformed JSON/i.test(String(error?.message ?? error));

// The assertion that the character's row is still the one read (`row`).
export const sameVersion = (db, row) => assertion(db, '(SELECT version FROM characters WHERE id = ?) = ?', [row.id, row.version]);

export const characterChanged = () => new ApiError(409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.');

// Runs the batch; a failed assertion answers `changed()` (409).
export async function atomically(db, statements, changed = characterChanged) {
  try {
    return await db.batch(statements);
  } catch (error) {
    if (raced(error)) throw changed();
    throw error;
  }
}

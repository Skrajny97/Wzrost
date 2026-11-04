// The Bractwa's perks of a character: the number a perk of brotherhoodPerks
// (data/settlement.json, the author's answers 589–593) gives at the
// character's standing with its Bractwo, from the reputation kept in the
// Osada's state.

import { brotherhoodPerk } from '../engine/index.js';
import { content } from './content.js';

export const perkOf = (row, perkId) => brotherhoodPerk(perkId, JSON.parse(row.settlement ?? '{}').reputation ?? {}, content);

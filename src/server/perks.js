// The Bractwa's perks of a character: the number a perk of brotherhoodPerks
// (data/settlement.json, the author's answers 589–593) gives at the
// character's standing with its Bractwo, from the reputation kept in the
// Osada's state.

import { brotherhoodPerk, seatBonuses, withSeatDiscount } from '../engine/index.js';
import { content } from './content.js';

export const perkOf = (row, perkId) => brotherhoodPerk(perkId, JSON.parse(row.settlement ?? '{}').reputation ?? {}, content());

// The share of gold the Kowadło takes off for a character (as loaded by
// loadPlayer): its Bractwo Kowali's (590), then its guild's Kuźnia Gildii's
// (616 A, from the levels of its Siedziba) off the price that leaves.
export const anvilDiscountOf = (player) => withSeatDiscount(perkOf(player.row, 'anvilDiscount'), seatBonuses(player.guildSeat, content()).anvil);

// A sweep's moment in a fight's playback (arena.js): what the look of a
// skill at many (skill-fx.js; 962, 964) needs of the events that follow its
// call at the same moment. The engine logs a sweep as its call (a `skill`
// event with its `targets`, the foes it strikes) and then each of its blows.
// A blow meant for a foe whose summon stands lands on the summon instead:
// the summon takes the foes' blows meant for its summoner, a sweep's too,
// and the summoner keeps its HP (src/engine/combat.js, summonTakes). Such a
// hit comes as a `summon` event, marked as a sweep's since 25.11.2026, and
// the sweep's look lands on the summon's card, not on its summoner's. A
// player at level 97 (24.11.2026) saw the Deszcz meteorów fall on a
// Nekromanta, who lost nothing, and the skeleton's wound come after it as a
// blow of its own: „szkielet przyjmuje ten czar na siebie ale nie traci on
// życia”. A fight kept from before has no mark and plays as it did.

/**
 * The moment of the sweep called by the event at `at` (a `skill` event with
 * `targets`):
 * - `targets`: the cards its look lands on: its targets, a foe whose blow a
 *   summon took as that summon's card;
 * - `struck`: the cards its blows reach (not those that dodge or block them);
 * - `blows`: its blows in the order they land, the dodged ones too, each
 *   `{ target, hit }`;
 * - `affected`: the foes its effect takes hold of (the Klątwa rozkładu's);
 * - `felled`: the foes its blows fell (the Taniec kosy's souls);
 * - `turn`: which of its turns it is (Huragan stali turns twice).
 * `cardOf(event, fallen)`: the id of the card of the summon a `summon` event
 * is about, passing over the cards in `fallen` (summons that fell earlier in
 * the moment, so the next blow goes to the one behind), or null.
 * @param {Record<string, any>[]} events
 * @param {number} at
 * @param {(event: Record<string, any>, fallen: Set<string>) => string | null} cardOf
 */
export function sweepMoment(events, at, cardOf) {
  const event = events[at];
  /** @type {string[]} */
  const struck = [];
  /** @type {{ target: string, hit: boolean }[]} */
  const blows = [];
  /** @type {string[]} */
  const affected = [];
  /** @type {string[]} */
  const felled = [];
  /** @type {Set<string>} */
  const fallen = new Set();
  // A summoner whose blow its summon took → that summon's card (the first,
  // when one fell and the next took another blow).
  /** @type {Map<string, string>} */
  const decoys = new Map();
  for (let next = at + 1; next < events.length; next++) {
    const coming = events[next];
    if (coming.t !== event.t || coming.kind === 'skill') break;
    const own = coming.sweep && coming.actor === event.actor;
    if (coming.kind === 'summon') {
      if (coming.state !== 'hit' && coming.state !== 'fell') continue;
      const card = cardOf(coming, fallen);
      if (!card) continue;
      if (coming.state === 'fell') fallen.add(card);
      else if (own) {
        struck.push(card);
        blows.push({ target: card, hit: true });
        if (!decoys.has(coming.target)) decoys.set(coming.target, card);
      }
      continue;
    }
    if (own && (coming.kind === 'hit' || coming.kind === 'crit')) struck.push(coming.target);
    if (own && (coming.kind === 'hit' || coming.kind === 'crit' || coming.kind === 'dodge')) blows.push({ target: coming.target, hit: coming.kind !== 'dodge' });
    if (coming.kind === 'effect' && coming.actor === event.actor) affected.push(coming.target);
    if (coming.kind === 'kill' && struck.includes(coming.target)) felled.push(coming.target);
  }
  let turn = 1;
  for (let back = at - 1; back >= 0 && events[back].t === event.t; back--) {
    const earlier = events[back];
    if (earlier.kind === 'skill' && earlier.actor === event.actor && earlier.skill === event.skill) turn += 1;
  }
  const targets = (event.targets ?? []).map((/** @type {string} */ id) => decoys.get(id) ?? id);
  return { targets, struck, blows, affected, felled, turn };
}

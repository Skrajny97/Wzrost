// @ts-check
// The Stajnia in the Osada (data/settlement.json, `stable`; the author's
// 327 A: "postawimy Stajnie w Osadzie, gdzie możliwy będzie zakup
// Wierzchowców na stałe pozwalający przyspieszyć wyprawy"). The koniuszy
// sells mounts for good, one stage after another, each from a level of the
// character's: a higher stage takes the place of the lower. A mount shortens
// the wait for the end of every exploration of the character's own, by its
// `shorter` share: an hour with the first (5%) takes 57 minutes. Only the
// wait: the exploration's fights, rewards, XP and minutes stay those of the
// length chosen (hunts.js on the server sets its end with huntWait).
//
// Stored state: the stage of the mount in the character's Osada (`mount`:
// 1 for the first, none before one is bought).

/** @typedef {{ id: string, name: string, level: number, gold: number, shorter: number }} Mount */
/** @typedef {{ settlement?: { stable?: { mounts?: readonly Mount[] } } }} StableContent */

// The stages of the mounts in the data, the first at index 0.
/**
 * @param {StableContent} content
 * @returns {readonly Mount[]}
 */
const mountsOf = (content) => content.settlement?.stable?.mounts ?? [];

// The stage of the mount in the character's Osada as stored: 0 without
// one, and never above the last stage the data has.
/**
 * @param {{ mount?: unknown } | null | undefined} stored
 * @param {StableContent} content
 * @returns {number}
 */
export function mountStage(stored, content) {
  const stage = stored?.mount;
  return typeof stage === 'number' && Number.isInteger(stage) && stage > 0 ? Math.min(stage, mountsOf(content).length) : 0;
}

// The mount of `stage` (1 for the first), or null for none.
/**
 * @param {number} stage
 * @param {StableContent} content
 * @returns {Mount | null}
 */
export const mountOf = (stage, content) => (Number.isInteger(stage) && stage > 0 ? (mountsOf(content)[stage - 1] ?? null) : null);

// How long the character waits for the end of an exploration of `minutes`
// with the mount of `stage`, in milliseconds, to the whole second: the full
// length without one (stage 0).
/**
 * @param {number} minutes
 * @param {number} stage
 * @param {StableContent} content
 * @returns {number}
 */
export function huntWait(minutes, stage, content) {
  const shorter = mountOf(stage, content)?.shorter ?? 0;
  return Math.round(minutes * 60 * (1 - shorter)) * 1000;
}

// The character's mount for the page: its stage, id (its pictures), name
// and share, or null.
/**
 * @param {{ mount?: unknown } | null | undefined} stored
 * @param {StableContent} content
 */
export function mountView(stored, content) {
  const stage = mountStage(stored, content);
  const mount = mountOf(stage, content);
  return mount && { stage, id: mount.id, name: mount.name, shorter: mount.shorter };
}

// Why the character, with the mount of `owned` (0 for none), its `level`
// and `gold`, cannot buy the mount of `stage` now, as { code, message }, or
// null when it can: the stages go in order, each from its level, for its
// gold.
/**
 * @param {number} stage
 * @param {number} owned
 * @param {{ level: number, gold: number }} character
 * @param {StableContent} content
 * @returns {{ code: string, message: string } | null}
 */
export function mountBlock(stage, owned, { level, gold }, content) {
  const mounts = mountsOf(content);
  const mount = mountOf(stage, content);
  if (!mount) return { code: 'invalid_mount', message: 'Nie ma takiego wierzchowca.' };
  if (stage === owned) return { code: 'owned', message: 'Masz już tego wierzchowca.' };
  if (stage < owned) return { code: 'owned', message: 'Masz już lepszego wierzchowca.' };
  if (stage > owned + 1) return { code: 'mount_order', message: `Wierzchowce kupuje się po kolei. Najpierw: ${mounts[owned].name}.` };
  if (level < mount.level) return { code: 'locked', message: `${mount.name}: od ${mount.level}. poziomu postaci.` };
  if (gold < mount.gold) return { code: 'not_enough_gold', message: 'Brakuje złota.' };
  return null;
}

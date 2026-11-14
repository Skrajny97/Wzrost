// @ts-check
// Potions on explorations (data/professions.json: potions and potionUse).
// The player takes some along, each kind at most as many as the
// exploration's fights. In a fight the character drinks a healing potion the
// moment HP falls below the player's mark, a mana potion when a skill lacks
// mana, a cure the moment the effect it cures lands (an antidote for
// Zatrucie, the burn brew for Oparzenie, each a kind of its own) and the
// fern brew the moment it faints, each kind at most once a fight and the
// strongest of a kind first (combat.js). The fern brew saves the character
// once an exploration, so an exploration takes one along at most. A
// strengthening potion is drunk from the bag instead (speed, armour,
// damage, focus, the aconite oil on the blade, the mistletoe ward) and works
// in its number of the next fights of explorations (the author: "nakładamy
// na ilość walk w wyprawie a nie na czas"); each one drunk adds its fights
// to those left, and an exploration uses up the fights they worked in as its
// report is claimed, whenever they were drunk (claimWindows). Potions not
// drunk stay in the bag.

import { countedForm } from './text.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ id: string, effect: Record<string, number>, counted: string[], cures?: string, fights?: number }} Potion A potion of data/professions.json. */
/** @typedef {{ fights: number, bonus: number }} Buff */
/** @typedef {Record<string, Buff>} Buffs The strengthening potions at work, by kind. */
/** @typedef {{ id: string, accusative: string, amount: number, below?: number, cures?: string }} KitEntry */

// The kinds of a potion that works by itself in fights and of a potion for a
// time, as keys of its effect; a curse of an event (the god chased off, the
// soul robbed of its offerings) weakens the blows for a time as a potion
// strengthens them, and so do the wounds of an event (the river swum across,
// 817.4), and no potion has either.
export const FIGHT_KINDS = ['heal', 'mana', 'cure', 'revive'];
export const TIMED_KINDS = ['speed', 'armor', 'damage', 'focus', 'poison', 'ward', 'curse', 'wounds'];

// The kind of a potion that works by itself in fights, or null for one drunk
// from the bag.
/** @param {Potion} potion */
export const fightKind = (potion) => FIGHT_KINDS.find((kind) => potion.effect[kind]) ?? null;

// The kind of a potion for a time, or null.
/** @param {Potion} potion */
export const timedKind = (potion) => TIMED_KINDS.find((kind) => potion.effect[kind]) ?? null;

// The most of a potion an exploration with `fights` fights takes along: one
// fern brew, of the others one for each fight.
/**
 * @param {Potion} potion
 * @param {number} fights
 */
export const carryLimit = (potion, fights) => (potion.effect.revive ? 1 : fights);

// What a fight can drink from `left` (counts by id): for each kind the
// strongest potion of it still carried, with its strength and, for healing,
// the mark; of the cures one for each effect, by the effect it cures (an
// antidote for Zatrucie, the burn brew for Oparzenie: `cure` is
// { poisoned: …, burning: … }). On a tie the first in the data stays.
/**
 * @param {Record<string, number>} left
 * @param {number} healBelow
 * @param {Content} content
 * @returns {Record<string, any>}
 */
export function fightPotions(left, healBelow, content) {
  /** @type {Record<string, any>} */
  const kit = {};
  for (const potion of /** @type {Potion[]} */ (content.potions)) {
    const kind = fightKind(potion);
    if (!kind || !((left[potion.id] ?? 0) > 0)) continue;
    /** @type {KitEntry} */
    const entry = { id: potion.id, accusative: potion.counted[0], amount: potion.effect[kind], ...(kind === 'heal' && { below: healBelow }), ...(kind === 'cure' && { cures: potion.cures }) };
    const held = kind === 'cure' ? kit.cure?.[/** @type {string} */ (potion.cures)] : kit[kind];
    if (held && held.amount >= entry.amount) continue;
    if (kind === 'cure') kit.cure = { ...kit.cure, [/** @type {string} */ (potion.cures)]: entry };
    else kit[kind] = entry;
  }
  return kit;
}

// The oil on the blade for a poison buff of `bonus` (a blow's chance of
// Zatrucie): of the potions with poison the strongest whose chance the buff
// has, as a buff keeps the stronger of two oils drunk (addBuff), so the
// henbane oil's stronger Zatrucie comes with its chance; else the weakest.
// Its `dot` is what a blow lays on the foe.
/**
 * @param {number} bonus
 * @param {Content} content
 * @returns {Record<string, any> | null}
 */
export function bladeOil(bonus, content) {
  const oils = /** @type {Record<string, any>[]} */ (content.potions).filter((potion) => potion.effect.poison).sort((a, b) => a.effect.poison - b.effect.poison);
  return oils.findLast((potion) => potion.effect.poison <= bonus + 1e-9) ?? oils[0] ?? null;
}

// "2 walki", "1 walkę", "5 walk": a number of fights after "na" or "przez".
/**
 * @param {number} count
 * @param {Content} content
 */
export const fightsText = (count, content) => `${count} ${countedForm(count, content.potionUse.fightForms)}`;

// The fights of explorations the potions of a kind drunk still have.
/**
 * @param {Record<string, any> | null | undefined} buffs
 * @param {string} kind
 * @returns {number}
 */
export const buffLeft = (buffs, kind) => (Number.isFinite(buffs?.[kind]?.fights) ? buffs?.[kind].fights : 0);

// Buffs with `fights` more fights of a kind at `bonus` (the kind's own when
// not given), or fewer when below 0: a potion drunk adds its fights to those
// still left, a claimed report takes away those its potions worked in.
// Potions of one kind but of two strengths keep the stronger bonus, and the
// weaker one's fights shrink to what they are worth at it, to the nearest
// whole fight: 2 fights at 35% and 2 at 15% make 3 at 35%. The fights at the
// stronger bonus and those of the potion drunk stay whole.
/**
 * @param {Buffs | null | undefined} buffs
 * @param {string} kind
 * @param {number} fights
 * @param {number} [bonus]
 * @returns {Buffs}
 */
export function addBuff(buffs, kind, fights, bonus) {
  const { [kind]: before, ...rest } = buffs ?? {};
  const had = before?.bonus ?? 0;
  const strength = bonus ?? had;
  const top = Math.max(had, strength);
  const left = top > 0 ? Math.round((buffLeft(buffs, kind) * had + fights * strength) / top) : 0;
  return left > 0 ? { ...rest, [kind]: { fights: left, bonus: top } } : rest;
}

// Buffs after a strengthening potion drunk from the bag; `extra` fights more
// with the Bractwo Zielarzy (589 C, potionFights).
/**
 * @param {Buffs | null | undefined} buffs
 * @param {Potion} potion
 * @param {number} [extra]
 */
export function drinkTimed(buffs, potion, extra = 0) {
  const kind = /** @type {string} */ (timedKind(potion));
  return addBuff(buffs, kind, /** @type {number} */ (potion.fights) + extra, potion.effect[kind]);
}

// Buffs as a character's row keeps them, in fights. Those kept in time before
// 0.1.26 (milliseconds of explorations, or a speed potion's end from before
// 0.0.74) count a fight for every `minutesPerFight` minutes, a part of one
// as a whole one: the half hour of a potion makes its 2 fights.
/**
 * @param {Record<string, any> | null | undefined} stored
 * @param {number} now
 * @param {Content} content
 * @returns {Buffs}
 */
export function storedBuffs(stored, now, content) {
  const perFight = content.potionUse.minutesPerFight * 60000;
  /** @type {Buffs} */
  const buffs = {};
  for (const [kind, buff] of Object.entries(stored ?? {})) {
    const ms = Number.isFinite(buff?.ms) ? buff.ms : Math.max(0, (buff?.until ?? now) - now);
    const fights = Number.isFinite(buff?.fights) ? buff.fights : Math.ceil(ms / perFight);
    if (fights > 0 && buff?.bonus > 0) buffs[kind] = { fights, bonus: buff.bonus };
  }
  return buffs;
}

// What the potions drunk cover of an exploration, from its first fight, by
// kind: their bonus and fights.
/**
 * @param {Buffs | null | undefined} buffs
 * @returns {Buffs}
 */
export function buffWindows(buffs) {
  /** @type {Buffs} */
  const windows = {};
  for (const kind of TIMED_KINDS) {
    const left = buffLeft(buffs, kind);
    if (left > 0) windows[kind] = { bonus: /** @type {Buffs} */ (buffs)[kind].bonus, fights: left };
  }
  return windows;
}

// The windows an exploration keeps in its options: by kind, or a speed
// potion's alone, as explorations started before the other kinds kept it.
/**
 * @param {Record<string, any> | null | undefined} options
 * @returns {Buffs}
 */
export const optionWindows = (options) => options?.buffs ?? (options?.speed ? { speed: options.speed } : {});

// What the strengthening potions cover of an exploration as its report is
// claimed, and whether the fights they work in are used up then (the author:
// "Ten czas powinien schodzić dopiero po kliknięciu Odbierz raport ... nawet
// jeśli mikstury zostały zażyte w czasie wyprawy lub na chwilę przed
// Odebraniem raportu"): those at work now (`buffs`), drunk before it set out,
// on the way or after it came back, from its first fight as far as their
// fights go. A Drużyna's trip (`fixed`) keeps the windows it set out with,
// as its fights are the same for all who went; one started before 0.0.74
// had its time taken at its start, so it keeps its windows and uses up
// nothing more.
/**
 * @param {Record<string, any> | null | undefined} options
 * @param {Buffs | null | undefined} buffs
 * @returns {{ windows: Buffs, spends: boolean }}
 */
export function claimWindows(options, buffs, fixed = false) {
  const kept = optionWindows(options);
  if (options?.spend !== 'claim' && Object.keys(kept).length > 0) return { windows: kept, spends: false };
  return { windows: fixed ? kept : buffWindows(buffs), spends: true };
}

// Buffs less the fights the strengthening potions worked in on an
// exploration (`used` by kind: its report's buffFights), at the bonus of its
// windows.
/**
 * @param {Buffs | null | undefined} buffs
 * @param {Buffs} windows
 * @param {Record<string, number> | null | undefined} used
 * @returns {Buffs}
 */
export function spendFights(buffs, windows, used) {
  let after = buffs ?? {};
  for (const [kind, window] of Object.entries(windows)) {
    const count = used?.[kind] ?? 0;
    if (count > 0) after = addBuff(after, kind, -count, window.bonus);
  }
  return after;
}

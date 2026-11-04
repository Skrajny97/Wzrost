// Potions on explorations (data/professions.json: potions and potionUse).
// The player takes some along, each kind at most as many as the
// exploration's fights. In a fight the character drinks a healing potion the
// moment HP falls below the player's mark, a mana potion when a skill lacks
// mana, an antidote the moment it is poisoned and the fern brew the moment it
// faints, each kind at most once a fight and the strongest of a kind first
// (combat.js). The fern brew saves the character once an exploration, so an
// exploration takes one along at most. A strengthening potion is drunk from
// the bag instead (speed, armour, damage, focus, the aconite oil on the
// blade, the mistletoe ward) and works in its number of the next fights of
// explorations (the author: "nakładamy na ilość walk w wyprawie a nie na
// czas"); each one drunk adds its fights to those left, and an exploration
// uses up the fights they worked in as its report is claimed, whenever they
// were drunk (claimWindows). Potions not drunk stay in the bag.

import { countedForm } from './text.js';

// The kinds of a potion that works by itself in fights and of a potion for a
// time, as keys of its effect; a curse of an event (the god chased off, the
// soul robbed of its offerings) weakens the blows for a time as a potion
// strengthens them, and no potion has it.
export const FIGHT_KINDS = ['heal', 'mana', 'cure', 'revive'];
export const TIMED_KINDS = ['speed', 'armor', 'damage', 'focus', 'poison', 'ward', 'curse'];

// The kind of a potion that works by itself in fights, or null for one drunk
// from the bag.
export const fightKind = (potion) => FIGHT_KINDS.find((kind) => potion.effect[kind]) ?? null;

// The kind of a potion for a time, or null.
export const timedKind = (potion) => TIMED_KINDS.find((kind) => potion.effect[kind]) ?? null;

// The most of a potion an exploration with `fights` fights takes along: one
// fern brew, of the others one for each fight.
export const carryLimit = (potion, fights) => (potion.effect.revive ? 1 : fights);

// What a fight can drink from `left` (counts by id): for each kind the
// strongest potion of it still carried, with its strength and, for healing,
// the mark, for an antidote the effect it cures.
export function fightPotions(left, healBelow, content) {
  const kit = {};
  for (const potion of content.potions) {
    const kind = fightKind(potion);
    if (!kind || !((left[potion.id] ?? 0) > 0) || (kit[kind] && kit[kind].amount >= potion.effect[kind])) continue;
    kit[kind] = { id: potion.id, accusative: potion.counted[0], amount: potion.effect[kind], ...(kind === 'heal' && { below: healBelow }), ...(kind === 'cure' && { cures: potion.cures }) };
  }
  return kit;
}

// "2 walki", "1 walkę", "5 walk": a number of fights after "na" or "przez".
export const fightsText = (count, content) => `${count} ${countedForm(count, content.potionUse.fightForms)}`;

// The fights of explorations the potions of a kind drunk still have.
export const buffLeft = (buffs, kind) => (Number.isFinite(buffs?.[kind]?.fights) ? buffs[kind].fights : 0);

// Buffs with `fights` more fights of a kind at `bonus` (the kind's own when
// not given), or fewer when below 0: a potion drunk adds its fights to those
// still left, a claimed report takes away those its potions worked in.
// Potions of one kind but of two strengths keep the stronger bonus, and the
// weaker one's fights shrink to what they are worth at it, to the nearest
// whole fight: 2 fights at 35% and 2 at 15% make 3 at 35%. The fights at the
// stronger bonus and those of the potion drunk stay whole.
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
export function drinkTimed(buffs, potion, extra = 0) {
  const kind = timedKind(potion);
  return addBuff(buffs, kind, potion.fights + extra, potion.effect[kind]);
}

// Buffs as a character's row keeps them, in fights. Those kept in time before
// 0.1.26 (milliseconds of explorations, or a speed potion's end from before
// 0.0.74) count a fight for every `minutesPerFight` minutes, a part of one
// as a whole one: the half hour of a potion makes its 2 fights.
export function storedBuffs(stored, now, content) {
  const perFight = content.potionUse.minutesPerFight * 60000;
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
export function buffWindows(buffs) {
  const windows = {};
  for (const kind of TIMED_KINDS) {
    const left = buffLeft(buffs, kind);
    if (left > 0) windows[kind] = { bonus: buffs[kind].bonus, fights: left };
  }
  return windows;
}

// The windows an exploration keeps in its options: by kind, or a speed
// potion's alone, as explorations started before the other kinds kept it.
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
export function claimWindows(options, buffs, fixed = false) {
  const kept = optionWindows(options);
  if (options?.spend !== 'claim' && Object.keys(kept).length > 0) return { windows: kept, spends: false };
  return { windows: fixed ? kept : buffWindows(buffs), spends: true };
}

// Buffs less the fights the strengthening potions worked in on an
// exploration (`used` by kind: its report's buffFights), at the bonus of its
// windows.
export function spendFights(buffs, windows, used) {
  let after = buffs ?? {};
  for (const [kind, window] of Object.entries(windows)) {
    const count = used?.[kind] ?? 0;
    if (count > 0) after = addBuff(after, kind, -count, window.bonus);
  }
  return after;
}

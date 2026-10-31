// Potions on explorations (data/professions.json: potions and potionUse).
// The player takes some along, each kind at most as many as the
// exploration's fights. In a fight the character drinks a healing potion the
// moment HP falls below the player's mark, a mana potion when a skill lacks
// mana, an antidote the moment it is poisoned and the fern brew the moment it
// faints, each kind at most once a fight and the strongest of a kind first
// (combat.js). The fern brew saves the character once an exploration, so an
// exploration takes one along at most. A potion for a time is drunk from the
// bag instead (speed, armour, damage, focus, the aconite oil on the blade,
// the mistletoe ward) and works in the fights of its minutes, which pass only
// on explorations; each one drunk adds its minutes to those left. Potions
// not drunk stay in the bag.

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

// The milliseconds of explorations the potions of a kind drunk still have.
export const buffLeft = (buffs, kind) => (Number.isFinite(buffs?.[kind]?.ms) ? buffs[kind].ms : 0);

// Buffs with `ms` more of a kind's time at `bonus` (the kind's own when not
// given), or less when below 0: a potion drunk adds its minutes to those
// still left, an exploration takes what it covers and gives back what it did
// not use. Potions of one kind but of two strengths keep the stronger bonus,
// and the weaker one's minutes shrink to what they are worth at it: 30 minutes
// at 35% and 30 at 15% make about 43 at 35%.
export function addBuff(buffs, kind, ms, bonus) {
  const { [kind]: before, ...rest } = buffs ?? {};
  const had = before?.bonus ?? 0;
  const strength = bonus ?? had;
  const top = Math.max(had, strength);
  const left = top > 0 ? Math.round((buffLeft(buffs, kind) * had + ms * strength) / top) : 0;
  return left > 0 ? { ...rest, [kind]: { ms: left, bonus: top } } : rest;
}

// Buffs after a potion for a time drunk from the bag.
export function drinkTimed(buffs, potion) {
  const kind = timedKind(potion);
  return addBuff(buffs, kind, potion.minutes * 60000, potion.effect[kind]);
}

// What of an exploration of `minutes` the potions drunk before cover, from
// its start, by kind: their bonus and milliseconds.
export function buffWindows(buffs, minutes) {
  const windows = {};
  for (const kind of TIMED_KINDS) {
    const left = buffLeft(buffs, kind);
    if (left > 0) windows[kind] = { bonus: buffs[kind].bonus, ms: Math.min(left, minutes * 60000) };
  }
  return windows;
}

// The windows an exploration keeps in its options: by kind, or a speed
// potion's alone, as explorations started before the other kinds kept it.
export const optionWindows = (options) => options?.buffs ?? (options?.speed ? { speed: options.speed } : {});

// Buffs less the time an exploration's windows cover, as it starts.
export function spendWindows(buffs, windows) {
  let after = buffs ?? {};
  for (const [kind, window] of Object.entries(windows)) after = addBuff(after, kind, -window.ms, window.bonus);
  return after;
}

// Buffs with the time back that the windows of an exploration called back
// `used` milliseconds after its start did not use.
export function returnWindows(buffs, windows, used) {
  let after = buffs ?? {};
  for (const [kind, window] of Object.entries(windows)) {
    const unused = Math.max(0, window.ms - used);
    if (unused > 0) after = addBuff(after, kind, unused, window.bonus);
  }
  return after;
}

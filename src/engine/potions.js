// Potions on explorations (data/professions.json: potions and potionUse).
// The player takes some along, each kind at most as many as the
// exploration's fights. In a fight the character drinks a healing potion the
// moment HP falls below the player's mark and a mana potion when a skill
// lacks mana, each kind at most once a fight (combat.js). A speed potion is
// drunk from the bag instead and speeds up the moves in the fights of its
// minutes, which pass only on explorations. Potions not drunk stay in the
// bag.

// The kind of a potion that works by itself in fights: heal, mana, or null
// for one drunk from the bag (speed).
export const fightKind = (potion) => (potion.effect.heal ? 'heal' : potion.effect.mana ? 'mana' : null);

// What a fight can drink from `left` (counts by id): for each kind the first
// potion of it still carried, with its strength and, for healing, the mark.
export function fightPotions(left, healBelow, content) {
  const kit = {};
  for (const potion of content.potions) {
    const kind = fightKind(potion);
    if (!kind || kit[kind] || !((left[potion.id] ?? 0) > 0)) continue;
    kit[kind] = { id: potion.id, accusative: potion.counted[0], amount: potion.effect[kind], ...(kind === 'heal' && { below: healBelow }) };
  }
  return kit;
}

// The milliseconds of explorations the speed potions drunk still have.
export const speedLeft = (buffs) => (Number.isFinite(buffs?.speed?.ms) ? buffs.speed.ms : 0);

// Buffs with `ms` more of a speed potion's time, or less when below 0: a
// potion drunk adds its minutes to those still left, an exploration takes
// what it covers and gives back what it did not use.
export function addSpeed(buffs, ms, bonus) {
  const { speed, ...rest } = buffs ?? {};
  const left = speedLeft(buffs) + ms;
  return left > 0 ? { ...rest, speed: { ms: left, bonus: Math.max(speed?.bonus ?? 0, bonus ?? 0) } } : rest;
}

export const drinkSpeed = (buffs, potion) => addSpeed(buffs, potion.minutes * 60000, potion.effect.speed);

// What of an exploration of `minutes` the speed potions drunk before cover,
// from its start: their bonus and milliseconds, or null.
export function speedWindow(buffs, minutes) {
  const left = speedLeft(buffs);
  return left > 0 ? { bonus: buffs.speed.bonus, ms: Math.min(left, minutes * 60000) } : null;
}

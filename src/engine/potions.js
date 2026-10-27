// Potions on explorations (data/professions.json: potions and potionUse).
// The player takes some along, each kind at most as many as the
// exploration's fights. In a fight the character drinks a healing potion the
// moment HP falls below the player's mark and a mana potion when a skill
// lacks mana, each kind at most once a fight (combat.js). A speed potion is
// drunk from the bag instead and speeds up the moves in the fights of its
// minutes. Potions not drunk stay in the bag.

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

// A speed potion drunk at `now`: its minutes from now, or added to those
// still left of the one before.
export function drinkSpeed(buffs, potion, now) {
  const until = Math.max(now, buffs?.speed?.until ?? 0) + potion.minutes * 60000;
  return { ...buffs, speed: { until, bonus: potion.effect.speed } };
}

// What of an exploration of `minutes` from `now` a speed potion drunk before
// covers: its bonus and the milliseconds it still lasts, or null.
export function speedWindow(buffs, now, minutes) {
  const speed = buffs?.speed;
  if (!speed || speed.until <= now) return null;
  return { bonus: speed.bonus, ms: Math.min(speed.until - now, minutes * 60000) };
}

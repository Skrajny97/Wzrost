// Combatants: the player character and monsters reduced to the same shape, so
// the combat code treats both alike (and later companions or other players).

import { evolutionOf, perClassLevelOf } from './evolutions.js';
import { budget, cappedChance, damageScale, maxHp, maxMana, speed, weaponDamage } from './formulas.js';
import { upgradedItem } from './items.js';
import { gearLevel, midGameShare } from './progression.js';
import { learnedSkills } from './skills.js';
import { computeStats } from './stats.js';

// From the 10th level of the character the explorations are harder (the
// author, 5.11.2026: 628 B, 629 A, "wszystkim zwiększamy stwory
// 1,5-krotnie" and "od 10-ego poziomu postaci wchodzą te duże zmiany
// trudności"): balance.challenge from its level on, null before it.
export const challengeAt = (level, content) => (level >= content.balance.challenge.fromLevel ? content.balance.challenge : null);

// `statBoost`: shares some stats are raised by for a while, by stat (a
// potion of focus, potions.js).
export function playerCombatant({ character, equipped, hp, name, area, id = 'a0', side = 'ally', statBoost = null }, content) {
  const balance = content.balance;
  const { totals: stats, bonuses } = computeStats(character, equipped, content);
  const totals = statBoost ? Object.fromEntries(Object.entries(stats).map(([stat, value]) => [stat, Math.round(value * (1 + (statBoost[stat] ?? 0)))])) : stats;
  const weaponItem = equipped.find((item) => item.slot === 'weapon');
  const weapon = weaponItem ? itemWeapon(weaponItem, content) : unarmed(character.level, content);
  let armor = bonuses.armor + totals.endurance * balance.combat.armorPerEndurance;
  if (area?.trait.frontArmorBonus && character.position === 'front') armor *= 1 + area.trait.frontArmorBonus;
  // Szuwary: the back of the line hides in the reeds.
  const dodgeBonus = character.position === 'back' ? (area?.trait.backDodgeBonus ?? 0) : 0;
  const cls = content.classesById[character.classId];
  const perClassLevel = perClassLevelOf(character, content);
  const hpMax = maxHp(totals.vitality, character.classLevel, perClassLevel, balance);
  // The evolution's trait (evolutions.js) works in fights (combat.js); some
  // shape the character itself: Opoka's armour and resistances, Arkana's
  // mana, Krok cienia's speed, and the shelter of Zimowy oddech and Toksyny
  // (a share less of the damage of their element, blows and effects).
  const evolution = evolutionOf(character, content);
  const feat = evolution ? { kind: evolution.trait.kind, name: evolution.trait.name, ...evolution.trait.params } : null;
  const manaMax = maxMana(totals.wisdom, character.classLevel, perClassLevel, balance);
  const resist = { ...bonuses.resist };
  if (feat?.kind === 'bulwark') {
    armor *= 1 + feat.armor;
    for (const element of Object.keys(resist)) resist[element] = Math.round(resist[element] * (1 + feat.resist));
  }
  // (Żniwo, the Nekromanta's trait grown from Toksyny, gives none.)
  const shelter = feat?.resist ? { winter: 'frost', toxins: 'poison' }[feat.kind] : undefined;
  return {
    id,
    side,
    name,
    isPlayer: true,
    classId: character.classId,
    appearance: character.appearance,
    skin: character.skin,
    // The evolution's portrait in the playback.
    ...(character.evolution && { evolution: character.evolution }),
    family: 'player',
    elite: false,
    position: character.position,
    level: character.level,
    maxHp: hpMax,
    hp: Math.min(hp ?? hpMax, hpMax),
    weapon,
    scalingValue: totals[weapon.scaling],
    damageScale: damageScale(totals[weapon.scaling], character.level, balance),
    armor: Math.round(armor),
    resist,
    ...(shelter && { shelter: { [shelter]: feat.resist } }),
    dodgeRating: totals.dexterity * balance.combat.dodgePerDexterity * (1 + dodgeBonus),
    critRating: totals.perception * balance.combat.critPerPerception,
    willRating: totals.will * balance.combat.willPerPoint,
    speed: speed(totals.dexterity, character.level, balance) * (feat?.kind === 'shadowStep' ? 1 + feat.speed : 1),
    // Skills and the mana they spend, full at the start of every fight;
    // Wisdom also strengthens healing.
    maxMana: feat?.kind === 'arcana' ? Math.round(manaMax * (1 + feat.mana)) : manaMax,
    wisdom: totals.wisdom,
    skills: learnedSkills(character, content),
    ...(feat && { feat }),
    // The share of the missing HP back after a won fight on an exploration:
    // less from the challenge's level (628 B).
    recovery:
      (challengeAt(character.level, content)?.recoveryAfterFight ?? balance.hunt.recoveryAfterFight) +
      cls.recovery.base +
      cls.recovery.perWisdom * totals.wisdom +
      (area?.trait.recoveryBonus ?? 0),
  };
}

// How a strike looks in the fight animation: a blow, an arrow or a spell.
const strikeOf = (strike, category) => strike ?? (category === 'magical' ? 'magic' : 'melee');

function itemWeapon(worn, content) {
  const item = upgradedItem(worn, content);
  const base = content.basesById[item.base];
  return {
    attackName: base.attackName,
    category: base.category,
    strike: strikeOf(base.strike, base.category),
    sound: base.sound,
    element: item.element,
    scaling: base.scaling,
    min: item.damage.min,
    max: item.damage.max,
    // The Zaklinaczka's zaklęcie żywiołu: a share of every blow in an
    // element (settlement.js, combat.js).
    ...(item.imbue?.share && { imbue: item.imbue }),
  };
}

// Without a weapon the character fights with its fists, which hit like a weak
// common weapon of its level.
function unarmed(level, content) {
  const balance = content.balance;
  const { attackName, damageFactor, variance } = balance.combat.unarmed;
  const average = weaponDamage(budget(level, content.rarities[0].budget, balance), damageFactor, balance);
  const min = Math.max(1, Math.round(average * (1 - variance)));
  return { attackName, category: 'physical', strike: 'melee', sound: 'fist', scaling: 'strength', min, max: Math.max(min, Math.round(average * (1 + variance))) };
}

// How much harder the creatures of the newest place are for a character of
// a level, as [damage, HP] multipliers (balance.monsters.huntCurve: points
// [level, damage, hp] by the character's level, straight between two
// points, none before the first and as the last past it). The author,
// 4.11.2026: harder from the 10th level (613 C), between "średnio-wysoko
// dla okazjonalnych, średnio dla zaangażowanych" and "mocno" (611), and no
// stronger creatures for the companions or a party along (612 C: "musi byc
// motywacja do drużyny/towarzyszy").
export function huntStrength(level, curve = []) {
  if (curve.length === 0 || level < curve[0][0]) return [1, 1];
  const next = curve.findIndex(([at]) => at > level);
  if (next === -1) return [curve.at(-1)[1], curve.at(-1)[2]];
  const [fromLevel, fromDamage, fromHp] = curve[next - 1];
  const [toLevel, toDamage, toHp] = curve[next];
  const share = (level - fromLevel) / (toLevel - fromLevel);
  return [fromDamage + (toDamage - fromDamage) * share, fromHp + (toHp - fromHp) * share];
}

// The strength of an exploration's creatures: in the place that holds the
// character's level, all of them, the elite and the champion too, as
// huntStrength says for its level, so that the place stays as hard from its
// first level to its last; in a higher place (one opens a level before its
// first, unlocks.js) as for its first level; a lower place as before. A
// single multiplier for a whole place was tried: the characters grow so much
// within a place's five levels that the place, as hard as the author asked
// in its middle, cost the first fight almost always on its first level (91%
// at the 11th) and little on its last.
// From the level of the challenge's strength every exploration's creatures,
// in any place, are stronger again by its damage and HP (the author:
// "wszystkim zwiększamy stwory"), and from the challenge's level those of a
// Trudna wyprawa (`hard`, 629 A) by its hard ones on top.
export function exploreStrength(area, level, content, hard = false) {
  const [damage, hp] = area.maxLevel < level ? [1, 1] : huntStrength(Math.max(level, area.minLevel), content.balance.monsters.huntCurve);
  const challenge = challengeAt(level, content);
  if (!challenge) return [damage, hp];
  const base = level >= challenge.strength.fromLevel ? challenge.strength : { damage: 1, hp: 1 };
  const more = hard ? challenge.hard : { damage: 1, hp: 1 };
  return [damage * base.damage * more.damage, hp * base.hp * more.hp];
}

// `groupFactor` weakens each member of a group, so two or three monsters are
// harder than one, but not two or three times harder.
// `growth` is the share of the late and end game's growth the monster has:
// a fight where the character stands alone (the Wieża Solo, an event's
// fight) gives it balance.monsters.soloGrowth of it (the author: 438.3 A).
// `strength`: the [damage, HP] multipliers of a creature met on an
// exploration of the newest place (or in the danger estimate's sample
// fights there), exploreStrength; the Wieże, the events' fights and the
// Bestia Gildii keep their own measure.
export function monsterCombatant({ monsterId, level, id, name, position, side = 'enemy', groupFactor = 1, growth = 1, strength = [1, 1] }, content) {
  const balance = content.balance;
  const monster = content.monstersById[monsterId];
  const stat = (key) => (monster.stats.base[key] ?? 0) + (monster.stats.growth[key] ?? 0) * (level - 1);
  // A monster's natural weapon and hide match the items a character usually
  // wears at its level (gearLevel), so at the fast first levels they lag
  // behind like the character's.
  const hide = balance.monsters.budgetBase + balance.items.budgetPerLevel * gearLevel(level, content);
  // Through the mid-game monsters hit harder and last longer, a little more
  // with each level (midGameShare in progression.js).
  const mid = balance.monsters.midGame;
  const stronger = midGameShare(level, mid);
  // From Omszałe Głazy on (coop.fromLevel), a little harder for the parties
  // that may go there (parties.js; the author: "zwiększ poziom trudności o
  // trochę od 25 lvla Postaci, czyli od Omszałych Głazów w górę").
  const coop = level >= balance.monsters.coop.fromLevel ? balance.monsters.coop : { damage: 0, hp: 0 };
  // From level 50 on, where companions and evolutions are in full play, they
  // grow stronger again, the same way (the author: "Od 50 lvla zwiększamy
  // curve trudności, bo wchodza na pełnej i towarzysze i ewolucje").
  const late = balance.monsters.lateGame;
  const later = midGameShare(level, late) * growth;
  // Past the second evolution (endGame), as the characters' skills and gear
  // keep growing, they grow on once more, the same way.
  const end = balance.monsters.endGame;
  const latest = midGameShare(level, end) * growth;
  const [huntDamage, huntHp] = strength;
  const average =
    weaponDamage(hide, monster.attack.damageFactor, balance) *
    balance.monsters.damageMultiplier *
    groupFactor *
    (1 + mid.damage * stronger) *
    (1 + coop.damage) *
    (1 + late.damage * later) *
    (1 + end.damage * latest) *
    huntDamage;
  const resist = {};
  for (const [element, value] of Object.entries(monster.resistances ?? {})) {
    resist[element] = Math.round(value.base + value.perLevel * (level - 1));
  }
  const rawHp = balance.monsters.hpBase + balance.character.hpPerVitality * stat('vitality') + balance.monsters.hpPerLevel * level;
  const hpMax = Math.max(1, Math.round(rawHp * monster.hpFactor * groupFactor * (1 + mid.hp * stronger) * (1 + coop.hp) * (1 + late.hp * later) * (1 + end.hp * latest) * huntHp));
  return {
    id,
    side,
    name: name ?? monster.name,
    isPlayer: false,
    monsterId,
    family: monster.family,
    elite: Boolean(monster.elite),
    champion: Boolean(monster.champion),
    // Zasadzka (464): a fight with this creature starts with the creatures'
    // moves (combat.js).
    ...(monster.ambush && { ambush: true }),
    groupFactor,
    position: position ?? monster.position,
    level,
    maxHp: hpMax,
    hp: hpMax,
    weapon: {
      attackName: monster.attack.name,
      category: monster.attack.category,
      strike: strikeOf(monster.attack.strike, monster.attack.category),
      sound: monster.attack.sound,
      element: monster.attack.element,
      scaling: monster.attack.scaling,
      min: average * (1 - monster.attack.variance),
      max: average * (1 + monster.attack.variance),
      dot: monster.attack.dot,
      // Ugrzęźnięcie and Wysysanie (combat.js).
      slow: monster.attack.slow,
      drain: monster.attack.drain,
      // Atak na tył szyku (463): its blows go to the one standing furthest
      // back (combat.js).
      ...(monster.attack.target && { target: monster.attack.target }),
    },
    scalingValue: stat(monster.attack.scaling),
    damageScale: damageScale(stat(monster.attack.scaling), level, balance),
    armor: Math.round(hide * balance.items.armorPerBudget * monster.armorFactor + stat('endurance') * balance.combat.armorPerEndurance),
    resist,
    // More damage from these elements, e.g. { fire: 0.5 }: half as much again.
    weak: monster.weaknesses,
    dodgeRating: stat('dexterity') * balance.combat.dodgePerDexterity,
    critRating: stat('perception') * balance.combat.critPerPerception,
    willRating: stat('will') * balance.combat.willPerPoint,
    speed: speed(stat('dexterity'), level, balance),
    recovery: 0,
  };
}

// What the report shows when a participant's stats are expanded with "+".
export function combatantView(unit, opponentLevel, content) {
  const balance = content.balance;
  const scale = unit.damageScale;
  const percent = (value) => Math.round(value * 100);
  return {
    id: unit.id,
    side: unit.side,
    name: unit.name,
    level: unit.level,
    position: unit.position,
    family: unit.family,
    classId: unit.classId,
    // A character's look: its portrait (its evolution's, once it has one)
    // and voice in the playback.
    appearance: unit.appearance,
    skin: unit.skin,
    evolution: unit.evolution,
    monsterId: unit.monsterId,
    // A companion from the Karczma shows its own bust (question 107 B).
    ...(unit.companion && { companion: true }),
    elite: unit.elite,
    champion: unit.champion ?? false,
    maxHp: unit.maxHp,
    hp: unit.hp,
    attack: unit.weapon.attackName,
    strike: unit.weapon.strike,
    // The kind of hit sound (data/sounds.json).
    sound: unit.weapon.sound ?? null,
    element: unit.weapon.element ?? null,
    damage: `${Math.round(unit.weapon.min * scale)}–${Math.round(unit.weapon.max * scale)}`,
    armor: unit.armor,
    dodge: percent(cappedChance(unit.dodgeRating, opponentLevel, balance.combat.dodgeCap, balance)),
    crit: percent(cappedChance(unit.critRating, opponentLevel, balance.combat.critCap, balance)),
    speed: Math.round(unit.speed * 100) / 100,
  };
}

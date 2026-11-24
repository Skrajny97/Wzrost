// @ts-check
// Combatants: the player character and monsters reduced to the same shape, so
// the combat code treats both alike (and later companions or other players).

import { coreEffects } from './core.js';
import { evolutionOf, perClassLevelOf } from './evolutions.js';
import { budget, cappedChance, damageScale, maxHp, maxMana, potionBonus, speed, weaponDamage } from './formulas.js';
import { gearDamageOf, gearElementOf, gearKey, statAsOf, weaponScalingOf } from './gear.js';
import { upgradedItem, wornNow } from './items.js';
import { gearLevel, midGameShare } from './progression.js';
import { learnedSkills, manaCostRule, skillMana } from './skills.js';
import { sideStats } from './side-stats.js';
import { computeStats } from './stats.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {Record<string, any>} Character A character, as its row keeps it. */
/** @typedef {Record<string, any>} Item An item as the character's gear keeps it. */
/** @typedef {Record<string, any>} Area An inner region (content.areas). */
/** @typedef {Record<string, any>} Combatant A fighter as combat.js takes it: a character, a creature or a companion. */

// From the 10th level of the character the explorations are harder (the
// author, 5.11.2026: 628 B, 629 A, "wszystkim zwiększamy stwory
// 1,5-krotnie" and "od 10-ego poziomu postaci wchodzą te duże zmiany
// trudności"): balance.challenge from its level on, null before it.
/**
 * @param {number} level
 * @param {Content} content
 * @returns {Record<string, any> | null}
 */
export const challengeAt = (level, content) => (level >= content.balance.challenge.fromLevel ? content.balance.challenge : null);

// An exploration's challenge (`hard`): false for a plain one, true for a
// Trudna wyprawa (629 A), 'hell' for a Piekielna (the author, 19.11.2026:
// „2 razy trudniejsza niz Trudna wyprawa 1,5x lepszy drop”). Its numbers
// (challenge.hard or challenge.hell) from the challenge's level, null for a
// plain one or before that level.
/**
 * @param {boolean | 'hell'} hard
 * @param {number} level
 * @param {Content} content
 * @returns {Record<string, any> | null}
 */
export const challengeMode = (hard, level, content) => (hard ? (challengeAt(level, content)?.[hard === 'hell' ? 'hell' : 'hard'] ?? null) : null);

// `statBoost`: shares some stats are raised by for a while, by stat (a
// potion of focus, potions.js). A character in a fight of a week that
// raises or lowers a stat (`weekStats`, weekFighter in weeks.js) has those
// shares too. `manaCost`: the skills' cost rule asked for (the players'
// duels: balance.skills.duelManaCost), else the game's (manaCostRule).
/**
 * @param {{ character: Character, equipped: Item[], hp?: number | null, name: string, area?: Area | null, id?: string, side?: string, statBoost?: Record<string, number> | null, skillStatWeight?: number | null, manaCost?: { base: number, share: number, manaShareFactor?: number } | null }} fighter
 * @param {Content} content
 */
export function playerCombatant({ character, equipped: worn, hp, name, area, id = 'a0', side = 'ally', statBoost = null, skillStatWeight = null, manaCost = null }, content) {
  const balance = content.balance;
  // No item worn above the level lock counts in a fight (wornNow in
  // items.js), its weapon neither: also a defender's of the Arena or a
  // guild war who has not come back since the lock came in.
  const equipped = wornNow(worn, character, content);
  const { totals: stats, bonuses } = computeStats(character, equipped, content);
  const week = character.weekStats ?? null;
  const shares = week && statBoost ? Object.fromEntries([...new Set([...Object.keys(week), ...Object.keys(statBoost)])].map((stat) => [stat, (week[stat] ?? 0) + (statBoost[stat] ?? 0)])) : (week ?? statBoost);
  const totals = shares ? Object.fromEntries(Object.entries(stats).map(([stat, value]) => [stat, Math.round(value * (1 + (shares[stat] ?? 0)))])) : stats;
  const weaponItem = equipped.find((item) => item.slot === 'weapon');
  // A form whose class's weapons hit with another stat (gear.js, 988), and
  // a form that takes another class's kind, whose stat in Zręczność's place
  // gives its speed and dodge too (`as`: the Nekromanta's Intelekt).
  const key = gearKey(character.classId, character.evolution, content);
  const scalingOf = weaponScalingOf(key, content);
  const agile = statAsOf(key, content).dexterity ?? 'dexterity';
  // A form's own weapons may hit by a share less than in their own class's
  // hands (gear.damage: the Nekromanta's kostury, as its class keeps a
  // Cień's HP and speed).
  const share = gearDamageOf(key, content);
  const element = gearElementOf(key, content);
  const held = weaponItem ? itemWeapon(weaponItem, content) : null;
  const weapon = held
    ? {
        ...held,
        ...(scalingOf && { scaling: scalingOf }),
        ...(element && !held.element && { element }),
        ...(share !== 1 && { min: Math.max(1, Math.round(held.min * share)), max: Math.max(1, Math.round(held.max * share)) }),
      }
    : unarmed(character.level, content);
  let armor = bonuses.armor + totals.endurance * balance.combat.armorPerEndurance;
  if (area?.trait.frontArmorBonus && character.position === 'front') armor *= 1 + area.trait.frontArmorBonus;
  // Szuwary: the back of the line hides in the reeds; Jodłowy cień: the
  // middle in the shade of the firs.
  const dodgeBonus = (character.position === 'back' ? area?.trait.backDodgeBonus : character.position === 'middle' ? area?.trait.middleDodgeBonus : 0) ?? 0;
  const cls = content.classesById[character.classId];
  const perClassLevel = perClassLevelOf(character, content);
  // The Rdzeń's Artefakty (core.js): the character's own, never a
  // companion's (a companion's character has no core).
  const core = character.core ? coreEffects(character.core, key, content) : null;
  // Poboczne statystyki (side-stats.js, 1218 B): Siła its weapons do not
  // hit with gives HP, and such Intelekt resistance to every element, from
  // the totals with the week's and the potions' shares, before the
  // Rdzeń's, Opoka's and the like raise them by a share.
  const spare = sideStats(character, totals, content);
  const hpBase = maxHp(totals.vitality, character.classLevel, perClassLevel, balance) + spare.hp;
  const hpMax = core?.hp ? Math.round(hpBase * (1 + core.hp)) : hpBase;
  // The evolution's trait (evolutions.js) works in fights (combat.js); some
  // shape the character itself: Opoka's armour and resistances, Arkana's
  // mana, Krok cienia's speed, and the shelter of Zimowy oddech and Toksyny
  // (a share less of the damage of their element, blows and effects).
  const evolution = evolutionOf(character, content);
  const feat = evolution ? { kind: evolution.trait.kind, name: evolution.trait.name, ...evolution.trait.params } : null;
  const manaMax = maxMana(totals.wisdom, character.classLevel, perClassLevel, balance);
  // Not in the players' duels (the Arena, the guild wars: duelist in
  // pvp-arena.js), whose balance the author has yet to decide on.
  const skillStat = evolution?.skillStat ?? null;
  // The weight asked for (the players' duels: duelSkillStatWeight, 987 B),
  // else the game's.
  const skillWeight = skillStatWeight ?? balance.skills.skillStatWeight ?? 0;
  const skillPower =
    skillStat && skillWeight > 0 ? damageScale(totals[weapon.scaling] + skillWeight * (totals[skillStat] ?? 0), character.level, balance) / damageScale(totals[weapon.scaling], character.level, balance) : 1;
  const resist = { ...bonuses.resist };
  if (spare.resist > 0) for (const { id: element } of content.elements) resist[element] = (resist[element] ?? 0) + spare.resist;
  if (feat?.kind === 'bulwark') {
    armor *= 1 + feat.armor;
    for (const element of Object.keys(resist)) resist[element] = Math.round(resist[element] * (1 + feat.resist));
  }
  if (core) {
    armor *= 1 + core.armor;
    if (core.resist) for (const element of Object.keys(resist)) resist[element] = Math.round(resist[element] * (1 + core.resist));
  }
  const mana = feat?.kind === 'arcana' ? Math.round(manaMax * (1 + feat.mana)) : manaMax;
  const manaFull = core?.mana ? Math.round(mana * (1 + core.mana)) : mana;
  // The abilities of the Rdzeń's large Artefakty (core.js, combat.js).
  const abilities = core?.abilities ?? {};
  // (Żniwo, the Nekromanta's trait grown from Toksyny, gives none.)
  const shelter = feat?.resist ? /** @type {Record<string, string>} */ ({ winter: 'frost', toxins: 'poison' })[feat.kind] : undefined;
  // Mądrość's share more of what its healing and mana potions restore
  // (balance.potionWisdom, combat.js), from the totals with the week's and
  // the potions' shares.
  const potions = potionBonus(totals.wisdom, balance);
  // The skills' cost (skillMana): a skill priced in a share of the maximum
  // mana pays manaShareFactor times that share (balance.skills.manaCost,
  // 20.11.2026: twice).
  const costRule = manaCost ?? manaCostRule(content);
  const shareFactor = costRule?.manaShareFactor ?? 1;
  return {
    id,
    side,
    name,
    isPlayer: true,
    classId: character.classId,
    appearance: character.appearance,
    skin: character.skin,
    // The evolution's portrait in the playback, and the skórka's over it.
    ...(character.evolution && { evolution: character.evolution }),
    ...(character.outfit && { outfit: character.outfit }),
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
    // 3 a point of Zręczność since 20.11.2026 (2 before; the creatures keep
    // theirs, balance.monsters.dodgePerDexterity).
    dodgeRating: totals[agile] * balance.combat.dodgePerDexterity * (1 + dodgeBonus) * (1 + (core?.dodge ?? 0)),
    critRating: totals.perception * balance.combat.critPerPerception * (1 + (core?.crit ?? 0)),
    willRating: totals.will * balance.combat.willPerPoint * (1 + (core?.will ?? 0)),
    speed: speed(totals[agile], character.level, balance) * (feat?.kind === 'shadowStep' ? 1 + feat.speed : 1) * (1 + (core?.speed ?? 0)),
    // Skills and the mana they spend, full at the start of a fight, but on
    // an exploration each fight starts with what the last left and a share
    // of the missing (1220 B, hunt.js: restedMana); Wisdom also strengthens
    // healing, and the healing and mana potions.
    maxMana: manaFull,
    wisdom: totals.wisdom,
    ...(potions > 0 && { potionBonus: potions }),
    // A skill priced in a share of the maximum mana costs that share of it
    // (the Arkanista's summons, 934 A and 935 A), times manaShareFactor.
    // The evolution's skills of an evolution whose growth gives a stat its
    // weapon does not use (986 B, evolutions.json skillStat): they scale with
    // the weapon's stat and that stat (balance.skills.skillStatWeight times
    // it) together, so the stat strengthens their blows, poisons, bleeding,
    // curses, summons and lightning. `skillPower`: their multiplier.
    skillPower,
    skills: learnedSkills(character, content).map((skill) => {
      const priced = skill.manaShare ? { ...skill, mana: Math.max(1, Math.round(manaFull * skill.manaShare * shareFactor)) } : { ...skill, mana: skillMana(skill.mana, manaFull, content, costRule) };
      return skillPower !== 1 && content.skillsById[skill.id]?.evolution ? { ...priced, params: poweredParams(priced.params, skillPower) } : priced;
    }),
    ...(feat && { feat }),
    // The share of the missing HP back after a won fight on an exploration:
    // less from the challenge's level (628 B).
    recovery:
      (challengeAt(character.level, content)?.recoveryAfterFight ?? balance.hunt.recoveryAfterFight) +
      cls.recovery.base +
      cls.recovery.perWisdom * totals.wisdom +
      (area?.trait.recoveryBonus ?? 0) +
      (core?.recovery ?? 0),
    // What the Rdzeń adds to the fights (combat.js): more damage, a share of
    // it back as HP, and its large Artefakty's abilities: a first blow that
    // always lands, the first move, a first critical blow, a shield at the
    // start and HP back once a fight below a mark.
    ...(core?.damage && { damageBonus: core.damage }),
    ...(core?.lifesteal && { lifesteal: core.lifesteal }),
    ...(abilities['sure-first'] && { firstSure: true }),
    ...(abilities['first-strike'] && { firstStrike: true }),
    ...(abilities['opening-crit'] && { openingCrit: true }),
    ...(abilities.shield && { openingShield: abilities.shield }),
    ...(abilities.rally && { rally: abilities.rally, rallyBelow: content.labyrinth.core.abilities.find((/** @type {{ id: string }} */ one) => one.id === 'rally')?.below ?? 0.3 }),
  };
}

// How a strike looks in the fight animation: a blow, an arrow or a spell.
/**
 * @param {string | undefined} strike
 * @param {string} category
 * @returns {string}
 */
const strikeOf = (strike, category) => strike ?? (category === 'magical' ? 'magic' : 'melee');

// The numbers of a skill's blows (its power, its single target's, its
// poison's or bleeding's and its chain's) times `power` (986 B).
/**
 * @param {Record<string, any>} params
 * @param {number} power
 */
function poweredParams(params, power) {
  const out = { ...params };
  for (const key of ['power', 'single', 'dotPower', 'chainPower']) if (typeof out[key] === 'number') out[key] *= power;
  // A pack's summons (Zew zwierząt, Gaj wieków), each with its own power.
  if (Array.isArray(out.pack)) out.pack = out.pack.map((/** @type {Record<string, any>} */ one) => poweredParams(one, power));
  return out;
}

/**
 * @param {Item} worn
 * @param {Content} content
 */
function itemWeapon(worn, content) {
  const item = upgradedItem(worn, content);
  const base = content.basesById[item.base];
  return {
    // The item's base and its family: the weapon the playback shows in a
    // blade's blow and how it swings (arena-fx.js).
    base: item.base,
    family: base.family ?? base.id,
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
/**
 * @param {number} level
 * @param {Content} content
 */
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
// motywacja do drużyny/towarzyszy"); from class level 250 a Drużyna's
// players do make them stronger (partyStrength), and in the newest place
// since 19.11.2026 below it too (newestStrength). `before`: what comes
// before the first point ([1, 1], or [0, 0] for shares).
/**
 * @param {number} level
 * @param {number[][]} [curve]
 * @param {[number, number]} [before]
 * @returns {[number, number]}
 */
export function huntStrength(level, curve = [], before = [1, 1]) {
  if (curve.length === 0 || level < curve[0][0]) return before;
  const next = curve.findIndex(([at]) => at > level);
  if (next === -1) {
    const last = /** @type {number[]} */ (curve.at(-1));
    return [last[1], last[2]];
  }
  const [fromLevel, fromDamage, fromHp] = curve[next - 1];
  const [toLevel, toDamage, toHp] = curve[next];
  const share = (level - fromLevel) / (toLevel - fromLevel);
  return [fromDamage + (toDamage - fromDamage) * share, fromHp + (toHp - fromHp) * share];
}

// The newest place's creatures stronger again on an exploration
// (balance.monsters.newestPlace), as [damage, HP] multipliers on top of
// huntCurve. The author, 19.11.2026, on a measurement where from the 100th
// level on almost nobody fainted there, alone with companions or in a
// Drużyna: „nie może tak być, chyba że na niskim zagrożeniu i nizszych od
// aktualnego levelu krainach”, and his choice B (about one 4-hour
// exploration in five ending in a faint). From the character's level
// `fromLevel` on (the first levels as they were), in the place that holds
// it and the higher ones, by `curve`: points [character level, damage, HP]
// as huntCurve's, at the first and the last level of each place, since
// neighbouring places' creatures are far apart (one strength by class level
// left some places almost safe and others far too hard). A Drużyna's
// players fighting together make them stronger still: each one beyond the
// first adds `perPlayer`'s shares, points [class level, damage, HP] by the
// highest class level among them (fightingClassLevel), nothing before the
// first, as monsters.perPlayer counts. [1, 1] in the lower places.
/**
 * @param {Area} area
 * @param {number} level The character's (on a Drużyna's trip the leader's).
 * @param {number} classLevel Of those who fight (fightingClassLevel).
 * @param {number} players The Drużyna's players who fight together, 1 alone.
 * @param {Content} content
 * @returns {[number, number]}
 */
export function newestStrength(area, level, classLevel, players, content) {
  const newest = content.balance.monsters.newestPlace;
  if (!newest || level < newest.fromLevel || area.maxLevel < level) return [1, 1];
  const [damage, hp] = huntStrength(Math.max(level, area.minLevel), newest.curve);
  const more = Math.max(0, players - 1);
  const [eachDamage, eachHp] = more > 0 ? huntStrength(classLevel, newest.perPlayer, [0, 0]) : [0, 0];
  return [damage * (1 + eachDamage * more), hp * (1 + eachHp * more)];
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
// Trudna wyprawa (`hard` true, 629 A) by its hard ones on top, and those of
// a Piekielna (`hard` 'hell') by its hell ones (challengeMode).
// `fighters`: on an exploration and in the threat's sample fights, the
// class level of those who fight and the Drużyna's players among them, for
// newestStrength; without them (the Labirynt and the Sala prób, which take
// an exploration's creatures as their measure) none of it.
/**
 * @param {Area} area
 * @param {number} level
 * @param {Content} content
 * @param {boolean | 'hell'} [hard]
 * @param {{ classLevel?: number, players?: number } | null} [fighters]
 * @returns {[number, number]}
 */
export function exploreStrength(area, level, content, hard = false, fighters = null) {
  const [placeDamage, placeHp] = area.maxLevel < level ? [1, 1] : huntStrength(Math.max(level, area.minLevel), content.balance.monsters.huntCurve);
  const [newDamage, newHp] = fighters ? newestStrength(area, level, fighters.classLevel ?? 0, fighters.players ?? 1, content) : [1, 1];
  const [damage, hp] = [placeDamage * newDamage, placeHp * newHp];
  const challenge = challengeAt(level, content);
  if (!challenge) return [damage, hp];
  const base = level >= challenge.strength.fromLevel ? challenge.strength : { damage: 1, hp: 1 };
  const more = challengeMode(hard, level, content) ?? { damage: 1, hp: 1 };
  return [damage * base.damage * more.damage, hp * base.hp * more.hp];
}

// A curve by class level (balance.monsters.classLevelCurve for the
// creatures, balance.companions.classLevelCurve for the companions): points
// [class level, multiplier] by class level, ×1 below the first, straight
// between two points and as the last past it; ×1 for an empty curve.
/**
 * @param {number} classLevel
 * @param {number[][]} [curve]
 * @returns {number}
 */
export function classLevelFactor(classLevel, curve = []) {
  if (curve.length === 0 || classLevel < curve[0][0]) return 1;
  const next = curve.findIndex(([at]) => at > classLevel);
  if (next === -1) return /** @type {number[]} */ (curve.at(-1))[1];
  const [fromLevel, from] = curve[next - 1];
  const [toLevel, to] = curve[next];
  return from + ((to - from) * (classLevel - fromLevel)) / (toLevel - fromLevel);
}

// The class level that decides how strong the creatures are for those who
// fight them (the myth game, partyStrength): the highest of the players'
// own (the characters of a Drużyna's trip, of the Wieża Drużyn or of a
// party event, or the one character), so that nobody hides behind a lower
// leader. Companions and a mercenary are no players.
/**
 * @param {{ classLevel?: number }[]} characters
 * @returns {number}
 */
export const fightingClassLevel = (characters) => Math.max(0, ...characters.map((character) => character.classLevel ?? 0));

// How much stronger the creatures are against `players` players of a
// Drużyna fighting together (a trip, the Wieża Drużyn, a party event) whose
// highest class level is `classLevel` (fightingClassLevel): [damage, HP]
// multipliers, balance.monsters.perPlayer's for each player beyond the
// first, from its class level on (the author, 19.11.2026: „szczególnie z
// drużyną”, „to miało byc od 250 poziomu klasy”). Nothing for one player,
// with its companions or not, nor below that class level: there the
// creatures do not grow for a party (612 C).
/**
 * @param {number} classLevel
 * @param {number} players
 * @param {Content} content
 * @returns {[number, number]}
 */
export function partyStrength(classLevel, players, content) {
  const each = content.balance.monsters.perPlayer;
  const more = players > 1 && classLevel >= each.fromClassLevel ? players - 1 : 0;
  return [1 + each.damage * more, 1 + each.hp * more];
}

// `groupFactor` weakens each member of a group, so two or three monsters are
// harder than one, but not two or three times harder.
// `growth` is the share of the late, end and myth game's growth the monster
// has: a fight where the character stands alone (the Wieża Solo, an
// event's fight) gives it balance.monsters.soloGrowth of it (the author:
// 438.3 A).
// `strength`: the [damage, HP] multipliers of a creature met on an
// exploration of the newest place (or in the danger estimate's sample
// fights there), exploreStrength; the Wieże, the events' fights and the
// Bestia Gildii keep their own measure.
// `classLevel`: the class level of those it fights (fightingClassLevel), for
// the myth game and partyStrength; 0 where the creature keeps its own
// measure (the Bestia Gildii and the Wyprawa Gildii's guardians, the cards
// of Talia Systemu, the skill preview). `players`: the players of a
// Drużyna who fight it together, for partyStrength (1: a player alone,
// with its companions or not).
/**
 * @param {{ monsterId: string, level: number, id: string, name?: string, position?: string, side?: string, groupFactor?: number, growth?: number, strength?: number[], classLevel?: number, players?: number }} fighter
 * @param {Content} content
 */
export function monsterCombatant({ monsterId, level, id, name, position, side = 'enemy', groupFactor = 1, growth = 1, strength = [1, 1], classLevel = 0, players = 1 }, content) {
  const balance = content.balance;
  const monster = content.monstersById[monsterId];
  /** @param {string} key */
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
  // Against a character of class level 250 and more (mythGame), where the
  // mighty items come in, every creature grows once more, wherever it
  // lives, whatever its own level (the author, 19.11.2026: „grę od 250tego
  // trzeba zrobić też jeszcze trudniejszą, tam wchodzą juz potezne
  // przedmioty i wszystko”, „Od 250ego wzrost 3-krotny minimum” and „to
  // miało byc od 250 poziomu klasy”), and more against a Drużyna's players
  // fighting together (partyStrength).
  const myth = balance.monsters.mythGame;
  const mythic = (classLevel >= myth.fromClassLevel ? 1 : 0) * growth;
  // On top of it, the creatures' strength by the same class level
  // (balance.monsters.classLevelCurve; the author, 19.11.2026: „od 100ego
  // też zwiekszyc mielismy poziom trudnosci tylko słabiej”, and 1207 A:
  // from class level 100 evenly up to twice as strong just before 250),
  // for its blows and its HP alike, in a fight alone only `growth` of it,
  // as the myth game; ×1 with the curve empty, as before 1207 A.
  const ramp = 1 + (classLevelFactor(classLevel, balance.monsters.classLevelCurve) - 1) * growth;
  const [partyDamage, partyHp] = partyStrength(classLevel, players, content);
  const [huntDamage, huntHp] = strength;
  // A creature's natural weapon from one of its attacks: its own, or one of
  // its shapes' (Weles, `shapes`).
  /** @param {Record<string, any>} attack */
  const weaponOf = (attack) => {
    const average =
      weaponDamage(hide, attack.damageFactor, balance) *
      balance.monsters.damageMultiplier *
      groupFactor *
      (1 + mid.damage * stronger) *
      (1 + coop.damage) *
      (1 + late.damage * later) *
      (1 + end.damage * latest) *
      (1 + myth.damage * mythic) *
      ramp *
      partyDamage *
      huntDamage;
    return {
      attackName: attack.name,
      category: attack.category,
      strike: strikeOf(attack.strike, attack.category),
      sound: attack.sound,
      element: attack.element,
      scaling: attack.scaling,
      min: average * (1 - attack.variance),
      max: average * (1 + attack.variance),
      dot: attack.dot,
      // Ugrzęźnięcie and Wysysanie (combat.js).
      slow: attack.slow,
      drain: attack.drain,
      // Atak na tył szyku (463): its blows go to the one standing furthest
      // back (combat.js).
      ...(attack.target && { target: attack.target }),
      // Cios w cały szyk (666): the rest of the party takes this share of
      // each blow (combat.js).
      ...(attack.cleave && { cleave: attack.cleave }),
      // Nawia's blows (combat.js): Ogłuszenie, Cisza, two blows in a move,
      // the whole foremost row trampled, a second effect at once.
      ...(attack.stun && { stun: attack.stun }),
      ...(attack.silence && { silence: attack.silence }),
      ...(attack.hits && { hits: attack.hits }),
      ...(attack.trample && { trample: true }),
      ...(attack.dot2 && { dot2: attack.dot2 }),
    };
  };
  // Weles changes its shape with each move, and its blow with it; its first
  // shape is the one it starts with (combat.js).
  const shapes = monster.shapes?.map((/** @type {Record<string, any>} */ shape) => {
    const attack = shape.attack ?? monster.attack;
    return { name: shape.name, weapon: weaponOf(attack), damageScale: damageScale(stat(attack.scaling), level, balance) };
  });
  /** @type {Record<string, number>} */
  const resist = {};
  for (const [element, value] of Object.entries(monster.resistances ?? {})) {
    resist[element] = Math.round(value.base + value.perLevel * (level - 1));
  }
  const rawHp = balance.monsters.hpBase + balance.character.hpPerVitality * stat('vitality') + balance.monsters.hpPerLevel * level;
  const hpMax = Math.max(
    1,
    Math.round(rawHp * monster.hpFactor * groupFactor * (1 + mid.hp * stronger) * (1 + coop.hp) * (1 + late.hp * later) * (1 + end.hp * latest) * (1 + myth.hp * mythic) * ramp * partyHp * huntHp),
  );
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
    // Ukryty w mroku (666): the party does not choose it while a creature
    // without it still fights (combat.js).
    ...(monster.hidden && { hidden: true }),
    // Nawia (combat.js): Wróżda strikes back whoever strikes it, Wężowa
    // Panna's spring heals her each move, Kościej rises once, Weles changes
    // its shape.
    ...(monster.vengeance && { vengeance: monster.vengeance }),
    ...(monster.regen && { regen: monster.regen }),
    ...(monster.rises && { rises: monster.rises }),
    ...(shapes && { shapes }),
    groupFactor,
    position: position ?? monster.position,
    level,
    maxHp: hpMax,
    hp: hpMax,
    weapon: shapes ? shapes[0].weapon : weaponOf(monster.attack),
    scalingValue: stat(monster.attack.scaling),
    damageScale: shapes ? shapes[0].damageScale : damageScale(stat(monster.attack.scaling), level, balance),
    armor: Math.round(hide * balance.items.armorPerBudget * monster.armorFactor + stat('endurance') * balance.combat.armorPerEndurance),
    resist,
    // More damage from these elements, e.g. { fire: 0.5 }: half as much again.
    weak: monster.weaknesses,
    // The creatures' own number (2), not the characters' (3 since
    // 20.11.2026), so they are no harder for it.
    dodgeRating: stat('dexterity') * (balance.monsters.dodgePerDexterity ?? balance.combat.dodgePerDexterity),
    critRating: stat('perception') * balance.combat.critPerPerception,
    willRating: stat('will') * balance.combat.willPerPoint,
    speed: speed(stat('dexterity'), level, balance),
    recovery: 0,
  };
}

// What the report shows when a participant's stats are expanded with "+".
/**
 * @param {Combatant} unit
 * @param {number} opponentLevel
 * @param {Content} content
 */
export function combatantView(unit, opponentLevel, content) {
  const balance = content.balance;
  const scale = unit.damageScale;
  /** @param {number} value */
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
    ...(unit.outfit && { outfit: unit.outfit }),
    monsterId: unit.monsterId,
    // A companion from the Karczma shows its own bust (question 107 B).
    ...(unit.companion && { companion: true }),
    elite: unit.elite,
    champion: unit.champion ?? false,
    maxHp: unit.maxHp,
    hp: unit.hp,
    // The playback's mana bar (21.11.2026): the most mana and what the fight
    // starts with (full, or what the unit brings, never above its most, as
    // combat.js starts it); the events carry each change. A creature has
    // none, and no bar.
    ...(unit.maxMana > 0 && { maxMana: unit.maxMana, mana: Math.min(unit.maxMana, unit.mana ?? unit.maxMana) }),
    attack: unit.weapon.attackName,
    strike: unit.weapon.strike,
    // The weapon's base and family, whose picture swings in a blade's blow.
    ...(unit.weapon.base && { weapon: unit.weapon.base, weaponFamily: unit.weapon.family }),
    // The kind of hit sound (data/sounds.json).
    sound: unit.weapon.sound ?? null,
    element: unit.weapon.element ?? null,
    // With the damage bonus of potions, companions and events, as its blows
    // have it (combat.js; the code review, 12.11.2026).
    damage: `${Math.round(unit.weapon.min * scale * (1 + (unit.damageBonus ?? 0)))}–${Math.round(unit.weapon.max * scale * (1 + (unit.damageBonus ?? 0)))}`,
    armor: unit.armor,
    dodge: percent(cappedChance(unit.dodgeRating, opponentLevel, balance.combat.dodgeCap, balance)),
    crit: percent(cappedChance(unit.critRating, opponentLevel, balance.combat.critCap, balance)),
    speed: Math.round(unit.speed * 100) / 100,
  };
}

// @ts-check
// Automatic combat, up to three against three.
// Initiative is a timeline: the time to a unit's next move is inversely
// proportional to its speed, and the unit whose time comes first acts. One
// unit may act at most `maxConsecutiveMoves` times in a row. The party
// finishes off the opponent it can defeat fastest, the front first; monsters
// pick their target at random, front positions more often.
//
// Skills (skills.js) work by their kind: a strike or a sweep replaces a plain
// blow when it is ready (its cooldown has passed and there is mana for it),
// a prayer heals on the unit's move when it is wounded, a blessing or a
// coated blade works from the start of the fight, and a guard, a mana shield
// or a dance of shadows wakes once a fight, the moment HP falls below its
// mark. A guard's armour lasts a few of the unit's own moves, a mana shield
// takes a share of mana at once and holds until its points are spent. Every
// fight starts with full mana. A fight without skills draws the same random
// numbers as before skills existed.
//
// A character may carry potions (potions.js): a healing one is drunk the
// moment HP falls below the player's mark, a mana one when a skill lacks
// mana, a cure the moment the effect it cures lands (an antidote for
// Zatrucie, the burn brew for Oparzenie; it then keeps that effect off to
// the end of the fight) and a fern brew the moment the character faints (it
// rises with a share of its HP), each kind at most once a fight, and each
// effect's cure as a kind of its own. Potions drunk before an exploration
// may also have strengthened its blows (`damageBonus`), coated its blade or
// warded it from magic (`ward`: a share less of every magical blow).
// Potions draw no random numbers of their own.
//
// A monster's blow may also mire its target (`slow`: Ugrzęźnięcie puts off
// its next move, as a skill's slow does), heal the monster by a share of the
// damage (`drain`: Wysysanie), and a monster may take more damage from an
// element (`weak`). The place's trait may make an effect last longer
// (`effectTicks`: Opary torfu). These draw random numbers only for a monster
// that has them, so fights elsewhere stay as they were. A monster may also
// lie in wait (`ambush`, Zasadzka: the monsters move first, as in an
// event's ambush), strike the one standing furthest back (an attack's
// `target: "back"`, Atak na tył szyku: the same one draw as any monster's
// choice of target) or burn the whole party (an effect's `all`, Ognista
// nawałnica: one more chance for each other member). A creature may hide in
// the dark (`hidden`, Ukryty w mroku: the party chooses it only once no
// creature without it fights on; blows at many strike it as any) or strike
// the whole line (an attack's `cleave`, Cios w cały szyk: its chosen target
// at full strength, each other member at that share).
//
// An evolved character (evolutions.js) brings its trait (`feat`) and the
// evolution's skills. A stance wakes at the start of the character's move,
// besides its blow, and lasts a few of its own moves (a frenzy, a challenge
// that draws the foes' blows, a storm cloud, a falcon, a psalm); a summon
// stands before its summoner and takes the foes' blows meant for it; a mark
// gives its foe an echo of the wounds it takes; a whirl strikes random foes;
// a riposte answers every dodge; a miracle raises a fainted member of the
// party once a fight; a guard or a shield may throw back a share of the
// damage. Their code and state are made only for a fight with an evolved
// character, and only its blows draw random numbers of their own, so every
// other fight stays as it was.
//
// The second forms ("Druga ewolucja klas") add to these: a stance may weaken
// the other side's blows (a roar), harden the whole party's armour (a wall
// of shields), raise the party's damage (a choir), hide its user from every
// blow for a move (a vanishing) or repeat its blows (a shadow double); a
// mark may challenge a foe to a duel or lock a foe as a sure target; a
// summon may strike with its claws or a sword (`physical`), and a character
// has one summon at a time; a shield may cover the whole party or slow its
// attackers; a curse lays a poison on every foe that wears its armour away;
// Harmonia żywiołów strengthens spells with every element used. Their
// traits heal on a kill, block a share of blows, chill with every frost
// spell, set spirits on fire, and raise a foe killed by poison as a
// skeleton that fights on the character's side.
//
// The third forms ("Trzecia ewolucja klas") add to these: a strike may go
// through every foe in the rows behind its target, kill a foe low on HP at
// once (no champion), drain life or blind its target, who then misses some
// of its blows; a sweep may turn twice in a move, stun only the foes in
// front, grow with the HP its user lost, chill deeper, heal the party or
// jump on to another foe; a mark may lock a foe in ice, seal it (more
// damage, no healing) or make it bleed and take critical blows more often;
// a stance may make every shot sure and sharper, raise the party's damage
// with every fallen foe, charge the party's blows with lightning, make the
// party dodge more or the foes miss more; a summon may howl the party's
// blows stronger, root the foes it strikes or charge in with a stunning
// blow, and with Serce puszczy two summons stand at once; a shield of mana
// may burn, chill or shock those who strike it. Their traits: a share of
// the blows meant for the party taken by the Kolos, a spark that jumps on
// to another foe, a chilled foe frozen by a frost spell, a fallen member of
// the party raised once a fight, the party blessed from the start, one more
// move after a kill, and a fatal blow survived with 1 HP once a fight.

// The Rdzeń's large Artefakty (core.js) and the blessings of the Labirynt
// Systemu (labyrinth.js) shape a unit with a few marks of its own: a share
// of every blow's damage back as HP (`lifesteal`), a first own blow that
// cannot be dodged (`firstSure`), the first move of the fight
// (`firstStrike`), a first critical blow (`openingCrit`), a shield of a
// share of the HP at the start (`openingShield`), HP back once a fight below
// a mark (`rally`), and points more of the chances of a critical blow
// (`critChance`) and of a dodge (`dodgeChance`). None of them draws a
// random number, so a fight without them goes as before.

import { cappedChance, reduction } from './formulas.js';
import { ACTIVE_KINDS, START_KINDS, STANCE_KINDS, WOUND_KINDS } from './skills.js';
import { say } from './text.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {Record<string, any>} Unit A fighter in a fight: a character, a creature, a companion or a summon, with its state. */
/** @typedef {Record<string, any>} Skill A unit's skill with its state in the fight (ready, used). */
/** @typedef {Record<string, any>} Params A skill's numbers (skill.params). */
/** @typedef {Record<string, any>} Move A blow: plain, or shaped by a skill, a counter, a summon, an echo. */
/** @typedef {Record<string, any>} Dot An effect over time on a unit. */
/** @typedef {Record<string, any>} Stance A stance a skill put on a unit. */
/** @typedef {import('./text.js').Vars} Vars */
/** @typedef {import('./rng.js').Rng} Rng */

// How far back a position stands, for skills that aim at the back.
/** @type {Record<string, number>} */
const DEPTH = { front: 0, middle: 1, back: 2 };
// A plain blow, its marks and a unit without skills: shared, as the threat
// estimate runs many fights.
const PLAIN = /** @type {Move} */ (Object.freeze({}));
const NO_SKILLS = /** @type {any[]} */ (/** @type {unknown} */ (Object.freeze([])));
/** @type {Record<string, string>} */
const SKILL_WORDS = { hit: 'skillHit', crit: 'skillCrit', dodge: 'skillDodge' };
// The elements a summoned elemental chooses from: the one its foe is weakest
// to.
const ELEMENTAL = ['fire', 'frost', 'lightning'];
// The id the skeleton raised by Żniwo goes under in the account, as a
// summon's skill (its figure: the creature "skeleton").
export const RISEN = 'risen';
// The share of its HP left at which a blow growing with the user's lost HP
// (Rzeź's `rage`) is at its strongest, unless the skill names its own.
const RAGE_AT = 0.1;
// The miss of a blinded unit (Szpon orła) and of one in an eclipse
// (Zaćmienie): the words of the miss, logged as a dodge.
const MISSES = new Set(['blindMiss', 'eclipseMiss']);

// The texts of a blow: its own words (a summon's, an echo's; one for each
// kind of blow where the blow may miss), a skill's own blow names the skill,
// a sweep's blows name it as the attack, a counter has its own words.
function wordsFor(/** @type {string} */ kind, /** @type {Move} */ move) {
  if (move.words) return typeof move.words === 'string' ? move.words : move.words[kind];
  if (move.counter) return kind === 'crit' ? 'counterCrit' : 'counter';
  return move.own ? SKILL_WORDS[kind] : kind;
}

// A mana shield takes what it can of a blow or a tick, out of its points.
// Returns the damage it took.
function absorb(/** @type {Unit} */ target, /** @type {number} */ amount) {
  if (!target.shield || target.shield.points <= 0 || amount <= 0) return 0;
  const absorbed = Math.min(amount, target.shield.points);
  target.shield.points -= absorbed;
  return absorbed;
}

// What a mana shield can still take; a spent one says 0.
const shieldLeft = (/** @type {Unit} */ unit) => (unit.shield ? unit.shield.points : undefined);

// A bonus shared out over `members` of a party: each one more takes `crowd`
// of a share (a blessing: 2/3 of it each for two, half for three).
export const sharedBonus = (/** @type {number} */ members, crowd = 0) => 1 / (1 + crowd * (members - 1));

// Pieczęć świętości: a sealed unit heals no more.
function heal(/** @type {Unit} */ unit, /** @type {number} */ amount) {
  if (unit.sealed) return 0;
  const healed = Math.max(0, Math.min(unit.maxHp - unit.hp, Math.round(amount)));
  unit.hp += healed;
  return healed;
}

// The numbers of a skill as a blow.
function blowOf(/** @type {Skill} */ skill, /** @type {Record<string, any>} */ extra) {
  const p = skill.params;
  return {
    skill,
    power: p.power,
    armorIgnore: p.armorIgnore,
    undodgeable: p.undodgeable,
    critBonus: p.critBonus,
    alwaysCrit: p.alwaysCrit,
    category: p.category,
    element: p.element,
    stun: p.stun,
    stunChance: p.stunChance,
    stunLabel: p.stunLabel,
    // Kruszący cios: the stun takes more than one move.
    stunMoves: p.stunMoves,
    // An effect over time from a skill's blow; a sweep's (Wir stali, Deszcz
    // meteorów) on every foe it hits.
    dot: p.dotEffect && (skill.kind === 'strike' || skill.kind === 'sweep') ? { effect: p.dotEffect, chance: p.dotChance, power: p.dotPower, ticks: Math.round(p.dotTicks) } : undefined,
    // The evolutions' blows: damage split between elements, armour torn off
    // for good, a chill, more against a chilled or a nearly beaten foe, a
    // mark on a family of foes.
    elements: p.elements?.split(' '),
    armorShred: p.armorShred,
    chill: p.chill,
    chilledBonus: p.chilledBonus,
    executeBelow: p.executeBelow,
    executeBonus: p.executeBonus,
    mark: p.mark,
    markTurns: p.markTurns,
    markFamily: p.markFamily,
    // The third forms' blows: more the less HP its user has left (Rzeź), a
    // chill that weakens the chilled (Kataklizm), a stun only for the foes
    // in front (Trzęsienie ziemi), more against a family (Sąd ostateczny),
    // life drained (Dotyk śmierci), a foe low on HP killed at once (Cios
    // ostateczny) and a blinded foe (Szpon orła).
    rage: p.rage,
    rageAt: p.rageAt,
    chillWeaken: p.chillWeaken,
    stunFront: p.stunFront,
    family: p.family,
    familyBonus: p.familyBonus,
    drain: p.drain,
    killBelow: p.killBelow,
    blind: p.blind,
    blindTurns: p.blindTurns,
    ...extra,
  };
}

function marksOf(/** @type {Move} */ move) {
  if (move === PLAIN) return PLAIN;
  /** @type {Record<string, any>} */
  const marks = move.skill ? { skill: move.skill.id, skillName: move.skill.name } : {};
  if (move.counter) marks.counter = true;
  if (move.sweep) marks.sweep = true;
  // A blow that went on through its target into another (Przebijający
  // strzał, Strzał w serce, Miażdżący cios, Mistrzowski strzał): a blow at
  // many, which strikes a hidden creature as any (Ukryty w mroku).
  if (move.pierced) marks.pierced = true;
  return marks;
}

// A skill that works only on the first move (Strzał z ukrycia) goes before
// the others, so another ready skill does not take that move.
const openersFirst = (/** @type {Skill[]} */ skills) =>
  skills.some((/** @type {Skill} */ skill) => skill.params.opener) ? [...skills.filter((/** @type {Skill} */ skill) => skill.params.opener), ...skills.filter((/** @type {Skill} */ skill) => !skill.params.opener)] : skills;

// `maxActions`: the moves after which a fight ends undecided (won: null),
// balance.combat's unless a fight has its own (an Arena duel, pvp-arena.js).
// `even`: both sides are players' characters and pick their targets as the
// allies do (the guild wars' battles of five on five, guild-wars.js); else
// the foes, creatures, pick theirs at random by position, and two equal
// teams of characters were not equal: the allies won four battles in five.
/**
 * @param {{ allies: Unit[], enemies: Unit[], rng: Rng, content: Content, record?: boolean, trait?: Record<string, any> | null, ambush?: boolean, maxActions?: number | null, even?: boolean }} fight
 */
export function simulateFight({ allies, enemies, rng, content, record = false, trait = null, ambush = false, maxActions = null, even = false }) {
  const balance = content.balance;
  const tuning = balance.combat;
  const actionLimit = maxActions ?? tuning.maxActions;
  const texts = content.texts;
  // An evolved character's trait and skills get their code and state only in
  // a fight with one.
  const evolving = allies.some((/** @type {Unit} */ unit) => unit.feat) || enemies.some((/** @type {Unit} */ unit) => unit.feat);
  // The skills' code and state are made only for a fight where someone has
  // a skill: the threat estimate runs many fights without any.
  const skilled = evolving || allies.some((/** @type {Unit} */ unit) => unit.skills?.length) || enemies.some((/** @type {Unit} */ unit) => unit.skills?.length);
  /** @type {Unit[]} */
  const units = [...allies, ...enemies].map((unit, order) => ({
    ...unit,
    order,
    dots: [],
    interval: tuning.moveTime / unit.speed,
    next: 0,
    skills: unit.skills?.length ? openersFirst(unit.skills.map((/** @type {Skill} */ skill) => ({ ...skill, ready: 0, used: false }))) : NO_SKILLS,
  }));
  // For skills: the fight's mana, the unit's own moves so far and the effects
  // of the skills that woke; each skill knows the move it is ready again from.
  if (skilled) {
    for (const unit of units) Object.assign(unit, { mana: unit.maxMana ?? 0, moves: 0, damageBonus: unit.damageBonus ?? 0, guard: null, shield: null, evade: null });
  }
  // For evolutions: the unit's stances and summons (the one in front first),
  // its riposte, how many of its blows landed yet (Zimna krew, Sokole oko)
  // and the bonus of its next blow (Krok cienia), and what the evolutions'
  // skills left on it: a chill, a mark, a mark of death, a duel or a lock
  // (focus), a sure critical blow after a vanishing (nextCrit) and the
  // elements its spells used (Harmonia żywiołów); the third forms': a
  // blindness, a tomb of ice (frozen), a seal, a blood mark, whether its
  // Nieśmiertelność (spared) and its Cudowne ocalenie (raised) are spent,
  // and a kill that earned it one more move (extraMove).
  if (evolving) {
    for (const unit of units) {
      Object.assign(unit, {
        stances: [],
        summons: [],
        riposte: null,
        struck: 0,
        nextBlow: 0,
        chilled: null,
        marked: null,
        doom: null,
        focus: null,
        nextCrit: null,
        harmony: null,
        blinded: null,
        frozen: null,
        sealed: null,
        bloodMark: null,
        spared: false,
        raised: false,
        extraMove: false,
      });
    }
  }
  // Osłona Rdzenia and Osłona Systemu: a shield of a share of the unit's HP
  // from the start, as a mana shield's, until its points are spent.
  for (const unit of units) if (unit.openingShield) unit.shield = { points: Math.max(1, Math.round(unit.maxHp * unit.openingShield)) };
  for (const unit of units) unit.next = unit.interval * (0.5 + 0.5 * rng.next());
  // Pierwszy ruch (the Rdzeń): the unit moves before every other one's first
  // move, with no draw of its own.
  if (units.some((unit) => unit.firstStrike)) {
    const first = Math.min(...units.map((unit) => unit.next));
    for (const unit of units) if (unit.firstStrike) unit.next = Math.max(0, first - 1);
  }
  // An ambush (an event's, events.js, or Zasadzka, 464: a creature that lies
  // in wait, `ambush` in monsters.json, wherever it fights): every enemy
  // moves before the allies' first move. It draws no random numbers.
  const lurker = enemies.find((/** @type {Unit} */ unit) => unit.ambush);
  if (ambush || lurker) {
    const last = Math.max(...units.filter((unit) => unit.side === 'enemy').map((unit) => unit.next));
    for (const unit of units) if (unit.side === 'ally') unit.next = Math.max(unit.next, last + 1);
  }

  /** @type {Record<string, any>[]} */
  const events = [];
  // The potions drunk, by id, and which unit drank which kind already.
  /** @type {string[]} */
  const drunk = [];
  const drank = new Set();
  const dealt = Object.fromEntries(units.map((unit) => [unit.id, 0]));
  const taken = Object.fromEntries(units.map((unit) => [unit.id, 0]));
  let actions = 0;
  let lastActor = null;
  let streak = 0;

  // Events and their texts are built only for a fight that is recorded: the
  // threat estimate runs many fights that nobody reads.
  const log = (/** @type {() => Record<string, any>} */ event) => {
    if (record) events.push(event());
  };
  // Zasadzka: the playback opens with the creature that lay in wait.
  if (lurker) log(() => ({ t: 0, kind: 'ambush', actor: lurker.id, text: say(texts, 'ambush', 0, { actor: lurker.name }) }));
  const earliest = (/** @type {Unit[]} */ list) =>
    list.reduce((/** @type {Unit | null} */ best, /** @type {Unit} */ unit) => {
      if (!best) return unit;
      if (unit.next !== best.next) return unit.next < best.next ? unit : best;
      if (unit.speed !== best.speed) return unit.speed > best.speed ? unit : best;
      return unit.order < best.order ? unit : best;
    }, /** @type {Unit | null} */ (null));

  const damage = (/** @type {Unit} */ target, /** @type {number} */ amount, /** @type {string | undefined} */ source) => {
    target.hp = Math.max(0, target.hp - amount);
    if (source) dealt[source] += amount;
    taken[target.id] += amount;
    // Znak śmierci keeps count of what its foe takes.
    if (target.doom) target.doom.taken += amount;
  };

  // Borowina (the place's trait `healBonus`): the allies' healing, by
  // skills and potions, gives back a share more HP. No random numbers.
  const mend = (/** @type {Unit} */ unit, /** @type {number} */ amount) => heal(unit, unit.side === 'ally' ? amount * (1 + (trait?.healBonus ?? 0)) : amount);

  // A potion of a kind (`heal`, `mana`, `cure` or `revive`) the unit carries
  // and has not drunk yet in this fight; of the cures the one for the effect
  // `cures` (an antidote for Zatrucie, the burn brew for Oparzenie), each
  // once a fight. Gives whether it drank.
  const drink = (/** @type {Unit} */ unit, /** @type {string} */ kind, /** @type {number} */ t, /** @type {string | null} */ cures = null) => {
    const potion = kind === 'cure' ? unit.potions?.cure?.[/** @type {string} */ (cures)] : unit.potions?.[kind];
    const once = kind === 'cure' ? `${unit.id}:cure:${cures}` : `${unit.id}:${kind}`;
    if (!potion || drank.has(once)) return false;
    drank.add(once);
    drunk.push(potion.id);
    const vars = { actor: unit.name, potion: potion.accusative };
    const potionTexts = content.potionUse.texts;
    if (kind === 'heal') {
      const amount = mend(unit, potion.amount * unit.maxHp);
      log(() => ({ t, kind: 'potion', effect: 'heal', actor: unit.id, target: unit.id, potion: potion.id, amount, hp: unit.hp, text: say(potionTexts, 'drinkHeal', actions, { ...vars, amount }) }));
    } else if (kind === 'cure') {
      // The effect goes and stays off to the end of the fight.
      const effect = content.effectsById[potion.cures];
      unit.dots = unit.dots.filter((/** @type {Dot} */ dot) => dot.effect !== effect.id);
      unit.cured = [...(unit.cured ?? []), effect.id];
      log(() => ({ t, kind: 'potion', effect: 'cure', actor: unit.id, target: unit.id, potion: potion.id, cleared: effect.name, hp: unit.hp, text: say(potionTexts, 'drinkCure', actions, { ...vars, effect: effect.name }) }));
    } else if (kind === 'revive') {
      unit.hp = Math.max(1, Math.round(potion.amount * unit.maxHp));
      const amount = unit.hp;
      log(() => ({ t, kind: 'potion', effect: 'revive', actor: unit.id, target: unit.id, potion: potion.id, amount, hp: unit.hp, text: say(potionTexts, 'drinkRevive', actions, { ...vars, amount }) }));
    } else {
      const before = unit.mana;
      unit.mana = Math.min(unit.maxMana ?? 0, unit.mana + Math.round(potion.amount * (unit.maxMana ?? 0)));
      const amount = unit.mana - before;
      log(() => ({ t, kind: 'potion', effect: 'mana', actor: unit.id, target: unit.id, potion: potion.id, amount, hp: unit.hp, text: say(potionTexts, 'drinkMana', actions, { ...vars, amount }) }));
    }
    return true;
  };

  // A healing potion the moment HP falls below the player's mark.
  const healPotion = (/** @type {Unit} */ unit, /** @type {number} */ t) => {
    if (unit.hp > 0 && unit.hp < unit.potions.heal.below * unit.maxHp) drink(unit, 'heal', t);
  };

  // Mana enough for `need`, from a mana potion when short of it.
  const manaFor = (/** @type {Unit} */ unit, /** @type {number} */ need, /** @type {number} */ t) => unit.mana >= need || (Boolean(unit.potions?.mana) && drink(unit, 'mana', t) && unit.mana >= need);

  // Cud: the moment a member of the party faints, a member with the miracle
  // and mana for it (the fainted one too) raises it, once a fight.
  const miracle = (/** @type {Unit} */ unit, /** @type {number} */ t) => {
    for (const saint of units) {
      if (saint.side !== unit.side || (saint.hp <= 0 && saint !== unit)) continue;
      const skill = saint.skills.find((/** @type {Skill} */ each) => each.kind === 'miracle' && !each.used);
      if (!skill || !manaFor(saint, skill.mana, t)) continue;
      skill.used = true;
      saint.mana -= skill.mana;
      unit.hp = Math.max(1, Math.round(skill.params.hp * unit.maxHp));
      const amount = unit.hp;
      log(() => ({
        t,
        kind: 'heal',
        actor: saint.id,
        target: unit.id,
        skill: skill.id,
        skillName: skill.name,
        amount,
        hp: unit.hp,
        text: say(texts, 'miracle', actions, { actor: saint.name, skill: skill.name, target: unit.name, amount }),
      }));
      return true;
    }
    return false;
  };

  // Nieśmiertelność: once a fight, what would kill the Licz leaves it with
  // 1 HP.
  const undying = (/** @type {Unit} */ unit, /** @type {number} */ t) => {
    if (!unit.feat?.undying || unit.spared) return false;
    unit.spared = true;
    unit.hp = 1;
    log(() => ({ t, kind: 'drain', actor: unit.id, target: unit.id, amount: 1, hp: unit.hp, text: say(texts, 'undying', actions, { actor: unit.name, trait: unit.feat.name }) }));
    return true;
  };

  // Cudowne ocalenie: once a fight, the moment a member of the party faints,
  // a Święty of the party (the fainted one too) raises it with a share of
  // its HP, without mana.
  const rescue = (/** @type {Unit} */ unit, /** @type {number} */ t) => {
    for (const saint of units) {
      if (saint.side !== unit.side || !saint.feat?.revive || saint.raised || (saint.hp <= 0 && saint !== unit)) continue;
      saint.raised = true;
      unit.hp = Math.max(1, Math.round(saint.feat.revive * unit.maxHp));
      const amount = unit.hp;
      log(() => ({
        t,
        kind: 'heal',
        actor: saint.id,
        target: unit.id,
        skillName: saint.feat.name,
        amount,
        hp: unit.hp,
        text: say(texts, 'rescued', actions, { actor: saint.name, trait: saint.feat.name, target: unit.name, amount }),
      }));
      return true;
    }
    return false;
  };

  // Nieśmiertelność, a miracle, Cudowne ocalenie or a fern brew the moment
  // the unit faints: it rises instead.
  const revived = (/** @type {Unit} */ unit, /** @type {number} */ t) => (evolving && (undying(unit, t) || miracle(unit, t) || rescue(unit, t))) || (Boolean(unit.potions?.revive) && drink(unit, 'revive', t));

  // Owacja: every foe that falls heals each living one of the other side
  // with the trait by a share of its HP.
  const ovation = (/** @type {Unit} */ fallen, /** @type {number} */ t) => {
    for (const unit of units) {
      if (unit.side === fallen.side || unit.hp <= 0 || unit.feat?.kind !== 'spectacle' || !unit.feat.heal) continue;
      const amount = heal(unit, unit.feat.heal * unit.maxHp);
      if (amount > 0) log(() => ({ t, kind: 'drain', actor: unit.id, target: unit.id, amount, hp: unit.hp, text: say(texts, 'ovation', actions, { actor: unit.name, amount }) }));
    }
  };

  // A kill, unless the unit rises; a fallen summoner's summons go with it.
  const fell = (/** @type {Unit} */ unit, /** @type {number} */ t, /** @type {Vars} */ vars) => {
    if (revived(unit, t)) return false;
    if (unit.summons?.length) unit.summons = [];
    log(() => ({ t, kind: 'kill', target: unit.id, hp: 0, text: say(texts, 'kill', actions, vars) }));
    if (evolving) ovation(unit, t);
    return true;
  };

  // A wound skill wakes the moment HP falls below its mark, once a fight.
  const wounded = (/** @type {Unit} */ unit, /** @type {number} */ t) => {
    if (unit.hp <= 0) return;
    for (const skill of unit.skills) {
      if (!WOUND_KINDS.has(skill.kind) || skill.used || unit.hp >= skill.params.below * unit.maxHp || !manaFor(unit, skill.mana, t)) continue;
      skill.used = true;
      unit.mana -= skill.mana;
      const vars = { actor: unit.name, skill: skill.name };
      const base = { t, actor: unit.id, target: unit.id, skill: skill.id, skillName: skill.name };
      const p = skill.params;
      // A share of the damage thrown back (Niezłomny, Lustro many).
      const reflect = p.reflect ? ` ${say(texts, skill.kind === 'shield' ? 'skillShieldReflect' : 'guardReflect', actions, { reflect: Math.round(p.reflect * 100) })}` : '';
      if (skill.kind === 'guard') {
        // A little HP back, and armour for the unit's next few moves.
        const amount = mend(unit, p.heal * unit.maxHp);
        const turns = Math.round(p.turns);
        // A share of the armour, taken back as the same share when the
        // guard ends: what tore or wore the armour meanwhile (Młyn, Klątwa
        // rozkładu) or hardened it (Błogosławieństwo) stays as it did,
        // guard or not (the code review, 12.11.2026: a sum taken back left
        // the armour far lower than the tearing alone, even below zero).
        const factor = 1 + p.armor;
        unit.armor = Math.round(unit.armor * factor);
        unit.guard = { factor, until: unit.moves + turns, skill, reflect: p.reflect };
        const percent = Math.round(p.armor * 100);
        log(() => ({
          ...base,
          kind: 'heal',
          amount,
          armor: percent,
          turns,
          hp: unit.hp,
          text: `${say(texts, 'skillHeal', actions, { ...vars, amount })} ${say(texts, turns >= 5 ? 'guardArmorMany' : 'guardArmor', actions, { armor: percent, turns })}${reflect}`,
        }));
      } else {
        let text = say(texts, 'skillUse', actions, vars);
        // Boska ochrona: a shield over every member of the party, a share of
        // each one's HP (bigger with Wielkie namaszczenie); the event names
        // the others' shields for their cards.
        let guarded;
        if (skill.kind === 'shield' && p.party) {
          const anointed = unit.feat?.kind === 'anointing' ? 1 + unit.feat.bonus : 1;
          guarded = [];
          for (const member of units) {
            if (member.side !== unit.side || member.hp <= 0) continue;
            // A shield held already keeps what it does (Lustro many throws
            // back, Lodowa zbroja slows): the points only grow.
            member.shield = { ...member.shield, points: Math.max(member.shield?.points ?? 0, Math.round(member.maxHp * p.guard * anointed)) };
            if (member !== unit) guarded.push({ id: member.id, shield: member.shield.points });
          }
          text = say(texts, 'skillShieldParty', actions, { ...vars, percent: Math.round(p.guard * anointed * 100) });
        } else if (skill.kind === 'shield') {
          // A share of the unit's mana at once makes the shield, each point
          // of mana `ratio` points of damage, more with the skill's level
          // (the author: "niech pobiera stałą wartość Many np.30% ale z
          // kazdym poziomem umiejetnosci daje z tego wiecej osłony").
          // Lodowa zbroja slows those who strike it (`slow`); Tarcza
          // żywiołów burns, slows or shocks them (`retort`, in strike).
          const taken = Math.min(unit.mana, Math.round((unit.maxMana ?? 0) * p.pool));
          unit.mana -= taken;
          unit.shield = {
            points: Math.round(taken * p.ratio),
            reflect: p.reflect,
            ...(p.slow && { slow: p.slow }),
            ...(p.retort && { retort: { burn: p.burn, burnTicks: p.burnTicks, frost: p.frost, shock: p.shock, label: p.shockLabel } }),
          };
          text = say(texts, 'skillShield', actions, { ...vars, shield: unit.shield.points, mana: taken }) + reflect;
          if (p.slow) text += ` ${say(texts, 'skillShieldSlow', actions, { slow: Math.round(p.slow * 100) })}`;
          if (p.retort) text += ` ${say(texts, 'skillShieldRetort', actions, {})}`;
        }
        if (skill.kind === 'evade') {
          const hits = Math.round(p.hits);
          unit.evade = { hits, dodge: p.dodge, counter: p.counter, blades: p.blades, skill };
          text = say(texts, 'skillEvade', actions, { ...vars, hits, dodge: Math.round(p.dodge * 100), counter: Math.round(p.counter * 100) });
          if (p.blades) text += ` ${say(texts, 'skillEvadeBlades', actions, { blades: Math.round(p.blades * 100) })}`;
        }
        log(() => ({ ...base, kind: 'skill', hp: unit.hp, shield: shieldLeft(unit), ...(guarded?.length && { guarded }), text }));
      }
    }
  };

  // Drugi oddech (the Rdzeń): once a fight, the moment HP falls below its
  // mark, a share of it comes back.
  const rally = (/** @type {Unit} */ unit, /** @type {number} */ t) => {
    if (!unit.rally || unit.rallied || unit.hp <= 0 || unit.hp >= (unit.rallyBelow ?? 0.3) * unit.maxHp) return;
    unit.rallied = true;
    const amount = heal(unit, unit.rally * unit.maxHp);
    log(() => ({ t, kind: 'heal', actor: unit.id, target: unit.id, amount, hp: unit.hp, text: say(texts, 'rally', actions, { actor: unit.name, amount }) }));
  };

  const tickEffects = (/** @type {Unit} */ unit, /** @type {number} */ t) => {
    for (const dot of unit.dots) {
      if (unit.hp <= 0) break;
      const resisted = reduction(unit.resist[dot.element] ?? 0, dot.sourceLevel, balance);
      // Zimowy oddech and Toksyny shelter from their element.
      const shelter = evolving && unit.shelter ? 1 - (unit.shelter[dot.element] ?? 0) : 1;
      const raw = Math.max(1, Math.round(dot.perTick * (1 - resisted) * (1 + (unit.weak?.[dot.element] ?? 0)) * shelter));
      const absorbed = unit.shield ? absorb(unit, raw) : 0;
      const amount = raw - absorbed;
      damage(unit, amount, dot.source);
      dot.ticks -= 1;
      const vars = { target: unit.name, effect: dot.name, damage: amount };
      // Klątwa rozkładu: the armour wears away with every tick.
      const decay = dot.decay && unit.hp > 0 ? Math.round(unit.armor * dot.decay) : 0;
      if (decay) unit.armor -= decay;
      log(() => ({
        t,
        kind: 'tick',
        target: unit.id,
        effect: dot.name,
        element: dot.element,
        damage: amount,
        absorbed: absorbed || undefined,
        shield: shieldLeft(unit),
        left: dot.ticks,
        hp: unit.hp,
        text: say(texts, 'effectTick', actions, vars) + (decay ? ` ${say(texts, 'armorShred', actions, { percent: Math.round(dot.decay * 100) })}` : ''),
      }));
      // A unit that rose (a fern brew, a miracle) may still wake a skill or
      // drink; one that fell of poison may rise for its poisoner (Żniwo).
      const down = unit.hp <= 0 && fell(unit, t, vars);
      if (!down) {
        if (unit.skills.length > 0) wounded(unit, t);
        if (unit.potions?.heal) healPotion(unit, t);
        if (unit.rally) rally(unit, t);
      } else if (evolving && dot.effect === 'poisoned') rise(unit, dot.source, t);
    }
    unit.dots = unit.dots.filter((/** @type {Dot} */ dot) => dot.ticks > 0);
  };

  // How many summons may stand by a unit at once: one, two with Serce
  // puszczy.
  const summonLimit = (/** @type {Unit} */ unit) => unit.feat?.summons ?? 1;

  // Żniwo: a foe killed by the Nekromanta's poison rises as a skeleton that
  // fights on its side to the end of the fight, as the Nekromanta's summon
  // (a character has one at a time, so only while it has none): it stands
  // before the Nekromanta, takes the foes' blows and strikes a random foe
  // every move, as a summon does (summonActs).
  const rise = (/** @type {Unit} */ fallen, /** @type {string} */ sourceId, /** @type {number} */ t) => {
    const source = units.find((unit) => unit.id === sourceId);
    const feat = source?.feat;
    if (!source || feat?.kind !== 'toxins' || !feat.raise || source.hp <= 0 || source.summons.length >= summonLimit(source)) return;
    const hp = Math.max(1, Math.round(source.maxHp * feat.raiseHp));
    const name = feat.raiseName;
    // The summon's blows go under the trait's name.
    source.summons.push({
      skill: { id: RISEN, name: feat.name },
      name,
      hp,
      until: Infinity,
      power: feat.raisePower,
      raw: ((source.weapon.min + source.weapon.max) / 2) * source.damageScale,
      physical: true,
      dot: null,
    });
    log(() => ({
      t,
      kind: 'summon',
      state: 'up',
      actor: source.id,
      target: source.id,
      skill: RISEN,
      skillName: feat.name,
      summon: name,
      figure: 'skeleton',
      summonHp: hp,
      hp: source.hp,
      text: say(texts, 'summonRisen', actions, { target: fallen.name, summon: name, hp }),
    }));
  };

  // The opponent that needs the fewest expected hits, against its defence,
  // with the front drawing the blows as it draws the monsters' (the author:
  // "Przód najczęściej ściąga aggro, później Środek, a później Tył"): the
  // hits count divided by the position's target weight, so the middle goes
  // first when it needs at most 60% of the front's hits and the back at
  // most 40%. The choice holds until the target falls, so blows do not
  // scatter.
  const quickestKill = (/** @type {Unit} */ actor, /** @type {Unit[]} */ opponents) => {
    const weapon = actor.weapon;
    const average = ((weapon.min + weapon.max) / 2) * actor.damageScale;
    let best = null;
    let fewest = Infinity;
    for (const unit of opponents) {
      const defense = weapon.category === 'physical' ? unit.armor : (unit.resist[weapon.element] ?? 0);
      const hits = unit.hp / Math.max(1, average * (1 - reduction(defense, actor.level, balance))) / tuning.targetWeights[unit.position];
      if (hits < fewest) {
        best = unit;
        fewest = hits;
      }
    }
    return best;
  };

  // Monsters pick by position; Opoka draws more of their blows (aggro).
  const weightOf = evolving
    ? (/** @type {Unit} */ unit) => tuning.targetWeights[unit.position] * (unit.feat?.aggro ?? 1)
    : (/** @type {Unit} */ unit) => tuning.targetWeights[unit.position];
  // Wyzwanie: while it lasts, the foes strike only the one who challenged
  // them.
  const challenger = (/** @type {Unit[]} */ opponents) => opponents.find((/** @type {Unit} */ unit) => unit.stances.some((/** @type {Stance} */ stance) => stance.provoke));

  // Those standing furthest back: the back row, or the row nearest to it
  // while it is empty. A summon stands before its summoner, so it takes the
  // blows meant for a summoner there, as it takes any (summonTakes).
  const hindmost = (/** @type {Unit[]} */ opponents) => {
    const depth = Math.max(...opponents.map((/** @type {Unit} */ unit) => DEPTH[unit.position] ?? 0));
    return opponents.filter((/** @type {Unit} */ unit) => (DEPTH[unit.position] ?? 0) === depth);
  };

  // Ukryty w mroku (666: a creature `hidden` in monsters.json): those a
  // unit may choose for a blow of its own. A hidden one is not chosen while
  // one without it still fights beside it; once only hidden ones are left,
  // they are chosen as any. Blows at many (a sweep, a cloud, a splash, a
  // pierce going on, a whirl) and answers to a blow strike it as any other.
  // Draws no random numbers.
  const inSight = (/** @type {Unit[]} */ opponents) => {
    if (!opponents.some((/** @type {Unit} */ unit) => unit.hidden)) return opponents;
    const plain = opponents.filter((/** @type {Unit} */ unit) => !unit.hidden);
    return plain.length > 0 ? plain : opponents;
  };

  const pickTarget = (/** @type {Unit} */ actor, /** @type {Unit[]} */ opponents) => {
    const taunt = evolving ? challenger(opponents) : null;
    if (taunt) return taunt;
    const seen = inSight(opponents);
    if (actor.side === 'ally' || even) return quickestKill(actor, seen);
    // Atak na tył szyku (463: a monster's attack with `target: "back"`):
    // the one standing furthest back, by the same draw among equals.
    return rng.weighted(actor.weapon.target === 'back' ? hindmost(seen) : seen, weightOf);
  };

  // Niezdobyty: a blow meant for another member of the Kolos's party falls
  // on the Kolos instead, by the trait's share; a blow meant for the Kolos
  // or one at many, as a sweep's, stays where it was meant. Draws a number
  // only where such a guardian stands.
  const intercepted = (/** @type {Unit} */ actor, /** @type {Unit} */ target, /** @type {number} */ t) => {
    if (!evolving) return target;
    const guardian = units.find((unit) => unit.side === target.side && unit !== target && unit.hp > 0 && unit.feat?.intercept);
    if (!guardian || !rng.chance(guardian.feat.intercept)) return target;
    log(() => ({
      t,
      kind: 'skill',
      actor: guardian.id,
      skillName: guardian.feat.name,
      targets: [target.id],
      text: say(texts, 'intercepted', actions, { actor: guardian.name, trait: guardian.feat.name, target: target.name }),
    }));
    return guardian;
  };

  // An effect over time from a blow: the target's Will may keep it off, and
  // so does a cure for it drunk in this fight. One the target carries is
  // drunk the moment the effect it cures lands. Toksyny makes a poison
  // stronger and longer, Przewodnik żywiołów an effect of its elements
  // longer; Czarny jad's poison weakens the blows of the poisoned (`weaken`).
  const applyDot = (/** @type {Unit} */ actor, /** @type {Unit} */ target, /** @type {Dot} */ dot, /** @type {number} */ raw, /** @type {number} */ t, /** @type {Vars} */ vars) => {
    if (target.cured?.includes(dot.effect)) return;
    const resisted = cappedChance(target.willRating, actor.level, tuning.willCap, balance);
    if (!rng.chance(dot.chance * (1 - resisted))) return;
    const effect = content.effectsById[dot.effect];
    const feat = evolving ? actor.feat : null;
    const toxic = feat?.kind === 'toxins' && effect.id === 'poisoned';
    const longer = (toxic || (feat?.kind === 'elements' && feat.elements.includes(effect.element)) ? feat.ticks : 0) + (trait?.effectTicks?.[effect.id] ?? 0);
    const perTick = Math.max(1, Math.round(raw * (toxic ? dot.power * (1 + feat.damage) : dot.power)));
    const ticks = dot.ticks + longer;
    const active = target.dots.find((/** @type {Dot} */ each) => each.effect === effect.id);
    if (active) {
      active.ticks = Math.max(active.ticks, ticks);
      active.perTick = Math.max(active.perTick, perTick);
      if (dot.weaken) active.weaken = Math.max(active.weaken ?? 0, dot.weaken);
      if (dot.decay) active.decay = Math.max(active.decay ?? 0, dot.decay);
    } else {
      target.dots.push({
        effect: effect.id,
        name: effect.name,
        element: effect.element,
        perTick,
        ticks,
        sourceLevel: actor.level,
        source: actor.id,
        ...(dot.weaken && { weaken: dot.weaken }),
        // Klątwa rozkładu's wearing of armour (tickEffects).
        ...(dot.decay && { decay: dot.decay }),
      });
    }
    log(() => ({ t, kind: 'effect', actor: actor.id, target: target.id, effect: effect.name, element: effect.element, hp: target.hp, text: say(texts, 'effectApplied', actions, { ...vars, effect: effect.name }) }));
    if (target.potions?.cure?.[effect.id]) drink(target, 'cure', t, effect.id);
  };

  // A blow that mires (Ugrzęźnięcie): the target's Will may keep it off, as
  // with an effect over time; otherwise its next move comes later, 1 / (1 -
  // slow) times as late, as after a skill's slow.
  const applySlow = (/** @type {Unit} */ actor, /** @type {Unit} */ target, /** @type {Record<string, any>} */ slow, /** @type {number} */ t, /** @type {Vars} */ vars) => {
    const resisted = cappedChance(target.willRating, actor.level, tuning.willCap, balance);
    if (!rng.chance(slow.chance * (1 - resisted))) return;
    const effect = content.effectsById[slow.effect];
    target.next += (slow.slow / (1 - slow.slow)) * target.interval;
    log(() => ({ t, kind: 'slow', actor: actor.id, targets: [target.id], effect: effect.name, element: effect.element, text: say(texts, 'mired', actions, { ...vars, effect: effect.name }) }));
  };

  const fallenFoes = (/** @type {Unit} */ unit) => units.filter((other) => other.side !== unit.side && other.hp <= 0).length;
  const isChilled = (/** @type {Unit} */ unit) => Boolean(unit.chilled) || unit.dots.some((/** @type {Dot} */ dot) => dot.effect === 'chilled');
  // The biggest share a stance of the living units `of` gives by `key`: a
  // roar that weakens the other side (weaken), a wall of shields (wall), a
  // choir (chorus), the party's dodge (Wizja: evasion) or the other side's
  // misses (Zaćmienie: eclipse).
  const stanceShare = (/** @type {string} */ key, /** @type {(unit: Unit) => boolean} */ of) => {
    let most = 0;
    for (const unit of units) {
      if (unit.hp <= 0 || !of(unit)) continue;
      for (const stance of unit.stances) if ((stance[key] ?? 0) > most) most = stance[key];
    }
    return most;
  };
  // The stance of the living units of a side that gives the most by `key`
  // (Znak gromu: its chance), or null.
  const strongestStance = (/** @type {string} */ key, /** @type {string} */ side) => {
    let best = null;
    for (const unit of units) {
      if (unit.hp <= 0 || unit.side !== side) continue;
      for (const stance of unit.stances) if (stance[key] && (!best || stance.chance > best.chance)) best = stance;
    }
    return best;
  };
  // Chór, Hymn and Wiwaty: the biggest bonus a stance gives to the blows of
  // a side, Wiwaty's growing with every foe of its side fallen.
  const chorusOf = (/** @type {string} */ side) => {
    let most = 0;
    for (const unit of units) {
      if (unit.hp <= 0 || unit.side !== side) continue;
      for (const stance of unit.stances) {
        const value = (stance.chorus ?? 0) + (stance.perKill ? stance.perKill * fallenFoes(unit) : 0);
        if (value > most) most = value;
      }
    }
    return most;
  };
  // Przewodnik watahy: while the white wolf stands, its howl strengthens its
  // side's blows; the biggest howl of the side's summons.
  const howlOf = (/** @type {string} */ side) => {
    let most = 0;
    for (const unit of units) {
      if (unit.hp <= 0 || unit.side !== side) continue;
      for (const summon of unit.summons) if ((summon.howl ?? 0) > most) most = summon.howl;
    }
    return most;
  };
  // Szpon orła and Zaćmienie: the chance that the blow misses and its words;
  // a summon's blow is its own, not its blinded summoner's.
  const missOf = (/** @type {Unit} */ actor, /** @type {Move} */ move) => {
    const blind = actor.blinded && !move.summoned && actor.moves < actor.blinded.until ? actor.blinded.chance : 0;
    const eclipse = stanceShare('eclipse', (unit) => unit.side !== actor.side);
    return { chance: Math.min(0.9, blind + eclipse), words: blind ? 'blindMiss' : 'eclipseMiss' };
  };
  // The foes of `actor` in the foremost row still standing.
  const foremost = (/** @type {Unit[]} */ opponents) => {
    const living = opponents.filter((unit) => unit.hp > 0);
    const depth = Math.min(...living.map((unit) => DEPTH[unit.position] ?? 0));
    return living.filter((unit) => (DEPTH[unit.position] ?? 0) === depth);
  };

  // What the evolutions add to a blow or take from it: the attacker's trait
  // and stances, the weakness of a poisoned or chilled attacker, the
  // target's stances and marks, and the blow's own bonuses.
  const evolved = (/** @type {Unit} */ actor, /** @type {Unit} */ target, /** @type {Move} */ move, /** @type {string} */ category, /** @type {string[]} */ elements) => {
    let factor = 1;
    const feat = actor.feat;
    if (feat?.kind === 'fury') factor *= 1 + feat.damage * Math.min(1, Math.max(0, (1 - actor.hp / actor.maxHp) / (1 - feat.at)));
    else if (feat?.kind === 'spectacle') factor *= 1 + Math.min(feat.max, feat.perKill * fallenFoes(actor));
    else if (feat?.kind === 'tracker' && feat.families.includes(target.family)) factor *= 1 + feat.damage;
    else if (feat?.kind === 'elements' && category === 'magical' && elements.some((/** @type {string} */ element) => feat.elements.includes(element))) factor *= 1 + feat.damage;
    else if (feat?.kind === 'zeal' && elements.includes(feat.element)) factor *= 1 + (target.family === 'spirit' ? feat.spirits : feat.damage);
    else if (feat?.kind === 'precision' && target.dots.some((/** @type {Dot} */ dot) => dot.effect === 'poisoned')) factor *= 1 + feat.poisoned;
    else if (feat?.kind === 'shadowStep' && actor.nextBlow && !move.counter && !move.blade) {
      factor *= 1 + actor.nextBlow;
      actor.nextBlow = 0;
    }
    for (const stance of actor.stances) if (stance.damage) factor *= 1 + stance.damage;
    for (const stance of target.stances) if (stance.taken) factor *= 1 + stance.taken;
    const weaken = actor.dots.reduce((/** @type {number} */ most, /** @type {Dot} */ dot) => Math.max(most, dot.weaken ?? 0), 0);
    if (weaken) factor *= 1 - weaken;
    if (actor.chilled?.weaken) factor *= 1 - actor.chilled.weaken;
    if (target.marked && target.moves < target.marked.until) factor *= 1 + target.marked.bonus;
    if (move.chilledBonus && isChilled(target)) factor *= 1 + move.chilledBonus;
    if (move.executeBelow && target.hp < move.executeBelow * target.maxHp) factor *= 1 + move.executeBonus;
    // Rzeź: more the less HP its user has left, all of it at rageAt.
    if (move.rage) factor *= 1 + move.rage * Math.min(1, Math.max(0, (1 - actor.hp / actor.maxHp) / (1 - (move.rageAt ?? RAGE_AT))));
    // Sąd ostateczny: more against a family (duchy i demony).
    if (move.familyBonus && target.family === move.family) factor *= 1 + move.familyBonus;
    // Lodowy grobowiec: the foe in ice takes more until it moves again;
    // Pieczęć świętości: the sealed foe takes more to the end of the fight.
    if (target.frozen && target.moves < target.frozen.until) factor *= 1 + target.frozen.bonus;
    if (target.sealed) factor *= 1 + target.sealed.bonus;
    // Pojedynek and Namierzenie: more against the foe the unit marked, and,
    // in a duel, less from it.
    if (target.focus?.source === actor) factor *= 1 + target.focus.damage;
    if (actor.focus?.source === target && actor.focus.guard) factor *= 1 - actor.focus.guard;
    // Ryk berserkera weakens the other side's blows; Chór, Hymn and Wiwaty
    // strengthen its own side's, and so does the howl of Przewodnik watahy.
    const roar = stanceShare('weaken', (/** @type {Unit} */ unit) => unit.side !== actor.side);
    if (roar) factor *= 1 - roar;
    const chorus = chorusOf(actor.side);
    if (chorus) factor *= 1 + chorus;
    const howl = howlOf(actor.side);
    if (howl) factor *= 1 + howl;
    // Harmonia żywiołów: every element the unit's spells used before this
    // move strengthens a spell; this one's count from its next move.
    if (actor.harmony && category === 'magical') {
      factor *= 1 + actor.harmony.bonus * actor.harmony.used.size;
      for (const element of elements) if (element) actor.harmony.fresh.add(element);
    }
    return factor;
  };

  // The share of a blow its target throws back: a guard's, a challenge's,
  // and a mirror shield's of what it took; in a duel only a part of it, as
  // of the armour (`reflectShare`, pvp-arena.js).
  const throwBack = (/** @type {Unit} */ target, /** @type {Unit} */ actor, /** @type {number} */ amount, /** @type {number} */ absorbed, /** @type {number} */ t) => {
    let share = target.guard?.reflect ?? 0;
    for (const stance of target.stances) if (stance.reflect) share += stance.reflect;
    const back = Math.round((amount * share + absorbed * (target.shield?.reflect ?? 0)) * (target.reflectShare ?? 1));
    if (back <= 0 || target.hp <= 0 || actor.hp <= 0) return;
    damage(actor, back, target.id);
    const vars = { actor: target.name, target: actor.name, damage: back };
    log(() => ({ t, kind: 'reflect', actor: target.id, target: actor.id, damage: back, hp: actor.hp, text: say(texts, 'reflect', actions, vars) }));
    if (actor.hp === 0 && fell(actor, t, vars)) return;
    // As after any blow: a guard, a shield or an evade wakes, and a healing
    // potion is drunk, the moment the HP falls below its mark (the code
    // review, 12.11.2026).
    if (actor.skills.length > 0) wounded(actor, t);
    if (actor.potions?.heal) healPotion(actor, t);
    if (actor.rally) rally(actor, t);
  };

  // A summon (Przywołanie żywiołaka, Trujący Szlam) stands before its
  // summoner and takes the foes' blows meant for it: it cannot dodge, it has
  // the summoner's armour and resistances, and when its HP runs out it falls
  // (the slime bursts and poisons every foe). Of two summons (Serce puszczy)
  // the one called first stands in front; when it falls, the other takes
  // its place. The events name the summon's skill (summonSkill), so the
  // playback finds its card among two.
  const summonTakes = (/** @type {Unit} */ actor, /** @type {Unit} */ owner, /** @type {number} */ t, /** @type {Move} */ move) => {
    const decoy = owner.summons[0];
    const weapon = actor.weapon;
    const category = move.category ?? weapon.category;
    const element = move.element ?? weapon.element;
    const raw = rng.float(weapon.min, weapon.max) * actor.damageScale * (move.power ?? 1) * (actor.damageBonus ? 1 + actor.damageBonus : 1);
    const defense = category === 'physical' ? owner.armor : (owner.resist[element] ?? 0);
    const amount = Math.max(1, Math.round(raw * (1 - reduction(defense, actor.level, balance)) * evolved(actor, owner, move, category, [element])));
    decoy.hp = Math.max(0, decoy.hp - amount);
    dealt[actor.id] += amount;
    const attack = move.skill && !move.own ? move.skill.name : weapon.attackName;
    log(() => ({
      t,
      kind: 'summon',
      state: 'hit',
      actor: actor.id,
      target: owner.id,
      summon: decoy.name,
      summonSkill: decoy.skill.id,
      summonHp: decoy.hp,
      damage: amount,
      hp: owner.hp,
      text: say(texts, 'summonTaken', actions, { summon: decoy.name, attack, damage: amount }),
    }));
    if (decoy.hp > 0) return;
    owner.summons = owner.summons.filter((/** @type {Unit} */ one) => one !== decoy);
    log(() => ({
      t,
      kind: 'summon',
      state: 'fell',
      actor: owner.id,
      target: owner.id,
      summon: decoy.name,
      summonSkill: decoy.skill.id,
      summonHp: 0,
      hp: owner.hp,
      text: say(texts, 'summonFell', actions, { summon: decoy.name }),
    }));
    if (!decoy.burst || !decoy.dot) return;
    log(() => ({ t, kind: 'skill', actor: owner.id, skill: decoy.skill.id, skillName: decoy.skill.name, targets: foesOf(owner).map((unit) => unit.id), text: say(texts, 'summonBurst', actions, { summon: decoy.name }) }));
    for (const foe of foesOf(owner)) applyDot(owner, foe, decoy.dot, decoy.raw, t, { actor: owner.name, target: foe.name });
  };

  const foesOf = (/** @type {Unit} */ unit) => units.filter((other) => other.side !== unit.side && other.hp > 0);

  // A blow of the unit's own, plain or of a skill: not a counter, a dance's
  // cut, a storm cloud's or a pet's strike, a summon's blow or a shadow's
  // repeat. Only these wake a sure critical blow (Zniknięcie) and are
  // repeated by a shadow double.
  const ownBlow = (/** @type {Move} */ move) => !move.counter && !move.blade && !move.cloud && !move.pet && !move.summoned && !move.mirror;

  // A blow that does not reach its target: it vanished (Zniknięcie) or its
  // shield stopped it (Twierdza). Logged as a dodge, with its own words.
  const missed = (/** @type {Unit} */ actor, /** @type {Unit} */ target, /** @type {number} */ t, /** @type {Move} */ move, /** @type {string} */ words) => {
    const vars = { actor: actor.name, target: target.name, skill: move.skill?.name };
    log(() => ({
      t,
      kind: 'dodge',
      actor: actor.id,
      target: target.id,
      hp: target.hp,
      ...marksOf(move),
      ...(words === 'blocked' && { blocked: true }),
      ...(MISSES.has(words) && { missed: true }),
      text: say(texts, words, actions, vars),
    }));
  };

  // One blow, plain or shaped by a skill (`move`): its power, the share of
  // armour it ignores, whether it can be dodged or always lands critically,
  // its kind of damage, an effect it carries and whether it pins the target.
  const strike = (/** @type {Unit} */ actor, /** @type {Unit} */ target, /** @type {number} */ t, /** @type {Move} */ move = PLAIN) => {
    // Szpon orła blinds a foe, Zaćmienie darkens the field: the blow may
    // miss whoever it was meant for (an answer to a dodge never does).
    // Draws a number only where one of them is at work.
    if (evolving && !move.counter) {
      const miss = missOf(actor, move);
      if (miss.chance > 0 && rng.chance(miss.chance)) {
        missed(actor, target, t, move, miss.words);
        return;
      }
    }
    if (evolving && target.summons.length > 0 && !move.counter) {
      summonTakes(actor, target, t, move);
      return;
    }
    if (evolving && target.stances.some((/** @type {Stance} */ stance) => stance.vanish)) {
      missed(actor, target, t, move, 'vanished');
      return;
    }
    if (evolving && target.feat?.block && rng.chance(target.feat.block)) {
      missed(actor, target, t, move, 'blocked');
      return;
    }
    const weapon = actor.weapon;
    const category = move.category ?? weapon.category;
    const element = move.element ?? weapon.element;
    const attack = move.skill && !move.own ? move.skill.name : weapon.attackName;
    const vars = { actor: actor.name, target: target.name, attack, skill: move.skill?.name, ...move.vars };
    const marks = marksOf(move);
    // Namierzenie: the foe the unit locked on cannot dodge its blows; Pewny
    // cios (the Rdzeń): nor the unit's first own blow; nor can any foe the
    // unit's own blows while Spokojna ręka lasts.
    const locked = evolving && target.focus?.source === actor && target.focus.sure;
    const sureFirst = Boolean(actor.firstSure) && !actor.firstSureUsed && ownBlow(move);
    if (sureFirst) actor.firstSureUsed = true;
    const steady = evolving && ownBlow(move) ? actor.stances.find((/** @type {Stance} */ stance) => stance.steady) : null;
    if (category === 'physical' && !move.undodgeable && !locked && !sureFirst && !steady) {
      const evading = target.evade && target.evade.hits > 0 ? target.evade : null;
      if (evading) evading.hits -= 1;
      const base = cappedChance(target.dodgeRating, actor.level, tuning.dodgeCap, balance);
      // Taniec ostrzy, Riposta, Widmowy krok and Wizja (the whole party)
      // raise it above the cap. Mgła (the Labirynt's blessing) too.
      const bonus =
        (evading ? evading.dodge : 0) +
        (evolving && target.riposte ? target.riposte.dodge : 0) +
        (evolving && target.feat?.kind === 'shadowStep' ? (target.feat.dodge ?? 0) : 0) +
        (evolving ? stanceShare('evasion', (/** @type {Unit} */ unit) => unit.side === target.side) : 0) +
        (target.dodgeChance ?? 0);
      const dodge = bonus ? Math.min(0.95, base + bonus) : base;
      if (rng.chance(dodge)) {
        log(() => ({ t, kind: 'dodge', actor: actor.id, target: target.id, hp: target.hp, ...marks, text: say(texts, wordsFor('dodge', move), actions, vars) }));
        // Krok cienia: the next blow after a dodge is stronger.
        if (evolving && target.feat?.kind === 'shadowStep') target.nextBlow = target.feat.afterDodge;
        if (evading && actor.hp > 0) {
          strike(target, actor, t, { counter: true, power: evading.counter, undodgeable: true });
          // Taniec ostrzy: a cut at a random foe besides the counter, one
          // in sight (Ukryty w mroku).
          const foes = evading.blades && target.hp > 0 ? foesOf(target) : NO_SKILLS;
          if (foes.length > 0) strike(target, rng.pick(inSight(foes)), t, { skill: evading.skill, power: evading.blades, undodgeable: true, blade: true });
        } else if (evolving && target.riposte && actor.hp > 0 && target.hp > 0) {
          const { skill, power, dot } = target.riposte;
          strike(target, actor, t, { skill, counter: true, power, undodgeable: true, dot });
        }
        return;
      }
    }
    // Zniknięcie: the unit's next own blow after vanishing is critical and
    // stronger.
    const vanished = evolving && actor.nextCrit && ownBlow(move) ? actor.nextCrit : null;
    if (vanished) actor.nextCrit = null;
    const raw = rng.float(weapon.min, weapon.max) * actor.damageScale * (move.power ?? 1) * (actor.damageBonus ? 1 + actor.damageBonus : 1) * (vanished ? 1 + vanished.power : 1);
    const feat = evolving ? actor.feat : null;
    // Zimna krew: the first blow that lands is critical (Sokole oko: the
    // first two).
    const sure = feat?.kind === 'coldBlood' && actor.struck < (feat.sure ?? 1);
    if (feat) actor.struck += 1;
    // Ostrze Rdzenia and Pierwsza krew: the unit's first own blow that lands
    // is critical; Bystre oko: points more of the chance. Spokojna ręka and
    // Krwawy znak: critical blows more often.
    const opening = Boolean(actor.openingCrit) && !actor.openedCrit && ownBlow(move);
    if (opening) actor.openedCrit = true;
    const critBonus = (move.critBonus ?? 0) + (actor.critChance ?? 0) + (steady?.critBonus ?? 0) + (evolving ? (target.bloodMark?.crit ?? 0) : 0);
    const critical = move.alwaysCrit || sure || Boolean(vanished) || opening || rng.chance(Math.min(1, cappedChance(actor.critRating, target.level, tuning.critCap, balance) + critBonus));
    const critFactor = critical ? tuning.critMultiplier * (feat?.critDamage ? 1 + feat.critDamage : 1) : 1;
    // A blow of several elements (Promień Żywiołów) is split between them
    // evenly, each against its resistance and weakness. Mur tarcz hardens
    // the armour of the target's whole side.
    const spread = move.elements;
    const wall = evolving && category === 'physical' ? stanceShare('wall', (/** @type {Unit} */ unit) => unit.side === target.side) : 0;
    const defense = category === 'physical' ? target.armor * (1 + wall) * (1 - (move.armorIgnore ?? 0)) : (target.resist[element] ?? 0);
    const weak = (element && target.weak?.[element]) || 0;
    const ward = category === 'magical' ? (target.ward ?? 0) : 0;
    // A trophy of the Encyklopedia: blows against its creature hit harder.
    const trophy = actor.trophies?.[target.monsterId] ?? 0;
    let amount;
    // The weapon's zaklęcie żywiołu: its element and what share of the blow
    // it made, for the part shown over the target and in the log (914).
    let imbuedElement = null;
    let imbuedShare = 0;
    if (spread) {
      const share = spread.reduce((/** @type {number} */ sum, /** @type {string} */ each) => sum + (1 - reduction(target.resist[each] ?? 0, actor.level, balance)) * (1 + (target.weak?.[each] ?? 0)), 0) / spread.length;
      amount = Math.max(1, Math.round(raw * critFactor * share * (1 - ward) * (1 + trophy) * (evolving ? evolved(actor, target, move, category, spread) : 1)));
    } else {
      const plain = raw * critFactor * (1 - reduction(defense, actor.level, balance)) * (1 + weak) * (1 - ward) * (1 + trophy);
      // A weapon's zaklęcie żywiołu turns a share of the blow into its
      // element, against the target's resistance and weakness to it.
      const imbue = weapon.imbue;
      const imbued = imbue
        ? raw * critFactor * (1 - reduction(target.resist[imbue.element] ?? 0, actor.level, balance)) * (1 + (target.weak?.[imbue.element] ?? 0)) * (1 - ward) * (1 + trophy)
        : 0;
      amount = Math.max(1, Math.round(imbue ? plain * (1 - imbue.share) + imbued * imbue.share : plain));
      if (imbue) {
        const whole = plain * (1 - imbue.share) + imbued * imbue.share;
        imbuedElement = imbue.element;
        imbuedShare = whole > 0 ? (imbued * imbue.share) / whole : 0;
      }
      if (evolving) {
        const shelter = target.shelter?.[element] ? 1 - target.shelter[element] : 1;
        amount = Math.max(1, Math.round(amount * evolved(actor, target, move, category, [element]) * shelter));
      }
    }
    // Naelektryzowane groty: a spark of lightning on top of a blow
    // (Gromowe groty: and the one it struck slows down; Grom Peruna: and it
    // jumps on to another foe).
    const bolt = (/** @type {Unit} */ unit, /** @type {number} */ share) => Math.max(1, Math.round(raw * share * (1 - reduction(unit.resist.lightning ?? 0, actor.level, balance)) * (1 + (unit.weak?.lightning ?? 0))));
    let spark = 0;
    let jump = null;
    if (feat?.kind === 'charged' && !move.cloud && !move.counter && rng.chance(feat.chance)) {
      const resisted = reduction(target.resist[feat.element] ?? 0, actor.level, balance);
      spark = Math.max(1, Math.round(raw * feat.power * (1 - resisted) * (1 + (target.weak?.[feat.element] ?? 0))));
      amount += spark;
      const others = feat.chain ? foesOf(actor).filter((unit) => unit !== target) : NO_SKILLS;
      if (others.length > 0) jump = rng.pick(others);
    }
    // Znak gromu: any blow of the party may strike its foe with lightning.
    const sign = evolving && !move.cloud && !move.counter && !move.pet ? strongestStance('sign', actor.side) : null;
    const thunder = sign && rng.chance(sign.chance) ? bolt(target, sign.power) : 0;
    amount += thunder;
    // Cios ostateczny: a foe low on HP, but no champion, dies of the blow,
    // whatever shields it.
    const slain = Boolean(move.killBelow) && !target.champion && target.hp < move.killBelow * target.maxHp;
    const absorbed = target.shield && !slain ? absorb(target, amount) : 0;
    amount -= absorbed;
    if (slain) amount = Math.max(amount, target.hp);
    damage(target, amount, actor.id);
    // A slow of 30% puts the next move off as a skill's slow does (1 / (1 -
    // slow) times as late): the spark of Gromowe groty on its target, and
    // Lodowa zbroja on the one who struck it.
    const slowed = [];
    if (spark && feat.slow && target.hp > 0) slowed.push([target, feat.slow]);
    if (absorbed && target.shield?.slow && actor.hp > 0) slowed.push([actor, target.shield.slow]);
    // Przebudzenie dębu: the oak's roots hold the foe it struck.
    if (move.root && target.hp > 0) slowed.push([target, move.root]);
    // Tarcza żywiołów: the one who struck it burns, slows down or is
    // shocked, one of the three at random.
    const retort = absorbed && target.shield?.retort && actor.hp > 0 ? target.shield.retort : null;
    const element3 = retort ? rng.int(0, 2) : -1;
    if (element3 === 1) slowed.push([actor, retort.frost]);
    // Millstone tears off a share of the target's armour for good.
    const shred = move.armorShred && target.hp > 0 ? Math.round(target.armor * move.armorShred) : 0;
    if (shred) target.armor -= shred;
    const kind = critical ? 'crit' : 'hit';
    // The part of the damage from the weapon's element (914), the spark and
    // the lightning aside: a number of its own over the target and „w tym N
    // od natury” in the log, both drawn by the client.
    const elemental = imbuedElement ? Math.round(imbuedShare * Math.max(0, amount - spark - thunder)) : 0;
    log(() => ({
      t,
      kind,
      actor: actor.id,
      target: target.id,
      damage: amount,
      ...(elemental > 0 && { imbued: { element: imbuedElement, damage: elemental } }),
      absorbed: absorbed || undefined,
      shield: shieldLeft(target),
      hp: target.hp,
      ...marks,
      text:
        say(texts, wordsFor(kind, move), actions, { ...vars, damage: amount }) +
        // A blow of several elements (Promień Żywiołów) uses none of the
        // weapon's, so it names no weakness to it.
        (weak && !spread ? ` ${say(texts, 'weakness', actions, { element: content.elementsById[element].name, percent: Math.round(weak * 100) })}` : '') +
        (spark ? ` ${say(texts, 'charged', actions, { damage: spark })}` : '') +
        (thunder ? ` ${say(texts, 'signSpark', actions, { damage: thunder })}` : '') +
        (slain ? ` ${say(texts, 'slain', actions, vars)}` : '') +
        (shred ? ` ${say(texts, 'armorShred', actions, { percent: Math.round(move.armorShred * 100) })}` : '') +
        (absorbed ? ` ${say(texts, 'absorbed', actions, { absorbed })}` : ''),
    }));
    for (const [unit, slow] of slowed) {
      unit.next += (slow / (1 - slow)) * unit.interval;
      const rooted = unit === target && slow === move.root;
      log(() => ({ t, kind: 'slow', actor: actor.id, targets: [unit.id], text: say(texts, rooted ? 'rooted' : 'slowOne', actions, { target: unit.name }) }));
    }
    // Grom Peruna: the spark's lightning jumps on to another foe, against
    // that one's resistance.
    if (jump && jump.hp > 0) {
      const leap = bolt(jump, feat.power);
      damage(jump, leap, actor.id);
      const leapVars = { ...vars, target: jump.name, damage: leap };
      log(() => ({ t, kind: 'hit', actor: actor.id, target: jump.id, damage: leap, hp: jump.hp, sweep: true, text: say(texts, 'sparkJump', actions, leapVars) }));
      if (jump.hp === 0) fell(jump, t, leapVars);
    }
    // Tarcza żywiołów: fire burns the one who struck it with a share of
    // its owner's average blow, lightning may take its next move.
    if (element3 === 0) {
      const ownRaw = ((target.weapon.min + target.weapon.max) / 2) * target.damageScale;
      applyDot(target, actor, { effect: 'burning', chance: 1, power: retort.burn, ticks: Math.round(retort.burnTicks) }, ownRaw, t, { actor: target.name, target: actor.name });
    } else if (element3 === 2 && rng.chance(retort.shock)) {
      actor.next += actor.interval;
      log(() => ({ t, kind: 'stun', target: actor.id, label: retort.label, hp: actor.hp, text: say(texts, 'stun', actions, { target: actor.name }) }));
    }
    // Wysysanie: the monster heals by a share of what the blow took.
    if (weapon.drain && !move.counter) {
      const healed = heal(actor, amount * weapon.drain);
      if (healed > 0) log(() => ({ t, kind: 'drain', actor: actor.id, target: actor.id, amount: healed, hp: actor.hp, text: say(texts, 'drain', actions, { actor: actor.name, amount: healed }) }));
    }
    // The Rdzeń's poison and Krwawa danina: a share of the damage back as HP.
    if (actor.lifesteal && amount > 0 && actor.hp > 0) {
      const healed = heal(actor, amount * actor.lifesteal);
      if (healed > 0) log(() => ({ t, kind: 'drain', actor: actor.id, target: actor.id, amount: healed, hp: actor.hp, text: say(texts, 'lifesteal', actions, { actor: actor.name, amount: healed }) }));
    }
    if (evolving) {
      // Krwawy szał: the frenzied heal by a share of what they dealt; so do
      // those with Szał low on HP.
      // Dotyk śmierci drains the life it took.
      let steal = actor.stances.reduce((/** @type {number} */ sum, /** @type {Stance} */ stance) => sum + (stance.lifesteal ?? 0), 0) + (move.drain ?? 0);
      if (feat?.kind === 'fury' && feat.lifesteal && actor.hp < feat.lifestealBelow * actor.maxHp) steal += feat.lifesteal;
      const healed = steal && actor.hp > 0 ? heal(actor, amount * steal) : 0;
      if (healed > 0) log(() => ({ t, kind: 'drain', actor: actor.id, target: actor.id, amount: healed, hp: actor.hp, text: say(texts, 'lifesteal', actions, { actor: actor.name, amount: healed }) }));
      if (!move.counter) throwBack(target, actor, amount, absorbed, t);
    }
    // Ognista nawałnica (a monster's `dot.all`): the effect of its blow may
    // land on every other member of the party as well, each with its own
    // chance against its Will, even when the one struck has fallen.
    const dot = move.dot ?? weapon.dot;
    const swept = dot?.all && !move.counter ? foesOf(actor).filter((foe) => foe !== target) : NO_SKILLS;
    if (target.hp === 0 && fell(target, t, vars)) {
      for (const foe of swept) applyDot(actor, foe, dot, raw, t, { ...vars, target: foe.name });
      // Ostatni cios: a kill by the unit's own blow gives it one more move.
      if (feat?.extraMove && ownBlow(move)) actor.extraMove = true;
      return true;
    }

    if (dot) applyDot(actor, target, dot, raw, t, vars);
    for (const foe of swept) applyDot(actor, foe, dot, raw, t, { ...vars, target: foe.name });
    // Święty ogień: a spirit struck with sacrum burns.
    if (feat?.kind === 'zeal' && feat.burn && target.family === 'spirit' && (spread ?? [element]).includes(feat.element)) {
      applyDot(actor, target, { effect: 'burning', chance: 1, power: feat.burn, ticks: Math.round(feat.burnTicks) }, raw, t, vars);
    }
    if (weapon.slow && !move.counter) applySlow(actor, target, weapon.slow, t, vars);
    // Trzęsienie ziemi stuns only the foes in the foremost row (its chance
    // drawn for them alone).
    const front = !move.stunFront || foremost(foesOf(actor)).includes(target);
    if (front && (move.stun || (move.stunChance && rng.chance(move.stunChance)))) {
      // Kruszący cios: a stun of more than one move.
      const moves = Math.round(move.stunMoves ?? 1);
      target.next += target.interval * moves;
      log(() => ({ t, kind: 'stun', target: target.id, label: move.stunLabel, hp: target.hp, ...marks, text: say(texts, moves > 1 ? 'stunMoves' : 'stun', actions, { ...vars, moves }) }));
    }
    // Zamieć chills to the end of the fight (Zimowy oddech: the chilled
    // strike weaker; Wieczna zima: every frost spell chills); Sąd marks a
    // family of foes for a few of their moves.
    const frosty = category === 'magical' && (spread ?? [element]).includes('frost');
    // Kataklizm chills deeper: the chilled strike weaker by its share.
    const chills = move.chill || (feat?.kind === 'winter' && feat.frostChills && frosty);
    if (chills && !target.chilled) {
      target.chilled = { weaken: Math.max(feat?.kind === 'winter' ? feat.weaken : 0, move.chillWeaken ?? 0) };
      const effect = content.effectsById.chilled;
      log(() => ({ t, kind: 'effect', actor: actor.id, target: target.id, effect: effect.name, element: effect.element, hp: target.hp, text: say(texts, 'effectApplied', actions, { ...vars, effect: effect.name }) }));
    } else if (chills && move.chillWeaken > target.chilled.weaken) target.chilled.weaken = move.chillWeaken;
    // Szpon orła: the one it struck misses a share of its blows for a few
    // of its moves.
    if (move.blind) {
      const turns = Math.round(move.blindTurns);
      target.blinded = { chance: move.blind, until: target.moves + turns };
      log(() => ({ t, kind: 'effect', actor: actor.id, target: target.id, effect: say(texts, 'blindEffect', actions, {}), hp: target.hp, text: say(texts, 'blinded', actions, { target: target.name, turns, chance: Math.round(move.blind * 100) }) }));
    }
    if (move.mark && target.family === move.markFamily) {
      const turns = Math.round(move.markTurns);
      target.marked = { bonus: move.mark, until: target.moves + turns };
      log(() => ({
        t,
        kind: 'effect',
        actor: actor.id,
        target: target.id,
        effect: move.skill.name,
        hp: target.hp,
        text: say(texts, 'marked', actions, { target: target.name, skill: move.skill.name, turns, percent: Math.round(move.mark * 100) }),
      }));
    }
    if (target.skills.length > 0) wounded(target, t);
    if (target.potions?.heal) healPotion(target, t);
    if (target.rally) rally(target, t);
    // Cień-sobowtór: the shadow repeats the unit's own blow that landed, at
    // the same target, for a share of its power.
    const double = evolving && ownBlow(move) && actor.hp > 0 && target.hp > 0 ? actor.stances.find((/** @type {Stance} */ stance) => stance.mirror) : null;
    if (double) {
      strike(actor, target, t, { skill: double.skill, power: (move.power ?? 1) * double.power, category, element, undodgeable: move.undodgeable, mirror: true });
    }
    return true;
  };

  // The opponent standing furthest back, the quickest kill among equals,
  // of those in sight (Ukryty w mroku): a hidden one at the back is passed
  // over while one without it stands further forward.
  const furthestBack = (/** @type {Unit} */ actor, /** @type {Unit[]} */ opponents) => pickTarget(actor, hindmost(inSight(opponents)));

  // A plain blow at the one the unit chooses. Cios w cały szyk (666: a
  // monster's attack with `cleave`): each other member of the other side
  // still standing takes the blow too, at that share of its power, each on
  // its own (a dodge, a critical blow and the blow's effect for each), at
  // once as a sweep's blows land. Without it, the same draws as one blow.
  const plainBlow = (/** @type {Unit} */ actor, /** @type {Unit[]} */ opponents, /** @type {number} */ t) => {
    const target = intercepted(actor, /** @type {Unit} */ (pickTarget(actor, opponents)), t);
    strike(actor, target, t);
    const share = actor.weapon.cleave;
    if (!share) return;
    for (const other of opponents) {
      if (other === target || other.hp <= 0 || actor.hp <= 0) continue;
      strike(actor, other, t, { power: share, sweep: true });
    }
  };

  // The one standing right behind a unit (Przebijający strzał), if anyone.
  const behind = (/** @type {Unit} */ target, /** @type {Unit[]} */ opponents) => {
    const depth = DEPTH[target.position] ?? 0;
    const further = opponents.filter((/** @type {Unit} */ unit) => unit.hp > 0 && (DEPTH[unit.position] ?? 0) > depth);
    if (further.length === 0) return null;
    const next = Math.min(...further.map((/** @type {Unit} */ unit) => DEPTH[unit.position] ?? 0));
    return further.find((/** @type {Unit} */ unit) => (DEPTH[unit.position] ?? 0) === next);
  };

  // Who a skill's blow goes to: the back (Cios w plecy, Egzekucja), the foe
  // with the most HP (Strzał z ukrycia), the weakest of those below the
  // mark (Wyrok), else the usual target; each of those in sight (Ukryty w
  // mroku).
  const skillTarget = (/** @type {Unit} */ actor, /** @type {Unit[]} */ opponents, /** @type {Params} */ p) => {
    const seen = inSight(opponents);
    // Cios ostateczny looks first for a foe it kills at once, the lowest on
    // HP of them.
    if (p.killBelow) {
      const doomed = seen.filter((unit) => !unit.champion && unit.hp < p.killBelow * unit.maxHp);
      if (doomed.length > 0) return doomed.reduce((best, unit) => (unit.hp / unit.maxHp < best.hp / best.maxHp ? unit : best));
    }
    // Szpon orła: the foe with the fewest HP.
    if (p.target === 'weakest') return seen.reduce((best, unit) => (unit.hp < best.hp ? unit : best));
    // Pieczęć świętości and Krwawy znak: a foe without their mark first.
    if (p.seal || p.bloodMark) {
      const fresh = seen.filter((unit) => !(p.seal ? unit.sealed : unit.bloodMark));
      if (fresh.length > 0) return pickTarget(actor, fresh);
    }
    if (p.target === 'back') return furthestBack(actor, seen);
    if (p.target === 'strongest') return seen.reduce((/** @type {Unit} */ best, /** @type {Unit} */ unit) => (unit.hp > best.hp ? unit : best));
    if (p.below !== undefined) {
      return seen.filter((/** @type {Unit} */ unit) => unit.hp < p.below * unit.maxHp).reduce((/** @type {Unit | null} */ best, /** @type {Unit} */ unit) => (!best || unit.hp / unit.maxHp < best.hp / best.maxHp ? unit : best), /** @type {Unit | null} */ (null));
    }
    return pickTarget(actor, seen);
  };

  // Opiekun: a heal takes one bad effect off as well (Łaska: every one; a
  // heal that takes them all off, Cudowne uzdrowienie: `all`).
  const cleanse = (/** @type {Unit} */ unit, /** @type {Unit} */ actor, /** @type {number} */ t, all = false) => {
    for (let count = all || actor.feat?.cleanseAll ? unit.dots.length : 1; count > 0; count--) {
      const dot = unit.dots.shift();
      if (!dot) return;
      log(() => ({ t, kind: 'cleanse', actor: actor.id, target: unit.id, cleared: dot.name, hp: unit.hp, text: say(texts, 'cleansed', actions, { target: unit.name, effect: dot.name }) }));
    }
  };

  // A summon's move: the elemental strikes a random foe with the element it
  // is weakest to, the slime poisons one, a foe in sight (Ukryty w mroku).
  const summonActs = (/** @type {Unit} */ actor, /** @type {Unit} */ summon, /** @type {number} */ t) => {
    const foes = foesOf(actor);
    if (!summon || foes.length === 0 || actor.hp <= 0 || !actor.summons.includes(summon)) return;
    const foe = rng.pick(inSight(foes));
    // A wolf, an ent, a bear or a skeleton strikes with its claws, branches
    // or sword: a physical blow, which may miss, the skeleton's with its
    // poison (Wskrzeszenie), the oak's rooting its foe (Przebudzenie dębu).
    if (summon.physical) {
      strike(actor, foe, t, {
        skill: summon.skill,
        power: summon.power,
        category: 'physical',
        summoned: true,
        ...(summon.dot && { dot: summon.dot }),
        ...(summon.root && { root: summon.root }),
        words: { hit: 'summonStrike', crit: 'summonStrike', dodge: 'summonMiss' },
        vars: { summon: summon.name },
      });
      return;
    }
    if (summon.dot) {
      log(() => ({ t, kind: 'skill', actor: actor.id, skill: summon.skill.id, skillName: summon.skill.name, targets: [foe.id], text: say(texts, 'summonSpit', actions, { summon: summon.name }) }));
      applyDot(actor, foe, summon.dot, summon.raw, t, { actor: actor.name, target: foe.name });
      return;
    }
    const element = ELEMENTAL.reduce((best, each) => {
      const bite = (/** @type {string} */ one) => (1 - reduction(foe.resist[one] ?? 0, actor.level, balance)) * (1 + (foe.weak?.[one] ?? 0));
      return bite(each) > bite(best) ? each : best;
    });
    strike(actor, foe, t, {
      skill: summon.skill,
      power: summon.power,
      category: 'magical',
      element,
      summoned: true,
      words: 'summonHit',
      vars: { summon: summon.name, element: content.elementsById[element].name },
    });
  };

  // What a third form's blow leaves on the foe it reached: Lodowy grobowiec
  // locks it in ice for a few of its moves, and until it moves again it
  // takes more; Pieczęć świętości makes it take more from everyone and heal
  // no more, to the end of the fight; Krwawy znak (whose blow makes it
  // bleed) makes critical blows find it more often, to the end of the fight.
  const markAfterBlow = (/** @type {Unit} */ actor, /** @type {Unit} */ target, /** @type {Skill} */ skill, /** @type {number} */ t) => {
    const p = skill.params;
    const vars = { actor: actor.name, skill: skill.name, target: target.name };
    const base = { t, actor: actor.id, skill: skill.id, skillName: skill.name, targets: [target.id] };
    if (p.tomb) {
      const moves = Math.round(p.stunMoves ?? 2);
      target.next += target.interval * moves;
      target.frozen = { bonus: p.bonus, until: target.moves + 1 };
      log(() => ({ t, kind: 'stun', target: target.id, label: p.stunLabel, hp: target.hp, skill: skill.id, skillName: skill.name, text: say(texts, 'iceTomb', actions, { ...vars, moves, bonus: Math.round(p.bonus * 100) }) }));
    } else if (p.seal) {
      target.sealed = { source: actor, bonus: Math.max(target.sealed?.bonus ?? 0, p.damage) };
      log(() => ({ ...base, kind: 'skill', text: say(texts, 'sealed', actions, { ...vars, damage: Math.round(p.damage * 100) }) }));
      log(() => ({ t, kind: 'effect', actor: actor.id, target: target.id, effect: skill.name, hp: target.hp, text: say(texts, 'effectApplied', actions, { target: target.name, effect: skill.name }) }));
    } else if (p.bloodMark) {
      target.bloodMark = { crit: Math.max(target.bloodMark?.crit ?? 0, p.critMark) };
      log(() => ({ ...base, kind: 'skill', text: say(texts, 'bloodMarked', actions, { ...vars, crit: Math.round(p.critMark * 100) }) }));
    }
  };

  // A ready skill used on the actor's move instead of a plain blow; one
  // marked `once` (the prayer) works once a fight.
  const useSkill = (/** @type {Unit} */ actor, /** @type {Unit[]} */ opponents, /** @type {number} */ t) => {
    if (!skilled || actor.skills.length === 0) return false;
    for (const skill of actor.skills) {
      if (!ACTIVE_KINDS.has(skill.kind) || skill.used || actor.moves < skill.ready) continue;
      const p = skill.params;
      if (skill.kind === 'heal') {
        // A party heal (Odnowa) when anyone of the party is wounded enough.
        const party = p.party ? units.filter((unit) => unit.side === actor.side && unit.hp > 0) : [actor];
        if (!party.some((unit) => unit.hp < p.below * unit.maxHp)) continue;
      }
      // Strzał z ukrycia works only on the first move; Wyrok waits for a foe
      // in sight below its mark.
      if (p.opener && actor.moves > 0) continue;
      if (p.below !== undefined && skill.kind === 'strike' && !inSight(opponents).some((/** @type {Unit} */ unit) => unit.hp < p.below * unit.maxHp)) continue;
      // A character has one summon at a time (two with Serce puszczy):
      // another summoning skill (the Druid's ent and bear) waits until the
      // one standing falls or goes, and none calls its own summon twice.
      if (skill.kind === 'summon' && (actor.summons.length >= summonLimit(actor) || actor.summons.some((/** @type {Unit} */ one) => one.skill === skill))) continue;
      // A duel or a lock waits until the foe it marked falls.
      if ((p.duel || p.lock) && opponents.some((/** @type {Unit} */ unit) => unit.hp > 0 && unit.focus?.source === actor)) continue;
      if (!manaFor(actor, skill.mana, t)) continue;
      actor.mana -= skill.mana;
      skill.ready = actor.moves + skill.cooldown;
      skill.used = skill.once === true;
      const vars = { actor: actor.name, skill: skill.name };
      const base = { t, actor: actor.id, skill: skill.id, skillName: skill.name };
      if (skill.kind === 'heal') {
        const care = evolving && actor.feat?.kind === 'caretaker' ? 1 + actor.feat.heal : 1;
        const party = p.party ? units.filter((unit) => unit.side === actor.side && unit.hp > 0) : [actor];
        for (const member of party) {
          const amount = mend(member, (p.heal * member.maxHp + (actor.wisdom ?? 0) / p.wisdomPerHp) * care);
          const own = member === actor;
          log(() => ({
            ...base,
            kind: 'heal',
            target: member.id,
            amount,
            hp: member.hp,
            text: own ? say(texts, 'skillHeal', actions, { ...vars, amount }) : say(texts, 'regen', actions, { skill: skill.name, target: member.name, amount }),
          }));
          // Cudowne uzdrowienie takes every bad effect off by itself.
          if (care > 1 || p.cleanse) cleanse(member, actor, t, Boolean(p.cleanse));
        }
        // Odnowa goes on healing for a few of the healer's next moves, in a
        // fight with evolutions' state (the code review: a skill of an
        // evolution no longer on crashed the fight without it).
        if (evolving && p.hot) {
          const turns = Math.round(p.hotTurns);
          actor.stances.push({ skill, until: actor.moves + 1 + turns, regen: true, heal: p.hot * care });
          log(() => ({ ...base, kind: 'skill', target: actor.id, text: say(texts, turns >= 5 ? 'renewalHotMany' : 'renewalHot', actions, { turns, hot: Math.round(p.hot * care * 100) }) }));
        }
      } else if (skill.kind === 'strike') {
        const target = intercepted(actor, /** @type {Unit} */ (skillTarget(actor, opponents, p)), t);
        const before = taken[target.id];
        strike(actor, target, t, blowOf(skill, { own: true }));
        // Lodowy grobowiec, Pieczęć świętości and Krwawy znak leave their
        // mark on the foe the blow reached, if it still stands.
        if ((p.tomb || p.seal || p.bloodMark) && target.hp > 0 && taken[target.id] > before) markAfterBlow(actor, target, skill, t);
        // Przebijający strzał goes on into the one behind (Strzał w serce:
        // the two behind, one after the other; Mistrzowski strzał: every foe
        // in the rows behind); Ognisty wybuch burns the others.
        if (p.pierceAll) {
          const depth = DEPTH[target.position] ?? 0;
          for (const other of opponents) {
            if (other.hp <= 0 || actor.hp <= 0 || (DEPTH[other.position] ?? 0) <= depth) continue;
            strike(actor, other, t, { skill, power: p.pierce, undodgeable: true, category: p.category, element: p.element, pierced: true });
          }
        } else {
          let from = target;
          for (let pierced = 0; p.pierce && pierced < Math.round(p.pierces ?? 1) && actor.hp > 0; pierced++) {
            const next = behind(from, opponents);
            if (!next) break;
            strike(actor, next, t, { skill, power: p.pierce, undodgeable: true, category: p.category, element: p.element, pierced: true });
            from = next;
          }
        }
        if (p.splash) {
          for (const other of opponents) {
            if (other === target || other.hp <= 0 || actor.hp <= 0) continue;
            strike(actor, other, t, { skill, power: p.splash, category: p.category, element: p.element, sweep: true });
          }
        }
      } else if (skill.kind === 'whirl') {
        // Wir cieni: blows at random foes.
        log(() => ({ ...base, kind: 'skill', targets: opponents.map((/** @type {Unit} */ unit) => unit.id), text: say(texts, 'skillUse', actions, vars) }));
        for (let blow = 0; blow < Math.round(p.blows); blow++) {
          const foes = opponents.filter((/** @type {Unit} */ unit) => unit.hp > 0);
          if (foes.length === 0 || actor.hp <= 0) break;
          strike(actor, rng.pick(foes), t, blowOf(skill, { sweep: true }));
        }
      } else if (skill.kind === 'mark' && (p.duel || p.lock)) {
        // Pojedynek: the foe with the most HP is challenged, and to the end
        // of the fight takes more from the challenger and deals it less;
        // Namierzenie: the usual target takes more from the unit and cannot
        // dodge its blows, until it falls.
        const target = /** @type {Unit} */ (skillTarget(actor, opponents, p));
        target.focus ={ source: actor, skill, damage: p.damage, guard: p.guard ?? 0, sure: Boolean(p.lock) };
        const words = p.duel ? 'duel' : 'locked';
        log(() => ({ ...base, kind: 'skill', targets: [target.id], text: say(texts, words, actions, { ...vars, target: target.name, damage: Math.round(p.damage * 100), guard: Math.round((p.guard ?? 0) * 100) }) }));
        log(() => ({ t, kind: 'effect', actor: actor.id, target: target.id, effect: skill.name, hp: target.hp, text: say(texts, 'effectApplied', actions, { target: target.name, effect: skill.name }) }));
      } else if (skill.kind === 'mark') {
        // Znak śmierci: after a few of the marker's moves its foe takes an
        // echo of what it took meanwhile.
        const target = /** @type {Unit} */ (pickTarget(actor, opponents));
        const turns = Math.round(p.turns);
        target.doom = { source: actor, skill, until: actor.moves + turns, taken: 0, echo: p.echo };
        log(() => ({ ...base, kind: 'skill', targets: [target.id], text: say(texts, 'doomed', actions, { ...vars, target: target.name, turns, echo: Math.round(p.echo * 100) }) }));
        log(() => ({ t, kind: 'effect', actor: actor.id, target: target.id, effect: skill.name, hp: target.hp, text: say(texts, 'effectApplied', actions, { target: target.name, effect: skill.name }) }));
      } else if (skill.kind === 'summon') {
        // Moc puszczy: summons with more HP and stronger blows.
        const grove = evolving && actor.feat?.kind === 'arcana' ? actor.feat : null;
        const hp = Math.max(1, Math.round(actor.maxHp * p.hp * (1 + (grove?.summonHp ?? 0))));
        const name = p.summonName;
        const stronger = 1 + (grove?.summonPower ?? 0);
        // The slime's poison: a share of the summoner's average blow a move.
        const raw = ((actor.weapon.min + actor.weapon.max) / 2) * actor.damageScale;
        const summon = {
          skill,
          name,
          hp,
          until: actor.moves + Math.round(p.turns),
          power: p.power === undefined ? undefined : p.power * stronger,
          raw,
          dot: p.dotEffect ? { effect: p.dotEffect, chance: 1, power: p.dotPower, ticks: Math.round(p.dotTicks) } : null,
          // A slime bursts when it falls; a wolf, an ent, a bear or a
          // skeleton strikes with its body; the white wolf howls (howl), the
          // oak roots the foes it strikes (root).
          burst: Boolean(p.burst),
          physical: Boolean(p.physical),
          ...(p.howl && { howl: p.howl }),
          ...(p.root && { root: p.root }),
        };
        actor.summons.push(summon);
        log(() => ({
          ...base,
          kind: 'summon',
          state: 'up',
          target: actor.id,
          summon: name,
          figure: p.summon,
          summonHp: hp,
          hp: actor.hp,
          text: say(texts, 'summonUp', actions, { ...vars, summon: name, hp }) + (p.howl ? ` ${say(texts, 'summonHowl', actions, { howl: Math.round(p.howl * 100) })}` : ''),
        }));
        if (p.charge) {
          // Przywołanie żubra: the bison charges the foe in front at once and
          // stuns it, then stands as a summon does.
          const target = /** @type {Unit} */ (pickTarget(actor, foremost(opponents)));
          strike(actor, target, t, {
            skill,
            power: p.charge * stronger,
            category: 'physical',
            summoned: true,
            stun: true,
            stunLabel: p.stunLabel,
            words: { hit: 'chargeHit', crit: 'chargeHit', dodge: 'chargeMiss' },
            vars: { summon: name },
          });
        } else summonActs(actor, summon, t);
      } else if (p.curse) {
        // Klątwa rozkładu: no blow, a poison on every foe that wears its
        // armour away, of the curser's average blow.
        log(() => ({ ...base, kind: 'skill', targets: opponents.map((/** @type {Unit} */ unit) => unit.id), text: say(texts, 'skillUse', actions, vars) }));
        const raw = ((actor.weapon.min + actor.weapon.max) / 2) * actor.damageScale;
        const dot = { effect: p.dotEffect, chance: p.dotChance ?? 1, power: p.dotPower, ticks: Math.round(p.dotTicks), decay: p.decay };
        for (const target of opponents) {
          if (target.hp > 0) applyDot(actor, target, dot, raw, t, { actor: actor.name, target: target.name });
        }
      } else {
        // A sweep: every opponent, each hit on its own; a lone one takes the
        // stronger single blow. Huragan stali turns twice (`spins`); a bolt
        // of Gniew Peruna may jump on to another foe (`chainChance`).
        const power = opponents.length === 1 && skill.params.single !== undefined ? skill.params.single : skill.params.power;
        /** @type {Unit[]} */
        const hit = [];
        const spins = Math.max(1, Math.round(p.spins ?? 1));
        for (let spin = 0; spin < spins; spin++) {
          if (spin > 0 && (actor.hp <= 0 || !opponents.some((/** @type {Unit} */ unit) => unit.hp > 0))) break;
          log(() => ({
            ...base,
            kind: 'skill',
            targets: opponents.filter((/** @type {Unit} */ unit) => spin === 0 || unit.hp > 0).map((/** @type {Unit} */ unit) => unit.id),
            text: say(texts, spin === 0 ? 'skillUse' : 'secondSpin', actions, vars),
          }));
          for (const target of opponents) {
            // One that fell of a blow thrown back strikes no more (the code
            // review, 12.11.2026).
            if (actor.hp <= 0) break;
            if (target.hp <= 0) continue;
            if (strike(actor, target, t, blowOf(skill, { power, sweep: true })) && !hit.includes(target)) hit.push(target);
            if (!p.chainChance || !rng.chance(p.chainChance)) continue;
            const others = opponents.filter((/** @type {Unit} */ unit) => unit !== target && unit.hp > 0);
            if (others.length > 0) {
              strike(actor, rng.pick(others), t, {
                skill,
                power: p.chainPower,
                category: p.category,
                element: p.element,
                sweep: true,
                words: { hit: 'chainHit', crit: 'chainHit', dodge: 'chainHit' },
              });
            }
          }
        }
        // A slow of 50% halves a hit enemy's speed until its next move: it
        // waits twice as long for it, 1 / (1 - slow) times. Only those the
        // sweep hit ("Każdy trafiony"): not one that vanished, blocked or
        // dodged it, or whose summon took the blow.
        if (skill.params.slow && actor.hp > 0) {
          const slowed = hit.filter((/** @type {Unit} */ unit) => unit.hp > 0);
          const delay = skill.params.slow / (1 - skill.params.slow);
          for (const unit of slowed) unit.next += delay * unit.interval;
          if (slowed.length > 0) {
            const one = slowed.length === 1;
            log(() => ({ ...base, kind: 'slow', targets: slowed.map((/** @type {Unit} */ unit) => unit.id), text: say(texts, one ? 'slowOne' : 'slow', actions, { target: slowed[0].name }) }));
          }
        }
        // Święte światło heals the whole party a little (Cudowne ocalenie:
        // more).
        if (p.partyHeal && actor.hp > 0) {
          const care = evolving && actor.feat?.kind === 'caretaker' ? 1 + actor.feat.heal : 1;
          for (const member of units) {
            if (member.side !== actor.side || member.hp <= 0) continue;
            const amount = mend(member, p.partyHeal * member.maxHp * care);
            if (amount > 0) log(() => ({ ...base, kind: 'heal', target: member.id, amount, hp: member.hp, quiet: true, text: say(texts, 'regen', actions, { skill: skill.name, target: member.name, amount }) }));
          }
        }
      }
      return true;
    }
    return false;
  };

  // The text that tells what a stance gives, with its numbers.
  // A second form's stance names its own words (`words`), with the
  // stance's numbers as percents.
  const stanceText = (/** @type {Unit} */ unit, /** @type {Skill} */ skill, /** @type {number} */ turns, /** @type {Stance} */ stance) => {
    const p = skill.params;
    const vars = { actor: unit.name, skill: skill.name, turns };
    const percent = (/** @type {number} */ value) => Math.round(value * 100);
    if (p.words) {
      const values = Object.fromEntries(Object.entries(stance).filter(([, value]) => typeof value === 'number').map(([key, value]) => [key, percent(value)]));
      return say(texts, p.words, actions, { ...values, ...vars });
    }
    if (p.provoke) return say(texts, 'stanceProvoke', actions, { ...vars, reflect: percent(p.reflect) });
    if (p.cloud) return say(texts, 'stanceCloud', actions, vars);
    if (p.pet) return say(texts, 'stancePet', actions, vars);
    if (p.regen) return say(texts, 'stanceRegen', actions, { ...vars, heal: percent(p.heal) });
    return say(texts, 'stanceFrenzy', actions, { ...vars, damage: percent(p.damage), lifesteal: percent(p.lifesteal), taken: percent(p.taken) });
  };

  // The start of an evolved unit's move: what ran its time out ends (a
  // stance, a summon), a mark of death strikes its echo, Arkana gives mana
  // back, a ready stance wakes, and the stances and the summon act.
  const evolutionMove = (/** @type {Unit} */ actor, /** @type {number} */ t) => {
    for (const stance of actor.stances) {
      if (actor.moves < stance.until) continue;
      const { skill } = stance;
      log(() => ({ t, kind: 'fade', actor: actor.id, target: actor.id, skill: skill.id, skillName: skill.name, text: say(texts, 'skillEnd', actions, { actor: actor.name, skill: skill.name }) }));
    }
    actor.stances = actor.stances.filter((/** @type {Stance} */ stance) => actor.moves < stance.until);
    for (const summon of actor.summons.filter((/** @type {Unit} */ one) => actor.moves >= one.until)) {
      actor.summons = actor.summons.filter((/** @type {Unit} */ one) => one !== summon);
      const { name } = summon;
      log(() => ({
        t,
        kind: 'summon',
        state: 'gone',
        actor: actor.id,
        target: actor.id,
        summon: name,
        summonSkill: summon.skill.id,
        summonHp: 0,
        hp: actor.hp,
        text: say(texts, 'summonGone', actions, { summon: name }),
      }));
    }
    for (const foe of units) {
      const doom = foe.doom;
      if (!doom || doom.source !== actor || actor.moves < doom.until) continue;
      foe.doom = null;
      const echo = Math.round(doom.taken * doom.echo);
      if (foe.hp <= 0 || echo <= 0) continue;
      damage(foe, echo, actor.id);
      const vars = { skill: doom.skill.name, target: foe.name, damage: echo };
      log(() => ({ t, kind: 'hit', actor: actor.id, target: foe.id, damage: echo, hp: foe.hp, skill: doom.skill.id, skillName: doom.skill.name, sweep: true, text: say(texts, 'echo', actions, vars) }));
      if (foe.hp === 0 && fell(foe, t, vars)) continue;
      // As after a blow (throwBack above).
      if (foe.skills.length > 0) wounded(foe, t);
      if (foe.potions?.heal) healPotion(foe, t);
      if (foe.rally) rally(foe, t);
    }
    if (actor.feat?.kind === 'arcana') actor.mana = Math.min(actor.maxMana ?? 0, actor.mana + Math.round((actor.maxMana ?? 0) * actor.feat.regen));
    // Harmonia żywiołów: the elements of the unit's last move count from now.
    if (actor.harmony) {
      for (const element of actor.harmony.fresh) actor.harmony.used.add(element);
      actor.harmony.fresh.clear();
    }
    // Łaska heals more through a stance too; Wielkie namaszczenie makes a
    // choir's bonus bigger.
    const care = actor.feat?.kind === 'caretaker' ? 1 + actor.feat.heal : 1;
    const anointed = actor.feat?.kind === 'anointing' ? 1 + actor.feat.bonus : 1;
    for (const skill of actor.skills) {
      if (!STANCE_KINDS.has(skill.kind) || actor.moves < skill.ready || actor.stances.some((/** @type {Stance} */ stance) => stance.skill === skill)) continue;
      const p = skill.params;
      // Psalm waits for someone of the party below its mark.
      if (p.regen && p.below !== undefined && !units.some((unit) => unit.side === actor.side && unit.hp > 0 && unit.hp < p.below * unit.maxHp)) continue;
      if (!manaFor(actor, skill.mana, t)) continue;
      actor.mana -= skill.mana;
      skill.ready = actor.moves + skill.cooldown;
      const turns = Math.round(p.turns);
      const stance = {
        skill,
        until: actor.moves + turns,
        damage: p.damage,
        lifesteal: p.lifesteal,
        taken: p.taken,
        provoke: p.provoke,
        reflect: p.reflect,
        cloud: p.cloud,
        pet: p.pet,
        regen: p.regen,
        heal: p.heal === undefined ? undefined : p.heal * care,
        power: p.power,
        category: p.category,
        element: p.element,
        // The second forms' stances: a roar that weakens the other side, a
        // wall of shields, a choir's damage, a vanishing, a shadow double,
        // and the words of a cloud's every move (Stos).
        weaken: p.weaken,
        wall: p.wall,
        chorus: p.chorus === undefined ? undefined : p.chorus * anointed,
        vanish: p.vanish,
        mirror: p.mirror,
        tickWords: p.tickWords,
        // The third forms' stances: sure, sharper shots (Spokojna ręka), a
        // bonus for every fallen foe (Wiwaty), the party's blows charged
        // with lightning (Znak gromu), the party's dodge (Wizja) and the
        // foes' misses (Zaćmienie).
        steady: p.steady,
        critBonus: p.critBonus,
        perKill: p.perKill,
        sign: p.sign,
        chance: p.chance,
        evasion: p.evasion,
        eclipse: p.eclipse,
      };
      actor.stances.push(stance);
      // Zniknięcie: the next own blow is critical and stronger.
      if (p.vanish) actor.nextCrit = { power: p.power ?? 0 };
      log(() => ({ t, kind: 'skill', actor: actor.id, target: actor.id, skill: skill.id, skillName: skill.name, text: stanceText(actor, skill, turns, stance) }));
    }
    for (const stance of actor.stances) {
      const { skill } = stance;
      if (stance.cloud) {
        const foes = foesOf(actor);
        if (foes.length === 0) continue;
        log(() => ({ t, kind: 'skill', actor: actor.id, skill: skill.id, skillName: skill.name, targets: foes.map((unit) => unit.id), text: say(texts, stance.tickWords ?? 'cloudStrike', actions, { skill: skill.name }) }));
        for (const foe of foes) {
          if (foe.hp > 0 && actor.hp > 0) strike(actor, foe, t, { skill, power: stance.power, category: stance.category, element: stance.element, sweep: true, cloud: true });
        }
      } else if (stance.pet) {
        // A falcon pecks; Kula piorunów strikes with lightning: a foe in
        // sight (Ukryty w mroku).
        const foes = foesOf(actor);
        if (foes.length > 0) strike(actor, rng.pick(inSight(foes)), t, { skill, power: stance.power, undodgeable: true, category: stance.category, element: stance.element, pet: true });
      } else if (stance.regen) {
        for (const member of units) {
          if (member.side !== actor.side || member.hp <= 0) continue;
          const amount = mend(member, stance.heal * member.maxHp);
          if (amount > 0) {
            log(() => ({ t, kind: 'heal', actor: actor.id, target: member.id, skill: skill.id, skillName: skill.name, amount, hp: member.hp, quiet: true, text: say(texts, 'regen', actions, { skill: skill.name, target: member.name, amount }) }));
          }
        }
      }
    }
    // Each summon acts, the one in front first.
    for (const summon of [...actor.summons]) summonActs(actor, summon, t);
  };

  // The shields from the start (above), in the playback's first moment.
  for (const unit of units) {
    if (!unit.openingShield || !unit.shield) continue;
    const shield = unit.shield.points;
    log(() => ({ t: 0, kind: 'skill', actor: unit.id, target: unit.id, skillName: say(texts, 'openingShieldName', 0), shield, text: say(texts, 'openingShield', 0, { actor: unit.name, shield }) }));
  }

  // Proroctwo: the Prorok's party starts the fight blessed, by the trait's
  // own blessing grown by its bonus, not shared out among the party.
  for (const unit of evolving ? units : NO_SKILLS) {
    const start = unit.feat?.start;
    if (!start) continue;
    const grown = 1 + (unit.feat.bonus ?? 0);
    for (const member of units) {
      if (member.side !== unit.side) continue;
      member.armor = Math.round(member.armor * (1 + (start.armor ?? 0) * grown));
      member.resist = Object.fromEntries(Object.entries(member.resist).map(([element, value]) => [element, Math.round(value * (1 + (start.resist ?? 0) * grown))]));
      member.damageBonus += (start.damage ?? 0) * grown;
    }
    const percent = (/** @type {number | undefined} */ value) => Math.round((value ?? 0) * grown * 100);
    log(() => ({
      t: 0,
      kind: 'skill',
      actor: unit.id,
      skillName: unit.feat.name,
      targets: [],
      text: say(texts, 'blessedStart', 0, { actor: unit.name, trait: unit.feat.name, armor: percent(start.armor), damage: percent(start.damage) }),
    }));
  }

  // Skills that work from the start: a blessing, a coated blade, a riposte
  // and Harmonia żywiołów.
  for (const unit of skilled ? units : NO_SKILLS) {
    for (const skill of unit.skills) {
      if (!START_KINDS.has(skill.kind) || unit.mana < skill.mana) continue;
      unit.mana -= skill.mana;
      skill.used = true;
      const p = skill.params;
      const vars = { actor: unit.name, skill: skill.name };
      // The account says what the skill gives, with its numbers.
      let text;
      if (skill.kind === 'buff') {
        // The whole side; each one more shares the bonus out (crowd).
        // Namaszczenie makes the bonuses bigger and shares them less.
        const anointing = evolving && unit.feat?.kind === 'anointing' ? unit.feat : null;
        const party = units.filter((other) => other.side === unit.side);
        const share = anointing ? sharedBonus(party.length, p.crowd * (1 - anointing.crowd)) * (1 + anointing.bonus) : sharedBonus(party.length, p.crowd);
        for (const member of party) {
          member.armor = Math.round(member.armor * (1 + p.armor * share));
          member.resist = Object.fromEntries(Object.entries(member.resist).map(([element, value]) => [element, Math.round(value * (1 + p.resist * share))]));
          member.damageBonus += p.damage * share;
          // Wielkie błogosławieństwo: quicker moves too.
          if (p.speed) member.interval /= 1 + p.speed * share;
        }
        const percent = (/** @type {number} */ value) => Math.round(value * share * 100);
        text = say(texts, 'skillBuff', 0, { ...vars, armor: percent(p.armor), resist: percent(p.resist), damage: percent(p.damage) });
        if (p.speed) text += ` ${say(texts, 'skillBuffSpeed', 0, { speed: percent(p.speed) })}`;
        if (party.length > 1) text += ` ${say(texts, 'skillBuffShared', 0, { count: party.length })}`;
      } else if (skill.kind === 'riposte') {
        // Riposta: more dodges, every one answered with a blow that makes the
        // foe bleed.
        const ticks = Math.round(p.dotTicks);
        unit.riposte = { skill, dodge: p.dodge ?? 0, power: p.power, dot: { effect: p.dotEffect, chance: p.dotChance, power: p.dotPower, ticks } };
        text = say(texts, 'skillRiposte', 0, { ...vars, dodge: Math.round((p.dodge ?? 0) * 100), power: Math.round(p.power * 100), ticks });
      } else if (skill.kind === 'harmony') {
        // Harmonia żywiołów: the elements the unit's spells used (evolved,
        // evolutionMove).
        unit.harmony = { bonus: p.bonus, used: new Set(), fresh: new Set() };
        text = say(texts, 'skillHarmony', 0, { ...vars, bonus: Math.round(p.bonus * 100) });
      } else {
        const ticks = Math.round(p.dotTicks);
        unit.weapon = { ...unit.weapon, dot: { effect: p.dotEffect, chance: p.dotChance, power: p.dotPower, ticks, ...(p.weaken && { weaken: p.weaken }) } };
        const effect = content.effectsById[p.dotEffect]?.name ?? p.dotEffect;
        text = say(texts, 'skillCoat', 0, { ...vars, effect, chance: Math.round(p.dotChance * 100), power: Math.round(p.dotPower * 100), ticks });
        if (p.weaken) text += ` ${say(texts, 'skillCoatWeaken', 0, { weaken: Math.round(p.weaken * 100) })}`;
      }
      log(() => ({ t: 0, kind: 'skill', actor: unit.id, target: unit.id, skill: skill.id, skillName: skill.name, text }));
    }
  }

  for (;;) {
    const alive = units.filter((unit) => unit.hp > 0);
    const enemiesLeft = alive.some((unit) => unit.side === 'enemy');
    const alliesLeft = alive.some((unit) => unit.side === 'ally');
    if (!enemiesLeft || !alliesLeft || actions >= actionLimit) {
      return {
        // null: the fight dragged on for too long and the allies withdrew.
        won: !enemiesLeft ? true : !alliesLeft ? false : null,
        actions,
        events,
        units: units.map((unit) => ({ id: unit.id, hp: unit.hp })),
        dealt,
        taken,
        drunk,
      };
    }

    let actor = /** @type {Unit} */ (earliest(alive));
    if (actor === lastActor && streak >= tuning.maxConsecutiveMoves) {
      actor = earliest(alive.filter((unit) => unit !== actor)) ?? actor;
    }
    streak = actor === lastActor ? streak + 1 : 1;
    lastActor = actor;
    actions += 1;
    const t = Math.round(actor.next);
    actor.next += actor.interval;

    tickEffects(actor, t);
    if (actor.hp <= 0) continue;
    if (actor.guard && actor.moves >= actor.guard.until) {
      const { skill } = actor.guard;
      actor.armor = Math.round(actor.armor / actor.guard.factor);
      actor.guard = null;
      log(() => ({ t, kind: 'fade', actor: actor.id, target: actor.id, skill: skill.id, skillName: skill.name, text: say(texts, 'skillEnd', actions, { actor: actor.name, skill: skill.name }) }));
    }
    // Wieczny lód: a chilled unit facing a Lodowy Król may freeze and lose
    // its move. Draws a number only for a chilled unit facing one.
    if (evolving && isChilled(actor)) {
      const monarch = units.find((unit) => unit.side !== actor.side && unit.hp > 0 && unit.feat?.freeze);
      if (monarch && rng.chance(monarch.feat.freeze)) {
        log(() => ({ t, kind: 'stun', target: actor.id, label: monarch.feat.freezeLabel, hp: actor.hp, text: say(texts, 'frozenMove', actions, { target: actor.name }) }));
        actor.moves += 1;
        continue;
      }
    }
    if (evolving) {
      evolutionMove(actor, t);
      if (actor.hp <= 0 || !units.some((unit) => unit.side !== actor.side && unit.hp > 0)) {
        actor.moves += 1;
        continue;
      }
    }

    const opponents = alive.filter((unit) => unit.side !== actor.side && unit.hp > 0);
    if (!skilled) plainBlow(actor, opponents, t);
    else {
      if (!useSkill(actor, opponents, t)) plainBlow(actor, opponents, t);
      actor.moves += 1;
      // Ostatni cios: a kill on this move gives the unit one more at once,
      // while foes stand (no more in a row than any unit may make).
      if (evolving && actor.extraMove) {
        actor.extraMove = false;
        if (actor.hp > 0 && units.some((unit) => unit.side !== actor.side && unit.hp > 0)) {
          actor.next = t;
          log(() => ({ t, kind: 'skill', actor: actor.id, skillName: actor.feat.name, targets: [], text: say(texts, 'extraMove', actions, { actor: actor.name, trait: actor.feat.name }) }));
        }
      }
    }
  }
}

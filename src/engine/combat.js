// Automatic combat, up to three against three.
// Initiative is a timeline: the time to a unit's next move is inversely
// proportional to its speed, and the unit whose time comes first acts. One
// unit may act at most `maxConsecutiveMoves` times in a row. The party
// finishes off the opponent it can defeat fastest; monsters pick their target
// at random, front positions more often.
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

import { cappedChance, reduction } from './formulas.js';
import { ACTIVE_KINDS, START_KINDS, WOUND_KINDS } from './skills.js';
import { say } from './text.js';

// How far back a position stands, for skills that aim at the back.
const DEPTH = { front: 0, middle: 1, back: 2 };
// A plain blow, its marks and a unit without skills: shared, as the threat
// estimate runs many fights.
const PLAIN = Object.freeze({});
const NO_SKILLS = Object.freeze([]);
const SKILL_WORDS = { hit: 'skillHit', crit: 'skillCrit', dodge: 'skillDodge' };

// The texts of a blow: a skill's own blow names the skill, a sweep's blows
// name it as the attack, a counter has its own words.
function wordsFor(kind, move) {
  if (move.counter) return kind === 'crit' ? 'counterCrit' : 'counter';
  return move.own ? SKILL_WORDS[kind] : kind;
}

// A mana shield takes what it can of a blow or a tick, out of its points.
// Returns the damage it took.
function absorb(target, amount) {
  if (!target.shield || target.shield.points <= 0 || amount <= 0) return 0;
  const absorbed = Math.min(amount, target.shield.points);
  target.shield.points -= absorbed;
  return absorbed;
}

// What a mana shield can still take; a spent one says 0.
const shieldLeft = (unit) => (unit.shield ? unit.shield.points : undefined);

// A bonus shared out over `members` of a party: each one more takes `crowd`
// of a share (a blessing: 2/3 of it each for two, half for three).
export const sharedBonus = (members, crowd = 0) => 1 / (1 + crowd * (members - 1));

function heal(unit, amount) {
  const healed = Math.max(0, Math.min(unit.maxHp - unit.hp, Math.round(amount)));
  unit.hp += healed;
  return healed;
}

// The numbers of a skill as a blow.
function blowOf(skill, extra) {
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
    dot: p.dotEffect && skill.kind === 'strike' ? { effect: p.dotEffect, chance: p.dotChance, power: p.dotPower, ticks: Math.round(p.dotTicks) } : undefined,
    ...extra,
  };
}

function marksOf(move) {
  if (move === PLAIN) return PLAIN;
  const marks = move.skill ? { skill: move.skill.id, skillName: move.skill.name } : {};
  if (move.counter) marks.counter = true;
  if (move.sweep) marks.sweep = true;
  return marks;
}

export function simulateFight({ allies, enemies, rng, content, record = false }) {
  const balance = content.balance;
  const tuning = balance.combat;
  const texts = content.texts;
  // The skills' code and state are made only for a fight where someone has
  // a skill: the threat estimate runs many fights without any.
  const skilled = allies.some((unit) => unit.skills?.length) || enemies.some((unit) => unit.skills?.length);
  const units = [...allies, ...enemies].map((unit, order) => ({
    ...unit,
    order,
    dots: [],
    interval: tuning.moveTime / unit.speed,
    next: 0,
    skills: unit.skills?.length ? unit.skills.map((skill) => ({ ...skill, ready: 0, used: false })) : NO_SKILLS,
  }));
  // For skills: the fight's mana, the unit's own moves so far and the effects
  // of the skills that woke; each skill knows the move it is ready again from.
  if (skilled) {
    for (const unit of units) Object.assign(unit, { mana: unit.maxMana ?? 0, moves: 0, damageBonus: 0, guard: null, shield: null, evade: null });
  }
  for (const unit of units) unit.next = unit.interval * (0.5 + 0.5 * rng.next());

  const events = [];
  const dealt = Object.fromEntries(units.map((unit) => [unit.id, 0]));
  const taken = Object.fromEntries(units.map((unit) => [unit.id, 0]));
  let actions = 0;
  let lastActor = null;
  let streak = 0;

  // Events and their texts are built only for a fight that is recorded: the
  // threat estimate runs many fights that nobody reads.
  const log = (event) => {
    if (record) events.push(event());
  };
  const earliest = (list) =>
    list.reduce((best, unit) => {
      if (!best) return unit;
      if (unit.next !== best.next) return unit.next < best.next ? unit : best;
      if (unit.speed !== best.speed) return unit.speed > best.speed ? unit : best;
      return unit.order < best.order ? unit : best;
    }, null);

  const damage = (target, amount, source) => {
    target.hp = Math.max(0, target.hp - amount);
    if (source) dealt[source] += amount;
    taken[target.id] += amount;
  };

  // A wound skill wakes the moment HP falls below its mark, once a fight.
  const wounded = (unit, t) => {
    if (unit.hp <= 0) return;
    for (const skill of unit.skills) {
      if (!WOUND_KINDS.has(skill.kind) || skill.used || unit.hp >= skill.params.below * unit.maxHp || unit.mana < skill.mana) continue;
      skill.used = true;
      unit.mana -= skill.mana;
      const vars = { actor: unit.name, skill: skill.name };
      const base = { t, actor: unit.id, target: unit.id, skill: skill.id, skillName: skill.name };
      if (skill.kind === 'guard') {
        // A little HP back, and armour for the unit's next few moves.
        const amount = heal(unit, skill.params.heal * unit.maxHp);
        const turns = Math.round(skill.params.turns);
        const armor = Math.round(unit.armor * skill.params.armor);
        unit.armor += armor;
        unit.guard = { armor, until: unit.moves + turns, skill };
        const percent = Math.round(skill.params.armor * 100);
        log(() => ({
          ...base,
          kind: 'heal',
          amount,
          armor: percent,
          turns,
          hp: unit.hp,
          text: `${say(texts, 'skillHeal', actions, { ...vars, amount })} ${say(texts, 'guardArmor', actions, { armor: percent, turns })}`,
        }));
      } else {
        if (skill.kind === 'shield') {
          // A share of the unit's mana at once makes the shield's points.
          const taken = Math.min(unit.mana, Math.round((unit.maxMana ?? 0) * skill.params.pool));
          unit.mana -= taken;
          unit.shield = { points: Math.round(taken * skill.params.ratio) };
        }
        if (skill.kind === 'evade') unit.evade = { hits: skill.params.hits, dodge: skill.params.dodge, counter: skill.params.counter };
        log(() => ({ ...base, kind: 'skill', hp: unit.hp, shield: shieldLeft(unit), text: say(texts, 'skillUse', actions, vars) }));
      }
    }
  };

  const tickEffects = (unit, t) => {
    for (const dot of unit.dots) {
      if (unit.hp <= 0) break;
      const resisted = reduction(unit.resist[dot.element] ?? 0, dot.sourceLevel, balance);
      const raw = Math.max(1, Math.round(dot.perTick * (1 - resisted)));
      const absorbed = unit.shield ? absorb(unit, raw) : 0;
      const amount = raw - absorbed;
      damage(unit, amount, dot.source);
      dot.ticks -= 1;
      const vars = { target: unit.name, effect: dot.name, damage: amount };
      log(() => ({ t, kind: 'tick', target: unit.id, effect: dot.name, element: dot.element, damage: amount, absorbed: absorbed || undefined, shield: shieldLeft(unit), left: dot.ticks, hp: unit.hp, text: say(texts, 'effectTick', actions, vars) }));
      if (unit.hp === 0) log(() => ({ t, kind: 'kill', target: unit.id, hp: 0, text: say(texts, 'kill', actions, vars) }));
      else if (unit.skills.length > 0) wounded(unit, t);
    }
    unit.dots = unit.dots.filter((dot) => dot.ticks > 0);
  };

  // The opponent that needs the fewest expected hits, against its defence.
  const quickestKill = (actor, opponents) => {
    const weapon = actor.weapon;
    const average = ((weapon.min + weapon.max) / 2) * actor.damageScale;
    let best = null;
    let fewest = Infinity;
    for (const unit of opponents) {
      const defense = weapon.category === 'physical' ? unit.armor : (unit.resist[weapon.element] ?? 0);
      const hits = unit.hp / Math.max(1, average * (1 - reduction(defense, actor.level, balance)));
      if (hits < fewest) {
        best = unit;
        fewest = hits;
      }
    }
    return best;
  };

  const pickTarget = (actor, opponents) =>
    actor.side === 'ally' ? quickestKill(actor, opponents) : rng.weighted(opponents, (unit) => tuning.targetWeights[unit.position]);

  // An effect over time from a blow: the target's Will may keep it off.
  const applyDot = (actor, target, dot, raw, t, vars) => {
    const resisted = cappedChance(target.willRating, actor.level, tuning.willCap, balance);
    if (!rng.chance(dot.chance * (1 - resisted))) return;
    const effect = content.effectsById[dot.effect];
    const perTick = Math.max(1, Math.round(raw * dot.power));
    const active = target.dots.find((each) => each.effect === effect.id);
    if (active) {
      active.ticks = Math.max(active.ticks, dot.ticks);
      active.perTick = Math.max(active.perTick, perTick);
    } else {
      target.dots.push({
        effect: effect.id,
        name: effect.name,
        element: effect.element,
        perTick,
        ticks: dot.ticks,
        sourceLevel: actor.level,
        source: actor.id,
      });
    }
    log(() => ({ t, kind: 'effect', actor: actor.id, target: target.id, effect: effect.name, element: effect.element, hp: target.hp, text: say(texts, 'effectApplied', actions, { ...vars, effect: effect.name }) }));
  };

  // One blow, plain or shaped by a skill (`move`): its power, the share of
  // armour it ignores, whether it can be dodged or always lands critically,
  // its kind of damage, an effect it carries and whether it pins the target.
  const strike = (actor, target, t, move = PLAIN) => {
    const weapon = actor.weapon;
    const category = move.category ?? weapon.category;
    const element = move.element ?? weapon.element;
    const attack = move.skill && !move.own ? move.skill.name : weapon.attackName;
    const vars = { actor: actor.name, target: target.name, attack, skill: move.skill?.name };
    const marks = marksOf(move);
    if (category === 'physical' && !move.undodgeable) {
      const evading = target.evade && target.evade.hits > 0 ? target.evade : null;
      if (evading) evading.hits -= 1;
      const base = cappedChance(target.dodgeRating, actor.level, tuning.dodgeCap, balance);
      const dodge = evading ? Math.min(0.95, base + evading.dodge) : base;
      if (rng.chance(dodge)) {
        log(() => ({ t, kind: 'dodge', actor: actor.id, target: target.id, hp: target.hp, ...marks, text: say(texts, wordsFor('dodge', move), actions, vars) }));
        if (evading && actor.hp > 0) strike(target, actor, t, { counter: true, power: evading.counter, undodgeable: true });
        return;
      }
    }
    const raw = rng.float(weapon.min, weapon.max) * actor.damageScale * (move.power ?? 1) * (actor.damageBonus ? 1 + actor.damageBonus : 1);
    const critical = move.alwaysCrit || rng.chance(Math.min(1, cappedChance(actor.critRating, target.level, tuning.critCap, balance) + (move.critBonus ?? 0)));
    const defense = category === 'physical' ? target.armor * (1 - (move.armorIgnore ?? 0)) : (target.resist[element] ?? 0);
    let amount = Math.max(1, Math.round(raw * (critical ? tuning.critMultiplier : 1) * (1 - reduction(defense, actor.level, balance))));
    const absorbed = target.shield ? absorb(target, amount) : 0;
    amount -= absorbed;
    damage(target, amount, actor.id);
    const kind = critical ? 'crit' : 'hit';
    log(() => ({
      t,
      kind,
      actor: actor.id,
      target: target.id,
      damage: amount,
      absorbed: absorbed || undefined,
      shield: shieldLeft(target),
      hp: target.hp,
      ...marks,
      text: say(texts, wordsFor(kind, move), actions, { ...vars, damage: amount }) + (absorbed ? ` ${say(texts, 'absorbed', actions, { absorbed })}` : ''),
    }));
    if (target.hp === 0) {
      log(() => ({ t, kind: 'kill', target: target.id, hp: 0, text: say(texts, 'kill', actions, vars) }));
      return;
    }

    const dot = move.dot ?? weapon.dot;
    if (dot) applyDot(actor, target, dot, raw, t, vars);
    if (move.stun || (move.stunChance && rng.chance(move.stunChance))) {
      target.next += target.interval;
      log(() => ({ t, kind: 'stun', target: target.id, label: move.stunLabel, hp: target.hp, ...marks, text: say(texts, 'stun', actions, vars) }));
    }
    if (target.skills.length > 0) wounded(target, t);
  };

  // The opponent standing furthest back, the quickest kill among equals.
  const furthestBack = (actor, opponents) => {
    const depth = Math.max(...opponents.map((unit) => DEPTH[unit.position] ?? 0));
    return pickTarget(actor, opponents.filter((unit) => (DEPTH[unit.position] ?? 0) === depth));
  };

  // A ready skill used on the actor's move instead of a plain blow; one
  // marked `once` (the prayer) works once a fight.
  const useSkill = (actor, opponents, t) => {
    if (!skilled || actor.skills.length === 0) return false;
    for (const skill of actor.skills) {
      if (!ACTIVE_KINDS.has(skill.kind) || skill.used || actor.moves < skill.ready || actor.mana < skill.mana) continue;
      if (skill.kind === 'heal' && actor.hp >= skill.params.below * actor.maxHp) continue;
      actor.mana -= skill.mana;
      skill.ready = actor.moves + skill.cooldown;
      skill.used = skill.once === true;
      const vars = { actor: actor.name, skill: skill.name };
      const base = { t, actor: actor.id, skill: skill.id, skillName: skill.name };
      if (skill.kind === 'heal') {
        const amount = heal(actor, skill.params.heal * actor.maxHp + (actor.wisdom ?? 0) / skill.params.wisdomPerHp);
        log(() => ({ ...base, kind: 'heal', target: actor.id, amount, hp: actor.hp, text: say(texts, 'skillHeal', actions, { ...vars, amount }) }));
      } else if (skill.kind === 'strike') {
        const target = skill.params.target === 'back' ? furthestBack(actor, opponents) : pickTarget(actor, opponents);
        strike(actor, target, t, blowOf(skill, { own: true }));
      } else {
        // A sweep: every opponent, each hit on its own; a lone one takes the
        // stronger single blow.
        log(() => ({ ...base, kind: 'skill', targets: opponents.map((unit) => unit.id), text: say(texts, 'skillUse', actions, vars) }));
        const power = opponents.length === 1 && skill.params.single !== undefined ? skill.params.single : skill.params.power;
        for (const target of opponents) {
          if (target.hp <= 0) continue;
          strike(actor, target, t, blowOf(skill, { power, sweep: true }));
        }
        if (skill.params.delay) {
          const slowed = opponents.filter((unit) => unit.hp > 0);
          for (const unit of slowed) unit.next += skill.params.delay * unit.interval;
          if (slowed.length > 0) {
            const one = slowed.length === 1;
            log(() => ({ ...base, kind: 'slow', targets: slowed.map((unit) => unit.id), text: say(texts, one ? 'slowOne' : 'slow', actions, { target: slowed[0].name }) }));
          }
        }
      }
      return true;
    }
    return false;
  };

  // Skills that work from the start: a blessing and a coated blade.
  for (const unit of skilled ? units : NO_SKILLS) {
    for (const skill of unit.skills) {
      if (!START_KINDS.has(skill.kind) || unit.mana < skill.mana) continue;
      unit.mana -= skill.mana;
      skill.used = true;
      const p = skill.params;
      if (skill.kind === 'buff') {
        // The whole side; each one more shares the bonus out (crowd).
        const party = units.filter((other) => other.side === unit.side);
        const share = sharedBonus(party.length, p.crowd);
        for (const member of party) {
          member.armor = Math.round(member.armor * (1 + p.armor * share));
          member.resist = Object.fromEntries(Object.entries(member.resist).map(([element, value]) => [element, Math.round(value * (1 + p.resist * share))]));
          member.damageBonus += p.damage * share;
        }
      } else {
        unit.weapon = { ...unit.weapon, dot: { effect: p.dotEffect, chance: p.dotChance, power: p.dotPower, ticks: Math.round(p.dotTicks) } };
      }
      log(() => ({ t: 0, kind: 'skill', actor: unit.id, target: unit.id, skill: skill.id, skillName: skill.name, text: say(texts, 'skillUse', actions, { actor: unit.name, skill: skill.name }) }));
    }
  }

  for (;;) {
    const alive = units.filter((unit) => unit.hp > 0);
    const enemiesLeft = alive.some((unit) => unit.side === 'enemy');
    const alliesLeft = alive.some((unit) => unit.side === 'ally');
    if (!enemiesLeft || !alliesLeft || actions >= tuning.maxActions) {
      return {
        // null: the fight dragged on for too long and the allies withdrew.
        won: !enemiesLeft ? true : !alliesLeft ? false : null,
        actions,
        events,
        units: units.map((unit) => ({ id: unit.id, hp: unit.hp })),
        dealt,
        taken,
      };
    }

    let actor = earliest(alive);
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
      actor.armor -= actor.guard.armor;
      actor.guard = null;
      log(() => ({ t, kind: 'fade', actor: actor.id, target: actor.id, skill: skill.id, skillName: skill.name, text: say(texts, 'skillEnd', actions, { actor: actor.name, skill: skill.name }) }));
    }

    const opponents = alive.filter((unit) => unit.side !== actor.side && unit.hp > 0);
    if (!skilled) strike(actor, pickTarget(actor, opponents), t);
    else {
      if (!useSkill(actor, opponents, t)) strike(actor, pickTarget(actor, opponents), t);
      actor.moves += 1;
    }
  }
}

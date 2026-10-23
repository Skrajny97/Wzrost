// Automatic combat, up to three against three.
// Initiative is a timeline: the time to a unit's next move is inversely
// proportional to its speed, and the unit whose time comes first acts. One
// unit may act at most `maxConsecutiveMoves` times in a row.

import { cappedChance, reduction } from './formulas.js';
import { say } from './text.js';

export function simulateFight({ allies, enemies, rng, content, record = false }) {
  const balance = content.balance;
  const tuning = balance.combat;
  const texts = content.texts;
  const units = [...allies, ...enemies].map((unit, order) => ({
    ...unit,
    order,
    dots: [],
    interval: tuning.moveTime / unit.speed,
    next: 0,
  }));
  for (const unit of units) unit.next = unit.interval * (0.5 + 0.5 * rng.next());

  const events = [];
  const dealt = Object.fromEntries(units.map((unit) => [unit.id, 0]));
  const taken = Object.fromEntries(units.map((unit) => [unit.id, 0]));
  let actions = 0;
  let lastActor = null;
  let streak = 0;

  const log = (event) => {
    if (record) events.push(event);
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

  const tickEffects = (unit, t) => {
    for (const dot of unit.dots) {
      if (unit.hp <= 0) break;
      const resisted = reduction(unit.resist[dot.element] ?? 0, dot.sourceLevel, balance);
      const amount = Math.max(1, Math.round(dot.perTick * (1 - resisted)));
      damage(unit, amount, dot.source);
      dot.ticks -= 1;
      const vars = { target: unit.name, effect: dot.name, damage: amount };
      log({ t, kind: 'tick', target: unit.id, effect: dot.name, element: dot.element, damage: amount, hp: unit.hp, text: say(texts, 'effectTick', actions, vars) });
      if (unit.hp === 0) log({ t, kind: 'kill', target: unit.id, hp: 0, text: say(texts, 'kill', actions, vars) });
    }
    unit.dots = unit.dots.filter((dot) => dot.ticks > 0);
  };

  const strike = (actor, target, t) => {
    const weapon = actor.weapon;
    const vars = { actor: actor.name, target: target.name, attack: weapon.attackName };
    if (weapon.category === 'physical') {
      const dodge = cappedChance(target.dodgeRating, actor.level, tuning.dodgeCap, balance);
      if (rng.chance(dodge)) {
        log({ t, kind: 'dodge', actor: actor.id, target: target.id, hp: target.hp, text: say(texts, 'dodge', actions, vars) });
        return;
      }
    }
    const raw = rng.float(weapon.min, weapon.max) * (1 + actor.scalingValue * tuning.scalingPerPoint);
    const critical = rng.chance(cappedChance(actor.critRating, target.level, tuning.critCap, balance));
    const defense = weapon.category === 'physical' ? target.armor : (target.resist[weapon.element] ?? 0);
    const amount = Math.max(
      1,
      Math.round(raw * (critical ? tuning.critMultiplier : 1) * (1 - reduction(defense, actor.level, balance))),
    );
    damage(target, amount, actor.id);
    const kind = critical ? 'crit' : 'hit';
    log({ t, kind, actor: actor.id, target: target.id, damage: amount, hp: target.hp, text: say(texts, kind, actions, { ...vars, damage: amount }) });
    if (target.hp === 0) {
      log({ t, kind: 'kill', target: target.id, hp: 0, text: say(texts, 'kill', actions, vars) });
      return;
    }

    if (weapon.dot) {
      const resisted = cappedChance(target.willRating, actor.level, tuning.willCap, balance);
      if (rng.chance(weapon.dot.chance * (1 - resisted))) {
        const effect = content.effectsById[weapon.dot.effect];
        const perTick = Math.max(1, Math.round(raw * weapon.dot.power));
        const active = target.dots.find((dot) => dot.effect === effect.id);
        if (active) {
          active.ticks = Math.max(active.ticks, weapon.dot.ticks);
          active.perTick = Math.max(active.perTick, perTick);
        } else {
          target.dots.push({
            effect: effect.id,
            name: effect.name,
            element: effect.element,
            perTick,
            ticks: weapon.dot.ticks,
            sourceLevel: actor.level,
            source: actor.id,
          });
        }
        log({ t, kind: 'effect', actor: actor.id, target: target.id, effect: effect.name, element: effect.element, hp: target.hp, text: say(texts, 'effectApplied', actions, { ...vars, effect: effect.name }) });
      }
    }
  };

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

    const opponents = alive.filter((unit) => unit.side !== actor.side && unit.hp > 0);
    const target = rng.weighted(opponents, (unit) => tuning.targetWeights[unit.position]);
    strike(actor, target, t);
  }
}

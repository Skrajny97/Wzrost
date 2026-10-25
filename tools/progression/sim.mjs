// One character carried through time, level 1 to 50, with the game's real
// engine (imported read-only from the repository). The server's rules for a
// finished exploration are mirrored from src/server/hunts.js, camp.js and
// characters.js; where this file departs from them, a comment says so.
//
// Player policy (run.mjs describes it in results.json too):
// - area: the inner region that fits the character's level; after 2 faints in
//   the last 3 hunts there, 2 hunts one inner region lower, then a fresh try;
// - length: the longest exploration the character's level allows;
// - rest until HP >= 80% of max HP, then go again (no idle time);
// - free points: "Rozdaj według klasy" (autoDistribute) from level 2 on;
// - loot: finds go into empty slots (server's autoEquip), then a find replaces
//   the worn item when it raises offence x defence from combatValues; all the
//   rest is sold to the scrapper at once;
// - camp: at every hunt end, hunt start and build completion, collect the
//   stores and, if nothing is being built, start the next level that costs the
//   least gold among those affordable;
// - Time Points are counted, never spent.

import * as engine from '../../src/engine/index.js';
import { loadData } from '../validate-data.mjs';

// The data files as they are in data/, before buildContent.
export const loadRaw = () => loadData();

export const clone = (value) => JSON.parse(JSON.stringify(value));
export const buildContent = (raw) => engine.buildContent(raw);

const MINUTE = 60000;
const HOUR = 3600000;
export const SLOTS = ['weapon', 'chest', 'offhand', 'head', 'feet', 'hands', 'amulet', 'ring', 'talisman'];
export const RESOURCES = ['gold', 'wood', 'stone', 'iron-ore'];

export const DEFAULT_POLICY = {
  targetLevel: 50,
  restTo: 0.8,
  stepDownWindow: 3,
  stepDownFaints: 2,
  stepDownHunts: 2,
  anvil: false,
  maxHunts: 3000,
};

// Offence x defence from the numbers the item card's preview shows. The HP
// share a fight costs is about enemy HP x enemy damage / (this product), so a
// higher product means less fainting and shorter rests.
export function buildScore(character, equipped, content) {
  const v = engine.combatValues(character, equipped, content);
  const offence = v.damage * v.speed * (1 + v.crit * (content.balance.combat.critMultiplier - 1));
  const defence = v.maxHp / ((1 - v.reduction) * (1 - v.dodge));
  return offence * defence;
}

// Item level a common item would need for the same stat budget.
export function commonEquivalentLevel(item, content) {
  const { budgetBase, budgetPerLevel } = content.balance.items;
  const b = content.raritiesById[item.rarity].budget;
  return ((budgetBase + budgetPerLevel * item.level) * b - budgetBase) / budgetPerLevel;
}

function fittingAreaIndex(level, content) {
  const index = content.areas.findIndex((area) => level <= area.maxLevel);
  return index === -1 ? content.areas.length - 1 : index;
}

// ---------------------------------------------------------------- camp

class Camp {
  constructor(content, wallet, log) {
    this.content = content;
    this.wallet = wallet;
    this.stored = {};
    this.log = log; // { builds: [], idle: {gold:0,...}, idleChecks: {...}, spent: {...}, collected: {...} }
    this.idleSince = null;
    this.idleReason = null;
    this.allMaxed = false;
  }

  levels(t) {
    return engine.campLevels(this.stored, t, this.content);
  }

  running(t) {
    return engine.construction(this.stored, t);
  }

  collectAll(t) {
    for (const building of this.content.buildings) {
      if (building.effect.kind !== 'production') continue;
      const stored = this.stored[building.id];
      if (!stored || stored.endsAt > t) continue;
      const got = engine.collect(building, stored, t);
      if (got) {
        this.wallet[got.resource] += got.amount;
        this.log.collected[got.resource] = (this.log.collected[got.resource] ?? 0) + got.amount;
        stored.collectedAt = got.collectedAt;
      }
    }
  }

  // The player looks at the camp at time t.
  check(t, character) {
    this.collectAll(t);
    if (this.running(t)) return;
    const options = this.content.buildings
      .map((building) => ({ building, target: engine.buildingLevel(this.stored[building.id], t) + 1 }))
      .filter(({ building, target }) => target <= building.maxLevel)
      .map((option) => ({ ...option, cost: engine.upgradeCost(option.building, option.target) }));
    if (options.length === 0) {
      this.closeIdle(t);
      this.allMaxed = true;
      return;
    }
    const total = (cost) => Object.entries(cost).reduce((sum, [id, amount]) => sum + (id === 'gold' ? 0 : amount), 0);
    const affordable = options
      .filter(({ cost }) => engine.missingFor(cost, this.wallet).length === 0)
      .sort((a, b) => (a.cost.gold ?? 0) - (b.cost.gold ?? 0) || total(a.cost) - total(b.cost));
    if (affordable.length > 0) {
      this.closeIdle(t);
      this.start(affordable[0], t, character);
      return;
    }
    // Nothing affordable: the camp waits. The resource that holds it back is
    // the largest relative shortfall of the cheapest next level (by gold).
    const cheapest = [...options].sort((a, b) => (a.cost.gold ?? 0) - (b.cost.gold ?? 0) || total(a.cost) - total(b.cost))[0];
    const missing = engine.missingFor(cheapest.cost, this.wallet);
    const binding = missing.reduce((best, m) => (m.amount / cheapest.cost[m.resource] > best.share ? { id: m.resource, share: m.amount / cheapest.cost[m.resource] } : best), { id: null, share: -1 }).id;
    if (this.idleSince !== null) this.log.idle[this.idleReason] = (this.log.idle[this.idleReason] ?? 0) + (t - this.idleSince);
    this.idleSince = t;
    this.idleReason = binding;
    // Also: which resources are missing for every option.
    for (const id of RESOURCES) {
      if (options.every(({ cost }) => (this.wallet[id] ?? 0) < (cost[id] ?? 0))) this.log.blockedAll[id] = (this.log.blockedAll[id] ?? 0) + 1;
    }
    this.log.idleChecks += 1;
  }

  closeIdle(t) {
    if (this.idleSince !== null) {
      this.log.idle[this.idleReason] = (this.log.idle[this.idleReason] ?? 0) + (t - this.idleSince);
      this.idleSince = null;
      this.idleReason = null;
    }
  }

  start({ building, target, cost }, t, character) {
    // As beginBuilding: a production building's store goes to the resources
    // first and it produces again from the end of the upgrade.
    const producing = building.effect.kind === 'production';
    if (producing && this.stored[building.id]) {
      const got = engine.collect(building, this.stored[building.id], t);
      if (got) {
        this.wallet[got.resource] += got.amount;
        this.log.collected[got.resource] = (this.log.collected[got.resource] ?? 0) + got.amount;
      }
    }
    for (const [id, amount] of Object.entries(cost)) {
      this.wallet[id] -= amount;
      this.log.spent[id] = (this.log.spent[id] ?? 0) + amount;
    }
    this.log.goldByBuilding[building.id] = (this.log.goldByBuilding[building.id] ?? 0) + (cost.gold ?? 0);
    const endsAt = t + engine.upgradeMinutes(building, target) * MINUTE;
    this.stored[building.id] = { level: target, startedAt: t, endsAt, collectedAt: producing ? endsAt : null };
    this.log.builds.push({ id: building.id, level: target, at: t, endsAt, charLevel: character.level });
  }

  // Build completions up to t: the engaged player comes back at each one.
  advanceTo(t, character) {
    for (;;) {
      const running = Object.entries(this.stored).find(([, b]) => b.endsAt > this.cursor && b.endsAt <= t);
      if (!running) break;
      const at = running[1].endsAt;
      this.cursor = at;
      this.check(at, character);
    }
    this.cursor = t;
  }

  nextCompletionAfter(t) {
    const ends = Object.values(this.stored).map((b) => b.endsAt).filter((at) => at > t);
    return ends.length ? Math.min(...ends) : null;
  }
}

// ---------------------------------------------------------------- one run

export function runCharacter(classId, runIndex, content, policyIn = {}) {
  const policy = { ...DEFAULT_POLICY, ...policyIn };
  const cls = content.classesById[classId];
  const supply = content.balance.startingSupply;
  const wallet = { gold: supply.gold, wood: 0, stone: 0, 'iron-ore': 0, ...supply.resources };
  const campLog = { builds: [], idle: {}, blockedAll: {}, idleChecks: 0, spent: {}, collected: {}, goldByBuilding: {} };
  const camp = new Camp(content, wallet, campLog);
  camp.cursor = 0;

  const character = { classId, level: 1, xp: 0, classLevel: 1, classXp: 0, points: {}, position: cls.position };
  let equipped = [];
  let timePoints = content.balance.timePoints.start;
  let now = 0; // wall clock (exploring + resting), ms
  // With the ones the half-hour clock brought on the wall clock.
  const timePointsNow = () => timePoints + engine.gainedTimePoints(0, now, content).points;
  let exploreMs = 0;
  let restMs = 0;
  let hp = engine.playerCombatant({ character, equipped, name: 'S' }, content).maxHp;

  const totals = { goldHunts: 0, goldSales: 0, goldAnvil: 0, itemsFound: 0, itemsSold: 0, xpGross: 0, penalty: 0, anvilTries: 0, foundBySlot: {}, wornBySlot: {}, rarityFound: {} };
  const hunts = [];
  const levels = {}; // level -> snapshot at first reaching it
  const slotFirst = {};
  const recent = {};
  const cooldown = {};

  const snapshot = (level, atExploreMs, atWallMs) => {
    const worn = equipped;
    const filled = worn.length;
    const avg = (f) => (filled ? worn.reduce((s, item) => s + f(item), 0) / filled : 0);
    const campLevels = camp.levels(now);
    return {
      level,
      exploreHours: atExploreMs / HOUR,
      totalHours: atWallMs / HOUR,
      claimExploreHours: exploreMs / HOUR,
      claimTotalHours: now / HOUR,
      restHours: restMs / HOUR,
      classLevel: character.classLevel,
      gold: wallet.gold,
      wallet: { ...wallet },
      goldEarned: totals.goldHunts + totals.goldSales,
      goldSpentCamp: campLog.spent.gold ?? 0,
      goldSpentAnvil: totals.goldAnvil,
      timePoints: timePointsNow(),
      slotsFilled: filled,
      gearItemLevel: avg((item) => item.level),
      gearEqLevel: avg((item) => commonEquivalentLevel(item, content)),
      weaponLevel: worn.find((item) => item.slot === 'weapon')?.level ?? 0,
      gearUpgrade: avg((item) => item.upgrade ?? 0),
      camp: campLevels,
      hunts: hunts.length,
      faints: hunts.filter((h) => h.result === 'fainted').length,
      penalty: totals.penalty,
    };
  };

  levels[1] = snapshot(1, 0, 0);
  camp.check(0, character);

  const maxHpNow = () => engine.playerCombatant({ character, equipped, name: 'S' }, content).maxHp;

  while (character.level < policy.targetLevel && hunts.length < policy.maxHunts) {
    // ---- choose where and how long
    // 'eager' (sensitivity): the highest inner region the class level opens.
    let index = policy.areaChoice === 'eager'
      ? content.areas.reduce((best, a, i) => (engine.areaUnlocked(a, character.classLevel, content) ? i : best), 0)
      : fittingAreaIndex(character.level, content);
    const fitting = index;
    const skipped = [];
    while (index > 0 && (cooldown[content.areas[index].id] ?? 0) > 0) {
      skipped.push(content.areas[index].id);
      index -= 1;
    }
    while (index > 0 && !engine.areaUnlocked(content.areas[index], character.classLevel, content)) index -= 1;
    let minutes = engine.longestHunt(character.level, content);
    // 'threatAware' (sensitivity): the longest length the game rates below
    // "high" (faint chance under 5%) at the current HP; if even 5 minutes is
    // rated high or worse, one inner region lower; the shortest as a last resort.
    if (policy.threatAware) {
      const hpNow = Math.min(hp, maxHpNow());
      for (;;) {
        const chances = engine.faintChances({ character, equipped, hp: hpNow, areaId: content.areas[index].id }, content);
        const options = engine.huntDurations(character.level, content).filter((m) => m >= 5 && chances[m] < 0.05);
        if (options.length) { minutes = options.at(-1); break; }
        if (index > 0) { index -= 1; continue; }
        minutes = 5;
        break;
      }
    }
    const area = content.areas[index];

    // ---- the hunt
    const startWall = now;
    const startExplore = exploreMs;
    const maxHp = maxHpNow();
    const hpStart = Math.min(hp, maxHp);
    const before = { level: character.level, xp: character.xp, classLevel: character.classLevel };
    if (policy.capture && policy.capture(area.id, character.level, character.classLevel)) {
      policy.captured.push({ character: JSON.parse(JSON.stringify(character)), equipped: JSON.parse(JSON.stringify(equipped)), hp: hpStart, maxHp, areaId: area.id, minutes });
    }
    const hunt = engine.simulateHunt(
      { character: { ...character }, equipped, hp: hpStart, name: 'S', areaId: area.id, minutes, seed: `bal:${classId}:${runIndex}:${hunts.length}` },
      content,
    );

    // When, inside the hunt, the XP crossed each level (a level is never lost).
    let lvl = before.level;
    let xp = before.xp;
    const crossings = [];
    for (const fight of hunt.fights) {
      if (!fight.won || fight.xp <= 0) continue;
      xp += fight.xp;
      while (lvl < content.balance.progression.maxLevel && xp >= engine.xpToNext(lvl, content)) {
        xp -= engine.xpToNext(lvl, content);
        lvl += 1;
        crossings.push({ level: lvl, t: fight.t });
      }
    }

    now += minutes * MINUTE;
    exploreMs += minutes * MINUTE;
    // Camp events while the character was away.
    camp.advanceTo(now, character);

    // ---- claim (finishHunt)
    const applied = engine.applyHunt(character, hunt, content);
    character.level = applied.level;
    character.xp = applied.xp;
    character.classLevel = applied.classLevel;
    character.classXp = applied.classXp;
    timePoints += applied.timePoints;
    wallet.gold += hunt.gold;
    totals.goldHunts += hunt.gold;
    for (const [id, amount] of Object.entries(hunt.resources)) wallet[id] = (wallet[id] ?? 0) + amount;
    totals.xpGross += hunt.xp;
    totals.penalty += applied.penalty;
    totals.itemsFound += hunt.items.length;
    for (const item of hunt.items) {
      totals.foundBySlot[item.slot] = (totals.foundBySlot[item.slot] ?? 0) + 1;
      totals.rarityFound[item.rarity] = (totals.rarityFound[item.rarity] ?? 0) + 1;
    }

    // Finds into empty slots, as the server does.
    const auto = engine.autoEquip(equipped, hunt.items, content, classId, character.classLevel);
    equipped = [...equipped, ...auto.map((i) => hunt.items[i])];
    const bag = hunt.items.filter((_, i) => !auto.includes(i));
    // The stats screen opens at level 2; points are spent before judging gear.
    if (character.level >= content.unlocksById.stats.level && engine.freePoints(character, content) > 0) {
      character.points = engine.autoDistribute(character, content);
    }
    // A find replaces the worn item when it raises offence x defence.
    const sorted = [...bag].sort((a, b) => engine.itemRank(b, content) - engine.itemRank(a, content));
    const toSell = [];
    for (const item of sorted) {
      if (!engine.canUse(item.base, classId, content, character.classLevel)) {
        toSell.push(item);
        continue;
      }
      const current = equipped.find((worn) => worn.slot === item.slot);
      const swapped = [...equipped.filter((worn) => worn.slot !== item.slot), item];
      if (!current || buildScore(character, swapped, content) > buildScore(character, equipped, content) * 1.000001) {
        if (current) toSell.push(current);
        equipped = swapped;
        totals.wornBySlot[item.slot] = (totals.wornBySlot[item.slot] ?? 0) + 1;
      } else {
        toSell.push(item);
      }
    }
    for (const item of equipped) {
      if (!slotFirst[item.slot]) slotFirst[item.slot] = { level: character.level, exploreHours: exploreMs / HOUR, itemLevel: item.level };
    }
    const sellBonus = engine.campBonus(camp.levels(now), 'sellPrice', content);
    let sales = 0;
    for (const item of toSell) {
      const price = engine.sellPrice(item, content, sellBonus);
      wallet.gold += price;
      sales += price;
      totals.goldSales += price;
      totals.itemsSold += 1;
    }

    // ---- optional anvil (variant): upgrade worn items while the camp is busy
    if (policy.anvil) anvilStep();

    hp = Math.min(hunt.hpEnd, maxHpNow());
    const endedAt = hunt.result === 'success' ? minutes * MINUTE : (hunt.fights.at(-1)?.t ?? minutes * MINUTE);
    const record = {
      startLevel: before.level,
      startClassLevel: before.classLevel,
      endLevel: character.level,
      areaId: area.id,
      fittingAreaId: content.areas[fitting].id,
      steppedDown: index < fitting,
      minutes,
      result: hunt.result,
      xp: hunt.xp,
      penalty: applied.penalty,
      gold: hunt.gold,
      sales,
      resources: hunt.resources,
      items: hunt.items.length,
      hpStartShare: hpStart / maxHp,
      hpEndShare: hunt.hpEnd / hunt.maxHp,
      lostMinutes: (minutes * MINUTE - endedAt) / MINUTE,
      lastFight: hunt.result === 'success' ? null : (() => {
        const f = hunt.fights.at(-1);
        return { index: f.index, of: hunt.fights.length, elite: f.elite, tough: f.tough, enemies: f.enemies.map((e) => `${e.monsterId}:${e.level}`).join('+'), hpBeforeShare: f.hpBefore / hunt.maxHp };
      })(),
      restMinutes: 0,
    };
    hunts.push(record);

    // Step-down bookkeeping.
    for (const id of skipped) cooldown[id] -= 1;
    const list = (recent[area.id] ??= []);
    list.push(hunt.result);
    if (list.length > policy.stepDownWindow) list.shift();
    if (index > 0 && list.filter((r) => r === 'fainted').length >= policy.stepDownFaints) {
      cooldown[area.id] = policy.stepDownHunts;
      recent[area.id] = [];
    }

    // Levels reached in this hunt: snapshot at the end of the hunt, with the
    // time inside the hunt when the XP crossed the level.
    for (let level = before.level + 1; level <= character.level; level++) {
      const crossing = crossings.find((c) => c.level === level);
      const t = crossing ? crossing.t : minutes * MINUTE;
      levels[level] = snapshot(level, startExplore + t, startWall + t);
    }

    camp.check(now, character);

    // ---- rest until restTo of max HP (the camp keeps going)
    const target = policy.restTo * maxHpNow();
    const restStart = now;
    if (hp < target) {
      const { totals: stats } = engine.computeStats(character, equipped, content);
      const maxHpRest = maxHpNow();
      let t = now;
      let hpf = hp;
      for (let guard = 0; guard < 1000 && hpf < target; guard++) {
        const bonus = engine.campBonus(camp.levels(t), 'restSpeed', content);
        const perMinute = engine.regenPerMinute(maxHpRest, stats.vitality, content, bonus);
        const reach = t + ((target - hpf) / perMinute) * MINUTE;
        const next = camp.nextCompletionAfter(t);
        if (next !== null && next < reach) {
          hpf += (perMinute * (next - t)) / MINUTE;
          t = next;
          camp.advanceTo(t, character);
        } else {
          hpf = target;
          t = reach;
        }
      }
      const restEnd = restStart + Math.ceil((t - restStart) / MINUTE) * MINUTE;
      camp.advanceTo(restEnd, character);
      hp = Math.min(maxHpRest, Math.ceil(hpf));
      now = restEnd;
      restMs += restEnd - restStart;
      record.restMinutes = (restEnd - restStart) / MINUTE;
      camp.check(now, character);
    }
  }

  camp.closeIdle(now);

  function anvilStep() {
    // Simple anvil policy: once the camp is building something (so the anvil
    // never delays the camp), upgrade the weapon, then the chest, then the
    // rest by item level, one try at a time, while the cost is under half of
    // the gold held.
    const cap = engine.campBonus(camp.levels(now), 'upgradeCap', content);
    if (cap <= 0 || !camp.running(now)) return;
    for (let guard = 0; guard < 50; guard++) {
      const order = [...equipped].sort((a, b) => (a.slot === 'weapon' ? -1 : b.slot === 'weapon' ? 1 : a.slot === 'chest' ? -1 : b.slot === 'chest' ? 1 : b.level - a.level));
      const item = order.find((candidate) => (candidate.upgrade ?? 0) < Math.min(cap, engine.maxUpgrade(content)));
      if (!item) return;
      const target = (item.upgrade ?? 0) + 1;
      const cost = engine.itemUpgradeCost(item, target, content);
      if (cost.gold > wallet.gold / 2 || cost['iron-ore'] > wallet['iron-ore'] / 2) return;
      wallet.gold -= cost.gold;
      wallet['iron-ore'] -= cost['iron-ore'];
      totals.goldAnvil += cost.gold;
      totals.anvilTries += 1;
      const rng = engine.createRng(`anvil:${classId}:${runIndex}:${totals.anvilTries}`);
      const outcome = engine.rollUpgrade(item, rng, content);
      if (outcome.result === 'broken') equipped = equipped.filter((worn) => worn !== item);
      else {
        const upgraded = { ...item, upgrade: outcome.upgrade };
        equipped = equipped.map((worn) => (worn === item ? upgraded : worn));
      }
    }
  }

  return {
    classId,
    runIndex,
    reached: character.level,
    levels,
    hunts,
    slotFirst,
    totals,
    camp: { log: campLog, finalLevels: camp.levels(now), wallet: { ...wallet } },
    timePoints: timePointsNow(),
    exploreHours: exploreMs / HOUR,
    totalHours: now / HOUR,
    restHours: restMs / HOUR,
    equipped,
  };
}

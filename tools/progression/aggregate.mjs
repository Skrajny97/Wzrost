// Runs many characters per class and averages what they measured.

import * as engine from '../../src/engine/index.js';
import { runCharacter, SLOTS } from './sim.mjs';

export const BANDS = [[1, 10], [11, 20], [21, 30], [31, 40], [41, 50]];
const HOUR_LEVELS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

const mean = (list) => (list.length ? list.reduce((s, v) => s + v, 0) / list.length : null);
const quantile = (list, q) => {
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};
const r2 = (v) => (v === null || v === undefined ? null : Math.round(v * 100) / 100);
const r1 = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);

export function designHours(level, content) {
  let hours = 0;
  for (let l = 1; l < level; l++) hours += engine.huntingHours(l, content);
  return hours;
}

export function simulateClass(classId, content, { runs = 40, policy = {}, seedOffset = 0 } = {}) {
  const results = [];
  for (let i = 0; i < runs; i++) results.push(runCharacter(classId, i + seedOffset, content, policy));
  return summarise(classId, results, content);
}

export function summarise(classId, results, content) {
  const target = Math.min(...results.map((r) => r.reached), 50);
  const levels = [];
  for (let L = 1; L <= 50; L++) {
    const snaps = results.map((r) => r.levels[L]).filter(Boolean);
    if (!snaps.length) continue;
    const huntsAt = results.flatMap((r) => r.hunts.filter((h) => h.startLevel === L));
    const pick = (f) => snaps.map(f);
    const campIds = content.buildings.map((b) => b.id);
    levels.push({
      level: L,
      runsReached: snaps.length,
      designHours: r2(designHours(L, content)),
      exploreHours: r2(mean(pick((s) => s.exploreHours))),
      exploreHoursP10: r2(quantile(pick((s) => s.exploreHours), 0.1)),
      exploreHoursP90: r2(quantile(pick((s) => s.exploreHours), 0.9)),
      exploreHoursAtClaim: r2(mean(pick((s) => s.claimExploreHours))),
      totalHours: r2(mean(pick((s) => s.totalHours))),
      totalHoursAtClaim: r2(mean(pick((s) => s.claimTotalHours))),
      restHours: r2(mean(pick((s) => s.restHours))),
      classLevel: r1(mean(pick((s) => s.classLevel))),
      huntsStartedAtLevel: r2(huntsAt.length / results.length),
      faintRateAtLevel: huntsAt.length ? r2(huntsAt.filter((h) => h.result === 'fainted').length / huntsAt.length) : null,
      gold: Math.round(mean(pick((s) => s.gold))),
      goldEarned: Math.round(mean(pick((s) => s.goldEarned))),
      goldSpentCamp: Math.round(mean(pick((s) => s.goldSpentCamp))),
      goldSpentAnvil: Math.round(mean(pick((s) => s.goldSpentAnvil))),
      wood: Math.round(mean(pick((s) => s.wallet.wood))),
      stone: Math.round(mean(pick((s) => s.wallet.stone))),
      ironOre: Math.round(mean(pick((s) => s.wallet['iron-ore']))),
      timePoints: Math.round(mean(pick((s) => s.timePoints))),
      slotsFilled: r1(mean(pick((s) => s.slotsFilled))),
      gearItemLevel: r1(mean(pick((s) => s.gearItemLevel))),
      gearCommonEquivalentLevel: r1(mean(pick((s) => s.gearEqLevel))),
      weaponLevel: r1(mean(pick((s) => s.weaponLevel))),
      gearUpgrade: r2(mean(pick((s) => s.gearUpgrade))),
      engineGearLevel: engine.gearLevel(L, content),
      camp: Object.fromEntries(campIds.map((id) => [id, r1(mean(pick((s) => s.camp[id])))])),
      campLevelsTotal: r1(mean(pick((s) => Object.values(s.camp).reduce((a, b) => a + b, 0)))),
      xpPenaltySoFar: Math.round(mean(pick((s) => s.penalty))),
    });
  }

  const bands = BANDS.map(([lo, hi]) => {
    const hunts = results.flatMap((r) => r.hunts.filter((h) => h.startLevel >= lo && h.startLevel <= hi));
    const n = results.length;
    const exploreH = hunts.reduce((s, h) => s + h.minutes, 0) / 60;
    const restH = hunts.reduce((s, h) => s + h.restMinutes, 0) / 60;
    const xp = hunts.reduce((s, h) => s + h.xp, 0);
    const penalty = hunts.reduce((s, h) => s + h.penalty, 0);
    const gold = hunts.reduce((s, h) => s + h.gold, 0);
    const sales = hunts.reduce((s, h) => s + h.sales, 0);
    const res = (id) => hunts.reduce((s, h) => s + (h.resources[id] ?? 0), 0);
    const fainted = hunts.filter((h) => h.result === 'fainted');
    const startOf = (r) => (lo === 1 ? 0 : r.levels[lo]?.exploreHours);
    const endOf = (r) => r.levels[Math.min(hi + 1, 50)]?.exploreHours;
    const spans = results.map((r) => (startOf(r) !== undefined && endOf(r) !== undefined ? endOf(r) - startOf(r) : null)).filter((v) => v !== null);
    const designSpan = designHours(Math.min(hi + 1, 50), content) - designHours(lo, content);
    return {
      band: `${lo}-${hi}`,
      huntsPerRun: r2(hunts.length / n),
      minutesPerHunt: r1(hunts.length ? (exploreH * 60) / hunts.length : null),
      faintRate: r2(fainted.length / Math.max(1, hunts.length)),
      escapeRate: r2(hunts.filter((h) => h.result === 'escaped').length / Math.max(1, hunts.length)),
      steppedDownShare: r2(hunts.filter((h) => h.steppedDown).length / Math.max(1, hunts.length)),
      exploreHoursPerRun: r2(exploreH / n),
      restHoursPerRun: r2(restH / n),
      restShareOfTotal: r2(restH / Math.max(1e-9, restH + exploreH)),
      hoursToCrossBand: r2(mean(spans)),
      designHoursToCrossBand: r2(designSpan),
      xpGrossPerRun: Math.round(xp / n),
      xpLostToFaintingPerRun: Math.round(penalty / n),
      xpLostShare: r2(penalty / Math.max(1, xp)),
      minutesLostAfterFaintsPerRun: r1(fainted.reduce((s, h) => s + h.lostMinutes, 0) / n),
      huntGoldPerHour: Math.round(gold / Math.max(1e-9, exploreH)),
      salesGoldPerHour: Math.round(sales / Math.max(1e-9, exploreH)),
      goldPerHour: Math.round((gold + sales) / Math.max(1e-9, exploreH)),
      woodPerHour: r1(res('wood') / Math.max(1e-9, exploreH)),
      stonePerHour: r1(res('stone') / Math.max(1e-9, exploreH)),
      ironOrePerHour: r1(res('iron-ore') / Math.max(1e-9, exploreH)),
      hpStartShare: r2(mean(hunts.map((h) => h.hpStartShare))),
      hpEndShareWon: r2(mean(hunts.filter((h) => h.result === 'success').map((h) => h.hpEndShare))),
    };
  });

  const slotFirstFilled = Object.fromEntries(
    SLOTS.map((slot) => {
      const got = results.map((r) => r.slotFirst[slot]).filter(Boolean);
      return [slot, { shareOfRuns: r2(got.length / results.length), level: r1(mean(got.map((g) => g.level))), exploreHours: r1(mean(got.map((g) => g.exploreHours))) }];
    }),
  );

  const at = (L, f) => {
    const row = levels.find((row) => row.level === L);
    return row ? f(row) : null;
  };
  const campIdleHours = {};
  for (const r of results) for (const [id, ms] of Object.entries(r.camp.log.idle)) campIdleHours[id] = (campIdleHours[id] ?? 0) + ms / 3600000 / results.length;
  const blockedAll = {};
  for (const r of results) for (const [id, count] of Object.entries(r.camp.log.blockedAll)) blockedAll[id] = (blockedAll[id] ?? 0) + count / results.length;
  const goldByBuilding = {};
  for (const r of results) for (const [id, gold] of Object.entries(r.camp.log.goldByBuilding)) goldByBuilding[id] = (goldByBuilding[id] ?? 0) + gold / results.length;
  const spent = {};
  for (const r of results) for (const [id, amount] of Object.entries(r.camp.log.spent)) spent[id] = (spent[id] ?? 0) + amount / results.length;
  const collected = {};
  for (const r of results) for (const [id, amount] of Object.entries(r.camp.log.collected)) collected[id] = (collected[id] ?? 0) + amount / results.length;
  const allHunts = results.flatMap((r) => r.hunts);

  return {
    classId,
    runs: results.length,
    runsReaching50: results.filter((r) => r.reached >= 50).length,
    levels,
    bands,
    milestones: {
      exploreHoursToReach: Object.fromEntries(HOUR_LEVELS.map((L) => [L, at(L, (row) => row.exploreHours)])),
      totalHoursToReach: Object.fromEntries(HOUR_LEVELS.map((L) => [L, at(L, (row) => row.totalHours)])),
      designHoursToReach: Object.fromEntries(HOUR_LEVELS.map((L) => [L, r2(designHours(L, content))])),
      classLevelAt: Object.fromEntries([5, 10, 15, 20, 30, 40, 50].map((L) => [L, at(L, (row) => row.classLevel)])),
      timePointsAt: Object.fromEntries([10, 20, 50].map((L) => [L, at(L, (row) => row.timePoints)])),
      campAt: Object.fromEntries([10, 20, 35, 50].map((L) => [L, at(L, (row) => row.camp)])),
      campTotalAt: Object.fromEntries([10, 20, 35, 50].map((L) => [L, at(L, (row) => row.campLevelsTotal)])),
      goldAt: Object.fromEntries([10, 20, 35, 50].map((L) => [L, at(L, (row) => row.gold)])),
      gearAt: Object.fromEntries([10, 20, 30, 40, 50].map((L) => [L, at(L, (row) => ({ itemLevel: row.gearItemLevel, commonEquivalent: row.gearCommonEquivalentLevel, weapon: row.weaponLevel, slots: row.slotsFilled, engineAssumes: row.engineGearLevel }))])),
    },
    overall: {
      hunts: r1(allHunts.length / results.length),
      faintRate: r2(allHunts.filter((h) => h.result === 'fainted').length / allHunts.length),
      xpLostToFainting: Math.round(allHunts.reduce((s, h) => s + h.penalty, 0) / results.length),
      xpLostShare: r2(allHunts.reduce((s, h) => s + h.penalty, 0) / allHunts.reduce((s, h) => s + h.xp, 0)),
      goldFromHunts: Math.round(mean(results.map((r) => r.totals.goldHunts))),
      goldFromSales: Math.round(mean(results.map((r) => r.totals.goldSales))),
      goldSpentCamp: Math.round(spent.gold ?? 0),
      goldSpentAnvil: Math.round(mean(results.map((r) => r.totals.goldAnvil))),
      goldSpentByBuilding: Object.fromEntries(Object.entries(goldByBuilding).map(([k, v]) => [k, Math.round(v)])),
      campSpent: Object.fromEntries(Object.entries(spent).map(([k, v]) => [k, Math.round(v)])),
      campCollectedFromProduction: Object.fromEntries(Object.entries(collected).map(([k, v]) => [k, Math.round(v)])),
      walletAt50: {
        gold: Math.round(mean(results.map((r) => r.camp.wallet.gold))),
        wood: Math.round(mean(results.map((r) => r.camp.wallet.wood))),
        stone: Math.round(mean(results.map((r) => r.camp.wallet.stone))),
        ironOre: Math.round(mean(results.map((r) => r.camp.wallet['iron-ore']))),
      },
      campIdleHoursByMissingResource: Object.fromEntries(Object.entries(campIdleHours).map(([k, v]) => [k, r1(v)])),
      campChecksWhereResourceMissingForEveryOption: Object.fromEntries(Object.entries(blockedAll).map(([k, v]) => [k, r1(v)])),
      itemsFound: r1(mean(results.map((r) => r.totals.itemsFound))),
      itemsSold: r1(mean(results.map((r) => r.totals.itemsSold))),
      anvilTries: r1(mean(results.map((r) => r.totals.anvilTries))),
      exploreHours: r2(mean(results.map((r) => r.exploreHours))),
      totalHours: r2(mean(results.map((r) => r.totalHours))),
      restHours: r2(mean(results.map((r) => r.restHours))),
    },
    slotFirstFilled,
  };
}

// The reward for entering a brotherhood's new standing (the author's 593 A
// and B): once for each standing, in each brotherhood apart, Punkty
// Systemu and a gift of the brotherhood's goods (data/settlement.json
// standingRewards). The Bractwo Zielarzy gives the herbs that the standing
// puts on Jagna's shelf, the Bractwo Łowców the rarest of the materials it
// puts on Wszebor's, the Bractwo Kowali parts of the Warsztat and the
// Kompania Kupców gold. A standing passed before the rewards came is
// rewarded too, at the first "Odbierz".

import { herbalistStock } from './market.js';
import { standingOf } from './settlement.js';
import { tanneryStock } from './tannery.js';

const at = (list, index) => (Array.isArray(list) ? list[Math.min(index, list.length - 1)] : undefined);

// What entering the standing at `index` (1 = the first past Obcy) of the
// brotherhood `brotherhoodId` gives: { systemPoints, gold, herbs, parts,
// materials }, the last three as counts by herb, part or material stack.
export function standingReward(brotherhoodId, index, content) {
  const tuning = content.settlement.standingRewards;
  const { standings } = content.settlement;
  const reward = { systemPoints: 0, gold: 0, herbs: {}, parts: {}, materials: {} };
  if (!tuning || index < 1 || index >= standings.length) return reward;
  const gift = tuning.gifts?.[brotherhoodId] ?? {};
  reward.systemPoints = at(tuning.systemPoints, index) ?? 0;
  reward.gold = at(gift.gold, index) ?? 0;
  Object.assign(reward.parts, at(gift.parts, index) ?? {});
  const herbs = at(gift.herbs, index) ?? 0;
  if (herbs > 0) {
    const before = new Set(herbalistStock(standings[index - 1].points, content).herbs.map((herb) => herb.id));
    for (const herb of herbalistStock(standings[index].points, content).herbs) if (!before.has(herb.id)) reward.herbs[herb.id] = herbs;
  }
  const materials = at(gift.materials, index) ?? 0;
  if (materials > 0) {
    const before = tanneryStock(standings[index - 1].points, content).goods.length;
    const added = tanneryStock(standings[index].points, content).goods.slice(before);
    for (const good of added.slice(-(gift.rarest ?? 1))) reward.materials[good.key] = materials;
  }
  return reward;
}

// Everything the standings past `rewarded` (the index of the last one
// rewarded, 0 for none) up to the one of `points` give, summed: what
// "Odbierz" takes for the brotherhood. `standings` lists their indices, and
// it is null when nothing waits.
export function standingRewardsDue(brotherhoodId, points, rewarded, content) {
  const { index } = standingOf(points, content);
  if (!content.settlement.standingRewards || index <= (rewarded ?? 0)) return null;
  const due = { systemPoints: 0, gold: 0, herbs: {}, parts: {}, materials: {}, standings: [] };
  const add = (into, from) => {
    for (const [key, count] of Object.entries(from)) into[key] = (into[key] ?? 0) + count;
  };
  for (let step = (rewarded ?? 0) + 1; step <= index; step += 1) {
    const reward = standingReward(brotherhoodId, step, content);
    due.systemPoints += reward.systemPoints;
    due.gold += reward.gold;
    add(due.herbs, reward.herbs);
    add(due.parts, reward.parts);
    add(due.materials, reward.materials);
    due.standings.push(step);
  }
  return due;
}

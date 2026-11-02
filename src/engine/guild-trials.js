// The Próby Gildii (the author's 345 A; data/guilds.json, `trials`): every
// week a guild's board of trials from the whole game, drawn from a seed of
// the guild and the week. A member takes one trial at a time and does it in
// its usual play; what an action brings counts as the narrator's quests
// count it (addQuestProgress), with the tower fights won, the Kowadło's
// upgrades and the pieces given in the Prośby Gildii besides. A trial asks
// for as much as suits the taker's level when taken (weekShare, as the
// weekly quests). The guild's finished trials, each member's up to the
// cap, fill one bar with four thresholds, which grow with the members
// active when the board was drawn; each threshold reached brings a chest
// to everyone who finished a trial that week.

import { creaturesPerFight, countedForm, questArea, weekShare } from './quests.js';
import { createRng } from './rng.js';
import { stackKey } from './crafting.js';

const rules = (content) => content.guilds.trials;

export const trialKind = (kindId, content) => rules(content).kinds.find((kind) => kind.id === kindId) ?? null;

// The board of a guild's week from its seed: `board` trials, each a kind
// and one of its sizes, no pair twice, the likelier by the weights of both;
// `roll` places its count within the kind's range. In the order of the
// kinds, the smaller size first.
export function drawTrialBoard(seed, content) {
  const { board, sizes, kinds } = rules(content);
  const rng = createRng(seed);
  let options = kinds.flatMap((kind) => sizes.map((size, index) => ({ kind: kind.id, size: index, weight: kind.weight * size.weight })));
  const drawn = [];
  while (drawn.length < board && options.length > 0) {
    const option = rng.weighted(options);
    options = options.filter((other) => other !== option);
    drawn.push({ kind: option.kind, size: option.size, roll: Math.floor(rng.next() * 1000) / 1000 });
  }
  const order = (trial) => kinds.findIndex((kind) => kind.id === trial.kind);
  return drawn.sort((a, b) => order(a) - order(b) || a.size - b.size);
}

// How many creatures a fight brings on average in the newest place open to
// the character's class, at its level.
const fightCreatures = (character, content) => [...creaturesPerFight(questArea(character, content), character.level).values()].reduce((sum, share) => sum + share, 0);

// What a trial asks of a character as it is: its kind's count at the
// trial's roll (for creatures, as many as that many fights bring on average
// where the character's class goes now), times the size's factor and the
// share of the usual numbers at its level (weekShare: much less up to level
// 50), to the kind's step and at least one. Null for a kind the data no
// longer has.
export function trialCount(trial, character, content) {
  const kind = trialKind(trial.kind, content);
  if (!kind) return null;
  const factor = rules(content).sizes[trial.size]?.factor ?? 1;
  const share = weekShare(character.level, 7, content) * factor;
  const step = kind.step ?? 1;
  const [min, max] = kind.fights ?? kind.count;
  const base = min + step * Math.floor(trial.roll * (Math.floor((max - min) / step) + 1));
  if (kind.fights) return Math.max(1, Math.round(base * share * fightCreatures(character, content)));
  return Math.max(step, Math.round((base * share) / step) * step);
}

// A trial's words: its kind's, with the count and the noun to go with it.
export function trialText(kindId, count, content) {
  const kind = trialKind(kindId, content);
  return kind.text.replace('{count}', String(count)).replace('{noun}', countedForm(count, kind.counted));
}

// Why the character cannot take a trial of a kind yet, or null. `access`
// says, for each part of the game a kind needs (`requires`), whether the
// character has it (true), not yet (false) or whether the game has it not
// here at all ("off").
export function trialLock(kindId, access, content) {
  const need = trialKind(kindId, content)?.requires;
  if (!need || access[need] === true) return null;
  const { locks } = rules(content);
  if (access[need] === 'off') return locks.off;
  return locks[need].replace('{level}', String(content.unlocksById[need]?.level ?? ''));
}

// What an action brings to a trial of each kind, from what the narrator's
// quests count (addQuestProgress: creatures beaten, minutes explored,
// materials processed and items salvaged on the Stół rozbiórki, herbs
// gathered, potions brewed, the Warsztat's items, the Osada's orders) and
// what they do not: tower fights won, the Kowadło's upgrades that came off
// and the pieces given in the Prośby Gildii. Only the kinds it moves on.
export function trialGains({ kills = {}, minutes = 0, processed = 0, salvaged = 0, herbs = {}, potions = {}, made = 0, orders = 0, towerWins = 0, upgrades = 0, gifts = 0 }) {
  const total = (counts) => Object.values(counts).reduce((sum, count) => sum + count, 0);
  const gains = {
    killAny: total(kills),
    explore: minutes,
    towers: towerWins,
    gatherAny: total(herbs),
    brewAny: total(potions),
    makeAny: made,
    process: processed,
    salvage: salvaged,
    orders,
    upgrade: upgrades,
    gifts,
  };
  return Object.fromEntries(Object.entries(gains).filter(([, gain]) => gain > 0));
}

// The guild's finished trials of a week: each member's up to the cap (the
// author: nobody does everything for the others). `perMember` lists how
// many each finished.
export const trialPoints = (perMember, content) => perMember.reduce((sum, count) => sum + Math.min(count, rules(content).cap), 0);

// The week's thresholds: how many finished trials each needs (the members
// active when the board was drawn, at least one, times its step) and
// whether the guild has them.
export function trialThresholds(active, points, content) {
  const members = Math.max(1, active);
  return rules(content).steps.map((step, index) => ({ index, need: members * step, reached: points >= members * step }));
}

// The material a chest gives: one of an ordinary creature of the newest
// place open to the character's class, at its species' rarity, drawn with
// `rng`; null where there is none.
function chestMaterial(character, rng, content) {
  const area = questArea(character, content);
  const ids = [...new Set(area.encounters.flatMap((encounter) => encounter.monsters))];
  const materials = ids
    .map((id) => content.materialsByMonster[id])
    .filter((material) => material && !content.monstersById[material.monster]?.elite && !content.monstersById[material.monster]?.champion);
  if (materials.length === 0) return null;
  const material = rng.pick(materials);
  return stackKey(material.id, material.rarity);
}

// A threshold's chest for a character: gold by its level, Punkty Czasu,
// pieces of one material of the creatures where its class goes now, and
// Punkty Systemu on those that have them (the last). Drawn from `seed`, so
// the chest holds the same whenever it is opened.
export function trialChest(index, character, seed, content) {
  const chest = rules(content).chests[index];
  const material = chest.materials > 0 ? chestMaterial(character, createRng(seed), content) : null;
  return {
    gold: Math.round(chest.gold.base + chest.gold.perLevel * character.level),
    timePoints: chest.timePoints,
    systemPoints: chest.systemPoints ?? 0,
    materials: material ? { [material]: chest.materials } : {},
  };
}

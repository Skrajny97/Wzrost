// The Próby Gildii (the author's 345 A; data/guilds.json, `trials`): every
// week a guild's board of trials from the whole game, drawn from a seed of
// the guild and the week. Every trial open on the board runs for each
// member at once, from the moment it opens, with nothing to take (the
// author: "617 prób nie trzeba będzie brać, one będą wszystkie na raz
// odpalone u gracza"); what an action brings counts as the narrator's
// quests count it (addQuestProgress), with the tower fights won, the
// Kowadło's upgrades and the pieces given in the Prośby Gildii besides. A
// trial asks for as much as suits the member's level when it opens
// (weekShare, as the weekly quests). The week opens day by day (the
// author's 615 A): a few trials on Monday and more each day after. The
// guild's finished trials fill one bar, each member's up to the cap and
// to so many for each day of the week so far (what is finished beyond that
// comes onto the bar on the days after), with thresholds that grow with the
// members active when the board was drawn and, in part, with those who
// join later; each threshold reached brings a chest to everyone who
// finished a trial that week.

import { creaturesPerFight, countedForm, questArea, questPeriod, weekShare } from './quests.js';
import { createRng } from './rng.js';
import { stackKey } from './crafting.js';

const rules = (content) => content.guilds.trials;
const DAY = 24 * 3600000;
const WEEK_DAYS = 7;

// The day of the week at `now` on the quests' clock: 0 on Monday to 6 on
// Sunday (rounded, so a day of 23 or 25 hours counts as one).
export function trialDay(now, content) {
  const week = questPeriod('weekly', now, content);
  const day = questPeriod('daily', now, content);
  return Math.min(WEEK_DAYS - 1, Math.max(0, Math.round((day.startsAt - week.startsAt) / DAY)));
}

// How many trials of the week's board are open on `day` (trialDay): the
// first ones on Monday and more each day after (opens); all of them where
// the data sets no such pace.
export function trialsOpen(day, content) {
  const { board, opens } = rules(content);
  if (!opens) return board;
  return Math.min(board, opens.first + opens.perDay * day);
}

// How many trials a character may have finished this week by the end of
// `day`: perDay for each day of the week so far, so a day missed is made up
// later; no limit where the data sets none.
export function trialDayLimit(day, content) {
  const { perDay } = rules(content);
  return Number.isInteger(perDay) ? perDay * (day + 1) : Infinity;
}

// The day of the week (trialDay) on which the trial at `index` of the
// board opens: the first ones on Monday, then perDay more each day.
export function trialOpensOn(index, content) {
  const { opens } = rules(content);
  if (!opens || index < opens.first || opens.perDay <= 0) return 0;
  return Math.min(WEEK_DAYS - 1, 1 + Math.floor((index - opens.first) / opens.perDay));
}

// What a member who joins after the board was drawn adds to the week's
// members: the share of the week left on `day`, that day included (all of
// a member on Monday, a seventh on Sunday).
export const joinShare = (day) => (WEEK_DAYS - Math.min(WEEK_DAYS - 1, Math.max(0, day))) / WEEK_DAYS;

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

// The lowest floor whose win counts for a trial of the Wieże for a
// character of `level`: at most the kind's levelsBelow levels below it, so
// a high character does not do the trial on the first floor (the author:
// 488 A); any floor when the kind sets no such limit.
export function trialTowerFloor(level, content) {
  const below = trialKind('towers', content)?.levelsBelow;
  return Number.isInteger(below) ? Math.max(1, level - below) : 1;
}

// A trial's note under its words, or null: its kind's, with the lowest
// floor that counts for a character of `level` ({floor}, trialTowerFloor).
export function trialNote(kindId, level, content) {
  const note = trialKind(kindId, content)?.note;
  return note ? note.replace('{floor}', String(trialTowerFloor(level, content))) : null;
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
// what they do not: tower fights won (on the floors trialTowerFloor lets
// count, as the server says), the Kowadło's upgrades that came off and the
// pieces given in the Prośby Gildii. Only the kinds it moves on.
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

// A trial of the Stół rozbiórki's work after orders left the table's queue
// (the author: „nie wiem czy jest sens karania za takie pomyłki”;
// takeOffQueue in crafting.js), so no trial keeps work never done. `row` is
// the trial as kept ({ kind, week, count, progress, extra, state, takenAt,
// doneAt }; `extra`: what came over its count as it was done); `work` lists
// the queue's orders as orderWork gives them, `cancelled` for those leaving.
// The trial gives back what the leaving orders of its kind and week brought
// it: those ordered once it ran, and while it was not done yet. Done, it
// opens again when the rest falls below its count, and then the orders still
// waiting that came after it was done count, as they would have; only later
// orders can, as the table works one after another. Null when nothing changes.
export function trialAfterCancel(row, work, now, content) {
  const own = work.filter((one) => one.kind === row.kind && one.orderedAt >= row.takenAt && questPeriod('weekly', one.orderedAt, content).key === row.week);
  const counted = (one) => row.state !== 'done' || one.orderedAt <= row.doneAt;
  const pieces = (list) => list.reduce((sum, one) => sum + one.pieces, 0);
  const taken = pieces(own.filter((one) => one.cancelled && counted(one)));
  if (taken === 0) return null;
  let total = row.progress + row.extra - taken;
  const reopened = row.state === 'done' && total < row.count;
  if (reopened) total += pieces(own.filter((one) => !one.cancelled && !counted(one)));
  total = Math.max(0, total);
  const done = total >= row.count;
  return {
    progress: Math.min(row.count, total),
    extra: Math.max(0, total - row.count),
    state: done ? 'done' : 'active',
    doneAt: !done ? null : reopened ? now : row.doneAt,
  };
}

// The guild's finished trials of a week: each member's up to the cap (the
// author: nobody does everything for the others) and up to `limit`, the
// day's (trialDayLimit; the rest come onto the bar on the days after).
// `perMember` lists how many each finished.
export const trialPoints = (perMember, content, limit = Infinity) => perMember.reduce((sum, count) => sum + Math.min(count, rules(content).cap, limit), 0);

// The week's thresholds: how many finished trials each needs (the week's
// members, at least one: those active when the board was drawn and the
// shares of those who joined later, joinShare; times its step, rounded up)
// and whether the guild has them.
export function trialThresholds(members, points, content) {
  const counted = Math.max(1, members);
  return rules(content).steps.map((step, index) => {
    const need = Math.ceil(counted * step - 1e-9);
    return { index, need, reached: points >= need };
  });
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

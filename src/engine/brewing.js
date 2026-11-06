// Alchemia (data/professions.json: brewing and potions): the character brews
// potions in the Systemowa Pracownia, one recipe at a time, with no fights
// and no risk. The profession's level shows the recipes and makes each potion
// quicker; a few rare recipes the Osada's herbalist teaches besides, at a
// standing of the relation with her (recipeTaught). The herbs for all the
// potions are taken at the start, and the seed saved then decides which
// potions come out twice. Stopped early, a brewing keeps the potions done
// and gives back the herbs for the rest. Potions stack in the bag as herbs
// do, and the work gives the character the little XP gathering gives
// (professions.js).

import { gradeSteps } from './crafting.js';
import { countList, professionLevelLines, professionProgress } from './professions.js';
import { createRng } from './rng.js';
import { say } from './text.js';

// The standing of the relation with the herbalist from which she teaches a
// rare recipe (121 A: "zaufanym zdradza rzadkie receptury"; `taught`), or
// null for a recipe of the System.
export const recipeStanding = (potion, content) => (potion.taught ? (content.settlement?.standings.find((standing) => standing.id === potion.taught) ?? null) : null);

// Whether the character may know a recipe beside its level: one of the
// System always, a rare one once the herbalist has taught it, that is once
// the relation with her has reached its standing (`relations`: the
// character's relations with the Osada's residents, { herbalist: 720 }).
// Brewing and drinking it still wait for its level, as with any recipe.
export function recipeTaught(potion, relations, content) {
  if (!potion.taught) return true;
  const standing = recipeStanding(potion, content);
  return Boolean(standing) && (relations?.[content.settlement.herbalist.resident] ?? 0) >= standing.points;
}

// The recipes the System shows at a level of the brewing profession, and of
// the herbalist's rare ones those she has taught (recipeTaught).
export const knownPotions = (level, content, relations = {}) => content.potions.filter((potion) => potion.level <= level && recipeTaught(potion, relations, content));

// The minutes of one potion at a level: each level takes speedPerLevel of
// the first level's time off, down to `fastest` of it, and the Bractwo
// Zielarzy (589 B, brewFaster) `faster` of what is left.
export function potionMinutes(level, content, faster = 0) {
  const { potionMinutes: minutes, speedPerLevel, fastest } = content.brewing;
  return minutes * Math.max(fastest, 1 - speedPerLevel * (level - 1)) * (1 - faster);
}

// A brewing of `count` potions in whole minutes, rounded up (and to a
// thousandth first, so 10 × 9.9 stays 99).
export const brewMinutes = (count, level, content, faster = 0) => Math.ceil(Math.round(count * potionMinutes(level, content, faster) * 1000) / 1000);

// The most potions of a recipe brewed at once: as many as the longest
// brewing allows and the herbs in the bag suffice for.
export function mostPotions(potion, level, herbs, content, faster = 0) {
  const { maxMinutes } = content.brewing;
  let count = Math.floor(maxMinutes / potionMinutes(level, content, faster));
  while (count > 0 && brewMinutes(count, level, content, faster) > maxMinutes) count -= 1;
  for (const [id, need] of Object.entries(potion.herbs)) count = Math.min(count, Math.floor((herbs[id] ?? 0) / need));
  return count;
}

// The herbs `count` potions of a recipe take, by id.
export const potionHerbs = (potion, count) => Object.fromEntries(Object.entries(potion.herbs).map(([id, need]) => [id, need * count]));

// The potions of a brewing of `count` over `minutes` done after `elapsed`
// ms: they come one after another, evenly.
export const potionsDone = (count, minutes, elapsed) => Math.min(count, Math.max(0, Math.floor((count * elapsed) / (minutes * 60000))));

// The potions of `count` brewed: each has bonusChance of one more, drawn by
// the seed in order, so a brewing stopped early keeps the draws of the
// potions it made.
export function brewPotions({ count, seed, extraChance = 0 }, content) {
  const rng = createRng(seed);
  let bonus = 0;
  for (let index = 0; index < count; index += 1) {
    if (rng.chance(Math.min(1, content.brewing.bonusChance + extraChance))) bonus += 1;
  }
  return { count: count + bonus, bonus };
}

// What a catalyst of a rarer grade than its species adds to every potion's
// chance of an extra one (proposal 3: "Rzadszy materiał daje szansę na
// dodatkową miksturę"): catalystStep a grade.
export const catalystChance = (key, content) => (key ? gradeSteps(key, content) * content.brewing.catalystStep : 0);

// What the scrapper pays for a potion, before the camp's Skup złomu:
// priceFactor times the price of its herbs.
export const potionPrice = (potion, content) =>
  content.brewing.priceFactor * Object.entries(potion.herbs).reduce((sum, [id, need]) => sum + content.herbsById[id].price * need, 0);

// The report of a brewing: a line about the workshop from the seed, the
// potions made, the lucky ones among them and those the full bag lost, the
// profession's new levels with their stats and the recipes the System
// revealed with them (of the herbalist's rare ones only those she has
// taught, by the character's `relations`), and the character's XP.
// `stopped`: the player called the character back before the end.
export function brewingReport({ potion, minutes, startedAt, endsAt, seed, made, stored, lost, stopped, before, after, character, xp, work, relations = {} }, content) {
  const texts = content.brewing.texts;
  const profession = content.professionsById[content.brewing.profession];
  const revealed = content.potions.filter((candidate) => candidate.level > before.level && candidate.level <= after.level && recipeTaught(candidate, relations, content));
  const list = (count) => countList({ [potion.id]: count }, content.potionsById);
  const lostCount = lost[potion.id] ?? 0;
  return {
    kind: 'potions',
    placeName: content.brewing.place.name,
    minutes,
    startedAt,
    endsAt,
    line: say(texts, 'report', createRng(`${seed}:line`).int(0, texts.report.length - 1)),
    potion: { id: potion.id, name: potion.name, count: made.count, bonus: made.bonus, stored: stored[potion.id] ?? 0, lost: lostCount },
    brewed: say(texts, 'brewed', 0, { potions: list(made.count) }),
    lucky: made.bonus > 0 ? say(texts, 'lucky', 0, { potions: list(made.bonus) }) : null,
    lost: lostCount > 0 ? say(texts, 'lost', 0, { potions: list(lostCount) }) : null,
    stopped: stopped ? say(texts, 'stopped', 0) : null,
    profession: professionProgress(profession, before, after, minutes),
    revealed: revealed.map((candidate) => candidate.id),
    summary: { xp, levelBefore: character.level, levelAfter: work.level, timePoints: work.timePoints },
    system: [
      ...professionLevelLines(profession, before, after, content),
      ...revealed.map((candidate, index) => say(texts, 'revealed', index, { potion: candidate.name })),
      ...work.messages,
    ],
  };
}

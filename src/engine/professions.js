// Professions (data/professions.json): a level from the minutes worked, the
// stats each level gives, and the first one, Zielarstwo. The character
// gathers herbs in the Systemowy Zagajnik, with no fights and no risk: the
// slider sets the time, the profession's level the herbs the System shows and
// how many of them at once, and the seed saved at the start the herbs found.
// Herbs stack in the bag, rules.stack to a place, and what does not fit is
// lost. The work gives the character a little XP (rules.characterXpShare of
// what an hour of exploring gives) and no class XP.

import { gainXp, xpPerHour, xpToNext } from './progression.js';
import { countEvents, createRng } from './rng.js';
import { say } from './text.js';
import { unlockMessages } from './unlocks.js';

// A profession as the character keeps it, { level, xp }: level 1 before any work.
export const professionState = (professions, id) => ({ level: 1, xp: 0, ...professions?.[id] });

// The minutes of work from a level to the next: a point of XP a minute.
export const professionXpToNext = (profession, level) => level * profession.levelMinutes;

// The profession after `minutes` of work, with the levels gained. At its top
// level the XP stays at 0.
export function workProfession(profession, state, minutes) {
  const next = gainXp(state.level, state.xp, minutes, (level) => professionXpToNext(profession, level), profession.maxLevel);
  return { level: next.level, xp: next.xp, levels: next.levels };
}

// What the professions add to the stats: statPerLevel to both of a
// profession's stats for each level after the first, so level 1 adds nothing.
export function professionStats(professions, content) {
  const bonus = {};
  for (const profession of content.professions) {
    const { level } = professionState(professions, profession.id);
    for (const stat of profession.stats) bonus[stat] = (bonus[stat] ?? 0) + (level - 1) * profession.statPerLevel;
  }
  return bonus;
}

// The herbs the System shows at a level of the gathering profession.
export const knownHerbs = (level, content) => content.herbs.filter((herb) => herb.level <= level);

// How many herbs the character gathers at once at a level.
export const herbSlots = (level, content) => content.gathering.slots.findLast((slot) => slot.level <= level).herbs;

// Herbs of one kind an hour at a level: more with each level.
export const herbsPerHour = (herb, level, content) => herb.perHour * (1 + content.gathering.yieldPerLevel * (level - 1));

// The slider's times: the shortest, then every step up to the longest.
export function gatheringMinutes(content) {
  const { min, step, max } = content.gathering.minutes;
  return Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, index) => min + index * step);
}

// What a gathering of `minutes` should bring of each herb, the time shared
// evenly among them: the expected count, and the lowest and highest the
// spread allows.
export function expectedHerbs(herbIds, minutes, level, content) {
  const { spread } = content.gathering;
  return Object.fromEntries(
    herbIds.map((id) => {
      const expected = (herbsPerHour(content.herbsById[id], level, content) * minutes) / 60 / herbIds.length;
      return [id, { expected, low: Math.floor(expected * (1 - spread)), high: Math.ceil(expected * (1 + spread)) }];
    }),
  );
}

// The herbs found, by id: each herb's expected count, ± the spread, made
// whole with the seed. A gathering always brings at least one herb.
export function gatherHerbs({ herbIds, minutes, level, seed }, content) {
  const rng = createRng(seed);
  const { spread } = content.gathering;
  const expected = expectedHerbs(herbIds, minutes, level, content);
  const found = Object.fromEntries(herbIds.map((id) => [id, countEvents(expected[id].expected * rng.float(1 - spread, 1 + spread), rng)]));
  if (Object.values(found).every((count) => count === 0)) found[herbIds[0]] = 1;
  return found;
}

// The places in the bag the herbs take: each herb apart, a stack of
// rules.stack to a place.
export const herbStacks = (herbs, content) =>
  Object.values(herbs ?? {}).reduce((sum, count) => sum + Math.ceil(count / content.professionRules.stack), 0);

// The herbs found, put into the bag with `free` places left: first into the
// room left in each herb's last stack, then into new stacks while there are
// places. Gives the herbs after, and what went in and what did not, by id.
export function storeHerbs(herbs, found, free, content) {
  const { stack } = content.professionRules;
  const after = { ...herbs };
  const stored = {};
  const lost = {};
  let places = Math.max(0, free);
  for (const [id, count] of Object.entries(found)) {
    const have = after[id] ?? 0;
    const fits = Math.min(count, Math.ceil(have / stack) * stack - have + places * stack);
    places -= Math.ceil((have + fits) / stack) - Math.ceil(have / stack);
    if (fits > 0) {
      after[id] = have + fits;
      stored[id] = fits;
    }
    if (count > fits) lost[id] = count - fits;
  }
  return { herbs: after, stored, lost };
}

// The character's XP from `minutes` of work at its level.
export const workXp = (level, minutes, content) =>
  Math.round(xpPerHour(level, content) * (minutes / 60) * content.professionRules.characterXpShare);

// The character after the XP of work: its level, and the free points, Time
// Points and System lines that come with a new one, as after an exploration
// (applyHunt). A new level heals fully.
export function applyWork(character, xp, content) {
  const next = gainXp(character.level, character.xp, xp, (level) => xpToNext(level, content), content.balance.progression.maxLevel);
  const levels = next.level - character.level;
  const time = content.balance.timePoints;
  const messages = [];
  if (levels > 0) {
    messages.push(say(content.texts, 'levelUp', next.level, { level: next.level, points: content.statIds.length * levels, time: time.perLevel * levels }));
    for (let level = character.level + 1; level <= next.level; level++) messages.push(...unlockMessages(level, content));
    messages.push(say(content.texts, 'levelHeal', 0, {}));
  }
  return { level: next.level, xp: next.xp, levelled: levels > 0, timePoints: time.perLevel * levels, messages };
}

// "7 × Żywokost, 3 × Bylica".
const herbList = (counts, content) =>
  Object.entries(counts)
    .map(([id, count]) => `${count} × ${content.herbsById[id].name}`)
    .join(', ');

// The report of a gathering: a line about the grove from the seed, the herbs
// found and those the full bag lost, the profession's new levels with their
// stats and the herbs the System revealed with them, and the character's XP.
export function gatheringReport({ minutes, startedAt, endsAt, seed, found, stored, lost, before, after, character, xp, work }, content) {
  const texts = content.professionTexts;
  const profession = content.professionsById[content.gathering.profession];
  const levels = after.level - before.level;
  const revealed = content.herbs.filter((herb) => herb.level > before.level && herb.level <= after.level);
  const stats = profession.stats.map((stat) => `${content.statsById[stat].name} +${levels * profession.statPerLevel}`).join(', ');
  return {
    kind: 'herbs',
    placeName: content.gathering.place.name,
    minutes,
    startedAt,
    endsAt,
    line: say(texts, 'report', createRng(`${seed}:line`).int(0, texts.report.length - 1)),
    herbs: Object.entries(found).map(([id, count]) => ({ id, name: content.herbsById[id].name, count, stored: stored[id] ?? 0, lost: lost[id] ?? 0 })),
    gathered: say(texts, 'gathered', 0, { herbs: herbList(found, content) }),
    lost: Object.keys(lost).length > 0 ? say(texts, 'lost', 0, { herbs: herbList(lost, content) }) : null,
    profession: {
      id: profession.id,
      name: profession.name,
      levelBefore: before.level,
      levelAfter: after.level,
      xp: minutes,
      xpAfter: after.xp,
      xpToNext: after.level < profession.maxLevel ? professionXpToNext(profession, after.level) : 0,
    },
    revealed: revealed.map((herb) => herb.id),
    summary: { xp, levelBefore: character.level, levelAfter: work.level, timePoints: work.timePoints },
    system: [
      ...(levels > 0 ? [say(texts, 'levelUp', 0, { profession: profession.name, level: after.level, stats })] : []),
      ...revealed.map((herb, index) => say(texts, 'revealed', index, { herb: herb.name })),
      ...work.messages,
    ],
  };
}

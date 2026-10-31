// The narrator's daily and weekly quests (data/quests.json). Days and weeks
// follow the clock of quests.timeZone (Polish time): a day starts at
// midnight, a week at the midnight between Sunday and Monday. A period's
// quests are drawn when it comes, from a seed of the character and the
// period, so a period always gets the same ones: creatures of the newest
// inner region open to the character's class (and of the one before it for
// the day's), never of a place too easy for the character, and, once the Stół rozbiórki stands, its work, and
// once the professions are there, the herbs gathered and the potions
// brewed, each with a reward of gold, a resource or parts. Claimed
// explorations, gatherings and brewings and the table's orders move them
// on; a quest
// done gives its reward when claimed, and all of a period's quests done open
// its chest.

import { knownPotions } from './brewing.js';
import { easyPlace, encountersFor } from './hunt.js';
import { randomItem } from './items.js';
import { knownHerbs, professionState } from './professions.js';
import { createRng } from './rng.js';
import { areasOpened, areaUnlocked } from './unlocks.js';

export const QUEST_PERIODS = ['daily', 'weekly'];

// The zone's wall clock. Intl knows the zone's rules (summer time), so the
// days turn at the zone's midnight all year.
const clocks = new Map();

function zoneClock(ms, timeZone) {
  let clock = clocks.get(timeZone);
  if (!clock) {
    clock = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    clocks.set(timeZone, clock);
  }
  const parts = {};
  for (const { type, value } of clock.formatToParts(ms)) if (type !== 'literal') parts[type] = Number(value);
  return parts;
}

// How far the zone's clock is ahead of UTC at `ms`.
function zoneOffset(ms, timeZone) {
  const { year, month, day, hour, minute, second } = zoneClock(ms, timeZone);
  return Date.UTC(year, month - 1, day, hour, minute, second) - Math.floor(ms / 1000) * 1000;
}

// The moment the zone's clock shows midnight `days` after the day it shows
// at `ms`. The offset is taken near that moment, and again at it, so a
// change of time on that day is on the right side.
function zoneMidnight(ms, timeZone, days) {
  const { year, month, day } = zoneClock(ms, timeZone);
  const wall = Date.UTC(year, month - 1, day + days);
  return wall - zoneOffset(wall - zoneOffset(wall, timeZone), timeZone);
}

// Days since Monday on the zone's clock at `ms`.
function sinceMonday(ms, timeZone) {
  const { year, month, day } = zoneClock(ms, timeZone);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

// The period around `now`: its key (the date it starts on, on the zone's
// clock), its start and its end.
export function questPeriod(periodId, now, content) {
  const { timeZone } = content.quests;
  const weekly = periodId === 'weekly';
  const back = weekly ? sinceMonday(now, timeZone) : 0;
  const startsAt = zoneMidnight(now, timeZone, -back);
  const endsAt = zoneMidnight(now, timeZone, (weekly ? 7 : 1) - back);
  const { year, month, day } = zoneClock(startsAt, timeZone);
  const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { key, startsAt, endsAt };
}

// The newest inner region open to the character's class: its creatures are
// the ones to beat.
export function questArea(character, content) {
  return content.areas
    .filter((area) => areaUnlocked(area, character.classLevel, content))
    .reduce((newest, area) => (area.minLevel > newest.minLevel ? area : newest));
}

// The inner regions whose creatures a period's quests ask for: the newest
// one open to the character's class and, for the daily quests, also the one
// before it (the author: "do zadań dziennych losuj z ostatniej otwartej
// lokacji i jednej przed nią (bo nie muszą być bardzo trudne)"), newest
// first, without those too easy for the character.
function questAreas(periodId, character, content) {
  return content.areas
    .filter((area) => areaUnlocked(area, character.classLevel, content))
    .sort((a, b) => b.minLevel - a.minLevel)
    .slice(0, periodId === 'daily' ? 2 : 1)
    .filter((area) => !easyPlace(character.level, area, content));
}

// How many of each creature a fight there brings on average, among the
// regular encounters at the character's level.
function creaturesPerFight(area, level) {
  const encounters = encountersFor(area, level);
  const total = encounters.reduce((sum, encounter) => sum + encounter.weight, 0);
  const shares = new Map();
  for (const encounter of encounters) {
    for (const monsterId of encounter.monsters) shares.set(monsterId, (shares.get(monsterId) ?? 0) + encounter.weight / total);
  }
  return shares;
}

// The herbs the character's gathering profession knows: those a gathering
// quest can name. The same for the recipes of brewing.
const questHerbs = (character, content) =>
  content.gathering ? knownHerbs(professionState(character.professions, content.gathering.profession).level, content) : [];
const questPotions = (character, content) =>
  content.brewing ? knownPotions(professionState(character.professions, content.brewing.profession).level, content) : [];

// What can be drawn: each kind once for each of its variants (kill: each
// creature that the period's most fights bring at least once on average;
// gather: each herb known; brew: each recipe known), the kind's weight
// shared among them. killAny asks for creatures of any kind, so a place
// of few creatures still fills the period (the author: "Może być potworów
// mniej w lokacji, ale niech się różnią"). A kind
// without this period, or of a module the character does not have yet, is
// left out. No creatures of a place too easy for the character (the
// author: "by ktoś z wyższym levelem nie był wysyłany na niskolevelowe
// potwory"): when its class opens nothing harder, or it has outgrown every
// place, the other kinds remain.
function questOptions(periodId, { character, hasTable, hasProfessions = false, hasCrafting = false, hasSettlement = false }, content) {
  const areas = questAreas(periodId, character, content);
  // Each creature of those places, as often as a fight of its place brings it.
  const perFight = new Map();
  for (const area of areas) for (const [target, share] of creaturesPerFight(area, character.level)) perFight.set(target, Math.max(perFight.get(target) ?? 0, share));
  return content.quests.kinds.flatMap((kind) => {
    if (!kind[periodId] || (kind.table && !hasTable) || (kind.professions && !hasProfessions) || (kind.crafting && !hasCrafting) || (kind.settlement && !hasSettlement)) return [];
    if ((kind.id === 'kill' || kind.id === 'killAny') && areas.length === 0) return [];
    // Regions to open: only for a new character, no more than open within
    // reach of its class level, and fewer as the class grows (`most`).
    const ahead = kind.id === 'unlock' ? areasOpened(character.classLevel, character.classLevel + kind[periodId].reach, content) : 0;
    if (kind.id === 'unlock' && (character.classLevel >= kind.untilClassLevel || ahead === 0)) return [];
    const variants =
      kind.id === 'kill'
        ? [...perFight]
            .filter(([, share]) => share * kind[periodId].fights[1] >= 1)
            .map(([target, share]) => ({ target, perFight: share }))
        : kind.id === 'killAny'
          ? [{ perFight: [...creaturesPerFight(areas[0], character.level).values()].reduce((sum, share) => sum + share, 0) }]
          : kind.id === 'gather'
            ? questHerbs(character, content).map((herb) => ({ target: herb.id }))
            : kind.id === 'brew'
              ? questPotions(character, content).map((potion) => ({ target: potion.id }))
              : kind.id === 'unlock'
                ? [{ most: Math.min(ahead, unlockMost(kind[periodId], character.classLevel)) }]
                : [{}];
    return variants.map((variant) => ({ kind, weight: kind.weight / variants.length, ...variant }));
  });
}

// The most inner regions a period asks to open at a class level: the count
// of the last `most` band the class has reached (quests.json), else no limit.
const unlockMost = (tuning, classLevel) => tuning.most?.findLast((band) => band.fromClassLevel <= classLevel)?.count ?? Infinity;

// How much a quest asks for: for creatures, as many as `fights` fights
// bring on average, and never more than `most`.
function questCount({ kind, perFight, most = Infinity }, periodId, rng) {
  const tuning = kind[periodId];
  if (tuning.fights) return Math.max(1, Math.round(rng.int(...tuning.fights) * perFight));
  const [min, max] = tuning.count;
  const step = tuning.step ?? 1;
  return Math.min(most, min + step * rng.int(0, Math.floor((max - min) / step)));
}

// The band of levels the character is in (levels in quests.json).
export const questLevel = (level, content) => content.quests.levels.findLast((band) => band.fromLevel <= level);

// A quest's reward: gold, a resource or parts, more at a higher level, and
// `factor` times as much for a rarer kind (rewardFactor in quests.json).
function questReward(periodId, level, rng, content, factor = 1) {
  const { rewards } = content.quests;
  const [kind] = rng.weighted(Object.entries(rewards.weights), ([, weight]) => weight);
  const { base, perLevel } = rewards[periodId][kind];
  const spread = rng.float(1 - rewards.spread, 1 + rewards.spread);
  const amount = (share = 1) => Math.max(1, Math.round((base + perLevel * level) * share * spread * factor));
  if (kind === 'gold') return { kind, amount: amount() };
  if (kind === 'resource') {
    const [id, share] = rng.pick(Object.entries(rewards.resources));
    return { kind, id, amount: amount(share) };
  }
  return { kind, id: questLevel(level, content).part, amount: amount() };
}

// A quest of a drawn option, with its count and reward.
const newQuest = (option, periodId, character, rng, content) => ({
  kind: option.kind.id,
  ...(option.target && { target: option.target }),
  count: questCount(option, periodId, rng),
  progress: 0,
  reward: questReward(periodId, character.level, rng, content, option.kind.rewardFactor),
  claimed: false,
});

// A period's quests, drawn from `seed` for the character as it is: no
// option twice, in the order of the kinds.
export function drawQuests(periodId, { character, hasTable, hasProfessions, hasCrafting, hasSettlement, seed }, content) {
  const rng = createRng(seed);
  let options = questOptions(periodId, { character, hasTable, hasProfessions, hasCrafting, hasSettlement }, content);
  const drawn = [];
  while (drawn.length < content.quests.periods[periodId].count && options.length > 0) {
    const option = rng.weighted(options);
    options = options.filter((other) => other !== option);
    drawn.push(option);
  }
  const { kinds } = content.quests;
  return drawn.sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind)).map((option) => newQuest(option, periodId, character, rng, content));
}

// Whether a creature lives in an inner region open to the character's class.
const reachable = (monsterId, character, content) =>
  content.areas.some((area) => areaUnlocked(area, character.classLevel, content) && area.encounters.some((encounter) => encounter.monsters.includes(monsterId)));

// A kept quest that cannot be done any more: a creature's, neither done nor
// claimed, whose creature lives nowhere the character can go. Quests drawn
// before the creatures moved to inner regions of their own (0.0.27) asked
// for such (the author: "kuzynka nawet nie ma dostępu do tych potworów za
// niski poziom klasy").
const lostQuest = (quest, character, content) => quest.kind === 'kill' && !quest.claimed && !questDone(quest) && !reachable(quest.target, character, content);

// A kept period with each lost quest drawn anew in its place, among what the
// character may get now and the period does not ask for yet; the other
// quests stay as they are, with their progress and rewards.
function healedPeriod(period, periodId, { character, hasTable, hasProfessions, hasCrafting, hasSettlement, seed }, content) {
  const lost = (quest) => lostQuest(quest, character, content);
  if (!period.quests.some(lost)) return period;
  const asked = (option) => period.quests.some((quest) => !lost(quest) && quest.kind === option.kind.id && quest.target === option.target);
  let options = questOptions(periodId, { character, hasTable, hasProfessions, hasCrafting, hasSettlement }, content).filter((option) => !asked(option));
  return {
    ...period,
    quests: period.quests.map((quest, index) => {
      if (!lost(quest) || options.length === 0) return quest;
      const rng = createRng(`${seed}:${periodId}:${period.period}:${index}`);
      const option = rng.weighted(options);
      options = options.filter((other) => other !== option);
      return newQuest(option, periodId, character, rng, content);
    }),
  };
}

// Both periods' quests at `now`: those kept while their period lasts (with
// the lost ones drawn anew), new ones once it has passed. `seed` is the
// character's.
export function currentQuests(stored, { character, hasTable, hasProfessions, hasCrafting, hasSettlement, seed }, now, content) {
  return Object.fromEntries(
    QUEST_PERIODS.map((periodId) => {
      const { key } = questPeriod(periodId, now, content);
      const kept = stored?.[periodId];
      if (kept?.period === key) return [periodId, healedPeriod(kept, periodId, { character, hasTable, hasProfessions, hasCrafting, hasSettlement, seed }, content)];
      const quests = drawQuests(periodId, { character, hasTable, hasProfessions, hasCrafting, hasSettlement, seed: `${seed}:${periodId}:${key}` }, content);
      return [periodId, { period: key, quests, chest: false }];
    }),
  );
}

export const questsStale = (stored, now, content) =>
  QUEST_PERIODS.some((periodId) => stored?.[periodId]?.period !== questPeriod(periodId, now, content).key);

// The creatures beaten in an exploration's won fights, by id. People beaten
// in an event's fight (events.js) are no creatures, but a creature met in
// one, as the Błędnica, counts as on the way.
export function huntKills(hunt, content) {
  const kills = {};
  for (const fight of hunt.fights) {
    if (fight.won !== true) continue;
    for (const enemy of fight.enemies) if (!content.eventFoesById[enemy.monsterId]) kills[enemy.monsterId] = (kills[enemy.monsterId] ?? 0) + 1;
  }
  return kills;
}

// What claimed explorations, gatherings, brewings and orders of items and
// the table's orders add: creatures beaten (`kills` by id), `minutes`
// explored, materials `processed`, items `salvaged`, herbs gathered (`herbs`
// by id, all of those found, also those the bag lost), potions brewed
// (`potions` by id, the same way), items `made` in the Warsztat (only
// those that came out), inner regions `opened` by new class levels,
// `orders` delivered in the Osada and the daily quests' `chests` opened
// (one a day at most). A quest stops at its count.
export function addQuestProgress(quests, { kills = {}, minutes = 0, processed = 0, salvaged = 0, herbs = {}, potions = {}, made = 0, opened = 0, orders = 0, chests = 0 }) {
  const total = (counts) => Object.values(counts).reduce((sum, count) => sum + count, 0);
  const gathered = total(herbs);
  const gain = {
    kill: (quest) => kills[quest.target] ?? 0,
    killAny: () => total(kills),
    explore: () => minutes,
    dailies: () => chests,
    unlock: () => opened,
    process: () => processed,
    salvage: () => salvaged,
    gather: (quest) => herbs[quest.target] ?? 0,
    gatherAny: () => gathered,
    brew: (quest) => potions[quest.target] ?? 0,
    brewAny: () => total(potions),
    make: () => made,
    makeAny: () => made,
    orders: () => orders,
  };
  return Object.fromEntries(
    Object.entries(quests).map(([periodId, period]) => [
      periodId,
      {
        ...period,
        quests: period.quests.map((quest) => ({ ...quest, progress: Math.min(quest.count, quest.progress + (gain[quest.kind]?.(quest) ?? 0)) })),
      },
    ]),
  );
}

export const questDone = (quest) => quest.progress >= quest.count;

// The creatures an exploration of an area tracks for the quests ("Trop
// przede wszystkim stwory z zadań"): those the kill quests of both periods
// still ask for and that the area's encounters bring (rollEncounter weighs
// them more).
export function questCreatures(quests, area) {
  const living = new Set([...area.encounters, ...area.tough].flatMap((encounter) => encounter.monsters));
  const wanted = Object.values(quests).flatMap((period) => period.quests.filter((quest) => quest.kind === 'kill' && !questDone(quest)));
  return [...new Set(wanted.map((quest) => quest.target))].filter((id) => living.has(id));
}

// A period's chest opens once all its quests are done, their rewards
// claimed or not.
export const chestReady = (period) => period.quests.length > 0 && period.quests.every(questDone);

export const withClaimed = (quests, periodId, index) => ({
  ...quests,
  [periodId]: { ...quests[periodId], quests: quests[periodId].quests.map((quest, at) => (at === index ? { ...quest, claimed: true } : quest)) },
});

export const withChest = (quests, periodId) => ({ ...quests, [periodId]: { ...quests[periodId], chest: true } });

// The item in the weekly chest: of the character's level, for its class and
// class level and favouring its empty slots, of a rarity drawn by the level's
// band, its affixes named by the creatures of the place the quests are about
// (questArea). Besides explorations in places of its level, this is the one
// way to a later base of a family (the Otoczak from class level 10), whatever
// place the character explores.
export function chestItem({ level, classId, classLevel = 1 }, wornSlots, rng, content) {
  const [rarityId] = rng.weighted(Object.entries(questLevel(level, content).chestRarities), ([, weight]) => weight);
  const area = questArea({ classLevel }, content);
  return randomItem(level, rng, content, { rarityId, filled: new Set(wornSlots), classId, maxClassLevel: classLevel, area });
}

// A noun after a number, in Polish: 1, then 2–4 (but not 12–14), then the rest.
export function countedForm(count, [one, few, many]) {
  if (count === 1) return one;
  const last = count % 10;
  const tens = count % 100;
  return last >= 2 && last <= 4 && (tens < 12 || tens > 14) ? few : many;
}

// A quest's text: its kind's, with the count and the noun to go with it. A
// creature the character has not met yet is "???", as on the list of
// dangers: `met` holds the ids of those met.
export function questText(quest, content, met = null) {
  const kind = content.quests.kinds.find((candidate) => candidate.id === quest.kind);
  const unknown = quest.kind === 'kill' && met && !met.includes(quest.target);
  const forms =
    quest.kind === 'kill' ? content.monstersById[quest.target].counted : quest.kind === 'brew' ? content.potionsById[quest.target].counted : kind.counted;
  return kind.text
    .replace('{count}', String(quest.count))
    .replace('{noun}', unknown ? '???' : countedForm(quest.count, forms))
    .replace('{herb}', quest.kind === 'gather' ? content.herbsById[quest.target].genitive : '');
}

// The quests as the page shows them: each period with its name, its end,
// its quests (`index`: the place to claim it by) and its chest. A quest of a
// kind or a creature no longer in the data is left out.
export function questsView(quests, now, content, met = null) {
  const known = (quest) =>
    content.quests.kinds.some((kind) => kind.id === quest.kind) &&
    (quest.kind !== 'kill' || Boolean(content.monstersById[quest.target])) &&
    (quest.kind !== 'gather' || Boolean(content.herbsById[quest.target])) &&
    (quest.kind !== 'brew' || Boolean(content.potionsById[quest.target]));
  return Object.fromEntries(
    QUEST_PERIODS.map((periodId) => {
      const period = quests[periodId];
      const { name, chest } = content.quests.periods[periodId];
      return [
        periodId,
        {
          name,
          endsAt: questPeriod(periodId, now, content).endsAt,
          quests: period.quests.flatMap((quest, index) =>
            known(quest)
              ? [
                  {
                    index,
                    kind: quest.kind,
                    ...(quest.target && { monsterId: quest.target }),
                    text: questText(quest, content, met),
                    progress: quest.progress,
                    count: quest.count,
                    done: questDone(quest),
                    claimed: quest.claimed,
                    reward: quest.reward,
                  },
                ]
              : [],
          ),
          chest: { ...chest, ready: chestReady(period), opened: period.chest },
        },
      ];
    }),
  );
}

// Górnictwo (data/professions.json: mining and minerals): the character digs
// in the Systemowa Kopalnia, with no fights and no risk, as it gathers herbs
// in the Zagajnik (professions.js): the slider sets the time, the
// profession's level the minerals the System shows and how many of them an
// hour, and the seed saved at the start what is found. It digs all it knows
// at once: the gems, one for each rarity (535 A), and the ores the
// jewellery's settings take (536 A). On the way it strikes veins of gold,
// which give on average a share of the gold an hour of exploring gives at the
// character's level (532 A: half). Minerals take no room in the bag, as
// materials do, and the scrapper buys them (533 A).

import { countList, professionLevelLines, professionProgress } from './professions.js';
import { countEvents, createRng } from './rng.js';
import { say } from './text.js';

// The minerals the System shows at a level of Górnictwo.
export const knownMinerals = (level, content) => content.minerals.filter((mineral) => mineral.level <= level);

// Pieces of a mineral an hour at a level: more with each level, and `week`
// the factor of the week the digging began in (minerals, weeks.js).
export const mineralsPerHour = (mineral, level, content, week = 1) => mineral.perHour * (1 + content.mining.yieldPerLevel * (level - 1)) * week;

// The slider's times: the shortest, then every step up to the longest.
export function miningMinutes(content) {
  const { min, step, max } = content.mining.minutes;
  return Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, index) => min + index * step);
}

// The gold an hour of exploring gives at a character level, as measured
// (veins.explorationGold): straight between two measured levels, and below
// the first or past the last in proportion to the level.
export function explorationGold(level, content) {
  const table = content.mining.veins.explorationGold;
  const [firstLevel, firstGold] = table[0];
  if (level <= firstLevel) return (firstGold * level) / firstLevel;
  for (let index = 1; index < table.length; index += 1) {
    const [toLevel, toGold] = table[index];
    if (level <= toLevel) {
      const [fromLevel, fromGold] = table[index - 1];
      return fromGold + ((toGold - fromGold) * (level - fromLevel)) / (toLevel - fromLevel);
    }
  }
  const [lastLevel, lastGold] = table.at(-1);
  return (lastGold * level) / lastLevel;
}

// The gold of the veins in an hour of digging at a character level.
export const veinGoldPerHour = (level, content) => content.mining.veins.share * explorationGold(level, content);

// What a digging of `minutes` should bring: of each mineral known, the
// expected count with the lowest and highest the spread allows, and the
// veins of gold with their gold, at the character's level.
export function expectedMining(minutes, level, characterLevel, content) {
  const { spread, veins } = content.mining;
  const hours = minutes / 60;
  return {
    minerals: Object.fromEntries(
      knownMinerals(level, content).map((mineral) => {
        const expected = mineralsPerHour(mineral, level, content) * hours;
        return [mineral.id, { expected, low: Math.floor(expected * (1 - spread)), high: Math.ceil(expected * (1 + spread)) }];
      }),
    ),
    veins: veins.perHour * hours,
    gold: veinGoldPerHour(characterLevel, content) * hours,
  };
}

// What a digging finds, from the seed: of each mineral known its expected
// count ± the spread, made whole, and at least one piece of the commonest,
// as a gathering always brings a herb; then the veins of gold, as many as
// come on average, each with its share of the hour's gold ± its spread.
// `week`: the factor of the week the digging began in (minerals, weeks.js),
// for the minerals, not the veins' gold.
export function mineMinerals({ minutes, level, characterLevel, seed, week = 1 }, content) {
  const rng = createRng(seed);
  const { spread, veins } = content.mining;
  const known = knownMinerals(level, content);
  const hours = minutes / 60;
  const found = {};
  for (const mineral of known) {
    const count = countEvents(mineralsPerHour(mineral, level, content, week) * hours * rng.float(1 - spread, 1 + spread), rng);
    if (count > 0) found[mineral.id] = count;
  }
  if (Object.keys(found).length === 0 && known.length > 0) {
    found[known.reduce((best, mineral) => (mineral.perHour > best.perHour ? mineral : best)).id] = 1;
  }
  const count = countEvents(veins.perHour * hours, rng);
  const each = veinGoldPerHour(characterLevel, content) / veins.perHour;
  let gold = 0;
  for (let index = 0; index < count; index += 1) gold += Math.max(1, Math.round(each * rng.float(1 - veins.spread, 1 + veins.spread)));
  return { found, veins: count, gold };
}

// The report of a digging: a line about the mine from the seed, the minerals
// found, the veins of gold with their gold, the profession's new levels with
// their stats and the minerals the System revealed with them, and the
// character's XP.
export function miningReport({ minutes, startedAt, endsAt, seed, mined, before, after, character, xp, work }, content) {
  const { mining } = content;
  const texts = mining.texts;
  const profession = content.professionsById[mining.profession];
  const revealed = content.minerals.filter((mineral) => mineral.level > before.level && mineral.level <= after.level);
  return {
    kind: 'minerals',
    placeName: mining.place.name,
    minutes,
    startedAt,
    endsAt,
    line: say(texts, 'report', createRng(`${seed}:line`).int(0, texts.report.length - 1)),
    minerals: Object.entries(mined.found).map(([id, count]) => ({ id, name: content.mineralsById[id].name, count })),
    found: say(texts, 'found', 0, { minerals: countList(mined.found, content.mineralsById) }),
    veins: mined.veins,
    gold: mined.gold,
    veinsText: mined.veins > 0 ? say(texts, 'veins', 0, { count: mined.veins, gold: mined.gold }) : say(texts, 'noVeins', 0),
    profession: professionProgress(profession, before, after, minutes),
    revealed: revealed.map((mineral) => mineral.id),
    summary: { xp, levelBefore: character.level, levelAfter: work.level, timePoints: work.timePoints },
    system: [
      ...professionLevelLines(profession, before, after, content),
      ...revealed.map((mineral, index) => say(texts, mineral.kind === 'ore' ? 'revealedOre' : 'revealed', index, { mineral: mineral.name })),
      ...work.messages,
    ],
  };
}

// The professions as the page draws them, and the herbs in the bag. Kept
// apart from professions.js, which needs characters.js, so that
// characters.js can draw the view without a loop between the two.

import {
  gatheringMinutes,
  herbSlots,
  herbsPerHour,
  isUnlocked,
  professionStatBonus,
  professionState,
  professionXpToNext,
} from '../engine/index.js';
import { content } from './content.js';
import { professionsOn } from './features.js';
import { say } from '../engine/text.js';

// The herbs the character carries, by id, as the row keeps them.
export const herbsOf = (row) => JSON.parse(row.herbs ?? '{}');

// The herbs in the bag, one entry for each herb, with the scrapper's price of
// one at the camp's Skup złomu (sellBonus). The page splits them into stacks.
export function bagHerbs(row, sellBonus) {
  const herbs = herbsOf(row);
  return content.herbs
    .filter((herb) => (herbs[herb.id] ?? 0) > 0)
    .map((herb) => ({
      id: herb.id,
      name: herb.name,
      description: herb.description,
      count: herbs[herb.id],
      price: herb.price * (1 + sellBonus),
    }));
}

// The Profesje tab: each profession with its level and the stats it gave,
// and the gathering of Zielarstwo: its place, the slider, how many herbs at
// once, and each herb, known or hidden by the System. Null while the
// professions are hidden in this deployment or not unlocked yet.
export function professionsView(row) {
  if (!professionsOn() || !isUnlocked('professions', row.level, content)) return null;
  const professions = JSON.parse(row.professions ?? '{}');
  const herbs = herbsOf(row);
  const { gathering } = content;
  const gatherer = professionState(professions, gathering.profession);
  const hidden = content.professionTexts.hidden;
  return {
    list: content.professions.map((profession) => {
      const { level, xp } = professionState(professions, profession.id);
      return {
        id: profession.id,
        name: profession.name,
        kind: profession.kind,
        description: profession.description,
        soon: Boolean(profession.soon),
        level,
        xp,
        xpToNext: level < profession.maxLevel ? professionXpToNext(profession, level) : 0,
        maxLevel: profession.maxLevel,
        stats: profession.stats.map((stat) => ({ id: stat, name: content.statsById[stat].name, bonus: professionStatBonus(profession, level) })),
      };
    }),
    gathering: {
      professionId: gathering.profession,
      place: gathering.place,
      minutes: gatheringMinutes(content),
      spread: gathering.spread,
      // How many herbs at once now, and from which levels more.
      slots: herbSlots(gatherer.level, content),
      slotLevels: gathering.slots,
      stack: content.professionRules.stack,
      herbs: content.herbs.map((herb) =>
        herb.level <= gatherer.level
          ? {
              id: herb.id,
              name: herb.name,
              description: herb.description,
              level: herb.level,
              perHour: herbsPerHour(herb, gatherer.level, content),
              count: herbs[herb.id] ?? 0,
            }
          : { id: herb.id, level: herb.level, hidden: true, hint: say({ hidden }, 'hidden', 0, { level: herb.level }) },
      ),
    },
  };
}

// The Wieże Systemu (data/towers.json), the groundwork, not in the game yet
// (DECISIONS.md, "Wieże i Gildia: podwaliny"; the author: "Wieże Systemu
// które będzie robić się niezależnie od wypraw, profesji. Bedzie podział na
// Wieże Solo i w Tercecie"). A tower is a climb, floor after floor: floor f
// holds the creatures of one inner region, in order from the first one and
// round again after the last, at level f, so the climb leads through the
// creatures of every land at the character's level (the author: "Pomoże to
// uzupełniać zaległe Bestiariusze po Ewolucji Klasy by się nie cofać").
// Every eliteEvery floor waits the region's elite, and others now and then
// (eliteChance; "Elity mogą częściej"), every championEvery floor its
// champion (an elite where the region has none). The highest floor open is
// the character's level, a party's its lowest member's ("Maksymalny
// odblokowany stopień Wieży bedzie na poziomie najniższego w Drużynie").
// Pure: the seed is the server's.

import { encountersFor } from './hunt.js';
import { createRng } from './rng.js';

// The highest floor open to characters of these levels.
export const towerTop = (levels) => Math.max(1, Math.min(...levels));

// The inner region whose creatures live on floor `floor`.
export function towerArea(floor, content) {
  const { areas } = content;
  return areas[(floor - 1) % areas.length];
}

// What waits on floor `floor` of a climb with `seed`: the region, the level
// and the encounter, as the hunt's encounters are (hunt.js), regular,
// elite or champion. A regular one is of those the floor's level lets come
// (the pairs at the end of the first land from level 5, encountersFor).
export function towerFloor(floor, seed, content) {
  const { floors } = content.towers;
  const area = towerArea(floor, content);
  const rng = createRng(`${seed}:floor:${floor}`);
  const champion = floor % floors.championEvery === 0 && area.champion;
  const elite = !champion && (floor % floors.eliteEvery === 0 || floor % floors.championEvery === 0 || rng.chance(floors.eliteChance)) && area.elite;
  if (champion) return { floor, level: floor, areaId: area.id, encounter: { elite: false, champion: true, members: [{ monsterId: area.champion, level: floor }] } };
  if (elite) return { floor, level: floor, areaId: area.id, encounter: { elite: true, members: [{ monsterId: area.elite, level: floor }] } };
  const open = encountersFor(area, floor);
  const group = rng.weighted(open.length > 0 ? open : area.encounters, (encounter) => encounter.weight ?? 1);
  return { floor, level: floor, areaId: area.id, encounter: { elite: false, members: group.monsters.map((monsterId) => ({ monsterId, level: floor })) } };
}

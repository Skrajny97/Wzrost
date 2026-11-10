// The Wieże Systemu (data/towers.json; DECISIONS.md, "Wieże i Gildia:
// podwaliny" and "Wieże Systemu i Gildia"; the author: "Wieże Systemu które
// będzie robić się niezależnie od wypraw, profesji. Bedzie podział na Wieże
// Solo i w Tercecie"). A tower is a climb, floor after floor: floor f
// holds the creatures of one inner region, in order from the first one and
// round again after the last, at the floor's level: floor 1 at
// firstFloorLevel, each next one a level higher (the author, 7.11.2026:
// "Wieże to tak jakby 1 poziom był 50ty w zamyśle"), so the climb leads
// through the creatures of every land at the character's level (the
// author: "Pomoże to uzupełniać zaległe Bestiariusze po Ewolucji Klasy by
// się nie cofać"). The System makes them stronger by `strength` (the
// author, 744: "nie o 50% więcej [...] a nawet 100% więcej").
// Every eliteEvery floor waits the region's elite, but only in every
// eliteLapEvery lap of the regions (the author: 484 A), so in the laps
// between those floors are their region's usual ones and every creature
// comes in the towers; on the usual floors an elite now and then
// (eliteChance; "Elity mogą częściej"), and every championEvery floor, in
// every lap, its champion (an elite where the region has none). The
// champion leaves its trophy only at the first win of its floor in a tower
// (483 A, the server knows). The floors open one by one as they are won,
// whatever the character's level (the author, 7.11.2026: "wieże się
// odblokowują niezależnie od poziomu mozna isc w gore bez poziomu
// odpowiedniego inaczej niż Portale").
// Pure: the seed is the server's.

import { combatantView, playerCombatant } from './combatant.js';
import { simulateFight } from './combat.js';
import { companionCombatant } from './companions.js';
import { addCounts, materialDrops, materialsText, stackKey } from './crafting.js';
import { evolutionOf } from './evolutions.js';
import { championItemRarity, encounterCombatants, encountersFor, expectedExploration, explorationPace } from './hunt.js';
import { itemName, randomItem } from './items.js';
import { lowLevelMultiplier, monsterXp } from './progression.js';
import { createRng } from './rng.js';
import { say, word } from './text.js';
import { weekChance, weekFactor, weekFighter } from './weeks.js';

// The level of floor `floor`: floor 1 at firstFloorLevel, each next one a
// level higher.
export const towerLevel = (floor, content) => floor + content.towers.firstFloorLevel - 1;

// The highest floor open in a tower: the one above the highest won there
// (`best`), whatever the character's level.
export const towerTop = (best) => Math.max(0, best ?? 0) + 1;

// The inner region whose creatures live on floor `floor`.
export function towerArea(floor, content) {
  const { areas } = content;
  return areas[(floor - 1) % areas.length];
}

// Whether floor `floor` has its region's elite for certain: every
// eliteEvery floor of every eliteLapEvery lap of the inner regions, from
// the first lap (floors 1–20 with 20 regions), so in the laps between,
// those floors are their region's usual ones (the author: "stałe elity co
// 5. piętro tylko w co drugim okrążeniu regionów", 484 A).
export function towerEliteFloor(floor, content) {
  const { floors } = content.towers;
  const lap = Math.floor((floor - 1) / content.areas.length);
  return floor % floors.eliteEvery === 0 && lap % floors.eliteLapEvery === 0;
}

// What waits on floor `floor` of a climb with `seed`: the region, the level
// and the encounter, as the hunt's encounters are (hunt.js), regular,
// elite or champion. A regular one is of those the floor's level lets come
// (the pairs at the end of the first land from level 5, encountersFor).
export function towerFloor(floor, seed, content) {
  const { floors } = content.towers;
  const area = towerArea(floor, content);
  const level = towerLevel(floor, content);
  const rng = createRng(`${seed}:floor:${floor}`);
  const champion = floor % floors.championEvery === 0 && area.champion;
  const elite = !champion && (towerEliteFloor(floor, content) || floor % floors.championEvery === 0 || rng.chance(floors.eliteChance)) && area.elite;
  if (champion) return { floor, level, areaId: area.id, encounter: { elite: false, champion: true, members: [{ monsterId: area.champion, level }] } };
  if (elite) return { floor, level, areaId: area.id, encounter: { elite: true, members: [{ monsterId: area.elite, level }] } };
  const open = encountersFor(area, level);
  const group = rng.weighted(open.length > 0 ? open : area.encounters, (encounter) => encounter.weight ?? 1);
  return { floor, level, areaId: area.id, encounter: { elite: false, members: group.monsters.map((monsterId) => ({ monsterId, level })) } };
}

// The gold a win on floor `floor` pays: what a whole exploration of
// rewardMinutes brings on average at the floor's level in its region,
// loot.goldMultiplier times (the author: "zmodyfikować Wieże by dawały
// więcej niż Portale, o wiele więcej").
export function towerGold(floor, content) {
  const { rewardMinutes, loot } = content.towers;
  return Math.round(expectedExploration(towerArea(floor, content), towerLevel(floor, content), rewardMinutes, content).gold * loot.goldMultiplier);
}

// The rarity weights of a tower material on floor `floor`: those of the
// highest loot.materials.rarities step its level has reached.
export function towerMaterialRarities(floor, content) {
  const steps = content.towers.loot.materials.rarities;
  const level = towerLevel(floor, content);
  return (steps.filter((step) => step.fromLevel <= level).at(-1) ?? steps[0]).rarities;
}

// The materials a win on floor `floor` brings for certain (the author:
// "rzadkie łupy i materiały szczególnie legendarne i mityczne na
// odpowiednich poziomach"): loot.materials.pieces pieces, each of one of
// the ordinary creatures fought (on a champion's floor of the region's
// creatures the floor's level lets come), its rarity drawn by the floor's
// level (towerMaterialRarities) and never below its species' own. `more`:
// the share more of the Tropiciel's trait (tracker), a part of a piece by
// chance.
export function towerMaterials(floor, enemies, rng, content, more = 1) {
  const ordinary = (ids) => [...new Set(ids)].filter((id) => content.materialsByMonster[id] && !content.monstersById[id]?.champion);
  let creatures = ordinary(enemies.map((enemy) => enemy.monsterId));
  if (creatures.length === 0) {
    const area = towerArea(floor, content);
    const open = encountersFor(area, towerLevel(floor, content));
    creatures = ordinary((open.length > 0 ? open : area.encounters).flatMap((encounter) => encounter.monsters));
  }
  const found = {};
  if (creatures.length === 0) return found;
  const index = (id) => content.rarities.findIndex((rarity) => rarity.id === id);
  const weights = Object.entries(towerMaterialRarities(floor, content));
  const pieces = content.towers.loot.materials.pieces * more;
  const count = Math.floor(pieces) + (rng.chance(pieces - Math.floor(pieces)) ? 1 : 0);
  for (let i = 0; i < count; i++) {
    const material = content.materialsByMonster[creatures[rng.int(0, creatures.length - 1)]];
    const [drawn] = rng.weighted(weights, ([, weight]) => weight);
    const key = stackKey(material.id, index(drawn) > index(material.rarity) ? drawn : material.rarity);
    found[key] = (found[key] ?? 0) + 1;
  }
  return found;
}

// One entry: a fight on floor `floor` (the author: "wspinaczka nie zajmuje
// postaci: kilka wejść dziennie, wynik od razu"), the character at full HP
// with no potions, beside it in the Wieża Drużyn the other players of its
// Drużyna as they are (`partners`, as in parties.js) and its companions,
// in the floor's region (its trait counts). A win pays far more than a
// portal (the author: "zmodyfikować Wieże by dawały więcej niż Portale, o
// wiele więcej - rzadkie łupy i materiały szczególnie legendarne i
// mityczne na odpowiednich poziomach"): the XP of one fight of an
// exploration of rewardMinutes at the floor's level, the elite and the
// champion as a regular creature (the companions and the other players
// take their shares of it as on an exploration), the gold of towerGold,
// the rare materials of towerMaterials and, by loot.itemChance, an item of
// the character's class it can wear, of the floor's level and a
// champion's rarity. A champion leaves its trophy (its material) only at
// the first win of its floor in this tower (`championTrophy`, the server
// knows; the author: 483 A), and then for certain, else none. A win of a
// chestEvery floor the first time in this tower (`chest`, the server
// knows) brings the tower's chest too: one more such item. Returns a hunt
// of one fight, for applyHunt and huntReport, with `tower`. `week`: the
// week of the year of the entry (weeks.js), or null: its share more (or
// less) of the win's XP and gold, of the chance of the loot's item, of the
// materials and of the players' stats in the fight.
export function towerFight({ character, equipped, name, floor, seed, partners = [], companions = [], trophies = {}, chest = false, championTrophy = false, week = null }, content) {
  const plan = towerFloor(floor, seed, content);
  const area = content.areasById[plan.areaId];
  const rng = createRng(`${seed}:fight`);
  const tuning = content.balance.hunt;
  const { texts } = content.towers;
  const pace = explorationPace(content.towers.rewardMinutes, content);
  const lengthed = pace.timeFactor * (1 + pace.lengthBonus);
  const partyXp = 1 - companions.length * content.settlement.companions.xpCost - partners.length * content.balance.parties.xpCost;
  const tracker = evolutionOf(character, content)?.trait;
  const moreMaterials = (tracker?.kind === 'tracker' ? 1 + tracker.params.materials : 1) * weekFactor(week, 'materials');
  const player = playerCombatant({ character: weekFighter(character, week), equipped, name, area }, content);
  const allies = [
    { ...player, ...(Object.keys(trophies).length > 0 && { trophies }) },
    ...partners.map((partner, index) => playerCombatant({ character: weekFighter(partner.character, week), equipped: partner.equipped, name: partner.name, area, id: `p${index + 1}` }, content)),
    ...companions.map((companion, index) => companionCombatant(companion, { area, id: `a${index + 1}` }, content)),
  ];
  // Alone on a floor (the Wieża Solo), the monsters have only a share of the
  // late and end game's growth, as no companion helps (the author: 438.3 A).
  const alone = partners.length === 0 && companions.length === 0;
  // The System's strength on top, in both towers (744), as many times over
  // as there are fighters on the character's side: in the Wieża Drużyn three
  // players or companions face creatures three times as strong as the Wieża
  // Solo's (the author, 7.11.2026: "drużynowych chyba nie ruszałeś bo dalej
  // są banalnie łatwe").
  const [damage, hp] = content.towers.strength;
  const strength = [damage * allies.length, hp * allies.length];
  const enemies = encounterCombatants(plan.encounter, content, { growth: alone ? content.balance.monsters.soloGrowth : 1, strength });
  const fight = simulateFight({ allies, enemies, rng, content, record: true, trait: area.trait });
  const won = fight.won === true;
  const hpAfter = Math.max(0, fight.units.find((unit) => unit.id === player.id).hp);

  let xp = 0;
  let gold = 0;
  let materials = {};
  const items = [];
  let lootItem = null;
  if (won) {
    let fightXp = 0;
    for (const enemy of enemies) {
      const monster = content.monstersById[enemy.monsterId];
      fightXp += monsterXp({ ...monster, elite: false, champion: false }, enemy.level, content) * enemy.groupFactor * lowLevelMultiplier(character.level, enemy.level, content);
      // A champion's trophy, its own material (483 A).
      if (monster.champion) materials = addCounts(materials, materialDrops(enemy.monsterId, enemy.level, 1, rng, content, championTrophy));
    }
    xp = Math.round(fightXp * (1 + tuning.soloXpBonus) * lengthed * partyXp * weekFactor(week, 'xp'));
    // The tower's loot (towerGold, towerMaterials), far above a portal's.
    gold = Math.round(towerGold(floor, content) * weekFactor(week, 'gold'));
    materials = addCounts(materials, towerMaterials(floor, enemies, rng, content, moreMaterials));
    const classItem = () => randomItem(plan.level, rng, content, { classId: character.classId, maxClassLevel: character.classLevel, rarityId: championItemRarity(plan.level, rng, content), area });
    // The loot's item drawn first, so the chest changes nothing else.
    const lucky = rng.chance(weekChance(content.towers.loot.itemChance, week, 'items'));
    if (chest) items.push(classItem());
    if (lucky) {
      lootItem = classItem();
      items.push(lootItem);
    }
  }

  const enemyList = enemies.map((enemy) => word(content, '{name} (poz. {level})', { name: enemy.name, level: enemy.level })).join(', ');
  const start = plan.encounter.champion ? 'championStart' : plan.encounter.elite ? 'eliteStart' : 'fightStart';
  // The towers' own words for the start, not the forest's and the road's.
  const lines = [say(texts, start, floor, { enemies: enemyList })];
  if (won) {
    lines.push(say(content.texts, 'victory', floor), word(content, '+{xp} XP, +{gold} złota.', { xp, gold }));
    if (Object.keys(materials).length > 0) lines.push(say(content.texts, 'materials', floor, { materials: materialsText(materials, content) }));
    for (const item of items) lines.push(say(texts, item === lootItem ? 'loot' : 'chest', floor, { item: itemName(item, content) }));
  } else {
    lines.push(say(texts, 'defeat', floor, { target: player.name }));
  }
  const summary = {
    index: 0,
    t: 0,
    elite: plan.encounter.elite,
    champion: plan.encounter.champion ?? false,
    tough: false,
    enemies: enemies.map((enemy) => ({ name: enemy.name, level: enemy.level, monsterId: enemy.monsterId })),
    won: fight.won,
    hpBefore: player.maxHp,
    hpAfter,
    xp,
    gold,
    materials,
    chests: items.map((_, index) => index),
    recovered: 0,
    allies: allies.map((unit) => combatantView(unit, enemies[0].level, content)),
    enemiesView: enemies.map((enemy) => combatantView(enemy, player.level, content)),
    events: fight.events,
  };
  return {
    areaId: area.id,
    minutes: 0,
    // A lost floor costs no XP: the System only leads the character out.
    result: won ? 'success' : 'escaped',
    xp,
    gold,
    resources: {},
    materials,
    timePoints: 0,
    items,
    hpStart: player.maxHp,
    hpEnd: hpAfter,
    maxHp: player.maxHp,
    fights: [summary],
    entries: [{ t: 0, type: 'fight', fight: 0, text: lines.join(' ') }],
    keyFight: { index: 0 },
    potionsUsed: {},
    buffFights: {},
    // The week of the entry, for the report's line (weeks.js).
    ...(week && { week }),
    tower: {
      floor,
      level: plan.level,
      won,
      elite: plan.encounter.elite,
      champion: plan.encounter.champion ?? false,
      chest: won && chest,
      lootItem: lootItem !== null,
      text: say(texts, won ? 'won' : 'lost', floor, { floor }),
    },
  };
}

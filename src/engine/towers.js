// The Wieże Systemu (data/towers.json; DECISIONS.md, "Wieże i Gildia:
// podwaliny" and "Wieże Systemu i Gildia"; the author: "Wieże Systemu które
// będzie robić się niezależnie od wypraw, profesji. Bedzie podział na Wieże
// Solo i w Tercecie"). A tower is a climb, floor after floor: floor f
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

import { combatantView, playerCombatant } from './combatant.js';
import { simulateFight } from './combat.js';
import { companionCombatant } from './companions.js';
import { addCounts, materialDrops, materialsText } from './crafting.js';
import { evolutionOf } from './evolutions.js';
import { championItemRarity, encounterCombatants, encountersFor, explorationPace } from './hunt.js';
import { itemName, randomItem } from './items.js';
import { lowLevelMultiplier, monsterXp } from './progression.js';
import { createRng } from './rng.js';
import { say } from './text.js';

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

// One entry: a fight on floor `floor` (the author: "wspinaczka nie zajmuje
// postaci: kilka wejść dziennie, wynik od razu"), the character at full HP
// with no potions, beside it in the Wieża Drużyn the other players of its
// Drużyna as they are (`partners`, as in parties.js) and its companions,
// in the floor's region (its trait counts). A win pays as one fight of an
// exploration of rewardMinutes at the floor's level: XP, gold and the
// creatures' materials, the elite and the champion as a regular creature
// (no multipliers of the explorations, so the entries are no way to farm
// them), and the companions and the other players take their shares of
// the XP as on an exploration. A win of a chestEvery floor the first time
// in this tower (`chest`, the server knows) brings the tower's chest: an
// item of the character's class it can wear, of the floor's level and a
// champion's rarity. Returns a hunt of one fight, for applyHunt and
// huntReport, with `tower`.
export function towerFight({ character, equipped, name, floor, seed, partners = [], companions = [], trophies = {}, chest = false }, content) {
  const plan = towerFloor(floor, seed, content);
  const area = content.areasById[plan.areaId];
  const rng = createRng(`${seed}:fight`);
  const tuning = content.balance.hunt;
  const rewards = content.balance.rewards;
  const { texts } = content.towers;
  const pace = explorationPace(content.towers.rewardMinutes, content);
  const lengthed = pace.timeFactor * (1 + pace.lengthBonus);
  const partyXp = 1 - companions.length * content.settlement.companions.xpCost - partners.length * content.balance.parties.xpCost;
  const tracker = evolutionOf(character, content)?.trait;
  const moreMaterials = tracker?.kind === 'tracker' ? 1 + tracker.params.materials : 1;
  const player = playerCombatant({ character, equipped, name, area }, content);
  const allies = [
    { ...player, ...(Object.keys(trophies).length > 0 && { trophies }) },
    ...partners.map((partner, index) => playerCombatant({ character: partner.character, equipped: partner.equipped, name: partner.name, area, id: `p${index + 1}` }, content)),
    ...companions.map((companion, index) => companionCombatant(companion, { area, id: `a${index + 1}` }, content)),
  ];
  // Alone on a floor (the Wieża Solo), the monsters have only a share of the
  // late and end game's growth, as no companion helps (the author: 438.3 A).
  const alone = partners.length === 0 && companions.length === 0;
  const enemies = encounterCombatants(plan.encounter, content, { growth: alone ? content.balance.monsters.soloGrowth : 1 });
  const fight = simulateFight({ allies, enemies, rng, content, record: true, trait: area.trait });
  const won = fight.won === true;
  const hpAfter = Math.max(0, fight.units.find((unit) => unit.id === player.id).hp);

  let xp = 0;
  let gold = 0;
  let materials = {};
  const items = [];
  if (won) {
    let fightXp = 0;
    let fightGold = 0;
    for (const enemy of enemies) {
      const monster = content.monstersById[enemy.monsterId];
      fightXp += monsterXp({ ...monster, elite: false, champion: false }, enemy.level, content) * enemy.groupFactor * lowLevelMultiplier(character.level, enemy.level, content);
      fightGold += rewards.goldPerLevel * enemy.level * monster.reward.gold * rng.float(0.5, 1.5) * enemy.groupFactor * lengthed;
      materials = addCounts(materials, materialDrops(enemy.monsterId, enemy.level, enemy.groupFactor * pace.timeFactor * moreMaterials, rng, content));
    }
    xp = Math.round(fightXp * (1 + tuning.soloXpBonus) * lengthed * partyXp);
    gold = Math.round(fightGold);
    if (chest) {
      const rarityId = championItemRarity(floor, rng, content);
      items.push(randomItem(floor, rng, content, { classId: character.classId, maxClassLevel: character.classLevel, rarityId, area }));
    }
  }

  const enemyList = enemies.map((enemy) => `${enemy.name} (poz. ${enemy.level})`).join(', ');
  const start = plan.encounter.champion ? 'championStart' : plan.encounter.elite ? 'eliteStart' : 'fightStart';
  // The towers' own words for the start, not the forest's and the road's.
  const lines = [say(texts, start, floor, { enemies: enemyList })];
  if (won) {
    lines.push(say(content.texts, 'victory', floor), `+${xp} XP, +${gold} złota.`);
    if (Object.keys(materials).length > 0) lines.push(say(content.texts, 'materials', floor, { materials: materialsText(materials, content) }));
    for (const item of items) lines.push(say(texts, 'chest', floor, { item: itemName(item, content) }));
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
    tower: { floor, level: plan.level, won, elite: plan.encounter.elite, champion: plan.encounter.champion ?? false, text: say(texts, won ? 'won' : 'lost', floor, { floor }) },
  };
}

// The Portale Systemu (data/portals.json; DECISIONS.md, "Portale Systemu";
// the author: "coś bardziej natychmiastowego trochę jak Wieże ale prawie od
// samego początku […] pokonujesz kolejne stopnie", 731–735, and then "Tu
// pasuje wpuszczenie Systemu. Portal Złota, Portal Drewna, Portal Kamienia,
// Portal Rudy, Portal Materiałów i Portal Części"). Each portal pays only
// its own loot: gold, a camp resource, creatures' materials or crafting
// parts ("Odpowiednie Portale nie będą też dawać niczego poza danym
// zasobem"). Stage s holds the ordinary creatures of the inner region whose
// levels hold s, as the land of those levels has them, at level s, with no
// elite or champion ("Portale też nie będą posiadać elit ani czempionów"),
// so the higher, the harder, and its creatures stronger than an
// exploration's ("Walka jedna ale z trudniejszymi stworami niż w
// Eksploracji"). The character fights for the next stage as often as it
// likes ("nieograniczone co do ilości wejść. Ograniczeniem będzie
// trudność"), up to its level and to maxStage ("Na start 100 poziomów"),
// with its companions if it takes them ("Możliwość zabrania towarzyszy,
// ale w tym przypadku - nie drużyn"), and its first win there pays
// firstWinMultiplier times a stage's worth; a stage won is swept, its loot
// at once with no fight, a few times a day (the server counts them).
// Nothing else comes out of a portal (no XP, items or quests), so an entry
// may come during an exploration. Pure: the seed is the server's.

import { combatantView, playerCombatant } from './combatant.js';
import { simulateFight } from './combat.js';
import { companionCombatant } from './companions.js';
import { materialsText, raisedRarity, rarityUpChances, stackKey } from './crafting.js';
import { encounterCombatants, encountersFor, expectedExploration } from './hunt.js';
import { createRng } from './rng.js';
import { nameInText, say, word } from './text.js';

export const portalById = (id, content) => content.portals.portals.find((portal) => portal.id === id) ?? null;

// The stage a portal's next fight is for: the one above the highest won,
// or null while that is above the character's level or the last stage.
export const portalNext = (best, level, content) => (best + 1 <= Math.min(level, content.portals.maxStage) ? best + 1 : null);

// The inner region of stage `stage`: the one whose levels hold it, past the
// last land its last place.
export function portalArea(stage, content) {
  const { areas } = content;
  return areas.find((area) => area.minLevel <= stage && stage <= area.maxLevel) ?? areas.reduce((last, area) => (area.maxLevel > last.maxLevel ? area : last));
}

// What lootMinutes of an exploration at the stage's level in its region
// bring on average (the author: "Czyszczenie i pierwsza walka na danym
// stopniu powinna gwarantować zasób o podobnej wielkości co około 45 minut
// wyprawy na tym poziomie"), as hunt.js pays them: the gold of the fights
// and of the finds, the camp's resources gathered and found (all kinds
// together), the materials the creatures leave, and the parts the finds'
// chests give when taken apart (salvageYield).
export const portalExpected = (stage, content) => expectedExploration(portalArea(stage, content), stage, content.portals.lootMinutes, content);

// How much a portal pays on `stage`: its part of portalExpected, in whole
// pieces, at least one, firstWinMultiplier times as much at the stage's
// first win.
export function portalAmount(portal, stage, first, content) {
  const expected = portalExpected(stage, content);
  const value = { gold: expected.gold, resource: expected.resources, material: expected.materials, part: expected.parts }[portal.loot];
  return Math.max(1, Math.round(value * (first ? content.portals.firstWinMultiplier : 1)));
}

// The ordinary creatures of a stage's region that its level lets come
// (encountersFor), whose materials the Portal Materiałów pays.
function stageCreatures(area, stage, content) {
  const open = encountersFor(area, stage);
  const ids = [...new Set((open.length > 0 ? open : area.encounters).flatMap((encounter) => encounter.monsters))];
  return ids.filter((id) => content.materialsByMonster[id]);
}

// A win's loot in a portal: { gold, resources, materials, parts }. Gold's
// portal pays its amount in gold, a resource's in pieces of the resource;
// the Portal Materiałów pays pieces of the materials of the stage's
// ordinary creatures, the Portal Części pieces of its part; a material or a
// part, piece by piece, is now and then rarer, as the explorations' finds
// at the stage's level (rarityUpChances).
export function portalLoot(portal, stage, first, rng, content) {
  const pieces = portalAmount(portal, stage, first, content);
  const loot = { gold: 0, resources: {}, materials: {}, parts: {} };
  if (portal.loot === 'gold') return { ...loot, gold: pieces };
  if (portal.loot === 'resource') return { ...loot, resources: { [portal.resource]: pieces } };
  const chances = rarityUpChances(stage, content);
  const raise = (rarityId) => {
    const roll = rng.next();
    return raisedRarity(rarityId, chances.filter((chance) => roll < chance).length, content);
  };
  if (portal.loot === 'material') {
    const creatures = stageCreatures(portalArea(stage, content), stage, content);
    for (let i = 0; i < pieces && creatures.length > 0; i++) {
      const material = content.materialsByMonster[creatures[rng.int(0, creatures.length - 1)]];
      const key = stackKey(material.id, raise(material.rarity));
      loot.materials[key] = (loot.materials[key] ?? 0) + 1;
    }
    return loot;
  }
  const base = content.partsById[portal.part];
  for (let i = 0; i < pieces; i++) {
    const id = content.partsByRarity[raise(base.rarity)]?.id ?? base.id;
    loot.parts[id] = (loot.parts[id] ?? 0) + 1;
  }
  return loot;
}

// The loot in a sentence: "30 złota", "drewno +90", "skóra wilka ×2",
// "ścinki ×2".
export function portalLootText(loot, content) {
  const parts = [];
  if (loot.gold > 0) parts.push(word(content, '{gold} złota', { gold: loot.gold }));
  for (const [id, count] of Object.entries(loot.resources)) parts.push(`${nameInText(content.resourcesById[id].name, content)} +${count}`);
  if (Object.keys(loot.materials).length > 0) parts.push(materialsText(loot.materials, content));
  for (const [id, count] of Object.entries(loot.parts)) {
    const name = nameInText(content.partsById[id].name, content);
    parts.push(count > 1 ? `${name} ×${count}` : name);
  }
  return parts.join(', ');
}

// What waits on stage `stage` of an entry with `seed`: the region, the
// level and the encounter, a group of ordinary creatures the stage's level
// lets come (encountersFor), never an elite or a champion.
export function portalStage(stage, seed, content) {
  const area = portalArea(stage, content);
  const rng = createRng(`${seed}:stage:${stage}`);
  const open = encountersFor(area, stage);
  const group = rng.weighted(open.length > 0 ? open : area.encounters, (encounter) => encounter.weight ?? 1);
  return { stage, level: stage, areaId: area.id, encounter: { elite: false, members: group.monsters.map((monsterId) => ({ monsterId, level: stage })) } };
}

// One entry: a fight on stage `stage` of portal `portalId`, the character
// at full HP with no potions and the companions it takes, in the stage's
// region (its trait counts), the monsters as an exploration's at their
// level times the portals' strength. `first`: whether the stage was never
// won in this portal (the server's fights are all for a new stage).
// Returns a hunt of one fight, for huntReport, with `portal` and the
// `parts` it pays; its XP is none, for the companions too.
export function portalFight({ character, equipped, name, portalId, stage, first = false, seed, trophies = {}, companions = [] }, content) {
  const portal = portalById(portalId, content);
  const plan = portalStage(stage, seed, content);
  const area = content.areasById[plan.areaId];
  const rng = createRng(`${seed}:fight`);
  const { texts } = content.portals;
  const player = playerCombatant({ character, equipped, name, area }, content);
  const allies = [
    { ...player, ...(Object.keys(trophies).length > 0 && { trophies }) },
    ...companions.map((companion, index) => companionCombatant(companion, { area, id: `a${index + 1}` }, content)),
  ];
  const enemies = encounterCombatants(plan.encounter, content, { strength: content.portals.strength });
  const fight = simulateFight({ allies, enemies, rng, content, record: true, trait: area.trait });
  const won = fight.won === true;
  const hpAfter = Math.max(0, fight.units.find((unit) => unit.id === player.id).hp);
  const loot = won ? portalLoot(portal, stage, first, createRng(`${seed}:loot`), content) : { gold: 0, resources: {}, materials: {}, parts: {} };

  const enemyList = enemies.map((enemy) => word(content, '{name} (poz. {level})', { name: enemy.name, level: enemy.level })).join(', ');
  const lines = [say(texts, 'fightStart', stage, { enemies: enemyList })];
  if (won) {
    lines.push(say(content.texts, 'victory', stage), say(texts, 'loot', stage, { loot: portalLootText(loot, content) }));
  } else {
    lines.push(say(texts, 'defeat', stage, { target: player.name }));
  }
  const summary = {
    index: 0,
    t: 0,
    elite: false,
    champion: false,
    tough: false,
    enemies: enemies.map((enemy) => ({ name: enemy.name, level: enemy.level, monsterId: enemy.monsterId })),
    won: fight.won,
    hpBefore: player.maxHp,
    hpAfter,
    xp: 0,
    gold: loot.gold,
    materials: loot.materials,
    chests: [],
    recovered: 0,
    allies: allies.map((unit) => combatantView(unit, enemies[0].level, content)),
    enemiesView: enemies.map((enemy) => combatantView(enemy, player.level, content)),
    events: fight.events,
  };
  return {
    areaId: area.id,
    minutes: 0,
    // A lost stage costs nothing: the System only leads the character out.
    result: won ? 'success' : 'escaped',
    xp: 0,
    gold: loot.gold,
    resources: loot.resources,
    materials: loot.materials,
    parts: loot.parts,
    timePoints: 0,
    items: [],
    hpStart: player.maxHp,
    hpEnd: hpAfter,
    maxHp: player.maxHp,
    fights: [summary],
    entries: [{ t: 0, type: 'fight', fight: 0, text: lines.join(' ') }],
    keyFight: { index: 0 },
    potionsUsed: {},
    buffFights: {},
    portal: { id: portal.id, stage, level: plan.level, won, first: won && first, loot: portalLootText(loot, content), companions: companions.map((companion) => companion.name), text: say(texts, won ? 'won' : 'lost', stage, { stage }) },
  };
}

// A sweep of a won stage (the author: "Na czyszczenia (swipe'y) będzie
// ograniczona ilość - do 5 dziennie"): its plain loot at once, with no
// fight, and its line.
export function portalSweep(portalId, stage, seed, content) {
  const portal = portalById(portalId, content);
  const loot = portalLoot(portal, stage, false, createRng(`${seed}:sweep`), content);
  const text = portalLootText(loot, content);
  return { ...loot, loot: text, text: say(content.portals.texts, 'swept', stage, { stage, loot: text }) };
}

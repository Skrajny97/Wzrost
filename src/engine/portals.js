// @ts-check
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
// trudność"), up to its level and to maxStage ("Na start 100 poziomów";
// since 17.11.2026 the highest level a character reaches, "Portale trzeba
// zwiększyć tak daleko jak to możliwe"; past the last land, its last place),
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
import { countEvents, createRng } from './rng.js';
import { nameInText, say, word } from './text.js';
import { weekFactor, weekFighter } from './weeks.js';

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */
/** @typedef {{ id: string, minLevel: number, maxLevel: number, encounters: { monsters: string[], weight?: number }[] } & Record<string, any>} Area An inner region (data/areas.json). */
/** @typedef {{ id: string, name: string, loot: 'gold' | 'resource' | 'material' | 'part', resource?: string, part?: string } & Record<string, any>} Portal A portal of data/portals.json. */
/** @typedef {{ gold: number, resources: Record<string, number>, materials: Record<string, number>, parts: Record<string, number> }} Loot */
/** @typedef {import('./rng.js').Rng} Rng */

/**
 * @param {string} id
 * @param {Content} content
 * @returns {Portal | null}
 */
export const portalById = (id, content) => content.portals.portals.find((/** @type {Portal} */ portal) => portal.id === id) ?? null;

// The stage a portal's next fight is for: the one above the highest won,
// or null while that is above the character's level or the last stage.
/**
 * @param {number} best
 * @param {number} level
 * @param {Content} content
 * @returns {number | null}
 */
export const portalNext = (best, level, content) => (best + 1 <= Math.min(level, content.portals.maxStage) ? best + 1 : null);

// The inner region of stage `stage`: the one whose levels hold it, past the
// last land its last place.
/**
 * @param {number} stage
 * @param {Content} content
 * @returns {Area}
 */
export function portalArea(stage, content) {
  /** @type {Area[]} */
  const areas = content.areas;
  return areas.find((area) => area.minLevel <= stage && stage <= area.maxLevel) ?? areas.reduce((last, area) => (area.maxLevel > last.maxLevel ? area : last));
}

// What lootMinutes of an exploration at the stage's level in its region
// bring on average (the author: "Czyszczenie i pierwsza walka na danym
// stopniu powinna gwarantować zasób o podobnej wielkości co około 45 minut
// wyprawy na tym poziomie"), as hunt.js pays them: the gold of the fights
// and of the finds, the camp's resources gathered and found (all kinds
// together), the materials the creatures leave, and the parts the finds'
// chests give when taken apart (salvageYield). `classLevel`: the class
// level of the character it pays, a part of it from the late class levels
// on (lateRewards); 0 pays it whole.
/**
 * @param {number} stage
 * @param {Content} content
 * @param {number} [classLevel]
 * @returns {{ gold: number, resources: number, materials: number, parts: number } & Record<string, any>}
 */
export const portalExpected = (stage, content, classLevel = 0) => expectedExploration(portalArea(stage, content), stage, content.portals.lootMinutes, content, classLevel);

// How much a portal pays on `stage`: its part of portalExpected, in whole
// pieces, at least one, firstWinMultiplier times as much at the stage's
// first win; `classLevel` as in portalExpected.
/**
 * @param {Portal} portal
 * @param {number} stage
 * @param {boolean} first
 * @param {Content} content
 * @param {number} [classLevel]
 * @returns {number}
 */
export function portalAmount(portal, stage, first, content, classLevel = 0) {
  const expected = portalExpected(stage, content, classLevel);
  const value = { gold: expected.gold, resource: expected.resources, material: expected.materials, part: expected.parts }[portal.loot];
  return Math.max(1, Math.round(value * (first ? content.portals.firstWinMultiplier : 1)));
}

// The ordinary creatures of a stage's region that its level lets come
// (encountersFor), whose materials the Portal Materiałów pays.
/**
 * @param {Area} area
 * @param {number} stage
 * @param {Content} content
 * @returns {string[]}
 */
function stageCreatures(area, stage, content) {
  const open = encountersFor(area, stage);
  /** @type {string[]} */
  const ids = [...new Set((open.length > 0 ? open : area.encounters).flatMap((/** @type {{ monsters: string[] }} */ encounter) => encounter.monsters))];
  return ids.filter((id) => content.materialsByMonster[id]);
}

// A win's loot in a portal: { gold, resources, materials, parts }. Gold's
// portal pays its amount in gold, a resource's in pieces of the resource;
// the Portal Materiałów pays pieces of the materials of the stage's
// ordinary creatures, the Portal Części pieces of its part; a material or a
// part, piece by piece, is now and then rarer, as the explorations' finds
// at the stage's level (rarityUpChances). A fight's loot takes the week of
// its entry (`week`, weeks.js): its share more (or less) of a Portal
// Złota's gold and a Portal Materiałów's pieces, made whole with the loot's
// draws; a sweep, no fight, keeps the stage's loot as it is. `classLevel`
// as in portalExpected.
/**
 * @param {Portal} portal
 * @param {number} stage
 * @param {boolean} first
 * @param {Rng} rng
 * @param {Content} content
 * @param {Record<string, any> | null} [week]
 * @param {number} [classLevel]
 * @returns {Loot}
 */
export function portalLoot(portal, stage, first, rng, content, week = null, classLevel = 0) {
  const amount = portalAmount(portal, stage, first, content, classLevel);
  /** @type {Record<string, string>} */
  const kinds = { gold: 'gold', material: 'materials' };
  const factor = weekFactor(/** @type {any} */ (week), kinds[portal.loot]);
  const pieces = factor === 1 ? amount : countEvents(amount * factor, rng);
  /** @type {Loot} */
  const loot = { gold: 0, resources: {}, materials: {}, parts: {} };
  if (portal.loot === 'gold') return { ...loot, gold: pieces };
  if (portal.loot === 'resource') return { ...loot, resources: { [String(portal.resource)]: pieces } };
  /** @type {number[]} */
  const chances = rarityUpChances(stage, content);
  /** @param {string} rarityId */
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
  const base = content.partsById[String(portal.part)];
  for (let i = 0; i < pieces; i++) {
    const id = content.partsByRarity[raise(base.rarity)]?.id ?? base.id;
    loot.parts[id] = (loot.parts[id] ?? 0) + 1;
  }
  return loot;
}

// A number in the content's language, as the page writes its numbers
// (src/client/format.js): "16 834" in Polish (from ten thousand on),
// "16,834" in English; a series of stages adds up to such sums.
/** @type {Map<string, Intl.NumberFormat>} */
const numberFormats = new Map();
/**
 * @param {number} value
 * @param {Content} content
 */
function grouped(value, content) {
  const locale = content?.language === 'en' ? 'en-GB' : 'pl-PL';
  if (!numberFormats.has(locale)) numberFormats.set(locale, new Intl.NumberFormat(locale));
  return /** @type {Intl.NumberFormat} */ (numberFormats.get(locale)).format(value);
}

// The loot in a sentence: "30 złota", "drewno +90", "skóra wilka ×2",
// "ścinki ×2".
/**
 * @param {Loot} loot
 * @param {Content} content
 * @returns {string}
 */
export function portalLootText(loot, content) {
  /** @type {string[]} */
  const parts = [];
  if (loot.gold > 0) parts.push(word(content, '{gold} złota', { gold: grouped(loot.gold, content) }));
  for (const [id, count] of Object.entries(loot.resources)) parts.push(`${nameInText(content.resourcesById[id].name, content)} +${grouped(count, content)}`);
  if (Object.keys(loot.materials).length > 0) parts.push(materialsText(loot.materials, content));
  for (const [id, count] of Object.entries(loot.parts)) {
    const name = nameInText(content.partsById[id].name, content);
    parts.push(count > 1 ? `${name} ×${grouped(count, content)}` : name);
  }
  return parts.join(', ');
}

// Loot `loot` added into `sum` (both { gold, resources, materials, parts }).
/**
 * @param {Loot} sum
 * @param {Loot} loot
 * @returns {Loot}
 */
function addLoot(sum, loot) {
  sum.gold += loot.gold;
  for (const store of /** @type {const} */ (['resources', 'materials', 'parts'])) for (const [key, count] of Object.entries(loot[store])) sum[store][key] = (sum[store][key] ?? 0) + count;
  return sum;
}

// Every sweep left today in every portal with a stage won, at once (the
// author, 7.11.2026: "daj tez przycisk na górze \"Wyczyść wszystkie\""):
// `left` lists each portal's id, its highest stage won and its sweeps left,
// each sweep drawn on its own as a single one. The loot of all, each
// portal's in words, and one line naming them. `classLevel` as in
// portalExpected.
/**
 * @param {{ portalId: string, stage: number, count: number }[]} left
 * @param {string | number} seed
 * @param {Content} content
 * @param {number} [classLevel]
 */
export function portalSweepAll(left, seed, content, classLevel = 0) {
  /** @type {Loot} */
  const total = { gold: 0, resources: {}, materials: {}, parts: {} };
  const swept = left.map(({ portalId, stage, count }) => {
    /** @type {Loot} */
    const sum = { gold: 0, resources: {}, materials: {}, parts: {} };
    for (let i = 0; i < count; i++) addLoot(sum, portalSweep(portalId, stage, `${seed}:${portalId}:${i}`, content, classLevel));
    addLoot(total, sum);
    return { portal: portalId, stage, count, loot: portalLootText(sum, content) };
  });
  const list = swept.map((one) => `${portalById(one.portal, content)?.name} ×${one.count}: ${one.loot}`).join('; ');
  return { ...total, swept, text: say(content.portals.texts, 'sweptAll', swept.length, { list }) };
}

// What waits on stage `stage` of an entry with `seed`: the region, the
// level and the encounter, a group of ordinary creatures the stage's level
// lets come (encountersFor), never an elite or a champion.
/**
 * @param {number} stage
 * @param {string | number} seed
 * @param {Content} content
 */
export function portalStage(stage, seed, content) {
  const area = portalArea(stage, content);
  const rng = createRng(`${seed}:stage:${stage}`);
  const open = encountersFor(area, stage);
  const group = rng.weighted(open.length > 0 ? open : area.encounters, (/** @type {{ monsters: string[], weight?: number }} */ encounter) => encounter.weight ?? 1);
  return { stage, level: stage, areaId: area.id, encounter: { elite: false, members: group.monsters.map((/** @type {string} */ monsterId) => ({ monsterId, level: stage })) } };
}

// One entry: a fight on stage `stage` of portal `portalId`, the character
// at full HP with no potions and the companions it takes, in the stage's
// region (its trait counts), the monsters as an exploration's at their
// level times the portals' strength. `first`: whether the stage was never
// won in this portal (the server's fights are all for a new stage).
// Returns a hunt of one fight, for huntReport, with `portal` and the
// `parts` it pays; its XP is none, for the companions too. `week`: the
// week of the year of the entry (weeks.js), or null: its share of the loot
// (portalLoot) and of the character's stats in the fight.
/**
 * @param {{
 *   character: Record<string, any>,
 *   equipped: Record<string, any>[],
 *   name: string,
 *   portalId: string,
 *   stage: number,
 *   first?: boolean,
 *   seed: string | number,
 *   trophies?: Record<string, any>,
 *   companions?: Record<string, any>[],
 *   week?: Record<string, any> | null,
 * }} options
 * @param {Content} content
 * @returns {Record<string, any>}
 */
export function portalFight({ character, equipped, name, portalId, stage, first = false, seed, trophies = {}, companions = [], week = null }, content) {
  const portal = /** @type {Portal} */ (portalById(portalId, content));
  const plan = portalStage(stage, seed, content);
  const area = content.areasById[plan.areaId];
  const rng = createRng(`${seed}:fight`);
  const { texts } = content.portals;
  // combatant.js and companions.js are not checked yet: their options are
  // typed by their defaults alone (hp, area).
  const player = playerCombatant(/** @type {any} */ ({ character: weekFighter(/** @type {any} */ (character), /** @type {any} */ (week)), equipped, name, area }), content);
  const allies = [
    { ...player, ...(Object.keys(trophies).length > 0 && { trophies }) },
    ...companions.map((companion, index) => companionCombatant(companion, /** @type {any} */ ({ area, id: `a${index + 1}`, classLevel: character.classLevel ?? 0 }), content)),
  ];
  // From the character's class level 250 they are stronger (the myth game,
  // monsterCombatant).
  const enemies = encounterCombatants(plan.encounter, content, { strength: content.portals.strength, classLevel: character.classLevel ?? 0 });
  const fight = simulateFight({ allies, enemies, rng, content, record: true, trait: area.trait });
  const won = fight.won === true;
  const hpAfter = Math.max(0, fight.units.find((/** @type {{ id: string }} */ unit) => unit.id === player.id)?.hp ?? 0);
  /** @type {Loot} */
  const loot = won ? portalLoot(portal, stage, first, createRng(`${seed}:loot`), content, week, character.classLevel ?? 0) : { gold: 0, resources: {}, materials: {}, parts: {} };

  const enemyList = enemies.map((/** @type {{ name: string, level: number }} */ enemy) => word(content, '{name} (poz. {level})', { name: enemy.name, level: enemy.level })).join(', ');
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
    enemies: enemies.map((/** @type {{ name: string, level: number, monsterId: string }} */ enemy) => ({ name: enemy.name, level: enemy.level, monsterId: enemy.monsterId })),
    won: fight.won,
    hpBefore: player.maxHp,
    hpAfter,
    xp: 0,
    gold: loot.gold,
    materials: loot.materials,
    chests: [],
    recovered: 0,
    allies: allies.map((unit) => combatantView(unit, enemies[0].level, content)),
    enemiesView: enemies.map((/** @type {any} */ enemy) => combatantView(enemy, player.level, content)),
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
    // The week of the entry, for the report's line (weeks.js).
    ...(week && { week }),
    portal: { id: portal.id, stage, level: plan.level, won, first: won && first, loot: portalLootText(loot, content), companions: companions.map((companion) => companion.name), text: say(texts, won ? 'won' : 'lost', stage, { stage }) },
  };
}

// A few stages at one tap (a player on the chat: „guzik [...] po 5 / 10 albo
// max na najwyższy lvl który postać pokona”, the author: „mądre pomysły”,
// 19.11.2026; data/portals.json, series): `hunts`, the fights of a series in
// the order fought, each a single entry's (portalFight, its own seed from
// the server), from the stage above `best`, the highest won before, and
// stopped at the first loss; `level`, the character's. One hunt for
// huntReport: the last fight with its playback, the loot of every stage won
// together, and each fight's lines in the full account under its stage; and
// the series in words: the stages won, their loot, and where and why it
// stopped (a stage lost, the stage open next after all its fights, the
// character's level or the portal's last stage).
/**
 * @param {Record<string, any>[]} hunts
 * @param {{ best: number, level: number }} where
 * @param {Content} content
 */
export function portalSeries(hunts, { best, level }, content) {
  const { texts } = content.portals.series;
  const last = hunts[hunts.length - 1];
  const won = hunts.filter((hunt) => hunt.portal.won);
  const from = hunts[0].portal.stage;
  const to = last.portal.stage;
  const highest = won.length > 0 ? won[won.length - 1].portal.stage : best;
  /** @type {Loot} */
  const loot = { gold: 0, resources: {}, materials: {}, parts: {} };
  for (const hunt of won) addLoot(loot, /** @type {Loot} */ (hunt));
  const next = portalNext(highest, level, content);
  const stop = !last.portal.won
    ? say(texts, 'stopLost', 0, { stage: to })
    : next !== null
      ? say(texts, 'stopCount', 0, { fights: hunts.length, stage: next })
      : highest >= content.portals.maxStage
        ? say(texts, 'stopLast', 0, {})
        : say(texts, 'stopLevel', 0, { level: highest + 1 });
  // The account: each fight's lines under its stage; only the last fight's
  // are those of the fight the report plays.
  const entries = hunts.flatMap((hunt, index) =>
    hunt.entries.map((/** @type {Record<string, any>} */ { fight, ...entry }) => ({
      ...entry,
      ...(index === hunts.length - 1 && { fight }),
      text: say(texts, 'entry', 0, { stage: hunt.portal.stage, text: entry.text }),
    })),
  );
  return {
    hunt: { ...last, gold: loot.gold, resources: loot.resources, materials: loot.materials, parts: loot.parts, entries },
    from,
    to,
    won: won.length,
    highest,
    next,
    loot: portalLootText(loot, content),
    result: won.length === 0 ? say(texts, 'wonNone', 0, {}) : won.length === 1 ? say(texts, 'wonOne', 0, { stage: from }) : say(texts, 'wonMany', 0, { from, to: highest }),
    stop,
    range: from === to ? say(texts, 'rangeOne', 0, { stage: from }) : say(texts, 'range', 0, { from, to }),
    chip: say(texts, 'chip', 0, { won: won.length }),
  };
}

// A sweep of a won stage (the author: "Na czyszczenia (swipe'y) będzie
// ograniczona ilość - do 5 dziennie"): its plain loot at once, with no
// fight, and its line. `classLevel` as in portalExpected.
/**
 * @param {string} portalId
 * @param {number} stage
 * @param {string | number} seed
 * @param {Content} content
 * @param {number} [classLevel]
 */
export function portalSweep(portalId, stage, seed, content, classLevel = 0) {
  const portal = /** @type {Portal} */ (portalById(portalId, content));
  const loot = portalLoot(portal, stage, false, createRng(`${seed}:sweep`), content, null, classLevel);
  const text = portalLootText(loot, content);
  return { ...loot, loot: text, text: say(content.portals.texts, 'swept', stage, { stage, loot: text }) };
}

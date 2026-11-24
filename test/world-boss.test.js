// The World Bossy in the engine (src/engine/world-boss.js; data/world-bosses.json;
// the author: 1222–1226 A): the bands of levels from the lands, a
// character's band by the higher of its levels, the boss's HP from the
// band's active characters, an attack with the companions, never more than
// the HP left, the chests by the damage against a character's share (half
// as big when the boss lived through the week, the last blow's item and
// gold), and the title.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  bandLevel,
  worldBossBand,
  worldBossBandOf,
  worldBossBands,
  worldBossChest,
  worldBossChestPlan,
  worldBossChestTier,
  worldBossDamage,
  worldBossFight,
  worldBossHp,
  worldBossPart,
  worldBossThresholds,
  worldBossTitle,
} from '../src/engine/index.js';
import { companionsOf, playerOf } from '../tools/difficulty-sim.mjs';
import { content, newCharacter } from './helpers/content.js';

const rules = content.worldBosses;
const pieces = (materials) => Object.values(materials).reduce((sum, count) => sum + count, 0);

describe('the World Bossy', () => {
  test('fourteen bands, one for each land in order, each with its own boss of the land, none a bird', () => {
    const bands = worldBossBands(content);
    assert.equal(bands.length, 14);
    assert.deepEqual(
      bands.map((band) => band.region),
      content.regions.map((region) => region.id),
    );
    assert.deepEqual(
      bands.map((band) => [band.minLevel, band.maxLevel]),
      Array.from({ length: 14 }, (_, index) => [index * 25 + 1, index * 25 + 25]),
    );
    assert.equal(new Set(bands.map((band) => band.boss.id)).size, 14);
    assert.ok(bands.every((band, index) => band.last === (index === 13)));
    assert.ok(bands.every((band) => band.boss.family !== 'bird'));
    // The Boruta of the Łysa Góra is the nobleman of the event „Cyrograf”.
    assert.equal(worldBossBandOf('bald-mountain', content).boss.id, 'wb-boruta');
    assert.match(worldBossBandOf('bald-mountain', content).boss.description, /zielonym kontuszu/);
  });

  test('the band by the higher of the character\'s and the class\'s level; above the last band, the last', () => {
    assert.equal(worldBossBand(15, 10, content).region, 'windfalls');
    assert.equal(worldBossBand(25, 25, content).region, 'windfalls');
    assert.equal(worldBossBand(20, 26, content).region, 'stone-glade');
    assert.equal(worldBossBand(126, 90, content).region, 'pine-dunes');
    assert.equal(worldBossBand(300, 351, content).region, 'sunless-land');
    assert.equal(worldBossBand(420, 500, content).region, 'sunless-land');
    // The boss fights at that level, kept inside the band; the last band has no top.
    const first = worldBossBandOf('windfalls', content);
    assert.equal(bandLevel(first, 30), 25);
    assert.equal(bandLevel(worldBossBandOf('stone-glade', content), 12), 26);
    assert.equal(bandLevel(worldBossBandOf('sunless-land', content), 400), 400);
  });

  test('the measured damage of an attack: on the line between levels, below the first as at it, above the last in proportion', () => {
    const levels = rules.damage.map(([level]) => level);
    assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
    const [[firstLevel, firstDamage]] = rules.damage;
    assert.equal(worldBossDamage(1, content), firstDamage);
    assert.equal(worldBossDamage(firstLevel, content), firstDamage);
    const [lastLevel, lastDamage] = rules.damage.at(-1);
    assert.equal(worldBossDamage(lastLevel * 2, content), lastDamage * 2);
    const [[low, lowDamage], [high, highDamage]] = rules.damage.slice(0, 2);
    assert.equal(worldBossDamage((low + high) / 2, content), (lowDamage + highDamage) / 2);
  });

  test('its HP: attacksPerPlayer attacks of each active character at its level in the band; with nobody, one at the middle', () => {
    const band = worldBossBandOf('stone-glade', content);
    const made = worldBossHp(band, [30, 40, 70], content);
    assert.equal(made.boss, 'wb-kotolak');
    assert.equal(made.players, 3);
    // 70 counts as the band's last level, 50.
    assert.equal(made.level, 40);
    const each = [30, 40, 50].map((level) => worldBossDamage(level, content));
    assert.equal(made.maxHp, Math.round(rules.hp.attacksPerPlayer * each.reduce((sum, one) => sum + one, 0)));
    const nobody = worldBossHp(band, [], content);
    assert.equal(nobody.players, 0);
    assert.equal(nobody.level, 38);
    assert.equal(nobody.maxHp, Math.round(rules.hp.attacksPerPlayer * worldBossDamage(38, content)));
    // More players, more HP.
    assert.ok(worldBossHp(band, [40, 40, 40, 40], content).maxHp > made.maxHp);
  });

  test('a character\'s share of the HP, which its chest goes by: the HP over the players counted, at least two', () => {
    assert.equal(worldBossPart({ maxHp: 1000, players: 10 }), 100);
    assert.equal(worldBossPart({ maxHp: 1000, players: 1 }), 500);
    assert.equal(worldBossPart({ maxHp: 1000, players: 0 }), 500);
    const tier = (damage) => worldBossChestTier(damage, 100, content).id;
    assert.deepEqual(
      rules.chests.map((chest) => chest.id),
      ['small', 'medium', 'large', 'huge'],
    );
    assert.equal(tier(0), 'small');
    assert.equal(tier(49), 'small');
    assert.equal(tier(50), 'medium');
    assert.equal(tier(100), 'large');
    assert.equal(tier(150), 'huge');
    assert.equal(tier(10000), 'huge');
    assert.deepEqual(worldBossThresholds(100, content), [
      { id: 'small', damage: 0 },
      { id: 'medium', damage: 50 },
      { id: 'large', damage: 100 },
      { id: 'huge', damage: 150 },
    ]);
    // A player alone who fells the boss by itself reaches the biggest chest.
    assert.equal(worldBossChestTier(1000, worldBossPart({ maxHp: 1000, players: 1 }), content).id, 'huge');
  });

  test('an attack: the character with its companions, the HP it took never more than was left, the same for the same seed', () => {
    const band = worldBossBandOf('peat-bogs', content);
    const one = playerOf('realistic', 'cleric', 85, content);
    const companions = companionsOf(one.plan, 85, 0, content);
    assert.equal(companions.length, 2);
    const boss = { id: band.boss.id, region: band.region, level: 95, hp: 1e9, maxHp: 1e9 };
    const fight = worldBossFight({ character: one.character, equipped: one.equipped, name: 'Kapłanka', companions, boss, seed: 's' }, content);
    assert.ok(fight.damage > 0 && fight.damage < boss.hp, `${fight.damage}`);
    assert.equal(fight.hp, boss.hp - fight.damage);
    assert.equal(fight.fallen, false);
    // The party of three against the boss, a champion with the bar's HP.
    assert.equal(fight.replay.allies.length, 3);
    assert.equal(fight.replay.enemies.length, 1);
    assert.equal(fight.replay.enemies[0].name, 'Zmora');
    assert.equal(fight.replay.enemies[0].level, 95);
    assert.ok(fight.log.length > 0);
    assert.deepEqual(worldBossFight({ character: one.character, equipped: one.equipped, name: 'Kapłanka', companions, boss, seed: 's' }, content), fight);
    // Nearly felled: the damage is what it had left.
    const last = worldBossFight({ character: one.character, equipped: one.equipped, name: 'Kapłanka', companions, boss: { ...boss, hp: 5 }, seed: 's' }, content);
    assert.equal(last.damage, 5);
    assert.equal(last.hp, 0);
    assert.equal(last.fallen, true);
    // Alone, too.
    const alone = worldBossFight({ character: newCharacter('warrior', { level: 20, classLevel: 22 }), equipped: [], name: 'Sama', boss: { ...boss, id: 'wb-pochwist', region: 'windfalls', level: 22 }, seed: 'a' }, content);
    assert.equal(alone.replay.allies.length, 1);
    assert.ok(alone.damage >= 0);
  });

  test('the chest: gold, the land\'s elite and champion materials and the item\'s chance by its size; half as big when the boss lived', () => {
    const level = 140;
    const part = 1000;
    const fallen = worldBossChestPlan({ level, damage: 1500, part, fallen: true }, content);
    const huge = rules.chests.find((chest) => chest.id === 'huge');
    assert.equal(fallen.tier.id, 'huge');
    assert.equal(fallen.elite, huge.elite);
    assert.equal(fallen.champion, huge.champion);
    assert.equal(fallen.itemChance, huge.itemChance);
    assert.ok(fallen.gold > 0 && fallen.gold % rules.goldRound === 0);
    assert.equal(fallen.lastBlowItem, false);
    const unbeaten = worldBossChestPlan({ level, damage: 1500, part, fallen: false, lastBlow: true }, content);
    assert.equal(unbeaten.tier.id, 'huge');
    assert.ok(Math.abs(unbeaten.gold - fallen.gold * rules.unbeaten) <= rules.goldRound, `${unbeaten.gold} ${fallen.gold}`);
    assert.equal(unbeaten.itemChance, huge.itemChance * rules.unbeaten);
    assert.equal(unbeaten.elite, Math.ceil(huge.elite * rules.unbeaten));
    assert.equal(unbeaten.champion, Math.floor(huge.champion * rules.unbeaten));
    // No last blow on a boss that did not fall.
    assert.equal(unbeaten.lastBlowItem, false);
    assert.equal(unbeaten.lastBlowGold, 0);
    // The last blow: an item and more gold.
    const blow = worldBossChestPlan({ level, damage: 1500, part, fallen: true, lastBlow: true }, content);
    assert.equal(blow.lastBlowItem, true);
    assert.equal(blow.gold, fallen.gold + blow.lastBlowGold);
    assert.ok(blow.lastBlowGold > 0);
    // A bigger chest holds more.
    const small = worldBossChestPlan({ level, damage: 10, part, fallen: true }, content);
    assert.equal(small.tier.id, 'small');
    assert.ok(small.gold < fallen.gold);
  });

  test('the chest\'s draws: the pieces of the land\'s elite and champion, the item of the class from the land, the same for the same seed', () => {
    const region = 'pine-dunes';
    const land = content.regionsById[region];
    const champion = land.areas.find((area) => area.champion).champion;
    const elite = content.materialsByMonster[land.elite].id;
    const own = content.materialsByMonster[champion].id;
    const chest = { region, level: 140, classId: 'archer', classLevel: 150, wornSlots: ['weapon'], damage: 1500, part: 1000, fallen: true, lastBlow: true, seed: 'chest' };
    const opened = worldBossChest(chest, content);
    assert.equal(pieces(opened.materials), opened.elite + opened.champion);
    assert.ok(Object.keys(opened.materials).every((key) => key.startsWith(`${elite}:`) || key.startsWith(`${own}:`)), JSON.stringify(opened.materials));
    // The huge chest's sure item and the last blow's.
    assert.equal(opened.items.length, 2);
    for (const item of opened.items) {
      assert.equal(item.level, 140);
      assert.ok(content.basesById[item.base].classes?.includes('archer') ?? true, item.base);
    }
    assert.deepEqual(worldBossChest(chest, content), opened);
    // A small chest of a boss that lived: one piece of the elite's, no champion's.
    const half = worldBossChest({ ...chest, damage: 1, fallen: false, seed: 'half' }, content);
    assert.equal(pieces(half.materials), 1);
    assert.ok(Object.keys(half.materials).every((key) => key.startsWith(`${elite}:`)));
    assert.ok(half.items.length <= 1);
  });

  test('the title of a boss, a woman\'s for a female character', () => {
    const boss = worldBossBandOf('bald-mountain', content).boss;
    assert.equal(worldBossTitle(boss, 'male'), 'Pogromca Boruty');
    assert.equal(worldBossTitle(boss, 'female'), 'Pogromczyni Boruty');
    assert.equal(rules.title.places, 10);
    assert.equal(rules.title.days, 7);
  });
});

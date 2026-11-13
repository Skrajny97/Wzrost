// The Labirynt Systemu and the Rdzeń in the engine (src/engine/labyrinth.js,
// src/engine/core.js; DECISIONS.md, "Labirynt Systemu i Rdzeń", 850–866):
// the day's maps, the same for everyone and by their rules; the creatures,
// their strength by the level (Piekielny twice the third's); a room's
// fight with the HP carried on, a fight not won ending the day; the
// spring, the altar, the merchant and the blessings in the fights; the
// guardians' Artefakty by the levels' rarities, their sizes and elements;
// the sockets; the numbers of the traits with the upgrades and the gem;
// the costs of the upgrades, the Odłamki of a break and of a dissolved
// Artefakt; the resonance; the Rdzeń in the stats and the fights; and the
// danger of the rooms ahead on the board (899 A).

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  abilityValue,
  artifactName,
  artifactUpgradeCost,
  blessingChoices,
  blessingEffects,
  breakShards,
  buyAtMerchant,
  chooseBlessing,
  combatValues,
  computeStats,
  coreEffects,
  coreResonance,
  coreSockets,
  createRng,
  dissolveShards,
  enterRoom,
  exploreStrength,
  freeSockets,
  labyrinthAreas,
  labyrinthFighters,
  labyrinthFoes,
  labyrinthGold,
  labyrinthMap,
  labyrinthStrength,
  leaveMerchant,
  makeArtifact,
  merchantPrices,
  newLabyrinth,
  playerCombatant,
  reachableRooms,
  resetLabyrinth,
  resetPrice,
  resetsLeft,
  roomDanger,
  roomsAhead,
  simulateFight,
  traitValue,
  upgradedArtifact,
} from '../src/engine/index.js';
import { strongClimber } from './helpers/climb.js';
import { content, newCharacter } from './helpers/content.js';

const rules = content.labyrinth;
const days = Array.from({ length: 200 }, (_, index) => `2026-${String(1 + (index % 12)).padStart(2, '0')}-${String(1 + (index % 28)).padStart(2, '0')}:${index}`);

describe('the day\'s maps', () => {
  test('the same for every player of a day, another the next day', () => {
    assert.deepEqual(labyrinthMap('2026-11-12', 1, content), labyrinthMap('2026-11-12', 1, content));
    assert.notDeepEqual(labyrinthMap('2026-11-12', 1, content), labyrinthMap('2026-11-13', 1, content));
    assert.notDeepEqual(labyrinthMap('2026-11-12', 1, content), labyrinthMap('2026-11-12', 2, content));
  });

  test('six rows of 2–3 rooms and the guardian; 2–3 roads from a room, every room reached; the first row only fights, no elites in rows 1–2, one merchant at most, a spring at least', () => {
    const counts = {};
    for (const day of days) {
      for (const level of [1, 2, 3, 4]) {
        const map = labyrinthMap(day, level, content);
        assert.equal(map.rows.length, rules.map.rows + 1);
        assert.deepEqual(map.rows.at(-1), [{ type: 'guardian', links: [] }]);
        map.rows.slice(0, -1).forEach((rooms, row) => {
          assert.ok(rooms.length >= 2 && rooms.length <= 3, `${day} ${level} row ${row}`);
          for (const room of rooms) {
            counts[room.type] = (counts[room.type] ?? 0) + 1;
            if (row === 0) assert.equal(room.type, 'fight');
            if (row < rules.map.eliteFromRow - 1) assert.notEqual(room.type, 'elite');
            const next = map.rows[row + 1];
            if (row + 1 < rules.map.rows) {
              assert.ok(room.links.length >= Math.min(2, next.length) && room.links.length <= 3, `${day} ${level} row ${row}: ${room.links}`);
              assert.ok(room.links.every((index) => index >= 0 && index < next.length));
              assert.equal(new Set(room.links).size, room.links.length);
            } else assert.deepEqual(room.links, [0]);
          }
          if (row + 1 < rules.map.rows) {
            const reached = new Set(rooms.flatMap((room) => room.links));
            assert.equal(reached.size, map.rows[row + 1].length, `${day} ${level}: every room of row ${row + 1} reached`);
          }
        });
        const types = map.rows.flat().map((room) => room.type);
        assert.ok(types.filter((type) => type === 'merchant').length <= rules.map.merchantMost);
        assert.ok(types.filter((type) => type === 'spring').length >= rules.map.springLeast);
      }
    }
    // Every kind of room comes.
    for (const kind of ['fight', 'elite', 'treasure', 'spring', 'altar', 'merchant']) assert.ok(counts[kind] > 0, kind);
  });

  test('the rooms open next: any of the first row at the entrance, then those the room leads to, none past the guardian', () => {
    const map = labyrinthMap('2026-11-12', 1, content);
    assert.deepEqual(reachableRooms(map, -1, null), map.rows[0].map((_, index) => index));
    assert.deepEqual(reachableRooms(map, 0, 1), map.rows[0][1].links);
    assert.deepEqual(reachableRooms(map, rules.map.rows - 1, 0), [0]);
    assert.deepEqual(reachableRooms(map, rules.map.rows, 0), []);
  });
});

describe('the creatures', () => {
  test('of the lands at or below the character\'s level, at its level; an elite in an elite\'s room, a champion as the guardian', () => {
    const areas = labyrinthAreas(37, content);
    assert.ok(areas.every((area) => area.minLevel <= 37));
    assert.ok(areas.some((area) => area.minLevel > 30));
    for (const [row, room, type] of [[0, 0, 'fight'], [3, 1, 'elite'], [6, 0, 'guardian']]) {
      const { areaId, encounter } = labyrinthFoes({ day: '2026-11-12', level: 2, row, room, type, charLevel: 37 }, content);
      assert.ok(content.areasById[areaId].minLevel <= 37);
      assert.ok(encounter.members.every((member) => member.level === 37));
      const monsters = encounter.members.map((member) => content.monstersById[member.monsterId]);
      if (type === 'elite') assert.ok(monsters[0].elite);
      if (type === 'guardian') assert.ok(monsters[0].champion);
      if (type === 'fight') assert.ok(monsters.every((monster) => !monster.elite && !monster.champion));
    }
    // The same for two characters of a level on a day.
    assert.deepEqual(labyrinthFoes({ day: 'd', level: 1, row: 2, room: 0, type: 'fight', charLevel: 50 }, content), labyrinthFoes({ day: 'd', level: 1, row: 2, room: 0, type: 'fight', charLevel: 50 }, content));
  });

  test('as strong as the newest place\'s creatures of the level, times the level\'s strength; Piekielny twice the third\'s (854 A)', () => {
    const base = exploreStrength({ minLevel: 80, maxLevel: 80 }, 80, content);
    const [first, second, third, hell] = [1, 2, 3, 4].map((level) => labyrinthStrength(level, 'fight', 80, content));
    assert.deepEqual(first, [base[0] * rules.levels[0].strength[0], base[1] * rules.levels[0].strength[1]]);
    assert.ok(second[0] > first[0] && third[0] > second[0]);
    assert.ok(Math.abs(hell[0] / third[0] - 2) < 1e-9 && Math.abs(hell[1] / third[1] - 2) < 1e-9);
  });
});

describe('a day of the Labirynt', () => {
  const { character, equipped } = strongClimber();
  const party = { character, equipped, name: 'Wspinacz', companions: [] };
  const fresh = (fields = {}) => ({ ...newLabyrinth({ day: '2026-11-12', charLevel: 30, companions: [], seed: 'test' }), ...fields });
  const map = labyrinthMap('2026-11-12', 1, content);
  // A room of a kind and a room of the row before that leads to it.
  const spotOf = (type) => {
    for (let row = 1; row < map.rows.length; row++) {
      const room = map.rows[row].findIndex((one) => one.type === type);
      if (room >= 0) return { row, room, from: map.rows[row - 1].findIndex((one) => one.links.includes(room)) };
    }
    return null;
  };

  test('a fight: its report, the XP and gold of a fight of an exploration, the HP carried on; a room not on the way refused', () => {
    const state = fresh();
    assert.throws(() => enterRoom(state, { row: 1, room: 0 }, party, 'seed', content), /row/);
    const done = enterRoom(state, { row: 0, room: 0 }, party, 'seed', content);
    assert.equal(done.type, 'fight');
    assert.equal(done.hunt.fights.length, 1);
    assert.equal(done.hunt.labyrinth.won, true);
    assert.ok(done.gains.xp > 0 && done.gains.gold > 0);
    assert.equal(done.state.row, 0);
    assert.deepEqual(done.state.path, [0]);
    assert.ok(done.state.hp.me > 0 && done.state.hp.me <= 1);
    assert.equal(done.state.hp.me, done.hunt.labyrinth.hp.me);
    // The next fight starts with that HP (852 A).
    const fighters = labyrinthFighters(done.state, party, content);
    assert.equal(fighters[0].unit.hp, Math.max(1, Math.round(fighters[0].unit.maxHp * done.state.hp.me)));
    const next = map.rows[0][0].links[0];
    const second = enterRoom(done.state, { row: 1, room: next }, party, 'seed2', content);
    assert.equal(second.state.row, 1);
    const off = map.rows[1].findIndex((_, index) => !map.rows[0][0].links.includes(index));
    if (off >= 0) assert.throws(() => enterRoom(done.state, { row: 1, room: off }, party, 'x', content), /room/);
  });

  test('a fight not won ends the day; the rewards taken stay', () => {
    const weak = { character: newCharacter('mage', { level: 60, classLevel: 50 }), equipped: [], name: 'Słaby', companions: [] };
    const state = fresh({ level: 4, charLevel: 60, gains: { xp: 5, gold: 6, shards: 7, artifacts: 1 } });
    const done = enterRoom(state, { row: 0, room: 0 }, weak, 'seed', content);
    assert.equal(done.hunt.labyrinth.won, false);
    assert.equal(done.state.over, 'fainted');
    assert.deepEqual(done.state.gains, { xp: 5, gold: 6, shards: 7, artifacts: 1 });
    assert.throws(() => enterRoom(done.state, { row: 1, room: 0 }, weak, 'x', content), /over/);
  });

  test('a spring heals everyone by its share, the fallen companions too; a treasure gives Odłamki and gold', () => {
    const spring = spotOf('spring');
    const state = fresh({ row: spring.row - 1, room: spring.from, hp: { me: 0.3, c1: 0 }, team: ['c1'] });
    const healed = enterRoom(state, { row: spring.row, room: spring.room }, party, 'x', content).state;
    assert.equal(healed.hp.me, Math.round((0.3 + rules.spring.heal) * 10000) / 10000);
    assert.equal(healed.hp.c1, rules.spring.heal);
    const treasure = spotOf('treasure');
    if (treasure) {
      const found = enterRoom(fresh({ row: treasure.row - 1, room: treasure.from }), { row: treasure.row, room: treasure.room }, party, 'x', content);
      assert.equal(found.gains.shards, rules.levels[0].shards.treasure);
      assert.ok(found.gains.gold > 0);
    }
  });

  test('the guardian: an Artefakt of the level\'s rarities, a choice of three blessings, the next level; Piekielny after the third, the day done after it', () => {
    const last = rules.map.rows;
    const at = (level) => fresh({ level, cleared: level - 1, row: last - 1, room: 0, path: Array(last).fill(0) });
    const first = enterRoom(at(1), { row: last, room: 0 }, party, 'g1', content);
    assert.equal(first.type, 'guardian');
    assert.equal(first.hunt.labyrinth.won, true);
    assert.ok(Object.keys(rules.levels[0].artifact).includes(first.artifact.rarity));
    assert.equal(first.state.level, 2);
    assert.equal(first.state.row, -1);
    assert.equal(first.state.cleared, 1);
    assert.equal(first.state.pending.kind, 'blessing');
    assert.equal(first.state.pending.choices.length, 3);
    assert.equal(first.state.gains.artifacts, 1);
    const third = enterRoom({ ...at(3), charLevel: 30 }, { row: last, room: 0 }, party, 'g3', content);
    if (third.hunt.labyrinth.won) assert.equal(third.state.level, 4);
    const hell = enterRoom({ ...at(4), charLevel: 30 }, { row: last, room: 0 }, party, 'g4', content);
    if (hell.hunt.labyrinth.won) {
      assert.equal(hell.state.over, 'done');
      assert.equal(hell.state.pending, null);
    }
  });

  test('blessings: three of the pool to choose from, one chosen joins the day\'s; the merchant\'s healing and choice, once each', () => {
    const choices = blessingChoices('seed', content);
    assert.equal(new Set(choices).size, 3);
    const state = fresh({ pending: { kind: 'blessing', from: 'altar', choices } });
    assert.equal(chooseBlessing(state, 'nope'), null);
    const chosen = chooseBlessing(state, choices[2]);
    assert.deepEqual(chosen.blessings, [choices[2]]);
    assert.equal(chosen.pending, null);
    const shop = fresh({ hp: { me: 0.2 }, pending: { kind: 'merchant', heal: false, blessing: false, choices: null } });
    const healed = buyAtMerchant(shop, 'heal', content);
    assert.equal(healed.hp.me, Math.round((0.2 + rules.merchant.heal) * 10000) / 10000);
    assert.equal(buyAtMerchant(healed, 'heal', content), null);
    const offered = buyAtMerchant(healed, 'blessing', content);
    assert.equal(offered.pending.choices.length, 3);
    assert.equal(leaveMerchant(offered), null);
    const taken = chooseBlessing(offered, offered.pending.choices[0]);
    assert.equal(taken.pending.kind, 'merchant');
    assert.equal(leaveMerchant(taken).pending, null);
    const prices = merchantPrices(60, content);
    assert.ok(prices.heal > 0 && prices.blessing > prices.heal);
  });

  test('a Labirynt lost starts again once a day (the author, 13.11.2026): the first level, full HP, no blessings, the day\'s rewards kept, for the gold of 150 minutes of exploring', () => {
    const day = '2026-11-13';
    const lost = { ...newLabyrinth({ day, charLevel: 64, companions: [], seed: 'a' }), level: 2, row: 3, room: 1, path: [0, 1, 0, 1], cleared: 1, over: /** @type {const} */ ('fainted'), hp: { me: 0 }, blessings: ['might'], gains: { xp: 5, gold: 7, shards: 2, artifacts: 1 } };
    assert.equal(resetsLeft({ ...lost, over: null }, content), 0);
    assert.equal(resetsLeft({ ...lost, over: 'done' }, content), 0);
    assert.equal(resetsLeft(lost, content), 1);
    assert.equal(resetLabyrinth({ ...lost, over: 'done' }, { companions: [], seed: 'b' }, content), null);
    const again = resetLabyrinth(lost, { companions: [], seed: 'b' }, content);
    assert.deepEqual(again, { ...newLabyrinth({ day, charLevel: 64, companions: [], seed: 'b' }), gains: lost.gains, resets: 1 });
    // Lost again the same day: no second try.
    assert.equal(resetsLeft({ ...again, over: 'fainted' }, content), 0);
    assert.equal(resetLabyrinth({ ...again, over: 'fainted' }, { companions: [], seed: 'c' }, content), null);
    // Dearer than the gold a day of the Labirynt gives on average (100–140 minutes of exploring).
    assert.equal(resetPrice(64, content), labyrinthGold(rules.reset.goldMinutes, 64, content));
    assert.ok(resetPrice(64, content) > labyrinthGold(140, 64, content));
  });

  test('the blessings work in the fights: damage, armour, HP, a first critical blow, a shield, the companions\' damage and the healing after a won fight', () => {
    const effects = blessingEffects(['might', 'stone-skin', 'vigour', 'first-blood', 'ward', 'shoulder', 'breath', 'might'], content);
    assert.ok(Math.abs(effects.character.damage - 0.3) < 1e-9);
    assert.equal(effects.companions.damage, 0.2);
    assert.equal(effects.mend, 0.1);
    const plain = labyrinthFighters(fresh(), party, content)[0].unit;
    const blessed = labyrinthFighters(fresh({ blessings: ['might', 'stone-skin', 'vigour', 'first-blood', 'ward'] }), party, content)[0].unit;
    assert.ok(Math.abs(blessed.damageBonus - (plain.damageBonus ?? 0) - 0.15) < 1e-9);
    assert.equal(blessed.armor, Math.round(plain.armor * 1.15));
    assert.equal(blessed.maxHp, Math.round(plain.maxHp * 1.2));
    assert.equal(blessed.openingCrit, true);
    assert.equal(blessed.openingShield, 0.12);
    // In a fight: the shield takes the first blows, the first blow that lands is critical.
    const enemies = [playerCombatant({ character: newCharacter('warrior', { level: 30 }), equipped: [], name: 'Wróg', id: 'e0', side: 'enemy' }, content)];
    const fight = simulateFight({ allies: [blessed], enemies, rng: createRng('bless'), content, record: true });
    assert.ok(fight.events.some((event) => event.kind === 'skill' && event.shield > 0 && event.actor === blessed.id));
    const firstHit = fight.events.find((event) => (event.kind === 'hit' || event.kind === 'crit') && event.actor === blessed.id);
    assert.equal(firstHit.kind, 'crit');
    // Oddech Labiryntu: after a won fight, those standing get 10% back.
    const breath = enterRoom(fresh({ blessings: ['breath'] }), { row: 0, room: 0 }, party, 'seed', content);
    const without = enterRoom(fresh(), { row: 0, room: 0 }, party, 'seed', content);
    assert.equal(breath.state.hp.me, Math.min(1, Math.round((without.state.hp.me + 0.1) * 10000) / 10000));
  });
});

describe('the danger of the rooms on the board (899 A)', () => {
  const { character, equipped } = strongClimber();
  const strong = { character, equipped, name: 'Wspinacz', companions: [] };
  const weak = { character: newCharacter('mage', { level: 60, classLevel: 50 }), equipped: [], name: 'Słaby', companions: [] };
  const day = '2026-11-12';
  const fresh = (fields = {}) => ({ ...newLabyrinth({ day, charLevel: 30, companions: [], seed: 'test' }), ...fields });

  test('the rooms ahead: every room of the level from the entrance, then only those the roads lead to, never the rows behind', () => {
    const map = labyrinthMap(day, 1, content);
    const all = map.rows.flatMap((rooms, row) => rooms.map((_, index) => `${row}:${index}`));
    assert.deepEqual([...roomsAhead(map, -1, null)].sort(), [...all].sort());
    const ahead = roomsAhead(map, 0, 0);
    for (const next of map.rows[0][0].links) assert.ok(ahead.has(`1:${next}`));
    assert.ok([...ahead].every((key) => Number(key.split(':')[0]) >= 1));
    assert.ok(ahead.has(`${map.rows.length - 1}:0`));
    // From a room of the second row only what its roads reach in the third.
    const second = roomsAhead(map, 1, 0);
    assert.deepEqual([...second].filter((key) => key.startsWith('2:')).sort(), map.rows[1][0].links.map((next) => `2:${next}`).sort());
    assert.equal(roomsAhead(map, map.rows.length - 1, 0).size, 0);
  });

  test('a fight against the party as it is: easy for the strong, deadly for the weak in Piekielny; the same answer every time; none for a room without a fight', () => {
    const map = labyrinthMap(day, 1, content);
    const easy = roomDanger({ state: fresh(), type: 'fight', row: 0, room: 0, party: strong, seed: 'danger' }, content);
    assert.equal(easy, 'easy');
    assert.equal(roomDanger({ state: fresh(), type: 'fight', row: 0, room: 0, party: strong, seed: 'danger' }, content), easy);
    const hell = fresh({ level: 4, charLevel: 60 });
    assert.equal(roomDanger({ state: hell, type: 'fight', row: 0, room: 0, party: weak, seed: 'danger' }, content), 'deadly');
    assert.equal(roomDanger({ state: hell, type: 'guardian', row: map.rows.length - 1, room: 0, party: weak, seed: 'danger' }, content), 'deadly');
    for (const type of ['treasure', 'spring', 'altar', 'merchant']) assert.equal(roomDanger({ state: fresh(), type, row: 1, room: 0, party: strong, seed: 'danger' }, content), null);
  });

  test('a character who fell can only be in danger; the samples never change the day\'s state', () => {
    const state = fresh({ hp: { me: 0 } });
    const before = JSON.stringify(state);
    assert.equal(roomDanger({ state, type: 'fight', row: 0, room: 0, party: strong, seed: 'danger' }, content), 'deadly');
    assert.equal(JSON.stringify(state), before);
  });
});

describe('the Artefakty', () => {
  test('a guardian\'s by its level\'s rarities, never above them (857); sizes by their weights; any of the eight elements', () => {
    const rng = createRng('drops');
    const counts = { rarity: {}, size: {}, element: {} };
    const n = 6000;
    for (let i = 0; i < n; i++) {
      const artifact = makeArtifact(rules.levels[0].artifact, rng, content);
      for (const key of ['rarity', 'size', 'element']) counts[key][artifact[key]] = (counts[key][artifact[key]] ?? 0) + 1;
      const size = rules.core.sizes.find((one) => one.id === artifact.size);
      assert.equal(artifact.traits.length, size.traits);
      assert.equal(Boolean(artifact.ability), size.ability);
      const element = rules.core.elements.find((one) => one.id === artifact.element);
      assert.ok(artifact.traits.every((trait) => element.traits.includes(trait)));
    }
    assert.deepEqual(Object.keys(counts.rarity).sort(), ['common', 'rare', 'unique']);
    assert.ok(Math.abs(counts.rarity.common / n - 0.55) < 0.03);
    assert.ok(Math.abs(counts.size.small / n - 0.6) < 0.03);
    assert.ok(Math.abs(counts.size.large / n - 0.1) < 0.02);
    assert.equal(Object.keys(counts.element).length, 8);
    // Each level a little more of the rarer ones, never for certain; only
    // Piekielny can give the rarest.
    const share = (weights, ids) => ids.reduce((sum, id) => sum + (weights[id] ?? 0), 0) / Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    const rarer = rules.levels.map((level) => share(level.artifact, ['unique', 'epic', 'legendary', 'mythic', 'divine']));
    assert.ok(rarer[1] > rarer[0] && rarer[2] > rarer[1] && rarer[3] > rarer[2]);
    assert.ok(rules.levels.every((level) => level.artifact.common > 0));
    assert.ok(rules.levels.slice(0, 3).every((level) => !level.artifact.mythic && !level.artifact.divine));
    assert.ok(rules.levels[3].artifact.divine > 0);
  });

  test('sockets: a tenth of the level, at least three (858 v2 A); a small one takes 1, a medium 2, a large 3', () => {
    assert.equal(coreSockets(1, content), 3);
    assert.equal(coreSockets(39, content), 3);
    assert.equal(coreSockets(40, content), 4);
    assert.equal(coreSockets(205, content), 20);
    const core = { absorbed: [{ element: 'fire', size: 'large', rarity: 'common', traits: ['damage', 'main-stat'], ability: 'shield' }, { element: 'fire', size: 'small', rarity: 'common', traits: ['damage'] }] };
    assert.equal(freeSockets(core, 50, content), 1);
  });

  test('the numbers: the rarity\'s budget, the size, +10% a level of upgrade (+10 doubles them), the gem\'s bonus', () => {
    const artifact = { element: 'fire', size: 'medium', rarity: 'epic', traits: ['damage', 'main-stat'], upgrade: 0 };
    const base = traitValue(artifact, 'damage', 0, content);
    assert.ok(Math.abs(base - 0.005 * 2.1) < 1e-12);
    assert.ok(Math.abs(traitValue({ ...artifact, upgrade: 10 }, 'damage', 0, content) / base - 2) < 1e-9);
    assert.ok(Math.abs(traitValue({ ...artifact, upgrade: 3 }, 'damage', 0, content) / base - 1.3) < 1e-9);
    assert.ok(Math.abs(traitValue(artifact, 'damage', 0.35, content) / base - 1.35) < 1e-9);
    assert.ok(Math.abs(traitValue({ ...artifact, size: 'large' }, 'damage', 0, content) / base - 1.25) < 1e-9);
    assert.ok(abilityValue({ ...artifact, size: 'large', ability: 'shield' }, 0, content) > 0);
    // An ability's number grows with the square root of the budget: a boski
    // Drugi oddech at +10 with a diamond gives back about a quarter of the HP.
    const rally = rules.core.abilities.find((one) => one.id === 'rally').value;
    assert.ok(Math.abs(abilityValue({ ...artifact, size: 'large', rarity: 'divine', ability: 'rally', upgrade: 10 }, 0.35, content) - rally * 2 * 2 * 1.35) < 1e-12);
    assert.equal(abilityValue({ ...artifact, size: 'large', ability: 'sure-first' }, 0, content), 0);
    assert.equal(artifactName({ ...artifact, size: 'small' }, content), 'Mały Artefakt ognia');
  });

  test('upgrades up to +10, each dearer, no failure; a dissolved one gives back half its Odłamki, a broken one its rarity\'s for each socket and half of them', () => {
    let artifact = { element: 'earth', size: 'large', rarity: 'rare', traits: ['armor', 'endurance'], ability: 'rally', upgrade: 0, spent: 0 };
    const costs = [];
    while (artifactUpgradeCost(artifact, content) !== null) {
      costs.push(artifactUpgradeCost(artifact, content));
      artifact = upgradedArtifact(artifact, content);
    }
    assert.equal(artifact.upgrade, 10);
    assert.deepEqual(costs, rules.core.upgrade.costs.map((cost) => cost * 3));
    assert.ok(costs.every((cost, index) => index === 0 || cost > costs[index - 1]));
    const spent = costs.reduce((sum, cost) => sum + cost, 0);
    assert.equal(artifact.spent, spent);
    assert.equal(upgradedArtifact(artifact, content), artifact);
    assert.equal(dissolveShards(artifact, content), Math.floor(spent / 2));
    assert.equal(breakShards({ ...artifact, upgrade: 0, spent: 0 }, content), rules.core.break.rare * 3);
    assert.equal(breakShards(artifact, content), rules.core.break.rare * 3 + Math.floor(spent / 2));
  });

  test('resonance: 2, 4 and 6 of one element give its growing bonus (861 A)', () => {
    const fire = { element: 'fire', size: 'small', rarity: 'common', traits: ['damage'] };
    const tiers = [1, 2, 3, 4, 5, 6, 7].map((count) => coreResonance(Array(count).fill(fire), content).find((one) => one.element === 'fire'));
    assert.deepEqual(tiers.map((one) => one.tier), [0, 1, 1, 2, 2, 3, 3]);
    assert.deepEqual(tiers.map((one) => one.next), [2, 4, 4, 6, 6, null, null]);
    const values = rules.core.elements.find((one) => one.id === 'fire').resonance.values;
    const damage = (count) => coreEffects({ absorbed: Array(count).fill(fire) }, 'warrior', content).damage;
    assert.ok(Math.abs(damage(2) - (2 * 0.005 + values[0])) < 1e-12);
    assert.ok(Math.abs(damage(6) - (6 * 0.005 + values[2])) < 1e-12);
  });

  test('the Rdzeń in the character\'s stats (the `core` source) and fights; the gem raises it; companions untouched', () => {
    const character = newCharacter('archer', { level: 80, classLevel: 60 });
    const core = {
      absorbed: [
        { element: 'fire', size: 'medium', rarity: 'epic', traits: ['damage', 'main-stat'], upgrade: 5 },
        { element: 'nature', size: 'medium', rarity: 'epic', traits: ['hp', 'vitality'], upgrade: 5 },
        { element: 'lightning', size: 'large', rarity: 'legendary', traits: ['speed', 'crit'], ability: 'first-strike', upgrade: 2 },
      ],
      gem: null,
    };
    const plain = computeStats(character, [], content);
    const cored = computeStats({ ...character, core }, [], content);
    assert.equal(plain.sources.dexterity.core, 0);
    assert.ok(cored.sources.dexterity.core > 0, 'the archer\'s main stat');
    assert.ok(cored.sources.vitality.core > 0);
    assert.equal(cored.totals.dexterity, plain.totals.dexterity + cored.sources.dexterity.core);
    const before = combatValues(character, [], content);
    const after = combatValues({ ...character, core }, [], content);
    assert.ok(after.damage > before.damage && after.maxHp > before.maxHp && after.speed > before.speed);
    const withGem = combatValues({ ...character, core: { ...core, gem: 'diamond' } }, [], content);
    assert.ok(withGem.maxHp > after.maxHp);
    const unit = playerCombatant({ character: { ...character, core }, equipped: [], name: 'A' }, content);
    assert.equal(unit.firstStrike, true);
    // Pierwszy ruch: the character moves first.
    const enemies = [playerCombatant({ character: newCharacter('shadow', { level: 80 }), equipped: [], name: 'Szybki', id: 'e0', side: 'enemy' }, content)];
    const fight = simulateFight({ allies: [unit], enemies, rng: createRng('first'), content, record: true });
    const firstMove = fight.events.find((event) => ['hit', 'crit', 'dodge', 'skill'].includes(event.kind));
    assert.equal(firstMove.actor, unit.id);
    // A fight without any of it draws the same as before.
    const a = simulateFight({ allies: [playerCombatant({ character, equipped: [], name: 'A' }, content)], enemies, rng: createRng('same'), content });
    const b = simulateFight({ allies: [playerCombatant({ character: { ...character, core: { absorbed: [] } }, equipped: [], name: 'A' }, content)], enemies, rng: createRng('same'), content });
    assert.deepEqual(a.units, b.units);
  });
});

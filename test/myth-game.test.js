// From level 250 the creatures are at least three times as strong, and
// stronger still against a Drużyna's players fighting together (the
// author, 19.11.2026: „grę od 250tego trzeba zrobić też jeszcze
// trudniejszą, tam wchodzą juz potezne przedmioty i wszystko, tak z 2 razy
// trudniej, szczególnie z drużyną”, then „Od 250ego wzrost 3-krotny
// minimum”): balance.monsters.mythGame, a stage as lateGame and endGame but
// all at once from 250, and balance.monsters.perPlayer (partyStrength in
// combatant.js) on a trip, in the Wieża Drużyn and in a party event;
// neither for one player with its companions or a mercenary, nor below 250
// (612 C). The Bestia Gildii and the cards of Talia Systemu keep their own
// measure.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  cardHomes,
  cardStats,
  guildBeast,
  guildBeastFight,
  midGameShare,
  monsterCombatant,
  partyStrength,
  resolvePartyEvent,
  simulateHunt,
  towerFight,
  towerLevel,
} from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';

// The content with balance.monsters' `stage` set to `values`.
const withStage = (stage, values, data = content) => ({ ...data, balance: { ...data.balance, monsters: { ...data.balance.monsters, [stage]: { ...data.balance.monsters[stage], ...values } } } });
const flat = withStage('mythGame', { damage: 0, hp: 0 });
const monsterId = Object.keys(content.monstersById).find((id) => !content.monstersById[id].elite && !content.monstersById[id].champion);
const monster = (level, data = content, extra = {}) => monsterCombatant({ monsterId, level, id: 'a', ...extra }, data);
const near = (a, b, within = 1e-9) => Math.abs(a - b) < within;

describe('the myth game: at least three times as strong from 250', () => {
  test('as it stands: blows and HP ×1.7321 (√3) at once from 250, three times as strong in all; a party\'s player ×1.25 each', () => {
    const { mythGame, perPlayer } = content.balance.monsters;
    assert.deepEqual([mythGame.fromLevel, mythGame.toLevel, mythGame.damage, mythGame.hp], [250, 250, 0.7321, 0.7321]);
    const strength = (1 + mythGame.damage) * (1 + mythGame.hp);
    assert.ok(strength >= 3 && strength < 3.01, `${strength}`);
    assert.deepEqual([perPlayer.fromLevel, perPlayer.toLevel, perPlayer.damage, perPlayer.hp], [250, 250, 0.25, 0.25]);
  });

  test('a stage whose last level is its first is a step: nothing below it, all of it from it on', () => {
    const step = { fromLevel: 250, toLevel: 250 };
    assert.deepEqual([1, 200, 249, 250, 251, 500].map((level) => midGameShare(level, step)), [0, 0, 0, 1, 1, 1]);
    assert.equal(midGameShare(75, { fromLevel: 50, toLevel: 100 }), 0.5);
  });

  test('nothing up to 249, in full from 250, on top of the stages before', () => {
    const { mythGame } = content.balance.monsters;
    for (const level of [10, 100, 200, 249]) assert.deepEqual(monster(level), monster(level, flat), `at ${level}`);
    for (const level of [250, 255, 300, 350]) {
      const [now, before] = [monster(level), monster(level, flat)];
      assert.ok(near(now.weapon.max / before.weapon.max, 1 + mythGame.damage), `blows at ${level}`);
      assert.ok(near(now.maxHp / before.maxHp, 1 + mythGame.hp, 0.001), `HP at ${level}`);
    }
  });

  test('alone (the Wieża Solo, an event\'s fight) a creature has its half, as of the late and end game (438.3 A)', () => {
    const { mythGame, soloGrowth } = content.balance.monsters;
    const alone = monster(300, content, { growth: soloGrowth });
    const before = monster(300, flat, { growth: soloGrowth });
    assert.ok(near(alone.weapon.max / before.weapon.max, 1 + mythGame.damage * soloGrowth));
  });
});

describe('against a Drużyna\'s players fighting together, from 250', () => {
  const { perPlayer } = content.balance.monsters;

  test('per player beyond the first, from 250; nothing for one player, nor below 250 (612 C)', () => {
    assert.deepEqual(partyStrength(300, 1, content), [1, 1]);
    assert.deepEqual(partyStrength(200, 3, content), [1, 1]);
    assert.deepEqual(partyStrength(249, 3, content), [1, 1]);
    for (const level of [250, 300]) {
      const [damage3, hp3] = partyStrength(level, 3, content);
      assert.ok(near(damage3, 1 + 2 * perPlayer.damage) && near(hp3, 1 + 2 * perPlayer.hp), `three at ${level}`);
      const [damage2, hp2] = partyStrength(level, 2, content);
      assert.ok(near(damage2, 1 + perPlayer.damage) && near(hp2, 1 + perPlayer.hp), `two at ${level}`);
    }
    for (const level of [250, 300]) {
      const [one, three] = [monster(level), monster(level, content, { players: 3 })];
      const [damage, hp] = partyStrength(level, 3, content);
      assert.ok(near(three.weapon.max / one.weapon.max, damage), `blows at ${level}`);
      assert.ok(near(three.maxHp / one.maxHp, hp, 0.001), `HP at ${level}`);
    }
    assert.deepEqual(monster(249, content, { players: 3 }), monster(249));
  });

  test('on a trip the creatures grow for each player of its roster; a mercenary is no player', () => {
    const player = (classId, id) => ({ id, name: id, character: newCharacter(classId, { level: 300, classLevel: 300 }), equipped: [], hp: null, windows: {}, trophies: {} });
    const leader = player('warrior', 'lead');
    const first = (extra) =>
      simulateHunt({ character: leader.character, equipped: [], hp: null, name: 'lead', areaId: 'gate-of-nav', minutes: 60, seed: 'druzyna', lootSeed: 'lupy', ...extra }, content).fights[0];
    const alone = first({ roster: [leader], self: 'lead' });
    const party = first({ roster: [leader, player('cleric', 'p1'), player('mage', 'p2')], self: 'lead' });
    const hired = first({ partners: [{ id: 'najemnik', name: 'Najemnik', character: newCharacter('archer', { level: 300, classLevel: 300 }), equipped: [] }] });
    assert.deepEqual(
      party.enemies.map((enemy) => enemy.monsterId),
      alone.enemies.map((enemy) => enemy.monsterId),
    );
    party.enemiesView.forEach((enemy, index) => {
      const [, hp] = partyStrength(enemy.level, 3, content);
      assert.ok(hp > 1);
      assert.ok(near(enemy.maxHp / alone.enemiesView[index].maxHp, hp, 0.001), `${enemy.name}: ${enemy.maxHp} / ${alone.enemiesView[index].maxHp}`);
    });
    assert.deepEqual(
      hired.enemiesView.map((enemy) => enemy.maxHp),
      alone.enemiesView.map((enemy) => enemy.maxHp),
    );
  });

  test('in the Wieża Drużyn a player of the Drużyna makes them stronger than a companion does', () => {
    const floor = 251;
    const companion = (id, name) => ({ id, name, classId: 'warrior', level: 300, gear: [], traits: [], skills: [], relation: 0 });
    const climber = newCharacter('warrior', { level: 300, classLevel: 300 });
    const enemy = (extra) => towerFight({ character: climber, equipped: [], name: 'Wspinacz', floor, seed: 'moc', ...extra }, content).fights[0].enemiesView[0].maxHp;
    const companions = enemy({ companions: [companion('c1', 'Bratomir'), companion('c2', 'Dobrosław')] });
    const partner = { character: newCharacter('cleric', { level: 300, classLevel: 300 }), equipped: [], name: 'Druh' };
    const players = enemy({ partners: [partner], companions: [companion('c1', 'Bratomir')] });
    const [, hp] = partyStrength(towerLevel(floor, content), 2, content);
    assert.ok(hp > 1);
    assert.ok(near(players / companions, hp, 0.001), `${players} / ${companions}`);
  });

  test('in a party event\'s fight the foes grow for each player, from 250 only', () => {
    const member = (id, level) => ({ id, name: `Gracz ${id}`, hpEnd: 5000, character: newCharacter('warrior', { level, classLevel: level }), equipped: [] });
    const hps = (members, level) =>
      resolvePartyEvent(
        { event: content.partyEventsById['smugglers-camp'], optionId: 'attack', seed: 'fight', areaId: 'mossy-boulders', level, leaderId: members[0].id, members },
        content,
      ).fight.enemiesView.map((enemy) => enemy.maxHp);
    const [two, three] = [[member(1, 30), member(2, 30)], [member(1, 30), member(2, 30), member(3, 30)]];
    assert.deepEqual(hps(three, 30), hps(two, 30));
    const [, hp2] = partyStrength(300, 2, content);
    const [, hp3] = partyStrength(300, 3, content);
    const [high2, high3] = [hps(two, 300), hps(three, 300)];
    high3.forEach((hp, index) => assert.ok(near(hp / high2[index], hp3 / hp2, 0.001), `${hp} / ${high2[index]}`));
  });
});

describe('what keeps its own measure', () => {
  // The myth game far stronger, and lopsided: neither may change.
  const wild = withStage('mythGame', { damage: 5, hp: 0 });

  test('the Bestia Gildii at 300 fights as without the myth game', () => {
    const beast = guildBeast({ seed: 'bestia', levels: [300, 300] }, content);
    const attack = (data) => guildBeastFight({ character: newCharacter('warrior', { level: 300, classLevel: 300 }), equipped: [], name: 'Łowczyni', beast: { ...beast, hp: beast.maxHp }, seed: 's' }, data);
    assert.deepEqual(attack(wild), attack(content));
    assert.deepEqual(attack(flat), attack(content));
  });

  test('the cards of Talia Systemu keep their Atak and Życie', () => {
    for (const id of cardHomes(content).keys()) assert.deepEqual(cardStats(id, 1, wild), cardStats(id, 1, content), id);
  });
});

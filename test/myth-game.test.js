// From class level 250 the creatures are at least three times as strong,
// and stronger still against a Drużyna's players fighting together, and
// the rewards are halved (the author, 19.11.2026: „grę od 250tego trzeba
// zrobić też jeszcze trudniejszą, tam wchodzą juz potezne przedmioty i
// wszystko, tak z 2 razy trudniej, szczególnie z drużyną”, „Od 250ego
// wzrost 3-krotny minimum”, „to miało byc od 250 poziomu klasy” and
// „wszystkie te obwarowania trudnosci sa od poziomu klasy co podałem”):
// balance.monsters.mythGame and perPlayer by the class level of those who
// fight (fightingClassLevel, the highest of a Drużyna's players), whatever
// the creature's own level, and balance.rewards.lateRewards by the class
// level of the character paid. Neither for one player with its companions
// or a mercenary as a party, nor below class level 250 (612 C). The Bestia
// Gildii and the cards of Talia Systemu keep their own measure.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  cardHomes,
  cardStats,
  fightingClassLevel,
  guildBeast,
  guildBeastFight,
  labyrinthGold,
  monsterCombatant,
  partyStrength,
  portalAmount,
  portalById,
  portalFight,
  resolvePartyEvent,
  simulateHunt,
  towerFight,
  towerGold,
} from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';

// The content with balance.monsters' `stage` set to `values`.
const withStage = (stage, values, data = content) => ({ ...data, balance: { ...data.balance, monsters: { ...data.balance.monsters, [stage]: { ...data.balance.monsters[stage], ...values } } } });
const monsterId = Object.keys(content.monstersById).find((id) => !content.monstersById[id].elite && !content.monstersById[id].champion);
const monster = (level, extra = {}, data = content) => monsterCombatant({ monsterId, level, id: 'a', ...extra }, data);
const near = (a, b, within = 1e-9) => Math.abs(a - b) < within;
const { mythGame, perPlayer, soloGrowth } = content.balance.monsters;

describe('the myth game: at least three times as strong from class level 250', () => {
  test('as it stands: blows and HP ×1.7321 (√3) from class level 250, three times as strong in all; a party\'s player ×1.25 each', () => {
    assert.deepEqual(mythGame, { fromClassLevel: 250, damage: 0.7321, hp: 0.7321 });
    const strength = (1 + mythGame.damage) * (1 + mythGame.hp);
    assert.ok(strength >= 3 && strength < 3.01, `${strength}`);
    assert.deepEqual(perPlayer, { fromClassLevel: 250, damage: 0.25, hp: 0.25 });
  });

  test('the same creature, class 249 against class 250: as before, then three times as strong', () => {
    for (const level of [250, 300]) {
      const [plain, below, at] = [monster(level), monster(level, { classLevel: 249 }), monster(level, { classLevel: 250 })];
      assert.deepEqual(below, plain, `class 249 at creature level ${level}`);
      assert.ok(near(at.weapon.max / plain.weapon.max, 1 + mythGame.damage), `blows at ${level}`);
      assert.ok(near(at.maxHp / plain.maxHp, 1 + mythGame.hp, 0.001), `HP at ${level}`);
    }
  });

  test('a character of class level 250 and more meets every creature so, in a low place too', () => {
    for (const level of [5, 30, 120]) {
      const [plain, strong] = [monster(level), monster(level, { classLevel: 260 })];
      assert.ok(near(strong.weapon.max / plain.weapon.max, 1 + mythGame.damage), `blows at ${level}`);
      assert.ok(Math.abs(strong.maxHp - plain.maxHp * (1 + mythGame.hp)) <= 2, `HP at ${level}: ${plain.maxHp} → ${strong.maxHp}`);
    }
  });

  test('alone (the Wieża Solo, an event\'s fight) a creature has its half, as of the late and end game (438.3 A)', () => {
    const alone = monster(300, { growth: soloGrowth, classLevel: 300 });
    const before = monster(300, { growth: soloGrowth });
    assert.ok(near(alone.weapon.max / before.weapon.max, 1 + mythGame.damage * soloGrowth));
  });
});

describe('against a Drużyna\'s players fighting together, from class level 250', () => {
  test('the class level that decides is the highest of the players\'', () => {
    assert.equal(fightingClassLevel([{ classLevel: 240 }, { classLevel: 262 }, { classLevel: 249 }]), 262);
    assert.equal(fightingClassLevel([{ classLevel: 120 }]), 120);
    assert.equal(fightingClassLevel([]), 0);
  });

  test('per player beyond the first, from class level 250; nothing for one player, nor below 250 (612 C)', () => {
    assert.deepEqual(partyStrength(300, 1, content), [1, 1]);
    assert.deepEqual(partyStrength(249, 3, content), [1, 1]);
    for (const classLevel of [250, 300]) {
      const [damage3, hp3] = partyStrength(classLevel, 3, content);
      assert.ok(near(damage3, 1 + 2 * perPlayer.damage) && near(hp3, 1 + 2 * perPlayer.hp), `three at class ${classLevel}`);
      const [damage2, hp2] = partyStrength(classLevel, 2, content);
      assert.ok(near(damage2, 1 + perPlayer.damage) && near(hp2, 1 + perPlayer.hp), `two at class ${classLevel}`);
    }
    // The creature's own level does not matter.
    for (const level of [30, 300]) {
      const [one, three] = [monster(level, { classLevel: 250 }), monster(level, { classLevel: 250, players: 3 })];
      const [damage, hp] = partyStrength(250, 3, content);
      assert.ok(near(three.weapon.max / one.weapon.max, damage), `blows at ${level}`);
      assert.ok(near(three.maxHp / one.maxHp, hp, 0.01), `HP at ${level}`);
    }
    assert.deepEqual(monster(300, { classLevel: 249, players: 3 }), monster(300));
  });

  test('on a trip the highest class level of its roster decides, so nobody hides behind a lower leader; a mercenary is no player', () => {
    const player = (classId, id, classLevel) => ({ id, name: id, character: newCharacter(classId, { level: 245, classLevel }), equipped: [], hp: null, windows: {}, trophies: {} });
    const leader = player('warrior', 'lead', 249);
    const first = (extra) =>
      simulateHunt({ character: leader.character, equipped: [], hp: null, name: 'lead', areaId: 'mossy-boulders', minutes: 60, seed: 'druzyna', lootSeed: 'lupy', ...extra }, content).fights[0];
    const alone = first({ roster: [leader], self: 'lead' });
    const low = first({ roster: [leader, player('cleric', 'p1', 248), player('mage', 'p2', 240)], self: 'lead' });
    const high = first({ roster: [leader, player('cleric', 'p1', 260), player('mage', 'p2', 240)], self: 'lead' });
    const hired = first({ partners: [{ id: 'najemnik', name: 'Najemnik', character: newCharacter('archer', { level: 245, classLevel: 300 }), equipped: [] }] });
    for (const fight of [low, high, hired]) {
      assert.deepEqual(
        fight.enemies.map((enemy) => enemy.monsterId),
        alone.enemies.map((enemy) => enemy.monsterId),
      );
    }
    // All below class level 250: as alone.
    assert.deepEqual(
      low.enemiesView.map((enemy) => enemy.maxHp),
      alone.enemiesView.map((enemy) => enemy.maxHp),
    );
    // One member of class level 260: the myth game and two players more.
    high.enemiesView.forEach((enemy, index) => {
      const ratio = enemy.maxHp / alone.enemiesView[index].maxHp;
      assert.ok(near(ratio, (1 + mythGame.hp) * partyStrength(260, 3, content)[1], 0.01), `${enemy.name}: ${ratio}`);
    });
    assert.deepEqual(
      hired.enemiesView.map((enemy) => enemy.maxHp),
      alone.enemiesView.map((enemy) => enemy.maxHp),
    );
  });

  test('in the Wieża Drużyn a partner of class level 250 makes them stronger; a companion\'s level does not count', () => {
    const floor = 3;
    const companion = (id, name, level) => ({ id, name, classId: 'warrior', level, gear: [], traits: [], skills: [], relation: 0 });
    const climber = newCharacter('warrior', { level: 60, classLevel: 60 });
    const enemy = (extra) => towerFight({ character: climber, equipped: [], name: 'Wspinacz', floor, seed: 'moc', ...extra }, content).fights[0].enemiesView[0].maxHp;
    const partner = (classLevel) => ({ character: newCharacter('cleric', { level: 60, classLevel }), equipped: [], name: 'Druh' });
    const companions = enemy({ companions: [companion('c1', 'Bratomir', 300), companion('c2', 'Dobrosław', 300)] });
    const lowPartner = enemy({ partners: [partner(60)], companions: [companion('c1', 'Bratomir', 300)] });
    const highPartner = enemy({ partners: [partner(250)], companions: [companion('c1', 'Bratomir', 300)] });
    assert.equal(lowPartner, companions);
    assert.ok(near(highPartner / companions, (1 + mythGame.hp) * partyStrength(250, 2, content)[1], 0.01), `${highPartner} / ${companions}`);
  });

  test('in a party event\'s fight the highest class level of the players decides', () => {
    const member = (id, classLevel) => ({ id, name: `Gracz ${id}`, hpEnd: 5000, character: newCharacter('warrior', { level: 30, classLevel }), equipped: [] });
    const hps = (members) =>
      resolvePartyEvent(
        { event: content.partyEventsById['smugglers-camp'], optionId: 'attack', seed: 'fight', areaId: 'mossy-boulders', level: 30, leaderId: members[0].id, members },
        content,
      ).fight.enemiesView.map((enemy) => enemy.maxHp);
    const low = hps([member(1, 30), member(2, 249), member(3, 30)]);
    const high = hps([member(1, 30), member(2, 250), member(3, 30)]);
    high.forEach((hp, index) => assert.ok(near(hp / low[index], (1 + mythGame.hp) * partyStrength(250, 3, content)[1], 0.01), `${hp} / ${low[index]}`));
  });

  test('in a portal the character\'s class level decides', () => {
    const fighter = (classLevel) => portalFight({ character: newCharacter('warrior', { level: 40, classLevel }), equipped: [], name: 'Wędrowiec', portalId: 'gold', stage: 40, seed: 'mit' }, content).fights[0].enemiesView;
    const [low, high] = [fighter(249), fighter(250)];
    high.forEach((enemy, index) => assert.ok(near(enemy.maxHp / low[index].maxHp, 1 + mythGame.hp, 0.01), `${enemy.maxHp} / ${low[index].maxHp}`));
  });
});

describe('half the rewards from class level 250, whatever the character\'s or the place\'s level', () => {
  test('the Portale, the Wieże and the Labirynt pay by the class level of the character', () => {
    const { factor } = content.balance.rewards.lateRewards;
    const gold = portalById('gold', content);
    for (const stage of [40, 260]) {
      const [low, high] = [portalAmount(gold, stage, false, content, 249), portalAmount(gold, stage, false, content, 250)];
      assert.ok(Math.abs(high - low * factor) <= 1, `stage ${stage}: ${low} → ${high}`);
    }
    for (const floor of [3, 230]) assert.ok(Math.abs(towerGold(floor, content, 250) - towerGold(floor, content, 249) * factor) <= 1, `floor ${floor}`);
    for (const charLevel of [100, 260]) assert.ok(Math.abs(labyrinthGold(60, charLevel, content, 250) - labyrinthGold(60, charLevel, content, 249) * factor) <= 1, `labyrinth ${charLevel}`);
  });
});

describe('what keeps its own measure', () => {
  // The myth game far stronger, and lopsided: neither may change.
  const wild = withStage('mythGame', { damage: 5, hp: 0 });

  test('the Bestia Gildii fights a character of class level 300 as without the myth game', () => {
    const beast = guildBeast({ seed: 'bestia', levels: [300, 300] }, content);
    const flat = withStage('mythGame', { damage: 0, hp: 0 });
    const attack = (data) => guildBeastFight({ character: newCharacter('warrior', { level: 300, classLevel: 300 }), equipped: [], name: 'Łowczyni', beast: { ...beast, hp: beast.maxHp }, seed: 's' }, data);
    assert.deepEqual(attack(wild), attack(content));
    assert.deepEqual(attack(flat), attack(content));
  });

  test('the cards of Talia Systemu keep their Atak and Życie', () => {
    for (const id of cardHomes(content).keys()) assert.deepEqual(cardStats(id, 1, wild), cardStats(id, 1, content), id);
  });
});

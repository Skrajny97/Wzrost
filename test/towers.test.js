// The Wieże Systemu, the groundwork (src/engine/towers.js): the floors of a
// climb, the creatures of every land in turn at the floor's level, elites
// and champions on the fifth and tenth floors, and the top open to a party.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { towerArea, towerFloor, towerTop } from '../src/engine/index.js';
import { content } from './helpers/content.js';

describe('the Wieże Systemu', () => {
  test('the highest floor open is the lowest level in the party', () => {
    assert.equal(towerTop([30]), 30);
    assert.equal(towerTop([30, 26, 41]), 26);
  });

  test('a floor holds one inner region\'s creatures at its level, the regions in turn from the first', () => {
    const { areas } = content;
    assert.equal(towerArea(1, content).id, areas[0].id);
    assert.equal(towerArea(2, content).id, areas[1].id);
    assert.equal(towerArea(areas.length + 1, content).id, areas[0].id);
    const floor = towerFloor(3, 'climb', content);
    assert.equal(floor.level, 3);
    assert.equal(floor.areaId, areas[2].id);
    const living = new Set(areas[2].encounters.flatMap((encounter) => encounter.monsters));
    assert.ok(floor.encounter.members.every((member) => member.level === 3 && living.has(member.monsterId)));
    assert.deepEqual(towerFloor(3, 'climb', content), floor);
  });

  test('every fifth floor an elite, every tenth a champion, and elites now and then on other floors', () => {
    for (let floor = 5; floor <= 200; floor += 5) {
      const { encounter } = towerFloor(floor, 'climb', content);
      const area = towerArea(floor, content);
      if (floor % 10 === 0 && area.champion) assert.equal(encounter.members[0].monsterId, area.champion, `floor ${floor}`);
      else if (area.elite) assert.equal(encounter.members[0].monsterId, area.elite, `floor ${floor}`);
    }
    const others = Array.from({ length: 1000 }, (_, index) => index + 1).filter((floor) => floor % 5 !== 0);
    const elites = others.filter((floor) => towerFloor(floor, 'climb', content).encounter.elite).length;
    assert.ok(elites > others.length * 0.05 && elites < others.length * 0.2, `${elites}`);
  });
});

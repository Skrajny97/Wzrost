import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadData, validateData } from '../tools/validate-data.mjs';

test('game data matches the schemas and its references hold', () => {
  assert.deepEqual(validateData(), []);
});

test('the validator catches broken references and schema errors', () => {
  const data = structuredClone(loadData());
  data.regions[0].areas[0].encounters[0].monsters = ['dragon'];
  data.classes[0].autoPoints = { strength: 1 };
  assert.deepEqual(validateData(data), [
    'classes.json: warrior rozdaje 1 punktów, a poziom daje 8',
    'regions.json: windfalls-edge ma nieznanego potwora "dragon"',
  ]);

  // Inner regions follow one another without gaps.
  const gap = structuredClone(loadData());
  gap.regions[0].areas[1].minLevel = 7;
  assert.deepEqual(validateData(gap), ['regions.json: fox-ravines powinien zaczynać się od poziomu 6']);

  // Punkty Systemu never come from finds or buildings and pay for no building.
  const system = structuredClone(loadData());
  system.regions[0].resources['system-points'] = 1;
  system.buildings[0].effect.resource = 'system-points';
  system.buildings[1].costs.push({ resource: 'system-points', base: 1, growth: 1, fromLevel: 2 });
  assert.deepEqual(validateData(system), [
    'regions.json: windfalls daje w znaleziskach zasób Systemu "system-points"',
    'buildings.json: sawmill wytwarza zasób Systemu "system-points"',
    'buildings.json: quarry kosztuje zasób Systemu "system-points"',
  ]);

  const broken = structuredClone(loadData());
  broken.rarities[0].color = 'grey';
  assert.match(validateData(broken)[0], /^rarities\.json\/0\/color: must match pattern/);
});

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

  // A report's music must be a known track, for a known result.
  const music = structuredClone(loadData());
  music.music.reports.success = 'fanfare';
  assert.deepEqual(validateData(music), ['music.json: raport success ma nieznany utwór fanfare']);
  music.music.reports = { draw: 'victory-v1' };
  assert.match(validateData(music)[0], /^music\.json\/reports: must be equal to one of the allowed values/);

  const broken = structuredClone(loadData());
  broken.rarities[0].color = 'grey';
  assert.match(validateData(broken)[0], /^rarities\.json\/0\/color: must match pattern/);
});

// Game content loaded from data/ for engine tests.

import { buildContent } from '../../src/engine/index.js';
import { loadData } from '../../tools/validate-data.mjs';

export const content = buildContent(loadData());

export function newCharacter(classId, overrides = {}) {
  const cls = content.classesById[classId];
  return { classId, level: 1, xp: 0, classLevel: 1, classXp: 0, points: {}, position: cls.position, ...overrides };
}

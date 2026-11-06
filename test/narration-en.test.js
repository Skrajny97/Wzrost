// The narrator's English recordings (715, 696 A): every line the narrator
// says aloud in Polish has its English recording in data/en/tutorial.json,
// for the phone's words and the computer's alike, and each one is a file of
// the game under audio/narration/en/.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const polish = JSON.parse(readFileSync(new URL('../data/tutorial.json', import.meta.url), 'utf8'));
const english = JSON.parse(readFileSync(new URL('../data/en/tutorial.json', import.meta.url), 'utf8')).lines;

// The places a recording belongs: a line, a class's version of it, and
// their computer's versions, by where they stand in the data.
function* voiced() {
  for (const line of polish.lines) {
    const en = english[line.id] ?? {};
    const forms = line.classes ? Object.entries(line.classes).map(([classId, told]) => [`${line.id}-${classId}`, told, en.classes?.[classId]]) : [[line.id, line, en]];
    for (const [id, told, translated] of forms) {
      if (told.voice) yield [id, translated?.voice];
      if (told.desktop?.voice) yield [`${id} (computer)`, translated?.desktop?.voice];
    }
  }
}

test('every line said aloud in Polish has its English recording, a file of the game', () => {
  const missing = [];
  for (const [id, path] of voiced()) {
    if (typeof path !== 'string' || !path.startsWith('audio/narration/en/')) missing.push(`${id}: no English recording`);
    else if (!existsSync(new URL(`../src/client/${path}`, import.meta.url))) missing.push(`${id}: ${path} is not there`);
  }
  assert.deepEqual(missing, []);
});

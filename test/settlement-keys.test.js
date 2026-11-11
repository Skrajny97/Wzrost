// The Osada of a character (characters.settlement, JSON) is read again by
// settlementOf (src/server/settlement.js) before every save in the Osada,
// and settlementOf keeps only the keys it names. A key the game writes
// elsewhere but settlementOf does not name is lost at the next save in the
// Osada, even at a mere look at it (the board is saved then): so it was with
// `events`, what the events met once remember (Jagna in the marsh once,
// 817.1), until 0.2.67. This test finds the keys the server writes into the
// Osada and checks that settlementOf keeps every one of them.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { settlementOf } from '../src/server/settlement.js';

const dir = new URL('../src/server/', import.meta.url);
const sources = Object.fromEntries(
  readdirSync(dir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => [name, readFileSync(new URL(name, dir), 'utf8')]),
);

// Keys written beside a spread of the Osada read (`{ ...stored, key: … }`,
// `{ ...stored, key }`), in the files that read the Osada (settlementOf or
// the settlement column). `stored` names other JSON columns in a few files
// too: those keys are listed here, with where they belong.
const ELSEWHERE = {
  collectedAt: 'a camp building (characters.js)',
  owned: 'the cosmetics (cosmetics.js)',
  queue: 'the Warsztat queue (crafting.js)',
};

function writtenKeys() {
  const keys = new Map();
  const add = (key, where) => keys.set(key, [...(keys.get(key) ?? []), where]);
  for (const [name, source] of Object.entries(sources)) {
    if (!/settlementOf\(|\.settlement\b/.test(source)) continue;
    for (const match of source.matchAll(/\{\s*\.\.\.stored,\s*(\w+)\s*[:,}]/g)) add(match[1], name);
    for (const match of source.matchAll(/\{\s*\.\.\.stored,\s*\.\.\.\(\w+ && \{ (\w+) \}\)/g)) add(match[1], name);
  }
  // What an exploration's report writes (hunts.js: settlementAfterHunt).
  const after = sources['hunts.js'].match(/function settlementAfterHunt[\s\S]*?\n}\n/)[0];
  for (const match of after.matchAll(/next\.(\w+)\s*=/g)) add(match[1], 'hunts.js');
  for (const key of Object.keys(ELSEWHERE)) keys.delete(key);
  return keys;
}

test('the scan finds what an exploration writes into the Osada, and the known keys', () => {
  const keys = writtenKeys();
  for (const key of ['companions', 'reputation', 'relations', 'events', 'rumor', 'wanted', 'board', 'gifts', 'mount', 'casino', 'market', 'timePoints', 'rewarded', 'evolutionChanges', 'test']) {
    assert.ok(keys.has(key), `${key} not found`);
  }
});

test('settlementOf keeps every key the game writes into the Osada', () => {
  const keys = [
    ...writtenKeys().keys(),
    // Written in other forms than the scan reads.
    'pending',
    'dismissed',
    'trade',
    'tanneryTrade',
    'marketTrade',
    'forge',
    'forgeTrade',
  ];
  const stored = Object.fromEntries(keys.map((key) => [key, key === 'test' ? true : { probe: key }]));
  const kept = settlementOf({ settlement: JSON.stringify(stored) });
  const lost = keys.filter((key) => JSON.stringify(kept[key]) !== JSON.stringify(stored[key]));
  assert.deepEqual(lost, [], `settlementOf drops: ${lost.join(', ')} (src/server/settlement.js)`);
});

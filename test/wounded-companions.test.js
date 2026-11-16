// The companions who wait wounded (src/server/hunts.js, woundedWaiting;
// the Walka screen's rest box; a player, 16.11.2026: „nie wiesz
// klikając kolejną wyprawę i idziesz sam bez nich”): the character's view
// names them while the character has not rested to full HP; one told to
// stay in the Kwatery is not among them, and none once it has rested.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { useServer } from './helpers/server.js';

const companion = (id, name, extra = {}) => ({ id, name, classId: 'warrior', appearance: 'male', level: 60, gear: [], traits: [], skills: [], relation: 0, ...extra });

describe('the wounded companions on the Walka screen', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on' });

  test('named while the character is not rested; none who stay, none once it is', async () => {
    const { cookie } = await signUp('ranny');
    await call('POST', '/api/character', { cookie, body: { name: 'Ranny', classId: 'warrior', appearance: 'female' } });
    const database = await db();
    const set = (settlement, hp) => database.prepare('UPDATE characters SET level = 40, settlement = ?, hp = ?, hp_at = ? WHERE name = ?').bind(JSON.stringify(settlement), hp, Date.now(), 'Ranny').run();
    await set({ companions: [companion('c1', 'Bratomir', { wounded: true }), companion('c2', 'Dobrawa', { wounded: true, appearance: 'female' }), companion('c3', 'Gniewko'), companion('c4', 'Stoisław', { wounded: true, stays: true })] }, 1);
    const view = (await call('GET', '/api/character', { cookie })).data.character;
    assert.deepEqual(view.woundedCompanions.companions, [
      { name: 'Bratomir', appearance: 'male' },
      { name: 'Dobrawa', appearance: 'female' },
    ]);
    // Rested to full HP: they go along, nothing to say.
    await set({ companions: [companion('c1', 'Bratomir', { wounded: true })] }, 1000000);
    assert.equal((await call('GET', '/api/character', { cookie })).data.character.woundedCompanions, null);
    // No wounded companion: nothing either.
    await set({ companions: [companion('c3', 'Gniewko')] }, 1);
    assert.equal((await call('GET', '/api/character', { cookie })).data.character.woundedCompanions, null);
  });
});

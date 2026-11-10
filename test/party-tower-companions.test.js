// The Wieża Drużyn with companions alone (data/towers.json, size;
// src/server/towers.js, climbersFor; 10.11.2026, the author: „Wieża Drużyn
// niech będzie możliwa także z towarzyszami.”): at least two fighters on the
// character's side, players of its Drużyna and its companions from the
// Kwatery together, up to three; the players first, then the companions.
// The creatures' strength grows with every fighter, a companion's as a
// player's.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { towerFight, towerFloor } from '../src/engine/index.js';
import { encounterCombatants } from '../src/engine/hunt.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const party = content.towers.towers.find((tower) => tower.id === 'party');
const companion = (id, name) => ({ id, name, classId: 'warrior', level: 60, gear: [], traits: [], skills: [], relation: 0 });

describe('the Wieża Drużyn\'s rules in the data', () => {
  test('one player is enough, with at least two fighters and at most three', () => {
    assert.deepEqual(party.members, [1, 3]);
    assert.deepEqual(party.size, [2, 3]);
    assert.equal(party.companions, true);
    const solo = content.towers.towers.find((tower) => tower.id === 'solo');
    assert.deepEqual([solo.members, solo.size, solo.companions], [[1, 1], [1, 1], false]);
  });

  test('a companion makes the creatures as much stronger as a player does', () => {
    const climber = newCharacter('warrior', { level: 60, classLevel: 50 });
    const enemy = (extra) => towerFight({ character: climber, equipped: [], name: 'Wspinacz', floor: 3, seed: 'moc', ...extra }, content).fights[0].enemiesView[0].maxHp;
    const [damage, hp] = content.towers.strength;
    const expected = (fighters) => encounterCombatants(towerFloor(3, 'moc', content).encounter, content, { strength: [damage * fighters, hp * fighters] })[0].maxHp;
    assert.equal(enemy({ companions: [companion('c1', 'Bratomir')] }), expected(2));
    assert.equal(enemy({ companions: [companion('c1', 'Bratomir'), companion('c2', 'Dobrosław')] }), expected(3));
    const partner = { character: newCharacter('cleric', { level: 60, classLevel: 50 }), equipped: [], name: 'Druh' };
    assert.equal(enemy({ partners: [partner], companions: [companion('c1', 'Bratomir')] }), expected(3));
  });
});

describe('the Wieża Drużyn with companions through the API', () => {
  const { call, db, signUp } = useServer();
  const cookies = {};

  async function player(login, name) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = 60, class_level = 50 WHERE name = ?').bind(name).run();
  }
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const hire = async (name, ...companions) =>
    (await db()).prepare('UPDATE characters SET settlement = ? WHERE name = ?').bind(JSON.stringify({ companions }), name).run();
  const partyTower = async (login) => (await as(login, 'GET', '/api/towers')).data.towers.towers.find((tower) => tower.id === 'party');

  beforeEach(async () => {
    await player('samotna', 'Samotna');
  });

  test('alone, without a companion, the tower is shut and says what it needs', async () => {
    const shut = await partyTower('samotna');
    assert.match(shut.missing, /nie wchodzi się w pojedynkę/);
    assert.match(shut.missing, /co najmniej 1 z graczy Twojej Drużyny albo towarzyszy z Kwater/);
    const entered = await as('samotna', 'POST', '/api/towers/enter', { tower: 'party', floor: 1 });
    assert.equal(entered.status, 409);
    assert.equal(entered.data.error.code, 'no_party');
    assert.equal(entered.data.error.message, shut.missing);
  });

  test('alone with a companion, the character goes in, and the companion fights beside it', async () => {
    await hire('Samotna', companion('c1', 'Bratomir'));
    const open = await partyTower('samotna');
    assert.equal(open.missing, null);
    assert.deepEqual(open.partners, []);
    assert.deepEqual(open.companions, ['Bratomir']);
    const entered = await as('samotna', 'POST', '/api/towers/enter', { tower: 'party', floor: 1 });
    assert.equal(entered.status, 200, JSON.stringify(entered.data).slice(0, 300));
    const { report } = entered.data;
    assert.deepEqual(report.tower.partners, []);
    assert.deepEqual(report.tower.companions, ['Bratomir']);
    assert.ok(report.fights[0].allies.some((unit) => unit.name === 'Bratomir'));
    // A wounded one too: the tower takes nobody's HP.
    await hire('Samotna', { ...companion('c1', 'Bratomir'), wounded: true });
    assert.equal((await partyTower('samotna')).missing, null);
  });

  test('two companions fill the places up to three; the Wieża Solo takes none', async () => {
    await hire('Samotna', companion('c1', 'Bratomir'), companion('c2', 'Dobrosław'), companion('c3', 'Gniewko'));
    assert.deepEqual((await partyTower('samotna')).companions, ['Bratomir', 'Dobrosław']);
    const solo = (await as('samotna', 'GET', '/api/towers')).data.towers.towers.find((tower) => tower.id === 'solo');
    assert.deepEqual([solo.partners, solo.companions, solo.missing], [[], [], null]);
  });

  test('the players of the Drużyna go first, the companions in the places left', async () => {
    await hire('Samotna', companion('c1', 'Bratomir'), companion('c2', 'Dobrosław'));
    await player('druh', 'Druh');
    const { data } = await as('samotna', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
    const tower = await partyTower('samotna');
    assert.deepEqual(tower.partners.map((partner) => partner.name), ['Druh']);
    assert.deepEqual(tower.companions, ['Bratomir']);
    assert.equal(tower.missing, null);
    const entered = await as('samotna', 'POST', '/api/towers/enter', { tower: 'party', floor: 1 });
    assert.equal(entered.status, 200, JSON.stringify(entered.data).slice(0, 300));
    assert.deepEqual([entered.data.report.tower.partners, entered.data.report.tower.companions], [['Druh'], ['Bratomir']]);
    // Two players and nobody hired: in all the same.
    await hire('Samotna');
    const players = await partyTower('samotna');
    assert.deepEqual([players.partners.map((partner) => partner.name), players.companions, players.missing], [['Druh'], [], null]);
  });
});

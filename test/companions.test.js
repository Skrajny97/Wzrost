// Companions (the Osada, part II): the Karczma's four candidates a week, the
// places the relation with the innkeeper gives, a companion in the fights of
// an exploration, its XP and its wounds, and hiring one through the API.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  companionAfterHunt,
  companionCombatant,
  companionPlaces,
  companionReady,
  companionXp,
  drawCandidates,
  hireCost,
  simulateHunt,
} from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const NOW = Date.UTC(2026, 9, 30, 10, 0);
const WEEK = 7 * 86400000;
const character = newCharacter('warrior', { level: 25, classLevel: 25 });
const tuning = content.settlement.companions;

describe('companions in the engine', () => {
  test('four candidates a week, the same all week, each with a class, two or three traits, two skills and gear', () => {
    const candidates = drawCandidates({ character, seed: 's' }, NOW, content);
    assert.equal(candidates.length, tuning.candidates);
    assert.deepEqual(drawCandidates({ character, seed: 's' }, NOW + 3600000, content), candidates);
    assert.notDeepEqual(drawCandidates({ character, seed: 's' }, NOW + WEEK, content), candidates);
    assert.equal(new Set(candidates.map((candidate) => candidate.name)).size, candidates.length);
    for (const candidate of candidates) {
      assert.ok(candidate.level >= character.level + tuning.levelSpread[0] && candidate.level <= character.level + tuning.levelSpread[1]);
      assert.ok(candidate.traits.length === 2 || candidate.traits.length === 3);
      assert.equal(new Set(candidate.traits).size, candidate.traits.length);
      assert.equal(candidate.skills.length, 2);
      assert.ok(candidate.skills.every((id) => content.skillsById[id].classId === candidate.classId));
      assert.ok(candidate.gear.some((item) => item.slot === 'weapon'));
      assert.equal(hireCost(candidate, content), candidate.level * tuning.goldPerLevel);
    }
    // A hired one no longer waits.
    assert.equal(drawCandidates({ character, seed: 's' }, NOW, content, [candidates[0].id]).length, candidates.length - 1);
  });

  test('the relation with the innkeeper gives the first place at its first standing and the second later', () => {
    const points = (id) => content.settlement.standings.find((standing) => standing.id === id).points;
    assert.equal(companionPlaces(0, content), 0);
    assert.equal(companionPlaces(points(tuning.from[0]), content), 1);
    assert.equal(companionPlaces(points(tuning.from[1]), content), 2);
  });

  test('traits change the companion in a fight', () => {
    const [candidate] = drawCandidates({ character, seed: 's' }, NOW, content);
    const plain = companionCombatant({ ...candidate, traits: [] }, {}, content);
    const tough = companionCombatant({ ...candidate, traits: ['tough'] }, {}, content);
    assert.equal(tough.maxHp, Math.round(plain.maxHp * 1.1));
    assert.equal(tough.companion, true);
  });

  test('a companion fights beside the character, the same way for the same seed, and gains XP faster below the character', () => {
    const candidates = drawCandidates({ character, seed: 's' }, NOW, content);
    const hunt = { character, equipped: [], name: 'Próba', areaId: 'boar-thicket', minutes: 60, seed: 'abc' };
    const party = simulateHunt({ ...hunt, companions: [candidates[0]] }, content);
    assert.deepEqual(simulateHunt({ ...hunt, companions: [candidates[0]] }, content), party);
    assert.equal(party.fights[0].allies.length, 2);
    assert.equal(party.fights[0].allies[1].name, candidates[0].name);
    assert.equal(party.companions[0].id, candidates[0].id);
    assert.equal(simulateHunt(hunt, content).companions, undefined);
    const below = { ...candidates[0], level: character.level - 5 };
    assert.equal(companionXp(below, 1000, character.level, content), Math.round(1000 * tuning.xpShare * (1 + tuning.catchUp * 5)));
    const after = companionAfterHunt(below, { xp: 100000, fainted: false, endedAt: NOW }, character.level, content);
    assert.ok(after.level > below.level);
    assert.equal(after.woundedUntil, undefined);
    const hurt = companionAfterHunt(below, { xp: 0, fainted: true, endedAt: NOW }, character.level, content);
    assert.ok(hurt.woundedUntil > NOW);
    assert.equal(companionReady(hurt, NOW), false);
    assert.equal(companionReady(hurt, hurt.woundedUntil), true);
  });
});

describe('companions through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on', SETTLEMENT: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('karczmarka'));
    await call('POST', '/api/character', { cookie, body: { name: 'Karczmarka', classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare(`UPDATE characters SET level = 25, class_level = 25, gold = 100000`).run();
  });

  const settlement = async () => (await call('GET', '/api/settlement', { cookie })).data.settlement;
  const relation = (points) =>
    (async () => (await db()).prepare('UPDATE characters SET settlement = ?').bind(JSON.stringify({ relations: { [content.settlement.tavern.resident]: points } })).run())();

  test('candidates wait in the Karczma, and one is hired once the innkeeper knows the character', async () => {
    let view = (await settlement()).companions;
    assert.equal(view.places, 0);
    assert.equal(view.candidates.length, tuning.candidates);
    const [first, second] = view.candidates;
    assert.equal((await call('POST', '/api/settlement/hire', { cookie, body: { candidateId: first.id } })).data.error.code, 'no_place');
    const known = content.settlement.standings.find((standing) => standing.id === tuning.from[0]).points;
    await relation(known);
    const hired = await call('POST', '/api/settlement/hire', { cookie, body: { candidateId: first.id } });
    assert.equal(hired.status, 200);
    assert.equal(hired.data.character.gold, 100000 - first.price);
    view = hired.data.settlement.companions;
    assert.deepEqual(view.hired.map((companion) => companion.id), [first.id]);
    assert.equal(view.candidates.length, tuning.candidates - 1);
    assert.equal((await call('POST', '/api/settlement/hire', { cookie, body: { candidateId: second.id } })).data.error.code, 'no_place');
    // It goes on the next exploration and gains XP from it.
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    const options = JSON.parse((await (await db()).prepare('SELECT options FROM activities').first()).options);
    assert.deepEqual(options.companions.map((companion) => companion.id), [first.id]);
    await (await db()).prepare('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ?').bind(300000, 300000).run();
    const claimed = await call('POST', '/api/hunts/claim', { cookie });
    assert.equal(claimed.status, 200);
    const after = (await settlement()).companions.hired[0];
    assert.ok(after.xp > 0 || after.level > first.level);
    // Dismissed, it leaves and does not come back as a candidate this week.
    const dismissed = await call('POST', '/api/settlement/dismiss', { cookie, body: { companionId: first.id } });
    assert.equal(dismissed.data.settlement.companions.hired.length, 0);
    assert.ok(!dismissed.data.settlement.companions.candidates.some((candidate) => candidate.id === first.id));
  });
});

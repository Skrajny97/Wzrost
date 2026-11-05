// The Bractwa's perks, stage 2 (the author's answers 589 and 591, 4.11.2026):
// the Bractwo Zielarzy gathers more herbs, brews faster and makes potions
// for a time work longer; the Bractwo Łowców brings more materials from
// creatures, the elite and the champion more often (591 B at half) and a
// higher price at the Garbarnia, which raises the most anyone pays for a
// material too.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  brewMinutes,
  brotherhoodPerk,
  buyCeiling,
  drinkTimed,
  explorationPace,
  gatherHerbs,
  herbsPerHour,
  materialPrice,
  mostPotions,
  potionMinutes,
  simulateHunt,
  timedKind,
  withRareOdds,
} from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';

// The newest place's stronger creatures (balance.monsters.huntCurve,
// hunt-strength.test.js) and the harder explorations from the 10th level
// (balance.challenge) aside: these fights test something else.
const calm = { ...content, balance: { ...content.balance, monsters: { ...content.balance.monsters, huntCurve: [] }, challenge: { ...content.balance.challenge, fromLevel: Infinity } } };
import { useServer } from './helpers/server.js';

const { standings } = content.settlement;
const points = (id) => standings.find((standing) => standing.id === id).points;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);
const friend = (brotherhood) => ({ [brotherhood]: points('friend') });

describe('the Bractwo Zielarzy and the Bractwo Łowców in the engine', () => {
  test('the numbers by standing, nothing at the first', () => {
    const at = (id) => standings.map((standing) => brotherhoodPerk(id, { [content.settlement.brotherhoodPerks[id].brotherhood]: standing.points }, content));
    assert.deepEqual(at('herbYield'), [0, 0.05, 0.1, 0.15, 0.2]);
    assert.deepEqual(at('brewFaster'), [0, 0.05, 0.1, 0.15, 0.2]);
    assert.deepEqual(at('potionFights'), [0, 0, 1, 1, 2]);
    assert.deepEqual(at('materialDrops'), [0, 0.05, 0.1, 0.15, 0.2]);
    // 591 B at half: not 10–40% but 5–20%.
    assert.deepEqual(at('rareOdds'), [0, 0.05, 0.1, 0.15, 0.2]);
    assert.deepEqual(at('tanneryPremium'), [0, 0.02, 0.04, 0.06, 0.08]);
  });

  test('Zielarstwo gathers a share more, the same draws otherwise', () => {
    const [herb] = content.herbs;
    close(herbsPerHour(herb, 10, content, 0.2), herbsPerHour(herb, 10, content) * 1.2);
    let plain = 0;
    let more = 0;
    for (let index = 0; index < 60; index += 1) {
      const gathering = { herbIds: [herb.id], minutes: 120, level: 10, seed: `herbs-${index}` };
      plain += gatherHerbs(gathering, content)[herb.id];
      more += gatherHerbs({ ...gathering, more: 0.2 }, content)[herb.id];
    }
    assert.ok(more > plain * 1.1, `${more} vs ${plain}`);
  });

  test('Alchemia brews a share shorter, and as many more potions fit into the longest brewing', () => {
    close(potionMinutes(10, content, 0.2), potionMinutes(10, content) * 0.8);
    assert.ok(brewMinutes(10, 10, content, 0.2) < brewMinutes(10, 10, content));
    const potion = content.potions[0];
    const herbs = Object.fromEntries(Object.keys(potion.herbs).map((id) => [id, 10000]));
    assert.ok(mostPotions(potion, 10, herbs, content, 0.2) > mostPotions(potion, 10, herbs, content));
  });

  test('a potion for a time drunk works as many fights longer', () => {
    const potion = content.potions.find((candidate) => timedKind(candidate));
    const kind = timedKind(potion);
    assert.equal(drinkTimed({}, potion)[kind].fights, potion.fights);
    assert.equal(drinkTimed({}, potion, 2)[kind].fights, potion.fights + 2);
  });

  test('the elite and the champion a share more often, never when avoided', () => {
    const pace = explorationPace(120, content);
    close(withRareOdds(pace, { more: 0.2 }, content).eliteChance, Math.min(1, pace.eliteChance * 1.2));
    close(withRareOdds(pace, { more: 0.2 }, content).championChance, Math.min(1, pace.championChance * 1.2));
    assert.equal(withRareOdds(pace, { avoidRare: true, more: 0.2 }, content).eliteChance, 0);
    assert.deepEqual(withRareOdds(pace, {}, content), pace);
  });

  test('more materials from the creatures beaten', () => {
    const character = newCharacter('warrior', { level: 25, classLevel: 25 });
    const count = (hunt) => Object.values(hunt.materials).reduce((sum, pieces) => sum + pieces, 0);
    let plain = 0;
    let more = 0;
    for (let index = 0; index < 20; index += 1) {
      const hunt = { character, equipped: [], name: 'Łowca', areaId: 'boar-thicket', minutes: 120, seed: `materials-${index}` };
      plain += count(simulateHunt(hunt, calm));
      more += count(simulateHunt({ ...hunt, materialsMore: 0.2 }, calm));
    }
    assert.ok(more > plain, `${more} vs ${plain}`);
  });

  test('the most anyone pays for a creature material takes in the Garbarnia’s best premium with the Bractwo Łowców', () => {
    const key = 'wolf-pelt:common';
    const without = {
      ...content,
      settlement: {
        ...content.settlement,
        brotherhoodPerks: { ...content.settlement.brotherhoodPerks, tanneryPremium: { brotherhood: 'hunters', byStanding: [0, 0, 0, 0, 0] } },
      },
    };
    const best = Math.max(...content.settlement.tannery.premium);
    // The orders pay more for a material today, so the most anyone pays
    // stays above the Garbarnia's best price with the perk too.
    const ceiling = buyCeiling({ kind: 'material', key }, content);
    assert.ok(ceiling >= buyCeiling({ kind: 'material', key }, without));
    assert.ok(ceiling >= materialPrice('common', content) * (1 + best + 0.08));
  });
});

describe('the Bractwo Zielarzy and the Bractwo Łowców through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on', SETTLEMENT: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('bractwa'));
    await call('POST', '/api/character', { cookie, body: { name: 'Bractwa', classId: 'warrior', appearance: 'male' } });
    await (await db()).prepare('UPDATE characters SET level = 25, class_level = 25, tutorial = NULL').run();
  });

  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const repute = (reputation) => set('settlement = ?', JSON.stringify({ reputation }));
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const options = async () => JSON.parse((await (await db()).prepare('SELECT options FROM activities').first()).options);

  test('Zielarstwo: the view shows more herbs an hour, and the gathering keeps its share as it began', async () => {
    const [herb] = content.herbs;
    const before = (await character()).professions.gathering.herbs.find((one) => one.id === herb.id).perHour;
    await repute(friend('herbalists'));
    const after = (await character()).professions.gathering.herbs.find((one) => one.id === herb.id).perHour;
    close(after, before * 1.2);
    const started = await call('POST', '/api/professions/gather', { cookie, body: { herbs: [herb.id], minutes: 60 } });
    assert.equal(started.status, 201, JSON.stringify(started.data));
    assert.equal((await options()).more, 0.2);
  });

  test('Alchemia: a brewing takes a share less time, and a potion for a time drunk works longer', async () => {
    const potion = content.potions.find((candidate) => candidate.level === 1 && !candidate.catalyst) ?? content.potions[0];
    const herbs = JSON.stringify(Object.fromEntries(Object.keys(potion.herbs).map((id) => [id, 200])));
    // Alchemia at its top, so every recipe is known.
    await set('herbs = ?, professions = ?', herbs, JSON.stringify({ [content.brewing.profession]: { level: 100, xp: 0 } }));
    const plain = (await character()).professions.brewing.potionMinutes;
    await repute(friend('herbalists'));
    close((await character()).professions.brewing.potionMinutes, plain * 0.8);

    const timed = content.potions.find((candidate) => timedKind(candidate));
    const kind = timedKind(timed);
    await set('potions = ?', JSON.stringify({ [timed.id]: 1 }));
    const drunk = await call('POST', '/api/potions/drink', { cookie, body: { potionId: timed.id } });
    assert.equal(drunk.status, 200, JSON.stringify(drunk.data));
    const buffs = JSON.parse((await (await db()).prepare('SELECT buffs FROM characters').first()).buffs);
    assert.equal(buffs[kind].fights, timed.fights + 2);
  });

  test('an exploration keeps the Bractwo Łowców’s shares as it set out, without the elites’ when it avoids them', async () => {
    await repute(friend('hunters'));
    const area = content.regions[0].areas?.[0]?.id ?? content.areas[0].id;
    const started = await call('POST', '/api/hunts', { cookie, body: { areaId: area, minutes: 30 } });
    assert.equal(started.status, 201, JSON.stringify(started.data));
    assert.deepEqual([(await options()).rareMore, (await options()).materialsMore], [0.2, 0.2]);
    await (await db()).prepare('DELETE FROM activities').run();
    const avoiding = await call('POST', '/api/hunts', { cookie, body: { areaId: area, minutes: 30, avoidRare: true } });
    assert.equal(avoiding.status, 201, JSON.stringify(avoiding.data));
    assert.deepEqual([(await options()).rareMore, (await options()).materialsMore], [undefined, 0.2]);
  });

  test('the Garbarnia pays the Bractwo Łowców’s points on top of the relation’s premium', async () => {
    const tannery = async () => {
      const answer = await call('GET', '/api/settlement', { cookie });
      assert.equal(answer.status, 200, JSON.stringify(answer.data));
      return answer.data.settlement.tannery;
    };
    const plain = await tannery();
    await repute(friend('hunters'));
    close((await tannery()).premium, plain.premium + 0.08);
  });
});

// The wanted posters' places (src/engine/wanted.js, wantedPosters;
// src/server/wanted.js; 12.11.2026, the author: „Te listy gończe,
// poszukiwani powinni sięgać maksymalnie 2 stopnie niżej niż pozwala
// level”, after a player at level 43 got posters of the first land, 400
// gold each): the day's posters come from the character's highest open
// place and the two below it, whatever their land, with the Sala prób's
// place among them, so the bounties grow with the character. A day drawn
// before, without the newest land (10.11.2026 to 12.11.2026), is drawn
// anew from its first look („Albo generuj nowych poszukiwanych”), with the
// poster in hand kept among the day's.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { areaOpenFor, questPeriod, wantedPosters } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rules = content.settlement.wanted;
const openTo = (classLevel, early = null) => content.areas.filter((area) => areaOpenFor(area, classLevel, early, content)).map((area) => area.id);
// The places of a day's posters, whatever the draw.
const placesOf = (classLevel, early = null) => new Set(['a', 'b', 'c', 'd', 'e'].flatMap((seed) => wantedPosters(classLevel, '2026-11-12', seed, content, early).map((poster) => poster.areaId)));
const sorted = (ids) => [...ids].sort();

describe('the wanted posters come from the highest open place and the two below it', () => {
  test('the rules: three places, a creature\'s poster for each', () => {
    assert.equal(rules.places, 3);
    assert.equal(rules.creatures, rules.places);
  });

  test('class level 43, as the player\'s: the Pajęczy Parów, the Rysia Grań and the Wilcze Kręgi, 1900 to 2500 gold', () => {
    assert.deepEqual(openTo(43).slice(-3), ['spider-gully', 'lynx-ridge', 'wolf-circles']);
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const posters = wantedPosters(43, '2026-11-12', seed, content);
      const creatures = posters.filter((poster) => poster.kind === 'creature');
      // One for each of the three places, the highest first, and an outlaw
      // in one of them.
      assert.deepEqual(creatures.map((poster) => poster.areaId), ['wolf-circles', 'lynx-ridge', 'spider-gully']);
      assert.deepEqual(creatures.map((poster) => poster.gold), [2500, 2200, 1900]);
      const outlaws = posters.filter((poster) => poster.kind === 'outlaw');
      assert.equal(outlaws.length, 1);
      assert.ok(['spider-gully', 'lynx-ridge', 'wolf-circles'].includes(outlaws[0].areaId));
      // None of the first land, none below 1900 gold.
      assert.ok(posters.every((poster) => content.areasById[poster.areaId].regionId === 'stone-glade' && poster.gold >= 1900), JSON.stringify(posters));
    }
  });

  test('the newest land counts: a place just opened is among them, across the lands\' border too', () => {
    // Class level 25 has just opened the Omszałe Głazy, the second land's
    // first place.
    assert.equal(openTo(25).at(-1), 'mossy-boulders');
    assert.deepEqual(sorted(placesOf(25)), sorted(['viper-heaps', 'boar-thicket', 'mossy-boulders']));
    // Class level 60: the Zarośnięte Rozlewiska's highest three.
    assert.deepEqual(sorted(placesOf(60)), sorted(openTo(60).slice(-3)));
    assert.ok([...placesOf(60)].every((id) => content.areasById[id].regionId === 'backwaters'));
  });

  test('fewer places open: those there are', () => {
    assert.deepEqual([...placesOf(1)], ['windfalls-edge']);
    assert.deepEqual(sorted(placesOf(5)), sorted(['windfalls-edge', 'fox-ravines']));
    // Of two places, two creatures' posters and the outlaw.
    const posters = wantedPosters(5, '2026-11-12', 'a', content);
    assert.equal(posters.filter((poster) => poster.kind === 'creature').length, 2);
    assert.equal(posters.filter((poster) => poster.kind === 'outlaw').length, 1);
  });

  test('the place the Sala prób opened is the highest of them', () => {
    const early = content.areas.find((area) => !areaOpenFor(area, 43, null, content));
    assert.equal(early.id, 'glade-heart');
    assert.deepEqual(sorted(placesOf(43, early.id)), sorted(['lynx-ridge', 'wolf-circles', 'glade-heart']));
  });
});

describe('the wanted posters\' places through the API', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on' });
  let cookie;
  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const stored = async () => JSON.parse((await (await db()).prepare('SELECT settlement FROM characters').first()).settlement);
  const wanted = async () => (await call('GET', '/api/settlement', { cookie })).data.settlement.wanted;
  const characterId = async () => (await (await db()).prepare('SELECT id FROM characters').first()).id;
  const today = () => questPeriod('daily', Date.now(), content).key;
  // A poster of the newest-land rule (10.11.2026): the Wiatrołomy's.
  const old = (id, place, monster, gold) => ({ id: `${id}:${place}:${monster}`, kind: 'creature', areaId: place, monsterId: monster, name: 'Stara odmiana', female: false, level: 26, gold });

  beforeEach(async () => {
    ({ cookie } = await signUp('tropicielka'));
    await call('POST', '/api/character', { cookie, body: { name: 'Tropicielka', classId: 'warrior', appearance: 'female' } });
    await set('level = 80, class_level = 43, tutorial = NULL');
  });

  test('the day\'s first look draws from the three highest places, and keeps its basis', async () => {
    const view = await wanted();
    assert.deepEqual(
      view.posters.map((poster) => poster.id),
      wantedPosters(43, today(), await characterId(), content).map((poster) => poster.id),
    );
    assert.ok(view.posters.every((poster) => ['spider-gully', 'lynx-ridge', 'wolf-circles'].includes(poster.areaId)));
    assert.deepEqual((await stored()).wanted.basis, { classLevel: 43, early: null });
  });

  test('a day drawn by the newest-land rule is drawn anew from its first look: the poster in hand stays first, those done stay done', async () => {
    // The first look made at class level 41, before the change, with a
    // poster of the Wiatrołomy done and another in hand.
    const day = today();
    const done = old(day, 'fox-ravines', 'fox', 400);
    const taken = { ...old(day, 'boar-thicket', 'boar', 1300), beaten: false };
    await set('settlement = ?', JSON.stringify({ wanted: { day, basis: { classLevel: 41, early: null, lands: true }, done: [done.id], taken } }));
    const view = await wanted();
    const fresh = wantedPosters(41, day, await characterId(), content);
    assert.ok(fresh.every((poster) => ['lynx-ridge', 'wolf-circles', 'spider-gully'].includes(poster.areaId)), JSON.stringify(fresh.map((poster) => poster.areaId)));
    assert.deepEqual(
      view.posters.map((poster) => [poster.id, poster.state]),
      [[taken.id, 'taken'], ...fresh.map((poster) => [poster.id, 'open'])],
    );
    assert.equal(view.earlier, null);
    assert.equal(view.holding, true);
    // Another is not taken while it is in hand; given back, it is gone.
    assert.equal((await call('POST', '/api/settlement/wanted', { cookie, body: { posterId: fresh[0].id } })).data.error.code, 'holding');
    const dropped = await call('POST', '/api/settlement/wanted/drop', { cookie });
    assert.equal(dropped.status, 200, JSON.stringify(dropped.data).slice(0, 300));
    assert.deepEqual(dropped.data.settlement.wanted.posters.map((poster) => poster.id), fresh.map((poster) => poster.id));
    assert.equal((await call('POST', '/api/settlement/wanted', { cookie, body: { posterId: taken.id } })).data.error.code, 'no_poster');
    // The record keeps the first look's level without the old rule's mark,
    // and the poster done.
    assert.deepEqual((await stored()).wanted, { day, basis: { classLevel: 41, early: null }, done: [done.id], taken: null });
  });

  test('the poster in hand of such a day, its target beaten, pays its own bounty and is done', async () => {
    const day = today();
    const taken = { ...old(day, 'boar-thicket', 'boar', 1300), beaten: true };
    await set('settlement = ?', JSON.stringify({ wanted: { day, basis: { classLevel: 43, early: null, lands: true }, done: [], taken } }));
    const view = await wanted();
    assert.deepEqual(view.posters[0], { ...view.posters[0], id: taken.id, state: 'beaten', gold: 1300 });
    const claimed = await call('POST', '/api/settlement/wanted/claim', { cookie });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
    assert.equal(claimed.data.claimed.gold, 1300);
    const after = claimed.data.settlement.wanted;
    assert.ok(after.posters.every((poster) => poster.state === 'open' && poster.id !== taken.id));
    assert.deepEqual((await stored()).wanted.done, [taken.id]);
  });
});

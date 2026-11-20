// The wanted posters' places (src/engine/wanted.js, wantedPlaces and
// wantedPosters; src/server/wanted.js). Since 20.11.2026 one land below
// the character's highest open place, and two once that place is past the
// 100th level (the author: „poszukiwani z listów gończych z tablicy zlecen
// z racji wyższego poziomu trudności muszą pójść krainę lub dwie niżej”;
// the tiers by the measurement in DECISIONS.md), with the Sala prób's place
// counted as its highest; with too few places open below it, its lowest.
// Each poster pays the bounty of the place as many places higher, so the
// bounties are those of its highest places, as from 12.11.2026
// („maksymalnie 2 stopnie niżej niż pozwala level”, after a player at level
// 43 got posters of the first land, 400 gold each). A day drawn before is
// drawn anew from its first look („Albo generuj nowych poszukiwanych”),
// with the poster in hand kept as it was taken.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { areaOpenFor, questPeriod, wantedGold, wantedPlaces, wantedPosters } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rules = content.settlement.wanted;
const open = (classLevel, early = null) => content.areas.filter((area) => areaOpenFor(area, classLevel, early, content));
const openTo = (classLevel, early = null) => open(classLevel, early).map((area) => area.id);
// The places of a day's posters, whatever the draw.
const placesOf = (classLevel, early = null) => new Set(['a', 'b', 'c', 'd', 'e'].flatMap((seed) => wantedPosters(classLevel, '2026-11-20', seed, content, early).map((poster) => poster.areaId)));
const sorted = (ids) => [...ids].sort();
// The bounties of the posters before 20.11.2026: those of the three highest
// open places, the highest first.
const before = (classLevel, early = null) => open(classLevel, early).slice(-rules.places).map((area) => wantedGold(area, content, classLevel)).reverse();
// How many places lower than the highest open place the posters go: by the
// tier of its first level.
const lowerOf = (highest) => (highest.minLevel >= 101 ? 10 : 5);

describe('the wanted posters come from places one or two lands below the highest open one', () => {
  test('the rules: three places, five (a land of five) below the highest up to the place 96–100, ten (two lands) from 101–105, a creature\'s poster for each', () => {
    assert.equal(rules.places, 3);
    assert.deepEqual(rules.lower, [{ from: 1, places: 5 }, { from: 101, places: 10 }]);
    assert.equal(rules.creatures, rules.places);
    assert.equal(content.areas.filter((area) => area.regionId === content.areas[0].regionId).length, 5);
  });

  test('class level 100: from the Wilcze Kręgi to the Trzcinowisko, with the bounties of the Tlące się Torfy to the Czarny Ols', () => {
    const ids = openTo(100);
    assert.deepEqual(ids.slice(-rules.places), ['smoldering-peat', 'old-diggings', 'black-alder-carr']);
    assert.deepEqual(ids.slice(-13, -10), ['wolf-circles', 'glade-heart', 'reed-beds']);
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const posters = wantedPosters(100, '2026-11-20', seed, content);
      const creatures = posters.filter((poster) => poster.kind === 'creature');
      assert.deepEqual(creatures.map((poster) => poster.areaId), ['reed-beds', 'glade-heart', 'wolf-circles']);
      // The targets of their own places, at their elites' level.
      assert.deepEqual(creatures.map((poster) => poster.level), [56, 51, 46]);
      // The gold of the three highest, as before.
      assert.deepEqual(creatures.map((poster) => poster.gold), [6100, 5800, 5500]);
      assert.deepEqual(creatures.map((poster) => poster.gold), before(100));
    }
  });

  test('every class level: the window five or ten places lower, the same gold as before, the outlaw in one of the places, paid as its place as many higher', () => {
    for (let classLevel = 1; classLevel <= 400; classLevel += 3) {
      const all = open(classLevel);
      const end = Math.max(all.length - lowerOf(all.at(-1)), Math.min(rules.places, all.length));
      const window = all.slice(Math.max(0, end - rules.places), end);
      assert.deepEqual(wantedPlaces(all, content), { places: window, shift: all.length - end });
      for (const seed of ['a', 'b']) {
        const posters = wantedPosters(classLevel, '2026-11-20', seed, content);
        const creatures = posters.filter((poster) => poster.kind === 'creature');
        assert.deepEqual(sorted(creatures.map((poster) => poster.areaId)), sorted(window.map((area) => area.id)), `class level ${classLevel}`);
        assert.deepEqual(creatures.map((poster) => poster.gold), before(classLevel), `class level ${classLevel}`);
        const outlaws = posters.filter((poster) => poster.kind === 'outlaw');
        assert.equal(outlaws.length, 1);
        const at = all.findIndex((area) => area.id === outlaws[0].areaId);
        assert.ok(window.includes(all[at]), `class level ${classLevel}: ${outlaws[0].areaId}`);
        assert.equal(outlaws[0].gold, wantedGold(all[at + all.length - end], content, classLevel));
        assert.equal(outlaws[0].level, all[at].maxLevel + content.balance.hunt.eliteLevelBonus);
      }
    }
  });

  test('one land down while the highest open place starts at the 100th level or below; with fewer places below it, the lowest three, still with the gold of the highest', () => {
    // Thirteen places, the highest the Zatopiony Las (61–65): five places
    // lower, from the Omszałe Głazy to the Rysia Grań.
    assert.equal(openTo(60).length, 13);
    assert.deepEqual(sorted(placesOf(60)), sorted(['mossy-boulders', 'spider-gully', 'lynx-ridge']));
    // One more place, one place up.
    assert.deepEqual(sorted(placesOf(65)), sorted(['spider-gully', 'lynx-ridge', 'wolf-circles']));
    // Class level 43, as the player's of 12.11.2026: from the Lisie Jary to
    // the Żmijowe Zwalisko, for the gold of the Pajęczy Parów, the Rysia
    // Grań and the Wilcze Kręgi.
    assert.deepEqual(sorted(placesOf(43)), sorted(['fox-ravines', 'raven-hollows', 'viper-heaps']));
    const posters = wantedPosters(43, '2026-11-20', 'a', content);
    assert.deepEqual(posters.filter((poster) => poster.kind === 'creature').map((poster) => poster.gold), [2500, 2200, 1900]);
    assert.ok(posters.every((poster) => poster.gold >= 1900), JSON.stringify(posters));
    // Eight places, five of them below the three: the lowest three, for the
    // gold of the highest three.
    assert.equal(openTo(35).length, 8);
    assert.deepEqual(sorted(placesOf(35)), sorted(['windfalls-edge', 'fox-ravines', 'raven-hollows']));
    assert.deepEqual(wantedPosters(35, '2026-11-20', 'a', content).filter((poster) => poster.kind === 'creature').map((poster) => poster.gold), before(35));
  });

  test('the tiers\' border: the highest open place 96–100 one land down, 101–105 two lands down, the Sala prób\'s place too', () => {
    // Class level 99: the highest the Stare Wyrobisko (96–100), so from the
    // Zatopiony Las to the Stare Koryto, for 5200 to 5800 gold.
    assert.equal(open(99).at(-1).id, 'old-diggings');
    for (const seed of ['a', 'b', 'c']) {
      const creatures = wantedPosters(99, '2026-11-20', seed, content).filter((poster) => poster.kind === 'creature');
      assert.deepEqual(creatures.map((poster) => poster.areaId), ['old-riverbed', 'willow-isles', 'drowned-forest']);
      assert.deepEqual(creatures.map((poster) => poster.gold), [5800, 5500, 5200]);
    }
    assert.equal(wantedPlaces(open(99), content).shift, 5);
    // Class level 100: the Czarny Ols (101–105) open, so two lands down,
    // from the Wilcze Kręgi to the Trzcinowisko, for 5500 to 6100 gold.
    assert.equal(open(100).at(-1).id, 'black-alder-carr');
    assert.deepEqual(sorted(placesOf(100)), sorted(['wolf-circles', 'glade-heart', 'reed-beds']));
    assert.equal(wantedPlaces(open(100), content).shift, 10);
    // Across the whole tiers: 95 as 99, 104 as 100.
    assert.deepEqual(sorted(placesOf(95)), sorted(placesOf(99)));
    assert.deepEqual(sorted(placesOf(104)), sorted(placesOf(100)));
    // At class level 99 the Czarny Ols opened in the Sala prób is the
    // highest: two lands down, as at 100.
    assert.deepEqual(sorted(placesOf(99, 'black-alder-carr')), sorted(['wolf-circles', 'glade-heart', 'reed-beds']));
    assert.deepEqual(wantedPosters(99, '2026-11-20', 'a', content, 'black-alder-carr').filter((poster) => poster.kind === 'creature').map((poster) => poster.gold), before(99, 'black-alder-carr'));
  });

  test('fewer than four places open: those there are, as before', () => {
    assert.deepEqual([...placesOf(1)], ['windfalls-edge']);
    assert.deepEqual(sorted(placesOf(5)), sorted(['windfalls-edge', 'fox-ravines']));
    // Of two places, two creatures' posters and the outlaw.
    const posters = wantedPosters(5, '2026-11-20', 'a', content);
    assert.equal(posters.filter((poster) => poster.kind === 'creature').length, 2);
    assert.equal(posters.filter((poster) => poster.kind === 'outlaw').length, 1);
    assert.deepEqual(posters.filter((poster) => poster.kind === 'creature').map((poster) => poster.gold), [400, 100]);
  });

  test('the place the Sala prób opened counts as the highest open one', () => {
    const early = content.areas.find((area) => !areaOpenFor(area, 100, null, content));
    assert.equal(early.id, 'black-tarn');
    assert.deepEqual(openTo(100, early.id).slice(-13, -10), ['glade-heart', 'reed-beds', 'beaver-dams']);
    assert.deepEqual(sorted(placesOf(100, early.id)), sorted(['glade-heart', 'reed-beds', 'beaver-dams']));
    // Paid as the highest three with it, the Sala prób's the best.
    const posters = wantedPosters(100, '2026-11-20', 'a', content, early.id);
    assert.deepEqual(posters.filter((poster) => poster.kind === 'creature').map((poster) => poster.gold), before(100, early.id));
    assert.equal(posters[0].gold, wantedGold(early, content, 100));
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
  // A poster of the rule before 20.11.2026, of the three highest places.
  const old = (id, place, monster, gold, level) => ({ id: `${id}:${place}:${monster}`, kind: 'creature', areaId: place, monsterId: monster, name: 'Stara odmiana', female: false, level, gold });

  beforeEach(async () => {
    ({ cookie } = await signUp('tropicielka'));
    await call('POST', '/api/character', { cookie, body: { name: 'Tropicielka', classId: 'warrior', appearance: 'female' } });
    await set('level = 100, class_level = 100, tutorial = NULL');
  });

  test('the day\'s first look draws from the places two lands below, and keeps its basis', async () => {
    const view = await wanted();
    assert.deepEqual(
      view.posters.map((poster) => poster.id),
      wantedPosters(100, today(), await characterId(), content).map((poster) => poster.id),
    );
    assert.ok(view.posters.every((poster) => ['wolf-circles', 'glade-heart', 'reed-beds'].includes(poster.areaId)));
    assert.deepEqual((await stored()).wanted.basis, { classLevel: 100, early: null });
  });

  test('a day drawn by the rule before is drawn anew from its first look: the poster in hand stays first, as taken, and on an exploration; those done stay done', async () => {
    // The first look made at class level 100, before the change, with a
    // poster of the Tlące się Torfy done and one of the Czarny Ols in hand.
    const day = today();
    const done = old(day, 'smoldering-peat', 'zmij', 5500, 96);
    const taken = { ...old(day, 'black-alder-carr', 'pond-turtle', 6100, 106), beaten: false };
    await set('settlement = ?', JSON.stringify({ wanted: { day, basis: { classLevel: 100, early: null }, done: [done.id], taken } }));
    const view = await wanted();
    const fresh = wantedPosters(100, day, await characterId(), content);
    assert.ok(fresh.every((poster) => ['wolf-circles', 'glade-heart', 'reed-beds'].includes(poster.areaId)), JSON.stringify(fresh.map((poster) => poster.areaId)));
    assert.deepEqual(
      view.posters.map((poster) => [poster.id, poster.state, poster.gold]),
      [[taken.id, 'taken', 6100], ...fresh.map((poster) => [poster.id, 'open', poster.gold])],
    );
    assert.equal(view.earlier, null);
    assert.equal(view.holding, true);
    // Another is not taken while it is in hand.
    assert.equal((await call('POST', '/api/settlement/wanted', { cookie, body: { posterId: fresh[0].id } })).data.error.code, 'holding');
    // Carried on an exploration of its place, it is not given back.
    const hunt = await call('POST', '/api/hunts', { cookie, body: { areaId: taken.areaId, minutes: 60 } });
    assert.equal(hunt.status, 201, JSON.stringify(hunt.data).slice(0, 300));
    assert.equal((await call('POST', '/api/settlement/wanted/drop', { cookie })).data.error.code, 'carried');
    assert.deepEqual((await wanted()).posters[0], view.posters[0]);
    // With the exploration given up, it is; then it is gone from the board.
    await (await db()).prepare('DELETE FROM activities').run();
    const dropped = await call('POST', '/api/settlement/wanted/drop', { cookie });
    assert.equal(dropped.status, 200, JSON.stringify(dropped.data).slice(0, 300));
    assert.deepEqual(dropped.data.settlement.wanted.posters.map((poster) => poster.id), fresh.map((poster) => poster.id));
    assert.equal((await call('POST', '/api/settlement/wanted', { cookie, body: { posterId: taken.id } })).data.error.code, 'no_poster');
    assert.deepEqual((await stored()).wanted, { day, basis: { classLevel: 100, early: null }, done: [done.id], taken: null });
  });

  test('the poster in hand of such a day, its target beaten, pays its own bounty and is done', async () => {
    const day = today();
    const taken = { ...old(day, 'old-diggings', 'giant-rat', 5800, 101), beaten: true };
    await set('settlement = ?', JSON.stringify({ wanted: { day, basis: { classLevel: 100, early: null }, done: [], taken } }));
    const view = await wanted();
    assert.deepEqual(view.posters[0], { ...view.posters[0], id: taken.id, state: 'beaten', gold: 5800 });
    const claimed = await call('POST', '/api/settlement/wanted/claim', { cookie });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
    assert.equal(claimed.data.claimed.gold, 5800);
    const after = claimed.data.settlement.wanted;
    assert.ok(after.posters.every((poster) => poster.state === 'open' && poster.id !== taken.id));
    assert.deepEqual((await stored()).wanted.done, [taken.id]);
  });

  test('a poster in hand the new draw has too shows as taken, with the bounty it was taken with', async () => {
    // Class level 22, five places: before, the Krucze Wykroty were the
    // lowest of the three highest, for 700 gold; now the highest of the
    // lowest three, paid as the Dzicza Głusza two places higher.
    await set('class_level = 22');
    const day = today();
    const taken = { ...old(day, 'raven-hollows', 'crow', 700, 16), beaten: false };
    await set('settlement = ?', JSON.stringify({ wanted: { day, basis: { classLevel: 22, early: null }, done: [], taken } }));
    const fresh = wantedPosters(22, day, await characterId(), content);
    assert.equal(fresh.find((poster) => poster.id === taken.id).gold, 1300);
    const view = await wanted();
    assert.deepEqual(view.posters.map((poster) => poster.id), fresh.map((poster) => poster.id));
    const held = view.posters.find((poster) => poster.id === taken.id);
    assert.deepEqual([held.state, held.gold], ['taken', 700]);
    await set('settlement = ?', JSON.stringify({ wanted: { day, basis: { classLevel: 22, early: null }, done: [], taken: { ...taken, beaten: true } } }));
    assert.equal((await call('POST', '/api/settlement/wanted/claim', { cookie })).data.claimed.gold, 700);
  });
});

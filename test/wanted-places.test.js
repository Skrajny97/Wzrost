// The wanted posters' places (src/engine/wanted.js, wantedPlaces and
// wantedPosters; src/server/wanted.js). Since 20.11.2026 a few places below
// the character's highest open place, a place having five levels: one
// place while that place starts at the 50th level or below, two from the
// place 51–55, three from 101–105 (the author: „bardziej chodziło żeby było
// tak z 5-10 lvli niżej niż odblokowane regiony wewnętrzne na niskich
// lvlach i z 15 na wyższych lvlach”; in 0.4.77–0.4.79 whole lands, five or
// ten places), with the Sala prób's place counted as its highest; with too
// few places open below it, its lowest. Each poster pays the bounty of the
// place as many places higher, so the bounties are those of its highest
// places, as from 12.11.2026 („maksymalnie 2 stopnie niżej niż pozwala
// level”, after a player at level 43 got posters of the first land, 400
// gold each). A day drawn before is drawn anew from its first look („Albo
// generuj nowych poszukiwanych”), with the poster in hand kept as it was
// taken.

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
// A day's posters for the creatures, the highest first.
const creaturesOf = (classLevel, seed = 'a', early = null) => wantedPosters(classLevel, '2026-11-20', seed, content, early).filter((poster) => poster.kind === 'creature');
// The bounties of the posters before 20.11.2026: those of the three highest
// open places, the highest first.
const before = (classLevel, early = null) => open(classLevel, early).slice(-rules.places).map((area) => wantedGold(area, content, classLevel)).reverse();
// How many places lower than the highest open place the posters go: by the
// tier of its first level.
const lowerOf = (highest) => (highest.minLevel >= 101 ? 3 : highest.minLevel >= 51 ? 2 : 1);

describe('the wanted posters come from places one, two or three places below the highest open one', () => {
  test('the rules: three places, one below the highest up to the place 46–50, two from 51–55, three from 101–105, a place of five levels, a creature\'s poster for each', () => {
    assert.equal(rules.places, 3);
    assert.deepEqual(rules.lower, [{ from: 1, places: 1 }, { from: 51, places: 2 }, { from: 101, places: 3 }]);
    assert.equal(rules.creatures, rules.places);
    // One place lower is five levels lower.
    assert.ok(content.areas.every((area) => area.maxLevel - area.minLevel + 1 === 5));
  });

  test('class level 100: from the Żurawie Łąki to the Rosiczkowe Pole, with the bounties of the Tlące się Torfy to the Czarny Ols', () => {
    const ids = openTo(100);
    assert.deepEqual(ids.slice(-rules.places), ['smoldering-peat', 'old-diggings', 'black-alder-carr']);
    assert.deepEqual(ids.slice(-6, -3), ['crane-meadows', 'leech-pools', 'sundew-field']);
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const creatures = creaturesOf(100, seed);
      assert.deepEqual(creatures.map((poster) => poster.areaId), ['sundew-field', 'leech-pools', 'crane-meadows']);
      // The targets of their own places, at their elites' level.
      assert.deepEqual(creatures.map((poster) => poster.level), [91, 86, 81]);
      // The gold of the three highest, as before.
      assert.deepEqual(creatures.map((poster) => poster.gold), [6100, 5800, 5500]);
      assert.deepEqual(creatures.map((poster) => poster.gold), before(100));
    }
  });

  test('every class level: the window one, two or three places lower, the same gold as before, the outlaw in one of the places, paid as its place as many higher', () => {
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

  test('one place down while the highest open place starts at the 50th level or below, two from 51–55, three from 101–105, still with the gold of the highest', () => {
    // Nine places, the highest the Wilcze Kręgi (41–45): one place lower,
    // from the Omszałe Głazy to the Rysia Grań. Class level 43, as the
    // player's of 12.11.2026, for the gold of the Pajęczy Parów, the Rysia
    // Grań and the Wilcze Kręgi.
    assert.equal(openTo(43).length, 9);
    assert.deepEqual(sorted(placesOf(43)), sorted(['mossy-boulders', 'spider-gully', 'lynx-ridge']));
    const posters = wantedPosters(43, '2026-11-20', 'a', content);
    assert.deepEqual(posters.filter((poster) => poster.kind === 'creature').map((poster) => poster.gold), [2500, 2200, 1900]);
    assert.ok(posters.every((poster) => poster.gold >= 1900), JSON.stringify(posters));
    // One more place, one place up.
    assert.deepEqual(sorted(placesOf(45)), sorted(['spider-gully', 'lynx-ridge', 'wolf-circles']));
    // Thirteen places, the highest the Zatopiony Las (61–65): two places
    // lower, from the Wilcze Kręgi to the Trzcinowisko; one more, one up.
    assert.equal(openTo(60).length, 13);
    assert.deepEqual(sorted(placesOf(60)), sorted(['wolf-circles', 'glade-heart', 'reed-beds']));
    assert.deepEqual(sorted(placesOf(65)), sorted(['glade-heart', 'reed-beds', 'beaver-dams']));
    assert.deepEqual(creaturesOf(60).map((poster) => poster.gold), before(60));
    // Twenty-two places, the highest the Czarna Toń (106–110): three places
    // lower, from the Pijawkowe Oczka to the Tlące się Torfy.
    assert.equal(openTo(105).length, 22);
    assert.deepEqual(sorted(placesOf(105)), sorted(['leech-pools', 'sundew-field', 'smoldering-peat']));
    assert.deepEqual(creaturesOf(105).map((poster) => poster.gold), [6400, 6100, 5800]);
    assert.deepEqual(creaturesOf(105).map((poster) => poster.gold), before(105));
  });

  test('the tiers\' borders: the highest open place 46–50 one place down, 51–55 two, 96–100 two, 101–105 three, the same places for the gold one place up, the Sala prób\'s place too', () => {
    // Class level 49: the highest the Serce Uroczyska (46–50), one place
    // down, from the Pajęczy Parów to the Wilcze Kręgi, for 2200 to 2800
    // gold. Class level 50: the Trzcinowisko (51–55) open, two places down,
    // the same places, for 2500 to 3100 gold.
    assert.equal(open(49).at(-1).id, 'glade-heart');
    assert.equal(open(50).at(-1).id, 'reed-beds');
    // Class level 99: the highest the Stare Wyrobisko (96–100), two places
    // down, from the Żurawie Łąki to the Rosiczkowe Pole, for 5200 to 5800
    // gold. Class level 100: the Czarny Ols (101–105) open, three places
    // down, the same places, for 5500 to 6100 gold.
    assert.equal(open(99).at(-1).id, 'old-diggings');
    assert.equal(open(100).at(-1).id, 'black-alder-carr');
    for (const seed of ['a', 'b', 'c']) {
      for (const [classLevel, places, gold] of [
        [49, ['wolf-circles', 'lynx-ridge', 'spider-gully'], [2800, 2500, 2200]],
        [50, ['wolf-circles', 'lynx-ridge', 'spider-gully'], [3100, 2800, 2500]],
        [99, ['sundew-field', 'leech-pools', 'crane-meadows'], [5800, 5500, 5200]],
        [100, ['sundew-field', 'leech-pools', 'crane-meadows'], [6100, 5800, 5500]],
      ]) {
        const creatures = creaturesOf(classLevel, seed);
        assert.deepEqual(creatures.map((poster) => poster.areaId), places, `class level ${classLevel}`);
        assert.deepEqual(creatures.map((poster) => poster.gold), gold, `class level ${classLevel}`);
      }
    }
    assert.deepEqual([49, 50, 99, 100].map((classLevel) => wantedPlaces(open(classLevel), content).shift), [1, 2, 2, 3]);
    // Across the whole tiers: 45 as 49, 54 as 50, 95 as 99, 104 as 100.
    for (const [one, other] of [[45, 49], [54, 50], [95, 99], [104, 100]]) assert.deepEqual(sorted(placesOf(one)), sorted(placesOf(other)), `${one} and ${other}`);
    // The place the Sala prób opened is the highest, its tier too: at class
    // level 49 the Trzcinowisko, two places down, and at 99 the Czarny Ols,
    // three places down, as at 50 and 100, with their gold.
    assert.deepEqual(wantedPlaces(open(49, 'reed-beds'), content), wantedPlaces(open(50), content));
    assert.deepEqual(wantedPlaces(open(99, 'black-alder-carr'), content), wantedPlaces(open(100), content));
    assert.equal(wantedPlaces(open(99, 'black-alder-carr'), content).shift, 3);
    assert.deepEqual(creaturesOf(49, 'a', 'reed-beds').map((poster) => poster.gold), [3100, 2800, 2500]);
    assert.deepEqual(creaturesOf(99, 'a', 'black-alder-carr').map((poster) => poster.gold), [6100, 5800, 5500]);
    assert.deepEqual(creaturesOf(99, 'a', 'black-alder-carr').map((poster) => poster.gold), before(99, 'black-alder-carr'));
  });

  test('fewer than four places open: those there are, as before; with four, one place down, the lowest three', () => {
    assert.deepEqual([...placesOf(1)], ['windfalls-edge']);
    assert.deepEqual(sorted(placesOf(5)), sorted(['windfalls-edge', 'fox-ravines']));
    // Of two places, two creatures' posters and the outlaw.
    const posters = wantedPosters(5, '2026-11-20', 'a', content);
    assert.equal(posters.filter((poster) => poster.kind === 'creature').length, 2);
    assert.equal(posters.filter((poster) => poster.kind === 'outlaw').length, 1);
    assert.deepEqual(posters.filter((poster) => poster.kind === 'creature').map((poster) => poster.gold), [400, 100]);
    // Three places: all three, each for its own gold.
    assert.equal(openTo(10).length, 3);
    assert.deepEqual(creaturesOf(10).map((poster) => poster.areaId), ['raven-hollows', 'fox-ravines', 'windfalls-edge']);
    assert.deepEqual(creaturesOf(10).map((poster) => poster.gold), [700, 400, 100]);
    // Four places, the highest the Żmijowe Zwalisko (16–20): the same three,
    // one place down, for the gold of the highest three.
    assert.equal(openTo(15).length, 4);
    assert.deepEqual(creaturesOf(15).map((poster) => poster.areaId), ['raven-hollows', 'fox-ravines', 'windfalls-edge']);
    assert.deepEqual(creaturesOf(15).map((poster) => poster.gold), [1000, 700, 400]);
    assert.deepEqual(creaturesOf(15).map((poster) => poster.gold), before(15));
  });

  test('the place the Sala prób opened counts as the highest open one', () => {
    const early = content.areas.find((area) => !areaOpenFor(area, 100, null, content));
    assert.equal(early.id, 'black-tarn');
    assert.deepEqual(openTo(100, early.id).slice(-6, -3), ['leech-pools', 'sundew-field', 'smoldering-peat']);
    assert.deepEqual(sorted(placesOf(100, early.id)), sorted(['leech-pools', 'sundew-field', 'smoldering-peat']));
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
  // A poster of the rule of 0.4.77–0.4.79, by whole lands: at class level
  // 100 two lands (ten places) below the highest open place, paid as the
  // place ten higher.
  const old = (id, place, monster, gold, level) => ({ id: `${id}:${place}:${monster}`, kind: 'creature', areaId: place, monsterId: monster, name: 'Stara odmiana', female: false, level, gold });
  // The places of the posters at class level 100: three below the highest.
  const lower = ['crane-meadows', 'leech-pools', 'sundew-field'];

  beforeEach(async () => {
    ({ cookie } = await signUp('tropicielka'));
    await call('POST', '/api/character', { cookie, body: { name: 'Tropicielka', classId: 'warrior', appearance: 'female' } });
    await set('level = 100, class_level = 100, tutorial = NULL');
  });

  test('the day\'s first look draws from the places three below the highest, and keeps its basis', async () => {
    const view = await wanted();
    assert.deepEqual(
      view.posters.map((poster) => poster.id),
      wantedPosters(100, today(), await characterId(), content).map((poster) => poster.id),
    );
    assert.ok(view.posters.every((poster) => lower.includes(poster.areaId)));
    assert.deepEqual((await stored()).wanted.basis, { classLevel: 100, early: null });
  });

  test('a day drawn by the rule before is drawn anew from its first look: the poster in hand stays first, as taken, and on an exploration; those done stay done', async () => {
    // The first look made at class level 100 by the lands' rule, with a
    // poster of the Wilcze Kręgi done and one of the Trzcinowisko in hand.
    const day = today();
    const done = old(day, 'wolf-circles', 'alpha-wolf', 5500, 46);
    const taken = { ...old(day, 'reed-beds', 'reedling', 6100, 56), beaten: false };
    await set('settlement = ?', JSON.stringify({ wanted: { day, basis: { classLevel: 100, early: null }, done: [done.id], taken } }));
    const view = await wanted();
    const fresh = wantedPosters(100, day, await characterId(), content);
    assert.ok(fresh.every((poster) => lower.includes(poster.areaId)), JSON.stringify(fresh.map((poster) => poster.areaId)));
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
    const taken = { ...old(day, 'glade-heart', 'aurochs', 5800, 51), beaten: true };
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
    // Class level 22, five places: by the lands' rule, the Krucze Wykroty
    // were the highest of the lowest three, paid as the Dzicza Głusza two
    // places higher, 1300 gold; now the middle one of the three one place
    // down, paid as the Żmijowe Zwalisko one place higher, 1000 gold.
    await set('class_level = 22');
    const day = today();
    const taken = { ...old(day, 'raven-hollows', 'crow', 1300, 16), beaten: false };
    await set('settlement = ?', JSON.stringify({ wanted: { day, basis: { classLevel: 22, early: null }, done: [], taken } }));
    const fresh = wantedPosters(22, day, await characterId(), content);
    assert.equal(fresh.find((poster) => poster.id === taken.id).gold, 1000);
    const view = await wanted();
    assert.deepEqual(view.posters.map((poster) => poster.id), fresh.map((poster) => poster.id));
    const held = view.posters.find((poster) => poster.id === taken.id);
    assert.deepEqual([held.state, held.gold], ['taken', 1300]);
    await set('settlement = ?', JSON.stringify({ wanted: { day, basis: { classLevel: 22, early: null }, done: [], taken: { ...taken, beaten: true } } }));
    assert.equal((await call('POST', '/api/settlement/wanted/claim', { cookie })).data.claimed.gold, 1300);
  });
});

// Poszukiwani not from the newest land (src/engine/wanted.js, wantedPlaces;
// src/server/wanted.js; 10.11.2026, the author: „zbalansowanie
// poszukiwanych pod nowy poziom trudności, zeby nie pokazywało zleceń z
// ostatniej odblokowanej krainy, bo często tam się wejdzie i od razu
// padnie”): the day's posters come from the highest open places of the
// lands below the land of the character's highest open place; with only the
// first land open, from its open places but the newest (or the only one).
// A day drawn before the rule keeps its posters to its end.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { areaOpenFor, questPeriod, wantedPlaces, wantedPosters } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rules = content.settlement.wanted;
const areaIds = (areas) => areas.map((area) => area.id);
const openTo = (classLevel, early = null) => content.areas.filter((area) => areaOpenFor(area, classLevel, early, content));
// The places of a day's posters, whatever the draw.
const placesOf = (classLevel, early = null, options) => new Set(['a', 'b', 'c', 'd', 'e'].flatMap((seed) => wantedPosters(classLevel, '2026-11-10', seed, content, early, options).map((poster) => poster.areaId)));
const regionOf = (id) => content.areasById[id].regionId;

describe('the wanted posters leave out the newest land', () => {
  test('the places: those of the lands below the newest, else the first land but its newest place', () => {
    // Only the first place: that one.
    assert.deepEqual(areaIds(wantedPlaces(openTo(1), content)), ['windfalls-edge']);
    // A few places of the first land: all but the newest.
    assert.deepEqual(areaIds(openTo(15)), ['windfalls-edge', 'fox-ravines', 'raven-hollows', 'viper-heaps']);
    assert.deepEqual(areaIds(wantedPlaces(openTo(15), content)), ['windfalls-edge', 'fox-ravines', 'raven-hollows']);
    // The second land's first place open: the whole first land, not it.
    assert.equal(regionOf(openTo(25).at(-1).id), 'stone-glade');
    assert.deepEqual(areaIds(wantedPlaces(openTo(25), content)), areaIds(content.regionsById.windfalls.areas));
    // Three lands: the two below the newest.
    const below = wantedPlaces(openTo(55), content);
    assert.deepEqual([...new Set(below.map((area) => area.regionId))], ['windfalls', 'stone-glade']);
    assert.deepEqual(wantedPlaces([], content), []);
  });

  test('the posters come from the highest of those places, never from the newest land', () => {
    // Class level 47: the Uroczysko Kamieni is the newest land, so the
    // posters hang for the Wiatrołomy's four highest places.
    const highest = areaIds(content.regionsById.windfalls.areas).slice(-rules.places);
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const posters = wantedPosters(47, '2026-11-10', seed, content);
      assert.equal(posters.filter((poster) => poster.kind === 'creature').length, rules.creatures);
      assert.equal(posters.filter((poster) => poster.kind === 'outlaw').length, 1);
      assert.ok(posters.every((poster) => highest.includes(poster.areaId)), JSON.stringify(posters.map((poster) => poster.areaId)));
    }
    // A new character: from its only place.
    assert.deepEqual([...placesOf(1)], ['windfalls-edge']);
    // Within the first land, never its newest place.
    assert.ok(![...placesOf(15)].includes('viper-heaps'));
    // At class level 55 the Zarośnięte Rozlewiska are the newest land: the
    // Uroczysko Kamieni's highest places.
    assert.ok([...placesOf(55)].every((id) => regionOf(id) === 'stone-glade'));
  });

  test('the place the Sala prób opened makes its land the newest', () => {
    // Class level 24 has the whole first land; the Sala prób opened the
    // first place of the second: the posters stay in the first land, all of
    // it below the newest.
    const early = content.areas.find((area) => !areaOpenFor(area, 24, null, content));
    assert.equal(early.regionId, 'stone-glade');
    const places = placesOf(24, early.id);
    assert.ok([...places].every((id) => regionOf(id) === 'windfalls'));
    assert.ok(!places.has(early.id));
    assert.deepEqual(areaIds(wantedPlaces(openTo(24, early.id), content)), areaIds(content.regionsById.windfalls.areas));
    // Without it the first land's newest place is left out.
    assert.deepEqual(areaIds(wantedPlaces(openTo(24), content)), areaIds(content.regionsById.windfalls.areas).slice(0, -1));
    assert.ok(!placesOf(24).has('boar-thicket'));
  });

  test('a day drawn before the rule keeps its posters: the highest places open of all', () => {
    const old = wantedPosters(47, '2026-11-10', 'a', content, null, { lands: false });
    const highest = areaIds(openTo(47)).slice(-rules.places);
    assert.ok(old.every((poster) => highest.includes(poster.areaId)));
    assert.ok(old.every((poster) => regionOf(poster.areaId) === 'stone-glade'));
  });
});

describe('the wanted posters\' lands through the API', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on' });
  let cookie;
  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const stored = async () => JSON.parse((await (await db()).prepare('SELECT settlement FROM characters').first()).settlement);
  const wanted = async () => (await call('GET', '/api/settlement', { cookie })).data.settlement.wanted;
  const characterId = async () => (await (await db()).prepare('SELECT id FROM characters').first()).id;
  const today = () => questPeriod('daily', Date.now(), content).key;

  beforeEach(async () => {
    ({ cookie } = await signUp('tropicielka'));
    await call('POST', '/api/character', { cookie, body: { name: 'Tropicielka', classId: 'warrior', appearance: 'female' } });
    await set('level = 80, class_level = 47, tutorial = NULL');
  });

  test('the day\'s first look draws without the newest land, and keeps it so', async () => {
    const view = await wanted();
    assert.ok(view.posters.every((poster) => regionOf(poster.areaId) === 'windfalls'), JSON.stringify(view.posters.map((poster) => poster.areaId)));
    assert.deepEqual(
      view.posters.map((poster) => poster.id),
      wantedPosters(47, today(), await characterId(), content).map((poster) => poster.id),
    );
    assert.deepEqual((await stored()).wanted.basis, { classLevel: 47, early: null, lands: true });
  });

  test('a day drawn before the rule keeps the posters it was drawn with, to its end', async () => {
    // The basis of a first look made before 10.11.2026, with a poster done.
    const before = wantedPosters(47, today(), await characterId(), content, null, { lands: false });
    await set('settlement = ?', JSON.stringify({ wanted: { day: today(), basis: { classLevel: 47, early: null }, done: [before[0].id], taken: null } }));
    const view = await wanted();
    assert.deepEqual(
      view.posters.map((poster) => [poster.id, poster.state]),
      before.map((poster, index) => [poster.id, index === 0 ? 'done' : 'open']),
    );
    assert.ok(view.posters.some((poster) => regionOf(poster.areaId) === 'stone-glade'));
    // The next day draws by the new rule.
    const kept = await stored();
    await set('settlement = ?', JSON.stringify({ ...kept, wanted: { ...kept.wanted, day: '2020-01-01' } }));
    const next = await wanted();
    assert.ok(next.posters.every((poster) => regionOf(poster.areaId) === 'windfalls'));
    assert.equal((await stored()).wanted.basis.lands, true);
  });
});

// Poszukiwani on a Drużyna's trip (src/engine/wanted.js, tripWanted;
// src/server/parties.js, src/server/wanted.js, wantedOnTrip; 10.11.2026,
// the author: „chcemy zrobić większy focus na drużynę, ergo poszukiwanych
// powinno moc sie znajdywac nawet w drużynie, szczególnie mając tych
// samych”): the trip seeks the target of the posters in hand for its place
// of those who go, the one most of them hold; its fights meet it as an
// exploration meets a poster's target, the same in every member's report;
// when it falls, each holder of a poster for it fulfils its own, and the
// others only fought a strong foe.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { autoDistribute, canUse, createRng, generateItem, questPeriod, simulateHunt, tripWanted, wantedTarget, wantedTrophy } from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rules = content.settlement.wanted;
// Every fight in the poster's place its target's, without the harder
// explorations from the 10th level: these fights test the posters.
const calm = { ...content, balance: { ...content.balance, challenge: { ...content.balance.challenge, fromLevel: Infinity } } };
const always = { ...calm, settlement: { ...calm.settlement, wanted: { ...rules, chance: 1 } } };
const strong = (classId) => {
  const character = newCharacter(classId, { level: 70, classLevel: 47 });
  return { ...character, points: autoDistribute(character, content) };
};
const tarantula = { kind: 'creature', areaId: 'spider-gully', monsterId: 'tarantula', name: 'Krwawa Tarantula', female: true, level: 36 };
const poster = (day, target = tarantula, extra = {}) => ({ id: `${day}:${target.areaId}:${target.monsterId}`, ...target, ...extra });

describe('the trip\'s wanted target', () => {
  test('the target most of those who go hold; of those held alike, one drawn from the trip\'s seed', () => {
    const outlaw = { kind: 'outlaw', areaId: 'spider-gully', monsterId: 'bandit-chief', name: 'Herszt zbójców', female: false, level: 36 };
    assert.equal(tripWanted([null, null], 'a'), null);
    assert.deepEqual(tripWanted([poster('d', tarantula, { trophy: 'x' }), null], 'a'), tarantula);
    // Two for the variant, one for the outlaw: the variant, whatever the seed.
    for (const seed of ['a', 'b', 'c', 'd']) assert.deepEqual(tripWanted([poster('d', outlaw), poster('d'), poster('e')], seed), tarantula);
    // One each: drawn from the seed, the same for the same seed.
    const drawn = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((seed) => tripWanted([poster('d'), poster('d', outlaw)], seed).monsterId);
    assert.deepEqual(new Set(drawn), new Set(['tarantula', 'bandit-chief']));
    assert.deepEqual(tripWanted([poster('d'), poster('d', outlaw)], 'a'), tripWanted([poster('d'), poster('d', outlaw)], 'a'));
    assert.equal(wantedTarget(poster('d'), tarantula), true);
    assert.equal(wantedTarget(poster('d', outlaw), tarantula), false);
    assert.equal(wantedTarget(null, tarantula), false);
  });

  test('on a trip the target comes in the same fight of every report; the holder fulfils its poster, the other only fought it', () => {
    const roster = [
      { id: 1, name: 'Lider', character: strong('warrior'), equipped: [], hp: null, windows: {}, trophies: {} },
      { id: 2, name: 'Druh', character: strong('warrior'), equipped: [], hp: null, windows: {}, trophies: {} },
    ];
    const trip = { equipped: [], hp: null, areaId: 'spider-gully', minutes: 60, seed: 'wyprawa', roster };
    const trophy = wantedTrophy('tarantula', {}, content);
    const holder = simulateHunt({ ...trip, character: roster[0].character, name: 'Lider', self: 1, lootSeed: 'l', wanted: { ...poster('d'), trophy } }, always);
    const other = simulateHunt({ ...trip, character: roster[1].character, name: 'Druh', self: 2, lootSeed: 'o', wanted: { ...tarantula, own: false } }, always);
    const fights = (hunt) => hunt.fights.map((fight) => [fight.enemies.map((enemy) => `${enemy.monsterId}:${enemy.level}:${enemy.name}`).join(','), fight.won, Boolean(fight.wanted), fight.allies.map((ally) => ally.name).join(','), JSON.stringify(fight.events)]);
    assert.deepEqual(fights(other), fights(holder));
    const met = holder.fights.find((fight) => fight.wanted);
    assert.ok(met);
    assert.equal(met.won, true);
    assert.deepEqual(met.enemies.map((enemy) => enemy.name), ['Krwawa Tarantula']);
    // The holder: its poster fulfilled, the trophy and the words of it.
    assert.deepEqual(holder.wanted, { id: poster('d').id, met: true, beaten: true });
    assert.match(holder.entries.find((entry) => entry.fight === met.index).text, /Poszukiwana pokonana/);
    assert.match(holder.entries.find((entry) => entry.fight === met.index).text, /Trofeum/);
    // The other: the same fight, paid as a fight, nothing of a poster.
    assert.equal(other.wanted, undefined);
    const otherText = other.entries.find((entry) => entry.fight === met.index).text;
    assert.doesNotMatch(otherText, /Poszukiwana pokonana|Trofeum/);
    assert.ok(other.fights[met.index].xp > 0);
  });

  test('without a target the trip goes as before', () => {
    const roster = [
      { id: 1, name: 'Lider', character: strong('warrior'), equipped: [], hp: null, windows: {}, trophies: {} },
      { id: 2, name: 'Druh', character: strong('warrior'), equipped: [], hp: null, windows: {}, trophies: {} },
    ];
    const trip = { character: roster[1].character, equipped: [], hp: null, name: 'Druh', areaId: 'spider-gully', minutes: 60, seed: 'wyprawa', roster, self: 2, lootSeed: 'o' };
    const plain = simulateHunt(trip, always);
    assert.ok(plain.fights.every((fight) => !fight.wanted));
    assert.equal(plain.wanted, undefined);
  });
});

describe('Poszukiwani on a Drużyna\'s trip through the API', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on' });
  const cookies = {};
  const sql = async (text, ...binds) => (await db()).prepare(text).bind(...binds);
  const today = () => questPeriod('daily', Date.now(), content).key;
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const settlementOf = async (name) => JSON.parse((await (await sql('SELECT settlement FROM characters WHERE name = ?', name)).first()).settlement);
  const optionsOf = async (name) => JSON.parse((await (await sql('SELECT a.options FROM activities a JOIN characters c ON c.id = a.character_id WHERE c.name = ?', name)).first()).options);

  async function player(login, name) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    // Strong enough for any target there, and not on its first exploration.
    const shape = newCharacter('warrior', { level: 120, classLevel: 30 });
    await (await sql('UPDATE characters SET level = 120, class_level = 30, tutorial = NULL, points = ? WHERE name = ?', JSON.stringify(autoDistribute(shape, content)), name)).run();
    const rng = createRng(`arms:${name}`);
    for (const { id: slot } of content.slots) {
      const base = content.bases.find((one) => one.slot === slot && !one.family && canUse(one.id, 'warrior', content));
      if (!base) continue;
      const item = generateItem({ baseId: base.id, level: 60, rarityId: 'legendary' }, rng, content);
      await (await sql('INSERT INTO items (character_id, slot, data, created_at) SELECT id, ?, ?, 0 FROM characters WHERE name = ?', slot, JSON.stringify(item), name)).run();
    }
    await (await sql("INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) SELECT id, 'earlier:' || id, 'hunt', 0, '{}', '{}' FROM characters WHERE name = ?", name)).run();
  }
  // A poster in hand for `name`, as the sołtys's board gives it.
  const hold = async (name, target, extra = {}) =>
    (await sql('UPDATE characters SET settlement = ? WHERE name = ?', JSON.stringify({ wanted: { day: today(), basis: { classLevel: 30, early: null, lands: true }, done: [], taken: { ...poster(today(), target), gold: 1900, beaten: false, ...extra } } }), name)).run();
  // The trip meets its target in its first fight: a seed whose draw does.
  async function meetAtOnce() {
    let seed = 0;
    while (!createRng(`s${seed}:wanted`).chance(rules.chance)) seed += 1;
    await (await sql("UPDATE activities SET options = json_set(options, '$.party.seed', ?)", `s${seed}`)).run();
  }
  async function claim(login) {
    const claimed = await as(login, 'POST', '/api/hunts/claim');
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
    return claimed.data.report;
  }

  beforeEach(async () => {
    await player('lider', 'Lider');
    await player('druh', 'Druh');
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
  });

  test('both hold a poster for the same target: the trip seeks it, and both fulfil their own when it falls', async () => {
    await hold('Lider', tarantula);
    await hold('Druh', tarantula);
    const went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'spider-gully', minutes: 60 });
    assert.equal(went.status, 201, JSON.stringify(went.data).slice(0, 300));
    assert.deepEqual(went.data.went, ['Druh']);
    for (const name of ['Lider', 'Druh']) {
      const options = await optionsOf(name);
      assert.deepEqual(options.party.encounter.wanted, tarantula);
      assert.equal(options.wanted.id, poster(today()).id);
    }
    // Carried on the trip: not given back on the way.
    assert.equal((await as('druh', 'POST', '/api/settlement/wanted/drop')).data.error.code, 'carried');
    await meetAtOnce();
    await as('lider', 'POST', '/api/test/skip-time');
    const reports = { lider: await claim('lider'), druh: await claim('druh') };
    const fights = (report) => report.fights.map((fight) => [fight.enemies.map((enemy) => `${enemy.monsterId}:${enemy.level}`).join(','), fight.won, Boolean(fight.wanted), JSON.stringify(fight.events)]);
    assert.deepEqual(fights(reports.druh), fights(reports.lider));
    const met = reports.lider.fights.find((fight) => fight.wanted);
    assert.equal(met?.won, true, 'the target met and beaten');
    for (const name of ['Lider', 'Druh']) assert.equal((await settlementOf(name)).wanted.taken.beaten, true, name);
    // Each one's own bounty.
    const paid = await as('druh', 'POST', '/api/settlement/wanted/claim');
    assert.equal(paid.status, 200, JSON.stringify(paid.data).slice(0, 300));
    assert.equal(paid.data.claimed.gold, 1900);
  });

  test('one holds a poster, the other none: the same foe in both reports, the poster fulfilled only for its holder', async () => {
    await hold('Druh', tarantula);
    assert.equal((await as('lider', 'POST', '/api/party/hunt', { areaId: 'spider-gully', minutes: 60 })).status, 201);
    assert.deepEqual((await optionsOf('Lider')).party.encounter.wanted, tarantula);
    assert.equal((await optionsOf('Lider')).wanted, undefined);
    await meetAtOnce();
    await as('lider', 'POST', '/api/test/skip-time');
    const lider = await claim('lider');
    const druh = await claim('druh');
    const met = lider.fights.findIndex((fight) => fight.wanted);
    assert.equal(lider.fights[met]?.won, true);
    assert.equal(druh.fights[met].wanted, true);
    assert.deepEqual(druh.fights.map((fight) => fight.enemies.map((enemy) => enemy.monsterId)), lider.fights.map((fight) => fight.enemies.map((enemy) => enemy.monsterId)));
    assert.equal((await settlementOf('Druh')).wanted.taken.beaten, true);
    assert.equal((await settlementOf('Lider')).wanted, undefined);
  });

  test('posters for different targets: the trip seeks one, and the other poster stays free to be given back', async () => {
    const outlaw = { kind: 'outlaw', areaId: 'spider-gully', monsterId: 'bandit-chief', name: 'Herszt zbójców', female: false, level: 36 };
    await hold('Lider', tarantula);
    await hold('Druh', outlaw);
    assert.equal((await as('lider', 'POST', '/api/party/hunt', { areaId: 'spider-gully', minutes: 60 })).status, 201);
    const sought = (await optionsOf('Lider')).party.encounter.wanted;
    assert.ok([tarantula.monsterId, outlaw.monsterId].includes(sought.monsterId));
    const [keeper, free] = sought.monsterId === tarantula.monsterId ? ['lider', 'druh'] : ['druh', 'lider'];
    const names = { lider: 'Lider', druh: 'Druh' };
    assert.equal((await optionsOf(names[keeper])).wanted.monsterId, sought.monsterId);
    assert.equal((await optionsOf(names[free])).wanted, undefined);
    assert.equal((await as(keeper, 'POST', '/api/settlement/wanted/drop')).data.error.code, 'carried');
    assert.equal((await as(free, 'POST', '/api/settlement/wanted/drop')).status, 200);
  });

  test('a poster for another place stays at home, as on any exploration', async () => {
    await hold('Druh', { ...tarantula, areaId: 'lynx-ridge', monsterId: 'lynx', name: 'Srebrny Ryś', female: false });
    assert.equal((await as('lider', 'POST', '/api/party/hunt', { areaId: 'spider-gully', minutes: 60 })).status, 201);
    assert.equal((await optionsOf('Lider')).party.encounter.wanted, undefined);
    assert.equal((await optionsOf('Druh')).wanted, undefined);
  });
});

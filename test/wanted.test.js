// Poszukiwani in the Osada (src/engine/wanted.js, src/server/wanted.js; the
// author's 619 B): the sołtys's posters of the day, a named variant of the
// creatures of each of a few of the highest open places and an outlaw; the
// poster taken brings its target into its place's explorations, as strong
// as the place's elite and a little more; beaten, it leaves a trophy or a
// rarer item, and the sołtys pays the bounty.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  areaUnlocked,
  autoDistribute,
  createRng,
  encounterCombatants,
  exploreStrength,
  monsterCombatant,
  questPeriod,
  simulateHunt,
  trophyGrades,
  wantedEncounter,
  wantedGold,
  wantedPosters,
  wantedStrength,
  wantedTrophy,
} from '../src/engine/index.js';
import { wantedAfterHunt } from '../src/server/wanted.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rules = content.settlement.wanted;
// The same game with every fight in the poster's place its target's,
// without the harder explorations from the 10th level (balance.challenge):
// these fights test the posters.
const calm = { ...content, balance: { ...content.balance, challenge: { ...content.balance.challenge, fromLevel: Infinity } } };
const always = { ...calm, settlement: { ...calm.settlement, wanted: { ...rules, chance: 1 } } };
const strong = () => {
  const character = newCharacter('warrior', { level: 70, classLevel: 47 });
  character.points = autoDistribute(character, content);
  return character;
};
const explore = (game, extra = {}) => simulateHunt({ character: strong(), equipped: [], hp: null, name: 'Łowca', areaId: 'spider-gully', minutes: 60, seed: 'trop', ...extra }, game);

describe('the wanted posters', () => {
  test('each place has one variant of its own creatures, and the outlaws are the events\' foes', () => {
    assert.deepEqual(rules.variants.map((variant) => variant.area).sort(), content.areas.map((area) => area.id).sort());
    for (const variant of rules.variants) {
      const area = content.areasById[variant.area];
      assert.ok(area.encounters.some((encounter) => encounter.monsters.includes(variant.monster)), variant.name);
      assert.ok(content.materialsByMonster[variant.monster], variant.name);
    }
    for (const id of rules.outlaws) assert.ok(content.eventFoesById[id], id);
  });

  test('the day\'s posters: variants of the highest open places, the highest first, and an outlaw among them', () => {
    const posters = wantedPosters(47, '2026-11-05', 'postać', content);
    assert.deepEqual(wantedPosters(47, '2026-11-05', 'postać', content), posters);
    assert.notDeepEqual(wantedPosters(47, '2026-11-06', 'postać', content), posters);
    const open = content.areas.filter((area) => areaUnlocked(area, 47, content)).slice(-rules.places).map((area) => area.id);
    const creatures = posters.filter((poster) => poster.kind === 'creature');
    assert.equal(creatures.length, rules.creatures);
    assert.equal(new Set(creatures.map((poster) => poster.areaId)).size, rules.creatures);
    assert.ok(posters.every((poster) => open.includes(poster.areaId) && poster.id.startsWith('2026-11-05:')));
    const levels = creatures.map((poster) => content.areasById[poster.areaId].minLevel);
    assert.deepEqual(levels, [...levels].sort((a, b) => b - a));
    const [outlaw, ...more] = posters.filter((poster) => poster.kind === 'outlaw');
    assert.deepEqual(more, []);
    assert.ok(rules.outlaws.includes(outlaw.monsterId));
    // At the elite's level, for 60 × the place's first level in whole hundreds.
    const wolves = content.areasById['wolf-circles'];
    assert.equal(wantedGold(wolves, content), 2500);
    assert.equal(wantedGold(content.areasById['windfalls-edge'], content), 100);
    assert.ok(posters.every((poster) => poster.level === content.areasById[poster.areaId].maxLevel + content.balance.hunt.eliteLevelBonus));
    // A new character's posters come from the places it has.
    assert.ok(wantedPosters(1, '2026-11-05', 'nowa', content).every((poster) => areaUnlocked(content.areasById[poster.areaId], 1, content)));
    // The place the Sala prób opened is among them.
    const early = content.areas.find((area) => !areaUnlocked(area, 47, content));
    const places = [...open.slice(1), early.id];
    assert.ok(wantedPosters(47, '2026-11-05', 'postać', content, early.id).every((poster) => places.includes(poster.areaId)));
  });

  test('the trophy: the first grade the character has not found, never the rarest, then the first again', () => {
    const material = content.materialsByMonster['alpha-wolf'];
    const grades = trophyGrades(material.id, content);
    assert.equal(grades.length, 3);
    const found = (...ids) => Object.fromEntries(ids.map((rarity) => [`material:${material.id}:${rarity}`, 1]));
    assert.equal(wantedTrophy('alpha-wolf', {}, content), `${material.id}:${grades[0]}`);
    assert.equal(wantedTrophy('alpha-wolf', found(grades[0]), content), `${material.id}:${grades[1]}`);
    // The rarest is the character's own find.
    assert.equal(wantedTrophy('alpha-wolf', found(grades[0], grades[1]), content), `${material.id}:${grades[0]}`);
    assert.equal(wantedTrophy('alpha-wolf', found(...grades), content), `${material.id}:${grades[0]}`);
    // Only the middle one missing: that one.
    assert.equal(wantedTrophy('alpha-wolf', found(grades[0], grades[2]), content), `${material.id}:${grades[1]}`);
  });

  test('the target is the place\'s elite\'s match in HP and damage, by the rules\' strength more, under its own name', () => {
    const area = content.areasById['wolf-circles'];
    const target = { monsterId: 'alpha-wolf', level: 46, name: 'Stary Basior' };
    const strength = exploreStrength(area, 46, content);
    const [enemy] = encounterCombatants(wantedEncounter(target), content, { strength: wantedStrength(area, target, strength, content) });
    const elite = monsterCombatant({ monsterId: area.elite, level: 46, id: 'e', strength }, content);
    assert.equal(enemy.name, 'Stary Basior');
    assert.equal(enemy.monsterId, 'alpha-wolf');
    assert.ok(Math.abs(enemy.maxHp / elite.maxHp - rules.strength[1]) < 0.01, `${enemy.maxHp} / ${elite.maxHp}`);
    const hit = (unit) => unit.weapon.min + unit.weapon.max;
    assert.ok(Math.abs(hit(enemy) / hit(elite) - rules.strength[0]) < 0.05, `${hit(enemy)} / ${hit(elite)}`);
  });

  test('an exploration without the poster, or with one for another place, goes as ever; one that does not meet its target too', () => {
    const plain = explore(calm);
    const poster = wantedPosters(47, '2026-11-05', 'postać', content).find((one) => one.areaId !== 'spider-gully');
    const elsewhere = explore(always, { wanted: poster });
    assert.deepEqual(elsewhere, plain);
    const target = { ...wantedPosters(47, '2026-11-05', 'postać', content)[0], areaId: 'spider-gully' };
    const never = { ...calm, settlement: { ...calm.settlement, wanted: { ...rules, chance: 1e-12 } } };
    const missed = explore(never, { wanted: target });
    const { wanted, ...rest } = missed;
    assert.deepEqual(wanted, { id: target.id, met: false, beaten: false });
    assert.deepEqual(rest, plain);
  });

  test('met in its place once, as the report\'s key fight; beaten, a variant leaves its trophy and an outlaw a rarer item', () => {
    const variant = { id: 'd:spider-gully:tarantula', kind: 'creature', areaId: 'spider-gully', monsterId: 'tarantula', name: 'Krwawa Tarantula', female: true, level: 36, trophy: wantedTrophy('tarantula', {}, content) };
    const hunt = explore(always, { wanted: variant });
    const fights = hunt.fights.filter((fight) => fight.wanted);
    assert.equal(fights.length, 1);
    const [fight] = fights;
    assert.deepEqual(fight.enemies.map((enemy) => enemy.name), ['Krwawa Tarantula']);
    assert.equal(fight.enemies[0].level, 36);
    assert.equal(fight.won, true);
    assert.equal(hunt.keyFight.index, fight.index);
    assert.deepEqual(hunt.wanted, { id: variant.id, met: true, beaten: true });
    assert.equal(fight.materials[variant.trophy] >= 1, true);
    assert.ok(hunt.materials[variant.trophy] >= 1);
    const text = hunt.entries.find((entry) => entry.fight === fight.index).text;
    assert.match(text, /Poszukiwana pokonana/);
    // An outlaw's item, of a rarity from the rules' weights.
    const outlaw = { id: 'd:spider-gully:bandit-chief', kind: 'outlaw', areaId: 'spider-gully', monsterId: 'bandit-chief', name: 'Herszt zbójców', female: false, level: 36 };
    const robbed = explore(always, { wanted: outlaw });
    const fought = robbed.fights.find((one) => one.wanted);
    assert.equal(fought.won, true);
    const items = fought.chests.map((index) => robbed.items[index]);
    assert.ok(items.some((item) => Object.keys(rules.loot).includes(item.rarity)), JSON.stringify(items.map((item) => item.rarity)));
    assert.match(robbed.entries.find((entry) => entry.fight === fought.index).text, /Poszukiwany pokonany/);
  });

  test('the named outlaws of 5.11.2026 fight by their own names, Zamaskowana Diana in a woman\'s words', () => {
    const named = { arsonist: 'Wojsław Pożoga', highwaywoman: 'Zamaskowana Diana', 'grave-robber': 'Ścibor Kopacz' };
    for (const [monsterId, name] of Object.entries(named)) {
      assert.ok(rules.outlaws.includes(monsterId), monsterId);
      const foe = content.eventFoesById[monsterId];
      assert.equal(foe.name, name);
      const female = foe.female === true;
      assert.equal(female, monsterId === 'highwaywoman');
      const target = { id: `d:spider-gully:${monsterId}`, kind: 'outlaw', areaId: 'spider-gully', monsterId, name, female, level: 36 };
      const hunt = explore(always, { wanted: target });
      const fight = hunt.fights.find((one) => one.wanted);
      assert.deepEqual(fight.enemies.map((enemy) => enemy.name), [name]);
      assert.equal(fight.won, true, name);
      assert.match(hunt.entries.find((entry) => entry.fight === fight.index).text, female ? /Poszukiwana pokonana/ : /Poszukiwany pokonany/);
    }
    // Her poster, when the sołtys draws her, is a woman's.
    let diana = null;
    for (let i = 0; !diana && i < 300; i++) diana = wantedPosters(47, '2026-11-05', `postać-${i}`, content).find((poster) => poster.monsterId === 'highwaywoman');
    assert.equal(diana.kind, 'outlaw');
    assert.equal(diana.name, 'Zamaskowana Diana');
    assert.equal(diana.female, true);
  });

  test('the Osada\'s record after an exploration: the poster in hand is beaten when its target fell', () => {
    const stored = { wanted: { day: 'd', done: [], taken: { id: 'd:a:b', beaten: false } } };
    assert.deepEqual(wantedAfterHunt(stored, { wanted: { id: 'd:a:b', met: true, beaten: true } }), { day: 'd', done: [], taken: { id: 'd:a:b', beaten: true } });
    assert.equal(wantedAfterHunt(stored, { wanted: { id: 'd:a:b', met: true, beaten: false } }), null);
    assert.equal(wantedAfterHunt(stored, { wanted: { id: 'd:x:y', met: true, beaten: true } }), null);
    assert.equal(wantedAfterHunt({}, { wanted: { id: 'd:a:b', met: true, beaten: true } }), null);
  });
});

describe('the wanted posters through the API', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on' });
  let cookie;
  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const row = async () => (await db()).prepare('SELECT gold, time_points, settlement FROM characters').first();
  const wanted = async () => (await call('GET', '/api/settlement', { cookie })).data.settlement.wanted;
  const take = (posterId) => call('POST', '/api/settlement/wanted', { cookie, body: { posterId } });

  beforeEach(async () => {
    ({ cookie } = await signUp('lowca'));
    await call('POST', '/api/character', { cookie, body: { name: 'Łowczyni', classId: 'warrior', appearance: 'female' } });
    await set('level = 80, class_level = 30, tutorial = NULL');
  });

  test('the day\'s posters: three variants and an outlaw, one taken at a time, given back', async () => {
    const view = await wanted();
    assert.equal(view.posters.length, rules.creatures + 1);
    assert.ok(view.posters.every((poster) => poster.state === 'open' && poster.areaName && poster.levels));
    assert.equal(view.holding, false);
    assert.equal(view.texts.meet, undefined);
    const [first, second] = view.posters;
    const taken = await take(first.id);
    assert.equal(taken.status, 200, JSON.stringify(taken.data).slice(0, 300));
    assert.equal(taken.data.settlement.wanted.posters[0].state, 'taken');
    assert.equal(taken.data.settlement.wanted.holding, true);
    assert.equal((await take(second.id)).data.error.code, 'holding');
    assert.equal((await call('POST', '/api/settlement/wanted/claim', { cookie })).data.error.code, 'not_beaten');
    const dropped = await call('POST', '/api/settlement/wanted/drop', { cookie });
    assert.equal(dropped.data.settlement.wanted.posters[0].state, 'open');
    assert.equal((await take('2020-01-01:windfalls-edge:wolf')).data.error.code, 'no_poster');
  });

  test('an exploration of the poster\'s place sets out with it, and its target met and beaten is saved', async () => {
    const view = await wanted();
    const poster = view.posters.find((one) => one.kind === 'creature');
    await take(poster.id);
    // Elsewhere, without it.
    const other = view.posters.find((one) => one.areaId !== poster.areaId);
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: other.areaId, minutes: 5 } })).status, 201);
    assert.equal(JSON.parse((await (await db()).prepare('SELECT options FROM activities').first()).options).wanted, undefined);
    await call('POST', '/api/hunts/cancel', { cookie });
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: poster.areaId, minutes: 60 } })).status, 201);
    const options = JSON.parse((await (await db()).prepare('SELECT options FROM activities').first()).options);
    assert.equal(options.wanted.id, poster.id);
    assert.equal(options.wanted.name, poster.name);
    assert.match(options.wanted.trophy, /:/);
    // Not the character's very first exploration, which goes one way, and
    // a seed that meets the target in the first fight.
    await (await db()).prepare("INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) SELECT id, 'earlier', 'hunt', 0, '{}', '{}' FROM characters").run();
    let seed = 0;
    while (!createRng(`s${seed}:wanted`).chance(rules.chance)) seed += 1;
    await (await db()).prepare('UPDATE activities SET seed = ?').bind(`s${seed}`).run();
    await call('POST', '/api/test/skip-time', { cookie });
    const claimed = await call('POST', '/api/hunts/claim', { cookie });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
    const fight = claimed.data.report.fights.find((one) => one.wanted);
    assert.ok(fight, 'the target is met');
    assert.equal(fight.enemies[0].name, poster.name);
    const after = await wanted();
    assert.equal(after.posters.find((one) => one.id === poster.id).state, fight.won ? 'beaten' : 'taken');
  });

  test('the bounty: gold, Time Points, the hunters\' reputation; the poster is done for the day', async () => {
    const view = await wanted();
    const poster = view.posters[1];
    await take(poster.id);
    const stored = JSON.parse((await row()).settlement);
    stored.wanted.taken.beaten = true;
    await set('settlement = ?', JSON.stringify(stored));
    assert.equal((await wanted()).posters[1].state, 'beaten');
    assert.equal((await call('GET', '/api/character', { cookie })).data.character.settlementWaiting, true);
    assert.equal((await call('POST', '/api/settlement/wanted/drop', { cookie })).data.error.code, 'beaten');
    const before = await row();
    const claimed = await call('POST', '/api/settlement/wanted/claim', { cookie });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
    assert.deepEqual(claimed.data.claimed, { gold: poster.gold, timePoints: rules.timePoints, reputation: rules.reputation });
    const saved = await row();
    assert.equal(saved.gold, before.gold + poster.gold);
    assert.equal(saved.time_points, before.time_points + rules.timePoints);
    const settlement = JSON.parse(saved.settlement);
    assert.equal(settlement.reputation[rules.brotherhood], rules.reputation);
    assert.equal(settlement.relations[rules.resident], rules.relationGain);
    assert.equal(settlement.wanted.day, questPeriod('daily', Date.now(), content).key);
    assert.deepEqual(settlement.wanted.done, [poster.id]);
    const after = claimed.data.settlement.wanted;
    assert.equal(after.posters[1].state, 'done');
    assert.equal(after.holding, false);
    assert.equal((await take(poster.id)).data.error.code, 'no_poster');
    assert.equal((await call('POST', '/api/settlement/wanted/claim', { cookie })).data.error.code, 'not_beaten');
  });

  test('a poster of an earlier day stays in hand, apart from the day\'s', async () => {
    const stored = { wanted: { day: '2020-01-01', done: ['2020-01-01:windfalls-edge:wolf'], taken: { id: '2020-01-01:spider-gully:tarantula', kind: 'creature', areaId: 'spider-gully', monsterId: 'tarantula', name: 'Krwawa Tarantula', female: true, level: 36, gold: 1900, beaten: false } } };
    await set('settlement = ?', JSON.stringify(stored));
    const view = await wanted();
    assert.equal(view.earlier.id, stored.wanted.taken.id);
    assert.equal(view.earlier.state, 'taken');
    assert.ok(view.posters.every((poster) => poster.state === 'open'));
    assert.equal(view.holding, true);
    stored.wanted.taken.beaten = true;
    await set('settlement = ?', JSON.stringify(stored));
    const claimed = await call('POST', '/api/settlement/wanted/claim', { cookie });
    assert.equal(claimed.data.claimed.gold, 1900);
    assert.deepEqual(JSON.parse((await row()).settlement).wanted.done, []);
  });
});

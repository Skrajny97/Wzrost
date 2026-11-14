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
  canUse,
  createRng,
  encounterCombatants,
  exploreStrength,
  gendered,
  generateItem,
  monsterCombatant,
  questPeriod,
  simulateHunt,
  trialTarget,
  trophyGrades,
  wantedEncounter,
  wantedGold,
  wantedName,
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

  test('the day\'s posters: variants of the three highest open places, the highest first, and an outlaw among them', () => {
    const posters = wantedPosters(47, '2026-11-05', 'postać', content);
    assert.deepEqual(wantedPosters(47, '2026-11-05', 'postać', content), posters);
    assert.notDeepEqual(wantedPosters(47, '2026-11-06', 'postać', content), posters);
    // Class level 47: its highest open place and the two below it
    // (12.11.2026, wanted-places.test.js).
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
    // The place the Sala prób opened counts too, the highest of them.
    const early = content.areas.find((area) => !areaUnlocked(area, 47, content));
    const places = [...content.areas.filter((area) => areaUnlocked(area, 47, content)).slice(1 - rules.places).map((area) => area.id), early.id];
    assert.ok(wantedPosters(47, '2026-11-05', 'postać', content, early.id).every((poster) => places.includes(poster.areaId)));
  });

  test('a poster\'s target is named as the data names it now, its own name kept where the data has none', () => {
    const [variant] = rules.variants;
    const outlawId = rules.outlaws[0];
    assert.equal(wantedName({ kind: 'creature', areaId: variant.area, monsterId: variant.monster, name: 'stara nazwa' }, content), variant.name);
    assert.equal(wantedName({ kind: 'outlaw', areaId: variant.area, monsterId: outlawId, name: 'stara nazwa' }, content), content.monstersById[outlawId].name);
    assert.equal(wantedName({ kind: 'creature', areaId: 'nowhere', monsterId: variant.monster, name: 'stara nazwa' }, content), 'stara nazwa');
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

  test('the Osada\'s record after an exploration: the poster in hand is beaten when its target fell; one not in hand is done for its day', () => {
    const stored = { wanted: { day: 'd', done: [], taken: { id: 'd:a:b', beaten: false } } };
    assert.deepEqual(wantedAfterHunt(stored, { wanted: { id: 'd:a:b', met: true, beaten: true } }), { day: 'd', done: [], taken: { id: 'd:a:b', beaten: true } });
    assert.equal(wantedAfterHunt(stored, { wanted: { id: 'd:a:b', met: true, beaten: false } }), null);
    // Fallen though its poster was not in hand (the code review: given back
    // on the way, it came back open for another try): done for its day,
    // with no bounty, and the poster in hand stays as it was.
    assert.deepEqual(wantedAfterHunt(stored, { wanted: { id: 'd:x:y', met: true, beaten: true } }), { day: 'd', done: ['d:x:y'], taken: { id: 'd:a:b', beaten: false } });
    assert.deepEqual(wantedAfterHunt({ wanted: { day: 'd', done: ['d:q:r'], taken: null } }, { wanted: { id: 'd:x:y', met: true, beaten: true } }), { day: 'd', done: ['d:q:r', 'd:x:y'], taken: null });
    // Once, and nothing to mark for a day gone by.
    assert.equal(wantedAfterHunt({ wanted: { day: 'd', done: ['d:x:y'], taken: null } }, { wanted: { id: 'd:x:y', met: true, beaten: true } }), null);
    assert.equal(wantedAfterHunt({ wanted: { day: 'e', done: [], taken: null } }, { wanted: { id: 'd:x:y', met: true, beaten: true } }), null);
    assert.equal(wantedAfterHunt({}, { wanted: { id: 'd:a:b', met: true, beaten: true } }), null);
  });
});

describe('the wanted posters through the API', () => {
  const { server, call, db, signUp } = useServer({ SETTLEMENT: 'on', ENGLISH: 'on' });
  let cookie;
  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const row = async () => (await db()).prepare('SELECT gold, time_points, settlement FROM characters').first();
  const wanted = async () => (await call('GET', '/api/settlement', { cookie })).data.settlement.wanted;
  const take = (posterId) => call('POST', '/api/settlement/wanted', { cookie, body: { posterId } });
  const characterId = async () => (await (await db()).prepare('SELECT id FROM characters').first()).id;
  const today = () => questPeriod('daily', Date.now(), content).key;
  // The poster in hand with its target fallen, and its bounty claimed.
  async function bounty(posterId) {
    assert.equal((await take(posterId)).status, 200);
    const stored = JSON.parse((await row()).settlement);
    stored.wanted.taken.beaten = true;
    await set('settlement = ?', JSON.stringify(stored));
    const claimed = await call('POST', '/api/settlement/wanted/claim', { cookie });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
  }
  // Strong enough for any target of these places: its points spent and a
  // legendary item in every slot its class can fill.
  async function arm() {
    const shape = newCharacter('warrior', { level: 120, classLevel: 30 });
    // Whole HP (the game caps it at the character's most): a new character's
    // few HP of level 1 lost to some days' targets (the outlaw drawn on
    // 14.11.2026 hit 77 HP away before falling).
    await set('level = 120, points = ?, hp = 100000, hp_at = ?', JSON.stringify(autoDistribute(shape, content)), Date.now());
    const rng = createRng('arms');
    for (const { id: slot } of content.slots) {
      const base = content.bases.find((one) => one.slot === slot && !one.family && canUse(one.id, 'warrior', content));
      if (!base) continue;
      const item = generateItem({ baseId: base.id, level: 60, rarityId: 'legendary' }, rng, content);
      await (await db()).prepare('DELETE FROM items WHERE slot = ?').bind(slot).run();
      await (await db()).prepare('INSERT INTO items (character_id, slot, data, created_at) SELECT id, ?, ?, 0 FROM characters').bind(slot, JSON.stringify(item)).run();
    }
  }

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

  // A player's remark, 12.11.2026: „w okienku wypraw fajnie byłoby widzieć,
  // które zlecenie na elitę obecnie mamy wybrane z tablicy zleceń”.
  test('the poster in hand on the Walka screen: its target and where to seek it, then its bounty waiting; none without one', async () => {
    const inHand = async (lang = 'pl') => {
      const response = await server.fetch('/api/character', { headers: { Cookie: cookie, 'X-Lang': lang } });
      return (await response.json()).character.wanted;
    };
    assert.equal(await inHand(), null);
    const view = await wanted();
    const outlaw = view.posters.find((one) => one.kind === 'outlaw');
    await take(outlaw.id);
    const words = (text) => gendered(text, outlaw.female ? 'female' : 'male');
    assert.deepEqual(await inHand(), {
      kind: 'outlaw',
      monsterId: outlaw.monsterId,
      name: outlaw.name,
      label: words(rules.texts.outlaw),
      areaId: outlaw.areaId,
      beaten: false,
      note: words(rules.texts.hunting.replace('{area}', outlaw.areaName)),
    });
    // In English: the target's name, its place and the poster's words.
    const english = await inHand('en');
    assert.notEqual(english.name, '');
    assert.doesNotMatch(`${english.label} ${english.note}`, /[ąćęłńóśźż]|Twój|Szukaj/);
    assert.match(english.note, /^Your poster\./);
    const stored = JSON.parse((await row()).settlement);
    stored.wanted.taken.beaten = true;
    await set('settlement = ?', JSON.stringify(stored));
    const beaten = await inHand();
    assert.equal(beaten.beaten, true);
    assert.equal(beaten.note, words(rules.texts.beaten));
    assert.equal((await call('POST', '/api/settlement/wanted/claim', { cookie })).status, 200);
    assert.equal(await inHand(), null);
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

  test('an exploration that set out with the poster keeps it: it is not given back, nor another taken, until its report is claimed', async () => {
    // The code review: given back on the way, the poster still brought its
    // target and loot, and came back open to be taken for another try.
    const view = await wanted();
    const poster = view.posters.find((one) => one.kind === 'creature');
    const other = view.posters.find((one) => one.id !== poster.id);
    await take(poster.id);
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: poster.areaId, minutes: 60 } })).status, 201);
    const dropped = await call('POST', '/api/settlement/wanted/drop', { cookie });
    assert.equal(dropped.status, 409);
    assert.equal(dropped.data.error.code, 'carried');
    assert.equal(dropped.data.error.message, rules.texts.carried);
    assert.equal((await wanted()).posters.find((one) => one.id === poster.id).state, 'taken');
    // A poster given back on the way before 0.1.68: while that exploration
    // goes on no other is taken; the one it set out with may be.
    const stored = JSON.parse((await row()).settlement);
    await set('settlement = ?', JSON.stringify({ ...stored, wanted: { ...stored.wanted, taken: null } }));
    const another = await take(other.id);
    assert.equal(another.status, 409);
    assert.equal(another.data.error.code, 'carried');
    assert.equal((await take(poster.id)).status, 200);
    // Called back, the exploration lets it go.
    assert.equal((await call('POST', '/api/hunts/cancel', { cookie })).status, 200);
    assert.equal((await call('POST', '/api/settlement/wanted/drop', { cookie })).status, 200);
  });

  test('a target beaten while its poster was not in hand fills the poster for its day all the same, with no bounty', async () => {
    await arm();
    const poster = (await wanted()).posters.find((one) => one.kind === 'outlaw');
    await take(poster.id);
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: poster.areaId, minutes: 60 } })).status, 201);
    // Given back on the way, as an exploration set out before 0.1.68 allows.
    const stored = JSON.parse((await row()).settlement);
    await set('settlement = ?', JSON.stringify({ ...stored, wanted: { ...stored.wanted, taken: null } }));
    // Not the very first exploration, and a seed meeting the target at once.
    await (await db()).prepare("INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) SELECT id, 'earlier', 'hunt', 0, '{}', '{}' FROM characters").run();
    let seed = 0;
    while (!createRng(`s${seed}:wanted`).chance(rules.chance)) seed += 1;
    await (await db()).prepare('UPDATE activities SET seed = ?').bind(`s${seed}`).run();
    await call('POST', '/api/test/skip-time', { cookie });
    const claimed = await call('POST', '/api/hunts/claim', { cookie });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
    const fight = claimed.data.report.fights.find((one) => one.wanted);
    assert.equal(fight?.won, true, 'the target met and beaten');
    const after = await wanted();
    assert.equal(after.posters.find((one) => one.id === poster.id).state, 'done');
    assert.equal(after.holding, false);
    assert.equal((await take(poster.id)).data.error.code, 'no_poster');
    assert.equal((await call('POST', '/api/settlement/wanted/claim', { cookie })).data.error.code, 'not_beaten');
    assert.deepEqual(JSON.parse((await row()).settlement).wanted.done, [poster.id]);
  });

  test('the day\'s posters are those of its first look: a place the Sala prób or the class level opens later that day hangs none', async () => {
    // The code review: a place opened after the day's four bounties brought
    // new posters the same day.
    const ids = (await wanted()).posters.map((poster) => poster.id);
    const kept = JSON.parse((await row()).settlement).wanted;
    assert.equal(kept.day, today());
    assert.deepEqual(kept.basis, { classLevel: 30, early: null });
    const opened = trialTarget(30, null, content).area.id;
    // Class level 50 and the place the Sala prób opened would hang posters
    // of higher places (wanted-places.test.js).
    await set('trial_hall = ?, class_level = 50', JSON.stringify({ day: today(), early: opened }));
    assert.deepEqual((await wanted()).posters.map((poster) => poster.id), ids);
    // A poster those places would hang is not the day's.
    const fresh = wantedPosters(50, today(), await characterId(), content, opened).find((poster) => !ids.includes(poster.id));
    assert.ok(fresh);
    assert.equal((await take(fresh.id)).data.error.code, 'no_poster');
    // The day's four done, none is left that day.
    for (const id of ids) await bounty(id);
    const done = await wanted();
    assert.ok(done.posters.every((poster) => poster.state === 'done'));
    assert.deepEqual(done.posters.map((poster) => poster.id), ids);
    // A record of another day: the day's posters come from the character as
    // it is then.
    const stored = JSON.parse((await row()).settlement);
    await set('settlement = ?', JSON.stringify({ ...stored, wanted: { ...stored.wanted, day: '2020-01-01' } }));
    const later = await wanted();
    assert.deepEqual(later.posters.map((poster) => poster.id), wantedPosters(50, today(), await characterId(), content, opened).map((poster) => poster.id));
    assert.deepEqual(JSON.parse((await row()).settlement).wanted.basis, { classLevel: 50, early: opened });
  });

  test('a record kept before 0.1.68, without the day\'s basis, keeps its poster in hand and those done', async () => {
    const posters = wantedPosters(30, today(), await characterId(), content);
    const taken = { ...posters[1], beaten: false };
    await set('settlement = ?', JSON.stringify({ wanted: { day: today(), done: [posters[0].id], taken } }));
    const view = await wanted();
    assert.deepEqual(view.posters.map((poster) => poster.state), ['done', 'taken', 'open', 'open']);
    assert.equal(view.holding, true);
    assert.deepEqual(JSON.parse((await row()).settlement).wanted, { day: today(), basis: { classLevel: 30, early: null }, done: [posters[0].id], taken });
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

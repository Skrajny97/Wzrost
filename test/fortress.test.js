import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  applyClassXp,
  applyHunt,
  blessingPlan,
  buildMinutes,
  buildingTop,
  campLevels,
  campNeeds,
  createRng,
  effectText,
  eventChance,
  faintPenalty,
  faintShare,
  familiesKnown,
  fortressReady,
  fortressStands,
  gearSetCount,
  gearSetIds,
  gearSetPlan,
  greenhouseHours,
  greenhouseSince,
  greenhouseStore,
  herbsPerHour,
  leavingRack,
  questPeriod,
  rollUpgrade,
  scoutChances,
  scoutedCreature,
  scouting,
  simulateHunt,
  trainingPlan,
  trainingXp,
  trophyHallBonuses,
  upgradeCost,
  upgradeMinutes,
  xpToNext,
} from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';

// The newest place's stronger creatures (balance.monsters.huntCurve,
// hunt-strength.test.js) and the harder explorations from the 10th level
// (balance.challenge) aside: these fights test something else.
const calm = { ...content, balance: { ...content.balance, monsters: { ...content.balance.monsters, huntCurve: [] }, challenge: { ...content.balance.challenge, fromLevel: Infinity } } };
import { useServer } from './helpers/server.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { toHex } from '../src/server/encoding.js';
import { readFeatures } from '../src/server/features.js';
import { wearGearSet } from '../src/server/fortress.js';
import { upgradeItem } from '../src/server/inventory.js';

const fortress = content.camp.fortress;
const fortressBuildings = content.buildings.filter((building) => building.fortress);
const campBuildings = content.buildings.filter((building) => !building.fortress);
const building = (id) => content.buildingsById[id];

// Every camp building at its highest level, ended long ago, and the Obóz at its own.
function fullCamp() {
  const stored = Object.fromEntries(campBuildings.map((one) => [one.id, { level: one.maxLevel, startedAt: 0, endsAt: 1 }]));
  stored.camp = { level: content.camp.maxLevel, startedAt: 0, endsAt: 1 };
  return stored;
}

describe('the Warownia', () => {
  test('the seven buildings of the approved plan, with their levels', () => {
    assert.deepEqual(
      fortressBuildings.map((one) => [one.name, one.maxLevel]),
      [
        ['Plac treningowy', 10],
        ['Zbrojownia', 2],
        ['Sala trofeów', 10],
        ['Strażnica', 5],
        ['Ołtarz Systemu', 10],
        ['Szklarnia', 10],
        ['Kapliczka', 10],
      ],
    );
  });

  test('the camp turns into a Warownia only at the top of every building and of the Obóz (419 A)', () => {
    const stored = fullCamp();
    assert.equal(fortressReady(stored, 10, campBuildings, content), true);
    const lowCamp = { ...stored, camp: { level: content.camp.maxLevel - 1, startedAt: 0, endsAt: 1 } };
    assert.equal(fortressReady(lowCamp, 10, campBuildings, content), false);
    const lowSawmill = { ...stored, sawmill: { level: 9, startedAt: 0, endsAt: 1 } };
    assert.equal(fortressReady(lowSawmill, 10, campBuildings, content), false);
    // An upgrade to the top still under way does not count yet.
    const building = { ...stored, sawmill: { level: 10, startedAt: 0, endsAt: 100 } };
    assert.equal(fortressReady(building, 50, campBuildings, content), false);
    assert.equal(fortressReady(building, 100, campBuildings, content), true);
    // Begun, it is not offered again.
    assert.equal(fortressReady({ ...stored, fortress: { level: 1, startedAt: 10, endsAt: 20 } }, 15, campBuildings, content), false);
  });

  test('the transformation costs 120 000 gold and resources and takes 3 days, at any camp level (430 A)', () => {
    assert.deepEqual(upgradeCost(fortress, 1), { gold: 120000, wood: 10000, stone: 7000, 'iron-ore': 5000 });
    assert.equal(buildMinutes(fortress, 1, content.camp.maxLevel, content), 3 * 24 * 60);
    const stored = { ...fullCamp(), fortress: { level: 1, startedAt: 0, endsAt: 1000 } };
    assert.equal(fortressStands(stored, 999, content), false);
    assert.equal(fortressStands(stored, 1000, content), true);
    assert.equal(fortressStands(fullCamp(), 1000, content), false);
  });

  test("the Warownia's buildings cost more than the camp's at their 10th level", () => {
    for (const resource of ['gold', 'wood', 'stone', 'iron-ore']) {
      const top = Math.max(...campBuildings.map((one) => upgradeCost(one, one.maxLevel)[resource] ?? 0));
      for (const one of fortressBuildings) assert.ok(upgradeCost(one, 1)[resource] > top, `${one.id} ${resource}`);
    }
  });

  test('what each building gives, as the page says it', () => {
    assert.equal(effectText(building('training-yard'), 3, content), 'Trening raz dziennie przez 3 h, za XP klasy jak z 25% wyprawy tej samej długości');
    assert.equal(effectText(building('armory'), 1, content), 'Zapisane zestawy ekwipunku: 2');
    assert.equal(effectText(building('armory'), 2, content), 'Zapisane zestawy ekwipunku: 3');
    assert.equal(effectText(building('trophy-hall'), 1, content), 'Obrażenia +0,5% przeciw rodzinom stworów poznanym w całości w Bestiariuszu');
    assert.equal(effectText(building('trophy-hall'), 10, content), 'Obrażenia +5% przeciw rodzinom stworów poznanym w całości w Bestiariuszu');
    assert.equal(effectText(building('watchtower'), 1, content), 'Szanse na elitę, czempiona i zdarzenie przed wyprawą');
    assert.equal(effectText(building('watchtower'), 2, content), 'Szanse na elitę, czempiona i zdarzenie przed wyprawą, tropiony stwór częściej o 40%');
    assert.equal(effectText(building('watchtower'), 5, content), 'Szanse na elitę, czempiona i zdarzenie przed wyprawą, tropiony stwór częściej o 100%');
    assert.equal(effectText(building('system-altar'), 1, content), 'Błogosławieństwo raz dziennie na 4 walki: +10% XP, złota albo szans na rzadsze przedmioty');
    assert.equal(effectText(building('system-altar'), 10, content), 'Błogosławieństwo raz dziennie na 40 walk: +10% XP, złota albo szans na rzadsze przedmioty');
    assert.equal(effectText(building('greenhouse'), 1, content), 'Hoduje wybrane zioło: tyle, ile 0,5 h zbierania w Systemowym Zagajniku na dobę');
    assert.equal(effectText(building('greenhouse'), 10, content), 'Hoduje wybrane zioło: tyle, ile 5 h zbierania w Systemowym Zagajniku na dobę');
    assert.equal(effectText(building('shrine'), 10, content), 'Po porażce postać traci o 50% mniej doświadczenia');
  });

  test("the effects at the camp's levels, nothing before a building stands", () => {
    const none = campLevels({}, 0, content);
    assert.equal(trainingPlan(none, content), null);
    assert.equal(gearSetCount(none, content), 0);
    assert.equal(scouting(none, content), null);
    assert.equal(blessingPlan(none, content), null);
    assert.equal(greenhouseHours(none, content), 0);
    assert.equal(faintShare(none, content), 1);
    const levels = { ...none, 'training-yard': 4, armory: 2, watchtower: 1, 'system-altar': 3, greenhouse: 10, shrine: 4 };
    assert.deepEqual(trainingPlan(levels, content), { hours: 4, share: 0.25 });
    assert.equal(gearSetCount(levels, content), 3);
    assert.deepEqual(scouting(levels, content), { chances: true, track: 0 });
    assert.deepEqual(scouting({ ...levels, watchtower: 3 }, content), { chances: true, track: 0.6 });
    assert.deepEqual(blessingPlan(levels, content), { fights: 12, bonus: 0.1 });
    assert.equal(greenhouseHours(levels, content), 5);
    assert.equal(faintShare(levels, content), 0.8);
  });

  test("the Kapliczka takes 5% of a faint's XP loss off for each level (427 A)", () => {
    const need = xpToNext(30, content);
    const xp = Math.floor(need * 0.9);
    assert.equal(faintPenalty(30, xp, content), Math.floor(content.balance.hunt.faintXpPenalty * need));
    assert.equal(faintPenalty(30, xp, content, 0.5), Math.floor(0.5 * content.balance.hunt.faintXpPenalty * need));
    const character = { classId: 'warrior', level: 30, xp, classLevel: 30, classXp: 0 };
    const hunt = { result: 'fainted', xp: 0 };
    const plain = applyHunt(character, hunt, content);
    const kept = applyHunt(character, hunt, content, { faintShare: 0.5 });
    assert.equal(plain.penalty, faintPenalty(30, xp, content));
    assert.equal(kept.penalty, faintPenalty(30, xp, content, 0.5));
    assert.equal(kept.xp, xp - kept.penalty);
  });

  test('the Sala trofeów strikes harder at families known in full, and keeps them (422 A)', () => {
    const stones = Object.values(content.monstersById).filter((monster) => monster.family === 'stone' && !content.eventFoesById[monster.id]);
    assert.ok(stones.length > 1);
    const levels = { ...campLevels({}, 0, content), 'trophy-hall': 4 };
    // Every stone creature met: the family is known; one short, it is not.
    assert.ok(familiesKnown(stones.map((monster) => monster.id), content).includes('stone'));
    assert.ok(!familiesKnown(stones.slice(1).map((monster) => monster.id), content).includes('stone'));
    const all = trophyHallBonuses(levels, stones.map((monster) => monster.id), [], content);
    assert.deepEqual(Object.keys(all).sort(), stones.map((monster) => monster.id).sort());
    for (const bonus of Object.values(all)) assert.equal(bonus, 0.02);
    // Kept once won, though a new creature of the family is not met yet.
    const kept = trophyHallBonuses(levels, stones.slice(1).map((monster) => monster.id), ['stone'], content);
    assert.equal(kept[stones[0].id], 0.02);
    // Without the hall, or for other creatures, nothing.
    assert.deepEqual(trophyHallBonuses(campLevels({}, 0, content), stones.map((monster) => monster.id), ['stone'], content), {});
    assert.deepEqual(trophyHallBonuses(levels, stones.map((monster) => monster.id), [], content, ['wolf']), {});
  });
});

describe('the Ołtarz Systemu in an exploration', () => {
  const settled = typicalCharacter('warrior', 43, content);
  const explore = (blessing) => simulateHunt({ ...settled, hp: 9999, name: 'Mira', areaId: 'wolf-circles', minutes: 240, seed: 'oltarz', blessing }, calm);

  test('a blessing works in the first fights only, for its share more XP or gold (424 A, 580)', () => {
    const plain = explore(null);
    assert.ok(plain.fights.length > 4);
    assert.equal(plain.blessingFights, 0);
    const xp = explore({ kind: 'xp', bonus: 0.1, fights: 4 });
    assert.equal(xp.blessingFights, 4);
    // The same fights, the first four with 10% more XP (rounded once), the others as they were.
    xp.fights.forEach((fight, index) => {
      const before = plain.fights[index].xp;
      if (index < 4) assert.ok(Math.abs(fight.xp - before * 1.1) <= 1, `fight ${index}: ${fight.xp} for ${before}`);
      else assert.equal(fight.xp, before, `fight ${index}`);
    });
    const gold = explore({ kind: 'gold', bonus: 0.1, fights: 4 });
    assert.ok(gold.gold > plain.gold);
    assert.equal(gold.xp, plain.xp);
    // More fights blessed than the exploration has: it uses up only those it has.
    assert.equal(explore({ kind: 'xp', bonus: 0.1, fights: 999 }).blessingFights, plain.fights.length);
  });

  test('a blessing of luck makes rarer items more likely in its fights', () => {
    const rare = (blessing) =>
      Array.from({ length: 40 }, (_, i) => simulateHunt({ ...settled, hp: 9999, name: 'Mira', areaId: 'wolf-circles', minutes: 240, seed: `szczescie:${i}`, blessing }, calm))
        .flatMap((result) => result.items)
        .filter((item) => item.rarity !== content.rarities[0].id).length;
    assert.ok(rare({ kind: 'luck', bonus: 1, fights: 999 }) > rare(null));
  });
});

describe('the Strażnica in an exploration', () => {
  const area = content.areasById['wolf-circles'];
  test('the chances of an elite, a champion and an event grow with the length, and seeking the rare raises them (423 A)', () => {
    const short = scoutChances(area, 30, content);
    const long = scoutChances(area, 240, content);
    for (const chances of [short, long]) for (const value of Object.values(chances)) assert.ok(value >= 0 && value <= 1);
    assert.ok(long.elite > short.elite);
    assert.ok(long.event > short.event);
    assert.equal(long.event, eventChance(content, 240));
    assert.ok(scoutChances(area, 240, content, { seekRare: true }).elite > long.elite);
    assert.deepEqual(scoutChances(area, 240, content, { avoidRare: true }).elite, 0);
    if (!area.champion) assert.equal(long.champion, 0);
  });

  test('a creature tracked from the 2nd level is met more often, and only one of the place', () => {
    const levels = (level) => ({ ...campLevels({}, 0, content), watchtower: level });
    const creature = area.encounters[0].monsters[0];
    assert.equal(scoutedCreature(levels(1), area, creature, content), null);
    assert.deepEqual(scoutedCreature(levels(2), area, creature, content), { id: creature, bonus: 0.4 });
    assert.deepEqual(scoutedCreature(levels(5), area, creature, content), { id: creature, bonus: 1 });
    assert.equal(scoutedCreature(levels(5), area, 'no-such-creature', content), null);
    const settled = typicalCharacter('warrior', 43, content);
    const meetings = (scouted) =>
      Array.from({ length: 30 }, (_, i) => simulateHunt({ ...settled, hp: 9999, name: 'Mira', areaId: area.id, minutes: 240, seed: `trop:${i}`, scouted }, content))
        .flatMap((hunt) => hunt.fights)
        .filter((fight) => fight.enemies.some((enemy) => enemy.monsterId === creature)).length;
    assert.ok(meetings({ id: creature, bonus: 1 }) > meetings(null));
  });
});

describe('the Strażnica in the game', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on', FORTRESS: 'on' });
  let cookie;
  const build = async (level) => {
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    for (const [buildingId, at] of [...[...campBuildings, content.camp].map((one) => [one.id, one.maxLevel]), ['fortress', 1], ['watchtower', level]]) {
      await database.prepare('INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) VALUES (?, ?, ?, 0, 1) ON CONFLICT (character_id, building_id) DO UPDATE SET level = excluded.level').bind(id, buildingId, at).run();
    }
  };
  beforeEach(async () => {
    ({ cookie } = await signUp('straznik'));
    await call('POST', '/api/character', { cookie, body: { name: 'Straznik', classId: 'warrior', appearance: 'male' } });
    await (await db()).prepare('UPDATE characters SET level = 25, xp = 0').run();
  });
  const options = async () => (await call('GET', '/api/hunts/options?area=windfalls-edge', { cookie })).data.areas[0];

  test('before an exploration the chances show from the 1st level, the creatures to track from the 2nd', async () => {
    assert.equal((await options()).chances, undefined);
    await build(1);
    const first = await options();
    assert.ok(Object.keys(first.chances).length > 0);
    for (const chances of Object.values(first.chances)) assert.deepEqual(Object.keys(chances).sort(), ['champion', 'elite', 'event']);
    assert.equal(first.scout, undefined);
    const area = content.areasById['windfalls-edge'];
    const creature = area.encounters[0].monsters[0];
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: area.id, minutes: 30, scout: creature } })).data.error.code, 'cannot_scout');
    await build(3);
    const third = await options();
    assert.equal(third.scout.share, 0.6);
    assert.ok(third.scout.creatures.some((one) => one.id === creature));
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: area.id, minutes: 30, scout: creature } })).status, 201);
    const stored = JSON.parse((await (await db()).prepare('SELECT options FROM activities').first()).options);
    assert.deepEqual(stored.scouted, { id: creature, bonus: 0.6 });
  });
});

describe('the Warownia in the game', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on', FORTRESS: 'on' });
  let cookie;
  beforeEach(async () => {
    ({ cookie } = await signUp('kasztelan'));
    await call('POST', '/api/character', { cookie, body: { name: 'Kasztelan', classId: 'warrior', appearance: 'male' } });
    await (await db())
      .prepare('UPDATE characters SET level = 90, class_level = 90, gold = 200000, resources = ?')
      .bind(JSON.stringify({ wood: 20000, stone: 20000, 'iron-ore': 20000 }))
      .run();
  });
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const build = (buildingId) => call('POST', '/api/camp/build', { cookie, body: { buildingId } });
  async function topCamp() {
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    for (const one of [...campBuildings, content.camp]) {
      await database.prepare('INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) VALUES (?, ?, ?, 0, 1)').bind(id, one.id, one.maxLevel).run();
    }
    return id;
  }

  test("the Duch budowniczego counts the transformation's resources in what the camp still needs", async () => {
    await topCamp();
    const goods = Object.fromEntries((await character()).camp.cornerstone.spirit.goods.map((good) => [good.id, good.need]));
    const cost = Object.fromEntries(fortress.costs.map((one) => [one.resource, one.base]));
    for (const id of ['wood', 'stone', 'iron-ore']) assert.equal(goods[id], cost[id], id);
  });

  test('the Kamień węgielny turns the camp into a Warownia once all is at the top, and its buildings come after', async () => {
    const start = await character();
    assert.equal(start.camp.cornerstone.fortress.ready, false);
    assert.equal((await build('fortress')).data.error.code, 'fortress_not_ready');
    // The Warownia's buildings are not in the camp yet, nor may they be built.
    assert.ok(!start.camp.buildings.some((one) => one.id === 'shrine'));
    assert.equal((await build('shrine')).status, 400);

    const id = await topCamp();
    const ready = (await character()).camp.cornerstone.fortress;
    assert.equal(ready.ready, true);
    assert.deepEqual(ready.cost, { gold: 120000, wood: 10000, stone: 7000, 'iron-ore': 5000 });
    assert.equal(ready.minutes, 3 * 24 * 60);
    const begun = await build('fortress');
    assert.equal(begun.status, 201);
    assert.equal(begun.data.character.gold, 80000);
    assert.deepEqual(begun.data.character.resources, { wood: 10000, stone: 13000, 'iron-ore': 15000 });
    const underWay = begun.data.character.camp.cornerstone.fortress;
    assert.equal(underWay.ready, false);
    assert.equal(underWay.stands, false);
    assert.equal(underWay.building.endsAt - underWay.building.startedAt, 3 * 24 * 3600000);
    assert.ok(!begun.data.character.camp.buildings.some((one) => one.id === 'shrine'));
    assert.equal((await build('fortress')).data.error.code, 'fortress_building');

    // Three days later the Warownia stands, and all seven of its buildings can be built.
    await (await db()).prepare("UPDATE buildings SET started_at = 0, ends_at = 1 WHERE character_id = ? AND building_id = 'fortress'").bind(id).run();
    const after = await character();
    assert.equal(after.camp.cornerstone.fortress.stands, true);
    assert.deepEqual(
      after.camp.buildings.filter((one) => content.buildingsById[one.id].fortress).map((one) => one.id),
      fortressBuildings.map((one) => one.id),
    );
    assert.equal((await build('fortress')).data.error.code, 'max_level');
    const shrine = await build('shrine');
    assert.equal(shrine.status, 201);
    assert.equal(shrine.data.character.gold, 80000 - upgradeCost(building('shrine'), 1).gold);
  });
});

describe('the Sala trofeów in the game', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on', FORTRESS: 'on' });
  test('a family met in full is written down among the discoveries, and stays when it is not whole any more', async () => {
    const { cookie } = await signUp('lowczy');
    await call('POST', '/api/character', { cookie, body: { name: 'Lowczy', classId: 'archer', appearance: 'female' } });
    const stones = Object.values(content.monstersById).filter((monster) => monster.family === 'stone' && !content.eventFoesById[monster.id]).map((monster) => monster.id);
    const database = await db();
    await database.prepare('UPDATE characters SET met = ?').bind(JSON.stringify(stones.slice(1))).run();
    await call('GET', '/api/character', { cookie });
    const before = JSON.parse((await database.prepare('SELECT discovered FROM characters').first()).discovered ?? '{}');
    assert.equal(before['family:stone'], undefined);
    await database.prepare('UPDATE characters SET met = ?').bind(JSON.stringify(stones)).run();
    await call('GET', '/api/character', { cookie });
    const after = JSON.parse((await database.prepare('SELECT discovered FROM characters').first()).discovered);
    assert.equal(after['family:stone'], 1);
    // A creature of the family not met (as when a new one joins it) leaves the family written down.
    await database.prepare('UPDATE characters SET met = ?').bind(JSON.stringify(stones.slice(1))).run();
    await call('GET', '/api/character', { cookie });
    const kept = JSON.parse((await database.prepare('SELECT discovered FROM characters').first()).discovered);
    assert.equal(kept['family:stone'], 1);
  });
});

describe('the Plac treningowy', () => {
  test('a training that raises the class level says nothing of a heal: it does not heal', () => {
    const applied = applyClassXp({ ...newCharacter('warrior'), level: 80, classLevel: 60, classXp: 0 }, 10 ** 8, content);
    assert.ok(applied.levelled);
    const heal = [...content.texts.levelHeal, ...content.texts.levelHealFemale];
    assert.ok(applied.messages.length > 0 && !applied.messages.some((line) => heal.includes(line)));
  });
});

describe('the Plac treningowy in the game', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on', FORTRESS: 'on' });
  let cookie;
  let id;
  beforeEach(async () => {
    ({ cookie } = await signUp('trener'));
    await call('POST', '/api/character', { cookie, body: { name: 'Trener', classId: 'warrior', appearance: 'male' } });
    const database = await db();
    ({ id } = await database.prepare('SELECT id FROM characters').first());
    await database.prepare('UPDATE characters SET level = 80, class_level = 60, class_xp = 0 WHERE id = ?').bind(id).run();
    for (const [buildingId, level] of [...[...campBuildings, content.camp].map((one) => [one.id, one.maxLevel]), ['fortress', 1], ['training-yard', 4]]) {
      await database.prepare('INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) VALUES (?, ?, ?, 0, 1)').bind(id, buildingId, level).run();
    }
  });
  const yard = async () => (await call('GET', '/api/character', { cookie })).data.character.camp.buildings.find((one) => one.id === 'training-yard');
  const train = () => call('POST', '/api/fortress/training', { cookie });
  const claim = () => call('POST', '/api/fortress/training/claim', { cookie });
  const xp = trainingXp(80, { hours: 4, share: 0.25 }, content);

  test("a training a day of an hour a level, for a quarter of an exploration's class XP, claimed when it ends (420 A)", async () => {
    const before = (await yard()).training;
    assert.deepEqual([before.hours, before.xp, before.canStart, before.current], [4, xp, true, null]);
    assert.equal((await claim()).data.error.code, 'no_training');
    const started = await train();
    assert.equal(started.status, 201);
    const current = started.data.character.camp.buildings.find((one) => one.id === 'training-yard').training.current;
    assert.equal(current.endsAt - current.startedAt, 4 * 3600000);
    assert.deepEqual([current.xp, current.done], [xp, false]);
    // Once a day, and claimed only when it ends.
    assert.equal((await train()).data.error.code, 'trained_today');
    assert.equal((await claim()).data.error.code, 'not_finished');
    const database = await db();
    const state = JSON.parse((await database.prepare('SELECT fortress FROM characters').first()).fortress);
    state.training.endsAt = 1;
    await database.prepare('UPDATE characters SET fortress = ?').bind(JSON.stringify(state)).run();
    const claimed = await claim();
    assert.equal(claimed.status, 200);
    assert.equal(claimed.data.trained.xp, xp);
    const heal = [...content.texts.levelHeal, ...content.texts.levelHealFemale];
    assert.ok(!claimed.data.trained.messages.some((line) => heal.includes(line)));
    const expected = applyClassXp({ ...newCharacter('warrior'), level: 80, classLevel: 60, classXp: 0 }, xp, content);
    assert.deepEqual([claimed.data.character.classLevel, claimed.data.character.classXp], [expected.classLevel, expected.classXp]);
    // The character's own XP stays as it was: the training is the class's.
    assert.equal(claimed.data.character.level, 80);
    assert.equal((await claim()).data.error.code, 'no_training');
    // The next one after midnight only.
    assert.equal((await train()).data.error.code, 'trained_today');
    assert.equal((await yard()).training.canStart, false);
  });

  test('the class XP waits while the character explores, as its report is made with the class it has then', async () => {
    assert.equal((await train()).status, 201);
    const database = await db();
    const state = JSON.parse((await database.prepare('SELECT fortress FROM characters').first()).fortress);
    state.training.endsAt = 1;
    await database.prepare('UPDATE characters SET fortress = ?').bind(JSON.stringify(state)).run();
    const hunt = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 1 } });
    assert.equal(hunt.status, 201);
    assert.equal((await claim()).data.error.code, 'training_exploring');
  });

  test('no training without the yard', async () => {
    await (await db()).prepare("DELETE FROM buildings WHERE building_id = 'training-yard'").run();
    // The yard can be built, but it is not yet.
    const unbuilt = await yard();
    assert.deepEqual([unbuilt.level, unbuilt.training], [0, null]);
    assert.equal((await train()).data.error.code, 'no_training_yard');
  });
});

describe('the Ołtarz Systemu in the game', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on', FORTRESS: 'on' });
  let cookie;
  beforeEach(async () => {
    ({ cookie } = await signUp('kaplan'));
    await call('POST', '/api/character', { cookie, body: { name: 'Kaplan', classId: 'warrior', appearance: 'male' } });
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    await database.prepare('UPDATE characters SET level = 25, xp = 0 WHERE id = ?').bind(id).run();
    for (const [buildingId, level] of [...[...campBuildings, content.camp].map((one) => [one.id, one.maxLevel]), ['fortress', 1], ['system-altar', 2]]) {
      await database.prepare('INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) VALUES (?, ?, ?, 0, 1)').bind(id, buildingId, level).run();
    }
  });
  const altar = async () => (await call('GET', '/api/character', { cookie })).data.character.camp.buildings.find((one) => one.id === 'system-altar');
  const choose = (kind) => call('POST', '/api/fortress/blessing', { cookie, body: { kind } });
  const state = async () => JSON.parse((await (await db()).prepare('SELECT fortress FROM characters').first()).fortress);

  test('one blessing a day, for 4 fights a level, used up by the fights of the reports claimed', async () => {
    const before = (await altar()).blessing;
    assert.deepEqual([before.fights, before.choices.map((one) => one.id), before.canChoose, before.current], [8, ['xp', 'gold', 'luck'], true, null]);
    assert.equal((await choose('fame')).data.error.code, 'invalid_blessing');
    assert.equal((await choose('xp')).status, 201);
    assert.deepEqual((await altar()).blessing.current, { kind: 'xp', left: 8, today: true });
    assert.equal((await choose('gold')).data.error.code, 'blessed_today');
    // An exploration takes it along and its report uses up the fights it worked in.
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 60 } })).status, 201);
    await (await db()).prepare('UPDATE activities SET started_at = started_at - 3600000, ends_at = ends_at - 3600000').run();
    assert.equal((await call('POST', '/api/hunts/claim', { cookie })).status, 200);
    const report = JSON.parse((await (await db()).prepare("SELECT data FROM reports WHERE kind = 'hunt'").first()).data);
    const fought = report.fights.length;
    assert.ok(fought > 0);
    assert.equal((await state()).blessing.left, Math.max(0, 8 - fought));
  });

  test('without the altar there is nothing to choose', async () => {
    await (await db()).prepare("DELETE FROM buildings WHERE building_id = 'system-altar'").run();
    assert.equal((await choose('xp')).data.error.code, 'no_altar');
  });
});

describe('the Szklarnia', () => {
  const herb = content.herbs.find((one) => one.level <= 1);
  test('its herb grows all day as gathering would, up to a day of it, and what is left stays (426 A)', () => {
    const levels = { ...campLevels({}, 0, content), greenhouse: 10 };
    const day = 24 * 3600000;
    const state = { herb: herb.id, since: 0 };
    const half = greenhouseStore(levels, state, 1, day / 2, content);
    assert.equal(half.perDay, herbsPerHour(herb, 1, content) * 5);
    assert.equal(half.amount, Math.floor(half.perDay / 2));
    // A day brings a day's growth; the store holds the herb still growing too, and no more.
    assert.equal(greenhouseStore(levels, state, 1, day, content).amount, Math.floor(half.perDay));
    assert.equal(greenhouseStore(levels, state, 1, 3 * day, content).amount, Math.floor(half.perDay + 1));
    // A higher Zielarstwo grows more.
    assert.ok(greenhouseStore(levels, state, 50, day, content).amount > greenhouseStore(levels, state, 1, day, content).amount);
    // Taking part of a full store leaves the rest in it.
    const full = greenhouseStore(levels, state, 1, 3 * day, content);
    const since = greenhouseSince(full, 3, 3 * day);
    assert.equal(greenhouseStore(levels, { ...state, since }, 1, 3 * day, content).amount, full.amount - 3);
    // Without the building or a herb, no store.
    assert.equal(greenhouseStore(campLevels({}, 0, content), state, 1, day, content), null);
    assert.equal(greenhouseStore(levels, null, 1, day, content), null);
  });
});

describe('the Szklarnia, collected once a day', () => {
  test('even the slowest herb loses nothing to the store being full', () => {
    const slowest = content.herbs.reduce((one, other) => (other.perHour < one.perHour ? other : one));
    const levels = { ...campLevels({}, 0, content), greenhouse: 1 };
    const day = 24 * 3600000;
    let state = { herb: slowest.id, since: 0 };
    let total = 0;
    for (let at = 1; at <= 10; at += 1) {
      const store = greenhouseStore(levels, state, 50, at * day, content);
      total += store.amount;
      state = { ...state, since: greenhouseSince(store, store.amount, at * day) };
    }
    assert.equal(total, Math.floor(herbsPerHour(slowest, 50, content) * 0.5 * 10 + 1e-9));
  });
});

describe('the Szklarnia in the game', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on', FORTRESS: 'on' });
  let cookie;
  const herb = content.herbs.find((one) => one.level <= 1);
  const unknownHerb = content.herbs.find((one) => one.level > 1);
  beforeEach(async () => {
    ({ cookie } = await signUp('ogrodnik'));
    await call('POST', '/api/character', { cookie, body: { name: 'Ogrodnik', classId: 'warrior', appearance: 'male' } });
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    for (const [buildingId, level] of [...[...campBuildings, content.camp].map((one) => [one.id, one.maxLevel]), ['fortress', 1], ['greenhouse', 4]]) {
      await database.prepare('INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) VALUES (?, ?, ?, 0, 1)').bind(id, buildingId, level).run();
    }
  });
  const house = async () => (await call('GET', '/api/character', { cookie })).data.character.camp.buildings.find((one) => one.id === 'greenhouse');
  const choose = (id) => call('POST', '/api/fortress/greenhouse', { cookie, body: { herb: id } });
  const collect = () => call('POST', '/api/fortress/greenhouse/collect', { cookie });

  test('a herb known from Zielarstwo grows, and is collected into the bag', async () => {
    const view = (await house()).greenhouse;
    assert.equal(view.hours, 2);
    assert.ok(view.herbs.some((one) => one.id === herb.id));
    assert.equal(view.current, null);
    if (unknownHerb) assert.equal((await choose(unknownHerb.id)).data.error.code, 'unknown_herb');
    assert.equal((await choose(herb.id)).status, 201);
    assert.equal((await collect()).data.error.code, 'nothing_grown');
    // Half a day later.
    const database = await db();
    const state = JSON.parse((await database.prepare('SELECT fortress FROM characters').first()).fortress);
    state.greenhouse.since -= 12 * 3600000;
    await database.prepare('UPDATE characters SET fortress = ?').bind(JSON.stringify(state)).run();
    const grown = (await house()).greenhouse.current;
    const expected = Math.floor((herbsPerHour(herb, 1, content) * 2) / 2);
    assert.equal(grown.amount, expected);
    const collected = await collect();
    assert.equal(collected.status, 200);
    assert.deepEqual(collected.data.collected, { herb: herb.id, name: herb.name, count: expected });
    const herbs = JSON.parse((await database.prepare('SELECT herbs FROM characters').first()).herbs);
    assert.equal(herbs[herb.id], expected);
    assert.equal((await house()).greenhouse.current.amount, 0);
  });

  test('a full bag takes what fits, the rest stays, and the herb changes only once all fits', async () => {
    const database = await db();
    await database.prepare('UPDATE characters SET professions = ?').bind(JSON.stringify({ herbalism: { level: 3, xp: 0 } })).run();
    assert.equal((await choose(herb.id)).status, 201);
    const state = JSON.parse((await database.prepare('SELECT fortress FROM characters').first()).fortress);
    state.greenhouse.since -= 12 * 3600000;
    await database.prepare('UPDATE characters SET fortress = ?').bind(JSON.stringify(state)).run();
    const grown = (await house()).greenhouse.current.amount;
    assert.ok(grown > 2);
    // The bag full, with room for 2 in the last stack of the herb.
    const view = (await call('GET', '/api/character', { cookie })).data.character;
    const filler = content.herbs.at(-1).id;
    const places = view.bagCapacity - view.bagUsed;
    const stack = content.professionRules.stack;
    await database.prepare('UPDATE characters SET herbs = ?').bind(JSON.stringify({ [filler]: stack * (places - 1), [herb.id]: stack - 2 })).run();
    const other = content.herbs.find((one) => one.level > 1 && one.level <= 3);
    assert.equal((await choose(other.id)).data.error.code, 'bag_full');
    const collected = await collect();
    assert.deepEqual(collected.data.collected, { herb: herb.id, name: herb.name, count: 2 });
    assert.equal((await house()).greenhouse.current.amount, grown - 2);
    assert.equal((await collect()).data.error.code, 'bag_full');
    // Room again: the change takes what has grown first.
    await database.prepare('UPDATE characters SET herbs = ?').bind('{}').run();
    const changed = await choose(other.id);
    assert.equal(changed.status, 201);
    assert.equal(changed.data.collected, grown - 2);
    const after = changed.data.character.camp.buildings.find((one) => one.id === 'greenhouse').greenhouse.current;
    assert.deepEqual([after.herb, after.amount], [other.id, 0]);
  });
});

describe('the Zbrojownia', () => {
  const item = (id, slot, equippedSlot = null) => ({ id, slot, equippedSlot });

  test('a set is worn over what else is worn, which goes onto a rack or into the bag (421 A)', () => {
    const items = [item(1, 'weapon', 'weapon'), item(2, 'head', 'head'), item(3, 'weapon'), item(4, 'chest', 'chest'), item(5, 'ring')];
    const sets = [
      { name: 'A', items: [1, 2] },
      { name: 'B', items: [3, 2] },
    ];
    // Wearing B: the weapon of A goes onto a rack, the armour of no set into the bag.
    const plan = gearSetPlan(sets, 1, items);
    assert.deepEqual(
      plan.wear.map((one) => one.id),
      [3, 2],
    );
    assert.deepEqual(
      plan.toBag.map((one) => one.id),
      [4],
    );
    // An item no longer had is left out, and a slot takes one item.
    assert.deepEqual(
      gearSetPlan([{ name: 'C', items: [9, 1, 3] }], 0, items).wear.map((one) => one.id),
      [1],
    );
    assert.deepEqual(gearSetIds([null, ...sets]), new Set([1, 2, 3]));
  });

  test('what leaves the racks for the bag when a set is saved again or emptied', () => {
    const items = [item(1, 'weapon'), item(2, 'head', 'head'), item(3, 'weapon', 'weapon')];
    const sets = [
      { name: 'A', items: [1, 2] },
      { name: 'B', items: [3, 2] },
    ];
    // Emptying A, or saving it with what is worn now: its weapon comes down.
    assert.deepEqual(
      leavingRack(sets, 0, null, items).map((one) => one.id),
      [1],
    );
    assert.deepEqual(
      leavingRack(sets, 0, { name: 'A', items: [3, 2] }, items).map((one) => one.id),
      [1],
    );
    // Emptying B: all of it is worn. A set not saved holds nothing.
    assert.deepEqual(leavingRack(sets, 1, null, items), []);
    assert.deepEqual(leavingRack(sets, 5, null, items), []);
  });
});

describe('the Zbrojownia in the game', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on', FORTRESS: 'on' });
  let cookie;
  let id;
  let armour;
  let spare;
  beforeEach(async () => {
    ({ cookie } = await signUp('zbrojmistrz'));
    await call('POST', '/api/character', { cookie, body: { name: 'Zbrojmistrz', classId: 'warrior', appearance: 'male' } });
    const database = await db();
    ({ id } = await database.prepare('SELECT id FROM characters').first());
    await database.prepare('UPDATE characters SET level = 25, xp = 0 WHERE id = ?').bind(id).run();
    for (const [buildingId, level] of [...[...campBuildings, content.camp].map((one) => [one.id, one.maxLevel]), ['fortress', 1], ['armory', 1]]) {
      await database.prepare('INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) VALUES (?, ?, ?, 0, 1)').bind(id, buildingId, level).run();
    }
    // Armour worn, and a second one in the bag.
    const chain = (level) => JSON.stringify({ base: 'chainmail', slot: 'chest', level, rarity: 'common', affixes: [], armor: 15 });
    const insert = (slot, level) => database.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, ?, ?, 0)').bind(id, slot, chain(level)).run();
    armour = (await insert('chest', 5)).meta.last_row_id;
    spare = (await insert(null, 6)).meta.last_row_id;
  });
  const view = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const armory = async () => (await view()).camp.buildings.find((one) => one.id === 'armory').gearSets;
  const save = (index, name) => call('POST', '/api/fortress/sets', { cookie, body: { index, name } });
  const wear = (index) => call('POST', '/api/fortress/sets/wear', { cookie, body: { index } });
  const clear = (index) => call('POST', '/api/fortress/sets/clear', { cookie, body: { index } });
  const equip = (itemId) => call('POST', `/api/items/${itemId}/equip`, { cookie });
  const ids = (items) => items.map((one) => one.id).sort((a, b) => a - b);

  test('a set keeps what is worn and is worn with a tap; its items off the body hang on a rack, not in the bag (421 A)', async () => {
    const before = await armory();
    assert.deepEqual(
      [before.count, before.nameLength, before.sets.map((set) => set.name)],
      [2, 24, [null, null]],
    );
    assert.equal((await save(2, 'Trzeci')).data.error.code, 'invalid_set');
    assert.equal((await wear(0)).data.error.code, 'empty_set');
    const worn = ids(Object.values((await view()).equipment).filter(Boolean));
    assert.deepEqual(worn, [armour]);
    assert.equal((await save(0, '  Do   boju  ')).status, 201);
    const saved = (await armory()).sets[0];
    assert.deepEqual([saved.name, ids(saved.items), saved.worn], ['Do boju', worn, true]);
    // The spare armour on: the first goes onto the rack, out of the bag.
    const bagBefore = (await view()).bagUsed;
    assert.equal((await equip(spare)).status, 200);
    let character = await view();
    assert.equal(character.bagUsed, bagBefore - 1);
    assert.ok(!character.bag.some((one) => one.id === armour));
    assert.equal((await armory()).sets[0].worn, false);
    // A second set with the spare armour, named by the game when the player gives no name.
    assert.equal((await save(1, '   ')).status, 201);
    assert.equal((await armory()).sets[1].name, 'Zestaw 2');
    // Wearing the first: the spare armour goes onto the second set's rack.
    assert.equal((await wear(0)).status, 200);
    character = await view();
    assert.equal(character.equipment.chest.id, armour);
    assert.equal(character.bagUsed, bagBefore - 1);
    assert.deepEqual(
      (await armory()).sets.map((set) => set.worn),
      [true, false],
    );
    // Emptying the second: the spare armour comes down into the bag.
    assert.equal((await clear(1)).status, 200);
    character = await view();
    assert.ok(character.bag.some((one) => one.id === spare));
    assert.equal(character.bagUsed, bagBefore);
    assert.equal((await clear(1)).data.error.code, 'empty_set');
  });

  test('a change waits while the bag cannot take what comes off; an item of a set comes off onto its rack even then', async () => {
    assert.equal((await save(0, 'Pierwszy')).status, 201);
    assert.equal((await equip(spare)).status, 200);
    // The bag full of herbs.
    const character = await view();
    const stack = content.professionRules.stack;
    const filler = content.herbs[0].id;
    await (await db())
      .prepare('UPDATE characters SET herbs = ?')
      .bind(JSON.stringify({ [filler]: stack * (character.bagCapacity - character.bagUsed) }))
      .run();
    assert.equal((await view()).bagUsed, character.bagCapacity);
    // The spare armour is in no set: wearing the first one would put it into the full bag.
    assert.equal((await wear(0)).data.error.code, 'bag_full');
    // Emptying the set would bring its armour down from the rack.
    assert.equal((await clear(0)).data.error.code, 'bag_full');
    // Saved with the spare armour in place of the first: the first comes down too.
    assert.equal((await save(0, 'Pierwszy')).data.error.code, 'bag_full');
    // A second set moves nothing; then the spare armour, kept by it, comes off onto its rack.
    assert.equal((await save(1, 'Drugi')).status, 201);
    assert.equal((await call('POST', `/api/items/${spare}/unequip`, { cookie })).status, 200);
    assert.equal((await wear(0)).status, 200);
    assert.equal((await view()).equipment.chest.id, armour);
  });

  test('an exploration keeps its equipment, and the scrapper never takes from the racks', async () => {
    assert.equal((await save(0, 'Pierwszy')).status, 201);
    assert.equal((await equip(spare)).status, 200);
    // Selling the bag by the handful leaves the rack alone.
    assert.equal((await call('POST', '/api/items/sell', { cookie, body: { maxRarity: content.rarities.at(-1).id } })).status, 200);
    assert.ok(await (await db()).prepare('SELECT id FROM items WHERE id = ?').bind(armour).first());
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 60 } })).status, 201);
    assert.equal((await wear(0)).data.error.code, 'busy');
  });

  test('with the bag over-full, sets change as long as nothing goes into it', async () => {
    assert.equal((await save(0, 'Pierwszy')).status, 201);
    assert.equal((await equip(spare)).status, 200);
    assert.equal((await save(1, 'Drugi')).status, 201);
    // Fuller than it holds: potions come back from an exploration without asking.
    const character = await view();
    const stack = content.professionRules.stack;
    await (await db())
      .prepare('UPDATE characters SET herbs = ?')
      .bind(JSON.stringify({ [content.herbs[0].id]: stack * (character.bagCapacity - character.bagUsed + 2) }))
      .run();
    assert.ok((await view()).bagUsed > character.bagCapacity);
    assert.equal((await wear(0)).status, 200);
    assert.equal((await wear(1)).status, 200);
    assert.equal((await save(0, 'Pierwszy')).data.error.code, 'bag_full');
  });

  test('an item on a rack is not sold, thrown away, taken apart or put in the chest', async () => {
    assert.equal((await save(0, 'Pierwszy')).status, 201);
    assert.equal((await equip(spare)).status, 200);
    for (const [path, body] of [
      [`/api/items/${armour}/sell`, {}],
      [`/api/items/${armour}/discard`, {}],
      [`/api/items/${armour}/salvage`, {}],
      ['/api/items/salvage', { ids: [armour] }],
      ['/api/chest/put', { itemId: armour }],
    ]) {
      assert.equal((await call('POST', path, { cookie, body })).data.error?.code, 'on_rack', path);
    }
    assert.ok(await (await db()).prepare('SELECT id FROM items WHERE id = ?').bind(armour).first());
  });

  test('without the Zbrojownia there are no sets', async () => {
    await (await db()).prepare("DELETE FROM buildings WHERE building_id = 'armory'").run();
    assert.equal((await save(0, 'Pierwszy')).data.error.code, 'no_armory');
  });
});

describe('the Warownia where it is off', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on' });
  test("a set's items not worn are in the bag again, not on a rack nobody can reach", async () => {
    const { cookie } = await signUp('bezwarowni');
    await call('POST', '/api/character', { cookie, body: { name: 'Bezwarowni', classId: 'warrior', appearance: 'male' } });
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    const chain = JSON.stringify({ base: 'chainmail', slot: 'chest', level: 5, rarity: 'common', affixes: [], armor: 15 });
    const { meta } = await database.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)').bind(id, chain).run();
    await database.prepare('UPDATE characters SET fortress = ?').bind(JSON.stringify({ sets: [{ name: 'Stary', items: [meta.last_row_id] }] })).run();
    assert.ok((await call('GET', '/api/character', { cookie })).data.character.bag.some((one) => one.id === meta.last_row_id));
  });
  test('no transformation and no Warownia buildings, even with all at the top', async () => {
    const { cookie } = await signUp('grododzierzca');
    await call('POST', '/api/character', { cookie, body: { name: 'Grododzierzca', classId: 'warrior', appearance: 'male' } });
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    await database.prepare('UPDATE characters SET gold = 200000, resources = ? WHERE id = ?').bind(JSON.stringify({ wood: 20000, stone: 20000, 'iron-ore': 20000 }), id).run();
    for (const one of [...campBuildings, content.camp]) {
      await database.prepare('INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) VALUES (?, ?, ?, 0, 1)').bind(id, one.id, one.maxLevel).run();
    }
    const view = (await call('GET', '/api/character', { cookie })).data.character;
    assert.equal(view.camp.cornerstone.fortress, null);
    assert.ok(view.camp.cornerstone.ready);
    assert.equal((await call('POST', '/api/camp/build', { cookie, body: { buildingId: 'fortress' } })).status, 400);
    assert.equal((await call('POST', '/api/camp/build', { cookie, body: { buildingId: 'shrine' } })).status, 400);
  });
});

// The resource buildings go on to level 20 once the camp is a Warownia (the
// author's 618: „618.1 A, 618.2 A, 618.3 B albo nawet trochę lżej niż B”):
// the same more a level, gold growing 12% a level from the 10th level's,
// the 10th level's resources, the time 10% longer a level, and a fourth
// look at level 20.
describe('the resource buildings past level 10 in the Warownia (618)', () => {
  const RESOURCE = ['sawmill', 'quarry', 'mine', 'midas-lake'];

  test('levels 11 to 20: the 10th level\'s resources, gold and time growing a level; the same production more a level', () => {
    for (const id of RESOURCE) {
      const building = content.buildingsById[id];
      assert.deepEqual([building.maxLevel, building.beyond.maxLevel], [10, 20], id);
      const top = upgradeCost(building, 10);
      for (const level of [11, 15, 20]) {
        const cost = upgradeCost(building, level);
        assert.equal(cost.gold, Math.round(top.gold * 1.12 ** (level - 10)), `${id} ${level}`);
        for (const resource of ['wood', 'stone', 'iron-ore']) assert.equal(cost[resource], top[resource], `${id} ${level} ${resource}`);
        assert.equal(upgradeMinutes(building, level), Math.round(upgradeMinutes(building, 10) * 1.1 ** (level - 10)), `${id} ${level} minutes`);
      }
      // Twice as much at 20 as at 10.
      assert.equal(building.effect.perLevel * 20, 2 * building.effect.perLevel * 10);
    }
    // Every other building keeps its own top.
    assert.ok(content.buildings.filter((one) => one.beyond).every((one) => RESOURCE.includes(one.id)));
  });

  test('the top is 20 only once the Warownia stands', () => {
    const sawmill = content.buildingsById.sawmill;
    const camp = Object.fromEntries([...campBuildings, content.camp].map((one) => [one.id, { level: one.maxLevel, startedAt: 0, endsAt: 1 }]));
    assert.equal(buildingTop(sawmill, camp, 10, content), 10);
    const fortress = { ...camp, fortress: { level: 1, startedAt: 0, endsAt: 5 } };
    assert.equal(buildingTop(sawmill, fortress, 2, content), 10, 'while the transformation lasts');
    assert.equal(buildingTop(sawmill, fortress, 10, content), 20);
    assert.equal(buildingTop(content.buildingsById.anvil, fortress, 10, content), content.buildingsById.anvil.maxLevel);
  });

  test('the Duch budowniczego counts the resources of levels 11 to 20 as needed once the Warownia stands', () => {
    const sawmill = content.buildingsById.sawmill;
    const stored = { [content.camp.id]: { level: content.camp.maxLevel, startedAt: 0, endsAt: 1 }, sawmill: { level: 10, startedAt: 0, endsAt: 1 } };
    const none = { wood: 0, stone: 0, 'iron-ore': 0 };
    assert.deepEqual(campNeeds([sawmill], stored, [], content), none);
    const { gold, ...tenth } = upgradeCost(sawmill, 10);
    assert.ok(gold > 0);
    const beyond = (building) => building.beyond?.maxLevel ?? building.maxLevel;
    assert.deepEqual(campNeeds([sawmill], stored, [], content, beyond), Object.fromEntries(Object.keys(none).map((id) => [id, 10 * (tenth[id] ?? 0)])));
    // Built to 20, nothing more.
    assert.deepEqual(campNeeds([sawmill], { ...stored, sawmill: { level: 20, startedAt: 0, endsAt: 1 } }, [], content, beyond), none);
  });
});

describe('the resource buildings past level 10 in the game (618)', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on', FORTRESS: 'on' });
  let cookie;
  let id;
  beforeEach(async () => {
    ({ cookie } = await signUp('drwal'));
    await call('POST', '/api/character', { cookie, body: { name: 'Drwal', classId: 'warrior', appearance: 'male' } });
    const database = await db();
    ({ id } = await database.prepare('SELECT id FROM characters').first());
    await database
      .prepare('UPDATE characters SET level = 90, class_level = 90, gold = 500000, resources = ? WHERE id = ?')
      .bind(JSON.stringify({ wood: 50000, stone: 50000, 'iron-ore': 50000 }), id)
      .run();
    for (const one of [...campBuildings, content.camp]) {
      await database.prepare('INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) VALUES (?, ?, ?, 0, 1)').bind(id, one.id, one.maxLevel).run();
    }
  });
  const sawmill = async () => (await call('GET', '/api/character', { cookie })).data.character.camp.buildings.find((one) => one.id === 'sawmill');
  const build = () => call('POST', '/api/camp/build', { cookie, body: { buildingId: 'sawmill' } });

  test('at the camp\'s top the Tartak says it goes on in the Warownia; once the Warownia stands it builds level 11 for its cost', async () => {
    const before = await sawmill();
    assert.deepEqual([before.level, before.maxLevel, before.next], [10, 10, null]);
    assert.equal(before.beyond, content.buildingsById.sawmill.beyond.hint);
    assert.equal((await build()).data.error.code, 'max_level');
    await (await db()).prepare("INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) VALUES (?, 'fortress', 1, 0, 1)").bind(id).run();
    const after = await sawmill();
    assert.deepEqual([after.maxLevel, after.next.level, after.beyond], [20, 11, null]);
    assert.deepEqual(after.next.cost, upgradeCost(content.buildingsById.sawmill, 11));
    const gold = (await (await db()).prepare('SELECT gold FROM characters WHERE id = ?').bind(id).first()).gold;
    const built = await build();
    assert.equal(built.status, 201, JSON.stringify(built.data).slice(0, 300));
    const row = await (await db()).prepare("SELECT level FROM buildings WHERE character_id = ? AND building_id = 'sawmill'").bind(id).first();
    assert.equal(row.level, 11);
    assert.equal((await (await db()).prepare('SELECT gold FROM characters WHERE id = ?').bind(id).first()).gold, gold - upgradeCost(content.buildingsById.sawmill, 11).gold);
    // At 20 it stands at its top.
    await (await db()).prepare("UPDATE buildings SET level = 20, ends_at = 1 WHERE character_id = ? AND building_id = 'sawmill'").bind(id).run();
    const top = await sawmill();
    assert.deepEqual([top.level, top.next], [20, null]);
    assert.equal((await build()).data.error.code, 'max_level');
  });
});

// Another request's change landing between a request's read and its write,
// for the handlers called here directly: a D1 binding that runs `between`
// once, right before the first batch after a statement whose SQL `matches`
// was prepared (the request's own write).
function racing(database, matches, between) {
  let armed = false;
  let done = false;
  return {
    prepare(sql) {
      if (!done && matches(sql)) armed = true;
      return database.prepare(sql);
    },
    async batch(statements) {
      if (armed && !done) {
        done = true;
        await between();
      }
      return database.batch(statements);
    },
  };
}

describe('the Warownia with another request at the same moment', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on', FORTRESS: 'on' });
  let cookie;
  let id;
  let armour;
  let spare;
  const chain = (level, upgrade = 0) => JSON.stringify({ base: 'chainmail', slot: 'chest', level, rarity: 'common', affixes: [], armor: 15, upgrade });
  beforeEach(async () => {
    ({ cookie } = await signUp('zbrojmistrz'));
    await call('POST', '/api/character', { cookie, body: { name: 'Zbrojmistrz', classId: 'warrior', appearance: 'male' } });
    const database = await db();
    ({ id } = await database.prepare('SELECT id FROM characters').first());
    await database.prepare('UPDATE characters SET level = 25, xp = 0 WHERE id = ?').bind(id).run();
    for (const [buildingId, level] of [...[...campBuildings, content.camp].map((one) => [one.id, one.maxLevel]), ['fortress', 1], ['armory', 1]]) {
      await database.prepare('INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) VALUES (?, ?, ?, 0, 1)').bind(id, buildingId, level).run();
    }
    // Armour at +7 worn, and a second one in the bag.
    const insert = (slot, level, upgrade) => database.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, ?, ?, 0)').bind(id, slot, chain(level, upgrade)).run();
    armour = (await insert('chest', 5, 7)).meta.last_row_id;
    spare = (await insert(null, 6, 0)).meta.last_row_id;
    // The handlers called here directly run with the Warownia on.
    readFeatures({ SETTLEMENT: 'on', FORTRESS: 'on' });
  });
  const view = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const save = (index, name) => call('POST', '/api/fortress/sets', { cookie, body: { index, name } });
  const request = (path, body) => new Request(`http://localhost${path}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const fortressOf = async () => JSON.parse((await (await db()).prepare('SELECT fortress FROM characters').first()).fortress);

  // The roll's 16 random bytes, made the ones given for a while.
  async function withRoll(bytes, run) {
    Object.defineProperty(globalThis.crypto, 'getRandomValues', {
      value: (array) => {
        array.set(bytes.subarray(0, array.length));
        return array;
      },
      configurable: true,
      writable: true,
    });
    try {
      return await run();
    } finally {
      delete globalThis.crypto.getRandomValues;
    }
  }
  // Bytes whose roll breaks an item of +7.
  function breakingBytes() {
    for (let seed = 0; ; seed++) {
      const bytes = new Uint8Array(16).map((_, index) => (seed * 31 + index * 17 + (seed >> 3)) % 256);
      if (rollUpgrade({ upgrade: 7 }, createRng(toHex(bytes)), content).result === 'broken') return bytes;
    }
  }

  test('an item of a set that breaks on the Kowadło undoes nothing the Warownia saved meanwhile: the try waits', async () => {
    const database = await db();
    await database
      .prepare('UPDATE characters SET gold = 1000000, resources = json_set(resources, ?, 10000), materials = ? WHERE id = ?')
      .bind('$."iron-ore"', JSON.stringify({ 'wolf-pelt:common': 1000 }), id)
      .run();
    assert.equal((await save(0, 'Pierwszy')).status, 201);
    // A training done, waiting to be claimed.
    const day = questPeriod('daily', Date.now(), content).key;
    const training = { day, startedAt: Date.now() - 7200000, endsAt: Date.now() - 1, hours: 1, xp: 50, claimed: false };
    await database.prepare('UPDATE characters SET fortress = ?').bind(JSON.stringify({ ...(await fortressOf()), training })).run();
    const bytes = breakingBytes();
    // "Odbierz trening" lands between the try's read and its write.
    const claimed = async () =>
      database.prepare("UPDATE characters SET fortress = json_set(fortress, '$.training.claimed', json('true')), class_xp = class_xp + 50, version = version + 1 WHERE id = ?").bind(id).run();
    const DB = racing(database, (sql) => sql.includes("SET data = json_set(data, '$.upgrade'"), claimed);
    await withRoll(bytes, () =>
      assert.rejects(upgradeItem({ request: request(`/api/items/${armour}/upgrade`, {}), env: { DB }, now: Date.now(), params: { id: String(armour) } }), (error) => error.status === 409 && error.code === 'item_changed'),
    );
    // The training stays claimed, and the item and the payment as they were.
    assert.equal((await fortressOf()).training.claimed, true);
    const item = await database.prepare('SELECT data FROM items WHERE id = ?').bind(armour).first();
    assert.equal(JSON.parse(item.data).upgrade, 7);
    assert.equal((await database.prepare('SELECT gold FROM characters').first()).gold, 1000000);
    // Tried again on its own, the item breaks and its set forgets it.
    const broken = await withRoll(bytes, () => upgradeItem({ request: request(`/api/items/${armour}/upgrade`, {}), env: { DB: database }, now: Date.now(), params: { id: String(armour) } }));
    assert.equal(broken.status, 200);
    assert.equal((await broken.json()).upgrade.result, 'broken');
    assert.deepEqual((await fortressOf()).sets[0].items, []);
    assert.equal((await fortressOf()).training.claimed, true);
  });

  test('"Załóż zestaw" waits when the sets changed meanwhile: the bag never takes more than it holds', async () => {
    assert.equal((await save(0, 'Pierwszy')).status, 201);
    assert.equal((await call('POST', `/api/items/${spare}/equip`, { cookie })).status, 200);
    assert.equal((await save(1, 'Drugi')).status, 201);
    // The bag exactly full.
    const character = await view();
    const stack = content.professionRules.stack;
    const database = await db();
    await database.prepare('UPDATE characters SET herbs = ?').bind(JSON.stringify({ [content.herbs[0].id]: stack * (character.bagCapacity - character.bagUsed) })).run();
    // "Usuń zestaw" of the second set lands between the change's read and its
    // write: the spare armour it kept would come off into the full bag.
    const cleared = async () => {
      const state = await fortressOf();
      await database.prepare('UPDATE characters SET fortress = ?, version = version + 1 WHERE id = ?').bind(JSON.stringify({ ...state, sets: [state.sets[0], null] }), id).run();
    };
    const DB = racing(database, (sql) => sql.startsWith('UPDATE items SET slot = NULL WHERE character_id = ? AND slot IS NOT NULL'), cleared);
    await assert.rejects(wearGearSet({ request: request('/api/fortress/sets/wear', { index: 0 }), env: { DB }, now: Date.now(), params: {} }), (error) => error.status === 409 && error.code === 'character_changed');
    const after = await view();
    assert.equal(after.equipment.chest.id, spare);
    assert.equal(after.bagUsed, after.bagCapacity);
    // Read again, the change sees the spare armour would go to the full bag.
    const again = await call('POST', '/api/fortress/sets/wear', { cookie, body: { index: 0 } });
    assert.equal(again.data.error.code, 'bag_full');
  });
});

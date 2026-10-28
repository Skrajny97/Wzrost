// Events at the end of an exploration (data/events.json, src/engine/events.js):
// after "Odbierz raport" the player first chooses what to do, and the report
// tells what came of it. On the test version only for now (EVENTS "on").

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { createRng, encounterCombatants, eventChance, eventFor, huntKills, playerCombatant, resolveEvent, simulateFight, simulateHunt } from '../src/engine/index.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const bandits = ['bandit-thug', 'bandit-knifer', 'bandit-crossbow'];
const woman = content.eventsById['wounded-woman'];

// Whether every enemy moved before the first move of `allyId`.
const enemiesFirst = (fight, allyId, enemyIds) => {
  const first = fight.events.findIndex((event) => event.actor === allyId);
  const before = new Set(fight.events.slice(0, first).map((event) => event.actor));
  return enemyIds.every((id) => before.has(id));
};

describe('events', () => {
  const { character, equipped } = typicalCharacter('warrior', 8, content);
  const seed = 'zdarzenie';
  const base = simulateHunt({ character, equipped, hp: 9999, name: 'Mira', areaId: 'windfalls-edge', minutes: 60, seed }, content);
  const resolve = (optionId, hunt = base) => resolveEvent({ hunt, event: woman, optionId, character, equipped, name: 'Mira', seed }, content);

  test('the longer the exploration, the likelier an event, up to the most', () => {
    const { chancePerMinute, maxChance } = content.events;
    assert.equal(eventChance(10, content), chancePerMinute * 10);
    assert.equal(eventChance(100000, content), maxChance);
  });

  test('none after the first exploration, a Szybkie Polowanie or one that did not end as planned', () => {
    const hunt = { result: 'success', minutes: 60 };
    const forced = 'wounded-woman';
    assert.equal(eventFor({ hunt, seed, first: true, forced }, content), null);
    assert.equal(eventFor({ hunt, seed, quick: true, forced }, content), null);
    assert.equal(eventFor({ hunt: { ...hunt, result: 'fainted' }, seed, forced }, content), null);
    assert.equal(eventFor({ hunt, seed, forced }, content), woman);
  });

  test('the seed decides whether one comes, about as often as its chance says', () => {
    const hunt = { result: 'success', minutes: 30 };
    const seeds = Array.from({ length: 2000 }, (_, index) => `ziarno-${index}`);
    const drawn = seeds.filter((one) => eventFor({ hunt, seed: one }, content));
    assert.ok(Math.abs(drawn.length / seeds.length - eventChance(30, content)) < 0.03);
    for (const one of seeds.slice(0, 50)) assert.equal(eventFor({ hunt, seed: one }, content), eventFor({ hunt, seed: one }, content));
  });

  test('in an ambush every enemy moves before the allies, however quick', () => {
    const player = playerCombatant({ character: newCharacter('archer', { level: 5 }), equipped: [], name: 'Szybka' }, content);
    const quick = { ...player, speed: player.speed * 3, maxHp: 9000, hp: 9000 };
    const enemies = encounterCombatants({ members: bandits.map((monsterId) => ({ monsterId, level: 5 })) }, content);
    for (const one of ['a', 'b', 'c']) {
      const fight = simulateFight({ allies: [quick], enemies, rng: createRng(one), content, record: true, ambush: true });
      assert.ok(enemiesFirst(fight, quick.id, enemies.map((enemy) => enemy.id)));
    }
  });

  test('"Odejdź nieufnie" only adds the event to the report', () => {
    const left = resolve('leave');
    assert.equal(left.result, 'success');
    assert.deepEqual([left.fights.length, left.xp, left.gold, left.hpEnd], [base.fights.length, base.xp, base.gold, base.hpEnd]);
    assert.deepEqual(left.event.option, { id: 'leave', label: 'Odejdź nieufnie', text: woman.options[2].text });
    assert.equal(left.event.fight, null);
    assert.equal(left.entries.at(-1).type, 'event');
  });

  test('"Pomóż jej sprawnie": the bandits ambush the character at its level and pay like people', () => {
    const helped = resolve('help');
    const fight = helped.fights.at(-1);
    assert.equal(helped.fights.length, base.fights.length + 1);
    assert.equal(fight.event, true);
    assert.deepEqual(
      fight.enemies.map((enemy) => [enemy.monsterId, enemy.level]),
      bandits.map((id) => [id, character.level]),
    );
    assert.equal(fight.hpBefore, base.hpEnd);
    assert.ok(enemiesFirst(fight, fight.allies[0].id, fight.enemiesView.map((enemy) => enemy.id)));
    assert.equal(fight.won, true);
    assert.equal(helped.result, 'success');
    assert.ok(fight.xp > 0 && fight.gold > 0);
    assert.deepEqual([helped.xp, helped.gold], [base.xp + fight.xp, base.gold + fight.gold]);
    // Their items join the exploration's finds.
    assert.deepEqual(
      fight.chests.map((index) => helped.items[index]),
      helped.items.slice(base.items.length),
    );
    assert.deepEqual(helped.keyFight, { index: fight.index });
    assert.equal(helped.event.fight, fight.index);
    assert.deepEqual(helped.entries.slice(-2).map((entry) => entry.type), ['event', 'fight']);
    // The same exploration and option always end the same way.
    assert.deepEqual(resolve('help'), helped);
  });

  test('"Zadaj dodatkowe pytania": no ambush, and the character is quicker', () => {
    const asked = resolve('ask');
    const fight = asked.fights.at(-1);
    const helped = resolve('help').fights.at(-1);
    assert.equal(fight.event, true);
    assert.ok(fight.allies[0].speed > helped.allies[0].speed);
    assert.equal(enemiesFirst(fight, fight.allies[0].id, fight.enemiesView.map((enemy) => enemy.id)), false);
  });

  test('lost, the character faints, or in a safe region only gets away', () => {
    const faintHp = Math.round(base.maxHp * content.balance.hunt.hpAfterFaint);
    const safe = resolve('help', { ...base, hpEnd: 1 });
    assert.deepEqual([safe.fights.at(-1).won, safe.result, safe.hpEnd], [false, 'escaped', faintHp]);
    const wild = resolve('help', { ...base, hpEnd: 1, areaId: 'mossy-boulders' });
    assert.deepEqual([wild.result, wild.hpEnd], ['fainted', faintHp]);
  });

  test('the bandits count for no quest', () => {
    assert.deepEqual(huntKills(resolve('help')), huntKills(base));
  });
});

describe('events (API)', () => {
  const { call, db, signUp } = useServer({ EVENTS: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('wedrowiec'));
    await call('POST', '/api/character', { cookie, body: { name: 'Wedrowiec', classId: 'warrior', appearance: 'male' } });
  });

  const explore = async () => {
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } })).status, 201);
    await call('POST', '/api/test/skip-time', { cookie });
  };
  const claim = (choice) => call('POST', '/api/hunts/claim', { cookie, ...(choice !== undefined && { body: { choice } }) });
  const choose = (eventId) => call('POST', '/api/test/events', { cookie, body: { eventId } });
  const next = async () => (await call('GET', '/api/test/events', { cookie })).data.next;
  // After the first exploration (the tutorial's), a character strong enough
  // for the edge of the Wiatrołomy to end every exploration as planned.
  const pastTutorial = async () => {
    await explore();
    assert.equal((await claim()).data.event, undefined);
    await (await db()).prepare(`UPDATE characters SET level = 30, points = '{"strength":150,"vitality":140}', hp_at = 0`).run();
  };
  const reports = async () => (await (await db()).prepare('SELECT COUNT(*) AS count FROM reports').first()).count;

  test('"Testuj zdarzenia" brings the event chosen, not after the tutorial, and the report waits for the choice', async () => {
    const tests = (await call('GET', '/api/test/events', { cookie })).data;
    assert.deepEqual(tests, { events: [{ id: 'wounded-woman', title: 'Ranna kobieta' }], next: null });
    assert.equal((await choose('nie-ma')).data.error.code, 'unknown_event');
    assert.deepEqual((await choose('wounded-woman')).data, { next: 'wounded-woman' });

    // The first exploration is the tutorial's: no event, and the choice waits.
    await pastTutorial();
    assert.equal(await next(), 'wounded-woman');

    await explore();
    const count = await reports();
    const first = await claim();
    assert.equal(first.status, 200);
    assert.equal(first.data.report, undefined);
    assert.deepEqual(first.data.event, {
      id: 'wounded-woman',
      title: 'Ranna kobieta',
      art: 'wounded-woman',
      scene: 'forest-ambush',
      figure: woman.figure,
      text: woman.text,
      options: [
        { id: 'help', label: 'Pomóż jej sprawnie' },
        { id: 'ask', label: 'Zadaj dodatkowe pytania' },
        { id: 'leave', label: 'Odejdź nieufnie' },
      ],
    });
    // Nothing is saved until the choice, and asking again shows the same.
    assert.equal(await reports(), count);
    assert.deepEqual((await claim()).data, first.data);
    assert.equal((await claim('uciekaj')).data.error.code, 'invalid_choice');

    const left = await claim('leave');
    assert.equal(left.status, 200);
    assert.equal(left.data.report.event.option.id, 'leave');
    assert.equal(left.data.report.event.fight, null);
    assert.equal(left.data.character.activity, null);
    assert.equal(await reports(), count + 1);
    // Played, the event is not chosen any more.
    assert.equal(await next(), null);
  });

  test('"Pomóż jej sprawnie" adds the bandits\' fight to the report, and they stay out of the Bestiariusz', async () => {
    await pastTutorial();
    await choose('wounded-woman');
    await explore();
    assert.equal((await claim()).data.event.id, 'wounded-woman');
    const { report } = (await claim('help')).data;
    const fight = report.fights.at(-1);
    assert.equal(fight.event, true);
    assert.deepEqual(
      fight.enemies.map((enemy) => enemy.monsterId),
      bandits,
    );
    assert.equal(report.event.fight, report.fights.length - 1);
    assert.equal(report.keyFight.index, report.fights.length - 1);
    const met = JSON.parse((await (await db()).prepare('SELECT met FROM characters').first()).met);
    assert.ok(bandits.every((id) => !met.includes(id)));
  });
});

describe('events switched off', () => {
  const { call, db, signUp } = useServer();

  test('no event comes, and "Testuj zdarzenia" does not exist', async () => {
    const { cookie } = await signUp('wedrowiec');
    await call('POST', '/api/character', { cookie, body: { name: 'Wedrowiec', classId: 'warrior', appearance: 'male' } });
    assert.equal((await call('GET', '/api/test/events', { cookie })).status, 404);
    assert.equal((await call('POST', '/api/test/events', { cookie, body: { eventId: 'wounded-woman' } })).status, 404);
    for (let index = 0; index < 2; index++) {
      await (await db()).prepare(`UPDATE characters SET event_test = 'wounded-woman', level = 30, points = '{"strength":150,"vitality":140}', hp_at = 0`).run();
      await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
      await call('POST', '/api/test/skip-time', { cookie });
      const claimed = await call('POST', '/api/hunts/claim', { cookie });
      assert.equal(claimed.status, 200);
      assert.equal(claimed.data.report.event, null);
    }
  });
});

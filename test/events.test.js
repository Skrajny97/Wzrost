// Events at the end of an exploration (data/events.json, src/engine/events.js):
// after "Odbierz raport" the player first chooses what to do, and the report
// tells what came of it. In the live game (EVENTS "on"), and on the test
// version with the outcomes the author has not approved yet (EVENTS "test").

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { createRng, encounterCombatants, eventCase, eventChance, eventFor, huntKills, playerCombatant, resolveEvent, simulateFight, simulateHunt } from '../src/engine/index.js';
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
  // In the case given; the ambush, unless said otherwise.
  const resolve = (optionId, hunt = base, caseId = 'ambush') => resolveEvent({ hunt, event: woman, optionId, caseId, character, equipped, name: 'Mira', seed }, content);

  test('none after the first exploration, a Szybkie Polowanie or one that did not end as planned', () => {
    const hunt = { result: 'success', minutes: 60 };
    const forced = 'wounded-woman';
    assert.equal(eventFor({ hunt, seed, first: true, forced }, content), null);
    assert.equal(eventFor({ hunt, seed, quick: true, forced }, content), null);
    assert.equal(eventFor({ hunt: { ...hunt, result: 'fainted' }, seed, forced }, content), null);
    assert.equal(eventFor({ hunt, seed, forced }, content), woman);
  });

  test('the seed decides whether one comes, in a tenth of explorations however long', () => {
    assert.equal(eventChance(content), 0.1);
    const seeds = Array.from({ length: 2000 }, (_, index) => `ziarno-${index}`);
    for (const minutes of [5, 240]) {
      const hunt = { result: 'success', minutes };
      const drawn = seeds.filter((one) => eventFor({ hunt, seed: one }, content));
      assert.ok(Math.abs(drawn.length / seeds.length - eventChance(content)) < 0.025, `${minutes}: ${drawn.length}`);
    }
    const hunt = { result: 'success', minutes: 30 };
    for (const one of seeds.slice(0, 50)) assert.equal(eventFor({ hunt, seed: one }, content), eventFor({ hunt, seed: one }, content));
  });

  test('every event is as likely as the others', () => {
    const two = { ...content, events: { ...content.events, chance: 1, list: [woman, { ...woman, id: 'drugie' }] } };
    const hunt = { result: 'success', minutes: 30 };
    const seeds = Array.from({ length: 2000 }, (_, index) => `rowne-${index}`);
    const share = seeds.filter((one) => eventFor({ hunt, seed: one }, two).id === 'drugie').length / seeds.length;
    assert.ok(Math.abs(share - 0.5) < 0.04, String(share));
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
    assert.deepEqual(left.event.option, { id: 'leave', label: 'Odejdź nieufnie', text: woman.options[2].outcome.text });
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
    assert.deepEqual(huntKills(resolve('help'), content), huntKills(base, content));
  });

  test('what is really going on is drawn once, about as often as its weight says', () => {
    const seeds = Array.from({ length: 3000 }, (_, index) => `przypadek-${index}`);
    const total = woman.cases.reduce((sum, one) => sum + one.weight, 0);
    for (const one of woman.cases) {
      const share = seeds.filter((each) => eventCase(woman, each) === one).length / seeds.length;
      assert.ok(Math.abs(share - one.weight / total) < 0.03, `${one.id}: ${share}`);
    }
    assert.equal(eventCase(woman, seed, 'grateful-find').id, 'grateful-find');
    // Drawn, the case is the same for every option.
    const drawn = eventCase(woman, seed).id;
    for (const optionId of ['help', 'ask', 'leave']) {
      assert.equal(resolveEvent({ hunt: base, event: woman, optionId, character, equipped, name: 'Mira', seed }, content).event.case, drawn);
    }
  });

  test('a truly wounded woman thanks with gold or with something she found, and has no bandits', () => {
    const paid = resolve('help', base, 'grateful-gold');
    assert.equal(paid.fights.length, base.fights.length);
    assert.ok(paid.event.reward.gold > 0);
    assert.equal(paid.gold, base.gold + paid.event.reward.gold);
    assert.match(paid.event.option.text, new RegExp(`\\+${paid.event.reward.gold}\\)`));
    assert.equal(paid.entries.at(-1).type, 'event');

    const found = resolve('help', base, 'grateful-find');
    assert.equal(found.fights.length, base.fights.length);
    assert.equal(found.items.length, base.items.length + 1);
    const item = found.items[found.event.reward.item];
    assert.ok(Object.keys(woman.cases.find((one) => one.id === 'grateful-find').outcomes.help.itemRarities).includes(item.rarity));
    assert.equal(item.level, character.level);
    assert.equal(found.gold, base.gold);
  });

  test('asked too many questions, a truly wounded woman dies offended or turns into a Błędnica; leaving is the same in every case', () => {
    const [dies, turns] = woman.options[1].outcome;
    for (const caseId of ['grateful-gold', 'grateful-find']) {
      const endings = Array.from({ length: 200 }, (_, index) =>
        resolveEvent({ hunt: base, event: woman, optionId: 'ask', caseId, drafts: true, character, equipped, name: 'Mira', seed: `pytania-${index}` }, content),
      );
      const fought = endings.filter((asked) => asked.fights.length > base.fights.length);
      assert.ok(Math.abs(fought.length / endings.length - 0.5) < 0.1, `${caseId}: ${fought.length}`);
      for (const asked of endings.filter((one) => !fought.includes(one))) {
        assert.deepEqual([asked.gold, asked.xp, asked.items.length, asked.result], [base.gold, base.xp, base.items.length, base.result]);
        assert.equal(asked.event.option.text, dies.text);
      }
      for (const asked of fought) {
        const fight = asked.fights.at(-1);
        assert.equal(fight.event, true);
        assert.deepEqual(fight.enemies.map((enemy) => [enemy.monsterId, enemy.level]), [['wisp', character.level]]);
        assert.deepEqual(fight.chests, []);
        assert.equal(asked.event.option.text, turns.text);
        assert.equal(asked.event.fight, asked.fights.length - 1);
      }
      // Beaten, the Błędnica counts for the quests as one met on the way.
      const won = fought.find((asked) => asked.fights.at(-1).won === true);
      assert.equal(huntKills(won, content).wisp, (huntKills(base, content).wisp ?? 0) + 1);
    }
    for (const one of woman.cases) assert.equal(resolve('leave', base, one.id).event.option.text, woman.options[2].outcome.text);
  });

  test('the Błędnica, a draft, comes only where drafts are on; "Testuj zdarzenia" chooses an ending', () => {
    const asked = (seedOf, extra) => resolveEvent({ hunt: base, event: woman, optionId: 'ask', caseId: 'grateful-gold', character, equipped, name: 'Mira', seed: seedOf, ...extra }, content);
    const seeds = Array.from({ length: 60 }, (_, index) => `szkic-${index}`);
    assert.ok(seeds.every((one) => asked(one).fights.length === base.fights.length));
    assert.ok(seeds.every((one) => asked(one, { endingId: 'wisp' }).event.option.text === woman.options[1].outcome[0].text));
    assert.ok(seeds.slice(0, 10).every((one) => asked(one, { endingId: 'wisp', drafts: true }).fights.at(-1).enemies[0].monsterId === 'wisp'));
    assert.ok(seeds.slice(0, 10).every((one) => asked(one, { endingId: 'dies', drafts: true }).fights.length === base.fights.length));
  });
});

describe('events (API)', () => {
  const { call, db, signUp } = useServer({ EVENTS: 'test' });
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
  const choose = (eventId, caseId, endingId) => call('POST', '/api/test/events', { cookie, body: { eventId, ...(caseId && { caseId }), ...(endingId && { endingId }) } });
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
    assert.deepEqual(tests, {
      events: [
        {
          id: 'wounded-woman',
          title: 'Ranna kobieta',
          cases: woman.cases.map(({ id, name }) => ({ id, name })),
          endings: [
            { id: 'dies', name: 'Pytania: umiera urażona' },
            { id: 'wisp', name: 'Pytania: zamienia się w Błędnicę' },
          ],
        },
      ],
      next: null,
    });
    assert.equal((await choose('nie-ma')).data.error.code, 'unknown_event');
    assert.equal((await choose('wounded-woman', 'smok')).data.error.code, 'unknown_case');
    assert.equal((await choose('wounded-woman', null, 'smok')).data.error.code, 'unknown_ending');
    // An ending comes in a case that leads to it.
    assert.deepEqual((await choose('wounded-woman', null, 'wisp')).data, { next: { eventId: 'wounded-woman', caseId: 'grateful-gold', endingId: 'wisp' } });
    assert.deepEqual(await next(), { eventId: 'wounded-woman', caseId: 'grateful-gold', endingId: 'wisp' });
    assert.deepEqual((await choose('wounded-woman')).data, { next: { eventId: 'wounded-woman', caseId: null, endingId: null } });

    // The first exploration is the tutorial's: no event, and the choice waits.
    await pastTutorial();
    assert.deepEqual(await next(), { eventId: 'wounded-woman', caseId: null, endingId: null });

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
    await choose('wounded-woman', 'ambush');
    assert.deepEqual(await next(), { eventId: 'wounded-woman', caseId: 'ambush', endingId: null });
    await explore();
    assert.equal((await claim()).data.event.id, 'wounded-woman');
    const { report } = (await claim('help')).data;
    assert.equal(report.event.case, 'ambush');
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

  test('turned into a Błędnica, the woman joins the Bestiariusz as a creature met on the way', async () => {
    await pastTutorial();
    await choose('wounded-woman', null, 'wisp');
    // Avoiding the elites, the exploration meets no Błędnica of its own.
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5, avoidRare: true } })).status, 201);
    await call('POST', '/api/test/skip-time', { cookie });
    await (await db()).prepare(`UPDATE characters SET met = '[]'`).run();
    assert.equal((await claim()).data.event.id, 'wounded-woman');
    const { report } = (await claim('ask')).data;
    const fight = report.fights.at(-1);
    assert.equal(fight.event, true);
    assert.deepEqual(
      fight.enemies.map((enemy) => enemy.monsterId),
      ['wisp'],
    );
    assert.ok(report.fights.slice(0, -1).every((one) => one.enemies.every((enemy) => enemy.monsterId !== 'wisp')));
    const met = JSON.parse((await (await db()).prepare('SELECT met FROM characters').first()).met);
    assert.ok(met.includes('wisp'));
  });

  test('chosen to be honest, the woman thanks with gold or an item that reach the character', async () => {
    await pastTutorial();
    await choose('wounded-woman', 'grateful-gold');
    await explore();
    const before = (await call('GET', '/api/character', { cookie })).data.character.gold;
    await claim();
    const paid = (await claim('help')).data;
    assert.equal(paid.report.event.case, 'grateful-gold');
    assert.ok(paid.report.fights.every((fight) => !fight.event));
    assert.ok(paid.report.event.reward.gold > 0);
    assert.ok(paid.character.gold >= before + paid.report.event.reward.gold);
    assert.equal(await next(), null);

    await choose('wounded-woman', 'grateful-find');
    await explore();
    await claim();
    const found = (await claim('help')).data.report;
    assert.equal(found.event.case, 'grateful-find');
    assert.ok(found.items[found.event.reward.item]);
  });
});

describe('events in the live game', () => {
  const { call, db, signUp } = useServer({ EVENTS: 'on' });

  test('the Błędnica, not approved yet, never comes: the questions end in her death', async () => {
    const { cookie } = await signUp('wedrowiec');
    await call('POST', '/api/character', { cookie, body: { name: 'Wedrowiec', classId: 'warrior', appearance: 'male' } });
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    await call('POST', '/api/test/skip-time', { cookie });
    await call('POST', '/api/hunts/claim', { cookie });
    await (await db()).prepare(`UPDATE characters SET level = 30, points = '{"strength":150,"vitality":140}', hp_at = 0, event_test = 'wounded-woman:grateful-gold:wisp'`).run();
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    await call('POST', '/api/test/skip-time', { cookie });
    assert.equal((await call('POST', '/api/hunts/claim', { cookie })).data.event.id, 'wounded-woman');
    const { report } = (await call('POST', '/api/hunts/claim', { cookie, body: { choice: 'ask' } })).data;
    assert.equal(report.event.option.text, woman.options[1].outcome[0].text);
    assert.equal(report.event.fight, null);
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

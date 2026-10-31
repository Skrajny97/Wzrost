// Events with a further choice (the author: "z więcej niż jedną decyzją, po
// której kliknięciu dalej trzeba coś decydować"): an option of kind
// "choice" tells what happened and offers new options, and only the last
// one ends the event. The three drafts that use it: the lost girl, the
// wedding in the forest and the treasure hunter.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { caseOutcomes, eventChoices, eventOutcomes, eventView, resolveEvent, simulateHunt } from '../src/engine/index.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const child = content.eventsById['lost-child'];
const wedding = content.eventsById['forest-wedding'];
const hunter = content.eventsById['treasure-hunter'];
const ids = (options) => options.map((option) => option.id);

describe('events with a further choice', () => {
  const { character, equipped } = typicalCharacter('warrior', 12, content);
  const seed = 'dalej';
  const base = simulateHunt({ character, equipped, hp: 9999, name: 'Mira', areaId: 'fox-ravines', minutes: 60, seed }, content);
  const resolve = (event, path, caseId) => resolveEvent({ hunt: base, event, optionId: path, caseId, character, equipped, name: 'Mira', seed, purse: 100000 }, content);

  test('a path of options walks on while each leads to a further choice, and ends with the last', () => {
    const walk = (path, caseId = 'child') => eventChoices(child, path, { seed, caseId });
    assert.deepEqual(ids(walk([]).options), ['lead', 'ask', 'leave']);
    const led = walk(['lead']);
    assert.equal(led.steps[0].outcome.kind, 'choice');
    assert.deepEqual(ids(led.options), ['look', 'iron', 'back']);
    assert.deepEqual(ids(walk(['ask']).options), ['camp', 'food', 'go']);
    // Ended: the last outcome is no further choice.
    assert.equal(walk(['lead', 'look']).options, null);
    assert.equal(walk(['leave']).options, null);
    // A path the event does not have.
    assert.equal(walk(['lead', 'camp']), null);
    assert.equal(walk(['leave', 'look']), null);
    assert.equal(walk(['nope']), null);
  });

  test('a case tells a further choice its own way and keeps its options', () => {
    const living = eventChoices(wedding, ['watch'], { seed, caseId: 'living' });
    const dead = eventChoices(wedding, ['watch'], { seed, caseId: 'dead' });
    assert.notEqual(living.steps[0].outcome.text, dead.steps[0].outcome.text);
    assert.match(dead.steps[0].outcome.text, /nie rzucają cieni/);
    assert.deepEqual(ids(dead.options), ids(living.options));
    assert.deepEqual(ids(dead.options), ['greet', 'cross', 'run']);
  });

  test('the last option decides the outcome in the case drawn: the same path ends differently', () => {
    const honest = resolve(child, ['lead', 'look'], 'child');
    assert.ok(honest.event.reward.gold > 0);
    assert.equal(honest.fights.length, base.fights.length);
    const upior = resolve(child, ['lead', 'look'], 'upior');
    assert.equal(upior.fights.length, base.fights.length + 1);
    assert.deepEqual(upior.fights.at(-1).enemies.map((enemy) => enemy.monsterId), ['upior']);
    // The report tells both choices, the first with what it led to.
    assert.deepEqual(honest.event.steps, [{ label: 'Odprowadź ją do domu', text: child.options[0].outcome.text }]);
    assert.equal(honest.event.option.label, 'Zajrzyj za dąb');
    const told = honest.entries.find((entry) => entry.type === 'event').text;
    assert.ok(told.startsWith('Zagubiona dziewczynka. Odprowadź ją do domu: Dziewczynka chwyta cię za rękę.'));
    assert.match(told, /Zajrzyj za dąb: Za dębem stoi chata smolarza/);
  });

  test('every option of the path has its price, paid at the end, and {cost} tells it', () => {
    const level = character.level;
    // The map costs 3 gold a level, at the first choice.
    const map = resolve(hunter, ['map', 'reach'], 'honest');
    assert.equal(map.spent - (base.spent ?? 0), 3 * level);
    assert.equal(map.event.cost, 3 * level);
    assert.match(map.event.steps[0].text, new RegExp(`−${3 * level} złota`));
    // The gift costs 2 gold a level, at the second.
    const gift = resolve(wedding, ['join', 'gift'], 'living');
    assert.equal(gift.spent - (base.spent ?? 0), 2 * level);
    assert.match(gift.event.option.text, new RegExp(`−${2 * level} złota`));
    // Further on, an option shows its price and is locked without the gold
    // left after the earlier ones.
    const who = { classId: 'warrior', level, purse: 2 * level - 1 };
    const view = eventView(wedding, content.areasById['fox-ravines'], who, content, eventChoices(wedding, ['join'], { seed }));
    assert.deepEqual(view.options.find((option) => option.id === 'gift'), { id: 'gift', label: 'Wręcz młodej parze podarunek', cost: 2 * level, locked: 'za mało złota' });
    assert.equal(view.steps.length, 1);
  });

  test('each event: two steps in every case, and each path of two choices ends in every case', () => {
    for (const event of [child, wedding, hunter]) {
      assert.equal(event.draft, true);
      for (const one of event.cases) {
        for (const first of event.options) {
          const walk = eventChoices(event, [first.id], { seed, caseId: one.id });
          if (!walk.options) continue;
          for (const second of walk.options) {
            const done = eventChoices(event, [first.id, second.id], { seed, caseId: one.id });
            assert.equal(done.options, null, `${event.id}/${one.id}/${first.id}/${second.id}`);
            // And it resolves.
            const hunt = resolve(event, [first.id, second.id], one.id);
            assert.ok(hunt.event.option.text.length > 0);
          }
        }
        // Two of the three first options lead to a further choice.
        assert.equal(event.options.filter((option) => eventChoices(event, [option.id], { seed, caseId: one.id }).options).length, 2);
      }
      // The outcomes further on are among the event's outcomes.
      assert.ok(eventOutcomes(event).length > caseOutcomes(event, event.cases[0]).length);
    }
  });
});

describe('events with a further choice (API)', () => {
  const { call, db, signUp } = useServer({ EVENTS: 'test' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('wedrowka'));
    await call('POST', '/api/character', { cookie, body: { name: 'Wedrowka', classId: 'warrior', appearance: 'female' } });
  });

  const explore = async () => {
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } })).status, 201);
    await call('POST', '/api/test/skip-time', { cookie });
  };
  const claim = (choice) => call('POST', '/api/hunts/claim', { cookie, ...(choice !== undefined && { body: { choice } }) });
  const choose = (eventId, caseId) => call('POST', '/api/test/events', { cookie, body: { eventId, ...(caseId && { caseId }) } });

  test('the first choice is kept: the event comes back at the second, and only the last one ends it', async () => {
    // Past the tutorial, strong enough to end every exploration as planned.
    await explore();
    await claim();
    await (await db()).prepare(`UPDATE characters SET level = 30, gold = 100000, points = '{"strength":150,"vitality":140}', hp_at = 0`).run();
    assert.equal((await choose('lost-child', 'child')).status, 200);
    await explore();
    const first = (await claim()).data.event;
    assert.equal(first.id, 'lost-child');
    assert.equal(first.steps, undefined);
    assert.deepEqual(ids(first.options), ['lead', 'ask', 'leave']);
    // The first choice: a further one, with what happened.
    const second = await claim('ask');
    assert.equal(second.status, 200);
    assert.equal(second.data.report, undefined);
    assert.deepEqual(second.data.event.steps, [{ label: 'Zapytaj, skąd się tu wzięła', text: child.options[1].outcome.text }]);
    assert.deepEqual(ids(second.data.event.options), ['camp', 'food', 'go']);
    // Closed and opened again, the event waits at the second choice; the
    // first cannot be made again.
    assert.deepEqual((await claim()).data.event, second.data.event);
    assert.equal((await claim('lead')).data.error.code, 'invalid_choice');
    assert.equal((await claim('look')).data.error.code, 'invalid_choice');
    assert.equal((await (await db()).prepare('SELECT COUNT(*) AS count FROM reports').first()).count, 1);
    // The last choice ends it: the report tells both.
    const done = await claim('camp');
    assert.equal(done.status, 200);
    const { event } = done.data.report;
    assert.deepEqual(
      event.steps.map((step) => step.label),
      ['Zapytaj, skąd się tu wzięła'],
    );
    assert.equal(event.option.label, 'Weź ją ze sobą na noc');
    assert.equal(event.case, 'child');
    assert.equal(done.data.character.activity, null);
    assert.notEqual(event.reward.item, null);
  });

  test('a price at the second choice comes out of the purse with the first one\'s', async () => {
    await explore();
    await claim();
    await (await db()).prepare(`UPDATE characters SET level = 30, gold = 100000, points = '{"strength":150,"vitality":140}', hp_at = 0`).run();
    await choose('treasure-hunter', 'robber');
    await explore();
    await claim();
    const map = await claim('map');
    assert.deepEqual(ids(map.data.event.options), ['reach', 'tracks', 'drop']);
    assert.match(map.data.event.steps[0].text, /−90 złota/);
    const before = (await (await db()).prepare('SELECT gold FROM characters').first()).gold;
    const done = await claim('drop');
    assert.equal(done.status, 200);
    assert.equal(done.data.report.event.cost, 90);
    assert.equal(done.data.character.gold, before + done.data.report.summary.gold - 90);
  });
});

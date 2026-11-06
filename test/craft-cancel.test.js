// Orders taken off the Stół rozbiórki's queue (a player on the chat:
// „Czy można dodać opcję usuwania budynków/przedmiotów z kolejki? Kliknąłem
// przerób wszystko przez pomyłkę”; the author, 5.11.2026: „nie wiem czy jest
// sens karania za takie pomyłki, może to ogarniemy?”): "Usuń z kolejki" and
// "Usuń wszystkie" give back all an order took, also the one at work, whose
// work so far is lost, and the orders after it move up; an order counts for
// the narrator's quests and the Próby Gildii only once it ends (the author:
// „zrób też tak zeby zadania rozbiórki przedmiotów liczyły się po
// zakończonej rozbiórce”), so taking one off leaves them as they were, but
// an order made before that, counted when made, takes back exactly what it
// brought them; the minerals jewellery gave go back and a pattern an item
// taught hides again, or passes to an order staying with such an item; a
// full bag, minerals spent or a quest whose reward that older work brought
// keep the work on the table.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  addQuestProgress,
  createRng,
  generateItem,
  orderCancellable,
  orderMaterials,
  orderSalvageMany,
  orderWork,
  patternsKept,
  questPeriod,
  rewardedQuest,
  settleCrafting,
  takeOffQueue,
  takeQuestProgress,
  trialAfterCancel,
} from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const empty = { materials: {}, parts: {}, queue: [] };
// A table at plain pace that takes every rarity, with no extra parts.
const plain = { level: 5, pace: 1, maxRarity: content.rarities.length - 1, bonusChance: 0 };
const ringBase = content.bases.find((base) => base.slot === 'ring');
const texts = content.buildings.find((building) => building.effect.kind === 'craftSpeed').queue;
const withIds = (state) => ({ ...state, queue: state.queue.map((order, index) => ({ id: `o${index}`, ...order })) });
const times = (queue) => queue.map((order) => [order.id, order.startsAt / MINUTE, order.endsAt / MINUTE]);
// Orders as they were made before their work counted at their end: counted
// when made, so taken off they take it back.
const older = (state) => ({ ...state, queue: state.queue.map(({ countsAtEnd: _, ...order }) => order) });

describe('orders taken off the table, in the engine', () => {
  test('an order leaves with its materials, and the orders after it move up; the one at work loses its work and the next starts now', () => {
    const materials = { 'wolf-pelt:common': 3, 'fox-pelt:common': 2, 'boar-tusk:rare': 1 };
    const { state } = orderMaterials({ ...empty, materials }, Object.keys(materials), plain, 0, createRng('kolejka'), content);
    // 15 minutes of wolf pelts, 10 of fox pelts, 8 of the boar's tusk.
    const queue = withIds(state);
    assert.deepEqual(times(queue.queue), [
      ['o0', 0, 15],
      ['o1', 15, 25],
      ['o2', 25, 33],
    ]);
    const at = 5 * MINUTE;
    const waiting = takeOffQueue(settleCrafting(queue, at), new Set(['o1']), at);
    assert.deepEqual(waiting.state.materials, { 'fox-pelt:common': 2 });
    assert.deepEqual(times(waiting.state.queue), [
      ['o0', 0, 15],
      ['o2', 15, 23],
    ]);
    const working = takeOffQueue(settleCrafting(queue, at), new Set(['o0']), at);
    assert.deepEqual(working.state.materials, { 'wolf-pelt:common': 3 });
    assert.deepEqual(times(working.state.queue), [
      ['o1', 5, 15],
      ['o2', 15, 23],
    ]);
    const all = takeOffQueue(settleCrafting(queue, at), new Set(['o0', 'o1', 'o2']), at);
    assert.deepEqual([all.state.materials, all.state.queue, all.items], [materials, [], []]);
    // Orders made now count at their end: nothing counted yet, nothing to take back.
    assert.ok(queue.queue.every((order) => order.countsAtEnd === true));
    assert.deepEqual(waiting.work, []);
    // Older ones counted when made: what each brought, when ordered.
    assert.deepEqual(
      takeOffQueue(settleCrafting(older(queue), at), new Set(['o1']), at).work.map(({ kind, pieces, orderedAt, cancelled }) => [kind, pieces, orderedAt, cancelled]),
      [
        ['process', 3, 0, false],
        ['process', 2, 0, true],
        ['process', 1, 0, false],
      ],
    );
  });

  test('items taken apart come back as the bag kept them, with the minerals of jewellery and the patterns they taught to take back; an order from before keeps no item', () => {
    const ring = { id: 7, equippedSlot: null, base: ringBase.id, slot: 'ring', rarity: 'rare', level: 30, upgrade: 0, affixes: [] };
    const helmet = { id: 8, equippedSlot: null, ...generateItem({ baseId: 'helmet', level: 25, rarityId: 'rare' }, createRng('hełm'), content) };
    const state = withIds(
      orderSalvageMany(
        empty,
        [ring, helmet].map((item) => ({ item, name: item.base })),
        plain,
        0,
        createRng('rozbiórka'),
        content,
      ),
    );
    // Both rare: one order of Rzemienie, holding both items without their places.
    assert.equal(state.queue.length, 1);
    const [order] = state.queue;
    assert.deepEqual(
      order.items.map((item) => [item.id, item.equippedSlot, item.base]),
      [
        [undefined, undefined, ringBase.id],
        [undefined, undefined, 'helmet'],
      ],
    );
    assert.deepEqual(order.minerals, { 'silver-ore': 5, quartz: 1 });
    const back = takeOffQueue({ ...state, queue: [{ ...order, patterns: ['helmet'] }] }, new Set(['o0']), 0);
    assert.deepEqual([back.items.length, back.minerals, back.patterns, back.work, orderWork(order).pieces], [2, { 'silver-ore': 5, quartz: 1 }, ['helmet'], [], 2]);
    assert.ok(orderCancellable(order));
    assert.ok(!orderCancellable({ kind: 'item', name: 'Hełm', partId: 'straps', parts: 4, startsAt: 0, endsAt: 1 }));
    assert.ok(orderCancellable({ kind: 'material', key: 'wolf-pelt:common', count: 2, partId: 'scraps', parts: 2, startsAt: 0, endsAt: 1 }));
  });

  test('pieces got in a trade are marked so again: the character\'s own pieces go to the table first', () => {
    const materials = { 'wolf-pelt:common': 3 };
    const foreign = { 'material:wolf-pelt:common': 2 };
    const two = orderMaterials({ ...empty, materials }, ['wolf-pelt:common'], plain, 0, createRng('a'), content, { 'wolf-pelt:common': 2 }, foreign).state;
    assert.equal(two.queue[0].traded, 1);
    const one = orderMaterials({ ...empty, materials }, ['wolf-pelt:common'], plain, 0, createRng('a'), content, { 'wolf-pelt:common': 1 }, foreign).state;
    assert.equal(one.queue[0].traded, undefined);
    assert.deepEqual(takeOffQueue(withIds(two), new Set(['o0']), 0).traded, { 'wolf-pelt:common': 1 });
  });

  test('a quest gives back exactly what the cancelled work brought it, in the period it was ordered in', () => {
    const now = Date.parse('2026-11-05T12:00:00Z');
    const quest = (kind, count, progress) => ({ kind, count, progress, reward: { kind: 'gold', amount: 5 }, claimed: false });
    const quests = {
      daily: { period: questPeriod('daily', now, content).key, chest: false, quests: [quest('process', 4, 2), quest('salvage', 2, 0)] },
      weekly: { period: questPeriod('weekly', now, content).key, chest: false, quests: [quest('process', 30, 0)] },
    };
    // Two legit pieces, then fifty by mistake: done, with 48 over its count.
    const mistake = addQuestProgress(quests, { processed: 50 });
    assert.deepEqual([mistake.daily.quests[0].progress, mistake.daily.quests[0].over], [4, 48]);
    const back = takeQuestProgress(mistake, [{ kind: 'process', pieces: 50, orderedAt: now }], content);
    assert.deepEqual(back.daily.quests[0], quests.daily.quests[0]);
    assert.deepEqual(back.weekly.quests[0], quests.weekly.quests[0]);
    assert.equal(rewardedQuest(mistake, back), null);
    // Ordered yesterday: today's quests never counted it, the week's did.
    const yesterday = takeQuestProgress(mistake, [{ kind: 'process', pieces: 50, orderedAt: now - 24 * HOUR }], content);
    assert.deepEqual([yesterday.daily.quests[0].progress, yesterday.weekly.quests[0].progress], [4, 0]);
    // Of two orders of three, one leaves: the other still reaches the count.
    const two = addQuestProgress(addQuestProgress(quests, { processed: 3 }), { processed: 3 });
    const one = takeQuestProgress(two, [{ kind: 'process', pieces: 3, orderedAt: now }], content);
    assert.deepEqual([one.daily.quests[0].progress, one.daily.quests[0].over], [4, 1]);
    // A quest whose reward was taken, or whose period's chest was opened,
    // would be undone: the work stays.
    const claimed = { ...mistake, daily: { ...mistake.daily, quests: [{ ...mistake.daily.quests[0], claimed: true }, mistake.daily.quests[1]] } };
    const undone = takeQuestProgress(claimed, [{ kind: 'process', pieces: 50, orderedAt: now }], content);
    assert.equal(rewardedQuest(claimed, undone)?.kind, 'process');
    const opened = { ...mistake, daily: { ...mistake.daily, chest: true } };
    assert.equal(rewardedQuest(opened, takeQuestProgress(opened, [{ kind: 'process', pieces: 50, orderedAt: now }], content))?.kind, 'process');
    // Taking back 40 of the 50 leaves it done: nothing given is undone.
    assert.equal(rewardedQuest(claimed, takeQuestProgress(claimed, [{ kind: 'process', pieces: 40, orderedAt: now }], content)), null);
  });

  test('a trial gives back what the cancelled orders brought it; done by them, it opens again, and orders still waiting from after it was done count then', () => {
    const now = Date.parse('2026-11-05T12:00:00Z');
    const week = questPeriod('weekly', now, content).key;
    // 10 legit pieces, then 40 by mistake: done at 15, with 35 over.
    const done = { kind: 'process', week, count: 15, progress: 15, extra: 35, state: 'done', takenAt: now - 2 * HOUR, doneAt: now - 10 * MINUTE };
    const mistake = { kind: 'process', pieces: 40, orderedAt: now - 10 * MINUTE, cancelled: true };
    assert.deepEqual(trialAfterCancel(done, [mistake], now, content), { progress: 10, extra: 0, state: 'active', doneAt: null });
    // An order waiting from after the trial was done counts now that it is open again.
    const later = { kind: 'process', pieces: 8, orderedAt: now - 5 * MINUTE, cancelled: false };
    assert.deepEqual(trialAfterCancel(done, [mistake, later], now, content), { progress: 15, extra: 3, state: 'done', doneAt: now });
    // Enough left over: it stays done as it was.
    const part = { ...mistake, pieces: 20 };
    assert.deepEqual(trialAfterCancel(done, [part], now, content), { progress: 15, extra: 15, state: 'done', doneAt: done.doneAt });
    // A running trial loses just those pieces.
    const active = { ...done, progress: 7, extra: 0, state: 'active', doneAt: null };
    assert.deepEqual(trialAfterCancel(active, [{ ...mistake, pieces: 5 }], now, content), { progress: 2, extra: 0, state: 'active', doneAt: null });
    // What it never counted changes nothing: an order from before it ran, of
    // another week, of another kind, or after it was done.
    for (const other of [
      { ...mistake, orderedAt: now - 3 * HOUR },
      { ...mistake, orderedAt: now - 8 * 24 * HOUR },
      { ...mistake, kind: 'salvage' },
      { ...mistake, orderedAt: now - 5 * MINUTE },
    ]) {
      assert.equal(trialAfterCancel(done, [other], now, content), null);
    }
  });

  test('a pattern stays known with an order staying that holds an item of its base, and its mark passes to that order', () => {
    const sword = { base: 'broadsword', slot: 'weapon', level: 15, rarity: 'common', affixes: [] };
    const queue = [
      { id: 'a', kind: 'item', items: [{ ...sword, base: 'helmet' }], patterns: ['helmet'] },
      { id: 'b', kind: 'item', items: [sword], patterns: [] },
      { id: 'c', kind: 'item', items: [sword] },
      { id: 'd', kind: 'material', key: 'wolf-pelt:common', count: 2 },
    ];
    const { queue: kept, hidden } = patternsKept(queue, ['broadsword', 'axe']);
    assert.deepEqual(hidden, ['axe']);
    assert.deepEqual(
      kept.map((order) => order.patterns),
      [['helmet'], ['broadsword'], undefined, undefined],
    );
    // A mark it has already stays one.
    assert.deepEqual(patternsKept(kept, ['broadsword']).queue[1].patterns, ['broadsword']);
  });
});

describe('orders taken off the table, through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('stolarz'));
    await call('POST', '/api/character', { cookie, body: { name: 'Stolarz', classId: 'warrior', appearance: 'male' } });
    await run(
      "INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) SELECT id, 'craft-table', 1, 0, 1 FROM characters WHERE true ON CONFLICT (character_id, building_id) DO UPDATE SET level = excluded.level",
    );
  });

  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  const character = async (as = cookie) => (await call('GET', '/api/character', { cookie: as })).data.character;
  const craft = (body) => call('POST', '/api/craft/materials', { cookie, body });
  const cancel = (body, as = cookie) => call('POST', '/api/craft/cancel', { cookie: as, body });
  const stock = (materials) => run('UPDATE characters SET materials = ?', JSON.stringify(materials));
  const stacks = (view) => Object.fromEntries(view.crafting.materials.map((material) => [material.key, material.count]));
  const stored = async (column) => JSON.parse((await first(`SELECT ${column} FROM characters`))[column] ?? 'null');
  async function addItem(item) {
    const { meta } = await run('INSERT INTO items (character_id, slot, data, created_at) SELECT id, NULL, ?, 0 FROM characters', JSON.stringify(item));
    return meta.last_row_id;
  }
  const helmet = (seed) => generateItem({ baseId: 'helmet', level: 25, rarityId: 'rare' }, createRng(seed), content);

  test('one order waiting, the one at work, then all of them: everything comes back, the rest moves up, and the page has the buttons', async () => {
    const materials = { 'wolf-pelt:common': 3, 'fox-pelt:common': 2, 'boar-tusk:rare': 1 };
    await stock(materials);
    const ordered = (await craft({ keys: Object.keys(materials) })).data.character.crafting;
    assert.deepEqual(stacks({ crafting: ordered }), {});
    const [wolf, fox, boar] = ordered.queue;
    assert.ok(ordered.queue.every((order) => order.cancellable));
    assert.deepEqual([ordered.texts.cancel, ordered.texts.cancelAll, ordered.texts.errors], ['Usuń z kolejki', 'Usuń wszystkie', undefined]);
    // The fox pelts, waiting: back, and the boar's tusk comes right after the wolf pelts.
    const waiting = await cancel({ id: fox.id });
    assert.equal(waiting.status, 200, JSON.stringify(waiting.data));
    assert.deepEqual([waiting.data.cancelled, stacks(waiting.data.character)], [1, { 'fox-pelt:common': 2 }]);
    const [stays, next] = waiting.data.character.crafting.queue;
    assert.deepEqual([stays.id, stays.startsAt, stays.endsAt], [wolf.id, wolf.startsAt, wolf.endsAt]);
    assert.deepEqual([next.id, next.startsAt, next.endsAt - next.startsAt], [boar.id, wolf.endsAt, boar.endsAt - boar.startsAt]);
    // The wolf pelts, at work: back, their work lost, and the boar's tusk starts now.
    const before = Date.now();
    const working = (await cancel({ id: wolf.id })).data.character;
    assert.deepEqual(stacks(working), { 'fox-pelt:common': 2, 'wolf-pelt:common': 3 });
    const [last] = working.crafting.queue;
    assert.ok(last.startsAt >= before && last.startsAt <= Date.now(), 'the next order starts now');
    assert.equal(last.endsAt - last.startsAt, boar.endsAt - boar.startsAt);
    // The parts of an order taken off never come.
    assert.ok(working.crafting.parts.every((part) => part.count === 0));
    // All: an empty queue, and everything as before the "Przerób wszystko".
    await craft({ all: true });
    const all = await cancel({ all: true });
    assert.deepEqual([all.data.cancelled, stacks(all.data.character), all.data.character.crafting.queue], [3, materials, []]);
    const none = await cancel({ all: true });
    assert.deepEqual([none.status, none.data.error.code, none.data.error.message], [409, 'not_queued', texts.errors.empty]);
  });

  test('marked stacks go with the pieces chosen under them: fewer of one, the whole of another, a count above the stack takes it whole (a player on the chat, 6.11.2026)', async () => {
    await stock({ 'wolf-pelt:common': 5, 'fox-pelt:common': 2, 'boar-tusk:rare': 1 });
    const done = await craft({ keys: ['wolf-pelt:common', 'fox-pelt:common', 'boar-tusk:rare'], counts: { 'wolf-pelt:common': 2, 'boar-tusk:rare': 9, 'deer-antler:common': 3 } });
    assert.equal(done.status, 200, JSON.stringify(done.data).slice(0, 300));
    assert.equal(done.data.ordered, 3);
    assert.deepEqual(stacks(done.data.character), { 'wolf-pelt:common': 3 });
    assert.deepEqual(done.data.character.crafting.queue.map((order) => order.count), [2, 2, 1]);
    // A count that is no whole number above zero is no choice: the whole stack.
    await stock({ 'wolf-pelt:common': 4 });
    await cancel({ all: true });
    await stock({ 'wolf-pelt:common': 4 });
    const whole = await craft({ keys: ['wolf-pelt:common'], counts: { 'wolf-pelt:common': 0 } });
    assert.deepEqual(stacks(whole.data.character), {});
  });

  test('a finished order, one taken off already or another character\'s, and two taps at once: nothing more comes back', async () => {
    await stock({ 'wolf-pelt:common': 3, 'fox-pelt:common': 2 });
    const [wolf, fox] = (await craft({ all: true })).data.character.crafting.queue;
    // Two taps on one order: it comes back once.
    const taps = await Promise.all([1, 2].map(() => cancel({ id: fox.id })));
    assert.equal(taps.filter((tap) => tap.status === 200).length, 1, JSON.stringify(taps.map((tap) => tap.data)).slice(0, 300));
    assert.deepEqual(stacks(await character()), { 'fox-pelt:common': 2 });
    assert.equal((await cancel({ id: fox.id })).data.error.message, texts.errors.gone);
    // Another character knows not this order: its queue stays as it was.
    const { cookie: other } = await signUp('sasiad');
    await call('POST', '/api/character', { cookie: other, body: { name: 'Sasiad', classId: 'mage', appearance: 'female' } });
    const foreign = await cancel({ id: wolf.id }, other);
    assert.deepEqual([foreign.status, foreign.data.error.code], [409, 'not_queued']);
    assert.deepEqual((await character()).crafting.queue.map((order) => order.id), [wolf.id]);
    // Done: its parts are there, and it cannot leave any more.
    const { crafting } = await first('SELECT crafting FROM characters WHERE name = ?', 'Stolarz');
    const past = JSON.parse(crafting).map((order) => ({ ...order, startsAt: order.startsAt - HOUR, endsAt: order.endsAt - HOUR }));
    await run('UPDATE characters SET crafting = ? WHERE name = ?', JSON.stringify(past), 'Stolarz');
    const finished = await cancel({ id: wolf.id });
    assert.deepEqual([finished.status, finished.data.error.code], [409, 'not_queued']);
    const after = await character();
    assert.deepEqual([stacks(after), after.crafting.parts.find((part) => part.id === 'scraps').count], [{ 'fox-pelt:common': 2 }, 3]);
  });

  test('items come back to the bag as they were, when it has room for all of them, and the gems and ores of jewellery go back', async () => {
    const ring = { base: ringBase.id, slot: 'ring', rarity: 'rare', level: 30, upgrade: 0, affixes: [] };
    const items = [helmet('pierwszy'), ring];
    const own = (await character()).bag.map((item) => item.id);
    const ids = [];
    for (const item of items) ids.push(await addItem(item));
    await run(`UPDATE characters SET minerals = '{"silver-ore":1}'`);
    const salvaged = await call('POST', '/api/items/salvage', { cookie, body: { ids } });
    assert.equal(salvaged.status, 200, JSON.stringify(salvaged.data));
    const [order] = salvaged.data.character.crafting.queue;
    assert.deepEqual([order.count, order.cancellable, order.minerals], [2, true, [{ name: 'Srebrny kruszec', count: 5 }, { name: 'Kwarc', count: 1 }]]);
    assert.deepEqual(await stored('minerals'), { 'silver-ore': 6, quartz: 1 });
    // A bag with one free place: the two items would not fit, so the order stays.
    const view = salvaged.data.character;
    const fillers = [];
    for (let left = view.bagCapacity - view.bagUsed; left > 1; left--) fillers.push(await addItem(helmet(`wypełniacz-${left}`)));
    const full = await cancel({ id: order.id });
    assert.deepEqual([full.status, full.data.error.code], [409, 'bag_full']);
    assert.equal(full.data.error.message, texts.errors.bagFull.replace('{need}', '2').replace('{free}', '1'));
    assert.equal((await character()).crafting.queue.length, 1);
    await run('DELETE FROM items WHERE id = ?', fillers[0]);
    const back = await cancel({ all: true });
    assert.equal(back.status, 200, JSON.stringify(back.data));
    const bag = back.data.character.bag.filter((item) => !fillers.includes(item.id) && !own.includes(item.id));
    assert.deepEqual(
      bag.map((item) => [item.base, item.rarity, item.level]).sort(),
      items.map((item) => [item.base, item.rarity, item.level]).sort(),
    );
    const { data } = await first('SELECT data FROM items WHERE character_id = (SELECT id FROM characters) ORDER BY id DESC LIMIT 1');
    assert.deepEqual(JSON.parse(data), ring);
    assert.deepEqual(await stored('minerals'), { 'silver-ore': 1 });
    // Its gems and ores used up meanwhile: the jewel cannot come back.
    const again = await call('POST', `/api/items/${bag.find((item) => item.base === ringBase.id).id}/salvage`, { cookie });
    await run(`UPDATE characters SET minerals = '{"silver-ore":2}'`);
    const used = await cancel({ id: again.data.character.crafting.queue[0].id });
    assert.deepEqual([used.status, used.data.error.code], [409, 'minerals_used']);
    assert.equal(used.data.error.message, texts.errors.minerals.replace('{minerals}', 'Srebrny kruszec ×3, Kwarc ×1'));
  });

  test('a pattern an item taught hides again, unless an order staying holds such an item', async () => {
    const broadsword = (level) => ({ base: 'broadsword', slot: 'weapon', level, rarity: 'common', affixes: [], damage: { min: 6, max: 10 } });
    const one = await addItem(broadsword(15));
    const taught = (await call('POST', `/api/items/${one}/salvage`, { cookie })).data;
    assert.equal(taught.salvage.pattern, 'Pałasz');
    assert.deepEqual(taught.character.crafting.queue[0].patterns, ['Pałasz']);
    assert.deepEqual(await stored('patterns'), ['broadsword']);
    await cancel({ id: taught.character.crafting.queue[0].id });
    assert.deepEqual(await stored('patterns'), []);
    // Taken apart again, and another one after it: the first leaves, the second keeps it.
    const [first, second] = [await addItem(broadsword(15)), await addItem(broadsword(16))];
    const queue = [];
    for (const id of [first, second]) queue.push((await call('POST', `/api/items/${id}/salvage`, { cookie })).data.character.crafting.queue.at(-1));
    assert.deepEqual(queue.map((order) => order.patterns), [['Pałasz'], []]);
    const passed = (await cancel({ id: queue[0].id })).data.character;
    assert.deepEqual(await stored('patterns'), ['broadsword']);
    // The second order now holds the mark: taken off too, both swords are
    // back and the pattern hides again, as nothing was taken apart.
    assert.deepEqual(passed.crafting.queue.map((order) => order.patterns), [['Pałasz']]);
    const back = (await cancel({ id: queue[1].id })).data.character;
    assert.deepEqual(await stored('patterns'), []);
    // These two, and the first one, back since the start.
    assert.equal(back.bag.filter((item) => item.base === 'broadsword').length, 3);
  });

  test('an order not done yet counted nothing, so taken off it leaves the quests as they were', async () => {
    const quests = await stored('quests');
    const quest = (kind, count, progress) => ({ kind, count, progress, reward: { kind: 'gold', amount: 5 }, claimed: false });
    quests.daily.quests = [quest('process', 4, 2), quest('salvage', 1, 0)];
    await run('UPDATE characters SET quests = ?', JSON.stringify(quests));
    const progress = (view) => view.quests.daily.quests.map((entry) => [entry.progress, entry.done]);
    await stock({ 'wolf-pelt:common': 50 });
    const ordered = (await craft({ all: true })).data.character;
    assert.deepEqual(progress(ordered), [[2, false], [0, false]]);
    assert.deepEqual(ordered.crafting.queue.map((order) => order.counted), [false]);
    const item = await addItem(helmet('zadanie'));
    assert.deepEqual(progress((await call('POST', `/api/items/${item}/salvage`, { cookie })).data.character), [[2, false], [0, false]]);
    assert.deepEqual(progress((await cancel({ all: true })).data.character), [[2, false], [0, false]]);
    assert.deepEqual((await stored('quests')).daily.quests.map((entry) => [entry.progress, entry.over]), [[2, undefined], [0, undefined]]);
  });

  test('an order made before, counted when made, takes back exactly what it brought; a quest whose reward it brought keeps it on the table', async () => {
    const now = Date.now();
    const quests = await stored('quests');
    const quest = (kind, count, progress) => ({ kind, count, progress, reward: { kind: 'gold', amount: 5 }, claimed: false });
    // Two legit pieces, then fifty counted at once by an order of before.
    quests.daily.quests = [{ ...quest('process', 4, 4), over: 48 }, quest('salvage', 1, 0)];
    const old = { id: 'stara', kind: 'material', key: 'wolf-pelt:common', count: 50, partId: 'scraps', parts: 50, bonus: 0, orderedAt: now, startsAt: now, endsAt: now + 10 * HOUR };
    await run('UPDATE characters SET quests = ?, crafting = ?', JSON.stringify(quests), JSON.stringify([old]));
    const progress = (view) => view.quests.daily.quests.map((entry) => [entry.progress, entry.done]);
    const view = await character();
    assert.deepEqual(view.crafting.queue.map((order) => order.counted), [true]);
    // Its reward taken: the 50 pieces stay on the table, as they paid for it.
    assert.equal((await call('POST', '/api/quests/claim', { cookie, body: { period: 'daily', index: 0 } })).status, 200);
    const rewarded = await cancel({ all: true });
    assert.deepEqual([rewarded.status, rewarded.data.error.code], [409, 'quest_rewarded']);
    assert.equal(rewarded.data.error.message, texts.errors.rewarded.replace('{quest}', 'Przerób na Stole rozbiórki 4 materiały.'));
    assert.equal((await character()).crafting.queue.length, 1);
    // Not taken yet: the two legit pieces stay counted, nothing more.
    await run('UPDATE characters SET quests = ?', JSON.stringify(quests));
    assert.deepEqual(progress((await cancel({ all: true })).data.character), [[2, false], [0, false]]);
  });

  test('pieces got in a trade are marked so again when they come back', async () => {
    await stock({ 'wolf-pelt:common': 3 });
    await run(`UPDATE characters SET foreign_stacks = '{"material:wolf-pelt:common":2}'`);
    const [order] = (await craft({ all: true })).data.character.crafting.queue;
    // The next look writes the traded pieces down as used up.
    await character();
    assert.deepEqual(await stored('foreign_stacks'), {});
    await cancel({ id: order.id });
    await character();
    assert.deepEqual(await stored('foreign_stacks'), { 'material:wolf-pelt:common': 2 });
  });

  test('an order from before 0.1.65 that took an item apart stays, as its item is gone; one of materials leaves', async () => {
    const now = Date.now();
    const old = [
      { id: 'stara-rozbiorka', kind: 'item', name: 'Hełm', rarity: 'rare', partId: 'straps', parts: 4, bonus: 0, startsAt: now - MINUTE, endsAt: now + 30 * MINUTE },
      { id: 'stara-przerobka', kind: 'material', key: 'wolf-pelt:common', count: 2, partId: 'scraps', parts: 2, bonus: 0, startsAt: now + 30 * MINUTE, endsAt: now + 40 * MINUTE },
    ];
    await run('UPDATE characters SET crafting = ?', JSON.stringify(old));
    const { queue } = (await character()).crafting;
    assert.deepEqual(queue.map((order) => order.cancellable), [false, true]);
    const refused = await cancel({ id: 'stara-rozbiorka' });
    assert.deepEqual([refused.status, refused.data.error.code, refused.data.error.message], [409, 'too_old', texts.errors.old]);
    const all = (await cancel({ all: true })).data;
    assert.deepEqual([all.cancelled, stacks(all.character), all.character.crafting.queue.map((order) => order.id)], [1, { 'wolf-pelt:common': 2 }, ['stara-rozbiorka']]);
  });
});

describe('orders taken off the table and the Próby Gildii', () => {
  const { call, db, signUp } = useServer();
  let cookie;

  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const trial = async () => (await db()).prepare('SELECT progress, extra, state, done_at FROM guild_trials').first();
  const craft = (materials) => call('POST', '/api/craft/materials', { cookie, body: { keys: Object.keys(materials) } });
  const cancel = (id) => call('POST', '/api/craft/cancel', { cookie, body: { id } });

  beforeEach(async () => {
    ({ cookie } = await signUp('mistrz'));
    await call('POST', '/api/character', { cookie, body: { name: 'Mistrz', classId: 'warrior', appearance: 'female' } });
    await run('UPDATE characters SET level = 30, class_level = 25, gold = 5000');
    await run("INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) SELECT id, 'craft-table', 1, 0, 1 FROM characters");
    assert.equal((await call('POST', '/api/guild/found', { cookie, body: { name: 'Leśni Bracia', tag: 'LB' } })).status, 200);
    await call('GET', '/api/guild/trials', { cookie });
    // A board of one trial of the table's work, of 15 pieces.
    await run('UPDATE guild_trial_boards SET trials = ?, opened = 0', JSON.stringify([{ kind: 'process', size: 0, roll: 0 }]));
    await run("DELETE FROM guild_trials WHERE state = 'active'");
    await call('GET', '/api/guild/trials', { cookie });
    await run('UPDATE guild_trials SET count = 15');
  });

  test('an order not done yet moved no trial, so taken off it leaves the trial as it was', async () => {
    await run('UPDATE characters SET materials = ?', JSON.stringify({ 'wolf-pelt:common': 10, 'fox-pelt:common': 40 }));
    const [first, second] = (await craft({ 'wolf-pelt:common': 10, 'fox-pelt:common': 40 })).data.character.crafting.queue;
    assert.deepEqual(await trial(), { progress: 0, extra: 0, state: 'active', done_at: null });
    assert.equal((await cancel(second.id)).status, 200);
    assert.equal((await cancel(first.id)).status, 200);
    assert.deepEqual(await trial(), { progress: 0, extra: 0, state: 'active', done_at: null });
  });

  test('orders made before, counted when made: the trial loses what they brought; done by a mistake, it opens again with the work done before', async () => {
    const now = Date.now();
    const order = (id, key, count, at) => ({ id, kind: 'material', key, count, partId: 'scraps', parts: count, bonus: 0, orderedAt: now, startsAt: at, endsAt: at + HOUR });
    const legit = order('dobre', 'wolf-pelt:common', 10, now);
    const mistake = order('pomylka', 'fox-pelt:common', 40, now + HOUR);
    await run('UPDATE characters SET crafting = ?', JSON.stringify([legit, mistake]));
    // As they counted when made: 10 legit pieces, then 40 by mistake.
    await run("UPDATE guild_trials SET progress = 15, extra = 35, state = 'done', done_at = ?", now);
    assert.equal((await cancel(mistake.id)).status, 200);
    assert.deepEqual(await trial(), { progress: 10, extra: 0, state: 'active', done_at: null });
    assert.equal((await cancel(legit.id)).status, 200);
    assert.deepEqual(await trial(), { progress: 0, extra: 0, state: 'active', done_at: null });
  });
});

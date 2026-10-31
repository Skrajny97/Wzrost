// Alchemia: brewing in the engine (recipes, time, lucky potions, price,
// report, quests and notifications) and through the API, where the
// professions show only with PROFESSIONS on.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  addQuestProgress,
  brewMinutes,
  brewPotions,
  brewingReport,
  catalystChance,
  drawQuests,
  knownPotions,
  mostPotions,
  notificationsDue,
  potionMinutes,
  potionPrice,
  potionsDone,
  questText,
} from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const healing = content.potionsById['lesser-healing'];

describe('brewing in the engine', () => {
  test('a potion takes 10 minutes at level 1, each level 1% less, at most down to half', () => {
    assert.equal(potionMinutes(1, content), 10);
    assert.equal(potionMinutes(11, content), 9);
    assert.equal(potionMinutes(51, content), 5);
    assert.equal(potionMinutes(100, content), 5);
    assert.equal(brewMinutes(10, 2, content), 99);
    assert.equal(brewMinutes(1, 2, content), 10);
    assert.equal(brewMinutes(48, 1, content), 480);
  });

  test('the recipes show with the level, and a brewing takes what the herbs and 8 hours allow', () => {
    assert.deepEqual(knownPotions(1, content).map((potion) => potion.id), ['lesser-healing']);
    assert.deepEqual(knownPotions(5, content).map((potion) => potion.id), ['lesser-healing', 'lesser-mana', 'lesser-speed']);
    assert.equal(mostPotions(healing, 1, { comfrey: 2 }, content), 0);
    assert.equal(mostPotions(healing, 1, { comfrey: 31 }, content), 10);
    assert.equal(mostPotions(healing, 1, { comfrey: 300 }, content), 48);
    assert.equal(mostPotions(healing, 51, { comfrey: 300 }, content), 96);
    for (const level of [2, 7, 33]) assert.ok(brewMinutes(mostPotions(healing, level, { comfrey: 999 }, content), level, content) <= 480);
  });

  test('potions come one after another, and each has 5% of a second one, the same for the first potions of a longer brewing', () => {
    assert.equal(potionsDone(12, 120, 0), 0);
    assert.equal(potionsDone(12, 120, 10 * 60000), 1);
    assert.equal(potionsDone(12, 120, 59 * 60000), 5);
    assert.equal(potionsDone(12, 120, 200 * 60000), 12);
    const runs = Array.from({ length: 200 }, (_, index) => brewPotions({ count: 40, seed: `b${index}` }, content));
    const share = runs.reduce((sum, run) => sum + run.bonus, 0) / (200 * 40);
    assert.ok(share > 0.03 && share < 0.07, String(share));
    assert.ok(runs.every((run) => run.count === 40 + run.bonus));
    for (let index = 0; index < 20; index++) {
      const short = brewPotions({ count: 10, seed: `c${index}` }, content).bonus;
      assert.ok(short <= brewPotions({ count: 30, seed: `c${index}` }, content).bonus);
    }
  });

  test('a catalyst of a rarer grade than its species adds 15% a grade to every potion\'s chance of one more', () => {
    assert.equal(catalystChance(null, content), 0);
    assert.equal(catalystChance('viper-scales:common', content), 0);
    assert.ok(Math.abs(catalystChance('viper-scales:rare', content) - 0.15) < 1e-9);
    assert.ok(Math.abs(catalystChance('viper-scales:epic', content) - 0.45) < 1e-9);
    const runs = Array.from({ length: 200 }, (_, index) => brewPotions({ count: 40, seed: `k${index}`, extraChance: 0.15 }, content));
    const share = runs.reduce((sum, run) => sum + run.bonus, 0) / (200 * 40);
    assert.ok(share > 0.17 && share < 0.23, String(share));
    assert.equal(brewPotions({ count: 10, seed: 'all', extraChance: 2 }, content).bonus, 10);
  });

  test('the scrapper pays 1.5 times the herbs of a potion', () => {
    assert.equal(potionPrice(healing, content), 9);
    assert.equal(potionPrice(content.potionsById['lesser-mana'], content), 13.5);
    assert.equal(potionPrice(content.potionsById['lesser-speed'], content), 18);
  });

  test('the report names the potions, the lucky ones, the lost ones and the recipes revealed', () => {
    const character = newCharacter('cleric', { level: 12 });
    const work = { level: 12, xp: 0, timePoints: 0, messages: [] };
    const report = brewingReport(
      {
        potion: healing,
        minutes: 120,
        startedAt: 0,
        endsAt: 7200000,
        seed: 's',
        made: { count: 13, bonus: 1 },
        stored: { 'lesser-healing': 10 },
        lost: { 'lesser-healing': 3 },
        stopped: false,
        before: { level: 2, xp: 50 },
        after: { level: 4, xp: 20 },
        character,
        xp: 30,
        work,
      },
      content,
    );
    assert.equal(report.kind, 'potions');
    assert.ok(content.brewing.texts.report.includes(report.line));
    assert.equal(report.brewed, 'Uwarzono: 13 × Mniejsza mikstura leczenia.');
    assert.equal(report.lucky, 'Szczęśliwe warzenie, dodatkowo: 1 × Mniejsza mikstura leczenia.');
    assert.equal(report.lost, 'Plecak był pełny. Nie zmieściło się: 3 × Mniejsza mikstura leczenia.');
    assert.equal(report.stopped, null);
    assert.deepEqual(report.potion, { id: 'lesser-healing', name: 'Mniejsza mikstura leczenia', count: 13, bonus: 1, stored: 10, lost: 3 });
    assert.deepEqual(report.revealed, ['lesser-mana']);
    assert.deepEqual(report.system, [
      'Osiągnięto poziom Alchemii: 4',
      'Zdobyto Intelekt: +2',
      'Zdobyto Mądrość: +2',
      'System odsłania nowy przepis: Mniejsza mikstura many',
    ]);
  });

  test('narrator quests ask for known potions with professions only, and brewing moves them', () => {
    const character = newCharacter('cleric', { level: 12 });
    const drawn = (hasProfessions, periodId) =>
      Array.from({ length: 40 }, (_, index) => drawQuests(periodId, { character, hasTable: true, hasProfessions, seed: `q${index}` }, content)).flat();
    assert.ok(!drawn(false, 'daily').some((quest) => quest.kind.startsWith('brew')));
    const daily = drawn(true, 'daily').filter((quest) => quest.kind === 'brew');
    assert.ok(daily.length > 0);
    assert.ok(daily.every((quest) => quest.target === 'lesser-healing' && quest.count === 3));
    assert.equal(questText(daily[0], content), 'Uwarz 3 Mniejsze mikstury leczenia.');
    assert.equal(questText({ ...daily[0], count: 1 }, content), 'Uwarz 1 Mniejszą miksturę leczenia.');
    const weekly = drawn(true, 'weekly').filter((quest) => quest.kind.startsWith('brew'));
    assert.ok(weekly.length > 0 && weekly.every((quest) => quest.kind === 'brewAny' && quest.count === 15));
    assert.equal(questText(weekly[0], content), 'Uwarz łącznie 15 mikstur.');
    const quests = {
      daily: { period: 'd', chest: false, quests: [{ kind: 'brew', target: 'lesser-healing', count: 3, progress: 1, claimed: false }] },
      weekly: { period: 'w', chest: false, quests: [{ kind: 'brewAny', count: 15, progress: 0, claimed: false }] },
    };
    const moved = addQuestProgress(quests, { potions: { 'lesser-healing': 4 } });
    assert.equal(moved.daily.quests[0].progress, 3);
    assert.equal(moved.weekly.quests[0].progress, 4);
  });

  test('the end of a brewing comes as a phone notification', () => {
    const activity = { kind: 'potions', areaId: 'system-workshop', endsAt: 2000 };
    const [due] = notificationsDue({ level: 12, activity, buildings: {}, queue: [] }, 1000, 3000, content);
    assert.equal(due.title, 'Koniec warzenia');
    assert.equal(due.body, 'Mikstury gotowe: Systemowa Pracownia. Raport czeka na odbiór.');
    assert.equal(due.url, '#/profesje/alchemia');
  });
});

describe('brewing through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('alchemiczka'));
    await call('POST', '/api/character', { cookie, body: { name: 'Alchemiczka', classId: 'mage', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = 10, xp = 0').run();
  });

  const set = async (sql) => (await db()).prepare(`UPDATE characters SET ${sql}`).run();
  // Moves the current activity `minutes` into the past.
  const age = async (minutes) =>
    (await db()).prepare('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ?').bind(minutes * 60000, minutes * 60000).run();
  const brew = (body) => call('POST', '/api/professions/brew', { cookie, body });
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;

  test('the workshop shows the known recipe with its herbs, and the others hidden', async () => {
    await set(`herbs = '{"comfrey":31}'`);
    const { brewing } = (await character()).professions;
    assert.equal(brewing.place.name, 'Systemowa Pracownia');
    assert.equal(brewing.potionMinutes, 10);
    const [known, ...hidden] = brewing.recipes;
    assert.equal(known.name, 'Mniejsza mikstura leczenia');
    assert.deepEqual(known.herbs, [{ id: 'comfrey', name: 'Żywokost', need: 3, have: 31 }]);
    assert.equal(known.most, 10);
    assert.deepEqual(
      hidden.map((recipe) => recipe.hint),
      [3, 5, 10, 14, 18, 24, 26, 32, 36, 45, 48, 52, 55, 65, 90].map((level) => `Ukryte przez System do ${level}. poziomu Alchemii.`),
    );
  });

  test('a brewing checks the recipe, the herbs and the count, and takes the herbs at the start', async () => {
    assert.equal((await brew({ recipe: 'lesser-healing', count: 1 })).data.error.code, 'no_herbs');
    await set(`herbs = '{"comfrey":31,"mugwort":9}'`);
    assert.equal((await brew({ recipe: 'lesser-mana', count: 1 })).data.error.code, 'unknown_recipe');
    assert.equal((await brew({ recipe: 'lesser-healing', count: 0 })).data.error.code, 'invalid_count');
    assert.equal((await brew({ recipe: 'lesser-healing', count: 11 })).data.error.code, 'invalid_count');
    await set('hp = 1');
    const started = await brew({ recipe: 'lesser-healing', count: 10 });
    assert.equal(started.status, 201);
    const { activity, herbs, regen } = started.data.character;
    assert.equal(activity.kind, 'potions');
    assert.equal(activity.placeName, 'Systemowa Pracownia');
    assert.deepEqual(activity.potion, { id: 'lesser-healing', name: 'Mniejsza mikstura leczenia' });
    assert.equal(activity.count, 10);
    assert.equal(activity.minutes, 100);
    assert.deepEqual(herbs.map((herb) => [herb.id, herb.count]), [['comfrey', 1], ['mugwort', 9]]);
    assert.ok(regen, 'HP keeps coming back while brewing');
    const hunt = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 1 } });
    assert.equal(hunt.data.error.message, 'Postać warzy mikstury. Poczekaj na koniec warzenia.');
    assert.equal((await brew({ recipe: 'lesser-healing', count: 1 })).status, 409);
    // The bag stays at hand during the work (the author: "Niech system
    // pozwala na Wymianę i różne działania na przedmiotach w czasie zbierania
    // ziół itp."): the herbs left can be sold.
    assert.equal((await call('POST', '/api/herbs/sell', { cookie, body: { herbId: 'mugwort', count: 1 } })).status, 200);
  });

  test('the report brings the potions, the profession\'s levels and the character\'s XP', async () => {
    await set(`herbs = '{"comfrey":36}'`);
    await brew({ recipe: 'lesser-healing', count: 12 });
    await age(120);
    const claimed = await call('POST', '/api/hunts/claim', { cookie });
    assert.equal(claimed.status, 200);
    const { report, character: after } = claimed.data;
    assert.equal(report.kind, 'potions');
    assert.equal(report.minutes, 120);
    assert.equal(report.potion.count, 12 + report.potion.bonus);
    assert.equal(report.stopped, null);
    assert.equal(report.profession.levelAfter, 3);
    assert.deepEqual(report.revealed, ['lesser-mana']);
    assert.ok(report.summary.xp > 0);
    assert.equal(after.activity, null);
    assert.deepEqual(after.herbs, []);
    assert.deepEqual(after.potions.map((potion) => [potion.name, potion.count, potion.price]), [['Mniejsza mikstura leczenia', report.potion.count, 9]]);
    assert.equal(after.bagUsed, 1);
    assert.equal(after.professions.list[1].level, 3);
    assert.equal(after.stats.find((stat) => stat.id === 'intellect').sources.professions, 2);
    const { data } = await call('GET', '/api/reports', { cookie });
    assert.equal(data.reports[0].kind, 'potions');
    assert.equal((await call('POST', '/api/hunts/claim', { cookie })).status, 409);
  });

  test('called back early, the character keeps the potions done and gets the herbs for the rest', async () => {
    await set(`herbs = '{"comfrey":40}'`);
    await brew({ recipe: 'lesser-healing', count: 2 });
    const none = await call('POST', '/api/hunts/cancel', { cookie });
    assert.equal(none.status, 200);
    assert.equal(none.data.report, null);
    assert.deepEqual(none.data.character.herbs.map((herb) => herb.count), [40]);
    assert.equal(none.data.character.professions.list[1].xp, 0);

    await brew({ recipe: 'lesser-healing', count: 12 });
    await age(35);
    const stopped = await call('POST', '/api/hunts/cancel', { cookie });
    const { report, character: after } = stopped.data;
    assert.equal(report.kind, 'potions');
    assert.equal(report.minutes, 35);
    assert.equal(report.potion.count, 3 + report.potion.bonus);
    assert.equal(report.stopped, 'Warzenie przerwane. Zioła na resztę wróciły do plecaka.');
    assert.equal(report.profession.xp, 35);
    assert.equal(after.activity, null);
    assert.deepEqual(after.herbs.map((herb) => herb.count), [40 - 9]);
    assert.equal(after.potions[0].count, report.potion.count);
    assert.equal((await call('GET', '/api/reports', { cookie })).data.reports[0].kind, 'potions');
  });

  test('a recipe with a catalyst takes a piece of it a potion, of the grade chosen, and gives back the rest when stopped', async () => {
    await set(`professions = '{"alchemy":{"level":18,"xp":0}}', herbs = '{"calamus":60}', materials = '{"viper-scales:common":2,"viper-scales:rare":5,"wolf-pelt:rare":9}'`);
    const materials = async () => JSON.parse((await (await db()).prepare('SELECT materials FROM characters').first()).materials);
    const recipe = (await character()).professions.brewing.recipes.find((one) => one.name === content.potionsById.antidote.name);
    assert.equal(recipe.catalyst.id, 'viper-scales');
    assert.deepEqual(
      recipe.catalyst.stacks.map((stack) => [stack.key, stack.count, Math.round(stack.chance * 100)]),
      [
        ['viper-scales:common', 2, 5],
        ['viper-scales:rare', 5, 20],
      ],
    );
    assert.equal((await brew({ recipe: 'antidote', count: 1 })).data.error.code, 'no_catalyst');
    assert.equal((await brew({ recipe: 'antidote', count: 1, catalyst: 'wolf-pelt:rare' })).data.error.code, 'no_catalyst');
    assert.equal((await brew({ recipe: 'antidote', count: 1, catalyst: 'viper-scales:epic' })).data.error.code, 'no_catalyst');
    assert.equal((await brew({ recipe: 'antidote', count: 6, catalyst: 'viper-scales:rare' })).data.error.code, 'invalid_count');
    const started = await brew({ recipe: 'antidote', count: 4, catalyst: 'viper-scales:rare' });
    assert.equal(started.status, 201, JSON.stringify(started.data));
    assert.deepEqual(await materials(), { 'viper-scales:common': 2, 'viper-scales:rare': 1, 'wolf-pelt:rare': 9 });
    const back = await call('POST', '/api/hunts/cancel', { cookie });
    assert.equal(back.data.report, null);
    assert.deepEqual(await materials(), { 'viper-scales:common': 2, 'viper-scales:rare': 5, 'wolf-pelt:rare': 9 });
    // A whole brewing uses a piece a potion.
    await brew({ recipe: 'antidote', count: 2, catalyst: 'viper-scales:common' });
    await age(600);
    const claimed = await call('POST', '/api/hunts/claim', { cookie });
    assert.equal(claimed.data.report.potion.count, 2 + claimed.data.report.potion.bonus);
    assert.deepEqual(await materials(), { 'viper-scales:rare': 5, 'wolf-pelt:rare': 9 });
  });

  test('Time Points skip a brewing', async () => {
    await set(`herbs = '{"comfrey":3}'`);
    await brew({ recipe: 'lesser-healing', count: 1 });
    const skipped = await call('POST', '/api/time/skip', { cookie, body: { target: 'activity' } });
    assert.equal(skipped.status, 200);
    assert.equal(skipped.data.spent, 10);
    assert.equal((await call('POST', '/api/hunts/claim', { cookie })).data.report.kind, 'potions');
  });

  test('a full bag loses the potions that do not fit; potions sell to the scrapper or go away', async () => {
    // 29 items, a full stack of potions and 30 Żywokost (two places) leave no room.
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    for (let index = 0; index < 29; index++) {
      await database
        .prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)')
        .bind(id, JSON.stringify({ base: 'ring', slot: 'ring', level: 1, rarity: 'common', affixes: [] }))
        .run();
    }
    await set(`herbs = '{"comfrey":30}', potions = '{"lesser-healing":20}'`);
    await brew({ recipe: 'lesser-healing', count: 1 });
    await age(10);
    const { report, character: after } = (await call('POST', '/api/hunts/claim', { cookie })).data;
    assert.equal(report.potion.stored, 0);
    assert.equal(report.potion.lost, report.potion.count);
    assert.match(report.lost, /^Plecak był pełny\. Nie zmieściło się: \d+ × Mniejsza mikstura leczenia\.$/);
    assert.equal(after.potions[0].count, 20);
    assert.equal(after.bagUsed, 29 + 2 + 1);

    const gold = after.gold;
    const sold = await call('POST', '/api/potions/sell', { cookie, body: { potionId: 'lesser-healing', count: 5 } });
    assert.equal(sold.status, 200);
    assert.deepEqual(sold.data.sold, { count: 5, gold: 45 });
    assert.equal(sold.data.character.gold, gold + 45);
    assert.equal(sold.data.character.potions[0].count, 15);
    assert.equal((await call('POST', '/api/potions/sell', { cookie, body: { potionId: 'lesser-healing', count: 16 } })).status, 400);
    assert.equal((await call('POST', '/api/potions/sell', { cookie, body: { potionId: 'lesser-mana', count: 1 } })).status, 404);
    const thrown = await call('POST', '/api/potions/discard', { cookie, body: { potionId: 'lesser-healing', count: 15 } });
    assert.deepEqual(thrown.data.character.potions, []);
    assert.equal(thrown.data.character.bagUsed, 31);
  });
});

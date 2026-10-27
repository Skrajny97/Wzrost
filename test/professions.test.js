// Professions: Zielarstwo in the engine (levels, stats, herbs, the bag, the
// report, quests and notifications) and through the API, where the
// professions show only with PROFESSIONS on.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  addQuestProgress,
  applyWork,
  computeStats,
  drawQuests,
  expectedHerbs,
  gatherHerbs,
  gatheringMinutes,
  gatheringReport,
  herbSlots,
  herbStacks,
  knownHerbs,
  notificationsDue,
  professionStats,
  professionXpToNext,
  questText,
  storeHerbs,
  workProfession,
  workXp,
  xpPerHour,
  xpToNext,
} from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const herbalism = content.professionsById.herbalism;

// The hours of work from level 1 to `level`.
function hoursTo(level) {
  let state = { level: 1, xp: 0 };
  let minutes = 0;
  while (state.level < level) {
    const need = professionXpToNext(herbalism, state.level) - state.xp;
    minutes += need;
    state = workProfession(herbalism, state, need);
  }
  return minutes / 60;
}

describe('herbalism in the engine', () => {
  test('a level takes half an hour more of work than the one before, up to 100', () => {
    assert.equal(professionXpToNext(herbalism, 1), 30);
    assert.equal(professionXpToNext(herbalism, 9), 270);
    assert.equal(hoursTo(3), 1.5);
    assert.equal(hoursTo(5), 5);
    assert.equal(hoursTo(10), 22.5);
    assert.equal(hoursTo(100), 2475);
    const top = workProfession(herbalism, { level: 100, xp: 0 }, 600);
    assert.deepEqual(top, { level: 100, xp: 0, levels: 0 });
  });

  test('level 1 gives no stats, each level after it +1 to Mądrość and Percepcja, and level 100 +51 more', () => {
    assert.equal(professionStats({}, content).wisdom, 0);
    const third = professionStats({ herbalism: { level: 3, xp: 0 } }, content);
    assert.equal(third.wisdom, 2);
    assert.equal(third.perception, 2);
    assert.equal(professionStats({ herbalism: { level: 99, xp: 0 } }, content).wisdom, 98);
    const master = professionStats({ herbalism: { level: 100, xp: 0 } }, content);
    assert.deepEqual([master.wisdom, master.perception], [150, 150]);
    const character = newCharacter('warrior', { professions: { herbalism: { level: 4, xp: 0 } } });
    const { sources, totals } = computeStats(character, [], content);
    assert.equal(sources.perception.professions, 3);
    assert.equal(totals.perception, computeStats(newCharacter('warrior'), [], content).totals.perception + 3);
  });

  test('the System shows Żywokost first, Bylica from level 3 and Pokrzywa from 5', () => {
    const names = (level) => knownHerbs(level, content).map((herb) => herb.name);
    assert.deepEqual(names(1), ['Żywokost']);
    assert.deepEqual(names(3), ['Żywokost', 'Bylica']);
    assert.deepEqual(names(5), ['Żywokost', 'Bylica', 'Pokrzywa']);
    assert.deepEqual([1, 9, 10, 24, 25, 50].map((level) => herbSlots(level, content)), [1, 1, 2, 2, 3, 4]);
  });

  test('the slider goes from 10 minutes to 8 hours in steps of 10', () => {
    const minutes = gatheringMinutes(content);
    assert.equal(minutes[0], 10);
    assert.equal(minutes.at(-1), 480);
    assert.equal(minutes.length, 48);
  });

  test('about 6 Żywokost an hour at level 1, twice as many at 50, the time shared among the herbs', () => {
    assert.equal(expectedHerbs(['comfrey'], 60, 1, content).comfrey.expected, 6);
    assert.ok(Math.abs(expectedHerbs(['comfrey'], 60, 50, content).comfrey.expected - 11.88) < 1e-9);
    const shared = expectedHerbs(['comfrey', 'mugwort'], 60, 10, content);
    assert.ok(Math.abs(shared.comfrey.expected - 3.54) < 1e-9);
    assert.ok(Math.abs(shared.mugwort.expected - 2.95) < 1e-9);
    // The same seed gathers the same; the counts stay within the spread.
    const night = { herbIds: ['comfrey'], minutes: 480, level: 1, seed: 'noc' };
    assert.deepEqual(gatherHerbs(night, content), gatherHerbs(night, content));
    for (let index = 0; index < 50; index++) {
      const { comfrey } = gatherHerbs({ ...night, seed: `s${index}` }, content);
      assert.ok(comfrey >= 40 && comfrey <= 56, String(comfrey));
    }
    // Even ten minutes brings something.
    for (let index = 0; index < 50; index++) {
      const found = gatherHerbs({ herbIds: ['nettle'], minutes: 10, level: 5, seed: `k${index}` }, content);
      assert.ok(found.nettle >= 1);
    }
  });

  test('herbs stack 20 to a place: a full bag keeps what fits and loses the rest', () => {
    assert.equal(herbStacks({}, content), 0);
    assert.equal(herbStacks({ comfrey: 20, mugwort: 21 }, content), 3);
    // 17 Żywokost leave room for 3 in their stack, and one free place holds 20 more.
    const { herbs, stored, lost } = storeHerbs({ comfrey: 17 }, { comfrey: 10, mugwort: 25 }, 1, content);
    assert.deepEqual(herbs, { comfrey: 27 });
    assert.deepEqual(stored, { comfrey: 10 });
    assert.deepEqual(lost, { mugwort: 25 });
    assert.deepEqual(storeHerbs({}, { comfrey: 45 }, 2, content), { herbs: { comfrey: 40 }, stored: { comfrey: 40 }, lost: { comfrey: 5 } });
    assert.deepEqual(storeHerbs({ comfrey: 20 }, { comfrey: 3 }, 0, content).lost, { comfrey: 3 });
  });

  test('work gives the character a small share of the XP of exploring, and a level heals', () => {
    // The author: the XP from a profession is a small bonus, so exploring stays the choice.
    assert.equal(workXp(10, 60, content), Math.round(xpPerHour(10, content) * 0.025));
    assert.ok(workXp(12, 480, content) < xpToNext(12, content));
    const character = newCharacter('archer', { level: 10, xp: xpToNext(10, content) - 100 });
    const work = applyWork(character, workXp(10, 480, content), content);
    assert.ok(work.level > 10);
    assert.ok(work.levelled);
    assert.equal(work.timePoints, content.balance.timePoints.perLevel * (work.level - 10));
    // The same lines as after an exploration, one gain to a line.
    assert.deepEqual(work.messages.slice(0, 4), [
      `Osiągnięto poziom: ${work.level}`,
      `Zdobyto wolne punkty statystyk: +${8 * (work.level - 10)}`,
      `Zdobyto Punkty Czasu: +${work.timePoints}`,
      'Awansowałeś. Twoje HP i Mana odnowiły się.',
    ]);
    assert.deepEqual(applyWork(character, 1, content).messages, []);
  });

  test('the report: a line of the grove, what was found and lost, levels and the herbs revealed', () => {
    const character = newCharacter('mage', { level: 12, xp: 0 });
    const before = { level: 2, xp: 0 };
    const after = workProfession(herbalism, before, 90);
    const work = applyWork(character, 10, content);
    const report = gatheringReport(
      {
        minutes: 120,
        startedAt: 0,
        endsAt: 7200000,
        seed: 'r',
        found: { comfrey: 13 },
        stored: { comfrey: 10 },
        lost: { comfrey: 3 },
        before,
        after,
        character,
        xp: 10,
        work,
      },
      content,
    );
    assert.equal(report.kind, 'herbs');
    assert.equal(report.placeName, 'Systemowy Zagajnik');
    assert.ok(content.professionTexts.report.includes(report.line));
    assert.equal(report.gathered, 'Zebrano: 13 × Żywokost.');
    assert.equal(report.lost, 'Plecak był pełny. Nie zmieściło się: 3 × Żywokost.');
    assert.equal(after.level, 3);
    assert.deepEqual(report.revealed, ['mugwort']);
    assert.deepEqual(report.system, ['Osiągnięto poziom Zielarstwa: 3', 'Zdobyto Mądrość: +1', 'Zdobyto Percepcję: +1', 'System odsłania nowe zioło: Bylica']);
    // The last level brings the master's bonus with it: +1 and +51.
    const top = { level: 99, xp: 0 };
    const mastered = gatheringReport(
      { minutes: 480, startedAt: 0, endsAt: 1, seed: 'm', found: { comfrey: 1 }, stored: { comfrey: 1 }, lost: {}, before: top, after: workProfession(herbalism, top, 99 * 30), character, xp: 0, work },
      content,
    );
    assert.deepEqual(mastered.system.slice(0, 3), ['Osiągnięto poziom Zielarstwa: 100', 'Zdobyto Mądrość: +52', 'Zdobyto Percepcję: +52']);
  });

  test('herb quests come with the professions, name only known herbs and count what was gathered', () => {
    const character = newCharacter('warrior', { level: 12, classLevel: 14, professions: { herbalism: { level: 1, xp: 0 } } });
    const drawn = (hasProfessions, periodId) =>
      Array.from({ length: 40 }, (_, index) => drawQuests(periodId, { character, hasTable: true, hasProfessions, seed: `q${index}` }, content)).flat();
    assert.ok(!drawn(false, 'daily').some((quest) => quest.kind.startsWith('gather')));
    const daily = drawn(true, 'daily').filter((quest) => quest.kind === 'gather');
    assert.ok(daily.length > 0);
    assert.ok(daily.every((quest) => quest.target === 'comfrey' && quest.count === 12));
    assert.equal(questText(daily[0], content), 'Zbierz 12 sztuk Żywokostu.');
    const weekly = drawn(true, 'weekly').filter((quest) => quest.kind.startsWith('gather'));
    assert.ok(weekly.length > 0 && weekly.every((quest) => quest.kind === 'gatherAny' && quest.count === 60));
    assert.equal(questText(weekly[0], content), 'Zbierz łącznie 60 ziół.');
    const quests = {
      daily: { period: 'd', chest: false, quests: [{ kind: 'gather', target: 'comfrey', count: 12, progress: 5, claimed: false }] },
      weekly: { period: 'w', chest: false, quests: [{ kind: 'gatherAny', count: 60, progress: 0, claimed: false }] },
    };
    const moved = addQuestProgress(quests, { herbs: { comfrey: 9, mugwort: 4 } });
    assert.equal(moved.daily.quests[0].progress, 12);
    assert.equal(moved.weekly.quests[0].progress, 13);
  });

  test('the end of a gathering comes as a phone notification', () => {
    const activity = { kind: 'herbs', areaId: 'system-grove', endsAt: 2000 };
    const [due] = notificationsDue({ level: 12, activity, buildings: {}, queue: [] }, 1000, 3000, content);
    assert.equal(due.title, 'Koniec zbierania');
    assert.equal(due.body, 'Zbiór ziół zakończony: Systemowy Zagajnik. Raport czeka na odbiór.');
    assert.equal(due.url, '#/profesje/zielarstwo');
  });
});

describe('herbalism through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('zielarka'));
    await call('POST', '/api/character', { cookie, body: { name: 'Zielarka', classId: 'cleric', appearance: 'female' } });
  });

  const atLevel = async (level) => (await db()).prepare('UPDATE characters SET level = ?, xp = 0').bind(level).run();
  // Moves the current activity into the past, as if its time had passed.
  const finish = async () => (await db()).prepare('UPDATE activities SET started_at = started_at - 86400000, ends_at = ?').bind(Date.now() - 1).run();
  const gather = (body) => call('POST', '/api/professions/gather', { cookie, body });

  test('professions open at level 10', async () => {
    const before = await call('GET', '/api/character', { cookie });
    assert.equal(before.data.character.professions, null);
    assert.equal((await gather({ herbs: ['comfrey'], minutes: 60 })).status, 403);
    await atLevel(10);
    const { data } = await call('GET', '/api/character', { cookie });
    const { list, gathering } = data.character.professions;
    assert.deepEqual(list.map((profession) => [profession.name, profession.level, profession.soon]), [
      ['Zielarstwo', 1, false],
      ['Alchemia', 1, true],
      ['Rzemieślnictwo', 1, true],
    ]);
    assert.equal(gathering.place.name, 'Systemowy Zagajnik');
    assert.equal(gathering.slots, 1);
    assert.deepEqual(gathering.herbs.map((herb) => herb.name ?? herb.hint), [
      'Żywokost',
      'Ukryte przez System do 3. poziomu Zielarstwa.',
      'Ukryte przez System do 5. poziomu Zielarstwa.',
    ]);
  });

  test('a gathering checks the herbs and the time', async () => {
    await atLevel(10);
    assert.equal((await gather({ herbs: ['mugwort'], minutes: 60 })).data.error.code, 'unknown_herb');
    assert.equal((await gather({ herbs: ['comfrey', 'comfrey'], minutes: 60 })).data.error.code, 'invalid_herbs');
    await (await db()).prepare(`UPDATE characters SET professions = '{"herbalism":{"level":5,"xp":0}}'`).run();
    assert.equal((await gather({ herbs: ['comfrey', 'nettle'], minutes: 60 })).data.error.code, 'too_many_herbs');
    assert.equal((await gather({ herbs: ['nettle'], minutes: 45 })).data.error.code, 'invalid_duration');
    assert.equal((await gather({ herbs: ['nettle'], minutes: 490 })).data.error.code, 'invalid_duration');
    assert.equal((await gather({ herbs: ['nettle'], minutes: 480 })).status, 201);
  });

  test('while gathering the character rests, cannot explore, and the report brings herbs, XP and levels', async () => {
    await atLevel(10);
    await (await db()).prepare('UPDATE characters SET hp = 1').run();
    const started = await gather({ herbs: ['comfrey'], minutes: 150 });
    assert.equal(started.status, 201);
    const { character } = started.data;
    assert.equal(character.activity.kind, 'herbs');
    assert.equal(character.activity.placeName, 'Systemowy Zagajnik');
    assert.deepEqual(character.activity.herbs, [{ id: 'comfrey', name: 'Żywokost' }]);
    assert.ok(character.regen, 'HP keeps coming back while gathering');
    const hunt = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 1 } });
    assert.equal(hunt.status, 409);
    assert.equal(hunt.data.error.message, 'Postać zbiera zioła. Poczekaj na koniec zbierania.');

    // The hours of gathering pass for resting too.
    await finish();
    await (await db()).prepare('UPDATE characters SET hp_at = hp_at - 9000000').run();
    const claimed = await call('POST', '/api/hunts/claim', { cookie });
    assert.equal(claimed.status, 200);
    const { report, character: after } = claimed.data;
    assert.equal(report.kind, 'herbs');
    const comfrey = report.herbs[0].count;
    assert.ok(comfrey >= 12 && comfrey <= 18, String(comfrey));
    assert.equal(report.profession.levelAfter, 3);
    assert.deepEqual(report.revealed, ['mugwort']);
    assert.ok(report.summary.xp > 0);
    assert.equal(after.activity, null);
    assert.deepEqual(after.herbs.map((herb) => [herb.name, herb.count]), [['Żywokost', comfrey]]);
    assert.equal(after.bagUsed, Math.ceil(comfrey / 20));
    assert.equal(after.professions.list[0].level, 3);
    assert.equal(after.stats.find((stat) => stat.id === 'wisdom').sources.professions, 2);
    assert.ok(after.hp > 1);
    // The journal lists it with its summary.
    const { data } = await call('GET', '/api/reports', { cookie });
    assert.equal(data.reports[0].kind, 'herbs');
    assert.equal((await call('POST', '/api/hunts/claim', { cookie })).status, 409);
  });

  test('calling back early gives nothing, and Time Points skip the gathering', async () => {
    await atLevel(10);
    await gather({ herbs: ['comfrey'], minutes: 60 });
    assert.equal((await call('POST', '/api/hunts/cancel', { cookie })).status, 200);
    const { data } = await call('GET', '/api/character', { cookie });
    assert.equal(data.character.activity, null);
    assert.deepEqual(data.character.herbs, []);
    assert.equal(data.character.professions.list[0].xp, 0);

    await gather({ herbs: ['comfrey'], minutes: 10 });
    const skipped = await call('POST', '/api/time/skip', { cookie, body: { target: 'activity' } });
    assert.equal(skipped.status, 200);
    assert.equal(skipped.data.spent, 10);
    assert.equal((await call('POST', '/api/hunts/claim', { cookie })).data.report.kind, 'herbs');
  });

  test('a full bag loses what does not fit; herbs sell to the scrapper or go away', async () => {
    await atLevel(10);
    // 29 items and 15 Żywokost leave room for 5 more Żywokost and one place.
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    for (let index = 0; index < 29; index++) {
      await database
        .prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)')
        .bind(id, JSON.stringify({ base: 'ring', slot: 'ring', level: 1, rarity: 'common', affixes: [] }))
        .run();
    }
    await database.prepare(`UPDATE characters SET herbs = '{"comfrey":15}'`).run();
    await gather({ herbs: ['comfrey'], minutes: 480 });
    await finish();
    const { report, character } = (await call('POST', '/api/hunts/claim', { cookie })).data;
    const found = report.herbs[0].count;
    assert.equal(report.herbs[0].stored, 5);
    assert.equal(report.herbs[0].lost, found - 5);
    assert.match(report.lost, /^Plecak był pełny\. Nie zmieściło się: \d+ × Żywokost\.$/);
    assert.equal(character.herbs[0].count, 20);
    assert.equal(character.bagUsed, 30);

    const gold = character.gold;
    const sold = await call('POST', '/api/herbs/sell', { cookie, body: { herbId: 'comfrey', count: 5 } });
    assert.equal(sold.status, 200);
    assert.deepEqual(sold.data.sold, { count: 5, gold: 10 });
    assert.equal(sold.data.character.gold, gold + 10);
    assert.equal(sold.data.character.herbs[0].count, 15);
    assert.equal((await call('POST', '/api/herbs/sell', { cookie, body: { herbId: 'comfrey', count: 16 } })).status, 400);
    const thrown = await call('POST', '/api/herbs/discard', { cookie, body: { herbId: 'comfrey', count: 15 } });
    assert.deepEqual(thrown.data.character.herbs, []);
    assert.equal(thrown.data.character.bagUsed, 29);
  });
});

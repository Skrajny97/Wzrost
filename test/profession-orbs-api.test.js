// Kulki Profesji over the scene of a work (DECISIONS.md, „Kulki Profesji
// (24.11.2026)”): the page gets the moments of the orbs of the character's
// own work under way, never what they give, and a tap catches one within
// its window by the server's clock, once, while the day has orbs of their
// own left, only on a work of the character's own that still runs; one
// atomic write.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { questPeriod, workOrbProducts, workOrbReward, workOrbTimes } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const DAY = 24 * 3600000;
const SECOND = 1000;
const LEVEL = 30;
const NAME = 'Zielarka';

describe('Kulki Profesji', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', TEST_CLOCK: 'on' });
  // Noon of a day ten days on, Polish time: the work begins then.
  const start = questPeriod('daily', Date.now() + 10 * DAY, content).startsAt + 12 * 3600000;
  const today = questPeriod('daily', start, content).key;
  let cookie;

  const sql = async (statement, ...binds) => (await db()).prepare(statement).bind(...binds).run();
  const row = async (name = NAME) => (await db()).prepare('SELECT * FROM characters WHERE name = ?').bind(name).first();
  const work = async (name = NAME) => (await db()).prepare('SELECT * FROM activities WHERE character_id = (SELECT id FROM characters WHERE name = ?)').bind(name).first();
  const setSeed = (seed) => sql(`UPDATE activities SET seed = ?, options = json_remove(options, '$.orbs') WHERE character_id = (SELECT id FROM characters WHERE name = '${NAME}')`, seed);
  const claim = (index, now, who = cookie) => call('POST', '/api/professions/orb', { cookie: who, body: { index }, now });
  const gather = (who = cookie, herbs = ['comfrey']) => call('POST', '/api/professions/gather', { cookie: who, body: { herbs, minutes: 60 }, now: start });
  // The work's orbs, by the engine, from its row: when each comes and what
  // it gives.
  async function orbs() {
    const activity = await work();
    const at = workOrbTimes({ seed: activity.seed, minutes: activity.minutes, startedAt: activity.started_at, endsAt: activity.ends_at }, content);
    const products = workOrbProducts({ kind: 'herbs', options: JSON.parse(activity.options), level: 1 }, content);
    const reward = (index) => workOrbReward({ seed: activity.seed, index, kind: 'herbs', level: LEVEL, classLevel: LEVEL + 2, products }, content);
    return { at, reward };
  }
  // The first seed of the list whose first orb gives `kind` to a gathering
  // of Żywokost.
  const seedFor = (kind) => {
    const products = workOrbProducts({ kind: 'herbs', options: { herbs: ['comfrey'] }, level: 1 }, content);
    for (let index = 0; index < 500; index += 1) {
      const seed = `work-orb-test-${index}`;
      if (workOrbReward({ seed, index: 0, kind: 'herbs', level: LEVEL, products }, content).kind === kind) return seed;
    }
    throw new Error(`no seed for ${kind}`);
  };

  async function newCharacter(login, name) {
    const { cookie: own } = await signUp(login);
    await call('POST', '/api/character', { cookie: own, body: { name, classId: 'cleric', appearance: 'female' } });
    await sql('UPDATE characters SET level = ?, class_level = ?, hp = 99999, hp_at = ? WHERE name = ?', LEVEL, LEVEL + 2, start - 60000, name);
    return own;
  }
  // The work begun, its first orb of `kind`: when it comes.
  async function begin(kind) {
    const answer = await gather();
    assert.equal(answer.status, 201, JSON.stringify(answer.data));
    if (kind) await setSeed(seedFor(kind));
    return orbs();
  }

  beforeEach(async () => {
    cookie = await newCharacter('zielarka', NAME);
  });

  test('the page gets when the orbs come, never what they give; the levels the work began with are kept', async () => {
    const answer = await gather();
    assert.equal(answer.status, 201, JSON.stringify(answer.data));
    const view = answer.data.character.activity.orbs;
    const { at } = await orbs();
    assert.equal(at.length, 6);
    assert.deepEqual(view, { at, claimed: [], left: 8, resetsAt: questPeriod('daily', start, content).endsAt });
    assert.ok(!/resource|product|xp|time|kind|reward/i.test(Object.keys(view).join(' ')));
    assert.deepEqual(JSON.parse((await work()).options).levels, { level: LEVEL, classLevel: LEVEL + 2 });
    // None once the work has ended: its report waits.
    await sql(`UPDATE activities SET ends_at = ? WHERE character_id = (SELECT id FROM characters WHERE name = '${NAME}')`, start + 30 * SECOND);
    const after = await call('GET', '/api/character', { cookie, now: start + 31 * SECOND });
    assert.equal(after.data.character.activity.orbs, undefined);
  });

  test('a tap within the window catches the orb: its resources, once, kept with the work and the day', async () => {
    const { at, reward } = await begin('resources');
    const given = reward(0);
    assert.equal(given.kind, 'resources');
    const first = await row();
    const before = JSON.parse(first.resources)[given.resource] ?? 0;
    // The character's level after the start counts for nothing.
    await sql('UPDATE characters SET level = ? WHERE name = ?', LEVEL * 2, NAME);
    const answer = await claim(0, at[0] + 3 * SECOND);
    assert.equal(answer.status, 200, JSON.stringify(answer.data));
    assert.deepEqual(answer.data.orb, {
      index: 0,
      ...given,
      text: `Kulka Profesji: +${given.amount} ${content.resourcesById[given.resource].genitive}`,
    });
    const after = await row();
    assert.equal(JSON.parse(after.resources)[given.resource], before + given.amount);
    // Never Punkty Systemu, nor gold.
    assert.deepEqual([after.system_points, after.gold], [first.system_points, first.gold]);
    assert.deepEqual(JSON.parse(after.profession_orbs), { day: today, count: 1 });
    // The Kulki Systemu's own count stays as it was.
    assert.equal(after.orbs, null);
    assert.deepEqual(JSON.parse((await work()).options).orbs, [0]);
    assert.deepEqual(answer.data.character.activity.orbs.claimed, [0]);
    assert.equal(answer.data.character.activity.orbs.left, 7);
    // The same tap again: the game's usual 409, nothing more.
    const again = await claim(0, at[0] + 4 * SECOND);
    assert.equal(again.status, 409);
    assert.equal(again.data.error.code, 'orb_claimed');
    assert.equal((await row()).resources, after.resources);
  });

  test("a few of the work's own herb into the bag; with the bag full, lost, and the words say so", async () => {
    let { at, reward } = await begin('product');
    const given = reward(0);
    assert.deepEqual([given.kind, given.product, given.store], ['product', 'comfrey', 'herbs']);
    const answer = await claim(0, at[0] + SECOND);
    assert.equal(answer.status, 200, JSON.stringify(answer.data));
    assert.equal(answer.data.orb.text, `Kulka Profesji: +${given.amount} × Żywokost`);
    assert.equal(JSON.parse((await row()).herbs).comfrey, given.amount);

    // A bag full of another herb: the orb's herbs do not fit.
    await sql(`UPDATE characters SET herbs = '{"mugwort": 2000}' WHERE name = ?`, NAME);
    await setSeed(seedFor('product'));
    ({ at, reward } = await orbs());
    const full = await claim(0, at[0] + SECOND);
    assert.equal(full.status, 200, JSON.stringify(full.data));
    const amount = reward(0).amount;
    assert.equal(full.data.orb.lost, amount);
    assert.equal(full.data.orb.text, `Kulka Profesji: +${amount} × Żywokost. Plecak jest pełny, nie zmieściło się: ${amount} × Żywokost.`);
    assert.deepEqual(JSON.parse((await row()).herbs), { mugwort: 2000 });
  });

  test("minutes of the profession's work: its XP and the level it brings, by the work's own path", async () => {
    await sql(`UPDATE characters SET professions = '{"herbalism":{"level":5,"xp":0}}' WHERE name = ?`, NAME);
    let { at } = await begin('xp');
    const answer = await claim(0, at[0] + SECOND);
    assert.equal(answer.status, 200, JSON.stringify(answer.data));
    const { xp } = answer.data.orb;
    assert.ok(xp >= content.orbs.professions.xpMinutes, String(xp));
    assert.equal(answer.data.orb.text, `Kulka Profesji: +${xp} XP Zielarstwa`);
    assert.deepEqual(JSON.parse((await row()).professions).herbalism, { level: 5, xp });
    // At the first level the minutes make the next one: a new level, and its stats.
    await sql(`UPDATE characters SET professions = '{"herbalism":{"level":1,"xp":0}}', profession_orbs = NULL WHERE name = ?`, NAME);
    await setSeed(seedFor('xp'));
    ({ at } = await orbs());
    const level = await claim(0, at[0] + SECOND);
    assert.equal(level.status, 200, JSON.stringify(level.data));
    assert.equal(level.data.orb.level, 2);
    assert.match(level.data.orb.text, /^Kulka Profesji: \+\d+ XP Zielarstwa, nowy poziom: 2\.$/);
    const herbalism = level.data.character.professions.list.find((profession) => profession.id === 'herbalism');
    assert.equal(herbalism.level, 2);
  });

  test('Punkty Czasu, as the engine draws them', async () => {
    const { at, reward } = await begin('time');
    const before = await call('GET', '/api/character', { cookie, now: at[0] + SECOND });
    const answer = await claim(0, at[0] + SECOND);
    assert.equal(answer.status, 200, JSON.stringify(answer.data));
    const points = reward(0).timePoints;
    assert.equal(answer.data.character.timePoints - before.data.character.timePoints, points);
    assert.match(answer.data.orb.text, new RegExp(`^Kulka Profesji: \\+${points} Punkt(y|ów)? Czasu$`));
  });

  test('too early, too late, a number it has not got', async () => {
    const { at } = await begin();
    const early = await claim(1, at[1] - 2 * SECOND - 1);
    assert.equal(early.status, 409);
    assert.equal(early.data.error.code, 'orb_early');
    assert.equal(early.data.error.message, 'Ta Kulka Profesji jeszcze nie nadleciała.');
    const late = await claim(1, at[1] + 20 * SECOND + 1);
    assert.equal(late.status, 409);
    assert.equal(late.data.error.code, 'orb_gone');
    // Two seconds early, for the clocks, and twenty late, for the network.
    assert.equal((await claim(1, at[1] - 2 * SECOND)).status, 200);
    assert.equal((await claim(2, at[2] + 20 * SECOND)).status, 200);
    for (const index of [6, -1, 1.5, '0', null]) {
      const wrong = await claim(index, at[0]);
      assert.equal(wrong.status, 404, String(index));
      assert.equal(wrong.data.error.code, 'no_orb');
    }
    assert.equal(JSON.parse((await row()).profession_orbs).count, 2);
  });

  test("eight a day of their own, apart from the Kulki Systemu's; a new day from midnight Polish time", async () => {
    const { at } = await begin();
    // The day's eight Kulki Systemu leave the Kulki Profesji be.
    await sql('UPDATE characters SET orbs = ? WHERE name = ?', JSON.stringify({ day: today, count: 8 }), NAME);
    assert.equal((await claim(0, at[0] + SECOND)).status, 200);
    await sql('UPDATE characters SET profession_orbs = ? WHERE name = ?', JSON.stringify({ day: today, count: 8 }), NAME);
    const capped = await claim(1, at[1] + SECOND);
    assert.equal(capped.status, 409);
    assert.equal(capped.data.error.code, 'orb_limit');
    assert.equal(capped.data.error.message, 'Na dziś to już wszystkie Kulki Profesji (8). Następne po północy.');
    const view = await call('GET', '/api/character', { cookie, now: at[1] + SECOND });
    assert.equal(view.data.character.activity.orbs.left, 0);
    // Yesterday's eight leave today's all.
    const yesterday = questPeriod('daily', start - DAY, content).key;
    await sql('UPDATE characters SET profession_orbs = ? WHERE name = ?', JSON.stringify({ day: yesterday, count: 8 }), NAME);
    assert.equal((await claim(1, at[1] + SECOND)).status, 200);
    assert.deepEqual(JSON.parse((await row()).profession_orbs), { day: today, count: 1 });
  });

  test('two taps at once catch it once', async () => {
    const { at } = await begin('resources');
    const answers = await Promise.all([claim(0, at[0] + SECOND), claim(0, at[0] + SECOND)]);
    assert.deepEqual(answers.map((answer) => answer.status).sort(), [200, 409]);
    assert.deepEqual(JSON.parse((await row()).profession_orbs), { day: today, count: 1 });
    assert.deepEqual(JSON.parse((await work()).options).orbs, [0]);
  });

  test("only a work of the character's own that still runs: none at home, on an exploration, on another's work, after its end", async () => {
    const home = await claim(0, start);
    assert.equal(home.status, 409);
    assert.equal(home.data.error.code, 'no_work');
    assert.equal(home.data.error.message, 'Kulki Profesji pojawiają się tylko w czasie pracy postaci w profesji.');
    // An exploration has Kulki Systemu, not these.
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 60 }, now: start })).status, 201);
    assert.equal((await claim(0, start + 5 * 60000)).data.error.code, 'no_work');
    await sql(`DELETE FROM activities WHERE character_id = (SELECT id FROM characters WHERE name = '${NAME}')`);
    const { at } = await begin();
    // Another character, at home, has no orb to catch; the work's stays.
    const other = await newCharacter('inna', 'Inna');
    assert.equal((await claim(0, at[0] + SECOND, other)).data.error.code, 'no_work');
    assert.equal(JSON.parse((await work()).options).orbs, undefined);
    // Once the work has ended, its report waits: no orbs.
    await sql(`UPDATE activities SET ends_at = ? WHERE character_id = (SELECT id FROM characters WHERE name = '${NAME}')`, at[0] + 5 * SECOND);
    assert.equal((await claim(0, at[0] + 6 * SECOND)).data.error.code, 'no_work');
  });

  test("none over the Awatar Systemu's work", async () => {
    await sql('UPDATE characters SET gold = 10000 WHERE name = ?', NAME);
    assert.equal((await call('POST', '/api/avatar/buy', { cookie, now: start })).status, 200);
    const started = await call('POST', '/api/professions/gather', { cookie, body: { herbs: ['comfrey'], minutes: 60, avatar: true }, now: start });
    assert.equal(started.status, 201, JSON.stringify(started.data));
    const { activity, professions } = started.data.character;
    assert.equal(activity, null);
    assert.equal(professions.avatar.activity.kind, 'herbs');
    assert.equal(professions.avatar.activity.orbs, undefined);
    assert.equal((await claim(0, start + 5 * 60000)).data.error.code, 'no_work');
  });

  test("test mode's orb soon: the work moves on till its next orb comes in the seconds asked", async () => {
    await begin();
    const now = start + 30 * SECOND;
    const answer = await call('POST', '/api/test/orb', { cookie, body: { seconds: 3 }, now });
    assert.equal(answer.status, 200, JSON.stringify(answer.data));
    const view = answer.data.character.activity.orbs;
    assert.ok(view.at.includes(now + 3 * SECOND));
    assert.equal((await claim(view.at.indexOf(now + 3 * SECOND), now + 4 * SECOND)).status, 200);
  });
});

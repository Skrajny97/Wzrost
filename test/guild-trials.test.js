// The Próby Gildii (src/engine/guild-trials.js, src/server/guild-trials.js;
// the author's 345 A): a guild's board of a week, the same for its members
// and drawn from the guild and the week; one trial at a time, sized to the
// taker's level, locked while its part of the game is shut; what a claimed
// exploration brings moves it on in the same batch; the bar of finished
// trials with thresholds from the members active when the board was drawn
// and each member's trials up to the cap; and the chests, once and only for
// those who finished a trial that week.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { drawTrialBoard, questPeriod, trialChest, trialCount, trialGains, trialLock, trialPoints, trialText, trialThresholds, weekShare } from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rules = content.guilds.trials;

describe('the Próby Gildii', () => {
  test('a board is drawn from its seed: the same guild and week, the same board; no kind and size twice', () => {
    const board = drawTrialBoard('7:2026-11-02', content);
    assert.deepEqual(drawTrialBoard('7:2026-11-02', content), board);
    assert.notDeepEqual(drawTrialBoard('8:2026-11-02', content), board);
    assert.notDeepEqual(drawTrialBoard('7:2026-11-09', content), board);
    assert.equal(board.length, rules.board);
    assert.equal(new Set(board.map((trial) => `${trial.kind}/${trial.size}`)).size, board.length);
    const kinds = rules.kinds.map((kind) => kind.id);
    for (const trial of board) {
      assert.ok(kinds.includes(trial.kind));
      assert.ok(trial.roll >= 0 && trial.roll < 1);
    }
    // In the order of the kinds.
    const order = board.map((trial) => kinds.indexOf(trial.kind));
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
  });

  test('a trial asks for more at a higher level and in its bigger size, at least one step', () => {
    const explore = { kind: 'explore', size: 0, roll: 0 };
    const low = newCharacter('warrior', { level: 5, classLevel: 5 });
    const high = newCharacter('warrior', { level: 250, classLevel: 100 });
    const tuning = rules.kinds.find((kind) => kind.id === 'explore');
    assert.equal(trialCount(explore, high, content), tuning.count[0]);
    assert.equal(trialCount(explore, low, content), Math.max(tuning.step, Math.round((tuning.count[0] * weekShare(5, 7, content)) / tuning.step) * tuning.step));
    assert.ok(trialCount({ ...explore, size: 1 }, low, content) > trialCount(explore, low, content));
    assert.ok(trialCount({ ...explore, roll: 0.99 }, high, content) === tuning.count[1]);
    // Creatures: as many as the fights bring where the class goes now.
    const kill = { kind: 'killAny', size: 0, roll: 0 };
    assert.ok(trialCount(kill, high, content) > trialCount(kill, low, content));
    assert.ok(trialCount(kill, low, content) >= 1);
    assert.equal(trialText('explore', 45, content), 'Spędź na wyprawach łącznie 45 minut.');
    assert.equal(trialText('killAny', 1, content), 'Pokonaj łącznie 1 stwora.');
    assert.equal(trialCount({ kind: 'gone', size: 0, roll: 0 }, low, content), null);
  });

  test('a trial whose part of the game the character does not have yet says why', () => {
    assert.equal(trialLock('explore', {}, content), null);
    assert.equal(trialLock('towers', { towers: true }, content), null);
    assert.equal(trialLock('towers', { towers: false }, content), `Wieże otworzą się na ${content.unlocksById.towers.level}. poziomie postaci.`);
    assert.equal(trialLock('process', { table: false }, content), rules.locks.table);
    assert.equal(trialLock('orders', { settlement: 'off' }, content), rules.locks.off);
  });

  test('what an action brings, by kind: the quests\' counts and the towers, the Kowadło and the gifts besides', () => {
    assert.deepEqual(trialGains({ kills: { wolf: 2, fox: 1 }, minutes: 30, opened: 1 }), { killAny: 3, explore: 30 });
    assert.deepEqual(trialGains({ herbs: { comfrey: 4 } }), { gatherAny: 4 });
    assert.deepEqual(trialGains({ potions: { 'lesser-healing': 2 }, made: 1, processed: 3, salvaged: 1, orders: 1 }), { brewAny: 2, makeAny: 1, process: 3, salvage: 1, orders: 1 });
    assert.deepEqual(trialGains({ towerWins: 1, upgrades: 1, gifts: 5 }), { towers: 1, upgrade: 1, gifts: 5 });
    assert.deepEqual(trialGains({ towerWins: 0 }), {});
  });

  test('the bar: each member\'s trials up to the cap, the thresholds by the members active', () => {
    assert.equal(trialPoints([3, rules.cap + 5, 1], content), 4 + rules.cap);
    const thresholds = trialThresholds(3, 13, content);
    assert.deepEqual(
      thresholds.map((threshold) => threshold.need),
      rules.steps.map((step) => step * 3),
    );
    assert.deepEqual(
      thresholds.map((threshold) => threshold.reached),
      rules.steps.map((step) => step * 3 <= 13),
    );
    // A guild nobody was active in counts as one.
    assert.equal(trialThresholds(0, 0, content)[0].need, rules.steps[0]);
  });

  test('a chest holds gold by the level, Punkty Czasu, a material of the place the class goes to, and the last one Punkty Systemu', () => {
    const character = newCharacter('warrior', { level: 30, classLevel: 25 });
    const first = trialChest(0, character, 'a', content);
    assert.equal(first.gold, rules.chests[0].gold.base + rules.chests[0].gold.perLevel * 30);
    assert.equal(first.timePoints, rules.chests[0].timePoints);
    assert.equal(first.systemPoints, 0);
    assert.deepEqual(Object.values(first.materials), [rules.chests[0].materials]);
    const [key] = Object.keys(first.materials);
    const material = content.materialsById[key.slice(0, key.lastIndexOf(':'))];
    assert.ok(!content.monstersById[material.monster].elite && !content.monstersById[material.monster].champion);
    assert.deepEqual(trialChest(0, character, 'a', content), first);
    const last = rules.chests.length - 1;
    assert.equal(trialChest(last, character, 'a', content).systemPoints, rules.chests[last].systemPoints);
  });
});

describe('the Próby Gildii through the API', () => {
  const { call, db, signUp } = useServer();
  const cookies = {};
  const DAY = 24 * 3600000;

  async function player(login, name, { level = 30 } = {}) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = ?, class_level = ?, gold = 5000 WHERE name = ?').bind(level, Math.min(level, 25), name).run();
  }
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  const idOf = async (name) => (await first('SELECT id FROM characters WHERE name = ?', name)).id;
  const week = () => questPeriod('weekly', Date.now(), content).key;
  // The board of this week, set by hand for a test.
  const setBoard = (trials) => run('UPDATE guild_trial_boards SET trials = ?', JSON.stringify(trials));
  // Trials finished by hand: `count` of them for a character, this week or another.
  async function finished(name, count, { from = 0, on = week() } = {}) {
    const id = await idOf(name);
    const guild = (await first('SELECT guild_id FROM guild_members WHERE character_id = ?', id)).guild_id;
    for (let index = 0; index < count; index++) {
      await run("INSERT INTO guild_trials (guild_id, week, character_id, trial, kind, count, progress, state, taken_at, done_at) VALUES (?, ?, ?, ?, 'explore', 1, 1, 'done', 0, 0)", guild, on, id, from + index);
    }
  }

  beforeEach(async () => {
    await player('mistrz', 'Mistrz');
    await player('druh', 'Druh', { level: 12 });
    await as('mistrz', 'POST', '/api/guild/found', { name: 'Leśni Bracia', tag: 'LB' });
    const guildId = (await as('mistrz', 'GET', '/api/guild')).data.guild.id;
    await as('mistrz', 'POST', '/api/guild/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/guild/accept', { guildId });
  });

  test('the board is drawn once for the guild and the week, from them, the same for every member; outside a guild there is none', async () => {
    const seen = await as('mistrz', 'GET', '/api/guild/trials');
    assert.equal(seen.status, 200, JSON.stringify(seen.data).slice(0, 300));
    const { guild } = (await as('mistrz', 'GET', '/api/guild')).data;
    const drawn = drawTrialBoard(`${guild.id}:${week()}`, content);
    assert.deepEqual(
      seen.data.trials.map((trial) => trial.kind),
      drawn.map((trial) => trial.kind),
    );
    assert.equal(seen.data.week, week());
    const other = await as('druh', 'GET', '/api/guild/trials');
    assert.deepEqual(
      other.data.trials.map((trial) => trial.index),
      seen.data.trials.map((trial) => trial.index),
    );
    assert.equal((await first('SELECT COUNT(*) AS count FROM guild_trial_boards')).count, 1);
    await player('obcy', 'Obcy');
    // Outside a guild only the card's words come, as the Bestia's.
    const outside = await as('obcy', 'GET', '/api/guild/trials');
    assert.equal(outside.status, 200);
    assert.deepEqual([outside.data.guild, outside.data.texts.noGuild, outside.data.trials], [null, rules.texts.noGuild, undefined]);
    assert.equal((await as('obcy', 'POST', '/api/guild/trials/take', { index: 0 })).data.error.code, 'no_guild');
  });

  test('one trial at a time, sized to the taker\'s level; a locked one says why; a dropped one loses its progress; a finished one is not taken again', async () => {
    await as('mistrz', 'GET', '/api/guild/trials');
    await setBoard([
      { kind: 'explore', size: 0, roll: 0 },
      { kind: 'towers', size: 0, roll: 0 },
      { kind: 'killAny', size: 0, roll: 0 },
    ]);
    const view = (await as('mistrz', 'GET', '/api/guild/trials')).data;
    assert.deepEqual(
      view.trials.map((trial) => trial.state),
      ['open', 'locked', 'open'],
    );
    assert.equal(view.trials[1].lock, `Wieże otworzą się na ${content.unlocksById.towers.level}. poziomie postaci.`);
    assert.equal((await as('mistrz', 'POST', '/api/guild/trials/take', { index: 1 })).data.error.code, 'locked');
    assert.equal((await as('mistrz', 'POST', '/api/guild/trials/take', { index: 9 })).data.error.code, 'no_trial');
    // The count for each member's own level.
    const druh = (await as('druh', 'GET', '/api/guild/trials')).data;
    assert.ok(druh.trials[0].count <= view.trials[0].count);
    const taken = await as('mistrz', 'POST', '/api/guild/trials/take', { index: 0 });
    assert.equal(taken.status, 200, JSON.stringify(taken.data).slice(0, 300));
    assert.equal(taken.data.taken.index, 0);
    assert.equal(taken.data.taken.count, view.trials[0].count);
    assert.equal(taken.data.trials[0].state, 'taken');
    assert.equal((await as('mistrz', 'POST', '/api/guild/trials/take', { index: 2 })).data.error.code, 'busy');
    await run("UPDATE guild_trials SET progress = 10 WHERE state = 'active'");
    const dropped = await as('mistrz', 'POST', '/api/guild/trials/drop');
    assert.equal(dropped.data.taken, null);
    assert.equal((await as('mistrz', 'POST', '/api/guild/trials/drop')).data.error.code, 'no_trial');
    const again = await as('mistrz', 'POST', '/api/guild/trials/take', { index: 0 });
    assert.equal(again.data.taken.progress, 0);
    // Finished: not taken again this week.
    await run("UPDATE guild_trials SET state = 'done', progress = count WHERE state = 'active'");
    const done = await as('mistrz', 'GET', '/api/guild/trials');
    assert.equal(done.data.trials[0].state, 'done');
    assert.equal((await as('mistrz', 'POST', '/api/guild/trials/take', { index: 0 })).data.error.code, 'done');
    assert.equal((await as('mistrz', 'POST', '/api/guild/trials/take', { index: 2 })).status, 200);
  });

  test('a claimed exploration moves the trial on in its own batch, and a trial whose count is reached is done', async () => {
    await as('mistrz', 'GET', '/api/guild/trials');
    await setBoard([
      { kind: 'explore', size: 0, roll: 0 },
      { kind: 'killAny', size: 0, roll: 0 },
    ]);
    await as('mistrz', 'POST', '/api/guild/trials/take', { index: 0 });
    assert.equal((await as('mistrz', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).status, 201);
    await as('mistrz', 'POST', '/api/test/skip-time');
    assert.equal((await as('mistrz', 'POST', '/api/hunts/claim')).status, 200);
    const moved = (await as('mistrz', 'GET', '/api/guild/trials')).data;
    assert.equal(moved.taken.progress, 5);
    // The creatures beaten count for a trial of creatures, and its count reached finishes it.
    await as('mistrz', 'POST', '/api/guild/trials/drop');
    await as('mistrz', 'POST', '/api/guild/trials/take', { index: 1 });
    await run("UPDATE guild_trials SET count = 1 WHERE state = 'active'");
    await as('mistrz', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 });
    await as('mistrz', 'POST', '/api/test/skip-time');
    const claimed = await as('mistrz', 'POST', '/api/hunts/claim');
    const kills = claimed.data.report.fights.filter((fight) => fight.won === true).reduce((sum, fight) => sum + fight.enemies.length, 0);
    assert.ok(kills > 0);
    const done = (await as('mistrz', 'GET', '/api/guild/trials')).data;
    assert.equal(done.taken, null);
    assert.equal(done.trials[1].state, 'done');
    assert.equal(done.bar.points, 1);
    assert.deepEqual(
      done.members.map((member) => [member.name, member.count]),
      [['Mistrz', 1]],
    );
    const row = await first("SELECT progress, count, done_at FROM guild_trials WHERE state = 'done'");
    assert.equal(row.progress, 1);
    assert.ok(row.done_at > 0);
  });

  test('a trial of a guild left behind moves no more, and the next guild\'s trial takes its place', async () => {
    await as('druh', 'GET', '/api/guild/trials');
    await setBoard([{ kind: 'explore', size: 0, roll: 0 }]);
    await as('druh', 'POST', '/api/guild/trials/take', { index: 0 });
    await as('druh', 'POST', '/api/guild/leave');
    await as('druh', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 });
    await as('druh', 'POST', '/api/test/skip-time');
    await as('druh', 'POST', '/api/hunts/claim');
    assert.equal((await first("SELECT progress FROM guild_trials WHERE state = 'active'")).progress, 0);
    // In another guild, a trial taken there drops the one left behind.
    await player('inny', 'Inny');
    const other = (await as('inny', 'POST', '/api/guild/found', { name: 'Inni', tag: 'IN' })).data.guild.id;
    await as('inny', 'POST', '/api/guild/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/guild/accept', { guildId: other });
    await as('druh', 'GET', '/api/guild/trials');
    await run('UPDATE guild_trial_boards SET trials = ? WHERE guild_id = ?', JSON.stringify([{ kind: 'explore', size: 0, roll: 0 }]), other);
    const taken = await as('druh', 'POST', '/api/guild/trials/take', { index: 0 });
    assert.equal(taken.status, 200, JSON.stringify(taken.data).slice(0, 300));
    const rows = (await (await db()).prepare('SELECT guild_id, state FROM guild_trials ORDER BY id').all()).results;
    assert.deepEqual(
      rows.map((row) => [row.guild_id === other, row.state]),
      [
        [false, 'dropped'],
        [true, 'active'],
      ],
    );
  });

  test('the thresholds come from the members active when the board was drawn, and each one\'s trials count up to the cap; reached, they stay', async () => {
    await player('trzeci', 'Trzeci');
    const guildId = (await as('mistrz', 'GET', '/api/guild')).data.guild.id;
    await as('mistrz', 'POST', '/api/guild/invite', { name: 'Trzeci' });
    await as('trzeci', 'POST', '/api/guild/accept', { guildId });
    // Two accounts played lately, the third not for long.
    await run('UPDATE users SET seen_at = ?', Date.now());
    await run('UPDATE users SET seen_at = ? WHERE login = ?', Date.now() - (rules.activeDays + 1) * DAY, 'trzeci');
    const drawn = (await as('mistrz', 'GET', '/api/guild/trials')).data;
    assert.equal(drawn.bar.active, 2);
    assert.deepEqual(
      drawn.bar.thresholds.map((threshold) => threshold.need),
      rules.steps.map((step) => step * 2),
    );
    // Someone active later does not change the week's thresholds.
    await run('UPDATE users SET seen_at = ?', Date.now());
    assert.equal((await as('mistrz', 'GET', '/api/guild/trials')).data.bar.active, 2);
    // Mistrz finishes more than the cap: only the cap counts.
    await finished('Mistrz', rules.cap + 2);
    await finished('Druh', 3);
    const bar = (await as('druh', 'GET', '/api/guild/trials')).data;
    assert.equal(bar.bar.points, rules.cap + 3);
    assert.deepEqual(
      bar.bar.thresholds.map((threshold) => threshold.reached),
      rules.steps.map((step) => step * 2 <= rules.cap + 3),
    );
    const mistrz = bar.members.find((member) => member.name === 'Mistrz');
    assert.deepEqual([mistrz.count, mistrz.counted], [rules.cap + 2, rules.cap]);
    // Druh goes for good: its finished trials still count, without its name.
    assert.equal((await as('druh', 'DELETE', '/api/character')).status, 200);
    assert.equal((await first('SELECT COUNT(*) AS count FROM guild_trials WHERE character_id IS NULL')).count, 3);
    const after = (await as('mistrz', 'GET', '/api/guild/trials')).data;
    assert.equal(after.bar.points, rules.cap + 3);
    assert.deepEqual(
      after.members.map((member) => member.name),
      ['Mistrz'],
    );
  });

  test('a reached threshold\'s chest, once, for those who finished a trial that week; the last week\'s too, not older', async () => {
    await run('UPDATE users SET seen_at = 0');
    await as('mistrz', 'GET', '/api/guild/trials');
    await finished('Mistrz', rules.steps[0]);
    const before = await first("SELECT gold, time_points, system_points, materials FROM characters WHERE name = 'Mistrz'");
    const view = (await as('mistrz', 'GET', '/api/guild/trials')).data;
    assert.equal(view.bar.active, 1);
    assert.deepEqual(
      view.bar.thresholds.map((threshold) => threshold.ready),
      rules.steps.map((step, index) => index === 0),
    );
    assert.equal((await as('druh', 'POST', '/api/guild/trials/claim', { week: week(), threshold: 0 })).data.error.code, 'no_trial');
    assert.equal((await as('mistrz', 'POST', '/api/guild/trials/claim', { week: week(), threshold: 1 })).data.error.code, 'not_reached');
    assert.equal((await as('mistrz', 'POST', '/api/guild/trials/claim', { week: week(), threshold: 7 })).data.error.code, 'invalid_threshold');
    const claimed = await as('mistrz', 'POST', '/api/guild/trials/claim', { week: week(), threshold: 0 });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
    const chest = rules.chests[0];
    assert.equal(claimed.data.chest.gold, chest.gold.base + chest.gold.perLevel * 30);
    assert.equal(claimed.data.chest.timePoints, chest.timePoints);
    assert.equal(claimed.data.bar.thresholds[0].claimed, true);
    const after = await first("SELECT gold, time_points, system_points, materials FROM characters WHERE name = 'Mistrz'");
    assert.equal(after.gold, before.gold + claimed.data.chest.gold);
    assert.equal(after.time_points, before.time_points + chest.timePoints);
    assert.equal(after.system_points, before.system_points);
    const [material] = claimed.data.chest.materials;
    assert.equal(JSON.parse(after.materials)[material.key], (JSON.parse(before.materials)[material.key] ?? 0) + chest.materials);
    assert.equal((await as('mistrz', 'POST', '/api/guild/trials/claim', { week: week(), threshold: 0 })).data.error.code, 'claimed');
    // The last week: its chests wait the whole of this one.
    const period = questPeriod('weekly', Date.now(), content);
    const last = questPeriod('weekly', period.startsAt - 1, content).key;
    const older = questPeriod('weekly', period.startsAt - 8 * DAY, content).key;
    const guildId = (await as('mistrz', 'GET', '/api/guild')).data.guild.id;
    await run("INSERT INTO guild_trial_boards (guild_id, week, trials, active, created_at) VALUES (?, ?, '[]', 1, 0)", guildId, last);
    await finished('Mistrz', rules.steps[1], { on: last });
    const waiting = (await as('mistrz', 'GET', '/api/guild/trials')).data.previous;
    assert.equal(waiting.week, last);
    assert.deepEqual(
      waiting.thresholds.map((threshold) => threshold.ready),
      rules.steps.map((step, index) => index <= 1),
    );
    assert.equal((await as('mistrz', 'POST', '/api/guild/trials/claim', { week: last, threshold: 1 })).status, 200);
    assert.equal((await as('mistrz', 'POST', '/api/guild/trials/claim', { week: older, threshold: 0 })).data.error.code, 'too_late');
  });
});

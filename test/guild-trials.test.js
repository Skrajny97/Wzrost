// The Próby Gildii (src/engine/guild-trials.js, src/server/guild-trials.js;
// the author's 345 A, 615 A and 617): a guild's board of a week, the same for
// its members and drawn from the guild and the week (by the cron as the week
// starts, or at the first look); a few trials open on Monday and more each
// day, and every open trial runs for each member at once, with nothing to
// take, sized to the member's level, locked while its part of the game is
// shut; what an action brings (an exploration, the Stół rozbiórki, the
// Kowadło, a Wieża, an order of the Osada) moves it on only with that
// action's own save, and only when the action began after the trial opened,
// a Wieża's fight only on a floor near the character's level; the bar of
// finished trials with thresholds from the members active when the board
// was drawn (and a share of each who joined later), each member's trials up
// to the cap and the day's limit; and the chests, once and only for those
// who finished a trial that week.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  drawTrialBoard,
  joinShare,
  questPeriod,
  trialChest,
  trialCount,
  trialDay,
  trialDayLimit,
  trialGains,
  trialLock,
  trialNote,
  trialPoints,
  trialsOpen,
  trialText,
  trialThresholds,
  trialTowerFloor,
  weekShare,
} from '../src/engine/index.js';
import { openGuildTrials, trialProgress } from '../src/server/guild-trials.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rules = content.guilds.trials;
// Stat points that win a usual floor of the Wieże at level 60 almost always.
const STRONG = { strength: 300, vitality: 300, endurance: 300 };

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

  test('a tower win counts only on a floor at most levelsBelow levels below the character (488 A); the note says from which floor', () => {
    assert.equal(rules.kinds.find((kind) => kind.id === 'towers').levelsBelow, 10);
    assert.equal(trialTowerFloor(60, content), 50);
    assert.equal(trialTowerFloor(50, content), 40);
    assert.equal(trialTowerFloor(5, content), 1);
    assert.equal(trialNote('towers', 60, content), 'Liczą się piętra od 50. w górę.');
    assert.equal(trialNote('towers', 73, content), 'Liczą się piętra od 63. w górę.');
    // Other notes as they are, and none where a kind has none.
    assert.equal(trialNote('makeAny', 60, content), rules.kinds.find((kind) => kind.id === 'makeAny').note);
    assert.equal(trialNote('explore', 60, content), null);
    assert.equal(trialNote('gone', 60, content), null);
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
    // A member who joined later counts in part; a threshold is rounded up.
    assert.equal(trialThresholds(2 + 1 / 7, 0, content)[0].need, Math.ceil(((2 + 1 / 7) * rules.steps[0]) - 1e-9));
    assert.equal(trialThresholds(2 + 1 / 7, 0, content)[0].need, 5);
  });

  test('the week opens day by day (615 A): a few trials on Monday and more each day, so many finished for each day so far, a joiner by the days left', () => {
    // The days of the week on the quests' clock, Monday 0 to Sunday 6, also
    // in the week of the 25-hour Sunday (25.10.2026).
    const at = (iso) => trialDay(Date.parse(iso), content);
    assert.equal(at('2026-11-01T23:30:00Z'), 0); // Monday 2.11, 00:30 in Poland
    assert.equal(at('2026-11-04T11:00:00Z'), 2); // Wednesday noon
    assert.equal(at('2026-11-08T22:30:00Z'), 6); // Sunday 23:30
    assert.equal(at('2026-10-25T22:00:00Z'), 6); // Sunday 25.10, 23:00 after the clocks went back
    assert.equal(at('2026-10-25T23:30:00Z'), 0); // Monday 26.10, 00:30
    assert.equal(trialsOpen(0, content), rules.opens.first);
    assert.equal(trialsOpen(1, content), rules.opens.first + rules.opens.perDay);
    assert.equal(trialsOpen(6, content), Math.min(rules.board, rules.opens.first + 6 * rules.opens.perDay));
    for (let day = 0; day < 7; day++) {
      assert.equal(trialDayLimit(day, content), rules.perDay * (day + 1));
      // There is always more on the board than the day lets finish.
      assert.ok(trialsOpen(day, content) > trialDayLimit(day, content), `day ${day}`);
    }
    // The last threshold is every member's whole week: even a guild whose
    // every member finishes all the days let reaches it only on Sunday (the
    // author: „jak wszyscy wykonają wszystkie to wtedy maksa się zdobywa”).
    const last = rules.steps.at(-1);
    assert.equal(last, rules.cap);
    assert.ok(trialDayLimit(5, content) < last && trialDayLimit(6, content) >= last);
    assert.deepEqual([0, 3, 6].map(joinShare), [1, 4 / 7, 1 / 7]);
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
  const all = async (sql, ...binds) => (await (await db()).prepare(sql).bind(...binds).all()).results;
  const idOf = async (name) => (await first('SELECT id FROM characters WHERE name = ?', name)).id;
  const week = () => questPeriod('weekly', Date.now(), content).key;
  const today = () => trialDay(Date.now(), content);
  // The board of this week, set by hand for a test: the rows of its trials
  // come anew at the next look.
  async function setBoard(trials) {
    await run('UPDATE guild_trial_boards SET trials = ?, opened = 0', JSON.stringify(trials));
    await run("DELETE FROM guild_trials WHERE state = 'active'");
  }
  // A character's row of the trial at `index` this week, in its guild now.
  const rowOf = async (name, index) =>
    first('SELECT * FROM guild_trials WHERE character_id = ? AND trial = ? AND week = ? AND guild_id = (SELECT guild_id FROM guild_members WHERE character_id = ?)', await idOf(name), index, week(), await idOf(name));
  // Trials finished by hand: `count` of them for a character, this week or
  // another; a row of the trial there already becomes done.
  async function finished(name, count, { from = 0, on = week() } = {}) {
    const id = await idOf(name);
    const guild = (await first('SELECT guild_id FROM guild_members WHERE character_id = ?', id)).guild_id;
    for (let index = 0; index < count; index++) {
      await run(
        `INSERT INTO guild_trials (guild_id, week, character_id, trial, kind, count, progress, state, taken_at, done_at) VALUES (?, ?, ?, ?, 'explore', 1, 1, 'done', 0, 0)
         ON CONFLICT (guild_id, week, character_id, trial) DO UPDATE SET state = 'done', progress = count, done_at = 0`,
        guild,
        on,
        id,
        from + index,
      );
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

  test('the board is drawn once for the guild and the week, from them, the same for every member, with a row of each open trial for each; outside a guild there is none', async () => {
    const seen = await as('mistrz', 'GET', '/api/guild/trials');
    assert.equal(seen.status, 200, JSON.stringify(seen.data).slice(0, 300));
    const { guild } = (await as('mistrz', 'GET', '/api/guild')).data;
    const drawn = drawTrialBoard(`${guild.id}:${week()}`, content);
    assert.equal(drawn.length, rules.board);
    // Only the trials open today show (615 A), each running (617).
    const open = trialsOpen(today(), content);
    assert.deepEqual(
      seen.data.trials.map((trial) => trial.kind),
      drawn.slice(0, open).map((trial) => trial.kind),
    );
    assert.equal(seen.data.taken, undefined);
    assert.equal(seen.data.week, week());
    const other = await as('druh', 'GET', '/api/guild/trials');
    assert.deepEqual(
      other.data.trials.map((trial) => trial.index),
      seen.data.trials.map((trial) => trial.index),
    );
    assert.equal((await first('SELECT COUNT(*) AS count FROM guild_trial_boards')).count, 1);
    assert.equal((await first("SELECT COUNT(*) AS count FROM guild_trials WHERE state = 'active'")).count, 2 * open);
    assert.equal((await first('SELECT opened FROM guild_trial_boards')).opened, open);
    await player('obcy', 'Obcy');
    // Outside a guild only the card's words come, as the Bestia's.
    const outside = await as('obcy', 'GET', '/api/guild/trials');
    assert.equal(outside.status, 200);
    assert.deepEqual([outside.data.guild, outside.data.texts.noGuild, outside.data.trials], [null, rules.texts.noGuild, undefined]);
    assert.equal((await as('obcy', 'POST', '/api/guild/trials/take', { index: 0 })).data.error.code, 'no_guild');
  });

  test('the cron draws the boards as the week starts and opens the day\'s trials for every member', async () => {
    await run('DELETE FROM guild_trial_boards');
    await run('DELETE FROM guild_trials');
    await openGuildTrials(await db(), Date.now());
    const board = await first('SELECT trials, opened FROM guild_trial_boards');
    assert.ok(board, 'a board drawn');
    const open = trialsOpen(today(), content);
    assert.equal(board.opened, open);
    assert.equal((await first('SELECT COUNT(*) AS count FROM guild_trials')).count, 2 * Math.min(open, JSON.parse(board.trials).length));
    // Again: nothing more.
    await openGuildTrials(await db(), Date.now());
    assert.equal((await first('SELECT COUNT(*) AS count FROM guild_trials')).count, 2 * open);
    // Each trial runs from its day's start, or from the member's joining
    // when that came later (both joined just now).
    const id = await idOf('Mistrz');
    const rows = await all('SELECT trial, taken_at FROM guild_trials WHERE character_id = ?', id);
    const joinedAt = (await first('SELECT joined_at FROM guild_members WHERE character_id = ?', id)).joined_at;
    const monday = questPeriod('weekly', Date.now(), content).startsAt;
    for (const row of rows) assert.ok(row.taken_at >= monday && row.taken_at <= Date.now(), `trial ${row.trial}`);
    assert.equal(rows.find((row) => row.trial === 0).taken_at, Math.max(monday, joinedAt));
    // A member there since before the week: its trials run from Monday.
    await run('DELETE FROM guild_trials');
    await run('UPDATE guild_trial_boards SET opened = 0');
    await run('UPDATE guild_members SET joined_at = 0');
    await openGuildTrials(await db(), Date.now());
    assert.equal((await first('SELECT taken_at FROM guild_trials WHERE character_id = ? AND trial = 0', id)).taken_at, monday);
  });

  test('what waits in the guild lights its dots: a chest to open (the trials run by themselves), the beast, a gift to thank for; outside a guild nothing', async () => {
    await run('UPDATE users SET seen_at = ?', Date.now());
    await as('mistrz', 'GET', '/api/guild/trials');
    const before = (await as('mistrz', 'GET', '/api/guild/todo')).data.todo;
    assert.deepEqual([before.trials, before.requests], [false, false]);
    // The beast's dot as its card has it: an attack left on a living beast,
    // or a chest.
    const beast = (await as('mistrz', 'GET', '/api/guild/beast')).data;
    assert.equal(before.beast, Boolean(beast.beast && !beast.beast.fallen && beast.attacks.left > 0) || beast.chests.length > 0);
    // The first threshold reached by both: a chest for each.
    await finished('Mistrz', rules.steps[0]);
    await finished('Druh', rules.steps[0]);
    assert.equal((await as('mistrz', 'GET', '/api/guild/todo')).data.todo.trials, true);
    assert.equal((await as('druh', 'GET', '/api/guild/todo')).data.todo.trials, true);
    await player('obcy', 'Obcy');
    assert.equal((await as('obcy', 'GET', '/api/guild/todo')).data.todo, null);
  });

  test('every open trial runs at once, sized to each member\'s level; a locked one says why; taking and dropping are gone and only answer with the board', async () => {
    await as('mistrz', 'GET', '/api/guild/trials');
    await setBoard([
      { kind: 'explore', size: 0, roll: 0 },
      { kind: 'towers', size: 0, roll: 0 },
      { kind: 'killAny', size: 0, roll: 0 },
    ]);
    const view = (await as('mistrz', 'GET', '/api/guild/trials')).data;
    assert.deepEqual(
      view.trials.map((trial) => [trial.state, trial.progress]),
      [
        ['active', 0],
        ['locked', 0],
        ['active', 0],
      ],
    );
    assert.equal(view.trials[1].lock, `Wieże otworzą się na ${content.unlocksById.towers.level}. poziomie postaci.`);
    // The count for each member's own level, kept in its own row.
    const druh = (await as('druh', 'GET', '/api/guild/trials')).data;
    assert.ok(druh.trials[0].count <= view.trials[0].count);
    assert.equal((await rowOf('Mistrz', 0)).count, view.trials[0].count);
    assert.equal((await rowOf('Druh', 0)).count, druh.trials[0].count);
    assert.equal((await first("SELECT COUNT(*) AS count FROM guild_trials WHERE state = 'active'")).count, 6);
    const took = await as('mistrz', 'POST', '/api/guild/trials/take', { index: 0 });
    assert.equal(took.status, 200, JSON.stringify(took.data).slice(0, 300));
    assert.equal(took.data.text, rules.texts.auto);
    assert.equal((await as('mistrz', 'POST', '/api/guild/trials/drop')).data.text, rules.texts.auto);
    assert.equal((await first("SELECT COUNT(*) AS count FROM guild_trials WHERE state = 'active'")).count, 6);
  });

  test('a claimed exploration moves every trial it counts for, in its own batch, and a trial whose count is reached is done', async () => {
    await as('mistrz', 'GET', '/api/guild/trials');
    await setBoard([
      { kind: 'explore', size: 0, roll: 0 },
      { kind: 'killAny', size: 0, roll: 0 },
    ]);
    await as('mistrz', 'GET', '/api/guild/trials');
    await run('UPDATE guild_trials SET count = 1 WHERE trial = 1 AND character_id = ?', await idOf('Mistrz'));
    assert.equal((await as('mistrz', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).status, 201);
    await as('mistrz', 'POST', '/api/test/skip-time');
    const claimed = await as('mistrz', 'POST', '/api/hunts/claim');
    assert.equal(claimed.status, 200);
    const kills = claimed.data.report.fights.filter((fight) => fight.won === true).reduce((sum, fight) => sum + fight.enemies.length, 0);
    assert.ok(kills > 0);
    const view = (await as('mistrz', 'GET', '/api/guild/trials')).data;
    // The minutes for the trial of explorations, the creatures for the other.
    assert.deepEqual(
      view.trials.map((trial) => [trial.state, trial.progress]),
      [
        ['active', 5],
        ['done', 1],
      ],
    );
    assert.equal(view.bar.points, 1);
    assert.deepEqual(
      view.members.map((member) => [member.name, member.count]),
      [['Mistrz', 1]],
    );
    const row = await rowOf('Mistrz', 1);
    assert.equal(row.progress, 1);
    assert.ok(row.done_at > 0);
    // The other member's trials moved not.
    assert.equal((await rowOf('Druh', 0)).progress, 0);
  });

  test('only an exploration that set out after its trial opened moves it on, though a skip moves its start back', async () => {
    await as('mistrz', 'GET', '/api/guild/trials');
    await setBoard([{ kind: 'explore', size: 0, roll: 0 }]);
    await as('mistrz', 'GET', '/api/guild/trials');
    // On its way when the trial opens: its report moves the trial not
    // (the author: "żeby się nie naliczała wyprawa jedna do obu zadań").
    assert.equal((await as('mistrz', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).status, 201);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await run('UPDATE guild_trials SET taken_at = ? WHERE character_id = ?', Date.now(), await idOf('Mistrz'));
    await as('mistrz', 'POST', '/api/test/skip-time');
    assert.equal((await as('mistrz', 'POST', '/api/hunts/claim')).status, 200);
    assert.equal((await rowOf('Mistrz', 0)).progress, 0);
    // Set out after the opening: it does, though the skip moved its start
    // back before it.
    await new Promise((resolve) => setTimeout(resolve, 10));
    await as('mistrz', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 });
    await as('mistrz', 'POST', '/api/test/skip-time');
    assert.equal((await as('mistrz', 'POST', '/api/hunts/claim')).status, 200);
    assert.equal((await rowOf('Mistrz', 0)).progress, 5);
  });

  test('the trials of a guild left behind move no more, and the next guild\'s run from the joining', async () => {
    await as('druh', 'GET', '/api/guild/trials');
    await setBoard([{ kind: 'explore', size: 0, roll: 0 }]);
    await as('druh', 'GET', '/api/guild/trials');
    const left = (await rowOf('Druh', 0)).id;
    await as('druh', 'POST', '/api/guild/leave');
    await as('druh', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 });
    await as('druh', 'POST', '/api/test/skip-time');
    await as('druh', 'POST', '/api/hunts/claim');
    assert.equal((await first('SELECT progress FROM guild_trials WHERE id = ?', left)).progress, 0);
    // In another guild, its trials run from the joining.
    await player('inny', 'Inny');
    const other = (await as('inny', 'POST', '/api/guild/found', { name: 'Inni', tag: 'IN' })).data.guild.id;
    await as('inny', 'GET', '/api/guild/trials');
    await run('UPDATE guild_trial_boards SET trials = ?, opened = 0 WHERE guild_id = ?', JSON.stringify([{ kind: 'explore', size: 0, roll: 0 }]), other);
    await run("DELETE FROM guild_trials WHERE guild_id = ? AND state = 'active'", other);
    await as('inny', 'POST', '/api/guild/invite', { name: 'Druh' });
    assert.equal((await as('druh', 'POST', '/api/guild/accept', { guildId: other })).status, 200);
    await as('inny', 'GET', '/api/guild/trials');
    const joined = await rowOf('Druh', 0);
    assert.equal(joined.guild_id, other);
    assert.equal(joined.taken_at, (await first('SELECT joined_at FROM guild_members WHERE character_id = ?', await idOf('Druh'))).joined_at);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await as('druh', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 });
    await as('druh', 'POST', '/api/test/skip-time');
    await as('druh', 'POST', '/api/hunts/claim');
    assert.equal((await rowOf('Druh', 0)).progress, 5);
    assert.equal((await first('SELECT progress FROM guild_trials WHERE id = ?', left)).progress, 0);
  });

  test('the day\'s pace (615 A): only the trials open today run; the bar counts each member\'s finished ones up to the day\'s limit and the rest later; a later member raises the thresholds in part', async () => {
    await run('UPDATE users SET seen_at = ?', Date.now());
    await as('mistrz', 'GET', '/api/guild/trials');
    await setBoard(Array.from({ length: rules.board }, (_, index) => ({ kind: index % 2 ? 'explore' : 'killAny', size: 0, roll: 0 })));
    const view = (await as('mistrz', 'GET', '/api/guild/trials')).data;
    const day = today();
    const open = trialsOpen(day, content);
    const limit = trialDayLimit(day, content);
    assert.equal(view.trials.length, open);
    assert.deepEqual(view.day, { open, soon: day < 6 ? trialsOpen(day + 1, content) - open : 0, limit, finished: 0, counted: 0, later: 0 });
    // Every trial open today finished: the day's limit of them on the bar,
    // the rest on the days after.
    await finished('Mistrz', open);
    const full = (await as('mistrz', 'GET', '/api/guild/trials')).data;
    assert.deepEqual([full.day.finished, full.day.counted, full.day.later], [open, Math.min(open, rules.cap, limit), Math.max(0, Math.min(open, rules.cap) - limit)]);
    assert.equal(full.bar.points, Math.min(open, rules.cap, limit));
    assert.equal(full.members[0].counted, Math.min(open, rules.cap, limit));
    // A member joining now raises the week's thresholds by the week left.
    assert.equal(view.bar.active, 2);
    await player('trzeci', 'Trzeci');
    const guildId = (await as('mistrz', 'GET', '/api/guild')).data.guild.id;
    await as('mistrz', 'POST', '/api/guild/invite', { name: 'Trzeci' });
    assert.equal((await as('trzeci', 'POST', '/api/guild/accept', { guildId })).status, 200);
    const share = joinShare(day);
    assert.ok(Math.abs((await first('SELECT joined FROM guild_trial_boards')).joined - share) < 1e-9);
    assert.equal((await first('SELECT COUNT(*) AS count FROM guild_trials WHERE character_id = ?', await idOf('Trzeci'))).count, open);
    const after = (await as('mistrz', 'GET', '/api/guild/trials')).data;
    assert.deepEqual(
      after.bar.thresholds.map((threshold) => threshold.need),
      rules.steps.map((step) => Math.ceil((2 + share) * step - 1e-9)),
    );
  });

  test('a board drawn before the day\'s pace (12 trials, the week of 0.1.53) counts up to the cap alone: no bar falls, and a chest it reached opens', async () => {
    await run('UPDATE users SET seen_at = ?', Date.now());
    await as('mistrz', 'GET', '/api/guild/trials');
    await setBoard(Array.from({ length: 12 }, (_, index) => ({ kind: index % 2 ? 'explore' : 'killAny', size: 0, roll: 0 })));
    // Mistrz had finished 10 of them, the cap before the change, and Druh 2.
    await finished('Mistrz', 10);
    await finished('Druh', 2);
    const view = (await as('mistrz', 'GET', '/api/guild/trials')).data;
    assert.deepEqual([view.day.limit, view.day.later, view.day.counted], [null, 0, 10]);
    assert.equal(view.bar.points, 12);
    assert.equal(view.members.find((member) => member.name === 'Mistrz').counted, 10);
    // Two members: the third threshold (3 × 2 × 2 = 12) is reached on any day of the week.
    assert.deepEqual(
      view.bar.thresholds.map((threshold) => threshold.reached),
      rules.steps.map((step) => step * 2 <= 12),
    );
    const claimed = await as('mistrz', 'POST', '/api/guild/trials/claim', { week: week(), threshold: 2 });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
  });

  test('the thresholds come from the members active when the board was drawn, and each one\'s trials count up to the cap and the day\'s limit; reached, they stay', async () => {
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
    // Mistrz finishes more than the cap: only the cap counts, and only the
    // day's limit of it today.
    const limit = trialDayLimit(today(), content);
    const counted = (count) => Math.min(count, rules.cap, limit);
    await finished('Mistrz', rules.cap + 2);
    await finished('Druh', 3);
    const bar = (await as('druh', 'GET', '/api/guild/trials')).data;
    assert.equal(bar.bar.points, counted(rules.cap + 2) + counted(3));
    assert.deepEqual(
      bar.bar.thresholds.map((threshold) => threshold.reached),
      rules.steps.map((step) => step * 2 <= counted(rules.cap + 2) + counted(3)),
    );
    const mistrz = bar.members.find((member) => member.name === 'Mistrz');
    assert.deepEqual([mistrz.count, mistrz.counted], [rules.cap + 2, counted(rules.cap + 2)]);
    // Druh goes for good: its finished trials still count, without its name.
    assert.equal((await as('druh', 'DELETE', '/api/character')).status, 200);
    assert.equal((await first("SELECT COUNT(*) AS count FROM guild_trials WHERE character_id IS NULL AND state = 'done'")).count, 3);
    const after = (await as('mistrz', 'GET', '/api/guild/trials')).data;
    assert.ok(after.bar.points >= bar.bar.points);
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

  test('a trial moves only with the condition of its action\'s own save, and only by what its kind counts', async () => {
    await as('mistrz', 'GET', '/api/guild/trials');
    await setBoard([{ kind: 'explore', size: 0, roll: 0 }]);
    await as('mistrz', 'GET', '/api/guild/trials');
    const id = await idOf('Mistrz');
    await run('UPDATE guild_trials SET count = 100 WHERE character_id = ?', id);
    const database = await db();
    const progress = async () => (await rowOf('Mistrz', 0)).progress;
    // A second tap whose save did not land: its condition fails, so does the trial's move.
    await database.batch(trialProgress(database, id, { minutes: 30 }, Date.now(), { sql: '(SELECT version FROM characters WHERE id = ?) = ?', binds: [id, -1] }));
    assert.equal(await progress(), 0);
    await database.batch(trialProgress(database, id, { minutes: 30 }, Date.now(), { sql: '(SELECT version FROM characters WHERE id = ?) >= ?', binds: [id, 0] }));
    assert.equal(await progress(), 30);
    // What another kind counts, or nothing, moves it not.
    await database.batch(trialProgress(database, id, { herbs: { comfrey: 5 }, kills: { wolf: 2 } }, Date.now()));
    assert.deepEqual(trialProgress(database, id, {}, Date.now()), []);
    assert.equal(await progress(), 30);
    // Its count reached, it is done; the other member's trial moved not.
    await database.batch(trialProgress(database, id, { minutes: 90 }, Date.now()));
    const row = await rowOf('Mistrz', 0);
    assert.deepEqual([row.progress, row.state], [100, 'done']);
    assert.equal((await rowOf('Druh', 0)).progress, 0);
  });

  test('the Stół rozbiórki, the Kowadło and the Wieże move their trials on with their own save, all running at once; a second tap that saves nothing moves nothing', async () => {
    const id = await idOf('Mistrz');
    await run('UPDATE characters SET level = 60, class_level = 50, gold = 5000, resources = json_set(resources, ?, 50) WHERE id = ?', '$."iron-ore"', id);
    for (const [building, level] of [
      ['craft-table', 1],
      ['anvil', 2],
    ]) {
      await run('INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) VALUES (?, ?, ?, 0, 1)', id, building, level);
    }
    await as('mistrz', 'GET', '/api/guild/trials');
    await setBoard(['process', 'salvage', 'upgrade', 'towers'].map((kind) => ({ kind, size: 0, roll: 0 })));
    await as('mistrz', 'GET', '/api/guild/trials');
    // Far from done, so each step shows.
    await run('UPDATE guild_trials SET count = 100 WHERE character_id = ?', id);
    const progress = async (index) => (await rowOf('Mistrz', index)).progress;
    const bagItem = async () =>
      (await run('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)', id, JSON.stringify({ base: 'chainmail', slot: 'chest', level: 5, rarity: 'common', affixes: [], armor: 15 })))
        .meta.last_row_id;

    // Three materials handed to the table, by two taps: counted once.
    await run('UPDATE characters SET materials = ? WHERE id = ?', JSON.stringify({ 'wolf-pelt:common': 3 }), id);
    const taps = await Promise.all([1, 2].map(() => as('mistrz', 'POST', '/api/craft/materials', { keys: ['wolf-pelt:common'] })));
    assert.equal(taps.filter((tap) => tap.status === 200).length, 1, JSON.stringify(taps.map((tap) => tap.data)).slice(0, 300));
    assert.equal(await progress(0), 3);

    // An item taken apart.
    assert.equal((await as('mistrz', 'POST', `/api/items/${await bagItem()}/salvage`)).status, 200);
    assert.equal(await progress(1), 1);

    // An upgrade counts when it comes off.
    const upgraded = await as('mistrz', 'POST', `/api/items/${await bagItem()}/upgrade`);
    assert.equal(upgraded.status, 200, JSON.stringify(upgraded.data).slice(0, 300));
    assert.equal(await progress(2), upgraded.data.upgrade.result === 'success' ? 1 : 0);

    // A fight won in a Wieża, on a floor near the character's level (488 A),
    // by a character strong enough for it.
    await run('UPDATE characters SET points = ? WHERE id = ?', JSON.stringify(STRONG), id);
    const entered = await as('mistrz', 'POST', '/api/towers/enter', { tower: 'solo', floor: 51 });
    assert.equal(entered.status, 200, JSON.stringify(entered.data).slice(0, 300));
    assert.equal(await progress(3), entered.data.report.tower.won ? 1 : 0);
    // Each moved only its own kind's trial.
    assert.equal(await progress(0), 3);
    assert.equal(await progress(1), 1);
  });

  test('a fight won in a Wieża moves a trial on only on a floor at most 10 levels below the character, as its note says (488 A)', async () => {
    const id = await idOf('Mistrz');
    await run('UPDATE characters SET level = 60, class_level = 50, points = ? WHERE id = ?', JSON.stringify(STRONG), id);
    await as('mistrz', 'GET', '/api/guild/trials');
    await setBoard([{ kind: 'towers', size: 0, roll: 0 }]);
    const board = (await as('mistrz', 'GET', '/api/guild/trials')).data;
    assert.equal(board.trials[0].note, 'Liczą się piętra od 50. w górę.');
    await run('UPDATE guild_trials SET count = 100 WHERE character_id = ?', id);
    const progress = async () => (await rowOf('Mistrz', 0)).progress;
    // The first floor, won with ease: it counts for nothing.
    const low = await as('mistrz', 'POST', '/api/towers/enter', { tower: 'solo', floor: 1 });
    assert.equal(low.status, 200, JSON.stringify(low.data).slice(0, 300));
    assert.equal(low.data.report.tower.won, true);
    assert.equal(await progress(), 0);
    // A floor 9 levels below the character, won: it counts.
    let won = null;
    for (let i = 0; i < 8 && !won; i++) won = (await as('mistrz', 'POST', '/api/towers/enter', { tower: 'solo', floor: 51 })).data.report.tower.won ? true : null;
    assert.equal(won, true, 'the floor is won');
    assert.equal(await progress(), 1);
  });

  test('a member who leaves and joins again in the same week is counted once on the board; one who joins later adds its share once', async () => {
    await run('UPDATE users SET seen_at = ?', Date.now());
    const guildId = (await as('mistrz', 'GET', '/api/guild')).data.guild.id;
    const members = async () => {
      const { bar } = (await as('mistrz', 'GET', '/api/guild/trials')).data;
      return bar.active + bar.joined;
    };
    assert.equal(await members(), 2);
    async function again(login, name) {
      assert.equal((await as(login, 'POST', '/api/guild/leave')).status, 200);
      await as('mistrz', 'POST', '/api/guild/invite', { name });
      assert.equal((await as(login, 'POST', '/api/guild/accept', { guildId })).status, 200);
    }
    // Druh, active when the board was drawn, leaves and comes back twice:
    // the thresholds stay those of two members.
    await again('druh', 'Druh');
    await again('druh', 'Druh');
    assert.equal(await members(), 2);
    // A new member adds its share of the week left, once, however often it comes back.
    await player('trzeci', 'Trzeci');
    await as('mistrz', 'POST', '/api/guild/invite', { name: 'Trzeci' });
    assert.equal((await as('trzeci', 'POST', '/api/guild/accept', { guildId })).status, 200);
    const share = joinShare(today());
    assert.ok(Math.abs((await members()) - (2 + share)) < 1e-9);
    await again('trzeci', 'Trzeci');
    assert.ok(Math.abs((await members()) - (2 + share)) < 1e-9);
    const { bar } = (await as('mistrz', 'GET', '/api/guild/trials')).data;
    assert.deepEqual(
      bar.thresholds.map((threshold) => threshold.need),
      rules.steps.map((step) => Math.ceil((2 + share) * step - 1e-9)),
    );
    const counted = JSON.parse((await first('SELECT counted FROM guild_trial_boards')).counted);
    assert.deepEqual(
      counted.sort((a, b) => a - b),
      [await idOf('Mistrz'), await idOf('Druh'), await idOf('Trzeci')].sort((a, b) => a - b),
    );
  });
});

describe('the Próby Gildii and the Osada', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on' });
  const STORE = { herb: 'herbs', potion: 'potions', material: 'materials', resource: 'resources', part: 'parts' };

  test('an order delivered moves a trial of orders on with its own save; a second tap that saves nothing moves nothing', async () => {
    const { cookie } = await signUp('soltys');
    await call('POST', '/api/character', { cookie, body: { name: 'Soltys', classId: 'warrior', appearance: 'female' } });
    const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
    await run(`UPDATE characters SET level = 30, class_level = 25, met = '["wolf"]', gold = 100000`);
    assert.equal((await call('POST', '/api/guild/found', { cookie, body: { name: 'Sołtysi', tag: 'SO' } })).status, 200);
    await call('GET', '/api/guild/trials', { cookie });
    await run('UPDATE guild_trial_boards SET trials = ?, opened = 0', JSON.stringify([{ kind: 'orders', size: 0, roll: 0 }]));
    await run("DELETE FROM guild_trials WHERE state = 'active'");
    const view = await call('GET', '/api/guild/trials', { cookie });
    assert.equal(view.data.trials[0].state, 'active', JSON.stringify(view.data).slice(0, 300));
    await run("UPDATE guild_trials SET count = 100 WHERE state = 'active'");
    // An order of goods kept in a column, held in full: an order for any
    // materials of a rarity takes the wolves'.
    const { settlement } = (await call('GET', '/api/settlement', { cookie })).data;
    const order = settlement.board.slots.map((slot) => slot.order).find((one) => one && one.kind !== 'craft');
    const key = order.kind === 'material' && order.key.startsWith('any:') ? `${content.materialsByMonster.wolf.id}:${order.key.slice(4)}` : order.key;
    await run(`UPDATE characters SET ${STORE[order.kind]} = json_set(${STORE[order.kind]}, ?, ?)`, `$."${key}"`, order.count);
    const taps = await Promise.all([1, 2].map(() => call('POST', '/api/settlement/deliver', { cookie, body: { orderId: order.id } })));
    assert.equal(taps.filter((tap) => tap.status === 200).length, 1, JSON.stringify(taps.map((tap) => tap.data)).slice(0, 300));
    assert.equal((await (await db()).prepare("SELECT progress FROM guild_trials WHERE state = 'active'").first()).progress, 1);
  });
});

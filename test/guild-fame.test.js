// The Sława of the guilds (src/server/guild-fame.js; the author: "379 A",
// "380 C", "381 A"): each source's points with its cap, each member's part
// capped first and then summed for the guild; the week before frozen once,
// the first time the new week asks, and "Od początku" as the frozen weeks
// and this one; the best guild of the week before, its tag in the answer
// of GET /api/character and its Gildia page saying so.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { questPeriod } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const fame = content.guilds.fame;
const HOUR = 3600000;

describe('the Sława of the guilds through the API', () => {
  const { call, db, signUp } = useServer();
  const cookies = {};
  const ids = {};

  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  const ranking = async (login, period = 'week') => (await as(login, 'GET', `/api/ranking/guilds?period=${period}`)).data;
  const famesOf = (answer) => Object.fromEntries(answer.rows.map((row) => [row.tag, row.fame]));

  async function player(login, name, level = 30) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await run('UPDATE characters SET level = ?, gold = 5000 WHERE name = ?', level, name);
    ids[login] = (await first('SELECT id FROM characters WHERE name = ?', name)).id;
  }

  async function guild(leader, name, tag, members = []) {
    assert.equal((await as(leader, 'POST', '/api/guild/found', { name, tag })).status, 200);
    const guildId = (await as(leader, 'GET', '/api/guild')).data.guild.id;
    for (const [login, character] of members) {
      await as(leader, 'POST', '/api/guild/invite', { name: character });
      assert.equal((await as(login, 'POST', '/api/guild/accept', { guildId })).status, 200);
    }
    return guildId;
  }

  // The rows each source keeps, at `at` in a week (`week`: its key).
  const beast = (guildId, week, maxHp, hp, fallenAt = null) =>
    run(
      "INSERT INTO guild_beasts (guild_id, week, monster_id, area_id, level, members, max_hp, hp, created_at, fallen_at) VALUES (?, ?, 'tusker', 'boar-thicket', 40, 2, ?, ?, 0, ?)",
      guildId,
      week,
      maxHp,
      hp,
      fallenAt,
    );
  async function trials(guildId, week, characterId, count) {
    for (let index = 0; index < count; index += 1) {
      await run(
        "INSERT INTO guild_trials (guild_id, week, character_id, trial, kind, count, progress, state, taken_at, done_at) VALUES (?, ?, ?, ?, 'explore', 1, 1, 'done', 0, 0)",
        guildId,
        week,
        characterId,
        index,
      );
    }
  }
  async function gift(guildId, giverId, askerId, count, at) {
    const { meta } = await run(
      "INSERT INTO guild_requests (guild_id, character_id, kind, good, count, given, state, created_at, ends_at, closed_at) VALUES (?, ?, 'herb', 'comfrey', ?, ?, 'filled', ?, ?, ?)",
      guildId,
      askerId,
      count,
      count,
      at,
      at + HOUR,
      at,
    );
    await run('INSERT INTO guild_gifts (request_id, guild_id, giver_id, count, created_at) VALUES (?, ?, ?, ?, ?)', meta.last_row_id, guildId, giverId, count, at);
  }
  async function exchanges(guildId, posterId, takerId, count, at) {
    for (let index = 0; index < count; index += 1) {
      await run(
        "INSERT INTO guild_offers (guild_id, character_id, give, give_count, want, want_count, state, created_at, ends_at, closed_at, taker_id) VALUES (?, ?, 'stone', 1, 'wood', 1, 'taken', ?, ?, ?, ?)",
        guildId,
        posterId,
        at - HOUR,
        at + HOUR,
        at,
        takerId,
      );
    }
  }

  beforeEach(async () => {
    await player('ala', 'Ala');
    await player('ola', 'Ola', 12);
    await player('ewa', 'Ewa');
    await player('iza', 'Iza', 12);
  });

  test("each source's Sława with its cap, each member's part capped first", async () => {
    const forest = await guild('ala', 'Leśni Bracia', 'LB', [['ola', 'Ola']]);
    const week = questPeriod('weekly', Date.now(), content);
    const at = Math.max(week.startsAt, Date.now() - HOUR);
    // Bestia: 34.5% of the bar (34 full percents), not fallen.
    await beast(forest, week.key, 1000, 655);
    assert.equal(famesOf(await ranking('ala')).LB, 34 * fame.beast.perPercent);
    // Próby: 12 of Ala's (up to the cap of the Próby), 3 of Ola's, one of a
    // character gone.
    await trials(forest, week.key, ids.ala, content.guilds.trials.cap + 2);
    await trials(forest, week.key, ids.ola, 3);
    await run("INSERT INTO guild_trials (guild_id, week, character_id, trial, kind, count, progress, state, taken_at) VALUES (?, ?, NULL, 0, 'explore', 1, 1, 'done', 0)", forest, week.key);
    await run("INSERT INTO guild_trials (guild_id, week, character_id, trial, kind, count, progress, state, taken_at) VALUES (?, ?, ?, 9, 'explore', 5, 1, 'active', 0)", forest, week.key, ids.ola);
    const trialPoints = (content.guilds.trials.cap + 3 + 1) * fame.trials.perTrial;
    assert.equal(famesOf(await ranking('ala')).LB, 34 + trialPoints);
    // Prośby: 40 pieces of Ola's (up to its cap), 5 of Ala's, and older ones.
    await gift(forest, ids.ola, ids.ala, 25, at);
    await gift(forest, ids.ola, ids.ala, 15, at);
    await gift(forest, ids.ala, ids.ola, 5, at);
    await gift(forest, ids.ala, ids.ola, 9, week.startsAt - HOUR);
    const giftPoints = (fame.requests.cap + 5) * fame.requests.perPiece;
    assert.equal(famesOf(await ranking('ala')).LB, 34 + trialPoints + giftPoints);
    // Wymiana: 12 taken by Ola (up to its cap), 1 by Ala, and one withdrawn.
    await exchanges(forest, ids.ala, ids.ola, fame.exchange.cap + 2, at);
    await exchanges(forest, ids.ola, ids.ala, 1, at);
    await run("UPDATE guild_offers SET state = 'withdrawn' WHERE id = (SELECT MAX(id) FROM guild_offers)");
    await exchanges(forest, ids.ola, ids.ala, 1, at);
    const exchangePoints = (fame.exchange.cap + 1) * fame.exchange.perExchange;
    let seen = await ranking('ala');
    assert.equal(famesOf(seen).LB, 34 + trialPoints + giftPoints + exchangePoints);
    // The beast fell: its whole bar and its fall.
    await run('UPDATE guild_beasts SET hp = 0, fallen_at = ?', at);
    seen = await ranking('ala');
    assert.equal(famesOf(seen).LB, 100 * fame.beast.perPercent + fame.beast.fell + trialPoints + giftPoints + exchangePoints);
    // Another guild, the ranking's rows and the place of one's own.
    await guild('ewa', 'Kamienny Krąg', 'KK', [['iza', 'Iza']]);
    seen = await ranking('iza');
    assert.deepEqual(
      seen.rows.map((row) => [row.place, row.tag, row.name, row.members, row.own]),
      [
        [1, 'LB', 'Leśni Bracia', 2, false],
        [2, 'KK', 'Kamienny Krąg', 2, true],
      ],
    );
    assert.equal(seen.place, 2);
    assert.equal(seen.period, 'week');
    assert.ok(seen.texts.how.every((line) => !line.includes('{')));
  });

  test('the week before is frozen once, the first time the new week asks; "Od początku" adds this week', async () => {
    const forest = await guild('ala', 'Leśni Bracia', 'LB', [['ola', 'Ola']]);
    const stone = await guild('ewa', 'Kamienny Krąg', 'KK');
    const week = questPeriod('weekly', Date.now(), content);
    const last = questPeriod('weekly', week.startsAt - 1, content);
    const before = questPeriod('weekly', last.startsAt - 1, content);
    // Founding them looked at the Gildia page, which froze last week empty.
    await run('DELETE FROM guild_fame');
    await trials(forest, last.key, ids.ala, 2);
    await exchanges(stone, ids.ewa, ids.iza, 3, last.startsAt + HOUR);
    // Two weeks ago, frozen then.
    await run('INSERT INTO guild_fame (guild_id, week, points) VALUES (?, ?, 7), (?, ?, 100)', forest, before.key, stone, before.key);
    await trials(forest, week.key, ids.ola, 1);
    assert.deepEqual(famesOf(await ranking('ala')), { LB: fame.trials.perTrial, KK: 0 });
    const frozen = async () => (await (await db()).prepare('SELECT guild_id, week, points FROM guild_fame WHERE week = ? ORDER BY guild_id').bind(last.key).all()).results;
    assert.deepEqual(await frozen(), [
      { guild_id: forest, week: last.key, points: 2 * fame.trials.perTrial },
      { guild_id: stone, week: last.key, points: 3 * fame.exchange.perExchange },
    ]);
    // Once: a change to last week's rows changes nothing frozen.
    await trials(forest, last.key, ids.ola, 5);
    await as('ewa', 'GET', '/api/guild');
    await as('ola', 'GET', '/api/character');
    assert.equal((await frozen())[0].points, 2 * fame.trials.perTrial);
    // "Od początku": the weeks frozen and this one.
    assert.deepEqual(famesOf(await ranking('ala', 'all')), { LB: 7 + 2 * fame.trials.perTrial + fame.trials.perTrial, KK: 100 + 3 * fame.exchange.perExchange });
    assert.deepEqual(
      (await ranking('ala', 'all')).rows.map((row) => row.tag),
      ['KK', 'LB'],
    );
    // A guild that goes takes its weeks along.
    assert.equal((await as('ewa', 'POST', '/api/guild/leave')).status, 200);
    assert.equal((await first('SELECT COUNT(*) AS count FROM guild_fame WHERE guild_id = ?', stone)).count, 0);
  });

  test('the best guild of the week before has its tag in gold, and its Gildia page says so', async () => {
    const forest = await guild('ala', 'Leśni Bracia', 'LB', [['ola', 'Ola']]);
    const stone = await guild('ewa', 'Kamienny Krąg', 'KK', [['iza', 'Iza']]);
    const week = questPeriod('weekly', Date.now(), content);
    const last = questPeriod('weekly', week.startsAt - 1, content);
    // No Sława last week: no best guild.
    assert.equal((await as('ala', 'GET', '/api/character')).data.championTag, null);
    await run('DELETE FROM guild_fame');
    // As much Sława: the older guild.
    await exchanges(forest, ids.ala, ids.ola, 2, last.startsAt + HOUR);
    await exchanges(stone, ids.ewa, ids.iza, 2, last.startsAt + HOUR);
    const answer = (await as('iza', 'GET', '/api/character')).data;
    assert.equal(answer.championTag, 'LB');
    assert.ok(answer.character);
    assert.equal((await ranking('iza')).championTag, 'LB');
    assert.equal((await as('ola', 'GET', '/api/guild')).data.guild.champion, true);
    assert.equal((await as('iza', 'GET', '/api/guild')).data.guild.champion, false);
    // More Sława wins.
    await run('DELETE FROM guild_fame');
    await exchanges(stone, ids.iza, ids.ewa, 1, last.startsAt + HOUR);
    assert.equal((await as('ala', 'GET', '/api/character')).data.championTag, 'KK');
    assert.equal((await as('iza', 'GET', '/api/guild')).data.guild.champion, true);
  });
});

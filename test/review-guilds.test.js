// Fixes from the code review of the guilds' activities of 12.11.2026
// (DECISIONS.md, "Wersja 0.2.72"): the weeks of a guild that ends stay for
// its former members' chests, the Skrzynie Prób wait outside the guild,
// members who join after the Bestia came add to its HP, and the roles read
// hold for the leader's changes. Each test failed on the code as it was
// reviewed.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { guildBeast, joinShare, questPeriod, trialDay } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

describe('review: the guilds', () => {
  const { server, call, db, signUp } = useServer();
  const cookies = {};
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const idOf = async (name) => (await first('SELECT id FROM characters WHERE name = ?', name)).id;
  const week = () => questPeriod('weekly', Date.now(), content).key;

  // Requests that start together, as two taps or two tabs do: each sent
  // straight to the worker (the dev proxy in front of it passes requests on
  // one by one) with its body held back, and all the bodies let go at once,
  // so the handlers, which start once the whole body has come (bodyCome in
  // index.js), run side by side.
  async function together(...requests) {
    const releases = [];
    const answers = requests.map(([login, path, body]) => {
      const text = new TextEncoder().encode(body === undefined ? '{}' : JSON.stringify(body));
      const stream = new ReadableStream({
        start(controller) {
          releases.push(() => {
            controller.enqueue(text);
            controller.close();
          });
        },
      });
      return server
        .getWorker()
        .fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookies[login] }, body: stream, duplex: 'half' })
        .then(async (response) => ({ status: response.status, data: await response.json() }));
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    for (const release of releases) release();
    return Promise.all(answers);
  }

  async function player(login, name, level = 40) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await run('UPDATE characters SET level = ?, class_level = ?, gold = 5000 WHERE name = ?', level, Math.min(level, 25), name);
  }
  async function join(login, tag) {
    const invites = (await as(login, 'GET', '/api/guild')).data.invites;
    const accepted = await as(login, 'POST', '/api/guild/accept', { guildId: invites.find((invite) => invite.tag === tag).guildId });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.data).slice(0, 300));
  }
  async function invite(leader, login, name, tag) {
    assert.equal((await as(leader, 'POST', '/api/guild/invite', { name })).status, 200);
    await join(login, tag);
  }

  beforeEach(async () => {
    await player('lowczyni', 'Łowczyni');
    await player('tropiciel', 'Tropiciel');
    assert.equal((await as('lowczyni', 'POST', '/api/guild/found', { name: 'Sfora', tag: 'SF' })).status, 200);
    await invite('lowczyni', 'tropiciel', 'Tropiciel', 'SF');
    await run('UPDATE users SET seen_at = ?', Date.now());
  });

  // DECISIONS.md, "Wyprawa Gildii (621 A)", 9: a fallen guardian's chest is
  // opened "do końca następnego tygodnia, także poza gildią". The routes,
  // guardians and minutes reference guilds ON DELETE CASCADE (0083), so the
  // moment the last member leaves, every former member's chest is gone.
  test('a guild that ends takes its former members\' Skrzynie Wyprawy with it', async () => {
    const view = async (login) => (await as(login, 'GET', '/api/guild/expedition')).data;
    const { expedition } = await view('lowczyni');
    // Tropiciel walks the first stage alone; its guardian comes and falls.
    await run(
      'INSERT INTO guild_expedition_minutes (guild_id, week, character_id, minutes, updated_at) VALUES ((SELECT id FROM guilds), ?, ?, ?, ?)',
      week(),
      await idOf('Tropiciel'),
      expedition.need,
      Date.now(),
    );
    assert.equal((await view('lowczyni')).expedition.barred, true);
    await run('UPDATE guild_expedition_guardians SET hp = 0, fallen_at = ?, fallen_by = ?', Date.now(), await idOf('Łowczyni'));
    assert.equal((await view('tropiciel')).chests.length, 1);
    // Tropiciel goes its way: its chest waits for it outside the guild.
    assert.equal((await as('tropiciel', 'POST', '/api/guild/leave')).status, 200);
    assert.equal((await view('tropiciel')).chests.length, 1);
    // The last member leaves, and the guild ends.
    assert.equal((await as('lowczyni', 'POST', '/api/guild/leave')).status, 200);
    assert.equal((await first('SELECT COUNT(*) AS count FROM guilds')).count, 0);
    // The chest Tropiciel earned should still wait for it.
    assert.equal((await view('tropiciel')).chests.length, 1, 'the chest earned is gone with the guild');
    const opened = await as('tropiciel', 'POST', '/api/guild/expedition/claim', { week: week(), stage: 1 });
    assert.equal(opened.status, 200, JSON.stringify(opened.data).slice(0, 300));
  });

  // DECISIONS.md, "Próby i Prośby Gildii", 7: each reached threshold gives a
  // chest to every character that finished a trial in that guild that week,
  // to open until the end of the next week. The claim only reads the bar of
  // the guild the character is in now, so one removed (or gone to another
  // guild) loses the chests it earned.
  test('a member removed from its guild loses the Skrzynie Prób it earned there', async () => {
    const trialRules = content.guilds.trials;
    await run('UPDATE users SET seen_at = 0');
    await as('lowczyni', 'GET', '/api/guild/trials');
    await run('UPDATE guild_trial_boards SET active = 1');
    // Tropiciel finishes enough trials for the first threshold.
    for (let index = 0; index < trialRules.steps[0]; index++) {
      await run(
        `INSERT INTO guild_trials (guild_id, week, character_id, trial, kind, count, progress, state, taken_at, done_at)
         VALUES ((SELECT id FROM guilds), ?, ?, ?, 'explore', 1, 1, 'done', 0, 0)
         ON CONFLICT (guild_id, week, character_id, trial) DO UPDATE SET state = 'done', progress = count, done_at = 0`,
        week(),
        await idOf('Tropiciel'),
        index,
      );
    }
    const earned = (await as('tropiciel', 'GET', '/api/guild/trials')).data;
    assert.equal(earned.bar.thresholds[0].ready, true);
    // The leader removes Tropiciel before it opens the chest.
    assert.equal((await as('lowczyni', 'POST', '/api/guild/kick', { characterId: await idOf('Tropiciel') })).status, 200);
    const claimed = await as('tropiciel', 'POST', '/api/guild/trials/claim', { week: week(), threshold: 0 });
    assert.equal(claimed.status, 200, `the chest earned is lost: ${JSON.stringify(claimed.data).slice(0, 200)}`);
  });

  test('a member who goes to another guild loses the Skrzynie Prób it earned in the first one', async () => {
    const trialRules = content.guilds.trials;
    await run('UPDATE users SET seen_at = 0');
    await as('lowczyni', 'GET', '/api/guild/trials');
    await run('UPDATE guild_trial_boards SET active = 1');
    for (let index = 0; index < trialRules.steps[0]; index++) {
      await run(
        `INSERT INTO guild_trials (guild_id, week, character_id, trial, kind, count, progress, state, taken_at, done_at)
         VALUES ((SELECT id FROM guilds), ?, ?, ?, 'explore', 1, 1, 'done', 0, 0)
         ON CONFLICT (guild_id, week, character_id, trial) DO UPDATE SET state = 'done', progress = count, done_at = 0`,
        week(),
        await idOf('Tropiciel'),
        index,
      );
    }
    assert.equal((await as('tropiciel', 'GET', '/api/guild/trials')).data.bar.thresholds[0].ready, true);
    // Tropiciel moves to another guild (the founder's level).
    await run("UPDATE characters SET level = 30 WHERE name = 'Tropiciel'");
    assert.equal((await as('tropiciel', 'POST', '/api/guild/leave')).status, 200);
    assert.equal((await as('tropiciel', 'POST', '/api/guild/found', { name: 'Wataha', tag: 'WA' })).status, 200);
    const claimed = await as('tropiciel', 'POST', '/api/guild/trials/claim', { week: week(), threshold: 0 });
    assert.equal(claimed.status, 200, `the chest earned is lost: ${JSON.stringify(claimed.data).slice(0, 200)}`);
  });

  // The Bestia's HP is set for the members of the moment it comes and never
  // again (guild-beast.js, beastOf), while a member who joins later raises
  // the week's Próby thresholds and the Wyprawa's stages and guardians by its
  // share of the week (guilds.js, weekJoin; 615 A, 621 A). So a beast made
  // while two members were in the guild stays a two-member beast for every
  // member who joins, or comes back, after it.
  test('members who join after the Bestia came add nothing to its HP', async () => {
    const view = async (login) => (await as(login, 'GET', '/api/guild/beast')).data;
    const made = (await view('lowczyni')).beast;
    assert.equal(made.members, 2);
    for (const [login, name] of [
      ['zwiad', 'Zwiad'],
      ['sokol', 'Sokol'],
      ['wilk', 'Wilk'],
    ]) {
      await player(login, name);
      await invite('lowczyni', login, name, 'SF');
    }
    const after = (await view('lowczyni')).beast;
    assert.equal((await first('SELECT COUNT(*) AS count FROM guild_members')).count, 5);
    // Five members now, three of them for the share of the week left: the
    // beast should be at least as strong as a beast of 2 + 3 × share members.
    const share = joinShare(trialDay(Date.now(), content));
    const perMember = guildBeast({ seed: 'x', levels: [made.level] }, content).maxHp;
    assert.ok(after.maxHp >= Math.round(made.maxHp + 3 * share * perMember) - 3, `max HP ${after.maxHp}, as made for 2 members: ${made.maxHp}`);
  });

  // POST /api/guild/lead reads the leader's role, then saves two statements
  // with no assertion that the one who asks still leads: the second makes
  // the target leader whenever the one who asks is a deputy, which it is
  // after the first hand-over. Two hand-overs at once: two leaders.
  test('two hand-overs of the lead at once leave the guild with two leaders', async () => {
    await player('zwiad', 'Zwiad');
    await invite('lowczyni', 'zwiad', 'Zwiad', 'SF');
    const [lowczyni, tropiciel, zwiad] = [await idOf('Łowczyni'), await idOf('Tropiciel'), await idOf('Zwiad')];
    for (let attempt = 1; attempt <= 8; attempt++) {
      await run("UPDATE guild_members SET role = CASE WHEN character_id = ? THEN 'leader' ELSE 'member' END", lowczyni);
      const answers = await together(['lowczyni', '/api/guild/lead', { characterId: tropiciel }], ['lowczyni', '/api/guild/lead', { characterId: zwiad }]);
      const leaders = (await first("SELECT COUNT(*) AS count FROM guild_members WHERE role = 'leader'")).count;
      assert.equal(leaders, 1, `attempt ${attempt}: ${leaders} leaders, answers ${answers.map((one) => one.status).join(', ')}`);
    }
  });

  // The last member leaves only with the Skrzynia Gildii empty
  // (lastLeavesEmpty), but POST /api/guild/kick takes a member out with no
  // such assertion, its role read before: a leader who removes the last
  // other member while leaving ends the guild, and the items in its chest
  // (also those left for that member) are gone.
  test('a removal and a leave at once end a guild whose Skrzynia still holds items', async () => {
    await run('UPDATE characters SET level = 30');
    const item = { base: 'amulet', slot: 'amulet', level: 30, rarity: 'rare', affixes: [], implicit: { stat: 'will', value: 2 } };
    const made = await run("INSERT INTO items (character_id, slot, data, created_at) VALUES ((SELECT id FROM characters WHERE name = 'Łowczyni'), NULL, ?, 1)", JSON.stringify(item));
    const [lowczyni, tropiciel] = [await idOf('Łowczyni'), await idOf('Tropiciel')];
    assert.equal((await as('lowczyni', 'POST', '/api/guild/chest/put', { itemId: made.meta.last_row_id, forId: tropiciel })).status, 200);
    const guild = (await first('SELECT id FROM guilds')).id;
    for (let attempt = 1; attempt <= 8; attempt++) {
      // Łowczyni leads, Tropiciel is the only other member, the item waits in the chest.
      await run('DELETE FROM guild_members');
      await run("INSERT INTO guild_members (character_id, guild_id, role, joined_at) VALUES (?, ?, 'leader', 1), (?, ?, 'member', 2)", lowczyni, guild, tropiciel, guild);
      const [kick, leave] = await together(['lowczyni', '/api/guild/kick', { characterId: tropiciel }], ['lowczyni', '/api/guild/leave']);
      const left = (await first('SELECT COUNT(*) AS count FROM guild_chest')).count;
      const guilds = (await first('SELECT COUNT(*) AS count FROM guilds')).count;
      assert.ok(left === 1 && guilds === 1, `attempt ${attempt}: kick ${kick.status}, leave ${leave.status}: guilds ${guilds}, items in chests ${left}`);
    }
  });
});

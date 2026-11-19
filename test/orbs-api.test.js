// Kulki Systemu on the exploration board (DECISIONS.md, „Kulki Systemu na
// planszy wyprawy (makieta, 19.11.2026)”): the page gets the moments of the
// orbs of the exploration under way, never what they give, and a tap catches
// one within its window by the server's clock, once, while the day has orbs
// left, only on the character's own exploration; one atomic write.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { areaFor, orbMoments, orbReward, questPeriod } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const DAY = 24 * 3600000;
const SECOND = 1000;
const LEVEL = 30;
const AREA = 'mossy-boulders';

describe('Kulki Systemu', () => {
  const { call, db, signUp } = useServer({ TEST_CLOCK: 'on' });
  // Noon of a day ten days on, Polish time: the exploration sets out then.
  const start = questPeriod('daily', Date.now() + 10 * DAY, content).startsAt + 12 * 3600000;
  const today = questPeriod('daily', start, content).key;
  let cookie;

  const sql = async (statement, ...binds) => (await db()).prepare(statement).bind(...binds).run();
  const row = async () => (await db()).prepare("SELECT id, gold, time_points, system_points, materials, orbs FROM characters WHERE name = 'Łowczyni'").first();
  const activity = async () => (await db()).prepare("SELECT * FROM activities WHERE character_id = (SELECT id FROM characters WHERE name = 'Łowczyni')").first();
  const claim = (index, now, who = cookie) => call('POST', '/api/hunts/orb', { cookie: who, body: { index }, now });
  // The exploration's orbs, by the engine, from its row: when each comes and
  // what it gives.
  async function orbs() {
    const hunt = await activity();
    const at = orbMoments(hunt.seed, hunt.minutes, hunt.ends_at - hunt.started_at, content).map((offset) => hunt.started_at + offset);
    const reward = (index) => orbReward({ seed: hunt.seed, index, level: LEVEL, area: areaFor(hunt.region_id, LEVEL, content) }, content);
    return { at, reward };
  }
  // The first seed of the list whose first orb gives `kind` at the
  // character's level and place.
  const seedFor = (kind) => {
    for (let index = 0; index < 500; index += 1) {
      const seed = `orb-test-${index}`;
      if (orbReward({ seed, index: 0, level: LEVEL, area: content.areasById[AREA] }, content).kind === kind) return seed;
    }
    throw new Error(`no seed for ${kind}`);
  };

  async function newCharacter(login, name) {
    const { cookie: own } = await signUp(login);
    await call('POST', '/api/character', { cookie: own, body: { name, classId: 'archer', appearance: 'female' } });
    await sql('UPDATE characters SET level = ?, class_level = ?, hp = 99999, hp_at = ? WHERE name = ?', LEVEL, LEVEL + 2, start - 60000, name);
    return own;
  }
  const setOut = async (who = cookie) => {
    const answer = await call('POST', '/api/hunts', { cookie: who, body: { areaId: AREA, minutes: 60 }, now: start });
    assert.equal(answer.status, 201, JSON.stringify(answer.data));
    return answer;
  };

  beforeEach(async () => {
    cookie = await newCharacter('lowczyni', 'Łowczyni');
  });

  test('the page gets when the orbs come, never what they give', async () => {
    const answer = await setOut();
    const view = answer.data.character.activity.orbs;
    const { at } = await orbs();
    assert.equal(at.length, 6);
    assert.deepEqual(view, { at, claimed: [], left: 8, resetsAt: questPeriod('daily', start, content).endsAt });
    // Nothing the orbs give is in the view.
    assert.ok(!/gold|time|material|kind|reward/i.test(Object.keys(view).join(' ')));
    // None at home, nor once the exploration has ended.
    await sql("UPDATE activities SET ends_at = ? WHERE character_id = (SELECT id FROM characters WHERE name = 'Łowczyni')", start + 30 * SECOND);
    const after = await call('GET', '/api/character', { cookie, now: start + 31 * SECOND });
    assert.equal(after.data.character.activity.orbs, undefined);
  });

  test('a tap within the window catches the orb: its gold, once, kept with the exploration and the day', async () => {
    await setOut();
    await sql("UPDATE activities SET seed = ? WHERE character_id = (SELECT id FROM characters WHERE name = 'Łowczyni')", seedFor('gold'));
    const { at, reward } = await orbs();
    // As the page sees the character at the same moment: Punkty Czasu also
    // come with time (one every half hour).
    const before = (await call('GET', '/api/character', { cookie, now: at[0] + 3 * SECOND })).data.character;
    const answer = await claim(0, at[0] + 3 * SECOND);
    assert.equal(answer.status, 200, JSON.stringify(answer.data));
    const gold = reward(0).gold;
    assert.deepEqual(answer.data.orb, { index: 0, kind: 'gold', gold, text: `Kulka Systemu: +${gold} złota` });
    const seen = answer.data.character;
    assert.equal(seen.gold - before.gold, gold);
    assert.equal(seen.timePoints, before.timePoints);
    // Never Punkty Systemu.
    assert.equal(seen.systemPoints, before.systemPoints);
    const after = await row();
    assert.equal(after.gold, seen.gold);
    assert.deepEqual(JSON.parse(after.orbs), { day: today, count: 1 });
    assert.deepEqual(JSON.parse((await activity()).options).orbs, [0]);
    assert.deepEqual(answer.data.character.activity.orbs.claimed, [0]);
    assert.equal(answer.data.character.activity.orbs.left, 7);
    // The same tap again: the game's usual 409, nothing more.
    const again = await claim(0, at[0] + 4 * SECOND);
    assert.equal(again.status, 409);
    assert.equal(again.data.error.code, 'orb_claimed');
    assert.equal((await row()).gold, after.gold);
  });

  test('Punkty Czasu and a material of the place, as the engine draws them', async () => {
    await setOut();
    await sql("UPDATE activities SET seed = ? WHERE character_id = (SELECT id FROM characters WHERE name = 'Łowczyni')", seedFor('time'));
    let orb = await orbs();
    const before = await call('GET', '/api/character', { cookie, now: orb.at[0] + SECOND });
    const time = await claim(0, orb.at[0] + SECOND);
    assert.equal(time.status, 200, JSON.stringify(time.data));
    const points = orb.reward(0).timePoints;
    assert.equal(time.data.character.timePoints - before.data.character.timePoints, points);
    assert.match(time.data.orb.text, new RegExp(`^Kulka Systemu: \\+${points} Punkt(y|ów)? Czasu$`));

    await sql("UPDATE activities SET seed = ?, options = json_remove(options, '$.orbs') WHERE character_id = (SELECT id FROM characters WHERE name = 'Łowczyni')", seedFor('material'));
    orb = await orbs();
    const given = orb.reward(0);
    const material = await claim(0, orb.at[0] + SECOND);
    assert.equal(material.status, 200, JSON.stringify(material.data));
    assert.equal(JSON.parse((await row()).materials)[given.stack], 1);
    assert.equal(material.data.orb.text, `Kulka Systemu: +1 ${content.materialsById[given.material].name.toLowerCase()}`);
  });

  test('too early, too late, a number it has not got', async () => {
    await setOut();
    const { at } = await orbs();
    const early = await claim(1, at[1] - 2 * SECOND - 1);
    assert.equal(early.status, 409);
    assert.equal(early.data.error.code, 'orb_early');
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
    assert.equal(JSON.parse((await row()).orbs).count, 2);
  });

  test('at most eight a day; a new day from midnight Polish time', async () => {
    await setOut();
    const { at } = await orbs();
    await sql("UPDATE characters SET orbs = ? WHERE name = 'Łowczyni'", JSON.stringify({ day: today, count: 8 }));
    const capped = await claim(0, at[0] + SECOND);
    assert.equal(capped.status, 409);
    assert.equal(capped.data.error.code, 'orb_limit');
    assert.equal(capped.data.error.message, 'Na dziś to już wszystkie Kulki Systemu (8). Następne po północy.');
    const view = await call('GET', '/api/character', { cookie, now: at[0] + SECOND });
    assert.equal(view.data.character.activity.orbs.left, 0);
    // Yesterday's eight leave today's all.
    const yesterday = questPeriod('daily', start - DAY, content).key;
    await sql("UPDATE characters SET orbs = ? WHERE name = 'Łowczyni'", JSON.stringify({ day: yesterday, count: 8 }));
    assert.equal((await claim(0, at[0] + SECOND)).status, 200);
    assert.deepEqual(JSON.parse((await row()).orbs), { day: today, count: 1 });
  });

  test("only the character's own exploration: another's orb is not there to catch", async () => {
    await setOut();
    const { at } = await orbs();
    const other = await newCharacter('inna', 'Inna');
    const home = await claim(0, at[0] + SECOND, other);
    assert.equal(home.status, 409);
    assert.equal(home.data.error.code, 'no_exploration');
    // Out on an exploration of its own, its orbs are its own: the first
    // owner's orb stays to catch.
    await setOut(other);
    await claim(0, at[0] + SECOND, other);
    assert.equal(JSON.parse((await activity()).options).orbs, undefined);
    assert.equal((await claim(0, at[0] + SECOND)).status, 200);
  });

  test('none without an exploration under way', async () => {
    const home = await claim(0, start);
    assert.equal(home.status, 409);
    assert.equal(home.data.error.code, 'no_exploration');
    await setOut();
    const { at } = await orbs();
    // Once it has ended, its report waits: no orbs.
    await sql("UPDATE activities SET ends_at = ? WHERE character_id = (SELECT id FROM characters WHERE name = 'Łowczyni')", at[0] + 5 * SECOND);
    const ended = await claim(0, at[0] + 6 * SECOND);
    assert.equal(ended.status, 409);
    assert.equal(ended.data.error.code, 'no_exploration');
  });

  test("test mode's orb soon: the exploration moves on till its next orb comes in the seconds asked", async () => {
    await setOut();
    const now = start + 30 * SECOND;
    const answer = await call('POST', '/api/test/orb', { cookie, body: { seconds: 3 }, now });
    assert.equal(answer.status, 200, JSON.stringify(answer.data));
    const view = answer.data.character.activity.orbs;
    assert.ok(view.at.includes(now + 3 * SECOND));
    assert.equal((await claim(view.at.indexOf(now + 3 * SECOND), now + 4 * SECOND)).status, 200);
  });
});

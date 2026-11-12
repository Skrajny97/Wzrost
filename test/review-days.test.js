// The code review of 12.11.2026: a record of a later day or week, met by a
// request whose clock is earlier. A request begun before midnight and done
// after another one of the new day reads that request's record of the new
// day with its own clock, of the day before. Each limit below took a record
// of another day as none: the late request went through once more and
// wrote its day over the new day's record, so the new day's limit opened
// again. The 0.2.71 review fixed this for the Pustelnik's Punkty Czasu, the
// quests and the Koło Fortuny; test/review-osada.test.js shows it for the
// Sala prób, the Kuźnia's scrolls, the wanted posters and the residents'
// gifts. Each test fails on the code as it was reviewed.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  companionGift,
  companionTraining,
  drawCandidates,
  givenToday,
  questPeriod,
  rumorToday,
  settleBoard,
  talkedToday,
  tradePoints,
  tradeView,
} from '../src/engine/index.js';
import { makeClimber } from './helpers/climb.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 12, 22, 59, 59, 900);
const today = questPeriod('daily', NOW, content).key;
const tomorrow = questPeriod('daily', NOW + DAY, content).key;
const nextWeek = questPeriod('weekly', NOW + 7 * DAY, content).key;
const character = newCharacter('warrior', { level: 40, classLevel: 40 });

describe('the Osada in the engine: a later day counts as today', () => {
  test("the Karczma's rumor of a later day is today's", () => {
    const stored = { day: tomorrow, areaId: content.areas.at(-1).id, monsterId: 'wolf' };
    assert.equal(rumorToday(stored, NOW, content), stored);
  });

  test("a companion's talk of a later day is today's, and its trainings of a later day leave none", () => {
    const [candidate] = drawCandidates({ character, seed: 's' }, NOW, content);
    assert.equal(talkedToday({ ...candidate, talkedOn: tomorrow }, NOW, content), true);
    const training = companionTraining({ ...candidate, level: 20, trained: { day: tomorrow, count: 1 } }, 60, NOW, content);
    assert.deepEqual([training.left, training.block], [0, 'day']);
  });

  test("a companion's gift of a later week is this week's", () => {
    const [candidate] = drawCandidates({ character, seed: 's' }, NOW, content);
    const companion = { ...candidate, profession: content.settlement.companions.professions[0].id, giftWeek: nextWeek };
    assert.equal(companionGift(companion, { character, seed: 's' }, NOW, content), null);
  });

  test("Jagna's trade of a later day gives no more points and stays", () => {
    const stored = { day: tomorrow, points: 1, gold: 0 };
    const traded = tradePoints(1_000_000, 40, stored, NOW, content);
    assert.equal(traded.points, 0);
    assert.equal(traded.trade, stored);
    assert.equal(tradeView(stored, 40, NOW, content).today, 1);
  });

  test("a resident's gift of a later day is today's", () => {
    assert.equal(givenToday({ given: { headman: tomorrow } }, 'headman', NOW, content), true);
  });

  test("the board's order of a later week stays as it is", () => {
    const weekly = { period: nextWeek, order: null, done: true };
    const board = settleBoard({ slots: [], weekly, delivered: 0, turn: 0 }, { character, reputation: {}, seed: 's' }, NOW, content);
    assert.deepEqual(board.weekly, weekly);
  });
});

describe('the Wieże and the Portale: a later day counts as today', () => {
  const { call, db, signUp } = useServer();
  let cookie;
  let id;
  beforeEach(async () => {
    ({ cookie } = await signUp('nocny'));
    await call('POST', '/api/character', { cookie, body: { name: 'Nocny', classId: 'warrior', appearance: 'female' } });
    ({ id } = await (await db()).prepare('SELECT id FROM characters').first());
  });
  const realTomorrow = () => questPeriod('daily', Date.now() + DAY, content).key;

  test("the Wieże's entries of a later day leave none, and the record stays", async () => {
    const database = await db();
    await makeClimber(database, id);
    const record = JSON.stringify({ day: realTomorrow(), used: content.towers.entries.perDay, best: {} });
    await database.prepare('UPDATE characters SET towers = ? WHERE id = ?').bind(record, id).run();
    const entered = await call('POST', '/api/towers/enter', { cookie, body: { tower: 'solo' } });
    assert.equal(entered.status, 409, `a request of the day before entered a tower with the entries of ${realTomorrow()} used (${entered.status})`);
    assert.equal(entered.data.error.code, 'no_entries');
    assert.equal((await database.prepare('SELECT towers FROM characters WHERE id = ?').bind(id).first()).towers, record);
  });

  test("the Portale's sweeps of a later day leave none, and the record stays", async () => {
    const database = await db();
    const portal = content.portals.portals[0].id;
    const record = JSON.stringify({ best: { [portal]: 1 }, day: realTomorrow(), swept: { [portal]: content.portals.sweeps.perDay } });
    await database.prepare('UPDATE characters SET level = 20, portals = ? WHERE id = ?').bind(record, id).run();
    const swept = await call('POST', '/api/portals/sweep', { cookie, body: { portal } });
    assert.equal(swept.status, 409, `a request of the day before swept a portal with the sweeps of ${realTomorrow()} used (${swept.status})`);
    assert.equal(swept.data.error.code, 'no_sweeps');
    assert.equal((await database.prepare('SELECT portals FROM characters WHERE id = ?').bind(id).first()).portals, record);
  });
});

describe("the Warownia's Ołtarz: a later day counts as today", () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on', FORTRESS: 'on' });

  test("a blessing of a later day is today's, and no other is chosen over it", async () => {
    const { cookie } = await signUp('kaplan');
    await call('POST', '/api/character', { cookie, body: { name: 'Kaplan', classId: 'warrior', appearance: 'male' } });
    const database = await db();
    const { id } = await database.prepare('SELECT id FROM characters').first();
    await database.prepare('UPDATE characters SET level = 90, class_level = 90 WHERE id = ?').bind(id).run();
    for (const one of [...content.buildings.filter((building) => building.effect?.kind === 'blessing'), content.camp]) {
      await database.prepare('INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) VALUES (?, ?, ?, 0, 1)').bind(id, one.id, 1).run();
    }
    const altar = content.buildings.find((building) => building.effect?.kind === 'blessing');
    const fortress = JSON.stringify({ blessing: { day: questPeriod('daily', Date.now() + DAY, content).key, kind: altar.blessings[0].id, bonus: 0.1, left: 4 } });
    await database.prepare('UPDATE characters SET fortress = ? WHERE id = ?').bind(fortress, id).run();
    const chosen = await call('POST', '/api/fortress/blessing', { cookie, body: { kind: altar.blessings[1].id } });
    assert.equal(chosen.status, 409, `a request of the day before chose a blessing over the next day's (${chosen.status} ${JSON.stringify(chosen.data).slice(0, 160)})`);
    assert.equal(chosen.data.error.code, 'blessed_today');
    assert.equal((await database.prepare('SELECT fortress FROM characters WHERE id = ?').bind(id).first()).fortress, fortress);
  });
});

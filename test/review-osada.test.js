// Code review of the Osada (12.11.2026): each test shows a hole the code
// has, and fails on it.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { createRng, generateItem, imbueCost, questPeriod, raiseRarity, reforgeCost } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const DAY = 86400000;

describe('the Osada under review', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on' });
  let cookie;

  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const row = async () => (await db()).prepare('SELECT * FROM characters').first();
  const stored = async () => JSON.parse((await row()).settlement);
  const view = async () => (await call('GET', '/api/settlement', { cookie })).data.settlement;
  // An item in the bag, by its id.
  const insert = async (item) => {
    const { id } = await row();
    return (await (await db()).prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)').bind(id, JSON.stringify(item)).run()).meta.last_row_id;
  };
  const sword = (rarityId, seed) => generateItem({ baseId: 'sword', level: 20, rarityId, area: content.areas[0] }, createRng(seed), content);
  const points = (standingId) => content.settlement.standings.find((standing) => standing.id === standingId).points;

  beforeEach(async () => {
    ({ cookie } = await signUp('osadnik'));
    await call('POST', '/api/character', { cookie, body: { name: 'Osadnik', classId: 'warrior', appearance: 'female' } });
    await set(`level = 30, class_level = 30, tutorial = NULL, met = '["wolf"]', gold = 100000`);
  });

  // From the Znajomy standing the Zaklinaczka draws 2–3 new affixes and the
  // player keeps one of them (DECISIONS.md, Osada część I, 8: "gracz
  // zatrzymuje jeden"); the item kept its old affix until the choice.
  // The choice waits for the item by its id (pendingOf), and an item that
  // goes into the Skrzynia Konta and back is a new row with a new id: the
  // choice was gone, the old affix stayed, and the next reforge was open.
  // Now the item holds the first new affix at once.
  test('a paid reforge with a choice cannot be undone through the Skrzynia Konta', async () => {
    const item = sword('rare', 'review-choice');
    const itemId = await insert(item);
    // As in the game, the item is not the newest row (a new row takes the
    // highest id plus one).
    await insert(sword('common', 'review-other'));
    await set('settlement = ?', JSON.stringify({ relations: { [content.settlement.reforge.resident]: points('trusted') } }));
    const cost = reforgeCost(item, 0, content);
    await set('materials = ?', JSON.stringify({ [`wolf-pelt:${cost.materials.rarity}`]: cost.materials.count * 2 }));

    const reforged = await call('POST', '/api/settlement/reforge', { cookie, body: { itemId, affix: 0 } });
    assert.equal(reforged.status, 200, JSON.stringify(reforged.data));
    assert.equal(reforged.data.pending.options.length, 3);
    const { lastRoll } = reforged.data.item;

    // Into the Skrzynia Konta and back.
    assert.equal((await call('POST', '/api/chest/put', { cookie, body: { itemId } })).status, 200);
    const [boxed] = (await call('GET', '/api/chest', { cookie })).data.chest.items;
    assert.equal((await call('POST', '/api/chest/take', { cookie, body: { id: boxed.id } })).status, 200);

    const back = JSON.parse((await (await db()).prepare("SELECT data FROM items WHERE json_extract(data, '$.lastRoll') = ?").bind(lastRoll).first()).data);
    const keptOld = back.affixes[0].id === item.affixes[0].id;
    const waiting = (await view()).reforge.pending;
    const choose = await call('POST', '/api/settlement/reforge/choose', { cookie, body: { option: 0 } });
    assert.ok(
      !keptOld || waiting,
      `the reforge was paid with a choice of ${reforged.data.pending.options.length} new affixes, yet after the Skrzynia Konta the choice is gone ` +
        `(pending: ${JSON.stringify(waiting)}, choose answers ${choose.status} ${choose.data.error?.code}) and the item keeps its old affix ${item.affixes[0].id}`,
    );
  });

  // The affixes waiting for a choice were drawn for the item's rarity, so
  // one chosen after a raise at the Kuźnia came with the old rarity's value
  // on the raised item: the smith waits for the choice.
  test('the Kuźnia raises no item whose reforged affixes wait for a choice', async () => {
    const item = sword('rare', 'review-wait');
    const itemId = await insert(item);
    await set('settlement = ?', JSON.stringify({ relations: { [content.settlement.reforge.resident]: points('trusted') } }));
    const cost = reforgeCost(item, 0, content);
    const materials = { 'wolf-pelt:rare': 50 };
    const key = `wolf-pelt:${cost.materials.rarity}`;
    materials[key] = (materials[key] ?? 0) + cost.materials.count;
    await set('materials = ?', JSON.stringify(materials));
    const reforged = await call('POST', '/api/settlement/reforge', { cookie, body: { itemId, affix: 0 } });
    assert.equal(reforged.status, 200, JSON.stringify(reforged.data));
    assert.ok(reforged.data.pending);
    const raised = await call('POST', '/api/settlement/forge/raise', { cookie, body: { itemId } });
    assert.equal(raised.status, 409, `the smith raised the item while its affixes waited for a choice: ${JSON.stringify(raised.data).slice(0, 200)}`);
    assert.equal(raised.data.error.code, 'choose_first');
    // After the choice the smith takes it.
    assert.equal((await call('POST', '/api/settlement/reforge/choose', { cookie, body: { option: 1 } })).status, 200);
    assert.equal((await call('POST', '/api/settlement/forge/raise', { cookie, body: { itemId } })).status, 200);
  });

  // The choice of a reforged affix writes the item's whole list of affixes
  // as it read them, under no condition on the item or the character but
  // the waiting roll. A raise at the Kuźnia saved between its read and its
  // write (here by a trigger on the Time Points every request settles
  // first, characters.js) is undone: the raise's new affix is gone, while the
  // item keeps the new rarity and its mark of a raise done, so it is never
  // raised again.
  test("choosing a reforged affix keeps a raise at the Kuźnia saved meanwhile", async () => {
    const database = await db();
    const item = sword('rare', 'review-raise');
    const itemId = await insert(item);
    await set('settlement = ?', JSON.stringify({ relations: { [content.settlement.reforge.resident]: points('trusted') } }));
    const cost = reforgeCost(item, 0, content);
    await set('materials = ?', JSON.stringify({ [`wolf-pelt:${cost.materials.rarity}`]: cost.materials.count }));
    const reforged = await call('POST', '/api/settlement/reforge', { cookie, body: { itemId, affix: 0 } });
    assert.equal(reforged.status, 200, JSON.stringify(reforged.data));
    assert.ok(reforged.data.pending);

    // The raise's own batch (forge.js, raiseAtForge), as the smith saves it.
    const raised = raiseRarity(reforged.data.item, createRng('review-raise'), content);
    assert.equal(raised.affixes.length, item.affixes.length + 1);
    const { id } = await row();
    await set('time_points_at = 0');
    await database
      .prepare(
        `CREATE TRIGGER raise_meanwhile AFTER UPDATE OF time_points_at ON characters WHEN NEW.id = ${id}
         BEGIN
           UPDATE items SET data = json_set(data, '$.rarity', '${raised.rarity}', '$.affixes', json('${JSON.stringify(raised.affixes)}'), '$.raised', json('true'), '$.lastRoll', 'raise')
             WHERE id = ${itemId};
           UPDATE characters SET gold = gold - 2000, version = version + 1 WHERE id = ${id};
         END`,
      )
      .run();
    let chosen;
    try {
      chosen = await call('POST', '/api/settlement/reforge/choose', { cookie, body: { option: 1 } });
    } finally {
      await database.prepare('DROP TRIGGER IF EXISTS raise_meanwhile').run();
    }
    const saved = JSON.parse((await database.prepare('SELECT data FROM items WHERE id = ?').bind(itemId).first()).data);
    assert.equal(
      saved.affixes.length,
      raised.affixes.length,
      `the choice answered ${chosen.status} and left a ${saved.rarity} item${saved.raised ? ', marked as raised,' : ''} with ${saved.affixes.length} affix(es): ` +
        `the raise's new affix ${raised.affixes.at(-1).id} is gone`,
    );
  });

  // An imbue saves the element and the payment only while the character is
  // as read, and then reads it again to check: its gold must be the gold read
  // less the price. Gold that comes in without a change of the version (an
  // outbid's refund at the Targowisko, market.js; the Loteria's pot; a guild
  // war's reward) makes a saved and paid imbue answer 409 "try again", whose
  // retry is refused (same_element).
  test('an imbue saved and paid says so, though gold came in meanwhile', async () => {
    const database = await db();
    const item = sword('rare', 'review-imbue');
    const itemId = await insert(item);
    const cost = imbueCost(item, 'fire', content);
    await set('materials = ?', JSON.stringify({ [cost.stack]: cost.count }));
    const { id, gold } = await row();
    await set('time_points_at = 0');
    // The refund of an outbid (market.js, refund), which keeps the version.
    await database
      .prepare(`CREATE TRIGGER refund_meanwhile AFTER UPDATE OF time_points_at ON characters WHEN NEW.id = ${id} BEGIN UPDATE characters SET gold = gold + 500 WHERE id = ${id}; END`)
      .run();
    let imbued;
    try {
      imbued = await call('POST', '/api/settlement/imbue', { cookie, body: { itemId, element: 'fire' } });
    } finally {
      await database.prepare('DROP TRIGGER IF EXISTS refund_meanwhile').run();
    }
    const saved = JSON.parse((await database.prepare('SELECT data FROM items WHERE id = ?').bind(itemId).first()).data);
    assert.equal(saved.imbue?.element, 'fire');
    assert.equal((await row()).gold, gold + 500 - cost.gold);
    assert.equal(imbued.status, 200, `the item took fire and ${cost.gold} gold was paid, yet the answer is ${imbued.status} ${imbued.data.error?.code}`);
    const retry = await call('POST', '/api/settlement/imbue', { cookie, body: { itemId, element: 'fire' } });
    assert.equal(retry.data.error.code, 'same_element');
  });

  // A request begun before midnight and done after another one of the new
  // day reads that request's record of the new day with its own clock, of
  // the day before (the code review, 0.2.71, fixed this for the Pustelnik's
  // Punkty Czasu, the quests and the Koło Fortuny: a record of a later day
  // leaves nothing to do). The daily limits of the Osada below still take a
  // record of another day as none: the late request goes through once more
  // and writes its day over the new day's record, so the new day's limit
  // opens again.
  describe('a record of a later day, met by a request whose clock is earlier', () => {
    const today = () => questPeriod('daily', Date.now(), content).key;
    const tomorrow = () => questPeriod('daily', Date.now() + DAY, content).key;

    test("the Sala prób's free trial of the day", async () => {
      const day = tomorrow();
      await set('trial_hall = ?', JSON.stringify({ day }));
      const entered = await call('POST', '/api/settlement/trial-hall', { cookie });
      const record = JSON.parse((await row()).trial_hall);
      assert.equal(
        entered.status,
        409,
        `with the trial of ${day} done, a request of ${today()} ran another one (${entered.status}, ${entered.data.report?.fights.length} fights, +${entered.data.report?.summary?.xp} XP) and wrote the record back to ${record.day}`,
      );
      assert.equal(record.day, day);
    });

    test("the Kuźnia's Zwoje ochronne of the day", async () => {
      const day = tomorrow();
      const { daily } = content.settlement.forge.scroll;
      await set('settlement = ?', JSON.stringify({ forge: { day, scrolls: daily, steady: daily } }));
      const bought = await call('POST', '/api/settlement/forge/scrolls', { cookie, body: { count: daily } });
      const { forge } = await stored();
      assert.equal(
        bought.status,
        409,
        `with all ${daily} scrolls of ${day} bought, a request of ${today()} bought ${bought.data.bought?.count} more and wrote ${JSON.stringify(forge)}`,
      );
      assert.equal(forge.day, day);
    });

    // The day's first look after midnight keeps the new day's record of the
    // wanted posters (wantedToKeep), with nothing done yet. A late request
    // reads it as no record of its own day: the posters of the day gone are
    // all open again, those whose bounty was claimed that day too.
    test('a wanted poster of the day, its bounty claimed', async () => {
      const day = tomorrow();
      const [poster] = (await view()).wanted.posters;
      assert.equal((await call('POST', '/api/settlement/wanted', { cookie, body: { posterId: poster.id } })).status, 200);
      // Its target falls on an exploration (wantedAfterHunt), and the bounty is claimed.
      const beaten = () => set(`settlement = json_set(settlement, '$.wanted.taken.beaten', json('true'))`);
      await beaten();
      const first = await call('POST', '/api/settlement/wanted/claim', { cookie });
      assert.equal(first.status, 200, JSON.stringify(first.data));
      assert.ok((await stored()).wanted.done.includes(poster.id));
      // Midnight: the new day's first look keeps its record.
      const { wanted } = await stored();
      await set(`settlement = json_set(settlement, '$.wanted', json(?))`, JSON.stringify({ day, basis: wanted.basis, done: [], taken: null }));
      const late = await call('POST', '/api/settlement/wanted', { cookie, body: { posterId: poster.id } });
      let second = null;
      if (late.status === 200) {
        await beaten();
        second = await call('POST', '/api/settlement/wanted/claim', { cookie });
      }
      assert.notEqual(
        late.status,
        200,
        `the poster ${poster.id}, its bounty of ${first.data.claimed.gold} gold claimed, was taken again by a request of ${today()} after the record of ${day} came, ` +
          `and its bounty claimed a second time (${second?.status}, +${second?.data.claimed?.gold} gold, +${second?.data.claimed?.timePoints} Time Points)`,
      );
    });

    test("a resident's gift of the day", async () => {
      const day = tomorrow();
      const resident = content.settlement.orders.resident;
      await set('settlement = ?', JSON.stringify({ gifts: { given: { [resident]: day } } }));
      const given = await call('POST', '/api/settlement/residents/gift', { cookie, body: { resident } });
      const { gifts } = await stored();
      assert.equal(given.status, 409, `with the gift of ${day} given, a request of ${today()} gave another one and wrote ${JSON.stringify(gifts)}`);
      assert.equal(gifts.given[resident], day);
    });
  });

  // Jagna's check of the goods looks the kind up in an object literal, so
  // "constructor" (Object) passes it, as "toString" passes the goods' check
  // (a function): the price of goods that do not exist then throws.
  test('Jagna answers goods she does not know with an error of the request, not a server error', async () => {
    const answer = await call('POST', '/api/settlement/herbalist', { cookie, body: { kind: 'constructor', id: 'toString', count: 1 } });
    assert.ok(answer.status < 500, `POST /api/settlement/herbalist {kind: "constructor", id: "toString"} answered ${answer.status} ${JSON.stringify(answer.data)}`);
  });

  // The code review, 13.11.2026: the Osada's first look of a day keeps the
  // record the day's wanted posters are drawn from (getSettlement,
  // saveBoard), but saved it without moving the character's version, so an
  // Osada action that had read the character before it (here rejecting an
  // order, as rejectSettlementOrder writes, guarded by the version it read)
  // still went through after it and wrote its older Osada over the record,
  // which the next look then drew anew. The trigger makes that action's
  // write land right after the look's save.
  test("the day's first look keeps its wanted posters' record against an Osada action read before it", async () => {
    await view();
    assert.ok((await stored()).wanted?.basis, 'the first look keeps the record');
    // A new day's first look to come: no record of it yet.
    await set("settlement = json_remove(settlement, '$.wanted')");
    const before = await row();
    // The Osada as that action read it: without the record.
    const older = before.settlement.replaceAll("'", "''");
    await (await db())
      .prepare(
        `CREATE TRIGGER rejected_meanwhile AFTER UPDATE OF settlement ON characters
         WHEN json_extract(NEW.settlement, '$.wanted') IS NOT NULL AND json_extract(OLD.settlement, '$.wanted') IS NULL
         BEGIN
           UPDATE characters SET settlement = '${older}', version = version + 1 WHERE id = NEW.id AND version = ${before.version};
         END`,
      )
      .run();
    let seen;
    try {
      seen = await view();
    } finally {
      await (await db()).prepare('DROP TRIGGER IF EXISTS rejected_meanwhile').run();
    }
    const kept = (await stored()).wanted;
    assert.ok(kept?.basis, `the record stays: ${JSON.stringify(await stored())}`);
    assert.equal(kept.day, questPeriod('daily', Date.now(), content).key);
    // The next look shows the same posters.
    assert.deepEqual((await view()).wanted, seen.wanted);
  });
});

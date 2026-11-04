// The Zwój utrwalenia (the author's of 4.11.2026, 598 C, 599 B): on the
// Kowadło a failed try keeps the item's level; the Kuźnia sells it for 1000
// gold and the Zwój ochronny for 2000, both cheaper with the Bractwo Kowali;
// the Warsztat makes it from level 10 of the profession, of 5 Okucia and 30
// minutes each.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { createRng, rollUpgrade, scrollCost, scrollMinutes, scrollOrderMinutes, scrollPrice } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const { standings } = content.settlement;
const forge = content.settlement.forge;
const steadyScroll = content.workshop.steadyScroll;
const points = (id) => standings.find((standing) => standing.id === id).points;

describe('the Zwój utrwalenia in the engine', () => {
  const item = { base: 'chainmail', slot: 'chest', level: 20, rarity: 'common', affixes: [], armor: 15, upgrade: 8 };

  test('a failure keeps the level, a break stays a break unless a Zwój ochronny lies there too, and the draws are the same', () => {
    const seen = new Set();
    for (let index = 0; index < 400; index += 1) {
      const seed = `steady-${index}`;
      const plain = rollUpgrade(item, createRng(seed), content);
      const steady = rollUpgrade(item, createRng(seed), content, { steady: true });
      const both = rollUpgrade(item, createRng(seed), content, { steady: true, warded: true });
      seen.add(plain.result);
      if (plain.result === 'success') {
        assert.deepEqual(steady, plain);
      } else if (plain.result === 'failure') {
        assert.deepEqual([plain.upgrade, steady.result, steady.upgrade, steady.kept], [7, 'failure', 8, true]);
      } else {
        // Broken: the Zwój utrwalenia alone does not keep the item.
        assert.deepEqual(steady, plain);
        assert.deepEqual([both.result, both.upgrade, both.saved, both.kept], ['failure', 8, true, true]);
      }
    }
    assert.deepEqual([...seen].sort(), ['broken', 'failure', 'success']);
    // At +0 a failure takes nothing, and the scroll has nothing to keep.
    const fresh = { ...item, upgrade: 0 };
    for (let index = 0; index < 50; index += 1) {
      const outcome = rollUpgrade(fresh, createRng(`zero-${index}`), content, { steady: true });
      assert.ok(!outcome.kept);
    }
  });

  test('the Kuźnia: the Zwój ochronny for 2000 gold, the Zwój utrwalenia for 1000, both cheaper with the Bractwo Kowali', () => {
    assert.deepEqual([forge.scroll.gold, forge.steadyScroll.gold], [2000, 1000]);
    assert.equal(scrollPrice(0, content), 2000);
    assert.equal(scrollPrice(0, content, 'steadyScroll'), 1000);
    assert.equal(scrollPrice(points('friend'), content, 'steadyScroll'), Math.round(1000 * (1 - forge.discount.at(-1))));
    assert.equal(scrollPrice(points('friend'), content), Math.round(2000 * (1 - forge.discount.at(-1))));
  });

  test('the Warsztat: from level 10 of the profession, 5 Okucia and 30 minutes a scroll, as fast as the profession makes it', () => {
    assert.deepEqual([steadyScroll.level, steadyScroll.part, steadyScroll.parts, steadyScroll.minutes], [10, 'fittings', 5, 30]);
    assert.deepEqual(scrollCost(3, content, steadyScroll), { parts: { fittings: 15 } });
    assert.equal(scrollMinutes(1, content, 0, steadyScroll), 30);
    assert.ok(scrollMinutes(40, content, 0, steadyScroll) < 30);
    assert.equal(scrollOrderMinutes(2, 1, content, 0, steadyScroll), 60);
    // The Zwój ochronny's as before.
    assert.deepEqual(scrollCost(1, content), { parts: { shards: 2 } });
  });
});

describe('the Zwój utrwalenia through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on', SETTLEMENT: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('kowal'));
    await call('POST', '/api/character', { cookie, body: { name: 'Kowal', classId: 'warrior', appearance: 'male' } });
    await (await db()).prepare(`UPDATE characters SET level = 25, class_level = 25, gold = 100000, parts = '{"fittings":40}', resources = '{"wood":50,"stone":200,"iron-ore":2000}'`).run();
  });

  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const row = async () => (await db()).prepare('SELECT * FROM characters').first();

  test('the Kuźnia sells three of each scroll a day, each at its own price', async () => {
    const view = (await call('GET', '/api/settlement', { cookie })).data.settlement.forge;
    assert.deepEqual(view.scroll, { price: 2000, daily: 3, left: 3, have: 0 });
    assert.deepEqual(view.steadyScroll, { price: 1000, daily: 3, left: 3, have: 0 });
    const steady = await call('POST', '/api/settlement/forge/scrolls', { cookie, body: { count: 3, kind: 'steady' } });
    assert.equal(steady.status, 200, JSON.stringify(steady.data));
    assert.deepEqual([steady.data.bought.gold, steady.data.bought.kind], [3000, 'steady']);
    assert.equal(steady.data.character.steadyScrolls, 3);
    assert.equal(steady.data.settlement.forge.steadyScroll.left, 0);
    assert.equal((await call('POST', '/api/settlement/forge/scrolls', { cookie, body: { count: 1, kind: 'steady' } })).data.error.code, 'sold_out');
    // The Zwoje ochronne keep their own three.
    const ward = await call('POST', '/api/settlement/forge/scrolls', { cookie, body: { count: 1 } });
    assert.equal(ward.status, 200, JSON.stringify(ward.data));
    assert.deepEqual([ward.data.bought.gold, ward.data.character.scrolls, ward.data.settlement.forge.scroll.left], [2000, 1, 2]);
    const after = await row();
    assert.deepEqual([after.gold, after.scrolls, after.steady_scrolls], [100000 - 5000, 1, 3]);
  });

  test('on the Kowadło the scroll goes with each try it lies on, and a failure keeps the level', async () => {
    const database = await db();
    const { id } = await row();
    const itemId = (
      await database
        .prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)')
        .bind(id, JSON.stringify({ base: 'chainmail', slot: 'chest', level: 5, rarity: 'common', affixes: [], armor: 15, upgrade: 3 }))
        .run()
    ).meta.last_row_id;
    await database.prepare("INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) VALUES (?, 'anvil', 10, 0, 1)").bind(id).run();
    const upgrade = (body) => call('POST', `/api/items/${itemId}/upgrade`, { cookie, body });
    assert.equal((await upgrade({ steady: true })).data.error.code, 'no_steady_scroll');
    await set('steady_scrolls = 40');
    // Tries at +3 until one fails (a quarter of them do); every try takes a scroll.
    let tries = 0;
    let failure = null;
    let level = 3;
    while (!failure && tries < 40) {
      const tried = await upgrade({ steady: true });
      assert.equal(tried.status, 200, JSON.stringify(tried.data));
      tries += 1;
      assert.equal(tried.data.upgrade.steadied, true);
      if (tried.data.upgrade.result === 'failure') failure = tried.data.upgrade;
      else level = tried.data.upgrade.to;
      if (level >= 4 && !failure) {
        // Back to +3 for the next try, where no materials are asked.
        await database.prepare("UPDATE items SET data = json_set(data, '$.upgrade', 3) WHERE id = ?").bind(itemId).run();
        level = 3;
      }
    }
    assert.ok(failure, 'a try failed');
    assert.deepEqual([failure.from, failure.to, failure.kept], [3, 3, true]);
    assert.equal((await row()).steady_scrolls, 40 - tries);
    // The item card and the Kowadło know the scrolls.
    assert.equal((await character()).steadyScrolls, 40 - tries);
  });

  test('the Warsztat makes Zwoje utrwalenia from level 10 of the profession, and they go to the Kowadło', async () => {
    await set(`professions = '{"crafting":{"level":9,"xp":0}}'`);
    const locked = await call('POST', '/api/professions/craft', { cookie, body: { scroll: 'steady', count: 2 } });
    assert.equal(locked.status, 403);
    assert.equal((await character()).professions.workshop.steadyScroll.hidden, true);
    await set(`professions = '{"crafting":{"level":10,"xp":0}}'`);
    const view = (await character()).professions.workshop.steadyScroll;
    assert.deepEqual([view.name, view.part.name, view.parts, view.owned], ['Zwój utrwalenia', 'Okucia', 5, 0]);
    const started = await call('POST', '/api/professions/craft', { cookie, body: { scroll: 'steady', count: 2 } });
    assert.equal(started.status, 201, JSON.stringify(started.data));
    const { activity } = started.data.character;
    assert.deepEqual([activity.base.name, activity.scroll, activity.count], ['Zwój utrwalenia', true, 2]);
    await (await db()).prepare('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ?').bind(activity.minutes * 60000, activity.minutes * 60000).run();
    const { report, character: after } = (await call('POST', '/api/hunts/claim', { cookie })).data;
    assert.equal(report.made, 'Wykonano: 2 × Zwój utrwalenia.');
    assert.deepEqual([after.steadyScrolls, after.scrolls], [2, 0]);
    assert.equal(after.crafting.parts.find((part) => part.id === 'fittings').count, 30);
  });
});

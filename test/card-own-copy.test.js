// A card at its top level held only with copies from others (1193 B; the
// author, 19.11.2026: „taka karta wypada dalej, aż postać znajdzie własną
// kopię”; DECISIONS.md, „Karty Talii: Skrzynia Konta, Targowisko i
// Wymiana”): the sources of cards weigh the collection so (dropCollection in
// src/server/cards.js) that such a card is not done yet. An exploration's
// creatures, the day's pack and a tier's first win still give it, while a
// card with a copy of the character's own at its top level stays done. The
// copy that comes is the character's own: from then on the Encyklopedia
// counts the card, and no source gives it again.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { cardHomes, cardRarity, hostTier } from '../src/engine/index.js';
import { cardCollection, dropCollection, maxedCards } from '../src/server/cards.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rules = content.cards;
const TOP = rules.stats.maxLevel;
const CARDS = [...cardHomes(content).keys()];
const EFFECTS = rules.effects.cards.map((card) => card.id);
// The creatures of the Gęstwina dzików, each a card.
const THICKET = ['boar', 'stag', 'wildcat', 'black-stork', 'planetnik', 'tusker'];

describe('a card at its top level held only with copies from others keeps coming (1193 B)', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on', CARDS: 'on' });
  let cookie;
  let id;
  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql} WHERE id = ?`).bind(...binds, id).run();
  const tab = async () => (await call('GET', '/api/cards', { cookie })).data.cards;
  const held = async (monster) => (await db()).prepare('SELECT copies, traded FROM cards WHERE character_id = ? AND monster_id = ?').bind(id, monster).first();
  const found = async (monster) => {
    const book = (await call('GET', '/api/encyclopedia', { cookie })).data.encyclopedia.cards;
    return book.lands.flatMap((land) => land.cards).some((card) => card.id === monster && card.found);
  };
  // Every card of the game at its top level with copies of the character's
  // own, and every effect card too; then those of `foreign` held only with
  // copies from others, `copies` of them.
  async function allTop(foreign = [], copies = TOP) {
    const database = await db();
    await database.batch([
      ...CARDS.map((card) =>
        database
          .prepare('INSERT INTO cards (character_id, monster_id, copies, traded, created_at) VALUES (?, ?, ?, 0, 1) ON CONFLICT (character_id, monster_id) DO UPDATE SET copies = excluded.copies, traded = 0')
          .bind(id, card, TOP),
      ),
      ...EFFECTS.map((effect) =>
        database
          .prepare('INSERT INTO card_effects (character_id, effect_id, copies, created_at) VALUES (?, ?, ?, 1) ON CONFLICT (character_id, effect_id) DO UPDATE SET copies = excluded.copies')
          .bind(id, effect, TOP),
      ),
      ...foreign.map((card) => database.prepare('UPDATE cards SET copies = ?, traded = ? WHERE character_id = ? AND monster_id = ?').bind(copies, copies, id, card)),
    ]);
  }

  beforeEach(async () => {
    ({ cookie } = await signUp('kolekcjonerka'));
    await call('POST', '/api/character', { cookie, body: { name: 'Kolekcjonerka', classId: 'warrior', appearance: 'female' } });
    id = (await (await db()).prepare("SELECT id FROM characters WHERE name = 'Kolekcjonerka'").first()).id;
    await set('level = 30, class_level = 30, gold = 100000');
    assert.equal((await call('POST', '/api/cards/starter', { cookie })).status, 200);
  });

  test('as the sources weigh the collection: such a card one below its top level, a card with a copy of its own as it is', async () => {
    const database = await db();
    const put = (card, copies, traded) =>
      database
        .prepare('INSERT INTO cards (character_id, monster_id, copies, traded, created_at) VALUES (?, ?, ?, ?, 1) ON CONFLICT (character_id, monster_id) DO UPDATE SET copies = excluded.copies, traded = excluded.traded')
        .bind(id, card, copies, traded)
        .run();
    // Its own at the top; only from others at the top, and past it; one of
    // its own among those from others; only from others below the top.
    await put('boar', TOP, 0);
    await put('stag', TOP, TOP);
    await put('wildcat', TOP + 2, TOP + 2);
    await put('black-stork', TOP, TOP - 1);
    await put('planetnik', 2, 2);
    const drops = await dropCollection(database, id);
    const all = await cardCollection(database, id);
    assert.deepEqual([...drops.keys()].sort(), [...all.keys()].sort(), 'the same cards: none held only so is a card not got');
    assert.deepEqual(
      ['boar', 'stag', 'wildcat', 'black-stork', 'planetnik'].map((card) => drops.get(card)),
      [TOP, TOP - 1, TOP - 1, TOP, 2],
    );
    const maxed = maxedCards(drops);
    assert.ok(maxed.includes('boar') && maxed.includes('black-stork'));
    assert.ok(!maxed.includes('stag') && !maxed.includes('wildcat') && !maxed.includes('planetnik'));
  });

  test("the day's pack still sells and gives it; its copy is the character's own, so the Encyklopedia counts it and nothing is left to buy", async () => {
    const card = 'stag';
    await allTop([card]);
    assert.equal(await found(card), false, 'copies from others fill no Encyklopedia');
    assert.equal((await tab()).pack.empty, false);
    const bought = await call('POST', '/api/cards/pack', { cookie });
    assert.equal(bought.status, 200, JSON.stringify(bought.data));
    assert.deepEqual(
      bought.data.pack.map(({ id: one, level, fresh }) => ({ id: one, level, fresh })),
      [{ id: card, level: TOP, fresh: false }],
    );
    assert.deepEqual(await held(card), { copies: TOP + 1, traded: TOP });
    assert.equal(await found(card), true);
    // Done now, with a copy of its own: the next pack has nothing to give.
    assert.equal(bought.data.cards.pack.empty, true);
    assert.equal((await call('POST', '/api/cards/pack', { cookie })).data.error.code, 'pack_empty');
  });

  test('the same with a copy of its own among them: the card is done, the pack has nothing to give', async () => {
    await allTop();
    await (await db()).prepare("UPDATE cards SET traded = ? WHERE character_id = ? AND monster_id = 'stag'").bind(TOP - 1, id).run();
    assert.equal((await tab()).pack.empty, true);
    assert.equal((await call('POST', '/api/cards/pack', { cookie })).data.error.code, 'pack_empty');
  });

  // A tier's first staked win, every card of its rarity at the top level,
  // one of them only with copies from others: that one, not the stake (919 B
  // gives the stake only when every card of the rarity is done).
  test("a tier's first win gives such a card before the stake", async () => {
    const tier = hostTier(1, content);
    const fitting = CARDS.filter((card) => cardRarity(card, content) === tier.firstWin.rarity);
    assert.ok(fitting.length > 1);
    const card = fitting[fitting.length - 1];
    await allTop([card]);
    assert.equal((await call('POST', '/api/cards/match', { cookie, body: { tier: 1, staked: true } })).status, 200);
    // One card on each side, the rival's beaten at once.
    const database = await db();
    const match = JSON.parse((await database.prepare('SELECT state FROM card_matches WHERE result IS NULL').first()).state);
    for (const [side, life] of [[match.me, 99], [match.foe, 1]]) {
      const key = side.cards[0].key;
      side.lines = [key, null, null];
      side.hand = [];
      side.deck = [];
      side.out = side.cards.map((one) => one.key).filter((one) => one !== key);
      side.cards[0].life = life;
    }
    match.foe.cards[0].attack = 1;
    match.me.cards[0].attack = Math.max(match.me.cards[0].attack, 1);
    await database.prepare('UPDATE card_matches SET state = ? WHERE result IS NULL').bind(JSON.stringify(match)).run();
    const won = await call('POST', '/api/cards/turn', { cookie, body: { round: match.round, lines: match.me.lines } });
    assert.equal(won.status, 200, JSON.stringify(won.data));
    assert.equal(won.data.end.result, 'won');
    assert.equal(won.data.end.card?.id, card);
    assert.equal(won.data.end.card.level, TOP);
    assert.equal(won.data.end.cardGold, undefined);
    assert.deepEqual(await held(card), { copies: TOP + 1, traded: TOP });
    assert.equal(await found(card), true);
  });

  test("an exploration's creatures still leave such a card, as the character's own; then it is done", async () => {
    await set('level = 60, class_level = 50');
    // Every card done but those of the place's creatures, held only with
    // copies from others: no other card can come.
    await allTop(THICKET);
    let report = null;
    for (let attempt = 0; attempt < 40 && !report; attempt += 1) {
      const started = await call('POST', '/api/hunts', { cookie, body: { areaId: 'boar-thicket', minutes: 240 } });
      assert.equal(started.status, 201, JSON.stringify(started.data));
      await (await db()).prepare('UPDATE activities SET seed = ?, hp_at_start = 99999, started_at = started_at - ?, ends_at = ends_at - ?').bind(`wlasna:${attempt}`, 240 * 60000, 240 * 60000).run();
      const claimed = await call('POST', '/api/hunts/claim', { cookie });
      assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
      // A creature's card (an effect card or a pack of cards may come too).
      if (claimed.data.report.cards?.some((one) => !one.effect && !one.pack)) report = claimed.data.report;
      await set('hp = 99999, level = 60, class_level = 50');
    }
    assert.ok(report, 'w 40 wyprawach wypadła karta');
    const cards = report.cards.filter((one) => !one.effect && !one.pack);
    for (const card of cards) {
      assert.ok(THICKET.includes(card.id), card.id);
      assert.deepEqual([card.level, card.fresh], [TOP, false]);
      assert.deepEqual(await held(card.id), { copies: TOP + 1, traded: TOP });
      assert.equal(await found(card.id), true);
    }
    // Done now: no source counts it below its top level any more.
    const maxed = maxedCards(await dropCollection(await db(), id));
    for (const card of cards) assert.ok(maxed.includes(card.id), card.id);
    for (const card of THICKET.filter((one) => !cards.some((got) => got.id === one))) assert.ok(!maxed.includes(card), card);
  });
});

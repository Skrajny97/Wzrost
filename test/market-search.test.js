// The search over the Targowisko's offers (a player's remarks passed on by
// the author, 11.11.2026: "za chwilę każdy będzie wystawiał coś i strasznie
// ciężko będzie coś znaleźć"): the kinds of goods as tabs, the class an
// item is for, who of the character's own can put it on now (the
// character or one of its companions, with what each wears for the card's
// comparison), the rarity, the category and the order by the price of a
// piece; made by the server over every open offer, a page at a time.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { browseOffers, drawCandidates, goodsRarity, piecePrice, wearersOf } from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const { browse } = content.settlement.market;
const piece = (base, rarity = 'rare') => ({ base, slot: content.basesById[base].slot, rarity });
const offer = (id, kind, fields) => ({ id, kind, key: null, count: 1, item: null, startPrice: 100, bid: null, endsAt: 1000 + id, myBid: null, ...fields });
// A mage at class level 30, and a warrior companion of level 30.
const team = { classId: 'mage', classLevel: 30, companions: [{ id: 'c1', name: 'Ziemowit', classId: 'warrior', level: 30, gear: [] }] };
const OFFERS = [
  // A mage's staff, of the first Tier.
  offer(1, 'item', { item: piece('staff', 'rare'), startPrice: 300 }),
  // A ring of Tier III, for any class, bid on.
  offer(2, 'item', { item: piece('band-ring', 'epic'), startPrice: 900, bid: 950 }),
  // A warrior's saber of Tier III.
  offer(3, 'item', { item: piece('saber', 'legendary'), startPrice: 5000 }),
  // Gauntlets of Tier IV: for any class, but from class level 50, and in no
  // companion's place.
  offer(4, 'item', { item: piece('gauntlets', 'common'), startPrice: 50 }),
  // Ten herbs at 4 gold a piece, one at 6, bid on by the character.
  offer(5, 'herb', { key: 'comfrey', count: 10, startPrice: 40 }),
  offer(6, 'herb', { key: 'nettle', count: 1, startPrice: 6, myBid: 6 }),
  offer(7, 'material', { key: 'wolf-pelt:rare', count: 3, startPrice: 90 }),
  offer(8, 'mineral', { key: 'amethyst', count: 2, startPrice: 200 }),
];
const search = (asked) => browseOffers(OFFERS, asked, team, content);

describe('the search over the offers, in the engine', () => {
  test('who can put an item on now: the character as "Załóż" asks, a companion as "Załóż z plecaka" asks', () => {
    assert.deepEqual(wearersOf(piece('staff'), team, content), ['me']);
    assert.deepEqual(wearersOf(piece('band-ring'), team, content), ['me', 'c1']);
    assert.deepEqual(wearersOf(piece('saber'), team, content), ['c1']);
    // Tier IV asks for class level 50; gloves are in no companion's place.
    assert.deepEqual(wearersOf(piece('gauntlets'), team, content), []);
    assert.deepEqual(wearersOf(piece('band-ring'), { ...team, companions: [] }, content), ['me']);
  });

  test('the rarity of the goods: an item\'s, a material\'s grade, a part\'s and a mineral\'s; none for herbs and potions', () => {
    assert.equal(goodsRarity({ kind: 'item', item: piece('saber', 'epic') }, content), 'epic');
    assert.equal(goodsRarity({ kind: 'material', key: 'wolf-pelt:rare' }, content), 'rare');
    assert.equal(goodsRarity({ kind: 'part', key: 'fittings' }, content), content.partsById.fittings.rarity);
    assert.equal(goodsRarity({ kind: 'mineral', key: 'amethyst' }, content), 'unique');
    assert.equal(goodsRarity({ kind: 'herb', key: 'comfrey' }, content), null);
    assert.equal(goodsRarity({ kind: 'potion', key: 'healing' }, content), null);
  });

  test('the kinds of goods are tabs of their own, each with how many it holds; none asked mixes them, as before', () => {
    const herbs = search({ show: 'all', kind: 'herb' });
    assert.deepEqual(herbs.ids, [5, 6]);
    assert.equal(herbs.view.kind, 'herb');
    assert.deepEqual(herbs.counts.kinds, { item: 4, herb: 2, potion: 0, material: 1, part: 0, mineral: 1 });
    assert.deepEqual(herbs.counts.shows, { all: 8, 'for-me': 2, bidding: 1 });
    // No categories over one kind of stacks.
    assert.equal(herbs.counts.categories, undefined);
    const any = search({});
    assert.deepEqual([any.view.show, any.view.kind, any.view.sort], ['all', 'any', 'ends']);
    assert.deepEqual(any.ids, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(search({ kind: 'gold' }).view.kind, 'any');
  });

  test('items for any class: the class\'s own and those for every class, whatever their Tier', () => {
    const warrior = search({ show: 'all', kind: 'item', classId: 'warrior' });
    assert.deepEqual(warrior.ids, [2, 3, 4]);
    assert.equal(warrior.view.classId, 'warrior');
    assert.deepEqual(warrior.counts.classes, { warrior: 3, archer: 2, mage: 3, cleric: 2, shadow: 2 });
    // An unknown class gives way; a class is no filter of stacks.
    assert.equal(search({ show: 'all', kind: 'item', classId: 'pirate' }).view.classId, null);
    assert.equal(search({ show: 'all', kind: 'herb', classId: 'warrior' }).view.classId, null);
  });

  test('"Dla mnie": the character\'s items, or a companion\'s, each with how many it can put on now', () => {
    const mine = search({ show: 'for-me' });
    assert.deepEqual([mine.ids, mine.view.who, mine.view.kind], [[1, 2], 'me', 'item']);
    assert.deepEqual(mine.counts.people, { me: 2, c1: 2 });
    assert.deepEqual(search({ show: 'for-me', who: 'c1' }).ids, [2, 3]);
    assert.equal(search({ show: 'for-me', who: 'c9' }).view.who, 'me');
    // Who can put each item of the page on, for the cards' comparisons.
    assert.deepEqual(search({ show: 'for-me', who: 'c1' }).wearers, { 2: ['me', 'c1'], 3: ['c1'] });
  });

  test('"Licytuję": the offers with the character\'s bid, of any kind', () => {
    const bidding = search({ show: 'bidding' });
    assert.deepEqual([bidding.ids, bidding.view.kind], [[6], 'any']);
    assert.deepEqual(bidding.counts.categories, { herb: 1 });
  });

  test('the rarity and the category, each giving way once nothing is in it', () => {
    const items = search({ show: 'all', kind: 'item' });
    assert.deepEqual(items.counts.rarities, { rare: 1, epic: 1, legendary: 1, common: 1 });
    assert.deepEqual(items.counts.categories, { weapon: 2, ring: 1, hands: 1 });
    assert.deepEqual(search({ show: 'all', kind: 'item', rarity: 'epic' }).ids, [2]);
    const none = search({ show: 'all', kind: 'item', rarity: 'mythic' });
    assert.deepEqual([none.view.rarity, none.ids.length], [null, 4]);
    assert.deepEqual(search({ show: 'all', kind: 'item', category: 'weapon' }).ids, [1, 3]);
    const empty = search({ show: 'all', kind: 'item', category: 'feet' });
    assert.deepEqual([empty.view.category, empty.ids.length], ['all', 4]);
    // The categories count under the rarity chosen.
    assert.deepEqual(search({ show: 'all', kind: 'item', rarity: 'rare' }).counts.categories, { weapon: 1 });
    // A material's grade is its rarity.
    assert.deepEqual(search({ show: 'all', kind: 'material', rarity: 'rare' }).ids, [7]);
  });

  test('the order: the soonest to end first, or by the price of a piece, the highest bid or the starting price (a player: "od najtańszych i od najdroższych")', () => {
    assert.equal(piecePrice({ startPrice: 40, bid: null, count: 10 }), 4);
    assert.equal(piecePrice({ startPrice: 900, bid: 950, count: 1 }), 950);
    assert.deepEqual(search({ show: 'all', kind: 'item', sort: 'cheap' }).ids, [4, 1, 2, 3]);
    assert.deepEqual(search({ show: 'all', kind: 'item', sort: 'dear' }).ids, [3, 2, 1, 4]);
    // Ten herbs for 40 are cheaper a piece than one for 6.
    assert.deepEqual(search({ show: 'all', kind: 'herb', sort: 'cheap' }).ids, [5, 6]);
    assert.deepEqual(search({ show: 'all', kind: 'herb', sort: 'dear' }).ids, [6, 5]);
    assert.equal(search({ sort: 'random' }).view.sort, 'ends');
    // At one price, the soonest to end first.
    const same = [offer(1, 'herb', { key: 'comfrey', startPrice: 5, endsAt: 30 }), offer(2, 'herb', { key: 'comfrey', startPrice: 5, endsAt: 20 })];
    assert.deepEqual(browseOffers(same, { sort: 'cheap' }, team, content).ids, [2, 1]);
  });

  test('a page at a time: `page` offers, more when asked, never past `most`; `found` counts them all', () => {
    const many = Array.from({ length: browse.most + 20 }, (_, index) => offer(index + 1, 'herb', { key: 'comfrey', startPrice: 1 + index }));
    const first = browseOffers(many, { show: 'all', kind: 'herb' }, team, content);
    assert.deepEqual([first.ids.length, first.found, first.view.limit], [browse.page, browse.most + 20, browse.page]);
    assert.equal(browseOffers(many, { show: 'all', kind: 'herb', limit: browse.page + 5 }, team, content).ids.length, browse.page + 5);
    assert.equal(browseOffers(many, { show: 'all', kind: 'herb', limit: 100000 }, team, content).ids.length, browse.most);
    // The cheapest ones first, past the first page of the soonest to end.
    assert.deepEqual(browseOffers(many, { show: 'all', kind: 'herb', sort: 'dear' }, team, content).ids[0], browse.most + 20);
  });
});

describe('the search over the offers, through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on', SETTLEMENT: 'on' });
  const cookies = {};
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();

  async function player(name, classId) {
    const { cookie } = await signUp(name.toLowerCase());
    await call('POST', '/api/character', { cookie, body: { name, classId, appearance: 'female' } });
    await run('UPDATE characters SET level = 30, class_level = 30, gold = 100000 WHERE name = ?', name);
    cookies[name] = cookie;
  }
  const row = async (name) => (await db()).prepare('SELECT * FROM characters WHERE name = ?').bind(name).first();
  const item = (base, rarity = 'rare', level = 30) => ({ base, slot: content.basesById[base].slot, level, rarity, affixes: [], implicit: { stat: 'will', value: 2 } });
  async function inBag(name, data) {
    const made = await run('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)', (await row(name)).id, JSON.stringify(data));
    return made.meta.last_row_id;
  }
  const market = async (name, query = '') => (await call('GET', `/api/market${query}`, { cookie: cookies[name] })).data.market;
  const act = (name, path, body) => call('POST', `/api/market/${path}`, { cookie: cookies[name], body });
  const offered = {};

  beforeEach(async () => {
    await player('Kramarka', 'warrior');
    await player('Kupcowa', 'mage');
    // Kupcowa's companion, a warrior of level 30 with a ring on.
    const [candidate] = drawCandidates({ character: newCharacter('mage', { level: 30 }), seed: 'szukanie' }, Date.now(), content);
    const companion = { ...candidate, id: 'c1', name: 'Ziemowit', classId: 'warrior', level: 30, skills: [], gear: [item('ring', 'common', 20)] };
    await run('UPDATE characters SET settlement = ? WHERE name = ?', JSON.stringify({ companions: [companion] }), 'Kupcowa');
    await run('UPDATE characters SET herbs = ? WHERE name = ?', JSON.stringify({ comfrey: 10, nettle: 1 }), 'Kramarka');
    for (const [base, rarity, startPrice] of [
      ['staff', 'rare', 300],
      ['band-ring', 'epic', 900],
      ['saber', 'legendary', 5000],
    ]) {
      const listed = await act('Kramarka', 'list', { kind: 'item', itemId: await inBag('Kramarka', item(base, rarity)), startPrice });
      assert.equal(listed.status, 200, JSON.stringify(listed.data));
      offered[base] = listed.data.market.mine.at(-1).id;
    }
    offered.comfrey = (await act('Kramarka', 'list', { kind: 'herb', key: 'comfrey', count: 10, startPrice: 40 })).data.market.mine.at(-1).id;
    offered.nettle = (await act('Kramarka', 'list', { kind: 'herb', key: 'nettle', count: 1, startPrice: 6 })).data.market.mine.at(-1).id;
  });

  test('the items for a class, the dearest first, with how many each kind and class holds', async () => {
    const found = await market('Kupcowa', '?show=all&kind=item&classId=warrior&sort=dear');
    assert.deepEqual(
      found.offers.map((one) => one.id),
      [offered.saber, offered['band-ring']],
    );
    assert.deepEqual([found.found, found.view.classId, found.view.sort, found.page, found.most], [2, 'warrior', 'dear', browse.page, browse.most]);
    assert.deepEqual([found.counts.kinds.item, found.counts.kinds.herb, found.counts.classes.mage], [3, 2, 2]);
    // The herbs on a tab of their own, the cheapest a piece first.
    const herbs = await market('Kupcowa', '?show=all&kind=herb&sort=cheap');
    assert.deepEqual(
      herbs.offers.map((one) => one.id),
      [offered.comfrey, offered.nettle],
    );
  });

  test('"Dla mnie" for a companion: what it can put on now, and what it wears for the comparison', async () => {
    const found = await market('Kupcowa', '?show=for-me&who=c1');
    assert.deepEqual(
      found.offers.map((one) => one.id),
      [offered['band-ring'], offered.saber],
    );
    assert.deepEqual(found.counts.people, { me: 2, c1: 2 });
    assert.deepEqual(found.offers.map((one) => one.wearers), [['me', 'c1'], ['c1']]);
    const [ziemowit] = found.team;
    assert.deepEqual([ziemowit.id, ziemowit.name, ziemowit.className, ziemowit.level], ['c1', 'Ziemowit', content.classesById.warrior.name, 30]);
    const jewelry = ziemowit.wear.find((place) => place.slot === 'jewelry');
    assert.equal(jewelry.item.base, 'ring');
    assert.ok(jewelry.item.lines.length > 0);
    // The character's own: the staff and the ring.
    assert.deepEqual(
      (await market('Kupcowa', '?show=for-me')).offers.map((one) => one.id),
      [offered.staff, offered['band-ring']],
    );
  });

  test('an action answers with the search the page sent', async () => {
    const bid = await act('Kupcowa', 'bid', { offerId: offered.nettle, amount: 6, view: { show: 'bidding' } });
    assert.equal(bid.status, 200, JSON.stringify(bid.data));
    assert.deepEqual([bid.data.market.view.show, bid.data.market.offers.map((one) => one.id)], ['bidding', [offered.nettle]]);
    // Without a search, all the offers, as before.
    assert.equal((await market('Kupcowa')).offers.length, 5);
  });

  test('every open offer counts, also past a page: "Pokaż kolejne" asks for more', async () => {
    const { id, user_id: userId } = await row('Kramarka');
    const now = Date.now();
    for (let index = 0; index < browse.page + 5; index += 1) {
      await run(
        "INSERT INTO market_offers (seller_id, seller_user_id, seller_name, kind, good, count, start_price, created_at, ends_at) VALUES (?, ?, 'Kramarka', 'herb', 'comfrey', 1, ?, ?, ?)",
        id,
        userId,
        1000 - index,
        now,
        now + 3600000 + index,
      );
    }
    const first = await market('Kupcowa', '?show=all&kind=herb&sort=cheap');
    assert.deepEqual([first.offers.length, first.found], [browse.page, browse.page + 7]);
    // The cheapest a piece first, over all of them: the ten for 40.
    assert.equal(first.offers[0].id, offered.comfrey);
    const more = await market('Kupcowa', `?show=all&kind=herb&sort=cheap&limit=${browse.page * 2}`);
    assert.equal(more.offers.length, browse.page + 7);
  });
});

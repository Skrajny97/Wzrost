// The Zaklinaczka's stars (the author, 19.11.2026: „gdy przedmiot jest na
// +10 to można mu wbić jeszcze 5 gwiazdek z małą szansą na sukces za kupę
// złota jak ma się rozwiniętą relacje z Zaklinaczką”, and his answers
// 1180 B–1184 A): an item at +10, of any rarity, takes up to five stars, each
// +10% of its base numbers; each try has its own chance (15, 12.5, 10, 7.5
// and 5%) and costs gold (twice the item's last Kowadło step, half again for
// each next star) and parts (3, 4 and 5 Bursztyny, 2 Krwawniki, a Gwiezdny
// odprysk); a failure takes the payment only. She sets them from Zaufany,
// and the stars go with the item wherever it goes.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  bareItem,
  createRng,
  generateItem,
  itemLines,
  itemProperties,
  itemUpgradeCost,
  itemView,
  maxStars,
  maxUpgrade,
  nextStar,
  rollStar,
  sellPrice,
  starBlock,
  starChance,
  starCost,
  starStanding,
  upgradedItem,
} from '../src/engine/index.js';
import { ascendAtEnchantress } from '../src/server/ascension.js';
import { toHex } from '../src/server/encoding.js';
import { readFeatures } from '../src/server/features.js';
import { content } from './helpers/content.js';
import { meanwhile, posted } from './helpers/meanwhile.js';
import { useServer } from './helpers/server.js';

const tuning = content.settlement.ascension;
const points = (id) => content.settlement.standings.find((standing) => standing.id === id).points;
const legendary = (level, extra = {}) => ({ ...generateItem({ baseId: 'sword', level, rarityId: 'legendary' }, createRng(`gwiazdy-${level}`), content), upgrade: 10, ...extra });
const sword = (extra = {}) => legendary(100, extra);
const chainmail = (extra = {}) => ({ ...generateItem({ baseId: 'chainmail', level: 60, rarityId: 'epic' }, createRng('kolczuga'), content), upgrade: 10, ...extra });
const enough = { gold: 1e9, parts: { amber: 99, bloodstone: 99, 'star-shard': 99 }, relation: points('trusted') };

// The 16 random bytes of a roll that comes off (or fails) at `stars`'s next
// star, and those bytes made the server's for a while, as in gem-fallout.test.js.
function rollBytes(stars, wanted) {
  for (let seed = 0; ; seed++) {
    const bytes = new Uint8Array(16).map((_, index) => (seed * 31 + index * 17 + (seed >> 3)) % 256);
    if (rollStar({ stars }, createRng(toHex(bytes)), content).result === wanted) return bytes;
  }
}
async function withRoll(bytes, run) {
  Object.defineProperty(globalThis.crypto, 'getRandomValues', {
    value: (array) => {
      array.set(bytes.subarray(0, array.length));
      return array;
    },
    configurable: true,
    writable: true,
  });
  try {
    return await run();
  } finally {
    delete globalThis.crypto.getRandomValues;
  }
}

describe('the stars in the engine', () => {
  test('five stars from the standing Zaufany, at 15, 12.5, 10, 7.5 and 5%, each worth 10% of the item (1180 B, 1181 A, 1183 A)', () => {
    assert.equal(maxStars(content), 5);
    assert.deepEqual(tuning.chances, [0.15, 0.125, 0.1, 0.075, 0.05]);
    assert.deepEqual([1, 2, 3, 4, 5].map((star) => starChance(star, content)), tuning.chances);
    assert.equal(content.balance.upgrades.bonusPerStar, 0.1);
    assert.deepEqual([tuning.resident, tuning.from], ['enchantress', 'trusted']);
    assert.deepEqual(starStanding(points('trusted') - 1, content), { id: 'trusted', name: 'Zaufany', open: false, toGo: 1 });
    assert.equal(starStanding(points('trusted'), content).open, true);
    assert.equal(starStanding(points('friend'), content).toGo, 0);
  });

  test('each star adds 10% of the base numbers beside the +60% of +10: five stars make 210% (1180 B)', () => {
    const base = sword({ upgrade: 0 });
    for (const stars of [0, 1, 2, 3, 4, 5]) {
      const factor = 1 + 0.06 * 10 + 0.1 * stars;
      const shown = upgradedItem(sword({ stars }), content);
      assert.deepEqual(shown.damage, { min: Math.round(base.damage.min * factor), max: Math.round(base.damage.max * factor) }, `${stars}`);
      assert.deepEqual(
        shown.affixes.map((affix) => affix.value),
        base.affixes.map((affix) => Math.round(affix.value * factor)),
      );
    }
    const armour = upgradedItem(chainmail({ stars: 5 }), content);
    assert.equal(armour.armor, Math.round(chainmail({ upgrade: 0 }).armor * 2.1));
    // Small numbers grow too: at least 1 for each star, as for each level.
    const talisman = { base: 'talisman', slot: 'talisman', level: 1, rarity: 'common', affixes: [], implicit: { stat: 'vitality', value: 1 }, upgrade: 10 };
    assert.equal(upgradedItem(talisman, content).armor, 10);
    assert.equal(upgradedItem({ ...talisman, stars: 3 }, content).armor, 13);
    // The card's lines say so.
    assert.notDeepEqual(itemProperties(sword({ stars: 1 }), content), itemProperties(sword(), content));
  });

  test('a try costs twice the gold of +9 → +10, half again for each next star, and 3, 4, 5 Bursztyny, 2 Krwawniki, a Gwiezdny odprysk (1182 A)', () => {
    assert.deepEqual(
      tuning.parts.map(({ part, count }) => [part, count, content.partsById[part].rarity]),
      [
        ['amber', 3, 'legendary'],
        ['amber', 4, 'legendary'],
        ['amber', 5, 'legendary'],
        ['bloodstone', 2, 'mythic'],
        ['star-shard', 1, 'divine'],
      ],
    );
    for (const rarity of ['common', 'legendary', 'divine']) {
      for (const level of [5, 100, 300]) {
        const item = { level, rarity, upgrade: 10 };
        const last = itemUpgradeCost(item, maxUpgrade(content), content).gold;
        for (const star of [1, 2, 3, 4, 5]) {
          const { part, count } = tuning.parts[star - 1];
          assert.deepEqual(starCost(item, star, content), { gold: Math.round(last * 2 * 1.5 ** (star - 1)), part, count });
        }
      }
    }
    // The examples of DECISIONS.md: legendary items of levels 100, 250 and 300.
    const golds = (level) => [1, 2, 3, 4, 5].map((star) => starCost({ level, rarity: 'legendary', upgrade: 10 }, star, content).gold);
    assert.deepEqual(golds(100), [53602, 80403, 120605, 180907, 271360]);
    assert.deepEqual(golds(250), [134002, 201003, 301505, 452257, 678385]);
    assert.deepEqual(golds(300), [160804, 241206, 361809, 542714, 814070]);
  });

  test('only an item at +10 takes a star, of any rarity, up to the fifth (1184 A)', () => {
    assert.equal(nextStar(sword({ upgrade: 9 }), content), null);
    assert.equal(nextStar(sword({ stars: 5 }), content), null);
    assert.deepEqual(nextStar(sword({ stars: 2 }), content), { star: 3, chance: 0.1, ...starCost(sword(), 3, content) });
    assert.equal(nextStar({ ...sword(), rarity: 'common', affixes: [] }, content).star, 1);
  });

  test('she refuses below +10, past the fifth star, below Zaufany, and without the gold or the parts', () => {
    const code = (item, held = {}) => starBlock(item, { ...enough, ...held }, content)?.code ?? null;
    assert.equal(code(sword()), null);
    assert.equal(code(sword({ upgrade: 9 })), 'not_upgraded');
    assert.equal(code(sword({ stars: 5 })), 'all_stars');
    assert.equal(code(sword(), { relation: points('regular') }), 'relation');
    assert.equal(starBlock(sword(), { ...enough, relation: 0 }, content).message, 'Zaklinaczka wbija gwiazdki od relacji „Zaufany”.');
    const cost = starCost(sword(), 1, content);
    assert.equal(code(sword(), { gold: cost.gold }), null);
    assert.equal(code(sword(), { gold: cost.gold - 1 }), 'not_enough_gold');
    assert.equal(code(sword(), { parts: { amber: 2 } }), 'not_enough_parts');
    assert.equal(starBlock(sword({ stars: 4 }), { ...enough, parts: { amber: 99 } }, content).message, 'Brakuje części: Gwiezdny odprysk (potrzeba 1).');
  });

  test('each try comes off at its own chance, and a failure leaves the item as it was (1181 A)', () => {
    for (const stars of [0, 4]) {
      let successes = 0;
      for (let seed = 0; seed < 4000; seed += 1) {
        const outcome = rollStar(sword({ stars }), createRng(`gwiazda-${stars}-${seed}`), content);
        if (outcome.result === 'success') {
          successes += 1;
          assert.equal(outcome.stars, stars + 1);
        } else assert.deepEqual(outcome, { result: 'failure', stars });
      }
      const share = successes / 4000;
      assert.ok(Math.abs(share - tuning.chances[stars]) < 0.02, `${stars}: ${share}`);
    }
  });

  test('the scrapper pays half the gold of the tries that set the stars, as for the Kowadło\'s upgrades', () => {
    const upgrades = Array.from({ length: 10 }, (_, index) => itemUpgradeCost(sword(), index + 1, content).gold).reduce((sum, gold) => sum + gold, 0);
    const stars = [1, 2].map((star) => starCost(sword(), star, content).gold).reduce((sum, gold) => sum + gold, 0);
    const own = Math.round(sword().level * content.balance.items.sellGoldPerLevel * content.raritiesById.legendary.sell);
    assert.equal(sellPrice(sword(), content), own + Math.round(upgrades * 0.5));
    assert.equal(sellPrice(sword({ stars: 2 }), content), own + Math.round((upgrades + stars) * 0.5));
  });

  test('the item card names the stars and leads to her while a star is left to take', () => {
    const view = itemView(sword({ stars: 2 }), content);
    assert.deepEqual([view.upgrade, view.stars, view.enchant.stars], [10, 2, true]);
    assert.equal('stars' in itemView(sword(), content), false);
    assert.equal(itemView(sword(), content).enchant.stars, true);
    assert.equal(itemView(sword({ stars: 5 }), content).enchant.stars, false);
    assert.equal(itemView(sword({ upgrade: 9 }), content).enchant.stars, false);
  });

  test('the verdict on wearing it counts its stars once', () => {
    const item = sword({ stars: 3 });
    const bare = bareItem(item, 'warrior', content);
    assert.deepEqual([bare.upgrade, bare.stars], [0, 0]);
    assert.deepEqual(bare.damage, upgradedItem(item, content).damage);
    assert.deepEqual(upgradedItem(bare, content).damage, bare.damage);
  });
});

describe('the stars through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on', SETTLEMENT: 'on' });
  let cookie;
  let id;
  const GOLD = 10_000_000;
  const PARTS = { amber: 20, bloodstone: 4, 'star-shard': 2 };

  const row = async () => (await db()).prepare('SELECT * FROM characters WHERE id = ?').bind(id).first();
  const stored = async (itemId) => JSON.parse((await (await db()).prepare('SELECT data FROM items WHERE id = ?').bind(itemId).first()).data);
  async function inBag(item, slot = null) {
    const made = await (await db()).prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, ?, ?, 0)').bind(id, slot, JSON.stringify(item)).run();
    return made.meta.last_row_id;
  }
  const relation = async (value) => (await db()).prepare('UPDATE characters SET settlement = ? WHERE id = ?').bind(JSON.stringify({ relations: { enchantress: value } }), id).run();
  const ascend = (body) => call('POST', '/api/settlement/stars', { cookie, body });
  // The handler itself, its roll made of `bytes`, and its database `database`.
  const ascendWith = async (bytes, body) => {
    const database = await db();
    const answer = await withRoll(bytes, () => ascendAtEnchantress({ request: posted('/api/settlement/stars', cookie, body), env: { DB: database }, now: Date.now(), params: {} }));
    return answer.json();
  };

  beforeEach(async () => {
    ({ cookie } = await signUp('gwiazdy'));
    await call('POST', '/api/character', { cookie, body: { name: 'Gwiazdka', classId: 'warrior', appearance: 'female' } });
    ({ id } = await (await db()).prepare('SELECT id FROM characters').first());
    await (await db()).prepare('UPDATE characters SET level = 30, class_level = 30, gold = ?, parts = ? WHERE id = ?').bind(GOLD, JSON.stringify(PARTS), id).run();
    await relation(points('trusted'));
    // The handlers called straight run with the Osada on.
    readFeatures({ PROFESSIONS: 'on', CRAFTING: 'on', SETTLEMENT: 'on' });
  });

  test('her Gwiazdki list the items at +10, worn first, with their stars and the next one\'s chance and price', async () => {
    const bagged = await inBag(sword({ stars: 2 }));
    await inBag(sword({ upgrade: 9 }));
    const full = await inBag(sword({ stars: 5 }));
    const worn = await inBag(chainmail(), 'chest');
    const view = (await call('GET', '/api/settlement', { cookie })).data.settlement.ascension;
    assert.deepEqual([view.open, view.standing, view.toGo], [true, 'Zaufany', 0]);
    assert.deepEqual(
      view.items.map((item) => [item.id, item.equipped, item.stars]),
      [
        [worn, true, 0],
        [bagged, false, 2],
        [full, false, 5],
      ],
    );
    const cost = starCost(sword(), 3, content);
    assert.deepEqual(view.items[1].next, { star: 3, chance: 0.1, gold: cost.gold, part: 'amber', partName: 'Bursztyn', count: 5, have: 20 });
    assert.equal(view.items[2].next, null);
    // Below Zaufany she says how far it is.
    await relation(points('regular') + 50);
    const closed = (await call('GET', '/api/settlement', { cookie })).data.settlement.ascension;
    assert.deepEqual([closed.open, closed.toGo], [false, points('trusted') - points('regular') - 50]);
    // The page's words come with the game's content.
    const words = (await call('GET', '/api/content')).data.ascension;
    assert.deepEqual([words.max, words.upgrade, words.bonus, words.texts.title, words.texts.errors], [5, 10, 0.1, 'Gwiazdki', undefined]);
  });

  test('a try that comes off sets the star and takes the payment; one that fails takes the payment only (fixed rolls)', async () => {
    const item = sword();
    const itemId = await inBag(item);
    const first = await ascendWith(rollBytes(0, 'success'), { itemId, stars: 0 });
    assert.deepEqual([first.stars.result, first.stars.from, first.stars.to, first.stars.max], ['success', 0, 1, 5]);
    const one = starCost(item, 1, content);
    assert.deepEqual([first.stars.gold, first.stars.part], [one.gold, { id: 'amber', name: 'Bursztyn', count: 3 }]);
    // Each number before the star and with it.
    const lines = itemLines({ ...item, stars: 1 }, content);
    assert.deepEqual(
      first.stars.gains,
      lines.map(({ id, label, text }) => ({ label, before: itemLines(item, content).find((line) => line.id === id).text, after: text })),
    );
    assert.ok(first.stars.gains.every((gain) => gain.before !== gain.after));
    let character = await row();
    assert.equal(character.gold, GOLD - one.gold);
    assert.deepEqual(JSON.parse(character.parts), { ...PARTS, amber: 17 });
    assert.equal(JSON.parse(character.settlement).relations.enchantress, points('trusted') + tuning.relationGain);
    assert.equal((await stored(itemId)).stars, 1);
    // The answer's views say it too.
    assert.equal(first.character.bag.find((one) => one.id === itemId).stars, 1);
    assert.equal(first.settlement.ascension.items[0].next.star, 2);

    const second = await ascendWith(rollBytes(1, 'failure'), { itemId, stars: 1 });
    assert.deepEqual([second.stars.result, second.stars.from, second.stars.to], ['failure', 1, 1]);
    const two = starCost(item, 2, content);
    character = await row();
    assert.equal(character.gold, GOLD - one.gold - two.gold);
    assert.deepEqual(JSON.parse(character.parts), { ...PARTS, amber: 13 });
    assert.equal(JSON.parse(character.settlement).relations.enchantress, points('trusted') + 2 * tuning.relationGain);
    // The item lost nothing: its stars, upgrade and numbers are as they were.
    const after = await stored(itemId);
    assert.deepEqual([after.stars, after.upgrade, after.affixes, after.damage], [1, 10, item.affixes, item.damage]);
  });

  test('she refuses what cannot take a star now, and nothing is paid', async () => {
    const itemId = await inBag(sword());
    const nine = await inBag(sword({ upgrade: 9 }));
    const full = await inBag(sword({ stars: 5 }));
    const refused = async (body, status, code) => {
      const answer = await ascend(body);
      assert.deepEqual([answer.status, answer.data.error?.code], [status, code], JSON.stringify(answer.data));
      return answer.data.error.message;
    };
    await refused({ itemId: 999999 }, 404, 'item_not_found');
    assert.equal(await refused({ itemId: nine }, 409, 'not_upgraded'), 'Gwiazdki przyjmie tylko przedmiot ulepszony do +10.');
    await refused({ itemId: full }, 409, 'all_stars');
    // A tap on a page that showed other stars than the item has now.
    assert.equal(await refused({ itemId, stars: 2 }, 409, 'item_changed'), 'Przedmiot zmienił się w międzyczasie. Spróbuj jeszcze raz.');
    await relation(points('regular'));
    await refused({ itemId }, 409, 'relation');
    await relation(points('friend'));
    await (await db()).prepare('UPDATE characters SET gold = 5 WHERE id = ?').bind(id).run();
    await refused({ itemId }, 409, 'not_enough_gold');
    await (await db()).prepare("UPDATE characters SET gold = ?, parts = '{\"amber\":2}' WHERE id = ?").bind(GOLD, id).run();
    await refused({ itemId }, 409, 'not_enough_parts');
    const character = await row();
    assert.deepEqual([character.gold, JSON.parse(character.parts)], [GOLD, { amber: 2 }]);
    assert.equal((await stored(itemId)).stars, undefined);
    // Below the Osada's level, no Zaklinaczka at all.
    await (await db()).prepare('UPDATE characters SET level = 10 WHERE id = ?').bind(id).run();
    await refused({ itemId }, 403, 'locked');
  });

  test('two taps at once make and pay one try', async () => {
    const itemId = await inBag(sword());
    const database = await db();
    // The other tap's try is saved just before this one's batch.
    const racing = meanwhile(database, /UPDATE items SET data = json_set\(data, '\$\.stars'/, () => ascend({ itemId, stars: 0 }));
    await assert.rejects(
      withRoll(rollBytes(0, 'success'), () => ascendAtEnchantress({ request: posted('/api/settlement/stars', cookie, { itemId, stars: 0 }), env: { DB: racing }, now: Date.now(), params: {} })),
      (error) => error.code === 'item_changed' && error.status === 409,
    );
    assert.ok(racing.done);
    const character = await row();
    assert.equal(character.gold, GOLD - starCost(sword(), 1, content).gold);
    assert.equal(JSON.parse(character.parts).amber, PARTS.amber - 3);
    assert.equal(JSON.parse(character.settlement).relations.enchantress, points('trusted') + tuning.relationGain);
    assert.ok((await stored(itemId)).stars <= 1);
  });

  test('the stars stay with the item sold on the Targowisko (1184 A)', async () => {
    const itemId = await inBag(sword({ stars: 3 }));
    const listed = await call('POST', '/api/market/list', { cookie, body: { kind: 'item', itemId, startPrice: 1000, buyNow: 2000 } });
    assert.equal(listed.status, 200, JSON.stringify(listed.data));
    const { cookie: buyer } = await signUp('kupiec');
    await call('POST', '/api/character', { cookie: buyer, body: { name: 'Kupiec', classId: 'warrior', appearance: 'male' } });
    await (await db()).prepare("UPDATE characters SET level = 30, class_level = 30, gold = 100000 WHERE name = 'Kupiec'").run();
    const [offer] = (await call('GET', '/api/market', { cookie: buyer })).data.market.offers;
    assert.deepEqual([offer.goods.item.upgrade, offer.goods.item.stars], [10, 3]);
    assert.equal((await call('POST', '/api/market/buy', { cookie: buyer, body: { offerId: offer.id } })).status, 200);
    const collected = await call('POST', '/api/market/collect', { cookie: buyer, body: {} });
    assert.equal(collected.status, 200, JSON.stringify(collected.data));
    const [bought] = collected.data.character.bag;
    assert.deepEqual([bought.upgrade, bought.stars], [10, 3]);
    assert.deepEqual(bought.properties, itemProperties(sword({ stars: 3 }), content));
  });
});

// The Salon Gier in the Osada (answers 523–526 and 542 C): Szczęsny's
// Loteria, a ticket of 50 zł a character a day and the whole pot of 100 zł
// and every ticket to one ticket drawn at Polish midnight, once a day, with
// the System's message in the Globalny; and the Koło Fortuny (the author on
// 4.11.2026: "Ma jedną pulę codziennie losowaną niezależnie od stawki,
// stawka zwiększa prawdopodobieństwo trafienia lepszych przedmiotów"), a
// stake of 100 zł or more in hundreds, each character's one pool of fifteen
// prizes a day, the same at every stake, 70% of the spins giving nothing at
// the lowest stake and 60% at the highest (586), and a higher stake the
// likelier to stop on a better prize; on average it gives back less than it
// takes.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  bagCapacity,
  campLevels,
  canUse,
  casinoDay,
  createRng,
  dayStakes,
  generateItem,
  knownLandMaterials,
  lotteryPot,
  lotteryWinner,
  parseStack,
  prizesLeft,
  prizeWorth,
  sellPrice,
  spinBlock,
  spinExpectation,
  spinWheel,
  ticketBlock,
  wheelDay,
  wheelOdds,
  wheelPool,
  wheelPrizes,
  wheelStakes,
  wheelWon,
} from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const { casino } = content.settlement;
const NOW = Date.parse('2026-11-03T12:00:00Z');
const rarityAt = (id) => content.rarities.findIndex((rarity) => rarity.id === id);
const character = (level, classLevel = level) => ({ level, classId: 'warrior', classLevel });

describe('the Salon Gier in the engine', () => {
  test("the author's numbers and Szczęsny, the Salon's host, in a place of his own on the board", () => {
    assert.deepEqual([casino.lottery.ticket, casino.lottery.base], [50, 100]);
    // 586: "nie 50/50 tylko 70/30 gdzie 70% to nic nietrafione na
    // najniższej stawce i rośnie wraz ze stawką do 60/40".
    assert.deepEqual([casino.wheel.step, casino.wheel.none], [100, { low: 0.7, high: 0.6 }]);
    // The author: "dominuje gówno (powiedzmy 10 z 15 przedmiotów - nawet
    // zasoby), ze 3 okey przedmioty, 1 spoko i 1 super i duża szansa też na
    // nic nie trafienie. Na maksymalnej stawce mogłoby być to 10 procent na
    // jakieś legendarne przedmioty czy czasem i mityczne".
    assert.deepEqual(
      casino.wheel.tiers.map(({ id, count, high }) => [id, count, high]),
      [
        ['weak', 10, 0.11],
        ['fair', 3, 0.11],
        ['good', 1, 0.08],
        ['great', 1, 0.1],
      ],
    );
    assert.deepEqual([casino.wheel.greatRarity, casino.wheel.mythicRarity, casino.wheel.mythicChance], ['legendary', 'mythic', 0.1]);
    const host = content.settlement.residents.find((resident) => resident.id === casino.resident);
    assert.deepEqual([host.name, host.title], ['Szczęsny', 'gospodarz Salonu Gier']);
    assert.equal(host.greetings.length, content.settlement.standings.length);
    const place = content.settlement.places.find((one) => one.resident === casino.resident);
    assert.deepEqual([place.id, place.name], ['casino', 'Salon Gier']);
  });

  test('the pot is 100 zł from the System and 50 zł for every ticket; the day ends at Polish midnight', () => {
    assert.deepEqual([0, 1, 2, 11].map((tickets) => lotteryPot(tickets, content)), [100, 150, 200, 650]);
    const day = casinoDay(NOW, content);
    assert.equal(day.key, '2026-11-03');
    // Midnight in Warsaw, an hour ahead of UTC in November.
    assert.equal(new Date(day.endsAt).toISOString(), '2026-11-03T23:00:00.000Z');
    assert.equal(casinoDay(day.endsAt, content).key, '2026-11-04');
    assert.equal(casinoDay(day.endsAt - 1, content).key, '2026-11-03');
  });

  test('a ticket a day, for its price', () => {
    assert.equal(ticketBlock({ gold: 50, has: false }, content), null);
    assert.equal(ticketBlock({ gold: 49, has: false }, content).code, 'not_enough_gold');
    assert.equal(ticketBlock({ gold: 1000, has: true }, content).code, 'has_ticket');
  });

  test('the draw picks one of the tickets, the same for the same seed, each about as often', () => {
    assert.equal(lotteryWinner(0, 'x'), null);
    assert.equal(lotteryWinner(1, 'x'), 0);
    assert.equal(lotteryWinner(7, 'losowanie'), lotteryWinner(7, 'losowanie'));
    const wins = [0, 0, 0];
    for (let i = 0; i < 3000; i += 1) wins[lotteryWinner(3, `draw:${i}`)] += 1;
    for (const count of wins) assert.ok(Math.abs(count / 3000 - 1 / 3) < 0.04, String(wins));
  });

  test('70% of the spins give nothing at the lowest stake, 60% at the top; nothing and the tiers go evenly from their chances at the lowest stake to those at the top', () => {
    // At level 50 the stakes are 100 to 700 zł.
    const stakes = wheelStakes(50, 0, content);
    const chances = (stake) => {
      const odds = wheelOdds(stake, stakes, content);
      return [odds.none, ...odds.tiers.map((tier) => tier.chance)].map((chance) => Number(chance.toFixed(4)));
    };
    assert.deepEqual(chances(100), [0.7, 0.24, 0.048, 0.009, 0.003]);
    assert.deepEqual(chances(400), [0.65, 0.175, 0.079, 0.0445, 0.0515]);
    assert.deepEqual(chances(700), [0.6, 0.11, 0.11, 0.08, 0.1]);
    assert.deepEqual(wheelOdds(400, stakes, content).tiers.map((tier) => tier.id), ['weak', 'fair', 'good', 'great']);
    for (const stake of stakes) {
      const odds = wheelOdds(stake, stakes, content);
      assert.ok(Math.abs(odds.none + odds.tiers.reduce((sum, tier) => sum + tier.chance, 0) - 1) < 1e-9, String(stake));
    }
    // Nothing less likely at a higher stake, and the better tiers likelier.
    const nothing = stakes.map((stake) => wheelOdds(stake, stakes, content).none);
    assert.ok(nothing.every((chance, index) => index === 0 || chance < nothing[index - 1]));
    for (const tier of ['fair', 'good', 'great']) {
      const along = stakes.map((stake) => wheelOdds(stake, stakes, content).tiers.find((one) => one.id === tier).chance);
      assert.ok(along.every((chance, index) => index === 0 || chance > along[index - 1]), tier);
    }
    // A single stake of the day is the top one.
    assert.deepEqual(wheelOdds(100, [100], content), wheelOdds(700, stakes, content));
  });

  test('a spin gives nothing at `none`, or else a tier at its chance and one of its prizes left, each as likely; a tier all won gives nothing', () => {
    const prizes = [...Array(10).fill('weak'), ...Array(3).fill('fair'), 'good', 'great'].map((tier) => ({ tier }));
    const pool = { prizes, won: [] };
    const odds = wheelOdds(700, wheelStakes(50, 0, content), content);
    const tiers = new Map();
    const places = new Map();
    let none = 0;
    const spins = 20000;
    for (let i = 0; i < spins; i += 1) {
      const spin = spinWheel(pool, odds, `spin:${i}`);
      assert.deepEqual(spinWheel(pool, odds, `spin:${i}`), spin);
      if (!spin.win) {
        assert.deepEqual([spin.tier, spin.prize], [null, null]);
        none += 1;
        continue;
      }
      assert.equal(prizes[spin.prize].tier, spin.tier);
      tiers.set(spin.tier, (tiers.get(spin.tier) ?? 0) + 1);
      places.set(spin.prize, (places.get(spin.prize) ?? 0) + 1);
    }
    assert.ok(Math.abs(none / spins - 0.6) < 0.015, String(none));
    for (const tier of odds.tiers) assert.ok(Math.abs((tiers.get(tier.id) ?? 0) / spins - tier.chance) < 0.012, `${tier.id} ${tiers.get(tier.id)}`);
    // The weak prizes come about equally often.
    for (let place = 0; place < 10; place += 1) assert.ok(Math.abs(places.get(place) / tiers.get('weak') - 0.1) < 0.03, String(place));
    // The great prize won: a spin that stops on its tier gives nothing.
    const gone = { prizes, won: [14] };
    let empty = 0;
    for (let i = 0; i < 2000; i += 1) {
      const spin = spinWheel(gone, odds, `bez:${i}`);
      if (spin.tier === 'great') {
        assert.deepEqual([spin.win, spin.prize], [false, null]);
        empty += 1;
      } else if (spin.win) assert.notEqual(spin.prize, 14);
    }
    assert.ok(empty > 100 && empty < 300, String(empty));
    // Nothing left, nothing won.
    for (let i = 0; i < 50; i += 1) assert.equal(spinWheel({ prizes, won: prizes.map((_, index) => index) }, odds, `pusto:${i}`).win, false);
  });

  test("a spin needs one of the day's stakes, the gold, a prize left, and room in the bag for an item", () => {
    const fine = { gold: 100000, stakes: [100, 200, 300], left: 5, itemLeft: true, bagFree: 3 };
    assert.equal(spinBlock(100, fine, content), null);
    assert.equal(spinBlock(300, fine, content), null);
    for (const stake of [0, 50, 150, 400, 2.5, '100', null, -100]) assert.equal(spinBlock(stake, fine, content).code, 'invalid_stake', String(stake));
    assert.equal(spinBlock(400, fine, content).message, 'Postaw od 100 do 300 zł, setkami.');
    assert.equal(spinBlock(300, { ...fine, gold: 299 }, content).code, 'not_enough_gold');
    assert.equal(spinBlock(100, { ...fine, left: 0 }, content).code, 'empty');
    assert.equal(spinBlock(100, { ...fine, bagFree: 0 }, content).code, 'bag_full');
    // Only materials left: they take no place in the bag.
    assert.equal(spinBlock(100, { ...fine, itemLeft: false, bagFree: 0 }, content), null);
  });

  test('the stakes go in hundreds from 100 zł, 100 more every 40 levels, to the last below a legendary item at the scrapper', () => {
    assert.deepEqual(wheelStakes(25, 0, content), [100, 200, 300]);
    assert.deepEqual(wheelStakes(30, 0, content), [100, 200, 300, 400]);
    assert.equal(wheelStakes(50, 0, content).at(-1), 700);
    // The prizes grow with the level, and a spin at the lowest stake must
    // still give back less than it takes: from level 80 the Wheel starts at
    // 200 zł, from 120 at 300 zł.
    assert.deepEqual([79, 80, 119, 120].map((level) => wheelStakes(level, 0, content)[0]), [100, 200, 200, 300]);
    assert.equal(wheelStakes(100, 0, content).at(-1), 1500);
    // With the Skup złomu at its top the scrapper pays twice as much.
    assert.equal(wheelStakes(150, 1, content).at(-1), 4700);
    for (const [level, bonus] of [[25, 0], [50, 0.3], [80, 0], [150, 1]]) {
      const stakes = wheelStakes(level, bonus, content);
      assert.deepEqual(stakes, stakes.map((_, index) => stakes[0] + index * 100));
      // The great prize is worth more than any stake.
      const legendary = sellPrice({ level, rarity: 'legendary' }, content, bonus);
      assert.ok(stakes.at(-1) < legendary && stakes.at(-1) + 100 >= legendary, String(level));
    }
    // Before a legendary item is worth more than 100 zł, the first stake
    // alone; never past 100 steps.
    assert.deepEqual(wheelStakes(5, 0, content), [100]);
    const top = wheelStakes(1000, 1, content);
    assert.deepEqual([top[0], top.at(-1)], [2500, 10000]);
  });

  test('the lands the character knows: every ordinary creature of a land with an inner region open to its class', () => {
    const early = knownLandMaterials(character(20), content).map((material) => material.id);
    assert.ok(early.includes('wolf-pelt'));
    // Deeper in the same land, not met yet.
    assert.ok(early.includes('bear-hide'));
    // Torfowiska opens at class level 50.
    assert.ok(!early.includes('crocodile-hide'));
    assert.ok(knownLandMaterials(character(50), content).some((material) => material.id === 'crocodile-hide'));
    // No elite's or champion's trophy.
    for (const level of [20, 50, 125]) {
      for (const material of knownLandMaterials(character(level), content)) {
        const monster = content.monstersById[material.monster];
        assert.ok(monster && !monster.elite && !monster.champion, material.id);
      }
    }
  });

  test("the day's pool: fifteen prizes, ten weak, three fair, one good and one great, the best first, for the character's class and level and lands", () => {
    const bonusSets = [
      { sellBonus: 0, tanneryPremium: 0.1 },
      { sellBonus: 1, tanneryPremium: 0.3 },
    ];
    const index = (id) => content.rarities.findIndex((one) => one.id === id);
    const kinds = {};
    let mythic = 0;
    let pools = 0;
    for (const level of [20, 30, 50, 80, 125]) {
      const lands = new Set(knownLandMaterials(character(level), content).map((material) => material.id));
      for (const bonuses of bonusSets) {
        const basis = { ...character(level), ...bonuses };
        for (let i = 0; i < 20; i += 1) {
          const prizes = wheelPrizes(basis, `postac:${i}`, '2026-11-03', content);
          pools += 1;
          assert.deepEqual(
            prizes.map((prize) => prize.tier),
            ['great', 'good', 'fair', 'fair', 'fair', ...Array(10).fill('weak')],
          );
          const materials = [];
          const resources = [];
          for (const prize of prizes) {
            kinds[`${prize.tier}:${prize.kind}`] = (kinds[`${prize.tier}:${prize.kind}`] ?? 0) + 1;
            if (prize.kind === 'item') {
              assert.equal(prize.item.level, level);
              assert.ok(canUse(prize.item.base, 'warrior', content, level), prize.item.base);
              const rarity = prize.item.rarity;
              if (prize.tier === 'great') {
                assert.ok(['legendary', 'mythic'].includes(rarity), rarity);
                if (rarity === 'mythic') mythic += 1;
              } else assert.equal(rarity, { good: 'epic', fair: rarity === 'unique' ? 'unique' : 'rare', weak: 'common' }[prize.tier], `${prize.tier} ${rarity}`);
            } else if (prize.kind === 'material') {
              const { materialId, rarityId } = parseStack(prize.key);
              assert.ok(lands.has(materialId), materialId);
              materials.push(materialId);
              // A grade of its tier, of a species no rarer than that.
              assert.ok((prize.tier === 'weak' ? ['common'] : ['rare', 'unique']).includes(rarityId), prize.key);
              assert.ok(index(content.materialsById[materialId].rarity) <= index(rarityId), prize.key);
              const [least, most] = prize.tier === 'weak' ? casino.wheel.weakMaterials : casino.wheel.fairMaterials;
              assert.ok(Number.isInteger(prize.count) && prize.count >= least && prize.count <= most, `${prize.key} ${prize.count}`);
            } else {
              assert.equal(prize.kind, 'resource');
              assert.equal(prize.tier, 'weak');
              assert.ok(content.resourcesById[prize.key], prize.key);
              assert.equal(prize.count, 5 * level);
              resources.push(prize.key);
            }
          }
          // A camp resource comes once in a pool, and a creature's material
          // too while the lands have one of their common ones left.
          assert.equal(new Set(resources).size, resources.length, resources.join(', '));
          if (new Set(materials).size < materials.length) {
            const commons = [...lands].filter((id) => content.materialsById[id].rarity === 'common');
            assert.ok(commons.every((id) => materials.includes(id)), materials.join(', '));
          }
          // A fresh pool gives back less than it takes at every stake.
          const stakes = wheelStakes(level, bonuses.sellBonus, content);
          for (const stake of stakes) {
            const back = spinExpectation(stake, { prizes, won: [] }, wheelOdds(stake, stakes, content), (prize) => prizeWorth(prize, bonuses, content));
            assert.ok(back < 0, `${level} ${stake} ${back}`);
          }
        }
      }
    }
    // Every kind of a weak prize, and a fair one now an item, now materials.
    for (const kind of ['weak:resource', 'weak:material', 'weak:item', 'fair:item', 'fair:material']) assert.ok(kinds[kind] > 0, kind);
    assert.deepEqual([kinds['good:item'], kinds['great:item']], [pools, pools]);
    // A mythic item in about one pool of ten.
    assert.ok(mythic > pools * 0.03 && mythic < pools * 0.2, `${mythic} of ${pools}`);
  });

  test('what a prize is worth to the character: an item at the scrapper, materials at the Garbarnia, resources at the Duch budowniczego', () => {
    const item = { kind: 'item', tier: 'good', item: { level: 50, rarity: 'epic' } };
    assert.equal(prizeWorth(item, {}, content), sellPrice(item.item, content, 0));
    assert.equal(prizeWorth(item, { sellBonus: 0.5 }, content), sellPrice(item.item, content, 0.5));
    // A rare piece at 20 zł at the scrapper, with the Skup złomu and the tanner's premium.
    assert.equal(prizeWorth({ kind: 'material', key: 'wolf-pelt:rare', count: 2 }, {}, content), 40);
    assert.ok(Math.abs(prizeWorth({ kind: 'material', key: 'wolf-pelt:rare', count: 2 }, { sellBonus: 0.5, tanneryPremium: 0.2 }, content) - 72) < 1e-9);
    // The spirit pays 6 zł for 100 pieces of wood, 12 for as much ore.
    assert.equal(prizeWorth({ kind: 'resource', key: 'wood', count: 250 }, { sellBonus: 1 }, content), 15);
    assert.equal(prizeWorth({ kind: 'resource', key: 'iron-ore', count: 250 }, {}, content), 30);
  });

  test("the same pool for the same character and day at every stake; the day keeps the character as it was", () => {
    const basis = { ...character(30), sellBonus: 0, tanneryPremium: 0.1 };
    const one = wheelPrizes(basis, '7:casino', '2026-11-03', content);
    assert.deepEqual(wheelPrizes(basis, '7:casino', '2026-11-03', content), one);
    assert.notDeepEqual(wheelPrizes(basis, '7:casino', '2026-11-04', content), one);
    assert.notDeepEqual(wheelPrizes(basis, '8:casino', '2026-11-03', content), one);
    // The day's Wheel: the character at its first look, and nothing won.
    const wheel = wheelDay(null, basis, NOW, content);
    assert.deepEqual(wheel, { day: '2026-11-03', basis, won: [] });
    // Kept until midnight with the character as it was, and the places won:
    // a level up changes neither the stakes nor the pool.
    const grown = { ...basis, level: 60, classLevel: 60 };
    const kept = wheelDay(JSON.parse(JSON.stringify(wheelWon(wheelWon(wheel, 2), 0))), grown, NOW + 3600000, content);
    assert.deepEqual(kept, { day: '2026-11-03', basis, won: [2, 0] });
    assert.deepEqual(dayStakes(kept, content), [100, 200, 300, 400]);
    assert.deepEqual(wheelPool(kept, '7:casino', content), { prizes: one, won: [2, 0] });
    assert.deepEqual(prizesLeft(wheelPool(kept, '7:casino', content)), [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    // A day kept with a pool at each stake (up to 0.1.34) starts its one pool anew.
    assert.deepEqual(wheelDay({ day: '2026-11-03', basis, won: { 100: [2, 0] } }, grown, NOW, content).won, []);
    // A new day starts from the character now.
    const next = wheelDay(kept, grown, NOW + 86400000, content);
    assert.deepEqual(next, { day: '2026-11-04', basis: grown, won: [] });
    assert.equal(dayStakes(next, content).at(-1), 900);
  });
});

describe('the Salon Gier through the API', () => {
  const { server, call, db, signUp } = useServer({ SETTLEMENT: 'on' });
  let cookie;

  async function player(login, { level = 30, gold = 100000 } = {}) {
    const answer = await signUp(login);
    await call('POST', '/api/character', { cookie: answer.cookie, body: { name: login, classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = ?, class_level = ?, gold = ? WHERE name = ?').bind(level, level, gold, login).run();
    return answer.cookie;
  }

  beforeEach(async () => {
    cookie = await player('Gracz');
  });

  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql} WHERE name = 'Gracz'`).bind(...binds).run();
  const row = async (name = 'Gracz') => (await db()).prepare('SELECT * FROM characters WHERE name = ?').bind(name).first();
  const stored = async (name = 'Gracz') => JSON.parse((await row(name)).settlement ?? '{}');
  const salon = async (who = cookie, stake = null) => (await call('GET', `/api/settlement/casino${stake === null ? '' : `?stake=${stake}`}`, { cookie: who })).data.casino;
  const ticket = (who = cookie) => call('POST', '/api/settlement/casino/ticket', { cookie: who });
  const spin = (stake, who = cookie) => call('POST', '/api/settlement/casino/spin', { cookie: who, body: { stake } });
  const run = (at) => server.getWorker().scheduled({ cron: '* * * * *', scheduledTime: new Date(at) });
  const today = () => casinoDay(Date.now(), content);
  const all = async (sql) => (await (await db()).prepare(sql).all()).results;

  test("the Salon opens with the Osada: the Loteria, and the Wheel with the day's stakes, their chances and the day's one pool, kept for the day", async () => {
    await set('level = 19');
    const locked = await call('GET', '/api/settlement/casino', { cookie });
    assert.deepEqual([locked.status, locked.data.error.code], [403, 'locked']);
    await set('level = 30');
    const view = await salon();
    assert.deepEqual(view.lottery, { name: 'Loteria', ticket: 50, base: 100, tickets: 0, pot: 100, players: [], mine: false, endsAt: today().endsAt, last: null });
    const { wheel } = view;
    assert.deepEqual([wheel.stakes, wheel.stake, wheel.step, wheel.none, wheel.left], [[100, 200, 300, 400], 100, 100, { low: 0.7, high: 0.6 }, 15]);
    assert.deepEqual(
      wheel.tiers.map((tier) => [tier.id, tier.name, tier.count]),
      [
        ['weak', 'Słaba', 10],
        ['fair', 'Niezła', 3],
        ['good', 'Dobra', 1],
        ['great', 'Świetna', 1],
      ],
    );
    // The chances at each stake, the lowest's and the top's as in the data.
    assert.equal(wheel.odds.length, 4);
    assert.deepEqual([wheel.odds[0].none, ...wheel.odds[0].tiers.map((tier) => tier.chance)], [0.7, 0.24, 0.048, 0.009, 0.003]);
    assert.deepEqual([wheel.odds[3].none, ...wheel.odds[3].tiers.map((tier) => tier.chance)].map((chance) => Number(chance.toFixed(4))), [0.6, 0.11, 0.11, 0.08, 0.1]);
    assert.equal(wheel.prizes.length, 15);
    assert.deepEqual(
      wheel.prizes.map((prize) => prize.tier),
      ['great', 'good', 'fair', 'fair', 'fair', ...Array(10).fill('weak')],
    );
    assert.ok(wheel.prizes.every((prize) => !prize.won && prize.worth >= 0 && prize.name));
    assert.deepEqual([wheel.prizes[0].kind, wheel.prizes[1].kind, wheel.prizes[1].rarity], ['item', 'item', 'epic']);
    for (const prize of wheel.prizes.filter((one) => one.kind === 'resource')) {
      assert.deepEqual([prize.count, prize.name], [150, content.resourcesById[prize.key].name]);
    }
    assert.equal(view.texts.announce, casino.texts.announce);
    // Another stake: the same pool, the stake shown.
    const higher = await salon(cookie, 300);
    assert.equal(higher.wheel.stake, 300);
    assert.deepEqual(higher.wheel.prizes, wheel.prizes);
    // A stake that is not one of the day's shows the lowest.
    for (const asked of [250, 5000, 'abc']) assert.equal((await salon(cookie, asked)).wheel.stake, 100);
    // The day's Wheel is kept in the Osada with the character as it was:
    // grown, it has the same stakes and pool until midnight.
    const kept = (await stored()).casino;
    assert.deepEqual([kept.day, kept.basis.level, kept.basis.classId, kept.won], [today().key, 30, 'warrior', []]);
    await set('level = 60, class_level = 60');
    const later = await salon();
    assert.deepEqual([later.wheel.stakes, later.wheel.prizes], [wheel.stakes, wheel.prizes]);
    // Szczęsny stands among the residents.
    const host = (await call('GET', '/api/settlement', { cookie })).data.settlement.residents.find((resident) => resident.id === casino.resident);
    assert.equal(host.greeting, host.greetings[0]);
  });

  test('a ticket a day for 50 zł, into the pot, and the relation with Szczęsny grows', async () => {
    const bought = await ticket();
    assert.equal(bought.status, 200);
    assert.equal(bought.data.character.gold, 100000 - 50);
    assert.deepEqual([bought.data.casino.lottery.tickets, bought.data.casino.lottery.pot, bought.data.casino.lottery.mine], [1, 150, true]);
    assert.equal((await stored()).relations[casino.resident], casino.relationGain);
    const again = await ticket();
    assert.deepEqual([again.status, again.data.error.code], [409, 'has_ticket']);
    assert.equal((await row()).gold, 100000 - 50);
    // Another character's ticket grows the same pot, and everyone sees who
    // plays today, in the order the tickets were bought, with their guilds'
    // tags (the author: "Dodaj do loterii możliwość dla gracza, żeby widzieć
    // kto bierze w niej udział").
    const other = await player('Ala');
    const second = (await ticket(other)).data.casino.lottery;
    assert.deepEqual([second.pot, second.players], [200, [{ name: 'Gracz', guildTag: null }, { name: 'Ala', guildTag: null }]]);
    assert.deepEqual((await salon()).lottery.players.map((one) => one.name), ['Gracz', 'Ala']);
    assert.deepEqual(await all('SELECT day FROM lottery_tickets ORDER BY character_id'), [{ day: today().key }, { day: today().key }]);
    // Without the gold, no ticket.
    const poor = await player('Ola', { gold: 49 });
    assert.equal((await ticket(poor)).data.error.code, 'not_enough_gold');
  });

  test('two taps buy one ticket', async () => {
    const taps = await Promise.all([ticket(), ticket()]);
    assert.deepEqual(taps.map((tap) => tap.status).sort(), [200, 409]);
    assert.equal((await row()).gold, 100000 - 50);
    assert.equal((await all('SELECT * FROM lottery_tickets')).length, 1);
  });

  test('at midnight the System draws once: the winner takes the whole pot and the Globalny hears it', async () => {
    const others = { Ala: await player('Ala'), Ola: await player('Ola') };
    for (const who of [cookie, ...Object.values(others)]) assert.equal((await ticket(who)).status, 200);
    const { endsAt, key } = today();
    // Not before midnight.
    await run(endsAt - 60000);
    assert.deepEqual(await all('SELECT * FROM lottery_draws'), []);
    await run(endsAt + 30000);
    const draws = await all('SELECT day, tickets, pot, name FROM lottery_draws');
    assert.equal(draws.length, 1);
    const [draw] = draws;
    assert.deepEqual([draw.day, draw.tickets, draw.pot], [key, 3, 250]);
    assert.ok(['Gracz', 'Ala', 'Ola'].includes(draw.name));
    for (const name of ['Gracz', 'Ala', 'Ola']) assert.equal((await row(name)).gold, 100000 - 50 + (name === draw.name ? 250 : 0), name);
    assert.deepEqual(await all('SELECT * FROM lottery_tickets'), []);
    const text = `Loterię wygrała ${draw.name}: 250 zł.`;
    assert.deepEqual(await all('SELECT channel, text, system FROM chat_messages'), [{ channel: 'global', text, system: 1 }]);
    // Once a day: the next minutes draw nothing more.
    await run(endsAt + 90000);
    await run(endsAt + 3600000);
    assert.equal((await all('SELECT * FROM lottery_draws')).length, 1);
    assert.equal((await row(draw.name)).gold, 100000 - 50 + 250);
    // The Salon shows the draw, and whose win it was.
    const cookies = { Gracz: cookie, ...others };
    const mine = (await salon(cookies[draw.name])).lottery.last;
    assert.deepEqual([mine.pot, mine.tickets, mine.name, mine.text, mine.own], [250, 3, draw.name, text, true]);
    const loser = Object.keys(cookies).find((name) => name !== draw.name);
    assert.equal((await salon(cookies[loser])).lottery.last.own, false);
    // The day drawn takes no more tickets, nor anyone's gold for one.
    const late = await ticket(cookies[loser]);
    assert.equal(late.status, 409);
    assert.equal((await row(loser)).gold, 100000 - 50);
  });

  test("the System's message in the chat: everyone's to read, nobody's to report or hide, and it keeps nobody from writing", async () => {
    const ala = await player('Ala');
    for (const who of [cookie, ala]) {
      assert.equal((await ticket(who)).status, 200);
      assert.equal((await call('POST', '/api/chat/rules', { cookie: who })).status, 200);
    }
    await run(today().endsAt + 30000);
    const [draw] = await all('SELECT name FROM lottery_draws');
    for (const who of [cookie, ala]) {
      const { messages } = (await call('GET', '/api/chat?channel=global', { cookie: who })).data;
      assert.deepEqual(
        messages.map(({ system, text, own }) => ({ system, text, own })),
        [{ system: true, text: `Loterię wygrała ${draw.name}: 200 zł.`, own: false }],
      );
      // It lights the chat for everyone, the winner too.
      assert.equal((await call('GET', '/api/chat/latest', { cookie: who })).data.latest, messages[0].id);
      assert.equal((await call('POST', '/api/chat/report', { cookie: who, body: { messageId: messages[0].id } })).data.error.code, 'system');
      assert.equal((await call('POST', '/api/chat/block', { cookie: who, body: { messageId: messages[0].id } })).data.error.code, 'system');
    }
    // The winner writes at once.
    const winner = draw.name === 'Gracz' ? cookie : ala;
    assert.equal((await call('POST', '/api/chat', { cookie: winner, body: { channel: 'global', text: 'Dziękuję!' } })).status, 201);
  });

  test('no ticket, no draw, and nothing carries over', async () => {
    await run(today().endsAt + 30000);
    assert.deepEqual(await all('SELECT * FROM lottery_draws'), []);
    assert.deepEqual(await all('SELECT * FROM chat_messages'), []);
    assert.deepEqual((await salon()).lottery.last, null);
  });

  test("the Wheel: one of the day's stakes, gone whatever comes, and a win takes a prize of the day's pool until it is empty", async () => {
    const before = await salon();
    assert.equal((await spin(0)).status, 400);
    for (const stake of [50, 150, 500, '100', null]) assert.equal((await spin(stake)).data.error.code, 'invalid_stake', String(stake));
    await set('gold = 399');
    assert.equal((await spin(400)).data.error.code, 'not_enough_gold');
    await set('gold = 1000000');
    const start = await row();
    const items = (await all('SELECT COUNT(*) AS count FROM items WHERE slot IS NULL')).at(0).count;
    const tiers = new Set(before.wheel.tiers.map((tier) => tier.id));
    // At the top stake, where the best prizes come likeliest.
    let view = before.wheel;
    let spins = 0;
    let wins = 0;
    let last = null;
    while (spins < 400) {
      const answer = await spin(400);
      if (answer.status !== 200) {
        last = answer;
        break;
      }
      spins += 1;
      const { spin: result, casino: now } = answer.data;
      assert.deepEqual([result.stake, now.wheel.stake], [400, 400]);
      assert.ok(result.tier === null || tiers.has(result.tier), String(result.tier));
      if (result.win) {
        wins += 1;
        assert.equal(result.prize.tier, result.tier);
        assert.equal(now.wheel.left, 15 - wins);
      } else if (result.tier) {
        // It stopped on a tier with nothing left in the pool.
        assert.ok(view.prizes.every((prize) => prize.tier !== result.tier || prize.won), result.tier);
      }
      view = now.wheel;
    }
    assert.equal(wins, 15);
    assert.deepEqual([last.status, last.data.error.code], [409, 'empty']);
    const after = await salon();
    assert.equal(after.wheel.left, 0);
    assert.ok(after.wheel.prizes.every((prize) => prize.won));
    const end = await row();
    assert.equal(end.gold, 1000000 - 400 * spins);
    // The items in the bag as from a trade, the materials as bought ones (the
    // Encyklopedia leaves both out), the resources in the camp.
    const won = before.wheel.prizes;
    const wonItems = won.filter((prize) => prize.kind === 'item');
    const bag = await all('SELECT data FROM items WHERE slot IS NULL ORDER BY id');
    assert.equal(bag.length - items, wonItems.length);
    for (const { data } of bag.slice(items)) assert.equal(JSON.parse(data).traded, 1);
    const held = JSON.parse(end.materials);
    const foreign = JSON.parse(end.foreign_stacks);
    const wanted = {};
    for (const prize of won.filter((one) => one.kind === 'material')) wanted[prize.key] = (wanted[prize.key] ?? 0) + prize.count;
    for (const [key, count] of Object.entries(wanted)) {
      assert.equal(held[key], count, key);
      assert.equal(foreign[`material:${key}`], count, key);
    }
    const resources = JSON.parse(end.resources);
    const had = JSON.parse(start.resources ?? '{}');
    const gained = {};
    for (const prize of won.filter((one) => one.kind === 'resource')) gained[prize.key] = (gained[prize.key] ?? 0) + prize.count;
    for (const [key, count] of Object.entries(gained)) assert.equal(resources[key], (had[key] ?? 0) + count, key);
    // The pool is gone at every stake.
    assert.equal((await spin(100)).data.error.code, 'empty');
  });

  test('two taps with the gold for one spin spin once, and taps at once never pay without a spin nor win a prize twice', async () => {
    await salon();
    await set('gold = 100');
    const taps = await Promise.all([spin(100), spin(100)]);
    assert.deepEqual(taps.map((tap) => tap.status).sort(), [200, 409]);
    assert.equal((await row()).gold, 0);
    // With gold for all: each spin that goes through pays its stake, once.
    await set('gold = 100000');
    const more = await Promise.all([spin(100), spin(400), spin(400), spin(200)]);
    assert.ok(more.every((tap) => tap.status === 200 || tap.status === 409), JSON.stringify(more.map((tap) => tap.status)));
    const done = [...taps, ...more].filter((tap) => tap.status === 200);
    const paid = done.slice(1).reduce((sum, tap) => sum + tap.data.spin.stake, 0);
    assert.equal((await row()).gold, 100000 - paid);
    const { won } = (await stored()).casino;
    assert.equal(won.length, done.filter((tap) => tap.data.spin.win).length);
    assert.equal(new Set(won).size, won.length);
  });

  test('a full bag waits while an item is in the pool; a new day brings a new Wheel', async () => {
    const view = await salon();
    const { id } = await row();
    const places = bagCapacity(campLevels({}, Date.now(), content), content);
    const item = generateItem({ baseId: 'sword', level: 30, rarityId: 'unique' }, createRng('plecak'), content);
    const database = await db();
    await database.batch(Array.from({ length: places }, () => database.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)').bind(id, JSON.stringify(item))));
    const full = await salon();
    assert.deepEqual([full.wheel.itemLeft, full.wheel.bagFree], [true, 0]);
    assert.equal((await spin(100)).data.error.code, 'bag_full');
    // No item left: the Wheel turns with a full bag.
    const itemPlaces = view.wheel.prizes.map((prize, index) => (prize.kind === 'item' ? index : null)).filter((index) => index !== null);
    const kept = (await stored()).casino;
    await set('settlement = ?', JSON.stringify({ ...(await stored()), casino: { ...kept, won: itemPlaces } }));
    assert.equal((await salon()).wheel.itemLeft, false);
    assert.equal((await spin(100)).status, 200);
    // The next day's Wheel is new, with nothing won, and the character as it is.
    await set('level = 60, class_level = 60');
    await set('settlement = ?', JSON.stringify({ ...(await stored()), casino: { ...kept, day: '2026-01-01', won: view.wheel.prizes.map((_, index) => index) } }));
    const fresh = await salon();
    assert.deepEqual([fresh.wheel.left, fresh.wheel.prizes.length, fresh.wheel.stakes.at(-1)], [15, 15, 900]);
    const next = (await stored()).casino;
    assert.deepEqual([next.day, next.basis.level, next.won], [today().key, 60, []]);
  });

  test('a character that goes takes its ticket along', async () => {
    assert.equal((await ticket()).status, 200);
    assert.equal((await call('DELETE', '/api/me', { cookie, body: { login: 'Gracz' } })).status, 200);
    assert.deepEqual(await all('SELECT * FROM lottery_tickets'), []);
    // The draw finds nothing.
    await run(today().endsAt + 30000);
    assert.deepEqual(await all('SELECT * FROM lottery_draws'), []);
  });
});

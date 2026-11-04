// The Salon Gier in the Osada (answers 523–526 and 542 C): Szczęsny's
// Loteria, a ticket of 50 zł a character a day and the whole pot of 100 zł
// and every ticket to one ticket drawn at Polish midnight, once a day, with
// the System's message in the Globalny; and the Koło Fortuny, a stake of
// 100 zł or more in hundreds, up to the highest with an item prize, a 10%
// chance at any (the author: "Koło fortuny proszę znerfić mocno i dać 10%
// szans"), and each character's own pool of five prizes a day at
// every stake, items at its level or very rare materials of the lands it
// knows, each worth more than the stake and no more than a win costs on
// average.

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
  itemPrizeRarity,
  stakeItemRarity,
  knownLandMaterials,
  lotteryPot,
  lotteryWinner,
  parseStack,
  prizesLeft,
  prizeWorth,
  spinBlock,
  spinExpectation,
  spinWheel,
  ticketBlock,
  wheelChance,
  wheelDay,
  wheelPool,
  wheelPrizes,
  wheelStakes,
  wheelWon,
  prizeCap,
  winCost,
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
    assert.deepEqual([casino.wheel.step, casino.wheel.chance, casino.wheel.worthCap, casino.wheel.prizes], [100, 0.1, 2, 5]);
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

  test('the chance is always 10%, a win costs ten stakes on average, and a prize is worth two stakes at most', () => {
    assert.equal(wheelChance(content), 0.1);
    assert.deepEqual([100, 300, 2500].map((stake) => winCost(stake, content)), [1000, 3000, 25000]);
    // The prizes stay as they were at 50%, so the Wheel gives back at most a
    // fifth of the stakes on average.
    assert.deepEqual([100, 300, 2500].map((stake) => prizeCap(stake, content)), [200, 600, 5000]);
  });

  test('a spin wins a tenth of the time and takes one of the prizes left, each as likely', () => {
    const seen = new Map();
    let wins = 0;
    for (let i = 0; i < 10000; i += 1) {
      const spin = spinWheel([1, 3, 4], `spin:${i}`, content);
      assert.deepEqual(spinWheel([1, 3, 4], `spin:${i}`, content), spin);
      if (!spin.win) {
        assert.equal(spin.prize, null);
        continue;
      }
      wins += 1;
      seen.set(spin.prize, (seen.get(spin.prize) ?? 0) + 1);
    }
    assert.ok(Math.abs(wins / 10000 - 0.1) < 0.015, String(wins));
    assert.deepEqual([...seen.keys()].sort(), [1, 3, 4]);
    for (const count of seen.values()) assert.ok(Math.abs(count / wins - 1 / 3) < 0.05);
    // Nothing left, nothing won.
    assert.deepEqual(spinWheel([], 'pusto', content), { win: false, prize: null });
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

  test('an item prize is the rarest from rare to legendary worth more than the stake and at most twice it to the character', () => {
    // At level 25 the scrapper pays 50, 100, 200 and 400 zł for a rare, a
    // unique, an epic and a legendary item.
    assert.deepEqual([100, 200, 300, 400].map((stake) => itemPrizeRarity(25, 0, stake, content)), ['epic', 'legendary', 'legendary', null]);
    // At level 50: 100, 200, 400 and 800 zł.
    assert.deepEqual([100, 200, 300, 400, 700, 800].map((stake) => itemPrizeRarity(50, 0, stake, content)), ['unique', 'epic', 'epic', 'legendary', 'legendary', null]);
    // Never a mythic item: at level 25 one would be worth 800 zł.
    assert.equal(itemPrizeRarity(25, 0, 700, content), null);
    // Never a common one: from level 101 a rare item is worth more than a win
    // at 100 zł costs, and that stake has only materials.
    assert.equal(itemPrizeRarity(100, 0, 100, content), 'rare');
    assert.equal(itemPrizeRarity(101, 0, 100, content), null);
    assert.equal(itemPrizeRarity(101, 0, 200, content), 'rare');
    // The Skup złomu raises what the scrapper pays, and the rarity comes down.
    assert.equal(itemPrizeRarity(25, 1, 100, content), 'unique');
  });

  test("legendary items wait only in the pool of the character's top stake (554 B), every lower stake has items up to epic", () => {
    // At level 25 the stakes are 100, 200 and 300 zł: an epic item fits at
    // 100 zł, a legendary one (400 zł) at 200 and 300 zł, and 200 zł is not
    // the top, so its pool has materials alone.
    assert.deepEqual([100, 200, 300].map((stake) => stakeItemRarity(25, 0, stake, content)), ['epic', null, 'legendary']);
    // At level 50, up to 700 zł: legendary items (800 zł) at the top alone.
    assert.deepEqual([100, 200, 300, 400, 500, 600, 700].map((stake) => stakeItemRarity(50, 0, stake, content)), ['unique', 'epic', 'epic', null, null, null, 'legendary']);
    for (const [level, bonus] of [[25, 0], [40, 0.3], [80, 0], [150, 1]]) {
      const stakes = wheelStakes(level, bonus, content);
      for (const stake of stakes.slice(0, -1)) assert.notEqual(stakeItemRarity(level, bonus, stake, content), 'legendary', `${level} ${stake}`);
      assert.equal(stakeItemRarity(level, bonus, stakes.at(-1), content), 'legendary', String(level));
      // The pools hold just that.
      const basis = { ...character(level), sellBonus: bonus, tanneryPremium: 0 };
      for (const stake of stakes) {
        const rarities = new Set(wheelPrizes(basis, 'legendarne', stake, '2026-11-03', content).filter((prize) => prize.kind === 'item').map((prize) => prize.item.rarity));
        if (stake === stakes.at(-1)) assert.deepEqual([...rarities], ['legendary']);
        else assert.ok(!rarities.has('legendary'), `${level} ${stake}`);
      }
    }
  });

  test('the stakes go in hundreds from 100 zł to the highest with an item prize, so they grow with the level', () => {
    assert.deepEqual(wheelStakes(25, 0, content), [100, 200, 300]);
    assert.deepEqual(wheelStakes(30, 0, content), [100, 200, 300, 400]);
    assert.equal(wheelStakes(50, 0, content).at(-1), 700);
    assert.equal(wheelStakes(100, 0, content).at(-1), 1500);
    // With the Skup złomu at its top the scrapper pays twice as much.
    assert.equal(wheelStakes(150, 1, content).at(-1), 4700);
    for (const [level, bonus] of [[25, 0], [50, 0.3], [150, 1]]) {
      const stakes = wheelStakes(level, bonus, content);
      assert.deepEqual(stakes, stakes.map((_, index) => (index + 1) * 100));
      assert.ok(itemPrizeRarity(level, bonus, stakes.at(-1), content));
      assert.equal(itemPrizeRarity(level, bonus, stakes.at(-1) + 100, content), null);
    }
    // Before any item fits, the first stake alone; never past 100 steps.
    assert.deepEqual(wheelStakes(5, 0, content), [100]);
    assert.equal(wheelStakes(1000, 1, content).length, 100);
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

  test("every stake's pool: five prizes a day, from the character, the day and the stake, each worth more than the stake and no more than a win costs", () => {
    const bonusSets = [
      { sellBonus: 0, tanneryPremium: 0.1 },
      { sellBonus: 0.5, tanneryPremium: 0.2 },
      { sellBonus: 1, tanneryPremium: 0.3 },
    ];
    for (const level of [20, 30, 50, 80, 125]) {
      const lands = new Set(knownLandMaterials(character(level), content).map((material) => material.id));
      for (const bonuses of bonusSets) {
        const basis = { ...character(level), ...bonuses };
        const stakes = wheelStakes(level, bonuses.sellBonus, content);
        for (const stake of new Set([stakes[0], stakes[Math.floor(stakes.length / 2)], stakes.at(-1)])) {
          const rarity = stakeItemRarity(level, bonuses.sellBonus, stake, content);
          let items = 0;
          for (let i = 0; i < 20; i += 1) {
            const prizes = wheelPrizes(basis, `postac:${i}`, stake, '2026-11-03', content);
            assert.equal(prizes.length, 5);
            // A pool with items has at least one, first.
            assert.equal(prizes[0].kind, rarity ? 'item' : 'material');
            for (const prize of prizes) {
              const worth = prizeWorth(prize, bonuses, content);
              assert.ok(worth > stake && worth <= prizeCap(stake, content), `${level} ${stake} ${JSON.stringify(prize).slice(0, 80)} ${worth}`);
              if (prize.kind === 'item') {
                items += 1;
                assert.equal(prize.item.level, level);
                assert.equal(prize.item.rarity, rarity);
                assert.ok(canUse(prize.item.base, 'warrior', content, level), prize.item.base);
              } else {
                const { materialId, rarityId } = parseStack(prize.key);
                assert.ok(lands.has(materialId), materialId);
                // A grade of materialRarities or the species' own, or one
                // between that fits a low stake (0.1.33: materials five
                // times dearer).
                const index = (id) => content.rarities.findIndex((one) => one.id === id);
                const own = index(content.materialsById[materialId].rarity);
                const top = Math.max(...Object.keys(casino.wheel.materialRarities).map(index));
                assert.ok(index(rarityId) >= own && index(rarityId) <= Math.max(own, top), prize.key);
                assert.ok(rarityAt(rarityId) >= rarityAt(content.materialsById[materialId].rarity), prize.key);
                assert.ok(Number.isInteger(prize.count) && prize.count >= 1);
              }
            }
            // The Wheel gives back less than it takes.
            assert.ok(spinExpectation(stake, prizes.map((prize) => prizeWorth(prize, bonuses, content)), content) <= 0);
          }
          // The first prize and about half the others are items while one fits.
          if (rarity) assert.ok(items > 20 + 20 && items < 20 + 60, `${level} ${stake}: ${items}`);
          else assert.equal(items, 0);
        }
      }
    }
  });

  test("a creature's material comes once in a pool", () => {
    for (let i = 0; i < 200; i += 1) {
      const prizes = wheelPrizes({ ...character(30), sellBonus: 0, tanneryPremium: 0 }, `raz:${i}`, 100 * (1 + (i % 4)), '2026-11-03', content);
      const kinds = prizes.filter((prize) => prize.kind === 'material').map((prize) => parseStack(prize.key).materialId);
      assert.equal(new Set(kinds).size, kinds.length, kinds.join(', '));
    }
  });

  test('the same pool for the same character, day and stake; the day keeps the character as it was', () => {
    const basis = { ...character(30), sellBonus: 0, tanneryPremium: 0.1 };
    const one = wheelPrizes(basis, '7:casino', 100, '2026-11-03', content);
    assert.deepEqual(wheelPrizes(basis, '7:casino', 100, '2026-11-03', content), one);
    assert.notDeepEqual(wheelPrizes(basis, '7:casino', 100, '2026-11-04', content), one);
    assert.notDeepEqual(wheelPrizes(basis, '7:casino', 200, '2026-11-03', content), one);
    assert.notDeepEqual(wheelPrizes(basis, '8:casino', 100, '2026-11-03', content), one);
    // The day's Wheel: the character at its first look, and nothing won.
    const wheel = wheelDay(null, basis, NOW, content);
    assert.deepEqual(wheel, { day: '2026-11-03', basis, won: {} });
    // Kept until midnight with the character as it was, the places won at
    // each stake too: a level up changes neither the stakes nor the pools.
    const grown = { ...basis, level: 60, classLevel: 60 };
    const kept = wheelDay(JSON.parse(JSON.stringify(wheelWon(wheelWon(wheel, 100, 2), 100, 0))), grown, NOW + 3600000, content);
    assert.deepEqual(kept, { day: '2026-11-03', basis, won: { 100: [2, 0] } });
    assert.deepEqual(dayStakes(kept, content), [100, 200, 300, 400]);
    assert.deepEqual(wheelPool(kept, '7:casino', 100, content), { prizes: one, won: [2, 0] });
    assert.deepEqual(wheelPool(kept, '7:casino', 200, content).won, []);
    assert.deepEqual(prizesLeft(wheelPool(kept, '7:casino', 100, content)), [1, 3, 4]);
    // A new day starts from the character now.
    const next = wheelDay(kept, grown, NOW + 86400000, content);
    assert.deepEqual(next, { day: '2026-11-04', basis: grown, won: {} });
    assert.equal(dayStakes(next, content).at(-1), 900);
  });

  test('materials are the fewest pieces worth more than the stake at the Garbarnia', () => {
    for (const stake of [100, 300]) {
      const prizes = wheelPrizes({ ...character(30), sellBonus: 0, tanneryPremium: 0.1 }, 'materialy', stake, '2026-11-03', content);
      for (const prize of prizes.filter((one) => one.kind === 'material')) {
        const piece = prizeWorth({ ...prize, count: 1 }, { tanneryPremium: 0.1 }, content);
        assert.ok(piece * (prize.count - 1) <= stake);
        assert.ok(piece * prize.count > stake);
      }
    }
    // An epic piece is worth 80 zł at the scrapper (584 B: five times the 16
    // zł of 0.1.32), 88 zł at the Garbarnia to a stranger: two pieces at 100
    // zł, four at 300 zł; with the Skup złomu at its top and the best
    // relation (208 zł a piece), one and two.
    const pieces = (stake, bonuses) => Math.floor(stake / prizeWorth({ kind: 'material', key: 'wolf-pelt:epic', count: 1 }, bonuses, content)) + 1;
    assert.deepEqual([pieces(100, { tanneryPremium: 0.1 }), pieces(300, { tanneryPremium: 0.1 })], [2, 4]);
    assert.deepEqual([pieces(100, { sellBonus: 1, tanneryPremium: 0.3 }), pieces(300, { sellBonus: 1, tanneryPremium: 0.3 })], [1, 2]);
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

  test("the Salon opens with the Osada: the Loteria, and the Wheel with the day's stakes, each with its own pool, kept for the day", async () => {
    await set('level = 19');
    const locked = await call('GET', '/api/settlement/casino', { cookie });
    assert.deepEqual([locked.status, locked.data.error.code], [403, 'locked']);
    await set('level = 30');
    const view = await salon();
    assert.deepEqual(view.lottery, { name: 'Loteria', ticket: 50, base: 100, tickets: 0, pot: 100, players: [], mine: false, endsAt: today().endsAt, last: null });
    assert.deepEqual([view.wheel.stakes, view.wheel.stake, view.wheel.step, view.wheel.chance, view.wheel.left], [[100, 200, 300, 400], 100, 100, 0.1, 5]);
    assert.equal(view.wheel.prizes.length, 5);
    assert.ok(view.wheel.prizes.every((prize) => !prize.won && prize.worth > 100 && prize.worth <= 200));
    assert.equal(view.wheel.prizes[0].kind, 'item');
    assert.equal(view.texts.announce, casino.texts.announce);
    // Another stake, another pool, of prizes worth more.
    const higher = await salon(cookie, 300);
    assert.equal(higher.wheel.stake, 300);
    assert.ok(higher.wheel.prizes.every((prize) => prize.worth > 300 && prize.worth <= 600));
    // A stake that is not one of the day's shows the lowest.
    for (const asked of [250, 5000, 'abc']) assert.equal((await salon(cookie, asked)).wheel.stake, 100);
    // The day's Wheel is kept in the Osada with the character as it was:
    // grown, it has the same stakes and pools until midnight.
    const kept = (await stored()).casino;
    assert.deepEqual([kept.day, kept.basis.level, kept.basis.classId, kept.won], [today().key, 30, 'warrior', {}]);
    await set('level = 60, class_level = 60');
    const later = await salon();
    assert.deepEqual([later.wheel.stakes, later.wheel.prizes], [view.wheel.stakes, view.wheel.prizes]);
    assert.deepEqual((await salon(cookie, 300)).wheel.prizes, higher.wheel.prizes);
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

  test("the Wheel: one of the day's stakes, gone whatever comes, and a win takes a prize of the stake's pool until it is empty", async () => {
    const before = await salon();
    assert.equal((await spin(0)).status, 400);
    for (const stake of [50, 150, 500, '100', null]) assert.equal((await spin(stake)).data.error.code, 'invalid_stake', String(stake));
    await set('gold = 99');
    assert.equal((await spin(100)).data.error.code, 'not_enough_gold');
    await set('gold = 100000');
    const items = (await all('SELECT COUNT(*) AS count FROM items WHERE slot IS NULL')).at(0).count;
    let spins = 0;
    let wins = 0;
    let last = null;
    while (spins < 200) {
      const answer = await spin(100);
      if (answer.status !== 200) {
        last = answer;
        break;
      }
      spins += 1;
      assert.deepEqual([answer.data.spin.chance, answer.data.casino.wheel.stake], [0.1, 100]);
      if (answer.data.spin.win) {
        wins += 1;
        assert.equal(answer.data.casino.wheel.left, 5 - wins);
      }
    }
    assert.equal(wins, 5);
    assert.deepEqual([last.status, last.data.error.code], [409, 'empty']);
    const after = await salon();
    assert.equal(after.wheel.left, 0);
    assert.ok(after.wheel.prizes.every((prize) => prize.won));
    assert.equal((await row()).gold, 100000 - 100 * spins);
    // The items in the bag as from a trade, the materials as bought ones:
    // the Encyklopedia leaves both out.
    const won = before.wheel.prizes;
    const wonItems = won.filter((prize) => prize.kind === 'item');
    const bag = await all('SELECT data FROM items WHERE slot IS NULL ORDER BY id');
    assert.equal(bag.length - items, wonItems.length);
    for (const { data } of bag.slice(items)) assert.equal(JSON.parse(data).traded, 1);
    const { materials, foreign_stacks: foreignStacks } = await row();
    const held = JSON.parse(materials);
    const foreign = JSON.parse(foreignStacks);
    const wanted = {};
    for (const prize of won.filter((one) => one.kind === 'material')) wanted[prize.key] = (wanted[prize.key] ?? 0) + prize.count;
    for (const [key, count] of Object.entries(wanted)) {
      assert.equal(held[key], count, key);
      assert.equal(foreign[`material:${key}`], count, key);
    }
    // The other stakes keep their pools whole, and a spin at one pays it.
    const other = await salon(cookie, 200);
    assert.deepEqual([other.wheel.stake, other.wheel.left], [200, 5]);
    const higher = await spin(200);
    assert.deepEqual([higher.status, higher.data.casino.wheel.stake], [200, 200]);
    assert.equal((await row()).gold, 100000 - 100 * spins - 200);
  });

  test('two taps with the gold for one spin spin once, and taps at once never pay without a spin nor win a prize twice', async () => {
    await salon();
    await set('gold = 100');
    const taps = await Promise.all([spin(100), spin(100)]);
    assert.deepEqual(taps.map((tap) => tap.status).sort(), [200, 409]);
    assert.equal((await row()).gold, 0);
    // With gold for all: each spin that goes through pays its stake, once.
    await set('gold = 100000');
    const more = await Promise.all([spin(100), spin(100), spin(200)]);
    assert.ok(more.every((tap) => tap.status === 200 || tap.status === 409), JSON.stringify(more.map((tap) => tap.status)));
    const done = [...taps, ...more].filter((tap) => tap.status === 200);
    const paid = done.slice(1).reduce((sum, tap) => sum + tap.data.spin.stake, 0);
    assert.equal((await row()).gold, 100000 - paid);
    const { won } = (await stored()).casino;
    for (const stake of [100, 200]) {
      const places = won[stake] ?? [];
      assert.equal(places.length, done.filter((tap) => tap.data.spin.stake === stake && tap.data.spin.win).length, String(stake));
      assert.equal(new Set(places).size, places.length);
    }
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
    // Only materials left: the Wheel turns with a full bag.
    const itemPlaces = view.wheel.prizes.map((prize, index) => (prize.kind === 'item' ? index : null)).filter((index) => index !== null);
    const kept = (await stored()).casino;
    await set('settlement = ?', JSON.stringify({ ...(await stored()), casino: { ...kept, won: { 100: itemPlaces } } }));
    assert.equal((await salon()).wheel.itemLeft, false);
    assert.equal((await spin(100)).status, 200);
    // The next day's Wheel is new, with nothing won, and the character as it is.
    await set('level = 60, class_level = 60');
    await set('settlement = ?', JSON.stringify({ ...(await stored()), casino: { ...kept, day: '2026-01-01', won: { 100: [0, 1, 2, 3, 4] } } }));
    const fresh = await salon();
    assert.deepEqual([fresh.wheel.left, fresh.wheel.prizes.length, fresh.wheel.stakes.at(-1)], [5, 5, 900]);
    const next = (await stored()).casino;
    assert.deepEqual([next.day, next.basis.level, next.won], [today().key, 60, {}]);
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

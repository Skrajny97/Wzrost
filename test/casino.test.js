// The Salon Gier in the Osada (answers 523–526): Szczęsny's Loteria, a
// ticket of 50 zł a character a day and the whole pot of 100 zł and every
// ticket to one ticket drawn at Polish midnight, once a day, with the
// System's message in the Globalny; and the Koło Fortuny, a stake of 1 to
// 100 zł with a chance of half the stake in percent, and each character's
// own pool of five prizes a day, items at its level or very rare materials
// of the lands it knows, none worth more than a win costs on average.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  bagCapacity,
  campLevels,
  canUse,
  casinoDay,
  createRng,
  generateItem,
  itemPrizeRarity,
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
  wheelPrizes,
  wheelToday,
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
    assert.deepEqual([casino.wheel.minStake, casino.wheel.maxStake, casino.wheel.prizes, casino.wheel.prizeOver], [1, 100, 5, 100]);
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

  test('the chance grows with the stake: 100 zł 50%, 50 zł 25%, 10 zł 5%, and a win costs 200 zł on average', () => {
    assert.deepEqual([100, 50, 10, 1].map((stake) => wheelChance(stake, content)), [0.5, 0.25, 0.05, 0.005]);
    assert.equal(winCost(content), 200);
    for (const stake of [1, 10, 37, 100]) assert.ok(Math.abs(stake / wheelChance(stake, content) - 200) < 1e-9);
  });

  test('a spin wins under its chance and takes one of the prizes left, each as likely', () => {
    const seen = new Map();
    let wins = 0;
    for (let i = 0; i < 4000; i += 1) {
      const spin = spinWheel(50, [1, 3, 4], `spin:${i}`, content);
      assert.deepEqual(spinWheel(50, [1, 3, 4], `spin:${i}`, content), spin);
      if (!spin.win) {
        assert.equal(spin.prize, null);
        continue;
      }
      wins += 1;
      seen.set(spin.prize, (seen.get(spin.prize) ?? 0) + 1);
    }
    assert.ok(Math.abs(wins / 4000 - 0.25) < 0.03, String(wins));
    assert.deepEqual([...seen.keys()].sort(), [1, 3, 4]);
    for (const count of seen.values()) assert.ok(Math.abs(count / wins - 1 / 3) < 0.06);
    // A top stake wins about half the time; nothing left, nothing won.
    let top = 0;
    for (let i = 0; i < 2000; i += 1) top += spinWheel(100, [0], `top:${i}`, content).win ? 1 : 0;
    assert.ok(Math.abs(top / 2000 - 0.5) < 0.04, String(top));
    assert.deepEqual(spinWheel(100, [], 'pusto', content), { win: false, prize: null });
  });

  test('a spin needs a stake of 1 to 100 whole zł, the gold, a prize left, and room in the bag for an item', () => {
    const fine = { gold: 1000, left: 5, itemLeft: true, bagFree: 3 };
    assert.equal(spinBlock(100, fine, content), null);
    assert.equal(spinBlock(1, fine, content), null);
    for (const stake of [0, 101, 2.5, '50', null, -5]) assert.equal(spinBlock(stake, fine, content).code, 'invalid_stake', String(stake));
    assert.equal(spinBlock(100, { ...fine, gold: 99 }, content).code, 'not_enough_gold');
    assert.equal(spinBlock(100, { ...fine, left: 0 }, content).code, 'empty');
    assert.equal(spinBlock(100, { ...fine, bagFree: 0 }, content).code, 'bag_full');
    // Only materials left: they take no place in the bag.
    assert.equal(spinBlock(100, { ...fine, itemLeft: false, bagFree: 0 }, content), null);
  });

  test('an item prize is the rarest from rare up worth more than 100 zł and at most 200 zł to the character', () => {
    assert.equal(itemPrizeRarity(20, 0, content), 'epic');
    assert.equal(itemPrizeRarity(25, 0, content), 'epic');
    assert.equal(itemPrizeRarity(30, 0, content), 'unique');
    assert.equal(itemPrizeRarity(50, 0, content), 'unique');
    assert.equal(itemPrizeRarity(60, 0, content), 'rare');
    assert.equal(itemPrizeRarity(100, 0, content), 'rare');
    // Never a common item, so none once a rare one is worth more than a win.
    assert.equal(itemPrizeRarity(101, 0, content), null);
    // The Skup złomu raises what the scrapper pays, and the rarity comes down.
    assert.equal(itemPrizeRarity(20, 0.3, content), 'unique');
    assert.equal(itemPrizeRarity(60, 1, content), null);
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

  test("a pool of five prizes a day, from the character and the day, each worth more than 100 zł and no more than a win costs", () => {
    const bonusSets = [
      { sellBonus: 0, tanneryPremium: 0.1 },
      { sellBonus: 0.5, tanneryPremium: 0.2 },
      { sellBonus: 1, tanneryPremium: 0.3 },
    ];
    for (const level of [20, 30, 50, 80, 125]) {
      const lands = new Set(knownLandMaterials(character(level), content).map((material) => material.id));
      for (const bonuses of bonusSets) {
        let items = 0;
        for (let i = 0; i < 40; i += 1) {
          const pool = wheelPrizes({ character: character(level), seed: `postac:${i}`, ...bonuses }, NOW, content);
          assert.equal(pool.day, '2026-11-03');
          assert.deepEqual(pool.won, []);
          assert.equal(pool.prizes.length, 5);
          for (const prize of pool.prizes) {
            const worth = prizeWorth(prize, bonuses, content);
            assert.ok(worth > casino.wheel.prizeOver && worth <= winCost(content), `${level} ${JSON.stringify(prize).slice(0, 80)} ${worth}`);
            if (prize.kind === 'item') {
              items += 1;
              assert.equal(prize.item.level, level);
              assert.equal(prize.item.rarity, itemPrizeRarity(level, bonuses.sellBonus, content));
              assert.ok(canUse(prize.item.base, 'warrior', content, level), prize.item.base);
            } else {
              const { materialId, rarityId } = parseStack(prize.key);
              assert.ok(lands.has(materialId), materialId);
              assert.ok(Object.keys(casino.wheel.materialRarities).includes(rarityId) || rarityId === content.materialsById[materialId].rarity, prize.key);
              assert.ok(rarityAt(rarityId) >= rarityAt('epic'), prize.key);
              assert.ok(rarityAt(rarityId) >= rarityAt(content.materialsById[materialId].rarity), prize.key);
              assert.ok(Number.isInteger(prize.count) && prize.count >= 1);
            }
          }
          // The Wheel gives back less than it takes, at any stake.
          const worths = pool.prizes.map((prize) => prizeWorth(prize, bonuses, content));
          for (const stake of [1, 10, 50, 100]) assert.ok(spinExpectation(stake, worths, content) <= 0);
        }
        // About half the prizes are items while one fits.
        if (itemPrizeRarity(level, bonuses.sellBonus, content)) assert.ok(items > 40 && items < 160, `${level}: ${items}`);
        else assert.equal(items, 0);
      }
    }
  });

  test("a creature's material comes once in a pool", () => {
    for (let i = 0; i < 200; i += 1) {
      const pool = wheelPrizes({ character: character(30), seed: `raz:${i}` }, NOW, content);
      const kinds = pool.prizes.filter((prize) => prize.kind === 'material').map((prize) => parseStack(prize.key).materialId);
      assert.equal(new Set(kinds).size, kinds.length, kinds.join(', '));
    }
  });

  test('the same pool for the same character and day, another for another day or character', () => {
    const one = wheelPrizes({ character: character(30), seed: '7:casino' }, NOW, content);
    assert.deepEqual(wheelPrizes({ character: character(30), seed: '7:casino' }, NOW + 3600000, content), one);
    assert.notDeepEqual(wheelPrizes({ character: character(30), seed: '7:casino' }, NOW + 86400000, content).prizes, one.prizes);
    assert.notDeepEqual(wheelPrizes({ character: character(30), seed: '8:casino' }, NOW, content).prizes, one.prizes);
    // Kept for the day: today's stored pool counts, yesterday's does not.
    assert.deepEqual(wheelToday(one, NOW, content), one);
    assert.equal(wheelToday(one, NOW + 86400000, content), null);
    assert.equal(wheelToday(null, NOW, content), null);
    assert.deepEqual(prizesLeft({ ...one, won: [0, 3] }), [1, 2, 4]);
  });

  test('materials are the fewest pieces worth more than 100 zł at the Garbarnia', () => {
    const pool = wheelPrizes({ character: character(30), seed: 'materialy', sellBonus: 0, tanneryPremium: 0.1 }, NOW, content);
    for (const prize of pool.prizes.filter((one) => one.kind === 'material')) {
      const piece = prizeWorth({ ...prize, count: 1 }, { tanneryPremium: 0.1 }, content);
      assert.ok(piece * (prize.count - 1) <= casino.wheel.prizeOver);
      assert.ok(piece * prize.count > casino.wheel.prizeOver);
    }
    // An epic piece is worth 16 zł at the scrapper, 17,6 zł at the Garbarnia to a
    // stranger: six pieces; with the Skup złomu at its top and the best relation, three.
    assert.equal(Math.floor(casino.wheel.prizeOver / prizeWorth({ kind: 'material', key: 'wolf-pelt:epic', count: 1 }, { tanneryPremium: 0.1 }, content)) + 1, 6);
    assert.equal(Math.floor(casino.wheel.prizeOver / prizeWorth({ kind: 'material', key: 'wolf-pelt:epic', count: 1 }, { sellBonus: 1, tanneryPremium: 0.3 }, content)) + 1, 3);
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
  const salon = async (who = cookie) => (await call('GET', '/api/settlement/casino', { cookie: who })).data.casino;
  const ticket = (who = cookie) => call('POST', '/api/settlement/casino/ticket', { cookie: who });
  const spin = (stake, who = cookie) => call('POST', '/api/settlement/casino/spin', { cookie: who, body: { stake } });
  const run = (at) => server.getWorker().scheduled({ cron: '* * * * *', scheduledTime: new Date(at) });
  const today = () => casinoDay(Date.now(), content);
  const all = async (sql) => (await (await db()).prepare(sql).all()).results;

  test('the Salon opens with the Osada: the Loteria and a pool of five prizes, kept for the day', async () => {
    await set('level = 19');
    const locked = await call('GET', '/api/settlement/casino', { cookie });
    assert.deepEqual([locked.status, locked.data.error.code], [403, 'locked']);
    await set('level = 30');
    const view = await salon();
    assert.deepEqual(view.lottery, { name: 'Loteria', ticket: 50, base: 100, tickets: 0, pot: 100, mine: false, endsAt: today().endsAt, last: null });
    assert.equal(view.wheel.prizes.length, 5);
    assert.deepEqual([view.wheel.left, view.wheel.minStake, view.wheel.maxStake, view.wheel.prizeOver], [5, 1, 100, 100]);
    assert.ok(view.wheel.prizes.every((prize) => !prize.won && prize.worth > 100 && prize.worth <= 200));
    assert.equal(view.texts.announce, casino.texts.announce);
    // The pool is kept in the Osada and comes back the same.
    assert.equal((await stored()).casino.day, today().key);
    assert.deepEqual((await salon()).wheel.prizes, view.wheel.prizes);
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
    // Another character's ticket grows the same pot.
    const other = await player('Ala');
    assert.equal((await ticket(other)).data.casino.lottery.pot, 200);
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

  test('the Wheel: a stake of 1 to 100 zł, gone whatever comes, and a win takes a prize of the pool until it is empty', async () => {
    const before = await salon();
    assert.equal((await spin(0)).status, 400);
    assert.equal((await spin(101)).data.error.code, 'invalid_stake');
    assert.equal((await spin('50')).data.error.code, 'invalid_stake');
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
      assert.equal(answer.data.spin.chance, 0.5);
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
    const bag = await all("SELECT data FROM items WHERE slot IS NULL ORDER BY id");
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
  });

  test('two taps with the gold for one spin spin once, and taps at once never pay without a spin nor win a prize twice', async () => {
    await salon();
    await set('gold = 100');
    const taps = await Promise.all([spin(100), spin(100)]);
    assert.deepEqual(taps.map((tap) => tap.status).sort(), [200, 409]);
    assert.equal((await row()).gold, 0);
    // With gold for all: each spin that goes through pays its stake, once.
    await set('gold = 100000');
    const more = await Promise.all([spin(100), spin(100), spin(100)]);
    assert.ok(more.every((tap) => tap.status === 200 || tap.status === 409), JSON.stringify(more.map((tap) => tap.status)));
    const done = [...taps, ...more].filter((tap) => tap.status === 200);
    assert.equal((await row()).gold, 100000 - 100 * (done.length - 1));
    const pool = (await stored()).casino;
    assert.equal(pool.won.length, done.filter((tap) => tap.data.spin.win).length);
    assert.equal(new Set(pool.won).size, pool.won.length);
  });

  test('a full bag waits while an item is in the pool; a new day brings a new pool', async () => {
    const item = generateItem({ baseId: 'sword', level: 30, rarityId: 'unique' }, createRng('nagroda'), content);
    const pool = { day: today().key, prizes: [{ kind: 'item', item }, { kind: 'material', key: 'wolf-pelt:epic', count: 6 }], won: [] };
    await set('settlement = ?', JSON.stringify({ ...(await stored()), casino: pool }));
    const { id } = await row();
    const places = bagCapacity(campLevels({}, Date.now(), content), content);
    const database = await db();
    await database.batch(Array.from({ length: places }, () => database.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)').bind(id, JSON.stringify(item))));
    const view = await salon();
    assert.deepEqual([view.wheel.itemLeft, view.wheel.bagFree], [true, 0]);
    assert.equal((await spin(100)).data.error.code, 'bag_full');
    // Only materials left: the Wheel turns with a full bag.
    await set('settlement = ?', JSON.stringify({ ...(await stored()), casino: { ...pool, won: [0] } }));
    assert.equal((await spin(100)).status, 200);
    // The next day's pool is new, with nothing won.
    await set('settlement = ?', JSON.stringify({ ...(await stored()), casino: { ...pool, day: '2026-01-01', won: [0, 1] } }));
    const fresh = await salon();
    assert.deepEqual([fresh.wheel.left, fresh.wheel.prizes.length], [5, 5]);
    assert.equal((await stored()).casino.day, today().key);
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

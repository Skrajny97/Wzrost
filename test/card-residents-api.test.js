// The residents of the Osada at their card tables through the API (904 B;
// src/server/cards.js, src/engine/card-residents.js): nothing of them where
// CARDS is off; the nine tables in Talia Systemu's view and their places
// marked in the Osada's, Jagna's as on mock-up 910.2 (250 zł at level 64,
// her first four cards), in English too; a training match at a resident's
// table pays and counts nothing; a staked one pays its stake at the start
// and counts in the same ten a day as Szczęsny's; za wygraną zgarniesz
// podwójną stawkę, a draw gives the stake back, a loss and a surrender
// nothing; the first staked win gives a card of the resident's deck the
// character has not got, every later one a card with a chance of 10% (drawn
// from the match's seed); one match at a time at all the tables.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { cardComes, casinoDay, createRng, residentDeck, residentTable, starterDeck } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rules = content.cards;
const jagna = residentTable('herbalist', content);
const jagnaDeck = residentDeck(jagna);
// The first seed `prefix:N` whose draw of a later staked win's card comes
// (or not), as the server draws it from the match's seed (residentWinCard).
function seedWhere(prefix, comes) {
  for (let index = 0; index < 100000; index += 1) {
    const seed = `${prefix}:${index}`;
    if (cardComes(createRng(`${seed}:resident-card`), rules.residents.chance) === comes) return seed;
  }
  throw new Error('no such seed');
}

describe('the residents\' card tables where CARDS is off', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on' });

  test('no resident plays, and no match at their tables starts', async () => {
    const { cookie } = await signUp('bezstolu');
    await call('POST', '/api/character', { cookie, body: { name: 'Bezstolu', classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = 64, class_level = 64').run();
    const osada = (await call('GET', '/api/settlement', { cookie })).data.settlement;
    assert.ok(osada.residents.every((resident) => resident.cards === false));
    assert.equal((await call('POST', '/api/cards/match', { cookie, body: { resident: 'herbalist', staked: false } })).status, 404);
  });
});

describe('the residents\' card tables through the API (904 B)', () => {
  const { server, call, db, signUp } = useServer({ SETTLEMENT: 'on', CARDS: 'on', ENGLISH: 'on' });
  let cookie;
  let id;
  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql} WHERE name = 'Gracz'`).bind(...binds).run();
  const row = async () => (await db()).prepare("SELECT * FROM characters WHERE name = 'Gracz'").first();
  const tab = async () => (await call('GET', '/api/cards', { cookie })).data.cards;
  const start = (body) => call('POST', '/api/cards/match', { cookie, body });
  const turn = (body) => call('POST', '/api/cards/turn', { cookie, body });
  const state = async () => JSON.parse((await (await db()).prepare('SELECT state FROM card_matches WHERE result IS NULL').first()).state);
  const setState = async (next) => (await db()).prepare('UPDATE card_matches SET state = ? WHERE result IS NULL').bind(JSON.stringify(next)).run();
  const game = async () => JSON.parse((await row()).card_game);
  const copies = async (monster) => (await (await db()).prepare('SELECT copies FROM cards WHERE character_id = ? AND monster_id = ?').bind(id, monster).first())?.copies ?? 0;
  const own = async (monsters) => {
    for (const monster of monsters) await (await db()).prepare('INSERT INTO cards (character_id, monster_id, copies, created_at) VALUES (?, ?, 1, 0) ON CONFLICT DO NOTHING').bind(id, monster).run();
  };
  // The running match left with one card on each side's front line, the
  // player's with `mine` Życie and the rival's with `theirs`, nothing
  // else; the rival's card hits for `foeAttack`; `seed` for its end's draws.
  const lastCards = async (mine, theirs, { foeAttack = 1, seed = null } = {}) => {
    const match = await state();
    for (const [side, life] of [
      [match.me, mine],
      [match.foe, theirs],
    ]) {
      const key = side.cards[0].key;
      side.lines = [key, null, null];
      side.hand = [];
      side.deck = [];
      side.out = side.cards.map((card) => card.key).filter((one) => one !== key);
      side.cards[0].life = life;
    }
    match.foe.cards[0].attack = foeAttack;
    match.me.cards[0].attack = Math.max(match.me.cards[0].attack, 1);
    if (seed) match.seed = seed;
    await setState(match);
    return match;
  };
  // A staked match at Jagna's played to a win, from `seed` if given.
  const winAtJagna = async (seed = null) => {
    assert.equal((await start({ resident: 'herbalist', staked: true })).status, 200);
    const match = await lastCards(99, 1, { seed });
    const won = await turn({ round: match.round, lines: match.me.lines });
    assert.equal(won.status, 200, JSON.stringify(won.data));
    assert.equal(won.data.end.result, 'won');
    return won.data;
  };

  beforeEach(async () => {
    ({ cookie } = await signUp('gracz'));
    await call('POST', '/api/character', { cookie, body: { name: 'Gracz', classId: 'warrior', appearance: 'female' } });
    await set('level = 64, class_level = 64, gold = 100000');
    id = (await row()).id;
  });

  test('nine tables in the view, Jagna\'s as on 910.2, and their places in the Osada; in English too', async () => {
    const osada = (await call('GET', '/api/settlement', { cookie })).data.settlement;
    const playing = osada.residents.filter((resident) => resident.cards).map((resident) => resident.id);
    assert.deepEqual(playing.sort(), ['enchantress', 'groom', 'headman', 'herbalist', 'hermit', 'innkeeper', 'merchant', 'smith', 'tanner']);
    assert.equal(osada.residents.find((resident) => resident.id === 'gamehost').cards, false);
    const view = await tab();
    assert.equal(view.residents.length, 9);
    const table = view.residents.find((one) => one.id === 'herbalist');
    assert.deepEqual(
      { name: table.name, place: table.place, gender: table.gender, with: table.with, of: table.of, deck: table.deck, after: table.after, top: table.top, stake: table.stake, win: table.win, chance: table.chance },
      { name: 'Jagna', place: 'herbalist', gender: 'f', with: 'z Jagną', of: 'Jagny', deck: 'Talia z bagien', after: 2, top: false, stake: 250, win: 500, chance: 0.1 },
    );
    assert.equal(table.style, 'Jagna gra stworami z Torfowisk, najchętniej Magią.');
    assert.deepEqual(
      table.cards.map((card) => `${card.name} ${card.level} ${card.attack}/${card.life}`),
      ['Ropucha 3 14/34', 'Bagienna rosiczka 2 11/37', 'Zjawa 2 15/30', 'Ognik 3 18/24'],
    );
    assert.deepEqual([table.size, table.missing, table.left, table.beaten], [12, 12, 12, false]);
    assert.ok(table.texts.win.length > 0 && table.texts.loss.length > 0 && table.texts.draw.length > 0);
    assert.equal(view.residents.find((one) => one.id === 'hermit').top, true);
    assert.deepEqual(view.staked, { today: 0, limit: rules.stakes.perDay });
    // The page's English: the deck's name, style and words, the name's forms.
    const english = await server.fetch('/api/cards', { headers: { Cookie: cookie, 'X-Lang': 'en' } });
    const englishTable = (await english.json()).cards.residents.find((one) => one.id === 'herbalist');
    assert.deepEqual([englishTable.deck, englishTable.with, englishTable.of], ['The Bog Deck', 'with Jagna', 'Jagna']);
    assert.equal(englishTable.style, 'Jagna plays creatures of the Peatlands, Magic above all.');
  });

  test('a training match at Jagna\'s: hers, no stake, no counter, no card; one match at a time at every table', async () => {
    assert.equal((await start({ resident: 'herbalist', staked: false })).data.error.code, 'no_deck');
    await call('POST', '/api/cards/starter', { cookie });
    assert.deepEqual([(await start({ resident: 'gamehost', staked: false })).status, (await start({ resident: 'gamehost', staked: false })).data.error.code], [400, 'invalid_resident']);
    assert.equal((await start({ resident: 'nikt', staked: false })).data.error.code, 'invalid_resident');
    const started = await start({ resident: 'herbalist', staked: false });
    assert.equal(started.status, 200, JSON.stringify(started.data));
    const match = started.data.cards.match;
    assert.deepEqual([match.resident, match.tier, match.mode, match.stake], ['herbalist', null, 'training', 0]);
    assert.equal(started.data.cards.staked.today, 0);
    assert.equal((await row()).gold, 100000);
    // Her deck on the table: the rival's cards are hers.
    const kept = await state();
    assert.deepEqual(kept.foe.cards.map((card) => card.id), jagnaDeck);
    assert.equal(kept.foe.smart, jagna.smart);
    // One match at a time: not at Szczęsny's, not at another resident's.
    assert.equal((await start({ tier: 1, staked: false })).data.error.code, 'match_running');
    assert.equal((await start({ resident: 'smith', staked: true })).data.error.code, 'match_running');
    const last = await lastCards(99, 1);
    const won = await turn({ round: last.round, lines: last.me.lines });
    assert.equal(won.data.end.result, 'won');
    assert.deepEqual([won.data.end.resident, won.data.end.tier, won.data.end.gold, won.data.end.card, won.data.end.deck], ['herbalist', null, 0, null, 'Talia z bagien']);
    assert.equal((await row()).gold, 100000);
    assert.deepEqual((await game()).residents, []);
    const after = won.data.cards;
    assert.equal(after.match, null);
    assert.deepEqual([after.last.resident, after.last.result, after.last.mode], ['herbalist', 'won', 'training']);
    assert.equal(after.residents.find((one) => one.id === 'herbalist').beaten, false);
  });

  test('a staked match at a resident\'s table: its stake at the start, in the same ten a day as Szczęsny\'s', async () => {
    await call('POST', '/api/cards/starter', { cookie });
    await set('gold = 249');
    assert.equal((await start({ resident: 'herbalist', staked: true })).data.error.code, 'not_enough_gold');
    await set('gold = 100000');
    // One at Szczęsny's counts at Jagna's table.
    await start({ tier: 1, staked: true });
    await call('POST', '/api/cards/surrender', { cookie });
    assert.equal((await tab()).staked.today, 1);
    const started = await start({ resident: 'herbalist', staked: true });
    assert.equal(started.status, 200);
    assert.deepEqual([started.data.cards.match.stake, started.data.cards.staked.today], [250, 2]);
    assert.equal((await row()).gold, 100000 - 100 - 250);
    // Given up: lost, the stake stays with Jagna.
    const given = await call('POST', '/api/cards/surrender', { cookie });
    assert.deepEqual([given.data.end.result, given.data.end.resident, given.data.end.gold, given.data.end.card], ['lost', 'herbalist', 0, null]);
    assert.equal((await row()).gold, 100000 - 100 - 250);
    // The day's ten taken at the tables, the tenth at a resident's: then
    // no staked match anywhere, training at all of them.
    const day = casinoDay(Date.now(), content).key;
    await set('card_game = ?', JSON.stringify({ ...(await game()), day, staked: rules.stakes.perDay - 1 }));
    assert.equal((await start({ resident: 'tanner', staked: true })).status, 200);
    await call('POST', '/api/cards/surrender', { cookie });
    assert.equal((await tab()).staked.today, rules.stakes.perDay);
    assert.equal((await start({ resident: 'herbalist', staked: true })).data.error.code, 'stakes_used');
    assert.equal((await start({ tier: 2, staked: true })).data.error.code, 'stakes_used');
    assert.equal((await start({ resident: 'hermit', staked: false })).status, 200);
  });

  test('za wygraną zgarniesz podwójną stawkę; the first staked win gives a card of her deck the character has not got', async () => {
    await call('POST', '/api/cards/starter', { cookie });
    // Every card of hers but one (Mgławica came with the starter deck): the
    // first win gives that one.
    const missing = jagnaDeck[1];
    assert.ok(!starterDeck(content).includes(missing));
    await own(jagnaDeck.filter((monster) => monster !== missing));
    const won = await winAtJagna();
    const end = won.end;
    assert.deepEqual([end.resident, end.gold, end.daily, end.first, end.deck], ['herbalist', 500, 0, true, 'Talia z bagien']);
    assert.deepEqual([end.card.id, end.card.fresh, end.card.level], [missing, true, 1]);
    assert.equal((await row()).gold, 100000 - 250 + 500);
    assert.equal(await copies(missing), 1);
    assert.deepEqual((await game()).residents, ['herbalist']);
    const table = won.cards.residents.find((one) => one.id === 'herbalist');
    assert.deepEqual([table.beaten, table.missing], [true, 0]);
    // No tier of Szczęsny's beaten nor rewarded by it.
    assert.deepEqual([(await game()).beaten, (await game()).rewarded], [[], []]);
  });

  test('the first staked win with none of her cards: one of hers, new; a draw gives the stake back, a loss nothing', async () => {
    await call('POST', '/api/cards/starter', { cookie });
    const won = await winAtJagna();
    assert.ok(jagnaDeck.includes(won.end.card.id), won.end.card.id);
    assert.deepEqual([won.end.card.fresh, won.end.first], [true, true]);
    assert.equal(await copies(won.end.card.id), 1);
    // A draw: both last cards beaten at once.
    await start({ resident: 'herbalist', staked: true });
    let match = await lastCards(1, 1, { foeAttack: 50 });
    const drawn = await turn({ round: match.round, lines: match.me.lines });
    assert.deepEqual([drawn.data.end.result, drawn.data.end.gold, drawn.data.end.card], ['drawn', 250, null]);
    assert.equal((await row()).gold, 100000 + 250);
    await start({ resident: 'herbalist', staked: true });
    match = await lastCards(1, 99, { foeAttack: 50 });
    const lost = await turn({ round: match.round, lines: match.me.lines });
    assert.deepEqual([lost.data.end.result, lost.data.end.gold, lost.data.end.card], ['lost', 0, null]);
    assert.equal((await row()).gold, 100000 + 250 - 250);
  });

  test('every later staked win: a card of her deck with a chance of 10%, from the match\'s seed, one not got first', async () => {
    await call('POST', '/api/cards/starter', { cookie });
    await set('card_game = ?', JSON.stringify({ ...(await game()), residents: ['herbalist'] }));
    // A seed whose draw does not come: twice the stake, no card.
    const none = await winAtJagna(seedWhere('bez', false));
    assert.deepEqual([none.end.gold, none.end.card, none.end.first], [500, null, false]);
    // One whose draw comes: a card of hers, the only one not got yet.
    const missing = jagnaDeck[9];
    assert.ok(!starterDeck(content).includes(missing));
    await own(jagnaDeck.filter((monster) => monster !== missing));
    const some = await winAtJagna(seedWhere('z-karta', true));
    assert.deepEqual([some.end.gold, some.end.first, some.end.card.id, some.end.card.fresh], [500, false, missing, true]);
    assert.equal(await copies(missing), 1);
    // Every card of hers got: a second copy of one, its level up.
    const again = await winAtJagna(seedWhere('druga', true));
    assert.ok(jagnaDeck.includes(again.end.card.id));
    assert.deepEqual([again.end.card.fresh, again.end.card.level], [false, 2]);
    assert.equal(await copies(again.end.card.id), 2);
    assert.equal((await row()).gold, 100000 + 3 * 250);
    // Training at her table gives no card, whatever the seed.
    await start({ resident: 'herbalist', staked: false });
    const match = await lastCards(99, 1, { seed: seedWhere('trening', true) });
    const trained = await turn({ round: match.round, lines: match.me.lines });
    assert.deepEqual([trained.data.end.result, trained.data.end.card, trained.data.end.gold], ['won', null, 0]);
  });
});

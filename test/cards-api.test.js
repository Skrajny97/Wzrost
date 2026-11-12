// Talia Systemu through the API (src/server/cards.js; DECISIONS.md, "Talia
// Systemu: gra karciana w Salonie Gier", 871–877): nothing of it where CARDS
// is off; with the Salon where it is on; Szczęsny's starter deck once; a deck
// of twelve cards of the collection; a training match and a staked one
// played turn by turn on the server, the state never shown, two taps one
// turn; the day's ten staked matches and the gold for the stake; za wygraną
// zgarniesz podwójną stawkę, the tier's reward of the day once a day and its
// card at the first win, a draw's stake back, a surrender lost; the cards
// the creatures of an exploration leave in the report and the collection;
// the cards gone with the character and the account.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { casinoDay, cardRarity, expectedExploration, hostTier, portalArea, starterDeck, tierStake } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rules = content.cards;
// The gold of `minutes` of exploring at a level, as a tier's reward of the day.
const explorationGold = (minutes, level) => Math.max(1, Math.round(expectedExploration(portalArea(level, content), level, minutes, content).gold));

describe('Talia Systemu where CARDS is off', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on' });

  test('nothing of it answers, and the Salon has no tab of cards', async () => {
    const { cookie } = await signUp('BezKart');
    await call('POST', '/api/character', { cookie, body: { name: 'BezKart', classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = 30, class_level = 30').run();
    for (const [method, path] of [['GET', '/api/cards'], ['POST', '/api/cards/starter'], ['POST', '/api/cards/match'], ['POST', '/api/cards/turn']]) {
      const answer = await call(method, path, { cookie, body: method === 'POST' ? {} : undefined });
      assert.equal(answer.status, 404, path);
    }
    assert.equal((await call('GET', '/api/settlement/casino', { cookie })).data.casino.cards, false);
  });
});

describe('Talia Systemu through the API', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on', CARDS: 'on' });
  let cookie;
  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql} WHERE name = 'Karciarz'`).bind(...binds).run();
  const row = async () => (await db()).prepare("SELECT * FROM characters WHERE name = 'Karciarz'").first();
  const tab = async () => (await call('GET', '/api/cards', { cookie })).data.cards;
  const start = (tier, staked) => call('POST', '/api/cards/match', { cookie, body: { tier, staked } });
  const turn = (body) => call('POST', '/api/cards/turn', { cookie, body });
  const running = async () => (await db()).prepare('SELECT * FROM card_matches WHERE result IS NULL').first();
  const state = async () => JSON.parse((await running()).state);
  const setState = async (next) => (await db()).prepare('UPDATE card_matches SET state = ? WHERE result IS NULL').bind(JSON.stringify(next)).run();
  // The view's reserve on the empty lines, from the front.
  const fill = (match) => {
    const lines = match.me.lines.map((card) => card?.key ?? null);
    const hand = match.me.hand.map((card) => card.key);
    for (let line = 0; line < 3; line += 1) if (lines[line] === null && hand.length > 0) lines[line] = hand.shift();
    return { round: match.round, lines };
  };
  // A match left with one card of each side on the front line, the
  // player's with `mine` Życie and the rival's with `theirs`, nothing else.
  const lastCards = async (mine, theirs) => {
    const match = await state();
    for (const [side, life] of [[match.me, mine], [match.foe, theirs]]) {
      const key = side.cards[0].key;
      side.lines = [key, null, null];
      side.hand = [];
      side.deck = [];
      side.out = side.cards.map((card) => card.key).filter((one) => one !== key);
      side.cards[0].life = life;
    }
    match.foe.cards[0].attack = 1;
    match.me.cards[0].attack = Math.max(match.me.cards[0].attack, 1);
    await setState(match);
    return match;
  };

  beforeEach(async () => {
    ({ cookie } = await signUp('karciarz'));
    await call('POST', '/api/character', { cookie, body: { name: 'Karciarz', classId: 'warrior', appearance: 'female' } });
    await set('level = 30, class_level = 30, gold = 100000');
  });

  test('the tab opens with the Salon: Szczęsny\'s offer, his five tiers with their stakes, the rules', async () => {
    await set('level = 19');
    const locked = await call('GET', '/api/cards', { cookie });
    assert.deepEqual([locked.status, locked.data.error.code], [403, 'locked']);
    await set('level = 30');
    assert.equal((await call('GET', '/api/settlement/casino', { cookie })).data.casino.cards, true);
    const view = await tab();
    assert.equal(view.starter, false);
    assert.deepEqual(view.collection, []);
    assert.equal(view.deck, null);
    assert.equal(view.match, null);
    assert.equal(view.tiers.length, 5);
    assert.deepEqual(view.tiers.map((tier) => tier.stake), [1, 2, 3, 4, 5].map((stake) => stake * 100));
    assert.deepEqual(view.tiers.map((tier) => tier.win), [1, 2, 3, 4, 5].map((stake) => stake * 200));
    assert.equal(view.tiers[0].reward, explorationGold(hostTier(1, content).rewardMinutes, 30));
    assert.deepEqual(view.staked, { today: 0, limit: rules.stakes.perDay });
    assert.equal(view.hero.classId, 'warrior');
    assert.equal(view.hero.skill.name, 'Szarża');
    assert.ok(view.texts.rules.length >= 5);
    // No match without the starter deck.
    assert.equal((await start(1, false)).data.error.code, 'no_deck');
  });

  test('Szczęsny\'s starter deck, once: twelve cards, the deck laid', async () => {
    const taken = await call('POST', '/api/cards/starter', { cookie });
    assert.equal(taken.status, 200);
    const view = taken.data.cards;
    assert.equal(view.starter, true);
    assert.equal(view.collection.length, 12);
    assert.deepEqual([...view.deck].sort(), [...starterDeck(content)].sort());
    assert.ok(view.collection.every((card) => card.inDeck && card.level === 1 && card.copies === 1 && card.attack > 0 && card.life > 0));
    const again = await call('POST', '/api/cards/starter', { cookie });
    assert.deepEqual([again.status, again.data.error.code], [409, 'starter_taken']);
    // Two taps at once give it once.
    await (await db()).prepare('DELETE FROM cards').run();
    await set("card_game = '{}'");
    await Promise.all([call('POST', '/api/cards/starter', { cookie }), call('POST', '/api/cards/starter', { cookie })]);
    const copies = await (await db()).prepare('SELECT SUM(copies) AS copies FROM cards').first();
    assert.equal(copies.copies, 12);
  });

  test('a deck is twelve different cards of the collection', async () => {
    await call('POST', '/api/cards/starter', { cookie });
    await (await db()).prepare("INSERT INTO cards (character_id, monster_id, copies, created_at) SELECT id, 'boar', 2, 1 FROM characters").run();
    const ids = starterDeck(content);
    const save = (cards) => call('POST', '/api/cards/deck', { cookie, body: { cards } });
    assert.equal((await save(ids.slice(1))).status, 400);
    assert.equal((await save([...ids.slice(1), ids[1]])).status, 400);
    assert.equal((await save([...ids.slice(1), 'basilisk'])).status, 400);
    const saved = await save([...ids.slice(1), 'boar']);
    assert.equal(saved.status, 200);
    assert.ok(saved.data.cards.deck.includes('boar') && !saved.data.cards.deck.includes(ids[0]));
    assert.equal(saved.data.cards.collection.find((card) => card.id === 'boar').level, 2);
  });

  test('a training match played turn by turn on the server, its seed and decks never shown, two taps one turn', async () => {
    await call('POST', '/api/cards/starter', { cookie });
    const started = await start(1, false);
    assert.equal(started.status, 200);
    const gold = (await row()).gold;
    let match = started.data.cards.match;
    assert.equal(match.mode, 'training');
    assert.equal(match.stake, 0);
    assert.equal(match.round, 1);
    assert.equal(match.me.hand.length, rules.hand);
    assert.ok(match.foe.lines.every(Boolean));
    const kept = await running();
    const text = JSON.stringify(started.data);
    assert.ok(!text.includes(JSON.parse(kept.state).seed));
    assert.equal(typeof match.foe.hand, 'number');
    // One match at a time.
    assert.equal((await start(1, false)).data.error.code, 'match_running');
    // A stale round, and two taps of the same turn: one is played.
    assert.equal((await turn({ ...fill(match), round: 5 })).data.error.code, 'stale_round');
    const [one, two] = await Promise.all([turn(fill(match)), turn(fill(match))]);
    assert.deepEqual([one.status, two.status].sort(), [200, 409]);
    match = (one.status === 200 ? one : two).data.cards.match;
    assert.equal(match?.round ?? 2, 2);
    let guard = 0;
    let end = null;
    while (match && guard++ < 40) {
      const answer = await turn(fill(match));
      assert.equal(answer.status, 200, JSON.stringify(answer.data));
      end = answer.data.end ?? null;
      match = answer.data.cards.match;
    }
    assert.ok(end, 'partia się skończyła');
    assert.ok(['won', 'lost', 'drawn'].includes(end.result));
    assert.deepEqual([end.gold, end.daily, end.card], [0, 0, null]);
    // A training match touches no gold and no day's counters.
    const after = await row();
    assert.equal(after.gold, gold);
    assert.equal((await tab()).staked.today, 0);
    assert.equal((await tab()).last.result, end.result);
  });

  test('a staked match: its stake paid at the start, one of the day\'s ten, the gold for it', async () => {
    await call('POST', '/api/cards/starter', { cookie });
    const stake = tierStake(hostTier(2, content), 30, content);
    await set('gold = ?', stake - 1);
    assert.equal((await start(2, true)).data.error.code, 'not_enough_gold');
    await set('gold = 100000');
    const started = await start(2, true);
    assert.equal(started.status, 200);
    assert.equal((await row()).gold, 100000 - stake);
    assert.deepEqual(started.data.cards.staked, { today: 1, limit: rules.stakes.perDay });
    assert.equal(started.data.cards.match.stake, stake);
    // Surrendered: lost, the stake stays with Szczęsny.
    const given = await call('POST', '/api/cards/surrender', { cookie });
    assert.equal(given.data.end.result, 'lost');
    assert.equal((await row()).gold, 100000 - stake);
    assert.equal(given.data.cards.match, null);
    // The day's ten, then training only.
    const day = casinoDay(Date.now(), content).key;
    await set('card_game = ?', JSON.stringify({ starter: true, day, staked: rules.stakes.perDay, rewarded: [], beaten: [] }));
    assert.equal((await start(1, true)).data.error.code, 'stakes_used');
    assert.equal((await start(1, false)).status, 200);
    // A new day, new stakes.
    await call('POST', '/api/cards/surrender', { cookie });
    await set('card_game = ?', JSON.stringify({ starter: true, day: '2020-01-01', staked: rules.stakes.perDay, rewarded: [1], beaten: [] }));
    const fresh = await tab();
    assert.deepEqual(fresh.staked, { today: 0, limit: rules.stakes.perDay });
    assert.equal(fresh.tiers[0].rewarded, false);
  });

  test('za wygraną zgarniesz podwójną stawkę, the reward of the day once a day, the tier\'s card at its first win', async () => {
    await call('POST', '/api/cards/starter', { cookie });
    const tier = hostTier(1, content);
    const stake = tierStake(tier, 30, content);
    const reward = explorationGold(tier.rewardMinutes, 30);
    await start(1, true);
    let match = await lastCards(99, 1);
    const won = await turn({ round: match.round, lines: match.me.lines });
    assert.equal(won.status, 200, JSON.stringify(won.data));
    assert.equal(won.data.end.result, 'won');
    assert.equal(won.data.end.gold, 2 * stake);
    assert.equal(won.data.end.daily, reward);
    assert.equal(cardRarity(won.data.end.card.id, content), tier.firstWin.rarity);
    assert.equal((await row()).gold, 100000 - stake + 2 * stake + reward);
    const view = won.data.cards;
    assert.ok(view.collection.some((card) => card.id === won.data.end.card.id));
    assert.deepEqual([view.tiers[0].rewarded, view.tiers[0].beaten], [true, true]);
    assert.equal(view.match, null);
    assert.equal(view.last.result, 'won');
    // Again the same day: twice the stake, no reward of the day, no card.
    await start(1, true);
    match = await lastCards(99, 1);
    const again = await turn({ round: match.round, lines: match.me.lines });
    assert.deepEqual([again.data.end.gold, again.data.end.daily, again.data.end.card], [2 * stake, 0, null]);
  });

  test('a draw gives the stake back, a lost match nothing', async () => {
    await call('POST', '/api/cards/starter', { cookie });
    const stake = tierStake(hostTier(3, content), 30, content);
    await start(3, true);
    let match = await lastCards(1, 1);
    // Both last cards beaten at once.
    match.foe.cards[0].attack = 50;
    await setState(match);
    const drawn = await turn({ round: match.round, lines: match.me.lines });
    assert.equal(drawn.data.end.result, 'drawn');
    assert.equal((await row()).gold, 100000);
    await start(3, true);
    match = await lastCards(1, 99);
    match.foe.cards[0].attack = 50;
    await setState(match);
    const lost = await turn({ round: match.round, lines: match.me.lines });
    assert.equal(lost.data.end.result, 'lost');
    assert.equal((await row()).gold, 100000 - stake);
  });

  test('the hero\'s skill once a match, checked on the server', async () => {
    await call('POST', '/api/cards/starter', { cookie });
    const started = await start(1, false);
    const match = started.data.cards.match;
    const plan = fill(match);
    const bad = await turn({ ...plan, skill: { card: 99 } });
    assert.equal(bad.data.error.code, 'invalid_skill');
    const used = await turn({ ...plan, skill: { card: plan.lines[0] } });
    assert.equal(used.status, 200);
    const next = used.data.cards.match;
    if (next) {
      assert.equal(next.me.hero.used, true);
      assert.equal(next.last.skill.kind, 'fury');
      const twice = await turn({ ...fill(next), skill: { card: fill(next).lines.find((key) => key !== null) } });
      assert.equal(twice.data.error.code, 'skill_used');
    }
  });

  test('the creatures of an exploration leave cards: in the report, the Dziennik and the collection', async () => {
    await set('level = 60, class_level = 50');
    let found = null;
    for (let attempt = 0; attempt < 30 && !found; attempt += 1) {
      const started = await call('POST', '/api/hunts', { cookie, body: { areaId: 'boar-thicket', minutes: 240 } });
      assert.equal(started.status, 201, JSON.stringify(started.data));
      await (await db()).prepare('UPDATE activities SET seed = ?, hp_at_start = 99999, started_at = started_at - ?, ends_at = ends_at - ?').bind(`karty:${attempt}`, 240 * 60000, 240 * 60000).run();
      const claimed = await call('POST', '/api/hunts/claim', { cookie });
      assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
      if (claimed.data.report.cards?.length > 0) found = claimed.data.report;
      await set('hp = 99999');
    }
    assert.ok(found, 'w 30 wyprawach wypadła karta');
    const card = found.cards[0];
    assert.equal(card.fresh, true);
    assert.equal(card.level, 1);
    const stored = await (await db()).prepare('SELECT * FROM cards WHERE monster_id = ?').bind(card.id).first();
    assert.equal(stored.copies, found.cards.filter((one) => one.id === card.id).length);
    const journal = await (await db()).prepare("SELECT summary FROM reports WHERE kind = 'hunt' ORDER BY id DESC LIMIT 1").first();
    assert.deepEqual(
      JSON.parse(journal.summary).cards.map((one) => one.name),
      found.cards.map((one) => one.name),
    );
  });

  test('the cards go with the character, and with the account', async () => {
    await call('POST', '/api/cards/starter', { cookie });
    await start(1, false);
    const count = async () => {
      const database = await db();
      const [cards, decks, matches] = await Promise.all(['cards', 'card_decks', 'card_matches'].map((table) => database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()));
      return [cards.n, decks.n, matches.n];
    };
    assert.deepEqual(await count(), [12, 1, 1]);
    assert.equal((await call('DELETE', '/api/character', { cookie })).status, 200);
    assert.deepEqual(await count(), [0, 0, 0]);
    // A new character of the account, and the account removed with it.
    await call('POST', '/api/character', { cookie, body: { name: 'Karciarz', classId: 'mage', appearance: 'male' } });
    await set('level = 30, class_level = 30, gold = 100000');
    await call('POST', '/api/cards/starter', { cookie });
    await start(1, false);
    assert.deepEqual(await count(), [12, 1, 1]);
    assert.equal((await call('DELETE', '/api/me', { cookie, body: { login: 'karciarz' } })).status, 200);
    assert.deepEqual(await count(), [0, 0, 0]);
  });
});

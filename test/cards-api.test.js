// Talia Systemu through the API (src/server/cards.js; DECISIONS.md, "Talia
// Systemu: gra karciana w Salonie Gier", 871–877): nothing of it where CARDS
// is off; with the Salon where it is on; Szczęsny's starter deck once; a deck
// of twelve cards of the collection; a training match and a staked one
// played turn by turn on the server, the state never shown, two taps one
// turn; the day's ten staked matches and the gold for the stake; za wygraną
// zgarniesz podwójną stawkę, the tier's reward of the day once a day and its
// card at the first win, a draw's stake back, a surrender lost; the cards
// the creatures of an exploration leave in the report and the collection;
// the cards gone with the character and the account; and the cards of the
// sources of 903: a profession's work, a Próba Gildii finished, an attack
// on the Bestia and the creatures beaten in the Labirynt.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  areaLand,
  cardComes,
  cardHomes,
  cardKind,
  cardRarity,
  cardsUpTo,
  casinoDay,
  createRng,
  expectedExploration,
  hostTier,
  labyrinthDay,
  labyrinthFoes,
  lowerLandCards,
  lowerLandNames,
  newLabyrinth,
  portalArea,
  questPeriod,
  starterDeck,
  tierStake,
  workCardChance,
} from '../src/engine/index.js';
import { makeClimber } from './helpers/climb.js';
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

  test('the day\'s pack at Szczęsny\'s (902 C): three cards of the lower lands, those not got first, for the gold of an hour of exploring, once a day', async () => {
    await set('level = 64, class_level = 64, gold = 100000');
    assert.equal((await tab()).pack, null);
    assert.equal((await call('POST', '/api/cards/pack', { cookie })).data.error.code, 'no_starter');
    await call('POST', '/api/cards/starter', { cookie });
    const land = areaLand(portalArea(64, content).id, content);
    const pool = lowerLandCards(land, content);
    const offer = (await tab()).pack;
    assert.equal(offer.price, explorationGold(rules.pack.goldMinutes, 64));
    assert.deepEqual([offer.bought, offer.count, offer.empty], [false, rules.pack.cards, false]);
    assert.deepEqual(offer.lands, lowerLandNames(land, content));
    const before = (await row()).gold;
    const bought = await call('POST', '/api/cards/pack', { cookie });
    assert.equal(bought.status, 200);
    const ids = bought.data.pack.map((card) => card.id);
    assert.equal(new Set(ids).size, rules.pack.cards);
    assert.ok(ids.every((id) => pool.includes(id)));
    assert.ok(bought.data.pack.every((card) => card.fresh && card.level === 1));
    assert.equal((await row()).gold, before - offer.price);
    assert.deepEqual([bought.data.cards.pack.bought, bought.data.cards.pack.missing], [true, offer.missing - rules.pack.cards]);
    assert.ok(ids.every((id) => bought.data.cards.collection.some((card) => card.id === id)));
    assert.equal((await call('POST', '/api/cards/pack', { cookie })).data.error.code, 'pack_bought');
    // A new day, a new pack, for the gold the character has.
    const game = JSON.parse((await row()).card_game);
    await set('card_game = ?, gold = 1', JSON.stringify({ ...game, day: '2020-01-01' }));
    assert.equal((await tab()).pack.bought, false);
    assert.equal((await call('POST', '/api/cards/pack', { cookie })).data.error.code, 'no_gold');
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

  // The author's 919 B (13.11.2026): a tier's first win whose card would be
  // lost, every card of its rarity being at the top level already, gives
  // the tier's stake once more instead, and says so.
  test('a first win with every card of the tier\'s rarity at the top level gives the stake once more instead of the card', async () => {
    await call('POST', '/api/cards/starter', { cookie });
    const tier = hostTier(1, content);
    const stake = tierStake(tier, 30, content);
    const reward = explorationGold(tier.rewardMinutes, 30);
    const { id } = await row();
    const database = await db();
    const fitting = [...cardHomes(content).keys()].filter((monster) => cardRarity(monster, content) === tier.firstWin.rarity);
    assert.ok(fitting.length > 0);
    for (const monster of fitting) {
      await database
        .prepare('INSERT INTO cards (character_id, monster_id, copies, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (character_id, monster_id) DO UPDATE SET copies = excluded.copies')
        .bind(id, monster, rules.stats.maxLevel, Date.now())
        .run();
    }
    await start(1, true);
    const match = await lastCards(99, 1);
    const won = await turn({ round: match.round, lines: match.me.lines });
    assert.equal(won.status, 200, JSON.stringify(won.data));
    assert.equal(won.data.end.result, 'won');
    assert.equal(won.data.end.card, null);
    assert.equal(won.data.end.cardGold, stake);
    assert.equal((await row()).gold, 100000 - stake + 2 * stake + reward + stake);
    // The tier counts as beaten: the next win there is a plain one.
    assert.equal(won.data.cards.tiers[0].beaten, true);
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

describe('Talia Systemu: the cards of the professions, the Gildia and the Labirynt (903)', () => {
  const { call, db, signUp } = useServer({ CARDS: 'on', PROFESSIONS: 'on', LABYRINTH: 'on' });
  let cookie;
  let id;
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  const copies = async () => (await first('SELECT COALESCE(SUM(copies), 0) AS n FROM cards')).n;
  // The first seed `prefix:N` whose roll comes (or not) with `chance`, as
  // the server draws a card from it (cards.js, sourceCards: the first draw
  // of the seed `seedOf(it)` against the chance).
  function seedWhere(prefix, chance, comes, seedOf = (seed) => seed) {
    for (let index = 0; index < 100000; index += 1) {
      const seed = `${prefix}:${index}`;
      if (cardComes(createRng(seedOf(seed)), chance) === comes) return seed;
    }
    throw new Error('no such seed');
  }

  beforeEach(async () => {
    ({ cookie } = await signUp('zbieracz'));
    await call('POST', '/api/character', { cookie, body: { name: 'Zbieracz', classId: 'warrior', appearance: 'female' } });
    await run("UPDATE characters SET level = 40, class_level = 45, gold = 100000 WHERE name = 'Zbieracz'");
    id = (await first("SELECT id FROM characters WHERE name = 'Zbieracz'")).id;
  });

  // A gathering of an hour with the seed `seed` (its card is drawn from
  // `${seed}:cards`), claimed once its time has passed.
  async function gathered(seed) {
    const started = await call('POST', '/api/professions/gather', { cookie, body: { herbs: ['comfrey'], minutes: 60 } });
    assert.equal(started.status, 201, JSON.stringify(started.data));
    await run('UPDATE activities SET seed = ?, started_at = started_at - 86400000, ends_at = ?', seed, Date.now() - 1);
    const claimed = await call('POST', '/api/hunts/claim', { cookie });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
    return claimed.data.report;
  }

  test('a profession\'s work may leave a card by the hours it lasted, from its own seed: one not got yet, of the lands up to the higher of the levels, in the report, the Dziennik and the collection', async () => {
    const chance = workCardChance(60, content);
    const ofWork = (seed) => `${seed}:cards`;
    const plain = await gathered(seedWhere('praca', chance, false, ofWork));
    assert.equal(plain.kind, 'herbs');
    assert.equal(plain.cards, undefined);
    assert.equal(await copies(), 0);
    // Every card of the lands up to the class's level (45) but one: that one comes.
    const pool = cardsUpTo(45, content);
    const missing = pool.at(-1);
    const owned = pool.filter((card) => card !== missing);
    await run(`INSERT INTO cards (character_id, monster_id, copies, created_at) VALUES ${owned.map(() => '(?, ?, 1, 0)').join(', ')}`, ...owned.flatMap((card) => [id, card]));
    const report = await gathered(seedWhere('praca', chance, true, ofWork));
    assert.equal(report.cards.length, 1);
    const [card] = report.cards;
    assert.deepEqual([card.id, card.fresh, card.level], [missing, true, 1]);
    assert.equal((await first('SELECT copies FROM cards WHERE monster_id = ?', missing)).copies, 1);
    const journal = await first("SELECT summary, data FROM reports WHERE kind = 'herbs' ORDER BY id DESC LIMIT 1");
    assert.deepEqual(JSON.parse(journal.summary).cards.map((one) => one.name), [card.name]);
    assert.equal(JSON.parse(journal.data).cards[0].id, missing);
  });

  test('a Próba finished leaves a card once, at the next look at the Próby or at what waits in the Gildia; an attack on the Bestia may leave one', async () => {
    const founded = await call('POST', '/api/guild/found', { cookie, body: { name: 'Karciane Bractwo', tag: 'KB' } });
    assert.equal(founded.status, 200, JSON.stringify(founded.data));
    const guildId = (await call('GET', '/api/guild', { cookie })).data.guild.id;
    const week = questPeriod('weekly', Date.now(), content).key;
    // A trial finished by hand, its id one whose roll comes or not (a
    // Próba's card is drawn from `${character}:trial:${trial}:cards`).
    const trialWhere = (comes, from) => {
      for (let trial = from; ; trial += 1) if (cardComes(createRng(`${id}:trial:${trial}:cards`), content.cards.drops.guild) === comes) return trial;
    };
    const finished = (trial, index) =>
      run("INSERT INTO guild_trials (id, guild_id, week, character_id, trial, kind, count, progress, state, taken_at, done_at) VALUES (?, ?, ?, ?, ?, 'explore', 1, 1, 'done', 0, 0)", trial, guildId, week, id, index);
    const miss = trialWhere(false, 5000);
    const hit = trialWhere(true, 6000);
    await finished(miss, 90);
    await finished(hit, 91);
    const seen = await call('GET', '/api/guild/trials', { cookie });
    assert.equal(seen.status, 200, JSON.stringify(seen.data));
    assert.equal(seen.data.cards.length, 1);
    const [card] = seen.data.cards;
    assert.equal(card.text, `Za ukończoną Próbę Gildii wpadła karta: ${card.name}.`);
    assert.ok(cardsUpTo(45, content).includes(card.id));
    assert.equal(await copies(), 1);
    const kept = async () => JSON.parse((await first('SELECT card_game FROM characters WHERE id = ?', id)).card_game).trials;
    assert.deepEqual(await kept(), [hit]);
    // Once: the next looks give nothing.
    assert.equal((await call('GET', '/api/guild/trials', { cookie })).data.cards, undefined);
    assert.equal((await call('GET', '/api/guild/todo', { cookie })).data.cards, undefined);
    assert.equal(await copies(), 1);
    // Another one comes with what waits in the Gildia.
    const next = trialWhere(true, hit + 1);
    await finished(next, 92);
    const todo = await call('GET', '/api/guild/todo', { cookie });
    assert.equal(todo.data.cards.length, 1);
    assert.equal(await copies(), 2);
    assert.deepEqual((await kept()).sort(), [hit, next].sort());
    // An attack on the Bestia answers with the card it left, if any.
    const attack = await call('POST', '/api/guild/beast/attack', { cookie });
    assert.equal(attack.status, 200, JSON.stringify(attack.data));
    assert.equal(await copies(), 2 + (attack.data.cards?.length ?? 0));
  });

  test('the creatures beaten in a room of the Labirynt leave their cards, from the day\'s seed and the room: in the room\'s lines, its report and the collection', async () => {
    await makeClimber(await db(), id);
    const day = labyrinthDay(Date.now(), content);
    const charLevel = 60;
    const foes = labyrinthFoes({ day, level: 1, row: 0, room: 0, type: 'fight', charLevel }, content).encounter.members.map((member) => member.monsterId);
    // A seed of the day whose first draw for the room gives the first
    // creature's card (labyrinth.js: one draw a creature, from
    // `${seed}:${level}:${row}:${room}:cards`).
    const seed = seedWhere('dzien', content.cards.drops[cardKind(foes[0], content)], true, (one) => `${one}:1:0:0:cards`);
    await run('UPDATE characters SET labyrinth = ? WHERE id = ?', JSON.stringify(newLabyrinth({ day, charLevel, companions: [], seed })), id);
    const entered = await call('POST', '/api/labyrinth/room', { cookie, body: { level: 1, row: 0, room: 0 } });
    assert.equal(entered.status, 200, JSON.stringify(entered.data));
    assert.equal(entered.data.room.won, true);
    const card = entered.data.report.cards.find((one) => one.id === foes[0]);
    assert.ok(card, JSON.stringify(entered.data.report.cards));
    assert.equal(card.fresh, true);
    assert.ok(entered.data.room.lines.some((line) => line.includes(`karta: ${card.name}.`)));
    assert.equal((await first('SELECT copies FROM cards WHERE monster_id = ?', foes[0])).copies, 1);
    assert.equal(await copies(), entered.data.report.cards.length);
  });
});

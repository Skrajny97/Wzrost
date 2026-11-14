// The Arena's Karty (src/engine/card-arena.js, src/server/card-arena.js; the
// author's 900 A): in the engine, the card rating moved as in chess with the
// defender's by less, five matches a day, the rivals drawn and drawn anew,
// a deck's strength, the season, the week's rewards at half of the duels',
// and the rival the server plays: its cards laid first, openly, and its
// hero card's skill, once a match, against the player's cards standing on
// the table. Through the API: the tab with the Arena from its level, the
// rivals (other accounts' characters with a deck), a match against the
// rival's saved deck and hero, five a day and one at a time, both ratings
// moved by the stakes fixed at the start, the defender's notice new once,
// a match ended after its week froze refused, "Losuj innych", the week's
// table frozen once with its reward claimed once, the season, a rival
// removed mid-match, and nothing of it where the cards are off.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  arenaDay,
  arenaReward,
  arenaRewardTiers,
  arenaSeason,
  arenaWeek,
  cardArenaOutcome,
  cardArenaReward,
  cardArenaRewardTiers,
  cardBlow,
  cardExpectedScore,
  cardLevel,
  cardMatchesLeft,
  cardRatingChanges,
  cardRatingStakes,
  cardRerollsLeft,
  cardSeasonRating,
  cardStats,
  cardType,
  deckStrength,
  deckTypeCounts,
  drawCardRivals,
  heroSkill,
  hostTier,
  matchView,
  newMatch,
  playTurn,
  roundHits,
  starterDeck,
} from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rules = content.settlement.arena.cards;
const DAY = 24 * 60 * 60 * 1000;
const starter = () => starterDeck(content).map((id) => ({ id, level: 1 }));

// A match laid out by hand, as test/cards.test.js lays one: each side's
// cards ({ id, level, life, attack }), its lines as keys of them and its
// reserve, nothing in the decks; the rival with a hero of `foeHero`.
function laidOut({ me, foe, meLines, foeLines, meHand = [], foeHand = [], foeHero = null, round = 1 }) {
  const side = (cards, lines, hand) => {
    const built = cards.map((card, key) => {
      const stats = cardStats(card.id, card.level ?? 1, content);
      const life = card.life ?? stats.life;
      return { key, id: card.id, level: card.level ?? 1, type: cardType(card.id, content), attack: card.attack ?? stats.attack, life, max: Math.max(life, stats.life) };
    });
    return { cards: built, deck: [], hand, lines, out: [], hero: null, smart: 2 };
  };
  const match = { v: 1, seed: 'arena', round, me: side(me, meLines, meHand), foe: side(foe, foeLines, foeHand), last: null, result: null, end: null };
  if (foeHero) match.foe.hero = { ...foeHero, used: false };
  return match;
}
// The player's turn with its cards where they stand, no skill.
const standing = (match) => ({ round: match.round, lines: [...match.me.lines], skill: null });

describe('the Karty of the Arena: the rules', () => {
  test('the card rating starts at 1000 and moves as in chess, the defender\'s by less, never below the floor', () => {
    const { start, attackK, defenceK, floor } = rules.rating;
    assert.equal(start, 1000);
    assert.equal(cardExpectedScore(1000, 1000, content), 0.5);
    assert.deepEqual(cardRatingChanges(1000, 1000, 'win', content), { attacker: attackK / 2, defender: -defenceK / 2 });
    assert.deepEqual(cardRatingChanges(1000, 1000, 'loss', content), { attacker: -attackK / 2, defender: defenceK / 2 });
    assert.deepEqual(cardRatingChanges(1000, 1000, 'draw', content), { attacker: 0, defender: 0 });
    // A win against a stronger rival brings more, a loss to it costs less.
    const up = cardRatingChanges(1064, 1102, 'win', content);
    const down = cardRatingChanges(1064, 1102, 'loss', content);
    assert.ok(up.attacker > attackK / 2 && -down.attacker < attackK / 2);
    assert.ok(Math.abs(up.defender) < Math.abs(up.attacker));
    // Never below the floor.
    assert.equal(cardRatingChanges(floor, floor, 'loss', content).attacker, 0);
    assert.equal(cardRatingChanges(floor + 3, floor + 3, 'loss', content).attacker, -3);
    // The stakes of a match: each result, for both sides.
    const stakes = cardRatingStakes(1064, 1102, content);
    assert.deepEqual(stakes.attacker, { win: up.attacker, loss: down.attacker, draw: cardRatingChanges(1064, 1102, 'draw', content).attacker });
    assert.deepEqual(stakes.defender, { win: up.defender, loss: down.defender, draw: cardRatingChanges(1064, 1102, 'draw', content).defender });
    assert.deepEqual(['won', 'lost', 'drawn', null].map(cardArenaOutcome), ['win', 'loss', 'draw', null]);
  });

  test('five matches a day, counted at their start, back at Polish midnight; a later day leaves none', () => {
    const now = Date.UTC(2026, 10, 13, 12);
    const today = arenaDay(now, content).key;
    assert.equal(rules.matchesPerDay, 5);
    assert.equal(cardMatchesLeft(null, now, content), 5);
    assert.equal(cardMatchesLeft({ day: today, matches: 3 }, now, content), 2);
    assert.equal(cardMatchesLeft({ day: today, matches: 5 }, now, content), 0);
    assert.equal(cardMatchesLeft({ day: today, matches: 5 }, arenaDay(now, content).endsAt + 1, content), 5);
    assert.equal(cardMatchesLeft({ day: arenaDay(now + DAY, content).key, matches: 1 }, now, content), 0);
    assert.equal(cardRerollsLeft({ reroll_day: today, rerolls: 4 }, now, content), rules.rivals.rerollsPerDay - 4);
    assert.equal(cardRerollsLeft({ reroll_day: today, rerolls: 4, day: today, matches: 5 }, now, content), 1);
  });

  test('three rivals of the nearest, the one just played only to fill a place no other is left for', () => {
    const candidates = Array.from({ length: 6 }, (_, index) => ({ id: index + 1, rating: 1000 + index * 10 }));
    const drawn = drawCardRivals(candidates, 'seed', content);
    assert.equal(drawn.length, rules.rivals.count);
    assert.deepEqual(drawn, [...drawn].sort((a, b) => b.rating - a.rating));
    assert.deepEqual(drawCardRivals(candidates, 'seed', content), drawn);
    for (let seed = 0; seed < 20; seed += 1) assert.ok(!drawCardRivals(candidates, seed, content, [1, 2, 3]).some((one) => [1, 2, 3].includes(one.id)));
    assert.deepEqual(drawCardRivals(candidates.slice(0, 2), 'seed', content, [1]).map((one) => one.id).sort(), [1, 2]);
  });

  test("a deck's strength is the Atak and Życie of its twelve cards at their levels", () => {
    const deck = starter();
    const sum = deck.reduce((total, card) => total + cardStats(card.id, 1, content).attack + cardStats(card.id, 1, content).life, 0);
    assert.equal(deckStrength(deck, content), sum);
    assert.ok(deckStrength(deck.map((card) => ({ ...card, level: 3 })), content) > sum);
    assert.deepEqual(
      deckTypeCounts(deck, content).map((type) => [type.id, type.count]),
      [['strength', 4], ['dexterity', 4], ['intellect', 4]],
    );
  });

  test("the week's card rewards are half of the duels', Punkty Systemu rounded half up", () => {
    // The author's example (900 A): at level 64, 4 140 zł and 15 PS for the first place.
    assert.deepEqual(cardArenaReward(1, 64, content), { systemPoints: 15, gold: 4140 });
    assert.deepEqual(
      cardArenaRewardTiers(64, content).map((tier) => [tier.from, tier.to, tier.gold, tier.systemPoints]),
      [[1, 1, 4140, 15], [2, 2, 3450, 13], [3, 3, 2760, 10], [4, 10, 2070, 8], [11, 25, 1380, 5], [26, 50, 828, 3], [51, null, 414, 2]],
    );
    for (const place of [1, 2, 3, 7, 20, 40, 90]) {
      const duel = arenaReward(place, 77, content);
      assert.deepEqual(cardArenaReward(place, 77, content), { systemPoints: Math.round(duel.systemPoints / 2), gold: Math.round(duel.gold / 2) });
    }
    assert.equal(cardArenaRewardTiers(30, content).length, arenaRewardTiers(30, content).length);
  });

  test('a new season moves each card rating halfway back to the start', () => {
    assert.equal(cardSeasonRating(1400, 1, content), 1200);
    assert.equal(cardSeasonRating(600, 2, content), 900);
    assert.equal(cardSeasonRating(1000, 3, content), 1000);
  });
});

describe('the Karty of the Arena: the rival the server plays (900 A)', () => {
  test("the defending deck's cards have defenceBonus more Atak and Życie, rounded (915 B); the attacker's keep theirs", () => {
    assert.ok(rules.defenceBonus > 0 && rules.defenceBonus < 0.5);
    const cards = starter();
    const match = newMatch({ seed: 'boost', me: { cards }, foe: { cards, smart: rules.smart, boost: rules.defenceBonus } }, content);
    const raised = (value) => Math.round(value * (1 + rules.defenceBonus));
    for (const card of match.foe.cards) {
      const base = cardStats(card.id, card.level, content);
      assert.deepEqual([card.attack, card.life, card.max], [raised(base.attack), raised(base.life), raised(base.life)]);
    }
    for (const card of match.me.cards) {
      const base = cardStats(card.id, card.level, content);
      assert.deepEqual([card.attack, card.life, card.max], [base.attack, base.life, base.life]);
    }
    // The page sees the raised numbers on the rival's cards.
    const shown = matchView(match, content).foe.lines.filter(Boolean);
    assert.ok(shown.length > 0 && shown.every((card) => card.attack === raised(cardStats(card.id, card.level, content).attack)));
  });

  test('a rival with its hero lays its cards first, openly, and in the first round uses no skill', () => {
    const match = newMatch({ seed: 'rival', me: { cards: starter(), hero: { classId: 'warrior', stage: 0 } }, foe: { cards: hostTier(3, content).cards.map((card) => ({ id: card.monster, level: card.level })), hero: { classId: 'mage', stage: 1 }, smart: rules.smart } }, content);
    assert.ok(match.foe.lines.every((key) => key !== null));
    assert.deepEqual(match.last.placed, [0, 1, 2]);
    assert.equal(match.foe.plan, undefined);
    const view = matchView(match, content);
    assert.equal(view.foe.hero.skill.name, heroSkill('mage', 1, content).name);
    assert.equal(view.foe.hero.used, false);
    assert.equal(typeof view.foe.hand, 'number');
    assert.ok(!JSON.stringify(view).includes('"seed"'));
  });

  test("Szarża: on the rival's card whose blow it makes beat the card it faces, once a match", () => {
    // The rival's badger faces the player's wolf, which will have 12 Życie
    // left: its plain blow of 10 does not beat it, Szarża's 15 does.
    const match = laidOut({ me: [{ id: 'wolf', life: 22 }], foe: [{ id: 'badger', attack: 10, life: 500 }], meLines: [0, null, null], foeLines: [0, null, null], foeHero: { classId: 'warrior', stage: 0 } });
    const next = playTurn(match, standing(match), content);
    assert.equal(next.me.cards[0].life, 12);
    assert.deepEqual(next.foe.plan, { kind: 'fury', card: 0 });
    assert.equal(next.foe.hero.used, true);
    assert.deepEqual(matchView(next, content).foe.plan, { kind: 'fury', card: 0 });
    // The blow the player sees before answering, and the round: the wolf is beaten.
    const hit = roundHits(next, content).find((one) => one.side === 'foe');
    assert.deepEqual([hit.damage, hit.boosted], [15, true]);
    const after = playTurn(next, standing(next), content);
    assert.deepEqual(after.last.beaten.me, [0]);
    assert.deepEqual(after.last.rivalSkill, { kind: 'fury', card: 0 });
    assert.equal(after.foe.plan, undefined);
  });

  test('the skill waits for a round where it does something, and comes once a match', () => {
    // A wolf with Życie to spare: Szarża would not beat it yet.
    const match = laidOut({ me: [{ id: 'wolf', life: 200 }], foe: [{ id: 'badger', attack: 10, life: 500 }], meLines: [0, null, null], foeLines: [0, null, null], foeHero: { classId: 'warrior', stage: 0 } });
    let next = playTurn(match, standing(match), content);
    assert.equal(next.foe.plan, undefined);
    assert.equal(next.foe.hero.used, false);
    // Once the wolf is low enough (15 Życie after the round), it comes.
    next.me.cards[0].life = 25;
    next = playTurn(next, standing(next), content);
    assert.equal(next.foe.plan?.kind, 'fury');
    // After it never again, though the wolf is as low again (12 Życie).
    next.me.cards[0].life = 27;
    next = playTurn(next, standing(next), content);
    assert.deepEqual([next.me.cards[0].life, next.result], [12, null]);
    assert.equal(next.foe.plan, undefined);
    assert.equal(next.foe.hero.used, true);
  });

  test("Celny strzał: the rival's card hits another of the player's cards it beats", () => {
    // The badger faces the wolf; the squirrel beside it is left with 5 Życie.
    const match = laidOut({ me: [{ id: 'wolf', life: 500 }, { id: 'squirrel', life: 5 + 0 }], foe: [{ id: 'badger', attack: 10, life: 500 }], meLines: [0, 1, null], foeLines: [0, null, null], foeHero: { classId: 'archer', stage: 0 } });
    // The squirrel faces no card: it hits the badger, and nothing hits it.
    const next = playTurn(match, standing(match), content);
    assert.deepEqual(next.foe.plan, { kind: 'aim', card: 0, target: 1 });
    const hit = roundHits(next, content).find((one) => one.side === 'foe');
    assert.equal(hit.target.line, 1);
    assert.equal(hit.damage, cardBlow(next.foe.cards[0], next.me.cards[1], 0, content));
    const after = playTurn(next, standing(next), content);
    assert.deepEqual(after.last.beaten.me, [1]);
  });

  test("Przemiana: the rival's card takes the type that beats the card it faces, before the player answers", () => {
    // Phantasm (Magia) against a squirrel (Zręczność), which beats Magia.
    const match = laidOut({ me: [{ id: 'squirrel', life: 500 }], foe: [{ id: 'phantasm', life: 500 }], meLines: [0, null, null], foeLines: [0, null, null], foeHero: { classId: 'mage', stage: 0 } });
    const next = playTurn(match, standing(match), content);
    assert.deepEqual(next.foe.plan, { kind: 'shift', card: 0, type: 'strength' });
    assert.equal(next.foe.cards[0].type, 'strength');
    assert.equal(matchView(next, content).foe.lines[0].shifted, true);
    const hit = roundHits(next, content).find((one) => one.side === 'foe');
    assert.deepEqual([hit.advantage, hit.boosted], [true, false]);
  });

  test("Wskrzeszenie: the rival's card the player's would beat comes back with its share of Życie", () => {
    const wolf = cardStats('wolf', 1, content).attack;
    const match = laidOut({ me: [{ id: 'wolf', life: 500 }], foe: [{ id: 'badger', life: wolf * 2 - 1 }], meLines: [0, null, null], foeLines: [0, null, null], foeHero: { classId: 'cleric', stage: 0 } });
    const next = playTurn(match, standing(match), content);
    assert.deepEqual(next.foe.plan, { kind: 'revive', card: 0 });
    const after = playTurn(next, standing(next), content);
    assert.deepEqual(after.last.beaten.foe, []);
    assert.equal(after.last.rivalRevived, 0);
    assert.equal(after.foe.lines[0], 0);
    assert.equal(after.foe.cards[0].life, Math.round(after.foe.cards[0].max * heroSkill('cleric', 0, content).power));
  });

  test("Podmiana: the rival takes back the card the player's would beat, a card of its reserve in its place", () => {
    const wolf = cardStats('wolf', 1, content).attack;
    const match = laidOut({
      me: [{ id: 'wolf', life: 900 }],
      foe: [{ id: 'badger', life: wolf * 2 - 1 }, { id: 'viper', life: 500 }, { id: 'phantasm', life: 500 }, { id: 'fox' }],
      meLines: [0, null, null],
      foeLines: [0, 1, 2],
      foeHand: [3],
      foeHero: { classId: 'shadow', stage: 1 },
    });
    const next = playTurn(match, standing(match), content);
    assert.deepEqual(next.foe.plan, { kind: 'swap', card: 0, swap: 3 });
    assert.equal(next.foe.lines[0], 3);
    assert.deepEqual(next.foe.hand, [0]);
    assert.deepEqual(next.last.placed, [0]);
    // From the first evolution on, the card laid hits harder this round.
    const hit = roundHits(next, content).find((one) => one.side === 'foe' && one.key === 3);
    assert.equal(hit.boosted, true);
    assert.equal(hit.damage, cardBlow(next.foe.cards[3], next.me.cards[0], heroSkill('shadow', 1, content).power, content));
  });

  test("Szczęsny, who has no hero, plays as before", () => {
    const match = newMatch({ seed: 'host', me: { cards: starter() }, foe: { cards: hostTier(5, content).cards.map((card) => ({ id: card.monster, level: card.level })), smart: 2 } }, content);
    let next = match;
    for (let round = 0; round < 6 && !next.result; round += 1) {
      const lines = [...next.me.lines];
      const hand = [...next.me.hand];
      for (let line = 0; line < 3; line += 1) if (lines[line] === null && hand.length > 0) lines[line] = hand.shift();
      next = playTurn(next, { round: next.round, lines, skill: null }, content);
      assert.equal(next.foe.plan, undefined);
      assert.equal('rivalSkill' in next.last, false);
    }
  });
});

describe('the Karty of the Arena where the cards are off', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on', ARENA: 'on' });

  test('nothing of them answers, and the Arena has no tab of cards', async () => {
    const { cookie } = await signUp('kartyoff');
    await call('POST', '/api/character', { cookie, body: { name: 'Bez Kart', classId: 'warrior', appearance: 'male' } });
    await (await db()).prepare('UPDATE characters SET level = 40, class_level = 40, tutorial = NULL').run();
    for (const [method, path] of [['GET', '/api/cards/arena'], ['POST', '/api/cards/arena/match'], ['POST', '/api/cards/arena/turn'], ['POST', '/api/cards/arena/claim']]) {
      assert.equal((await call(method, path, { cookie, body: method === 'POST' ? {} : undefined })).status, 404, path);
    }
    const arena = (await call('GET', '/api/settlement/arena', { cookie })).data.arena;
    assert.equal(arena.cards, null);
  });
});

describe('the Karty of the Arena through the API', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on', ARENA: 'on', CARDS: 'on' });
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  let ala;
  let bolek;

  // A player with a character of `classId` at `level`, with Szczęsny's
  // starter deck taken (its deck laid) unless `deck` is false.
  async function player(login, name, classId, level, { deck = true, appearance = 'female' } = {}) {
    const { cookie } = await signUp(login);
    await call('POST', '/api/character', { cookie, body: { name, classId, appearance } });
    await run('UPDATE characters SET level = ?, class_level = ?, tutorial = NULL WHERE name = ?', level, level, name);
    if (deck) assert.equal((await call('POST', '/api/cards/starter', { cookie })).status, 200);
    const { id } = await first('SELECT id FROM characters WHERE name = ?', name);
    return { cookie, id };
  }
  const look = async (who) => (await call('GET', '/api/cards/arena', { cookie: who.cookie })).data.arena;
  const play = (who, rivalId) => call('POST', '/api/cards/arena/match', { cookie: who.cookie, body: { rivalId } });
  const surrender = (who) => call('POST', '/api/cards/arena/surrender', { cookie: who.cookie });
  const turn = (who, body) => call('POST', '/api/cards/arena/turn', { cookie: who.cookie, body });
  const reroll = (who) => call('POST', '/api/cards/arena/reroll', { cookie: who.cookie });
  const ratingOf = async (who) => (await first('SELECT rating FROM card_arena_ratings WHERE character_id = ?', who.id))?.rating;
  const stateOf = async (who) => JSON.parse((await first('SELECT state FROM card_arena_matches WHERE character_id = ?', who.id)).state);
  const setState = (who, state) => run('UPDATE card_arena_matches SET state = ? WHERE character_id = ?', JSON.stringify(state), who.id);
  // The running match left with one card of each side on the front line, the
  // player's with `mine` Życie and the rival's with `theirs`, nothing else.
  async function lastCards(who, mine, theirs) {
    const match = await stateOf(who);
    for (const [side, life] of [[match.me, mine], [match.foe, theirs]]) {
      const key = side.cards[0].key;
      side.lines = [key, null, null];
      side.hand = [];
      side.deck = [];
      side.out = side.cards.map((card) => card.key).filter((one) => one !== key);
      side.cards[0].life = life;
    }
    match.foe.cards[0].attack = 1;
    match.foe.hero = null;
    delete match.foe.plan;
    match.me.cards[0].attack = Math.max(match.me.cards[0].attack, 1);
    await setState(who, match);
    return match;
  }

  beforeEach(async () => {
    ala = await player('kartyala', 'Ala', 'warrior', 30);
    bolek = await player('kartybolek', 'Bolek', 'mage', 30, { appearance: 'male' });
  });

  test('the tab comes with the Arena, from its level: a card rating of its own from 1000, five matches a day', async () => {
    await run('UPDATE characters SET level = 24 WHERE id = ?', ala.id);
    const locked = await call('GET', '/api/cards/arena', { cookie: ala.cookie });
    assert.deepEqual([locked.status, locked.data.error.code], [403, 'locked']);
    await run('UPDATE characters SET level = 25 WHERE id = ?', ala.id);
    const open = await call('GET', '/api/cards/arena', { cookie: ala.cookie });
    assert.equal(open.status, 200, JSON.stringify(open.data).slice(0, 300));
    const view = open.data.arena;
    assert.equal(view.rating, 1000);
    assert.deepEqual([view.matches.left, view.matches.perDay], [5, 5]);
    assert.equal(view.deck.strength, deckStrength(starter(), content));
    assert.deepEqual(view.deck.types.map((type) => type.count), [4, 4, 4]);
    // The saved decks (938): the starter deck the first, in play, with the
    // same strength.
    assert.deepEqual([view.decks.active, view.decks.slots[0].strength, view.decks.slots[1].cards], [1, view.deck.strength, null]);
    assert.equal(view.hero.skill.name, heroSkill('warrior', 0, content).name);
    assert.equal(view.match, null);
    assert.ok(view.texts.intro && view.texts.rules.length >= 4);
    assert.deepEqual(view.rewards.tiers, cardArenaRewardTiers(25, content));
    // The duels' look names the tab, and the card rating is not the duels'.
    const duels = (await call('GET', '/api/settlement/arena', { cookie: ala.cookie })).data.arena;
    assert.deepEqual(duels.cards, { due: 0, texts: { tab: rules.texts.tab, duels: rules.texts.boardDuels, cards: rules.texts.boardCards } });
    assert.equal(await first('SELECT rating FROM arena_ratings WHERE character_id = ? AND rating <> 1000', ala.id), null);
  });

  test("rivals are other accounts' characters at the Arena's level with a deck, each with its deck's strength and stakes", async () => {
    await call('POST', '/api/character', { cookie: ala.cookie, body: { name: 'Alicja', classId: 'archer', appearance: 'female' } });
    await run("UPDATE characters SET level = 30, class_level = 30, tutorial = NULL WHERE name = 'Alicja'");
    await call('POST', '/api/cards/starter', { cookie: ala.cookie });
    await player('kartycezary', 'Cezary', 'archer', 30, { deck: false });
    // Darek's deck taken at the Salon's level, then below the Arena's.
    await player('kartydarek', 'Darek', 'archer', 30);
    await run("UPDATE characters SET level = 10, class_level = 10 WHERE name = 'Darek'");
    const alicja = await first("SELECT id FROM characters WHERE name = 'Alicja'");
    const view = await look({ ...ala, id: alicja.id });
    assert.deepEqual(view.rivals.map((rival) => rival.name), ['Bolek']);
    const rival = view.rivals[0];
    assert.equal(rival.className, content.classesById.mage.name);
    assert.equal(rival.strength, deckStrength(starter(), content));
    assert.deepEqual(rival.stakes, cardRatingStakes(1000, 1000, content).attacker);
    assert.equal(rival.skill, heroSkill('mage', 0, content).name);
    // Bolek may meet both of Ala's characters, the one aside too.
    assert.deepEqual((await look(bolek)).rivals.map((one) => one.name).sort(), ['Ala', 'Alicja']);
    // One not offered cannot be played.
    const cezary = await first("SELECT id FROM characters WHERE name = 'Cezary'");
    assert.equal((await play(bolek, cezary.id)).data.error.code, 'gone');
  });

  test("a match against the rival's saved deck, at its levels, with its hero: the rival's cards laid first, its state never shown", async () => {
    await run("UPDATE cards SET copies = 3 WHERE character_id = ? AND monster_id = 'wolf'", bolek.id);
    await look(ala);
    const started = await play(ala, bolek.id);
    assert.equal(started.status, 200, JSON.stringify(started.data).slice(0, 300));
    const view = started.data.arena;
    assert.equal(view.matches.left, 4);
    const match = view.match;
    assert.equal(match.rival.name, 'Bolek');
    assert.deepEqual(match.stakes, cardRatingStakes(1000, 1000, content).attacker);
    assert.ok(match.foe.lines.every(Boolean));
    assert.deepEqual(match.last.placed, [0, 1, 2]);
    assert.equal(typeof match.foe.hand, 'number');
    assert.equal(match.foe.hero.skill.name, heroSkill('mage', 0, content).name);
    const state = await stateOf(ala);
    assert.ok(!JSON.stringify(started.data).includes(state.seed));
    assert.deepEqual(state.foe.cards.map((card) => card.id).sort(), [...starterDeck(content)].sort());
    assert.equal(state.foe.cards.find((card) => card.id === 'wolf').level, cardLevel(3, content));
    assert.deepEqual([state.foe.hero.classId, state.foe.hero.stage, state.foe.smart], ['mage', 0, rules.smart]);
    assert.deepEqual([state.me.hero.classId, state.me.cards.length], ['warrior', 12]);
    // The defending deck plays with its bonus (915 B), the player's at its
    // own numbers; the rules say how much.
    const raised = (value) => Math.round(value * (1 + rules.defenceBonus));
    for (const card of state.foe.cards) {
      const base = cardStats(card.id, card.level, content);
      assert.deepEqual([card.attack, card.life, card.max], [raised(base.attack), raised(base.life), raised(base.life)]);
    }
    for (const card of state.me.cards) assert.equal(card.attack, cardStats(card.id, card.level, content).attack);
    assert.equal(view.numbers.defence, Math.round(rules.defenceBonus * 100));
    // One match at a time.
    assert.equal((await play(ala, bolek.id)).data.error.code, 'match_running');
    // A turn: the server lays the rival's next cards; a stale round refused.
    const lines = match.me.lines.map((card) => card?.key ?? null);
    const hand = match.me.hand.map((card) => card.key);
    for (let line = 0; line < 3; line += 1) if (lines[line] === null && hand.length > 0) lines[line] = hand.shift();
    assert.equal((await turn(ala, { round: 7, lines })).data.error.code, 'stale_round');
    const [one, two] = await Promise.all([turn(ala, { round: 1, lines }), turn(ala, { round: 1, lines })]);
    assert.deepEqual([one.status, two.status].sort(), [200, 409]);
    const after = (one.status === 200 ? one : two).data;
    assert.ok(after.end || after.arena.match.round === 2);
  });

  test('two taps on "Graj" start one match, one of the day\'s five; then none until midnight', async () => {
    await look(ala);
    const [one, two] = await Promise.all([play(ala, bolek.id), play(ala, bolek.id)]);
    assert.deepEqual([one.status, two.status].sort(), [200, 409]);
    assert.equal((await first('SELECT matches FROM card_arena_ratings WHERE character_id = ?', ala.id)).matches, 1);
    assert.equal((await first('SELECT COUNT(*) AS n FROM card_arena_matches')).n, 1);
    await surrender(ala);
    const today = arenaDay(Date.now(), content).key;
    await run('UPDATE card_arena_ratings SET day = ?, matches = 5 WHERE character_id = ?', today, ala.id);
    const view = await look(ala);
    assert.equal(view.matches.left, 0);
    const refused = await play(ala, view.rivals[0].id);
    assert.deepEqual([refused.status, refused.data.error.code], [409, 'used']);
    // A new day.
    await run("UPDATE card_arena_ratings SET day = '2020-01-01' WHERE character_id = ?", ala.id);
    assert.equal((await look(ala)).matches.left, 5);
  });

  test('a match ended moves both ratings by its stakes, the defender\'s by less, and the defender sees it, new once', async () => {
    await look(ala);
    await play(ala, bolek.id);
    const { attackK, defenceK } = rules.rating;
    // Given up: lost.
    const given = await surrender(ala);
    assert.equal(given.status, 200, JSON.stringify(given.data).slice(0, 300));
    assert.equal(given.data.end.result, 'lost');
    assert.deepEqual([given.data.end.before, given.data.end.after, given.data.end.change], [1000, 1000 - attackK / 2, -attackK / 2]);
    assert.equal(given.data.end.rival.name, 'Bolek');
    assert.equal(await ratingOf(ala), 1000 - attackK / 2);
    assert.equal(await ratingOf(bolek), 1000 + defenceK / 2);
    const view = given.data.arena;
    assert.equal(view.match, null);
    assert.equal(view.place, 1);
    assert.deepEqual(view.table.rows.map((row) => row.name), ['Ala']);
    // Bolek's next look tells him, from his deck's side, as new; the one after, no longer new.
    const seen = (await look(bolek)).defences;
    assert.equal(seen.length, 1);
    assert.deepEqual([seen[0].name, seen[0].result, seen[0].change, seen[0].female, seen[0].unseen], ['Ala', 'win', defenceK / 2, true, true]);
    assert.deepEqual((await look(bolek)).defences, [{ ...seen[0], unseen: false }]);
    // A win: Ala's last card beats Bolek's last.
    await run("UPDATE card_arena_ratings SET day = '2020-01-01' WHERE character_id = ?", ala.id);
    const rivals = (await look(ala)).rivals;
    assert.equal((await play(ala, rivals[0].id)).status, 200);
    const stakes = cardRatingStakes(1000 - attackK / 2, 1000 + defenceK / 2, content);
    const match = await lastCards(ala, 99, 1);
    const won = await turn(ala, { round: match.round, lines: match.me.lines });
    assert.equal(won.status, 200, JSON.stringify(won.data).slice(0, 300));
    assert.equal(won.data.end.result, 'won');
    assert.equal(won.data.end.change, stakes.attacker.win);
    assert.equal(await ratingOf(bolek), 1000 + defenceK / 2 + stakes.defender.win);
    const kept = await first('SELECT * FROM card_arena_results ORDER BY id DESC LIMIT 1');
    assert.deepEqual([kept.result, kept.attacker_rating, kept.defender_rating], ['win', await ratingOf(ala), await ratingOf(bolek)]);
  });

  test('a match ended after its week froze is refused, and ended again it counts in the new week', async () => {
    await look(ala);
    await play(ala, bolek.id);
    await run('INSERT INTO card_arena_weeks (character_id, week, place, rating) VALUES (?, ?, 1, 1000)', bolek.id, arenaWeek(Date.now(), content).key);
    const refused = await surrender(ala);
    assert.deepEqual([refused.status, refused.data.error.code], [409, 'arena_changed']);
    assert.equal(await ratingOf(ala), 1000);
    assert.equal((await first('SELECT COUNT(*) AS n FROM card_arena_matches')).n, 1);
    await run('DELETE FROM card_arena_weeks');
    assert.equal((await surrender(ala)).status, 200);
    assert.equal((await first('SELECT week FROM card_arena_ratings WHERE character_id = ?', ala.id)).week, arenaWeek(Date.now(), content).key);
  });

  test('"Losuj innych": other rivals of the pool five times a day, without a match; none new, refused and not counted', async () => {
    await look(ala);
    assert.deepEqual((await reroll(ala)).data.error.code, 'no_others');
    assert.equal((await first('SELECT rerolls FROM card_arena_ratings WHERE character_id = ?', ala.id)).rerolls, 0);
    for (const name of ['Cezary', 'Darek', 'Ewa', 'Franek']) await player(`karty${name.toLowerCase()}`, name, 'archer', 30);
    await run("UPDATE card_arena_ratings SET rivals = '[]' WHERE character_id = ?", ala.id);
    const before = (await look(ala)).rivals.map((rival) => rival.id);
    assert.equal(before.length, 3);
    const drawn = await reroll(ala);
    assert.equal(drawn.status, 200, JSON.stringify(drawn.data).slice(0, 300));
    const after = drawn.data.arena.rivals.map((rival) => rival.id);
    assert.ok(after.some((id) => !before.includes(id)));
    assert.equal(drawn.data.arena.rerolls.left, rules.rivals.rerollsPerDay - 1);
    assert.equal(drawn.data.arena.matches.left, 5);
    const today = arenaDay(Date.now(), content).key;
    await run('UPDATE card_arena_ratings SET reroll_day = ?, rerolls = ? WHERE character_id = ?', today, rules.rivals.rerollsPerDay, ala.id);
    assert.equal((await reroll(ala)).data.error.code, 'no_rerolls');
  });

  test("the week's card table is frozen once, by card rating, and its reward, half of the duels', claimed once", async () => {
    await look(ala);
    await look(bolek);
    const last = arenaWeek(Date.now() - 7 * DAY, content).key;
    await run('UPDATE card_arena_ratings SET week = ?, rating = 1100 WHERE character_id = ?', last, ala.id);
    await run('UPDATE card_arena_ratings SET week = ?, rating = 1200 WHERE character_id = ?', last, bolek.id);
    const duels = (await call('GET', '/api/settlement/arena', { cookie: ala.cookie })).data.arena;
    assert.equal(duels.cards.due, 1);
    const view = await look(ala);
    assert.deepEqual(view.rewards.due, [{ week: last, place: 2, ...cardArenaReward(2, 30, content) }]);
    assert.deepEqual(cardArenaReward(2, 30, content), { systemPoints: Math.round(arenaReward(2, 30, content).systemPoints / 2), gold: arenaReward(2, 30, content).gold / 2 });
    // Frozen once: a later change moves nothing of it.
    await run('UPDATE card_arena_ratings SET rating = 1500 WHERE character_id = ?', ala.id);
    await look(bolek);
    assert.equal((await first('SELECT place FROM card_arena_weeks WHERE character_id = ? AND week = ?', ala.id, last)).place, 2);
    const before = await first('SELECT gold, system_points FROM characters WHERE id = ?', ala.id);
    const claimed = await call('POST', '/api/cards/arena/claim', { cookie: ala.cookie, body: { week: last } });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
    const reward = cardArenaReward(2, 30, content);
    const after = await first('SELECT gold, system_points FROM characters WHERE id = ?', ala.id);
    assert.deepEqual([after.gold - before.gold, after.system_points - before.system_points], [reward.gold, reward.systemPoints]);
    assert.deepEqual(claimed.data.arena.rewards.due, []);
    assert.equal(claimed.data.character.gold, after.gold);
    const again = await call('POST', '/api/cards/arena/claim', { cookie: ala.cookie, body: { week: last } });
    assert.deepEqual([again.status, again.data.error.code], [409, 'no_reward']);
  });

  test('a new month moves every card rating halfway back to the start', async () => {
    await look(ala);
    await look(bolek);
    const { index } = arenaSeason(Date.now(), content);
    await run('UPDATE card_arena_ratings SET season = ?, rating = 1400 WHERE character_id = ?', index - 1, ala.id);
    await run('UPDATE card_arena_ratings SET season = ?, rating = 600 WHERE character_id = ?', index - 2, bolek.id);
    assert.equal((await look(ala)).rating, 1200);
    assert.equal(await ratingOf(bolek), 900);
  });

  test('a rival removed in the middle of a match: the match still ends, moving only the player\'s rating; a character removed takes its Karty along', async () => {
    await look(ala);
    await play(ala, bolek.id);
    assert.equal((await call('DELETE', '/api/character', { cookie: bolek.cookie })).status, 200);
    const running = await first('SELECT rival_id FROM card_arena_matches WHERE character_id = ?', ala.id);
    assert.equal(running.rival_id, null);
    const given = await surrender(ala);
    assert.equal(given.status, 200, JSON.stringify(given.data).slice(0, 300));
    assert.equal(await ratingOf(ala), 1000 - rules.rating.attackK / 2);
    assert.equal((await first('SELECT COUNT(*) AS n FROM card_arena_ratings WHERE character_id = ?', bolek.id)).n, 0);
    assert.equal((await first('SELECT defender_id FROM card_arena_results')).defender_id, null);
    assert.deepEqual(given.data.arena.rivals, []);
    assert.equal((await call('DELETE', '/api/character', { cookie: ala.cookie })).status, 200);
    for (const table of ['card_arena_ratings', 'card_arena_results', 'card_arena_matches']) {
      assert.equal((await first(`SELECT COUNT(*) AS n FROM ${table}`)).n, 0, table);
    }
  });
});

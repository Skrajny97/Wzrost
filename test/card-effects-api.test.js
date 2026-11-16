// Talia Systemu's effect cards through the API (src/server/cards.js,
// card-arena.js, hunts.js, labyrinth.js; DECISIONS.md, "Karty efektów w
// Talii Systemu", 976–979): the effect cards a character has, at their
// levels; laid beside the deck's twelve creatures, at most two of its own,
// kept with their slot; played in a match once each, checked on the server;
// the tier's effect card at its first staked win since they came; the
// pack's in place of a creature by its chance; a rare one of an
// exploration; and gone with the character.

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { beforeEach, describe, test } from 'node:test';

import { casinoDay, effectDrop, packCards, packEffect } from '../src/engine/index.js';
import { makeClimber } from './helpers/climb.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const effects = content.cards.effects;
const rarityOf = (id) => effects.cards.find((one) => one.id === id).rarity;

describe('Karty efektów through the API', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on', CARDS: 'on' });
  let cookie;
  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql} WHERE name = 'Karciarz'`).bind(...binds).run();
  const row = async () => (await db()).prepare("SELECT * FROM characters WHERE name = 'Karciarz'").first();
  const tab = async () => (await call('GET', '/api/cards', { cookie })).data.cards;
  const give = async (id, copies = 1) =>
    (await db())
      .prepare('INSERT INTO card_effects (character_id, effect_id, copies, created_at) VALUES (?, ?, ?, 1) ON CONFLICT (character_id, effect_id) DO UPDATE SET copies = excluded.copies')
      .bind((await row()).id, id, copies)
      .run();
  const owned = async () => (await (await db()).prepare('SELECT effect_id, copies FROM card_effects ORDER BY effect_id').all()).results;
  const save = (body) => call('POST', '/api/cards/deck', { cookie, body });
  const start = (tier, staked) => call('POST', '/api/cards/match', { cookie, body: { tier, staked } });
  const turn = (body) => call('POST', '/api/cards/turn', { cookie, body });
  const running = async () => (await db()).prepare('SELECT * FROM card_matches WHERE result IS NULL').first();
  const state = async () => JSON.parse((await running()).state);
  const setState = async (next) => (await db()).prepare('UPDATE card_matches SET state = ? WHERE result IS NULL').bind(JSON.stringify(next)).run();
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
    match.foe.effects = [];
    match.foe.effectPlan = null;
    match.me.cards[0].attack = Math.max(match.me.cards[0].attack, 1);
    await setState(match);
    return match;
  };

  beforeEach(async () => {
    ({ cookie } = await signUp('karciarz'));
    await call('POST', '/api/character', { cookie, body: { name: 'Karciarz', classId: 'warrior', appearance: 'female' } });
    await set('level = 30, class_level = 30, gold = 100000');
    await call('POST', '/api/cards/starter', { cookie });
  });

  test('the tab: none at first, then those the character has, at their levels, with the slots and the words', async () => {
    let view = (await tab()).effects;
    assert.deepEqual([view.slots, view.owned, view.deck], [effects.slots, [], []]);
    assert.equal(view.texts.tab, effects.texts.tab);
    await give('bear-strength', 3);
    await give('mist');
    view = (await tab()).effects;
    const bear = view.owned.find((one) => one.id === 'bear-strength');
    assert.deepEqual([bear.effect, bear.kind, bear.target, bear.level, bear.copies, bear.inDeck], [true, 'boost', 'own', 3, 3, false]);
    assert.ok(Math.abs(bear.power - 0.6) < 1e-9, String(bear.power));
    assert.match(bear.text, /60%/);
    // An id the game does not know is not shown.
    await give('no-such-card');
    assert.equal((await tab()).effects.owned.length, 2);
  });

  test("a deck's effect cards: at most two, different, the character's own, kept with their slot, in the match from it", async () => {
    const deck = (await tab()).deck;
    await give('bear-strength');
    await give('mist');
    await give('shackles', 2);
    const lay = (extra) => save({ cards: deck, ...extra });
    assert.equal((await lay({ effects: ['bear-strength', 'mist', 'shackles'] })).data.error.code, 'invalid_effects');
    assert.equal((await lay({ effects: ['mist', 'mist'] })).data.error.code, 'invalid_effects');
    assert.equal((await lay({ effects: ['no-such-card'] })).data.error.code, 'invalid_effects');
    assert.equal((await lay({ effects: 'mist' })).data.error.code, 'invalid_effects');
    assert.equal((await lay({ effects: ['perun-lightning'] })).data.error.code, 'effect_missing');
    const laid = await lay({ effects: ['shackles', 'mist'] });
    assert.equal(laid.status, 200, JSON.stringify(laid.data));
    assert.deepEqual(laid.data.cards.effects.deck, ['shackles', 'mist']);
    assert.deepEqual(laid.data.cards.decks.slots[0].effects, ['shackles', 'mist']);
    assert.deepEqual(
      laid.data.cards.effects.owned.filter((one) => one.inDeck).map((one) => one.id).sort(),
      ['mist', 'shackles'],
    );
    // Without them in the request, the slot keeps its own.
    assert.deepEqual((await lay({})).data.cards.effects.deck, ['shackles', 'mist']);
    // Another slot, with none; playing the first again brings them back.
    const second = await save({ cards: deck, slot: 2 });
    assert.equal(second.status, 200, JSON.stringify(second.data));
    assert.deepEqual(second.data.cards.effects.deck, []);
    assert.deepEqual(second.data.cards.decks.slots[0].effects, ['shackles', 'mist']);
    const used = await call('POST', '/api/cards/decks/use', { cookie, body: { slot: 1 } });
    assert.equal(used.status, 200, JSON.stringify(used.data));
    assert.deepEqual(used.data.cards.effects.deck, ['shackles', 'mist']);
    // An empty list takes them off.
    assert.deepEqual((await lay({ effects: [] })).data.cards.effects.deck, []);
    await lay({ effects: ['shackles', 'mist'] });
    // The match starts with them, at their levels, none played.
    assert.equal((await start(1, false)).status, 200);
    const match = (await tab()).match;
    assert.deepEqual(
      match.me.effects.map((one) => [one.id, one.level, one.used]),
      [
        ['shackles', 2, false],
        ['mist', 1, false],
      ],
    );
  });

  test('in a match: one a round, each once, on the target its kind asks, checked on the server', async () => {
    const deck = (await tab()).deck;
    await give('bear-strength');
    await give('perun-lightning');
    await save({ cards: deck, effects: ['bear-strength', 'perun-lightning'] });
    await start(1, false);
    let match = (await tab()).match;
    const lines = match.me.hand.slice(0, 3).map((card) => card.key);
    const [bear, bolt] = match.me.effects;
    // Its own card for Niedźwiedzia siła: one on its lines after the turn.
    assert.equal((await turn({ round: match.round, lines, effect: { key: bear.key, target: 99 } })).data.error.code, 'invalid_effect');
    assert.equal((await turn({ round: match.round, lines, effect: { key: 7 } })).data.error.code, 'invalid_effect');
    const played = await turn({ round: match.round, lines, effect: { key: bear.key, target: lines[0] } });
    assert.equal(played.status, 200, JSON.stringify(played.data));
    match = played.data.cards.match;
    assert.equal(match.me.effects.find((one) => one.key === bear.key).used, true);
    assert.equal(match.last.effect.id, 'bear-strength');
    // Once a match.
    const next = match.me.lines.map((card) => card?.key ?? null);
    for (let line = 0; line < 3; line += 1) if (next[line] === null && match.me.hand.length > 0) next[line] = match.me.hand.shift().key;
    if (match.result === null) {
      assert.equal((await turn({ round: match.round, lines: next, effect: { key: bear.key, target: next.find((key) => key !== null) } })).data.error.code, 'effect_used');
      // Piorun Peruna on the rival's line with a card on it.
      const line = match.foe.lines.findIndex((card) => card !== null);
      if (line >= 0) {
        const struck = await turn({ round: match.round, lines: next, effect: { key: bolt.key, target: line } });
        assert.equal(struck.status, 200, JSON.stringify(struck.data));
        assert.equal(struck.data.cards.match.last.effect.id, 'perun-lightning');
      }
    }
  });

  test("a tier's first staked win since the effect cards came gives one of the tier's rarity, once a tier", async () => {
    const tier = 1;
    // The tier beaten before the effect cards: its effect card still waits.
    const game = JSON.parse((await row()).card_game);
    await set('card_game = ?', JSON.stringify({ ...game, beaten: [tier] }));
    let view = await tab();
    assert.equal(view.tiers[0].effectWin.id, effects.firstWin[tier - 1]);
    assert.equal(view.tiers[1].effectWin.id, effects.firstWin[1]);
    await start(tier, true);
    let match = await lastCards(99, 1);
    const won = await turn({ round: match.round, lines: match.me.lines });
    assert.equal(won.status, 200, JSON.stringify(won.data));
    assert.equal(won.data.end.result, 'won');
    // No creature card: the tier was beaten before.
    assert.equal(won.data.end.card, null);
    const card = won.data.end.effectCard;
    assert.ok(card, JSON.stringify(won.data.end));
    assert.deepEqual([card.effect, card.fresh, card.level, rarityOf(card.id)], [true, true, 1, effects.firstWin[tier - 1]]);
    assert.deepEqual(await owned(), [{ effect_id: card.id, copies: 1 }]);
    view = won.data.cards;
    assert.equal(view.tiers[0].effectWin, null);
    assert.deepEqual(view.effects.owned.map((one) => one.id), [card.id]);
    // Once a tier.
    await start(tier, true);
    match = await lastCards(99, 1);
    const again = await turn({ round: match.round, lines: match.me.lines });
    assert.equal(again.data.end.effectCard, undefined);
    assert.equal((await owned()).length, 1);
    // A training match gives none.
    await start(2, false);
    match = await lastCards(99, 1);
    assert.equal((await turn({ round: match.round, lines: match.me.lines })).data.end.effectCard, undefined);
  });

  test("the day's pack: an effect card in place of the first creature by its chance, from the server's key", async () => {
    // A key of the server's whose draw for this character today has one.
    const { id } = await row();
    const day = casinoDay(Date.now(), content).key;
    const database = await db();
    let key = null;
    for (let index = 0; index < 400 && !key; index += 1) {
      const candidate = `${'0'.repeat(60)}${index.toString(16).padStart(4, '0')}`;
      const seed = createHmac('sha256', candidate).update(`${day}:${id}`).digest('hex');
      if (packEffect({ maxed: [], seed }, content)) key = candidate;
    }
    assert.ok(key);
    await database.prepare("INSERT INTO server_settings (key, value) VALUES ('card_seed', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").bind(key).run();
    const offer = (await tab()).pack;
    assert.equal(offer.effectChance, effects.packChance);
    const bought = await call('POST', '/api/cards/pack', { cookie });
    assert.equal(bought.status, 200, JSON.stringify(bought.data));
    const seed = createHmac('sha256', key).update(`${day}:${id}`).digest('hex');
    const effect = packEffect({ maxed: [], seed }, content);
    const drawn = packCards({ maxed: [], seed, count: content.cards.pack.cards }, content);
    assert.deepEqual(
      bought.data.pack.map((card) => card.id),
      [effect, ...drawn.slice(1)],
    );
    assert.deepEqual([bought.data.pack[0].effect, bought.data.pack[0].fresh, bought.data.pack[0].level], [true, true, 1]);
    assert.deepEqual(await owned(), [{ effect_id: effect, copies: 1 }]);
    assert.deepEqual(bought.data.cards.effects.owned.map((one) => one.id), [effect]);
    // Its rarity is one of the effects' weights.
    assert.ok(Object.keys(effects.weights).includes(rarityOf(effect)));
  });

  test('an exploration may leave an effect card, rarely: by its hours, in the report, the Dziennik and the collection; none after a faint', async () => {
    await set('level = 60, class_level = 50, hp = 99999');
    // A climber in its gear: the seed is the first that gives the effect
    // card at the moment the test starts the exploration, and a character
    // with no gear could faint on it (16.11.2026, a run of the tests).
    await makeClimber(await db(), (await row()).id);
    const started = await call('POST', '/api/hunts', { cookie, body: { areaId: 'boar-thicket', minutes: 240 } });
    assert.equal(started.status, 201, JSON.stringify(started.data));
    const database = await db();
    await database.prepare('UPDATE activities SET hp_at_start = 99999, started_at = started_at - ?, ends_at = ends_at - ?').bind(240 * 60000, 240 * 60000).run();
    const activity = await database.prepare('SELECT * FROM activities').first();
    const chance = (effects.drops.explorationHour * activity.minutes) / 60;
    // A seed whose exploration leaves one.
    let seed = null;
    for (let index = 0; index < 2000 && !seed; index += 1) {
      if (effectDrop({ maxed: [], seed: `efekt:${index}:${activity.started_at}`, chance }, content)) seed = `efekt:${index}`;
    }
    assert.ok(seed);
    await database.prepare('UPDATE activities SET seed = ?').bind(seed).run();
    const claimed = await call('POST', '/api/hunts/claim', { cookie });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
    const { report } = claimed.data;
    assert.notEqual(report.result, 'fainted');
    const card = report.cards.find((one) => one.effect);
    assert.ok(card, JSON.stringify(report.cards));
    assert.equal(card.id, effectDrop({ maxed: [], seed: `${seed}:${activity.started_at}`, chance }, content));
    assert.ok(report.system.some((line) => line.includes(card.name)));
    assert.deepEqual(await owned(), [{ effect_id: card.id, copies: 1 }]);
    const journal = await database.prepare("SELECT summary FROM reports WHERE kind = 'hunt' ORDER BY id DESC LIMIT 1").first();
    assert.ok(JSON.parse(journal.summary).cards.some((one) => one.name === card.name));
  });

  test('the effect cards go with the character', async () => {
    await give('mist', 2);
    const { id } = await row();
    const gone = await call('DELETE', '/api/character', { cookie });
    assert.equal(gone.status, 200, JSON.stringify(gone.data));
    assert.equal((await (await db()).prepare('SELECT COUNT(*) AS count FROM card_effects WHERE character_id = ?').bind(id).first()).count, 0);
  });
});

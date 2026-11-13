// Partie kart na żywo through the API (src/server/card-duel.js; 901 B):
// „Zagraj w karty” on the card of another player in the game, never on
// one's own characters; the challenge sheet's stakes; a challenge accepted,
// both stakes paid at once, the moves in turn and in the open, the winner
// taking both stakes but 5%; a challenge turned down or let go, nothing
// paid, and the minute's pause; a move missed made by the game and two in a
// row lost, kept by the chat's poll too; a draw's stakes back, a surrender;
// the level for gold, the day's ten, the gold for the stake, one challenge
// or match at a time and Szczęsny waiting meanwhile; two taps at once; a
// character removed in a match.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { casinoDay } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const live = content.cards.live;

describe('Partie kart na żywo', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on', CARDS: 'on' });
  const cookies = {};

  // An account with a character at `level`, `gold` gold and Szczęsny's
  // deck, in the game now.
  async function player(name, { level = 30, gold = 10000, classId = 'warrior' } = {}) {
    const { cookie } = await signUp(name.toLowerCase());
    await call('POST', '/api/character', { cookie, body: { name, classId, appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = ?, class_level = ?, gold = ? WHERE name = ?').bind(level, level, gold, name).run();
    assert.equal((await call('POST', '/api/cards/starter', { cookie })).status, 200);
    await call('GET', '/api/chat/latest', { cookie });
    return cookie;
  }
  const row = async (name) => (await db()).prepare('SELECT id, gold, level, version FROM characters WHERE name = ?').bind(name).first();
  const sql = async (text, ...binds) => (await db()).prepare(text).bind(...binds).run();
  const duelRow = async () => (await db()).prepare('SELECT * FROM card_duels ORDER BY id DESC LIMIT 1').first();
  const challenge = async (from, to, stake = 0) => call('POST', '/api/cards/duel/challenge', { cookie: cookies[from], body: { id: (await row(to)).id, stake } });
  const answer = (name, id, accept = true) => call('POST', '/api/cards/duel/answer', { cookie: cookies[name], body: { id, accept } });
  const read = async (name) => (await call('GET', '/api/cards/duel', { cookie: cookies[name] })).data.duel;
  const turn = (name, id, body) => call('POST', '/api/cards/duel/turn', { cookie: cookies[name], body: { id, ...body } });
  // The reserve on the empty lines, from the front.
  const fill = (match) => {
    const lines = match.me.lines.map((card) => card?.key ?? null);
    const hand = match.me.hand.map((card) => card.key);
    for (let line = 0; line < 3; line += 1) if (lines[line] === null && hand.length > 0) lines[line] = hand.shift();
    return { round: match.round, lines };
  };
  // A match from a challenge accepted.
  async function started(stake = 500, from = 'Karciarka', to = 'Szuler') {
    const sent = await challenge(from, to, stake);
    assert.equal(sent.status, 200, JSON.stringify(sent.data));
    const accepted = await answer(to, sent.data.duel.id);
    assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
    assert.equal(accepted.data.duel.state, 'playing');
    return sent.data.duel.id;
  }
  // Whose move it is: the player's name and its view.
  async function mover(names) {
    for (const name of names) {
      const duel = await read(name);
      if (duel?.match?.step === 'me') return { name, duel };
    }
    return null;
  }
  // The stored match changed (for times moved back and boards laid out).
  const setGame = async (id, change) => {
    const game = JSON.parse((await (await db()).prepare('SELECT game FROM card_duels WHERE id = ?').bind(id).first()).game);
    change(game);
    await sql('UPDATE card_duels SET game = ? WHERE id = ?', JSON.stringify(game), id);
    return game;
  };

  beforeEach(async () => {
    cookies.Karciarka = await player('Karciarka');
    cookies.Szuler = await player('Szuler', { level: 90, classId: 'mage' });
  });

  test("„Zagraj w karty” on the card of another player in the game, never on one's own characters", async () => {
    const profile = async (name, cookie = cookies.Karciarka) => (await call('GET', `/api/profile/${encodeURIComponent(name)}`, { cookie })).data.profile;
    assert.equal((await profile('Szuler')).cardDuel, true);
    assert.equal((await profile('Karciarka')).cardDuel, false);
    await sql("UPDATE users SET seen_at = 0 WHERE login = 'szuler'");
    assert.equal((await profile('Szuler')).cardDuel, false);
    assert.equal((await challenge('Karciarka', 'Szuler')).data.error.code, 'offline');
    await call('GET', '/api/chat/latest', { cookie: cookies.Szuler });
    assert.equal((await challenge('Karciarka', 'Karciarka')).data.error.code, 'self');
    // Another character of the same account.
    await call('POST', '/api/character', { cookie: cookies.Karciarka, body: { name: 'Druga', classId: 'archer', appearance: 'female' } });
    await sql("UPDATE characters SET level = 30 WHERE name = 'Druga'");
    await call('POST', '/api/cards/starter', { cookie: cookies.Karciarka });
    assert.equal((await profile('Karciarka')).cardDuel, false);
    const own = await challenge('Karciarka', 'Karciarka');
    assert.deepEqual([own.status, own.data.error.code], [403, 'own']);
  });

  test("the challenge sheet: the stakes up to Szczęsny's top stake at the lower level, what a win gives, the day's matches", async () => {
    const { data } = await call('GET', `/api/cards/duel/offer?id=${(await row('Szuler')).id}`, { cookie: cookies.Karciarka });
    assert.deepEqual(data.offer.stakes.map((one) => one.stake), [0, 100, 200, 300, 400, 500]);
    assert.deepEqual(data.offer.stakes.map((one) => one.pot), [0, 190, 380, 570, 760, 950]);
    assert.equal(data.offer.max, 500);
    assert.equal(data.offer.other.name, 'Szuler');
    assert.equal(data.offer.other.online, true);
    assert.equal(data.offer.block, null);
    assert.deepEqual([data.used, data.limit, data.cut], [0, live.perDay, 5]);
    assert.ok(data.texts.staked.includes('{pot}'));
    // Not a stake of the list.
    assert.equal((await challenge('Karciarka', 'Szuler', 600)).data.error.code, 'invalid_stake');
    assert.equal((await challenge('Karciarka', 'Szuler', 150)).data.error.code, 'invalid_stake');
    // For gold both from level 20: with one below it, only without a stake.
    await sql("UPDATE characters SET level = 19 WHERE name = 'Szuler'");
    const low = (await call('GET', `/api/cards/duel/offer?id=${(await row('Szuler')).id}`, { cookie: cookies.Karciarka })).data.offer;
    assert.deepEqual(low.stakes.map((one) => one.stake), [0]);
    assert.equal((await challenge('Karciarka', 'Szuler', 100)).data.error.code, 'stake_level');
    assert.equal((await challenge('Karciarka', 'Szuler', 0)).status, 200);
  });

  test('a challenge accepted: both pay at once, the leader lays in the open, the other answers, in turn; the winner takes both stakes but 5%', async () => {
    const sent = await challenge('Karciarka', 'Szuler', 500);
    assert.equal(sent.status, 200, JSON.stringify(sent.data));
    assert.equal(sent.data.duel.state, 'proposed');
    assert.equal(sent.data.duel.pot, 950);
    // The other hears of it in the chat's poll.
    const news = (await call('GET', '/api/chat/latest', { cookie: cookies.Szuler })).data.duel;
    assert.deepEqual([news.state, news.mine, news.stake, news.pot, news.other.name], ['proposed', false, 500, 950, 'Karciarka']);
    assert.equal(news.endsAt, (await duelRow()).created_at + live.acceptSeconds * 1000);
    // Nothing is paid before the answer.
    assert.equal((await row('Karciarka')).gold, 10000);
    const accepted = await answer('Szuler', sent.data.duel.id);
    assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
    assert.equal(accepted.data.character.gold, 9500);
    assert.deepEqual([(await row('Karciarka')).gold, (await row('Szuler')).gold], [9500, 9500]);
    const id = sent.data.duel.id;
    // The state never leaves the server.
    assert.ok(!JSON.stringify(accepted.data).includes(JSON.parse((await duelRow()).game).seed));
    // Who leads moves first; the other cannot meanwhile.
    const [a, b] = [await read('Karciarka'), await read('Szuler')];
    assert.deepEqual(new Set([a.match.step, b.match.step]), new Set(['me', 'foe']));
    const waiting = a.match.step === 'me' ? 'Szuler' : 'Karciarka';
    const waitingView = waiting === 'Szuler' ? b : a;
    assert.equal((await turn(waiting, id, fill(waitingView.match))).data.error.code, 'not_your_move');
    let moves = 0;
    let leads = [];
    for (;;) {
      const next = await mover(['Karciarka', 'Szuler']);
      if (!next) break;
      const { name, duel } = next;
      if (duel.match.lead === 'me') {
        leads.push(name);
        // The other sees nothing of it until it is laid.
        const other = await read(name === 'Karciarka' ? 'Szuler' : 'Karciarka');
        assert.equal(other.match.moves.foe, null);
      } else {
        // The answer: the leader's cards are on the table, new this round,
        // unless the leader had no line free or no card left to lay (the
        // match's seed is random, so late rounds can come either way).
        assert.ok(duel.match.moves.foe.filled.length > 0 || duel.match.foe.lines.every((card) => card !== null) || duel.match.foe.hand === 0, JSON.stringify({ moves: duel.match.moves.foe, lines: duel.match.foe.lines.map((card) => card !== null), hand: duel.match.foe.hand, deck: duel.match.foe.deck }));
      }
      const moved = await turn(name, id, fill(duel.match));
      assert.equal(moved.status, 200, JSON.stringify(moved.data));
      moves += 1;
      assert.ok(moves < 80);
      if (moved.data.duel.state === 'done') break;
    }
    // The leaders took turns.
    leads.forEach((name, index) => index > 0 && assert.notEqual(name, leads[index - 1]));
    const done = await read('Karciarka');
    assert.equal(done, null);
    const last = (await call('GET', `/api/cards/duel?id=${id}`, { cookie: cookies.Karciarka })).data.duel;
    assert.equal(last.state, 'done');
    const result = last.match.result;
    const gold = { won: 9500 + 950, lost: 9500, drawn: 10000 }[result];
    assert.equal((await row('Karciarka')).gold, gold);
    assert.equal(last.gold, { won: 950, lost: 0, drawn: 500 }[result]);
    const other = { won: 9500, lost: 9500 + 950, drawn: 10000 }[result];
    assert.equal((await row('Szuler')).gold, other);
    const stored = await duelRow();
    assert.equal(stored.winner, result === 'won' ? (await row('Karciarka')).id : result === 'lost' ? (await row('Szuler')).id : null);
    assert.equal(stored.day, casinoDay(stored.created_at, content).key);
    // One of each one's matches for gold today.
    assert.equal((await call('GET', '/api/cards/duel', { cookie: cookies.Szuler })).data.used, 1);
  });

  test('a challenge turned down or let go: nothing paid, and the same one again only after a minute', async () => {
    const first = await challenge('Karciarka', 'Szuler', 100);
    const declined = await answer('Szuler', first.data.duel.id, false);
    assert.equal(declined.data.duel.state, 'declined');
    assert.equal((await answer('Szuler', first.data.duel.id)).data.error.code, 'answered');
    const again = await challenge('Karciarka', 'Szuler', 100);
    assert.deepEqual([again.status, again.data.error.code], [429, 'paused']);
    // The other way round there is no pause.
    assert.equal((await challenge('Szuler', 'Karciarka', 0)).status, 200);
    await answer('Karciarka', (await duelRow()).id, false);
    await sql('UPDATE card_duels SET updated_at = updated_at - ?', live.repeatSeconds * 1000 + 1000);
    const second = await challenge('Karciarka', 'Szuler', 100);
    assert.equal(second.status, 200, JSON.stringify(second.data));
    // Two minutes without an answer: it is gone, as the chat's poll tells.
    await sql('UPDATE card_duels SET created_at = created_at - ? WHERE id = ?', live.acceptSeconds * 1000 + 1000, second.data.duel.id);
    assert.equal((await call('GET', '/api/chat/latest', { cookie: cookies.Szuler })).data.duel, null);
    const late = await answer('Szuler', second.data.duel.id);
    assert.deepEqual([late.status, late.data.error.code], [409, 'answered']);
    assert.equal((await duelRow()).state, 'expired');
    assert.deepEqual([(await row('Karciarka')).gold, (await row('Szuler')).gold], [10000, 10000]);
    assert.equal((await challenge('Karciarka', 'Szuler', 100)).data.error.code, 'paused');
  });

  // 917 A: a challenge waiting for its answer is taken back at once by its
  // challenger, who may then challenge another player; the one challenged
  // hears it on accepting, and nothing is paid nor played.
  test('a challenge withdrawn: the challenger is free at once, an acceptance after it is refused, and only the challenger withdraws', async () => {
    cookies.Gracz = await player('Gracz');
    const sent = await challenge('Karciarka', 'Szuler', 100);
    const { id } = sent.data.duel;
    const sheet = async () => (await call('GET', `/api/cards/duel/offer?id=${(await row('Gracz')).id}`, { cookie: cookies.Karciarka })).data.offer;
    // The sheet for another player shows the challenge waiting.
    assert.deepEqual([(await sheet()).waiting.id, (await sheet()).waiting.other.name], [id, 'Szuler']);
    assert.equal((await challenge('Karciarka', 'Gracz')).data.error.code, 'busy_self');
    // Only the challenger takes it back.
    const withdraw = (name, which = id) => call('POST', '/api/cards/duel/withdraw', { cookie: cookies[name], body: { id: which } });
    const theirs = await withdraw('Szuler');
    assert.deepEqual([theirs.status, theirs.data.error.code], [404, 'no_duel']);
    assert.equal((await duelRow()).state, 'proposed');
    const taken = await withdraw('Karciarka');
    assert.equal(taken.status, 200, JSON.stringify(taken.data));
    assert.equal(taken.data.duel.state, 'withdrawn');
    // Taken back twice: the same answer.
    assert.equal((await withdraw('Karciarka')).data.duel.state, 'withdrawn');
    // Free at once: a challenge to another player.
    assert.equal((await sheet()).waiting, null);
    const next = await challenge('Karciarka', 'Gracz');
    assert.equal(next.status, 200, JSON.stringify(next.data));
    // The one challenged before hears it on accepting: no match, nothing paid.
    assert.equal((await call('GET', '/api/chat/latest', { cookie: cookies.Szuler })).data.duel, null);
    const late = await answer('Szuler', id);
    assert.deepEqual([late.status, late.data.error.code, late.data.error.message], [409, 'withdrawn', 'To wyzwanie zostało wycofane.']);
    const stored = await (await db()).prepare('SELECT state, game FROM card_duels WHERE id = ?').bind(id).first();
    assert.deepEqual([stored.state, stored.game], ['withdrawn', null]);
    assert.deepEqual([(await row('Karciarka')).gold, (await row('Szuler')).gold], [10000, 10000]);
    // The same player again only after the pause, as after one turned down.
    await answer('Gracz', next.data.duel.id, false);
    assert.equal((await challenge('Karciarka', 'Szuler', 100)).data.error.code, 'paused');
    // A challenge accepted is no longer taken back.
    await sql('UPDATE card_duels SET updated_at = updated_at - ?', live.repeatSeconds * 1000 + 1000);
    const match = await started(100);
    const refused = await withdraw('Karciarka', match);
    assert.deepEqual([refused.status, refused.data.error.code, refused.data.error.message], [409, 'answered', 'Tego wyzwania nie da się już wycofać.']);
    assert.equal((await duelRow()).state, 'playing');
  });

  test('a move not made in 30 seconds is made by the game; two in a row lose the match, kept by the chat\'s poll too', async () => {
    const id = await started(500);
    const { name: slow, duel } = await mover(['Karciarka', 'Szuler']);
    const fast = slow === 'Karciarka' ? 'Szuler' : 'Karciarka';
    const ago = (seconds) => Date.now() - seconds * 1000;
    await setGame(id, (game) => (game.deadline = ago(live.turnSeconds + live.graceSeconds + 1)));
    // The other's poll makes the move for the slow one.
    await call('GET', '/api/chat/latest', { cookie: cookies[fast] });
    const after = await read(slow);
    assert.equal(after.match.step, 'foe');
    assert.equal(after.match.missed.me, 1);
    assert.equal(after.match.moves.me.auto, true);
    assert.equal(after.match.round, duel.match.round);
    // The fast one answers and then leads; the slow one misses again.
    for (let index = 0; index < 2; index += 1) {
      const view = await read(fast);
      assert.equal(view.match.step, 'me');
      assert.equal((await turn(fast, id, fill(view.match))).status, 200);
    }
    assert.equal((await read(slow)).match.step, 'me');
    await setGame(id, (game) => (game.deadline = ago(live.turnSeconds + live.graceSeconds + 1)));
    const news = (await call('GET', '/api/chat/latest', { cookie: cookies[fast] })).data.duel;
    assert.equal(news, null);
    const end = (await call('GET', `/api/cards/duel?id=${id}`, { cookie: cookies[slow] })).data.duel;
    assert.deepEqual([end.state, end.match.result, end.match.end], ['done', 'lost', 'missed']);
    assert.equal((await row(fast)).gold, 9500 + 950);
    assert.equal((await row(slow)).gold, 9500);
    // A move after the end is refused.
    assert.equal((await turn(slow, id, fill(end.match))).data.error.code, 'match_over');
  });

  test('a draw gives both stakes back; a surrender loses the match', async () => {
    const id = await started(300);
    // Each side left with one card of one Życie on its front line.
    await setGame(id, (game) => {
      for (const side of [game.me, game.foe]) {
        const key = side.hand[0];
        side.lines = [key, null, null];
        side.hand = [];
        side.deck = [];
        side.out = side.cards.map((card) => card.key).filter((one) => one !== key);
        side.cards[key].life = 1;
      }
    });
    for (let index = 0; index < 2; index += 1) {
      const { name, duel } = await mover(['Karciarka', 'Szuler']);
      assert.equal((await turn(name, id, fill(duel.match))).status, 200);
    }
    const end = (await call('GET', `/api/cards/duel?id=${id}`, { cookie: cookies.Szuler })).data.duel;
    assert.deepEqual([end.state, end.match.result, end.gold], ['done', 'drawn', 300]);
    assert.deepEqual([(await row('Karciarka')).gold, (await row('Szuler')).gold], [10000, 10000]);
    // A surrender: the other takes both stakes but 5%.
    const next = await started(100, 'Szuler', 'Karciarka');
    const given = await call('POST', '/api/cards/duel/surrender', { cookie: cookies.Karciarka, body: { id: next } });
    assert.equal(given.status, 200, JSON.stringify(given.data));
    assert.deepEqual([given.data.duel.match.result, given.data.duel.match.end], ['lost', 'surrender']);
    assert.deepEqual([(await row('Karciarka')).gold, (await row('Szuler')).gold], [9900, 10000 + 90]);
  });

  test("the gold for the stake, the day's ten matches for gold, one challenge or match at a time, and Szczęsny waiting meanwhile", async () => {
    cookies.Hazardzistka = await player('Hazardzistka');
    await sql("UPDATE characters SET gold = 50 WHERE name = 'Karciarka'");
    assert.equal((await challenge('Karciarka', 'Szuler', 100)).data.error.code, 'no_gold');
    await sql("UPDATE characters SET gold = 10000 WHERE name = 'Karciarka'");
    // The one challenged without the gold: refused, the challenge waits.
    const sent = await challenge('Karciarka', 'Szuler', 400);
    await sql("UPDATE characters SET gold = 100 WHERE name = 'Szuler'");
    const poor = await answer('Szuler', sent.data.duel.id);
    assert.deepEqual([poor.status, poor.data.error.code], [409, 'no_gold']);
    assert.equal((await duelRow()).state, 'proposed');
    // The challenger without it any more: the challenge lapses.
    await sql("UPDATE characters SET gold = 10000 WHERE name = 'Szuler'");
    await sql("UPDATE characters SET gold = 10 WHERE name = 'Karciarka'");
    assert.equal((await answer('Szuler', sent.data.duel.id)).data.error.code, 'no_gold_other');
    assert.equal((await duelRow()).state, 'expired');
    assert.deepEqual([(await row('Karciarka')).gold, (await row('Szuler')).gold], [10, 10000]);
    await sql("UPDATE characters SET gold = 10000 WHERE name = 'Karciarka'");
    // The minute's pause after the challenge that lapsed, gone by.
    await sql('UPDATE card_duels SET updated_at = updated_at - ?', live.repeatSeconds * 1000 + 1000);
    // Ten matches for gold today: no more for gold, without a stake still.
    const day = casinoDay(Date.now(), content).key;
    const [me, them] = [await row('Karciarka'), await row('Hazardzistka')];
    for (let index = 0; index < live.perDay; index += 1) {
      await sql("INSERT INTO card_duels (from_id, to_id, stake, state, day, created_at, updated_at) VALUES (?, ?, 100, 'done', ?, 1, 1)", me.id, them.id, day);
    }
    assert.equal((await challenge('Karciarka', 'Szuler', 100)).data.error.code, 'stakes_used');
    assert.equal((await challenge('Szuler', 'Hazardzistka', 100)).data.error.code, 'stakes_used_other');
    const free = await challenge('Karciarka', 'Szuler', 0);
    assert.equal(free.status, 200, JSON.stringify(free.data));
    // One challenge at a time, on both sides.
    assert.equal((await challenge('Karciarka', 'Hazardzistka', 0)).data.error.code, 'busy_self');
    assert.equal((await challenge('Hazardzistka', 'Szuler', 0)).data.error.code, 'busy');
    assert.equal((await answer('Szuler', free.data.duel.id)).status, 200);
    // While the match runs, Szczęsny waits.
    const host = await call('POST', '/api/cards/match', { cookie: cookies.Szuler, body: { tier: 1, staked: false } });
    assert.deepEqual([host.status, host.data.error.code], [409, 'duel_running']);
    assert.equal((await call('POST', '/api/cards/match', { cookie: cookies.Hazardzistka, body: { tier: 1, staked: false } })).status, 200);
    // And no challenge to one who plays.
    assert.equal((await challenge('Hazardzistka', 'Szuler', 0)).data.error.code, 'busy');
  });

  test('two taps at once: one acceptance and the stakes paid once; one move applied once', async () => {
    const sent = await challenge('Karciarka', 'Szuler', 200);
    const answers = await Promise.all([answer('Szuler', sent.data.duel.id), answer('Szuler', sent.data.duel.id)]);
    assert.deepEqual(answers.map((one) => one.status).sort(), [200, 409]);
    assert.deepEqual([(await row('Karciarka')).gold, (await row('Szuler')).gold], [9800, 9800]);
    const id = sent.data.duel.id;
    const { name, duel } = await mover(['Karciarka', 'Szuler']);
    const body = fill(duel.match);
    const moves = await Promise.all([turn(name, id, body), turn(name, id, body)]);
    assert.deepEqual(moves.map((one) => one.status).sort(), [200, 409]);
    const after = await read(name);
    assert.equal(after.match.step, 'foe');
    assert.equal(after.match.round, duel.match.round);
    assert.equal((await duelRow()).version, 2);
  });

  test('a character removed in a match loses it: the other takes both stakes but 5%; its rows keep it by a negative id', async () => {
    // A match Szuler won before, given up by Karciarka.
    const won = await started(0);
    assert.equal((await call('POST', '/api/cards/duel/surrender', { cookie: cookies.Karciarka, body: { id: won } })).status, 200);
    const szuler = (await row('Szuler')).id;
    const winnerOf = async (duel) => (await (await db()).prepare('SELECT winner FROM card_duels WHERE id = ?').bind(duel).first()).winner;
    assert.equal(await winnerOf(won), szuler);
    const id = await started(500);
    assert.equal((await call('DELETE', '/api/character', { cookie: cookies.Szuler })).status, 200);
    assert.equal((await row('Karciarka')).gold, 9500 + 950);
    const stored = await duelRow();
    assert.equal(stored.state, 'done');
    assert.ok(stored.to_id < 0);
    assert.equal(stored.winner, (await row('Karciarka')).id);
    // Its win too: the database may give its id to a new character.
    assert.equal(await winnerOf(won), -szuler);
    const end = (await call('GET', `/api/cards/duel?id=${id}`, { cookie: cookies.Karciarka })).data.duel;
    assert.deepEqual([end.match.result, end.match.end, end.gold], ['won', 'gone', 950]);
    assert.equal(end.other.id, null);
  });
});

// The mini-game at a work's report (1006, accepted on 16.11.2026): the
// zones from the work's seed, the marker to and fro, the hits by the times
// of the taps, what they give each work, and through the API: begun once,
// played, skipped or left out.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { fishCatch, markerAt, minigameChallenge, minigameExtra, minigameHits, minigameLine, minigameResult } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

// Times that hit each zone of a game: the first going right, the second
// coming back, the third going right again.
const hitting = ({ period, zones }) => [zones[0].center * (period / 2), period - zones[1].center * (period / 2), period + zones[2].center * (period / 2)].map(Math.round);

describe('the mini-game in the engine', () => {
  test('three zones from the seed, each narrower, whole within the bar; the same seed gives the same game', () => {
    const game = minigameChallenge('seed-1', content);
    assert.equal(game.tries, 3);
    assert.deepEqual(game.zones.map((zone) => zone.width), content.minigame.zones);
    for (const zone of game.zones) assert.ok(zone.center - zone.width / 2 > 0 && zone.center + zone.width / 2 < 1);
    assert.deepEqual(minigameChallenge('seed-1', content), game);
    assert.notDeepEqual(minigameChallenge('seed-2', content).zones, game.zones);
  });

  test('the marker goes right in half a period and back in the other half', () => {
    const game = { period: 1400 };
    assert.deepEqual([0, 350, 700, 1050, 1400, 2100].map((ms) => markerAt(ms, game)), [0, 0.5, 1, 0.5, 0, 1]);
  });

  test('the hits: in order, each in its zone, none later than the game could have gone on', () => {
    const game = minigameChallenge('seed-3', content);
    const taps = hitting(game);
    assert.equal(minigameHits(taps, game, 5000, content), 3);
    // A tap outside its zone misses; the others still count.
    assert.equal(minigameHits([taps[0], taps[1] + 300, taps[2]], game, 5000, content), 2);
    // Not in order, or later than the game went on (with the tolerance): the game ends there.
    assert.equal(minigameHits([taps[1], taps[0], taps[2]], game, 5000, content), 0);
    assert.equal(minigameHits(taps, game, taps[2] - content.minigame.tolerance - 1, content), 2);
    assert.equal(minigameHits('taps', game, 5000, content), 0);
    assert.equal(minigameHits([Number.NaN], game, 5000, content), 0);
  });

  test('what the hits give: 5%, 10% and 20% more, or 1, 2 and 4 points of a rarity higher in the Warsztat and the Szlifiernia', () => {
    assert.deepEqual([0, 1, 2, 3].map((hits) => minigameResult('fish', hits, content).share), [0, 0.05, 0.1, 0.2]);
    assert.deepEqual([0, 1, 2, 3].map((hits) => minigameResult('items', hits, content).luck), [0, 0.01, 0.02, 0.04]);
    assert.equal(minigameResult('jewels', 2, content).share, 0);
    assert.equal(minigameLine(minigameResult('fish', 3, content), content), 'Minigra: trafienia 3 z 3, +20% ryb.');
    assert.equal(minigameLine(minigameResult('items', 1, content), content), 'Minigra: trafienia 1 z 3, +1 pkt proc. szansy na wyższą rzadkość.');
    assert.equal(minigameLine(minigameResult('crops', 0, content), content), 'Minigra: bez trafień.');
    // The pieces more: the whole part, and the fraction by the seed.
    assert.deepEqual(minigameExtra({ roach: 10 }, 0.2, 's'), { roach: 2 });
    assert.deepEqual(minigameExtra({ roach: 10 }, 0, 's'), {});
    let more = 0;
    for (let index = 0; index < 400; index += 1) more += minigameExtra({ roach: 3 }, 0.1, `f${index}`).roach ?? 0;
    assert.ok(more > 80 && more < 160, String(more));
  });
});

describe('the mini-game through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('rybaczka'));
    await call('POST', '/api/character', { cookie, body: { name: 'Rybaczka', classId: 'archer', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = 25, xp = 0').run();
  });

  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const fishing = async () => {
    assert.equal((await call('POST', '/api/professions/fish', { cookie, body: { fish: ['roach'], minutes: 480 } })).status, 201);
    await run('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ?', 480 * 60000, 480 * 60000);
    return (await (await db()).prepare('SELECT seed FROM activities').first()).seed;
  };
  const claim = (body) => call('POST', '/api/hunts/claim', { cookie, body });
  // The fish of the work's seed at the level of Rybołówstwo now, without
  // the game, and with its share more.
  const level = async () => JSON.parse((await (await db()).prepare('SELECT professions FROM characters').first()).professions ?? '{}').fishing?.level ?? 1;
  const roach = (seed, share = 0, at = 1) => {
    const { found } = fishCatch({ fishIds: ['roach'], minutes: 480, level: at, seed }, content);
    return found.roach + (minigameExtra(found, share, seed).roach ?? 0);
  };

  test('begun once for a finished work, played: three hits give 20% more fish and the report says so', async () => {
    assert.equal((await call('POST', '/api/minigame', { cookie, body: {} })).data.error.code, 'no_minigame');
    const seed = await fishing();
    const begun = await call('POST', '/api/minigame', { cookie, body: {} });
    assert.equal(begun.status, 200, JSON.stringify(begun.data));
    const game = begun.data.minigame;
    assert.deepEqual([game.kind, game.title, game.button, game.zones.length], ['fish', 'Zacięcie', 'Zatnij!', 3]);
    // Begun again, the same game, at the same time.
    assert.equal((await call('POST', '/api/minigame', { cookie, body: {} })).data.minigame.at, game.at);
    // The game went on for a while before the taps came.
    await run("UPDATE activities SET options = json_set(options, '$.minigame.at', json_extract(options, '$.minigame.at') - 10000)");
    const claimed = await claim({ minigame: { taps: hitting(game) } });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
    const { report } = claimed.data;
    assert.equal(report.system[0], 'Minigra: trafienia 3 z 3, +20% ryb.');
    assert.deepEqual(report.minigame, { hits: 3, tries: 3, bonus: '+20% ryb' });
    assert.equal(report.fish.find((one) => one.id === 'roach').count, roach(seed, 0.2));
  });

  test('skipped, or claimed without the game, the work brings what it would and the report says nothing of it', async () => {
    let seed = await fishing();
    await call('POST', '/api/minigame', { cookie, body: {} });
    let { report } = (await claim({ minigame: { skip: true } })).data;
    assert.equal(report.minigame, undefined);
    assert.ok(!report.system.some((line) => line.startsWith('Minigra')));
    assert.equal(report.fish.find((one) => one.id === 'roach').count, roach(seed));
    // Taps for a game never begun count for nothing.
    seed = await fishing();
    const now = await level();
    ({ report } = (await claim({ minigame: { taps: [100, 800, 1500] } })).data);
    assert.equal(report.minigame, undefined);
    assert.equal(report.fish.find((one) => one.id === 'roach').count, roach(seed, 0, now));
  });

  test('a work not over yet has no game yet', async () => {
    assert.equal((await call('POST', '/api/professions/fish', { cookie, body: { fish: ['roach'], minutes: 60 } })).status, 201);
    assert.equal((await call('POST', '/api/minigame', { cookie, body: {} })).data.error.code, 'not_finished');
  });
});

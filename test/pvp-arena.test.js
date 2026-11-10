// The Arena in the Osada (src/engine/pvp-arena.js, src/server/pvp-arena.js;
// the author's 762 A): its rules in the engine (the unlock, the duel's
// determinism, its move limit and draw, the HP factor that keeps a duel a
// few rounds long at every level, the ratings, the season, the rivals and
// the rewards) and through the API (the 25th level, five fights a day,
// rivals never of the player's own account, both ratings moved, the
// defender's notice once, the week's table frozen once and its reward
// claimed once, the season's move, a character's Arena gone with it), and
// nothing of it where ARENA is off.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  arenaDuel,
  arenaReward,
  arenaRewardTiers,
  arenaSeason,
  arenaWeek,
  drawRivals,
  duelArmorShare,
  duelHpFactor,
  expectedScore,
  playerCombatant,
  ratingChanges,
  ratingStakes,
  seasonRating,
  unlockMessages,
} from '../src/engine/index.js';
import { measure } from '../tools/pvp-arena-sim.mjs';
import { playerOf } from '../tools/difficulty-sim.mjs';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rules = content.settlement.arena;
const fighter = (classId, level, name, set = 0) => ({ ...playerOf('realistic', classId, level, content, set), name });
// The content with other numbers of the duel.
const withDuel = (duel) => ({ ...content, settlement: { ...content.settlement, arena: { ...rules, duel: { ...rules.duel, ...duel } } } });

describe("the Arena's rules", () => {
  test('it opens at the 25th level of the character, its System message only where the Arena is on', () => {
    const unlock = content.unlocksById.arena;
    assert.equal(unlock.level, 25);
    assert.equal(unlock.feature, 'arena');
    assert.ok(!unlockMessages(25, content).includes(unlock.message));
    assert.ok(unlockMessages(25, { ...content, features: ['arena'] }).includes(unlock.message));
    const place = content.settlement.places.find((one) => one.id === 'arena');
    assert.equal(place.feature, 'arena');
  });

  test('a duel is the same for the same characters and seed, and the seed draws it', () => {
    const attacker = fighter('warrior', 60, 'Ala');
    const defender = fighter('mage', 62, 'Bolek', 1);
    const first = arenaDuel({ attacker, defender, seed: 'seed-1' }, content);
    assert.deepEqual(arenaDuel({ attacker, defender, seed: 'seed-1' }, content), first);
    const others = Array.from({ length: 8 }, (_, index) => arenaDuel({ attacker, defender, seed: `seed-${index + 2}` }, content));
    assert.ok(others.some((duel) => JSON.stringify(duel.fight.events) !== JSON.stringify(first.fight.events)));
    // The two characters alone, one on each side, as their playback shows them.
    assert.equal(first.fight.allies.length, 1);
    assert.equal(first.fight.enemies.length, 1);
    assert.equal(first.fight.enemies[0].classId, 'mage');
    assert.ok(['win', 'loss', 'draw'].includes(first.result));
    assert.equal(first.fight.won, first.result === 'win' ? true : first.result === 'loss' ? false : null);
  });

  test('both sides fight at full HP times the factor of their average level, without potions or companions', () => {
    const attacker = fighter('cleric', 40, 'Ala');
    const defender = fighter('shadow', 60, 'Bolek');
    const duel = arenaDuel({ attacker, defender, seed: 'hp' }, content);
    const factor = duelHpFactor(40, 60, content);
    assert.equal(duel.hpFactor, factor);
    assert.equal(duel.fight.allies[0].maxHp, Math.round(playerCombatant({ ...attacker }, content).maxHp * factor));
    assert.equal(duel.fight.enemies[0].maxHp, Math.round(playerCombatant({ ...defender }, content).maxHp * factor));
    assert.ok(duel.fight.events.every((event) => event.kind !== 'potion'));
    // The curve: as its first point below it, as its last past it, straight between.
    const curve = rules.duel.hpCurve;
    assert.equal(duelHpFactor(1, 1, content), curve[0][1]);
    assert.equal(duelHpFactor(1000, 1000, content), curve.at(-1)[1]);
    const [[fromLevel, from], [toLevel, to]] = curve;
    assert.ok(Math.abs(duelHpFactor(fromLevel, toLevel, content) - (from + to) / 2) < 1e-9);
    for (let i = 1; i < curve.length; i++) assert.ok(curve[i][0] > curve[i - 1][0], 'the curve goes up by level');
  });

  test("both sides' armour counts at the armour curve's share for their average level, less the higher they are (772)", () => {
    const attacker = fighter('warrior', 100, 'Ala');
    const defender = fighter('cleric', 120, 'Bolek', 1);
    const share = duelArmorShare(100, 120, content);
    assert.ok(share > 0 && share < 1);
    const duel = arenaDuel({ attacker, defender, seed: 'armour' }, content);
    assert.equal(duel.fight.allies[0].armor, Math.round(playerCombatant({ ...attacker }, content).armor * share));
    assert.equal(duel.fight.enemies[0].armor, Math.round(playerCombatant({ ...defender }, content).armor * share));
    // The curve as the HP curve: by level, as its first point below it and
    // its last past it, straight between; a share of at most all of it,
    // smaller the higher the level, as the characters' armour outgrows the
    // creatures' hides. Without a curve, all the armour.
    const curve = rules.duel.armorCurve;
    assert.equal(duelArmorShare(1, 1, content), curve[0][1]);
    assert.equal(duelArmorShare(1000, 1000, content), curve.at(-1)[1]);
    const [[fromLevel, from], [toLevel, to]] = curve;
    assert.ok(Math.abs(duelArmorShare(fromLevel, toLevel, content) - (from + to) / 2) < 1e-9);
    for (let i = 1; i < curve.length; i++) assert.ok(curve[i][0] > curve[i - 1][0] && curve[i][1] <= curve[i - 1][1]);
    assert.ok(curve.every(([, value]) => value > 0 && value <= 1));
    assert.equal(duelArmorShare(100, 120, withDuel({ armorCurve: undefined })), 1);
    assert.equal(arenaDuel({ attacker, defender, seed: 'armour' }, withDuel({ armorCurve: undefined })).fight.allies[0].armor, playerCombatant({ ...attacker }, content).armor);
  });

  test('after the move limit the judge ends the duel: more HP left wins, about as much is a draw', () => {
    const attacker = fighter('warrior', 100, 'Ala');
    const defender = fighter('cleric', 100, 'Bolek');
    // No move at all: both at full HP, a draw, and the judge's words close the log.
    const none = arenaDuel({ attacker, defender, seed: 'limit' }, withDuel({ maxMoves: 0 }));
    assert.equal(none.limit, true);
    assert.equal(none.result, 'draw');
    assert.equal(none.fight.draw, true);
    assert.equal(none.fight.won, null);
    assert.equal(none.fight.events.at(-1).kind, 'limit');
    // A few moves: whoever has the bigger share of its HP left wins.
    for (const seed of ['a', 'b', 'c', 'd']) {
      const duel = arenaDuel({ attacker, defender, seed }, withDuel({ maxMoves: 3, drawMargin: 0 }));
      if (!duel.limit) continue;
      assert.equal(duel.moves, 3);
      const { attacker: mine, defender: theirs } = duel.shares;
      assert.equal(duel.result, mine === theirs ? 'draw' : mine > theirs ? 'win' : 'loss');
    }
    // Within drawMargin it is a draw.
    const wide = arenaDuel({ attacker, defender, seed: 'a' }, withDuel({ maxMoves: 3, drawMargin: 1 }));
    assert.equal(wide.result, 'draw');
  });

  test('over the classes, a duel lasts a few rounds at every level and the judge ends few (tools/pvp-arena-sim.mjs)', () => {
    for (const level of [25, 100, 200]) {
      const result = measure({ level, seeds: 1, model: 'realistic' }, content);
      assert.ok(result.median >= 16 && result.median <= 40, `level ${level}: median ${result.median} moves`);
      assert.ok(result.limits <= 0.12, `level ${level}: the judge ended ${result.limits}`);
      assert.ok(result.short <= 0.15, `level ${level}: ${result.short} ended in a few moves`);
    }
  });

  test('no class loses most of its duels: each wins 30–70% of them against the other classes from the first evolution on (772)', () => {
    // Before 772 the Cień won 6–24% of them and the Łucznik 26–44%, while
    // the Mag and the Kleryk won 65–89% (tools/pvp-arena-sim.mjs).
    for (const level of [50, 75, 100, 200]) {
      const { wins } = measure({ level, seeds: 1, model: 'realistic' }, content);
      for (const [classId, share] of Object.entries(wins)) assert.ok(share >= 0.3 && share <= 0.7, `level ${level}: ${classId} wins ${share}`);
    }
  });

  test('a win or a loss moves both ratings as in chess, the defender\'s by less', () => {
    const { attackK, defenceK, floor, start } = rules.rating;
    assert.equal(expectedScore(start, start, content), 0.5);
    assert.deepEqual(ratingChanges(start, start, 'win', content), { attacker: attackK / 2, defender: -defenceK / 2 });
    assert.deepEqual(ratingChanges(start, start, 'loss', content), { attacker: -attackK / 2, defender: defenceK / 2 });
    assert.deepEqual(ratingChanges(start, start, 'draw', content), { attacker: 0, defender: 0 });
    assert.ok(defenceK < attackK);
    // A win over a stronger rival brings more, over a weaker less.
    assert.ok(ratingChanges(1000, 1300, 'win', content).attacker > ratingChanges(1000, 1000, 'win', content).attacker);
    assert.ok(ratingChanges(1300, 1000, 'win', content).attacker < ratingChanges(1000, 1000, 'win', content).attacker);
    // A draw with a stronger rival raises the rating a little.
    assert.ok(ratingChanges(1000, 1300, 'draw', content).attacker > 0);
    // Never below the floor.
    assert.equal(floor + ratingChanges(floor, floor + 50, 'loss', content).attacker, floor);
    assert.deepEqual(ratingStakes(1000, 1000, content), { win: attackK / 2, loss: -attackK / 2, draw: 0 });
  });

  test('a new season moves each rating halfway back to the start, rounded as SQLite rounds', () => {
    assert.equal(rules.season.share, 0.5);
    assert.equal(seasonRating(1400, 1, content), 1200);
    assert.equal(seasonRating(600, 1, content), 800);
    assert.equal(seasonRating(1400, 2, content), 1100);
    assert.equal(seasonRating(1401, 1, content), 1201);
    assert.equal(seasonRating(999, 1, content), 999);
    assert.equal(seasonRating(1000, 3, content), 1000);
    // The seasons are months of Polish time, one after another.
    const november = arenaSeason(Date.UTC(2026, 10, 10, 12), content);
    const december = arenaSeason(Date.UTC(2026, 11, 1, 12), content);
    assert.equal(december.index, november.index + 1);
    assert.equal(november.endsAt, Date.UTC(2026, 10, 30, 23));
    assert.equal(arenaWeek(Date.UTC(2026, 10, 10, 12), content).key, '2026-11-09');
  });

  test('three rivals are drawn from the nearest ones, the one just fought only when no other is there', () => {
    const candidates = Array.from({ length: 10 }, (_, index) => ({ id: index + 1, rating: 1000 + index * 7 }));
    const drawn = drawRivals(candidates, 'x', content);
    assert.equal(drawn.length, rules.rivals.count);
    assert.deepEqual(drawRivals(candidates, 'x', content), drawn);
    assert.deepEqual(drawn.map((one) => one.rating), [...drawn.map((one) => one.rating)].sort((a, b) => b - a));
    for (let seed = 0; seed < 20; seed++) assert.ok(!drawRivals(candidates, `s${seed}`, content, [3]).some((one) => one.id === 3));
    // Few characters: everyone there is, the one just fought too.
    assert.deepEqual(drawRivals(candidates.slice(0, 2), 'x', content, [1]).map((one) => one.id).sort(), [1, 2]);
    assert.deepEqual(drawRivals([], 'x', content), []);
  });

  test('a place on the week\'s table brings its tier\'s Punkty Systemu and gold for the level', () => {
    const tiers = arenaRewardTiers(40, content);
    assert.equal(tiers[0].from, 1);
    for (let i = 1; i < tiers.length; i++) assert.equal(tiers[i].from, tiers[i - 1].to + 1);
    assert.equal(tiers.at(-1).to, null);
    assert.ok(rules.rewards.slice(0, -1).every((tier) => Number.isInteger(tier.upTo)));
    assert.equal(rules.rewards.at(-1).upTo, undefined);
    const [best] = rules.rewards;
    assert.deepEqual(arenaReward(1, 40, content), { systemPoints: best.systemPoints, gold: best.gold.base + best.gold.perLevel * 40 });
    // Down the table, never more.
    for (let place = 2; place < 80; place++) assert.ok(arenaReward(place, 40, content).systemPoints <= arenaReward(place - 1, 40, content).systemPoints);
    assert.deepEqual(arenaReward(500, 40, content), { systemPoints: rules.rewards.at(-1).systemPoints, gold: rules.rewards.at(-1).gold.base + rules.rewards.at(-1).gold.perLevel * 40 });
  });
});

describe('the Arena through the API', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on', ARENA: 'on' });
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  let ala;
  let bolek;

  // A player with a character of `classId` at `level`.
  async function player(login, name, classId, level) {
    const { cookie } = await signUp(login);
    await call('POST', '/api/character', { cookie, body: { name, classId, appearance: 'female' } });
    await run('UPDATE characters SET level = ?, class_level = ?, tutorial = NULL WHERE name = ?', level, level, name);
    const { id } = await first('SELECT id FROM characters WHERE name = ?', name);
    return { cookie, id };
  }
  const arena = (who) => call('GET', '/api/settlement/arena', { cookie: who.cookie });
  const fight = (who, rivalId) => call('POST', '/api/settlement/arena/fight', { cookie: who.cookie, body: { rivalId } });
  const ratingOf = async (who) => (await first('SELECT rating FROM arena_ratings WHERE character_id = ?', who.id))?.rating;

  beforeEach(async () => {
    ala = await player('arenaala', 'Ala', 'warrior', 30);
    bolek = await player('arenabolek', 'Bolek', 'mage', 30);
  });

  test('it opens at the 25th level of the character', async () => {
    await run('UPDATE characters SET level = 24 WHERE id = ?', ala.id);
    const locked = await arena(ala);
    assert.equal(locked.status, 403);
    assert.equal(locked.data.error.code, 'locked');
    await run('UPDATE characters SET level = 25 WHERE id = ?', ala.id);
    const open = await arena(ala);
    assert.equal(open.status, 200, JSON.stringify(open.data).slice(0, 300));
    assert.equal(open.data.arena.rating, content.settlement.arena.rating.start);
    assert.equal(open.data.arena.fights.left, content.settlement.arena.fightsPerDay);
    assert.ok(open.data.arena.texts.fight);
    const settlement = (await call('GET', '/api/settlement', { cookie: ala.cookie })).data.settlement;
    assert.ok(settlement.places.some((place) => place.id === 'arena'));
    // The rules name the share of armour a duel counts at the character's
    // level (772): all of it at the 25th, less higher up.
    assert.equal(open.data.arena.numbers.armor, 100);
    assert.match(open.data.arena.texts.armorRule, /\{armor\}%/);
    await run('UPDATE characters SET level = 100 WHERE id = ?', ala.id);
    assert.equal((await arena(ala)).data.arena.numbers.armor, Math.round(duelArmorShare(100, 100, content) * 100));
  });

  test("rivals are other accounts' characters at the Arena's level, never the player's own", async () => {
    // Ala's account gets a second character; the first waits aside, at level 40.
    await call('POST', '/api/character', { cookie: ala.cookie, body: { name: 'Alicja', classId: 'archer', appearance: 'female' } });
    await run("UPDATE characters SET level = 30, class_level = 30, tutorial = NULL WHERE name = 'Alicja'");
    await run('UPDATE characters SET level = 40 WHERE id = ?', ala.id);
    const own = await first("SELECT id FROM characters WHERE name = 'Alicja'");
    // Below the Arena's level: never a rival.
    await player('arenacezary', 'Cezary', 'archer', 10);
    const view = (await arena({ ...ala, id: own.id })).data.arena;
    assert.deepEqual(view.rivals.map((rival) => rival.name), ['Bolek']);
    assert.equal(view.rivals[0].className, content.classesById.mage.name);
    assert.deepEqual(Object.keys(view.rivals[0].stakes).sort(), ['draw', 'loss', 'win']);
    // Bolek may meet both of Ala's characters, the one aside too.
    const theirs = (await arena(bolek)).data.arena;
    assert.deepEqual(theirs.rivals.map((rival) => rival.name).sort(), ['Ala', 'Alicja']);
    // One not offered cannot be fought.
    const cezary = await first("SELECT id FROM characters WHERE name = 'Cezary'");
    const refused = await fight({ ...ala, id: own.id }, cezary.id);
    assert.equal(refused.status, 409);
    assert.equal(refused.data.error.code, 'gone');
  });

  test('a fight moves both ratings, the defender\'s by less, and the defender hears of it once', async () => {
    await arena(ala);
    const fought = await fight(ala, bolek.id);
    assert.equal(fought.status, 200, JSON.stringify(fought.data).slice(0, 300));
    const { fight: last, arena: after } = fought.data;
    const { start, attackK, defenceK } = content.settlement.arena.rating;
    const expected = { win: [attackK / 2, -defenceK / 2], loss: [-attackK / 2, defenceK / 2], draw: [0, 0] }[last.result];
    assert.deepEqual([last.change, (await ratingOf(bolek)) - start], expected);
    assert.equal(await ratingOf(ala), start + expected[0]);
    assert.equal(after.rating, start + expected[0]);
    assert.equal(after.fights.left, content.settlement.arena.fightsPerDay - 1);
    // Its log for the playback, Bolek among the foes with his look.
    assert.ok(last.fight.events.length > 0);
    assert.equal(last.fight.enemies[0].name, 'Bolek');
    assert.equal(last.fight.enemies[0].classId, 'mage');
    assert.equal(after.last.at, last.at);
    // On this week's table, first or second.
    assert.ok([1, 2].includes(after.place));
    assert.equal(after.table.rows.length, 1);
    // Bolek's next visit tells him, from his side, once.
    const seen = (await arena(bolek)).data.arena;
    assert.equal(seen.defences.length, 1);
    assert.equal(seen.defences[0].name, 'Ala');
    assert.equal(seen.defences[0].result, { win: 'loss', loss: 'win', draw: 'draw' }[last.result]);
    assert.equal(seen.defences[0].change, expected[1]);
    assert.deepEqual((await arena(bolek)).data.arena.defences, []);
  });

  test('five fights a day, then none until midnight', async () => {
    await arena(ala);
    for (let i = 0; i < content.settlement.arena.fightsPerDay; i++) {
      const fought = await fight(ala, bolek.id);
      assert.equal(fought.status, 200, `fight ${i + 1}: ${JSON.stringify(fought.data).slice(0, 200)}`);
      // With nobody else in the Arena, the one just fought comes back.
      assert.deepEqual(fought.data.arena.rivals.map((rival) => rival.id), [bolek.id]);
    }
    const tired = await fight(ala, bolek.id);
    assert.equal(tired.status, 409);
    assert.equal(tired.data.error.code, 'used');
    assert.equal((await arena(ala)).data.arena.fights.left, 0);
    // A new day.
    await run("UPDATE arena_ratings SET day = '2000-01-01' WHERE character_id = ?", ala.id);
    assert.equal((await arena(ala)).data.arena.fights.left, content.settlement.arena.fightsPerDay);
    assert.equal((await fight(ala, bolek.id)).status, 200);
  });

  test("a week's table is frozen once, by rating, and its reward is claimed once", async () => {
    await arena(ala);
    await arena(bolek);
    const week = '2000-01-03';
    await run('UPDATE arena_ratings SET week = ?, rating = 1100 WHERE character_id = ?', week, ala.id);
    await run('UPDATE arena_ratings SET week = ?, rating = 1050 WHERE character_id = ?', week, bolek.id);
    const view = (await arena(ala)).data.arena;
    const frozen = (await (await db()).prepare('SELECT character_id, place, rating FROM arena_weeks WHERE week = ? ORDER BY place').bind(week).all()).results;
    assert.deepEqual(frozen, [
      { character_id: ala.id, place: 1, rating: 1100 },
      { character_id: bolek.id, place: 2, rating: 1050 },
    ]);
    // Not on this week's table until a fight this week.
    assert.equal(view.place, null);
    const reward = arenaReward(1, 30, content);
    assert.deepEqual(view.rewards.due, [{ week, place: 1, ...reward }]);
    // Frozen once: a change after it moves nothing.
    await run('UPDATE arena_ratings SET rating = 900 WHERE character_id = ?', ala.id);
    await arena(bolek);
    assert.equal((await first('SELECT rating FROM arena_weeks WHERE week = ? AND character_id = ?', week, ala.id)).rating, 1100);
    const before = await first('SELECT gold, system_points FROM characters WHERE id = ?', ala.id);
    const claimed = await call('POST', '/api/settlement/arena/claim', { cookie: ala.cookie, body: { week } });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
    const after = await first('SELECT gold, system_points FROM characters WHERE id = ?', ala.id);
    assert.equal(after.gold - before.gold, reward.gold);
    assert.equal(after.system_points - before.system_points, reward.systemPoints);
    assert.deepEqual(claimed.data.arena.rewards.due, []);
    const again = await call('POST', '/api/settlement/arena/claim', { cookie: ala.cookie, body: { week } });
    assert.equal(again.status, 409);
    assert.equal(again.data.error.code, 'no_reward');
    assert.equal((await first('SELECT gold FROM characters WHERE id = ?', ala.id)).gold, after.gold);
  });

  test('a new month moves every rating halfway back to the start', async () => {
    await arena(ala);
    await arena(bolek);
    const { index } = arenaSeason(Date.now(), content);
    await run('UPDATE arena_ratings SET season = ?, rating = 1400 WHERE character_id = ?', index - 1, ala.id);
    await run('UPDATE arena_ratings SET season = ?, rating = 600 WHERE character_id = ?', index - 2, bolek.id);
    assert.equal((await arena(ala)).data.arena.rating, 1200);
    assert.equal(await ratingOf(bolek), 900);
    // Once: the next look moves nothing.
    await arena(bolek);
    assert.equal(await ratingOf(ala), 1200);
    assert.equal(await ratingOf(bolek), 900);
  });

  test("a character removed takes its Arena along", async () => {
    await arena(ala);
    await fight(ala, bolek.id);
    assert.equal((await call('DELETE', '/api/character', { cookie: bolek.cookie })).status, 200);
    assert.equal((await first('SELECT COUNT(*) AS n FROM arena_ratings WHERE character_id = ?', bolek.id)).n, 0);
    assert.equal((await first('SELECT COUNT(*) AS n FROM arena_fights WHERE defender_id = ?', bolek.id)).n, 0);
    assert.deepEqual((await arena(ala)).data.arena.rivals, []);
  });
});

describe('the Arena where ARENA is off', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on' });

  test('nothing of it shows: no place, no unlock, no answer', async () => {
    const { cookie } = await signUp('arenaoff');
    await call('POST', '/api/character', { cookie, body: { name: 'Bez Areny', classId: 'warrior', appearance: 'male' } });
    await (await db()).prepare('UPDATE characters SET level = 40, class_level = 40, tutorial = NULL').run();
    const { data } = await call('GET', '/api/content');
    assert.ok(!data.settlementPlaces.some((place) => place.id === 'arena'));
    assert.ok(!data.unlocks.some((unlock) => unlock.id === 'arena'));
    const settlement = (await call('GET', '/api/settlement', { cookie })).data.settlement;
    assert.ok(!settlement.places.some((place) => place.id === 'arena'));
    const character = (await call('GET', '/api/character', { cookie })).data.character;
    assert.ok(!character.features.includes('arena'));
    const look = await call('GET', '/api/settlement/arena', { cookie });
    assert.equal(look.status, 404);
    assert.equal((await call('POST', '/api/settlement/arena/fight', { cookie, body: { rivalId: 1 } })).status, 404);
    assert.equal((await call('POST', '/api/settlement/arena/claim', { cookie, body: { week: '2000-01-03' } })).status, 404);
  });
});

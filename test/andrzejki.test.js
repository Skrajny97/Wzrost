// Andrzejki: Wieczór wróżb (1082 C, 1083 C, 1084 A and B; data/winter.json,
// `andrzejki`): the wax on 29 November from 18:00, the three cups on the
// 30th, a fortune once each evening; the omen's premium for a day as a week's
// effect of the character's own, its small reward at once, and for both
// evenings of a year the portrait's background and the achievement's feat.
// The evening is at the Zaklinaczka's in the Osada (24.11.2026), so only a
// character that has the Osada tells its fortune, and with the omen come
// one of the fortunes' words for the player, drawn from the same seed and
// kept with the fortune. Where ANDRZEJKI is "test" every day is an evening,
// an odd one the wax.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { andrzejkiEvening, bothEvenings, drawFortune, fortuneWords, omenEffects, omenReward, withFortune } from '../src/engine/andrzejki.js';
import { questPeriod } from '../src/engine/quests.js';
import { createRng } from '../src/engine/rng.js';
import { weekFactor } from '../src/engine/weeks.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const HOUR = 3600000;
const rules = content.winter.andrzejki;
// The start of a Polish day of November 2026 and of the next.
const day = (date) => questPeriod('daily', Date.UTC(2026, 10, date, 11), content);

describe('the fortune evenings of Andrzejki (engine)', () => {
  test('the wax on 29 November from 18:00, the cups all of the 30th; on test every day, an odd one the wax', () => {
    const eve = day(29);
    assert.equal(andrzejkiEvening(eve, eve.startsAt + 17 * HOUR + 59 * 60000, rules), null);
    assert.deepEqual(andrzejkiEvening(eve, eve.startsAt + 18 * HOUR, rules), { key: '2026-11-29', kind: 'wax', opensAt: eve.startsAt + 18 * HOUR, endsAt: eve.endsAt });
    const next = day(30);
    assert.equal(andrzejkiEvening(next, next.startsAt, rules).kind, 'cups');
    assert.equal(andrzejkiEvening(day(28), day(28).startsAt + 20 * HOUR, rules), null);
    assert.equal(andrzejkiEvening(day(17), day(17).startsAt + HOUR, rules, true).kind, 'wax');
    assert.equal(andrzejkiEvening(day(18), day(18).startsAt + HOUR, rules, true).kind, 'cups');
  });

  test('an omen from the seed, its premium for 24 hours as a week effect, and its reward', () => {
    assert.equal(drawFortune('a', rules).omen.id, drawFortune('a', rules).omen.id);
    assert.equal(new Set(Array.from({ length: 200 }, (_, index) => drawFortune(`seed-${index}`, rules).omen.id)).size, rules.omens.length);
    const at = day(29).startsAt + 19 * HOUR;
    const stored = withFortune(null, '2026-11-29', { omen: 'dragon', kind: 'wax', at });
    assert.deepEqual(omenEffects(stored, at + HOUR, rules), [{ kind: 'xp', value: 10, omen: 'dragon', until: at + 24 * HOUR }]);
    assert.deepEqual(omenEffects(stored, at + 24 * HOUR, rules), []);
    assert.equal(weekFactor({ effects: [{ kind: 'xp', value: 5 }, ...omenEffects(stored, at, rules)] }, 'xp'), 1.15);
    const purse = rules.omens.find((omen) => omen.id === 'purse');
    assert.ok(omenReward(purse, 50, rules, content).gold > 0);
    assert.deepEqual(omenReward(rules.omens.find((omen) => omen.id === 'dragon'), 50, rules, content), { timePoints: 25, gold: 0, packs: 0 });
    // Both evenings of a year, and a new year forgets the old one.
    const both = withFortune(stored, '2026-11-30', { omen: 'key', kind: 'cups', at: at + 20 * HOUR });
    assert.equal(bothEvenings(stored, '2026-11-29', rules), false);
    assert.equal(bothEvenings(both, '2026-11-30', rules), true);
    assert.deepEqual(Object.keys(withFortune(both, '2027-11-29', { omen: 'star', kind: 'wax', at })), ['2027-11-29']);
  });

  // The author, 24.11.2026: „Takie skierowane do gracza nie do postaci
  // nawet, subtelnie przełamujące czwartą ścianę”.
  test("the fortune's words come with the omen from the same seed, the omen as before them", () => {
    const seed = 'andrzejki:7:2026-11-29:0';
    const drawn = drawFortune(seed, rules);
    assert.deepEqual(drawFortune(seed, rules), drawn);
    assert.equal(drawn.omen.id, createRng(seed).pick(rules.omens).id);
    assert.equal(rules.fortunes.length, 40);
    assert.ok(Number.isInteger(drawn.line) && drawn.line >= 0 && drawn.line < rules.fortunes.length);
    // Every one of the words comes out, so two evenings or two cups may
    // tell different ones.
    assert.equal(new Set(Array.from({ length: 2000 }, (_, index) => drawFortune(`seed-${index}`, rules).line)).size, rules.fortunes.length);
    // A fortune's words by its line; none for one told before they came.
    assert.equal(fortuneWords({ omen: 'dragon', kind: 'wax', at: 0, line: 3 }, rules), rules.fortunes[3]);
    assert.equal(fortuneWords({ omen: 'dragon', kind: 'wax', at: 0 }, rules), null);
    assert.equal(fortuneWords({ omen: 'dragon', kind: 'wax', at: 0, line: rules.fortunes.length }, rules), null);
    assert.equal(drawFortune(seed, { ...rules, fortunes: [] }).line, null);
  });
});

describe('the fortune evenings of Andrzejki through the API', () => {
  // The Osada on, as in the game: the evening is held there.
  const { call, db, signUp } = useServer({ TEST_CLOCK: 'on', WEEKS: 'on', SETTLEMENT: 'on' });
  let cookie;
  const eve = day(29).startsAt + 19 * HOUR;
  const next = day(30).startsAt + 10 * HOUR;
  const row = async () => (await db()).prepare('SELECT gold, time_points, card_packs, cosmetics, feats, andrzejki FROM characters WHERE name = ?').bind('Wróżka').first();

  beforeEach(async () => {
    ({ cookie } = await signUp('wrozka'));
    await call('POST', '/api/character', { cookie, body: { name: 'Wróżka', classId: 'mage', appearance: 'female' } });
    await (await db()).prepare("UPDATE characters SET level = 40 WHERE name = 'Wróżka'").run();
    await (await db()).prepare('UPDATE sessions SET expires_at = ?').bind(Date.UTC(2027, 1, 1)).run();
  });

  test('no evening before 18:00 on the 29th; then the wax once, with its omen running for a day', async () => {
    const before = await call('GET', '/api/character', { cookie, now: eve - 2 * HOUR });
    assert.equal(before.data.character.andrzejki, null);
    assert.equal((await call('POST', '/api/andrzejki', { cookie, now: eve - 2 * HOUR, body: {} })).data.error.code, 'andrzejki_closed');
    const view = (await call('GET', '/api/character', { cookie, now: eve })).data.character.andrzejki;
    assert.deepEqual([view.evening.kind, view.evening.told, view.active, view.both], ['wax', null, [], false]);
    const was = await row();
    const told = await call('POST', '/api/andrzejki', { cookie, now: eve, body: {} });
    assert.equal(told.status, 200);
    const { omen, reward } = told.data.fortune;
    assert.ok(rules.omens.some((one) => one.id === omen.id));
    const now = await row();
    assert.deepEqual([now.gold - was.gold, now.time_points - was.time_points, now.card_packs - was.card_packs], [reward.gold, reward.timePoints, reward.packs]);
    assert.equal(told.data.andrzejki.evening.told.id, omen.id);
    assert.deepEqual(told.data.andrzejki.active.map((one) => [one.id, one.until]), [[omen.id, eve + 24 * HOUR]]);
    // The fortune's words with the omen, from the same seed, their line kept
    // with the fortune: coming back that evening shows the same.
    const { id } = await (await db()).prepare("SELECT id FROM characters WHERE name = 'Wróżka'").first();
    const drawn = drawFortune(`andrzejki:${id}:2026-11-29:0`, rules);
    assert.equal(omen.id, drawn.omen.id);
    assert.equal(JSON.parse(now.andrzejki)['2026-11-29'].line, drawn.line);
    assert.equal(told.data.fortune.line, rules.fortunes[drawn.line]);
    assert.equal(told.data.andrzejki.evening.told.line, rules.fortunes[drawn.line]);
    assert.equal((await call('GET', '/api/character', { cookie, now: eve + 3 * HOUR })).data.character.andrzejki.evening.told.line, rules.fortunes[drawn.line]);
    // Once an evening.
    assert.equal((await call('POST', '/api/andrzejki', { cookie, now: eve + HOUR, body: {} })).data.error.code, 'andrzejki_told');
    // The omen runs into the cups' evening, still untold, and ends after a
    // day; on 1 December there is nothing.
    const morning = (await call('GET', '/api/character', { cookie, now: next })).data.character.andrzejki;
    assert.deepEqual([morning.evening.kind, morning.evening.told, morning.active.length], ['cups', null, 1]);
    assert.equal((await call('GET', '/api/character', { cookie, now: eve + 24 * HOUR })).data.character.andrzejki.active.length, 0);
    assert.equal((await call('GET', '/api/character', { cookie, now: day(30).endsAt + HOUR })).data.character.andrzejki, null);
  });

  // The author, 24.11.2026: „Niech będzie dla graczy od 20 poziomu, bo 20
  // poziom to i w jedną dobę można wbić”: below the Osada's level the
  // evening says where it is and from what level, and nothing is told.
  test("only a character that has the Osada tells its fortune: below its level the evening's own words", async () => {
    const level = content.unlocksById.settlement.level;
    await (await db()).prepare("UPDATE characters SET level = ? WHERE name = 'Wróżka'").bind(level - 1).run();
    const was = await row();
    const refused = await call('POST', '/api/andrzejki', { cookie, now: eve, body: {} });
    assert.equal(refused.status, 403);
    assert.equal(refused.data.error.code, 'andrzejki_locked');
    assert.equal(refused.data.error.message, `Wieczór wróżb czeka u Zaklinaczki w Osadzie, a Osadę odblokujesz na poziomie postaci ${level}.`);
    // Nothing told and nothing given (the Punkty Czasu, which grow with the
    // time anyway, left out).
    const given = ({ time_points: _, ...rest }) => rest;
    const after = await row();
    assert.equal(after.andrzejki, null);
    assert.deepEqual(given(after), given(was));
    await (await db()).prepare("UPDATE characters SET level = ? WHERE name = 'Wróżka'").bind(level).run();
    assert.equal((await call('POST', '/api/andrzejki', { cookie, now: eve, body: {} })).status, 200);
  });

  test('the cups on the 30th need a cup; both evenings give the background and the feat, once', async () => {
    await call('POST', '/api/andrzejki', { cookie, now: eve, body: {} });
    assert.equal((await call('POST', '/api/andrzejki', { cookie, now: next, body: {} })).data.error.code, 'invalid_cup');
    assert.equal((await call('POST', '/api/andrzejki', { cookie, now: next, body: { cup: 4 } })).data.error.code, 'invalid_cup');
    const told = await call('POST', '/api/andrzejki', { cookie, now: next, body: { cup: 2 } });
    assert.equal(told.status, 200);
    assert.equal(told.data.fortune.both, true);
    assert.equal(told.data.andrzejki.evening.told.cup, 2);
    assert.equal(told.data.andrzejki.both, true);
    const now = await row();
    assert.ok(JSON.parse(now.cosmetics).owned.includes(rules.background));
    assert.equal(JSON.parse(now.feats)[rules.feat], 1);
    const fortunes = JSON.parse(now.andrzejki);
    assert.deepEqual(Object.keys(fortunes).sort(), ['2026-11-29', '2026-11-30']);
    // Each evening its own words, drawn with its own seed (the cup's too).
    const { id } = await (await db()).prepare("SELECT id FROM characters WHERE name = 'Wróżka'").first();
    assert.deepEqual(
      [fortunes['2026-11-29'].line, fortunes['2026-11-30'].line],
      [drawFortune(`andrzejki:${id}:2026-11-29:0`, rules).line, drawFortune(`andrzejki:${id}:2026-11-30:2`, rules).line],
    );
    assert.equal(told.data.andrzejki.evening.told.line, rules.fortunes[fortunes['2026-11-30'].line]);
    // The achievement is there to take, with its title.
    const achievements = await call('GET', '/api/achievements', { cookie, now: next });
    assert.ok(achievements.data.fresh.some((one) => one.title === 'Wróżka'));
  });

  test("an exploration begun while an omen runs keeps it with the week's effects, marked", async () => {
    await (await db()).prepare("UPDATE characters SET andrzejki = ? WHERE name = 'Wróżka'").bind(JSON.stringify({ '2026-11-29': { omen: 'dragon', kind: 'wax', at: eve } })).run();
    // A fortune told before the words came shows none.
    const view = (await call('GET', '/api/character', { cookie, now: eve + HOUR })).data.character.andrzejki;
    assert.deepEqual([view.evening.told.id, view.evening.told.line], ['dragon', null]);
    assert.equal((await call('POST', '/api/hunts', { cookie, now: eve + HOUR, body: { areaId: 'windfalls-edge', minutes: 10 } })).status, 201);
    const { options } = await (await db()).prepare('SELECT options FROM activities').first();
    const { week } = JSON.parse(options);
    assert.deepEqual(week.effects.filter((effect) => effect.omen), [{ kind: 'xp', value: 10, omen: 'dragon' }]);
    assert.ok(Math.abs(weekFactor(week, 'xp') - weekFactor({ effects: week.effects.filter((effect) => !effect.omen) }, 'xp') - 0.1) < 1e-9);
  });
});

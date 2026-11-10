// The weeks of the year (data/weeks.json, src/engine/weeks.js,
// src/server/weeks.js; the author, 10.11.2026: „buffy i debuffy obszarowe
// tygodniowe dla każdego gracza w zależności jaki tydzień jest [...]
// Tygodniowe bonusy ustawione na stało na sztywno.”): the week is the ISO
// week of the date on the Polish clock, from Monday midnight, an ISO week 53
// taking week 52's entry; each kind of effect works where it belongs, once;
// an exploration and a profession's work keep the week they set out in.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  applyHunt,
  collect,
  collectorTakes,
  companionAfterHunt,
  computeStats,
  createRng,
  deliverOrder,
  drawCandidates,
  emptyBoard,
  expectedHerbs,
  faintForfeit,
  gatherHerbs,
  huntReport,
  isoWeek,
  mineMinerals,
  playerCombatant,
  portalAmount,
  portalById,
  portalFight,
  professionProgress,
  raisedOutcome,
  regenPerMinute,
  resolveEvent,
  restedHp,
  rollUpgrade,
  settleBoard,
  simulateHunt,
  talkWith,
  towerFight,
  tradePoints,
  upgradeChance,
  upgradeView,
  weekAt,
  weekChance,
  weekCount,
  weekEffectText,
  weekFactor,
  weekFighter,
  weekLine,
  weekRest,
  weekView,
  workProfession,
} from '../src/engine/index.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { strongClimber } from './helpers/climb.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const at = (date) => weekAt(Date.parse(date), content);
// A week of one effect, as an activity keeps it.
const week = (kind, value, stat) => ({ number: 1, effects: [{ kind, value, ...(stat && { stat }) }] });
const kept = (number) => ({ number, effects: content.weeksByNumber[number].effects });
const close = (actual, expected, margin = 1e-9) => assert.ok(Math.abs(actual - expected) <= margin, `${actual} vs ${expected}`);

describe('the week of the year', () => {
  test('is the ISO week of the date on the Polish clock, from Monday midnight to Sunday 23:59', () => {
    assert.equal(at('2026-11-10T12:00:00+01:00').number, 46);
    assert.equal(at('2026-11-10T12:00:00+01:00').week.number, 46);
    assert.equal(content.weeksByNumber[46].name, 'Tydzień Sarny');
    assert.equal(at('2026-11-15T23:59:59.999+01:00').iso, 46);
    assert.equal(at('2026-11-16T00:00:00.000+01:00').iso, 47);
    // In UTC it is still Sunday, in Poland already Monday.
    assert.equal(at('2026-11-15T23:30:00Z').iso, 47);
    assert.equal(at('2026-11-15T22:59:59.999Z').iso, 46);
    // Summer time.
    assert.equal(at('2026-06-07T23:59:59.999+02:00').iso, 23);
    assert.equal(at('2026-06-08T00:00:00+02:00').iso, 24);
    // A week runs from Monday midnight to the next, on the Polish clock,
    // one hour shorter when the clocks go forward on its Sunday.
    const november = at('2026-11-10T12:00:00+01:00');
    assert.equal(november.startsAt, Date.parse('2026-11-09T00:00:00+01:00'));
    assert.equal(november.endsAt, Date.parse('2026-11-16T00:00:00+01:00'));
    const spring = at('2026-03-27T12:00:00+01:00');
    assert.equal(spring.startsAt, Date.parse('2026-03-23T00:00:00+01:00'));
    assert.equal(spring.endsAt, Date.parse('2026-03-30T00:00:00+02:00'));
    assert.equal(spring.endsAt - spring.startsAt, 167 * 3600000);
  });

  test('turns with the year as ISO weeks do, and an ISO week 53 takes week 52', () => {
    assert.deepEqual(isoWeek(2020, 12, 31), { isoYear: 2020, iso: 53 });
    assert.deepEqual(isoWeek(2021, 1, 3), { isoYear: 2020, iso: 53 });
    assert.deepEqual(isoWeek(2021, 1, 4), { isoYear: 2021, iso: 1 });
    // 1 January 2026 is a Thursday: its week, from 29 December, is the first.
    assert.equal(at('2025-12-28T23:59:59.999+01:00').iso, 52);
    assert.deepEqual([at('2025-12-29T00:00:00+01:00').iso, at('2025-12-29T00:00:00+01:00').isoYear], [1, 2026]);
    // 2026 has 53 weeks: the last takes the entry of week 52.
    const last = at('2026-12-28T00:00:00+01:00');
    assert.deepEqual([last.iso, last.isoYear, last.number], [53, 2026, 52]);
    assert.deepEqual(last.week, kept(52));
    assert.equal(content.weeksByNumber[last.number].name, 'Tydzień Godów');
    assert.equal(at('2027-01-03T23:59:59.999+01:00').iso, 53);
    assert.deepEqual([at('2027-01-04T00:00:00+01:00').iso, at('2027-01-04T00:00:00+01:00').number], [1, 1]);
    // The page's three next weeks run on through week 53.
    const view = weekView(Date.parse('2026-12-23T12:00:00+01:00'), content);
    assert.deepEqual([view.number, ...view.next.map((one) => one.iso)], [52, 53, 1, 2]);
    assert.deepEqual(view.next.map((one) => one.number), [52, 1, 2]);
    assert.equal(view.next[0].startsAt, view.endsAt);
    assert.equal(view.next[1].startsAt, view.next[0].endsAt);
  });

  test('52 weeks, each number once, 44 with a bonus and 8 with a bonus and a small malus, in words', () => {
    const { weeks } = content.weeks;
    assert.deepEqual(weeks.map((one) => one.number), Array.from({ length: 52 }, (_, index) => index + 1));
    assert.equal(weeks.filter((one) => one.effects.length === 1 && one.effects[0].value > 0).length, 44);
    assert.equal(weeks.filter((one) => one.effects.length === 2 && one.effects[0].value > 0 && one.effects[1].value < 0).length, 8);
    assert.equal(weekEffectText({ kind: 'rest', value: 5 }, content), 'odpoczynek szybszy o 5%');
    assert.equal(weekEffectText({ kind: 'gold', value: 5 }, content, true), '+5% złota z walk');
    assert.equal(weekEffectText({ kind: 'stat', stat: 'strength', value: 5 }, content), 'o 5% więcej Siły w walkach');
    assert.equal(weekEffectText({ kind: 'camp', value: -5 }, content), 'budynki Obozu dają o 5% mniej');
    assert.equal(weekEffectText({ kind: 'camp', value: -5 }, content, true), '−5% z budynków Obozu');
  });

  test('a factor is 1 and the share of its kind; a chance at most certain; a count made whole fairly', () => {
    assert.equal(weekFactor(null, 'xp'), 1);
    assert.equal(weekFactor(week('xp', 5), 'xp'), 1.05);
    assert.equal(weekFactor(week('xp', 5), 'gold'), 1);
    assert.equal(weekFactor(kept(17), 'items'), 0.95);
    assert.equal(weekChance(0.5, week('items', 10), 'items'), 0.55);
    assert.equal(weekChance(0.95, week('upgrade', 10), 'upgrade'), 1);
    assert.equal(weekCount(7, 1, 'x'), 7);
    let sum = 0;
    for (let index = 0; index < 2000; index += 1) {
      const count = weekCount(3, 1.05, `fair:${index}`);
      assert.ok(count === 3 || count === 4);
      sum += count;
    }
    close(sum / 2000, 3.15, 0.03);
    // The chest's chance among the finds, the others sharing the rest.
    const outcomes = Object.entries(content.balance.rewards.findOutcomes);
    const total = outcomes.reduce((all, [, weight]) => all + weight, 0);
    const raised = raisedOutcome(outcomes, 'chest', 1.5);
    close(raised.reduce((all, [, weight]) => all + weight, 0), total);
    close(raised.find(([id]) => id === 'chest')[1] / total, (1.5 * content.balance.rewards.findOutcomes.chest) / total);
    assert.equal(raisedOutcome(outcomes, 'chest', 1), outcomes);
  });
});

describe('the week in fights', () => {
  // A strong character in an easy place, so every fight is won; the loot's
  // own seed keeps the gold's draws the same.
  const settled = typicalCharacter('warrior', 40, content);
  const setOut = (more = {}) => simulateHunt({ ...settled, hp: 99999, name: 'Mira', areaId: 'raven-hollows', minutes: 1, seed: 'tydzień', lootSeed: 'łup', ...more }, content);

  test('an exploration: its share of the fights\' XP and gold, and nothing else changes', () => {
    const plain = setOut();
    assert.equal(plain.fights[0].won, true);
    const xp = setOut({ week: week('xp', 50) });
    const gold = setOut({ week: week('gold', 50) });
    for (const hunt of [xp, gold]) {
      assert.deepEqual(hunt.fights[0].events, plain.fights[0].events);
      assert.deepEqual(hunt.materials, plain.materials);
      assert.deepEqual(hunt.items, plain.items);
    }
    assert.ok(Math.abs(xp.fights[0].xp - plain.fights[0].xp * 1.5) <= 1, `${xp.fights[0].xp} vs ${plain.fights[0].xp}`);
    assert.equal(xp.fights[0].gold, plain.fights[0].gold);
    assert.ok(Math.abs(gold.fights[0].gold - plain.fights[0].gold * 1.5) <= 1.5, `${gold.fights[0].gold} vs ${plain.fights[0].gold}`);
    assert.equal(gold.fights[0].xp, plain.fights[0].xp);
    assert.deepEqual(xp.week, week('xp', 50));
    assert.equal(plain.week, undefined);
  });

  test('items: the chance of a chest among the finds, never or always at the ends', () => {
    const finds = (hunt) => hunt.entries.filter((entry) => entry.type === 'find');
    const long = (share) => setOut({ minutes: 240, seed: 'skrzynie', lootSeed: null, week: week('items', share) });
    const none = finds(long(-100));
    const all = finds(long(400));
    assert.ok(none.length > 3 && all.length > 3);
    assert.ok(none.every((entry) => entry.item === undefined));
    assert.ok(all.every((entry) => entry.item !== undefined));
    // A champion's chest too.
    assert.equal(weekChance(content.balance.rewards.championItemChance, week('items', 100), 'items'), 1);
  });

  test('materials: more pieces from the creatures', () => {
    const count = (hunt) => Object.values(hunt.materials).reduce((sum, pieces) => sum + pieces, 0);
    let plain = 0;
    let more = 0;
    for (let index = 0; index < 10; index += 1) {
      plain += count(setOut({ minutes: 120, seed: `materiały-${index}`, lootSeed: null }));
      more += count(setOut({ minutes: 120, seed: `materiały-${index}`, lootSeed: null, week: week('materials', 100) }));
    }
    assert.ok(plain > 0 && more > plain * 1.5, `${more} vs ${plain}`);
  });

  test('a stat: the share of it in fights, a malus too, nothing outside fights', () => {
    const { character, equipped } = settled;
    const { totals } = computeStats(character, equipped, content);
    const plain = playerCombatant({ character, equipped, name: 'Mira' }, content);
    const strong = playerCombatant({ character: weekFighter(character, week('stat', 50, 'strength')), equipped, name: 'Mira' }, content);
    assert.equal(plain.scalingValue, totals.strength);
    assert.equal(strong.scalingValue, Math.round(totals.strength * 1.5));
    const heat = playerCombatant({ character: weekFighter(character, kept(27)), equipped, name: 'Mira' }, content);
    assert.ok(heat.armor < plain.armor, `${heat.armor} vs ${plain.armor}`);
    assert.equal(weekFighter(character, week('xp', 5)), character);
    // A focus potion's share adds up with the week's.
    const both = playerCombatant({ character: weekFighter(character, week('stat', 50, 'intellect')), equipped, name: 'Mira', statBoost: { intellect: 0.5 } }, content);
    assert.equal(both.maxMana >= plain.maxMana, true);
    // A week of Witalność sets out with the same share of the HP, a full
    // character at full HP.
    const vital = setOut({ hp: plain.maxHp, week: week('stat', 50, 'vitality') });
    assert.ok(vital.maxHp > plain.maxHp);
    assert.equal(vital.hpStart, vital.maxHp);
    const half = setOut({ hp: Math.round(plain.maxHp / 2), week: week('stat', 50, 'vitality') });
    close(half.hpStart / half.maxHp, 0.5, 0.01);
  });

  test('the report names the week where its effects changed the result, a faint only its stats', () => {
    const report = (hunt) =>
      huntReport({ hunt, applied: applyHunt(settled.character, hunt, content), character: settled.character, areaId: 'raven-hollows', startedAt: 0, endsAt: 1 }, content);
    const marten = setOut({ minutes: 30, seed: 'kuna', week: kept(3) });
    assert.ok(marten.gold > 0);
    assert.ok(report(marten).system.includes('Tydzień Kuny: +5% złota z walk.'), report(marten).system.join(' | '));
    // Resting changes nothing of an exploration.
    const deer = setOut({ minutes: 30, seed: 'kuna', week: kept(46) });
    assert.equal(weekLine(deer, content), null);
    assert.ok(!report(deer).system.some((line) => line.startsWith('Tydzień')));
    // Two effects, a bonus and a malus, as they changed it.
    const mist = setOut({ minutes: 30, seed: 'kuna', week: kept(43) });
    assert.equal(weekLine(mist, content), 'Tydzień Mgły: +5% złota z walk, −5% Percepcji w walkach.');
    // A faint loses everything but the fights.
    assert.equal(weekLine(faintForfeit({ ...marten, result: 'fainted' }), content), null);
    assert.equal(weekLine(faintForfeit({ ...marten, result: 'fainted', week: kept(2) }), content), 'Tydzień Wilka: +5% Siły w walkach.');
    assert.equal(weekLine({ ...marten, week: undefined }, content), null);
  });

  test("an event's fight takes the exploration's week: XP, gold, the foes' items and the stats", () => {
    const { character, equipped } = typicalCharacter('warrior', 8, content);
    const seed = 'zdarzenie';
    const base = simulateHunt({ character, equipped, hp: 9999, name: 'Mira', areaId: 'windfalls-edge', minutes: 60, seed }, content);
    const help = (hunt) =>
      resolveEvent({ hunt, event: content.eventsById['wounded-woman'], optionId: 'help', caseId: 'ambush', character, equipped, name: 'Mira', seed }, content).fights.at(-1);
    const plain = help(base);
    assert.equal(plain.won, true);
    const xp = help({ ...base, week: week('xp', 50) });
    const gold = help({ ...base, week: week('gold', 50) });
    assert.deepEqual(xp.events, plain.events);
    assert.ok(Math.abs(xp.xp - plain.xp * 1.5) <= 1, `${xp.xp} vs ${plain.xp}`);
    assert.ok(Math.abs(gold.gold - plain.gold * 1.5) <= 1, `${gold.gold} vs ${plain.gold}`);
  });

  test('a Wieża: its share of the win\'s XP, gold and materials', () => {
    const climber = strongClimber();
    const enter = (more = {}) => towerFight({ ...climber, name: 'Mira', floor: 1, seed: 'wieża', ...more }, content);
    const plain = enter();
    assert.equal(plain.tower.won, true);
    const xp = enter({ week: week('xp', 50) });
    const gold = enter({ week: week('gold', 50) });
    assert.ok(Math.abs(xp.xp - plain.xp * 1.5) <= 1, `${xp.xp} vs ${plain.xp}`);
    assert.equal(gold.gold, Math.round(plain.gold * 1.5));
    const pieces = (hunt) => Object.values(hunt.materials).reduce((sum, count) => sum + count, 0);
    assert.ok(pieces(enter({ week: week('materials', 100) })) >= 2 * pieces(plain) - 1);
    assert.deepEqual(gold.week, week('gold', 50));
  });

  test("a Portal's fight: its share of a Portal Złota's gold and a Portal Materiałów's pieces", () => {
    const climber = strongClimber();
    const enter = (portalId, more = {}) => portalFight({ ...climber, name: 'Mira', portalId, stage: 10, first: true, seed: 'portal', ...more }, content);
    const amount = portalAmount(portalById('gold', content), 10, true, content);
    const plain = enter('gold');
    assert.equal(plain.portal.won, true);
    assert.equal(plain.gold, amount);
    const gold = enter('gold', { week: week('gold', 50) });
    assert.ok([Math.floor(amount * 1.5), Math.ceil(amount * 1.5)].includes(gold.gold), `${gold.gold} vs ${amount}`);
    const pieces = (hunt) => Object.values(hunt.materials).reduce((sum, count) => sum + count, 0);
    assert.equal(pieces(enter('materials', { week: week('materials', 100) })), 2 * pieces(enter('materials')));
    // The wood portal pays as ever.
    assert.deepEqual(enter('wood', { week: week('gold', 50) }).resources, enter('wood').resources);
  });
});

describe('the week outside fights', () => {
  const NOW = Date.parse('2026-11-10T12:00:00+01:00');

  test("professions: a work's XP, the herbs gathered and the minerals dug, not the veins' gold", () => {
    const herbalism = content.professionsById.herbalism;
    const before = { level: 1, xp: 0 };
    const after = workProfession(herbalism, before, 60, 1.05);
    assert.equal(after.gained, 63);
    assert.equal(professionProgress(herbalism, before, after, 60).xp, 63);
    assert.equal(workProfession(herbalism, before, 60).gained, 60);
    assert.equal(professionProgress(herbalism, before, { level: 1, xp: 60 }, 60).xp, 60);
    close(expectedHerbs(['comfrey'], 60, 1, content, 0, 1.05).comfrey.expected, expectedHerbs(['comfrey'], 60, 1, content).comfrey.expected * 1.05);
    const herbs = (factor) => [...Array(20).keys()].reduce((sum, index) => sum + gatherHerbs({ herbIds: ['comfrey'], minutes: 120, level: 1, seed: `zioła-${index}`, week: factor }, content).comfrey, 0);
    assert.ok(herbs(2) > herbs(1) * 1.7, `${herbs(2)} vs ${herbs(1)}`);
    const dig = (factor) => mineMinerals({ minutes: 120, level: 1, characterLevel: 30, seed: 'kopalnia', week: factor }, content);
    const plain = dig(1);
    const doubled = dig(2);
    const pieces = (mined) => Object.values(mined.found).reduce((sum, count) => sum + count, 0);
    assert.ok(pieces(doubled) > pieces(plain) * 1.5, `${pieces(doubled)} vs ${pieces(plain)}`);
    assert.equal(doubled.gold, plain.gold);
    assert.equal(doubled.veins, plain.veins);
  });

  test("the camp: a collection's units with the week's share, made whole fairly, production going on as ever", () => {
    const sawmill = content.buildingsById.sawmill;
    const stored = { level: 5, startedAt: 0, endsAt: 0, collectedAt: 0 };
    const plain = collect(sawmill, stored, 3600000);
    const more = collect(sawmill, stored, 3600000, 1.5);
    assert.equal(more.collectedAt, plain.collectedAt);
    assert.ok([Math.floor(plain.amount * 1.5), Math.ceil(plain.amount * 1.5)].includes(more.amount), `${more.amount} vs ${plain.amount}`);
    // A small collection gets its share on average, not lost to rounding.
    let sum = 0;
    for (let minute = 10; minute < 410; minute += 1) sum += collect(sawmill, stored, minute * 60000 + 1, 1.05)?.amount ?? 0;
    let base = 0;
    for (let minute = 10; minute < 410; minute += 1) base += collect(sawmill, stored, minute * 60000 + 1)?.amount ?? 0;
    close(sum / base, 1.05, 0.03);
    // The Zbieracz Systemu's too.
    const every = content.camp.collector.everySeconds * 1000;
    const taken = collectorTakes(sawmill, stored, 3 * 3600000, 0, every, 2);
    assert.equal(taken.amount, 2 * collectorTakes(sawmill, stored, 3 * 3600000, 0, every).amount);
  });

  test('resting: faster or slower by the week of each moment, the camp\'s bonus with it', () => {
    // 15 November is the last day of the Tydzień Sarny (rest +5%), and the
    // Tydzień Kleszcza (rest −5%) follows.
    const sunday = Date.parse('2026-11-15T23:50:00+01:00');
    const monday = Date.parse('2026-11-16T00:00:00+01:00');
    const later = Date.parse('2026-11-16T00:05:00+01:00');
    const rest = weekRest({ bonus: 0.2 }, sunday, later, content);
    close(rest.bonus, 1.2 * 1.05 - 1);
    assert.equal(rest.change.at, monday);
    close(rest.change.bonus, 1.2 * 0.95 - 1);
    const per = (bonus) => regenPerMinute(10000, 0, content, bonus);
    assert.equal(restedHp({ hp: 100, since: sunday, now: later, maxHp: 10000, vitality: 0, ...rest }, content), Math.floor(100 + per(rest.bonus) * 10 + per(rest.change.bonus) * 5));
    // Within a week only its factor; a week without a rest effect leaves
    // the camp's bonus as it is.
    assert.equal(weekRest({ bonus: 0.2 }, NOW, NOW + 1800000, content).change, undefined);
    close(weekRest({ bonus: 0.2 }, NOW, NOW + 1800000, content).bonus, 0.26);
    const plainWeek = Date.parse('2026-11-25T12:00:00+01:00');
    assert.deepEqual(weekRest({ bonus: 0.2 }, plainWeek, plainWeek + 1800000, content), { bonus: 0.2 });
    // A new camp bonus within the week keeps its moment.
    const upgraded = weekRest({ bonus: 0.1, change: { at: NOW + 600000, bonus: 0.3 } }, NOW, NOW + 1800000, content);
    close(upgraded.bonus, 1.1 * 1.05 - 1);
    assert.equal(upgraded.change.at, NOW + 600000);
    close(upgraded.change.bonus, 1.3 * 1.05 - 1);
  });

  test("the Kowadło: the chance of an upgrade times the week's, at most certain", () => {
    close(upgradeChance(4, content, 1.05), 0.75 * 1.05);
    assert.equal(upgradeChance(1, content, 1.1), 1);
    assert.equal(upgradeChance(4, content), 0.75);
    // A roll between the two chances fails without the week and comes off with it.
    let index = 0;
    while (!((roll) => roll >= 0.75 && roll < 0.7875)(createRng(`kowadło-${index}`).next())) index += 1;
    const item = { base: 'sword', slot: 'weapon', level: 20, rarity: 'common', affixes: [], upgrade: 3 };
    assert.equal(rollUpgrade(item, createRng(`kowadło-${index}`), content).result, 'failure');
    assert.equal(rollUpgrade(item, createRng(`kowadło-${index}`), content, { week: 1.05 }).result, 'success');
    close(upgradeView(item, 10, content, null, 0, 1.05).next.chance, 0.7875);
  });

  test("reputation: the brotherhoods' from trades and orders, not an event's reward its text names, and the companions' relation", () => {
    const tuning = content.settlement.herbalist.reputation;
    const gold = tuning.goldPerPointPerLevel * 10 * 4;
    const plain = tradePoints(gold, 10, null, NOW, content);
    assert.deepEqual([plain.points, plain.reputation], [4, 4]);
    const doubled = tradePoints(gold, 10, null, NOW, content, tuning, week('reputation', 100));
    assert.deepEqual([doubled.points, doubled.reputation, doubled.trade], [4, 8, plain.trade]);
    // An order.
    const character = newCharacter('warrior', { level: 20, classLevel: 20, met: ['wolf', 'crow'], professions: {} });
    const board = settleBoard(emptyBoard(), { character, seed: 's' }, NOW, content);
    const order = board.slots[0].order;
    assert.deepEqual(deliverOrder(board, order.id, NOW, content).reputation, { [order.brotherhood]: order.reputation });
    assert.deepEqual(deliverOrder(board, order.id, NOW, content, 0, week('reputation', 100)).reputation, { [order.brotherhood]: 2 * order.reputation });
    // An event's reward names its reputation in its text: it stays.
    const merchant = content.eventsById['stuck-merchant'];
    const hunt = simulateHunt({ character, equipped: [], hp: 9999, name: 'Mira', areaId: 'windfalls-edge', minutes: 60, seed: 'kupiec' }, content);
    const reward = (more) =>
      resolveEvent({ hunt: { ...hunt, ...more }, event: merchant, optionId: 'help', caseId: 'honest', character, equipped: [], name: 'Mira', seed: 'kupiec', purse: 999999 }, content).event.reward.reputation;
    assert.deepEqual(reward({}), { merchants: 15 });
    assert.deepEqual(reward({ week: week('reputation', 100) }), { merchants: 15 });
    // The companions' relation: the time together and the talks.
    const [candidate] = drawCandidates({ character, seed: 'bond' }, NOW, content);
    const together = companionAfterHunt(candidate, { xp: 10, fainted: false, minutes: 120, week: week('reputation', 100) }, 20, content);
    close(together.relation, 2 * companionAfterHunt(candidate, { xp: 10, fainted: false, minutes: 120 }, 20, content).relation);
    const talk = talkWith(candidate, { seed: 's', now: NOW, week: week('reputation', 100) }, content);
    assert.equal(talk.talk.points, 2 * content.settlement.companions.relation.talk);
    assert.equal(talk.companion.relation, 2 * content.settlement.companions.relation.talk);
  });
});

describe('the weeks of the year through the API', () => {
  const { call, db, signUp } = useServer({ WEEKS: 'on' });
  let cookie = null;
  const as = (method, path, body) => call(method, path, { cookie, body });

  beforeEach(async () => {
    ({ cookie } = await signUp('tygodnie'));
    await call('POST', '/api/character', { cookie, body: { name: 'Tygodniowa', classId: 'warrior', appearance: 'female' } });
  });

  test("the character's view names this week and the three after it, the content every week in words", async () => {
    const now = weekAt(Date.now(), content);
    const { week: shown } = (await as('GET', '/api/character')).data.character;
    assert.equal(shown.number, now.number);
    assert.equal(shown.startsAt, now.startsAt);
    assert.equal(shown.next.length, 3);
    assert.equal(shown.next[0].startsAt, now.endsAt);
    const { weeks } = (await call('GET', '/api/content')).data;
    assert.equal(weeks.list.length, 52);
    assert.equal(weeks.texts.until, 'do niedzieli');
    assert.deepEqual(weeks.list[45], { number: 46, name: 'Tydzień Sarny', effects: [{ text: 'odpoczynek szybszy o 5%', short: '+5% szybkości odpoczynku' }] });
    assert.deepEqual(weeks.list[3].effects[1], { text: 'budynki Obozu dają o 5% mniej', short: '−5% z budynków Obozu', malus: true });
  });

  test('an exploration keeps the week it set out in, whenever its report is claimed', async () => {
    const now = weekAt(Date.now(), content);
    assert.equal((await as('POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 10 })).status, 201);
    const database = await db();
    const { options } = await database.prepare('SELECT options FROM activities').first();
    assert.deepEqual(JSON.parse(options).week, now.week);
    // As if it had set out in the Tydzień Wilka (or the Tydzień Łosia,
    // when this one is the Wilka's): its report takes that week.
    const set = kept(now.number === 2 ? 40 : 2);
    await database
      .prepare("UPDATE activities SET options = json_set(options, '$.week', json(?)), started_at = started_at - 600000, ends_at = ends_at - 600000")
      .bind(JSON.stringify(set))
      .run();
    const claimed = await as('POST', '/api/hunts/claim');
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
    assert.ok(claimed.data.report.fights.length > 0);
    assert.ok(claimed.data.report.system.includes(`${content.weeksByNumber[set.number].name}: +5% Siły w walkach.`), claimed.data.report.system.join(' | '));
  });

  test('a new week is named once, on the first visit of a character older than it (758 A: „tylko musi być jakaś informacja”)', async () => {
    const now = weekAt(Date.now(), content);
    const view = async () => (await as('GET', '/api/character')).data.character.week;
    // A character made this week has known no other.
    assert.equal((await view()).notice, undefined);
    await (await db()).prepare('UPDATE characters SET created_at = ?').bind(now.startsAt - 86400000).run();
    assert.equal((await view()).notice, true);
    const seen = await as('POST', '/api/character/week/seen');
    assert.equal(seen.status, 200);
    assert.equal(seen.data.character.week.notice, undefined);
    assert.equal((await view()).notice, undefined);
    assert.equal((await (await db()).prepare('SELECT week_seen FROM characters').first()).week_seen, now.startsAt);
    // Told last week, it is told again this week.
    await (await db()).prepare('UPDATE characters SET week_seen = ?').bind(now.startsAt - 7 * 86400000).run();
    assert.equal((await view()).notice, true);
  });

  test("a profession's work keeps the week it begins in", async () => {
    await (await db()).prepare('UPDATE characters SET level = 10').run();
    assert.equal((await as('POST', '/api/professions/gather', { herbs: ['comfrey'], minutes: 60 })).status, 201);
    const { options } = await (await db()).prepare('SELECT options FROM activities').first();
    assert.deepEqual(JSON.parse(options).week, weekAt(Date.now(), content).week);
  });
});

describe('without the weeks of the year (WEEKS off)', () => {
  const { call, db, signUp } = useServer();

  test('no week in the view, and an exploration keeps none', async () => {
    const { cookie } = await signUp('bezTygodni');
    await call('POST', '/api/character', { cookie, body: { name: 'Bezczasowa', classId: 'warrior', appearance: 'female' } });
    assert.equal((await call('GET', '/api/character', { cookie })).data.character.week, null);
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 10 } })).status, 201);
    const { options } = await (await db()).prepare('SELECT options FROM activities').first();
    assert.equal(JSON.parse(options).week, undefined);
  });
});

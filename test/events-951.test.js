// The events of 951 (14.11.2026): who meets the character from which land
// on, and what their outcomes give — the bounty hunters' rumor, the robber
// knight's loot and the knight-errant's blessing after a won fight, the
// Skarbnik who rewards the honest and takes from the greedy, the snake
// king's crown and its second choice, the ghost caravan, the white stag,
// Forefathers' Eve with its free stat point (from a won fight too) and
// Boruta's pact: a point for a curse.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { eventChoices, eventFor, eventsIn, resolveEvent, simulateHunt } from '../src/engine/index.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';

const NEW = ['bounty-hunters', 'robber-knight', 'skarbnik', 'snake-king', 'ghost-caravan', 'white-stag', 'forefathers-eve', 'boruta'];
const event = (id) => content.eventsById[id];
// A character of the level in the gear typical for it, as the balance
// tools build it (at level 60, where such a character beats the Leszy in
// his duel as well), so the event's fights are fair ones.
const geared = new Map();
const gearedAt = (classId, level) => {
  const key = `${classId}:${level}`;
  if (!geared.has(key)) geared.set(key, typicalCharacter(classId, level, content));
  return geared.get(key);
};
const resolve = (id, optionId, { level = 60, classId = 'warrior', ...extra } = {}) => {
  const { character, equipped } = gearedAt(classId, level);
  const seed = extra.seed ?? `951-${id}`;
  const hunt = simulateHunt({ character, equipped, hp: 99999, name: 'Mira', areaId: 'windfalls-edge', minutes: 60, seed }, content);
  return resolveEvent({ hunt, event: event(id), optionId, character, equipped, name: 'Mira', seed, purse: 1_000_000, ...extra }, content);
};

describe('events of 951', () => {
  test('each comes only from its land on: the snake king from the Czarne Bagno, the caravan from the Sosnowe Wydmy, the stag from the Głucha Knieja, Dziady and Boruta in the Ostępy Nowiu', () => {
    const ids = (areaId) => eventsIn(areaId, false, content).map((one) => one.id);
    const levels = { 'bounty-hunters': 40, 'robber-knight': 60, skarbnik: 76, 'snake-king': 101, 'ghost-caravan': 126, 'white-stag': 151, 'forefathers-eve': 176, boruta: 176 };
    for (const id of NEW) assert.equal(event(id).minLevel, levels[id], id);
    assert.deepEqual(ids('wolf-circles').filter((id) => NEW.includes(id)), ['bounty-hunters']);
    assert.ok(!ids('old-diggings').includes('snake-king'));
    assert.ok(ids('black-alder-carr').includes('snake-king') && !ids('black-alder-carr').includes('ghost-caravan'));
    assert.ok(ids('heather-dunes').includes('ghost-caravan') && !ids('heather-dunes').includes('white-stag'));
    assert.ok(ids('spruce-dusk').includes('white-stag') && !ids('spruce-dusk').includes('boruta'));
    for (const id of NEW) assert.ok(ids('creaking-pines').includes(id), id);
    // Drawn after a real exploration of the Ostępy Nowiu, each of them comes.
    const always = { ...content, events: { ...content.events, chance: 1, longChance: 1 } };
    const seen = new Set(Array.from({ length: 400 }, (_, index) => eventFor({ hunt: { result: 'success', areaId: 'plague-graves', minutes: 30 }, seed: `ostepy-${index}` }, always)?.id));
    for (const id of NEW) assert.ok(seen.has(id), id);
  });

  test('the bounty hunters: a mistake explained brings the rumor, paying costs gold, and the disguised robbers attack first even when paid', () => {
    const rumor = { areaId: 'wolf-circles', monsterId: 'wolf' };
    const told = resolve('bounty-hunters', 'explain', { caseId: 'hunters', rumor });
    assert.deepEqual(told.event.reward.rumor, rumor);
    const paid = resolve('bounty-hunters', 'pay', { caseId: 'hunters' });
    assert.ok(paid.spent > 0 && paid.event.fight === null);
    const robbed = resolve('bounty-hunters', 'pay', { caseId: 'disguised' });
    assert.ok(robbed.spent > 0);
    assert.deepEqual(robbed.fights.at(-1).enemies.map((enemy) => enemy.monsterId), ['bandit-thug', 'bandit-knifer', 'bandit-crossbow']);
  });

  test('the robber knight: beaten, he leaves a rare item; the knight-errant also blesses, and only a Cień slips under the bridge', () => {
    const robber = resolve('robber-knight', 'fight', { caseId: 'robber' });
    assert.equal(robber.fights.at(-1).won, true);
    assert.ok(['unique', 'epic', 'legendary'].includes(robber.items.at(-1).rarity));
    const errant = resolve('robber-knight', 'fight', { caseId: 'errant' });
    assert.equal(errant.fights.at(-1).won, true);
    assert.ok(['epic', 'legendary'].includes(errant.items.at(-1).rarity));
    assert.deepEqual(errant.event.reward.buff, { kind: 'focus', bonus: 0.15, fights: 3 });
    const bridge = event('robber-knight').options.find((option) => option.id === 'bridge');
    assert.deepEqual(bridge.classes, ['shadow']);
    assert.ok(resolve('robber-knight', 'bridge', { caseId: 'errant', classId: 'shadow' }).event.reward.gold > 0);
  });

  test('the Skarbnik: help brings an item, a fair share gold, and greed either three times the share or half the purse, at most 100 gold a level', () => {
    assert.ok(['rare', 'unique', 'epic'].includes(resolve('skarbnik', 'help').items.at(-1).rarity));
    const share = resolve('skarbnik', 'share', { endingId: null }).event.reward.gold;
    const rich = resolve('skarbnik', 'more', { endingId: 'rich' }).event.reward.gold;
    assert.ok(rich > share * 3 * 0.5, `${rich} vs ${share}`);
    const caught = resolve('skarbnik', 'more', { endingId: 'caught', level: 100 });
    assert.equal(caught.event.loss.gold, 100 * 100);
    const poor = resolve('skarbnik', 'more', { endingId: 'caught', level: 100, purse: 400 });
    assert.ok(poor.event.loss.gold <= Math.round((400 + poor.gold) * 0.5) + 1);
  });

  test('the snake king: the white cloth leads to a second choice — flee with the crown or leave it for swiftness; attacked, he fights with his vipers', () => {
    const king = event('snake-king');
    const after = eventChoices(king, ['cloth'], { seed: 'korona' });
    assert.deepEqual(after.options.map((option) => option.id), ['flee', 'stay']);
    const fled = resolve('snake-king', ['cloth', 'flee'], { endingId: 'crown' });
    assert.ok(['epic', 'legendary'].includes(fled.items.at(-1).rarity));
    const caught = resolve('snake-king', ['cloth', 'flee'], { endingId: 'vipers' });
    assert.deepEqual(caught.fights.at(-1).enemies.map((enemy) => enemy.monsterId), ['viper-knot', 'viper-knot']);
    assert.deepEqual(resolve('snake-king', ['cloth', 'stay']).event.reward.buff, { kind: 'speed', bonus: 0.2, fights: 3 });
    assert.deepEqual(resolve('snake-king', 'attack').fights.at(-1).enemies.map((enemy) => enemy.monsterId), ['snake-king', 'viper-knot']);
  });

  test('the ghost caravan sells a rare item, or, a revenant, fights for the gold paid', () => {
    const bought = resolve('ghost-caravan', 'buy', { caseId: 'merchant' });
    assert.ok(bought.spent > 0 && ['unique', 'epic', 'legendary'].includes(bought.items.at(-1).rarity));
    const tricked = resolve('ghost-caravan', 'buy', { caseId: 'wraith' });
    assert.ok(tricked.spent > 0);
    assert.deepEqual(tricked.fights.at(-1).enemies.map((enemy) => enemy.monsterId), ['upior', 'upior']);
  });

  test('the white stag: the spring gives focus and herbs (gold without Zielarstwo), getting lost costs resources, a hit costs a curse, a bow gives swiftness', () => {
    const spring = resolve('white-stag', 'follow', { endingId: 'spring' });
    assert.deepEqual(spring.event.reward.buff, { kind: 'focus', bonus: 0.2, fights: 3 });
    assert.ok(spring.event.reward.gold > 0 || spring.event.reward.herbs);
    const hit = resolve('white-stag', 'hunt', { endingId: 'hit' });
    assert.deepEqual(hit.event.reward.buff, { kind: 'curse', bonus: 0.1, fights: 4 });
    assert.ok(['epic', 'legendary'].includes(hit.items.at(-1).rarity));
    assert.equal(resolve('white-stag', 'hunt', { endingId: 'miss' }).event.reward, undefined);
    assert.deepEqual(resolve('white-stag', 'bow').event.reward.buff, { kind: 'speed', bonus: 0.15, fights: 3 });
    assert.ok(resolve('white-stag', 'follow', { endingId: 'lost' }).event.loss);
  });

  test('Forefathers’ Eve: sharing brings a free stat point, from the hungry revenant too once it is beaten', () => {
    const shared = resolve('forefathers-eve', 'share', { caseId: 'souls' });
    assert.ok(shared.spent > 0);
    assert.equal(shared.event.reward.points, 1);
    const hungry = resolve('forefathers-eve', 'share', { caseId: 'hungry' });
    assert.equal(hungry.fights.at(-1).won, true);
    assert.equal(hungry.event.reward.points, 1);
  });

  test('Boruta: the pact gives a point and ten fights of a curse; a Mag outwits him and a Kleryk drives him away, each for gold', () => {
    const signed = resolve('boruta', 'sign');
    assert.equal(signed.event.reward.points, 1);
    assert.deepEqual(signed.event.reward.buff, { kind: 'curse', bonus: 0.1, fights: 10 });
    const options = Object.fromEntries(event('boruta').options.map((option) => [option.id, option.classes ?? null]));
    assert.deepEqual(options, { sign: null, outwit: ['mage'], cross: ['cleric'], leave: null });
    assert.ok(resolve('boruta', 'outwit', { classId: 'mage' }).event.reward.gold > 0);
    assert.ok(resolve('boruta', 'cross', { classId: 'cleric' }).event.reward.gold > 0);
  });
});

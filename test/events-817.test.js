// The events of 817 (11.11.2026) and the relations of 818.3 and 818.4: Jagna
// in the marsh once, then always the Drowned Maiden; the relation with
// residents an event brings; a companion's errand from its story, which
// lifts the relation to the next standing and is recalled in the next talk;
// the dice's stake won back; and the wounds of the river swum across.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  companionAfterErrand,
  companionStanding,
  drawCandidates,
  errandMates,
  eventCase,
  eventFor,
  eventMate,
  eventView,
  playerCombatant,
  resolveEvent,
  simulateHunt,
  talkWith,
} from '../src/engine/index.js';
import { fightingPlayer } from '../src/engine/hunt.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const character = newCharacter('warrior', { level: 30, classLevel: 30 });
const equipped = [];
const seed = 'zdarzenia-817';
const base = simulateHunt({ character, equipped, hp: 9999, name: 'Mira', areaId: 'windfalls-edge', minutes: 60, seed }, content);
const event = (id) => content.eventsById[id];
const resolve = (id, optionId, extra = {}) => resolveEvent({ hunt: base, event: event(id), optionId, character, equipped, name: 'Mira', seed, purse: 100000, ...extra }, content);
const NOW = Date.UTC(2026, 10, 11, 10, 0);
const [candidate] = drawCandidates({ character, seed: 'kandydaci' }, NOW, content);
const mate = (extra = {}) => ({ id: candidate.id, name: 'Bogna', appearance: 'female', classId: 'archer', story: 6, relation: 300, errand: null, fainted: false, ...extra });

describe('events of 817 in the engine', () => {
  test('Jagna in the marsh comes once, then always the Drowned Maiden', () => {
    const marsh = event('bog-herbalist');
    const seeds = Array.from({ length: 40 }, (_, index) => `bagno-${index}`);
    assert.ok(seeds.every((one) => eventCase(marsh, one, null, { met: [] }).id === 'jagna'));
    assert.ok(seeds.every((one) => eventCase(marsh, one, null, { met: ['bog-herbalist'] }).id === 'drowned-maiden'));
    // Pulled out, she gives herbs (or coins without Zielarstwo) and the relation.
    const pulled = resolve('bog-herbalist', 'pull', { met: [] });
    assert.equal(pulled.event.case, 'jagna');
    assert.deepEqual(pulled.event.reward.relation, { herbalist: 25 });
    assert.match(pulled.event.option.text, /\+25 relacji z Jagną/);
    // Later the Drowned Maiden drags the character into the bog.
    const dragged = resolve('bog-herbalist', 'pull', { met: ['bog-herbalist'] });
    assert.equal(dragged.event.case, 'drowned-maiden');
    assert.deepEqual(dragged.fights.at(-1).enemies.map((enemy) => enemy.monsterId), ['drowned-maiden', 'drowner']);
    assert.equal(dragged.event.reward?.relation, undefined);
    // Walking away costs no relation (818.3).
    assert.equal(resolve('bog-herbalist', 'leave', { met: [] }).event.reward, undefined);
  });

  test('the refugees: gold given raises the headman\'s relation, and a won escort more', () => {
    const given = resolve('refugees', 'give', { caseId: 'family' });
    assert.deepEqual(given.event.reward.relation, { headman: 25 });
    assert.equal(given.spent, 3 * character.level);
    const escorted = resolve('refugees', 'escort', { caseId: 'family' });
    const won = escorted.fights.at(-1).won === true;
    assert.deepEqual(escorted.event.reward?.relation, won ? { headman: 40 } : undefined);
    // Robbers in disguise: the gold is gone, and nothing else.
    const robbed = resolve('refugees', 'give', { caseId: 'bandits' });
    assert.equal(robbed.event.reward, undefined);
    assert.equal(robbed.spent, 3 * character.level);
  });

  test('the dice: a win gives back double the stake, the Fiend\'s big stake curses', () => {
    const dice = event('fireside-dice');
    const stake = 10 * character.level;
    const won = resolveEvent({ hunt: base, event: dice, optionId: 'big', caseId: 'stranger', endingId: 'win', character, equipped, name: 'Mira', seed, purse: 100000 }, content);
    assert.equal(won.gold - base.gold, 2 * stake);
    assert.equal(won.spent, stake);
    const lost = resolveEvent({ hunt: base, event: dice, optionId: 'big', caseId: 'stranger', endingId: 'loss', character, equipped, name: 'Mira', seed, purse: 100000 }, content);
    assert.equal(lost.gold, base.gold);
    assert.match(lost.event.option.text, new RegExp(`−${stake} złota`));
    const cursed = resolveEvent({ hunt: base, event: dice, optionId: 'big', caseId: 'fiend', character, equipped, name: 'Mira', seed, purse: 100000 }, content);
    assert.deepEqual(cursed.event.reward.buff, { kind: 'curse', bonus: 0.1, fights: 4 });
  });

  test('the river swum across leaves wounds, which weaken the blows like a curse', () => {
    const swum = resolve('ferryman', 'swim', { caseId: 'ferryman' });
    assert.deepEqual(swum.event.reward.buff, { kind: 'wounds', bonus: 0.1, fights: 2 });
    const unit = playerCombatant({ character, equipped, hp: 9999, name: 'Mira' }, content);
    const hurt = fightingPlayer({ unit, character, equipped, name: 'Mira', hp: 9999, on: { wounds: 0.1 }, kit: {}, trophies: {} }, content);
    assert.equal(hurt.damageBonus, -0.1);
  });

  test('a companion\'s errand comes only with a companion of Trust who has not had it', () => {
    const errand = event('companion-errand');
    assert.equal(errandMates(errand, [mate({ relation: 100 })]).length, 0);
    assert.equal(errandMates(errand, [mate({ errand: 'alone' })]).length, 0);
    assert.equal(errandMates(errand, [mate({ fainted: true })]).length, 0);
    assert.equal(errandMates(errand, [mate()]).length, 1);
    const always = { ...content, events: { ...content.events, chance: 1, longChance: 1, list: [errand] } };
    const hunt = { result: 'success', areaId: 'windfalls-edge', minutes: 30 };
    assert.equal(eventFor({ hunt, seed, mates: [] }, always), null);
    assert.equal(eventFor({ hunt, seed, mates: [mate()] }, always), errand);
    // Its story, in the companion's words and form, with the companion shown.
    const chosen = eventMate(errand, seed, [mate()]);
    const view = eventView(errand, content.areasById['windfalls-edge'], null, null, null, chosen);
    assert.equal(view.title, 'Sprawa towarzyszki');
    assert.match(view.text, /^Bogna podnosi z ziemi strzęp czerwonej chusty/);
    assert.deepEqual(view.companion, { id: candidate.id, name: 'Bogna', classId: 'archer', appearance: 'female' });
    assert.deepEqual(view.options.map((option) => option.label), ['Pójdę z tobą', 'Idź sama, poczekam', 'Nie teraz, idziemy dalej']);
    assert.equal(eventCase(errand, seed, null, { mate: chosen }).id, 'brother');
  });

  test('gone on together, the errand lifts the relation to the next standing; alone, by 30', () => {
    const errand = event('companion-errand');
    const together = resolveEvent({ hunt: base, event: errand, optionId: 'together', character, equipped, name: 'Mira', seed, mate: mate({ story: 0 }) }, content);
    assert.deepEqual(together.event.reward.companion, { id: candidate.id, relation: 'next', errand: 'together' });
    assert.match(together.event.option.text, /relacja wchodzi na kolejny stopień/);
    const alone = resolveEvent({ hunt: base, event: errand, optionId: 'alone', character, equipped, name: 'Mira', seed, mate: mate({ story: 1 }) }, content);
    assert.deepEqual(alone.event.reward.companion, { id: candidate.id, relation: 30, errand: 'alone' });
    assert.match(alone.event.option.text, /^Bogna wraca z rozciętą wargą, ale spokojniejsza/);
    const later = resolveEvent({ hunt: base, event: errand, optionId: 'later', character, equipped, name: 'Mira', seed, mate: mate() }, content);
    assert.equal(later.event.reward, undefined);
    // The companion after it: the next standing at once, then the memory in
    // the next talk, once.
    const companion = { ...candidate, appearance: 'female', story: 2, relation: 300 };
    const raised = companionAfterErrand(companion, { relation: 'next', errand: 'together' }, content);
    assert.equal(raised.relation, content.settlement.standings[3].points);
    assert.equal(companionStanding(raised, content).index, 3);
    assert.equal(companionAfterErrand(companion, { relation: 30, errand: 'alone' }, content).relation, 330);
    const talk = talkWith(raised, { seed, now: NOW }, content);
    assert.equal(talk.talk.memory, true);
    assert.equal(talk.talk.text, 'Postawiłam już płot na tej ziemi przy strumieniu. Kiedyś zaproszę cię tam na wieczerzę.');
    const next = talkWith({ ...talk.companion, talkedOn: null }, { seed, now: NOW + 86400000 }, content);
    assert.equal(next.talk.memory, undefined);
  });
});

describe('events of 817 (API)', () => {
  const { call, db, signUp } = useServer({ EVENTS: 'test', SETTLEMENT: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('bagienna'));
    await call('POST', '/api/character', { cookie, body: { name: 'Bagienna', classId: 'warrior', appearance: 'female' } });
  });

  const explore = async () => {
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } })).status, 201);
    await call('POST', '/api/test/skip-time', { cookie });
  };
  const claim = (choice) => call('POST', '/api/hunts/claim', { cookie, ...(choice !== undefined && { body: { choice } }) });
  const choose = (eventId) => call('POST', '/api/test/events', { cookie, body: { eventId } });
  const settlement = async () => JSON.parse((await (await db()).prepare('SELECT settlement FROM characters').first()).settlement ?? '{}');

  test('Jagna is met once: her relation grows, and the next time it is the Drowned Maiden', async () => {
    await explore();
    await claim();
    await (await db()).prepare(`UPDATE characters SET level = 30, gold = 100000, points = '{"strength":150,"vitality":140}', hp_at = 0`).run();
    assert.equal((await choose('bog-herbalist')).status, 200);
    await explore();
    assert.equal((await claim()).data.event.id, 'bog-herbalist');
    const first = await claim('stick');
    assert.equal(first.data.report.event.case, 'jagna');
    let stored = await settlement();
    assert.equal(stored.relations.herbalist, 25);
    assert.deepEqual(stored.events, ['bog-herbalist']);
    await choose('bog-herbalist');
    await explore();
    await claim();
    const second = await claim('leave');
    assert.equal(second.data.report.event.case, 'drowned-maiden');
    stored = await settlement();
    assert.equal(stored.relations.herbalist, 25);
    assert.deepEqual(stored.events, ['bog-herbalist']);
  });
});

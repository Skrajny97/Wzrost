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

  test('an errand fought together: a win gives the next standing and an item of a rarer kind; a fight not won settles it, without the standing', () => {
    const errand = event('companion-errand');
    const debts = { together: true, mate: mate({ story: 1 }) };
    assert.equal(eventCase(errand, seed, null, { mate: debts.mate }).id, 'debts');
    // A character strong enough for the moneylender's three men.
    const strong = newCharacter('warrior', { level: 30, classLevel: 30, points: { strength: 300, vitality: 300 } });
    const hunt = simulateHunt({ character: strong, equipped, hp: 99999, name: 'Mira', areaId: 'windfalls-edge', minutes: 60, seed }, content);
    const won = resolveEvent({ hunt, event: errand, optionId: 'together', character: strong, equipped, name: 'Mira', seed, mate: debts.mate }, content);
    const fight = won.fights.at(-1);
    assert.equal(fight.won, true);
    assert.deepEqual(won.event.reward.companion, { id: candidate.id, relation: 'next', errand: 'together' });
    const item = won.items[fight.chests.at(-1)];
    assert.ok(['rare', 'unique', 'epic'].includes(item.rarity), item.rarity);
    assert.match(won.entries.at(-1).text, /jeden z nich zostawia .+\. Bogna drze weksle/);
    // Not won (the character comes to it with 1 HP): the errand is settled
    // all the same, with its sentence, and the relation stays as it was.
    const lost = resolveEvent({ hunt: { ...base, hpEnd: 1 }, event: errand, optionId: 'together', character, equipped, name: 'Mira', seed, mate: debts.mate }, content);
    assert.notEqual(lost.fights.at(-1).won, true);
    assert.deepEqual(lost.event.reward.companion, { id: candidate.id, errand: 'lost' });
    assert.match(lost.entries.at(-1).text, /Bogna ociera krew z wargi: „Trudno\. Spłacę go po swojemu”\. Więcej o tym nie wspomina\./);
    const companion = { ...candidate, appearance: 'female', story: 1, relation: 300 };
    assert.deepEqual(companionAfterErrand(companion, lost.event.reward.companion, content), { ...companion, relation: 300, errand: 'lost' });
    // Every errand fought together closes either way: no case without its `lose`.
    for (const one of errand.cases) {
      const together = one.outcomes?.together;
      if (together?.kind === 'fight') assert.deepEqual(together.lose?.companion, { errand: 'lost' }, one.id);
    }
    assert.equal(errandMates(errand, [mate({ errand: 'lost' })]).length, 0);
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

  test('Jagna is met once even when the Osada is saved between the meetings', async () => {
    await explore();
    await claim();
    await (await db()).prepare(`UPDATE characters SET level = 30, gold = 100000, points = '{"strength":150,"vitality":140}', hp_at = 0`).run();
    await choose('bog-herbalist');
    await explore();
    await claim();
    assert.equal((await claim('stick')).data.report.event.case, 'jagna');
    // A look at the Osada saves it anew with its board, as every action
    // there does: what the events remember stays.
    assert.equal((await call('GET', '/api/settlement', { cookie })).status, 200);
    const stored = await settlement();
    assert.ok(stored.board);
    assert.deepEqual(stored.events, ['bog-herbalist']);
    await choose('bog-herbalist');
    await explore();
    await claim();
    assert.equal((await claim('leave')).data.report.event.case, 'drowned-maiden');
  });

  test('an event of the Osada does not come before the character has its Osada', async () => {
    await explore();
    await claim();
    const { level } = content.unlocksById.settlement;
    await (await db()).prepare(`UPDATE characters SET level = ?, gold = 100000, points = '{"strength":150,"vitality":140}', hp_at = 0`).bind(level - 1).run();
    await choose('bog-herbalist');
    await explore();
    const report = await claim();
    assert.equal(report.status, 200, JSON.stringify(report.data).slice(0, 300));
    assert.equal(report.data.event ?? null, null);
    assert.equal(report.data.report.event ?? null, null);
    assert.deepEqual((await settlement()).relations ?? {}, {});
    // From the Osada's level on, it comes.
    await (await db()).prepare('UPDATE characters SET level = ?, hp_at = 0').bind(level).run();
    await choose('bog-herbalist');
    await explore();
    assert.equal((await claim()).data.event.id, 'bog-herbalist');
  });

  test('the companions count as they set out: a relation grown before the choice does not change whose errand it is', async () => {
    await explore();
    await claim();
    await (await db()).prepare(`UPDATE characters SET level = 30, class_level = 30, gold = 100000, points = '{"strength":300,"vitality":300}', hp_at = 0`).run();
    await (await db()).prepare("INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) SELECT id, 'quarters', 2, 0, 0 FROM characters").run();
    const hire = async () => {
      const [candidate] = (await call('GET', '/api/settlement', { cookie })).data.settlement.companions.candidates;
      const hired = await call('POST', '/api/settlement/hire', { cookie, body: { candidateId: candidate.id } });
      assert.equal(hired.status, 200, JSON.stringify(hired.data).slice(0, 300));
      return candidate;
    };
    const first = await hire();
    const second = await hire();
    const relate = async (relations) => {
      const stored = await settlement();
      stored.companions = stored.companions.map((one) => ({ ...one, relation: relations[one.id] ?? one.relation }));
      await (await db()).prepare('UPDATE characters SET settlement = ?').bind(JSON.stringify(stored)).run();
    };
    // Only the first has the relation an errand needs when they set out.
    const { minRelation } = content.eventsById['companion-errand'].companion;
    await relate({ [first.id]: minRelation, [second.id]: 0 });
    await choose('companion-errand');
    await explore();
    const shown = await claim();
    assert.equal(shown.data.event?.id, 'companion-errand', JSON.stringify(shown.data).slice(0, 300));
    assert.equal(shown.data.event.companion.id, first.id);
    // The second one's relation grows before the choice: the errand stays the
    // first one's, however often the report is opened.
    await relate({ [second.id]: minRelation });
    for (let i = 0; i < 3; i += 1) assert.equal((await claim()).data.event.companion.id, first.id);
    const done = await claim('later');
    assert.equal(done.status, 200, JSON.stringify(done.data).slice(0, 300));
    assert.equal(done.data.report.event.companion?.id ?? first.id, first.id);
  });
});

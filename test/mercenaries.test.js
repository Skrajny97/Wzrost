// Najemnicy in the Karczma (src/server/mercenaries.js; the author,
// 5.11.2026: 633.1 A, 633.2 A, 633.3 A, "Oddanie się do werbunku jest
// okresowe i postać nie może nic wtedy robić, chyba że zdejmie wystawienie
// swojej usługi" and "Gdy zostanie zwerbowany nie może już zdjąć swojej
// usługi do czasu jej zakończenia (1 wyprawa)"). A character offers itself
// for some hours at a price for each hour of an exploration and can do
// nothing else meanwhile; another player takes it along on one plain
// exploration, pays at once, and it fights beside them with all it wears;
// hired, it serves to the exploration's end and then claims its pay.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { mercenariesOpen, mercenaryFee, mercenaryFits, mercenaryPriceRange } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rules = content.settlement.mercenaries;
const from = rules.fromLevel;

describe('mercenaries in the engine', () => {
  test('they open at their level, ask a price within the level\'s range and pay for the hours of the exploration', () => {
    assert.equal(mercenariesOpen(from - 1, content), false);
    assert.equal(mercenariesOpen(from, content), true);
    const range = mercenaryPriceRange(40, content);
    assert.deepEqual(range, { min: rules.price.minPerLevel * 40, max: 100000, suggested: rules.price.suggestedPerLevel * 40 });
    assert.ok(range.min < range.suggested && range.suggested < range.max);
    // The most is 100 000 gold an hour at every level (the author:
    // "powinna sięgać nawet i 100000 złota jesli ktoś chce"), above the
    // suggestion even at the last level.
    assert.equal(mercenaryPriceRange(from, content).max, 100000);
    const top = content.balance.progression.maxLevel;
    assert.equal(mercenaryPriceRange(top, content).max, 100000);
    assert.ok(mercenaryPriceRange(top, content).suggested < 100000);
    // The longest exploration at the most stays a whole, safe number.
    const longest = content.balance.hunt.maxMinutes;
    assert.equal(mercenaryFee(100000, longest), (100000 * longest) / 60);
    assert.ok(Number.isSafeInteger(mercenaryFee(100000, longest)));
    assert.equal(mercenaryFee(100, 60), 100);
    assert.equal(mercenaryFee(100, 90), 150);
    assert.equal(mercenaryFee(100, 15), 25);
    // At least a gold.
    assert.equal(mercenaryFee(1, 5), 1);
  });

  test('a mercenary fits within the Drużyna\'s class spread (633.2 A)', () => {
    const spread = content.balance.parties.classSpread;
    assert.equal(mercenaryFits(40, 40 + spread, content), true);
    assert.equal(mercenaryFits(40, 40 - spread, content), true);
    assert.equal(mercenaryFits(40, 41 + spread, content), false);
  });
});

describe('mercenaries through the API', () => {
  const { call, db, signUp } = useServer();
  const cookies = {};
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const set = async (name, sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql} WHERE name = ?`).bind(...binds, name).run();
  const row = async (name) => (await db()).prepare('SELECT * FROM characters WHERE name = ?').bind(name).first();
  const activityOf = async (name) => (await db()).prepare('SELECT a.* FROM activities a JOIN characters c ON c.id = a.character_id WHERE c.name = ?').bind(name).first();
  const character = async (login) => (await as(login, 'GET', '/api/character')).data.character;

  async function player(login, name, { level = 40, classLevel = 40, gold = 10000 } = {}) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await set(name, 'level = ?, class_level = ?, gold = ?, tutorial = NULL', level, classLevel, gold);
  }
  // A chainmail the character wears.
  async function wearing(name) {
    const chain = { base: 'chainmail', slot: 'chest', level: 5, rarity: 'common', affixes: [], armor: 15 };
    const { meta } = await (await db()).prepare("INSERT INTO items (character_id, slot, data, created_at) SELECT id, 'chest', ?, 0 FROM characters WHERE name = ?").bind(JSON.stringify(chain), name).run();
    return meta.last_row_id;
  }

  beforeEach(async () => {
    await player('najemna', 'Najemna');
    await player('zlecenie', 'Zleceniodawca');
    await wearing('Najemna');
  });

  test('the offer opens at its level, within its hours and its price range', async () => {
    await set('Najemna', 'level = ?', from - 1);
    assert.equal((await character('najemna')).mercenaries, null);
    const early = await as('najemna', 'POST', '/api/mercenary/offer', { hours: 4, perHour: 100 });
    assert.equal(early.status, 403);
    assert.equal(early.data.error.code, 'locked');

    await set('Najemna', 'level = 40');
    const seen = (await character('najemna')).mercenaries;
    assert.deepEqual(seen.price, mercenaryPriceRange(40, content));
    assert.deepEqual(seen.hours, rules.hours);
    assert.equal((await as('najemna', 'POST', '/api/mercenary/offer', { hours: 5, perHour: seen.price.suggested })).data.error.code, 'invalid_hours');
    assert.equal((await as('najemna', 'POST', '/api/mercenary/offer', { hours: 4, perHour: seen.price.max + 1 })).data.error.code, 'invalid_price');
    assert.equal((await as('najemna', 'POST', '/api/mercenary/offer', { hours: 4, perHour: 1.5 })).data.error.code, 'invalid_price');
    assert.equal((await as('najemna', 'POST', '/api/mercenary/offer', { hours: 4, perHour: seen.price.min - 1 })).data.error.code, 'invalid_price');
  });

  test('the price an hour goes up to 100 000 gold at any level, and the fee follows it', async () => {
    assert.equal((await character('najemna')).mercenaries.price.max, 100000);
    const above = await as('najemna', 'POST', '/api/mercenary/offer', { hours: 4, perHour: 100001 });
    assert.equal(above.status, 400);
    assert.equal(above.data.error.code, 'invalid_price');
    assert.match(above.data.error.message, /100\s000 zł/);
    // At its level's least, 100 000 is still allowed.
    await set('Najemna', 'level = ?', from);
    const offered = await as('najemna', 'POST', '/api/mercenary/offer', { hours: 4, perHour: 100000 });
    assert.equal(offered.status, 200, JSON.stringify(offered.data).slice(0, 300));
    assert.equal(offered.data.character.activity.service.perHour, 100000);

    // Listed with it, and hired for 100 000 an hour of the exploration.
    await set('Zleceniodawca', 'gold = 500000');
    const [one] = (await as('zlecenie', 'GET', '/api/mercenaries?minutes=120')).data.mercenaries;
    assert.equal(one.perHour, 100000);
    assert.equal(one.fee, 200000);
    const started = await as('zlecenie', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 120, mercenary: { id: one.id, perHour: 100000 } });
    assert.equal(started.status, 201, JSON.stringify(started.data).slice(0, 300));
    assert.equal((await row('Zleceniodawca')).gold, 300000);
    assert.deepEqual(started.data.character.activity.mercenary, { name: 'Najemna', gold: 200000 });
  });

  test('while offered the character does nothing else and keeps its gear, until it takes the offer back', async () => {
    const offered = await as('najemna', 'POST', '/api/mercenary/offer', { hours: 4, perHour: 300 });
    assert.equal(offered.status, 200, JSON.stringify(offered.data).slice(0, 300));
    const activity = offered.data.character.activity;
    assert.equal(activity.kind, 'mercenary');
    assert.equal(activity.service.perHour, 300);
    assert.equal(activity.service.hired, null);
    assert.match(activity.service.text, /\{time\}/);
    assert.equal(activity.endsAt - activity.startedAt, 4 * 3600000);

    // No exploration, no second offer, no change of what it wears.
    const hunt = await as('najemna', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 });
    assert.equal(hunt.data.error.code, 'busy');
    assert.equal(hunt.data.error.message, rules.texts.busy);
    assert.equal((await as('najemna', 'POST', '/api/mercenary/offer', { hours: 1, perHour: 300 })).data.error.code, 'busy');
    const chest = offered.data.character.equipment.chest;
    assert.ok(chest);
    const unequip = await as('najemna', 'POST', `/api/items/${chest.id}/unequip`);
    assert.equal(unequip.status, 409);
    assert.equal(unequip.data.error.code, 'busy');
    // No fight with the Bestia Gildii or a guardian of the Wyprawa Gildii either.
    assert.equal((await as('najemna', 'POST', '/api/guild/beast/attack')).data.error.code, 'busy');
    assert.equal((await as('najemna', 'POST', '/api/guild/expedition/attack')).data.error.code, 'busy');

    // Taken back: free again.
    const withdrawn = await as('najemna', 'POST', '/api/mercenary/withdraw');
    assert.equal(withdrawn.status, 200, JSON.stringify(withdrawn.data).slice(0, 300));
    assert.equal(withdrawn.data.character.activity, null);
    assert.equal((await as('najemna', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).status, 201);
  });

  test('another player takes the mercenary along: it pays at once, the mercenary fights beside it, serves to the end and claims its pay', async () => {
    await as('najemna', 'POST', '/api/mercenary/offer', { hours: 4, perHour: 300 });
    const id = (await row('Najemna')).id;

    // The list: with the price for this length; never one's own.
    const listed = await as('zlecenie', 'GET', '/api/mercenaries?minutes=60');
    assert.equal(listed.status, 200);
    const [one] = listed.data.mercenaries;
    assert.equal(one.id, id);
    assert.equal(one.name, 'Najemna');
    assert.equal(one.perHour, 300);
    assert.equal(one.fee, 300);
    assert.ok(one.className);
    assert.deepEqual((await as('najemna', 'GET', '/api/mercenaries?minutes=60')).data.mercenaries, []);

    // Not on a Szybkie Polowanie; a price changed meanwhile is asked again.
    const quick = await as('zlecenie', 'POST', '/api/hunts/quick', { areaId: 'windfalls-edge', mercenary: { id, perHour: 300 } });
    assert.equal(quick.data.error?.code, 'mercenary_plain_only', JSON.stringify(quick.data).slice(0, 300));
    const changed = await as('zlecenie', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 60, mercenary: { id, perHour: 200 } });
    assert.equal(changed.data.error.code, 'mercenary_changed');

    const goldBefore = (await row('Zleceniodawca')).gold;
    const started = await as('zlecenie', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 60, mercenary: { id, perHour: 300 } });
    assert.equal(started.status, 201, JSON.stringify(started.data).slice(0, 300));
    assert.equal((await row('Zleceniodawca')).gold, goldBefore - 300);
    assert.deepEqual(started.data.character.activity.mercenary, { name: 'Najemna', gold: 300 });
    const hunt = await activityOf('Zleceniodawca');
    const options = JSON.parse(hunt.options);
    assert.equal(options.partners[0].id, id);
    assert.equal(options.partners[0].name, 'Najemna');
    assert.ok(options.partners[0].equipped.length > 0, 'with all it wears');

    // Hired: it serves until that exploration ends and cannot take the offer back.
    const service = await activityOf('Najemna');
    assert.equal(service.ends_at, hunt.ends_at);
    const hired = (await character('najemna')).activity.service;
    assert.deepEqual(hired.hired, { name: 'Zleceniodawca', area: started.data.character.activity.areaName, gold: 300 });
    assert.match(hired.text, /Zleceniodawca zwerbowała/);
    const back = await as('najemna', 'POST', '/api/mercenary/withdraw');
    assert.equal(back.data.error.code, 'hired');
    assert.equal(back.data.error.message, rules.texts.hiredLocked);
    assert.equal((await as('najemna', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).data.error.message, rules.texts.busyHired);
    // Nor does anyone else take it; nor does it list.
    await player('trzeci', 'Trzecia');
    assert.deepEqual((await as('trzeci', 'GET', '/api/mercenaries?minutes=60')).data.mercenaries, []);
    const late = await as('trzeci', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 60, mercenary: { id, perHour: 300 } });
    assert.equal(late.data.error.code, 'mercenary_gone');
    // Before its end there is no pay to claim.
    assert.equal((await as('najemna', 'POST', '/api/mercenary/claim')).data.error.code, 'not_finished');

    // The exploration's end ends the service; the report has the mercenary in its fights.
    await as('zlecenie', 'POST', '/api/test/skip-time');
    const claimed = await as('zlecenie', 'POST', '/api/hunts/claim');
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
    assert.ok(JSON.stringify(claimed.data.report).includes('Najemna'));

    const ended = await character('najemna');
    assert.equal(ended.activity.finished, true);
    assert.equal(ended.settlementWaiting, true);
    const goldOf = (await row('Najemna')).gold;
    const xpOf = (await row('Najemna')).xp;
    const paid = await as('najemna', 'POST', '/api/mercenary/claim');
    assert.equal(paid.status, 200, JSON.stringify(paid.data).slice(0, 300));
    assert.equal(paid.data.paid, 300);
    assert.equal((await row('Najemna')).gold, goldOf + 300);
    // No XP for the mercenary, and once only.
    assert.equal((await row('Najemna')).xp, xpOf);
    assert.equal(paid.data.character.activity, null);
    assert.equal((await as('najemna', 'POST', '/api/mercenary/claim')).data.error.code, 'not_offering');
  });

  test('called back early, the exploration ends the service at once and the pay waits', async () => {
    await as('najemna', 'POST', '/api/mercenary/offer', { hours: 8, perHour: 400 });
    const id = (await row('Najemna')).id;
    const started = await as('zlecenie', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 120, mercenary: { id, perHour: 400 } });
    assert.equal(started.status, 201, JSON.stringify(started.data).slice(0, 300));
    const cancelled = await as('zlecenie', 'POST', '/api/hunts/cancel');
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data).slice(0, 300));
    const service = await activityOf('Najemna');
    assert.ok(service.ends_at <= Date.now() + 1000);
    const paid = await as('najemna', 'POST', '/api/mercenary/claim');
    assert.equal(paid.data.paid, 800);
  });

  test('an offer nobody took closes with nothing paid', async () => {
    await as('najemna', 'POST', '/api/mercenary/offer', { hours: 1, perHour: 300 });
    await as('najemna', 'POST', '/api/test/skip-time');
    assert.deepEqual((await as('zlecenie', 'GET', '/api/mercenaries?minutes=60')).data.mercenaries, []);
    const closed = await as('najemna', 'POST', '/api/mercenary/claim');
    assert.equal(closed.status, 200, JSON.stringify(closed.data).slice(0, 300));
    assert.equal(closed.data.paid, 0);
    assert.equal(closed.data.text, rules.texts.expired);
  });

  test('the class spread, the gold and the level of the one who hires', async () => {
    await as('najemna', 'POST', '/api/mercenary/offer', { hours: 4, perHour: 300 });
    const id = (await row('Najemna')).id;
    const spread = content.balance.parties.classSpread;
    await set('Zleceniodawca', 'class_level = ?', 40 + spread + 1);
    assert.deepEqual((await as('zlecenie', 'GET', '/api/mercenaries?minutes=60')).data.mercenaries, []);
    const far = await as('zlecenie', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 60, mercenary: { id, perHour: 300 } });
    assert.equal(far.data.error.code, 'mercenary_spread', JSON.stringify(far.data).slice(0, 600));

    await set('Zleceniodawca', 'class_level = 40, gold = 299');
    const poor = await as('zlecenie', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 60, mercenary: { id, perHour: 300 } });
    assert.equal(poor.data.error.code, 'no_gold');

    await set('Zleceniodawca', 'gold = 10000, level = ?', from - 1);
    const young = await as('zlecenie', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 15, mercenary: { id, perHour: 300 } });
    assert.equal(young.data.error.code, 'locked');
    // Nothing paid, nothing hired.
    assert.equal((await row('Zleceniodawca')).gold, 10000);
    assert.equal(JSON.parse((await activityOf('Najemna')).options).hired, undefined);
  });
});

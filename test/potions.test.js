// Potions on explorations: drunk in fights (a healing one below the mark, a
// mana one when a skill lacks mana, each kind once a fight), taken along and
// counted in the threat, a speed potion from the bag for a time, and all of
// it through the API.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  createRng,
  drinkSpeed,
  faintChances,
  monsterCombatant,
  playerCombatant,
  potionsPerKind,
  simulateFight,
  simulateHunt,
  speedWindow,
  threatSamples,
} from '../src/engine/index.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const heal = { id: 'lesser-healing', accusative: 'Mniejszą miksturę leczenia', amount: 0.2, below: 0.4 };
const mana = { id: 'lesser-mana', accusative: 'Mniejszą miksturę many', amount: 0.3 };

// A character at class level 10 or more, with one skill learned.
function fighter(classId, skillId, hpShare = 1) {
  const { character, equipped } = typicalCharacter(classId, 12, content);
  const skilled = { ...character, classLevel: Math.max(character.classLevel, 10), skills: skillId ? { [skillId]: 1 } : {} };
  const unit = playerCombatant({ character: skilled, equipped, name: 'Mira' }, content);
  return { ...unit, hp: Math.round(unit.maxHp * hpShare) };
}
// A foe that does not fall quickly, so a fight lasts many moves.
const sturdy = (monsterId, level) => ({ ...monsterCombatant({ monsterId, level, id: 'e0', name: 'Wróg' }, content), hp: 5000, maxHp: 5000 });
const fight = (seed, ally) => simulateFight({ allies: [ally], enemies: [sturdy('boar', 12)], rng: createRng(seed), content, record: true });
const drinks = (result, effect) => result.events.filter((event) => event.kind === 'potion' && event.effect === effect);

describe('potions in fights', () => {
  test('a healing potion is drunk once, the moment HP falls below the mark, and heals 20% of max HP', () => {
    const ally = fighter('warrior', null, 0.6);
    const result = fight('lecz', { ...ally, potions: { heal } });
    const [drunk, ...more] = drinks(result, 'heal');
    assert.ok(drunk, 'drunk');
    assert.equal(more.length, 0, 'once a fight');
    assert.equal(drunk.amount, Math.round(0.2 * ally.maxHp));
    assert.equal(drunk.text, `Mira wypija Mniejszą miksturę leczenia: +${drunk.amount} HP.`);
    // The blow before it took HP below 40%.
    const before = result.events[result.events.indexOf(drunk) - 1];
    assert.ok(before.hp < 0.4 * ally.maxHp && before.hp > 0);
    assert.equal(drunk.hp, before.hp + drunk.amount);
    assert.deepEqual(result.drunk, ['lesser-healing']);
    // Without potions the fight draws the same numbers as before.
    assert.equal(drinks(fight('lecz', ally), 'heal').length, 0);
  });

  test('a mana potion is drunk once, when a skill lacks mana, and the skill goes on', () => {
    const ally = fighter('warrior', 'power-strike');
    const uses = (result) => result.events.filter((event) => event.skill === 'power-strike' && ['hit', 'crit', 'dodge'].includes(event.kind)).length;
    const without = fight('mana', ally);
    const withPotion = fight('mana', { ...ally, potions: { mana } });
    const [drunk, ...more] = drinks(withPotion, 'mana');
    assert.ok(drunk && more.length === 0);
    assert.equal(drunk.amount, Math.round(0.3 * ally.maxMana));
    assert.equal(drunk.text, `Mira wypija Mniejszą miksturę many: +${drunk.amount} many.`);
    assert.ok(uses(withPotion) > uses(without), 'more strikes with the potion');
  });

  test('an exploration takes at most one potion of a kind for each fight, and drinks no more than it took', () => {
    assert.deepEqual([1, 5, 15, 60, 240].map((minutes) => potionsPerKind(minutes, content)), [1, 2, 3, 4, 5]);
    const { character, equipped } = typicalCharacter('warrior', 26, content);
    let drunk = 0;
    for (let i = 0; i < 20; i++) {
      const hunt = simulateHunt(
        { character, equipped, hp: 9999, name: 'Mira', areaId: 'mossy-boulders', minutes: 60, seed: `w${i}`, potions: { 'lesser-healing': 2 }, healBelow: 0.4 },
        content,
      );
      const used = hunt.potionsUsed['lesser-healing'] ?? 0;
      assert.ok(used <= 2);
      for (const each of hunt.fights) assert.ok(each.events.filter((event) => event.kind === 'potion').length <= 1);
      drunk += used;
    }
    assert.ok(drunk > 0);
  });

  test('a speed potion speeds up the fights of its minutes', () => {
    const { character, equipped } = typicalCharacter('archer', 8, content);
    const ms = 30 * 60000;
    const hunt = simulateHunt({ character, equipped, hp: 9999, name: 'Mira', areaId: 'windfalls-edge', minutes: 60, seed: 'speed', speed: { bonus: 0.15, ms } }, content);
    const fast = hunt.fights.filter((each) => each.t < ms);
    assert.equal(hunt.speedFights, fast.length);
    const plain = simulateHunt({ character, equipped, hp: 9999, name: 'Mira', areaId: 'windfalls-edge', minutes: 60, seed: 'speed' }, content);
    assert.ok(Math.abs(hunt.fights[0].allies[0].speed - plain.fights[0].allies[0].speed * 1.15) < 0.02);
    const late = hunt.fights.find((each) => each.t >= ms);
    if (late) assert.equal(late.allies[0].speed, plain.fights[0].allies[0].speed);
  });

  test('a speed potion lasts its minutes from now, and another adds as many', () => {
    const speed = content.potionsById['lesser-speed'];
    const once = drinkSpeed({}, speed, 1000);
    assert.deepEqual(once.speed, { until: 1000 + 30 * 60000, bonus: 0.15 });
    assert.equal(drinkSpeed(once, speed, 2000).speed.until, 1000 + 60 * 60000);
    assert.deepEqual(speedWindow(once, 1000 + 20 * 60000, 60), { bonus: 0.15, ms: 10 * 60000 });
    assert.deepEqual(speedWindow(once, 1000, 15), { bonus: 0.15, ms: 15 * 60000 });
    assert.equal(speedWindow(once, 1000 + 30 * 60000, 60), null);
  });

  test('healing potions taken along lower the chance of fainting', () => {
    const { character, equipped } = typicalCharacter('shadow', 20, content);
    const input = { character, equipped, hp: 9999, areaId: 'mossy-boulders' };
    const samples = threatSamples(input, content);
    const plain = faintChances(input, content, samples);
    const none = faintChances({ ...input, healing: { count: 0, amount: 0.2, below: 0.4 } }, content, samples);
    const healed = faintChances({ ...input, healing: { count: 5, amount: 0.2, below: 0.4 } }, content, samples);
    assert.deepEqual(none, plain);
    for (const minutes of Object.keys(plain)) assert.ok(healed[minutes] <= plain[minutes] + 1e-12, `${minutes} min`);
    assert.ok(healed[60] < plain[60] * 0.8, `${healed[60]} vs ${plain[60]}`);
  });
});

describe('potions through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('pijaczka'));
    await call('POST', '/api/character', { cookie, body: { name: 'Pijaczka', classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare(`UPDATE characters SET level = 10, class_level = 10, xp = 0, potions = '{"lesser-healing":5,"lesser-mana":2,"lesser-speed":2}'`).run();
  });

  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const hunt = (body) => call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30, ...body } });
  const finish = async () => (await db()).prepare('UPDATE activities SET started_at = started_at - 86400000, ends_at = ?').bind(Date.now() - 1).run();
  const drink = (potionId) => call('POST', '/api/potions/drink', { cookie, body: { potionId } });

  test('the bag tells which potions go along and which are drunk', async () => {
    const { potions, professions } = await character();
    assert.deepEqual(potions.map((potion) => [potion.id, potion.fight, potion.drink]), [
      ['lesser-healing', 'heal', true],
      ['lesser-mana', 'mana', false],
      ['lesser-speed', null, true],
    ]);
    assert.equal(professions.potionUse.healBelow, 0.4);
    assert.deepEqual(professions.potionUse.fightsByMinutes[0], [1, 1]);
  });

  test('an exploration takes known potions, as many as the character has and the fights allow', async () => {
    const error = async (body) => (await hunt(body)).data.error?.code;
    assert.equal(await error({ potions: { 'lesser-speed': 1 } }), 'invalid_potions');
    assert.equal(await error({ potions: { nothing: 1 } }), 'invalid_potions');
    assert.equal(await error({ potions: { 'lesser-mana': 3 } }), 'invalid_potions');
    assert.equal(await error({ potions: { 'lesser-healing': 4 } }), 'invalid_potions');
    assert.equal(await error({ potions: { 'lesser-healing': 1 }, healBelow: 0.45 }), 'invalid_heal_below');
    const threat = await call('GET', '/api/hunts/options?area=fox-ravines&heal=3&below=0.5', { cookie });
    assert.equal(threat.status, 200);
    assert.ok(threat.data.areas[0].threat[30]);

    // At a third of the HP the first blow taken calls for the potion.
    const { maxHp } = await character();
    await set('hp = ?, hp_at = ?', Math.round(maxHp / 3), Date.now());
    assert.equal((await hunt({ areaId: 'fox-ravines', potions: { 'lesser-healing': 3, 'lesser-mana': 0 }, healBelow: 0.5 })).status, 201);
    await finish();
    const { report, character: after } = (await call('POST', '/api/hunts/claim', { cookie })).data;
    const used = report.potionsUsed['lesser-healing'] ?? 0;
    assert.ok(used >= 1 && used <= 3, `${used}`);
    assert.equal(after.potions.find((potion) => potion.id === 'lesser-healing').count, 5 - used);
    const events = report.fights.flatMap((each) => each.events.filter((event) => event.kind === 'potion'));
    assert.equal(events.length, used);
    assert.deepEqual(report.summary.potions, [`Zużyte mikstury: ${used} × Mniejsza mikstura leczenia.`]);
  });

  test('"Wypij" heals now or starts a speed potion; a mana potion works only in fights', async () => {
    await set('hp = ?, hp_at = ?', 99999, Date.now());
    assert.deepEqual([(await drink('lesser-healing')).status, (await drink('lesser-healing')).data.error.code], [409, 'full_hp']);
    assert.equal((await drink('lesser-mana')).data.error.code, 'fight_only');
    const { maxHp } = await character();
    await set('hp = ?, hp_at = ?', 10, Date.now());
    const healed = await drink('lesser-healing');
    assert.equal(healed.status, 200);
    assert.equal(healed.data.text, `Postać wypija Mniejszą miksturę leczenia: +${Math.round(0.2 * maxHp)} HP.`);
    assert.ok(Math.abs(healed.data.character.hp - (10 + Math.round(0.2 * maxHp))) <= 1);
    assert.equal(healed.data.character.potions[0].count, 4);

    const before = Date.now();
    const sped = await drink('lesser-speed');
    assert.equal(sped.data.text, 'Postać wypija Mniejszą miksturę szybkości. Ruchy w walkach szybsze o 15% przez 30 minut.');
    const { until, bonus } = sped.data.character.speedBuff;
    assert.equal(bonus, 0.15);
    assert.ok(until >= before + 30 * 60000 && until <= Date.now() + 30 * 60000);
    const again = (await drink('lesser-speed')).data.character;
    assert.equal(again.speedBuff.until, until + 30 * 60000);
    assert.equal(again.potions.find((potion) => potion.id === 'lesser-speed'), undefined);

    // An exploration started meanwhile goes faster for those minutes.
    await set('hp = ?, hp_at = ?', maxHp, Date.now());
    await hunt({});
    await finish();
    const { report } = (await call('POST', '/api/hunts/claim', { cookie })).data;
    assert.deepEqual(report.summary.potions, [`Mikstura szybkości działała w walkach: ${report.fights.length} z ${report.fights.length}.`]);
  });
});

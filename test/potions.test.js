// Potions on explorations: drunk in fights (a healing one below the mark, a
// mana one when a skill lacks mana, an antidote when poisoned, a fern brew on
// fainting, each kind once a fight and the strongest first), taken along and
// counted in the threat, the potions for a time from the bag, and all of it
// through the API.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  addBuff,
  buffWindows,
  carryLimit,
  createRng,
  drinkTimed,
  faintChances,
  fightPotions,
  monsterCombatant,
  playerCombatant,
  potionsPerKind,
  simulateFight,
  simulateHunt,
  threatSamples,
} from '../src/engine/index.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const heal = { id: 'lesser-healing', accusative: 'Mniejszą miksturę leczenia', amount: 0.2, below: 0.4 };
const mana = { id: 'lesser-mana', accusative: 'Mniejszą miksturę many', amount: 0.3 };
const cure = { id: 'antidote', accusative: 'Odtrutkę', amount: 1, cures: 'poisoned' };
const revive = { id: 'fern-brew', accusative: 'Napar z kwiatu paproci', amount: 0.3 };

// A character at class level 10 or more, with one skill learned.
function fighter(classId, skillId, hpShare = 1) {
  const { character, equipped } = typicalCharacter(classId, 12, content);
  const skilled = { ...character, classLevel: Math.max(character.classLevel, 10), skills: skillId ? { [skillId]: 1 } : {} };
  const unit = playerCombatant({ character: skilled, equipped, name: 'Mira' }, content);
  return { ...unit, hp: Math.round(unit.maxHp * hpShare) };
}
// A foe that does not fall quickly, so a fight lasts many moves.
const sturdy = (monsterId, level) => ({ ...monsterCombatant({ monsterId, level, id: 'e0', name: 'Wróg' }, content), hp: 5000, maxHp: 5000 });
const fight = (seed, ally, monsterId = 'boar') => simulateFight({ allies: [ally], enemies: [sturdy(monsterId, 12)], rng: createRng(seed), content, record: true });
const drinks = (result, effect) => result.events.filter((event) => event.kind === 'potion' && event.effect === effect);
const firstBlow = (result, actor) => result.events.find((event) => event.actor === actor && ['hit', 'crit'].includes(event.kind));

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

  test('an antidote is drunk the moment the poison lands, takes it off and keeps it off to the end of the fight', () => {
    const ally = fighter('warrior', null);
    const poisoned = (event) => event.target === ally.id && event.effect === 'Zatrucie';
    const result = fight('jad', { ...ally, potions: { cure } }, 'viper');
    const landed = result.events.filter((event) => event.kind === 'effect' && poisoned(event));
    assert.equal(landed.length, 1, 'it lands once');
    const drunk = result.events[result.events.indexOf(landed[0]) + 1];
    assert.deepEqual([drunk.kind, drunk.effect, drunk.cleared], ['potion', 'cure', 'Zatrucie']);
    assert.equal(drunk.text, 'Mira wypija Odtrutkę: Zatrucie znika i nie wróci do końca walki.');
    assert.equal(result.events.filter((event) => event.kind === 'tick' && poisoned(event)).length, 0);
    assert.deepEqual(result.drunk, ['antidote']);
    assert.ok(fight('jad', ally, 'viper').events.some((event) => event.kind === 'tick' && poisoned(event)), 'without it the poison ticks');
  });

  test('a fern brew raises the character once, with 30% of max HP, instead of fainting', () => {
    const ally = fighter('mage', null, 0.3);
    const result = fight('paproc', { ...ally, potions: { revive } });
    const [rose, ...more] = drinks(result, 'revive');
    assert.ok(rose && more.length === 0);
    assert.equal(rose.hp, Math.round(0.3 * ally.maxHp));
    assert.equal(rose.text, `Mira pada, ale wypija Napar z kwiatu paproci i wstaje z ${rose.hp} HP.`);
    assert.equal(result.events[result.events.indexOf(rose) - 1].hp, 0);
    assert.ok(!result.events.slice(0, result.events.indexOf(rose)).some((event) => event.kind === 'kill'), 'no faint before it');
    assert.deepEqual(result.drunk, ['fern-brew']);
  });

  test('the mistletoe elixir lessens magical blows only, the strength brew strengthens the character’s', () => {
    const ally = fighter('warrior', null);
    const warded = { ...ally, ward: 0.2 };
    const magic = [fight('jemiola', ally, 'planetnik'), fight('jemiola', warded, 'planetnik')].map((result) => firstBlow(result, 'e0').damage);
    assert.ok(Math.abs(magic[1] - magic[0] * 0.8) <= 1, `${magic}`);
    const physical = [fight('jemiola', ally), fight('jemiola', warded)].map((result) => firstBlow(result, 'e0').damage);
    assert.equal(physical[1], physical[0]);
    const blows = [fight('sila', ally), fight('sila', { ...ally, damageBonus: 0.1 })].map((result) => firstBlow(result, ally.id).damage);
    assert.ok(Math.abs(blows[1] - blows[0] * 1.1) <= 1, `${blows}`);
  });

  test('the strongest potion of a kind is drunk first, and a fern brew goes along one at a time', () => {
    const kit = (left) => fightPotions(left, 0.4, content);
    assert.equal(kit({ 'lesser-healing': 2, healing: 1, 'greater-healing': 1 }).heal.id, 'greater-healing');
    assert.equal(kit({ 'lesser-healing': 2, healing: 1, 'greater-healing': 0 }).heal.id, 'healing');
    assert.deepEqual(kit({ antidote: 1, 'fern-brew': 1, 'lesser-speed': 1 }), { cure, revive });
    assert.deepEqual([carryLimit(content.potionsById['fern-brew'], 5), carryLimit(content.potionsById.healing, 5)], [1, 5]);
  });

  test('an exploration takes at most one potion of a kind for each fight, and drinks no more than it took', () => {
    assert.deepEqual([1, 5, 15, 30, 60, 120, 240].map((minutes) => potionsPerKind(minutes, content)), [1, 2, 3, 4, 6, 8, 10]);
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
    assert.deepEqual(hunt.buffFights, { speed: fast.length });
    const plain = simulateHunt({ character, equipped, hp: 9999, name: 'Mira', areaId: 'windfalls-edge', minutes: 60, seed: 'speed' }, content);
    assert.ok(Math.abs(hunt.fights[0].allies[0].speed - plain.fights[0].allies[0].speed * 1.15) < 0.02);
    const late = hunt.fights.find((each) => each.t >= ms);
    if (late) assert.equal(late.allies[0].speed, plain.fights[0].allies[0].speed);
  });

  test('the stoneskin brew, the focus draught and the aconite oil work in the fights of their minutes', () => {
    const { character, equipped } = typicalCharacter('cleric', 30, content);
    const ms = 30 * 60000;
    const input = { character, equipped, hp: 9999, name: 'Mira', areaId: 'mossy-boulders', minutes: 60, seed: 'wywary' };
    const plain = simulateHunt(input, content);
    const brewed = simulateHunt({ ...input, buffs: { armor: { bonus: 0.15, ms }, focus: { bonus: 0.1, ms }, poison: { bonus: 0.5, ms: 60 * 60000 } } }, content);
    const early = brewed.fights.filter((each) => each.t < ms).length;
    assert.deepEqual(brewed.buffFights, { armor: early, focus: early, poison: brewed.fights.length });
    assert.equal(brewed.fights[0].allies[0].armor, Math.round(plain.fights[0].allies[0].armor * 1.15));
    const late = brewed.fights.find((each) => each.t >= ms);
    if (late) assert.equal(late.allies[0].armor, plain.fights[0].allies[0].armor);
    // The oil poisons the foes now and then; the character alone never does.
    const poisons = (hunt) => hunt.fights.flatMap((each) => each.events).filter((event) => event.kind === 'effect' && event.actor === 'a0' && event.effect === 'Zatrucie').length;
    assert.equal(poisons(plain), 0);
    assert.ok(poisons(brewed) > 0);
    // Focus: Intelekt and Mądrość 10% higher, and the mana they give.
    const unit = (statBoost) => playerCombatant({ character, equipped, name: 'Mira', statBoost }, content);
    const [before, after] = [unit(null), unit({ intellect: 0.1, wisdom: 0.1 })];
    assert.ok(after.maxMana > before.maxMana && after.wisdom === Math.round(before.wisdom * 1.1), `${before.wisdom} → ${after.wisdom}`);
    assert.equal(after.maxHp, before.maxHp);
  });

  test('a potion for a time lasts 30 minutes of explorations, each one more adds as many, a weaker one less', () => {
    const speed = content.potionsById['lesser-speed'];
    const once = drinkTimed({}, speed);
    assert.deepEqual(once.speed, { ms: 30 * 60000, bonus: 0.15 });
    const thrice = drinkTimed(drinkTimed(once, speed), speed);
    assert.equal(thrice.speed.ms, 90 * 60000);
    // An exploration takes what it covers and gives back what it did not use.
    assert.deepEqual(buffWindows(thrice, 60), { speed: { bonus: 0.15, ms: 60 * 60000 } });
    assert.deepEqual(buffWindows(once, 60), { speed: { bonus: 0.15, ms: 30 * 60000 } });
    assert.deepEqual(addBuff(once, 'speed', -30 * 60000), {});
    assert.deepEqual(addBuff(addBuff(thrice, 'speed', -60 * 60000), 'speed', 20 * 60000, 0.15).speed, { ms: 50 * 60000, bonus: 0.15 });
    assert.deepEqual(buffWindows({}, 60), {});
    // Two strengths of one kind: the stronger bonus, the weaker one's
    // minutes worth what they are at it, whichever comes first.
    const greater = content.potionsById['greater-speed'];
    const mixed = Math.round(30 * 60000 + (30 * 60000 * 0.15) / 0.35);
    assert.deepEqual(drinkTimed(drinkTimed({}, greater), speed).speed, { ms: mixed, bonus: 0.35 });
    assert.deepEqual(drinkTimed(once, greater).speed, { ms: mixed, bonus: 0.35 });
    // Kinds keep their own time.
    const both = drinkTimed(once, content.potionsById['stoneskin-brew']);
    assert.deepEqual(both, { speed: { ms: 30 * 60000, bonus: 0.15 }, armor: { ms: 30 * 60000, bonus: 0.15 } });
    assert.deepEqual(Object.keys(buffWindows(both, 15)), ['speed', 'armor']);
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
    // Alchemia at level 5 knows all three recipes.
    await (await db())
      .prepare(`UPDATE characters SET level = 10, class_level = 10, xp = 0, professions = '{"alchemy":{"level":5,"xp":0}}', potions = '{"lesser-healing":5,"lesser-mana":2,"lesser-speed":2}'`)
      .run();
  });

  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const hunt = (body) => call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30, ...body } });
  const finish = async () => (await db()).prepare('UPDATE activities SET started_at = started_at - 86400000, ends_at = ?').bind(Date.now() - 1).run();
  const drink = (potionId) => call('POST', '/api/potions/drink', { cookie, body: { potionId } });
  const speedBuff = (character) => character.buffs.find((buff) => buff.kind === 'speed');

  test('the bag tells which potions go along and which are drunk', async () => {
    const { potions, professions } = await character();
    assert.deepEqual(potions.map((potion) => [potion.id, potion.fight, potion.drink, potion.carry, potion.verb]), [
      ['lesser-healing', 'heal', true, null, 'Wypij'],
      ['lesser-mana', 'mana', false, null, 'Wypij'],
      ['lesser-speed', null, true, null, 'Wypij'],
    ]);
    assert.equal(professions.potionUse.healBelow, 0.4);
    assert.deepEqual(professions.potionUse.fightsByMinutes[0], [1, 1]);
  });

  test('an exploration takes known potions, as many as the character has and the fights allow', async () => {
    const error = async (body) => (await hunt(body)).data.error?.code;
    assert.equal(await error({ potions: { 'lesser-speed': 1 } }), 'invalid_potions');
    assert.equal(await error({ potions: { nothing: 1 } }), 'invalid_potions');
    assert.equal(await error({ potions: { 'lesser-mana': 3 } }), 'invalid_potions');
    assert.equal(await error({ potions: { 'lesser-healing': 5 } }), 'invalid_potions');
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

    const sped = await drink('lesser-speed');
    assert.equal(sped.data.text, 'Postać wypija Mniejszą miksturę szybkości. Ruchy w walkach szybsze o 15% przez 30 min wypraw.');
    assert.deepEqual(sped.data.character.buffs, [{ kind: 'speed', ms: 30 * 60000, until: null, bonus: 0.15, label: 'Szybkość: ruchy w walkach +15%', potion: 'lesser-speed' }]);
    const again = await drink('lesser-speed');
    assert.equal(again.data.text, 'Postać wypija Mniejszą miksturę szybkości. Ruchy w walkach szybsze o 15% przez 60 min wypraw.');
    assert.equal(speedBuff(again.data.character).ms, 60 * 60000);
    assert.equal(again.data.character.potions.find((potion) => potion.id === 'lesser-speed'), undefined);

    // An exploration goes faster all along; its 30 minutes are used up only
    // as its report is claimed (the author: "Odbierz raport zużywa czas
    // mikstury"), and the rest waits for the next one.
    await set('hp = ?, hp_at = ?', maxHp, Date.now());
    await hunt({});
    const during = speedBuff(await character());
    assert.deepEqual([during.ms, during.until], [60 * 60000, null]);
    await finish();
    const { report, character: after } = (await call('POST', '/api/hunts/claim', { cookie })).data;
    assert.deepEqual(report.summary.potions, [`Mikstura szybkości działała w walkach: ${report.fights.length} z ${report.fights.length}.`]);
    assert.deepEqual(after.buffs, [{ kind: 'speed', ms: 30 * 60000, until: null, bonus: 0.15, label: 'Szybkość: ruchy w walkach +15%', potion: 'lesser-speed' }]);

    // One called back uses up nothing.
    await hunt({});
    assert.equal(speedBuff(await character()).ms, 30 * 60000);
    await call('POST', '/api/hunts/cancel', { cookie });
    const back = speedBuff(await character());
    assert.deepEqual([back.ms, back.until], [30 * 60000, null]);

    // One started before 0.0.74 had its time taken at its start: its claim
    // takes nothing more.
    await hunt({});
    const database = await db();
    await database.prepare("UPDATE activities SET options = json_remove(options, '$.spend')").run();
    await set(`buffs = '{"speed":{"ms":600000,"bonus":0.15}}'`);
    await finish();
    await call('POST', '/api/hunts/claim', { cookie });
    assert.equal(speedBuff(await character()).ms, 10 * 60000);
  });

  test('the potions of later levels: what goes along, what is drunk or put on the blade', async () => {
    await set(`professions = '{"alchemy":{"level":90,"xp":0}}', potions = '{"antidote":1,"stoneskin-brew":1,"aconite-oil":1,"fern-brew":2}'`);
    const { potions } = await character();
    assert.deepEqual(potions.map((potion) => [potion.id, potion.fight, potion.drink, potion.carry, potion.verb]), [
      ['antidote', 'cure', false, null, 'Wypij'],
      ['stoneskin-brew', null, true, null, 'Wypij'],
      ['aconite-oil', null, true, null, 'Nałóż'],
      ['fern-brew', 'revive', false, 1, 'Wypij'],
    ]);
    const refused = await Promise.all(['antidote', 'fern-brew'].map(drink));
    assert.deepEqual(refused.map((each) => [each.data.error.code, each.data.error.message]), [
      ['fight_only', 'Ta mikstura działa sama na wyprawie.'],
      ['fight_only', 'Ta mikstura działa sama na wyprawie.'],
    ]);
    assert.equal((await drink('stoneskin-brew')).data.text, 'Postać wypija Wywar kamiennej skóry. Pancerz większy o 15% przez 30 min wypraw.');
    const oiled = await drink('aconite-oil');
    assert.equal(oiled.data.text, 'Postać nakłada Olejek z tojadu na broń. Przez 30 min wypraw każdy cios ma 50% szans na Zatrucie.');
    assert.deepEqual(oiled.data.character.buffs.map(({ kind, ms, label }) => [kind, ms, label]), [
      ['armor', 30 * 60000, 'Twarda skóra: pancerz +15%'],
      ['poison', 30 * 60000, 'Trucizna na broni: 50% szans na Zatrucie przy ciosie'],
    ]);

    // A fern brew goes along one at a time; both kinds for a time work all
    // through a 30-minute exploration.
    assert.equal((await hunt({ potions: { 'fern-brew': 2 } })).data.error.code, 'invalid_potions');
    assert.equal((await hunt({ potions: { 'fern-brew': 1, antidote: 1 } })).status, 201);
    await finish();
    const { report, character: after } = (await call('POST', '/api/hunts/claim', { cookie })).data;
    const all = report.fights.length;
    assert.deepEqual(report.summary.potions.slice(-2), [`Wywar kamiennej skóry działał w walkach: ${all} z ${all}.`, `Olejek z tojadu działał w walkach: ${all} z ${all}.`]);
    assert.deepEqual(after.buffs, []);
  });
});

// Jagna's rare recipes of Alchemia (question 121 A: "zaufanym zdradza
// rzadkie receptury"): six recipes she teaches by herself, free, three at
// the standing Zaufany of the relation with her and three at Przyjaciel.
// Below its standing a recipe is unknown everywhere in the game, and the
// Pracownia shows a shadow that says where it comes from; taught, it still
// waits for its level of Alchemia, as any recipe. Her shelf holds its herbs
// from that standing, the trade that reaches it names the recipes, and the
// Encyklopedia tells where they come from.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  brewingReport,
  companionGift,
  drawQuests,
  encyclopediaView,
  herbalistRecipes,
  herbalistStock,
  knownPotions,
  orderGoods,
  recipeTaught,
  recipesTaughtBetween,
} from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const NOW = Date.UTC(2026, 10, 6, 10, 0);
const { standings, herbalist } = content.settlement;
const points = (id) => standings.find((standing) => standing.id === id).points;
// The relations of a character at a standing with Jagna, `more` points over it.
const at = (id, more = 0) => ({ [herbalist.resident]: points(id) + more });
const ids = (potions) => potions.map((potion) => potion.id);
const TRUSTED = ['owl-draught', 'bearskin-brew', 'wolf-strength-brew'];
const FRIEND = ['burn-brew', 'evil-eye-brew', 'jagna-balm'];
const RARE = [...TRUSTED, ...FRIEND];

describe("Jagna's rare recipes in the engine", () => {
  test("six recipes, three from Zaufany and three from Przyjaciel, each above the System's potion it answers", () => {
    assert.deepEqual(ids(content.potions.filter((potion) => potion.taught === 'trusted')), TRUSTED);
    assert.deepEqual(ids(content.potions.filter((potion) => potion.taught === 'friend')), FRIEND);
    const answers = { 'owl-draught': 'focus-draught', 'bearskin-brew': 'stoneskin-brew', 'wolf-strength-brew': 'strength-brew', 'evil-eye-brew': 'mistletoe-elixir', 'jagna-balm': 'greater-healing' };
    for (const [id, system] of Object.entries(answers)) {
      const [rare, base] = [content.potionsById[id], content.potionsById[system]];
      const [kind] = Object.keys(base.effect);
      assert.ok(rare.effect[kind] > base.effect[kind] && rare.level > base.level, id);
      assert.equal(rare.fights, base.fights, id);
    }
    // The burn brew does for Oparzenie what the antidote does for Zatrucie.
    const burn = content.potionsById['burn-brew'];
    assert.deepEqual([burn.effect, burn.cures], [content.potionsById.antidote.effect, 'burning']);
  });

  test('a rare recipe is unknown below its standing with Jagna, known at it, and still waits for its level of Alchemia', () => {
    const system = ids(knownPotions(100, content));
    assert.ok(RARE.every((id) => !system.includes(id)));
    assert.deepEqual(ids(knownPotions(100, content, at('trusted', -1))), system);
    const rare = (relations, level = 100) => ids(knownPotions(level, content, relations)).filter((id) => !system.includes(id));
    assert.deepEqual(rare(at('trusted')), TRUSTED);
    assert.deepEqual(rare(at('friend', -1)), TRUSTED);
    assert.deepEqual(rare(at('friend')), RARE);
    // Taught, a recipe waits for its level as any other: Sowi napar from 40.
    assert.deepEqual(rare(at('friend'), 39), []);
    assert.deepEqual(rare(at('friend'), 40), ['owl-draught']);
    // The System's recipes need no teaching, and no other resident teaches.
    assert.ok(content.potions.filter((potion) => !potion.taught).every((potion) => recipeTaught(potion, {}, content)));
    assert.ok(!recipeTaught(content.potionsById['owl-draught'], { headman: 5000 }, content));
  });

  test('her shelf holds the herbs of every recipe she teaches from its standing on, so the rule needs nothing more', () => {
    for (const potion of content.potions.filter((one) => one.taught)) {
      const shelf = new Set(herbalistStock(points(potion.taught), content).herbs.map((herb) => herb.id));
      for (const id of Object.keys(potion.herbs)) assert.ok(shelf.has(id), `${potion.id}: ${id}`);
    }
  });

  test('her Chata knows the recipes taught and the standing that teaches the next; a trade that reaches it names them', () => {
    const start = herbalistRecipes(0, content);
    assert.deepEqual([start.taught, start.next.standing.id, ids(start.next.potions)], [[], 'trusted', TRUSTED]);
    const trusted = herbalistRecipes(points('trusted'), content);
    assert.deepEqual([ids(trusted.taught), trusted.next.standing.id, ids(trusted.next.potions)], [TRUSTED, 'friend', FRIEND]);
    const friend = herbalistRecipes(points('friend') + 300, content);
    assert.deepEqual([ids(friend.taught), friend.next], [RARE, null]);
    assert.deepEqual(ids(recipesTaughtBetween(points('trusted') - 3, points('trusted') + 2, content)), TRUSTED);
    assert.deepEqual(recipesTaughtBetween(points('trusted'), points('trusted') + 9, content), []);
  });

  test('the report of a brewing reveals a rare recipe at its level only once Jagna has taught it', () => {
    const report = (relations) =>
      brewingReport(
        {
          potion: content.potionsById['lesser-healing'],
          minutes: 60,
          startedAt: 0,
          endsAt: 3600000,
          seed: 's',
          made: { count: 6, bonus: 0 },
          stored: { 'lesser-healing': 6 },
          lost: {},
          stopped: false,
          before: { level: 39, xp: 0 },
          after: { level: 41, xp: 0 },
          character: newCharacter('cleric', { level: 40 }),
          xp: 10,
          work: { level: 40, xp: 0, timePoints: 0, messages: [] },
          relations,
        },
        content,
      );
    assert.deepEqual(report({}).revealed, []);
    const taught = report(at('trusted'));
    assert.deepEqual(taught.revealed, ['owl-draught']);
    assert.ok(taught.system.includes('System odsłania nowy przepis: Sowi napar'));
  });

  test("orders, a companion's gift and narrator quests ask only for the recipes Jagna has taught", () => {
    const character = newCharacter('warrior', { level: 60, classLevel: 60, met: [], professions: { alchemy: { level: 100, xp: 0 } } });
    const ordered = (relations) => orderGoods({ ...character, relations }, content).filter((good) => good.kind === 'potion').map((good) => good.key);
    assert.ok(ordered({}).length > 0 && RARE.every((id) => !ordered({}).includes(id)));
    assert.deepEqual(ordered(at('friend')).filter((id) => RARE.includes(id)), RARE);
    const brewer = content.settlement.companions.professions.find((profession) => profession.goods === 'potion');
    const gifts = (relations) =>
      Array.from({ length: 60 }, (_, index) => companionGift({ id: `c:${index}`, profession: brewer.id }, { character: { ...character, relations }, seed: 'g' }, NOW, content).key);
    assert.ok(gifts({}).every((key) => !RARE.includes(key)));
    assert.ok(gifts(at('friend')).some((key) => RARE.includes(key)));
    const brews = (relations) =>
      Array.from({ length: 100 }, (_, index) => drawQuests('daily', { character: { ...character, relations }, hasTable: true, hasProfessions: true, seed: `q${index}` }, content))
        .flat()
        .filter((quest) => quest.kind === 'brew')
        .map((quest) => quest.target);
    const plain = brews({});
    assert.ok(plain.length > 0 && plain.every((target) => !RARE.includes(target)));
    assert.ok(brews(at('friend')).some((target) => RARE.includes(target)));
  });

  test('the Encyklopedia counts the rare recipes and tells where each comes from', () => {
    const view = encyclopediaView({ discovered: {}, claimed: [], met: [] }, content);
    assert.equal(view.potions.all, 22);
    const entries = view.potions.tiers.flatMap((tier) => tier.entries);
    assert.deepEqual(entries.find((entry) => entry.id === 'owl-draught').sources, [
      'Alchemia: przepis od 40. poziomu.',
      'Rzadki przepis: zdradza go zielarka Jagna od stopnia relacji Zaufany.',
    ]);
    assert.equal(entries.find((entry) => entry.id === 'jagna-balm').sources[1], 'Rzadki przepis: zdradza go zielarka Jagna od stopnia relacji Przyjaciel.');
    // A recipe of the System says nothing of her.
    assert.deepEqual(entries.find((entry) => entry.id === 'focus-draught').sources, ['Alchemia: przepis od 36. poziomu.']);
  });
});

describe("Jagna's rare recipes through the API", () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on', SETTLEMENT: 'on' });
  let cookie;

  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const relation = (value) => set('settlement = ?', JSON.stringify({ relations: { [herbalist.resident]: value } }));
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const recipe = (one, id) => one.professions.brewing.recipes.find((each) => each.id === id);
  const brew = (body) => call('POST', '/api/professions/brew', { cookie, body });

  beforeEach(async () => {
    ({ cookie } = await signUp('jagna'));
    await call('POST', '/api/character', { cookie, body: { name: 'Zielarz', classId: 'cleric', appearance: 'male' } });
    await set(`level = 25, class_level = 25, gold = 0, professions = '{"alchemy":{"level":45,"xp":0}}'`);
  });

  test('the Pracownia shows a rare recipe as a shadow with the standing and the level, until Jagna teaches it', async () => {
    const before = await character();
    assert.deepEqual(recipe(before, 'owl-draught'), { id: 'owl-draught', level: 40, hidden: true, hint: 'Rzadki przepis Jagny: od stopnia relacji Zaufany i 40. poziomu Alchemii.' });
    assert.deepEqual(recipe(before, 'jagna-balm'), { id: 'jagna-balm', level: 75, hidden: true, hint: 'Rzadki przepis Jagny: od stopnia relacji Przyjaciel i 75. poziomu Alchemii.' });
    await set(`herbs = '{"valerian":30,"st-johns-wort":10}', materials = '{"eagle-owl-feather:unique":5}'`);
    const owlBrew = { recipe: 'owl-draught', count: 1, catalyst: 'eagle-owl-feather:unique' };
    assert.equal((await brew(owlBrew)).data.error.code, 'unknown_recipe');

    await relation(points('trusted'));
    const after = await character();
    const owl = recipe(after, 'owl-draught');
    assert.equal(owl.name, 'Sowi napar');
    assert.deepEqual(owl.herbs.map((herb) => [herb.id, herb.need]), [['valerian', 3], ['st-johns-wort', 1]]);
    assert.equal(owl.catalyst.name, 'Pióro puchacza');
    // Taught, one above the level waits for it, as the System's recipes do.
    assert.equal(recipe(after, 'wolf-strength-brew').hint, 'Ukryte przez System do 50. poziomu Alchemii.');
    assert.equal(recipe(after, 'burn-brew').hint, 'Rzadki przepis Jagny: od stopnia relacji Przyjaciel i 60. poziomu Alchemii.');
    assert.equal((await brew(owlBrew)).status, 201);
  });

  test('a potion of a recipe not taught yet is neither drunk nor taken along, as one got in a Wymiana', async () => {
    await set(`level = 70, class_level = 70, professions = '{"alchemy":{"level":100,"xp":0}}', potions = '{"bearskin-brew":2,"burn-brew":2}'`);
    const drink = (potionId) => call('POST', '/api/potions/drink', { cookie, body: { potionId } });
    const hunt = (potions) => call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30, potions } });
    assert.deepEqual((await character()).potions.map((potion) => [potion.id, potion.known]), [['bearskin-brew', false], ['burn-brew', false]]);
    assert.equal((await drink('bearskin-brew')).data.error.code, 'unknown_recipe');
    assert.equal((await hunt({ 'burn-brew': 1 })).data.error.code, 'unknown_recipe');

    await relation(points('trusted'));
    assert.equal((await drink('bearskin-brew')).data.text, 'Postać wypija Wywar niedźwiedziej skóry. Pancerz większy o 30% przez 2 walki.');
    assert.equal((await hunt({ 'burn-brew': 1 })).data.error.code, 'unknown_recipe');

    await relation(points('friend'));
    assert.equal((await hunt({ 'burn-brew': 1 })).status, 201);
  });

  test('a trade that brings the relation to a standing makes Jagna teach its recipes, and her Chata tells them', async () => {
    await relation(points('trusted') - 1);
    await set(`herbs = '{"comfrey":400}'`);
    const chata = (await call('GET', '/api/settlement', { cookie })).data.settlement.herbalist.recipes;
    assert.deepEqual(chata, { title: 'Rzadkie przepisy', taught: [], next: 'Od stopnia relacji Zaufany Jagna zdradzi Ci 3 rzadkie przepisy Alchemii.' });

    const sell = () => call('POST', '/api/settlement/herbalist', { cookie, body: { kind: 'herb', id: 'comfrey', count: 100 } });
    const sold = await sell();
    assert.ok(sold.data.sold.points >= 1);
    assert.equal(sold.data.sold.taught, 'Jagna zdradza Ci 3 rzadkie przepisy Alchemii: Sowi napar, Wywar niedźwiedziej skóry, Wywar wilczej siły.');
    const { recipes } = sold.data.settlement.herbalist;
    assert.deepEqual(recipes.taught, [
      { id: 'owl-draught', name: 'Sowi napar', note: 'Uwarzysz go w Systemowej Pracowni.' },
      { id: 'bearskin-brew', name: 'Wywar niedźwiedziej skóry', note: 'Uwarzysz go w Systemowej Pracowni.' },
      { id: 'wolf-strength-brew', name: 'Wywar wilczej siły', note: 'Uwarzysz go od 50. poziomu Alchemii.' },
    ]);
    assert.equal(recipes.next, 'Od stopnia relacji Przyjaciel Jagna zdradzi Ci 3 rzadkie przepisy Alchemii.');
    assert.equal(recipe(sold.data.character, 'owl-draught').name, 'Sowi napar');
    // The next trade teaches nothing more.
    assert.equal((await sell()).data.sold.taught, undefined);

    // Buying from her teaches as selling does.
    await relation(points('friend') - 1);
    await set('gold = 100000');
    const bought = await call('POST', '/api/settlement/herbalist/buy', { cookie, body: { id: 'comfrey', count: 100 } });
    assert.ok(bought.data.bought.points >= 1);
    assert.equal(bought.data.bought.taught, 'Jagna zdradza Ci 3 rzadkie przepisy Alchemii: Wywar od oparzeń, Napar od uroków, Balsam Jagny.');
    assert.deepEqual(ids(bought.data.settlement.herbalist.recipes.taught), RARE);
    assert.equal(bought.data.settlement.herbalist.recipes.next, null);
  });
});

// Jagna's rare recipes of Alchemia (question 121 A: "zaufanym zdradza
// rzadkie receptury"): six recipes she teaches by herself, free, three at
// the standing Zaufany and three at Przyjaciel, reached in the relation with
// her or in the reputation of the Bractwo Zielarzy, whichever comes first
// (682 A and C). Below its standing a recipe is unknown everywhere in the
// game, and the Pracownia shows a shadow that says where it comes from;
// taught, it still waits for its level of Alchemia, as any recipe. Her shelf
// holds its herbs from that standing, a trade or an order that reaches it
// names the recipes, and the Encyklopedia tells where they come from.

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
  taughtWords,
  teachingPoints,
} from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const NOW = Date.UTC(2026, 10, 6, 10, 0);
const { standings, herbalist } = content.settlement;
const points = (id) => standings.find((standing) => standing.id === id).points;
// A character's Osada at a standing, `more` points over it: in the relation
// with Jagna, or in the reputation of the Bractwo Zielarzy.
const at = (id, more = 0) => ({ relations: { [herbalist.resident]: points(id) + more }, reputation: {} });
const bractwo = (id, more = 0) => ({ relations: {}, reputation: { [herbalist.brotherhood]: points(id) + more } });
const ids = (potions) => potions.map((potion) => potion.id);
const TRUSTED = ['owl-draught', 'bearskin-brew', 'wolf-strength-brew'];
const FRIEND = ['burn-brew', 'evil-eye-brew', 'jagna-balm'];
const RARE = [...TRUSTED, ...FRIEND];
const TAUGHT_TRUSTED = 'Jagna zdradza Ci 3 rzadkie przepisy Alchemii: Sowi napar, Wywar niedźwiedziej skóry, Wywar wilczej siły.';

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

  test('a rare recipe is unknown below its standing, known at it, and still waits for its level of Alchemia', () => {
    const system = ids(knownPotions(100, content));
    assert.ok(RARE.every((id) => !system.includes(id)));
    assert.deepEqual(ids(knownPotions(100, content, at('trusted', -1))), system);
    const rare = (settlement, level = 100) => ids(knownPotions(level, content, settlement)).filter((id) => !system.includes(id));
    assert.deepEqual(rare(at('trusted')), TRUSTED);
    assert.deepEqual(rare(at('friend', -1)), TRUSTED);
    assert.deepEqual(rare(at('friend')), RARE);
    // Taught, a recipe waits for its level as any other: Sowi napar from 40.
    assert.deepEqual(rare(at('friend'), 39), []);
    assert.deepEqual(rare(at('friend'), 40), ['owl-draught']);
    // The System's recipes need no teaching.
    assert.ok(content.potions.filter((potion) => !potion.taught).every((potion) => recipeTaught(potion, {}, content)));
  });

  test('the relation with Jagna or the reputation of the Bractwo Zielarzy teaches, whichever reaches the standing first (682 A and C)', () => {
    const owl = content.potionsById['owl-draught'];
    const balm = content.potionsById['jagna-balm'];
    // By the relation alone, by the reputation alone, by neither.
    assert.ok(recipeTaught(owl, at('trusted'), content));
    assert.ok(recipeTaught(owl, bractwo('trusted'), content));
    assert.ok(!recipeTaught(owl, { relations: { [herbalist.resident]: points('trusted') - 1 }, reputation: { [herbalist.brotherhood]: points('trusted') - 1 } }, content));
    assert.ok(!recipeTaught(owl, {}, content));
    // The further of the two counts: Przyjaciel in the Bractwo, Obcy with her.
    const mixed = { relations: { [herbalist.resident]: 10 }, reputation: { [herbalist.brotherhood]: points('friend') } };
    assert.equal(teachingPoints(mixed, content), points('friend'));
    assert.ok(recipeTaught(balm, mixed, content));
    assert.deepEqual(ids(knownPotions(100, content, bractwo('friend'))).filter((id) => RARE.includes(id)), RARE);
    // Other residents and other brotherhoods teach nothing.
    assert.ok(!recipeTaught(owl, { relations: { headman: 5000 }, reputation: { smiths: 5000, hunters: 5000 } }, content));
  });

  test('her shelf holds the herbs of every recipe she teaches from its standing on, so the rule needs nothing more', () => {
    for (const potion of content.potions.filter((one) => one.taught)) {
      const shelf = new Set(herbalistStock(points(potion.taught), content).herbs.map((herb) => herb.id));
      for (const id of Object.keys(potion.herbs)) assert.ok(shelf.has(id), `${potion.id}: ${id}`);
    }
  });

  test('her Chata knows the recipes taught and the standing that teaches the next; a change that reaches it names them', () => {
    const start = herbalistRecipes({}, content);
    assert.deepEqual([start.taught, start.next.standing.id, ids(start.next.potions)], [[], 'trusted', TRUSTED]);
    const trusted = herbalistRecipes(bractwo('trusted'), content);
    assert.deepEqual([ids(trusted.taught), trusted.next.standing.id, ids(trusted.next.potions)], [TRUSTED, 'friend', FRIEND]);
    const friend = herbalistRecipes(at('friend', 300), content);
    assert.deepEqual([ids(friend.taught), friend.next], [RARE, null]);
    assert.deepEqual(ids(recipesTaughtBetween(at('trusted', -3), at('trusted', 2), content)), TRUSTED);
    assert.deepEqual(recipesTaughtBetween(at('trusted'), at('trusted', 9), content), []);
    // An order of the Bractwo that takes its reputation over the standing.
    assert.equal(taughtWords(bractwo('trusted', -20), bractwo('trusted'), content), TAUGHT_TRUSTED);
    // Nothing new once the relation had taught them already.
    assert.equal(taughtWords({ ...bractwo('trusted', -20), relations: at('trusted').relations }, { ...bractwo('trusted'), relations: at('trusted').relations }, content), null);
    assert.equal(taughtWords(bractwo('friend', -1), bractwo('friend'), content), 'Jagna zdradza Ci 3 rzadkie przepisy Alchemii: Wywar od oparzeń, Napar od uroków, Balsam Jagny.');
  });

  test('the report of a brewing reveals a rare recipe at its level only once Jagna has taught it', () => {
    const report = (settlement) =>
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
          settlement,
        },
        content,
      );
    assert.deepEqual(report({}).revealed, []);
    const taught = report(bractwo('trusted'));
    assert.deepEqual(taught.revealed, ['owl-draught']);
    assert.ok(taught.system.includes('System odsłania nowy przepis: Sowi napar'));
  });

  test("orders, a companion's gift and narrator quests ask only for the recipes Jagna has taught", () => {
    const character = newCharacter('warrior', { level: 60, classLevel: 60, met: [], professions: { alchemy: { level: 100, xp: 0 } } });
    const ordered = (settlement) => orderGoods({ ...character, settlement }, content).filter((good) => good.kind === 'potion').map((good) => good.key);
    assert.ok(ordered({}).length > 0 && RARE.every((id) => !ordered({}).includes(id)));
    assert.deepEqual(ordered(at('friend')).filter((id) => RARE.includes(id)), RARE);
    assert.deepEqual(ordered(bractwo('trusted')).filter((id) => RARE.includes(id)), TRUSTED);
    const brewer = content.settlement.companions.professions.find((profession) => profession.goods === 'potion');
    const gifts = (settlement) =>
      Array.from({ length: 60 }, (_, index) => companionGift({ id: `c:${index}`, profession: brewer.id }, { character: { ...character, settlement }, seed: 'g' }, NOW, content).key);
    assert.ok(gifts({}).every((key) => !RARE.includes(key)));
    assert.ok(gifts(bractwo('friend')).some((key) => RARE.includes(key)));
    const brews = (settlement) =>
      Array.from({ length: 100 }, (_, index) => drawQuests('daily', { character: { ...character, settlement }, hasTable: true, hasProfessions: true, seed: `q${index}` }, content))
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
      'Rzadki przepis: zdradza go zielarka Jagna od stopnia Zaufany w relacji z nią albo w reputacji Bractwa Zielarzy.',
    ]);
    assert.equal(
      entries.find((entry) => entry.id === 'jagna-balm').sources[1],
      'Rzadki przepis: zdradza go zielarka Jagna od stopnia Przyjaciel w relacji z nią albo w reputacji Bractwa Zielarzy.',
    );
    // A recipe of the System says nothing of her.
    assert.deepEqual(entries.find((entry) => entry.id === 'focus-draught').sources, ['Alchemia: przepis od 36. poziomu.']);
  });
});

describe("Jagna's rare recipes through the API", () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on', SETTLEMENT: 'on' });
  let cookie;

  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  // The Osada with the relation with Jagna and the Bractwo's reputation.
  const osada = (relation, reputation = 0) => set('settlement = ?', JSON.stringify({ relations: { [herbalist.resident]: relation }, reputation: { [herbalist.brotherhood]: reputation } }));
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const recipe = (one, id) => one.professions.brewing.recipes.find((each) => each.id === id);
  const brew = (body) => call('POST', '/api/professions/brew', { cookie, body });
  const hint = (standing, level) => `Rzadki przepis Jagny: od stopnia ${standing} w relacji z Jagną albo w reputacji Bractwa Zielarzy, i od ${level}. poziomu Alchemii.`;
  const next = (standing) => `Jagna zdradzi Ci 3 rzadkie przepisy Alchemii od stopnia ${standing} w relacji z nią albo w reputacji Bractwa Zielarzy.`;

  beforeEach(async () => {
    ({ cookie } = await signUp('jagna'));
    await call('POST', '/api/character', { cookie, body: { name: 'Zielarz', classId: 'cleric', appearance: 'male' } });
    await set(`level = 25, class_level = 25, gold = 0, professions = '{"alchemy":{"level":45,"xp":0}}'`);
  });

  test('the Pracownia shows a rare recipe as a shadow with the standing and the level, until Jagna teaches it', async () => {
    const before = await character();
    assert.deepEqual(recipe(before, 'owl-draught'), { id: 'owl-draught', level: 40, hidden: true, hint: hint('Zaufany', 40) });
    assert.deepEqual(recipe(before, 'jagna-balm'), { id: 'jagna-balm', level: 75, hidden: true, hint: hint('Przyjaciel', 75) });
    await set(`herbs = '{"valerian":30,"st-johns-wort":10}', materials = '{"eagle-owl-feather:unique":5}'`);
    const owlBrew = { recipe: 'owl-draught', count: 1, catalyst: 'eagle-owl-feather:unique' };
    assert.equal((await brew(owlBrew)).data.error.code, 'unknown_recipe');

    // The Bractwo Zielarzy's reputation alone teaches it.
    await osada(0, points('trusted'));
    const after = await character();
    const owl = recipe(after, 'owl-draught');
    assert.equal(owl.name, 'Sowi napar');
    assert.deepEqual(owl.herbs.map((herb) => [herb.id, herb.need]), [['valerian', 3], ['st-johns-wort', 1]]);
    assert.equal(owl.catalyst.name, 'Pióro puchacza');
    // Taught, one above the level waits for it, as the System's recipes do.
    assert.equal(recipe(after, 'wolf-strength-brew').hint, 'Ukryte przez System do 50. poziomu Alchemii.');
    assert.equal(recipe(after, 'burn-brew').hint, hint('Przyjaciel', 60));
    assert.equal((await brew(owlBrew)).status, 201);
  });

  test('a potion of a recipe not taught yet is neither drunk nor taken along, as one got in a Wymiana', async () => {
    await set(`level = 70, class_level = 70, professions = '{"alchemy":{"level":100,"xp":0}}', potions = '{"bearskin-brew":2,"burn-brew":2}'`);
    const drink = (potionId) => call('POST', '/api/potions/drink', { cookie, body: { potionId } });
    const hunt = (potions) => call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30, potions } });
    assert.deepEqual((await character()).potions.map((potion) => [potion.id, potion.known]), [['bearskin-brew', false], ['burn-brew', false]]);
    assert.equal((await drink('bearskin-brew')).data.error.code, 'unknown_recipe');
    assert.equal((await hunt({ 'burn-brew': 1 })).data.error.code, 'unknown_recipe');

    // The relation alone teaches the first three, the Bractwo the last ones
    // (whose standing also makes a potion for a time last longer, 589 C).
    await osada(points('trusted'));
    assert.equal((await drink('bearskin-brew')).data.text, 'Postać wypija Wywar niedźwiedziej skóry. Pancerz większy o 30% przez 2 walki.');
    assert.equal((await hunt({ 'burn-brew': 1 })).data.error.code, 'unknown_recipe');

    await osada(points('trusted'), points('friend'));
    assert.equal((await hunt({ 'burn-brew': 1 })).status, 201);
  });

  test('a trade that brings the relation to a standing makes Jagna teach its recipes, and her Chata tells them', async () => {
    await osada(points('trusted') - 1);
    await set(`herbs = '{"comfrey":400}'`);
    const chata = (await call('GET', '/api/settlement', { cookie })).data.settlement.herbalist.recipes;
    assert.deepEqual(chata, { title: 'Rzadkie przepisy', taught: [], next: next('Zaufany') });

    const sell = () => call('POST', '/api/settlement/herbalist', { cookie, body: { kind: 'herb', id: 'comfrey', count: 100 } });
    const sold = await sell();
    assert.ok(sold.data.sold.points >= 1);
    assert.equal(sold.data.sold.taught, TAUGHT_TRUSTED);
    const { recipes } = sold.data.settlement.herbalist;
    assert.deepEqual(recipes.taught, [
      { id: 'owl-draught', name: 'Sowi napar', note: 'Uwarzysz go w Systemowej Pracowni.' },
      { id: 'bearskin-brew', name: 'Wywar niedźwiedziej skóry', note: 'Uwarzysz go w Systemowej Pracowni.' },
      { id: 'wolf-strength-brew', name: 'Wywar wilczej siły', note: 'Uwarzysz go od 50. poziomu Alchemii.' },
    ]);
    assert.equal(recipes.next, next('Przyjaciel'));
    assert.equal(recipe(sold.data.character, 'owl-draught').name, 'Sowi napar');
    // The next trade teaches nothing more.
    assert.equal((await sell()).data.sold.taught, undefined);

    // Buying from her teaches as selling does.
    await osada(points('friend') - 1);
    await set('gold = 100000');
    const bought = await call('POST', '/api/settlement/herbalist/buy', { cookie, body: { id: 'comfrey', count: 100 } });
    assert.ok(bought.data.bought.points >= 1);
    assert.equal(bought.data.bought.taught, 'Jagna zdradza Ci 3 rzadkie przepisy Alchemii: Wywar od oparzeń, Napar od uroków, Balsam Jagny.');
    assert.deepEqual(ids(bought.data.settlement.herbalist.recipes.taught), RARE);
    assert.equal(bought.data.settlement.herbalist.recipes.next, null);
  });

  test('an order of the Bractwo Zielarzy that brings its reputation to Zaufany makes Jagna teach, with the relation still Obcy', async () => {
    const view = async () => (await call('GET', '/api/settlement', { cookie })).data.settlement;
    // An order of herbs or potions on the board (the Bractwo Zielarzy's).
    let order = null;
    for (let i = 0; i < 40 && !order; i++) {
      await call('POST', '/api/test/settlement', { cookie, body: { action: 'orders' } });
      order = (await view()).board.slots.map((slot) => slot.order).find((one) => one?.brotherhood === herbalist.brotherhood) ?? null;
    }
    assert.ok(order, 'an order of the Bractwo Zielarzy comes');
    // One point short of Zaufany in the Bractwo, nothing with Jagna herself.
    await set(`settlement = json_set(settlement, '$.reputation', json(?), '$.relations', json('{}'))`, JSON.stringify({ [herbalist.brotherhood]: points('trusted') - 1 }));
    const column = { herb: 'herbs', potion: 'potions' }[order.kind];
    await set(`${column} = json_set(${column}, ?, ?)`, `$."${order.key}"`, order.count);
    const done = await call('POST', '/api/settlement/deliver', { cookie, body: { orderId: order.id } });
    assert.equal(done.status, 200, JSON.stringify(done.data));
    assert.equal(done.data.delivered.taught, TAUGHT_TRUSTED);
    assert.deepEqual(ids(done.data.settlement.herbalist.recipes.taught), TRUSTED);
    const stored = JSON.parse((await (await db()).prepare('SELECT settlement FROM characters').first()).settlement);
    assert.equal(stored.relations[herbalist.resident] ?? 0, 0);
    assert.equal(recipe(done.data.character, 'owl-draught').name, 'Sowi napar');
  });
});

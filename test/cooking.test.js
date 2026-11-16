// Gotowanie (999.3-999.5 v2, the dishes of 1003, 1059): cooking dishes in
// the Systemowa Kuchnia as potions are brewed, of fish and crops from the
// Spiżarnia and herbs from the bag; the dishes in the Spiżarnia; and the
// meal, a dish eaten as an exploration sets out, whose bonus works for 4
// hours of explorations. In the engine and through the API.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  cookDishes,
  cookMinutes,
  cookingReport,
  dishIngredients,
  dishMinutes,
  dishPrice,
  freshMeal,
  knownDishes,
  mealBonusText,
  mealEffects,
  mealLine,
  mealOf,
  mealUse,
  mostDishes,
  notificationsDue,
  professionStats,
  rollRarity,
  simulateHunt,
  workProfession,
} from '../src/engine/index.js';
import { createRng } from '../src/engine/rng.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

describe('Gotowanie in the engine', () => {
  test('it opens at character level 25, as Górnictwo, next to Rzemieślnictwo, and raises Witalność and Intelekt up to the 200th level', () => {
    const cooking = content.professionsById.cooking;
    assert.deepEqual([cooking.name, cooking.unlockLevel, cooking.stats, cooking.maxLevel, cooking.masteryLevel], ['Gotowanie', content.professionsById.mining.unlockLevel, ['vitality', 'intellect'], 200, 100]);
    assert.deepEqual(content.professionRows.at(-1), ['cooking', 'crafting']);
    const stats = professionStats({ cooking: { level: 11, xp: 0 } }, content);
    assert.deepEqual([stats.vitality, stats.intellect, stats.strength], [10 * cooking.statPerLevel, 10 * cooking.statPerLevel, 0]);
  });

  // The author, 16.11.2026: „Trzeba troche lepsze te bonusy dać i niech się
  // łączą w lepszych potrawach większą roznorodnosc tez trzeba”.
  test('20 recipes by level, each of fish, crops or herbs the game has; the better ones join more of the seven bonuses', () => {
    assert.deepEqual(knownDishes(1, content).map((dish) => dish.id), ['baked-turnip']);
    assert.deepEqual(knownDishes(8, content).map((dish) => dish.name), ['Pieczona rzepa', 'Grochówka', 'Smażone płotki', 'Kasza jaglana z karasiem']);
    assert.equal(content.dishes.length, 20);
    for (const dish of content.dishes) {
      for (const id of Object.keys(dish.ingredients)) assert.ok(content.fishById[id] || content.cropsById[id] || content.herbsById[id], `${dish.id}: ${id}`);
      for (const bonus of dish.bonuses) assert.ok(['xp', 'materials', 'rare', 'gold', 'cards', 'resources', 'chests'].includes(bonus.kind), dish.id);
      // One bonus to the 12th level, two from the 16th, three from the 120th.
      assert.equal(dish.bonuses.length >= (dish.level >= 120 ? 3 : dish.level >= 16 ? 2 : 1), true, dish.id);
      assert.equal(new Set(dish.bonuses.map((bonus) => bonus.kind)).size, dish.bonuses.length, dish.id);
    }
    assert.deepEqual(new Set(content.dishes.flatMap((dish) => dish.bonuses.map((bonus) => bonus.kind))).size, 7);
    assert.equal(content.dishesById['mokosh-feast'].bonuses.length, 4);
    // Every fish and every crop goes into some dish.
    const used = new Set(content.dishes.flatMap((dish) => Object.keys(dish.ingredients)));
    assert.deepEqual([...content.fish, ...content.crops].filter((good) => !used.has(good.id)).map((good) => good.id), []);
    assert.equal(mealBonusText(content.dishesById.zurek, content), '+12% XP z wyprawy, +10% szansy na skrzynię wśród znalezisk');
    assert.equal(mealBonusText(content.dishesById['millet-crucian'], content), '+3 pkt proc. szansy na rzadszy przedmiot');
    // The innkeeper pays 1.5 times the ingredients: 3 turnips at 2 gold.
    assert.equal(dishPrice(content.dishesById['baked-turnip'], content), 9);
    assert.equal(content.pantryById.zurek.group, 'dish');
  });

  test('a dish takes 10 minutes, each level 1% less down to half; the most at once by 8 hours and the ingredients', () => {
    assert.equal(dishMinutes(1, content), 10);
    assert.ok(Math.abs(dishMinutes(51, content) - 5) < 1e-9);
    assert.equal(dishMinutes(150, content), 5);
    assert.equal(cookMinutes(48, 1, content), 480);
    const turnip = content.dishesById['baked-turnip'];
    assert.equal(mostDishes(turnip, 1, { turnip: 300 }, content), 48);
    assert.equal(mostDishes(turnip, 1, { turnip: 10 }, content), 3);
    assert.deepEqual(dishIngredients(content.dishesById['golden-carp-herbs'], 2), { 'golden-carp': 2, 'giant-turnip': 2, 'st-johns-wort': 4 });
  });

  test('past the 100th level each dish has the mastery\'s chance of one more; the seed decides it', () => {
    assert.deepEqual(cookDishes({ count: 20, seed: 's', level: 99 }, content), { count: 20, bonus: 0 });
    let bonus = 0;
    for (let index = 0; index < 50; index += 1) bonus += cookDishes({ count: 20, seed: `m${index}`, level: 200 }, content).bonus;
    assert.ok(bonus > 50 && bonus < 150, String(bonus));
    assert.deepEqual(cookDishes({ count: 20, seed: 'x', level: 180 }, content), cookDishes({ count: 20, seed: 'x', level: 180 }, content));
  });

  test('the meal works for 4 hours of explorations, each using up its own length; the last share of its time', () => {
    const meal = freshMeal('zurek', content);
    assert.deepEqual(meal, { dish: 'zurek', left: 240 });
    const first = mealUse(meal, 60, content);
    const zurek = content.dishesById.zurek.bonuses;
    assert.deepEqual(first, { bonus: { dish: 'zurek', bonuses: zurek, share: 1, minutes: 60 }, after: { dish: 'zurek', left: 180 } });
    const second = mealUse({ dish: 'zurek', left: 30 }, 120, content);
    assert.deepEqual(second, { bonus: { dish: 'zurek', bonuses: zurek, share: 0.25, minutes: 30, last: true }, after: null });
    assert.deepEqual(mealUse(null, 60, content), { bonus: null, after: null });
    assert.deepEqual(mealOf('{"dish":"zurek","left":30}', content), { dish: 'zurek', left: 30 });
    assert.equal(mealOf('{"dish":"zurek","left":0}', content), null);
    assert.equal(mealOf('{"dish":"boot","left":30}', content), null);
    assert.equal(mealOf(null, content), null);
    assert.deepEqual(mealEffects(second.bonus), { xp: 0.03, gold: 0, materials: 0, rare: 0, cards: 0, resources: 0, chests: 0.025 });
    assert.equal(mealLine({ meal: first.bonus }, content), 'Posiłek (Żurek) działał przez 1 h tej wyprawy: +12% XP z wyprawy, +10% szansy na skrzynię wśród znalezisk.');
    assert.equal(mealLine({ meal: second.bonus }, content), 'Posiłek (Żurek) działał przez 30 min tej wyprawy: +12% XP z wyprawy, +10% szansy na skrzynię wśród znalezisk. Posiłek się skończył. Nową potrawę wybierzesz przy następnej wyprawie.');
    assert.equal(mealLine({}, content), null);
  });

  test('the points of a rarer item raise the rarities with affixes by that many points, the draws staying as many', () => {
    const affixed = (points) => {
      let count = 0;
      const rng = createRng('rarity');
      for (let index = 0; index < 20000; index += 1) if (content.raritiesById[rollRarity(rng, content, 1, 1, points)].affixes > 0) count += 1;
      return count / 20000;
    };
    const base = affixed(0);
    assert.ok(Math.abs(affixed(0.08) - (base + 0.08)) < 0.015, `${base} → ${affixed(0.08)}`);
    // Without points the same seed draws the same rarities as ever.
    const one = createRng('same');
    const two = createRng('same');
    for (let index = 0; index < 50; index += 1) assert.equal(rollRarity(one, content), rollRarity(two, content, 1, 1, 0));
  });

  describe('an exploration with a meal', () => {
    const { character, equipped } = typicalCharacter('warrior', 24, content);
    const hunt = (meal, seed) => simulateHunt({ character, equipped, hp: 99999, name: 'Mira', areaId: 'boar-thicket', minutes: 240, seed, meal }, content);

    test('XP or gold by the share it covers, the fights and finds the same, and a line in the report', () => {
      for (const seed of ['posilek:1', 'posilek:2']) {
        const plain = hunt(null, seed);
        const fed = hunt({ dish: 'pike-pierogi', bonuses: [{ kind: 'xp', value: 10 }], share: 1, minutes: 240, last: true }, seed);
        assert.deepEqual(fed.items, plain.items);
        assert.equal(fed.fights.length, plain.fights.length);
        const slack = plain.fights.length + plain.entries.length;
        assert.ok(fed.xp > plain.xp * 1.06 && fed.xp <= plain.xp * 1.1 + slack, `${plain.xp} → ${fed.xp}`);
        assert.equal(fed.gold, plain.gold);
        const rich = hunt({ dish: 'fried-carp', bonuses: [{ kind: 'gold', value: 10 }], share: 0.5, minutes: 120 }, seed);
        assert.ok(Math.abs(rich.gold - plain.gold * 1.05) <= slack, `${plain.gold} → ${rich.gold}`);
        assert.equal(rich.xp, plain.xp);
        assert.equal(fed.meal.dish, 'pike-pierogi');
        assert.equal(plain.meal, undefined);
      }
    });

    test('more materials from the creatures', () => {
      const count = (result) => Object.values(result.materials).reduce((sum, amount) => sum + amount, 0);
      let plain = 0;
      let fed = 0;
      for (let index = 0; index < 40; index += 1) {
        plain += count(hunt(null, `mat:${index}`));
        fed += count(hunt({ dish: 'garlic-salmon', bonuses: [{ kind: 'materials', value: 40 }], share: 1, minutes: 240 }, `mat:${index}`));
      }
      assert.ok(fed > plain * 1.2, `${plain} → ${fed}`);
    });

    test('more resources for the camp, and more chests among the finds', () => {
      const sum = (result) => Object.values(result.resources).reduce((total, amount) => total + amount, 0);
      const chests = (result) => result.entries.filter((entry) => entry.item !== undefined && entry.type === 'find').length;
      let plain = 0;
      let fed = 0;
      let plainChests = 0;
      let fedChests = 0;
      for (let index = 0; index < 20; index += 1) {
        const one = hunt(null, `res:${index}`);
        plain += sum(one);
        plainChests += chests(one);
        fed += sum(hunt({ dish: 'switez-soup', bonuses: [{ kind: 'resources', value: 50 }], share: 1, minutes: 240 }, `res:${index}`));
        // The chests come instead of other finds, as in a week of them.
        fedChests += chests(hunt({ dish: 'zurek', bonuses: [{ kind: 'chests', value: 50 }], share: 1, minutes: 240 }, `res:${index}`));
      }
      assert.ok(fed > plain * 1.3, `${plain} → ${fed}`);
      assert.ok(fedChests > plainChests * 1.3, `${plainChests} → ${fedChests}`);
    });
  });

  test('the report: the Kuchnia, the dishes, the levels and the recipes the System revealed', () => {
    const profession = content.professionsById.cooking;
    const before = { level: 2, xp: 0 };
    const after = workProfession(profession, before, 300);
    const report = cookingReport(
      { dish: content.dishesById['baked-turnip'], minutes: 300, startedAt: 0, endsAt: 300 * 60000, seed: 's', made: { count: 31, bonus: 1 }, stopped: false, before, after, character: { level: 25 }, xp: 50, work: { level: 25, timePoints: 0, messages: [] } },
      content,
    );
    assert.equal(report.kind, 'dishes');
    assert.equal(report.placeName, 'Systemowa Kuchnia');
    assert.deepEqual(report.dish, { id: 'baked-turnip', name: 'Pieczona rzepa', count: 31, bonus: 1, meal: '+15% materiałów ze stworów' });
    assert.equal(report.lucky, 'Udane gotowanie, dodatkowo: 1 × Pieczona rzepa.');
    assert.deepEqual(report.revealed, content.dishes.filter((one) => one.level > 2 && one.level <= after.level).map((one) => one.id));
  });

  test('a cooking that ends sends its notification, to the Gotowanie screen', () => {
    const due = notificationsDue({ level: 30, activity: { kind: 'dishes', areaId: 'system-kitchen', endsAt: 1000 }, buildings: {}, queue: [] }, 0, 2000, content);
    assert.deepEqual(due.map((notice) => [notice.tag, notice.url, notice.title]), [['dishes', '#/profesje/gotowanie', 'Koniec gotowania']]);
    assert.equal(due[0].body, 'Potrawy gotowe: Systemowa Kuchnia. Raport czeka na odbiór.');
  });
});

describe('Gotowanie and the meal through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('kucharz'));
    await call('POST', '/api/character', { cookie, body: { name: 'Kucharz', classId: 'warrior', appearance: 'male' } });
    await (await db()).prepare('UPDATE characters SET level = 25, xp = 0').run();
  });

  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const row = async () => (await db()).prepare('SELECT * FROM characters').first();
  const age = async (minutes) => (await db()).prepare('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ?').bind(minutes * 60000, minutes * 60000).run();
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  const cook = (body) => call('POST', '/api/professions/cook', { cookie, body });
  const claim = () => call('POST', '/api/hunts/claim', { cookie });
  const pantry = (view) => Object.fromEntries(view.pantry.map((good) => [good.id, good.count]));

  test('the Kuchnia with the recipes the System shows, the others hidden; locked below level 25', async () => {
    await set('level = 24');
    const locked = (await character()).professions;
    assert.equal(locked.cooking, null);
    assert.equal((await cook({ recipe: 'baked-turnip', count: 1 })).status, 403);
    await set(`level = 25, pantry = '{"turnip":7}'`);
    const { cooking } = (await character()).professions;
    assert.equal(cooking.place.name, 'Systemowa Kuchnia');
    assert.equal(cooking.dishMinutes, 10);
    const turnip = cooking.dishes.find((one) => one.id === 'baked-turnip');
    assert.deepEqual([turnip.most, turnip.bonus, turnip.kinds, turnip.price], [2, '+15% materiałów ze stworów', ['materials'], 9]);
    assert.deepEqual(turnip.ingredients, [{ id: 'turnip', name: 'Rzepa', need: 3, have: 7, group: 'crop' }]);
    assert.equal(cooking.dishes.find((one) => one.id === 'pea-soup').hint, 'Ukryte przez System do 3. poziomu Gotowania.');
  });

  test('a cooking takes the ingredients, the report brings the dishes to the Spiżarnia; called back, the rest comes back', async () => {
    await set(`pantry = '{"turnip":10}', hp = 1`);
    assert.equal((await cook({ recipe: 'pea-soup', count: 1 })).data.error.code, 'unknown_recipe');
    assert.equal((await cook({ recipe: 'baked-turnip', count: 4 })).data.error.code, 'invalid_count');
    const started = await cook({ recipe: 'baked-turnip', count: 3 });
    assert.equal(started.status, 201, JSON.stringify(started.data));
    const { activity } = started.data.character;
    assert.deepEqual([activity.kind, activity.placeName, activity.dish, activity.count, activity.minutes], ['dishes', 'Systemowa Kuchnia', { id: 'baked-turnip', name: 'Pieczona rzepa' }, 3, 30]);
    assert.deepEqual(pantry(started.data.character), { turnip: 1 });
    assert.ok(started.data.character.regen, 'HP keeps coming back while cooking');
    await age(30);
    const claimed = await claim();
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
    assert.equal(claimed.data.report.kind, 'dishes');
    assert.deepEqual(pantry(claimed.data.character), { turnip: 1, 'baked-turnip': 3 });
    assert.equal(claimed.data.character.pantry.find((good) => good.id === 'baked-turnip').bonus, '+15% materiałów ze stworów');
    // Called back after one dish of three: one made, the turnips of two back.
    await set(`pantry = '{"turnip":9}'`);
    await cook({ recipe: 'baked-turnip', count: 3 });
    await age(12);
    const stopped = await call('POST', '/api/hunts/cancel', { cookie });
    assert.equal(stopped.status, 200, JSON.stringify(stopped.data));
    assert.equal(stopped.data.report.dish.count, 1);
    assert.deepEqual(pantry(stopped.data.character), { turnip: 6, 'baked-turnip': 1 });
  });

  test('a recipe with herbs takes them from the bag', async () => {
    await set(`professions = '{"cooking":{"level":145,"xp":0}}', pantry = '{"golden-carp":1,"giant-turnip":1}', herbs = '{"st-johns-wort":3}'`);
    const started = await cook({ recipe: 'golden-carp-herbs', count: 1 });
    assert.equal(started.status, 201, JSON.stringify(started.data));
    const after = await row();
    assert.deepEqual([JSON.parse(after.pantry), JSON.parse(after.herbs)], [{}, { 'st-johns-wort': 1 }]);
  });

  test('the meal: eaten as an exploration sets out, its time used up by explorations, a new one only once it is over, nothing lost on a call back', async () => {
    await set(`pantry = '{"zurek":2,"turnip":1}', hp = 99999`);
    const explore = (body) => call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 60, ...body } });
    assert.equal((await explore({ meal: 'boot' })).data.error.code, 'unknown_dish');
    assert.equal((await explore({ meal: 'baked-turnip' })).data.error.code, 'no_dish');
    const started = await explore({ meal: 'zurek' });
    assert.equal(started.status, 201, JSON.stringify(started.data));
    assert.deepEqual(started.data.character.meal, { id: 'zurek', name: 'Żurek', bonus: '+12% XP z wyprawy, +10% szansy na skrzynię wśród znalezisk', left: 180, minutes: 240 });
    assert.deepEqual(pantry(started.data.character), { zurek: 1, turnip: 1 });
    // Called back: the meal and the dish as they were.
    const back = await call('POST', '/api/hunts/cancel', { cookie });
    assert.equal(back.data.character.meal, null);
    assert.deepEqual(pantry(back.data.character), { zurek: 2, turnip: 1 });
    // Eaten again, and the exploration claimed: its report says it.
    await explore({ meal: 'zurek' });
    await age(60);
    const claimed = await claim();
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
    assert.ok(claimed.data.report.system.includes('Posiłek (Żurek) działał przez 1 h tej wyprawy: +12% XP z wyprawy, +10% szansy na skrzynię wśród znalezisk.'), JSON.stringify(claimed.data.report.system));
    // While it works, another dish waits, and the next exploration goes on
    // with the meal by itself.
    const refused = await explore({ meal: 'zurek' });
    assert.deepEqual([refused.status, refused.data.error.message], [409, 'Posiłek jeszcze działa: Żurek, zostało 3 h wypraw.']);
    const next = await explore({});
    assert.equal(next.data.character.meal.left, 120);
  });
});

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
  mealStacks,
  mealUse,
  mostDishes,
  notificationsDue,
  professionStats,
  rollRarity,
  simulateHunt,
  workProfession,
} from '../src/engine/index.js';
import { createRng } from '../src/engine/rng.js';
import { eatDish, startHunt } from '../src/server/hunts.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';
import { meanwhile, posted } from './helpers/meanwhile.js';
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
    assert.deepEqual(meal, { dish: 'zurek', left: 240, portions: 1 });
    const first = mealUse(meal, 60, content);
    const zurek = content.dishesById.zurek.bonuses;
    assert.deepEqual(first, { bonus: { dish: 'zurek', bonuses: zurek, portions: 1, share: 1, minutes: 60 }, after: { dish: 'zurek', left: 180, portions: 1 } });
    const second = mealUse({ dish: 'zurek', left: 30, portions: 1 }, 120, content);
    assert.deepEqual(second, { bonus: { dish: 'zurek', bonuses: zurek, portions: 1, share: 0.25, minutes: 30, last: true }, after: null });
    assert.deepEqual(mealUse(null, 60, content), { bonus: null, after: null });
    // A meal kept before the portions (20.11.2026) is one portion.
    assert.deepEqual(mealOf('{"dish":"zurek","left":30}', content), { dish: 'zurek', left: 30, portions: 1 });
    assert.equal(mealOf('{"dish":"zurek","left":0}', content), null);
    assert.equal(mealOf('{"dish":"boot","left":30}', content), null);
    assert.equal(mealOf(null, content), null);
    assert.deepEqual(mealEffects(second.bonus), { xp: 0.03, gold: 0, materials: 0, rare: 0, cards: 0, resources: 0, chests: 0.025 });
    assert.equal(mealLine({ meal: first.bonus }, content), 'Posiłek (Żurek) działał przez 1 h tej wyprawy: +12% XP z wyprawy, +10% szansy na skrzynię wśród znalezisk.');
    assert.equal(mealLine({ meal: second.bonus }, content), 'Posiłek (Żurek) działał przez 30 min tej wyprawy: +12% XP z wyprawy, +10% szansy na skrzynię wśród znalezisk. Posiłek się skończył. Nową potrawę wybierzesz przy następnej wyprawie.');
    assert.equal(mealLine({}, content), null);
  });

  // The author, 20.11.2026: „maksymalnie do 3 potraw jednego rodzaju na raz
  // (i analogicznie dodane 3x procenty danej potrawy)”.
  test('up to 3 portions of one dish: every bonus that many times, in words and on the exploration, one timer for them all', () => {
    assert.equal(content.cooking.meal.portions, 3);
    const meal = freshMeal('zurek', content, 3);
    assert.deepEqual(meal, { dish: 'zurek', left: 240, portions: 3 });
    const used = mealUse(meal, 60, content);
    assert.deepEqual(used.after, { dish: 'zurek', left: 180, portions: 3 });
    assert.equal(used.bonus.portions, 3);
    assert.deepEqual(mealEffects(used.bonus), { xp: 0.36, gold: 0, materials: 0, rare: 0, cards: 0, resources: 0, chests: 0.3 });
    // The rarer item's points too, by the share of the time.
    assert.ok(Math.abs(mealEffects({ bonuses: content.dishesById['millet-crucian'].bonuses, portions: 2, share: 0.5 }).rare - 0.03) < 1e-9);
    assert.equal(mealLine({ meal: used.bonus }, content), 'Posiłek (Żurek ×3) działał przez 1 h tej wyprawy: +36% XP z wyprawy, +30% szansy na skrzynię wśród znalezisk.');
    assert.deepEqual(mealStacks(content.dishesById.zurek, content), [
      { name: 'Żurek', bonus: '+12% XP z wyprawy, +10% szansy na skrzynię wśród znalezisk' },
      { name: 'Żurek ×2', bonus: '+24% XP z wyprawy, +20% szansy na skrzynię wśród znalezisk' },
      { name: 'Żurek ×3', bonus: '+36% XP z wyprawy, +30% szansy na skrzynię wśród znalezisk' },
    ]);
    // A row with more than the most is held to it.
    assert.equal(mealOf('{"dish":"zurek","left":30,"portions":9}', content).portions, 3);
    // Three portions of any dish keep every chance below certainty: a
    // champion's card and the rarer item's share of the draws.
    const { drops } = content.cards;
    for (const dish of content.dishes) {
      const most = mealEffects({ bonuses: dish.bonuses, portions: 3, share: 1 });
      assert.ok(drops.champion * (1 + most.cards) < 1, dish.id);
      assert.ok(most.rare < 0.5, dish.id);
    }
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
    // All the mana back after each fight, as before 1220 B
    // (balance.hunt.manaRecoveryAfterFight): the meal's shares are counted
    // on explorations that go as they went, a Wojownik without mana potions.
    const steady = { ...content, balance: { ...content.balance, hunt: { ...content.balance.hunt, manaRecoveryAfterFight: 1 } } };
    const hunt = (meal, seed) => simulateHunt({ character, equipped, hp: 99999, name: 'Mira', areaId: 'boar-thicket', minutes: 240, seed, meal }, steady);

    test('XP or gold by the share it covers, the fights and finds the same, and a line in the report', () => {
      for (const seed of ['posilek:1', 'posilek:2']) {
        const plain = hunt(null, seed);
        const fed = hunt({ dish: 'pike-pierogi', bonuses: [{ kind: 'xp', value: 10 }], share: 1, minutes: 240, last: true }, seed);
        assert.deepEqual(fed.items, plain.items);
        assert.equal(fed.fights.length, plain.fights.length);
        const slack = plain.fights.length + plain.entries.length;
        assert.ok(fed.xp > plain.xp * 1.06 && fed.xp <= plain.xp * 1.1 + slack, `${plain.xp} → ${fed.xp}`);
        // Three portions: three times the share more.
        const three = hunt({ dish: 'pike-pierogi', bonuses: [{ kind: 'xp', value: 10 }], portions: 3, share: 1, minutes: 240 }, seed);
        assert.ok(three.xp > plain.xp * 1.26 && three.xp <= plain.xp * 1.3 + slack, `${plain.xp} → ${three.xp}`);
        assert.deepEqual(three.items, plain.items);
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

  test('the meal: eaten as an exploration sets out, its time used up by explorations, nothing lost on a call back', async () => {
    await set(`pantry = '{"zurek":2,"turnip":1}', hp = 99999`);
    const explore = (body) => call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 60, ...body } });
    assert.equal((await explore({ meal: 'boot' })).data.error.code, 'unknown_dish');
    assert.equal((await explore({ meal: 'baked-turnip' })).data.error.code, 'no_dish');
    const started = await explore({ meal: 'zurek' });
    assert.equal(started.status, 201, JSON.stringify(started.data));
    const { swap, ...meal } = started.data.character.meal;
    assert.deepEqual(meal, { id: 'zurek', name: 'Żurek', bonus: '+12% XP z wyprawy, +10% szansy na skrzynię wśród znalezisk', portions: 1, left: 180, minutes: 240 });
    // The words asking before another dish takes its place, filled in by the page.
    assert.deepEqual(swap, {
      title: 'Zmienić posiłek?',
      text: 'Postać zje: {dish}. Obecny posiłek ({current}) przestanie działać, choć zostało mu {time} wypraw, a jego premia przepadnie.',
      eat: 'Zjedz',
    });
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
    // A page that did not know of the meal at work (no `mealReplaces`) is
    // told the character changed meanwhile; the next exploration goes on
    // with the meal by itself.
    assert.equal((await explore({ meal: 'zurek' })).data.error.code, 'character_changed');
    assert.deepEqual(JSON.parse((await row()).meal), { dish: 'zurek', left: 180, portions: 1 });
    const next = await explore({});
    assert.equal(next.data.character.meal.left, 120);
  });

  // The author, 20.11.2026: „może dam opcję zjedzenia innego posiłku i
  // zmarnowania poprzedniego bonusu”.
  test('another dish replaces the meal at work: what it had left is lost and the new one has its full time; a call back brings both back; each exploration keeps the meal it set out with', async () => {
    await set(`pantry = '{"zurek":1,"pea-soup":2}', hp = 99999`);
    const explore = (body) => call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 60, ...body } });
    assert.equal((await explore({ meal: 'zurek' })).status, 201);
    // On its way the character eats nothing else; its report has the meal
    // it set out with.
    assert.equal((await explore({ meal: 'pea-soup', mealReplaces: 'zurek' })).data.error.code, 'busy');
    await age(60);
    const first = await claim();
    assert.ok(first.data.report.system.includes('Posiłek (Żurek) działał przez 1 h tej wyprawy: +12% XP z wyprawy, +10% szansy na skrzynię wśród znalezisk.'), JSON.stringify(first.data.report.system));
    assert.equal(first.data.character.meal.left, 180);
    // Only the meal the page showed is replaced, and only by a dish in the Spiżarnia.
    assert.equal((await explore({ meal: 'pea-soup', mealReplaces: 'borscht' })).data.error.code, 'character_changed');
    assert.equal((await explore({ meal: 'borscht', mealReplaces: 'zurek' })).data.error.code, 'no_dish');
    // Grochówka in place of the Żurek: the Żurek's 3 hours are lost, the
    // Grochówka's 4 hours start, this exploration takes its first hour.
    const swapped = await explore({ meal: 'pea-soup', mealReplaces: 'zurek' });
    assert.equal(swapped.status, 201, JSON.stringify(swapped.data));
    assert.deepEqual([swapped.data.character.meal.id, swapped.data.character.meal.left], ['pea-soup', 180]);
    assert.deepEqual(pantry(swapped.data.character), { 'pea-soup': 1 });
    // Called back: the Żurek with its 3 hours and the Grochówka in the Spiżarnia.
    const back = await call('POST', '/api/hunts/cancel', { cookie });
    assert.deepEqual([back.data.character.meal.id, back.data.character.meal.left], ['zurek', 180]);
    assert.deepEqual(pantry(back.data.character), { 'pea-soup': 2 });
    // Replaced again and claimed: the report has the Grochówka for the whole hour.
    await explore({ meal: 'pea-soup', mealReplaces: 'zurek' });
    await age(60);
    const second = await claim();
    const lines = second.data.report.system.filter((line) => line.startsWith('Posiłek'));
    assert.deepEqual(lines, [`Posiłek (Grochówka) działał przez 1 h tej wyprawy: ${mealBonusText(content.dishesById['pea-soup'], content)}.`]);
    assert.deepEqual([second.data.character.meal.id, second.data.character.meal.left], ['pea-soup', 180]);
  });

  test('two taps at once eat one dish and replace the meal once', async () => {
    await set(`pantry = '{"zurek":1,"pea-soup":2}', meal = '{"dish":"zurek","left":180}', hp = 99999`);
    const body = { areaId: 'windfalls-edge', minutes: 60, meal: 'pea-soup', mealReplaces: 'zurek' };
    const database = await db();
    // The other tap's start is saved just before this one's batch.
    const racing = meanwhile(database, /INSERT INTO activities/, () => call('POST', '/api/hunts', { cookie, body }));
    await assert.rejects(
      startHunt({ request: posted('/api/hunts', cookie, body), env: { DB: racing }, now: Date.now(), params: {} }),
      (error) => error.code === 'character_changed' && error.status === 409,
    );
    assert.ok(racing.done);
    const after = await row();
    assert.deepEqual(JSON.parse(after.meal), { dish: 'pea-soup', left: 180, portions: 1 });
    assert.deepEqual(JSON.parse(after.pantry), { zurek: 1, 'pea-soup': 1 });
    assert.equal((await database.prepare('SELECT COUNT(*) AS count FROM activities').first()).count, 1);
  });

  // The author, 20.11.2026: „Dajemy możliwość stackowania bonusów z potraw
  // (…) maksymalnie do 3 potraw jednego rodzaju na raz (i analogicznie
  // dodane 3x procenty danej potrawy)”.
  test('up to 3 portions of one dish: eaten at once or added to the meal at work, each giving it its full time; at 3 no more; a call back gives them back', async () => {
    await set(`pantry = '{"zurek":5,"pea-soup":1}', hp = 99999`);
    const explore = (body) => call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 60, ...body } });
    for (const portions of [0, 4, 1.5, '2']) assert.equal((await explore({ meal: 'zurek', mealPortions: portions })).data.error.code, 'invalid_portions');
    assert.equal((await explore({ meal: 'pea-soup', mealPortions: 2 })).data.error.code, 'no_dish');
    // Two portions at once: twice the bonus, one timer.
    const two = await explore({ meal: 'zurek', mealPortions: 2 });
    assert.equal(two.status, 201, JSON.stringify(two.data));
    const { swap, ...meal } = two.data.character.meal;
    assert.deepEqual(meal, { id: 'zurek', name: 'Żurek ×2', bonus: '+24% XP z wyprawy, +20% szansy na skrzynię wśród znalezisk', portions: 2, left: 180, minutes: 240 });
    assert.deepEqual(pantry(two.data.character), { zurek: 3, 'pea-soup': 1 });
    // The Spiżarnia's dish shows the meals its portions make.
    assert.deepEqual(two.data.character.pantry.find((good) => good.id === 'zurek').stacks.map((stack) => stack.name), ['Żurek', 'Żurek ×2', 'Żurek ×3']);
    await age(60);
    const claimed = await claim();
    assert.ok(claimed.data.report.system.includes('Posiłek (Żurek ×2) działał przez 1 h tej wyprawy: +24% XP z wyprawy, +20% szansy na skrzynię wśród znalezisk.'), JSON.stringify(claimed.data.report.system));
    // A page that saw fewer portions than there are is told the character
    // changed meanwhile; more than 3 together is refused.
    assert.equal((await explore({ meal: 'zurek', mealReplaces: { dish: 'zurek', portions: 1 } })).data.error.code, 'character_changed');
    const over = await explore({ meal: 'zurek', mealPortions: 2, mealReplaces: { dish: 'zurek', portions: 2 } });
    assert.deepEqual([over.status, over.data.error.code, over.data.error.message], [409, 'meal_full', 'Posiłek: Żurek ×2, jeszcze 3 h wypraw. Jednej potrawy możesz mieć naraz najwyżej 3 porcje.']);
    // One more on top of the two: three portions, the full 4 hours again,
    // this exploration takes its first hour.
    const three = await explore({ meal: 'zurek', mealReplaces: { dish: 'zurek', portions: 2 } });
    assert.equal(three.status, 201, JSON.stringify(three.data));
    assert.deepEqual([three.data.character.meal.name, three.data.character.meal.left, three.data.character.meal.bonus], ['Żurek ×3', 180, '+36% XP z wyprawy, +30% szansy na skrzynię wśród znalezisk']);
    assert.deepEqual(pantry(three.data.character), { zurek: 2, 'pea-soup': 1 });
    // Called back: the two portions with their 3 hours, the dish back.
    const back = await call('POST', '/api/hunts/cancel', { cookie });
    assert.deepEqual(JSON.parse((await row()).meal), { dish: 'zurek', left: 180, portions: 2 });
    assert.deepEqual(pantry(back.data.character), { zurek: 3, 'pea-soup': 1 });
    await explore({ meal: 'zurek', mealReplaces: { dish: 'zurek', portions: 2 } });
    await age(60);
    await claim();
    // At 3 portions no more of it, whatever the page asks.
    const full = await explore({ meal: 'zurek', mealReplaces: { dish: 'zurek', portions: 3 } });
    assert.deepEqual([full.status, full.data.error.code, full.data.error.message], [409, 'meal_full', 'Posiłek: Żurek ×3, jeszcze 3 h wypraw. Jednej potrawy możesz mieć naraz najwyżej 3 porcje.']);
    // Another dish replaces all three portions, after the question on the page.
    const swapped = await explore({ meal: 'pea-soup', mealReplaces: { dish: 'zurek', portions: 3 } });
    assert.equal(swapped.status, 201, JSON.stringify(swapped.data));
    assert.deepEqual([swapped.data.character.meal.name, swapped.data.character.meal.portions, swapped.data.character.meal.left], ['Grochówka', 1, 180]);
    // Called back: the three Żurek portions as they were, the Grochówka in the Spiżarnia.
    const again = await call('POST', '/api/hunts/cancel', { cookie });
    assert.deepEqual([again.data.character.meal.name, again.data.character.meal.left], ['Żurek ×3', 180]);
    assert.deepEqual(pantry(again.data.character), { zurek: 2, 'pea-soup': 1 });
  });

  // The author, 20.11.2026: „Pozwól zjeść posiłek z pozycji plecaka może? To ułatwi sprawę”.
  test('a dish eaten from the Spiżarnia by the same rules, the meal at work at once; not on an exploration', async () => {
    await set(`pantry = '{"zurek":4,"pea-soup":1}', hp = 99999`);
    const eat = (body) => call('POST', '/api/pantry/eat', { cookie, body });
    const explore = (body) => call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 60, ...body } });
    // Two portions from the bag: the meal at work at once, its full time.
    const two = await eat({ id: 'zurek', count: 2 });
    assert.equal(two.status, 200, JSON.stringify(two.data));
    assert.deepEqual([two.data.character.meal.name, two.data.character.meal.portions, two.data.character.meal.left], ['Żurek ×2', 2, 240]);
    assert.deepEqual(pantry(two.data.character), { zurek: 2, 'pea-soup': 1 });
    // Its time runs only on explorations: the next one sets out with it.
    assert.equal((await explore({})).status, 201);
    // On an exploration nothing is eaten, nor once it is over before its report.
    const away = await eat({ id: 'zurek', replaces: { dish: 'zurek', portions: 2 } });
    assert.deepEqual([away.status, away.data.error.code, away.data.error.message], [409, 'on_exploration', 'Zjesz po powrocie z wyprawy.']);
    await age(60);
    assert.equal((await eat({ id: 'zurek', replaces: { dish: 'zurek', portions: 2 } })).data.error.code, 'claim_first');
    const claimed = await claim();
    assert.ok(claimed.data.report.system.includes('Posiłek (Żurek ×2) działał przez 1 h tej wyprawy: +24% XP z wyprawy, +20% szansy na skrzynię wśród znalezisk.'), JSON.stringify(claimed.data.report.system));
    assert.deepEqual(pantry(claimed.data.character), { zurek: 2, 'pea-soup': 1 });
    // One portion added: three, the full 4 hours again. A page that saw
    // fewer portions is told the character changed meanwhile; at 3 no more.
    assert.equal((await eat({ id: 'zurek', replaces: { dish: 'zurek', portions: 1 } })).data.error.code, 'character_changed');
    const three = await eat({ id: 'zurek', replaces: { dish: 'zurek', portions: 2 } });
    assert.deepEqual([three.data.character.meal.name, three.data.character.meal.left], ['Żurek ×3', 240]);
    assert.equal((await eat({ id: 'zurek', replaces: { dish: 'zurek', portions: 3 } })).data.error.code, 'meal_full');
    // Another dish replaces all three portions, once the page asked.
    assert.equal((await eat({ id: 'pea-soup' })).data.error.code, 'character_changed');
    const swapped = await eat({ id: 'pea-soup', replaces: { dish: 'zurek', portions: 3 } });
    assert.deepEqual([swapped.data.character.meal.name, swapped.data.character.meal.portions, swapped.data.character.meal.left], ['Grochówka', 1, 240]);
    assert.deepEqual(pantry(swapped.data.character), { zurek: 1 });
  });

  test('two taps at once eat from the Spiżarnia once', async () => {
    await set(`pantry = '{"zurek":3}'`);
    const body = { id: 'zurek', count: 2 };
    const database = await db();
    // The other tap's meal is saved just before this one's batch.
    const racing = meanwhile(database, /UPDATE characters SET meal/, () => call('POST', '/api/pantry/eat', { cookie, body }));
    await assert.rejects(
      eatDish({ request: posted('/api/pantry/eat', cookie, body), env: { DB: racing }, now: Date.now(), params: {} }),
      (error) => error.code === 'character_changed' && error.status === 409,
    );
    assert.ok(racing.done);
    const after = await row();
    assert.deepEqual([JSON.parse(after.meal), JSON.parse(after.pantry)], [{ dish: 'zurek', left: 240, portions: 2 }, { zurek: 1 }]);
  });
});

// A member of a Drużyna eats nothing as its leader sets out: its own meal,
// eaten from the Spiżarnia before, covers the trip (the author, 20.11.2026:
// „Pozwól zjeść posiłek z pozycji plecaka może? To ułatwi sprawę”).
describe('a meal eaten before a Drużyna’s trip', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on' });
  const cookies = {};
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });

  beforeEach(async () => {
    for (const [login, name] of [
      ['wodz', 'Wodz'],
      ['kompan', 'Kompan'],
    ]) {
      ({ cookie: cookies[login] } = await signUp(login));
      await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    }
    await (await db()).prepare('UPDATE characters SET level = 30, class_level = 30, hp = 99999').run();
  });

  test('a member who ate before the trip gets its bonus on it', async () => {
    const { data } = await as('wodz', 'POST', '/api/party/invite', { name: 'Kompan' });
    await as('kompan', 'POST', '/api/party/accept', { partyId: data.party.id });
    await (await db()).prepare(`UPDATE characters SET pantry = '{"zurek":2}' WHERE name = 'Kompan'`).run();
    const ate = await as('kompan', 'POST', '/api/pantry/eat', { id: 'zurek', count: 2 });
    assert.equal(ate.status, 200, JSON.stringify(ate.data));
    const went = await as('wodz', 'POST', '/api/party/hunt', { areaId: 'windfalls-edge', minutes: 5 });
    assert.equal(went.status, 201, JSON.stringify(went.data).slice(0, 300));
    assert.deepEqual(went.data.went, ['Kompan']);
    await (await db()).prepare('UPDATE activities SET started_at = started_at - 600000, ends_at = ends_at - 600000').run();
    let claimed = await as('kompan', 'POST', '/api/hunts/claim');
    if (claimed.data.event) claimed = await as('kompan', 'POST', '/api/hunts/claim', { choice: claimed.data.event.options.find((option) => !option.disabled)?.id ?? claimed.data.event.options[0].id });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
    assert.ok(claimed.data.report.system.includes('Posiłek (Żurek ×2) działał przez 5 min tej wyprawy: +24% XP z wyprawy, +20% szansy na skrzynię wśród znalezisk.'), JSON.stringify(claimed.data.report.system));
    assert.equal(claimed.data.character.meal.left, 235);
    // The leader, who ate nothing, has no meal on the trip.
    const leader = await as('wodz', 'POST', '/api/hunts/claim');
    assert.ok(!(leader.data.report?.system ?? []).some((line) => line.startsWith('Posiłek')), JSON.stringify(leader.data).slice(0, 300));
  });
});

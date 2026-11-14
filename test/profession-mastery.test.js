// The professions past their mastery (952.1–952.4 A, 14.11.2026): five
// herbs of Zielarstwo and nine recipes of Alchemia from the 100th level on,
// and past the 100th a chance that grows to the 200th: a herb gathered or a
// mineral dug twice (up to 10%), and every potion's extra one (5% at the
// 100th, 15% at the 200th). In the engine and through the API.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  bladeOil,
  brewChance,
  brewPotions,
  brewingReport,
  countList,
  fightingPlayer,
  gatherHerbs,
  gatheringReport,
  herbHarvest,
  herbalistStock,
  knownHerbs,
  knownPotions,
  masteryChance,
  merchantStock,
  mineMinerals,
  miningReport,
  playerCombatant,
  tradedHerbs,
  workProfession,
} from '../src/engine/index.js';
import { contentIn } from '../src/server/content.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const MASTERY_HERBS = ['adders-tongue', 'mandrake', 'henbane', 'springwort', 'golden-root'];
const MASTERY_POTIONS = ['mana-elixir', 'great-healing-balm', 'bison-hide-brew', 'aurochs-strength-brew', 'falcon-eye-draught', 'halny-wind-draught', 'henbane-oil', 'springwort-elixir', 'living-water'];

const close = (actual, expected, within = 1e-9) => assert.ok(Math.abs(actual - expected) <= within, `${actual} is not ${expected}`);
const sum = (counts) => Object.values(counts).reduce((total, count) => total + count, 0);
// The content without a work's mastery: what the draws before it give.
const without = (table) => ({ ...content, [table]: { ...content[table], mastery: undefined } });
// Each count of `found` less the `lucky` among them.
const less = (found, lucky) => Object.fromEntries(Object.entries(found).map(([id, count]) => [id, count - (lucky[id] ?? 0)]));

describe('the professions past their mastery in the engine (952)', () => {
  test('five herbs of the mastery: Nasięźrzał at 100, Mandragora at 120, Lulek czarny at 140, Rozryw at 160, Złoty korzeń at 180 (952.1)', () => {
    const newest = (level) => knownHerbs(level, content).at(-1).id;
    assert.deepEqual(
      [99, 100, 119, 120, 139, 140, 159, 160, 179, 180, 200].map(newest),
      ['fern-blossom', 'adders-tongue', 'adders-tongue', 'mandrake', 'mandrake', 'henbane', 'henbane', 'springwort', 'springwort', 'golden-root', 'golden-root'],
    );
    assert.deepEqual(
      MASTERY_HERBS.map((id) => {
        const { name, genitive, level, perHour, price } = content.herbsById[id];
        return [name, genitive, level, perHour, price];
      }),
      [
        ['Nasięźrzał', 'Nasięźrzału', 100, 0.5, 80],
        ['Mandragora', 'Mandragory', 120, 0.4, 100],
        ['Lulek czarny', 'Lulka czarnego', 140, 0.35, 130],
        ['Rozryw', 'Rozrywu', 160, 0.3, 170],
        ['Złoty korzeń', 'Złotego korzenia', 180, 0.25, 220],
      ],
    );
    // The level that reaches the 100th reveals the first of them.
    const character = newCharacter('cleric', { level: 120 });
    const work = { level: 120, xp: 0, timePoints: 0, messages: [] };
    const before = { level: 99, xp: 0 };
    const after = workProfession(content.professionsById.herbalism, before, 99 * 30);
    const report = gatheringReport({ minutes: 480, startedAt: 0, endsAt: 1, seed: 'n', found: { 'fern-blossom': 3 }, stored: { 'fern-blossom': 3 }, lost: {}, before, after, character, xp: 0, work }, content);
    assert.equal(after.level, 100);
    assert.deepEqual(report.revealed, ['adders-tongue']);
    assert.equal(report.system.at(-1), 'System odsłania nowe zioło: Nasięźrzał');
    assert.equal(report.lucky, null);
  });

  test('nine recipes of the mastery, stronger kinds of those that work already, each from its level (952.2)', () => {
    assert.deepEqual(
      MASTERY_POTIONS.map((id) => {
        const { name, level, effect, fights = null, catalyst = null } = content.potionsById[id];
        return [name, level, effect, fights, catalyst];
      }),
      [
        ['Eliksir many', 100, { mana: 0.8 }, null, null],
        ['Wielki balsam leczenia', 105, { heal: 0.85 }, null, null],
        ['Wywar żubrzej skóry', 110, { armor: 0.45 }, 2, 'turtle-shell'],
        ['Wywar turzej siły', 120, { damage: 0.3 }, 2, 'bies-horn'],
        ['Napar sokolego oka', 130, { focus: 0.3 }, 2, 'rarog-feather'],
        ['Napar halnego wiatru', 140, { speed: 0.45 }, 2, 'latawiec-membrane'],
        ['Olejek z lulka', 150, { poison: 0.75 }, 2, 'moth-dust'],
        ['Eliksir z rozrywu', 165, { ward: 0.5 }, 2, 'bell-clapper'],
        ['Woda żywa', 180, { revive: 0.5 }, null, null],
      ],
    );
    const known = (level) => knownPotions(level, content).map((potion) => potion.id);
    for (const id of MASTERY_POTIONS) {
      const potion = content.potionsById[id];
      assert.ok(known(potion.level).includes(id) && !known(potion.level - 1).includes(id), id);
      // A herb of the mastery in each, and only herbs known by the recipe's level.
      assert.ok(Object.keys(potion.herbs).some((herb) => MASTERY_HERBS.includes(herb)), id);
      for (const herb of Object.keys(potion.herbs)) assert.ok(content.herbsById[herb].level <= potion.level, `${id}: ${herb}`);
    }
    // The catalysts are materials of creatures of the highest lands.
    const lands = ['black-bog', 'pine-dunes', 'silent-wilds', 'new-moon-depths'];
    const living = new Set(
      content.regions
        .filter((region) => lands.includes(region.id))
        .flatMap((region) => region.areas)
        .flatMap((area) => [...area.encounters, ...area.tough].flatMap((encounter) => encounter.monsters).concat(area.elite ?? [], area.champion ?? [])),
    );
    for (const id of MASTERY_POTIONS) {
      const { catalyst } = content.potionsById[id];
      if (catalyst) assert.ok(living.has(content.materialsById[catalyst].monster), `${id}: ${catalyst}`);
    }
    // The level that reaches the 100th of Alchemia reveals the first of them.
    const report = brewingReport(
      {
        potion: content.potionsById['fern-brew'],
        minutes: 60,
        startedAt: 0,
        endsAt: 1,
        seed: 'r',
        made: { count: 12, bonus: 0 },
        stored: { 'fern-brew': 12 },
        lost: {},
        stopped: false,
        before: { level: 99, xp: 0 },
        after: { level: 100, xp: 0 },
        character: newCharacter('mage', { level: 120 }),
        xp: 0,
        work: { level: 120, xp: 0, timePoints: 0, messages: [] },
      },
      content,
    );
    assert.deepEqual(report.revealed, ['mana-elixir']);
    assert.equal(report.system.at(-1), 'System odsłania nowy przepis: Eliksir many');
  });

  test('the chance of the mastery: none up to the 100th level, then evenly up to 10% of a herb or a mineral twice and 15% of an extra potion at the 200th (952.3 A, 952.4 A)', () => {
    for (const table of [content.gathering, content.mining]) {
      assert.deepEqual([1, 50, 99, 100].map((level) => masteryChance(table, level)), [0, 0, 0, 0]);
      close(masteryChance(table, 101), 0.001);
      close(masteryChance(table, 150), 0.05);
      close(masteryChance(table, 175), 0.075);
      close(masteryChance(table, 200), 0.1);
    }
    assert.equal(masteryChance({}, 200), 0);
    assert.equal(masteryChance(content.workshop, 200), 0);
    assert.deepEqual([1, 99, 100].map((level) => brewChance(level, content)), [0.05, 0.05, 0.05]);
    close(brewChance(150, content), 0.1);
    close(brewChance(200, content), 0.15);
  });

  test('a double harvest: the same seed gathers the same, the herbs before the mastery as without it, and about its share more', () => {
    const gathering = { herbIds: ['comfrey', 'adders-tongue'], minutes: 480, level: 200, seed: 'mistrz' };
    const harvest = herbHarvest(gathering, content);
    assert.deepEqual(herbHarvest(gathering, content), harvest);
    assert.deepEqual(gatherHerbs(gathering, content), harvest.found);
    assert.ok(sum(harvest.lucky) > 0, 'some herbs come twice');
    // What the seed gives before the mastery's draws is what it gives without the mastery.
    assert.deepEqual(less(harvest.found, harvest.lucky), herbHarvest(gathering, without('gathering')).found);
    // Up to the 100th level no herb comes twice, and nothing changes.
    for (const level of [1, 60, 100]) {
      const plain = herbHarvest({ ...gathering, level }, content);
      assert.deepEqual(plain.lucky, {});
      assert.deepEqual(plain.found, herbHarvest({ ...gathering, level }, without('gathering')).found);
    }
    // About 10% more at the 200th, about 5% at the 150th.
    const share = (level) => {
      let found = 0;
      let lucky = 0;
      for (let index = 0; index < 300; index += 1) {
        const one = herbHarvest({ herbIds: ['comfrey'], minutes: 120, level, seed: `z${index}` }, content);
        found += sum(one.found) - sum(one.lucky);
        lucky += sum(one.lucky);
      }
      return lucky / found;
    };
    close(share(200), 0.1, 0.012);
    close(share(150), 0.05, 0.01);
    // The report tells them apart, the herbs gathered with them.
    const character = newCharacter('cleric', { level: 150 });
    const report = gatheringReport(
      {
        minutes: 480,
        startedAt: 0,
        endsAt: 1,
        seed: 'r',
        found: { comfrey: 20, 'adders-tongue': 4 },
        lucky: { comfrey: 2, 'adders-tongue': 1 },
        stored: { comfrey: 20, 'adders-tongue': 4 },
        lost: {},
        before: { level: 200, xp: 0 },
        after: { level: 200, xp: 0 },
        character,
        xp: 0,
        work: { level: 150, xp: 0, timePoints: 0, messages: [] },
      },
      content,
    );
    assert.equal(report.gathered, 'Zebrano: 20 × Żywokost, 4 × Nasięźrzał.');
    assert.equal(report.lucky, 'Szczęśliwy zbiór, dodatkowo: 2 × Żywokost, 1 × Nasięźrzał.');
  });

  test('a double haul in the Kopalnia, as in the Zagajnik: the minerals and the veins before it as without it (952.4 A)', () => {
    const digging = { minutes: 480, level: 200, characterLevel: 150, seed: 'kilof' };
    const mined = mineMinerals(digging, content);
    assert.deepEqual(mineMinerals(digging, content), mined);
    assert.ok(sum(mined.lucky) > 0, 'some minerals come twice');
    const plain = mineMinerals(digging, without('mining'));
    assert.deepEqual(less(mined.found, mined.lucky), plain.found);
    assert.deepEqual([mined.veins, mined.gold], [plain.veins, plain.gold]);
    for (const level of [1, 60, 100]) {
      const below = mineMinerals({ ...digging, level }, content);
      assert.deepEqual(below.lucky, {});
      assert.deepEqual(below, { ...mineMinerals({ ...digging, level }, without('mining')), lucky: {} });
    }
    let found = 0;
    let lucky = 0;
    for (let index = 0; index < 200; index += 1) {
      const one = mineMinerals({ ...digging, minutes: 120, seed: `k${index}` }, content);
      found += sum(one.found) - sum(one.lucky);
      lucky += sum(one.lucky);
    }
    close(lucky / found, 0.1, 0.012);
    const report = miningReport(
      {
        minutes: 480,
        startedAt: 0,
        endsAt: 1,
        seed: 's',
        mined: { found: { quartz: 30, 'silver-ore': 70 }, lucky: { quartz: 3 }, veins: 2, gold: 345 },
        before: { level: 200, xp: 0 },
        after: { level: 200, xp: 0 },
        character: { level: 150 },
        xp: 0,
        work: { level: 150, timePoints: 0, messages: [] },
      },
      content,
    );
    assert.equal(report.found, 'Wydobyto: 30 × Kwarc, 70 × Srebrny kruszec.');
    assert.equal(report.lucky, 'Szczęśliwy urobek, dodatkowo: 3 × Kwarc.');
    // A digging with no luck, as every one before the mastery, says nothing of it.
    assert.equal(miningReport({ minutes: 60, startedAt: 0, endsAt: 1, seed: 's', mined: { found: { quartz: 2 }, veins: 0, gold: 0 }, before: { level: 5, xp: 0 }, after: { level: 5, xp: 0 }, character: { level: 30 }, xp: 0, work: { level: 30, timePoints: 0, messages: [] } }, content).lucky, null);
  });

  test('a lucky extra potion: the same seed brews the same, the draws up to the 100th level as before, about 15% at the 200th (952.3 A)', () => {
    const brewing = { count: 60, seed: 'kocioł', level: 200 };
    assert.deepEqual(brewPotions(brewing, content), brewPotions(brewing, content));
    // Up to the 100th level the bonusChance alone, as before the mastery.
    for (const level of [1, 50, 100]) assert.deepEqual(brewPotions({ ...brewing, level }, content), brewPotions({ count: 60, seed: 'kocioł' }, content));
    const share = (level, extraChance = 0) => {
      let bonus = 0;
      for (let index = 0; index < 300; index += 1) bonus += brewPotions({ count: 40, seed: `w${index}`, level, extraChance }, content).bonus;
      return bonus / (300 * 40);
    };
    close(share(100), 0.05, 0.01);
    close(share(150), 0.1, 0.012);
    close(share(200), 0.15, 0.015);
    // A rarer catalyst adds its grades on top.
    close(share(200, 0.15), 0.3, 0.02);
    // A brewing stopped early keeps the draws of the potions it made.
    for (let index = 0; index < 20; index += 1) {
      assert.ok(brewPotions({ count: 10, seed: `c${index}`, level: 200 }, content).bonus <= brewPotions({ count: 30, seed: `c${index}`, level: 200 }, content).bonus);
    }
  });

  test('the henbane oil lays its own, stronger Zatrucie on the blade, the aconite oil its own', () => {
    assert.equal(bladeOil(0.5, content).id, 'aconite-oil');
    assert.equal(bladeOil(0.75, content).id, 'henbane-oil');
    assert.equal(bladeOil(0.2, content).id, 'aconite-oil');
    const henbane = content.potionsById['henbane-oil'].dot;
    const aconite = content.potionsById['aconite-oil'].dot;
    assert.equal(henbane.effect, aconite.effect);
    assert.ok(henbane.power > aconite.power && henbane.ticks >= aconite.ticks);
    const character = newCharacter('warrior', { level: 150, classLevel: 150 });
    const unit = playerCombatant({ character, equipped: [], hp: 9999, name: 'Mira' }, content);
    const oiled = (poison) => fightingPlayer({ unit, character, equipped: [], name: 'Mira', hp: 9999, on: { poison }, kit: {}, trophies: {} }, content).weapon.dot;
    assert.deepEqual(oiled(0.75), { ...henbane, chance: 0.75 });
    assert.deepEqual(oiled(0.5), { ...aconite, chance: 0.5 });
  });

  test('no resident sells a herb of the mastery: Jagna and the merchant keep to those up to Kwiat paproci', () => {
    const mastery = content.professionsById.herbalism.masteryLevel;
    assert.deepEqual(
      tradedHerbs(content).map((herb) => herb.id),
      content.herbs.filter((herb) => herb.level < mastery).map((herb) => herb.id),
    );
    assert.ok(MASTERY_HERBS.every((id) => !tradedHerbs(content).some((herb) => herb.id === id)));
    for (const standing of content.settlement.standings) {
      assert.ok(herbalistStock(standing.points, content).herbs.every((herb) => content.herbsById[herb.id].level < mastery), standing.id);
    }
    const day = 86400000;
    const start = Date.UTC(2026, 10, 1, 12);
    const offered = new Set();
    for (let index = 0; index < 120; index += 1) {
      for (const good of merchantStock(start + index * day, content).goods) if (good.kind === 'herb') offered.add(good.key);
    }
    assert.ok(offered.size > 5);
    assert.ok([...offered].every((id) => content.herbsById[id].level < mastery), [...offered].join());
  });

  test('in English: the herbs, the recipes and the lines of the mastery', () => {
    const english = contentIn('en');
    assert.deepEqual(
      MASTERY_HERBS.map((id) => english.herbsById[id].name),
      ["Adder's-tongue", 'Mandrake', 'Henbane', 'Springwort', 'Golden Root'],
    );
    assert.deepEqual(
      MASTERY_POTIONS.map((id) => english.potionsById[id].name),
      ['Mana Elixir', 'Great Healing Balm', 'Bison Hide Brew', 'Aurochs Strength Brew', 'Falcon Eye Draught', 'Halny Wind Draught', 'Henbane Oil', 'Springwort Elixir', 'Living Water'],
    );
    assert.equal(english.potionsById['henbane-oil'].verb, 'Apply');
    const report = gatheringReport(
      {
        minutes: 60,
        startedAt: 0,
        endsAt: 1,
        seed: 'e',
        found: { 'adders-tongue': 3 },
        lucky: { 'adders-tongue': 1 },
        stored: { 'adders-tongue': 3 },
        lost: {},
        before: { level: 120, xp: 0 },
        after: { level: 120, xp: 0 },
        character: newCharacter('cleric', { level: 120 }),
        xp: 0,
        work: { level: 120, xp: 0, timePoints: 0, messages: [] },
      },
      english,
    );
    assert.equal(report.lucky, "Lucky harvest, extra: 1 × Adder's-tongue.");
  });
});

describe('the professions past their mastery through the API (952)', () => {
  const { server, call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on', ENGLISH: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('mistrzyni'));
    await call('POST', '/api/character', { cookie, body: { name: 'Mistrzyni', classId: 'cleric', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = 30, xp = 0').run();
  });

  const set = async (sql, ...binds) => (await db()).prepare(`UPDATE characters SET ${sql}`).bind(...binds).run();
  const levels = (professions) => set('professions = ?', JSON.stringify(Object.fromEntries(Object.entries(professions).map(([id, level]) => [id, { level, xp: 0 }]))));
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
  // The work under way with a seed of the test's own, its time gone by.
  const done = async (seed) => (await db()).prepare('UPDATE activities SET seed = ?, started_at = started_at - 86400000, ends_at = ?').bind(seed, Date.now() - 1).run();
  const claim = async () => (await call('POST', '/api/hunts/claim', { cookie })).data;

  test('the Zagajnik and the Kopalnia tell the chance of the mastery only past the 100th level, the Pracownia its extra potion with it', async () => {
    await levels({ herbalism: 100, alchemy: 100, mining: 100 });
    let { professions } = await character();
    assert.equal(professions.gathering.mastery, null);
    assert.equal(professions.mining.mastery, null);
    close(professions.brewing.bonusChance, 0.05);
    await levels({ herbalism: 150, alchemy: 150, mining: 101 });
    await set(`materials = '{"turtle-shell:rare":2}'`);
    ({ professions } = await character());
    assert.equal(professions.gathering.mastery, 'Każde zebrane zioło ma 5% szans na jedno dodatkowe.');
    assert.equal(professions.mining.mastery, 'Każdy wydobyty minerał ma 0,1% szans na jeden dodatkowy.');
    close(professions.brewing.bonusChance, 0.1);
    // A rarer catalyst's grade on top of it (turtle-shell is rare already: no step).
    const bison = professions.brewing.recipes.find((recipe) => recipe.id === 'bison-hide-brew');
    assert.deepEqual(bison.catalyst.stacks.map((stack) => [stack.key, Math.round(stack.chance * 100)]), [['turtle-shell:rare', 10]]);
    // The recipes and herbs of the mastery show from their levels, the rest wait.
    assert.ok(!professions.brewing.recipes.find((recipe) => recipe.id === 'mana-elixir').hidden);
    assert.equal(professions.brewing.recipes.find((recipe) => recipe.id === 'living-water').hint, 'Ukryte przez System do 180. poziomu Alchemii.');
    assert.equal(professions.gathering.herbs.find((herb) => herb.id === 'golden-root').hint, 'Ukryte przez System do 180. poziomu Zielarstwa.');
    // In English, with its own decimal point.
    const english = await (await server.fetch('/api/character', { headers: { Cookie: cookie, 'X-Lang': 'en' } })).json();
    assert.equal(english.character.professions.gathering.mastery, 'Each herb gathered has a 5% chance of one extra.');
    assert.equal(english.character.professions.mining.mastery, 'Each mineral dug up has a 0.1% chance of one extra.');
  });

  test('a gathering past the mastery brings the herbs that came twice, in the bag and in the report', async () => {
    await levels({ herbalism: 200 });
    const herbIds = ['comfrey', 'golden-root'];
    assert.equal((await call('POST', '/api/professions/gather', { cookie, body: { herbs: herbIds, minutes: 480 } })).status, 201);
    await done('mistrz');
    const { report } = await claim();
    const expected = herbHarvest({ herbIds, minutes: 480, level: 200, seed: 'mistrz' }, content);
    assert.ok(sum(expected.lucky) > 0);
    assert.deepEqual(Object.fromEntries(report.herbs.map((herb) => [herb.id, herb.count])), expected.found);
    assert.equal(report.lucky, `Szczęśliwy zbiór, dodatkowo: ${countList(expected.lucky, content.herbsById)}.`);
    const stored = Object.fromEntries(report.herbs.map((herb) => [herb.id, herb.stored]));
    assert.deepEqual(JSON.parse((await (await db()).prepare('SELECT herbs FROM characters').first()).herbs), Object.fromEntries(Object.entries(stored).filter(([, count]) => count > 0)));
  });

  test('a digging past the mastery brings the minerals that came twice, and a brewing its extra potions at its level', async () => {
    await levels({ mining: 200, alchemy: 200 });
    assert.equal((await call('POST', '/api/professions/mine', { cookie, body: { minutes: 480 } })).status, 201);
    await done('kilof');
    const mined = await claim();
    const expected = mineMinerals({ minutes: 480, level: 200, characterLevel: 30, seed: 'kilof' }, content);
    assert.ok(sum(expected.lucky) > 0);
    assert.deepEqual(Object.fromEntries(mined.report.minerals.map((mineral) => [mineral.id, mineral.count])), expected.found);
    assert.equal(mined.report.lucky, `Szczęśliwy urobek, dodatkowo: ${countList(expected.lucky, content.mineralsById)}.`);
    assert.equal(mined.report.gold, expected.gold);
    assert.deepEqual(Object.fromEntries(mined.character.minerals.map((mineral) => [mineral.id, mineral.count])), expected.found);

    await set(`herbs = '{"comfrey":300}'`);
    assert.equal((await call('POST', '/api/professions/brew', { cookie, body: { recipe: 'lesser-healing', count: 96 } })).status, 201);
    await done('kocioł');
    const { report } = await claim();
    const made = brewPotions({ count: 96, seed: 'kocioł', level: 200 }, content);
    assert.deepEqual([report.potion.count, report.potion.bonus], [made.count, made.bonus]);
    assert.notDeepEqual(made, brewPotions({ count: 96, seed: 'kocioł' }, content));
  });
});

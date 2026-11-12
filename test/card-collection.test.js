// Talia Systemu's collection (src/engine/card-collection.js; DECISIONS.md,
// "Talia Systemu: gra karciana w Salonie Gier", points 26 and 27): every card
// in one land, in the Bestiariusz's order; the collection's bonus (884 A),
// +1% XP and +1% gold of the explorations for every 10 different cards, at
// most +15%, on in the data and off at 0; an exploration's XP and gold with
// it and the report's line; the Encyklopedia's "Karty" with the count, the
// bonus and the next threshold, each card found with its sheet's lines and
// the others only by creature; and through the API the tab only where CARDS
// is on, and an exploration's report with the bonus.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { cardBonusLine, cardCollectionView, cardExplorationBonus, cardHomes, cardKind, cardLands, simulateHunt } from '../src/engine/index.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rules = content.cards;
// The content with the collection's bonus as given.
const withBonus = (collection) => ({ ...content, cards: { ...rules, bonuses: { ...rules.bonuses, collection: { ...rules.bonuses.collection, ...collection } } } });
const allCards = () => [...cardHomes(content).keys()];
// A collection of the first `count` cards, each with `copies`.
const collectionOf = (count, copies = 1) => new Map(allCards().slice(0, count).map((id) => [id, copies]));

describe('Talia Systemu: the collection in the engine', () => {
  test('every card is in one land, the lands in the game\'s order, the ordinary creatures first, then the elites and the champion', () => {
    const lands = cardLands(content);
    const ids = lands.flatMap((land) => land.cards);
    assert.equal(ids.length, cardHomes(content).size);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(
      lands.map((land) => land.regionId),
      content.regions.map((region) => region.id).filter((id) => lands.some((land) => land.regionId === id)),
    );
    const order = { ordinary: 0, elite: 1, champion: 2 };
    for (const land of lands) {
      const kinds = land.cards.map((id) => order[cardKind(id, content)]);
      assert.deepEqual(kinds, [...kinds].sort((a, b) => a - b), land.regionId);
      for (const id of land.cards) assert.equal(cardHomes(content).get(id).regionId, land.regionId);
    }
    assert.deepEqual(lands[0].cards.slice(0, 4), ['wolf', 'badger', 'squirrel', 'grass-snake']);
  });

  test('the bonus is on in the data: +1% XP and +1% gold for every 10 different cards, at most +15%', () => {
    assert.deepEqual(rules.bonuses.collection, { every: 10, xp: 0.01, gold: 0.01, max: 0.15 });
    const percent = (count) => Object.values(cardExplorationBonus(count, content)).map((share) => Math.round(share * 1000) / 10);
    assert.deepEqual(percent(0), [0, 0]);
    assert.deepEqual(percent(9), [0, 0]);
    assert.deepEqual(percent(10), [1, 1]);
    assert.deepEqual(percent(31), [3, 3]);
    assert.deepEqual(percent(155), [15, 15]);
    assert.deepEqual(percent(156), [15, 15]);
    // More cards than the game has now (new lands) stay at the top.
    assert.deepEqual(percent(400), [15, 15]);
  });

  test('off in the data (0): no bonus, none in an exploration and no lines in the Encyklopedia', () => {
    const off = withBonus({ xp: 0, gold: 0 });
    assert.deepEqual(cardExplorationBonus(156, off), { xp: 0, gold: 0 });
    const view = cardCollectionView(collectionOf(31), off);
    assert.deepEqual(view.bonus, []);
    assert.equal(view.threshold, null);
    assert.equal(view.summary, 'Kolekcja: 31 z 156');
  });

  describe('an exploration with the bonus', () => {
    const { character, equipped } = typicalCharacter('warrior', 24, content);
    const hunt = (cards, seed) => simulateHunt({ character, equipped, hp: 99999, name: 'Mira', areaId: 'boar-thicket', minutes: 240, seed, cards }, content);

    test('its XP and gold rise by the share, its fights and finds stay the same, and its report says it', () => {
      for (const seed of ['premia:1', 'premia:2', 'premia:3']) {
        const plain = hunt({ maxed: [] }, seed);
        const more = hunt({ maxed: [], xp: 0.15, gold: 0.15 }, seed);
        assert.deepEqual(more.items, plain.items);
        assert.deepEqual(more.materials, plain.materials);
        assert.deepEqual(more.cards, plain.cards);
        assert.equal(more.fights.length, plain.fights.length);
        // Each fight's XP is rounded, each find's gold too. The first fight
        // gives its share more; the later ones less than that once the level
        // rises sooner (lowLevelMultiplier), as with every bonus to XP.
        const slack = plain.fights.length + plain.entries.length;
        assert.ok(Math.abs(more.fights[0].xp - plain.fights[0].xp * 1.15) <= 1, `${plain.fights[0].xp} → ${more.fights[0].xp}`);
        assert.ok(plain.xp > 1000 && more.xp > plain.xp * 1.1 && more.xp <= plain.xp * 1.15 + slack, `${plain.xp} → ${more.xp}`);
        assert.ok(plain.gold > 100 && Math.abs(more.gold - plain.gold * 1.15) <= slack, `${plain.gold} → ${more.gold}`);
        assert.deepEqual(more.cardsBonus, { xp: 0.15, gold: 0.15 });
        assert.equal(plain.cardsBonus, undefined);
        assert.equal(cardBonusLine(more, content), 'Kolekcja kart: +15% XP i +15% złota z wyprawy.');
        assert.equal(cardBonusLine(plain, content), null);
      }
      // A faint loses the XP and gold, and says nothing of the bonus.
      assert.equal(cardBonusLine({ cardsBonus: { xp: 0.03, gold: 0.03 }, forfeit: true, xp: 0, gold: 0 }, content), null);
      assert.equal(cardBonusLine({ cardsBonus: { xp: 0.03, gold: 0.03 }, xp: 120, gold: 40 }, content), 'Kolekcja kart: +3% XP i +3% złota z wyprawy.');
    });
  });

  test('the Encyklopedia\'s "Karty": the count, the bonus now and its next threshold, every land with its count', () => {
    const view = cardCollectionView(collectionOf(31), content);
    assert.equal(view.found, 31);
    assert.equal(view.all, 156);
    assert.equal(view.summary, 'Kolekcja: 31 z 156');
    assert.deepEqual(view.bonus, [
      'Premia kolekcji: +3% XP i +3% złota z wypraw, na stałe.',
      'Następny próg: 40 różnych kart. Brakuje 9 kart.',
      'Co 10 różnych kart premia rośnie o 1% XP i 1% złota, najwyżej do +15%.',
    ]);
    assert.deepEqual(view.threshold, { from: 30, to: 40 });
    assert.equal(view.lands.length, cardLands(content).length);
    assert.equal(view.lands[0].name, 'Wiatrołomy');
    assert.equal(view.lands[0].count, `Zebrane ${view.lands[0].found} z ${view.lands[0].all}`);
    assert.equal(view.lands.reduce((sum, land) => sum + land.found, 0), 31);
    // One card missing for the next threshold, and none at the top.
    assert.equal(cardCollectionView(collectionOf(39), content).bonus[1], 'Następny próg: 40 różnych kart. Brakuje 1 karty.');
    const full = cardCollectionView(collectionOf(156), content);
    assert.deepEqual(full.bonus.slice(0, 2), ['Premia kolekcji: +15% XP i +15% złota z wypraw, na stałe.', 'To najwyższa premia kolekcji.']);
    assert.equal(full.threshold, null);
    assert.equal(cardCollectionView(new Map(), content).bonus[1], 'Następny próg: 10 różnych kart. Brakuje 10 kart.');
  });

  test('a card found comes at its level with its copies and its sheet\'s lines, one not found only by its creature', () => {
    const view = cardCollectionView(
      new Map([
        ['wolf', 2],
        ['tusker', 5],
      ]),
      content,
    );
    const cards = view.lands[0].cards;
    const wolf = cards.find((card) => card.id === 'wolf');
    assert.equal(wolf.found, true);
    assert.equal(wolf.level, 2);
    assert.equal(wolf.copies, 2);
    assert.equal(wolf.name, 'Wilk');
    assert.equal(wolf.meta, 'Karta pospolita · zwykły stwór');
    assert.deepEqual(wolf.details, [
      'Typ: Siła. Bije karty typu Zręczność o 50% mocniej.',
      `Poziom 2 z 5: Atak ${wolf.attack}, Życie ${wolf.life}.`,
      'Zdobyte sztuki: 2. Kolejna podniesie kartę na poziom 3.',
      'Gdzie wypada: Wiatrołomy (Skraj Wiatrołomów).',
      'Pokonany stwór zostawia tę kartę z szansą 2%.',
    ]);
    // At the top level: no chance on an exploration any more.
    const tusker = cards.find((card) => card.id === 'tusker');
    assert.equal(tusker.level, 5);
    assert.equal(tusker.details.at(-1), 'Gdzie wypada: Wiatrołomy (Dzicza Głusza).');
    assert.equal(tusker.details[2], 'Zdobyte sztuki: 5. To najwyższy poziom: karta nie wypada już z wypraw.');
    assert.ok(!tusker.details.some((line) => line.startsWith('Pokonany')));
    // An elite lives in several places.
    const wisp = cardCollectionView(new Map([['wisp', 1]]), content).lands[0].cards.find((card) => card.id === 'wisp');
    assert.equal(wisp.details[3], 'Gdzie wypada: Wiatrołomy (Skraj Wiatrołomów, Lisie Jary, Krucze Wykroty).');
    assert.equal(wisp.details[4], 'Pokonany stwór zostawia tę kartę z szansą 10%.');
    assert.deepEqual(
      cards.find((card) => card.id === 'badger'),
      { id: 'badger', found: false },
    );
  });
});

describe('Talia Systemu\'s collection where CARDS is off', () => {
  const { call, signUp } = useServer();

  test('the Encyklopedia has no "Karty"', async () => {
    const { cookie } = await signUp('BezKolekcji');
    await call('POST', '/api/character', { cookie, body: { name: 'BezKolekcji', classId: 'warrior', appearance: 'female' } });
    const book = (await call('GET', '/api/encyclopedia', { cookie })).data.encyclopedia;
    assert.ok(!book.tabs.some((tab) => tab.id === 'cards'));
    assert.equal(book.cards, undefined);
  });
});

describe('Talia Systemu\'s collection through the API', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on', CARDS: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('kolekcjoner'));
    await call('POST', '/api/character', { cookie, body: { name: 'Kolekcjoner', classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare("UPDATE characters SET level = 30, class_level = 30 WHERE name = 'Kolekcjoner'").run();
  });

  test('the Encyklopedia\'s "Karty": every card by its land, the count, the bonus and its next threshold', async () => {
    await call('POST', '/api/cards/starter', { cookie });
    const book = (await call('GET', '/api/encyclopedia', { cookie })).data.encyclopedia;
    assert.deepEqual(book.tabs.at(-1), { id: 'cards', name: 'Karty' });
    const { cards } = book;
    assert.equal(cards.found, 12);
    assert.equal(cards.all, 156);
    assert.equal(cards.lands.flatMap((land) => land.cards).length, 156);
    assert.deepEqual(cards.bonus.slice(0, 2), ['Premia kolekcji: +1% XP i +1% złota z wypraw, na stałe.', 'Następny próg: 20 różnych kart. Brakuje 8 kart.']);
    const wolf = cards.lands[0].cards.find((card) => card.id === 'wolf');
    assert.equal(wolf.copies, 1);
    assert.equal(wolf.details.length, 5);
    assert.deepEqual(
      cards.lands.at(-1).cards[0],
      { id: cards.lands.at(-1).cards[0].id, found: false },
    );
  });

  test('an exploration gives the bonus of the collection held at its claim: more XP and gold, and the report says it', async () => {
    // A second character alike, with no cards: the same exploration from the
    // same seed, claimed by both.
    const second = (await signUp('bezkart')).cookie;
    await call('POST', '/api/character', { cookie: second, body: { name: 'Bezkart', classId: 'warrior', appearance: 'female' } });
    const database = await db();
    await database.prepare('UPDATE characters SET level = 60, class_level = 50').run();
    const { id } = await database.prepare("SELECT id FROM characters WHERE name = 'Kolekcjoner'").first();
    await database.batch([...cardHomes(content).keys()].map((monster) => database.prepare('INSERT INTO cards (character_id, monster_id, copies, created_at) VALUES (?, ?, 1, 1)').bind(id, monster)));
    const claim = async (who, name) => {
      const started = await call('POST', '/api/hunts', { cookie: who, body: { areaId: 'boar-thicket', minutes: 60 } });
      assert.equal(started.status, 201, JSON.stringify(started.data));
      await (await db())
        .prepare("UPDATE activities SET seed = 'kolekcja', hp_at_start = 99999, started_at = started_at - 3600000, ends_at = ends_at - 3600000 WHERE character_id = (SELECT id FROM characters WHERE name = ?)")
        .bind(name)
        .run();
      const claimed = await call('POST', '/api/hunts/claim', { cookie: who, body: {} });
      assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
      return claimed.data.report;
    };
    const plain = await claim(second, 'Bezkart');
    const more = await claim(cookie, 'Kolekcjoner');
    assert.equal(more.summary.fights, plain.summary.fights);
    assert.ok(plain.summary.xp > 0 && plain.summary.gold > 0, JSON.stringify(plain.summary));
    const slack = plain.summary.fights + 20;
    assert.ok(more.summary.xp > plain.summary.xp * 1.1 && more.summary.xp <= plain.summary.xp * 1.15 + slack, `${plain.summary.xp} → ${more.summary.xp}`);
    assert.ok(Math.abs(more.summary.gold - plain.summary.gold * 1.15) <= slack, `${plain.summary.gold} → ${more.summary.gold}`);
    assert.ok(more.system.includes('Kolekcja kart: +15% XP i +15% złota z wyprawy.'), JSON.stringify(more.system));
    assert.ok(!plain.system.some((line) => line.startsWith('Kolekcja kart')));
  });
});

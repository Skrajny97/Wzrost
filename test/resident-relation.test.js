// The relation with a resident of the Osada on their card (20.11.2026): the
// points against the next standing's, and what the nearest higher standing
// that changes anything with that resident gives, its numbers from the data
// of their services (src/engine/resident-relation.js), or at the top that it
// is the highest; in the engine, in English and through the API.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { herbalistStock, relationPerks, residentRelation, tanneryStock } from '../src/engine/index.js';
import { countedForm } from '../src/engine/text.js';
import { contentIn } from '../src/server/content.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const { standings } = content.settlement;
const name = (id) => standings.find((standing) => standing.id === id).name;
const line = (residentId, points, options) => residentRelation(residentId, points, content, options).line;
// The content with a part of its Osada changed.
const withSettlement = (change) => ({ ...content, settlement: { ...content.settlement, ...change(content.settlement) } });

describe('the relation with a resident in the engine', () => {
  test('the points and the next standing\'s threshold, none at the top', () => {
    assert.deepEqual(residentRelation('gamehost', 180, content), { points: 180, next: 250, line: 'Stały klient: pakiety kart 20% taniej' });
    for (const [points, next] of [
      [0, 50],
      [49, 50],
      [50, 250],
      [699, 700],
      [700, 1400],
      [1399, 1400],
      [1400, null],
      [123456, null],
    ]) {
      const relation = residentRelation('headman', points, content);
      assert.equal(relation.points, points);
      assert.equal(relation.next, next, `${points} pkt`);
    }
  });

  test('at the top standing the line says it is the highest, for every resident', () => {
    for (const resident of content.settlement.residents) {
      for (const points of [1400, 5000]) assert.equal(line(resident.id, points), 'Przyjaciel: najwyższy stopień');
    }
  });

  test("Szczęsny: the packs' discount of the next standing, from cards.json, and the friend's present at the top", () => {
    const discounts = content.cards.pack.relationDiscount;
    assert.equal(line('gamehost', 0), 'Znajomy: pakiety kart 10% taniej');
    assert.equal(line('gamehost', 180), 'Stały klient: pakiety kart 20% taniej');
    assert.equal(line('gamehost', 699), 'Zaufany: pakiety kart 30% taniej');
    assert.equal(line('gamehost', 700), 'Przyjaciel: pakiety kart 40% taniej i podarek raz w tygodniu');
    // Each standing's percent is the data's.
    for (const [index, standing] of standings.entries()) {
      if (index === 0) continue;
      assert.equal(relationPerks('gamehost', index, content)[0], `pakiety kart ${Math.round(discounts[index] * 100)}% taniej`, standing.name);
    }
    // Other numbers in the data, another line.
    const cheaper = { ...content, cards: { ...content.cards, pack: { ...content.cards.pack, relationDiscount: [0, 0.05, 0.15, 0.3, 0.5] } } };
    assert.equal(residentRelation('gamehost', 0, cheaper).line, 'Znajomy: pakiety kart 5% taniej');
    // Without Talia Systemu (CARDS off) no packs: the friend's present.
    assert.equal(line('gamehost', 0, { cards: false }), 'Przyjaciel: podarek raz w tygodniu');
  });

  test('the Zaklinaczka: more affixes to choose from, and her stars from Zaufany', () => {
    assert.equal(line('enchantress', 0), 'Znajomy: do wyboru 2 nowe afiksy');
    assert.equal(line('enchantress', 50), 'Zaufany: do wyboru 3 nowe afiksy i Gwiazdki');
    assert.equal(line('enchantress', 260), 'Zaufany: do wyboru 3 nowe afiksy i Gwiazdki');
    assert.equal(line('enchantress', 700), 'Przyjaciel: podarek raz w tygodniu');
    // Her stars from the standing of ascension.from.
    const later = withSettlement((settlement) => ({ ascension: { ...settlement.ascension, from: 'friend' } }));
    assert.equal(residentRelation('enchantress', 700, later).line, 'Przyjaciel: Gwiazdki i podarek raz w tygodniu');
  });

  test('a next standing that changes nothing: the line names the nearest one that does, or there is none', () => {
    for (const resident of ['headman', 'hermit', 'groom']) {
      for (const points of [0, 50, 260, 700, 1399]) assert.equal(line(resident, points), 'Przyjaciel: podarek raz w tygodniu', `${resident} ${points}`);
    }
    // A resident with nothing at any standing: the bar and the points alone.
    const giftless = withSettlement((settlement) => ({ gifts: { ...settlement.gifts, residents: settlement.gifts.residents.filter((one) => one.resident !== 'hermit') } }));
    assert.deepEqual(residentRelation('hermit', 260, giftless), { points: 260, next: 700, line: null });
    assert.equal(residentRelation('hermit', 1400, giftless).line, 'Przyjaciel: najwyższy stopień');
  });

  test('Zbylut, Gościwit and Żelisław: the werbunek against the stranger\'s price, the discount to a tenth, the smith\'s rarity', () => {
    const prices = content.settlement.companions.priceByStanding;
    assert.equal(line('innkeeper', 0), `Znajomy: werbunek ${Math.round((1 - prices.acquaintance / prices.stranger) * 100)}% taniej`);
    assert.equal(line('innkeeper', 0), 'Znajomy: werbunek 20% taniej');
    assert.equal(line('innkeeper', 50), 'Stały klient: werbunek 35% taniej');
    assert.equal(line('innkeeper', 700), 'Przyjaciel: werbunek 50% taniej i podarek raz w tygodniu');
    assert.equal(line('merchant', 0), 'Znajomy: towar o 2,5% tańszy');
    assert.equal(line('merchant', 260), 'Zaufany: towar o 7,5% tańszy');
    const rarity = (id) => content.raritiesById[id].name;
    assert.equal(line('smith', 0), `Znajomy: przekucie do rzadkości „${rarity(content.settlement.forge.topRarity[1])}”`);
    assert.equal(line('smith', 700), `Przyjaciel: przekucie do rzadkości „${rarity('divine')}” i podarek raz w tygodniu`);
  });

  test("Jagna and Wszebor: their goods for sale, the discount and what they pay; Jagna's recipes only those not taught yet", () => {
    const herbs = herbalistStock(700, content).herbs.length;
    assert.equal(line('herbalist', 260), `Zaufany: 3 rzadkie przepisy Alchemii, ${herbs} ziół na sprzedaż, towar o 7,5% tańszy i płaci o 25% więcej niż złomiarz`);
    // The Bractwo Zielarzy's reputation at Zaufany taught them already.
    assert.equal(line('herbalist', 260, { reputation: { herbalists: 700 } }), `Zaufany: ${herbs} ziół na sprzedaż, towar o 7,5% tańszy i płaci o 25% więcej niż złomiarz`);
    const materials = tanneryStock(50, content).goods.length;
    const pieces = countedForm(materials, ['materiał', 'materiały', 'materiałów']);
    assert.equal(line('tanner', 0), `Znajomy: ${materials} ${pieces} na sprzedaż, towar o 2,5% tańszy i płaci o 15% więcej niż złomiarz`);
    // What Wszebor pays has the Bractwo Łowców's points in it, as his trade does.
    const hunters = content.settlement.brotherhoodPerks.tanneryPremium.byStanding[1];
    assert.match(line('tanner', 0, { reputation: { hunters: 50 } }), new RegExp(`płaci o ${Math.round((0.15 + hunters) * 100)}% więcej niż złomiarz$`));
  });

  test('in English: the standings, the words and the numbers as English writes them', () => {
    const en = contentIn('en');
    assert.equal(residentRelation('gamehost', 180, en).line, 'Regular: card packs 20% cheaper');
    assert.equal(residentRelation('merchant', 0, en).line, 'Acquaintance: goods 2.5% cheaper');
    assert.equal(residentRelation('enchantress', 50, en).line, 'Trusted: 3 new affixes to choose from and Stars');
    assert.equal(residentRelation('headman', 0, en).line, 'Friend: a gift every week');
    assert.equal(residentRelation('herbalist', 1400, en).line, 'Friend: the highest standing');
  });
});

describe('the relation with the residents through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on', SETTLEMENT: 'on', CARDS: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('relacyjna'));
    await call('POST', '/api/character', { cookie, body: { name: 'Relacyjna', classId: 'mage', appearance: 'female' } });
    const settlement = { relations: { gamehost: 180, herbalist: 1520, enchantress: 260 }, reputation: {} };
    await (await db()).prepare('UPDATE characters SET level = 20, class_level = 20, settlement = ?').bind(JSON.stringify(settlement)).run();
  });

  test("each resident has its points, the next standing's and the line; the words of the points come along", async () => {
    const answer = await call('GET', '/api/settlement', { cookie });
    assert.equal(answer.status, 200);
    const { residents, residentRelation: words } = answer.data.settlement;
    const of = (id) => residents.find((one) => one.id === id).relation;
    assert.deepEqual(of('gamehost'), { points: 180, next: 250, line: 'Stały klient: pakiety kart 20% taniej' });
    assert.deepEqual(of('herbalist'), { points: 1520, next: null, line: 'Przyjaciel: najwyższy stopień' });
    assert.deepEqual(of('enchantress'), { points: 260, next: 700, line: 'Zaufany: do wyboru 3 nowe afiksy i Gwiazdki' });
    assert.deepEqual(of('headman'), { points: 0, next: 50, line: 'Przyjaciel: podarek raz w tygodniu' });
    // The standing as before, for the card's name of it.
    assert.equal(residents.find((one) => one.id === 'gamehost').standing.name, name('acquaintance'));
    assert.deepEqual(words, { points: content.settlement.residentRelation.points, pointsTop: content.settlement.residentRelation.pointsTop });
  });
});

// The shared report of a Drużyna's trip in the engine (src/engine/parties.js,
// partyPartView; the author, 24.11.2026: „niech lider odbiera raport za
// wszystkich, niech wszyscy mają wspólny”): each member's part, what it got,
// in the words of the reader's language; and the line of the party event
// settled as another claims the trip for everyone (party-events.js,
// partyTripLine with chosenBy 'claim').

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createRng, generateItem, itemName, partyPartView, partyTripLine } from '../src/engine/index.js';
import { content } from './helpers/content.js';

const rng = createRng('party-parts');
const sword = generateItem({ baseId: 'sword', level: 12, rarityId: 'common' }, rng, content);
const broadsword = generateItem({ baseId: 'broadsword', level: 12, rarityId: 'rare' }, rng, content);
const part = {
  id: 7,
  name: 'Druh',
  result: 'success',
  xp: 120,
  classXp: 120,
  penalty: 0,
  gold: 45,
  timePoints: 3,
  levelBefore: 30,
  levelAfter: 31,
  classLevelBefore: 30,
  classLevelAfter: 30,
  items: [sword, broadsword],
  worn: [0],
  sold: [],
  lost: [1],
  materials: { 'wolf-pelt:common': 2 },
  resources: { wood: 4 },
  potionsUsed: { 'lesser-healing': 2, 'lesser-mana': 0 },
  cards: ['wolf'],
  packs: 1,
};

describe("a Drużyna's shared report", () => {
  test("a member's part: its numbers, its finds marked worn or lost, its materials and potions by name", () => {
    const view = partyPartView(part, content);
    assert.deepEqual(
      [view.id, view.name, view.result, view.xp, view.classXp, view.penalty, view.gold, view.timePoints, view.levelBefore, view.levelAfter],
      [7, 'Druh', 'success', 120, 120, 0, 45, 3, 30, 31],
    );
    assert.deepEqual(
      view.items.map((item) => [item.name, item.worn ?? false, item.sold ?? false, item.lost ?? false]),
      [
        [itemName(sword, content), true, false, false],
        [itemName(broadsword, content), false, false, true],
      ],
    );
    assert.equal(view.items[1].rarity, 'rare');
    assert.deepEqual(
      view.materials.map((material) => [material.label, material.count]),
      [['skóra wilka', 2]],
    );
    assert.deepEqual(view.resources, { wood: 4 });
    // A potion of none drunk is left out.
    assert.deepEqual(view.potions, [{ name: 'Mniejsza mikstura leczenia', count: 2 }]);
    // Talia Systemu's card by its creature's name, and a pack.
    assert.deepEqual(view.cards, [content.monstersById.wolf.name, content.cards.texts.packName]);
    assert.equal(view.forfeit, undefined);
  });

  test('a faint: the part says the loot is lost, and keeps the penalty', () => {
    const view = partyPartView({ ...part, result: 'fainted', forfeit: true, xp: 0, gold: 0, penalty: 30, items: [], worn: [], lost: [], materials: {} }, content);
    assert.equal(view.forfeit, true);
    assert.deepEqual([view.xp, view.gold, view.penalty, view.items, view.materials], [0, 0, 30, [], []]);
  });

  test('a part of before the lost finds (no `lost`, `sold`, `worn`) reads as plain finds', () => {
    const { worn: _worn, sold: _sold, lost: _lost, ...older } = part;
    const view = partyPartView(older, content);
    assert.ok(view.items.every((item) => !item.worn && !item.sold && !item.lost));
  });

  test("the party event settled as another claims the trip for everyone says so, apart from a timed-out one", () => {
    const event = content.partyEvents.list.find((one) => one.id === 'wounded-hunter');
    const said = (chosenBy) => partyTripLine({ event, leaderName: 'Lider', chosenBy, optionId: event.auto }, content);
    assert.equal(
      said('claim'),
      'Zdarzenie drużyny: Ranny łowca. Raport odebrano za całą drużynę, zanim wybrał lider (Lider), więc drużyna wybrała najostrożniej: Odprowadzamy go do osady. Wynik jest w osobnym raporcie w Dzienniku.',
    );
    assert.equal(
      said('auto'),
      'Zdarzenie drużyny: Ranny łowca. Lider nie wybrał w ciągu 12 godzin, więc drużyna wybrała najostrożniej: Odprowadzamy go do osady. Wynik jest w osobnym raporcie w Dzienniku.',
    );
  });
});

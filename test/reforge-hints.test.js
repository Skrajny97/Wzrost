// The class's stats as the game weighs them for its evolution: the
// Zaklinaczka's hints on an item's affixes (affixHints in
// src/server/settlement.js: ★ for a stat it needs, „Warto zakląć” for the
// one it needs least) and the verdict on items (bareItem in preview.js)
// follow the evolution's own spread of points, a stat it counts as another
// (`as`) weighed as that one (statWeightsOf in gear.js). The author,
// 17.11.2026, of a Nekromanta told to reforge Intelekt: „nie zmieniłeś u
// zaklinaczki warto zakląć, to sie pokazuje nekromancie, a nie powinno i tym
// wielu innym klasom które miały rework statystyk”, „Zręczność liczy jako
// Intelekt przecież” and „przejrzyj wszystko”.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { autoPointsOf, bareItem, gearKey, statAsOf, statWeightsOf } from '../src/engine/index.js';
import { content } from '../src/server/content.js';
import { readFeatures } from '../src/server/features.js';
import { affixHints } from '../src/server/settlement.js';

// Every form, the third ones too, as in the live game (from 0.3.0).
readFeatures({ EVOLUTIONS: 'on', THIRD_EVOLUTION: 'on' });

const amulet = [
  { stat: 'intellect', value: 70 },
  { stat: 'dexterity', value: 70 },
  { stat: 'dexterity', value: 70 },
  { stat: 'vitality', value: 70 },
];
const marks = (hints) => hints.map((hint) => (hint.worth ? 'worth' : hint.important ? '★' : ''));
const forms = () => content().evolutions.map((evolution) => ({ id: evolution.id, key: gearKey(evolution.classId, evolution.id, content()) }));

test('a Nekromanta, whose Zręczność is its Intelekt, is told to reforge neither; a Cień is told to reforge Intelekt', () => {
  assert.deepEqual(marks(affixHints(amulet, gearKey('shadow', 'necromancer', content()))), ['★', '★', '★', '★']);
  assert.deepEqual(marks(affixHints(amulet, gearKey('shadow', null, content()))), ['worth', '★', '★', '★']);
});

test('every form weighs a stat it counts as another as that one, in the hints and in the verdict on items', () => {
  const reworked = forms().filter(({ key }) => Object.keys(statAsOf(key, content())).length > 0);
  // The Strzelec Burzy, the Łowca, the Wielki Inkwizytor, the Nekromanta and
  // the forms grown from them.
  assert.deepEqual(
    reworked.map(({ id }) => id).sort(),
    ['demon-slayer', 'grand-inquisitor', 'hunter', 'lich', 'master-hunter', 'necromancer', 'perun-chosen', 'storm-archer', 'thunder-lord', 'wild-lord'],
  );
  for (const { id, key } of reworked) {
    const weights = statWeightsOf(key, content());
    for (const [from, to] of Object.entries(statAsOf(key, content()))) {
      assert.equal(weights[from], weights[to], `${id}: ${from} as ${to}`);
      const one = (stat) => bareItem({ base: 'x', slot: 'amulet', level: 1, rarity: 'common', affixes: [{ stat, value: 10 }], upgrade: 0 }, key, content()).pathScore;
      assert.equal(one(from), one(to), `${id}: the verdict counts ${from} as ${to}`);
      const hints = affixHints([{ stat: from, value: 10 }, { stat: to, value: 10 }], key);
      assert.ok(!hints[0].worth && hints[0].important, `${id}: ${from} is not to be reforged`);
    }
  }
});

test('every form is told to reforge only a stat its own weights put least into, never one it needs', () => {
  for (const { id, key } of forms()) {
    const weights = statWeightsOf(key, content());
    const top = Math.max(...Object.values(weights));
    const main = Object.entries(autoPointsOf(key, content())).sort((a, b) => b[1] - a[1])[0][0];
    for (const stat of content().statIds) {
      const hints = affixHints([{ stat, value: 10 }, { stat: main, value: 10 }], key);
      if ((weights[stat] ?? 0) * 2 >= top) assert.ok(!hints[0].worth, `${id}: ${stat} is important`);
      else assert.ok(hints[0].worth, `${id}: ${stat} is worth reforging`);
    }
  }
});

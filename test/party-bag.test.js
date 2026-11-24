// A full bag on a Drużyna's trip (the author, 24.11.2026: „w plecaku
// zostaja rzeczy do maksymalnego napełnienia a pozniej przepadają dopóki
// ktos nie posprząta”): each member's finds go into its bag while it has
// places, the best of them first, and those beyond them are lost, said in
// its report and in the shared list of what each got; nothing in the bag is
// touched and the scrapper buys nothing (src/engine/parties.js:
// partyBagLost; src/server/hunts.js: huntClaim's `partyBag`). Alone, the
// scrapper's rule stays (engine.test.js).

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { canUse, createRng, generateItem, huntReport, itemName, partyBagLost, simulateHunt } from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rng = createRng('party-bag');
const made = (baseId, rarityId, level = 20) => generateItem({ baseId, level, rarityId }, rng, content);

describe('the finds a full bag loses on a Drużyna\'s trip (engine)', () => {
  const finds = [made('sword', 'common'), made('sword', 'epic'), made('broadsword', 'rare'), made('sword', 'common', 25)];

  test('with room for some, the best go in and the weakest are lost; with none, all; with enough, none', () => {
    // Epic and rare first, then the stronger of the two common ones.
    assert.deepEqual(partyBagLost(finds, 2, 'warrior', content).sort(), [0, 3]);
    assert.deepEqual(partyBagLost(finds, 3, 'warrior', content), [0]);
    assert.deepEqual(partyBagLost(finds, 0, 'warrior', content).sort(), [0, 1, 2, 3]);
    // A bag already past its places (an item taken off above the level lock).
    assert.deepEqual(partyBagLost(finds, -2, 'warrior', content).sort(), [0, 1, 2, 3]);
    assert.deepEqual(partyBagLost(finds, 4, 'warrior', content), []);
    assert.deepEqual(partyBagLost([], 0, 'warrior', content), []);
  });

  test('the report marks the lost finds, names them in a line, and never makes one of them the best find', () => {
    const character = newCharacter('warrior', { level: 20, classLevel: 20 });
    const hunt = { ...simulateHunt({ character, equipped: [], areaId: 'windfalls-edge', minutes: 5, seed: 'bag' }, content), items: finds };
    const applied = { level: 20, xp: 0, classLevel: 20, classXp: 0, penalty: 0, levelled: false, timePoints: 0, messages: [] };
    const report = huntReport({ hunt, applied, character, areaId: 'windfalls-edge', startedAt: 0, endsAt: 1, lost: { capacity: 30, indices: [1, 2] } }, content);
    assert.deepEqual(
      report.items.map((item) => item.lost ?? false),
      [false, true, true, false],
    );
    assert.equal(report.summary.bestFind.name, itemName(finds[3], content));
    assert.ok(
      report.system.includes(`Plecak jest pełny (30 miejsc), więc te łupy wyprawy drużyny przepadły: ${itemName(finds[1], content)}, ${itemName(finds[2], content)}. Zrób w nim miejsce, a kolejne trafią do plecaka.`),
      JSON.stringify(report.system),
    );
    // Without `lost`, as ever.
    const plain = huntReport({ hunt, applied, character, areaId: 'windfalls-edge', startedAt: 0, endsAt: 1 }, content);
    assert.ok(plain.items.every((item) => !item.lost));
    assert.ok(!plain.system.some((line) => line.startsWith('Plecak jest pełny')));
  });
});

describe("a Drużyna's trip with full bags (API)", () => {
  const { call, db, signUp } = useServer();
  const cookies = {};
  const sql = async (query, ...binds) => (await db()).prepare(query).bind(...binds);
  const places = content.balance.items.bagSlots;
  // Strong, in full gear of its class (nothing found is worn at once into
  // an empty slot), not on its first exploration.
  const player = async (login, name) => {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await (await sql(`UPDATE characters SET level = 30, class_level = 30, points = '{"strength":300,"vitality":300}', hp_at = 0 WHERE name = ?`, name)).run();
    await (await sql('DELETE FROM items WHERE character_id = (SELECT id FROM characters WHERE name = ?)', name)).run();
    for (const { id: slot } of content.slots) {
      const base = content.bases.find((one) => one.slot === slot && !one.family && canUse(one.id, 'warrior', content));
      if (!base) continue;
      await (await sql('INSERT INTO items (character_id, slot, data, created_at) SELECT id, ?, ?, 0 FROM characters WHERE name = ?', slot, JSON.stringify(made(base.id, 'common', 30)), name)).run();
    }
    await (await sql("INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) SELECT id, 'earlier-' || id, 'hunt', 0, '{}', '{}' FROM characters WHERE name = ?", name)).run();
  };
  // `count` items in the bag, the weakest of all: common, of level 1.
  const fill = async (name, count) => {
    for (let index = 0; index < count; index += 1) {
      await (await sql('INSERT INTO items (character_id, slot, data, created_at) SELECT id, NULL, ?, 0 FROM characters WHERE name = ?', JSON.stringify(made('sword', 'common', 1)), name)).run();
    }
  };
  const bag = async (name) => (await (await sql('SELECT i.id, i.data FROM items i JOIN characters c ON c.id = i.character_id WHERE c.name = ? AND i.slot IS NULL ORDER BY i.id', name)).all()).results;
  const row = async (name) => (await sql('SELECT * FROM characters WHERE name = ?', name)).first();
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  // A member's trip as kept, its loot fought again in the engine as the
  // claim fights it, with the loot's seed `seed`.
  const found = ({ character_id: id, region_id: areaId, minutes, options }, seed) => {
    const { roster, encounter } = options.party;
    const one = roster.find((each) => each.id === id);
    return simulateHunt(
      {
        character: { ...one.character, ...options.levels },
        equipped: one.equipped,
        hp: one.hp,
        name: one.name,
        areaId,
        minutes,
        seed: options.party.seed,
        lootSeed: seed,
        roster,
        self: id,
        avoidRare: encounter.avoidRare,
        seekRare: encounter.seekRare,
        rumor: encounter.rumor,
        tracked: encounter.tracked,
        unknown: encounter.unknown,
        met: encounter.met,
      },
      content,
    ).items;
  };

  beforeEach(async () => {
    await player('lider', 'Lider');
    await player('druh', 'Druh');
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
  });

  test('a full bag loses every find, one with a place left keeps the best; nothing in the bags is touched, nothing is sold', async () => {
    await fill('Druh', places);
    await fill('Lider', places - 1);
    const before = { Lider: await row('Lider'), Druh: await row('Druh') };
    const bags = { Lider: await bag('Lider'), Druh: await bag('Druh') };
    const went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'boar-thicket', minutes: 60 });
    assert.equal(went.status, 201, JSON.stringify(went.data).slice(0, 300));
    // Each one's loot of a seed that finds at least two items.
    const finds = {};
    for (const name of ['Lider', 'Druh']) {
      const trip = await (await sql('SELECT a.* FROM activities a JOIN characters c ON c.id = a.character_id WHERE c.name = ?', name)).first();
      const options = JSON.parse(trip.options);
      let seed = 0;
      while (found({ ...trip, options }, `loot-${seed}`).length < 2) seed += 1;
      finds[name] = found({ ...trip, options }, `loot-${seed}`);
      await (await sql('UPDATE activities SET seed = ? WHERE character_id = ?', `loot-${seed}`, trip.character_id)).run();
    }
    await (await sql('UPDATE activities SET started_at = started_at - 3600000, ends_at = ends_at - 3600000')).run();

    const claimed = await as('lider', 'POST', '/api/hunts/claim');
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
    const druh = (await as('druh', 'POST', '/api/hunts/claim')).data.report;
    const reports = { Lider: claimed.data.report, Druh: druh };
    for (const name of ['Lider', 'Druh']) {
      const report = reports[name];
      assert.equal(report.items.length, finds[name].length);
      // The bag's items as they were, and the finds kept after them.
      const now = await bag(name);
      assert.deepEqual(
        now.slice(0, bags[name].length).map((item) => [item.id, item.data]),
        bags[name].map((item) => [item.id, item.data]),
      );
      assert.equal(now.length, places);
      // No scrapper: the gold is the trip's own.
      assert.equal((await row(name)).gold, before[name].gold + report.summary.gold);
      assert.ok(!report.system.some((line) => line.startsWith('Plecak był pełny')), JSON.stringify(report.system));
      const lost = report.items.filter((item) => item.lost);
      assert.ok(
        report.system.includes(`Plecak jest pełny (${places} miejsc), więc te łupy wyprawy drużyny przepadły: ${lost.map((item) => item.name).join(', ')}. Zrób w nim miejsce, a kolejne trafią do plecaka.`),
        JSON.stringify(report.system),
      );
      // And the shared list says the same of each.
      for (const shared of Object.values(reports)) {
        const part = shared.partyClaim.members.find((one) => one.name === name);
        assert.deepEqual(
          part.items.map((item) => item.lost ?? false),
          report.items.map((item) => item.lost ?? false),
        );
      }
    }
    // Druh had no place: all its finds are lost.
    assert.ok(reports.Druh.items.every((item) => item.lost));
    // The leader had one: it keeps the best of its finds, as the engine
    // weighs them.
    const keptIndex = reports.Lider.items.findIndex((item) => !item.lost);
    const weighed = partyBagLost(finds.Lider, 1, 'warrior', content);
    assert.deepEqual(
      reports.Lider.items.map((item, index) => index !== keptIndex),
      finds.Lider.map((item, index) => weighed.includes(index)),
    );
    assert.equal(JSON.parse((await bag('Lider')).at(-1).data).base, finds.Lider[keptIndex].base);
    assert.equal(reports.Lider.summary.bestFind.name, reports.Lider.items[keptIndex].name);
  });
});

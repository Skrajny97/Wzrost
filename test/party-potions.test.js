// Mikstury członków drużyny (src/server/parties.js, memberPotions and
// setPartyPotions; the author, 20.11.2026: „Powinna byc opcja zabierania
// przez reszte drużyny jakos mikstur zdrowia i many”). A member who is not
// the leader chooses in the Drużyna the healing and mana potions it takes
// along on the party's trips, and its healing mark; as the leader sends the
// party out, they leave its bag with its start, as many as it has and as
// the trip has fights, it drinks them in the trip's fights by its own mark,
// and those not drunk come back with its report, as on a "Wyrusz" alone.
// A member without a choice takes nothing, as before; the leader takes its
// own in "Opcje wyprawy". Each player pays only for what it drank (the
// engine's hunt.js, by combat.js's `drinkers`), also when two carry the
// same potion. A member takes only the potions it may use: from their level
// of the character or with their recipes known (1272).

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { useServer } from './helpers/server.js';

describe("a Drużyna's members take their own potions along", () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on' });
  const cookies = {};
  const sql = async (query, ...binds) => (await db()).prepare(query).bind(...binds);
  // Alchemia at level 5 knows the lesser healing and mana potions. Little
  // Siła makes the fights long, so the creatures strike often.
  const player = async (login, name, potions, classId = 'warrior') => {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId, appearance: 'female' } });
    await (
      await sql(
        `UPDATE characters SET level = 30, class_level = 30, points = '{"strength":5,"vitality":140}', professions = '{"alchemy":{"level":5,"xp":0}}', potions = ? WHERE name = ?`,
        JSON.stringify(potions),
        name,
      )
    ).run();
  };
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const row = async (name) => (await sql('SELECT * FROM characters WHERE name = ?', name)).first();
  const bag = async (name) => JSON.parse((await row(name)).potions);
  const options = async (name) => JSON.parse((await (await sql("SELECT a.options FROM activities a JOIN characters c ON c.id = a.character_id WHERE c.name = ? AND a.kind = 'hunt'", name)).first()).options);
  // The reports of the trip of `minutes`, claimed by each once it is over.
  async function claimAll(minutes, names) {
    await (await sql('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ?', minutes * 60000, minutes * 60000)).run();
    const reports = {};
    for (const name of names) {
      const claimed = await as(name.toLowerCase(), 'POST', '/api/hunts/claim');
      assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
      reports[name] = claimed.data.report;
    }
    return reports;
  }
  // The potions each player drank in a trip's fights, by name, as its
  // playback shows them.
  const drunkBy = (report) => {
    const drunk = {};
    for (const fight of report.fights) {
      const names = Object.fromEntries(fight.allies.map((ally) => [ally.id, ally.name]));
      for (const event of fight.events.filter((one) => one.kind === 'potion')) {
        const mine = (drunk[names[event.actor]] ??= {});
        mine[event.potion] = (mine[event.potion] ?? 0) + 1;
      }
    }
    return drunk;
  };

  // Druh, a warrior, stands alone in the front row, where the creatures
  // strike most (balance.combat.targetWeights); the two mages stand behind.
  beforeEach(async () => {
    await player('lider', 'Lider', { 'lesser-healing': 4 }, 'mage');
    await player('druh', 'Druh', { 'lesser-healing': 8, 'lesser-mana': 1 });
    await player('trzeci', 'Trzeci', { 'lesser-healing': 3 }, 'mage');
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('lider', 'POST', '/api/party/invite', { name: 'Trzeci' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
    await as('trzeci', 'POST', '/api/party/accept', { partyId: data.party.id });
  });

  test('a member takes its choice from its bag, drinks it in the trip and gets back what it did not drink; one without a choice takes nothing', async () => {
    // More than the bag holds and than an hour's trip has fights (6).
    const chosen = await as('druh', 'PUT', '/api/party/potions', { potions: { 'lesser-healing': 9, 'lesser-mana': 3 }, healBelow: 0.7 });
    assert.equal(chosen.status, 200, JSON.stringify(chosen.data));
    assert.deepEqual(chosen.data.potions, { potions: { 'lesser-healing': 9, 'lesser-mana': 3 }, healBelow: 0.7 });
    assert.deepEqual((await as('druh', 'GET', '/api/party')).data.potions, chosen.data.potions);
    assert.equal((await as('trzeci', 'GET', '/api/party')).data.potions, null);
    // At a third of its HP the first blow it takes calls for a potion. A
    // share of the HP comes back after each fight, so after three fights
    // with no blow at it, it is over its mark; a creature almost always
    // reaches it in the first fight (the trip's draw is the server's).
    const { maxHp } = (await as('druh', 'GET', '/api/character')).data.character;
    await (await sql("UPDATE characters SET hp = ?, hp_at = ? WHERE name = 'Druh'", Math.round(maxHp / 3), Date.now())).run();

    const went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'boar-thicket', minutes: 60, potions: { 'lesser-healing': 2 }, healBelow: 0.2 });
    assert.equal(went.status, 201, JSON.stringify(went.data).slice(0, 300));
    assert.deepEqual(went.data.went, ['Druh', 'Trzeci']);
    // Druh: one of each for each fight, as many as it has; Trzeci nothing;
    // the leader its own.
    assert.deepEqual(await bag('Druh'), { 'lesser-healing': 2 });
    assert.deepEqual(await bag('Trzeci'), { 'lesser-healing': 3 });
    assert.deepEqual(await bag('Lider'), { 'lesser-healing': 2 });
    const kept = await options('Druh');
    assert.deepEqual([kept.potions, kept.reserved, kept.healBelow], [{ 'lesser-healing': 6, 'lesser-mana': 1 }, true, 0.7]);
    assert.equal((await options('Trzeci')).potions, undefined);
    const roster = Object.fromEntries(kept.party.roster.map((one) => [one.name, one]));
    assert.deepEqual([roster.Lider.potions, roster.Lider.healBelow], [{ 'lesser-healing': 2 }, 0.2]);
    assert.deepEqual([roster.Druh.potions, roster.Druh.healBelow], [{ 'lesser-healing': 6, 'lesser-mana': 1 }, 0.7]);
    assert.equal(roster.Trzeci.potions, undefined);
    assert.equal(roster.Trzeci.healBelow, undefined);
    // The choice stays for the next trips.
    assert.deepEqual((await as('druh', 'GET', '/api/party')).data.potions, chosen.data.potions);

    const reports = await claimAll(60, ['Lider', 'Druh', 'Trzeci']);
    // Each pays for what it drank in the trip's fights, the same in every
    // report, also of the potion the leader carries too.
    const drunk = drunkBy(reports.Lider);
    for (const name of ['Druh', 'Trzeci']) assert.deepEqual(drunkBy(reports[name]), drunk, `${name}'s report`);
    for (const name of ['Lider', 'Druh', 'Trzeci']) assert.deepEqual(reports[name].potionsUsed, drunk[name] ?? {}, `${name}'s potions`);
    const heal = drunk.Druh?.['lesser-healing'] ?? 0;
    const mana = drunk.Druh?.['lesser-mana'] ?? 0;
    assert.ok(heal <= 6, `Druh drank ${heal}`);
    // A trip in which no blow left it below its mark is the only one in
    // which it drinks none.
    if (heal === 0) {
      for (const fight of reports.Lider.fights) {
        const druh = fight.allies.find((ally) => ally.name === 'Druh');
        const below = fight.events.some((event) => event.target === druh.id && event.damage > 0 && event.hp > 0 && event.hp < 0.7 * druh.maxHp);
        assert.ok(!below, 'Druh fell below its mark and drank nothing');
      }
    }
    assert.ok(mana <= 1);
    assert.equal(drunk.Trzeci, undefined);
    assert.ok((drunk.Lider?.['lesser-healing'] ?? 0) <= 2);
    // What was not drunk is back in the bag.
    assert.deepEqual(await bag('Druh'), { 'lesser-healing': 8 - heal, ...(mana === 0 && { 'lesser-mana': 1 }) });
    assert.deepEqual(await bag('Trzeci'), { 'lesser-healing': 3 });
    const leaderDrank = drunk.Lider?.['lesser-healing'] ?? 0;
    assert.deepEqual(await bag('Lider'), leaderDrank === 4 ? {} : { 'lesser-healing': 4 - leaderDrank });
    // Its report says so as on a "Wyrusz" alone; Trzeci's says nothing.
    const lines = reports.Druh.summary.potions ?? [];
    assert.equal(lines.length, heal + mana > 0 ? 1 : 0);
    if (heal > 0) assert.match(lines[0], new RegExp(`^Zużyte mikstury: .*${heal} × Mniejsza mikstura leczenia`));
    if (mana > 0) assert.match(lines[0], /1 × Mniejsza mikstura many/);
    assert.deepEqual(reports.Trzeci.summary.potions ?? [], []);
  });

  test('a shorter trip takes as many as its fights, and none of a potion the bag has run out of', async () => {
    await as('druh', 'PUT', '/api/party/potions', { potions: { 'lesser-healing': 5, 'lesser-mana': 2 } });
    await (await sql(`UPDATE characters SET potions = '{"lesser-healing":8}' WHERE name = 'Druh'`)).run();
    // Five minutes: two fights.
    const went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'boar-thicket', minutes: 5 });
    assert.equal(went.status, 201, JSON.stringify(went.data).slice(0, 300));
    const kept = await options('Druh');
    assert.deepEqual([kept.potions, kept.healBelow], [{ 'lesser-healing': 2 }, 0.4]);
    assert.deepEqual(await bag('Druh'), { 'lesser-healing': 6 });
    // The leader went without potions, as it chose none.
    assert.deepEqual(kept.party.roster[0].potions, {});
    assert.deepEqual(await bag('Lider'), { 'lesser-healing': 4 });
  });

  // 1272 (26.11.2026): from the potion's level of the character, or, as
  // before, with its recipe known.
  test('a member takes along only the potions it may use: from their level of the character or with their recipes', async () => {
    await (await sql(`UPDATE characters SET professions = '{}', potions = '{"lesser-healing":3,"greater-healing":2}' WHERE name = 'Druh'`)).run();
    assert.equal((await as('druh', 'PUT', '/api/party/potions', { potions: { 'lesser-healing': 2, 'greater-healing': 2 } })).status, 200);
    // Five minutes: two fights, at the 30th level with no Alchemia, without
    // the Duża (45).
    const went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'boar-thicket', minutes: 5 });
    assert.equal(went.status, 201, JSON.stringify(went.data).slice(0, 300));
    assert.deepEqual((await options('Druh')).potions, { 'lesser-healing': 2 });
    assert.deepEqual(await bag('Druh'), { 'lesser-healing': 1, 'greater-healing': 2 });
    await claimAll(5, ['Lider', 'Druh', 'Trzeci']);
    const takes = async () => {
      const going = await as('lider', 'POST', '/api/party/hunt', { areaId: 'boar-thicket', minutes: 5 });
      assert.equal(going.status, 201, JSON.stringify(going.data).slice(0, 300));
      const taken = (await options('Druh')).potions['greater-healing'];
      await claimAll(5, ['Lider', 'Druh', 'Trzeci']);
      return taken;
    };

    // With Alchemia at the 45th, at the 30th level, it takes the Duża.
    const full = `potions = '{"lesser-healing":3,"greater-healing":2}'`;
    await (await sql(`UPDATE characters SET ${full}, professions = '{"alchemy":{"level":45,"xp":0}}' WHERE name = 'Druh'`)).run();
    assert.equal(await takes(), 2);
    // So it does at the 45th level with no Alchemia.
    await (await sql(`UPDATE characters SET level = 45`)).run();
    await (await sql(`UPDATE characters SET ${full}, professions = '{}' WHERE name = 'Druh'`)).run();
    assert.equal(await takes(), 2);
  });

  test("the leader's own choice in the Drużyna waits until it is a member; the new leader takes those of its Opcje wyprawy", async () => {
    await as('lider', 'PUT', '/api/party/potions', { potions: { 'lesser-healing': 3 } });
    await as('druh', 'PUT', '/api/party/potions', { potions: { 'lesser-healing': 4 } });
    const went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'boar-thicket', minutes: 60 });
    assert.equal(went.status, 201);
    assert.deepEqual(await bag('Lider'), { 'lesser-healing': 4 });
    assert.equal((await options('Lider')).potions, undefined);
    assert.deepEqual(await bag('Druh'), { 'lesser-healing': 4, 'lesser-mana': 1 });
    await claimAll(60, ['Lider', 'Druh', 'Trzeci']);

    // Druh leads now: its choice in the Drużyna waits, and Lider's goes.
    const lider = (await row('Lider')).id;
    const druh = (await row('Druh')).id;
    assert.equal((await as('lider', 'POST', '/api/party/lead', { characterId: druh })).status, 200);
    const healing = (name) => bag(name).then((potions) => potions['lesser-healing'] ?? 0);
    const before = { Lider: await healing('Lider'), Druh: await healing('Druh') };
    const again = await as('druh', 'POST', '/api/party/hunt', { areaId: 'boar-thicket', minutes: 60, potions: { 'lesser-healing': 1 } });
    assert.equal(again.status, 201, JSON.stringify(again.data).slice(0, 300));
    const roster = (await options('Druh')).party.roster;
    assert.deepEqual(
      roster.map((one) => [one.id, one.potions]),
      [
        [druh, { 'lesser-healing': 1 }],
        [lider, { 'lesser-healing': Math.min(3, before.Lider) }],
        [(await row('Trzeci')).id, undefined],
      ],
    );
    assert.equal(await healing('Druh'), before.Druh - 1);
    assert.equal(await healing('Lider'), before.Lider - Math.min(3, before.Lider));
  });

  test('the choice is checked: potions of healing and mana by id, whole numbers up to the longest trip’s fights, a mark of the list', async () => {
    const put = (body) => as('druh', 'PUT', '/api/party/potions', body);
    const refused = async (body) => {
      const answer = await put(body);
      assert.equal(answer.status, 400, JSON.stringify(body));
      return answer.data.error.code;
    };
    assert.equal(await refused({ potions: [] }), 'invalid_potions');
    assert.equal(await refused({ potions: 'lesser-healing' }), 'invalid_potions');
    assert.equal(await refused({ potions: { nothing: 1 } }), 'invalid_potions');
    assert.equal(await refused({ potions: { ['__proto__']: 1 } }), 'invalid_potions');
    // Not of healing or mana: a speed potion, an antidote, the fern brew.
    for (const id of ['lesser-speed', 'antidote', 'fern-brew']) assert.equal(await refused({ potions: { [id]: 1 } }), 'invalid_potions', id);
    for (const count of [-1, 1.5, '2', null, 11]) assert.equal(await refused({ potions: { 'lesser-healing': count } }), 'invalid_potions', String(count));
    assert.equal(await refused({ potions: { 'lesser-healing': 1 }, healBelow: 0.45 }), 'invalid_heal_below');
    assert.equal(await refused({ potions: {}, healBelow: '0.5' }), 'invalid_heal_below');
    assert.equal((await row('Druh')).party_potions, null);

    // Ten of one, the longest trip's fights; one the bag lacks is kept too.
    const saved = await put({ potions: { 'lesser-healing': 10, 'lesser-mana': 0, 'greater-healing': 2 }, healBelow: 0.5 });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.data.potions, { potions: { 'lesser-healing': 10, 'greater-healing': 2 }, healBelow: 0.5 });
    assert.deepEqual(JSON.parse((await row('Druh')).party_potions), saved.data.potions);
    // A mark alone is a choice too; nothing at all is none.
    assert.deepEqual((await put({ healBelow: 0.6 })).data.potions, { potions: {}, healBelow: 0.6 });
    assert.equal((await put({ potions: { 'lesser-healing': 0 } })).data.potions, null);
    assert.equal((await row('Druh')).party_potions, null);
    // Out of a party the Drużyna says none.
    await as('druh', 'PUT', '/api/party/potions', { potions: { 'lesser-healing': 1 } });
    await as('druh', 'POST', '/api/party/leave');
    assert.equal((await as('druh', 'GET', '/api/party')).data.potions, null);
    assert.ok((await row('Druh')).party_potions);
  });
});

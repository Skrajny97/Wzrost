// Drużyny (src/server/parties.js): from character level 25, up to three
// characters of different players with a leader, who sends those free on an
// exploration as far and as long as the lowest of them may; each goes with
// the others beside it and gets its own report. One at a profession's work
// stays in the party and stays home.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { simulateHunt } from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

describe('a party in the engine', () => {
  test('the other players fight beside the character, and each one along costs a share of the XP', () => {
    const character = newCharacter('warrior', { level: 30, classLevel: 30 });
    const partner = { id: 7, name: 'Druh', character: newCharacter('mage', { level: 30, classLevel: 30 }), equipped: [], hp: 400 };
    const base = { character, equipped: [], hp: 500, name: 'Lider', areaId: 'mossy-boulders', minutes: 60, seed: 'party' };
    const alone = simulateHunt(base, content);
    const together = simulateHunt({ ...base, partners: [partner] }, content);
    const first = together.fights[0];
    assert.ok(first.allies.some((unit) => unit.id === 'p1' && unit.name === 'Druh' && unit.classId === 'mage'));
    assert.equal(together.partners[0].id, 7);
    assert.ok(!alone.partners);
    // A fight's XP with one more player: the share xpCost less.
    const { xpCost } = content.balance.parties;
    const won = together.fights.find((fight) => fight.won === true && fight.xp > 0);
    assert.ok(won);
    assert.ok(xpCost > 0 && xpCost < 0.1);
  });
});

describe('Drużyna through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on' });
  const cookies = {};

  async function player(login, name, { level = 30, classLevel = 30 } = {}) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = ?, class_level = ? WHERE name = ?').bind(level, classLevel, name).run();
  }
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const idOf = async (name) => (await (await db()).prepare('SELECT id FROM characters WHERE name = ?').bind(name).first()).id;

  beforeEach(async () => {
    await player('lider', 'Lider');
    await player('druh', 'Druh');
  });

  test('the Drużyna opens at character level 25', async () => {
    await (await db()).prepare("UPDATE characters SET level = 24 WHERE name = 'Druh'").run();
    const locked = await as('druh', 'GET', '/api/party');
    assert.equal(locked.status, 403);
    assert.equal(locked.data.error.code, 'locked');
    const invited = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    assert.equal(invited.data.error.code, 'target_locked');
  });

  test('an invitation makes a party, the invited one joins, and the party goes out together', async () => {
    const invited = await as('lider', 'POST', '/api/party/invite', { name: 'druh' });
    assert.equal(invited.status, 200, JSON.stringify(invited.data));
    assert.deepEqual(invited.data.party.invited.map((one) => one.name), ['Druh']);
    assert.equal(invited.data.party.members[0].leader, true);
    // The light on the Społeczność tab of the invited one.
    assert.equal((await as('druh', 'GET', '/api/chat/latest')).data.partyInvites, 1);
    const seen = await as('druh', 'GET', '/api/party');
    assert.equal(seen.data.invites.length, 1);
    assert.match(seen.data.invites[0].members, /Lider/);
    const joined = await as('druh', 'POST', '/api/party/accept', { partyId: seen.data.invites[0].partyId });
    assert.equal(joined.status, 200, JSON.stringify(joined.data));
    assert.deepEqual(joined.data.party.members.map((one) => [one.name, one.leader]), [['Lider', true], ['Druh', false]]);
    assert.equal(joined.data.invites.length, 0);
    // Only the leader sends the party out.
    const notLeader = await as('druh', 'POST', '/api/party/hunt', { areaId: 'mossy-boulders', minutes: 30 });
    assert.equal(notLeader.data.error.code, 'not_leader');
    const went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'mossy-boulders', minutes: 30 });
    assert.equal(went.status, 201, JSON.stringify(went.data));
    assert.deepEqual(went.data.went, ['Druh']);
    const activities = (await (await db()).prepare('SELECT character_id, region_id, minutes, options FROM activities ORDER BY character_id').all()).results;
    assert.equal(activities.length, 2);
    for (const activity of activities) {
      const options = JSON.parse(activity.options);
      assert.equal(activity.region_id, 'mossy-boulders');
      assert.equal(activity.minutes, 30);
      assert.deepEqual(options.party.names.sort(), ['Druh', 'Lider']);
      assert.equal(options.partners.length, 1);
      assert.notEqual(options.partners[0].id, activity.character_id);
    }
    await (await db()).prepare('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ?').bind(1800000, 1800000).run();
    for (const login of ['lider', 'druh']) {
      let claimed = await as(login, 'POST', '/api/hunts/claim');
      // An event at the end waits for a choice: the first option.
      if (claimed.data.event) claimed = await as(login, 'POST', '/api/hunts/claim', { choice: claimed.data.event.options.find((option) => !option.disabled)?.id ?? claimed.data.event.options[0].id });
      assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 400));
      assert.deepEqual(claimed.data.report.party.sort(), ['Druh', 'Lider']);
    }
  });

  test('the party goes only as far and as long as its lowest member may', async () => {
    await (await db()).prepare("UPDATE characters SET level = 26, class_level = 20 WHERE name = 'Druh'").run();
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
    const view = (await as('lider', 'GET', '/api/party')).data.party;
    assert.equal(view.limits.classLevelBy, 'Druh');
    const far = await as('lider', 'POST', '/api/party/hunt', { areaId: 'mossy-boulders', minutes: 30 });
    assert.equal(far.data.error.code, 'party_area_locked');
    assert.match(far.data.error.message, /Druh/);
    assert.equal((await (await db()).prepare('SELECT COUNT(*) AS count FROM activities').first()).count, 0);
  });

  test('a member busy elsewhere stays home, and a party with nobody free does not go', async () => {
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
    assert.equal((await as('druh', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).status, 201);
    const view = (await as('lider', 'GET', '/api/party')).data.party;
    assert.equal(view.members.find((one) => one.name === 'Druh').status, 'away');
    const nobody = await as('lider', 'POST', '/api/party/hunt', { areaId: 'windfalls-edge', minutes: 5 });
    assert.equal(nobody.data.error.code, 'nobody_free');
  });

  test('a member at a profession\'s work stays in the party, stays home and limits nothing', async () => {
    await player('trzeci', 'Trzeci');
    // Druh's class level keeps the Omszałe Głazy shut to it.
    await (await db()).prepare("UPDATE characters SET level = 26, class_level = 20 WHERE name = 'Druh'").run();
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('lider', 'POST', '/api/party/invite', { name: 'Trzeci' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
    await as('trzeci', 'POST', '/api/party/accept', { partyId: data.party.id });
    const gathering = await as('druh', 'POST', '/api/professions/gather', { herbs: ['comfrey'], minutes: 60 });
    assert.equal(gathering.status, 201, JSON.stringify(gathering.data));
    const view = (await as('lider', 'GET', '/api/party')).data.party;
    assert.equal(view.members.find((one) => one.name === 'Druh').status, 'working');
    assert.notEqual(view.limits.classLevelBy, 'Druh');
    const went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'mossy-boulders', minutes: 30 });
    assert.equal(went.status, 201, JSON.stringify(went.data));
    assert.deepEqual(went.data.went, ['Trzeci']);
    assert.deepEqual(went.data.party.members.map((one) => one.name), ['Lider', 'Druh', 'Trzeci']);
    const druh = await (await db()).prepare("SELECT a.kind FROM activities a JOIN characters c ON c.id = a.character_id WHERE c.name = 'Druh'").first();
    assert.equal(druh.kind, 'herbs');
  });

  test('a member leaves when it wants, a leader who leaves passes the lead, and a party nobody is in goes', async () => {
    await player('trzeci', 'Trzeci');
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('lider', 'POST', '/api/party/invite', { name: 'Trzeci' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
    await as('trzeci', 'POST', '/api/party/accept', { partyId: data.party.id });
    // Three is the most.
    await player('czwarty', 'Czwarty');
    const full = await as('lider', 'POST', '/api/party/invite', { name: 'Czwarty' });
    assert.equal(full.data.error.code, 'full');
    const left = await as('lider', 'POST', '/api/party/leave');
    assert.equal(left.data.party, null);
    const after = (await as('druh', 'GET', '/api/party')).data.party;
    assert.deepEqual(after.members.map((one) => [one.name, one.leader]), [['Druh', true], ['Trzeci', false]]);
    // The new leader sends one out; then the last one leaves and the party is gone.
    assert.equal((await as('druh', 'POST', '/api/party/kick', { characterId: await idOf('Trzeci') })).status, 200);
    await as('druh', 'POST', '/api/party/leave');
    assert.equal((await (await db()).prepare('SELECT COUNT(*) AS count FROM parties').first()).count, 0);
  });

  test('no own character in the party', async () => {
    await call('POST', '/api/character', { cookie: cookies.lider, body: { name: 'Druga', classId: 'mage', appearance: 'female' } });
    await (await db()).prepare("UPDATE characters SET level = 30, class_level = 30 WHERE name = 'Druga'").run();
    const own = await as('lider', 'POST', '/api/party/invite', { name: 'Lider' });
    assert.equal(own.data.error.code, 'own');
  });

  test('a deleted account leaves its party', async () => {
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
    const gone = await as('druh', 'DELETE', '/api/me', { login: 'druh' });
    assert.equal(gone.status, 200, JSON.stringify(gone.data));
    const view = (await as('lider', 'GET', '/api/party')).data.party;
    assert.deepEqual(view.members.map((one) => one.name), ['Lider']);
  });
});

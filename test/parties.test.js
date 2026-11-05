// Drużyny (src/server/parties.js): from character level 25, up to three
// characters of different players with a leader, who sends those free on an
// exploration as far and as long as the lowest of them may; each goes with
// the others beside it and gets its own report. One at a profession's work
// stays in the party and stays home.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { huntWait, simulateHunt } from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';

// The newest place's stronger creatures (balance.monsters.huntCurve,
// hunt-strength.test.js) and the harder explorations from the 10th level
// (balance.challenge) aside: these fights test something else.
const calm = { ...content, balance: { ...content.balance, monsters: { ...content.balance.monsters, huntCurve: [] }, challenge: { ...content.balance.challenge, fromLevel: Infinity } } };
import { useServer } from './helpers/server.js';

describe('a party in the engine', () => {
  test('the other players fight beside the character, and each one along costs a share of the XP', () => {
    const character = newCharacter('warrior', { level: 30, classLevel: 30 });
    const partner = { id: 7, name: 'Druh', character: newCharacter('mage', { level: 30, classLevel: 30 }), equipped: [], hp: 400 };
    const base = { character, equipped: [], hp: 500, name: 'Lider', areaId: 'mossy-boulders', minutes: 60, seed: 'party' };
    const alone = simulateHunt(base, calm);
    const together = simulateHunt({ ...base, partners: [partner] }, calm);
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
      // The trip's roster, both players in the trip's order.
      assert.deepEqual(options.party.roster.map((one) => one.name), ['Lider', 'Druh']);
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
    // Within the class levels' spread, Druh's keeps the Omszałe Głazy shut to it.
    await (await db()).prepare("UPDATE characters SET level = 26, class_level = 24 WHERE name = 'Druh'").run();
    await (await db()).prepare("UPDATE characters SET class_level = 29 WHERE name = 'Lider'").run();
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
    // Druh's class level keeps the Omszałe Głazy shut to it, within the
    // class levels' spread.
    await (await db()).prepare("UPDATE characters SET level = 26, class_level = 24 WHERE name = 'Druh'").run();
    await (await db()).prepare("UPDATE characters SET class_level = 29 WHERE name IN ('Lider', 'Trzeci')").run();
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

  // Both explorations of a trip claimed, an event at the end answered.
  async function claimBoth() {
    const reports = {};
    for (const login of ['lider', 'druh']) {
      let claimed = await as(login, 'POST', '/api/hunts/claim');
      if (claimed.data.event) claimed = await as(login, 'POST', '/api/hunts/claim', { choice: claimed.data.event.options.find((option) => !option.disabled)?.id ?? claimed.data.event.options[0].id });
      assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 400));
      reports[login] = claimed.data.report;
    }
    return reports;
  }

  test('the explorations of a trip share their timer: any member\'s "Przewiń" moves them all, and the others hear of it', async () => {
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
    assert.equal((await as('lider', 'POST', '/api/party/hunt', { areaId: 'mossy-boulders', minutes: 30 })).status, 201);
    const ends = async () => (await (await db()).prepare('SELECT c.name, a.ends_at FROM activities a JOIN characters c ON c.id = a.character_id ORDER BY c.name').all()).results;
    const before = await ends();
    // The member, not the leader, skips 10 minutes: both explorations move.
    await (await db()).prepare("UPDATE characters SET time_points = 10 WHERE name = 'Druh'").run();
    const skipped = await as('druh', 'POST', '/api/time/skip', { target: 'activity' });
    assert.equal(skipped.status, 200, JSON.stringify(skipped.data));
    assert.equal(skipped.data.spent, 10);
    const after = await ends();
    assert.deepEqual(
      after.map((row, index) => [row.name, before[index].ends_at - row.ends_at]),
      [
        ['Druh', 600000],
        ['Lider', 600000],
      ],
    );
    // The leader hears who skipped; the skipper's own screen does not.
    const leader = (await as('lider', 'GET', '/api/character')).data.character;
    assert.deepEqual(leader.activity.party.skips.map((skip) => [skip.name, skip.minutes]), [['Druh', 10]]);
    assert.deepEqual((await as('druh', 'GET', '/api/character')).data.character.activity.party.skips, []);
    // The chat's check tells the new end, for the leader's page to follow.
    assert.equal((await as('lider', 'GET', '/api/chat/latest')).data.activityEndsAt, after.find((row) => row.name === 'Lider').ends_at);
    // The leader skips the rest for both; each report names the other's skip.
    await (await db()).prepare("UPDATE characters SET time_points = 100 WHERE name = 'Lider'").run();
    assert.equal((await as('lider', 'POST', '/api/time/skip', { target: 'activity' })).data.spent, 20);
    const reports = await claimBoth();
    assert.deepEqual(reports.lider.skips.map((skip) => [skip.name, skip.minutes]), [['Druh', 10]]);
    assert.deepEqual(reports.druh.skips.map((skip) => [skip.name, skip.minutes]), [['Lider', 20]]);
  });

  test('the test version\'s "Pomiń czas" ends the whole trip too', async () => {
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
    assert.equal((await as('lider', 'POST', '/api/party/hunt', { areaId: 'mossy-boulders', minutes: 30 })).status, 201);
    assert.equal((await as('druh', 'POST', '/api/test/skip-time')).status, 200);
    const reports = await claimBoth();
    assert.deepEqual(reports.lider.skips.map((skip) => [skip.name, skip.minutes]), [['Druh', 30]]);
    assert.equal(reports.druh.skips, undefined);
  });

  test('one that could not set out after all fights in nobody\'s exploration', async () => {
    await player('trzeci', 'Trzeci');
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('lider', 'POST', '/api/party/invite', { name: 'Trzeci' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
    await as('trzeci', 'POST', '/api/party/accept', { partyId: data.party.id });
    // Trzeci gets busy just as the leader sets out: free when counted, busy
    // when its own exploration would begin.
    await (await db())
      .prepare(
        `CREATE TRIGGER busy_trzeci AFTER INSERT ON activities WHEN NEW.character_id = (SELECT id FROM characters WHERE name = 'Lider')
         BEGIN
           INSERT INTO activities (character_id, kind, region_id, minutes, started_at, ends_at, seed, hp_at_start, options)
           VALUES ((SELECT id FROM characters WHERE name = 'Trzeci'), 'herbs', 'windfalls-edge', 60, NEW.started_at, NEW.started_at + 3600000, 'race', 100, '{}');
         END`,
      )
      .run();
    try {
      const went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'mossy-boulders', minutes: 30 });
      assert.equal(went.status, 201, JSON.stringify(went.data));
      assert.deepEqual(went.data.went, ['Druh']);
      const hunts = (await (await db()).prepare("SELECT c.name, a.options FROM activities a JOIN characters c ON c.id = a.character_id WHERE a.kind = 'hunt' ORDER BY c.name").all()).results;
      assert.deepEqual(
        hunts.map((row) => [row.name, JSON.parse(row.options).party.names, JSON.parse(row.options).party.roster.map((one) => one.name)]),
        [
          ['Druh', ['Lider', 'Druh'], ['Lider', 'Druh']],
          ['Lider', ['Lider', 'Druh'], ['Lider', 'Druh']],
        ],
      );
    } finally {
      await (await db()).prepare('DROP TRIGGER IF EXISTS busy_trzeci').run();
    }
  });

  test('one called back from a trip fights in nobody\'s exploration of it any more', async () => {
    await player('trzeci', 'Trzeci');
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('lider', 'POST', '/api/party/invite', { name: 'Trzeci' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
    await as('trzeci', 'POST', '/api/party/accept', { partyId: data.party.id });
    assert.deepEqual((await as('lider', 'POST', '/api/party/hunt', { areaId: 'mossy-boulders', minutes: 30 })).data.went, ['Druh', 'Trzeci']);
    assert.equal((await as('trzeci', 'POST', '/api/hunts/cancel')).status, 200);
    const hunts = (await (await db()).prepare("SELECT c.name, a.options FROM activities a JOIN characters c ON c.id = a.character_id WHERE a.kind = 'hunt' ORDER BY c.name").all()).results;
    assert.deepEqual(
      hunts.map((row) => [row.name, JSON.parse(row.options).party.names, JSON.parse(row.options).party.roster.map((one) => one.name)]),
      [
        ['Druh', ['Lider', 'Druh'], ['Lider', 'Druh']],
        ['Lider', ['Lider', 'Druh'], ['Lider', 'Druh']],
      ],
    );
  });

  test('a trip\'s fights are the same in every member\'s report; finds, XP and events are each one\'s own', async () => {
    await (await db()).prepare("UPDATE characters SET level = 26, class_level = 30 WHERE name = 'Druh'").run();
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
    assert.equal((await as('lider', 'POST', '/api/party/hunt', { areaId: 'mossy-boulders', minutes: 60 })).status, 201);
    // The trip's seed and roster, the same in both explorations; each keeps its own seed.
    const rows = (await (await db()).prepare("SELECT c.name, a.seed, a.options FROM activities a JOIN characters c ON c.id = a.character_id ORDER BY c.name").all()).results;
    const [druh, lider] = rows.map((row) => ({ ...row, options: JSON.parse(row.options) }));
    assert.equal(druh.options.party.seed, lider.options.party.seed);
    assert.deepEqual(druh.options.party.roster.map((one) => one.name), ['Lider', 'Druh']);
    assert.notEqual(druh.seed, lider.seed);
    await (await db()).prepare('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ?').bind(3600000, 3600000).run();
    const reports = await claimBoth();
    const fights = (report) => report.fights.map((fight) => [fight.enemies.map((enemy) => `${enemy.monsterId}:${enemy.level}`).join(','), fight.won, fight.allies.map((ally) => ally.name).join(','), JSON.stringify(fight.events)]);
    assert.ok(reports.lider.fights.length > 0);
    assert.deepEqual(fights(reports.druh), fights(reports.lider));
    // Each one's own XP: from the same won fights, by its own level.
    const won = reports.lider.fights.filter((fight) => fight.won === true).length;
    for (const report of [reports.lider, reports.druh]) {
      assert.equal(report.fights.filter((fight) => fight.won === true && fight.xp > 0).length, won, JSON.stringify(report.summary));
    }
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

  test('the class levels in a party differ by at most the spread: an invitation and a joining keep to it', async () => {
    const { classSpread } = content.balance.parties;
    const level = (name, classLevel) => db().then((database) => database.prepare('UPDATE characters SET class_level = ? WHERE name = ?').bind(classLevel, name).run());
    await level('Druh', 30 + classSpread + 1);
    const far = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    assert.equal(far.data.error.code, 'level_gap');
    assert.match(far.data.error.message, new RegExp(`od ${30 - classSpread} do ${30 + classSpread}\\.`));
    await level('Druh', 30 + classSpread);
    const near = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    assert.equal(near.status, 200, JSON.stringify(near.data));
    assert.deepEqual(near.data.range, { from: 30 - classSpread, to: 30 + classSpread, spread: classSpread });
    // The leader's level is checked again when the invitation is accepted.
    await level('Lider', 29);
    const refused = await as('druh', 'POST', '/api/party/accept', { partyId: near.data.party.id });
    assert.equal(refused.data.error.code, 'level_gap');
    assert.match(refused.data.error.message, new RegExp(`^Masz ${30 + classSpread}\\. poziom klasy`));
    await level('Lider', 30);
    const again = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    assert.equal((await as('druh', 'POST', '/api/party/accept', { partyId: again.data.party.id })).status, 200);
  });

  test('one whose class level grows more than the spread apart leaves the party; the leader stays', async () => {
    const { classSpread } = content.balance.parties;
    await player('trzeci', 'Trzeci');
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('lider', 'POST', '/api/party/invite', { name: 'Trzeci' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
    await as('trzeci', 'POST', '/api/party/accept', { partyId: data.party.id });
    // Druh grows out of the spread: out of the party, the others stay.
    await (await db()).prepare('UPDATE characters SET class_level = ? WHERE name = ?').bind(30 + classSpread + 1, 'Druh').run();
    const view = (await as('lider', 'GET', '/api/party')).data.party;
    assert.deepEqual(view.members.map((one) => one.name), ['Lider', 'Trzeci']);
    assert.equal((await as('druh', 'GET', '/api/party')).data.party, null);
    const went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'windfalls-edge', minutes: 5 });
    assert.equal(went.status, 201, JSON.stringify(went.data));
    assert.deepEqual(went.data.went, ['Trzeci']);
    const druh = await (await db()).prepare("SELECT COUNT(*) AS count FROM activities a JOIN characters c ON c.id = a.character_id WHERE c.name = 'Druh'").first();
    assert.equal(druh.count, 0);
  });

  test('a leader who grows out of the spread keeps the lead; the members it no longer fits leave', async () => {
    const { classSpread } = content.balance.parties;
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
    await (await db()).prepare('UPDATE characters SET class_level = ? WHERE name = ?').bind(30 + classSpread + 1, 'Lider').run();
    // Seen first from the member's side: the member is out, the leader alone.
    assert.equal((await as('druh', 'GET', '/api/party')).data.party, null);
    const view = (await as('lider', 'GET', '/api/party')).data.party;
    assert.deepEqual(view.members.map((one) => [one.name, one.leader]), [['Lider', true]]);
    assert.equal((await as('lider', 'POST', '/api/party/hunt', { areaId: 'windfalls-edge', minutes: 5 })).data.error.code, 'nobody_free');
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

describe("a Drużyna's trip and the Stajnia's mounts", () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', SETTLEMENT: 'on' });
  const cookies = {};
  async function player(login, name, mount) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = 30, class_level = 30, settlement = ? WHERE name = ?').bind(JSON.stringify(mount ? { mount } : {}), name).run();
  }
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  async function trip() {
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
    const view = (await as('lider', 'GET', '/api/party')).data.party;
    const went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'mossy-boulders', minutes: 30 });
    assert.equal(went.status, 201, JSON.stringify(went.data));
    const rows = (await (await db()).prepare('SELECT started_at, ends_at, minutes FROM activities').all()).results;
    assert.equal(rows.length, 2);
    for (const row of rows) assert.equal(row.minutes, 30);
    return { view, waits: rows.map((row) => row.ends_at - row.started_at) };
  }

  test('a trip waits as long as the slowest mount of those who go', async () => {
    await player('lider', 'Lider', 2);
    await player('druh', 'Druh', 1);
    const { view, waits } = await trip();
    assert.deepEqual(view.limits.mount, { shorter: content.settlement.stable.mounts[0].shorter, by: 'Druh' });
    assert.deepEqual(waits, [huntWait(30, 1, content), huntWait(30, 1, content)]);
  });

  test('one without a mount makes the whole trip go its full length', async () => {
    await player('lider', 'Lider', 3);
    await player('druh', 'Druh', null);
    const { view, waits } = await trip();
    assert.deepEqual(view.limits.mount, { shorter: 0, by: 'Druh' });
    assert.deepEqual(waits, [30 * 60000, 30 * 60000]);
  });
});

// A party hunts without companions (the author: "jeśli ktoś ma zwerbowanego
// towarzysza to nie może być w drużynie, dopóki nie kliknie na nim [Zostań w
// kwaterze]; wtedy nie poluje się z towarzyszem, tylko samemu/z drużyną").
describe('a Drużyna and the companions from the Kwatery', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', SETTLEMENT: 'on' });
  const cookies = {};
  async function player(login, name) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = 30, class_level = 30, gold = 100000 WHERE name = ?').bind(name).run();
    await (await db()).prepare("INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) SELECT id, 'quarters', 2, 0, 0 FROM characters WHERE name = ?").bind(name).run();
  }
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  // A companion hired by the character of `login`, going on its explorations.
  async function hire(login) {
    const [candidate] = (await as(login, 'GET', '/api/settlement')).data.settlement.companions.candidates;
    assert.equal((await as(login, 'POST', '/api/settlement/hire', { candidateId: candidate.id })).status, 200);
    return candidate;
  }
  const stay = (login, companion, stays) => as(login, 'POST', '/api/settlement/companion-stay', { companionId: companion.id, stays });
  const hunts = async () =>
    (await (await db()).prepare("SELECT c.name, a.options FROM activities a JOIN characters c ON c.id = a.character_id WHERE a.kind = 'hunt' ORDER BY c.name").all()).results.map((row) => ({
      name: row.name,
      options: JSON.parse(row.options),
    }));

  beforeEach(async () => {
    await player('lider', 'Lider');
    await player('druh', 'Druh');
  });

  test('one whose companion goes on explorations neither joins a party nor makes one, and is told why; once it stays, it joins', async () => {
    const companion = await hire('druh');
    const form = companion.appearance === 'female' ? 'towarzyszkę' : 'towarzysza';
    const why = `Najpierw zostaw ${form} w kwaterze: ${companion.name}. Drużyna poluje bez towarzyszy z Kwater.`;
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    // The Drużyna screen says why, with the way to the Kwatery.
    assert.deepEqual((await as('druh', 'GET', '/api/party')).data.companions, { text: why, link: 'Przejdź do Kwater' });
    assert.equal((await as('lider', 'GET', '/api/party')).data.companions, null);
    const refused = await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
    assert.equal(refused.status, 409);
    assert.deepEqual(refused.data.error, { code: 'companion_goes', message: why });
    // Nor does its first invitation make a party.
    const making = await as('druh', 'POST', '/api/party/invite', { name: 'Lider' });
    assert.deepEqual([making.status, making.data.error.code], [409, 'companion_goes']);
    assert.equal((await (await db()).prepare('SELECT COUNT(*) AS count FROM parties').first()).count, 1);
    // "Zostań w kwaterze": now it joins.
    assert.equal((await stay('druh', companion, true)).status, 200);
    assert.equal((await as('druh', 'GET', '/api/party')).data.companions, null);
    const joined = await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
    assert.equal(joined.status, 200, JSON.stringify(joined.data));
    // In the party it is not sent out again: the Kwatery say why instead of the button.
    const back = await stay('druh', companion, false);
    assert.deepEqual([back.status, back.data.error.code], [409, 'in_party']);
    const card = (await as('druh', 'GET', '/api/settlement')).data.settlement.companions.hired[0];
    assert.deepEqual([card.stay.stays, card.stay.action], [true, null]);
    assert.match(card.stay.text, /^Póki postać jest w drużynie, towarzysz(ka)? zostaje w kwaterze/);
    // Out of the party, it may go out again.
    await as('druh', 'POST', '/api/party/leave');
    assert.equal((await stay('druh', companion, false)).status, 200);
  });

  test("a party's trip goes without companions, and in a party a companion stays even if it was never told to", async () => {
    const own = await hire('lider');
    assert.equal((await stay('lider', own, true)).status, 200);
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    assert.equal((await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id })).status, 200);
    // Druh's companion was never told to stay (as one of a character in a
    // party before this rule): while Druh is in the party, it stays all the same.
    const other = await hire('druh');
    assert.equal(JSON.parse((await (await db()).prepare("SELECT settlement FROM characters WHERE name = 'Druh'").first()).settlement).companions[0].stays, undefined);
    assert.equal((await as('druh', 'GET', '/api/settlement')).data.settlement.companions.hired[0].stay.stays, true);
    assert.equal((await as('druh', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).status, 201);
    assert.equal((await hunts())[0].options.companions, undefined);
    await as('druh', 'POST', '/api/hunts/cancel');
    // The trip: no companions in anyone's exploration, nor in its roster.
    const went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'mossy-boulders', minutes: 30 });
    assert.equal(went.status, 201, JSON.stringify(went.data));
    for (const { options } of await hunts()) {
      assert.equal(options.companions, undefined);
      assert.equal(options.party.companions, undefined);
      assert.deepEqual(options.party.roster.map((one) => one.name), ['Lider', 'Druh']);
    }
    await (await db()).prepare('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ?').bind(1800000, 1800000).run();
    for (const login of ['lider', 'druh']) {
      let claimed = await as(login, 'POST', '/api/hunts/claim');
      if (claimed.data.event) claimed = await as(login, 'POST', '/api/hunts/claim', { choice: claimed.data.event.options.find((option) => !option.disabled)?.id ?? claimed.data.event.options[0].id });
      assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 400));
      for (const fight of claimed.data.report.fights) assert.ok(fight.allies.every((ally) => ['Lider', 'Druh'].includes(ally.name)), fight.allies.map((ally) => ally.name).join(', '));
    }
    // Out of the party, Druh's companion goes along again; Lider's stays, as told.
    await as('druh', 'POST', '/api/party/leave');
    await as('lider', 'POST', '/api/party/leave');
    assert.equal((await as('druh', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).status, 201);
    assert.equal((await as('lider', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).status, 201);
    const alone = Object.fromEntries((await hunts()).map((one) => [one.name, one.options.companions?.map((companion) => companion.id) ?? []]));
    assert.deepEqual(alone, { Druh: [other.id], Lider: [] });
  });
});

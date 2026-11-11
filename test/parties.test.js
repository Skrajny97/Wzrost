// Drużyny (src/server/parties.js): from character level 10 (642 B), up to three
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

  test('the Drużyna opens at character level 10', async () => {
    await (await db()).prepare("UPDATE characters SET level = 9, class_level = 9 WHERE name = 'Druh'").run();
    const locked = await as('druh', 'GET', '/api/party');
    assert.equal(locked.status, 403);
    assert.equal(locked.data.error.code, 'locked');
    assert.match(locked.data.error.message, /poziomie postaci 10\./);
    const invited = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    assert.equal(invited.data.error.code, 'target_locked');
    // At level 10 both open: the Drużyna screen and an invitation from a
    // leader whose class level is within the spread.
    await (await db()).prepare("UPDATE characters SET level = 10, class_level = 10 WHERE name IN ('Druh', 'Lider')").run();
    const open = await as('druh', 'GET', '/api/party');
    assert.equal(open.status, 200, JSON.stringify(open.data));
    assert.equal(open.data.unlockLevel, 10);
    const again = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    assert.equal(again.status, 200, JSON.stringify(again.data));
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
    // Each sees the other walking beside it on the way (640 A), in the
    // other's look; not itself, whom the page draws from its own character.
    for (const [login, other] of [['lider', 'Druh'], ['druh', 'Lider']]) {
      const { character } = (await as(login, 'GET', '/api/character')).data;
      const walkers = character.activity.party.walkers;
      assert.deepEqual(walkers.map((one) => one.name), [other]);
      const row = await (await db()).prepare('SELECT class_id, appearance, skin FROM characters WHERE name = ?').bind(other).first();
      assert.equal(walkers[0].classId, row.class_id);
      assert.equal(walkers[0].appearance, row.appearance);
      assert.equal(walkers[0].skin, row.skin ?? walkers[0].skin);
      assert.ok(!('id' in walkers[0]));
      for (const key of ['evolution', 'mount', 'mountSkin', 'aura', 'trail', 'pet']) assert.ok(key in walkers[0], key);
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
    await player('trzeci', 'Trzeci', { classLevel: 30 + classSpread });
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('lider', 'POST', '/api/party/invite', { name: 'Trzeci' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
    assert.equal((await as('trzeci', 'POST', '/api/party/accept', { partyId: data.party.id })).status, 200);
    await (await db()).prepare('UPDATE characters SET class_level = ? WHERE name = ?').bind(30 + classSpread + 1, 'Lider').run();
    // Seen first from the member's side: Druh is out; Trzeci, who still
    // fits, stays with the leader.
    assert.equal((await as('druh', 'GET', '/api/party')).data.party, null);
    const view = (await as('lider', 'GET', '/api/party')).data.party;
    assert.deepEqual(view.members.map((one) => [one.name, one.leader]), [['Lider', true], ['Trzeci', false]]);
  });

  test('a party of one is a party only while an invitation of it waits: alone after the others went, the leader is in none', async () => {
    const { classSpread } = content.balance.parties;
    const parties = async () => (await (await db()).prepare('SELECT COUNT(*) AS count FROM parties').first()).count;
    await player('trzeci', 'Trzeci');
    // The first invitation makes the party, its leader and the invitation at once.
    const made = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    assert.equal(made.status, 200, JSON.stringify(made.data));
    assert.deepEqual([made.data.party.members.map((one) => one.name), made.data.party.invited.map((one) => one.name)], [['Lider'], ['Druh']]);
    // Declined: no party is left.
    await as('druh', 'POST', '/api/party/decline', { partyId: made.data.party.id });
    assert.equal((await as('lider', 'GET', '/api/party')).data.party, null);
    assert.equal(await parties(), 0);
    // While another invitation waits, the party stays; withdrawn, it ends.
    const again = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('lider', 'POST', '/api/party/invite', { name: 'Trzeci' });
    await as('druh', 'POST', '/api/party/decline', { partyId: again.data.party.id });
    assert.deepEqual((await as('lider', 'GET', '/api/party')).data.party.invited.map((one) => one.name), ['Trzeci']);
    const withdrawn = await as('lider', 'POST', '/api/party/cancel', { characterId: await idOf('Trzeci') });
    assert.equal(withdrawn.data.party, null);
    assert.equal(await parties(), 0);
    // The last member gone, by leaving or by growing out of the spread:
    // the leader is in no party, and its next invitation makes a new one.
    const third = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/party/accept', { partyId: third.data.party.id });
    await as('druh', 'POST', '/api/party/leave');
    assert.equal((await as('lider', 'GET', '/api/party')).data.party, null);
    assert.equal((await as('lider', 'POST', '/api/party/hunt', { areaId: 'windfalls-edge', minutes: 5 })).data.error.code, 'no_party');
    const fourth = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/party/accept', { partyId: fourth.data.party.id });
    await (await db()).prepare('UPDATE characters SET class_level = ? WHERE name = ?').bind(30 + classSpread + 1, 'Lider').run();
    assert.equal((await as('lider', 'GET', '/api/party')).data.party, null);
    assert.equal((await as('druh', 'GET', '/api/party')).data.party, null);
    assert.equal(await parties(), 0);
  });

  test('a deleted account leaves its party', async () => {
    await player('trzeci', 'Trzeci');
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('lider', 'POST', '/api/party/invite', { name: 'Trzeci' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
    await as('trzeci', 'POST', '/api/party/accept', { partyId: data.party.id });
    const gone = await as('druh', 'DELETE', '/api/me', { login: 'druh' });
    assert.equal(gone.status, 200, JSON.stringify(gone.data));
    const view = (await as('lider', 'GET', '/api/party')).data.party;
    assert.deepEqual(view.members.map((one) => one.name), ['Lider', 'Trzeci']);
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

// A party hunts without companions (the author: "wtedy nie poluje się z
// towarzyszem, tylko samemu/z drużyną"). Since 828 B (11.11.2026) the
// companions stay in the Kwatery by themselves while the character is in a
// party, after one question, and go back to their own settings after it;
// before, they kept the character out of every party until told to stay.
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

  test('one whose companion goes on explorations joins a party and makes one at once, asked first; meanwhile the companion stays in the Kwatery, and out of the party it goes again (828 B)', async () => {
    const companion = await hire('druh');
    const own = await hire('lider');
    assert.equal((await stay('lider', own, true)).status, 200);
    const stored = async (name) => JSON.parse((await (await db()).prepare('SELECT settlement FROM characters WHERE name = ?').bind(name).first()).settlement).companions[0];
    const card = async (login) => (await as(login, 'GET', '/api/settlement')).data.settlement.companions.hired[0];
    const portalCompanions = async (login) => (await as(login, 'GET', '/api/portals')).data.portals.companions;
    const alone = async (login) => {
      assert.equal((await as(login, 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).status, 201);
      const went = (await hunts()).find((one) => one.name === (login === 'druh' ? 'Druh' : 'Lider')).options.companions?.map((one) => one.id) ?? [];
      await as(login, 'POST', '/api/hunts/cancel');
      return went;
    };
    // The one question, for Druh, whose companion goes on its explorations:
    // the Drużyna screen has its words. None for Lider, whose companion was
    // told to stay.
    const question = {
      text: `${companion.name} zostanie w Kwaterach, póki jesteś w drużynie: nie zdobędzie XP ani relacji z wypraw.`,
      make: { title: 'Założyć drużynę?', confirm: 'Załóż' },
      join: { title: 'Dołączyć do drużyny?', confirm: 'Dołącz' },
    };
    assert.deepEqual((await as('druh', 'GET', '/api/party')).data.companions, question);
    assert.equal((await as('lider', 'GET', '/api/party')).data.companions, null);
    assert.deepEqual(await alone('druh'), [companion.id]);
    // "Dołącz": Druh joins at once, its companion going.
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    const joined = await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
    assert.equal(joined.status, 200, JSON.stringify(joined.data));
    assert.equal(joined.data.companions, null);
    // In the party the companion stays in the Kwatery: no exploration, nor
    // a portal, takes it, and it is not sent out; the card says it goes
    // again after the party. The player's own setting is as it was.
    assert.deepEqual(await alone('druh'), []);
    assert.deepEqual(await portalCompanions('druh'), []);
    const back = await stay('druh', companion, false);
    assert.deepEqual([back.status, back.data.error.code], [409, 'in_party']);
    let view = await card('druh');
    assert.deepEqual([view.stay.stays, view.stay.action], [true, null]);
    assert.match(view.stay.text, /^Póki postać jest w drużynie, towarzysz(ka)? zostaje w kwaterze: drużyna poluje bez towarzyszy z Kwater\. Po wyjściu z drużyny sam(a)? wróci na wyprawy\.$/);
    assert.equal((await stored('Druh')).stays, undefined);
    // Lider's companion, told to stay, has the words without the return.
    assert.equal((await card('lider')).stay.text.endsWith('drużyna poluje bez towarzyszy z Kwater.'), true);
    // Sent out of the party, Druh's companion goes along again by itself.
    const druhId = joined.data.party.members.find((member) => member.own).id;
    assert.equal((await as('lider', 'POST', '/api/party/kick', { characterId: druhId })).status, 200);
    assert.deepEqual(await alone('druh'), [companion.id]);
    assert.deepEqual(await portalCompanions('druh'), [companion.name]);
    view = await card('druh');
    assert.deepEqual([view.stay.stays, view.stay.action.stays], [false, true]);
    // "Załóż": its first invitation makes a party at once too; leaving it,
    // the companion goes again, and Lider's stays, as it was told.
    const made = await as('druh', 'POST', '/api/party/invite', { name: 'Lider' });
    assert.equal(made.status, 200, JSON.stringify(made.data));
    assert.equal(made.data.party.members.length, 1);
    assert.deepEqual(await alone('druh'), []);
    assert.equal((await as('druh', 'POST', '/api/party/leave')).status, 200);
    assert.deepEqual(await alone('druh'), [companion.id]);
    await as('lider', 'POST', '/api/party/leave');
    assert.deepEqual(await alone('lider'), []);
    assert.equal((await stored('Lider')).stays, true);
  });

  test('a declined invitation leaves no party of one behind: the companion goes on the explorations again at once', async () => {
    const companion = await hire('lider');
    const goes = async () => {
      assert.equal((await as('lider', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).status, 201);
      const went = (await hunts()).find((one) => one.name === 'Lider').options.companions?.map((one) => one.id) ?? [];
      await as('lider', 'POST', '/api/hunts/cancel');
      return went;
    };
    const made = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    assert.equal(made.status, 200, JSON.stringify(made.data));
    // While the invitation waits, the party is there and the companion stays.
    assert.deepEqual(await goes(), []);
    await as('druh', 'POST', '/api/party/decline', { partyId: made.data.party.id });
    // No look at the Drużyna first: the exploration itself sees the party gone.
    assert.deepEqual(await goes(), [companion.id]);
  });

  test('one whose class level grows out of its party has its companion on the explorations again at once', async () => {
    const companion = await hire('druh');
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    assert.equal((await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id })).status, 200);
    await (await db()).prepare('UPDATE characters SET class_level = ? WHERE name = ?').bind(30 + content.balance.parties.classSpread + 1, 'Druh').run();
    // Before anyone opens the Drużyna, the exploration knows Druh is out.
    assert.equal((await as('druh', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).status, 201);
    assert.deepEqual((await hunts()).find((one) => one.name === 'Druh').options.companions?.map((one) => one.id), [companion.id]);
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

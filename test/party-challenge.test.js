// The Trudna and the Piekielna wyprawa with a Drużyna (the author,
// 19.11.2026: „Trudne i Piekielne wyprawy zrób tak by można je bylo robić z
// drużyną”). The leader ticks one with "Z drużyną" and the whole trip goes
// so (src/server/parties.js, partyHunt): the trip keeps the mode with its
// crew, so every member's report is fought with the same creatures, the
// mode's times as strong, on top of the class level 250's and the party's
// own (myth-game.test.js), and each member gets the mode's XP, gold and, on
// a Piekielna, chests and materials on its own loot, halved from its own
// class level 250 as on every exploration. A member going who has not
// opened the mode keeps the party home, named. Alone, the boxes work as
// ever (challenge.test.js). The names are synthetic.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { simulateHunt } from '../src/engine/index.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const challenge = content.balance.challenge;
const { mythGame, perPlayer } = content.balance.monsters;
const late = content.balance.rewards.lateRewards;
// Each mode: its name, the engine's `hard` and its numbers.
const MODES = [
  ['Trudna', true, challenge.hard],
  ['Piekielna', 'hell', challenge.hell],
];
const near = (actual, expected, within) => assert.ok(Math.abs(actual - expected) <= within, `${actual} vs ${expected}`);

// A player of a trip's roster as parties.js keeps it: a typical character
// of its class and level (tools/simulate.mjs) at full HP.
function member(id, classId, level, extra = {}) {
  const { character, equipped } = typicalCharacter(classId, level, content);
  return { id, name: id, character: { ...character, ...extra }, equipped, hp: null, windows: {}, trophies: {} };
}

// `self`'s exploration of a trip of `roster`, as hunts.js claims it: the
// trip's seed for the fights, its own for the loot.
function tripOf(roster, self, hard, { seed = 'wyprawa', lootSeed = `łup:${self}`, areaId = 'mossy-boulders', minutes = 60, data = content } = {}) {
  const one = roster.find((each) => each.id === self);
  return simulateHunt({ character: one.character, equipped: one.equipped, hp: one.hp, name: one.name, areaId, minutes, seed, lootSeed, roster, self, hard }, data);
}

// Every fight's creatures: who, of which level and with how much HP.
const foes = (fights) => fights.map((fight) => fight.map((enemy) => `${enemy.monsterId}:${enemy.level}:${enemy.maxHp}`).join(','));
// The first fight's creatures' HP, the plain trip's to the mode's.
function hpRatios(plain, harder) {
  assert.deepEqual(
    harder.map((enemy) => [enemy.monsterId, enemy.level]),
    plain.map((enemy) => [enemy.monsterId, enemy.level]),
  );
  return harder.map((enemy, index) => enemy.maxHp / plain[index].maxHp);
}

describe("a Drużyna's trip in the Trudna or the Piekielna wyprawa, in the engine", () => {
  const party = [member('lider', 'warrior', 40), member('druh', 'cleric', 40), member('trzeci', 'mage', 40)];
  const ids = party.map((one) => one.id);

  test("every member fights the same creatures, the mode's times as strong as on a plain trip", () => {
    for (const [, hard, numbers] of MODES) {
      const hunts = ids.map((id) => tripOf(party, id, hard));
      const plain = tripOf(party, 'lider', false);
      for (const hunt of hunts) {
        assert.ok(hunt.fights.length > 0);
        assert.deepEqual(foes(hunt.fights.map((fight) => fight.enemiesView)), foes(hunts[0].fights.map((fight) => fight.enemiesView)));
        assert.equal(hunt[hard === 'hell' ? 'hell' : 'hard'], true);
        for (const ratio of hpRatios(plain.fights[0].enemiesView, hunt.fights[0].enemiesView)) near(ratio, numbers.hp, 0.02);
      }
    }
  });

  test("on top of the class level 250's threefold creatures and the party's own 25% a player", () => {
    // The same trip with a member of class level 255, the highest of them
    // (fightingClassLevel), and with all below 250.
    const high = party.map((one, index) => ({ ...one, character: { ...one.character, classLevel: index === 1 ? 255 : 246 } }));
    const low = party.map((one) => ({ ...one, character: { ...one.character, classLevel: 246 } }));
    const below = tripOf(low, 'druh', false).fights[0].enemiesView;
    const myth = (1 + mythGame.hp) * (1 + 2 * perPlayer.hp);
    for (const [, hard, numbers] of MODES) {
      const plain = tripOf(high, 'druh', false).fights[0].enemiesView;
      const harder = tripOf(high, 'druh', hard).fights[0].enemiesView;
      for (const ratio of hpRatios(plain, harder)) near(ratio, numbers.hp, 0.02);
      for (const ratio of hpRatios(below, harder)) near(ratio, numbers.hp * myth, 0.05);
    }
  });

  test("each member's XP and gold get the mode's bonus, on its own loot", () => {
    for (const [, hard, numbers] of MODES) {
      for (const id of ids) {
        const plain = tripOf(party, id, false);
        const harder = tripOf(party, id, hard);
        // The first fight comes before any find, so its gold is drawn alike.
        assert.equal(plain.entries[0].type, 'fight');
        assert.equal(plain.fights[0].won, true);
        assert.equal(harder.fights[0].won, true);
        assert.ok(plain.fights[0].xp >= 100 && plain.fights[0].gold >= 20, `${id}: ${plain.fights[0].xp} XP, ${plain.fights[0].gold} gold`);
        near(harder.fights[0].xp, plain.fights[0].xp * (1 + numbers.xp), 1.5);
        near(harder.fights[0].gold, plain.fights[0].gold * (1 + numbers.gold), 1.5);
      }
    }
    // Each from its own loot: the members' gold for one fight is not one.
    const golds = ids.map((id) => tripOf(party, id, 'hell').fights[0].gold);
    assert.ok(new Set(golds).size > 1, golds.join(', '));
  });

  test("the Piekielna's chests among the finds and its materials, half as many again for every member", () => {
    // Its creatures as strong as a plain trip's, so the fights go the same
    // and only each member's loot tells the two apart.
    const even = { ...content, balance: { ...content.balance, challenge: { ...challenge, hell: { ...challenge.hell, damage: 1, hp: 1 } } } };
    const pair = [member('lider', 'warrior', 100), member('druh', 'cleric', 100)];
    const loot = (self, hard) => {
      const found = { fights: 0, finds: 0, chests: 0, pieces: 0 };
      for (let index = 0; index < 200; index += 1) {
        const hunt = tripOf(pair, self, hard, { seed: `łupy:${index}`, lootSeed: `łupy:${self}:${index}`, minutes: 240, data: even });
        const finds = hunt.entries.filter((entry) => entry.type === 'find');
        found.fights += hunt.fights.length;
        found.finds += finds.length;
        found.chests += finds.filter((entry) => entry.item !== undefined).length;
        found.pieces += Object.values(hunt.materials).reduce((sum, pieces) => sum + pieces, 0);
      }
      return found;
    };
    for (const self of ['lider', 'druh']) {
      const plain = loot(self, false);
      const hellish = loot(self, 'hell');
      assert.equal(hellish.fights, plain.fights);
      assert.equal(hellish.finds, plain.finds);
      for (const kind of ['chests', 'pieces']) {
        const ratio = hellish[kind] / plain[kind];
        assert.ok(Math.abs(ratio - (1 + challenge.hell.drop)) < 0.15, `${self}, ${kind}: ${plain[kind]} → ${hellish[kind]}`);
      }
    }
  });

  test('from class level 250 a member gets its part of the gold, by its own class level, with the bonus on top', () => {
    // One loot seed for both, so their gold differs only by their class level.
    const pair = [member('lider', 'warrior', 60, { classLevel: late.fromClassLevel + 5 }), member('druh', 'cleric', 60, { classLevel: late.fromClassLevel - 4 })];
    const fight = (self, hard) => tripOf(pair, self, hard, { lootSeed: 'wspólny' }).fights[0];
    for (const [, hard, numbers] of MODES) {
      for (const self of ['lider', 'druh']) {
        const [plain, harder] = [fight(self, false), fight(self, hard)];
        assert.equal(harder.won, true);
        assert.ok(plain.gold >= 10, `${plain.gold}`);
        near(harder.gold, plain.gold * (1 + numbers.gold), 1.5);
      }
      near(fight('lider', hard).gold, fight('druh', hard).gold * late.factor, 1);
      // XP whole for both.
      assert.equal(fight('lider', hard).xp, fight('druh', hard).xp);
    }
  });
});

describe('the Trudna and the Piekielna wyprawa of a Drużyna, through the API', () => {
  const { call, db, signUp } = useServer();
  const cookies = {};
  async function player(login, name, classId) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId, appearance: 'female' } });
    await (await db()).prepare(`UPDATE characters SET level = 30, class_level = 30, points = '{"strength":150,"vitality":140}' WHERE name = ?`).bind(name).run();
  }
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  // The explorations under way, with what each keeps.
  const hunts = async () =>
    (
      await (await db())
        .prepare("SELECT c.id, c.name, a.seed, a.region_id, a.minutes, a.options FROM activities a JOIN characters c ON c.id = a.character_id WHERE a.kind = 'hunt' ORDER BY c.name")
        .all()
    ).results.map((row) => ({ ...row, options: JSON.parse(row.options) }));
  // The reports of those away now, claimed once the trip of `minutes` is over.
  async function claimAll(minutes) {
    await (await db()).prepare('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ?').bind(minutes * 60000, minutes * 60000).run();
    const reports = {};
    for (const { name } of await hunts()) {
      const claimed = await as(name.toLowerCase(), 'POST', '/api/hunts/claim');
      assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
      reports[name] = claimed.data.report;
    }
    return reports;
  }
  // A member's exploration of the trip as kept, fought again in the engine
  // with the challenge `hard`, as hunts.js claims it (each one's very
  // first exploration): the same trip in the mode, or plain.
  function again({ id, seed, region_id: areaId, minutes, options }, hard) {
    const { roster, encounter } = options.party;
    const one = roster.find((each) => each.id === id);
    return simulateHunt(
      {
        character: one.character,
        equipped: one.equipped,
        hp: one.hp,
        name: one.name,
        areaId,
        minutes,
        seed: options.party.seed,
        lootSeed: seed,
        roster,
        self: id,
        first: true,
        avoidRare: encounter.avoidRare,
        seekRare: encounter.seekRare,
        rumor: encounter.rumor,
        tracked: encounter.tracked,
        unknown: encounter.unknown,
        met: encounter.met,
        hard,
      },
      content,
    );
  }
  const pay = (fights) => fights.map((fight) => [fight.won, fight.xp, fight.gold]);

  beforeEach(async () => {
    await player('lider', 'Lider', 'warrior');
    await player('druh', 'Druh', 'cleric');
    await player('trzeci', 'Trzeci', 'mage');
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('lider', 'POST', '/api/party/invite', { name: 'Trzeci' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
    await as('trzeci', 'POST', '/api/party/accept', { partyId: data.party.id });
  });

  for (const [name, hard, numbers] of MODES) {
    const key = hard === 'hell' ? 'hell' : 'hard';
    const other = hard === 'hell' ? 'hard' : 'hell';
    test(`with "Z drużyną" the ${name} wyprawa is the whole trip's: every member's exploration and report say so, and each is fought and paid in it`, async () => {
      // Both boxes sent: the Piekielna wins, as alone.
      const went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'raven-hollows', minutes: 60, hard: true, hell: hard === 'hell' });
      assert.equal(went.status, 201, JSON.stringify(went.data).slice(0, 300));
      assert.deepEqual(went.data.went, ['Druh', 'Trzeci']);
      // Kept by every member's exploration and by the trip's crew.
      const trip = await hunts();
      assert.deepEqual(
        trip.map((row) => row.name),
        ['Druh', 'Lider', 'Trzeci'],
      );
      for (const { name: who, options } of trip) {
        assert.equal(options[key], true, who);
        assert.equal(options[other], undefined, who);
        assert.equal(options.party[key], true, who);
        assert.equal(options.party[other], undefined, who);
        assert.deepEqual(options.party.roster.map((one) => one.name), ['Lider', 'Druh', 'Trzeci']);
      }
      // Each member's Walka says so while it goes.
      for (const login of ['lider', 'druh', 'trzeci']) {
        const { activity } = (await as(login, 'GET', '/api/character')).data.character;
        assert.equal(activity[key], true, login);
        assert.equal(activity[other], undefined, login);
        assert.ok(activity.party, login);
      }
      // The same trip, plain, for what the mode changed.
      const plain = Object.fromEntries(trip.map((row) => [row.name, again(row, false)]));
      const fought = Object.fromEntries(trip.map((row) => [row.name, again(row, hard)]));
      const reports = await claimAll(60);
      for (const [who, report] of Object.entries(reports)) {
        assert.equal(report[key], true, who);
        assert.equal(report[other], undefined, who);
        assert.deepEqual(report.party, ['Lider', 'Druh', 'Trzeci']);
        // The trip's fights, the same in every report, as the mode fights them.
        assert.deepEqual(foes(report.fights.map((fight) => fight.enemies)), foes(reports.Lider.fights.map((fight) => fight.enemies)), who);
        assert.deepEqual(foes(report.fights.map((fight) => fight.enemies)), foes(fought[who].fights.map((fight) => fight.enemiesView)), who);
        // Its creatures the mode's times as strong as the plain trip's.
        for (const ratio of hpRatios(plain[who].fights[0].enemiesView, report.fights[0].enemies)) near(ratio, numbers.hp, 0.03);
        // Its own XP and gold as the mode pays them, its first fight's XP
        // the mode's share more than on the plain trip.
        assert.deepEqual(pay(report.fights), pay(fought[who].fights), who);
        assert.equal(report.fights[0].won, true, who);
        near(report.fights[0].xp, plain[who].fights[0].xp * (1 + numbers.xp), 1.5);
      }
    });
  }

  test('a member who has not opened the mode keeps the whole party home, named; without the mode the party goes', async () => {
    await (await db()).prepare("UPDATE characters SET level = ? WHERE name = 'Druh'").bind(challenge.fromLevel - 1).run();
    for (const [key, code, words] of [
      ['hard', 'party_hard_locked', 'Trudnej'],
      ['hell', 'party_hell_locked', 'Piekielnej'],
    ]) {
      const refused = await as('lider', 'POST', '/api/party/hunt', { areaId: 'raven-hollows', minutes: 30, [key]: true });
      assert.equal(refused.status, 403, JSON.stringify(refused.data).slice(0, 300));
      assert.equal(refused.data.error.code, code);
      assert.equal(
        refused.data.error.message,
        `Druh nie ma jeszcze ${words} wyprawy: otworzy się na ${challenge.fromLevel}. poziomie postaci. Drużyna idzie na nią tylko wtedy, gdy może każdy z was.`,
      );
    }
    assert.deepEqual(await hunts(), []);
    const went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'raven-hollows', minutes: 30 });
    assert.equal(went.status, 201, JSON.stringify(went.data).slice(0, 300));
    assert.deepEqual(went.data.went, ['Druh', 'Trzeci']);
    for (const { options } of await hunts()) {
      for (const key of ['hard', 'hell']) {
        assert.equal(options[key], undefined);
        assert.equal(options.party[key], undefined);
      }
    }
  });

  test('without "Z drużyną" the leader goes alone in the mode, as before, and the party stays home', async () => {
    const alone = await as('lider', 'POST', '/api/hunts', { areaId: 'raven-hollows', minutes: 30, hell: true });
    assert.equal(alone.status, 201, JSON.stringify(alone.data).slice(0, 300));
    assert.equal(alone.data.character.activity.hell, true);
    assert.equal(alone.data.character.activity.party, undefined);
    const [only, ...more] = await hunts();
    assert.deepEqual(more, []);
    assert.equal(only.name, 'Lider');
    assert.equal(only.options.hell, true);
    assert.equal(only.options.party, undefined);
  });
});

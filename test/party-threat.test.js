// The threat of a Drużyna's trip with the whole party (gracz (poz. 95),
// 24.11.2026: „żeby system przeliczał ryzyko wyprawy dla drużyny razem z
// innymi graczami w drużynie”): the engine's sample fights and trips with
// the other players beside the character (src/engine/threat.js, `partners`),
// and the leader's threat of a place with "Z drużyną" (GET
// /api/hunts/options?party=1; src/server/parties.js: threatCrew). Before,
// it was the leader's alone (926 B).

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { THREAT_LEVELS, canUse, createRng, faintChances, generateItem, threatSamples } from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rng = createRng('party-threat');
const gear = (classId, level) =>
  content.slots
    .map(({ id: slot }) => content.bases.find((one) => one.slot === slot && !one.family && canUse(one.id, classId, content)))
    .filter(Boolean)
    .map((base) => generateItem({ baseId: base.id, level, rarityId: 'common' }, rng, content));

describe('the threat with the party (engine)', () => {
  const areaId = 'mossy-boulders';
  const level = 28;
  const character = newCharacter('warrior', { level, classLevel: level, points: { strength: 40, vitality: 40 } });
  const equipped = gear('warrior', level);
  const partners = [
    { character: newCharacter('mage', { level, classLevel: level, points: { intelligence: 60, vitality: 40 } }), equipped: gear('mage', level), name: 'Druh' },
    { character: newCharacter('archer', { level, classLevel: level, points: { agility: 60, vitality: 40 } }), equipped: gear('archer', level), name: 'Trzeci' },
  ];
  const chances = (samples) => faintChances({ character, equipped, hp: samples.maxHp, areaId }, content, samples);
  const alone = threatSamples({ character, equipped, areaId }, content);
  const party = threatSamples({ character, equipped, areaId, partners }, content);

  test('the others beside the character make a trip safer than the character alone, and go on its trips', () => {
    const solo = chances(alone);
    const together = chances(party);
    assert.ok(solo[60] > 0.2, `alone: ${solo[60]}`);
    assert.ok(together[60] < solo[60] / 4, `together: ${together[60]}, alone: ${solo[60]}`);
    for (const minutes of Object.keys(solo)) assert.ok(together[minutes] <= solo[minutes], `${minutes} min`);
    // The party's trips are fought, as the companions' are.
    assert.equal(alone.trips, null);
    assert.ok(party.trips.length > 0);
  });

  test('the others setting out at a tenth of their HP make it more dangerous than at full HP', () => {
    const weak = threatSamples({ character, equipped, areaId, partners: partners.map((one) => ({ ...one, hpShare: 0.1 })) }, content);
    const tired = chances(weak);
    const fresh = chances(party);
    assert.ok(tired[240] > fresh[240], `${tired[240]} > ${fresh[240]}`);
  });

  test('a party trip goes without companions: they count no more beside the party', () => {
    const companion = { id: 1, classId: 'warrior', level, appearance: 'female', name: 'Dobrogost', gear: [] };
    const withCompanion = threatSamples({ character, equipped, areaId, partners, companions: [companion] }, content);
    assert.deepEqual(chances(withCompanion), chances(party));
  });
});

describe("the leader's threat of a place with the party (API)", () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on' });
  const cookies = {};
  const sql = async (query, ...binds) => (await db()).prepare(query).bind(...binds);
  const player = async (login, name, classId) => {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId, appearance: 'female' } });
    await (await sql(`UPDATE characters SET level = 28, class_level = 28, points = '{"strength":40,"vitality":40,"intelligence":40,"agility":40}', hp_at = 0 WHERE name = ?`, name)).run();
  };
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const options = async (login, party) => {
    const answer = await as(login, 'GET', `/api/hunts/options?area=mossy-boulders${party ? '&party=1' : ''}`);
    assert.equal(answer.status, 200, JSON.stringify(answer.data).slice(0, 300));
    return answer.data.areas[0];
  };
  const rank = (level) => THREAT_LEVELS.indexOf(level);

  beforeEach(async () => {
    await player('lider', 'Lider', 'warrior');
    await player('druh', 'Druh', 'mage');
    await player('trzeci', 'Trzeci', 'archer');
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('lider', 'POST', '/api/party/invite', { name: 'Trzeci' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
    await as('trzeci', 'POST', '/api/party/accept', { partyId: data.party.id });
  });

  test('with "Z drużyną" the leader sees the whole party\'s threat: no higher than its own, for every length', async () => {
    const alone = await options('lider');
    const together = await options('lider', true);
    assert.equal(alone.party, undefined);
    assert.equal(together.party, true);
    for (const [minutes, level] of Object.entries(alone.threat)) assert.ok(rank(together.threat[minutes]) <= rank(level), `${minutes} min: ${together.threat[minutes]} / ${level}`);
    assert.ok(Object.keys(alone.threat).some((minutes) => rank(together.threat[minutes]) < rank(alone.threat[minutes])), JSON.stringify([alone.threat, together.threat]));
  });

  test('only those who would go count: a member at a profession\'s work stays out, and with nobody to take the threat is the leader\'s own', async () => {
    const all = await options('lider', true);
    assert.equal((await as('druh', 'POST', '/api/professions/gather', { herbs: ['comfrey'], minutes: 60 })).status, 201);
    const two = await options('lider', true);
    assert.equal(two.party, true);
    assert.ok(Object.keys(all.threat).every((minutes) => rank(two.threat[minutes]) >= rank(all.threat[minutes])), JSON.stringify([all.threat, two.threat]));
    assert.equal((await as('trzeci', 'POST', '/api/professions/gather', { herbs: ['comfrey'], minutes: 60 })).status, 201);
    const none = await options('lider', true);
    assert.equal(none.party, undefined);
    assert.deepEqual(none.threat, (await options('lider')).threat);
  });

  test('a member who does not lead asks for its own threat only', async () => {
    const asked = await options('druh', true);
    assert.equal(asked.party, undefined);
    assert.deepEqual(asked.threat, (await options('druh')).threat);
  });
});

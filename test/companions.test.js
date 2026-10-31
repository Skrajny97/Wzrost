// Companions (the Osada, part II): the Karczma's four candidates a week, the
// places the relation with the innkeeper gives, a companion in the fights of
// an exploration, its XP and its wounds, which heal with the character's
// rest, hiring one through the API, its profession's gift of the week and
// the items it gets from the bag.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  companionAfterHunt,
  companionCombatant,
  companionGift,
  companionPlaces,
  companionReady,
  companionXp,
  createRng,
  drawCandidates,
  generateItem,
  hireCost,
  simulateHunt,
} from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const NOW = Date.UTC(2026, 9, 30, 10, 0);
const WEEK = 7 * 86400000;
const character = newCharacter('warrior', { level: 25, classLevel: 25 });
const tuning = content.settlement.companions;

describe('companions in the engine', () => {
  test('four candidates a week, the same all week, each with a class, two or three traits, two skills and gear', () => {
    const candidates = drawCandidates({ character, seed: 's' }, NOW, content);
    assert.equal(candidates.length, tuning.candidates);
    assert.deepEqual(drawCandidates({ character, seed: 's' }, NOW + 3600000, content), candidates);
    assert.notDeepEqual(drawCandidates({ character, seed: 's' }, NOW + WEEK, content), candidates);
    assert.equal(new Set(candidates.map((candidate) => candidate.name)).size, candidates.length);
    for (const candidate of candidates) {
      assert.ok(candidate.level >= character.level + tuning.levelSpread[0] && candidate.level <= character.level + tuning.levelSpread[1]);
      assert.ok(candidate.traits.length === 2 || candidate.traits.length === 3);
      assert.equal(new Set(candidate.traits).size, candidate.traits.length);
      assert.equal(candidate.skills.length, 2);
      assert.ok(candidate.skills.every((id) => content.skillsById[id].classId === candidate.classId));
      assert.ok(candidate.gear.some((item) => item.slot === 'weapon'));
      assert.equal(hireCost(candidate, content), candidate.level * tuning.goldPerLevel);
    }
    // A hired one no longer waits.
    assert.equal(drawCandidates({ character, seed: 's' }, NOW, content, [candidates[0].id]).length, candidates.length - 1);
  });

  test('the relation with the innkeeper gives the first place at its first standing and the second later', () => {
    const points = (id) => content.settlement.standings.find((standing) => standing.id === id).points;
    assert.equal(companionPlaces(0, content), 0);
    assert.equal(companionPlaces(points(tuning.from[0]), content), 1);
    assert.equal(companionPlaces(points(tuning.from[1]), content), 2);
  });

  test('traits change the companion in a fight', () => {
    const [candidate] = drawCandidates({ character, seed: 's' }, NOW, content);
    const plain = companionCombatant({ ...candidate, traits: [] }, {}, content);
    const tough = companionCombatant({ ...candidate, traits: ['tough'] }, {}, content);
    assert.equal(tough.maxHp, Math.round(plain.maxHp * 1.1));
    assert.equal(tough.companion, true);
  });

  test('a companion fights beside the character, the same way for the same seed, and gains XP faster below the character', () => {
    const candidates = drawCandidates({ character, seed: 's' }, NOW, content);
    const hunt = { character, equipped: [], name: 'Próba', areaId: 'boar-thicket', minutes: 60, seed: 'abc' };
    const party = simulateHunt({ ...hunt, companions: [candidates[0]] }, content);
    assert.deepEqual(simulateHunt({ ...hunt, companions: [candidates[0]] }, content), party);
    assert.equal(party.fights[0].allies.length, 2);
    assert.equal(party.fights[0].allies[1].name, candidates[0].name);
    assert.equal(party.companions[0].id, candidates[0].id);
    assert.equal(simulateHunt(hunt, content).companions, undefined);
    // Each companion along takes xpCost of the character's XP (235 B): the
    // same hunt without that cost has the same fights and 3% more XP.
    const free = { ...content, settlement: { ...content.settlement, companions: { ...tuning, xpCost: 0 } } };
    const full = simulateHunt({ ...hunt, companions: [candidates[0]] }, free);
    assert.ok(full.xp > 0);
    assert.ok(Math.abs(party.xp - full.xp * (1 - tuning.xpCost)) <= full.fights.length, `${full.xp} → ${party.xp}`);
    const below = { ...candidates[0], level: character.level - 5 };
    assert.equal(companionXp(below, 1000, character.level, content), Math.round(1000 * tuning.xpShare * (1 + tuning.catchUp * 5)));
    const after = companionAfterHunt(below, { xp: 100000, fainted: false }, character.level, content);
    assert.ok(after.level > below.level);
    assert.equal(after.wounded, undefined);
    // Fainted, it is wounded until the character has rested to full HP.
    const hurt = companionAfterHunt(below, { xp: 0, fainted: true }, character.level, content);
    assert.equal(hurt.wounded, true);
    assert.equal(companionReady(hurt, false), false);
    assert.equal(companionReady(hurt, true), true);
    assert.equal(companionReady(after, false), true);
  });
});

describe('a companion\'s gift of the week', () => {
  test('its profession brings goods the character knows, the same all week, once a week', () => {
    const kinds = Object.fromEntries(tuning.professions.map((profession) => [profession.id, profession.goods]));
    for (const profession of tuning.professions) {
      const companion = { id: 'w:1', profession: profession.id };
      const gift = companionGift(companion, { character, seed: 's' }, NOW, content);
      assert.equal(gift.kind, kinds[profession.id]);
      assert.ok(gift.count >= tuning.gifts[gift.kind].min);
      const goods = { herb: content.herbsById, potion: content.potionsById, part: content.partsById }[gift.kind];
      assert.ok(goods[gift.key], `${gift.kind} ${gift.key}`);
      assert.deepEqual(companionGift(companion, { character, seed: 's' }, NOW + 3600000, content), gift);
      assert.equal(companionGift({ ...companion, giftWeek: gift.week }, { character, seed: 's' }, NOW, content), null);
      assert.notEqual(companionGift({ ...companion, giftWeek: gift.week }, { character, seed: 's' }, NOW + WEEK, content), null);
    }
  });
});

describe('companions through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on', SETTLEMENT: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('karczmarka'));
    await call('POST', '/api/character', { cookie, body: { name: 'Karczmarka', classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare(`UPDATE characters SET level = 25, class_level = 25, gold = 100000`).run();
  });

  const settlement = async () => (await call('GET', '/api/settlement', { cookie })).data.settlement;
  const relation = (points) =>
    (async () => (await db()).prepare('UPDATE characters SET settlement = ?').bind(JSON.stringify({ relations: { [content.settlement.tavern.resident]: points } })).run())();

  test('candidates wait in the Karczma, and one is hired once the innkeeper knows the character', async () => {
    let view = (await settlement()).companions;
    assert.equal(view.places, 0);
    assert.equal(view.candidates.length, tuning.candidates);
    const [first, second] = view.candidates;
    assert.equal((await call('POST', '/api/settlement/hire', { cookie, body: { candidateId: first.id } })).data.error.code, 'no_place');
    const known = content.settlement.standings.find((standing) => standing.id === tuning.from[0]).points;
    await relation(known);
    const hired = await call('POST', '/api/settlement/hire', { cookie, body: { candidateId: first.id } });
    assert.equal(hired.status, 200);
    assert.equal(hired.data.character.gold, 100000 - first.price);
    view = hired.data.settlement.companions;
    assert.deepEqual(view.hired.map((companion) => companion.id), [first.id]);
    assert.equal(view.candidates.length, tuning.candidates - 1);
    assert.equal((await call('POST', '/api/settlement/hire', { cookie, body: { candidateId: second.id } })).data.error.code, 'no_place');
    // It goes on the next exploration and gains XP from it.
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    const options = JSON.parse((await (await db()).prepare('SELECT options FROM activities').first()).options);
    assert.deepEqual(options.companions.map((companion) => companion.id), [first.id]);
    await (await db()).prepare('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ?').bind(300000, 300000).run();
    const claimed = await call('POST', '/api/hunts/claim', { cookie });
    assert.equal(claimed.status, 200);
    const after = (await settlement()).companions.hired[0];
    assert.ok(after.xp > 0 || after.level > first.level);
    // Dismissed, it leaves and does not come back as a candidate this week.
    const dismissed = await call('POST', '/api/settlement/dismiss', { cookie, body: { companionId: first.id } });
    assert.equal(dismissed.data.settlement.companions.hired.length, 0);
    assert.ok(!dismissed.data.settlement.companions.candidates.some((candidate) => candidate.id === first.id));
  });

  test('a wounded companion heals with the character: it stays behind until the character has rested to full HP', async () => {
    await relation(content.settlement.standings.find((standing) => standing.id === tuning.from[0]).points);
    const [candidate] = (await settlement()).companions.candidates;
    await call('POST', '/api/settlement/hire', { cookie, body: { candidateId: candidate.id } });
    const database = await db();
    const stored = JSON.parse((await database.prepare('SELECT settlement FROM characters').first()).settlement);
    stored.companions[0].wounded = true;
    await database.prepare('UPDATE characters SET settlement = ?, hp = 1, hp_at = ?').bind(JSON.stringify(stored), Date.now()).run();
    const hurt = (await settlement()).companions.hired[0];
    assert.equal(hurt.wounded, true);
    assert.ok(hurt.healsAt > Date.now());
    // Not yet rested: an exploration goes without it.
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    const alone = JSON.parse((await database.prepare('SELECT options FROM activities').first()).options);
    assert.equal(alone.companions, undefined);
    await call('POST', '/api/hunts/cancel', { cookie });
    // Rested to full HP: healed, and it goes along.
    await database.prepare('UPDATE characters SET hp = 100000, hp_at = ?').bind(Date.now()).run();
    assert.equal((await settlement()).companions.hired[0].wounded, undefined);
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    const options = JSON.parse((await database.prepare('SELECT options FROM activities').first()).options);
    assert.deepEqual(options.companions.map((companion) => companion.id), [candidate.id]);
    const after = JSON.parse((await database.prepare('SELECT settlement FROM characters').first()).settlement);
    assert.equal(after.companions[0].wounded, undefined);
  });

  test('the gift of the week goes to the character\'s goods once a week, at home', async () => {
    await relation(content.settlement.standings.find((standing) => standing.id === tuning.from[0]).points);
    const [candidate] = (await settlement()).companions.candidates;
    const hired = await call('POST', '/api/settlement/hire', { cookie, body: { candidateId: candidate.id } });
    const { gift } = hired.data.settlement.companions.hired[0];
    assert.ok(gift.count > 0 && gift.name);
    const column = { herb: 'herbs', potion: 'potions', part: 'parts' }[gift.kind];
    const database = await db();
    const before = JSON.parse((await database.prepare(`SELECT ${column} AS goods FROM characters`).first()).goods)[gift.key] ?? 0;
    const taken = await call('POST', '/api/settlement/gift', { cookie, body: { companionId: candidate.id } });
    assert.equal(taken.status, 200);
    assert.deepEqual(taken.data.gift, { name: gift.name, count: gift.count });
    assert.equal(taken.data.settlement.companions.hired[0].gift, null);
    const after = JSON.parse((await database.prepare(`SELECT ${column} AS goods FROM characters`).first()).goods)[gift.key];
    assert.equal(after, before + gift.count);
    assert.equal((await call('POST', '/api/settlement/gift', { cookie, body: { companionId: candidate.id } })).data.error.code, 'gift_taken');
  });

  test('items of its class from the bag go on the companion, what it wore goes back, and it gives them back when dismissed (108 A)', async () => {
    await relation(content.settlement.standings.find((standing) => standing.id === tuning.from[0]).points);
    const [candidate] = (await settlement()).companions.candidates;
    await call('POST', '/api/settlement/hire', { cookie, body: { candidateId: candidate.id } });
    const database = await db();
    const rng = createRng('gear');
    const cls = content.classesById[candidate.classId];
    const familyBase = (family) => content.bases.find((base) => (base.family ?? base.id) === family && !(base.classLevel > candidate.level));
    const other = content.bases.find((base) => base.slot === 'weapon' && !cls.weapons.includes(base.family ?? base.id));
    const put = async (base) => {
      const item = generateItem({ baseId: base.id, level: candidate.level }, rng, content);
      const { meta } = await database.prepare('INSERT INTO items (character_id, slot, data, created_at) SELECT id, NULL, ?, 0 FROM characters').bind(JSON.stringify(item)).run();
      return meta.last_row_id;
    };
    const weapon = await put(familyBase(cls.weapons.at(-1)));
    const talisman = await put(content.bases.find((base) => base.slot === 'talisman'));
    const wrong = await put(other);
    const bagCount = async () => (await database.prepare('SELECT COUNT(*) AS n FROM items WHERE slot IS NULL').first()).n;
    let hired = (await settlement()).companions.hired[0];
    assert.deepEqual(hired.wear.map((place) => place.slot), ['weapon', 'chest', 'talisman']);
    assert.equal(hired.wear[2].item, null);
    assert.ok(hired.wearable.includes(weapon) && hired.wearable.includes(talisman) && !hired.wearable.includes(wrong));
    assert.equal((await call('POST', '/api/settlement/equip', { cookie, body: { companionId: candidate.id, itemId: wrong } })).data.error.code, 'wrong_class');
    // The weapon takes the old one's place, and the old one goes to the bag.
    const before = await bagCount();
    const armed = await call('POST', '/api/settlement/equip', { cookie, body: { companionId: candidate.id, itemId: weapon } });
    assert.equal(armed.status, 200);
    assert.equal(await bagCount(), before);
    hired = armed.data.settlement.companions.hired[0];
    assert.equal(hired.wear[0].item.given, true);
    assert.equal(await database.prepare('SELECT id FROM items WHERE id = ?').bind(weapon).first(), null);
    // The talisman fills an empty place.
    await call('POST', '/api/settlement/equip', { cookie, body: { companionId: candidate.id, itemId: talisman } });
    assert.equal(await bagCount(), before - 1);
    // Dismissed, it gives back the two items from the bag and keeps its own armour.
    const dismissed = await call('POST', '/api/settlement/dismiss', { cookie, body: { companionId: candidate.id } });
    assert.equal(dismissed.status, 200);
    assert.equal(await bagCount(), before + 1);
    const back = (await database.prepare('SELECT data FROM items WHERE slot IS NULL').all()).results.map((row) => JSON.parse(row.data));
    assert.ok(back.some((item) => item.slot === 'talisman' && !item.given));
  });
});

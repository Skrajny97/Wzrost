// Companions (the Osada, part II): the Karczma's four candidates a week, the
// price the relation with the innkeeper sets, a companion in the fights of
// an exploration, its XP and its wounds, which heal with the character's
// rest, hiring one through the API, its profession's gift of the week, the
// items it gets from the bag and their upgrades on the Kowadło, and
// "Zostań w kwaterze".

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, test } from 'node:test';

import {
  companionAfterHunt,
  companionCombatant,
  companionGift,
  companionGoes,
  companionReady,
  companionStays,
  companionXp,
  createRng,
  drawCandidates,
  generateItem,
  hireCost,
  partyRefusal,
  simulateHunt,
  staying,
  upgradedOnCompanion,
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
      assert.equal(hireCost(candidate, content, Infinity), candidate.level * tuning.goldPerLevel);
    }
    // A hired one no longer waits.
    assert.equal(drawCandidates({ character, seed: 's' }, NOW, content, [candidates[0].id]).length, candidates.length - 1);
  });

  test('any standing with the innkeeper may hire, a lower one for more gold', () => {
    // The author: "Nie uzależniaj mozliwosci a cene werbunku od stopnia
    // znajomości. Powinienem móc ale drożej niż na wyższym stopniu".
    const candidate = { level: 30 };
    const prices = content.settlement.standings.map((standing) => hireCost(candidate, content, standing.points));
    assert.ok(prices.every((price, index) => index === 0 || price <= prices[index - 1]), String(prices));
    assert.equal(prices[0], 30 * tuning.goldPerLevel * tuning.priceByStanding.stranger);
    assert.equal(prices.at(-1), 30 * tuning.goldPerLevel);
    assert.ok(prices[0] > prices.at(-1));
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

  test('one told to stay in the Kwatery goes on no exploration, nor does any while the character is in a Drużyna', () => {
    const [candidate] = drawCandidates({ character, seed: 's' }, NOW, content);
    assert.deepEqual([companionStays(candidate), companionGoes(candidate, { rested: false })], [false, true]);
    const stays = staying(candidate, true);
    assert.deepEqual([stays.stays, companionStays(stays), companionGoes(stays, { rested: true })], [true, true, false]);
    // Told to go again, it is as it was.
    assert.deepEqual(staying(stays, false), candidate);
    // In a Drużyna every companion stays (the author: "wtedy nie poluje się
    // z towarzyszem, tylko samemu/z drużyną").
    assert.deepEqual([companionStays(candidate, true), companionGoes(candidate, { rested: true, inParty: true })], [true, false]);
    // A wounded one still waits for the character's rest.
    assert.deepEqual([companionGoes({ ...candidate, wounded: true }, { rested: false }), companionGoes({ ...candidate, wounded: true }, { rested: true })], [false, true]);
  });

  test('the companions going on explorations keep the character out of a Drużyna, named in their forms', () => {
    const [candidate] = drawCandidates({ character, seed: 's' }, NOW, content);
    const she = { ...candidate, name: 'Milena', appearance: 'female' };
    const he = { ...candidate, name: 'Bogdan', appearance: 'male' };
    const tail = 'Drużyna poluje bez towarzyszy z Kwater.';
    assert.equal(partyRefusal([], content), null);
    assert.equal(partyRefusal([staying(she, true), staying(he, true)], content), null);
    assert.equal(partyRefusal([she], content), `Najpierw zostaw towarzyszkę w kwaterze: Milena. ${tail}`);
    assert.equal(partyRefusal([he, staying(she, true)], content), `Najpierw zostaw towarzysza w kwaterze: Bogdan. ${tail}`);
    assert.equal(partyRefusal([she, he], content), `Najpierw zostaw towarzyszy w kwaterze: Milena, Bogdan. ${tail}`);
    assert.equal(partyRefusal([she, { ...she, name: 'Bogna' }], content), `Najpierw zostaw towarzyszki w kwaterze: Milena, Bogna. ${tail}`);
  });

  test("an upgrade on a companion changes only the item in its place: the level and the try's seed, or the item gone when it broke", () => {
    const [candidate] = drawCandidates({ character, seed: 's' }, NOW, content);
    const weapon = candidate.gear.find((item) => item.slot === 'weapon');
    const body = candidate.gear.find((item) => item.slot === 'chest');
    const up = upgradedOnCompanion(candidate, 'weapon', { result: 'success', upgrade: 1 }, 'r1');
    assert.deepEqual(up.gear.find((item) => item.slot === 'weapon'), { ...weapon, upgrade: 1, lastRoll: 'r1' });
    assert.deepEqual(up.gear.find((item) => item.slot === 'chest'), body);
    assert.deepEqual({ ...up, gear: candidate.gear }, candidate);
    const down = upgradedOnCompanion({ ...up, gear: [{ ...weapon, upgrade: 3 }, body] }, 'weapon', { result: 'failure', upgrade: 2 }, 'r2');
    assert.equal(down.gear.find((item) => item.slot === 'weapon').upgrade, 2);
    const broken = upgradedOnCompanion({ ...up, gear: [{ ...weapon, upgrade: 8 }, body] }, 'weapon', { result: 'broken', upgrade: 8 }, 'r3');
    assert.deepEqual(broken.gear, [body]);
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

  // The camp's Kwatery at a level: a bed for a companion on each.
  const quarters = async (level) => {
    const database = await db();
    await database.prepare("DELETE FROM buildings WHERE building_id = 'quarters'").run();
    if (level > 0) await database.prepare("INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) SELECT id, 'quarters', ?, 0, 0 FROM characters").bind(level).run();
  };

  beforeEach(async () => {
    ({ cookie } = await signUp('karczmarka'));
    await call('POST', '/api/character', { cookie, body: { name: 'Karczmarka', classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare(`UPDATE characters SET level = 25, class_level = 25, gold = 100000`).run();
    await quarters(2);
  });

  const settlement = async () => (await call('GET', '/api/settlement', { cookie })).data.settlement;
  const relation = (points) =>
    (async () => (await db()).prepare('UPDATE characters SET settlement = ?').bind(JSON.stringify({ relations: { [content.settlement.tavern.resident]: points } })).run())();

  test('each companion needs a bed in the camp\'s Kwatery, a level of them for each (104 A)', async () => {
    await quarters(0);
    const camp = (await call('GET', '/api/character', { cookie })).data.character.camp.buildings.find((building) => building.id === 'quarters');
    assert.deepEqual([camp.level, camp.maxLevel, camp.look, camp.next.effect], [0, 3, 1, 'Miejsca dla towarzyszy: 1']);
    let view = (await settlement()).companions;
    assert.deepEqual([view.places, view.moreBeds], [0, true]);
    const [first, second] = view.candidates;
    assert.equal((await call('POST', '/api/settlement/hire', { cookie, body: { candidateId: first.id } })).data.error.code, 'no_bed');
    await quarters(1);
    assert.equal((await call('POST', '/api/settlement/hire', { cookie, body: { candidateId: first.id } })).status, 200);
    assert.equal((await call('POST', '/api/settlement/hire', { cookie, body: { candidateId: second.id } })).data.error.code, 'no_bed');
    await quarters(2);
    view = (await call('POST', '/api/settlement/hire', { cookie, body: { candidateId: second.id } })).data.settlement.companions;
    assert.deepEqual([view.hired.length, view.places], [2, 2]);
    // The second look of the Kwatery stands at their second level.
    const built = (await call('GET', '/api/character', { cookie })).data.character.camp.buildings.find((building) => building.id === 'quarters');
    assert.deepEqual([built.level, built.look, built.effect], [2, 2, 'Miejsca dla towarzyszy: 2']);
  });

  test('the third bed of the Kwatery\'s 3rd level takes a reserve: at most two go on the explorations (author, 10.11.2026)', async () => {
    await quarters(3);
    const built = (await call('GET', '/api/character', { cookie })).data.character.camp.buildings.find((building) => building.id === 'quarters');
    assert.deepEqual([built.level, built.look, built.effect], [3, 3, 'Miejsca dla towarzyszy: 3']);
    const [first, second, third] = (await settlement()).companions.candidates;
    for (const one of [first, second]) {
      const answer = await call('POST', '/api/settlement/hire', { cookie, body: { candidateId: one.id } });
      assert.deepEqual([answer.status, answer.data.text], [200, undefined]);
    }
    // The third, hired while two go, waits in the Kwatery as the reserve.
    const hired = await call('POST', '/api/settlement/hire', { cookie, body: { candidateId: third.id } });
    assert.equal(hired.status, 200);
    assert.ok(hired.data.text.startsWith(`${third.name} zamieszka w Kwaterach jako rezerwow`));
    const view = (id, companions) => companions.hired.find((companion) => companion.id === id).stay;
    let companions = hired.data.settlement.companions;
    assert.deepEqual([companions.places, companions.moreBeds], [3, false]);
    assert.deepEqual([view(first.id, companions).stays, view(second.id, companions).stays], [false, false]);
    assert.deepEqual([view(third.id, companions).stays, view(third.id, companions).reserve, view(third.id, companions).action], [true, true, null]);
    // A third may not go while two go.
    const refused = await call('POST', '/api/settlement/companion-stay', { cookie, body: { companionId: third.id, stays: false } });
    assert.deepEqual([refused.status, refused.data.error.code], [409, 'full_going']);
    // An exploration takes the two who go.
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    const options = JSON.parse((await (await db()).prepare('SELECT options FROM activities').first()).options);
    assert.deepEqual(options.companions.map((companion) => companion.id).sort(), [first.id, second.id].sort());
    await (await db()).prepare('DELETE FROM activities').run();
    // One of them left in the Kwatery, the reserve may go in its place.
    await call('POST', '/api/settlement/companion-stay', { cookie, body: { companionId: first.id, stays: true } });
    companions = (await settlement()).companions;
    assert.deepEqual([view(third.id, companions).reserve, view(third.id, companions).action.stays], [undefined, false]);
    const goes = await call('POST', '/api/settlement/companion-stay', { cookie, body: { companionId: third.id, stays: false } });
    assert.equal(goes.status, 200);
    companions = goes.data.settlement.companions;
    assert.deepEqual([view(first.id, companions).reserve, view(second.id, companions).stays, view(third.id, companions).stays], [true, false, false]);
  });

  test('candidates wait in the Karczma, and a stranger to the innkeeper hires one too, for more gold', async () => {
    // A friend of Zbylut pays the plain price.
    await relation(content.settlement.standings.at(-1).points);
    const friendly = (await settlement()).companions;
    assert.deepEqual(
      friendly.candidates.map((candidate) => candidate.price),
      friendly.candidates.map((candidate) => candidate.level * tuning.goldPerLevel),
    );
    assert.equal(friendly.cheaper, false);
    // A stranger pays more, and may hire all the same.
    await relation(0);
    let view = (await settlement()).companions;
    assert.deepEqual([view.places, view.cheaper], [2, true]);
    assert.equal(view.candidates.length, tuning.candidates);
    const [first] = view.candidates;
    assert.equal(first.price, Math.round(first.level * tuning.goldPerLevel * tuning.priceByStanding.stranger));
    const hired = await call('POST', '/api/settlement/hire', { cookie, body: { candidateId: first.id } });
    assert.equal(hired.status, 200);
    assert.equal(hired.data.character.gold, 100000 - first.price);
    view = hired.data.settlement.companions;
    assert.deepEqual(view.hired.map((companion) => companion.id), [first.id]);
    assert.equal(view.candidates.length, tuning.candidates - 1);
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

  test('a gift of herbs waits while the bag has no room for it (the code review)', async () => {
    const [candidate] = (await settlement()).companions.candidates;
    await call('POST', '/api/settlement/hire', { cookie, body: { candidateId: candidate.id } });
    // The companion turns herbalist: its gift is herbs.
    const database = await db();
    const herbalist = content.settlement.companions.professions.find((one) => one.goods === 'herb').id;
    const stored = JSON.parse((await database.prepare('SELECT settlement FROM characters').first()).settlement);
    stored.companions[0].profession = herbalist;
    await database.prepare("UPDATE characters SET settlement = ?, herbs = '{}', potions = '{}'").bind(JSON.stringify(stored)).run();
    const { gift } = (await settlement()).companions.hired[0];
    assert.equal(gift.kind, 'herb');
    // Every place of the bag taken by full stacks of another herb.
    const { stack } = content.professionRules;
    const other = content.herbs.find((herb) => herb.id !== gift.key).id;
    const { bagUsed, bagCapacity } = (await call('GET', '/api/character', { cookie })).data.character;
    const fill = (places) => database.prepare('UPDATE characters SET herbs = ?').bind(JSON.stringify({ [other]: places * stack })).run();
    await fill(bagCapacity - bagUsed);
    const full = await call('POST', '/api/settlement/gift', { cookie, body: { companionId: candidate.id } });
    assert.equal(full.status, 409);
    assert.equal(full.data.error.code, 'bag_full');
    assert.ok((await settlement()).companions.hired[0].gift, 'the gift still waits');
    // Room made: it goes in.
    await fill(bagCapacity - bagUsed - Math.ceil(gift.count / stack));
    const taken = await call('POST', '/api/settlement/gift', { cookie, body: { companionId: candidate.id } });
    assert.equal(taken.status, 200, JSON.stringify(taken.data));
    assert.equal(JSON.parse((await database.prepare('SELECT herbs FROM characters').first()).herbs)[gift.key], gift.count);
  });

  test('items of its class and one piece of jewellery from the bag go on the companion, what it wore goes back, and it gives them back when dismissed (108 A)', async () => {
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
    // The author: "zmień by towarzysze mogli nosić bizuterie ogolnie czyli
    // amulety i pierscienie tez a nie sam talizman", and then "albo Amulet
    // albo Pierścień albo Talizman a nie wszystko na raz".
    const amulet = await put(content.bases.find((base) => base.slot === 'amulet'));
    const ring = await put(content.bases.find((base) => base.slot === 'ring'));
    const wrong = await put(other);
    const bagCount = async () => (await database.prepare('SELECT COUNT(*) AS n FROM items WHERE slot IS NULL').first()).n;
    let hired = (await settlement()).companions.hired[0];
    assert.deepEqual(hired.wear.map((place) => place.slot), ['weapon', 'chest', 'jewelry']);
    assert.deepEqual(hired.wear.map((place) => place.slotName), ['Broń', 'Pancerz', 'Biżuteria']);
    assert.equal(hired.wear[2].item, null);
    assert.ok([weapon, talisman, amulet, ring].every((id) => hired.wearable.includes(id)) && !hired.wearable.includes(wrong));
    assert.equal((await call('POST', '/api/settlement/equip', { cookie, body: { companionId: candidate.id, itemId: wrong } })).data.error.code, 'wrong_class');
    // The weapon takes the old one's place, and the old one goes to the bag.
    const before = await bagCount();
    const armed = await call('POST', '/api/settlement/equip', { cookie, body: { companionId: candidate.id, itemId: weapon } });
    assert.equal(armed.status, 200);
    assert.equal(await bagCount(), before);
    hired = armed.data.settlement.companions.hired[0];
    assert.equal(hired.wear[0].item.given, true);
    assert.equal(await database.prepare('SELECT id FROM items WHERE id = ?').bind(weapon).first(), null);
    // The talisman fills the empty place of jewellery; the amulet takes its
    // place, and the ring the amulet's, each going back to the bag.
    const charmed = await call('POST', '/api/settlement/equip', { cookie, body: { companionId: candidate.id, itemId: talisman } });
    assert.equal(charmed.status, 200);
    assert.equal(await bagCount(), before - 1);
    assert.equal(charmed.data.settlement.companions.hired[0].wear[2].item.slot, 'talisman');
    const hung = await call('POST', '/api/settlement/equip', { cookie, body: { companionId: candidate.id, itemId: amulet } });
    assert.equal(hung.data.settlement.companions.hired[0].wear[2].item.slot, 'amulet');
    const ringed = await call('POST', '/api/settlement/equip', { cookie, body: { companionId: candidate.id, itemId: ring } });
    assert.equal(ringed.status, 200);
    assert.equal(await bagCount(), before - 1);
    assert.deepEqual(
      ringed.data.settlement.companions.hired[0].wear.map((place) => place.item?.slot),
      ['weapon', 'chest', 'ring'],
    );
    const worn = JSON.parse((await database.prepare('SELECT settlement FROM characters').first()).settlement).companions[0].gear;
    assert.deepEqual(worn.map((item) => item.slot).sort(), ['chest', 'ring', 'weapon']);
    // Dismissed, it gives back the two items from the bag and keeps its own armour.
    const dismissed = await call('POST', '/api/settlement/dismiss', { cookie, body: { companionId: candidate.id } });
    assert.equal(dismissed.status, 200);
    assert.equal(await bagCount(), before + 1);
    const back = (await database.prepare('SELECT data FROM items WHERE slot IS NULL').all()).results.map((row) => JSON.parse(row.data));
    assert.ok(['talisman', 'amulet', 'ring'].every((slot) => back.some((item) => item.slot === slot && !item.given)));
  });

  // The camp's Kowadło at a level, and the character's gold and iron ore.
  const anvil = async (level) =>
    (await db())
      .prepare("INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) SELECT id, 'anvil', ?, 0, 0 FROM characters WHERE true ON CONFLICT (character_id, building_id) DO UPDATE SET level = excluded.level")
      .bind(level)
      .run();
  const stock = async (gold, ore) => (await db()).prepare('UPDATE characters SET gold = ?, resources = ?').bind(gold, JSON.stringify({ wood: 0, stone: 0, 'iron-ore': ore })).run();
  // The Osada as stored, and the item the first companion wears in a place.
  const stored = async () => JSON.parse((await (await db()).prepare('SELECT settlement FROM characters').first()).settlement);
  const storedItem = async (slot) => (await stored()).companions[0].gear.find((item) => item.slot === slot);
  const hireFirst = async () => {
    const [candidate] = (await settlement()).companions.candidates;
    await call('POST', '/api/settlement/hire', { cookie, body: { candidateId: candidate.id } });
    return candidate;
  };
  const upgrade = (companionId, slot, body = {}) => call('POST', '/api/settlement/companion-upgrade', { cookie, body: { companionId, slot, ...body } });
  const placeOf = (view, slot) => view.companions.hired[0].wear.find((place) => place.slot === slot);

  test('a companion who put on several pieces of jewellery keeps the last; the others go back to the bag (migration 0088)', async () => {
    const candidate = await hireFirst();
    const database = await db();
    const rng = createRng('jewellery');
    const piece = (slot) => ({ ...generateItem({ baseId: content.bases.find((base) => base.slot === slot).id, level: 5 }, rng, content), given: true });
    const [talisman, amulet, ring] = ['talisman', 'amulet', 'ring'].map(piece);
    const osada = await stored();
    const [first] = osada.companions;
    // Since 0.1.71 one could wear all three; another wears one, as now.
    osada.companions = [
      { ...first, gear: [...first.gear, talisman, amulet, ring] },
      { ...first, id: 'second', gear: [...first.gear, { ...talisman }] },
    ];
    await database.prepare('UPDATE characters SET settlement = ?').bind(JSON.stringify(osada)).run();
    const { version } = await database.prepare('SELECT version FROM characters').first();
    const migrate = async () => {
      const sql = readFileSync(new URL('../migrations/0088_companion_jewelry.sql', import.meta.url), 'utf8').replace(/^--.*$/gm, '');
      for (const statement of sql.split(';').map((one) => one.trim()).filter(Boolean)) await database.prepare(statement).run();
    };
    await migrate();
    const after = await stored();
    assert.deepEqual(after.companions[0].gear, [...first.gear, ring]);
    assert.deepEqual(after.companions[1], osada.companions[1]);
    assert.deepEqual({ ...after, companions: null }, { ...osada, companions: null });
    const bag = (await database.prepare('SELECT data FROM items WHERE slot IS NULL ORDER BY id').all()).results.map((row) => JSON.parse(row.data));
    const { given: _t, ...plainTalisman } = talisman;
    const { given: _a, ...plainAmulet } = amulet;
    assert.deepEqual(bag.slice(-2), [plainTalisman, plainAmulet]);
    assert.equal((await database.prepare('SELECT version FROM characters').first()).version, version + 1);
    // The Kwatery show the ring in its place; a second run changes nothing.
    assert.equal(placeOf(await settlement(), 'jewelry').item.slot, 'ring');
    await migrate();
    assert.deepEqual(await stored(), after);
    assert.equal((await database.prepare('SELECT COUNT(*) AS n FROM items WHERE slot IS NULL').first()).n, bag.length);
    assert.equal(candidate.id, first.id);
  });

  test("an item the companion wears is upgraded as on the Kowadło, paid from the character's own gold, ore and materials", async () => {
    const candidate = await hireFirst();
    // Without the Kowadło, the card says so and there is no try.
    assert.deepEqual(placeOf(await settlement(), 'weapon').item.anvil, { level: 0, cap: 0, max: 10, next: null });
    assert.equal((await upgrade(candidate.id, 'weapon')).data.error.code, 'anvil_level');
    await anvil(10);
    await stock(100000, 1000);
    const { next } = placeOf(await settlement(), 'weapon').item.anvil;
    assert.equal(next.level, 1);
    const bagBefore = (await call('GET', '/api/character', { cookie })).data.character.bag.length;
    const chest = await storedItem('chest');
    const tried = await upgrade(candidate.id, 'weapon');
    assert.equal(tried.status, 200, JSON.stringify(tried.data));
    assert.deepEqual([tried.data.upgrade.companionId, tried.data.upgrade.slot, tried.data.upgrade.from], [candidate.id, 'weapon', 0]);
    assert.deepEqual(tried.data.upgrade.cost, next.cost);
    assert.ok(['success', 'failure'].includes(tried.data.upgrade.result));
    // The character pays; only the companion's item changes.
    assert.equal(tried.data.character.gold, 100000 - next.cost.gold);
    assert.equal(tried.data.character.resources['iron-ore'], 1000 - next.cost['iron-ore']);
    assert.equal(tried.data.character.bag.length, bagBefore);
    assert.equal(placeOf(tried.data.settlement, 'weapon').item.upgrade, tried.data.upgrade.to);
    assert.equal((await storedItem('weapon')).upgrade, tried.data.upgrade.to);
    assert.deepEqual(await storedItem('chest'), chest);
    // From +5 on, a material of the item's rarity, from the character's own.
    const database = await db();
    const osada = await stored();
    osada.companions[0].gear = osada.companions[0].gear.map((item) => (item.slot === 'weapon' ? { ...item, upgrade: 4 } : item));
    await database.prepare("UPDATE characters SET settlement = ?, materials = '{}'").bind(JSON.stringify(osada)).run();
    const rarity = (await storedItem('weapon')).rarity;
    assert.deepEqual(placeOf(await settlement(), 'weapon').item.anvil.next.materials, { rarity, count: 1, have: 0, takes: null });
    assert.equal((await upgrade(candidate.id, 'weapon')).data.error.code, 'no_material');
    await database.prepare('UPDATE characters SET materials = ?').bind(JSON.stringify({ [`wolf-pelt:${rarity}`]: 3, [`fox-pelt:${rarity}`]: 1 })).run();
    // The card names the pieces the try takes, from the character's stock.
    assert.deepEqual(
      placeOf(await settlement(), 'weapon').item.anvil.next.materials.takes.map((one) => [one.key, one.count]),
      [[`wolf-pelt:${rarity}`, 1]],
    );
    const fifth = await upgrade(candidate.id, 'weapon');
    assert.equal(fifth.status, 200, JSON.stringify(fifth.data));
    assert.deepEqual(fifth.data.upgrade.materials, { [`wolf-pelt:${rarity}`]: 1 });
    assert.deepEqual(JSON.parse((await database.prepare('SELECT materials FROM characters').first()).materials), { [`wolf-pelt:${rarity}`]: 2, [`fox-pelt:${rarity}`]: 1 });
    // Materials of the rarity add up (481 B): at +6, two pieces of two.
    const sixth = JSON.parse((await database.prepare('SELECT settlement FROM characters').first()).settlement);
    sixth.companions[0].gear = sixth.companions[0].gear.map((item) => (item.slot === 'weapon' ? { ...item, upgrade: 5 } : item));
    await database.prepare('UPDATE characters SET settlement = ?, materials = ?').bind(JSON.stringify(sixth), JSON.stringify({ [`wolf-pelt:${rarity}`]: 1, [`fox-pelt:${rarity}`]: 1 })).run();
    const both = await upgrade(candidate.id, 'weapon');
    assert.equal(both.status, 200, JSON.stringify(both.data));
    assert.deepEqual(both.data.upgrade.materials, { [`fox-pelt:${rarity}`]: 1, [`wolf-pelt:${rarity}`]: 1 });
    assert.deepEqual(JSON.parse((await database.prepare('SELECT materials FROM characters').first()).materials), {});
    // A place with nothing in it has nothing to upgrade.
    const empty = await upgrade(candidate.id, 'talisman');
    assert.deepEqual([empty.status, empty.data.error.code], [404, 'item_not_found']);
  });

  test('two quick taps on "Ulepsz" make and pay one try', async () => {
    const candidate = await hireFirst();
    await anvil(3);
    await stock(100000, 1000);
    // Both taps of the same card name the item's last try as it showed it.
    const { roll } = placeOf(await settlement(), 'weapon').item;
    assert.equal(roll, '');
    const taps = await Promise.all([upgrade(candidate.id, 'weapon', { roll }), upgrade(candidate.id, 'weapon', { roll })]);
    assert.deepEqual(
      taps.map((tap) => tap.status).sort(),
      [200, 409],
    );
    const made = taps.find((tap) => tap.status === 200).data;
    assert.equal(taps.find((tap) => tap.status === 409).data.error.code, 'item_changed');
    const row = await (await db()).prepare('SELECT gold, resources FROM characters').first();
    assert.equal(row.gold, 100000 - made.upgrade.cost.gold);
    assert.equal(JSON.parse(row.resources)['iron-ore'], 1000 - made.upgrade.cost['iron-ore']);
    assert.equal((await storedItem('weapon')).upgrade, made.upgrade.to);
    // The card after the try names it, and the next tap is a try again.
    const next = placeOf(made.settlement, 'weapon').item.roll;
    assert.equal(next, (await storedItem('weapon')).lastRoll);
    assert.equal((await upgrade(candidate.id, 'weapon', { roll: next })).status, 200);
  });

  test('"Zostań w kwaterze": a companion who stays goes on no exploration and gains nothing from it, and its gear is at hand meanwhile', async () => {
    const candidate = await hireFirst();
    await anvil(3);
    await stock(100000, 1000);
    const database = await db();
    const options = async () => JSON.parse((await database.prepare('SELECT options FROM activities').first()).options);
    let hired = (await settlement()).companions.hired[0];
    assert.deepEqual([hired.stay.stays, hired.stay.action.label, hired.away], [false, 'Zostań w kwaterze', null]);
    // Out on an exploration with the character: its gear waits.
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    assert.deepEqual((await options()).companions.map((companion) => companion.id), [candidate.id]);
    hired = (await settlement()).companions.hired[0];
    assert.match(hired.away, /na wyprawie/);
    assert.equal((await upgrade(candidate.id, 'weapon')).data.error.code, 'busy');
    await call('POST', '/api/hunts/cancel', { cookie });
    // Told to stay, it stays home while the character explores alone.
    const told = await call('POST', '/api/settlement/companion-stay', { cookie, body: { companionId: candidate.id, stays: true } });
    assert.equal(told.status, 200, JSON.stringify(told.data));
    assert.equal(told.data.text, `${candidate.name} zostaje w kwaterze.`);
    hired = told.data.settlement.companions.hired[0];
    assert.deepEqual([hired.stay.stays, hired.stay.action.label], [true, 'Idź na wyprawy']);
    assert.equal((await stored()).companions[0].stays, true);
    const before = (await stored()).companions[0];
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    assert.equal((await options()).companions, undefined);
    // At home meanwhile: its item is upgraded.
    assert.equal((await settlement()).companions.hired[0].away, null);
    assert.equal((await upgrade(candidate.id, 'weapon')).status, 200);
    // The report brings it no XP and no relation.
    await database.prepare('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ?').bind(300000, 300000).run();
    assert.equal((await call('POST', '/api/hunts/claim', { cookie })).status, 200);
    const after = (await stored()).companions[0];
    assert.deepEqual([after.level, after.xp ?? 0, after.relation ?? 0], [before.level, before.xp ?? 0, before.relation ?? 0]);
    // Talks go on as ever.
    assert.equal((await call('POST', '/api/settlement/talk', { cookie, body: { companionId: candidate.id } })).status, 200);
    // "Idź na wyprawy": it goes along again.
    const back = await call('POST', '/api/settlement/companion-stay', { cookie, body: { companionId: candidate.id, stays: false } });
    assert.equal(back.data.text, `${candidate.name} chodzi teraz z postacią na wyprawy.`);
    assert.equal((await stored()).companions[0].stays, undefined);
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    assert.deepEqual((await options()).companions.map((companion) => companion.id), [candidate.id]);
    assert.equal((await call('POST', '/api/settlement/companion-stay', { cookie, body: { companionId: candidate.id } })).data.error.code, 'invalid_stay');
  });

  test('a companion goes on a Szybkie Polowanie and a Błyskawiczne polowanie too, and gains from them as from an exploration (711 A)', async () => {
    const candidate = await hireFirst();
    const gains = (companion) => [companion.level, companion.xp ?? 0, companion.relation ?? 0];
    for (const kind of ['quick', 'flash']) {
      const before = (await stored()).companions[0];
      const done = await call('POST', '/api/hunts/quick', { cookie, body: { areaId: 'windfalls-edge', ...(kind === 'flash' && { kind }) } });
      assert.equal(done.status, 200, JSON.stringify(done.data).slice(0, 300));
      const after = (await stored()).companions[0];
      assert.equal(after.id, candidate.id);
      assert.notDeepEqual(gains(after), gains(before), kind);
    }
  });

  test('"Zdejmij": what a companion wears goes to the bag and its place stays empty, at home, with room in the bag; it fights without it (author, 6.11.2026)', async () => {
    const candidate = await hireFirst();
    const database = await db();
    const bagCount = async () => (await database.prepare('SELECT COUNT(*) AS n FROM items WHERE slot IS NULL').first()).n;
    const takeOff = (slot, companionId = candidate.id) => call('POST', '/api/settlement/unequip', { cookie, body: { companionId, slot } });
    const own = await storedItem('weapon');
    assert.ok(own, 'a hired companion comes with a weapon of its own');
    // Away on an exploration with the character: the item waits.
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    assert.equal((await takeOff('weapon')).data.error.code, 'busy');
    await call('POST', '/api/hunts/cancel', { cookie });
    // No room in the bag: nothing is taken off.
    const filler = JSON.stringify(generateItem({ baseId: content.bases.find((base) => base.slot === 'chest').id, level: 1 }, createRng('filler'), content));
    await database
      .prepare('WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?) INSERT INTO items (character_id, slot, data, created_at) SELECT characters.id, NULL, ?, 0 FROM characters, n')
      .bind(content.balance.items.bagSlots - (await bagCount()), filler)
      .run();
    const full = await takeOff('weapon');
    assert.equal(full.data.error.code, 'bag_full');
    assert.ok(await storedItem('weapon'));
    await database.prepare('DELETE FROM items WHERE slot IS NULL AND data = ?').bind(filler).run();
    // At home, with room: the weapon goes to the bag, and the place is empty.
    const before = await bagCount();
    const done = await takeOff('weapon');
    assert.equal(done.status, 200, JSON.stringify(done.data).slice(0, 300));
    assert.equal(await bagCount(), before + 1);
    assert.equal(placeOf(done.data.settlement, 'weapon').item, null);
    assert.equal(await storedItem('weapon'), undefined);
    const rows = (await database.prepare('SELECT id, data FROM items WHERE slot IS NULL').all()).results.map((row) => ({ id: row.id, ...JSON.parse(row.data) }));
    const back = rows.find((item) => item.slot === 'weapon');
    assert.deepEqual([back.baseId, back.level, back.given], [own.baseId, own.level, undefined]);
    assert.ok(done.data.character.bag.some((item) => item.id === back.id));
    // An empty place, a place it has no such thing in, or no such companion.
    assert.equal((await takeOff('weapon')).data.error.code, 'item_not_found');
    assert.equal((await takeOff('jewelry')).data.error.code, 'item_not_found');
    assert.equal((await takeOff('chest', 'nobody')).data.error.code, 'no_companion');
    // Bare-handed, it still goes and fights.
    const quick = await call('POST', '/api/hunts/quick', { cookie, body: { areaId: 'windfalls-edge' } });
    assert.equal(quick.status, 200, JSON.stringify(quick.data).slice(0, 300));
    // And the weapon goes back on from the bag.
    const again = await call('POST', '/api/settlement/equip', { cookie, body: { companionId: candidate.id, itemId: back.id } });
    assert.equal(again.status, 200, JSON.stringify(again.data).slice(0, 300));
    assert.equal((await storedItem('weapon')).baseId, own.baseId);
  });

  test('the companions who went walk beside the character on the Walka screen, in their looks; one who stays in the Kwatery does not (640 A, 648)', async () => {
    const [first, second] = (await settlement()).companions.candidates;
    for (const candidate of [first, second]) assert.equal((await call('POST', '/api/settlement/hire', { cookie, body: { candidateId: candidate.id } })).status, 200);
    const activity = async () => (await call('GET', '/api/character', { cookie })).data.character.activity;
    const look = ({ name, classId, appearance }) => ({ name, classId, appearance });
    // Both go: the page gets their names, classes and looks, in the order
    // they set out, and nothing else of them.
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    assert.deepEqual((await activity()).companions, [look(first), look(second)]);
    await call('POST', '/api/hunts/cancel', { cookie });
    // The first stays in the Kwatery: only the second walks.
    assert.equal((await call('POST', '/api/settlement/companion-stay', { cookie, body: { companionId: first.id, stays: true } })).status, 200);
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    assert.deepEqual((await activity()).companions, [look(second)]);
    await call('POST', '/api/hunts/cancel', { cookie });
    // Both stay: the character walks alone, as without companions.
    assert.equal((await call('POST', '/api/settlement/companion-stay', { cookie, body: { companionId: second.id, stays: true } })).status, 200);
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    const alone = await activity();
    assert.equal(alone.kind, 'hunt');
    assert.ok(!('companions' in alone));
  });
});

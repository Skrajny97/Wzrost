// Talks and the relation with a companion (questions 295 A and 296 A):
// "Porozmawiaj" in the Kwatery once a day, where the companion tells a
// piece of its story, more pieces as the relation grows; the relation grows
// with each exploration and talk, by the residents' standings, and each
// standing gives the companion more damage and HP in a fight.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { bondPoints, companionAfterHunt, companionCombatant, companionStanding, drawCandidates, gendered, talkWith, toldPieces } from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const NOW = Date.UTC(2026, 9, 30, 10, 0);
const DAY = 86400000;
const tuning = content.settlement.companions;
const { standings } = content.settlement;
const character = newCharacter('warrior', { level: 25, classLevel: 25 });
const [candidate] = drawCandidates({ character, seed: 'bond' }, NOW, content);

describe('the relation with a companion in the engine', () => {
  test('it grows with the time out together, to the fraction of a point (296 A, 341 A)', () => {
    // To the fraction, no least point a trip (341 A).
    assert.ok(Math.abs(bondPoints(5, content) - (5 * tuning.relation.perHour) / 60) < 1e-12);
    assert.ok(Math.abs(bondPoints(1, content) * 60 - tuning.relation.perHour) < 1e-9);
    assert.equal(bondPoints(60, content), tuning.relation.perHour);
    assert.equal(bondPoints(240, content), 4 * tuning.relation.perHour);
    const after = companionAfterHunt({ ...candidate, relation: 7 }, { xp: 10, fainted: false, minutes: 120 }, 25, content);
    assert.equal(after.relation, 7 + 2 * tuning.relation.perHour);
    assert.equal(companionAfterHunt(candidate, { xp: 10, fainted: false }, 25, content).relation, undefined);
  });

  test("its standings are the residents' points under its own names, and each above the first adds damage and HP in a fight", () => {
    const base = companionCombatant({ ...candidate, relation: 0 }, {}, content);
    // Names of their own, none a resident's or a Bractwo's (5.11.2026).
    assert.equal(tuning.relation.standings.length, standings.length);
    for (const name of tuning.relation.standings) assert.ok(!standings.some((standing) => gendered(name, 'female') === standing.name || gendered(name, 'male') === standing.name), name);
    standings.forEach((standing, index) => {
      const companion = { ...candidate, relation: standing.points };
      const seen = companionStanding(companion, content);
      assert.equal(seen.name, gendered(tuning.relation.standings[index], candidate.appearance));
      if (index > 0) assert.equal(companionStanding({ ...candidate, relation: standing.points - 1 }, content).next.name, seen.name);
      assert.equal(seen.next?.points ?? null, standings[index + 1]?.points ?? null);
      const unit = companionCombatant(companion, {}, content);
      const bond = index * tuning.relation.bonus;
      assert.ok(Math.abs((unit.damageBonus ?? 0) - ((base.damageBonus ?? 0) + bond)) < 1e-9, standing.id);
      if (index > 0) assert.ok(unit.maxHp > base.maxHp, standing.id);
    });
    const friend = companionCombatant({ ...candidate, relation: standings.at(-1).points }, {}, content);
    const traitsHp = tuning.traits.filter((trait) => candidate.traits.includes(trait.id)).reduce((sum, trait) => sum + (trait.hp ?? 0), 0);
    const plain = base.maxHp / (1 + traitsHp);
    assert.ok(Math.abs(friend.maxHp - plain * (1 + traitsHp + (standings.length - 1) * tuning.relation.bonus)) <= 1);
  });

  test('a talk tells its story piece by piece as the relation grows, and a word of the day between (295 A)', () => {
    const pieces = tuning.talks.stories[candidate.story % tuning.talks.stories.length];
    let companion = { ...candidate, relation: 0 };
    // The first piece at once.
    let talk = talkWith(companion, { seed: 's', now: NOW }, content);
    assert.deepEqual([talk.talk.story, talk.talk.text], [true, gendered(pieces[0], candidate.appearance)]);
    assert.equal(talk.companion.relation, tuning.relation.talk);
    companion = talk.companion;
    // The next waits for the next standing: until then, a word of the day,
    // of the first standing.
    talk = talkWith(companion, { seed: 's', now: NOW + DAY }, content);
    assert.equal(talk.talk.story, false);
    assert.ok(tuning.talks.chatter[standings[0].id].map((line) => gendered(line, candidate.appearance)).includes(talk.talk.text));
    companion = { ...talk.companion, relation: standings[1].points };
    talk = talkWith(companion, { seed: 's', now: NOW + 2 * DAY }, content);
    assert.deepEqual([talk.talk.story, talk.talk.text], [true, gendered(pieces[1], candidate.appearance)]);
    // A friend tells the rest, a piece a talk, and then only words of the day.
    companion = { ...talk.companion, relation: standings.at(-1).points };
    for (let day = 3; day < 3 + pieces.length - 2; day += 1) {
      talk = talkWith(companion, { seed: 's', now: NOW + day * DAY }, content);
      assert.equal(talk.talk.story, true);
      companion = talk.companion;
    }
    assert.equal(toldPieces(companion, content).length, pieces.length);
    assert.equal(talkWith(companion, { seed: 's', now: NOW + 20 * DAY }, content).talk.story, false);
  });

  test('every text of the talks reads whole for a woman and for a man', () => {
    for (const line of [...tuning.talks.stories.flat(), ...Object.values(tuning.talks.chatter).flat()]) {
      for (const appearance of ['female', 'male']) assert.doesNotMatch(gendered(line, appearance), /[[\]|]/, line);
    }
    assert.equal(gendered('[Winna|Winien] jestem.', 'female'), 'Winna jestem.');
    assert.equal(gendered('[Winna|Winien] jestem.', 'male'), 'Winien jestem.');
  });
});

// Words of the day by the standing of the relation (the author: "wygeneruj
// więcej opcji rozmów na różne stopnie dla towarzyszy"): a companion between
// the pieces of its story says one of its standing's words, now and then
// (lowerChance) one of the standing just below.
describe('the words of the day by the standing', () => {
  const { chatter, lowerChance } = tuning.talks;
  // The content with another lowerChance: 0 for words of the companion's own
  // standing only, 1 for words of the standing below.
  const withLowerChance = (chance) => ({ ...content, settlement: { ...content.settlement, companions: { ...tuning, talks: { ...tuning.talks, lowerChance: chance } } } });
  // A companion at the standing `index` that has told every piece of its
  // story the standing allows, so each talk is a word of the day.
  const atStanding = (index, appearance) => ({ ...candidate, appearance, relation: standings[index].points, told: index + 1 });
  const heard = (companion, days, data = content) => Array.from({ length: days }, (_, day) => talkWith(companion, { seed: 'words', now: NOW + day * DAY }, data).talk);
  const words = (index, appearance) => chatter[standings[index].id].map((line) => gendered(line, appearance));

  test('a companion at each standing hears a word of that standing', () => {
    const own = withLowerChance(0);
    standings.forEach((standing, index) => {
      for (const appearance of ['female', 'male']) {
        const talks = heard(atStanding(index, appearance), 40, own);
        for (const talk of talks) {
          assert.equal(talk.story, false, standing.id);
          assert.ok(words(index, appearance).includes(talk.text), `${standing.id}: ${talk.text}`);
          assert.equal(talk.points, tuning.relation.talk);
        }
        // Picked by the day, so the words change.
        assert.ok(new Set(talks.map((talk) => talk.text)).size >= 10, standing.id);
      }
    });
  });

  test('now and then a word of the standing just below, never of another', () => {
    standings.forEach((standing, index) => {
      const talks = heard(atStanding(index, 'male'), 400);
      const fromBelow = talks.filter((talk) => !words(index, 'male').includes(talk.text));
      for (const talk of fromBelow) assert.ok(index > 0 && words(index - 1, 'male').includes(talk.text), `${standing.id}: ${talk.text}`);
      if (index > 0) assert.ok(Math.abs(fromBelow.length / talks.length - lowerChance) < 0.08, `${standing.id}: ${fromBelow.length} z ${talks.length}`);
    });
    // Always from below above the first standing, and never below the first.
    const below = withLowerChance(1);
    for (const talk of heard(atStanding(4, 'female'), 20, below)) assert.ok(words(3, 'female').includes(talk.text), talk.text);
    for (const talk of heard(atStanding(0, 'female'), 20, below)) assert.ok(words(0, 'female').includes(talk.text), talk.text);
  });

  test('the same seed, companion and day give the same word', () => {
    const companion = atStanding(2, 'female');
    const say = (now, seed = 'words', one = companion) => talkWith(one, { seed, now }, content).talk.text;
    for (let day = 0; day < 10; day += 1) {
      const morning = NOW + day * DAY;
      assert.equal(say(morning), say(morning));
      // Later the same day.
      assert.equal(say(morning + 3 * 3600000), say(morning));
    }
    // Other days, seeds and companions bring other words.
    assert.ok(new Set(Array.from({ length: 10 }, (_, day) => say(NOW + day * DAY))).size > 1);
    assert.ok(new Set(Array.from({ length: 10 }, (_, n) => say(NOW, `seed-${n}`))).size > 1);
    assert.ok(new Set(Array.from({ length: 10 }, (_, n) => say(NOW, 'words', { ...companion, id: `c${n}` }))).size > 1);
  });

  test('the forms for a woman and a man resolve in the talk', () => {
    for (const line of Object.values(chatter).flat()) {
      const [female, male] = ['female', 'male'].map((appearance) => gendered(line, appearance));
      assert.doesNotMatch(female, /[[\]|]/, line);
      assert.doesNotMatch(male, /[[\]|]/, line);
      // A line with forms reads differently for her and for him.
      if (line.includes('[')) assert.notEqual(female, male, line);
    }
    // The same day, a companion and a companion of the other sex say the
    // same line, each in its own form: at each standing, a day with forms.
    standings.forEach((standing, index) => {
      const lines = [...chatter[standing.id], ...(index > 0 ? chatter[standings[index - 1].id] : [])];
      const her = heard(atStanding(index, 'female'), 100);
      const him = heard(atStanding(index, 'male'), 100);
      let withForms = 0;
      her.forEach((talk, day) => {
        const line = lines.find((one) => gendered(one, 'female') === talk.text && gendered(one, 'male') === him[day].text);
        assert.ok(line, `${standing.id}: ${talk.text} / ${him[day].text}`);
        if (line.includes('[')) withForms += 1;
      });
      assert.ok(withForms > 0, standing.id);
    });
  });
});

describe('talks with a companion through the API', () => {
  const { call, db, signUp } = useServer({ PROFESSIONS: 'on', CRAFTING: 'on', SETTLEMENT: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('rozmowa'));
    await call('POST', '/api/character', { cookie, body: { name: 'Rozmowa', classId: 'warrior', appearance: 'female' } });
    const database = await db();
    await database.prepare('UPDATE characters SET level = 25, class_level = 25, gold = 100000').run();
    await database.prepare("INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) SELECT id, 'quarters', 2, 0, 0 FROM characters").run();
  });

  const settlement = async () => (await call('GET', '/api/settlement', { cookie })).data.settlement;

  test('"Porozmawiaj" once a day: it tells a piece of its story, the relation grows, and the card keeps what it told', async () => {
    const [first] = (await settlement()).companions.candidates;
    await call('POST', '/api/settlement/hire', { cookie, body: { candidateId: first.id } });
    let hired = (await settlement()).companions.hired[0];
    // The companions' own names of the standings, in its form (5.11.2026).
    const named = (index) => gendered(tuning.relation.standings[index], first.appearance);
    assert.deepEqual([hired.bond.standing, hired.bond.points, hired.bond.told, hired.bond.talked], [named(0), 0, [], false]);
    const talked = await call('POST', '/api/settlement/talk', { cookie, body: { companionId: first.id } });
    assert.equal(talked.status, 200, JSON.stringify(talked.data));
    assert.equal(talked.data.talk.story, true);
    hired = talked.data.settlement.companions.hired[0];
    assert.deepEqual([hired.bond.points, hired.bond.told, hired.bond.talked], [tuning.relation.talk, [talked.data.talk.text], true]);
    // Once a day.
    const again = await call('POST', '/api/settlement/talk', { cookie, body: { companionId: first.id } });
    assert.equal(again.data.error.code, 'talked');
    assert.equal((await call('POST', '/api/settlement/talk', { cookie, body: { companionId: 'nikt' } })).data.error.code, 'no_companion');
    // An exploration together brings the relation too.
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    await (await db()).prepare('UPDATE activities SET started_at = started_at - ?, ends_at = ends_at - ?').bind(300000, 300000).run();
    assert.equal((await call('POST', '/api/hunts/claim', { cookie })).status, 200);
    hired = (await settlement()).companions.hired[0];
    assert.equal(hired.bond.points, tuning.relation.talk + bondPoints(5, content));
    assert.deepEqual(hired.bond.next, { name: named(1), points: standings[1].points });
  });

  // The Walka screen asks for the threat again when its key changes
  // (buildKey in screens/combat.js), and the companions who would go along
  // fight in it: the character view marks them (the code review,
  // 13.11.2026: a hire, a dismissal, a wound or a closer bond kept the
  // threat of before until the screen was opened again).
  test('the character view marks the companions who would go along, and the mark changes with them', async () => {
    const mark = async () => (await call('GET', '/api/character', { cookie })).data.character.companionsKey;
    const companion = (path, value) => db().then((database) => database.prepare(`UPDATE characters SET settlement = json_set(settlement, '$.companions[0].${path}', json(?))`).bind(JSON.stringify(value)).run());
    assert.equal(await mark(), null);
    const [first] = (await settlement()).companions.candidates;
    assert.equal((await call('POST', '/api/settlement/hire', { cookie, body: { candidateId: first.id } })).status, 200);
    const hired = await mark();
    assert.equal(typeof hired, 'string');
    // The same companions, the same mark.
    assert.equal(await mark(), hired);
    // A closer bond, a standing up: a stronger companion in a fight.
    await companion('relation', standings[1].points);
    const closer = await mark();
    assert.notEqual(closer, hired);
    // Wounded, it stays home until the character has rested to full HP.
    await (await db()).prepare('UPDATE characters SET hp = 1, hp_at = ?').bind(Date.now()).run();
    await companion('wounded', true);
    assert.equal(await mark(), null);
    await companion('wounded', false);
    assert.equal(await mark(), closer);
    // Dismissed, it goes no more.
    assert.equal((await call('POST', '/api/settlement/dismiss', { cookie, body: { companionId: first.id } })).status, 200);
    assert.equal(await mark(), null);
  });
});

// The fifth evolution ("Piąta ewolucja klas", 1235): at class level 400 each
// of the 15 fourth forms grows into one further form, where the deployment
// has the fifth forms on (FIFTH_EVOLUTION, with FOURTH_EVOLUTION and
// THIRD_EVOLUTION; off in the live game until their art is done). The class
// waits there until the form is taken, the form's skills take every Skill
// Point back and grow to level 245, the names have a woman's form, the
// Pustelnik changes it with the other paths' fifth forms, every new skill and
// trait works in fights as its words say, and a fifth form is at least as
// strong as its fourth form on explorations while the 15 stay close to each
// other in the Arena.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  applyHunt,
  buildContent,
  classNameOf,
  computeStats,
  createRng,
  evolutionArt,
  evolutionBlock,
  evolutionChanges,
  evolutionName,
  evolutionPanel,
  evolveBlock,
  evolvedSkills,
  monsterCombatant,
  nextFormOf,
  playerCombatant,
  raiseBlock,
  simulateFight,
  skillParams,
  skillPoints,
  skillsView,
} from '../src/engine/index.js';
import { measureClass } from '../tools/class-balance-sim.mjs';
import { measure } from '../tools/pvp-arena-sim.mjs';
import { typicalCharacter } from '../tools/simulate.mjs';
import { loadData } from '../tools/validate-data.mjs';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const FORMS = [
  'unstoppable', 'gods-champion', 'world-shield', 'star-lord', 'perun-son', 'hunt-god', 'demiurge', 'winter-incarnate',
  'wilds-father', 'seraph', 'heaven-sword', 'all-seeing', 'soul-lord', 'navia-emperor', 'dark-king',
];
const fourths = content.evolutions.filter((evolution) => evolution.stage === 4);
const fifths = content.evolutions.filter((evolution) => evolution.stage === 5);

// The game's data without the fifth forms (as a deployment has it with
// FIFTH_EVOLUTION "off").
const fourthOnly = (() => {
  const raw = loadData();
  const fifthIds = new Set(fifths.map((evolution) => evolution.id));
  raw.evolutions.evolutions = raw.evolutions.evolutions.filter((evolution) => !fifthIds.has(evolution.id));
  raw.evolutions.skills = raw.evolutions.skills.filter((skill) => !fifthIds.has(skill.evolution));
  return buildContent(raw);
})();

// The balance of the fifth forms was set with the curve without the late
// levels' slowdown (a character of level 345 is of class level 412, 350 of
// 417 and 380 of 451), against the creatures as the fourth forms were tuned
// with (the fourth evolution's test): the forms are compared with each other,
// not with the newest creatures, which change with every new land.
const tuned = (data) => ({
  ...data,
  balance: {
    ...data.balance,
    progression: { ...data.balance.progression, lateLevels: undefined },
    rewards: { ...data.balance.rewards, lateRewards: undefined },
    monsters: { ...data.balance.monsters, mythGame: { ...data.balance.monsters.mythGame, damage: 0, hp: 0 }, classLevelCurve: [], newestPlace: null },
  },
});

// A Burzyciel at a class level, its skills at their top by default.
const ravager = (classLevel, skills = { carnage: 195, breach: 195 }, extra = {}) => ({
  classId: 'warrior',
  level: 350,
  xp: 0,
  classLevel,
  classXp: 0,
  points: {},
  appearance: 'male',
  evolution: 'ravager',
  skills,
  ...extra,
});
const unstoppable = (classLevel, skills) => ravager(classLevel, skills, { evolution: 'unstoppable' });

describe('the fifth evolution in the engine', () => {
  test('each fourth form grows into exactly one fifth form of its class, with its names and description', () => {
    assert.equal(fourths.length, 15);
    assert.deepEqual(fourths.map((form) => nextFormOf(form, content).id), FORMS);
    for (const form of fifths) {
      const fourth = content.evolutionsById[form.from];
      assert.equal(form.classId, fourth.classId, form.id);
      assert.equal(form.stage, 5, form.id);
      assert.ok(form.description, form.id);
      // Its first skill grows one of the fourth form's, the other is new;
      // the Ojciec Puszczy's both grow the Pradruid's, so the summons stay
      // "2×2" (1221 A, 1235.9).
      assert.ok(fourth.skills.includes(content.skillsById[form.skills[0]].from), form.id);
      if (form.id === 'wilds-father') assert.equal(content.skillsById[form.skills[1]].from, 'ancient-herd');
      else assert.ok(!content.skillsById[form.skills[1]].from, form.id);
      for (const id of form.skills) {
        assert.equal(content.skillsById[id].maxLevel, 245, id);
        assert.equal(content.skillsById[id].classLevel, 400, id);
      }
      // The growth of the fourth form, and 1 more in the main stat and in
      // Witalność (1235.0).
      const main = Object.keys(fourth.growth)[0];
      for (const [stat, value] of Object.entries(fourth.growth)) {
        assert.equal(form.growth[stat], value + (stat === main || stat === 'vitality' ? 1 : 0), `${form.id} ${stat}`);
      }
    }
    // The approved names (1235.1–1235.15), a man's and a woman's.
    assert.deepEqual(fifths.map((form) => form.name), [
      'Niepowstrzymany', 'Czempion Bogów', 'Tarcza Świata', 'Pan Gwiazd', 'Syn Peruna', 'Bóg Łowów', 'Demiurg', 'Wcielenie Zimy',
      'Ojciec Puszczy', 'Serafin', 'Miecz Niebios', 'Wszechwidzący', 'Pan Dusz', 'Cesarz Nawii', 'Król Ciemności',
    ]);
    assert.deepEqual(fifths.map((form) => evolutionName(form, 'female')), [
      'Niepowstrzymana', 'Czempionka Bogów', 'Tarcza Świata', 'Pani Gwiazd', 'Córka Peruna', 'Bogini Łowów', 'Demiurg', 'Wcielenie Zimy',
      'Matka Puszczy', 'Serafina', 'Miecz Niebios', 'Wszechwidząca', 'Pani Dusz', 'Cesarzowa Nawii', 'Królowa Ciemności',
    ]);
    // The skills' names (1235.1–1235.15), the grown one first.
    assert.deepEqual(fifths.map((form) => form.skills.map((id) => content.skillsById[id].name)), [
      ['Spustoszenie', 'Ostatni szał'], ['Huragan bogów', 'Triumf'], ['Gniew ziemi', 'Ostoja'], ['Kometa', 'Gwiazdozbiór'],
      ['Strzały Peruna', 'Oko burzy'], ['Biała wataha', 'Zew tura'], ['Początek świata', 'Narodziny słońca'], ['Wielki mróz', 'Płaszcz zimy'],
      ['Odwieczny gaj', 'Odwieczne stado'], ['Sześć skrzydeł', 'Tchnienie życia'], ['Ognisty miecz', 'Zastęp niebios'], ['Przeznaczenie', 'Księga losu'],
      ['Ostatnie żniwo', 'Lament dusz'], ['Wieczny legion', 'Pomór'], ['Tysiąc cieni', 'Noc bez gwiazd'],
    ]);
  });

  test('the class waits at 400 while a Skill Point is left, then until the fifth form is taken; after it at 500 only for points', () => {
    assert.deepEqual(evolutionBlock(ravager(399, { carnage: 195, breach: 180 }), content), { code: 'skill_points', level: 400 });
    assert.deepEqual(evolutionBlock(ravager(400, { carnage: 195, breach: 194 }), content), { code: 'skill_points', level: 400 });
    assert.deepEqual(evolutionBlock(ravager(400), content), { code: 'evolve', level: 400 });
    // A class already past 400 (it grew on before the fifth forms) waits for
    // nothing and takes its form at once.
    assert.equal(evolutionBlock(ravager(430), content), null);
    assert.equal(evolveBlock(ravager(430), 'unstoppable', content), null);
    // The exploration holds the class at 400, and its XP adds up.
    const hunt = { xp: 1e14, result: 'success', timePoints: 0 };
    const held = applyHunt(ravager(400), hunt, content);
    assert.equal(held.classLevel, 400);
    assert.ok(held.classXp > 0);
    assert.ok(held.messages.some((line) => line.includes('u progu ewolucji')));
    // With the form the class grows on to 500, the last class level, and
    // waits there while a point is left (the sixth evolution, 1236, comes
    // later).
    assert.equal(applyHunt(unstoppable(400, { devastation: 1, 'last-frenzy': 0 }), hunt, content).classLevel, 500);
    assert.deepEqual(evolutionBlock(unstoppable(500, { devastation: 245, 'last-frenzy': 244 }), content), { code: 'skill_points', level: 500 });
    assert.equal(evolutionBlock(unstoppable(500, { devastation: 245, 'last-frenzy': 245 }), content), null);
    // Without the fifth forms the fourth form waits at 400 only for points.
    assert.equal(nextFormOf(fourthOnly.evolutionsById.ravager, fourthOnly), null);
    assert.equal(evolutionBlock(ravager(400), fourthOnly), null);
  });

  test('the fifth form asks for its fourth form, class level 400 and the points spent; the test lifts the level', () => {
    assert.equal(evolveBlock(ravager(399), 'unstoppable', content).code, 'class_level');
    assert.match(evolveBlock(ravager(399), 'unstoppable', content).message, /400\. poziomie klasy/);
    assert.equal(evolveBlock(ravager(400, { carnage: 195, breach: 100 }), 'unstoppable', content).code, 'skill_points');
    assert.equal(evolveBlock(ravager(400), 'gods-champion', content).code, 'unknown_evolution');
    assert.equal(evolveBlock(ravager(400, { 'smashing-blow': 145, slaughter: 145 }, { evolution: 'horde-slayer' }), 'unstoppable', content).code, 'unknown_evolution');
    assert.equal(evolveBlock(unstoppable(400, {}), 'unstoppable', content).code, 'evolved');
    assert.equal(evolveBlock(ravager(250, { carnage: 3 }), 'unstoppable', content, { test: true }), null);
    assert.equal(evolveBlock(ravager(400), 'unstoppable', content), null);
  });

  test('taking it: the two skills at 0 with the 390 points back, class levels 400–499 bring 100 more, up to level 245 each', () => {
    const taken = unstoppable(400, evolvedSkills('unstoppable', content));
    assert.deepEqual(taken.skills, { devastation: 0, 'last-frenzy': 0 });
    assert.deepEqual(skillPoints(taken, content), { earned: 391, spent: 0, free: 391 });
    assert.equal(skillPoints({ ...taken, classLevel: 499 }, content).earned, 490);
    assert.equal(skillPoints({ ...taken, classLevel: 500 }, content).earned, 490);
    assert.equal(raiseBlock({ ...taken, classLevel: 499, skills: { devastation: 244, 'last-frenzy': 0 } }, 'devastation', content), null);
    assert.equal(raiseBlock({ ...taken, classLevel: 499, skills: { devastation: 245, 'last-frenzy': 0 } }, 'devastation', content).code, 'max_level');
    const view = skillsView(taken, content);
    assert.deepEqual(view.pools[0].options.map((skill) => [skill.name, skill.state, skill.maxLevel]), [
      ['Spustoszenie', 'main', 245],
      ['Ostatni szał', 'second', 245],
    ]);
    assert.equal(view.lastPointLevel, 499);
    assert.deepEqual(view.evolution, { level: 500, need: 'skill_points' });
    // At the level the 390 points bring it to at once (195 each), a grown
    // skill strikes, heals and calls at least as strongly as its root at the
    // top level (a summon's HP and blows counted for all it calls at once;
    // Tysiąc cieni, grown from a strike into a sweep, by its blow at a lone
    // foe).
    for (const form of fifths) {
      for (const id of form.skills) {
        const grown = content.skillsById[id];
        if (!grown.from) continue;
        const rootSkill = content.skillsById[grown.from];
        const root = skillParams(rootSkill, 195, content);
        const now = skillParams(grown, 195, content);
        const calledNow = now.pack?.length ?? Math.round(now.count ?? 1);
        const calledRoot = root.pack?.length ?? Math.round(root.count ?? 1);
        for (const key of ['power', 'single', 'heal', 'hp']) {
          if (typeof root[key] !== 'number') continue;
          const mine = rootSkill.kind === 'strike' && grown.kind === 'sweep' && key === 'power' ? now.single : now[key];
          const many = key === 'hp' || key === 'power';
          const counted = many && grown.kind === 'summon' ? mine * calledNow : mine;
          const rooted = many && rootSkill.kind === 'summon' ? root[key] * calledRoot : root[key];
          assert.ok(counted >= rooted - 1e-9, `${grown.id} ${key}: ${counted} vs ${grown.from} ${rooted}`);
        }
      }
    }
  });

  test('the stats grow by each form over its span and by the fifth form from 401', () => {
    const at = (classLevel, evolution) => computeStats({ classId: 'warrior', level: 350, classLevel, points: {}, evolution }, [], content).totals;
    assert.equal(at(400, 'unstoppable').strength, at(400, 'ravager').strength);
    assert.equal(at(420, 'unstoppable').strength - at(420, 'ravager').strength, 20);
    assert.equal(at(420, 'unstoppable').vitality - at(420, 'ravager').vitality, 20);
  });

  test('a woman goes by the form\'s woman\'s name wherever the class name shows', () => {
    const female = { ...unstoppable(400, evolvedSkills('unstoppable', content)), appearance: 'female' };
    assert.equal(classNameOf(female, content), 'Niepowstrzymana');
    assert.equal(classNameOf({ ...female, appearance: 'male' }, content), 'Niepowstrzymany');
    assert.equal(classNameOf({ ...female, classId: 'shadow', evolution: 'navia-emperor' }, content), 'Cesarzowa Nawii');
    assert.equal(classNameOf({ ...female, classId: 'warrior', evolution: 'world-shield' }, content), 'Tarcza Świata');
    assert.equal(skillsView(female, content).pools[0].options[0].path, 'Niepowstrzymana');
  });

  test('the panel shows the one form to take at 400 once the points are spent, and the class level 500 after it', () => {
    const before = evolutionPanel(ravager(399), content);
    assert.deepEqual([before.current.id, before.next, before.nextLevel], ['ravager', null, 400]);
    assert.equal(evolutionPanel(ravager(400, { carnage: 195, breach: 190 }), content).next, null);
    const ready = evolutionPanel(ravager(400), content);
    assert.deepEqual(ready.choices, []);
    assert.equal(ready.next.id, 'unstoppable');
    assert.equal(ready.next.stage, 5);
    assert.equal(ready.next.skillLevel, 245);
    assert.equal(ready.next.fromName, 'Burzyciel');
    assert.equal(ready.next.skills[0].from, 'Pogrom');
    assert.equal(ready.next.skills[1].from, null);
    assert.equal(ready.next.trait.name, 'Gniew wulkanu');
    const after = evolutionPanel(unstoppable(400, {}), content);
    assert.deepEqual([after.current.id, after.next, after.nextLevel], ['unstoppable', null, null]);
  });

  test('the Pustelnik changes a fifth form for another path\'s fifth form', () => {
    assert.deepEqual(evolutionChanges({ classId: 'warrior', evolution: 'unstoppable' }, content).map((evolution) => evolution.id), ['gods-champion', 'world-shield']);
    assert.deepEqual(evolutionChanges({ classId: 'mage', evolution: 'wilds-father' }, content).map((evolution) => evolution.id), ['demiurge', 'winter-incarnate']);
  });

  test('until they have their own art, a fifth form stands in with its fourth form\'s, and its skills with the fourth form\'s', () => {
    const art = evolutionArt(content);
    for (const form of fifths) assert.equal(art.forms[form.id], form.from);
    assert.deepEqual(art.skills.devastation.slice(0, 1), ['carnage']);
    assert.deepEqual(art.skills['last-frenzy'].slice(0, 1), ['breach']);
    // The Ojciec Puszczy's both skills grow the Pradruid's.
    assert.deepEqual(art.skills['eternal-herd'].slice(0, 1), ['ancient-herd']);
  });
});

describe('the fifth forms in fights', () => {
  // A character of a fifth form (level 350, class level 420) with the form's
  // skills at `skillLevel` (`only`: just these of them).
  function form(evolutionId, { skillLevel = 200, only, classLevel = 420, level = 350, hpShare, id = 'a0', position, extra = {} } = {}) {
    const evolution = content.evolutionsById[evolutionId];
    const { character, equipped } = typicalCharacter(evolution.classId, level, content);
    const skills = Object.fromEntries(evolution.skills.filter((skill) => !only || only.includes(skill)).map((skill) => [skill, skillLevel]));
    const unit = playerCombatant({ character: { ...character, classLevel, skills, evolution: evolutionId }, equipped, name: evolution.name, id }, content);
    return { ...unit, ...(position && { position }), ...(hpShare !== undefined && { hp: Math.round(unit.maxHp * hpShare) }), ...extra };
  }
  const withParam = (unit, skillId, key, value) => ({ ...unit, skills: unit.skills.map((skill) => (skill.id === skillId ? { ...skill, params: { ...skill.params, [key]: value } } : skill)) });
  const withFeat = (unit, key, value) => ({ ...unit, feat: { ...unit.feat, [key]: value } });
  const paramOf = (unit, skillId, key) => unit.skills.find((skill) => skill.id === skillId).params[key];
  const LEVEL = 348;
  const foe = (monsterId, id, extra = {}) => ({ ...monsterCombatant({ monsterId, level: LEVEL, id }, content), ...extra });
  // A sturdy foe lasts a long fight and strikes softly.
  const sturdy = (monsterId, id, extra = {}) => {
    const unit = foe(monsterId, id);
    return { ...unit, hp: 900000, maxHp: 900000, damageScale: unit.damageScale * 0.25, ...extra };
  };
  const fight = (seed, allies, enemies) => simulateFight({ allies, enemies, rng: createRng(seed), content, record: true });
  const BLOWS = ['hit', 'crit'];
  const blowsOf = (result, actor) => result.events.filter((event) => event.actor === actor && BLOWS.includes(event.kind));
  const many = (count, seed, run) => Array.from({ length: count }, (_, index) => run(`${seed}:${index}`));
  const near = (actual, expected, margin, told) => assert.ok(Math.abs(actual - expected) < margin, `${told}: ${actual} vs ${expected}`);
  const line = () => [sturdy('boar', 'e0'), sturdy('crow', 'e1'), sturdy('wolf', 'e2')];
  const texts = (result) => result.events.map((event) => event.text ?? '');

  test('Gniew wulkanu: a fatal blow leaves the Niepowstrzymany standing, and for three moves nothing fells or stops it; it heals from its blows at any HP; Ostatni szał wakes below half its HP', () => {
    const brute = foe('wolf', 'e0', { damageScale: foe('wolf', 'e0').damageScale * 6, weapon: { ...foe('wolf', 'e0').weapon, stun: { chance: 1, label: 'ogłuszony' } }, hp: 900000, maxHp: 900000 });
    const result = fight('wulkan', [form('unstoppable', { only: [], hpShare: 0.05 })], [brute]);
    const stand = result.events.findIndex((event) => /Śmierć musi poczekać/.test(event.text ?? ''));
    assert.ok(stand >= 0, texts(result).join('\n'));
    // Its next three own blows come before any fall, and no stun takes its
    // moves meanwhile.
    const after = result.events.slice(stand + 1);
    const fall = after.findIndex((event) => event.kind === 'kill' && event.target === 'a0');
    const window = fall >= 0 ? after.slice(0, fall) : after;
    assert.ok(window.filter((event) => event.actor === 'a0' && BLOWS.concat('dodge').includes(event.kind) && !event.pierced).length >= 3);
    const ownMoves = [];
    for (const event of window) if (event.actor === 'a0' && BLOWS.concat('dodge').includes(event.kind) && !event.pierced && !ownMoves.includes(event.t)) ownMoves.push(event.t);
    const third = ownMoves[2];
    assert.ok(!window.some((event) => event.kind === 'stun' && event.target === 'a0' && event.t < third), 'stunned in its last stand');
    // At 80% HP (above the Burzyciel's 40%) it heals from its blows.
    const healthy = fight('wulkan-zdrowy', [form('unstoppable', { only: [], hpShare: 0.8 })], line());
    assert.ok(healthy.events.some((event) => event.kind === 'drain' && event.actor === 'a0' && /z zadanej rany/.test(event.text)));
    // It wakes only once a blow has left the character below half its HP.
    const calmUnit = form('unstoppable', { only: ['last-frenzy'] });
    const calm = fight('szal', [calmUnit], line());
    const woke = calm.events.findIndex((event) => event.skill === 'last-frenzy');
    const lastHp = woke >= 0 ? calm.events.slice(0, woke).filter((event) => event.target === 'a0' && typeof event.hp === 'number').at(-1) : null;
    assert.ok(woke < 0 || (lastHp && lastHp.hp < 0.5 * calmUnit.maxHp), JSON.stringify(lastHp));
    const wounded = fight('szal', [form('unstoppable', { only: ['last-frenzy'], hpShare: 0.4 })], line());
    assert.match(wounded.events.find((event) => event.skill === 'last-frenzy').text, /leczy się o \d+% zadanych obrażeń/);
  });

  test('Boska chwała: every foe that falls heals the whole party; Huragan bogów turns three times; Triumf strengthens the party for every fallen foe', () => {
    const result = fight('chwala', [form('gods-champion', { only: [] }), form('ravager', { only: [], id: 'a1', hpShare: 0.5 })], [foe('wolf', 'e0', { hp: 1 }), sturdy('boar', 'e1')]);
    assert.ok(result.events.some((event) => event.kind === 'drain' && event.target === 'a1' && /Tłum wiwatuje/.test(event.text)), texts(result).join('\n'));
    // A party member strikes harder once a foe has fallen: twin fights, with
    // and without the trait shared.
    const firstOnBoar = (champion) => {
      const one = fight('chwala-druzyna', [champion, form('ravager', { only: [], id: 'a1' })], [foe('wolf', 'e0', { hp: 1 }), sturdy('stone-knight', 'e1', { speed: 1 })]);
      return one.events.find((event) => event.actor === 'a1' && event.target === 'e1' && BLOWS.includes(event.kind) && !event.pierced && one.events.some((kill) => kill.kind === 'kill' && kill.target === 'e0' && kill.t <= event.t));
    };
    const shared = firstOnBoar(form('gods-champion', { only: [] }));
    const own = firstOnBoar(withFeat(form('gods-champion', { only: [] }), 'party', false));
    if (shared && own && shared.kind === own.kind) near(shared.damage / own.damage, 1.15, 0.03, 'Boska chwała');
    const spun = fight('huragan', [form('gods-champion', { only: ['gods-hurricane'] })], line());
    assert.ok(spun.events.some((event) => event.skill === 'gods-hurricane' && /trzeci obrót/.test(event.text)));
    const cheered = fight('triumf', [form('gods-champion', { only: ['triumph'] })], line());
    assert.match(cheered.events.find((event) => event.skill === 'triumph').text, /za każdego pokonanego wroga/);
  });

  test('Mury świata: while the Tarcza Świata stands its whole party takes less; Ostoja shields the party; Gniew ziemi may stun any foe', () => {
    const firstOnFriend = (shield) => {
      const one = fight('mury', [withFeat(shield, 'intercept', 0), form('all-seeing', { only: [], id: 'a1', position: 'back' })], [sturdy('wolf', 'e0')]);
      return one.events.find((event) => event.actor === 'e0' && event.target === 'a1' && BLOWS.includes(event.kind));
    };
    const shield = form('world-shield', { only: [], position: 'front' });
    const sheltered = firstOnFriend(shield);
    const bare = firstOnFriend(withFeat(shield, 'aura', 0));
    assert.ok(sheltered && bare);
    if (sheltered.kind === bare.kind) near(sheltered.damage / bare.damage, 1 - shield.feat.aura, 0.03, 'Mury świata');
    const raised = fight('ostoja', [form('world-shield', { only: ['stronghold'] }), form('all-seeing', { only: [], id: 'a1' })], line());
    assert.match(raised.events.find((event) => event.skill === 'stronghold').text, /mniej obrażeń i ma tarczę/);
    const stunned = new Set(many(6, 'gniew-ziemi', (seed) => fight(seed, [form('world-shield', { only: ['earth-wrath'] })], line())).flatMap((one) => one.events.filter((event) => event.kind === 'stun' && event.skill === 'earth-wrath').map((event) => event.target)));
    assert.ok(stunned.size >= 2, [...stunned].join());
  });

  test('Siedem gwiazd: the shots pass a share of every armour; Gwiazdozbiór shoots every foe each move and never misses; Kometa is always critical and sets its target on fire', () => {
    const archer = form('star-lord', { only: [] });
    const firstBlow = (unit) => blowsOf(fight('gwiazdy', [unit], [sturdy('stone-knight', 'e0')]), 'a0')[0];
    const piercing = firstBlow(archer);
    const plain = firstBlow(withFeat(archer, 'armorIgnore', 0));
    assert.equal(piercing.kind, plain.kind);
    assert.ok(piercing.damage > plain.damage, `${piercing.damage} vs ${plain.damage}`);
    const sky = fight('gwiazdozbior', [form('star-lord', { only: ['constellation'] })], [sturdy('boar', 'e0', { dodgeRating: 1e9 }), sturdy('crow', 'e1', { dodgeRating: 1e9 }), sturdy('wolf', 'e2', { dodgeRating: 1e9 })]);
    const volley = sky.events.findIndex((event) => /gwiazdy strzelają/.test(event.text ?? ''));
    assert.ok(volley >= 0);
    const shots = sky.events.slice(volley + 1).filter((event) => event.skill === 'constellation' && event.t === sky.events[volley].t);
    assert.deepEqual(new Set(shots.map((event) => event.target)), new Set(['e0', 'e1', 'e2']));
    assert.ok(shots.every((event) => BLOWS.includes(event.kind)));
    const comet = fight('kometa', [form('star-lord', { only: ['comet'] })], line());
    const shot = comet.events.find((event) => event.skill === 'comet' && BLOWS.includes(event.kind));
    assert.equal(shot.kind, 'crit');
    assert.ok(comet.events.some((event) => event.kind === 'effect' && event.target === shot.target && /Oparzenie/.test(event.effect)));
  });

  test('Krew Peruna: every leap of the spark slows its foe; Oko burzy strengthens the Syn Peruna and its storm strikes every foe', () => {
    const leaps = many(8, 'krew', (seed) => fight(seed, [form('perun-son', { only: [] })], line())).flatMap((result) =>
      result.events.flatMap((event, index) => (/Piorun z grotu przeskakuje dalej/.test(event.text ?? '') && event.hp > 0 ? [[event, result.events[index + 1]]] : [])),
    );
    assert.ok(leaps.length > 0);
    assert.ok(leaps.every(([leap, after]) => after?.kind === 'slow' && after.targets[0] === leap.target), JSON.stringify(leaps.slice(0, 2)));
    const storm = fight('oko', [form('perun-son', { only: ['storm-eye'] })], line());
    assert.match(storm.events.find((event) => event.skill === 'storm-eye').text, /oku burzy/);
    const strike = storm.events.findIndex((event) => /burza bije we wrogów/.test(event.text ?? ''));
    const struck = storm.events.slice(strike + 1).filter((event) => event.skill === 'storm-eye' && event.t === storm.events[strike].t && BLOWS.concat('dodge').includes(event.kind));
    assert.deepEqual(new Set(struck.map((event) => event.target)), new Set(['e0', 'e1', 'e2']));
  });

  test('Prawo łowów: the whole party strikes beasts harder; Biała wataha calls three white wolves; the aurochs of Zew tura charges the foe in front and stuns it', () => {
    const firstOnBeast = (hunter) => blowsOf(fight('lowy', [hunter, form('ravager', { only: [], id: 'a1' })], [sturdy('boar', 'e0', { speed: 1 })]), 'a1').find((event) => !event.pierced);
    const hunter = form('hunt-god', { only: [] });
    const shared = firstOnBeast(hunter);
    const own = firstOnBeast(withFeat(hunter, 'party', false));
    if (shared.kind === own.kind) near(shared.damage / own.damage, 1 + hunter.feat.damage, 0.03, 'Prawo łowów');
    const pack = fight('wataha', [form('hunt-god', { only: ['white-pack'] })], line());
    const call = pack.events.find((event) => event.skill === 'white-pack' && event.kind === 'summon' && event.state === 'up');
    assert.equal(call.count, 3);
    const aurochs = fight('tur', [form('hunt-god', { only: ['aurochs-call'] })], line());
    const charge = aurochs.events.findIndex((event) => event.skill === 'aurochs-call' && /Tur szarżuje/.test(event.text ?? ''));
    assert.ok(charge > 0);
    if (aurochs.events[charge].kind !== 'dodge') assert.deepEqual([aurochs.events[charge + 1].kind, aurochs.events[charge + 1].target], ['stun', aurochs.events[charge].target]);
  });

  test('Moc stworzenia: every spell strikes with the element the foe is weakest to; Narodziny słońca burn the strongest foe every move', () => {
    const weak = (monsterId, id) => sturdy(monsterId, id, { weak: { earth: 1 } });
    const genesis = fight('poczatek', [form('demiurge', { only: ['world-genesis'] })], [weak('boar', 'e0'), weak('crow', 'e1'), weak('wolf', 'e2')]);
    const blows = genesis.events.filter((event) => event.skill === 'world-genesis' && BLOWS.includes(event.kind));
    assert.ok(blows.length > 0 && blows.every((event) => /Słaby punkt \(ziemia\)/.test(event.text)), blows.map((event) => event.text).join('\n'));
    const sun = fight('slonce', [form('demiurge', { only: ['sunbirth'] })], [sturdy('boar', 'e0', { hp: 500000 }), sturdy('crow', 'e1'), sturdy('wolf', 'e2', { hp: 600000 })]);
    const rays = sun.events.filter((event) => event.skill === 'sunbirth' && BLOWS.includes(event.kind)).slice(0, 2);
    assert.ok(rays.length >= 1 && rays.every((event) => event.target === 'e1'), JSON.stringify(rays.map((event) => event.target)));
    assert.ok(sun.events.some((event) => event.kind === 'effect' && event.target === 'e1' && /Oparzenie/.test(event.effect)));
  });

  test('Odwieczna zima: every chilled foe freezes a little at each of its moves; Wielki mróz locks three foes; Płaszcz zimy slows whoever strikes the shield', () => {
    const winter = fight('zima', [form('winter-incarnate', { only: [] })], line());
    assert.match(winter.events[0].text, /Wszyscy wrogowie są wychłodzeni/);
    const bites = winter.events.filter((event) => event.kind === 'tick' && /marznie/.test(event.text));
    assert.deepEqual(new Set(bites.map((event) => event.target)), new Set(['e0', 'e1', 'e2']));
    const frost = fight('mroz', [form('winter-incarnate', { only: ['great-frost'] })], line());
    const first = frost.events.find((event) => event.skill === 'great-frost' && event.kind === 'stun');
    const locked = frost.events.filter((event) => event.kind === 'stun' && event.skill === 'great-frost' && event.t === first.t);
    assert.equal(new Set(locked.map((event) => event.target)).size, 3);
    const cloak = fight('plaszcz', [form('winter-incarnate', { only: ['winter-cloak'] })], [sturdy('wolf', 'e0', { damageScale: foe('wolf', 'e0').damageScale })]);
    const hit = cloak.events.findIndex((event) => event.actor === 'e0' && event.target === 'a0' && event.absorbed);
    assert.ok(hit >= 0);
    assert.ok(cloak.events.slice(hit + 1, hit + 6).some((event) => event.kind === 'slow' && event.targets?.includes('e0')));
  });

  test('Dusza puszczy: five summons may stand, the two Odwieczne dęby and Odwieczne stado\'s bison, bear and elk; the elk charges too', () => {
    const druid = form('wilds-father');
    assert.equal(druid.feat.summons, 5);
    // Both cost what the Pradruid's skills they grow from cost, 0.25 of the
    // maximum mana (half of it on an exploration), the herd's three animals
    // too, so from full mana the five come at once, as the Pradruid's four.
    for (const id of ['eternal-grove', 'eternal-herd']) {
      const skill = content.skillsById[id];
      assert.equal(skill.manaShare, content.skillsById[skill.from].manaShare, id);
      assert.equal(skill.manaShare, 0.25, id);
      // No summon of the line stands shorter than the one it grew from.
      assert.ok(skill.params.turns >= content.skillsById[skill.from].params.turns, id);
    }
    // As the whole Druid line since 0.5.11 (test/druid-summons.test.js): the
    // summons draw the foes' blows and have 75% of the character's maximum HP
    // on top, and the strength in duels is in the summons, as the Pradruid's.
    const elder = content.evolutionsById['elder-druid'];
    const father = content.evolutionsById['wilds-father'];
    assert.equal(father.trait.params.lure, true);
    assert.equal(father.trait.params.summonLife, elder.trait.params.summonLife);
    assert.equal(father.duelPower, undefined);
    assert.equal(father.duelSummonPower, elder.duelSummonPower);
    // In the Wieże its oaks' roots slow at a fifth of their strength, as the
    // Pradruid's (1249 B), and its trait says so.
    assert.equal(father.towerSummonRoot, elder.towerSummonRoot);
    assert.ok(father.trait.text.endsWith('W Wieżach Systemu korzenie Odwiecznych dębów spowalniają wrogów pięć razy słabiej.'));
    const standingNames = (result) => {
      const standing = new Map();
      let most = [];
      for (const event of result.events.filter((one) => one.kind === 'summon')) {
        if (event.state === 'up') standing.set(`${event.skill} ${event.order}`, event.summon);
        else if (['gone', 'fell'].includes(event.state)) standing.delete(`${event.summonSkill} ${event.summonOrder}`);
        if (standing.size > most.length) most = [...standing.values()].sort();
      }
      return most;
    };
    assert.deepEqual(standingNames(fight('gaj', [druid], line())), ['Niedźwiedź', 'Odwieczny dąb', 'Odwieczny dąb', 'Łoś', 'Żubr']);
    const herd = fight('stado', [form('wilds-father', { only: ['eternal-herd'] })], line());
    assert.ok(herd.events.some((event) => event.skill === 'eternal-herd' && /Łoś szarżuje/.test(event.text ?? '') && event.summonOrder === 3));
  });

  test('Chór serafinów: every fallen member of the party rises once; Tchnienie życia heals the party; Sześć skrzydeł burn whoever strikes the shield', () => {
    const party = (seed) => fight(seed, [form('seraph', { only: [], position: 'back' }), form('ravager', { only: [], id: 'a1', hpShare: 0.01, position: 'front' }), form('ravager', { only: [], id: 'a2', hpShare: 0.01, position: 'front' })], [foe('wolf', 'e0', { hp: 900000, maxHp: 900000 }), foe('boar', 'e1', { hp: 900000, maxHp: 900000 })]);
    const raised = many(6, 'serafin', party).map((result) => new Set(result.events.filter((event) => /wstaje z/.test(event.text ?? '') && event.actor === 'a0').map((event) => event.target)));
    assert.ok(raised.some((targets) => targets.has('a1') && targets.has('a2')), 'both fallen members rose');
    const breath = fight('tchnienie', [form('seraph', { only: ['breath-of-life'], hpShare: 0.5 })], line());
    assert.ok(breath.events.some((event) => event.skill === 'breath-of-life' && event.kind === 'heal' && event.amount > 0));
    const wings = fight('skrzydla', [form('seraph', { only: ['six-wings'] })], line());
    assert.ok(wings.events.some((event) => event.kind === 'reflect' && event.actor === 'a0'));
  });

  test('Święty płomień: sacrum burns every foe, not only spirits; Zastęp niebios calls two knights of sacrum; Ognisty miecz falls on foe after foe', () => {
    const plain = fight('plomien', [form('heaven-sword', { only: [] })], [sturdy('boar', 'e0')]);
    assert.ok(plain.events.some((event) => event.kind === 'effect' && event.target === 'e0' && /Oparzenie/.test(event.effect)));
    const host = fight('zastep', [form('heaven-sword', { only: ['heavenly-host'] })], line());
    assert.equal(host.events.find((event) => event.skill === 'heavenly-host' && event.kind === 'summon').count, 2);
    assert.ok(host.events.some((event) => event.skill === 'heavenly-host' && BLOWS.includes(event.kind) && /\(sakrum\)/.test(event.text)));
    const sentence = fight('miecz', [form('heaven-sword', { only: ['fiery-sword'] })], [foe('wolf', 'e0', { hp: 10 }), foe('fox', 'e1', { hp: 10 }), sturdy('crow', 'e2', { hp: 100000 })]);
    const blows = sentence.events.filter((event) => event.skill === 'fiery-sword' && BLOWS.includes(event.kind));
    assert.ok(blows.length >= 3 && new Set(blows.filter((event) => event.t === blows[0].t).map((event) => event.target)).size >= 3, JSON.stringify(blows.map((event) => [event.t, event.target])));
  });

  test('Wszechwiedza: a foe that has struck at the party before may miss again; Przeznaczenie raises the fallen and stops every foe; Księga losu answers dodges', () => {
    const seen = many(6, 'wszechwiedza', (seed) => fight(seed, [form('all-seeing', { only: [] })], [sturdy('wolf', 'e0')])).map((result) => result.events.filter((event) => event.actor === 'e0' && /przewidział/.test(event.text ?? '')).length);
    assert.ok(seen.some((count) => count > 1), seen.join());
    const turned = fight('przeznaczenie', [form('all-seeing', { only: ['destiny'] }), form('ravager', { only: [], id: 'a1', hpShare: 0.01 })], [foe('wolf', 'e0', { hp: 900000, maxHp: 900000 }), foe('boar', 'e1', { hp: 900000, maxHp: 900000 })]);
    const rise = turned.events.find((event) => event.skill === 'destiny' && event.kind === 'heal');
    assert.ok(rise, texts(turned).join('\n'));
    assert.match(turned.events.find((event) => event.skill === 'destiny' && event.kind === 'skill').text, /wszyscy wrogowie tracą najbliższy ruch/);
    const book = many(4, 'ksiega', (seed) => fight(seed, [form('all-seeing', { only: ['book-of-fate'] })], [sturdy('broom-witch', 'e0'), sturdy('wolf', 'e1')]));
    assert.ok(book.flatMap((result) => result.events).some((event) => event.skill === 'book-of-fate' && BLOWS.includes(event.kind)));
  });

  test('Władza nad duszami: a foe low on HP falls to any blow; Lament dusz grows with the souls gathered; Ostatnie żniwo cuts the foe beside too', () => {
    const reaped = fight('dusze', [form('soul-lord', { only: [] })], [foe('boar', 'e0', { hp: 1000, maxHp: 900000 })]);
    assert.ok(reaped.events.some((event) => event.actor === 'a0' && /To był cios śmiertelny/.test(event.text ?? '')));
    const lord = form('soul-lord', { only: ['soul-lament'] });
    const firstWail = (unit) => fight('lament', [unit], [sturdy('boar', 'e0', { speed: 1 })]).events.find((event) => event.skill === 'soul-lament' && BLOWS.includes(event.kind));
    const quiet = firstWail(lord);
    const loud = firstWail({ ...lord, souls: 2 });
    const power = paramOf(lord, 'soul-lament', 'single') ?? paramOf(lord, 'soul-lament', 'power');
    const expected = ((power + 2 * paramOf(lord, 'soul-lament', 'perSoul')) / power) * (1 + Math.min(lord.feat.soulMax, 2 * lord.feat.soul));
    if (quiet.kind === loud.kind) near(loud.damage / quiet.damage, expected, 0.05, 'Lament dusz');
    const cut = fight('zniwo', [form('soul-lord', { only: ['last-harvest'] })], line());
    const first = cut.events.filter((event) => event.skill === 'last-harvest' && BLOWS.includes(event.kind));
    assert.ok(first.length >= 2 && first[0].t === first[1].t && first[0].target !== first[1].target);
  });

  test('Cesarstwo umarłych: the poison of a foe that falls passes on; Wieczny legion\'s knights rise again; Pomór poisons and weakens every foe', () => {
    const spread = many(6, 'zaraza', (seed) => fight(seed, [form('navia-emperor', { only: ['pestilence'] })], [foe('wolf', 'e0', { hp: 4000, maxHp: 4000 }), sturdy('boar', 'e1'), sturdy('crow', 'e2')])).flatMap((result) => result.events);
    assert.ok(spread.some((event) => /Trucizna nie ginie razem z ofiarą/.test(event.text ?? '')));
    const legion = many(4, 'legion', (seed) => fight(seed, [form('navia-emperor', { only: ['eternal-legion'] })], [foe('wolf', 'e0', { hp: 900000, maxHp: 900000, damageScale: foe('wolf', 'e0').damageScale * 3 }), foe('boar', 'e1', { hp: 900000, maxHp: 900000, damageScale: foe('boar', 'e1').damageScale * 3 })])).flatMap((result) => result.events);
    assert.ok(legion.some((event) => event.kind === 'summon' && event.state === 'up' && /wstaje znowu/.test(event.text ?? '')));
    const plague = fight('pomor', [form('navia-emperor', { only: ['pestilence'] })], line());
    const cast = plague.events.find((event) => event.skill === 'pestilence' && BLOWS.includes(event.kind));
    const poisoned = plague.events.filter((event) => event.kind === 'effect' && event.t === cast.t && /Zatrucie/.test(event.effect)).map((event) => event.target);
    assert.deepEqual(new Set(poisoned), new Set(['e0', 'e1', 'e2']));
  });

  test('Serce nocy: the shadows repeat every blow; Tysiąc cieni cuts every foe critically and hides its user; Noc bez gwiazd darkens the field', () => {
    const shadows = fight('cienie', [form('dark-king', { only: [] })], line());
    assert.ok(shadows.events.some((event) => /Cienie powtarzają cios/.test(event.text ?? '')));
    const thousand = fight('tysiac', [form('dark-king', { only: ['thousand-shadows'] })], line());
    const cast = thousand.events.find((event) => event.skill === 'thousand-shadows' && event.kind === 'skill');
    const cuts = thousand.events.filter((event) => event.skill === 'thousand-shadows' && event.t === cast.t && BLOWS.includes(event.kind) && !event.mirror);
    assert.deepEqual(new Set(cuts.map((event) => event.target)), new Set(['e0', 'e1', 'e2']));
    assert.ok(cuts.every((event) => event.kind === 'crit'));
    const night = fight('noc', [form('dark-king', { only: ['starless-night'] })], line());
    assert.ok(night.events.some((event) => event.kind === 'dodge' && /w ciemności/.test(event.text)));
  });
});

describe('the fifth forms against the fourth forms (tools/class-balance-sim.mjs, tools/pvp-arena-sim.mjs)', () => {
  test('on four-hour explorations at level 345 a fifth form faints no more often than its fourth form, and ends them with as much HP or kills clearly quicker', () => {
    // The realistic player of tools/difficulty-sim.mjs, alone (without
    // companions it is harder), at class level 412 (the tuned curve).
    const rows = [];
    for (const cls of content.classes) {
      content.skills.filter((skill) => skill.classId === cls.id).forEach((skill, index) => {
        const path = index === 0 ? null : skill.id;
        const options = { model: 'realistic-nocomp', classId: cls.id, level: 345, minutes: 240, hunts: 120, path };
        rows.push([measureClass(options, tuned(fourthOnly)), measureClass(options, tuned(content))]);
      });
    }
    assert.deepEqual(rows.map(([, fifth]) => fifth.evolution).sort(), [...FORMS].sort());
    for (const [fourth, fifth] of rows) {
      const told = `${fifth.evolution}: ${fifth.defeats} faints, HP ${fifth.endHp.toFixed(3)}, kills ${(fifth.killSpeed / fourth.killSpeed).toFixed(2)}× vs ${fourth.defeats} and ${fourth.endHp.toFixed(3)}`;
      assert.ok(fifth.defeats <= fourth.defeats, told);
      assert.ok(fifth.endHp >= fourth.endHp || fifth.killSpeed >= 1.15 * fourth.killSpeed, told);
    }
    assert.ok(Math.max(...rows.map(([, fifth]) => fifth.defeats)) <= 0.1);
  });

  test('in the Arena at levels 350 and 380 each fifth form wins 25–75% of its duels against the other paths, and the duels last a few rounds', () => {
    // Class levels about 417 and 451 (the tuned curve): every path is a
    // fifth form, each with its own strength in duels (duelPower, duelHp).
    for (const level of [350, 380]) {
      const result = measure({ level, seeds: 1, model: 'realistic', paths: true }, tuned(content));
      assert.deepEqual(Object.keys(result.paths).sort(), [...FORMS].sort());
      for (const [id, share] of Object.entries(result.paths)) assert.ok(share >= 0.25 && share <= 0.75, `level ${level}: ${id} wins ${share}`);
      assert.ok(result.median >= 16 && result.median <= 40, `level ${level}: median ${result.median} moves`);
      assert.ok(result.limits <= 0.12, `level ${level}: the judge ended ${result.limits}`);
    }
  });
});

describe('the fifth evolution through the API (FIFTH_EVOLUTION "on")', () => {
  const { call, db, signUp } = useServer({ FOURTH_EVOLUTION: 'on', FIFTH_EVOLUTION: 'on' });
  let cookie;

  const create = async () => {
    ({ cookie } = await signUp('piatyforma'));
    await call('POST', '/api/character', { cookie, body: { name: 'Piatyforma', classId: 'warrior', appearance: 'male' } });
  };
  const set = async (sql) => (await db()).prepare(`UPDATE characters SET ${sql}`).run();
  const character = async () => (await call('GET', '/api/character', { cookie })).data.character;

  beforeEach(() => create());

  test('at class level 400 with the points spent the character sees its one form, takes it with its skills at 0 and keeps its stat points', async () => {
    await set(`level = 350, class_level = 399, evolution = 'ravager', skills = '{"carnage":195,"breach":194}', points = '{"strength":3}'`);
    let view = await character();
    assert.deepEqual([view.evolution.current.id, view.evolution.next, view.evolution.nextLevel], ['ravager', null, 400]);
    assert.equal((await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'unstoppable' } })).data.error.code, 'class_level');
    await set(`class_level = 400, skills = '{"carnage":195,"breach":195}'`);
    view = await character();
    assert.equal(view.evolution.next.id, 'unstoppable');
    assert.deepEqual(view.skills.evolution, { level: 400, need: 'evolve' });
    const scrolls = (await (await db()).prepare('SELECT oblivion_scrolls FROM characters').first()).oblivion_scrolls;
    const taken = await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'unstoppable' } });
    assert.equal(taken.status, 200, JSON.stringify(taken.data));
    assert.equal(taken.data.oblivionScroll, true);
    const after = taken.data.character;
    assert.equal(after.className, 'Niepowstrzymany');
    assert.equal(after.evolution.current.trait.name, 'Gniew wulkanu');
    assert.equal(after.skills.points, 391);
    assert.deepEqual(after.skills.pools[0].options.map((skill) => [skill.id, skill.level, skill.maxLevel]), [
      ['devastation', 0, 245],
      ['last-frenzy', 0, 245],
    ]);
    const row = await (await db()).prepare('SELECT points, oblivion_scrolls FROM characters').first();
    assert.deepEqual(JSON.parse(row.points), { strength: 3 });
    // The System's Zwój Niepamięci, as after every evolution.
    assert.equal(row.oblivion_scrolls, scrolls + 1);
  });

  test('on the test version a fourth form gets class level 400 at once, and keeps its form', async () => {
    await set(`level = 300, class_level = 320, evolution = 'ravager', skills = '{"carnage":21,"breach":0}'`);
    const raised = await call('POST', '/api/evolution/test-level?level=400', { cookie });
    assert.equal(raised.status, 200, JSON.stringify(raised.data));
    assert.equal(raised.data.character.classLevel, 400);
    assert.equal(raised.data.character.className, 'Burzyciel');
    await set(`evolution = 'horde-slayer', skills = '{}'`);
    assert.equal((await call('POST', '/api/evolution/test-level?level=400', { cookie })).data.error.code, 'not_fourth');
  });
});

describe('the fifth evolution where the deployment has it off (FIFTH_EVOLUTION unset, the switch kept)', () => {
  const { call, db, signUp } = useServer({ FOURTH_EVOLUTION: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('bezpiatej'));
    await call('POST', '/api/character', { cookie, body: { name: 'Bezpiatej', classId: 'warrior', appearance: 'male' } });
  });
  const set = async (sql) => (await db()).prepare(`UPDATE characters SET ${sql}`).run();

  test('through the API a fourth form has no fifth form: the class waits at 400 only for its points', async () => {
    await set(`level = 350, class_level = 400, evolution = 'ravager', skills = '{"carnage":195,"breach":190}'`);
    let view = (await call('GET', '/api/character', { cookie })).data.character;
    assert.deepEqual([view.evolution.current.id, view.evolution.next, view.evolution.nextLevel], ['ravager', null, null]);
    assert.deepEqual(view.skills.evolution, { level: 400, need: 'skill_points' });
    await set(`skills = '{"carnage":195,"breach":195}'`);
    view = (await call('GET', '/api/character', { cookie })).data.character;
    assert.equal(view.skills.evolution.need, null);
    const taken = await call('POST', '/api/evolution', { cookie, body: { evolutionId: 'unstoppable' } });
    assert.ok(taken.status >= 400 && taken.data.error);
    assert.equal((await (await db()).prepare('SELECT evolution FROM characters').first()).evolution, 'ravager');
    assert.equal((await call('POST', '/api/evolution/test-level?level=400', { cookie })).data.error.code, 'not_fourth');
    const { evolutionArt: art } = (await call('GET', '/api/content')).data;
    assert.equal(art.forms.ravager, 'horde-slayer');
    assert.equal(art.forms.unstoppable, undefined);
  });
});

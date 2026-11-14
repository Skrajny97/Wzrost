// Code review of the combat engine and the character-power math
// (12.11.2026). The tests under "findings" each show a defect and fail until
// it is fixed; the property tests under "sound" pass and guard what the
// review found right: every class, evolution (first and second form),
// look, level, skill choice and piece of gear, against creatures and other
// characters. Names are synthetic.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import * as engine from '../src/engine/index.js';
import { typicalCharacter, typicalClassLevel } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const {
  arenaDuel,
  autoDistribute,
  canUse,
  combatantView,
  computeStats,
  createRng,
  duelArmorShare,
  duelHpFactor,
  duelist,
  encounterCombatants,
  extraValues,
  fightingPlayer,
  freePoints,
  generateItem,
  imbueEffect,
  itemProperties,
  learnedSkills,
  monsterCombatant,
  playerCombatant,
  reduction,
  simulateFight,
  simulateHunt,
  skillParams,
  skillView,
  topLevel,
  upgradedItem,
  warBattle,
} = engine;

// A character of an evolution (or of a class, with `classId`), as the
// typical character of its level has it (tools/simulate.mjs), with these
// skills: the fighter the Arena and the guild wars take.
function fighter(evolutionId, skills, level, classLevel, name) {
  const evolution = content.evolutionsById[evolutionId];
  const { character, equipped } = typicalCharacter(evolution.classId, level, content);
  return { character: { ...character, classLevel, skills, evolution: evolutionId }, equipped, name: name ?? evolution.name };
}
const unitOf = (one, id = 'a0', extra = {}) => playerCombatant({ ...one, id, ...extra }, content);

// Every class alone, with each of its first evolutions and each second form.
const CONFIGS = content.classes.flatMap((cls) => [
  { classId: cls.id, evolution: null },
  ...content.evolutions.filter((evolution) => evolution.classId === cls.id).map((evolution) => ({ classId: cls.id, evolution: evolution.id })),
]);
const SLOTS = content.slots.map((slot) => slot.id);
const GEMS = content.minerals.filter((mineral) => mineral.setBonus).map((mineral) => mineral.id);

// Skills a character of a config may have at a class level: an evolution's
// two at any levels (0 is "not raised yet"), or one or two of the class's.
function someSkills({ classId, evolution }, classLevel, rng) {
  if (evolution) {
    const { skills } = content.evolutionsById[evolution];
    return Object.fromEntries(skills.map((id) => [id, rng.int(0, topLevel(content.skillsById[id], content))]));
  }
  if (classLevel < content.balance.skills.unlockClassLevel) return {};
  const pool = content.skills.filter((skill) => skill.classId === classId);
  const chosen = [];
  for (let count = classLevel >= content.balance.skills.secondClassLevel ? rng.int(1, 2) : 1; chosen.length < count; ) {
    const skill = rng.pick(pool);
    if (!chosen.includes(skill.id)) chosen.push(skill.id);
  }
  return Object.fromEntries(chosen.map((id) => [id, rng.int(1, content.balance.skills.maxLevel)]));
}

// Gear: for most slots a base the class may wear at its class level, of any
// rarity, often upgraded on the Kowadło, with a gem and an element of the
// Zaklinaczka now and then.
function someGear(classId, classLevel, level, rng) {
  const items = [];
  for (const slot of SLOTS) {
    if (rng.chance(0.15)) continue;
    const bases = content.bases.filter((base) => base.slot === slot && canUse(base.id, classId, content, classLevel));
    if (bases.length === 0) continue;
    const item = generateItem({ baseId: rng.pick(bases).id, level: Math.max(1, level - rng.int(0, 5)), rarityId: rng.pick(content.rarities).id }, rng, content);
    if (rng.chance(0.6)) item.upgrade = rng.int(1, engine.maxUpgrade(content));
    if (rng.chance(0.4)) item.gem = rng.pick(GEMS);
    if (content.settlement.imbue.slots.includes(slot) && rng.chance(0.4)) item.imbue = imbueEffect(item, rng.pick(content.settlement.imbue.elements).element, content);
    items.push({ ...item, equippedSlot: slot });
  }
  return items;
}

const LEVELS = [1, 2, 5, 9, 10, 12, 20, 30, 45, 60, 80, 100, 130, 160, 200, 300, 500];

// A character of any config, look, level, place in the line, skills, stat
// points (by class or at random) and gear.
function someCharacter(rng, { config = rng.pick(CONFIGS), level = rng.pick(LEVELS) } = {}) {
  const stage = config.evolution ? content.evolutionsById[config.evolution].stage : 0;
  const least = [1, content.balance.progression.classEvolutionLevels[0], content.balance.progression.classEvolutionLevels[1]][stage];
  let classLevel = Math.max(1, typicalClassLevel(level, content));
  if (classLevel < least) classLevel = least + rng.int(0, 60);
  classLevel = Math.min(classLevel, content.balance.progression.maxLevel);
  const cls = content.classesById[config.classId];
  const character = {
    classId: config.classId,
    level,
    xp: 0,
    classLevel,
    classXp: 0,
    points: {},
    position: rng.pick(['front', 'middle', 'back', cls.position]),
    appearance: rng.pick(['female', 'male']),
    evolution: config.evolution,
    skills: someSkills(config, classLevel, rng),
    professions: {},
  };
  if (rng.chance(0.5)) character.points = autoDistribute(character, content);
  else {
    for (let free = freePoints(character, content); free > 0; ) {
      const stat = rng.pick(content.statIds);
      const count = Math.min(free, rng.int(1, Math.max(1, Math.ceil(free / 3))));
      character.points[stat] = (character.points[stat] ?? 0) + count;
      free -= count;
    }
  }
  return { character, equipped: rng.chance(0.1) ? [] : someGear(config.classId, classLevel, level, rng), name: 'Próbny' };
}

const areaFor = (level) => content.areas.find((area) => level >= area.minLevel && level <= area.maxLevel) ?? content.areas.at(-1);

// Every number of a value, deep, with its path.
function numbers(value, path = '', out = []) {
  if (typeof value === 'number') out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((each, index) => numbers(each, `${path}[${index}]`, out));
  else if (value && typeof value === 'object') for (const [key, each] of Object.entries(value)) numbers(each, `${path}.${key}`, out);
  return out;
}

// The fight's log against its result: every number in it whole or finite and
// not below zero, no unfilled text, and each unit's HP followed through the
// blows, ticks, reflections, heals, drains, potions and kills it names
// coming out as the logged HP and, at the end, as the result's HP.
function logProblems(allies, enemies, fight) {
  const problems = [];
  const hp = Object.fromEntries([...allies, ...enemies].map((unit) => [unit.id, unit.hp]));
  const maxHp = Object.fromEntries([...allies, ...enemies].map((unit) => [unit.id, unit.maxHp]));
  fight.events.forEach((event, index) => {
    const where = `#${index} ${event.kind} "${event.text}"`;
    for (const key of ['damage', 'amount', 'hp', 'shield', 'summonHp', 'absorbed', 'left', 't']) {
      const value = event[key];
      if (value !== undefined && !(Number.isFinite(value) && value >= 0)) problems.push(`${where}: ${key} ${value}`);
    }
    if (typeof event.text !== 'string' || /undefined|NaN|Infinity|\{\w+\}/.test(event.text)) problems.push(`${where}: text`);
    if (event.target === undefined || typeof event.hp !== 'number') return;
    const id = event.target;
    let expected = hp[id];
    if (['hit', 'crit', 'tick', 'reflect'].includes(event.kind)) expected = Math.max(0, hp[id] - event.damage);
    else if (['heal', 'drain'].includes(event.kind) || (event.kind === 'potion' && event.effect === 'heal')) expected = hp[id] + event.amount;
    else if (event.kind === 'potion' && event.effect === 'revive') expected = event.amount;
    else if (event.kind === 'kill') expected = 0;
    if (expected !== event.hp) problems.push(`${where}: HP ${hp[id]} then ${event.hp}, the log makes it ${expected}`);
    if (event.hp > maxHp[id]) problems.push(`${where}: HP ${event.hp} above ${maxHp[id]}`);
    hp[id] = event.hp;
  });
  for (const unit of fight.units) if (hp[unit.id] !== unit.hp) problems.push(`end: ${unit.id} ${hp[unit.id]} by the log, ${unit.hp} in the result`);
  const allyIds = new Set(allies.map((unit) => unit.id));
  const standing = (mine) => fight.units.some((unit) => allyIds.has(unit.id) === mine && unit.hp > 0);
  const won = !standing(false) ? true : !standing(true) ? false : null;
  if (fight.won !== won) problems.push(`won ${fight.won}, the HP left says ${won}`);
  return problems;
}

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const each of Object.values(value)) deepFreeze(each);
  }
  return value;
};

describe('findings', () => {
  // combat.js:1181-1184. A sweep goes on through every foe, while the
  // whirl, the splash, the pierce, the cleave and the cloud stop once the
  // one striking has fallen. A blow of the sweep that a Bastion's
  // Niezłomny (or Wyzwanie, Lustro many) throws back may kill the one
  // sweeping, and its sweep strikes on: the log shows a fallen fighter
  // hitting the others, and its slow lands after its death too.
  test('a fighter killed by a reflected blow in the middle of its sweep strikes no one after its fall (guild wars)', () => {
    const sideA = [fighter('bastion', { unbending: 95, 'shield-wall': 95 }, 150, 160, 'Bastion A'), fighter('arena-champion', { 'steel-whirl': 95, duel: 95 }, 150, 160, 'Czempion A')];
    const sideB = [fighter('archmage', { 'meteor-shower': 95, 'elemental-harmony': 95 }, 150, 160, 'Arcymag B'), fighter('thunder-lord', { 'sky-thunder': 95, 'thunder-orb': 95 }, 150, 160, 'Władca B')];
    const after = [];
    for (let seed = 0; seed < 40; seed++) {
      const { fight } = warBattle({ sideA, sideB, seed: `sweep:${seed}` }, content);
      const down = new Set();
      fight.events.forEach((event, index) => {
        if (event.kind === 'kill') down.add(event.target);
        else if (event.kind === 'potion' || event.kind === 'heal') down.delete(event.target);
        if (event.actor && down.has(event.actor) && ['hit', 'crit', 'slow'].includes(event.kind)) {
          const killed = fight.events.findLastIndex((one, at) => at < index && one.kind === 'kill' && one.target === event.actor);
          after.push(`battle sweep:${seed}: #${killed} "${fight.events[killed].text}" then #${index} "${event.text}"`);
        }
      });
    }
    assert.deepEqual(after.slice(0, 3), [], `${after.length} blows and slows of fallen fighters in 40 battles`);
  });

  // combat.js:383-384 and 1403. A guard adds armour and takes the same
  // amount back when it ends (`actor.armor -= actor.guard.armor`); Młyn's
  // tearing (852) and Klątwa rozkładu's wearing (448) take a share of the
  // armour as it is, guard included, meanwhile. So the guard's end takes
  // back more than is left of it, and the armour drops below what the
  // tearing alone leaves, below zero after a few ticks of the curse, where
  // reduction() gives no protection at all.
  test('the armour after a guard ends is what the curse alone would have left, not less (Arena)', () => {
    const level = 120;
    const attacker = fighter('guardian', { indomitable: 45 }, level, 99, 'Strażnik');
    const defender = fighter('necromancer', { 'curse-of-decay': 95 }, level, 150, 'Nekromanta');
    const shape = { factor: duelHpFactor(level, level, content), armor: duelArmorShare(level, level, content) };
    const guard = duelist(attacker, 'a0', 'ally', shape, content);
    const necromancer = duelist(defender, 'e0', 'enemy', shape, content);
    const wrong = [];
    for (let seed = 0; seed < 30; seed++) {
      const { events } = arenaDuel({ attacker, defender, seed: `guard-decay:${seed}` }, content).fight;
      const fade = events.findIndex((event) => event.kind === 'fade' && event.target === 'a0' && event.skill === 'indomitable');
      const at = events.findIndex((event, index) => index > fade && event.kind === 'hit' && event.actor === 'e0' && event.target === 'a0' && !event.skill);
      if (fade < 0 || at < 0) continue;
      // The armour without the guard, worn by every tick of the curse so
      // far (half a point more of each, against rounding): never less.
      let armour = guard.armor;
      for (const event of events.slice(0, at)) {
        const worn = event.target === 'a0' && event.kind === 'tick' && /słabnie o (\d+)%/.exec(event.text);
        if (worn) armour *= 1 - Number(worn[1]) / 100 - 0.005;
      }
      // A plain blow that is not critical takes at most its biggest roll
      // less that armour's share (the Nekromanta has no stance, trait or
      // bonus on its blows).
      const most = Math.round(necromancer.weapon.max * necromancer.damageScale * (1 - reduction(armour, necromancer.level, content.balance))) + 1;
      if (events[at].damage > most) wrong.push(`duel guard-decay:${seed}: armour at least ${Math.round(armour)}, a plain hit at most ${most}, but "${events[at].text}"`);
    }
    assert.deepEqual(wrong.slice(0, 3), [], `${wrong.length} of 30 duels: the first plain hit after Niezłomny ends takes more than the armour left by the curse allows`);
  });

  // combat.js:687-690 (throwBack) and 1241-1244 (the echo of Znak
  // śmierci). A wound skill wakes "the moment HP falls below its mark"
  // (wounded(), called after a blow and a tick); a reflection and an echo
  // take HP without calling it, so Lustro many, Niezłomny or Taniec ostrzy
  // stay asleep and the next blow lands in full.
  test('a wound skill wakes the moment a reflection takes HP below its mark (Arena)', () => {
    const defender = fighter('bastion', { unbending: 95 }, 120, 150, 'Bastion');
    const late = [];
    for (const attacker of [fighter('arcanist', { 'mana-mirror': 45 }, 120, 99, 'Arkanista'), fighter('guardian', { indomitable: 45 }, 120, 99, 'Strażnik')]) {
      const skill = learnedSkills(attacker.character, content)[0];
      for (let seed = 0; seed < 20; seed++) {
        const { allies, events } = arenaDuel({ attacker, defender, seed: `wound:${seed}` }, content).fight;
        const mark = skill.params.below * allies[0].maxHp;
        let hp = allies[0].maxHp;
        let woke = false;
        events.forEach((event, index) => {
          if (event.actor === 'a0' && event.target === 'a0' && event.skill === skill.id) woke = true;
          if (event.target !== 'a0' || typeof event.hp !== 'number') return;
          const before = hp;
          hp = event.hp;
          const next = events[index + 1];
          if (!woke && event.kind === 'reflect' && before >= mark && hp < mark && hp > 0 && next?.skill !== skill.id) {
            late.push(`${attacker.name} wound:${seed}: #${index} "${event.text}" (${before} → ${hp} HP, mark ${Math.round(mark)}), then #${index + 1} "${next?.text}"`);
          }
        });
      }
    }
    assert.deepEqual(late.slice(0, 3), [], `${late.length} reflections took a character below its wound skill's mark without waking it`);
  });

  // combat.js:1188-1190. Mroźny podmuch: "Każdy trafiony zostaje
  // spowolniony"; Promień Żywiołów: "Mróz spowalnia trafionych". The slow
  // goes to every foe still standing, also one the blow did not reach: one
  // that vanished (Zniknięcie: "wrogowie nie mogą jej trafić"), blocked it
  // (Twierdza) or whose summon took it.
  test('Promień Żywiołów slows only those it hit, not a vanished Królobójca (Arena)', () => {
    const attacker = fighter('elementalist', { 'elemental-ray': 45 }, 120, 99, 'Elementalista');
    const defender = fighter('kingslayer', { vanish: 95 }, 120, 150, 'Królobójca');
    const slowed = [];
    for (let seed = 0; seed < 20; seed++) {
      const { events } = arenaDuel({ attacker, defender, seed: `ray:${seed}` }, content).fight;
      events.forEach((event, index) => {
        if (event.kind !== 'skill' || event.skill !== 'elemental-ray') return;
        const end = events.findIndex((one, at) => at > index && one.kind === 'slow' && one.skill === 'elemental-ray');
        const hit = events.slice(index + 1, end).some((one) => one.target === 'e0' && ['hit', 'crit'].includes(one.kind));
        if (end > 0 && !hit) slowed.push(`ray:${seed}: "${events[index + 1].text}" then "${events[end].text}"`);
      });
    }
    assert.deepEqual(slowed.slice(0, 3), [], `${slowed.length} rays slowed a Królobójca they did not hit`);
  });

  // combat.js:407. Boska ochrona gives each member of the party a new
  // shield `{ points }` in place of the one it has, so a Lustro many still
  // holding loses its reflection (and a Lodowa zbroja its slow) for the
  // rest of the fight, though the points stay. Also on a Drużyna's trip and
  // in the Wieża Drużyn.
  test('Boska ochrona over a Lustro many still holding keeps the mirror reflecting', () => {
    const arcanist = unitOf(fighter('arcanist', { 'mana-mirror': 45 }, 90, 99, 'Arkanista'), 'a0');
    const priest = { ...unitOf(fighter('high-priest', { 'divine-shield': 95 }, 90, 120, 'Arcykapłan'), 'a1'), position: 'front' };
    const lost = [];
    for (let seed = 0; seed < 60; seed++) {
      const foes = [0, 1].map((index) => ({ ...monsterCombatant({ monsterId: 'boar', level: 92, id: `e${index}` }, content), hp: 40000, maxHp: 40000 }));
      const { events } = simulateFight({ allies: [arcanist, priest], enemies: foes, rng: createRng(`shield:${seed}`), content, record: true, maxActions: 200 });
      const mirror = events.findIndex((event) => event.actor === 'a0' && event.skill === 'mana-mirror');
      const divine = events.findIndex((event, index) => mirror >= 0 && index > mirror && event.skill === 'divine-shield' && event.guarded?.some((one) => one.id === 'a0'));
      const holding = events.slice(Math.max(0, mirror), divine).filter((event) => event.target === 'a0' && typeof event.shield === 'number').at(-1);
      if (divine < 0 || !(holding?.shield > 0)) continue;
      const absorbed = events.slice(divine).filter((event) => event.target === 'a0' && event.absorbed > 0 && ['hit', 'crit'].includes(event.kind));
      const reflected = events.slice(divine).some((event) => event.kind === 'reflect' && event.actor === 'a0');
      if (absorbed.length > 0 && !reflected) lost.push(`shield:${seed}: the mirror held ${holding.shield}, then ${absorbed.length} blows absorbed and none thrown back, e.g. "${absorbed[0].text}"`);
    }
    assert.deepEqual(lost.slice(0, 3), [], `${lost.length} fights where the mirror stopped reflecting under Boska ochrona`);
  });

  // skills.js:288. "{critPower%}" is the power times critMultiplier alone.
  // Egzekucja is the Skrytobójca's and Ścięcie the Królobójca's, whose
  // every critical blow is stronger by the trait's critDamage (combat.js
  // 804), as the Parametry dodatkowe window tells (preview.js 91: ×1.95,
  // ×2.18). The card's "zawsze krytyczny (razem 345%)" is never what the
  // blow does.
  test('the skill card\'s "razem {critPower%}" is the total the fight deals (Egzekucja, Ścięcie)', () => {
    const wrong = [];
    for (const [evolutionId, skillId] of [['assassin', 'execution'], ['kingslayer', 'beheading']]) {
      const skill = content.skillsById[skillId];
      const level = topLevel(skill, content);
      const card = skillView(skill, level, content).effect;
      const shown = Number(/razem (\d+)%/.exec(card)[1]);
      const { character, equipped } = fighter(evolutionId, { [skillId]: level }, 120, 150);
      const multiplier = extraValues(character, equipped, content).crit.multiplier;
      const dealt = Math.round(skillParams(skill, level, content).power * multiplier * 100);
      if (Math.abs(shown - dealt) > 1) wrong.push(`${skill.name}: the card says ${shown}%, the fight deals ${dealt}% (×${multiplier})`);
    }
    assert.deepEqual(wrong, []);
  });

  // preview.js:90. Widmowy krok: "unik rośnie o 5 pkt proc." over the cap
  // (combat.js 771-774; DECISIONS, "Druga ewolucja klas", 12). The
  // Parametry dodatkowe window shows the dodge without it, though it shows
  // the traits' crit multiplier and armour.
  test('the Parametry dodatkowe dodge of a Widmo is the dodge its fights have', () => {
    const { character, equipped } = fighter('phantom', {}, 120, 150);
    const shown = extraValues(character, equipped, content).dodge.chance;
    const phantom = unitOf({ character, equipped, name: 'Widmo' });
    // Blows of a creature of the character's own level, as the window
    // counts them, at a Widmo too sturdy to fall.
    let blows = 0;
    let dodged = 0;
    for (let seed = 0; seed < 40; seed++) {
      const foe = { ...monsterCombatant({ monsterId: 'boar', level: character.level, id: 'e0' }, content), hp: 1e9, maxHp: 1e9 };
      const { events } = simulateFight({ allies: [{ ...phantom, hp: 1e9, maxHp: 1e9 }], enemies: [foe], rng: createRng(`dodge:${seed}`), content, record: true, maxActions: 300 });
      for (const event of events) {
        if (event.actor !== 'e0' || event.target !== 'a0') continue;
        blows += 1;
        if (event.kind === 'dodge') dodged += 1;
      }
    }
    const measured = dodged / blows;
    assert.ok(Math.abs(measured - shown) < 0.02, `the window shows ${(shown * 100).toFixed(1)}%, the fights dodged ${(measured * 100).toFixed(1)}% of ${blows} blows (+${content.evolutionsById.phantom.trait.params.dodge * 100} pkt proc. of Widmowy krok)`);
  });

  // combat.js:811 and 866. A blow of several elements (Promień Żywiołów:
  // fire, frost and lightning) counts each element's weakness for its
  // third (817-818), but its line names the weakness to the element of the
  // character's weapon, which the blow does not use, at its full share.
  test('a blow of Promień Żywiołów names only a weakness the blow used', () => {
    const { character, equipped } = typicalCharacter('mage', 60, content);
    const staff = { ...equipped.find((item) => item.slot === 'weapon'), element: 'water' };
    const elementalist = playerCombatant({ character: { ...character, classLevel: 70, evolution: 'elementalist', skills: { 'elemental-ray': 45 } }, equipped: [...equipped.filter((item) => item.slot !== 'weapon'), staff], name: 'Elementalista' }, content);
    // A Zwęglak takes half as much again from water, and nothing more from
    // fire, frost or lightning.
    const pine = { ...monsterCombatant({ monsterId: 'charred-pine', level: 60, id: 'e0' }, content), hp: 1e6, maxHp: 1e6 };
    assert.deepEqual(pine.weak, { water: 0.5 });
    const { events } = simulateFight({ allies: [elementalist], enemies: [pine], rng: createRng('ray-water'), content, record: true, maxActions: 30 });
    const ray = events.filter((event) => event.skill === 'elemental-ray' && ['hit', 'crit'].includes(event.kind));
    assert.ok(ray.length > 0);
    assert.deepEqual(ray.filter((event) => /Słaby punkt/.test(event.text)).map((event) => event.text).slice(0, 2), []);
  });

  // combat.js:818 and 652. With the class evolutions off (EVOLUTIONS "off",
  // src/server/content.js 204-206: no evolutions, but skillsById keeps
  // their skills), a character that took an evolution before fights with
  // its skills and no trait, so `evolving` is false and no unit gets
  // `stances`. The several-element blow calls evolved() whatever
  // `evolving` is (the one-element blow only when it is), and evolved()
  // reads actor.stances: an Elementalist's every fight with Promień
  // Żywiołów throws. The same kind of crash was fixed for Odnowa (combat.js
  // 1082-1085).
  test('with the evolutions off an Elementalist\'s Promień Żywiołów does not throw', () => {
    const off = { ...content, evolutions: [], evolutionsById: {}, evolutionSkills: [] };
    const { character, equipped } = typicalCharacter('mage', 70, content);
    const elementalist = playerCombatant({ character: { ...character, classLevel: 80, evolution: 'elementalist', skills: { 'elemental-ray': 20 } }, equipped, name: 'Elementalista' }, off);
    assert.deepEqual(elementalist.skills.map((skill) => skill.id), ['elemental-ray']);
    const boars = [0, 1].map((index) => monsterCombatant({ monsterId: 'boar', level: 70, id: `e${index}` }, off));
    assert.doesNotThrow(() => simulateFight({ allies: [elementalist], enemies: boars, rng: createRng('off'), content: off, record: true }));
  });

  // combatant.js:355. The card of a report's participant (under "+") shows
  // the armour and the speed with the strengthening potions drunk
  // (fightingPlayer lays them on the unit), but its damage leaves out
  // `damageBonus`: a Mikstura siły's +20%, a companion's trait and bond,
  // a curse's or the wounds' minus, all of which the blows have.
  test('a report\'s participant card shows the damage with the strength potion its blows have', () => {
    const { character, equipped } = typicalCharacter('warrior', 40, content);
    const area = areaFor(40);
    const plain = simulateHunt({ character, equipped, name: 'Próbny', areaId: area.id, minutes: 30, seed: 'card' }, content);
    const strong = simulateHunt({ character, equipped, name: 'Próbny', areaId: area.id, minutes: 30, seed: 'card', buffs: { damage: { fights: 4, bonus: 0.2 }, armor: { fights: 4, bonus: 0.3 } } }, content);
    const [before] = plain.fights[0].allies;
    const [after] = strong.fights[0].allies;
    assert.notEqual(after.armor, before.armor, 'the armour potion shows on the card');
    const unit = playerCombatant({ character, equipped, name: 'Próbny', area }, content);
    const expected = `${Math.round(unit.weapon.min * unit.damageScale * 1.2)}–${Math.round(unit.weapon.max * unit.damageScale * 1.2)}`;
    assert.equal(after.damage, expected, `with the strength potion the card still shows ${after.damage}, as without it (${before.damage})`);
  });
});

// characters.js:1626. "Maks. HP … +N z każdym poziomem klasy" shows the
// class's perClassLevel whatever the evolution, but the Arkanista's class
// levels give 4 mana and the Druid's 4 HP and 5 mana (data/evolutions.json;
// DECISIONS, "Ewolucje: budowa" 3 and "Druga ewolucja klas" 6), which
// playerCombatant counts (perClassLevelOf).
describe('findings: the stats screen', () => {
  const { call, db, signUp } = useServer();

  test('a Druid\'s stats screen tells what a class level adds to its HP and mana', async () => {
    const { cookie } = await signUp('recenzja');
    assert.equal((await call('POST', '/api/character', { cookie, body: { name: 'Probna', classId: 'mage', appearance: 'female' } })).status, 201);
    await (await db()).prepare(`UPDATE characters SET level = 110, class_level = 120, evolution = 'druid', skills = '{"ent-summon":10,"bear-summon":10}'`).run();
    const { combat } = (await call('GET', '/api/character', { cookie })).data.character;
    // What playerCombatant gives for one class level more, the stats left as
    // they are (perClassLevelOf): 4 HP, and 5 mana before Moc puszczy's
    // +25% of the whole (so at least 5 on the screen).
    const character = { classId: 'mage', level: 110, classLevel: 120, points: {}, evolution: 'druid', skills: {} };
    const at = (classLevel) => engine.perClassLevelOf({ ...character, classLevel }, content);
    const added = (key) => Math.round(at(121)[key] * 121 - at(120)[key] * 120);
    assert.deepEqual([added('hp'), added('mana')], [4, 5]);
    assert.equal(combat.perClassLevel.hp, added('hp'), `the screen says +${combat.perClassLevel.hp} HP and +${combat.perClassLevel.mana} mana with each class level`);
    assert.ok(combat.perClassLevel.mana >= added('mana'), `the screen says +${combat.perClassLevel.mana} mana with each class level`);
  });
});

describe('sound', () => {
  test('the fight view names the weapon a character strikes with and its family, for the playback (953 C); bare fists and a creature have none', () => {
    const rng = createRng('weapon-view');
    const hero = (classId, level, equipped) => {
      const character = { classId, level, xp: 0, classLevel: level, classXp: 0, points: {}, position: content.classesById[classId].position, appearance: 'female', skills: {}, professions: {} };
      character.points = autoDistribute(character, content);
      return combatantView(playerCombatant({ character, equipped, name: 'Próba', id: 'a0' }, content), level, content);
    };
    for (const [classId, baseId, family] of [
      ['warrior', 'saber', 'sword'],
      ['warrior', 'bearded-axe', 'axe'],
      ['shadow', 'kindjal', 'dagger'],
      ['warrior', 'sword', 'sword'],
      ['archer', 'longbow', 'bow'],
    ]) {
      const view = hero(classId, 30, [generateItem({ baseId, level: 30 }, rng, content)]);
      assert.deepEqual([view.weapon, view.weaponFamily], [baseId, family], baseId);
    }
    assert.equal('weapon' in hero('warrior', 5, []), false);
    assert.equal('weapon' in combatantView(monsterCombatant({ monsterId: 'skeleton', level: 20, id: 'e0' }, content), 20, content), false);
  });

  test('every combatant\'s numbers are finite and not below zero, for every class, evolution, level and gear', () => {
    const bad = [];
    for (let index = 0; index < 600; index++) {
      const rng = createRng(`combatant:${index}`);
      const one = someCharacter(rng, { config: CONFIGS[index % CONFIGS.length] });
      const unit = playerCombatant({ ...one, area: areaFor(one.character.level) }, content);
      for (const [path, value] of numbers(unit)) if (!Number.isFinite(value) || value < 0) bad.push(`${unit.classId}/${unit.feat?.kind} ${unit.level}: ${path} ${value}`);
      const view = combatantView(unit, unit.level, content);
      for (const [path, value] of numbers(view)) if (!Number.isFinite(value) || value < 0) bad.push(`view ${path} ${value}`);
      for (const [path, value] of numbers(extraValues(one.character, one.equipped, content))) if (!Number.isFinite(value) || value < 0) bad.push(`extra ${path} ${value}`);
    }
    assert.deepEqual(bad.slice(0, 5), []);
  });

  test('fights against creatures: the log adds up to the result, numbers are sane, the same seed gives the same fight and the inputs stay as they were', () => {
    const problems = [];
    for (let index = 0; index < 1500; index++) {
      const rng = createRng(`pve:${index}`);
      const party = Array.from({ length: rng.int(1, 3) }, () => someCharacter(rng));
      const area = areaFor(party[0].character.level);
      const allies = party.map((one, at) => playerCombatant({ ...one, name: `P${at}`, area, id: at === 0 ? 'a0' : `p${at}` }, content));
      if (rng.chance(0.3)) allies[0] = { ...allies[0], potions: engine.fightPotions({ healing: 1, mana: 1, antidote: 1, 'burn-brew': 1, 'fern-brew': 1 }, 0.5, content) };
      const encounter = rng.pick([...area.encounters, ...(area.tough ?? [])]);
      const level = area.minLevel + rng.int(0, area.maxLevel - area.minLevel);
      const enemies = encounterCombatants({ members: encounter.monsters.map((monsterId) => ({ monsterId, level })) }, content, { strength: engine.exploreStrength(area, party[0].character.level, content, rng.chance(0.2)) });
      deepFreeze(allies);
      deepFreeze(enemies);
      const fight = simulateFight({ allies, enemies, rng: createRng(`pve-fight:${index}`), content, record: true, trait: area.trait });
      for (const problem of logProblems(allies, enemies, fight)) problems.push(`pve:${index} ${problem}`);
      const again = simulateFight({ allies, enemies, rng: createRng(`pve-fight:${index}`), content, record: true, trait: area.trait });
      if (JSON.stringify(again) !== JSON.stringify(fight)) problems.push(`pve:${index} not the same fight twice`);
    }
    assert.deepEqual(problems.slice(0, 5), []);
  });

  test('fights between characters (Arena, guild wars): the log adds up to the result and numbers are sane', () => {
    const problems = [];
    for (let index = 0; index < 500; index++) {
      const rng = createRng(`pvp:${index}`);
      const size = rng.chance(0.5) ? 1 : rng.int(2, 5);
      const level = rng.pick([20, 60, 100, 150, 200, 300]);
      const shape = { factor: duelHpFactor(level, level, content), armor: duelArmorShare(level, level, content) };
      const team = (side, prefix) => Array.from({ length: size }, (_, at) => duelist(someCharacter(rng, { level }), `${prefix}${at}`, side, shape, content));
      const allies = team('ally', 'a');
      const enemies = team('enemy', 'e');
      const fight = simulateFight({ allies, enemies, rng: createRng(`pvp-fight:${index}`), content, record: true, maxActions: content.settlement.arena.duel.maxMoves * size, even: size > 1 });
      for (const problem of logProblems(allies, enemies, fight)) problems.push(`pvp:${index} ${problem}`);
    }
    assert.deepEqual(problems.slice(0, 5), []);
  });

  test('explorations: numbers are sane, the HP of each fight follows from the one before, and the same seed gives the same report', () => {
    const problems = [];
    const potionIds = content.potions.map((potion) => potion.id);
    for (let index = 0; index < 400; index++) {
      const rng = createRng(`hunt:${index}`);
      const { character, equipped } = someCharacter(rng);
      const area = rng.pick(content.areas.filter((one) => one.minLevel <= character.level + 1).concat(content.areas[0]));
      const maxHp = playerCombatant({ character, equipped, name: 'Próbny', area }, content).maxHp;
      const potions = Object.fromEntries(Array.from({ length: rng.int(0, 4) }, () => [rng.pick(potionIds), rng.int(1, 3)]));
      const buffs = Object.fromEntries(engine.TIMED_KINDS.filter(() => rng.chance(0.2)).map((kind) => [kind, { fights: rng.int(1, 5), bonus: rng.pick([0.1, 0.2, 0.35]) }]));
      const input = {
        character, equipped, name: 'Próbny', areaId: area.id, seed: `h${index}`, potions, buffs,
        hp: rng.chance(0.3) ? Math.max(1, Math.round(maxHp * rng.next())) : maxHp,
        minutes: rng.pick([1, 5, 15, 30, 60, 120, 240]),
        healBelow: rng.pick([0.2, 0.4, 0.7]),
        hard: rng.chance(0.2),
        companions: rng.chance(0.3) ? engine.drawCandidates({ character, seed: `c${index}` }, 1_800_000_000_000, content).slice(0, rng.int(1, 2)) : [],
      };
      const hunt = simulateHunt(input, content);
      for (const [path, value] of numbers({ xp: hunt.xp, gold: hunt.gold, hpStart: hunt.hpStart, hpEnd: hunt.hpEnd, resources: hunt.resources, materials: hunt.materials, potionsUsed: hunt.potionsUsed })) {
        if (!Number.isFinite(value) || value < 0) problems.push(`h${index} ${path} ${value}`);
      }
      if (hunt.hpEnd > hunt.maxHp) problems.push(`h${index} hpEnd ${hunt.hpEnd} > ${hunt.maxHp}`);
      for (const [id, count] of Object.entries(hunt.potionsUsed)) if (count > (potions[id] ?? 0)) problems.push(`h${index} drank ${count} ${id} of ${potions[id] ?? 0}`);
      let hp = hunt.hpStart;
      for (const fight of hunt.fights) {
        if (fight.hpBefore !== hp) problems.push(`h${index} fight ${fight.index}: hpBefore ${fight.hpBefore}, the one before left ${hp}`);
        hp = fight.won === true ? fight.hpAfter + fight.recovered : fight.hpAfter;
      }
      if (hunt.fights.reduce((sum, fight) => sum + fight.xp, 0) !== hunt.xp) problems.push(`h${index} the fights' XP do not add up`);
      if (JSON.stringify(simulateHunt(input, content)) !== JSON.stringify(hunt)) problems.push(`h${index} not the same report twice`);
    }
    assert.deepEqual(problems.slice(0, 5), []);
  });

  test('skill cards tell the turns, ticks, hits and blows the fight counts, at every level', () => {
    const wrong = [];
    for (const skill of [...content.skills, ...content.evolutionSkills]) {
      for (let level = 1; level <= topLevel(skill, content); level++) {
        const params = skillParams(skill, level, content);
        const card = skillView(skill, level, content).effect;
        for (const key of ['turns', 'dotTicks', 'markTurns', 'hotTurns', 'blows', 'pierces', 'stunMoves']) {
          if (typeof params[key] !== 'number' || !skill.effect.includes(`{${key}`)) continue;
          if (!card.includes(String(Math.round(params[key])))) wrong.push(`${skill.id} ${level}: ${key} ${Math.round(params[key])} not in "${card}"`);
        }
        for (const [key, value] of Object.entries(params)) if (typeof value === 'number' && !Number.isFinite(value)) wrong.push(`${skill.id} ${level}: ${key} ${value}`);
      }
    }
    assert.deepEqual(wrong.slice(0, 5), []);
  });

  test('item cards tell the damage, armour and stats the fight and the stats screen count', () => {
    const wrong = [];
    for (let index = 0; index < 300; index++) {
      const rng = createRng(`item:${index}`);
      const { character, equipped } = someCharacter(rng);
      const { totals, sources, bonuses } = computeStats(character, equipped, content);
      let armour = 0;
      for (const item of equipped) {
        const lines = itemProperties(item, content);
        const worn = upgradedItem(item, content);
        if (worn.damage && !lines[0].includes(`${worn.damage.min}–${worn.damage.max}`)) wrong.push(`${item.base}: ${lines[0]}`);
        armour += worn.armor ?? 0;
        for (const { stat, value } of [...(worn.implicit ? [worn.implicit] : []), ...worn.affixes]) {
          if (stat === 'armor') armour += value;
          if (!lines.some((line) => line.endsWith(`+${value}`))) wrong.push(`${item.base}: ${stat} +${value} not on the card`);
        }
      }
      if (armour !== bonuses.armor) wrong.push(`armour ${armour} on the cards, ${bonuses.armor} counted`);
      for (const stat of content.statIds) {
        const source = sources[stat];
        if (totals[stat] !== source.class + source.character + source.professions + source.equipment + source.core) wrong.push(`${stat} total`);
      }
      const weapon = equipped.find((item) => item.slot === 'weapon');
      if (weapon) {
        const unit = playerCombatant({ character, equipped, name: 'Próbny' }, content);
        const worn = upgradedItem(weapon, content);
        if (unit.weapon.min !== worn.damage.min || unit.weapon.max !== worn.damage.max) wrong.push(`weapon ${weapon.base}: card ${worn.damage.min}–${worn.damage.max}, fight ${unit.weapon.min}–${unit.weapon.max}`);
      }
    }
    assert.deepEqual(wrong.slice(0, 5), []);
  });

  test('a strengthening potion and a fight potion do in the fight what their numbers say', () => {
    const { character, equipped } = typicalCharacter('archer', 40, content);
    const area = areaFor(40);
    const unit = playerCombatant({ character, equipped, name: 'Próbny', area }, content);
    const on = fightingPlayer({ unit, character, equipped, name: 'Próbny', area, hp: unit.maxHp, on: { speed: 0.25, armor: 0.3, damage: 0.2, ward: 0.35 } }, content);
    assert.equal(on.speed, unit.speed * 1.25);
    assert.equal(on.armor, Math.round(unit.armor * 1.3));
    assert.equal(on.damageBonus, 0.2);
    assert.equal(on.ward, 0.35);
    // A healing potion is drunk once, below its mark, for its share of HP.
    const kit = engine.fightPotions({ healing: 3 }, 0.5, content);
    const wolves = [0, 1, 2].map((index) => monsterCombatant({ monsterId: 'wolf', level: 45, id: `e${index}` }, content));
    const fight = simulateFight({ allies: [{ ...unit, potions: kit }], enemies: wolves, rng: createRng('potion'), content, record: true });
    const drunk = fight.events.filter((event) => event.kind === 'potion');
    assert.ok(drunk.length <= 1);
    for (const event of drunk) assert.ok(event.hp - event.amount < 0.5 * unit.maxHp && event.amount <= Math.round(content.potionsById.healing.effect.heal * unit.maxHp));
  });
});

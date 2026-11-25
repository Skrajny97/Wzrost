// A sweep at a summoner whose summon stands (24.11.2026). A player at level
// 97, through the author: „Zauważyłem że gdy atakując nekromantę, przy
// ‚deszczu meteorów’ szkielet przyjmuje ten czar na siebie ale nie traci on
// życia, w efekcie czar ten nie robi nic ani nekromancie ani
// przywołańcowi”. The engine was right: a summon stands before its
// summoner and takes the foes' blows meant for it (DECISIONS.md,
// „Przywołańce we własnej karcie”: „cios przejmuje przywołaniec”), a sweep's
// too, so the Deszcz meteorów's blow meant for the Nekromanta lands on its
// skeleton, which loses that HP, and the Nekromanta keeps its own. The
// playback was not: the meteors fell on the Nekromanta's card, whose HP did
// not move, and the skeleton's wound came after them as a blow of its own,
// a bolt from the Arcymag. Now the summon's hit names the blow's skill and
// that it was one of many (`sweep`), and the playback lands the sweep's
// look on the summon's card, its wound at once with the sweep's other
// blows (src/client/sweep-landing.js, src/client/arena.js).

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { sweepMoment } from '../src/client/sweep-landing.js';
import { arenaDuel, createRng, duelArmorShare, duelHpFactor, duelist, monsterCombatant, playerCombatant, simulateFight } from '../src/engine/index.js';
import { playerOf } from '../tools/difficulty-sim.mjs';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';

const MOVES = new Set(['hit', 'crit', 'dodge']);

// The summons standing by each summoner as a fight's events tell it, in the
// order the engine keeps them (combat.js: the one called first in front, a
// knight of the Wieczny legion that rises again back in front), each with
// its HP: what the summon in front had before a blow it takes.
function summonsLedger() {
  /** @type {Map<string, { skill: string, order: number | undefined, hp: number }[]>} */
  const byOwner = new Map();
  const of = (owner) => byOwner.get(owner) ?? [];
  // The summon a `summon` event is about: by its skill and its place in a
  // pack or the Wieczny legion (`summonOrder`), else the first of its skill.
  const find = (event) => of(event.target).find((one) => one.skill === event.summonSkill && (event.summonOrder === undefined || one.order === event.summonOrder));
  return {
    standing: (owner) => of(owner).length,
    hpBefore: (event) => find(event)?.hp,
    apply(event) {
      if (event.kind === 'kill') byOwner.delete(event.target);
      if (event.kind !== 'summon') return;
      const list = of(event.target);
      if (event.state === 'up') {
        const returns = Boolean(content.skillsById[event.skill]?.params.returns);
        if (returns && event.order !== undefined) {
          byOwner.set(event.target, [{ skill: event.skill, order: event.order, hp: event.summonHp }, ...list]);
          return;
        }
        const count = Math.max(1, event.count ?? 1);
        const called = Array.from({ length: count }, (_, index) => ({ skill: event.skill, order: event.order ?? (returns ? index + 1 : undefined), hp: event.summonHp }));
        byOwner.set(event.target, [...list, ...called]);
      } else if (event.state === 'hit') {
        const one = find(event);
        if (one) one.hp = event.summonHp;
      } else {
        const one = find(event);
        byOwner.set(event.target, list.filter((each) => each !== one));
      }
    },
  };
}

// Each moment of a sweep of `skillId` by `sweeper` while a summon of a foe
// it strikes stands: the sweep's call (`at`, `event`), the events of its
// moment, the foes with a summon (`guarded`), the HP each summon a blow of
// the moment lands on had before it (`befores`) and each unit's HP as the
// sweep was called (`hp`).
function sweepsAtSummons(events, sweeper, skillId) {
  const ledger = summonsLedger();
  const hp = new Map();
  const found = [];
  let open = null;
  for (const [at, event] of events.entries()) {
    if (open && (event.t !== open.event.t || event.kind === 'skill')) open = null;
    if (event.kind === 'skill' && event.actor === sweeper && event.skill === skillId && event.targets) {
      const guarded = event.targets.filter((id) => ledger.standing(id) > 0);
      open = guarded.length > 0 ? { at, event, guarded, moment: [], befores: [], hp: new Map(hp) } : null;
      if (open) found.push(open);
    } else if (open) {
      open.moment.push(event);
      if (event.kind === 'summon' && event.state === 'hit') open.befores.push(ledger.hpBefore(event));
    }
    ledger.apply(event);
    if (event.hp !== undefined && event.target) hp.set(event.target, event.hp);
  }
  return found;
}

// The cards of summons as the playback keeps them (arena.js summonUp,
// summonRemove, summonFor and fallen()) after the events before `at`, and
// the card a `summon` event at `at` is about, as sweepOf asks for it.
function playbackCards(events, at) {
  /** @type {Map<string, { id: string, owner: string, skill: string, order: number, down: boolean }>} */
  const cards = new Map();
  const key = (owner, skill, order = 1) => `${owner} ${skill}${order > 1 ? ` ${order}` : ''}`;
  const of = (owner) => [...cards.values()].filter((card) => card.owner === owner);
  const summonFor = (event, passed = null) => {
    const squad = of(event.target).filter((card) => card.skill === (event.summonSkill ?? event.skill));
    const own = event.summonOrder ? squad.find((card) => card.order === event.summonOrder) : null;
    return own ?? squad.find((card) => !card.down && !passed?.has(card.id)) ?? squad[0] ?? of(event.target)[0] ?? null;
  };
  for (const event of events.slice(0, at)) {
    if (event.kind === 'kill') for (const card of of(event.target)) cards.delete(key(card.owner, card.skill, card.order));
    if (event.kind !== 'summon') continue;
    if (event.state === 'up') {
      const first = event.order ?? 1;
      for (let order = first; order < first + Math.max(1, event.count ?? 1); order++) {
        if (cards.has(key(event.target, event.skill, order))) {
          cards.get(key(event.target, event.skill, order)).down = false;
          continue;
        }
        for (const old of of(event.target)) if (old.down) cards.delete(key(old.owner, old.skill, old.order));
        cards.set(key(event.target, event.skill, order), { id: `${event.target}~summon~${event.skill}${order > 1 ? `~${order}` : ''}`, owner: event.target, skill: event.skill, order, down: false });
      }
    } else {
      const card = summonFor(event);
      if (!card) continue;
      if (event.state === 'gone') cards.delete(key(card.owner, card.skill, card.order));
      if (event.state === 'fell') card.down = true;
    }
  }
  return (event, fallen) => summonFor(event, fallen)?.id ?? null;
}

// A character of a form (its class's typical character of `level` at
// `classLevel`) with only `skills` of its own at `skillLevel`, as a player
// in a fight of players, with HP and mana that last a long fight.
function formOf(evolutionId, { id, side, skills, classLevel, level, skillLevel = 60 }) {
  const evolution = content.evolutionsById[evolutionId];
  const { character, equipped } = typicalCharacter(evolution.classId, level, content);
  const own = Object.fromEntries(skills.map((skill) => [skill, skillLevel]));
  const unit = playerCombatant({ character: { ...character, classLevel, skills: own, evolution: evolutionId }, equipped, name: evolution.name, id, side }, content);
  return { ...unit, hp: 1e6, maxHp: 1e6, mana: 1e6, maxMana: 1e6 };
}

describe('a sweep at a summoner whose summon stands', () => {
  const level = 97;
  const arcymag = { ...playerOf('realistic', 'mage', level, content, 0, 'fireball'), name: 'Arcymag' };
  const nekromanta = { ...playerOf('realistic', 'shadow', level, content, 0, 'poisoned-blade'), name: 'Nekromanta' };
  // The Arena's duels of the two second forms, the Arcymag attacking and
  // defending, as the player's.
  const duels = Array.from({ length: 8 }, (_, seed) => [
    { fight: arenaDuel({ attacker: arcymag, defender: nekromanta, seed: `meteors-${seed}` }, content).fight, mage: 'a0', necro: 'e0' },
    { fight: arenaDuel({ attacker: nekromanta, defender: arcymag, seed: `meteors-${seed}` }, content).fight, mage: 'e0', necro: 'a0' },
  ]).flat();

  test('the player\'s duel: Deszcz meteorów lands on the Nekromanta\'s skeleton, which loses the blow\'s HP, and the Nekromanta keeps its own', () => {
    assert.equal(arcymag.character.evolution, 'archmage');
    assert.equal(nekromanta.character.evolution, 'necromancer');
    let meteors = 0;
    let felled = 0;
    for (const { fight, mage, necro } of duels) {
      for (const { moment, befores, hp } of sweepsAtSummons(fight.events, mage, 'meteor-shower')) {
        meteors += 1;
        // The blow meant for the Nekromanta, on the skeleton in front of it.
        const taken = moment.filter((event) => event.kind === 'summon' && event.state === 'hit' && event.actor === mage);
        assert.equal(taken.length, 1, JSON.stringify(moment));
        const [hit] = taken;
        assert.equal(hit.actor, mage);
        assert.equal(hit.target, necro);
        assert.equal(hit.summonSkill, 'raise-dead');
        assert.ok(hit.damage > 0);
        // It loses the blow's HP, all of it while it has HP for it.
        assert.equal(hit.summonHp, Math.max(0, befores[0] - hit.damage), JSON.stringify({ before: befores[0], hit }));
        assert.match(hit.text, /^Szkielet wojownik przyjmuje cios \(Deszcz meteorów\) i traci \d+ HP\.$/);
        // The event says whose blow it was and that it was one of many, so
        // the playback lands it with the meteors.
        assert.equal(hit.skill, 'meteor-shower');
        assert.equal(hit.skillName, 'Deszcz meteorów');
        assert.equal(hit.sweep, true);
        if (hit.summonHp === 0) {
          felled += 1;
          assert.ok(moment.some((event) => event.kind === 'summon' && event.state === 'fell' && event.target === necro));
        }
        // The Nekromanta is not struck and keeps its HP.
        assert.equal(moment.filter((event) => MOVES.has(event.kind) && event.target === necro).length, 0);
        // (Another unit's move may round to the same moment: only what the
        // Arcymag's move did counts.)
        const kept = hp.get(necro) ?? fight[necro === 'a0' ? 'allies' : 'enemies'][0].hp;
        assert.equal(hit.hp, kept);
        assert.ok(moment.every((event) => event.actor !== mage || event.target !== necro || event.hp === kept));
      }
    }
    assert.ok(meteors >= 10, `${meteors} meteors at a standing skeleton`);
    assert.ok(felled >= 1, 'no skeleton fell to the meteors');
  });

  test('the playback lands the meteors on the skeleton\'s card, not the Nekromanta\'s, and a fight kept from before plays as it did', () => {
    let checked = 0;
    for (const { fight, mage, necro } of duels) {
      for (const { at, event } of sweepsAtSummons(fight.events, mage, 'meteor-shower')) {
        const cardOf = playbackCards(fight.events, at);
        const skeleton = `${necro}~summon~raise-dead`;
        const moment = sweepMoment(fight.events, at, cardOf);
        assert.deepEqual(event.targets, [necro]);
        assert.deepEqual(moment.targets, [skeleton]);
        assert.deepEqual(moment.struck, [skeleton]);
        assert.deepEqual(moment.blows, [{ target: skeleton, hit: true }]);
        assert.equal(moment.turn, 1);
        // A kept fight's summon hits have no mark: its meteors fall on the
        // Nekromanta, as they did.
        const kept = fight.events.map((one) => (one.kind === 'summon' ? (({ sweep, skill, skillName, ...rest }) => rest)(one) : one));
        assert.deepEqual(sweepMoment(kept, at, playbackCards(kept, at)).targets, [necro]);
        checked += 1;
      }
    }
    assert.ok(checked >= 10, `${checked} meteors checked`);
  });

  test('the Deszcz meteorów at a Nekromanta without a summon strikes the Nekromanta itself', () => {
    let direct = 0;
    for (const { fight, mage, necro } of duels) {
      const ledger = summonsLedger();
      for (const [at, event] of fight.events.entries()) {
        if (event.kind === 'skill' && event.actor === mage && event.skill === 'meteor-shower' && ledger.standing(necro) === 0) {
          const next = fight.events[at + 1];
          assert.ok(MOVES.has(next.kind) && next.target === necro && next.sweep, JSON.stringify(next));
          assert.deepEqual(sweepMoment(fight.events, at, playbackCards(fight.events, at)).targets, [necro]);
          direct += 1;
        }
        ledger.apply(event);
      }
    }
    assert.ok(direct >= 5, `${direct} meteors at a Nekromanta alone`);
  });

  test('every summon that takes the foes\' blows takes a sweep\'s blow meant for its summoner and loses its HP; the summoner keeps its own', () => {
    // Every form with a summoning skill, each against an Arcymag Żywiołów
    // with only the Deszcz meteorów, in a long fight of players.
    const stage = (id) => content.evolutionsById[id].stage;
    const summoners = content.evolutions.filter((evolution) => evolution.skills.some((skill) => content.skillsById[skill]?.kind === 'summon'));
    assert.deepEqual(
      summoners.map((evolution) => evolution.id).sort(),
      ['arcanist', 'archdruid', 'beast-lord', 'druid', 'elder-druid', 'heaven-sword', 'hunt-god', 'lich', 'master-hunter', 'navia-emperor', 'navia-king', 'necromancer', 'poisoner', 'primordial', 'wild-lord', 'wilds-father'],
    );
    // Each summoning skill on its own: its summons in front of its user.
    for (const evolution of summoners) {
      const classLevel = [0, 70, 130, 230, 330, 430][stage(evolution.id)];
      for (const skill of evolution.skills.filter((id) => content.skillsById[id].kind === 'summon')) {
        const summoner = formOf(evolution.id, { id: 'e0', side: 'enemy', skills: [skill], classLevel, level: Math.round(classLevel / 1.15) });
        const mage = formOf('archmage', { id: 'a0', side: 'ally', skills: ['meteor-shower'], classLevel: 120, level: 100 });
        const fight = simulateFight({ allies: [mage], enemies: [summoner], rng: createRng(`sweep-summons:${skill}`), content, record: true, maxActions: 160, even: true });
        let landed = 0;
        for (const { moment, befores, hp } of sweepsAtSummons(fight.events, 'a0', 'meteor-shower')) {
          // A blow of one blinded (the Miecz Niebios's sacrum blinds) may
          // miss before any summon takes it.
          const missed = moment.filter((event) => event.kind === 'dodge' && event.actor === 'a0' && event.target === 'e0' && event.missed);
          const taken = moment.filter((event) => event.kind === 'summon' && event.state === 'hit' && event.actor === 'a0');
          assert.equal(taken.length + missed.length, 1, `${skill}: ${JSON.stringify(moment)}`);
          if (missed.length > 0) continue;
          landed += 1;
          const [hit] = taken;
          assert.equal(hit.summonSkill, skill);
          // The summon loses the blow's HP, all of it while it has HP for it.
          assert.equal(hit.summonHp, Math.max(0, befores[0] - hit.damage), `${skill}: ${JSON.stringify({ before: befores[0], hit })}`);
          assert.ok(hit.damage > 0 && hit.sweep === true && hit.skill === 'meteor-shower', `${skill}: ${JSON.stringify(hit)}`);
          // The summoner is not struck and keeps its HP.
          assert.equal(moment.filter((event) => MOVES.has(event.kind) && event.target === 'e0').length, 0, skill);
          // (Another unit's move may round to the same moment: only what
          // the Arcymag's move did counts.)
          const kept = hp.get('e0') ?? summoner.maxHp;
          assert.equal(hit.hp, kept, skill);
          assert.ok(moment.every((event) => event.actor !== 'a0' || event.target !== 'e0' || event.hp === undefined || event.hp === kept), skill);
        }
        assert.ok(landed >= 3, `${skill}: ${landed} meteors on a standing summon`);
      }
    }
  });

  test('the Cień-sobowtór and the Kula piorunów take no blows: a sweep at their user strikes the user', () => {
    for (const [evolutionId, skill, classLevel] of [['phantom', 'shadow-double', 130], ['thunder-lord', 'thunder-orb', 130]]) {
      const user = formOf(evolutionId, { id: 'e0', side: 'enemy', skills: [skill], classLevel, level: 110 });
      const mage = formOf('archmage', { id: 'a0', side: 'ally', skills: ['meteor-shower'], classLevel: 120, level: 100 });
      const fight = simulateFight({ allies: [mage], enemies: [user], rng: createRng(`sweep-summons:${evolutionId}`), content, record: true, maxActions: 80, even: true });
      assert.ok(fight.events.some((event) => event.kind === 'skill' && event.actor === 'e0' && event.skill === skill), evolutionId);
      assert.equal(fight.events.filter((event) => event.kind === 'summon').length, 0, evolutionId);
      const meteors = fight.events.filter((event) => event.actor === 'a0' && event.skill === 'meteor-shower' && MOVES.has(event.kind));
      assert.ok(meteors.length >= 5 && meteors.every((event) => event.target === 'e0'), evolutionId);
    }
  });

  test('in a guild war\'s battle the meteors land on the summon of each foe that has one and on the others themselves', () => {
    // A battle of three on three as guild-wars.js fights it (duelists, an
    // even fight): the Arcymag against a Nekromanta, a Druid and a Wojownik.
    const shape = { factor: duelHpFactor(level, level, content), armor: duelArmorShare(level, level, content) };
    const fighter = (one, name) => ({ character: one.character, equipped: one.equipped, name });
    const druid = playerOf('realistic', 'mage', level, content, 0, 'mana-shield');
    const wojownik = playerOf('realistic', 'warrior', level, content, 0);
    const lasting = (unit) => ({ ...unit, hp: 1e6, maxHp: 1e6 });
    const allies = [lasting(duelist(fighter(arcymag, 'Arcymag'), 'a0', 'ally', shape, content))];
    const enemies = [
      lasting(duelist(fighter(nekromanta, 'Nekromanta'), 'e0', 'enemy', shape, content)),
      lasting(duelist(fighter(druid, 'Druid'), 'e1', 'enemy', shape, content)),
      lasting(duelist(fighter(wojownik, 'Wojownik'), 'e2', 'enemy', shape, content)),
    ];
    const fight = simulateFight({ allies, enemies, rng: createRng('sweep-summons:war'), content, record: true, maxActions: 200, even: true });
    let guarded = 0;
    for (const { at, event, moment, guarded: shielded } of sweepsAtSummons(fight.events, 'a0', 'meteor-shower')) {
      const landing = sweepMoment(fight.events, at, playbackCards(fight.events, at));
      for (const [index, id] of event.targets.entries()) {
        const taken = moment.filter((one) => one.kind === 'summon' && one.state === 'hit' && one.actor === 'a0' && one.target === id);
        const struck = moment.filter((one) => MOVES.has(one.kind) && one.actor === 'a0' && one.target === id);
        if (shielded.includes(id)) {
          // The summon took the blow (a miss in the dark aside): the look
          // lands on its card.
          assert.equal(taken.length + struck.filter((one) => one.missed).length, 1, JSON.stringify(moment));
          assert.equal(struck.filter((one) => !one.missed).length, 0);
          if (taken.length === 1) {
            assert.match(landing.targets[index], new RegExp(`^${id}~summon~`));
            guarded += 1;
          }
        } else {
          assert.equal(taken.length, 0);
          assert.equal(landing.targets[index], id);
        }
      }
    }
    assert.ok(guarded >= 5, `${guarded} blows of the meteors at a summon`);
  });

  test('an exploration: a creature\'s blow at the whole line meant for a Nekromanta lands on its skeleton, marked as one of many; its blow at one is not', () => {
    // Stolem (Cios w cały szyk) against a Wojownik in front and a Nekromanta
    // at the back.
    const necro = playerOf('realistic', 'shadow', 100, content, 0, 'poisoned-blade');
    const knight = playerOf('realistic', 'warrior', 100, content, 0);
    const allies = [
      { ...playerCombatant({ character: necro.character, equipped: necro.equipped, name: 'Nekromanta', id: 'a0' }, content), position: 'back', hp: 1e6, maxHp: 1e6 },
      { ...playerCombatant({ character: knight.character, equipped: knight.equipped, name: 'Wojownik', id: 'a1' }, content), position: 'front', hp: 1e6, maxHp: 1e6 },
    ];
    const stolem = monsterCombatant({ monsterId: 'stolem', level: 98, id: 'e0' }, content);
    assert.ok(stolem.weapon.cleave > 0);
    const fight = simulateFight({ allies, enemies: [{ ...stolem, hp: 1e6, maxHp: 1e6 }], rng: createRng('sweep-summons:stolem'), content, record: true, maxActions: 80 });
    const hits = fight.events.filter((event) => event.kind === 'summon' && event.state === 'hit' && event.actor === 'e0');
    // The cleave's blow comes right after its blow at the Wojownik.
    const cleaved = hits.filter((event) => event.sweep);
    const single = hits.filter((event) => !event.sweep);
    assert.ok(cleaved.length >= 3, `${cleaved.length} cleaves at the skeleton`);
    assert.ok(single.length >= 1, `${single.length} blows at the Nekromanta alone`);
    for (const hit of cleaved) {
      const at = fight.events.indexOf(hit);
      const before = fight.events.slice(0, at).reverse().find((event) => event.actor === 'e0' && (MOVES.has(event.kind) || event.kind === 'summon'));
      assert.equal(before.target, 'a1', JSON.stringify(before));
      assert.equal(hit.skill, undefined);
    }
  });

  test('the playback\'s sweep moment: a summon that falls passes the next blow of the moment to the one behind it', () => {
    // Two knights of a Legion Nawii stand by e0; the first falls to the
    // sweep's blow, and its chained blow lands on the second.
    const events = [
      { t: 1, kind: 'summon', state: 'up', actor: 'e0', target: 'e0', skill: 'navia-legion', summon: 'Szkieletowy rycerz', count: 2, summonHp: 100 },
      { t: 5, kind: 'skill', actor: 'a0', skill: 'perun-wrath', targets: ['e0', 'e1'] },
      { t: 5, kind: 'summon', state: 'hit', actor: 'a0', target: 'e0', skill: 'perun-wrath', sweep: true, summonSkill: 'navia-legion', summonHp: 0, damage: 150 },
      { t: 5, kind: 'summon', state: 'fell', actor: 'e0', target: 'e0', summonSkill: 'navia-legion', summonHp: 0 },
      { t: 5, kind: 'hit', actor: 'a0', target: 'e1', skill: 'perun-wrath', sweep: true, damage: 90, hp: 10 },
      { t: 5, kind: 'summon', state: 'hit', actor: 'a0', target: 'e0', skill: 'perun-wrath', sweep: true, summonSkill: 'navia-legion', summonHp: 40, damage: 60 },
      { t: 9, kind: 'hit', actor: 'e1', target: 'a0', damage: 5, hp: 95 },
    ];
    const moment = sweepMoment(events, 1, playbackCards(events, 1));
    assert.deepEqual(moment.targets, ['e0~summon~navia-legion', 'e1']);
    assert.deepEqual(moment.struck, ['e0~summon~navia-legion', 'e1', 'e0~summon~navia-legion~2']);
    assert.deepEqual(moment.blows, [
      { target: 'e0~summon~navia-legion', hit: true },
      { target: 'e1', hit: true },
      { target: 'e0~summon~navia-legion~2', hit: true },
    ]);
  });
});

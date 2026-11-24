// The Druid line's summons on explorations and in duels (24.11.2026; the
// author: „Druid jest za silny na Arenie a za słaby na wyprawach coś z tym
// musimy zrobić”; DECISIONS.md, „Druid: przywołańce na wyprawach i na
// Arenie”). On an exploration each summon of the Druid's two cost half of
// the maximum mana (25% twice, balance.skills.manaCost.manaShareFactor,
// 0.4.85) and the mana goes on from fight to fight (1220 B), so the Druid
// called one a fight and its second summon (two at once since 0.4.89)
// hardly ever came: it was the weakest path on explorations at every level.
// Now one summoned creature costs a quarter of the maximum mana there,
// across the line: the Ent, the Bear and the Prastary dąb a quarter each,
// a pack of two (Zew zwierząt, Gaj wieków, Pradawne stado) half, as
// before. A duel starts with full mana and pays the data's share once
// (balance.skills.duelManaCost), and the Druid line's mana never runs
// short in one: the price changes no duel.
//
// Then (the same day; the author: „Ogólnie Druid powinien czerpać siłę z
// przywołańców, niech oni jakoś ściągają aggro i w ogóle niech się
// wyróżniają”, after players' words: a Druid's plain attack in the Arena's
// table showed twice anyone's, „one crit and it's over”, and from level 150
// its summons fell to a single blow and it climbed the Wieża Solo poorly):
// - in the players' duels the line's own blows are as anyone's (no
//   duelPower: the Druid had ×1.9, the Arcydruid ×1.3, the Pradruid ×0.8 on
//   all its blows), and its duel strength is in its summons' blows
//   (evolutions.json duelSummonPower: Druid 1.35, Arcydruid 0.8, Pradruid
//   0.42), so the Arena's table shows the attack its blows have;
// - its summons draw the foes' blows: while one stands, the foes and their
//   summons choose among such Druids only and the summon in front takes
//   the blow (the trait's `lure`; combat.js lured, after Wyzwanie's
//   challenger), which the playback shows (skill-fx.js lure);
// - each summon has 75% of the Druid's maximum HP on top of its share of
//   the mana (`summonLife`), in a duel of the HP before the duel's factor;
// - the Druid's Ent and Bear and the Arcydruid's Zew zwierząt stay 5 moves
//   instead of 4, and the Pradruid's Pradawne stado, grown from it, 6
//   instead of 5.
// DECISIONS.md has the measurements: the Arena, the biggest blows, the
// summons against elites and champions, explorations, the Wieża Solo and
// the guild wars' 3v3.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import {
  arenaDuel,
  buildContent,
  combatantView,
  companionForm,
  createRng,
  duelArmorShare,
  duelHpFactor,
  duelist,
  monsterCombatant,
  playerCombatant,
  simulateFight,
  simulateHunt,
  skillCost,
  skillView,
  towerFight,
  warBattle,
} from '../src/engine/index.js';
import { measureClass } from '../tools/class-balance-sim.mjs';
import { GEAR_SETS, companionsOf, newestArea, playerOf, withArea } from '../tools/difficulty-sim.mjs';
import { loadData } from '../tools/validate-data.mjs';
import { content } from './helpers/content.js';

const FORMS = ['druid', 'archdruid', 'elder-druid'];
const SINGLES = ['ent-summon', 'bear-summon', 'oak-awakening'];
const PACKS = ['bison-call', 'oak-of-ages', 'ancient-herd'];

// The game as it was before: each single summon priced at a quarter of the
// maximum mana in the data (half of it on an exploration).
const before = (() => {
  const raw = loadData();
  for (const skill of raw.evolutions.skills) if (SINGLES.includes(skill.id)) skill.manaShare = 0.25;
  return buildContent(raw);
})();

// The realistic player of tools/difficulty-sim.mjs of the Druid's path at a
// level (its first draw of the gear).
const druidAt = (level, data = content) => playerOf('realistic', 'mage', level, data, 0, 'mana-shield');

describe('the Druid line\'s summons: a quarter of the maximum mana a creature on an exploration', () => {
  test('in the data each summoned creature of the Druid\'s forms costs the same share: the single summons 12.5%, the packs of two 25%', () => {
    const shareFactor = content.balance.skills.manaCost.manaShareFactor;
    assert.equal(shareFactor, 2);
    for (const id of FORMS) {
      for (const skillId of content.evolutionsById[id].skills) {
        const skill = content.skillsById[skillId];
        assert.equal(skill.kind, 'summon', skillId);
        const creatures = skill.params.pack?.length ?? 1;
        assert.equal(skill.manaShare / creatures, 0.125, skillId);
        // On an exploration: a quarter of the maximum mana a creature.
        assert.equal(skill.manaShare * shareFactor, creatures * 0.25, skillId);
      }
    }
    assert.deepEqual(SINGLES.map((id) => content.skillsById[id].params.pack), [undefined, undefined, undefined]);
    assert.deepEqual(PACKS.map((id) => content.skillsById[id].params.pack.length), [2, 2, 2]);
  });

  test('the cards: „Koszt: 25% maks. many” for the Ent, the Bear and the Prastary dąb, 50% for a pack, in Polish and in English', () => {
    for (const id of SINGLES) assert.equal(skillView(content.skillsById[id], 30, content).cost, 'Koszt: 25% maks. many, najwyżej co 10. ruch.', id);
    for (const id of PACKS) assert.equal(skillView(content.skillsById[id], 30, content).cost, 'Koszt: 50% maks. many, najwyżej co 10. ruch.', id);
    const english = JSON.parse(readFileSync(new URL('../data/en/texts.json', import.meta.url), 'utf8'));
    const en = { ...content, texts: { ...content.texts, skillCostShare: english.skillCostShare } };
    assert.equal(skillCost(content.skillsById['ent-summon'], en), 'Cost: 25% of max mana, at most once every 10 turns.');
    assert.equal(skillCost(content.skillsById['bison-call'], en), 'Cost: 50% of max mana, at most once every 10 turns.');
  });

  test('a Druid pays a quarter of its maximum mana for the Ent and for the Bear on an exploration, an eighth in a duel', () => {
    const { character, equipped } = druidAt(100);
    const unit = playerCombatant({ character, equipped, name: 'Druid' }, content);
    const cost = (fighter, id) => fighter.skills.find((skill) => skill.id === id).mana;
    for (const id of ['ent-summon', 'bear-summon']) {
      assert.equal(cost(unit, id), Math.round(unit.maxMana * 0.25), id);
      assert.equal(cost(playerCombatant({ character, equipped, name: 'Druid' }, before), id), Math.round(unit.maxMana * 0.5), id);
      const duel = duelist({ character, equipped, name: 'Druid' }, 'a0', 'ally', { factor: 3, armor: 0.45 }, content);
      assert.equal(cost(duel, id), Math.round(unit.maxMana * 0.125), id);
    }
  });

  test('with half its mana left (as an exploration\'s later fights start) the Druid has the Ent and the Bear at once; at the old price only ever one', () => {
    const { character, equipped } = druidAt(100);
    const foe = () => ({ ...monsterCombatant({ monsterId: 'boar', level: 98, id: 'e0' }, content), hp: 1e6, maxHp: 1e6 });
    // The most summons standing at once in a long fight with a sturdy foe,
    // the Druid starting it with half its maximum mana.
    const most = (data) => {
      const unit = playerCombatant({ character, equipped, name: 'Druid' }, data);
      const result = simulateFight({ allies: [{ ...unit, mana: Math.round(unit.maxMana * 0.5) }], enemies: [foe()], rng: createRng('pol-many'), content: data, record: true, maxActions: 60 });
      const standing = new Set();
      let peak = 0;
      for (const event of result.events) {
        if (event.kind !== 'summon' || !['up', 'gone', 'fell'].includes(event.state)) continue;
        if (event.state === 'up') standing.add(event.skill);
        else standing.delete(event.summonSkill ?? event.skill);
        peak = Math.max(peak, standing.size);
      }
      return peak;
    };
    assert.equal(most(content), 2);
    assert.equal(most(before), 1);
  });
});

describe('the Druid line\'s summons draw the foes\' blows and stand longer', () => {
  // The game without the trait's lure.
  const unlured = (() => {
    const raw = loadData();
    for (const form of raw.evolutions.evolutions) if (FORMS.includes(form.id)) delete form.trait.params.lure;
    return buildContent(raw);
  })();
  // A Druid at the back with a Wojownik in front, against three sturdy
  // boars; `data` with or without the trait's lure.
  const party = (data) => {
    const { character, equipped } = druidAt(100, data);
    const druid = { ...playerCombatant({ character, equipped, name: 'Druid' }, data), position: 'back' };
    const { character: knight, equipped: kit } = playerOf('realistic', 'warrior', 100, data, 0);
    const warrior = { ...playerCombatant({ character: knight, equipped: kit, name: 'Wojownik', id: 'a1' }, data), position: 'front' };
    const boars = ['e0', 'e1', 'e2'].map((id) => ({ ...monsterCombatant({ monsterId: 'boar', level: 98, id }, data), hp: 1e6, maxHp: 1e6 }));
    return simulateFight({ allies: [druid, warrior], enemies: boars, rng: createRng('druid-lure'), content: data, record: true, maxActions: 60 });
  };
  // The creatures' blows at the Wojownik while a summon of the Druid stands.
  const shieldedBlows = (result) => {
    let standing = 0;
    let atWarrior = 0;
    let atSummons = 0;
    for (const event of result.events) {
      if (event.kind === 'summon' && event.target === 'a0' && event.state === 'up') standing += 1;
      else if (event.kind === 'summon' && event.target === 'a0' && ['gone', 'fell'].includes(event.state)) standing -= 1;
      else if (standing > 0 && event.actor?.startsWith('e') && event.target === 'a1' && ['hit', 'crit', 'dodge'].includes(event.kind)) atWarrior += 1;
      else if (standing > 0 && event.actor?.startsWith('e') && event.kind === 'summon' && event.state === 'hit') atSummons += 1;
    }
    return { atWarrior, atSummons };
  };

  test('while a summon stands every creature strikes the Druid and the summon takes the blow; without the lure they strike the Wojownik in front too', () => {
    assert.deepEqual(FORMS.map((id) => content.evolutionsById[id].trait.params.lure), [true, true, true]);
    const now = shieldedBlows(party(content));
    assert.equal(now.atWarrior, 0);
    assert.ok(now.atSummons > 5, `${now.atSummons} blows at the summons`);
    assert.ok(shieldedBlows(party(unlured)).atWarrior > 0);
    // The summon's coming says so, and carries it for the playback.
    const up = party(content).events.find((event) => event.kind === 'summon' && event.state === 'up');
    assert.equal(up.lure, true);
    assert.match(up.text, /ściąga na siebie ciosy wrogów\.$/);
  });

  test('in the players\' fights the foe and its summon go for the Druid too: a Nekromanta and its skeleton strike the Druid\'s summon, not the Wojownik beside it', () => {
    // As in a guild war (guild-wars.js: duelists, an even fight): the Druid
    // and a Wojownik against a Nekromanta who outlasts them.
    const level = 100;
    const trio = (data) => {
      const shape = { factor: duelHpFactor(level, level, data), armor: duelArmorShare(level, level, data) };
      const fighter = (one, name) => ({ character: one.character, equipped: one.equipped, name });
      const nekromanta = playerOf('realistic', 'shadow', level, data, 0, 'poisoned-blade');
      assert.equal(nekromanta.character.evolution, 'necromancer');
      const druid = duelist(fighter(druidAt(level, data), 'Druid'), 'a0', 'ally', shape, data);
      const warrior = duelist(fighter(playerOf('realistic', 'warrior', level, data, 0), 'Wojownik'), 'a1', 'ally', shape, data);
      const necro = { ...duelist(fighter(nekromanta, 'Nekromanta'), 'e0', 'enemy', shape, data), hp: 1e6, maxHp: 1e6 };
      return simulateFight({ allies: [druid, warrior], enemies: [necro], rng: createRng('druid-trio'), content: data, record: true, maxActions: 80, even: true });
    };
    // The Nekromanta's own blows and its skeleton's (Wskrzeszenie) at the
    // Wojownik while a summon of the Druid stands.
    const atWarrior = (result) => {
      let standing = 0;
      const out = { own: 0, skeleton: 0, atSummons: 0 };
      for (const event of result.events) {
        if (event.kind === 'summon' && event.target === 'a0' && event.state === 'up') standing += 1;
        else if (event.kind === 'summon' && event.target === 'a0' && ['gone', 'fell'].includes(event.state)) standing -= 1;
        else if (standing > 0 && event.actor === 'e0' && event.target === 'a1' && ['hit', 'crit', 'dodge'].includes(event.kind)) out[event.skill === 'raise-dead' ? 'skeleton' : 'own'] += 1;
        else if (standing > 0 && event.actor === 'e0' && event.kind === 'summon' && event.state === 'hit') out.atSummons += 1;
      }
      return out;
    };
    const now = atWarrior(trio(content));
    assert.deepEqual([now.own, now.skeleton], [0, 0]);
    assert.ok(now.atSummons > 20, `${now.atSummons} blows at the summons`);
    const without = atWarrior(trio(unlured));
    assert.ok(without.own > 0 && without.skeleton > 0, JSON.stringify(without));
  });

  test('the Druid\'s Ent and Bear and the Arcydruid\'s Zew zwierząt stay 5 moves (4 before), the Pradawne stado 6 (5); no later summon of the line stays shorter than the one it grew from', () => {
    assert.deepEqual(['ent-summon', 'bear-summon', 'bison-call', 'ancient-herd'].map((id) => content.skillsById[id].params.turns), [5, 5, 5, 6]);
    for (const id of ['oak-awakening', 'bison-call', 'oak-of-ages', 'ancient-herd']) {
      const skill = content.skillsById[id];
      assert.ok(skill.params.turns >= content.skillsById[skill.from].params.turns, id);
    }
  });

  test('each summon has 75% of the Druid\'s maximum HP on top of its share of the mana', () => {
    for (const id of FORMS) assert.equal(content.evolutionsById[id].trait.params.summonLife, 0.75);
    // Not the Arkanista's: its trait has none.
    assert.equal(content.evolutionsById.arcanist.trait.params.summonLife, undefined);
  });

  test('its summons stand against an elite and a champion: none falls to the first blow it takes, and no blow takes more than 80% of a summon\'s HP', () => {
    // The game without the share of the maximum HP.
    const frail = (() => {
      const raw = loadData();
      for (const form of raw.evolutions.evolutions) if (FORMS.includes(form.id)) delete form.trait.params.summonLife;
      return buildContent(raw);
    })();
    // The Druid alone (as in the Wieża Solo) against the newest place's elite
    // or champion at full HP, as on an exploration (measureRare in
    // tools/difficulty-sim.mjs: a minute's exploration with a rumour), 16
    // fights: how many summons came, how many fell to the first blow they
    // took, and the biggest blow as a share of the summon's HP.
    const against = (level, kind, data) => {
      const found = newestArea(level, data);
      const area = kind === 'elite' ? { ...found, champion: null, id: `${found.id}-elite` } : found;
      const local = withArea(area, data);
      const out = { summons: 0, firstBlow: 0, worst: 0 };
      for (let i = 0; i < 16; i++) {
        const { character, equipped } = playerOf('realistic', 'mage', level, local, i % GEAR_SETS, 'mana-shield');
        const hp = playerCombatant({ character, equipped, name: 'Druid', area }, local).maxHp;
        const [fight] = simulateHunt({ character, equipped, hp, name: 'Druid', areaId: area.id, minutes: 1, seed: `sturdy:${kind}:${level}:${i}`, rumor: 1e9 }, local).fights;
        assert.ok(fight[kind === 'elite' ? 'elite' : 'champion'], `${level} ${kind}`);
        const hits = new Map();
        const full = new Map();
        for (const event of fight.events) {
          if (event.kind !== 'summon' || event.target !== 'a0') continue;
          const key = `${event.summonSkill ?? event.skill}:${event.summonOrder ?? event.order ?? 0}`;
          if (event.state === 'up') {
            out.summons += 1;
            hits.set(key, 0);
            full.set(key, event.summonHp);
          } else if (event.state === 'hit') {
            hits.set(key, hits.get(key) + 1);
            out.worst = Math.max(out.worst, event.damage / full.get(key));
          } else if (event.state === 'fell' && hits.get(key) === 1) out.firstBlow += 1;
        }
      }
      return out;
    };
    // Before (the 0.5.8 numbers): at level 250 11 of 48 summons fell to the
    // elite's first blow and a blow took up to 1.8 times a summon's HP; at
    // level 300 8 of 84 to the champion's, up to 2 times.
    for (const [level, kind] of [[170, 'elite'], [250, 'elite'], [250, 'champion'], [300, 'champion']]) {
      const now = against(level, kind, content);
      assert.ok(now.summons >= 30, `${level} ${kind}: ${now.summons} summons`);
      assert.equal(now.firstBlow, 0, `${level} ${kind}`);
      assert.ok(now.worst < 0.8, `${level} ${kind}: a blow took ${now.worst.toFixed(2)} of a summon's HP`);
    }
    const weak = against(250, 'elite', frail);
    assert.ok(weak.firstBlow > 0 && weak.worst > 1, JSON.stringify(weak));
  });
});

describe('the Druid line on explorations (tools/class-balance-sim.mjs)', () => {
  // Four-hour explorations of the newest place with companions, the
  // realistic player of tools/difficulty-sim.mjs, 120 of them: before the
  // change the Druid fainted on 10% of them at level 100 and gained 23%
  // less XP an hour than the five main paths on average, the Arcydruid on
  // 5% at level 200 (15% less XP). The main paths faint on none or one.
  test('the Druid at level 100 and the Arcydruid at 200 faint on at most 3 of 120 explorations and gain at least 95% of the main paths\' XP an hour', () => {
    for (const [level, evolution] of [[100, 'druid'], [200, 'archdruid']]) {
      const options = { model: 'realistic', level, minutes: 240, hunts: 120 };
      const own = measureClass({ ...options, classId: 'mage', path: 'mana-shield' }, content);
      assert.equal(own.evolution, evolution);
      const mains = content.classes.map((cls) => measureClass({ ...options, classId: cls.id }, content));
      const average = mains.reduce((sum, row) => sum + row.xpPerHour, 0) / mains.length;
      assert.ok(own.defeats <= 3 / 120 + 1e-9, `${evolution}: ${own.defeats} faints`);
      assert.ok(own.xpPerHour >= 0.95 * average, `${evolution}: ${Math.round(own.xpPerHour)} XP an hour against ${Math.round(average)}`);
    }
  });
});

describe('the Druid line in duels', () => {
  test('its own blows are as anyone\'s, the Arena\'s table shows the attack the fight uses, and its duel strength is in its summons\' blows', () => {
    // Before: duelPower 1.9, 1.3 and 0.8 on all its blows; the Arena's table
    // showed a Druid's plain attack nearly twice an Arcymag's with the same
    // staff and Intelekt.
    assert.deepEqual(FORMS.map((id) => content.evolutionsById[id].duelPower), [undefined, undefined, undefined]);
    assert.deepEqual(FORMS.map((id) => content.evolutionsById[id].duelSummonPower), [1.35, 0.8, 0.42]);
    for (const level of [100, 200, 300]) {
      const { character, equipped } = druidAt(level);
      const plain = playerCombatant({ character, equipped, name: 'Druid' }, content);
      const duel = duelist({ character, equipped, name: 'Druid' }, 'a0', 'ally', { factor: 3, armor: 0.45 }, content);
      assert.equal(duel.damageScale, plain.damageScale, character.evolution);
      assert.equal(combatantView(duel, level, content).damage, combatantView(plain, level, content).damage);
      assert.equal(duel.summonScale, content.evolutionsById[character.evolution].duelSummonPower);
      assert.equal(duel.baseMaxHp, plain.maxHp);
      // A summon's blow in a duel: its power times the form's strength.
      const result = arenaDuel({ attacker: { character, equipped, name: 'Druid' }, defender: { ...playerOf('realistic', 'warrior', level, content, 1), name: 'Rywal' }, seed: `druid-power:${level}` }, content);
      assert.ok(result.fight.events.some((event) => event.actor === 'a0' && ['hit', 'crit'].includes(event.kind) && content.skillsById[event.skill]?.kind === 'summon'));
    }
    // Outside duels nothing of it.
    const { character, equipped } = druidAt(100);
    assert.equal(playerCombatant({ character, equipped, name: 'Druid' }, content).summonScale, undefined);
  });

  test('in a duel its summons strike with the form\'s summon strength and take 75% of the HP before the duel\'s factor', () => {
    const { character, equipped } = druidAt(100);
    const duel = duelist({ character, equipped, name: 'Druid' }, 'a0', 'ally', { factor: 3, armor: 0.45 }, content);
    const rival = { ...monsterCombatant({ monsterId: 'boar', level: 98, id: 'e0' }, content), hp: 1e6, maxHp: 1e6 };
    const result = simulateFight({ allies: [duel], enemies: [rival], rng: createRng('druid-duel-summon'), content, record: true, maxActions: 20 });
    const up = result.events.find((event) => event.kind === 'summon' && event.state === 'up' && event.skill === 'ent-summon');
    const share = duel.skills.find((one) => one.id === 'ent-summon').params.hp;
    // Not the duel's tripled HP.
    assert.equal(up.summonHp, Math.max(1, Math.round(duel.maxMana * share * 1.3 + duel.baseMaxHp * 0.75)));
    assert.ok(duel.maxHp > 2.5 * duel.baseMaxHp);
  });

  test('no one-sided burst: at levels 90 and 130 a Druid\'s biggest blow takes under a third of a rival\'s duel HP and it never kills in fewer than four of its moves, with its points in Intelekt or in Mądrość too', () => {
    // Every other class's paths, each draw of the gear, as attacker and as
    // defender (tools/pvp-arena-sim.mjs pairs them so); the realistic
    // player's points („Rozdaj według klasy”), all of them in Intelekt, and
    // all in Mądrość. Before (×1.9 on all its blows): up to 41% and 46% of
    // the rival's HP and a kill in three moves; the other second forms' own
    // biggest blows at those levels go up to 70–107% (the Berserker's, the
    // Wielki Inkwizytor's, the Arcymag's).
    const builds = { realistic: null, intellect: { intellect: 1 }, wisdom: { wisdom: 1 } };
    // A draw of the realistic player with all its points in the stats of
    // `split` (shares).
    const rebuilt = (one, split) => {
      if (!split) return one;
      const total = Object.values(one.character.points).reduce((sum, value) => sum + value, 0);
      return { ...one, character: { ...one.character, points: Object.fromEntries(Object.entries(split).map(([stat, share]) => [stat, Math.round(total * share)])) } };
    };
    for (const level of [90, 130]) {
      for (const [build, split] of Object.entries(builds)) {
        const druids = Array.from({ length: GEAR_SETS }, (_, set) => ({ ...rebuilt(playerOf('realistic', 'mage', level, content, set, 'mana-shield'), split), name: 'Druid' }));
        let biggest = 0;
        let fastest = Infinity;
        let kills = 0;
        for (const cls of content.classes) {
          if (cls.id === 'mage') continue;
          for (const [index, skill] of content.skills.filter((one) => one.classId === cls.id).entries()) {
            for (let set = 0; set < GEAR_SETS; set++) {
              const rival = { ...playerOf('realistic', cls.id, level, content, (set + 1) % GEAR_SETS, index === 0 ? null : skill.id), name: 'Rywal' };
              for (const druidFirst of [true, false]) {
                const duel = arenaDuel({ attacker: druidFirst ? druids[set] : rival, defender: druidFirst ? rival : druids[set], seed: `burst:${level}:${skill.id}:${set}:${druidFirst}` }, content);
                const me = druidFirst ? 'a0' : 'e0';
                const foe = druidFirst ? 'e0' : 'a0';
                const foeHp = [...duel.fight.allies, ...duel.fight.enemies].find((unit) => unit.id === foe).maxHp;
                const moves = new Set();
                for (const event of duel.fight.events) {
                  if (event.actor === me && event.kind !== 'reflect') moves.add(event.t);
                  if (event.actor === me && event.target === foe && ['hit', 'crit'].includes(event.kind)) biggest = Math.max(biggest, event.damage / foeHp);
                  if (event.kind === 'kill' && event.target === foe) {
                    kills += 1;
                    fastest = Math.min(fastest, moves.size);
                    break;
                  }
                }
              }
            }
          }
        }
        const told = `level ${level}, ${build}`;
        assert.ok(kills > 30, `${told}: ${kills} kills`);
        assert.ok(biggest < 1 / 3, `${told}: a blow of ${biggest.toFixed(2)} of the rival's HP`);
        assert.ok(fastest >= 4, `${told}: a kill in ${fastest} moves`);
      }
    }
  });

  test('the price changes no duel: a Druid and an Arcydruid fight every class as before, move for move', () => {
    for (const level of [100, 150, 200, 250]) {
      const druid = { ...druidAt(level), name: 'Druid' };
      const old = { ...druidAt(level, before), name: 'Druid' };
      for (const cls of content.classes) {
        if (cls.id === 'mage') continue;
        const rival = { ...playerOf('realistic', cls.id, level, content, 1), name: 'Rywal' };
        for (const [attacker, defender, oldAttacker, oldDefender] of [[druid, rival, old, rival], [rival, druid, rival, old]]) {
          const seed = `druid-price:${level}:${cls.id}:${attacker === druid}`;
          const now = arenaDuel({ attacker, defender, seed }, content);
          const then = arenaDuel({ attacker: oldAttacker, defender: oldDefender, seed }, before);
          assert.deepEqual([now.result, now.moves, now.shares], [then.result, then.moves, then.shares], `${level} ${cls.id}`);
        }
      }
    }
  });
});

describe('the Pradruid in the Wieże (1249 B)', () => {
  // The author's choice 1249 B: the Pradruid weaker in the Wieże only, its
  // summons with less HP there. Before (0.5.11) alone at level 300 it
  // climbed to floor 489, the other fourth forms to 224–329, and in the
  // Wieża Drużyn too it climbed the highest. `whole`: the game as then.
  const whole = (() => {
    const raw = loadData();
    delete raw.evolutions.evolutions.find((form) => form.id === 'elder-druid').towerSummonHp;
    return buildContent(raw);
  })();
  const share = content.evolutionsById['elder-druid'].towerSummonHp;
  // The first summon the fighter `id` calls in a fight.
  const firstUp = (events, id) => events.find((event) => event.kind === 'summon' && event.state === 'up' && event.target === id);
  const pradruid = { ...druidAt(300), name: 'Pradruid' };

  test('only the Pradruid has its own share of its summons\' HP in the Wieże, and its trait says so in Polish and in English', () => {
    assert.ok(share > 0 && share < 1, String(share));
    assert.deepEqual(content.evolutions.filter((form) => form.towerSummonHp !== undefined).map((form) => form.id), ['elder-druid']);
    assert.equal(pradruid.character.evolution, 'elder-druid');
    const percent = `${Math.round(share * 100)}%`;
    assert.ok(content.evolutionsById['elder-druid'].trait.text.endsWith(`W Wieżach Systemu przywołańce mają tylko ${percent} swojego HP.`));
    const english = JSON.parse(readFileSync(new URL('../data/en/evolutions.json', import.meta.url), 'utf8'));
    assert.ok(english.evolutions['elder-druid'].trait.text.endsWith(`In the System Towers the summons have only ${percent} of their HP.`));
  });

  test('in a Wieża its summons come with that share of their HP: the climber\'s, a partner\'s and a companion\'s', () => {
    const warrior = { ...playerOf('realistic', 'warrior', 300, content, 0), name: 'Wojownik' };
    // A Mag of the Arkanista's path at level 300 as a companion: a Pradruid.
    const [mate] = companionsOf(warrior.plan, 301, 2, content);
    const companion = { ...mate, classId: 'mage', skills: ['mana-shield', 'fireball'] };
    assert.equal(companionForm(companion, content)?.id, 'elder-druid');
    const cases = [
      [{ character: pradruid.character, equipped: pradruid.equipped, name: 'Pradruid' }, 'a0'],
      [{ character: warrior.character, equipped: warrior.equipped, name: 'Wojownik', partners: [pradruid] }, 'p1'],
      [{ character: warrior.character, equipped: warrior.equipped, name: 'Wojownik', companions: [companion] }, 'a1'],
    ];
    for (const [options, id] of cases) {
      const climb = (data) => towerFight({ floor: 250, seed: `tower-share:${id}`, ...options }, data).fights[0].events;
      const now = firstUp(climb(content), id);
      const then = firstUp(climb(whole), id);
      assert.equal(now.summon, then.summon, id);
      assert.ok(Math.abs(now.summonHp - then.summonHp * share) <= 1, `${id}: ${now.summonHp} of ${then.summonHp}`);
    }
  });

  test('outside the Wieże nothing changes: an exploration\'s fight, a duel and a guild war\'s battle go as in 0.5.11', () => {
    const rival = { ...playerOf('realistic', 'warrior', 300, content, 1), name: 'Rywal' };
    const duel = (data) => arenaDuel({ attacker: pradruid, defender: rival, seed: 'tower-duel' }, data);
    assert.deepEqual(duel(content), duel(whole));
    const battle = (data) => warBattle({ sideA: [pradruid, rival, rival], sideB: [rival, pradruid, rival], seed: 'tower-war' }, data);
    assert.deepEqual(battle(content), battle(whole));
    const area = newestArea(300, content);
    const hunt = (data) => {
      const local = withArea(area, data);
      const hp = playerCombatant({ character: pradruid.character, equipped: pradruid.equipped, name: 'Pradruid', area }, local).maxHp;
      return simulateHunt({ character: pradruid.character, equipped: pradruid.equipped, hp, name: 'Pradruid', areaId: area.id, minutes: 60, seed: 'tower-hunt', rumor: 1e9 }, local);
    };
    const [now, then] = [hunt(content), hunt(whole)];
    assert.ok(now.fights.some((fight) => fight.events.some((event) => event.kind === 'summon' && event.state === 'up')));
    assert.deepEqual(now, then);
  });

  test('alone at level 300 it no longer gets past the champion of floor 350 (20% of the entries before), and it still wins the one of floor 325', () => {
    const rate = (floor, data) => {
      let won = 0;
      for (let set = 0; set < GEAR_SETS; set++) {
        const { character, equipped } = playerOf('realistic', 'mage', 300, data, set, 'mana-shield');
        for (let seed = 0; seed < 4; seed++) {
          if (towerFight({ character, equipped, name: 'Pradruid', floor, seed: `tower-wall:${set}:${seed}` }, data).result === 'success') won += 1;
        }
      }
      return won / (GEAR_SETS * 4);
    };
    assert.equal(rate(350, content), 0);
    assert.ok(rate(350, whole) > 0.05);
    assert.ok(rate(325, content) >= 0.75);
  });
});

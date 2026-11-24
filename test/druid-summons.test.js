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
// short in one: its duels go exactly as before.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import { arenaDuel, buildContent, createRng, duelist, monsterCombatant, playerCombatant, simulateFight, skillCost, skillView } from '../src/engine/index.js';
import { measureClass } from '../tools/class-balance-sim.mjs';
import { playerOf } from '../tools/difficulty-sim.mjs';
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

// Events at the end of an exploration (data/events.json, src/engine/events.js):
// after "Odbierz raport" the player first chooses what to do, and the report
// tells what came of it. In the live game (EVENTS "on"), and on the test
// version with the outcomes the author has not approved yet (EVENTS "test").

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { createRng, drawCandidates, encounterCombatants, eventCase, eventChance, eventFor, eventOutcomes, huntKills, playerCombatant, resolveEvent, simulateFight, simulateHunt } from '../src/engine/index.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const bandits = ['bandit-thug', 'bandit-knifer', 'bandit-crossbow'];
const woman = content.eventsById['wounded-woman'];
// The events with tests of their own that come anywhere, or in the whole
// forest (the leshy), left out where another event's places are checked.
const elsewhere = new Set([
  'blue-mushroom',
  'wandering-beggar',
  'haunted-shrine',
  'stuck-merchant',
  'leshy',
  'lost-child',
  'forest-wedding',
  'treasure-hunter',
  // 817 (test/events-817.test.js).
  'bog-herbalist',
  'star-iron',
  'ferryman',
  'fireside-dice',
  'refugees',
  'old-soldier',
  'companion-errand',
  // 951 (test/events-951.test.js).
  'bounty-hunters',
  'robber-knight',
  'skarbnik',
  'snake-king',
  'ghost-caravan',
  'white-stag',
  'forefathers-eve',
  'boruta',
]);
const placed = (list) => list.filter((event) => !elsewhere.has(event.id));

// Whether every enemy moved before the first move of `allyId`.
const enemiesFirst = (fight, allyId, enemyIds) => {
  const first = fight.events.findIndex((event) => event.actor === allyId);
  const before = new Set(fight.events.slice(0, first).map((event) => event.actor));
  return enemyIds.every((id) => before.has(id));
};

describe('events', () => {
  const { character, equipped } = typicalCharacter('warrior', 8, content);
  const seed = 'zdarzenie';
  const base = simulateHunt({ character, equipped, hp: 9999, name: 'Mira', areaId: 'windfalls-edge', minutes: 60, seed }, content);
  // In the case given; the ambush, unless said otherwise.
  const resolve = (optionId, hunt = base, caseId = 'ambush') => resolveEvent({ hunt, event: woman, optionId, caseId, character, equipped, name: 'Mira', seed }, content);

  test('none after the first exploration, a Szybkie Polowanie or one that did not end as planned', () => {
    const hunt = { result: 'success', minutes: 60 };
    const forced = 'wounded-woman';
    assert.equal(eventFor({ hunt, seed, first: true, forced }, content), null);
    assert.equal(eventFor({ hunt, seed, quick: true, forced }, content), null);
    assert.equal(eventFor({ hunt: { ...hunt, result: 'fainted' }, seed, forced }, content), null);
    assert.equal(eventFor({ hunt, seed, forced }, content), woman);
  });

  test('the seed decides whether one comes: a tenth at 30 minutes, fewer of the shorter (338 A), more of the longer up to a fifth at 4 hours (478)', () => {
    const close = (minutes, expected) => assert.ok(Math.abs(eventChance(content, minutes) - expected) < 1e-9, `${minutes}: ${eventChance(content, minutes)}`);
    assert.equal(eventChance(content), 0.1);
    close(15, 0.05);
    close(1, 0.1 / 30);
    // The same step at each doubling: 10%, 13.3%, 16.7%, 20%, and never more.
    close(60, 0.1 + 0.1 / 3);
    close(120, 0.1 + 0.2 / 3);
    close(240, 0.2);
    close(480, 0.2);
    let last = 0;
    for (let minutes = 1; minutes <= 240; minutes += 1) {
      const chance = eventChance(content, minutes);
      assert.ok(chance >= last && chance <= 0.2 + 1e-12, String(minutes));
      // Never more events an hour than at 30 minutes (338 A).
      assert.ok((chance * 60) / minutes <= (0.1 * 60) / 30 + 1e-12, String(minutes));
      last = chance;
    }
    const seeds = Array.from({ length: 2000 }, (_, index) => `ziarno-${index}`);
    for (const minutes of [5, 30, 240]) {
      const hunt = { result: 'success', areaId: 'windfalls-edge', minutes };
      const drawn = seeds.filter((one) => eventFor({ hunt, seed: one }, content));
      assert.ok(Math.abs(drawn.length / seeds.length - eventChance(content, minutes)) < 0.025, `${minutes}: ${drawn.length}`);
    }
    const hunt = { result: 'success', areaId: 'windfalls-edge', minutes: 30 };
    for (const one of seeds.slice(0, 50)) assert.equal(eventFor({ hunt, seed: one }, content), eventFor({ hunt, seed: one }, content));
  });

  test('the wounded woman comes only where the Błędnica lives; a draft event only where drafts are on', () => {
    const always = { ...content, events: { ...content.events, chance: 1, longChance: 1 } };
    // Apart from the events that come anywhere (their own tests).
    const regional = { ...always, events: { ...always.events, list: placed(always.events.list) } };
    const seeds = Array.from({ length: 40 }, (_, index) => `region-${index}`);
    const drawn = (areaId, extra = {}, data = regional) => seeds.map((one) => eventFor({ hunt: { result: 'success', areaId, minutes: 30 }, seed: one, ...extra }, data)?.id ?? null);
    for (const areaId of ['windfalls-edge', 'fox-ravines', 'raven-hollows']) assert.ok(drawn(areaId).every((id) => id === 'wounded-woman'), areaId);
    assert.ok(drawn('viper-heaps').every((id) => id === null));
    // Further on only the fern flower without Licho comes there.
    for (const areaId of ['spider-gully', 'reed-beds']) assert.ok(drawn(areaId).every((id) => id === 'fern-flower-calm'), areaId);
    // "Testuj zdarzenia" still brings it anywhere.
    assert.equal(eventFor({ hunt: { result: 'success', areaId: 'viper-heaps', minutes: 30 }, seed, forced: 'wounded-woman' }, always), woman);
    // A draft of its own, beside the approved events only.
    const approved = regional.events.list.filter((event) => !event.draft);
    const drafted = { ...regional, events: { ...regional.events, list: [...approved, { ...woman, id: 'szkic', areas: undefined, draft: true }] } };
    assert.ok(drawn('viper-heaps', {}, drafted).every((id) => id === null));
    assert.ok(drawn('viper-heaps', { drafts: true }, drafted).every((id) => id === 'szkic'));
  });

  test('every event is as likely as the others', () => {
    const two = { ...content, events: { ...content.events, chance: 1, longChance: 1, list: [woman, { ...woman, id: 'drugie' }] } };
    const hunt = { result: 'success', areaId: 'windfalls-edge', minutes: 30 };
    const seeds = Array.from({ length: 2000 }, (_, index) => `rowne-${index}`);
    const share = seeds.filter((one) => eventFor({ hunt, seed: one }, two).id === 'drugie').length / seeds.length;
    assert.ok(Math.abs(share - 0.5) < 0.04, String(share));
  });

  test('in an ambush every enemy moves before the allies, however quick', () => {
    const player = playerCombatant({ character: newCharacter('archer', { level: 5 }), equipped: [], name: 'Szybka' }, content);
    const quick = { ...player, speed: player.speed * 3, maxHp: 9000, hp: 9000 };
    const enemies = encounterCombatants({ members: bandits.map((monsterId) => ({ monsterId, level: 5 })) }, content);
    for (const one of ['a', 'b', 'c']) {
      const fight = simulateFight({ allies: [quick], enemies, rng: createRng(one), content, record: true, ambush: true });
      assert.ok(enemiesFirst(fight, quick.id, enemies.map((enemy) => enemy.id)));
    }
  });

  test('"Odejdź nieufnie" only adds the event to the report', () => {
    const left = resolve('leave');
    assert.equal(left.result, 'success');
    assert.deepEqual([left.fights.length, left.xp, left.gold, left.hpEnd], [base.fights.length, base.xp, base.gold, base.hpEnd]);
    assert.deepEqual(left.event.option, { id: 'leave', label: 'Odejdź nieufnie', text: woman.options[2].outcome.text });
    assert.equal(left.event.fight, null);
    assert.equal(left.entries.at(-1).type, 'event');
  });

  test("the companions who went fight the event's foes beside the character, with the HP they ended with (5.11.2026)", () => {
    const companions = drawCandidates({ character, seed: 'zdarzenie-towarzysze' }, Date.UTC(2026, 10, 5, 12), content).slice(0, 2);
    const went = simulateHunt({ character, equipped, hp: 9999, name: 'Mira', areaId: 'windfalls-edge', minutes: 60, seed, companions }, content);
    assert.equal(went.companions.length, 2);
    // The first ended the exploration a little hurt, the second fell on the way.
    const [first, second] = went.companions;
    const hunt = { ...went, companions: [{ ...first, hpEnd: first.maxHp - 3 }, { ...second, hpEnd: 0, fainted: true }] };
    const helped = resolveEvent({ hunt, event: woman, optionId: 'help', caseId: 'ambush', character, equipped, name: 'Mira', seed, companions }, content);
    const fight = helped.fights.at(-1);
    assert.deepEqual(fight.allies.map((ally) => ally.name), ['Mira', companions[0].name]);
    const opening = fight.events.find((one) => one.target === fight.allies[1].id || one.actor === fight.allies[1].id);
    assert.ok(opening, 'the companion takes part in the fight');
    assert.equal(helped.companions.length, 2);
    assert.ok(helped.companions[0].hpEnd <= first.maxHp - 3);
    assert.deepEqual(helped.companions[1], hunt.companions[1]);
    // Its share of the XP, as on the exploration.
    const alone = resolveEvent({ hunt: { ...hunt, companions: undefined }, event: woman, optionId: 'help', caseId: 'ambush', character, equipped, name: 'Mira', seed }, content);
    assert.equal(alone.fights.at(-1).allies.length, 1);
    assert.equal(alone.companions, undefined);
    // Late in the game the foes grow as on the exploration when a companion
    // fights, and by half for a character alone (438.3 A).
    const strong = typicalCharacter('warrior', 120, content);
    const [mate] = drawCandidates({ character: strong.character, seed: 'zdarzenie-wysoko' }, Date.UTC(2026, 10, 5, 12), content);
    const late = { ...base, hpEnd: 99999, companions: [{ id: mate.id, name: mate.name, hpEnd: 99999, maxHp: 99999, fainted: false }] };
    const event = (withMate) =>
      resolveEvent({ hunt: late, event: woman, optionId: 'help', caseId: 'ambush', character: strong.character, equipped: strong.equipped, name: 'Mira', seed, companions: withMate ? [mate] : [] }, content).fights.at(-1);
    assert.ok(event(true).enemiesView[0].maxHp > event(false).enemiesView[0].maxHp);
  });

  test('the potions still carried and the strengthening ones still working work in the event fight too (5.11.2026)', () => {
    // At a fifth of its HP, with two healing potions taken along, one drunk on the way.
    const low = { ...base, hpEnd: Math.round(base.maxHp * 0.2), potionsUsed: { 'lesser-healing': 1 }, buffFights: {} };
    const event = (more) => resolveEvent({ hunt: low, event: woman, optionId: 'help', caseId: 'ambush', character, equipped, name: 'Mira', seed, ...more }, content);
    assert.equal(event({ potions: { 'lesser-healing': 2 } }).potionsUsed['lesser-healing'], 2);
    // None left of those taken along: none drunk.
    assert.equal(event({ potions: { 'lesser-healing': 1 } }).potionsUsed['lesser-healing'], 1);
    // A strength potion still working (in its number of the first fights)
    // works in it, one used up on the way does not.
    const working = event({ buffs: { damage: { fights: base.fights.length + 1, bonus: 0.1 } } });
    assert.equal(working.buffFights.damage, 1);
    assert.equal(event({ buffs: { damage: { fights: base.fights.length, bonus: 0.1 } } }).buffFights.damage, undefined);
  });

  test('"Pomóż jej sprawnie": the bandits ambush the character at its level and pay like people', () => {
    const helped = resolve('help');
    const fight = helped.fights.at(-1);
    assert.equal(helped.fights.length, base.fights.length + 1);
    assert.equal(fight.event, true);
    assert.deepEqual(
      fight.enemies.map((enemy) => [enemy.monsterId, enemy.level]),
      bandits.map((id) => [id, character.level]),
    );
    assert.equal(fight.hpBefore, base.hpEnd);
    assert.ok(enemiesFirst(fight, fight.allies[0].id, fight.enemiesView.map((enemy) => enemy.id)));
    assert.equal(fight.won, true);
    assert.equal(helped.result, 'success');
    assert.ok(fight.xp > 0 && fight.gold > 0);
    assert.deepEqual([helped.xp, helped.gold], [base.xp + fight.xp, base.gold + fight.gold]);
    // Their items join the exploration's finds.
    assert.deepEqual(
      fight.chests.map((index) => helped.items[index]),
      helped.items.slice(base.items.length),
    );
    assert.deepEqual(helped.keyFight, { index: fight.index });
    assert.equal(helped.event.fight, fight.index);
    assert.deepEqual(helped.entries.slice(-2).map((entry) => entry.type), ['event', 'fight']);
    // The same exploration and option always end the same way.
    assert.deepEqual(resolve('help'), helped);
  });

  test('"Zadaj dodatkowe pytania": no ambush, and the character is quicker', () => {
    const asked = resolve('ask');
    const fight = asked.fights.at(-1);
    const helped = resolve('help').fights.at(-1);
    assert.equal(fight.event, true);
    assert.ok(fight.allies[0].speed > helped.allies[0].speed);
    assert.equal(enemiesFirst(fight, fight.allies[0].id, fight.enemiesView.map((enemy) => enemy.id)), false);
  });

  test('lost, the character faints, or in a safe region only gets away', () => {
    const faintHp = Math.round(base.maxHp * content.balance.hunt.hpAfterFaint);
    const safe = resolve('help', { ...base, hpEnd: 1 });
    assert.deepEqual([safe.fights.at(-1).won, safe.result, safe.hpEnd], [false, 'escaped', faintHp]);
    const wild = resolve('help', { ...base, hpEnd: 1, areaId: 'mossy-boulders' });
    assert.deepEqual([wild.result, wild.hpEnd], ['fainted', faintHp]);
  });

  test('the bandits count for no quest', () => {
    assert.deepEqual(huntKills(resolve('help'), content), huntKills(base, content));
  });

  test('what is really going on is drawn once, about as often as its weight says', () => {
    const seeds = Array.from({ length: 3000 }, (_, index) => `przypadek-${index}`);
    const total = woman.cases.reduce((sum, one) => sum + one.weight, 0);
    for (const one of woman.cases) {
      const share = seeds.filter((each) => eventCase(woman, each) === one).length / seeds.length;
      assert.ok(Math.abs(share - one.weight / total) < 0.03, `${one.id}: ${share}`);
    }
    assert.equal(eventCase(woman, seed, 'grateful-find').id, 'grateful-find');
    // Drawn, the case is the same for every option.
    const drawn = eventCase(woman, seed).id;
    for (const optionId of ['help', 'ask', 'leave']) {
      assert.equal(resolveEvent({ hunt: base, event: woman, optionId, character, equipped, name: 'Mira', seed }, content).event.case, drawn);
    }
  });

  test('a truly wounded woman thanks with gold or with something she found, and has no bandits', () => {
    const paid = resolve('help', base, 'grateful-gold');
    assert.equal(paid.fights.length, base.fights.length);
    assert.ok(paid.event.reward.gold > 0);
    assert.equal(paid.gold, base.gold + paid.event.reward.gold);
    assert.match(paid.event.option.text, new RegExp(`\\+${paid.event.reward.gold}\\)`));
    assert.equal(paid.entries.at(-1).type, 'event');

    const found = resolve('help', base, 'grateful-find');
    assert.equal(found.fights.length, base.fights.length);
    assert.equal(found.items.length, base.items.length + 1);
    const item = found.items[found.event.reward.item];
    assert.ok(Object.keys(woman.cases.find((one) => one.id === 'grateful-find').outcomes.help.itemRarities).includes(item.rarity));
    assert.equal(item.level, character.level);
    assert.equal(found.gold, base.gold);
  });

  test('asked too many questions, a truly wounded woman dies in hopelessness or turns into a Błędnica; leaving is the same in every case', () => {
    const [dies, turns] = woman.options[1].outcome;
    for (const caseId of ['grateful-gold', 'grateful-find']) {
      const endings = Array.from({ length: 200 }, (_, index) =>
        resolveEvent({ hunt: base, event: woman, optionId: 'ask', caseId, character, equipped, name: 'Mira', seed: `pytania-${index}` }, content),
      );
      const fought = endings.filter((asked) => asked.fights.length > base.fights.length);
      assert.ok(Math.abs(fought.length / endings.length - 0.5) < 0.1, `${caseId}: ${fought.length}`);
      for (const asked of endings.filter((one) => !fought.includes(one))) {
        assert.deepEqual([asked.gold, asked.xp, asked.items.length, asked.result], [base.gold, base.xp, base.items.length, base.result]);
        assert.equal(asked.event.option.text, dies.text);
      }
      for (const asked of fought) {
        const fight = asked.fights.at(-1);
        assert.equal(fight.event, true);
        assert.deepEqual(fight.enemies.map((enemy) => [enemy.monsterId, enemy.level]), [['wisp', character.level]]);
        assert.deepEqual(fight.chests, []);
        assert.equal(asked.event.option.text, turns.text);
        assert.equal(asked.event.fight, asked.fights.length - 1);
      }
      // Beaten, the Błędnica counts for the quests as one met on the way.
      const won = fought.find((asked) => asked.fights.at(-1).won === true);
      assert.equal(huntKills(won, content).wisp, (huntKills(base, content).wisp ?? 0) + 1);
    }
    for (const one of woman.cases) assert.equal(resolve('leave', base, one.id).event.option.text, woman.options[2].outcome.text);
  });

  test('the fern flower comes only where Licho lives: picking it risks Licho for an item', () => {
    // A draft until the author approved it (0.0.48).
    const fern = content.eventsById['fern-flower'];
    // Without the events that come anywhere (their own tests).
    const always = { ...content, events: { ...content.events, chance: 1, longChance: 1, list: placed(content.events.list) } };
    const hunt = (areaId) => ({ result: 'success', areaId, minutes: 30 });
    const seeds = Array.from({ length: 30 }, (_, index) => `paproc-${index}`);
    assert.ok(seeds.every((one) => eventFor({ hunt: hunt('mossy-boulders'), seed: one }, always) === fern));
    assert.ok(seeds.every((one) => eventFor({ hunt: hunt('raven-hollows'), seed: one }, always) !== fern));
    assert.equal(eventFor({ hunt: hunt('mossy-boulders'), seed, forced: 'fern-flower' }, always), fern);
    const resolveFern = (optionId, caseId, endingId = null) => resolveEvent({ hunt: base, event: fern, optionId, caseId, endingId, character, equipped, name: 'Mira', seed }, content);
    const fought = resolveFern('pick', 'guarded');
    assert.deepEqual(fought.fights.at(-1).enemies.map((enemy) => [enemy.monsterId, enemy.level]), [['likho', character.level]]);
    const found = resolveFern('pick', 'free', 'item');
    assert.equal(found.items.length, base.items.length + 1);
    assert.ok(['rare', 'unique', 'epic'].includes(found.items[found.event.reward.item].rarity));
    assert.equal(found.herbs, undefined);
    // One time in four the flower stays: a Kwiat paproci for the bag
    // instead of the item (the author, 29.10.2026).
    const blossom = resolveFern('pick', 'free', 'blossom');
    assert.deepEqual([blossom.items.length, blossom.herbs, blossom.event.reward], [base.items.length, { 'fern-blossom': 1 }, { gold: 0, item: null, herbs: { 'fern-blossom': 1 } }]);
    assert.match(blossom.event.option.text, /\(\+1 Kwiat paproci\)\.$/);
    const picked = seeds.map((one) => resolveEvent({ hunt: base, event: fern, optionId: 'pick', caseId: 'free', character, equipped, name: 'Mira', seed: one }, content));
    const blossoms = picked.filter((one) => one.herbs).length;
    assert.ok(blossoms > 0 && blossoms < seeds.length / 2, `${blossoms} of ${seeds.length}`);
    assert.ok(resolveFern('watch', 'guarded').gold > base.gold);
    assert.equal(resolveFern('watch', 'free').gold, base.gold);
    assert.equal(resolveFern('leave', 'free').fights.length, base.fights.length);
  });

  test('the fern flower without Licho comes in every region from level 26 but where the full one does, its blossom rarer', () => {
    const calm = content.eventsById['fern-flower-calm'];
    const full = content.eventsById['fern-flower'];
    const always = { ...content, events: { ...content.events, chance: 1, longChance: 1, list: placed(content.events.list) } };
    const hunt = (areaId) => ({ result: 'success', areaId, minutes: 30 });
    const seeds = Array.from({ length: 30 }, (_, index) => `spokoj-${index}`);
    const brought = (areaId) => new Set(seeds.map((one) => eventFor({ hunt: hunt(areaId), seed: one }, always)?.id));
    // Not on the starting levels, nor beside the full fern flower.
    for (const areaId of ['windfalls-edge', 'boar-thicket', ...full.areas]) assert.ok(!brought(areaId).has(calm.id), areaId);
    for (const areaId of ['spider-gully', 'reed-beds', 'old-riverbed', 'crane-meadows', 'old-diggings']) assert.deepEqual([...brought(areaId)], [calm.id], areaId);
    // No Licho: picking leaves an item, and a Kwiat paproci one time in ten.
    const picked = Array.from({ length: 200 }, (_, index) =>
      resolveEvent({ hunt: base, event: calm, optionId: 'pick', character, equipped, name: 'Mira', seed: `kwiat-${index}` }, content),
    );
    assert.ok(picked.every((one) => one.fights.length === base.fights.length));
    const blossoms = picked.filter((one) => one.herbs).length;
    assert.ok(blossoms > 6 && blossoms < 40, `${blossoms} of 200`);
    assert.ok(picked.filter((one) => !one.herbs).every((one) => one.items.length === base.items.length + 1));
    assert.equal(resolveEvent({ hunt: base, event: calm, optionId: 'watch', character, equipped, name: 'Mira', seed }, content).gold, base.gold);
  });

  test('the blue mushroom comes in any land on its background: eaten, it faints, strengthens or gives a free stat point', () => {
    // A draft until the author approved it (0.0.56).
    const mushroom = content.eventsById['blue-mushroom'];
    const always = { ...content, events: { ...content.events, chance: 1, longChance: 1 } };
    const hunt = (areaId) => ({ result: 'success', areaId, minutes: 30 });
    // More events, so more explorations until the mushroom comes in each land.
    const seeds = Array.from({ length: 80 }, (_, index) => `grzyb-${index}`);
    for (const areaId of ['windfalls-edge', 'viper-heaps', 'spider-gully', 'old-diggings']) {
      assert.ok(seeds.some((one) => eventFor({ hunt: hunt(areaId), seed: one }, always)?.id === mushroom.id), areaId);
    }
    const eaten = (endingId, gold = base.gold) =>
      resolveEvent({ hunt: { ...base, gold }, event: mushroom, optionId: 'eat', endingId, drafts: true, character, equipped, name: 'Mira', seed }, content);
    // The scene is the land's: the background of the exploration's region.
    assert.equal(eaten('point').event.scene, null);
    assert.equal(eaten('point').event.land, content.areasById[base.areaId].regionId);
    // A faint costs 30% of the exploration's gold, and says so when it took any.
    const fainted = eaten('faint', 100);
    assert.equal(fainted.gold, 70);
    assert.match(fainted.event.option.text, /\(−30 złota\)\.$/);
    assert.deepEqual(eaten('faint', 0).event.loss, { gold: 0 });
    assert.doesNotMatch(eaten('faint', 0).event.option.text, /złota/);
    // A buff for 2 fights of explorations, or a free stat point.
    assert.deepEqual(eaten('damage').event.reward.buff, { kind: 'damage', bonus: 0.1, fights: 2 });
    assert.equal(eaten('point').event.reward.points, 1);
    assert.equal(eaten('point').gold, base.gold);
    assert.equal(resolveEvent({ hunt: base, event: mushroom, optionId: 'leave', character, equipped, name: 'Mira', seed }, content).gold, base.gold);
  });

  test('a draft ending comes only where drafts are on; "Testuj zdarzenia" chooses an ending', () => {
    // The Błędnica was a draft until the author approved it (0.0.44).
    const drafted = structuredClone(woman);
    drafted.options[1].outcome[1].draft = true;
    const asked = (seedOf, extra) => resolveEvent({ hunt: base, event: drafted, optionId: 'ask', caseId: 'grateful-gold', character, equipped, name: 'Mira', seed: seedOf, ...extra }, content);
    const seeds = Array.from({ length: 60 }, (_, index) => `szkic-${index}`);
    assert.ok(seeds.every((one) => asked(one).fights.length === base.fights.length));
    assert.ok(seeds.every((one) => asked(one, { endingId: 'wisp' }).event.option.text === woman.options[1].outcome[0].text));
    assert.ok(seeds.slice(0, 10).every((one) => asked(one, { endingId: 'wisp', drafts: true }).fights.at(-1).enemies[0].monsterId === 'wisp'));
    assert.ok(seeds.slice(0, 10).every((one) => asked(one, { endingId: 'dies', drafts: true }).fights.length === base.fights.length));
  });
});

describe('events (API)', () => {
  const { call, db, signUp } = useServer({ EVENTS: 'test' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('wedrowiec'));
    await call('POST', '/api/character', { cookie, body: { name: 'Wedrowiec', classId: 'warrior', appearance: 'male' } });
  });

  const explore = async () => {
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } })).status, 201);
    await call('POST', '/api/test/skip-time', { cookie });
  };
  const claim = (choice) => call('POST', '/api/hunts/claim', { cookie, ...(choice !== undefined && { body: { choice } }) });
  const choose = (eventId, caseId, endingId) => call('POST', '/api/test/events', { cookie, body: { eventId, ...(caseId && { caseId }), ...(endingId && { endingId }) } });
  const next = async () => (await call('GET', '/api/test/events', { cookie })).data.next;
  // After the first exploration (the tutorial's), a character strong enough
  // for the edge of the Wiatrołomy to end every exploration as planned.
  const pastTutorial = async () => {
    await explore();
    assert.equal((await claim()).data.event, undefined);
    await (await db()).prepare(`UPDATE characters SET level = 30, points = '{"strength":150,"vitality":140}', hp_at = 0`).run();
  };
  const reports = async () => (await (await db()).prepare('SELECT COUNT(*) AS count FROM reports').first()).count;

  test('"Testuj zdarzenia" brings the event chosen, not after the tutorial, and the report waits for the choice', async () => {
    const tests = (await call('GET', '/api/test/events', { cookie })).data;
    assert.deepEqual(tests, {
      events: [
        {
          id: 'wounded-woman',
          title: 'Ranna kobieta',
          draft: false,
          cases: woman.cases.map(({ id, name }) => ({ id, name })),
          endings: [
            { id: 'dies', name: 'Pytania: umiera w beznadziei' },
            { id: 'wisp', name: 'Pytania: zamienia się w Błędnicę' },
          ],
        },
        {
          id: 'fern-flower',
          title: 'Kwiat paproci',
          draft: false,
          cases: [
            { id: 'guarded', name: 'Licho strzeże kwiatu' },
            { id: 'free', name: 'Kwiat bez stróża' },
          ],
          endings: [
            { id: 'item', name: 'Zerwanie: zostaje przedmiot' },
            { id: 'blossom', name: 'Zerwanie: zostaje Kwiat paproci' },
          ],
        },
        {
          id: 'fern-flower-calm',
          title: 'Kwiat paproci bez Licha',
          draft: false,
          cases: [],
          endings: [
            { id: 'item', name: 'Zerwanie: zostaje przedmiot' },
            { id: 'blossom', name: 'Zerwanie: zostaje Kwiat paproci' },
          ],
        },
        {
          id: 'blue-mushroom',
          title: 'Niebieski grzyb',
          draft: false,
          cases: [],
          endings: [
            { id: 'faint', name: 'Zjedzenie: omdlenie' },
            { id: 'speed', name: 'Zjedzenie: lekkość' },
            { id: 'armor', name: 'Zjedzenie: twarda skóra' },
            { id: 'damage', name: 'Zjedzenie: siła' },
            { id: 'focus', name: 'Zjedzenie: jasność umysłu' },
            { id: 'point', name: 'Zjedzenie: Wolny Punkt Statystyk' },
          ],
        },
        // The merchant of the Osada only where the Osada is open.
        ...['wandering-beggar', 'haunted-shrine', 'leshy'].map((id) => {
          const event = content.eventsById[id];
          return {
            id,
            title: event.title,
            draft: false,
            cases: (event.cases ?? []).map(({ id: caseId, name }) => ({ id: caseId, name })),
            endings: event.options.flatMap((option) => (Array.isArray(option.outcome) ? option.outcome.map(({ id: endingId, name }) => ({ id: endingId, name })) : [])),
          };
        }),
        // The events with a further choice.
        ...['lost-child', 'forest-wedding', 'treasure-hunter'].map((id) => ({
          id,
          title: content.eventsById[id].title,
          draft: false,
          cases: content.eventsById[id].cases.map(({ id: caseId, name }) => ({ id: caseId, name })),
          endings: [],
        })),
        // The events of 817 that come anywhere (those of the Osada only where
        // it is open), then those of 951.
        ...['ferryman', 'fireside-dice', 'old-soldier', 'companion-errand', 'bounty-hunters', 'robber-knight', 'skarbnik', 'snake-king', 'ghost-caravan', 'white-stag', 'forefathers-eve', 'boruta'].map((id) => {
          const event = content.eventsById[id];
          const endings = new Map(eventOutcomes(event).filter((outcome) => outcome?.id).map((outcome) => [outcome.id, outcome]));
          return {
            id,
            title: event.title,
            draft: false,
            cases: (event.cases ?? []).map(({ id: caseId, name }) => ({ id: caseId, name })),
            endings: [...endings.values()].map(({ id: endingId, name }) => ({ id: endingId, name })),
          };
        }),
      ],
      next: null,
    });
    assert.equal((await choose('nie-ma')).data.error.code, 'unknown_event');
    assert.equal((await choose('wounded-woman', 'smok')).data.error.code, 'unknown_case');
    assert.equal((await choose('wounded-woman', null, 'smok')).data.error.code, 'unknown_ending');
    // An ending comes in a case that leads to it.
    assert.deepEqual((await choose('wounded-woman', null, 'wisp')).data, { next: { eventId: 'wounded-woman', caseId: 'grateful-gold', endingId: 'wisp' } });
    assert.deepEqual(await next(), { eventId: 'wounded-woman', caseId: 'grateful-gold', endingId: 'wisp' });
    assert.deepEqual((await choose('wounded-woman')).data, { next: { eventId: 'wounded-woman', caseId: null, endingId: null } });

    // The first exploration is the tutorial's: no event, and the choice waits.
    await pastTutorial();
    assert.deepEqual(await next(), { eventId: 'wounded-woman', caseId: null, endingId: null });

    await explore();
    const count = await reports();
    const first = await claim();
    assert.equal(first.status, 200);
    assert.equal(first.data.report, undefined);
    assert.deepEqual(first.data.event, {
      id: 'wounded-woman',
      title: 'Ranna kobieta',
      art: 'wounded-woman',
      scene: 'forest-ambush',
      figure: woman.figure,
      text: woman.text,
      options: [
        { id: 'help', label: 'Pomóż jej sprawnie' },
        { id: 'ask', label: 'Zadaj dodatkowe pytania' },
        { id: 'leave', label: 'Odejdź nieufnie' },
      ],
    });
    // Nothing is saved until the choice, and asking again shows the same.
    assert.equal(await reports(), count);
    assert.deepEqual((await claim()).data, first.data);
    assert.equal((await claim('uciekaj')).data.error.code, 'invalid_choice');

    const left = await claim('leave');
    assert.equal(left.status, 200);
    assert.equal(left.data.report.event.option.id, 'leave');
    assert.equal(left.data.report.event.fight, null);
    assert.equal(left.data.character.activity, null);
    assert.equal(await reports(), count + 1);
    // Played, the event is not chosen any more.
    assert.equal(await next(), null);
  });

  test('"Pomóż jej sprawnie" adds the bandits\' fight to the report, and they stay out of the Bestiariusz', async () => {
    await pastTutorial();
    await choose('wounded-woman', 'ambush');
    assert.deepEqual(await next(), { eventId: 'wounded-woman', caseId: 'ambush', endingId: null });
    await explore();
    assert.equal((await claim()).data.event.id, 'wounded-woman');
    const { report } = (await claim('help')).data;
    assert.equal(report.event.case, 'ambush');
    const fight = report.fights.at(-1);
    assert.equal(fight.event, true);
    assert.deepEqual(
      fight.enemies.map((enemy) => enemy.monsterId),
      bandits,
    );
    assert.equal(report.event.fight, report.fights.length - 1);
    assert.equal(report.keyFight.index, report.fights.length - 1);
    const met = JSON.parse((await (await db()).prepare('SELECT met FROM characters').first()).met);
    assert.ok(bandits.every((id) => !met.includes(id)));
  });

  test('turned into a Błędnica, the woman joins the Bestiariusz as a creature met on the way', async () => {
    await pastTutorial();
    await choose('wounded-woman', null, 'wisp');
    // Avoiding the elites, the exploration meets no Błędnica of its own.
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5, avoidRare: true } })).status, 201);
    await call('POST', '/api/test/skip-time', { cookie });
    await (await db()).prepare(`UPDATE characters SET met = '[]'`).run();
    assert.equal((await claim()).data.event.id, 'wounded-woman');
    const { report } = (await claim('ask')).data;
    const fight = report.fights.at(-1);
    assert.equal(fight.event, true);
    assert.deepEqual(
      fight.enemies.map((enemy) => enemy.monsterId),
      ['wisp'],
    );
    assert.ok(report.fights.slice(0, -1).every((one) => one.enemies.every((enemy) => enemy.monsterId !== 'wisp')));
    const met = JSON.parse((await (await db()).prepare('SELECT met FROM characters').first()).met);
    assert.ok(met.includes('wisp'));
  });

  test('a Kwiat paproci the fern flower leaves goes to the bag', async () => {
    await pastTutorial();
    await choose('fern-flower', null, 'blossom');
    assert.deepEqual(await next(), { eventId: 'fern-flower', caseId: 'free', endingId: 'blossom' });
    await (await db()).prepare(`UPDATE characters SET herbs = '{"comfrey":4}'`).run();
    await explore();
    assert.equal((await claim()).data.event.id, 'fern-flower');
    const { report } = (await claim('pick')).data;
    assert.deepEqual(report.event.reward, { gold: 0, item: null, herbs: { 'fern-blossom': 1 } });
    assert.deepEqual(JSON.parse((await (await db()).prepare('SELECT herbs FROM characters').first()).herbs), { comfrey: 4, 'fern-blossom': 1 });
  });

  test('the blue mushroom gives a free stat point, a buff for the next explorations, or a faint that costs gold', async () => {
    await pastTutorial();
    const character = async () => (await call('GET', '/api/character', { cookie })).data.character;
    const eat = async (endingId) => {
      await choose('blue-mushroom', null, endingId);
      await explore();
      assert.equal((await claim()).data.event.land, 'windfalls');
      return (await claim('eat')).data.report;
    };
    assert.match((await eat('point')).event.option.text, /\(\+1 Wolny Punkt Statystyk\)\.$/);
    // The point stays beside those of the levels (the exploration may have
    // brought a level too), and the points spent before are 150 + 140.
    assert.equal((await (await db()).prepare('SELECT bonus_points FROM characters').first()).bonus_points, 1);
    const view = await character();
    const perLevel = content.statIds.length;
    assert.equal(view.freePoints, perLevel * (view.level - 1) + Math.floor(perLevel / 4) * (view.classLevel - 1) + 1 - 290);
    await eat('damage');
    assert.deepEqual(
      (await character()).buffs.map(({ kind, fights, bonus }) => ({ kind, fights, bonus })),
      [{ kind: 'damage', fights: 2, bonus: 0.1 }],
    );
    // A short exploration may bring no gold, and then loses none (the
    // engine's test checks both cases on fixed numbers).
    const fainted = await eat('faint');
    const lost = Number(/\(−(\d+) złota\)\.$/.exec(fainted.event.option.text)?.[1] ?? 0);
    assert.equal(fainted.event.loss.gold, lost);
    assert.ok(Math.abs(lost - Math.round(0.3 * (fainted.summary.gold + lost))) <= 1, `${lost} of ${fainted.summary.gold + lost}`);
  });

  test('chosen to be honest, the woman thanks with gold or an item that reach the character', async () => {
    await pastTutorial();
    await choose('wounded-woman', 'grateful-gold');
    await explore();
    const before = (await call('GET', '/api/character', { cookie })).data.character.gold;
    await claim();
    const paid = (await claim('help')).data;
    assert.equal(paid.report.event.case, 'grateful-gold');
    assert.ok(paid.report.fights.every((fight) => !fight.event));
    assert.ok(paid.report.event.reward.gold > 0);
    assert.ok(paid.character.gold >= before + paid.report.event.reward.gold);
    assert.equal(await next(), null);

    await choose('wounded-woman', 'grateful-find');
    await explore();
    await claim();
    const found = (await claim('help')).data.report;
    assert.equal(found.event.case, 'grateful-find');
    assert.ok(found.items[found.event.reward.item]);
  });
});

describe('events in the live game', () => {
  const { call, db, signUp } = useServer({ EVENTS: 'on' });

  test('the Błędnica, approved by the author, comes in the live game too', async () => {
    const { cookie } = await signUp('wedrowiec');
    await call('POST', '/api/character', { cookie, body: { name: 'Wedrowiec', classId: 'warrior', appearance: 'male' } });
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    await call('POST', '/api/test/skip-time', { cookie });
    await call('POST', '/api/hunts/claim', { cookie });
    await (await db()).prepare(`UPDATE characters SET level = 30, points = '{"strength":150,"vitality":140}', hp_at = 0, event_test = 'wounded-woman:grateful-gold:wisp'`).run();
    await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
    await call('POST', '/api/test/skip-time', { cookie });
    assert.equal((await call('POST', '/api/hunts/claim', { cookie })).data.event.id, 'wounded-woman');
    const { report } = (await call('POST', '/api/hunts/claim', { cookie, body: { choice: 'ask' } })).data;
    assert.equal(report.event.option.text, woman.options[1].outcome[1].text);
    assert.deepEqual(
      report.fights[report.event.fight].enemies.map((enemy) => enemy.monsterId),
      ['wisp'],
    );
  });
});

describe('events switched off', () => {
  const { call, db, signUp } = useServer();

  test('no event comes, and "Testuj zdarzenia" does not exist', async () => {
    const { cookie } = await signUp('wedrowiec');
    await call('POST', '/api/character', { cookie, body: { name: 'Wedrowiec', classId: 'warrior', appearance: 'male' } });
    assert.equal((await call('GET', '/api/test/events', { cookie })).status, 404);
    assert.equal((await call('POST', '/api/test/events', { cookie, body: { eventId: 'wounded-woman' } })).status, 404);
    for (let index = 0; index < 2; index++) {
      await (await db()).prepare(`UPDATE characters SET event_test = 'wounded-woman', level = 30, points = '{"strength":150,"vitality":140}', hp_at = 0`).run();
      await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } });
      await call('POST', '/api/test/skip-time', { cookie });
      const claimed = await call('POST', '/api/hunts/claim', { cookie });
      assert.equal(claimed.status, 200);
      assert.equal(claimed.data.report.event, null);
    }
  });
});

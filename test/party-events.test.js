// Zdarzenia drużynowe in the engine (src/engine/party-events.js; the
// author's 844 A, 845 A, 846 A, 847 B and 848, 12.11.2026): the event a
// Drużyna's trip brings, drawn from the trip's seed as often as an
// exploration's events come, only after a trip that ended as planned, the
// drafts only where they are on; its outcome drawn once for everyone, and
// what each member gets at its own level, nobody sharing; the one fight of
// the whole party; the leader's note and the option it cannot take without
// a healing potion; each member's report; and the party's boon.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { boonLines, carriedHealing, eventChance, huntWait, monsterXp, partyEventFor, partyEventHunt, partyEventView, resolvePartyEvent, withBoon } from '../src/engine/index.js';
import { content, newCharacter } from './helpers/content.js';

const area = content.areasById['mossy-boulders'];
const eventOf = (id) => content.partyEventsById[id];
// A member of the trip: a warrior of `level`, strong (`strong`) or weak.
const member = (id, name, level, { strong = true, ...extra } = {}) => ({
  id,
  name,
  hpEnd: strong ? 5000 : 40,
  character: newCharacter('warrior', { level, classLevel: level, points: strong ? { strength: 12 * level, vitality: 12 * level, endurance: 4 * level } : {}, ...extra }),
  equipped: [],
});
const party = [member(11, 'Testowa Alfa', 30), member(12, 'Testowy Beta', 24), member(13, 'Testowa Gamma', 36)];
const resolve = (eventId, optionId, seed, members = party, extra = {}) =>
  resolvePartyEvent({ event: eventOf(eventId), optionId, seed, areaId: area.id, level: 30, leaderId: members[0]?.id ?? 0, members, ...extra }, content);
// The first seed whose draw of the option's outcome list gives `outcomeId`.
function seedOf(eventId, optionId, outcomeId) {
  for (let i = 0; i < 500; i++) {
    const seed = `seed-${i}`;
    if (resolve(eventId, optionId, seed, []).outcome === outcomeId) return seed;
  }
  throw new Error(`no seed for ${eventId}/${optionId}/${outcomeId}`);
}
const gems = content.minerals.filter((mineral) => mineral.kind === 'gem').sort((a, b) => a.level - b.level);
const bestGem = (level, step = 0) => gems[Math.max(0, gems.findLastIndex((gem) => gem.level <= level) - step)].id;
const goldRange = (level, times) => [Math.round(content.balance.rewards.goldPerLevel * level * times * 0.75), Math.round(content.balance.rewards.goldPerLevel * level * times * 1.25)];

describe('the event a trip brings', () => {
  const success = { result: 'success', minutes: 30 };

  test('drawn from the trip\'s seed: the same seed, the same event, in every member\'s claim', () => {
    for (let i = 0; i < 200; i++) {
      const seed = `trip-${i}`;
      assert.deepEqual(partyEventFor({ hunt: success, seed }, content)?.id, partyEventFor({ hunt: { ...success }, seed }, content)?.id);
    }
  });

  test('as often as an exploration\'s events, each event as likely as the others', () => {
    const counts = {};
    let events = 0;
    const tries = 6000;
    for (let i = 0; i < tries; i++) {
      const event = partyEventFor({ hunt: { result: 'success', minutes: 60 }, seed: `chance-${i}` }, content);
      if (!event) continue;
      events += 1;
      counts[event.id] = (counts[event.id] ?? 0) + 1;
    }
    const chance = eventChance(content, 60);
    assert.ok(Math.abs(events / tries - chance) < 0.02, `${events / tries} vs ${chance}`);
    const open = content.partyEvents.list.filter((event) => !event.draft);
    assert.deepEqual(Object.keys(counts).sort(), open.map((event) => event.id).sort());
    for (const count of Object.values(counts)) assert.ok(Math.abs(count / events - 1 / open.length) < 0.06, JSON.stringify(counts));
  });

  test('only after a trip that ended as planned', () => {
    const seeds = Array.from({ length: 300 }, (_, i) => `ended-${i}`);
    assert.ok(seeds.some((seed) => partyEventFor({ hunt: success, seed }, content)));
    for (const result of ['fainted', 'escaped']) {
      for (const seed of seeds) assert.equal(partyEventFor({ hunt: { ...success, result }, seed }, content), null);
    }
  });

  test('a draft event only where the drafts are on (the test version)', () => {
    // An event the author has not approved yet: none is now, so a copy of
    // the data with one.
    const list = content.partyEvents.list.map((event) => (event.id === 'campfire-tales' ? { ...event, draft: true } : event));
    const drafted = { ...content, partyEvents: { ...content.partyEvents, list } };
    const seeds = Array.from({ length: 3000 }, (_, i) => `draft-${i}`);
    assert.ok(seeds.every((seed) => partyEventFor({ hunt: success, seed }, drafted)?.id !== 'campfire-tales'));
    assert.ok(seeds.some((seed) => partyEventFor({ hunt: success, seed, drafts: true }, drafted)?.id === 'campfire-tales'));
  });
});

describe('what each member gets, at its own level', () => {
  test('gold of goldPerLevel × its level, ±25%, for each, nobody sharing', () => {
    const seed = seedOf('rope-bridge', 'ford', 'cache');
    const result = resolve('rope-bridge', 'ford', seed);
    assert.equal(result.kind, 'reward');
    for (const one of party) {
      const [low, high] = goldRange(one.character.level, 4);
      const { gold } = result.members[one.id];
      assert.ok(gold >= low && gold <= high, `${one.name}: ${gold} not in ${low}–${high}`);
    }
    // The same outcome however often it is resolved, and in any order.
    assert.deepEqual(resolve('rope-bridge', 'ford', seed), result);
    assert.deepEqual(resolve('rope-bridge', 'ford', seed, [...party].reverse(), { leaderId: party[0].id }).members, result.members);
  });

  test('XP as for beating the foes at its level', () => {
    const result = resolve('rope-bridge', 'one-by-one', 'xp');
    const foes = eventOf('rope-bridge').options[0].outcome.xpFoes;
    for (const one of party) {
      const xp = foes.reduce((sum, id) => sum + monsterXp(content.monstersById[id], one.character.level, content), 0) * (1 + content.balance.hunt.soloXpBonus);
      assert.equal(result.members[one.id].xp, Math.round(xp));
    }
    assert.ok(result.members[13].xp > result.members[11].xp && result.members[11].xp > result.members[12].xp);
  });

  test('a split reward: the gem to the leader, gold to the others', () => {
    const result = resolve('buried-chest', 'stone', 'split');
    assert.deepEqual(result.members[11], { gold: 0, xp: 0, minerals: { [bestGem(30)]: 1 }, part: 'leader' });
    for (const id of [12, 13]) {
      assert.equal(result.members[id].part, 'others');
      assert.equal(result.members[id].minerals, undefined);
      assert.ok(result.members[id].gold > 0);
    }
    // A gem `step` lower, each by its own level.
    const plain = resolve('buried-chest', 'check', seedOf('buried-chest', 'check', 'plain'));
    for (const one of party) assert.deepEqual(Object.keys(plain.members[one.id].minerals), [bestGem(one.character.level, 1)]);
  });

  test('healing potions of its level, and herbs its Zielarstwo knows, or gold without it', () => {
    const herbalist = member(14, 'Testowy Zielarz', 50, { professions: { herbalism: { level: 40, xp: 0 } } });
    const young = member(15, 'Testowa Młoda', 8);
    const members = [...party, herbalist, young];
    const result = resolve('smugglers-camp', 'sneak', seedOf('smugglers-camp', 'sneak', 'loot'), members);
    assert.deepEqual(result.members[11].potions, { healing: 2 });
    assert.deepEqual(result.members[14].potions, { 'greater-healing': 2 });
    assert.deepEqual(result.members[15].potions, { 'lesser-healing': 2 });
    const herbs = result.members[14].herbs;
    assert.equal(Object.values(herbs).reduce((sum, count) => sum + count, 0), 3);
    for (const id of Object.keys(herbs)) assert.ok(content.herbsById[id].level <= 40);
    // Zielarstwo at its first level knows the first herb.
    assert.deepEqual(result.members[12].herbs, { comfrey: 3 });
    // Below the level Zielarstwo opens at: gold instead.
    assert.equal(result.members[15].herbs, undefined);
    assert.equal(result.members[15].herbsGold, true);
    assert.ok(result.members[15].gold > 0);
  });

  test('reputation with the brotherhoods, and a loss of the most HP, for each', () => {
    assert.deepEqual(resolve('wounded-hunter', 'escort', 'rep').members[12].reputation, { hunters: 15 });
    const breaks = resolve('rope-bridge', 'run', seedOf('rope-bridge', 'run', 'breaks'));
    for (const one of party) assert.deepEqual(breaks.members[one.id], { gold: 0, xp: 0, hpLoss: 0.15 });
    assert.equal(breaks.boon, null);
  });

  test('a boon is the party\'s, for its next trip', () => {
    assert.deepEqual(resolve('rope-bridge', 'run', seedOf('rope-bridge', 'run', 'across')).boon, { haste: 0.1 });
    assert.deepEqual(resolve('campfire-tales', 'listen', 'boon').boon, { xp: 0.1 });
    assert.deepEqual(resolve('campfire-tales', 'tell', 'boon').boon, { gold: 0.1 });
  });
});

describe('the fight of the whole party', () => {
  test('one fight of every member with its HP of the trip\'s end; won, each gets the foes\' XP and gold at its level and the materials', () => {
    const result = resolve('smugglers-camp', 'attack', 'fight');
    assert.equal(result.won, true);
    const { fight } = result;
    assert.equal(fight.allies.length, 3);
    assert.deepEqual(
      fight.enemies.map((enemy) => [enemy.monsterId, enemy.level]),
      [
        ['smuggler', 30],
        ['smuggler', 30],
        ['bandit-knifer', 30],
      ],
    );
    assert.ok(fight.events.length > 0);
    const groupFactor = content.balance.hunt.groupFactors[2];
    for (const one of party) {
      const share = result.members[one.id];
      const xp = ['smuggler', 'smuggler', 'bandit-knifer'].reduce((sum, id) => sum + monsterXp(content.monstersById[id], one.character.level, content) * groupFactor, 0);
      assert.equal(share.xp, Math.round(xp * (1 + content.balance.hunt.soloXpBonus)));
      assert.ok(share.gold > 0);
      // Of the creatures of the trip's inner region.
      assert.equal(Object.values(share.materials).reduce((sum, count) => sum + count, 0), 3);
      const creatures = new Set([...area.encounters, ...area.tough].flatMap((encounter) => encounter.monsters).map((id) => content.materialsByMonster[id]?.id));
      for (const key of Object.keys(share.materials)) assert.ok(creatures.has(key.split(':')[0]), key);
      assert.ok(fight.hp[one.id].before > 0);
    }
  });

  test('lost, everyone faints, and loses no XP nor gold; ambushed, the foes move first', () => {
    const weak = [member(21, 'Testowy Słaby', 30, { strong: false }), member(22, 'Testowa Słaba', 30, { strong: false })];
    const result = resolve('smugglers-camp', 'sneak', seedOf('smugglers-camp', 'sneak', 'wake'), weak);
    assert.equal(result.won, false);
    for (const one of weak) assert.deepEqual(result.members[one.id], { gold: 0, xp: 0, faint: true });
    const first = result.fight.events.find((event) => event.actor);
    assert.ok(first.actor.startsWith('e'), JSON.stringify(first));
  });
});

describe('the leader, the reports and the boon', () => {
  test('the leader decides for the others, and an option giving away a healing potion waits for one', () => {
    const event = eventOf('wounded-hunter');
    const view = partyEventView(event, { area, names: ['Testowy Beta', 'Testowa Gamma'], potion: false }, content);
    assert.equal(view.note, 'Decydujesz za całą drużynę: Testowy Beta, Testowa Gamma.');
    assert.equal(view.land, area.regionId);
    assert.deepEqual(view.figure, { left: 50, bottom: 0, height: 60 });
    assert.deepEqual(
      view.options.map((option) => [option.id, option.locked ?? null]),
      [
        ['escort', null],
        ['potion', 'brak mikstury leczenia'],
        ['leave', null],
      ],
    );
    assert.equal(partyEventView(event, { area, names: [], potion: true }, content).options[1].locked, undefined);
    // The best healing potion carried is the one given away.
    assert.equal(carriedHealing({ 'lesser-healing': 3, mana: 2, 'greater-healing': 1, healing: 4 }, content), 'greater-healing');
    assert.equal(carriedHealing({ mana: 2, speed: 0 }, content), null);
  });

  test('each member\'s report: the choice, what came of it for it, its HP and what found no room', () => {
    const seed = seedOf('rope-bridge', 'run', 'breaks');
    const result = resolve('rope-bridge', 'run', seed);
    const told = partyEventHunt({ event: eventOf('rope-bridge'), result, memberId: 12, area, chosenBy: 'leader', hp: { start: 300, end: 255, max: 300, lost: 45 } }, content);
    assert.equal(told.title, 'Zdarzenie drużyny: Wiszący most');
    assert.equal(told.line, 'Lider wybrał: Biegiem, razem.');
    assert.equal(told.hunt.event.option.label, 'Biegiem, razem');
    assert.ok(told.hunt.event.option.text.endsWith('Każdy traci 15% zdrowia. Tracisz 45 HP.'), told.hunt.event.option.text);
    assert.equal(told.hunt.result, 'success');
    assert.deepEqual(told.hunt.fights, []);
    // Busy elsewhere, its HP waits, and nobody chose in time.
    const busy = partyEventHunt({ event: eventOf('rope-bridge'), result, memberId: 12, area, chosenBy: 'auto', hp: { start: null, end: null, max: null, busy: true } }, content);
    assert.ok(busy.hunt.event.option.text.endsWith(content.partyEvents.texts.busyHp));
    assert.equal(busy.line, 'Lider nie wybrał w ciągu 12 godzin, więc drużyna wybrała najostrożniej: Biegiem, razem.');
    // The herbs and potions, and those that found no room in the bag.
    const members = [...party, member(15, 'Testowa Młoda', 8)];
    const loot = resolve('smugglers-camp', 'sneak', seedOf('smugglers-camp', 'sneak', 'loot'), members);
    const full = partyEventHunt(
      { event: eventOf('smugglers-camp'), result: loot, memberId: 12, area, chosenBy: 'leader', hp: { start: 1, end: 1, max: 1 }, bagLost: { potions: { healing: 2 } } },
      content,
    );
    assert.equal(
      full.hunt.event.option.text,
      'Skrzynia otwiera się bez skrzypnięcia. W środku są mikstury i zioła, a każdy bierze swoją część: 2 × Zwykła mikstura leczenia, 3 × Żywokost. W plecaku zabrakło miejsca na: 2 × Zwykła mikstura leczenia.',
    );
    // Without Zielarstwo the gold, told by the outcome's goldText.
    const gold = partyEventHunt({ event: eventOf('smugglers-camp'), result: loot, memberId: 15, area, chosenBy: 'leader', hp: { start: 1, end: 1, max: 1 } }, content);
    assert.ok(gold.hunt.event.option.text.endsWith(`2 × Mniejsza mikstura leczenia i złoto (+${loot.members[15].gold} złota).`), gold.hunt.event.option.text);
    assert.equal(gold.hunt.gold, loot.members[15].gold);
  });

  test('a fight in each member\'s report: its own HP, XP and gold, the foes and how it ended', () => {
    const result = resolve('smugglers-camp', 'attack', 'fight');
    const told = partyEventHunt({ event: eventOf('smugglers-camp'), result, fight: result.fight, memberId: 13, area, chosenBy: 'leader', hp: { start: 100, end: 100, max: 100 } }, content);
    const [fight] = told.hunt.fights;
    assert.equal(fight.won, true);
    assert.equal(fight.event, true);
    assert.equal(fight.hpBefore, result.fight.hp[13].before);
    assert.equal(fight.xp, result.members[13].xp);
    assert.deepEqual(told.hunt.keyFight, { index: 0 });
    assert.equal(told.hunt.event.fight, 0);
    assert.equal(told.hunt.xp, result.members[13].xp);
    assert.deepEqual(told.hunt.materials, result.members[13].materials);
    const entry = told.hunt.entries.find((one) => one.type === 'fight');
    assert.ok(entry.text.startsWith('Przemytnicy zrywają się od ogniska: Przemytnik 1 (poz. 30)'), entry.text);
    assert.ok(entry.text.includes('Każdy zgarnia swoją część:'));
  });

  test('the boon: a shorter wait, more XP and gold of the trip, each told in a line', () => {
    assert.equal(huntWait(60, 0, content, 0.1), 3240000);
    assert.equal(huntWait(60, 0, content), 3600000);
    assert.deepEqual(withBoon({ xp: 1000, gold: 55 }, { xp: 0.1, gold: 0.1 }), { xp: 1100, gold: 61 });
    const plain = { xp: 1000, gold: 55 };
    assert.equal(withBoon(plain, { haste: 0.1 }), plain);
    assert.deepEqual(boonLines({ haste: 0.1, xp: 0.1 }, content), ['Premia drużyny: ta wyprawa była o 10% krótsza.', 'Premia drużyny: +10% PD z tej wyprawy.']);
    assert.deepEqual(boonLines(null, content), []);
  });
});

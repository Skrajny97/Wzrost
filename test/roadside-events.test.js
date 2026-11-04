// The roadside events of 31.10.2026 (questions 216–227): the wandering
// beggar who may be Weles or a thief, the haunted shrine with its soul or
// its Upiór, the merchant stuck in the mud, and the leshy who leads the path
// astray. Their options may cost gold or belong to one class, and their
// outcomes may take gold or resources, curse, tell a rumor or pay in the
// Osada's reputation.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { eventFor, eventView, knownHerbs, optionLock, resolveEvent, simulateHunt } from '../src/engine/index.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';

// The newest place's stronger creatures (balance.monsters.huntCurve,
// hunt-strength.test.js) aside: these fights test something else.
const calm = { ...content, balance: { ...content.balance, monsters: { ...content.balance.monsters, huntCurve: [] } } };
import { useServer } from './helpers/server.js';

const beggar = content.eventsById['wandering-beggar'];
const shrine = content.eventsById['haunted-shrine'];
const merchant = content.eventsById['stuck-merchant'];
const leshy = content.eventsById.leshy;
const herbalism = content.gathering.profession;

describe('the roadside events in the engine', () => {
  const { character, equipped } = typicalCharacter('warrior', 30, content);
  const seed = 'droga';
  const base = simulateHunt({ character, equipped, hp: 99999, name: 'Mira', areaId: 'lynx-ridge', minutes: 60, seed }, calm);
  const hunt = { ...base, resources: { wood: 20, stone: 10, 'iron-ore': 5 } };
  const resolve = (event, optionId, caseId = null, extra = {}) =>
    resolveEvent({ hunt, event, optionId, caseId, character, equipped, name: 'Mira', seed, purse: 1000, ...extra }, content);

  test("an option with a price shows it and is greyed out above the purse; the exorcism is the Kleryk's", () => {
    const who = { classId: 'warrior', level: 30, purse: 1000 };
    const view = eventView(beggar, content.areasById['lynx-ridge'], who, content);
    assert.deepEqual(
      view.options.find((option) => option.id === 'coins'),
      { id: 'coins', label: 'Wrzuć mu kilka monet', cost: 60 },
    );
    assert.equal(eventView(beggar, null, { ...who, purse: 59 }, content).options.find((option) => option.id === 'coins').locked, 'za mało złota');
    // Seen by every class, greyed out but for the Kleryk (question 223 B).
    const exorcism = shrine.options.find((option) => option.id === 'exorcism');
    assert.equal(eventView(shrine, null, who, content).options.find((option) => option.id === 'exorcism').locked, `tylko ${content.classesById.cleric.name}`);
    assert.equal(optionLock(exorcism, { ...who, classId: 'cleric' }, content), null);
    // Without the character nothing is greyed out (the report's view).
    assert.deepEqual(eventView(shrine).options.map((option) => Object.keys(option)), shrine.options.map(() => ['id', 'label']));
  });

  test('the beggar blesses for a few coins, Weles gives a point or curses, and the thief takes the purse instead', () => {
    const blessed = resolve(beggar, 'coins', 'beggar');
    assert.equal(blessed.spent, 60);
    assert.deepEqual(blessed.event.reward.buff, { kind: 'armor', bonus: 0.1, fights: 2 });
    assert.match(blessed.event.option.text, /\(−60 złota\)/);
    const god = resolve(beggar, 'coins', 'veles');
    assert.deepEqual([god.spent, god.event.reward.points], [60, 1]);
    assert.deepEqual(resolve(beggar, 'chase', 'veles').event.reward.buff, { kind: 'curse', bonus: 0.1, fights: 4 });
    assert.ok(['unique', 'epic'].includes(resolve(beggar, 'song', 'veles').items.at(-1).rarity));
    // A tenth of the purse, the character's gold with the exploration's, at
    // most 20 gold a level, and not the coins on top.
    const robbed = resolve(beggar, 'coins', 'thief');
    assert.equal(robbed.spent, Math.min(Math.round((1000 + hunt.gold) * 0.1), 20 * 30));
    assert.deepEqual(robbed.event.loss, { gold: robbed.spent, resources: {} });
    assert.match(robbed.event.option.text, new RegExp(`\\(−${robbed.spent} złota\\)\\.$`));
    assert.equal(resolve(beggar, 'coins', 'thief', { purse: 0, hunt: { ...hunt, gold: 0 } }).event.option.text, beggar.cases[2].outcomes.coins.text);
    // While he plays, his partner takes a fifth of the resources gathered.
    const song = resolve(beggar, 'song', 'thief');
    assert.deepEqual(song.resources, { wood: 16, stone: 8, 'iron-ore': 4 });
    assert.match(song.event.option.text, /\(Drewno −4, Kamień −2, Ruda żelaza −1\)\.$/);
    assert.equal(song.spent, 0);
  });

  test("the beggar's song tells today's rumor, and without one only a song", () => {
    const area = content.areasById['lynx-ridge'];
    const rumor = { day: 'dzis', areaId: area.id, monsterId: area.elite, line: 0, used: false };
    const told = resolve(beggar, 'song', 'beggar', { rumor });
    assert.deepEqual(told.event.reward.rumor, rumor);
    assert.ok(told.event.option.text.includes(`„${area.name}. Tam widziano ${content.monstersById[area.elite].counted[0]}”`), told.event.option.text);
    const quiet = resolve(beggar, 'song', 'beggar');
    assert.equal(quiet.event.option.text, beggar.cases[0].outcomes.song.noRumorText);
    assert.equal(quiet.event.reward.rumor, undefined);
  });

  test('the shrine: a prayer meets the Upiór, the exorcism drives him off, and robbed he strikes first and leaves silver', () => {
    assert.deepEqual(resolve(shrine, 'pray', 'upior').fights.at(-1).enemies.map((enemy) => [enemy.monsterId, enemy.level]), [['upior', 30]]);
    const exorcised = resolve(shrine, 'exorcism', 'upior');
    assert.equal(exorcised.fights.length, hunt.fights.length);
    assert.ok(exorcised.event.reward.xp > 0);
    assert.equal(exorcised.xp, hunt.xp + exorcised.event.reward.xp);
    assert.match(exorcised.event.option.text, new RegExp(`\\(\\+${exorcised.event.reward.xp} XP\\)`));
    assert.ok(['rare', 'unique', 'epic'].includes(exorcised.items[exorcised.event.reward.item].rarity));
    // The same fight without the silver pays that much less.
    const robbed = resolve(shrine, 'offerings', 'upior');
    const plain = resolveEvent(
      {
        hunt,
        event: { ...shrine, cases: [{ ...shrine.cases[1], outcomes: { ...shrine.cases[1].outcomes, offerings: { ...shrine.cases[1].outcomes.offerings, win: undefined } } }] },
        optionId: 'offerings',
        caseId: 'upior',
        character,
        equipped,
        name: 'Mira',
        seed,
        purse: 1000,
      },
      content,
    );
    assert.equal(robbed.fights.at(-1).won, true);
    assert.ok(robbed.fights.at(-1).gold > plain.fights.at(-1).gold);
    const cursed = resolve(shrine, 'offerings', 'soul');
    assert.ok(cursed.gold > hunt.gold);
    assert.deepEqual(cursed.event.reward.buff, { kind: 'curse', bonus: 0.1, fights: 2 });
    assert.equal(resolve(shrine, 'offerings', 'empty').event.reward.buff, undefined);
    assert.deepEqual(resolve(shrine, 'pray', 'soul').event.reward.buff, { kind: 'focus', bonus: 0.1, fights: 2 });
  });

  test('the merchant comes only with the Osada and from level 20, and pays in its reputation', () => {
    const always = { ...content, events: { ...content.events, chance: 1, longChance: 1, list: [merchant] } };
    const at = (areaId) => ({ result: 'success', areaId, minutes: 30 });
    assert.equal(eventFor({ hunt: at('lynx-ridge'), seed }, always), null);
    assert.equal(eventFor({ hunt: at('lynx-ridge'), seed, forced: merchant.id }, always), null);
    assert.equal(eventFor({ hunt: at('lynx-ridge'), seed, settlement: true }, always), merchant);
    assert.equal(eventFor({ hunt: at('viper-heaps'), seed, settlement: true }, always), null);
    const helped = resolve(merchant, 'help', 'honest');
    assert.deepEqual(helped.event.reward.reputation, { merchants: 15 });
    const paid = resolve(merchant, 'demand', 'honest');
    assert.ok(helped.gold > paid.gold && paid.gold > hunt.gold);
    assert.equal(paid.event.reward.reputation, undefined);
    assert.ok(resolve(merchant, 'help', 'swindler').spent > 0);
    assert.deepEqual(resolve(merchant, 'help', 'ambush').fights.at(-1).enemies.map((enemy) => enemy.monsterId), ['bandit-thug', 'bandit-knifer', 'bandit-crossbow']);
  });

  test('the leshy: turned clothes bring known herbs or gold, sometimes not; bread and coins a chest; the duel his gift', () => {
    assert.ok(leshy.areas.every((id) => ['windfalls', 'stone-glade'].includes(content.areasById[id].regionId)));
    const herbalist = { ...character, professions: { [herbalism]: { level: 10, xp: 0 } } };
    const turned = resolveEvent({ hunt, event: leshy, optionId: 'clothes', endingId: 'breaks', character: herbalist, equipped, name: 'Mira', seed, purse: 0 }, content);
    const given = turned.event.reward.herbs;
    assert.equal(Object.values(given).reduce((sum, count) => sum + count, 0), 2);
    assert.ok(Object.keys(given).every((id) => knownHerbs(10, content).some((herb) => herb.id === id)));
    assert.deepEqual(turned.herbs, Object.fromEntries(Object.entries(given)));
    // Before the Zielarstwo opens (level 10), gold.
    const { character: young, equipped: kit } = typicalCharacter('warrior', 3, content);
    const youngHunt = simulateHunt({ character: young, equipped: kit, hp: 9999, name: 'Mira', areaId: 'windfalls-edge', minutes: 30, seed }, content);
    const paid = resolveEvent({ hunt: youngHunt, event: leshy, optionId: 'clothes', endingId: 'breaks', character: young, equipped: kit, name: 'Mira', seed, purse: 0 }, content);
    assert.equal(paid.event.reward.herbs, null);
    assert.ok(paid.event.reward.gold > 0);
    assert.match(paid.event.option.text, new RegExp(`\\(\\+${paid.event.reward.gold} złota\\)\\.$`));
    // One time in four the old way fails, as walking on does: 30% of the
    // resources gathered are lost.
    const holds = resolve(leshy, 'clothes', null, { endingId: 'holds' });
    assert.deepEqual(holds.resources, { wood: 14, stone: 7, 'iron-ore': 3 });
    assert.deepEqual(resolve(leshy, 'onward').resources, holds.resources);
    const failed = Array.from({ length: 200 }, (_, index) =>
      resolveEvent({ hunt, event: leshy, optionId: 'clothes', character: herbalist, equipped, name: 'Mira', seed: `ubranie-${index}`, purse: 0 }, content),
    ).filter((one) => one.event.loss).length;
    assert.ok(failed > 30 && failed < 70, `${failed} of 200`);
    const bread = resolve(leshy, 'bread');
    assert.equal(bread.spent, 60);
    assert.ok(['rare', 'unique', 'epic'].includes(bread.items[bread.event.reward.item].rarity));
    const duel = resolve(leshy, 'duel');
    const fight = duel.fights.at(-1);
    assert.deepEqual(fight.enemies.map((enemy) => [enemy.monsterId, enemy.level]), [['leshy', 30]]);
    assert.equal(fight.won, true);
    assert.ok(['unique', 'epic'].includes(duel.items[fight.chests.at(-1)].rarity));
    assert.match(duel.entries.at(-1).text, /Leszy kłania się nisko/);
  });

  test('a curse weakens the blows in the fights it covers', () => {
    const start = { character, equipped, hp: 99999, name: 'Mira', areaId: 'lynx-ridge', minutes: 30, seed: 'klatwa' };
    const plain = simulateHunt(start, content);
    const cursed = simulateHunt({ ...start, buffs: { curse: { bonus: 0.1, fights: 4 } } }, content);
    assert.equal(cursed.buffFights.curse, cursed.fights.length);
    const firstBlow = (one) => {
      const fight = one.fights[0];
      return fight.events.find((event) => event.kind === 'hit' && event.actor === fight.allies[0].id).damage;
    };
    assert.ok(firstBlow(cursed) < firstBlow(plain), `${firstBlow(cursed)} < ${firstBlow(plain)}`);
  });
});

describe('the roadside events through the API', () => {
  const { call, db, signUp } = useServer({ EVENTS: 'test', SETTLEMENT: 'on' });
  let cookie;

  beforeEach(async () => {
    ({ cookie } = await signUp('wedrowka'));
    await call('POST', '/api/character', { cookie, body: { name: 'Wedrowka', classId: 'warrior', appearance: 'female' } });
  });

  const explore = async () => {
    assert.equal((await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 5 } })).status, 201);
    await call('POST', '/api/test/skip-time', { cookie });
  };
  const claim = (choice) => call('POST', '/api/hunts/claim', { cookie, ...(choice !== undefined && { body: { choice } }) });
  const choose = (eventId, caseId, endingId) => call('POST', '/api/test/events', { cookie, body: { eventId, ...(caseId && { caseId }), ...(endingId && { endingId }) } });
  // Past the tutorial's exploration, strong enough to end every one as
  // planned, at level 30 with its class.
  const pastTutorial = async () => {
    await explore();
    assert.equal((await claim()).data.event, undefined);
    await (await db()).prepare(`UPDATE characters SET level = 30, class_level = 30, points = '{"strength":150,"vitality":140}', hp_at = 0, gold = 1000`).run();
  };
  const row = async () => (await db()).prepare('SELECT gold, settlement FROM characters').first();

  test("the coins' price comes off the purse, and the Kleryk's exorcism is greyed out for the others", async () => {
    await pastTutorial();
    await choose('wandering-beggar', 'beggar');
    await explore();
    const coins = (await claim()).data.event.options.find((option) => option.id === 'coins');
    assert.deepEqual(coins, { id: 'coins', label: 'Wrzuć mu kilka monet', cost: 60 });
    const { report, character } = (await claim('coins')).data;
    assert.equal(character.gold, 1000 + report.summary.gold - 60);
    assert.deepEqual(
      character.buffs.map(({ kind, bonus }) => ({ kind, bonus })),
      [{ kind: 'armor', bonus: 0.1 }],
    );

    await choose('haunted-shrine', 'soul');
    await explore();
    const options = (await claim()).data.event.options;
    assert.equal(options.find((option) => option.id === 'exorcism').locked, 'tylko Kleryk');
    const refused = await claim('exorcism');
    assert.deepEqual([refused.status, refused.data.error.code], [409, 'class_only']);
    assert.equal((await claim('offerings')).status, 200);
    const cursed = (await call('GET', '/api/character', { cookie })).data.character.buffs.find((buff) => buff.kind === 'curse');
    assert.deepEqual([cursed.bonus, cursed.label], [0.1, 'Klątwa: obrażenia −10%']);
  });

  test("the merchant's thanks join the Kompania Kupców' reputation", async () => {
    await pastTutorial();
    await choose('stuck-merchant', 'honest');
    await explore();
    assert.equal((await claim()).data.event.id, 'stuck-merchant');
    assert.equal((await claim('help')).status, 200);
    assert.equal(JSON.parse((await row()).settlement).reputation.merchants, 15);
  });

  test("the beggar's song tells today's rumor, and the Karczma's mug still tells it for the relation", async () => {
    await pastTutorial();
    await choose('wandering-beggar', 'beggar');
    await explore();
    await claim();
    const { report } = (await claim('song')).data;
    const rumor = JSON.parse((await row()).settlement).rumor;
    assert.equal(rumor.song, true);
    assert.ok(report.event.option.text.includes(content.areasById[rumor.areaId].name), report.event.option.text);
    // The Karczma has not told it: the mug tells the same, for its price.
    const tavern = async () => (await call('GET', '/api/settlement', { cookie })).data.settlement.tavern;
    assert.equal((await tavern()).rumor, null);
    const mug = await call('POST', '/api/settlement/tavern', { cookie });
    assert.equal(mug.status, 200);
    const after = JSON.parse((await row()).settlement);
    assert.deepEqual({ ...after.rumor }, { day: rumor.day, areaId: rumor.areaId, monsterId: rumor.monsterId, line: rumor.line, used: false });
    assert.ok((await tavern()).rumor.text.length > 0);
    assert.equal((await call('POST', '/api/settlement/tavern', { cookie })).data.error.code, 'told');
  });
});

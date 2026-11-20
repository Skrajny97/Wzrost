// The Kącina: opiekun tygodnia (1201 A, accepted on the review page on
// 19.11.2026; src/engine/guild-shrine.js, src/server/guild-shrine.js): three
// of the four gods offered each week, in turn; one vote a member until
// Sunday's end; the winner counted once as the next week starts (a tie to
// the leader's god, else to the one that reached as many first; no votes,
// no patron); its bonus for every member the whole week, kept by an
// exploration and a work from their start as a week of the year's, and
// half of the week's board of the Próby from its domain, marked.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  drawTrialBoard,
  godBonusText,
  godDomain,
  huntReport,
  applyHunt,
  offeredGods,
  omenLines,
  patronEffects,
  patronWinner,
  questPeriod,
  shrineGod,
  simulateHunt,
  trialsOpen,
  voteCounts,
  weekFactor,
  weekLine,
  weekNumber,
} from '../src/engine/index.js';
import { contentIn } from '../src/server/content.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rules = content.guilds.shrine;
const DAY = 86400000;
const HOUR = 3600000;

describe('the Kącina in the engine', () => {
  test('four gods, each with a bonus of the weeks and a domain of four kinds of the Próby', () => {
    assert.deepEqual(
      rules.gods.map((god) => [god.id, god.name, god.effects.map((effect) => `${effect.kind} ${effect.value}`).join(', ')]),
      [
        ['perun', 'Perun', 'xp 5'],
        ['weles', 'Weles', 'gold 5'],
        // Since 20.11.2026 Swaróg and Mokosz give more (the author: „Swaróg
        // niech daje dodatkowe premię a nie tylko Kowadło i Mokosz też”).
        ['swarog', 'Swaróg', 'upgrade 5, rarity 5'],
        ['mokosz', 'Mokosz', 'herbs 5, profession-xp 5, materials 5, resources 5, camp 5'],
      ],
    );
    assert.equal(godBonusText(shrineGod('perun', content), content), '+5% XP z walk');
    assert.equal(godBonusText(shrineGod('weles', content), content), '+5% złota z walk');
    assert.equal(godBonusText(shrineGod('swarog', content), content), '+5% szansy ulepszenia na Kowadle, +5% szansy na rzadsze przedmioty z wypraw');
    assert.equal(
      godBonusText(shrineGod('mokosz', content), content),
      '+5% ziół w Zielarstwie, +5% XP profesji, +5% materiałów ze stworów, +5% zasobów z wypraw, +5% z budynków Obozu',
    );
    // In English too.
    const english = contentIn('en');
    assert.equal(godBonusText(shrineGod('perun', english), english), '+5% XP from fights');
    assert.equal(godBonusText(shrineGod('swarog', english), english), '+5% upgrade chance on the Anvil, +5% chance of rarer items from explorations');
    assert.equal(
      godBonusText(shrineGod('mokosz', english), english),
      "+5% herbs in Herbalism, +5% profession XP, +5% materials from creatures, +5% resources from explorations, +5% from the Camp's buildings",
    );
    assert.deepEqual(godDomain('perun', content), ['killAny', 'towers', 'explore', 'salvage']);
    assert.deepEqual(godDomain('swarog', content), ['upgrade', 'makeAny', 'process', 'salvage']);
    assert.deepEqual(godDomain('mokosz', content), ['gatherAny', 'brewAny', 'process', 'orders']);
    assert.deepEqual(godDomain('nobody', content), []);
    assert.equal(shrineGod('nobody', content), null);
    assert.deepEqual(patronEffects('perun', content), [{ kind: 'xp', value: 5, patron: 'perun' }]);
    assert.deepEqual(patronEffects('weles', content), [{ kind: 'gold', value: 5, patron: 'weles' }]);
    assert.deepEqual(patronEffects('swarog', content), [
      { kind: 'upgrade', value: 5, patron: 'swarog' },
      { kind: 'rarity', value: 5, patron: 'swarog' },
    ]);
    assert.deepEqual(patronEffects('mokosz', content), [
      { kind: 'herbs', value: 5, patron: 'mokosz' },
      { kind: 'profession-xp', value: 5, patron: 'mokosz' },
      { kind: 'materials', value: 5, patron: 'mokosz' },
      { kind: 'resources', value: 5, patron: 'mokosz' },
      { kind: 'camp', value: 5, patron: 'mokosz' },
    ]);
    assert.deepEqual(patronEffects(null, content), []);
  });

  test('three gods a week, in the order of the list, each resting one week in four', () => {
    const monday = (offset) => {
      const date = new Date(Date.UTC(2026, 10, 16) + offset * 7 * DAY);
      return date.toISOString().slice(0, 10);
    };
    assert.equal(weekNumber(monday(1)) - weekNumber(monday(0)), 1);
    const weeks = Array.from({ length: 8 }, (_, index) => offeredGods(monday(index), content));
    for (const offered of weeks) {
      assert.equal(offered.length, 3);
      // In the list's order.
      assert.deepEqual(offered, rules.gods.map((god) => god.id).filter((id) => offered.includes(id)));
    }
    // Each god rests once in any four weeks running, and the turns repeat.
    const resting = weeks.map((offered) => rules.gods.find((god) => !offered.includes(god.id)).id);
    assert.deepEqual(new Set(resting.slice(0, 4)).size, 4);
    assert.deepEqual(resting.slice(4), resting.slice(0, 4));
  });

  test('the most votes win; a tie goes to the leader, else to the first to reach it; no votes, no patron', () => {
    const offered = ['perun', 'weles', 'swarog'];
    const vote = (characterId, god, at) => ({ characterId, god, at });
    assert.equal(patronWinner([], 1, offered), null);
    assert.equal(patronWinner([vote(2, 'weles', 5), vote(3, 'weles', 6), vote(1, 'perun', 1)], 1, offered), 'weles');
    // A tie: the leader's god.
    assert.equal(patronWinner([vote(1, 'swarog', 9), vote(2, 'perun', 1)], 1, offered), 'swarog');
    // The leader voted for neither of those tied: the one that had as many first.
    const tied = [vote(2, 'perun', 10), vote(3, 'weles', 4), vote(4, 'weles', 20), vote(5, 'perun', 15), vote(1, 'swarog', 1)];
    assert.equal(patronWinner(tied, 1, offered), 'perun');
    assert.equal(patronWinner(tied, null, offered), 'perun');
    // A vote for a god not offered counts for nothing.
    assert.equal(patronWinner([vote(2, 'mokosz', 1)], 1, offered), null);
    assert.deepEqual([...voteCounts(tied, offered)].map(([id, tally]) => [id, tally.count]), [['perun', 2], ['weles', 2], ['swarog', 1]]);
  });

  test("half the board of the Próby comes from the patron's domain, marked, the halves taking turns", () => {
    const { board } = content.guilds.trials;
    const plain = drawTrialBoard('7:2026-11-23', content);
    assert.deepEqual(drawTrialBoard('7:2026-11-23', content, null), plain);
    assert.equal(plain.length, board);
    assert.ok(plain.every((trial) => !trial.god));
    for (const god of rules.gods) {
      const drawn = drawTrialBoard('7:2026-11-23', content, { god: god.id, domain: god.domain });
      assert.equal(drawn.length, board);
      const inside = drawn.filter((trial) => trial.god === god.id);
      assert.equal(inside.length, board / 2, god.id);
      assert.ok(inside.every((trial) => god.domain.includes(trial.kind)), god.id);
      assert.ok(drawn.filter((trial) => !trial.god).every((trial) => !god.domain.includes(trial.kind)), god.id);
      // No kind and size twice.
      assert.equal(new Set(drawn.map((trial) => `${trial.kind}:${trial.size}`)).size, board);
      // The halves take turns, so every day opens as many of each.
      for (let day = 0; day < 7; day += 1) {
        const open = drawn.slice(0, trialsOpen(day, content));
        assert.equal(open.filter((trial) => trial.god).length, open.length / 2, `${god.id}, day ${day}`);
      }
    }
  });

  test("an exploration under Perun gets 5% more XP, and its report names the patron, not the week's", () => {
    const settled = typicalCharacter('warrior', 40, content);
    const setOut = (week) => simulateHunt({ ...settled, hp: 99999, name: 'Mira', areaId: 'raven-hollows', minutes: 1, seed: 'kącina', lootSeed: 'łup', week }, content);
    const plain = setOut(null);
    const blessed = setOut({ effects: patronEffects('perun', content) });
    assert.equal(plain.fights[0].won, true);
    assert.ok(Math.abs(blessed.xp - plain.xp * 1.05) <= plain.fights.length, `${blessed.xp} for ${plain.xp}`);
    assert.equal(blessed.gold, plain.gold);
    assert.equal(weekFactor({ effects: patronEffects('perun', content) }, 'xp'), 1.05);
    // With a week of the year too: each named on its own.
    const both = setOut({ number: 3, effects: [...content.weeksByNumber[3].effects, ...patronEffects('perun', content)] });
    assert.equal(weekLine(both, content), 'Tydzień Kuny: +5% złota z walk.');
    assert.deepEqual(omenLines(both, content), ['Opieka Peruna: +5% XP z walk.']);
    const report = huntReport({ hunt: both, applied: applyHunt(settled.character, both, content), character: settled.character, areaId: 'raven-hollows', startedAt: 0, endsAt: 1 }, content);
    assert.ok(report.system.includes('Opieka Peruna: +5% XP z walk.'), report.system.join(' | '));
    // Mokosz's bonuses of an exploration are its materials and resources:
    // one that brought none of them has no line of hers.
    const quiet = setOut({ effects: patronEffects('mokosz', content) });
    assert.deepEqual([quiet.materials, quiet.resources], [{}, {}]);
    assert.deepEqual(omenLines(quiet, content), []);
  });

  // Perun and Weles as they were; Swaróg and Mokosz since 20.11.2026 also on
  // every exploration: rarer items, more materials and resources.
  test('an exploration of four hours under each god: Perun its XP, Weles its gold, Swaróg rarer items, Mokosz materials and resources', () => {
    const settled = typicalCharacter('warrior', 40, content);
    const explore = (seed, effects = null) =>
      simulateHunt({ ...settled, hp: 99999, name: 'Mira', areaId: 'raven-hollows', minutes: 240, seed, lootSeed: `${seed}:łup`, week: effects && { effects } }, content);
    const seeds = Array.from({ length: 6 }, (_, index) => `kącina-${index}`);
    const plain = seeds.map((seed) => explore(seed));
    const under = (god) => seeds.map((seed) => explore(seed, patronEffects(god, content)));
    const sum = (hunts, of) => hunts.reduce((all, hunt) => all + of(hunt), 0);
    const fightGold = (hunt) => hunt.fights.reduce((all, fight) => all + fight.gold, 0);
    const pieces = (counts) => Object.values(counts).reduce((all, count) => all + count, 0);

    // Perun: 5% more XP from each fight, the loot as it was.
    const perun = under('perun');
    perun.forEach((hunt, index) => {
      assert.ok(Math.abs(hunt.xp - plain[index].xp * 1.05) <= hunt.fights.length, `${hunt.xp} for ${plain[index].xp}`);
      assert.deepEqual([hunt.gold, hunt.items, hunt.materials, hunt.resources], [plain[index].gold, plain[index].items, plain[index].materials, plain[index].resources]);
    });
    // Weles: 5% more gold from the fights, the XP and the loot as they were.
    const weles = under('weles');
    weles.forEach((hunt, index) => {
      assert.ok(Math.abs(fightGold(hunt) - fightGold(plain[index]) * 1.05) <= hunt.fights.length, `${fightGold(hunt)} for ${fightGold(plain[index])}`);
      assert.deepEqual([hunt.xp, hunt.items, hunt.materials, hunt.resources], [plain[index].xp, plain[index].items, plain[index].materials, plain[index].resources]);
    });
    // Swaróg: the rarer items' share times 1.05 (the loot's own draws, so a
    // few items change), the fights as they were; his line where items came.
    const swarog = under('swarog');
    swarog.forEach((hunt, index) => assert.equal(hunt.xp, plain[index].xp));
    assert.equal(weekFactor({ effects: patronEffects('swarog', content) }, 'rarity'), 1.05);
    const withItems = swarog.find((hunt) => hunt.items.length > 0);
    assert.deepEqual(omenLines(withItems, content), ['Opieka Swaroga: +5% szansy na rzadsze przedmioty z wypraw.']);
    // Mokosz: 5% more materials from the creatures (the weeks' share, as
    // weeks.test.js tries it) and 5% more resources, found and gathered on
    // the way. Against the same exploration with her materials alone, which
    // draws the loot alike, each bundle of resources times 1.05, rounded on
    // its own, and nothing else: herbs, a profession's XP and the camp's
    // buildings are no exploration's. Her line names what changed.
    const mokosz = under('mokosz');
    const materialsAlone = seeds.map((seed) => explore(seed, [{ kind: 'materials', value: 5, patron: 'mokosz' }]));
    assert.ok(sum(materialsAlone, (hunt) => pieces(hunt.resources)) > 0);
    mokosz.forEach((hunt, index) => {
      const same = materialsAlone[index];
      assert.deepEqual([hunt.xp, hunt.gold, hunt.items, hunt.materials], [same.xp, same.gold, same.items, same.materials]);
      const bundles = same.entries.filter((entry) => entry.type === 'find' || entry.type === 'gather').length;
      assert.ok(Math.abs(pieces(hunt.resources) - pieces(same.resources) * 1.05) <= bundles * 3, `${pieces(hunt.resources)} for ${pieces(same.resources)}`);
      const named = [Object.keys(hunt.materials).length > 0 && '+5% materiałów ze stworów', Object.keys(hunt.resources).length > 0 && '+5% zasobów z wypraw'].filter(Boolean);
      assert.deepEqual(omenLines(hunt, content), named.length > 0 ? [`Opieka Mokoszy: ${named.join(', ')}.`] : []);
    });
    assert.ok(mokosz.some((hunt) => Object.keys(hunt.materials).length > 0));
    assert.ok(sum(mokosz, (hunt) => pieces(hunt.resources)) > sum(materialsAlone, (hunt) => pieces(hunt.resources)));
    assert.equal(weekFactor({ effects: patronEffects('mokosz', content) }, 'materials'), 1.05);
    assert.equal(weekFactor({ effects: patronEffects('mokosz', content) }, 'camp'), 1.05);
  });
});

describe('the Kącina through the API', () => {
  const { call, db, signUp } = useServer({ TEST_CLOCK: 'on', PROFESSIONS: 'on' });
  const cookies = {};
  // Wednesday of the week of 16 November 2026, at noon in Poland.
  const WEDNESDAY = Date.UTC(2026, 10, 18, 11);
  let clock = WEDNESDAY;
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body, now: clock });
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  const shrine = async (login) => (await as(login, 'GET', '/api/guild/shrine')).data;
  const vote = (login, god, week) => as(login, 'POST', '/api/guild/shrine/vote', { god, ...(week && { week }) });
  const weekKey = (at) => questPeriod('weekly', at, content).key;
  const offeredNow = () => offeredGods(weekKey(clock), content);

  async function player(login, name) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' }, now: clock });
    await run('UPDATE characters SET level = 30, class_level = 25, gold = 5000 WHERE name = ?', name);
  }

  async function join(login, name) {
    const id = (await as('wodz', 'GET', '/api/guild')).data.guild.id;
    await as('wodz', 'POST', '/api/guild/invite', { name });
    assert.equal((await as(login, 'POST', '/api/guild/accept', { guildId: id })).status, 200);
  }

  beforeEach(async () => {
    clock = WEDNESDAY;
    await player('wodz', 'Wódz');
    await player('kmiec', 'Kmieć');
    await player('baba', 'Baba');
    await player('obcy', 'Obcy');
    assert.equal((await as('wodz', 'POST', '/api/guild/found', { name: 'Gontyna', tag: 'GT' })).status, 200);
    await join('kmiec', 'Kmieć');
    await join('baba', 'Baba');
    await run('UPDATE sessions SET expires_at = ?', WEDNESDAY + 60 * DAY);
    await run('UPDATE users SET seen_at = ?', WEDNESDAY);
  });

  test("the week's three gods with their votes, and one vote a member that stays", async () => {
    const seen = await shrine('kmiec');
    assert.equal(seen.shrine.name, 'Kącina');
    assert.equal(seen.patron, null);
    assert.equal(seen.week, weekKey(clock));
    assert.deepEqual(seen.vote.gods.map((god) => god.id), offeredNow());
    assert.ok(seen.vote.gods.every((god) => god.votes === 0 && god.voters.length === 0 && !god.mine));
    assert.deepEqual([seen.vote.mine, seen.vote.leading, seen.vote.tied], [null, null, false]);
    assert.equal(seen.texts.title, 'Kącina');
    // The vote waits: the Siedziba's dot.
    assert.equal((await as('kmiec', 'GET', '/api/guild/todo')).data.todo.seat, true);

    const [god, other] = offeredNow();
    const cast = await vote('kmiec', god, weekKey(clock));
    assert.equal(cast.status, 200, JSON.stringify(cast.data));
    assert.equal(cast.data.text, `Twój głos: ${shrineGod(god, content).name}.`);
    assert.equal(cast.data.vote.mine, god);
    assert.equal(cast.data.vote.leading, god);
    const tally = cast.data.vote.gods.find((one) => one.id === god);
    assert.deepEqual([tally.votes, tally.voters, tally.mine], [1, ['Kmieć'], true]);
    assert.equal((await as('kmiec', 'GET', '/api/guild/todo')).data.todo.seat, false);
    // Another member sees it, its own vote still waiting.
    const theirs = await shrine('baba');
    assert.equal(theirs.vote.mine, null);
    assert.equal(theirs.vote.gods.find((one) => one.id === god).votes, 1);

    // A second tap for the same god answers as the first; another god, no.
    const again = await vote('kmiec', god);
    assert.equal(again.status, 200);
    assert.equal(again.data.vote.gods.find((one) => one.id === god).votes, 1);
    const changed = await vote('kmiec', other);
    assert.equal(changed.status, 409);
    assert.equal(changed.data.error.code, 'voted');
    assert.equal(changed.data.error.message, `Twój głos w tym tygodniu już padł: ${shrineGod(god, content).name}.`);
    assert.equal((await first('SELECT COUNT(*) AS n FROM guild_shrine_votes')).n, 1);
  });

  test('refused: a god not offered, an unknown one, a page of a week gone, outside a guild', async () => {
    const resting = rules.gods.find((god) => !offeredNow().includes(god.id)).id;
    const notOffered = await vote('baba', resting);
    assert.deepEqual([notOffered.status, notOffered.data.error.code, notOffered.data.error.message], [409, 'not_offered', rules.texts.errors.noGod]);
    assert.equal((await vote('baba', 'zeus')).status, 400);
    assert.equal((await vote('baba', 7)).status, 400);
    const stale = await vote('baba', offeredNow()[0], weekKey(clock - 7 * DAY));
    assert.deepEqual([stale.status, stale.data.error.code], [409, 'changed']);
    const outside = await vote('obcy', offeredNow()[0]);
    assert.deepEqual([outside.status, outside.data.error.code], [409, 'no_guild']);
    assert.equal((await shrine('obcy')).guild, null);
    assert.equal((await first('SELECT COUNT(*) AS n FROM guild_shrine_votes')).n, 0);
  });

  test("the next week's patron: the most votes win, its bonus goes with every member's exploration, half the board is its", async () => {
    const [a, b] = offeredNow();
    await vote('kmiec', a);
    await vote('baba', a);
    await vote('wodz', b);
    // Sunday, a minute before midnight: still this week, no patron yet.
    clock = questPeriod('weekly', WEDNESDAY, content).endsAt - 60000;
    assert.equal((await shrine('kmiec')).patron, null);
    // The next week: the god of the most votes.
    clock = WEDNESDAY + 7 * DAY;
    const seen = await shrine('baba');
    assert.equal(seen.patron.id, a);
    assert.equal(seen.patron.bonus, godBonusText(shrineGod(a, content), content));
    assert.deepEqual(seen.vote.gods.map((god) => god.votes), [0, 0, 0]);
    assert.equal((await first('SELECT god_id FROM guild_patrons WHERE week = ?', weekKey(clock))).god_id, a);
    // Counted once: later votes of the week gone change nothing.
    await run('INSERT INTO guild_shrine_votes (guild_id, week, character_id, god_id, voted_at) SELECT guild_id, ?, character_id + 100, ?, 1 FROM guild_members', weekKey(WEDNESDAY), b);
    assert.equal((await shrine('wodz')).patron.id, a);

    // An exploration keeps the patron's effects from its start, marked.
    assert.equal((await as('kmiec', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 10 })).status, 201);
    const { options } = await first("SELECT options FROM activities WHERE character_id = (SELECT id FROM characters WHERE name = 'Kmieć')");
    assert.deepEqual(JSON.parse(options).week.effects, patronEffects(a, content));

    // Half the board of the week from the patron's domain, marked, and the
    // card of the Próby names it.
    const trials = await as('baba', 'GET', '/api/guild/trials');
    assert.equal(trials.status, 200);
    assert.equal(trials.data.patron.id, a);
    assert.equal(trials.data.patron.text, `Tydzień pod opieką ${shrineGod(a, content).genitive}: połowa prób jest z dziedziny opiekuna i ma jego znak.`);
    const board = JSON.parse((await first('SELECT trials FROM guild_trial_boards WHERE week = ?', weekKey(clock))).trials);
    assert.equal(board.filter((trial) => trial.god === a).length, content.guilds.trials.board / 2);
    assert.ok(trials.data.trials.some((trial) => trial.god === a));
    assert.ok(trials.data.trials.every((trial) => !trial.god || godDomain(a, content).includes(trial.kind)));
  });

  test("a member who leaves loses the patron's bonus, and one who joins gets it", async () => {
    await vote('kmiec', offeredNow()[0]);
    clock = WEDNESDAY + 7 * DAY;
    const god = (await shrine('kmiec')).patron.id;
    assert.equal((await as('baba', 'POST', '/api/guild/leave')).status, 200);
    assert.equal((await as('baba', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 10 })).status, 201);
    const left = await first("SELECT options FROM activities WHERE character_id = (SELECT id FROM characters WHERE name = 'Baba')");
    assert.equal(JSON.parse(left.options).week ?? null, null);
    await join('obcy', 'Obcy');
    assert.equal((await as('obcy', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 10 })).status, 201);
    const joined = await first("SELECT options FROM activities WHERE character_id = (SELECT id FROM characters WHERE name = 'Obcy')");
    assert.deepEqual(JSON.parse(joined.options).week.effects, patronEffects(god, content));
    // The week after, with no votes this week: no patron, and the board as ever.
    clock = WEDNESDAY + 14 * DAY;
    const empty = await shrine('kmiec');
    assert.equal(empty.patron, null);
    assert.equal(empty.texts.patronNone, rules.texts.patronNone);
    assert.equal((await as('kmiec', 'GET', '/api/guild/trials')).data.patron, null);
    const board = JSON.parse((await first('SELECT trials FROM guild_trial_boards WHERE week = ?', weekKey(clock))).trials);
    assert.ok(board.every((trial) => !trial.god));
    // The Kronika told each count in the guild's chat (1195 A), once: not
    // the first week, when the Kącina had no week before to count; the
    // patron with its bonus; nobody's votes.
    const told = (await (await db()).prepare("SELECT chronicle_key, text FROM chat_messages WHERE chronicle_key LIKE 'patron:%' ORDER BY id").all()).results;
    const patron = shrineGod(god, content);
    assert.deepEqual(
      told.map((line) => [line.chronicle_key, line.text]),
      [
        [`patron:${weekKey(WEDNESDAY + 7 * DAY)}`, `Kącina: w tym tygodniu gildia jest pod opieką ${patron.genitive} (${godBonusText(patron, content)}).`],
        [`patron:${weekKey(WEDNESDAY + 14 * DAY)}`, 'Kącina: w tym tygodniu gildia nie ma opiekuna, bo w zeszłym tygodniu nikt nie zagłosował.'],
      ],
    );
  });

  test('a tie goes to the god the leader voted for', async () => {
    const [a, b] = offeredNow();
    await vote('kmiec', a);
    await vote('wodz', b);
    const tied = await shrine('baba');
    assert.deepEqual([tied.vote.tied, tied.vote.leading], [true, b]);
    clock = WEDNESDAY + 7 * DAY;
    assert.equal((await shrine('baba')).patron.id, b);
  });

  test('a tie without the leader goes to the god that reached its votes first', async () => {
    const [a, b] = offeredNow();
    await vote('baba', b);
    clock += HOUR;
    await vote('kmiec', a);
    clock = WEDNESDAY + 7 * DAY;
    assert.equal((await shrine('wodz')).patron.id, b);
  });

  test("under Swaróg the Kowadło's chance is 5% higher, under Mokosz a gathering keeps its share of herbs", async () => {
    // Swaróg's week, as counted for the guild.
    const guildId = (await first("SELECT id FROM guilds WHERE tag = 'GT'")).id;
    const week = weekKey(clock);
    await run('INSERT INTO guild_patrons (guild_id, week, god_id, settled_at) VALUES (?, ?, ?, ?)', guildId, week, 'swarog', clock);
    await run(
      `INSERT INTO buildings (character_id, building_id, level, started_at, ends_at) SELECT id, 'anvil', 5, 0, 1 FROM characters WHERE name = 'Kmieć'`,
    );
    const chain = { base: 'chainmail', slot: 'chest', level: 5, rarity: 'common', affixes: [], armor: 15 };
    await run(`INSERT INTO items (character_id, slot, data, created_at) SELECT id, NULL, ?, 0 FROM characters WHERE name = 'Kmieć'`, JSON.stringify(chain));
    const chances = async (login) => {
      const { character } = (await as(login, 'GET', '/api/character')).data;
      return character.bag.filter((item) => item.anvil?.next).map((item) => item.anvil.next.chance);
    };
    const blessed = await chances('kmiec');
    await run('DELETE FROM guild_patrons');
    const plain = await chances('kmiec');
    assert.ok(plain.length > 0);
    assert.ok(blessed[0] > plain[0]);
    blessed.forEach((chance, index) => assert.ok(Math.abs(chance - Math.min(1, plain[index] * 1.05)) < 1e-9, `${chance} for ${plain[index]}`));

    // Mokosz's week: a gathering keeps her herbs and her profession's XP.
    await run('INSERT INTO guild_patrons (guild_id, week, god_id, settled_at) VALUES (?, ?, ?, ?)', guildId, week, 'mokosz', clock);
    const gathered = await as('baba', 'POST', '/api/professions/gather', { herbs: ['comfrey'], minutes: 60 });
    assert.equal(gathered.status, 201, JSON.stringify(gathered.data));
    const { options } = await first("SELECT options FROM activities WHERE character_id = (SELECT id FROM characters WHERE name = 'Baba')");
    const kept = JSON.parse(options).week;
    assert.equal(weekFactor(kept, 'herbs'), 1.05);
    assert.equal(weekFactor(kept, 'profession-xp'), 1.05);
  });

  // Since 20.11.2026 (the author: „Swaróg niech daje dodatkowe premię a nie
  // tylko Kowadło i Mokosz też, bo sie nie opłacają”).
  test("under Swaróg an exploration keeps his rarer items; under Mokosz hers, and the camp's buildings give 5% more as a store is collected", async () => {
    const guildId = (await first("SELECT id FROM guilds WHERE tag = 'GT'")).id;
    const week = weekKey(clock);
    const patron = (god) => run('INSERT OR REPLACE INTO guild_patrons (guild_id, week, god_id, settled_at) VALUES (?, ?, ?, ?)', guildId, week, god, clock);
    const keptBy = async (login, name) => {
      assert.equal((await as(login, 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 10 })).status, 201);
      const { options } = await first('SELECT options FROM activities WHERE character_id = (SELECT id FROM characters WHERE name = ?)', name);
      return JSON.parse(options).week;
    };
    await patron('swarog');
    const swarog = await keptBy('kmiec', 'Kmieć');
    assert.equal(weekFactor(swarog, 'rarity'), 1.05);
    assert.equal(weekFactor(swarog, 'upgrade'), 1.05);
    // (The weeks of the year are off here: the patron's effects alone.)
    await patron('mokosz');
    const mokosz = await keptBy('baba', 'Baba');
    assert.deepEqual(mokosz.effects, patronEffects('mokosz', content));
    assert.deepEqual(['materials', 'resources', 'camp', 'rarity'].map((kind) => weekFactor(mokosz, kind)), [1.05, 1.05, 1.05, 1]);

    // A Tartak of level 10 with its store full, 1 200 wood: 1 260 for a
    // member under Mokosz, 1 200 for one outside the guild.
    const tartak = (name, collectedAt) =>
      run("INSERT OR REPLACE INTO buildings (character_id, building_id, level, started_at, ends_at, collected_at) SELECT id, 'sawmill', 10, 0, 1, ? FROM characters WHERE name = ?", collectedAt, name);
    await tartak('Kmieć', clock - 24 * HOUR);
    await tartak('Obcy', clock - 24 * HOUR);
    const collected = async (login) => {
      const answer = await as(login, 'POST', '/api/camp/collect', { buildingId: 'sawmill' });
      assert.equal(answer.status, 200, JSON.stringify(answer.data));
      return answer.data.collected.amount;
    };
    assert.equal(await collected('obcy'), 1200);
    assert.equal(await collected('kmiec'), 1260);
    // The Zbieracz Systemu's too: ten hours of the store, 600 wood, and 630
    // under Mokosz.
    await run("UPDATE characters SET collector_at = ?, resources = json_set(resources, '$.wood', 0) WHERE name IN ('Kmieć', 'Obcy')", clock - 20 * HOUR);
    await tartak('Kmieć', clock - 10 * HOUR);
    await tartak('Obcy', clock - 10 * HOUR);
    const wood = async (login) => (await as(login, 'GET', '/api/character')).data.character.resources.wood;
    assert.equal(await wood('obcy'), 600);
    assert.equal(await wood('kmiec'), 630);
  });

  test('a guild that goes takes its votes and patrons along', async () => {
    await vote('kmiec', offeredNow()[0]);
    clock = WEDNESDAY + 7 * DAY;
    await shrine('kmiec');
    for (const login of ['kmiec', 'baba']) assert.equal((await as(login, 'POST', '/api/guild/leave')).status, 200);
    assert.equal((await as('wodz', 'POST', '/api/guild/leave')).status, 200);
    assert.equal((await first('SELECT COUNT(*) AS n FROM guild_patrons')).n, 0);
    assert.equal((await first('SELECT COUNT(*) AS n FROM guild_shrine_votes')).n, 0);
  });
});

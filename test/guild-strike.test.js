// The classes of the day (1197), the podcięcia and the Cios (1203) at the
// Bestia Gildii and the Wyprawa's strażnicy, and the Kronika Gildii (1195 A)
// (src/engine/guild-strike.js, src/server/guild-strike.js,
// src/server/guild-chronicle.js; data/guilds.json classDay, undercut,
// chronicle): the weekly schedule of the classes, the powers multiplying,
// the HP grown, a power making the blows stronger in the fight itself;
// through the API an attack of a class of the day, a podcięcie waiting on
// its beast and used up by three Cios of other players (never by its own
// account), the oldest first, gone with its beast and its week; and the
// Kronika's lines in the guild's chat, each once, in the reader's language:
// the beast's and a guardian's fall, a new member, a Siedziba level and a
// Próby threshold.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  beastLairs,
  classDays,
  classesOfDay,
  classOfDay,
  guildBeastFight,
  questPeriod,
  strikeHpGrowth,
  strikePower,
} from '../src/engine/index.js';
import { chronicleText } from '../src/server/guild-chronicle.js';
import { strikePlan } from '../src/server/guild-strike.js';
import { runInLanguage } from '../src/server/i18n.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const HOUR = 3600000;
const DAY = 24 * HOUR;
const { classDay, undercut } = content.guilds;
// A Monday at noon in Poland, a week ahead, so the same any day.
const monday = questPeriod('weekly', Date.now() + 7 * DAY, content).startsAt + 12 * HOUR;

describe('the classes of the day, the Cios and the Podcięcie', () => {
  test('two classes a day from a weekly schedule: every class has its days, two or three, never two days in a row', () => {
    const days = classDays(content);
    assert.deepEqual(Object.keys(days).sort(), content.classes.map((cls) => cls.id).sort());
    for (const [classId, list] of Object.entries(days)) {
      assert.ok(list.length >= 2 && list.length <= 3, `${classId}: ${list}`);
      for (const day of list) assert.ok(!list.includes((day + 1) % 7), `${classId} ma dwa dni z rzędu: ${list}`);
    }
    for (let day = 0; day < 7; day++) {
      const at = monday + day * DAY;
      assert.deepEqual(classesOfDay(at, content), classDay.schedule[day]);
      assert.equal(classesOfDay(at, content).length, 2);
    }
    // From midnight, Polish time: Sunday 23:59 is still Sunday's.
    const nextMonday = questPeriod('weekly', monday + 7 * DAY, content).startsAt;
    assert.deepEqual(classesOfDay(nextMonday - 60000, content), classDay.schedule[6]);
    assert.deepEqual(classesOfDay(nextMonday, content), classDay.schedule[0]);
    assert.equal(classOfDay(classDay.schedule[0][0], monday, content), true);
    assert.equal(classOfDay(classDay.schedule[1][0], monday, content), classDay.schedule[0].includes(classDay.schedule[1][0]));
  });

  test('the bonuses multiply; a podcięcie takes none of its own', () => {
    assert.equal(strikePower({}, content), 1);
    assert.equal(strikePower({ classDay: true }, content), classDay.power);
    assert.equal(strikePower({ rally: true }, content), content.guilds.rally.power);
    assert.equal(strikePower({ bonus: true }, content), undercut.bonus);
    assert.equal(strikePower({ kind: 'undercut' }, content), undercut.power);
    assert.equal(strikePower({ kind: 'undercut', bonus: true }, content), undercut.power);
    assert.equal(strikePower({ classDay: true, rally: true, bonus: true }, content), Math.round(classDay.power * content.guilds.rally.power * undercut.bonus * 10000) / 10000);
    assert.equal(strikePower({ classDay: true, rally: true, kind: 'undercut' }, content), Math.round(classDay.power * content.guilds.rally.power * undercut.power * 10000) / 10000);
    // The HP of the Bestia and the strażnicy grows by both 1197 and 1203.
    assert.equal(strikeHpGrowth(content), classDay.hp * undercut.hp);
  });

  test('a power makes the character\'s blows that much stronger in the fight itself', () => {
    const { character, equipped } = typicalCharacter('mage', 60, content);
    const area = beastLairs(content)[0];
    const beast = { monsterId: area.champion, areaId: area.id, level: 60, hp: 1e9, maxHp: 1e9 };
    let plain = 0;
    let strong = 0;
    let half = 0;
    for (let i = 0; i < 6; i++) {
      const fight = (power) => guildBeastFight({ character, equipped, name: 'Typowa', beast, seed: `power:${i}`, power }, content).damage;
      plain += fight(1);
      strong += fight(1.5);
      half += fight(0.5);
    }
    assert.ok(Math.abs(strong / plain - 1.5) < 0.08, `${strong / plain}`);
    assert.ok(Math.abs(half / plain - 0.5) < 0.05, `${half / plain}`);
    // The playback shows the blows as they were.
    const fight = guildBeastFight({ character, equipped, name: 'Typowa', beast, seed: 'power:0', power: 1.5 }, content);
    assert.equal(fight.replay.events.length > 0, true);
  });

  test('the Kronika\'s words in each language, the ids as names', () => {
    const monster = content.guilds.expedition && beastLairs(content)[0].champion;
    const pl = runInLanguage('pl', () => chronicleText('beastFell', { monster, name: 'Radomira' }));
    const en = runInLanguage('en', () => chronicleText('beastFell', { monster, name: 'Radomira' }));
    assert.equal(pl, `Bestia padła: ${content.monstersById[monster].name}. Ostatni cios: Radomira.`);
    assert.match(en, /^The Guild Beast has fallen: .+\. Last blow: Radomira\.$/);
    assert.equal(runInLanguage('pl', () => chronicleText('seat', { building: 'guild-forge', level: 3 })), 'Siedziba: Kuźnia Gildii wchodzi na 3. poziom.');
    assert.equal(runInLanguage('pl', () => chronicleText('warWon', { tag: 'LB', guild: 'Leśni Bracia', won: 12, lost: 3 })), 'Wieczór ligi: wygrana z [LB] Leśni Bracia, walki 12:3.');
    // An hour of Polish time.
    const at = Date.UTC(2026, 10, 23, 19, 0);
    assert.equal(runInLanguage('pl', () => chronicleText('rally', { until: at, percent: 30 })), 'Róg zbiórki! Do 20:00 ataki na Bestię i strażnika biją o 30% mocniej.');
    assert.equal(chronicleText('gone', {}), null);
  });
});

describe('the classes of the day, the podcięcia and the Kronika through the API', () => {
  const { call, db, signUp } = useServer({ TEST_CLOCK: 'on' });
  const cookies = {};
  let clock = monday;
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  const all = async (sql, ...binds) => (await (await db()).prepare(sql).bind(...binds).all()).results;
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body, now: clock });
  const strike = (login, kind) => as(login, 'POST', '/api/guild/beast/attack', kind ? { kind } : undefined);
  const view = async (login) => (await as(login, 'GET', '/api/guild/beast')).data;
  const lines = async () => all("SELECT text, chronicle, chronicle_key, system FROM chat_messages WHERE channel LIKE 'guild:%' AND system = 1 ORDER BY id");

  async function player(login, name, classId, level = 40) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId, appearance: 'female' } });
    await run('UPDATE characters SET level = ?, class_level = ?, gold = 50000 WHERE name = ?', level, level, name);
  }

  async function join(login, tag) {
    const invites = (await as(login, 'GET', '/api/guild')).data.invites;
    return as(login, 'POST', '/api/guild/accept', { guildId: invites.find((invite) => invite.tag === tag).guildId });
  }

  beforeEach(async () => {
    for (const key of Object.keys(cookies)) delete cookies[key];
    clock = monday;
    // Monday's classes: Wojownik and Łucznik (classDay.schedule[0]).
    await player('wojowniczka', 'Wojowniczka', classDay.schedule[0][0]);
    await player('magini', 'Magini', classDay.schedule[1][0]);
    await player('trzecia', 'Trzecia', classDay.schedule[1][1]);
    await as('wojowniczka', 'POST', '/api/guild/found', { name: 'Sfora', tag: 'SF' });
    for (const [login, name] of [['magini', 'Magini'], ['trzecia', 'Trzecia']]) {
      await as('wojowniczka', 'POST', '/api/guild/invite', { name });
      assert.equal((await join(login, 'SF')).status, 200);
    }
  });

  test('the card shows the classes of the day; an attack of one of them is a Cios with its bonus, of another a plain one', async () => {
    const seen = await view('wojowniczka');
    assert.deepEqual(seen.strike.classDay.classes.map((cls) => cls.id), classDay.schedule[0]);
    assert.equal(seen.strike.classDay.own, true);
    assert.equal(seen.strike.classDay.percent, 50);
    assert.equal((await view('magini')).strike.classDay.own, classDay.schedule[0].includes(classDay.schedule[1][0]));
    assert.ok(seen.strike.texts.how.some((line) => line.includes('dni w tygodniu')));
    const hit = await strike('wojowniczka');
    assert.equal(hit.status, 200, JSON.stringify(hit.data).slice(0, 300));
    assert.equal(hit.data.attack.kind, 'strike');
    assert.deepEqual(hit.data.attack.boosts, { kind: 'strike', classDay: true, rally: false, bonus: null, power: classDay.power });
    assert.match(hit.data.attack.boostsText, /klasa dnia \+50%/);
    const plain = await strike('magini');
    assert.equal(plain.data.attack.boosts.power, 1);
    assert.equal(plain.data.attack.boostsText, '');
    // On Tuesday the other classes.
    clock = monday + DAY;
    assert.deepEqual((await view('wojowniczka')).strike.classDay.classes.map((cls) => cls.id), classDay.schedule[1]);
  });

  test('a podcięcie hits half as hard and waits for three Cios of other players, the oldest first, never for its own account', async () => {
    const cut = await strike('magini', 'undercut');
    assert.equal(cut.status, 200, JSON.stringify(cut.data).slice(0, 300));
    assert.equal(cut.data.attack.kind, 'undercut');
    assert.equal(cut.data.attack.boosts.power, undercut.power);
    assert.deepEqual(cut.data.strike.undercuts.waiting, [{ name: 'Magini', left: 3, strikes: 'ciosy', own: true }]);
    // Its own Cios takes nothing of it.
    assert.equal(cut.data.strike.undercuts.bonus, null);
    const own = await strike('magini');
    assert.equal(own.data.attack.boosts.bonus, null);
    // Another's podcięcie, made later, waits behind it.
    await strike('trzecia', 'undercut');
    const other = await view('wojowniczka');
    assert.deepEqual(other.strike.undercuts.waiting.map((one) => [one.name, one.left, one.own]), [['Magini', 3, false], ['Trzecia', 3, false]]);
    assert.deepEqual(other.strike.undercuts.bonus, { name: 'Magini' });
    // Three Cios of others use Magini's first, then Trzecia's.
    for (const left of [2, 1, 0]) {
      const hit = await strike(left === 1 ? 'trzecia' : 'wojowniczka');
      assert.equal(hit.status, 200, JSON.stringify(hit.data).slice(0, 300));
      assert.deepEqual(hit.data.attack.boosts.bonus, { name: 'Magini' });
      assert.match(hit.data.attack.boostsText, /podcięcie \(Magini\) \+60%/);
    }
    const after = await view('wojowniczka');
    assert.deepEqual(after.strike.undercuts.waiting.map((one) => [one.name, one.left]), [['Trzecia', 3]]);
    // The rows: Magini's used up, Trzecia's whole.
    assert.deepEqual(
      (await all('SELECT c.name, u.uses_left FROM guild_undercuts u JOIN characters c ON c.id = u.character_id ORDER BY u.id')).map((row) => [row.name, row.uses_left]),
      [['Magini', 0], ['Trzecia', 3]],
    );
  });

  test('two Cios at once on the last bonus: one takes it, the other one\'s batch is refused, so nothing is used twice', async () => {
    await strike('magini', 'undercut');
    await run('UPDATE guild_undercuts SET uses_left = 1');
    const database = await db();
    const guild = await first('SELECT id FROM guilds');
    const beast = await first('SELECT id FROM guild_beasts');
    const row = await first("SELECT * FROM characters WHERE name = 'Wojowniczka'");
    // Wojowniczka's attack reads the bonus waiting…
    const plan = await strikePlan(database, { guild, row, target: `beast:${beast.id}`, kind: 'strike', now: clock });
    assert.deepEqual(plan.boosts.bonus, { name: 'Magini' });
    // …Trzecia's Cios takes it meanwhile…
    assert.deepEqual((await strike('trzecia')).data.attack.boosts.bonus, { name: 'Magini' });
    // …and Wojowniczka's batch fails on its assertion (the game answers that
    // the beast changed meanwhile), the bonus not taken a second time.
    await assert.rejects(database.batch(plan.statements), /malformed JSON/);
    assert.equal((await first('SELECT uses_left FROM guild_undercuts')).uses_left, 0);
  });

  test('a podcięcie of a character of the same account never helps it', async () => {
    // A second character of Magini's account, set aside, in the guild.
    const { id: _, ...row } = await first("SELECT * FROM characters WHERE name = 'Magini'");
    const columns = Object.keys({ ...row, name: 'Druga', name_key: 'druga', role: 'aside' });
    const values = { ...row, name: 'Druga', name_key: 'druga', role: 'aside' };
    await run(`INSERT INTO characters (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, ...columns.map((column) => values[column]));
    const second = await first("SELECT id, user_id FROM characters WHERE name = 'Druga'");
    await run("INSERT INTO guild_members (character_id, guild_id, role, joined_at) SELECT ?, guild_id, 'member', ? FROM guild_members LIMIT 1", second.id, clock);
    // Its podcięcie on the guild's beast.
    await view('magini');
    await run("INSERT INTO guild_undercuts (guild_id, target, week, character_id, user_id, uses_left, created_at) SELECT g.id, 'beast:' || b.id, b.week, ?, ?, 3, ? FROM guilds g JOIN guild_beasts b ON b.guild_id = g.id", second.id, second.user_id, clock);
    const seen = await view('magini');
    assert.ok(seen.strike.undercuts.waiting.length > 0);
    assert.ok(seen.strike.undercuts.waiting.every((one) => one.own));
    assert.equal(seen.strike.undercuts.bonus, null);
    assert.equal((await strike('magini')).data.attack.boosts.bonus, null);
    assert.deepEqual((await strike('trzecia')).data.attack.boosts.bonus, { name: 'Druga' });
  });

  test('the podcięcia go with their beast: none shows once it fell, and a new week\'s beast starts without any', async () => {
    await strike('magini', 'undercut');
    const week = (await view('magini')).beast.week;
    // The beast falls to Trzecia's Cios, which uses the podcięcie.
    await run('UPDATE guild_beasts SET hp = 3');
    const felled = await strike('trzecia');
    assert.equal(felled.data.attack.fell, true);
    assert.deepEqual(felled.data.attack.boosts.bonus, { name: 'Magini' });
    // A new week, a new beast with none waiting; the old week's rows go
    // with the next podcięcie.
    clock = monday + 7 * DAY;
    const next = await view('magini');
    assert.notEqual(next.beast.week, week);
    assert.deepEqual(next.strike.undercuts.waiting, []);
    await strike('magini', 'undercut');
    assert.deepEqual((await all('SELECT week FROM guild_undercuts')).map((row) => row.week), [next.beast.week]);
  });

  test('an attack refused costs nothing: no podcięcie left behind, no bonus used', async () => {
    await strike('magini', 'undercut');
    for (let i = 0; i < 3; i++) assert.equal((await strike('wojowniczka')).status, 200);
    // Out of attacks: refused, Magini's podcięcie stays used up as it was.
    const refused = await strike('wojowniczka', 'undercut');
    assert.equal(refused.status, 409);
    assert.equal(refused.data.error.code, 'no_attacks');
    assert.equal((await first('SELECT COUNT(*) AS count FROM guild_undercuts')).count, 1);
    // A new day: the attacks come back.
    clock = monday + DAY;
    assert.equal((await strike('wojowniczka', 'undercut')).status, 200);
    assert.equal((await first('SELECT COUNT(*) AS count FROM guild_undercuts WHERE uses_left > 0')).count, 1);
  });

  test('the Kronika: the beast\'s fall once with who struck the last blow, a new member, in the reader\'s language', async () => {
    // The two who joined have their lines already.
    assert.deepEqual((await lines()).map((line) => line.text), ['Nowy członek gildii: Magini.', 'Nowy członek gildii: Trzecia.']);
    await view('magini');
    await run('UPDATE guild_beasts SET hp = 3');
    const felled = await strike('trzecia');
    assert.equal(felled.data.attack.fell, true);
    const beast = await first('SELECT id, monster_id FROM guild_beasts');
    const fallLines = (await lines()).filter((line) => line.chronicle_key === `beast:${beast.id}`);
    assert.equal(fallLines.length, 1);
    assert.equal(fallLines[0].text, `Bestia padła: ${content.monstersById[beast.monster_id].name}. Ostatni cios: Trzecia.`);
    // Writing it again does nothing (one line an event).
    await run(
      "INSERT OR IGNORE INTO chat_messages (channel, user_id, character_id, name, level, class_id, text, created_at, system, chronicle, chronicle_key) SELECT channel, user_id, character_id, name, level, class_id, text, created_at, 1, chronicle, chronicle_key FROM chat_messages WHERE chronicle_key = ?",
      `beast:${beast.id}`,
    );
    assert.equal((await lines()).filter((line) => line.chronicle_key === `beast:${beast.id}`).length, 1);
    // The chat shows it as the System's.
    const chat = (await as('magini', 'GET', '/api/chat?channel=guild')).data;
    const shown = chat.messages.filter((message) => message.system);
    assert.deepEqual(shown.map((message) => message.text), ['Nowy członek gildii: Magini.', 'Nowy członek gildii: Trzecia.', fallLines[0].text]);
    assert.ok(shown.every((message) => !message.mentioned && message.own === false));
    // In English for a reader in English (the line keeps its key).
    const kept = JSON.parse(fallLines[0].chronicle);
    assert.equal(kept.key, 'beastFell');
    assert.match(runInLanguage('en', () => chronicleText(kept.key, kept.params)), /^The Guild Beast has fallen: .+\. Last blow: Trzecia\.$/);
  });

  test('the Kronika: a guardian\'s fall and a new level of a Siedziba building', async () => {
    // A guardian barring the way, almost felled, for a member who added minutes.
    const guild = await first('SELECT id FROM guilds');
    const id = await first("SELECT id FROM characters WHERE name = 'Magini'");
    await as('magini', 'GET', '/api/guild/expedition');
    const week = questPeriod('weekly', clock, content).key;
    await run('INSERT INTO guild_expedition_minutes (guild_id, week, character_id, minutes, updated_at) VALUES (?, ?, ?, ?, ?)', guild.id, week, id.id, 100000, clock);
    const seen = (await as('magini', 'GET', '/api/guild/expedition')).data;
    assert.equal(seen.expedition.barred, true, JSON.stringify(seen.expedition).slice(0, 300));
    await run('UPDATE guild_expedition_guardians SET hp = 2');
    const hit = await as('magini', 'POST', '/api/guild/expedition/attack', { kind: 'strike' });
    assert.equal(hit.status, 200, JSON.stringify(hit.data).slice(0, 300));
    assert.equal(hit.data.attack.fell, true);
    const guardian = await first('SELECT id, stage, monster_id FROM guild_expedition_guardians ORDER BY stage LIMIT 1');
    const line = (await lines()).find((one) => one.chronicle_key === `guardian:${guardian.id}`);
    assert.equal(line.text, `Strażnik etapu 1 Wyprawy padł: ${content.monstersById[guardian.monster_id].name}. Ostatni cios: Magini.`);
    // A donation that raises a building of the Siedziba to its first level.
    const { cost } = content.guilds.seat;
    await run("UPDATE characters SET gold = ?, resources = json_object('wood', ?) WHERE name = 'Wojowniczka'", cost.gold.min * 2, cost.resource.min * 2);
    const donated = await as('wojowniczka', 'POST', '/api/guild/seat/donate', { buildingId: 'guild-banner', gold: cost.gold.min, resource: cost.resource.min });
    assert.equal(donated.status, 200, JSON.stringify(donated.data).slice(0, 300));
    const seat = (await lines()).filter((one) => one.chronicle_key === 'seat:guild-banner:1');
    assert.equal(seat.length, 1);
    assert.equal(seat[0].text, 'Siedziba: Sztandar wchodzi na 1. poziom.');
    // A donation that raises no level writes nothing.
    await as('wojowniczka', 'POST', '/api/guild/seat/donate', { buildingId: 'guild-banner', gold: 10, resource: 0 });
    assert.equal((await lines()).filter((one) => one.chronicle_key?.startsWith('seat:')).length, 1);
  });

  test('the Kronika: a threshold of the Próby, told once at the guild\'s dots', async () => {
    for (const login of ['wojowniczka', 'magini', 'trzecia']) await as(login, 'GET', '/api/guild/trials');
    const week = questPeriod('weekly', clock, content).key;
    // Every trial of the board done by all three members.
    await run("UPDATE guild_trials SET state = 'done', progress = count, done_at = ? WHERE week = ?", clock, week);
    const todo = await as('wojowniczka', 'GET', '/api/guild/todo');
    assert.equal(todo.status, 200);
    const trials = (await lines()).filter((one) => one.chronicle_key?.startsWith('trials:'));
    assert.equal(trials.length, 1, JSON.stringify(await lines()));
    assert.match(trials[0].text, /^Próby Gildii: próg \d+ z \d+ osiągnięty\.$/);
    await as('magini', 'GET', '/api/guild/todo');
    assert.equal((await lines()).filter((one) => one.chronicle_key?.startsWith('trials:')).length, 1);
  });
});

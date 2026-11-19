// The Znaki Gildii and the Kram Gildii through the API (src/server/
// guild-stall.js; 1202 A): a Znak for each point of Sława a member brings,
// counted live this week and credited once as the week's members' Sława is
// written, never twice; each good of the Kram for its Znaki, a member's
// only: a pack of cards, a Zwój ochronny, an item of the class for the slot
// chosen (with a place in the bag), the title "Strażnik Sztandaru" among the
// achievements' titles and the Ramka Sztandaru among the Sklep Systemu's
// frames; each refusal (no guild, an unknown good, too few Znaki, the
// week's limit, once owned, no slot, a full bag, the Znaki changed since
// the page showed them); a double tap buying once; the limits renewed on
// Monday; the Znaki kept after leaving the guild.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { questPeriod } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const DAY = 24 * 3600000;
const HOUR = 3600000;
const MADE = 1000;
const cap = content.guilds.trials.cap;
const perTrial = content.guilds.fame.trials.perTrial;
const price = Object.fromEntries(content.guilds.stall.goods.map((good) => [good.id, good.price]));

describe('the Znaki Gildii and the Kram Gildii through the API', () => {
  const { call, db, signUp } = useServer({ TEST_CLOCK: 'on' });
  const week = questPeriod('weekly', Date.now() + 7 * DAY, content);
  const next = questPeriod('weekly', week.endsAt, content);
  let clock = week.startsAt + HOUR;
  const cookies = {};
  const ids = {};
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body, now: clock });
  const run = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).run();
  const first = async (sql, ...binds) => (await db()).prepare(sql).bind(...binds).first();
  const stall = async (login) => (await as(login, 'GET', '/api/guild/stall')).data.stall;
  const buy = (login, good, more = {}) => as(login, 'POST', '/api/guild/stall/buy', { good, ...more });
  const goodOf = (view, id) => view.goods.find((good) => good.id === id);
  const row = (login) => first('SELECT card_packs, scrolls, achievements, feats, cosmetics FROM characters WHERE id = ?', ids[login]);

  async function player(login, name) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await run('UPDATE characters SET level = 30, class_level = 30, gold = 5000, created_at = ? WHERE name = ?', MADE, name);
    ids[login] = (await first('SELECT id FROM characters WHERE name = ?', name)).id;
  }

  async function guild(leader, name, tag, members = []) {
    assert.equal((await as(leader, 'POST', '/api/guild/found', { name, tag })).status, 200);
    const guildId = (await as(leader, 'GET', '/api/guild')).data.guild.id;
    for (const login of members) {
      await as(leader, 'POST', '/api/guild/invite', { name: login[0].toUpperCase() + login.slice(1) });
      assert.equal((await as(login, 'POST', '/api/guild/accept', { guildId })).status, 200);
    }
    return guildId;
  }

  // Próby done this week: perTrial Sława each, up to the cap.
  async function trials(guildId, login, count) {
    for (let index = 0; index < count; index += 1) {
      await run(
        "INSERT INTO guild_trials (guild_id, week, character_id, trial, kind, count, progress, state, taken_at, done_at) VALUES (?, ?, ?, ?, 'explore', 1, 1, 'done', ?, ?)",
        guildId,
        week.key,
        ids[login],
        index,
        clock,
        clock,
      );
    }
  }
  // Znaki of weeks gone, credited as the freeze credits them.
  const credit = (login, earned) =>
    run('INSERT INTO guild_marks (character_id, earned, version) VALUES (?, ?, 1) ON CONFLICT (character_id) DO UPDATE SET earned = earned + excluded.earned, version = version + 1', ids[login], earned);

  beforeEach(async () => {
    clock = week.startsAt + HOUR;
    await player('ala', 'Ala');
    await player('ola', 'Ola');
    await player('ewa', 'Ewa');
  });

  test('the Znaki live from the Sława of the week, a pack and a scroll for them within the limits, a double tap buying once', async () => {
    const forest = await guild('ala', 'Leśni Bracia', 'LB', ['ola']);
    await trials(forest, 'ala', cap);
    let view = await stall('ala');
    assert.equal(view.member, true);
    assert.deepEqual(view.marks, { left: cap * perTrial, earned: 0, live: cap * perTrial, spent: 0, version: 0 });
    assert.deepEqual(
      view.goods.map((good) => [good.id, good.price, good.weekly, good.bought, good.owned, good.block]),
      [
        ['pack', 50, 2, 0, false, null],
        ['ward-scroll', 40, 2, 0, false, null],
        ['item', 200, 1, 0, false, 'too_few_marks'],
        ['title', 500, null, 0, false, 'too_few_marks'],
        ['frame', 1000, null, 0, false, 'too_few_marks'],
      ],
    );
    assert.equal(goodOf(view, 'title').name, 'Tytuł „Strażniczka Sztandaru”');
    assert.equal(goodOf(view, 'item').missing, price.item - cap * perTrial);
    assert.equal(view.slots.length, 9);
    // Another member has none of it.
    assert.equal((await stall('ola')).marks.left, 0);

    const before = await row('ala');
    const bought = await buy('ala', 'pack', { seen: 0 });
    assert.equal(bought.status, 200, JSON.stringify(bought.data));
    assert.equal(bought.data.bought.text, 'Pakiet kart czeka w Salonie Gier, w zakładce Karty.');
    assert.equal((await row('ala')).card_packs, before.card_packs + 1);
    view = bought.data.stall;
    assert.deepEqual([view.marks.left, view.marks.spent, view.marks.version, goodOf(view, 'pack').bought], [cap * perTrial - price.pack, price.pack, 1, 1]);
    // The same tap again, from the page as it was: the Znaki changed.
    const again = await buy('ala', 'pack', { seen: 0 });
    assert.equal(again.status, 409);
    assert.equal(again.data.error.code, 'character_changed');
    assert.equal((await row('ala')).card_packs, before.card_packs + 1);
    // Two taps at once: one buys.
    const both = await Promise.all([buy('ala', 'pack', { seen: 1 }), buy('ala', 'pack', { seen: 1 })]);
    assert.deepEqual(both.map((answer) => answer.status).sort(), [200, 409]);
    assert.equal((await row('ala')).card_packs, before.card_packs + 2);
    // The week's limit of packs reached.
    const third = await buy('ala', 'pack');
    assert.equal(third.status, 409);
    assert.equal(third.data.error.code, 'limit');
    // A scroll for the Kowadło.
    assert.equal((await buy('ala', 'ward-scroll')).status, 200);
    assert.equal((await row('ala')).scrolls, before.scrolls + 1);
    // Too few left for another scroll: 140 − 100 − 40 = 0.
    const poor = await buy('ala', 'ward-scroll');
    assert.equal(poor.status, 409);
    assert.equal(poor.data.error.code, 'too_few_marks');
    assert.match(poor.data.error.message, /Masz za mało Znaków Gildii: 0 z 40/);
    // An unknown good.
    assert.equal((await buy('ala', 'crown')).data.error.code, 'unknown_good');
  });

  test('an item for the slot chosen into the bag, a full bag refused; the title among the achievements and the frame among the frames, each once', async () => {
    await guild('ala', 'Leśni Bracia', 'LB', ['ola']);
    await credit('ala', 5000);
    await credit('ola', 5000);
    // No slot, or the Rdzeń: refused.
    assert.equal((await buy('ala', 'item')).data.error.code, 'invalid_slot');
    assert.equal((await buy('ala', 'item', { slot: 'core' })).data.error.code, 'invalid_slot');
    const item = await buy('ala', 'item', { slot: 'ring' });
    assert.equal(item.status, 200, JSON.stringify(item.data));
    const found = await first('SELECT slot, data FROM items WHERE id = ?', item.data.bought.item.id);
    const data = JSON.parse(found.data);
    assert.equal(found.slot, null);
    assert.equal(data.slot, 'ring');
    assert.equal(data.level, 30);
    assert.match(item.data.bought.text, /trafia do plecaka\.$/);
    assert.equal((await buy('ala', 'item', { slot: 'head' })).data.error.code, 'limit');
    // A full bag: Ola's bag filled to its capacity.
    const capacity = content.balance.items.bagSlots;
    for (let index = 0; index < capacity; index += 1) await run("INSERT INTO items (character_id, slot, data, created_at) VALUES (?, NULL, ?, 0)", ids.ola, found.data);
    const full = await buy('ola', 'item', { slot: 'feet' });
    assert.equal(full.status, 409);
    assert.equal(full.data.error.code, 'bag_full');
    assert.equal(goodOf(await stall('ola'), 'item').block, 'bag_full');

    // The title: its achievement given at once, worn at a tap.
    const title = await buy('ala', 'title');
    assert.equal(title.status, 200);
    assert.equal(title.data.bought.text, 'Tytuł „Strażniczka Sztandaru” jest Twój. Założysz go w Osiągnięciach, w zakładce Postać.');
    const titled = await row('ala');
    assert.ok(JSON.parse(titled.achievements)['banner-warden']);
    assert.equal(JSON.parse(titled.feats).bannerWarden, 1);
    const window = (await as('ala', 'GET', '/api/achievements')).data.achievements;
    const warden = window.groups.find((group) => group.id === 'guild').list.find((one) => one.id === 'banner-warden');
    assert.deepEqual([warden.done, warden.title], [true, 'Strażniczka Sztandaru']);
    assert.equal((await as('ala', 'POST', '/api/achievements/title', { id: 'banner-warden' })).status, 200);
    assert.equal((await as('ola', 'GET', '/api/profile/Ala')).data.profile.title, 'Strażniczka Sztandaru');
    assert.equal((await buy('ala', 'title')).data.error.code, 'owned');
    // The Kronika told the guild (1195 A), once.
    const told = await (await db()).prepare("SELECT text FROM chat_messages WHERE chronicle_key LIKE 'warden:%'").all();
    assert.deepEqual(
      told.results.map((line) => line.text),
      ['Ala zostaje Strażniczką Sztandaru.'],
    );
    assert.equal(goodOf(await stall('ala'), 'title').owned, true);

    // The frame: among the cosmetics owned, worn in the Sklep Systemu.
    assert.equal((await buy('ala', 'frame')).status, 200);
    assert.ok(JSON.parse((await row('ala')).cosmetics).owned.includes('frame-guild-banner'));
    assert.equal((await as('ala', 'POST', '/api/cosmetics/wear', { kind: 'frame', id: 'frame-guild-banner' })).status, 200);
    assert.equal((await as('ola', 'GET', '/api/profile/Ala')).data.profile.frame, 'frame-guild-banner');
    assert.equal((await buy('ala', 'frame')).data.error.code, 'owned');
    // Not sold in the Sklep Systemu.
    assert.equal((await as('ola', 'POST', '/api/cosmetics/buy', { id: 'frame-guild-banner' })).data.error.code, 'event_only');
    const spent = await first('SELECT spent FROM guild_marks WHERE character_id = ?', ids.ala);
    assert.equal(spent.spent, price.item + price.title + price.frame);
  });

  test("on Monday the week's Znaki credited once, never twice, and the week's limits renewed", async () => {
    const forest = await guild('ala', 'Leśni Bracia', 'LB', ['ola']);
    await trials(forest, 'ala', 6);
    assert.equal((await buy('ala', 'pack')).status, 200);
    assert.equal((await stall('ala')).marks.left, 6 * perTrial - price.pack);
    clock = next.startsAt + 60000;
    await as('ola', 'GET', '/api/character');
    await as('ala', 'GET', '/api/character');
    const marks = await first('SELECT earned, spent FROM guild_marks WHERE character_id = ?', ids.ala);
    assert.deepEqual(marks, { earned: 6 * perTrial, spent: price.pack });
    const view = await stall('ala');
    assert.deepEqual([view.marks.left, view.marks.live, view.marks.earned], [6 * perTrial - price.pack, 0, 6 * perTrial]);
    assert.equal(goodOf(view, 'pack').bought, 0);
  });

  test('outside a guild: the Znaki shown, nothing for sale; after leaving the Znaki stay', async () => {
    await guild('ala', 'Leśni Bracia', 'LB', ['ola']);
    await credit('ola', 120);
    const outside = await stall('ewa');
    assert.equal(outside.member, false);
    assert.ok(outside.goods.every((good) => good.block === 'no_guild'));
    const refused = await buy('ewa', 'pack');
    assert.equal(refused.status, 409);
    assert.equal(refused.data.error.code, 'no_guild');
    assert.equal((await as('ola', 'POST', '/api/guild/leave')).status, 200);
    const left = await stall('ola');
    assert.deepEqual([left.member, left.marks.left], [false, 120]);
    assert.equal((await buy('ola', 'pack')).data.error.code, 'no_guild');
  });
});

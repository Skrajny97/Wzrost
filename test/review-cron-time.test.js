// The code review of 12.11.2026: the cron jobs (src/server/index.js,
// scheduled) and "Przewiń" with Punkty Czasu (src/server/time.js). Each test
// fails on the code as it was reviewed.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { questPeriod } from '../src/engine/index.js';
import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const famePoints = (id) => content.fame.sources.find((source) => source.id === id).points;

// Punkty Sławy go to the week of the action's clock (fame.js: famePoints),
// and the first look of a new week closes the week before for good
// (fameNotice → closeWeek): its rewards are counted then, once. Points that
// come for a week after it closed count in no reward and in no open week:
// they are gone. The Arena had the same hole and was mended (0.2.69, point
// 1: "Walka tuż przed północą z niedzieli na poniedziałek"); the Punkty
// Sławy were not.
describe('review: Punkty Sławy that come for a week already closed', () => {
  const { server, call, db, signUp } = useServer({ SETTLEMENT: 'on' });
  const cookies = {};

  async function player(name) {
    const { cookie } = await signUp(name.toLowerCase());
    await call('POST', '/api/character', { cookie, body: { name, classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = 30, class_level = 30, gold = 100000 WHERE name = ?').bind(name).run();
    cookies[name] = cookie;
  }
  const row = async (name) => (await db()).prepare('SELECT * FROM characters WHERE name = ?').bind(name).first();
  const act = (name, path, body) => call('POST', `/api/market/${path}`, { cookie: cookies[name], body });
  const cron = (at) => server.getWorker().scheduled({ cron: '* * * * *', scheduledTime: new Date(at) });
  // The character's Punkty Sławy by week, each week marked closed or open.
  const fameRows = async (id) =>
    (
      await (await db())
        .prepare('SELECT f.week, f.points, EXISTS (SELECT 1 FROM fame_weeks w WHERE w.week = f.week) AS closed FROM fame_points f WHERE f.character_id = ? ORDER BY f.week')
        .bind(id)
        .all()
    ).results;
  const openPoints = (rows) => rows.filter((one) => !one.closed).reduce((sum, one) => sum + one.points, 0);

  // An herb of Kramarka's on the Targowisko, with Kupiec's bid on it.
  async function auction() {
    await player('Kramarka');
    await player('Kupiec');
    const herb = content.herbs[0].id;
    await (await db()).prepare('UPDATE characters SET herbs = ? WHERE name = ?').bind(JSON.stringify({ [herb]: 5 }), 'Kramarka').run();
    const listed = await act('Kramarka', 'list', { kind: 'herb', key: herb, count: 1, startPrice: 20 });
    assert.equal(listed.status, 200, JSON.stringify(listed.data).slice(0, 300));
    const offer = await (await db()).prepare('SELECT id FROM market_offers').first();
    const bid = await act('Kupiec', 'bid', { offerId: offer.id, amount: 20 });
    assert.equal(bid.status, 200, JSON.stringify(bid.data).slice(0, 300));
    return offer.id;
  }

  // index.js scheduled → market.js settleMarket(db, scheduledTime): the sale's
  // Punkty Sławy go to the week of the run's scheduled minute. The run of
  // Sunday 23:59 that starts after midnight (a late cron trigger), after the
  // first look of Monday closed the week, writes them into the closed week.
  test("a sale settled by the cron run of Sunday 23:59, started after Monday's first look, keeps its Punkty Sławy", async () => {
    const offerId = await auction();
    const week = questPeriod('weekly', Date.now(), content);
    const previous = questPeriod('weekly', week.startsAt - 1, content);
    // Monday's first look closes the week before (fame.js: fameNotice).
    assert.equal((await call('GET', '/api/character', { cookie: cookies.Kupiec })).status, 200);
    assert.ok(await (await db()).prepare('SELECT 1 FROM fame_weeks WHERE week = ?').bind(previous.key).first(), 'the week before is closed');
    // The auction ended at Sunday 23:58:30, and the cron's run of the minute
    // 23:59 comes now.
    await (await db()).prepare('UPDATE market_offers SET ends_at = ? WHERE id = ?').bind(week.startsAt - 90000, offerId).run();
    await cron(week.startsAt - 60000);
    const settled = await (await db()).prepare('SELECT state FROM market_offers WHERE id = ?').bind(offerId).first();
    assert.equal(settled.state, 'sold');
    const rows = await fameRows((await row('Kramarka')).id);
    assert.equal(
      openPoints(rows),
      famePoints('sale'),
      `the sale's ${famePoints('sale')} Punkty Sławy count in no open week: they went to a week closed before they came, which no reward counts (${JSON.stringify(rows)})`,
    );
  });

  // The same on a player's own request (here the Targowisko's look, which
  // settles the ended offers with its own clock, market.js requireMarket): a
  // request begun before Monday's midnight and saved after another request
  // of Monday closed the week. As in test/review-days.test.js, the record of
  // the later moment (the week closed) is put in between the request's read
  // and its write, by a trigger on its own settling of Punkty Czasu
  // (characters.js: settleTimePoints).
  test("a request of Sunday's last moment, saved after Monday's first look closed the week, keeps its Punkty Sławy", async () => {
    const offerId = await auction();
    const database = await db();
    await database.prepare('UPDATE market_offers SET ends_at = ? WHERE id = ?').bind(Date.now() - 1000, offerId).run();
    const week = questPeriod('weekly', Date.now(), content);
    const seller = await row('Kramarka');
    await database.prepare('UPDATE characters SET time_points_at = 0 WHERE id = ?').bind(seller.id).run();
    await database
      .prepare(`CREATE TRIGGER week_closed AFTER UPDATE OF time_points_at ON characters WHEN NEW.id = ${seller.id} BEGIN INSERT OR IGNORE INTO fame_weeks (week, closed_at) VALUES ('${week.key}', 0); END`)
      .run();
    let looked;
    try {
      looked = await call('GET', '/api/market', { cookie: cookies.Kramarka });
    } finally {
      await database.prepare('DROP TRIGGER IF EXISTS week_closed').run();
    }
    assert.equal(looked.status, 200, JSON.stringify(looked.data).slice(0, 300));
    assert.equal((await database.prepare('SELECT state FROM market_offers WHERE id = ?').bind(offerId).first()).state, 'sold');
    const rows = await fameRows(seller.id);
    assert.equal(
      openPoints(rows),
      famePoints('sale'),
      `the sale's ${famePoints('sale')} Punkty Sławy count in no open week: they went to the week ${week.key}, closed before they came (${JSON.stringify(rows)})`,
    );
  });

  // The most common source the same way: an exploration's report claimed
  // (hunts.js finishHunt → huntFamePoints) in Sunday's last moment, its
  // batch saved after Monday's first look closed the week.
  test("an exploration claimed in Sunday's last moment, saved after Monday's first look closed the week, keeps its Punkty Sławy", async () => {
    await player('Wedrowiec');
    const cookie = cookies.Wedrowiec;
    const started = await call('POST', '/api/hunts', { cookie, body: { areaId: 'windfalls-edge', minutes: 30 } });
    assert.equal(started.status, 201, JSON.stringify(started.data).slice(0, 300));
    const database = await db();
    const { id } = await row('Wedrowiec');
    await database.prepare('UPDATE activities SET started_at = started_at - 1805000, ends_at = ends_at - 1805000 WHERE character_id = ?').bind(id).run();
    const week = questPeriod('weekly', Date.now(), content);
    await database.prepare('UPDATE characters SET time_points_at = 0 WHERE id = ?').bind(id).run();
    await database
      .prepare(`CREATE TRIGGER week_closed AFTER UPDATE OF time_points_at ON characters WHEN NEW.id = ${id} BEGIN INSERT OR IGNORE INTO fame_weeks (week, closed_at) VALUES ('${week.key}', 0); END`)
      .run();
    let claimed;
    try {
      claimed = await call('POST', '/api/hunts/claim', { cookie });
    } finally {
      await database.prepare('DROP TRIGGER IF EXISTS week_closed').run();
    }
    assert.equal(claimed.status, 200, JSON.stringify(claimed.data).slice(0, 300));
    const rows = await fameRows(id);
    const earned = rows.reduce((sum, one) => sum + one.points, 0);
    assert.ok(earned >= 3, `the 30 minutes' exploration brought its Punkty Sławy (${JSON.stringify(rows)})`);
    assert.equal(openPoints(rows), earned, `the exploration's ${earned} Punkty Sławy count in no open week: they went to the week ${week.key}, closed before they came (${JSON.stringify(rows)})`);
  });
});

// characters.js renameBlockedNames (the cron, at the top of every hour):
// it reads every character's name, then gives each blocked one a new name
// with an UPDATE that does not ask whether the name is still the one read.
// A player who meanwhile chose a name in the rename window (POST
// /api/character/name, free for a blocked name) has it overwritten by a
// generated one and is told that the System named the character. Here the
// second player's choice lands while the run renames the first character
// (a trigger on that write), as when the run goes through many names.
describe('review: the hourly rename of blocked names', () => {
  const { server, call, db, signUp } = useServer({ SETTLEMENT: 'on' });
  const at = Date.parse(content.chat.names.renameAt);
  const run = (when) => server.getWorker().scheduled({ cron: '* * * * *', scheduledTime: new Date(when) });

  test('a name its player chose while the hourly rename runs stays the chosen one', async () => {
    const ids = [];
    for (const [login, name] of [
      ['pierwsza', 'Kurwa Testowa'],
      ['druga', 'Chujowka'],
    ]) {
      const { cookie } = await signUp(login);
      assert.equal((await call('POST', '/api/character', { cookie, body: { name: `Gracz ${login}`, classId: 'archer', appearance: 'female' } })).status, 201);
      const database = await db();
      await database.prepare('UPDATE characters SET name = ?, name_key = ? WHERE name = ?').bind(name, name.toLowerCase(), `Gracz ${login}`).run();
      ids.push((await database.prepare('SELECT id FROM characters WHERE name = ?').bind(name).first()).id);
    }
    const [first, second] = ids;
    const database = await db();
    // The second player's own rename (characters.js renameCharacter), saved
    // while the run writes the first character's new name.
    await database
      .prepare(
        `CREATE TRIGGER chosen_meanwhile AFTER UPDATE OF name ON characters WHEN NEW.id = ${first}
         BEGIN UPDATE characters SET name = 'Wybrana', name_key = 'wybrana', name_notice = NULL, version = version + 1 WHERE id = ${second}; END`,
      )
      .run();
    try {
      await run(at);
    } finally {
      await database.prepare('DROP TRIGGER IF EXISTS chosen_meanwhile').run();
    }
    const firstRow = await database.prepare('SELECT name FROM characters WHERE id = ?').bind(first).first();
    assert.ok(content.chat.names.generated.female.includes(firstRow.name), `the first blocked name is renamed (${firstRow.name})`);
    const secondRow = await database.prepare('SELECT name, name_notice FROM characters WHERE id = ?').bind(second).first();
    assert.equal(secondRow.name, 'Wybrana', `the name the player chose was overwritten by the System's "${secondRow.name}" (notice: ${secondRow.name_notice})`);
  });

  // The run renames the character and its chat messages only. An offer the
  // character put up on the Targowisko keeps its seller's name as it was
  // put up (market_offers.seller_name), and every player browsing the
  // Targowisko still sees the blocked name there until the auction ends (up
  // to 24 hours and more).
  test('a blocked name the System renamed is not shown on the open offers of the Targowisko', async () => {
    const cookies = {};
    for (const login of ['handlarka', 'klientka']) {
      ({ cookie: cookies[login] } = await signUp(login));
      assert.equal((await call('POST', '/api/character', { cookie: cookies[login], body: { name: `Gracz ${login}`, classId: 'archer', appearance: 'female' } })).status, 201);
      await (await db()).prepare('UPDATE characters SET level = 30, class_level = 30, gold = 10000 WHERE name = ?').bind(`Gracz ${login}`).run();
    }
    const database = await db();
    const herb = content.herbs[0].id;
    await database.prepare("UPDATE characters SET name = 'Kurwa Testowa', name_key = 'kurwa testowa', herbs = ? WHERE name = 'Gracz handlarka'").bind(JSON.stringify({ [herb]: 3 })).run();
    const listed = await call('POST', '/api/market/list', { cookie: cookies.handlarka, body: { kind: 'herb', key: herb, count: 1, startPrice: 20 } });
    assert.equal(listed.status, 200, JSON.stringify(listed.data).slice(0, 300));
    await run(at);
    const renamed = (await database.prepare("SELECT name FROM characters WHERE name_key != 'kurwa testowa' AND user_id = (SELECT id FROM users WHERE login = 'handlarka')").first()).name;
    assert.ok(content.chat.names.generated.female.includes(renamed), `the System renamed the seller (${renamed})`);
    const seen = (await call('GET', '/api/market', { cookie: cookies.klientka })).data.market.offers.map((offer) => offer.seller);
    assert.deepEqual(seen, [renamed], `the Targowisko still shows the blocked name to everyone: ${JSON.stringify(seen)}`);
  });
});

// Poleć grę through the API (src/server/referrals.js; DECISIONS.md,
// "Polecenie gry z linku"; 982 A with the author's note, 15.11.2026: an
// account's own link, an account made from it tied to the account that
// brought it with the start Punkty Systemu for its first character, the
// referrer's rewards at the milestones once the e-mail is confirmed, the
// newcomer's own, each taken once with "Odbierz", the limit a month, a code
// of nobody or of the account itself giving nothing, and the ties gone
// with an account.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { content } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const rules = content.community.referral;
const community = content.unlocksById.community.level;

describe('Poleć grę', () => {
  const { call, db } = useServer({});
  const database = async () => db();
  // An account with a character at `level` (the Społeczność open).
  async function player(login, { level = community, ref = undefined, confirmed = true } = {}) {
    const made = await call('POST', '/api/auth/register', { body: { login, email: `${login}@example.com`, password: 'tajnehaslo1', adult: true, ...(ref !== undefined && { ref }) } });
    assert.equal(made.status, 201, JSON.stringify(made.data));
    if (confirmed) await (await database()).prepare('UPDATE users SET email_confirmed_at = created_at WHERE login = ?').bind(login).run();
    const cookie = made.cookie;
    const character = await call('POST', '/api/character', { cookie, body: { name: login[0].toUpperCase() + login.slice(1), classId: 'mage', appearance: 'female' } });
    assert.equal(character.status, 201, JSON.stringify(character.data));
    await setLevel(login, level);
    return cookie;
  }
  const setLevel = async (login, level) =>
    (await database()).prepare('UPDATE characters SET level = ?, class_level = ? WHERE user_id = (SELECT id FROM users WHERE login = ?)').bind(level, level, login).run();
  const card = async (cookie) => (await call('GET', '/api/referrals', { cookie })).data.referral;
  const points = async (login) => (await (await database()).prepare("SELECT system_points FROM characters WHERE role = 'player' AND user_id = (SELECT id FROM users WHERE login = ?)").bind(login).first()).system_points;
  const accountId = async (login) => (await (await database()).prepare('SELECT id FROM users WHERE login = ?').bind(login).first()).id;
  const claim = (cookie, body) => call('POST', '/api/referrals/claim', { cookie, body });
  const [ten, thirty] = rules.milestones;

  test('the link: a code of its own, kept, not the login, and who invites by it', async () => {
    const mira = await player('mira');
    const first = await card(mira);
    assert.match(first.link, /\/\?p=[A-Z2-9]+$/);
    const code = first.link.split('=').at(-1);
    assert.equal(code.length, rules.codeLength);
    assert.equal((await card(mira)).link, first.link);
    const inviter = await call('GET', `/api/referral?code=${code}`);
    assert.deepEqual([inviter.status, inviter.data.name, inviter.data.level], [200, 'Mira', community]);
    assert.equal((await call('GET', '/api/referral?code=ZZZZZZ')).status, 404);
    assert.equal((await call('GET', '/api/referral?code=mira')).status, 404);
    assert.deepEqual([first.players, first.invitedBy, first.month], [[], null, { given: 0, limit: rules.perMonth }]);
  });

  test('an account from the link: tied to the referrer, with the start points for its first character', async () => {
    const mira = await player('mira');
    const code = (await card(mira)).link.split('=').at(-1);
    await player('dobra', { ref: code, level: 3 });
    const tied = await (await database()).prepare('SELECT referred_by, system_points_waiting FROM users WHERE login = ?').bind('dobra').first();
    assert.deepEqual([tied.referred_by, tied.system_points_waiting], [await accountId('mira'), 0]);
    // The start points went to its first character, on top of what every
    // new account has.
    await player('ewa');
    assert.equal((await points('dobra')) - (await points('ewa')), rules.start);
    // A code of nobody: nothing.
    await player('iza', { ref: 'ZZZZZZ' });
    assert.equal((await (await database()).prepare("SELECT referred_by FROM users WHERE login = 'iza'").first()).referred_by, null);
    assert.equal(await points('iza'), await points('ewa'));
  });

  test('the referrer\'s rewards: ready at each milestone with the e-mail confirmed, taken once, to its character', async () => {
    const mira = await player('mira');
    const code = (await card(mira)).link.split('=').at(-1);
    const dobra = await player('dobra', { ref: code, level: 3 });
    // Its e-mail not confirmed (as before the link from the mail).
    await (await database()).prepare("UPDATE users SET email_confirmed_at = NULL WHERE login = 'dobra'").run();
    const states = async () => (await card(mira)).players[0].rewards.map((one) => one.state);
    assert.deepEqual(await states(), ['waiting', 'waiting']);
    // The level without the e-mail confirmed: still waiting.
    await setLevel('dobra', ten.level);
    assert.deepEqual(await states(), ['waiting', 'waiting']);
    assert.equal((await claim(mira, { account: await accountId('dobra'), level: ten.level })).data.error.code, 'not_ready');
    await (await database()).prepare("UPDATE users SET email_confirmed_at = created_at WHERE login = 'dobra'").run();
    assert.deepEqual(await states(), ['ready', 'waiting']);
    const before = await points('mira');
    const taken = await claim(mira, { account: await accountId('dobra'), level: ten.level });
    assert.equal(taken.status, 200, JSON.stringify(taken.data));
    assert.equal(await points('mira'), before + ten.referrer);
    assert.deepEqual(taken.data.referral.players[0].rewards.map((one) => one.state), ['given', 'waiting']);
    assert.equal(taken.data.referral.month.given, 1);
    // Once.
    assert.equal((await claim(mira, { account: await accountId('dobra'), level: ten.level })).data.error.code, 'claimed');
    // The second milestone; another account cannot take it.
    await setLevel('dobra', thirty.level);
    const ewa = await player('ewa');
    assert.equal((await claim(ewa, { account: await accountId('dobra'), level: thirty.level })).data.error.code, 'not_ready');
    assert.equal((await claim(mira, { account: await accountId('dobra'), level: thirty.level })).status, 200);
    assert.equal(await points('mira'), before + ten.referrer + thirty.referrer);
    // The newcomer's own reward at its milestone, once.
    const own = await card(dobra);
    assert.deepEqual([own.invitedBy.name, own.invitedBy.state, own.invitedBy.points], ['Mira', 'ready', thirty.newcomer]);
    const mine = await points('dobra');
    assert.equal((await claim(dobra, { level: thirty.level })).status, 200);
    assert.equal(await points('dobra'), mine + thirty.newcomer);
    assert.equal((await claim(dobra, { level: thirty.level })).data.error.code, 'claimed');
    assert.equal((await card(dobra)).invitedBy.state, 'given');
    // An account that came by no link has no reward of its own.
    assert.equal((await claim(ewa, { level: thirty.level })).data.error.code, 'not_ready');
    assert.equal((await claim(mira, { level: 999 })).data.error.code, 'bad_request');
  });

  test('at most perMonth rewards a month; the rest wait', async () => {
    const mira = await player('mira');
    const code = (await card(mira)).link.split('=').at(-1);
    const month = (await (await database()).prepare("SELECT strftime('%Y-%m-01', 'now') AS key").first()).key;
    // The month's rewards as if taken already.
    const id = await accountId('mira');
    for (let index = 0; index < rules.perMonth; index += 1) {
      await (await database())
        .prepare("INSERT INTO referral_rewards (referred_id, level, side, user_id, points, month, created_at) VALUES (?, ?, 'referrer', ?, 1, ?, 1)")
        .bind(100000 + index, ten.level, id, month)
        .run();
    }
    await player('dobra', { ref: code, level: ten.level });
    assert.equal((await card(mira)).month.given, rules.perMonth);
    const refused = await claim(mira, { account: await accountId('dobra'), level: ten.level });
    assert.equal(refused.data.error.code, 'limit');
    assert.equal((await card(mira)).players[0].rewards[0].state, 'ready');
    // A new month.
    await (await database()).prepare("UPDATE referral_rewards SET month = '2020-01-01'").run();
    assert.equal((await claim(mira, { account: await accountId('dobra'), level: ten.level })).status, 200);
  });

  test('an account deleted takes its referrals away', async () => {
    const mira = await player('mira');
    const code = (await card(mira)).link.split('=').at(-1);
    await player('dobra', { ref: code, level: ten.level });
    assert.equal((await claim(mira, { account: await accountId('dobra'), level: ten.level })).status, 200);
    const gone = await call('DELETE', '/api/me', { cookie: mira, body: { login: 'mira' } });
    assert.equal(gone.status, 200, JSON.stringify(gone.data));
    const left = await (await database()).prepare('SELECT COUNT(*) AS count FROM referral_rewards').first();
    const tie = await (await database()).prepare("SELECT referred_by FROM users WHERE login = 'dobra'").first();
    assert.deepEqual([left.count, tie.referred_by], [0, null]);
  });
});

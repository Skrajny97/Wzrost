// The English beta, stage 3 (levels 5–15): the Społeczność, the Drużyna,
// the Umiejętności, the professions, the Encyklopedia and the Sklep Systemu
// in the language of each request, and the English chat channel. The
// server's own texts come in the page's language (errors by their text or
// their shape, i18n.js; the rest through t()), the engine's own in the
// language of the content it is given (word(), decimalText, nameInText),
// and the Polish as it was.
//
// The English channel (`english` in data/chat.json) is there only where
// ENGLISH is on, so the live game keeps its two: a page in English has it
// first and opens the chat on it, a Polish page has it third, and everyone
// may read and write in it. The chat masks the words of both lists, the
// Polish (`words`) and the English (`wordsEn`), in every channel and
// wherever English is on or off; the filter of the characters' names keeps
// to the Polish list.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { blockedName, giftRewardsText, skillText } from '../src/engine/index.js';
import { OVERLAYS, contentIn } from '../src/server/content.js';
import { readFeatures } from '../src/server/features.js';
import { mentionNotices } from '../src/server/mentions.js';
import { useServer } from './helpers/server.js';

// The test overlay of the tags' notifications, laid before this process
// builds its English content (as in i18n-stage2.test.js).
OVERLAYS.en = {
  ...OVERLAYS.en,
  chat: { ...OVERLAYS.en.chat, mentions: { texts: { pushTitle: 'Chat: {channel}', pushBody: '{name} tagged you in the chat: {text}' } } },
};

// A request in a language, the page's own (X-Lang).
function caller(server) {
  return async (method, path, { body, cookie, lang } = {}) => {
    const headers = { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(cookie && { Cookie: cookie }), ...(lang && { 'X-Lang': lang }) };
    const response = await server.fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('Set-Cookie')?.split(';')[0] ?? null };
  };
}

// The players of a describe: an account with its e-mail confirmed and a
// warrior of `login`'s name at the levels given, the chat's rules accepted;
// its cookie.
function players(server, db) {
  const ask = caller(server);
  return async (login, { level = 30, classLevel = 30 } = {}) => {
    const { cookie } = await ask('POST', '/api/auth/register', { body: { login, email: `${login.toLowerCase()}@example.com`, password: 'tajnehaslo1' } });
    const database = await db();
    await database.prepare('UPDATE users SET email_confirmed_at = created_at WHERE login = ?').bind(login).run();
    assert.equal((await ask('POST', '/api/character', { body: { name: login, classId: 'warrior', appearance: 'female' }, cookie })).status, 201);
    await database.prepare('UPDATE characters SET level = ?, class_level = ? WHERE name = ?').bind(level, classLevel, login).run();
    assert.equal((await ask('POST', '/api/chat/rules', { cookie })).status, 200);
    return cookie;
  };
}

describe("the engine's own texts", () => {
  const pl = contentIn('pl');
  const en = contentIn('en');

  test("a skill's numbers: decimals and percentage points as each language writes them", () => {
    const skill = { cooldown: 2 };
    const params = { dodge: 0.15, chance: 0.025, power: 1.25 };
    const template = '+{dodge pp}. {chance%.1} {power.1} {power%}';
    assert.equal(skillText(template, skill, params, pl), '+15 pkt proc. 2,5% 1,3 125%');
    assert.equal(skillText(template, skill, params, en), '+15 percentage points. 2.5% 1.3 125%');
  });

  test("a gift code's rewards keep the resources' capitals in English", () => {
    const rewards = { systemPoints: 100, gold: 1000, resources: { wood: 100, 'iron-ore': 5 } };
    assert.equal(giftRewardsText(rewards, pl), `${pl.giftTexts.systemPoints} +100, ${pl.giftTexts.gold} +1000, drewno +100, ruda żelaza +5`);
    assert.equal(giftRewardsText(rewards, en), `${en.giftTexts.systemPoints} +100, ${en.giftTexts.gold} +1000, Wood +100, Iron Ore +5`);
  });

  test("the names' filter keeps to the Polish list; the English one is the chat's", () => {
    assert.ok(en.chat.wordsEn.includes('twat') && !pl.chat.words.includes('twat'));
    assert.equal(blockedName('Twatson', pl), false);
    assert.equal(blockedName('Fuckface', pl), true);
  });

  test('a tag in the English channel names it "English" on the phone, in either language', async () => {
    readFeatures({ ENGLISH: 'on' });
    const row = (userId, language) => ({ message_id: userId, created_at: 1, user_id: userId, channel: 'english', writer_id: 9, text: 'Hi', name: 'Ala', appearance: 'female', language, seen: null });
    const database = { prepare: () => ({ bind: () => ({ all: async () => ({ results: [row(1, 'en'), row(2, 'pl')] }) }) }) };
    const notices = await mentionNotices(database, 0, 1);
    assert.deepEqual([notices.get(1)[0].title, notices.get(2)[0].title], ['Chat: English', 'Czat: English']);
    readFeatures({});
  });
});

describe('English where ENGLISH is on (the test version)', () => {
  const { server, db } = useServer({ ENGLISH: 'on' });
  const ask = caller(server);
  const player = players(server, db);
  // Moves every message past the wait between two messages of one player.
  const age = async () => (await db()).prepare('UPDATE chat_messages SET created_at = created_at - 10000').run();
  const say = (cookie, lang, channel, text) => ask('POST', '/api/chat', { cookie, lang, body: { channel, text } });

  test('the English channel: first on a page in English, third on a Polish one, and everyone writes and reads in it', async () => {
    const anna = await player('Anna');
    const basia = await player('Basia');
    const channels = async (lang) => (await ask('GET', '/api/content', { lang })).data.chat.channels;
    assert.deepEqual((await channels('en')).map((channel) => channel.id), ['english', 'global', 'trade']);
    assert.deepEqual((await channels('pl')).map((channel) => channel.id), ['global', 'trade', 'english']);
    assert.equal((await channels('pl')).find((channel) => channel.id === 'english').name, 'English');
    assert.equal((await say(anna, 'en', 'english', 'Hello everyone')).status, 201);
    assert.equal((await say(basia, 'pl', 'english', 'Cześć, Anna!')).status, 201);
    for (const [cookie, lang] of [
      [anna, 'en'],
      [basia, 'pl'],
    ]) {
      const read = await ask('GET', '/api/chat?channel=english', { cookie, lang });
      assert.deepEqual(read.data.messages.map(({ name, text }) => [name, text]), [
        ['Anna', 'Hello everyone'],
        ['Basia', 'Cześć, Anna!'],
      ]);
    }
    // The other channels keep their own messages.
    assert.deepEqual((await ask('GET', '/api/chat?channel=global', { cookie: anna, lang: 'en' })).data.messages, []);
  });

  test("the light of a page in English is the English channel's, which keeps its own read mark", async () => {
    const anna = await player('Anna');
    const basia = await player('Basia');
    const global = (await say(basia, 'pl', 'global', 'Po polsku')).data.message;
    await age();
    const english = (await say(basia, 'pl', 'english', 'In English')).data.message;
    const latest = async (lang) => (await ask('GET', '/api/chat/latest', { cookie: anna, lang })).data;
    assert.equal((await latest('en')).latest, english.id);
    assert.equal((await latest('pl')).latest, global.id);
    assert.deepEqual((await latest('en')).seen, { global: 0, trade: 0, english: 0, guild: 0, private: {} });
    assert.equal((await ask('POST', '/api/chat/seen', { cookie: anna, lang: 'en', body: { english: english.id } })).status, 200);
    const { seen } = await latest('en');
    assert.deepEqual([seen.english, seen.global], [english.id, 0]);
  });

  test('both lists of rude words are masked in every channel', async () => {
    const anna = await player('Anna');
    for (const channel of ['english', 'global', 'trade']) {
      await age();
      const sent = await say(anna, 'en', channel, 'You twat, ty kurwa, Scrapyard');
      assert.equal(sent.data.message.text, 'You ****, ty *****, Scrapyard', channel);
    }
  });

  test("the chat's own words come in the page's language, a silence's end written its way", async () => {
    const anna = await player('Anna');
    const basia = await player('Basia');
    const own = (await say(anna, 'en', 'english', 'Hello')).data.message;
    const other = (await say(basia, 'pl', 'english', 'Hej')).data.message;
    const reported = async (cookie, lang, messageId) => (await ask('POST', '/api/chat/report', { cookie, lang, body: { messageId } })).data;
    assert.equal((await reported(anna, 'en', other.id)).text, 'Reported. The moderators will check this message.');
    assert.equal((await reported(basia, 'pl', own.id)).text, 'Zgłoszono. Moderacja sprawdzi tę wiadomość.');
    assert.equal((await reported(anna, 'en', own.id)).error.message, 'You cannot report your own message.');
    // Silenced until 6 November 2030, 14:05 Polish time.
    const until = Date.UTC(2030, 10, 6, 13, 5);
    await (await db()).prepare("UPDATE users SET chat_muted_until = ? WHERE login = 'Anna'").bind(until).run();
    await age();
    assert.equal((await say(anna, 'en', 'english', 'Hello')).data.error.message, 'The chat is muted for you until 06/11, 14:05.');
    assert.equal((await say(anna, 'pl', 'english', 'Hello')).data.error.message, 'Czat jest dla Ciebie wyciszony do 06.11, 14:05.');
    assert.equal((await ask('GET', '/api/chat?channel=nowhere', { cookie: anna, lang: 'en' })).data.error.message, 'There is no such channel.');
  });

  test("the Znajomi's and the Drużyna's words, and their errors with names and numbers", async () => {
    const anna = await player('Anna');
    const basia = await player('Basia', { classLevel: 40 });
    const invited = await ask('POST', '/api/friends/invite', { cookie: anna, lang: 'en', body: { name: 'Basia' } });
    assert.equal(invited.data.text, 'Invitation sent. Basia will accept it in Friends.');
    const { incoming } = (await ask('GET', '/api/friends', { cookie: basia, lang: 'pl' })).data;
    const accepted = await ask('POST', '/api/friends/accept', { cookie: basia, lang: 'pl', body: { id: incoming[0].id } });
    assert.equal(accepted.data.text, 'Anna jest teraz wśród Twoich znajomych.');
    const again = await ask('POST', '/api/friends/invite', { cookie: anna, lang: 'en', body: { name: 'Basia' } });
    assert.equal(again.data.error.message, 'Basia is already among your friends.');
    // A class level too far from the party's, the other's and one's own.
    const far = await ask('POST', '/api/party/invite', { cookie: anna, lang: 'en', body: { name: 'Basia' } });
    assert.equal(far.data.error.message, 'Basia has class level 40. Class levels in a party can differ by at most 5, so a character of class level 25 to 35 can join now.');
    await (await db()).prepare("UPDATE characters SET class_level = 30 WHERE name = 'Basia'").run();
    const party = await ask('POST', '/api/party/invite', { cookie: anna, lang: 'en', body: { name: 'Basia' } });
    assert.equal(party.data.text, 'Invitation sent. Basia will accept it in the Community, on the Party tab.');
    await (await db()).prepare("UPDATE characters SET class_level = 24 WHERE name = 'Anna'").run();
    const joining = await ask('POST', '/api/party/accept', { cookie: basia, lang: 'en', body: { partyId: party.data.party.id } });
    assert.equal(joining.data.error.message, 'You have class level 30. Class levels in a party can differ by at most 5, so a character of class level 19 to 29 can join now.');
    const polish = await ask('POST', '/api/party/invite', { cookie: anna, lang: 'pl', body: { name: 'Anna' } });
    assert.equal(polish.data.error.message, 'Siebie nie zaprosisz.');
  });

  test("the Umiejętności', the Sklep Systemu's and the Encyklopedia's errors, the engine's among them", async () => {
    const anna = await player('Anna');
    const error = async (path, body, lang = 'en') => (await ask('POST', path, { cookie: anna, lang, body })).data.error.message;
    assert.equal(await error('/api/skills/learn', { skillId: 'nope' }), 'Your class has no such skill.');
    assert.equal(await error('/api/skills/learn', { skillId: 'nope' }, 'pl'), 'Twoja klasa nie ma takiej umiejętności.');
    assert.equal(await error('/api/skills/raise', { skillId: 'nope' }), 'You do not know this skill yet.');
    assert.equal(await error('/api/cosmetics/buy', { id: 'nope' }), 'There is no such item.');
    assert.equal(await error('/api/cosmetics/name-color', { on: 'yes' }), 'Choose: on or off.');
    assert.equal(await error('/api/encyclopedia/chest', { id: 'nope' }), 'There is no such chest.');
  });
});

describe('the live game, where ENGLISH is off', () => {
  const { server, db } = useServer();
  const ask = caller(server);
  const player = players(server, db);

  test('keeps its two channels, and masks the English rude words too', async () => {
    const anna = await player('Anna');
    const channels = (await ask('GET', '/api/content', { lang: 'en' })).data.chat.channels;
    assert.deepEqual(channels.map((channel) => channel.id), ['global', 'trade']);
    assert.equal((await ask('GET', '/api/chat?channel=english', { cookie: anna, lang: 'en' })).data.error.code, 'no_channel');
    const refused = await ask('POST', '/api/chat', { cookie: anna, lang: 'en', body: { channel: 'english', text: 'Hello' } });
    assert.deepEqual([refused.status, refused.data.error.message], [404, 'Nie ma takiego kanału.']);
    const sent = await ask('POST', '/api/chat', { cookie: anna, lang: 'en', body: { channel: 'global', text: 'What a twat' } });
    assert.equal(sent.data.message.text, 'What a ****');
    await ask('POST', '/api/chat/seen', { cookie: anna, body: { english: sent.data.message.id } });
    assert.deepEqual((await ask('GET', '/api/chat/latest', { cookie: anna })).data.seen, { global: 0, trade: 0, guild: 0, private: {} });
  });
});

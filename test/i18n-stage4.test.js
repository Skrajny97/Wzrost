// The English beta, stage 4 (everything left): the server and the engine of
// the Osada, the Targowisko, the Garbarnia, the Kuźnia, the Salon Gier, the
// Stajnia, the Sala prób, the Poszukiwani, Górnictwo and Jubilerstwo, the
// Gildia, the Wieże and the Warownia in the language of each request. The
// server's errors come in it by their text or their shape (i18n.js), its
// other words through t(), the engine's own sentences in the language of
// the content it is given (word(), decimalText), and the Polish as it was.
//
// The Osada's board keeps each order's sentence as it was drawn, in
// Polish, whatever the language of the look that settled it, and the page
// gets it in its own language, the one at the same place among the data's
// sentences (settlementBoard in characters.js, orderView in settlement.js).

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  autoDistribute,
  bidBlock,
  brotherhoodPerks,
  companionWearBlock,
  deliverBlock,
  generateItem,
  imbueBlock,
  listBlock,
  mountBlock,
  mountOf,
  orderStories,
  createRng,
  reforgeBlock,
  seatEffect,
  spinBlock,
  ticketBlock,
  towerFight,
  trialHallFights,
} from '../src/engine/index.js';
import { contentIn } from '../src/server/content.js';
import { numberText, runInLanguage, translateMessage } from '../src/server/i18n.js';
import { climbingGear } from './helpers/climb.js';
import { newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const pl = contentIn('pl');
const en = contentIn('en');
// An engine's message as the server answers it in English (errorResponse).
const english = (message) => runInLanguage('en', () => translateMessage(message));

describe("the engine's own sentences", () => {
  test("a Wieża's fight: the creatures' levels and its pay as each language writes them, the fight the same", () => {
    // Strong enough for floor 3, of level 52 (0.2.11), with the gear of
    // tests/helpers/climb.js.
    const character = { ...newCharacter('warrior', { level: 200, classLevel: 50 }) };
    character.points = autoDistribute(character, pl);
    const equipped = climbingGear();
    const polish = towerFight({ character, equipped, name: 'Wspinacz', floor: 3, seed: 'a' }, pl);
    const inEnglish = towerFight({ character, equipped, name: 'Wspinacz', floor: 3, seed: 'a' }, en);
    assert.equal(polish.tower.won, true);
    assert.deepEqual([inEnglish.xp, inEnglish.gold, inEnglish.tower.won], [polish.xp, polish.gold, polish.tower.won]);
    assert.match(polish.entries[0].text, / \(poz\. 52\)/);
    assert.ok(polish.entries[0].text.includes(`+${polish.xp} XP, +${polish.gold} złota.`), polish.entries[0].text);
    assert.match(inEnglish.entries[0].text, / \(lvl 52\)/);
    assert.ok(inEnglish.entries[0].text.includes(`+${polish.xp} XP, +${polish.gold} gold.`), inEnglish.entries[0].text);
  });

  test("the Sala prób's three fights: each one's pay in the content's language", () => {
    const strong = newCharacter('warrior', { level: 60, classLevel: 50 });
    strong.points = autoDistribute(strong, pl);
    const run = (content) => trialHallFights({ character: strong, equipped: [], name: 'Mocarz', area: content.areasById['raven-hollows'], seed: 'a' }, content);
    const polish = run(pl);
    const inEnglish = run(en);
    assert.equal(polish.hall.won, true);
    for (const fight of polish.fights) {
      assert.ok(polish.entries[0].text.includes(`+${fight.xp} XP, +${fight.gold} złota.`));
      assert.ok(inEnglish.entries[0].text.includes(`+${fight.xp} XP, +${fight.gold} gold.`));
    }
    assert.match(inEnglish.entries[0].text, / \(lvl \d+\)/);
    assert.ok(!inEnglish.entries[0].text.includes('(poz. '));
  });

  test("a brotherhood's perks: the Targowisko's fee with a decimal point, the fights and items counted in English", () => {
    const perks = (id, index, content) => brotherhoodPerks(content.settlement.brotherhoods.find((one) => one.id === id), index, content);
    assert.ok(perks('merchants', 1, pl).some((perk) => perk.includes('0,8%')), perks('merchants', 1, pl).join(' | '));
    assert.ok(perks('merchants', 1, en).some((perk) => perk.includes('0.8%')), perks('merchants', 1, en).join(' | '));
    assert.ok(perks('herbalists', 2, pl).some((perk) => /\b1 walkę(?!\p{L})/u.test(perk)));
    assert.ok(perks('herbalists', 2, en).some((perk) => /\b1 fight\b/.test(perk)), perks('herbalists', 2, en).join(' | '));
    assert.ok(perks('herbalists', 4, en).some((perk) => /\b2 fights\b/.test(perk)));
    assert.ok(perks('merchants', 4, pl).some((perk) => /\b5 przedmiotów(?!\p{L})/u.test(perk)));
    assert.ok(perks('merchants', 4, en).some((perk) => /\b5 items\b/.test(perk)));
  });

  test("a guild building's share with up to one decimal as each language writes it", () => {
    const building = { effect: '+{value}%', perLevel: 0.005 };
    assert.equal(seatEffect(building, 1), '+0,5%');
    assert.equal(seatEffect(building, 1, pl), '+0,5%');
    assert.equal(seatEffect(building, 1, en), '+0.5%');
  });

  test('a number the server writes into a text: grouped as each language groups it', () => {
    assert.equal(runInLanguage('pl', () => numberText(12345)), new Intl.NumberFormat('pl-PL').format(12345));
    assert.equal(runInLanguage('en', () => numberText(12345)), '12,345');
    assert.equal(numberText(1000), new Intl.NumberFormat('pl-PL').format(1000));
  });
});

describe("the engine's errors, by their text or their shape", () => {
  test('the Targowisko', () => {
    const offer = { kind: 'herb', count: 1, startPrice: 10, buyNow: null };
    assert.equal(english(listBlock({ ...offer, hours: 99 }, 5, 0, 3, pl).message), 'An auction lasts 1 to 24 hours.');
    assert.equal(english(listBlock(offer, 5, 3, 3, pl).message), 'You already have 3 offers at the Marketplace. You can put up more when one of them ends.');
    assert.equal(english(listBlock({ ...offer, buyNow: 5 }, 5, 0, 3, pl).message), 'The “Buy now” price cannot be lower than the starting price.');
    const open = { state: 'open', endsAt: 2, sellerId: 1, sellerUserId: 1, startPrice: 40, bid: null };
    const low = bidBlock(open, { amount: 10, characterId: 2, userId: 2, gold: 100, now: 1 }, pl);
    assert.equal(low.message, 'Najmniej 40 zł.');
    assert.equal(english(low.message), 'At least 40 gold.');
    assert.equal(english(bidBlock(open, { amount: 50, characterId: 2, userId: 2, gold: 10, now: 1 }, pl).message), 'Not enough gold.');
  });

  test('the Osada, the Stajnia, the Salon Gier and the companions', () => {
    assert.equal(english(deliverBlock({ slots: [], weekly: null }, 7, {}, pl).message), 'This order is no longer on the board.');
    // A name of the content in the message stays as the content has it.
    for (const content of [pl, en]) {
      assert.equal(english(mountBlock(2, 0, { level: 99, gold: 0 }, content).message), `Mounts are bought in order. First: ${mountOf(1, content).name}.`);
      assert.equal(english(mountBlock(1, 0, { level: 1, gold: 0 }, content).message), `${mountOf(1, content).name}: from character level ${mountOf(1, content).level}.`);
    }
    assert.equal(mountBlock(1, 0, { level: 1, gold: 0 }, pl).message, `${mountOf(1, pl).name}: od ${mountOf(1, pl).level}. poziomu postaci.`);
    assert.equal(english(ticketBlock({ gold: 0, has: true }, pl).message), 'You already have a ticket for today. You can buy the next one tomorrow.');
    const step = pl.settlement.casino.wheel.step;
    assert.equal(english(spinBlock(1, { gold: 0, left: 1, itemLeft: false, bagFree: 1, stakes: [step, step * 3] }, pl).message), `Stake ${step} to ${step * 3} gold, in hundreds.`);
    const item = generateItem({ baseId: 'sword', level: 10, rarityId: 'rare' }, createRng('stage4'), pl);
    const reforge = (content) => reforgeBlock(item, 0, { gold: 1e9, materials: {}, times: 0 }, content).message;
    if (item.affixes?.length > 0) {
      const { count, rarity } = pl.settlement.reforge.materials.rare;
      assert.equal(reforge(pl), `Brakuje ${count} szt. materiałów o rzadkości „${pl.raritiesById[rarity].name}”.`);
      assert.equal(english(reforge(en)), `You need ${count} more materials of rarity “${en.raritiesById[rarity].name}”.`);
    }
    assert.equal(english(imbueBlock({ ...item, slot: 'ring' }, 'fire', { gold: 0, materials: {} }, pl).message), 'An element can be enchanted only into a weapon or body armour.');
    const companion = { classId: 'warrior', level: 1 };
    const block = companionWearBlock(companion, { ...item, base: 'broadsword' }, pl);
    assert.equal(block.message, `Ten przedmiot towarzysz założy od poziomu ${pl.basesById.broadsword.classLevel}.`);
    assert.equal(english(block.message), `The companion can wear this item from level ${pl.basesById.broadsword.classLevel}.`);
    assert.equal(english(companionWearBlock(companion, { ...item, slot: 'feet' }, pl).message), 'A companion wears only a weapon, armour and one piece of jewellery: an amulet, a ring or a talisman.');
  });
});

// A request in a language, the page's own (X-Lang).
function caller(server) {
  return async (method, path, { body, cookie, lang } = {}) => {
    const headers = { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(cookie && { Cookie: cookie }), ...(lang && { 'X-Lang': lang }) };
    const response = await server.fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
}

describe('English where ENGLISH is on (the test version)', () => {
  const { server, db, signUp } = useServer({ ENGLISH: 'on', PROFESSIONS: 'on', CRAFTING: 'on', SETTLEMENT: 'on' });
  const ask = caller(server);

  // A warrior of `name` at the level given, with gold; its cookie.
  async function player(login, name, { level = 50, gold = 100000 } = {}) {
    const { cookie } = await signUp(login);
    assert.equal((await ask('POST', '/api/character', { cookie, body: { name, classId: 'warrior', appearance: 'female' } })).status, 201);
    await (await db()).prepare("UPDATE characters SET level = ?, class_level = ?, gold = ?, met = '[\"wolf\"]' WHERE name = ?").bind(level, level, gold, name).run();
    return cookie;
  }

  test("the board's sentences stay as drawn, in Polish, after a look in English; the page gets each in its own language", async () => {
    const cookie = await player('soltys', 'Soltys');
    const shown = (await ask('GET', '/api/settlement', { cookie, lang: 'en' })).data.settlement;
    const stored = async () => (await (await db()).prepare('SELECT settlement FROM characters').first()).settlement;
    const kept = await stored();
    const { board } = JSON.parse(kept);
    const orders = [...board.slots.map((slot) => slot.order), board.weekly.order].filter(Boolean);
    assert.ok(orders.length > 0);
    const pages = [...shown.board.slots.map((slot) => slot.order), shown.board.weekly].filter(Boolean);
    assert.equal(pages.length, orders.length);
    for (const [index, order] of orders.entries()) {
      const polish = orderStories(order.kind, order.key, pl);
      assert.ok(polish.includes(order.story), order.story);
      assert.equal(pages[index].story, orderStories(order.kind, order.key, en)[polish.indexOf(order.story)]);
    }
    // A look in Polish rewrites nothing, and shows the sentences as kept.
    const polishLook = (await ask('GET', '/api/settlement', { cookie, lang: 'pl' })).data.settlement;
    assert.equal(await stored(), kept);
    assert.deepEqual(
      polishLook.board.slots.map((slot) => slot.order?.story),
      board.slots.map((slot) => slot.order?.story),
    );
  });

  test("the Osada's, the Targowisko's and the Warownia's errors in the page's language", async () => {
    const cookie = await player('soltys', 'Soltys');
    const error = async (path, body, lang = 'en') => (await ask('POST', path, { cookie, lang, body })).data.error.message;
    assert.equal(await error('/api/settlement/deliver', { orderId: 999 }), 'This order is no longer on the board.');
    assert.equal(await error('/api/settlement/deliver', { orderId: 999 }, 'pl'), 'Tego zlecenia nie ma już na tablicy.');
    assert.equal(await error('/api/settlement/hermit', { service: 'nothing' }), 'The Hermit does not do that.');
    assert.equal(await error('/api/settlement/talk', { companionId: 'nobody' }), 'You have no such companion.');
    assert.equal(await error('/api/market/bid', { offerId: 999, amount: 5 }), 'This offer is gone.');
    assert.equal(await error('/api/market/collect', {}), 'Nothing is waiting for you here.');
    assert.equal(await error('/api/fortress/training', {}), 'Training needs the Training Yard in the Stronghold.');
    assert.equal(await error('/api/fortress/training', {}, 'pl'), 'Trening wymaga Placu treningowego w Warowni.');
    assert.equal(await error('/api/towers/enter', { tower: 'nowhere' }), 'Choose a tower.');
  });

  test("the Gildia's words and errors, with names and numbers", async () => {
    const leader = await player('mistrz', 'Mistrz', { level: 30, gold: 999 });
    const druh = await player('druh', 'Druh', { level: 10 });
    const found = (body, lang = 'en') => ask('POST', '/api/guild/found', { cookie: leader, lang, body });
    assert.equal((await found({ name: 'Leśni Bracia', tag: 'LB' })).data.error.message, 'Founding a guild costs 1000 gold.');
    assert.equal((await found({ name: 'Leśni Bracia', tag: 'LB' }, 'pl')).data.error.message, 'Założenie gildii kosztuje 1000 złota.');
    await (await db()).prepare("UPDATE characters SET gold = 5000 WHERE name = 'Mistrz'").run();
    assert.equal((await found({ name: 'X', tag: 'LB' })).data.error.message, 'A guild name must have 3 to 24 characters.');
    const made = await found({ name: 'Leśni Bracia', tag: 'LB' });
    assert.equal(made.data.text, 'Guild Leśni Bracia [LB] founded.');
    assert.equal(made.data.guild.members[0].roleName, 'leader');
    const invited = await ask('POST', '/api/guild/invite', { cookie: leader, lang: 'en', body: { name: 'Druh' } });
    assert.equal(invited.data.text, 'Invitation sent. Druh will accept it in the Community, on the Guild tab.');
    const guildId = invited.data.guild.id;
    assert.equal((await ask('POST', '/api/guild/accept', { cookie: druh, lang: 'en', body: { guildId } })).data.text, 'You are in the guild. Its channel waits in the Chat, on the “Guild” tab.');
    const druhId = (await (await db()).prepare("SELECT id FROM characters WHERE name = 'Druh'").first()).id;
    const role = await ask('POST', '/api/guild/role', { cookie: leader, lang: 'en', body: { characterId: druhId, role: 'deputy' } });
    assert.equal(role.data.text, 'Druh is now a deputy.');
    assert.equal(role.data.guild.members[1].roleName, 'deputy');
    const polish = await ask('POST', '/api/guild/role', { cookie: leader, lang: 'pl', body: { characterId: druhId, role: 'member' } });
    assert.deepEqual([polish.data.text, polish.data.guild.members[1].roleName], ['Druh jest teraz członkiem.', 'członek']);
    assert.equal((await ask('POST', '/api/guild/kick', { cookie: leader, lang: 'en', body: { characterId: druhId } })).data.text, 'Druh is no longer in the guild.');
  });
});

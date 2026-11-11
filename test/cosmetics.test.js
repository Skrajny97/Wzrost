// The Sklep Systemu (src/server/cosmetics.js, src/engine/cosmetics.js): the
// three frames, the three backgrounds, the Tygrys szablozębny, the two auras,
// the glowing trail and the three pets (chowańce), bought for
// Punkty Systemu once each, never below none, a second quick tap buying
// nothing more; the tiger only with a mount from the Stajnia. What is owned
// is worn and taken off, one of a kind at a time, and with a frame the name
// may take its colour in the chat, the Ranking, the Znajomi, the Drużyna,
// the Gildia and on the card another player sees.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { cosmeticBlock, cosmeticsOf, nameColor, wearBlock } from '../src/engine/index.js';
import { combatantView, playerCombatant } from '../src/engine/combatant.js';
import { content, newCharacter } from './helpers/content.js';
import { useServer } from './helpers/server.js';

const item = (id) => content.cosmeticsById[id];

describe('the Sklep Systemu in the engine', () => {
  test('all three frames and backgrounds, the tiger, the auras, the trail and the pets, at the prices set', () => {
    assert.deepEqual(
      content.cosmetics.map(({ id, kind, name, price }) => [id, kind, name, price]),
      [
        ['frame-gold', 'frame', 'Złota ramka', 300],
        ['frame-system', 'frame', 'Ramka Systemu', 300],
        ['frame-forest', 'frame', 'Leśna ramka', 250],
        ['bg-spring', 'background', 'Źródło Systemu', 150],
        ['bg-tower', 'background', 'Wieża', 150],
        ['bg-camp', 'background', 'Obóz nocą', 150],
        ['sabertooth', 'mountSkin', 'Tygrys szablozębny', 1000],
        ['aura-system', 'aura', 'Aura Systemu', 500],
        ['aura-ember', 'aura', 'Aura Żaru', 500],
        ['trail-light', 'trail', 'Świetliste ślady', 300],
        // The pets (413, 414, "415 A"): the fox and the raven for 600 PS,
        // the will-o'-the-wisp for 800.
        ['fox', 'pet', 'Chowaniec: Lis', 600],
        ['raven', 'pet', 'Chowaniec: Kruk', 600],
        ['wisp', 'pet', 'Chowaniec: Błędny ognik', 800],
        // The outfits (skórki, 763 A: about 800 PS), the Cień's first.
        ['night-raven', 'outfit', 'Płaszcz Nocnego Kruka', 800],
        ['forest-lord', 'outfit', 'Strój Leśnego Pana', 800],
        ['perun', 'outfit', 'Pancerz Peruna', 800],
        ['dawn', 'outfit', 'Szaty Świtu', 800],
        ['eclipse', 'outfit', 'Szata Zaćmienia', 800],
      ],
    );
    // A name in its frame's colour: gold brighter than the names' own gold.
    assert.deepEqual(
      content.cosmetics.filter((one) => one.kind === 'frame').map((one) => one.nameColor),
      ['#ffd76a', '#8fe3ef', '#7fd36b'],
    );
  });

  test('the stored state holds only what the data has, owned once, worn only when owned and of its kind', () => {
    assert.deepEqual(cosmeticsOf(null, content), { owned: [], frame: null, background: null, mountSkin: null, aura: null, trail: null, pet: null, outfit: null, nameFromFrame: false });
    assert.deepEqual(cosmeticsOf({}, content), cosmeticsOf(null, content));
    const stored = {
      owned: ['frame-gold', 'frame-gold', 'nope', 'bg-camp', 'constructor'],
      frame: 'frame-gold',
      background: 'bg-tower',
      mountSkin: 'bg-camp',
      nameFromFrame: 'tak',
    };
    assert.deepEqual(cosmeticsOf(stored, content), { owned: ['frame-gold', 'bg-camp'], frame: 'frame-gold', background: null, mountSkin: null, aura: null, trail: null, pet: null, outfit: null, nameFromFrame: false });
    assert.deepEqual(cosmeticsOf({ owned: 'frame-gold', frame: 'frame-gold' }, content).owned, []);
  });

  test('a cosmetic is bought once, for its Punkty Systemu, the tiger only with a mount', () => {
    const rich = { systemPoints: 5000, mount: { stage: 1 } };
    for (const id of ['nope', 'constructor', 42, null, undefined]) assert.equal(cosmeticBlock(id, {}, rich, content).code, 'invalid_cosmetic', String(id));
    assert.equal(cosmeticBlock('frame-gold', {}, rich, content), null);
    assert.equal(cosmeticBlock('frame-gold', { owned: ['frame-gold'] }, rich, content).code, 'owned');
    assert.equal(cosmeticBlock('frame-gold', {}, { systemPoints: 299, mount: null }, content).code, 'not_enough_points');
    assert.equal(cosmeticBlock('frame-gold', {}, { systemPoints: 300, mount: null }, content), null);
    assert.deepEqual(cosmeticBlock('sabertooth', {}, { systemPoints: 5000, mount: null }, content), { code: 'no_mount', message: 'Najpierw kup wierzchowca w Stajni.' });
    assert.equal(cosmeticBlock('sabertooth', {}, { systemPoints: 999, mount: { stage: 1 } }, content).code, 'not_enough_points');
    assert.equal(cosmeticBlock('sabertooth', {}, rich, content), null);
  });

  test('only an owned cosmetic is worn, in its own place; null takes it off', () => {
    const stored = { owned: ['frame-gold', 'bg-camp'] };
    assert.equal(wearBlock('frame', 'frame-gold', stored, content), null);
    assert.equal(wearBlock('frame', null, stored, content), null);
    assert.equal(wearBlock('background', 'bg-camp', stored, content), null);
    assert.equal(wearBlock('frame', 'frame-system', stored, content).code, 'not_owned');
    assert.equal(wearBlock('frame', 'bg-camp', stored, content).code, 'invalid_cosmetic');
    assert.equal(wearBlock('frame', 'nope', stored, content).code, 'invalid_cosmetic');
    for (const kind of ['owned', 'nameFromFrame', 'constructor', undefined]) assert.equal(wearBlock(kind, null, stored, content).code, 'invalid_kind');
  });

  test('an aura and a trail are worn in their own places, one of each, only when owned', () => {
    const stored = { owned: ['aura-system', 'aura-ember', 'trail-light'], aura: 'aura-ember', trail: 'trail-light' };
    assert.equal(wearBlock('aura', 'aura-system', stored, content), null);
    assert.equal(wearBlock('trail', 'trail-light', stored, content), null);
    assert.equal(wearBlock('aura', 'trail-light', stored, content).code, 'invalid_cosmetic');
    assert.equal(wearBlock('trail', 'aura-system', stored, content).code, 'invalid_cosmetic');
    assert.equal(wearBlock('aura', 'aura-system', { owned: [] }, content).code, 'not_owned');
    const worn = cosmeticsOf(stored, content);
    assert.equal(worn.aura, 'aura-ember');
    assert.equal(worn.trail, 'trail-light');
    // Worn only when owned and of its kind.
    assert.equal(cosmeticsOf({ owned: ['aura-system'], aura: 'aura-ember', trail: 'aura-system' }, content).aura, null);
    assert.equal(cosmeticsOf({ owned: ['aura-system'], aura: 'aura-ember', trail: 'aura-system' }, content).trail, null);
    // The aura's light and the trail's colour are the data's.
    assert.deepEqual(item('aura-system').aura, { glow: '#8fe3ef', spark: '#d6f6fa', sparks: 'drift' });
    assert.deepEqual(item('aura-ember').aura, { glow: '#ec7828', spark: '#ffc45a', sparks: 'rise' });
    assert.deepEqual(item('trail-light').trail, { color: '#8fe3ef' });
  });

  test('a pet is worn in its own place, one at a time, only when owned, and needs no mount', () => {
    const stored = { owned: ['fox', 'raven', 'aura-system'], pet: 'raven' };
    assert.equal(wearBlock('pet', 'fox', stored, content), null);
    assert.equal(wearBlock('pet', null, stored, content), null);
    assert.equal(wearBlock('pet', 'wisp', stored, content).code, 'not_owned');
    assert.equal(wearBlock('pet', 'aura-system', stored, content).code, 'invalid_cosmetic');
    assert.equal(wearBlock('aura', 'fox', stored, content).code, 'invalid_cosmetic');
    assert.equal(cosmeticsOf(stored, content).pet, 'raven');
    // Worn only when owned and a pet.
    assert.equal(cosmeticsOf({ owned: ['fox'], pet: 'wisp' }, content).pet, null);
    assert.equal(cosmeticsOf({ owned: ['aura-system'], pet: 'aura-system' }, content).pet, null);
    // Bought for its points, without a mount from the Stajnia.
    assert.equal(cosmeticBlock('wisp', {}, { systemPoints: 800, mount: null }, content), null);
    assert.equal(cosmeticBlock('wisp', {}, { systemPoints: 799, mount: null }, content).code, 'not_enough_points');
    // Each walks in the Walka scene and sits on the portrait, as the data has them.
    for (const id of ['fox', 'raven', 'wisp']) {
      const { walk, foot, ride, portrait } = item(id).pet;
      assert.deepEqual([walk.size, walk.frames, portrait.size, portrait.frames], [64, 8, 32, 8], id);
      assert.ok(foot.edge && ride.edge, id);
    }
    // The wisp behind the character, the fox and the raven ahead of it.
    assert.deepEqual(['fox', 'raven', 'wisp'].map((id) => [item(id).pet.foot.behind ?? false, item(id).pet.ride.behind ?? false]), [[false, false], [false, false], [true, true]]);
  });

  test('an outfit is for the characters of its class, and worn in its own place (763 A)', () => {
    const none = cosmeticsOf(null, content);
    assert.equal(item('night-raven').classId, 'shadow');
    assert.equal(cosmeticBlock('night-raven', none, { systemPoints: 1000, mount: null, classId: 'warrior' }, content).code, 'other_class');
    assert.equal(cosmeticBlock('night-raven', none, { systemPoints: 1000, mount: null, classId: 'shadow' }, content), null);
    assert.equal(cosmeticBlock('night-raven', none, { systemPoints: 799, mount: null, classId: 'shadow' }, content).code, 'not_enough_points');
    assert.equal(wearBlock('outfit', 'night-raven', none, content).code, 'not_owned');
    assert.equal(wearBlock('outfit', 'night-raven', { owned: ['night-raven'] }, content), null);
    assert.equal(wearBlock('pet', 'night-raven', { owned: ['night-raven'] }, content).code, 'invalid_cosmetic');
    assert.equal(cosmeticsOf({ owned: ['night-raven'], outfit: 'night-raven' }, content).outfit, 'night-raven');
    assert.equal(cosmeticsOf({ owned: [], outfit: 'night-raven' }, content).outfit, null);
    // The fights' busts wear it too, and without one nothing changes.
    const raven = playerCombatant({ character: { ...newCharacter('shadow'), outfit: 'night-raven' }, equipped: [], name: 'Kruk' }, content);
    assert.equal(raven.outfit, 'night-raven');
    assert.equal(combatantView(raven, 1, content).outfit, 'night-raven');
    const plain = playerCombatant({ character: newCharacter('shadow'), equipped: [], name: 'Kruk' }, content);
    assert.equal('outfit' in plain || 'outfit' in combatantView(plain, 1, content), false);
  });

  test("the name takes the frame's colour only with a frame worn and the switch on", () => {
    const owned = ['frame-gold', 'frame-forest'];
    assert.equal(nameColor({ owned, frame: 'frame-gold' }, content), null);
    assert.equal(nameColor({ owned, frame: 'frame-gold', nameFromFrame: true }, content), '#ffd76a');
    assert.equal(nameColor({ owned, frame: 'frame-forest', nameFromFrame: true }, content), '#7fd36b');
    assert.equal(nameColor({ owned, nameFromFrame: true }, content), null);
    assert.equal(nameColor({ owned: [], frame: 'frame-gold', nameFromFrame: true }, content), null);
  });
});

describe('the Sklep Systemu through the API', () => {
  const { call, db, signUp } = useServer({ SETTLEMENT: 'on' });
  const cookies = {};

  async function player(login, name, { level = 30 } = {}) {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = ?, class_level = ? WHERE name = ?').bind(level, level, name).run();
  }
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });
  const points = async (name, value) => (await db()).prepare('UPDATE characters SET system_points = ? WHERE name = ?').bind(value, name).run();
  const stored = async (name) => (await (await db()).prepare('SELECT system_points, cosmetics FROM characters WHERE name = ?').bind(name).first());
  const buy = (login, id) => as(login, 'POST', '/api/cosmetics/buy', { id });
  const wear = (login, kind, id) => as(login, 'POST', '/api/cosmetics/wear', { kind, id });

  beforeEach(async () => {
    await player('kupiec', 'Kupiec');
  });

  test('a new character owns nothing and wears nothing', async () => {
    const { character } = (await as('kupiec', 'GET', '/api/character')).data;
    assert.deepEqual(character.cosmetics, { owned: [], frame: null, background: null, mountSkin: null, aura: null, trail: null, pet: null, outfit: null, nameFromFrame: false });
    assert.equal(character.nameColor, null);
    // The page has the cosmetics and the words of the shop.
    const { cosmetics } = (await call('GET', '/api/content')).data;
    assert.equal(cosmetics.items.length, content.cosmetics.length);
    assert.deepEqual(cosmetics.items[0].window, [25, 26, 94, 130]);
    assert.ok(cosmetics.texts.lead.length > 0);
  });

  test('a cosmetic costs its Punkty Systemu, once, and never more than the character has', async () => {
    await points('Kupiec', 299);
    const short = await buy('kupiec', 'frame-gold');
    assert.equal(short.status, 409);
    assert.equal(short.data.error.code, 'not_enough_points');
    assert.equal((await stored('Kupiec')).system_points, 299);
    assert.equal((await buy('kupiec', 'nope')).status, 400);
    assert.equal((await buy('kupiec', 'constructor')).status, 400);

    await points('Kupiec', 450);
    const bought = await buy('kupiec', 'frame-gold');
    assert.equal(bought.status, 200, JSON.stringify(bought.data));
    assert.deepEqual(bought.data.bought, { id: 'frame-gold', name: 'Złota ramka', price: 300 });
    assert.equal(bought.data.character.systemPoints, 150);
    assert.deepEqual(bought.data.character.cosmetics.owned, ['frame-gold']);
    // Bought, not worn.
    assert.equal(bought.data.character.cosmetics.frame, null);
    // Twice: no.
    const again = await buy('kupiec', 'frame-gold');
    assert.equal(again.data.error.code, 'owned');
    assert.equal((await stored('Kupiec')).system_points, 150);
    // A background for the rest.
    assert.equal((await buy('kupiec', 'bg-camp')).data.character.systemPoints, 0);
    assert.deepEqual(JSON.parse((await stored('Kupiec')).cosmetics).owned, ['frame-gold', 'bg-camp']);
  });

  test('two quick taps buy once, and two purchases at once never go below none', async () => {
    await points('Kupiec', 300);
    const taps = await Promise.all([buy('kupiec', 'frame-system'), buy('kupiec', 'frame-system')]);
    assert.deepEqual(taps.map((tap) => tap.status).sort(), [200, 409]);
    let row = await stored('Kupiec');
    assert.equal(row.system_points, 0);
    assert.deepEqual(JSON.parse(row.cosmetics).owned, ['frame-system']);

    // Enough for one of two different things: one goes through.
    await points('Kupiec', 300);
    const both = await Promise.all([buy('kupiec', 'frame-gold'), buy('kupiec', 'frame-forest')]);
    assert.equal(both.filter((answer) => answer.status === 200).length, 1);
    row = await stored('Kupiec');
    assert.ok(row.system_points >= 0);
    assert.equal(JSON.parse(row.cosmetics).owned.length, 2);
    assert.equal(row.system_points, 300 - item(JSON.parse(row.cosmetics).owned[1]).price);
  });

  test('the Tygrys szablozębny needs a mount from the Stajnia', async () => {
    await points('Kupiec', 1500);
    const none = await buy('kupiec', 'sabertooth');
    assert.equal(none.status, 409);
    assert.deepEqual(none.data.error, { code: 'no_mount', message: 'Najpierw kup wierzchowca w Stajni.' });
    assert.equal((await stored('Kupiec')).system_points, 1500);
    await (await db()).prepare(`UPDATE characters SET settlement = '{"mount":1}' WHERE name = 'Kupiec'`).run();
    const bought = await buy('kupiec', 'sabertooth');
    assert.equal(bought.status, 200, JSON.stringify(bought.data));
    assert.equal(bought.data.character.systemPoints, 500);
    const worn = await wear('kupiec', 'mountSkin', 'sabertooth');
    assert.equal(worn.data.character.cosmetics.mountSkin, 'sabertooth');
    // The look only: the Stajnia's mount stays the one that shortens trips.
    assert.equal(worn.data.character.mount.id, 'pony');
  });

  test('what is owned is worn and taken off, one of a kind at a time', async () => {
    await points('Kupiec', 1000);
    await buy('kupiec', 'frame-gold');
    await buy('kupiec', 'frame-forest');
    await buy('kupiec', 'bg-tower');
    const notOwned = await wear('kupiec', 'frame', 'frame-system');
    assert.equal(notOwned.status, 403);
    assert.equal(notOwned.data.error.code, 'not_owned');
    assert.equal((await wear('kupiec', 'frame', 'bg-tower')).status, 400);
    assert.equal((await wear('kupiec', 'owned', null)).status, 400);
    assert.equal((await wear('kupiec', 'frame', 'frame-gold')).data.character.cosmetics.frame, 'frame-gold');
    const both = (await wear('kupiec', 'background', 'bg-tower')).data.character.cosmetics;
    assert.deepEqual([both.frame, both.background], ['frame-gold', 'bg-tower']);
    // Another frame takes its place.
    assert.equal((await wear('kupiec', 'frame', 'frame-forest')).data.character.cosmetics.frame, 'frame-forest');
    const off = (await wear('kupiec', 'frame', null)).data.character.cosmetics;
    assert.deepEqual([off.frame, off.background, off.owned], [null, 'bg-tower', ['frame-gold', 'frame-forest', 'bg-tower']]);
    assert.equal((await wear('kupiec', 'background', null)).data.character.cosmetics.background, null);
    // Wearing costs nothing.
    assert.equal((await stored('Kupiec')).system_points, 1000 - 300 - 250 - 150);
  });

  test('a pet is bought and worn, one at a time, and the character and its card carry it', async () => {
    await player('sasiad', 'Sasiad');
    await points('Kupiec', 1400);
    // No mount needed; worn only once owned.
    assert.equal((await wear('kupiec', 'pet', 'fox')).data.error.code, 'not_owned');
    const fox = await buy('kupiec', 'fox');
    assert.equal(fox.status, 200, JSON.stringify(fox.data));
    assert.deepEqual(fox.data.bought, { id: 'fox', name: 'Chowaniec: Lis', price: 600 });
    assert.equal(fox.data.character.systemPoints, 800);
    assert.equal(fox.data.character.cosmetics.pet, null);
    assert.equal((await buy('kupiec', 'wisp')).data.character.systemPoints, 0);
    assert.equal((await buy('kupiec', 'raven')).data.error.code, 'not_enough_points');
    assert.equal((await wear('kupiec', 'pet', 'raven')).data.error.code, 'not_owned');
    assert.equal((await wear('kupiec', 'aura', 'fox')).status, 400);

    assert.equal((await wear('kupiec', 'pet', 'fox')).data.character.cosmetics.pet, 'fox');
    // Another pet takes its place: one at a time.
    const wisp = (await wear('kupiec', 'pet', 'wisp')).data.character.cosmetics;
    assert.deepEqual([wisp.pet, wisp.owned], ['wisp', ['fox', 'wisp']]);
    // The character as the page gets it, and its card for another player.
    assert.equal((await as('kupiec', 'GET', '/api/character')).data.character.cosmetics.pet, 'wisp');
    assert.equal((await as('sasiad', 'GET', '/api/profile/Kupiec')).data.profile.pet, 'wisp');
    assert.equal((await as('kupiec', 'GET', '/api/profile/Sasiad')).data.profile.pet, null);
    // Off, and the card shows none.
    assert.equal((await wear('kupiec', 'pet', null)).data.character.cosmetics.pet, null);
    assert.equal((await as('sasiad', 'GET', '/api/profile/Kupiec')).data.profile.pet, null);
    assert.equal((await stored('Kupiec')).system_points, 0);
  });

  test('an outfit is bought only by a character of its class, worn, and seen on its card and in the list of characters', async () => {
    await player('sasiad', 'Sasiad');
    await points('Kupiec', 1000);
    const { character } = (await as('kupiec', 'GET', '/api/character')).data;
    if (character.classId !== 'shadow') assert.equal((await buy('kupiec', 'night-raven')).data.error.code, 'other_class');
    await (await db()).prepare("UPDATE characters SET class_id = 'shadow' WHERE name = 'Kupiec'").run();
    const bought = await buy('kupiec', 'night-raven');
    assert.equal(bought.status, 200, JSON.stringify(bought.data));
    assert.equal(bought.data.character.systemPoints, 200);
    assert.equal(bought.data.character.cosmetics.outfit, null);
    assert.equal((await wear('kupiec', 'outfit', 'night-raven')).data.character.cosmetics.outfit, 'night-raven');
    assert.equal((await as('sasiad', 'GET', '/api/profile/Kupiec')).data.profile.outfit, 'night-raven');
    const listed = (await as('kupiec', 'GET', '/api/characters')).data.characters.find((one) => one.name === 'Kupiec');
    assert.equal(listed.outfit, 'night-raven');
    assert.equal((await wear('kupiec', 'outfit', null)).data.character.cosmetics.outfit, null);
    assert.equal((await as('sasiad', 'GET', '/api/profile/Kupiec')).data.profile.outfit, null);
  });

  test("the name takes the frame's colour with the switch on, while a frame is worn", async () => {
    await points('Kupiec', 300);
    await buy('kupiec', 'frame-gold');
    await wear('kupiec', 'frame', 'frame-gold');
    assert.equal((await as('kupiec', 'POST', '/api/cosmetics/name-color', { on: 'tak' })).status, 400);
    const on = await as('kupiec', 'POST', '/api/cosmetics/name-color', { on: true });
    assert.equal(on.status, 200);
    assert.equal(on.data.character.cosmetics.nameFromFrame, true);
    assert.equal(on.data.character.nameColor, '#ffd76a');
    // Without the frame the name has its own colour; the switch stays.
    const bare = (await wear('kupiec', 'frame', null)).data.character;
    assert.deepEqual([bare.nameColor, bare.cosmetics.nameFromFrame], [null, true]);
    assert.equal((await wear('kupiec', 'frame', 'frame-gold')).data.character.nameColor, '#ffd76a');
    const off = (await as('kupiec', 'POST', '/api/cosmetics/name-color', { on: false })).data.character;
    assert.deepEqual([off.nameColor, off.cosmetics.nameFromFrame], [null, false]);
  });

  test("others see the frame, the background and the name's colour: the card, the chat, the Ranking, the Znajomi, the Gildia and the Drużyna", async () => {
    await player('sasiad', 'Sasiad');
    await points('Kupiec', 1000);
    await buy('kupiec', 'frame-system');
    await buy('kupiec', 'bg-spring');
    await wear('kupiec', 'frame', 'frame-system');
    await wear('kupiec', 'background', 'bg-spring');
    await as('kupiec', 'POST', '/api/cosmetics/name-color', { on: true });
    const color = '#8fe3ef';

    // The card from a tap on the name.
    const { profile } = (await as('sasiad', 'GET', '/api/profile/Kupiec')).data;
    assert.deepEqual([profile.frame, profile.background, profile.nameColor], ['frame-system', 'bg-spring', color]);
    const own = (await as('kupiec', 'GET', '/api/profile/Sasiad')).data.profile;
    assert.deepEqual([own.frame, own.background, own.nameColor], [null, null, null]);

    // The chat: the line sent, and as others read it.
    for (const login of ['kupiec', 'sasiad']) await as(login, 'POST', '/api/chat/rules');
    const sent = await as('kupiec', 'POST', '/api/chat', { channel: 'global', text: 'Nowa ramka!' });
    assert.equal(sent.status, 201, JSON.stringify(sent.data));
    assert.equal(sent.data.message.nameColor, color);
    assert.equal((await as('sasiad', 'POST', '/api/chat', { channel: 'global', text: 'Ładna' })).data.message.nameColor, null);
    const chat = (await as('sasiad', 'GET', '/api/chat?channel=global')).data;
    assert.deepEqual(chat.messages.map((message) => [message.name, message.nameColor]), [['Kupiec', color], ['Sasiad', null]]);
    // A private message too, once the chat's pause between messages is over.
    const ids = Object.fromEntries((await (await db()).prepare('SELECT name, id FROM characters').all()).results.map((row) => [row.name, row.id]));
    await (await db()).prepare('UPDATE chat_messages SET created_at = created_at - 60000').run();
    const whisper = await as('kupiec', 'POST', '/api/chat', { with: ids.Sasiad, text: 'Hej' });
    assert.equal(whisper.status, 201, JSON.stringify(whisper.data));
    const talk = (await as('sasiad', 'GET', `/api/chat?with=${ids.Kupiec}`)).data;
    assert.deepEqual(talk.messages.map((message) => [message.name, message.nameColor]), [['Kupiec', color]]);

    // The Ranking.
    const ranking = (await as('sasiad', 'GET', '/api/ranking')).data;
    assert.deepEqual(
      ranking.rows.map((row) => [row.name, row.nameColor]).sort(),
      [
        ['Kupiec', color],
        ['Sasiad', null],
      ],
    );

    // The Znajomi.
    await as('sasiad', 'POST', '/api/friends/invite', { name: 'Kupiec' });
    const incoming = (await as('kupiec', 'GET', '/api/friends')).data.incoming[0];
    assert.equal(incoming.nameColor, null);
    assert.equal((await as('sasiad', 'GET', '/api/friends')).data.outgoing[0].nameColor, color);
    await as('kupiec', 'POST', '/api/friends/accept', { id: incoming.id });
    assert.equal((await as('sasiad', 'GET', '/api/friends')).data.friends[0].nameColor, color);

    // The Gildia: its members, and the friends a leader may invite.
    await (await db()).prepare("UPDATE characters SET gold = 5000 WHERE name = 'Sasiad'").run();
    const founded = await as('sasiad', 'POST', '/api/guild/found', { name: 'Leśni Bracia', tag: 'LB' });
    assert.equal(founded.status, 200, JSON.stringify(founded.data));
    assert.deepEqual(founded.data.guild.friends.map((friend) => [friend.name, friend.nameColor]), [['Kupiec', color]]);
    await as('sasiad', 'POST', '/api/guild/invite', { name: 'Kupiec' });
    const invite = (await as('kupiec', 'GET', '/api/guild')).data.invites[0];
    const joined = await as('kupiec', 'POST', '/api/guild/accept', { guildId: invite.guildId });
    assert.deepEqual(joined.data.guild.members.map((member) => [member.name, member.nameColor]), [['Sasiad', null], ['Kupiec', color]]);

    // The Drużyna.
    await as('sasiad', 'POST', '/api/party/invite', { name: 'Kupiec' });
    const partyInvite = (await as('kupiec', 'GET', '/api/party')).data.invites[0];
    const party = await as('kupiec', 'POST', '/api/party/accept', { partyId: partyInvite.partyId });
    assert.equal(party.status, 200, JSON.stringify(party.data));
    assert.deepEqual(party.data.party.members.map((member) => [member.name, member.nameColor]), [['Sasiad', null], ['Kupiec', color]]);
  });
});

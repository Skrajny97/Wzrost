// The Sklep Systemu (data/cosmetics.json; cosmetics.js in the engine), from
// the stall in the top bar: frames and backgrounds of the portrait, the
// look of the Stajnia's mount, auras, trails and pets (chowańce), bought
// for Punkty Systemu, each for good and for the character that bought it
// (characters.cosmetics), and worn or taken off at will, one of a kind at a
// time. With a frame worn, the character's name may show in
// the frame's colour wherever names show, as its guild's tag does
// (nameColorOf beside guildTagSql).

import { cosmeticBlock, cosmeticsOf, mountView, nameColor, wearBlock } from '../engine/index.js';
import { characterChanged } from './atomic.js';
import { characterView, loadPlayer, requirePlayer } from './characters.js';
import { content } from './content.js';
import { settlementOn } from './features.js';
import { ApiError, json, readJson } from './http.js';

const STATUS = { invalid_cosmetic: 400, invalid_kind: 400, not_owned: 403 };

// What the character of a row owns and wears.
export const cosmeticsOfRow = (row) => cosmeticsOf(JSON.parse(row.cosmetics ?? '{}'), content());

// The colour of the name of the character whose cosmetics column `text`
// holds (from a list's query), or null.
export const nameColorOf = (text) => nameColor(JSON.parse(text ?? '{}'), content());

// How the character of a row looks on the way, for another player's Walka
// scene (scenes.js): its class, look and skin tone, its evolution's form,
// its Stajnia's mount and the looks it wears from the Sklep Systemu, as it
// set out. The members of a Drużyna walk side by side (640 A, parties.js),
// and a mercenary from the Karczma beside the one who took it along (654 A,
// mercenaries.js).
export function wayLook(row) {
  const worn = cosmeticsOfRow(row);
  const mount = settlementOn() ? mountView(JSON.parse(row.settlement ?? '{}'), content()) : null;
  return {
    classId: row.class_id,
    appearance: row.appearance,
    skin: row.skin ?? content().defaultSkin,
    evolution: content().evolutionsById[row.evolution] ? row.evolution : null,
    mount: mount?.id ?? null,
    mountSkin: worn.mountSkin,
    aura: worn.aura,
    trail: worn.trail,
    pet: worn.pet,
    outfit: worn.outfit,
  };
}

const refuse = (block) => new ApiError(STATUS[block.code] ?? 409, block.code, block.message);

// Saves the cosmetics only on the row as it was read (its version), with
// `spent` Punkty Systemu taken, never below none: a second tap, or a
// change in between, finds the version moved and changes nothing.
async function save(context, session, row, next, spent = 0) {
  const db = context.env.DB;
  const result = await db
    .prepare('UPDATE characters SET system_points = system_points - ?, cosmetics = ?, version = version + 1 WHERE id = ? AND version = ? AND system_points >= ?')
    .bind(spent, JSON.stringify(next), row.id, row.version, spent)
    .run();
  if (result.meta.changes !== 1) throw characterChanged();
  return loadPlayer(db, session.userId);
}

// POST /api/cosmetics/buy { id }: the cosmetic for its Punkty Systemu, once;
// a mount's look only for a character with a mount from the Stajnia.
export async function buyCosmetic(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  const body = await readJson(context.request);
  const stored = cosmeticsOfRow(row);
  const mount = settlementOn() ? mountView(JSON.parse(row.settlement ?? '{}'), content()) : null;
  const block = cosmeticBlock(body.id, stored, { systemPoints: row.system_points, mount, classId: row.class_id }, content());
  if (block) throw refuse(block);
  const item = content().cosmeticsById[body.id];
  const after = await save(context, session, row, { ...stored, owned: [...stored.owned, item.id] }, item.price);
  return json({ bought: { id: item.id, name: item.name, price: item.price }, character: characterView(after, context.now) });
}

// POST /api/cosmetics/wear { kind, id }: an owned cosmetic worn in its
// place, in place of the one there; `id` null takes it off.
export async function wearCosmetic(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  const id = body.id ?? null;
  const stored = cosmeticsOfRow(player.row);
  const block = wearBlock(body.kind, id, stored, content());
  if (block) throw refuse(block);
  const after = await save(context, session, player.row, { ...stored, [body.kind]: id });
  return json({ character: characterView(after, context.now) });
}

// POST /api/cosmetics/name-color { on }: "Kolor imienia jak ramka", the
// name in the colour of the frame worn, or in its own again. It stays as
// set while no frame is worn, and works again with the next one.
export async function setNameColor(context) {
  const { session, player } = await requirePlayer(context);
  const body = await readJson(context.request);
  if (typeof body.on !== 'boolean') throw new ApiError(400, 'invalid_switch', 'Wybierz: włączony albo wyłączony.');
  const after = await save(context, session, player.row, { ...cosmeticsOfRow(player.row), nameFromFrame: body.on });
  return json({ character: characterView(after, context.now) });
}

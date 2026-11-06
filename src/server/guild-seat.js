// The Siedziba Gildii (the author's 616 A; the engine's guild-seat.js has the
// rules, data/guilds.json `seat` the numbers and the words; DECISIONS.md,
// "Siedziba Gildii (616 A)"): a guild's buildings, each with all the gold and
// the pieces of its camp resource the members ever donated to it, its level
// following from them, and the mark of the leader and the deputies on those
// the guild would rather raise now (the author: "ludzie muszą móc wpłacać na
// co chcą, lider i zastępca może tylko oznaczyć co jest preferowane"). A
// member donates its own gold and the building's resource to the building it
// picks, as much as it holds and as the building can still take below its
// top level, in one batch with an assertion at its head: the gold and the
// pieces leave the character only while it holds them and is in the guild,
// and the building takes no more than its top level needs, so two taps at
// once never take what is not there. What was donated stays with the
// building, also when the member leaves. The members' bonuses come with the
// character (guildSeatSql, loaded in characters.js): an exploration keeps
// those of its start (hunts.js), the Kowadło takes those of the upgrade
// (perks.js), and a character that leaves its guild has none from then on.
// A guild that goes takes its seat along (guildRemoval, guilds.js). No
// yellow dot: nothing in the Siedziba waits for the player, as in the
// Wymiana.

import { seatBonuses, seatBuilding, seatBuildings, seatCostTo, seatEffect, seatLevelCost, seatProgress } from '../engine/index.js';
import { assertion, atomically } from './atomic.js';
import { characterView, loadPlayer, walletOf } from './characters.js';
import { content } from './content.js';
import { guildPlayer, requireMember } from './guild-trials.js';
import { ApiError, json, readJson } from './http.js';
import { numberText } from './i18n.js';

const rules = () => content().guilds.seat;
const words = () => rules().texts;
const errors = () => words().errors;
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
const number = (value) => numberText(value);
const path = (id) => `$."${id}"`;
const changed = () => new ApiError(409, 'changed', errors().changed);

// SQL for the donations to the buildings of the guild of the character
// whose id `column` holds, as JSON by building ({ gold, resource }), and
// '{}' outside a guild: loaded with the character (characters.js), whose
// levels give it its bonuses.
export const guildSeatSql = (column) =>
  `(SELECT json_group_object(s.building_id, json_object('gold', s.gold, 'resource', s.resource))
    FROM guild_members m JOIN guild_seat s ON s.guild_id = m.guild_id WHERE m.character_id = ${column})`;

// "5000 złota", "300 drewna": gold, or pieces of the building's resource.
const goldText = (count) => filled(words().goldAmount, { count: number(count) });
const resourceText = (building, count) => filled(words().resourceAmount, { count: number(count), genitive: content().resourcesById[building.resource].genitive });

// "5000 złota i 300 drewna": what a donation to the building gives, in
// words, the parts above nothing.
function amountsText(building, gold, resource) {
  const parts = [gold > 0 && goldText(gold), resource > 0 && resourceText(building, resource)].filter(Boolean);
  return parts.length === 2 ? filled(words().both, { first: parts[0], second: parts[1] }) : parts[0];
}

// The card's words, with the rules' numbers filled in (all but the answers'
// errors).
function cardTexts() {
  const { maxLevel } = rules();
  const { errors: _, ...texts } = words();
  const first = seatLevelCost(1, content());
  const last = seatLevelCost(maxLevel, content());
  const vars = { max: maxLevel, firstGold: number(first.gold), firstResource: number(first.resource), lastGold: number(last.gold), lastResource: number(last.resource) };
  return { ...texts, how: texts.how.map((line) => filled(line, vars)) };
}

// The donations to a guild's buildings, by building ({ gold, resource }),
// and the buildings marked as preferred.
async function seatOf(db, guildId) {
  const { results } = await db.prepare('SELECT building_id, gold, resource, preferred FROM guild_seat WHERE guild_id = ?').bind(guildId).all();
  return {
    donated: Object.fromEntries(results.map((row) => [row.building_id, { gold: row.gold, resource: row.resource }])),
    preferred: new Set(results.filter((row) => row.preferred).map((row) => row.building_id)),
  };
}

// The Siedziba for the page: each building with its level, what it gives
// every member now and at its next level, that level's cost with what is
// collected for it and the surplus beyond it, the most that can still be
// donated to it, its mark and what the character holds of its gold and
// resource; whether the character may mark (the leader and the deputies);
// the guild's bonuses, in a line of words too; the quick amounts and the
// words.
async function seatView(db, player, guild) {
  const wallet = walletOf(player.row);
  const { donated, preferred } = await seatOf(db, guild.id);
  const buildings = seatBuildings(content()).map((building) => {
    const progress = seatProgress(donated[building.id], content());
    const resource = content().resourcesById[building.resource];
    return {
      id: building.id,
      name: building.name,
      accusative: building.accusative,
      resource: { id: resource.id, name: resource.name, genitive: resource.genitive },
      level: progress.level,
      maxLevel: progress.maxLevel,
      effect: seatEffect(building, progress.level, content()),
      nextEffect: progress.next && seatEffect(building, progress.next.level, content()),
      next: progress.next,
      room: progress.room,
      preferred: preferred.has(building.id),
      have: { gold: wallet.gold, resource: wallet[building.resource] ?? 0 },
    };
  });
  const effects = buildings.map((building) => building.effect).filter(Boolean);
  return {
    guild: { name: guild.name, tag: guild.tag },
    canMark: guild.role !== 'member',
    buildings,
    bonuses: seatBonuses(Object.fromEntries(buildings.map((building) => [building.id, building.level])), content()),
    bonusesText: effects.length > 0 ? filled(words().bonuses, { bonuses: effects.join(', ') }) : words().noBonuses,
    rules: { maxLevel: rules().maxLevel, quick: rules().quick },
    texts: cardTexts(),
  };
}

// GET /api/guild/seat: outside a guild, only the card's words (as the
// Wymiana's).
export async function getGuildSeat(context) {
  const { player, guild, db } = await guildPlayer(context, errors());
  if (!guild) return json({ guild: null, texts: cardTexts() });
  return json(await seatView(db, player, guild));
}

// The building a request names.
function buildingOf(body) {
  const building = typeof body.buildingId === 'string' ? seatBuilding(body.buildingId, content()) : null;
  if (!building) throw new ApiError(400, 'invalid_building', errors().noBuilding);
  return building;
}

// A donation past the building's top level: how much more it takes, or,
// with none, that it has enough of it (`genitive`: "złota", "drewna").
const tooMuch = (room, genitive, roomText) =>
  room > 0
    ? new ApiError(409, 'too_much', filled(errors().tooMuch, { room: roomText }))
    : new ApiError(409, 'too_much', filled(words().enough, { what: genitive.charAt(0).toUpperCase() + genitive.slice(1) }));

// An amount of a donation from a request: a whole number from 0 up; none
// given is 0.
function amountOf(value) {
  if (value === undefined || value === null) return 0;
  if (!Number.isInteger(value) || value < 0) throw new ApiError(400, 'invalid_amount', errors().invalidAmount);
  return value;
}

// POST /api/guild/seat/donate { buildingId, gold, resource }: a member gives
// gold and pieces of the building's resource to the building it picks, at
// least one of them, no more than it holds and than the building can still
// take below its top level. The building's level follows from all the
// donations to it, the surplus of a level carried over to the next; a level
// reached is told in the answer's words.
export async function donateToGuildSeat(context) {
  const { session, player, guild, db } = await requireMember(context, errors());
  const body = await readJson(context.request);
  const building = buildingOf(body);
  const gold = amountOf(body.gold);
  const resource = amountOf(body.resource);
  if (gold + resource === 0) throw new ApiError(400, 'nothing', errors().nothing);
  const { row } = player;
  const wallet = walletOf(row);
  const held = wallet[building.resource] ?? 0;
  if (gold > wallet.gold) throw new ApiError(409, 'not_enough', filled(errors().notEnough, { have: goldText(wallet.gold) }));
  if (resource > held) throw new ApiError(409, 'not_enough', filled(errors().notEnough, { have: resourceText(building, held) }));
  const before = (await db.prepare('SELECT gold, resource FROM guild_seat WHERE guild_id = ? AND building_id = ?').bind(guild.id, building.id).first()) ?? { gold: 0, resource: 0 };
  const progress = seatProgress(before, content());
  if (!progress.next) throw new ApiError(409, 'top', errors().top);
  if (gold > progress.room.gold) throw tooMuch(progress.room.gold, words().goldGenitive, goldText(progress.room.gold));
  if (resource > progress.room.resource) {
    throw tooMuch(progress.room.resource, content().resourcesById[building.resource].genitive, resourceText(building, progress.room.resource));
  }
  const top = seatCostTo(rules().maxLevel, content());
  const onSeat = (column) => `COALESCE((SELECT ${column} FROM guild_seat WHERE guild_id = ? AND building_id = ?), 0)`;
  const taken = [gold > 0 && 'gold = gold - ?', resource > 0 && 'resources = json_set(resources, ?, COALESCE(json_extract(resources, ?), 0) - ?)'].filter(Boolean);
  const takenBinds = [...(gold > 0 ? [gold] : []), ...(resource > 0 ? [path(building.resource), path(building.resource), resource] : [])];
  await atomically(
    db,
    [
      assertion(
        db,
        `(SELECT gold FROM characters WHERE id = ?) >= ?
         AND COALESCE((SELECT json_extract(resources, ?) FROM characters WHERE id = ?), 0) >= ?
         AND EXISTS (SELECT 1 FROM guild_members WHERE character_id = ? AND guild_id = ?)
         AND ${onSeat('gold')} + ? <= ? AND ${onSeat('resource')} + ? <= ?`,
        [row.id, gold, path(building.resource), row.id, resource, row.id, guild.id, guild.id, building.id, gold, top.gold, guild.id, building.id, resource, top.resource],
      ),
      db.prepare(`UPDATE characters SET ${taken.join(', ')}, version = version + 1 WHERE id = ?`).bind(...takenBinds, row.id),
      db
        .prepare(
          `INSERT INTO guild_seat (guild_id, building_id, gold, resource) VALUES (?, ?, ?, ?)
           ON CONFLICT (guild_id, building_id) DO UPDATE SET gold = gold + excluded.gold, resource = resource + excluded.resource`,
        )
        .bind(guild.id, building.id, gold, resource),
    ],
    changed,
  );
  const after = await loadPlayer(db, session.userId);
  const view = await seatView(db, after, guild);
  const level = view.buildings.find((one) => one.id === building.id).level;
  const text = [filled(words().donated, { name: building.accusative, amounts: amountsText(building, gold, resource) }), level > progress.level && filled(words().raised, { name: building.name, level })]
    .filter(Boolean)
    .join(' ');
  return json({ ...view, text, character: characterView(after, context.now) });
}

// POST /api/guild/seat/prefer { buildingId, preferred }: the leader or a
// deputy marks a building as preferred, or takes the mark off, and the
// members see it; the only thing the leaders decide in the Siedziba (616 A).
// Saved only while the one who asks still leads or deputises in the guild.
export async function preferGuildSeat(context) {
  const { player, guild, db } = await requireMember(context, errors());
  if (guild.role === 'member') throw new ApiError(403, 'not_allowed', errors().notAllowed);
  const body = await readJson(context.request);
  const building = buildingOf(body);
  if (typeof body.preferred !== 'boolean') throw new ApiError(400, 'invalid_mark', errors().invalidMark);
  const marked = await db
    .prepare(
      `INSERT INTO guild_seat (guild_id, building_id, preferred)
       SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM guild_members WHERE character_id = ? AND guild_id = ? AND role IN ('leader', 'deputy'))
       ON CONFLICT (guild_id, building_id) DO UPDATE SET preferred = excluded.preferred`,
    )
    .bind(guild.id, building.id, body.preferred ? 1 : 0, player.row.id, guild.id)
    .run();
  if (marked.meta.changes !== 1) throw new ApiError(403, 'not_allowed', errors().notAllowed);
  return json({ ...(await seatView(db, player, guild)), text: filled(body.preferred ? words().preferredOn : words().preferredOff, { name: building.name }) });
}

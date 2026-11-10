// The Skrzynia Gildii (data/guilds.json `chest`; DECISIONS.md, "Skrzynia
// Gildii"; the author, 10.11.2026: „Wspólna skrzynia Gildii, w której można
// równocześnie zostawiać przedmioty bez przypisania do jakiegokolwiek
// gracza, zeby kazdy mogl wziąć lub z przypisaniem do konkretnego gracza w
// Gildii. Cel takiego rozwiązania to brak konieczności bycia online przez
// obydwu członków Gildii na raz.”): a member puts an item from its bag in
// the guild's chest "Dla wszystkich", for any member to take, or "Dla:" one
// member, for that one alone, and the one who put it may take it back while
// it waits. Up to `capacity` items in a guild's chest. What may go in is
// what the Skrzynia Konta (chest.js) and the Wymiana (trades.js) let move:
// an item of the bag, not worn, not on a rack of the Zbrojownia
// (requireOffRack), and not one a gem is being set in (by the character or
// by its Awatar, jewelcraft.js), since that work would set it in an item
// gone. An item keeps all its data (its upgrade, gem, rarity, Tier) and when
// it was made; the one who put it in takes it back as it was, any other
// character gets it marked as from a trade (data.traded), which its
// Encyklopedia leaves out, as a Wymiana's. Taking needs a place in the bag.
// The chest shows who put each item in, for whom and when, and its log the
// last `log` moves (who put or took what, and when). An item left for a
// member who leaves the guild is for all from then on, and a member who
// leaves no longer takes its own items back (chestReleased, in guildRemoval,
// guilds.js). A guild goes once its last member leaves, so the last member
// leaves only with the chest empty (lastLeavesEmpty, guilds.js: leaveGuild);
// the deletion of a character or an account, which ends a guild too,
// takes its chest and log with it (chestsGone).
//
// The guild that wins a war (guild-wars.js, 799 A) gets its war chest's
// items here, for all, from the war chest rather than from a member
// (`source` 'war'), and the log tells of them in the page's language.
//
// Every put and take is one batch with assertions at its head (atomic.js):
// the character as read, still in the guild, the item still in its bag or
// still in the chest, so two taps at once move an item once, and none is
// lost or doubled; a batch that fails on them changes nothing.

import { bagCapacity, campLevels, canUse, countedForm, itemName, itemView } from '../engine/index.js';
import { assertion, raced, sameVersion } from './atomic.js';
import { bagPlaces, characterView, loadPlayer, requireOffRack } from './characters.js';
import { content } from './content.js';
import { nameColorOf } from './cosmetics.js';
import { guildPlayer, requireMember } from './guild-trials.js';
import { withoutFavorites } from './favorites.js';
import { ApiError, json, readJson } from './http.js';
import { numberText } from './i18n.js';

const rules = () => content().guilds.chest;
const words = () => rules().texts;
const errors = () => words().errors;
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
const member = (context) => requireMember(context, errors());

// "50 przedmiotów", "50 ruchów": a number with its noun.
const counted = (count, forms) => `${numberText(count)} ${countedForm(count, forms)}`;
const capacityText = () => counted(rules().capacity, words().itemForms);
const changed = () => new ApiError(409, 'changed', errors().changed);

// An item's name as the bag shows it, its upgrade after it ("Miecz +3").
const titleOf = (item) => {
  const name = itemName(item, content());
  return item.upgrade > 0 ? `${name} +${item.upgrade}` : name;
};

// The card's words, with the rules' numbers filled in (all but the
// answers' errors).
function cardTexts() {
  const { errors: _, ...texts } = words();
  const vars = { capacity: capacityText(), log: counted(rules().log, texts.moveForms) };
  return { ...texts, how: texts.how.map((line) => filled(line, vars)), full: filled(texts.full, vars) };
}

// Whether a gem is being set in the item now, by the character or by its
// Awatar Systemu (jewelcraft.js: a setting's options name its item).
function inSetting(player, itemId) {
  return [player.activity, player.avatarActivity].some((work) => {
    if (work?.kind !== 'jewels') return false;
    const options = JSON.parse(work.options ?? '{}');
    return options.set === true && options.item === itemId;
  });
}

// SQL for the member an item of the chest (`c`) waits for: its for_id
// while that character is in the guild, else NULL, for all.
const FOR_MEMBER = 'CASE WHEN EXISTS (SELECT 1 FROM guild_members fm WHERE fm.character_id = c.for_id AND fm.guild_id = c.guild_id) THEN c.for_id END';

// The statements that keep the log of a guild's chest to its last `log`
// moves, for the batch that adds one.
const logKept = (db, guildId) =>
  db
    .prepare('DELETE FROM guild_chest_log WHERE guild_id = ? AND id NOT IN (SELECT id FROM guild_chest_log WHERE guild_id = ? ORDER BY id DESC LIMIT ?)')
    .bind(guildId, guildId, rules().log);

// The chest for the page: its items, those waiting for this character
// first, then those for all, then those for others, the newest first in
// each, each with its card's view, who put it in (the name it has now while
// still in the guild, else the one it had then), for whom, when, and
// whether this character may take it; the guild's other members to leave
// an item for; the log of the last moves; the bag's items a gem is being
// set in (no "Włóż" for them); the rules and the words.
export async function chestView(db, player, guild) {
  const { row } = player;
  const [items, log, members] = await db.batch([
    db
      .prepare(
        `SELECT c.id, c.data, c.put_by, c.put_by_name, c.put_at, c.source, p.name AS put_by_now, ${FOR_MEMBER} AS for_member, f.name AS for_name
         FROM guild_chest c
         LEFT JOIN guild_members pm ON pm.character_id = c.put_by AND pm.guild_id = c.guild_id
         LEFT JOIN characters p ON p.id = pm.character_id
         LEFT JOIN characters f ON f.id = c.for_id
         WHERE c.guild_id = ? ORDER BY c.id DESC`,
      )
      .bind(guild.id),
    db.prepare('SELECT id, kind, name, for_name, data, created_at FROM guild_chest_log WHERE guild_id = ? ORDER BY id DESC LIMIT ?').bind(guild.id, rules().log),
    db
      .prepare(
        `SELECT c.id, c.name, c.class_id, c.level, c.cosmetics FROM guild_members m JOIN characters c ON c.id = m.character_id
         WHERE m.guild_id = ? AND m.character_id != ? ORDER BY c.name_key, c.id`,
      )
      .bind(guild.id, row.id),
  ]);
  const rank = (entry) => (entry.forYou ? 0 : entry.forName === null ? 1 : 2);
  const entries = items.results.map((stored) => {
    const item = JSON.parse(stored.data);
    const view = itemView(item, content());
    const mine = stored.put_by === row.id;
    const forYou = stored.for_member === row.id;
    return {
      ...view,
      id: stored.id,
      from: stored.source === 'war' ? words().fromWar : (stored.put_by_now ?? stored.put_by_name),
      // Put in by this character: it takes it back as it was.
      own: mine,
      forName: stored.for_member === null ? null : stored.for_name,
      forYou,
      putAt: stored.put_at,
      canTake: stored.for_member === null || forYou || mine,
      // Its class can wear it, and from which level of the class.
      usable: canUse(item.base, row.class_id, content()),
      wornFrom: view.classLevel,
    };
  });
  entries.sort((a, b) => rank(a) - rank(b) || b.putAt - a.putAt || b.id - a.id);
  return {
    guild: { name: guild.name, tag: guild.tag },
    capacity: rules().capacity,
    count: entries.length,
    waiting: entries.filter((entry) => entry.forYou).length,
    items: entries,
    members: members.results.map((one) => ({ id: one.id, name: one.name, classId: one.class_id, level: one.level, nameColor: nameColorOf(one.cosmetics) })),
    log: log.results.map((move) => {
      const item = JSON.parse(move.data);
      const rarity = content().raritiesById[item.rarity];
      return { id: move.id, kind: move.kind, name: move.name, forName: move.for_name, at: move.created_at, item: { name: titleOf(item), color: rarity?.color ?? null, base: item.base } };
    }),
    setting: player.items.filter((item) => !item.equippedSlot && inSetting(player, item.id)).map((item) => item.id),
    texts: cardTexts(),
  };
}

const answer = async (db, player, guild, extra = {}) => json({ ...(await chestView(db, player, guild)), ...extra });

// Whether an item waits in the guild's chest for this character, for the
// yellow dot of the Gildia's "Skrzynia" (guild-todo.js).
export async function chestWaiting(db, characterId, guildId) {
  const row = await db.prepare('SELECT 1 AS waiting FROM guild_chest WHERE guild_id = ? AND for_id = ? LIMIT 1').bind(guildId, characterId).first();
  return Boolean(row);
}

// GET /api/guild/chest: outside a guild, only the card's words (as the
// Wymiana's).
export async function getGuildChest(context) {
  const { player, guild, db } = await guildPlayer(context, errors());
  if (!guild) return json({ guild: null, texts: cardTexts() });
  return answer(db, player, guild);
}

// Runs a batch of the chest; one that fails on its assertions answers
// `explain()`, which reads again what changed.
async function guarded(db, statements, explain) {
  try {
    return await db.batch(statements);
  } catch (error) {
    if (raced(error)) throw await explain();
    throw error;
  }
}

// POST /api/guild/chest/put { itemId, forId }: an item of the bag into the
// guild's chest, for all (`forId` null or left out) or for one other member
// of the guild, while the chest has room. The batch holds only while the
// character is as read and in the guild, the chest has room, the item is
// still in the bag and the member still in the guild: it copies the item's
// row as stored into the chest and the log, then takes it from the bag.
export async function putInGuildChest(context) {
  const { session, player, guild, db } = await member(context);
  const { row } = player;
  const now = context.now;
  const body = await readJson(context.request);
  const item = player.items.find((candidate) => candidate.id === body.itemId);
  if (!item) throw new ApiError(404, 'item_not_found', errors().noItem);
  if (item.equippedSlot) throw new ApiError(409, 'equipped', errors().worn);
  requireOffRack(player, item);
  if (inSetting(player, item.id)) throw new ApiError(409, 'setting_under_way', errors().setting);
  let forMember = null;
  if (body.forId !== undefined && body.forId !== null) {
    if (!Number.isInteger(body.forId)) throw new ApiError(400, 'invalid_member', errors().noMember);
    if (body.forId === row.id) throw new ApiError(400, 'self', errors().self);
    forMember = await db
      .prepare('SELECT c.id, c.name FROM guild_members m JOIN characters c ON c.id = m.character_id WHERE m.guild_id = ? AND m.character_id = ?')
      .bind(guild.id, body.forId)
      .first();
    if (!forMember) throw new ApiError(404, 'no_member', errors().noMember);
  }
  const { capacity } = rules();
  const full = () => new ApiError(409, 'chest_full', filled(errors().full, { capacity: capacityText() }));
  const stored = await db.prepare('SELECT COUNT(*) AS count FROM guild_chest WHERE guild_id = ?').bind(guild.id).first();
  if (stored.count >= capacity) throw full();
  const forId = forMember?.id ?? null;
  await guarded(
    db,
    [
      sameVersion(db, row),
      assertion(
        db,
        `EXISTS (SELECT 1 FROM guild_members WHERE character_id = ? AND guild_id = ?)
         AND (SELECT COUNT(*) FROM guild_chest WHERE guild_id = ?) < ?
         AND EXISTS (SELECT 1 FROM items WHERE id = ? AND character_id = ? AND slot IS NULL)
         AND (? IS NULL OR EXISTS (SELECT 1 FROM guild_members WHERE character_id = ? AND guild_id = ?))`,
        [row.id, guild.id, guild.id, capacity, item.id, row.id, forId, forId, guild.id],
      ),
      db
        .prepare(
          `INSERT INTO guild_chest (guild_id, data, created_at, put_by, put_by_name, for_id, put_at)
           SELECT ?, data, created_at, ?, ?, ?, ? FROM items WHERE id = ? AND character_id = ? AND slot IS NULL`,
        )
        .bind(guild.id, row.id, row.name, forId, now, item.id, row.id),
      db
        .prepare("INSERT INTO guild_chest_log (guild_id, kind, name, for_name, data, created_at) SELECT ?, 'put', ?, ?, data, ? FROM items WHERE id = ? AND character_id = ? AND slot IS NULL")
        .bind(guild.id, row.name, forMember?.name ?? null, now, item.id, row.id),
      db.prepare('DELETE FROM items WHERE id = ? AND character_id = ? AND slot IS NULL').bind(item.id, row.id),
      // A favourite no longer, once in the chest (favorites.js), as in the
      // Skrzynia Konta: it comes out as an item without the star.
      db.prepare(`UPDATE characters SET favorites = ${withoutFavorites}, version = version + 1 WHERE id = ?`).bind(JSON.stringify([item.id]), row.id),
      logKept(db, guild.id),
    ],
    async () => {
      const [inBag, count, still] = await db.batch([
        db.prepare('SELECT 1 AS here FROM items WHERE id = ? AND character_id = ? AND slot IS NULL').bind(item.id, row.id),
        db.prepare('SELECT COUNT(*) AS count FROM guild_chest WHERE guild_id = ?').bind(guild.id),
        db.prepare('SELECT 1 AS here FROM guild_members WHERE character_id = ? AND guild_id = ?').bind(forId ?? 0, guild.id),
      ]);
      if (!inBag.results[0]) return new ApiError(404, 'item_not_found', errors().noItem);
      if (count.results[0].count >= capacity) return full();
      if (forId !== null && !still.results[0]) return new ApiError(404, 'no_member', errors().noMember);
      return changed();
    },
  );
  const after = await loadPlayer(db, session.userId);
  return answer(db, after, guild, { character: characterView(after, now), text: filled(words().putDone, { item: titleOf(item) }) });
}

// POST /api/guild/chest/take { id }: an item of the guild's chest into the
// bag, while the bag has a place: one for all, one for this character, or
// one it put in itself (taken back as it was; to any other it comes as
// from a trade). The batch holds only while the character is as read and
// in the guild, and the item still in the chest and still its to take.
export async function takeFromGuildChest(context) {
  const { session, player, guild, db } = await member(context);
  const { row } = player;
  const now = context.now;
  const body = await readJson(context.request);
  const stored = Number.isInteger(body.id)
    ? await db
        .prepare(`SELECT c.id, c.data, c.put_by, ${FOR_MEMBER} AS for_member, f.name AS for_name FROM guild_chest c LEFT JOIN characters f ON f.id = c.for_id WHERE c.id = ? AND c.guild_id = ?`)
        .bind(body.id, guild.id)
        .first()
    : null;
  if (!stored) throw new ApiError(404, 'not_in_chest', errors().gone);
  if (stored.for_member !== null && stored.for_member !== row.id && stored.put_by !== row.id) {
    throw new ApiError(403, 'not_yours', filled(errors().notYours, { name: stored.for_name }));
  }
  if (bagPlaces(player) >= bagCapacity(campLevels(player.buildings, now, content()), content())) throw new ApiError(409, 'bag_full', errors().bagFull);
  const item = JSON.parse(stored.data);
  await guarded(
    db,
    [
      sameVersion(db, row),
      assertion(
        db,
        `EXISTS (SELECT 1 FROM guild_members WHERE character_id = ? AND guild_id = ?)
         AND EXISTS (SELECT 1 FROM guild_chest c WHERE c.id = ? AND c.guild_id = ? AND (c.put_by = ? OR COALESCE(${FOR_MEMBER}, ?) = ?))`,
        [row.id, guild.id, stored.id, guild.id, row.id, row.id, row.id],
      ),
      db
        .prepare("INSERT INTO guild_chest_log (guild_id, kind, name, for_name, data, created_at) SELECT guild_id, 'take', ?, NULL, data, ? FROM guild_chest WHERE id = ? AND guild_id = ?")
        .bind(row.name, now, stored.id, guild.id),
      db
        .prepare(
          `INSERT INTO items (character_id, slot, data, created_at)
           SELECT ?, NULL, CASE WHEN put_by = ? THEN data ELSE json_set(data, '$.traded', 1) END, created_at FROM guild_chest WHERE id = ? AND guild_id = ?`,
        )
        .bind(row.id, row.id, stored.id, guild.id),
      db.prepare('DELETE FROM guild_chest WHERE id = ? AND guild_id = ?').bind(stored.id, guild.id),
      db.prepare('UPDATE characters SET version = version + 1 WHERE id = ?').bind(row.id),
      logKept(db, guild.id),
    ],
    async () => {
      const still = await db.prepare('SELECT 1 AS here FROM guild_chest WHERE id = ? AND guild_id = ?').bind(stored.id, guild.id).first();
      return still ? changed() : new ApiError(404, 'not_in_chest', errors().gone);
    },
  );
  const after = await loadPlayer(db, session.userId);
  return answer(db, after, guild, { character: characterView(after, now), text: filled(words().takeDone, { item: titleOf(item) }) });
}

// The statements that put a war chest's items (guild-wars.js, 799 A) in the
// chest of the guild that won the war, for all, from the war chest, while
// the guild is there; past the chest's capacity too, as nothing of a reward
// may be lost (the capacity holds back only the members' own items). Each
// is a move of the log, and the log keeps its last `log` moves.
export function warChestStatements(db, guildId, items, now) {
  if (items.length === 0) return [];
  const there = 'EXISTS (SELECT 1 FROM guilds WHERE id = ?)';
  return [
    ...items.flatMap((item) => [
      db
        .prepare(`INSERT INTO guild_chest (guild_id, data, created_at, put_by, put_by_name, for_id, put_at, source) SELECT ?, ?, ?, NULL, '', NULL, ?, 'war' WHERE ${there}`)
        .bind(guildId, JSON.stringify(item), now, now, guildId),
      db.prepare(`INSERT INTO guild_chest_log (guild_id, kind, name, for_name, data, created_at) SELECT ?, 'war', '', NULL, ?, ? WHERE ${there}`).bind(guildId, JSON.stringify(item), now, guildId),
    ]),
    logKept(db, guildId),
  ];
}

// The assertion, at the head of the batch that takes a character out of
// its guild (guilds.js: leaveGuild), that the guild keeps another member or
// its chest is empty: a guild nobody is in goes, and its chest with it, so
// the last member leaves only an empty chest (the simplest safe rule: no
// item is lost; a removal by the leader always leaves the leader in).
export const lastLeavesEmpty = (db, guildId, characterId) =>
  assertion(db, 'EXISTS (SELECT 1 FROM guild_members WHERE guild_id = ? AND character_id != ?) OR NOT EXISTS (SELECT 1 FROM guild_chest WHERE guild_id = ?)', [
    guildId,
    characterId,
    guildId,
  ]);

// The words of the refusal of lastLeavesEmpty.
export const lastLeavesEmptyError = () => new ApiError(409, 'chest_not_empty', errors().leave);

// The statements for characters leaving their guilds (`characters`: SQL
// for their ids, with `binds`; guildRemoval, guilds.js): the items left for
// them are for all from now on, and those they put in are no longer theirs
// to take back.
export const chestReleased = (db, characters, binds) => [
  db.prepare(`UPDATE guild_chest SET for_id = NULL WHERE for_id IN (${characters})`).bind(...binds),
  db.prepare(`UPDATE guild_chest SET put_by = NULL WHERE put_by IN (${characters})`).bind(...binds),
];

// The statements that take the chests and logs of the guilds nobody is in
// any more, after guildRemoval took its characters out.
export const chestsGone = (db) => [
  db.prepare('DELETE FROM guild_chest WHERE guild_id NOT IN (SELECT guild_id FROM guild_members)'),
  db.prepare('DELETE FROM guild_chest_log WHERE guild_id NOT IN (SELECT guild_id FROM guild_members)'),
];

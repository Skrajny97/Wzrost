// The players' Gildie (data/guilds.json; DECISIONS.md, "Wieże Systemu i
// Gildia"; the author: "307 A, ale za 1000 złota"): a guild with a name and
// a tag, up to `size` characters, a leader and deputies, and its own chat
// channel (chat.js, "guild"). A character from the founding level founds
// one for its gold; any character with the Społeczność joins one that
// invites it, by its leader or a deputy. One guild for a character. The
// leader names and unnames deputies and hands the lead over; a deputy
// invites and removes members, the leader anyone. A leader who leaves
// passes the lead to the first deputy, else to the member there longest,
// and a guild nobody is in goes with its invitations, its channel, its
// Siedziba (guild-seat.js) and its Skrzynia (guild-chest.js), so its last
// member leaves only with the Skrzynia empty. A guild holds up to 30
// characters from the guild wars on (793 A: six teams of five,
// guild-wars.js). A
// character that leaves or is removed gets back the pieces of its open
// offers in the Wymiana (guild-exchange.js) at once. The best guild of last
// week says so on its page (guild-fame.js).

import { alphabetOf, alphabetsOf, blockedName, isUnlocked, joinShare, nameLook, questPeriod, trialDay } from '../engine/index.js';
import { assertion, atomically, sameVersion } from './atomic.js';
import { characterView, loadPlayer, requirePlayer } from './characters.js';
import { content } from './content.js';
import { nameColorOf } from './cosmetics.js';
import { chestReleased, chestsGone, lastLeavesEmpty, lastLeavesEmptyError } from './guild-chest.js';
import { offersReturned, settleOffers } from './guild-exchange.js';
import { championFrom, championOf, championStatement } from './guild-fame.js';
import { ApiError, json, readJson } from './http.js';
import { t } from './i18n.js';
import { joinGuildTrials } from './guild-trials.js';
import { beastJoin } from './guild-beast.js';
import { OWN_CHARACTERS } from './roles.js';

const rules = () => content().guilds;
const ROLES = { leader: 'lider', deputy: 'zastępca', member: 'członek' };

// The chat channel of a guild (chat.js).
export const guildChannel = (guildId) => `guild:${guildId}`;

// SQL for the tag of the guild of the character whose id `column` holds, or
// NULL: shown in square brackets beside its name in the chat, the Ranking,
// the Znajomi, the Drużyna and on its card (the author: "koło nicka na
// czacie ogólnym i wszędzie powinien wyśiwetlać sie tez skrót nazwy Gildii
// [....] w kwadratowym nawiasie").
export const guildTagSql = (column) => `(SELECT g.tag FROM guild_members gm JOIN guilds g ON g.id = gm.guild_id WHERE gm.character_id = ${column})`;

async function requireGuildPlayer(context) {
  const found = await requirePlayer(context);
  if (!isUnlocked('community', found.player.row.level, content())) {
    throw new ApiError(403, 'locked', `Gildie odblokujesz na poziomie postaci ${content().unlocksById.community.level}.`);
  }
  return found;
}

// The guild a character is in: its id, name, tag and the character's role,
// or null. A membership whose guild is gone goes too.
export async function guildOf(db, characterId) {
  const row = await db
    .prepare('SELECT m.guild_id, m.role, g.name, g.tag FROM guild_members m LEFT JOIN guilds g ON g.id = m.guild_id WHERE m.character_id = ?')
    .bind(characterId)
    .first();
  if (!row) return null;
  if (row.name === null) {
    await db.prepare('DELETE FROM guild_members WHERE character_id = ? AND guild_id = ?').bind(characterId, row.guild_id).run();
    return null;
  }
  return { id: row.guild_id, name: row.name, tag: row.tag, role: row.role };
}

// The Gildia for the page: the guild with its members (the leader first,
// then the deputies, each in the order they joined) and the invitations it
// sent, the invitations waiting for this character, and the rules of
// founding one. The leader and the deputies get the friends they may
// invite at a tap, those in no guild and not invited yet (the author: "Do
// Gildii tez powinna być opcja zapraszania z pozycji ekranu Gildii").
// `champion`: whether the guild was the best of last week (380 C).
export async function guildView(db, characterId, now) {
  const guild = await guildOf(db, characterId);
  // A character in a guild has no invitations: any left from before go
  // (the author, 7.11.2026: "Niech zaproszenia do gildii nie wyswietlaja
  // sie osobom które już w jakiejś są").
  if (guild) await db.prepare('DELETE FROM guild_invites WHERE character_id = ?').bind(characterId).run();
  const inviting = guild !== null && guild.role !== 'member';
  const [members, sent, invites, friends, best] = await db.batch([
    db
      .prepare(
        `SELECT c.id, c.name, c.class_id, c.level, c.role AS played, c.cosmetics, m.role, u.seen_at
         FROM guild_members m JOIN characters c ON c.id = m.character_id JOIN users u ON u.id = c.user_id
         WHERE m.guild_id = ? ORDER BY CASE m.role WHEN 'leader' THEN 0 WHEN 'deputy' THEN 1 ELSE 2 END, m.joined_at, m.character_id`,
      )
      .bind(guild?.id ?? 0),
    db.prepare('SELECT c.id, c.name FROM guild_invites i JOIN characters c ON c.id = i.character_id WHERE i.guild_id = ? ORDER BY i.created_at').bind(guild?.id ?? 0),
    db
      .prepare(
        `SELECT i.guild_id, i.created_at, g.name, g.tag, b.name AS invited_by,
                (SELECT COUNT(*) FROM guild_members m WHERE m.guild_id = i.guild_id) AS members
         FROM guild_invites i JOIN guilds g ON g.id = i.guild_id JOIN characters b ON b.id = i.invited_by
         WHERE i.character_id = ? ORDER BY i.created_at DESC`,
      )
      .bind(characterId),
    db
      .prepare(
        `SELECT o.id, o.name, o.class_id, o.level, o.role AS played, o.cosmetics, u.seen_at
         FROM friends f JOIN characters o ON o.id = CASE WHEN f.character_id = ? THEN f.friend_id ELSE f.character_id END JOIN users u ON u.id = o.user_id
         WHERE (f.character_id = ? OR f.friend_id = ?) AND f.accepted_at IS NOT NULL AND ? AND o.${OWN_CHARACTERS}
           AND NOT EXISTS (SELECT 1 FROM guild_members m WHERE m.character_id = o.id)
           AND NOT EXISTS (SELECT 1 FROM guild_invites i WHERE i.character_id = o.id AND i.guild_id = ?)
         ORDER BY o.name`,
      )
      .bind(characterId, characterId, characterId, inviting ? 1 : 0, guild?.id ?? 0),
    championStatement(db, now),
  ]);
  const { onlineSeconds } = content().community.trade;
  const online = (row) => row.played === 'player' && (row.seen_at ?? 0) >= now - onlineSeconds * 1000;
  const { found, size, name, tag } = rules();
  return {
    guild: guild && {
      id: guild.id,
      name: guild.name,
      tag: guild.tag,
      size,
      role: guild.role,
      champion: championFrom(best.results[0])?.id === guild.id,
      members: members.results.map((row) => ({
        id: row.id,
        name: row.name,
        // Its name in its frame's colour, or null (cosmetics.js).
        nameColor: nameColorOf(row.cosmetics),
        classId: row.class_id,
        level: row.level,
        role: row.role,
        roleName: t(ROLES[row.role] ?? ROLES.member),
        own: row.id === characterId,
        online: online(row),
      })),
      invited: sent.results.map((row) => ({ id: row.id, name: row.name })),
      friends: friends.results.map((row) => ({ id: row.id, name: row.name, nameColor: nameColorOf(row.cosmetics), classId: row.class_id, level: row.level, online: online(row) })),
    },
    invites: invites.results.map((row) => ({ guildId: row.guild_id, name: row.name, tag: row.tag, invitedBy: row.invited_by, members: row.members, at: row.created_at })),
    rules: { foundLevel: found.level, foundGold: found.gold, size, name, tag },
  };
}

const answer = async (db, characterId, now, extra = {}) => json({ ...(await guildView(db, characterId, now)), ...extra });

// GET /api/guild: the character's offers in the Wymiana whose time is up
// give their pieces back first (guild-exchange.js), and the character comes
// with the answer when they did. The first look of a new week freezes the
// Sława of the week before (guild-fame.js).
export async function getGuild(context) {
  const { session, player } = await requireGuildPlayer(context);
  const db = context.env.DB;
  await championOf(db, context.now);
  const settled = await settleOffers(db, player.row.id, context.now);
  return answer(db, player.row.id, context.now, settled ? { character: characterView(await loadPlayer(db, session.userId), context.now) } : {});
}

// A guild's name from a request: letters, digits, spaces, hyphens and
// apostrophes, starting and ending with a letter or a digit, of the length
// the rules allow, and past the filter of the characters' names. As in a
// character's name (characters.js validateName; the security review of
// 12.11.2026), wide or mathematical letters become plain ones, and the
// letters come from one alphabet: Latin, Greek or Cyrillic.
function guildName(value) {
  const { min, max } = rules().name;
  const text = typeof value === 'string' ? value.normalize('NFKC').replace(/\p{Cf}/gu, '').trim().replace(/\s+/g, ' ').replace(/[‘’ʼ]/g, "'") : '';
  const length = [...text].length;
  if (length < min || length > max) throw new ApiError(400, 'invalid_name', `Nazwa gildii musi mieć od ${min} do ${max} znaków.`);
  const allowed = [...text].every((sign) => /^[0-9 '-]$/.test(sign) || alphabetOf(sign) !== null);
  if (!allowed || !/^[\p{L}0-9](?:.*[\p{L}0-9])?$/u.test(text) || alphabetsOf(text).size > 1) {
    throw new ApiError(400, 'invalid_name', 'Nazwa gildii może mieć litery jednego alfabetu (łacińskiego, greckiego albo cyrylicy), cyfry, spacje, łączniki i apostrofy, a zaczynać i kończyć się literą albo cyfrą.');
  }
  if (blockedName(text, content())) throw new ApiError(400, 'invalid_name', 'Ta nazwa łamie zasady. Wybierz inną.');
  return text;
}

// A guild's tag: letters of one alphabet and digits, kept in capitals.
function guildTag(value) {
  const { min, max } = rules().tag;
  const text = typeof value === 'string' ? value.normalize('NFKC').trim().toLocaleUpperCase('pl-PL') : '';
  const signs = [...text];
  const allowed = signs.every((sign) => /^[0-9]$/.test(sign) || (alphabetOf(sign) !== null && /^\p{Lu}$/u.test(sign)));
  if (signs.length < min || signs.length > max || !allowed || alphabetsOf(text).size > 1) {
    throw new ApiError(400, 'invalid_tag', `Skrót gildii to od ${min} do ${max} liter albo cyfr.`);
  }
  if (blockedName(text, content())) throw new ApiError(400, 'invalid_tag', 'Ten skrót łamie zasady. Wybierz inny.');
  return text;
}

// POST /api/guild/found { name, tag }: the character founds a guild for
// the gold of the rules and becomes its leader; its invitations go.
export async function foundGuild(context) {
  const { session, player } = await requireGuildPlayer(context);
  const { row } = player;
  const db = context.env.DB;
  const body = await readJson(context.request);
  const { found } = rules();
  if (row.level < found.level) throw new ApiError(403, 'level', `Gildię założysz od ${found.level}. poziomu postaci.`);
  if (await guildOf(db, row.id)) throw new ApiError(409, 'in_guild', 'Najpierw opuść swoją gildię.');
  const name = guildName(body.name);
  const tag = guildTag(body.tag);
  if (row.gold < found.gold) throw new ApiError(409, 'no_gold', `Założenie gildii kosztuje ${found.gold} złota.`);
  // A name or a tag looking like another guild's counts as it (names.js
  // nameLook): the same letters but for some of another alphabet.
  const nameKeys = [...new Set([name.toLowerCase(), nameLook(name)])];
  const tags = [...new Set([tag, nameLook(tag).toLocaleUpperCase('pl-PL')])];
  const taken = await db
    .prepare(
      `SELECT name_key IN (${nameKeys.map(() => '?').join(', ')}) AS name, tag IN (${tags.map(() => '?').join(', ')}) AS tag FROM guilds
       WHERE name_key IN (${nameKeys.map(() => '?').join(', ')}) OR tag IN (${tags.map(() => '?').join(', ')}) LIMIT 1`,
    )
    .bind(...nameKeys, ...tags, ...nameKeys, ...tags)
    .first();
  if (taken?.name) throw new ApiError(409, 'name_taken', 'Gildia o tej nazwie już istnieje.');
  if (taken?.tag) throw new ApiError(409, 'tag_taken', 'Gildia z tym skrótem już istnieje.');
  try {
    await atomically(db, [
      sameVersion(db, row),
      db.prepare('UPDATE characters SET gold = gold - ?, version = version + 1 WHERE id = ?').bind(found.gold, row.id),
      db.prepare('INSERT INTO guilds (name, name_key, tag, created_at) VALUES (?, ?, ?, ?)').bind(name, name.toLowerCase(), tag, context.now),
      db.prepare("INSERT INTO guild_members (character_id, guild_id, role, joined_at) VALUES (?, last_insert_rowid(), 'leader', ?)").bind(row.id, context.now),
      db.prepare('DELETE FROM guild_invites WHERE character_id = ?').bind(row.id),
    ]);
  } catch (error) {
    const text = String(error?.message ?? error);
    if (/UNIQUE/.test(text) && /guild_members/.test(text)) throw new ApiError(409, 'in_guild', 'Najpierw opuść swoją gildię.');
    if (/UNIQUE/.test(text)) throw new ApiError(409, 'name_taken', 'Gildia o tej nazwie albo z tym skrótem już istnieje.');
    throw error;
  }
  const after = await loadPlayer(db, session.userId);
  return answer(db, row.id, context.now, { text: t('Gildia {name} [{tag}] założona.', { name, tag }), character: characterView(after, context.now) });
}

// The assertion heading a change of a guild: each character (`members`,
// [id, roles]) still in the guild with one of the roles it was read with,
// so a change read before another one landed saves nothing (the code
// review, 0.2.72: two hand-overs of the lead at once made two leaders, a
// removal read before a deputy lost its role still went through, and a
// removal with a leave at once ended a guild with items in its chest).
function stillAsRead(db, guildId, members) {
  return assertion(
    db,
    members.map(([, roles]) => `EXISTS (SELECT 1 FROM guild_members WHERE guild_id = ? AND character_id = ? AND role IN (${roles.map(() => '?').join(', ')}))`).join(' AND '),
    members.flatMap(([id, roles]) => [guildId, id, ...roles]),
  );
}

const guildChanged = () => new ApiError(409, 'guild_changed', 'Gildia zmieniła się w międzyczasie. Spróbuj jeszcze raz.');

// The guild of the one who asks, with its role in it, or an error.
async function ownGuild(db, characterId, roles = ['leader', 'deputy', 'member']) {
  const guild = await guildOf(db, characterId);
  if (!guild) throw new ApiError(409, 'no_guild', 'Nie należysz do gildii.');
  if (!roles.includes(guild.role)) throw new ApiError(403, 'not_allowed', roles.includes('deputy') ? 'Może to zrobić lider albo zastępca.' : 'Może to zrobić tylko lider.');
  return guild;
}

// What stops a guild's next invitation: the guild full, or as many
// invitations waiting as it may have. Null when one more fits.
async function inviteRefusal(db, guildId) {
  const [members, waiting] = await db.batch([
    db.prepare('SELECT COUNT(*) AS count FROM guild_members WHERE guild_id = ?').bind(guildId),
    db.prepare('SELECT COUNT(*) AS count FROM guild_invites WHERE guild_id = ?').bind(guildId),
  ]);
  if (members.results[0].count >= rules().size) return new ApiError(409, 'full', `Gildia jest pełna: ${rules().size} postaci.`);
  if (waiting.results[0].count >= rules().invites) return new ApiError(409, 'too_many_invites', `Na odpowiedź czeka już ${rules().invites} zaproszeń.`);
  return null;
}

// POST /api/guild/invite { name }: the leader or a deputy invites a
// character by its name: another player's, with the Społeczność, not in a
// guild, and not one whose player hid the inviting one's in the chat. The
// members and the invitations are counted in the write too, so two
// invitations sent at the same moment never take the guild past either cap
// (the code review: both were counted before either was written).
export async function inviteToGuild(context) {
  const { session, player } = await requireGuildPlayer(context);
  const db = context.env.DB;
  const body = await readJson(context.request);
  const guild = await ownGuild(db, player.row.id, ['leader', 'deputy']);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) throw new ApiError(400, 'no_name', 'Wpisz imię postaci.');
  const target = await db.prepare(`SELECT id, user_id, name, level FROM characters WHERE name_key = ? AND ${OWN_CHARACTERS}`).bind(name.toLowerCase()).first();
  if (!target) throw new ApiError(404, 'no_character', 'Nie ma takiej postaci.');
  if (target.user_id === session.userId) throw new ApiError(400, 'own', `${target.name} to Twoja postać. Swoich postaci nie zaprosisz.`);
  if (!isUnlocked('community', target.level, content())) throw new ApiError(409, 'target_locked', `${target.name} nie ma jeszcze Społeczności.`);
  const blocked = await db
    .prepare('SELECT 1 FROM chat_blocks WHERE (user_id = ? AND blocked_id = ?) OR (user_id = ? AND blocked_id = ?)')
    .bind(target.user_id, session.userId, session.userId, target.user_id)
    .first();
  if (blocked) throw new ApiError(409, 'blocked', `${target.name} nie przyjmuje teraz zaproszeń od Ciebie.`);
  if (await guildOf(db, target.id)) throw new ApiError(409, 'in_guild', `${target.name} jest już w gildii.`);
  const refused = await inviteRefusal(db, guild.id);
  if (refused) throw refused;
  const [, invited] = await atomically(
    db,
    [
      stillAsRead(db, guild.id, [[player.row.id, ['leader', 'deputy']]]),
      db
        .prepare(
          `INSERT OR IGNORE INTO guild_invites (guild_id, character_id, invited_by, created_at)
           SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM guild_members WHERE guild_id = ?) < ? AND (SELECT COUNT(*) FROM guild_invites WHERE guild_id = ?) < ?`,
        )
        .bind(guild.id, target.id, player.row.id, context.now, guild.id, rules().size, guild.id, rules().invites),
    ],
    guildChanged,
  );
  // Not written: an invitation of the character waits already (as before,
  // the leader hears it went), or another sent meanwhile filled a cap.
  if (invited.meta.changes !== 1 && !(await db.prepare('SELECT 1 AS waiting FROM guild_invites WHERE guild_id = ? AND character_id = ?').bind(guild.id, target.id).first())) {
    throw (await inviteRefusal(db, guild.id)) ?? guildChanged();
  }
  return answer(db, player.row.id, context.now, { text: t('Zaproszenie wysłane. {name} przyjmie je w Społeczności, w Gildii.', { name: target.name }) });
}

function guildIdOf(body) {
  if (!Number.isInteger(body.guildId) || body.guildId < 1) throw new ApiError(400, 'invalid_guild', 'Nie ma takiej gildii.');
  return body.guildId;
}

// The statement that counts a character who has just joined a guild (at
// `now`, its joined_at) among the members of the week on the guild's Próby
// board or Wyprawa route (`table`) made already: its share of the week left
// joins `joined` and its id `counted`, unless the week counts it already
// (active when the board or route came, or joined before and left since), so
// leaving and joining again raises the week's thresholds, stages and
// guardians once at most.
function weekJoin(db, table, guildId, characterId, now) {
  return db
    .prepare(
      `UPDATE ${table} SET joined = joined + ?, counted = json_insert(counted, '$[#]', ?)
       WHERE guild_id = ? AND week = ? AND EXISTS (SELECT 1 FROM guild_members WHERE character_id = ? AND guild_id = ? AND joined_at = ?)
         AND NOT EXISTS (SELECT 1 FROM json_each(${table}.counted) WHERE value = ?)`,
    )
    .bind(joinShare(trialDay(now, content())), characterId, guildId, questPeriod('weekly', now, content()).key, characterId, guildId, now, characterId);
}

// POST /api/guild/accept { guildId }: joins the guild that invited this
// character, while it has a place; the character's other invitations go.
// Joined after the guild's board of the week was drawn, it raises the
// week's thresholds of the Próby Gildii by its share of the week left, in
// the same batch (the author's 615 A), and so the Wyprawa Gildii's route of
// the week, made already, its stages and guardians to come (621 A); not
// again for a character the week counts already (weekJoin).
export async function acceptGuildInvite(context) {
  const { player } = await requireGuildPlayer(context);
  const db = context.env.DB;
  const body = await readJson(context.request);
  const invite = await db.prepare('SELECT guild_id FROM guild_invites WHERE guild_id = ? AND character_id = ?').bind(guildIdOf(body), player.row.id).first();
  if (!invite) throw new ApiError(404, 'no_invite', 'Tego zaproszenia już nie ma.');
  if (await guildOf(db, player.row.id)) throw new ApiError(409, 'in_guild', 'Najpierw opuść swoją gildię.');
  // The Bestia Gildii of the week, made already, grows for the member too.
  const beast = await beastJoin(db, invite.guild_id, player.row.id, context.now);
  let joined;
  try {
    [joined] = await db.batch([
      db
        .prepare(
          `INSERT INTO guild_members (character_id, guild_id, role, joined_at)
           SELECT ?, ?, 'member', ? WHERE EXISTS (SELECT 1 FROM guilds WHERE id = ?) AND (SELECT COUNT(*) FROM guild_members WHERE guild_id = ?) < ?`,
        )
        .bind(player.row.id, invite.guild_id, context.now, invite.guild_id, invite.guild_id, rules().size),
      weekJoin(db, 'guild_trial_boards', invite.guild_id, player.row.id, context.now),
      // The Wyprawa Gildii's route of the week counts it in part too: its
      // next stages take more minutes and its next guardians more HP.
      weekJoin(db, 'guild_expeditions', invite.guild_id, player.row.id, context.now),
      ...beast,
    ]);
  } catch {
    throw new ApiError(409, 'in_guild', 'Najpierw opuść swoją gildię.');
  }
  await db.prepare('DELETE FROM guild_invites WHERE character_id = ? AND (guild_id = ? OR ? = 1)').bind(player.row.id, invite.guild_id, joined.meta.changes).run();
  if (joined.meta.changes !== 1) throw new ApiError(409, 'full', 'Ta gildia jest już pełna albo jej nie ma.');
  // The trials open on the guild's board run for the new member from now
  // (617); a look at the Próby makes them too, should this fail.
  await joinGuildTrials(db, invite.guild_id, player.row, context.now).catch((error) => console.error(error));
  return answer(db, player.row.id, context.now, { text: t('Jesteś w gildii. Jej kanał czeka w Czacie, w zakładce „Gildia”.') });
}

// POST /api/guild/decline { guildId }
export async function declineGuildInvite(context) {
  const { player } = await requireGuildPlayer(context);
  const db = context.env.DB;
  const body = await readJson(context.request);
  await db.prepare('DELETE FROM guild_invites WHERE guild_id = ? AND character_id = ?').bind(guildIdOf(body), player.row.id).run();
  return answer(db, player.row.id, context.now);
}

// POST /api/guild/cancel { characterId }: the leader or a deputy takes an
// invitation back.
export async function cancelGuildInvite(context) {
  const { player } = await requireGuildPlayer(context);
  const db = context.env.DB;
  const body = await readJson(context.request);
  const guild = await ownGuild(db, player.row.id, ['leader', 'deputy']);
  if (!Number.isInteger(body.characterId)) throw new ApiError(400, 'invalid_character', 'Nie ma takiej postaci.');
  await atomically(
    db,
    [
      stillAsRead(db, guild.id, [[player.row.id, ['leader', 'deputy']]]),
      db.prepare('DELETE FROM guild_invites WHERE guild_id = ? AND character_id = ?').bind(guild.id, body.characterId),
    ],
    guildChanged,
  );
  return answer(db, player.row.id, context.now);
}

// The statements that take characters out of their guilds (`characters`:
// SQL for their ids, with `binds`) at `now`: their open offers in the
// Wymiana close with the pieces back to them (guild-exchange.js), the
// items left for them in the Skrzynia Gildii are for all and those they put
// in no longer theirs to take back (guild-chest.js), a guild left without
// its leader gets its first deputy as leader, else the member there
// longest, and a guild left empty goes with its invitations, its channel's
// messages, its Siedziba's buildings (guild-seat.js) and its chest. Their
// places in the guild's war teams (guild-wars.js) go too. Also for a
// deleted character or account (characters.js, accounts.js).
export function guildRemoval(db, characters, binds, now) {
  const gone = "channel LIKE 'guild:%' AND channel NOT IN (SELECT 'guild:' || guild_id FROM guild_members)";
  return [
    ...offersReturned(db, characters, binds, now),
    ...chestReleased(db, characters, binds),
    db.prepare(`DELETE FROM guild_members WHERE character_id IN (${characters})`).bind(...binds),
    db.prepare(`DELETE FROM guild_war_slots WHERE character_id IN (${characters})`).bind(...binds),
    db.prepare(`DELETE FROM guild_invites WHERE character_id IN (${characters}) OR invited_by IN (${characters})`).bind(...binds, ...binds),
    db.prepare(
      `UPDATE guild_members SET role = 'leader' WHERE character_id IN (
         SELECT (SELECT n.character_id FROM guild_members n WHERE n.guild_id = g.guild_id
                 ORDER BY CASE n.role WHEN 'deputy' THEN 0 ELSE 1 END, n.joined_at, n.character_id LIMIT 1)
         FROM guild_members g GROUP BY g.guild_id HAVING SUM(g.role = 'leader') = 0)`,
    ),
    db.prepare('DELETE FROM guild_invites WHERE guild_id NOT IN (SELECT guild_id FROM guild_members)'),
    db.prepare(`DELETE FROM chat_reports WHERE message_id IN (SELECT id FROM chat_messages WHERE ${gone})`),
    db.prepare(`DELETE FROM chat_mentions WHERE message_id IN (SELECT id FROM chat_messages WHERE ${gone})`),
    db.prepare(`DELETE FROM chat_messages WHERE ${gone}`),
    db.prepare('DELETE FROM guild_seat WHERE guild_id NOT IN (SELECT guild_id FROM guild_members)'),
    db.prepare('DELETE FROM guild_seat_donations WHERE guild_id NOT IN (SELECT guild_id FROM guild_members)'),
    // The members' Sława of the weeks gone (guild-members.js).
    db.prepare('DELETE FROM guild_member_fame WHERE guild_id NOT IN (SELECT guild_id FROM guild_members)'),
    ...chestsGone(db),
    db.prepare('DELETE FROM guilds WHERE id NOT IN (SELECT guild_id FROM guild_members)'),
  ];
}

// POST /api/guild/leave: with the character, whose offers in the Wymiana
// gave their pieces back. The last member leaves only with the Skrzynia
// Gildii empty, since the guild goes with it (guild-chest.js: also of two
// members leaving at once, the batch's assertion holds for one of them).
export async function leaveGuild(context) {
  const { session, player } = await requireGuildPlayer(context);
  const db = context.env.DB;
  const guild = await ownGuild(db, player.row.id);
  await atomically(db, [lastLeavesEmpty(db, guild.id, player.row.id), ...guildRemoval(db, '?', [player.row.id], context.now)], lastLeavesEmptyError);
  return answer(db, player.row.id, context.now, { text: t('Opuszczasz gildię {name}.', { name: guild.name }), character: characterView(await loadPlayer(db, session.userId), context.now) });
}

// The member a request names, in the guild of the one who asks.
async function memberOf(db, guild, body) {
  if (!Number.isInteger(body.characterId)) throw new ApiError(400, 'invalid_character', 'Nie ma takiej postaci.');
  const member = await db
    .prepare('SELECT m.character_id, m.role, c.name FROM guild_members m JOIN characters c ON c.id = m.character_id WHERE m.guild_id = ? AND m.character_id = ?')
    .bind(guild.id, body.characterId)
    .first();
  if (!member) throw new ApiError(404, 'no_member', 'Tej postaci nie ma w gildii.');
  return member;
}

// POST /api/guild/kick { characterId }: the leader removes anyone else, a
// deputy a member.
export async function kickFromGuild(context) {
  const { player } = await requireGuildPlayer(context);
  const db = context.env.DB;
  const body = await readJson(context.request);
  const guild = await ownGuild(db, player.row.id, ['leader', 'deputy']);
  const member = await memberOf(db, guild, body);
  if (member.character_id === player.row.id) throw new ApiError(400, 'self', 'Siebie nie usuniesz. Możesz opuścić gildię.');
  if (guild.role === 'deputy' && member.role !== 'member') throw new ApiError(403, 'not_allowed', 'Zastępca usuwa tylko członków.');
  // Both as read: the one who removes in its role, the one removed in this
  // guild in its role (guildRemoval takes a character out of any guild).
  await atomically(
    db,
    [
      stillAsRead(db, guild.id, [
        [player.row.id, [guild.role]],
        [member.character_id, [member.role]],
      ]),
      ...guildRemoval(db, '?', [member.character_id], context.now),
    ],
    guildChanged,
  );
  return answer(db, player.row.id, context.now, { text: t('{name} nie jest już w gildii.', { name: member.name }) });
}

// POST /api/guild/role { characterId, role: deputy | member }: the leader
// names a deputy or makes one a member again.
export async function setGuildRole(context) {
  const { player } = await requireGuildPlayer(context);
  const db = context.env.DB;
  const body = await readJson(context.request);
  const guild = await ownGuild(db, player.row.id, ['leader']);
  if (!['deputy', 'member'].includes(body.role)) throw new ApiError(400, 'invalid_role', 'Wybierz zastępcę albo członka.');
  const member = await memberOf(db, guild, body);
  if (member.role === 'leader') throw new ApiError(400, 'self', 'Lider zostaje liderem. Przywództwo przekażesz osobno.');
  await atomically(
    db,
    [
      stillAsRead(db, guild.id, [
        [player.row.id, ['leader']],
        [member.character_id, [member.role]],
      ]),
      db.prepare("UPDATE guild_members SET role = ? WHERE guild_id = ? AND character_id = ? AND role != 'leader'").bind(body.role, guild.id, member.character_id),
    ],
    guildChanged,
  );
  return answer(db, player.row.id, context.now, { text: body.role === 'deputy' ? t('{name} jest teraz zastępcą.', { name: member.name }) : t('{name} jest teraz członkiem.', { name: member.name }) });
}

// POST /api/guild/lead { characterId }: the leader hands the lead over and
// becomes a deputy.
export async function handGuildLead(context) {
  const { player } = await requireGuildPlayer(context);
  const db = context.env.DB;
  const body = await readJson(context.request);
  const guild = await ownGuild(db, player.row.id, ['leader']);
  const member = await memberOf(db, guild, body);
  if (member.character_id === player.row.id) throw new ApiError(400, 'self', 'Już prowadzisz tę gildię.');
  await atomically(db, [
    // The one who asks still leads, and the one it names is still in the
    // guild as read: of two hand-overs at once, one saves.
    stillAsRead(db, guild.id, [
      [player.row.id, ['leader']],
      [member.character_id, [member.role]],
    ]),
    db.prepare("UPDATE guild_members SET role = 'deputy' WHERE guild_id = ? AND character_id = ? AND role = 'leader'").bind(guild.id, player.row.id),
    db.prepare("UPDATE guild_members SET role = 'leader' WHERE guild_id = ? AND character_id = ? AND EXISTS (SELECT 1 FROM guild_members WHERE guild_id = ? AND character_id = ? AND role = 'deputy')").bind(guild.id, member.character_id, guild.id, player.row.id),
  ], guildChanged);
  return answer(db, player.row.id, context.now, { text: t('{name} prowadzi teraz gildię.', { name: member.name }) });
}

// The invitations to guilds waiting for a character, for the light on the
// Społeczność tab (chat.js); none for a character in a guild.
export async function guildNews(db, characterId) {
  const row = await db
    .prepare('SELECT COUNT(*) AS count FROM guild_invites WHERE character_id = ? AND NOT EXISTS (SELECT 1 FROM guild_members m WHERE m.character_id = ?)')
    .bind(characterId, characterId)
    .first();
  return row.count;
}

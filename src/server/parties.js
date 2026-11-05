// Drużyny: up to parties.size characters of different players, one of them
// the leader, who sends the party on an exploration (the author: "Niech
// Drużyna ma maksymalnie 3 członków i lidera który decyduje o polowaniu.
// Drużyny powinny łatwo łączyć się, 1 członek wychodzić z nich jak
// stwierdzi ze potrzebuje Profesje robić. Drużyny poki co są tylko na
// wyprawy (mogą chodzić maksymalnie na tak długie i taki region jaki
// odblokowala postac z najnizszym lvlem w drużynie)"). From character level
// 10 (data/unlocks.json, party; 642 B, from 25 before 0.1.69). A member at a profession's work stays in
// the party and the party goes without it (the author: "Niech po prostu nie
// idzie z drużyną jesli jest zajety wykonywaniem Profesji, nie musi
// wychodzić z niej."). The members' class levels differ by at most
// parties.classSpread (the author: "Rozpiętość poziomu klas w Drużynie maks
// 5 lvl musi być też by nie było za dużego carrowania", and "niech nie
// będzie możliwości w ogole bycia w drużynie z kimś o rozpiętości lvli
// wyzszej niz 5"; engine parties.js): an invitation and a joining keep to
// it, and one whose level grows out of it leaves the party (partyOf).
//
// The leader invites a character by its name; a party comes with the first
// invitation. The invited one accepts or declines; a member leaves when it
// wants, and the leader may send one out. A leader who leaves passes the
// lead to the member who joined first, and a party nobody is in is gone.
//
// An exploration of the party: every member free now (its character played,
// at home, with nothing going on) goes with the leader to the place and for
// the length the leader chose, if each of them has them open; the others
// stay in the party and go the next time they are free. Each one gets
// an exploration of its own (hunts.js), with the others fighting beside it
// as they are when they set out, and its own report and finds. The
// explorations of one trip share their timer: a "Przewiń" of any of them
// moves them all, and the others hear who skipped (time.js; the author:
// "Musi być wspólny timer").
//
// A party hunts without companions (the author: "jeśli ktoś ma zwerbowanego
// towarzysza to nie może być w drużynie, dopóki nie kliknie na nim [Zostań w
// kwaterze]; wtedy nie poluje się z towarzyszem, tylko samemu/z drużyną"): a
// character whose companion still goes on explorations neither makes a
// party nor joins one, and in a party every companion stays in the Kwatery
// (companionStays in the engine), also one of a character that was in a
// party before this rule came.

import { areaFor, areaOpenFor, huntDurations, isUnlocked, longestHunt, mountOf, mountStage, mountView, partyFit, partyRange, partyRefusal } from '../engine/index.js';
import { characterView, currentHp, earlyAreaOf, engineCharacter, equippedItems, loadCharacter, loadPlayer, requireIdlePlayer, requirePlayer } from './characters.js';
import { content } from './content.js';
import { cosmeticsOfRow, nameColorOf } from './cosmetics.js';
import { settlementOn } from './features.js';
import { guildTagSql } from './guilds.js';
import { beginHunt } from './hunts.js';
import { toHex } from './encoding.js';
import { ApiError, json, readJson } from './http.js';
import { OWN_CHARACTERS } from './roles.js';

// The most invitations one party may have waiting.
const MAX_INVITES = 5;

// The class levels of a party's members, in its order.
async function classLevels(db, partyId) {
  const { results } = await db
    .prepare('SELECT c.class_level FROM party_members m JOIN characters c ON c.id = m.character_id WHERE m.party_id = ? ORDER BY m.joined_at, m.character_id')
    .bind(partyId)
    .all();
  return results.map((row) => row.class_level);
}

// Why a character of `classLevel` cannot be in a party of `levels`, or
// null; `who` says whose level it is.
function levelGap(who, classLevel, levels) {
  const { from, to } = partyRange(levels, content);
  if (classLevel >= from && classLevel <= to) return null;
  const { classSpread } = content.balance.parties;
  return new ApiError(
    409,
    'level_gap',
    `${who} ${classLevel}. poziom klasy. Poziomy klas w drużynie mogą się różnić najwyżej o ${classSpread}, więc teraz dołączy postać z poziomem klasy od ${from} do ${to}.`,
  );
}

const unlock = () => content.unlocksById.party;
const size = () => content.balance.parties.size;

function requireUnlocked(row) {
  if (!isUnlocked('party', row.level, content)) throw new ApiError(403, 'locked', `Drużynę odblokujesz na poziomie postaci ${unlock().level}.`);
}

async function requirePartyPlayer(context) {
  const found = await requirePlayer(context);
  requireUnlocked(found.player.row);
  return found;
}

// Why a character of `row` cannot make or join a party, or null: its
// companions who do not stay in the Kwatery, where the Osada is on.
const companionsOut = (row) => (settlementOn() ? partyRefusal(JSON.parse(row.settlement ?? '{}').companions ?? [], content) : null);

// A character makes or joins a party only once its companions stay.
function requireCompanionsStay(row) {
  const refusal = companionsOut(row);
  if (refusal) throw new ApiError(409, 'companion_goes', refusal);
}

// The party a character is in: its id, leader and members (character ids
// in the order they joined), or null. The Wieża Drużyn climbs with it
// (towers.js).
export async function partyOf(db, characterId) {
  const membership = await db.prepare('SELECT party_id FROM party_members WHERE character_id = ?').bind(characterId).first();
  if (!membership) return null;
  const [party, members] = await db.batch([
    db.prepare('SELECT id, leader_id FROM parties WHERE id = ?').bind(membership.party_id),
    db
      .prepare('SELECT m.character_id, c.class_level FROM party_members m JOIN characters c ON c.id = m.character_id WHERE m.party_id = ? ORDER BY m.joined_at, m.character_id')
      .bind(membership.party_id),
  ]);
  const row = party.results[0];
  if (!row) {
    // A membership whose party is gone (made and emptied at once) goes too.
    await db.prepare('DELETE FROM party_members WHERE character_id = ? AND party_id = ?').bind(characterId, membership.party_id).run();
    return null;
  }
  // One whose class level grew more than the spread apart leaves (engine
  // partyFit): the leader stays, and the members in the party's order who
  // fit with those staying.
  const list = members.results.map((member) => ({ id: member.character_id, classLevel: member.class_level }));
  const leader = list.find((member) => member.id === row.leader_id);
  const { apart } = leader ? partyFit(leader, list.filter((member) => member !== leader), content) : { apart: [] };
  if (apart.length > 0) {
    const ids = apart.map((member) => member.id);
    await db.batch(partyRemoval(db, ids.map(() => '?').join(', '), ids));
    if (ids.includes(characterId)) return null;
  }
  return { id: row.id, leaderId: row.leader_id, memberIds: list.filter((member) => !apart.includes(member)).map((member) => member.id) };
}

// A member's state for the party's list: free (its character played and at
// home), away (on an exploration), working (at a profession's work) or
// aside (its player plays another character). Only the free go along.
function memberStatus(row) {
  if (row.role !== 'player') return 'aside';
  if (!row.activity) return 'free';
  return row.activity === 'hunt' ? 'away' : 'working';
}

// The stage of the Stajnia's mount of a character's row (327 A): a party's
// trip waits as long as the slowest mount of those who go.
const mountOfRow = (row) => (settlementOn() ? mountStage(JSON.parse(row.settlement ?? '{}'), content) : 0);

// The Drużyna for the page: the party, with its members, the invitations it
// sent and the limits of its explorations (the lowest member's), and the
// invitations waiting for this character.
export async function partyView(db, characterId, now) {
  const party = await partyOf(db, characterId);
  const [members, sent, invites, self] = await db.batch([
    db
      .prepare(
        `SELECT c.id, c.name, c.class_id, c.level, c.class_level, c.role, c.settlement, c.cosmetics, u.seen_at, ${guildTagSql('c.id')} AS guild_tag,
                (SELECT a.kind FROM activities a WHERE a.character_id = c.id) AS activity
         FROM party_members m JOIN characters c ON c.id = m.character_id JOIN users u ON u.id = c.user_id
         WHERE m.party_id = ? ORDER BY m.joined_at, m.character_id`,
      )
      .bind(party?.id ?? 0),
    db.prepare('SELECT c.id, c.name FROM party_invites i JOIN characters c ON c.id = i.character_id WHERE i.party_id = ? ORDER BY i.created_at').bind(party?.id ?? 0),
    db
      .prepare(
        `SELECT i.party_id, i.created_at, b.name AS invited_by,
                (SELECT group_concat(c.name, ', ') FROM party_members m JOIN characters c ON c.id = m.character_id WHERE m.party_id = i.party_id) AS members
         FROM party_invites i JOIN characters b ON b.id = i.invited_by
         WHERE i.character_id = ? ORDER BY i.created_at DESC`,
      )
      .bind(characterId),
    db.prepare('SELECT class_level, settlement FROM characters WHERE id = ?').bind(characterId),
  ]);
  const { onlineSeconds } = content.community.trade;
  const list = members.results.map((row) => ({
    id: row.id,
    name: row.name,
    guildTag: row.guild_tag ?? null,
    nameColor: nameColorOf(row.cosmetics),
    classId: row.class_id,
    className: content.classesById[row.class_id]?.name ?? '',
    level: row.level,
    classLevel: row.class_level,
    leader: row.id === party?.leaderId,
    own: row.id === characterId,
    status: memberStatus(row),
    online: row.role === 'player' && (row.seen_at ?? 0) >= now - onlineSeconds * 1000,
    mount: mountOfRow(row),
  }));
  // The limits of the lowest of those who would go now, the leader and the
  // free members, as the start checks them: the longest exploration of the
  // lowest character level, the places of the lowest class level and the
  // slowest mount. One busy elsewhere stays home, so it limits nothing.
  const goers = list.filter((member) => member.leader || member.status === 'free');
  const slowest = goers.length > 0 ? goers.reduce((low, member) => (member.mount < low.mount ? member : low)) : null;
  const levels = list.length > 0 ? list.map((member) => member.classLevel) : [self.results[0]?.class_level ?? 1];
  const lowest = goers.length > 0 ? goers.reduce((low, member) => (member.level < low.level ? member : low)) : null;
  const lowestClass = goers.length > 0 ? goers.reduce((low, member) => (member.classLevel < low.classLevel ? member : low)) : null;
  return {
    party: party && {
      id: party.id,
      size: size(),
      members: list,
      invited: sent.results.map((row) => ({ id: row.id, name: row.name })),
      limits: lowest && {
        minutes: longestHunt(lowest.level, content),
        minutesBy: lowest.name,
        classLevel: lowestClass.classLevel,
        classLevelBy: lowestClass.name,
        mount: { shorter: mountOf(slowest.mount, content)?.shorter ?? 0, by: slowest.name },
      },
    },
    // The class levels a character invited now may have, and the spread.
    range: { ...partyRange(levels, content), spread: content.balance.parties.classSpread },
    invites: invites.results.map((row) => ({ partyId: row.party_id, invitedBy: row.invited_by, members: row.members ?? '', at: row.created_at })),
    unlockLevel: unlock().level,
    // Out of a party, the companions who still go on explorations keep the
    // character from making or joining one: why, and the way to the
    // Kwatery, where they are told to stay.
    companions: !party && self.results[0] ? companionsBlock(self.results[0]) : null,
  };
}

// The words of a character kept out of a party by its companions, with the
// link to the Kwatery, or null.
function companionsBlock(row) {
  const text = companionsOut(row);
  return text && { text, link: content.settlement.companions.texts.toQuarters };
}

const answer = async (db, characterId, now, extra = {}) => json({ ...(await partyView(db, characterId, now)), ...extra });

// GET /api/party
export async function getParty(context) {
  const { player } = await requirePartyPlayer(context);
  return answer(context.env.DB, player.row.id, context.now);
}

// POST /api/party/invite { name }: the leader invites a character by its
// name; a character without a party makes one with the first invitation.
// Not one of its own player's characters (it could not go with it), nor
// one whose player hid the inviting one's in the chat.
export async function inviteToParty(context) {
  const { session, player } = await requirePartyPlayer(context);
  const db = context.env.DB;
  const body = await readJson(context.request);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) throw new ApiError(400, 'no_name', 'Wpisz imię postaci.');
  const target = await db
    .prepare(`SELECT id, user_id, name, level, class_level FROM characters WHERE name_key = ? AND ${OWN_CHARACTERS}`)
    .bind(name.toLowerCase())
    .first();
  if (!target) throw new ApiError(404, 'no_character', 'Nie ma takiej postaci.');
  if (target.id === player.row.id) throw new ApiError(400, 'self', 'Siebie nie zaprosisz.');
  if (target.user_id === session.userId) throw new ApiError(400, 'own', `${target.name} to Twoja postać. Swoich postaci nie zaprosisz do drużyny.`);
  if (!isUnlocked('party', target.level, content)) {
    throw new ApiError(409, 'target_locked', `${target.name} nie ma jeszcze Drużyny. Otworzy się na ${unlock().level}. poziomie postaci.`);
  }
  const blocked = await db
    .prepare('SELECT 1 FROM chat_blocks WHERE (user_id = ? AND blocked_id = ?) OR (user_id = ? AND blocked_id = ?)')
    .bind(target.user_id, session.userId, session.userId, target.user_id)
    .first();
  if (blocked) throw new ApiError(409, 'blocked', `${target.name} nie przyjmuje teraz zaproszeń od Ciebie.`);
  let party = await partyOf(db, player.row.id);
  if (party && party.leaderId !== player.row.id) throw new ApiError(403, 'not_leader', 'Do drużyny zaprasza lider.');
  // The first invitation makes the party: not while a companion goes on
  // the inviting character's explorations.
  if (!party) requireCompanionsStay(player.row);
  if (party?.memberIds.includes(target.id)) throw new ApiError(409, 'member', `${target.name} jest już w Twojej drużynie.`);
  if (party && party.memberIds.length >= size()) throw new ApiError(409, 'full', `Drużyna jest pełna: ${size()} postacie.`);
  const gap = levelGap(`${target.name} ma`, target.class_level, party ? await classLevels(db, party.id) : [player.row.class_level]);
  if (gap) throw gap;
  if (!party) {
    // The party and its leader at once, in one transaction.
    let made;
    try {
      [made] = await db.batch([
        db.prepare('INSERT INTO parties (leader_id, created_at) VALUES (?, ?)').bind(player.row.id, context.now),
        db.prepare('INSERT INTO party_members (character_id, party_id, joined_at) VALUES (?, last_insert_rowid(), ?)').bind(player.row.id, context.now),
      ]);
    } catch {
      // Another request made one meanwhile.
      throw new ApiError(409, 'changed', 'Drużyna zmieniła się w międzyczasie. Spróbuj jeszcze raz.');
    }
    party = { id: made.meta.last_row_id, leaderId: player.row.id, memberIds: [player.row.id] };
  }
  const waiting = await db.prepare('SELECT COUNT(*) AS count FROM party_invites WHERE party_id = ?').bind(party.id).first();
  if (waiting.count >= MAX_INVITES) throw new ApiError(409, 'too_many_invites', `Na odpowiedź czeka już ${MAX_INVITES} zaproszeń.`);
  await db
    .prepare('INSERT OR IGNORE INTO party_invites (party_id, character_id, invited_by, created_at) VALUES (?, ?, ?, ?)')
    .bind(party.id, target.id, player.row.id, context.now)
    .run();
  return answer(db, player.row.id, context.now, { text: `Zaproszenie wysłane. ${target.name} przyjmie je w Społeczności, w Drużynie.` });
}

// POST /api/party/accept { partyId }: joins the party that invited this
// character, while it has a place; the character's other invitations go.
// A party's id from a request.
function partyIdOf(body) {
  if (!Number.isInteger(body.partyId) || body.partyId < 1) throw new ApiError(400, 'invalid_party', 'Nie ma takiej drużyny.');
  return body.partyId;
}

export async function acceptPartyInvite(context) {
  const { player } = await requirePartyPlayer(context);
  const db = context.env.DB;
  const body = await readJson(context.request);
  const invite = await db.prepare('SELECT party_id FROM party_invites WHERE party_id = ? AND character_id = ?').bind(partyIdOf(body), player.row.id).first();
  if (!invite) throw new ApiError(404, 'no_invite', 'Tego zaproszenia już nie ma.');
  if (await partyOf(db, player.row.id)) throw new ApiError(409, 'in_party', 'Najpierw opuść swoją drużynę.');
  requireCompanionsStay(player.row);
  // Joins only while the party has a place and the character's class level
  // keeps the party within the spread (both in the same statement), so two
  // invitations accepted at once join one party.
  let joined;
  try {
    joined = await db
      .prepare(
        `INSERT INTO party_members (character_id, party_id, joined_at)
         SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM parties WHERE id = ?) AND (SELECT COUNT(*) FROM party_members WHERE party_id = ?) < ?
           AND (SELECT MAX(MAX(c.class_level), ?) - MIN(MIN(c.class_level), ?) FROM party_members m JOIN characters c ON c.id = m.character_id WHERE m.party_id = ?) <= ?`,
      )
      .bind(player.row.id, invite.party_id, context.now, invite.party_id, invite.party_id, size(), player.row.class_level, player.row.class_level, invite.party_id, content.balance.parties.classSpread)
      .run();
  } catch {
    throw new ApiError(409, 'in_party', 'Najpierw opuść swoją drużynę.');
  }
  await db.prepare('DELETE FROM party_invites WHERE character_id = ? AND (party_id = ? OR ? = 1)').bind(player.row.id, invite.party_id, joined.meta.changes).run();
  if (joined.meta.changes !== 1) {
    const levels = await classLevels(db, invite.party_id);
    const gap = levels.length > 0 && levels.length < size() && levelGap('Masz', player.row.class_level, levels);
    throw gap || new ApiError(409, 'full', 'Ta drużyna jest już pełna albo jej nie ma.');
  }
  return answer(db, player.row.id, context.now, { text: 'Jesteś w drużynie. Lider zabierze Cię na najbliższą wyprawę, gdy nie będziesz mieć innych zajęć.' });
}

// POST /api/party/decline { partyId }
export async function declinePartyInvite(context) {
  const { player } = await requirePartyPlayer(context);
  const db = context.env.DB;
  const body = await readJson(context.request);
  await db.prepare('DELETE FROM party_invites WHERE party_id = ? AND character_id = ?').bind(partyIdOf(body), player.row.id).run();
  return answer(db, player.row.id, context.now);
}

// The statements that take characters out of their parties (`characters`:
// SQL for their ids, with `binds`): a leader's lead goes to the member who
// joined first after it, and a party left empty goes with its invitations.
// Also for a deleted account (accounts.js).
export function partyRemoval(db, characters, binds) {
  return [
    db.prepare(`DELETE FROM party_members WHERE character_id IN (${characters})`).bind(...binds),
    db.prepare(`DELETE FROM party_invites WHERE character_id IN (${characters}) OR invited_by IN (${characters})`).bind(...binds, ...binds),
    db.prepare(
      `UPDATE parties SET leader_id = (SELECT character_id FROM party_members WHERE party_id = parties.id ORDER BY joined_at, character_id LIMIT 1)
       WHERE leader_id NOT IN (SELECT character_id FROM party_members WHERE party_id = parties.id) AND EXISTS (SELECT 1 FROM party_members WHERE party_id = parties.id)`,
    ),
    db.prepare('DELETE FROM party_invites WHERE party_id NOT IN (SELECT party_id FROM party_members)'),
    db.prepare('DELETE FROM parties WHERE id NOT IN (SELECT party_id FROM party_members)'),
  ];
}

const leaveStatements = (db, characterId) => partyRemoval(db, '?', [characterId]);

// POST /api/party/leave: the character leaves (the author: "1 członek
// wychodzić z nich jak stwierdzi ze potrzebuje Profesje robić"; since
// 1.11.2026 the professions need no leaving, see the top). An exploration
// already under way goes on as it began.
export async function leaveParty(context) {
  const { player } = await requirePartyPlayer(context);
  const db = context.env.DB;
  if (!(await partyOf(db, player.row.id))) throw new ApiError(409, 'no_party', 'Nie jesteś w drużynie.');
  await db.batch(leaveStatements(db, player.row.id));
  return answer(db, player.row.id, context.now, { text: 'Opuszczasz drużynę.' });
}

// POST /api/party/kick { characterId }: the leader sends a member out.
export async function kickFromParty(context) {
  const { player } = await requirePartyPlayer(context);
  const db = context.env.DB;
  const body = await readJson(context.request);
  const party = await partyOf(db, player.row.id);
  if (!party || party.leaderId !== player.row.id) throw new ApiError(403, 'not_leader', 'Z drużyny usuwa lider.');
  const id = Number(body.characterId);
  if (id === player.row.id || !party.memberIds.includes(id)) throw new ApiError(404, 'no_member', 'Tej postaci nie ma w drużynie.');
  await db.batch(leaveStatements(db, id));
  return answer(db, player.row.id, context.now);
}

// POST /api/party/cancel { characterId }: the leader takes back an
// invitation.
export async function cancelPartyInvite(context) {
  const { player } = await requirePartyPlayer(context);
  const db = context.env.DB;
  const body = await readJson(context.request);
  const party = await partyOf(db, player.row.id);
  if (!party || party.leaderId !== player.row.id) throw new ApiError(403, 'not_leader', 'Zaproszenia cofa lider.');
  await db.prepare('DELETE FROM party_invites WHERE party_id = ? AND character_id = ?').bind(party.id, Number(body.characterId)).run();
  return answer(db, player.row.id, context.now);
}

// How a member looks on the way, for the others' Walka scene (scenes.js,
// 640 A: the party walks side by side): its class, look and skin tone, its
// evolution's form, its Stajnia's mount and the looks it wears from the
// Sklep Systemu, as it set out.
function wayLook(row) {
  const worn = cosmeticsOfRow(row);
  const mount = settlementOn() ? mountView(JSON.parse(row.settlement ?? '{}'), content) : null;
  return {
    id: row.id,
    name: row.name,
    classId: row.class_id,
    appearance: row.appearance,
    skin: row.skin ?? content.defaultSkin,
    evolution: content.evolutionsById[row.evolution] ? row.evolution : null,
    mount: mount?.id ?? null,
    mountSkin: worn.mountSkin,
    aura: worn.aura,
    trail: worn.trail,
    pet: worn.pet,
  };
}

// What a member brings into the others' fights: itself as it is now.
function snapshot(member, now) {
  return { id: member.row.id, name: member.row.name, character: engineCharacter(member.row), equipped: equippedItems(member), hp: currentHp(member, now).hp };
}

// POST /api/party/hunt { areaId, minutes, ... as "Wyrusz" }: the leader
// sends the party out. The members free now go; each of them, the leader
// too, must have the place and the length open, so the party goes only as
// far and as long as its lowest member may, and waits as long as its slowest
// mount (the Stajnia, 327 A). The leader's choices of potions and tracking
// are its own; the others go without them.
export async function partyHunt(context) {
  const { session, player } = await requireIdlePlayer(context);
  requireUnlocked(player.row);
  const db = context.env.DB;
  const now = context.now;
  const body = await readJson(context.request);
  const party = await partyOf(db, player.row.id);
  if (!party) throw new ApiError(409, 'no_party', 'Nie masz drużyny.');
  if (party.leaderId !== player.row.id) throw new ApiError(403, 'not_leader', 'Na wyprawę drużynę wysyła lider.');
  const others = (await Promise.all(party.memberIds.filter((id) => id !== player.row.id).map((id) => loadCharacter(db, id)))).filter(Boolean);
  const going = others.filter((other) => other.row.role === 'player' && !other.activity);
  if (going.length === 0) throw new ApiError(409, 'nobody_free', 'Nikt z drużyny nie jest teraz wolny. Odznacz „Z drużyną” albo poczekaj, aż ktoś skończy swoje zajęcia.');
  const area = typeof body.areaId === 'string' ? areaFor(body.areaId, player.row.level, content) : undefined;
  if (!area) throw new ApiError(400, 'invalid_area', 'Wybierz miejsce wyprawy.');
  for (const member of [player, ...going]) {
    if (!areaOpenFor(area, member.row.class_level, earlyAreaOf(member.row), content)) {
      throw new ApiError(403, 'party_area_locked', `${member.row.name} nie ma jeszcze otwartego miejsca ${area.name}. Drużyna idzie tylko tam, gdzie może każdy z was.`);
    }
    if (!huntDurations(member.row.level, content).includes(body.minutes)) {
      throw new ApiError(403, 'party_duration_locked', `${member.row.name} może iść najwyżej na ${longestHunt(member.row.level, content)} minut. Drużyna idzie tylko tak długo, jak może każdy z was.`);
    }
  }
  const everyone = [player, ...going];
  // One time for the whole trip: the slowest mount of those going.
  const mount = Math.min(...everyone.map((member) => mountOfRow(member.row)));
  const shots = new Map(everyone.map((member) => [member.row.id, snapshot(member, now)]));
  const names = everyone.map((member) => member.row.name);
  const partnersOf = (member, list) => list.filter((other) => other !== member).map((other) => shots.get(other.row.id));
  // `trip` marks the explorations of this setting out, for their shared
  // timer (time.js).
  const party_ = { id: party.id, leader: player.row.name, names, trip: now };
  // The leader first, with its own choices checked there (potions, the
  // healing mark, tracking), so a wrong one sends nobody (the code review);
  // then the members, each without the leader's choices. One that got busy
  // meanwhile stays home.
  const setups = new Map([[player.row.id, await beginHunt(db, player, body, now, { party: party_, partners: partnersOf(player, everyone), mount })]]);
  const went = [];
  for (const member of going) {
    try {
      const setup = await beginHunt(db, member, { areaId: area.id, minutes: body.minutes, avoidRare: body.avoidRare === true, seekRare: body.seekRare === true && body.avoidRare !== true }, now, {
        party: party_,
        partners: partnersOf(member, everyone),
        mount,
      });
      setups.set(member.row.id, setup);
      went.push(member);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
    }
  }
  // The trip as it set out, kept by each of its explorations (trips.js): its
  // own seed and its roster, those who went in its order with what each
  // brought, and how the leader leads it (with no companions: hunts.js), so
  // its fights come out the same in every member's report (the
  // author: "postacie z drużyny mają inne raporty odbytych walk. To nie
  // powinno mieć miejsca"). One that could not go after all (it got busy,
  // or its character changed meanwhile) fights in nobody's exploration (the
  // author: "niech się nie okaże, że jednak 3 walczą"), and a leader left
  // alone goes as on its own.
  const actual = [player, ...went];
  const lead = setups.get(player.row.id);
  const crew = {
    ...party_,
    names: actual.map((member) => member.row.name),
    // How each looks on the way, for the others' Walka scene (640 A).
    looks: actual.map((member) => wayLook(member.row)),
    seed: toHex(crypto.getRandomValues(new Uint8Array(16))),
    roster: actual.map((member) => {
      const setup = setups.get(member.row.id);
      return { ...shots.get(member.row.id), windows: setup.windows, trophies: setup.trophies, ...(member === player && { potions: setup.taken, healBelow: setup.healBelow }) };
    }),
    encounter: {
      avoidRare: lead.avoidRare,
      seekRare: lead.seekRare,
      rumor: lead.rumor,
      // The leader's Bractwo Łowców: the trip's elite and champion (591 B).
      ...(lead.rareMore > 0 && { rareMore: lead.rareMore }),
      tracked: lead.tracked,
      unknown: lead.unknown,
      met: JSON.parse(player.row.met ?? '[]'),
    },
  };
  const trip = `json_extract(options, '$.party.trip') = ? AND json_extract(options, '$.party.id') = ?`;
  await db.batch(
    actual.map((member) =>
      went.length > 0
        ? db
            .prepare(`UPDATE activities SET options = json_remove(json_set(options, '$.party', json(?)), '$.partners') WHERE character_id = ? AND kind = 'hunt' AND ${trip}`)
            .bind(JSON.stringify(crew), member.row.id, now, party.id)
        : db.prepare(`UPDATE activities SET options = json_remove(options, '$.party', '$.partners') WHERE character_id = ? AND kind = 'hunt' AND ${trip}`).bind(member.row.id, now, party.id),
    ),
  );
  return json(
    { character: characterView(await loadPlayer(db, session.userId), now), ...(await partyView(db, player.row.id, now)), went: went.map((member) => member.row.name) },
    201,
  );
}

// How many party invitations wait for a character, for the light on the
// Społeczność tab (chat.js).
export async function partyNews(db, characterId) {
  const row = await db.prepare('SELECT COUNT(*) AS count FROM party_invites WHERE character_id = ?').bind(characterId).first();
  return row.count;
}

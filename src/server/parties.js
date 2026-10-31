// Drużyny: up to parties.size characters of different players, one of them
// the leader, who sends the party on an exploration (the author: "Niech
// Drużyna ma maksymalnie 3 członków i lidera który decyduje o polowaniu.
// Drużyny powinny łatwo łączyć się, 1 członek wychodzić z nich jak
// stwierdzi ze potrzebuje Profesje robić. Drużyny poki co są tylko na
// wyprawy (mogą chodzić maksymalnie na tak długie i taki region jaki
// odblokowala postac z najnizszym lvlem w drużynie)"). From character level
// 25 (data/unlocks.json, party).
//
// The leader invites a character by its name; a party comes with the first
// invitation. The invited one accepts or declines; a member leaves when it
// wants, and the leader may send one out. A leader who leaves passes the
// lead to the member who joined first, and a party nobody is in is gone.
//
// An exploration of the party: every member free now (its character played,
// at home, with nothing going on) goes with the leader to the place and for
// the length the leader chose, if each of them has them open. Each one gets
// an exploration of its own (hunts.js), with the others fighting beside it
// as they are when they set out, and its own report and finds; the free
// places of the party, up to parties.size, take its companions.

import { areaFor, areaUnlocked, huntDurations, isUnlocked, longestHunt } from '../engine/index.js';
import { characterView, currentHp, engineCharacter, equippedItems, loadCharacter, loadPlayer, requireIdlePlayer, requirePlayer } from './characters.js';
import { content } from './content.js';
import { beginHunt } from './hunts.js';
import { ApiError, json, readJson } from './http.js';
import { OWN_CHARACTERS } from './roles.js';

// The most invitations one party may have waiting.
const MAX_INVITES = 5;

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

// The party a character is in: its id, leader and members (character ids
// in the order they joined), or null.
async function partyOf(db, characterId) {
  const membership = await db.prepare('SELECT party_id FROM party_members WHERE character_id = ?').bind(characterId).first();
  if (!membership) return null;
  const [party, members] = await db.batch([
    db.prepare('SELECT id, leader_id FROM parties WHERE id = ?').bind(membership.party_id),
    db.prepare('SELECT character_id FROM party_members WHERE party_id = ? ORDER BY joined_at, character_id').bind(membership.party_id),
  ]);
  const row = party.results[0];
  return row ? { id: row.id, leaderId: row.leader_id, memberIds: members.results.map((member) => member.character_id) } : null;
}

// A member's state for the party's list: free (its character played and at
// home), away (on an exploration or a work) or aside (its player plays
// another character).
function memberStatus(row) {
  if (row.role !== 'player') return 'aside';
  return row.away ? 'away' : 'free';
}

// The Drużyna for the page: the party, with its members, the invitations it
// sent and the limits of its explorations (the lowest member's), and the
// invitations waiting for this character.
export async function partyView(db, characterId, now) {
  const party = await partyOf(db, characterId);
  const [members, sent, invites] = await db.batch([
    db
      .prepare(
        `SELECT c.id, c.name, c.class_id, c.level, c.class_level, c.role, u.seen_at,
                EXISTS (SELECT 1 FROM activities a WHERE a.character_id = c.id) AS away
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
  ]);
  const { onlineSeconds } = content.community.trade;
  const list = members.results.map((row) => ({
    id: row.id,
    name: row.name,
    classId: row.class_id,
    className: content.classesById[row.class_id]?.name ?? '',
    level: row.level,
    classLevel: row.class_level,
    leader: row.id === party?.leaderId,
    own: row.id === characterId,
    status: memberStatus(row),
    online: row.role === 'player' && (row.seen_at ?? 0) >= now - onlineSeconds * 1000,
  }));
  // The lowest member's limits: the longest exploration of the lowest
  // character level and the places of the lowest class level.
  const lowest = list.length > 0 ? list.reduce((low, member) => (member.level < low.level ? member : low)) : null;
  const lowestClass = list.length > 0 ? list.reduce((low, member) => (member.classLevel < low.classLevel ? member : low)) : null;
  return {
    party: party && {
      id: party.id,
      size: size(),
      members: list,
      invited: sent.results.map((row) => ({ id: row.id, name: row.name })),
      limits: { minutes: longestHunt(lowest.level, content), minutesBy: lowest.name, classLevel: lowestClass.classLevel, classLevelBy: lowestClass.name },
    },
    invites: invites.results.map((row) => ({ partyId: row.party_id, invitedBy: row.invited_by, members: row.members ?? '', at: row.created_at })),
    unlockLevel: unlock().level,
  };
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
    .prepare(`SELECT id, user_id, name, level FROM characters WHERE name_key = ? AND ${OWN_CHARACTERS}`)
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
  if (party?.memberIds.includes(target.id)) throw new ApiError(409, 'member', `${target.name} jest już w Twojej drużynie.`);
  if (party && party.memberIds.length >= size()) throw new ApiError(409, 'full', `Drużyna jest pełna: ${size()} postacie.`);
  if (!party) {
    const made = await db.prepare('INSERT INTO parties (leader_id, created_at) VALUES (?, ?)').bind(player.row.id, context.now).run();
    const id = made.meta.last_row_id;
    try {
      await db.prepare('INSERT INTO party_members (character_id, party_id, joined_at) VALUES (?, ?, ?)').bind(player.row.id, id, context.now).run();
    } catch {
      // Another request made one meanwhile.
      await db.prepare('DELETE FROM parties WHERE id = ?').bind(id).run();
      throw new ApiError(409, 'changed', 'Drużyna zmieniła się w międzyczasie. Spróbuj jeszcze raz.');
    }
    party = { id, leaderId: player.row.id, memberIds: [player.row.id] };
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
export async function acceptPartyInvite(context) {
  const { player } = await requirePartyPlayer(context);
  const db = context.env.DB;
  const body = await readJson(context.request);
  const invite = await db.prepare('SELECT party_id FROM party_invites WHERE party_id = ? AND character_id = ?').bind(body.partyId, player.row.id).first();
  if (!invite) throw new ApiError(404, 'no_invite', 'Tego zaproszenia już nie ma.');
  if (await partyOf(db, player.row.id)) throw new ApiError(409, 'in_party', 'Najpierw opuść swoją drużynę.');
  // Joins only while the party has a place (the count in the same statement).
  const joined = await db
    .prepare(
      `INSERT INTO party_members (character_id, party_id, joined_at)
       SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM parties WHERE id = ?) AND (SELECT COUNT(*) FROM party_members WHERE party_id = ?) < ?`,
    )
    .bind(player.row.id, invite.party_id, context.now, invite.party_id, invite.party_id, size())
    .run();
  await db.prepare('DELETE FROM party_invites WHERE character_id = ? AND (party_id = ? OR ? = 1)').bind(player.row.id, invite.party_id, joined.meta.changes).run();
  if (joined.meta.changes !== 1) throw new ApiError(409, 'full', 'Ta drużyna jest już pełna albo jej nie ma.');
  return answer(db, player.row.id, context.now, { text: 'Jesteś w drużynie. Lider zabierze Cię na najbliższą wyprawę, gdy nie będziesz mieć innych zajęć.' });
}

// POST /api/party/decline { partyId }
export async function declinePartyInvite(context) {
  const { player } = await requirePartyPlayer(context);
  const db = context.env.DB;
  const body = await readJson(context.request);
  await db.prepare('DELETE FROM party_invites WHERE party_id = ? AND character_id = ?').bind(body.partyId, player.row.id).run();
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

// POST /api/party/leave: the character leaves, e.g. for the professions
// (the author: "1 członek wychodzić z nich jak stwierdzi ze potrzebuje
// Profesje robić"). An exploration already under way goes on as it began.
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

// What a member brings into the others' fights: itself as it is now.
function snapshot(member, now) {
  return { id: member.row.id, name: member.row.name, character: engineCharacter(member.row), equipped: equippedItems(member), hp: currentHp(member, now).hp };
}

// POST /api/party/hunt { areaId, minutes, ... as "Wyrusz" }: the leader
// sends the party out. The members free now go; each of them, the leader
// too, must have the place and the length open, so the party goes only as
// far and as long as its lowest member may. The leader's choices of potions
// and tracking are its own; the others go without them.
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
  if (going.length === 0) throw new ApiError(409, 'nobody_free', 'Nikt z drużyny nie jest teraz wolny. Wyrusz sam albo poczekaj na drużynę.');
  const area = typeof body.areaId === 'string' ? areaFor(body.areaId, player.row.level, content) : undefined;
  if (!area) throw new ApiError(400, 'invalid_area', 'Wybierz miejsce wyprawy.');
  for (const member of [player, ...going]) {
    if (!areaUnlocked(area, member.row.class_level, content)) {
      throw new ApiError(403, 'party_area_locked', `${member.row.name} nie ma jeszcze otwartego miejsca ${area.name}. Drużyna idzie tylko tam, gdzie może każdy z was.`);
    }
    if (!huntDurations(member.row.level, content).includes(body.minutes)) {
      throw new ApiError(403, 'party_duration_locked', `${member.row.name} może iść najwyżej na ${longestHunt(member.row.level, content)} minut. Drużyna idzie tylko tak długo, jak może każdy z was.`);
    }
  }
  const everyone = [player, ...going];
  const shots = new Map(everyone.map((member) => [member.row.id, snapshot(member, now)]));
  const names = everyone.map((member) => member.row.name);
  const partnersOf = (member, list) => list.filter((other) => other !== member).map((other) => shots.get(other.row.id));
  const party_ = { id: party.id, leader: player.row.name, names };
  // The members first, each with what it chose itself left out; one that
  // got busy meanwhile stays home. Then the leader, with those who went.
  const went = [];
  for (const member of going) {
    try {
      await beginHunt(db, member, { areaId: area.id, minutes: body.minutes, avoidRare: body.avoidRare === true, seekRare: body.seekRare === true && body.avoidRare !== true }, now, {
        party: party_,
        partners: partnersOf(member, everyone),
      });
      went.push(member);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
    }
  }
  if (went.length === 0) throw new ApiError(409, 'nobody_free', 'Nikt z drużyny nie jest teraz wolny. Wyrusz sam albo poczekaj na drużynę.');
  await beginHunt(db, player, body, now, { party: { ...party_, names: [player.row.name, ...went.map((member) => member.row.name)] }, partners: partnersOf(player, [player, ...went]) });
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

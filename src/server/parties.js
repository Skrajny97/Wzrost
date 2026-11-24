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
// wyzszej niz 5"; 10 since 18.11.2026, the author: "Rozszerz możliwość
// zapraszania do drużyny do 10 poziomów klasy"; engine parties.js): an
// invitation and a joining keep to it, and one whose level grows out of it
// leaves the party (partyOf). Only class levels count here, never the
// character levels.
//
// The leader invites a character by its name; a party comes with the first
// invitation. The invited one accepts or declines; a member leaves when it
// wants, and the leader may send one out. A leader who leaves passes the
// lead to the member who joined first, and a party nobody is in is gone;
// since 20.11.2026 the leader may hand it to any member (handPartyLead). A
// party of one is a party only while an invitation of it waits: declined,
// withdrawn, or with the others gone, it ends (partyOf, 11.11.2026), so its
// companions do not stay in the Kwatery for a party that is not there.
//
// An exploration of the party: every member free now (at home, with nothing
// going on) goes with the leader to the place and for the length the leader
// chose, if each of them has them open; the others stay in the party and go
// the next time they are free. Which of its player's characters is played
// makes no difference since 0.4.59: one set aside goes too, and its report
// waits for it (the author, 19.11.2026: „przecież trzeba to jakoś
// rozdzielić”); before, it stayed home. Since 10.11.2026 a
// member whose exploration or work has ended goes too: its report is
// claimed first, as its own "Odbierz raport" would claim it (claimForTrip;
// the author: „Koniecznie musimy zrobić jakieś obejście odbierania raportu
// przez każdego członka drużyny zanim wyruszy się w kolejną wyprawę.”).
// Each one gets
// an exploration of its own (hunts.js), with the others fighting beside it
// as they are when they set out, and its own finds. Since 24.11.2026 the
// first claim of a trip, by any who went, claims it for all of them at
// once, each its own report with what every one got (hunts.js: claimTrip;
// the author: „niech lider odbiera raport za wszystkich, niech wszyscy mają
// wspólny”), so nobody's report waits for its player and the leader sends
// the party out again at once. The
// explorations of one trip share their timer: a "Przewiń" of any of them
// moves them all, and the others hear who skipped (time.js; the author:
// "Musi być wspólny timer").
//
// A party hunts without companions (the author: "wtedy nie poluje się z
// towarzyszem, tylko samemu/z drużyną"): its trip takes none (beginHunt's
// `party`). Since 18.11.2026 that is all a party changes for them: the
// character's own explorations, the Labirynt and the portals take its
// companions in a party too, and the Walka asks the leader "Z drużyną" or
// "Z towarzyszami" (players and the author: „z drużyną/z towarzyszami”;
// partyView's `ownCompanions` names them). Before, from 828 B (11.11.2026),
// every companion stayed in the Kwatery while the character was in a party,
// and before that a character whose companion went on the explorations
// neither made a party nor joined one until it was told to stay. Before it
// makes or joins one the page still tells it once which of them will not
// go on the party's trips (partyView's `companions`).

import {
  areaFor,
  areaOpenFor,
  carryLimit,
  challengeAt,
  companionsGoingMost,
  companionStays,
  fightKind,
  huntDurations,
  isUnlocked,
  longestHunt,
  mountOf,
  mountStage,
  partyFit,
  partyRange,
  partyStayText,
  potionsPerKind,
  tripWanted,
  wantedTarget,
} from '../engine/index.js';
import { assertion, atomically, raced } from './atomic.js';
import { characterView, currentHp, earlyAreaOf, engineCharacter, equippedItems, loadCharacter, loadPlayer, requireIdlePlayer, requirePlayer, settleCharacter } from './characters.js';
import { content } from './content.js';
import { nameColorOf, wayLook } from './cosmetics.js';
import { settlementOn } from './features.js';
import { guildTagSql } from './guilds.js';
import { beginHunt, finishActivity } from './hunts.js';
import { toHex } from './encoding.js';
import { ApiError, json, readJson } from './http.js';
import { accountLanguage, runInLanguage, t } from './i18n.js';
import { potionKnown, potionsOf } from './professions-view.js';
import { OWN_CHARACTERS } from './roles.js';

// The most invitations one party may have waiting.
const MAX_INVITES = 5;

// The party changed between its reading and the write.
const partyChanged = () => new ApiError(409, 'changed', 'Drużyna zmieniła się w międzyczasie. Spróbuj jeszcze raz.');

// The class levels of a party's members, in its order.
async function classLevels(db, partyId) {
  const { results } = await db
    .prepare('SELECT c.class_level FROM party_members m JOIN characters c ON c.id = m.character_id WHERE m.party_id = ? ORDER BY m.joined_at, m.character_id')
    .bind(partyId)
    .all();
  return results.map((row) => row.class_level);
}

// Why a character of `classLevel` cannot be in a party of `levels`, or
// null; `name` is the character's, another player's, or null for the
// player's own. Each a whole sentence, for its English (i18n.js).
function levelGap(name, classLevel, levels) {
  const { from, to } = partyRange(levels, content());
  if (classLevel >= from && classLevel <= to) return null;
  const { classSpread } = content().balance.parties;
  return new ApiError(
    409,
    'level_gap',
    name
      ? `${name} ma ${classLevel}. poziom klasy. Poziomy klas w drużynie mogą się różnić najwyżej o ${classSpread}, więc teraz dołączy postać z poziomem klasy od ${from} do ${to}.`
      : `Masz ${classLevel}. poziom klasy. Poziomy klas w drużynie mogą się różnić najwyżej o ${classSpread}, więc teraz dołączy postać z poziomem klasy od ${from} do ${to}.`,
  );
}

// Why a Drużyna's trip cannot go as a Trudna (`mode` 'hard') or a
// Piekielna ('hell') wyprawa: `name`, one of those going, has not opened it
// yet (balance.challenge's level). Each a whole sentence, for its English
// (i18n.js).
function challengeLocked(name, mode) {
  const level = content().balance.challenge.fromLevel;
  return mode === 'hell'
    ? new ApiError(403, 'party_hell_locked', `${name} nie ma jeszcze Piekielnej wyprawy: otworzy się na ${level}. poziomie postaci. Drużyna idzie na nią tylko wtedy, gdy może każdy z was.`)
    : new ApiError(403, 'party_hard_locked', `${name} nie ma jeszcze Trudnej wyprawy: otworzy się na ${level}. poziomie postaci. Drużyna idzie na nią tylko wtedy, gdy może każdy z was.`);
}

const unlock = () => content().unlocksById.party;
const size = () => content().balance.parties.size;

function requireUnlocked(row) {
  if (!isUnlocked('party', row.level, content())) throw new ApiError(403, 'locked', `Drużynę odblokujesz na poziomie postaci ${unlock().level}.`);
}

async function requirePartyPlayer(context) {
  const found = await requirePlayer(context);
  requireUnlocked(found.player.row);
  return found;
}

// The question before a character of `row` makes or joins a party (828 B):
// the words naming its companions who go on the explorations and will not
// go on the party's trips, with the title and the button of the question
// for making one (the first invitation) and for joining one; null when
// none goes, or without the Osada.
function companionsQuestion(row) {
  const text = settlementOn() ? partyStayText(JSON.parse(row.settlement ?? '{}').companions ?? [], content()) : null;
  if (!text) return null;
  const { texts } = content().settlement.companions;
  return { text, make: { title: texts.partyMakeTitle, confirm: texts.partyMake }, join: { title: texts.partyJoinTitle, confirm: texts.partyJoin } };
}

// In a party, the names of the companions of a character of `row` who go on
// its own explorations (those not told to stay, as many as may go): the
// Walka's "Z towarzyszami" names them. None without the Osada.
const ownCompanions = (row) =>
  settlementOn()
    ? (JSON.parse(row.settlement ?? '{}').companions ?? [])
        .filter((companion) => !companionStays(companion))
        .slice(0, companionsGoingMost(content()))
        .map((companion) => companion.name)
    : [];

// The party a character is in: its id, leader and members (character ids
// in the order they joined), or null. The Wieża Drużyn climbs with it
// (towers.js).
export async function partyOf(db, characterId) {
  const membership = await db.prepare('SELECT party_id FROM party_members WHERE character_id = ?').bind(characterId).first();
  if (!membership) return null;
  const [party, members] = await db.batch([
    db.prepare('SELECT id, leader_id FROM parties WHERE id = ?').bind(membership.party_id),
    db
      .prepare('SELECT m.character_id, c.class_level, c.user_id FROM party_members m JOIN characters c ON c.id = m.character_id WHERE m.party_id = ? ORDER BY m.joined_at, m.character_id')
      .bind(membership.party_id),
  ]);
  const row = party.results[0];
  if (!row) {
    // A membership whose party is gone (made and emptied at once) goes too.
    await db.prepare('DELETE FROM party_members WHERE character_id = ? AND party_id = ?').bind(characterId, membership.party_id).run();
    return null;
  }
  // A party is of characters of different players (1.11.2026): a second
  // character of one player leaves, the first in the party's order staying,
  // the leader before all. Since 0.4.59 a character set aside goes on its
  // party's trips, so two of one player would go together; none joins so
  // any more (acceptPartyInvite), and one that joined before goes here.
  const list = members.results.map((member) => ({ id: member.character_id, classLevel: member.class_level, userId: member.user_id }));
  const leader = list.find((member) => member.id === row.leader_id);
  const players = new Set(leader ? [leader.userId] : []);
  const twice = [];
  const others = [];
  for (const member of list) {
    if (member === leader) continue;
    (players.has(member.userId) ? twice : others).push(member);
    players.add(member.userId);
  }
  // One whose class level grew more than the spread apart leaves too (engine
  // partyFit): the leader stays, and the members in the party's order who
  // fit with those staying.
  const { apart } = leader ? partyFit(leader, others, content()) : { apart: [] };
  const leaving = [...twice, ...apart];
  if (leaving.length > 0) {
    const ids = leaving.map((member) => member.id);
    await db.batch(partyRemoval(db, ids.map(() => '?').join(', '), ids));
    if (ids.includes(characterId)) return null;
  }
  const staying = list.filter((member) => !leaving.includes(member)).map((member) => member.id);
  // A party of one with no invitation waiting is no party: after a declined
  // or withdrawn invitation, or once the others have left, it ends, so its
  // last member's companions go on the explorations again at once (828 B:
  // they stay in the Kwatery only while there is a party).
  if (staying.length < 2 && !(await db.prepare('SELECT 1 AS one FROM party_invites WHERE party_id = ? LIMIT 1').bind(row.id).first())) {
    if (staying.length > 0) await db.batch(partyRemoval(db, staying.map(() => '?').join(', '), staying));
    return null;
  }
  return { id: row.id, leaderId: row.leader_id, memberIds: staying };
}

// Whether a member's activity has ended with a report to claim: an
// exploration or a profession's work, not a mercenary's offer or service,
// whose close waits in the Karczma (mercenaries.js).
const reportWaits = (kind, endsAt, now) => kind !== 'mercenary' && endsAt <= now;

// A member's state for the party's list: free (at home, or back with its
// report waiting, which the party's setting out claims: partyHunt), away
// (on an exploration) or working (at a profession's work). Only the free go
// along. Whether its player plays it now does not count: before 0.4.59 one
// whose player played another character was 'aside' and stayed home (the
// author, 19.11.2026: „dlaczego system robił błąd kiedy ktoś zmienia
// postać? przecież trzeba to jakoś rozdzielić”).
function memberStatus(row, now) {
  if (!row.activity || reportWaits(row.activity, row.activity_ends, now)) return 'free';
  return row.activity === 'hunt' ? 'away' : 'working';
}

// The stage of the Stajnia's mount of a character's row (327 A): a party's
// trip waits as long as the slowest mount of those who go.
const mountOfRow = (row) => (settlementOn() ? mountStage(JSON.parse(row.settlement ?? '{}'), content()) : 0);

// The Drużyna for the page: the party, with its members, the invitations it
// sent and the limits of its explorations (the lowest member's), and the
// invitations waiting for this character.
export async function partyView(db, characterId, now) {
  const party = await partyOf(db, characterId);
  const [members, sent, invites, self] = await db.batch([
    db
      .prepare(
        `SELECT c.id, c.name, c.class_id, c.level, c.class_level, c.role, c.settlement, c.cosmetics, u.seen_at, ${guildTagSql('c.id')} AS guild_tag,
                (SELECT a.kind FROM activities a WHERE a.character_id = c.id) AS activity, (SELECT a.ends_at FROM activities a WHERE a.character_id = c.id) AS activity_ends
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
    db.prepare('SELECT class_level, settlement, party_potions FROM characters WHERE id = ?').bind(characterId),
  ]);
  const { onlineSeconds } = content().community.trade;
  const list = members.results.map((row) => ({
    id: row.id,
    name: row.name,
    guildTag: row.guild_tag ?? null,
    nameColor: nameColorOf(row.cosmetics),
    classId: row.class_id,
    className: content().classesById[row.class_id]?.name ?? '',
    level: row.level,
    classLevel: row.class_level,
    leader: row.id === party?.leaderId,
    own: row.id === characterId,
    status: memberStatus(row, now),
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
        minutes: longestHunt(lowest.level, content()),
        minutesBy: lowest.name,
        classLevel: lowestClass.classLevel,
        classLevelBy: lowestClass.name,
        mount: { shorter: mountOf(slowest.mount, content())?.shorter ?? 0, by: slowest.name },
      },
    },
    // The class levels a character invited now may have, and the spread.
    range: { ...partyRange(levels, content()), spread: content().balance.parties.classSpread },
    invites: invites.results.map((row) => ({ partyId: row.party_id, invitedBy: row.invited_by, members: row.members ?? '', at: row.created_at })),
    unlockLevel: unlock().level,
    // Out of a party, the one question before making or joining one, when
    // a companion goes on the explorations (companionsQuestion).
    companions: !party && self.results[0] ? companionsQuestion(self.results[0]) : null,
    // In a party, the companions of the character's own explorations.
    ownCompanions: party && self.results[0] ? ownCompanions(self.results[0]) : [],
    // In a party, the potions it takes along as a member (memberPotions):
    // { potions, healBelow } as saved, or null for none.
    potions: party && self.results[0] ? partyPotionsOf(self.results[0]) : null,
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
// Not one of its own player's characters (a party is of characters of
// different players, 1.11.2026), nor one whose player hid the inviting
// one's in the chat.
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
  if (!isUnlocked('party', target.level, content())) {
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
  const gap = levelGap(target.name, target.class_level, party ? await classLevels(db, party.id) : [player.row.class_level]);
  if (gap) throw gap;
  if (!party) {
    // The party, its leader and the first invitation at once, in one
    // transaction: a party of one is a party only while an invitation waits
    // (partyOf).
    try {
      await db.batch([
        db.prepare('INSERT INTO parties (leader_id, created_at) VALUES (?, ?)').bind(player.row.id, context.now),
        db.prepare('INSERT INTO party_members (character_id, party_id, joined_at) VALUES (?, last_insert_rowid(), ?)').bind(player.row.id, context.now),
        db
          .prepare('INSERT INTO party_invites (party_id, character_id, invited_by, created_at) SELECT party_id, ?, ?, ? FROM party_members WHERE character_id = ?')
          .bind(target.id, player.row.id, context.now, player.row.id),
      ]);
    } catch {
      // Another request made one meanwhile.
      throw partyChanged();
    }
    return answer(db, player.row.id, context.now, { text: t('Zaproszenie wysłane. {name} przyjmie je w Społeczności, w Drużynie.', { name: target.name }) });
  }
  const waiting = await db.prepare('SELECT COUNT(*) AS count FROM party_invites WHERE party_id = ?').bind(party.id).first();
  if (waiting.count >= MAX_INVITES) throw new ApiError(409, 'too_many_invites', `Na odpowiedź czeka już ${MAX_INVITES} zaproszeń.`);
  await db
    .prepare('INSERT OR IGNORE INTO party_invites (party_id, character_id, invited_by, created_at) VALUES (?, ?, ?, ?)')
    .bind(party.id, target.id, player.row.id, context.now)
    .run();
  return answer(db, player.row.id, context.now, { text: t('Zaproszenie wysłane. {name} przyjmie je w Społeczności, w Drużynie.', { name: target.name }) });
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
  // Not into a party with another of the player's characters, played or set
  // aside: a party is of characters of different players (1.11.2026), and
  // since 0.4.59 one set aside goes on its trips too (partyOf). Said only to
  // the player, so the inviting one learns nothing of its characters.
  const own = await db
    .prepare('SELECT c.name FROM party_members m JOIN characters c ON c.id = m.character_id WHERE m.party_id = ? AND c.user_id = ? AND c.id != ?')
    .bind(invite.party_id, player.row.user_id, player.row.id)
    .first();
  if (own) throw new ApiError(409, 'own_in_party', `W tej drużynie jest już Twoja postać ${own.name}. Drużynę tworzą postacie różnych graczy.`);
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
      .bind(player.row.id, invite.party_id, context.now, invite.party_id, invite.party_id, size(), player.row.class_level, player.row.class_level, invite.party_id, content().balance.parties.classSpread)
      .run();
  } catch {
    throw new ApiError(409, 'in_party', 'Najpierw opuść swoją drużynę.');
  }
  await db.prepare('DELETE FROM party_invites WHERE character_id = ? AND (party_id = ? OR ? = 1)').bind(player.row.id, invite.party_id, joined.meta.changes).run();
  if (joined.meta.changes !== 1) {
    const levels = await classLevels(db, invite.party_id);
    const gap = levels.length > 0 && levels.length < size() && levelGap(null, player.row.class_level, levels);
    throw gap || new ApiError(409, 'full', 'Ta drużyna jest już pełna albo jej nie ma.');
  }
  return answer(db, player.row.id, context.now, { text: t('Jesteś w drużynie. Lider zabierze Cię na najbliższą wyprawę, gdy nie będziesz mieć innych zajęć.') });
}

// POST /api/party/decline { partyId }
export async function declinePartyInvite(context) {
  const { player } = await requirePartyPlayer(context);
  const db = context.env.DB;
  const body = await readJson(context.request);
  await db.prepare('DELETE FROM party_invites WHERE party_id = ? AND character_id = ?').bind(partyIdOf(body), player.row.id).run();
  return answer(db, player.row.id, context.now);
}

// The messages of the parties gone, in their chat (chat.js, "party:<id>",
// read by its index as the channels from "party:" up to "party;"), but
// those reported and not decided yet, which wait for the moderation.
const PARTY_GONE = "channel >= 'party:' AND channel < 'party;' AND substr(channel, 7) NOT IN (SELECT CAST(id AS TEXT) FROM parties)";
const UNREPORTED = 'id NOT IN (SELECT message_id FROM chat_reports WHERE closed_at IS NULL)';

// The statements that take characters out of their parties (`characters`:
// SQL for their ids, with `binds`): a leader's lead goes to the member who
// joined first after it, and a party left empty goes with its invitations
// and its chat's messages. Also for a deleted account (accounts.js).
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
    db.prepare(`DELETE FROM chat_reports WHERE message_id IN (SELECT id FROM chat_messages WHERE ${PARTY_GONE} AND ${UNREPORTED})`),
    db.prepare(`DELETE FROM chat_mentions WHERE message_id IN (SELECT id FROM chat_messages WHERE ${PARTY_GONE} AND ${UNREPORTED})`),
    db.prepare(`DELETE FROM chat_messages WHERE ${PARTY_GONE} AND ${UNREPORTED}`),
  ];
}

const leaveStatements = (db, characterId) => partyRemoval(db, '?', [characterId]);

// 1178 B (the author, 19.11.2026, on a player's report that a party went
// without a member who had set out alone): a member who sets out alone on
// an exploration is asked first whether to leave the party ("Jesteś w
// drużynie. Wyjść z drużyny?"). With `leaveParty` it leaves as "Opuść"
// does: the statements returned go into the caller's own batch, so the
// leaving and the start are one write. The leader still sets out alone as
// before. A switch of characters asks nothing since 0.4.59 (the author:
// „to jest jednak irytujące dla graczy i w sumie bezsensowne”): the
// character stays in its party and goes on its trips. The Wieża Solo, the
// Labirynt and the Portale ask nothing either: their fights are over at
// once and take the character away from no trip; nor do the professions
// (1.11.2026).
export async function partyGate(db, characterId, body) {
  const party = await partyOf(db, characterId);
  if (!party || party.leaderId === characterId) return [];
  if (body?.leaveParty !== true) throw new ApiError(409, 'in_party', t('Jesteś w drużynie. Wyjść z drużyny?'));
  return leaveStatements(db, characterId);
}

// POST /api/party/leave: the character leaves (the author: "1 członek
// wychodzić z nich jak stwierdzi ze potrzebuje Profesje robić"; since
// 1.11.2026 the professions need no leaving, see the top). An exploration
// already under way goes on as it began.
export async function leaveParty(context) {
  const { player } = await requirePartyPlayer(context);
  const db = context.env.DB;
  if (!(await partyOf(db, player.row.id))) throw new ApiError(409, 'no_party', 'Nie jesteś w drużynie.');
  await db.batch(leaveStatements(db, player.row.id));
  return answer(db, player.row.id, context.now, { text: t('Opuszczasz drużynę.') });
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

// POST /api/party/lead { characterId }: the leader hands the lead to another
// member and stays in the party as an ordinary one (the author, 20.11.2026:
// „Dodaj też opcje przekazania pozycji lidera w drużynie”). All the leader
// may do goes with it: inviting, taking back invitations, removing members
// and sending the party out; the invitations already sent stay the party's. One
// write, holding only while the one asking still leads and the one named
// is still in the party, so of two hand-overs at once (a double tap, two
// cards) one saves and the other hears that the party changed. A trip
// under way goes on as it set out: its crew, its leader (first of its
// roster: the creatures of the newest place, its party event) and its
// options are kept with each exploration (setOut), so the new leader leads
// from the next trip on. The party's chat has no lines of the System, so
// none is written.
export async function handPartyLead(context) {
  const { player } = await requirePartyPlayer(context);
  const db = context.env.DB;
  const body = await readJson(context.request);
  const { texts } = content().community.party;
  const party = await partyOf(db, player.row.id);
  if (!party || party.leaderId !== player.row.id) throw new ApiError(403, 'not_leader', texts.notLeader);
  const id = Number(body.characterId);
  if (id === player.row.id) throw new ApiError(400, 'self', texts.self);
  if (!party.memberIds.includes(id)) throw new ApiError(404, 'no_member', 'Tej postaci nie ma w drużynie.');
  await atomically(
    db,
    [
      assertion(db, '(SELECT leader_id FROM parties WHERE id = ?) = ? AND EXISTS (SELECT 1 FROM party_members WHERE party_id = ? AND character_id = ?)', [party.id, player.row.id, party.id, id]),
      db.prepare('UPDATE parties SET leader_id = ? WHERE id = ? AND leader_id = ?').bind(id, party.id, player.row.id),
    ],
    partyChanged,
  );
  const view = await partyView(db, player.row.id, context.now);
  const heir = view.party?.members.find((member) => member.id === id);
  return json({ ...view, text: texts.led.replace('{name}', heir?.name ?? '') });
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

// Mikstury członków drużyny (the author, 20.11.2026: „Powinna byc opcja
// zabierania przez reszte drużyny jakos mikstur zdrowia i many”): a member,
// not the leader, chooses in the Drużyna the healing and mana potions it
// takes along on its party's trips, and its healing mark, as "Opcje
// wyprawy" does for a "Wyrusz" (combat.js). Kept on its row
// (characters.party_potions) for later trips and parties: { potions: { [id]:
// count }, healBelow }, or null for none, which takes nothing (as before
// 20.11.2026). The leader takes its own in "Opcje wyprawy"; a member that
// comes to lead keeps its choice for when it is a member again.
function partyPotionsOf(row) {
  try {
    const kept = JSON.parse(row.party_potions ?? 'null');
    return kept && typeof kept === 'object' && !Array.isArray(kept) && kept.potions && typeof kept.potions === 'object' ? kept : null;
  } catch {
    return null;
  }
}

// The potion of `id` when a member may choose it: one of healing or mana.
function memberPotion(id) {
  const potion = Object.hasOwn(content().potionsById, id) ? content().potionsById[id] : null;
  return potion && ['heal', 'mana'].includes(fightKind(potion)) ? potion : null;
}

// What a member going on a trip of `minutes` takes along of its choice, by
// a "Wyrusz"'s rules (takenPotions in hunts.js): the potions whose recipes
// it knows, of each at most as many as its bag holds and as the trip has
// fights; and its healing mark. { potions, healBelow } for its start
// (beginHunt), or {} for none.
function memberPotions(row, minutes) {
  const kept = partyPotionsOf(row);
  if (!kept) return {};
  const have = potionsOf(row);
  const most = potionsPerKind(minutes, content());
  const potions = {};
  for (const [id, count] of Object.entries(kept.potions)) {
    const potion = memberPotion(id);
    if (!potion || !Number.isInteger(count) || !potionKnown(row, potion)) continue;
    const take = Math.min(count, have[id] ?? 0, carryLimit(potion, most));
    if (take > 0) potions[id] = take;
  }
  if (Object.keys(potions).length === 0) return {};
  const { healBelow, healBelowChoices } = content().potionUse;
  return { potions, healBelow: healBelowChoices.includes(kept.healBelow) ? kept.healBelow : healBelow };
}

// The others of a Drużyna as its trip would take them now, for the threat
// of the trip (hunts.js: huntOptions; gracz (poz. 95), 24.11.2026: „żeby
// system przeliczał ryzyko wyprawy dla drużyny razem z innymi graczami w
// drużynie”): the members free now, or back with a report waiting, as the
// setting out takes them (setOut), each with its character, its gear, its
// HP as a share of its most in tenths (so the threat is asked anew only as
// it rests by a tenth) and the potions of its choice (memberPotions; those
// of the longest trip, the threat's trips taking of each one a fight). Only
// for the party's leader with a member to take: null otherwise, and the
// threat is the character's own.
export async function threatCrew(db, player, now) {
  const party = await partyOf(db, player.row.id);
  if (!party || party.leaderId !== player.row.id) return null;
  const others = (await Promise.all(party.memberIds.filter((id) => id !== player.row.id).map((id) => loadCharacter(db, id)))).filter(Boolean);
  const going = others.filter((other) => !other.activity || reportWaits(other.activity.kind, other.activity.ends_at, now));
  if (going.length === 0) return null;
  const longest = content().balance.hunt.maxMinutes;
  return going.map((member) => {
    const { hp, maxHp } = currentHp(member, now);
    const { potions = {}, healBelow } = memberPotions(member.row, longest);
    return {
      id: member.row.id,
      name: member.row.name,
      character: engineCharacter(member.row),
      equipped: equippedItems(member),
      hpShare: Math.max(1, Math.floor((hp / maxHp) * 10)) / 10,
      potions,
      ...(healBelow !== undefined && { healBelow }),
    };
  });
}

// PUT /api/party/potions { potions: { [id]: count }, healBelow }: a member's
// choice of potions for its party's trips (memberPotions): healing and mana
// potions by id, each a whole number from 0 to the fights of the longest
// exploration, and a healing mark of potionUse (its usual one when none
// comes). A choice of nothing is kept as none. Saved as it comes, whatever
// the bag holds now: the trip takes what there is as it sets out. Answers
// the Drużyna anew.
export async function setPartyPotions(context) {
  const { player } = await requirePartyPlayer(context);
  const db = context.env.DB;
  const body = await readJson(context.request);
  const asked = body.potions ?? {};
  if (typeof asked !== 'object' || asked === null || Array.isArray(asked)) throw new ApiError(400, 'invalid_potions', 'Wybierz mikstury na wyprawę.');
  const most = potionsPerKind(content().balance.hunt.maxMinutes, content());
  const potions = {};
  for (const [id, count] of Object.entries(asked)) {
    if (!memberPotion(id)) throw new ApiError(400, 'invalid_potions', 'Tej mikstury nie zabiera się na wyprawę.');
    if (!Number.isInteger(count) || count < 0 || count > most) throw new ApiError(400, 'invalid_potions', `Zabierz od 0 do ${most} sztuk.`);
    if (count > 0) potions[id] = count;
  }
  const { healBelow: usual, healBelowChoices } = content().potionUse;
  const healBelow = body.healBelow ?? usual;
  if (!healBelowChoices.includes(healBelow)) throw new ApiError(400, 'invalid_heal_below', 'Wybierz próg mikstury leczenia.');
  const kept = Object.keys(potions).length > 0 || healBelow !== usual ? JSON.stringify({ potions, healBelow }) : null;
  await db.prepare('UPDATE characters SET party_potions = ? WHERE id = ?').bind(kept, player.row.id).run();
  return answer(db, player.row.id, context.now);
}

// A party's boon as kept (parties.boon, party-events.js): its { haste, xp,
// gold } shares, or null for none, or one that does not read.
function boonOf(text) {
  try {
    const boon = JSON.parse(text ?? 'null');
    return boon && typeof boon === 'object' && !Array.isArray(boon) && Object.keys(boon).length > 0 ? boon : null;
  } catch {
    return null;
  }
}

// What a member brings into the others' fights: itself as it is now.
function snapshot(member, now) {
  return { id: member.row.id, name: member.row.name, character: engineCharacter(member.row), equipped: equippedItems(member), hp: currentHp(member, now).hp };
}

// The report of a member whose exploration or work has ended, claimed as
// its party sets out, exactly as its own "Odbierz raport" would claim it
// (finishActivity in hunts.js): after what every request of its player
// settles first, in its account's language, with its rewards, the potions
// used up, the quests and all, the report in its Dziennik as any other.
// Gives { member } as it is after it, with { report } (the report's id and
// kind) unless the work made none; { event } when its exploration ends in
// an event, which waits for the member's own choice (nothing is saved);
// {} when the member is still not free. A claim that failed because the
// member claimed it at the same moment, or changed meanwhile, is fine: the
// member is read again, and goes if free by then. A trip of the party
// still waiting is claimed for all who went at once, by the `leader` who
// sends the party now (claimTrip in hunts.js), its shared report marked on
// each one's Walka (characters.party_report) instead of `report`; `settled`
// names them all. Its party event, waiting for the trip's leader, does not
// hold the party up: it settles itself with its `auto` option (`forTrip`;
// party-events.js).
async function claimForTrip(db, member, now, leader) {
  const id = member.row.id;
  const user = await db.prepare('SELECT language FROM users WHERE id = ?').bind(member.row.user_id).first();
  try {
    return await runInLanguage(accountLanguage(user?.language), async () => {
      await settleCharacter(db, member, now);
      // Settling reads the character again by its player when another
      // request changed it meanwhile (loadPlayer), which gives the one
      // played: for a member set aside, or one whose player went over to
      // another character meanwhile, not this one. It stays home this time,
      // and no other character's report is claimed for it.
      if (member.row.id !== id || !member.activity) return {};
      const kind = member.activity.kind;
      const done = await finishActivity(db, member, now, { forTrip: true, claimer: { id: leader.id, name: leader.name } });
      if (done?.event) return { event: true };
      // Played or set aside, it goes (0.4.59).
      const after = await loadCharacter(db, id);
      if (!after) return {};
      return done?.shared ? { member: after, report: null, settled: [...done.shared.keys()] } : { member: after, report: done ? { id: done.id, kind } : null };
    });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const again = await loadCharacter(db, id);
    return again && !again.activity ? { member: again } : {};
  }
}

// POST /api/party/hunt { areaId, minutes, ... as "Wyrusz" }: the leader
// sends the party out. The members free now go, and those back with their
// report waiting, claimed first (claimForTrip) once the leader's choices
// are checked; one whose exploration ends in an event stays home, and the
// answer says it must choose there first (`notes`). Each of them, the
// leader too, must have the place and the length open, so the party goes
// only as far and as long as its lowest member may, and waits as long as
// its slowest mount (the Stajnia, 327 A). The leader's choices of potions
// and tracking are its own; the others go without them, but since
// 20.11.2026 each takes its own healing and mana potions as it chose them in
// the Drużyna (memberPotions; none without a choice). A Trudna or a
// Piekielna wyprawa (`hard`, `hell`) is the whole trip's, for every member
// who goes, and only where each of them has it open (the author,
// 19.11.2026: „Trudne i Piekielne wyprawy zrób tak by można je bylo robić z
// drużyną”; challengeLocked). A member busy with
// something still running is left alone, its activity untouched. With no
// member able to go, nobody goes, the leader neither (a player's bug
// report, 12.11.2026: „Po wyruszeniu na wyprawę z drużyną czasem nie
// załącza się jazda w 2 tylko solo”, and skips spent on a trip the leader
// took for the party's): the answer says who must choose first.
//
// The starts of all who go and the trip's crew are written in one batch
// (setOut), so a trip sets out whole or not at all. Before, each start was
// written on its own and the crew after them all: a request that failed
// in between (a database error, a request cut off) left the explorations
// that had started with the party's names but no crew, and each was fought
// from its own seed, the others beside it only as they set out and gone
// once fallen; the leader's report won with the party while a member's
// lost alone, on the same trip (players, 18.11.2026: „byłem sam bez
// drużyny”). The batch holds only while the leader (still leading) and
// each member going are as read; when one changed meanwhile, the party is
// read anew and sets out again, without one that got busy at that very
// moment, a few times at most (SET_OUT_TRIES).
const SET_OUT_TRIES = 3;

export async function partyHunt(context) {
  let { session, player } = await requireIdlePlayer(context);
  requireUnlocked(player.row);
  const db = context.env.DB;
  const now = context.now;
  const body = await readJson(context.request);
  // A member's report claimed for the trip (claimForTrip), kept through the
  // tries: its Walka tells it and opens it (`claimed` below).
  const claimed = new Map();
  for (let tries = 1; ; tries += 1) {
    const out = await setOut(db, player, body, now, claimed);
    if (out) {
      return json(
        {
          character: characterView(await loadPlayer(db, session.userId), now),
          ...(await partyView(db, player.row.id, now)),
          ...out,
        },
        201,
      );
    }
    if (tries === SET_OUT_TRIES) throw partyChanged();
    ({ session, player } = await requireIdlePlayer(context));
  }
}

// One try of partyHunt: the trip's starts and crew in one batch. Gives {
// went, notes } for the answer, or null when the batch did not hold (the
// leader or a member changed meanwhile, or a member's exploration began
// meanwhile): nothing was written then.
async function setOut(db, player, body, now, claimed) {
  const party = await partyOf(db, player.row.id);
  if (!party) throw new ApiError(409, 'no_party', 'Nie masz drużyny.');
  if (party.leaderId !== player.row.id) throw new ApiError(403, 'not_leader', 'Na wyprawę drużynę wysyła lider.');
  const others = (await Promise.all(party.memberIds.filter((id) => id !== player.row.id).map((id) => loadCharacter(db, id)))).filter(Boolean);
  // Every free member goes, also one whose player plays another character
  // now: its report waits for it there (0.4.59).
  const going = others.filter((other) => !other.activity || reportWaits(other.activity.kind, other.activity.ends_at, now));
  if (going.length === 0) throw new ApiError(409, 'nobody_free', 'Nikt z drużyny nie jest teraz wolny. Odznacz „Z drużyną” albo poczekaj, aż ktoś skończy swoje zajęcia.');
  const area = typeof body.areaId === 'string' ? areaFor(body.areaId, player.row.level, content()) : undefined;
  if (!area) throw new ApiError(400, 'invalid_area', 'Wybierz miejsce wyprawy.');
  // The trip's challenge, the Piekielna when both boxes come, as on a
  // "Wyrusz" alone (beginHunt): every member goes in it.
  const mode = body.hell === true ? 'hell' : body.hard === true ? 'hard' : null;
  for (const member of [player, ...going]) {
    if (!areaOpenFor(area, member.row.class_level, earlyAreaOf(member.row), content())) {
      throw new ApiError(403, 'party_area_locked', `${member.row.name} nie ma jeszcze otwartego miejsca ${area.name}. Drużyna idzie tylko tam, gdzie może każdy z was.`);
    }
    if (!huntDurations(member.row.level, content()).includes(body.minutes)) {
      throw new ApiError(403, 'party_duration_locked', `${member.row.name} może iść najwyżej na ${longestHunt(member.row.level, content())} minut. Drużyna idzie tylko tak długo, jak może każdy z was.`);
    }
    if (mode && !challengeAt(member.row.level, content())) throw challengeLocked(member.row.name, mode);
  }
  // The leader's own choices first (potions, the healing mark, tracking),
  // checked with nothing saved, so a wrong one sends nobody (the code
  // review) and claims nobody's report.
  await beginHunt(db, player, body, now, { party: { id: party.id }, check: true });
  // Then the members back from an exploration or a work: each report
  // claimed as its own "Odbierz raport" would claim it, the member as it is
  // after that. One that got busy meanwhile stays home, and so does one
  // whose exploration's event waits for its own choice (an exploration of
  // its own: a trip ends in no event, hunts.js).
  const ready = [];
  const choosing = [];
  // Those whose trip of the party another's claim here claimed with its own
  // (claimTrip): read again, they go.
  const settled = new Set();
  for (const listed of going) {
    if (!listed.activity) {
      ready.push(listed);
      continue;
    }
    if (settled.has(listed.row.id)) {
      const again = await loadCharacter(db, listed.row.id);
      if (again && !again.activity) ready.push(again);
      continue;
    }
    const done = await claimForTrip(db, listed, now, player.row);
    if (done.event) choosing.push(listed.row.name);
    for (const id of done.settled ?? []) settled.add(id);
    if (!done.member) continue;
    if (done.report) claimed.set(done.member.row.id, done.report);
    ready.push(done.member);
  }
  // With nobody to go along, nobody goes: not the leader alone either.
  if (ready.length === 0) {
    if (choosing.length > 0) {
      throw new ApiError(
        409,
        'party_choosing',
        `Nikt z drużyny nie może teraz wyruszyć. Wybór w zdarzeniu z poprzedniej wyprawy czeka na: ${choosing.join(', ')}. Poczekaj albo odznacz „Z drużyną” w Walce, by wyruszyć bez drużyny.`,
      );
    }
    throw new ApiError(409, 'nobody_free', 'Nikt z drużyny nie jest teraz wolny. Odznacz „Z drużyną” albo poczekaj, aż ktoś skończy swoje zajęcia.');
  }
  const everyone = [player, ...ready];
  // One time for the whole trip: the slowest mount of those going.
  const mount = Math.min(...everyone.map((member) => mountOfRow(member.row)));
  // The party's boon from a party event of a trip before (party-events.js):
  // this trip's, taken in the leader's start only as it was read (one
  // changed meanwhile has the party read anew), so no boon goes on two
  // trips. Its haste shortens every member's wait, as a mount does; its XP
  // and gold go with the trip (`boon`) to each member's claim (hunts.js).
  const kept = (await db.prepare('SELECT boon FROM parties WHERE id = ?').bind(party.id).first())?.boon ?? null;
  const boon = boonOf(kept);
  const haste = boon?.haste ?? 0;
  const takeBoon = kept
    ? [assertion(db, '(SELECT boon FROM parties WHERE id = ?) IS ?', [party.id, kept]), db.prepare('UPDATE parties SET boon = NULL WHERE id = ?').bind(party.id)]
    : [];
  const shots = new Map(everyone.map((member) => [member.row.id, snapshot(member, now)]));
  // `trip` marks the explorations of this setting out, for their shared
  // timer (time.js).
  const party_ = { id: party.id, leader: player.row.name, names: everyone.map((member) => member.row.name), trip: now };
  // The leader's start, then the members', each without the leader's
  // choices but the trip's challenge, with its own potions, made ready and
  // written below in one batch with the trip's crew: a member's potions
  // leave its bag only as the trip sets out, and one whose bag changed
  // meanwhile has the party read anew (its start's version). One whose
  // start cannot be made stays home.
  const setups = new Map([[player.row.id, await beginHunt(db, player, body, now, { party: party_, mount, haste, also: takeBoon, defer: true })]]);
  const went = [];
  for (const member of ready) {
    try {
      const own = {
        areaId: area.id,
        minutes: body.minutes,
        avoidRare: body.avoidRare === true,
        seekRare: body.seekRare === true && body.avoidRare !== true,
        hard: mode === 'hard',
        hell: mode === 'hell',
        // Its own potions of its choice, taken from its bag with its start
        // in the batch below (beginHunt), and back with its report.
        ...memberPotions(member.row, body.minutes),
      };
      const setup = await beginHunt(db, member, own, now, {
        party: party_,
        mount,
        haste,
        follower: true,
        defer: true,
      });
      setups.set(member.row.id, setup);
      went.push(member);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
    }
  }
  if (went.length === 0) throw new ApiError(409, 'nobody_free', 'Nikt z drużyny nie jest teraz wolny. Odznacz „Z drużyną” albo poczekaj, aż ktoś skończy swoje zajęcia.');
  // The trip as it set out, kept by each of its explorations (trips.js): its
  // own seed and its roster, those who went in its order with what each
  // brought, and how the leader leads it (with no companions: hunts.js), so
  // its fights come out the same in every member's report (the
  // author: "postacie z drużyny mają inne raporty odbytych walk. To nie
  // powinno mieć miejsca"). One that could not go after all (it got busy
  // at that very moment) fights in nobody's exploration (the author: "niech
  // się nie okaże, że jednak 3 walczą"): the batch does not hold, and the
  // next try leaves it home.
  const actual = [player, ...went];
  const lead = setups.get(player.row.id);
  const seed = toHex(crypto.getRandomValues(new Uint8Array(16)));
  // The wanted target the trip seeks (since 10.11.2026; the author:
  // „chcemy zrobić większy focus na drużynę, ergo poszukiwanych powinno moc
  // sie znajdywac nawet w drużynie, szczególnie mając tych samych”): of the
  // posters in hand for its place of those who went, the one most of them
  // hold, drawn from the trip's seed among those held alike (tripWanted in
  // the engine). Its fights may meet it as an exploration meets a poster's
  // target; every holder of a poster for it fulfils its own when it falls,
  // and the others fight it as a strong foe (wanted.js: wantedOnTrip). A
  // member keeps its poster with its exploration only for that target, so
  // one for another is not carried and may be given back on the way.
  const target = tripWanted(actual.map((member) => setups.get(member.row.id).wanted), seed);
  const crew = {
    ...party_,
    names: actual.map((member) => member.row.name),
    // How each looks on the way, for the others' Walka scene (640 A;
    // cosmetics.js).
    looks: actual.map((member) => ({ id: member.row.id, name: member.row.name, ...wayLook(member.row) })),
    seed,
    roster: actual.map((member) => {
      const setup = setups.get(member.row.id);
      // The potions each took along: the leader's of its "Opcje wyprawy", a
      // member's of its choice in the Drużyna (memberPotions); one that took
      // none fights without them, as before.
      const carries = member === player || Object.keys(setup.taken).length > 0;
      return { ...shots.get(member.row.id), windows: setup.windows, trophies: setup.trophies, ...(carries && { potions: setup.taken, healBelow: setup.healBelow }) };
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
      ...(target && { wanted: target }),
    },
    // The party's boon it set out with (party-events.js).
    ...(boon && { boon }),
    // A Trudna wyprawa ({ hard: true }) or a Piekielna ({ hell: true }),
    // as each member's start keeps it too: every member's report is fought
    // with the same stronger creatures (hunts.js: finishHunt).
    ...(mode && { [mode]: true }),
  };
  // A member whose report was claimed for this trip keeps where it is
  // (`claimed`), for its Walka to tell it and open it.
  const trip = `json_extract(options, '$.party.trip') = ? AND json_extract(options, '$.party.id') = ?`;
  try {
    await db.batch([
      // The one sending still leads: after a lead handed over meanwhile
      // (handPartyLead) the party is read anew, and only its new leader
      // sends it out.
      assertion(db, '(SELECT leader_id FROM parties WHERE id = ?) IS ?', [party.id, player.row.id]),
      ...actual.flatMap((member) => setups.get(member.row.id).statements),
      ...actual.map((member) => {
        const report = claimed.get(member.row.id);
        const poster = setups.get(member.row.id).wanted;
        const other = Boolean(poster) && !wantedTarget(poster, target);
        const set = `json_set(options, '$.party', json(?)${report ? ", '$.claimed', json(?)" : ''})`;
        return db
          .prepare(`UPDATE activities SET options = ${other ? `json_remove(${set}, '$.wanted')` : set} WHERE character_id = ? AND kind = 'hunt' AND ${trip}`)
          .bind(JSON.stringify(crew), ...(report ? [JSON.stringify(report)] : []), member.row.id, now, party.id);
      }),
    ]);
  } catch (error) {
    // An assertion of a start (the leader, a member or the boon changed
    // since read) or a member's exploration that began meanwhile.
    if (raced(error) || String(error?.message).includes('constraint')) return null;
    throw error;
  }
  return {
    went: went.map((member) => member.row.name),
    // Those whose exploration ended in an event: it waits for their choice.
    notes: choosing.map((name) => t('{name} musi najpierw wybrać w zdarzeniu z poprzedniej wyprawy.', { name })),
  };
}

// How many party invitations wait for a character, for the light on the
// Społeczność tab (chat.js).
export async function partyNews(db, characterId) {
  const row = await db.prepare('SELECT COUNT(*) AS count FROM party_invites WHERE character_id = ?').bind(characterId).first();
  return row.count;
}

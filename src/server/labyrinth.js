// The Labirynt Systemu (data/labyrinth.json, src/engine/labyrinth.js;
// DECISIONS.md, "Labirynt Systemu i Rdzeń", 850–866), where LABYRINTH is on
// (features.js), from the character level of unlocks.json (855 A: the 30th).
// The character's Labirynt of the day is kept in its row (`labyrinth`, as
// JSON) and goes at Polish midnight (854 A): a request still of the day gone
// changes nothing and writes no day back. A room is entered with the
// level, the row and the room the page saw, so two taps at once take one
// room; a fight's report is saved at once (kind "labyrinth", its own share
// of the Dziennik). The Labirynt takes nothing of the character's time,
// HP or potions: it goes on also during an exploration and the work of a
// profession, as the Portale (856 A), but not while the character serves
// as a mercenary. Its XP, gold, Odłamki and Artefakty come at once; a new
// level heals the character fully, unless it is away on an exploration,
// whose report settles its HP. The first guardian beaten opens the Rdzeń
// (855 A). Everything is saved in one batch only while the character is as
// read (atomic.js).

import {
  addQuestProgress,
  applyHunt,
  areasOpened,
  artifactView,
  blessingRules,
  buyAtMerchant,
  cardDropText,
  chooseBlessing,
  enterRoom,
  hpAfterHunt,
  huntKills,
  huntReport,
  isUnlocked,
  labyrinthCharLevel,
  labyrinthDay,
  labyrinthFighters,
  labyrinthFoes,
  labyrinthLevel,
  labyrinthLevels,
  labyrinthMap,
  laterPeriod,
  leaveMerchant,
  merchantPrices,
  newLabyrinth,
  reachableRooms,
  resetLabyrinth,
  resetPrice,
  resetsLeft,
  roomDanger,
  roomRefusal,
  roomRules,
  roomsAhead,
} from '../engine/index.js';
import { say } from '../engine/text.js';
import { atomically, sameVersion } from './atomic.js';
import { cardCollection, cardsHere, cardSummary, cardUpserts, droppedCards, maxedCards } from './cards.js';
import { characterView, coreOf, engineCharacter, equippedItems, loadPlayer, questsNow, requirePlayer, trophiesFor } from './characters.js';
import { content } from './content.js';
import { artifactData } from './core.js';
import { toHex } from './encoding.js';
import { labyrinthOn } from './features.js';
import { trialProgress } from './guild-trials.js';
import { ApiError, json, readJson } from './http.js';
import { t } from './i18n.js';
// As into a Portal: not while serving as a mercenary (requireFree), with
// the companions who go there (companionsOf, 850 A).
import { companionsOf, requireFree } from './portals.js';
import { trimReports } from './reports.js';
import { weekNow } from './weeks.js';

const rules = () => content().labyrinth;

// Off, nothing of the Labirynt answers; below its level it says when it opens.
function requireLabyrinth(row) {
  if (!labyrinthOn() || !rules()) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
  if (!isUnlocked('labyrinth', row.level, content())) {
    throw new ApiError(403, 'locked', `Labirynt Systemu odblokujesz na poziomie postaci ${content().unlocksById.labyrinth.level}.`);
  }
}

// The companions of the day's team still hired, as they are now.
const teamOf = (player, state) => (JSON.parse(player.row.settlement ?? '{}').companions ?? []).filter((companion) => state.team.includes(String(companion.id)));

// The character's Labirynt of `day` as kept, or null for none: a state of
// another day is gone.
function storedState(row, day) {
  let stored;
  try {
    stored = JSON.parse(row.labyrinth ?? '{}');
  } catch {
    stored = {};
  }
  return stored?.day === day ? stored : null;
}

// Today's Labirynt: the one kept, or a new one with the companions going now
// and the higher of the character's and its class's level (not saved until
// a room is entered). A request
// of a day already gone for the character (laterPeriod) changes nothing.
function todayOf(player, now) {
  const day = labyrinthDay(now, content());
  let stored;
  try {
    stored = JSON.parse(player.row.labyrinth ?? '{}');
  } catch {
    stored = {};
  }
  if (laterPeriod(stored?.day, day)) throw new ApiError(409, 'new_day', 'Labirynt właśnie zmienił się na nowy dzień. Spróbuj jeszcze raz.');
  return storedState(player.row, day) ?? newLabyrinth({ day, charLevel: labyrinthCharLevel({ level: player.row.level, classLevel: player.row.class_level }), companions: companionsOf(player), seed: toHex(crypto.getRandomValues(new Uint8Array(16))) });
}

// What a room is, in the words of the page.
const roomView = (id) => {
  const room = roomRules(id, content());
  return { id, name: room.name, text: room.text.replace('{heal}', String(Math.round(rules().spring.heal * 100))) };
};

const blessingView = (id) => {
  const blessing = blessingRules(id, content());
  return blessing ? { id, name: blessing.name, text: blessing.text } : null;
};

// The creatures waiting in a room of the map for the character (the page
// names them before the room is entered).
function foesOf(state, row, room, type) {
  if (!['fight', 'elite', 'guardian'].includes(type)) return null;
  const { encounter } = labyrinthFoes({ day: state.day, level: state.level, row, room, type, charLevel: state.charLevel }, content());
  return encounter.members.map((member) => ({ monsterId: member.monsterId, name: content().monstersById[member.monsterId].name, level: member.level }));
}

// The Labirynt for its page: the day and the levels (cleared, open), the
// level's map with the party's position, the creatures of every room, the
// danger of the fights still ahead (899 A) and the Odłamki of the elites and
// treasures, the rooms it may enter, the fighters with their HP, the
// blessings taken, a choice waiting (with the merchant's prices), the day's
// rewards and the words of the rooms.
function labyrinthView(player, state, now) {
  const map = labyrinthMap(state.day, state.level, content());
  const reachable = state.over || state.pending ? [] : reachableRooms(map, state.row, state.room);
  const character = engineCharacter(player.row);
  const equipped = equippedItems(player);
  const companions = teamOf(player, state);
  const fighters = labyrinthFighters(state, { character, equipped, name: player.row.name, companions }, content());
  const counts = {};
  for (const id of state.blessings) counts[id] = (counts[id] ?? 0) + 1;
  const prices = merchantPrices(state.charLevel, content());
  const pending = state.pending;
  const level = labyrinthLevel(state.level, content());
  const foes = map.rows.map((rooms, row) => rooms.map((room, index) => foesOf(state, row, index, room.type)));
  // The danger of the fights the party can still reach, against the party
  // as it is now, with the trophies for every creature of the map.
  const ahead = state.over ? new Set() : roomsAhead(map, state.row, state.room);
  const monsterIds = [...new Set(foes.flat().flatMap((list) => (list ?? []).map((foe) => foe.monsterId)))];
  const party = { character, equipped, name: player.row.name, companions, trophies: monsterIds.length > 0 ? trophiesFor(player, now, monsterIds) : {}, week: weekNow(now) };
  const dangerSeed = `danger:${state.day}:${player.row.id}`;
  const dangerOf = (row, index, type) => (ahead.has(`${row}:${index}`) ? roomDanger({ state, type, row, room: index, party, seed: dangerSeed }, content()) : null);
  return {
    day: state.day,
    level: state.level,
    charLevel: state.charLevel,
    levels: labyrinthLevels(content()).map((one, index) => ({
      number: index + 1,
      id: one.id,
      name: one.name,
      hell: Boolean(one.hell),
      cleared: state.cleared >= index + 1,
      open: index + 1 <= state.level,
    })),
    over: state.over,
    started: Boolean(storedState(player.row, state.day)),
    // Every room's creatures, which the board shows on its platforms (the
    // board of 13.11.2026: the party sees what waits ahead and picks its way).
    map: map.rows.map((rooms, row) =>
      rooms.map((room, index) => ({
        type: room.type,
        links: room.links,
        foes: foes[row][index],
        danger: dangerOf(row, index, room.type),
        shards: level.shards?.[room.type] ?? null,
      })),
    ),
    row: state.row,
    room: state.room,
    path: state.path,
    reachable,
    fighters: fighters.map(({ key, unit }) => ({
      key,
      name: unit.name,
      classId: unit.classId,
      appearance: unit.appearance,
      companion: key !== 'me',
      hp: unit.hp,
      maxHp: unit.maxHp,
    })),
    blessings: Object.entries(counts).map(([id, count]) => ({ ...blessingView(id), count })).filter((blessing) => blessing.name),
    pending: pending && {
      kind: pending.kind,
      from: pending.from ?? null,
      choices: (pending.choices ?? []).map(blessingView).filter(Boolean),
      ...(pending.kind === 'merchant' && { heal: pending.heal, blessing: pending.blessing, prices, healShare: rules().merchant.heal }),
    },
    gains: state.gains,
    // After a fight lost: the gold of starting again and the tries left today.
    reset: state.over === 'fainted' ? { price: resetPrice(state.charLevel, content()), left: resetsLeft(state, content()) } : null,
    rooms: rules().rooms.map((room) => roomView(room.id)),
  };
}

export async function getLabyrinth(context) {
  const { player } = await requirePlayer(context);
  requireLabyrinth(player.row);
  return json({ labyrinth: labyrinthView(player, todayOf(player, context.now), context.now) });
}

// The page after a change: the Labirynt and the character as saved.
async function answer(context, session, extra = {}) {
  const after = await loadPlayer(context.env.DB, session.userId);
  return json({ ...extra, labyrinth: labyrinthView(after, todayOf(after, context.now), context.now), character: characterView(after, context.now) });
}

// A request names the room it enters as the page saw it: the level, the
// row and the room; another one sees an old state.
function targetOf(body, state) {
  const whole = (value) => Number.isSafeInteger(value) && value >= 0;
  if (!whole(body.level) || !whole(body.row) || !whole(body.room)) throw new ApiError(400, 'invalid_room', 'Wybierz komnatę.');
  if (body.level !== state.level || body.row !== state.row + 1) throw new ApiError(409, 'stale_room', 'Labirynt zmienił się w międzyczasie. Spróbuj jeszcze raz.');
  return { row: body.row, room: body.room };
}

// { level, row, room }: a room entered. A fight is fought at once, its
// report saved; the gold, XP, Odłamki and an Artefakt come at once, and the
// first guardian beaten opens the Rdzeń.
export async function enterLabyrinth(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireLabyrinth(row);
  requireFree(player, context.now);
  const now = context.now;
  const db = context.env.DB;
  const body = await readJson(context.request);
  const state = todayOf(player, now);
  const target = targetOf(body, state);
  const map = labyrinthMap(state.day, state.level, content());
  const refusal = roomRefusal(state, map, target);
  if (refusal === 'over') throw new ApiError(409, 'labyrinth_over', state.over === 'done' ? 'Labirynt na dziś zdobyty do końca. Nowy o północy.' : 'Labirynt na dziś się skończył. Nowy o północy.');
  if (refusal === 'pending') throw new ApiError(409, 'choice_waiting', 'Najpierw wybierz, co dalej: błogosławieństwo albo kupiec czekają.');
  if (refusal) throw new ApiError(409, 'unreachable_room', 'Do tej komnaty nie prowadzi droga z miejsca, w którym stoi drużyna.');

  const character = engineCharacter(row);
  const equipped = equippedItems(player);
  const companions = teamOf(player, state);
  const type = map.rows[target.row][target.room].type;
  const foes = foesOf(state, target.row, target.room, type) ?? [];
  // The Encyklopedia's trophies for the creatures of the room.
  const trophies = foes.length > 0 ? trophiesFor(player, now, foes.map((foe) => foe.monsterId)) : {};
  const seed = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const week = weekNow(now);
  // Talia Systemu (cards.js), where the game has it on: the creatures beaten
  // may leave their cards (903), none at its top level. The collection as
  // read, for a fight only; the room's save holds only while the character
  // is as read, and every change of the collection changes it too.
  const collection = foes.length > 0 && cardsHere() ? await cardCollection(db, row.id) : null;
  const done = enterRoom(state, target, { character, equipped, name: row.name, companions, trophies, week, cards: collection && { maxed: maxedCards(collection) } }, seed, content());
  const { hunt, gains, artifact } = done;
  const next = done.state;
  const texts = rules().texts;
  const lines = [...done.lines];

  const core = coreOf(row);
  const opensCore = type === 'guardian' && hunt?.labyrinth.won && !core.open;
  const nextCore = { ...core, open: core.open || Boolean(opensCore), shards: core.shards + gains.shards };
  if (gains.shards > 0 && type !== 'treasure') lines.push(say(texts, 'shards', 0, { shards: gains.shards }));
  if (type === 'elite' && hunt?.labyrinth.won) lines.push(say(texts, 'gold', 0, { gold: gains.gold - hunt.gold }));
  if (artifact) lines.push(say(texts, 'artifact', 0, { artifact: artifactView(artifact, content()).name }));
  // The cards the creatures left (903), each in a line of its own.
  const cardsWon = collection ? (hunt?.cards ?? []) : [];
  cardsWon.forEach((id, index) => lines.push(cardDropText(id, target.row * 3 + target.room + index, content())));
  if (type === 'guardian' && hunt?.labyrinth.won) {
    lines.push(say(texts, 'levelCleared', 0, { level: labyrinthLevel(state.level, content()).name }));
    if (next.over === 'done') lines.push(say(texts, 'dayDone', 0));
    else if (labyrinthLevel(next.level, content()).hell) lines.push(say(texts, 'hellOpen', 0));
  }
  if (opensCore) lines.push(say(texts, 'coreOpen', 0));

  // A new level heals fully, unless an exploration's report settles the HP;
  // then the report says nothing of a heal either.
  const away = ['hunt', 'mercenary'].includes(player.activity?.kind);
  // A fight: its XP to the character (applyHunt) and its report.
  let applied = null;
  let report = null;
  if (hunt) {
    applied = applyHunt(character, hunt, content(), { heal: !away });
    const base = huntReport({ hunt, applied, character, areaId: hunt.areaId, startedAt: now, endsAt: now }, content());
    report = {
      ...base,
      kind: 'labyrinth',
      resultText: hunt.labyrinth.text,
      system: [...base.system, ...lines],
      labyrinth: {
        level: state.level,
        levelName: labyrinthLevel(state.level, content()).name,
        row: target.row,
        room: target.room,
        type,
        typeName: roomRules(type, content()).name,
        won: hunt.labyrinth.won,
        companions: hunt.labyrinth.companions,
        ...(artifact && { artifact: artifactView(artifact, content()) }),
      },
      // Talia Systemu's cards the creatures left, at their levels now.
      ...(cardsWon.length > 0 && { cards: droppedCards(cardsWon, collection) }),
    };
  }
  const summary = report && {
    labyrinth: { levelName: report.labyrinth.levelName, typeName: report.labyrinth.typeName, row: target.row + 1 },
    areaName: report.areaName,
    minutes: 0,
    result: report.result,
    resultText: report.resultText,
    xp: report.summary.xp,
    classXp: report.summary.classXp,
    penalty: 0,
    gold: gains.gold,
    itemsFound: 0,
    resources: {},
    materials: [],
    timePoints: report.summary.timePoints,
    bestFind: null,
    ...(report.cards && { cards: cardSummary(report.cards) }),
    levelAfter: applied.level,
    system: report.system,
  };
  // The creatures fought join those the character has met (the Bestiariusz),
  // and the quests and the Próby Gildii count those beaten.
  const fought = hunt ? hunt.fights.flatMap((fight) => fight.enemies.map((enemy) => enemy.monsterId)) : [];
  const met = [...new Set([...JSON.parse(row.met ?? '[]'), ...fought])];
  const kills = hunt ? huntKills(hunt, content()) : {};
  const opened = applied ? areasOpened(character.classLevel, applied.classLevel, content()) : 0;
  const quests = JSON.stringify(addQuestProgress(questsNow(player, now), { kills, opened }));
  const healed = applied?.levelled && !away ? hpAfterHunt({ character, applied, hunt, equipped, name: row.name }, content()) : null;

  const statements = [
    sameVersion(db, row),
    db
      .prepare(
        `UPDATE characters SET level = ?, xp = ?, class_level = ?, class_xp = ?, gold = gold + ?, time_points = time_points + ?, met = ?,
           quests = CASE WHEN quests = ? THEN ? ELSE quests END, labyrinth = ?, core = ?${healed !== null ? ', hp = ?, hp_at = ?' : ''}, version = version + 1
         WHERE id = ?`,
      )
      .bind(
        applied?.level ?? row.level,
        applied?.xp ?? row.xp,
        applied?.classLevel ?? row.class_level,
        applied?.classXp ?? row.class_xp,
        gains.gold,
        applied?.timePoints ?? 0,
        JSON.stringify(met),
        row.quests,
        quests,
        JSON.stringify(next),
        JSON.stringify(nextCore),
        ...(healed !== null ? [healed, now] : []),
        row.id,
      ),
    ...(Object.keys(kills).length > 0 ? trialProgress(db, row.id, { kills }, now) : []),
    ...(artifact ? [db.prepare('INSERT INTO core_artifacts (character_id, data, created_at) VALUES (?, ?, ?)').bind(row.id, artifactData(artifact), now)] : []),
    // The cards the creatures left, a copy each (cards.js).
    ...cardUpserts(db, row.id, cardsWon, now),
  ];
  // The report last, its id from its own statement.
  const reportAt = statements.length;
  if (report) {
    statements.push(
      db
        .prepare('INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(row.id, `${row.id}:labyrinth:${seed}`, 'labyrinth', now, JSON.stringify(summary), JSON.stringify(report)),
      trimReports(db, row.id, 'labyrinth'),
    );
  }
  const results = await atomically(db, statements);
  const saved = report ? results[reportAt].meta.last_row_id : null;
  return answer(context, session, {
    room: {
      type,
      won: hunt ? hunt.labyrinth.won : null,
      gains,
      artifact: artifact ? artifactView(artifact, content()) : null,
      // A fight not won says first that the day's Labirynt is over.
      lines: hunt && !hunt.labyrinth.won ? [hunt.labyrinth.text, ...lines] : lines,
      reportId: saved,
      over: next.over,
    },
    ...(report && { report: { id: saved, createdAt: now, ...report } }),
  });
}

// { id }: a blessing chosen of the three offered.
export async function chooseLabyrinthBlessing(context) {
  const { session, player } = await requirePlayer(context);
  requireLabyrinth(player.row);
  requireFree(player, context.now);
  const body = await readJson(context.request);
  const state = todayOf(player, context.now);
  const next = typeof body.id === 'string' ? chooseBlessing(state, body.id) : null;
  if (!next) throw new ApiError(409, 'no_blessing', 'Tego błogosławieństwa nie ma teraz do wyboru.');
  const db = context.env.DB;
  await atomically(db, [sameVersion(db, player.row), db.prepare('UPDATE characters SET labyrinth = ?, version = version + 1 WHERE id = ?').bind(JSON.stringify(next), player.row.id)]);
  return answer(context, session);
}

// After a fight lost, the Labirynt from its first level again (the author,
// 13.11.2026): once a day, for the gold of resetPrice, with the fighters at
// full HP, no blessings and the companions going now; the day's rewards
// stay. Saved only while the character is as read, the gold taken only
// while it has it.
export async function resetLabyrinthDay(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireLabyrinth(row);
  requireFree(player, context.now);
  const state = todayOf(player, context.now);
  const next = resetLabyrinth(state, { companions: companionsOf(player), seed: toHex(crypto.getRandomValues(new Uint8Array(16))) }, content());
  if (!next) throw new ApiError(409, 'no_reset', state.over === 'fainted' ? 'Dziś Labirynt był już zaczęty od nowa. Nowy o północy.' : 'Labirynt można zacząć od nowa tylko po przegranej walce.');
  const price = resetPrice(state.charLevel, content());
  if (row.gold < price) throw new ApiError(409, 'no_gold', t('Brakuje złota: potrzeba {price}.', { price }));
  const db = context.env.DB;
  await atomically(db, [
    sameVersion(db, row),
    db.prepare('UPDATE characters SET gold = gold - ?, labyrinth = ?, version = version + 1 WHERE id = ? AND gold >= ?').bind(price, JSON.stringify(next), row.id, price),
  ]);
  return answer(context, session);
}

// { buy: "heal" | "blessing" } or { leave: true }: the merchant's wares,
// each once and for its gold, or the party goes on.
export async function labyrinthMerchant(context) {
  const { session, player } = await requirePlayer(context);
  const { row } = player;
  requireLabyrinth(row);
  requireFree(player, context.now);
  const body = await readJson(context.request);
  const state = todayOf(player, context.now);
  const db = context.env.DB;
  if (body.leave === true) {
    const next = leaveMerchant(state);
    if (!next) throw new ApiError(409, 'no_merchant', 'Kupca tu nie ma.');
    await atomically(db, [sameVersion(db, row), db.prepare('UPDATE characters SET labyrinth = ?, version = version + 1 WHERE id = ?').bind(JSON.stringify(next), row.id)]);
    return answer(context, session);
  }
  if (body.buy !== 'heal' && body.buy !== 'blessing') throw new ApiError(400, 'invalid_ware', 'Wybierz, co kupić.');
  const next = buyAtMerchant(state, body.buy, content());
  if (!next) throw new ApiError(409, 'not_for_sale', 'Tego kupiec już nie sprzedaje.');
  const price = merchantPrices(state.charLevel, content())[body.buy];
  if (row.gold < price) throw new ApiError(409, 'no_gold', t('Brakuje złota: potrzeba {price}.', { price }));
  await atomically(db, [
    sameVersion(db, row),
    db.prepare('UPDATE characters SET gold = gold - ?, labyrinth = ?, version = version + 1 WHERE id = ? AND gold >= ?').bind(price, JSON.stringify(next), row.id, price),
  ]);
  return answer(context, session);
}

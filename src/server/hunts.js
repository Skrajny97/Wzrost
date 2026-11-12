// Hunts on server time: the start stores the start time, length and seed; the
// claim after the end runs the engine with that seed and saves the report.

import {
  addBuff,
  addQuestProgress,
  applyHunt,
  faintForfeit,
  areaDangers,
  areaFor,
  areasOpened,
  areaOpenFor,
  areaUnlockLevel,
  autoEquip,
  bagCapacity,
  bagOverflow,
  bagStacks,
  buffWindows,
  campBonus,
  claimWindows,
  companionAfterErrand,
  companionAfterHunt,
  companionGoes,
  campLevels,
  challengeAt,
  faintShare,
  scoutChances,
  scoutedCreature,
  scouting,
  seatHuntBonus,
  carryLimit,
  countList,
  drawRumor,
  durationsUpTo,
  estimateThreat,
  fightKind,
  fightPotions,
  higherThreat,
  hpAfterHunt,
  huntDurations,
  isUnlocked,
  huntKills,
  eventChoices,
  eventFor,
  eventMate,
  eventView,
  huntReport,
  longestHunt,
  lowerThreat,
  nextHuntUnlock,
  optionCost,
  optionLock,
  potionsPerKind,
  questCreatures,
  rareCatchUp,
  rumorFactor,
  rumorToday,
  sellPrice,
  resolveEvent,
  simulateHunt,
  spendFights,
  storeStacks,
  taughtWords,
  threatSamples,
  unknownCreatures,
} from '../engine/index.js';
import { say } from '../engine/text.js';
import { huntWait, mountStage } from '../engine/stable.js';
import { finishBrewing } from './brewing.js';
import { endService, hireMercenary, hireRaced, withdrawMercenary } from './mercenaries.js';
import { content } from './content.js';
import {
  bagItems,
  bagPlaces,
  buffsOf,
  characterView,
  currentHp,
  earlyAreaOf,
  engineCharacter,
  equippedItems,
  huntsLeft,
  loadPlayer,
  questsNow,
  blessingAfter,
  blessingOf,
  requireIdle,
  requireIdlePlayer,
  requirePlayer,
  settlementOpen,
  trophiesFor,
} from './characters.js';
import { toHex } from './encoding.js';
import { assertion, atomically, characterChanged, raced, sameVersion } from './atomic.js';
import { ApiError, json, readJson } from './http.js';
import { t } from './i18n.js';
import { eventDraftsOn, eventsOn, fortressOn, settlementOn } from './features.js';
import { takenBefore, trialProgress } from './guild-trials.js';
import { expeditionMinutes } from './guild-expedition.js';
import { huntFamePoints } from './fame.js';
import { favoriteIds } from './favorites.js';
import { fallenGems, gemNamed, soldGold } from './inventory.js';
import { perkOf } from './perks.js';
import { addTo, finishGathering } from './professions.js';
import { herbsOf, knownPotionsOf, potionKnown, potionsOf } from './professions-view.js';
import { trimReports } from './reports.js';
import { leaveTrip, tripOf } from './trips.js';
import { finishCrafting } from './workshop.js';
import { finishJewels } from './jewelcraft.js';
import { finishMining } from './mining.js';
import { wantedAfterHunt, wantedGoing, wantedOnTrip } from './wanted.js';
import { keptWeek, weekNow } from './weeks.js';

// A JSON path for a resource id with a hyphen ("iron-ore").
const resourcePath = (id) => `$."${id}"`;

// Sample fights for the threat level depend only on the build, so the Worker
// keeps them in memory while the build stays the same.
const samplesCache = new Map();
const SAMPLES_CACHE_SIZE = 200;

// Whether the character has rested to full HP now, at home: the wounds of
// its companions heal with its own (companions.js).
export function restedNow(player, now) {
  if (player.activity) return false;
  const { hp, maxHp } = currentHp(player, now);
  return hp >= maxHp;
}

// The companions hired in the Osada who would go on an exploration now:
// those who do not stay in the Kwatery, and none while the character is in
// a Drużyna (companionGoes in the engine), a wounded one once the character
// has rested to full HP; with the character, at most parties.size.
export function companionsGoing(player, now) {
  const rested = restedNow(player, now);
  const hired = JSON.parse(player.row.settlement ?? '{}').companions ?? [];
  return hired.filter((companion) => companionGoes(companion, { rested, inParty: player.inParty })).slice(0, content().balance.parties.size - 1);
}

// `hard`: against the creatures of a Trudna wyprawa (629 A).
function cachedSamples(player, character, equipped, areaId, now, hard = false) {
  // Each item worn whole: an upgrade, a reforged affix or an element keeps
  // the item's id; and the evolution and the professions, whose levels give
  // stats (the code review: the threat stayed as before them).
  const gear = [...equipped].sort((a, b) => a.id - b.id).map((item) => JSON.stringify(item));
  // The companions who would go along fight beside the character (companions.js).
  const companions = settlementOn() ? companionsGoing(player, now) : [];
  const party = companions.map((companion) => [companion.id, companion.level, companion.gear]);
  const key = JSON.stringify([player.row.id, areaId, character.level, character.classLevel, character.points, character.skills, character.evolution, character.professions, gear, party, hard]);
  let samples = samplesCache.get(key);
  if (!samples) {
    samples = threatSamples({ character, equipped, areaId, companions, hard }, content());
    if (samplesCache.size >= SAMPLES_CACHE_SIZE) samplesCache.delete(samplesCache.keys().next().value);
    samplesCache.set(key, samples);
  }
  return samples;
}

// The healing potions of ?heal=…&below=… for the threat (potions.js): as
// many as asked of the first kind the character carries, drunk below the
// mark asked, or null.
function healingFor(player, params) {
  const count = Number(params.get('heal') ?? 0);
  if (!Number.isInteger(count) || count <= 0) return null;
  const { healBelow, healBelowChoices } = content().potionUse;
  const below = Number(params.get('below') ?? healBelow);
  const have = knownPotionsOf(player.row);
  const kit = fightPotions(have, healBelowChoices.includes(below) ? below : healBelow, content()).heal;
  return kit ? { count: Math.min(count, have[kit.id]), amount: kit.amount, below: kit.below } : null;
}

// The potions an exploration of `minutes` takes along (potions.js): known
// ones that work in fights, of each at most as many as the character has
// and as the exploration has fights, and one fern brew.
function takenPotions(player, asked, minutes) {
  if (asked === undefined || asked === null) return {};
  if (typeof asked !== 'object' || Array.isArray(asked)) throw new ApiError(400, 'invalid_potions', 'Wybierz mikstury na wyprawę.');
  const have = potionsOf(player.row);
  const most = potionsPerKind(minutes, content());
  const taken = {};
  for (const [id, count] of Object.entries(asked)) {
    const potion = content().potionsById[id];
    if (!potion || !fightKind(potion)) throw new ApiError(400, 'invalid_potions', 'Tej mikstury nie zabiera się na wyprawę.');
    const limit = Math.min(have[id] ?? 0, carryLimit(potion, most));
    if (!Number.isInteger(count) || count < 0 || count > limit) throw new ApiError(400, 'invalid_potions', `Zabierz od 0 do ${limit} sztuk.`);
    // One got in a Wymiana waits for its recipe (DECISIONS.md, "Wymiana").
    if (count > 0 && !potionKnown(player.row, potion)) throw new ApiError(400, 'unknown_recipe', `Nie znasz jeszcze receptury: ${potion.name}.`);
    if (count > 0) taken[id] = count;
  }
  return taken;
}

// The bag's potions with those set aside for the road back (`back`), less
// those drunk on it.
function potionsBack(row, back, drunk) {
  const bag = { ...potionsOf(row) };
  for (const [id, count] of Object.entries(back)) bag[id] = (bag[id] ?? 0) + count;
  for (const [id, count] of Object.entries(drunk)) bag[id] = (bag[id] ?? 0) - count;
  return Object.fromEntries(Object.entries(bag).filter(([, count]) => count > 0));
}

// Inner regions open with the class level (areaUnlockLevel).
const areaLocked = (area) =>
  new ApiError(403, 'area_locked', `To miejsce odblokujesz na poziomie klasy ${areaUnlockLevel(area, content())}.`);

// ?area=… asks for one inner region, which keeps each request within the CPU
// limit. Without it the answer covers the inner region of each region that fits
// the character's level, if it is open.
export async function huntOptions(context) {
  const { player } = await requirePlayer(context);
  const character = engineCharacter(player.row);
  const equipped = equippedItems(player);
  const { hp, maxHp } = currentHp(player, context.now);
  const params = new URL(context.request.url).searchParams;
  const only = params.get('area') ?? params.get('region');
  const area = only !== null && areaFor(only, character.level, content());
  if (only !== null && !area) throw new ApiError(400, 'invalid_area', 'Nie ma takiego miejsca.');
  // A place opened early in the Sala prób is open too (trial-hall.js).
  const early = earlyAreaOf(player.row);
  if (area && !areaOpenFor(area, character.classLevel, early, content())) throw areaLocked(area);
  const areas = area
    ? [area]
    : content().regions
        .map((region) => areaFor(region.id, character.level, content()))
        .filter((candidate) => areaOpenFor(candidate, character.classLevel, early, content()));
  // threatAvoiding and threatSeeking: the same exploration with the elite and
  // the champion avoided or sought, from the same sample fights; the first is
  // never above the threat without them, the second never below it. In a
  // place too easy for the character, the elite and the champion it has not
  // met come far more often (rareCatchUp). Healing potions taken along
  // count too (healingFor).
  const met = JSON.parse(player.row.met ?? '[]');
  const healing = healingFor(player, params);
  // ?hard=1: the threats of a Trudna wyprawa, from the challenge's level
  // (629 A).
  const hard = params.get('hard') === '1' && Boolean(challengeAt(character.level, content()));
  // The Warownia's Strażnica: the chances of an elite, a champion and an
  // event for each length, plain and with the rare sought, and from its 2nd
  // level the place's creatures to track (fortress.js).
  const watch = fortressOn() ? scouting(campLevels(player.buildings, context.now, content()), content()) : null;
  const rounded = (chances) => Object.fromEntries(Object.entries(chances).map(([key, value]) => [key, Math.round(value * 1000) / 1000]));
  const scoutView = (place, threat, catchUp) => ({
    chances: Object.fromEntries(Object.keys(threat).map((minutes) => [minutes, rounded(scoutChances(place, Number(minutes), content(), { catchUp }, eventsOn()))])),
    chancesSeeking: Object.fromEntries(
      Object.keys(threat).map((minutes) => [minutes, rounded(scoutChances(place, Number(minutes), content(), { catchUp, seekRare: true }, eventsOn()))]),
    ),
    ...(watch.track > 0 && {
      scout: {
        share: watch.track,
        creatures: [...new Set([...place.encounters, ...(place.tough ?? [])].flatMap((encounter) => encounter.monsters))].map((id) => ({ id, name: content().monstersById[id].name })),
      },
    }),
  });
  return json({
    hp,
    maxHp,
    areas: areas.map((place) => {
      const { id } = place;
      const samples = cachedSamples(player, character, equipped, id, context.now, hard);
      const catchUp = rareCatchUp(character.level, place, met, content());
      const threat = estimateThreat({ character, equipped, hp, areaId: id, catchUp, healing }, content(), samples);
      const avoiding = estimateThreat({ character, equipped, hp, areaId: id, avoidRare: true, healing }, content(), samples);
      const seeking = estimateThreat({ character, equipped, hp, areaId: id, seekRare: true, catchUp, healing }, content(), samples);
      return { id, ...(hard && { hard }), threat, threatAvoiding: lowerThreat(avoiding, threat), threatSeeking: higherThreat(seeking, threat), ...(watch && scoutView(place, threat, catchUp)) };
    }),
  });
}

// Szybkie Polowanie: from the level of its unlock (quick-hunts in
// data/unlocks.json), `count` of them, back `refillHours` after the last
// (data/balance.json, quickHunt), an exploration of `minutes` in the inner
// region chosen, with the same choices as "Wyrusz", that ends as it starts,
// so its report comes with the answer (DECISIONS.md, "Szybkie Polowanie").
// Asked with `kind` "flash", it is a Błyskawiczne polowanie instead: a
// shorter one, counted the same way (flashHunt).
export async function quickHunt(context) {
  const { session, player } = await requireIdlePlayer(context);
  if (!isUnlocked('quick-hunts', player.row.level, content())) {
    throw new ApiError(403, 'locked', `Szybkie Polowanie odblokujesz na poziomie postaci ${content().unlocksById['quick-hunts'].level}.`);
  }
  const now = context.now;
  const body = await readJson(context.request);
  const flash = body.kind === 'flash';
  // The Szybkie Polowania counted by the day before 0.2.20 (day, used) go.
  const { day, used, ...stored } = JSON.parse(player.row.quick_hunts ?? 'null') ?? {};
  const kind = flash ? 'flash' : 'quick';
  const rules = content().balance[flash ? 'flashHunt' : 'quickHunt'];
  const { left } = huntsLeft(player.row, kind, now);
  if (left === 0) {
    if (flash) throw new ApiError(409, 'no_flash_hunts', `Błyskawiczne polowania się skończyły. Wrócą ${rules.refillHours} godzin po ostatnim.`);
    throw new ApiError(409, 'no_quick_hunts', `Szybkie Polowania się skończyły. Wrócą ${rules.refillHours} godzin po ostatnim.`);
  }
  const minutes = rules.minutes;
  const next = { ...stored, [kind]: { used: rules.count - left + 1, at: now } };
  // Potions chosen for a longer "Wyrusz" are cut to what this length takes.
  const most = potionsPerKind(minutes, content());
  const asked = body.potions && typeof body.potions === 'object' && !Array.isArray(body.potions) ? body.potions : null;
  const potions = asked ? Object.fromEntries(Object.entries(asked).map(([id, count]) => [id, Number.isInteger(count) ? Math.min(count, most) : count])) : body.potions;
  const db = context.env.DB;
  // The hunt counted in the start's own batch, so a start never lands
  // uncounted (the code review, 0.2.72: it was a statement after it).
  const counted = db.prepare('UPDATE characters SET quick_hunts = ?, version = version + 1 WHERE id = ?').bind(JSON.stringify(next), player.row.id);
  await beginHunt(db, player, { ...body, potions, minutes }, now, { quick: true, flash, also: [counted] });
  const { id, report } = await finishHunt(db, await loadPlayer(db, session.userId), now);
  return json({ report: { id, createdAt: now, ...report }, character: characterView(await loadPlayer(db, session.userId), now) });
}

export async function startHunt(context) {
  const { session, player } = await requireIdlePlayer(context);
  const body = await readJson(context.request);
  await beginHunt(context.env.DB, player, body, context.now);
  return json({ character: characterView(await loadPlayer(context.env.DB, session.userId), context.now) }, 201);
}

// An exploration of `minutes` in an inner region, from now on, avoiding the
// elite and the champion when asked (avoidRare) or seeking them (seekRare),
// and tracking the creatures the quests ask for (trackQuests) or those not
// met yet (trackUnknown): those living there are kept with it, as are the
// potions taken along (potions), the
// healing mark (healBelow) and the potions for a time drunk before
// (potions.js).
// The skipped introduction sends the first one this way too (tutorial.js).
// A Szybkie Polowanie (`quick`) is over as it starts: it began `minutes`
// ago; a Błyskawiczne polowanie is one too (`flash`, for its report's name).
// An exploration of a Drużyna (parties.js) keeps the party (its id, leader
// and the names of those who went) and the other players as they set out
// (`partners`), who fight beside the character; it goes without companions
// (the author: "wtedy nie poluje się z towarzyszem, tylko samemu/z
// drużyną"). `mount`: the stage of the Stajnia's mount the exploration goes
// at, which the party code gives a Drużyna's trip. `hard`: a Trudna wyprawa
// (629 A), from the challenge's level, on a plain "Wyrusz" only: its
// creatures are stronger, for more XP and gold (simulateHunt).
export async function beginHunt(
  db,
  player,
  { areaId, regionId, minutes, avoidRare = false, seekRare = false, trackQuests = false, trackUnknown = false, potions, healBelow, scout = null, hard = false, mercenary = null } = {},
  now,
  { quick = false, flash = false, party: crew = null, partners = [], mount = null, follower = false, also = [] } = {},
) {
  // regionId: "Wyrusz ponownie" from a report made before inner regions.
  const id = areaId ?? regionId;
  const area = typeof id === 'string' ? areaFor(id, player.row.level, content()) : undefined;
  if (!area) throw new ApiError(400, 'invalid_area', 'Wybierz miejsce wyprawy.');
  if (!areaOpenFor(area, player.row.class_level, earlyAreaOf(player.row), content())) throw areaLocked(area);
  if (!durationsUpTo(content().balance.hunt.maxMinutes, content()).includes(minutes)) {
    throw new ApiError(400, 'invalid_duration', 'Wybierz czas wyprawy.');
  }
  if (typeof avoidRare !== 'boolean') throw new ApiError(400, 'invalid_avoid', 'Zaznacz albo odznacz omijanie elit i czempionów.');
  if (typeof seekRare !== 'boolean') throw new ApiError(400, 'invalid_seek', 'Zaznacz albo odznacz tropienie elit i czempionów.');
  if (avoidRare && seekRare) throw new ApiError(400, 'invalid_rare', 'Postać nie może naraz unikać i tropić elit i czempionów.');
  if (typeof trackQuests !== 'boolean') throw new ApiError(400, 'invalid_track', 'Zaznacz albo odznacz tropienie stworów z zadań.');
  if (typeof trackUnknown !== 'boolean') throw new ApiError(400, 'invalid_track_unknown', 'Zaznacz albo odznacz tropienie nieznanych stworów.');
  if (typeof hard !== 'boolean') throw new ApiError(400, 'invalid_hard', 'Zaznacz albo odznacz Trudną wyprawę.');
  if (hard && (quick || crew)) throw new ApiError(400, 'hard_plain_only', 'Trudna wyprawa jest tylko na zwykłej wyprawie, bez drużyny.');
  if (hard && !challengeAt(player.row.level, content())) throw new ApiError(403, 'hard_locked', `Trudna wyprawa otwiera się na ${content().balance.challenge.fromLevel}. poziomie postaci.`);
  if (!huntDurations(player.row.level, content()).includes(minutes)) {
    const longest = longestHunt(player.row.level, content());
    const next = nextHuntUnlock(player.row.level, content());
    throw new ApiError(
      403,
      'duration_locked',
      `Na razie eksploracja trwa najwyżej ${longest} minut. Dłuższe odblokują się na poziomie ${next?.level ?? player.row.level}.`,
    );
  }

  if (healBelow !== undefined && !content().potionUse.healBelowChoices.includes(healBelow)) {
    throw new ApiError(400, 'invalid_heal_below', 'Wybierz próg mikstury leczenia.');
  }
  const taken = takenPotions(player, potions, minutes);
  // The strengthening potions drunk before cover the exploration's first
  // fights, as many as theirs; they are used up only when its report is
  // claimed (the author: "bonusy wszelkie za picie mikstur itp. nie zużywają
  // się na bieżąco, a po samej wyprawie / Odbierz raport zużywa czas
  // mikstury"), so the start leaves them as they are. The claim covers the
  // exploration with those at work then, drunk on the way too (claimWindows
  // in potions.js); the windows kept here are a Drużyna's trip's, whose
  // fights are the same for all who went.
  const buffs = buffsOf(player.row, now);
  const windows = buffWindows(buffs);
  const timed = Object.keys(windows).length > 0;
  const unknown = trackUnknown ? unknownCreatures(area, JSON.parse(player.row.met ?? '[]')) : [];
  // The Warownia's Strażnica from its 2nd level: one creature of the place
  // tracked (fortress.js); not on a Drużyna's trip.
  const scouted = scout !== null && fortressOn() ? scoutedCreature(campLevels(player.buildings, now, content()), area, scout, content()) : null;
  if (scout !== null && (!scouted || crew)) {
    throw new ApiError(409, 'cannot_scout', 'Tropienie stwora wymaga Strażnicy Warowni na 2. poziomie i stwora z tego miejsca, a na wyprawie Drużyny go nie ma.');
  }
  // The Encyklopedia's trophies for the creatures of this place, as at the
  // start: the report comes out the same whenever it is claimed.
  const trophies = trophiesFor(player, now, areaDangers(area, content()).map((danger) => danger.monsterId));
  // A rumor about this place, from the Karczma or from the beggar's song
  // (an event, also without the Osada; settlement.js): the exploration
  // meets its elite and champion rumor.factor times as often, and uses the
  // rumor up. Not a Szybkie Polowanie, nor one avoiding them, nor a
  // Drużyna member's (`follower`): the trip's fights follow its leader's
  // rumor alone (parties.js), so a member keeps its own for another day's
  // exploration (the code review, 0.2.72: it was used up for nothing).
  const stored = JSON.parse(player.row.settlement ?? '{}');
  const kept = settlementOn() ? stored : null;
  const rumor = !quick && !avoidRare && !follower ? rumorFactor(stored.rumor, area.id, now, content()) : 1;
  // The Bractwo Łowców (591 A, B), as at the start: more materials from the
  // character's own creatures, and the elite and the champion more often (on
  // a Drużyna's trip, its leader's, as its encounters), not on a Szybkie
  // Polowanie nor on one avoiding them, as the rumor.
  const materialsMore = perkOf(player.row, 'materialDrops');
  const rareMore = !quick && !avoidRare ? perkOf(player.row, 'rareOdds') : 0;
  // The Siedziba Gildii (616 A), as at the start: more XP and gold and rarer
  // items by the levels of the character's guild's buildings now
  // (guild-seat.js), on a Drużyna's trip too, each member its own guild's;
  // a character that left its guild sets out without them.
  const seat = seatHuntBonus(player.guildSeat, content());
  // The week of the year it sets out in (weeks.js), as the line on the Walka
  // screen shows it: its effects work for the whole exploration, whenever
  // its report is claimed; every member of a Drużyna's trip sets out now.
  const week = weekNow(now);
  // The companions hired in the Osada who do not stay in the Kwatery go
  // along, as they are now (companions.js), so the report comes out the same
  // whenever claimed; a wounded one once the character has rested to full
  // HP. Resting to full HP heals the wounds of them all for good, of those
  // who stay too. On a Szybkie and a Błyskawiczne polowanie too (711 A),
  // not on a Drużyna's trip.
  const healed = kept && restedNow(player, now) && (kept.companions ?? []).some((companion) => companion.wounded);
  // A mercenary from the Karczma takes one companion's place (633.3 A).
  const party = kept && !crew ? companionsGoing(player, now).slice(0, mercenary === null ? undefined : content().balance.parties.size - 2) : [];
  // The sołtys's wanted poster in hand, for this place (wanted.js): its
  // target may come on the way. Not on a Szybkie Polowanie. On a Drużyna's
  // trip too since 10.11.2026: the trip seeks the target most of those who
  // go hold, and a member keeps its poster only for that one (parties.js,
  // tripWanted).
  const sought = kept && !quick ? wantedGoing(player.row, kept, area) : null;
  const settlement =
    rumor > 1 || healed
      ? JSON.stringify({
          ...stored,
          ...(rumor > 1 && { rumor: { ...stored.rumor, used: true } }),
          ...(healed && { companions: kept.companions.map(({ wounded: _, ...companion }) => companion) }),
        })
      : null;
  // The potions taken along leave the bag for the road (the author: "Niech
  // rezerwuje również ilości tego co zabiera w trasę - mikstury itp."), so
  // the bag is free for other things while the character is away; what is
  // not drunk comes back with the report (`reserved`).
  const reserving = Object.keys(taken).length > 0;
  const bagPotions = reserving
    ? Object.fromEntries(
        Object.entries(potionsOf(player.row))
          .map(([id, count]) => [id, count - (taken[id] ?? 0)])
          .filter(([, count]) => count > 0),
      )
    : null;
  const startsAt = quick ? now - minutes * 60000 : now;
  // The Stajnia's mount (327 A, stable.js in the engine) shortens only the
  // wait: an hour with the first stage (5%) ends after 57 minutes, while
  // `minutes` stays the length chosen, so the fights, the rewards, the XP
  // and the report's minutes are those of the full hour. Not a Szybkie or a
  // Błyskawiczne polowanie, over as they start. A Drużyna's trip keeps one
  // time for all who go: it takes the stage the party code gives (`mount`,
  // the slowest mount among them), and without one goes the full length.
  const stage = quick ? 0 : (mount ?? (crew ? 0 : mountStage(kept, content())));
  const endsAt = startsAt + huntWait(minutes, stage, content());

  // A mercenary from the Karczma (mercenaries.js), on a plain "Wyrusz"
  // only: hired with the start, in its batch, its fee paid at once; it
  // fights beside the character as a Drużyna's member would.
  const hire = mercenary === null ? null : await hireMercenary(db, player, mercenary, { area, minutes, startsAt, endsAt, now, plain: !quick && !crew });
  const options = {
    // When it really set out, which a "Przewiń" leaves as it was (started_at
    // moves back with a skip): a trial of the Próby Gildii moves on only
    // with what set out after its taking (takenBefore in guild-trials.js).
    begun: now,
    ...(rumor > 1 && { rumor }),
    ...(rareMore > 0 && { rareMore }),
    ...(materialsMore > 0 && { materialsMore }),
    ...(seat && { seat }),
    ...(week && { week }),
    ...(party.length > 0 && { companions: party }),
    ...(crew && { party: crew }),
    ...(partners.length > 0 && { partners }),
    ...(reserving && { potions: taken, reserved: true, healBelow: healBelow ?? content().potionUse.healBelow }),
    ...(timed && { buffs: windows, spend: 'claim' }),
    ...(unknown.length > 0 && { unknown }),
    ...(Object.keys(trophies).length > 0 && { trophies }),
    ...(scouted && { scouted }),
    ...(sought && { wanted: sought }),
    ...(hard && { hard: true }),
    ...(hire && { partners: [hire.partner], mercenary: hire.view }),
    // The Ołtarz's blessing of the day, for this exploration's first fights;
    // not on a Drużyna's trip, whose fights are one for all (fortress.js).
    ...(!crew && blessingOf(player.row) && { blessing: blessingOf(player.row) }),
    // The professions' levels as it sets out, whose stats its fights count:
    // the Awatar's report claimed on the way raises them (avatar.js), and
    // its fights would count the new levels (the code review, 0.2.72), as a
    // gem or a training would, which wait for the report. A Drużyna's trip
    // keeps its roster as it set out anyway.
    ...(!crew && { professions: JSON.parse(player.row.professions ?? '{}') }),
    ...(quick && { quick }),
    ...(flash && { flash }),
  };
  const { hp } = currentHp(player, now);
  const seed = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const tracked = trackQuests ? questCreatures(questsNow(player, now), area) : [];
  try {
    await db.batch([
      // The HP, potions, buffs and the Osada below are computed from the row
      // read: the whole start holds only while it is as read (atomic.js).
      sameVersion(db, player.row),
      ...(hire ? hire.statements : []),
      db
        .prepare(
          'INSERT INTO activities (character_id, kind, region_id, minutes, started_at, ends_at, seed, hp_at_start, avoid_rare, seek_rare, tracked, options) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(
          player.row.id,
          'hunt',
          area.id,
          minutes,
          startsAt,
          endsAt,
          seed,
          hp,
          avoidRare ? 1 : 0,
          seekRare ? 1 : 0,
          tracked.length > 0 ? JSON.stringify(tracked) : null,
          JSON.stringify(options),
        ),
      // The HP rested so far is saved now, so it is not counted again later.
      db
        .prepare(
          `UPDATE characters SET hp = ?, hp_at = ?${settlement ? ', settlement = ?' : ''}${reserving ? ', potions = ?' : ''}${hire ? ', gold = gold - ?' : ''}, version = version + 1 WHERE id = ?`,
        )
        .bind(
          hp,
          now,
          ...(settlement ? [settlement] : []),
          ...(reserving ? [JSON.stringify(bagPotions)] : []),
          ...(hire ? [hire.fee] : []),
          player.row.id,
        ),
      // What goes with this start alone (`also`): a Szybkie Polowanie's count.
      ...also,
    ]);
  } catch (error) {
    if (raced(error)) throw hire ? await hireRaced(db, hire) : characterChanged();
    if (String(error?.message).includes('constraint')) {
      throw new ApiError(409, 'busy', 'Postać jest już na wyprawie.');
    }
    throw error;
  }
  // What it set out with, for the roster of a Drużyna's trip (parties.js).
  return { windows, trophies, taken, healBelow: healBelow ?? content().potionUse.healBelow, tracked, unknown, rumor, rareMore, avoidRare, seekRare, wanted: sought };
}

// Calling the character back early gives nothing and costs nothing. A
// brewing keeps the potions done and an order in the Warsztat the items
// done, with their report (brewing.js, workshop.js). The strengthening
// potions lose none of their fights: they go only with a report claimed.
export async function cancelHunt(context) {
  const { session, player } = await requirePlayer(context);
  const activity = player.activity;
  if (!activity) throw new ApiError(409, 'no_activity', 'Postać nie jest na wyprawie.');
  // A mercenary's offer is taken back as in the Karczma, and a hired one
  // serves to the end (mercenaries.js).
  if (activity.kind === 'mercenary') return withdrawMercenary(context);
  if (activity.ends_at <= context.now) {
    throw new ApiError(409, 'claim_first', 'Wyprawa się skończyła. Odbierz raport.');
  }
  const db = context.env.DB;
  // A brewing, an order in the Warsztat or a work of the Szlifiernia keeps
  // what is done.
  const stop = { potions: finishBrewing, items: finishCrafting, jewels: finishJewels }[activity.kind];
  if (stop) {
    const stopped = await stop(db, player, context.now, { stop: true });
    return json({
      report: stopped && { id: stopped.id, createdAt: context.now, ...stopped.report },
      character: characterView(await loadPlayer(db, session.userId), context.now),
    });
  }
  // The potions set aside for the road come back to the bag.
  const options = JSON.parse(activity.options ?? '{}');
  const back = options.reserved ? options.potions ?? {} : {};
  const returning = Object.keys(back).length > 0;
  // The potions written back are computed from the row read: the call holds
  // only while the row is as read and the exploration still goes on, so a
  // claim or a sale meanwhile is not undone (atomic.js). One called back
  // from a Drużyna's trip leaves the others' fights (trips.js).
  const trip = tripOf(activity);
  await atomically(db, [
    assertion(db, '(SELECT version FROM characters WHERE id = ?) = ? AND EXISTS (SELECT 1 FROM activities WHERE character_id = ? AND started_at = ?)', [
      player.row.id,
      player.row.version,
      player.row.id,
      activity.started_at,
    ]),
    db.prepare('DELETE FROM activities WHERE character_id = ? AND started_at = ?').bind(player.row.id, activity.started_at),
    ...(returning
      ? [db.prepare('UPDATE characters SET potions = ?, version = version + 1 WHERE id = ?').bind(JSON.stringify(potionsBack(player.row, back, {})), player.row.id)]
      : []),
    ...(trip ? [leaveTrip(db, trip, player.row)] : []),
    // The mercenary taken along has served: its pay waits (mercenaries.js).
    ...(options.mercenary ? [endService(db, options, player.row.id, context.now)] : []),
  ]);
  return json({ character: characterView(await loadPlayer(db, session.userId), context.now) });
}

// The report of the activity that ended: an exploration, a gathering of
// herbs (professions.js), a brewing of potions (brewing.js), an order of
// items (workshop.js), a digging (mining.js) or a work of the Szlifiernia
// (jewelcraft.js).
export async function claimHunt(context) {
  const { session, player } = await requirePlayer(context);
  const now = context.now;
  // A mercenary's offer or service has no report: its pay or its close
  // waits in the Karczma (mercenaries.js), as these words say (the code
  // review: it ran into the exploration's claim and failed).
  if (player.activity?.kind === 'mercenary') requireIdle(player, now);
  // The option chosen in the event at the exploration's end, if one came.
  const body = (context.request.headers.get('Content-Type') ?? '').startsWith('application/json') ? await readJson(context.request) : {};
  const done = await finishActivity(context.env.DB, player, now, { choice: body.choice });
  // A work whose recipe or pattern the game no longer has gave back what it
  // took and made no report.
  if (!done) return json({ character: characterView(await loadPlayer(context.env.DB, session.userId), now) });
  // The event comes first: the report waits for the player's choice.
  if (done.event) return json({ event: done.event });
  const { id, report } = done;
  return json({
    report: { id, createdAt: now, ...report },
    character: characterView(await loadPlayer(context.env.DB, session.userId), now),
  });
}

// The claim of the activity that ended, as "Odbierz raport" makes it: a
// profession's work by its own finish, an exploration by finishHunt (with
// the option chosen in the event at its end, if one came). Also the claim
// of a Drużyna's member as its party sets out (parties.js).
export function finishActivity(db, player, now, { choice } = {}) {
  const finish = { herbs: finishGathering, potions: finishBrewing, items: finishCrafting, minerals: finishMining, jewels: finishJewels }[player.activity?.kind];
  return finish && player.activity.ends_at <= now ? finish(db, player, now) : finishHunt(db, player, now, { choice });
}

// The Osada after an exploration of `minutes`: each companion who went
// gains its share of the XP and the relation the time together brings (296
// A), and one who fell is wounded until the character rests to full HP
// (companions.js), while a companion dismissed meanwhile is not brought
// back; an event's reputation joins the brotherhoods' (question 225); and
// the beggar's song tells today's rumor where the Karczma has not told it
// yet (`kept`), marked as the song's, so the mug still pays the innkeeper's
// relation and tells the same. Null when nothing changed.
function settlementAfterHunt(row, hunt, kept, minutes, event = null) {
  const reward = hunt.event?.reward;
  const went = hunt.companions?.length > 0;
  const heard = reward?.rumor && !kept ? reward.rumor : null;
  const stored = JSON.parse(row.settlement ?? '{}');
  // The wanted poster in hand whose target fell (wanted.js).
  const wanted = wantedAfterHunt(stored, hunt);
  // An event met first in one case is remembered (events.js: eventCase).
  const metNow = Boolean(event?.firstCase) && !(stored.events ?? []).includes(event.id);
  if (!went && !reward?.reputation && !reward?.relation && !reward?.companion && !heard && !wanted && !metNow) return null;
  const next = { ...stored, ...(wanted && { wanted }) };
  if (went) {
    next.companions = (stored.companions ?? []).map((companion) => {
      const one = hunt.companions.find((member) => member.id === companion.id);
      return one ? companionAfterHunt(companion, { xp: hunt.xp, fainted: one.fainted, minutes, week: hunt.week }, row.level, content()) : companion;
    });
  }
  if (reward?.reputation) {
    next.reputation = { ...stored.reputation };
    for (const [id, points] of Object.entries(reward.reputation)) next.reputation[id] = (next.reputation[id] ?? 0) + points;
  }
  // The relation with residents an event brings (818.3: help raises it, a
  // refusal never lowers it), and a companion's errand (817.7, 818.4).
  if (reward?.relation) {
    next.relations = { ...stored.relations };
    for (const [id, points] of Object.entries(reward.relation)) next.relations[id] = (next.relations[id] ?? 0) + points;
  }
  if (reward?.companion) {
    next.companions = (next.companions ?? stored.companions ?? []).map((companion) =>
      companion.id === reward.companion.id ? companionAfterErrand(companion, reward.companion, content()) : companion,
    );
  }
  if (metNow) next.events = [...(stored.events ?? []), event.id];
  if (heard) next.rumor = { ...heard, song: true };
  return JSON.stringify(next);
}

// The companions who went on an exploration, as an errand needs them
// (events.js: errandMates): their names, looks, stories, relations and
// errands from the Osada, and whether they fell on the way. A trip goes
// without them.
function huntMates(stored, hunt, setOut = []) {
  const kept = new Map((stored.companions ?? []).map((companion) => [companion.id, companion]));
  const started = new Map(setOut.map((companion) => [companion.id, companion]));
  return (hunt.companions ?? []).flatMap((one) => {
    // A companion dismissed meanwhile is left out. The others count as
    // they set out (`setOut`, the exploration's options.companions), so the
    // event drawn stays the same however often the report is opened, even
    // after a talk in the Kwatery raised a relation; one that set out
    // before they were kept counts as it is now.
    const now = kept.get(one.id);
    if (!now) return [];
    const companion = started.get(one.id) ?? now;
    const { id, name, appearance, classId, story, relation, errand } = companion;
    return [{ id, name, appearance, classId, story, relation: relation ?? 0, errand: now.errand ?? errand ?? null, fainted: Boolean(one.fainted) }];
  });
}

// The report of a finished exploration: the engine runs it with the seed
// saved at its start, and the character gets what it brought. An event at
// its end (events.js) comes first: without `choice` only the event is
// returned ({ event }), and nothing is saved; with an option of it, the
// exploration takes the option's outcome.
export async function finishHunt(db, player, now, { choice } = {}) {
  const activity = player.activity;
  if (!activity) throw new ApiError(409, 'no_activity', 'Postać nie jest na wyprawie.');
  if (activity.ends_at > now) throw new ApiError(409, 'not_finished', 'Wyprawa jeszcze trwa.');

  const row = player.row;
  // The potions taken along and the windows of the potions for a time
  // (beginHunt).
  const options = JSON.parse(activity.options ?? '{}');
  // The fights count the professions' levels the exploration set out with
  // (beginHunt), not those the Awatar's report brought on the way; an
  // exploration begun before 0.2.72 keeps none and counts them as now.
  const character = { ...engineCharacter(row), ...(options.professions && { professions: options.professions }) };
  // region_id holds the inner region (or a whole region, from before them).
  const area = areaFor(activity.region_id, row.level, content());
  // The very first exploration, before any report, goes one way (simulateHunt).
  const first = !(await db.prepare('SELECT 1 AS found FROM reports WHERE character_id = ? LIMIT 1').bind(row.id).first());
  // A Drużyna's trip: its fights from the trip's roster and seed, the same
  // for every member, as its leader leads them; what this member finds and
  // earns from its own seed (trips.js, simulateHunt).
  const trip = options.party?.seed && options.party.roster?.length > 0 ? options.party : null;
  // The strengthening potions at work now cover the exploration's first
  // fights and use up those they worked in as the report is claimed,
  // whenever they were drunk (potions.js); a trip's fights keep those it set
  // out with.
  const claimed = claimWindows(options, buffsOf(row, now), Boolean(trip));
  let hunt = simulateHunt(
    {
      character,
      equipped: equippedItems(player),
      hp: activity.hp_at_start,
      name: row.name,
      areaId: area.id,
      minutes: activity.minutes,
      seed: trip ? trip.seed : activity.seed,
      ...(trip && { lootSeed: activity.seed, roster: trip.roster, self: row.id }),
      first,
      avoidRare: trip ? trip.encounter.avoidRare === true : activity.avoid_rare === 1,
      seekRare: trip ? trip.encounter.seekRare === true : activity.seek_rare === 1,
      rumor: (trip ? trip.encounter.rumor : options.rumor) ?? 1,
      rareMore: (trip ? trip.encounter.rareMore : options.rareMore) ?? 0,
      materialsMore: options.materialsMore ?? 0,
      // The Siedziba Gildii's bonuses the exploration set out with: its own
      // XP, gold and items, so on a trip too.
      seat: options.seat ?? null,
      // A trip goes without companions; one that set out before 2.11.2026
      // keeps its leader's, so its fights stay the same for everyone.
      companions: (trip ? trip.companions : options.companions) ?? [],
      partners: trip ? [] : (options.partners ?? []),
      tracked: trip ? (trip.encounter.tracked ?? []) : JSON.parse(activity.tracked ?? '[]'),
      unknown: (trip ? trip.encounter.unknown : options.unknown) ?? [],
      // The creatures met before this exploration: it changes them only
      // when claimed, so the report comes out the same every time (on a
      // trip, those its leader had met as it set out).
      met: trip ? (trip.encounter.met ?? []) : JSON.parse(row.met ?? '[]'),
      potions: options.potions ?? {},
      healBelow: options.healBelow,
      buffs: claimed.windows,
      trophies: options.trophies ?? {},
      blessing: trip ? null : (options.blessing ?? null),
      scouted: trip ? null : (options.scouted ?? null),
      // A trip's wanted target (parties.js), the member's own poster for it
      // or a foe only (wanted.js: wantedOnTrip).
      wanted: trip ? wantedOnTrip(trip, options) : (options.wanted ?? null),
      hard: !trip && options.hard === true,
      // The week it set out in (weeks.js), none before the weeks.
      week: keptWeek(options),
    },
    content(),
  );
  // "Testuj zdarzenia" (the test version) brings its event, and the case
  // and the ending chosen for it if any ("event:case:ending"), without the
  // draw.
  const [forcedEvent = null, forcedCase = null, forcedEnding = null] = row.event_test ? row.event_test.split(':').map((part) => part || null) : [];
  // The events the character met before (an event met first in one case,
  // events.js: eventCase) and the companions who went (a companion's errand).
  const storedSettlement = JSON.parse(row.settlement ?? '{}');
  const metEvents = storedSettlement.events ?? [];
  const mates = trip ? [] : huntMates(storedSettlement, hunt, options.companions ?? []);
  const event = eventsOn()
    ? eventFor({ hunt, seed: activity.seed, first, quick: options.quick === true, forced: forcedEvent, drafts: eventDraftsOn(), settlement: settlementOpen(row), mates }, content())
    : null;
  const mate = event?.companion ? eventMate(event, activity.seed, mates) : null;
  // An option's price comes from the purse, the character's gold with the
  // exploration's; an option of one class is greyed out for the others.
  const who = { classId: row.class_id, level: row.level, purse: row.gold + hunt.gold };
  // An event that led to a further choice goes on from there (`eventPath`,
  // the options chosen so far): the choice made stays made, whether the
  // sheet was closed or the page reloaded.
  const eventArea = content().areasById[hunt.areaId];
  const walkOptions = { seed: activity.seed, caseId: forcedCase, endingId: forcedEnding, drafts: eventDraftsOn(), met: metEvents, mate };
  const storedPath = event && Array.isArray(options.eventPath) ? options.eventPath : [];
  const before = event && (eventChoices(event, storedPath, walkOptions)?.options ? storedPath : []);
  if (event && choice === undefined) return { event: eventView(event, eventArea, who, content(), before.length > 0 ? eventChoices(event, before, walkOptions) : null, mate) };
  // Today's rumor, as the Karczma told it, or as the beggar's song may.
  const kept = rumorToday(JSON.parse(row.settlement ?? '{}').rumor, now, content());
  if (event) {
    const path = [...before, choice];
    const walk = typeof choice === 'string' ? eventChoices(event, path, walkOptions) : null;
    if (!walk) throw new ApiError(400, 'invalid_choice', 'Wybierz jedną z opcji.');
    const step = walk.steps.at(-1);
    const lock = optionLock(step.option, { ...who, purse: who.purse - (walk.steps.slice(0, -1).reduce((sum, one) => sum + optionCost(one.option, row.level), 0)) }, content());
    if (lock) throw new ApiError(409, lock.code, lock.code === 'class_only' ? `Tę opcję wybiera ${lock.text}.` : 'Brakuje złota na tę opcję.');
    // A further choice: kept with the activity, and shown; nothing else is
    // saved until the event ends.
    if (walk.options) {
      const saved = await db
        .prepare('UPDATE activities SET options = ? WHERE character_id = ? AND options = ?')
        .bind(JSON.stringify({ ...options, eventPath: path }), row.id, activity.options ?? '{}')
        .run();
      if (saved.meta.changes !== 1) throw new ApiError(409, 'character_changed', 'Coś zmieniło się w międzyczasie. Spróbuj jeszcze raz.');
      return { event: eventView(event, eventArea, who, content(), walk, mate) };
    }
    const rumor = kept ?? drawRumor({ character, seed: `${row.id}:settlement` }, now, content());
    hunt = resolveEvent(
      {
        hunt,
        event,
        optionId: path,
        caseId: forcedCase,
        endingId: forcedEnding,
        drafts: eventDraftsOn(),
        character,
        equipped: equippedItems(player),
        name: row.name,
        seed: activity.seed,
        purse: row.gold,
        rumor,
        // The companions who went fight the event's foes too (a trip goes
        // without them), and the potions, the strengthening ones still
        // working and the trophies work there as on the way.
        companions: trip ? [] : (options.companions ?? []),
        potions: options.potions ?? {},
        healBelow: options.healBelow,
        buffs: claimed.windows,
        trophies: options.trophies ?? {},
        met: metEvents,
        mate,
      },
      content(),
    );
  }
  // A faint loses everything the exploration brought (faintForfeit, 651 C),
  // and costs XP, less with the Warownia's Kapliczka (427 A).
  hunt = faintForfeit(hunt);
  const applied = applyHunt(character, hunt, content(), { faintShare: faintShare(campLevels(player.buildings, now, content()), content()) });
  // The companions who went gain XP, one who fell is wounded, and an
  // event's reputation and rumor are kept (settlementAfterHunt); of an
  // older trip's, only in its leader's report.
  // A faint brings the companions no relation either (faintForfeit).
  const credited = hunt.forfeit ? 0 : activity.minutes;
  const settlementAfter = settlementAfterHunt(row, trip && trip.roster[0].id !== row.id ? { ...hunt, companions: [] } : hunt, kept, credited, event);
  // An event's reputation of the Bractwo Zielarzy may make Jagna teach rare
  // recipes (682 A and C): the report tells them among its System's lines.
  const taught = settlementAfter ? taughtWords(JSON.parse(row.settlement ?? '{}'), JSON.parse(settlementAfter), content()) : null;
  // The potions taken along were set aside at the start (`reserved`): what
  // was not drunk comes back to the bag. An exploration started before that
  // takes the potions drunk from the bag, where they stayed.
  const drunk = Object.entries(hunt.potionsUsed);
  const reservedPotions = options.reserved ? options.potions ?? {} : {};
  const potionsChanged = drunk.length > 0 || Object.keys(reservedPotions).length > 0;
  const potionsLeft = potionsBack(row, reservedPotions, hunt.potionsUsed);
  // A find for a slot with nothing in it is worn at once.
  const autoEquipped = autoEquip(equippedItems(player), hunt.items, content(), row.class_id, row.class_level);
  // The rest goes to the bag. When it does not fit, the scrapper buys the
  // weakest items, old or new, at the camp's price. Herbs keep the places
  // their stacks take, and an event's herbs (the Kwiat paproci) take theirs
  // first; what finds no place at all is lost, said after the event's words.
  const levels = campLevels(player.buildings, now, content());
  const bag = bagItems(player);
  const free = bagCapacity(levels, content()) - (bagPlaces(player) - bag.length);
  const herbsBefore = herbsOf(row);
  const herbs = storeStacks(herbsBefore, hunt.herbs ?? {}, free, content());
  const capacity = free - (bagStacks(herbs.after, content()) - bagStacks(herbsBefore, content()));
  if (Object.keys(herbs.lost).length > 0) {
    const lost = say(content().professionTexts, 'lost', 0, { herbs: countList(herbs.lost, content().herbsById) });
    const told = (text) => `${text} ${lost}`;
    hunt = {
      ...hunt,
      entries: hunt.entries.map((entry) => (entry.type === 'event' ? { ...entry, text: told(entry.text) } : entry)),
      event: { ...hunt.event, option: { ...hunt.event.option, text: told(hunt.event.option.text) } },
    };
  }
  const sellBonus = campBonus(levels, 'sellPrice', content());
  const toBag = hunt.items.map((item, index) => index).filter((index) => !autoEquipped.includes(index));
  const candidates = [...bag, ...toBag.map((index) => hunt.items[index])];
  // The favourites stay (favorites.js): the weakest of the others go. The
  // claim holds only while the character is as read, its stars too.
  const sold = bagOverflow(candidates, capacity, row.class_id, content(), favoriteIds(row));
  const storedSold = sold.filter((index) => index < bag.length).map((index) => bag[index]);
  const soldStored = storedSold.map((item) => item.id);
  const soldFound = sold.filter((index) => index >= bag.length).map((index) => toBag[index - bag.length]);
  const soldFoundGold = soldFound.reduce((sum, index) => sum + sellPrice(hunt.items[index], content(), sellBonus), 0);
  const overflow =
    sold.length > 0
      ? {
          capacity,
          count: sold.length,
          gold: sold.reduce((sum, index) => sum + sellPrice(candidates[index], content(), sellBonus), 0),
          sold: soldFound,
        }
      : null;
  const report = {
    ...huntReport({ hunt, applied, character, areaId: area.id, startedAt: activity.started_at, endsAt: activity.ends_at, autoEquipped, overflow }, content()),
    ...(options.quick && { quick: true }),
    ...(options.flash && { flash: true }),
    // The Drużyna that went, by name (parties.js), and the time the others
    // skipped for everyone (time.js).
    ...(options.party && { party: options.party.names }),
    ...((options.skips ?? []).some((skip) => skip.id !== row.id) && { skips: options.skips.filter((skip) => skip.id !== row.id) }),
  };
  if (taught) report.system = [...report.system, taught];
  // The gems of the bag's items the scrapper bought fall out and go back to
  // the minerals (the author's 757 B, 10.11.2026: „kamień wypada i wraca do
  // Twoich minerałów”), and the report says so.
  const gemsBack = fallenGems(storedSold);
  if (Object.keys(gemsBack).length > 0) report.system = [...report.system, ...gemLines(gemsBack)];
  const summary = {
    areaName: report.areaName,
    regionName: report.regionName,
    minutes: report.minutes,
    result: report.result,
    resultText: report.resultText,
    ...(hunt.forfeit && { forfeit: true }),
    xp: report.summary.xp,
    classXp: report.summary.classXp,
    penalty: report.summary.penalty,
    gold: report.summary.gold,
    itemsFound: report.summary.itemsFound,
    resources: report.summary.resources,
    materials: report.summary.materials.map(({ name, label, color, count }) => ({ name, label, color, count })),
    timePoints: report.summary.timePoints,
    bestFind: report.summary.bestFind && { name: report.summary.bestFind.name, color: report.summary.bestFind.color },
    levelAfter: applied.level,
    system: report.system,
  };

  const insertItem = db.prepare('INSERT INTO items (character_id, slot, data, created_at) VALUES (?, ?, ?, ?)');
  const storedPrice = soldStored.length > 0 ? soldGold(row.id, storedSold, sellBonus) : { sql: '0', binds: [] };
  const found = Object.entries(hunt.resources);
  const setResources = found.length
    ? `, resources = json_set(resources, ${found.map(() => '?, COALESCE(json_extract(resources, ?), 0) + ?').join(', ')})`
    : '';
  // Materials from beaten creatures, by stack ("wolf-pelt:common").
  const left = Object.entries(hunt.materials);
  // A new level heals fully, with the finds worn from now on (hpAfterHunt).
  const worn = [...equippedItems(player), ...autoEquipped.map((index) => hunt.items[index])];
  const hp = hpAfterHunt({ character, applied, hunt, equipped: worn, name: row.name }, content());
  // The creatures of every fight join those the character has met (the
  // Bestiariusz shows them by name from now on), also a creature of an
  // event's fight (the Błędnica); the people of an event's fight are not in
  // the Bestiariusz.
  const met = [
    ...new Set([
      ...JSON.parse(row.met ?? '[]'),
      ...hunt.fights.flatMap((fight) => fight.enemies.map((enemy) => enemy.monsterId)).filter((monsterId) => !content().eventFoesById[monsterId]),
    ]),
  ];
  // The narrator's quests count the creatures beaten, the minutes and the
  // inner regions the new class levels open; after a faint nothing
  // (faintForfeit). They are saved only as read, so a reward claimed
  // meanwhile is not undone.
  const opened = areasOpened(character.classLevel, applied.classLevel, content());
  const progress = { kills: hunt.forfeit ? {} : huntKills(hunt, content()), minutes: credited, opened };
  const quests = JSON.stringify(addQuestProgress(questsNow(player, now), progress));
  const setMaterials = left.length
    ? `, materials = json_set(materials, ${left.map(() => '?, COALESCE(json_extract(materials, ?), 0) + ?').join(', ')})`
    : '';
  // An event's buff joins those of the potions drunk before (the blue
  // mushroom), and its free stat points those of the levels.
  const reward = hunt.event?.reward;
  // The fights of the strengthening potions used up now, as the report is
  // claimed (those they worked in), and an event's strengthening or curse
  // added after that, for its own fights.
  const spentBuffs = claimed.spends && Object.values(hunt.buffFights ?? {}).some((count) => count > 0) ? spendFights(buffsOf(row, now), claimed.windows, hunt.buffFights) : null;
  const eventBuffs = reward?.buff ? addBuff(spentBuffs ?? buffsOf(row, now), reward.buff.kind, reward.buff.fights, reward.buff.bonus) : spentBuffs;
  const eventPoints = reward?.points ?? 0;
  // The fights the Ołtarz's blessing worked in come off the day's blessing,
  // if it is still the one the exploration set out with.
  const fortressAfter = blessingAfter(row, options.blessing, hunt.blessingFights ?? 0);
  // An event's herbs that found their places.
  const storedHerbs = Object.entries(herbs.stored);
  const setHerbs = storedHerbs.length ? `, herbs = json_set(herbs, ${storedHerbs.map(() => '?, COALESCE(json_extract(herbs, ?), 0) + ?').join(', ')})` : '';
  const setGems = addTo('minerals', gemsBack);
  let results;
  try {
    results = await db.batch([
      // The level, the potions, the buffs, the Osada and the rest below are
      // computed from the row read: the claim holds only while it is as
      // read, so a potion sold or an order delivered meanwhile is not undone
      // (atomic.js); a retry claims anew. So does the exploration: another
      // member's "Przewiń" moves a Drużyna's whole trip without this
      // character's version (trips.js: shiftTrip), and "Wróć" ends it, so a
      // claim of the exploration as read, moved or gone meanwhile, would
      // pay its report and leave the moved one to be paid again (the code
      // review, 0.2.72).
      assertion(db, '(SELECT version FROM characters WHERE id = ?) = ? AND EXISTS (SELECT 1 FROM activities WHERE character_id = ? AND started_at = ? AND ends_at = ?)', [
        row.id,
        row.version,
        row.id,
        activity.started_at,
        activity.ends_at,
      ]),
      // Then the report, so that a second claim of the same hunt fails as a whole.
      db
        .prepare('INSERT INTO reports (character_id, activity_key, kind, created_at, summary, data) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(row.id, `${row.id}:${activity.started_at}`, 'hunt', now, JSON.stringify(summary), JSON.stringify(report)),
      // A report keeps every fight (about 40 KB for 4 hours), so only those the journal shows stay.
      trimReports(db, row.id, 'hunt'),
      ...hunt.items.flatMap((item, index) =>
        soldFound.includes(index) ? [] : [insertItem.bind(row.id, autoEquipped.includes(index) ? item.slot : null, JSON.stringify(item), now)],
      ),
      db
        .prepare(
          `UPDATE characters SET level = ?, xp = ?, class_level = ?, class_xp = ?, gold = MAX(0, gold + ? + ${storedPrice.sql})${setResources}${setMaterials}${setHerbs}${setGems.sql},
             time_points = time_points + ?, hp = ?, hp_at = ?, met = ?, quests = CASE WHEN quests = ? THEN ? ELSE quests END${potionsChanged ? ', potions = ?' : ''}${event ? ', event_test = NULL' : ''}${eventBuffs ? ', buffs = ?' : ''}${eventPoints > 0 ? ', bonus_points = bonus_points + ?' : ''}${settlementAfter ? ', settlement = ?' : ''}${fortressAfter ? ', fortress = ?' : ''},
             version = version + 1
           WHERE id = ?`,
        )
        .bind(
          applied.level,
          applied.xp,
          applied.classLevel,
          applied.classXp,
          // What an event took from the purse (an option's price, a thief's
          // grab) comes off the exploration's gold.
          hunt.gold + soldFoundGold - (hunt.spent ?? 0),
          ...storedPrice.binds,
          ...found.flatMap(([id, amount]) => [resourcePath(id), resourcePath(id), amount]),
          ...left.flatMap(([key, count]) => [resourcePath(key), resourcePath(key), count]),
          ...storedHerbs.flatMap(([id, count]) => [resourcePath(id), resourcePath(id), count]),
          ...setGems.binds,
          applied.timePoints,
          hp,
          activity.ends_at,
          JSON.stringify(met),
          row.quests,
          quests,
          ...(potionsChanged ? [JSON.stringify(potionsLeft)] : []),
          ...(eventBuffs ? [JSON.stringify(eventBuffs)] : []),
          ...(eventPoints > 0 ? [eventPoints] : []),
          ...(settlementAfter ? [settlementAfter] : []),
          ...(fortressAfter ? [fortressAfter] : []),
          row.id,
        ),
      // The Próby Gildii's trial too (guild-trials.js), one taken before the
      // exploration set out: a trial's progress counts from its taking, so
      // an exploration on its way when a trial is taken moves it not (the
      // author: "żeby się nie naliczała wyprawa jedna do obu zadań"). A
      // Szybkie or Błyskawiczne polowanie, over as it starts, counts from
      // the moment it is made. One that set out before this rule moves the
      // trial on as before.
      ...trialProgress(db, row.id, progress, now, takenBefore(options.begun)),
      // The Wyprawa Gildii's route (guild-expedition.js): the exploration's
      // minutes for the guild the character is in now, as the report is
      // claimed (621 A), whenever the exploration set out.
      ...expeditionMinutes(db, row.id, credited, now),
      // The Punkty Sławy of the exploration, a Drużyna's trip too (fame.js):
      // its minutes and the elites and champions beaten, none for a lost one.
      ...huntFamePoints(db, row.id, hunt, activity.minutes, now),
      // Bag items the scrapper bought: paid for above, while they were still there.
      ...(soldStored.length > 0
        ? [db.prepare(`DELETE FROM items WHERE character_id = ? AND id IN (${soldStored.map(() => '?').join(', ')})`).bind(row.id, ...soldStored)]
        : []),
      db.prepare('DELETE FROM activities WHERE character_id = ? AND started_at = ?').bind(row.id, activity.started_at),
    ]);
  } catch (error) {
    if (String(error?.message).includes('UNIQUE')) {
      throw new ApiError(409, 'already_claimed', 'Ten raport został już odebrany.');
    }
    if (raced(error)) throw characterChanged();
    throw error;
  }

  return { id: results[1].meta.last_row_id, report };
}

// The report's line of the gems that fell out of items the scrapper bought
// when the bag overflowed (757 B), one line for each gem.
export const gemLines = (gems) => Object.entries(gems).flatMap(([id, count]) => Array.from({ length: count }, () => t('Kamień {gem} wypadł i wrócił do zapasu.', { gem: gemNamed(id).name })));

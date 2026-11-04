// The Warownia's buildings that the character uses (fortress.js in the
// engine), where FORTRESS is on and the camp has turned into a Warownia.
// The Plac treningowy (420 A): once a day, counted from Polish midnight, a
// training of an hour for each level of the yard, alongside an exploration
// or a profession's work; it gives the class the XP of a quarter of an
// exploration as long at the character's level, claimed once it ends. The
// claim waits while the character explores: the report is made with the
// class it has when it is claimed (hunts.js), so a class level gained on the
// way would count in every fight of it. What the buildings keep is the
// characters.fortress column.

import {
  applyClassXp,
  bagCapacity,
  blessingPlan,
  campLevels,
  canUse,
  gearSetCount,
  gearSetPlan,
  greenhouseHours,
  greenhouseSince,
  greenhouseStore,
  knownHerbs,
  leavingRack,
  professionState,
  questPeriod,
  storeStacks,
  trainingPlan,
  trainingXp,
} from '../engine/index.js';
import { content } from './content.js';
import { fortressOn } from './features.js';
import { bagPlaces, characterView, engineCharacter, equippedItems, gearSetsOf, loadPlayer, requireNotExploring, requirePlayer } from './characters.js';
import { herbsOf } from './professions-view.js';
import { ApiError, json, readJson } from './http.js';

const HOUR = 3600000;
const stateOf = (row) => JSON.parse(row.fortress ?? '{}');

// "Trenuj": the day's training, from now on, with the XP it will give fixed
// as it starts. Saved only if the character is as read, so two taps start one.
export async function startTraining(context) {
  const { session, player } = await requirePlayer(context);
  const now = context.now;
  const levels = campLevels(player.buildings, now, content);
  const plan = fortressOn() ? trainingPlan(levels, content) : null;
  if (!plan) throw new ApiError(409, 'no_training_yard', 'Trening wymaga Placu treningowego w Warowni.');
  const row = player.row;
  const state = stateOf(row);
  const day = questPeriod('daily', now, content).key;
  if (state.training?.day === day) throw new ApiError(409, 'trained_today', 'Dzisiejszy trening już był. Następny po północy.');
  if (state.training && !state.training.claimed) throw new ApiError(409, 'training_unclaimed', 'Najpierw odbierz poprzedni trening.');
  const training = { day, startedAt: now, endsAt: now + plan.hours * HOUR, hours: plan.hours, xp: trainingXp(row.level, plan, content), claimed: false };
  const result = await context.env.DB.prepare('UPDATE characters SET fortress = ?, version = version + 1 WHERE id = ? AND version = ?')
    .bind(JSON.stringify({ ...state, training }), row.id, row.version)
    .run();
  if (result.meta.changes !== 1) throw new ApiError(409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.');
  return json({ character: characterView(await loadPlayer(context.env.DB, session.userId), now) }, 201);
}

// "Odbierz trening": the class XP of the training that has ended, with the
// class's new levels and their Time Points, as after an exploration.
export async function claimTraining(context) {
  const { session, player } = await requirePlayer(context);
  const now = context.now;
  const row = player.row;
  const state = stateOf(row);
  const { training } = state;
  if (!fortressOn() || !training || training.claimed) throw new ApiError(409, 'no_training', 'Nie ma treningu do odebrania.');
  if (training.endsAt > now) throw new ApiError(409, 'not_finished', 'Trening jeszcze trwa.');
  if (player.activity?.kind === 'hunt') {
    throw new ApiError(409, 'training_exploring', 'Trening odbierzesz, gdy postać wróci z wyprawy i odbierze jej raport.');
  }
  const applied = applyClassXp(engineCharacter(row), training.xp, content);
  const result = await context.env.DB.prepare(
    'UPDATE characters SET class_level = ?, class_xp = ?, time_points = time_points + ?, fortress = ?, version = version + 1 WHERE id = ? AND version = ?',
  )
    .bind(applied.classLevel, applied.classXp, applied.timePoints, JSON.stringify({ ...state, training: { ...training, claimed: true } }), row.id, row.version)
    .run();
  if (result.meta.changes !== 1) throw new ApiError(409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.');
  return json({ trained: { xp: training.xp, messages: applied.messages }, character: characterView(await loadPlayer(context.env.DB, session.userId), now) });
}

// The Ołtarz Systemu (424 A, 425 A, 580): once a day one of its three
// blessings, for 4 fights of explorations a level, used up as the reports
// are claimed (hunts.js). A new day's choice takes the place of what is left
// of the day before.
export async function chooseBlessing(context) {
  const { session, player } = await requirePlayer(context);
  const now = context.now;
  const body = await readJson(context.request);
  const plan = fortressOn() ? blessingPlan(campLevels(player.buildings, now, content), content) : null;
  if (!plan) throw new ApiError(409, 'no_altar', 'Błogosławieństwo daje Ołtarz Systemu w Warowni.');
  const altar = content.buildings.find((building) => building.effect.kind === 'blessing');
  const choice = altar.blessings.find((one) => one.id === body.kind);
  if (!choice) throw new ApiError(400, 'invalid_blessing', 'Nie ma takiego błogosławieństwa.');
  const row = player.row;
  const state = stateOf(row);
  const day = questPeriod('daily', now, content).key;
  if (state.blessing?.day === day) throw new ApiError(409, 'blessed_today', 'Dzisiejsze błogosławieństwo już wybrane. Następne po północy.');
  const blessing = { day, kind: choice.id, bonus: plan.bonus, left: plan.fights };
  const result = await context.env.DB.prepare('UPDATE characters SET fortress = ?, version = version + 1 WHERE id = ? AND version = ?')
    .bind(JSON.stringify({ ...state, blessing }), row.id, row.version)
    .run();
  if (result.meta.changes !== 1) throw new ApiError(409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.');
  return json({ character: characterView(await loadPlayer(context.env.DB, session.userId), now) }, 201);
}

// The Zielarstwo level the Szklarnia grows with.
const herbalismOf = (row) => professionState(JSON.parse(row.professions ?? '{}'), content.gathering.profession).level;

// Saves the Szklarnia's state and the herbs collected, only if the character
// is as read.
async function saveGreenhouse(context, row, state, herbs) {
  const result = await context.env.DB.prepare('UPDATE characters SET fortress = ?, herbs = ?, version = version + 1 WHERE id = ? AND version = ?')
    .bind(JSON.stringify(state), JSON.stringify(herbs), row.id, row.version)
    .run();
  if (result.meta.changes !== 1) throw new ApiError(409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.');
}

// What the store holds, into the bag as far as it fits (storeStacks): the
// herbs after, the count taken, and the store's new start.
function harvest(player, levels, state, now) {
  const store = greenhouseStore(levels, state.greenhouse, herbalismOf(player.row), now, content);
  if (!store || store.amount < 1) return { herbs: herbsOf(player.row), taken: 0, since: state.greenhouse?.since ?? now, store };
  const free = bagCapacity(levels, content) - bagPlaces(player);
  const { after, stored } = storeStacks(herbsOf(player.row), { [store.herb]: store.amount }, free, content);
  const taken = stored[store.herb] ?? 0;
  return { herbs: after, taken, since: greenhouseSince(store, taken, now), store };
}

// The herb the Szklarnia grows, one known from Zielarstwo, changed at any
// time: what has grown of the one before goes to the bag first, and the
// change waits while it does not all fit.
export async function chooseGreenhouseHerb(context) {
  const { session, player } = await requirePlayer(context);
  const now = context.now;
  const body = await readJson(context.request);
  const levels = campLevels(player.buildings, now, content);
  if (!fortressOn() || greenhouseHours(levels, content) <= 0) throw new ApiError(409, 'no_greenhouse', 'Zioła hoduje Szklarnia w Warowni.');
  const row = player.row;
  if (!knownHerbs(herbalismOf(row), content).some((herb) => herb.id === body.herb)) {
    throw new ApiError(400, 'unknown_herb', 'Szklarnia hoduje tylko zioła znane z Zielarstwa.');
  }
  const state = stateOf(row);
  const { herbs, taken, store } = harvest(player, levels, state, now);
  if (store && taken < store.amount) throw new ApiError(409, 'bag_full', 'Plecak nie zmieści ziół ze Szklarni. Zrób miejsce, zanim zmienisz zioło.');
  await saveGreenhouse(context, row, { ...state, greenhouse: { herb: body.herb, since: now } }, herbs);
  return json({ collected: taken, character: characterView(await loadPlayer(context.env.DB, session.userId), now) }, 201);
}

// "Zbierz": the herbs grown, into the bag as far as it fits; the rest stays.
export async function collectGreenhouse(context) {
  const { session, player } = await requirePlayer(context);
  const now = context.now;
  const levels = campLevels(player.buildings, now, content);
  const row = player.row;
  const state = stateOf(row);
  const { herbs, taken, since, store } = harvest(player, levels, state, now);
  if (!fortressOn() || !store || store.amount < 1) throw new ApiError(409, 'nothing_grown', 'W Szklarni nic jeszcze nie urosło.');
  if (taken < 1) throw new ApiError(409, 'bag_full', 'Plecak jest pełny.');
  await saveGreenhouse(context, row, { ...state, greenhouse: { ...state.greenhouse, since } }, herbs);
  return json({ collected: { herb: store.herb, name: content.herbsById[store.herb].name, count: taken }, character: characterView(await loadPlayer(context.env.DB, session.userId), now) });
}

// The Zbrojownia (421 A): "Zapisz zestaw" keeps what the character wears,
// under a name the player gives, in one of the sets the building has, and
// "Załóż zestaw" puts one on with a tap, where the equipment may be changed
// by hand. The items of the sets not worn hang on its racks, out of the
// bag; "Usuń zestaw" empties one. What a change takes off the racks or off
// the character goes to the bag, and the change waits while it does not fit.
const armory = () => content.buildings.find((building) => building.fortress && building.effect.kind === 'gearSets');

// The set asked for, the sets, and the bag's free places.
function armoryRequest(player, now, body) {
  const levels = campLevels(player.buildings, now, content);
  const count = fortressOn() ? gearSetCount(levels, content) : 0;
  if (count <= 0) throw new ApiError(409, 'no_armory', 'Zestawy ekwipunku zapisuje Zbrojownia w Warowni.');
  const index = body.index;
  if (!Number.isInteger(index) || index < 0 || index >= count) throw new ApiError(400, 'invalid_set', 'Nie ma takiego zestawu.');
  return { index, sets: gearSetsOf(player.row), room: bagCapacity(levels, content) - bagPlaces(player) };
}

// The set's name: the player's, without control characters or extra
// spaces, cut to the length the data allows, or "Zestaw N".
function setName(name, index) {
  const { gearSets } = armory();
  const clean = typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, gearSets.nameLength).trim() : '';
  return clean || gearSets.name.replace('{n}', index + 1);
}

// Saves the sets with set `index` as `next`, only if the character is as read.
async function saveSet(context, row, sets, index, next) {
  const after = Array.from({ length: Math.max(sets.length, index + 1) }, (_, at) => (at === index ? next : (sets[at] ?? null)));
  const result = await context.env.DB.prepare('UPDATE characters SET fortress = ?, version = version + 1 WHERE id = ? AND version = ?')
    .bind(JSON.stringify({ ...stateOf(row), sets: after }), row.id, row.version)
    .run();
  if (result.meta.changes !== 1) throw new ApiError(409, 'character_changed', 'Postać zmieniła się w międzyczasie. Spróbuj jeszcze raz.');
}

export async function saveGearSet(context) {
  const { session, player } = await requirePlayer(context);
  const now = context.now;
  const body = await readJson(context.request);
  const { index, sets, room } = armoryRequest(player, now, body);
  const worn = equippedItems(player).map((item) => item.id);
  if (worn.length === 0) throw new ApiError(409, 'nothing_worn', 'Załóż coś, zanim zapiszesz zestaw.');
  const next = { name: setName(body.name, index), items: worn };
  const down = leavingRack(sets, index, next, player.items).length;
  if (down > 0 && down > room) throw new ApiError(409, 'bag_full', 'Plecak nie zmieści rzeczy zdjętych ze stojaka.');
  await saveSet(context, player.row, sets, index, next);
  return json({ character: characterView(await loadPlayer(context.env.DB, session.userId), now) }, 201);
}

export async function clearGearSet(context) {
  const { session, player } = await requirePlayer(context);
  const now = context.now;
  const body = await readJson(context.request);
  const { index, sets, room } = armoryRequest(player, now, body);
  if (!sets[index]) throw new ApiError(409, 'empty_set', 'Ten zestaw jest pusty.');
  const down = leavingRack(sets, index, null, player.items).length;
  if (down > 0 && down > room) throw new ApiError(409, 'bag_full', 'Plecak nie zmieści rzeczy zdjętych ze stojaka.');
  await saveSet(context, player.row, sets, index, null);
  return json({ character: characterView(await loadPlayer(context.env.DB, session.userId), now) });
}

export async function wearGearSet(context) {
  const { session, player } = await requirePlayer(context);
  const now = context.now;
  requireNotExploring(player, now);
  const body = await readJson(context.request);
  const { index, sets, room } = armoryRequest(player, now, body);
  const { row } = player;
  const plan = gearSetPlan(sets, index, player.items);
  // Only what the character may wear now (as equipItem asks).
  const wear = plan.wear.filter((item) => !content.slotsById[item.slot].locked && canUse(item.base, row.class_id, content, row.class_level));
  if (wear.length === 0) throw new ApiError(409, 'empty_set', 'W tym zestawie nie ma niczego do założenia.');
  if (plan.toBag.length > 0 && plan.toBag.length > room) throw new ApiError(409, 'bag_full', 'Plecak nie zmieści zdejmowanych rzeczy.');
  const db = context.env.DB;
  await db.batch([
    db.prepare('UPDATE items SET slot = NULL WHERE character_id = ? AND slot IS NOT NULL').bind(row.id),
    ...wear.map((item) => db.prepare('UPDATE items SET slot = ? WHERE id = ? AND character_id = ?').bind(item.slot, item.id, row.id)),
  ]);
  return json({ character: characterView(await loadPlayer(db, session.userId), now) });
}

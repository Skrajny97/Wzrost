// What the page knows about the game: the signed-in user, the content labels,
// the character as the server last described it, and the server clock.

import { ApiError, request } from './api.js';
import { formatNumber } from './format.js';

export const state = {
  user: null,
  content: null,
  character: null,
  // Server time minus local time, so timers follow the server clock.
  offset: 0,
  // Whether the server offers Google sign-in (/api/health).
  googleLogin: false,
  // The report just claimed, until the player leaves it: it has the music
  // of its result (data/music.json "reports").
  freshReport: null,
  // The tag of last week's best guild, in gold wherever a guild's tag shows
  // (380 C; GET /api/character and the guilds' ranking, guild-fame.js).
  championTag: null,
};

const listeners = new Set();

export const serverNow = () => Date.now() + state.offset;

export function onCharacterChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setCharacter(character) {
  state.character = character;
  for (const listener of listeners) listener(character);
}

// The content labels, asked for once: the start screen needs them for the
// music, the game for everything else.
let contentRequest = null;
export function loadContent() {
  contentRequest ??= request('GET', '/api/content').then(
    (content) => (state.content = content),
    (error) => {
      contentRequest = null;
      throw error;
    },
  );
  return contentRequest;
}

// Called when the server no longer knows the session (it expired or was
// ended on another device).
let onSessionLost = () => {};
export const handleSessionLost = (handler) => {
  onSessionLost = handler;
};

// Answers to actions (all but GET) shown so far. A read sent before the
// last of them may come back after it, with the character as it was before.
let actionsShown = 0;

// An API call; a character in the answer replaces the one the page shows.
export async function call(method, path, body) {
  const sentAt = Date.now();
  const action = method !== 'GET';
  const shownBefore = actionsShown;
  let data;
  try {
    data = await request(method, path, body);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) onSessionLost();
    // The server says the character is not as this page shows it (409), or
    // the answer was lost on the way, as when the phone puts the browser in
    // the background: the page asks for the character again, so the screen
    // and the narrator catch up by themselves.
    else if (action && state.character && error instanceof ApiError && (error.status === 409 || error.status === 0)) {
      call('GET', '/api/character').catch(() => {});
    }
    throw error;
  }
  if (data && Object.hasOwn(data, 'championTag')) state.championTag = data.championTag;
  if (data?.character && (action || actionsShown === shownBefore)) {
    if (action) actionsShown += 1;
    state.offset = data.character.serverTime - (sentAt + Date.now()) / 2;
    setCharacter(data.character);
  }
  return data;
}

// HP right now: while resting it grows exactly as the server counts it.
// The same as restedHp() in the engine: a camp upgrade can change the pace at
// `change.at`.
export function currentHp(character = state.character, now = serverNow()) {
  if (!character.regen) return character.hp;
  const { hp, since, perMinute, change } = character.regen;
  const minutes = (from, to) => Math.max(0, to - from) / 60000;
  const at = change ? Math.min(Math.max(change.at, since), now) : now;
  const gained = perMinute * minutes(since, at) + (change ? change.perMinute * minutes(at, now) : 0);
  return Math.min(character.maxHp, Math.floor(hp + gained));
}

// Punkty Czasu right now: one more every `minutes` since `since`, as the
// server adds them (gainedTimePoints in the engine). `nextAt` is when the
// next one comes.
export function timePointsNow(character = state.character, now = serverNow()) {
  const { since, minutes } = character.timePointsGain;
  const every = minutes * 60000;
  const gained = Math.max(0, Math.floor((now - since) / every));
  return { points: character.timePoints + gained, nextAt: since + (gained + 1) * every };
}

// HP a minute while resting now.
export const restRate = (character = state.character) => character.regen?.change?.perMinute ?? character.regen?.perMinute ?? 0;

// Gold and the camp's materials, with their names, in the order to show them.
export const walletEntries = (character = state.character) => [
  { id: 'gold', name: 'Złoto', genitive: 'złota', amount: character.gold },
  ...state.content.resources.map((resource) => ({ id: resource.id, name: resource.name, genitive: resource.genitive, amount: character.resources[resource.id] ?? 0 })),
];

// What a cost lacks of what the character has, as "199 drewna", for "Brakuje:
// …" on a button or under it (the author: buttons say what is missing, 311).
export function costShortfall(cost, character = state.character) {
  const wallet = Object.fromEntries(walletEntries(character).map((entry) => [entry.id, entry]));
  return Object.entries(cost).flatMap(([id, amount]) => {
    const short = amount - (wallet[id]?.amount ?? 0);
    return short > 0 ? [`${formatNumber(short)} ${wallet[id]?.genitive ?? id}`] : [];
  });
}

// What a production building's store holds at `now`, as production() in the
// engine counts it.
export const storeAmount = (store, now = serverNow()) =>
  Math.floor(Math.min(store.capacity, (Math.max(0, now - store.since) / 3600000) * store.perHour));
export const storeFullAt = (store) => store.since + (store.capacity / store.perHour) * 3600000;

// A store that is full and stands, so the player has something to collect.
export const fullStores = (character = state.character, now = serverNow()) =>
  character.camp.buildings.filter((building) => building.production && !building.production.paused && storeAmount(building.production, now) >= building.production.capacity);

// A second of slack, so the page never asks for a report before the server has it.
export const activityFinished = (activity, now = serverNow()) => Boolean(activity) && now >= activity.endsAt + 1000;

export const isUnlocked = (id) => state.character.features.includes(id);
export const unlockInfo = (id) => state.content.unlocks.find((unlock) => unlock.id === id);

// Reports fetched or just claimed, so opening one again needs no request.
export const reportCache = new Map();

// Whether explorations avoid the elite and the champion (the box by
// "Wyrusz", and "Wyrusz ponownie" in a report); kept in this browser.
const AVOID_KEY = 'wzrost.avoid-rare';
let avoidRare = readAvoidRare();

function readAvoidRare() {
  try {
    return localStorage.getItem(AVOID_KEY) === 'on';
  } catch {
    return false;
  }
}

export const avoidRareOn = () => avoidRare;

export function setAvoidRare(value) {
  avoidRare = value;
  try {
    localStorage.setItem(AVOID_KEY, value ? 'on' : 'off');
  } catch {
    // Without storage the choice lasts until the page is closed.
  }
  if (value && seekRare) setSeekRare(false);
}

// Whether explorations seek the elite and the champion instead (the box
// "Trop elity i czempiony" under the avoiding one, and "Wyrusz ponownie");
// kept in this browser. Only one of the two is on at a time.
const SEEK_KEY = 'wzrost.seek-rare';
let seekRare = readSeekRare();

function readSeekRare() {
  try {
    return localStorage.getItem(SEEK_KEY) === 'on' && !avoidRare;
  } catch {
    return false;
  }
}

export const seekRareOn = () => seekRare;

export function setSeekRare(value) {
  seekRare = value;
  try {
    localStorage.setItem(SEEK_KEY, value ? 'on' : 'off');
  } catch {
    // Without storage the choice lasts until the page is closed.
  }
  if (value && avoidRare) setAvoidRare(false);
}

// Whether explorations track the creatures of the narrator's quests (the box
// under the Bestiariusz, and "Wyrusz ponownie"); kept in this browser.
const TRACK_KEY = 'wzrost.track-quests';
let trackQuests = readTrackQuests();

function readTrackQuests() {
  try {
    return localStorage.getItem(TRACK_KEY) === 'on';
  } catch {
    return false;
  }
}

export const trackQuestsOn = () => trackQuests;

export function setTrackQuests(value) {
  trackQuests = value;
  try {
    localStorage.setItem(TRACK_KEY, value ? 'on' : 'off');
  } catch {
    // Without storage the choice lasts until the page is closed.
  }
}

// Whether explorations track the creatures not met yet ("Trop nieznane
// stwory", under the quests' box, and "Wyrusz ponownie"); kept in this
// browser too.
const UNKNOWN_KEY = 'wzrost.track-unknown';
let trackUnknown = readTrackUnknown();

function readTrackUnknown() {
  try {
    return localStorage.getItem(UNKNOWN_KEY) === 'on';
  } catch {
    return false;
  }
}

export const trackUnknownOn = () => trackUnknown;

export function setTrackUnknown(value) {
  trackUnknown = value;
  try {
    localStorage.setItem(UNKNOWN_KEY, value ? 'on' : 'off');
  } catch {
    // Without storage the choice lasts until the page is closed.
  }
}

// "Opcje wyprawy" on the Walka screen stays as the player left it, folded
// (the author: "rozwijaną zakładką") or unfolded; folded at first.
const OPTIONS_KEY = 'wzrost.hunt-options';
let optionsOpen = readOptionsOpen();

function readOptionsOpen() {
  try {
    return localStorage.getItem(OPTIONS_KEY) === 'open';
  } catch {
    return false;
  }
}

export const huntOptionsOpen = () => optionsOpen;

export function setHuntOptionsOpen(value) {
  optionsOpen = value;
  try {
    localStorage.setItem(OPTIONS_KEY, value ? 'open' : 'folded');
  } catch {
    // Without storage the choice lasts until the page is closed.
  }
}

// Test mode ("Pomiń czas" and other test tools) can be turned off in the
// settings while the server allows it; the choice is kept in this browser.
const TEST_MODE_KEY = 'wzrost.test-mode';
let testMode = readTestMode();

function readTestMode() {
  try {
    return localStorage.getItem(TEST_MODE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export const testModeOn = () => testMode;

export function setTestMode(value) {
  testMode = value;
  try {
    localStorage.setItem(TEST_MODE_KEY, value ? 'on' : 'off');
  } catch {
    // Without storage the choice lasts until the page is closed.
  }
}

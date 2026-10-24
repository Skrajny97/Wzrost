// What the page knows about the game: the signed-in user, the content labels,
// the character as the server last described it, and the server clock.

import { ApiError, request } from './api.js';

export const state = {
  user: null,
  content: null,
  character: null,
  // Server time minus local time, so timers follow the server clock.
  offset: 0,
  // Whether the server offers Google sign-in (/api/health).
  googleLogin: false,
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

// An API call; a character in the answer replaces the one the page shows.
export async function call(method, path, body) {
  const sentAt = Date.now();
  let data;
  try {
    data = await request(method, path, body);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) onSessionLost();
    throw error;
  }
  if (data?.character) {
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

// HP a minute while resting now.
export const restRate = (character = state.character) => character.regen?.change?.perMinute ?? character.regen?.perMinute ?? 0;

// Gold and the camp's materials, with their names, in the order to show them.
export const walletEntries = (character = state.character) => [
  { id: 'gold', name: 'Złoto', amount: character.gold },
  ...state.content.resources.map((resource) => ({ id: resource.id, name: resource.name, amount: character.resources[resource.id] ?? 0 })),
];

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

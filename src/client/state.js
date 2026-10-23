// What the page knows about the game: the signed-in user, the content labels,
// the character as the server last described it, and the server clock.

import { ApiError, request } from './api.js';

export const state = {
  user: null,
  content: null,
  character: null,
  // Server time minus local time, so timers follow the server clock.
  offset: 0,
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
export function currentHp(character = state.character, now = serverNow()) {
  if (!character.regen) return character.hp;
  const { hp, since, perMinute } = character.regen;
  return Math.min(character.maxHp, Math.floor(hp + (perMinute * Math.max(0, now - since)) / 60000));
}

// A second of slack, so the page never asks for a report before the server has it.
export const activityFinished = (activity, now = serverNow()) => Boolean(activity) && now >= activity.endsAt + 1000;

export const isUnlocked = (id) => state.character.features.includes(id);
export const unlockInfo = (id) => state.content.unlocks.find((unlock) => unlock.id === id);

// Reports fetched or just claimed, so opening one again needs no request.
export const reportCache = new Map();

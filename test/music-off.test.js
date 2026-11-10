// The music switched off (the author, 10.11.2026: „Opcja wyłączenia nie
// tylko wyciszenia głośności muzyki, by można było słuchać swojej.”):
// src/client/music.js and src/client/sound.js in a page made of stand-ins,
// which count the audio contexts, the <audio> elements and the downloads.
// Off, nothing of the music is downloaded or made, the effects at 0% make no
// audio context, and the Audio Session API is told to mix with the phone's
// other audio; switched on, the music comes back, and switched off again,
// its element and downloads go.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mock, test } from 'node:test';

const music = JSON.parse(readFileSync(new URL('../data/music.json', import.meta.url), 'utf8'));

const stored = new Map([
  ['insight.music', 'off'],
  ['insight.effectsVolume', '0'],
]);
const made = { contexts: 0, elements: [], downloads: [] };

const param = () => ({ value: 1, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} });
const node = (context) => ({ context, gain: param(), connect: (next) => next, disconnect() {} });
class FakeAudioContext {
  constructor() {
    made.contexts += 1;
    this.state = 'running';
    this.currentTime = 0;
    this.destination = {};
  }
  resume() {
    return Promise.resolve();
  }
  createGain() {
    return node(this);
  }
  createDynamicsCompressor() {
    return { threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect: (next) => next };
  }
  createMediaElementSource() {
    return node(this);
  }
}
class FakeAudio {
  constructor() {
    this.src = '';
    this.paused = true;
    this.listeners = {};
    made.elements.push(this);
  }
  addEventListener(type, listener) {
    (this.listeners[type] ??= new Set()).add(listener);
  }
  removeEventListener(type, listener) {
    this.listeners[type]?.delete(listener);
  }
  removeAttribute(name) {
    if (name === 'src') this.src = '';
  }
  load() {}
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}

globalThis.localStorage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, String(value)),
};
globalThis.window = { AudioContext: FakeAudioContext, MediaMetadata: class {} };
globalThis.document = { hidden: false, addEventListener() {} };
globalThis.Audio = FakeAudio;
globalThis.fetch = (path, options = {}) => {
  made.downloads.push({ path, signal: options.signal });
  return Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['mp3'])) });
};
const session = { type: 'auto' };
const mediaSession = { metadata: 'Background v1' };
Object.defineProperty(globalThis, 'navigator', { value: { audioSession: session, mediaSession }, configurable: true });

mock.timers.enable({ apis: ['setTimeout'] });
const { musicOn, preloadReportMusic, prefetchMusic, setMusicConfig, setMusicOn, startMusic } = await import('../src/client/music.js');
const { setEffectsVolume, unlockSound } = await import('../src/client/sound.js');
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('off: no track downloads, no <audio> element and no audio context, and the phone mixes', async () => {
  assert.equal(musicOn(), false);
  // Told before any sound is made.
  assert.equal(session.type, 'ambient');
  setMusicConfig(music);
  // The first touch of the page (app.js) and the game's screen up.
  assert.equal(unlockSound(), null);
  startMusic();
  prefetchMusic();
  preloadReportMusic();
  mock.timers.tick(3000);
  await settle();
  assert.deepEqual(made, { contexts: 0, elements: [], downloads: [] });
});

test('the effects raised from 0 get their audio context, the music still none', async () => {
  setEffectsVolume(40);
  assert.equal(made.contexts, 1);
  assert.notEqual(unlockSound(), null);
  assert.equal(made.contexts, 1);
  assert.equal(made.elements.length, 0);
  assert.equal(made.downloads.length, 0);
  setEffectsVolume(0);
});

test('switched on, the music downloads its track and plays; off again, it all goes', async () => {
  setMusicOn(true);
  assert.equal(stored.get('insight.music'), 'on');
  assert.equal(session.type, 'auto');
  await settle();
  assert.equal(made.elements.length, 1);
  assert.deepEqual(made.downloads.map((download) => download.path), [`/${music.tracks.find((track) => track.id === music.default).file}`]);
  const [element] = made.elements;
  assert.match(element.src, /^blob:/);
  assert.equal(element.paused, false);

  setMusicOn(false);
  assert.equal(stored.get('insight.music'), 'off');
  assert.equal(session.type, 'ambient');
  assert.equal(element.paused, true);
  assert.equal(element.src, '');
  assert.equal(element.listeners.timeupdate.size, 0);
  assert.equal(made.downloads[0].signal.aborted, true);
  assert.equal(mediaSession.metadata, null);
  // Nothing more is downloaded or made while it is off.
  startMusic();
  preloadReportMusic();
  await settle();
  assert.equal(made.elements.length, 1);
  assert.equal(made.downloads.length, 1);
});

// Sound effects. Taps, tab changes, the System and the camp are made with
// the Web Audio API. Blows, dodges and falls in the fight playback are short
// recordings (data/sounds.json, CC0 packs by Kenney), and creatures and
// characters can have voices; whatever has no recording is synthesized. The
// volume is set in the settings and kept in this browser. The same audio
// context plays the background music (music.js).

const VOLUME_KEY = 'insight.effectsVolume';
const OLD_SWITCH_KEY = 'wzrost.sound'; // the earlier on/off switch
let context = null;
let master = null;
let noiseBuffer = null;
let volume = readVolume();
let recordings = null; // content.sounds
const buffers = new Map(); // file → its decoded sound, or the promise of it

function readVolume() {
  try {
    const stored = localStorage.getItem(VOLUME_KEY);
    if (stored !== null && Number.isFinite(Number(stored))) return clampVolume(Number(stored));
    return localStorage.getItem(OLD_SWITCH_KEY) === 'off' ? 0 : 100;
  } catch {
    return 100;
  }
}

export function clampVolume(value) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

// The slider moves in even steps of loudness, not of the signal.
export function volumeGain(value) {
  return (value / 100) ** 2;
}

export const effectsVolume = () => volume;

export function setEffectsVolume(value) {
  volume = clampVolume(value);
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // Without storage the choice lasts until the page is closed.
  }
  if (master) master.gain.value = volumeGain(volume);
}

// Browsers play sound only after the player has touched the page. Returns
// the audio context, or null where the browser has none.
export function unlockSound() {
  if (!context) {
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContext) return null;
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = volumeGain(volume);
    // A limiter, so loud effects together never clip on a phone.
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;
    master.connect(limiter).connect(context.destination);
    loadRecordings();
  }
  // Safari also has the state "interrupted", e.g. after a phone call.
  if (context.state !== 'running') context.resume().catch(() => {});
  return context;
}

// One oscillator note. `lowpass` softens the brighter waves (triangle,
// sawtooth) into a warmer, lower sound that phone speakers still carry.
function tone({ type = 'sine', from, to = from, duration, gain = 0.2, delay = 0, attack = 0.008, lowpass }) {
  const start = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const amplitude = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
  amplitude.gain.setValueAtTime(0.0001, start);
  amplitude.gain.exponentialRampToValueAtTime(gain, start + Math.min(attack, duration / 3));
  amplitude.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  let node = oscillator;
  if (lowpass) {
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    node = oscillator.connect(filter);
  }
  node.connect(amplitude).connect(master);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function noise({ duration, gain = 0.2, filter = 'lowpass', from = 1000, to = from, q = 1, delay = 0 }) {
  if (!noiseBuffer) {
    noiseBuffer = context.createBuffer(1, Math.round(context.sampleRate * 0.5), context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  }
  const start = context.currentTime + delay;
  const source = context.createBufferSource();
  source.buffer = noiseBuffer;
  const shaper = context.createBiquadFilter();
  shaper.type = filter;
  shaper.Q.value = q;
  shaper.frequency.setValueAtTime(from, start);
  shaper.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
  const amplitude = context.createGain();
  amplitude.gain.setValueAtTime(gain, start);
  amplitude.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(shaper).connect(amplitude).connect(master);
  source.start(start);
  source.stop(start + duration + 0.02);
}

// A struck bell: a few inharmonic partials that fade at their own pace.
function bell(base, { gain = 0.08, delay = 0, length = 1.1 } = {}) {
  [
    [1, 1, 1],
    [2, 0.45, 0.7],
    [2.76, 0.3, 0.5],
    [5.4, 0.1, 0.3],
  ].forEach(([ratio, level, fade]) => tone({ from: base * ratio, duration: length * fade, gain: gain * level, delay, attack: 0.004 }));
}

// A knock on wood: a short low note and a soft click of its attack.
function knock({ from = 240, gain = 0.1, delay = 0 } = {}) {
  tone({ type: 'triangle', from, to: from * 0.7, duration: 0.07, gain, delay, lowpass: 1300 });
  noise({ duration: 0.025, gain: gain * 0.25, filter: 'bandpass', from: 900, q: 1.2, delay });
}

// Low, soft sounds: taps are knocks on wood, the System speaks with a bell,
// blows land with a thud.
const SOUNDS = {
  tap: () => knock({ from: 250, gain: 0.09 }),
  tab: () => {
    knock({ from: 210, gain: 0.08 });
    knock({ from: 280, gain: 0.07, delay: 0.06 });
  },
  open: () => noise({ duration: 0.18, gain: 0.04, filter: 'lowpass', from: 300, to: 1000 }),
  swing: () => noise({ duration: 0.12, gain: 0.08, filter: 'bandpass', from: 450, to: 1300, q: 1.4 }),
  hit: () => {
    noise({ duration: 0.13, gain: 0.3, from: 1100, to: 180 });
    tone({ type: 'triangle', from: 170, to: 70, duration: 0.17, gain: 0.22, lowpass: 900 });
  },
  crit: () => {
    noise({ duration: 0.17, gain: 0.34, from: 1500, to: 220 });
    tone({ type: 'triangle', from: 150, to: 55, duration: 0.24, gain: 0.28, lowpass: 900 });
    // A dull clang of metal.
    tone({ type: 'triangle', from: 330, duration: 0.22, gain: 0.05, lowpass: 1600 });
    tone({ type: 'triangle', from: 497, duration: 0.18, gain: 0.035, lowpass: 1600 });
  },
  arrow: () => {
    noise({ duration: 0.16, gain: 0.09, filter: 'bandpass', from: 1700, to: 500, q: 2.4 });
    knock({ from: 200, gain: 0.07, delay: 0.14 });
  },
  magic: () => {
    tone({ from: 200, to: 440, duration: 0.32, gain: 0.1 });
    tone({ type: 'triangle', from: 300, to: 660, duration: 0.32, gain: 0.035, lowpass: 1200 });
    noise({ duration: 0.3, gain: 0.025, filter: 'bandpass', from: 600, to: 1400, q: 3 });
  },
  dodge: () => noise({ duration: 0.15, gain: 0.07, filter: 'bandpass', from: 900, to: 320, q: 1.8 }),
  effect: () => tone({ type: 'sawtooth', from: 160, to: 120, duration: 0.22, gain: 0.05, lowpass: 650 }),
  tick: () => tone({ type: 'triangle', from: 200, to: 150, duration: 0.09, gain: 0.07, lowpass: 900 }),
  kill: () => {
    tone({ type: 'triangle', from: 130, to: 45, duration: 0.42, gain: 0.26, lowpass: 700 });
    noise({ duration: 0.3, gain: 0.1, from: 450, to: 90 });
  },
  // A short, warm fanfare, like a horn in the forest.
  victory: () =>
    [
      [196, 0, 0.18],
      [262, 0.1, 0.18],
      [330, 0.2, 0.42],
    ].forEach(([from, delay, duration]) => {
      tone({ type: 'sawtooth', from, duration, gain: 0.05, delay, attack: 0.03, lowpass: 1100 });
      tone({ from: from / 2, duration, gain: 0.05, delay, attack: 0.03 });
    }),
  defeat: () => {
    tone({ type: 'sawtooth', from: 220, to: 110, duration: 0.8, gain: 0.06, attack: 0.04, lowpass: 700 });
    tone({ from: 110, to: 82, duration: 0.9, gain: 0.07, attack: 0.05 });
  },
  system: () => {
    bell(262, { gain: 0.07 });
    bell(392, { gain: 0.06, delay: 0.14 });
  },
  // The camp: hammer knocks for a new build, a soft pick-up when a store is
  // collected, and a bell when a building is ready.
  build: () => [0, 0.17, 0.34].forEach((delay) => knock({ from: 190, gain: 0.1, delay })),
  collect: () => {
    knock({ from: 230, gain: 0.08 });
    tone({ type: 'triangle', from: 330, duration: 0.12, gain: 0.05, delay: 0.06, lowpass: 1400 });
    tone({ type: 'triangle', from: 440, duration: 0.18, gain: 0.05, delay: 0.13, lowpass: 1400 });
  },
  done: () => bell(330, { gain: 0.07, length: 0.9 }),
};

export function playSound(name) {
  if (volume === 0 || !context || context.state !== 'running') return;
  try {
    SOUNDS[name]?.();
  } catch {
    // Sound is a nicety; a failure never stops the game.
  }
}

// Recordings

export function setRecordings(sounds) {
  recordings = sounds;
  loadRecordings();
}

// Decodes every recording once, after the first touch (they are small).
function loadRecordings() {
  if (!recordings || !context) return;
  const voices = Object.values(recordings.voices).flatMap((voice) => Object.values(voice));
  for (const file of new Set([...Object.values(recordings.sounds), ...voices].flatMap((sound) => sound.files))) {
    if (buffers.has(file)) continue;
    const loading = fetch(`/${file}`)
      .then((response) => {
        if (!response.ok) throw new Error(`sound ${response.status}`);
        return response.arrayBuffer();
      })
      // The callback form also works in older Safari.
      .then((data) => new Promise((resolve, reject) => context.decodeAudioData(data, resolve, reject)))
      .then((buffer) => buffers.set(file, buffer))
      .catch(() => buffers.delete(file));
    buffers.set(file, loading);
  }
}

// Plays one of a sound's recordings, a little higher or lower each time.
// False when none is ready.
function playRecording(sound, { gain = 1, delay = 0 } = {}) {
  const ready = sound.files.map((file) => buffers.get(file)).filter((buffer) => buffer instanceof AudioBuffer);
  if (ready.length === 0) return false;
  const source = context.createBufferSource();
  source.buffer = ready[Math.floor(Math.random() * ready.length)];
  source.playbackRate.value = 0.94 + Math.random() * 0.12;
  const amplitude = context.createGain();
  amplitude.gain.value = sound.gain * gain;
  source.connect(amplitude).connect(master);
  source.start(context.currentTime + delay);
  return true;
}

const canPlay = () => volume > 0 && context && context.state === 'running';

// A blow lands: the recording of the attack's kind (weapon or monster), with
// a heavier layer for a critical hit.
export function playHit(kind, strong) {
  if (!canPlay()) return;
  const sound = recordings?.sounds[kind];
  try {
    if (!sound || !playRecording(sound)) {
      SOUNDS[strong ? 'crit' : 'hit']();
      return;
    }
    if (strong) playRecording(recordings.sounds.crit, { delay: 0.012 });
  } catch {
    // Sound is a nicety; a failure never stops the game.
  }
}

// A dodge or a fall, recorded where there is a recording.
export function playMoment(kind) {
  if (!canPlay()) return;
  const sound = recordings?.sounds[kind];
  try {
    if (!sound || !playRecording(sound)) SOUNDS[kind]?.();
  } catch {
    // As above.
  }
}

// A creature (by its id) or a character (by its look) cries out when hit
// ("hurt") or defeated ("death"), if it has a voice.
export function playVoice(who, kind) {
  const voice = who && recordings?.voices[who]?.[kind];
  if (!voice || !canPlay()) return;
  try {
    playRecording(voice, { delay: 0.04 });
  } catch {
    // As above.
  }
}

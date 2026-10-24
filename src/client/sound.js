// Short sound effects made with the Web Audio API, so the game needs no audio
// files: taps, tab changes, the blows of the fight playback, the System and
// the camp. They can be turned off in the settings; the choice is kept in
// this browser.

const KEY = 'wzrost.sound';
let context = null;
let master = null;
let noiseBuffer = null;
let enabled = readSetting();

function readSetting() {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export const soundEnabled = () => enabled;

export function setSoundEnabled(value) {
  enabled = value;
  try {
    localStorage.setItem(KEY, value ? 'on' : 'off');
  } catch {
    // Without storage the choice lasts until the page is closed.
  }
  if (value) unlockSound();
}

// Browsers play sound only after the player has touched the page.
export function unlockSound() {
  if (!enabled) return;
  if (!context) {
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContext) return;
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0.5;
    master.connect(context.destination);
  }
  if (context.state === 'suspended') context.resume().catch(() => {});
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
  if (!enabled || !context || context.state !== 'running') return;
  try {
    SOUNDS[name]?.();
  } catch {
    // Sound is a nicety; a failure never stops the game.
  }
}

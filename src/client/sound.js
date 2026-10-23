// Short sound effects made with the Web Audio API, so the game needs no audio
// files: taps, tab changes and the blows of the fight playback. They can be
// turned off in the settings; the choice is kept in this browser.

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

function tone({ type = 'sine', from, to = from, duration, gain = 0.2, delay = 0 }) {
  const start = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const amplitude = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
  amplitude.gain.setValueAtTime(0.0001, start);
  amplitude.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.01, duration / 4));
  amplitude.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(amplitude).connect(master);
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

const SOUNDS = {
  tap: () => tone({ type: 'triangle', from: 880, to: 620, duration: 0.05, gain: 0.06 }),
  tab: () => {
    tone({ type: 'triangle', from: 520, duration: 0.06, gain: 0.06 });
    tone({ type: 'triangle', from: 780, duration: 0.08, gain: 0.06, delay: 0.05 });
  },
  open: () => noise({ duration: 0.12, gain: 0.04, filter: 'bandpass', from: 700, to: 2400, q: 1.5 }),
  swing: () => noise({ duration: 0.1, gain: 0.07, filter: 'bandpass', from: 900, to: 2600, q: 2 }),
  hit: () => {
    noise({ duration: 0.12, gain: 0.3, from: 1400, to: 300 });
    tone({ from: 160, to: 60, duration: 0.15, gain: 0.22 });
  },
  crit: () => {
    noise({ duration: 0.16, gain: 0.35, from: 2600, to: 400 });
    tone({ type: 'square', from: 1300, to: 900, duration: 0.12, gain: 0.05 });
    tone({ from: 140, to: 50, duration: 0.2, gain: 0.28 });
  },
  arrow: () => noise({ duration: 0.18, gain: 0.1, filter: 'bandpass', from: 3200, to: 900, q: 3 }),
  magic: () => {
    tone({ from: 300, to: 900, duration: 0.25, gain: 0.1 });
    tone({ type: 'triangle', from: 600, to: 1500, duration: 0.25, gain: 0.04 });
  },
  dodge: () => noise({ duration: 0.15, gain: 0.08, filter: 'bandpass', from: 1800, to: 500, q: 2 }),
  effect: () => tone({ type: 'sawtooth', from: 220, to: 170, duration: 0.18, gain: 0.035 }),
  tick: () => tone({ from: 240, to: 190, duration: 0.08, gain: 0.07 }),
  kill: () => {
    tone({ from: 110, to: 40, duration: 0.35, gain: 0.26 });
    noise({ duration: 0.25, gain: 0.1, from: 500, to: 120 });
  },
  victory: () => [523, 659, 784].forEach((from, i) => tone({ type: 'triangle', from, duration: 0.18, gain: 0.08, delay: i * 0.09 })),
  defeat: () => tone({ type: 'triangle', from: 392, to: 130, duration: 0.6, gain: 0.09 }),
  system: () => [784, 988, 1175, 1568].forEach((from, i) => tone({ from, duration: 0.2, gain: 0.05, delay: i * 0.07 })),
};

export function playSound(name) {
  if (!enabled || !context || context.state !== 'running') return;
  try {
    SOUNDS[name]?.();
  } catch {
    // Sound is a nicety; a failure never stops the game.
  }
}

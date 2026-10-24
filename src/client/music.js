// Background music from data/music.json. For now one track plays on every
// screen; a region, an inner region or the camp can get its own, and the
// music then changes with the screen. A track fades out over its last
// seconds and starts again after a short pause. The volume is set in the
// settings and kept in this browser.
//
// A track is downloaded whole and played from memory: Safari plays sound
// files only from servers that send them in parts, which the game's static
// files do not. The <audio> element goes through the shared audio context
// (sound.js), because Safari on iPhone ignores the element's own volume.

import { clampVolume, unlockSound, volumeGain } from './sound.js';

const VOLUME_KEY = 'insight.musicVolume';
const SWITCH_SECONDS = 1.5; // from one track to another

let config = null; // content.music
let volume = readVolume();
let wanted = null; // the track for the screen on show
let playing = null; // the track in the element
let touched = false; // browsers play sound only after a touch
let audio = null;
let level = null; // gain: the player's volume
let fade = null; // gain: the end of a track and the change of tracks
let fading = false;
let restart = null; // the pause between two plays of a track
let switching = false;
const sources = new Map(); // track id → a promise of its file in memory

function readVolume() {
  try {
    const stored = localStorage.getItem(VOLUME_KEY);
    return stored !== null && Number.isFinite(Number(stored)) ? clampVolume(Number(stored)) : 50;
  } catch {
    return 50;
  }
}

export const musicVolume = () => volume;

export function setMusicVolume(value) {
  volume = clampVolume(value);
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // Without storage the choice lasts until the page is closed.
  }
  applyVolume();
  update();
}

export function setMusicConfig(music) {
  config = music;
  wanted ??= music.default;
  // The file is on its way before the first touch.
  if (volume > 0) source(wanted).catch(() => {});
  update();
}

// The places of the screen on show, the most specific first, e.g.
// [inner region, region] or ['camp']; none for the other screens.
export function setMusicPlace(places) {
  if (!config) return;
  const track = places.map((place) => config.places[place]).find(Boolean) ?? config.default;
  if (track === wanted) return;
  wanted = track;
  update();
}

// Called on every touch until the music plays.
export function startMusic() {
  touched = true;
  update();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
  else update();
});

function source(id) {
  if (!sources.has(id)) {
    const track = config.tracks.find((candidate) => candidate.id === id);
    const loading = fetch(`/${track.file}`)
      .then((response) => {
        if (!response.ok) throw new Error(`music ${response.status}`);
        return response.blob();
      })
      .then((blob) => URL.createObjectURL(blob));
    // A failed download is tried again later.
    loading.catch(() => sources.delete(id));
    sources.set(id, loading);
  }
  return sources.get(id);
}

function update() {
  if (!config || !touched || volume === 0 || document.hidden) {
    pause();
    return;
  }
  if (!audio) setUp();
  if (playing !== wanted) changeTrack();
  else if (audio.paused && restart === null && !switching) play();
}

function setUp() {
  const context = unlockSound();
  audio = new Audio();
  audio.addEventListener('timeupdate', fadeOutNearEnd);
  audio.addEventListener('ended', pauseThenRestart);
  if (context) {
    level = context.createGain();
    fade = context.createGain();
    context.createMediaElementSource(audio).connect(fade).connect(level).connect(context.destination);
  }
  applyVolume();
}

function applyVolume() {
  if (!audio) return;
  if (level) level.gain.value = volumeGain(volume);
  else audio.volume = volumeGain(volume);
}

function setFade(value, seconds = 0) {
  if (!fade) {
    audio.volume = volumeGain(volume) * value;
    return;
  }
  const now = fade.context.currentTime;
  fade.gain.cancelScheduledValues(now);
  fade.gain.setValueAtTime(fade.gain.value, now);
  if (seconds > 0) fade.gain.linearRampToValueAtTime(value, now + seconds);
  else fade.gain.setValueAtTime(value, now);
}

function play() {
  if (!audio.src) return;
  unlockSound();
  fading = false;
  if (audio.ended) audio.currentTime = 0;
  if (audio.currentTime < 1) setFade(1);
  audio.play().catch(() => {
    // Not allowed yet: the next touch tries again.
  });
}

function pause() {
  clearTimeout(restart);
  restart = null;
  fading = false;
  if (audio && !audio.paused) audio.pause();
}

// Fades the track out (if one plays), then starts the wanted one.
async function changeTrack() {
  if (switching) return;
  switching = true;
  try {
    if (playing && !audio.paused) {
      setFade(0, SWITCH_SECONDS);
      await new Promise((resolve) => setTimeout(resolve, SWITCH_SECONDS * 1000));
    }
    let id;
    let url;
    do {
      id = wanted;
      url = await source(id);
    } while (id !== wanted);
    playing = id;
    audio.src = url;
    const track = config.tracks.find((candidate) => candidate.id === id);
    if ('mediaSession' in navigator && 'MediaMetadata' in window) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.name,
        artist: 'Insight',
        artwork: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
      });
    }
  } catch {
    // The download failed: the next touch tries again.
  } finally {
    switching = false;
  }
  if (playing === wanted && touched && volume > 0 && !document.hidden) play();
}

// The last seconds of a track grow quiet, also when it resumes there.
function fadeOutNearEnd() {
  const left = audio.duration - audio.currentTime;
  if (fading || !Number.isFinite(left) || left > config.fadeOutSeconds) return;
  if (fade) {
    fading = true;
    setFade(Math.min(1, left / config.fadeOutSeconds));
    setFade(0, left);
  } else {
    // Without the audio context the volume follows each update.
    audio.volume = volumeGain(volume) * Math.min(1, left / config.fadeOutSeconds);
  }
}

function pauseThenRestart() {
  fading = false;
  restart = setTimeout(() => {
    restart = null;
    audio.currentTime = 0;
    setFade(1);
    if (!document.hidden && volume > 0) play();
  }, config.pauseSeconds * 1000);
}

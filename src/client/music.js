// Background music from data/music.json. One track plays on most screens; a
// region, an inner region, the camp or a tab (Umiejętności, Profesje) can
// have its own, and the music then changes with the screen. A report opened right after its
// exploration plays the track of its result once (a win, a faint). A change
// of tracks fades one out and the next in, and a track that comes back goes
// on from where it stopped. A track fades out over its last seconds and
// starts again after a short pause. The volume is set in the settings and
// kept in this browser.
//
// The music can also be switched off in the settings, for good and not only
// turned down, so the player can listen to their own (the author,
// 10.11.2026: „Opcja wyłączenia nie tylko wyciszenia głośności muzyki, by
// można było słuchać swojej.”). Off, kept in this browser like the volume:
// no track is downloaded or played and no <audio> element is made for it;
// switched off while it plays, the element goes with its files. While the
// game plays no music, off or at 0%, its effects and the narrator mix with
// the phone's other audio where the browser lets the page say so
// (mixWithOtherAudio, sound.js).
//
// A track is downloaded whole and played from memory: Safari plays sound
// files only from servers that send them in parts, which the game's static
// files do not. The <audio> element goes through the shared audio context
// (sound.js), because Safari on iPhone ignores the element's own volume.

import { audioContext, clampVolume, mixWithOtherAudio, volumeGain } from './sound.js';

const ON_KEY = 'insight.music';
const VOLUME_KEY = 'insight.musicVolume';
// 100% at first: with effects at 40% the author found the two best balanced.
const DEFAULT_VOLUME = 100;
// Even at 100% the music stays below the effects, which are short and need
// the room (half the signal, −6 dB).
const MUSIC_LEVEL = 0.5;

let config = null; // content.music
let on = readOn();
let volume = readVolume();
let wanted = null; // the track for the screen on show
let playing = null; // the track in the element
let touched = false; // browsers play sound only after a touch
let gameShown = false; // the game's own screen is up (prefetchMusic)
let audio = null;
let element = null; // the audio context's source for the element
let level = null; // gain: the player's volume
let fade = null; // gain: the end of a track and the change of tracks
let duck = null; // gain: lower while the narrator speaks
let ducked = false;
let fading = false; // the end of the track is fading out
let restart = null; // the pause between two plays of a track
let switching = false;
const sources = new Map(); // track id → a promise of its file in memory
const positions = new Map(); // track id → the second it stopped at
let downloads = new AbortController(); // stops the downloads when switched off

function readOn() {
  try {
    return localStorage.getItem(ON_KEY) !== 'off';
  } catch {
    return true;
  }
}

function readVolume() {
  try {
    const stored = localStorage.getItem(VOLUME_KEY);
    return stored !== null && Number.isFinite(Number(stored)) ? clampVolume(Number(stored)) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

export const musicVolume = () => volume;
export const musicOn = () => on;

// Whether the game plays music at all: switched on and above 0%.
const heard = () => on && volume > 0;

// Before any sound is made: an audio context made later takes the phone's
// audio as this says (sound.js).
mixWithOtherAudio(!heard());

export function setMusicVolume(value) {
  volume = clampVolume(value);
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // Without storage the choice lasts until the page is closed.
  }
  mixWithOtherAudio(!heard());
  applyVolume();
  update();
}

// "Muzyka" in the settings: on, or off for good (above).
export function setMusicOn(value) {
  on = Boolean(value);
  try {
    localStorage.setItem(ON_KEY, on ? 'on' : 'off');
  } catch {
    // Without storage the choice lasts until the page is closed.
  }
  mixWithOtherAudio(!heard());
  if (!on) tearDown();
  update();
}

export function setMusicConfig(music) {
  config = music;
  wanted ??= music.default;
  update();
}

// The track of the screen on show is on its way before the first touch, a
// moment after the game's own screen is up (app.js): sooner, its download
// would hold up the start of the game and its pictures on a slow connection.
const PREFETCH_DELAY = 3000;
export function prefetchMusic() {
  if (gameShown) return;
  gameShown = true;
  setTimeout(() => {
    if (config && heard()) source(wanted).catch(() => {});
  }, PREFETCH_DELAY);
}

// The places of the screen on show, the most specific first, e.g.
// [inner region, region] or ['camp']; none for the other screens. `report`:
// the result of a report just claimed (success, fainted, escaped), whose
// track goes first.
export function setMusicPlace(places, report = null) {
  if (!config) return;
  const track = (report && config.reports[report]) || places.map((place) => config.places[place]).find(Boolean) || config.default;
  if (track === wanted) return;
  wanted = track;
  update();
}

// The report tracks load while an exploration lasts, so the music can change
// as soon as its report opens.
export function preloadReportMusic() {
  if (!config || !heard()) return;
  for (const id of new Set(Object.values(config.reports))) source(id).catch(() => {});
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
  // Nothing downloads while the music is off.
  if (!on) return Promise.reject(new Error('music off'));
  if (!sources.has(id)) {
    const track = config.tracks.find((candidate) => candidate.id === id);
    const loading = fetch(`/${track.file}`, { signal: downloads.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`music ${response.status}`);
        return response.blob();
      })
      .then((blob) => URL.createObjectURL(blob));
    // A failed download is tried again later (one stopped by the switch
    // leaves the downloads begun after it alone).
    loading.catch(() => {
      if (sources.get(id) === loading) sources.delete(id);
    });
    sources.set(id, loading);
  }
  return sources.get(id);
}

function update() {
  if (!config || !touched || !heard() || document.hidden) {
    pause();
    return;
  }
  if (!audio) setUp();
  if (playing !== wanted) changeTrack();
  else if (audio.paused && restart === null && !switching) play();
}

function setUp() {
  const context = audioContext();
  audio = new Audio();
  audio.addEventListener('timeupdate', fadeOutNearEnd);
  audio.addEventListener('ended', pauseThenRestart);
  if (context) {
    level = context.createGain();
    fade = context.createGain();
    duck = context.createGain();
    duck.gain.value = ducked ? DUCK_LEVEL : 1;
    element = context.createMediaElementSource(audio);
    element.connect(fade).connect(level).connect(duck).connect(context.destination);
  }
  applyVolume();
}

// Switched off: the element goes, unhooked from the audio context, with the
// files downloaded and the downloads under way, and the phone's lock screen
// no longer names a track of the game. Switched on again, all starts anew.
function tearDown() {
  pause();
  downloads.abort();
  downloads = new AbortController();
  for (const loading of sources.values()) loading.then((url) => URL.revokeObjectURL(url), () => {});
  sources.clear();
  positions.clear();
  if (audio) {
    audio.removeEventListener('timeupdate', fadeOutNearEnd);
    audio.removeEventListener('ended', pauseThenRestart);
    audio.removeAttribute('src');
    audio.load();
  }
  for (const node of [element, fade, level, duck]) node?.disconnect();
  audio = element = level = fade = duck = null;
  playing = null;
  try {
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
  } catch {
    // Only the lock screen's words.
  }
}

// While the narrator speaks, the music steps back to a quarter of its level,
// and comes back slowly after.
const DUCK_LEVEL = 0.25;

export function duckMusic(down) {
  ducked = down;
  if (!duck) return;
  const now = duck.context.currentTime;
  duck.gain.cancelScheduledValues(now);
  duck.gain.setValueAtTime(duck.gain.value, now);
  duck.gain.linearRampToValueAtTime(down ? DUCK_LEVEL : 1, now + (down ? 0.4 : 1.2));
}

function applyVolume() {
  if (!audio) return;
  if (level) level.gain.value = MUSIC_LEVEL * volumeGain(volume);
  else audio.volume = MUSIC_LEVEL * volumeGain(volume);
}

function setFade(value, seconds = 0) {
  if (!fade) {
    audio.volume = MUSIC_LEVEL * volumeGain(volume) * value;
    return;
  }
  const now = fade.context.currentTime;
  fade.gain.cancelScheduledValues(now);
  fade.gain.setValueAtTime(fade.gain.value, now);
  if (seconds > 0) fade.gain.linearRampToValueAtTime(value, now + seconds);
  else fade.gain.setValueAtTime(value, now);
}

function play() {
  if (!audio?.src) return;
  audioContext();
  fading = false;
  if (audio.ended) audio.currentTime = 0;
  const id = playing;
  audio
    .play()
    .then(() => {
      // A track that starts or comes back fades in from silence.
      if (playing === id && !switching && !fading) setFade(1, config.switchSeconds);
    })
    .catch(() => {
      // Not allowed yet: the next touch tries again.
    });
}

function pause() {
  clearTimeout(restart);
  restart = null;
  fading = false;
  if (audio && !audio.paused) audio.pause();
}

// Fades the track out (if one plays), then the wanted one in: a report's
// track from its beginning, any other from where it stopped.
async function changeTrack() {
  if (switching) return;
  switching = true;
  clearTimeout(restart);
  restart = null;
  try {
    // The next file loads while the old track fades out.
    source(wanted).catch(() => {});
    if (playing && !audio.paused) {
      setFade(0, config.switchSeconds);
      await new Promise((resolve) => setTimeout(resolve, config.switchSeconds * 1000));
      if (!audio) return;
    }
    let id;
    let url;
    do {
      id = wanted;
      url = await source(id);
    } while (id !== wanted);
    // Switched off while the file came (tearDown).
    if (!audio) return;
    // Back to the same track within the fade: it simply fades in again.
    if (id !== playing) {
      if (playing) keepPosition();
      playing = id;
      setFade(0);
      audio.src = url;
      const at = Object.values(config.reports).includes(id) ? 0 : positions.get(id) ?? 0;
      if (at > 0) {
        audio.addEventListener(
          'loadedmetadata',
          () => {
            if (playing === id) audio.currentTime = at;
          },
          { once: true },
        );
      }
      const track = config.tracks.find((candidate) => candidate.id === id);
      if ('mediaSession' in navigator && 'MediaMetadata' in window) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.name,
          artist: 'Insight',
          artwork: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
        });
      }
    }
  } catch {
    // The download failed: the next touch tries again.
  } finally {
    switching = false;
  }
  if (audio && playing === wanted && touched && heard() && !document.hidden) play();
}

// Where the leaving track stopped. From its fading end it would start over.
function keepPosition() {
  const left = audio.duration - audio.currentTime;
  positions.set(playing, audio.ended || !(left > config.fadeOutSeconds + 1) ? 0 : audio.currentTime);
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
    audio.volume = MUSIC_LEVEL * volumeGain(volume) * Math.min(1, left / config.fadeOutSeconds);
  }
}

function pauseThenRestart() {
  fading = false;
  restart = setTimeout(() => {
    restart = null;
    if (!audio) return;
    audio.currentTime = 0;
    setFade(1);
    if (!document.hidden && heard()) play();
  }, config.pauseSeconds * 1000);
}

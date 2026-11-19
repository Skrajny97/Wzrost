// Kulki Systemu over the Walka scene of an exploration under way
// (data/orbs.json, src/server/orbs.js; DECISIONS.md, „Kulki Systemu na
// planszy wyprawy (makieta, 19.11.2026)”). The server decides when each orb
// comes (activity.orbs.at, server time): it floats across the scene for
// flightSeconds on a gentle wave with a soft glow, a tap catches it, and one
// missed is gone. Each flies by the server's clock (serverNow), so a screen
// drawn anew, as after a catch, shows it just where it was. With the game's
// animations off (motion.js: the game follows its own switch, not the
// phone's; DECISIONS.md, „Kamera narratora i przełącznik animacji”, punkt 1)
// the orb stands still in the scene and fades in and out. None once the
// day's orbs are caught (`left`), till the day ends (`resetsAt`). The orbs fly
// in a layer over the scene, cut to its box, so they never cover the buttons
// around it; only the orb itself takes a tap.

import { orbArt } from './art.js';
import { h } from './dom.js';
import { motionOn } from './motion.js';
import { playSound } from './sound.js';
import { call, serverNow, state } from './state.js';
import { toast } from './ui.js';

// The orb drawn at twice its 32 px: 64 px, a tap target past 44 px.
const SCALE = 2;
const SIZE = 32 * SCALE;
// The heights the orbs fly at, from the scene's top (px), by the orb's
// number, so the next one comes at another height; with the wave of
// ±12 px they stay inside the scene's 192 px.
const LANES = [22, 52, 82];
// Where a still orb stands across the scene, by its number (the share of
// the room beside it).
const SPOTS = [0.2, 0.64, 0.4, 0.82];
// A catch's light lasts this long (ms) at the place the orb was.
const BURST_MS = 650;

// The scene of an exploration under way (scenes.js walkScene's element)
// with its orbs over it, or the scene alone where the exploration has none.
export function orbField(activity, scene) {
  const host = h('div', { class: 'orb-host' }, scene);
  const orbs = activity.orbs;
  const rules = state.content?.orbs;
  if (!orbs || !rules) return host;
  const layer = h('div', { class: 'orb-layer' });
  host.append(layer);
  const flight = rules.flightSeconds * 1000;
  // An orb left to show: its flight not over, not caught, and a day with
  // orbs left, or one after the day's end.
  const waiting = (index, now) => orbs.at[index] + flight > now && !orbs.claimed.includes(index) && (orbs.left > 0 || orbs.at[index] >= orbs.resetsAt);
  let index = 0;
  // One timer at a time, to the next orb; a layer the screen has drawn anew
  // without stops (the new one has its own).
  const step = () => {
    if (!layer.isConnected) return;
    const now = serverNow();
    while (index < orbs.at.length && !waiting(index, now)) index += 1;
    if (index >= orbs.at.length) return;
    const at = orbs.at[index];
    if (at > now) {
      setTimeout(step, at - now);
      return;
    }
    launch(layer, rules, index, now - at);
    index += 1;
    step();
  };
  setTimeout(step, 0);
  return host;
}

// Orb `index` in the layer, `elapsed` ms into its flight: across the scene
// from the left (every other one from the right), or still where its
// number puts it with the animations off; gone at the flight's end.
function launch(layer, rules, index, elapsed) {
  const still = !motionOn();
  const button = h('button', { type: 'button', class: 'orb', 'aria-label': rules.texts.label }, orbArt(rules.art, SCALE));
  const flying = h('div', { class: `orb-flight${still ? ' orb-flight--still' : index % 2 ? ' orb-flight--back' : ''}` }, button);
  flying.style.top = `${LANES[index % LANES.length]}px`;
  if (still) flying.style.left = `calc((100% - ${SIZE}px) * ${SPOTS[index % SPOTS.length]})`;
  flying.style.setProperty('--across', `${layer.clientWidth}px`);
  flying.style.setProperty('--flight', `${rules.flightSeconds}s`);
  // Already this far: the animations start where the flight is now.
  flying.style.setProperty('--since', `${(-elapsed / 1000).toFixed(3)}s`);
  button.addEventListener('click', () => catchOrb(rules, index, flying, button));
  layer.append(flying);
  setTimeout(() => flying.remove(), Math.max(0, rules.flightSeconds * 1000 - elapsed));
}

// A tap: the orb bursts into light at once, and the server says what it
// gave (a coin's sound and a bubble), or why not.
async function catchOrb(rules, index, flying, button) {
  if (flying.classList.contains('orb-flight--caught')) return;
  flying.classList.add('orb-flight--caught');
  burst(button.getBoundingClientRect(), flying.parentElement.getBoundingClientRect(), button.querySelector('img'));
  flying.remove();
  try {
    const { orb } = await call('POST', '/api/hunts/orb', { index });
    playSound(rules.sound);
    toast(orb.text);
  } catch (error) {
    toast(error.message);
  }
}

// The light of a catch where the orb was (`box`), over the page, so the
// screen drawn anew with the catch leaves it be, and cut to the scene
// (`scene`, the orbs' layer) as the orbs are: the orb's own picture (`art`,
// on the screen already, so it shows at once) bursting with a ring of light.
function burst(box, scene, art) {
  const light = h('div', { class: 'orb-burst' }, art);
  light.style.left = `${Math.round(box.left - scene.left)}px`;
  light.style.top = `${Math.round(box.top - scene.top)}px`;
  const frame = h('div', { class: 'orb-burst-frame', 'aria-hidden': 'true' }, light);
  frame.style.left = `${Math.round(scene.left)}px`;
  frame.style.top = `${Math.round(scene.top)}px`;
  frame.style.width = `${Math.round(scene.width)}px`;
  frame.style.height = `${Math.round(scene.height)}px`;
  document.body.append(frame);
  setTimeout(() => frame.remove(), BURST_MS);
}

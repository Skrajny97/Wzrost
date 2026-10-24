// Animations: on unless turned off in the game's settings ("Animacje"). The
// phone's own setting for less motion is not followed: with it on, the
// narrator's camera and parchment would stand still, and the author's phone
// has it on. The page's calm look is the `calm` class (styles.css).

const MOTION_KEY = 'insight.motion';
let motion = readMotion();

function readMotion() {
  try {
    return localStorage.getItem(MOTION_KEY) !== 'off';
  } catch {
    return true;
  }
}

export const motionOn = () => motion;

export function setMotion(on) {
  motion = on;
  try {
    localStorage.setItem(MOTION_KEY, on ? 'on' : 'off');
  } catch {
    // Without storage the choice lasts until the page is closed.
  }
  applyMotion();
}

export function applyMotion() {
  document.documentElement.classList.toggle('calm', !motion);
}

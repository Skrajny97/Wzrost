// The narrator's introduction for a new character (data/tutorial.json), line
// by line in its order:
// - a card: parchment in the middle of the screen,
// - a pointer: parchment beside the lit place, with "Dalej",
// - a lead: parchment beside the lit place, which has to be tapped,
// - a tap: the narrator alone, with a command in a bubble beside the place
//   to tap.
// Parchment unrolls before its words and rolls up after them, and a line
// with a recording is read aloud. The camera (camera.js) goes to each place
// and the light goes with it; around a lit place the rest of the screen
// waits under a shade. Cards and pointers are read once and the server keeps
// them (src/server/tutorial.js), so a reload or another device goes on from
// there; a lead or a tap is done when the game has moved on, but a lead
// marked `once`, whose tap changes no screen, is kept like a card. "Pomiń
// wprowadzenie" ends the whole introduction. Meanwhile the screen is the
// narrator's: it neither scrolls nor takes a tap, also between the lines.
// After the introduction come its chapters (a line's `chapter`), each at its
// moment of the game: the Umiejętności at class level 10, the Profesje at
// character level 10, never before the Umiejętności, and the Społeczność at
// character level 5, after both when they wait. A chapter's own "Pomiń"
// passes only that chapter, and a line can be told for each class
// (`classes`).

import { narratorSprite } from './art.js';
import { aim } from './camera.js';
import { $, fill, h, icon } from './dom.js';
import { motionOn } from './motion.js';
import { duckMusic } from './music.js';
import { rod, roll, stopRoll } from './parchment.js';
import { narratorVoiceOn, playNarration, playSound, preloadNarration, stopNarration } from './sound.js';
import { activityFinished, call, isUnlocked, state } from './state.js';
import { toast } from './ui.js';

const running = () => Boolean(state.character.activity) && !activityFinished(state.character.activity);
const finished = () => activityFinished(state.character.activity);
// Before the first exploration: nothing earned yet and nothing under way.
const firstTrip = (read) => !state.character.activity && state.character.level === 1 && state.character.xp === 0 && !read.has('report');
const freePoints = () => state.character.freePoints > 0 && isUnlocked('stats');
const campStarted = () => Boolean(state.character.camp.construction) || state.character.camp.buildings.some((building) => building.level > 0);
const onReport = (hash) => hash.startsWith('#/raport/');
const onBoard = (hash) => hash === '#/oboz';
const calm = () => !motionOn();
const kept = (line) => line.kind === 'card' || line.kind === 'point' || line.once === true;
const mark = (id) => `[data-guide="${id}"]`;

// The Umiejętności chapter: once the class reaches them, for a character
// that has not learned one yet, after the report that brought it there. It
// leads to the Umiejętności tab and goes through it.
const noSkill = () => state.character.skills?.pools.every((pool) => pool.chosen.length === 0) ?? false;
const onSkills = (hash) => hash === '#/postac/umiejetnosci';
const skillsWaiting = (read) => isUnlocked('skills') && noSkill() && !read.has('skills-ending');
const skillsDue = (hash, read) => skillsWaiting(read) && !onReport(hash);
const skillsTour = (hash, read) => skillsDue(hash, read) && read.has('skills-welcome');
const skillsHere = (hash, read) => onSkills(hash) && skillsTour(hash, read);

// The Profesje chapter: once the character reaches them, after the report
// that brought it there, and only when the Umiejętności chapter is not
// waiting (it always comes first). Not on the character's screens either,
// where the skills are chosen and the main bar with the Profesje tab is
// hidden. It leads to the Profesje tab and goes through it.
const onProfessions = (hash) => hash === '#/profesje';
const onCharacter = (hash) => hash.startsWith('#/postac');
const professionsDue = (hash, read) =>
  Boolean(state.character.professions) && !onReport(hash) && !onCharacter(hash) && !skillsWaiting(read) && !read.has('professions-ending');
const professionsTour = (hash, read) => professionsDue(hash, read) && read.has('professions-welcome');
const professionsHere = (hash, read) => onProfessions(hash) && professionsTour(hash, read);

// The Społeczność chapter: once the character reaches level 5, after the
// report that brought it there, and only when the Umiejętności and the
// Profesje chapters are not waiting. Not on the character's screens either.
// It leads to the Społeczność tab and points at the chat's rules. Its last
// line waits for the player to open an inner region by themselves and points
// there at Szybkie Polowanie, under "Wyrusz", with nothing to tap but "Dalej".
const onCommunity = (hash) => hash === '#/spolecznosc';
const professionsWaiting = (read) => Boolean(state.character.professions) && !read.has('professions-ending');
const communityDue = (hash, read) =>
  isUnlocked('community') && !onReport(hash) && !onCharacter(hash) && !skillsWaiting(read) && !professionsWaiting(read) && !read.has('community-ending');
const communityTour = (hash, read) => communityDue(hash, read) && read.has('community-welcome');
const communityHere = (hash, read) => onCommunity(hash) && communityTour(hash, read);
// An inner region the class has opened, while the character is at home: its
// screen has "Wyrusz" and Szybkie Polowanie (screens/combat.js).
function onOpenArea(hash) {
  const [, regionId, areaId] = hash.match(/^#\/walka\/([^/]+)\/([^/]+)$/) ?? [];
  const area = state.content.regions.find((region) => region.id === regionId)?.areas.find((candidate) => candidate.id === areaId);
  return Boolean(area && state.character.quickHunts) && !state.character.activity && state.character.classLevel >= area.unlockClassLevel;
}
const quickHuntHere = (hash, read) => onOpenArea(hash) && communityTour(hash, read) && read.has('community-rules');

function affordable(buildingId) {
  const building = state.character.camp.buildings.find((candidate) => candidate.id === buildingId);
  const have = { gold: state.character.gold, ...state.character.resources };
  return Boolean(building?.next) && Object.entries(building.next.cost).every(([id, amount]) => (have[id] ?? 0) >= amount);
}

// After the first building, or when there is nothing to build it with.
const campDone = (hash, read) => read.has('camp') && (campStarted() || !affordable('campfire'));

// When each line shows (`hash` is the screen's address, `read` the lines
// read) and, for all but a card, its place: a selector of the elements to
// light. A line shows when it is the first in the order that is due. `free`
// leaves the lit places to the player until the moment passes, `above` puts
// the narrator above the first of them, `whole` lights them all in one ring,
// which the camera takes in whole even if it has to draw back, `unfold`
// opens what folds there first, `delay` lets the screen be seen first, and
// `browse` has the fights' tabs take turns while the line is told.
// `sweep` has the camera ride, at the screen's own size, from place to
// place in their order, each as the line tells its name (the text of the
// element `sweep` names in it), and back to the first after the line; the
// light rides along on one place at a time, the narrator above it.
// `survey` has the camera take in the whole of a place for a moment before
// the light, with nothing lit: the camp's board before its plots. A `late`
// line is told also after the ending, once, to a character that finished
// the introduction before the line was written.
const BEATS = {
  ask: { when: (hash, read) => read.size === 0 },
  intro: { when: () => true },
  purpose: { when: () => true },
  test: { when: () => true },
  'tap-region': { place: mark('region-windfalls'), when: (hash, read) => hash === '#/walka' && firstTrip(read) },
  'tap-area': { place: mark('area-windfalls-edge'), when: (hash, read) => hash === '#/walka/windfalls' && firstTrip(read) },
  trial: { place: mark('duration'), when: (hash, read) => hash === '#/walka/windfalls/windfalls-edge' && firstTrip(read) },
  'tap-start': { place: mark('start'), when: (hash, read) => hash === '#/walka/windfalls/windfalls-edge' && firstTrip(read) },
  skip: { place: mark('skip-activity'), when: (hash) => hash.startsWith('#/walka') && running() },
  'tap-skip': { place: mark('skip-activity'), when: (hash, read) => hash.startsWith('#/walka') && running() && !read.has('report') },
  'tap-claim': { place: mark('claim'), when: (hash, read) => hash.startsWith('#/walka') && finished() && !read.has('report') },
  report: { when: onReport },
  'report-summary': { place: mark('report-summary'), when: onReport },
  'report-system': { place: mark('report-system'), when: onReport },
  'report-fights': { place: `${mark('report-fights')}, ${mark('report-fight')}`, whole: true, browse: true, when: onReport },
  'report-items': { place: mark('report-items'), when: onReport },
  'report-account': { place: mark('report-account'), whole: true, unfold: true, when: onReport },
  'lead-character': {
    place: '.nav-item[href="#/postac"]',
    when: (hash, read) => read.has('report') && !read.has('character') && !hash.startsWith('#/postac'),
  },
  character: { place: mark('slot-weapon'), when: (hash) => hash === '#/postac' },
  'lead-stats': {
    place: '.nav-item[href="#/postac/statystyki"]',
    when: (hash, read) => hash === '#/postac' && read.has('character') && !read.has('stats') && isUnlocked('stats'),
  },
  stats: { place: mark('auto-points'), when: (hash, read) => hash === '#/postac/statystyki' && read.has('character') },
  'free-points': {
    place: `${mark('auto-points')}, .stat-add, .pending-bar`,
    free: true,
    above: true,
    when: (hash, read) => hash === '#/postac/statystyki' && read.has('stats') && freePoints(),
  },
  'lead-camp': {
    place: '.camp-button',
    when: (hash, read) => read.has('character') && !read.has('camp') && !freePoints() && !hash.startsWith('#/oboz'),
  },
  camp: { place: mark('camp-stock'), when: onBoard },
  'camp-sawmill': { place: mark('plot-sawmill'), survey: '.camp-board', when: (hash) => onBoard(hash) && !campStarted() },
  'camp-quarry': { place: `${mark('plot-quarry')}, ${mark('plot-mine')}`, when: (hash) => onBoard(hash) && !campStarted() },
  'camp-lake': { place: mark('plot-midas-lake'), when: (hash) => onBoard(hash) && !campStarted() },
  'camp-anvil': { place: mark('plot-anvil'), when: (hash) => onBoard(hash) && !campStarted() },
  'camp-loot-shed': { place: `${mark('plot-loot-shed')}, ${mark('plot-scrap-bench')}`, when: (hash) => onBoard(hash) && !campStarted() },
  'camp-craft-table': { place: mark('plot-craft-table'), when: (hash) => onBoard(hash) && !campStarted() },
  'camp-level': { place: mark('camp-level'), when: (hash) => onBoard(hash) && !campStarted() },
  'lead-campfire': {
    place: mark('plot-campfire'),
    when: (hash, read) => onBoard(hash) && read.has('camp') && !campStarted() && affordable('campfire'),
  },
  'tap-build': {
    place: mark('build'),
    when: (hash, read) => hash === '#/oboz/campfire' && read.has('camp') && !campStarted() && affordable('campfire'),
  },
  'camp-countdown': { place: mark('build-countdown'), when: (hash) => hash.startsWith('#/oboz') && campStarted() },
  // The author: the gold and the Punkty Systemu, and under them the list
  // with the rest, Punkty Czasu among it, before the settings; a tap on the
  // gold unfolds the list, which stays in sight a moment before the next line.
  wallet: { place: '.topbar .gold', when: campDone },
  settings: { place: '.topbar .icon-button[aria-label="Ustawienia"]', delay: 2500, when: campDone },
  quests: { place: mark('quests'), late: true, when: campDone },
  ending: { when: campDone },
  // The Umiejętności chapter, after the introduction.
  'skills-welcome': { when: skillsDue },
  'skills-lead-character': { place: '.nav-item[href="#/postac"]', when: (hash, read) => skillsTour(hash, read) && !hash.startsWith('#/postac') },
  'skills-lead': { place: '.nav-item[href="#/postac/umiejetnosci"]', when: (hash, read) => skillsTour(hash, read) && hash.startsWith('#/postac') && !onSkills(hash) },
  'skills-intro': { place: mark('skills-intro'), when: skillsHere },
  'skills-paths': { place: mark('skills-path'), sweep: '.skill-path-name', when: skillsHere },
  'skills-card': { when: skillsHere },
  'skills-choice': { when: skillsHere },
  'skills-points': { place: mark('skills-points'), when: skillsHere },
  'skills-evolution': { when: skillsHere },
  'skills-ending': { when: skillsHere },
  // The Profesje chapter, after the Umiejętności.
  'professions-welcome': { when: professionsDue },
  'professions-lead': { place: '.nav-item[href="#/profesje"]', when: (hash, read) => professionsTour(hash, read) && !onProfessions(hash) },
  'professions-intro': { place: mark('professions-intro'), when: professionsHere },
  'professions-list': { place: mark('professions-list'), when: professionsHere },
  'professions-ending': { when: professionsHere },
  // The Społeczność chapter, after the Profesje.
  'community-welcome': { when: communityDue },
  'community-lead': {
    place: '.nav-item[href="#/spolecznosc"]',
    when: (hash, read) => communityTour(hash, read) && !onCommunity(hash) && !read.has('community-rules'),
  },
  'community-rules': { place: mark('community-rules'), when: communityHere },
  'community-ending': { place: mark('quick-hunt'), when: quickHuntHere },
};

let place = '#/walka';
let scroll = null; // the open card: { dialog, sheet, line, busy }
let light = null; // { line, root, note, frame, tapped, closing } while a place is lit
let waiting = null; // the timer looking for the place of the next line
let pause = null; // { id, at, timer } of a line waiting for its delay
let lastSpot = null; // { hash, line, at }: the last pointer, whose places the next light comes from
let surveying = null; // the line whose light waits while the camera takes in the whole of a place
const surveyed = new Set(); // the lines whose survey was seen on this page
let missed = null; // { id, hash }: a lead or a tap whose place this screen lacked

// While the introduction lasts the screen is the narrator's, also in the
// short pauses between the lines: it neither scrolls nor takes a tap, as if
// touch were off. Taps reach only the narrator, the places a lead or a tap
// asks for and a dialog the game opens meanwhile; a free light leaves its
// places and the scrolling to the player. A moment after the narrator has
// nothing more to show (a place this screen lacks, say) the player has the
// screen back, so the game never stops dead.
const HOLD = 2500;
const SURVEY = 1000;
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
const blocker = h('div', { class: 'narrator-hold', hidden: true, 'aria-hidden': 'true', onClick: () => light?.nudge() });
let held = false;
let letGo = null; // the timer that gives the screen back

const freeLight = () => Boolean(light && BEATS[light.line.id].free);
// What may take a tap while the screen is held: the narrator, a dialog and
// the lit places of a lead or a tap.
const reachable = (target) =>
  Boolean(target.closest?.('.guide, dialog[open]')) ||
  Boolean(light && light.line.kind !== 'point' && places(light.line).some((element) => element.contains(target)));

function hold() {
  clearTimeout(letGo);
  letGo = null;
  if (!held) {
    held = true;
    document.addEventListener('touchmove', still, { capture: true, passive: false });
    document.addEventListener('wheel', still, { capture: true, passive: false });
  }
  if (!blocker.isConnected) document.body.append(blocker);
  blocker.hidden = freeLight();
}

// The screen back to the player, at once or after a moment unless the
// narrator shows something meanwhile.
function release(after = HOLD) {
  clearTimeout(letGo);
  letGo = null;
  if (!held) return;
  if (after > 0) {
    letGo = setTimeout(() => release(0), after);
    return;
  }
  held = false;
  blocker.hidden = true;
  blocker.style.clipPath = '';
  document.removeEventListener('touchmove', still, { capture: true });
  document.removeEventListener('wheel', still, { capture: true });
}

// The page keeps still. A dialog of the game scrolls on its own, and so does
// a parchment too long for its words (styles.css keeps the page out of it).
function still(event) {
  if (freeLight() || event.target.closest?.('dialog[open]:not(.narrator)')) return;
  const page = event.target.closest?.('.narrator-page, .guide-page');
  if (page && page.scrollHeight > page.clientHeight) return;
  if (event.cancelable) event.preventDefault();
}

// A tap from the keyboard, or one that slips past the layer, reaches only
// what is open; the narrator's own clicks (a lead's "Dalej") always do.
document.addEventListener(
  'click',
  (event) => {
    if (!held || !event.isTrusted || freeLight() || event.target === blocker || reachable(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  },
  true,
);
document.addEventListener(
  'keydown',
  (event) => {
    if (!held || freeLight() || reachable(event.target) || (event.key !== 'Tab' && event.key !== 'Enter' && !SCROLL_KEYS.has(event.key))) return;
    event.preventDefault();
  },
  true,
);
document.addEventListener(
  'contextmenu',
  (event) => {
    if (held && !freeLight()) event.preventDefault();
  },
  true,
);

// Called after every screen is drawn and every change of the character.
export function narrate(hash = place) {
  place = hash;
  const read = state.character?.tutorial;
  if (!read || !state.content?.tutorial) {
    // Without a character, as after "Zacznij od nowa", its lines go too.
    if (!state.character) passedHere.clear();
    closeCard();
    stopLight();
    aim([]);
    release(0);
    return;
  }
  // An open card goes on by itself, and so does a pointer rolling up after
  // "Dalej" and a survey: a change of the character meanwhile (its read line
  // saved, say) must not start the next line under it.
  if (scroll || light?.closing || surveying) return;
  const line = nextLine();
  if (pause && pause.id !== line?.id) {
    clearTimeout(pause.timer);
    pause = null;
  }
  if (!line) {
    stopLight();
    aim([]);
    release(readNow().has('ending') ? 0 : HOLD);
    return;
  }
  // A line with a delay waits on its screen for a moment first.
  const delay = BEATS[line.id].delay ?? 0;
  if (delay > 0) {
    if (!pause) {
      stopLight();
      aim([]);
      hold();
      pause = { id: line.id, at: Date.now() + delay, timer: setTimeout(() => narrate(), delay) };
      return;
    }
    if (Date.now() < pause.at) return;
  }
  if (line.kind === 'card') {
    stopLight();
    aim([]);
    openCard(line);
  } else lightUp(line);
}

// The lines passed on this page. Each "Dalej" is saved on its own, and its
// answer can come late, after the next "Dalej": the list in it then lacks
// the line just passed, which must not show again (its parchment would
// unroll a second time). They go with the character.
const passedHere = new Set();
const readNow = () => new Set([...state.character.tutorial, ...passedHere]);

// The introduction is over, the Społeczność chapter is not halfway (it
// waits for an inner region at its end), and nothing of the narrator's is on
// the screen or due here, so another parchment may open (email.js).
export function narratorIdle() {
  if (!state.character?.tutorial || !state.content?.tutorial) return false;
  const read = readNow();
  const halfway = read.has('community-welcome') && !read.has('community-ending');
  return !scroll && !light && !pause && !surveying && read.has('ending') && !halfway && !nextLine();
}

// The first line in the order that is due: a lead or a tap whenever its
// moment holds, a card or a pointer only until it is read. After the ending
// only a late line is left, and the chapters' lines come.
function nextLine() {
  const read = readNow();
  const over = read.has('ending');
  return state.content.tutorial.lines.find(
    (line) => (!kept(line) || !read.has(line.id)) && (line.chapter ? over : !over || BEATS[line.id]?.late) && BEATS[line.id]?.when(place, read),
  );
}

// A line is read as soon as it is passed: the page counts it at once, and
// the server keeps it.
function markRead(id) {
  passedHere.add(id);
  if (!state.character.tutorial.includes(id)) state.character.tutorial = [...state.character.tutorial, id];
  call('POST', '/api/tutorial', { card: id }).catch(() => {});
}

// The chapters' lines stay as they were, for their own moments.
function skipAll() {
  closeCard();
  stopLight();
  aim([]);
  release(0);
  const read = new Set(state.character.tutorial);
  state.character.tutorial = state.content.tutorial.lines.filter((line) => kept(line) && (!line.chapter || read.has(line.id))).map((line) => line.id);
  for (const id of state.character.tutorial) passedHere.add(id);
  // The server plays the first steps meanwhile (an exploration, its report
  // and the Ognisko), and the screen draws the character it sends back.
  call('POST', '/api/tutorial', { skip: true })
    .then(() => toast(state.content.tutorial.skippedText))
    .catch((error) => toast(error.message));
}

// A chapter's "Pomiń": its lines are read, and nothing else happens.
function skipChapter(chapter) {
  closeCard();
  stopLight();
  aim([]);
  release(0);
  const ids = state.content.tutorial.lines.filter((line) => line.chapter === chapter && kept(line)).map((line) => line.id);
  state.character.tutorial = [...new Set([...state.character.tutorial, ...ids])];
  for (const id of ids) passedHere.add(id);
  call('POST', '/api/tutorial', { skip: true, chapter })
    .then(() => toast(state.content.tutorial.chapters[chapter].skippedText))
    .catch((error) => toast(error.message));
}

// What "Pomiń" passes on a line: the introduction until its ending, or the
// line's chapter, but not on the last line of either; a late line after the
// ending has nothing left to pass.
function skipping(line) {
  const tutorial = state.content.tutorial;
  if (line.chapter) {
    const last = tutorial.lines.filter((other) => other.chapter === line.chapter).at(-1);
    return line === last ? null : { label: tutorial.chapters[line.chapter].skipLabel, pass: () => skipChapter(line.chapter) };
  }
  return line.id === 'ending' || readNow().has('ending') ? null : { label: tutorial.skipLabel, pass: skipAll };
}

// A line as told to this character: its class's text for a line told per
// class, and for a female look its female version, with that version's own
// recording (none until it is recorded).
function told(line) {
  const own = line.classes?.[state.character?.classId] ?? line;
  const female = own.female && state.character?.appearance === 'female';
  return { ...line, text: female ? own.female.text : own.text, voice: female ? own.female.voice : own.voice };
}
const words = (line) => told(line).text.map((text) => text.replaceAll('{points}', String(state.content.tutorial.startTimePoints)));

// The line's recording, over quieter music. The next line's recording is
// fetched meanwhile, so it starts on time. `onStart` learns how long it is.
function speak(line, onStart) {
  if (!narratorVoiceOn()) return;
  const lines = state.content.tutorial.lines;
  const following = lines
    .slice(lines.indexOf(line) + 1)
    .map(told)
    .find((candidate) => candidate.voice);
  if (following) preloadNarration(following.voice);
  const { voice } = told(line);
  if (!voice) return;
  duckMusic(true);
  playNarration(voice, { onStart, onEnd: () => duckMusic(false) });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The card: the figure above a scroll in the middle of the screen. A card
// from the author of the game (speaker "author") has no figure.
function openCard(line) {
  const dialog = h('dialog', { class: 'narrator', 'aria-labelledby': 'narrator-label' });
  // Escape passes the card, like "Dalej".
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    next();
  });
  const sheet = h('div', { class: 'narrator-sheet' });
  const show = h('button', { type: 'button', class: 'button narrator-show', onClick: showCard }, icon('eye', { size: 18 }), state.content.tutorial.showLabel);
  const art = h('div', { class: 'narrator-art' }, narratorSprite());
  dialog.append(art, h('div', { class: 'narrator-scroll' }, rod(), sheet, rod()), show);
  document.body.append(dialog);
  hold();
  scroll = { dialog, sheet, art, line, busy: true, hidden: false };
  const { voice } = told(line);
  if (voice && narratorVoiceOn()) preloadNarration(voice);
  write(line);
  dialog.showModal();
  playSound('open');
  unrollCard();
}

function write(line) {
  const tutorial = state.content.tutorial;
  const author = line.speaker === 'author';
  const skip = skipping(line);
  scroll.art.hidden = author;
  fill(
    scroll.sheet,
    h(
      'div',
      { class: 'narrator-page' },
      h(
        'div',
        { class: 'narrator-head' },
        h('p', { class: 'narrator-label', id: 'narrator-label', text: author ? tutorial.authorLabel : 'Narrator' }),
        h('button', { type: 'button', class: 'narrator-hide', onClick: hideCard }, icon('eye-off', { size: 16 }), tutorial.hideLabel),
      ),
      h('div', { class: 'narrator-text' }, words(line).map((text) => h('p', { text }))),
      line.id === 'ask'
        ? choice(tutorial)
        : h(
            'div',
            { class: 'narrator-actions' },
            skip && h('button', { type: 'button', class: 'narrator-skip', text: skip.label, onClick: skip.pass }),
            h('button', { type: 'button', class: 'button narrator-next', text: tutorial.nextLabel, onClick: next }),
          ),
    ),
  );
}

// The first card asks whether to go through the introduction at all:
// "Wprowadź mnie", the recommended way, goes on like "Dalej".
function choice(tutorial) {
  return h(
    'div',
    { class: 'narrator-choice' },
    h('button', { type: 'button', class: 'button narrator-next', text: tutorial.startLabel, onClick: next }),
    h('span', { class: 'narrator-recommended', text: tutorial.recommendedLabel }),
    h('button', { type: 'button', class: 'button narrator-pass', text: tutorial.skipLabel, onClick: skipAll }),
  );
}

// The card unrolls and then is read. "Dalej" works at once, also while the
// parchment unrolls.
async function unrollCard() {
  const current = scroll;
  const line = current.line;
  current.busy = false;
  await roll(current.sheet, true);
  if (scroll !== current || current.line !== line || current.busy) return;
  $('.narrator-next', current.sheet)?.focus();
  speak(line);
}

// "Ukryj": the scroll rolls up and the screen behind it shows, while the
// narrator reads on; "Pokaż pergamin" unrolls it again.
async function hideCard() {
  if (!scroll || scroll.busy || scroll.hidden) return;
  const current = scroll;
  current.hidden = true;
  await roll(current.sheet, false);
  if (scroll !== current || !current.hidden) return;
  current.dialog.classList.add('narrator--hidden');
  $('.narrator-show', current.dialog)?.focus();
}

async function showCard() {
  if (!scroll || !scroll.hidden) return;
  const current = scroll;
  current.hidden = false;
  current.dialog.classList.remove('narrator--hidden');
  await roll(current.sheet, true);
  if (scroll === current && !current.hidden) $('.narrator-next', current.sheet)?.focus();
}

// "Dalej": the scroll rolls up, and unrolls again for the next card, or the
// game goes on.
async function next() {
  if (!scroll || scroll.busy) return;
  const current = scroll;
  current.busy = true;
  current.hidden = false;
  current.dialog.classList.remove('narrator--hidden');
  stopNarration();
  markRead(current.line.id);
  await roll(current.sheet, false);
  if (scroll !== current) return;
  const after = current.line.id === 'ending' ? null : nextLine();
  if (after?.kind === 'card' && !BEATS[after.id].delay) {
    current.line = after;
    write(after);
    unrollCard();
    return;
  }
  closeCard();
  narrate();
}

function closeCard() {
  if (!scroll) return;
  stopNarration();
  stopRoll(scroll.sheet);
  if (scroll.dialog.open) scroll.dialog.close();
  scroll.dialog.remove();
  scroll = null;
}

// The places of a line drawn on the screen now.
function places(line) {
  return [...document.querySelectorAll(BEATS[line.id].place)].filter((element) => !element.hidden && element.getClientRects().length > 0);
}

// A place the player can see and tap: on the screen and not under a bar that
// stays in place, such as the navigation at the bottom.
function inView(element) {
  const rect = element.getBoundingClientRect();
  const x = (rect.left + rect.right) / 2;
  const y = (rect.top + rect.bottom) / 2;
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
  const top = document.elementsFromPoint(x, y).find((hit) => !hit.closest('.guide') && hit !== blocker);
  return !top || element.contains(top) || top.contains(element);
}

// The light travels between two places as the camera does: gently at both
// ends.
const ease = (done) => (1 - Math.cos(Math.PI * done)) / 2;

// One box around a few, or between two at `done` (0 to 1) of the way.
const union = (boxes) =>
  boxes.reduce((all, box) => ({
    top: Math.min(all.top, box.top),
    bottom: Math.max(all.bottom, box.bottom),
    left: Math.min(all.left, box.left),
    right: Math.max(all.right, box.right),
  }));
const between = (from, to, done) =>
  Object.fromEntries(['top', 'bottom', 'left', 'right'].map((side) => [side, from[side] + (to[side] - from[side]) * done]));

// What a place covers on the screen, with whatever hangs out of it, such as
// a camp plot's name tag, unless the place clips it.
function boxOf(element) {
  const rect = element.getBoundingClientRect();
  const box = { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
  if (getComputedStyle(element).overflow !== 'visible') return box;
  for (const child of element.children) {
    const part = child.getBoundingClientRect();
    if (part.width === 0 || part.height === 0) continue;
    box.top = Math.min(box.top, part.top);
    box.bottom = Math.max(box.bottom, part.bottom);
    box.left = Math.min(box.left, part.left);
    box.right = Math.max(box.right, part.right);
  }
  return box;
}

// The light: a shade with a hole for each place, which takes every other
// tap, a ring around each place and the narrator beside them. A tap on the
// shade nudges the rings.
function lightUp(line) {
  if (light?.line === line) return;
  stopLight();
  // A place this screen lacked is looked for again without holding it.
  if (missed?.id !== line.id || missed.hash !== place) hold();
  let tries = 0;
  const look = () => {
    waiting = null;
    if (places(line).length > 0) {
      missed = null;
      if (BEATS[line.id].survey && !surveyed.has(line.id)) survey(line);
      else startLight(line);
      return;
    }
    // The screen may still be drawing.
    if (++tries < 20) {
      waiting = setTimeout(look, 100);
      return;
    }
    // A pointer at a place this screen does not have is passed over; for a
    // lead or a tap the player has the screen back.
    if (line.kind === 'point') {
      markRead(line.id);
      narrate();
      return;
    }
    missed = { id: line.id, hash: place };
    release(0);
  };
  look();
}

// The camera takes in the whole of a place for a moment, with nothing lit,
// and then the line's light follows.
async function survey(line) {
  const whole = [...document.querySelectorAll(BEATS[line.id].survey)].filter((element) => element.getClientRects().length > 0);
  surveying = line;
  surveyed.add(line.id);
  lastSpot = null;
  hold();
  await aim(whole, { travel: true, whole: true }).done;
  await wait(SURVEY);
  if (surveying !== line) return;
  surveying = null;
  narrate();
}

function startLight(line) {
  const beat = BEATS[line.id];
  const shade = h('div', { class: 'guide-shade', onClick: nudge });
  const rings = h('div', { class: 'guide-rings', 'aria-hidden': 'true' });
  const note = line.kind === 'tap' ? bubbleNote(line) : scrollNote(line);
  const passing = skipping(line);
  const skip = passing && h('button', { type: 'button', class: 'guide-skip', text: passing.label, onClick: passing.pass });
  const root = h('div', { class: 'guide' }, shade, rings, note.element, skip);
  document.body.append(root);
  light = { line, root, note, frame: 0, closing: false, nudge, sweep: beat.sweep ? { at: 0, move: null } : null };
  hold();
  const corners = skip && skipCorners(skip);
  // The camera goes to the place, framing it with room for the narrator
  // (beside it on a bar, the camera goes home). On the same screen as the
  // pointer before, it travels from there and the light travels with it.
  // Then the narrator steps in and the parchment unrolls, slowly.
  const before = lastSpot?.hash === place && performance.now() - lastSpot.at < 3000 && !calm() ? lastSpot.line : null;
  lastSpot = null;
  if (beat.unfold) for (const element of places(line)) element.dispatchEvent(new Event('unfold'));
  // A sweep starts on the first place.
  const shot = aim(beat.sweep ? places(line).slice(0, 1) : places(line), { zoom: !beat.free && !beat.sweep, travel: Boolean(before), keep: beat.above ? 0 : note.height() + 20, above: Boolean(beat.sweep), whole: beat.whole });
  light.slide = before && { from: before, start: shot.start, duration: Math.max(shot.duration, 700) };
  note.element.classList.add('guide-note--waiting');
  Promise.all([shot.done, wait(light.slide?.duration ?? 0)]).then(async () => {
    if (light?.line !== line) return;
    note.element.classList.remove('guide-note--waiting');
    if (!calm()) {
      note.element.classList.add('guide-note--arriving');
      await wait(300);
      if (light?.line !== line) return;
    }
    note.open();
  });

  // A tap on a place goes through to the game. After a lead or a tap the
  // next line follows the screen or the character it changes; a free light
  // stays until its moment passes.
  const tapped = (event) => {
    if (line.kind === 'point' || beat.free || !light || light.line !== line) return;
    if (places(line).filter(inView).some((element) => element.contains(event.target))) {
      if (kept(line)) markRead(line.id);
      stopLight();
      setTimeout(() => narrate(), 700);
    }
  };
  document.addEventListener('click', tapped, true);
  light.tapped = tapped;
  // With the places left to the player the screen still scrolls under the
  // shade, which only dims it; taps outside the places are held back here.
  if (beat.free) {
    shade.classList.add('guide-shade--see-through');
    const holdBack = (event) => {
      if (event.target.closest('.guide') || places(line).some((element) => element.contains(event.target))) return;
      event.preventDefault();
      event.stopPropagation();
      nudge();
    };
    document.addEventListener('click', holdBack, true);
    light.holdBack = holdBack;
  }

  const follow = () => {
    if (!light || light.line !== line) return;
    const found = places(line);
    if (found.length === 0) {
      // Drawn anew without the place: the next line decides.
      stopLight();
      narrate();
      return;
    }
    const pad = 6;
    const width = window.innerWidth;
    const height = window.innerHeight;
    // While the places are out of sight (the screen still scrolling to
    // them), the shade has no holes and the narrator waits by the first.
    const fit = (box) => ({
      top: Math.max(0, box.top),
      bottom: Math.min(height, box.bottom),
      left: Math.max(0, box.left),
      right: Math.min(width, box.right),
    });
    const padded = (element) => {
      const rect = boxOf(element);
      return { top: rect.top - pad, bottom: rect.bottom + pad, left: rect.left - pad, right: rect.right + pad };
    };
    // While the light travels from the last pointer's places, it goes from
    // where the camera shows them to where it shows these; otherwise it
    // stands only on places in sight.
    const slide = light.slide;
    const done = slide ? Math.min(1, (performance.now() - slide.start) / slide.duration) : 1;
    if (slide && done >= 1) light.slide = null;
    const seen = found.filter(inView);
    const left = slide && done < 1 ? places(slide.from).map(padded) : [];
    const gliding = left.length > 0;
    // A whole light is one ring around all its places. A sweeping one stands
    // on one place at a time and rides on with the camera (see `sweep`).
    const sweep = light.sweep;
    if (sweep?.shares) {
      const next = Math.min(found.length - 1, sweepTarget(sweep, performance.now()));
      if (next !== sweep.at) {
        const shot = aim([found[next]], { zoom: false, keep: note.height() + 20, above: true, slow: SWEEP.ride });
        sweep.move = { from: sweep.at, start: shot.start, duration: shot.duration };
        sweep.at = next;
      }
    }
    const swept = () => {
      const here = padded(found[Math.min(sweep.at, found.length - 1)]);
      const { move } = sweep;
      const along = move && move.duration > 0 ? Math.min(1, (performance.now() - move.start) / move.duration) : 1;
      return along < 1 ? between(padded(found[Math.min(move.from, found.length - 1)]), here, ease(along)) : here;
    };
    const ringed = (elements) => (beat.whole ? [union(elements.map(padded))] : sweep ? [swept()] : elements.map(padded));
    const boxes = gliding
      ? ringed(found).map((box) => fit(between(union(left), box, ease(done))))
      : ringed(seen.length > 0 ? seen : found.slice(0, 1)).map(fit);
    const lit = gliding ? boxes.length : seen.length > 0 ? boxes.length : 0;
    const holes = boxes.slice(0, lit).map((box) => `M${box.left} ${box.top}H${box.right}V${box.bottom}H${box.left}Z`).join('');
    shade.style.clipPath = `path(evenodd, 'M0 0H${width}V${height}H0Z${holes}')`;
    // The held screen lets taps through only to the places of a lead or a tap.
    blocker.style.clipPath = line.kind === 'point' || beat.free ? '' : shade.style.clipPath;
    light.drawn = boxes.slice(0, lit);
    while (rings.children.length < lit) rings.append(h('div', { class: 'guide-ring' }));
    while (rings.children.length > lit) rings.lastChild.remove();
    boxes.slice(0, lit).forEach((box, index) => {
      Object.assign(rings.children[index].style, {
        top: `${box.top}px`,
        left: `${box.left}px`,
        width: `${box.right - box.left}px`,
        height: `${box.bottom - box.top}px`,
      });
    });
    // The narrator stands below the places, or above them when there is more
    // room there or the beat wants it there; it never leaves the screen.
    const above = beat.above || Boolean(sweep);
    const anchor = above
      ? boxes[0]
      : boxes.reduce((all, box) => ({
          top: Math.min(all.top, box.top),
          bottom: Math.max(all.bottom, box.bottom),
          left: Math.min(all.left, box.left),
          right: Math.max(all.right, box.right),
        }));
    const tall = note.height();
    const gap = 14;
    const roomBelow = height - anchor.bottom - gap;
    const underneath = !above && (roomBelow >= tall || roomBelow >= anchor.top - gap);
    const element = note.element;
    element.classList.toggle('guide-note--below', underneath);
    element.classList.toggle('guide-note--above', !underneath);
    const limit = height - tall - 8;
    if (underneath) Object.assign(element.style, { top: `${Math.max(8, Math.min(anchor.bottom + gap, limit))}px`, bottom: '' });
    else Object.assign(element.style, { top: '', bottom: `${Math.max(8, Math.min(height - anchor.top + gap, limit))}px` });
    // A bubble's tail points at the middle of the places.
    if (note.tail) {
      const box = note.tail.getBoundingClientRect();
      const middle = (anchor.left + anchor.right) / 2 - box.left;
      note.tail.style.setProperty('--tail-x', `${Math.min(box.width - 18, Math.max(18, middle))}px`);
    }
    if (corners) keepClear(skip, corners, [...boxes.slice(0, lit), element.getBoundingClientRect()]);
    light.frame = requestAnimationFrame(follow);
  };
  follow();

  function nudge() {
    for (const ring of rings.children) {
      ring.classList.remove('guide-ring--nudge');
      // Restarts the animation.
      void ring.offsetWidth;
      ring.classList.add('guide-ring--nudge');
    }
  }
}

// A command: the narrator alone with a bubble.
function bubbleNote(line) {
  const bubble = h('div', { class: 'guide-bubble', role: 'status' }, words(line).map((text) => h('p', { text })));
  const element = h('div', { class: 'guide-note' }, narratorSprite(), bubble);
  return { element, tail: bubble, height: () => element.offsetHeight, open: () => speak(line) };
}

// A pointer or a lead: the narrator with a small scroll that unrolls.
// "Dalej" passes a pointer; on a lead it does what a tap on the place does.
function scrollNote(line) {
  const tutorial = state.content.tutorial;
  const pointer = line.kind === 'point';
  const go = () => (places(line).find(inView) ?? places(line)[0])?.click();
  const sheet = h(
    'div',
    { class: 'guide-sheet' },
    h(
      'div',
      { class: 'guide-page', role: 'status' },
      words(line).map((text) => h('p', { text })),
      h(
        'div',
        { class: 'guide-actions' },
        h('button', { type: 'button', class: 'narrator-hide', onClick: hide }, icon('eye-off', { size: 16 }), tutorial.hideLabel),
        h('button', { type: 'button', class: 'button guide-next', text: tutorial.nextLabel, onClick: pointer ? onward : go }),
      ),
    ),
  );
  const element = h('div', { class: 'guide-note guide-note--scroll' }, narratorSprite(), h('div', { class: 'guide-scroll' }, rod(), sheet, rod()));
  // Rolled up until it unrolls: the narrator steps in with the rods
  // together, so the parchment does not show open and then unroll again.
  if (!calm()) sheet.style.height = '0px';
  const show = h('button', { type: 'button', class: 'button narrator-show guide-show', onClick: unhide }, icon('eye', { size: 18 }), tutorial.showLabel);
  // "Ukryj": the parchment rolls up and the lit places stay; the narrator
  // reads on. "Pokaż pergamin" brings it back.
  let hidden = false;
  async function hide() {
    if (hidden || !light || light.line !== line || light.closing) return;
    hidden = true;
    await roll(sheet, false);
    if (!hidden || light?.line !== line) return;
    element.classList.add('guide-note--hidden');
    light.root.append(show);
    show.focus({ preventScroll: true });
  }
  async function unhide() {
    if (!hidden) return;
    hidden = false;
    show.remove();
    element.classList.remove('guide-note--hidden');
    await roll(sheet, true);
    if (!hidden && light?.line === line) $('.guide-next', sheet)?.focus({ preventScroll: true });
  }
  // The rods and the whole parchment, whether rolled or not, so the
  // narrator does not jump while it unrolls.
  const height = () => Math.max(element.offsetHeight, sheet.scrollHeight + 24);
  const open = async () => {
    const unrolling = roll(sheet, true, 1000);
    sheet.style.height = '';
    await unrolling;
    if (light?.line !== line || light.closing) return;
    $('.guide-next', sheet)?.focus({ preventScroll: true });
    const sweep = light.sweep && startSweep(line);
    speak(line, sweep && ((seconds) => Object.assign(sweep, { start: performance.now(), duration: seconds * 1000 })));
    if (BEATS[line.id].browse) browseFights(line);
  };
  // "Dalej": the parchment rolls up and the narrator steps away, then the
  // next line.
  async function onward() {
    if (!light || light.line !== line || light.closing) return;
    light.closing = true;
    stopNarration();
    markRead(line.id);
    await roll(sheet, false);
    if (!calm()) {
      element.classList.add('guide-note--leaving');
      await wait(250);
    }
    // The next pointer's camera and light travel from here.
    if (light?.drawn?.length) lastSpot = { hash: place, line, at: performance.now() };
    stopLight();
    narrate();
  }
  return { element, tail: null, height, open };
}

// While the narrator tells of the fights' tabs, they take turns as if
// tapped: the other fights one by one while it says they can be chosen,
// then the starred one, which the report opens on, as it speaks of the star.
// The times are those of the line's recordings (report-fights.mp3), from the
// start of the voice; without the voice the text shows as long. A line
// passed sooner stops the turns.
const BROWSE = { from: 4600, until: 7400, back: 8200, most: 3 };

function browseFights(line) {
  const tabs = () => [...document.querySelectorAll(`${mark('report-fights')} [role="tab"]`)];
  const all = tabs();
  const key = Math.max(0, all.findIndex((tab) => tab.querySelector('.fight-tab-key')));
  const others = all.map((_, index) => index).filter((index) => index !== key).slice(0, BROWSE.most);
  if (others.length === 0) return;
  const step = (BROWSE.until - BROWSE.from) / others.length;
  // The tabs are drawn anew after each choice, so each turn finds its own.
  const turn = (index) => {
    if (light?.line === line && !light.closing) tabs()[index]?.click();
  };
  others.forEach((index, order) => setTimeout(() => turn(index), BROWSE.from + step * order));
  setTimeout(() => turn(key), BROWSE.back);
}

// A sweep (`sweep`) goes at the line's pace: that of its recording once it
// plays, or as long as the words take to read without it. Each place has
// its share of the line, where its name is told (without the name, its turn
// in the order), and the camera sets off one slow ride before it.
const SWEEP = { ride: 2000, letters: 11 };

function startSweep(line) {
  const text = words(line).join(' ');
  let last = 0;
  const shares = places(line).map((element, index, all) => {
    const name = element.querySelector(BEATS[line.id].sweep)?.textContent;
    const at = name ? text.indexOf(name) : -1;
    last = Math.max(last, at >= 0 ? at / text.length : index / all.length);
    return last;
  });
  return Object.assign(light.sweep, { shares, start: performance.now(), duration: (text.length / SWEEP.letters) * 1000 });
}

// The place the camera is at or on its way to: each from a ride before its
// name is told (with the animations off, as it is told), and the first again
// after the line.
function sweepTarget(sweep, now) {
  const time = now - sweep.start;
  if (time >= sweep.duration) return 0;
  const lead = calm() ? 0 : SWEEP.ride;
  let at = 0;
  sweep.shares.forEach((share, index) => {
    if (index > 0 && time >= share * sweep.duration - lead) at = index;
  });
  return at;
}

function stopLight() {
  clearTimeout(waiting);
  waiting = null;
  if (!light) return;
  stopNarration();
  cancelAnimationFrame(light.frame);
  document.removeEventListener('click', light.tapped, true);
  if (light.holdBack) document.removeEventListener('click', light.holdBack, true);
  light.root.remove();
  light = null;
  blocker.style.clipPath = '';
  blocker.hidden = !held;
}

// "Pomiń wprowadzenie" keeps to a corner clear of the lit places and the
// narrator: the top left one, or else the bottom left, the top right or the
// bottom right. The corners are measured once for each light.
const CORNERS = ['', 'guide-skip--bottom', 'guide-skip--right', 'guide-skip--bottom guide-skip--right'];

function skipCorners(skip) {
  const corners = CORNERS.map((name) => {
    skip.className = `guide-skip ${name}`.trim();
    return { name: skip.className, box: skip.getBoundingClientRect() };
  });
  skip.className = corners[0].name;
  return corners;
}

const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

function keepClear(skip, corners, taken) {
  const corner = corners.find(({ box }) => !taken.some((other) => overlap(box, other))) ?? corners[0];
  if (skip.className !== corner.name) skip.className = corner.name;
}

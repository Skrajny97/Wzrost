// Looping scenes while the character works in a profession or explores
// (data/animations.json): the figure at work in the place of its profession,
// or walking in place on a path while the land of the exploration's region
// drifts behind it. With the game's animations off (motion.js) they stand
// still. They take the light of the hour in Poland, and now and then show a
// rare moment: a bird crossing the sky, steam from the cauldron, sparks from
// the hammer, or the shadow of a creature of the place passing far away. On
// the way the character's aura lights it, its trail glows behind it and its
// pet goes with it (the Sklep Systemu).

import { herbSprite, itemSprite, monsterSprite, placeArt, potionSprite, riderFile, walkerSheet } from './art.js';
import { cosmeticOf } from './cosmetics.js';
import { h } from './dom.js';
import { motionOn } from './motion.js';
import { state } from './state.js';

// Sheets and lands are drawn at twice their size (a sheet with its own
// scale at that), the path at three times.
// A land's strip is two land pictures side by side (the second mirrored, so
// it repeats without a seam), and the path one tile that repeats.
const SCALE = 2;
const LAND = { width: 384, height: 96 };
const PATH = { width: 64, height: 16, scale: 3 };
// The bird is two frames of 11 × 5, drawn at three times.
const BIRD = { width: 11, height: 5, scale: 3 };
// How long a footprint of a trail glows, in seconds, drifting away with the path.
const STEP_LIFE = 2.6;
// The shelf under a work holds this many things done.
const SHELF = 6;

const hourFormat = new Intl.DateTimeFormat('pl-PL', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Warsaw' });
const config = () => state.content.animations;
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// dawn, day, dusk or night at this hour in Poland, for the scenes and the
// camp board.
export function dayPart() {
  const hour = Number(hourFormat.format(new Date()));
  let part = 'day';
  for (const { id, from } of config().dayParts) if (hour >= from) part = id;
  return part;
}

// A sheet's frames, played in a loop.
function frames(sheet, className) {
  const element = h('div', { class: `scene-frames ${className}` });
  const size = sheet.size * (sheet.scale ?? SCALE);
  element.style.setProperty('--sheet', `url("/${sheet.file}")`);
  element.style.setProperty('--frame', `${size}px`);
  element.style.setProperty('--sheet-width', `${size * sheet.frames}px`);
  element.style.setProperty('--frames', String(sheet.frames));
  element.style.setProperty('--duration', `${sheet.frames / sheet.fps}s`);
  return element;
}

// The scene of a work under way: the figure at work (over the picture of
// its place, when the place has one) and a shelf of the things done so far;
// with `avatar`, the Awatar Systemu's, in the System's light. Null for a
// profession without a scene.
export function workScene(professionId, activity, { avatar = false } = {}) {
  const sheet = config()?.work[professionId];
  if (!sheet) return null;
  const stage = h('div', { class: `scene-stage scene--${dayPart()}${avatar ? ' scene--avatar' : ''}` }, frames(sheet, 'scene-figure'));
  const art = sheet.place && placeArt(sheet.place);
  if (art) {
    stage.classList.add('scene-stage--place');
    stage.style.setProperty('--place-art', `url("${art}")`);
  }
  const shelf = workShelf(activity);
  if (sheet.moment) nowAndThen(stage, () => (sheet.moment.kind === 'bird' ? bird(stage) : burst(stage, sheet.moment)));
  return { element: h('div', { class: 'scene', 'aria-hidden': 'true' }, stage, shelf.element), update: shelf.update };
}

// The Walka scene of an exploration under way: the character in its own look
// and skin tone (or its evolution's), or the System's figure for a look not
// drawn walking yet, in the light of its aura, with its trail behind and its
// pet beside it.
export function walkScene(activity) {
  const walk = config()?.walk;
  if (!walk) return null;
  const { classId, appearance, skin, evolution } = state.character ?? {};
  const own = walkerSheet(classId, appearance, skin, evolution?.current?.id);
  const figure = ride(walk, state.character) ?? (own ? frames({ ...walk.walker, file: own }, 'scene-walker scene-walker--own') : frames(walk.figure, 'scene-walker'));
  const stage = h('div', { class: `scene-walk scene--${dayPart()}` }, h('div', { class: 'scene-path' }), figure);
  const worn = state.character?.cosmetics;
  const aura = cosmeticOf(worn?.aura)?.aura;
  if (aura) lightWalker(stage, figure, aura);
  const trail = cosmeticOf(worn?.trail)?.trail;
  if (trail) footprints(stage, trail, walk, figure.classList.contains('scene-ride'));
  const pet = cosmeticOf(worn?.pet)?.pet;
  if (pet) companion(figure, pet, figureBox(walk, figure, own));
  const land = walk.lands[activity.regionId];
  if (land) stage.style.setProperty('--land', `url("/${land}")`);
  stage.style.setProperty('--land-width', `${LAND.width * SCALE}px`);
  stage.style.setProperty('--land-height', `${LAND.height * SCALE}px`);
  stage.style.setProperty('--land-duration', `${(LAND.width * SCALE) / walk.landSpeed}s`);
  stage.style.setProperty('--path', `url("/${walk.path}")`);
  stage.style.setProperty('--path-width', `${PATH.width * PATH.scale}px`);
  stage.style.setProperty('--path-height', `${PATH.height * PATH.scale}px`);
  stage.style.setProperty('--path-duration', `${(PATH.width * PATH.scale) / walk.pathSpeed}s`);
  nowAndThen(stage, () => (pick(walk.moments) === 'shadow' ? shadow(stage, activity) : bird(stage)));
  return { element: h('div', { class: 'scene', 'aria-hidden': 'true' }, stage), update: () => {} };
}

// The aura on the way: its light around the walking figure (or the rider and
// the mount), and its motes about it, or sparks rising, as on the portrait.
function lightWalker(stage, figure, { glow, spark, sparks }) {
  stage.style.setProperty('--aura-glow', glow);
  stage.style.setProperty('--aura-spark', spark);
  figure.classList.add('scene-aura');
  const riding = figure.classList.contains('scene-ride');
  const motes = h('div', { class: `scene-aura-motes${riding ? ' scene-aura-motes--ride' : ''} aura-motes aura-motes--${sparks}` });
  // Riding, the motes go about the rider and the mount, the ride's own box.
  if (riding) for (const name of ['--ride-width', '--ride-height']) motes.style.setProperty(name, figure.style.getPropertyValue(name));
  for (let index = 0; index < 8; index += 1) {
    const mote = h('span');
    mote.style.left = `${20 + ((index * 37) % 60)}%`;
    mote.style.top = `${15 + ((index * 53) % 70)}%`;
    mote.style.setProperty('--dx', `${(index % 2 ? 1 : -1) * (4 + (index % 3) * 3)}px`);
    mote.style.setProperty('--dy', `${sparks === 'rise' ? -40 - (index % 4) * 10 : -10 - (index % 3) * 6}px`);
    mote.style.animationDelay = `${(-index * 0.6).toFixed(1)}s`;
    motes.append(mote);
  }
  figure.after(motes);
}

// The trail on the way: a glowing footprint under the figure at each step
// (two to a stride of the walk, or of the mount's trot), each staying where it
// fell as the path drifts on, fading. Only while the scene is on the screen,
// the page in view and the animations on; with the animations off a few
// footprints stand behind the figure.
function footprints(stage, { color }, walk, riding) {
  stage.style.setProperty('--trail', color);
  const bottom = riding ? 20 : 28;
  const step = (offset, age = 0) => {
    const print = h('span', { class: `scene-step${offset % 2 ? ' scene-step--far' : ''}` });
    print.style.bottom = `${bottom + (offset % 2 ? 4 : 0)}px`;
    print.style.setProperty('--away', `${-walk.pathSpeed * STEP_LIFE}px`);
    print.style.setProperty('--life', `${STEP_LIFE}s`);
    if (age) {
      print.style.transform = `translateX(${-walk.pathSpeed * age}px)`;
      print.style.opacity = String(Math.max(0.15, 1 - age / STEP_LIFE));
      print.classList.add('scene-step--still');
    }
    stage.append(print);
    return print;
  };
  if (!motionOn()) {
    for (let index = 1; index <= 4; index += 1) step(index, index * 0.5);
    return;
  }
  const stride = (walk.walker.frames / walk.walker.fps) / 2;
  let count = 0;
  const next = () =>
    setTimeout(() => {
      if (!stage.isConnected) return;
      if (motionOn() && !document.hidden) {
        const print = step(count);
        setTimeout(() => print.remove(), STEP_LIFE * 1000);
        count += 1;
      }
      next();
    }, stride * 1000);
  next();
}

// The box the figure stands in on the way, as a pet takes it: its size in
// pixels and the bottom it stands at over the scene's (in styles.css, on
// .scene-walk): the ride's (the mount with the rider), the character's own
// walking frame, or the System's figure.
function figureBox(walk, figure, own) {
  if (figure.classList.contains('scene-ride')) {
    const pixels = (name) => Number.parseFloat(figure.style.getPropertyValue(name));
    return { width: pixels('--ride-width'), height: pixels('--ride-height'), bottom: 'var(--ride-bottom)' };
  }
  const sheet = own ? walk.walker : walk.figure;
  const size = sheet.size * (sheet.scale ?? SCALE);
  return { width: size, height: size, bottom: own ? 'var(--walker-bottom)' : 'var(--figure-bottom)' };
}

// The pet worn on the way (the Sklep Systemu's chowaniec; the author:
// "Zatwierdzam 540.1, 540.2 i 540.3"): its frames, drawn for the walking
// frame's scale, where its place (pet.foot walking, pet.ride riding, in
// data/cosmetics.json) puts them against the figure's box: across from the
// box's front or back edge, and up from its bottom or down from its top; in
// front of the figure, or behind it and the mount. With the animations off
// it stands on its first frame, as the figure does.
function companion(figure, { walk, foot, ride: riding }, box) {
  const place = figure.classList.contains('scene-ride') ? riding : foot;
  const element = frames({ ...walk, scale: 1 }, 'scene-pet');
  const left = (place.edge === 'front' ? box.width / 2 : -box.width / 2) + place.x;
  const rise = place.bottom ?? box.height - place.top - walk.size;
  element.style.left = `calc(50% + ${left}px)`;
  element.style.bottom = `calc(${box.bottom} + ${rise}px)`;
  if (place.behind) figure.before(element);
  else figure.after(element);
}

// With a mount from the Stajnia the character rides it (the author:
// "zbudować szkielet jazdy na każdym wierzchowcu i przerobić na niego
// wszystkie portrety, czy chody"): the mount's trot (walk.mounts in
// data/animations.json) and over it the rider in the character's look and
// skin tone, sitting where the saddle is in each frame (`seats`, found by
// tools/ride-sheets.py; the rider's own `seat` in walk.rider). The rider's
// rise and fall is the mount's keyframes in styles.css (ride-<id>), started
// with its frames, so the two keep in step. Null without a mount, or while
// the mount or the look has no pictures. A mount's look from the Sklep
// Systemu (the Tygrys szablozębny) trots in its place, by its own key in
// walk.mounts, once that is drawn; till then the mount itself does.
function ride(walk, character) {
  const id = mountLook(walk, character);
  const trot = id && walk.mounts?.[id];
  const file = trot && riderFile(character.classId, character.appearance, character.skin, character.evolution?.current?.id);
  if (!file) return null;
  const [x, y] = trot.seats[0];
  const [seatX, seatY] = walk.rider.seat;
  const top = Math.max(0, seatY - Math.min(...trot.seats.map((seat) => seat[1])));
  const element = h(
    'div',
    { class: 'scene-ride' },
    h('div', { class: 'scene-ride-mount' }),
    h('img', { src: `/${file}`, alt: '', width: walk.rider.width, height: walk.rider.height, class: 'scene-ride-rider', draggable: 'false' }),
  );
  element.style.setProperty('--ride-width', `${trot.width}px`);
  element.style.setProperty('--ride-height', `${trot.height + top}px`);
  element.style.setProperty('--mount-height', `${trot.height}px`);
  element.style.setProperty('--sheet', `url("/${trot.file}")`);
  element.style.setProperty('--sheet-width', `${trot.width * trot.frames}px`);
  element.style.setProperty('--frames', String(trot.frames));
  element.style.setProperty('--duration', `${trot.frames / trot.fps}s`);
  element.style.setProperty('--rider-x', `${x - seatX}px`);
  element.style.setProperty('--rider-y', `${top + y - seatY}px`);
  // The rider follows the saddle frame by frame (ride-<frames> in styles.css).
  trot.seats.forEach(([seatXi, seatYi], i) => {
    element.style.setProperty(`--rx${i}`, `${seatXi - x}px`);
    element.style.setProperty(`--ry${i}`, `${seatYi - y}px`);
  });
  element.style.setProperty('--ride', `ride-${trot.frames}`);
  return element;
}

// The key of the trot the character rides in walk.mounts: its mount's look
// worn, while that has a trot, else its Stajnia's mount; null without one.
function mountLook(walk, character) {
  if (!character?.mount) return null;
  const look = cosmeticOf(character.cosmetics?.mountSkin);
  return look && walk.mounts?.[look.art] ? look.art : character.mount.id;
}

// Herbs in the basket, potions on the shelf, items on the table: the things
// done so far, more as the work goes on. A gathering's herbs are counted
// only in its report, so its basket fills with the time.
function workShelf(activity) {
  const herbs = activity.kind === 'herbs';
  const slots = Array.from({ length: herbs ? SHELF : Math.min(SHELF, activity.count ?? 0) }, () => h('span', { class: 'scene-slot' }));
  const count = h('span', { class: 'scene-count' });
  const element = h('div', { class: 'scene-shelf' }, ...slots, count);
  const art = (i) => {
    if (herbs) return activity.herbs.length > 0 ? herbSprite(activity.herbs[i % activity.herbs.length].id) : null;
    if (activity.kind === 'potions') return activity.potion ? potionSprite(activity.potion.id) : null;
    return activity.base ? itemSprite({ base: activity.base.id }) : null;
  };
  let shown = -1;
  function update(done) {
    const part = Math.min(1, Math.max(0, done));
    const ready = herbs ? Math.ceil(part * SHELF) : Math.min(activity.count, Math.floor(activity.count * part));
    if (ready === shown) return;
    shown = ready;
    slots.forEach((slot, i) => {
      if (i >= ready) slot.replaceChildren();
      else if (!slot.firstChild) {
        const sprite = art(i);
        if (sprite) slot.append(sprite);
      }
    });
    count.textContent = !herbs && ready > 0 ? `× ${ready}` : '';
  }
  return { element, update };
}

// Rare moments: the first soon after the scene opens, the next ones now and
// then, only while the scene is on the screen, the page in view and the
// animations on.
function nowAndThen(stage, moment) {
  const { firstSeconds, seconds } = config().moments;
  const wait = ([min, max]) => (min + Math.random() * (max - min)) * 1000;
  const next = (range) =>
    setTimeout(() => {
      if (!stage.isConnected) return;
      if (motionOn() && !document.hidden) moment();
      next(seconds);
    }, wait(range));
  next(firstSeconds);
}

function show(stage, element, seconds) {
  stage.append(element);
  setTimeout(() => element.remove(), seconds * 1000);
}

// A small bird far away, crossing the top of the scene one way or the other.
function bird(stage) {
  const flight = h('div', { class: `scene-bird${Math.random() < 0.5 ? ' scene-bird--back' : ''}` }, h('span'));
  flight.style.top = `${Math.round(4 + Math.random() * 12)}%`;
  flight.style.setProperty('--across', `${stage.clientWidth}px`);
  flight.style.setProperty('--bird', `url("/${config().bird}")`);
  flight.style.setProperty('--bird-width', `${BIRD.width * BIRD.scale}px`);
  flight.style.setProperty('--bird-height', `${BIRD.height * BIRD.scale}px`);
  show(stage, flight, 7);
}

// Steam rising from the cauldron, or sparks flying from the hammer, at the
// moment's point of the frame.
function burst(stage, { kind, x = 0, y = 0 }) {
  const steam = kind === 'steam';
  const cloud = h('div', { class: `scene-${kind}` });
  cloud.style.left = `${x * SCALE}px`;
  cloud.style.top = `${y * SCALE}px`;
  for (let i = 0; i < (steam ? 4 : 10); i += 1) {
    const bit = h('span');
    bit.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * (steam ? 28 : 80))}px`);
    bit.style.setProperty('--dy', `${Math.round(steam ? -60 - Math.random() * 30 : -18 - Math.random() * 42)}px`);
    bit.style.animationDelay = `${steam ? i * 0.3 : Math.random() * 0.12}s`;
    cloud.append(bit);
  }
  show(stage, cloud, 4);
}

// The shadow of one of the inner region's creatures running past far away.
function shadow(stage, activity) {
  const area = state.content.regions.find((region) => region.id === activity.regionId)?.areas.find((place) => place.id === activity.areaId);
  const sprite = area?.dangers.length ? monsterSprite(pick(area.dangers).monsterId) : null;
  if (!sprite) {
    bird(stage);
    return;
  }
  const runner = h('div', { class: 'scene-shadow' }, sprite);
  runner.style.setProperty('--across', `${stage.clientWidth}px`);
  show(stage, runner, 8);
}

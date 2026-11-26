// A fight of a report, played back: enemies in a line at the top, the party
// at the bottom, fields labelled przód, środek and tył. Every strike travels
// between the portraits: a blow lunges at the target, an arrow or a spell
// flies to it, and the hit flashes with the damage (the blows' look and the
// camera over the arena: arena-fx.js). The text log runs
// underneath and "+" opens the participants' stats. Its own words are
// written in Polish and shown in the page's language (t(), i18n.js); the
// fight's names and lines come from the server in it.

import { createFx } from './arena-fx.js';
import { boardArt, companionBust, companionPortrait, monsterSprite, portraitSprite, summonSprite } from './art.js';
import { classArt } from './class-art.js';
import { h, icon } from './dom.js';
import { manaChanges, manaStart } from './fight-mana.js';
import { formatNumber } from './format.js';
import { language, t } from './i18n.js';
import { CLASS_ICONS } from './icons.js';
import { motionOn } from './motion.js';
import { lookOf, skillEffects } from './skill-fx.js';
import { playHit, playMoment, playSound, playVoice, preloadVoices } from './sound.js';
import { state } from './state.js';
import { sweepMoment } from './sweep-landing.js';

// The fields' labels and the results are shown through t(), as the page
// loads its English after this module.
const FIELDS = [
  ['front', 'przód'],
  ['middle', 'środek'],
  ['back', 'tył'],
];
// A draw ends only an Arena duel (src/engine/pvp-arena.js, `draw`).
const RESULTS = { true: 'Zwycięstwo', false: 'Porażka', null: 'Odwrót', draw: 'Remis' };
// The events of a unit's own move, as its actor (a counter is not one).
const MOVES = new Set(['hit', 'crit', 'dodge']);
// 964: the marks a stance leaves on its card while it holds (skill-fx.js
// `stance`: the Zniknięcie's faint figure, the Cień-sobowtór's shadow; the
// fifth forms' Ostatni szał and Oko burzy, and the Noc bez gwiazd's dark
// over every card of the party).
const STANCE_MARKS = ['unit--vanished', 'unit--doubled', 'unit--frenzy', 'unit--stormeye', 'unit--starless'];
const SPEED_KEY = 'wzrost.fight-speed';
// The fight's tempo, one tap to the next and back to the first; 4× since
// 0.2.98 (a player, poz. 45, 12.11.2026: „Czy możemy wprowadzić tempo walk
// x4?”).
const SPEEDS = [1, 2, 4];

const reducedMotion = () => !motionOn();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loadSpeed() {
  try {
    const kept = Number(localStorage.getItem(SPEED_KEY));
    return SPEEDS.includes(kept) ? kept : 1;
  } catch {
    return 1;
  }
}

function saveSpeed(speed) {
  try {
    localStorage.setItem(SPEED_KEY, String(speed));
  } catch {
    // Without storage the tempo is forgotten with the page.
  }
}

const elementColor = (id) => state.content?.elements?.find((element) => element.id === id)?.color ?? '#8fe3ef';
// „od natury”: an element after the part of a blow it made (914).
const elementFrom = (id) => state.content?.elements?.find((element) => element.id === id)?.from ?? '';
// An effect over time in its own colour (data/effects.json), by the name the
// fight's events carry: a burn red, poison green.
const effectColor = (name) => state.content?.effects?.find((effect) => effect.name === name)?.color ?? '#c5e38f';
const tint = (hex, alpha) => `rgba(${[1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(', ')}, ${alpha})`;

// Whose voice a unit has (data/sounds.json): a creature's own, a character's by its look.
const voiceOf = (unit) => unit.monsterId ?? unit.appearance ?? null;

// A card's HP and its maximum in the game's numbers (format.js), as the
// World Boss's card writes them: "11 376 192 / 18 650 000" (24.11.2026).
// The HP keeps its "/" by a no-break space, so a line too narrow for both
// breaks only before the maximum.
const hpWords = (hp, maxHp) => `${formatNumber(hp)}\u00a0/ ${formatNumber(maxHp)}`;

// How wide words are in em in the font of the cards' HP (styles.css,
// --font-system), measured on a canvas; without one, at 0.63 em a
// character, the widest digit of that font.
let ruler;
function emWidth(text) {
  if (ruler === undefined) {
    ruler = document.createElement('canvas').getContext('2d');
    if (ruler) ruler.font = `100px ${getComputedStyle(document.documentElement).getPropertyValue('--font-system').trim() || 'sans-serif'}`;
  }
  return ruler ? ruler.measureText(text).width / 100 : text.length * 0.63;
}

// How wide in em the HP line of a card of `maxHp` can get in a fight, for
// its size (styles.css, .unit-hp-line): `one` on one line, `two` the wider
// of its two lines when the maximum goes to the second. The HP is at most
// as long as its maximum, so it is taken at its widest: its first digit the
// widest up to the maximum's first, the others the font's widest digit.
function hpWidths(maxHp) {
  const digits = String(Math.max(1, Math.round(maxHp)));
  const widest = (choice) => [...choice].reduce((best, digit) => (emWidth(digit) > emWidth(best) ? digit : best));
  const first = widest('123456789'.slice(0, Math.max(1, Number(digits[0]))));
  const hp = formatNumber(Number(first + widest('0123456789').repeat(digits.length - 1)));
  const max = formatNumber(maxHp);
  return { one: emWidth(`${hp}\u00a0/ ${max}`), two: Math.max(emWidth(`${hp}\u00a0/`), emWidth(max)) };
}

// `board`: a place's picture under the fight's formation (790 B, the Arena's
// sand; the author: „tła planszy walki… chociaż pod Arenę zacząć”).
export function createArena(fight, { autoplay = 'visible', board = null } = {}) {
  const units = [...fight.enemies, ...fight.allies];
  preloadVoices(units.map(voiceOf));
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const cards = new Map();
  const running = new Set();
  let run = 0;
  let index = 0;
  let speed = loadSpeed();
  // The fight's clock: the tempo shortens every duration, and the slow
  // motion of the fight's last blow (arena-fx.js) stretches it by
  // 1 / dilation.
  let dilation = 1;
  const pace = () => speed * dilation;
  const later = (ms) => wait(ms / pace());

  const fx = h('div', { class: 'arena-fx', 'aria-hidden': 'true' });
  const banner = h('div', { class: 'arena-banner', 'aria-hidden': 'true' });
  const log = h('ol', { class: 'fight-log', 'aria-label': t('Przebieg walki') });
  const controls = h('div', { class: 'arena-controls' });
  const statsBox = h('div', { class: 'participants', hidden: true }, participantsTable(units));

  function unitCard(unit) {
    const hpFill = h('div', { class: 'unit-hp-fill' });
    // The HP line, its words in a box of their own: the line's width sizes
    // them (styles.css, .unit-hp-line).
    const hpLine = h('span', { class: 'unit-hp-line' });
    const hpText = h('span', { class: 'unit-hp-text' }, hpLine);
    const status = h('span', { class: 'unit-status' });
    // The unit's mana, thin under its HP (21.11.2026): it falls as a skill
    // is paid and a mana shield takes its share, and rises with a mana
    // potion. A unit without mana (a creature, a summon, any unit of a fight
    // kept before) has none.
    const manaFill = manaStart(unit) === null ? null : h('div', { class: 'unit-mana-fill' });
    // A mana shield's points, under the HP while the shield holds.
    const shieldFill = h('div', { class: 'unit-shield-fill' });
    const shieldBar = h('div', { class: 'unit-shield', hidden: true }, shieldFill);
    const level = h('span', { class: 'unit-level', text: t('poz. {level}', { level: unit.level }) });
    // The character's head and shoulders (older reports have no look: male),
    // the monster's sprite or a summon's figure, with the level in its
    // corner; without one, the vector bust or the old line icon beside the
    // level. A character among the foes (the Arena's rival, pvp-arena.js)
    // has its own bust too.
    const person = unit.side === 'ally' || Boolean(unit.classId);
    const art = unit.summon
      ? summonSprite(unit.summon, unit.figure)
      : person
        ? ((unit.companion ? (companionPortrait(unit.classId, unit.appearance ?? 'male') ?? companionBust(unit.classId, unit.appearance ?? 'male')) : null) ??
          portraitSprite(unit.classId, unit.appearance ?? 'male', { bust: true, skin: unit.skin, evolution: unit.evolution, outfit: unit.outfit }) ??
          classArt(unit.classId))
        : monsterSprite(unit.monsterId);
    const card = h(
      'div',
      {
        class: `unit unit--${unit.side}${unit.summon ? ' unit--summon' : unit.champion ? ' unit--champion' : unit.elite ? ' unit--elite' : ''}`,
        role: 'group',
        'aria-label': [t('{name}, poziom {level}', { name: unit.name, level: unit.level }), unit.summon ? t('przywołaniec') : unit.champion ? t('czempion') : unit.elite ? t('elita') : null]
          .filter(Boolean)
          .join(', '),
      },
      art
        ? h('span', { class: 'unit-art' }, art, level)
        : h(
            'span',
            { class: 'unit-top' },
            h('span', { class: 'unit-icon' }, icon(person ? CLASS_ICONS[unit.classId] ?? 'person' : unit.family, { size: 24 })),
            level,
          ),
      h('span', { class: 'unit-name', text: unit.name }),
      h('div', { class: 'unit-hp' }, hpFill),
      manaFill && h('div', { class: 'unit-mana' }, manaFill),
      shieldBar,
      hpText,
      status,
    );
    cards.set(unit.id, { card, hpFill, hpText, hpLine, status, shieldBar, shieldFill, manaFill, unit });
    return card;
  }

  const fields = new Map(); // side and position → its field
  function row(side, list) {
    return h(
      'div',
      { class: `arena-row arena-row--${side}`, 'aria-label': side === 'enemy' ? t('Przeciwnicy') : t('Drużyna') },
      FIELDS.map(([position, label]) => {
        const field = h(
          'div',
          { class: 'arena-field' },
          h('span', { class: 'arena-field-label', text: t(label) }),
          list.filter((unit) => unit.position === position).map(unitCard),
        );
        fields.set(`${side} ${position}`, field);
        return field;
      }),
    );
  }

  const enemies = row('enemy', fight.enemies);
  enemies.append(banner);
  const party = row('ally', fight.allies);
  // The rows and the effects stand on a stage inside the arena, which the
  // camera (arena-fx.js) shakes and zooms while the arena's box stays and
  // cuts off what reaches past it.
  const stage = h('div', { class: 'arena-stage' }, enemies, party, fx);
  const arena = h('div', { class: 'arena' }, stage);
  const boardPicture = board ? boardArt(board) : null;
  if (boardPicture) {
    arena.classList.add('arena--board');
    arena.style.setProperty('--arena-board', `url("${boardPicture}")`);
  }

  // Animations through the Web Animations API, so they can all be cancelled.
  function animate(element, keyframes, options) {
    const animation = element.animate(keyframes, { ...options, duration: options.duration / pace(), delay: (options.delay ?? 0) / pace() });
    running.add(animation);
    return animation.finished.catch(() => {}).finally(() => running.delete(animation));
  }

  // An animation made elsewhere, cancelled with the rest.
  function track(animation) {
    running.add(animation);
    animation.finished.catch(() => {}).finally(() => running.delete(animation));
    return animation;
  }

  // A card's HP now (`hp`, for skill-fx.js too), its bar and its line; the
  // line's widths for its size once for each maximum (a summon's comes with it).
  function setHp(id, hp) {
    const entry = cards.get(id);
    if (!entry) return;
    entry.hp = hp;
    entry.hpFill.style.width = `${Math.max(0, (hp / entry.unit.maxHp) * 100)}%`;
    if (entry.sizedFor !== entry.unit.maxHp) {
      const widths = hpWidths(entry.unit.maxHp);
      entry.hpLine.style.setProperty('--hp-one', String(widths.one));
      entry.hpLine.style.setProperty('--hp-two', String(widths.two));
      entry.sizedFor = entry.unit.maxHp;
    }
    entry.hpLine.textContent = hpWords(hp, entry.unit.maxHp);
  }

  // A unit's mana bar after an event, or at the fight's start.
  function setMana(id, mana) {
    const entry = cards.get(id);
    if (!entry?.manaFill) return;
    entry.manaFill.style.width = `${Math.max(0, Math.min(1, mana / entry.unit.maxMana)) * 100}%`;
  }

  function setDown(id, down) {
    cards.get(id)?.card.classList.toggle('unit--down', down);
  }

  // A card's frame and face lit in a colour: an effect and its ticks, a
  // pin, a slow, a blow thrown back.
  function flash(id, color, background = 'rgba(200, 85, 61, 0.45)') {
    const entry = cards.get(id);
    if (!entry) return Promise.resolve();
    return animate(
      entry.card,
      [
        { boxShadow: '0 0 0 0 transparent', backgroundColor: 'rgba(13, 17, 11, 0.9)' },
        { boxShadow: `0 0 0 3px ${color}`, backgroundColor: background, offset: 0.3 },
        { boxShadow: '0 0 0 0 transparent', backgroundColor: 'rgba(13, 17, 11, 0.9)' },
      ],
      { duration: 420 },
    );
  }

  // The blows' look (arena-fx.js, the author's pick 892 C „Kinowe”): the
  // strikes and their impacts, the numbers, dodges, heals and falls, and the
  // camera over the stage.
  const fxs = createFx({
    arena,
    stage,
    fx,
    cards,
    animate,
    track,
    later,
    pace,
    run: () => run,
    reduced: reducedMotion,
    playSound,
    elementColor,
    setDilation: (value) => {
      dilation = value;
    },
  });
  // A number over a card: a blow's damage, a heal, a dodge, an effect.
  const float = fxs.number;

  const skills = skillEffects({
    animate,
    boxOf: fxs.boxOf,
    centerOf: fxs.centerOf,
    cards,
    fx,
    arena: stage,
    row: (side) => (side === 'enemy' ? enemies : party),
    reduced: reducedMotion,
    wait: later,
    setHp,
    float,
    specks: fxs.specks,
    wordsRoom: fxs.wordsRoom,
  });

  // A line of the log. A blow of a weapon with a zaklęcie żywiołu says,
  // right after its damage and in the element's colour, how much of it the
  // element made: „Kormoran traci 231 HP, w tym 35 od natury.” (914).
  const logLine = (event) => {
    const line = h('li', { class: `log-line log-line--${event.kind}` });
    const part = event.imbued;
    const words = part && elementFrom(part.element);
    const after = words ? `${event.damage} HP` : '';
    const at = after ? event.text.indexOf(after) : -1;
    if (at < 0) {
      line.textContent = event.text;
      return line;
    }
    const cut = at + after.length;
    const clause = h('span', { class: 'log-elemental', text: t(', w tym {damage} {from}', { damage: part.damage, from: words }) });
    clause.style.color = elementColor(part.element);
    line.append(event.text.slice(0, cut), clause, event.text.slice(cut));
    return line;
  };

  // The log has the height of the whole fight from the start, so what lies
  // below the arena (and the narrator's place there) does not move down line
  // by line while the fight plays. Measured once the arena is on the page.
  function reserveLog(tries = 10) {
    if (!log.isConnected) {
      if (tries > 0) requestAnimationFrame(() => reserveLog(tries - 1));
      return;
    }
    const shown = [...log.children];
    log.replaceChildren(...fight.events.map(logLine));
    log.style.minHeight = `${log.offsetHeight}px`;
    log.replaceChildren(...shown);
  }

  // A pin or a slow lasts until its unit moves again: its next blow, or the
  // tick of an effect that opens its move. Then its card shows again what it
  // showed before.
  const held = new Map(); // unit id → { text, before }
  // The fight's last blow is playing in slow motion until its fall.
  let finale = false;
  function hold(id, text) {
    const entry = cards.get(id);
    if (!entry) return;
    held.set(id, { text, before: held.get(id)?.before ?? entry.status.textContent });
    entry.status.textContent = text;
  }
  function release(event) {
    // A blow at a summon (evolutions) is its attacker's move too.
    const move = MOVES.has(event.kind) || (event.kind === 'summon' && event.state === 'hit');
    const id = event.kind === 'tick' ? event.target : move && !event.counter ? event.actor : null;
    const entry = held.get(id);
    if (!entry) return;
    held.delete(id);
    const { status } = cards.get(id);
    if (status.textContent === entry.text) status.textContent = entry.before;
  }

  // A mana shield's card shows how much damage it can still take, in words
  // and as a bar under the HP on the same scale as the HP, so it reads as
  // the few points it adds; spent, the shield goes out. A shield over the
  // whole party (Boska ochrona) names the others' shields too (`guarded`).
  const shields = new Map(); // unit id → { name, full }
  function shieldUp(event) {
    for (const { id, shield } of [{ id: event.actor, shield: event.shield }, ...(event.guarded ?? [])]) {
      const entry = cards.get(id);
      if (!entry) continue;
      shields.set(id, { name: event.skillName, full: Math.max(1, shield) });
      shieldLeft(id, shield);
      if (shield > 0) entry.shieldBar.hidden = false;
    }
  }
  function shieldLeft(id, left) {
    const entry = cards.get(id);
    const shield = shields.get(id);
    if (!shield || !entry || left === undefined) return;
    if (left > 0) {
      entry.status.textContent = `${shield.name} · ${left}`;
      entry.shieldFill.style.width = `${Math.min(100, (left / Math.max(1, entry.unit.maxHp ?? shield.full)) * 100)}%`;
      return;
    }
    shields.delete(id);
    entry.status.textContent = '';
    entry.shieldBar.hidden = true;
    entry.card.classList.remove('unit--shielded');
  }

  // A guard's armour shows in the status line until it fades; the line is
  // short, so it fits a narrow card (the skill's name was called out over it).
  const guards = new Map(); // unit id → the text it shows
  function guardUp(event) {
    const text = t('pancerz +{armor}%', { armor: event.armor });
    guards.set(event.target, text);
    cards.get(event.target).status.textContent = text;
  }
  function guardDown(event) {
    const text = guards.get(event.target);
    guards.delete(event.target);
    const entry = cards.get(event.target);
    if (entry && entry.status.textContent === text) entry.status.textContent = '';
  }

  // A summon (evolutions: Żywiołak, Trujący Szlam) stands in a card of its
  // own before its summoner, with its HP bar (the author's answer 132 B): in
  // the nearest free field in front of the summoner or, when those are
  // taken, as one more card in the field right before it (in its own field,
  // ahead of it, at the front). The foes' blows meant for the summoner land
  // on it, its blows and spit start from it, fallen it stays grey like a
  // fallen unit until it or another is called, and gone, its card goes. With
  // the Druid's line several stand at once, each in its own card: a summon is known
  // by its summoner and its skill (the events name it, `summonSkill`, once it
  // stands; a report from before them has one summon a summoner).
  // Legion Nawii's two knights stand at once, each in its own card (the
  // event says how many, `count`): the foes' blows land on the first still
  // standing, which falls or goes first, and their own blows of a moment go
  // to them in turn. A pack (Zew zwierząt's bison and bear, Gaj wieków's two
  // oaks, 21.11.2026) comes in one event a summon, each named by its place
  // (`order`), and the events of each name it too (`summonOrder`).
  const summoned = new Map(); // `${summoner's id} ${skill}[ ${order}]` → { unit, card, skill, owner, down, order }
  const summonKey = (owner, skill, order = 1) => `${owner} ${skill}${order > 1 ? ` ${order}` : ''}`;
  const summonsOf = (owner) => [...summoned.values()].filter((decoy) => decoy.owner === owner);
  const squadOf = (owner, skill) => summonsOf(owner).filter((decoy) => decoy.skill === skill);
  // The summon an event is about: by its skill (of several, the first still
  // standing), else the summoner's only one. `passed`: the cards of summons
  // that fell earlier in a sweep's moment, not played yet (sweepOf).
  const summonFor = (event, passed = null) => {
    const squad = squadOf(event.target, event.summonSkill ?? event.skill);
    const own = event.summonOrder ? squad.find((decoy) => decoy.order === event.summonOrder) : null;
    return own ?? squad.find((decoy) => !decoy.down && !passed?.has(decoy.unit.id)) ?? squad[0] ?? summonsOf(event.target)[0] ?? null;
  };
  function summonPlace(owner, card) {
    const at = FIELDS.findIndex(([position]) => position === owner.position);
    const ahead = FIELDS.slice(0, Math.max(0, at)).reverse().map(([position]) => fields.get(`${owner.side} ${position}`));
    // With every field ahead taken, the one with the fewest cards, the
    // nearest of equals: the Pradruid's four stand two by two, not three in
    // one column (21.11.2026).
    const free = ahead.find((field) => !field.querySelector('.unit'));
    const fewest = ahead.reduce((best, field) => (best === null || field.querySelectorAll('.unit').length < best.querySelectorAll('.unit').length ? field : best), null);
    if (free || fewest) (free ?? fewest).append(card);
    else cards.get(owner.id)?.card.before(card);
  }
  function summonUp(event, quiet) {
    const owner = byId.get(event.target);
    if (!owner) return Promise.resolve();
    const coming = [];
    const first = event.order ?? 1;
    for (let order = first; order < first + Math.max(1, event.count ?? 1); order++) {
      let decoy = summoned.get(summonKey(owner.id, event.skill, order));
      if (!decoy) {
        // A fallen summon's grey card gives way to the one called now.
        for (const old of summonsOf(owner.id)) if (old.down) summonRemove(owner.id, true, old.skill, old);
        const unit = { id: `${owner.id}~summon~${event.skill}${order > 1 ? `~${order}` : ''}`, side: owner.side, name: event.summon, level: owner.level, maxHp: event.summonHp, strike: 'magic', summon: event.skill, figure: event.figure };
        decoy = { unit, card: unitCard(unit), skill: event.skill, owner: owner.id, down: false, order };
        summoned.set(summonKey(owner.id, event.skill, order), decoy);
        summonPlace(owner, decoy.card);
      }
      decoy.down = false;
      decoy.unit.maxHp = event.summonHp;
      setHp(decoy.unit.id, event.summonHp);
      setDown(decoy.unit.id, false);
      if (!quiet && !reducedMotion()) coming.push(animate(decoy.card, [{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' }));
    }
    return Promise.all(coming);
  }
  // The cards of a summoner's summons go: all of them, those of `skill`, or
  // that one (`only`, one of several of a skill).
  function summonRemove(id, quiet = false, skill = null, only = null) {
    const gone = summonsOf(id).filter((decoy) => (skill === null || decoy.skill === skill) && (only === null || decoy === only));
    return Promise.all(
      gone.map((decoy) => {
        summoned.delete(summonKey(id, decoy.skill, decoy.order));
        cards.delete(decoy.unit.id);
        if (quiet || reducedMotion() || !decoy.card.isConnected) {
          decoy.card.remove();
          return Promise.resolve();
        }
        return animate(decoy.card, [{ opacity: 1 }, { opacity: 0, transform: 'scale(0.6)' }], { duration: 260, easing: 'ease-in' }).then(() => decoy.card.remove());
      }),
    );
  }
  // The summon's state after an event, at once; `up` and `gone` move cards.
  function summonState(event) {
    if (event.state === 'up') return summonUp(event, true);
    const decoy = summonFor(event);
    if (event.state === 'gone') return summonRemove(event.target, true, decoy?.skill ?? null, decoy);
    if (!decoy) return;
    setHp(decoy.unit.id, event.summonHp);
    if (event.state === 'fell') {
      setDown(decoy.unit.id, true);
      decoy.down = true;
    }
  }
  // Who acts in an event: the summon for its own blows and spit (its
  // skill's events under its summoner's name), otherwise the unit itself.
  function actorOf(event) {
    const squad = event.skill ? squadOf(event.actor, event.skill) : [];
    if (squad.length > 0 && (MOVES.has(event.kind) || event.kind === 'skill')) {
      // (A pack's summon by its place; of several standing, the blows of one
      // moment go to them in turn.)
      const own = event.summonOrder ? squad.find((decoy) => decoy.order === event.summonOrder) : null;
      if (own) return own.unit;
      const standing = squad.filter((decoy) => !decoy.down);
      if (standing.length > 1 && MOVES.has(event.kind)) {
        const at = fight.events.indexOf(event);
        let before = 0;
        for (let back = at - 1; back >= 0 && fight.events[back].t === event.t; back--) {
          const earlier = fight.events[back];
          if (MOVES.has(earlier.kind) && earlier.actor === event.actor && earlier.skill === event.skill) before += 1;
        }
        return standing[before % standing.length].unit;
      }
      return (standing[0] ?? squad[0]).unit;
    }
    return byId.get(event.actor);
  }

  // A stance or a guard that ends takes its name off the card (964: and
  // its mark, skill-fx.js `stance`).
  function stanceDown(event) {
    guardDown(event);
    const entry = cards.get(event.target);
    if (entry && entry.status.textContent === event.skillName) entry.status.textContent = '';
    const mark = event.skill ? lookOf(event).stance : null;
    if (entry && mark) entry.card.classList.remove(mark);
  }

  // A fallen unit keeps no status: no burn, pin or shield on its card, and
  // its summon goes with it.
  function fallen(id, quiet = false) {
    const entry = cards.get(id);
    if (!entry) return;
    held.delete(id);
    guards.delete(id);
    shields.delete(id);
    summonRemove(id, quiet);
    entry.status.textContent = '';
    entry.shieldBar.hidden = true;
    entry.card.classList.remove('unit--shielded', ...STANCE_MARKS);
  }

  // An effect over time leaves the card with its last tick, or with an
  // antidote that took it off.
  function effectOver(event) {
    const entry = cards.get(event.target);
    const gone = event.cleared ?? (event.left === 0 && event.effect);
    if (gone && entry?.status.textContent === gone) entry.status.textContent = '';
  }

  async function show(event) {
    const target = byId.get(event.target);
    const actor = actorOf(event);
    // The event as its actor's: the summon's own under its card.
    const acting = actor && actor.id !== event.actor ? { ...event, actor: actor.id } : event;
    release(event);
    // The mana an event spent or gave shows as its move begins.
    for (const [id, mana] of manaChanges(event)) setMana(id, mana);
    const line = () => {
      log.append(logLine(event));
      log.scrollTop = log.scrollHeight;
    };

    if (event.kind === 'skill') {
      // A skill wakes: a sweep's wave over the foes, or an aura on its user.
      if (!event.targets) skills.status(event.actor, event.skillName);
      if (event.shield !== undefined) shieldUp(event);
      // (962: a sweep's look knows the foes its blows reach and its turn;
      // it lands on the card of a summon that takes a foe's blow, not on
      // that foe's, 25.11.2026.)
      const sweep = event.targets ? { ...acting, ...sweepOf(event) } : acting;
      const casting = skills.cast(sweep);
      const look = lookOf(acting);
      fxs.cast(sweep, look);
      if (!event.targets) fxs.glint(acting.actor, look.color);
      await casting;
      line();
      return;
    }
    if (event.kind === 'heal') {
      if (event.armor) guardUp(event);
      const look = lookOf(event);
      if (look.cast === 'guard') fxs.glint(event.target, look.color);
      else fxs.heal(event.target);
      // (963: a party heal's look knows its party and its place in it.)
      await skills.heal(event.quiet ? event : { ...event, ...healOf(event) });
      line();
      return;
    }
    // A potion (potions.js) over the card: the HP or the mana it gave, the
    // effect an antidote took off, the HP a fern brew rose with in gold.
    if (event.kind === 'potion') {
      playSound('potion');
      setHp(event.target, event.hp);
      if (event.effect === 'cure') effectOver(event);
      const color = { mana: '#8fd3ff', revive: '#f2c14e' }[event.effect] ?? '#a7c47f';
      const text = { mana: t('+{amount} many', { amount: event.amount }), cure: `−${event.cleared}` }[event.effect] ?? `+${event.amount}`;
      float(event.target, text, 'heal', 0, color === '#a7c47f' ? null : color);
      line();
      fxs.heal(event.target, color === '#a7c47f' ? null : color);
      await later(420);
      return;
    }
    if (event.kind === 'fade') {
      stanceDown(event);
      // (964: the Zniknięcie's figure coming back, the Cień-sobowtór's
      // shadow sinking.)
      skills.stanceOver(event);
      line();
      await later(200);
      return;
    }
    if (event.kind === 'stun') {
      hold(event.target, event.label ?? t('przyszpilony'));
      float(event.target, t('traci ruch'), 'effect');
      line();
      // (962: a foe a heavy blow stunned sees stars, skill-fx.js daze().)
      skills.daze(event);
      await flash(event.target, '#c49a6c', 'rgba(196, 154, 108, 0.3)');
      return;
    }
    // A skill's slow, or a monster's blow that mires (Ugrzęźnięcie), which
    // shows its effect's name and colour.
    if (event.kind === 'slow') {
      const color = event.effect ? effectColor(event.effect) : '#8fd3ff';
      for (const id of event.targets) {
        hold(id, event.effect ?? t('spowolniony'));
        if (event.effect) float(id, event.effect, 'effect', 0, color);
        flash(id, color, tint(color, 0.25));
      }
      line();
      await later(320);
      return;
    }
    // Wysysanie: the monster takes back HP from the wound it made.
    if (event.kind === 'drain') {
      setHp(event.target, event.hp);
      float(event.target, `+${event.amount}`, 'heal');
      line();
      fxs.heal(event.target);
      await later(420);
      return;
    }
    // A share of a blow thrown back (Niezłomny, Wyzwanie, Lustro many).
    if (event.kind === 'reflect') {
      skills.callout(event.actor, t('Odbicie'), '#f2c14e');
      setHp(event.target, event.hp);
      float(event.target, `−${event.damage}`, 'hit', 0, '#f2c14e');
      line();
      await flash(event.target, '#f2c14e', 'rgba(242, 193, 78, 0.3)');
      return;
    }
    // A summon: its card comes as its summoner calls it, takes the foes'
    // blows meant for the summoner, greys out when it falls and goes when its
    // time is up.
    if (event.kind === 'summon') {
      const decoy = summonFor(event);
      if (event.state === 'up') {
        const appear = summonUp(event, false);
        await skills.cast(event);
        await appear;
        line();
        return;
      }
      if (event.state === 'gone') {
        line();
        await summonRemove(event.target, false, decoy?.skill ?? null, decoy);
        return;
      }
      if (!decoy) {
        line();
        return;
      }
      if (event.state === 'hit') {
        // A blow at many (a sweep's, a cloud's, a cleave's: `sweep`,
        // 25.11.2026) lands at once with the others, on the summon's card
        // the sweep's look has just crossed (sweepOf); any other blow comes
        // at the summon as a blow of its own.
        const look = event.sweep && event.skill ? lookOf(event) : null;
        const blow = fxs.blow(event, actor, decoy.unit, look);
        const impact = () => {
          playHit(actor.sound, false);
          summonState(event);
          fxs.hit(blow);
          float(decoy.unit.id, `−${event.damage}`, 'hit');
          line();
        };
        if (event.sweep) {
          impact();
          await later(240);
          return;
        }
        await fxs.strike(actor, decoy.unit, impact, { blow });
        return;
      }
      const id = run;
      setHp(decoy.unit.id, 0);
      decoy.down = true;
      line();
      await fxs.fall(decoy.card);
      if (id === run) setDown(decoy.unit.id, true);
      return;
    }
    // Opiekun: a heal takes a bad effect off too.
    if (event.kind === 'cleanse') {
      effectOver(event);
      float(event.target, `−${event.cleared}`, 'heal');
      line();
      await later(240);
      return;
    }
    // A skill's blow shows its look; a sweep's blows land at once, as its
    // wave has already crossed the foes.
    const look = event.skill ? lookOf(event) : null;
    const style = look ? { color: look.color, big: look.big, glow: look.glow, teleport: look.teleport, orb: look.orb } : {};
    // The blow: its kind, whether it fells its target and whether it ends
    // the fight (that one plays in slow motion).
    const blow = MOVES.has(event.kind) && target ? fxs.blow(event, actor, target, look, endingOf(event)) : null;
    if (blow) style.blow = blow;
    const land = async (onImpact) => {
      if (event.sweep) {
        // (964: the Znak śmierci's hourglass comes back over its foe before
        // the wounds it counted open again.)
        if (look?.echo) {
          const id = run;
          skills.before(acting);
          await later(300);
          if (id !== run) return;
        }
        onImpact();
        await later(240);
        return;
      }
      if (event.counter) skills.callout(actor.id, t('Kontra'), '#a690e8');
      // (961: a shot that goes on through its target into the next is not
      // aimed again there.)
      if (look && !(event.pierced && look.through)) {
        skills.before(acting);
        fxs.charge(actor.id, look.color);
      }
      await fxs.strike(actor, target, onImpact, style);
    };
    if (event.kind === 'hit' || event.kind === 'crit') {
      const strong = event.kind === 'crit';
      if (blow?.final) {
        finale = true;
        fxs.slowMotion(true);
      }
      await land(() => {
        playHit(actor.sound, strong);
        // Not every blow draws a cry: every critical one, half of the others.
        if (strong || Math.random() < 0.5) playVoice(voiceOf(target), 'hurt');
        setHp(target.id, event.hp);
        fxs.hit(blow);
        // (964: the Znak śmierci's wounds given back come as a sweep's blow
        // with a look of their own.)
        // (The Ścięcie dusz's blade catching the foe beside is its sweep's
        // blow, with a look of its own, and so is the Ostatnie żniwo's.)
        if (look && (!event.sweep || look.echo || look.reaper || look.harvest)) skills.impact(event);
        float(target.id, strong ? `−${event.damage}!` : `−${event.damage}`, strong ? 'crit' : 'hit');
        // The part of the blow from the weapon's element, in its colour,
        // under the damage (914).
        if (event.imbued) float(target.id, `−${event.imbued.damage}`, 'element', 0, elementColor(event.imbued.element));
        if (event.absorbed) float(target.id, t('osłona {amount}', { amount: event.absorbed }), 'absorb');
        shieldLeft(target.id, event.shield);
        line();
      });
      return;
    }
    if (event.kind === 'dodge') {
      await land(() => {
        playMoment('dodge');
        float(target.id, event.blocked ? t('blok') : t('unik'), 'dodge');
        const card = cards.get(target.id).card;
        // A dodge steps aside; a blocked blow only nudges its target.
        if (!event.blocked) {
          fxs.dodge(target, actor);
        } else if (!reducedMotion()) {
          animate(card, [{ transform: 'translateX(0)' }, { transform: 'translateX(16px)' }, { transform: 'translateX(0)' }], {
            duration: 300,
            easing: 'ease-out',
          });
        } else {
          flash(target.id, '#8fe3ef', 'rgba(143, 227, 239, 0.25)');
        }
        line();
      });
      return;
    }
    if (event.kind === 'effect') {
      const color = elementColor(event.element);
      playSound('effect');
      cards.get(target.id).status.textContent = event.effect;
      float(target.id, event.effect, 'effect', 0, effectColor(event.effect));
      fxs.tick(target.id, effectColor(event.effect));
      line();
      await flash(target.id, color, tint(effectColor(event.effect), 0.25));
      return;
    }
    if (event.kind === 'tick') {
      const color = elementColor(event.element);
      playSound('tick');
      setHp(target.id, event.hp);
      float(target.id, `−${event.damage}`, 'tick', 0, effectColor(event.effect));
      fxs.tick(target.id, effectColor(event.effect));
      if (event.absorbed) float(target.id, t('osłona {amount}', { amount: event.absorbed }), 'absorb');
      shieldLeft(target.id, event.shield);
      effectOver(event);
      line();
      await flash(target.id, color, tint(effectColor(event.effect), 0.3));
      return;
    }
    if (event.kind === 'kill') {
      const id = run;
      playMoment('kill');
      playVoice(voiceOf(target), 'death');
      setHp(target.id, 0);
      fallen(target.id);
      line();
      await fxs.fall(cards.get(target.id).card);
      if (id !== run) return;
      setDown(target.id, true);
      if (finale) {
        finale = false;
        fxs.slowMotion(false);
        await later(300);
      }
      return;
    }
    line();
  }

  // 962: what a sweep's look needs of its moment: the foes its blows reach
  // (not those that dodge or block them), and which of its turns it is
  // (Huragan stali turns twice). 964: its blows in the order they land, the
  // dodged ones too (`blows`), and the foes its effect takes hold of
  // (`affected`, the Klątwa rozkładu's). The fourth forms: the foes its
  // blows fell (`felled`, the Taniec kosy's souls). 25.11.2026: a foe whose
  // summon takes its blow by the summon's card, among the cards the look
  // lands on (`targets`) too (sweep-landing.js).
  function sweepOf(event) {
    return sweepMoment(fight.events, fight.events.indexOf(event), (coming, fallen) => summonFor(coming, fallen)?.unit.id ?? null);
  }

  // 963: what a party heal's look needs of its moment: the members its
  // heals reach, in order (one heal each, a cleanse between them), and
  // which of them this heal is.
  function healOf(event) {
    const at = fight.events.indexOf(event);
    const same = (other) => other.kind === 'heal' && other.t === event.t && other.actor === event.actor && other.skill === event.skill && !other.quiet;
    const step = (from, way) => {
      let index = from + way;
      while (fight.events[index]?.kind === 'cleanse' && fight.events[index].t === event.t) index += way;
      return index;
    };
    let first = at;
    for (let index = step(at, -1); index >= 0 && same(fight.events[index]); index = step(index, -1)) first = index;
    const party = [];
    let place = 0;
    for (let index = first; index < fight.events.length && same(fight.events[index]); index = step(index, 1)) {
      if (index === at) place = party.length;
      party.push(fight.events[index].target);
    }
    return { party, place };
  }

  // Whether a blow fells its target (its kill follows in the same moment)
  // and whether it is the fight's last blow (no move and no kill after it).
  function endingOf(event) {
    const at = fight.events.indexOf(event);
    for (let next = at + 1; next < fight.events.length; next++) {
      const coming = fight.events[next];
      if (coming.t !== event.t || MOVES.has(coming.kind)) break;
      if (coming.kind === 'kill' && coming.target === event.target) {
        return { killing: true, final: !fight.events.slice(next + 1).some((rest) => MOVES.has(rest.kind) || rest.kind === 'kill') };
      }
    }
    return { killing: false, final: false };
  }

  // The state right after an event, without animation (for "Pomiń").
  function applyQuietly(event) {
    release(event);
    for (const [id, mana] of manaChanges(event)) setMana(id, mana);
    if (event.hp !== undefined && byId.has(event.target)) setHp(event.target, event.hp);
    if (event.kind === 'effect') cards.get(event.target).status.textContent = event.effect;
    if (event.kind === 'kill') {
      setDown(event.target, true);
      fallen(event.target, true);
    }
    if (event.kind === 'skill' && !event.targets) cards.get(event.actor).status.textContent = event.skillName;
    if (event.kind === 'skill' && !event.targets && lookOf(event).cast === 'shield') cards.get(event.actor).card.classList.add('unit--shielded');
    if (event.kind === 'skill' && !event.targets && lookOf(event).stance) cards.get(event.actor).card.classList.add(lookOf(event).stance);
    if (event.kind === 'skill' && event.shield !== undefined) shieldUp(event);
    if (event.kind === 'hit' || event.kind === 'crit' || event.kind === 'tick') shieldLeft(event.target, event.shield);
    if (event.kind === 'tick' || event.kind === 'cleanse' || (event.kind === 'potion' && event.effect === 'cure')) effectOver(event);
    if (event.kind === 'summon') summonState(event);
    if (event.kind === 'heal' && event.armor) guardUp(event);
    if (event.kind === 'fade') stanceDown(event);
    if (event.kind === 'stun') hold(event.target, event.label ?? t('przyszpilony'));
    if (event.kind === 'slow') for (const id of event.targets) hold(id, event.effect ?? t('spowolniony'));
    log.append(logLine(event));
  }

  function cancelAll() {
    run += 1;
    for (const animation of running) animation.cancel();
    running.clear();
    fx.replaceChildren();
    fxs.cancel();
    finale = false;
    for (const { card } of cards.values()) card.classList.remove('unit--acting');
  }

  function reset() {
    cancelAll();
    held.clear();
    shields.clear();
    guards.clear();
    for (const owner of new Set([...summoned.values()].map((decoy) => decoy.owner))) summonRemove(owner, true);
    index = 0;
    log.replaceChildren();
    banner.classList.remove('arena-banner--shown');
    for (const unit of units) {
      setHp(unit.id, unit.hp);
      setMana(unit.id, manaStart(unit));
      setDown(unit.id, unit.hp <= 0);
      cards.get(unit.id).status.textContent = '';
      cards.get(unit.id).shieldBar.hidden = true;
      cards.get(unit.id).card.classList.remove('unit--shielded', ...STANCE_MARKS);
    }
  }

  function showResult(withSound) {
    const result = fight.draw ? 'draw' : String(fight.won);
    banner.textContent = t(RESULTS[result]);
    banner.dataset.result = result;
    banner.classList.add('arena-banner--shown');
    if (withSound) playSound(fight.won === true ? 'victory' : 'defeat');
  }

  async function play() {
    reset();
    const id = run;
    setControls('playing');
    await wait(250);
    while (index < fight.events.length) {
      if (id !== run) return;
      const event = fight.events[index];
      index += 1;
      await show(event);
      if (id !== run) return;
      await later(140);
    }
    if (id !== run) return;
    showResult(true);
    setControls('done');
  }

  // Shows the end at once: back to the start, then every event without animation.
  function skip() {
    reset();
    for (const event of fight.events) applyQuietly(event);
    index = fight.events.length;
    log.scrollTop = log.scrollHeight;
    showResult(false);
    setControls('done');
  }

  function setControls(mode) {
    controls.replaceChildren(
      mode === 'playing'
        ? h('button', { type: 'button', class: 'button button--world button--small', onClick: skip, text: t('Pomiń') })
        : h('button', { type: 'button', class: 'button button--world button--small', onClick: play, text: t('Powtórz') }),
      h('button', {
        type: 'button',
        class: 'button button--world button--small',
        'aria-label': t('Tempo animacji: {speed}×', { speed }),
        text: t('Tempo {speed}×', { speed }),
        onClick: (event) => {
          speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
          saveSpeed(speed);
          event.currentTarget.textContent = t('Tempo {speed}×', { speed });
          event.currentTarget.setAttribute('aria-label', t('Tempo animacji: {speed}×', { speed }));
        },
      }),
      h(
        'button',
        {
          type: 'button',
          class: 'button button--world button--small',
          'aria-expanded': !statsBox.hidden,
          onClick: (event) => {
            statsBox.hidden = !statsBox.hidden;
            event.currentTarget.setAttribute('aria-expanded', String(!statsBox.hidden));
          },
        },
        icon('plus', { size: 16 }),
        t(' Statystyki uczestników'),
      ),
    );
  }

  const element = h('div', { class: 'arena-wrap' }, arena, controls, log, statsBox);
  reset();
  setControls('done');
  reserveLog();

  // Starts when the arena scrolls into view, or at once when asked to.
  let observer = null;
  if (autoplay === 'now') {
    requestAnimationFrame(() => play());
  } else if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          play();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(arena);
  } else {
    play();
  }

  return {
    element,
    arena,
    stop() {
      cancelAll();
      observer?.disconnect();
    },
  };
}

function participantsTable(units) {
  const rows = [
    ['HP', (unit) => `${unit.maxHp}`],
    [t('Atak'), (unit) => `${unit.attack}, ${unit.damage}`],
    [t('Pancerz'), (unit) => `${unit.armor}`],
    [t('Unik'), (unit) => `${unit.dodge}%`],
    [t('Krytyk'), (unit) => `${unit.crit}%`],
    // A decimal as the page's language writes it: "1,2", "1.2".
    [t('Szybkość'), (unit) => (language() === 'pl' ? `${String(unit.speed).replace('.', ',')}` : String(unit.speed))],
  ];
  return h(
    'div',
    { class: 'participants-scroll' },
    h(
      'table',
      { class: 'participants-table' },
      h('caption', { class: 'visually-hidden', text: t('Statystyki uczestników walki') }),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: '' }), units.map((unit) => h('th', { scope: 'col', text: `${unit.name} (${unit.level})` })))),
      h(
        'tbody',
        {},
        rows.map(([label, value]) => h('tr', {}, h('th', { scope: 'row', text: label }), units.map((unit) => h('td', { text: value(unit) })))),
      ),
    ),
  );
}

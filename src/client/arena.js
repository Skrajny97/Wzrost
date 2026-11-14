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
import { language, t } from './i18n.js';
import { CLASS_ICONS } from './icons.js';
import { motionOn } from './motion.js';
import { lookOf, skillEffects } from './skill-fx.js';
import { playHit, playMoment, playSound, playVoice, preloadVoices } from './sound.js';
import { state } from './state.js';

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
    const hpText = h('span', { class: 'unit-hp-text' });
    const status = h('span', { class: 'unit-status' });
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
      shieldBar,
      hpText,
      status,
    );
    cards.set(unit.id, { card, hpFill, hpText, status, shieldBar, shieldFill, unit });
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

  function setHp(id, hp) {
    const entry = cards.get(id);
    if (!entry) return;
    entry.hpFill.style.width = `${Math.max(0, (hp / entry.unit.maxHp) * 100)}%`;
    entry.hpText.textContent = `${hp} / ${entry.unit.maxHp}`;
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
  // Serce puszczy two stand at once, each in its own card: a summon is known
  // by its summoner and its skill (the events name it, `summonSkill`, once it
  // stands; a report from before them has one summon a summoner).
  const summoned = new Map(); // `${summoner's id} ${skill}` → { unit, card, skill, owner, down }
  const summonKey = (owner, skill) => `${owner} ${skill}`;
  const summonsOf = (owner) => [...summoned.values()].filter((decoy) => decoy.owner === owner);
  // The summon an event is about: by its skill, else the summoner's only one.
  const summonFor = (event) => summoned.get(summonKey(event.target, event.summonSkill ?? event.skill)) ?? summonsOf(event.target)[0] ?? null;
  function summonPlace(owner, card) {
    const at = FIELDS.findIndex(([position]) => position === owner.position);
    const ahead = FIELDS.slice(0, Math.max(0, at)).reverse().map(([position]) => fields.get(`${owner.side} ${position}`));
    const free = ahead.find((field) => !field.querySelector('.unit'));
    if (free || ahead.length > 0) (free ?? ahead[0]).append(card);
    else cards.get(owner.id)?.card.before(card);
  }
  function summonUp(event, quiet) {
    const owner = byId.get(event.target);
    if (!owner) return Promise.resolve();
    let decoy = summoned.get(summonKey(owner.id, event.skill));
    if (!decoy) {
      // A fallen summon's grey card gives way to the one called now.
      for (const old of summonsOf(owner.id)) if (old.down) summonRemove(owner.id, true, old.skill);
      const unit = { id: `${owner.id}~summon~${event.skill}`, side: owner.side, name: event.summon, level: owner.level, maxHp: event.summonHp, strike: 'magic', summon: event.skill, figure: event.figure };
      decoy = { unit, card: unitCard(unit), skill: event.skill, owner: owner.id, down: false };
      summoned.set(summonKey(owner.id, event.skill), decoy);
      summonPlace(owner, decoy.card);
    }
    decoy.down = false;
    decoy.unit.maxHp = event.summonHp;
    setHp(decoy.unit.id, event.summonHp);
    setDown(decoy.unit.id, false);
    if (quiet || reducedMotion()) return Promise.resolve();
    return animate(decoy.card, [{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
  }
  // The cards of a summoner's summons go: all of them, or the one of `skill`.
  function summonRemove(id, quiet = false, skill = null) {
    const gone = summonsOf(id).filter((decoy) => skill === null || decoy.skill === skill);
    return Promise.all(
      gone.map((decoy) => {
        summoned.delete(summonKey(id, decoy.skill));
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
    if (event.state === 'gone') return summonRemove(event.target, true, decoy?.skill ?? null);
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
    const decoy = event.skill ? summoned.get(summonKey(event.actor, event.skill)) : null;
    if (decoy && (MOVES.has(event.kind) || event.kind === 'skill')) return decoy.unit;
    return byId.get(event.actor);
  }

  // A stance or a guard that ends takes its name off the card.
  function stanceDown(event) {
    guardDown(event);
    const entry = cards.get(event.target);
    if (entry && entry.status.textContent === event.skillName) entry.status.textContent = '';
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
    entry.card.classList.remove('unit--shielded');
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
    const line = () => {
      log.append(logLine(event));
      log.scrollTop = log.scrollHeight;
    };

    if (event.kind === 'skill') {
      // A skill wakes: a sweep's wave over the foes, or an aura on its user.
      if (!event.targets) skills.status(event.actor, event.skillName);
      if (event.shield !== undefined) shieldUp(event);
      const casting = skills.cast(acting);
      const look = lookOf(acting);
      fxs.cast(acting, look);
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
      await skills.heal(event);
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
      line();
      await later(200);
      return;
    }
    if (event.kind === 'stun') {
      hold(event.target, event.label ?? t('przyszpilony'));
      float(event.target, t('traci ruch'), 'effect');
      line();
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
        await summonRemove(event.target, false, decoy?.skill ?? null);
        return;
      }
      if (!decoy) {
        line();
        return;
      }
      if (event.state === 'hit') {
        const blow = fxs.blow(event, actor, decoy.unit, null);
        await fxs.strike(
          actor,
          decoy.unit,
          () => {
            playHit(actor.sound, false);
            summonState(event);
            fxs.hit(blow);
            float(decoy.unit.id, `−${event.damage}`, 'hit');
            line();
          },
          { blow },
        );
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
        onImpact();
        await later(240);
        return;
      }
      if (event.counter) skills.callout(actor.id, t('Kontra'), '#a690e8');
      if (look) {
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
        if (look && !event.sweep) skills.impact(event);
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
    if (event.hp !== undefined && byId.has(event.target)) setHp(event.target, event.hp);
    if (event.kind === 'effect') cards.get(event.target).status.textContent = event.effect;
    if (event.kind === 'kill') {
      setDown(event.target, true);
      fallen(event.target, true);
    }
    if (event.kind === 'skill' && !event.targets) cards.get(event.actor).status.textContent = event.skillName;
    if (event.kind === 'skill' && !event.targets && lookOf(event).cast === 'shield') cards.get(event.actor).card.classList.add('unit--shielded');
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
      setDown(unit.id, unit.hp <= 0);
      cards.get(unit.id).status.textContent = '';
      cards.get(unit.id).shieldBar.hidden = true;
      cards.get(unit.id).card.classList.remove('unit--shielded');
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

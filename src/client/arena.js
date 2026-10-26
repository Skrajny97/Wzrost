// A fight of a report, played back: enemies in a line at the top, the party
// at the bottom, fields labelled przód, środek and tył. Every strike travels
// between the portraits: a blow lunges at the target, an arrow or a spell
// flies to it, and the hit flashes with the damage. The text log runs
// underneath and "+" opens the participants' stats.

import { monsterSprite, portraitSprite } from './art.js';
import { classArt } from './class-art.js';
import { h, icon } from './dom.js';
import { CLASS_ICONS } from './icons.js';
import { motionOn } from './motion.js';
import { lookOf, skillEffects } from './skill-fx.js';
import { playHit, playMoment, playSound, playVoice } from './sound.js';
import { state } from './state.js';

const FIELDS = [
  ['front', 'przód'],
  ['middle', 'środek'],
  ['back', 'tył'],
];
const RESULTS = { true: 'Zwycięstwo', false: 'Porażka', null: 'Odwrót' };
// The events of a unit's own move, as its actor (a counter is not one).
const MOVES = new Set(['hit', 'crit', 'dodge']);
const SPEED_KEY = 'wzrost.fight-speed';
const HIT_COLOR = 'rgba(239, 154, 133, 0.95)';

const reducedMotion = () => !motionOn();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loadSpeed() {
  try {
    return localStorage.getItem(SPEED_KEY) === '2' ? 2 : 1;
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
// An effect over time in its own colour (data/effects.json), by the name the
// fight's events carry: a burn red, poison green.
const effectColor = (name) => state.content?.effects?.find((effect) => effect.name === name)?.color ?? '#c5e38f';
const tint = (hex, alpha) => `rgba(${[1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(', ')}, ${alpha})`;

// Whose voice a unit has (data/sounds.json): a creature's own, a character's by its look.
const voiceOf = (unit) => unit.monsterId ?? unit.appearance ?? null;

export function createArena(fight, { autoplay = 'visible' } = {}) {
  const units = [...fight.enemies, ...fight.allies];
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const cards = new Map();
  const running = new Set();
  let run = 0;
  let index = 0;
  let speed = loadSpeed();

  const fx = h('div', { class: 'arena-fx', 'aria-hidden': 'true' });
  const banner = h('div', { class: 'arena-banner', 'aria-hidden': 'true' });
  const log = h('ol', { class: 'fight-log', 'aria-label': 'Przebieg walki' });
  const controls = h('div', { class: 'arena-controls' });
  const statsBox = h('div', { class: 'participants', hidden: true }, participantsTable(units));

  function unitCard(unit) {
    const hpFill = h('div', { class: 'unit-hp-fill' });
    const hpText = h('span', { class: 'unit-hp-text' });
    const status = h('span', { class: 'unit-status' });
    // A mana shield's points, under the HP while the shield holds.
    const shieldFill = h('div', { class: 'unit-shield-fill' });
    const shieldBar = h('div', { class: 'unit-shield', hidden: true }, shieldFill);
    const level = h('span', { class: 'unit-level', text: `poz. ${unit.level}` });
    // The character's head and shoulders (older reports have no look: male)
    // or the monster's sprite, with the level in its corner; without one, the
    // vector bust or the old line icon beside the level.
    const art =
      unit.side === 'ally'
        ? portraitSprite(unit.classId, unit.appearance ?? 'male', { bust: true }) ?? classArt(unit.classId)
        : monsterSprite(unit.monsterId);
    const card = h(
      'div',
      { class: `unit unit--${unit.side}${unit.elite ? ' unit--elite' : ''}`, role: 'group', 'aria-label': `${unit.name}, poziom ${unit.level}` },
      art
        ? h('span', { class: 'unit-art' }, art, level)
        : h(
            'span',
            { class: 'unit-top' },
            h('span', { class: 'unit-icon' }, icon(unit.side === 'ally' ? CLASS_ICONS[unit.classId] ?? 'person' : unit.family, { size: 24 })),
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

  function row(side, list) {
    return h(
      'div',
      { class: `arena-row arena-row--${side}`, 'aria-label': side === 'enemy' ? 'Przeciwnicy' : 'Drużyna' },
      FIELDS.map(([position, label]) =>
        h(
          'div',
          { class: 'arena-field' },
          h('span', { class: 'arena-field-label', text: label }),
          list.filter((unit) => unit.position === position).map(unitCard),
        ),
      ),
    );
  }

  const enemies = row('enemy', fight.enemies);
  enemies.append(banner);
  const party = row('ally', fight.allies);
  const arena = h('div', { class: 'arena' }, enemies, party, fx);

  // Animations through the Web Animations API, so they can all be cancelled.
  function animate(element, keyframes, options) {
    const animation = element.animate(keyframes, { ...options, duration: options.duration / speed, delay: (options.delay ?? 0) / speed });
    running.add(animation);
    return animation.finished.catch(() => {}).finally(() => running.delete(animation));
  }

  function centerOf(element) {
    const box = element.getBoundingClientRect();
    const frame = arena.getBoundingClientRect();
    return { x: box.left - frame.left + box.width / 2, y: box.top - frame.top + box.height / 2 };
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

  function float(id, text, kind, delay = 0, color = null) {
    const entry = cards.get(id);
    if (!entry) return;
    const { x, y } = centerOf(entry.card);
    const bubble = h('span', { class: `float float--${kind}`, text });
    if (color) bubble.style.color = color;
    bubble.style.left = `${x}px`;
    bubble.style.top = `${y - 18}px`;
    fx.append(bubble);
    animate(
      bubble,
      [
        { transform: 'translate(-50%, 0) scale(0.7)', opacity: 0 },
        { transform: 'translate(-50%, -8px) scale(1.15)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, -34px) scale(1)', opacity: 0 },
      ],
      { duration: 1000, delay, easing: 'ease-out', fill: 'backwards' },
    ).then(() => bubble.remove());
  }

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

  function shake(id, distance) {
    const entry = cards.get(id);
    if (!entry || reducedMotion()) return Promise.resolve();
    return animate(
      entry.card,
      [
        { transform: 'translateX(0)' },
        { transform: `translateX(${-distance}px)` },
        { transform: `translateX(${distance * 0.8}px)` },
        { transform: `translateX(${-distance * 0.4}px)` },
        { transform: 'translateX(0)' },
      ],
      { duration: 300 },
    );
  }

  function slash(id, strong) {
    const entry = cards.get(id);
    if (!entry) return;
    const { x, y } = centerOf(entry.card);
    const mark = h('span', { class: `slash${strong ? ' slash--strong' : ''}` });
    mark.style.left = `${x}px`;
    mark.style.top = `${y}px`;
    fx.append(mark);
    animate(
      mark,
      [
        { transform: 'translate(-50%, -50%) scale(0.4) rotate(-20deg)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.1) rotate(0deg)', opacity: 1, offset: 0.35 },
        { transform: 'translate(-50%, -50%) scale(1.25) rotate(8deg)', opacity: 0 },
      ],
      { duration: 360, easing: 'ease-out' },
    ).then(() => mark.remove());
  }

  // The attacker reaches the target: a lunge for blows, a projectile otherwise.
  // A strike cut short (Pomiń, Powtórz) lands nowhere: the arena already shows
  // another moment of the fight.
  async function strike(actor, target, onImpact, style = {}) {
    const id = run;
    const from = cards.get(actor.id).card;
    const to = cards.get(target.id).card;
    const a = centerOf(from);
    const b = centerOf(to);
    // A strike out of the shadows: the attacker fades and the blow lands
    // from nowhere.
    if (style.teleport && !reducedMotion()) {
      playSound('swing');
      await animate(from, [{ opacity: 1 }, { opacity: 0.15 }], { duration: 220 });
      if (id !== run) return;
      onImpact();
      await animate(from, [{ opacity: 0.15 }, { opacity: 1 }], { duration: 260 });
      await wait(200 / speed);
      return;
    }
    if (actor.strike === 'melee') {
      const reach = reducedMotion() ? 0.3 : 0.62;
      const dx = (b.x - a.x) * reach;
      const dy = (b.y - a.y) * reach;
      from.classList.add('unit--acting');
      playSound('swing');
      const out = from.animate(
        [{ transform: 'translate(0, 0) scale(1)' }, { transform: `translate(${dx}px, ${dy}px) scale(1.07)` }],
        { duration: 190 / speed, easing: 'cubic-bezier(0.5, 0, 0.75, 0.4)', fill: 'forwards' },
      );
      // The lunge holds its end until the way back has finished; cancelling
      // everything (Pomiń) also cancels it, so the card never stays out.
      running.add(out);
      await out.finished.catch(() => {});
      if (id !== run) return;
      onImpact();
      await Promise.all([
        animate(from, [{ transform: `translate(${dx}px, ${dy}px) scale(1.07)` }, { transform: 'translate(0, 0) scale(1)' }], {
          duration: 240,
          easing: 'ease-out',
        }).then(() => {
          out.cancel();
          running.delete(out);
        }),
        wait(260 / speed),
      ]);
      if (id === run) from.classList.remove('unit--acting');
      return;
    }

    const magic = actor.strike === 'magic';
    playSound(magic ? 'magic' : 'shot');
    await animate(from, [{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 160 });
    if (id !== run) return;
    const bolt = h('span', {
      class: ['projectile', `projectile--${magic ? 'magic' : 'arrow'}`, style.big && 'projectile--big', style.glow && 'projectile--glow'].filter(Boolean).join(' '),
    });
    if (magic || style.color) bolt.style.setProperty('--fx', style.color ?? elementColor(actor.element));
    fx.append(bolt);
    const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    await animate(
      bolt,
      [
        { transform: `translate(${a.x}px, ${a.y}px) rotate(${angle}deg) scale(0.6)`, opacity: 0 },
        { opacity: 1, offset: 0.15 },
        { transform: `translate(${b.x}px, ${b.y}px) rotate(${angle}deg) scale(1)`, opacity: 1 },
      ],
      { duration: magic ? 340 : 260, easing: 'ease-in' },
    );
    bolt.remove();
    if (id !== run) return;
    onImpact();
    await wait(300 / speed);
  }

  const skills = skillEffects({
    animate,
    centerOf,
    cards,
    fx,
    arena,
    row: (side) => (side === 'enemy' ? enemies : party),
    reduced: reducedMotion,
    wait: (ms) => wait(ms / speed),
    setHp,
    float,
  });

  const logLine = (event) => h('li', { class: `log-line log-line--${event.kind}`, text: event.text });

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
  function hold(id, text) {
    const entry = cards.get(id);
    if (!entry) return;
    held.set(id, { text, before: held.get(id)?.before ?? entry.status.textContent });
    entry.status.textContent = text;
  }
  function release(event) {
    const id = event.kind === 'tick' ? event.target : MOVES.has(event.kind) && !event.counter ? event.actor : null;
    const entry = held.get(id);
    if (!entry) return;
    held.delete(id);
    const { status } = cards.get(id);
    if (status.textContent === entry.text) status.textContent = entry.before;
  }

  // A mana shield's card shows how much damage it can still take, in words
  // and as a bar under the HP; spent, the shield goes out.
  const shields = new Map(); // unit id → { name, full }
  function shieldUp(event) {
    const entry = cards.get(event.actor);
    shields.set(event.actor, { name: event.skillName, full: Math.max(1, event.shield) });
    shieldLeft(event.actor, event.shield);
    if (event.shield > 0) entry.shieldBar.hidden = false;
  }
  function shieldLeft(id, left) {
    const entry = cards.get(id);
    const shield = shields.get(id);
    if (!shield || !entry || left === undefined) return;
    if (left > 0) {
      entry.status.textContent = `${shield.name} · ${left}`;
      entry.shieldFill.style.width = `${Math.min(100, (left / shield.full) * 100)}%`;
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
    const text = `pancerz +${event.armor}%`;
    guards.set(event.target, text);
    cards.get(event.target).status.textContent = text;
  }
  function guardDown(event) {
    const text = guards.get(event.target);
    guards.delete(event.target);
    const entry = cards.get(event.target);
    if (entry && entry.status.textContent === text) entry.status.textContent = '';
  }

  // A fallen unit keeps no status: no burn, pin or shield on its card.
  function fallen(id) {
    const entry = cards.get(id);
    if (!entry) return;
    held.delete(id);
    guards.delete(id);
    shields.delete(id);
    entry.status.textContent = '';
    entry.shieldBar.hidden = true;
    entry.card.classList.remove('unit--shielded');
  }

  // An effect over time leaves the card with its last tick.
  function effectOver(event) {
    const entry = cards.get(event.target);
    if (event.left === 0 && entry?.status.textContent === event.effect) entry.status.textContent = '';
  }

  async function show(event) {
    const target = byId.get(event.target);
    const actor = byId.get(event.actor);
    release(event);
    const line = () => {
      log.append(logLine(event));
      log.scrollTop = log.scrollHeight;
    };

    if (event.kind === 'skill') {
      // A skill wakes: a sweep's wave over the foes, or an aura on its user.
      if (!event.targets) skills.status(event.actor, event.skillName);
      if (event.shield !== undefined) shieldUp(event);
      await skills.cast(event);
      line();
      return;
    }
    if (event.kind === 'heal') {
      if (event.armor) guardUp(event);
      await skills.heal(event);
      line();
      return;
    }
    if (event.kind === 'fade') {
      guardDown(event);
      line();
      await wait(200 / speed);
      return;
    }
    if (event.kind === 'stun') {
      hold(event.target, event.label ?? 'przyszpilony');
      float(event.target, 'traci ruch', 'effect');
      line();
      await flash(event.target, '#c49a6c', 'rgba(196, 154, 108, 0.3)');
      return;
    }
    if (event.kind === 'slow') {
      for (const id of event.targets) {
        hold(id, 'spowolniony');
        flash(id, '#8fd3ff', 'rgba(143, 211, 255, 0.25)');
      }
      line();
      await wait(320 / speed);
      return;
    }
    // A skill's blow shows its look; a sweep's blows land at once, as its
    // wave has already crossed the foes.
    const look = event.skill ? lookOf(event) : null;
    const style = look ? { color: look.color, big: look.big, glow: look.glow, teleport: look.teleport } : {};
    const land = async (onImpact) => {
      if (event.sweep) {
        onImpact();
        await wait(240 / speed);
        return;
      }
      if (event.counter) skills.callout(actor.id, 'Kontra', '#a690e8');
      if (look) skills.before(event);
      await strike(actor, target, onImpact, style);
    };
    if (event.kind === 'hit' || event.kind === 'crit') {
      const strong = event.kind === 'crit';
      await land(() => {
        playHit(actor.sound, strong);
        // Not every blow draws a cry: every critical one, half of the others.
        if (strong || Math.random() < 0.5) playVoice(voiceOf(target), 'hurt');
        setHp(target.id, event.hp);
        flash(target.id, strong ? '#e0a03c' : HIT_COLOR, strong ? 'rgba(224, 160, 60, 0.45)' : undefined);
        shake(target.id, strong || look?.impact === 'heavy' ? 8 : 5);
        slash(target.id, strong);
        if (look && !event.sweep) skills.impact(event);
        float(target.id, strong ? `−${event.damage}!` : `−${event.damage}`, strong ? 'crit' : 'hit');
        if (event.absorbed) float(target.id, `osłona ${event.absorbed}`, 'absorb');
        shieldLeft(target.id, event.shield);
        line();
      });
      return;
    }
    if (event.kind === 'dodge') {
      await land(() => {
        playMoment('dodge');
        float(target.id, 'unik', 'dodge');
        const card = cards.get(target.id).card;
        if (!reducedMotion()) {
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
      line();
      await flash(target.id, color, tint(effectColor(event.effect), 0.25));
      return;
    }
    if (event.kind === 'tick') {
      const color = elementColor(event.element);
      playSound('tick');
      setHp(target.id, event.hp);
      float(target.id, `−${event.damage}`, 'tick', 0, effectColor(event.effect));
      if (event.absorbed) float(target.id, `osłona ${event.absorbed}`, 'absorb');
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
      const card = cards.get(target.id).card;
      await animate(
        card,
        [
          { opacity: 1, filter: 'grayscale(0)', transform: 'scale(1)' },
          { opacity: 0.4, filter: 'grayscale(1)', transform: 'scale(0.93)' },
        ],
        { duration: 420, easing: 'ease-in' },
      );
      if (id === run) setDown(target.id, true);
      return;
    }
    line();
  }

  // The state right after an event, without animation (for "Pomiń").
  function applyQuietly(event) {
    release(event);
    if (event.hp !== undefined && byId.has(event.target)) setHp(event.target, event.hp);
    if (event.kind === 'effect') cards.get(event.target).status.textContent = event.effect;
    if (event.kind === 'kill') {
      setDown(event.target, true);
      fallen(event.target);
    }
    if (event.kind === 'skill' && !event.targets) cards.get(event.actor).status.textContent = event.skillName;
    if (event.kind === 'skill' && event.skill === 'mana-shield') cards.get(event.actor).card.classList.add('unit--shielded');
    if (event.kind === 'skill' && event.shield !== undefined) shieldUp(event);
    if (event.kind === 'hit' || event.kind === 'crit' || event.kind === 'tick') shieldLeft(event.target, event.shield);
    if (event.kind === 'tick') effectOver(event);
    if (event.kind === 'heal' && event.armor) guardUp(event);
    if (event.kind === 'fade') guardDown(event);
    if (event.kind === 'stun') hold(event.target, event.label ?? 'przyszpilony');
    if (event.kind === 'slow') for (const id of event.targets) hold(id, 'spowolniony');
    log.append(logLine(event));
  }

  function cancelAll() {
    run += 1;
    for (const animation of running) animation.cancel();
    running.clear();
    fx.replaceChildren();
    for (const { card } of cards.values()) card.classList.remove('unit--acting');
  }

  function reset() {
    cancelAll();
    held.clear();
    shields.clear();
    guards.clear();
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
    banner.textContent = RESULTS[String(fight.won)];
    banner.dataset.result = String(fight.won);
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
      await wait(140 / speed);
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
        ? h('button', { type: 'button', class: 'button button--world button--small', onClick: skip, text: 'Pomiń' })
        : h('button', { type: 'button', class: 'button button--world button--small', onClick: play, text: 'Powtórz' }),
      h('button', {
        type: 'button',
        class: 'button button--world button--small',
        'aria-label': `Tempo animacji: ${speed}×`,
        text: `Tempo ${speed}×`,
        onClick: (event) => {
          speed = speed === 1 ? 2 : 1;
          saveSpeed(speed);
          event.currentTarget.textContent = `Tempo ${speed}×`;
          event.currentTarget.setAttribute('aria-label', `Tempo animacji: ${speed}×`);
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
        ' Statystyki uczestników',
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
    ['Atak', (unit) => `${unit.attack}, ${unit.damage}`],
    ['Pancerz', (unit) => `${unit.armor}`],
    ['Unik', (unit) => `${unit.dodge}%`],
    ['Krytyk', (unit) => `${unit.crit}%`],
    ['Szybkość', (unit) => `${String(unit.speed).replace('.', ',')}`],
  ];
  return h(
    'div',
    { class: 'participants-scroll' },
    h(
      'table',
      { class: 'participants-table' },
      h('caption', { class: 'visually-hidden', text: 'Statystyki uczestników walki' }),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: '' }), units.map((unit) => h('th', { scope: 'col', text: `${unit.name} (${unit.level})` })))),
      h(
        'tbody',
        {},
        rows.map(([label, value]) => h('tr', {}, h('th', { scope: 'row', text: label }), units.map((unit) => h('td', { text: value(unit) })))),
      ),
    ),
  );
}

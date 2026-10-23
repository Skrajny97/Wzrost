// The key fight of a report, played back: enemies in a line at the top, the
// party at the bottom, fields labelled przód, środek and tył. Strikes are
// simple animations between the portraits; the text log runs underneath and
// "+" opens the participants' stats.

import { h, icon } from './dom.js';
import { CLASS_ICONS } from './icons.js';

const FIELDS = [
  ['front', 'przód'],
  ['middle', 'środek'],
  ['back', 'tył'],
];
const DELAYS = { hit: 700, crit: 850, dodge: 650, effect: 500, tick: 500, kill: 550 };

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createArena(fight) {
  const units = [...fight.enemies, ...fight.allies];
  const cards = new Map();
  let timer = null;
  let index = 0;

  const log = h('ol', { class: 'fight-log', 'aria-label': 'Przebieg walki' });
  const controls = h('div', { class: 'arena-controls' });
  const statsBox = h('div', { class: 'participants', hidden: true });

  function unitCard(unit) {
    const hpFill = h('div', { class: 'unit-hp-fill' });
    const hpText = h('span', { class: 'unit-hp-text' });
    const status = h('span', { class: 'unit-status' });
    const card = h(
      'div',
      { class: `unit unit--${unit.side}${unit.elite ? ' unit--elite' : ''}`, role: 'group', 'aria-label': `${unit.name}, poziom ${unit.level}` },
      h(
        'span',
        { class: 'unit-top' },
        h('span', { class: 'unit-icon' }, icon(unit.side === 'ally' ? CLASS_ICONS[unit.classId] ?? 'person' : unit.family, { size: 24 })),
        h('span', { class: 'unit-level', text: `poz. ${unit.level}` }),
      ),
      h('span', { class: 'unit-name', text: unit.name }),
      h('div', { class: 'unit-hp' }, hpFill),
      hpText,
      status,
    );
    cards.set(unit.id, { card, hpFill, hpText, status, unit, hp: unit.hp });
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

  const arena = h('div', { class: 'arena' }, row('enemy', fight.enemies), row('ally', fight.allies));

  function setHp(id, hp) {
    const entry = cards.get(id);
    if (!entry) return;
    entry.hp = hp;
    entry.hpFill.style.width = `${Math.max(0, (hp / entry.unit.maxHp) * 100)}%`;
    entry.hpText.textContent = `${hp} / ${entry.unit.maxHp}`;
    entry.card.classList.toggle('unit--down', hp <= 0);
  }

  function flash(element, className) {
    element.classList.remove(className);
    // Reading the size restarts the CSS animation.
    void element.offsetWidth;
    element.classList.add(className);
  }

  function float(id, text, kind) {
    const entry = cards.get(id);
    if (!entry || reducedMotion()) return;
    const bubble = h('span', { class: `float float--${kind}`, text });
    entry.card.append(bubble);
    setTimeout(() => bubble.remove(), 1100);
  }

  function apply(event, animate) {
    const target = cards.get(event.target);
    const actor = cards.get(event.actor);
    if (animate && actor && (event.kind === 'hit' || event.kind === 'crit' || event.kind === 'dodge')) {
      flash(actor.card, actor.unit.side === 'enemy' ? 'unit--lunge-down' : 'unit--lunge-up');
    }
    if (event.kind === 'hit' || event.kind === 'crit' || event.kind === 'tick') {
      if (animate && target) flash(target.card, event.kind === 'tick' ? 'unit--tick' : 'unit--hit');
      if (animate) float(event.target, `−${event.damage}${event.kind === 'crit' ? '!' : ''}`, event.kind);
    }
    if (event.kind === 'dodge' && animate) float(event.target, 'unik', 'dodge');
    if (event.kind === 'effect' && target) {
      target.status.textContent = event.effect;
      if (animate) float(event.target, event.effect, 'effect');
    }
    if (event.hp !== undefined && target) setHp(event.target, event.hp);
    log.append(h('li', { class: `log-line log-line--${event.kind}`, text: event.text }));
    if (animate) log.scrollTop = log.scrollHeight;
  }

  function reset() {
    clearTimeout(timer);
    index = 0;
    log.replaceChildren();
    for (const unit of units) {
      setHp(unit.id, unit.hp);
      cards.get(unit.id).status.textContent = '';
    }
  }

  function step() {
    if (index >= fight.events.length) {
      finish();
      return;
    }
    const event = fight.events[index++];
    apply(event, true);
    timer = setTimeout(step, DELAYS[event.kind] ?? 600);
  }

  function finish() {
    clearTimeout(timer);
    while (index < fight.events.length) apply(fight.events[index++], false);
    log.scrollTop = log.scrollHeight;
    setControls('done');
  }

  function play() {
    reset();
    if (reducedMotion()) {
      finish();
      return;
    }
    setControls('playing');
    step();
  }

  function setControls(mode) {
    controls.replaceChildren(
      mode === 'playing'
        ? h('button', { type: 'button', class: 'button button--world button--small', onClick: finish, text: 'Pomiń' })
        : h('button', { type: 'button', class: 'button button--world button--small', onClick: play, text: 'Powtórz' }),
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

  statsBox.append(participantsTable(units));
  const element = h('div', { class: 'arena-wrap' }, arena, controls, log, statsBox);
  reset();
  setControls('done');

  // Starts when the arena scrolls into view; stops when the report closes.
  let observer = null;
  if ('IntersectionObserver' in window) {
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
    stop() {
      clearTimeout(timer);
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

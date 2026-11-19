// The parts of the Bestia's card and the strażnik's card about what makes an
// attack hit harder or softer (src/server/guild-strike.js; DECISIONS.md,
// "Klasa dnia", "Róg zbiórki" and "Podcięcie i cios"; 1197, 1199 A, 1203,
// accepted by the author on the review page on 19.11.2026):
//   - classDayPart: the two classes of the day with the game's class icons
//     and their bonus, and a word when the character's class is one;
//   - undercutsPart: the podcięcia waiting on the beast or the strażnik,
//     who made them and how many Cios each still strengthens;
//   - attackChoice: "Cios" and "Podcięcie" in place of "Atakuj", each with
//     its icon and a line of what it does;
//   - rallyCard: the Róg zbiórki, a card of its own over the beast's and
//     the guardian's: the rally on with who came, the next one set, today's
//     ended one, and for the leader and the deputies the hour to set or the
//     rally to call off.
// Their words come from the server (`strike.texts`, `rally.texts`), in the
// page's language; their own few through t() (i18n.js).

import { beastStrikeArt, beastUndercutArt, rallyHornArt } from './art.js';
import { h, icon } from './dom.js';
import { formatMinutes, timeFormat } from './format.js';
import { t } from './i18n.js';
import { CLASS_ICONS } from './icons.js';
import { call, serverNow } from './state.js';
import { confirmAction, howItWorks, toast, withButton } from './ui.js';

const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
const hour = (ms) => timeFormat.format(new Date(ms));

// "Klasy dnia: [⚔] Łucznik [✦] Mag +50%", and a line when the character's
// class has its day.
export function classDayPart(strike) {
  const { classDay, texts } = strike;
  return h(
    'div',
    { class: 'guild-classday' },
    h(
      'p',
      { class: 'guild-classday-line' },
      h('span', { class: 'guild-classday-label', text: `${texts.classDay.title}:` }),
      classDay.classes.map((cls) => h('span', { class: 'guild-classday-class' }, icon(CLASS_ICONS[cls.id] ?? 'person', { size: 16 }), cls.name)),
      h('span', { class: 'guild-classday-bonus', text: texts.classDay.bonus }),
    ),
    classDay.own && h('p', { class: 'guild-classday-own', text: texts.classDay.own }),
  );
}

// The podcięcia waiting on the beast or the strażnik, the oldest first.
export function undercutsPart(strike) {
  const { undercuts, texts } = strike;
  const words = texts.undercut;
  if (undercuts.waiting.length === 0) return h('p', { class: 'guild-undercuts muted', text: words.waitingNone });
  return h(
    'div',
    { class: 'guild-undercuts' },
    h('p', { class: 'guild-undercuts-title' }, beastUndercutArt(20), filled(words.waiting, { count: undercuts.waiting.length })),
    h(
      'ul',
      { class: 'guild-undercuts-list' },
      undercuts.waiting.map((cut) => h('li', { class: `guild-undercut${cut.own ? ' guild-undercut--own' : ''}`, text: filled(words.waitingRow, { name: cut.name, left: cut.left, strikes: cut.strikes }) })),
    ),
    undercuts.waiting.some((cut) => cut.own) && h('p', { class: 'muted', text: words.own }),
  );
}

// "Cios" and "Podcięcie", each with what it does under it; `onAttack(kind)`
// attacks, `disabled` while no attack is left.
export function attackChoice(strike, { disabled, onAttack, guide = null }) {
  const words = strike.texts.undercut;
  const button = (kind, art, label, className) =>
    h('button', { type: 'button', class: `button ${className} guild-strike-button`, disabled, onClick: (event) => withButton(event.currentTarget, () => onAttack(kind)) }, art, h('span', { text: label }));
  const bonus = strike.undercuts.bonus;
  return h(
    'div',
    { class: 'guild-strike-choice', ...(guide && { 'data-guide': guide }) },
    h(
      'div',
      { class: 'guild-strike-option' },
      button('strike', beastStrikeArt(24), words.strike, 'button--system'),
      h('p', { class: `guild-strike-note${bonus ? ' guild-strike-note--bonus' : ''}`, text: bonus ? filled(words.strikeBonus, { name: bonus.name, percent: strike.undercuts.percent }) : words.strikeNote }),
    ),
    h('div', { class: 'guild-strike-option' }, button('undercut', beastUndercutArt(24), words.undercut, 'guild-strike-button--undercut'), h('p', { class: 'guild-strike-note', text: words.undercutNote })),
  );
}

// The rally's names, who came, as a line under the count.
const cameLine = (texts, came) => [h('p', { class: 'guild-rally-came-count', text: filled(texts.came, { count: came.length }) }), h('p', { class: 'guild-rally-came', text: came.join(', ') })];

// The Róg zbiórki's card. `onChange(rally)` gets the rally anew after the
// leader set or called it off.
export function rallyCard(rally, { onChange }) {
  const { texts } = rally;
  const now = serverNow();
  // "dziś" or "jutro" by the device's own calendar, as the hours beside it
  // are shown by its clock (a start is at most a day ahead).
  const dayWord = (at) => (new Date(at).toDateString() === new Date(now).toDateString() ? texts.today : texts.tomorrow);
  const parts = [];
  const current = rally.current;
  if (current?.state === 'on') {
    parts.push(
      h('p', { class: 'guild-rally-on', text: filled(texts.on, { hour: hour(current.endsAt) }) }),
      h('p', { class: 'guild-rally-bonus', text: texts.onBonus }),
      current.came.length > 0 ? cameLine(texts, current.came) : h('p', { class: 'muted', text: texts.cameNone }),
    );
  } else if (current?.state === 'planned') {
    parts.push(
      h('p', { class: 'guild-rally-planned', text: filled(texts.planned, { day: dayWord(current.startsAt), hour: hour(current.startsAt) }) }),
      h('p', { class: 'muted', text: filled(texts.startsIn, { time: formatMinutes(Math.max(1, Math.ceil((current.startsAt - now) / 60000))) }) }),
      current.setBy && h('p', { class: 'muted', text: filled(texts.plannedBy, { name: current.setBy }) }),
    );
    if (rally.canSet) {
      parts.push(
        h('button', {
          type: 'button',
          class: 'button button--danger guild-rally-cancel',
          text: texts.cancel,
          onClick: (event) =>
            withButton(event.currentTarget, async () => {
              if (!(await confirmAction({ title: texts.cancelAsk, text: filled(texts.planned, { day: dayWord(current.startsAt), hour: hour(current.startsAt) }), confirmLabel: texts.cancel, cancelLabel: t('Zostaw') }))) return;
              const answer = await call('POST', '/api/guild/rally/cancel', { id: current.id });
              toast(answer.text);
              onChange(answer.rally);
            }),
        }),
      );
    }
  } else if (!rally.ended) {
    parts.push(h('p', { class: 'muted', text: texts.none }));
  }
  if (rally.ended) {
    parts.push(
      h('p', { class: 'guild-rally-ended', text: filled(texts.ended, { from: hour(rally.ended.startsAt), to: hour(rally.ended.endsAt) }) }),
      rally.ended.came.length > 0 ? cameLine(texts, rally.ended.came) : h('p', { class: 'muted', text: texts.endedNone }),
    );
  }
  // The leader and the deputies set the next rally while none is on or
  // set ahead.
  if (rally.canSet && !current && rally.slots.length > 0) {
    const select = h(
      'select',
      { class: 'anvil-material guild-rally-select', id: 'guild-rally-hour' },
      rally.slots.map((slot) => h('option', { value: String(slot.at), text: slot.at === 'now' ? texts.now : `${dayWord(slot.at)} ${hour(slot.at)}` })),
    );
    parts.push(
      h(
        'div',
        { class: 'guild-rally-form' },
        h('label', { class: 'guild-rally-label', for: 'guild-rally-hour', text: texts.hourLabel }),
        select,
        h('button', {
          type: 'button',
          class: 'button button--system guild-rally-set',
          text: texts.set,
          onClick: (event) =>
            withButton(event.currentTarget, async () => {
              const at = select.value === 'now' ? 'now' : Number(select.value);
              const answer = await call('POST', '/api/guild/rally', { at });
              toast(answer.text);
              onChange(answer.rally);
            }),
        }),
      ),
    );
  } else if (!rally.canSet && !current) parts.push(h('p', { class: 'muted', text: texts.noneMember }));
  return h(
    'section',
    { class: `card guild-rally${current?.state === 'on' ? ' guild-rally--on' : ''}`, 'aria-labelledby': 'guild-rally-title' },
    h('h2', { class: 'card-title guild-rally-title', id: 'guild-rally-title' }, rallyHornArt(28), h('span', { text: texts.title })),
    parts,
    howItWorks(null, texts.how),
  );
}

// When the rally's card next changes by itself (its start or its end),
// in milliseconds from now, or null.
export function rallyTurn(rally) {
  const current = rally?.current;
  if (!current) return null;
  const at = current.state === 'planned' ? current.startsAt : current.state === 'on' ? current.endsAt : null;
  return at === null ? null : Math.max(1000, at - serverNow() + 1000);
}

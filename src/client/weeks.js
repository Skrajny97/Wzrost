// The weeks of the year (data/weeks.json, src/engine/weeks.js; the author,
// 10.11.2026: „buffy i debuffy obszarowe tygodniowe dla każdego gracza w
// zależności jaki tydzień jest”): a slim line under the top bar of the
// Walka screen, „Tydzień Sarny · odpoczynek szybszy o 5% · do niedzieli”,
// and the sheet Tygodnie it opens: what the weeks are, this week, the next
// three and, folded, the whole year's list; and, on the character's first
// visit in a new week, a message naming it (the author: „tylko musi być
// jakaś informacja o takich obszarówkach dla gracza”). The character's view
// names the week and its dates (`week`), the content its name and its
// effects in words, in the page's language.

import { h, icon } from './dom.js';
import { language } from './i18n.js';
import { narratorIdle } from './narrator.js';
import { call, state } from './state.js';
import { foldPart, openSheet, toast } from './ui.js';

const entry = (number) => state.content?.weeks?.list.find((week) => week.number === number) ?? null;

// A text with its first letter capital, for a line of its own.
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// The days of a week on the Polish clock, as the weeks count them:
// "9 lis – 15 lis", in the page's language.
const dayFormats = new Map();
function days(week) {
  const lang = language();
  if (!dayFormats.has(lang)) dayFormats.set(lang, new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'pl-PL', { day: 'numeric', month: 'short', timeZone: 'Europe/Warsaw' }));
  const format = dayFormats.get(lang);
  return `${format.format(week.startsAt)} – ${format.format(week.endsAt - 1)}`;
}

// The line on the Walka screen, or nothing where the weeks are off.
export function weekLine(character = state.character) {
  const words = state.content?.weeks;
  const shown = character?.week && entry(character.week.number);
  if (!words || !shown) return null;
  return h(
    'button',
    { type: 'button', class: 'week-line', 'aria-haspopup': 'dialog', onClick: () => weeksSheet(character) },
    icon('calendar', { size: 18, className: 'week-line-icon' }),
    h(
      'span',
      { class: 'week-line-text' },
      h('strong', { class: 'week-line-name', text: shown.name }),
      ` · ${shown.effects.map((effect) => effect.text).join(', ')} · ${words.texts.until}`,
    ),
    icon('chevron', { size: 16, className: 'week-line-more' }),
  );
}

// A week's effects, one to a line, a malus marked.
const effectList = (shown) =>
  h(
    'ul',
    { class: 'week-effects' },
    shown.effects.map((effect) => h('li', { class: `week-effect${effect.malus ? ' week-effect--malus' : ''}`, text: capital(effect.text) })),
  );

// A week with its name, its days and its effects.
function weekCard(week, className) {
  const shown = entry(week.number);
  if (!shown) return null;
  return h(
    'li',
    { class: `week-card ${className}` },
    h('p', { class: 'week-card-head' }, h('strong', { class: 'week-card-name', text: shown.name }), h('span', { class: 'week-days', text: days(week) })),
    effectList(shown),
  );
}

// The sheet Tygodnie: at the top what the weeks are (every week of the
// year has its bonus for all, from Monday midnight Polish time, and an
// exploration or a work keeps the week it began in; the author: „tylko musi
// być jakaś informacja o takich obszarówkach dla gracza”), then this week,
// the next three and the whole year, folded, this week marked in it.
export function weeksSheet(character = state.character) {
  const words = state.content?.weeks;
  const week = character?.week;
  if (!words || !week) return;
  const { texts } = words;
  openSheet(
    h('h2', { class: 'sheet-title', text: texts.title }),
    h('div', { class: 'week-about' }, h('p', { class: 'sheet-text', text: texts.intro }), h('p', { class: 'sheet-text muted', text: texts.start })),
    h('p', { class: 'week-label', text: texts.now }),
    h('ul', { class: 'week-cards' }, weekCard(week, 'week-card--now')),
    h('p', { class: 'week-label', text: texts.next }),
    h(
      'ul',
      { class: 'week-cards' },
      week.next.map((one) => weekCard(one, 'week-card--next')),
    ),
    foldPart(
      { key: 'weeks-year', title: texts.year, open: false, className: 'week-year' },
      h(
        'ol',
        { class: 'week-year-list' },
        words.list.map((one) =>
          h(
            'li',
            { class: `week-year-row${one.number === week.number ? ' week-year-row--now' : ''}`, ...(one.number === week.number && { 'aria-current': 'date' }) },
            h('span', { class: 'week-year-number', text: `${one.number}.` }),
            h(
              'span',
              { class: 'week-year-text' },
              h('span', { class: 'week-year-name', text: one.name }),
              h('span', { class: 'week-year-effects', text: one.effects.map((effect) => effect.short).join(', ') }),
            ),
          ),
        ),
      ),
    ),
  );
}

// On the character's first visit in a new week (`week.notice`, from the
// server), once: the week and its effects in a short message, in the
// game's way of telling news, while nothing of the narrator's or another
// window waits ("Zaczął się Tydzień Sarny: odpoczynek szybszy o 5%."). The
// server keeps it told for the character, so it comes once a week.
let told = null;
export function offerWeekNotice() {
  const week = state.character?.week;
  const words = state.content?.weeks;
  const key = week && `${state.character.name}:${week.startsAt}`;
  if (!week?.notice || !words || told === key) return;
  if (document.querySelector('dialog[open]') || !document.querySelector('#toast')?.hidden) return;
  if (state.character.tutorial !== null && !narratorIdle()) return;
  const shown = entry(week.number);
  if (!shown) return;
  told = key;
  toast(words.texts.notice.replace('{week}', shown.name).replace('{effects}', shown.effects.map((effect) => effect.text).join(', ')));
  call('POST', '/api/character/week/seen').catch(() => {
    told = null;
  });
}

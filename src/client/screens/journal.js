// The journal: past reports of explorations and gatherings, and the history
// of System messages. Its texts are written in Polish and shown in the
// page's language (t(), i18n.js).

import { fill, h, icon } from '../dom.js';
import { dateTimeFormat, formatMinutes, formatNumber, timeFormat } from '../format.js';
import { language, t } from '../i18n.js';
import { call, serverNow } from '../state.js';
import { systemPanel } from '../ui.js';
import { workSummaryText } from './professions.js';

// The names below are shown through t(), as the page loads its English
// after this module.
const RESULT_NAMES = { success: 'sukces', fainted: 'omdlenie', escaped: 'odwrót' };
// A profession's work, by the kind of its report, and its chip.
const WORK_CHIPS = { herbs: 'zbieranie', potions: 'warzenie', items: 'wyrób', minerals: 'kopanie', jewels: 'szlifiernia' };

// The reports by day, under "Dziś", "Wczoraj" or the date, and a filter of
// their kinds, remembered on this device (the author: 317 A).
const FILTERS = [
  ['all', 'Wszystko'],
  ['hunts', 'Wyprawy'],
  ['towers', 'Wieże'],
  ['work', 'Profesje'],
];
const FILTER_KEY = 'insight.journalFilter';
const kindOf = (report) => (report.tower ? 'towers' : WORK_CHIPS[report.kind] ? 'work' : 'hunts');
const dayKey = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
// "6 listopada", or "6 November" in English, made once for each language.
const dayNames = new Map();
function dayName(ms) {
  const lang = language();
  if (!dayNames.has(lang)) dayNames.set(lang, new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'pl-PL', { day: 'numeric', month: 'long' }));
  return dayNames.get(lang).format(ms);
}

function dayHeading(ms) {
  const key = dayKey.format(ms);
  const now = serverNow();
  if (key === dayKey.format(now)) return t('Dziś');
  if (key === dayKey.format(now - 86400000)) return t('Wczoraj');
  return dayName(ms);
}

function loadFilter() {
  try {
    const kept = localStorage.getItem(FILTER_KEY);
    return FILTERS.some(([id]) => id === kept) ? kept : 'all';
  } catch {
    return 'all';
  }
}

export function mountJournal(container, { params }) {
  const tab = params.tab === 'system' ? 'system' : 'reports';
  let reports = null;
  let error = null;
  let filter = loadFilter();

  async function load() {
    try {
      reports = (await call('GET', '/api/reports')).reports;
    } catch (failure) {
      error = failure.message;
    }
    render();
  }

  function render() {
    fill(container,
      h('div', { class: 'page-heading' }, h('h1', { class: 'page-title', tabindex: '-1', text: t('Dziennik') })),
      h(
        'div',
        { class: 'segmented', role: 'group', 'aria-label': t('Część dziennika') },
        h('a', { class: 'segmented-option', href: '#/dziennik', 'aria-current': tab === 'reports' ? 'page' : undefined, text: t('Raporty') }),
        h('a', { class: 'segmented-option', href: '#/dziennik/system', 'aria-current': tab === 'system' ? 'page' : undefined, text: 'System' }),
      ),
      error ? systemPanel(error) : reports === null ? h('p', { class: 'muted', text: t('Wczytywanie…') }) : tab === 'reports' ? reportList() : systemList(),
    );
  }

  function reportList() {
    if (reports.length === 0) return h('p', { class: 'muted', text: t('Brak raportów. Wyrusz na pierwszą eksplorację w zakładce Walka.') });
    const shown = reports.filter((report) => filter === 'all' || kindOf(report) === filter);
    const filters = h(
      'div',
      { class: 'journal-filters', role: 'group', 'aria-label': t('Rodzaj raportów') },
      FILTERS.map(([id, label]) =>
        h('button', {
          type: 'button',
          class: 'journal-filter',
          'aria-pressed': String(id === filter),
          text: t(label),
          onClick: () => {
            filter = id;
            try {
              localStorage.setItem(FILTER_KEY, id);
            } catch {
              // Remembered for this visit only.
            }
            render();
          },
        }),
      ),
    );
    if (shown.length === 0) return [filters, h('p', { class: 'muted', text: t('Nie ma tu jeszcze takich raportów.') })];
    // The days in the order of the reports, newest first.
    const days = [];
    for (const report of shown) {
      const heading = dayHeading(report.createdAt);
      if (days.at(-1)?.heading !== heading) days.push({ heading, reports: [] });
      days.at(-1).reports.push(report);
    }
    return [filters, days.map((day) => [h('h2', { class: 'journal-day', text: day.heading }), reportRows(day.reports)])];
  }

  function reportRows(list) {
    return h(
      'ul',
      { class: 'report-list' },
      list.map((report) =>
        h(
          'li',
          {},
          h(
            'a',
            { class: 'report-row', href: `#/raport/${report.id}` },
            h(
              'span',
              { class: 'report-row-main' },
              h('span', {
                class: 'report-row-title',
                text: report.tower
                  ? t('{tower} · piętro {floor}', { tower: report.tower.name, floor: report.tower.floor })
                  : report.hall
                    ? t('Sala prób · {area}', { area: report.hall.areaName })
                    : `${report.areaName ?? report.regionName ?? report.placeName} · ${formatMinutes(report.minutes)}`,
              }),
              WORK_CHIPS[report.kind]
                ? h(
                    'span',
                    { class: 'report-row-meta' },
                    h('span', { class: `chip chip--${report.kind}`, text: t(WORK_CHIPS[report.kind]) }),
                    ` +${formatNumber(report.xp)} XP · ${report.professionName} ${report.professionLevel}`,
                  )
                : h(
                    'span',
                    { class: 'report-row-meta' },
                    h('span', {
                      class: `chip chip--${report.result}`,
                      // A floor of a Wieża is won or lost, not explored.
                      text: report.tower
                        ? report.result === 'success'
                          ? t('zdobyte')
                          : t('porażka')
                        : report.hall
                          ? report.result === 'success'
                            ? t('zdana')
                            : t('porażka')
                          : RESULT_NAMES[report.result]
                            ? t(RESULT_NAMES[report.result])
                            : report.result,
                    }),
                    // After a faint the exploration brought nothing (651 C), and cost XP.
                    report.forfeit
                      ? t(' −{xp} XP · łupy przepadły', { xp: formatNumber(report.penalty ?? 0) })
                      : t(' +{xp} XP · +{gold} złota', { xp: formatNumber(report.xp), gold: formatNumber(report.gold) }),
                  ),
              WORK_CHIPS[report.kind] && h('span', { class: 'report-row-herbs', text: workSummaryText(report) }),
              report.bestFind && h('span', { class: 'item-name', vars: { '--rarity': report.bestFind.color }, text: report.bestFind.name }),
            ),
            h('span', { class: 'report-row-date', text: timeFormat.format(new Date(report.createdAt)) }),
            icon('chevron', { size: 18 }),
          ),
        ),
      ),
    );
  }

  function systemList() {
    const messages = reports.flatMap((report) => (report.system ?? []).map((text) => ({ text, at: report.createdAt })));
    if (messages.length === 0) return h('p', { class: 'muted', text: t('System nie wysłał jeszcze żadnych komunikatów.') });
    return h(
      'ul',
      { class: 'system-history' },
      messages.map((message) =>
        h(
          'li',
          { class: 'system-history-item' },
          h('span', { class: 'system-history-date', text: dateTimeFormat.format(new Date(message.at)) }),
          h('span', { class: 'system-text', text: message.text }),
        ),
      ),
    );
  }

  render();
  load();
  return {};
}

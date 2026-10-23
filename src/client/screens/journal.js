// The journal: past hunt reports and the history of System messages.

import { fill, h, icon } from '../dom.js';
import { dateTimeFormat, formatMinutes, formatNumber } from '../format.js';
import { call } from '../state.js';
import { systemPanel } from '../ui.js';

const RESULT_NAMES = { success: 'sukces', fainted: 'omdlenie', escaped: 'odwrót' };

export function mountJournal(container, { params }) {
  const tab = params.tab === 'system' ? 'system' : 'reports';
  let reports = null;
  let error = null;

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
      h('div', { class: 'page-heading' }, h('h1', { class: 'page-title', tabindex: '-1', text: 'Dziennik' })),
      h(
        'div',
        { class: 'segmented', role: 'group', 'aria-label': 'Część dziennika' },
        h('a', { class: 'segmented-option', href: '#/dziennik', 'aria-current': tab === 'reports' ? 'page' : undefined, text: 'Raporty' }),
        h('a', { class: 'segmented-option', href: '#/dziennik/system', 'aria-current': tab === 'system' ? 'page' : undefined, text: 'System' }),
      ),
      error ? systemPanel(error) : reports === null ? h('p', { class: 'muted', text: 'Wczytywanie…' }) : tab === 'reports' ? reportList() : systemList(),
    );
  }

  function reportList() {
    if (reports.length === 0) return h('p', { class: 'muted', text: 'Brak raportów. Wyrusz na pierwszą eksplorację w zakładce Walka.' });
    return h(
      'ul',
      { class: 'report-list' },
      reports.map((report) =>
        h(
          'li',
          {},
          h(
            'a',
            { class: 'report-row', href: `#/raport/${report.id}` },
            h(
              'span',
              { class: 'report-row-main' },
              h('span', { class: 'report-row-title', text: `${report.regionName} · ${formatMinutes(report.minutes)}` }),
              h(
                'span',
                { class: 'report-row-meta' },
                h('span', { class: `chip chip--${report.result}`, text: RESULT_NAMES[report.result] ?? report.result }),
                ` +${formatNumber(report.xp)} XP · +${formatNumber(report.gold)} złota`,
              ),
              report.bestFind && h('span', { class: 'item-name', vars: { '--rarity': report.bestFind.color }, text: report.bestFind.name }),
            ),
            h('span', { class: 'report-row-date', text: dateTimeFormat.format(new Date(report.createdAt)) }),
            icon('chevron', { size: 18 }),
          ),
        ),
      ),
    );
  }

  function systemList() {
    const messages = reports.flatMap((report) => (report.system ?? []).map((text) => ({ text, at: report.createdAt })));
    if (messages.length === 0) return h('p', { class: 'muted', text: 'System nie wysłał jeszcze żadnych komunikatów.' });
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

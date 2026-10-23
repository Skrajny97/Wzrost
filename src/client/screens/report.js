// A hunt report: the summary at the top, the key fight played back below it,
// a short line for every other fight, the finds, and the full text account
// on request.

import { createArena } from '../arena.js';
import { fill, h, icon } from '../dom.js';
import { countOf, dateTimeFormat, formatMinutes, formatNumber, formatOffset } from '../format.js';
import { activityFinished, call, reportCache, state } from '../state.js';
import { openSheet, systemPanel, withButton } from '../ui.js';
import { itemDetails, itemSummary } from './character.js';

const RESULT_CLASS = { success: 'result--success', fainted: 'result--fainted', escaped: 'result--escaped' };

export function mountReport(container, { params, navigate }) {
  let arena = null;
  let report = reportCache.get(params.id) ?? null;
  const actionBox = h('div', { class: 'stack' });

  async function load() {
    try {
      const data = await call('GET', `/api/reports/${params.id}`);
      report = data.report;
      reportCache.set(params.id, report);
      render();
    } catch (error) {
      fill(container,
        h('div', { class: 'page-heading' }, h('h1', { class: 'page-title', tabindex: '-1', text: 'Raport' })),
        systemPanel(error.message),
      );
    }
  }

  function render() {
    arena?.stop();
    arena = null;
    if (!report) {
      fill(container, h('p', { class: 'muted', text: 'Wczytywanie raportu…' }));
      return;
    }
    arena = report.keyFight ? createArena(report.keyFight) : null;

    fill(container,
      h(
        'div',
        { class: 'page-heading' },
        h('h1', { class: 'page-title', tabindex: '-1', text: 'Raport z wyprawy' }),
        h('p', {
          class: 'page-subtitle',
          text: `${report.regionName} · ${formatMinutes(report.minutes)} · ${dateTimeFormat.format(new Date(report.endsAt))}`,
        }),
      ),
      summaryCard(report),
      report.system.length > 0 && systemPanel(...report.system),
      arena &&
        h(
          'section',
          { class: 'report-section', 'aria-labelledby': 'key-fight-title' },
          h('h2', { class: 'section-title', id: 'key-fight-title', text: 'Najważniejsza walka' }),
          arena.element,
        ),
      fightsSection(report),
      itemsSection(report),
      accountSection(report),
      actionBox,
    );
    renderActions();
  }

  function summaryCard(report) {
    const summary = report.summary;
    const rows = [
      ['Doświadczenie', `+${formatNumber(summary.xp)} XP`],
      summary.penalty > 0 && ['Kara za omdlenie', `−${formatNumber(summary.penalty)} XP`],
      ['Złoto', `+${formatNumber(summary.gold)}`],
      ['Walki', formatNumber(summary.fights)],
      ['HP', `${summary.hpStart} → ${summary.hpEnd} / ${summary.maxHp}`],
    ].filter(Boolean);
    return h(
      'section',
      { class: 'card report-summary', 'aria-label': 'Podsumowanie' },
      h('p', { class: `result ${RESULT_CLASS[report.result] ?? ''}`, text: report.resultText }),
      h(
        'dl',
        { class: 'status-list' },
        rows.map(([label, value]) => h('div', { class: 'status-row' }, h('dt', { text: label }), h('dd', { text: value }))),
        h(
          'div',
          { class: 'status-row' },
          h('dt', { text: 'Najlepsze znalezisko' }),
          h(
            'dd',
            {},
            summary.bestFind
              ? h('span', { class: 'item-name', vars: { '--rarity': summary.bestFind.color }, text: summary.bestFind.name })
              : 'brak',
          ),
        ),
      ),
    );
  }

  function fightsSection(report) {
    const others = (report.fights ?? []).filter((_, index) => index !== report.keyFight?.index);
    if (others.length === 0) return null;
    return h(
      'section',
      { class: 'report-section', 'aria-labelledby': 'fights-title' },
      h('h2', { class: 'section-title', id: 'fights-title', text: 'Pozostałe walki' }),
      h(
        'ul',
        { class: 'fight-list' },
        others.map((fight) =>
          h(
            'li',
            { class: `fight-item${fight.won === true ? '' : ' fight-item--lost'}` },
            h('span', { class: 'fight-time', text: formatOffset(fight.t) }),
            h(
              'span',
              { class: 'fight-enemies', text: fight.enemies.map((enemy) => `${enemy.name} (${enemy.level})`).join(', ') },
            ),
            h(
              'span',
              { class: 'fight-result', text: fight.won === true ? `+${fight.xp} XP · HP ${fight.hpBefore} → ${fight.hpAfter}` : 'przegrana' },
            ),
          ),
        ),
      ),
    );
  }

  function itemsSection(report) {
    if (report.items.length === 0) return null;
    return h(
      'section',
      { class: 'report-section', 'aria-labelledby': 'items-title' },
      h('h2', { class: 'section-title', id: 'items-title', text: `Łupy i znaleziska (${report.items.length})` }),
      h(
        'ul',
        { class: 'item-list' },
        report.items.map((item) =>
          h(
            'li',
            {},
            h(
              'button',
              {
                type: 'button',
                class: 'item-row',
                onClick: () =>
                  openSheet(
                    itemDetails(item),
                    h('p', { class: 'muted', text: 'Przedmiot jest w plecaku, chyba że go już wyrzucono.' }),
                    h('div', { class: 'sheet-actions' }, h('a', { class: 'button button--world', href: '#/postac', text: 'Przejdź do plecaka' })),
                  ),
              },
              itemSummary(item),
              icon('chevron', { size: 18 }),
            ),
          ),
        ),
      ),
    );
  }

  function accountSection(report) {
    const list = h(
      'ol',
      { class: 'account', hidden: true },
      report.entries.map((entry) => h('li', {}, h('span', { class: 'account-time', text: formatOffset(entry.t) }), h('span', { text: entry.text }))),
    );
    const toggle = h('button', {
      type: 'button',
      class: 'button button--world',
      'aria-expanded': false,
      text: `Pełna relacja (${countOf(report.entries.length, 'wpis', 'wpisy', 'wpisów')})`,
      onClick: () => {
        list.hidden = !list.hidden;
        toggle.setAttribute('aria-expanded', String(!list.hidden));
      },
    });
    return h('section', { class: 'report-section' }, toggle, list);
  }

  function renderActions() {
    const character = state.character;
    const idle = !character.activity;
    const again =
      idle &&
      character.huntDurations.includes(report.minutes) &&
      h('button', {
        type: 'button',
        class: 'button button--system',
        text: `Wyrusz ponownie: ${report.regionName}, ${formatMinutes(report.minutes)}`,
        onClick: (event) =>
          withButton(event.currentTarget, async () => {
            await call('POST', '/api/hunts', { regionId: report.regionId, minutes: report.minutes });
            navigate('#/walka');
          }),
      });
    const waiting = character.activity && activityFinished(character.activity);
    fill(actionBox,
      ...[
        again,
        waiting && h('a', { class: 'button button--system', href: '#/walka', text: 'Kolejny raport czeka na odbiór' }),
        h('a', { class: 'button button--world', href: '#/dziennik', text: 'Dziennik' }),
      ].filter(Boolean),
    );
  }

  render();
  if (!report) load();
  return {
    // A change of the character (e.g. a new hunt) only changes the buttons.
    update: () => {
      if (report) renderActions();
    },
    unmount: () => arena?.stop(),
  };
}

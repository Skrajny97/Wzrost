// The stats screen: levels, the eight stats with their source bars, free
// points (chosen here, sent together with "Zatwierdź") and combat values.

import { fill, h, icon } from '../dom.js';
import { formatDecimal, formatHours, formatNumber, formatPrecise, plural } from '../format.js';
import { call, isUnlocked, state, unlockInfo } from '../state.js';
import { confirmAction, systemPanel, withButton } from '../ui.js';

// Segments of the source bar; profession and Core segments appear once unlocked.
const SOURCES = [
  { id: 'class', label: 'klasa' },
  { id: 'character', label: 'postać' },
  { id: 'professions', label: 'profesje', unlock: 'professions' },
  { id: 'equipment', label: 'ekwipunek' },
  { id: 'core', label: 'Rdzeń', unlock: 'core' },
];

// How one more point shows in numbers. Chances and reductions grow by
// percentage points, shown simply as "%".
const EFFECTS = [
  { key: 'damage', label: 'obrażenia', format: (v) => `+${formatDecimal(v * 100)}%` },
  { key: 'maxHp', label: 'maks. HP', format: (v) => `+${formatNumber(v)}` },
  { key: 'regen', label: 'regeneracja', format: (v) => `+${formatPrecise(v)} HP/min` },
  { key: 'reduction', label: 'redukcja obrażeń', format: percentPoints },
  { key: 'dodge', label: 'unik', format: percentPoints },
  { key: 'crit', label: 'trafienie krytyczne', format: percentPoints },
  { key: 'effectResist', label: 'odporność na efekty', format: percentPoints },
  { key: 'speed', label: 'szybkość', format: (v) => `+${formatPrecise(v)}` },
  { key: 'recovery', label: 'odzysk HP po walce', format: percentPoints },
  { key: 'mana', label: 'maks. mana', format: (v) => `+${formatNumber(v)}` },
];

function percentPoints(value) {
  return `+${formatPrecise(value * 100)}%`;
}

export function mountStats(container) {
  // Points chosen with "+" but not sent yet, and which stat rows are open.
  let pending = {};
  const open = new Set();

  function render() {
    const character = state.character;
    if (!isUnlocked('stats')) {
      fill(container,
        h('div', { class: 'page-heading' }, h('h1', { class: 'page-title', tabindex: '-1', text: 'Statystyki' })),
        systemPanel(`Ekran statystyk i wolne punkty odblokują się na poziomie ${unlockInfo('stats').level}.`),
      );
      return;
    }

    const pendingTotal = Object.values(pending).reduce((sum, value) => sum + value, 0);
    const free = character.freePoints - pendingTotal;
    const busy = Boolean(character.activity);
    const sources = SOURCES.filter((source) => !source.unlock || isUnlocked(source.unlock));
    const widest = Math.max(1, ...character.stats.map((stat) => stat.total + (pending[stat.id] ?? 0)));

    fill(container,
      h(
        'div',
        { class: 'title-row' },
        h('h1', { class: 'page-title', tabindex: '-1', text: 'Statystyki' }),
        h('span', { class: `badge badge--system badge--tall${free > 0 ? ' badge--ready' : ''}`, text: `WOLNE PUNKTY: ${formatNumber(free)}` }),
      ),
      levelsCard(character),
      busy && systemPanel('Postać jest na wyprawie. Punkty rozdzielisz po jej powrocie.'),
      actions(character, busy, pendingTotal),
      h(
        'div',
        { class: 'legend', 'aria-hidden': 'true' },
        sources.map((source) =>
          h('span', { class: 'legend-item' }, h('span', { class: `swatch swatch--${source.id}` }), source.label),
        ),
      ),
      h(
        'section',
        { class: 'stat-list', 'aria-label': 'Atrybuty' },
        character.stats.map((stat) => statRow(stat, sources, widest, free > 0 && !busy)),
      ),
      combatValues(character),
      pendingTotal > 0 && pendingBar(pendingTotal),
    );
  }

  // Before the first evolution, after it, or the class waiting at it for
  // its skills (evolutionBlock in the engine).
  function evolutionHint(character, evolution) {
    if (character.classLevel < evolution) return `PIERWSZA EWOLUCJA: POZ. KLASY ${evolution}`;
    const need = character.skills?.evolution?.need;
    if (need === 'second_path') return 'KLASA CZEKA: WYBIERZ ŚCIEŻKĘ POBOCZNĄ';
    if (need === 'skill_points') return 'KLASA CZEKA: ROZDAJ PUNKTY UMIEJĘTNOŚCI';
    return 'EWOLUCJA KLASY: WKRÓTCE';
  }

  function levelsCard(character) {
    const evolution = state.content.classEvolutionLevels[0];
    const professions = unlockInfo('professions');
    return h(
      'section',
      { class: 'card levels', 'aria-label': 'Poziomy' },
      levelRow('Poziom postaci', character.level, character.xp, character.xpToNext, 'level',
        `DO POZ. ${character.level + 1}: OK. ${formatHours(character.hoursToNext).toUpperCase()} EKSPLORACJI`),
      levelRow(`Klasa · ${character.className}`, character.classLevel, character.classXp, character.classXpToNext, 'class', evolutionHint(character, evolution)),
      h(
        'div',
        { class: 'level-professions' },
        h('span', { text: 'Profesje' }),
        isUnlocked('professions')
          ? h('span', { class: 'chip chip--dashed', text: 'wkrótce' })
          : h('span', { class: 'chip chip--dashed', text: `od poz. ${professions.level}` }),
      ),
    );
  }

  function levelRow(label, level, xp, toNext, kind, note) {
    const fill = h('div', { class: `bar-fill bar-fill--${kind}` });
    fill.style.width = `${Math.min(100, (xp / toNext) * 100)}%`;
    return h(
      'div',
      { class: 'level-block' },
      h('div', { class: 'level-row' }, h('span', { text: label }), h('span', { class: 'num', text: level })),
      h('div', { class: 'bar', role: 'img', 'aria-label': `${formatNumber(xp)} z ${formatNumber(toNext)} XP` }, fill),
      h('div', { class: 'level-note' }, h('span', { text: note }), h('span', { text: `${formatNumber(xp)} / ${formatNumber(toNext)} XP` })),
    );
  }

  function actions(character, busy, pendingTotal) {
    const auto = h('button', {
      type: 'button',
      class: 'button button--world button--small',
      'data-guide': 'auto-points',
      disabled: busy || character.freePoints === 0,
      text: 'Rozdaj według klasy',
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          pending = {};
          await call('POST', '/api/character/points/auto');
        }),
    });
    const reset = character.canResetPoints
      ? h('button', {
          type: 'button',
          class: 'button button--world button--small',
          disabled: busy,
          text: 'Wyzeruj punkty',
          onClick: async (event) => {
            const button = event.currentTarget;
            const sure = await confirmAction({
              title: 'Wyzerować punkty?',
              text: `Wszystkie rozdane punkty wrócą do puli. Do poziomu ${state.content.freeResetMaxLevel} zerowanie jest darmowe.`,
              confirmLabel: 'Wyzeruj',
            });
            if (sure) {
              await withButton(button, async () => {
                pending = {};
                await call('POST', '/api/character/points/reset');
              });
            }
          },
        })
      : null;
    if (character.freePoints === 0 && !reset && pendingTotal === 0) return null;
    return h('div', { class: 'stat-actions' }, auto, reset);
  }

  function statRow(stat, sources, widest, canAdd) {
    const extra = pending[stat.id] ?? 0;
    const isOpen = open.has(stat.id);
    const segments = sources.map((source) => {
      const value = stat.sources[source.id] + (source.id === 'character' ? extra : 0);
      const segment = h('span', { class: `segment segment--${source.id}` });
      segment.style.width = `${(value / widest) * 100}%`;
      return segment;
    });
    const detailId = `stat-detail-${stat.id}`;
    const toggle = h(
      'button',
      {
        type: 'button',
        class: 'stat-main',
        'aria-expanded': isOpen,
        'aria-controls': detailId,
        onClick: () => {
          if (open.has(stat.id)) open.delete(stat.id);
          else open.add(stat.id);
          render();
        },
      },
      h(
        'span',
        { class: 'stat-head' },
        h('span', { class: 'stat-name', text: stat.name }),
        h(
          'span',
          { class: 'stat-total' },
          extra > 0 && h('span', { class: 'stat-extra', text: `+${extra}` }),
          formatNumber(stat.total + extra),
        ),
      ),
      h('span', { class: 'stat-effect', text: stat.effect }),
      h('span', { class: 'source-bar', 'aria-hidden': 'true' }, segments),
    );
    const add = canAdd
      ? h(
          'button',
          {
            type: 'button',
            class: 'stat-add',
            'aria-label': `Dodaj punkt: ${stat.name}`,
            onClick: () => {
              pending = { ...pending, [stat.id]: extra + 1 };
              render();
            },
          },
          icon('plus', { size: 18 }),
        )
      : h('span', { class: 'stat-add-space' });

    return h(
      'div',
      { class: 'stat-row' },
      h('div', { class: 'stat-line' }, toggle, add),
      isOpen && statDetail(stat, sources, detailId),
    );
  }

  function statDetail(stat, sources, id) {
    const effects = EFFECTS.filter((effect) => stat.perPoint[effect.key] !== undefined);
    return h(
      'div',
      { class: 'stat-detail', id },
      h(
        'p',
        { class: 'stat-detail-title' },
        effects.length > 0 ? 'Jeden punkt więcej:' : 'Jeden punkt więcej nie zmieni dziś Twoich wartości bojowych.',
      ),
      effects.length > 0 &&
        h(
          'ul',
          { class: 'stat-detail-list' },
          effects.map((effect) => h('li', {}, h('span', { text: effect.label }), h('span', { class: 'num', text: effect.format(stat.perPoint[effect.key]) }))),
        ),
      h(
        'p',
        { class: 'stat-detail-sources' },
        sources.map((source) => `${source.label} ${formatNumber(stat.sources[source.id])}`).join(' · '),
      ),
    );
  }

  function combatValues(character) {
    const values = [
      ['Obrażenia', character.combat.damage, character.combat.damageKind],
      ['Redukcja obrażeń', `${character.combat.reduction}%`, 'fizycznych'],
      ['Maks. HP', formatNumber(character.combat.maxHp), null],
    ];
    return h(
      'section',
      { class: 'combat-values', 'aria-labelledby': 'combat-values-title' },
      h('h2', { class: 'section-title', id: 'combat-values-title', text: 'Wartości bojowe' }),
      h(
        'div',
        { class: 'value-grid' },
        values.map(([label, value, note]) =>
          h(
            'div',
            { class: 'value-card' },
            h('span', { class: 'value-label', text: label }),
            h('span', { class: 'value-number', text: value }),
            note && h('span', { class: 'value-note', text: note }),
          ),
        ),
      ),
    );
  }

  function pendingBar(total) {
    const confirm = h('button', {
      type: 'button',
      class: 'button button--system button--small',
      text: 'Zatwierdź',
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          const points = pending;
          await call('POST', '/api/character/points', { points });
          pending = {};
          render();
        }),
    });
    return h(
      'div',
      { class: 'pending-bar', role: 'region', 'aria-label': 'Rozdane punkty' },
      h('span', { class: 'pending-text', text: `Wybrano ${formatNumber(total)} ${plural(total, 'punkt', 'punkty', 'punktów')}` }),
      h('button', {
        type: 'button',
        class: 'button button--world button--small',
        text: 'Cofnij',
        onClick: () => {
          pending = {};
          render();
        },
      }),
      confirm,
    );
  }

  render();
  return {
    update: () => {
      // Points the server no longer has room for are dropped.
      const total = Object.values(pending).reduce((sum, value) => sum + value, 0);
      if (total > state.character.freePoints || state.character.activity) pending = {};
      render();
    },
  };
}

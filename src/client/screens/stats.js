// The stats screen: levels, the eight stats with their source bars, free
// points (chosen here, sent together with "Zatwierdź") and combat values,
// with the Parametry dodatkowe window behind them.

import { fill, h, icon } from '../dom.js';
import { formatDecimal, formatHours, formatNumber, formatPrecise, plural } from '../format.js';
import { call, isUnlocked, state, unlockInfo } from '../state.js';
import { confirmAction, openSheet, systemPanel, withButton } from '../ui.js';

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

const percent = (value) => `${formatDecimal(value * 100)}%`;

// Parametry dodatkowe (the author, after a player asked whether the total
// armour shows anywhere: "Mozna zbudować jakies okno w statystykach
// <Parametry dodatkowe>"): a window with the numbers behind the combat
// values, for those who like them. Each row is a name, its value and a note
// on where it comes from or what it does.
function openExtra(character) {
  const extra = character.combat.extra;
  const { armor, dodge, crit, effectResist } = extra;
  const row = (label, value, ...notes) =>
    h(
      'div',
      { class: 'extra-row' },
      h('dt', { text: label }),
      h('dd', { class: 'num', text: value }),
      notes.filter(Boolean).map((note) => h('dd', { class: 'extra-note', text: note })),
    );
  const rating = (value, stat, cap) => `ocena ${formatNumber(value)} (${stat}), najwyżej ${percent(cap)}`;
  const group = (title, ...rows) => [h('h3', { class: 'extra-title', text: title }), h('dl', { class: 'extra-list' }, rows)];
  const armorFrom = [
    `ekwipunek ${formatNumber(armor.equipment)}`,
    `Wytrzymałość ${formatNumber(armor.endurance)}`,
    armor.trait && `cecha ${armor.trait.name} +${formatDecimal(armor.trait.share * 100)}%`,
  ].filter(Boolean);
  openSheet(
    h('h2', { class: 'sheet-title', text: 'Parametry dodatkowe' }),
    h('p', {
      class: 'muted extra-intro',
      text: `Procenty liczą się przeciw przeciwnikowi na Twoim poziomie (${formatNumber(extra.level)}). Silniejszy przeciwnik je zmniejsza, a słabszy zwiększa.`,
    }),
    group(
      'Obrona',
      row('Pancerz', formatNumber(armor.total), armorFrom.join(' · '), `redukcja obrażeń fizycznych ${percent(armor.reduction)}`),
      row('Unik', percent(dodge.chance), rating(dodge.rating, 'Zręczność', dodge.cap)),
      row('Odporność na efekty', percent(effectResist.chance), rating(effectResist.rating, 'Wola', effectResist.cap)),
    ),
    group(
      'Atak',
      row('Trafienie krytyczne', percent(crit.chance), rating(crit.rating, 'Percepcja', crit.cap)),
      row('Mnożnik krytyka', `×${formatPrecise(crit.multiplier)}`, 'tyle razy mocniej uderza cios krytyczny'),
      row('Szybkość', formatPrecise(extra.speed), 'im wyższa, tym częściej postać rusza się w walce (Zręczność)'),
    ),
    group(
      'Zdrowie',
      row('Regeneracja', `${formatPrecise(extra.regen)} HP/min`, 'między wyprawami, z premią Ogniska'),
      row('Odzysk HP po walce', percent(Math.min(1, extra.recovery)), 'tyle brakującego HP wraca po każdej walce na wyprawie'),
    ),
    group(
      'Odporności na żywioły',
      extra.resist.map((element) =>
        row(
          element.name[0].toUpperCase() + element.name.slice(1),
          percent(element.reduction),
          `odporność ${formatNumber(element.rating)}`,
          element.shelter > 0 && `cecha: o ${formatDecimal(element.shelter * 100)}% mniej obrażeń`,
        ),
      ),
    ),
  );
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
    // Only an exploration counts its fights with the points (hunts.js).
    const busy = character.activity?.kind === 'hunt';
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

  // Before the first evolution, the class waiting at it for its skills or
  // the choice (evolutionBlock in the engine), or the evolution taken. The
  // engine names what the skills will still need at the evolution's level,
  // counting the points of the levels to come, so the class waits only once
  // it stands at that level (as on the Umiejętności screen); before, the
  // hint shows where the evolution is.
  function evolutionHint(character, evolution) {
    const { need, level = evolution } = character.skills?.evolution ?? {};
    if (need === 'skill_points' && character.classLevel >= level) return 'KLASA CZEKA: ROZDAJ PUNKTY UMIEJĘTNOŚCI';
    if (character.evolution?.current) return `EWOLUCJA: ${character.className.toUpperCase()}`;
    if (character.classLevel < evolution) return `PIERWSZA EWOLUCJA: POZ. KLASY ${evolution}`;
    if (need === 'second_path') return 'KLASA CZEKA: WYBIERZ ŚCIEŻKĘ POBOCZNĄ';
    // Where the deployment has the evolutions off (the live game), they are
    // still to come.
    if (!unlockInfo('evolution')) return 'EWOLUCJA KLASY: WKRÓTCE';
    return need === 'evolve' ? 'KLASA CZEKA: WYBIERZ EWOLUCJĘ' : 'WYBIERZ EWOLUCJĘ KLASY';
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
        // The professions with work, and their levels; "wkrótce" while hidden.
        // Three long names go to a second line on a narrow phone.
        h(
          'span',
          { class: 'level-profession-chips' },
          character.professions
            ? character.professions.list
                .filter((profession) => !profession.soon)
                .map((profession) => h('span', { class: 'chip', text: `${profession.name} ${profession.level}` }))
            : isUnlocked('professions')
              ? h('span', { class: 'chip chip--dashed', text: 'wkrótce' })
              : h('span', { class: 'chip chip--dashed', text: `od poz. ${professions.level}` }),
        ),
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
      // Both grow with every character level, also without points (the
      // author: "Niech poziom Many i Zdrowia rośnie u każdej postaci
      // również bez zwiększania statystyk").
      ['Maks. HP', formatNumber(character.combat.maxHp), `+${formatNumber(character.combat.perClassLevel.hp)} z każdym poziomem klasy`],
      ['Maks. mana', formatNumber(character.combat.maxMana), `+${formatNumber(character.combat.perClassLevel.mana)} z każdym poziomem klasy`],
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
      character.combat.extra &&
        h('button', {
          type: 'button',
          class: 'button button--world button--small combat-extra',
          text: 'Parametry dodatkowe',
          onClick: () => openExtra(character),
        }),
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
      if (total > state.character.freePoints || state.character.activity?.kind === 'hunt') pending = {};
      render();
    },
  };
}

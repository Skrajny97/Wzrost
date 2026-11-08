// The Umiejętności tab: at class level 10 the character picks one of the
// three skills of its class for its first Skill Point, for good: its main
// development path. From the next class level it may add a second one for a
// Skill Point, which closes the path left. Each path's name stands over its
// skill. Each class level from 10 to 49 brings a Skill Point, and the points
// raise the learned skills, up to level 20. Both paths and the points are due
// by the first evolution (class level 50): until then the class waits there,
// and then for the evolution chosen of the two paths in the Ewolucja tab
// (screens/evolution.js). After it this tab holds the evolution's two
// skills, up to level 45, and after the second form (class level 100) the
// form's two, up to level 95.
// The server sends every card ready to show (skillsView in the engine); a tap
// on a learned skill opens its card. The narrator's tour of the tab
// (narrator.js) points at the places marked data-guide.

import { fill, h } from '../dom.js';
import { countOf, formatNumber, plural } from '../format.js';
import { t } from '../i18n.js';
import { skillSprite } from '../art.js';
import { motionOn } from '../motion.js';
import { buildLocked, buildLockedText, call, isUnlocked, state, unlockInfo } from '../state.js';
import { closeSheet, confirmAction, openSheet, systemPanel, toast, withButton } from '../ui.js';

// The skill's icon: its sprite (a second form's skill: its stand-in,
// art.js), that of the skill it grew from while an evolution's has none of
// its own, or its first letter.
const skillIcon = (skill, size = 'large') =>
  h(
    'span',
    { class: `skill-icon skill-icon--${size}`, 'aria-hidden': 'true' },
    skillSprite(skill.id) ?? (skill.from && skillSprite(skill.from)) ?? h('span', { class: 'skill-letter', text: skill.name[0] }),
  );

const levelText = (skill) => t('Poziom {level} / {max}', { level: skill.level, max: skill.maxLevel });
// How many points the card's second button adds at once.
const RAISE_MANY = 10;
const skillPoints = (count) => countOf(count, 'Punkt Umiejętności', 'Punkty Umiejętności', 'Punktów Umiejętności');

// What stands before a path's name, by its state (skillsView), in Polish
// and shown in the page's language (t(), i18n.js).
const PATH_LABELS = { main: 'Ścieżka główna', second: 'Ścieżka poboczna', closed: 'Ścieżka zamknięta' };

// The main path on top, the side path under it, the paths still open in
// their order, and a closed one at the bottom.
const PATH_ORDER = { main: 0, second: 1, closed: 3 };

// What the class waits for at an evolution level, by the reason's code (t()).
const WAITS_FOR = { second_path: 'wybierzesz ścieżkę poboczną', skill_points: 'rozdasz Punkty Umiejętności', evolve: 'w zakładce Ewolucja wybierzesz ewolucję' };

export function mountSkills(container) {
  function render() {
    const character = state.character;
    const view = character.skills;
    const heading = h(
      'div',
      { class: 'title-row' },
      h('h1', { class: 'page-title', tabindex: '-1', text: t('Umiejętności') }),
      view &&
        isUnlocked('skills') &&
        h('span', { class: `badge badge--system badge--tall${view.points > 0 ? ' badge--ready' : ''}`, 'data-guide': 'skills-points', text: t('PUNKTY: {count}', { count: formatNumber(view.points) }) }),
    );
    if (!view || !isUnlocked('skills')) {
      const unlock = unlockInfo('skills');
      fill(container, heading, systemPanel(t('Umiejętności odblokujesz na poziomie klasy {level}. Twój poziom klasy: {own}.', { level: unlock.classLevel, own: character.classLevel })));
      return;
    }
    // Only an exploration counts its fights with the skills (hunts.js), and
    // a mercenary goes as it is (mercenaries.js).
    const busy = buildLocked(character);
    const evolution = view.evolution ?? {};
    const waiting = evolution.need && character.classLevel >= evolution.level;
    const before = pathTops();
    fill(
      container,
      heading,
      waiting &&
        systemPanel(
          t('Klasa czeka na {level}. poziomie, u progu ewolucji. Urośnie dalej, gdy {need}. Zdobyte XP klasy nie przepada.', { level: evolution.level, need: t(WAITS_FOR[evolution.need]) }),
        ),
      busy && systemPanel(buildLockedText(character, t('Umiejętności zmienisz'))),
      evolution.need === 'evolve' && character.classLevel >= evolution.level && h('a', { class: 'button button--system', href: '#/postac/ewolucja', text: t('Przejdź do Ewolucji') }),
      view.pools.map((pool) => (pool.evolution ? evolutionPool(pool, view, busy) : poolSection(pool, view, busy))),
    );
    slidePaths(before);
  }

  // The evolution's two skills, with the points to share between them.
  function evolutionPool(pool, view, busy) {
    const raisable = pool.options.some((skill) => skill.level < skill.maxLevel);
    return h(
      'section',
      { class: 'skill-paths', 'aria-label': t('Umiejętności ewolucji') },
      view.points > 0 &&
        raisable &&
        systemPanel(t('Masz {points}. Wybierz umiejętność ewolucji, żeby dodać punkt. Każdy poziom klasy do {level}. daje jeden.', { points: skillPoints(view.points), level: view.lastPointLevel })),
      pool.options.map((skill) =>
        h(
          'section',
          { class: `skill-path skill-path--${skill.state}`, 'data-skill': skill.id, 'aria-label': t('Umiejętność ewolucji: {name}', { name: skill.name }) },
          h('h2', { class: 'skill-path-title' }, h('span', { class: 'skill-path-label', text: t('Umiejętność ewolucji') }), h('span', { class: 'skill-path-name', text: skill.path })),
          learnedRow(skill, view, busy),
        ),
      ),
    );
  }

  // Where each path stands on the page, by its skill.
  const pathTops = () => new Map([...container.querySelectorAll('.skill-path')].map((node) => [node.dataset.skill, node.getBoundingClientRect().top]));

  // A path that moved since `before`, like the main one going to the top or
  // a closed one to the bottom, slides from its old place to the new one.
  function slidePaths(before) {
    if (!motionOn()) return;
    for (const [skillId, top] of pathTops()) {
      const shift = (before.get(skillId) ?? top) - top;
      if (Math.abs(shift) < 1) continue;
      container.querySelector(`.skill-path[data-skill="${skillId}"]`).animate([{ transform: `translateY(${shift}px)` }, { transform: 'none' }], { duration: 700, easing: 'ease-in-out' });
    }
  }

  // A milestone's three paths, each with its name over its skill.
  function poolSection(pool, view, busy) {
    if (!pool.open) {
      return h('section', { class: 'card skills-locked' }, h('p', { class: 'muted', text: t('Kolejny wybór umiejętności: od poziomu klasy {level}.', { level: pool.classLevel }) }));
    }
    const known = pool.chosen.length;
    const raisable = pool.options.some((skill) => skill.level > 0 && skill.level < skill.maxLevel);
    const secondOpen = known > 0 && known < view.paths;
    const secondNow = secondOpen && state.character.classLevel >= view.secondLevel;
    const intro =
      known === 0
        ? t(
            'Od {level}. poziomu wzrost poziomu klasy pozwala Ci uzyskać 1 Punkt Umiejętności. Każda umiejętność otwiera jedną ze ścieżek rozwoju. Ale ostrożnie! Możesz otworzyć tylko dwie ścieżki – a one będą miały istotny wpływ na Twoje dalsze losy.',
            { level: pool.classLevel },
          )
        : secondNow && view.points > 0
          ? t('Masz {points}. Dodaj punkt do znanej umiejętności albo wybierz ścieżkę poboczną. Ostatnia ścieżka się wtedy zamknie.', { points: skillPoints(view.points) })
          : secondNow
            ? t('Ścieżkę poboczną wybierzesz za 1 Punkt Umiejętności, a każdy poziom klasy daje jeden. Ostatnia ścieżka się wtedy zamknie.')
            : secondOpen
              ? t('Ścieżkę poboczną dobierzesz od poziomu klasy {level} za 1 Punkt Umiejętności. Wtedy ostatnia ścieżka się zamknie.', { level: view.secondLevel })
              : null;
    // The deadline, while the second path is open and the class not yet
    // waiting for it.
    const evolutionLevel = view.evolution?.level;
    const deadline =
      secondOpen &&
      evolutionLevel &&
      state.character.classLevel < evolutionLevel &&
      t('Ścieżkę poboczną wybierz najpóźniej na {level}. poziomie klasy, przed ewolucją.', { level: evolutionLevel });
    // Points to spend, told unless the line above already tells them.
    const pointsNote = known > 0 && view.points > 0 && raisable && !(secondNow && view.points > 0);
    const panel = intro && systemPanel(deadline ? `${intro} ${deadline}` : intro);
    // Before the first choice the narrator points at the System's words.
    if (panel && known === 0) panel.dataset.guide = 'skills-intro';
    return h(
      'section',
      { class: 'skill-paths', 'aria-label': t('Ścieżki rozwoju') },
      panel,
      pointsNote && systemPanel(t('Masz {points}. Wybierz umiejętność, żeby dodać punkt.', { points: skillPoints(view.points) })),
      [...pool.options].sort((a, b) => (PATH_ORDER[a.state] ?? 2) - (PATH_ORDER[b.state] ?? 2)).map((skill) => pathSection(skill, pool, view, busy)),
    );
  }

  function pathSection(skill, pool, view, busy) {
    const learned = skill.state === 'main' || skill.state === 'second';
    return h(
      'section',
      { class: `skill-path skill-path--${skill.state}`, 'data-skill': skill.id, 'data-guide': 'skills-path', 'aria-label': `${t(PATH_LABELS[skill.state] ?? 'Ścieżka')}: ${skill.path}` },
      h(
        'h2',
        { class: 'skill-path-title' },
        h('span', { class: 'skill-path-label', text: t(PATH_LABELS[skill.state] ?? 'Ścieżka') }),
        h('span', { class: 'skill-path-name', text: skill.path }),
      ),
      learned ? learnedRow(skill, view, busy) : skill.state === 'closed' ? closedRow(skill) : choiceCard(skill, pool, view, busy),
    );
  }

  // A path still open: the skill's card in words and its button. Each path
  // takes a Skill Point, the main one too.
  function choiceCard(skill, pool, view, busy) {
    const second = pool.chosen.length > 0;
    const label =
      skill.state === 'pick'
        ? second
          ? t('Wybierz jako poboczną · 1 punkt')
          : t('Wybierz · 1 punkt')
        : skill.state === 'soon'
          ? t('Od poziomu klasy {level}', { level: view.secondLevel })
          : t('Potrzebny 1 Punkt Umiejętności');
    return h(
      'article',
      { class: 'card skill-card', 'aria-label': skill.name },
      h('div', { class: 'skill-head' }, skillIcon(skill), h('div', {}, h('h3', { class: 'skill-name', text: skill.name }), h('p', { class: 'skill-style', text: skill.style }))),
      h('p', { class: 'skill-description', text: skill.description }),
      h('p', { class: 'skill-effect', text: skill.effect }),
      h('p', { class: 'skill-cost', text: skill.cost }),
      h('button', {
        type: 'button',
        class: 'button button--system',
        disabled: busy || skill.state !== 'pick',
        text: label,
        onClick: (event) => choose(event.currentTarget, skill, pool),
      }),
    );
  }

  async function choose(button, skill, pool) {
    const second = pool.chosen.length > 0;
    const { secondLevel } = state.character.skills;
    const left = pool.options.find((other) => other.id !== skill.id && other.state !== 'main' && other.state !== 'second');
    const sure = await confirmAction(
      second
        ? {
            title: t('Ścieżka poboczna: {path}?', { path: skill.path }),
            text: t('{skill} kosztuje 1 Punkt Umiejętności. Ścieżka {path} zamknie się na stałe.', { skill: skill.name, path: left?.path ?? '' }),
            confirmLabel: t('Wybieram'),
          }
        : {
            title: t('Ścieżka główna: {path}?', { path: skill.path }),
            text: t('{skill} kosztuje 1 Punkt Umiejętności. To wybór na stałe. {then}', {
              skill: skill.name,
              then:
                state.character.classLevel >= secondLevel
                  ? t('Ścieżkę poboczną możesz dobrać od razu, za kolejny Punkt Umiejętności.')
                  : t('Ścieżkę poboczną dobierzesz od poziomu klasy {level}.', { level: secondLevel }),
            }),
            confirmLabel: t('Wybieram'),
          },
    );
    if (!sure) return;
    await withButton(button, async () => {
      await call('POST', '/api/skills/learn', { skillId: skill.id });
      toast(t('Nowa umiejętność: {skill}. Ścieżka: {path}.', { skill: skill.name, path: skill.path }));
    });
  }

  // A learned skill: its icon, name and level; a tap opens its card.
  function learnedRow(skill, view, busy) {
    const ready = view.points > 0 && skill.level < skill.maxLevel;
    return h(
      'button',
      { type: 'button', class: `skill-row${ready ? ' skill-row--ready' : ''}`, onClick: () => openCard(skill.id, busy) },
      skillIcon(skill, 'row'),
      h('span', { class: 'skill-row-text' }, h('span', { class: 'skill-row-name', text: skill.name }), h('span', { class: 'skill-style', text: skill.style })),
      h('span', { class: 'skill-row-level', text: `${skill.level}/${skill.maxLevel}` }),
    );
  }

  // A closed path: its skill, dimmed, without a button.
  function closedRow(skill) {
    return h(
      'div',
      { class: 'skill-row skill-row--closed' },
      skillIcon(skill, 'row'),
      h('span', { class: 'skill-row-text' }, h('span', { class: 'skill-row-name', text: skill.name }), h('span', { class: 'skill-style', text: skill.style })),
    );
  }

  // The card of a learned skill: what it does now and at the next level,
  // "Dodaj punkt" while there are points and levels left, and, while there
  // are two of each or more, a slider for many at once (after an evolution
  // a character has dozens of points to spend): from 2 to as many as there
  // are points and levels left, at ten where it can, with "−" and "+" by one
  // (held down on and on, hold.js) and "Dodaj N Punktów" (the author,
  // 8.11.2026: "dodaj suwak do rozdawania punktów klas, jeśli ktoś chce
  // ręcznie"; before, a button for ten, 514).
  function openCard(skillId, busy) {
    const view = state.character.skills;
    const skill = view.pools.flatMap((pool) => pool.options).find((option) => option.id === skillId);
    if (!skill) return;
    const raiseButton = (count, text) =>
      h('button', {
        type: 'button',
        class: 'button button--system',
        disabled: busy || view.points < count || skill.maxLevel - skill.level < count,
        text,
        onClick: (event) =>
          withButton(event.currentTarget, async () => {
            await call('POST', '/api/skills/raise', { skillId, count });
            openCard(skillId, buildLocked(state.character));
          }),
      });
    const raise = raiseButton(1, t('Dodaj punkt'));
    const most = Math.min(view.points, skill.maxLevel - skill.level);
    const raiseMany = most >= 2 && manySlider(most, raiseButton);
    openSheet(
      h('div', { class: 'skill-head' }, skillIcon(skill), h('div', {}, h('h2', { class: 'sheet-title', text: skill.name }), h('p', { class: 'skill-style', text: `${skill.style} · ${levelText(skill)}` }))),
      h('p', { class: 'skill-description', text: skill.description }),
      h('h3', { class: 'skill-subtitle', text: skill.level > 0 ? t('Teraz') : t('Na poziomie {level}', { level: 1 }) }),
      h('p', { class: 'skill-effect', text: skill.effect }),
      skill.next && h('h3', { class: 'skill-subtitle', text: t('Na poziomie {level}', { level: skill.level + 1 }) }),
      skill.next && h('p', { class: 'skill-effect skill-effect--next', text: skill.next }),
      h('p', { class: 'skill-cost', text: skill.cost }),
      h('p', { class: 'muted', text: t('Punkty Umiejętności: {count}. Każdy poziom klasy do {level}. daje jeden.', { count: formatNumber(view.points), level: view.lastPointLevel }) }),
      h('p', {
        class: 'muted',
        text: state.character.evolution?.current ? t('Umiejętność ewolucji: {path}.', { path: skill.path }) : t('Ścieżka: {path}. Zdecyduje o ewolucji klasy.', { path: skill.path }),
      }),
      raiseMany,
      h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--world', onClick: closeSheet, text: t('Zamknij') }), raise),
    );
  }

  // The slider for many points at once on a skill's card (openCard).
  function manySlider(most, raiseButton) {
    let count = Math.min(RAISE_MANY, most);
    const holder = h('div', { class: 'sheet-actions' });
    const slider = h('input', {
      type: 'range',
      class: 'duration-slider manual-slider',
      min: 2,
      max: most,
      step: 1,
      'aria-label': t('Ile Punktów Umiejętności dodać'),
      onInput: () => set(Number(slider.value)),
    });
    const step = (sign, label) => h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': label, text: sign < 0 ? '−' : '+', onClick: () => set(count + sign) });
    const less = step(-1, t('O punkt mniej'));
    const more = step(1, t('O punkt więcej'));
    function set(next) {
      count = Math.max(2, Math.min(most, next));
      slider.value = String(count);
      slider.style.setProperty('--fill', `${((count - 2) / Math.max(1, most - 2)) * 100}%`);
      less.disabled = count <= 2;
      more.disabled = count >= most;
      holder.replaceChildren(raiseButton(count, t('Dodaj {count} {points}', { count: formatNumber(count), points: plural(count, 'Punkt', 'Punkty', 'Punktów') })));
    }
    set(count);
    return h('div', { class: 'skill-many' }, h('div', { class: 'duration-row' }, less, slider, more), holder);
  }

  render();
  return { update: render };
}

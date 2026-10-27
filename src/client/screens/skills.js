// The Umiejętności tab: at class level 10 the character picks one of the
// three skills of its class for its first Skill Point, for good: its main
// development path. From the next class level it may add a second one for a
// Skill Point, which closes the path left. Each path's name stands over its
// skill. Each class level from 10 to 49 brings a Skill Point, and the points
// raise the learned skills, up to level 20. Both paths and the points are due
// by the first evolution (class level 50): until then the class waits there.
// The server sends every card ready to show (skillsView in the engine); a tap
// on a learned skill opens its card. The narrator's tour of the tab
// (narrator.js) points at the places marked data-guide.

import { fill, h } from '../dom.js';
import { countOf, formatNumber } from '../format.js';
import { skillSprite } from '../art.js';
import { motionOn } from '../motion.js';
import { call, isUnlocked, state, unlockInfo } from '../state.js';
import { closeSheet, confirmAction, openSheet, systemPanel, toast, withButton } from '../ui.js';

// The skill's icon: its sprite, or the first letter while it has none.
const skillIcon = (skill, size = 'large') =>
  h('span', { class: `skill-icon skill-icon--${size}`, 'aria-hidden': 'true' }, skillSprite(skill.id) ?? h('span', { class: 'skill-letter', text: skill.name[0] }));

const levelText = (skill) => `Poziom ${skill.level} / ${skill.maxLevel}`;
const skillPoints = (count) => countOf(count, 'Punkt Umiejętności', 'Punkty Umiejętności', 'Punktów Umiejętności');

// What stands before a path's name, by its state (skillsView).
const PATH_LABELS = { main: 'Ścieżka główna', second: 'Ścieżka poboczna', closed: 'Ścieżka zamknięta' };

// The main path on top, the side path under it, the paths still open in
// their order, and a closed one at the bottom.
const PATH_ORDER = { main: 0, second: 1, closed: 3 };

export function mountSkills(container) {
  function render() {
    const character = state.character;
    const view = character.skills;
    const heading = h(
      'div',
      { class: 'title-row' },
      h('h1', { class: 'page-title', tabindex: '-1', text: 'Umiejętności' }),
      view &&
        isUnlocked('skills') &&
        h('span', { class: `badge badge--system badge--tall${view.points > 0 ? ' badge--ready' : ''}`, 'data-guide': 'skills-points', text: `PUNKTY: ${formatNumber(view.points)}` }),
    );
    if (!view || !isUnlocked('skills')) {
      const unlock = unlockInfo('skills');
      fill(container, heading, systemPanel(`Umiejętności odblokujesz na poziomie klasy ${unlock.classLevel}. Twój poziom klasy: ${character.classLevel}.`));
      return;
    }
    const busy = Boolean(character.activity);
    const evolution = view.evolution ?? {};
    const waiting = evolution.need && character.classLevel >= evolution.level;
    const before = pathTops();
    fill(
      container,
      heading,
      waiting &&
        systemPanel(
          `Klasa czeka na ${evolution.level}. poziomie, u progu ewolucji. Urośnie dalej, gdy ${evolution.need === 'second_path' ? 'wybierzesz ścieżkę poboczną' : 'rozdasz Punkty Umiejętności'}. Zdobyte XP klasy nie przepada.`,
        ),
      busy && systemPanel('Postać jest na wyprawie. Umiejętności zmienisz po jej powrocie.'),
      view.pools.map((pool) => poolSection(pool, view, busy)),
    );
    slidePaths(before);
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
      return h('section', { class: 'card skills-locked' }, h('p', { class: 'muted', text: `Kolejny wybór umiejętności: od poziomu klasy ${pool.classLevel}.` }));
    }
    const known = pool.chosen.length;
    const raisable = pool.options.some((skill) => skill.level > 0 && skill.level < skill.maxLevel);
    const secondOpen = known > 0 && known < view.paths;
    const secondNow = secondOpen && state.character.classLevel >= view.secondLevel;
    const intro =
      known === 0
        ? `Od ${pool.classLevel}. poziomu wzrost poziomu klasy pozwala Ci uzyskać 1 Punkt Umiejętności. Każda umiejętność otwiera jedną ze ścieżek rozwoju. Ale ostrożnie! Możesz otworzyć tylko dwie ścieżki – a one będą miały istotny wpływ na Twoje dalsze losy.`
        : secondNow && view.points > 0
          ? `Masz ${skillPoints(view.points)}. Dodaj punkt do znanej umiejętności albo wybierz ścieżkę poboczną. Ostatnia ścieżka się wtedy zamknie.`
          : secondNow
            ? 'Ścieżkę poboczną wybierzesz za 1 Punkt Umiejętności, a każdy poziom klasy daje jeden. Ostatnia ścieżka się wtedy zamknie.'
            : secondOpen
              ? `Ścieżkę poboczną dobierzesz od poziomu klasy ${view.secondLevel} za 1 Punkt Umiejętności. Wtedy ostatnia ścieżka się zamknie.`
              : null;
    // The deadline, while the second path is open and the class not yet
    // waiting for it.
    const evolutionLevel = view.evolution?.level;
    const deadline =
      secondOpen && evolutionLevel && state.character.classLevel < evolutionLevel && `Ścieżkę poboczną wybierz najpóźniej na ${evolutionLevel}. poziomie klasy, przed ewolucją.`;
    // Points to spend, told unless the line above already tells them.
    const pointsNote = known > 0 && view.points > 0 && raisable && !(secondNow && view.points > 0);
    const panel = intro && systemPanel(deadline ? `${intro} ${deadline}` : intro);
    // Before the first choice the narrator points at the System's words.
    if (panel && known === 0) panel.dataset.guide = 'skills-intro';
    return h(
      'section',
      { class: 'skill-paths', 'aria-label': 'Ścieżki rozwoju' },
      panel,
      pointsNote && systemPanel(`Masz ${skillPoints(view.points)}. Dotknij umiejętności, żeby dodać punkt.`),
      [...pool.options].sort((a, b) => (PATH_ORDER[a.state] ?? 2) - (PATH_ORDER[b.state] ?? 2)).map((skill) => pathSection(skill, pool, view, busy)),
    );
  }

  function pathSection(skill, pool, view, busy) {
    const learned = skill.state === 'main' || skill.state === 'second';
    return h(
      'section',
      { class: `skill-path skill-path--${skill.state}`, 'data-skill': skill.id, 'data-guide': 'skills-path', 'aria-label': `${PATH_LABELS[skill.state] ?? 'Ścieżka'}: ${skill.path}` },
      h(
        'h2',
        { class: 'skill-path-title' },
        h('span', { class: 'skill-path-label', text: PATH_LABELS[skill.state] ?? 'Ścieżka' }),
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
          ? 'Wybierz jako poboczną · 1 punkt'
          : 'Wybierz · 1 punkt'
        : skill.state === 'soon'
          ? `Od poziomu klasy ${view.secondLevel}`
          : 'Potrzebny 1 Punkt Umiejętności';
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
            title: `Ścieżka poboczna: ${skill.path}?`,
            text: `${skill.name} kosztuje 1 Punkt Umiejętności. Ścieżka ${left?.path ?? ''} zamknie się na stałe.`,
            confirmLabel: 'Wybieram',
          }
        : {
            title: `Ścieżka główna: ${skill.path}?`,
            text: `${skill.name} kosztuje 1 Punkt Umiejętności. To wybór na stałe. ${state.character.classLevel >= secondLevel ? 'Ścieżkę poboczną możesz dobrać od razu, za kolejny Punkt Umiejętności.' : `Ścieżkę poboczną dobierzesz od poziomu klasy ${secondLevel}.`}`,
            confirmLabel: 'Wybieram',
          },
    );
    if (!sure) return;
    await withButton(button, async () => {
      await call('POST', '/api/skills/learn', { skillId: skill.id });
      toast(`Nowa umiejętność: ${skill.name}. Ścieżka: ${skill.path}.`);
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
  // and "Dodaj punkt" while there are points and levels left.
  function openCard(skillId, busy) {
    const view = state.character.skills;
    const skill = view.pools.flatMap((pool) => pool.options).find((option) => option.id === skillId);
    if (!skill) return;
    const canRaise = view.points > 0 && skill.level < skill.maxLevel;
    const raise = h('button', {
      type: 'button',
      class: 'button button--system',
      disabled: busy || !canRaise,
      text: 'Dodaj punkt',
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          await call('POST', '/api/skills/raise', { skillId });
          openCard(skillId, Boolean(state.character.activity));
        }),
    });
    openSheet(
      h('div', { class: 'skill-head' }, skillIcon(skill), h('div', {}, h('h2', { class: 'sheet-title', text: skill.name }), h('p', { class: 'skill-style', text: `${skill.style} · ${levelText(skill)}` }))),
      h('p', { class: 'skill-description', text: skill.description }),
      h('h3', { class: 'skill-subtitle', text: 'Teraz' }),
      h('p', { class: 'skill-effect', text: skill.effect }),
      skill.next && h('h3', { class: 'skill-subtitle', text: `Na poziomie ${skill.level + 1}` }),
      skill.next && h('p', { class: 'skill-effect skill-effect--next', text: skill.next }),
      h('p', { class: 'skill-cost', text: skill.cost }),
      h('p', { class: 'muted', text: `Punkty Umiejętności: ${formatNumber(view.points)}. Każdy poziom klasy do ${view.lastPointLevel}. daje jeden.` }),
      h('p', { class: 'muted', text: `Ścieżka: ${skill.path}. Zdecyduje o ewolucji klasy.` }),
      h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--world', onClick: closeSheet, text: 'Zamknij' }), raise),
    );
  }

  render();
  return { update: render };
}

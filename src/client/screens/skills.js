// The Umiejętności tab: at class level 10 the character picks one of the
// three skills of its class, for good, and then raises it with Skill Points
// from later class levels, up to level 20. The server sends every card ready
// to show (skillsView in the engine); a tap on a learned skill opens its card.

import { fill, h } from '../dom.js';
import { formatNumber } from '../format.js';
import { skillSprite } from '../art.js';
import { call, isUnlocked, state, unlockInfo } from '../state.js';
import { closeSheet, confirmAction, openSheet, systemPanel, toast, withButton } from '../ui.js';

// The skill's icon: its sprite, or the first letter while it has none.
const skillIcon = (skill, size = 'large') =>
  h('span', { class: `skill-icon skill-icon--${size}`, 'aria-hidden': 'true' }, skillSprite(skill.id) ?? h('span', { class: 'skill-letter', text: skill.name[0] }));

const levelText = (skill) => `Poziom ${skill.level} / ${skill.maxLevel}`;

export function mountSkills(container) {
  function render() {
    const character = state.character;
    const view = character.skills;
    const heading = h(
      'div',
      { class: 'title-row' },
      h('h1', { class: 'page-title', tabindex: '-1', text: 'Umiejętności' }),
      view && isUnlocked('skills') && h('span', { class: `badge badge--system badge--tall${view.points > 0 ? ' badge--ready' : ''}`, text: `PUNKTY: ${formatNumber(view.points)}` }),
    );
    if (!view || !isUnlocked('skills')) {
      const unlock = unlockInfo('skills');
      fill(container, heading, systemPanel(`Umiejętności odblokujesz na poziomie klasy ${unlock.classLevel}. Twój poziom klasy: ${character.classLevel}.`));
      return;
    }
    const busy = Boolean(character.activity);
    fill(
      container,
      heading,
      busy && systemPanel('Postać jest na wyprawie. Umiejętności zmienisz po jej powrocie.'),
      view.pools.map((pool) => (pool.chosen ? learnedSection(pool, view, busy) : choiceSection(pool, busy))),
    );
  }

  // Three cards side by side in words: what each does, and "Wybierz".
  function choiceSection(pool, busy) {
    if (!pool.open) {
      return h('section', { class: 'card skills-locked' }, h('p', { class: 'muted', text: `Kolejny wybór umiejętności: od poziomu klasy ${pool.classLevel}.` }));
    }
    return h(
      'section',
      { class: 'skill-choice', 'aria-label': 'Wybór umiejętności' },
      systemPanel(`Poziom klasy ${pool.classLevel}: wybierz jedną z trzech umiejętności. Wybór jest na stałe, a postać używa umiejętności w walce sama.`),
      pool.options.map((skill) =>
        h(
          'article',
          { class: 'card skill-card', 'aria-label': skill.name },
          h('div', { class: 'skill-head' }, skillIcon(skill), h('div', {}, h('h2', { class: 'skill-name', text: skill.name }), h('p', { class: 'skill-style', text: skill.style }))),
          h('p', { class: 'skill-description', text: skill.description }),
          h('p', { class: 'skill-effect', text: skill.effect }),
          h('p', { class: 'skill-cost', text: skill.cost }),
          h('button', {
            type: 'button',
            class: 'button button--system',
            disabled: busy,
            text: 'Wybierz',
            onClick: (event) => choose(event.currentTarget, skill),
          }),
        ),
      ),
    );
  }

  async function choose(button, skill) {
    const sure = await confirmAction({
      title: `Wybrać: ${skill.name}?`,
      text: 'Wybór jest na stałe. Pozostałe dwie umiejętności tego wyboru znikną z listy.',
      confirmLabel: 'Wybieram',
    });
    if (!sure) return;
    await withButton(button, async () => {
      await call('POST', '/api/skills/learn', { skillId: skill.id });
      toast(`Nowa umiejętność: ${skill.name}.`);
    });
  }

  // The learned skill as a tile of the grid; a tap opens its card.
  function learnedSection(pool, view, busy) {
    const skill = pool.options.find((option) => option.id === pool.chosen);
    return h(
      'section',
      { class: 'skill-grid-section', 'aria-label': 'Umiejętności' },
      h('h2', { class: 'section-title', text: 'Umiejętności' }),
      view.points > 0 && skill.level < skill.maxLevel && systemPanel(`Masz ${formatNumber(view.points)} Punktów Umiejętności. Dotknij umiejętności, żeby dodać punkt.`),
      h(
        'div',
        { class: 'skill-grid' },
        h(
          'button',
          { type: 'button', class: `skill-tile${view.points > 0 && skill.level < skill.maxLevel ? ' skill-tile--ready' : ''}`, onClick: () => openCard(skill.id, busy) },
          skillIcon(skill),
          h('span', { class: 'skill-tile-name', text: skill.name }),
          h('span', { class: 'skill-tile-level', text: `${skill.level}/${skill.maxLevel}` }),
        ),
      ),
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
      h('p', { class: 'muted', text: `Punkty Umiejętności: ${formatNumber(view.points)}. Każdy poziom klasy daje jeden.` }),
      h('p', { class: 'muted', text: 'Ścieżka ewolucji: wkrótce.' }),
      h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--world', onClick: closeSheet, text: 'Zamknij' }), raise),
    );
  }

  render();
  return { update: render };
}

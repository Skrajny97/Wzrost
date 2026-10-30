// The Ewolucja tab of Postać (the author: "zablokowany do poz.50 klasy modul
// osobny w zakładce postaci", between Umiejętności and Rdzeń). From the
// class level of the first evolution, once the class's two paths are ready
// (both chosen, the Skill Points spent), it holds the cards of the two
// paths' evolutions to choose one from, for good; after the choice, the
// evolution's card. The choice and the ceremony are in evolution.js.

import { fill, h } from '../dom.js';
import { chooseEvolution, evolutionCard } from '../evolution.js';
import { isUnlocked, state, unlockInfo } from '../state.js';
import { systemPanel } from '../ui.js';

export function mountEvolution(container) {
  function render() {
    const character = state.character;
    const t = state.content.evolutionTexts;
    const heading = h('div', { class: 'page-heading' }, h('h1', { class: 'page-title', tabindex: '-1', text: t.title }));
    const unlock = unlockInfo('evolution');
    // Where the deployment has the evolutions off there is no tab, and the
    // address alone leads here.
    if (!unlock) {
      fill(container, heading, systemPanel('Ewolucja klasy: wkrótce.'));
      return;
    }
    if (!isUnlocked('evolution')) {
      fill(container, heading, systemPanel(`Dostęp zablokowany. ${unlock.name}: od poziomu klasy ${unlock.classLevel}. Twój poziom klasy: ${character.classLevel}.`));
      return;
    }
    const { current, choices } = character.evolution ?? { current: null, choices: [] };
    const toSkills = h('a', { class: 'button button--system', href: '#/postac/umiejetnosci', text: t.toSkills });
    if (current) {
      // The evolution taken; the points for its skills, while some are left.
      fill(
        container,
        heading,
        h('p', { class: 'muted evolution-base', text: t.baseClass.replace('{className}', character.baseClassName) }),
        (character.skills?.points ?? 0) > 0 && h('div', { class: 'evolution-spend' }, systemPanel(t.spend), toSkills),
        evolutionCard(current),
      );
      return;
    }
    if (choices.length === 0) {
      // The paths are not ready yet: the second one, or the points.
      fill(container, heading, systemPanel(t.notReady), toSkills);
      return;
    }
    const busy = Boolean(character.activity);
    // The author's words, with "mogła" for a woman.
    const said = character.appearance === 'female' ? t.introFemale : t.intro;
    const intro = systemPanel(said.replace('{level}', String(character.skills.evolution.level)));
    // Where the narrator's Ewolucja chapter points (narrator.js): the cards
    // below are too tall to be lit whole.
    intro.dataset.guide = 'evolution-choice';
    fill(
      container,
      heading,
      busy && systemPanel(t.busy),
      intro,
      choices.map((choice) => evolutionCard(choice, { busy, onChoose: (button, chosen) => chooseEvolution(button, chosen) })),
    );
  }

  render();
  return { update: render };
}

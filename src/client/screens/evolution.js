// The Ewolucja tab of Postać (the author: "zablokowany do poz.50 klasy modul
// osobny w zakładce postaci", between Umiejętności and Rdzeń). From the
// class level of the first evolution, once the class's two paths are ready
// (both chosen, the Skill Points spent), it holds the cards of the two
// paths' evolutions to choose one from, for good; after the choice, the
// evolution's card and when the next one comes. At class level 100, once
// the points are spent, the card of the one form the evolution grows into,
// to take; after it, that form's card; at 200 the same for the third form,
// where the deployment has it. The choice and the ceremony are in
// evolution.js.

import { placeArt } from '../art.js';
import { fill, h } from '../dom.js';
import { chooseEvolution, evolutionCard } from '../evolution.js';
import { t } from '../i18n.js';
import { buildLocked, buildLockedText, isUnlocked, state, unlockInfo } from '../state.js';
import { systemPanel } from '../ui.js';

export function mountEvolution(container) {
  function render() {
    const character = state.character;
    const words = state.content.evolutionTexts;
    // The heading over the tab's place, a spring with a ceremonial table
    // (the author: "jakiegoś źródła wody ze stołem ceremonialnym").
    const art = placeArt(state.content.evolutionPlace);
    const heading = h('div', { class: `page-heading${art ? ' evolution-heading' : ''}` }, h('h1', { class: 'page-title', tabindex: '-1', text: words.title }));
    if (art) heading.style.setProperty('--place-art', `url("${art}")`);
    const unlock = unlockInfo('evolution');
    // Where the deployment has the evolutions off there is no tab, and the
    // address alone leads here.
    if (!unlock) {
      fill(container, heading, systemPanel(t('Ewolucja klasy: wkrótce.')));
      return;
    }
    if (!isUnlocked('evolution')) {
      fill(
        container,
        heading,
        systemPanel(t('Dostęp zablokowany. {name}: od poziomu klasy {level}. Twój poziom klasy: {own}.', { name: unlock.name, level: unlock.classLevel, own: character.classLevel })),
      );
      return;
    }
    const { current, choices, next, nextLevel } = character.evolution ?? { current: null, choices: [] };
    const toSkills = h('a', { class: 'button button--system', href: '#/postac/umiejetnosci', text: words.toSkills });
    // Only an exploration counts its fights with the evolution (hunts.js),
    // and a mercenary goes as it is (mercenaries.js).
    const busy = buildLocked(character);
    const busyText = character.activity?.kind === 'mercenary' ? buildLockedText(character, t('Ewolucję wybierzesz')) : words.busy;
    const base = current && h('p', { class: 'muted evolution-base', text: words.baseClass.replace('{className}', character.baseClassName) });
    if (next) {
      // The one form the evolution grows into, to take (the author's
      // words, with "mogła" for a woman); no narrator here (385 B).
      const said = character.appearance === 'female' ? words.nextIntroFemale : words.nextIntro;
      fill(
        container,
        heading,
        base,
        busy && systemPanel(busyText),
        systemPanel(said.replace('{level}', String(nextLevel))),
        evolutionCard(next, { busy, onChoose: (button, chosen) => chooseEvolution(button, chosen) }),
      );
      return;
    }
    if (current) {
      // The evolution taken; the points for its skills, while some are
      // left, and when the next evolution comes: at its level the points
      // are due first.
      const points = (character.skills?.points ?? 0) > 0;
      const waiting = nextLevel && character.classLevel >= nextLevel;
      fill(
        container,
        heading,
        base,
        points && h('div', { class: 'evolution-spend' }, systemPanel(waiting ? words.nextNotReady : words.spend), toSkills),
        nextLevel && !waiting && systemPanel(words.nextWaiting.replace('{level}', String(nextLevel))),
        evolutionCard(current),
      );
      return;
    }
    if (choices.length === 0) {
      // The paths are not ready yet: the second one, or the points.
      fill(container, heading, systemPanel(words.notReady), toSkills);
      return;
    }
    // The author's words, with "mogła" for a woman.
    const said = character.appearance === 'female' ? words.introFemale : words.intro;
    const intro = systemPanel(said.replace('{level}', String(character.skills.evolution.level)));
    // Where the narrator's Ewolucja chapter points (narrator.js): the cards
    // below are too tall to be lit whole.
    intro.dataset.guide = 'evolution-choice';
    fill(
      container,
      heading,
      busy && systemPanel(busyText),
      intro,
      choices.map((choice) => evolutionCard(choice, { busy, onChoose: (button, chosen) => chooseEvolution(button, chosen) })),
    );
  }

  render();
  return { update: render };
}

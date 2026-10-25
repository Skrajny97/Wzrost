// A module the tutorial has not opened yet, or one that is not built yet.

import { fill, h } from '../dom.js';
import { isUnlocked, state, unlockInfo } from '../state.js';
import { systemPanel } from '../ui.js';

export function lockedScreen(unlockId, title) {
  return (container) => {
    function render() {
      const unlock = unlockInfo(unlockId);
      const message = isUnlocked(unlockId)
        ? `Moduł ${unlock.name} pojawi się w jednej z kolejnych aktualizacji gry.`
        : unlock.level
          ? `Dostęp zablokowany. ${unlock.name}: od poziomu postaci ${unlock.level}. Twój poziom: ${state.character.level}.`
          : unlock.classLevel
            ? `Dostęp zablokowany. ${unlock.name}: od poziomu klasy ${unlock.classLevel}. Twój poziom klasy: ${state.character.classLevel}.`
            : `Dostęp zablokowany. ${unlock.name} odblokuje się ${unlock.condition}.`;
      fill(container,
        h('div', { class: 'page-heading' }, h('h1', { class: 'page-title', tabindex: '-1', text: title })),
        systemPanel(message),
      );
    }
    render();
    return { update: render };
  };
}

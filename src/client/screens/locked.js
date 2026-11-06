// A module the tutorial has not opened yet, or one that is not built yet.

import { fill, h } from '../dom.js';
import { t } from '../i18n.js';
import { isUnlocked, state, unlockInfo } from '../state.js';
import { systemPanel } from '../ui.js';

export function lockedScreen(unlockId, title) {
  return (container) => {
    function render() {
      const unlock = unlockInfo(unlockId);
      const message = isUnlocked(unlockId)
        ? t('Moduł {name} pojawi się w jednej z kolejnych aktualizacji gry.', { name: unlock.name })
        : unlock.level
          ? t('Dostęp zablokowany. {name}: od poziomu postaci {level}. Twój poziom: {own}.', { name: unlock.name, level: unlock.level, own: state.character.level })
          : unlock.classLevel
            ? t('Dostęp zablokowany. {name}: od poziomu klasy {level}. Twój poziom klasy: {own}.', { name: unlock.name, level: unlock.classLevel, own: state.character.classLevel })
            : t('Dostęp zablokowany. {name} odblokuje się {condition}.', { name: unlock.name, condition: unlock.condition });
      fill(container,
        h('div', { class: 'page-heading' }, h('h1', { class: 'page-title', tabindex: '-1', text: t(title) })),
        systemPanel(message),
      );
    }
    render();
    return { update: render };
  };
}

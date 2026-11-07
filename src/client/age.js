// The game is for people aged 16 or over (725 A, 0.2.3): the form of a new
// account has "Mam co najmniej 16 lat" (index.html), and a new account made
// by signing in with Google answers once here before it plays
// (src/server/accounts.js, confirmAge). The terms and the privacy policy are
// pages beside the game (regulamin.html, prywatnosc.html and their English).

import { request } from './api.js';
import { clear, h } from './dom.js';
import { language, t } from './i18n.js';
import { state } from './state.js';
import { withButton } from './ui.js';

export const mustConfirmAge = (user) => Boolean(user?.ageRequired);

const PAGES = {
  terms: { pl: '/regulamin', en: '/terms' },
  privacy: { pl: '/prywatnosc', en: '/privacy' },
};
const pageLink = (page, text) => h('a', { href: PAGES[page][language() === 'en' ? 'en' : 'pl'], target: '_blank', rel: 'noopener', text });

// "Regulamin · Polityka prywatności", in the language shown.
export function legalLinks() {
  return h('span', { class: 'legal-links' }, pageLink('terms', t('Regulamin')), ' · ', pageLink('privacy', t('Polityka prywatności')));
}

// The screen of a new Google account in place of the game. `onConfirmed`
// opens the game; `onDeleted` goes back to signing in.
export function renderAge(panel, { onConfirmed, onDeleted }) {
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const answer = (adult) => (event) =>
    withButton(event.currentTarget, async () => {
      error.hidden = true;
      try {
        const result = await request('POST', '/api/me/age', { adult });
        if (result.deleted) {
          state.user = null;
          onDeleted();
          return;
        }
        state.user = { ...state.user, ageRequired: false };
        onConfirmed();
      } catch (failure) {
        error.textContent = failure.message;
        error.hidden = false;
      }
    });
  clear(panel);
  panel.append(
    h('div', { class: 'system-message' }, h('p', { class: 'system-label', text: '[ SYSTEM ]' }), h('p', { class: 'system-text', id: 'confirm-text', text: t('Ostatni krok: Insight jest dla osób, które mają co najmniej 16 lat.') })),
    h('p', { class: 'field-hint' }, t('Grając, akceptujesz'), ' ', pageLink('terms', t('Regulamin')), '. ', t('Jak dbamy o dane:'), ' ', pageLink('privacy', t('Polityka prywatności')), '.'),
    error,
    h('button', { type: 'button', class: 'button button--system', onClick: answer(true), text: t('Mam co najmniej 16 lat') }),
    h('button', { type: 'button', class: 'button button--world', onClick: answer(false), text: t('Nie mam 16 lat') }),
  );
}

// The author's panel (src/server/author.js), opened from the settings of the
// author's account: how many accounts and characters the game has, and every
// account, newest first, with its e-mail and its character. It is read anew
// on every visit and with "Odśwież".

import { fill, h, icon } from '../dom.js';
import { dateTimeFormat, formatNumber } from '../format.js';
import { call, state } from '../state.js';
import { systemPanel, withButton } from '../ui.js';

export function mountAuthor(container, { backHash = '#/walka' }) {
  if (!state.user?.author) {
    location.replace(backHash);
    return {};
  }
  let panel = null;
  let error = null;

  async function load() {
    try {
      panel = await call('GET', '/api/author');
      error = null;
    } catch (failure) {
      error = failure.message;
    }
    render();
  }

  function render() {
    fill(
      container,
      h(
        'div',
        { class: 'page-heading page-heading--back' },
        h('div', { class: 'page-heading-text' }, h('h1', { class: 'page-title', tabindex: '-1', text: 'Panel autora' }), h('p', { class: 'page-subtitle', text: 'Konta i postacie w grze' })),
        h('a', { class: 'button button--system back-button', href: backHash }, icon('back', { size: 20 }), 'Powrót'),
      ),
      error ? systemPanel(error) : panel === null ? h('p', { class: 'muted', text: 'Wczytywanie…' }) : [counts(panel.counts), accounts(panel.accounts)],
      h('button', {
        type: 'button',
        class: 'button button--world',
        text: 'Odśwież',
        onClick: (event) => withButton(event.currentTarget, load),
      }),
    );
  }

  function counts(numbers) {
    const tile = (label, value, note) =>
      h('li', { class: 'author-count' }, h('span', { class: 'author-count-label', text: label }), h('strong', { text: formatNumber(value) }), note && h('span', { class: 'author-count-note', text: note }));
    return h(
      'ul',
      { class: 'author-counts', 'aria-label': 'Liczby' },
      tile('Konta', numbers.accounts, `nowe w 24 h: ${formatNumber(numbers.newAccounts)}`),
      tile('Postacie', numbers.characters, `nowe w 24 h: ${formatNumber(numbers.newCharacters)}`),
      tile('Z Google', numbers.google),
    );
  }

  function accounts(list) {
    if (list.length === 0) return h('p', { class: 'muted', text: 'Nie ma jeszcze kont.' });
    return h(
      'ol',
      { class: 'author-accounts', 'aria-label': 'Konta, od najnowszego' },
      list.map((account) =>
        h(
          'li',
          { class: 'card author-account' },
          h('p', { class: 'author-account-head' }, h('strong', { text: account.login }), account.google && h('span', { class: 'author-google', text: 'Google' })),
          h('p', { class: 'author-account-mail', text: account.email ?? 'bez adresu e-mail' }),
          h(
            'p',
            { class: 'author-account-character' },
            account.character
              ? `${account.character.name} · ${account.character.className}, poziom ${account.character.level}, klasa ${account.character.classLevel}`
              : 'bez postaci',
          ),
          h('p', { class: 'author-account-date', text: `Konto od ${dateTimeFormat.format(new Date(account.createdAt))}` }),
        ),
      ),
    );
  }

  render();
  load();
  return {};
}

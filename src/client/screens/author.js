// The author's panel (src/server/author.js), opened from the settings of the
// author's account: how many accounts and characters the game has, and every
// account, newest first, with its e-mail and its character. It is read anew
// on every visit and with "Odśwież". On top, the preview of the skills: a
// tap plays a short fight that shows one skill, in the report's arena.

import { createArena } from '../arena.js';
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
  let skills = null;
  let arena = null;
  const preview = h('div', { class: 'author-skill-preview', 'aria-live': 'polite' });

  async function load() {
    try {
      panel = await call('GET', '/api/author');
      skills = (await call('GET', '/api/author/skills')).skills;
      error = null;
    } catch (failure) {
      error = failure.message;
    }
    render();
  }

  // One skill's fight, played at once; the one before stops.
  async function play(skill) {
    const { fight } = await call('GET', `/api/author/skills/${skill.id}`);
    arena?.stop();
    arena = createArena(fight, { autoplay: 'now' });
    fill(preview, h('h3', { class: 'author-skill-title', text: `${skill.name} · ${skill.className}` }), arena.element);
    // Just below the top bar, which stays over the page and would hide the foes.
    const top = document.getElementById('topbar')?.getBoundingClientRect().bottom ?? 0;
    window.scrollTo({ top: window.scrollY + preview.getBoundingClientRect().top - top - 8, behavior: 'smooth' });
  }

  function skillsPreview() {
    if (!skills) return null;
    const classes = [...new Set(skills.map((skill) => skill.className))];
    return h(
      'section',
      { class: 'card author-skills', 'aria-label': 'Podgląd umiejętności' },
      h('h2', { class: 'card-title', text: 'Podgląd umiejętności' }),
      h('p', { class: 'muted', text: 'Stuknij umiejętność: krótka walka pokazowa postaci na poziomie 20, z umiejętnością na poziomie 10.' }),
      classes.map((className) =>
        h(
          'div',
          { class: 'author-skill-group' },
          h('h3', { class: 'author-skill-class', text: className }),
          h(
            'div',
            { class: 'author-skill-buttons' },
            skills
              .filter((skill) => skill.className === className)
              .map((skill) =>
                h('button', {
                  type: 'button',
                  class: 'button button--world button--small',
                  text: skill.name,
                  onClick: (event) => withButton(event.currentTarget, () => play(skill)),
                }),
              ),
          ),
        ),
      ),
      preview,
    );
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
      error ? systemPanel(error) : panel === null ? h('p', { class: 'muted', text: 'Wczytywanie…' }) : [skillsPreview(), counts(panel.counts), accounts(panel.accounts)],
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
  return {
    unmount() {
      arena?.stop();
    },
  };
}

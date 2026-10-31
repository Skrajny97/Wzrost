// The author's panel (src/server/author.js), opened from the settings of the
// author's account: how many accounts and characters the game has, and every
// account, newest first, with its e-mail, its character, its silence in the
// chat and the chat's moderator role to give or take back. It is read anew
// on every visit and with "Odśwież". The preview of the skills opens with its
// own button, so the accounts show without scrolling (the author: "schowaj
// pod osobnym przyciskiem"): a tap on a skill plays a short fight that shows
// it, in the report's arena.

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
  let skillsOpen = false;
  let arena = null;
  const preview = h('div', { class: 'author-skill-preview', 'aria-live': 'polite' });

  async function load() {
    try {
      panel = await call('GET', '/api/author');
      error = null;
      // The dot on the settings follows the reports still open.
      state.user.bugReports = panel.counts.bugs;
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

  // The skills are read the first time the preview opens.
  async function toggleSkills() {
    if (!skillsOpen && !skills) skills = (await call('GET', '/api/author/skills')).skills;
    skillsOpen = !skillsOpen;
    if (!skillsOpen) {
      arena?.stop();
      arena = null;
      fill(preview);
    }
    render();
  }

  function skillsToggle() {
    return h('button', {
      type: 'button',
      class: 'button button--world button--small author-skills-toggle',
      'aria-expanded': String(skillsOpen),
      text: skillsOpen ? 'Zwiń podgląd umiejętności' : 'Podgląd umiejętności',
      onClick: (event) => withButton(event.currentTarget, toggleSkills),
    });
  }

  function skillsPreview() {
    if (!skillsOpen || !skills) return null;
    const classes = [...new Set(skills.map((skill) => skill.className))];
    return h(
      'section',
      { class: 'card author-skills', 'aria-label': 'Podgląd umiejętności' },
      h('h2', { class: 'card-title', text: 'Podgląd umiejętności' }),
      h('p', { class: 'muted', text: 'Stuknij umiejętność: krótka walka pokazowa postaci na poziomie 20, z umiejętnością na poziomie 10. Umiejętności ewolucji: postać na poziomie 60, umiejętność na poziomie 20.' }),
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
        h('div', { class: 'page-heading-text' }, h('h1', { class: 'page-title', tabindex: '-1', text: 'Panel autora' }), h('p', { class: 'page-subtitle', text: 'Zgłoszenia błędów, konta i postacie' })),
        h('a', { class: 'button button--system back-button', href: backHash }, icon('back', { size: 20 }), 'Powrót'),
      ),
      error ? systemPanel(error) : panel === null ? h('p', { class: 'muted', text: 'Wczytywanie…' }) : [skillsToggle(), skillsPreview(), counts(panel.counts), bugs(panel.bugs), accounts(panel.accounts)],
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

  const small = (label, onClick, kind = 'world') => h('button', { type: 'button', class: `button button--${kind} button--small`, text: label, onClick });
  const untilText = (until) => (until >= 8.64e15 ? 'na stałe' : `do ${dateTimeFormat.format(new Date(until))}`);
  // A tap that changes an account in the chat, then the panel anew.
  const change = (path, body) => (event) =>
    withButton(event.currentTarget, async () => {
      await call('POST', path, body);
      await load();
    });

  // The account's place in the chat (chat.js): its silence with "Przywróć
  // czat", and the moderator's role to give or take back (the author's own
  // account is the admin).
  function chatRow(account) {
    const own = account.login === state.user?.login;
    return h(
      'div',
      { class: 'author-account-chat' },
      account.chatMutedUntil && h('span', { class: 'author-account-muted', text: `Czat wyciszony ${untilText(account.chatMutedUntil)}` }),
      account.chatMutedUntil && small('Przywróć czat', change('/api/author/chat/unmute', { login: account.login })),
      !own &&
        small(
          account.chatModerator ? 'Odbierz moderację' : 'Mianuj moderatorem',
          change('/api/author/chat/moderator', { login: account.login, moderator: !account.chatModerator }),
          account.chatModerator ? 'danger' : 'world',
        ),
    );
  }

  // The players' bug reports ("Zgłoś błąd", bugs.js): the open ones, newest
  // first, each with who sent it, from which screen and version, and
  // "Załatwione"; the done ones folded below, with "Przywróć".
  function bugs(list) {
    const open = list.filter((bug) => !bug.resolvedAt);
    const done = list.filter((bug) => bug.resolvedAt);
    const card = (bug) =>
      h(
        'li',
        { class: 'card author-bug' },
        h('p', { class: 'author-bug-head' }, h('strong', { text: bug.login ?? 'konto usunięte' }), bug.character && ` · ${bug.character}`),
        h('p', { class: 'author-bug-text', text: bug.text }),
        h('p', { class: 'author-bug-meta', text: [dateTimeFormat.format(new Date(bug.createdAt)), bug.screen && `ekran ${bug.screen}`, bug.version && `wersja ${bug.version}`].filter(Boolean).join(' · ') }),
        bug.device && h('p', { class: 'author-bug-meta', text: bug.device }),
        small(bug.resolvedAt ? 'Przywróć' : 'Załatwione', change('/api/author/bugs/resolve', { id: bug.id, done: !bug.resolvedAt })),
      );
    return h(
      'section',
      { class: 'stack author-bugs', 'aria-label': 'Zgłoszenia błędów' },
      h('h2', { class: 'card-title', text: open.length > 0 ? `Zgłoszenia błędów: nowe ${open.length}` : 'Zgłoszenia błędów' }),
      open.length === 0 ? h('p', { class: 'muted', text: 'Brak nowych zgłoszeń.' }) : h('ol', { class: 'author-bug-list' }, open.map(card)),
      done.length > 0 && h('details', { class: 'author-bugs-done' }, h('summary', { text: `Załatwione (${done.length})` }), h('ol', { class: 'author-bug-list' }, done.map(card))),
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
          h(
            'p',
            { class: 'author-account-head' },
            h('strong', { text: account.login }),
            account.chatModerator && h('span', { class: 'chat-role chat-role--moderator', text: '(moderator)' }),
            account.google && h('span', { class: 'author-google', text: 'Google' }),
          ),
          h('p', { class: 'author-account-mail', text: account.email ? `${account.email}${account.emailConfirmed ? '' : ' (niepotwierdzony)'}` : 'bez adresu e-mail' }),
          h(
            'p',
            { class: 'author-account-character' },
            account.character
              ? `${account.character.name} · ${account.character.className}, poziom ${account.character.level}, klasa ${account.character.classLevel}${account.characters > 1 ? ` · postaci na koncie: ${account.characters}` : ''}`
              : account.characters > 0
                ? `postaci na koncie: ${account.characters}, żadna wybrana`
                : 'bez postaci',
          ),
          h('p', { class: 'author-account-date', text: `Konto od ${dateTimeFormat.format(new Date(account.createdAt))}` }),
          chatRow(account),
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

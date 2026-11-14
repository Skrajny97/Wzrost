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
import { confirmAction, systemPanel, toast, withButton } from '../ui.js';

export function mountAuthor(container, { backHash = '#/walka' }) {
  if (!state.user?.author) {
    location.replace(backHash);
    return {};
  }
  let panel = null;
  let error = null;
  let skills = null;
  let skillsOpen = false;
  // "Co nowego?" (595 A): the drafts, a new entry and the published ones,
  // read the first time the part opens.
  let news = null;
  let newsOpen = false;
  let arena = null;
  // Answers that come after the panel was left are dropped (the code
  // review: a skill's fight played on with sound on the next screen).
  let gone = false;
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
    if (!gone) render();
  }

  // One skill's fight, played at once; the one before stops.
  async function play(skill) {
    const { fight } = await call('GET', `/api/author/skills/${skill.id}`);
    if (gone) return;
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

  async function toggleNews() {
    if (!newsOpen) news = await call('GET', '/api/author/news');
    newsOpen = !newsOpen;
    render();
  }

  function newsToggle() {
    const drafts = news?.drafts.length ?? 0;
    return h('button', {
      type: 'button',
      class: 'button button--system button--small author-news-toggle',
      'aria-expanded': String(newsOpen),
      text: newsOpen ? 'Zwiń „Co nowego?”' : 'Wpisy „Co nowego?”',
      onClick: (event) => withButton(event.currentTarget, toggleNews),
    }, !newsOpen && drafts > 0 && h('span', { class: 'author-news-count', text: ` (szkice: ${drafts})` }));
  }

  // A title and a text to correct, with the actions under them: "Opublikuj"
  // and "Usuń" for a draft, "Opublikuj" for a new entry, "Zapisz" and "Usuń"
  // for a published one.
  function newsForm(entry, { label, send, remove }) {
    const { limits } = news;
    const title = h('input', { type: 'text', class: 'author-news-title', maxlength: String(limits.title), value: entry.title ?? '', 'aria-label': 'Tytuł' });
    const body = h('textarea', { class: 'author-news-body', rows: '7', maxlength: String(limits.body), 'aria-label': 'Treść' });
    body.value = entry.body ?? '';
    const act = (handler) => (event) =>
      withButton(event.currentTarget, async () => {
        news = await handler();
        render();
      });
    return h(
      'div',
      { class: 'author-news-form' },
      title,
      body,
      h(
        'div',
        { class: 'author-news-actions' },
        h('button', { type: 'button', class: 'button button--system button--small', text: label, onClick: act(() => send({ title: title.value, body: body.value })) }),
        remove && h('button', { type: 'button', class: 'button button--danger button--small', text: 'Usuń', onClick: act(remove) }),
      ),
    );
  }

  function newsPart() {
    if (!newsOpen || !news) return null;
    const post = (path, body) => call('POST', path, body);
    return h(
      'section',
      { class: 'card stack author-news', 'aria-label': 'Co nowego?' },
      h('h2', { class: 'card-title', text: 'Co nowego?' }),
      h('p', { class: 'muted', text: 'Gracze widzą tylko opublikowane wpisy: raz w okienku po wejściu do gry i zawsze pod ikoną zwoju w górnym pasku. Wiersz zaczynający się od „- ” jest punktem listy.' }),
      h('h3', { class: 'author-news-head', text: news.drafts.length > 0 ? `Szkice do zatwierdzenia: ${news.drafts.length}` : 'Szkice do zatwierdzenia' }),
      news.drafts.length === 0
        ? h('p', { class: 'muted', text: 'Wszystkie szkice są opublikowane.' })
        : news.drafts.map((draft) =>
            newsForm(draft, {
              label: 'Opublikuj',
              send: (written) => post('/api/author/news', { draft: draft.id, ...written }),
              remove: async () => {
                const sure = await confirmAction({ title: 'Usunąć szkic?', text: `„${draft.title}” zniknie ze szkiców na zawsze. Gracze go nie zobaczą.`, confirmLabel: 'Usuń', danger: true });
                return sure ? post('/api/author/news/dismiss', { draft: draft.id }) : news;
              },
            }),
          ),
      h('h3', { class: 'author-news-head', text: 'Nowy wpis' }),
      newsForm({}, { label: 'Opublikuj', send: (written) => post('/api/author/news', written) }),
      h('h3', { class: 'author-news-head', text: news.entries.length > 0 ? `Opublikowane: ${news.entries.length}` : 'Opublikowane' }),
      news.entries.length === 0
        ? h('p', { class: 'muted', text: 'Nic jeszcze nie jest opublikowane.' })
        : news.entries.map((entry) =>
            h(
              'details',
              { class: 'author-news-entry' },
              h('summary', { text: `${entry.title} · ${dateTimeFormat.format(new Date(entry.publishedAt))}` }),
              newsForm(entry, {
                label: 'Zapisz poprawkę',
                send: (written) => post('/api/author/news/edit', { id: entry.id, ...written }),
                remove: async () => {
                  const sure = await confirmAction({ title: 'Usunąć wpis?', text: `„${entry.title}” zniknie z gry.${entry.draft ? ' Szkic, z którego powstał, wróci do szkiców, chyba że go usunięto.' : ''}`, confirmLabel: 'Usuń', danger: true });
                  return sure ? post('/api/author/news/delete', { id: entry.id }) : news;
                },
              }),
            ),
          ),
    );
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
      h('p', { class: 'muted', text: 'Wybierz umiejętność: krótka walka pokazowa postaci na poziomie 20, z umiejętnością na poziomie 10. Umiejętności ewolucji: postać na poziomie 60, umiejętność na poziomie 20.' }),
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
      error ? systemPanel(error) : panel === null ? h('p', { class: 'muted', text: 'Wczytywanie…' }) : [newsToggle(), newsPart(), skillsToggle(), skillsPreview(), counts(panel.counts), mails(panel.emails), bugs(panel.bugs), accounts(panel.accounts)],
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

  // Every account's confirmed e-mail in one go, separated by commas, for the
  // list of testers of the Google Play test (the author, 14.11.2026): copied
  // with the tap itself, or shown selected where the phone will not copy.
  function mails(list) {
    if (!list?.length) return null;
    const text = list.join(', ');
    const shown = h('div', { class: 'author-mails-shown' });
    const show = () => {
      const box = h('textarea', { class: 'author-mails-box', rows: '6', readonly: true, 'aria-label': 'Adresy e-mail' });
      box.value = text;
      fill(shown, h('p', { class: 'muted small', text: 'Telefon nie pozwolił skopiować: przytrzymaj tekst i wybierz „Kopiuj”.' }), box);
      box.focus();
      box.select();
    };
    const copy = () => {
      try {
        navigator.clipboard.writeText(text).then(() => toast(`Skopiowano adresy: ${formatNumber(list.length)}.`), show);
      } catch {
        show();
      }
    };
    return h(
      'section',
      { class: 'card stack author-mails', 'aria-label': 'Adresy e-mail' },
      h('button', { type: 'button', class: 'button button--system button--small', text: `Kopiuj adresy e-mail (${formatNumber(list.length)})`, onClick: copy }),
      h('p', { class: 'muted small', text: 'Potwierdzone adresy wszystkich kont, oddzielone przecinkami. Wklej je w Play Console: Test zamknięty → Testerzy → lista e-maili.' }),
      shown,
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

  // The screenshot sent with a report (screenshot.js): small, as wide as the
  // card after a tap, small again after another. Read only once in sight.
  const shot = (bug) =>
    h(
      'button',
      {
        type: 'button',
        class: 'author-bug-shot',
        'aria-expanded': 'false',
        onClick: (event) => event.currentTarget.setAttribute('aria-expanded', String(event.currentTarget.getAttribute('aria-expanded') !== 'true')),
      },
      h('img', { src: `/api/author/bugs/image?id=${bug.id}`, alt: 'Zrzut ekranu od gracza', loading: 'lazy', decoding: 'async' }),
    );

  // The players' bug reports ("Zgłoś błąd", bugs.js): the open ones, newest
  // first, each with who sent it, its screenshot, from which screen and
  // version, and "Załatwione"; the done ones folded below, with "Przywróć".
  function bugs(list) {
    const open = list.filter((bug) => !bug.resolvedAt);
    const done = list.filter((bug) => bug.resolvedAt);
    const card = (bug) =>
      h(
        'li',
        { class: 'card author-bug' },
        h('p', { class: 'author-bug-head' }, h('strong', { text: bug.login ?? 'konto usunięte' }), bug.character && ` · ${bug.character}`),
        h('p', { class: 'author-bug-text', text: bug.text }),
        bug.image && shot(bug),
        h('p', { class: 'author-bug-meta', text: [dateTimeFormat.format(new Date(bug.createdAt)), bug.screen && `ekran ${bug.screen}`, bug.version && `wersja ${bug.version}`].filter(Boolean).join(' · ') }),
        bug.device && h('p', { class: 'author-bug-meta', text: bug.device }),
        bug.details && h('p', { class: 'author-bug-meta', text: bug.details }),
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
      gone = true;
      arena?.stop();
    },
  };
}

// The Społeczność tab, from character level 5: for now the chat
// (src/server/chat.js), in its only channel so far, Globalny, the newest
// messages at the bottom, over the line to write in. While the chat is open and
// the page is in front, it asks for new messages every few seconds, and
// less often the longer nothing comes. A tap on a name shows that character
// (profile.js); a tap on someone else's message opens its sheet: report it,
// or hide that player's messages. The moderation (the admin and the
// moderators, marked by their names) also takes it down or silences its
// writer there, and has the reports in a sheet of their own. The rules come
// before the first message, and the hidden players wait under the chat to
// be shown again.

import { $, fill, h, icon } from '../dom.js';
import { dateTimeFormat, timeFormat } from '../format.js';
import { chatSeen } from '../chat-news.js';
import { CLASS_ICONS } from '../icons.js';
import { openProfile } from '../profile.js';
import { call, isUnlocked, serverNow, state } from '../state.js';
import { closeSheet, openSheet, pageHeading, toast, withButton } from '../ui.js';
import { lockedScreen } from './locked.js';

// The most messages the page keeps; older ones leave from the top.
const SHOWN = 200;

// A silence "na stałe" (chat.js).
const FOREVER = 8.64e15;
const untilText = (until) => (until >= FOREVER ? 'na stałe' : `do ${dateTimeFormat.format(new Date(until))}`);

export function mountCommunity(container, context) {
  if (!isUnlocked('community')) return lockedScreen('community', 'Społeczność')(container, context);
  const chat = state.content.chat;
  const channel = chat.channels[0].id;
  let messages = [];
  let account = null;
  let error = null;
  let timer = null;
  let delay = chat.pollSeconds.min;
  let asking = false;
  let gone = false;

  const notices = h('div', { class: 'chat-notices' });
  const list = h('ol', { class: 'chat-list', 'aria-label': 'Wiadomości' });
  const empty = h('p', { class: 'muted chat-empty', text: 'Wczytywanie…' });
  const text = h('input', {
    type: 'text',
    id: 'chat-text',
    maxlength: String(chat.maxLength),
    autocomplete: 'off',
    enterkeyhint: 'send',
    placeholder: 'Napisz wiadomość…',
    'aria-label': 'Wiadomość',
  });
  const sendButton = h('button', { type: 'submit', class: 'button button--system chat-send', text: 'Wyślij' });
  const form = h(
    'form',
    {
      class: 'chat-form',
      onSubmit: (event) => {
        event.preventDefault();
        withButton(sendButton, send);
      },
    },
    text,
    sendButton,
  );
  const footer = h('div', { class: 'chat-footer' });
  const hidden = h('div', { class: 'chat-hidden' });

  // One channel is named under the title; more will get a row of their own.
  fill(
    container,
    pageHeading('Społeczność', `Czat: ${chat.channels[0].name}`),
    notices,
    empty,
    list,
    footer,
    hidden,
  );

  const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 80;
  const toBottom = () => window.scrollTo({ top: document.documentElement.scrollHeight });

  function messageItem(message) {
    const time = new Date(message.createdAt);
    const today = time.toDateString() === new Date(serverNow()).toDateString();
    return h(
      'li',
      { class: message.own ? 'chat-message chat-message--own' : 'chat-message', 'data-id': String(message.id) },
      h(
        'div',
        { class: 'chat-head' },
        icon(CLASS_ICONS[message.classId] ?? 'person', { size: 14, className: 'chat-class' }),
        h('button', {
          type: 'button',
          class: 'chat-name',
          text: message.name,
          'aria-label': `${message.name}: zobacz postać`,
          onClick: (event) => withButton(event.currentTarget, () => openProfile(message.name)),
        }),
        message.role && h('span', { class: `chat-role chat-role--${message.role}`, text: `(${message.role})` }),
        h('span', { class: 'chat-level', text: `poz. ${message.level}` }),
        h('time', { class: 'chat-time', datetime: time.toISOString(), text: (today ? timeFormat : dateTimeFormat).format(time) }),
      ),
      message.own
        ? h('p', { class: 'chat-text', text: message.text })
        : h('button', { type: 'button', class: 'chat-text chat-text--button', text: message.text, onClick: () => actions(message) }),
    );
  }

  // New messages at the bottom, the oldest over the limit gone from the top.
  // The page follows them down unless the player reads further up.
  function add(fresh) {
    const known = new Set(messages.map((message) => message.id));
    const added = fresh.filter((message) => !known.has(message.id));
    if (added.length === 0) return false;
    const follow = messages.length === 0 || atBottom() || added.some((message) => message.own);
    messages.push(...added);
    list.append(...added.map(messageItem));
    while (messages.length > SHOWN) {
      messages.shift();
      list.firstElementChild?.remove();
    }
    if (follow) toBottom();
    chatSeen(messages.at(-1).id);
    return true;
  }

  function drop(ids) {
    const out = new Set(ids);
    if (out.size === 0) return;
    messages = messages.filter((message) => !out.has(message.id));
    for (const item of [...list.children]) if (out.has(Number(item.dataset.id))) item.remove();
  }

  // Each part changes only when what it shows changes, so the typed message,
  // an open list or a pressed button stay as they are between askings.
  const shown = { notices: null, footer: null, hidden: null };
  const changed = (part, key) => shown[part] !== key && ((shown[part] = key), true);

  function render() {
    const reports = account?.role ? account.reports : 0;
    if (changed('notices', `${error}|${reports}`)) {
      fill(
        notices,
        error && h('p', { class: 'chat-error', role: 'status', text: error }),
        reports > 0 &&
          h('button', {
            type: 'button',
            class: 'button button--world button--small chat-reports',
            text: `Zgłoszenia czekają: ${reports}`,
            onClick: (event) => withButton(event.currentTarget, openReports),
          }),
      );
    }
    empty.hidden = messages.length > 0;
    empty.textContent = account ? 'Nikt jeszcze nic nie napisał. Zacznij rozmowę!' : 'Wczytywanie…';
    const part = !account ? 'loading' : account.mutedUntil ? `muted:${account.mutedUntil}` : account.rulesAccepted ? 'form' : 'rules';
    if (changed('footer', part)) fill(footer, footerPart(part));
    const blocked = account?.blocked ?? [];
    if (changed('hidden', blocked.map((entry) => entry.id).join())) fill(hidden, blocked.length > 0 && hiddenList(blocked));
  }

  function footerPart(part) {
    if (part === 'loading') return null;
    if (part === 'form') return form;
    if (part === 'rules') {
      return h(
        'section',
        { class: 'card chat-rules', 'aria-label': 'Zasady czatu' },
        h('h2', { class: 'card-title', text: 'Zasady czatu' }),
        chat.rules.map((line) => h('p', { text: line })),
        h('button', {
          type: 'button',
          class: 'button button--system',
          text: 'Akceptuję zasady czatu',
          onClick: (event) =>
            withButton(event.currentTarget, async () => {
              await call('POST', '/api/chat/rules');
              account.rulesAccepted = true;
              render();
              text.focus();
            }),
        }),
      );
    }
    return h('p', { class: 'chat-muted', text: `Czat jest dla Ciebie wyciszony ${untilText(account.mutedUntil)}.` });
  }

  function hiddenList(blocked) {
    return h(
      'details',
      { class: 'card chat-blocked' },
      h('summary', { text: `Ukryte postacie (${blocked.length})` }),
      h(
        'ul',
        { class: 'chat-blocked-list' },
        blocked.map((entry) =>
          h(
            'li',
            {},
            h('span', { text: entry.name }),
            h('button', {
              type: 'button',
              class: 'button button--world button--small',
              text: 'Pokaż',
              onClick: (event) =>
                withButton(event.currentTarget, async () => {
                  account.blocked = (await call('POST', '/api/chat/unblock', { id: entry.id })).blocked;
                  // Their messages come back in their places.
                  messages = [];
                  fill(list);
                  await ask();
                }),
            }),
          ),
        ),
      ),
    );
  }

  const act = (label, run, kind = 'world', size = '') =>
    h('button', { type: 'button', class: `button button--${kind} ${size}`.trim(), text: label, onClick: (event) => withButton(event.currentTarget, run) });
  // The moderation's decision on a message; a moderator has none on the
  // messages of the moderation itself.
  const decide = (messageId, action) => call('POST', '/api/chat/moderate', { messageId, action });
  const canModerate = (writerRole) => account?.role === 'admin' || (account?.role === 'moderator' && !writerRole);
  const DONE = { hide: 'Wiadomość usunięta.', keep: 'Wiadomość zostaje.', muteDay: 'Czat wyciszony na dobę.', muteForever: 'Czat wyciszony na stałe.' };

  // The sheet of someone else's message.
  function actions(message) {
    const moderate = (action) => async () => {
      await decide(message.id, action);
      closeSheet();
      toast(DONE[action]);
      if (action === 'hide') drop([message.id]);
    };
    openSheet(
      h('h2', { class: 'sheet-title chat-sheet', text: message.name }),
      h('p', { class: 'sheet-text chat-sheet-text', text: message.text }),
      h(
        'div',
        { class: 'chat-sheet-actions' },
        act('Zobacz postać', () => openProfile(message.name)),
        act(
          'Zgłoś',
          async () => {
            const { text: done } = await call('POST', '/api/chat/report', { messageId: message.id });
            closeSheet();
            toast(done);
          },
          'danger',
        ),
        act('Ukryj wiadomości tej postaci', async () => {
          account.blocked = (await call('POST', '/api/chat/block', { messageId: message.id })).blocked;
          closeSheet();
          drop(messages.filter((other) => other.name === message.name && !other.own).map((other) => other.id));
          render();
          toast(`Wiadomości postaci ${message.name} są ukryte. Pokażesz je pod czatem, w „Ukryte postacie”.`);
        }),
        canModerate(message.role) && [
          h('p', { class: 'chat-sheet-label', text: 'Moderacja' }),
          act('Usuń wiadomość', moderate('hide'), 'danger'),
          act('Wycisz na dobę', moderate('muteDay')),
          act('Wycisz na stałe', moderate('muteForever'), 'danger'),
        ],
      ),
    );
  }

  // The moderation's sheet of reported messages, the longest waiting first;
  // after each decision the list is read anew.
  async function openReports() {
    const { reports } = await call('GET', '/api/chat/reports');
    const decision = (report, action) => async () => {
      await decide(report.messageId, action);
      toast(DONE[action]);
      if (action === 'hide') drop([report.messageId]);
      await openReports();
      ask();
    };
    openSheet(
      h('h2', { class: 'sheet-title chat-sheet', text: 'Zgłoszenia' }),
      reports.length === 0
        ? h('p', { class: 'sheet-text', text: 'Nie ma zgłoszeń do sprawdzenia.' })
        : h(
            'ol',
            { class: 'chat-report-list' },
            reports.map((report) =>
              h(
                'li',
                { class: 'chat-report' },
                h(
                  'p',
                  { class: 'chat-report-head' },
                  h('strong', { text: report.name }),
                  report.role && h('span', { class: `chat-role chat-role--${report.role}`, text: `(${report.role})` }),
                  report.login && h('span', { class: 'chat-report-login', text: report.login }),
                ),
                h('p', { class: 'chat-report-text', text: report.text }),
                h('p', {
                  class: 'chat-report-meta',
                  text: [
                    dateTimeFormat.format(new Date(report.createdAt)),
                    `zgłoszenia: ${report.reports}`,
                    report.hidden && 'ukryta do decyzji',
                    report.mutedUntil && `czat wyciszony ${untilText(report.mutedUntil)}`,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                }),
                canModerate(report.role) &&
                  h(
                    'div',
                    { class: 'chat-report-actions' },
                    act('Usuń', decision(report, 'hide'), 'danger', 'button--small'),
                    act('Zostaw', decision(report, 'keep'), 'world', 'button--small'),
                    act('Wycisz na dobę', decision(report, 'muteDay'), 'world', 'button--small'),
                    act('Wycisz na stałe', decision(report, 'muteForever'), 'danger', 'button--small'),
                  ),
              ),
            ),
          ),
    );
  }

  async function send() {
    const value = text.value.trim();
    if (!value) return;
    const { message } = await call('POST', '/api/chat', { channel, text: value });
    text.value = '';
    add([message]);
    delay = chat.pollSeconds.min;
    ask();
  }

  // The messages after the last one shown, and what was taken down since.
  async function ask() {
    if (asking || gone) return;
    asking = true;
    clearTimeout(timer);
    try {
      const last = messages.at(-1)?.id ?? 0;
      const first = messages[0]?.id ?? 0;
      const answer = await call('GET', `/api/chat?channel=${channel}&after=${last}&from=${first}`);
      drop(answer.hidden);
      const fresh = add(answer.messages);
      delay = fresh ? chat.pollSeconds.min : Math.min(delay + 2, chat.pollSeconds.max);
      account = answer;
      error = null;
    } catch (failure) {
      error = failure.message;
      delay = chat.pollSeconds.max;
    } finally {
      asking = false;
    }
    if (gone) return;
    render();
    if (!document.hidden) timer = setTimeout(ask, delay * 1000);
  }

  // Back in front, the chat asks at once; in the background it waits.
  function onVisible() {
    if (document.hidden) clearTimeout(timer);
    else {
      delay = chat.pollSeconds.min;
      ask();
    }
  }
  document.addEventListener('visibilitychange', onVisible);

  ask();
  return {
    unmount() {
      gone = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      if ($('#sheet')?.open && $('#sheet .chat-sheet')) closeSheet();
    },
  };
}

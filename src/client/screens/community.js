// The Społeczność tab: for now the chat (src/server/chat.js), in its only
// channel so far, Globalny. While the chat is open
// and the page is in front, it asks for new messages every few seconds, and
// less often the longer nothing comes. A tap on someone else's message opens
// its sheet: report it, or hide that player's messages; the author's account
// also takes it down or silences its writer there. The rules come before the
// first message, and the hidden players wait under the chat to be shown again.

import { $, fill, h, icon } from '../dom.js';
import { dateTimeFormat, timeFormat } from '../format.js';
import { CLASS_ICONS } from '../icons.js';
import { call, serverNow, state } from '../state.js';
import { closeSheet, openSheet, pageHeading, toast, withButton } from '../ui.js';

// The most messages the page keeps; older ones leave from the top.
const SHOWN = 200;

export function mountCommunity(container) {
  const chat = state.content.chat;
  const channel = chat.channels[0].id;
  const author = Boolean(state.user?.author);
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
    const parts = [
      h(
        'span',
        { class: 'chat-head' },
        icon(CLASS_ICONS[message.classId] ?? 'person', { size: 14, className: 'chat-class' }),
        h('strong', { class: 'chat-name', text: message.name }),
        h('span', { class: 'chat-level', text: `poz. ${message.level}` }),
        h('time', { class: 'chat-time', datetime: time.toISOString(), text: (today ? timeFormat : dateTimeFormat).format(time) }),
      ),
      h('span', { class: 'chat-text', text: message.text }),
    ];
    return h(
      'li',
      { class: message.own ? 'chat-message chat-message--own' : 'chat-message', 'data-id': String(message.id) },
      message.own ? h('div', { class: 'chat-body' }, parts) : h('button', { type: 'button', class: 'chat-body', onClick: () => actions(message) }, parts),
    );
  }

  // New messages at the bottom, the oldest over the limit gone from the top.
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
    const reports = author ? account?.reports ?? 0 : 0;
    if (changed('notices', `${error}|${reports}`)) {
      fill(
        notices,
        error && h('p', { class: 'chat-error', role: 'status', text: error }),
        reports > 0 && h('a', { class: 'button button--world button--small chat-reports', href: '#/autor', text: `Zgłoszenia czekają: ${reports}` }),
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
    const until = account.mutedUntil;
    return h('p', { class: 'chat-muted', text: until >= 8.64e15 ? 'Czat jest dla Ciebie wyciszony na stałe.' : `Czat jest dla Ciebie wyciszony do ${dateTimeFormat.format(new Date(until))}.` });
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

  // The sheet of someone else's message.
  function actions(message) {
    const act = (label, run, kind = 'world') =>
      h('button', { type: 'button', class: `button button--${kind}`, text: label, onClick: (event) => withButton(event.currentTarget, run) });
    const moderate = (action, done) => async () => {
      await call('POST', '/api/author/chat', { messageId: message.id, action });
      closeSheet();
      toast(done);
      if (action === 'hide') drop([message.id]);
    };
    openSheet(
      h('h2', { class: 'sheet-title', text: message.name }),
      h('p', { class: 'sheet-text chat-sheet-text', text: message.text }),
      h(
        'div',
        { class: 'chat-sheet-actions' },
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
        author && [
          h('p', { class: 'chat-sheet-label', text: 'Autor gry' }),
          act('Usuń wiadomość', moderate('hide', 'Wiadomość usunięta.'), 'danger'),
          act('Wycisz na dobę', moderate('muteDay', `Czat dla ${message.name} wyciszony na dobę.`)),
          act('Wycisz na stałe', moderate('muteForever', `Czat dla ${message.name} wyciszony na stałe.`), 'danger'),
        ],
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
      if ($('#sheet')?.open && $('.chat-sheet-actions')) closeSheet();
    },
  };
}

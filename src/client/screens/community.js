// The Społeczność tab, from character level 5. A list at its top, folded to
// the part shown, picks one of its parts (data/community.json): the Czat,
// the Znajomi with their daily Upominek (friends.js), the Ranking postaci
// (ranking.js), and the Gildie and the Drużyna still to come ("Wkrótce").
// It opens on the part with news (chat-news.js), else on the one last shown
// on the device; while the narrator has not shown the chat's rules yet
// (narrator.js), on the Czat. News in a part not shown lights the folded
// list too. By the list a bell mutes the Globalny's light on the tab.
//
// The chat (src/server/chat.js) has a tab for its only channel so far,
// Globalny, and one for each private conversation, which only its two
// characters see; "Prywatna wiadomość" on a character's sheet opens one
// (profile.js). The newest messages are at the bottom, over the line to
// write in. While the chat
// is open and the page is in front, it asks for new messages every few
// seconds, and less often the longer nothing comes. A tap on a name shows
// that character (profile.js); a tap on someone else's message opens its
// sheet: report it, or hide that player's messages. The moderation (the
// admin and the moderators, marked by their names) also takes it down or
// silences its writer there, and has the reports in a sheet of their own.
// The rules come before the first message, and the hidden players wait over
// the chat to be shown again. The chat reaches down to the bottom bar, so
// the line to write in stays at the bottom of the screen, the messages right
// over it.

import { $, fill, h, icon } from '../dom.js';
import { dateTimeFormat, timeFormat } from '../format.js';
import {
  chatMuted,
  chatNews,
  chatSeen,
  conversationNews,
  conversationsSeen,
  friendNews,
  globalNews,
  onChatNews,
  privateRead,
  setChatMuted,
  takeConversation,
} from '../chat-news.js';
import { CLASS_ICONS } from '../icons.js';
import { openProfile } from '../profile.js';
import { call, isUnlocked, serverNow, state } from '../state.js';
import { closeSheet, openSheet, pageHeading, toast, withButton } from '../ui.js';
import { mountFriends } from './friends.js';
import { lockedScreen } from './locked.js';
import { mountRanking } from './ranking.js';

// The most messages the page keeps; older ones leave from the top.
const SHOWN = 200;

// A silence "na stałe" (chat.js).
const FOREVER = 8.64e15;
const untilText = (until) => (until >= FOREVER ? 'na stałe' : `do ${dateTimeFormat.format(new Date(until))}`);

const SECTION_KEY = 'insight-community-section';
const SECTION_ICONS = { chat: 'chat', friends: 'people', ranking: 'trophy', guilds: 'banner', party: 'swords' };
const SECTION_NEWS = { chat: chatNews, friends: friendNews };

export function mountCommunity(container, context) {
  if (!isUnlocked('community')) return lockedScreen('community', 'Społeczność')(container, context);
  const MOUNTS = { chat: mountChat, friends: mountFriends, ranking: mountRanking };
  const sections = state.content.community.sections;
  const asked = takeConversation();
  let current = asked ? 'chat' : firstSection(sections);
  let part = null;
  const body = h('div', { class: 'community-body' });
  const picker = sectionPicker(sections, () => current, show);
  fill(container, pageHeading('Społeczność'), picker.element, body);

  // The list stays under the top bar while the page scrolls, so it is at
  // hand under a long chat too (styles.css).
  const topbar = $('.topbar');
  const stick = () => picker.element.style.setProperty('--community-top', `${topbar?.offsetHeight ?? 0}px`);
  const watcher = topbar && typeof ResizeObserver === 'function' ? new ResizeObserver(stick) : null;
  watcher?.observe(topbar);
  stick();

  // A part shown, with the bar under the list for its own row (the chat's
  // tabs); `person` is the private conversation for the chat to open.
  function show(id, person = null) {
    current = id;
    try {
      localStorage.setItem(SECTION_KEY, id);
    } catch {
      // Remembered for this visit only.
    }
    part?.unmount();
    fill(body);
    fill(picker.bar);
    part = MOUNTS[id](body, { bar: picker.bar, person });
    picker.render();
  }

  // "Prywatna wiadomość" on a character's sheet, shown over this screen.
  const stopAsking = onChatNews(() => {
    const person = takeConversation();
    if (!person) return;
    if (current === 'chat') part.talkTo(person);
    else show('chat', person);
  });

  show(current, asked);
  return {
    unmount() {
      part?.unmount();
      picker.unmount();
      stopAsking();
      watcher?.disconnect();
    },
  };
}

function firstSection(sections) {
  if (!state.character.tutorial.includes('community-rules')) return 'chat';
  const open = sections.filter((section) => !section.soon).map((section) => section.id);
  const news = open.find((id) => SECTION_NEWS[id]?.());
  if (news) return news;
  let kept = null;
  try {
    kept = localStorage.getItem(SECTION_KEY);
  } catch {
    // The first part, then.
  }
  return open.includes(kept) ? kept : open[0];
}

// The bar with the part shown and the list it unfolds; a tap outside folds
// it again. The parts still to come cannot be picked yet.
function sectionPicker(sections, current, choose) {
  const list = h('ul', { class: 'community-sections', id: 'community-sections', hidden: true });
  const toggle = h('button', {
    type: 'button',
    class: 'community-toggle',
    'aria-expanded': 'false',
    'aria-controls': 'community-sections',
    onClick: () => unfold(list.hidden),
  });
  const bell = h('button', {
    type: 'button',
    class: 'community-bell',
    onClick: () => {
      setChatMuted(!chatMuted());
      toast(chatMuted() ? 'Powiadomienia czatu wyciszone: nowe wiadomości nie zapalą kropki na Społeczności.' : 'Powiadomienia czatu włączone.');
      render();
    },
  });
  const bar = h('div', { class: 'community-bar' });
  const element = h('div', { class: 'community-picker' }, h('div', { class: 'community-picker-row' }, toggle, bell, list), bar);

  function unfold(open) {
    list.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  }

  const label = (section) => [
    icon(SECTION_ICONS[section.id] ?? 'unknown', { size: 20, className: 'community-icon' }),
    h('span', { class: 'community-name', text: section.name }),
    SECTION_NEWS[section.id]?.() && h('span', { class: 'community-dot', role: 'img', 'aria-label': 'nowe' }),
    section.soon && h('span', { class: 'community-soon', text: 'Wkrótce' }),
  ];

  function render() {
    const shown = sections.find((section) => section.id === current());
    const elsewhere = sections.some((section) => section.id !== shown.id && SECTION_NEWS[section.id]?.());
    fill(
      toggle,
      label(shown),
      elsewhere && h('span', { class: 'community-dot community-dot--elsewhere', role: 'img', 'aria-label': 'nowe w innej części' }),
      icon('chevron', { size: 18, className: 'community-chevron' }),
    );
    fill(
      list,
      sections.map((section) =>
        h(
          'li',
          {},
          h(
            'button',
            {
              type: 'button',
              class: 'community-section',
              disabled: Boolean(section.soon),
              'aria-current': section.id === shown.id ? 'true' : undefined,
              onClick: () => {
                unfold(false);
                if (section.id !== current()) choose(section.id);
              },
            },
            label(section),
          ),
        ),
      ),
    );
    const muted = chatMuted();
    bell.hidden = shown.id !== 'chat';
    bell.setAttribute('aria-pressed', String(muted));
    bell.setAttribute('aria-label', 'Wycisz powiadomienia czatu');
    bell.title = muted ? 'Powiadomienia czatu wyciszone' : 'Powiadomienia czatu włączone';
    fill(bell, icon(muted ? 'bell-off' : 'bell', { size: 20 }));
  }

  const outside = (event) => {
    if (!list.hidden && !element.contains(event.target)) unfold(false);
  };
  document.addEventListener('pointerdown', outside);
  const stop = onChatNews(render);
  return {
    element,
    bar,
    render,
    unmount() {
      document.removeEventListener('pointerdown', outside);
      stop();
    },
  };
}

// The Czat: its tabs, its notices, the players hidden and the room of
// messages. `person` is the private conversation to open first.
function mountChat(container, { bar, person = null }) {
  const chat = state.content.chat;
  const channel = chat.channels[0];
  // The other character of the private conversation shown, null on the
  // Globalny, and the private conversations for the tabs.
  let talk = person && { id: person.id, name: person.name };
  let conversations = [];
  let messages = [];
  let account = null;
  // Whether the tab shown has had its first answer.
  let loaded = false;
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
    placeholder: talk ? `Do postaci ${talk.name}…` : 'Napisz wiadomość…',
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
  // The narrator points here at the chat's rules (narrator.js).
  const footer = h('div', { class: 'chat-footer', 'data-guide': 'community-rules' });
  const hidden = h('div', { class: 'chat-hidden' });
  const room = h('div', { class: 'chat-room' }, empty, list, footer);

  const tabs = h('div', { class: 'chat-tabs', role: 'tablist', 'aria-label': 'Rozmowy' });
  fill(bar, tabs);
  fill(container, notices, hidden, room);

  const tab = (label, selected, news, pick) =>
    h(
      'button',
      { type: 'button', class: 'chat-tab', role: 'tab', 'aria-selected': String(selected), onClick: pick },
      h('span', { class: 'chat-tab-name', text: label }),
      news && h('span', { class: 'community-dot', role: 'img', 'aria-label': 'nowe' }),
    );

  // The Globalny first, then the conversations, the most recent first; one
  // opened from a sheet shows before its first message too.
  function renderTabs() {
    const entries = talk && !conversations.some((entry) => entry.id === talk.id) ? [{ ...talk, latest: 0 }, ...conversations] : conversations;
    fill(
      tabs,
      tab(channel.name, !talk, Boolean(talk) && globalNews(), () => talkTo(null)),
      entries.map((entry) => tab(entry.name, entry.id === talk?.id, entry.id !== talk?.id && conversationNews(entry.id, entry.latest), () => talkTo(entry))),
    );
  }

  // Another tab: its messages from the start, asked for at once.
  function talkTo(next) {
    if ((next?.id ?? 0) === (talk?.id ?? 0)) return;
    talk = next && { id: next.id, name: next.name };
    messages = [];
    fill(list);
    loaded = false;
    error = null;
    delay = chat.pollSeconds.min;
    text.placeholder = talk ? `Do postaci ${talk.name}…` : 'Napisz wiadomość…';
    renderTabs();
    render();
    ask();
  }

  // The room is as tall as the screen under where it starts (styles.css),
  // counted without the camera's zoom.
  function fit() {
    let top = 0;
    for (let node = room; node; node = node.offsetParent) top += node.offsetTop;
    room.style.setProperty('--chat-top', `${top}px`);
  }

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
    if (talk) privateRead(talk.id, messages.at(-1).id);
    else chatSeen(messages.at(-1).id);
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
    empty.textContent = !loaded
      ? 'Wczytywanie…'
      : talk
        ? `Napisz do postaci ${talk.name}. Tę rozmowę widzicie tylko Wy dwoje.`
        : 'Nikt jeszcze nic nie napisał. Zacznij rozmowę!';
    const part = !account ? 'loading' : account.mutedUntil ? `muted:${account.mutedUntil}` : account.rulesAccepted ? 'form' : 'rules';
    if (changed('footer', part)) fill(footer, footerPart(part));
    const blocked = account?.blocked ?? [];
    if (changed('hidden', blocked.map((entry) => entry.id).join())) fill(hidden, blocked.length > 0 && hiddenList(blocked));
    fit();
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
        !talk &&
          act('Prywatna wiadomość', () => {
            closeSheet();
            talkTo({ id: message.characterId, name: message.name });
          }),
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
          toast(`Wiadomości postaci ${message.name} są ukryte. Pokażesz je nad czatem, w „Ukryte postacie”.`);
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
                    report.private && 'prywatna',
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
    const { message } = await call('POST', '/api/chat', talk ? { with: talk.id, text: value } : { channel: channel.id, text: value });
    text.value = '';
    add([message]);
    delay = chat.pollSeconds.min;
    ask();
  }

  // The messages of the tab after the last one shown, and what was taken
  // down since.
  async function ask() {
    if (asking || gone) return;
    asking = true;
    clearTimeout(timer);
    const asked = talk;
    let answer = null;
    let failure = null;
    try {
      const last = messages.at(-1)?.id ?? 0;
      const first = messages[0]?.id ?? 0;
      const where = asked ? `with=${asked.id}` : `channel=${channel.id}`;
      answer = await call('GET', `/api/chat?${where}&after=${last}&from=${first}`);
    } catch (problem) {
      failure = problem;
    } finally {
      asking = false;
    }
    if (gone) return;
    // Another tab was opened meanwhile: this answer is not for it.
    if (asked !== talk) {
      ask();
      return;
    }
    if (failure) {
      error = failure.message;
      delay = chat.pollSeconds.max;
    } else {
      drop(answer.hidden);
      const fresh = add(answer.messages);
      delay = fresh ? chat.pollSeconds.min : Math.min(delay + 2, chat.pollSeconds.max);
      account = answer;
      loaded = true;
      error = null;
      conversations = answer.conversations;
      conversationsSeen(conversations);
    }
    renderTabs();
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
  window.addEventListener('resize', fit);
  const stopNews = onChatNews(renderTabs);

  renderTabs();
  fit();
  ask();
  return {
    unmount() {
      gone = true;
      clearTimeout(timer);
      stopNews();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('resize', fit);
      if ($('#sheet')?.open && $('#sheet .chat-sheet')) closeSheet();
    },
    talkTo,
  };
}

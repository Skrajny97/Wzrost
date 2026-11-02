// The Społeczność tab, from character level 5. A list at its top, folded to
// the part shown, picks one of its parts (data/community.json): the Czat,
// the Znajomi with their daily Upominek (friends.js), the Ranking postaci
// (ranking.js), the Drużyna (party.js) and the Gildia (guild.js).
// It opens on the part with news (chat-news.js), else on the one last shown
// on the device; while the narrator has not shown the chat's rules yet
// (narrator.js), on the Czat. News in a part not shown lights the folded
// list too. By the list a bell mutes the Globalny's light on the tab. Under
// it waits a Wymiana proposed or going on (trade.js).
//
// The chat (src/server/chat.js) has a tab for each channel, Globalny and
// Wymiana, the Gildia's of the character's guild, which only its members
// see (guilds.js), and one for each private conversation, which only its two
// characters see; "Prywatna wiadomość" on a character's sheet opens one
// (profile.js), and its × closes it until a newer message comes. In the
// Wymiana a message can show up to three items of the bag, picked under the
// line to write in, for offers made in words; a tap on one shows its card.
// The newest messages are at the bottom, over the line to
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
  guildChannel,
  guildChannelNews,
  guildNews,
  guildRead,
  guildTodoNews,
  partyNews,
  onChatNews,
  privateRead,
  setChatMuted,
  takeConversation,
} from '../chat-news.js';
import { CLASS_ICONS } from '../icons.js';
import { openProfile } from '../profile.js';
import { call, isUnlocked, serverNow, state } from '../state.js';
import { closeSheet, framedName, guildTag, openSheet, pageHeading, toast, withButton } from '../ui.js';
import { itemDetails, itemSummary } from './character.js';
import { mountFriends } from './friends.js';
import { mountParty } from './party.js';
import { lockedScreen } from './locked.js';
import { mountRanking } from './ranking.js';
import { tradeBanner } from './trade.js';

// The most messages the page keeps; older ones leave from the top.
const SHOWN = 200;

// The guild's channel among the chat's tabs (chat.js resolves it).
const GUILD = { id: 'guild', name: 'Gildia' };

// A silence "na stałe" (chat.js).
const FOREVER = 8.64e15;
const untilText = (until) => (until >= FOREVER ? 'na stałe' : `do ${dateTimeFormat.format(new Date(until))}`);

const SECTION_KEY = 'insight-community-section';
// The part whose tab opens the Gildia's own page (screens/guild.js).
const GUILD_PAGE_SECTION = 'guilds';
const SECTION_ICONS = { chat: 'chat', friends: 'people', ranking: 'trophy', guilds: 'banner', party: 'swords' };
const SECTION_NEWS = { chat: chatNews, friends: friendNews, party: partyNews, guilds: () => guildNews() || guildTodoNews() };

export function mountCommunity(container, context) {
  if (!isUnlocked('community')) return lockedScreen('community', 'Społeczność')(container, context);
  const MOUNTS = { chat: mountChat, friends: mountFriends, ranking: mountRanking, party: mountParty };
  const sections = state.content.community.sections;
  const asked = takeConversation();
  let current = asked ? 'chat' : firstSection(sections);
  let part = null;
  const body = h('div', { class: 'community-body' });
  const picker = sectionPicker(sections, () => current, show);
  const trade = h('div', { class: 'community-trade' }, tradeBanner());
  fill(container, pageHeading('Społeczność'), picker.element, trade, body);

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
    // The Gildia has a page of its own (the author: "ona powinna uruchamiać
    // osobną stronę"), so its tab leads there.
    if (id === GUILD_PAGE_SECTION) {
      location.hash = '#/gildia';
      return;
    }
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

  // "Prywatna wiadomość" on a character's sheet, shown over this screen,
  // and the Wymiana as it is now.
  const stopAsking = onChatNews(() => {
    fill(trade, tradeBanner());
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
  const open = sections.filter((section) => !section.soon && section.id !== GUILD_PAGE_SECTION).map((section) => section.id);
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

// The parts as a row of tabs scrolling sideways, each with its light of
// news, one tap away (the author: 321 A, instead of a list to unfold), and
// the bell muting the chat's light beside them. The parts still to come
// cannot be picked yet.
function sectionPicker(sections, current, choose) {
  // The row the narrator's Społeczność chapter points at (narrator.js).
  const tabs = h('div', { class: 'community-tabs', role: 'tablist', 'aria-label': 'Części Społeczności', 'data-guide': 'community-tabs' });
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
  const element = h('div', { class: 'community-picker' }, h('div', { class: 'community-picker-row' }, tabs, bell), bar);

  const label = (section) => [
    icon(SECTION_ICONS[section.id] ?? 'unknown', { size: 20, className: 'community-icon' }),
    h('span', { class: 'community-name', text: section.name }),
    SECTION_NEWS[section.id]?.() && h('span', { class: 'community-dot', role: 'img', 'aria-label': 'nowe' }),
    section.soon && h('span', { class: 'community-soon', text: 'Wkrótce' }),
  ];

  function render() {
    const shown = sections.find((section) => section.id === current());
    fill(
      tabs,
      sections.map((section) =>
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            class: 'community-tab',
            disabled: Boolean(section.soon),
            'aria-selected': String(section.id === shown.id),
            onClick: () => {
              if (section.id !== current()) choose(section.id);
            },
          },
          label(section),
        ),
      ),
    );
    // The part shown stays in sight in the row.
    tabs.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const muted = chatMuted();
    bell.hidden = shown.id !== 'chat';
    bell.setAttribute('aria-pressed', String(muted));
    bell.setAttribute('aria-label', 'Wycisz powiadomienia czatu');
    bell.title = muted ? 'Powiadomienia czatu wyciszone' : 'Powiadomienia czatu włączone';
    fill(bell, icon(muted ? 'bell-off' : 'bell', { size: 20 }));
  }

  const stop = onChatNews(render);
  return {
    element,
    bar,
    render,
    unmount() {
      stop();
    },
  };
}

// The Czat: its tabs, its notices, the players hidden and the room of
// messages. `person` is the private conversation to open first.
// Also in the side column on a computer (side.js), with its own `id` for
// the line to write in, scrolling in its own box (`scroller`) and not the
// page.
export function mountChat(container, { bar, person = null, id = 'chat', scroller = null }) {
  const chat = state.content.chat;
  // The channel shown, or the other character of the private conversation
  // shown (null on a channel), and the private conversations for the tabs.
  let channel = chat.channels[0];
  let talk = person && { id: person.id, name: person.name };
  // The items of the bag the next message in the Wymiana shows.
  let attached = [];
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
  const placeholder = () => (talk ? `Do postaci ${talk.name}…` : channel.items ? 'Napisz ofertę…' : 'Napisz wiadomość…');
  const text = h('input', {
    type: 'text',
    id: `${id}-text`,
    maxlength: String(chat.maxLength),
    autocomplete: 'off',
    enterkeyhint: 'send',
    placeholder: placeholder(),
    'aria-label': 'Wiadomość',
  });
  const sendButton = h('button', { type: 'submit', class: 'button button--system chat-send', text: 'Wyślij' });
  const attachButton = h(
    'button',
    { type: 'button', class: 'icon-button chat-attach', 'aria-label': 'Pokaż przedmioty z plecaka', onClick: pickItems },
    icon('pouch', { size: 20 }),
  );
  const attachedList = h('ul', { class: 'chat-attached', 'aria-label': 'Przedmioty w wiadomości' });
  const form = h(
    'form',
    {
      class: 'chat-form',
      onSubmit: (event) => {
        event.preventDefault();
        withButton(sendButton, send);
      },
    },
    attachedList,
    h('div', { class: 'chat-form-row' }, attachButton, text, sendButton),
  );

  // The items picked for the next message, each with a × to leave it out;
  // the button to pick them only in a channel with items.
  function renderAttached() {
    attachButton.hidden = Boolean(talk) || !channel.items;
    fill(
      attachedList,
      attached.map((item) =>
        h(
          'li',
          { class: 'chat-attached-item' },
          h('span', { class: 'item-name', vars: { '--rarity': item.color }, text: item.name }),
          h(
            'button',
            {
              type: 'button',
              class: 'chat-attached-drop',
              'aria-label': `Bez przedmiotu ${item.name}`,
              onClick: () => {
                attached = attached.filter((other) => other.id !== item.id);
                renderAttached();
              },
            },
            icon('close', { size: 14 }),
          ),
        ),
      ),
    );
    attachedList.hidden = attached.length === 0;
  }

  // The bag in a sheet: up to chat.itemsMax of its items for the message.
  function pickItems() {
    const bag = state.character.bag ?? [];
    const picked = new Set(attached.map((item) => item.id).filter((id) => bag.some((item) => item.id === id)));
    const count = h('p', { class: 'muted' });
    const showCount = () => {
      count.textContent = `Wybrane: ${picked.size} z ${chat.itemsMax}.`;
    };
    showCount();
    const rows = bag.map((item) => {
      const row = h(
        'button',
        {
          type: 'button',
          class: 'item-row trade-pick',
          'aria-pressed': String(picked.has(item.id)),
          onClick: () => {
            if (picked.has(item.id)) picked.delete(item.id);
            else if (picked.size >= chat.itemsMax) {
              toast(`Jedna wiadomość pokaże najwyżej ${chat.itemsMax} przedmioty.`);
              return;
            } else picked.add(item.id);
            row.setAttribute('aria-pressed', String(picked.has(item.id)));
            showCount();
          },
        },
        itemSummary(item),
        h('span', { class: 'trade-pick-mark', 'aria-hidden': 'true' }, icon('check', { size: 18 })),
      );
      return h('li', {}, row);
    });
    openSheet(
      h('h2', { class: 'sheet-title chat-sheet', text: 'Przedmioty do oferty' }),
      h('p', { class: 'sheet-text', text: 'Wiadomość pokaże je wszystkim w Wymianie, tak jak wyglądają teraz. Same przedmioty zostają w plecaku.' }),
      bag.length === 0 ? h('p', { class: 'muted', text: 'W plecaku nie ma przedmiotów. Założonych nie pokażesz.' }) : [count, h('ul', { class: 'item-list' }, rows)],
      h(
        'div',
        { class: 'sheet-actions' },
        h('button', { type: 'button', class: 'button button--world', text: 'Anuluj', onClick: closeSheet }),
        h('button', {
          type: 'button',
          class: 'button button--system',
          text: 'Gotowe',
          onClick: () => {
            attached = bag.filter((item) => picked.has(item.id));
            closeSheet();
            renderAttached();
            text.focus();
          },
        }),
      ),
    );
  }

  // An item a message shows, in a sheet of its own.
  const showItem = (item) =>
    openSheet(
      itemDetails(item),
      h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--world', text: 'Zamknij', onClick: closeSheet })),
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

  // A private conversation's tab, with the × that closes it.
  const privateTab = (entry) =>
    h(
      'span',
      { class: 'chat-tab-wrap' },
      tab(entry.name, entry.id === talk?.id, entry.id !== talk?.id && conversationNews(entry.id, entry.latest), () => switchTo(channel, entry)),
      h(
        'button',
        {
          type: 'button',
          class: 'chat-tab-close',
          'aria-label': `Zamknij rozmowę z postacią ${entry.name}`,
          onClick: (event) => withButton(event.currentTarget, () => closeTalk(entry)),
        },
        icon('close', { size: 12 }),
      ),
    );

  // The channels first, the guild's among them while the character is in
  // one, then the conversations, the most recent first; one opened from a
  // sheet shows before its first message too. The Globalny's and the
  // guild's tabs light for their news.
  function renderTabs() {
    const entries = talk && !conversations.some((entry) => entry.id === talk.id) ? [{ ...talk, latest: 0 }, ...conversations] : conversations;
    const channels = [...chat.channels, ...(guildChannel() ? [GUILD] : [])];
    const lit = (entry, index) => (Boolean(talk) || channel.id !== entry.id) && (entry === GUILD ? guildChannelNews() : index === 0 && globalNews());
    fill(
      tabs,
      channels.map((entry, index) => tab(entry.name, !talk && entry.id === channel.id, lit(entry, index), () => switchTo(entry, null))),
      entries.map(privateTab),
    );
  }

  // Another tab: its messages from the start, asked for at once.
  function switchTo(nextChannel, next) {
    if (next ? next.id === talk?.id : !talk && nextChannel.id === channel.id) return;
    channel = nextChannel;
    talk = next && { id: next.id, name: next.name };
    attached = [];
    messages = [];
    fill(list);
    loaded = false;
    error = null;
    delay = chat.pollSeconds.min;
    text.placeholder = placeholder();
    renderAttached();
    renderTabs();
    render();
    ask();
  }
  const talkTo = (next) => switchTo(next ? channel : chat.channels[0], next);

  // A private conversation out of the tabs until a newer message comes.
  async function closeTalk(entry) {
    await call('POST', '/api/chat/close', { with: entry.id });
    conversations = conversations.filter((other) => other.id !== entry.id);
    conversationsSeen(conversations);
    if (talk?.id === entry.id) switchTo(channel, null);
    else renderTabs();
  }

  // The room is as tall as the screen under where it starts (styles.css),
  // counted without the camera's zoom.
  function fit() {
    let top = 0;
    for (let node = room; node; node = node.offsetParent) top += node.offsetTop;
    room.style.setProperty('--chat-top', `${top}px`);
  }

  const atBottom = () =>
    scroller
      ? scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 80
      : window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 80;
  const toBottom = () => (scroller ? scroller.scrollTo({ top: scroller.scrollHeight }) : window.scrollTo({ top: document.documentElement.scrollHeight }));
  // Whether the page follows the messages down once the answer is shown:
  // the line to write in comes under them with the first answer, after
  // they are added, and would hide the newest (the author: "niech czat
  // domyślnie wyświetla sam dół wszystkich wiadomości - najnowsze po
  // prostu").
  let following = false;

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
        framedName(
          h('button', {
            type: 'button',
            class: 'chat-name',
            text: message.name,
            'aria-label': `${message.name}: zobacz postać`,
            onClick: (event) => withButton(event.currentTarget, () => openProfile(message.name)),
          }),
          message.nameColor,
        ),
        guildTag(message.guildTag),
        message.role && h('span', { class: `chat-role chat-role--${message.role}`, text: `(${message.role})` }),
        h('span', { class: 'chat-level', text: `poz. ${message.level}` }),
        h('time', { class: 'chat-time', datetime: time.toISOString(), text: (today ? timeFormat : dateTimeFormat).format(time) }),
      ),
      message.own
        ? h('p', { class: 'chat-text', text: message.text })
        : h('button', { type: 'button', class: 'chat-text chat-text--button', text: message.text, onClick: () => actions(message) }),
      message.items?.length > 0 &&
        h(
          'ul',
          { class: 'chat-items', 'aria-label': 'Przedmioty w ofercie' },
          message.items.map((item) => h('li', {}, h('button', { type: 'button', class: 'item-row chat-item', onClick: () => showItem(item) }, itemSummary(item)))),
        ),
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
    following = following || follow;
    if (talk) privateRead(talk.id, messages.at(-1).id);
    else if (channel.id === GUILD.id) guildRead(messages.at(-1).id);
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
    const items = attached.map((item) => item.id);
    const { message } = await call(
      'POST',
      '/api/chat',
      talk ? { with: talk.id, text: value } : { channel: channel.id, text: value, ...(items.length > 0 && { items }) },
    );
    text.value = '';
    attached = [];
    renderAttached();
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
    const askedChannel = channel;
    let answer = null;
    let failure = null;
    try {
      const last = messages.at(-1)?.id ?? 0;
      const first = messages[0]?.id ?? 0;
      const where = asked ? `with=${asked.id}` : `channel=${askedChannel.id}`;
      answer = await call('GET', `/api/chat?${where}&after=${last}&from=${first}`);
    } catch (problem) {
      failure = problem;
    } finally {
      asking = false;
    }
    if (gone) return;
    // Another tab was opened meanwhile: this answer is not for it.
    if (asked !== talk || askedChannel !== channel) {
      ask();
      return;
    }
    // Out of the guild meanwhile: back to the Globalny.
    if (failure?.code === 'no_guild' && askedChannel === GUILD) {
      switchTo(chat.channels[0], null);
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
    if (following) {
      following = false;
      toBottom();
      // Once more after the browser lays the page out anew.
      requestAnimationFrame(toBottom);
    }
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

  renderAttached();
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

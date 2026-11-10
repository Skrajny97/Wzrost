// The Społeczność tab, from character level 5. A list at its top, folded to
// the part shown, picks one of its parts (data/community.json): the Znajomi
// with their daily Upominek (friends.js), the Ranking postaci (ranking.js),
// the Drużyna (party.js), the Gildia (guild.js) and the Sława, the
// character's Punkty Sławy (fame.js). The Czat is not among them (the
// author, 10.11.2026: „Czat miał zniknąć z zakładki Społeczność a dalej tam
// jest”, „tylko z zakładki”): on a phone it opens from the round button
// over the game (../chat-bubble.js, screens/chat.js), on a computer it
// stands in the side column (../side.js); mountChat below draws it there.
// It opens on the part its address names (#/spolecznosc/znajomi, from the
// shortcuts in the computer's menu), else on the part with news
// (chat-news.js), else on the one last shown on the device. News in a part
// not shown lights the folded list too. Under it waits a Wymiana proposed or
// going on (trade.js).
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
//
// "@" and the start of a name in the line suggests the characters that may
// be tagged in the tab shown (those who wrote there lately, the friends
// and the guild's members; in a private conversation its other one), and
// a tap puts "@" and the whole name in (../mentions.js). "Oznacz" in a
// message's sheet and on a character's sheet does the same. A message that
// tags the player shows gilded, and the tab of its channel lights until it
// is read (chat-news.js, src/server/mentions.js).

import { $, fill, h, icon } from '../dom.js';
import { dateTimeFormat, timeFormat } from '../format.js';
import {
  channelNews,
  channelRead,
  chatMuted,
  conversationNews,
  conversationsSeen,
  fameNews,
  friendNews,
  guildChannel,
  guildNews,
  guildRead,
  guildTodoNews,
  mentionChannel,
  mentionNews,
  partyNews,
  onChatNews,
  privateRead,
  setChatMuted,
} from '../chat-news.js';
import { discordButton } from '../discord.js';
import { language, t } from '../i18n.js';
import { CLASS_ICONS } from '../icons.js';
import { appendMention, matchingPeople, taggedParts, typedMention, withMention } from '../mentions.js';
import { openProfile } from '../profile.js';
import { call, isUnlocked, serverNow, state } from '../state.js';
import { closeSheet, framedName, guildTag, openSheet, pageHeading, toast, withButton } from '../ui.js';
import { itemDetails, itemSummary } from './character.js';
import { mountFame } from './fame.js';
import { mountFriends } from './friends.js';
import { mountParty } from './party.js';
import { lockedScreen } from './locked.js';
import { mountRanking } from './ranking.js';
import { tradeBanner } from './trade.js';

// The admin's links in a message (src/server/chat.js, ADMIN_LINK): a label
// in square brackets with its address in round ones shows as the label, a
// bare address as itself, each opening in a new card; only http(s).
const LINKED = /\[([^[\]]{1,80})\]\((https?:\/\/[^\s()]{1,500})\)|(https?:\/\/[^\s()]{1,500})/giu;
function linkedText(text) {
  const parts = [];
  let at = 0;
  for (const found of text.matchAll(LINKED)) {
    const [whole, label, labelled, bare] = found;
    const address = labelled ?? bare;
    let safe = null;
    try {
      const url = new URL(address);
      if (url.protocol === 'https:' || url.protocol === 'http:') safe = url.href;
    } catch {
      safe = null;
    }
    if (found.index > at) parts.push(text.slice(at, found.index));
    parts.push(safe ? h('a', { class: 'chat-link', href: safe, target: '_blank', rel: 'noopener noreferrer', text: label ?? bare }) : whole);
    at = found.index + whole.length;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}
const hasLink = (message) => message.role === 'admin' && /https?:\/\//i.test(message.text);

// The most messages the page keeps; older ones leave from the top.
const SHOWN = 200;

// The guild's channel among the chat's tabs (chat.js resolves it), its
// name in the page's language.
const GUILD = {
  id: 'guild',
  get name() {
    return t('Gildia');
  },
};

// A silence "na stałe" (chat.js).
const FOREVER = 8.64e15;
const untilText = (until) => (until >= FOREVER ? t('na stałe') : t('do {time}', { time: dateTimeFormat.format(new Date(until)) }));

const SECTION_KEY = 'insight-community-section';
// The part whose tab opens the Gildia's own page (screens/guild.js).
const GUILD_PAGE_SECTION = 'guilds';
// The parts' icons and lights of news, also for their shortcuts under
// Społeczność in the computer's menu (layout.js).
export const SECTION_ICONS = { friends: 'people', ranking: 'trophy', guilds: 'banner', party: 'swords', fame: 'star' };
export const SECTION_NEWS = { friends: friendNews, party: partyNews, guilds: () => guildNews() || guildTodoNews(), fame: fameNews };
// The address that opens the tab at a part (app.js), for those shortcuts;
// the Gildia has its page.
const SECTION_SLUGS = { friends: 'znajomi', ranking: 'ranking', party: 'druzyna', fame: 'slawa' };
export const sectionHash = (id) => (id === GUILD_PAGE_SECTION ? '#/gildia' : SECTION_SLUGS[id] ? `#/spolecznosc/${SECTION_SLUGS[id]}` : '#/spolecznosc');

export function mountCommunity(container, context) {
  if (!isUnlocked('community')) return lockedScreen('community', 'Społeczność')(container, context);
  const MOUNTS = { friends: mountFriends, ranking: mountRanking, party: mountParty, fame: mountFame };
  const sections = state.content.community.sections;
  // A part named in the address (a shortcut in the computer's menu), when
  // it is open.
  const named = Object.keys(SECTION_SLUGS).find((id) => SECTION_SLUGS[id] === context.params?.section && sections.some((section) => section.id === id && !section.soon));
  let current = named ?? firstSection(sections);
  let part = null;
  const body = h('div', { class: 'community-body' });
  const picker = sectionPicker(sections, () => current, show);
  const trade = h('div', { class: 'community-trade' }, tradeBanner());
  // The Discord mark by the title, opening the game's server by its invite
  // link, when there is one (the author, 10.11.2026: „Musimy dodać ikonkę
  // Discorda do gry.”, ../discord.js).
  const heading = pageHeading(t('Społeczność'));
  const discord = discordButton();
  fill(container, discord ? h('div', { class: 'community-heading' }, heading, discord) : heading, picker.element, trade, body);

  // The list stays under the top bar while the page scrolls, so it is at
  // hand under a long chat too (styles.css).
  const topbar = $('.topbar');
  const stick = () => picker.element.style.setProperty('--community-top', `${topbar?.offsetHeight ?? 0}px`);
  const watcher = topbar && typeof ResizeObserver === 'function' ? new ResizeObserver(stick) : null;
  watcher?.observe(topbar);
  stick();

  // A part shown, with the bar under the list for a row of its own.
  function show(id) {
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
    // Its shortcut lights in the computer's menu (app.js).
    context.setPart?.(id);
    part?.unmount();
    fill(body);
    fill(picker.bar);
    part = MOUNTS[id](body, { bar: picker.bar, news: picker.render });
    picker.render();
  }

  // The Wymiana as it is now.
  const stopTrade = onChatNews(() => fill(trade, tradeBanner()));

  show(current);
  return {
    unmount() {
      part?.unmount();
      picker.unmount();
      stopTrade();
      watcher?.disconnect();
    },
  };
}

function firstSection(sections) {
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
// news, one tap away (the author: 321 A, instead of a list to unfold). The
// parts still to come cannot be picked yet.
function sectionPicker(sections, current, choose) {
  // The row the narrator's Społeczność chapter points at (narrator.js).
  const tabs = h('div', { class: 'community-tabs', role: 'tablist', 'aria-label': t('Części Społeczności'), 'data-guide': 'community-tabs' });
  const bar = h('div', { class: 'community-bar' });
  const element = h('div', { class: 'community-picker' }, h('div', { class: 'community-picker-row' }, tabs), bar);

  const label = (section) => [
    icon(SECTION_ICONS[section.id] ?? 'unknown', { size: 20, className: 'community-icon' }),
    h('span', { class: 'community-name', text: section.name }),
    SECTION_NEWS[section.id]?.() && h('span', { class: 'community-dot', role: 'img', 'aria-label': t('nowe') }),
    section.soon && h('span', { class: 'community-soon', text: t('Wkrótce') }),
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
            // A part's tab, which the narrator opens and points at (the
            // Drużyna's, narrator.js).
            'data-guide': `community-tab-${section.id}`,
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

// The bell by the chat's title (screens/chat.js, ../side.js): it mutes the
// Globalny's light, on the round chat button and on the chat's tab
// (chat-news.js), on this device; private messages and tags light them
// still. `unmount` stops it following another bell's change.
export function chatBell() {
  const bell = h('button', {
    type: 'button',
    class: 'community-bell chat-bell',
    onClick: () => {
      setChatMuted(!chatMuted());
      render();
      toast(chatMuted() ? t('Powiadomienia czatu wyciszone: nowe wiadomości nie zapalą kropki.') : t('Powiadomienia czatu włączone.'));
    },
  });
  function render() {
    const muted = chatMuted();
    bell.setAttribute('aria-pressed', String(muted));
    bell.setAttribute('aria-label', t('Wycisz powiadomienia czatu'));
    bell.title = muted ? t('Powiadomienia czatu wyciszone') : t('Powiadomienia czatu włączone');
    fill(bell, icon(muted ? 'bell-off' : 'bell', { size: 20 }));
  }
  render();
  return { element: bell, unmount: onChatNews(render) };
}

// The Czat: its tabs, its notices, the players hidden and the room of
// messages. `person` is the private conversation to open first, `mention`
// a name to tag in the Globalny's line ("Oznacz" on a character's sheet);
// else it opens on the channel where a message that tags the player waits
// unread, or on the Globalny.
// Also in the side column on a computer (side.js), with its own `id` for
// the line to write in, scrolling in its own box (`scroller`) and not the
// page.
export function mountChat(container, { bar, person = null, mention = null, id = 'chat', scroller = null }) {
  const chat = state.content.chat;
  const tagWords = chat.mentions.texts;
  // The channel shown, or the other character of the private conversation
  // shown (null on a channel), and the private conversations for the tabs.
  const tagged = person || mention ? null : mentionChannel();
  let channel = (tagged === GUILD.id && guildChannel() ? GUILD : chat.channels.find((entry) => entry.id === tagged)) ?? chat.channels[0];
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
  const list = h('ol', { class: 'chat-list', 'aria-label': t('Wiadomości') });
  const empty = h('p', { class: 'muted chat-empty', text: t('Wczytywanie…') });
  const placeholder = () => (talk ? t('Do postaci {name}…', { name: talk.name }) : channel.items ? t('Napisz ofertę…') : t('Napisz wiadomość…'));
  // The admin writes links too, their addresses beyond the length shown.
  const admin = Boolean(state.user?.author);
  const text = h('input', {
    type: 'text',
    id: `${id}-text`,
    maxlength: String(admin ? chat.linkMaxLength : chat.maxLength),
    autocomplete: 'off',
    enterkeyhint: 'send',
    placeholder: placeholder(),
    'aria-label': t('Wiadomość'),
  });
  const sendButton = h('button', { type: 'submit', class: 'button button--system chat-send', text: t('Wyślij') });
  const attachButton = h(
    'button',
    { type: 'button', class: 'icon-button chat-attach', 'aria-label': t('Pokaż przedmioty z plecaka'), onClick: pickItems },
    icon('pouch', { size: 20 }),
  );
  // "Dodaj link", the admin's alone: a label and an address, put into the
  // message as [label](address).
  const linkButton =
    admin &&
    h(
      'button',
      { type: 'button', class: 'icon-button chat-attach chat-link-add', 'aria-label': chat.link.button, title: chat.link.button, onClick: () => openLinkSheet() },
      icon('link', { size: 20 }),
    );
  function openLinkSheet() {
    const words = chat.link;
    const label = h('input', { type: 'text', id: `${id}-link-label`, class: 'chat-link-input', maxlength: '80', autocomplete: 'off', placeholder: 'Changelog - 1' });
    const address = h('input', { type: 'url', id: `${id}-link-url`, class: 'chat-link-input', maxlength: '500', autocomplete: 'off', inputmode: 'url', placeholder: 'https://' });
    const field = (input, words) => h('div', { class: 'chat-link-field' }, h('label', { for: input.id, class: 'field-label', text: words }), input);
    const insert = h('button', {
      type: 'button',
      class: 'button button--system',
      text: words.insert,
      onClick: () => {
        const shown = label.value.replace(/[[\]]/g, '').trim();
        const target = address.value.trim();
        if (!shown) return toast(words.noLabel);
        if (!/^https?:\/\/[^\s()]+$/i.test(target)) return toast(words.invalid);
        text.value = `${text.value.trim()} [${shown}](${target})`.trim();
        closeSheet();
        text.focus();
      },
    });
    openSheet(
      h('h2', { class: 'sheet-title', text: words.title }),
      h(
        'div',
        { class: 'chat-link-sheet' },
        h('p', { class: 'sheet-text', text: words.lead }),
        field(label, words.label),
        field(address, words.url),
        h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--world', text: t('Anuluj'), onClick: closeSheet }), insert),
      ),
    );
    label.focus();
  }
  const attachedList = h('ul', { class: 'chat-attached', 'aria-label': t('Przedmioty w wiadomości') });
  // The names "@" suggests, over the line (see suggest below).
  const suggestions = h('ul', { class: 'chat-mentions', id: `${id}-mentions`, role: 'listbox', 'aria-label': tagWords.suggestions, hidden: true });
  const form = h(
    'form',
    {
      class: 'chat-form',
      onSubmit: (event) => {
        event.preventDefault();
        withButton(sendButton, send);
      },
    },
    suggestions,
    attachedList,
    h('div', { class: 'chat-form-row' }, attachButton, linkButton, text, sendButton),
  );

  // "@" and the start of a name before the caret: the characters that may
  // be tagged in the tab shown whose names start so, a tap putting the whole
  // name in. Those who wrote in the tab lately come first, the newest
  // first, then the friends and the guild's members (/api/chat/people, asked
  // once); in the guild's channel only its members, in a private
  // conversation only its other one, as only they read it.
  let people = null;
  let peopleAsked = false;
  let typed = null;
  let offered = [];
  let chosen = 0;
  async function askPeople() {
    if (peopleAsked) return;
    peopleAsked = true;
    try {
      people = await call('GET', '/api/chat/people');
    } catch {
      people = { friends: [], guild: [] };
    }
    if (!gone) suggest();
  }
  function taggable() {
    if (talk) return [{ name: talk.name, classId: conversations.find((entry) => entry.id === talk.id)?.classId }];
    if (channel.id === GUILD.id) return people?.guild ?? [];
    const writers = messages
      .filter((message) => !message.own && !message.system)
      .reverse()
      .map((message) => ({ name: message.name, classId: message.classId }));
    return [...writers, ...(people?.friends ?? []), ...(people?.guild ?? [])];
  }
  function closeSuggestions() {
    typed = null;
    offered = [];
    suggestions.hidden = true;
    text.removeAttribute('aria-activedescendant');
    text.setAttribute('aria-expanded', 'false');
  }
  function suggest() {
    typed = document.activeElement === text ? typedMention(text.value, text.selectionStart ?? text.value.length) : null;
    if (!typed) return closeSuggestions();
    if (!talk) askPeople();
    offered = matchingPeople(typed.query, taggable(), chat.mentions.suggestions);
    if (offered.length === 0) return closeSuggestions();
    chosen = Math.min(chosen, offered.length - 1);
    fill(
      suggestions,
      offered.map((person, index) =>
        h(
          'li',
          { role: 'presentation' },
          h(
            'button',
            {
              type: 'button',
              id: `${id}-mention-${index}`,
              class: 'chat-mention-option',
              role: 'option',
              tabindex: '-1',
              'aria-selected': String(index === chosen),
              // The line keeps the focus, and the phone its keyboard.
              onMousedown: (event) => event.preventDefault(),
              onClick: () => pick(person),
            },
            icon(CLASS_ICONS[person.classId] ?? 'person', { size: 16, className: 'chat-class' }),
            h('span', { class: 'chat-mention-name', text: person.name }),
          ),
        ),
      ),
    );
    suggestions.hidden = false;
    text.setAttribute('aria-expanded', 'true');
    text.setAttribute('aria-activedescendant', `${id}-mention-${chosen}`);
  }
  function pick(person) {
    if (!typed) return;
    const next = withMention(text.value, typed.start, text.selectionStart ?? text.value.length, person.name);
    text.value = next.value;
    text.focus();
    text.setSelectionRange(next.caret, next.caret);
    chosen = 0;
    closeSuggestions();
  }
  text.setAttribute('aria-controls', suggestions.id);
  text.setAttribute('aria-expanded', 'false');
  text.addEventListener('input', () => {
    chosen = 0;
    suggest();
  });
  text.addEventListener('click', suggest);
  text.addEventListener('keyup', (event) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) suggest();
  });
  text.addEventListener('blur', () => setTimeout(() => document.activeElement !== text && closeSuggestions(), 150));
  // With the list open: up and down choose, Enter and Tab put the name in,
  // Escape closes it.
  text.addEventListener('keydown', (event) => {
    if (suggestions.hidden || offered.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      chosen = (chosen + (event.key === 'ArrowDown' ? 1 : offered.length - 1)) % offered.length;
      suggest();
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      pick(offered[chosen]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeSuggestions();
    }
  });

  // "Oznacz": "@" and the whole name at the end of the line, the line in
  // front, at once or as soon as it shows. A private conversation tags only
  // its other one, so another name goes to the Globalny.
  function tag(name) {
    if (talk && talk.name.toLowerCase() !== name.toLowerCase()) switchTo(chat.channels[0], null);
    text.value = appendMention(text.value, name);
    closeSuggestions();
    if (!form.isConnected) {
      focusLine = true;
      return;
    }
    text.focus();
    text.setSelectionRange(text.value.length, text.value.length);
  }
  // Whether the player may write now: the rules accepted, not silenced.
  const canWrite = () => Boolean(account?.rulesAccepted) && !account?.mutedUntil;
  // The line takes the focus once it shows (a name put in before).
  let focusLine = false;

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
              'aria-label': t('Bez przedmiotu {name}', { name: item.name }),
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
      count.textContent = t('Wybrane: {count} z {max}.', { count: picked.size, max: chat.itemsMax });
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
              toast(t('Jedna wiadomość pokaże najwyżej {count} przedmioty.', { count: chat.itemsMax }));
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
      h('h2', { class: 'sheet-title chat-sheet', text: t('Przedmioty do oferty') }),
      h('p', { class: 'sheet-text', text: t('Wiadomość pokaże je wszystkim w Wymianie, tak jak wyglądają teraz. Same przedmioty zostają w plecaku.') }),
      bag.length === 0 ? h('p', { class: 'muted', text: t('W plecaku nie ma przedmiotów. Założonych nie pokażesz.') }) : [count, h('ul', { class: 'item-list' }, rows)],
      h(
        'div',
        { class: 'sheet-actions' },
        h('button', { type: 'button', class: 'button button--world', text: t('Anuluj'), onClick: closeSheet }),
        h('button', {
          type: 'button',
          class: 'button button--system',
          text: t('Gotowe'),
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
      h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--world', text: t('Zamknij'), onClick: closeSheet })),
    );
  // The narrator points here at the chat's rules (narrator.js).
  const footer = h('div', { class: 'chat-footer', 'data-guide': 'community-rules' });
  const hidden = h('div', { class: 'chat-hidden' });
  const room = h('div', { class: 'chat-room' }, empty, list, footer);

  const tabs = h('div', { class: 'chat-tabs', role: 'tablist', 'aria-label': t('Rozmowy') });
  fill(bar, tabs);
  fill(container, notices, hidden, room);

  // A tab, its light saying "Oznaczono Cię" when a message there tags the
  // player (`mentioned`).
  const tab = (label, selected, news, choose, mentioned = false) =>
    h(
      'button',
      { type: 'button', class: 'chat-tab', role: 'tab', 'aria-selected': String(selected), onClick: choose },
      h('span', { class: 'chat-tab-name', text: label }),
      news && h('span', { class: 'community-dot', role: 'img', 'aria-label': mentioned ? tagWords.tagged : t('nowe') }),
    );

  // A private conversation's tab, with the × that closes it.
  const privateTab = (entry) =>
    h(
      'span',
      { class: 'chat-tab-wrap' },
      tab(
        entry.name,
        entry.id === talk?.id,
        entry.id !== talk?.id && (conversationNews(entry.id, entry.latest) || mentionNews(null, entry.id)),
        () => switchTo(channel, entry),
        mentionNews(null, entry.id),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'chat-tab-close',
          'aria-label': t('Zamknij rozmowę z postacią {name}', { name: entry.name }),
          onClick: (event) => withButton(event.currentTarget, () => closeTalk(entry)),
        },
        icon('close', { size: 12 }),
      ),
    );

  // The channels first, the guild's among them while the character is in
  // one, then the conversations, the most recent first; one opened from a
  // sheet shows before its first message too. The Globalny's and the
  // guild's tabs light for their news, every channel's for a message that
  // tags the player (chat-news.js).
  function renderTabs() {
    const entries = talk && !conversations.some((entry) => entry.id === talk.id) ? [{ ...talk, latest: 0 }, ...conversations] : conversations;
    const channels = [...chat.channels, ...(guildChannel() ? [GUILD] : [])];
    const elsewhere = (entry) => Boolean(talk) || channel.id !== entry.id;
    fill(
      tabs,
      channels.map((entry) =>
        tab(entry.name, !talk && entry.id === channel.id, elsewhere(entry) && channelNews(entry.id), () => switchTo(entry, null), mentionNews(entry.id)),
      ),
      entries.map(privateTab),
    );
  }

  // Another tab: its messages from the start, asked for at once.
  function switchTo(nextChannel, next) {
    if (next ? next.id === talk?.id : !talk && nextChannel.id === channel.id) return;
    channel = nextChannel;
    talk = next && { id: next.id, name: next.name };
    attached = [];
    closeSuggestions();
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
    const stamp = h('time', { class: 'chat-time', datetime: time.toISOString(), text: (today ? timeFormat : dateTimeFormat).format(time) });
    // A message of the System (the Loteria's result, src/server/casino.js):
    // its words under [ SYSTEM ], nobody's to open, report or hide.
    if (message.system) {
      return h(
        'li',
        { class: 'chat-message chat-message--system', 'data-id': String(message.id) },
        h('div', { class: 'chat-head' }, h('span', { class: 'chat-system', text: '[ SYSTEM ]' }), stamp),
        h('p', { class: 'chat-text', text: message.text }),
      );
    }
    const classes = ['chat-message', message.own && 'chat-message--own', message.mentioned && 'chat-message--mentioned'].filter(Boolean).join(' ');
    return h(
      'li',
      { class: classes, 'data-id': String(message.id) },
      h(
        'div',
        { class: 'chat-head' },
        icon(CLASS_ICONS[message.classId] ?? 'person', { size: 14, className: 'chat-class' }),
        framedName(
          h('button', {
            type: 'button',
            class: 'chat-name',
            text: message.name,
            'aria-label': t('{name}: zobacz postać', { name: message.name }),
            onClick: (event) => withButton(event.currentTarget, () => openProfile(message.name, { mention: tag })),
          }),
          message.nameColor,
        ),
        guildTag(message.guildTag),
        message.role && h('span', { class: `chat-role chat-role--${message.role}`, text: `(${message.role})` }),
        h('span', { class: 'chat-level', text: t('poz. {level}', { level: message.level }) }),
        // A message that tags the player: "@" in gold, read out as words.
        message.mentioned && h('span', { class: 'chat-tagged', role: 'img', 'aria-label': tagWords.tagged, text: '@' }),
        stamp,
      ),
      // The admin's message with links: its words with the links to tap, and
      // a tap beside them opens what can be done with it.
      hasLink(message)
        ? h(
            'p',
            {
              class: 'chat-text chat-text--linked',
              onClick: (event) => {
                if (!message.own && !event.target.closest('a')) actions(message);
              },
            },
            linkedText(message.text).flatMap((part) => (typeof part === 'string' ? withTags(part, message) : [part])),
          )
        : message.own
          ? h('p', { class: 'chat-text' }, withTags(message.text, message))
          : h('button', { type: 'button', class: 'chat-text chat-text--button', onClick: () => actions(message) }, withTags(message.text, message)),
      ...translation(message),
      message.items?.length > 0 &&
        h(
          'ul',
          { class: 'chat-items', 'aria-label': t('Przedmioty w ofercie') },
          message.items.map((item) => h('li', {}, h('button', { type: 'button', class: 'item-row chat-item', onClick: () => showItem(item) }, itemSummary(item)))),
        ),
    );
  }

  // "A→ Przetłumacz" under someone else's message in the other language
  // than the page's, where the server translates (714 A,
  // src/server/translate.js): the machine's translation under its words,
  // marked as the machine's, and back to the words alone with "A→ Oryginał".
  // A message translated once shows its translation again without asking.
  function translation(message) {
    if (message.own || !message.language || message.language === language()) return [];
    let translated = null;
    const shown = h('div', { class: 'chat-translation' });
    shown.hidden = true;
    const button = h('button', { type: 'button', class: 'chat-translate', text: t('A→ Przetłumacz') });
    button.addEventListener('click', () =>
      withButton(button, async () => {
        if (!shown.hidden) {
          shown.hidden = true;
          button.textContent = t('A→ Przetłumacz');
          return;
        }
        translated ??= (await call('POST', '/api/chat/translate', { id: message.id })).text;
        fill(shown, h('p', { class: 'chat-translation-text', text: translated }), h('small', { class: 'chat-translation-note', text: t('Tłumaczenie maszynowe') }));
        shown.hidden = false;
        button.textContent = t('A→ Oryginał');
      }),
    );
    return [shown, button];
  }

  // The text of a message with the names it tags in gold (../mentions.js).
  const withTags = (words, message) =>
    taggedParts(words, message.mentions ?? []).map((part) => (typeof part === 'string' ? part : h('span', { class: 'chat-tag', text: part.tag })));

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
    else channelRead(channel.id, messages.at(-1).id);
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
            text: t('Zgłoszenia czekają: {count}', { count: reports }),
            onClick: (event) => withButton(event.currentTarget, openReports),
          }),
      );
    }
    empty.hidden = messages.length > 0;
    empty.textContent = !loaded
      ? t('Wczytywanie…')
      : talk
        ? t('Napisz do postaci {name}. Tę rozmowę widzicie tylko Wy dwoje.', { name: talk.name })
        : t('Nikt jeszcze nic nie napisał. Zacznij rozmowę!');
    const part = !account ? 'loading' : account.mutedUntil ? `muted:${account.mutedUntil}` : account.rulesAccepted ? 'form' : 'rules';
    if (changed('footer', part)) fill(footer, footerPart(part));
    if (focusLine && part === 'form') {
      focusLine = false;
      text.focus();
      text.setSelectionRange(text.value.length, text.value.length);
    }
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
        { class: 'card chat-rules', 'aria-label': t('Zasady czatu') },
        h('h2', { class: 'card-title', text: t('Zasady czatu') }),
        chat.rules.map((line) => h('p', { text: line })),
        h('button', {
          type: 'button',
          class: 'button button--system',
          text: t('Akceptuję zasady czatu'),
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
    return h('p', { class: 'chat-muted', text: t('Czat jest dla Ciebie wyciszony {until}.', { until: untilText(account.mutedUntil) }) });
  }

  function hiddenList(blocked) {
    return h(
      'details',
      { class: 'card chat-blocked' },
      h('summary', { text: t('Ukryte postacie ({count})', { count: blocked.length }) }),
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
              text: t('Pokaż'),
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
  // What a decision did, in a toast (t()).
  const DONE = { hide: 'Wiadomość usunięta.', keep: 'Wiadomość zostaje.', muteDay: 'Czat wyciszony na dobę.', muteForever: 'Czat wyciszony na stałe.' };

  // The sheet of someone else's message.
  function actions(message) {
    const moderate = (action) => async () => {
      await decide(message.id, action);
      closeSheet();
      toast(t(DONE[action]));
      if (action === 'hide') drop([message.id]);
    };
    openSheet(
      h('h2', { class: 'sheet-title chat-sheet', text: message.name }),
      hasLink(message) ? h('p', { class: 'sheet-text chat-sheet-text' }, linkedText(message.text)) : h('p', { class: 'sheet-text chat-sheet-text', text: message.text }),
      h(
        'div',
        { class: 'chat-sheet-actions' },
        act(t('Zobacz postać'), () => openProfile(message.name, { mention: tag })),
        // "@" and the name in this tab's line, while the player may write.
        canWrite() &&
          act(tagWords.button, () => {
            closeSheet();
            tag(message.name);
          }),
        !talk &&
          act(t('Prywatna wiadomość'), () => {
            closeSheet();
            talkTo({ id: message.characterId, name: message.name });
          }),
        act(
          t('Zgłoś'),
          async () => {
            const { text: done } = await call('POST', '/api/chat/report', { messageId: message.id });
            closeSheet();
            toast(done);
          },
          'danger',
        ),
        act(t('Ukryj wiadomości tej postaci'), async () => {
          account.blocked = (await call('POST', '/api/chat/block', { messageId: message.id })).blocked;
          closeSheet();
          drop(messages.filter((other) => other.name === message.name && !other.own && !other.system).map((other) => other.id));
          render();
          toast(t('Wiadomości postaci {name} są ukryte. Pokażesz je nad czatem, w „Ukryte postacie”.', { name: message.name }));
        }),
        canModerate(message.role) && [
          h('p', { class: 'chat-sheet-label', text: t('Moderacja') }),
          act(t('Usuń wiadomość'), moderate('hide'), 'danger'),
          act(t('Wycisz na dobę'), moderate('muteDay')),
          act(t('Wycisz na stałe'), moderate('muteForever'), 'danger'),
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
      toast(t(DONE[action]));
      if (action === 'hide') drop([report.messageId]);
      await openReports();
      ask();
    };
    openSheet(
      h('h2', { class: 'sheet-title chat-sheet', text: t('Zgłoszenia') }),
      reports.length === 0
        ? h('p', { class: 'sheet-text', text: t('Nie ma zgłoszeń do sprawdzenia.') })
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
                    t('zgłoszenia: {count}', { count: report.reports }),
                    report.private && t('prywatna'),
                    report.hidden && t('ukryta do decyzji'),
                    report.mutedUntil && t('czat wyciszony {until}', { until: untilText(report.mutedUntil) }),
                  ]
                    .filter(Boolean)
                    .join(' · '),
                }),
                canModerate(report.role) &&
                  h(
                    'div',
                    { class: 'chat-report-actions' },
                    act(t('Usuń'), decision(report, 'hide'), 'danger', 'button--small'),
                    act(t('Zostaw'), decision(report, 'keep'), 'world', 'button--small'),
                    act(t('Wycisz na dobę'), decision(report, 'muteDay'), 'world', 'button--small'),
                    act(t('Wycisz na stałe'), decision(report, 'muteForever'), 'danger', 'button--small'),
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
  // "Oznacz" on a character's sheet opened away from the chat
  // (mountCommunity): the name in the Globalny's line.
  if (mention) tag(mention);
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
    mention: tag,
  };
}

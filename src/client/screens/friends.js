// The Znajomi in the Społeczność (src/server/community.js): the Upominki
// waiting to be collected, the invitations to accept, the friends with a
// Wymiana to propose (trade.js) and today's Upominek to send to each, a
// name to invite and the invitations sent. The friends stand by their
// level, the highest first, each with when it was last online (the author,
// 10.11.2026: „Sortowanie listy znajomych po poziomach oraz wskazywanie u
// każdego kiedy ostatnio był online.”). A tap on a name shows that
// character (profile.js), where a friendship also ends.

import { friendsSeen } from '../chat-news.js';
import { fill, h, icon } from '../dom.js';
import { countOf, formatNumber } from '../format.js';
import { t } from '../i18n.js';
import { CLASS_ICONS } from '../icons.js';
import { lastSeen } from '../last-seen.js';
import { openProfile } from '../profile.js';
import { playSound } from '../sound.js';
import { call, serverNow, state, walletEntries } from '../state.js';
import { framedName, guildTag, howItWorks, toast, withButton } from '../ui.js';
import { proposeTrade } from './trade.js';

const resourceName = (id) => walletEntries().find((entry) => entry.id === id)?.name ?? id;
// A friend's dot in words: green, yellow and red (styles.css), shown in
// the page's language (t()).
const STATUS = { online: 'online', busy: 'zajęty, teraz bez wymiany', offline: 'offline' };
// When a friend was last online (last-seen.js), in the page's language.
const SEEN = { now: 'teraz', minutes: '{count} min temu', hours: '{count} godz. temu', yesterday: 'wczoraj', days: '{count} dni temu' };

// A friend's last time online, beside its level: "teraz" while its dot is
// green or yellow, else how long ago; nothing for one never seen.
function seenLine(person) {
  const seen = lastSeen(person.lastSeen, serverNow(), person.status !== 'offline');
  return seen && h('span', { class: 'friend-seen', title: t('Ostatnio online'), text: t(SEEN[seen.unit], { count: formatNumber(seen.count) }) });
}

// What the Upominki collected held: "Punkty Czasu +3, Złoto +40, Drewno +5".
export const giftText = (reward) =>
  [
    t('Punkty Czasu +{count}', { count: formatNumber(reward.timePoints) }),
    reward.gold > 0 && t('Złoto +{count}', { count: formatNumber(reward.gold) }),
    ...Object.entries(reward.resources).map(([id, amount]) => `${resourceName(id)} +${formatNumber(amount)}`),
  ]
    .filter(Boolean)
    .join(', ');

export function mountFriends(container) {
  const { gift } = state.content.community;
  let view = null;
  let gone = false;
  const body = h('div', { class: 'friends' }, h('p', { class: 'muted', text: t('Wczytywanie…') }));

  // The line to invite a character by its name stays as typed between the
  // answers.
  const name = h('input', {
    type: 'text',
    id: 'friend-name',
    maxlength: '20',
    autocomplete: 'off',
    autocapitalize: 'none',
    enterkeyhint: 'send',
    placeholder: t('Imię postaci'),
    'aria-label': t('Imię postaci do zaproszenia'),
  });
  const inviteButton = h('button', { type: 'submit', class: 'button button--system chat-send', text: t('Zaproś') });
  const inviteForm = h(
    'form',
    {
      class: 'chat-form',
      onSubmit: (event) => {
        event.preventDefault();
        withButton(inviteButton, async () => {
          const value = name.value.trim();
          if (!value) return;
          await act('/api/friends/invite', { name: value })();
          name.value = '';
        });
      },
    },
    name,
    inviteButton,
  );
  fill(container, body);

  function show(next) {
    if (gone) return;
    view = next;
    friendsSeen(view);
    fill(body, giftsCard(), incomingCard(), friendsCard(), inviteCard(), outgoingCard());
  }

  // An action answered with the Znajomi anew, its words in a toast.
  const act = (path, data, said) => async () => {
    const answer = await call('POST', path, data);
    show(answer);
    const words = answer.text ?? said;
    if (words) toast(words);
  };
  const button = (label, run, kind = 'world', extra = {}) =>
    h('button', { type: 'button', class: `button button--${kind} button--small`, text: label, onClick: (event) => withButton(event.currentTarget, run), ...extra });

  // A character in a row: a friend's dot first (online, busy, offline), its
  // class, its name to tap and its level.
  const who = (person, ...more) =>
    h(
      'div',
      { class: 'friend-who' },
      person.status && h('span', { class: `friend-status friend-status--${person.status}`, role: 'img', 'aria-label': t(STATUS[person.status]), title: t(STATUS[person.status]) }),
      icon(CLASS_ICONS[person.classId] ?? 'person', { size: 16, className: 'chat-class' }),
      framedName(
        h('button', {
          type: 'button',
          class: 'chat-name',
          text: person.name,
          'aria-label': t('{name}: zobacz postać', { name: person.name }),
          onClick: (event) => withButton(event.currentTarget, () => openProfile(person.name, { onChange: show })),
        }),
        person.nameColor,
      ),
      guildTag(person.guildTag),
      // A friend's level and its last time online stay together on a line.
      Object.hasOwn(person, 'lastSeen')
        ? h('span', { class: 'friend-level' }, h('span', { class: 'chat-level', text: t('poz. {level}', { level: person.level }) }), seenLine(person))
        : h('span', { class: 'chat-level', text: t('poz. {level}', { level: person.level }) }),
      more,
    );

  function giftsCard() {
    const { waiting, claimedToday, claimsPerDay } = view.gifts;
    const left = Math.max(0, claimsPerDay - claimedToday);
    const ready = Math.min(waiting, left);
    // The friends not given today's Upominek yet, for "Wyślij wszystkie".
    const unsent = view.friends.filter((person) => !person.sentToday).length;
    return h(
      'section',
      { class: 'card friends-gifts', 'aria-labelledby': 'friends-gifts-title' },
      h('h2', { class: 'card-title', id: 'friends-gifts-title' }, icon('gift', { size: 22 }), t('Upominki')),
      // The author: all of it under "Jak to działa?".
      howItWorks(null, [
        t('Każdego dnia możesz wysłać każdemu znajomemu jeden {gift}: {points} i trochę złota albo surowców.', {
          gift: gift.name,
          points: countOf(gift.timePoints, 'Punkt Czasu', 'Punkty Czasu', 'Punktów Czasu'),
        }),
        t('Dziennie odbierzesz do {count}.', { count: claimsPerDay }),
      ]),
      h('p', {
        class: 'friends-gifts-count',
        text: t('{waiting} Dziś odebrano {count} z {max}.', {
          waiting: waiting === 0 ? t('Żaden upominek nie czeka.') : t('Czeka: {gifts}.', { gifts: countOf(waiting, 'upominek', 'upominki', 'upominków') }),
          count: claimedToday,
          max: claimsPerDay,
        }),
      }),
      ready > 0 && button(t('Odbierz upominki ({count})', { count: ready }), claim, 'system', { class: 'button button--system' }),
      waiting > 0 && left === 0 && h('p', { class: 'muted', text: t('Kolejne odbierzesz od północy.') }),
      unsent > 0 && button(t('Wyślij wszystkie ({count})', { count: unsent }), sendAll, 'world', { class: 'button button--world' }),
    );
  }

  // Today's Upominek to every friend not given one yet (the author: "Wyślij
  // wszystkie w Upominkach tak jak Odbierz wszystkie").
  async function sendAll() {
    const answer = await call('POST', '/api/friends/gift-all');
    show(answer);
    toast(t('Wysłano {gifts}.', { gifts: countOf(answer.sent, 'upominek', 'upominki', 'upominków') }));
  }

  async function claim() {
    const answer = await call('POST', '/api/friends/claim');
    playSound('collect');
    show(answer);
    toast(t('Odebrano {gifts}: {reward}.', { gifts: countOf(answer.reward.count, 'upominek', 'upominki', 'upominków'), reward: giftText(answer.reward) }));
  }

  function incomingCard() {
    if (view.incoming.length === 0) return null;
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'friends-incoming-title' },
      h('h2', { class: 'card-title', id: 'friends-incoming-title', text: t('Zaproszenia') }),
      h(
        'ul',
        { class: 'friends-list' },
        view.incoming.map((person) =>
          h(
            'li',
            { class: 'friend' },
            who(person),
            h(
              'div',
              { class: 'friend-actions' },
              button(t('Przyjmij'), act('/api/friends/accept', { id: person.id }), 'system'),
              button(t('Odrzuć'), act('/api/friends/remove', { id: person.id }, t('Zaproszenie od postaci {name} odrzucone.', { name: person.name }))),
            ),
          ),
        ),
      ),
    );
  }

  function friendsCard() {
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'friends-title' },
      h('h2', { class: 'card-title', id: 'friends-title', text: t('Znajomi ({count}/{max})', { count: view.friends.length, max: view.max }) }),
      view.friends.length === 0
        ? h('p', {
            class: 'muted',
            text: t('Nie masz jeszcze znajomych. Wybierz imię postaci na czacie albo w Rankingu i zaproś ją w jej karcie albo wpisz imię poniżej.'),
          })
        : h(
            'ul',
            { class: 'friends-list' },
            view.friends.map((person) =>
              h(
                'li',
                { class: 'friend' },
                who(person, person.waiting > 0 && h('span', { class: 'friend-waiting', title: t('Upominek od tej postaci czeka') }, icon('gift', { size: 14 }))),
                h(
                  'div',
                  { class: 'friend-actions' },
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'button button--world button--small friend-gift',
                      'aria-label': t('Wymiana: {name}', { name: person.name }),
                      onClick: (event) => withButton(event.currentTarget, () => proposeTrade({ id: person.characterId, name: person.name })),
                    },
                    icon('swap', { size: 16 }),
                    t('Wymiana'),
                  ),
                  person.sentToday
                    ? h('span', { class: 'friend-sent' }, icon('gift', { size: 16 }), t('Wysłany'))
                    : h(
                        'button',
                        {
                          type: 'button',
                          class: 'button button--system button--small friend-gift',
                          'aria-label': t('Wyślij {gift}: {name}', { gift: gift.name, name: person.name }),
                          onClick: (event) => withButton(event.currentTarget, act('/api/friends/gift', { id: person.id })),
                        },
                        icon('gift', { size: 16 }),
                        t('Wyślij'),
                      ),
                ),
              ),
            ),
          ),
    );
  }

  const inviteCard = () =>
    h('section', { class: 'card', 'aria-labelledby': 'friends-invite-title' }, h('h2', { class: 'card-title', id: 'friends-invite-title', text: t('Zaproś postać') }), inviteForm);

  function outgoingCard() {
    if (view.outgoing.length === 0) return null;
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'friends-outgoing-title' },
      h('h2', { class: 'card-title', id: 'friends-outgoing-title', text: t('Wysłane zaproszenia') }),
      h(
        'ul',
        { class: 'friends-list' },
        view.outgoing.map((person) =>
          h('li', { class: 'friend' }, who(person), button(t('Cofnij'), act('/api/friends/remove', { id: person.id }, t('Zaproszenie dla postaci {name} cofnięte.', { name: person.name })))),
        ),
      ),
    );
  }

  call('GET', '/api/friends').then(show, (error) => {
    if (!gone) fill(body, h('p', { class: 'chat-error', role: 'status', text: error.message }));
  });
  // The friends' dots follow who plays now: the list comes anew every 30
  // seconds while it is in front, but not while a name is being typed.
  const refresh = setInterval(() => {
    if (document.hidden || document.activeElement === name || !view) return;
    call('GET', '/api/friends').then(show, () => {});
  }, 30000);
  return {
    unmount() {
      gone = true;
      clearInterval(refresh);
    },
  };
}

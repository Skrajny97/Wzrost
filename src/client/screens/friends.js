// The Znajomi in the Społeczność (src/server/community.js): the Upominki
// waiting to be collected, the invitations to accept, the friends with
// today's Upominek to send to each, a name to invite and the invitations
// sent. A tap on a name shows that character (profile.js), where a
// friendship also ends.

import { friendsSeen } from '../chat-news.js';
import { fill, h, icon } from '../dom.js';
import { countOf, formatNumber } from '../format.js';
import { CLASS_ICONS } from '../icons.js';
import { openProfile } from '../profile.js';
import { playSound } from '../sound.js';
import { call, state, walletEntries } from '../state.js';
import { toast, withButton } from '../ui.js';

const resourceName = (id) => walletEntries().find((entry) => entry.id === id)?.name ?? id;

// What the Upominki collected held: "Punkty Czasu +3, Złoto +40, Drewno +5".
export const giftText = (reward) =>
  [
    `Punkty Czasu +${formatNumber(reward.timePoints)}`,
    reward.gold > 0 && `Złoto +${formatNumber(reward.gold)}`,
    ...Object.entries(reward.resources).map(([id, amount]) => `${resourceName(id)} +${formatNumber(amount)}`),
  ]
    .filter(Boolean)
    .join(', ');

export function mountFriends(container) {
  const { gift } = state.content.community;
  let view = null;
  let gone = false;
  const body = h('div', { class: 'friends' }, h('p', { class: 'muted', text: 'Wczytywanie…' }));

  // The line to invite a character by its name stays as typed between the
  // answers.
  const name = h('input', {
    type: 'text',
    id: 'friend-name',
    maxlength: '20',
    autocomplete: 'off',
    autocapitalize: 'none',
    enterkeyhint: 'send',
    placeholder: 'Imię postaci',
    'aria-label': 'Imię postaci do zaproszenia',
  });
  const inviteButton = h('button', { type: 'submit', class: 'button button--system chat-send', text: 'Zaproś' });
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

  // A character in a row: its class, its name to tap and its level.
  const who = (person, ...more) =>
    h(
      'div',
      { class: 'friend-who' },
      icon(CLASS_ICONS[person.classId] ?? 'person', { size: 16, className: 'chat-class' }),
      h('button', {
        type: 'button',
        class: 'chat-name',
        text: person.name,
        'aria-label': `${person.name}: zobacz postać`,
        onClick: (event) => withButton(event.currentTarget, () => openProfile(person.name, { onChange: show })),
      }),
      h('span', { class: 'chat-level', text: `poz. ${person.level}` }),
      more,
    );

  function giftsCard() {
    const { waiting, claimedToday, claimsPerDay } = view.gifts;
    const left = Math.max(0, claimsPerDay - claimedToday);
    const ready = Math.min(waiting, left);
    return h(
      'section',
      { class: 'card friends-gifts', 'aria-labelledby': 'friends-gifts-title' },
      h('h2', { class: 'card-title', id: 'friends-gifts-title' }, icon('gift', { size: 22 }), 'Upominki'),
      h('p', {
        class: 'muted',
        text: `Każdego dnia możesz wysłać każdemu znajomemu jeden ${gift.name}: ${countOf(gift.timePoints, 'Punkt Czasu', 'Punkty Czasu', 'Punktów Czasu')} i trochę złota albo surowców. Dziennie odbierzesz do ${claimsPerDay}.`,
      }),
      h('p', {
        class: 'friends-gifts-count',
        text: `${waiting === 0 ? 'Żaden upominek nie czeka.' : `Czeka: ${countOf(waiting, 'upominek', 'upominki', 'upominków')}.`} Dziś odebrano ${claimedToday} z ${claimsPerDay}.`,
      }),
      ready > 0 && button(`Odbierz upominki (${ready})`, claim, 'system', { class: 'button button--system' }),
      waiting > 0 && left === 0 && h('p', { class: 'muted', text: 'Kolejne odbierzesz od północy.' }),
    );
  }

  async function claim() {
    const answer = await call('POST', '/api/friends/claim');
    playSound('collect');
    show(answer);
    toast(`Odebrano ${countOf(answer.reward.count, 'upominek', 'upominki', 'upominków')}: ${giftText(answer.reward)}.`);
  }

  function incomingCard() {
    if (view.incoming.length === 0) return null;
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'friends-incoming-title' },
      h('h2', { class: 'card-title', id: 'friends-incoming-title', text: 'Zaproszenia' }),
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
              button('Przyjmij', act('/api/friends/accept', { id: person.id }), 'system'),
              button('Odrzuć', act('/api/friends/remove', { id: person.id }, `Zaproszenie od postaci ${person.name} odrzucone.`)),
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
      h('h2', { class: 'card-title', id: 'friends-title', text: `Znajomi (${view.friends.length}/${view.max})` }),
      view.friends.length === 0
        ? h('p', {
            class: 'muted',
            text: 'Nie masz jeszcze znajomych. Dotknij imienia postaci na czacie albo w Rankingu i zaproś ją w jej karcie albo wpisz imię poniżej.',
          })
        : h(
            'ul',
            { class: 'friends-list' },
            view.friends.map((person) =>
              h(
                'li',
                { class: 'friend' },
                who(person, person.waiting > 0 && h('span', { class: 'friend-waiting', title: 'Upominek od tej postaci czeka' }, icon('gift', { size: 14 }))),
                person.sentToday
                  ? h('span', { class: 'friend-sent' }, icon('gift', { size: 16 }), 'Wysłany')
                  : h(
                      'button',
                      {
                        type: 'button',
                        class: 'button button--system button--small friend-gift',
                        'aria-label': `Wyślij ${gift.name}: ${person.name}`,
                        onClick: (event) => withButton(event.currentTarget, act('/api/friends/gift', { id: person.id })),
                      },
                      icon('gift', { size: 16 }),
                      'Wyślij',
                    ),
              ),
            ),
          ),
    );
  }

  const inviteCard = () =>
    h('section', { class: 'card', 'aria-labelledby': 'friends-invite-title' }, h('h2', { class: 'card-title', id: 'friends-invite-title', text: 'Zaproś postać' }), inviteForm);

  function outgoingCard() {
    if (view.outgoing.length === 0) return null;
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'friends-outgoing-title' },
      h('h2', { class: 'card-title', id: 'friends-outgoing-title', text: 'Wysłane zaproszenia' }),
      h(
        'ul',
        { class: 'friends-list' },
        view.outgoing.map((person) =>
          h('li', { class: 'friend' }, who(person), button('Cofnij', act('/api/friends/remove', { id: person.id }, `Zaproszenie dla postaci ${person.name} cofnięte.`))),
        ),
      ),
    );
  }

  call('GET', '/api/friends').then(show, (error) => {
    if (!gone) fill(body, h('p', { class: 'chat-error', role: 'status', text: error.message }));
  });
  return {
    unmount() {
      gone = true;
    },
  };
}

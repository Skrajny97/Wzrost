// The Drużyna in the Społeczność (src/server/parties.js), from character
// level 25: the invitations waiting for this character; its party with the
// members and their state (free, on an exploration, at a profession's work,
// playing another character), the leader marked; the friends to invite at a tap and a name to invite; the
// invitations sent; and "Opuść drużynę". The leader sends the party out
// from "Wyrusz" in the Walka (screens/combat.js, "Z drużyną").

import { partySeen } from '../chat-news.js';
import { fill, h, icon } from '../dom.js';
import { formatMinutes } from '../format.js';
import { CLASS_ICONS } from '../icons.js';
import { openProfile } from '../profile.js';
import { call, isUnlocked, state, unlockInfo } from '../state.js';
import { confirmAction, toast, withButton } from '../ui.js';

// Who goes on the party's exploration and who stays (the author's words of
// 1.11.2026, "poziomu" for the slip "poziomem").
const GOERS =
  'Na wyprawę ruszają członkowie bez zajęć w trakcie, z dopasowaniem do najniższego poziomu klasy z drużyny. Kto zajmuje się profesją albo jest na solo wyprawie, zostaje w drużynie, ale nie uczestniczy we wspólnej wyprawie.';

// A member's dot (the Znajomi's colours, styles.css) and its words; the
// busy ones say it beside the name too, as they stay home when the party
// goes (screens/combat.js).
const DOTS = { free: 'online', away: 'busy', working: 'busy', aside: 'offline' };
const STATES = { free: 'może iść na wyprawę', away: 'na wyprawie', working: 'pracuje w profesji', aside: 'gra teraz inną postacią' };
export const BUSY = { away: 'na wyprawie', working: 'w profesji', aside: 'gra inną postacią' };

// The time other members of a Drużyna's trip skipped for everyone
// (src/server/time.js), one line each, their skips added up (the author:
// "xxx przewinął czas o xxx").
export function skipLines(skips = []) {
  const byWho = new Map();
  for (const skip of skips) {
    const seen = byWho.get(skip.id);
    byWho.set(skip.id, seen ? { ...seen, minutes: seen.minutes + skip.minutes } : skip);
  }
  return [...byWho.values()].map((skip) => `${skip.name} ${skip.female ? 'przewinęła' : 'przewinął'} czas o ${formatMinutes(skip.minutes)}.`);
}

export function mountParty(container) {
  let view = null;
  let friends = [];
  let gone = false;
  const body = h('div', { class: 'friends party' }, h('p', { class: 'muted', text: 'Wczytywanie…' }));
  fill(container, body);

  if (!isUnlocked('party')) {
    const unlock = unlockInfo('party');
    fill(body, h('section', { class: 'card' }, h('p', { class: 'muted', text: `Drużynę odblokujesz na poziomie postaci ${unlock.level}. Twój poziom: ${state.character.level}.` })));
    return { unmount() {} };
  }

  const name = h('input', {
    type: 'text',
    id: 'party-name',
    maxlength: '20',
    autocomplete: 'off',
    autocapitalize: 'none',
    enterkeyhint: 'send',
    placeholder: 'Imię postaci',
    'aria-label': 'Imię postaci do zaproszenia do drużyny',
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
          await act('/api/party/invite', { name: value })();
          name.value = '';
        });
      },
    },
    name,
    inviteButton,
  );

  function show(next) {
    if (gone) return;
    view = next;
    partySeen(view);
    fill(body, invitesCard(), partyCard(), inviteCard(), sentCard(), leaveCard());
  }

  // An action answered with the Drużyna anew, its words in a toast.
  const act = (path, data, said) => async () => {
    const answer = await call('POST', path, data);
    show(answer);
    const words = answer.text ?? said;
    if (words) toast(words);
  };
  const button = (label, run, kind = 'world') => h('button', { type: 'button', class: `button button--${kind} button--small`, text: label, onClick: (event) => withButton(event.currentTarget, run) });

  const who = (person, ...more) =>
    h(
      'div',
      { class: 'friend-who' },
      person.status && h('span', { class: `friend-status friend-status--${DOTS[person.status] ?? person.status}`, role: 'img', 'aria-label': STATES[person.status] ?? person.status, title: STATES[person.status] ?? person.status }),
      icon(CLASS_ICONS[person.classId] ?? 'person', { size: 16, className: 'chat-class' }),
      h('button', {
        type: 'button',
        class: 'chat-name',
        text: person.name,
        'aria-label': `${person.name}: zobacz postać`,
        onClick: (event) => withButton(event.currentTarget, () => openProfile(person.name)),
      }),
      person.level && h('span', { class: 'chat-level', text: `poz. ${person.level}` }),
      BUSY[person.status] && h('span', { class: 'chat-level party-busy', text: BUSY[person.status] }),
      more,
    );

  function invitesCard() {
    if (view.invites.length === 0) return null;
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'party-invites-title' },
      h('h2', { class: 'card-title', id: 'party-invites-title', text: 'Zaproszenia do drużyny' }),
      h(
        'ul',
        { class: 'friends-list' },
        view.invites.map((invite) =>
          h(
            'li',
            { class: 'friend' },
            h('p', { class: 'party-invite', text: `${invite.invitedBy} zaprasza. W drużynie: ${invite.members}.` }),
            h(
              'div',
              { class: 'friend-actions' },
              button('Dołącz', act('/api/party/accept', { partyId: invite.partyId }), 'system'),
              button('Odrzuć', act('/api/party/decline', { partyId: invite.partyId }, 'Zaproszenie odrzucone.')),
            ),
          ),
        ),
      ),
    );
  }

  function partyCard() {
    const party = view.party;
    if (!party) {
      return h(
        'section',
        { class: 'card', 'aria-labelledby': 'party-title' },
        h('h2', { class: 'card-title', id: 'party-title' }, icon('swords', { size: 22 }), 'Drużyna'),
        // The author's words (1.11.2026).
        h('p', {
          class: 'muted',
          text: 'Drużyna może składać się z maksymalnie 3 osób. Lider drużyny zarządza wspólnymi wyprawami wolnych towarzyszy. Każda z osób otrzymuje własne łupy.',
        }),
      );
    }
    const own = party.members.find((member) => member.own);
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'party-title' },
      h('h2', { class: 'card-title', id: 'party-title' }, icon('swords', { size: 22 }), `Drużyna (${party.members.length}/${party.size})`),
      h(
        'ul',
        { class: 'friends-list' },
        party.members.map((member) =>
          h(
            'li',
            { class: 'friend' },
            who(member, member.leader && h('span', { class: 'party-leader', text: 'Lider' })),
            own?.leader &&
              !member.own &&
              h(
                'div',
                { class: 'friend-actions' },
                button('Usuń z drużyny', async () => {
                  if (!(await confirmAction({ title: 'Usunąć z drużyny?', text: `${member.name} opuści drużynę.`, confirmLabel: 'Usuń' }))) return;
                  await act('/api/party/kick', { characterId: member.id }, `${member.name} nie jest już w drużynie.`)();
                }),
              ),
          ),
        ),
      ),
      // Who goes and who stays: the author's words (1.11.2026: "zły opis,
      // powinno być …"), on both cards.
      h('p', {
        class: 'muted',
        text: own?.leader
          ? `Wyprawę drużyny zaczynasz w Walce: wybierz miejsce, zaznacz „Z drużyną” i stuknij „Wyrusz”. ${GOERS} Wyprawa drużyny ma wspólny czas: gdy ktokolwiek ją przewinie, skraca się wszystkim. Bez „Z drużyną” wyprawa jest tylko Twoja, a członkowie też mogą wyruszać na własne wyprawy.`
          : `Wyprawy wybiera lider. Gdy nie masz innych zajęć, lider zabierze Cię ze sobą, a raport odbierzesz w Walce jak zwykle. ${GOERS} Wyprawa drużyny ma wspólny czas: gdy ktokolwiek ją przewinie, skraca się wszystkim.`,
      }),
    );
  }

  function inviteCard() {
    const party = view.party;
    const own = party?.members.find((member) => member.own);
    if (party && (!own?.leader || party.members.length >= party.size)) return null;
    const inParty = new Set(party ? party.members.map((member) => member.name) : []);
    const invited = new Set(party ? party.invited.map((one) => one.name) : []);
    const ready = friends.filter((friend) => !inParty.has(friend.name) && !invited.has(friend.name) && friend.level >= view.unlockLevel);
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'party-invite-title' },
      h('h2', { class: 'card-title', id: 'party-invite-title', text: 'Zaproś do drużyny' }),
      // The author's words (1.11.2026), over the friends and the name field.
      h('p', { class: 'muted', text: `Zaproś postaci od ${view.unlockLevel}. poziomu wzwyż. Poniżej możesz to zrobić z listy znajomych lub dodać kogokolwiek ręcznie spoza niej.` }),
      ready.length > 0 &&
        h(
          'ul',
          { class: 'friends-list' },
          ready.map((friend) => h('li', { class: 'friend' }, who(friend), h('div', { class: 'friend-actions' }, button('Zaproś', act('/api/party/invite', { name: friend.name }), 'system')))),
        ),
      inviteForm,
    );
  }

  function sentCard() {
    const party = view.party;
    if (!party || party.invited.length === 0) return null;
    const own = party.members.find((member) => member.own);
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'party-sent-title' },
      h('h2', { class: 'card-title', id: 'party-sent-title', text: 'Wysłane zaproszenia' }),
      h(
        'ul',
        { class: 'friends-list' },
        party.invited.map((one) =>
          h('li', { class: 'friend' }, who(one), own?.leader && h('div', { class: 'friend-actions' }, button('Cofnij', act('/api/party/cancel', { characterId: one.id }, 'Zaproszenie cofnięte.')))),
        ),
      ),
    );
  }

  function leaveCard() {
    if (!view.party) return null;
    return h(
      'div',
      { class: 'party-leave' },
      button('Opuść drużynę', async () => {
        const own = view.party.members.find((member) => member.own);
        const text = own?.leader && view.party.members.length > 1 ? 'Przywództwo przejmie ta postać, która dołączyła najwcześniej.' : 'Wyprawa, która już trwa, skończy się jak zaczęła.';
        if (!(await confirmAction({ title: 'Opuścić drużynę?', text, confirmLabel: 'Opuść' }))) return;
        await act('/api/party/leave')();
      }),
    );
  }

  Promise.all([call('GET', '/api/party'), call('GET', '/api/friends').catch(() => null)])
    .then(([party, known]) => {
      friends = known?.friends ?? [];
      show(party);
    })
    .catch((error) => {
      if (!gone) fill(body, h('section', { class: 'card' }, h('p', { class: 'muted', text: error.message ?? 'Nie udało się wczytać drużyny.' })));
    });

  return {
    unmount() {
      gone = true;
    },
  };
}

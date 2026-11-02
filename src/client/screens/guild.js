// The Gildia's own page (#/gildia; src/server/guilds.js), opened from its
// tab in the Społeczność (the author: "Wygeneruj też tło do zakładki
// Gildii, ona powinna uruchamiać osobną stronę ... raczej strony z tłem"):
// its picture behind the heading, the way back to the Społeczność, the
// invitations waiting for this character; its guild with the members, the
// leader and the deputies marked, and what its role lets it do (invite a
// friend at a tap or anyone by name, take an invitation back, remove, name
// a deputy, hand the lead over); "Opuść gildię"; and, outside a guild,
// founding one from its level for its gold. The guild's channel is a tab
// of the Czat (community.js).
//
// Under the heading, the page's tabs (data/guilds.json, tabs), in the look
// of the Społeczność's row of parts: "Gildia" with all the above, then the
// guild's activities, "Bestia" (guild-beast.js), "Próby" (guild-trials.js)
// and "Prośby" (guild-requests.js). The address keeps the tab
// (#/gildia/<id>), and the page opens on the one shown last on the device,
// or on "Gildia" outside a guild.

import { placeArt } from '../art.js';
import { guildSeen } from '../chat-news.js';
import { $, fill, h, icon } from '../dom.js';
import { formatNumber } from '../format.js';
import { mountGuildBeast } from '../guild-beast.js';
import { mountGuildRequests } from '../guild-requests.js';
import { mountGuildTrials } from '../guild-trials.js';
import { CLASS_ICONS } from '../icons.js';
import { openProfile } from '../profile.js';
import { call, isUnlocked, state } from '../state.js';
import { confirmAction, toast, withButton } from '../ui.js';
import { lockedScreen } from './locked.js';

const PAGE = '#/gildia';
const TAB_KEY = 'insight-guild-tab';
const TAB_ICONS = { guild: 'banner', beast: 'beast', trials: 'trophy', requests: 'gift' };
const TAB_MOUNTS = { guild: mountGuild, beast: mountGuildBeast, trials: mountGuildTrials, requests: mountGuildRequests };

// The tab to open: the address's, else the one shown last on the device
// for a character in a guild, else the first.
function firstTab(tabs, asked) {
  const ids = tabs.map((tab) => tab.id);
  if (ids.includes(asked)) return asked;
  let kept = null;
  try {
    kept = localStorage.getItem(TAB_KEY);
  } catch {
    // The first tab, then.
  }
  return state.character.guildTag && ids.includes(kept) ? kept : ids[0];
}

export function mountGuildPage(container, context) {
  if (!isUnlocked('community')) return lockedScreen('community', 'Gildia')(container, context);
  const art = placeArt(state.content.guildPlace);
  const heading = h('div', { class: `page-heading${art ? ' guild-heading' : ''}` }, h('h1', { class: 'page-title', tabindex: '-1', text: 'Gildia' }));
  if (art) heading.style.setProperty('--place-art', `url("${art}")`);
  const back = h('a', { class: 'link-button guild-back', href: '#/spolecznosc' }, icon('back', { size: 16 }), 'Społeczność');
  const tabs = state.content.guildTabs;
  const row = h('div', { class: 'community-tabs', role: 'tablist', 'aria-label': 'Części Gildii' });
  // The row stays under the top bar while the page scrolls, as the
  // Społeczność's does (styles.css).
  const picker = h('div', { class: 'community-picker guild-picker' }, row);
  const body = h('div', { class: 'guild-body' });
  fill(container, back, heading, picker, body);
  const topbar = $('.topbar');
  const stick = () => picker.style.setProperty('--community-top', `${topbar?.offsetHeight ?? 0}px`);
  const watcher = topbar && typeof ResizeObserver === 'function' ? new ResizeObserver(stick) : null;
  watcher?.observe(topbar);
  stick();

  let current = null;
  let part = null;
  function show(id) {
    current = id;
    try {
      localStorage.setItem(TAB_KEY, id);
    } catch {
      // Remembered for this visit only.
    }
    history.replaceState(history.state, '', id === tabs[0].id ? PAGE : `${PAGE}/${id}`);
    part?.unmount();
    fill(body);
    part = TAB_MOUNTS[id](body);
    render();
    // A tab picked with the page scrolled down opens at its top, under the
    // row of tabs as far as the page has it there.
    const under = picker.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(container).rowGap) || 0);
    const top = body.getBoundingClientRect().top;
    if (top < under) window.scrollBy(0, top - under);
  }

  function render() {
    fill(
      row,
      tabs.map((tab) =>
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            class: 'community-tab',
            'aria-selected': String(tab.id === current),
            onClick: () => {
              if (tab.id !== current) show(tab.id);
            },
          },
          icon(TAB_ICONS[tab.id] ?? 'unknown', { size: 20, className: 'community-icon' }),
          h('span', { class: 'community-name', text: tab.name }),
        ),
      ),
    );
    row.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  show(firstTab(tabs, context?.params?.tab));
  return {
    unmount() {
      part?.unmount();
      watcher?.disconnect();
    },
  };
}

function mountGuild(container) {
  let view = null;
  let gone = false;
  const body = h('div', { class: 'friends guild' }, h('p', { class: 'muted', text: 'Wczytywanie…' }));
  fill(container, body);

  function show(next) {
    if (gone) return;
    view = next;
    guildSeen(view);
    fill(body, invitesCard(), view.guild ? [guildCard(), inviteCard(), sentCard(), leaveCard()] : foundCard());
  }

  // An action answered with the Gildia anew, its words in a toast.
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
      person.online !== undefined && h('span', { class: `friend-status friend-status--${person.online ? 'online' : 'offline'}`, role: 'img', 'aria-label': person.online ? 'w grze' : 'poza grą' }),
      icon(CLASS_ICONS[person.classId] ?? 'person', { size: 16, className: 'chat-class' }),
      h('button', { type: 'button', class: 'chat-name', text: person.name, 'aria-label': `${person.name}: zobacz postać`, onClick: (event) => withButton(event.currentTarget, () => openProfile(person.name)) }),
      person.level && h('span', { class: 'chat-level', text: `poz. ${person.level}` }),
      more,
    );

  function invitesCard() {
    if (view.invites.length === 0) return null;
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'guild-invites-title' },
      h('h2', { class: 'card-title', id: 'guild-invites-title', text: 'Zaproszenia do gildii' }),
      h(
        'ul',
        { class: 'friends-list' },
        view.invites.map((invite) =>
          h(
            'li',
            { class: 'friend' },
            h('p', { class: 'party-invite', text: `${invite.name} [${invite.tag}]: zaprasza ${invite.invitedBy}. Członków: ${invite.members} z ${view.rules.size}.` }),
            h(
              'div',
              { class: 'friend-actions' },
              button('Dołącz', act('/api/guild/accept', { guildId: invite.guildId }), 'system'),
              button('Odrzuć', act('/api/guild/decline', { guildId: invite.guildId }, 'Zaproszenie odrzucone.')),
            ),
          ),
        ),
      ),
    );
  }

  // Founding a guild: its name and tag, from the level for the gold.
  function foundCard() {
    const { foundLevel, foundGold, name: names, tag: tags } = view.rules;
    // The author's words (1.11.2026).
    const intro = h('p', {
      class: 'muted',
      text: 'Gildia to miejsce dla Twojej własnej społeczności w grze. Gwarantuje dodatkowe aktywności i współpracę z innymi graczami. Do gildii dołączysz na zaproszenie liderów lub możesz założyć ją sam.',
    });
    if (state.character.level < foundLevel) {
      return h('section', { class: 'card', 'aria-labelledby': 'guild-title' }, h('h2', { class: 'card-title', id: 'guild-title' }, icon('banner', { size: 22 }), 'Gildia'), intro, h('p', { class: 'muted', text: `Własną gildię założysz od ${foundLevel}. poziomu postaci. Twój poziom: ${state.character.level}.` }));
    }
    const nameInput = h('input', { type: 'text', id: 'guild-name', maxlength: String(names.max), autocomplete: 'off', placeholder: 'Nazwa gildii', 'aria-label': 'Nazwa gildii' });
    const tagInput = h('input', { type: 'text', id: 'guild-tag', maxlength: String(tags.max), autocomplete: 'off', autocapitalize: 'characters', placeholder: 'Skrót', 'aria-label': 'Skrót gildii', class: 'guild-tag-input' });
    const found = h('button', { type: 'submit', class: 'button button--system', text: `Załóż za ${formatNumber(foundGold)} złota`, disabled: state.character.gold < foundGold });
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'guild-title' },
      h('h2', { class: 'card-title', id: 'guild-title' }, icon('banner', { size: 22 }), 'Załóż gildię'),
      intro,
      h('p', { class: 'muted', text: `Nazwa: od ${names.min} do ${names.max} znaków. Skrót: od ${tags.min} do ${tags.max} liter albo cyfr, widoczny przy nazwie.` }),
      h(
        'form',
        {
          class: 'guild-found',
          onSubmit: (event) => {
            event.preventDefault();
            withButton(found, act('/api/guild/found', { name: nameInput.value, tag: tagInput.value }));
          },
        },
        nameInput,
        tagInput,
        found,
      ),
      state.character.gold < foundGold && h('p', { class: 'muted', text: `Brakuje złota: masz ${formatNumber(state.character.gold)}.` }),
    );
  }

  function guildCard() {
    const { guild } = view;
    const own = guild.role;
    const actions = (member) => {
      if (member.own) return null;
      const list = [];
      if (own === 'leader') {
        list.push(
          member.role === 'deputy'
            ? button('Na członka', act('/api/guild/role', { characterId: member.id, role: 'member' }))
            : button('Na zastępcę', act('/api/guild/role', { characterId: member.id, role: 'deputy' })),
          button('Przekaż przywództwo', async () => {
            if (!(await confirmAction({ title: 'Przekazać przywództwo?', text: `${member.name} poprowadzi gildię, a Ty zostaniesz zastępcą.`, confirmLabel: 'Przekaż' }))) return;
            await act('/api/guild/lead', { characterId: member.id })();
          }),
        );
      }
      if (own === 'leader' || (own === 'deputy' && member.role === 'member')) {
        list.push(
          button('Usuń', async () => {
            if (!(await confirmAction({ title: 'Usunąć z gildii?', text: `${member.name} opuści gildię.`, confirmLabel: 'Usuń' }))) return;
            await act('/api/guild/kick', { characterId: member.id })();
          }),
        );
      }
      return list.length > 0 ? h('div', { class: 'friend-actions' }, list) : null;
    };
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'guild-title' },
      h('h2', { class: 'card-title', id: 'guild-title' }, icon('banner', { size: 22 }), `${guild.name} [${guild.tag}] (${guild.members.length}/${guild.size})`),
      h(
        'ul',
        { class: 'friends-list' },
        guild.members.map((member) => h('li', { class: 'friend' }, who(member, member.role !== 'member' && h('span', { class: 'party-leader', text: member.role === 'leader' ? 'Lider' : 'Zastępca' })), actions(member))),
      ),
      h('p', { class: 'muted', text: 'Kanał gildii czeka w Czacie, w zakładce „Gildia”.' }),
    );
  }

  // Inviting a friend at a tap or anyone by name, for the leader and the
  // deputies, as in the Drużyna (screens/party.js).
  function inviteCard() {
    const { guild } = view;
    if (guild.role === 'member' || guild.members.length >= guild.size) return null;
    const friends = guild.friends ?? [];
    const name = h('input', { type: 'text', id: 'guild-invite-name', maxlength: '20', autocomplete: 'off', autocapitalize: 'none', enterkeyhint: 'send', placeholder: 'Imię postaci', 'aria-label': 'Imię postaci do zaproszenia do gildii' });
    const send = h('button', { type: 'submit', class: 'button button--system chat-send', text: 'Zaproś' });
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'guild-invite-title' },
      h('h2', { class: 'card-title', id: 'guild-invite-title', text: 'Zaproś do gildii' }),
      h('p', { class: 'muted', text: 'Poniżej możesz zaprosić kogoś z listy znajomych lub dodać kogokolwiek ręcznie spoza niej.' }),
      friends.length > 0 &&
        h(
          'ul',
          { class: 'friends-list' },
          friends.map((friend) => h('li', { class: 'friend' }, who(friend), h('div', { class: 'friend-actions' }, button('Zaproś', act('/api/guild/invite', { name: friend.name }), 'system')))),
        ),
      h(
        'form',
        {
          class: 'chat-form',
          onSubmit: (event) => {
            event.preventDefault();
            withButton(send, async () => {
              const value = name.value.trim();
              if (!value) return;
              await act('/api/guild/invite', { name: value })();
            });
          },
        },
        name,
        send,
      ),
    );
  }

  function sentCard() {
    const { guild } = view;
    if (guild.invited.length === 0) return null;
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'guild-sent-title' },
      h('h2', { class: 'card-title', id: 'guild-sent-title', text: 'Wysłane zaproszenia' }),
      h(
        'ul',
        { class: 'friends-list' },
        guild.invited.map((one) =>
          h('li', { class: 'friend' }, who(one), guild.role !== 'member' && h('div', { class: 'friend-actions' }, button('Cofnij', act('/api/guild/cancel', { characterId: one.id }, 'Zaproszenie cofnięte.')))),
        ),
      ),
    );
  }

  function leaveCard() {
    const { guild } = view;
    return h(
      'div',
      { class: 'party-leave' },
      button('Opuść gildię', async () => {
        const text =
          guild.role === 'leader' && guild.members.length > 1
            ? 'Przywództwo przejmie pierwszy zastępca, a gdy go nie ma, członek z najdłuższym stażem.'
            : guild.members.length === 1
              ? 'W gildii nie ma nikogo poza Twoją postacią: po wyjściu gildia zniknie razem ze swoim kanałem.'
              : 'Wrócić możesz tylko na nowe zaproszenie.';
        if (!(await confirmAction({ title: 'Opuścić gildię?', text, confirmLabel: 'Opuść' }))) return;
        await act('/api/guild/leave')();
      }),
    );
  }

  call('GET', '/api/guild')
    .then(show)
    .catch((error) => {
      if (!gone) fill(body, h('section', { class: 'card' }, h('p', { class: 'muted', text: error.message ?? 'Nie udało się wczytać gildii.' })));
    });

  return {
    unmount() {
      gone = true;
    },
  };
}

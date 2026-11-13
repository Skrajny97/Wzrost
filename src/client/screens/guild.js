// The Gildia's own page (#/gildia; src/server/guilds.js), opened from its
// tab in the Społeczność (the author: "Wygeneruj też tło do zakładki
// Gildii, ona powinna uruchamiać osobną stronę ... raczej strony z tłem"):
// its picture behind the heading, the way back to the Społeczność, the
// invitations waiting for this character; its guild with the members, the
// leader and the deputies marked, and what its role lets it do (invite a
// friend at a tap or anyone by name, take an invitation back, remove, name
// a deputy, hand the lead over); the Ranking członków under it
// (guild-ranking.js, 897 A); "Opuść gildię"; and, outside a guild,
// founding one from its level for its gold. The guild's channel is a tab
// of the Czat (community.js).
//
// Under the heading, the page's tabs (data/guilds.json, tabs), in the look
// of the Społeczność's parts but in two thin rows: "Gildia" with all the above, then the
// guild's "Siedziba" with its buildings (guild-seat.js, 616 A) and its
// activities, "Wyprawa" (guild-expedition.js, 621 A), "Bestia"
// (guild-beast.js), "Próby" (guild-trials.js), "Prośby"
// (guild-requests.js), "Wymiana" (guild-exchange.js), "Skrzynia"
// (guild-chest.js, the author, 10.11.2026: „Wspólna skrzynia Gildii”) and,
// where the guild wars are on, "Wojna" (guild-war.js, 792–800), the nine
// tabs then in three rows of three (792 v2). The
// address keeps the tab (#/gildia/<id>), and the page opens on the one
// shown last on the device, or on "Gildia" outside a guild. Its own words
// are shown in the page's language (t(), i18n.js); the tabs' names and the
// parts' words come in it from the server.

import { placeArt } from '../art.js';
import { checkGuildTodo, guildSeen, guildTodoNews, onChatNews } from '../chat-news.js';
import { $, fill, h, icon } from '../dom.js';
import { formatNumber } from '../format.js';
import { t } from '../i18n.js';
import { mountGuildBeast } from '../guild-beast.js';
import { mountGuildChest } from '../guild-chest.js';
import { mountGuildExchange } from '../guild-exchange.js';
import { mountGuildExpedition } from '../guild-expedition.js';
import { guildRankingCard } from '../guild-ranking.js';
import { mountGuildRequests } from '../guild-requests.js';
import { mountGuildSeat } from '../guild-seat.js';
import { mountGuildTrials } from '../guild-trials.js';
import { mountGuildWar } from '../guild-war.js';
import { CLASS_ICONS } from '../icons.js';
import { narrate } from '../narrator.js';
import { openProfile } from '../profile.js';
import { call, isUnlocked, state } from '../state.js';
import { confirmAction, foldPart, framedName, guildTag, toast, withButton } from '../ui.js';
import { lockedScreen } from './locked.js';

const PAGE = '#/gildia';
const TAB_KEY = 'insight-guild-tab';
const TAB_ICONS = { guild: 'banner', seat: 'keep', expedition: 'tent', beast: 'beast', trials: 'trophy', requests: 'gift', exchange: 'swap', chest: 'coffer', war: 'swords' };
const TAB_MOUNTS = {
  guild: mountGuild,
  seat: mountGuildSeat,
  expedition: mountGuildExpedition,
  beast: mountGuildBeast,
  trials: mountGuildTrials,
  requests: mountGuildRequests,
  exchange: mountGuildExchange,
  chest: mountGuildChest,
  war: mountGuildWar,
};

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
  const heading = h('div', { class: `page-heading${art ? ' guild-heading' : ''}` }, h('h1', { class: 'page-title', tabindex: '-1', text: t('Gildia') }));
  if (art) heading.style.setProperty('--place-art', `url("${art}")`);
  const back = h('a', { class: 'link-button guild-back', href: '#/spolecznosc' }, icon('back', { size: 16 }), t('Społeczność'));
  const tabs = state.content.guildTabs;
  // The narrator points at the tabs on a member's first look (narrator.js).
  const row = h('div', { class: 'community-tabs', role: 'tablist', 'aria-label': t('Części Gildii'), 'data-guide': 'guild-tabs' });
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
    // The new address changes no route, so the narrator is told of it: its
    // line about the Wyprawa (646) comes on the first look at that tab (664).
    narrate(location.hash);
  }

  // Two thin rows (the author: "Ciasno się tu zrobiło zrób dwa cieńsze
  // rzędy"): the first half of the tabs over the rest, each row filling the
  // width (styles.css, .guild-picker): in a grid of first × second columns a
  // tab of the first row spans `second` of them, one of the second `first`.
  // Nine tabs, with the Wojna (792 v2), stand in three rows of three, their
  // names at full size: in two rows they did not fit a phone of 320 px.
  const three = tabs.length > 8;
  const first = three ? 1 : Math.ceil(tabs.length / 2);
  const second = three ? 0 : tabs.length - first;
  row.classList.toggle('community-tabs--three', three);
  row.style.setProperty('--guild-columns', String(three ? 3 : second ? first * second : first));

  function render() {
    fill(
      row,
      tabs.map((tab, index) => {
        const button = h(
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
          icon(TAB_ICONS[tab.id] ?? 'unknown', { size: 16, className: 'community-icon' }),
          h('span', { class: 'community-name', text: tab.name }),
          // Something to do in this part: a trial's chest, an attack on the
          // Bestia or on the Wyprawa's guardian or a chest, a gift to thank
          // for, an item waiting in the Skrzynia (chat-news.js,
          // guild-todo.js).
          guildTodoNews(tab.id) && h('span', { class: 'community-dot', role: 'img', 'aria-label': t('do zrobienia') }),
        );
        button.style.setProperty('--guild-span', String(second ? (index < first ? second : first) : 1));
        return button;
      }),
    );
    row.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  show(firstTab(tabs, context?.params?.tab));
  // The parts' dots follow what waits in the guild, asked for at once here.
  const stopNews = onChatNews(render);
  checkGuildTodo({ now: true });
  return {
    unmount() {
      part?.unmount();
      watcher?.disconnect();
      stopNews();
    },
  };
}

function mountGuild(container) {
  let view = null;
  let gone = false;
  // The Ranking członków (guild-ranking.js, 897 A), under the guild's card:
  // made once for the guild, kept as the cards are drawn anew.
  let ranking = null;
  const body = h('div', { class: 'friends guild' }, h('p', { class: 'muted', text: t('Wczytywanie…') }));
  fill(container, body);

  function show(next) {
    if (gone) return;
    view = next;
    guildSeen(view);
    if (view.guild && ranking?.dataset.guild !== String(view.guild.id)) {
      ranking = guildRankingCard();
      ranking.dataset.guild = String(view.guild.id);
    }
    fill(body, invitesCard(), view.guild ? [guildCard(), ranking, inviteCard(), sentCard(), leaveCard()] : foundCard());
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
      person.online !== undefined && h('span', { class: `friend-status friend-status--${person.online ? 'online' : 'offline'}`, role: 'img', 'aria-label': person.online ? t('w grze') : t('poza grą') }),
      icon(CLASS_ICONS[person.classId] ?? 'person', { size: 16, className: 'chat-class' }),
      framedName(
        h('button', { type: 'button', class: 'chat-name', text: person.name, 'aria-label': t('{name}: zobacz postać', { name: person.name }), onClick: (event) => withButton(event.currentTarget, () => openProfile(person.name)) }),
        person.nameColor,
      ),
      person.level && h('span', { class: 'chat-level', text: t('poz. {level}', { level: person.level }) }),
      more,
    );

  function invitesCard() {
    if (view.invites.length === 0) return null;
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'guild-invites-title' },
      h('h2', { class: 'card-title', id: 'guild-invites-title', text: t('Zaproszenia do gildii') }),
      h(
        'ul',
        { class: 'friends-list' },
        view.invites.map((invite) =>
          h(
            'li',
            { class: 'friend' },
            h('p', { class: 'party-invite', text: t('{name} [{tag}]: zaprasza {inviter}. Członków: {members} z {size}.', { name: invite.name, tag: invite.tag, inviter: invite.invitedBy, members: invite.members, size: view.rules.size }) }),
            h(
              'div',
              { class: 'friend-actions' },
              button(t('Dołącz'), act('/api/guild/accept', { guildId: invite.guildId }), 'system'),
              button(t('Odrzuć'), act('/api/guild/decline', { guildId: invite.guildId }, t('Zaproszenie odrzucone.'))),
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
      text: t('Gildia to miejsce dla Twojej własnej społeczności w grze. Gwarantuje dodatkowe aktywności i współpracę z innymi graczami. Do gildii dołączysz na zaproszenie liderów lub możesz założyć ją sam.'),
    });
    if (state.character.level < foundLevel) {
      return h('section', { class: 'card', 'aria-labelledby': 'guild-title' }, h('h2', { class: 'card-title', id: 'guild-title' }, icon('banner', { size: 22 }), t('Gildia')), intro, h('p', { class: 'muted', text: t('Własną gildię założysz od {level}. poziomu postaci. Twój poziom: {own}.', { level: foundLevel, own: state.character.level }) }));
    }
    const nameInput = h('input', { type: 'text', id: 'guild-name', maxlength: String(names.max), autocomplete: 'off', placeholder: t('Nazwa gildii'), 'aria-label': t('Nazwa gildii') });
    const tagInput = h('input', { type: 'text', id: 'guild-tag', maxlength: String(tags.max), autocomplete: 'off', autocapitalize: 'characters', placeholder: t('Skrót'), 'aria-label': t('Skrót gildii'), class: 'guild-tag-input' });
    const found = h('button', { type: 'submit', class: 'button button--system', text: t('Załóż za {gold} złota', { gold: formatNumber(foundGold) }), disabled: state.character.gold < foundGold });
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'guild-title' },
      h('h2', { class: 'card-title', id: 'guild-title' }, icon('banner', { size: 22 }), t('Załóż gildię')),
      intro,
      h('p', { class: 'muted', text: t('Nazwa: od {min} do {max} znaków. Skrót: od {tagMin} do {tagMax} liter albo cyfr, widoczny przy nazwie.', { min: names.min, max: names.max, tagMin: tags.min, tagMax: tags.max }) }),
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
      state.character.gold < foundGold && h('p', { class: 'muted', text: t('Brakuje złota: masz {gold}.', { gold: formatNumber(state.character.gold) }) }),
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
            ? button(t('Na członka'), act('/api/guild/role', { characterId: member.id, role: 'member' }))
            : button(t('Na zastępcę'), act('/api/guild/role', { characterId: member.id, role: 'deputy' })),
          button(t('Przekaż przywództwo'), async () => {
            if (!(await confirmAction({ title: t('Przekazać przywództwo?'), text: t('{name} poprowadzi gildię, a Ty zostaniesz zastępcą.', { name: member.name }), confirmLabel: t('Przekaż') }))) return;
            await act('/api/guild/lead', { characterId: member.id })();
          }),
        );
      }
      if (own === 'leader' || (own === 'deputy' && member.role === 'member')) {
        list.push(
          button(t('Usuń'), async () => {
            if (!(await confirmAction({ title: t('Usunąć z gildii?'), text: t('{name} opuści gildię.', { name: member.name }), confirmLabel: t('Usuń') }))) return;
            await act('/api/guild/kick', { characterId: member.id })();
          }),
        );
      }
      return list.length > 0 ? h('div', { class: 'friend-actions' }, list) : null;
    };
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'guild-title' },
      // The tag as beside the names, in gold for the best guild of last
      // week, which its page names so (380 C).
      h('h2', { class: 'card-title', id: 'guild-title' }, icon('banner', { size: 22 }), `${guild.name} `, guildTag(guild.tag)),
      guild.champion && h('p', { class: 'guild-champion' }, icon('trophy', { size: 18 }), state.content.guildFame.champion),
      // The members folded (the author: "lista członków Gildii powinna być
      // rozwijana"), their count in sight.
      h(
        'details',
        { class: 'guild-members' },
        h('summary', { class: 'guild-members-toggle', text: t('Członkowie ({count}/{size})', { count: guild.members.length, size: guild.size }) }),
        h(
          'ul',
          { class: 'friends-list' },
          guild.members.map((member) => h('li', { class: 'friend' }, who(member, member.role !== 'member' && h('span', { class: 'party-leader', text: member.role === 'leader' ? t('Lider') : t('Zastępca') })), actions(member))),
        ),
      ),
      h('p', { class: 'muted', text: t('Kanał gildii czeka w Czacie, w zakładce „Gildia”.') }),
    );
  }

  // Inviting a friend at a tap or anyone by name, for the leader and the
  // deputies, as in the Drużyna (screens/party.js).
  function inviteCard() {
    const { guild } = view;
    if (guild.role === 'member' || guild.members.length >= guild.size) return null;
    const friends = guild.friends ?? [];
    const name = h('input', { type: 'text', id: 'guild-invite-name', maxlength: '20', autocomplete: 'off', autocapitalize: 'none', enterkeyhint: 'send', placeholder: t('Imię postaci'), 'aria-label': t('Imię postaci do zaproszenia do gildii') });
    const send = h('button', { type: 'submit', class: 'button button--system chat-send', text: t('Zaproś') });
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'guild-invite-title' },
      foldPart(
        { key: 'guild-invite', title: t('Zaproś do gildii'), card: true, id: 'guild-invite-title', open: false },
      h('p', { class: 'muted', text: t('Poniżej możesz zaprosić kogoś z listy znajomych lub dodać kogokolwiek ręcznie spoza niej.') }),
      friends.length > 0 &&
        h(
          'ul',
          { class: 'friends-list' },
          friends.map((friend) => h('li', { class: 'friend' }, who(friend), h('div', { class: 'friend-actions' }, button(t('Zaproś'), act('/api/guild/invite', { name: friend.name }), 'system')))),
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
      ),
    );
  }

  function sentCard() {
    const { guild } = view;
    if (guild.invited.length === 0) return null;
    return h(
      'section',
      { class: 'card', 'aria-labelledby': 'guild-sent-title' },
      foldPart(
        { key: 'guild-sent', title: t('Wysłane zaproszenia ({count})', { count: guild.invited.length }), card: true, id: 'guild-sent-title', open: false },
      h(
        'ul',
        { class: 'friends-list' },
        guild.invited.map((one) =>
          h('li', { class: 'friend' }, who(one), guild.role !== 'member' && h('div', { class: 'friend-actions' }, button(t('Cofnij'), act('/api/guild/cancel', { characterId: one.id }, t('Zaproszenie cofnięte.'))))),
        ),
      ),
      ),
    );
  }

  function leaveCard() {
    const { guild } = view;
    return h(
      'div',
      { class: 'party-leave' },
      button(t('Opuść gildię'), async () => {
        const text =
          guild.role === 'leader' && guild.members.length > 1
            ? t('Przywództwo przejmie pierwszy zastępca, a gdy go nie ma, członek z najdłuższym stażem.')
            : guild.members.length === 1
              ? t('W gildii nie ma nikogo poza Twoją postacią: po wyjściu gildia zniknie razem ze swoim kanałem.')
              : t('Wrócić możesz tylko na nowe zaproszenie.');
        if (!(await confirmAction({ title: t('Opuścić gildię?'), text, confirmLabel: t('Opuść') }))) return;
        await act('/api/guild/leave')();
      }),
    );
  }

  call('GET', '/api/guild')
    .then(show)
    .catch((error) => {
      if (!gone) fill(body, h('section', { class: 'card' }, h('p', { class: 'muted', text: error.message ?? t('Nie udało się wczytać gildii.') })));
    });

  return {
    unmount() {
      gone = true;
    },
  };
}

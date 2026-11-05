// Another player's character, from a tap on its name in the chat, the
// Ranking or the Znajomi: its portrait, large, in the frame and on the
// background it wears, with its aura and its pet (the Sklep Systemu,
// cosmetics.js), its name in the frame's colour when so chosen, levels,
// what it wears and the skills it has learned (characterProfile in
// src/server/characters.js), with a
// private message to it in the chat, a Wymiana (screens/trade.js) and what
// the player can do with it as a friend (src/server/community.js), an
// invitation to the player's guild for its leader and deputies
// (src/server/guilds.js); last, trades from its player blocked or not. A
// tap on a piece of gear shows its properties. `onChange` gets the Znajomi
// anew after a friend's action. "Oznacz" puts "@" and its name in the line
// of the chat it was opened from (`mention`, screens/community.js), else
// in the Globalny's in the Społeczność.

import { skillSprite } from './art.js';
import { friendsSeen, wantConversation, wantMention } from './chat-news.js';
import { portraitBox } from './cosmetics.js';
import { h, icon } from './dom.js';
import { SLOT_ICONS } from './icons.js';
import { call, isUnlocked, state } from './state.js';
import { closeSheet, confirmAction, framedName, guildTag, openSheet, toast, withButton } from './ui.js';
import { itemSummary } from './screens/character.js';
import { proposeTrade } from './screens/trade.js';

const PATHS = { main: 'ścieżka główna', second: 'ścieżka poboczna' };

export async function openProfile(name, { onChange, mention } = {}) {
  const { profile } = await call('GET', `/api/profile/${encodeURIComponent(name)}`);
  openSheet(
    h(
      'div',
      { class: 'profile-head' },
      portraitBox(profile, { frame: profile.frame, background: profile.background, aura: profile.aura, pet: profile.pet }, 'profile-portrait'),
      h(
        'div',
        { class: 'profile-title' },
        h(
          'h2',
          { class: 'sheet-title chat-sheet' },
          framedName(h('span', { text: profile.name }), profile.nameColor),
          profile.guild && [' ', guildTag(profile.guild.tag)],
          profile.role && h('span', { class: `chat-role chat-role--${profile.role}`, text: ` (${profile.role})` }),
        ),
        h('p', { class: 'profile-levels', text: `${profile.className} · poziom ${profile.level} · klasa ${profile.classLevel}` }),
        profile.guild && h('p', { class: 'profile-levels', text: `Gildia: ${profile.guild.name} [${profile.guild.tag}]` }),
      ),
    ),
    profile.relation?.state !== 'self' && friendship(profile, onChange, mention),
    h('h3', { class: 'profile-section', text: 'Ekwipunek' }),
    h(
      'ul',
      { class: 'profile-items' },
      profile.equipment.map(({ slot, slotName, item }) =>
        h(
          'li',
          {},
          item
            ? h(
                'details',
                { class: 'profile-item' },
                h('summary', {}, itemSummary(item)),
                h(
                  'ul',
                  { class: 'item-properties' },
                  item.properties.map((line) => h('li', { text: line })),
                  item.classNames && h('li', { class: 'item-classes', text: `${item.classNames.length > 1 ? 'Dla klas' : 'Dla klasy'}: ${item.classNames.join(', ')}` }),
                ),
              )
            : h('p', { class: 'profile-empty' }, icon(SLOT_ICONS[slot] ?? 'unknown', { size: 20 }), h('span', { text: `${slotName}: pusto` })),
        ),
      ),
    ),
    h('h3', { class: 'profile-section', text: 'Umiejętności' }),
    profile.skills.length === 0
      ? h('p', { class: 'muted', text: 'Jeszcze żadnej.' })
      : h(
          'ul',
          { class: 'profile-skills' },
          profile.skills.map((skill) =>
            h(
              'li',
              { class: 'profile-skill' },
              h('span', { class: 'skill-icon skill-icon--row', 'aria-hidden': 'true' }, skillSprite(skill.id) ?? h('span', { class: 'skill-letter', text: skill.name[0] })),
              h(
                'span',
                { class: 'profile-skill-text' },
                h('strong', { text: skill.name }),
                h('span', { class: 'profile-skill-meta', text: `poziom ${skill.level} z ${skill.maxLevel} · ${PATHS[skill.path]}` }),
              ),
            ),
          ),
        ),
  );
}

// Inviting the character, the invitation either way, or the friendship with
// its Upominek for today. After each the sheet shows the character anew.
function friendship(profile, onChange, mention) {
  const { relation, name } = profile;
  const again = () => openProfile(name, { onChange, mention });
  const act = (path, data, said) => async () => {
    const answer = await call('POST', path, data);
    friendsSeen(answer);
    onChange?.(answer);
    toast(answer.text ?? said);
    await again();
  };
  const button = (label, run, kind = 'world') =>
    h('button', { type: 'button', class: `button button--${kind} button--small`, text: label, onClick: (event) => withButton(event.currentTarget, run) });
  const note = (...children) => h('span', { class: 'profile-relation' }, children);
  const parts = !relation
    ? [button('Dodaj do znajomych', act('/api/friends/invite', { name }), 'system')]
    : relation.state === 'sent'
      ? [note('Zaproszenie wysłane.'), button('Cofnij', act('/api/friends/remove', { id: relation.id }, `Zaproszenie dla postaci ${name} cofnięte.`))]
      : relation.state === 'received'
        ? [
            button('Przyjmij zaproszenie', act('/api/friends/accept', { id: relation.id }), 'system'),
            button('Odrzuć', act('/api/friends/remove', { id: relation.id }, `Zaproszenie od postaci ${name} odrzucone.`)),
          ]
        : [
            relation.sentToday
              ? note(icon('gift', { size: 16 }), `${state.content.community.gift.name} wysłany dziś.`)
              : button(`Wyślij ${state.content.community.gift.name}`, act('/api/friends/gift', { id: relation.id }), 'system'),
            button(
              'Usuń ze znajomych',
              async () => {
                const sure = await confirmAction({
                  title: 'Usunąć ze znajomych?',
                  text: `${name} zniknie z Twoich znajomych, a Ty z listy tej postaci.`,
                  confirmLabel: 'Usuń',
                  danger: true,
                });
                if (sure) await act('/api/friends/remove', { id: relation.id }, `${name} nie jest już wśród Twoich znajomych.`)();
                else await again();
              },
              'danger',
            ),
          ];
  // "Zaproś do gildii", for the leader or a deputy, to a character in no
  // guild (the server's profile says when: guildInvite).
  const guildInvite =
    profile.guildInvite === 'can'
      ? button(
          'Zaproś do gildii',
          async () => {
            const answer = await call('POST', '/api/guild/invite', { name });
            toast(answer.text);
            await again();
          },
          'system',
        )
      : profile.guildInvite === 'sent'
        ? note('Zaproszenie do gildii wysłane.')
        : null;
  return h('div', { class: 'profile-friend' }, whisper(profile), tagButton(profile, mention), tradeButton(profile), parts, guildInvite, tradeBlock(profile, again));
}

// "Oznacz": "@" and the character's name in the line of the chat the sheet
// was opened from, else in the Globalny's in the Społeczność (taken at once
// when it is on the screen). Only for a character that reads the chat.
function tagButton(profile, mention) {
  const level = state.content.unlocks.find((unlock) => unlock.id === 'community')?.level ?? 0;
  if (!isUnlocked('community') || profile.level < level) return null;
  return h('button', {
    type: 'button',
    class: 'button button--system button--small',
    text: state.content.chat.mentions.texts.button,
    onClick: () => {
      closeSheet();
      if (mention) mention(profile.name);
      else if (!wantMention(profile.name)) location.hash = '#/spolecznosc/czat';
    },
  });
}

// "Wymiana": a trade proposed to the character, while both players are
// online.
const tradeButton = (profile) =>
  h('button', {
    type: 'button',
    class: 'button button--system button--small',
    text: 'Wymiana',
    onClick: (event) => withButton(event.currentTarget, () => proposeTrade({ id: profile.id, name: profile.name })),
  });

// No trades proposed by the character's player, or trades again.
function tradeBlock(profile, again) {
  const blocked = profile.tradeBlocked;
  return h('button', {
    type: 'button',
    class: 'button button--world button--small',
    text: blocked ? 'Odblokuj wymianę' : 'Zablokuj wymianę',
    onClick: (event) =>
      withButton(event.currentTarget, async () => {
        await call('POST', '/api/trade/block', { id: profile.id, blocked: !blocked });
        toast(blocked ? `${profile.name} znów może zaproponować Ci wymianę.` : `${profile.name} nie zaproponuje Ci już wymiany.`);
        await again();
      }),
  });
}

// "Prywatna wiadomość": the chat of the Społeczność opens the conversation
// with the character (screens/community.js).
function whisper(profile) {
  return h('button', {
    type: 'button',
    class: 'button button--system button--small',
    text: 'Prywatna wiadomość',
    onClick: () => {
      closeSheet();
      wantConversation({ id: profile.id, name: profile.name });
      if (location.hash !== '#/spolecznosc') location.hash = '#/spolecznosc';
    },
  });
}

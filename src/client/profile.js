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

import { mineralSprite, skillSprite } from './art.js';
import { friendsSeen, wantConversation, wantMention } from './chat-news.js';
import { portraitBox } from './cosmetics.js';
import { h, icon } from './dom.js';
import { t } from './i18n.js';
import { SLOT_ICONS } from './icons.js';
import { call, isUnlocked, state } from './state.js';
import { closeSheet, confirmAction, framedName, guildTag, openSheet, toast, withButton } from './ui.js';
import { itemSummary } from './screens/character.js';
import { proposeTrade } from './screens/trade.js';

// Shown in the page's language (t(), i18n.js).
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
        h('p', { class: 'profile-levels', text: t('{className} · poziom {level} · klasa {classLevel}', { className: profile.className, level: profile.level, classLevel: profile.classLevel }) }),
        profile.guild && h('p', { class: 'profile-levels', text: t('Gildia: {name} [{tag}]', { name: profile.guild.name, tag: profile.guild.tag }) }),
      ),
    ),
    profile.relation?.state !== 'self' && friendship(profile, onChange, mention),
    h('h3', { class: 'profile-section', text: t('Ekwipunek') }),
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
                  // The gem set in it, as on the item's own card.
                  item.gem &&
                    h(
                      'li',
                      { class: 'item-gem' },
                      h(
                        'details',
                        { class: 'item-gem-fold' },
                        h('summary', { class: 'item-gem-line', vars: { '--rarity': item.gem.color } }, mineralSprite(item.gem.id), ` ${item.gem.line}`),
                        h('p', { class: 'item-gem-help', text: item.gem.help }),
                      ),
                    ),
                  item.classNames && h('li', { class: 'item-classes', text: t(item.classNames.length > 1 ? 'Dla klas: {classes}' : 'Dla klasy: {classes}', { classes: item.classNames.join(', ') }) }),
                ),
              )
            : h('p', { class: 'profile-empty' }, icon(SLOT_ICONS[slot] ?? 'unknown', { size: 20 }), h('span', { text: t('{slot}: pusto', { slot: slotName }) })),
        ),
      ),
    ),
    h('h3', { class: 'profile-section', text: t('Umiejętności') }),
    profile.skills.length === 0
      ? h('p', { class: 'muted', text: t('Jeszcze żadnej.') })
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
                h('span', { class: 'profile-skill-meta', text: t('poziom {level} z {max} · {path}', { level: skill.level, max: skill.maxLevel, path: t(PATHS[skill.path]) }) }),
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
    ? [button(t('Dodaj do znajomych'), act('/api/friends/invite', { name }), 'system')]
    : relation.state === 'sent'
      ? [note(t('Zaproszenie wysłane.')), button(t('Cofnij'), act('/api/friends/remove', { id: relation.id }, t('Zaproszenie dla postaci {name} cofnięte.', { name })))]
      : relation.state === 'received'
        ? [
            button(t('Przyjmij zaproszenie'), act('/api/friends/accept', { id: relation.id }), 'system'),
            button(t('Odrzuć'), act('/api/friends/remove', { id: relation.id }, t('Zaproszenie od postaci {name} odrzucone.', { name }))),
          ]
        : [
            relation.sentToday
              ? note(icon('gift', { size: 16 }), t('{gift} wysłany dziś.', { gift: state.content.community.gift.name }))
              : button(t('Wyślij {gift}', { gift: state.content.community.gift.name }), act('/api/friends/gift', { id: relation.id }), 'system'),
            button(
              t('Usuń ze znajomych'),
              async () => {
                const sure = await confirmAction({
                  title: t('Usunąć ze znajomych?'),
                  text: t('{name} zniknie z Twoich znajomych, a Ty z listy tej postaci.', { name }),
                  confirmLabel: t('Usuń'),
                  danger: true,
                });
                if (sure) await act('/api/friends/remove', { id: relation.id }, t('{name} nie jest już wśród Twoich znajomych.', { name }))();
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
          t('Zaproś do gildii'),
          async () => {
            const answer = await call('POST', '/api/guild/invite', { name });
            toast(answer.text);
            await again();
          },
          'system',
        )
      : profile.guildInvite === 'sent'
        ? note(t('Zaproszenie do gildii wysłane.'))
        : null;
  return h('div', { class: 'profile-friend' }, whisper(profile), tagButton(profile, mention), tradeButton(profile), parts, guildInvite, tradeBlock(profile, again));
}

// "Oznacz": "@" and the character's name in the line of the chat the sheet
// was opened from, else in the Globalny's of the chat in sight (the side
// column on a computer, taken at once), else of the Czat's own screen
// (screens/chat.js), which it opens. Only for a character that reads the
// chat.
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
      else if (!wantMention(profile.name)) location.hash = '#/czat';
    },
  });
}

// "Wymiana": a trade proposed to the character, while both players are
// online.
const tradeButton = (profile) =>
  h('button', {
    type: 'button',
    class: 'button button--system button--small',
    text: t('Wymiana'),
    onClick: (event) => withButton(event.currentTarget, () => proposeTrade({ id: profile.id, name: profile.name })),
  });

// No trades proposed by the character's player, or trades again.
function tradeBlock(profile, again) {
  const blocked = profile.tradeBlocked;
  return h('button', {
    type: 'button',
    class: 'button button--world button--small',
    text: blocked ? t('Odblokuj wymianę') : t('Zablokuj wymianę'),
    onClick: (event) =>
      withButton(event.currentTarget, async () => {
        await call('POST', '/api/trade/block', { id: profile.id, blocked: !blocked });
        toast(blocked ? t('{name} znów może zaproponować Ci wymianę.', { name: profile.name }) : t('{name} nie zaproponuje Ci już wymiany.', { name: profile.name }));
        await again();
      }),
  });
}

// "Prywatna wiadomość": the chat opens the conversation with the character,
// the side column's on a computer at once, else the Czat's own screen
// (screens/chat.js), which it opens.
function whisper(profile) {
  return h('button', {
    type: 'button',
    class: 'button button--system button--small',
    text: t('Prywatna wiadomość'),
    onClick: () => {
      closeSheet();
      if (!wantConversation({ id: profile.id, name: profile.name })) location.hash = '#/czat';
    },
  });
}

// Another player's character, from a tap on its name in the chat: its
// portrait, levels, what it wears and the skills it has learned
// (characterProfile in src/server/characters.js). A tap on a piece of gear
// shows its properties.

import { portraitSprite, skillSprite } from './art.js';
import { h, icon } from './dom.js';
import { SLOT_ICONS } from './icons.js';
import { call } from './state.js';
import { openSheet } from './ui.js';
import { itemSummary } from './screens/character.js';

const PATHS = { main: 'ścieżka główna', second: 'ścieżka poboczna' };

export async function openProfile(name) {
  const { profile } = await call('GET', `/api/profile/${encodeURIComponent(name)}`);
  openSheet(
    h(
      'div',
      { class: 'profile-head' },
      h('span', { class: 'profile-portrait' }, portraitSprite(profile.classId, profile.appearance, { skin: profile.skin })),
      h(
        'div',
        { class: 'profile-title' },
        h(
          'h2',
          { class: 'sheet-title chat-sheet' },
          profile.name,
          profile.role && h('span', { class: `chat-role chat-role--${profile.role}`, text: ` (${profile.role})` }),
        ),
        h('p', { class: 'profile-levels', text: `${profile.className} · poziom ${profile.level} · klasa ${profile.classLevel}` }),
      ),
    ),
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

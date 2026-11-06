// Choosing the character to play (DECISIONS.md, "Pięć postaci na koncie"):
// the account's characters, each with its portrait, name, class, levels and
// what it is doing, the one played now marked, and "Nowa postać" while the
// account has room for one more (GET /api/characters). The game comes with
// the one chosen; the others wait aside, their explorations and works going
// on meanwhile.

import { portraitSprite } from '../art.js';
import { classArt } from '../class-art.js';
import { $, fill, h, icon } from '../dom.js';
import { countOf, timeFormat } from '../format.js';
import { t } from '../i18n.js';
import { CLASS_ICONS } from '../icons.js';
import { systemPanel, withButton } from '../ui.js';

const WORKS = { herbs: 'Zielarstwo', potions: 'Alchemia', items: 'Rzemieślnictwo', minerals: 'Górnictwo', jewels: 'Jubilerstwo', mercenary: 'Usługa najemna' };

// What the character is doing, in a few words.
function doing(activity) {
  if (!activity) return t('Odpoczynek');
  const what = WORKS[activity.kind] ? `${t(WORKS[activity.kind])} · ${activity.placeName}` : t('Eksploracja · {area}', { area: activity.areaName });
  return `${what} · ${activity.finished ? t('raport gotowy') : t('do {time}', { time: timeFormat.format(new Date(activity.endsAt)) })}`;
}

const bust = (character) =>
  portraitSprite(character.classId, character.appearance, { bust: true, skin: character.skin, evolution: character.evolution }) ??
  classArt(character.classId) ??
  icon(CLASS_ICONS[character.classId] ?? 'person', { size: 26 });

// `list`: the answer of GET /api/characters. `onChoose(id)` plays that
// character, `onCreate()` opens the creation of a new one, `onLogout()`
// signs out.
export function renderSelect(container, list, { onChoose, onCreate, onLogout }) {
  const { characters, max } = list;
  const card = (character) =>
    h(
      'li',
      {},
      h(
        'button',
        {
          type: 'button',
          class: `select-card${character.played ? ' select-card--played' : ''}`,
          onClick: (event) => withButton(event.currentTarget, () => onChoose(character.id)),
        },
        h('span', { class: 'select-portrait' }, bust(character)),
        h(
          'span',
          { class: 'select-text' },
          h('span', { class: 'select-name' }, character.name, character.played && h('span', { class: 'select-tag', text: t('Grasz teraz') })),
          h('span', { class: 'select-levels', text: t('{className} · poziom {level} · klasa {classLevel}', { className: character.className, level: character.level, classLevel: character.classLevel }) }),
          h('span', { class: `select-doing${character.activity?.finished ? ' select-doing--ready' : ''}`, text: doing(character.activity) }),
        ),
      ),
    );
  fill(
    container,
    h(
      'header',
      { class: 'hero hero--small' },
      h('h1', { class: 'hero-title', tabindex: '-1', text: t('Wybierz postać') }),
      h('p', { class: 'hero-tagline', text: t('Postacie na koncie: {count} z {max}', { count: characters.length, max }) }),
    ),
    systemPanel(t('Wybierz postać, którą chcesz grać. Pozostałe czekają, a ich wyprawy i prace trwają dalej.')),
    h('ul', { class: 'select-list' }, characters.map(card)),
    h(
      'div',
      { class: 'select-actions' },
      characters.length < max
        ? h('button', { type: 'button', class: 'button button--system', onClick: onCreate, text: t('Nowa postać') })
        : h('p', { class: 'muted', text: t('Na koncie jest już {count}. Nową stworzysz, gdy usuniesz jedną z nich.', { count: countOf(max, 'postać', 'postacie', 'postaci') }) }),
      h('button', { type: 'button', class: 'button button--world', onClick: (event) => withButton(event.currentTarget, onLogout), text: t('Wyloguj się') }),
    ),
  );
  $('.hero-title', container).focus();
}

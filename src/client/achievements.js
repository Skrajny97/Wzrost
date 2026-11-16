// Osiągnięcia (1030; the author: „Osiągnięcia z tytułami”, „wszystko super
// wymyślone”; the list and the window 1036.1–1036.2 accepted, the title
// only in the profile and the Ranking: 1036.3 B): long goals in groups, each
// with a title to wear and a small reward, given at the first look after it
// is done. Each shows a picture the game already has (a creature, an item,
// a profession, an icon), so no new icons. The window opens from the Postać
// tab, under the portrait.

import { itemSprite, monsterSprite, professionSprite, timePointsArt } from './art.js';
import { h, icon } from './dom.js';
import { formatNumber } from './format.js';
import { t } from './i18n.js';
import { SYSTEM_POINTS_ICON } from './icons.js';
import { call } from './state.js';
import { openSheet, toast, withButton } from './ui.js';

function art(one) {
  const [kind, id] = one.art;
  const sprite = kind === 'monster' ? monsterSprite(id) : kind === 'item' ? itemSprite({ base: id }) : kind === 'profession' ? professionSprite(id) : null;
  return sprite ?? icon(id ?? 'star', { size: 28 });
}

// An achievement in the window: its picture, name, goal, the bar of its
// count (done: ticked, its title to wear), its title and reward.
function card(one, view, wear) {
  const reward = one.reward ?? {};
  return h(
    'li',
    { class: `achievement${one.done ? ' achievement--done' : ''}` },
    h('span', { class: 'achievement-art' }, art(one)),
    h(
      'div',
      { class: 'achievement-body' },
      h('p', { class: 'achievement-name' }, h('strong', { text: one.name }), one.done && h('span', { class: 'achievement-check' }, icon('check', { size: 14 }))),
      h('p', { class: 'achievement-goal', text: one.goal }),
      !one.done && h('div', { class: 'bar achievement-bar' }, h('div', { class: 'bar-fill bar-fill--system', style: { width: `${Math.min(100, (one.count / Math.max(1, one.target)) * 100)}%` } })),
      !one.done && h('p', { class: 'achievement-count', text: `${formatNumber(one.count)} / ${formatNumber(one.target)}` }),
      h(
        'p',
        { class: 'achievement-reward' },
        t('Tytuł: „{title}”', { title: one.title }),
        reward.timePoints > 0 && [' · ', timePointsArt(14), ` ${formatNumber(reward.timePoints)}`],
        reward.systemPoints > 0 && [' · ', icon(SYSTEM_POINTS_ICON, { size: 14 }), ` ${formatNumber(reward.systemPoints)}`],
      ),
      one.done &&
        (view.wornId === one.id
          ? h('p', { class: 'achievement-worn', text: t('Nosisz ten tytuł') })
          : h('button', { type: 'button', class: 'button button--world button--small', text: t('Noś ten tytuł'), onClick: (event) => withButton(event.currentTarget, () => wear(one.id)) })),
    ),
  );
}

// The window of the achievements, drawn anew when a title is worn.
function openAchievements(view) {
  const wear = async (id) => {
    const data = await call('POST', '/api/achievements/title', { id });
    openAchievements(data.achievements);
  };
  const all = view.groups.flatMap((group) => group.list);
  const done = all.filter((one) => one.done).length;
  openSheet(
    h('h2', { class: 'sheet-title', text: t('Osiągnięcia') }),
    h('p', { class: 'sheet-text', text: t('Zdobyte: {done} z {all}. Każde daje tytuł, który możesz nosić w profilu i w Rankingu.', { done: formatNumber(done), all: formatNumber(all.length) }) }),
    h('p', { class: 'sheet-text muted', text: view.since }),
    h(
      'p',
      { class: 'achievement-title-now' },
      t('Twój tytuł: '),
      h('strong', { text: view.worn ?? t('bez tytułu') }),
      view.worn && [' ', h('button', { type: 'button', class: 'button button--world button--small', text: t('Zdejmij'), onClick: (event) => withButton(event.currentTarget, () => wear(null)) })],
    ),
    view.groups.map((group) => [h('h3', { class: 'achievement-group', text: group.name }), h('ol', { class: 'achievements' }, group.list.map((one) => card(one, view, wear)))]),
  );
}

// The window from the Postać tab: the achievements done since the last look
// given now, each named in a message with its reward.
export async function showAchievements() {
  const data = await call('GET', '/api/achievements');
  openAchievements(data.achievements);
  for (const one of data.fresh ?? []) {
    const reward = [one.reward.timePoints > 0 && t('{count} Punktów Czasu', { count: formatNumber(one.reward.timePoints) }), one.reward.systemPoints > 0 && t('{count} Punktów Systemu', { count: formatNumber(one.reward.systemPoints) })].filter(Boolean).join(', ');
    toast(t('Osiągnięcie „{name}”: tytuł „{title}” i {reward}.', { name: one.name, title: one.title, reward }));
  }
}

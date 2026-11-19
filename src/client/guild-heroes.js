// The Bohaterowie tygodnia (1198 A; the server's guild-heroes.js;
// DECISIONS.md, "Bohaterowie tygodnia"): the badges of last week's heroes
// by a member's name on the Gildia tab's list and on its card
// (heroBadges), and a card of the Gildia tab under the members: the heroes
// of the week before, each with its badge, name and count, and who leads
// this week so far, counted as the heroes will be on Monday, with the
// reward and the rules under "Jak to działa?". The words come with the
// answer (data/guilds.json, heroes), in the page's language.

import { heroArt } from './art.js';
import { fill, h, icon } from './dom.js';
import { t } from './i18n.js';
import { CLASS_ICONS } from './icons.js';
import { call } from './state.js';
import { howItWorks } from './ui.js';

// A hero's badges by a name, each its picture with its words as a tip
// ("Pogromczyni poprzedniego tygodnia"); `named` writes the hero's name
// beside the picture (the character's card).
export function heroBadges(heroes, { size = 18, named = false } = {}) {
  if (!heroes?.length) return null;
  return h(
    'span',
    { class: `hero-badges${named ? ' hero-badges--named' : ''}` },
    heroes.map((hero) =>
      h(
        'span',
        { class: `hero-badge hero-badge--${hero.kind}`, title: hero.tip, role: 'img', 'aria-label': hero.tip },
        heroArt(hero.kind, size),
        named && h('span', { class: 'hero-badge-name', text: hero.name }),
      ),
    ),
  );
}

// The card, filled once its answer comes; it stays the same element while
// the Gildia tab draws its cards anew.
export function guildHeroesCard() {
  const card = h('section', { class: 'card guild-heroes', 'aria-labelledby': 'guild-heroes-title' }, h('p', { class: 'muted', text: t('Wczytywanie…') }));

  const who = (character) =>
    character
      ? h('span', { class: 'guild-hero-who' }, icon(CLASS_ICONS[character.classId] ?? 'person', { size: 14, className: 'chat-class' }), h('span', { class: 'guild-hero-name', text: character.name }))
      : null;

  function render(answer) {
    const { texts } = answer;
    fill(
      card,
      h('h2', { class: 'card-title', id: 'guild-heroes-title' }, icon('trophy', { size: 22 }), texts.title),
      h('p', { class: 'muted', text: texts.lead }),
      h('h3', { class: 'guild-heroes-head', text: texts.last }),
      answer.last.length === 0
        ? h('p', { class: 'muted', text: texts.none })
        : h(
            'ul',
            { class: 'guild-heroes-list' },
            answer.last.map((hero) =>
              h(
                'li',
                { class: `guild-hero guild-hero--${hero.kind}` },
                h('span', { class: 'guild-hero-art' }, heroArt(hero.kind, 32)),
                h('span', { class: 'guild-hero-text' }, h('strong', { class: 'guild-hero-title', text: hero.name }), who(hero.character), h('span', { class: 'guild-hero-count', text: hero.valueText })),
              ),
            ),
          ),
      h('h3', { class: 'guild-heroes-head', text: texts.now }),
      h(
        'ul',
        { class: 'guild-heroes-now' },
        answer.leaders.map((leader) =>
          h(
            'li',
            { class: 'guild-hero-now' },
            heroArt(leader.kind, 20),
            h('span', { class: 'guild-hero-now-kind', text: leader.name }),
            leader.character
              ? h('span', { class: 'guild-hero-now-who' }, who(leader.character), h('span', { class: 'guild-hero-count', text: leader.valueText }))
              : h('span', { class: 'guild-hero-now-who muted', text: texts.nobody }),
          ),
        ),
      ),
      howItWorks(texts.reward, texts.how),
    );
  }

  call('GET', '/api/guild/heroes')
    .then(render)
    .catch((error) => fill(card, h('p', { class: 'muted', text: error.message ?? t('Nie udało się wczytać bohaterów tygodnia.') })));
  return card;
}

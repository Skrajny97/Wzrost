// The Stół rzemieślniczy on its building screen: the materials waiting, the
// queue of orders and the parts made. The table turns each material into one
// part of the same rarity and taken-apart items into several, for free, one
// order after another (src/engine/crafting.js). The server settles the queue;
// app.js fetches the character again when an order ends.

import { materialSprite } from './art.js';
import { h, icon } from './dom.js';
import { countOf, formatCountdown, formatMinutes, formatNumber, timeFormat } from './format.js';
import { playSound } from './sound.js';
import { call, state, testModeOn } from './state.js';
import { systemPanel, toast, withButton } from './ui.js';

// A material's picture, or the line icon of the family of creatures that
// leaves it until the picture is drawn; a part's picture or a hammer.
export function materialIcon(materialId, size = 24) {
  const family = state.content.materials?.find((material) => material.id === materialId)?.family;
  return materialSprite(materialId) ?? icon(family ?? 'hammer', { size });
}

async function craft(body) {
  const { ordered } = await call('POST', '/api/craft/materials', body);
  playSound('build');
  toast(ordered === 1 ? 'Materiał trafił na stół.' : `Na stole: ${countOf(ordered, 'zlecenie', 'zlecenia', 'zleceń')}.`);
}

function materialsCard(crafting, built, full) {
  const blocked = !built || full;
  return h(
    'section',
    { class: 'card craft-card', 'aria-labelledby': 'craft-materials' },
    h('h2', { class: 'card-title', id: 'craft-materials', text: 'Materiały' }),
    crafting.materials.length === 0
      ? h('p', { class: 'muted', text: 'Pokonane stwory zostawiają materiały, każdy swój. Na razie nie ma tu żadnych.' })
      : h(
          'ul',
          { class: 'craft-list' },
          crafting.materials.map((material) =>
            h(
              'li',
              { class: 'craft-row' },
              h('span', { class: 'craft-art' }, materialIcon(material.materialId)),
              h(
                'span',
                { class: 'craft-text' },
                h('span', { class: 'item-name', vars: { '--rarity': material.color }, text: `${material.name} ×${formatNumber(material.count)}` }),
                h('span', {
                  class: 'item-meta',
                  text: [material.rarityName, `daje: ${material.part} ×${formatNumber(material.count)}`, built && formatMinutes(material.minutes)]
                    .filter(Boolean)
                    .join(' · '),
                }),
              ),
              h('button', {
                type: 'button',
                class: 'button button--world button--small',
                disabled: blocked,
                text: 'Przerób',
                'aria-label': `Przerób: ${material.name} ×${material.count}`,
                onClick: (event) => withButton(event.currentTarget, () => craft({ keys: [material.key] })),
              }),
            ),
          ),
        ),
    crafting.materials.length > 1 &&
      h('button', {
        type: 'button',
        class: 'button button--system',
        disabled: blocked,
        text: 'Przerób wszystko',
        onClick: (event) => withButton(event.currentTarget, () => craft({ all: true })),
      }),
    !built && h('p', { class: 'system-hint', text: 'Zbuduj stół, żeby przerabiać materiały i rozbierać przedmioty. Budowa jest tania.' }),
    built && full && h('p', { class: 'system-hint', text: `Kolejka jest pełna (${crafting.limit} zleceń). Poczekaj, aż skończy się pierwsze.` }),
  );
}

// The orders, the first one at work with its countdown; `ticks` gets its update.
function queueCard(crafting, ticks) {
  const [first, ...waiting] = crafting.queue;
  const countdown = h('strong', { class: 'craft-countdown' });
  const progress = h('div', { class: 'bar-fill bar-fill--gold' });
  ticks.push((now) => {
    countdown.textContent = formatCountdown(first.endsAt - now);
    const done = (now - first.startsAt) / (first.endsAt - first.startsAt);
    progress.style.width = `${Math.min(100, Math.max(0, done * 100))}%`;
  });
  const row = (order, extra) =>
    h(
      'li',
      { class: 'craft-row' },
      h('span', { class: 'craft-art' }, order.materialId ? materialIcon(order.materialId) : icon('hammer', { size: 24 })),
      h(
        'span',
        { class: 'craft-text' },
        h('span', { class: 'item-name', vars: { '--rarity': order.color }, text: order.count > 1 ? `${order.name} ×${order.count}` : order.name }),
        h('span', { class: 'item-meta', text: `${order.kind === 'material' ? 'przeróbka' : 'rozbiórka'} · daje: ${order.part} ×${formatNumber(order.parts)}` }),
        extra,
      ),
    );
  return h(
    'section',
    { class: 'card craft-card', 'aria-labelledby': 'craft-queue' },
    h('h2', { class: 'card-title', id: 'craft-queue', text: `Kolejka (${crafting.queue.length} z ${crafting.limit})` }),
    h(
      'ol',
      { class: 'craft-list' },
      row(first, h('span', { class: 'craft-progress' }, h('div', { class: 'bar' }, progress), countdown)),
      waiting.map((order) => row(order, h('span', { class: 'item-meta', text: `Gotowe o ${timeFormat.format(new Date(order.endsAt))}` }))),
    ),
    testSkip(),
  );
}

// Test mode only: every order ends at once.
function testSkip() {
  if (!state.user.testMode || !testModeOn()) return null;
  return h(
    'div',
    { class: 'test-tools' },
    h('p', { class: 'test-tools-text', text: 'Tryb testowy: kolejka skończy się od razu.' }),
    h('button', {
      type: 'button',
      class: 'button button--test',
      text: 'Pomiń czas',
      onClick: (event) => withButton(event.currentTarget, () => call('POST', '/api/test/skip-craft')),
    }),
  );
}

function partsCard(crafting) {
  return h(
    'section',
    { class: 'card craft-card', 'aria-labelledby': 'craft-parts' },
    h('h2', { class: 'card-title', id: 'craft-parts', text: 'Części' }),
    h(
      'ul',
      { class: 'craft-list craft-list--parts' },
      crafting.parts.map((part) =>
        h(
          'li',
          { class: `craft-row${part.count === 0 ? ' craft-row--none' : ''}` },
          h('span', { class: 'craft-art' }, materialSprite(part.id) ?? icon('hammer', { size: 24 })),
          h(
            'span',
            { class: 'craft-text' },
            h('span', { class: 'item-name', vars: { '--rarity': part.color }, text: part.name }),
            h('span', { class: 'item-meta', text: part.description }),
          ),
          h('strong', { class: 'craft-count', text: formatNumber(part.count) }),
        ),
      ),
    ),
    h('p', { class: 'system-hint', text: 'Z części powstaną przedmioty w profesjach, które dojdą później.' }),
  );
}

export function craftTableSection(ticks) {
  const crafting = state.character.crafting;
  const built = crafting.pace > 0;
  const full = crafting.queue.length >= crafting.limit;
  return [
    built &&
      crafting.materials.length === 0 &&
      crafting.queue.length === 0 &&
      systemPanel('Stół czeka na materiały. Rozbierać przedmioty możesz też z plecaka: dotknij przedmiotu i wybierz „Rozbierz”.'),
    materialsCard(crafting, built, full),
    crafting.queue.length > 0 && queueCard(crafting, ticks),
    partsCard(crafting),
  ];
}

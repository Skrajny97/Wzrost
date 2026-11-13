// The przemiana of gems (913 A and B, the author 13.11.2026: „zrób droższą
// przemianę (chociaż 10 słabszych kamieni na lepszy)”): transmute.cost gems
// of one kind into one gem a rarity up, at once and without a work. Two
// places share it: the Szlifiernia's tab „Przemiana” (transmuteForm, every
// step in one list) and the part „Przemiana” under a gem's card in the
// Plecak (transmutePart, its own step). The server checks everything again
// (POST /api/professions/transmute).

import { mineralSprite } from './art.js';
import { h } from './dom.js';
import { countOf, formatNumber } from './format.js';
import { t } from './i18n.js';
import { playSound } from './sound.js';
import { call, state } from './state.js';
import { toast, withButton } from './ui.js';

// The Szlifiernia as the character's view has it (null before Jubilerstwo).
const jeweller = () => state.character?.professions?.jewelcrafting ?? null;
// How many pieces of a gem the character has.
const haveOf = (id) => (state.character?.minerals ?? []).find((mineral) => mineral.id === id)?.count ?? 0;

// The steps of przemiana, by the gems in rarity order: each known gem and the
// gem one rarity up, while that one is known too; the first hidden one ends
// the list as a shadow ({ from, to: null, hint }).
function transmuteSteps() {
  const gems = jeweller()?.gems ?? [];
  const steps = [];
  for (let index = 0; index + 1 < gems.length; index += 1) {
    const from = gems[index];
    const to = gems[index + 1];
    if (from.hidden) break;
    if (to.hidden) {
      steps.push({ from, to: null, hint: to.hint });
      break;
    }
    steps.push({ from, to });
  }
  return steps;
}

// A gem's picture and name in a line.
const named = (gem, { shadow = false } = {}) => {
  const art = mineralSprite(gem.id);
  if (shadow) art?.classList.add('transmute-shadow-art');
  return h('span', { class: 'transmute-gem' }, art, shadow ? '???' : gem.name);
};

// „10 × Kwarc → 1 × Agat”.
const pairLine = (cost, from, to) => h('span', { class: 'transmute-gems' }, `${formatNumber(cost)} × `, named(from), ' → 1 × ', named(to));

// The count of przemiany (−, +, „najwięcej”), what it uses and gives, and
// the start. `label` names the button; `onDone` follows a przemiana made.
function transmuteControls(step, { label, note = null, onDone = () => {} }) {
  const cost = jeweller().transmute.cost;
  const most = Math.floor(haveOf(step.from.id) / cost);
  if (most < 1) return h('p', { class: 'herb-room herb-room--full', text: t('Potrzeba co najmniej {count} × {gem}.', { count: formatNumber(cost), gem: step.from.name }) });
  let count = 1;
  const value = h('output', { class: 'herb-count-value' });
  const estimate = h('p', { class: 'herb-estimate' });
  const less = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': t('Mniej'), text: '−', onClick: () => set(count - 1) });
  const more = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': t('Więcej'), text: '+', onClick: () => set(count + 1) });
  const all = h('button', { type: 'button', class: 'link-button', text: t('najwięcej ({count})', { count: formatNumber(most) }), onClick: () => set(most) });
  function set(next) {
    count = Math.max(1, Math.min(most, next));
    value.textContent = `${formatNumber(count)} ×`;
    estimate.textContent = [t('Zużyjesz {used} × {from} i dostaniesz {count} × {to}.', { used: formatNumber(count * cost), from: step.from.name, count: formatNumber(count), to: step.to.name }), note].filter(Boolean).join(' ');
    less.disabled = count <= 1;
    more.disabled = count >= most;
  }
  set(count);
  const start = h('button', {
    type: 'button',
    class: 'button button--system',
    text: label,
    onClick: (event) =>
      withButton(event.currentTarget, async () => {
        const answer = await call('POST', '/api/professions/transmute', { gem: step.from.id, count });
        playSound('gem-set');
        toast(t('Przemiana gotowa: {count} × {gem} w plecaku.', { count: formatNumber(answer.transmuted.count), gem: step.to.name }));
        onDone();
      }),
  });
  return [h('div', { class: 'herb-count' }, less, value, more, all), estimate, start];
}

// The Szlifiernia's tab „Przemiana” (913.1): every step as a choice, with
// the gems in the bag and how many przemiany they make, the hidden next gem
// as a shadow with the level the System shows it at, and under the list the
// count and the start for the step chosen. `chosen` is kept by the caller.
export function transmuteForm({ chosen, onChoose }) {
  const cost = jeweller().transmute.cost;
  const steps = transmuteSteps();
  const open = steps.filter((step) => step.to);
  const head = h('h2', { class: 'section-title', id: 'transmute-title', text: t('Przemiana kamieni') });
  const card = (...children) => h('section', { class: 'card gather-card', 'aria-labelledby': 'transmute-title', 'data-guide': 'jewel-transmute' }, head, children);
  if (open.length === 0) return card(h('p', { class: 'muted', text: steps[0]?.hint ?? t('System jeszcze nie pokazał Ci kamienia, w który można przemienić.') }));
  const step = open.find((one) => one.from.id === chosen) ?? open.find((one) => haveOf(one.from.id) >= cost) ?? open[0];
  const rows = steps.map((one) => {
    if (!one.to) {
      return h(
        'div',
        { class: 'transmute-pair transmute-pair--shadow' },
        h('span', { class: 'transmute-radio', 'aria-hidden': 'true' }),
        h('span', { class: 'transmute-gems' }, named(one.from), ' → ', named({ id: nextHiddenId(one.from.id) }, { shadow: true })),
        h('p', { class: 'transmute-meta', text: one.hint }),
      );
    }
    const have = haveOf(one.from.id);
    const times = Math.floor(have / cost);
    return h(
      'button',
      {
        type: 'button',
        class: 'transmute-pair',
        'aria-pressed': one === step,
        onClick: () => onChoose(one.from.id),
      },
      h('span', { class: 'transmute-radio', 'aria-hidden': 'true' }),
      pairLine(cost, one.from, one.to),
      h('p', {
        class: 'transmute-meta',
        text:
          times > 0
            ? t('W plecaku: {have} · wystarczy na {times}', { have: formatNumber(have), times: countOf(times, 'przemianę', 'przemiany', 'przemian') })
            : t('W plecaku: {have} · potrzeba co najmniej {cost}', { have: formatNumber(have), cost: formatNumber(cost) }),
      }),
    );
  });
  return card(
    h('div', { class: 'transmute-pairs', role: 'group', 'aria-label': t('Przemiana kamieni') }, rows),
    h('p', { class: 'duration-title', text: t('Ile przemian') }),
    transmuteControls(step, { label: t('Przemień') }),
  );
}

// The id of the gem after `id` in the Szlifiernia's list, for its shadow.
function nextHiddenId(id) {
  const gems = jeweller()?.gems ?? [];
  const index = gems.findIndex((gem) => gem.id === id);
  return gems[index + 1]?.id ?? id;
}

// The part „Przemiana” under a gem's card in the Plecak (913.2): its own
// step, with the count and „Przemień w …”; a line about the level when the
// gem one rarity up is still hidden; nothing for an ore, for the rarest gem
// or before Jubilerstwo opens. `onDone` closes the card.
export function transmutePart(mineral, { onDone }) {
  if (mineral.kind !== 'gem' || !jeweller()) return null;
  const step = transmuteSteps().find((one) => one.from.id === mineral.id);
  if (!step) return null;
  const head = h('h3', { class: 'transmute-part-title', text: t('Przemiana') });
  if (!step.to) return h('div', { class: 'transmute-part' }, head, h('p', { class: 'muted', text: step.hint }));
  const cost = jeweller().transmute.cost;
  return h(
    'div',
    { class: 'transmute-part' },
    head,
    h('p', { class: 'transmute-line' }, pairLine(cost, step.from, step.to)),
    transmuteControls(step, { label: t('Przemień w {gem}', { gem: step.to.name }), note: t('Przemiana dzieje się od razu.'), onDone }),
  );
}

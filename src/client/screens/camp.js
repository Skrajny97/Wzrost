// The camp: buildings the player upgrades alongside the character's
// activity, paid with gold and the resources found on explorations. One
// building is upgraded at a time; the upgrade counts once its time has passed.
// Production buildings fill a store the player collects. Opened with the camp
// button in the top bar.

import { fill, h, icon } from '../dom.js';
import { formatCountdown, formatMinutes, formatNumber, timeFormat } from '../format.js';
import { RESOURCE_ICONS } from '../icons.js';
import { call, serverNow, state, storeAmount, storeFullAt, testModeOn, walletEntries } from '../state.js';
import { systemPanel, toast, withButton } from '../ui.js';

export function mountCamp(container, { backHash = '#/walka' }) {
  let countdown = null;
  let progress = null;
  let shownBuild = null;
  let stores = []; // production stores on the screen, counted up every second

  function render() {
    const character = state.character;
    const running = character.camp.construction;
    shownBuild = running && running.endsAt > serverNow() ? running.endsAt : null;
    countdown = null;
    progress = null;
    stores = [];
    fill(
      container,
      h(
        'div',
        { class: 'page-heading page-heading--back' },
        h(
          'div',
          { class: 'page-heading-text' },
          h('h1', { class: 'page-title', tabindex: '-1', text: 'Obóz' }),
          h('p', { class: 'page-subtitle', text: 'Polana na skraju puszczy' }),
        ),
        h('a', { class: 'button button--system back-button', href: backHash }, icon('back', { size: 20 }), 'Powrót'),
      ),
      testTools(),
      walletRow(),
      shownBuild && constructionPanel(running),
      h('div', { class: 'stack' }, character.camp.buildings.map((building) => buildingCard(building))),
    );
    tick(serverNow());
  }

  // Test mode only: the building being upgraded is ready at once, and with
  // nothing being built the stores fill at once.
  function testTools() {
    const producing = state.character.camp.buildings.some((building) => building.production);
    if (!state.content.testMode || !testModeOn() || (!shownBuild && !producing)) return null;
    return h(
      'div',
      { class: 'test-tools' },
      h('p', {
        class: 'test-tools-text',
        text: shownBuild ? 'Tryb testowy: budowa skończy się od razu.' : 'Tryb testowy: magazyny zapełnią się od razu.',
      }),
      h('button', {
        type: 'button',
        class: 'button button--test',
        text: 'Pomiń czas',
        onClick: (event) => withButton(event.currentTarget, () => call('POST', '/api/test/skip-build')),
      }),
    );
  }

  function walletRow() {
    return h(
      'ul',
      { class: 'camp-wallet', 'aria-label': 'Złoto i zasoby' },
      walletEntries().map((entry) =>
        h(
          'li',
          { class: `camp-wallet-item${entry.system ? ' camp-wallet-item--system' : ''}` },
          icon(RESOURCE_ICONS[entry.id] ?? 'unknown', { size: 18 }),
          h('span', { class: 'camp-wallet-name', text: entry.name }),
          h('strong', { text: formatNumber(entry.amount) }),
        ),
      ),
    );
  }

  function constructionPanel(running) {
    countdown = h('p', { class: 'countdown', 'aria-live': 'off' });
    progress = h('div', { class: 'bar-fill bar-fill--system' });
    return systemPanel(
      `Budowa: ${running.name}, poziom ${running.level}.`,
      countdown,
      h('div', { class: 'bar bar--system' }, progress),
      h('p', { class: 'system-hint', text: `Gotowe o ${timeFormat.format(new Date(running.endsAt))}.` }),
    );
  }

  function buildingCard(building) {
    const character = state.character;
    const next = building.next;
    const have = Object.fromEntries(walletEntries().map((entry) => [entry.id, entry.amount]));
    const names = Object.fromEntries(walletEntries().map((entry) => [entry.id, entry.name]));
    const missing = next ? Object.entries(next.cost).some(([id, amount]) => (have[id] ?? 0) < amount) : false;
    const busy = Boolean(shownBuild);
    const label = !next
      ? null
      : busy
        ? character.camp.construction.buildingId === building.id
          ? 'Trwa budowa'
          : `Trwa budowa: ${character.camp.construction.name}`
        : missing
          ? 'Brakuje złota albo zasobów'
          : building.level === 0
            ? 'Zbuduj'
            : `Ulepsz do poziomu ${next.level}`;
    return h(
      'article',
      { class: 'card building-card', 'aria-labelledby': `building-${building.id}` },
      h(
        'header',
        { class: 'region-head' },
        h('h2', { class: 'card-title', id: `building-${building.id}`, text: building.name }),
        h('span', {
          class: `chip${building.level === 0 ? ' chip--dashed' : ''}`,
          text: building.level === 0 ? 'niezbudowane' : `poz. ${building.level}/${building.maxLevel}`,
        }),
      ),
      h('p', { class: 'region-description', text: building.description }),
      building.effect && h('p', { class: 'building-effect' }, h('strong', { text: 'Teraz: ' }), building.effect),
      building.production && storeView(building),
      next
        ? [
            h('p', { class: 'building-next' }, h('strong', { text: `Poziom ${next.level}: ` }), next.effect),
            h(
              'ul',
              { class: 'cost-list', 'aria-label': 'Koszt' },
              Object.entries(next.cost).map(([id, amount]) =>
                h(
                  'li',
                  { class: `cost${(have[id] ?? 0) < amount ? ' cost--missing' : ''}` },
                  icon(RESOURCE_ICONS[id] ?? 'unknown', { size: 16 }),
                  h('span', { text: names[id] ?? id }),
                  h('strong', { text: `${formatNumber(have[id] ?? 0)} / ${formatNumber(amount)}` }),
                ),
              ),
            ),
            h('p', { class: 'building-time' }, icon('hourglass', { size: 16 }), `Czas budowy: ${formatMinutes(next.minutes)}`),
            h('button', {
              type: 'button',
              class: 'button button--system',
              disabled: busy || missing,
              text: label,
              onClick: (event) => withButton(event.currentTarget, () => call('POST', '/api/camp/build', { buildingId: building.id })),
            }),
          ]
        : h('p', { class: 'muted', text: 'Najwyższy poziom.' }),
    );
  }

  // The store of a production building: how full it is, when it fills up,
  // and "Zbierz".
  function storeView(building) {
    const store = building.production;
    const names = Object.fromEntries(walletEntries().map((entry) => [entry.id, entry.name]));
    const amount = h('strong', {});
    const fillBar = h('div', { class: 'bar-fill bar-fill--gold' });
    const hint = h('p', { class: 'store-hint' });
    let collecting = false; // the tick must not enable the button mid-request
    const button = h('button', {
      type: 'button',
      class: 'button button--world',
      text: 'Zbierz',
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          collecting = true;
          try {
            const { collected } = await call('POST', '/api/camp/collect', { buildingId: building.id });
            toast(`Zebrano: ${names[collected.resource].toLowerCase()} +${formatNumber(collected.amount)}.`);
          } finally {
            collecting = false;
          }
        }),
    });
    const show = (now) => {
      const held = storeAmount(store, now);
      amount.textContent = `${formatNumber(held)} / ${formatNumber(store.capacity)}`;
      fillBar.style.width = `${(held / store.capacity) * 100}%`;
      hint.textContent = store.paused
        ? 'Rozbudowa: produkcja ruszy po jej końcu.'
        : held >= store.capacity
          ? 'Magazyn pełny: produkcja stoi do zebrania.'
          : `Pełny za ${formatCountdown(storeFullAt(store) - now)}.`;
      button.disabled = collecting || held < 1;
    };
    stores.push(show);
    show(serverNow());
    return h(
      'div',
      { class: 'store' },
      h(
        'p',
        { class: 'store-head' },
        icon(RESOURCE_ICONS[store.resource] ?? 'unknown', { size: 18 }),
        h('span', { text: `Magazyn: ${names[store.resource] ?? store.resource}` }),
        amount,
      ),
      h('div', { class: 'bar' }, fillBar),
      hint,
      button,
    );
  }

  function tick(now) {
    for (const show of stores) show(now);
    const running = state.character.camp.construction;
    const endsAt = running && running.endsAt > now ? running.endsAt : null;
    // The upgrade ended: the page asks for the character again (app.js).
    if (endsAt !== shownBuild) {
      render();
      return;
    }
    if (countdown && running) {
      countdown.textContent = formatCountdown(running.endsAt - now);
      const done = (now - running.startedAt) / (running.endsAt - running.startedAt);
      progress.style.width = `${Math.min(100, Math.max(0, done * 100))}%`;
    }
  }

  render();
  return { update: render, tick };
}
